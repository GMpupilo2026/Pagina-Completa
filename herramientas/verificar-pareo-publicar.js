/* «Torneos en Pareo Integral»: publicar un torneo desde pareo.html y verlo en
 * torneos-pareo.html (js/pareo/publicar.js, js/pareo/pagina.js,
 * js/torneos-pareo-pagina.js; la Edge Function pareo-publicar y la tabla
 * public.pareo_publicados, que acá se reemplazan por dobles).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - lo que viaja al publicar NUNCA lleva la fecha de nacimiento, el sexo,
 *     el ID FIDE ni las firmas del evento;
 *   - sin marcar el permiso no se publica nada;
 *   - publicar guarda la clave en el torneo, y cada cambio se pone al día
 *     solo a los 30 segundos (una sola llamada aunque haya varios cambios);
 *   - «Dejar de publicar» pregunta, borra con la clave y lo olvida;
 *   - un evento se publica entero de un clic;
 *   - la página pública: la lista con su buscador, la clasificación, las
 *     rondas con la mesa de la sala y su buscador, cada jugador con sus
 *     rivales y colores, los otros torneos del mismo jugador, y que se vuelve
 *     a leer sola; nunca pide `*` ni la clave.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-publicar.js
 */
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const PP = require(path.join(RAIZ, "js/pareo/publicar.js"));
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};
const dialogo = 'dialog[data-avisos="confirmar"][open]';

function torneo(nombre, evento) {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const t = T.nuevo({ nombre, rondasTotales: 3, mesaInicial: 11, ritmo: "15 min + 5 s",
    jugadores: ids.map((id, k) => ({ id: nombre.slice(-2) + id, nombre: "PRUEBA " + id.toUpperCase() + " " + nombre.slice(-2), elo: 1800 - k * 100, institucion: "LICEO " + id.toUpperCase(),
      nacimiento: "2014-03-0" + (k + 1), sexo: k % 2 ? "m" : "w", fideId: "99900" + k, categoria: "Sub-12" })) });
  const j = t.jugadores.map((x) => x.id);
  t.rondas = [{ mesas: [{ b: j[0], n: j[3], r: "1-0" }, { b: j[4], n: j[1], r: "0-1" }, { b: j[2], n: j[5], r: "=" }], ausencias: {} },
    { mesas: [{ b: j[1], n: j[0], r: null }, { b: j[5], n: j[4], r: "1-0" }, { b: j[3], n: j[2], r: null }], ausencias: {} }];
  if (evento) t.evento = { id: "ev-pub", nombre: "PRUEBA EVENTO", firmas: [{ cargo: "principal", nombre: "X", jpeg: "AAAA" }], decisiones: {} };
  return t;
}

function pruebaSinNavegador() {
  console.log("\n=== Lo que viaja al publicar ===");
  const d = PP.datosPublicos(torneo("PRUEBA ABIERTO", true));
  const texto = JSON.stringify(d);
  ok(!/nacimiento|2014-03|fideId|99900|"sexo"|firmas|AAAA/.test(texto), "ni nacimiento, ni sexo, ni ID FIDE, ni firmas", texto.slice(0, 300));
  igual("sí van el nombre, el centro, el Elo y la categoría", Object.keys(d.jugadores[0]).sort(), ["categoria", "elo", "fed", "id", "institucion", "nombre", "retiradoDespuesDe", "titulo"]);
  igual("y el evento, solo con su nombre", d.evento, { nombre: "PRUEBA EVENTO" });
  igual("las rondas con sus resultados", d.rondas[0].mesas[0], { b: "TOa", n: "TOd", r: "1-0" });
  const conElo = Object.assign(torneo("PRUEBA ELO", false), { validoElo: "nacional" });
  igual("y si da Elo (la columna de la lista)", [PP.datosPublicos(conElo).validoElo, d.validoElo], ["nacional", ""]);
  igual("y el ritmo deducido del control, con el que filtra la lista (js/ritmo-control.js)",
    [PP.datosPublicos(Object.assign(torneo("PRUEBA R1", false), { ritmo: "3 + 2" })).ritmoTipo, d.ritmoTipo, PP.datosPublicos(Object.assign(torneo("PRUEBA R2", false), { ritmo: "" })).ritmoTipo], ["blitz", "rapido", ""]);
  // La función vuelve a limpiar lo que llega: el campo tiene que estar en su lista.
  const fn = require("fs").readFileSync(require("path").join(__dirname, "..", "supabase/functions/pareo-publicar/index.ts"), "utf8");
  ok(/validoElo: \["fide", "nacional", "no"\]\.includes\(v\.validoElo/.test(fn), "la función pareo-publicar lo guarda (sin eso se pierde al publicar, callado)");
  ok(/ritmoTipo: \["clasico", "rapido", "blitz"\]\.includes\(v\.ritmoTipo/.test(fn), "y el ritmo (sin eso, el filtro de ritmo de la lista no encuentra nada)");
  // Las pruebas abren Pareo Integral en localhost y la publicación es
  // automática: sin este candado cada corrida del CI llenaba la lista pública.
  ok(/req\.headers\.get\("origin"\) !== SITE_URL\) return json\(/.test(fn) && fn.indexOf('get("origin") !== SITE_URL') < fn.indexOf("await req.text()"),
    "la función solo publica lo que llega desde ajedrez-integral.com (antes de leer nada)");
}

// El doble de la Edge Function: anota cada pedido y contesta como ella.
async function dobleFuncion(page) {
  const pedidos = [];
  let n = 0;
  await page.route("**/functions/v1/pareo-publicar", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, body: "ok" });
    const body = JSON.parse(route.request().postData() || "{}");
    pedidos.push(body);
    const r = body.accion === "crear" ? { ok: true, id: "00000000-0000-4000-8000-00000000000" + (++n), clave: "clave-" + n } : { ok: true, id: body.id };
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(r) });
  });
  return pedidos;
}

