/* «Torneos en Pareo Integral»: lo que se arma con todos los torneos
 * publicados (js/torneos-pareo-pagina.js, con dobles de las funciones de la
 * base). Lo que se prueba, porque se rompe sin dar ningún error:
 *   - el mismo jugador en todos sus torneos: con su huella (`i`), los suyos y
 *     los de su nombre sin huella, nunca los de otra persona con el mismo
 *     nombre; sin huella, si hay dos personas, se pregunta cuál;
 *   - cara a cara: el marcador y las partidas entre dos jugadores;
 *   - la ficha del colegio, desde la clasificación de un torneo;
 *   - el ranking: lo que se elige viaja a la base y la tabla lo muestra;
 *   - la portada: «Se están jugando ahora», «Por provincia» (filtra los de
 *     Pareo Integral y los de afuera), y un torneo que está en las dos
 *     listas sale una sola vez;
 *   - avisar por correo: pide el consentimiento, manda el nombre y la huella,
 *     y el enlace del correo confirma y se borra de la dirección;
 *   - en el celular nada se sale de la pantalla.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-jugadores.js
 */
const path = require("path");
const { chromium } = require("playwright");
const { columnasPedidas, dobleListaPareo } = require("./lib/pareo-pruebas");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const PP = require(path.join(RAIZ, "js/pareo/publicar.js"));

let fallos = 0;
const ok = (c, m, detalle) => {
  if (c) console.log("  ✓ " + m);
  else { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; }
};
const igual = (m, a, b) => ok(JSON.stringify(a) === JSON.stringify(b), m, "esperaba " + JSON.stringify(b) + ", salió " + JSON.stringify(a));
const clave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

const HA = "aaaaaaaaaaaaaaaaaaaaaaaa", HB = "bbbbbbbbbbbbbbbbbbbbbbbb";
// Tres torneos. «Ana Pérez» (huella HA) juega en T1 y en T3 (en T3 sin ID
// FIDE: sin huella); otra «ANA PEREZ» (huella HB) juega en T2. Ana (HA) y
// Beto se enfrentan en T1 y T3.
function torneo(id, nombre, fecha, jug, rondas, extra) {
  const t = T.nuevo({ nombre, rondasTotales: rondas.length, mesaInicial: 1, fechaInicio: fecha, jugadores: jug.map((j) => Object.assign({ elo: 1700 }, j)) });
  t.rondas = rondas.map((mesas) => ({ mesas, ausencias: {} }));
  Object.assign(t, extra || {});
  const datos = PP.datosPublicos(t);
  // Lo que hace la función: cambia el ID FIDE por la huella.
  datos.jugadores.forEach((j) => { delete j.fideId; const o = jug.find((x) => x.id === j.id); if (o.ident) j.ident = o.ident; });
  return { id, nombre, evento: "", lugar: extra && extra.lugar || "San José", fecha, rondas: rondas.length, rondas_total: rondas.length, jugadores: jug.length, actualizado: fecha + "T20:00:00Z", organizador_id: null, datos };
}
const ID1 = "11111111-1111-4111-8111-000000000001", ID2 = "11111111-1111-4111-8111-000000000002", ID3 = "11111111-1111-4111-8111-000000000003";
const ID4 = "11111111-1111-4111-8111-000000000004";
const T1 = torneo(ID1, "PRUEBA OTOÑO", "2026-09-10",
  [{ id: "a", nombre: "Ana Pérez", ident: HA, institucion: "Liceo PRUEBA" }, { id: "b", nombre: "Beto Solís", institucion: "Liceo PRUEBA" }, { id: "c", nombre: "Carla Mora" }, { id: "d", nombre: "Diego Rojas" }],
  [[{ b: "a", n: "b", r: "1-0" }, { b: "c", n: "d", r: "=" }], [{ b: "c", n: "a", r: "0-1" }, { b: "d", n: "b", r: "1-0" }]]);
const T2 = torneo(ID2, "PRUEBA OTRA ANA", "2026-09-20",
  [{ id: "x", nombre: "ANA PEREZ", ident: HB }, { id: "y", nombre: "Eva Luna" }], [[{ b: "x", n: "y", r: "1-0" }]]);
