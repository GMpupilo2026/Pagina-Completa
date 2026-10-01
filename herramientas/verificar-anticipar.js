#!/usr/bin/env node
/* Que la navegación se adelante de verdad, y solo con `prefetch`.
 *
 * Al pasar el mouse por un enlace (o apoyar el dedo), el navegador se baja la
 * página antes del clic. Las reglas viven en anticipar.json y las anuncia la
 * cabecera Speculation-Rules de _headers, no un <script> en la página: la CSP
 * bloquea los scripts en línea. Ver «La navegación se adelanta» en
 * docs/decisiones/sitio-e-infraestructura.md.
 *
 * Todo se pierde callado: una regla mal escrita (el `?` de un URLPattern
 * excluía el sitio entero), el archivo servido con otro tipo o la cabecera
 * borrada no dan ningún error; la página simplemente no se adelanta. Por eso
 * este verificador no mira que la regla ESTÉ: pasa el mouse por un enlace y
 * mira que la descarga salga, con la CSP y las cabeceras de _headers puestas
 * por un servidor propio (reescritas por Playwright, el navegador las ignora).
 *
 *   1. anticipar.json es `prefetch`, nunca `prerender`: prerender EJECUTA la
 *      página, y js/tiempo-plataforma.js apuntaría minutos de páginas que
 *      nadie abrió (los que ve el profesor en Informes y llegan a la casa).
 *   2. _headers anuncia las reglas para todo el sitio y les da su tipo.
 *   3. En el navegador: pasar el mouse por «Cursos» la adelanta; por un PDF o
 *      por «cerrar sesión», no; y la CSP no se queja.
 *
 *   node herramientas/verificar-anticipar.js
 */
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || process.env.CHROME_BIN || undefined;
let fallos = 0;
const mal = (m) => { console.log(`  ✗ ${m}`); fallos++; };
const bien = (m) => console.log(`  ✓ ${m}`);

/* Las reglas de _headers, como las aplica Cloudflare: el bloque `/*` a todo, y
   los de ruta exacta a esa ruta. Este sitio no usa otros patrones. */
function leerCabeceras() {
  const bloques = [];
  let actual = null;
  for (const linea of fs.readFileSync(path.join(RAIZ, "_headers"), "utf8").split("\n")) {
    if (!linea.trim() || linea.startsWith("#")) continue;
    if (!/^\s/.test(linea)) { actual = { ruta: linea.trim(), cabeceras: {} }; bloques.push(actual); continue; }
    const i = linea.indexOf(":");
    if (actual && i > 0) actual.cabeceras[linea.slice(0, i).trim().toLowerCase()] = linea.slice(i + 1).trim();
  }
  return bloques;
}

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".ico": "image/x-icon" };

function servidor(bloques) {
  return http.createServer((req, res) => {
    let ruta = decodeURIComponent(req.url.split("?")[0]);
    if (ruta.endsWith("/")) ruta += "index.html";
    const archivo = path.join(RAIZ, ruta);
    if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); return res.end(); }
    const cab = { "content-type": TIPOS[path.extname(archivo)] || "application/octet-stream" };
    for (const b of bloques) if (b.ruta === "/*" || b.ruta === ruta) Object.assign(cab, b.cabeceras);
    res.writeHead(200, cab);
    fs.createReadStream(archivo).pipe(res);
  });
}

