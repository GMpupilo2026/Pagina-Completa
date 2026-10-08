/* ===== Pareo Integral — el motor de emparejamiento =====
 *
 * Le pasa el torneo en TRF a bbpPairings (compilado a WebAssembly; ver
 * herramientas/pareo-motor-compilar.sh) y devuelve lo que contesta. Tres usos,
 * los mismos tres que FIDE pide a un programa avalado:
 *   emparejar(trf)      la ronda siguiente (Sistema Holandés, C.04.3)
 *   comprobar(trf)      el comprobador público (FPC): ¿cada ronda es la que da
 *                       el reglamento?
 *   generar(semilla)    el generador de torneos al azar (RTG)
 *
 * En el navegador corre en un Worker (js/pareo/motor-worker.js). En Node (los
 * verificadores) se llama directo, con PareoMotor.enNode().
 */
(function (raiz) {
  "use strict";

  function crearCorredor(correr) {
    return {
      async emparejar(trf) {
        const r = await correr(["--dutch", "torneo.trf", "-p", "pareo.txt"], { "torneo.trf": trf }, "pareo.txt");
        if (r.codigo === 1) throw Object.assign(new Error("No existe un emparejamiento válido para esta ronda."), { codigo: 1, detalle: r.errores });
        if (r.codigo !== 0 || r.archivo == null) throw Object.assign(new Error((r.errores || "El motor no pudo emparejar.").trim()), { codigo: r.codigo });
        return r.archivo;
      },
      async comprobar(trf) {
        const r = await correr(["--dutch", "torneo.trf", "-c"], { "torneo.trf": trf }, null);
        if (r.codigo !== 0) throw Object.assign(new Error((r.errores || "El comprobador no pudo leer el archivo.").trim()), { codigo: r.codigo });
        // Lo que imprime: «torneo: Round #N» por ronda y, debajo, cada diferencia.
        const diferencias = r.salida.split("\n").map((l) => l.trim())
          .filter((l) => l && !/^torneo: Round #\d+$/.test(l));
        return { correcto: diferencias.length === 0, diferencias, salida: r.salida };
      },
      async generar(semilla, config) {
        const archivos = config ? { "config.txt": config } : {};
        const args = ["--dutch", "-g"].concat(config ? ["config.txt"] : [], ["-o", "azar.trf", "-s", String(semilla)]);
        const r = await correr(args, archivos, "azar.trf");
        if (r.codigo !== 0 || r.archivo == null) throw new Error((r.errores || "El generador falló.").trim());
        return r.archivo;
      },
    };
  }

  function enNavegador(urlWorker) {
    let worker = null;
    let siguiente = 0;
    const pendientes = new Map();
    function correr(args, archivos, leer) {
      if (!worker) {
        worker = new Worker(urlWorker || "js/pareo/motor-worker.js");
        worker.onmessage = (e) => {
          const p = pendientes.get(e.data.id);
          if (p) { pendientes.delete(e.data.id); p(e.data); }
        };
        worker.onerror = () => {
          for (const p of pendientes.values()) p({ codigo: 2, salida: "", errores: "No se pudo cargar el motor.", archivo: null });
          pendientes.clear();
          worker = null;
        };
      }
      const id = ++siguiente;
      return new Promise((listo) => {
        pendientes.set(id, listo);
        worker.postMessage({ id, args, archivos, leer });
      });
    }
    return crearCorredor(correr);
  }

  function enNode(rutaVendor) {
    const crear = require(rutaVendor || require("path").join(__dirname, "..", "vendor", "bbppairings", "bbppairings.js"));
    async function correr(args, archivos, leer) {
      let salida = "", errores = "";
      const m = await crear({ print: (t) => { salida += t + "\n"; }, printErr: (t) => { errores += t + "\n"; } });
      for (const [n, c] of Object.entries(archivos || {})) m.FS.writeFile(n, c);
      let codigo;
      try { codigo = m.callMain(args); } catch (x) { codigo = x && x.status != null ? x.status : 2; }
      let archivo = null;
      if (leer) { try { archivo = m.FS.readFile(leer, { encoding: "utf8" }); } catch (x) { archivo = null; } }
      return { codigo, salida, errores, archivo };
    }
    return crearCorredor(correr);
  }

  const api = { enNavegador, enNode };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.PareoMotor = api;
})(typeof self !== "undefined" ? self : this);
