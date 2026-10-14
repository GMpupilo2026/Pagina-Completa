/* Comprueba en el navegador arbitros-cr.html (los árbitros de Costa Rica en
   FIDE y en chess-results), con un doble de Supabase y datos inventados de
   arbitros_cr, arbitros_cr_torneos, arbitros_cr_cargos, arbitros_cr_cr y
   arbitros_cr_cr_cargos:

   - sin licencia se ve el candado y no se piden las tablas;
   - con licencia, la lista de árbitros cuenta bien sus torneos, sus cargos
     y cuántos valen para AF y AI (con los de revisar entre paréntesis), y
     un árbitro sin torneos en los años elegidos no sale;
   - la norma por cargo: el principal, el adjunto y el árbitro llevan la del
     torneo; el asistente no vale (B.06.1, 2.4.4); el de pareos queda para
     revisar si el torneo valdría;
   - los años y el título filtran; el buscador encuentra sin tildes y por ID;
   - la ficha de un árbitro: el enlace lleva su ID, cada torneo enlaza a FIDE,
     la norma va escrita con su porqué, y el filtro de norma recorta la
     tabla;
   - chess-results: la columna de la lista, quien solo figura ahí (sin
     torneos de FIDE) sale igual, y la ficha trae sus torneos con su rol y
     el enlace a chess-results;
   - las tablas se piden de mil en mil (range).

   Ver «Árbitros de Costa Rica en FIDE» en docs/decisiones/juegos-y-torneos.md.

   Uso:  node herramientas/verificar-arbitros-cr.js   (con el sitio en el 8777) */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
    else console.log("  ✓ " + nombre);
}

const ARBITROS = [
    { fide_id: 6500001, nombre: "Ángulo Prueba, Óscar", titulo: "IA", titulo_detalle: "Congreso 2020" },
    { fide_id: 6500002, nombre: "Soto Prueba, Ana", titulo: "FA", titulo_detalle: "" },
    { fide_id: 6500003, nombre: "Rojas Prueba, Luis", titulo: "", titulo_detalle: "" },
    { fide_id: 6500004, nombre: "Viejo Prueba, Juan", titulo: "AN", titulo_detalle: "" },
    { fide_id: 6500005, nombre: "Quiros Prueba, Eduardo", titulo: "", titulo_detalle: "", solo_chess_results: true },
];
const T = (id, nombre, inicio, af, ai) => ({
    id, nombre, ciudad: "San José", pais: "Costa Rica", inicio, fin: inicio, sistema: "s", ritmo: "Standard",
    jugadores: 40, con_elo: 30, contados: 28, rondas: 9, federaciones: 3, valorado: "enero de 2025",
    af_estado: af, af_detalle: "porque " + af, ai_estado: ai, ai_detalle: "porque " + ai,
});
const TORNEOS = [
    T(101, "Abierto Internacional 2025", "2025-01-10", "si", "opcion"),
    T(102, "Nacional Absoluto 2024", "2024-05-01", "si", "si"),
    T(103, "Blitz de prueba 2024", "2024-08-01", "no", "no"),
    T(104, "Internacional con titulados 2023", "2023-03-01", "si", "revisar"),
    T(105, "Torneo de 2015", "2015-06-01", "si", "no"),
];
const CARGOS = [
    { torneo_id: 101, fide_id: 6500001, cargo: "Chief" },
    { torneo_id: 102, fide_id: 6500001, cargo: "Chief" },
    { torneo_id: 103, fide_id: 6500001, cargo: "Dep. Chief" },
    { torneo_id: 104, fide_id: 6500001, cargo: "Arbiter" },
    { torneo_id: 101, fide_id: 6500002, cargo: "Assistant" },   // el asistente no vale
    { torneo_id: 102, fide_id: 6500002, cargo: "Pairings" },    // el de pareos queda para revisar
    { torneo_id: 104, fide_id: 6500003, cargo: "Dep. Chief" },
    { torneo_id: 105, fide_id: 6500004, cargo: "Chief" },       // solo 2015
];

const CR = [
    { clave: 900001, nombre: "Blitz de la federación 2024", inicio: "2024-03-02", fin: "2024-03-02", lugar: "San José", control: "3 min + 2 seg", rondas: 9, jugadores: 40 },
    { clave: 900002, nombre: "Abierto del club 2024", inicio: "2024-07-10", fin: "2024-07-12", lugar: "Heredia", control: "60 min", rondas: 5, jugadores: 22 },
    { clave: 900003, nombre: "Torneo escolar 2019", inicio: "2019-05-01", fin: "2019-05-01", lugar: "", control: "", rondas: 0, jugadores: 0 },
];
const CR_CARGOS = [
    { clave: 900001, fide_id: 6500001, rol: "ap" },
    { clave: 900002, fide_id: 6500001, rol: "dir" },
    { clave: 900002, fide_id: 6500005, rol: "ap" },
    { clave: 900002, fide_id: 6500005, rol: "dir" },
    { clave: 900003, fide_id: 6500005, rol: "arb" },
];

