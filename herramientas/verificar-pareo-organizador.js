/* «Torneos en Pareo Integral»: el organizador de cada torneo (su nombre, su
 * logo, su página y el sello «Verificado») y la moderación de la lista
 * (Reportar, y admin-pareo.html para ocultar y dar el sello). La Edge
 * Function pareo-publicar y las tablas pareo_publicados/pareo_organizadores
 * se reemplazan por dobles.
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - crear la organización manda nombre y logo (achicado, en base64) y
 *     guarda la clave en el navegador; cambiarla manda su id y su clave, y sin
 *     tocar el logo NO manda `logo` (si lo mandara en null, lo borraría);
 *   - al guardarla, los torneos ya publicados se ponen al día a su nombre, y
 *     publicar un torneo nuevo lleva el organizador;
 *   - el código para otra computadora se pega y queda;
 *   - los PDF llevan arriba su nombre (la marca de agua sigue siendo la de
 *     Ajedrez Integral);
 *   - la lista pública: el nombre de quien organiza, el sello escrito (no
 *     solo un color) y el filtro «Solo organizadores verificados»; la lista
 *     NUNCA pide el logo (pesa) ni la clave;
 *   - la ficha de un torneo con el logo, y la página del organizador (#o=)
 *     con todos sus torneos;
 *   - «Reportar este torneo» pide el motivo y manda id, motivo y detalle;
 *   - admin-pareo.html: solo quien administra; los reportes, el sello y
 *     ocultar pasan por public.pareo_moderar y el texto ajeno no se ejecuta.
 *
 * Lo que hace cumplir la BASE (anon no lee los reportes ni lo oculto, solo
 * administración llama a pareo_moderar y queda en la bitácora) se comprobó
 * impersonando roles en SQL: acá la base es de mentira.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-organizador.js
 */
const path = require("path");
const zlib = require("zlib");
const { chromium } = require("./lib/playwright-con-sesion");

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

// Un PNG de verdad (8 × 8, rojo), para subirlo como logo.
function png() {
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const trozo = (tipo, datos) => {
    const t = Buffer.concat([Buffer.from(tipo), datos]);
    const l = Buffer.alloc(4); l.writeUInt32BE(datos.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(t));
    return Buffer.concat([l, t, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 2;
  const filas = Buffer.concat(Array.from({ length: 8 }, () => Buffer.from([0, ...Array(8).fill([220, 30, 30]).flat()])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo("IHDR", ihdr), trozo("IDAT", zlib.deflateSync(filas)), trozo("IEND", Buffer.alloc(0))]);
}
const LOGO = "data:image/png;base64," + png().toString("base64");
const ORG_ID = "0000aaaa-0000-4000-8000-00000000000a";
const CLAVE = "c1a7e".repeat(8);

function torneo(nombre) {
  const t = T.nuevo({ nombre, rondasTotales: 3,
    jugadores: ["a", "b", "c", "d"].map((id, k) => ({ id: nombre.slice(-2) + id, nombre: "PRUEBA " + id.toUpperCase(), elo: 1800 - k * 100 })) });
  const j = t.jugadores.map((x) => x.id);
  t.rondas = [{ mesas: [{ b: j[0], n: j[3], r: "1-0" }, { b: j[2], n: j[1], r: null }], ausencias: {} }];
  return t;
}

// El doble de la Edge Function: anota cada pedido y contesta como ella.
async function dobleFuncion(page) {
  const pedidos = [];
  let n = 0;
  await page.route("**/functions/v1/pareo-publicar", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, body: "ok" });
    const body = JSON.parse(route.request().postData() || "{}");
    pedidos.push(body);
    let r = { ok: true, id: body.id };
    if (body.accion === "crear") r = { ok: true, id: "00000000-0000-4000-8000-00000000000" + (++n), clave: "clave-" + n };
    if (body.accion === "organizador") r = body.id ? { ok: true, id: body.id } : { ok: true, id: ORG_ID, clave: CLAVE };
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(r) });
  });
  return pedidos;
}

