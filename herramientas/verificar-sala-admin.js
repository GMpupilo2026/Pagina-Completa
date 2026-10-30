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
    { id: "j1", usuario: "Ana_Rojas_C", nombre: "Ana Rojas", equipo_id: "e1", inscripcion_id: "i1" },
    { id: "j2", usuario: "Luis_Mora", nombre: "Luis Mora", equipo_id: null, inscripcion_id: "i3" },
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
    const base = cuerpo.accion === "estado" ? ESTADO : {};
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
    await pruebaFallaTotal(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " fallo(s)" : "\n✓ todo bien");
  process.exit(fallos ? 1 : 0);
})();
