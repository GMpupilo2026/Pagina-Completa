/* La inscripción configurable por evento (js/inscripcion-evento.js, la
 * función pareo-publicar con inscripcion.ts y torneos-pareo.html, que la usa).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - la categoría sale del AÑO de nacimiento, con sus límites, y lleva al
 *     torneo de Pareo de esa categoría (la U16 al de la U20);
 *   - el cierre se cuenta en hora de Costa Rica: un minuto antes, abierta; en
 *     el minuto del cierre, cerrada; y a las 9:30 p.m. del día «hasta» (que en
 *     UTC ya es el día siguiente) sigue abierta;
 *   - lo obligatorio no se manda vacío, y los valores por defecto (el club)
 *     salen puestos y vuelven al inscribir al siguiente;
 *   - lo que se manda llega a PareoPublicar.inscribir con los datos correctos
 *     («Apellidos, Nombre», la categoría con la rama, el sexo, la fecha, el
 *     ID FIDE que se buscó solo, la nota de las declaraciones) y al torneo de
 *     su categoría;
 *   - la configuración viaja en lo publicado sin cambiar lo de antes (un
 *     torneo sin configuración publica { abierta, hasta } igual que siempre),
 *     y la función la limpia y vuelve a comprobar el cierre, lo obligatorio y
 *     la categoría (inscripcion.ts, cargado con Node: acá no hay Deno);
 *   - el formulario de siempre de torneos-pareo.html sigue igual sin
 *     configuración (lo prueba también verificar-pareo-anuncio.js).
 *
 * El navegador habla con dobles: la tabla pareo_publicados (filtra por id de
 * verdad), la función pareo-publicar y la búsqueda de FIDE (pareo-listas-elo).
 *
 * Uso:  BASE_URL=http://localhost:8777 node herramientas/verificar-inscripcion-evento.js
 */
const path = require("path");
const { spawnSync } = require("child_process");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const IE = require(path.join(RAIZ, "js/inscripcion-evento.js"));
const PP = require(path.join(RAIZ, "js/pareo/publicar.js"));
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const ok = (c, m, detalle) => {
  if (c) console.log("  ✓ " + m);
  else { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; }
};
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};

const U12 = "11111111-1111-4111-8111-111111111111";
const U20 = "22222222-2222-4222-8222-222222222222";
// Un evento como la Eliminatoria JDN de Pérez Zeledón, hecho configuración.
const EVENTO = {
  abierta: true, hasta: "2026-11-20", cierre: "2026-11-20T22:00",
  categorias: [{ nombre: "U12", desde: 2015, hasta: 2020, torneo: U12 }, { nombre: "U16", desde: 2011, hasta: 2014, torneo: U20, juegaEn: "U20" }, { nombre: "U20", desde: 2007, hasta: 2010, torneo: U20 }],
  ramaEnCategoria: true,
  campos: { nombre: { forma: "apellidos" }, sexo: { obligatorio: true }, institucion: { defecto: "ADAPZ" }, fide: { buscar: true }, nota: { pedir: false } },
  declaraciones: [{ id: "afiliado", texto: "Quien juega está afiliado a la ADAPZ y al día.", nota: "Declara estar afiliado a la ADAPZ y al día." }],
};
const CR = (s) => new Date(s + "-06:00");

