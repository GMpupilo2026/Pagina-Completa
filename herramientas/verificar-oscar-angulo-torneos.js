/* oscar-angulo-torneos.html: los torneos de chess-results en que Oscar Angulo
   figura como árbitro principal, adjunto, árbitro, director u organizador.

   Lo que comprueba:
   - que data/oscar-angulo-torneos.json esté al día con su fuente
     (herramientas/oscar-angulo-torneos.py --comprobar);
   - en el CSV: ninguna clave repetida y cada torneo lo nombra en alguna
     casilla; fuera del JSON, los once de Montería (otro «Oscar Angulo») y la
     primera copia del torneo subido dos veces;
   - que las cifras de la página sean las que salen de contar el CSV acá, por
     otro camino (torneos, jugadores, como árbitro principal, organizador);
   - los filtros: van en la dirección, un enlace con ellos abre esa vista, uno
     que no existe se ignora, la búsqueda no distingue tildes, una barra del
     resumen pone su filtro (aria-pressed) y tocarla de nuevo lo quita;
   - las formas del nombre (con «Apellido, Nombre» y con tildes);
   - «Mostrar más», ordenar por jugadores y bajar en Excel;
   - que a 400 px no haya desplazamiento horizontal y que la página termine en
     el pie (un texto oculto con posición absoluta dentro de la tabla con
     scroll la alargaba el doble);
   - el modo oscuro, y que si el JSON no llega la página lo diga.

   Ver «Los torneos de Oscar Angulo en chess-results» en
   docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-oscar-angulo-torneos.js                   */
"use strict";
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");
const PAGINA = BASE + "/oscar-angulo-torneos.html";

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

// ---- 1. Los datos ----
console.log("Los datos");
try {
  execFileSync("python3", [path.join(RAIZ, "herramientas", "oscar-angulo-torneos.py"), "--comprobar"], { stdio: "pipe" });
  cierto("data/oscar-angulo-torneos.json está al día con el CSV", true);
} catch (e) {
  cierto("data/oscar-angulo-torneos.json está al día con el CSV", false, String(e.stderr || e.message).trim());
}