async function pruebaPareo(browser) {
  console.log("\n=== Tu organización, en pareo.html ===");
  const A = torneo("PRUEBA SUB-12");
  A.publicado = { id: "00000000-0000-4000-8000-0000000000a1", clave: "clave-a" };
  let pedidos;
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", async (p) => {
    pedidos = await dobleFuncion(p);
    await p.addInitScript((t) => {
      if (localStorage.getItem("pareo_lista_v1")) return;
      localStorage.setItem("pareo_lista_v1", JSON.stringify([{ id: "ta", nombre: t.nombre, actualizado: 1 }]));
      localStorage.setItem("pareo_torneo_v1_ta", JSON.stringify(t));
      localStorage.setItem("pareo_abierto_v1", "ta");
    }, A);
  });
  await page.click('[data-ficha="archivos"]');
  ok(await P.vis(page, "#pi-organizacion #pi-org-nombre"), "la ficha Archivos trae «Tu organización»");
  ok(await P.vis(page, "#pi-org-usar") && !(await page.$("#pi-org-copiar")), "sin organización: ofrece pegar un código, no copiarlo");
  ok(!(await P.vis(page, "#pi-org-vista")), "sin logo no hay vista previa vacía");

  await page.click("#pi-org-guardar");
  await page.waitForSelector('.avisos-mensaje[data-tipo="error"]');
  ok(!pedidos.some((x) => x.accion === "organizador"), "sin nombre no se manda nada (y lo dice)");

  await page.fill("#pi-org-nombre", "Club PRUEBA");
  await page.setInputFiles("#pi-org-logo", { name: "logo.png", mimeType: "image/png", buffer: png() });
  await page.waitForFunction(() => document.getElementById("pi-org-vista").checkVisibility());
  bien("al elegir el logo se ve la vista previa");
  await page.click("#pi-org-guardar");
  await page.waitForSelector("#pi-org-copiar");
  const crearOrg = pedidos.find((x) => x.accion === "organizador");
  ok(crearOrg && crearOrg.nombre === "Club PRUEBA" && !crearOrg.id && !crearOrg.clave, "crear manda el nombre, sin id ni clave", JSON.stringify(crearOrg || {}).slice(0, 200));
  ok(crearOrg && /^data:image\/(webp|png);base64,/.test(crearOrg.logo) && crearOrg.logo.length <= 190000, "y el logo achicado, en base64 y debajo del tope", (crearOrg && String(crearOrg.logo).slice(0, 40)));
  const guardada = await page.evaluate(() => JSON.parse(localStorage.getItem("pareo_organizador_v1")));
  igual("la clave queda en este navegador", [guardada.id, guardada.clave, guardada.nombre], [ORG_ID, CLAVE, "Club PRUEBA"]);
  ok(/torneos-pareo\.html#o=0000aaaa/.test(await page.getAttribute("#pi-org-pagina", "href")), "y enlaza a su página pública");
  await page.waitForFunction(() => true);
  const puestaAlDia = () => pedidos.find((x) => x.accion === "actualizar" && x.id === A.publicado.id);
  for (let i = 0; i < 20 && !puestaAlDia(); i++) await page.waitForTimeout(100);
  const act = puestaAlDia();
  ok(act && act.organizador && act.organizador.id === ORG_ID && act.organizador.clave === CLAVE, "el torneo ya publicado se pone al día a su nombre", JSON.stringify(act && act.organizador));

  console.log("\n=== Cambiar el nombre sin tocar el logo ===");
  const antes = pedidos.length;
  await page.fill("#pi-org-nombre", "Club PRUEBA Central");
  await page.click("#pi-org-guardar");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("pareo_organizador_v1")).nombre === "Club PRUEBA Central");
  const cambio = pedidos.slice(antes).find((x) => x.accion === "organizador");
  ok(cambio && cambio.id === ORG_ID && cambio.clave === CLAVE, "manda su id y su clave");
  ok(cambio && !("logo" in cambio), "y NO manda `logo` (en null lo borraría)", JSON.stringify(cambio || {}).slice(0, 200));
  ok((await page.evaluate(() => JSON.parse(localStorage.getItem("pareo_organizador_v1")).logo)) === crearOrg.logo, "el logo sigue guardado");

  console.log("\n=== Quitar el logo ===");
  const antes2 = pedidos.length;
  await page.click("#pi-org-quitar-logo");
  ok(!(await P.vis(page, "#pi-org-vista")), "la vista previa se va");
  await page.click("#pi-org-guardar");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("pareo_organizador_v1")).logo === null);
  const quita = pedidos.slice(antes2).find((x) => x.accion === "organizador");
  ok(quita && "logo" in quita && quita.logo === null, "manda `logo: null`");

  console.log("\n=== Un torneo nuevo se publica a su nombre ===");
  await page.evaluate(() => { const t = JSON.parse(localStorage.getItem("pareo_torneo_v1_ta")); delete t.publicado; localStorage.setItem("pareo_torneo_v1_ta", JSON.stringify(t)); });
  await page.reload({ waitUntil: "networkidle" });
  await page.click('[data-ficha="archivos"]');
  await page.click("#pi-publicar-reintentar");
  await page.waitForSelector("#pi-publicar-enlace");
  const crear = pedidos.find((x) => x.accion === "crear");
  ok(crear && crear.organizador && crear.organizador.id === ORG_ID && crear.organizador.clave === CLAVE, "«crear» lleva el organizador con su clave");
  ok(crear && !/c1a7e/.test(JSON.stringify(crear.torneo)), "y la clave no va dentro de los datos públicos del torneo");

  console.log("\n=== El PDF lleva su nombre arriba ===");
  const doc = await page.evaluate(async () => {
    let visto = null;
    const original = window.PareoPDF.generar;
    window.PareoPDF.generar = async (d) => { visto = d; return new Blob(["x"]); };
    document.getElementById("pi-clas-pdf").click();
    for (let i = 0; i < 50 && !visto; i++) await new Promise((r) => setTimeout(r, 50));
    window.PareoPDF.generar = original;
    return visto && visto.cabecera;
  });
  ok(doc && doc.nombre === "Club PRUEBA Central", "la cabecera del PDF dice el nombre de la organización", JSON.stringify(doc));

  console.log("\n=== El código para otra computadora ===");
  await page.evaluate(() => localStorage.removeItem("pareo_organizador_v1"));
  await page.reload({ waitUntil: "networkidle" });
  await page.click('[data-ficha="archivos"]');
  await page.click("#pi-org-usar");
  await page.fill('dialog[data-avisos][open] input', "esto no es un código");
  await page.click("dialog[data-avisos][open] [data-avisos-aceptar]");
  await page.waitForFunction(() => /no es el de una organización/.test([...document.querySelectorAll('.avisos-mensaje[data-tipo="error"]')].map((m) => m.textContent).join(" ")) && !document.querySelector("dialog[data-avisos][open]"));
  ok(!(await page.evaluate(() => localStorage.getItem("pareo_organizador_v1"))), "un código malo no se guarda (y lo dice)");
  await page.click("#pi-org-usar");
  await page.fill('dialog[data-avisos][open] input', "org:" + ORG_ID + ":" + CLAVE);
  await page.click("dialog[data-avisos][open] [data-avisos-aceptar]");
  await page.waitForSelector("#pi-org-copiar");
  igual("el bueno sí, con su id y su clave", await page.evaluate(() => { const o = JSON.parse(localStorage.getItem("pareo_organizador_v1")); return [o.id, o.clave]; }), [ORG_ID, CLAVE]);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