const T3 = torneo(ID3, "PRUEBA INVIERNO", "2026-10-05",
  [{ id: "p", nombre: "ana perez", institucion: "Liceo PRUEBA" }, { id: "q", nombre: "Beto Solís" }], [[{ b: "q", n: "p", r: "=" }]]);
// En curso: la ronda 2 de 3 sin terminar, y está también en ajedrezcostarica.com.
const T4 = torneo(ID4, "PRUEBA EN CURSO", "2026-10-23",
  [{ id: "m", nombre: "Mario" }, { id: "n", nombre: "Nora" }], [[{ b: "m", n: "n", r: "1-0" }], [{ b: "n", n: "m", r: null }]], { rondasTotales: 3, provincia: "Cartago", lugar: "Cartago" });
T4.rondas = 1; T4.rondas_total = 3;
const FILAS = [T1, T2, T3, T4];

const json = (route, x, status) => route.fulfill({ status: status || 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(x) });
async function dobles(page) {
  const pedidos = [];
  await page.route("**/rest/v1/pareo_publicados**", (route) => {
    const u = new URL(route.request().url());
    const id = u.searchParams.get("id");
    const filas = id && id.startsWith("eq.") ? FILAS.filter((f) => f.id === id.slice(3)) : FILAS;
    const objeto = /vnd\.pgrst\.object/.test(route.request().headers().accept || "");
    const sel = u.searchParams.get("select") || "";
    return objeto ? (filas[0] ? json(route, columnasPedidas(sel, filas[0])) : json(route, { code: "PGRST116" }, 406)) : json(route, filas.map((f) => columnasPedidas(sel, f)));
  });
  await page.route("**/rest/v1/pareo_organizadores**", (route) => json(route, []));
  await dobleListaPareo(page, FILAS, { hoy: "2026-10-23" });
  // Después de dobleListaPareo: este gana (el resumen con las provincias).
  await page.route("**/rest/v1/rpc/pareo_lista_resumen", (route) => json(route, { total: FILAS.length, lugares: ["San José", "Cartago", "Paquera"], provincias: { Cartago: 1 } }));
  await page.route("**/rest/v1/rpc/torneos_externos_lista", (route) => json(route, [
    { id_externo: 801, titulo: "PRUEBA EN CURSO", inicio: "2026-10-23T15:00:00+00:00", fin: "2026-10-25T22:00:00+00:00", provincia: "Cartago", lugar: "", ritmo: "", minutos: null, incremento: null, elo: "", precio: null, moneda: "", modalidad: "", formato: "", organizador: "", inscripcion_abierta: false, url: "https://ajedrezcostarica.com/es/tournaments/801", repetido_de: ID4 },
    { id_externo: 802, titulo: "PRUEBA DE HEREDIA", inicio: "2026-11-10T15:00:00+00:00", fin: null, provincia: "Heredia", lugar: "Salón", ritmo: "rapido", minutos: 10, incremento: 5, elo: "no", precio: 0, moneda: "CRC", modalidad: "presencial", formato: "individual", organizador: "", inscripcion_abierta: true, url: "https://ajedrezcostarica.com/es/tournaments/802", repetido_de: null },
  ]));
  // public.pareo_torneos_de: por la huella o por el nombre sin tildes ni mayúsculas.
  await page.route("**/rest/v1/rpc/pareo_torneos_de", (route) => {
    const a = JSON.parse(route.request().postData() || "{}");
    pedidos.push(Object.assign({ fn: "torneos_de" }, a));
    return json(route, FILAS.filter((f) => f.datos.jugadores.some((j) => (a.p_ident && j.ident === a.p_ident) || clave(j.nombre) === clave(a.p_nombre)))
      .sort((x, y) => y.fecha.localeCompare(x.fecha)));
  });
  await page.route("**/rest/v1/rpc/pareo_institucion", (route) => {
    const a = JSON.parse(route.request().postData() || "{}");
    pedidos.push(Object.assign({ fn: "institucion" }, a));
    return json(route, clave(a.p_nombre) !== "LICEO PRUEBA" ? null : {
      nombre: "Liceo PRUEBA", jugadores: [{ persona: "i:" + HA, nombre: "Ana Pérez", ident: HA, torneos: 2, podios: 2, mejor: 1, puntos: 2.5 }, { persona: "n:BETO SOLIS", nombre: "Beto Solís", ident: null, torneos: 1, podios: 0, mejor: 4, puntos: 0 }],
      torneos: [{ id: ID3, nombre: "PRUEBA INVIERNO", evento: "", fecha: "2026-10-05", cuantos: 1, mejor: 1, de: 2 }, { id: ID1, nombre: "PRUEBA OTOÑO", evento: "", fecha: "2026-09-10", cuantos: 2, mejor: 1, de: 4 }],
      podios: [{ id: ID1, torneo: "PRUEBA OTOÑO", fecha: "2026-09-10", nombre: "Ana Pérez", persona: "i:" + HA, puesto: 1 }],
      anios: [{ anio: 2026, torneos: 2, jugadores: 2, podios: 2 }],
    });
  });
  await page.route("**/rest/v1/rpc/pareo_ranking", (route) => {
    const a = JSON.parse(route.request().postData() || "{}");
    pedidos.push(Object.assign({ fn: "ranking" }, a));
    return json(route, { anios: [2026, 2025], categorias: ["Sub-12", "Libre"], filas: [
      { persona: "i:" + HA, nombre: "Ana Pérez", ident: HA, institucion: "Liceo PRUEBA", categoria: "Sub-12", torneos: 2, partidas: 3, puntos: 2.5, g: 2, e: 1, p: 0, podios: 2, pe: 3, rp: 1950, cambio: 12.4 },
      { persona: "n:BETO SOLIS", nombre: "Beto Solís", ident: null, institucion: "", categoria: "", torneos: 2, partidas: 3, puntos: 0.5, g: 0, e: 1, p: 2, podios: 0, pe: 3, rp: null, cambio: null },
    ] });
  });
  await page.route("**/functions/v1/pareo-publicar", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, body: "ok" });
    const b = JSON.parse(route.request().postData() || "{}");
    pedidos.push(Object.assign({ fn: "funcion" }, b));
    return json(route, b.accion === "seguir_confirmar" ? { ok: true, nombre: "Ana Pérez" } : { ok: true });
  });
  return pedidos;
}