function leerCSV(ruta) {
  const texto = fs.readFileSync(ruta, "utf8").trim();
  const filas = []; let fila = [], c = "", q = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (q) { if (ch === '"' && texto[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { fila.push(c); c = ""; }
    else if (ch === "\n") { fila.push(c); filas.push(fila); fila = []; c = ""; }
    else if (ch !== "\r") c += ch;
  }
  fila.push(c); filas.push(fila);
  return filas.slice(1).map((f) => Object.fromEntries(f.map((v, i) => [filas[0][i], v])));
}
const CSV = leerCSV(path.join(RAIZ, "herramientas", "datos", "oscar-angulo-torneos.csv"));
const JSON_DATOS = JSON.parse(fs.readFileSync(path.join(RAIZ, "data", "oscar-angulo-torneos.json"), "utf8"));
const normal = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
const ES_EL = /6501435|angulo cubero|oscar angulo|angulo,? *(ia|fa|af|an|na|ai)?\.? *oscar|angulo ?chess/;
const lo = (celda) => ES_EL.test(normal(celda || ""));
const MONTERIA = ["670624", "670625", "670627", "670634", "670635", "670827", "671087", "671279", "671427", "671449", "671492"];
const claves = CSV.map((t) => t.clave);
cierto("el CSV no repite ninguna clave", new Set(claves).size === claves.length);
const sinEl = CSV.filter((t) => !["director", "organizador", "arbitro_principal", "arbitro_adjunto", "arbitros"].some((k) => lo(t[k])));
cierto("cada torneo del CSV lo nombra en alguna casilla", sinEl.length === 0, sinEl.map((t) => t.clave).join(", "));
const enJSON = new Set(JSON_DATOS.torneos.map((t) => String(t.clave)));
cierto("los once de Montería (otro «Oscar Angulo») no están en la página", MONTERIA.every((c) => claves.includes(c) && !enJSON.has(c)));
cierto("del torneo subido dos veces queda una copia", !enJSON.has("447139") && enJSON.has("489491"));
// Las cuentas, directo del CSV.
const VALEN = CSV.filter((t) => !MONTERIA.includes(t.clave) && t.clave !== "447139");
const suma = (lista, k) => lista.reduce((s, t) => s + (Number(t[k]) || 0), 0);
const limpio = (s) => (s || "").replace(/[\s ]+/g, " ").trim();
const num = (n) => limpio(new Intl.NumberFormat("es-CR").format(n));
const HONDURAS = VALEN.filter((t) => t.fed === "HON");
const ORGANIZADOR = VALEN.filter((t) => lo(t.organizador));

(async () => {
  const browser = await chromium.launch();

  async function abrir(consulta, opciones) {
    const ctx = await browser.newContext(Object.assign({ serviceWorkers: "block", acceptDownloads: true }, opciones || {}));
    await ctx.route("**/*", (ruta) => (ruta.request().url().startsWith(BASE) ? ruta.continue() : ruta.fulfill({ status: 200, body: "", contentType: "text/plain" })));
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.goto(PAGINA + (consulta || ""), { waitUntil: "load" });
    await page.waitForFunction(() => !/Cargando/.test(document.getElementById("oa-tesis").textContent), null, { timeout: 15000 });
    return { ctx, page, errores };
  }
  const textoDe = (page, sel) => page.$eval(sel, (n) => n.textContent).then(limpio);
  const filas = (page, col) => page.$$eval("#oa-tabla-torneos tbody tr", (trs, c) => trs.map((tr) => tr.children[c].textContent), col);

  // ---- 2. Sin filtros ----
  console.log("Sin filtros");
  {
    const { ctx, page, errores } = await abrir();
    cierto("los torneos son los del CSV (" + num(VALEN.length) + ")", (await textoDe(page, "#oa-c-torneos")) === num(VALEN.length), await textoDe(page, "#oa-c-torneos"));
    cierto("los jugadores son la suma del CSV (" + num(suma(VALEN, "jugadores")) + ")", (await textoDe(page, "#oa-c-jugadores")) === num(suma(VALEN, "jugadores")), await textoDe(page, "#oa-c-jugadores"));
    const ap = VALEN.filter((t) => lo(t.arbitro_principal)).length;
    cierto("como árbitro principal, los del CSV (" + num(ap) + ")", (await textoDe(page, "#oa-c-principal")) === num(ap), await textoDe(page, "#oa-c-principal"));
    cierto("las rondas son la suma del CSV", (await textoDe(page, "#oa-c-rondas")) === num(suma(VALEN, "rondas")));
    const formas = await page.$$eval("#oa-tabla-formas tbody th", (ths) => ths.map((t) => t.textContent));
    cierto("las formas del nombre traen «Angulo Cubero, Oscar» y «Óscar Ángulo Cubero»", formas.includes("Angulo Cubero, Oscar") && formas.includes("Óscar Ángulo Cubero"), formas.join(" | "));
    cierto("la tabla muestra 100 y ofrece más", (await page.$$("#oa-tabla-torneos tbody tr")).length === 100 && await page.$eval("#oa-mas", (b) => b.checkVisibility()));
    await page.click("#oa-mas");
    cierto("«Mostrar más» suma otros 100", (await page.$$("#oa-tabla-torneos tbody tr")).length === 200);
    await page.click("#oa-tabla-torneos thead button[data-col='jugadores']");
    const mayor = Math.max(...VALEN.map((t) => Number(t.jugadores) || 0));
    cierto("ordenar por jugadores pone primero al más grande (" + mayor + ")", limpio((await filas(page, 6))[0]) === num(mayor) && (await page.getAttribute("#oa-tabla-torneos thead th:nth-child(7)", "aria-sort")) === "descending");
    const enlace = await page.$eval("#oa-tabla-torneos tbody a", (a) => a.href);
    cierto("cada torneo enlaza a su página de chess-results", /^https:\/\/chess-results\.com\/tnr\d+\.aspx\?lan=2$/.test(enlace), enlace);
    const [bajada] = await Promise.all([page.waitForEvent("download"), page.click("#oa-excel")]);
    cierto("«Descargar en Excel» baja un .xlsx", bajada.suggestedFilename() === "torneos-oscar-angulo.xlsx");
    const alto = await page.evaluate(() => document.documentElement.scrollHeight - (document.querySelector("footer").getBoundingClientRect().bottom + scrollY));
    cierto("la página termina en el pie (nada se sale de la tabla con scroll)", Math.abs(alto) < 4, "sobran " + alto + " px");
    cierto("sin errores de la página", errores.length === 0, errores.join("; "));
    await ctx.close();
  }

  // ---- 3. Los filtros ----
  console.log("Los filtros");
  {
    const { ctx, page } = await abrir();
    await page.selectOption("#oa-pais", "Honduras");
    cierto("con Honduras, los torneos de HON en el CSV (" + HONDURAS.length + ")", (await textoDe(page, "#oa-c-torneos")) === num(HONDURAS.length));
    cierto("el país va en la dirección", new URL(page.url()).searchParams.get("pais") === "Honduras", page.url());
    cierto("la tabla queda solo con Honduras", (await filas(page, 5)).every((t) => /Honduras/.test(t)));
    await page.click("#oa-quitar");
    cierto("«Quitar los filtros» vuelve a todo y se esconde", (await textoDe(page, "#oa-c-torneos")) === num(VALEN.length) && !new URL(page.url()).search && !(await page.$eval("#oa-quitar", (b) => b.checkVisibility())));
    // Una barra del resumen pone su filtro y la misma lo quita.
    const anio2016 = page.locator("#oa-por-anio button", { hasText: "2016" });
    await anio2016.click();
    const de2016 = VALEN.filter((t) => t.inicio.startsWith("2016") || (/^unknown/.test(t.inicio) && /2016/.test(t.nombre)));
    cierto("tocar 2016 deja ese año y la barra lo dice (aria-pressed)", (await anio2016.getAttribute("aria-pressed")) === "true"
      && new URL(page.url()).searchParams.get("desde") === "2016" && new URL(page.url()).searchParams.get("hasta") === "2016"
      && (await filas(page, 0)).every((f) => /2016/.test(f)), page.url());
    cierto("con 2016, al menos los torneos con fecha de 2016 del CSV", Number((await textoDe(page, "#oa-c-torneos")).replace(/\D/g, "")) >= de2016.length);
    await anio2016.click();
    cierto("tocarla de nuevo quita el filtro", (await anio2016.getAttribute("aria-pressed")) === "false" && !new URL(page.url()).search);
    await page.locator("#oa-por-rol button", { hasText: "Organizador" }).click();
    cierto("tocar «Organizador» da los del CSV (" + ORGANIZADOR.length + ")", (await textoDe(page, "#oa-c-torneos")) === num(ORGANIZADOR.length) && (await page.$eval("#oa-rol", (s) => s.value)) === "org");
    await page.click("#oa-quitar");
    await page.fill("#oa-buscar", "Escazú");
    await page.waitForTimeout(400);
    const escazu = await filas(page, 1).then((a) => a.concat()).catch(() => []);
    const lugares = await filas(page, 5);
    cierto("buscar «Escazú» no distingue tildes (trae los de «Escazu»)", escazu.length > 0 && escazu.every((n, i) => /escaz[uú]/i.test(n + lugares[i])) && lugares.some((l) => /Escazu\b/.test(l)), escazu.length + " filas");
    await page.selectOption("#oa-hasta", "2014");
    await page.selectOption("#oa-desde", "2020");
    cierto("si «desde» pasa a «hasta», «hasta» lo sigue", (await page.$eval("#oa-hasta", (s) => s.value)) === "2020");
    await ctx.close();
  }

  // ---- 4. Enlaces con filtros ----
  console.log("Un enlace con filtros");
  {
    const { ctx, page } = await abrir("?rol=ap&titulo=IA&ritmo=Cl%C3%A1sico&desde=2022&hasta=2025");
    const esperados = JSON_DATOS.torneos.filter((t) => t.roles.includes("ap") && t.titulo === "IA" && t.ritmo === "Clásico" && t.anio >= 2022 && t.anio <= 2025).length;
    cierto("abre esa vista (" + esperados + " torneos)", (await textoDe(page, "#oa-c-torneos")) === num(esperados) && (await page.$eval("#oa-titulo", (s) => s.value)) === "IA");
    await ctx.close();
    const otro = await abrir("?rol=<b>x</b>&pais=Marte&desde=1990&hasta=abc&forma=nadie");
    cierto("un filtro que no existe se ignora", (await textoDe(otro.page, "#oa-c-torneos")) === num(VALEN.length) && !(await otro.page.$eval("#oa-quitar", (b) => b.checkVisibility())));
    await otro.ctx.close();
  }

  // ---- 5. Celular y modo oscuro ----
  console.log("Celular y modo oscuro");
  {
    const { ctx, page } = await abrir("", { viewport: { width: 400, height: 800 } });
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    cierto("a 400 px no hay desplazamiento horizontal", ancho <= 400, "scrollWidth " + ancho);
    const barra = await page.$eval("#oa-por-anio .oa-fila-barra", (b) => b.checkVisibility() && b.getBoundingClientRect().width > 0);
    cierto("las barras se ven", barra);
    await ctx.close();
  }
  {
    const { ctx, page } = await abrir("", { colorScheme: "dark" });
    const fondo = await page.$eval(".ae-tarjeta", (n) => getComputedStyle(n).backgroundColor);
    cierto("en modo oscuro la tarjeta no queda blanca", fondo !== "rgb(255, 255, 255)", fondo);
    await ctx.close();
  }

  // ---- 6. Si los datos no llegan ----
  console.log("Sin datos");
  {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    await ctx.route("**/data/oscar-angulo-torneos.json*", (r) => r.fulfill({ status: 500, body: "" }));
    const page = await ctx.newPage();
    await page.goto(PAGINA, { waitUntil: "load" });
    await page.waitForTimeout(800);
    cierto("si el JSON falla, la página lo dice", (await textoDe(page, "#oa-tesis")).startsWith("No se pudieron cargar los datos"));
    await ctx.close();
  }

  await browser.close();
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
