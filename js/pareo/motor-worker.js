/* El motor de Pareo Integral corre acá, en un Worker: un pareo de 300 jugadores
 * tarda lo suyo y no tiene por qué congelar la página. Recibe
 * { id, args, archivos, leer } y contesta { id, codigo, salida, errores, archivo }.
 * Cada pedido arranca una instancia NUEVA de bbpPairings (ver
 * herramientas/pareo-motor-compilar.sh): main() deja estado, y así no se arrastra. */
/* global importScripts, crearBbpPairings */
importScripts("../vendor/bbppairings/bbppairings.js");

const WASM = "../vendor/bbppairings/bbppairings.wasm";
let compilado = null;

// El .wasm se baja y se compila UNA vez; cada pedido solo lo instancia.
function modulo() {
  if (!compilado) {
    compilado = WebAssembly.compileStreaming(fetch(WASM))
      .catch(() => fetch(WASM).then((r) => r.arrayBuffer()).then((b) => WebAssembly.compile(b)));
    compilado.catch(() => { compilado = null; });
  }
  return compilado;
}

self.onmessage = async (e) => {
  const { id, args, archivos, leer } = e.data;
  let salida = "", errores = "";
  try {
    const m = await crearBbpPairings({
      instantiateWasm: (imports, listo) => {
        modulo().then((mod) => WebAssembly.instantiate(mod, imports).then((inst) => listo(inst, mod)));
        return {};
      },
      print: (t) => { salida += t + "\n"; },
      printErr: (t) => { errores += t + "\n"; },
    });
    for (const [nombre, contenido] of Object.entries(archivos || {})) m.FS.writeFile(nombre, contenido);
    let codigo;
    try { codigo = m.callMain(args); } catch (x) { codigo = x && x.status != null ? x.status : 2; }
    let archivo = null;
    if (leer) { try { archivo = m.FS.readFile(leer, { encoding: "utf8" }); } catch (x) { archivo = null; } }
    self.postMessage({ id, codigo, salida, errores, archivo });
  } catch (x) {
    self.postMessage({ id, codigo: 2, salida, errores: errores + String(x && x.message || x), archivo: null });
  }
};
