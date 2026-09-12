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
        resolve(null);
        return;
      }
      let settled = false;
      // El WASM pesa ~575KB; en una conexión lenta o un equipo viejo puede tardar
      // un poco la primera vez.
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          w.terminate();
        } catch (e) {}
        resolve(null);
      }, 20000);

      w.onerror = function (e) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        console.error("SharedEngine: Worker onerror", e);
        try {
          w.terminate();
        } catch (e2) {}
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

  // Cola global: cualquier módulo que use este Worker espera su turno. Stockfish
  // habla un solo hilo de UCI — mandarle un "go" mientras otro sigue en curso
  // mezclaría las líneas de respuesta de ambas búsquedas.
  let busy = Promise.resolve();
  function runTask(task) {
    const run = busy.then(task, task);
    busy = run.catch(() => null);
    return run;
  }

  window.SharedEngine = { ensureEngine, runTask, setMessageHandler };
})();