function pruebaSinNavegador() {
  console.log("\n=== La categoría por el año ===");
  const cfg = IE.normalizar(EVENTO);
  igual("2020 y 2015 son U12; 2014 y 2011, U16; 2010 y 2007, U20", ["2020-12-31", "2015-01-01", "2014-06-01", "2011-01-01", "2010-12-31", "2007-01-01"].map((d) => (IE.categoriaDe(cfg, d) || {}).nombre), ["U12", "U12", "U16", "U16", "U20", "U20"]);
  igual("2021 y 2006 no entran; sin fecha, tampoco", ["2021-01-01", "2006-12-31", "", "2015"].map((d) => IE.categoriaDe(cfg, d)), [null, null, null, null]);
  igual("la U16 juega en el torneo de la U20", [IE.torneoDe(cfg, IE.categoriaDe(cfg, "2012-03-03")), IE.torneoDe(cfg, IE.categoriaDe(cfg, "2016-03-03"))], [U20, U12]);
  const enU20 = IE.normalizar(Object.assign({}, EVENTO, { torneo: U20 }));
  igual("aunque el formulario esté en el torneo U20, una U12 va al suyo", IE.armarEnvio(enU20, { apellidos: "Rojas", nombre: "Luis", nacimiento: "2016-02-02", sexo: "M", responsable: "PRUEBA", contacto: "8888-8888", declaraciones: { afiliado: true }, permiso: true }, CR("2026-11-18T12:00:00")).torneo, U12);
  const conClave = IE.normalizar(Object.assign({}, EVENTO, { categorias: [{ nombre: "U12", desde: 2015, hasta: 2020, torneo: "U12" }], torneos: { U12: U12 } }));
  igual("o en el que la página encontró después (una clave de «torneos»)", IE.torneoDe(conClave, IE.categoriaDe(conClave, "2016-01-01")), U12);
  ok(cfg.campos.nacimiento.pedir && cfg.campos.nacimiento.obligatorio && !cfg.campos.categoria.pedir, "con categorías por año, la fecha se pide y es obligatoria, y la categoría no se elige a mano");

  console.log("\n=== El cierre, en hora de Costa Rica ===");
  igual("un minuto antes, abierta; en el minuto del cierre y después, cerrada", [CR("2026-11-20T21:59:00"), CR("2026-11-20T22:00:00"), CR("2026-11-21T08:00:00")].map((d) => IE.estado(cfg, d)),
    [{ abierta: true, motivo: "" }, { abierta: false, motivo: "cierre" }, { abierta: false, motivo: "hasta" }]);
  const soloDia = IE.normalizar({ abierta: true, hasta: "2026-11-20" });
  igual("«hasta» es un día completo de Costa Rica: a las 9:30 p.m. (las 3:30 del 21 en UTC) sigue abierta", [IE.estado(soloDia, new Date("2026-11-21T03:30:00Z")).abierta, IE.estado(soloDia, new Date("2026-11-21T06:30:00Z")).abierta], [true, false]);
  igual("cerrada en Pareo, cerrada siempre", IE.estado(IE.normalizar({ abierta: false }), CR("2026-01-01T00:00:00")).motivo, "cerrada");
  ok(/22:00|10:00/.test(IE.textoCierre(cfg, CR("2026-11-20T10:00:00"))) && /20 de noviembre/.test(IE.textoCierre(cfg, CR("2026-11-20T10:00:00"))), "dice hasta qué hora y qué día", IE.textoCierre(cfg, CR("2026-11-20T10:00:00")));

  console.log("\n=== Lo obligatorio, los valores por defecto y lo que se manda ===");
  const antes = CR("2026-11-18T12:00:00");
  const lleno = { apellidos: " Pérez  Mora ", nombre: "Ana", nacimiento: "2012-05-04", sexo: "F", institucion: "ADAPZ", fide: "123456", elo: "1500", responsable: "Mamá de Ana", contacto: "mama@ejemplo.com", declaraciones: { afiliado: true }, permiso: true };
  const r = IE.armarEnvio(cfg, lleno, antes);
  igual("va al torneo U20, con «Apellidos, Nombre», la categoría con la rama, el sexo, la fecha y la nota de la declaración", [r.torneo, r.inscripcion],
    [U20, { nombre: "Pérez Mora, Ana", institucion: "ADAPZ", categoria: "U16 Femenino", elo: 1500, fideId: "123456", responsable: "Mamá de Ana", contacto: "mama@ejemplo.com", nota: "Declara estar afiliado a la ADAPZ y al día.", sexo: "F", nacimiento: "2012-05-04" }]);
  const falta = (cambio) => IE.armarEnvio(cfg, Object.assign({}, lleno, cambio), antes);
  igual("sin apellidos, sin nombre, sin fecha, sin rama, sin contacto: no se manda, y dice qué campo", [falta({ apellidos: "" }).campo, falta({ nombre: "" }).campo, falta({ nacimiento: "" }).campo, falta({ sexo: "" }).campo, falta({ contacto: "88" }).campo],
    ["apellidos", "nombre", "nacimiento", "sexo", "contacto"]);
  igual("sin la declaración ni el consentimiento, tampoco", [falta({ declaraciones: {} }).campo, falta({ permiso: false }).campo], ["decl-afiliado", "permiso"]);
  igual("un ID FIDE con letras o un Elo de 5 cifras no se mandan", [falta({ fide: "12a" }).campo, falta({ elo: "15000" }).campo], ["fide", "elo"]);
  ok(/2007 a 2020/.test(falta({ nacimiento: "2005-01-01" }).error), "fuera de las categorías dice para qué años es", falta({ nacimiento: "2005-01-01" }).error);
  ok(/cerró/.test(IE.armarEnvio(cfg, lleno, CR("2026-11-20T22:00:00")).error || ""), "después del cierre no se arma nada");
  const sinTorneo = IE.normalizar(Object.assign({}, EVENTO, { categorias: [{ nombre: "U12", desde: 2015, hasta: 2020, torneo: "U12" }], torneos: {} }));
  ok(/todavía no tiene su torneo/.test(IE.armarEnvio(sinTorneo, Object.assign({}, lleno, { nacimiento: "2016-01-01" }), antes).error || ""), "una categoría cuyo torneo no apareció todavía no se manda");
  const deSiempre = IE.normalizar({ torneo: U12 });
  igual("sin configuración, el formulario de siempre: nombre, centro, categoría, Elo, ID FIDE y nota; sin fecha ni sexo",
    Object.entries(deSiempre.campos).filter(([, c]) => c.pedir !== false).map(([k]) => k), ["nombre", "categoria", "institucion", "elo", "fide", "nota"]);
  igual("y no pide la fecha ni manda campos que no pidió", Object.keys(IE.armarEnvio(deSiempre, { nombre: "PRUEBA", responsable: "PRUEBA", contacto: "8888-8888", permiso: true, sexo: "F", nacimiento: "2012-01-01" }, antes).inscripcion),
    ["nombre", "institucion", "categoria", "elo", "fideId", "responsable", "contacto", "nota"]);

  console.log("\n=== La configuración viaja en lo publicado ===");
  const t = T.nuevo({ nombre: "PRUEBA" });
  t.inscripcion = { abierta: true, hasta: "2026-11-20" };
  igual("sin configuración, lo publicado es { abierta, hasta } como siempre", PP.datosPublicos(t).inscripcion, { abierta: true, hasta: "2026-11-20" });
  t.inscripcionEvento = { cierre: "2026-11-20T22:00", categorias: EVENTO.categorias, campos: EVENTO.campos, secreto: "no viaja" };
  const d = PP.datosPublicos(t).inscripcion;
  ok(d.cierre === "2026-11-20T22:00" && d.categorias.length === 3 && d.campos.institucion.defecto === "ADAPZ" && !("secreto" in d) && d.abierta === true, "con ella, el cierre, las categorías y los campos (y nada que no conozca)", JSON.stringify(d));
  igual("y la página la vuelve a leer igual", IE.categoriaDe(IE.desdePublicado(d), "2012-01-01").nombre, "U16");

  console.log("\n=== La función: limpiar y volver a comprobar (inscripcion.ts) ===");
  const url = require("url").pathToFileURL(path.join(RAIZ, "supabase/functions/pareo-publicar/inscripcion.ts")).href;
  const s = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
    `import * as I from ${JSON.stringify(url)};
     const ev = JSON.parse(process.argv[1]);
     const CR = (s) => new Date(s + "-06:00");
     const limpio = I.limpiarInscripcion(Object.assign({}, ev, { textos: { titulo: "Inscríbete", "<x>": "no" }, campos: Object.assign({}, ev.campos, { raro: { pedir: true } }), categorias: ev.categorias.concat([{ nombre: "MAL", desde: 2020, hasta: 2010 }, { nombre: "U8", desde: 2018, hasta: 2020, torneo: "no-es-id" }]) }));
     const fila = (x) => Object.assign({ nombre: "PRUEBA", institucion: "ADAPZ", categoria: "", sexo: "F", nacimiento: "2012-05-04", nota: "" }, x);
     console.log(JSON.stringify({
       viejo: I.limpiarInscripcion({ abierta: true, hasta: "2026-11-20", otra: 1 }),
       limpio,
       cerrada: [CR("2026-11-20T21:59:00"), CR("2026-11-20T22:00:00")].map((d) => I.cerrada(limpio, d)),
       cerradaDia: [new Date("2026-11-21T03:30:00Z"), new Date("2026-11-21T06:30:00Z")].map((d) => I.cerrada({ abierta: true, hasta: "2026-11-20" }, d)),
       cerradaPareo: I.cerrada({ abierta: false }), sinIns: I.cerrada(null),
       bien: I.revisar(limpio, fila({ categoria: "U16 Femenino" }), ${JSON.stringify(U20)}),
       inventada: I.revisar(limpio, fila({ categoria: "U20 Femenino" }), ${JSON.stringify(U20)}),
       otroTorneo: I.revisar(limpio, fila({}), ${JSON.stringify(U12)}),
       sinFecha: I.revisar(limpio, fila({ nacimiento: null }), ${JSON.stringify(U20)}),
       sinSexo: I.revisar(limpio, fila({ sexo: "" }), ${JSON.stringify(U20)}),
       fuera: I.revisar(limpio, fila({ nacimiento: "2004-01-01" }), ${JSON.stringify(U20)}),
       deSiempre: I.revisar({ abierta: true, hasta: "" }, fila({ categoria: "Sub-12", sexo: "", nacimiento: null }), ${JSON.stringify(U12)}),
     }));`, JSON.stringify(EVENTO)], { encoding: "utf8" });
  if (s.status !== 0) { ok(false, "inscripcion.ts se carga con Node", s.stderr); return; }
  const x = JSON.parse(s.stdout);
  igual("un torneo sin configuración se guarda como siempre: { abierta, hasta }", x.viejo, { abierta: true, hasta: "2026-11-20" });
  ok(x.limpio.cierre === "2026-11-20T22:00" && x.limpio.categorias.length === 4 && x.limpio.categorias[3].torneo === "" && x.limpio.campos.institucion.defecto === "ADAPZ" && !x.limpio.campos.raro && x.limpio.textos.titulo === "Inscríbete" && !("<x>" in x.limpio.textos),
    "la configuración se guarda limpia: sin campos ni textos desconocidos ni categorías al revés, y un torneo que no es un id se cae", JSON.stringify(x.limpio));
  igual("el cierre en la función: un minuto antes, abierta; en el minuto, cerrada", x.cerrada, [false, true]);
  igual("y el día «hasta» entra completo en hora de Costa Rica", x.cerradaDia, [false, true]);
  igual("cerrada en Pareo o sin inscripción, cerrada", [x.cerradaPareo, x.sinIns], [true, true]);
  igual("la categoría la pone el año (con la rama que llega)", [x.bien, x.inventada], [{ categoria: "U16 Femenino" }, { categoria: "U16" }]);
  ok(/otro torneo/.test(x.otroTorneo.error || ""), "una U16 que llega al torneo U12 se rechaza", JSON.stringify(x.otroTorneo));
  ok(/fecha de nacimiento/.test(x.sinFecha.error || "") && /rama/.test(x.sinSexo.error || "") && /ninguna categoría/.test(x.fuera.error || ""), "sin fecha, sin rama o fuera de las categorías, se rechaza", JSON.stringify([x.sinFecha, x.sinSexo, x.fuera]));
  igual("sin configuración no pide nada nuevo y deja la categoría que llega", x.deSiempre, { categoria: "Sub-12" });
}

