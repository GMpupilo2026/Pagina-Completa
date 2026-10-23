/* «Torneos en Pareo Integral», segunda parte: el anuncio de un torneo que
 * todavía no empieza, la inscripción antes del torneo, las partidas en PGN,
 * las estadísticas y el enlace en vivo que lleva a lo publicado
 * (js/pareo/publicar.js, js/pareo/partida.js, js/pareo/pagina.js,
 * js/pareo/ver.js, js/torneos-pareo-pagina.js; la Edge Function
 * pareo-publicar y las tablas, con dobles).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - el PGN se lee jugada por jugada, también con las letras en español, y
 *     dice dónde se rompe; lo que no es legal no se guarda;
 *   - un torneo sin jugadores se publica como anuncio (con la fecha) y sale
 *     en «Próximos torneos»;
 *   - la inscripción se abre desde Pareo, el formulario público pide el
 *     consentimiento y lo obligatorio, y lo que llega entra a la lista SOLO
 *     si quien organiza lo acepta;
 *   - la partida de una mesa se ve en un tablero en la página pública;
 *   - las estadísticas: blancas, negras y tablas con su porcentaje escrito,
 *     y la sorpresa de la ronda;
 *   - el enlace en vivo lleva al torneo publicado, y uno que ya nadie
 *     transmite lo busca por su código.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-anuncio.js
 */
const path = require("path");
const { chromium } = require("playwright");
const { Chess } = require("chess.js");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const PP = require(path.join(RAIZ, "js/pareo/publicar.js"));
const PA = require(path.join(RAIZ, "js/pareo/partida.js"));
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};
const formulario = 'dialog[data-avisos="formulario"][open]';
const PGN_ES = "1. e4 e5 2. Cf3 Cc6 3. Ab5 a6 4. Axc6 dxc6 5. 0-0 f6 6. d4 exd4 7. Cxd4 c5 8. Cb3 Dxd1 9. Txd1 1-0";

// Seis jugadores con Elo; ronda 1 jugada: en la mesa 2 gana el de menos Elo.
function torneo(nombre) {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const t = T.nuevo({ nombre, rondasTotales: 3, mesaInicial: 1, fechaInicio: "2026-10-22",
    jugadores: ids.map((id, k) => ({ id, nombre: "PRUEBA " + id.toUpperCase(), elo: [1900, 1800, 1700, 1600, 1500, 1400][k], institucion: "LICEO " + id.toUpperCase(), categoria: "Sub-12" })) });
  t.rondas = [{ mesas: [{ b: "a", n: "d", r: "1-0" }, { b: "e", n: "b", r: "1-0" }, { b: "c", n: "f", r: "=" }], ausencias: {} }];
  return t;
}

function pruebaSinNavegador() {
  console.log("\n=== Leer la partida de una mesa ===");
  const x = PA.leer(PGN_ES, Chess);
  ok(x.ok && x.jugadas.length === 17, "un PGN con las letras en español se lee entero", JSON.stringify(x.jugadas));
  igual("y queda en inglés, como lo usa el tablero", x.jugadas.slice(2, 5), ["Nf3", "Nc6", "Bb5"]);
  igual("el resultado del final", x.resultado, "1-0");
  const malo = PA.leer("1. e4 e5 2. Cf3 Cc6 3. Ab5 a6 4. Ah7", Chess);
  igual("una jugada ilegal dice desde cuál revisar", [malo.ok, malo.fallaEn], [false, 4]);
  ok(PA.leer("[Event \"X\"]\n1. d4 {comentario} d5 (1... Cf6) 2. c4 *", Chess).jugadas.join(" ") === "d4 d5 c4", "sin encabezados, comentarios ni variantes");

  console.log("\n=== Lo que viaja ===");
  const t = torneo("PRUEBA");
  t.anuncio = { hora: "08:30", contacto: "prueba@ejemplo.com", texto: "Bases" };
  t.inscripcion = { abierta: true, hasta: "2026-11-01" };
  t.liveCodigo = "abc12345";
  t.rondas[0].mesas[0].pgn = PGN_ES;
  const d = PP.datosPublicos(t, { codigoEvento: "evt12345" });
  igual("el anuncio, la inscripción y los códigos de los enlaces en vivo", [d.anuncio.hora, d.inscripcion.abierta, d.vivo, d.codigoEvento], ["08:30", true, "abc12345", "evt12345"]);
  ok(d.rondas[0].mesas[0].pgn === PGN_ES, "y la partida de la mesa");
}

