/* Comprueba la pantalla de administración de la sala (sala-admin.html): armar
   equipos con los inscritos, las cuentas con su usuario y su clave, y programar
   las arenas.

   La página no toca las tablas: todo pasa por la Edge Function `arena-admin`.
   Acá la función es un doble (se intercepta su dirección) que anota lo que
   RECIBE; la página de la Academia es un doble de `window.sb`. Se mira lo que se
   manda, lo que se ve y lo que se baja:

     · quien no administra ve el aviso y la función nunca se llama;
     · un nombre con HTML adentro se muestra como texto;
     · agregar jugadores manda el equipo y las inscripciones marcadas;
     · las claves salen en una tabla, en un CSV que Excel lee (con BOM) y se
       copian; se cierran y no vuelven;
     · una arena sale con la hora de Costa Rica (UTC−6) y su ritmo;
     · un error de la función se dice, no se traga.
     · el juego limpio: «Revisar partidas» pide la arena, dice cuántas se
       revisaron, muestra solo las que tienen algo, con cada indicio escrito
       (no solo en color) y dicho como indicio; un nombre con HTML es texto;
       anular sin motivo no llama a la función, con motivo sí; una anulada
       dice su motivo y se devuelve.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-sala-admin.js                         */
"use strict";
const fs = require("fs");
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const FUNCION = "https://prcfbzvshnusisczlpxl.supabase.co/functions/v1/arena-admin";

let fallos = 0;
function ok(nombre, condicion, detalle) {
  if (condicion) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle !== undefined ? "\n      " + detalle : "")); fallos++; }
}
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  ok(nombre, a === b, "esperaba: " + b + "\n      salió:    " + a);
}

const ESTADO = {
  ok: true,
  dominio: "sala.ajedrez-integral.com",
  equipos: [{ id: "e1", nombre: "Los Alfiles" }, { id: "e2", nombre: "Las Torres" }],
  jugadores: [
    { id: "j1", usuario: "Ana_Rojas_C", nombre: "Ana Rojas", equipo_id: "e1", inscripcion_id: "i1", fuerza: 1000 },
    { id: "j2", usuario: "Luis_Mora", nombre: "Luis Mora", equipo_id: null, inscripcion_id: "i3", fuerza: 1250 },
  ],
  torneos: [{ id: "t1", nombre: "Arena de apertura", inicia: "2026-11-06T01:00:00.000Z", minutos: 60, inicial_seg: 180, incremento_seg: 2, por_equipos: true, mejores: 5 }],
  inscripciones: [
    { id: "i1", nombre: "Ana", apellido1: "Rojas", apellido2: "Cruz", centro: "Liceo A", grado: "7", usuario: "Ana_Rojas_C" },
    { id: "i2", nombre: "<img src=x onerror=window.__xss=1>", apellido1: "Mena", apellido2: "", centro: "Escuela <b>B</b>", grado: "5", usuario: null },
    { id: "i3", nombre: "Luis", apellido1: "Mora", apellido2: "", centro: "Liceo C", grado: "8", usuario: "Luis_Mora" },
    { id: "i4", nombre: "María José", apellido1: "Peña", apellido2: "Vega", centro: "Liceo D", grado: "9", usuario: "Maria_Pena_V" },
  ],
};

/* La página de la Academia: window.sb con una sesión y soy_coordinador(). */
function clienteAcademia(esCoordinador) {
  return `(function () {
    const tabla = () => { const a = {}; ["select","limit","eq","order","maybeSingle","single","in","or"].forEach((m) => { a[m] = () => a; });
      a.then = (r, j) => Promise.resolve({ data: [], error: null }).then(r, j); return a; };
    window.sb = {
      auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u-1" }, access_token: "token-de-la-academia" } } }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: () => Promise.resolve({}) },
      rpc: (n) => Promise.resolve({ data: n === "soy_coordinador" ? ${esCoordinador} : null, error: null }),
      from: tabla, channel: () => { const c = { on() { return c; }, subscribe() { return c; } }; return c; }, removeChannel() {},
    };
  })();`;
}

async function abrir(browser, esCoordinador, opciones) {
  const o = opciones || {};
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: o.ancho || 1280, height: o.alto || 900 }, acceptDownloads: true });
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteAcademia(esCoordinador) }));
  const pedidos = [];
  await ctx.route(FUNCION, async (r) => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    const cuerpo = JSON.parse(r.request().postData() || "{}");
    pedidos.push({ cuerpo, auth: r.request().headers().authorization });
    const respuesta = o.responder ? o.responder(cuerpo) : { estado: 200, cuerpo: { ok: true } };
    const base = cuerpo.accion === "estado" ? Object.assign({}, ESTADO, o.estado ? o.estado() : {}) : {};
    await r.fulfill({
      status: respuesta.estado || 200, contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(Object.assign({}, base, respuesta.cuerpo || {})),
    });
  });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/sala-admin.html", { waitUntil: "networkidle" });
  return { page, ctx, errores, pedidos };
}

const visible = (page, sel) => page.$eval(sel, (e) => e.checkVisibility());
const texto = (page, sel) => page.$eval(sel, (e) => e.textContent.trim());

async function pruebaPermiso(browser) {
  console.log("\n=== Quién entra ===");
  const { page, ctx, pedidos } = await abrir(browser, false);
  await page.waitForSelector("#denegado:not(.hidden)");
  ok("quien no administra ve el aviso", await visible(page, "#denegado"));
  ok("y no ve la pantalla", !(await visible(page, "#app")));
  ok("la función nunca se llama", pedidos.length === 0);
  await ctx.close();
}