// ---------- En el navegador ----------
const LISTA_FIDE = [
  { fideId: "6400001", nombre: "Perez Mora, Ana", fed: "CRC", nacimiento: 2012, estandar: 1532 },
  { fideId: "6400002", nombre: "Perez Mora, Ana Lucia", fed: "ESP", nacimiento: 2012, estandar: 1700 },
];

async function dobles(ctx, filas) {
  const pedidos = [], fide = [];
  const json = (route, status, x) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(x) });
  // La tabla: filtra por id de verdad, en el resolver.
  await ctx.route("**/rest/v1/pareo_publicados**", (route) => {
    const u = new URL(route.request().url());
    const columnas = (f) => P.columnasPedidas(u.searchParams.get("select") || "", f);
    const id = u.searchParams.get("id");
    const elegidas = id && id.startsWith("eq.") ? filas.filter((f) => f.id === id.slice(3)) : filas;
    if (/vnd\.pgrst\.object/.test(route.request().headers().accept || "")) return elegidas.length ? json(route, 200, columnas(elegidas[0])) : json(route, 406, { code: "PGRST116" });
    return json(route, 200, elegidas.map(columnas));
  });
  await ctx.route("**/functions/v1/pareo-listas-elo*", (route) => {
    const b = JSON.parse(route.request().postData() || "{}");
    fide.push(b);
    const quita = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const ap = quita(b.q).split(",")[0].trim();
    const filasFide = LISTA_FIDE.filter((f) => quita(f.nombre).startsWith(ap));
    return json(route, 200, { ok: true, lista: "fide", filas: filasFide, total: filasFide.length, hayMas: false, periodo: null });
  });
  await ctx.route("**/functions/v1/pareo-publicar", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, body: "ok" });
    pedidos.push(JSON.parse(route.request().postData() || "{}"));
    return json(route, 200, { ok: true });
  });
  return { pedidos, fide };
}

