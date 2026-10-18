#!/usr/bin/env node
/* El ejecutable de Pareo Integral (pareo-integral.exe) se arma y se prueba.
 *
 * El .exe de verdad lo arma y lo publica .github/workflows/pareo-exe.yml en
 * Windows. Esto arma el mismo ejecutable para el sistema en el que corre
 * (Linux en el CI) con herramientas/pareo-exe-armar.js y le pasa las pruebas de
 * la línea de comandos (verificar-pareo-cli.py --ejecutable), desde una
 * carpeta vacía: si un cambio en js/pareo/ rompe el armado —un require nuevo
 * que esbuild no junta, el motor que deja de cargarse desde el recurso—, salta
 * en cada PR y no recién en el Windows del merge.
 *
 *   node herramientas/verificar-pareo-exe.js
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { armar } = require("./pareo-exe-armar.js");

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verificar-pareo-exe-"));
  const exe = path.join(tmp, "pareo-integral" + (process.platform === "win32" ? ".exe" : ""));
  try {
    console.log("=== Se arma el ejecutable ===");
    await armar(exe);
    console.log(`  ✓ ${Math.round(fs.statSync(exe).size / 1048576)} MB`);
    const python = process.platform === "win32" ? "python" : "python3";
    const r = spawnSync(python, [path.join(__dirname, "verificar-pareo-cli.py"), "--ejecutable", exe], { stdio: "inherit" });
    process.exitCode = r.status === 0 ? 0 : 1;
  } catch (e) {
    console.error("  ✗ no se pudo armar:", e);
    process.exitCode = 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
