/* Pareo Integral: las incidencias de cada jugador marcadas en el pareo
 * (js/pareo/evento.js: marcasIncidencias; js/pareo/pagina.js; js/pareo/ver.js).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - «i» por cada jugada ilegal y «!» por cada otra irregularidad, junto al
 *     nombre, contadas por ronda (es decir, por partida);
 *   - con dos ilegales, el detalle dice que pierde (art. 7.5.5);
 *   - el detalle se abre al tocar la marca y no estorba cerrado;
 *   - desde el celular, el adjunto anota la mesa, el jugador (de esa mesa:
 *     no otro), el tipo y el artículo, y ve las marcas;
 *   - las correcciones y las apelaciones no marcan a nadie.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-marcas.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const V = require(path.join(RAIZ, "js/pareo/evento.js"));
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};
const dialogo = 'dialog[data-avisos="formulario"][open]';

function pruebaSinNavegador() {
  console.log("\n=== Las marcas ===");
  const R = { incidencias: [
    { tipo: "reclamo", jugador: "a", articulo: "ilegal", texto: "x" },
    { tipo: "sancion", jugador: "a", articulo: "celular", texto: "y" },
    { tipo: "reclamo", jugador: "a", articulo: "ilegal", texto: "z" },
    { tipo: "correccion", jugador: "b", texto: "no marca" },
    { tipo: "apelacion", jugador: "b", texto: "tampoco" },
    { tipo: "decision", texto: "sin jugador" },
  ] };
  const m = V.marcasIncidencias(R);
  igual("dos ilegales y una irregularidad: «ii!»", V.textoMarca(m.get("a")), "ii!");
  ok(!m.has("b"), "las correcciones y las apelaciones no marcan");
  igual("y sin incidencias, nada", V.textoMarca(m.get("c")), "");
}

async function pruebaPagina(browser) {
  let { ctx, page, errores } = await P.abrirPagina(browser, BASE);
  console.log("\n=== En el pareo del árbitro principal ===");
  await page.click('[data-ficha="jugadores"]');
  await page.click("#pi-pegar-caja summary");
  await page.fill("#pi-pegar", ["PRUEBA UNO", "PRUEBA DOS", "PRUEBA TRES", "PRUEBA CUATRO"].join("\n"));
  await page.click("#pi-pegar-agregar");
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-emparejar");
  await page.waitForSelector("#pi-mesa-0");
  let todos = await P.leerTodos(page);
  const m1 = todos[0].rondas[0].mesas[0];
  const nombre = (id) => todos[0].jugadores.find((j) => j.id === id).nombre;
  ok(await page.$eval("#pi-inc-jugador", (s) => s.disabled), "sin mesa, no se elige jugador");
  await page.selectOption("#pi-inc-mesa", "1");
  const opciones = await page.$$eval("#pi-inc-jugador option", (l) => l.map((o) => o.value));
  igual("con la mesa, solo los dos que la juegan", opciones, ["", m1.b, m1.n]);
  const anotar = async (articulo, texto) => {
    await page.selectOption("#pi-inc-mesa", "1");
    await page.selectOption("#pi-inc-jugador", m1.b);
    await page.selectOption("#pi-inc-tipo", "reclamo");
    await page.selectOption("#pi-inc-articulo", articulo);
    await page.fill("#pi-inc-texto", texto);
    await page.click("#pi-inc-anotar");
  };
  await anotar("ilegal", "Enroque con el rey en jaque.");
  await P.esperarGuardado(page, (l) => (l[0].rondas[0].incidencias || []).length === 1);
  igual("la jugada ilegal pone una «i» junto a su nombre", await page.$eval("#pi-ronda tr[data-nombres] .pi-marca-inc", (b) => b.textContent), "i");
  ok(!(await P.vis(page, ".pi-inc-detalle")), "el detalle no se ve hasta tocarla");
  await page.click("#pi-ronda tr[data-nombres] .pi-marca-inc");
  ok(/ya hizo una jugada ilegal: con otra pierde/.test(await page.textContent(".pi-inc-fila")) && /Enroque con el rey en jaque/.test(await page.textContent(".pi-inc-fila")), "al tocarla, de qué fue y que con otra pierde", await page.textContent(".pi-inc-fila").catch(() => ""));
  igual("y dice que está abierta", await page.getAttribute("#pi-ronda tr[data-nombres] .pi-marca-inc", "aria-expanded"), "true");
  await anotar("ilegal", "Movió el alfil como torre.");
  await P.esperarGuardado(page, (l) => (l[0].rondas[0].incidencias || []).length === 2);
  igual("dos: «ii»", await page.$eval("#pi-ronda tr[data-nombres] .pi-marca-inc", (b) => b.textContent), "ii");
  await page.click("#pi-ronda tr[data-nombres] .pi-marca-inc");
  ok(/segunda jugada ilegal: pierde la partida \(art\. 7\.5\.5\)/.test(await page.textContent(".pi-inc-fila")), "con la segunda, que pierde la partida");

  console.log("\n=== Lo que anota el adjunto desde el celular ===");
  await page.click("#pi-adjunto");
  await page.waitForSelector(dialogo);
  await page.fill(dialogo + ' [name="arbitro"]', "PRUEBA ADJUNTA");
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForSelector(".pi-adjunto-url");
  const codigo = (await page.textContent(".pi-adjunto-url")).split("#adjunto=")[1].split("&")[0];
  const canal = "pareo-adjunto-" + codigo;
  // Un lado que no existe: la nota entra, pero sin jugador.
  await page.evaluate((c) => window.__llega(c, "nota", { autor: "PRUEBA ADJUNTA", texto: "Lado raro.", mesa: 1, lado: "t9b", tipo: "reclamo" }), canal);
  await page.evaluate((c) => window.__llega(c, "nota", { autor: "PRUEBA ADJUNTA", texto: "Le sonó el celular.", mesa: 1, lado: "n", tipo: "sancion", articulo: "celular" }), canal);
  todos = await P.esperarGuardado(page, (l) => (l[0].rondas[0].incidencias || []).length === 4);
  const [raro, cel] = todos[0].rondas[0].incidencias.slice(2);
  ok(!raro.jugador, "un jugador que no es de su mesa no se anota");
  igual("la del celular entra con su tipo, su artículo y su jugador", [cel.tipo, cel.articulo, cel.jugador, cel.autor], ["sancion", "celular", m1.n, "PRUEBA ADJUNTA"]);
  igual("y su marca: «!»", await page.$$eval("#pi-ronda tr[data-nombres]:first-child .pi-marca-inc", (l) => l.map((b) => b.textContent)), ["ii", "!"]);
  const estado = await page.evaluate((c) => window.__enviados.filter((x) => x.canal === c && x.evento === "estado").pop().payload, canal);
  igual("al celular le llegan las marcas", [estado.mesas[0].mb.t, estado.mesas[0].mn.t, estado.mesas[0].mb.pierde], ["ii", "!", true]);
  igual("y a quién puede anotarle (sin los ids)", estado.mesas[0].quien.map((x) => x.k), ["b", "n"]);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== En el celular del adjunto ===");
  ({ ctx, page, errores } = await P.abrirPagina(browser, BASE, "#adjunto=prueba999&m=1-5"));
  await page.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir"));
  await page.evaluate((e) => window.__llega("pareo-adjunto-prueba999", "estado", e), estado);
  await page.waitForSelector('[data-mesa="1"] .pi-marca-inc');
  igual("ve las marcas junto a los nombres", await page.$$eval('[data-mesa="1"] .pi-marca-inc', (l) => l.map((b) => b.textContent)), ["ii", "!"]);
  await page.click('[data-mesa="1"] .pi-marca-inc');
  ok(/pierde la partida/.test(await page.textContent('[data-mesa="1"]')), "y al tocar, el detalle");
  await page.fill("#pi-adj-autor", "PRUEBA ADJUNTA");
  await page.selectOption("#pi-adj-nota-mesa", "1");
  ok(!(await page.$eval("#pi-adj-nota-jugador", (s) => s.disabled)), "con la mesa, se elige el jugador");
  await page.selectOption("#pi-adj-nota-jugador", "b");
  await page.selectOption("#pi-adj-nota-tipo", "reclamo");
  await page.selectOption("#pi-adj-nota-articulo", "tocar");
  await page.fill("#pi-adj-nota", "Tocó la dama y movió el caballo.");
  await page.click("#pi-adj-nota-mandar");
  const nota = await page.evaluate(() => window.__enviados.filter((x) => x.evento === "nota").pop().payload);
  igual("manda la mesa, el jugador, el tipo y el artículo", [nota.mesa, nota.lado, nota.tipo, nota.articulo], [1, "b", "reclamo", "tocar"]);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "sin correrse de lado");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  try { pruebaSinNavegador(); } catch (e) { mal("la parte sin navegador se cayó", e.stack); }
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try { await pruebaPagina(browser); }
  catch (e) { mal("la prueba de la página se cayó", e.stack); }
  finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
