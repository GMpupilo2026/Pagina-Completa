/* Comprueba en el navegador jdn-comites.html (los resultados JDN por comité),
   con un doble de Supabase (js/supabase-client.js interceptado) y torneos
   inventados:

   - sin licencia muestra el candado y no pide los resultados;
   - con licencia lee jdn_resultados de mil en mil (hay 1100 filas de un solo
     torneo: si la página se quedara con el primer pedido, faltarían 100);
   - junta las variantes del comité («CCDR Goicochea», «Goico», «Goicoechea A»)
     y el medallero ordena por oros, platas y bronces;
   - un puesto vacío es un empate con el de arriba, y comparte la medalla;
   - a quien no trae comité en la final se le deduce del mismo jugador en la
     eliminatoria de su ciclo, y lo dice;
   - la ficha del comité marca la medalla con su emoji y escrita, y «Jugó la
     final» en la eliminatoria;
   - el filtro de edición deja solo esa edición, y el enlace (#comite~edicion)
     vuelve a abrir lo mismo;
   - los mejores tableros (jdn_tableros) salen debajo del medallero de una
     final, con el empate sin desempatar compartido y la reserva aparte, y en
     la ficha del comité, con su medalla; los tres primeros de cada tablero
     suman al medallero (son medallas oficiales); sin licencia no se piden;
   - de la eliminatoria a la final (cuántos pasaron, medallas por
     clasificado), comparar comités en una gráfica con su tabla, cómo viene
     cada comité (barras con su número), sus jugadores y cuántos volvieron, y
     la ficha de cada jugador con su trayectoria, que un filtro recorta y el
     enlace guarda;
   - los participantes de cada comité: por edición con todas las ediciones,
     por categoría y rama con una elegida (un equipo escrito distinto en otro
     ritmo cuenta una vez), la lista de torneos con su enlace y la cifra que
     abre la ficha;
   - con todas las ediciones, las medallas por tipo y por final de cada
     comité, cada cifra abre la ficha en esa final, y cada medalla de la ficha
     y cada torneo de los mejores tableros lleva su enlace a chess-results;
   - la copa: puntos por puesto con la escala elegida (también una escrita a
     mano), con o sin los tableros, el empate que comparte los puntos y la
     escala en el enlace; no sale en una eliminatoria;
   - los integrantes de cada equipo (jdn_jugadores): en la ficha del comité,
     las personas en «Participantes», sus jugadores y la ficha del jugador
     (el equipo de la eliminatoria, sin medalla), y la búsqueda;
   - el rendimiento contra el Elo: por comité (puntos, esperados, diferencia
     con su signo escrito), quiénes más sorprendieron con su actuación y su
     enlace, la columna de la ficha del comité y las partidas del jugador.

   Ver «Resultados JDN por comité» en docs/decisiones/juegos-y-torneos.md.

   Uso:  node herramientas/verificar-jdn-comites.js   (con el sitio en el 8777) */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
    else console.log("  ✓ " + nombre);
}

const FILAS = [];
// Cada torneo inventado lleva su número de chess-results (para los enlaces).
const TNR = {};
const tnr = (edicion, codigo) => TNR[edicion + codigo] || (TNR[edicion + codigo] = 900000 + Object.keys(TNR).length);
function fila(edicion, codigo, orden, puesto, nombre, comite, puntos, record) {
    FILAS.push({ edicion, codigo, tnr: tnr(edicion, codigo), orden, puesto, nombre, comite: comite || "", record: record || null, puntos });
}
// Una eliminatoria enorme: 1100 inscritos de Limón (más que un pedido).
// Con letras, no con números: la página compara los nombres sin números.
const letras = (i) => { let t = ""; for (; i > 0; i = Math.floor((i - 1) / 26)) t = String.fromCharCode(97 + (i - 1) % 26) + t; return t; };
for (let i = 1; i <= 1100; i++) fila("2018-E", "Z2-U16-IA", i, i, "Jugador " + letras(i) + ", Prueba", "CCDR Limon", 1);
fila("2025-E", "Z1-U12-IA", 1, 1, "Mora Vargas, Ana", "CCDR Goicochea", 5);
fila("2025-E", "Z1-U12-IA", 2, 2, "Solis Rojas, Juan", "Alajuela", 4);
fila("2025-E", "Z1-U12-IA", 3, 3, "Quesada Mena, Eva", "Escazu", 3);
fila("2025-E", "Z1-U12-EA", 1, 1, "CCDR Goicochea A", "", 9, "2-0-0");
fila("2026-F", "C-U12-IA", 1, 1, "Mora Vargas, Ana", "Goico", 3);
fila("2026-F", "C-U12-IA", 2, 2, "Solis Rojas, Juan", "", 2);
fila("2026-F", "C-U12-IA", 3, null, "Rojas Arias, Luis", "CCDR Belen", 2);
fila("2026-F", "C-U12-IA", 4, 4, "Perez Mora, Leo", "CCDR Belen", 0);
fila("2026-F", "C-U12-EA", 1, 1, "CCDR Goicoechea A", "", 10, "3-0-0");
fila("2026-F", "C-U12-EA", 2, 2, "CODEA B", "", 8, "2-0-1");
// El mismo equipo en Blitz, escrito distinto: cuenta una sola vez como participante.
fila("2026-F", "B-U12-EA", 1, 4, "CCDR Goicochea A", "", 1, "0-0-1");

