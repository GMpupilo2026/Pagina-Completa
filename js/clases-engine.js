/**
 * Motor de análisis de la página Clases, solo para el profesor.
 *
 * Envuelve el mismo Stockfish que ya usa tablero.html
 * (js/vendor/stockfish/stockfish-nnue-16-single.js), pero con soporte de
 * MultiPV (varias líneas candidatas a la vez) — algo que OscarBot
 * (js/chess-bot.js) no expone, porque su motor interno solo devuelve la
 * mejor jugada para jugar contra el visitante, no una lista de variantes.
 * Por eso este es un wrapper propio y no una extensión de chess-bot.js.
 *
 * API: ClasesEngine.analyze(fen, multiPv, movetimeMs) -> Promise<Line[]>
 *   Line = { multipv, type: "cp"|"mate", value: number, pvUci: string[] }
 *   Ordenadas por multipv (1 = mejor línea).
 */
(function () {
  "use strict";

  const STOCKFISH_URL = "js/vendor/stockfish/stockfish-nnue-16-single.js";

  let engine = null;
  let engineInitPromise = null;
  let currentMultiPv = 1;
  let lines = {};
  let pendingResolve = null;

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

  function onEngineMessage(e) {
    const line = typeof e.data === "string" ? e.data : "";
    if (line.indexOf("info") === 0 && line.indexOf(" pv ") !== -1) {
      const multipvMatch = line.match(/multipv (\d+)/);
      const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
      const pvMatch = line.match(/ pv (.+)$/);
      if (scoreMatch && pvMatch) {
        const multipv = multipvMatch ? parseInt(multipvMatch[1], 10) : 1;
        lines[multipv] = {
          multipv,
          type: scoreMatch[1],
          value: parseInt(scoreMatch[2], 10),
          pvUci: pvMatch[1].trim().split(/\s+/),
        };
      }
    }
    if (line.indexOf("bestmove") === 0 && pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve(
        Object.keys(lines)
          .map((k) => parseInt(k, 10))
          .sort((a, b) => a - b)
          .map((k) => lines[k])
      );
    }
  }

  // Cola simple: todo acceso al motor pasa por aquí, uno a la vez (igual que chess-bot.js).
  let engineBusy = Promise.resolve();
  function runEngineTask(task) {
    const run = engineBusy.then(task, task);
    engineBusy = run.catch(() => []);
    return run;
  }

  function analyze(fen, multiPv, movetimeMs) {
    return runEngineTask(async () => {
      const ok = await ensureEngine();
      if (!ok || !engine) return [];
      if (multiPv !== currentMultiPv) {
        engine.postMessage("setoption name MultiPV value " + multiPv);
        currentMultiPv = multiPv;
      }
      lines = {};
      return new Promise((resolve) => {
        pendingResolve = resolve;
        engine.postMessage("position fen " + fen);
        engine.postMessage("go movetime " + movetimeMs);
        setTimeout(() => {
          if (pendingResolve === resolve) {
            pendingResolve = null;
            resolve(
              Object.keys(lines)
                .map((k) => parseInt(k, 10))
                .sort((a, b) => a - b)
                .map((k) => lines[k])
            );
          }
        }, movetimeMs + 4000);
      });
    });
  }

  // Convierte una línea de jugadas UCI (ej. "e2e4 e7e5 g1f3") a SAN, reproduciéndolas
  // sobre una copia de la posición analizada. Se corta si alguna jugada resulta ilegal
  // (no debería pasar, pero evita reventar la UI con datos inesperados del motor).
  function pvToSan(fen, pvUci, maxPlies) {
    const game = new Chess(fen);
    const sans = [];
    const limit = maxPlies || pvUci.length;
    for (let i = 0; i < Math.min(pvUci.length, limit); i++) {
      const uci = pvUci[i];
      const move = game.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
      });
      if (!move) break;
      sans.push(move.san);
    }
    return sans;
  }

  window.ClasesEngine = { analyze, pvToSan };
})();
