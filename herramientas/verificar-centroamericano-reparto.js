/* Verifica el reparto de los árbitros desde el plano de la sala (ver «El reparto
 * de los árbitros desde el plano» en docs/decisiones/juegos-y-torneos.md):
 *   - la cuenta (js/centroamericano-reparto.js): las tasas suavizadas, el
 *     recorrido en serpentina, zonas seguidas y parejas, la experiencia con la
 *     zona difícil, los tramos y lo que cambia (con la persona puesta ANTES de
 *     apagar un tramo, para que la tablet sepa a cuál pasarse);
 *   - la organización (centroamericano-mesas.html, «Plano de la sala»): la
 *     lista de árbitros, el análisis, las zonas en el plano, aprobar (una sola
 *     llamada a centroamericano_reparto_aplicar) y el aviso a cada árbitro;
 *   - la tablet (centroamericano-arbitro.html): con el enlace apagado por un
 *     reparto, pregunta centroamericano_seguir() y se pasa sola al nuevo;
 *   - la base: las migraciones con sus permisos.
 *
 * Con el sitio servido (npm run verificar lo levanta solo):
 *   python3 -m http.server 8777
 *   node herramientas/verificar-centroamericano-reparto.js
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("./lib/playwright-con-sesion");
const { dobleOrganizacion } = require("./lib/doble-centroamericano-organizacion");
const R = require("../js/centroamericano-reparto.js");

const RAIZ = path.join(__dirname, "..");
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle !== undefined ? "\n      " + String(detalle).slice(0, 700) : "")); fallos++; }
}

/* ---------------- la cuenta ---------------- */
console.log("La cuenta (js/centroamericano-reparto.js)");

// Las tasas: un torneo con 2 incidencias en 5 partidas no pasa por encima de uno con 14 en 38.
const T = R.tasas([{ tnr: "A", partidas: 80, incidencias: 4 }, { tnr: "B", partidas: 38, incidencias: 14 }, { tnr: "C", partidas: 5, incidencias: 2 }, { tnr: "D", partidas: 0, incidencias: 0 }]);
ok("la tasa se suaviza hacia la del evento (pocas partidas no hacen un incendio)", T.por.get("C").tasa < T.por.get("B").tasa && T.por.get("C").tasa < 0.4, JSON.stringify([...T.por]));
ok("un torneo sin partidas vale la tasa del evento", Math.abs(T.por.get("D").tasa - T.global) < 1e-9);
ok("el nombre del plano lleva al tnr de su enlace", R.tnrPorTexto([{ texto: "Sub-12 Absoluto", url: "https://s3.chess-results.com/tnr1529740.aspx?lan=2" }, { texto: "Info", url: "https://x.com" }]).get("Sub-12 Absoluto") === "1529740");

// Una sala: 4 filas, cada una de un torneo, grupos de 3 mesas con pasillo.
function fila(torneo, n) { const grupos = []; let k = 1; while (k <= n) { const g = { torneo, mesas: [] }; for (let i = 0; i < 3 && k <= n; i++) { g.mesas.push({ t: [k, k + 1 <= n ? k + 1 : null] }); k += 2; } grupos.push(g); } return { grupos }; }
const PLANO = { filas: [fila("A", 20), fila("B", 20), fila("C", 12), fila("D", 30)] };
const tnrDe = new Map([["A", "A"], ["B", "B"], ["C", "C"], ["D", "D"]]);
const ctx = { tnrDe, enJuego: new Map([["D", 26]]), tasas: T };

const rec = R.recorrido(PLANO, ctx);
ok("el recorrido va en serpentina: la fila 2 empieza del lado donde terminó la 1", rec[9].fi === 0 && rec[10].fi === 1 && rec[10].tableros[0] === 19 && rec[9].tableros[0] === 19, JSON.stringify(rec.slice(8, 12).map((x) => [x.fi, x.tableros])));
// Filas alineadas a la derecha y de largo distinto (como el Gimnasio): la fila 1 corta termina cerca del
// extremo DERECHO de la 2, así que la 2 se entra por la derecha, no por la otra punta de la sala.
{
  const r2 = R.recorrido({ filas: [fila("A", 6), fila("B", 20), fila("C", 8)] }, { tnrDe, enJuego: null, tasas: T });
  const f2 = r2.filter((x) => x.fi === 1), f3 = r2.filter((x) => x.fi === 2);
  ok("con filas de largo distinto, cada fila se entra por el extremo más cercano", f2[0].tableros[0] === 1 && f3[0].tableros[0] === 7, JSON.stringify([f2[0].tableros, f3[0].tableros]));
}
ok("las mesas fuera de la ronda no cargan (D: 26 de 30 en juego)", rec.filter((x) => x.torneo === "D").reduce((s, x) => s + x.jugando, 0) === 26);
ok("una mesa de un torneo con más incidencias carga más", rec.find((x) => x.torneo === "B").carga > rec.find((x) => x.torneo === "A").carga);

