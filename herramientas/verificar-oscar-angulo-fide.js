/* oscar-angulo-fide.html: los torneos de Oscar Angulo en FIDE y si valen
   para una norma de árbitro (las reglas las prueba
   verificar-oscar-angulo-fide-reglas.py; acá, la página).

   Lo que comprueba:
   - que las cifras sean las del JSON contadas acá por otro camino (torneos,
     árbitro principal, cuántos valen para AF y para AI);
   - los filtros: «Norma de AI: Vale» deja solo los que valen y la tabla lo
     dice escrito en cada fila; van en la dirección, un enlace con ellos abre
     esa vista y uno que no existe se ignora; una barra pone su filtro y la
     misma lo quita;
   - que cada estado de norma vaya escrito con su porqué (no un color solo),
     el enlace a FIDE y a chess-results, y que el mes salga en español;
   - «Mostrar más», ordenar por norma de AI y bajar en Excel;
   - a 400 px sin desplazamiento horizontal, la página termina en el pie, el
     modo oscuro, y que si el JSON no llega la página lo diga.

   Ver «Sus torneos en FIDE y las normas de árbitro» en
   docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-oscar-angulo-fide.js                      */
"use strict";
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");
const PAGINA = BASE + "/oscar-angulo-fide.html";

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

const DATOS = JSON.parse(fs.readFileSync(path.join(RAIZ, "data", "oscar-angulo-fide.json"), "utf8"));
const T = DATOS.torneos;
const limpio = (s) => (s || "").replace(/[\s ]+/g, " ").trim();
const num = (n) => limpio(new Intl.NumberFormat("es-CR").format(n));
const VALE = ["si", "una", "opcion"];
const valeAI = T.filter((t) => VALE.includes(t.ai.estado));

console.log("Los datos");
cierto("cada torneo dice su estado y su porqué en las dos normas", T.every((t) => t.af.detalle && t.ai.detalle && t.af.estado && t.ai.estado));
cierto("ningún mes en inglés", !T.some((t) => /January|February|March|April|May|June|July|August|September|October|November|December/.test(t.valorado)));
cierto("lo que vale para AI vale también para AF (3.12)", T.filter((t) => ["si", "una"].includes(t.ai.estado)).every((t) => t.af.estado !== "no"));
cierto("quien solo fue organizador no tiene ninguna norma", T.filter((t) => t.cargos.every((c) => c === "Organizer")).every((t) => t.af.estado === "no" && t.ai.estado === "no"));

