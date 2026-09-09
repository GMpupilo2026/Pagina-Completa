/**
 * chess-bot.js — El "cerebro" del bot de Oscar.
 *
 * Estrategia:
 *  1. Libro de posiciones de Oscar (oscar-book.js, generado de ~30,890 partidas propias):
 *     si la posición actual coincide con una que Oscar ya vivió, juega (con azar ponderado
 *     por frecuencia y resultado) una de las jugadas que él realmente hizo ahí.
 *  2. Fuera del libro, un motor Stockfish 16 (NNUE, WASM, alojado en este mismo sitio)
 *     calibrado a la fuerza de Oscar (ELO real, tomado de sus partidas) según la dificultad
 *     elegida.
 *  3. Si por algún motivo el motor no carga (navegador muy antiguo, WASM deshabilitado, etc.),
 *     un mini heurístico de respaldo para que el bot nunca se quede "mudo".
 *
 * IMPORTANTE: el motor se aloja en este mismo dominio (js/vendor/stockfish/), NO en un CDN
 * externo. Los navegadores no permiten crear un Web Worker a partir de un script de otro
 * origen (https://cdnjs.cloudflare.com/... lanzaba SecurityError al hacer `new Worker(url)`),
 * así que con un motor externo el "motor" nunca llegaba a cargar y el bot jugaba SIEMPRE con
 * el heurístico de respaldo (muy débil) fuera del libro, sin importar la dificultad elegida.
 * Alojar los archivos del motor en el propio sitio corrige esto de raíz.
 *
 * Además del movimiento, este archivo expone dos utilidades pedagógicas que usa
 * tablero-board.js:
 *  - evaluatePosition(fen): evalúa una posición con el motor a máxima fuerza (para la barra
 *    de evaluación en vivo y el análisis posterior de la partida).
 *  - getMoveOrigin(hash, uci): si una jugada del bot salió del libro, busca de qué partida
 *    real de Oscar vino (oscar-book-provenance.json, cargado en segundo plano bajo demanda).
 * Todo el acceso al motor (elegir jugada o evaluar) pasa por una única cola (runEngineTask)
 * para que nunca haya dos "go" simultáneos compitiendo por la misma respuesta del Worker.
 *
 * Requiere que chess.js y oscar-book.js ya estén cargados antes que este archivo.
 */
