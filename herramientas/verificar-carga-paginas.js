#!/usr/bin/env node
/* Lo que frena el primer pintado de TODAS las páginas.
 *
 * No necesita navegador, ni red, ni el sitio servido. Es la mitad estática de
 * «Lo que frena el primer pintado» (docs/decisiones/sitio-e-infraestructura.md);
 * la del tablero y el bot es verificar-carga-tablero.js.
 *
 * Nada de esto da error: una página que baja 400 KB síncronos en el <head> se
 * ve perfecta en la computadora con fibra, y en un celular con 4G se queda en
 * blanco cuatro segundos. Por eso se vigila leyendo el HTML:
 *
 * 1. Ningún script pesado (más de 150 KB) se pide SÍNCRONO dentro del <head>.
 *    Ahí el navegador no puede pintar nada hasta bajarlo y ejecutarlo. Los
 *    bancos de preguntas y de ejercicios los usa el script del final de la
 *    página, así que van justo antes de él; lo que se usa solo a veces (pdf.js
 *    en la clase en vivo) se pide cuando se usa. Tampoco la librería de
 *    Supabase: va con su cliente y lo que depende de él justo antes del primer
 *    script del <body>. La guardia de sesión del <head> no la necesita (lee
 *    localStorage), y lo que sí la usa arranca cuando la página ya se leyó.
 * 2. Ninguna página carga dos veces el mismo script. No es solo peso: main.js
 *    cargado dos veces le pone dos manejadores a cada botón, y el menú del
 *    celular y el del modo oscuro se abren y se cierran en el mismo clic.
 * 3. La hoja de Google Fonts no frena el pintado (`media="print"` que pasa a
 *    `all` al llegar). Es de otro origen: esperarla es abrir una conexión nueva
 *    antes de mostrar nada, y con `display=swap` el texto sale igual con la
 *    fuente del sistema mientras tanto.
 */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const LIMITE_KB = 150;
let fallos = 0;
const mal = (m) => { console.log("  ✗ " + m); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);

function paginas(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "herramientas", "docs", "supabase"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) paginas(p, acc);
    else if (e.name.endsWith(".html")) acc.push(p);
  }
  return acc;
}

const pesados = [], dobles = [], fuentesQueFrenan = [];
let revisadas = 0;
for (const archivo of paginas(raiz)) {
  const html = fs.readFileSync(archivo, "utf8");
  const rel = path.relative(raiz, archivo);
  revisadas += 1;
  const finHead = html.indexOf("</head>");
  const vistos = new Map();
  for (const m of html.matchAll(/<script\b([^>]*)>/g)) {
    const attrs = m[1];
    const src = (attrs.match(/\bsrc="([^"]+)"/) || [])[1];
    if (!src || /^https?:/.test(src)) continue;
    const destino = path.relative(raiz, path.resolve(path.dirname(archivo), src.split("?")[0]));
    vistos.set(destino, (vistos.get(destino) || 0) + 1);
    const diferido = /\b(defer|async)\b/.test(attrs) || /type="module"/.test(attrs);
    if (diferido || m.index > finHead) continue;
    const f = path.join(raiz, destino);
    if (!fs.existsSync(f)) continue;
    const kb = Math.round(fs.statSync(f).size / 1024);
    if (kb > LIMITE_KB) pesados.push(rel + " → " + destino + " (" + kb + " KB)");
  }
  for (const [src, n] of vistos) if (n > 1) dobles.push(rel + " → " + src + " ×" + n);
  for (const m of html.matchAll(/<link\b[^>]*fonts\.googleapis\.com\/css2[^>]*>/g)) {
    if (!/media="print"/.test(m[0]) || !/onload="this\.media='all'"/.test(m[0])) fuentesQueFrenan.push(rel);
  }
}

console.log("=== Lo que frena el primer pintado (" + revisadas + " páginas) ===");
if (pesados.length) mal("scripts de más de " + LIMITE_KB + " KB síncronos en el <head>:\n      " + pesados.join("\n      "));
else bien("ningún script de más de " + LIMITE_KB + " KB se pide síncrono en el <head>");
if (dobles.length) mal("scripts cargados dos veces:\n      " + dobles.join("\n      "));
else bien("ninguna página carga dos veces el mismo script");
if (fuentesQueFrenan.length) mal("la hoja de Google Fonts frena el pintado en: " + fuentesQueFrenan.slice(0, 8).join(", ") + (fuentesQueFrenan.length > 8 ? "…" : ""));
else bien("la hoja de Google Fonts no frena el pintado en ninguna");

/* ---- El código de las páginas sale del HTML ----
   Un <script> escrito dentro de la página se vuelve a bajar entero con cada
   visita (no se guarda en caché aparte) y obliga a dejar 'unsafe-inline' en la
   CSP. Se mudan a js/ de a uno, sin tocar el código (ver «El código de las
   páginas sale del HTML» en docs/decisiones/sitio-e-infraestructura.md).
   PENDIENTES son las que todavía traen un bloque de más de 20 KB: la lista
   solo se achica. Una página nueva no entra, y una que ya se mudó sale. */
const LIMITE_EN_LINEA_KB = 20;
const PENDIENTES = new Set([
  "entreno/4x4.html", "entreno/diagnostico.html", "entreno/aprender.html",
  "entreno/desafios.html", "entreno/temas.html", "entreno/practicas.html",
  "entreno/mates.html", "entreno/aperturas.html",
]);
const grandesNuevos = [], yaMudadas = [];
for (const archivo of paginas(raiz)) {
  const rel = path.relative(raiz, archivo).split(path.sep).join("/");
  const html = fs.readFileSync(archivo, "utf8");
  let mayor = 0;
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/json/.test(m[1])) continue;   // datos (ld+json), no código
    mayor = Math.max(mayor, Buffer.byteLength(m[2]));
  }
  const grande = mayor > LIMITE_EN_LINEA_KB * 1024;
  if (grande && !PENDIENTES.has(rel)) grandesNuevos.push(rel + " (" + Math.round(mayor / 1024) + " KB)");
  if (!grande && PENDIENTES.has(rel)) yaMudadas.push(rel);
}
console.log("\n=== El código de las páginas sale del HTML (" + PENDIENTES.size + " pendientes) ===");
if (grandesNuevos.length) mal("un <script> de más de " + LIMITE_EN_LINEA_KB + " KB escrito en la página (va a un archivo de js/):\n      " + grandesNuevos.join("\n      "));
else bien("ninguna página fuera de la lista trae un <script> de más de " + LIMITE_EN_LINEA_KB + " KB escrito adentro");
if (yaMudadas.length) mal("ya no tienen un bloque grande, sácalas de PENDIENTES: " + yaMudadas.join(", "));
else bien("la lista de pendientes está al día");

console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