const zs = R.zonas(PLANO, ctx, 5);
const cargas = zs.map((z) => z.carga);
ok("cinco zonas seguidas que cubren todas las mesas, sin repetir", zs.length === 5 && zs.reduce((s, z) => s + z.mesas.length, 0) === rec.length);
ok("las zonas quedan parejas (la más cargada, a menos de 35 % de la más liviana)", Math.max(...cargas) / Math.min(...cargas) < 1.35, cargas.map((c) => c.toFixed(1)).join(" "));
const opt = R.zonas(PLANO, ctx, 5);
ok("la cuenta da siempre lo mismo", JSON.stringify(opt.map((z) => z.tramos)) === JSON.stringify(zs.map((z) => z.tramos)));
ok("los tramos juntan tableros seguidos y parten los huecos", JSON.stringify(R.tramos([{ tnr: "X", torneo: "X", tableros: [1, 2] }, { tnr: "X", torneo: "X", tableros: [3, 4] }, { tnr: "X", torneo: "X", tableros: [9, 10] }])) === JSON.stringify([{ tnr: "X", torneo: "X", desde: 1, hasta: 4 }, { tnr: "X", torneo: "X", desde: 9, hasta: 10 }]));
ok("con más árbitros que mesas en juego, no se inventan zonas vacías", R.zonas({ filas: [fila("A", 4)] }, { tnrDe, enJuego: null, tasas: T }, 5).length === 2);

// La asignación: el húngaro da el óptimo.
ok("el algoritmo húngaro da la asignación de menor costo", JSON.stringify(R.hungaro([[4, 1, 3], [2, 0, 5], [3, 2, 2]])) === JSON.stringify([1, 0, 2]));
const VIG = [
  { id: "a1", tnr: "A", mesa_desde: 1, mesa_hasta: 20, arbitro: "Ana", experiencia: 1, vence: "2026-11-10T00:00:00Z" },
  { id: "b1", tnr: "B", mesa_desde: 1, mesa_hasta: 20, arbitro: "Beto", experiencia: 3, persona: "pb", vence: "2026-11-10T00:00:00Z" },
  { id: "b2", tnr: "Z", mesa_desde: 1, mesa_hasta: 5, arbitro: "Beto", persona: "pb", vence: "2026-11-10T00:00:00Z" },
  { id: "c1", tnr: "C", mesa_desde: 1, mesa_hasta: 12, arbitro: "Caro", experiencia: 2, vence: "2026-11-10T00:00:00Z" },
  { id: "d1", tnr: "D", mesa_desde: 1, mesa_hasta: 15, arbitro: "Dani", experiencia: 0, vence: "2026-11-10T00:00:00Z" },
  { id: "e1", tnr: "D", mesa_desde: 16, mesa_hasta: 30, arbitro: "Eva", vence: "2026-11-10T00:00:00Z" },
  { id: "f1", tnr: "D", mesa_desde: 1, mesa_hasta: 30, arbitro: "Fito", vence: "2026-11-10T00:00:00Z" }];
const arbs = R.arbitrosDe(VIG).filter((a) => a.nombre !== "Fito");
ok("un árbitro por persona (Beto con dos tramos es uno)", arbs.length === 5 && arbs.find((a) => a.nombre === "Beto").tramos.length === 2);
const pr = R.asignar(zs, arbs);
const porTasa = pr.slice().sort((a, b) => b.tasa - a.tasa);
ok("la zona con más incidencias va al de más experiencia (internacional)", porTasa[0].arbitro.nombre === "Beto", porTasa.map((z) => z.arbitro.nombre + " " + z.tasa.toFixed(3)).join(", "));
ok("la segunda va al FIDE", porTasa[1].arbitro.nombre === "Caro", porTasa.map((z) => z.arbitro.nombre).join(", "));
ok("quien está en formación va a la zona más tranquila", porTasa[porTasa.length - 1].arbitro.nombre === "Dani", porTasa.map((z) => z.arbitro.nombre).join(", "));
ok("cada zona dice por qué", pr.every((z) => /incidencias/.test(z.porque) && z.porque.indexOf(z.arbitro.nombre) !== -1));
// Con experiencias iguales, cada uno se queda donde estaba.
const iguales = arbs.map((a) => Object.assign({}, a, { experiencia: 2 }));
const pr2 = R.asignar(zs, iguales);
ok("a igual experiencia, cada uno queda donde ya tenía más mesas", pr2.every((z) => z.sigue >= Math.max(...iguales.map((a) => R.yaLoTiene(z, a))) - 1e-9), pr2.map((z) => z.arbitro.nombre + " " + z.sigue.toFixed(2)).join(", "));

