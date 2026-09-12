/**
 * Motor de la "Práctica contra el motor" y de "¿Qué jugarías?" en Clases
 * (sesion.html).
 *
 * A diferencia de OscarBot (js/chess-bot.js), este motor no tiene libro de
 * partidas ni azar de "blunder": es Stockfish puro, calibrado por ELO con
 * UCI_LimitStrength/UCI_Elo (la misma técnica que ya usa chess-bot.js), para
 * que jugar contra "1500" o "1800" tenga el nivel que dice tener. El nivel
 * "max" no limita la fuerza del motor en absoluto.
 *
 * Comparte el mismo Worker de Stockfish que clases-engine.js (ver
 * js/shared-engine.js) — así una práctica de alumno o una pregunta nunca
 * compiten por CPU con el panel de análisis del profesor si está activado
 * al mismo tiempo, algo que en equipos modestos hacía que una de las dos
 * consultas se quedara sin responder a tiempo.
 *
 * Corre en el navegador de CADA ALUMNO (no en el del profesor ni en un
 * servidor): así el profesor puede ver muchas partidas a la vez sin tener que
 * correr N motores él mismo — cada alumno calcula su propia jugada del motor
 * y su propia evaluación, y ambas quedan guardadas en su fila de
 * `practice_games` para que el profesor solo tenga que leerlas.
 *
 * API:
 *   PracticeEngine.LEVELS -> { "1500": {label, elo}, "1800": {...}, "max": {...} }
 *   PracticeEngine.getMove(fen, levelKey) -> Promise<string|null>  (jugada UCI, ej. "e2e4")
 *   PracticeEngine.evaluate(fen) -> Promise<{type:"cp"|"mate", value:number}|null>
 *     Evaluación siempre a máxima fuerza (independiente del nivel elegido), desde el
 *     punto de vista de quien tiene el turno en ese FEN — igual que evaluatePosition()
 *     de chess-bot.js, para que la barra del profesor sea honesta.
 *
 * Requiere que chess.js NO sea necesario aquí (solo movimientos UCI en bruto); quien
 * llame a getMove() es responsable de aplicar la jugada con chess.js.
 */
(function () {
  "use strict";

  const EVAL_MOVETIME = 450;

  const LEVELS = {
    "1500": { label: "1500 de fuerza", elo: 1500, movetime: 700 },
    "1800": { label: "1800 de fuerza", elo: 1800, movetime: 900 },
    max: { label: "Máxima fuerza posible", elo: null, movetime: 1500 },
  };

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

  function engineSearch(fen, movetimeMs, limitStrength, elo) {
    return SharedEngine.runTask(async () => {
      const engine = await SharedEngine.ensureEngine();
      if (!engine) return { uci: null, score: null };
      SharedEngine.setMessageHandler(onEngineMessage);
      return new Promise((resolve) => {
        lastScoreSeen = null;
        pendingResolve = resolve;
        // clases-engine.js puede haber dejado MultiPV en más de 1 de un análisis
        // anterior — aquí siempre hace falta una sola línea (la mejor), así que
        // se restablece antes de cada búsqueda.
        engine.postMessage("setoption name MultiPV value 1");
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
            // Tardar tantísimo más de lo normal es señal de que el motor se
            // colgó o se cayó (ver la nota en js/shared-engine.js) — se descarta
            // para que la próxima consulta, de este módulo o de clases-engine.js,
            // levante un Worker nuevo en vez de seguir esperando uno muerto.
            SharedEngine.discardEngine();
            resolve({ uci: null, score: null });
          }
        }, movetimeMs + 4000);
      });
    });
  }

  async function getMove(fen, levelKey) {
    const level = LEVELS[levelKey] || LEVELS["1500"];
    const result = await engineSearch(fen, level.movetime, level.elo !== null, level.elo);
    return result.uci;
  }

  async function evaluate(fen) {
    const result = await engineSearch(fen, EVAL_MOVETIME, false, 0);
    return result.score;
  }

  // Precalienta el motor en segundo plano para que la primera jugada de la práctica
  // no tarde (se llama cuando arranca una práctica, no en cada carga de la página).
  function preload() {
    try {
      setTimeout(() => { SharedEngine.ensureEngine(); }, 200);
    } catch (e) {}
  }

  window.PracticeEngine = { LEVELS, getMove, evaluate, preload };
})();