async function pruebaPantalla(browser) {
  console.log("\n=== La pantalla de administración ===");
  const { page, ctx, errores, pedidos } = await abrir(browser, true, {
    responder: (c) => {
      if (c.accion === "agregar_jugadores") {
        return { cuerpo: { cuentas: [
          { inscripcion_id: "i2", nombre: "Mena", usuario: "Mena_X", clave: "abcd2345" },
          { inscripcion_id: "i4", nombre: "María José Peña", usuario: "Maria_Pena_V", clave: "hjkm6789" },
        ], movidos: ["j1"], fallos: [] } };
      }
      if (c.accion === "crear_equipo" && c.nombre === "Los Alfiles") return { estado: 400, cuerpo: { error: "Ya hay un equipo con ese nombre." } };
      if (c.accion === "reiniciar_clave") return { cuerpo: { usuario: "Ana_Rojas_C", clave: "zzzz2222" } };
      return { cuerpo: { ok: true } };
    },
  });
  await page.waitForSelector("#app:not(.hidden)");
  ok("quien administra ve la pantalla", (await visible(page, "#app")) && !(await visible(page, "#denegado")));
  igual("la función recibió la sesión de la Academia", pedidos[0].auth, "Bearer token-de-la-academia");
  igual("y pidió el estado", pedidos[0].cuerpo.accion, "estado");

  const equipos = await page.$$eval("#lista-equipos h3", (hs) => hs.map((h) => h.textContent.trim()));
  igual("cada equipo con su cantidad de jugadores, y los que no tienen equipo aparte", equipos, ["Los Alfiles · 1 jugador", "Las Torres · 0 jugadores", "Sin equipo · 1 jugador"]);
  ok("un equipo vacío lo dice", /Todavía no tiene jugadores/.test(await page.$$eval("#lista-equipos p", (ps) => ps.map((p) => p.textContent).join(" "))));
  igual("la lista de equipos de destino", await page.$$eval("#destino option", (os) => os.map((o) => o.textContent)), ["Sin equipo", "Los Alfiles", "Las Torres"]);
  igual("el primer equipo viene elegido", await page.inputValue("#destino"), "e1");

  // El texto de una persona nunca es HTML.
  ok("un nombre con HTML se muestra como texto, no se ejecuta", !(await page.evaluate(() => window.__xss === 1)) && (await page.$$("#lista-inscritos img")).length === 0);
  ok("…y se lee tal cual", (await page.$eval("#lista-inscritos", (e) => e.textContent)).includes("<img src=x onerror=window.__xss=1> Mena"));
  ok("quien ya tiene cuenta lo dice", /Ya tiene cuenta \(Ana_Rojas_C\) en Los Alfiles/.test(await page.$eval("#lista-inscritos", (e) => e.textContent)));
  ok("el resumen cuenta las inscripciones", (await texto(page, "#resumen-inscritos")) === "Mostrando 4 de 4 inscripciones.");

  // El nivel con que se empareja
  const nivel = page.getByLabel("Nivel de Ana Rojas (Elo con que se empareja)");
  igual("cada jugador muestra su nivel", await nivel.inputValue(), "1000");
  await nivel.fill("1300");
  await nivel.dispatchEvent("change");
  await page.waitForFunction(() => document.body.textContent.indexOf("Nivel de Ana Rojas: 1300.") >= 0);
  igual("cambiar el nivel manda el jugador y el nivel", (({ jugador_id, fuerza }) => ({ jugador_id, fuerza }))(pedidos.filter((p) => p.cuerpo.accion === "fijar_nivel")[0].cuerpo), { jugador_id: "j1", fuerza: 1300 });
  await nivel.fill("50");
  await nivel.dispatchEvent("change");
  await page.waitForFunction(() => document.body.textContent.indexOf("El nivel va de 100 a 3500.") >= 0);
  ok("un nivel fuera de rango no se manda y el campo vuelve a lo anterior", pedidos.filter((p) => p.cuerpo.accion === "fijar_nivel").length === 1 && (await nivel.inputValue()) === "1300");
  await page.locator("#avisos-zona button").first().click();

  // Buscar
  await page.fill("#buscar", "maria");
  igual("buscar no distingue tildes", await page.$$eval("#lista-inscritos label", (ls) => ls.length), 1);
  await page.fill("#buscar", "");
  ok("sin marcar nada, el botón de agregar está apagado", await page.isDisabled("#agregar"));

  // Agregar
  await page.locator("#lista-inscritos label", { hasText: "Mena" }).locator("input").check();
  await page.locator("#lista-inscritos label", { hasText: "María José" }).locator("input").check();
  await page.locator("#lista-inscritos label", { hasText: "Ana Rojas" }).locator("input").check();
  igual("el botón dice cuántos y a qué equipo", await texto(page, "#agregar"), "Agregar 3 jugadores a «Los Alfiles»");
  await page.selectOption("#destino", "e2");
  igual("y cambia con el equipo elegido", await texto(page, "#agregar"), "Agregar 3 jugadores a «Las Torres»");
  await page.click("#agregar");
  await page.waitForSelector("#cuentas:not([hidden])");
  const agregar = pedidos.filter((p) => p.cuerpo.accion === "agregar_jugadores")[0].cuerpo;
  igual("manda el equipo y las inscripciones marcadas", [agregar.equipo_id, agregar.inscripciones.sort()], ["e2", ["i1", "i2", "i4"]]);
  ok("las claves se muestran en una tabla", (await page.$$eval("#cuentas-cuerpo tr", (r) => r.length)) === 2);
  igual("con usuario y clave", await page.$$eval("#cuentas-cuerpo tr:first-child td", (c) => c.map((x) => x.textContent)), ["Mena", "Mena_X", "abcd2345"]);
  ok("avisa que no se vuelven a ver", /no se vuelven a mostrar/.test(await texto(page, "#cuentas")));
  ok("el título recibe el foco", await page.evaluate(() => document.activeElement.id === "cuentas-titulo"));
  ok("las marcas se limpian después de agregar", (await page.$$eval("#lista-inscritos input:checked", (x) => x.length)) === 0);

  // El CSV que baja
  const [descarga] = await Promise.all([page.waitForEvent("download"), page.click("#bajar-csv")]);
  igual("el archivo se llama claves-sala.csv", descarga.suggestedFilename(), "claves-sala.csv");
  const csv = fs.readFileSync(await descarga.path(), "utf8");
  ok("el CSV empieza con BOM (Excel lee las tildes)", csv.charCodeAt(0) === 0xFEFF);
  igual("y trae los títulos y cada cuenta", csv.replace(/^﻿/, "").split("\r\n"), ['"Nombre","Usuario","Clave"', '"Mena","Mena_X","abcd2345"', '"María José Peña","Maria_Pena_V","hjkm6789"']);

  await page.click("#cerrar-cuentas");
  ok("cerrar esconde las claves y las borra de la página", !(await visible(page, "#cuentas")) && (await page.$$eval("#cuentas-cuerpo tr", (r) => r.length)) === 0);

  // Una clave nueva
  await page.locator("#lista-equipos tr", { hasText: "Ana Rojas" }).getByRole("button", { name: /Generar una clave nueva/ }).click();
  await page.getByRole("button", { name: "Generar clave nueva" }).click();
  await page.waitForSelector("#cuentas:not([hidden])");
  igual("la clave nueva sale en la misma tabla", await page.$$eval("#cuentas-cuerpo tr:first-child td", (c) => c.map((x) => x.textContent)), ["Ana Rojas", "Ana_Rojas_C", "zzzz2222"]);
  igual("y la pidió para ese jugador", pedidos.filter((p) => p.cuerpo.accion === "reiniciar_clave")[0].cuerpo.jugador_id, "j1");

  // Un error de la función se dice
  await page.fill("#equipo-nombre", "Los Alfiles");
  await page.click('#form-equipo button[type="submit"]');
  await page.waitForFunction(() => document.body.textContent.indexOf("Ya hay un equipo con ese nombre.") >= 0);
  ok("el error de la función se dice en pantalla", true);

  // Programar una arena: la hora es de Costa Rica (UTC−6).
  await page.fill("#arena-nombre", "Arena del viernes");
  await page.fill("#arena-inicia", "2026-11-05T19:00");
  await page.fill("#arena-minutos", "45");
  await page.selectOption("#arena-ritmo", "5+3");
  await page.fill("#arena-mejores", "4");
  await page.click('#form-arena button[type="submit"]');
  await page.waitForTimeout(300);
  const arena = pedidos.filter((p) => p.cuerpo.accion === "crear_torneo")[0].cuerpo;
  igual("la arena sale con la hora de Costa Rica en UTC, su ritmo y sus mejores",
    [arena.nombre, arena.inicia, arena.minutos, arena.inicial_seg, arena.incremento_seg, arena.por_equipos, arena.mejores],
    ["Arena del viernes", "2026-11-06T01:00:00.000Z", 45, 300, 3, true, 4]);
  const ritmos = await page.$$eval("#arena-ritmo option", (os) => os.map((o) => o.value));
  ok("el ritmo solo ofrece lo que la base acepta (hasta 30 min y 30 s de incremento)", ritmos.length > 5 && ritmos.indexOf("none") < 0 && ritmos.indexOf("30+20") >= 0 && ritmos.indexOf("30+0") >= 0, ritmos.join(","));
  await page.uncheck("#arena-equipos");
  ok("sin equipos no se pregunta por los mejores", !(await visible(page, "#arena-mejores-caja")));
  const lista = await texto(page, "#lista-arenas");
  ok("la arena programada sale con su hora de Costa Rica y su ritmo", /Arena de apertura/.test(lista) && /ritmo 3\+2/.test(lista) && /7:00/.test(lista), lista);

  // Celular
  await page.setViewportSize({ width: 390, height: 800 });
  ok("en el celular no se desborda a los lados", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  ok("sin errores de JavaScript", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

async function pruebaJuegoLimpio(browser) {
  console.log("\n=== El juego limpio ===");
  let anulada = false;
  const partidas = () => [
    { id: "p1", blancas: "Ana Rojas", negras: "<b>Luis</b>", resultado: "1-0", motivo: "mate", jugadas: 31, anulada,
      anulada_motivo: anulada ? "Declaró un mate que no era." : null, anulada_por: anulada ? "oscar@x.com" : null, anulada_en: anulada ? "2026-10-30T20:00:00Z" : null,
      salidas_blancas: 4, salidas_negras: 0, problemas: [{ tipo: "fin_falso", jugada: 31, detalle: "mate" }],
      indicios: { w: [{ tipo: "salidas", veces: 4 }], b: [{ tipo: "tiempos_parejos", jugadas: 18, promedio_ms: 6200 }] } },
    { id: "p2", blancas: "Ana Rojas", negras: "Luis Mora", resultado: "0-1", motivo: "abandono", jugadas: 22, anulada: false,
      salidas_blancas: 0, salidas_negras: 1, problemas: [], indicios: { w: [], b: [] } },
  ];
  const { page, ctx, errores, pedidos } = await abrir(browser, true, {
    responder: (c) => {
      if (c.accion === "juego_limpio") return { cuerpo: { partidas: partidas(), revisadas: 2 } };
      if (c.accion === "anular") { anulada = true; return { cuerpo: {} }; }
      if (c.accion === "devolver") { anulada = false; return { cuerpo: {} }; }
      return { cuerpo: { ok: true } };
    },
  });
  await page.waitForSelector("#app:not(.hidden)");
  const revisar = page.getByRole("button", { name: "Revisar las partidas de la arena Arena de apertura" });
  igual("«Revisar partidas» empieza cerrado", await revisar.getAttribute("aria-expanded"), "false");
  await revisar.click();
  await page.waitForFunction(() => /Juego limpio/.test(document.getElementById("lista-arenas").textContent));
  igual("pide el juego limpio de ESA arena", pedidos.filter((p) => p.cuerpo.accion === "juego_limpio")[0].cuerpo.torneo_id, "t1");
  igual("y dice que se abrió", await revisar.getAttribute("aria-expanded"), "true");
  const caja = await texto(page, "#lista-arenas");
  ok("dice cuántas se revisaron y cuántas tienen algo", /2 partidas terminadas revisadas con chess\.js\. 1 con algo para mirar\./.test(caja), caja);
  ok("y que son indicios, no pruebas", /indicios, no pruebas: nada se anula solo/.test(caja));
  ok("solo muestra las que tienen algo", !/Luis Mora/.test(caja));
  ok("el problema de la revisión, escrito", /Revisión: Se declaró «mate» y la posición no lo es\./.test(caja), caja);
  ok("cada indicio con el nombre de quien lo tuvo", /Indicio: Ana Rojas salió de la pantalla 4 veces durante la partida\./.test(caja)
    && /Indicio: <b>Luis<\/b> jugó 18 jugadas con tiempos muy parejos \(unos 6 s cada una\)\./.test(caja), caja);
  ok("un nombre con HTML es texto", (await page.$$("#lista-arenas b")).length === 0);

  // Anular sin motivo: no se llama a la función.
  await page.getByRole("button", { name: "Anular la partida Ana Rojas – <b>Luis</b>" }).click();
  await page.locator("dialog[data-avisos][open] input").fill("   ");
  await page.locator("dialog[data-avisos][open] [data-avisos-aceptar]").click();
  await page.waitForTimeout(200);
  ok("anular sin motivo no llama a la función", pedidos.filter((p) => p.cuerpo.accion === "anular").length === 0);
  await page.getByRole("button", { name: "Anular la partida Ana Rojas – <b>Luis</b>" }).click();
  igual("el botón del diálogo dice lo que hace", await page.locator("dialog[data-avisos][open] [data-avisos-aceptar]").textContent(), "Anular la partida");
  await page.locator("dialog[data-avisos][open] input").fill("Declaró un mate que no era.");
  await page.locator("dialog[data-avisos][open] [data-avisos-aceptar]").click();
  await page.waitForFunction(() => /Anulada: no cuenta/.test(document.getElementById("lista-arenas").textContent));
  igual("con motivo, manda la partida y el motivo", (({ partida_id, motivo }) => ({ partida_id, motivo }))(pedidos.filter((p) => p.cuerpo.accion === "anular")[0].cuerpo), { partida_id: "p1", motivo: "Declaró un mate que no era." });
  ok("la anulada dice su motivo y quién", /Motivo: Declaró un mate que no era\. · oscar@x\.com/.test(await texto(page, "#lista-arenas")));
  await page.getByRole("button", { name: "Devolver los puntos de la partida Ana Rojas – <b>Luis</b>" }).click();
  await page.locator("dialog[data-avisos][open] [data-avisos-aceptar]").click();
  await page.waitForFunction(() => !/Anulada: no cuenta/.test(document.getElementById("lista-arenas").textContent));
  igual("«Devolver los puntos» manda esa partida", pedidos.filter((p) => p.cuerpo.accion === "devolver")[0].cuerpo.partida_id, "p1");
  await revisar.click();
  igual("se vuelve a cerrar", await revisar.getAttribute("aria-expanded"), "false");
  ok("sin errores de JavaScript", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

/* Una arena en curso, para probar lo que se hace mientras corre. */
const AHORA = Date.now();
function arenaEnCurso(extra) {
  return Object.assign({}, ESTADO.torneos[0], { inicia: new Date(AHORA - 10 * 60000).toISOString(), minutos: 60, pausada: false, cerrada_en: null }, extra || {});
}
const CLASIFICACION = {
  equipos: [{ id: "e1", nombre: "Los Alfiles", puntos: 7, jugadores: 2 }, { id: "e2", nombre: "Las Torres", puntos: 3, jugadores: 1 }],
  jugadores: [
    { id: "j1", nombre: "Ana Rojas", equipo_id: "e1", equipo: "Los Alfiles", puntos: 5, partidas: 3, victorias: 2 },
    { id: "j3", nombre: "Mario Díaz", equipo_id: "e2", equipo: "Las Torres", puntos: 3, partidas: 2, victorias: 1 },
    { id: "j2", nombre: "Luis Mora", equipo_id: "e1", equipo: "Los Alfiles", puntos: 2, partidas: 2, victorias: 1 },
    { id: "j4", nombre: "Sofía Vega", equipo_id: "e2", equipo: "Las Torres", puntos: 0, partidas: 1, victorias: 0 },
  ],
};
const ACEPTAR = "dialog[data-avisos][open] [data-avisos-aceptar]";
const MAS_JUGADORES = [{ id: "j3", usuario: "Mario_D", nombre: "Mario Díaz", equipo_id: "e2", inscripcion_id: "i5", fuerza: 900 }];

function controlDe(torneo, extra) {
  return Object.assign({
    torneo, ahora: new Date().toISOString(), clasificacion: CLASIFICACION, racha: ["j1"],
    en_juego: [{ id: "p9", blancas: "j1", negras: "j2", nombre_blancas: "Ana Rojas", nombre_negras: "Luis Mora", jugadas: 12, resultado: null, motivo: null, anulada: false }],
    recientes: [{ id: "p8", blancas: "j3", negras: "j4", nombre_blancas: "Mario Díaz", nombre_negras: "Sofía Vega", jugadas: 30, resultado: "1-0", motivo: "mate", anulada: false }],
    fuera: ["j2"], esperando: 3,
  }, extra || {});
}

const lineasDe = (page) => page.$$eval("#lista-arenas button", (bs) => bs.map((b) => b.textContent.trim()));
const accion = (pedidos, nombre) => pedidos.filter((p) => p.cuerpo.accion === nombre).map((p) => p.cuerpo);

async function pruebaControl(browser) {
  console.log("\n=== El control de una arena en curso ===");
  let torneo = arenaEnCurso();
  let esperando = 3;
  const { page, ctx, errores, pedidos } = await abrir(browser, true, {
    estado: () => ({ torneos: [torneo], jugadores: ESTADO.jugadores.concat(MAS_JUGADORES) }),
    responder: (c) => {
      if (c.accion === "control") return { cuerpo: controlDe(torneo, { esperando }) };
      if (c.accion === "pausar_arena") { torneo = Object.assign({}, torneo, { pausada: c.pausada }); return { cuerpo: { torneo } }; }
      return { cuerpo: { ok: true } };
    },
  });
  await page.waitForSelector("#app:not(.hidden)");
  igual("los botones de una arena, en orden", await lineasDe(page), ["Controlar", "Proyectar", "Resultados", "Partidas (PGN)", "Revisar partidas", "Borrar arena"]);
  const controlar = page.getByRole("button", { name: /^Controlar la arena Arena de apertura/ });
  igual("«Controlar» empieza cerrado", await controlar.getAttribute("aria-expanded"), "false");
  await controlar.click();
  await page.waitForFunction(() => /En curso · quedan/.test(document.getElementById("lista-arenas").textContent));
  igual("al abrirlo pide el control de ESA arena", accion(pedidos, "control")[0].torneo_id, "t1");
  const resumen = await texto(page, "#lista-arenas [role=status]");
  ok("dice el estado, lo que queda, las partidas en juego y quién espera", /^En curso · quedan \d+:\d\d(:\d\d)? · 1 partida en juego · 3 esperando rival$/.test(resumen), resumen);
  const lista = await texto(page, "#lista-arenas");
  ok("lista la partida en juego con sus jugadas", /Ana Rojas – Luis Mora · 12 jugadas/.test(lista), lista);
  ok("y las últimas terminadas con su resultado", /Mario Díaz – Sofía Vega · 1-0 \(mate\)/.test(lista), lista);
  ok("quien está fuera, con la forma de dejarlo volver", /Fuera: Luis Mora/.test(lista) && (await page.getByRole("button", { name: "Dejar volver a la arena a Luis Mora" }).count()) === 1);

  // Pausar y reanudar
  await page.getByRole("button", { name: "Pausar la arena Arena de apertura" }).click();
  await page.waitForFunction(() => /En pausa · quedan/.test(document.getElementById("lista-arenas").textContent));
  igual("pausar manda la arena y que se pause", (({ id, pausada }) => ({ id, pausada }))(accion(pedidos, "pausar_arena")[0]), { id: "t1", pausada: true });
  igual("el panel sigue abierto después de volver a pintar la lista", await page.getByRole("button", { name: /^Controlar la arena/ }).getAttribute("aria-expanded"), "true");
  await page.getByRole("button", { name: "Reanudar la arena Arena de apertura" }).click();
  await page.waitForFunction(() => /En curso · quedan/.test(document.getElementById("lista-arenas").textContent));
  igual("reanudar manda pausada falso", accion(pedidos, "pausar_arena")[1].pausada, false);

  // Sumar minutos
  await page.getByRole("button", { name: "Sumar 10 minutos a la arena Arena de apertura" }).click();
  await page.waitForFunction(() => document.body.textContent.indexOf("Arena alargada 10 minutos.") >= 0);
  igual("sumar minutos manda la arena y cuántos", (({ id, minutos }) => ({ id, minutos }))(accion(pedidos, "extender_arena")[0]), { id: "t1", minutos: 10 });

  // Terminarla: primero se arrepiente
  await page.getByRole("button", { name: "Terminar ahora la arena Arena de apertura" }).click();
  igual("el botón del diálogo dice lo que hace", await page.locator(ACEPTAR).textContent(), "Terminar la arena");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  ok("si se arrepiente, no la termina", accion(pedidos, "terminar_arena").length === 0);
  await page.getByRole("button", { name: "Terminar ahora la arena Arena de apertura" }).click();
  await page.locator(ACEPTAR).click();
  await page.waitForFunction(() => document.body.textContent.indexOf("Arena terminada.") >= 0);
  igual("terminarla manda esa arena", accion(pedidos, "terminar_arena")[0].id, "t1");

  // Cancelar una partida que se está jugando
  await page.getByRole("button", { name: "Cancelar la partida de Ana Rojas contra Luis Mora" }).click();
  igual("el diálogo explica que no cuenta para nadie", /no cuenta para nadie/.test(await page.locator("dialog[data-avisos][open]").textContent()), true);
  await page.locator(ACEPTAR).click();
  await page.waitForFunction(() => document.body.textContent.indexOf("Partida cancelada.") >= 0);
  igual("cancelarla manda esa partida", accion(pedidos, "abortar_partida")[0].id, "p9");

  // Sacar a un jugador de la arena
  const sacar = page.getByRole("button", { name: /^Sacar de la arena Arena de apertura/ });
  await sacar.click();
  await page.waitForFunction(() => document.body.textContent.indexOf("Elige a quién sacar.") >= 0);
  ok("sin elegir a nadie, no manda nada", accion(pedidos, "expulsar").length === 0);
  const selector = page.getByLabel("Jugador para sacar de la arena Arena de apertura");
  ok("el selector trae a todos los jugadores, con su equipo", (await selector.locator("option").allTextContents()).join("|") === "Elige un jugador…|Ana Rojas · Los Alfiles|Luis Mora|Mario Díaz · Las Torres", (await selector.locator("option").allTextContents()).join("|"));
  await selector.selectOption("j3");
  await sacar.click();
  igual("el botón del diálogo dice lo que hace", await page.locator(ACEPTAR).textContent(), "Sacarlo de la arena");
  await page.locator(ACEPTAR).click();
  await page.waitForFunction(() => document.body.textContent.indexOf("Mario Díaz ya no está en la arena.") >= 0);
  igual("sacarlo manda la arena y el jugador", accion(pedidos, "expulsar")[0], { accion: "expulsar", torneo_id: "t1", jugador_id: "j3" });
  await page.getByRole("button", { name: "Dejar volver a la arena a Luis Mora" }).click();
  await page.waitForFunction(() => document.body.textContent.indexOf("Luis Mora puede volver a entrar.") >= 0);
  igual("dejarlo volver lo dice con «fuera: false»", accion(pedidos, "expulsar")[1], { accion: "expulsar", torneo_id: "t1", jugador_id: "j2", fuera: false });

  // Se vuelve a leer solo mientras está abierto, y deja de hacerlo al cerrarlo.
  esperando = 5;
  await page.waitForFunction(() => /5 esperando rival/.test(document.getElementById("lista-arenas").textContent), null, { timeout: 8000 });
  ok("el panel se pone al día solo", true);
  await page.getByRole("button", { name: /^Controlar la arena/ }).click();
  igual("cerrarlo lo dice", await page.getByRole("button", { name: /^Controlar la arena/ }).getAttribute("aria-expanded"), "false");
  const antes = accion(pedidos, "control").length;
  await page.waitForTimeout(5600);
  igual("cerrado, deja de preguntar", accion(pedidos, "control").length, antes);
  ok("sin errores de JavaScript", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

/* El contraste de un color de la pantalla contra su fondo real, medido. */
const CONTRASTE = `(function (sel, fondoSel) {
  const num = (c) => c.match(/[\\d.]+/g).map(Number);
  const lum = (rgb) => { const [r, g, b] = rgb.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const fg = num(getComputedStyle(document.querySelector(sel)).color);
  const bg = num(getComputedStyle(document.querySelector(fondoSel)).backgroundColor);
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
})`;

async function pruebaProyector(browser) {
  console.log("\n=== La pantalla para proyectar ===");
  let torneo = arenaEnCurso();
  let clasificacion = CLASIFICACION;
  let falla = false;
  const { page, ctx, pedidos } = await abrir(browser, true, {
    estado: () => ({ torneos: [torneo] }),
    responder: (c) => {
      if (c.accion !== "control") return { cuerpo: { ok: true } };
      if (falla) return { estado: 502, cuerpo: { error: "La base no contesta." } };
      return { cuerpo: controlDe(torneo, { clasificacion }) };
    },
  });
  await page.waitForSelector("#app:not(.hidden)");
  const [proyector] = await Promise.all([ctx.waitForEvent("page"), page.getByRole("button", { name: /^Proyectar la clasificación de la arena Arena de apertura/ }).click()]);
  const errores = [];
  proyector.on("pageerror", (e) => errores.push(String(e)));
  await proyector.waitForSelector("#proyector:not([hidden])");
  await proyector.waitForFunction(() => document.querySelectorAll("#proy-equipos li").length === 2);
  ok("se abre en otra ventana, con la arena en la dirección", /\?proyector=t1$/.test(proyector.url()), proyector.url());
  ok("solo se ve la pantalla de proyectar: ni el panel ni el encabezado", !(await visible(proyector, "#app")) && !(await visible(proyector, "#header")));
  ok("el título recibe el foco", await proyector.evaluate(() => document.activeElement.id === "proy-titulo"));
  igual("el título es el de la arena", await texto(proyector, "#proy-titulo"), "Arena de apertura");
  igual("y dice cómo se juega", await texto(proyector, "#proy-detalle"), "60 minutos · partidas de 3+2 · por equipos: cuentan los 5 mejores de cada uno");
  ok("el reloj dice cuánto queda", /^Quedan \d+:\d\d(:\d\d)?$/.test(await texto(proyector, "#proy-reloj")), await texto(proyector, "#proy-reloj"));
  igual("los equipos, del que más puntos tiene al que menos", await proyector.$$eval("#proy-equipos .proy-nombre", (n) => n.map((x) => x.textContent)), ["Los Alfiles", "Las Torres"]);
  igual("con sus puntos", await proyector.$$eval("#proy-equipos .proy-puntos", (n) => n.map((x) => x.textContent)), ["7", "3"]);
  igual("la barra del primero es completa y la otra va en proporción", await proyector.$$eval("#proy-equipos .proy-relleno", (n) => n.map((x) => x.style.width)), ["100%", "43%"]);
  ok("el primer lugar lleva medalla y también lo dice con palabras", /🥇/.test(await texto(proyector, "#proy-equipos li:first-child .proy-puesto")) && /1\.º lugar/.test(await proyector.$eval("#proy-equipos li:first-child .proy-puesto", (e) => e.textContent)));
  const jugadores = await proyector.$$eval("#proy-jugadores li", (ls) => ls.map((l) => l.textContent.replace(/\s+/g, " ").trim()));
  ok("los jugadores, con la racha dicha con 🔥 y con texto", jugadores.length === 4 && /Ana Rojas 🔥 en racha/.test(jugadores[0]) && /Los Alfiles/.test(jugadores[0]), jugadores.join(" | "));
  igual("abajo, las partidas en juego y quién espera", await texto(proyector, "#proy-pie"), "1 partida en juego · 3 esperando rival");
  ok("hay botón de pantalla completa y vuelta al panel", (await proyector.getByRole("button", { name: "Pantalla completa" }).count()) === 1 && (await proyector.getByRole("link", { name: "Volver al panel" }).count()) === 1);

  // El contraste de lo que se proyecta, medido contra su fondo real.
  const medidas = {};
  for (const [nombre, sel, fondo] of [["nombre", ".proy-nombre", ".proyector"], ["puntos", ".proy-puntos", ".proyector"], ["equipo del jugador", ".proy-equipo", ".proyector"], ["reloj", "#proy-reloj", ".proyector"], ["detalle", "#proy-detalle", ".proyector"], ["pie", "#proy-pie", ".proyector"]]) {
    medidas[nombre] = await proyector.evaluate(`${CONTRASTE}(${JSON.stringify(sel)}, ${JSON.stringify(fondo)})`);
  }
  ok("todo el texto alcanza el contraste AA (4.5) contra el fondo", Object.values(medidas).every((v) => v >= 4.5), JSON.stringify(medidas));

  // Se pone al día solo.
  clasificacion = Object.assign({}, CLASIFICACION, { equipos: [{ id: "e2", nombre: "Las Torres", puntos: 9, jugadores: 1 }, CLASIFICACION.equipos[0]] });
  await proyector.waitForFunction(() => document.querySelector("#proy-equipos .proy-nombre").textContent === "Las Torres", null, { timeout: 9000 });
  ok("cuando cambia la clasificación, la pantalla cambia sola", true);

  // Pausa y fin
  torneo = arenaEnCurso({ pausada: true });
  await proyector.waitForSelector("#proy-aviso:not([hidden])", { timeout: 9000 });
  igual("en pausa lo dice grande", await texto(proyector, "#proy-aviso"), "⏸️ La arena está en pausa");
  const aviso = await proyector.evaluate(`${CONTRASTE}("#proy-aviso", "#proy-aviso")`);
  ok("y el aviso también tiene contraste", true);
  torneo = arenaEnCurso({ cerrada_en: new Date(Date.now() - 5000).toISOString() });
  await proyector.waitForFunction(() => document.getElementById("proy-reloj").textContent === "Terminó", null, { timeout: 9000 });
  igual("al terminar lo dice", await texto(proyector, "#proy-aviso"), "🏆 ¡Terminó la arena!");

  // Si la función falla, queda lo último que llegó y se dice.
  falla = true;
  await proyector.waitForSelector("#proy-error:not([hidden])", { timeout: 9000 });
  ok("si falla, lo dice y deja lo último que llegó", /La base no contesta/.test(await texto(proyector, "#proy-error")) && (await proyector.$$("#proy-equipos li")).length === 2);
  ok("pidió siempre la arena que se proyecta", accion(pedidos, "control").every((c) => c.torneo_id === "t1"));
  ok("sin errores de JavaScript", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

async function pruebaResultados(browser) {
  console.log("\n=== Los resultados, el Excel y los diplomas ===");
  const torneo = arenaEnCurso({ cerrada_en: new Date(AHORA - 60000).toISOString() });
  const { page, ctx, errores } = await abrir(browser, true, {
    estado: () => ({ torneos: [torneo] }),
    responder: (c) => (c.accion === "control" ? { cuerpo: controlDe(torneo) } : { cuerpo: { ok: true } }),
  });
  await page.waitForSelector("#app:not(.hidden)");
  await page.getByRole("button", { name: /^Ver los resultados y los diplomas de la arena Arena de apertura/ }).click();
  await page.waitForFunction(() => /Equipo ganador/.test(document.getElementById("lista-arenas").textContent));
  const caja = await texto(page, "#lista-arenas");
  ok("dice el equipo ganador", /Equipo ganador: Los Alfiles \(7 puntos\)/.test(caja), caja);
  ok("y los tres mejores jugadores", /🥇 Ana Rojas \(Los Alfiles\) · 5 puntos/.test(caja) && /🥈 Mario Díaz/.test(caja) && /🥉 Luis Mora/.test(caja), caja);
  ok("la arena terminó: no dice que son resultados parciales", !/todavía no termina/.test(caja));

  // El Excel (CSV): con BOM para que se lean las tildes.
  const [csvEquipos] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Bajar la clasificación de los equipos en Excel" }).click()]);
  igual("el archivo de los equipos", csvEquipos.suggestedFilename(), "arena-arena-de-apertura-equipos.csv");
  const texto1 = fs.readFileSync(await csvEquipos.path(), "utf8");
  ok("empieza con BOM", texto1.charCodeAt(0) === 0xFEFF);
  igual("y trae los puestos", texto1.replace(/^﻿/, "").split("\r\n"), ['"Puesto","Equipo","Puntos","Jugadores que cuentan"', '"1","Los Alfiles","7","2"', '"2","Las Torres","3","1"']);
  const [csvJug] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Bajar la clasificación de los jugadores en Excel" }).click()]);
  igual("el de los jugadores", fs.readFileSync(await csvJug.path(), "utf8").replace(/^﻿/, "").split("\r\n").slice(0, 3),
    ['"Puesto","Jugador","Equipo","Puntos","Partidas","Victorias"', '"1","Ana Rojas","Los Alfiles","5","3","2"', '"2","Mario Díaz","Las Torres","3","2","1"']);

  // Los diplomas
  await page.evaluate(() => { window.__imprimio = 0; window.print = () => { window.__imprimio++; }; });
  const marcas = page.locator("#lista-arenas fieldset input[type=checkbox]");
  igual("las opciones de diplomas: ganador y mejores vienen marcadas, la participación no", await marcas.evaluateAll((cs) => cs.map((c) => c.checked)), [true, true, false]);
  await marcas.nth(0).uncheck();
  await marcas.nth(1).uncheck();
  await page.getByRole("button", { name: "Imprimir los diplomas de la arena Arena de apertura" }).click();
  await page.waitForFunction(() => document.body.textContent.indexOf("Marca qué diplomas imprimir.") >= 0);
  ok("sin marcar nada, no imprime", (await page.evaluate(() => window.__imprimio)) === 0);
  await page.locator("#avisos-zona button").first().click();
  await marcas.nth(0).check();
  await marcas.nth(1).check();
  await page.getByRole("button", { name: "Imprimir los diplomas de la arena Arena de apertura" }).click();
  await page.waitForFunction(() => window.__imprimio === 1);
  const diplomas = await page.$$eval("#hoja-diplomas .diploma", (ds) => ds.map((d) => [d.querySelector(".diploma-titulo").textContent, d.querySelector(".diploma-nombre").textContent, d.querySelector(".diploma-texto").textContent]));
  igual("un diploma por persona: los del equipo campeón y los tres mejores", diplomas.map((d) => d[0] + " · " + d[1]),
    ["Equipo campeón · Ana Rojas", "Equipo campeón · Luis Mora", "Diploma de honor · Ana Rojas", "Diploma de honor · Mario Díaz", "Diploma de honor · Luis Mora"]);
  igual("el del equipo dice por qué", diplomas[0][2], "por integrar el equipo «Los Alfiles», campeón de la arena «Arena de apertura»");
  igual("el de honor dice el lugar y los puntos", diplomas[3][2], "por el segundo lugar entre los jugadores de la arena «Arena de apertura», con 3 puntos");
  const marca = await page.$eval("#hoja-diplomas .diploma img.diploma-marca", (i) => ({ src: i.getAttribute("src"), ancho: i.naturalWidth }));
  ok("cada diploma lleva la marca de agua de Ajedrez Integral, ya cargada", marca.src === "img/marca-agua-ajedrez-integral.png" && marca.ancho > 0, JSON.stringify(marca));
  ok("el diploma dice la fecha de la arena en hora de Costa Rica", /\d{4}$/.test(await page.$eval("#hoja-diplomas .diploma-fecha", (e) => e.textContent)));

  // Cómo sale en papel: una hoja A4 apaisada por diploma y nada más.
  await page.emulateMedia({ media: "print" });
  const papel = await page.evaluate(() => {
    const d = document.querySelector("#hoja-diplomas .diploma").getBoundingClientRect();
    return { encabezado: getComputedStyle(document.getElementById("header")).display, panel: document.getElementById("app").checkVisibility() ? "visible" : "oculto",
      hoja: getComputedStyle(document.getElementById("hoja-diplomas")).display, ancho: Math.round(d.width), alto: Math.round(d.height),
      salto: getComputedStyle(document.querySelector(".diploma")).breakAfter };
  });
  ok("al imprimir solo queda la hoja de diplomas", papel.encabezado === "none" && papel.panel === "oculto" && papel.hoja === "block", JSON.stringify(papel));
  ok("cada diploma es una hoja A4 apaisada (297 × 210 mm) y salta de página", Math.abs(papel.ancho - 1122) <= 2 && Math.abs(papel.alto - 794) <= 2 && papel.salto === "page", JSON.stringify(papel));
  await page.emulateMedia({ media: "screen" });
  ok("en pantalla los diplomas no se ven", !(await page.evaluate(() => document.getElementById("hoja-diplomas").checkVisibility())));
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  ok("después de imprimir, la capa de diplomas se quita", await page.evaluate(() => !document.getElementById("hoja-diplomas") && !document.body.classList.contains("imprimiendo-diplomas")));

  // Participación: todos los que jugaron
  await marcas.nth(0).uncheck();
  await marcas.nth(1).uncheck();
  await marcas.nth(2).check();
  await page.getByRole("button", { name: "Imprimir los diplomas de la arena Arena de apertura" }).click();
  await page.waitForFunction(() => window.__imprimio === 2);
  igual("la participación da uno a cada jugador que jugó", await page.$$eval("#hoja-diplomas .diploma-nombre", (n) => n.map((x) => x.textContent)), ["Ana Rojas", "Mario Díaz", "Luis Mora", "Sofía Vega"]);
  ok("sin errores de JavaScript", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

async function pruebaPgn(browser) {
  console.log("\n=== Las partidas en PGN ===");
  let partidas = [
    { id: "a", blancas: "Ana Rojas", negras: "Luis Mora", jugadas: [{ s: "e4" }, { s: "e5" }, { s: "Nf3" }, { s: "Nc6" }], resultado: "1-0", motivo: "abandono", creada_en: "2026-10-31T20:00:00Z" },
    { id: "b", blancas: "Mario Díaz", negras: "Sofía Vega", jugadas: [{ s: "d4" }, { s: "d5" }], resultado: "1/2-1/2", motivo: "acuerdo", creada_en: "2026-10-31T20:10:00Z" },
  ];
  const torneo = arenaEnCurso();
  const { page, ctx, errores, pedidos } = await abrir(browser, true, {
    estado: () => ({ torneos: [torneo] }),
    responder: (c) => (c.accion === "partidas_arena" ? { cuerpo: { torneo, partidas } } : { cuerpo: { ok: true } }),
  });
  await page.waitForSelector("#app:not(.hidden)");
  const [pgn] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Bajar las partidas de la arena Arena de apertura en PGN" }).click()]);
  igual("el archivo se llama con la arena", pgn.suggestedFilename(), "arena-arena-de-apertura.pgn");
  igual("pidió las partidas de ESA arena", accion(pedidos, "partidas_arena")[0].torneo_id, "t1");
  const texto1 = fs.readFileSync(await pgn.path(), "utf8");
  ok("trae las dos partidas con sus encabezados", ['[Event "Arena de apertura"]', '[White "Ana Rojas"]', '[Black "Luis Mora"]', '[Result "1-0"]', '[Result "1/2-1/2"]', '[TimeControl "180+2"]', '[Date "2026.10.31"]', '[Termination "Abandono"]', '[Termination "Acuerdo"]'].every((l) => texto1.includes(l)), texto1);
  ok("y las jugadas de cada una", /1\. e4 e5 2\. Nf3 Nc6 1-0/.test(texto1.replace(/\n/g, " ")) && /1\. d4 d5 1\/2-1\/2/.test(texto1.replace(/\n/g, " ")), texto1);
  partidas = [];
  await page.getByRole("button", { name: "Bajar las partidas de la arena Arena de apertura en PGN" }).click();
  await page.waitForFunction(() => document.body.textContent.indexOf("todavía no tiene partidas terminadas") >= 0);
  ok("sin partidas terminadas, lo dice en vez de bajar un archivo vacío", true);
  ok("sin errores de JavaScript", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

async function pruebaFallaTotal(browser) {
  console.log("\n=== Si la función falla ===");
  const { page, ctx } = await abrir(browser, true, { responder: () => ({ estado: 502, cuerpo: { error: "No se pudo leer la base." } }) });
  await page.waitForSelector("#app:not(.hidden)");
  await page.waitForSelector("#error-carga:not([hidden])");
  igual("se dice lo que pasó en vez de dejar listas vacías", await texto(page, "#error-carga"), "No se pudo leer la base.");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaPermiso(browser);
    await pruebaPantalla(browser);
    await pruebaJuegoLimpio(browser);
    await pruebaControl(browser);
    await pruebaProyector(browser);
    await pruebaResultados(browser);
    await pruebaPgn(browser);
    await pruebaFallaTotal(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " fallo(s)" : "\n✓ todo bien");
  process.exit(fallos ? 1 : 0);
})();
