/* «Torneos en Pareo Integral»: seguir a un jugador (js/torneos-pareo-pagina.js).
 *
 * Sin cuenta: quien mira marca a un jugador desde su ficha y la página lo pone
 * arriba en cada torneo donde juega y en la portada. Lo que se prueba, porque
 * se rompe sin dar ningún error:
 *   - el botón dice si ya lo sigues (aria-pressed) y lo guarda en el navegador;
 *   - el torneo trae «Los jugadores que sigues» con su puesto y su mesa;
 *   - su fila de la clasificación y de la ronda lleva la estrella escrita (y
 *     «lo sigues» para el lector), y «Solo las mesas de los jugadores que
 *     sigo» deja solo las suyas, medido con lo que se VE;
 *   - la portada busca sus torneos por el nombre exacto y los muestra;
 *   - dejar de seguir lo saca, y un almacenamiento roto o bloqueado no rompe
 *     la página.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-seguir.js
 */
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const PP = require(path.join(RAIZ, "js/pareo/publicar.js"));

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};
const CLAVE = "torneos-pareo.seguidos";
const ID1 = "44444444-4444-4444-8444-444444444444";
const ID2 = "77777777-7777-4777-8777-777777777777";

// Seis jugadores; ronda 1 jugada: en la mesa 2, PRUEBA E con blancas le gana a PRUEBA B.
function torneo(nombre, ids) {
  const t = T.nuevo({ nombre, rondasTotales: 3, mesaInicial: 1, fechaInicio: "2026-10-22",
    jugadores: ids.map((id, k) => ({ id, nombre: "PRUEBA " + id.toUpperCase(), elo: 1900 - 100 * k, institucion: "LICEO " + id.toUpperCase() })) });
  t.rondas = [{ mesas: [{ b: ids[0], n: ids[3], r: "1-0" }, { b: ids[4], n: ids[1], r: "1-0" }, { b: ids[2], n: ids[5], r: "=" }], ausencias: {} }];
  return t;
}
const fila = (id, t, actualizado) => ({ id, nombre: t.nombre, evento: "", lugar: "", fecha: "2026-10-22", rondas: 1, rondas_total: 3,
  jugadores: t.jugadores.length, actualizado, datos: PP.datosPublicos(t) });
const FILAS = [
  fila(ID1, torneo("PRUEBA ABIERTO", ["a", "b", "c", "d", "e", "f"]), "2026-10-22T15:00:00Z"),
  // En el segundo, PRUEBA E es el «c» (otro id, el mismo nombre).
  fila(ID2, torneo("PRUEBA OTRO", ["g", "h", "e", "i", "j", "k"]), "2026-10-20T15:00:00Z"),
];

// El doble de la tabla pública: filtra de verdad por id y por `datos=cs.` (el nombre exacto).
async function dobleTabla(page) {
  const pedidos = [];
  await page.route("**/rest/v1/pareo_publicados**", async (route) => {
    const u = new URL(route.request().url());
    const sel = u.searchParams.get("select") || "";
    pedidos.push(u.search);
    const columnas = (f) => require("./lib/pareo-pruebas").columnasPedidas(sel, f);
    const json = (status, x) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(x) });
    let filas = FILAS;
    const id = u.searchParams.get("id");
    if (id && id.startsWith("eq.")) filas = filas.filter((x) => x.id === id.slice(3));
    if (id && id.startsWith("neq.")) filas = filas.filter((x) => x.id !== id.slice(4));
    const cs = u.searchParams.get("datos");
    if (cs && cs.startsWith("cs.")) {
      const nombre = JSON.parse(cs.slice(3)).jugadores[0].nombre;
      filas = filas.filter((x) => x.datos.jugadores.some((j) => j.nombre === nombre));
    }
    if (/vnd\.pgrst\.object/.test(route.request().headers().accept || "")) return filas[0] ? json(200, columnas(filas[0])) : json(406, { code: "PGRST116" });
    return json(200, filas.map(columnas));
  });
  // public.pareo_torneos_de: por la huella o por el nombre sin tildes ni mayúsculas, del más reciente.
  const clave = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  await page.route("**/rest/v1/rpc/pareo_torneos_de", (route) => {
    const a = JSON.parse(route.request().postData() || "{}");
    pedidos.push("rpc:" + JSON.stringify(a));
    const filas = FILAS.filter((f) => f.datos.jugadores.some((j) => (a.p_ident && j.ident === a.p_ident) || clave(j.nombre) === clave(a.p_nombre)));
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(filas) });
  });
  return pedidos;
}