function doble(tieneLicencia) {
    return `
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const TABLAS = ${JSON.stringify({ arbitros_cr: ARBITROS, arbitros_cr_torneos: TORNEOS, arbitros_cr_cargos: CARGOS, arbitros_cr_cr: CR, arbitros_cr_cr_cargos: CR_CARGOS })};
  const LICENCIA = ${tieneLicencia ? "true" : "false"};
  window.__pedidos = [];
  function respuesta(data, error) { return Promise.resolve({ data, error: error || null }); }
  function consulta(tabla) {
    const q = { _desde: 0, _hasta: 999 };
    ["select", "eq", "order", "in", "limit"].forEach((m) => { q[m] = () => q; });
    q.range = (a, b) => { q._desde = a; q._hasta = b; return q; };
    q.then = (ok, mal) => {
      window.__pedidos.push(tabla + " " + q._desde + "-" + q._hasta);
      // La RLS: sin la herramienta, las tablas no devuelven nada.
      const filas = LICENCIA ? (TABLAS[tabla] || []) : [];
      return Promise.resolve({ data: filas.slice(q._desde, q._hasta + 1), error: null }).then(ok, mal);
    };
    return q;
  }
  window.sb = {
    auth: {
      getSession: () => respuesta({ session: { user: { id: "yo" }, access_token: "x" } }),
      getUser: () => respuesta({ user: { id: "yo" } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => respuesta({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => respuesta({ all: [], totp: [] }) },
    },
    rpc: (nombre, args) => {
      window.__pedidos.push(nombre);
      if (nombre === "tengo_herramienta") return respuesta(LICENCIA && args.p_herramienta === "arbitros-cr");
      return respuesta(null);
    },
    from: (t) => consulta(t),
    functions: { invoke: () => respuesta(null) },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
    removeChannel: () => {},
  };
  window.supabase = { createClient: () => window.sb };
})();`;
}

async function abrir(browser, ruta, tieneLicencia) {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble(tieneLicencia) }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    const p = await ctx.newPage();
    p.on("pageerror", (e) => { console.log("  ✗ error en la página: " + e.message); fallos++; });
    await p.goto(BASE + "/" + ruta, { waitUntil: "load" });
    return { ctx, p };
}
const visible = (p, sel) => p.$eval(sel, (e) => e.checkVisibility());
const filas = (p, sel) => p.$$eval(sel + " tbody tr", (trs) => trs.map((t) => [...t.cells].map((c) => c.textContent.replace(/\s+/g, " ").trim())));
const porNombre = (m) => Object.fromEntries(m.map((f) => [f[0], f]));