// El doble de PostgREST para la página pública: los torneos y los
// organizadores, anotando qué columnas pide cada uno.
async function dobleBase(page, filas, orgs) {
  const pedidos = [];
  const json = (route, status, x) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(x) });
  await page.route("**/rest/v1/pareo_organizadores**", async (route) => {
    const u = new URL(route.request().url());
    const sel = u.searchParams.get("select") || "";
    pedidos.push({ tabla: "org", select: sel, id: u.searchParams.get("id") });
    const id = u.searchParams.get("id") || "";
    const cols = (o) => P.columnasPedidas(sel, o);
    if (id.startsWith("in.")) { const ids = id.slice(4, -1).split(",").map((x) => x.replace(/"/g, "")); return json(route, 200, orgs.filter((o) => ids.includes(o.id)).map(cols)); }
    if (id.startsWith("eq.")) {
      const o = orgs.find((x) => x.id === id.slice(3));
      const objeto = /vnd\.pgrst\.object/.test(route.request().headers().accept || "");
      if (objeto) return o ? json(route, 200, cols(o)) : json(route, 406, { code: "PGRST116", message: "0 rows" });
      return json(route, 200, o ? [cols(o)] : []);
    }
    return json(route, 200, orgs.map(cols));
  });
  await page.route("**/rest/v1/pareo_publicados**", async (route) => {
    const u = new URL(route.request().url());
    const sel = u.searchParams.get("select") || "";
    pedidos.push({ tabla: "pub", select: sel, id: u.searchParams.get("id"), org: u.searchParams.get("organizador_id") });
    const cols = (f) => P.columnasPedidas(sel, f);
    const id = u.searchParams.get("id") || "";
    if (id.startsWith("eq.")) {
      const f = filas.find((x) => x.id === id.slice(3));
      const objeto = /vnd\.pgrst\.object/.test(route.request().headers().accept || "");
      if (objeto) return f ? json(route, 200, cols(f)) : json(route, 406, { code: "PGRST116", message: "0 rows" });
      return json(route, 200, f ? [cols(f)] : []);
    }
    let lista = filas;
    const org = u.searchParams.get("organizador_id");
    if (org && org.startsWith("eq.")) lista = lista.filter((f) => f.organizador_id === org.slice(3));
    if (id.startsWith("neq.")) lista = lista.filter((f) => f.id !== id.slice(4));
    const cs = u.searchParams.get("datos");
    if (cs && cs.startsWith("cs.")) lista = [];
    return json(route, 200, lista.map(cols));
  });
  return pedidos;
}

async function pruebaPublica(browser) {
  console.log("\n=== torneos-pareo.html: quién organiza ===");
  const fila = (id, t, org, actualizado) => ({ id, nombre: t.nombre, evento: "", lugar: "San José", fecha: "2026-10-20", rondas: 1, rondas_total: 3,
    jugadores: t.jugadores.length, actualizado, datos: PP.datosPublicos(t), organizador_id: org, clave_hash: "NO-SE-LEE" });
  const VER = "1111aaaa-0000-4000-8000-000000000001", SIN = "2222aaaa-0000-4000-8000-000000000002";
  const orgs = [
    { id: VER, nombre: "Federación PRUEBA", logo: LOGO, verificado: true, clave_hash: "NO-SE-LEE" },
    { id: SIN, nombre: '<img src=x onerror="window.__xss=1">Club X', logo: "javascript:alert(1)", verificado: false, clave_hash: "NO-SE-LEE" },
  ];
  const filas = [
    fila("11111111-1111-4111-8111-111111111111", torneo("PRUEBA ABIERTO"), VER, "2026-10-22T15:00:00Z"),
    fila("22222222-2222-4222-8222-222222222222", torneo("PRUEBA CLUB"), SIN, "2026-10-21T15:00:00Z"),
    fila("33333333-3333-4333-8333-333333333333", torneo("PRUEBA SUELTO"), null, "2026-10-20T15:00:00Z"),
  ];
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  const pedidos = await dobleBase(page, filas, orgs);
  await P.dobleListaPareo(page, filas, { orgs });
  let reportes = [];
  await page.route("**/functions/v1/pareo-publicar", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, body: "ok" });
    reportes.push(JSON.parse(route.request().postData() || "{}"));
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ok: true }) });
  });
  await page.goto(BASE + "/torneos-pareo.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#tp-lista li .tp-org");
  const orgFila = (n) => page.$eval('#tp-lista [data-torneo^="' + n + '"]', (a) => { const li = a.closest("li"); const o = li.querySelector(".tp-org"); return o ? o.textContent : ""; });
  ok(/Federación PRUEBA/.test(await orgFila("1")) && /Verificado/.test(await orgFila("1")), "cada fila dice quién organiza, y el sello va escrito");
  ok(/Club X/.test(await orgFila("2")) && !/Verificado/.test(await orgFila("2")), "sin sello, sin «Verificado»");
  igual("un torneo sin organización no inventa una", await orgFila("3"), "");
  ok(!(await page.evaluate(() => window.__xss)) && !(await page.$("#tp-lista img[src='x']")), "el nombre que escribió alguien no se ejecuta");
  const pedidoLista = pedidos.filter((x) => x.tabla === "org");
  ok(pedidoLista.length && pedidoLista.every((x) => !/logo|clave/.test(x.select)), "la lista nunca pide el logo ni la clave de los organizadores", JSON.stringify(pedidoLista.map((x) => x.select)));
  ok(pedidoLista.length === 1 && /^in\./.test(pedidoLista[0].id), "los pide todos de una vez (no uno por fila)", JSON.stringify(pedidoLista));
  await page.check("#tp-f-verificado");
  await page.waitForFunction(() => document.querySelectorAll("#tp-lista [data-torneo]").length === 1).catch(() => {});
  igual("«Solo organizadores verificados» deja solo el de la federación", await page.$$eval("#tp-lista [data-torneo]", (l) => l.map((a) => a.dataset.torneo.slice(0, 1))), ["1"]);
  await page.click("#tp-f-quitar");
  await page.waitForFunction(() => document.querySelectorAll("#tp-lista [data-torneo]").length === 3).catch(() => {});
  igual("«Quitar los filtros» lo apaga", await page.$$eval("#tp-lista [data-torneo]", (l) => l.length), 3);

  console.log("\n=== La ficha del torneo ===");
  await page.click('#tp-lista [data-torneo^="1"]');
  await page.waitForSelector("#tp-organizador");
  ok(await page.$eval("#tp-organizador img", (i) => i.src.startsWith("data:image/png;base64,") && i.alt === "Logo de Federación PRUEBA" && i.naturalWidth > 0), "trae el logo de quien organiza, con su texto alternativo");
  ok(pedidos.some((x) => x.tabla === "org" && /logo/.test(x.select) && x.id === "eq." + VER), "el logo se pide solo para este organizador");
  await page.goto(BASE + "/torneos-pareo.html#t=22222222-2222-4222-8222-222222222222", { waitUntil: "networkidle" });
  await page.waitForSelector("#tp-organizador");
  ok(!(await page.$("#tp-organizador img")), "un logo que no es una imagen en base64 no llega a un <img>");

  console.log("\n=== Reportar este torneo ===");
  await page.click("#tp-reportar");
  await page.waitForSelector('dialog[data-avisos][open] select');
  await page.click("dialog[data-avisos][open] [data-avisos-aceptar]");
  await page.waitForFunction(() => /Elige qué pasa/.test(document.body.textContent));
  igual("sin motivo no se manda", reportes.length, 0);
  await page.waitForFunction(() => !document.querySelector('dialog[data-avisos="formulario"][open]'));
  await page.click("#tp-reportar");
  await page.waitForSelector('dialog[data-avisos][open] select');
  await page.selectOption("dialog[data-avisos][open] select", "falso");
  await page.fill("dialog[data-avisos][open] textarea", "  Es una prueba  ");
  await page.click("dialog[data-avisos][open] [data-avisos-aceptar]");
  await page.waitForFunction(() => /el reporte llegó/.test(document.body.textContent));
  igual("manda el id, el motivo y el detalle (sin espacios de más)", reportes.map((r) => [r.accion, r.id.slice(0, 1), r.motivo, r.detalle]), [["reportar", "2", "falso", "Es una prueba"]]);

  console.log("\n=== La página del organizador ===");
  await page.goto(BASE + "/torneos-pareo.html#o=" + VER, { waitUntil: "networkidle" });
  await page.waitForSelector("#tp-org-cuantos");
  igual("su nombre, el sello y cuántos torneos", [await page.textContent("#tp-titulo"), /Verificado/.test(await page.textContent("#tp-contenido")), await page.textContent("#tp-org-cuantos")], ["Federación PRUEBA", true, "1 torneo publicado"]);
  ok(/PRUEBA ABIERTO/.test(await page.textContent("#tp-contenido")) && !/PRUEBA CLUB|PRUEBA SUELTO/.test(await page.textContent("#tp-contenido")), "solo sus torneos");
  ok(pedidos.some((x) => x.tabla === "pub" && x.org === "eq." + VER), "los pide a la base por su id (no filtra la lista entera)");
  await page.goto(BASE + "/torneos-pareo.html#o=9999aaaa-0000-4000-8000-000000000009", { waitUntil: "networkidle" });
  await page.waitForFunction(() => /ya no está en la lista/.test(document.getElementById("tp-contenido").textContent));
  bien("un organizador oculto o que no existe lo dice");
  ok(pedidos.every((x) => !/(^|,)\*($|,)|clave/.test(x.select)), "nunca pide «*» ni la clave");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