async function abrir(browser, hash, antes) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  if (antes) await antes(page);
  const pedidos = await dobleTabla(page);
  await require("./lib/pareo-pruebas").dobleListaPareo(page, FILAS);
  await page.goto(BASE + "/torneos-pareo.html" + hash, { waitUntil: "networkidle" });
  return { ctx, page, errores, pedidos };
}
const visibles = (page, sel) => page.$$eval(sel, (l) => l.filter((x) => x.checkVisibility()).length);

async function pruebaSeguir(browser) {
  console.log("\n=== Seguir desde la ficha del jugador ===");
  const { ctx, page, errores, pedidos } = await abrir(browser, "#t=" + ID1 + "&v=jugadores&j=e");
  await page.waitForSelector("#tp-seguir");
  igual("el botón empieza sin seguir", [await page.getAttribute("#tp-seguir", "aria-pressed"), (await page.textContent("#tp-seguir")).trim()], ["false", "☆ Seguir a PRUEBA E"]);
  ok(!(await page.$("#tp-mis-jugadores")), "sin nadie seguido, no hay caja de «Los jugadores que sigues»");
  await page.click("#tp-seguir");
  await page.waitForSelector('#tp-seguir[aria-pressed="true"]');
  igual("lo sigue, lo guarda en el navegador y el foco se queda en el botón", [await page.evaluate((k) => localStorage.getItem(k), CLAVE), await page.evaluate(() => document.activeElement.id)], ['["PRUEBA E"]', "tp-seguir"]);
  ok(/Ahora sigues a PRUEBA E/.test(await page.textContent("#tp-seguir-estado")), "y lo dice para el lector de pantalla");
  const mis = await page.textContent("#tp-mis-jugadores");
  ok(/PRUEBA E · Puesto 1 con 1 punto tras la ronda 1 · Ronda 1: mesa 2, con blancas contra PRUEBA B \(1\)/.test(mis), "arriba del torneo: su puesto y su mesa", mis);
  ok(await page.isVisible("#tp-mis-jugadores"), "y se ve");

  console.log("\n=== Su fila, marcada ===");
  await page.click('nav[aria-label="Partes del torneo"] >> text=Clasificación');
  await page.waitForSelector("#tp-tabla-clas");
  igual("en la clasificación, solo su fila lleva la marca", await page.$$eval("#tp-tabla-clas tr[data-seguido]", (l) => l.map((x) => x.dataset.id)), ["e"]);
  const texto = await page.$eval('#tp-tabla-clas tr[data-id="e"]', (x) => x.textContent);
  ok(/★/.test(texto) && /\(lo sigues\)/.test(texto), "con la estrella escrita y «lo sigues» para el lector (no solo un color)", texto);
  await page.click('nav[aria-label="Partes del torneo"] >> text=Rondas');
  await page.waitForSelector("#tp-solo-mios");
  igual("la ronda tiene sus tres mesas a la vista", await visibles(page, "#tp-tabla-ronda tbody tr"), 3);
  await page.check("#tp-solo-mios");
  igual("«Solo las mesas de los jugadores que sigo» deja la suya", [await visibles(page, "#tp-tabla-ronda tbody tr"), await page.$eval("#tp-tabla-ronda tbody tr:not([hidden])", (x) => x.dataset.mesa)], [1, "2"]);

  console.log("\n=== La portada ===");
  await page.click("text=← Todos los torneos");
  await page.waitForSelector('[data-sigo="PRUEBA E"] [data-torneo-de]');
  ok(await page.isVisible("#tp-seguidos-caja"), "la portada trae «Los jugadores que sigues»");
  igual("con sus torneos, buscados por el nombre exacto (también donde tiene otro número)", await page.$$eval('[data-sigo="PRUEBA E"] [data-torneo-de]', (l) => l.map((x) => x.dataset.torneoDe.slice(0, 1))), ["4", "7"]);
  ok(pedidos.some((q) => /datos=cs\./.test(q) && /PRUEBA(%20|\+| )E/.test(decodeURIComponent(q))), "la búsqueda va por el nombre en la base, no bajando todos los torneos");
  const otro = await page.textContent('[data-torneo-de="' + ID2 + '"]');
  ok(/PRUEBA OTRO/.test(otro) && /mesa 3, con blancas contra PRUEBA K \(½\)/.test(otro), "y en cada uno, su mesa y lo que hizo", otro);
  igual("el enlace lleva a su ficha en ese torneo", await page.getAttribute('[data-torneo-de="' + ID2 + '"] a', "href"), "#t=" + ID2 + "&v=jugadores&j=e");
  const cuantas = pedidos.filter((q) => /datos=cs\./.test(q) && !/id=neq/.test(q)).length;
  await page.click('[data-torneo-de="' + ID2 + '"] a');
  await page.waitForSelector("#tp-seguir");
  await page.click("text=← Todos los torneos");
  await page.waitForSelector('[data-sigo="PRUEBA E"] [data-torneo-de]');
  await page.fill("#tp-buscar", "PRUEBA");
  igual("volver a la portada o escribir en el buscador no vuelve a buscar sus torneos", pedidos.filter((q) => /datos=cs\./.test(q) && !/id=neq/.test(q)).length, cuantas);
  await page.click('[data-dejar="PRUEBA E"]');
  await page.waitForFunction(() => document.getElementById("tp-seguidos-caja").hidden);
  igual("dejar de seguir lo saca de la portada y del navegador", [await page.isVisible("#tp-seguidos-caja"), await page.evaluate((k) => localStorage.getItem(k), CLAVE)], [false, "[]"]);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaAlmacenamiento(browser) {
  console.log("\n=== Un almacenamiento roto o bloqueado ===");
  {
    const { ctx, page, errores } = await abrir(browser, "", (p) => p.addInitScript((k) => localStorage.setItem(k, "{no es json"), CLAVE));
    await page.waitForSelector("#tp-lista li");
    ok(!(await page.isVisible("#tp-seguidos-caja")) && !errores.length, "lo guardado que no se entiende no rompe la portada", errores.join(" | "));
    await ctx.close();
  }
  {
    const { ctx, page, errores } = await abrir(browser, "#t=" + ID1 + "&v=jugadores&j=e", (p) => p.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new Error("bloqueado"); };
      Storage.prototype.setItem = () => { throw new Error("bloqueado"); };
    }));
    await page.waitForSelector("#tp-seguir");
    await page.click("#tp-seguir");
    await page.waitForSelector('#tp-seguir[aria-pressed="true"]');
    ok(await page.isVisible("#tp-mis-jugadores"), "sin almacenamiento, lo sigue mientras dure la pestaña");
    ok(!errores.length, "sin errores en la página", errores.join(" | "));
    await ctx.close();
  }
}

