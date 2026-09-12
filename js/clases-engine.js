/**
 * Motor de análisis de la página Clases, solo para el profesor.
 *
 * Comparte el mismo Worker de Stockfish que practice-engine.js (ver
 * js/shared-engine.js) — así el panel de análisis y la práctica/preguntas de
 * los alumnos nunca compiten por CPU con dos instancias de Stockfish a la
 * vez, algo que en equipos modestos hacía que una de las dos consultas se
 * quedara sin responder a tiempo.
 *
 * Este módulo agrega soporte de MultiPV (varias líneas candidatas a la vez)
 * — algo que OscarBot (js/chess-bot.js) no expone, porque su motor interno
 * solo devuelve la mejor jugada para jugar contra el visitante, no una lista
 * de variantes.
 *
 * API: ClasesEngine.analyze(fen, multiPv, movetimeMs) -> Promise<Line[]>
 *   Line = { multipv, type: "cp"|"mate", value: number, pvUci: string[] }
 *   Ordenadas por multipv (1 = mejor línea).
 */
(function () {
  "use strict";

  let currentMultiPv = 1;
  let lines = {};
  let pendingResolve = null;
  // Motivo del último fallo al cargar el motor, para poder mostrarle algo útil al
  // profesor en vez de un "no disponible" sin explicación (ver ClasesEngine.lastError).
  let lastError = null;

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

  function analyze(fen, multiPv, movetimeMs) {
    return SharedEngine.runTask(async () => {
      lastError = null;
      const engine = await SharedEngine.ensureEngine();
      if (!engine) {
        lastError = "El motor no pudo cargar (revisa tu conexión e inténtalo de nuevo).";
        return [];
      }
      SharedEngine.setMessageHandler(onEngineMessage);
      if (multiPv !== currentMultiPv) {
        engine.postMessage("setoption name MultiPV value " + multiPv);
        currentMultiPv = multiPv;
      }
      // practice-engine.js puede haber dejado activado el límite de fuerza (ELO)
      // de una consulta anterior de práctica — el panel de análisis siempre debe
      // ser a máxima fuerza, así que se apaga aquí antes de cada búsqueda.
      engine.postMessage("setoption name UCI_LimitStrength value false");
      lines = {};
      return new Promise((resolve) => {
        pendingResolve = resolve;
        engine.postMessage("position fen " + fen);
        engine.postMessage("go movetime " + movetimeMs);
        setTimeout(() => {
          if (pendingResolve === resolve) {
            pendingResolve = null;
            if (!lastError) lastError = "El motor tardó demasiado en responder (revisa tu conexión e inténtalo de nuevo).";
            // Tardar tantísimo más de lo normal es señal de que el motor se
            // colgó o se cayó (ver la nota en js/shared-engine.js) — se descarta
            // para que la próxima consulta, de este módulo o de practice-engine.js,
            // levante un Worker nuevo en vez de seguir esperando uno muerto.
            SharedEngine.discardEngine();
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

  window.ClasesEngine = { analyze, pvToSan, getLastError: () => lastError };
})();
