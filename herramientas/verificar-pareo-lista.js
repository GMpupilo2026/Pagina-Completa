/* «Torneos en Pareo Integral»: la lista de la portada (js/torneos-pareo-pagina.js).
 *
 * Los torneos van por día, con el encabezado del día, y cada uno en una fila
 * con columnas: la fecha (de qué día a qué día), el nombre, el lugar, si está
 * en curso, y sus datos con la etiqueta escrita arriba: inscripción,
 * participantes, rondas, sistema, ritmo y modalidad. Los torneos de un mismo
 * evento y día van juntos en una fila que se despliega. Lo que se prueba,
 * porque se rompe sin dar ningún error:
 *   - el orden: los días del más reciente al más viejo (los próximos, del más
 *     cercano), y en el día primero lo que se está jugando;
 *   - la fila del evento suma a sus participantes y se despliega con su
 *     aria-expanded, medido con lo que se VE; buscando, se abre sola;
 *   - el ritmo sale del control («90 min + 30 s» es clásico) y la inscripción
 *     abierta lo dice escrito;
 *   - la lista pide solo esos campos de `datos`, nunca el torneo entero;
 *   - en el celular nada se sale de la pantalla.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-lista.js
 */
const path = require("path");
const { chromium } = require("playwright");
const { columnasPedidas } = require("./lib/pareo-pruebas");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};

// Las filas como las guarda la base; `datos` trae solo lo que la lista lee.
const fila = (id, nombre, o) => {
  const f = Object.assign({ id, nombre, evento: "", lugar: "San José", fecha: "2026-10-20", rondas: 5, rondas_total: 5, jugadores: 10, actualizado: "2026-10-20T20:00:00Z" }, o);
  f.datos = Object.assign({ nombre, ritmo: "90 min + 30 s", fechaFin: "", federacion: "CRC", sistema: "suizo", tipo: "individual", jugadores: [], rondas: [] }, o && o.datos);
  return f;
};
const FILAS = [
  // Hoy (en la prueba): el 23 de octubre de 2026.
  fila("a1", "PRUEBA VIEJO", { fecha: "2026-10-10", datos: { ritmo: "3 + 2", sistema: "todos", tipo: "individual", federacion: "CRC", validoElo: "no" } }),
  fila("b1", "PRUEBA SUB-10", { evento: "PRUEBA FESTIVAL", lugar: "Heredia", fecha: "2026-10-22", rondas: 3, rondas_total: 7, jugadores: 26, datos: { ritmo: "15 min + 5 s", fechaFin: "2026-10-24", federacion: "CRC", sistema: "suizo", tipo: "individual", validoElo: "nacional" } }),
  fila("b2", "PRUEBA SUB-12", { evento: "PRUEBA FESTIVAL", lugar: "Heredia", fecha: "2026-10-22", rondas: 3, rondas_total: 7, jugadores: 29, datos: { ritmo: "15 min + 5 s", fechaFin: "2026-10-24", federacion: "CRC", sistema: "suizo", tipo: "individual", validoElo: "nacional" } }),
  fila("c1", "PRUEBA ABIERTO TERMINADO", { fecha: "2026-10-22", datos: { ritmo: "90 min + 30 s", fechaFin: "2026-10-22", federacion: "CRC", sistema: "suizo", tipo: "equipos", validoElo: "fide" } }),
  fila("d1", "PRUEBA PRÓXIMO LEJOS", { fecha: "2026-12-05", rondas: 0, jugadores: 0, datos: { nombre: "PRUEBA PRÓXIMO LEJOS", ciudad: "San José", ritmo: "", federacion: "", sistema: "suizo", tipo: "individual", fechaInicio: "2026-12-05", fechaFin: "2026-12-06", rondasTotales: 5, validoElo: "fide",
    anuncio: { hora: "08:30", contacto: "", texto: "" }, inscripcion: { abierta: true, hasta: "2026-12-01" }, jugadores: [], rondas: [], puntos: { victoria: 1, tablas: 0.5, derrota: 0, bye: 1 }, desempates: [] } }),
  fila("d2", "PRUEBA PRÓXIMO CERCA", { fecha: "2026-11-01", rondas: 0, rondas_total: 6, jugadores: 4, datos: { ritmo: "", federacion: "CRC", sistema: "suizo", tipo: "individual" } }),
];