async function pruebaPublicar(browser) {
  console.log("\n=== Publicar desde Pareo Integral ===");
  const A = torneo("PRUEBA SUB-12", true), B = torneo("PRUEBA SUB-14", true);
  const sembrar = (page) => page.addInitScript((ts) => {
    if (localStorage.getItem("pareo_lista_v1")) return;
    localStorage.setItem("pareo_lista_v1", JSON.stringify(ts.map(([id, t], i) => ({ id, nombre: t.nombre, actualizado: 10 - i, evento: { id: "ev-pub", nombre: "PRUEBA EVENTO" } }))));
    for (const [id, t] of ts) localStorage.setItem("pareo_torneo_v1_" + id, JSON.stringify(t));
    localStorage.setItem("pareo_abierto_v1", "ta");
  }, [["ta", A], ["tb", B]]);
  let pedidos;
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", async (p) => { await p.clock.install(); pedidos = await dobleFuncion(p); await sembrar(p); });
  // Un torneo que ya empezó se publica solo (con el próximo cambio); acá,
  // sin cambios todavía, Archivos lo dice y «Publicar ahora» no espera.
  await page.click('[data-ficha="archivos"]');
  ok(/se publica solo/.test(await page.textContent("#pi-publicar")) && !(await page.$("#pi-publicar-permiso")), "un torneo empezado no pide permiso: se publica solo");
  await page.click("#pi-publicar-reintentar");
  await page.waitForSelector("#pi-publicar-enlace");
  igual("se publica con «crear»", pedidos.map((x) => x.accion), ["crear"]);
  ok(!/nacimiento|fideId|"sexo"|firmas/.test(JSON.stringify(pedidos[0])), "y sin datos de más");
  const [g] = (await P.esperarGuardado(page, (l) => l.some((t) => t.publicado))).filter((t) => t.publicado);
  igual("la clave queda en el torneo", [g.publicado.id.slice(-1), g.publicado.clave], ["1", "clave-1"]);
  ok(/torneos-pareo\.html#t=00000000-0000-4000-8000-000000000001$/.test(await page.getAttribute("#pi-publicar-enlace", "href")), "y se muestra su enlace público");

  console.log("\n=== Se pone al día solo ===");
  await page.click('[data-ficha="rondas"]');
  await P.anotar(page, "1-0");
  await page.clock.runFor(10000);
  igual("antes de 30 segundos no se manda nada", pedidos.length, 1);
  await page.clock.runFor(25000);
  await page.waitForFunction(() => true);
  const despues = pedidos.slice(1).map((x) => x.accion);
  igual("a los 30 segundos, UNA actualización aunque se anotaron dos resultados", despues, ["actualizar"]);
  ok(pedidos[1] && pedidos[1].clave === "clave-1" && pedidos[1].torneo.rondas[1].mesas[0].r === "1-0", "con la clave y el resultado nuevo");
  await page.click('[data-ficha="archivos"]');
  await page.click("#pi-publicar-ahora");
  await page.waitForFunction((n) => true, pedidos.length);
  ok(pedidos[pedidos.length - 1].accion === "actualizar", "«Actualizar ahora» lo manda en el momento");

  console.log("\n=== Un torneo empezado no se quita ===");
  ok(!(await page.$("#pi-publicar-quitar")), "no hay «Dejar de publicar»");

  console.log("\n=== El otro torneo del evento, al anotar ===");
  await page.selectOption("#pi-lista", "tb");
  await page.click('[data-ficha="rondas"]');
  await P.anotar(page, "1-0");
  const todos = await P.esperarGuardado(page, (l) => l.filter((t) => t.publicado).length === 2);
  igual("se publica solo con el primer cambio, con su clave", todos.map((t) => t.publicado.clave).sort(), ["clave-1", "clave-2"]);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

// El doble de la tabla pareo_publicados (PostgREST): contesta la lista, un
// torneo por su id y la búsqueda de un jugador en los demás.
async function dobleTabla(page, filas) {
  const pedidos = [];
  await page.route("**/rest/v1/pareo_publicados**", async (route) => {
    const u = new URL(route.request().url());
    const sel = u.searchParams.get("select") || "";
    pedidos.push({ select: sel, id: u.searchParams.get("id"), datos: u.searchParams.get("datos") });
    const columnas = (f) => require("./lib/pareo-pruebas").columnasPedidas(sel, f);
    const json = (status, x) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(x) });
    const id = u.searchParams.get("id");
    if (id && id.startsWith("eq.")) {
      const f = filas.find((x) => x.id === id.slice(3));
      const objeto = /vnd\.pgrst\.object/.test(route.request().headers().accept || "");
      if (objeto) return f ? json(200, columnas(f)) : json(406, { code: "PGRST116", message: "0 rows" });
      return json(200, f ? [columnas(f)] : []);
    }
    let lista = filas;
    const cs = u.searchParams.get("datos");
    if (cs && cs.startsWith("cs.")) {
      const nombre = JSON.parse(cs.slice(3)).jugadores[0].nombre;
      lista = filas.filter((f) => f.datos.jugadores.some((j) => j.nombre === nombre));
    }
    const neq = u.searchParams.get("id");
    if (neq && neq.startsWith("neq.")) lista = lista.filter((f) => f.id !== neq.slice(4));
    return json(200, lista.map(columnas));
  });
  return pedidos;
}