// El cliente de Supabase de mentira de admin-pareo.html.
function clienteFalso(datos, yo) {
  return `
window.__rpc = [];
(function () {
  const D = ${JSON.stringify(datos)};
  const YO = ${JSON.stringify(yo)};
  function tabla(nombre) {
    const cond = [];
    let unica = false;
    const b = {
      select() { return b; }, order() { return b; }, range() { return b; },
      eq(c, v) { cond.push((f) => f[c] === v); return b; },
      in(c, vs) { cond.push((f) => vs.includes(f[c])); return b; },
      maybeSingle() { unica = true; return b; },
      then(res, rej) {
        let d = nombre === "profiles" ? [YO] : (D[nombre] || []);
        cond.forEach((f) => { d = d.filter(f); });
        return Promise.resolve({ data: unica ? (d[0] || null) : d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: YO.id }, access_token: "t" } } }) },
    from: tabla,
    rpc(n, args) {
      window.__rpc.push({ n, args });
      if (n !== "pareo_moderar") return Promise.resolve({ data: null, error: null });
      const { p_que, p_id } = args;
      const org = D.pareo_organizadores.find((o) => o.id === p_id);
      const pub = D.pareo_publicados.find((t) => t.id === p_id);
      if (p_que === "verificar") org.verificado = true;
      if (p_que === "quitar_sello") org.verificado = false;
      if (p_que === "ocultar") pub.oculto = true;
      if (p_que === "mostrar") pub.oculto = false;
      if (p_que === "revisado") D.pareo_reportes.find((r) => r.id === p_id).estado = "revisado";
      return Promise.resolve({ data: {}, error: null });
    },
  };
})();`;
}