// La ficha de un jugador en todos sus torneos (#p=<nombre>).
async function pruebaFicha(browser) {
  console.log("\n=== Su ficha en todos los torneos ===");
  {
    const { ctx, page } = await abrir(browser, "#t=" + ID1 + "&v=jugadores&j=e");
    await page.waitForSelector("#tp-ficha-todos");
    igual("la ficha del torneo enlaza a la de todos sus torneos", await page.getAttribute("#tp-ficha-todos", "href"), "#p=PRUEBA+E");
    await ctx.close();
  }
  const { ctx, page, errores, pedidos } = await abrir(browser, "#p=PRUEBA+E");
  await page.waitForSelector("#tp-ficha-tabla");
  igual("su nombre de título, con el foco", [await page.textContent("#tp-titulo"), await page.evaluate(() => document.activeElement.id)], ["PRUEBA E", "tp-titulo"]);
  const pedido = pedidos.find((q) => /^rpc:/.test(q)) || "";
  ok(/"p_nombre":"PRUEBA E"/.test(pedido), "los pide a la base por su nombre (public.pareo_torneos_de)", pedido);
  igual("un torneo por fila, con su enlace a su ficha en ese torneo", await page.$$eval("#tp-ficha-tabla tbody tr", (l) => l.map((x) => x.querySelector("a").getAttribute("href"))),
    ["#t=" + ID1 + "&v=jugadores&j=e", "#t=" + ID2 + "&v=jugadores&j=e"]);
  const celdas = await page.$$eval("#tp-ficha-tabla tbody tr", (l) => l.map((x) => [...x.querySelectorAll("td")].map((td) => td.textContent)));
  igual("puesto, puntos, ganadas · tablas · perdidas y el Elo que tenía en cada uno",
    celdas.map((c) => [c[2], c[3], c[4], c[5]]), [["1 de 6", "1 de 1", "1 · 0 · 0", "1500"], ["3 de 6", "½ de 1", "0 · 1 · 0", "1700"]]);
  ok(/^\+\d/.test(celdas[0][7]) && /^-\d/.test(celdas[1][7].replace("−", "-")), "el ± Elo con su signo: gana a uno de más Elo suma, empatar con uno de menos resta", JSON.stringify(celdas.map((c) => c[7])));
  const resumen = await page.$$eval("#tp-ficha-resumen > div", (l) => Object.fromEntries(l.map((d) => [d.querySelector("dt").textContent, d.querySelector("dd").textContent])));
  igual("el resumen: torneos, partidas, resultados y el Elo de su primer torneo al último",
    [resumen.Torneos, resumen.Partidas, resumen["Ganadas, tablas y perdidas"], resumen.Elo], ["2", "2", "1 · 1 · 0", "De 1700 a 1500"]);
  const num = (t) => Number(String(t).replace("−", "-").replace(",", "."));
  ok(Math.abs(num(resumen["Elo que suman sus torneos (cálculo de FIDE)"]) - (num(celdas[0][7]) + num(celdas[1][7]))) < 0.11, "y lo que suman sus torneos es la suma de la columna", JSON.stringify(resumen));
  await page.click("#tp-seguir");
  await page.waitForSelector('#tp-seguir[aria-pressed="true"]');
  ok(await page.evaluate((k) => localStorage.getItem(k), CLAVE) === '["PRUEBA E"]', "desde la ficha también se lo sigue");
  await page.evaluate(() => { window.__copiado = []; navigator.clipboard.writeText = async (t) => { window.__copiado.push(t); }; });
  await page.click("#tp-ficha-copiar");
  igual("y se copia el enlace de su ficha", await page.evaluate(() => window.__copiado), ["https://ajedrez-integral.com/torneos-pareo.html#p=PRUEBA+E"]);
  ok(!errores.length, "sin errores en la consola", errores.join(" | "));
  await page.goto("about:blank");
  await page.goto(BASE + "/torneos-pareo.html#p=NADIE+ASI", { waitUntil: "networkidle" });
  await page.waitForSelector("#tp-ficha-vacia");
  ok(/No aparece en ningún torneo/.test(await page.textContent("#tp-ficha-vacia")), "un nombre que no está lo dice, sin tabla vacía");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaSeguir(browser);
    await pruebaFicha(browser);
    await pruebaAlmacenamiento(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