// Lo que cambia.
let k = 0;
const c = R.cambios(pr, VIG, new Set(["A", "B", "C", "D"]), () => "persona-" + (++k));
const acc = c.acciones;
ok("el tramo de un torneo fuera del plano no se toca (Beto en Z)", !acc.some((x) => x.id === "b2" && (x.tipo === "apagar" || x.desde !== 1 || x.hasta !== 5)));
ok("quien queda fuera del reparto pierde sus mesas del plano (Fito)", acc.some((x) => x.tipo === "apagar" && x.id === "f1") && c.fuera.length === 1);
const dani = acc.filter((x) => x.id === "d1" || (x.tipo === "crear" && x.arbitro === "Dani"));
const apagaD = acc.findIndex((x) => x.tipo === "apagar" && x.id === "d1");
const personaD = acc.findIndex((x) => x.tipo === "actualizar" && x.id === "d1" && x.persona);
ok("a quien se le apaga un tramo y se le crea otro, los dos con la misma persona, puesta ANTES de apagar", apagaD === -1 || (personaD !== -1 && personaD < apagaD && dani.filter((x) => x.persona).every((x) => x.persona === acc[personaD].persona)), JSON.stringify(dani));
// Un árbitro con un solo tramo, sin persona, que pasa entero a otro torneo: su tablet tiene que poder seguirlo.
{
  const solo = [{ id: "s1", tnr: "X", mesa_desde: 1, mesa_hasta: 10, arbitro: "Sol", vence: "2026-11-10T00:00:00Z" }];
  const [a] = R.arbitrosDe(solo);
  const cs = R.cambios([{ n: 1, arbitro: a, tramos: [{ tnr: "Y", torneo: "Y", desde: 1, hasta: 8 }] }], solo, new Set(["X", "Y"]), () => "p-sol").acciones;
  const iCrear = cs.findIndex((x) => x.tipo === "crear"), iPers = cs.findIndex((x) => x.tipo === "actualizar" && x.id === "s1" && x.persona === "p-sol"), iApagar = cs.findIndex((x) => x.tipo === "apagar" && x.id === "s1");
  ok("quien pasa entero a otro torneo: el nuevo y el viejo con la misma persona, puesta antes de apagar el viejo", iCrear !== -1 && cs[iCrear].persona === "p-sol" && iPers !== -1 && iApagar > iPers, JSON.stringify(cs));
}
ok("los tramos nuevos llevan la experiencia del árbitro", acc.filter((x) => x.tipo === "crear").every((x) => x.experiencia === arbs.find((a) => a.nombre === x.arbitro).experiencia));
const tod = new Map();
VIG.forEach((v) => tod.set(v.id, Object.assign({}, v)));
acc.forEach((x) => { if (x.tipo === "actualizar") Object.assign(tod.get(x.id), { mesa_desde: x.desde, mesa_hasta: x.hasta }); if (x.tipo === "apagar") tod.get(x.id).revocada = true; if (x.tipo === "crear") { const id = "n" + tod.size; tod.set(id, { id, tnr: x.tnr, arbitro: x.arbitro, persona: x.persona, experiencia: x.experiencia, mesa_desde: x.desde, mesa_hasta: x.hasta }); } });
const cubierto = (tnr, t) => [...tod.values()].filter((v) => !v.revocada && v.tnr === tnr && t >= v.mesa_desde && t <= v.mesa_hasta).length;
const huecos = rec.flatMap((x) => x.tableros.filter((t) => x.tnr && cubierto(x.tnr, t) !== 1).map((t) => x.tnr + t));
ok("después de aplicar, cada tablero del plano tiene exactamente un árbitro", huecos.length === 0, huecos.join(" "));
// Lo aplicado, leído de vuelta (con la persona que le quedó a cada uno), y la misma sugerencia otra vez.
const despues = [...tod.values()].filter((v) => !v.revocada).map((v) => Object.assign({}, v, { persona: (acc.filter((x) => x.id === v.id && x.persona).pop() || {}).persona || v.persona }));
const arbs2 = R.arbitrosDe(despues);
const pr3 = pr.map((z) => Object.assign({}, z, { arbitro: arbs2.find((a) => a.nombre === z.arbitro.nombre) }));
const otra = R.cambios(pr3, despues, new Set(["A", "B", "C", "D"]));
ok("volver a aplicar lo mismo no cambia nada", otra.acciones.length === 0, JSON.stringify(otra.acciones).slice(0, 400));

