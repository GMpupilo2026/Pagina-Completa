#!/usr/bin/env node
/* Escribe en la CSP de _headers los hashes de los scripts que van en línea.
 *
 * En todo el sitio van escritos en la página solo tres scripts, los de los
 * generadores (guardia, tema y oscuro: ver «Cuatro scripts en línea,
 * iguales en todas las páginas» en docs/decisiones/sitio-e-infraestructura.md),
 * y cada uno es idéntico en todas. La CSP los autoriza por su hash y así
 * script-src no necesita 'unsafe-inline': un <script> que alguien lograra
 * meter en una página no correría.
 *
 * Cuando un generador cambia su bloque cambia su hash, y verificar-csp.js
 * falla hasta que se corre esto. Solo lee los bloques marcados; si hay más de
 * una versión de alguno, no escribe nada (verificar-csp.js dice cuál).
 *
 *     node herramientas/csp-hashes.js
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RAIZ = path.join(__dirname, "..");
// Eran cuatro: el de «fuentes» pasaba la hoja de Google de print a all. Desde
// que las fuentes las sirve el sitio (css/fuentes.css), ya no hay script.
const BLOQUES = ["guardia", "tema", "oscuro"];

function paginas(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "herramientas", "docs", "supabase"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) paginas(p, acc);
    else if (e.name.endsWith(".html")) acc.push(p);
  }
  return acc;
}

/* El hash de cada bloque, sacado de las páginas. Devuelve {nombre: Set(hash)}. */
function hashesDeLasPaginas() {
  const vistos = Object.fromEntries(BLOQUES.map((b) => [b, new Set()]));
  for (const archivo of paginas(RAIZ)) {
    const html = fs.readFileSync(archivo, "utf8");
    for (const m of html.matchAll(/<!-- ([a-z]+): inicio --><script>([\s\S]*?)<\/script>/g)) {
      if (!vistos[m[1]]) continue;
      vistos[m[1]].add("'sha256-" + crypto.createHash("sha256").update(m[2], "utf8").digest("base64") + "'");
    }
  }
  return vistos;
}

/* script-src de la CSP de _headers, como lista de fuentes. */
function scriptSrc(headers) {
  const m = headers.match(/Content-Security-Policy:[^\n]*?script-src ([^;\n]*)/);
  return m ? m[1].trim().split(/\s+/) : null;
}

function main() {
  const vistos = hashesDeLasPaginas();
  const varios = BLOQUES.filter((b) => vistos[b].size !== 1);
  if (varios.length) {
    console.error("No escribo nada: estos bloques no tienen exactamente una versión: " + varios.join(", ") + ". Corre node herramientas/verificar-csp.js.");
    process.exit(1);
  }
  const ruta = path.join(RAIZ, "_headers");
  const headers = fs.readFileSync(ruta, "utf8");
  const actual = scriptSrc(headers);
  if (!actual) { console.error("No encontré script-src en _headers."); process.exit(1); }
  const nuevo = actual.filter((f) => f !== "'unsafe-inline'" && !/^'sha256-/.test(f));
  nuevo.splice(1, 0, ...BLOQUES.map((b) => [...vistos[b]][0]));
  const escrito = headers.replace(/(Content-Security-Policy:[^\n]*?script-src )([^;\n]*)/, (_, a) => a + nuevo.join(" "));
  if (escrito !== headers) fs.writeFileSync(ruta, escrito);
  console.log((escrito !== headers ? "_headers actualizado" : "_headers ya estaba al día") + ": script-src " + nuevo.join(" "));
}

if (require.main === module) main();
module.exports = { hashesDeLasPaginas, scriptSrc, BLOQUES };