async function pruebaAdmin(browser) {
  console.log("\n=== admin-pareo.html ===");
  const datos = {
    pareo_reportes: [{ id: "r-1", publicado_id: "t-1", motivo: "falso", detalle: '<img src=x onerror="window.__xss=1">es prueba', creado: "2026-10-23T15:00:00Z", estado: "nuevo" }],
    pareo_publicados: [{ id: "t-1", nombre: "PRUEBA TORNEO", oculto: false, fecha: "2026-10-20" }],
    pareo_organizadores: [{ id: "o-1", nombre: "Club PRUEBA", logo: LOGO, verificado: false, oculto: false }],
  };
  const abrir = async (yo) => {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
    await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
    await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(datos, yo) }));
    await page.goto(BASE + "/admin-pareo.html", { waitUntil: "networkidle" });
    return { ctx, page, errores };
  };
  {
    const { ctx, page } = await abrir({ id: "p-1", is_admin: false });
    await page.waitForFunction(() => !document.getElementById("denegado").classList.contains("hidden"));
    ok(await P.vis(page, "#denegado") && !(await P.vis(page, "#app")), "quien no administra ve «no tienes acceso», no la lista");
    await ctx.close();
  }
  const { ctx, page, errores } = await abrir({ id: "ad-1", is_admin: true });
  await page.waitForSelector("#ap-reportes tr[data-reporte]");
  const rep = await page.$eval("#ap-reportes tr[data-reporte]", (tr) => tr.textContent);
  ok(/PRUEBA TORNEO/.test(rep) && /Falso o de prueba/.test(rep), "el reporte, con su torneo y el motivo escrito");
  ok(!(await page.evaluate(() => window.__xss)) && !(await page.$("#ap-reportes img[src='x']")), "el detalle que escribió alguien no se ejecuta");
  await page.click('[data-ocultar="t-1"]');
  await page.waitForSelector("#ap-ocultos tr[data-oculto='t-1']");
  igual("«Ocultar el torneo» llama a pareo_moderar", await page.evaluate(() => window.__rpc.filter((r) => r.n === "pareo_moderar").map((r) => [r.n, r.args.p_que, r.args.p_id])), [["pareo_moderar", "ocultar", "t-1"]]);
  bien("y pasa a «Torneos ocultos»");
  await page.click('[data-sello="o-1"]');
  await page.waitForFunction(() => /Quitar el sello/.test(document.querySelector('[data-sello="o-1"]').textContent));
  ok(/✓ Verificado/.test(await page.$eval('#ap-organizaciones tr[data-org="o-1"]', (tr) => tr.textContent)), "«Dar el sello» lo deja escrito: «✓ Verificado»");
  await page.click('[data-revisado="r-1"]');
  await page.waitForFunction(() => !document.querySelector("#ap-reportes tr[data-reporte]"));
  bien("un reporte revisado sale de la lista de nuevos");
  await page.fill("#ap-org-buscar", "nadie");
  ok(/Ninguna organización coincide/.test(await page.textContent("#ap-organizaciones")), "el buscador de organizaciones filtra");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

function pruebaSinNavegador() {
  console.log("\n=== La función y la base ===");
  const fs = require("fs");
  const fn = fs.readFileSync(path.join(RAIZ, "supabase/functions/pareo-publicar/index.ts"), "utf8");
  ok(/accion === "organizador"/.test(fn) && /accion === "reportar"/.test(fn), "la función sabe crear organizaciones y recibir reportes");
  ok(!/verificado/.test(fn.replace(/\/\/.*$/gm, "")), "la función nunca escribe el sello (lo pone solo administración)");
  const sql = fs.readFileSync(path.join(RAIZ, "supabase/migraciones/20261023145437_pareo_organizadores.sql"), "utf8");
  ok(/grant select \(id, nombre, logo, verificado, oculto, creado, actualizado\) on public\.pareo_organizadores/.test(sql), "la clave de la organización no se puede leer desde afuera");
  ok(/coalesce\(\(select public\.soy_admin\(\)\), false\)/.test(sql) && /revoke all on function public\.pareo_moderar\(text, uuid\) from public, anon/.test(sql), "pareo_moderar valida que sea administración (y anon no la llama)");
}

(async () => {
  pruebaSinNavegador();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaPareo(browser);
    await pruebaPublica(browser);
    await pruebaAdmin(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
