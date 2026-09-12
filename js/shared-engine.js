/**
 * Un solo Worker de Stockfish, compartido entre el panel de análisis del
 * profesor (js/clases-engine.js) y el motor de práctica/preguntas
 * (js/practice-engine.js) en sesion.html.
 *
 * Antes cada uno de esos dos módulos abría su PROPIO Worker: si el profesor
 * dejaba el panel de análisis activado mientras un alumno practicaba (o
 * respondía una pregunta), el navegador de esa persona terminaba corriendo
 * dos instancias de Stockfish a la vez (~575KB de WASM cada una) compitiendo
 * por CPU — en un equipo modesto, eso es justo lo que hace que una de las
 * dos consultas se quede sin responder a tiempo ("el motor no respondió").
 * Compartir un solo Worker, con una cola que nunca deja dos búsquedas en
 * vuelo a la vez, elimina esa contención — y de paso, si el motor ya estaba
 * "caliente" por el panel de análisis, la primera jugada de una práctica ya
 * no tiene que esperar a que cargue el WASM de nuevo.
 *
 * API:
 *   SharedEngine.ensureEngine() -> Promise<Worker|null>
 *   SharedEngine.runTask(fn) -> Promise<T>   (serializa: nunca dos fn a la vez)
 *   SharedEngine.setMessageHandler(fn)       (quien tenga la tarea en curso decide
 *                                             quién procesa los mensajes del Worker)
 *   SharedEngine.discardEngine()             (ver nota "Motor que se cae" abajo)
 *
 * ---- Motor que se cae con una posición imposible ----
 * Una posición armada a mano en el editor de Clases (piezas sueltas, sin las
 * restricciones de una partida real) puede describir algo que nunca podría pasar
 * jugando de verdad — por ejemplo un peón en la primera o la última fila. chess.js
 * la carga sin quejarse, pero Stockfish (el binario WASM, no este archivo) puede
 * fallar feo con eso: se confirmó en la práctica que "position fen <esa posición>"
 * hace que el Worker termine con un error interno de memoria y deje de responder
 * para siempre — no solo a esa consulta, a CUALQUIER consulta futura, porque antes
 * este archivo se quedaba con la referencia al mismo Worker ya muerto sin
 * enterarse. Por eso el Worker.onerror de abajo actúa aunque el motor ya estuviera
 * funcionando hace rato (no solo durante el arranque), y por eso existe
 * discardEngine(): tanto clases-engine.js como practice-engine.js la llaman en su
 * propio timeout (cuando un "bestmove" tarda muchísimo más de lo normal, señal de
 * que el motor puede haberse colgado o caído de un modo que no disparó
 * Worker.onerror) para que la PRÓXIMA tarea, sea cual sea, levante un Worker
 * nuevo en vez de seguir mandándole mensajes a uno que ya no contesta.
 */
(function () {
  "use strict";

  const STOCKFISH_URL = "js/vendor/stockfish/stockfish-nnue-16-single.js";

  let engine = null;
  let engineInitPromise = null;
  let messageHandler = null;

  function ensureEngine() {
    if (engineInitPromise) return engineInitPromise;
    engineInitPromise = new Promise((resolve) => {
      let w;
      try {
        w = new Worker(STOCKFISH_URL);
      } catch (e) {
        console.error("SharedEngine: fallo al crear el Worker", e);
        engineInitPromise = null;
        resolve(null);
        return;
      }
      let settled = false;
      // El WASM pesa ~575KB; en una conexión lenta o un equipo viejo puede tardar
      // un poco la primera vez.
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        discardEngine();
        resolve(null);
      }, 20000);

      w.onerror = function (e) {
        // A propósito SIN el guard "if (settled) return" que había antes: un
        // Worker que ya estaba funcionando puede caerse a mitad de una consulta
        // (ver la nota de arriba) — cuando eso pasa hace falta descartarlo igual,
        // no solo durante el arranque. resolve(null) de acá abajo no hace nada
        // si esta promesa ya se había resuelto con el Worker (resolver una
        // promesa dos veces no tiene efecto), así que es seguro llamarlo siempre.
        console.error("SharedEngine: Worker onerror", e);
        clearTimeout(timeout);
        settled = true;
        discardEngine();
        resolve(null);
      };

      w.onmessage = function (e) {
        const line = typeof e.data === "string" ? e.data : "";
        if (!settled && line.indexOf("uciok") !== -1) {
          settled = true;
          clearTimeout(timeout);
          engine = w;
          // A partir de aquí, cada tarea decide quién procesa los mensajes
          // (ver setMessageHandler) — nunca hay dos tareas en curso a la vez
          // (ver runTask), así que no hay ambigüedad sobre a quién le toca.
          engine.onmessage = function (ev) {
            if (messageHandler) messageHandler(ev);
          };
          resolve(engine);
        }
      };

      w.postMessage("uci");
    });
    return engineInitPromise;
  }

  function setMessageHandler(fn) {
    messageHandler = fn;
  }

  // Tira el Worker actual (si lo hay) y deja todo listo para que la próxima
  // llamada a ensureEngine() levante uno nuevo desde cero. Ver la nota de arriba.
  function discardEngine() {
    if (engine) {
      try {
        engine.terminate();
      } catch (e) {}
    }
    engine = null;
    engineInitPromise = null;
  }

  // Cola global: cualquier módulo que use este Worker espera su turno. Stockfish
  // habla un solo hilo de UCI — mandarle un "go" mientras otro sigue en curso
  // mezclaría las líneas de respuesta de ambas búsquedas.
  let busy = Promise.resolve();
  function runTask(task) {
    const run = busy.then(task, task);
    busy = run.catch(() => null);
    return run;
  }

  window.SharedEngine = { ensureEngine, runTask, setMessageHandler, discardEngine };
})();