const OscarBot = (function () {
  "use strict";

  // Rutas relativas: funcionan tanto desde tablero.html como desde index.html (ambos en la raíz).
  const STOCKFISH_URL = "js/vendor/stockfish/stockfish-nnue-16-single.js";
  const PROVENANCE_URL = "data/oscar-book-provenance.json";

  // ELO real de Oscar tomado de sus partidas (bullet, que es la mayoría de su historial).
  // window.OSCAR_ELO_CALIB llega desde oscar-book.js; si no está disponible, usamos un valor por defecto razonable.
  const REAL_ELO = (window.OSCAR_ELO_CALIB && window.OSCAR_ELO_CALIB.bullet && window.OSCAR_ELO_CALIB.bullet.recent_median_elo) || 2400;

  // bookBias: exponente aplicado al peso de cada jugada del libro antes de sortear
  // (peso = frecuencia·resultado). >1 hace que las jugadas que Oscar más repitió en esa
  // posición dominen mucho más la elección; 1 sería proporcional a la frecuencia sin más.
  const DIFFICULTY = {
    easy: { elo: 1320, movetime: 350, bookMaxPly: 10, blunderChance: 0.18, bookBias: 1.15 },
    medium: { elo: 1700, movetime: 700, bookMaxPly: 24, blunderChance: 0.05, bookBias: 1.7 },
    hard: { elo: Math.max(1320, Math.min(3000, REAL_ELO)), movetime: 1200, bookMaxPly: Infinity, blunderChance: 0, bookBias: 2.2 },
  };

  // Movetime usado para evaluar una posición (barra de evaluación en vivo / "Analizar partida").
  // No es la jugada del bot: siempre a máxima fuerza (sin límite de ELO) para que la evaluación
  // sea honesta e independiente de la dificultad elegida por el visitante.
  const EVAL_MOVETIME = 450;

  let engine = null;
  let engineInitPromise = null;

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

  function positionHash(fen) {
    return fnv1a64Hex(positionKey(fen));
  }

  function uciToParts(uci) {
    return {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
    };
  }

  // ---------- Libro de Oscar ----------
  // biasPower > 1 exagera la ventaja de las jugadas más frecuentes en esa posición
  // (peso_final = peso_guardado ^ biasPower), así el bot se parece más a "lo que Oscar
  // realmente suele jugar ahí" en vez de tratar todas las alternativas casi por igual.
  function getBookMoveForHash(hash, biasPower) {
    const book = window.OSCAR_BOOK;
    if (!book) return null;
    const entry = book[hash];
    if (!entry || entry.length === 0) return null;
    const power = typeof biasPower === "number" && biasPower > 0 ? biasPower : 1.7;
    let total = 0;
    const items = [];
    for (let i = 0; i < entry.length; i += 2) {
      const w = Math.pow(entry[i + 1], power);
      items.push({ uci: entry[i], w });
      total += w;
    }
    let r = Math.random() * total;
    for (const it of items) {
      if (r < it.w) return it.uci;
      r -= it.w;
    }
    return items[items.length - 1].uci;
  }

  // ---------- Origen real de una jugada del libro (partida de Oscar de la que salió) ----------
  let provenanceData = null;
  let provenancePromise = null;

  function preloadProvenance() {
    if (provenancePromise) return provenancePromise;
    provenancePromise = fetch(PROVENANCE_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        provenanceData = data;
        return data;
      })
      .catch(() => null);
    return provenancePromise;
  }

  const RESULT_LABEL_ES = { W: "Oscar ganó", L: "Oscar perdió", D: "Tablas", "?": "resultado no registrado" };
  const BUCKET_LABEL_ES = {
    bullet: "bullet",
    blitz: "blitz",
    rapid: "rápida",
    hyperbullet: "hiperbullet",
    other: "otra modalidad",
  };

  // Sincrónica: sólo puede responder si preloadProvenance() ya terminó de cargar los datos.
  // Si aún no cargaron (o la jugada no vino del libro), devuelve null sin lanzar error.
  function getMoveOrigin(hash, uci) {
    if (!provenanceData || !hash || !uci) return null;
    const flatMoves = window.OSCAR_BOOK && window.OSCAR_BOOK[hash];
    const provArr = provenanceData.moves && provenanceData.moves[hash];
    if (!flatMoves || !provArr) return null;
    for (let i = 0; i < flatMoves.length; i += 2) {
      if (flatMoves[i] === uci) {
        const gidx = provArr[i / 2];
        if (gidx === undefined || gidx === null || gidx < 0) return null;
        const g = provenanceData.games && provenanceData.games[gidx];
        if (!g) return null;
        return {
          oscarColor: g[0],
          opponent: g[1],
          resultCode: g[2],
          resultLabel: RESULT_LABEL_ES[g[2]] || RESULT_LABEL_ES["?"],
          date: g[3],
          oscarElo: g[4],
          opponentElo: g[5],
          bucket: g[6],
          bucketLabel: BUCKET_LABEL_ES[g[6]] || g[6],
        };
      }
    }
    return null;
  }

  // ---------- Motor Stockfish (Web Worker, alojado en este mismo sitio) ----------
  function ensureEngine() {
    if (engineInitPromise) return engineInitPromise;
    engineInitPromise = new Promise((resolve) => {
      let w;
      try {
        w = new Worker(STOCKFISH_URL);
      } catch (e) {
        resolve(false);
        return;
      }
      let settled = false;
      // El WASM del motor pesa ~575KB; en una conexión lenta puede tardar un poco la primera vez.
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          w.terminate();
        } catch (e) {}
        resolve(false);
      }, 10000);

      w.onerror = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try {
          w.terminate();
        } catch (e) {}
        resolve(false);
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
    });
    return engineInitPromise;
  }

  // pendingResolve/lastScoreSeen sólo se tocan dentro de una tarea encolada (runEngineTask),
  // así que nunca hay dos búsquedas del motor en vuelo a la vez pisándose los resultados.
  let pendingResolve = null;
  let lastScoreSeen = null;

  function onEngineMessage(e) {
    const line = typeof e.data === "string" ? e.data : "";
    if (line.indexOf("info") === 0 && line.indexOf("score") !== -1) {
      const m = line.match(/score (cp|mate) (-?\d+)/);
      if (m) lastScoreSeen = { type: m[1], value: parseInt(m[2], 10) };
    }
    if (line.indexOf("bestmove") !== -1) {
      const m = line.match(/bestmove\s+(\S+)/);
      if (pendingResolve) {
        const resolveFn = pendingResolve;
        pendingResolve = null;
        resolveFn({ uci: m && m[1] && m[1] !== "(none)" ? m[1] : null, score: lastScoreSeen });
      }
    }
  }

  // Cola simple: todo acceso al motor (jugar o evaluar) pasa por aquí, uno a la vez.
  let engineBusy = Promise.resolve();
  function runEngineTask(task) {
    const run = engineBusy.then(task, task);
    engineBusy = run.catch(() => {});
    return run;
  }

  function engineSearch(fen, movetimeMs, limitStrength, elo) {
    return runEngineTask(async () => {
      const ok = await ensureEngine();
      if (!ok || !engine) return { uci: null, score: null };
      return new Promise((resolve) => {
        lastScoreSeen = null;
        pendingResolve = resolve;
        if (limitStrength) {
          engine.postMessage("setoption name UCI_LimitStrength value true");
          engine.postMessage("setoption name UCI_Elo value " + Math.round(elo));
        } else {
          engine.postMessage("setoption name UCI_LimitStrength value false");
        }
        engine.postMessage("position fen " + fen);
        engine.postMessage("go movetime " + movetimeMs);
        setTimeout(() => {
          if (pendingResolve === resolve) {
            pendingResolve = null;
            resolve({ uci: null, score: null });
          }
        }, movetimeMs + 4000);
      });
    });
  }

  async function getEngineMove(fen, diff) {
    const result = await engineSearch(fen, diff.movetime, true, diff.elo);
    return result.uci;
  }

  /**
   * Evalúa una posición a máxima fuerza (sin límite de ELO). Devuelve { type: "cp"|"mate", value }
   * desde el punto de vista de quien tiene el turno en ese FEN, o null si el motor no está disponible.
   */
  async function evaluatePosition(fen, movetimeMs) {
    const result = await engineSearch(fen, movetimeMs || EVAL_MOVETIME, false, 0);
    return result.score;
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
   * Si la jugada salió del libro, además trae _bookHash/_bookUci (para poder consultar luego
   * getMoveOrigin y mostrar de qué partida real de Oscar vino).
   * @param {Chess} game instancia de chess.js
   * @param {"easy"|"medium"|"hard"} difficultyKey
   */
  async function getMove(game, difficultyKey) {
    const diff = DIFFICULTY[difficultyKey] || DIFFICULTY.medium;
    const plyCount = game.history().length;

    if (plyCount < diff.bookMaxPly) {
      const fen = game.fen();
      const hash = positionHash(fen);
      const uci = getBookMoveForHash(hash, diff.bookBias);
      if (uci) {
        const found = findLegalMatch(game, uciToParts(uci));
        if (found) {
          found._bookHash = hash;
          found._bookUci = uci;
          return found;
        }
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
    evaluatePosition,
    getMoveOrigin,
    preloadProvenance,
    positionHash,
    difficultyLabels: {
      easy: "Fácil",
      medium: "Medio",
      hard: "Difícil",
    },
  };
})();
