#!/usr/bin/env node
/*! rev bfb5bbb0d2d82f9f */
/* Pone el sello escondido (herramientas/lib/sello.js) en cada archivo de
 * código del proyecto que todavía no lo tenga. Se puede correr todas las veces
 * que se quiera: lo que ya lo tiene no se toca.
 *
 *     node herramientas/sello-estampar.js              lo pone donde falte
 *     node herramientas/sello-estampar.js --comprobar  solo dice dónde falta
 *
 * Qué entra: lo que git conoce (también lo nuevo sin commitear, sin lo de
 * .gitignore) con una de las extensiones de FORMAS. Qué queda fuera, y por qué:
 *   · supabase/: cada migración y cada Edge Function se guarda tal cual se
 *     aplicó o se desplegó, y después el archivo no se toca (ver «El 21/10,
 *     otra vez: comentarios agregados después de aplicar»).
 *   · js/vendor/, js/pdf*.min.js: son librerías de otros, copiadas tal cual
 *     (verificar-vendor.js las compara con su versión publicada); también
 *     img/banderas/, las de flag-icons (verificar-gafetes.js las compara).
 *   · docs/: no es código ni se publica.
 *
 * Un generador que reescribe un archivo le borra el sello: el CI lo avisa
 * (verificar-sello.js) y se arregla corriendo esto otra vez.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { forma, tiene, estampar } = require("./lib/sello");

const RAIZ = path.resolve(__dirname, "..");
const FUERA = [/^supabase\//, /^js\/vendor\//, /^docs\//, /^node_modules\//, /^js\/pdf(\.worker)?\.min\.js$/, /^img\/banderas\//];

function archivos() {
  const salida = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: RAIZ, maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
  return salida.split("\0").filter(Boolean)
    .filter((r) => forma(r) && !FUERA.some((f) => f.test(r)))
    .filter((r) => fs.existsSync(path.join(RAIZ, r)));
}

function sinSello() {
  return archivos().filter((r) => !tiene(fs.readFileSync(path.join(RAIZ, r), "utf8")));
}

module.exports = { archivos, sinSello };

if (require.main === module) {
  const comprobar = process.argv.includes("--comprobar");
  const faltan = sinSello();
  if (comprobar) {
    for (const r of faltan) console.log(r);
    process.exit(faltan.length ? 1 : 0);
  }
  for (const r of faltan) {
    const p = path.join(RAIZ, r);
    fs.writeFileSync(p, estampar(fs.readFileSync(p, "utf8"), r));
  }
  console.log(`Sello puesto en ${faltan.length} archivo(s); ${archivos().length} lo llevan.`);
}