async function dobleTabla(page) {
  const pedidos = [];
  await page.route("**/rest/v1/pareo_publicados**", async (route) => {
    const u = new URL(route.request().url());
    const sel = u.searchParams.get("select") || "";
    pedidos.push(sel);
    const id = u.searchParams.get("id");
    const filas = id && id.startsWith("eq.") ? FILAS.filter((f) => f.id === id.slice(3)) : FILAS;
    const objeto = /vnd\.pgrst\.object/.test(route.request().headers().accept || "");
    const cuerpo = objeto ? (filas[0] ? columnasPedidas(sel, filas[0]) : null) : filas.map((f) => columnasPedidas(sel, f));
    route.fulfill({ status: objeto && !filas[0] ? 406 : 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(cuerpo) });
  });
  return pedidos;
}

async function abrir(browser, viewport) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport, timezoneId: "Asia/Tokyo" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e) + " " + String(e.stack).slice(0, 300)));
  await page.clock.setFixedTime(new Date("2026-10-23T18:00:00Z"));
  const pedidos = await dobleTabla(page);
  await page.goto(BASE + "/torneos-pareo.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#tp-lista .tp-dia");
  return { ctx, page, errores, pedidos };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const { ctx, page, errores, pedidos } = await abrir(browser, { width: 1400, height: 900 });

  console.log("\n=== Por día, del más reciente al más viejo ===");
  igual("los días de los resultados, con su encabezado (en hora de Costa Rica, aunque la computadora esté en otra zona)",
    await page.$$eval("#tp-lista .tp-dia-titulo", (l) => l.map((h) => h.textContent)), ["Jueves, 22 de octubre de 2026", "Sábado, 10 de octubre de 2026"]);
  igual("los próximos, del más cercano al más lejano", await page.$$eval("#tp-proximos .tp-dia", (l) => l.map((s) => s.dataset.dia)), ["2026-11-01", "2026-12-05"]);
  igual("en el día, primero lo que se está jugando (el evento en curso antes del terminado)",
    await page.$$eval('#tp-lista [data-dia="2026-10-22"] .tp-filas > li', (l) => l.map((li) => li.dataset.grupo ? "evento" : li.querySelector("[data-torneo]").dataset.torneo)), ["evento", "c1"]);

  console.log("\n=== Las columnas de una fila ===");
  const datos = (sel) => page.$eval(sel, (a) => Object.fromEntries([...a.querySelectorAll(".tp-dato")].map((d) => [d.querySelector(".tp-dato-etiqueta").textContent, d.querySelector(".tp-dato-valor").textContent])));
  igual("cada dato con su etiqueta escrita", await datos('[data-torneo="c1"]'),
    { "Inscripción": "Cerrada", Participantes: "10", Rondas: "5/5", Elo: "FIDE", Sistema: "Suizo", Ritmo: "Clásico", Modalidad: "Por equipos" });
  igual("si da Elo, escrito: «Nacional», «No» o «—» si no lo dijo", [await datos('[data-torneo="a1"]').then((d) => d.Elo), await datos('[data-torneo="d2"]').then((d) => d.Elo)], ["No", "—"]);
  igual("el ritmo sale del control (3 + 2 es relámpago) y el sistema se escribe entero", await datos('[data-torneo="a1"]').then((d) => [d.Ritmo, d.Sistema]), ["Relámpago", "Todos contra todos"]);
  igual("un próximo con la inscripción abierta lo dice escrito, y cuántas rondas tendrá", await datos('[data-torneo="d1"]').then((d) => [d["Inscripción"], d.Rondas]), ["Abierta", "5"]);
  igual("de qué día a qué día, para el lector entero", (await page.textContent('[data-grupo] .tp-fecha .sr-only')).trim(), "22 de octubre de 2026 al 24 de octubre de 2026.");
  igual("y a la vista, corto", await page.$eval("[data-grupo] .tp-fecha", (f) => [...f.querySelectorAll(".tp-fecha-dia, .tp-fecha-mes")].map((x) => x.textContent)), ["22–24", "OCT"]);
  ok(/En curso/.test(await page.textContent("[data-grupo] .tp-estado")), "el evento dice que está en curso, escrito");
  ok(/Terminado/.test(await page.textContent('[data-torneo="c1"] .tp-estado')), "y el otro, que terminó");
  ok(/San José, CRC/.test(await page.textContent('[data-torneo="c1"] .tp-lugar')), "con el lugar y la federación");

  console.log("\n=== Los filtros ===");
  const todos = () => page.$$eval("#tp-portada [data-torneo]", (l) => l.filter((a) => a.checkVisibility()).map((a) => a.dataset.torneo).sort());
  igual("los lugares que hay, para elegir", await page.$$eval("#tp-f-lugar option", (l) => l.map((o) => o.textContent)), ["Todos", "Heredia", "San José"]);
  ok(!(await page.isVisible("#tp-f-quitar")), "sin filtros, no hay «Quitar filtros»");
  await page.selectOption("#tp-f-ritmo", "Rápido");
  igual("por ritmo (y el evento se abre solo)", await todos(), ["b1", "b2"]);
  await page.selectOption("#tp-f-ritmo", "");
  await page.selectOption("#tp-f-lugar", "Heredia");
  igual("por lugar", await todos(), ["b1", "b2"]);
  await page.selectOption("#tp-f-lugar", "");
  await page.selectOption("#tp-f-elo", "sin");
  igual("«Sin Elo»: los que no dan Elo y los que no lo dijeron", await todos(), ["a1", "d2"]);
  await page.selectOption("#tp-f-elo", "fide");
  igual("solo FIDE", await todos(), ["c1", "d1"]);
  await page.selectOption("#tp-f-elo", "");
  await page.check("#tp-f-abierta");
  igual("solo con la inscripción abierta", await todos(), ["d1"]);
  ok(/coincide/.test(await page.textContent("#tp-resultados-vacio")) && await page.isVisible("#tp-resultados-vacio"), "y dice que ningún jugado coincide");
  await page.uncheck("#tp-f-abierta");
  await page.check("#tp-f-curso");
  igual("solo en curso", await todos(), ["b1", "b2"]);
  igual("el conteo lo dice", await page.textContent("#tp-cuantos"), "2 de 6 torneos.");
  await page.click("#tp-f-quitar");
  igual("«Quitar filtros» los quita todos y lleva el foco al primero", [await page.$$eval("#tp-portada [data-torneo]", (l) => l.length), await page.evaluate(() => document.activeElement.id)], [6, "tp-f-ritmo"]);
  ok(!(await page.isVisible("#tp-f-quitar")), "y se esconde");
  // Que los eventos queden como estaban para lo que sigue.
  if (await page.getAttribute("[data-grupo] > button", "aria-expanded") === "true") await page.click("[data-grupo] > button");

  console.log("\n=== El evento se despliega ===");
  const grupo = "[data-grupo] > button";
  igual("la fila del evento suma a sus participantes y cuenta sus torneos", await datos(grupo).then((d) => [d.Torneos, d.Participantes, d.Ritmo]), ["2", "55", "Rápido"]);
  const visibles = () => page.$$eval("[data-grupo] [data-torneo]", (l) => l.filter((a) => a.checkVisibility()).map((a) => a.dataset.torneo));
  igual("cerrado, sus torneos no se ven", [await page.getAttribute(grupo, "aria-expanded"), await visibles()], ["false", []]);
  await page.click(grupo);
  igual("al tocarlo se ven, en orden, y lo dice", [await page.getAttribute(grupo, "aria-expanded"), await visibles()], ["true", ["b1", "b2"]]);
  igual("cada torneo del evento con sus propios datos", await datos('[data-torneo="b2"]').then((d) => [d.Participantes, d.Rondas]), ["29", "3/7"]);
  await page.fill("#tp-buscar", "x");
  await page.fill("#tp-buscar", "");
  ok(await page.getAttribute(grupo, "aria-expanded") === "true", "se queda abierto al volver a pintar la lista");
  await page.click(grupo);
  await page.fill("#tp-buscar", "sub-12");
  igual("buscando, deja solo lo que coincide", await page.$$eval("#tp-lista [data-torneo]", (l) => l.filter((a) => a.checkVisibility()).map((a) => a.dataset.torneo)), ["b2"]);
  await page.fill("#tp-buscar", "festival");
  igual("y si coinciden varios del evento, se abre solo", await visibles(), ["b1", "b2"]);
  await page.fill("#tp-buscar", "");
  await page.click('[data-torneo="c1"]');
  ok(/#t=c1$/.test(page.url()), "una fila lleva a su torneo");

  console.log("\n=== Compartir y el calendario ===");
  await page.goto(BASE + "/torneos-pareo.html#t=d1", { waitUntil: "networkidle" });
  await page.waitForSelector("#tp-whatsapp");
  const wa = decodeURIComponent((await page.getAttribute("#tp-whatsapp", "href")).replace("https://wa.me/?text=", ""));
  ok(/PRUEBA PRÓXIMO LEJOS/.test(wa) && /https:\/\/ajedrez-integral\.com\/t\/d1$/.test(wa), "WhatsApp lleva el nombre y el enlace corto /t/ (el que trae la vista previa)", wa);
  ok(/Válido para Elo FIDE/.test(await page.textContent("#tp-contenido")), "la ficha del torneo dice si da Elo");
  const [descarga] = await Promise.all([page.waitForEvent("download"), page.click("#tp-calendario")]);
  const ics = require("fs").readFileSync(await descarga.path(), "utf8");
  igual("«Agregar a mi calendario» baja el torneo de días enteros, con el último incluido", [descarga.suggestedFilename(), (ics.match(/DTSTART;VALUE=DATE:(\d+)/) || [])[1], (ics.match(/DTEND;VALUE=DATE:(\d+)/) || [])[1]],
    ["prueba-proximo-lejos.ics", "20261205", "20261207"]);
  ok(/SUMMARY:PRUEBA PRÓXIMO LEJOS/.test(ics) && /Empieza a las 08:30/.test(ics) && /LOCATION:San José/.test(ics), "con el nombre, la hora y el lugar");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.click("#tp-copiar");
  igual("«Copiar el enlace» copia el corto", await page.evaluate(() => navigator.clipboard.readText()), "https://ajedrez-integral.com/t/d1");

  console.log("\n=== Lo que se pide ===");
  const deLaLista = pedidos.filter((s) => /ritmo:datos->>ritmo/.test(s));
  ok(deLaLista.length && deLaLista.every((s) => !/(^|,)datos($|,)/.test(s)), "la lista pide solo unos campos de `datos`, nunca el torneo entero", pedidos.join(" | "));
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== En el celular ===");
  const cel = await abrir(browser, { width: 360, height: 760 });
  const ancho = await cel.page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  ok(ancho[0] <= ancho[1], "nada se sale de la pantalla", JSON.stringify(ancho));
  const dentro = await cel.page.$$eval(".tp-dato", (l) => l.filter((d) => d.checkVisibility()).every((d) => { const r = d.getBoundingClientRect(); return r.right <= window.innerWidth + 0.5; }));
  ok(dentro, "cada dato se ve entero dentro de la pantalla");
  ok(!cel.errores.length, "sin errores en la página", cel.errores.join(" | "));
  await cel.ctx.close();

  await browser.close();
  if (fallos) { console.log("\n✗ " + fallos + " comprobación(es) fallaron"); process.exit(1); }
  console.log("\n✓ Todo bien");
})().catch((e) => { console.error(e); process.exit(1); });
