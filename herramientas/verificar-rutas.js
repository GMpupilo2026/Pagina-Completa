#!/usr/bin/env node
/* Las direcciones del sitio, como las sirve Cloudflare.
 *
 * No necesita red ni navegador: lee las páginas y js/.
 *
 * 1. Todo enlace propio a una página (`href="….html"`) lleva a un archivo
 *    que existe. El de «versión para lector de pantalla» del diagnóstico
 *    apuntaba a ../libro-de-diagnostico-accesible.html, que vive en
 *    material/libro-de-diagnostico/: un 404 que nadie veía.
 * 2. Ninguna comparación con `location.pathname` exige el `.html`.
 *    Cloudflare sirve las páginas sin la extensión (/sesion, /entreno/temas),
 *    así que `/\/cobros\.html$/.test(location.pathname)` nunca daba verdadero
 *    en producción y en la máquina sí: los atajos de la cuenta ciega sacaban
 *    de la clase en vivo, la franja de la tarea no salía nunca, el login del
 *    segundo paso no volvía a la página. Se acepta con o sin: `(\.html)?$`.
 *    Ver «Cloudflare sirve las páginas sin .html» en
 *    docs/decisiones/sitio-e-infraestructura.md.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const FUERA = new Set(["node_modules", ".git", "herramientas", "docs", "supabase", "data"]);
let fallos = 0;

function paginas(dir, salida) {
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
    if (n.name.startsWith(".") || FUERA.has(n.name)) continue;
    const p = path.join(dir, n.name);
    if (n.isDirectory()) paginas(p, salida);
    else if (n.name.endsWith(".html")) salida.push(p);
  }
  return salida;
}

console.log("=== Los enlaces propios a una página llevan a un archivo que existe ===");
let enlaces = 0;
for (const archivo of paginas(RAIZ, [])) {
  const html = fs.readFileSync(archivo, "utf8");
  for (const m of html.matchAll(/\shref="([^"#?:]+\.html)(?:[?#][^"]*)?"/g)) {
    const destino = m[1];
    const real = destino.startsWith("/") ? path.join(RAIZ, destino) : path.join(path.dirname(archivo), destino);
    enlaces++;
    if (!fs.existsSync(real)) {
      fallos++;
      console.log(`  ✗ ${path.relative(RAIZ, archivo)}: href="${destino}" no existe`);
    }
  }
}
if (!fallos) console.log(`  ✓ ${enlaces} enlaces, todos a una página que existe`);

console.log("\n=== Ninguna comparación con location.pathname exige el .html ===");
const antes = fallos;
const JS = path.join(RAIZ, "js");
for (const f of fs.readdirSync(JS).filter((f) => f.endsWith(".js") && !f.endsWith(".min.js"))) {
  fs.readFileSync(path.join(JS, f), "utf8").split("\n").forEach((linea, i) => {
    if (!/pathname/.test(linea) || /^\s*(\/\/|\*)/.test(linea)) return;
    // Una expresión regular con \.html al final, que no sea opcional ni un replace (quitarlo está bien).
    for (const m of linea.matchAll(/\/((?:[^/\n\\]|\\.)*\\\.html\$?)\//g)) {
      if (/\(\\\.html\)\?/.test(m[1]) || /\.replace\(\s*$/.test(linea.slice(0, m.index))) continue;
      fallos++;
      console.log(`  ✗ js/${f}:${i + 1}: /${m[1]}/ junto a pathname: en producción la dirección no lleva .html`);
    }
  });
}
if (fallos === antes) console.log("  ✓ ninguna");

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
