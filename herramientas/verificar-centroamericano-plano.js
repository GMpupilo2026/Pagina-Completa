/* Verifica el plano de la sala del Centroamericano 2026 (ver «El plano de la
 * sala» en docs/decisiones/juegos-y-torneos.md):
 *   - js/centroamericano-plano.js: dónde queda cada mesa (la fila desde
 *     adelante y la mesa desde la derecha), el borrador con la forma de la sala,
 *     los tableros repetidos que no dejan guardar;
 *   - la página pública: la tarjeta de «Busca a tu jugador» dice su fila y su
 *     mesa y marca la mesa en el plano chico; la ventana «Plano de la sala» lo
 *     muestra entero con su lista en texto; en inglés también;
 *   - la organización (centroamericano-mesas.html, «Plano de la sala»): arma
 *     el borrador con los inscritos, la primera fila sin dudas y las demás
 *     con su «?»; se corrige una mesa, «Numerar seguido» completa la fila, y
 *     se guarda con sala_plano_guardar() (sin la licencia, la base lo rechaza
 *     y la página lo dice).
 *
 * Con el sitio servido (npm run verificar lo levanta solo):
 *   python3 -m http.server 8777
 *   node herramientas/verificar-centroamericano-plano.js
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("./lib/playwright-con-sesion");
const { dobleOrganizacion } = require("./lib/doble-centroamericano-organizacion");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle !== undefined ? "\n      " + String(detalle).slice(0, 600) : "")); fallos++; }
}

// La sala de la prueba: la fila 1 es la del dueño (Sub-18 Femenino: una mesa
// sola, pasillo, dos juntas); la 2, Sub-18 Absoluto con dos grupos.
const PLANO = { v: 1, frente: "la cancha libre (la mascota)", fondo: "la bandera de Costa Rica", filas: [
  { grupos: [
    { torneo: "Sub-18 Femenino", mesas: [{ t: [1, 2] }] },
    { torneo: "Sub-18 Femenino", mesas: [{ t: [3, 4] }, { t: [5, 6] }] }] },
  { grupos: [
    { torneo: "Sub-18 Absoluto", mesas: [{ t: [1, 2] }] },
    { torneo: "Sub-18 Absoluto", mesas: [{ t: [3, 4] }, { t: [5, 6] }] },
    { torneo: "Sub-18 Absoluto", mesas: [{ t: [7, 8] }] }] }] };

// Lo que devuelve sala-jugadores en la página pública: cuatro jugadoras del
// Sub-18 Femenino en las mesas 2 y 3 de la ronda 1, y un Sub-18 Absoluto
// en la mesa 7.
const jug = (no, nombre, fed) => ({ puesto: no, no, titulo: "", nombre, fed, elo: 1800, grupo: "U18F", puntos: "0" });
const DATOS = { modalidad: "clasico", modalidades: ["clasico"], torneos: [
  { tnr: "1529776", texto: "Sub-18 Femenino", url: "x", leido_en: "2026-11-06T15:00:00Z", ronda: 0, rondas: 9,
    jugadores: [jug(1, "Arias Uno, Ana", "CRC"), jug(2, "Bravo Dos, Bea", "PAN"), jug(3, "Cruz Tres, Cata", "GUA"), jug(4, "Diaz Cuatro, Dora", "ESA")],
    pareo: { ronda: 1, mesas: [
      { mesa: 2, blancas: { no: 1, titulo: "", nombre: "Arias Uno, Ana" }, negras: { no: 2, titulo: "", nombre: "Bravo Dos, Bea" }, resultado: "" },
      { mesa: 3, blancas: { no: 3, titulo: "", nombre: "Cruz Tres, Cata" }, negras: { no: 4, titulo: "", nombre: "Diaz Cuatro, Dora" }, resultado: "" }] } },
  { tnr: "1529773", texto: "Sub-18 Absoluto", url: "x", leido_en: "2026-11-06T15:00:00Z", ronda: 0, rondas: 9,
    jugadores: [{ ...jug(1, "Elias Cinco, Eli", "HON"), grupo: "U18" }, { ...jug(2, "Fonseca Seis, Fede", "NCA"), grupo: "U18" }],
    pareo: { ronda: 1, mesas: [{ mesa: 7, blancas: { no: 1, titulo: "", nombre: "Elias Cinco, Eli" }, negras: { no: 2, titulo: "", nombre: "Fonseca Seis, Fede" }, resultado: "" }] } }] };

async function paginaPublica(nav, idioma) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await ctx.route(/supabase\.co|lichess\.org|chess-results\.com/, (r) => r.abort());
  await ctx.addInitScript(({ d, plano }) => {
    window.__pedidosPlano = 0;
    const consulta = () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => { if (/plano/.test(q._sel || "")) window.__pedidosPlano++; return { data: { plano }, error: null }; } }; q.select = (c) => { q._sel = c; return q; }; return q; };
    window.sb = { from: consulta, functions: { invoke: async () => ({ data: d, error: null }) } };
  }, { d: DATOS, plano: PLANO });
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(BASE + "/centroamericano-2026.html" + (idioma ? "?lang=" + idioma : ""), { waitUntil: "load" });
  return { ctx, p, errores };
}

async function buscar(p, q) {
  await p.fill("#buscador-nombre", q);
  await p.waitForFunction(() => document.querySelectorAll("#buscador-resultados li.cac-jugador").length > 0, null, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(300);
  return p.evaluate(() => [...document.querySelectorAll("#buscador-resultados li.cac-jugador")].map((li) => {
    const donde = li.querySelector(".cac-plano-donde");
    const marcada = li.querySelector(".cac-plano-marcada");
    const svg = li.querySelector(".cac-plano-svg");
    return { texto: li.innerText.replace(/\s+/g, " "), donde: donde ? donde.textContent : null,
      marcadaSeVe: !!marcada && marcada.checkVisibility() && marcada.getBoundingClientRect().width > 0,
      marcadaDice: marcada ? marcada.textContent : null, aria: svg ? svg.getAttribute("aria-label") : null };
  }));
}

(async () => {
  const nav = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    /* ---------------- el módulo ---------------- */
    console.log("El módulo (dónde queda cada mesa)");
    const { p: pm } = await paginaPublica(nav);
    const u = await pm.evaluate((plano) => {
      const P = window.CentroamericanoPlano;
      const b18 = P.borrador([{ torneo: "A", tableros: 18 }, { torneo: "B", tableros: 9 }], [0]);
      return {
        mesa2: P.ubicar(plano, "Sub-18 Femenino", 2), mesa3: P.ubicar(plano, "Sub-18 Femenino", 3), mesa6: P.ubicar(plano, "Sub-18 Femenino", 6),
        abs7: P.ubicar(plano, "Sub-18 Absoluto", 7), otro: P.ubicar(plano, "Sub-16 Femenino", 1), fuera: P.ubicar(plano, "Sub-18 Femenino", 40),
        forma18: b18.filas[0].grupos.map((g) => g.mesas.length), ultima18: b18.filas[0].grupos.slice(-1)[0].mesas.slice(-1)[0].t,
        forma9: b18.filas[1].grupos.map((g) => g.mesas.length), ultima9: b18.filas[1].grupos.slice(-1)[0].mesas.slice(-1)[0].t,
        dudas18: b18.filas[0].grupos.some((g) => g.mesas.some((m) => m.duda)), dudas9: P.dudas({ filas: [b18.filas[1]] }),
        repetida: P.problemas({ filas: [{ grupos: [{ torneo: "A", mesas: [{ t: [1, 2] }] }] }, { grupos: [{ torneo: "A", mesas: [{ t: [2, 3] }] }] }] }),
        mismoNumeroOtroTorneo: P.problemas({ filas: [{ grupos: [{ torneo: "A", mesas: [{ t: [1, 2] }] }, { torneo: "B", mesas: [{ t: [1, 2] }] }] }] }),
        basura: P.limpiar({ filas: [{ grupos: [{ torneo: "<b>x</b>", mesas: [{ t: [-3, "7", 2.5, 4] }] }] }], extra: 1 }),
      };
    }, PLANO);
    ok("la mesa 2 del Sub-18 Femenino: fila 1, la 1.ª desde la derecha (la mesa sola)", u.mesa2 && u.mesa2.fila === 1 && u.mesa2.desdeDerecha === 1, JSON.stringify(u.mesa2));
    ok("la 3, pasado el pasillo: la 2.ª desde la derecha", u.mesa3 && u.mesa3.fila === 1 && u.mesa3.desdeDerecha === 2, JSON.stringify(u.mesa3));
    ok("la 6: la 3.ª, la última de la fila", u.mesa6 && u.mesa6.desdeDerecha === 3 && u.mesa6.mesasEnFila === 3, JSON.stringify(u.mesa6));
    ok("la 7 del Sub-18 Absoluto: fila 2, la 4.ª (cada torneo cuenta sus propias mesas)", u.abs7 && u.abs7.fila === 2 && u.abs7.desdeDerecha === 4, JSON.stringify(u.abs7));
    ok("un torneo o una mesa que no está en el plano no se ubica", u.otro === null && u.fuera === null, JSON.stringify([u.otro, u.fuera]));
    ok("el borrador de 18 tableros: una mesa sola, dos juntas y después sueltas (9 mesas)", JSON.stringify(u.forma18) === "[1,2,1,1,1,1,1,1]" && JSON.stringify(u.ultima18) === "[17,18]", JSON.stringify([u.forma18, u.ultima18]));
    ok("con 9 tableros la última mesa queda con un tablero solo", JSON.stringify(u.ultima9) === "[9,null]", JSON.stringify(u.ultima9));
    ok("la fila confirmada va sin dudas y la otra con todas", !u.dudas18 && u.dudas9 === 5, JSON.stringify([u.dudas18, u.dudas9]));
    ok("un tablero repetido en el mismo torneo no deja guardar", u.repetida.length === 1 && /mesa 2 de A está dos veces/.test(u.repetida[0]), JSON.stringify(u.repetida));
    ok("el mismo número en dos torneos distintos sí se puede", u.mismoNumeroOtroTorneo.length === 0, JSON.stringify(u.mismoNumeroOtroTorneo));
    ok("lo que llega se limpia: solo números de 1 a 999, dos por mesa, y el resto fuera", JSON.stringify(u.basura.filas[0].grupos[0].mesas[0].t) === "[null,null]" && u.basura.extra === undefined && u.basura.frente, JSON.stringify(u.basura));
    await pm.context().close();

    /* ---------------- la página pública ---------------- */
    console.log("La página pública");
    const { p, errores } = await paginaPublica(nav);
    let r = await buscar(p, "bravo");
    ok("la tarjeta dice su fila y su mesa desde la derecha", r.length === 1 && r[0].donde === "📍 En la sala: fila 1 · la 1.ª mesa desde la derecha", JSON.stringify(r));
    ok("y marca su mesa en el plano chico (se ve, con sus dos números)", r[0] && r[0].marcadaSeVe && r[0].marcadaDice === "2 1", JSON.stringify(r[0]));
    ok("el plano chico le dice lo mismo al lector de pantalla", r[0] && /fila 1, la 1\.ª desde la derecha/.test(r[0].aria || ""), r[0] && r[0].aria);
    r = await buscar(p, "cruz tres");
    ok("la mesa 3, pasado el pasillo: la 2.ª desde la derecha", r[0] && r[0].donde === "📍 En la sala: fila 1 · la 2.ª mesa desde la derecha" && r[0].marcadaDice === "4 3", JSON.stringify(r));
    r = await buscar(p, "elias");
    ok("el Sub-18 Absoluto en la fila 2", r[0] && /fila 2 · la 4\.ª mesa/.test(r[0].donde || ""), JSON.stringify(r));
    ok("se pidió el plano una sola vez", await p.evaluate(() => window.__pedidosPlano) === 1, await p.evaluate(() => window.__pedidosPlano));
    // La ventana «Plano de la sala».
    await p.click('a[href="#plano"]');
    await p.waitForFunction(() => document.querySelector("#plano-contenido .cac-plano-svg"), null, { timeout: 5000 }).catch(() => {});
    const v = await p.evaluate(() => {
      const d = document.getElementById("plano");
      const svg = d.querySelector(".cac-plano-svg");
      return { abierta: d.open, svg: !!svg && svg.checkVisibility() && svg.getBoundingClientRect().width > 300,
        mesas: d.querySelectorAll(".cac-plano-mesa").length, lista: [...d.querySelectorAll(".cac-plano-lista li")].map((li) => li.textContent),
        ayuda: d.querySelector("#plano-contenido p").textContent, filas: [...d.querySelectorAll("text")].map((t) => t.textContent).filter((t) => /^Fila/.test(t)) };
    });
    ok("«Plano de la sala →» abre la ventana con el plano entero", v.abierta && v.svg && v.mesas === 7, JSON.stringify(v));
    ok("cada fila dice su torneo (el color no va solo)", JSON.stringify(v.filas) === JSON.stringify(["Fila 1 · Sub-18 Femenino", "Fila 2 · Sub-18 Absoluto"]), JSON.stringify(v.filas));
    ok("y la lista en texto dice lo mismo", JSON.stringify(v.lista) === JSON.stringify(["Fila 1: Sub-18 Femenino, mesas 1 a 6.", "Fila 2: Sub-18 Absoluto, mesas 1 a 8."]), JSON.stringify(v.lista));
    ok("con desde dónde se cuentan las filas", v.ayuda === "Las filas se cuentan desde la cancha libre (la mascota), mirando hacia la bandera de Costa Rica.", v.ayuda);
    // La fila 1 se dibuja abajo (cerca del frente) y la mesa 1 a la derecha.
    const pos = await p.evaluate(() => {
      const d = document.getElementById("plano");
      const caja = (n) => [...d.querySelectorAll(".cac-plano-mesa")].find((g) => g.textContent === n).getBoundingClientRect();
      return { m21: caja("2 1"), m43: caja("4 3"), abs: caja("2 1") };
    });
    const ab = await p.evaluate(() => { const d = document.getElementById("plano"); const g = [...d.querySelectorAll(".cac-plano-mesa")]; return { f1: g[0].getBoundingClientRect().top, f2: g[3].getBoundingClientRect().top }; });
    ok("la mesa 1 queda a la derecha de la 3 (se numera de derecha a izquierda)", pos.m21.left > pos.m43.left, JSON.stringify(pos));
    ok("la fila 1 se dibuja abajo, del lado del frente", ab.f1 > ab.f2, JSON.stringify(ab));
    ok("sin errores en la página", !errores.length, errores.join(" | "));
    await p.context().close();

    // En inglés.
    const en = await paginaPublica(nav, "en");
    r = await buscar(en.p, "bravo");
    ok("en inglés la tarjeta lo dice en inglés", r[0] && r[0].donde === "📍 In the hall: row 1 · table 1 from the right", JSON.stringify(r));
    await en.p.context().close();

    /* ---------------- la organización ---------------- */
    console.log("La organización (centroamericano-mesas.html, «Plano de la sala»)");
    const abrirOrg = async (licencia) => {
      const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1100, height: 900 } });
      await ctx.route("**/js/supabase-client.js", (rr) => rr.fulfill({ contentType: "application/javascript", body: dobleOrganizacion(licencia) }));
      await ctx.route("**/js/vendor/supabase.js", (rr) => rr.fulfill({ contentType: "application/javascript", body: "" }));
      await ctx.route(/supabase\.co|sentry|googletagmanager|lichess\.org/, (rr) => rr.abort());
      const q = await ctx.newPage();
      const errs = [];
      q.on("pageerror", (e) => errs.push(e.message));
      await q.goto(BASE + "/centroamericano-mesas.html#plano", { waitUntil: "load" });
      await q.waitForFunction(() => !document.getElementById("app").hidden, null, { timeout: 8000 }).catch(() => {});
      return { q, errs };
    };
    const { q, errs } = await abrirOrg(true);
    await q.click("#pest-plano");
    await q.waitForFunction(() => /Todavía no hay plano/.test(document.getElementById("pl-dibujo").textContent), null, { timeout: 5000 }).catch(() => {});
    ok("la pestaña se ve y, sin plano, dice cómo empezar", await q.evaluate(() => document.getElementById("panel-plano").checkVisibility() && /Todavía no hay plano/.test(document.getElementById("pl-dibujo").textContent) && document.getElementById("pl-guardar").disabled), await q.evaluate(() => document.getElementById("pl-dibujo").textContent));
    await q.click("#pl-borrador");
    await q.waitForFunction(() => document.querySelector("#pl-dibujo .cac-plano-svg"), null, { timeout: 5000 }).catch(() => {});
    const b = await q.evaluate(() => {
      const e = window.CentroamericanoPlanoEditor.estado();
      return { filas: e.plano.filas.map((f) => f.grupos[0].torneo), mesas: e.plano.filas.map((f) => f.grupos.reduce((s, g) => s + g.mesas.length, 0)),
        dudasFila1: e.plano.filas[0].grupos.some((g) => g.mesas.some((m) => m.duda)), estado: document.getElementById("pl-estado").textContent,
        punteadas: [...document.querySelectorAll("#pl-dibujo .cac-plano-mesa rect")].filter((r) => r.getAttribute("stroke-dasharray") !== "none").length };
    });
    ok("el borrador sigue el orden de la sala: Sub-18 Femenino, Sub-18 Absoluto, Sub-16 Femenino", JSON.stringify(b.filas) === JSON.stringify(["Sub-18 Femenino", "Sub-18 Absoluto", "Sub-16 Femenino"]), JSON.stringify(b.filas));
    ok("con las mesas que usa cada torneo, sin el bye (6, 19 y 9 tableros: 3, 10 y 5 mesas)", JSON.stringify(b.mesas) === "[3,10,5]", JSON.stringify(b.mesas));
    ok("la primera fila sin dudas y las demás punteadas, con cuántas faltan", !b.dudasFila1 && b.punteadas === 15 && /Faltan por revisar 15 mesas/.test(b.estado) && /sin guardar/.test(b.estado), JSON.stringify(b));
    // Tocar la 1.ª mesa de la fila 2, cambiarle los números y numerar seguido.
    await q.click('#pl-dibujo [data-mesa="1-0-0"]');
    await q.fill("#pl-derecha", "5");
    await q.dispatchEvent("#pl-derecha", "change");
    await q.fill("#pl-izquierda", "6");
    await q.dispatchEvent("#pl-izquierda", "change");
    await q.getByRole("button", { name: "Numerar seguido hacia la izquierda" }).click();
    await q.check("#pl-revisada");
    const n = await q.evaluate(() => { const f = window.CentroamericanoPlanoEditor.estado().plano.filas[1]; return { t: f.grupos.flatMap((g) => g.mesas.map((m) => m.t)), duda: f.grupos[0].mesas[0].duda, titulo: document.querySelector("#pl-mesa h4").textContent }; });
    ok("la mesa tocada se corrige y «Numerar seguido» completa la fila", JSON.stringify(n.t.slice(0, 3)) === "[[5,6],[7,8],[9,10]]" && JSON.stringify(n.t.slice(-1)) === "[[23,24]]", JSON.stringify(n.t));
    ok("y queda revisada; el formulario dice cuál es", n.duda === false && n.titulo === "Fila 2 · la 1.ª mesa desde la derecha", JSON.stringify(n));
    // Un pasillo nuevo y quitar una mesa.
    await q.getByRole("button", { name: "Poner un pasillo a la izquierda" }).click();
    const grupos = await q.evaluate(() => window.CentroamericanoPlanoEditor.estado().plano.filas[1].grupos.map((g) => g.mesas.length));
    ok("«Poner un pasillo» parte el grupo en la mesa tocada", JSON.stringify(grupos) === "[1,2,1,1,1,1,1,1,1]", JSON.stringify(grupos));
    // Guardar.
    await q.click("#pl-guardar");
    await q.waitForFunction(() => (window.__planos || []).length > 0, null, { timeout: 5000 }).catch(() => {});
    const g = await q.evaluate(() => ({ planos: (window.__planos || []).length, ultimo: (window.__planos || []).slice(-1)[0], estado: document.getElementById("pl-estado").textContent }));
    ok("«Guardar el plano» lo manda a sala_plano_guardar, ya limpio", g.planos === 1 && g.ultimo.v === 1 && g.ultimo.filas.length === 3 && g.ultimo.filas[1].grupos[0].mesas[0].t[0] === 5, JSON.stringify(g).slice(0, 300));
    ok("y después dice que lo que se ve es lo publicado", /es lo que está publicado/.test(g.estado), g.estado);
    // Un tablero repetido no se manda.
    await q.click('#pl-dibujo [data-mesa="1-1-0"]');
    await q.fill("#pl-derecha", "5");
    await q.dispatchEvent("#pl-derecha", "change");
    await q.click("#pl-guardar");
    await q.waitForTimeout(400);
    const rep = await q.evaluate(() => ({ planos: (window.__planos || []).length, aviso: [...document.querySelectorAll(".aviso, [role=alert], [role=status]")].map((x) => x.textContent).join(" | ") }));
    ok("con un tablero repetido no se guarda y se avisa cuál", rep.planos === 1 && /La mesa 5 de Sub-18 Absoluto está dos veces/.test(rep.aviso), JSON.stringify(rep));
    ok("sin errores en la página de la organización", !errs.length, errs.join(" | "));
    await q.context().close();

    // Sin la licencia, la página no deja entrar (y la base tampoco guardaría).
    const sin = await abrirOrg(false);
    ok("sin la herramienta, la página de la organización no se abre", await sin.q.evaluate(() => document.getElementById("app").hidden && !document.getElementById("denegado").hidden));
    await sin.q.context().close();

    // La base: la función revoca a anon y pide el permiso con coalesce.
    const mig = fs.readFileSync(path.join(RAIZ, "supabase/migraciones/20261106144102_sala_plano.sql"), "utf8");
    ok("sala_plano_guardar() no es de anon y su permiso va con coalesce", /revoke execute on function public\.sala_plano_guardar\(text, jsonb\) from public, anon/.test(mig) && /if not coalesce\(/.test(mig));
  } finally {
    await nav.close();
  }
  if (fallos) { console.log("\n✗ " + fallos + (fallos === 1 ? " comprobación falló." : " comprobaciones fallaron.")); process.exit(1); }
  console.log("\n✓ El plano de la sala está bien.");
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
