#!/usr/bin/env node
/* Que las fuentes las sirva el sitio, y que el texto no brinque al llegar.
 *
 * Inter, Merriweather y Quicksand (la de tres temas de la plataforma) salen de
 * fonts/, con la hoja css/fuentes.css, y ya no de Google Fonts. Ver «Las
 * fuentes las sirve el sitio» en docs/decisiones/sitio-e-infraestructura.md.
 * Todo lo que se mira acá se pierde callado: la página se ve igual de bien.
 *
 *   1. En los archivos: ninguna página ni archivo de js/ le pide nada a
 *      fonts.googleapis.com / fonts.gstatic.com, y la CSP de _headers no lo
 *      permite (así una etiqueta copiada de una cabecera vieja se bloquea y se
 *      ve, en vez de funcionar a escondidas).
 *   2. En TODAS las páginas: la que carga css/fuentes.css la pide con la ruta
 *      relativa que corresponde a su carpeta. Con la ruta mal en una subcarpeta
 *      es un 404 que deja esa página sin las fuentes Y sin los respaldos, o sea
 *      peor que antes, y se ve igual.
 *   3. Los .woff2 que nombra la hoja existen, y los respaldos ajustados están
 *      en la pila de css/tailwind.css (definidos y no usados no sirven).
 *   4. En el navegador, en una página de cada profundidad pública: la hoja
 *      carga, el cuerpo usa Inter con su respaldo, cargan las fuentes y no se
 *      precarga ninguna (medido: precargarlas atrasa el pintado).
 *   5. Con un tema que usa Quicksand, el título la usa y se baja del propio
 *      sitio; sin tema, Quicksand no se baja.
 *
 *   node herramientas/verificar-fuentes.js     (con el sitio en el 8777)
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const BASE = process.env.BASE_URL || "http://localhost:8777";
const CHROME = process.env.CHROME_PATH || process.env.CHROME_BIN || undefined;
// Públicas (sin sesión), una de cada profundidad.
const PAGINAS = ["/index.html", "/cursos.html", "/articulos/la-oposicion.html"];
const FUERA = /^(node_modules|docs|supabase|herramientas|\.git)\//;

let fallos = 0;
const mal = (m) => { console.log(`  ✗ ${m}`); fallos++; };
const bien = (m) => console.log(`  ✓ ${m}`);

function archivos(dir, ext, salida = []) {
  for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name).replace(/\\/g, "/").replace(/^\.\//, "");
    if (FUERA.test(rel + "/") || e.name.startsWith(".")) continue;
    if (e.isDirectory()) archivos(rel, ext, salida);
    else if (ext.some((x) => e.name.endsWith(x))) salida.push(rel);
  }
  return salida;
}

(async () => {
  // ---- 1. Google Fonts en el código y en la CSP ----
  console.log("\nGoogle Fonts en el código");
  const todos = archivos(".", [".html", ".js", ".css"]).filter((f) => !f.startsWith("js/vendor/"));
  const conGoogle = todos.filter((f) => /fonts\.(googleapis|gstatic)\.com/.test(fs.readFileSync(path.join(RAIZ, f), "utf8")));
  if (conGoogle.length) mal("le piden la fuente a Google: " + conGoogle.slice(0, 8).join(", ") + (conGoogle.length > 8 ? "…" : ""));
  else bien(`ninguno de ${todos.length} archivos le pide nada a Google Fonts`);

  const csp = fs.readFileSync(path.join(RAIZ, "_headers"), "utf8");
  if (/fonts\.(googleapis|gstatic)\.com/.test(csp)) mal("la CSP de _headers todavía deja pasar a Google Fonts");
  else bien("la CSP no deja pasar a Google Fonts");

  // ---- 2. La ruta de la hoja, en todas las páginas ----
  console.log("\nLa hoja de fuentes en cada página");
  const paginas = todos.filter((f) => f.endsWith(".html"));
  let conHoja = 0;
  const malas = [];
  for (const p of paginas) {
    const html = fs.readFileSync(path.join(RAIZ, p), "utf8");
    const m = html.match(/<link rel="stylesheet" href="([^"]*css\/fuentes\.css)">/);
    if (!m) continue;
    conHoja++;
    const destino = path.normalize(path.join(path.dirname(p), m[1]));
    if (destino !== path.normalize("css/fuentes.css")) malas.push(`${p} → ${m[1]}`);
  }
  if (malas.length) mal("piden la hoja con la ruta equivocada: " + malas.slice(0, 6).join(", "));
  else bien(`${conHoja} páginas cargan css/fuentes.css, todas con la ruta de su carpeta`);
  if (conHoja < 100) mal(`solo ${conHoja} páginas cargan la hoja: ¿se corrió herramientas/fuentes-cabecera.py?`);

  // ---- 3. Los archivos y la pila de Tailwind ----
  console.log("\nLos .woff2 y los respaldos");
  const hoja = fs.readFileSync(path.join(RAIZ, "css", "fuentes.css"), "utf8");
  const pedidos = [...hoja.matchAll(/url\('(\/fonts\/[^']+)'\)/g)].map((m) => m[1]);
  const faltan = pedidos.filter((u) => !fs.existsSync(path.join(RAIZ, u.slice(1))));
  if (faltan.length) mal("css/fuentes.css pide archivos que no están: " + faltan.join(", "));
  else bien(`los ${pedidos.length} .woff2 de la hoja existen`);
  for (const fam of ["Inter", "Merriweather", "Quicksand"]) {
    if (!new RegExp(`font-family: '${fam}'`).test(hoja)) mal(`css/fuentes.css no declara ${fam}`);
  }
  const tw = fs.readFileSync(path.join(RAIZ, "css", "tailwind.css"), "utf8");
  if (!/Inter respaldo/.test(tw) || !/Merriweather respaldo/.test(tw)) {
    mal("css/tailwind.css no lleva los respaldos ajustados en su pila (correr npm run css)");
  } else bien("css/tailwind.css usa los respaldos ajustados");

  // ---- 4 y 5. En el navegador ----
  const navegador = await chromium.launch({ executablePath: CHROME });
  async function abrir(ruta, tema) {
    const ctx = await navegador.newContext({ serviceWorkers: "block" });
    if (tema) await ctx.addInitScript((t) => { try { localStorage.setItem("plataforma_tema_v1", t); } catch (e) {} }, tema);
    const pagina = await ctx.newPage();
    const rotos = [];
    const pedidas = [];
    pagina.on("response", (r) => {
      if (r.status() >= 400) rotos.push(`${r.status()} ${r.url().replace(BASE, "")}`);
      if (/\.woff2(\?|$)/.test(r.url())) pedidas.push(r.url());
    });
    await pagina.goto(BASE + ruta, { waitUntil: "load" });
    await pagina.waitForTimeout(400);
    return { ctx, pagina, rotos, pedidas };
  }

  for (const ruta of PAGINAS) {
    console.log(`\n${ruta}`);
    const { ctx, pagina, rotos, pedidas } = await abrir(ruta);
    const r = await pagina.evaluate(async () => {
      await document.fonts.ready;
      const titulo = document.querySelector(".font-serif, h1, h2");
      return {
        cuerpo: getComputedStyle(document.body).fontFamily,
        titulo: titulo ? getComputedStyle(titulo).fontFamily : "",
        cargadas: [...new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, "")))],
        preloads: document.querySelectorAll("link[rel=preload][as=font]").length,
        hoja: [...document.styleSheets].some((h) => (h.href || "").endsWith("/css/fuentes.css")),
      };
    });
    if (rotos.length) rotos.forEach((x) => mal(`pide algo que no está: ${x}`));
    if (!r.hoja) mal("css/fuentes.css no cargó"); else bien("css/fuentes.css cargó");
    if (!/Inter respaldo/.test(r.cuerpo)) mal(`el cuerpo no lleva el respaldo ajustado: ${r.cuerpo}`);
    else bien("el cuerpo usa Inter con su respaldo ajustado");
    if (/Merriweather/.test(r.titulo) && !/Merriweather respaldo/.test(r.titulo)) mal(`el título serif no lleva su respaldo: ${r.titulo}`);
    if (!r.cargadas.includes("Inter")) mal("no cargó Inter: " + JSON.stringify(r.cargadas));
    else bien("cargaron: " + r.cargadas.join(", "));
    const ajenas = pedidas.filter((u) => !u.startsWith(BASE));
    if (ajenas.length) mal("bajó fuentes de afuera: " + ajenas.join(", "));
    else bien(`las ${pedidas.length} fuentes que bajó son del propio sitio`);
    if (pedidas.some((u) => /quicksand/.test(u))) mal("sin tema bajó Quicksand (solo la usan tres temas)");
    // «Precargá tus fuentes» es el consejo de manual, y acá sale peor: lo más
    // grande de la pantalla es texto y lo que demora en pintarlo es
    // tailwind.css. Medido en la portada con 4G lenta: precargando las dos,
    // LCP 1488 ms; sin precargar, 1060 ms.
    if (r.preloads) mal(`precarga ${r.preloads} fuente(s): medido, atrasa el pintado (ver fuentes-cabecera.py)`);
    else bien("no precarga fuentes");
    await ctx.close();
  }

  console.log("\nCon el tema Princesas (títulos en Quicksand)");
  {
    const { ctx, pagina, pedidas } = await abrir("/index.html", "princesas");
    const r = await pagina.evaluate(async () => {
      await document.fonts.ready;
      const t = document.querySelector(".font-serif");
      return {
        tema: document.documentElement.getAttribute("data-tema"),
        titulo: t ? getComputedStyle(t).fontFamily : "",
        cargada: [...document.fonts].some((f) => /Quicksand/.test(f.family) && f.status === "loaded"),
      };
    });
    if (r.tema !== "princesas") mal("no se puso el tema: " + r.tema);
    if (!/^["']?Quicksand/.test(r.titulo)) mal("el título no usa Quicksand: " + r.titulo);
    else if (!/Merriweather respaldo/.test(r.titulo)) mal("el título del tema no lleva el respaldo de Merriweather detrás: " + r.titulo);
    else bien("el título usa Quicksand, con Merriweather y su respaldo detrás");
    if (!r.cargada) mal("Quicksand no cargó");
    const q = pedidas.filter((u) => /quicksand/.test(u));
    if (!q.length) mal("no se bajó Quicksand");
    else if (q.some((u) => !u.startsWith(BASE))) mal("Quicksand se bajó de afuera: " + q.join(", "));
    else bien("Quicksand cargó, y del propio sitio");
    await ctx.close();
  }

  await navegador.close();
  console.log(fallos ? `\n✗ ${fallos} problema(s)` : "\n✓ Las fuentes las sirve el sitio");
  process.exit(fallos ? 1 : 0);
})();