// El doble de la Edge Function.
async function dobleFuncion(page, inscripciones) {
  const pedidos = [];
  await page.route("**/functions/v1/pareo-publicar", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, body: "ok" });
    const body = JSON.parse(route.request().postData() || "{}");
    pedidos.push(body);
    let r = { ok: true, id: body.id };
    if (body.accion === "crear") r = { ok: true, id: "00000000-0000-4000-8000-000000000001", clave: "clave-1" };
    if (body.accion === "inscripciones") r = { ok: true, inscripciones };
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(r) });
  });
  return pedidos;
}
const sembrar = (t, extra) => (page) => page.addInitScript(([x, e]) => {
  if (localStorage.getItem("pareo_lista_v1")) return;
  localStorage.setItem("pareo_lista_v1", JSON.stringify([{ id: "tp", nombre: x.nombre, actualizado: 1, evento: x.evento ? { id: x.evento.id, nombre: x.evento.nombre } : null }]));
  localStorage.setItem("pareo_torneo_v1_tp", JSON.stringify(x));
  localStorage.setItem("pareo_abierto_v1", "tp");
  for (const [k, v] of Object.entries(e || {})) localStorage.setItem(k, v);
}, [t, extra]);

async function pruebaAnuncio(browser) {
  console.log("\n=== Publicar un anuncio desde Pareo ===");
  const t = T.nuevo({ nombre: "PRUEBA ANUNCIO", fechaInicio: "2026-11-07", ciudad: "San José", ritmo: "15 min + 5 s" });
  t.evento = { id: "ev-an", nombre: "PRUEBA EVENTO" };
  let pedidos;
  const inscripciones = [
    { id: "11111111-1111-4111-8111-111111111111", nombre: "PRUEBA NIÑA", institucion: "ESCUELA X", categoria: "Sub-10", elo: 1200, fide_id: "", responsable: "PRUEBA MAMÁ", contacto: "8888-8888", nota: "", estado: "pendiente", creado: "2026-10-23T10:00:00Z" },
    { id: "22222222-2222-4222-8222-222222222222", nombre: "PRUEBA NIÑO", institucion: "ESCUELA Y", categoria: "Sub-10", elo: null, fide_id: "", responsable: "PRUEBA PAPÁ", contacto: "papa@ejemplo.com", nota: "llega tarde", estado: "pendiente", creado: "2026-10-23T11:00:00Z" },
  ];
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", async (p) => {
    pedidos = await dobleFuncion(p, inscripciones);
    await sembrar(t, { "pareo_evento_vivo_v1_ev-an": "evt12345" })(p);
  });
  await page.click('[data-ficha="archivos"]');
  ok(await P.vis(page, "#pi-anuncio-hora"), "sin jugadores, ofrece el anuncio (hora, contacto y bases)");
  await page.fill("#pi-anuncio-hora", "08:30");
  await page.fill("#pi-anuncio-contacto", "prueba@ejemplo.com");
  await page.fill("#pi-anuncio-texto", "Bases de prueba");
  await page.press("#pi-anuncio-texto", "Tab");
  await page.check("#pi-publicar-permiso");
  ok(/Publicar como anuncio/.test(await page.textContent("#pi-publicar-uno")), "el botón dice que es un anuncio");
  await page.click("#pi-publicar-uno");
  await page.waitForSelector("#pi-publicar-enlace");
  const crear = pedidos.find((x) => x.accion === "crear");
  igual("se publica sin jugadores, con el anuncio", [crear.torneo.jugadores.length, crear.torneo.anuncio.hora, crear.torneo.anuncio.contacto], [0, "08:30", "prueba@ejemplo.com"]);
  igual("y con el código del enlace en vivo de su evento", crear.torneo.codigoEvento, "evt12345");

  console.log("\n=== Abrir la inscripción y revisarla ===");
  await page.check("#pi-insc-abierta");
  await page.waitForFunction(() => true);
  const abrir = pedidos.filter((x) => x.accion === "actualizar").pop();
  ok(abrir && abrir.torneo.inscripcion && abrir.torneo.inscripcion.abierta === true, "abrirla la publica en el momento", JSON.stringify(abrir && abrir.torneo.inscripcion));
  await page.click("#pi-insc-ver");
  await page.waitForSelector("#pi-insc-resumen");
  ok(/Llegaron 2 · 2 por revisar/.test(await page.textContent("#pi-insc-resumen")), "dice cuántas llegaron y cuántas faltan");
  ok(/La inscribió PRUEBA MAMÁ · 8888-8888/.test(await page.textContent("#pi-insc-lista")), "con quién inscribió y su contacto (solo aquí)");
  igual("nadie entra solo a la lista", (await P.leerTodos(page))[0].jugadores.length, 0);
  await page.click('[data-aceptar="11111111-1111-4111-8111-111111111111"]');
  const [g] = await P.esperarGuardado(page, (l) => l[0].jugadores.length === 1);
  igual("aceptar la agrega a la lista, con su centro, categoría y Elo", [g.jugadores[0].nombre, g.jugadores[0].institucion, g.jugadores[0].categoria, g.jugadores[0].elo], ["PRUEBA NIÑA", "ESCUELA X", "Sub-10", 1200]);
  const marcarA = pedidos.filter((x) => x.accion === "marcar").pop();
  igual("y la marca como aceptada con la clave", [marcarA.estado, marcarA.ids, marcarA.clave], ["aceptada", ["11111111-1111-4111-8111-111111111111"], "clave-1"]);
  await page.click('[data-rechazar="22222222-2222-4222-8222-222222222222"]');
  await page.waitForFunction(() => /Rechazada/.test(document.getElementById("pi-insc-lista").textContent));
  igual("rechazar no la agrega", (await P.leerTodos(page))[0].jugadores.length, 1);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaSolo(browser) {
  console.log("\n=== Todo torneo se publica solo al emparejar la ronda 1 ===");
  const t = torneo("PRUEBA SOLO");
  t.rondas = [];
  let pedidos;
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", async (p) => { pedidos = await dobleFuncion(p, []); await sembrar(t)(p); });
  await page.click('[data-ficha="torneo"]');
  ok(await P.vis(page, "#pi-publico-aviso") && /se publica en Torneos en Pareo Integral al emparejar la ronda 1/.test(await page.textContent("#pi-publico-aviso")), "la ficha Torneo lo dice, con el enlace a la política de privacidad");
  await page.click('[data-ficha="rondas"]');
  ok(/se publica solo en Torneos en Pareo Integral/.test(await page.textContent("#pi-publico-ronda1")), "y antes de emparejar la ronda 1");
  igual("antes de la ronda 1 no se publica nada", pedidos.filter((x) => x.accion === "crear").length, 0);
  await page.click("#pi-emparejar");
  const [g] = await P.esperarGuardado(page, (l) => l[0].publicado && l[0].publicado.id);
  const crear = pedidos.filter((x) => x.accion === "crear");
  igual("al emparejarla, se publica solo, una vez y con la ronda", [crear.length, crear[0].torneo.rondas.length, g.publicado.clave], [1, 1, "clave-1"]);
  await page.click('[data-ficha="archivos"]');
  await page.waitForSelector("#pi-publicar-enlace");
  ok(!(await page.$("#pi-publicar-quitar")), "y ya no se puede dejar de publicar");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== Sin internet, lo vuelve a intentar ===");
  const t2 = torneo("PRUEBA SIN RED");
  const { ctx: ctx2, page: page2, errores: errores2 } = await P.abrirPagina(browser, BASE, "", async (p) => {
    await p.route("**/functions/v1/pareo-publicar", (r) => r.abort());
    await sembrar(t2)(p);
  });
  await page2.click('[data-ficha="archivos"]');
  await page2.waitForSelector("#pi-publicar-reintentar");
  ok(/todavía no se pudo \(sin internet\)/.test(await page2.textContent("#pi-publicar")), "dice que no se pudo y que se vuelve a intentar");
  await page2.unroute("**/functions/v1/pareo-publicar");
  const pedidos2 = await dobleFuncion(page2, []);
  await page2.click("#pi-publicar-reintentar");
  await P.esperarGuardado(page2, (l) => l[0].publicado && l[0].publicado.id);
  igual("«Publicar ahora» lo publica sin esperar", pedidos2.filter((x) => x.accion === "crear").length, 1);
  ok(!errores2.length, "sin errores en la página", errores2.join(" | "));
  await ctx2.close();
}