/* ---------------- la base ---------------- */
console.log("La base");
const mig1 = fs.readFileSync(path.join(RAIZ, "supabase/migraciones/20261106172826_centroamericano_reparto_arbitros.sql"), "utf8");
const mig2 = fs.readFileSync(path.join(RAIZ, "supabase/migraciones/20261106173042_centroamericano_reparto_seguir.sql"), "utf8");
ok("las tasas y aplicar no son de anon, y aplicar es INVOKER (rigen las políticas)", /revoke execute on function public\.centroamericano_reparto_tasas\(\) from public, anon/.test(mig1) && /revoke execute on function public\.centroamericano_reparto_aplicar\(jsonb\) from public, anon/.test(mig1) && /centroamericano_reparto_aplicar\(p_acciones jsonb\)[\s\S]*?security invoker/.test(mig2));
ok("aplicar pide el permiso con coalesce y marca el tramo apagado por un reparto", /if not coalesce\(\(select public\.tengo_herramienta\('mesa-arbitro'\)\), false\)/.test(mig2) && /set revocada = true, reemplazada_en = now\(\)/.test(mig2));
const mig3 = fs.readFileSync(path.join(RAIZ, "supabase/migraciones/20261106174149_centroamericano_seguir_concluidos.sql"), "utf8");
ok("seguir solo lleva desde un tramo apagado por un reparto, a uno vigente de la misma persona (abierto primero)", /a\.revocada and a\.reemplazada_en is not null/.test(mig3) && /h\.persona = a\.persona/.test(mig3) && /not h\.revocada and h\.vence > now\(\)/.test(mig3) && /order by \(h\.concluyo_en is null\) desc/.test(mig3));

