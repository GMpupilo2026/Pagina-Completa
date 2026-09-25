#!/usr/bin/env node
/* Que nadie vuelva a cargar desde un CDN las librerías que viven en js/vendor/:
 * Supabase, chess.js y three.js (la lista está en lib/librerias-vendor.js).
 *
 * No necesita navegador, ni red, ni el sitio servido.
 *
 * Lo que vigila se rompe callado en las dos direcciones. Una página nueva
 * copiada de otra vieja vuelve a traer el `<script src="https://cdn…">` y se ve
 * exactamente igual: nadie nota que esa página —y solo esa— ejecuta lo que un
 * tercero publique, con la sesión puesta. Y al revés, una ruta relativa
 * equivocada (`js/vendor/…` desde `entreno/`, que está un piso abajo) da un 404
 * que tampoco avisa: `window.supabase` queda sin definir y la página se queda en
 * "Comprobando tu sesión…" para siempre, o el tablero no aparece.
 *
 * También compara cada archivo contra el paquete de npm cuando está instalado:
 * si alguien lo editó a mano, la próxima corrida de `vendor.js` se lo lleva por
 * delante sin decir nada.
 */
const fs = require("fs");
const path = require("path");
const LIBRERIAS = require("./lib/librerias-vendor.js");

const raiz = path.join(__dirname, "..");
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
// El HTML más su código mudado a js/ (lib/codigo-de-pagina.js): una ruta que
// pide el script resuelve contra la página, igual que una escrita en ella.
const todas = paginas(raiz).map((a) => ({ a, rel: path.relative(raiz, a), html: require("./lib/codigo-de-pagina").leer(path.relative(raiz, a)) }));
const escaparRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

for (const lib of LIBRERIAS) {
  console.log("=== " + lib.nombre + " ===");
  const VENDOR = lib.archivo;
  if (!fs.existsSync(path.join(raiz, VENDOR))) {
    mal(VENDOR + " no existe. Corre: node herramientas/vendor.js");
    continue;
  }
  const local = fs.readFileSync(path.join(raiz, VENDOR));
  bien(VENDOR + " está");

  // ---- Ninguna página la pide a un CDN ----
  const desdeCdn = [];
  const rutaMala = [];
  const conLibreria = [];
  // La ruta entre comillas: en un src="…" o en el código que la pide después
  // (inscripcion.html baja three.js recién al terminar de cargar).
  const nombreArchivo = new RegExp('["\']([^"\']*js/vendor/' + escaparRe(path.basename(VENDOR)) + ')["\']', "g");
  for (const { a, rel, html } of todas) {
    if (lib.cdn.test(html)) desdeCdn.push(rel);
    const rutas = [...html.matchAll(nombreArchivo)].map((m) => m[1]);
    if (!rutas.length) continue;
    conLibreria.push(rel);
    // La ruta que escribe la página tiene que caer de verdad en el archivo.
    for (const r of rutas) {
      if (path.resolve(path.dirname(a), r) !== path.join(raiz, VENDOR)) rutaMala.push(rel + " → " + r);
    }
  }

  if (desdeCdn.length) mal("páginas que la piden a un CDN: " + desdeCdn.join(", "));
  else bien("ninguna página la pide a un CDN");

  if (rutaMala.length) mal("rutas que no llegan al archivo: " + rutaMala.join(", "));
  else bien(conLibreria.length + " páginas la cargan, todas con una ruta que llega");

  // ---- Es la de npm, sin editar ----
  let npm = null;
  try { npm = require.resolve(lib.npm, { paths: [raiz] }); } catch { }
  if (!npm) console.log("  · el paquete no está instalado, no se compara (npm install)");
  else if (Buffer.compare(local, fs.readFileSync(npm)) === 0) bien("es byte a byte la de npm, sin editar a mano");
  else mal("NO coincide con la de npm: o está desactualizada, o alguien la editó. Corre: node herramientas/vendor.js");
}

// ---- Y las que usan el cliente de Supabase, cargan la librería ----
console.log("=== Cliente de Supabase ===");
const sinLibreria = todas.filter(({ html }) =>
  /src="[^"]*js\/supabase-client\.js"/.test(html) && !/src="[^"]*js\/vendor\/supabase\.js"/.test(html)
).map(({ rel }) => rel);
if (sinLibreria.length) mal("usan js/supabase-client.js sin cargar la librería: " + sinLibreria.join(", "));
else bien("toda página que usa el cliente carga antes la librería");

// ---- Ni la CSP deja la puerta abierta a cdnjs ----
// Era el único motivo para tenerlo en script-src: si vuelve, vuelve con él la
// posibilidad de que una página cargue de ahí sin que nadie lo note.
const cabeceras = fs.readFileSync(path.join(raiz, "_headers"), "utf8");
if (/cdnjs\.cloudflare\.com/.test(cabeceras)) mal("_headers todavía deja pasar cdnjs.cloudflare.com");
else bien("la CSP de _headers ya no deja pasar cdnjs.cloudflare.com");

console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien: las librerías salen del repositorio, no de un CDN.");
process.exit(fallos ? 1 : 0);