// La clasificación por tableros de las finales por equipos.
const TABLEROS = [];
function tablero(edicion, codigo, tablero, orden, puesto, nombre, equipo, porcentaje, puntos) {
    TABLEROS.push({ edicion, codigo, tnr: tnr(edicion, codigo), tablero, orden, puesto, nombre, equipo, porcentaje, puntos });
}
tablero("2026-F", "C-U12-EA", 1, 1, 1, "Mora Vargas, Ana", "CCDR Goicoechea A", 100, 3);
tablero("2026-F", "C-U12-EA", 1, 2, 2, "Diaz Solis, Pia", "CODEA B", 50, 1.5);
tablero("2026-F", "C-U12-EA", 2, 1, 1, "Ruiz Mena, Ivo", "CODEA B", 83.3, 2.5);
tablero("2026-F", "C-U12-EA", 2, 2, null, "Leon Vega, Sol", "CCDR Goicoechea A", 83.3, 2.5);
tablero("2026-F", "C-U12-EA", 5, 1, 1, "Arce Brenes, Teo", "CCDR Goicoechea A", 100, 2);

// Los jugadores de cada torneo con su Elo y sus partidas (jdn_jugadores). Los
// individuales van por (torneo, orden) como en jdn_resultados.
const JUGADORES = [];
function jugador(edicion, codigo, orden, nombre, elo, partidas, puntos, conElo, puntosElo, eloRivales, esperado, equipo, equipoOrden, tablero) {
    JUGADORES.push({ edicion, codigo, tnr: tnr(edicion, codigo), orden, equipo: equipo || null, equipo_orden: equipoOrden || null, tablero: tablero || null,
        nombre, elo, partidas, puntos, con_elo: conElo, puntos_elo: puntosElo, elo_rivales: eloRivales, esperado });
}
jugador("2025-E", "Z1-U12-EA", 1, "Mora Vargas, Ana", 1580, 2, 1.5, 2, 1.5, 1500, 1.22, "CCDR Goicochea A", 1, 1);
jugador("2025-E", "Z1-U12-EA", 2, "Brenes Soto, Kai", 1400, 2, 2, 2, 2, 1450, 0.86, "CCDR Goicochea A", 1, 2);
jugador("2025-E", "Z1-U12-EA", 3, "Vega Rojas, Noa", null, 0, 0, 0, 0, null, null, "CCDR Goicochea A", 1, 3);
jugador("2025-E", "Z1-U12-IA", 1, "Mora Vargas, Ana", 1580, 2, 2, 2, 2, 1500, 1.22);
jugador("2026-F", "C-U12-EA", 1, "Mora Vargas, Ana", 1600, 3, 3, 3, 3, 1500, 1.92, "CCDR Goicoechea A", 1, 1);
jugador("2026-F", "C-U12-EA", 2, "Leon Vega, Sol", 1550, 3, 2.5, 3, 2.5, 1500, 1.71, "CCDR Goicoechea A", 1, 2);
jugador("2026-F", "C-U12-EA", 3, "Brenes Soto, Kai", 1400, 2, 1, 2, 1, 1500, 0.72, "CCDR Goicoechea A", 1, 3);
jugador("2026-F", "C-U12-EA", 4, "Diaz Solis, Pia", 1500, 3, 1.5, 3, 1.5, 1550, 1.29, "CODEA B", 2, 1);
jugador("2026-F", "C-U12-EA", 5, "Ruiz Mena, Ivo", 1500, 3, 2.5, 3, 2.5, 1500, 1.5, "CODEA B", 2, 2);
jugador("2026-F", "C-U12-IA", 1, "Mora Vargas, Ana", 1600, 3, 3, 3, 3, 1500, 1.92);
jugador("2026-F", "C-U12-IA", 2, "Solis Rojas, Juan", 1500, 3, 2, 3, 2, 1533, 1.4);
jugador("2026-F", "C-U12-IA", 3, "Rojas Arias, Luis", null, 3, 1, 3, 1, 1520, null);
jugador("2026-F", "C-U12-IA", 4, "Perez Mora, Leo", 1450, 3, 0, 2, 0, 1550, 0.72);

