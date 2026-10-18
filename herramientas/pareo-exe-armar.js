#!/usr/bin/env node
/* Arma el ejecutable de Pareo Integral: la misma línea de comandos de
 * descargas/pareo-integral-cli.zip, pero en un solo archivo que no necesita
 * tener Node instalado (pareo-integral.exe en Windows).
 *
 * Es un «Single Executable Application» de Node: una copia del propio `node`
 * con el programa metido adentro. Por eso sale para el sistema en el que se
 * arma (el .exe se arma en Windows: lo hace .github/workflows/pareo-exe.yml)
 * y pesa lo que pesa node, unos 80-120 MB.
 *
 * Adentro va lo MISMO que en el zip —js/pareo/cli.js, torneo.js,
 * desempates.js y el motor de js/vendor/bbppairings/—, juntado en un archivo
 * con esbuild, y el .wasm como recurso del ejecutable: no hay una segunda
 * copia que se pueda desfasar. Ver «El ejecutable de Windows» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 *   node herramientas/pareo-exe-armar.js [--salida RUTA]
 *
 * Por omisión deja dist/pareo-integral(.exe). Lo prueba
 * `python3 herramientas/verificar-pareo-cli.py --ejecutable RUTA`, y
 * verificar-pareo-exe.js lo arma y lo prueba en cada PR.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const RAIZ = path.resolve(__dirname, "..");
const WASM = path.join(RAIZ, "js", "vendor", "bbppairings", "bbppairings.wasm");
// La marca que busca node para saber que trae un programa adentro (la misma
// en todas las versiones con SEA).
const FUSIBLE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

// La entrada del ejecutable: la de pareo.js del zip, con el motor sacado del
// recurso en vez de la carpeta de al lado.
const ENTRADA = `"use strict";
const sea = require("node:sea");
const { principal } = require("./js/pareo/cli.js");
const crearBbpPairings = require("./js/vendor/bbppairings/bbppairings.js");
const wasm = new Uint8Array(sea.getAsset("bbppairings.wasm"));
const nombre = process.platform === "win32" ? "pareo-integral.exe" : "pareo-integral";
principal(process.argv.slice(2), {
  nombre,
  // Este motor no lee Module.wasmBinary (se compiló con la lista corta de
  // opciones de Emscripten), pero sí instantiateWasm.
  crearMotor: (opciones) => crearBbpPairings({
    ...opciones,
    instantiateWasm: (imports, listo) => {
      WebAssembly.instantiate(wasm, imports).then((r) => listo(r.instance, r.module));
      return {};
    },
  }),
}).then(
  (codigo) => process.exit(codigo),
  (e) => { process.stderr.write(String((e && e.stack) || e) + "\\n"); process.exit(2); }
);
`;

async function armar(salida) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pareo-exe-"));
  try {
    const entrada = path.join(RAIZ, ".pareo-exe-entrada.js");
    const programa = path.join(tmp, "pareo-integral.js");
    fs.writeFileSync(entrada, ENTRADA);
    try {
      // El require del motor con path.join() de cli.js queda sin resolver (y
      // esbuild lo avisa): en el ejecutable no se usa, va por crearMotor.
      await require("esbuild").build({
        entryPoints: [entrada],
        outfile: programa,
        bundle: true,
        platform: "node",
        format: "cjs",
        target: "node22",
        logLevel: "error",
      });
    } finally {
      fs.rmSync(entrada, { force: true });
    }

    const blob = path.join(tmp, "programa.blob");
    const config = path.join(tmp, "sea-config.json");
    fs.writeFileSync(config, JSON.stringify({
      main: programa,
      output: blob,
      disableExperimentalSEAWarning: true,
      useCodeCache: false,
      useSnapshot: false,
      assets: { "bbppairings.wasm": WASM },
    }));
    // El blob lo arma el mismo node que se copia: el formato cambia entre versiones.
    execFileSync(process.execPath, ["--experimental-sea-config", config], { stdio: "inherit" });

    fs.mkdirSync(path.dirname(salida), { recursive: true });
    fs.rmSync(salida, { force: true });
    fs.copyFileSync(process.execPath, salida);
    fs.chmodSync(salida, 0o755);
    if (process.platform === "darwin") execFileSync("codesign", ["--remove-signature", salida]);
    await require("postject").inject(salida, "NODE_SEA_BLOB", fs.readFileSync(blob), {
      sentinelFuse: FUSIBLE,
      machoSegmentName: process.platform === "darwin" ? "NODE_SEA" : undefined,
    });
    if (process.platform === "darwin") execFileSync("codesign", ["--sign", "-", salida]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const i = process.argv.indexOf("--salida");
  const salida = path.resolve(i > 0 ? process.argv[i + 1] : path.join(RAIZ, "dist", "pareo-integral" + (process.platform === "win32" ? ".exe" : "")));
  armar(salida).then(
    () => console.log(`${path.relative(RAIZ, salida)}: ${Math.round(fs.statSync(salida).size / 1048576)} MB`),
    (e) => { console.error(e); process.exit(1); }
  );
}

module.exports = { armar };