async function pruebaNavegador(browser) {
  console.log("\n=== torneos-pareo.html con la configuración del torneo ===");
  const t = T.nuevo({ nombre: "PRUEBA ELIMINATORIA U20", fechaInicio: "2026-11-22", ciudad: "Pérez Zeledón" });
  t.anuncio = { hora: "08:00", contacto: "", texto: "" };
  t.inscripcion = { abierta: true, hasta: "2026-11-20" };
  t.inscripcionEvento = EVENTO;
  const fila = { id: U20, nombre: t.nombre, evento: "", lugar: t.ciudad, fecha: "2026-11-22", rondas: 0, rondas_total: 5, jugadores: 0, actualizado: "2026-11-15T15:00:00Z", datos: PP.datosPublicos(t) };
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1100, height: 900 } });
  const { pedidos, fide } = await dobles(ctx, [fila]);
  const page = await ctx.newPage();
  await P.dobleListaPareo(page, [fila]);
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.clock.setFixedTime(CR("2026-11-20T21:58:00"));
  await page.goto(BASE + "/torneos-pareo.html#t=" + U20, { waitUntil: "networkidle" });
  await page.waitForSelector("#tp-anuncio");
  ok(await P.vis(page, "#tp-i-form"), "antes del cierre trae el formulario");
  ok(/10:00\sp\.\s?m\..*20 de noviembre/.test(await page.textContent("#tp-i-cierre")), "y dice hasta qué hora (en hora de Costa Rica)", await page.textContent("#tp-i-cierre"));
  igual("el club viene puesto (ADAPZ) y no hay categoría para elegir a mano", [await page.inputValue("#tp-i-institucion"), await page.$("#tp-i-categoria")], ["ADAPZ", null]);
  ok(await P.vis(page, "#tp-i-apellidos") && await P.vis(page, "#tp-i-nacimiento") && await P.vis(page, "#tp-i-sexo-F") && !(await page.$("#tp-i-nota")), "pide apellidos, fecha y rama; la nota no, porque el evento no la pide");

  await page.fill("#tp-i-nacimiento", "2012-05-04");
  ok(/Categoría U16: juega en el torneo U20/.test(await page.textContent("#tp-i-categoria-estado")), "con la fecha dice la categoría y en qué torneo juega", await page.textContent("#tp-i-categoria-estado"));
  await page.fill("#tp-i-nacimiento", "2004-01-01");
  ok(/no entra en ninguna categoría/.test(await page.textContent("#tp-i-categoria-estado")), "fuera de los años, lo dice");
  await page.fill("#tp-i-nacimiento", "2012-05-04");

  await page.fill("#tp-i-apellidos", "Pérez Mora");
  await page.fill("#tp-i-nombre", "Ana");
  await page.press("#tp-i-nombre", "Tab");
  await page.waitForFunction(() => document.getElementById("tp-i-fide").value === "6400001");
  igual("el ID FIDE y el Elo se buscan solos (el de otra federación no cuenta)", [await page.inputValue("#tp-i-fide"), await page.inputValue("#tp-i-elo"), fide.length > 0], ["6400001", "1532", true]);

  await page.fill("#tp-i-responsable", "Mamá de Ana");
  await page.fill("#tp-i-contacto", "mama@ejemplo.com");
  await page.click("#tp-i-enviar");
  ok(/rama/i.test(await page.textContent("#tp-i-estado")) && !pedidos.length, "sin la rama no se manda nada", await page.textContent("#tp-i-estado"));
  await page.check("#tp-i-sexo-F");
  await page.click("#tp-i-enviar");
  ok(/afiliado/.test(await page.textContent("#tp-i-estado")) && !pedidos.length, "sin la declaración, tampoco");
  await page.check("#tp-i-decl-afiliado");
  await page.click("#tp-i-enviar");
  ok(/política de privacidad/.test(await page.textContent("#tp-i-estado")) && !pedidos.length, "sin el consentimiento, tampoco");
  await page.check("#tp-i-permiso");
  await page.click("#tp-i-enviar");
  await page.waitForFunction(() => /✓ Inscripción de Ana Pérez Mora enviada/.test(document.getElementById("tp-i-estado").textContent));
  igual("llega a PareoPublicar.inscribir: al torneo U20, con todos sus datos y el consentimiento", pedidos.map((x) => [x.accion, x.id, x.consentimiento, x.inscripcion]),
    [["inscribir", U20, true, { nombre: "Pérez Mora, Ana", institucion: "ADAPZ", categoria: "U16 Femenino", elo: 1532, fideId: "6400001", responsable: "Mamá de Ana", contacto: "mama@ejemplo.com", nota: "Declara estar afiliado a la ADAPZ y al día.", sexo: "F", nacimiento: "2012-05-04" }]]);
  igual("para inscribir al siguiente, todo vacío y el club otra vez en ADAPZ", [await page.inputValue("#tp-i-apellidos"), await page.inputValue("#tp-i-fide"), await page.inputValue("#tp-i-institucion"), await page.isChecked("#tp-i-permiso")], ["", "", "ADAPZ", false]);

  // El cierre llega con la página abierta: ya no se manda.
  await page.fill("#tp-i-apellidos", "Rojas");
  await page.fill("#tp-i-nombre", "Luis");
  await page.fill("#tp-i-nacimiento", "2016-02-02");
  await page.check("#tp-i-sexo-M");
  await page.fill("#tp-i-responsable", "Papá de Luis");
  await page.fill("#tp-i-contacto", "8888-8888");
  await page.check("#tp-i-decl-afiliado");
  await page.check("#tp-i-permiso");
  await page.click("#tp-i-enviar");
  await page.waitForFunction(() => /✓ Inscripción de Luis Rojas enviada/.test(document.getElementById("tp-i-estado").textContent));
  igual("un U12 inscrito desde el torneo U20 va al torneo U12, con la rama Absoluto", [pedidos[1].id, pedidos[1].inscripcion.categoria], [U12, "U12 Absoluto"]);
  await page.fill("#tp-i-apellidos", "Rojas");
  await page.fill("#tp-i-nombre", "Luis");
  await page.fill("#tp-i-nacimiento", "2016-02-02");
  await page.check("#tp-i-sexo-M");
  await page.fill("#tp-i-responsable", "Papá de Luis");
  await page.fill("#tp-i-contacto", "8888-8888");
  await page.check("#tp-i-decl-afiliado");
  await page.check("#tp-i-permiso");
  await page.clock.setFixedTime(CR("2026-11-20T22:00:00"));
  await page.click("#tp-i-enviar");
  ok(/cerró a las 10:00\sp\.\s?m\./.test(await page.textContent("#tp-i-estado")) && pedidos.length === 2 && await page.isDisabled("#tp-i-enviar"), "si el cierre llega con la página abierta, no se manda y el botón se apaga", await page.textContent("#tp-i-estado"));

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#tp-anuncio");
  ok(!(await page.$("#tp-i-form")), "después del cierre, el torneo ya no trae el formulario");

  console.log("\n=== Incrustada en la página de un evento ===");
  await page.clock.setFixedTime(CR("2026-11-18T09:00:00"));
  await page.goto(BASE + "/torneos-pareo.html", { waitUntil: "networkidle" });
  await page.evaluate(([ev]) => {
    const div = document.createElement("div");
    div.id = "evento-prueba";
    document.querySelector("main").prepend(div);
    window.InscripcionEvento.montar(div, Object.assign({}, ev, { prefijo: "ev", idioma: "en", campos: { institucion: { defecto: "CLUB X", obligatorio: true }, nota: { pedir: true, obligatorio: true } }, textos: { titulo: "Join the open" } }));
  }, [EVENTO]);
  igual("se arma con pocas líneas, con sus textos y su idioma", [await page.textContent("#ev-caja-titulo"), await page.textContent("#ev-enviar"), await page.inputValue("#ev-institucion")], ["Join the open", "Send the registration", "CLUB X"]);
  await page.fill("#ev-nombre", "PRUEBA EN INGLÉS");
  await page.fill("#ev-nacimiento", "2016-01-01");
  await page.fill("#ev-responsable", "PRUEBA");
  await page.fill("#ev-contacto", "prueba@ejemplo.com");
  await page.check("#ev-decl-afiliado");
  await page.check("#ev-permiso");
  await page.click("#ev-enviar");
  ok(/required field/.test(await page.textContent("#ev-estado")) && pedidos.length === 2 && await page.evaluate(() => document.activeElement.id) === "ev-nota", "la nota obligatoria no se salta, y el foco va a ella", await page.textContent("#ev-estado"));
  await page.fill("#ev-nota", "Llega tarde a la ronda 1");
  await page.click("#ev-enviar");
  await page.waitForFunction(() => /Registration of PRUEBA EN INGLÉS sent/.test(document.getElementById("ev-estado").textContent));
  const ult = pedidos[pedidos.length - 1];
  igual("la U12 va a su torneo, con la nota escrita y la de la declaración", [ult.id, ult.inscripcion.categoria, ult.inscripcion.nota], [U12, "U12", "Llega tarde a la ronda 1 Declara estar afiliado a la ADAPZ y al día."]);
  await page.evaluate(([ev]) => window.InscripcionEvento.montar(document.getElementById("evento-prueba"), Object.assign({}, ev, { prefijo: "ce", cierre: "2026-11-17T22:00" })), [EVENTO]);
  ok(await page.isDisabled("#ce-enviar") && /cerró a las 10:00\sp\.\s?m\. del 17 de noviembre/.test(await page.textContent("#ce-cierre")), "con el cierre ya pasado, lo dice y el botón queda apagado", await page.textContent("#ce-cierre"));
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  pruebaSinNavegador();
  const browser = await chromium.launch({ executablePath: CHROME });
  try { await pruebaNavegador(browser); } finally { await browser.close(); }
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron." : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