async function pruebaPgn(browser) {
  console.log("\n=== La partida de una mesa, desde Pareo ===");
  const t = torneo("PRUEBA PGN");
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar(t));
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-rondas-nav button >> nth=0");
  await page.click('#pi-ronda [data-pgn="0"]');
  await page.waitForSelector(formulario);
  await page.fill(formulario + " textarea", "1. e4 e5 2. Cf3 Cc6 3. Ab5 a6 4. Ah7");
  await page.click(formulario + " [data-avisos-aceptar]");
  await page.waitForFunction(() => /revisa desde la jugada 4/.test(document.body.textContent));
  ok(!(await P.leerTodos(page))[0].rondas[0].mesas[0].pgn, "una partida con una jugada ilegal no se guarda y dice desde cuál revisar");
  await page.click('#pi-ronda [data-pgn="0"]');
  await page.waitForSelector(formulario);
  await page.fill(formulario + " textarea", PGN_ES);
  await page.click(formulario + " [data-avisos-aceptar]");
  const [g] = await P.esperarGuardado(page, (l) => !!l[0].rondas[0].mesas[0].pgn);
  igual("una buena queda en la mesa", g.rondas[0].mesas[0].pgn, PGN_ES);
  ok(/✓/.test(await page.textContent('#pi-ronda [data-pgn="0"]')), "y el botón de la mesa dice que ya tiene partida");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

