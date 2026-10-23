/* «Torneos en Pareo Integral»: la parte «También en Costa Rica», con los
 * torneos que se anuncian en ajedrezcostarica.com (public.torneos_externos,
 * acá un doble). Lo que se prueba, porque se rompe sin dar ningún error:
 *   - salen los que vienen, del más cercano al más lejano, y no los que ya
 *     terminaron (aunque la tabla todavía los tenga hasta el día siguiente);
 *   - el día es el de Costa Rica: un torneo que empieza a las 9 de la noche
 *     del 1.° de noviembre (las 3 de la mañana del 2 en UTC) es del 1.°,
 *     también en el calendario que se baja;
 *   - cada fila lleva a su ficha de allá en otra pestaña, y lo dice;
 *   - sus datos van escritos con su etiqueta (Elo, ritmo con el tiempo, costo);
 *   - los filtros de la portada los filtran también, y con uno que allá no
 *     existe (el lugar, «en curso», el sello) la parte se calla;
 *   - lo que viene de afuera se pinta como texto;
 *   - sin la tabla (o si falla) la portada sigue igual;
 *   - en el celular nada se sale de la pantalla.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-torneos-externos-pagina.js
 */
const { chromium } = require("playwright");
const { columnasPedidas, dobleListaPareo } = require("./lib/pareo-pruebas");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";

let fallos = 0;
const ok = (c, m, detalle) => {
  if (c) console.log("  ✓ " + m);
  else { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; }
};
const igual = (m, a, b) => ok(JSON.stringify(a) === JSON.stringify(b), m, "esperaba " + JSON.stringify(b) + ", salió " + JSON.stringify(a));

const PROPIO = [{ id: "p1", nombre: "PRUEBA PROPIO", evento: "", lugar: "San José", fecha: "2026-10-20", rondas: 5, rondas_total: 5, jugadores: 10, actualizado: "2026-10-20T20:00:00Z",
  datos: { nombre: "PRUEBA PROPIO", ritmo: "90 min + 30 s", ritmoTipo: "clasico", federacion: "CRC", sistema: "suizo", tipo: "individual", jugadores: [], rondas: [] } }];

const ext = (id, o) => Object.assign({ fuente: "ajedrezcostarica", id_externo: id, titulo: "PRUEBA " + id, inicio: "2026-11-21T15:00:00+00:00", fin: "2026-11-21T23:00:00+00:00",
  provincia: "Cartago", lugar: "Salón PRUEBA", ritmo: "rapido", minutos: 10, incremento: 2, elo: "fide", precio: 6000, moneda: "CRC", modalidad: "presencial",
  formato: "individual", organizador: "Club PRUEBA", inscripcion_abierta: false, chess_results: "", url: "https://ajedrezcostarica.com/es/tournaments/" + id, visto: "2026-10-23T11:13:00+00:00" }, o);
const EXTERNOS = [
  ext(901, { titulo: "PRUEBA Clásico de diciembre", inicio: "2026-12-20T14:00:00+00:00", fin: "2026-12-20T22:00:00+00:00", ritmo: "clasico", minutos: 90, incremento: 30, elo: "ambos", precio: 100, moneda: "USD", inscripcion_abierta: true }),
  // Ya terminó (ayer): la tabla lo guarda hasta que la función lo borre.
  ext(902, { titulo: "PRUEBA Ya jugado", inicio: "2026-10-22T14:00:00+00:00", fin: "2026-10-22T22:00:00+00:00" }),
  // 21:00 del 1.° de noviembre en Costa Rica = 03:00 del 2 en UTC.
  ext(903, { titulo: "PRUEBA <img src=x onerror=alert(1)> Nocturno", inicio: "2026-11-02T03:00:00+00:00", fin: "2026-11-02T05:00:00+00:00", provincia: "San José", lugar: "Paquera", ritmo: "blitz", minutos: 3, incremento: 2, elo: "nacional", precio: 0, formato: "equipos" }),
  ext(904, { titulo: "PRUEBA Rápido de noviembre" }),
];