async function abrir(browser, hash, viewport) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: viewport || { width: 1280, height: 900 }, timezoneId: "America/Costa_Rica" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.clock.setFixedTime(new Date("2026-10-23T18:00:00Z"));
  const pedidos = await dobles(page);
  await page.goto(BASE + "/torneos-pareo.html" + hash, { waitUntil: "networkidle" });
  return { ctx, page, errores, pedidos };
}
const ir = async (page, hash, selector) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForSelector(selector); };
const textos = (page, sel) => page.$$eval(sel, (l) => l.filter((x) => x.checkVisibility()).map((x) => x.textContent.trim()));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const { ctx, page, errores, pedidos } = await abrir(browser, "");

  console.log("\n=== La portada ===");
  await page.waitForSelector("#tp-vivo [data-torneo]");
  igual("«Se están jugando ahora» trae el que está en curso", await page.$$eval("#tp-vivo [data-torneo]", (l) => l.map((a) => a.dataset.torneo)), [ID4]);
  ok(/También anunciado en ajedrezcostarica\.com/.test(await page.textContent(`#tp-vivo [data-torneo="${ID4}"]`)), "y dice que también está anunciado allá");
  igual("el de afuera que es el mismo no sale otra vez en «También en Costa Rica»", await page.$$eval("#tp-externos [data-externo]", (l) => l.map((a) => a.dataset.externo)), ["802"]);
  igual("«Por provincia»: cuántos vienen en cada una (Pareo Integral y los de afuera)", await textos(page, "#tp-provincias-lista button"), ["Heredia · 1 torneo", "Cartago · 1 torneo"].sort((a, b) => ["San José", "Alajuela", "Cartago", "Heredia"].indexOf(a.split(" ·")[0]) - ["San José", "Alajuela", "Cartago", "Heredia"].indexOf(b.split(" ·")[0])));
  igual("el filtro «Lugar» ofrece las provincias primero", await page.$$eval("#tp-f-lugar optgroup", (l) => l.map((g) => g.label)), ["Provincia", "Lugar"]);
  await page.click('#tp-provincias-lista [data-provincia="Heredia"]');
  await page.waitForFunction(() => document.querySelector("#tp-f-lugar").value === "Heredia");
  await page.waitForTimeout(300);
  ok(pedidos.length >= 0 && await page.$eval("#tp-f-lugar", (s) => s.value) === "Heredia", "tocar una provincia la elige en el filtro");
  igual("y los de afuera se filtran por ella", await page.$$eval("#tp-externos [data-externo]", (l) => l.filter((a) => a.checkVisibility()).map((a) => a.dataset.externo)), ["802"]);
  igual("el botón queda marcado", await page.getAttribute('#tp-provincias-lista [data-provincia="Heredia"]', "aria-pressed"), "true");
  await page.click('#tp-provincias-lista [data-provincia="Heredia"]');
  await page.waitForFunction(() => document.querySelector("#tp-f-lugar").value === "");
  ok(true, "tocarla otra vez quita el filtro");

  console.log("\n=== El mismo jugador en todos sus torneos ===");
  await ir(page, "#p=Ana+P%C3%A9rez", "#tp-homonimos");
  ok(/2 personas distintas/.test(await page.textContent("#tp-homonimos")), "dos personas con el mismo nombre (dos huellas): pregunta cuál, no las suma");
  igual("una opción por persona", await page.$$eval("#tp-contenido [data-ident]", (l) => l.map((a) => a.dataset.ident).sort()), [HA, HB]);
  await page.click(`#tp-contenido [data-ident="${HA}"]`);
  await page.waitForSelector("#tp-ficha-tabla");
  igual("con su huella: sus torneos, también el que jugó sin ID FIDE, y no el de la otra Ana", await page.$$eval("#tp-ficha-tabla tbody tr", (l) => l.map((x) => x.dataset.fichaTorneo)), [ID3, ID1]);
  ok(pedidos.some((x) => x.fn === "torneos_de" && x.p_ident === HA), "la huella viaja a la base");
  ok(/Liceo PRUEBA/.test(await page.textContent("#tp-contenido")) && await page.$('#tp-contenido a[data-colegio="Liceo PRUEBA"]'), "su colegio, con enlace a su ficha");

  console.log("\n=== Cara a cara ===");
  igual("los rivales para elegir, los que tuvo enfrente", await page.$$eval("#tp-cara-rival option", (l) => l.slice(1).map((o) => o.textContent)), ["Beto Solís (2 partidas)", "Carla Mora"]);
  await page.selectOption("#tp-cara-rival", { label: "Beto Solís (2 partidas)" });
  await page.waitForSelector("#tp-cara-tabla");
  igual("el marcador", (await page.textContent("#tp-cara-marcador")).trim(), "Ana Pérez 1 · tablas 1 · Beto Solís 0");
  igual("y cada partida: torneo, ronda, color y resultado", await page.$$eval("#tp-cara-tabla tbody tr", (l) => l.map((x) => [...x.cells].slice(1).map((c) => c.textContent))),
    [["PRUEBA INVIERNO", "1", "Negras", "Tablas"], ["PRUEBA OTOÑO", "1", "Blancas", "Ganó Ana Pérez"]]);

  console.log("\n=== Avisarme por correo ===");
  igual("empieza cerrado y lo dice", await page.getAttribute("#tp-aviso-abrir", "aria-expanded"), "false");
  await page.click("#tp-aviso-abrir");
  igual("se abre con el foco en el correo", [await page.getAttribute("#tp-aviso-abrir", "aria-expanded"), await page.evaluate(() => document.activeElement.id)], ["true", "tp-aviso-correo"]);
  await page.fill("#tp-aviso-correo", "yo@ejemplo.com");
  await page.click("#tp-aviso-mandar");
  ok(/política de privacidad/.test(await page.textContent("#tp-aviso-estado")) && !pedidos.some((x) => x.accion === "seguir_correo"), "sin el consentimiento no se manda nada");
  await page.check("#tp-aviso-permiso");
  await page.click("#tp-aviso-mandar");
  await page.waitForFunction(() => /revisa tu correo/.test(document.getElementById("tp-aviso-estado").textContent));
  const pide = pedidos.find((x) => x.accion === "seguir_correo") || {};
  igual("manda el nombre, la huella, el correo y el consentimiento", [pide.nombre, pide.ident, pide.correo, pide.consentimiento], ["Ana Pérez", HA, "yo@ejemplo.com", true]);
  await page.goto("about:blank");
  await page.goto(BASE + "/torneos-pareo.html#seguir-ok=" + "22222222-2222-4222-8222-222222222222." + "ab".repeat(16), { waitUntil: "networkidle" });
  await page.waitForFunction(() => /Avisos confirmados/.test(document.body.textContent));
  ok(pedidos.some((x) => x.accion === "seguir_confirmar" && x.id === "22222222-2222-4222-8222-222222222222"), "el enlace del correo confirma los avisos");
  ok(!/seguir-ok/.test(await page.evaluate(() => location.href)), "y se borra de la dirección");

  console.log("\n=== La ficha del colegio ===");
  await ir(page, "#t=" + ID1 + "&v=clasificacion", "#tp-tabla-clas");
  const enlace = await page.$('#tp-tabla-clas a[data-colegio="Liceo PRUEBA"]');
  ok(!!enlace, "en la clasificación, el colegio lleva a su ficha");
  await enlace.click();
  await page.waitForSelector("#tp-colegio-jugadores");
  igual("sus jugadores, con enlace a su ficha (con la huella)", await page.$$eval("#tp-colegio-jugadores tbody a", (l) => l.map((a) => a.getAttribute("href"))),
    ["#p=Ana+P%C3%A9rez&i=" + HA, "#p=Beto+Sol%C3%ADs"]);
  igual("su año a año", await page.$$eval("#tp-colegio-anios tbody td", (l) => l.map((x) => x.textContent)), ["2026", "2", "2", "2"]);
  ok(/1\.º Ana Pérez en PRUEBA OTOÑO/.test(await page.textContent("#tp-colegio-podios")), "sus podios");
  await ir(page, "#c=Nadie+As%C3%AD", "#tp-colegio-vacio");
  ok(true, "un colegio que no está lo dice");

  console.log("\n=== El ranking ===");
  await ir(page, "#ranking=1", "#tp-rk-tabla");
  const rk = pedidos.filter((x) => x.fn === "ranking");
  igual("pide el año de hoy, por torneos", [rk[0].p_anio, rk[0].p_orden], [2026, "torneos"]);
  igual("la tabla", await page.$$eval("#tp-rk-tabla tbody tr", (l) => l.map((x) => [x.cells[1].querySelector("a").textContent, x.cells[3].textContent, x.cells[8].textContent])),
    [["Ana Pérez", "2", "+12,4"], ["Beto Solís", "2", "—"]]);
  await page.selectOption("#tp-rk-orden", "rendimiento");
  await page.waitForFunction(() => document.getElementById("tp-rk-orden") && document.getElementById("tp-rk-orden").value === "rendimiento");
  await page.waitForTimeout(300);
  ok(pedidos.filter((x) => x.fn === "ranking").pop().p_orden === "rendimiento", "cambiar el orden lo pide a la base");
  igual("y el foco sigue en lo que se tocó", await page.evaluate(() => document.activeElement.id), "tp-rk-orden");
  await page.selectOption("#tp-rk-cat", "Sub-12");
  await page.waitForTimeout(300);
  ok(pedidos.filter((x) => x.fn === "ranking").pop().p_categoria === "Sub-12", "y la categoría");
  ok(!errores.length, "sin errores en la consola", errores.join(" | "));
  await ctx.close();

  console.log("\n=== En el celular ===");
  for (const hash of ["", "#ranking=1", "#p=Ana+P%C3%A9rez&i=" + HA + "&vs=Beto+Sol%C3%ADs"]) {
    const r = await abrir(browser, hash, { width: 360, height: 740 });
    await r.page.waitForTimeout(400);
    const ancho = await r.page.evaluate(() => document.documentElement.scrollWidth);
    ok(ancho <= 360, "nada se sale de la pantalla en «" + (hash || "la portada") + "»", ancho + " px");
    await r.ctx.close();
  }
  await browser.close();
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
