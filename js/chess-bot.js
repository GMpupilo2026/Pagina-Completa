/**
 * chess-bot.js — El "cerebro" del bot de Oscar.
 *
 * Estrategia:
 *  1. Libro de posiciones de Oscar (oscar-book.js, generado de ~30,890 partidas propias):
 *     si la posición actual coincide con una que Oscar ya vivió, juega (con azar ponderado
 *     por frecuencia y resultado) una de las jugadas que él realmente hizo ahí.
 *  2. Fuera del libro, un motor Stockfish (WASM, cargado desde cdnjs) calibrado a la fuerza
 *     de Oscar (ELO real, tomado de sus partidas) según la dificultad elegida.
 *  3. Si por algún motivo el motor no carga (red bloqueada, CSP, etc.), un mini heurístico de
 *     respaldo para que el bot nunca se quede "mudo".
 *
 * Requiere que chess.js y oscar-book.js ya estén cargados antes que este archivo.
 */
const OscarBot = (function () {
  "use strict";

  const STOCKFISH_WASM_URL = "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.wasm.js";
  const STOCKFISH_ASMJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js";

  // ELO real de Oscar tomado de sus partidas (bullet, que es la mayoría de su historial).
  // window.OSCAR_ELO_CALIB llega desde oscar-book.js; si no está disponible, usamos un valor por defecto razonable.
  const REAL_ELO = (window.OSCAR_ELO_CALIB && window.OSCAR_ELO_CALIB.bullet && window.OSCAR_ELO_CALIB.bullet.recent_median_elo) || 2400;

  const DIFFICULTY = {
    easy: { elo: 1320, movetime: 250, bookMaxPly: 10, blunderChance: 0.18 },
    medium: { elo: 1700, movetime: 500, bookMaxPly: 24, blunderChance: 0.05 },
    hard: { elo: Math.max(1320, Math.min(3000, REAL_ELO)), movetime: 900, bookMaxPly: Infinity, blunderChance: 0 },
  };

  let engine = null;
  let engineInitPromise = null;
  let pendingResolve = null;

  // ---------- FNV-1a 64-bit hash (debe coincidir EXACTO con el script Python que generó el libro) ----------
  function fnv1a64Hex(str) {
    let h = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    const mask = (1n << 64n) - 1n;
    for (let i = 0; i < str.length; i++) {
      h ^= BigInt(str.charCodeAt(i) & 0xff);
      h = (h * prime) & mask;
    }
    let hex = h.toString(16);
    while (hex.length < 16) hex = "0" + hex;
    return hex;
  }

  function positionKey(fen) {
    // Igual que en la generación del libro: colocación de piezas + turno + enroques + al paso
    // (se ignoran los contadores de jugadas, que no afectan la posición en sí).
    const parts = fen.split(" ");
    return parts.slice(0, 4).join(" ");
  }

  function uciToParts(uci) {
    return {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
    };
  }

  // ---------- Libro de Oscar ----------
  function getBookMove(fen) {
    const book = window.OSCAR_BOOK;
    if (!book) return null;
    const hash = fnv1a64Hex(positionKey(fen));
    const entry = book[hash];
    if (!entry || entry.length === 0) return null;
    let total = 0;
    const items = [];
    for (let i = 0; i < entry.length; i += 2) {
      items.push({ uci: entry[i], w: entry[i + 1] });
      total += entry[i + 1];
    }
    let r = Math.random() * total;
    for (const it of items) {
      if (r < it.w) return it.uci;
      r -= it.w;
    }
    return items[items.length - 1].uci;
  }

  // ---------- Motor Stockfish (Web Worker, con respaldo asm.js) ----------
  function ensureEngine() {
    if (engineInitPromise) return engineInitPromise;
    engineInitPromise = new Promise((resolve) => {
      function tryLoad(url, isFallback) {
        let w;
        try {
          w = new Worker(url);
        } catch (e) {
          if (!isFallback) return tryLoad(STOCKFISH_ASMJS_URL, true);
          resolve(false);
          return;
        }
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          try {
            w.terminate();
          } catch (e) {}
          if (!isFallback) tryLoad(STOCKFISH_ASMJS_URL, true);
          else resolve(false);
        }, 6000);

        w.onerror = function () {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          try {
            w.terminate();
          } catch (e) {}
          if (!isFallback) tryLoad(STOCKFISH_ASMJS_URL, true);
          else resolve(false);
        };

        w.onmessage = function (e) {
          const line = typeof e.data === "string" ? e.data : "";
          if (!settled && line.indexOf("uciok") !== -1) {
            settled = true;
            clearTimeout(timeout);
            engine = w;
            engine.onmessage = onEngineMessage;
            resolve(true);
          }
        };

        w.postMessage("uci");
      }
      tryLoad(STOCKFISH_WASM_URL, false);
    });
    return engineInitPromise;
  }

  function onEngineMessage(e) {
    const line = typeof e.data === "string" ? e.data : "";
    if (line.indexOf("bestmove") !== -1) {
      const m = line.match(/bestmove\s+(\S+)/);
      if (pendingResolve) {
        const resolveFn = pendingResolve;
        pendingResolve = null;
        resolveFn(m && m[1] && m[1] !== "(none)" ? m[1] : null);
      }
    }
  }

  async function getEngineMove(fen, diff) {
    const ok = await ensureEngine();
    if (!ok || !engine) return null;
    return new Promise((resolve) => {
      pendingResolve = resolve;
      engine.postMessage("setoption name UCI_LimitStrength value true");
      engine.postMessage("setoption name UCI_Elo value " + Math.round(diff.elo));
      engine.postMessage("position fen " + fen);
      engine.postMessage("go movetime " + diff.movetime);
      setTimeout(() => {
        if (pendingResolve === resolve) {
          pendingResolve = null;
          resolve(null);
        }
      }, diff.movetime + 4000);
    });
  }

  // ---------- Respaldo sin motor (heurístico simple) ----------
  const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 };

  function heuristicMove(game) {
    const moves = game.moves({ verbose: true });
    if (!moves.length) return null;
    let best = null;
    let bestScore = -Infinity;
    for (const m of moves) {
      let score = Math.random();
      if (m.captured) score += (PIECE_VALUE[m.captured] || 0) * 2;
      if (m.san.indexOf("+") !== -1) score += 0.75;
      if (m.san.indexOf("#") !== -1) score += 1000;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }

  function randomMove(game) {
    const moves = game.moves({ verbose: true });
    if (!moves.length) return null;
    return moves[Math.floor(Math.random() * moves.length)];
  }

  function findLegalMatch(game, uciParts) {
    const legal = game.moves({ square: uciParts.from, verbose: true });
    return legal.find(
      (lm) => lm.to === uciParts.to && (!uciParts.promotion || lm.promotion === uciParts.promotion)
    );
  }

  /**
   * Devuelve un objeto de jugada compatible con chess.js (el mismo formato que .moves({verbose:true})).
   * @param {Chess} game instancia de chess.js
   * @param {"easy"|"medium"|"hard"} difficultyKey
   */
  async function getMove(game, difficultyKey) {
    const diff = DIFFICULTY[difficultyKey] || DIFFICULTY.medium;
    const plyCount = game.history().length;

    if (plyCount < diff.bookMaxPly) {
      const uci = getBookMove(game.fen());
      if (uci) {
        const found = findLegalMatch(game, uciToParts(uci));
        if (found) return found;
      }
    }

    if (Math.random() < diff.blunderChance) {
      const rm = randomMove(game);
      if (rm) return rm;
    }

    const uci = await getEngineMove(game.fen(), diff);
    if (uci) {
      const found = findLegalMatch(game, uciToParts(uci));
      if (found) return found;
    }

    return heuristicMove(game);
  }

  // Precalienta el motor en segundo plano para que la primera jugada no tarde.
  function preload() {
    try {
      setTimeout(() => {
        ensureEngine();
      }, 400);
    } catch (e) {}
  }

  return {
    getMove,
    preload,
    difficultyLabels: {
      easy: "Fácil (~1300 elo)",
      medium: "Medio (~1700 elo)",
      hard: "Difícil (~" + Math.round(DIFFICULTY.hard.elo) + " elo, el nivel real de Oscar)",
    },
  };
})();