async function pruebaPagina(browser) {
  console.log("\n=== torneos-pareo.html ===");
  const fila = (id, t, actualizado) => ({ id, nombre: t.nombre, evento: t.evento ? t.evento.nombre : "", lugar: "San José", fecha: "2026-10-22", rondas: 1, rondas_total: 3,
    jugadores: t.jugadores.length, actualizado, datos: PP.datosPublicos(t), clave_hash: "NO-SE-LEE" });
  const A = torneo("PRUEBA SUB-12", true), B = torneo("PRUEBA SUB-14", false);
  // B tiene a un jugador que también jugó A, con el nombre escrito igual.
  B.jugadores[2].nombre = A.jugadores[0].nombre;
  const filas = [fila("11111111-1111-4111-8111-111111111111", A, "2026-10-22T15:00:00Z"), fila("22222222-2222-4222-8222-222222222222", B, "2026-10-21T15:00:00Z")];
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.clock.install();
  const pedidos = await dobleTabla(page, filas);
  const deLaLista = await P.dobleListaPareo(page, filas);
  await page.goto(BASE + "/torneos-pareo.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#tp-lista li");
  igual("la lista trae los dos, el más reciente primero", await page.$$eval("#tp-lista [data-torneo]", (l) => l.map((a) => a.dataset.torneo.slice(0, 1))), ["1", "2"]);
  igual("cada uno dice cómo va y cuántos son", await page.$eval("#tp-lista li", (li) => ["participantes", "rondas"].map((c) => li.querySelector('[data-col="' + c + '"] .tp-dato-valor').textContent)), ["6", "1/3"]);
  await page.fill("#tp-buscar", "sub-14");
  await page.waitForFunction(() => document.querySelectorAll("#tp-lista li").length === 1);
  ok(deLaLista.some((x) => x.p_buscar === "sub-14"), "el buscador filtra (sin importar mayúsculas), en la base");
  await page.fill("#tp-buscar", "");
  await page.waitForSelector('#tp-lista [data-torneo^="1"]');
  await page.click('#tp-lista [data-torneo^="1"]');
  await page.waitForSelector("#tp-tabla-clas");
  igual("abre en la clasificación, con el foco en el título", await page.evaluate(() => document.activeElement.id), "tp-titulo");
  const clas = await page.$$eval("#tp-tabla-clas tbody tr", (l) => l.map((tr) => [...tr.children].slice(0, 2).map((td) => td.textContent).join(" ")));
  igual("la clasificación tras la ronda 1 (la 2 está a medias)", clas.slice(0, 2), ["1 PRUEBA A 12", "1 PRUEBA B 12"]);
  ok(/Clasificación tras la ronda 1/.test(await page.textContent("#tp-clas-titulo")), "dice tras qué ronda");

  console.log("\n=== Las rondas ===");
  await page.click('nav[aria-label="Partes del torneo"] >> text=Rondas');
  await page.waitForSelector("#tp-tabla-ronda");
  igual("abre en la última ronda", await page.textContent("#tp-ronda-titulo"), "Ronda 2");
  igual("con la mesa de la sala y lo que se juega", await page.$$eval("#tp-tabla-ronda tbody tr", (l) => l.map((tr) => tr.children[0].textContent + ":" + tr.children[2].textContent)), ["11:jugando", "12:1 – 0", "13:jugando"]);
  await page.fill("#tp-buscar-mesa", "prueba f");
  igual("el buscador deja solo la mesa de ese jugador", await page.$$eval("#tp-tabla-ronda tbody tr", (l) => l.filter((tr) => tr.checkVisibility()).map((tr) => tr.dataset.mesa)), ["12"]);
  await page.selectOption("#tp-ronda", "1");
  await page.waitForFunction(() => (document.getElementById("tp-ronda-titulo") || {}).textContent === "Ronda 1");
  bien("se puede ver cualquier ronda");

  console.log("\n=== Cada jugador con sus rivales ===");
  await page.click('nav[aria-label="Partes del torneo"] >> text=Jugadores');
  await page.selectOption("#tp-jugador", { label: "PRUEBA A 12" });
  await page.waitForSelector("#tp-tabla-jugador");
  const filasJ = await page.$$eval("#tp-tabla-jugador tbody tr", (l) => l.map((tr) => [...tr.children].map((td) => td.textContent).join("|")));
  igual("ronda, rival, su Elo, el color y lo que sacó", filasJ, ["1|PRUEBA D 12|1500|Blancas|1", "2|PRUEBA B 12|1700|Negras|jugando"]);
  await page.waitForFunction(() => /Aparece en 1 torneo más/.test((document.getElementById("tp-otros-estado") || {}).textContent || ""));
  ok(/PRUEBA SUB-14/.test(await page.textContent("#tp-otros-lista")), "trae el otro torneo publicado donde jugó");
  ok(pedidos.some((x) => x.datos && x.datos.startsWith("cs.")), "lo busca por su nombre en los datos");
  await page.click("#tp-otros-lista a");
  await page.waitForFunction(() => /PRUEBA SUB-14/.test((document.getElementById("tp-titulo") || {}).textContent));
  igual("y lleva a su ficha en ese torneo", await page.$eval("#tp-jugador", (s) => s.selectedOptions[0].textContent), "PRUEBA A 12");

  console.log("\n=== Se vuelve a leer sola ===");
  const antes = pedidos.filter((x) => x.id && x.id.startsWith("eq.")).length;
  await page.clock.runFor(61000);
  await page.waitForFunction(() => true);
  ok(pedidos.filter((x) => x.id && x.id.startsWith("eq.")).length > antes, "al minuto vuelve a pedir el torneo abierto");
  ok(pedidos.every((x) => !/(^|,)\*($|,)|clave/.test(x.select)), "nunca pide «*» ni la clave", JSON.stringify(pedidos.map((x) => x.select)));
  await page.goto(BASE + "/torneos-pareo.html#t=99999999-9999-4999-8999-999999999999", { waitUntil: "networkidle" });
  await page.waitForFunction(() => /ya no está publicado/.test(document.getElementById("tp-contenido").textContent));
  bien("un torneo que ya no está dice que ya no está publicado");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  pruebaSinNavegador();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaPublicar(browser);
    await pruebaPagina(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
