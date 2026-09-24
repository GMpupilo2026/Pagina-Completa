#!/usr/bin/env node
/* Que nadie vuelva a cargar la librería de Supabase desde un CDN.
 *
 * No necesita navegador, ni red, ni el sitio servido.
 *
 * Lo que vigila se rompe callado en las dos direcciones. Una página nueva
 * copiada de otra vieja vuelve a traer el `<script src="https://cdn…">` y se ve
 * exactamente igual: nadie nota que esa página —y solo esa— ejecuta lo que un
 * tercero publique, con la sesión puesta. Y al revés, una ruta relativa
 * equivocada (`js/vendor/…` desde `entreno/`, que está un piso abajo) da un 404
 * que tampoco avisa: `window.supabase` queda sin definir y la página se queda en
 * "Comprobando tu sesión…" para siempre.
 *
 * También compara el archivo contra el paquete de npm cuando está instalado: si
 * alguien lo editó a mano, la próxima corrida de `vendor-supabase.js` se lo
 * lleva por delante sin decir nada.
 */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const VENDOR = "js/vendor/supabase.js";
let fallos = 0;

const mal = (m) => { console.log("  ✗ " + m); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);

function paginas(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === "herramientas") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) paginas(p, acc);
    else if (e.name.endsWith(".html")) acc.push(p);
  }
  return acc;
}

console.log("=== La librería de Supabase ===");

if (!fs.existsSync(path.join(raiz, VENDOR))) {
  mal(VENDOR + " no existe. Corré: node herramientas/vendor-supabase.js");
  process.exit(1);
}
const local = fs.readFileSync(path.join(raiz, VENDOR));
bien(VENDOR + " está, versión " + (local.toString().match(/supabase-js\/(\d+\.\d+\.\d+)/) || [, "?"])[1]);

// ---- Ninguna página la pide a un CDN ----
const desdeCdn = [];
const rutaMala = [];
const conLibreria = [];
for (const archivo of paginas(raiz)) {
  const html = fs.readFileSync(archivo, "utf8");
  const rel = path.relative(raiz, archivo);
  if (/https?:\/\/[^"']*supabase-js/.test(html)) desdeCdn.push(rel);
  const m = html.match(/src="([^"]*js\/vendor\/supabase\.js)"/);
  if (!m) continue;
  conLibreria.push(rel);
  // La ruta que escribe la página tiene que caer de verdad en el archivo.
  const apunta = path.resolve(path.dirname(archivo), m[1]);
  if (apunta !== path.join(raiz, VENDOR)) rutaMala.push(rel + " → " + m[1]);
}

if (desdeCdn.length) mal("páginas que la piden a un CDN: " + desdeCdn.join(", "));
else bien("ninguna página la pide a un CDN");

if (rutaMala.length) mal("rutas que no llegan al archivo: " + rutaMala.join(", "));
else bien(conLibreria.length + " páginas la cargan, todas con una ruta que llega");

// ---- Y las que usan el cliente, la cargan ----
const sinLibreria = paginas(raiz).filter((a) => {
  const html = fs.readFileSync(a, "utf8");
  return /src="[^"]*js\/supabase-client\.js"/.test(html) && !/src="[^"]*js\/vendor\/supabase\.js"/.test(html);
}).map((a) => path.relative(raiz, a));
if (sinLibreria.length) mal("usan js/supabase-client.js sin cargar la librería: " + sinLibreria.join(", "));
else bien("toda página que usa el cliente carga antes la librería");

// ---- Es la de npm, sin editar ----
let npm = null;
try { npm = require.resolve("@supabase/supabase-js/dist/umd/supabase.js", { paths: [raiz] }); } catch { }
if (!npm) console.log("  · el paquete no está instalado, no se compara (npm install @supabase/supabase-js@2)");
else if (Buffer.compare(local, fs.readFileSync(npm)) === 0) bien("es byte a byte la de npm, sin editar a mano");
else mal("NO coincide con la de npm: o está desactualizada, o alguien la editó. Corré: node herramientas/vendor-supabase.js");

// ---- chess.js, igual ----
// Se pedía a cdnjs, síncrono, desde 43 archivos: una conexión nueva a otro
// origen antes de poder pintar nada (ver herramientas/vendor-chess.js).
console.log("\n=== chess.js ===");
const CHESS = "js/vendor/chess.js";
if (!fs.existsSync(path.join(raiz, CHESS))) mal(CHESS + " no existe. Corre: node herramientas/vendor-chess.js");
else {
  const chessCdn = [], chessRutaMala = [];
  let conChess = 0;
  for (const archivo of paginas(raiz)) {
    const html = fs.readFileSync(archivo, "utf8");
    const rel = path.relative(raiz, archivo);
    if (/<script[^>]+src="https?:\/\/[^"]*chess(\.min)?\.js"/.test(html)) chessCdn.push(rel);
    for (const m of html.matchAll(/src="([^"]*js\/vendor\/chess\.js)"/g)) {
      conChess += 1;
      if (path.resolve(path.dirname(archivo), m[1]) !== path.join(raiz, CHESS)) chessRutaMala.push(rel + " → " + m[1]);
    }
  }
  if (chessCdn.length) mal("páginas que piden chess.js a un CDN: " + chessCdn.join(", "));
  else bien("ninguna página pide chess.js a un CDN");
  if (chessRutaMala.length) mal("rutas a chess.js que no llegan al archivo: " + chessRutaMala.join(", "));
  else bien(conChess + " páginas lo cargan, todas con una ruta que llega");
  let npmChess = null;
  try { npmChess = require.resolve("chess.js/chess.js", { paths: [raiz] }); } catch { }
  if (!npmChess) console.log("  · el paquete no está instalado, no se compara (npm install)");
  else if (Buffer.compare(fs.readFileSync(path.join(raiz, CHESS)), fs.readFileSync(npmChess)) === 0) bien("es byte a byte el de npm, sin editar a mano");
  else mal("NO coincide con el de npm. Corre: node herramientas/vendor-chess.js");
}

console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien: las librerías salen del repositorio, no de un CDN.");
process.exit(fallos ? 1 : 0);