(async () => {
    const browser = await chromium.launch();

    console.log("\n=== Sin licencia ===");
    let { ctx, p } = await abrir(browser, "arbitros-cr.html", false);
    await p.waitForFunction(() => !document.getElementById("loading").checkVisibility());
    igual("se ve el candado y no la página", [await visible(p, "#denegado"), await visible(p, "#app")], [true, false]);
    igual("no pide las tablas", await p.evaluate(() => window.__pedidos.filter((x) => x.startsWith("arbitros_cr")).length), 0);
    await ctx.close();

    console.log("\n=== Con licencia: la lista de árbitros ===");
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html", true));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("pide cada tabla de mil en mil", await p.evaluate(() => window.__pedidos.filter((x) => x.startsWith("arbitros_cr")).sort()),
        ["arbitros_cr 0-999", "arbitros_cr_cargos 0-999", "arbitros_cr_cr 0-999", "arbitros_cr_cr_cargos 0-999", "arbitros_cr_torneos 0-999"]);
    let m = porNombre(await filas(p, "#tabla-arbitros"));
    igual("los cinco árbitros salen (todos los años), también quien solo está en chess-results", Object.keys(m).sort(),
        ["Ángulo Prueba, Óscar", "Quiros Prueba, Eduardo", "Rojas Prueba, Luis", "Soto Prueba, Ana", "Viejo Prueba, Juan"].sort());
    // Óscar: 4 torneos (principal 2, adjunto 1, árbitro 1); AF vale en 101, 102, 104 (3); AI vale en 101, 102 y revisar en 104 (3, uno para revisar).
    igual("Óscar: IA, 4 torneos, 2 principal, 1 adjunto, 1 árbitro, AF 3, AI 3 (1 para revisar), 2 en chess-results, último 10/01/2025",
        m["Ángulo Prueba, Óscar"].slice(1), ["IA", "4", "2", "1", "1", "3", "3 (1)", "2", "10/01/2025"]);
    igual("Eduardo: sin torneos de FIDE, 2 en chess-results, último 10/07/2024",
        m["Quiros Prueba, Eduardo"].slice(1), ["—", "0", "0", "0", "0", "0", "0", "2", "10/07/2024"]);
    // Ana: asistente en 101 (no vale) y de pareos en 102 (revisar en AF y AI).
    igual("Ana: el asistente no vale y el de pareos queda para revisar (AF 1 (1), AI 1 (1))",
        m["Soto Prueba, Ana"].slice(1), ["FA", "2", "0", "0", "0", "1 (1)", "1 (1)", "0", "10/01/2025"]);
    igual("la lista va ordenada por cantidad de torneos", (await filas(p, "#tabla-arbitros")).map((f) => f[0])[0], "Ángulo Prueba, Óscar");

    await p.selectOption("#desde", "2023");
    m = porNombre(await filas(p, "#tabla-arbitros"));
    igual("desde 2023, Juan (solo 2015) ya no sale", "Viejo Prueba, Juan" in m, false);
    igual("desde 2023, Eduardo cuenta solo su torneo de 2024 en chess-results", m["Quiros Prueba, Eduardo"][8], "1");
    await p.selectOption("#desde", "2015");
    await p.selectOption("#titulo", "-");
    igual("«sin título en FIDE» deja a Luis y a Eduardo", Object.keys(porNombre(await filas(p, "#tabla-arbitros"))).sort(), ["Quiros Prueba, Eduardo", "Rojas Prueba, Luis"]);
    await p.selectOption("#titulo", "");
    await p.fill("#buscar", "angulo");
    await p.waitForTimeout(400);
    igual("el buscador encuentra sin tildes", Object.keys(porNombre(await filas(p, "#tabla-arbitros"))), ["Ángulo Prueba, Óscar"]);
    await p.fill("#buscar", "6500003");
    await p.waitForTimeout(400);
    igual("y por ID FIDE", Object.keys(porNombre(await filas(p, "#tabla-arbitros"))), ["Rojas Prueba, Luis"]);
    await p.fill("#buscar", "");
    await p.waitForTimeout(400);

    console.log("\n=== La ficha de un árbitro ===");
    await p.click("#tabla-arbitros button:text-is('Soto Prueba, Ana')");
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("abre la ficha y esconde la lista", [await visible(p, "#ficha"), await visible(p, "#general")], [true, false]);
    igual("el enlace lleva su ID FIDE", await p.evaluate(() => location.hash), "#6500002");
    const ficha = await filas(p, "#tabla-torneos");
    igual("como asistente: «No», con el porqué (2.4.4)", [ficha[0][2], ficha[0][7].startsWith("No"), /2\.4\.4/.test(ficha[0][7])], ["Árbitro asistente", true, true]);
    igual("como árbitro de pareos: «Revisar» en AF y AI", [ficha[1][2], ficha[1][7].startsWith("Revisar"), ficha[1][8].startsWith("Revisar")], ["Árbitro de pareos", true, true]);
    igual("cada torneo enlaza a su ficha de FIDE", await p.$eval("#tabla-torneos tbody a", (a) => a.href), "https://ratings.fide.com/tournament_information.phtml?event=101");
    await p.selectOption("#norma-ai", "revisar");
    igual("el filtro de norma recorta la tabla", (await filas(p, "#tabla-torneos")).length, 1);
    await p.click("#volver");
    igual("«Ver todos» vuelve a la lista", [await visible(p, "#general"), await p.evaluate(() => location.hash)], [true, ""]);
    await ctx.close();

    console.log("\n=== Un enlace directo a un árbitro ===");
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500001", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("abre su ficha", await p.$eval("#ficha-titulo", (e) => e.textContent), "Ángulo Prueba, Óscar");
    const conPorque = await p.$eval("#tabla-torneos tbody tr", (tr) => [tr.cells[7].querySelector(".of-estado").textContent, tr.cells[7].querySelector(".of-detalle").textContent]);
    igual("la norma va escrita con su porqué", conPorque, ["Vale", "porque si"]);
    igual("sus torneos de chess-results, el más nuevo primero, con su rol", (await filas(p, "#tabla-cr")).map((f) => [f[0], f[2]]),
        [["10/07/2024", "Director del torneo"], ["02/03/2024", "Árbitro principal"]]);
    await ctx.close();

    console.log("\n=== Quien solo está en chess-results ===");
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500005", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("la ficha dice que no figura en FIDE", /No figura como árbitro en ningún torneo de FIDE/.test(await p.$eval("#ficha-sub", (e) => e.textContent)), true);
    igual("la tabla de FIDE queda vacía", (await filas(p, "#tabla-torneos")).length, 0);
    const cr = await filas(p, "#tabla-cr");
    igual("sus dos torneos de chess-results, con los dos roles juntos", cr.map((f) => f[2]), ["Árbitro principal, Director del torneo", "Árbitro"]);
    igual("cada torneo enlaza a chess-results", await p.$eval("#tabla-cr tbody a", (a) => a.href), "https://chess-results.com/tnr900002.aspx?lan=2");
    igual("sin lugar, rondas ni jugadores: guiones", cr[1].slice(3), ["—", "—", "—"]);
    await ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