function doble(tieneLicencia) {
    return `
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const FILAS = ${JSON.stringify(FILAS)};
  const TABLEROS = ${JSON.stringify(TABLEROS)};
  const JUGADORES = ${JSON.stringify(JUGADORES)};
  const LICENCIA = ${tieneLicencia ? "true" : "false"};
  window.__pedidos = [];
  function respuesta(data, error) { return Promise.resolve({ data, error: error || null }); }
  function consulta(tabla) {
    const q = { _tabla: tabla, _desde: 0, _hasta: 999 };
    ["select", "eq", "order", "in", "update", "insert", "single", "maybeSingle", "limit"].forEach((m) => { q[m] = () => q; });
    q.range = (a, b) => { q._desde = a; q._hasta = b; return q; };
    q.then = (ok, mal) => {
      let data = [];
      if (tabla === "jdn_resultados") {
        window.__pedidos.push("jdn_resultados " + q._desde);
        // Como PostgREST: nunca más de mil por pedido, y sin licencia, nada.
        data = LICENCIA ? FILAS.slice(q._desde, Math.min(q._hasta + 1, q._desde + 1000)) : [];
      }
      if (tabla === "jdn_tableros") {
        window.__pedidos.push("jdn_tableros " + q._desde);
        data = LICENCIA ? TABLEROS.slice(q._desde, Math.min(q._hasta + 1, q._desde + 1000)) : [];
      }
      if (tabla === "jdn_jugadores") {
        window.__pedidos.push("jdn_jugadores " + q._desde);
        data = LICENCIA ? JUGADORES.slice(q._desde, Math.min(q._hasta + 1, q._desde + 1000)) : [];
      }
      if (tabla === "profiles") data = { id: "yo", is_admin: false, role: "profesor" };
      return Promise.resolve({ data, error: null }).then(ok, mal);
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
      if (nombre === "tengo_herramienta") return respuesta(LICENCIA && args.p_herramienta === "jdn-comites");
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

async function abrir(browser, ruta, licencia) {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble(licencia) }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    const p = await ctx.newPage();
    p.on("pageerror", (e) => { console.log("  ✗ error en la página: " + e.message); fallos++; });
    await p.goto(BASE + "/" + ruta, { waitUntil: "load" });
    return { ctx, p };
}
const visible = (p, sel) => p.$eval(sel, (e) => e.checkVisibility());
const medallero = (p) => p.$$eval("#medallero tbody tr", (trs) => trs.map((t) => [...t.cells].map((c) => c.textContent.trim())));

(async () => {
    const browser = await chromium.launch();

    console.log("\n=== Sin licencia ===");
    let { ctx, p } = await abrir(browser, "jdn-comites.html", false);
    await p.waitForFunction(() => !document.getElementById("loading").checkVisibility());
    igual("se ve el candado y no la herramienta", [await visible(p, "#denegado"), await visible(p, "#app")], [true, false]);
    igual("no pide los resultados ni los tableros", await p.evaluate(() => window.__pedidos.filter((x) => x.startsWith("jdn_")).length), 0);
    await ctx.close();

    console.log("\n=== Con licencia: el medallero ===");
    ({ ctx, p } = await abrir(browser, "jdn-comites.html", true));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("lee de mil en mil hasta el final", await p.evaluate(() => window.__pedidos.filter((x) => x.startsWith("jdn_resultados"))),
        ["jdn_resultados 0", "jdn_resultados 1000"]);
    igual("cuenta los torneos que leyó", /en los 6 torneos/.test(await p.textContent("#intro")), true);
    const m = await medallero(p);
    igual("junta las variantes y ordena por oros, platas y bronces",
        m.map((f) => f.slice(0, 5)),
        [["Goicoechea", "Z1", "5", "", ""], ["CODEA (Alajuela)", "Z1", "1", "3", ""], ["Belén", "—", "", "1", ""], ["Limón", "Z2", "", "", ""], ["Escazú", "Z1", "", "", ""]]);
    igual("los tres primeros de cada tablero suman medallas (columna «Medallas tab.»)",
        m.filter((f) => f[0] === "Goicoechea" || f[0] === "CODEA (Alajuela)").map((f) => [f[0], f[7]]), [["Goicoechea", "3"], ["CODEA (Alajuela)", "2"]]);
    igual("el empate sin desempatar comparte la plata, y el comité deducido suma su plata a CODEA",
        m.filter((f) => f[0] === "Belén" || f[0] === "CODEA (Alajuela)").map((f) => [f[0], f[3], f[5], f[6]]),
        [["CODEA (Alajuela)", "3", "1", "1"], ["Belén", "1", "1", ""]]);
    igual("las 1100 inscripciones de Limón, todas", m.find((f) => f[0] === "Limón")[9], "1100");
    igual("el medallero se ve y la ficha no", [await visible(p, "#general"), await visible(p, "#ficha")], [true, false]);
    igual("sin elegir una final no se ven los mejores tableros", await visible(p, "#tableros"), false);

    console.log("\n=== Medallas por final ===");
    igual("con todas las ediciones se ve la tabla por final", await visible(p, "#por-final"), true);
    igual("las cifras por tipo: individuales, equipos, tableros y total",
        await p.$$eval("#por-final .grid > div", (d) => d.map((x) => x.textContent)),
        ["3Individuales: 1 de oro, 2 de plata, 0 de bronce", "2Por equipos: 1 de oro, 1 de plata, 0 de bronce", "5Tableros: 4 de oro, 1 de plata, 0 de bronce", "10Total: 6 de oro, 4 de plata, 0 de bronce"]);
    igual("cada comité en cada final (oro·plata·bronce) y su total",
        await p.$$eval("#por-final tbody tr", (t) => t.map((x) => [...x.cells].map((c) => c.textContent))),
        [["Goicoechea", "5·0·0", "5·0·0", "5"], ["CODEA (Alajuela)", "1·3·0", "1·3·0", "4"], ["Belén", "0·1·0", "0·1·0", "1"], ["Total", "6·4·0", "6·4·0", "10"]]);
    await p.click("#por-final tr[data-comite='Goicoechea'] td[data-final='2026-F'] button");
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("la cifra abre la ficha del comité en esa final", await p.evaluate(() => location.hash), "#goicoechea~2026-F");
    igual("cada medalla de la ficha lleva su enlace a chess-results",
        await p.$$eval("#ficha section[data-edicion='2026-F'] a[href*='chess-results']", (a) => a.map((x) => x.getAttribute("href").replace(/^https:\/\/chess-results\.com\/tnr/, ""))),
        ["900003.aspx?lan=2&art=1", "900004.aspx?lan=2&art=46", "900005.aspx?lan=2&art=46",
         "900004.aspx?lan=2&art=20&turdet=YES", "900004.aspx?lan=2&art=20&turdet=YES", "900004.aspx?lan=2&art=20&turdet=YES",
         "900004.aspx?lan=2&art=81&turdet=YES&flag=30", "900004.aspx?lan=2&art=81&turdet=YES&flag=30", "900004.aspx?lan=2&art=81&turdet=YES&flag=30"]);
    igual("el enlace se abre aparte y dice qué abre",
        await p.$eval("#ficha a[href*='chess-results']", (a) => [a.target, a.rel, a.getAttribute("aria-label")]),
        ["_blank", "noopener", "Ver la clasificación de U12 Absoluto de Final 2026 en chess-results (se abre en otra pestaña)"]);
    await p.click("#volver");
    await p.selectOption("#edicion", "");

    console.log("\n=== Participantes por edición ===");
    const part = () => p.$$eval("#participacion table", (ts) => ts.map((t) => [...t.querySelectorAll("tbody tr")].map((x) => [...x.cells].map((c) => c.textContent.trim()))));
    const todasP = await part();
    igual("con todas las ediciones: una tabla de eliminatorias y otra de finales", todasP.length, 2);
    igual("las 1100 inscripciones de Limón en la eliminatoria 2018", todasP[0].find((f) => f[0] === "Limón").slice(1), ["1100", "—", "1100", "0"]);
    igual("en la final, el equipo escrito distinto en Blitz cuenta una sola vez",
        todasP[1].map((f) => [f[0], f[1]]), [["CODEA (Alajuela)", "1 · 1E"], ["Goicoechea", "1 · 1E"], ["Belén", "2"], ["Total", "4 · 2E"]]);
    await p.selectOption("#edicion", "2026-F");
    igual("con una final elegida: cada comité por categoría y rama",
        (await part())[0].map((f) => [f[0], f[1], f[7], f[8]]), [["CODEA (Alajuela)", "1 · 1E", "1", "1"], ["Goicoechea", "1 · 1E", "1", "1"], ["Belén", "2", "2", "0"], ["Total", "4 · 2E", "4", "2"]]);
    igual("la lista de los torneos de la edición, cada uno con su enlace a chess-results",
        await p.$$eval("#participacion li a", (a) => a.map((x) => [x.textContent, x.getAttribute("href").replace("https://chess-results.com/tnr", "")])),
        [["U12 Absoluto · Clásico · Individual", "900003.aspx?lan=2&art=1"], ["U12 Absoluto · Clásico · Equipos", "900004.aspx?lan=2&art=1"], ["U12 Absoluto · Blitz · Equipos", "900005.aspx?lan=2&art=1"]]);
    await p.selectOption("#edicion", "2025-E");
    igual("en una eliminatoria también, con la zona en la lista de torneos",
        [(await part())[0].map((f) => [f[0], f[1]]), await p.$$eval("#participacion li a", (a) => a.map((x) => x.textContent))],
        [[["Goicoechea", "1 · 1E"], ["CODEA (Alajuela)", "1"], ["Escazú", "1"], ["Total", "3 · 1E"]], ["U12 Absoluto · Zona 1 · Individual", "U12 Absoluto · Zona 1 · Equipos"]]);
    await p.click("#participacion tr[data-comite='Escazú'] button");
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("la cifra abre la ficha del comité en esa edición", await p.evaluate(() => location.hash), "#escazu~2025-E");
    await p.click("#volver");
    await p.selectOption("#edicion", "");

    console.log("\n=== Los mejores tableros de una final ===");
    await p.selectOption("#edicion", "2026-F");
    await p.waitForFunction(() => document.getElementById("tableros").checkVisibility());
    igual("las columnas: un tablero cada una, y la reserva aparte",
        await p.$$eval("#tableros th", (t) => t.map((x) => x.textContent)), ["Categoría", "Ritmo", "Tablero 1", "Tablero 2", "Reserva", "Comprobar"]);
    igual("el primero de cada tablero, con su comité y su porcentaje; el empate sin desempatar, los dos",
        await p.$$eval("#tableros tr[data-torneo='C-U12-EA'] td[data-tablero]", (t) => t.map((x) => [...x.querySelectorAll(":scope > span")].map((s) => s.textContent))),
        [["Mora Vargas, AnaGoicoechea · 100\u00a0%"], ["Ruiz Mena, IvoCODEA (Alajuela) · 83,3\u00a0%", "Leon Vega, SolGoicoechea · 83,3\u00a0%"], ["Arce Brenes, TeoGoicoechea · 100\u00a0%"]]);
    igual("con una final elegida no sale la tabla por final", await visible(p, "#por-final"), false);
    igual("cada torneo de los mejores tableros lleva su enlace a la clasificación por tableros",
        await p.$eval("#tableros tr[data-torneo='C-U12-EA'] a", (a) => a.getAttribute("href")), "https://chess-results.com/tnr900004.aspx?lan=2&art=81&turdet=YES&flag=30");
    igual("en una eliminatoria no hay tableros", await (async () => { await p.selectOption("#edicion", "2025-E"); return visible(p, "#tableros"); })(), false);
    await p.selectOption("#edicion", "");

    console.log("\n=== La ficha de un comité ===");
    await p.click("#medallero button:text-is('Goicoechea')");
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("abre la ficha y esconde el medallero", [await visible(p, "#ficha"), await visible(p, "#general"), await visible(p, "#volver")], [true, false, true]);
    igual("el enlace lleva el comité", await p.evaluate(() => location.hash), "#goicoechea");
    igual("las ediciones del comité, de la más nueva a la más vieja",
        await p.$$eval("#ficha section[data-edicion]", (s) => s.map((x) => x.dataset.edicion)), ["2026-F", "2025-E"]);
    const oro = await p.$eval("#ficha section[data-edicion='2026-F'] tr[data-jugador='Mora Vargas, Ana']", (t) => t.lastElementChild.previousElementSibling.textContent.trim());
    igual("la medalla va con su emoji y escrita", oro, "🥇 Oro");
    igual("la ficha dice en qué tablero jugó cada uno, su puesto y su medalla",
        await p.$$eval("#ficha section[data-edicion='2026-F'] tr[data-tablero-de]", (t) => t.map((x) => [x.cells[3].textContent, x.cells[4].textContent, x.cells[5].textContent, x.cells[6].textContent, x.lastElementChild.previousElementSibling.textContent.trim()])),
        [["Tablero 1", "Mora Vargas, Ana", "1 de 2", "100\u00a0%", "🥇 Oro"], ["Tablero 2", "Leon Vega, Sol", "1 de 2", "83,3\u00a0%", "🥇 Oro"], ["Reserva", "Arce Brenes, Teo", "1 de 1", "100\u00a0%", "🥇 Oro"]]);
    igual("en la eliminatoria dice quién jugó la final",
        await p.$eval("#ficha section[data-edicion='2025-E'] tr[data-jugador='Mora Vargas, Ana']", (t) => t.lastElementChild.previousElementSibling.textContent.trim()), "Jugó la final");

    console.log("\n=== El comité deducido ===");
    await p.selectOption("#comite", "codea-alajuela");
    await p.waitForSelector("#ficha section[data-edicion='2026-F']");
    igual("Solís sale en CODEA en la final, con el comité deducido",
        await p.$eval("#ficha section[data-edicion='2026-F'] tr[data-jugador='Solis Rojas, Juan']", (t) => t.cells[2].textContent), "Solis Rojas, Juancomité deducido");

    console.log("\n=== El filtro de edición ===");
    await p.selectOption("#comite", "belen");
    await p.selectOption("#edicion", "2025-E");
    igual("Belén no jugó la eliminatoria 2025, y lo dice", /Belén no tuvo jugadores ni equipos en Eliminatoria 2025/.test(await p.textContent("#ficha")), true);
    igual("el enlace lleva comité y edición", await p.evaluate(() => location.hash), "#belen~2025-E");
    await p.click("#volver");
    igual("«Ver todos los comités» vuelve al medallero de esa edición",
        [await visible(p, "#general"), await p.textContent("#general-titulo")], [true, "Participación · Eliminatoria 2025"]);
    await ctx.close();

    console.log("\n=== El enlace abre lo mismo ===");
    ({ ctx, p } = await abrir(browser, "jdn-comites.html#belen~2026-F", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("abre la ficha de Belén en la final 2026", [await p.$eval("#comite", (s) => s.value), await p.$eval("#edicion", (s) => s.value)], ["belen", "2026-F"]);
    igual("el empate de Rojas comparte la plata",
        await p.$eval("#ficha tr[data-jugador='Rojas Arias, Luis']", (t) => [t.cells[3].textContent, t.lastElementChild.previousElementSibling.textContent.trim()]), ["2 de 4", "🥈 Plata"]);
    await ctx.close();

    console.log("\n=== Los filtros ===");
    ({ ctx, p } = await abrir(browser, "jdn-comites.html", true));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("sin filtros no hay aviso ni «Quitar filtros»", [await p.textContent("#filtros-activos"), await visible(p, "#quitar-filtros")], ["", false]);
    await p.selectOption("#f-modo", "I");
    igual("solo individual: el medallero cuenta solo las medallas individuales",
        (await medallero(p)).map((f) => [f[0], f[2], f[3], f[7]]), [["Goicoechea", "1", "", ""], ["Belén", "", "1", ""], ["CODEA (Alajuela)", "", "1", ""], ["Limón", "", "", ""], ["Escazú", "", "", ""]]);
    igual("el aviso dice qué filtros hay y aparece «Quitar filtros»",
        [await p.textContent("#filtros-activos"), await visible(p, "#quitar-filtros")], ["Filtros: Individual. Todo lo de abajo cuenta solo eso.", true]);
    igual("el enlace guarda el filtro", await p.evaluate(() => location.hash), "#~~modo=I");
    await p.selectOption("#f-modo", "");
    await p.selectOption("#f-ritmo", "B");
    igual("solo Blitz: ninguna medalla (el equipo de Blitz quedó 4.º) y solo ese equipo participa",
        [(await medallero(p)).filter((f) => f[2] || f[3] || f[4]).length,
         (await p.$$eval("#participacion table", (ts) => ts.map((t) => [...t.querySelectorAll("tbody tr")].map((x) => [x.cells[0].textContent, x.cells[1].textContent]))))],
        [0, [[["Goicoechea", "1E"], ["Total", "0 · 1E"]]]]);
    await p.selectOption("#f-ritmo", "");
    await p.selectOption("#f-fase", "elim");
    igual("solo eliminatorias: sale solo la tabla de eliminatorias", await p.$$eval("#participacion h3", (h) => h.map((x) => x.textContent)), ["Eliminatorias"]);
    await p.click("#quitar-filtros");
    igual("«Quitar filtros» deja todo como al principio",
        [await p.$eval("#f-fase", (s) => s.value), await p.textContent("#filtros-activos"), (await medallero(p))[0].slice(0, 3)], ["", "", ["Goicoechea", "Z1", "5"]]);

    console.log("\n=== Buscar jugador ===");
    await p.fill("#buscar", "mora va");
    igual("con menos de 3 letras de un nombre ya busca por cada parte, y encuentra sus torneos, su tablero y su equipo de la eliminatoria (sin medalla)",
        await p.$$eval("#busqueda tbody tr", (t) => t.map((x) => [x.cells[2].textContent, x.cells[5].textContent, x.cells[6].textContent, x.cells[7].textContent.trim()])),
        [["Final 2026", "Individual", "1 de 4", "🥇 Oro"], ["Final 2026", "Tablero 1 · Goicoechea A", "1 de 2", "🥇 Oro"],
         ["Eliminatoria 2025", "Individual", "1 de 3", ""], ["Eliminatoria 2025", "Equipo Goicochea A · tablero 1", "equipo 1 de 1", ""]]);
    igual("dice cuántos resultados y de cuántos jugadores", await p.textContent("#busqueda p"), "4 resultados de 1 jugador.");
    igual("cada resultado lleva su enlace a chess-results (el equipo, a su composición)",
        await p.$$eval("#busqueda tbody a", (a) => a.map((x) => x.getAttribute("href").replace("https://chess-results.com/tnr", ""))),
        ["900003.aspx?lan=2&art=1", "900004.aspx?lan=2&art=81&turdet=YES&flag=30", "900001.aspx?lan=2&art=1", "900002.aspx?lan=2&art=20&turdet=YES"]);
    await p.selectOption("#f-fase", "final");
    igual("la búsqueda respeta los filtros", (await p.$$eval("#busqueda tbody tr", (t) => t.length)), 2);
    await p.click("#busqueda tbody td:nth-child(2) button");
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("el comité del resultado abre su ficha en esa edición, con los filtros en el enlace",
        await p.evaluate(() => location.hash), "#goicoechea~2026-F~fase=final&q=mora+va");
    await p.fill("#buscar", "zz");
    igual("con menos de 3 letras no busca", await visible(p, "#busqueda"), false);
    await ctx.close();

    console.log("\n=== De la eliminatoria a la final ===");
    ({ ctx, p } = await abrir(browser, "jdn-comites.html", true));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("por comité: inscritos en la eliminatoria, cuántos jugaron la final, equipos y medallas por clasificado",
        await p.$$eval("#efectividad tbody tr", (t) => t.slice(0, 2).map((x) => [...x.cells].map((c) => c.textContent.trim()))),
        [["Goicoechea", "1", "1", "100\u00a0%", "1", "1", "1", "5", "2,5"], ["CODEA (Alajuela)", "1", "1", "100\u00a0%", "0", "1", "1", "4", "2"]]);
    await p.selectOption("#edicion", "2025-E");
    igual("con una edición, el título dice su ciclo", await p.textContent("#efectividad h2"), "De la eliminatoria a la final · ciclo 2025 → 2026");

    console.log("\n=== Comparar comités ===");
    await p.selectOption("#edicion", "");
    igual("compara los tres primeros del medallero, con la tabla de cada final",
        await p.$$eval("#comparar tbody tr", (t) => t.map((x) => [...x.cells].map((c) => c.textContent))),
        [["Goicoechea", "5·0·0"], ["CODEA (Alajuela)", "1·3·0"], ["Belén", "0·1·0"]]);
    igual("la gráfica nombra cada línea al final", await p.$$eval("#comparar svg text.font-semibold", (t) => t.map((x) => x.textContent).sort()), ["Belén", "CODEA (Alajuela)", "Goicoechea"]);
    await p.selectOption("#comparar-3", "");
    igual("con dos comités, dos líneas", await p.$$eval("#comparar polyline", (l) => l.length), 2);

    console.log("\n=== Cómo viene un comité y sus jugadores ===");
    await p.selectOption("#comite", "goicoechea");
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("las barras de medallas por final y de participantes por eliminatoria, con su número escrito",
        await p.$$eval("[data-evolucion] figure", (f) => f.map((x) => [x.querySelector("figcaption").textContent, [...x.querySelectorAll("svg text.font-semibold")].map((t) => t.textContent)])),
        [["Medallas en cada final", ["5·0·0"]], ["Participantes en cada eliminatoria", ["0", "1 · 1E"]]]);
    igual("sus jugadores y cuántos volvieron otro año", await p.textContent("[data-jugadores] p"),
        "4 jugadores en torneos individuales y en sus equipos; 2 (50\u00a0%) jugaron los JDN en más de un año. Toca un nombre para ver su trayectoria.");

    console.log("\n=== La ficha del jugador ===");
    await p.click("[data-jugadores] tbody tr[data-jugador='Mora Vargas, Ana'] button");
    await p.waitForFunction(() => document.getElementById("jugador").checkVisibility());
    igual("abre su ficha, esconde lo demás y el enlace la guarda",
        [await visible(p, "#ficha"), await visible(p, "#general"), await p.evaluate(() => location.hash)], [false, false, "#~~j=mora+vargas+ana"]);
    igual("sus cifras: eliminatorias, finales, medallas (individual y tablero) y categorías",
        await p.$$eval("#jugador .grid > div p:first-child", (d) => d.map((x) => x.textContent)), ["1", "1", "2", "U12"]);
    igual("su trayectoria, en orden, con la medalla",
        await p.$$eval("#jugador tbody tr:not([data-elo-edicion])", (t) => t.map((x) => [x.cells[0].textContent, x.cells[3].textContent, x.cells[6].textContent.trim()])),
        [["Eliminatoria 2025", "Individual", ""], ["Eliminatoria 2025", "Equipo Goicochea A · tablero 1", ""], ["Final 2026", "Individual", "🥇 Oro"], ["Final 2026", "Tablero 1 · Goicoechea A", "🥇 Oro"]]);
    igual("sus partidas contra el Elo, torneo por torneo, con la diferencia con su signo",
        [await p.textContent("#jugador [data-contra-elo]"),
         await p.$$eval("#jugador tr[data-elo-edicion]", (t) => t.map((x) => [x.cells[2].textContent, x.cells[8].textContent, x.cells[9].textContent]))],
        ["En 10 partidas contra rivales con Elo sacó 9,5 puntos; por el Elo se esperaban 6,3: 3,2 por encima de lo esperado.",
         [["Goicochea A · tablero 1", "+0,3", "1691"], ["Individual", "+0,8", "2300"], ["Goicoechea A · tablero 1", "+1,1", "2300"], ["Individual", "+1,1", "2300"]]]);
    await p.selectOption("#f-modo", "I");
    igual("un filtro deja la ficha del jugador abierta y la recorta", [await visible(p, "#jugador"), await p.$$eval("#jugador tbody tr:not([data-elo-edicion])", (t) => t.length)], [true, 2]);
    await p.click("#volver");
    igual("«Ver todos los comités» la cierra", [await visible(p, "#jugador"), await visible(p, "#general")], [false, true]);
    await ctx.close();

    ({ ctx, p } = await abrir(browser, "jdn-comites.html#~~j=mora+vargas+ana", true));
    await p.waitForFunction(() => document.getElementById("jugador").checkVisibility());
    igual("el enlace de un jugador abre su ficha", await p.textContent("#jugador h2"), "Mora Vargas, Ana");
    await ctx.close();

    console.log("\n=== Un enlace con filtros abre lo mismo ===");
    ({ ctx, p } = await abrir(browser, "jdn-comites.html#belen~2026-F~cat=U12&modo=I", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("los filtros vuelven a sus listas", [await p.$eval("#f-cat", (s) => s.value), await p.$eval("#f-modo", (s) => s.value), await p.$eval("#comite", (s) => s.value)], ["U12", "I", "belen"]);
    igual("y la ficha muestra solo lo individual", await p.$$eval("#ficha section[data-edicion='2026-F'] h4", (h) => h.map((x) => x.textContent)), ["Individual"]);
    await ctx.close();


    console.log("\n=== La copa: puntos por puesto ===");
    ({ ctx, p } = await abrir(browser, "jdn-comites.html", true));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    const copaFilas = () => p.$$eval("#copa tbody tr", (t) => t.map((x) => [...x.cells].map((c) => c.textContent.trim())));
    igual("con la escala de siempre (10, 8, 6…) y los tableros: individual, equipos y tableros; el empate suma los dos",
        await copaFilas(),
        [["1", "Goicoechea", "55", "10", "15", "30", "6", "5·0·0"], ["2", "CODEA (Alajuela)", "34", "8", "8", "18", "4", "1·3·0"], ["3", "Belén", "13", "13", "0", "0", "2", "0·1·0"]]);
    igual("la escala propia está escondida mientras no se elige", await visible(p, "#copa-propia"), false);
    await p.selectOption("#copa-escala", "3");
    igual("solo el podio: el 4.º ya no suma", (await copaFilas()).map((f) => [f[1], f[2], f[6]]), [["Goicoechea", "15", "5"], ["CODEA (Alajuela)", "9", "4"], ["Belén", "2", "1"]]);
    igual("el enlace guarda la escala", await p.evaluate(() => location.hash), "#~~copa=3");
    await p.uncheck("#copa-tableros");
    igual("sin los tableros desaparece su columna y su suma",
        [await p.$$eval("#copa th", (t) => t.map((x) => x.textContent)), (await copaFilas()).map((f) => [f[1], f[2]]), await p.evaluate(() => location.hash)],
        [["Puesto", "Comité", "Puntos", "Individual", "Equipos", "Puestos que suman", "Oro·Plata·Bronce"], [["Goicoechea", "6"], ["CODEA (Alajuela)", "4"], ["Belén", "2"]], "#~~copa=3&ct=0"]);
    await p.selectOption("#copa-escala", "x");
    igual("«Otra escala» muestra la caja para escribirla", await visible(p, "#copa-propia"), true);
    await p.fill("#copa-propia", "5, 3");
    igual("una escala escrita a mano, también en el enlace",
        [(await copaFilas()).map((f) => [f[1], f[2]]), await p.evaluate(() => location.hash)],
        [[["Goicoechea", "10"], ["CODEA (Alajuela)", "6"], ["Belén", "3"]], "#~~copa=5-3&ct=0"]);
    await p.selectOption("#edicion", "2025-E");
    igual("en una eliminatoria no hay copa", await visible(p, "#copa"), false);
    await ctx.close();
    ({ ctx, p } = await abrir(browser, "jdn-comites.html#~~copa=5-3&ct=0", true));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("el enlace con la escala la vuelve a poner",
        [await p.$eval("#copa-escala", (s) => s.value), await p.$eval("#copa-propia", (s) => s.value), await p.$eval("#copa-tableros", (c) => c.checked), (await copaFilas())[0][2]],
        ["x", "5, 3", false, "10"]);
    await ctx.close();

    console.log("\n=== Los integrantes de cada equipo ===");
    ({ ctx, p } = await abrir(browser, "jdn-comites.html#goicoechea", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("lee los jugadores", await p.evaluate(() => window.__pedidos.filter((x) => x.startsWith("jdn_jugadores"))), ["jdn_jugadores 0"]);
    igual("la ficha del comité dice quién jugó en cada equipo, con su tablero, Elo y partidas (también quien no jugó)",
        await p.$$eval("#ficha section[data-edicion='2025-E'] tr[data-integrante]", (t) => t.map((x) => [x.cells[2].textContent, x.cells[3].textContent, x.cells[4].textContent, x.cells[5].textContent, x.cells[6].textContent, x.cells[7].textContent])),
        [["Goicochea A", "1", "Mora Vargas, Ana", "1580", "2", "1½"], ["Goicochea A", "2", "Brenes Soto, Kai", "1400", "2", "2"], ["Goicochea A", "3", "Vega Rojas, Noa", "—", "0", "0"]]);
    igual("cada integrante lleva su enlace a la composición del equipo",
        await p.$eval("#ficha section[data-edicion='2025-E'] tr[data-integrante] a", (a) => a.getAttribute("href")), "https://chess-results.com/tnr900002.aspx?lan=2&art=20&turdet=YES");
    igual("la columna «Contra el Elo» de cada edición y la frase del total",
        [await p.$$eval("#ficha tr[data-edicion]", (t) => t.map((x) => x.lastElementChild.textContent)), await p.textContent("#ficha [data-contra-elo]")],
        [["+3,2 en 11", "+2,2 en 6"], "Contra el Elo: sus jugadores sacaron 15,0 puntos en 17 partidas contra rivales con Elo, y por el Elo se esperaban 9,6: 5,4 por encima de lo esperado. Ver «Rendimiento contra el Elo» en el medallero."]);
    await p.click("#ficha tr[data-integrante='Brenes Soto, Kai'] button");
    await p.waitForFunction(() => document.getElementById("jugador").checkVisibility());
    igual("un integrante abre su ficha, con sus dos equipos (sin medalla: no está en la clasificación por tableros)",
        await p.$$eval("#jugador tbody tr:not([data-elo-edicion])", (t) => t.map((x) => [x.cells[0].textContent, x.cells[3].textContent, x.cells[5].textContent, x.cells[6].textContent.trim()])),
        [["Eliminatoria 2025", "Equipo Goicochea A · tablero 2", "equipo 1 de 1", ""], ["Final 2026", "Equipo Goicoechea A · tablero 3", "equipo 1 de 2", ""]]);
    await p.click("#volver");
    await p.selectOption("#edicion", "2026-F");
    igual("«Participantes» de una edición cuenta los integrantes y las personas (quien jugó individual y por equipos, una vez)",
        await p.$$eval("#participacion tbody tr", (t) => t.map((x) => [x.cells[0].textContent, x.cells[9].textContent, x.cells[10].textContent])),
        [["CODEA (Alajuela)", "2", "3"], ["Goicoechea", "3", "3"], ["Belén", "0", "2"], ["Total", "5", "8"]]);
    await ctx.close();

    console.log("\n=== El rendimiento contra el Elo ===");
    ({ ctx, p } = await abrir(browser, "jdn-comites.html", true));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("por comité: partidas entre jugadores con Elo, puntos, esperados y la diferencia con su signo; el que no tiene Elo no cuenta",
        await p.$$eval("#rendimiento > div:first-of-type tbody tr", (t) => t.map((x) => [...x.cells].map((c) => c.textContent.trim()))),
        [["Goicoechea", "7", "1530", "17", "15,0", "9,6", "+5,4", "+31,9"], ["CODEA (Alajuela)", "3", "1500", "9", "6,0", "4,2", "+1,8", "+20,1"],
         ["Belén", "1", "1450", "2", "0,0", "0,7", "−0,7", "−36,0"], ["Total", "11", "", "28", "21,0", "14,5", "+6,5", ""]]);
    igual("quiénes más sorprendieron: solo con 3 partidas o más, con su actuación",
        await p.$$eval("#rendimiento tr[data-sorpresa]", (t) => t.map((x) => [x.cells[0].textContent, x.cells[4].textContent, x.cells[10].textContent, x.cells[11].textContent])),
        [["Mora Vargas, Ana", "Goicoechea A · tablero 1", "+1,1", "2300"], ["Mora Vargas, Ana", "Individual", "+1,1", "2300"], ["Ruiz Mena, Ivo", "CODEA B · tablero 2", "+1,0", "1780"],
         ["Leon Vega, Sol", "Goicoechea A · tablero 2", "+0,8", "1780"], ["Solis Rojas, Juan", "Individual", "+0,6", "1653"], ["Diaz Solis, Pia", "CODEA B · tablero 1", "+0,2", "1550"]]);
    igual("cada uno con su enlace: la tabla cruzada o la composición del equipo",
        await p.$$eval("#rendimiento tr[data-sorpresa] a", (a) => a.slice(0, 2).map((x) => x.getAttribute("href").replace("https://chess-results.com/tnr", ""))),
        ["900004.aspx?lan=2&art=20&turdet=YES", "900003.aspx?lan=2&art=4"]);
    await p.selectOption("#edicion", "2025-E");
    igual("con una edición, solo esa", await p.$$eval("#rendimiento > div:first-of-type tbody tr", (t) => t.map((x) => [x.cells[0].textContent, x.cells[6].textContent])),
        [["Goicoechea", "+2,2"], ["Total", "+2,2"]]);
    await p.selectOption("#edicion", "");
    await p.selectOption("#f-modo", "I");
    igual("el filtro de modalidad deja solo lo individual", await p.$$eval("#rendimiento > div:first-of-type tbody tr", (t) => t.map((x) => [x.cells[0].textContent, x.cells[3].textContent])),
        [["Goicoechea", "5"], ["CODEA (Alajuela)", "3"], ["Belén", "2"], ["Total", "10"]]);
    await ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