(async () => {
  // ---- 1. Las reglas ----
  console.log("\nanticipar.json");
  let reglas = null;
  try { reglas = JSON.parse(fs.readFileSync(path.join(RAIZ, "anticipar.json"), "utf8")); }
  catch (e) { mal("anticipar.json no existe o no es JSON válido: " + e.message); }
  if (reglas) {
    if (reglas.prerender) mal("declara PRERENDER: ejecutaría la página y apuntaría tiempo de páginas que nadie abrió");
    else bien("no declara prerender");
    if (!Array.isArray(reglas.prefetch) || !reglas.prefetch.length) mal("no declara ningún prefetch");
    else if (reglas.prefetch.some((r) => r.eagerness === "eager" || r.eagerness === "immediate")) {
      mal("algún prefetch es eager/immediate: bajaría todo lo que hay en pantalla y gastaría los datos de todos");
    } else bien("prefetch, solo cuando hay intención (moderate)");
  }

  // ---- 2. _headers ----
  console.log("\n_headers");
  const bloques = leerCabeceras();
  const todo = bloques.find((b) => b.ruta === "/*");
  if (!todo || todo.cabeceras["speculation-rules"] !== '"/anticipar.json"') mal('el bloque /* no lleva Speculation-Rules: "/anticipar.json"');
  else bien("todo el sitio anuncia las reglas");
  const tipo = (bloques.find((b) => b.ruta === "/anticipar.json") || { cabeceras: {} }).cabeceras["content-type"];
  if (tipo !== "application/speculationrules+json") mal("anticipar.json no lleva Content-Type: application/speculationrules+json (sin eso no se aplican)");
  else bien("anticipar.json se sirve con su tipo");

  // ---- 3. En el navegador ----
  console.log("\nEn el navegador, con las cabeceras de _headers");
  const srv = servidor(bloques);
  await new Promise((r) => srv.listen(0, r));
  const BASE = "http://localhost:" + srv.address().port;
  const navegador = await chromium.launch({ executablePath: CHROME });
  const ctx = await navegador.newContext({ serviceWorkers: "block" });
  const pagina = await ctx.newPage();
  const adelantadas = [];
  pagina.on("request", (r) => {
    const s = r.headers()["sec-purpose"] || "";
    if (s.includes("prefetch")) adelantadas.push(r.url().replace(BASE, ""));
  });
  await pagina.addInitScript(() => {
    window.__violaciones = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__violaciones.push(e.violatedDirective + " " + e.blockedURI));
  });
  await pagina.goto(BASE + "/index.html", { waitUntil: "load" });
  await pagina.waitForTimeout(500);
  if (adelantadas.length) mal("adelantó páginas sin que nadie pasara el mouse: " + adelantadas.join(", "));

  await pagina.hover('a[href$="cursos.html"]');
  await pagina.waitForTimeout(1500);
  if (adelantadas.some((u) => /cursos\.html$/.test(u))) bien("pasar el mouse por «Cursos» la baja antes del clic");
  else mal("pasar el mouse por «Cursos» no adelantó nada (¿regla mal escrita, tipo o cabecera?): " + JSON.stringify(adelantadas));

  // Lo excluido: se prueba con enlaces puestos en la misma página.
  await pagina.evaluate(() => {
    const caja = document.createElement("div");
    caja.style.cssText = "position:fixed;top:0;left:0;z-index:99999;background:#fff";
    caja.innerHTML = '<a id="x-pdf" href="instrucciones-adaptadas.pdf">pdf</a> <a id="x-salir" href="login.html?logout=1">salir</a>';
    document.body.appendChild(caja);
  });
  const antes = adelantadas.length;
  await pagina.hover("#x-pdf"); await pagina.waitForTimeout(1000);
  await pagina.hover("#x-salir"); await pagina.waitForTimeout(1000);
  const extra = adelantadas.slice(antes);
  if (extra.length) mal("adelantó lo que no debía: " + extra.join(", "));
  else bien("un PDF y «cerrar sesión» no se adelantan");

  const violaciones = await pagina.evaluate(() => window.__violaciones);
  if (violaciones.length) mal("la CSP se quejó: " + violaciones.join(", "));
  else bien("sin quejas de la CSP");

  await navegador.close();
  srv.close();
  console.log(fallos ? `\n✗ ${fallos} problema(s)` : "\n✓ La navegación se adelanta, solo con prefetch");
  process.exit(fallos ? 1 : 0);
})();