async function abrir(browser, viewport, opciones) {
  const o = Object.assign({ externos: EXTERNOS, falla: false }, opciones);
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport, timezoneId: "Asia/Tokyo", acceptDownloads: true });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.clock.setFixedTime(new Date("2026-10-23T18:00:00Z"));
  await page.route("**/rest/v1/pareo_publicados**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "[]" }));
  await page.route("**/rest/v1/pareo_organizadores**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "[]" }));
  const pedidos = [];
  // public.torneos_externos_lista(): ordenados por inicio y, cada uno, con el
  // torneo de Pareo Integral que es el mismo (repetido_de), si lo hay.
  await page.route("**/rest/v1/rpc/torneos_externos_lista**", (route) => {
    pedidos.push({ metodo: route.request().method() });
    if (o.falla) return route.fulfill({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"message":"caída"}' });
    const filas = o.externos.slice().sort((a, b) => a.inicio.localeCompare(b.inicio)).map((f) => { const x = Object.assign({ repetido_de: null }, f); delete x.fuente; delete x.visto; delete x.chess_results; return x; });
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(filas) });
  });
  await dobleListaPareo(page, PROPIO, { hoy: "2026-10-23" });
  await page.goto(BASE + "/torneos-pareo.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#tp-lista .tp-dia");
  return { ctx, page, errores, pedidos };
}
const visibles = (page) => page.$$eval("#tp-externos [data-externo]", (l) => l.filter((a) => a.checkVisibility()).map((a) => Number(a.dataset.externo)));
async function igualLuego(page, m, f, b) {
  let a;
  for (let i = 0; i < 50; i++) {
    a = await f();
    if (JSON.stringify(a) === JSON.stringify(b)) break;
    await page.waitForTimeout(100);
  }
  igual(m, a, b);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const { ctx, page, errores, pedidos } = await abrir(browser, { width: 1400, height: 900 });

  console.log("\n=== Lo que se ve ===");
  ok(await page.locator("#tp-externos-titulo").evaluate((h) => h.checkVisibility()), "la parte «También en Costa Rica» se ve");
  ok(/ajedrezcostarica\.com/.test(await page.textContent("#tp-externos-caja")), "y dice de dónde salen");
  igual("los que vienen, del más cercano al más lejano; el que ya terminó no sale", await visibles(page), [903, 904, 901]);
  igual("el día es el de Costa Rica (el nocturno es del 1.° de noviembre, no del 2)",
    (await page.textContent('[data-externo="903"] .tp-fecha .sr-only')).trim(), "1 de noviembre de 2026.");
  const a = await page.$eval('[data-externo="901"]', (x) => ({ href: x.getAttribute("href"), target: x.target, rel: x.rel, dice: /otra pestaña/.test(x.textContent) }));
  igual("cada fila lleva a su ficha de allá, en otra pestaña, y lo dice", a, { href: "https://ajedrezcostarica.com/es/tournaments/901", target: "_blank", rel: "noopener", dice: true });
  const datos = (id) => page.$eval(`[data-externo="${id}"]`, (x) => Object.fromEntries([...x.querySelectorAll(".tp-dato")].map((d) => [d.querySelector(".tp-dato-etiqueta").textContent, d.querySelector(".tp-dato-valor").textContent])));
  const d901 = await datos(901);
  igual("sus datos, escritos: inscripción, Elo (FIDE y Nacional se lee FIDE), ritmo con su tiempo y modalidad",
    [d901["Inscripción"], d901.Elo, d901.Ritmo, d901.Modalidad], ["Abierta", "FIDE", "Clásico · 90 min + 30 s", "Individual"]);
  ok(/100/.test(d901.Costo) && /US|\$/.test(d901.Costo), "el costo con su moneda", d901.Costo);
  const d903 = await datos(903);
  igual("otro: relámpago, solo Nacional, gratis, por equipos", [d903.Ritmo, d903.Elo, d903.Costo, d903.Modalidad], ["Relámpago · 3 min + 2 s", "Nacional", "Gratis", "Por equipos"]);
  ok(/Organiza: Club PRUEBA/.test(await page.textContent('[data-externo="904"]')), "quién organiza");
  ok(await page.$('[data-externo="903"] img') === null && /<img src=x/.test(await page.textContent('[data-externo="903"] .tp-nombre')), "un nombre con HTML se pinta como texto");
  ok(pedidos.length === 1, "se pide una vez (public.torneos_externos_lista, que ya los trae ordenados y con tope)", JSON.stringify(pedidos));

  igual("arriba, «Suscribirme al calendario de torneos» (el que arma el worker)",
    await page.getAttribute("#tp-suscribir-caja-abrir", "href"), "webcal://ajedrez-integral.com/calendario/torneos.ics");

  console.log("\n=== Al calendario ===");
  igual("el botón dice cuántos agrega", (await page.textContent("#tp-externos-calendario")).trim(), "📅 Agregar estos 3 torneos a mi calendario");
  const [descarga] = await Promise.all([page.waitForEvent("download"), page.click("#tp-externos-calendario")]);
  const ics = require("fs").readFileSync(await descarga.path(), "utf8");
  igual("un evento por torneo de los que se ven", (ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  ok(/DTSTART;VALUE=DATE:20261101/.test(ics) && !/DTSTART;VALUE=DATE:20261102/.test(ics), "el nocturno, el 1.° de noviembre (hora de Costa Rica)");
  ok(/UID:ajedrezcostarica-901@ajedrez-integral\.com/.test(ics), "con un UID fijo: bajarlo otra vez no lo duplica");
  ok(/ajedrezcostarica\.com\/es\/tournaments\/904/.test(ics.replace(/\r?\n /g, "")), "y el enlace a su ficha");

  console.log("\n=== Los filtros de la portada ===");
  await page.selectOption("#tp-f-ritmo", "clasico");
  await igualLuego(page, "por ritmo", () => visibles(page), [901]);
  await page.selectOption("#tp-f-ritmo", "");
  await page.selectOption("#tp-f-elo", "fide");
  await igualLuego(page, "solo FIDE: los de FIDE y los de FIDE y Nacional", () => visibles(page), [904, 901]);
  await page.selectOption("#tp-f-elo", "nacional");
  await igualLuego(page, "solo Nacional", () => visibles(page), [903]);
  await page.selectOption("#tp-f-elo", "");
  await page.check("#tp-f-abierta");
  await igualLuego(page, "inscripción abierta", () => visibles(page), [901]);
  await page.uncheck("#tp-f-abierta");
  await page.fill("#tp-buscar", "paquera");
  await igualLuego(page, "la búsqueda mira también el lugar (sin tildes ni mayúsculas)", () => visibles(page), [903]);
  await page.fill("#tp-buscar", "no existe nada así");
  await igualLuego(page, "sin coincidencias, la parte entera se esconde", () => page.locator("#tp-externos-caja").evaluate((c) => c.checkVisibility()), false);
  await page.fill("#tp-buscar", "");
  await igualLuego(page, "y vuelve", () => visibles(page), [903, 904, 901]);
  await page.check("#tp-f-curso");
  await igualLuego(page, "con «Solo en curso» (que allá no existe) se calla", () => page.locator("#tp-externos-caja").evaluate((c) => c.checkVisibility()), false);
  await page.uncheck("#tp-f-curso");
  ok(!errores.length, "sin errores en la consola", errores.join(" | "));
  await ctx.close();

  console.log("\n=== Sin la tabla ===");
  {
    const r = await abrir(browser, { width: 1400, height: 900 }, { falla: true });
    ok(!(await r.page.locator("#tp-externos-caja").evaluate((c) => c.checkVisibility())), "si la tabla falla, la parte no aparece");
    ok((await r.page.$$("#tp-lista [data-torneo]")).length === 1, "y la portada sigue con sus torneos");
    ok(!r.errores.length, "sin errores en la consola", r.errores.join(" | "));
    await r.ctx.close();
  }

  console.log("\n=== En el celular ===");
  {
    const r = await abrir(browser, { width: 360, height: 740 });
    const ancho = await r.page.evaluate(() => document.documentElement.scrollWidth);
    ok(ancho <= 360, "nada se sale de la pantalla", ancho + " px");
    const sale = await r.page.$$eval("#tp-externos .tp-fila", (l) => l.filter((x) => x.getBoundingClientRect().right > 361).length);
    ok(!sale, "ninguna fila se pasa del borde");
    await r.ctx.close();
  }

  await browser.close();
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