// El doble de la tabla pública (PostgREST).
async function dobleTabla(page, filas) {
  const pedidos = [];
  await page.route("**/rest/v1/pareo_publicados**", async (route) => {
    const u = new URL(route.request().url());
    const sel = u.searchParams.get("select") || "";
    pedidos.push(u.search);
    const columnas = (f) => require("./lib/pareo-pruebas").columnasPedidas(sel, f);
    const json = (status, x) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(x) });
    const id = u.searchParams.get("id");
    if (id && id.startsWith("eq.")) {
      const f = filas.find((x) => x.id === id.slice(3));
      if (/vnd\.pgrst\.object/.test(route.request().headers().accept || "")) return f ? json(200, columnas(f)) : json(406, { code: "PGRST116" });
      return json(200, f ? [columnas(f)] : []);
    }
    return json(200, filas.map(columnas));
  });
  return pedidos;
}

async function pruebaPublica(browser) {
  console.log("\n=== torneos-pareo.html: próximos, inscripción, partida y estadísticas ===");
  const anuncio = T.nuevo({ nombre: "PRUEBA PRÓXIMO", fechaInicio: "2099-01-10", ciudad: "Heredia", ritmo: "15 min + 5 s" });
  anuncio.anuncio = { hora: "08:30", contacto: "prueba@ejemplo.com", texto: "Bases de prueba" };
  anuncio.inscripcion = { abierta: true, hasta: "2099-01-09" };
  const jugado = torneo("PRUEBA JUGADO");
  jugado.rondas[0].mesas[0].pgn = PGN_ES;
  const fila = (id, t, fecha) => ({ id, nombre: t.nombre, evento: "", lugar: t.ciudad || "", fecha, rondas: t.rondas.length ? 1 : 0, rondas_total: 3,
    jugadores: t.jugadores.length, actualizado: "2026-10-22T15:00:00Z", datos: PP.datosPublicos(t) });
  const filas = [fila("33333333-3333-4333-8333-333333333333", anuncio, "2099-01-10"), fila("44444444-4444-4444-8444-444444444444", jugado, "2026-10-22")];
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await dobleTabla(page, filas);
  const pedidos = await dobleFuncion(page, []);
  await page.goto(BASE + "/torneos-pareo.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#tp-proximos li");
  igual("el anuncio sale en «Próximos torneos», no en los resultados", [await page.$$eval("#tp-proximos [data-torneo]", (l) => l.map((a) => a.dataset.torneo.slice(0, 1))), await page.$$eval("#tp-lista [data-torneo]", (l) => l.map((a) => a.dataset.torneo.slice(0, 1)))], [["3"], ["4"]]);
  await page.click('#tp-proximos [data-torneo^="3"]');
  await page.waitForSelector("#tp-anuncio");
  const an = await page.textContent("#tp-anuncio");
  ok(/Hora: 08:30/.test(an) && /Contacto: prueba@ejemplo\.com/.test(an) && /Bases de prueba/.test(an), "el anuncio dice la hora, el contacto y las bases", an);
  ok(await P.vis(page, "#tp-i-form"), "con la inscripción abierta, trae el formulario");
  await page.fill("#tp-i-nombre", "PRUEBA ESTUDIANTE");
  await page.fill("#tp-i-responsable", "PRUEBA ENCARGADO");
  await page.fill("#tp-i-contacto", "8888-8888");
  await page.click("#tp-i-enviar");
  ok(/política de privacidad/.test(await page.textContent("#tp-i-estado")) && !pedidos.some((x) => x.accion === "inscribir"), "sin el consentimiento no se manda nada");
  await page.check("#tp-i-permiso");
  await page.click("#tp-i-enviar");
  await page.waitForFunction(() => /✓ Inscripción de PRUEBA ESTUDIANTE enviada/.test(document.getElementById("tp-i-estado").textContent));
  const ins = pedidos.find((x) => x.accion === "inscribir");
  igual("manda la inscripción con su contacto y el consentimiento", [ins.id.slice(0, 1), ins.inscripcion.nombre, ins.inscripcion.contacto, ins.consentimiento], ["3", "PRUEBA ESTUDIANTE", "8888-8888", true]);

  console.log("\n=== La partida en un tablero ===");
  await page.goto(BASE + "/torneos-pareo.html#t=44444444-4444-4444-8444-444444444444&v=rondas", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-ver-pgn="0"]');
  ok(!(await page.$('[data-ver-pgn="1"]')), "solo las mesas con partida tienen el botón");
  await page.click('[data-ver-pgn="0"]');
  await page.waitForSelector("#tp-visor");
  ok(await page.evaluate(() => document.querySelectorAll("#tp-visor button[data-sq], #tp-visor [data-square], #tp-visor .square, #tp-visor button").length >= 64), "se ve el tablero de la partida");
  ok(/Mesa 1: PRUEBA A – PRUEBA D/.test(await page.textContent("#tp-partida-titulo")), "con la mesa y quién jugó");

  console.log("\n=== Las estadísticas ===");
  await page.click('nav[aria-label="Partes del torneo"] >> text=Estadísticas');
  await page.waitForSelector('[data-est="Ganan las blancas"]');
  ok(/67 % \(2\)/.test(await page.textContent('[data-est="Ganan las blancas"]')), "las blancas, con el porcentaje escrito (2 de 3)");
  ok(/33 % \(1\)/.test(await page.textContent('[data-est="Tablas"]')), "y las tablas");
  ok(/PRUEBA E \(1500\) le ganó a PRUEBA B \(1800\) en la ronda 1: 300 puntos/.test(await page.textContent("#tp-sorpresas")), "la sorpresa: ganó el de menos Elo");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaEnVivo(browser) {
  console.log("\n=== El enlace en vivo lleva a lo publicado ===");
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "#vivo=prueba12", async (p) => {
    await p.clock.install();
    // El doble de Supabase no trae consultas: se le agrega la de la tabla pública.
    await p.addInitScript(() => {
      window.__consultas = [];
      const sb0 = window.sb;
      sb0.from = (tabla) => {
        const q = { tabla, filtros: [] };
        const b = {
          select() { return b; }, order() { return b; }, range() { return b; },
          filter(c, op, v) { q.filtros.push([c, op, v]); return b; },
          then(res) { window.__consultas.push(q); return Promise.resolve({ data: [{ id: "55555555-5555-4555-8555-555555555555", nombre: "PRUEBA PUBLICADO" }], error: null }).then(res); },
        };
        return b;
      };
    });
  });
  await page.clock.runFor(9000);
  await page.waitForSelector("[data-publicados] a");
  igual("un enlace que ya nadie transmite busca por su código", await page.evaluate(() => window.__consultas.map((q) => [q.tabla, q.filtros[0]])), [["pareo_publicados", ["datos->>vivo", "eq", "prueba12"]]]);
  igual("y ofrece ir al torneo publicado", await page.getAttribute("[data-publicados] a", "href"), "torneos-pareo.html#t=55555555-5555-4555-8555-555555555555");
  await page.evaluate(() => window.__llega("pareo-vivo-prueba12", "estado", { v: 1, nombre: "PRUEBA", ronda: { n: 1, mesas: [] }, clasificacion: [], pub: "66666666-6666-4666-8666-666666666666" }));
  await page.waitForSelector("[data-publicado] a");
  igual("mientras transmite, el enlace en vivo lleva también a lo publicado", await page.getAttribute("[data-publicado] a", "href"), "torneos-pareo.html#t=66666666-6666-4666-8666-666666666666");
  await page.evaluate(() => window.__llega("pareo-vivo-prueba12", "estado", { v: 1, nombre: "PRUEBA", ronda: { n: 1, mesas: [] }, clasificacion: [], pub: "javascript:alert(1)" }));
  await page.waitForFunction(() => !document.querySelector("[data-publicado]"));
  bien("un id que no es un id no se pone en un enlace");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  pruebaSinNavegador();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAnuncio(browser);
    await pruebaSolo(browser);
    await pruebaPgn(browser);
    await pruebaPublica(browser);
    await pruebaEnVivo(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