(async () => {
  const browser = await chromium.launch();
  async function abrir(consulta, opciones) {
    const ctx = await browser.newContext(Object.assign({ serviceWorkers: "block", acceptDownloads: true }, opciones || {}));
    await ctx.route("**/*", (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.fulfill({ status: 200, body: "", contentType: "text/plain" })));
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.goto(PAGINA + (consulta || ""), { waitUntil: "load" });
    await page.waitForFunction(() => !/Cargando/.test(document.getElementById("of-tesis").textContent), null, { timeout: 15000 });
    return { ctx, page, errores };
  }
  const textoDe = (page, sel) => page.$eval(sel, (n) => n.textContent).then(limpio);

  console.log("Sin filtros");
  {
    const { ctx, page, errores } = await abrir();
    cierto("los torneos son los del JSON (" + T.length + ")", (await textoDe(page, "#of-c-torneos")) === num(T.length));
    cierto("como árbitro principal, los del JSON", (await textoDe(page, "#of-c-principal")) === num(T.filter((t) => t.cargos.includes("Chief")).length));
    cierto("valen para AF, los del JSON", (await textoDe(page, "#of-c-af")) === num(T.filter((t) => t.af.estado !== "no").length));
    cierto("valen para AI, los del JSON", (await textoDe(page, "#of-c-ai")) === num(T.filter((t) => t.ai.estado !== "no").length));
    const fila = await page.$eval("#of-tabla tbody tr", (tr) => ({
      fide: tr.querySelector("a").href, estado: tr.children[7].querySelector(".of-estado").textContent, porque: tr.children[7].querySelector(".of-detalle").textContent
    }));
    cierto("cada torneo enlaza a su ficha de FIDE", /^https:\/\/ratings\.fide\.com\/tournament_information\.phtml\?event=\d+$/.test(fila.fide), fila.fide);
    cierto("la norma va escrita con su porqué", fila.estado.length > 0 && fila.porque.length > 0, JSON.stringify(fila));
    cierto("hay torneos enlazados a chess-results", (await page.$$("#of-tabla a[href*='chess-results.com/tnr']")).length > 0);
    cierto("muestra 100 y ofrece más", (await page.$$("#of-tabla tbody tr")).length === Math.min(100, T.length) && (T.length <= 100 || await page.$eval("#of-mas", (b) => b.checkVisibility())));
    await page.click("#of-tabla thead button[data-col='ai']");
    const primero = await page.$eval("#of-tabla tbody tr", (tr) => tr.children[8].querySelector(".of-estado").textContent);
    cierto("ordenar por norma de AI pone primero los que valen", primero === "Vale" || !T.some((t) => t.ai.estado === "si"), primero);
    const [bajada] = await Promise.all([page.waitForEvent("download"), page.click("#of-excel")]);
    cierto("«Descargar en Excel» baja un .xlsx", bajada.suggestedFilename() === "oscar-angulo-fide-normas.xlsx");
    const sobra = await page.evaluate(() => document.documentElement.scrollHeight - (document.querySelector("footer").getBoundingClientRect().bottom + scrollY));
    cierto("la página termina en el pie", Math.abs(sobra) < 4, "sobran " + sobra + " px");
    cierto("sin errores de la página", errores.length === 0, errores.join("; "));
    await ctx.close();
  }

  console.log("Los filtros");
  {
    const { ctx, page } = await abrir();
    await page.selectOption("#of-ai", "vale");
    cierto("«Norma de AI: Vale» deja los del JSON (" + valeAI.length + ")", (await textoDe(page, "#of-c-torneos")) === num(valeAI.length));
    const estados = await page.$$eval("#of-tabla tbody tr", (trs) => trs.map((tr) => tr.children[8].querySelector(".of-estado").textContent));
    cierto("y cada fila lo dice escrito", estados.length === valeAI.length && estados.every((e) => /^Vale/.test(e)), estados.join(" | "));
    cierto("el filtro va en la dirección", new URL(page.url()).searchParams.get("ai") === "vale", page.url());
    await page.click("#of-quitar");
    cierto("«Quitar los filtros» vuelve a todo y se esconde", (await textoDe(page, "#of-c-torneos")) === num(T.length) && !new URL(page.url()).search && !(await page.$eval("#of-quitar", (b) => b.checkVisibility())));
    const organizador = page.locator("#of-por-cargo button", { hasText: "Organizador" });
    if (await organizador.count()) {
      await organizador.click();
      cierto("tocar «Organizador» pone el filtro (aria-pressed)", (await organizador.getAttribute("aria-pressed")) === "true" && (await textoDe(page, "#of-c-torneos")) === num(T.filter((t) => t.cargos.includes("Organizer")).length));
      await organizador.click();
      cierto("tocarla de nuevo lo quita", (await organizador.getAttribute("aria-pressed")) === "false" && !new URL(page.url()).search);
    }
    await ctx.close();
    const anio = Math.max(...T.map((t) => t.anio));
    const enlace = await abrir("?af=vale&cargo=Chief&desde=" + anio + "&hasta=" + anio);
    const esperado = T.filter((t) => VALE.includes(t.af.estado) && t.cargos.includes("Chief") && t.anio === anio).length;
    cierto("un enlace con filtros abre esa vista (" + esperado + ")", (await textoDe(enlace.page, "#of-c-torneos")) === num(esperado) && (await enlace.page.$eval("#of-cargo", (s) => s.value)) === "Chief");
    await enlace.ctx.close();
    const otro = await abrir("?ai=quizas&cargo=Rey&desde=1900&hasta=x");
    cierto("un filtro que no existe se ignora", (await textoDe(otro.page, "#of-c-torneos")) === num(T.length) && !(await otro.page.$eval("#of-quitar", (b) => b.checkVisibility())));
    await otro.ctx.close();
  }

  console.log("Celular y modo oscuro");
  {
    const { ctx, page } = await abrir("", { viewport: { width: 400, height: 800 } });
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    cierto("a 400 px no hay desplazamiento horizontal", ancho <= 400, "scrollWidth " + ancho);
    await ctx.close();
    const oscuro = await abrir("", { colorScheme: "dark" });
    const fondo = await oscuro.page.$eval(".ae-tarjeta", (n) => getComputedStyle(n).backgroundColor);
    cierto("en modo oscuro la tarjeta no queda blanca", fondo !== "rgb(255, 255, 255)", fondo);
    await oscuro.ctx.close();
  }

  console.log("Sin datos");
  {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    await ctx.route("**/data/oscar-angulo-fide.json*", (r) => r.fulfill({ status: 500, body: "" }));
    const page = await ctx.newPage();
    await page.goto(PAGINA, { waitUntil: "load" });
    await page.waitForTimeout(800);
    cierto("si el JSON falla, la página lo dice", (await textoDe(page, "#of-tesis")).startsWith("No se pudieron cargar los datos"));
    await ctx.close();
  }

  await browser.close();
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