/* ---------------- las páginas ---------------- */
(async () => {
  const nav = await chromium.launch();
  try {
    console.log("La organización (centroamericano-mesas.html, «Plano de la sala»)");
    const octx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1200, height: 900 } });
    await octx.route("**/js/supabase-client.js", (rr) => rr.fulfill({ contentType: "application/javascript", body: dobleOrganizacion(true) }));
    await octx.route("**/js/vendor/supabase.js", (rr) => rr.fulfill({ contentType: "application/javascript", body: "" }));
    await octx.route(/supabase\.co|sentry|googletagmanager|lichess\.org/, (rr) => rr.abort());
    const q = await octx.newPage();
    const errs = [];
    q.on("pageerror", (e) => errs.push(e.message));
    await q.goto(BASE + "/centroamericano-mesas.html", { waitUntil: "load" });
    await q.waitForFunction(() => !document.getElementById("app").hidden, null, { timeout: 8000 }).catch(() => {});
    // Tres árbitros en los torneos del plano (Sub-18 F, Sub-18 A y Sub-16 F) y las incidencias de cada torneo.
    // Vencen mañana: con una fecha fija, la prueba se vencía sola ese día (pasó el 10/11/2026).
    await q.evaluate(() => {
      const fila = (id, tnr, arbitro, d, h, exp) => ({ id, codigo: "X" + id, token: id.repeat(16).slice(0, 64), tnr, arbitro, nombrado: true, mesa_desde: d, mesa_hasta: h, vence: new Date(Date.now() + 864e5).toISOString(), revocada: false, creada: "2026-11-02T10:00:00Z", ultimo_uso: null, experiencia: exp });
      window.__asig.push(fila("lia1", "1529773", "Lía Internacional", 1, 19, 3), fila("mar1", "1529771", "Mario Aprendiz", 1, 9, 0), fila("nor1", "1529776", "Nora Nacional", 1, 6, 1));
      window.__tasas = [{ tnr: "1529776", partidas: 30, incidencias: 3 }, { tnr: "1529773", partidas: 80, incidencias: 4 }, { tnr: "1529771", partidas: 38, incidencias: 14 }];
    });
    await q.click("#pest-plano");
    await q.waitForFunction(() => window.CentroamericanoPlanoEditor && window.CentroamericanoPlanoEditor.estado().listo, null, { timeout: 5000 }).catch(() => {});
    await q.evaluate(() => window.CentroamericanoPlanoEditor.armarBorrador());
    await q.waitForFunction(() => document.querySelector("#pl-dibujo .cac-plano-svg"), null, { timeout: 5000 }).catch(() => {});
    await q.click("#rs-sugerir");
    await q.waitForFunction(() => document.querySelectorAll("#rs-zonas tbody tr").length > 0, null, { timeout: 8000 }).catch(() => {});
    const v = await q.evaluate(() => {
      const est = window.CentroamericanoRepartoPagina.estado();
      const marcados = [...document.querySelectorAll("#rs-arbitros input[type=checkbox]")].map((i) => [i.closest("label").textContent.trim(), i.checked]);
      const zonas = (est.propuesta || []).map((z) => ({ arbitro: z.arbitro && z.arbitro.nombre, tasa: z.tasa, tramos: z.tramos.map((t) => t.torneo + " " + t.desde + "-" + t.hasta) }));
      return {
        marcados, zonas,
        filas: [...document.querySelectorAll("#rs-zonas tbody tr")].filter((tr) => tr.checkVisibility()).length,
        svgZonas: [...document.querySelectorAll("#rs-dibujo svg text")].filter((t) => /^Z\d+$/.test(t.textContent)).length,
        dibujoVisible: !!document.querySelector("#rs-dibujo svg") && document.querySelector("#rs-dibujo svg").checkVisibility(),
        analisis: document.getElementById("rs-analisis").textContent,
        aprobar: !document.getElementById("rs-aprobar").disabled,
      };
    });
    ok("entran al reparto los árbitros del plano; Ana (Sub-10, fuera del plano) no", v.marcados.filter(([n, c]) => c).map(([n]) => n).sort().join("|") === "Lía Internacional|Mario Aprendiz|Nora Nacional", JSON.stringify(v.marcados));
    ok("la sugerencia: una zona por árbitro, visible", v.filas === 3 && v.zonas.length === 3, JSON.stringify(v));
    ok("el plano se pinta por zonas, con «Z1»… escrito (el color no va solo)", v.dibujoVisible && v.svgZonas > 0, v.svgZonas);
    const orden = v.zonas.slice().sort((a, b) => b.tasa - a.tasa);
    ok("la zona de más incidencias es de Lía (internacional) y la más tranquila de Mario (en formación)", orden[0].arbitro === "Lía Internacional" && orden[2].arbitro === "Mario Aprendiz", JSON.stringify(orden));
    ok("el análisis dice cómo está la sala hoy y con la sugerencia", /Cómo está la sala/.test(v.analisis) && /hoy va de/.test(v.analisis) && /con la sugerencia/.test(v.analisis) && /Sub-16 Femenino: 14 en 38 partidas/.test(v.analisis), v.analisis);
    ok("con la sugerencia lista, «Aprobar» se enciende", v.aprobar);

    // Aprobar: una sola llamada, con confirmación.
    await q.click("#rs-aprobar");
    await q.waitForSelector("dialog[open] [data-avisos-aceptar]", { timeout: 5000 }).catch(() => {});
    const textoConfirmar = await q.evaluate(() => (document.querySelector("dialog[open]") || {}).textContent || "");
    ok("antes de aplicar, dice qué le cambia a cada árbitro y que conviene entre rondas", /Z\d · /.test(textoConfirmar) && /entre rondas/.test(textoConfirmar), textoConfirmar.slice(0, 400));
    await q.click("dialog[open] [data-avisos-aceptar]");
    await q.waitForFunction(() => (window.__repartos || []).length === 1 && document.querySelectorAll("#rs-zonas tbody tr").length > 0, null, { timeout: 8000 }).catch(() => {});
    const d = await q.evaluate(() => {
      const act = window.__asig.filter((a) => !a.revocada && ["1529773", "1529771", "1529776"].includes(a.tnr));
      return {
        llamadas: (window.__repartos || []).length,
        avisos: (window.__llamadas || []).filter((l) => l.insert === "centroamericano_avisos").flatMap((l) => (Array.isArray(l.valores) ? l.valores : [l.valores])).map((x) => x.texto),
        act: act.map((a) => [a.arbitro, a.tnr, a.mesa_desde, a.mesa_hasta]),
        ana: window.__asig.find((a) => a.id === "asig-ana"),
      };
    });
    ok("aprobar es UNA llamada a centroamericano_reparto_aplicar", d.llamadas === 1);
    const cub = (tnr, t) => d.act.filter(([, x, a, b]) => x === tnr && t >= a && t <= b).length;
    // Los tableros del borrador: 6, 19 (la mesa 20 es el bye, sin tablero) y 9.
    const cuenta = { "1529776": 6, "1529773": 19, "1529771": 9 };
    const malos = Object.entries(cuenta).flatMap(([tnr, n]) => Array.from({ length: n }, (_, i) => i + 1).filter((t) => cub(tnr, t) !== 1).map((t) => tnr + ":" + t));
    ok("después, cada mesa del plano tiene un árbitro y uno solo", malos.length === 0, malos.join(" ") + " " + JSON.stringify(d.act));
    ok("los tramos de fuera del plano no se tocan (Ana en Sub-10, 1 a 15)", d.ana && !d.ana.revocada && d.ana.mesa_desde === 1 && d.ana.mesa_hasta === 15);
    ok("a cada árbitro al que le cambió algo le llega un aviso con sus mesas", d.avisos.length >= 1 && d.avisos.every((t) => /^Tus mesas cambiaron \(zona \d+ del plano\): /.test(t)), JSON.stringify(d.avisos));
    ok("la página no tuvo errores", errs.length === 0, errs.join(" | "));
    await octx.close();

    // La tablet: el enlace viejo contesta 410 y la base dice a cuál pasarse.
    console.log("La tablet (centroamericano-arbitro.html)");
    const VIEJO = "a1".repeat(32), NUEVO = "b2".repeat(32);
    const actx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1000, height: 800 } });
    await actx.route("**/js/supabase-client.js", (rr) => rr.fulfill({ contentType: "application/javascript", body: `window.__seguir = []; window.__leidos = [];
      window.sb = { rpc: (f, a) => { if (f === "centroamericano_seguir") { window.__seguir.push(a.p_token); return Promise.resolve({ data: a.p_token === "${VIEJO}" ? "${NUEVO}" : null, error: null }); } return Promise.resolve({ data: null, error: null }); },
        functions: { invoke: (f, o) => { window.__leidos.push(o.body.token); const s = o.body.token === "${VIEJO}" ? 410 : 404;
          return Promise.resolve({ data: null, error: { message: "x", context: { status: s, json: () => Promise.resolve({ error: s === 410 ? "La organización apagó este enlace. Pídele uno nuevo." : "Este enlace no es válido." }) } } }); } },
        from: () => { const q = { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve({ data: null, error: null }), then: (ok) => Promise.resolve({ data: [], error: null }).then(ok) }; return q; },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };` }));
    await actx.route("**/js/vendor/supabase.js", (rr) => rr.fulfill({ contentType: "application/javascript", body: "" }));
    await actx.route(/supabase\.co|sentry|googletagmanager|lichess\.org/, (rr) => rr.abort());
    const t = await actx.newPage();
    await t.goto(BASE + "/centroamericano-arbitro.html#t=" + VIEJO, { waitUntil: "load" });
    await t.waitForFunction((n) => location.hash === "#" + n, NUEVO, { timeout: 8000 }).catch(() => {});
    const r = await t.evaluate(() => ({ hash: location.hash, seguir: window.__seguir, leidos: window.__leidos }));
    ok("con el enlace apagado por un reparto, la tablet pregunta a dónde seguir y se pasa sola", r.hash === "#" + NUEVO && r.seguir[0] === VIEJO && r.leidos.includes(NUEVO), JSON.stringify({ hash: String(r.hash).slice(0, 12), seguir: r.seguir.map((x) => String(x).slice(0, 4)), leidos: r.leidos.map((x) => String(x).slice(0, 4)) }));
    ok("y no se queda preguntando en círculo", r.seguir.length <= 4, r.seguir.length);
    await actx.close();
  } finally {
    await nav.close();
  }
  if (fallos) { console.log("\n✗ " + fallos + (fallos === 1 ? " comprobación falló." : " comprobaciones fallaron.")); process.exit(1); }
  console.log("\n✓ El reparto de los árbitros desde el plano está bien.");
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
