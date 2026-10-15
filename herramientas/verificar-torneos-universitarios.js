/* Comprueba en el navegador torneos-universitarios.html (el catálogo de los
   torneos universitarios de Costa Rica), con un doble de Supabase
   (js/supabase-client.js interceptado) y torneos inventados:

   - sin licencia muestra el candado y no pide los torneos; la licencia que se
     pregunta es la de «universidades»;
   - con licencia lee uni_torneos de mil en mil (hay 1100 filas: si la página
     se quedara con el primer pedido, faltarían 100);
   - las cifras y la tabla por universidad que organiza (entre universidades y
     propios), y tocar una deja solo sus torneos;
   - cada torneo con su podio: la universidad del medallista solo si es una
     universidad (un club cantonal no), la de un equipo sale del equipo, y un
     torneo en curso no tiene podio sino el aviso; un medallista o un equipo
     de una universidad de afuera no sale, y los demás guardan su puesto;
   - «Quién más ganó» junta el mismo nombre con coma o sin ella, con tilde o
     sin ella y cortado por chess-results;
   - los filtros (año, tipo, ritmo, búsqueda) y el enlace que los guarda;
   - «Bajar en Excel» baja un .xlsx con cada torneo y su enlace;
   - la ficha del jugador: no se piden sus tablas hasta que hacen falta, se
     piden de mil en mil (uni_clasificacion tiene más de mil filas), junta a la
     misma persona en sus individuales entre universidades (uni_resultados,
     solo los individuales), con su equipo (uni_jugadores) y en los torneos de
     una universidad (uni_clasificacion), con el nombre cortado; cuenta sus
     podios aparte de los de su equipo, sus universidades (un club no), el año
     a año con su Elo, y nadie de una universidad de afuera sale; se abre
     desde la búsqueda, desde «Quién más ganó» y desde el enlace (#j=), y
     lleva a sus partidas contra el Elo en universidades.html.

   Ver «Torneos universitarios de Costa Rica» en
   docs/decisiones/juegos-y-torneos.md.

   Uso:  node herramientas/verificar-torneos-universitarios.js   (con el sitio en el 8777) */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
    else console.log("  ✓ " + nombre);
}

const T = [];
function torneo(tnr, nombre, inicio, organiza, tipo, ritmo, modalidad, jugadores, podio, enCurso) {
    T.push({ tnr, nombre, inicio, lugar: "Sede", organiza, tipo, edicion: null, ritmo, modalidad, jugadores, en_curso: !!enCurso,
        podio: (podio || []).map(([p, n, u]) => ({ p, n, u: u || "" })) });
}
torneo(9001, "XXV JUNCOS 2026 Individual", "2026-10-12", "UCR", "entre universidades", "C", "I", 13, [], true);
torneo(9002, "Torneo CONARE 2025 · Absoluto individual · Rápido", "2025-09-27", "UNA", "entre universidades", "R", "I", 60,
    [[1, "Cabezas Solano, David Alejandro", "UCR Rodrigo Facio"], [2, "Fernández Sibaja, Felipe", "UNA Omar Dengo"], [3, "Mora Chavarria, Sebastian", "UNED"]]);
torneo(9003, "Torneo CONARE 2025 · Absoluto por equipos · Rápido", "2025-09-28", "UNA", "entre universidades", "R", "E", 20,
    [[1, "UNAH - HONDURAS", ""], [2, "UCR A", ""], [3, "ITCR", ""]]);
torneo(9004, "Blitz UCR Marzo 2019", "2019-03-08", "UCR", "de una universidad", "B", "I", 14,
    [[1, "Cabezas Solano David Alejandro", "Asociacion Goicoechea"], [2, "Jimenez Garcia Emmanuel", "Pococi"], [3, "Rivera Gonzalez Jose", "CRC"]]);
torneo(9005, "Blitz UCR Abril 2019", "2019-04-08", "UCR", "de una universidad", "B", "I", 10,
    [[1, "Cabézas Solano, David Alejandr", ""], [2, "Jimenez Garcia Emmanuel", ""], [3, "Rivera Gonzalez Jose", ""]]);
torneo(9006, "Desafío Mentes Maestras", "2025-09-28", "CENFOTEC", "de una universidad", "R", "I", 42,
    [[1, "Ulloa Jimenez, Santiago", "CRC"], [2, "Barrantes Granados, Ian", "CRC"], [3, "Gutierrez Chavarria, Joseph", "UNAN MANAGUA (NCA)"]]);
// Relleno: más de mil torneos viejos del TEC (más que un pedido de PostgREST).
for (let i = 0; i < 1094; i++) torneo(100000 + i, "Interno TEC " + i, "2011-0" + (1 + (i % 9)) + "-10", "TEC", "de una universidad", "R", "I", 1, []);

/* Para la ficha del jugador. «Cabezas Solano» jugó el CONARE 2025 individual
   (uni_resultados) y por equipos con la UCR A (uni_jugadores), y dos Blitz de
   la UCR (uni_clasificacion), uno con el nombre cortado. «Lopez Paz» es de la
   UNAH y «Mejia Cruz» del equipo de la UNAH: no salen. «UCR A» es una fila de
   equipo de uni_resultados: no es un jugador. */
const R = [
    { tnr: 9002, codigo: "R-U-IA", orden: 1, puesto: 1, nombre: "Cabezas Solano, David Alejandro", comite: "UCR Rodrigo Facio", puntos: 6 },
    { tnr: 9002, codigo: "R-U-IA", orden: 2, puesto: 2, nombre: "Fernández Sibaja, Felipe", comite: "UNA Omar Dengo", puntos: 5.5 },
    { tnr: 9002, codigo: "R-U-IA", orden: 3, puesto: null, nombre: "Lopez Paz, Ana", comite: "UNAH", puntos: 5.5 },
    { tnr: 9003, codigo: "R-U-EA", orden: 1, puesto: 1, nombre: "UCR A", comite: "", puntos: 10 },
];
const J = [
    { tnr: 9002, orden: 1, equipo: null, equipo_orden: null, tablero: null, nombre: "Cabezas Solano, David Alejandro", elo: 2100, partidas: 7, puntos: 6 },
    { tnr: 9003, orden: 1, equipo: "UCR A", equipo_orden: 1, tablero: 1, nombre: "Cabezas Solano, David Alejandro", elo: 2120, partidas: 5, puntos: 4 },
    { tnr: 9003, orden: 2, equipo: "UNAH - HONDURAS", equipo_orden: 1, tablero: 1, nombre: "Mejia Cruz, Luis", elo: 1900, partidas: 5, puntos: 3 },
];
const C = [
    { tnr: 9004, orden: 1, puesto: 1, nombre: "Cabezas Solano David Alejandro", titulo: "CM", elo: 2050, club: "Asociacion Goicoechea", puntos: 8 },
    { tnr: 9005, orden: 1, puesto: 1, nombre: "Cabézas Solano, David Alejandr", titulo: "", elo: 2040, club: "", puntos: 7 },
    { tnr: 9005, orden: 2, puesto: 2, nombre: "Jimenez Garcia Emmanuel", titulo: "FM", elo: 2300, club: "", puntos: 6.5 },
];
for (let i = 0; i < 1094; i++) C.push({ tnr: 100000 + i, orden: 1, puesto: 1, nombre: "Relleno Tec " + i, titulo: "", elo: null, club: "", puntos: 1 });

function doble(tieneLicencia) {
    return `
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const T = ${JSON.stringify(T)};
  const TABLAS = { uni_resultados: ${JSON.stringify(R)}, uni_jugadores: ${JSON.stringify(J)}, uni_clasificacion: ${JSON.stringify(C)} };
  const LICENCIA = ${tieneLicencia ? "true" : "false"};
  window.__pedidos = [];
  function respuesta(data) { return Promise.resolve({ data, error: null }); }
  function consulta(tabla) {
    const q = { _desde: 0, _hasta: 999, _como: [] };
    ["select", "eq", "order", "in", "single", "maybeSingle", "limit"].forEach((m) => { q[m] = () => q; });
    q.like = (col, pat) => { q._como.push([col, new RegExp("^" + pat.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$")]); return q; };
    q.range = (a, b) => { q._desde = a; q._hasta = b; return q; };
    q.then = (ok, mal) => {
      window.__pedidos.push(tabla + " " + q._desde);
      if (TABLAS[tabla]) {
        // Filtran de verdad (like), ordenadas por tnr y orden, nunca más de mil.
        const filas = LICENCIA ? TABLAS[tabla].filter((f) => q._como.every(([c, re]) => re.test(String(f[c])))).sort((a, b) => a.tnr - b.tnr || a.orden - b.orden) : [];
        return Promise.resolve({ data: filas.slice(q._desde, Math.min(q._hasta + 1, q._desde + 1000)), error: null }).then(ok, mal);
      }
      if (tabla !== "uni_torneos") return Promise.resolve({ data: null, error: { message: "no existe " + tabla } }).then(ok, mal);
      // Como la base: ordenadas por fecha, de la más nueva, y nunca más de mil.
      const orden = T.slice().sort((a, b) => b.inicio.localeCompare(a.inicio) || a.tnr - b.tnr);
      const data = LICENCIA ? orden.slice(q._desde, Math.min(q._hasta + 1, q._desde + 1000)) : [];
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
      window.__pedidos.push(nombre + " " + ((args && args.p_herramienta) || ""));
      if (nombre === "tengo_herramienta") return respuesta(LICENCIA && args.p_herramienta === "universidades");
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
    const ctx = await browser.newContext({ serviceWorkers: "block", acceptDownloads: true });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble(licencia) }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    const p = await ctx.newPage();
    p.on("pageerror", (e) => { console.log("  ✗ error en la página: " + e.message); fallos++; });
    await p.goto(BASE + "/" + ruta, { waitUntil: "load" });
    await p.waitForFunction(() => !document.getElementById("loading").checkVisibility());
    return { ctx, p };
}
const visible = (p, sel) => p.$eval(sel, (e) => e.checkVisibility());
const filasDe = (p, sel) => p.$$eval(sel + " tbody tr", (trs) => trs.map((t) => [...t.cells].map((c) => c.innerText.replace(/\s+/g, " ").trim())));
/* Una parte de un ZIP guardado sin comprimir (como lo escribe js/tabla-excel.js). */
function parteZip(buf, nombre) {
    for (let i = 0; i + 30 < buf.length;) {
        if (buf.readUInt32LE(i) !== 0x04034b50) break;
        const tam = buf.readUInt32LE(i + 18), ln = buf.readUInt16LE(i + 26), le = buf.readUInt16LE(i + 28);
        const n = buf.slice(i + 30, i + 30 + ln).toString("utf8"), ini = i + 30 + ln + le;
        if (n === nombre) return buf.slice(ini, ini + tam).toString("utf8");
        i = ini + tam;
    }
    return null;
}

(async () => {
    const browser = await chromium.launch();

    console.log("\n=== Sin licencia ===");
    let { ctx, p } = await abrir(browser, "torneos-universitarios.html", false);
    igual("se ve el candado y no la herramienta", [await visible(p, "#denegado"), await visible(p, "#app")], [true, false]);
    igual("pregunta por la licencia de «universidades» y no pide los torneos",
        await p.evaluate(() => [window.__pedidos.includes("tengo_herramienta universidades"), window.__pedidos.some((x) => x.startsWith("uni_torneos"))]), [true, false]);
    await ctx.close();

    console.log("\n=== Con licencia ===");
    ({ ctx, p } = await abrir(browser, "torneos-universitarios.html", true));
    await p.waitForSelector("#lista tbody tr");
    igual("lee uni_torneos de mil en mil", await p.evaluate(() => window.__pedidos.filter((x) => x.startsWith("uni_torneos"))), ["uni_torneos 0", "uni_torneos 1000"]);
    igual("las cifras cuentan todo", await p.$$eval("#cifras p.font-serif", (l) => l.map((x) => x.textContent.replace(/\s/g, ""))), ["1100", "3", "4", "1253"]);
    igual("por universidad que organiza: torneos, entre universidades y propios",
        (await filasDe(p, "#por-uni")).map((f) => f.slice(0, 4)),
        [["TEC", "1094", "—", "1094"], ["UCR", "3", "1", "2"], ["UNA", "2", "2", "—"], ["CENFOTEC", "1", "—", "1"]]);
    const fila = (tnr) => p.$eval(`#lista tr[data-tnr='${tnr}']`, (tr) => [...tr.cells].map((c) => c.innerText.replace(/\s+/g, " ").trim()));
    igual("un torneo en curso no tiene podio, lo dice", (await fila(9001)).slice(1, 7),
        ["XXV JUNCOS 2026 Individual En curso Sede", "UCR", "Entre universidades", "Clásico", "13", "Se está jugando: el podio sale cuando termine."]);
    igual("el podio lleva la universidad de cada medallista, junta en su nombre", (await fila(9002)).slice(6, 9),
        ["🥇 Cabezas Solano, David Alejandro UCR", "🥈 Fernández Sibaja, Felipe UNA", "🥉 Mora Chavarria, Sebastian UNED"]);
    igual("en un torneo por equipos, la universidad sale del equipo; uno de afuera no sale y los demás guardan su puesto",
        (await fila(9003)).slice(6, 9), ["—", "🥈 UCR A UCR", "🥉 ITCR TEC"]);
    igual("un medallista individual de una universidad de afuera no sale", (await fila(9006)).slice(6, 9),
        ["🥇 Ulloa Jimenez, Santiago", "🥈 Barrantes Granados, Ian", "—"]);
    igual("un club cantonal o un país no es una universidad: no se muestra", (await fila(9004)).slice(6, 9),
        ["🥇 Cabezas Solano David Alejandro", "🥈 Jimenez Garcia Emmanuel", "🥉 Rivera Gonzalez Jose"]);
    igual("cada torneo lleva su enlace a chess-results",
        await p.$eval("#lista tr[data-tnr='9002'] a", (a) => a.getAttribute("href")), "https://chess-results.com/tnr9002.aspx?lan=2&art=1");
    igual("«Quién más ganó» junta el nombre con coma, con tilde y cortado",
        (await filasDe(p, "#campeones")).slice(0, 2).map((f) => f.slice(1, 6)), [["UCR", "3", "0", "0", "2025"], ["—", "1", "0", "0", "2025"]]);

    console.log("\n=== La ficha del jugador ===");
    igual("las tablas de los jugadores no se piden hasta que hacen falta",
        await p.evaluate(() => window.__pedidos.filter((x) => /^uni_(resultados|jugadores|clasificacion)/.test(x))), []);
    await p.fill("#buscar-jugador", "ucr");
    await p.waitForFunction(() => /Nadie|jugador/.test(document.getElementById("jugadores-estado").textContent));
    igual("una fila de equipo no es un jugador", await p.$$eval("#jugadores-lista button", (l) => l.map((b) => b.innerText)), []);
    igual("lee de mil en mil, y de uni_resultados solo los individuales",
        await p.evaluate(() => window.__pedidos.filter((x) => /^uni_(resultados|jugadores|clasificacion)/.test(x)).sort()),
        ["uni_clasificacion 0", "uni_clasificacion 1000", "uni_jugadores 0", "uni_resultados 0"]);
    const afuera = [];
    for (const n of ["lopez paz", "mejia cruz"]) {
        await p.fill("#buscar-jugador", n);
        await p.waitForFunction(() => /Nadie|jugador/.test(document.getElementById("jugadores-estado").textContent));
        afuera.push(await p.$eval("#jugadores-estado", (e) => e.textContent));
    }
    igual("nadie de una universidad de afuera, ni individual ni de su equipo", afuera, Array(2).fill("Nadie con ese nombre en los torneos universitarios."));
    await p.fill("#buscar-jugador", "david cabezas");
    await p.waitForSelector("#jugadores-lista button");
    igual("busca por las palabras en cualquier orden y junta el nombre cortado",
        await p.$$eval("#jugadores-lista button", (l) => l.map((b) => b.innerText.replace(/\s+/g, " ").trim())), ["Cabezas Solano, David Alejandro · 4 torneos"]);
    await p.click("#jugadores-lista button");
    await p.waitForSelector("#jugador-titulo");
    igual("la ficha: nombre, título, universidades (un club no) y las cifras",
        [await p.$eval("#jugador-titulo", (e) => e.innerText.replace(/\s+/g, " ")), await p.$eval("#jugador-universidades", (e) => e.textContent),
            await p.$$eval("#jugador-cifras p", (l) => l.map((x) => x.textContent.replace(/\s+/g, " ")))],
        ["Cabezas Solano, David Alejandro CM", "Universidad: UCR",
            ["4", "torneos universitarios: 2 entre universidades y 2 de una universidad", "3", "podios individuales (3 primeros, 0 segundos y 0 terceros); con su equipo, 1 más",
                "2019–2025", "años en que jugó (2 de ellos)", "2120", "su Elo más alto en un torneo universitario (2025)"]]);
    igual("el año a año, con el Elo más alto de cada año", await p.$$eval("#jugador tr[data-anio]", (l) => l.map((tr) => [...tr.cells].map((c) => c.innerText.trim()))),
        [["2019", "2", "2", "1.º", "2050"], ["2025", "2", "1", "1.º", "2120"]]);
    igual("dice cuánto creció", await p.$eval("#jugador-crece", (e) => e.textContent.slice(0, 44)), "Su Elo pasó de 2050 en 2019 a 2120 en 2025 (");
    igual("todos sus torneos, del más nuevo, con cómo jugó, su puesto y el enlace",
        await p.$$eval("#jugador tr[data-tnr]", (l) => l.map((tr) => [tr.dataset.tnr, tr.cells[2].innerText, tr.cells[3].innerText, tr.cells[4].innerText.trim(), tr.cells[5].innerText, tr.querySelector("a").getAttribute("href").replace("https://chess-results.com/", "")])),
        [["9003", "Con su equipo UCR A, tablero 1", "UCR", "1.º (equipo)", "4 de 5", "tnr9003.aspx?lan=2&art=20"],
            ["9002", "Individual", "UCR", "🥇 1 de 60", "6 de 7", "tnr9002.aspx?lan=2&art=1"],
            ["9005", "Individual", "—", "🥇 1 de 10", "7", "tnr9005.aspx?lan=2&art=1"],
            ["9004", "Individual", "—", "🥇 1 de 14", "8", "tnr9004.aspx?lan=2&art=1"]]);
    igual("la medalla no la lee el lector de pantalla", await p.$eval("#jugador tr[data-tnr='9002'] td:nth-child(5) span", (e) => e.getAttribute("aria-hidden")), "true");
    igual("lleva a sus partidas contra el Elo en universidades.html", await p.$eval("#jugador-elo", (a) => a.getAttribute("href")), "universidades.html#~~j=cabezas%20solano%20david%20alejandro");
    igual("la ficha va en el enlace", await p.evaluate(() => decodeURIComponent(location.hash)), "#j=cabezas+solano+david+alejandro");
    await p.click("#jugador-cerrar");
    igual("«Cerrar la ficha» la esconde y la saca del enlace", [await visible(p, "#jugador"), await p.evaluate(() => location.hash)], [false, ""]);
    await p.click("#campeones tr[data-campeon] button");
    await p.waitForSelector("#jugador-titulo");
    igual("desde «Quién más ganó» se abre la ficha", await p.$eval("#jugador-titulo", (e) => e.firstChild.textContent), "Cabezas Solano, David Alejandro");
    await ctx.close();
    ({ ctx, p } = await abrir(browser, "torneos-universitarios.html#j=cabezas%20solano%20david%20alejandr", true));
    await p.waitForSelector("#jugador-titulo");
    igual("el enlace con el nombre cortado abre la ficha completa", await p.$eval("#jugador-titulo", (e) => e.firstChild.textContent), "Cabezas Solano, David Alejandro");
    await ctx.close();
    ({ ctx, p } = await abrir(browser, "torneos-universitarios.html", true));
    await p.waitForSelector("#lista tbody tr");

    console.log("\n=== Filtros y enlace ===");
    await p.click("#por-uni button[data-org='UCR']");
    igual("tocar una universidad deja solo sus torneos", await p.$$eval("#lista tbody tr", (l) => l.map((x) => x.dataset.tnr)), ["9001", "9005", "9004"]);
    igual("el filtro va en el enlace", await p.evaluate(() => decodeURIComponent(location.hash)), "#org=UCR");
    await p.selectOption("#f-tipo", "de una universidad");
    await p.selectOption("#f-anio", "2019");
    igual("año y tipo", await p.$$eval("#lista tbody tr", (l) => l.map((x) => x.dataset.tnr)), ["9005", "9004"]);
    igual("los filtros se dicen escritos", await p.$eval("#filtros-activos", (e) => e.textContent), "Filtros: 2019 · UCR · De una universidad.");
    const h = await p.evaluate(() => location.hash);
    await ctx.close();
    ({ ctx, p } = await abrir(browser, "torneos-universitarios.html" + h, true));
    await p.waitForSelector("#lista tbody tr");
    igual("el enlace vuelve a abrir la misma vista",
        [await p.$eval("#f-anio", (e) => e.value), await p.$eval("#f-organiza", (e) => e.value), await p.$eval("#f-tipo", (e) => e.value), await p.$$eval("#lista tbody tr", (l) => l.length)],
        ["2019", "UCR", "de una universidad", 2]);
    await ctx.close();
    ({ ctx, p } = await abrir(browser, "torneos-universitarios.html", true));
    await p.waitForSelector("#lista tbody tr");
    await p.fill("#buscar", "jimenez garcía");
    igual("la búsqueda encuentra el torneo por un jugador del podio, sin importar tildes",
        await p.$$eval("#lista tbody tr", (l) => l.map((x) => x.dataset.tnr)), ["9005", "9004"]);
    await p.fill("#buscar", "");
    await p.selectOption("#f-ritmo", "R");
    await p.selectOption("#f-organiza", "CENFOTEC");
    const [d] = await Promise.all([p.waitForEvent("download"), p.click("#bajar-excel")]);
    const buf = require("fs").readFileSync(await d.path());
    const hoja = parteZip(buf, "xl/worksheets/sheet1.xml") || "";
    igual("«Bajar en Excel»: un .xlsx con el torneo, su podio y su enlace",
        [d.suggestedFilename(), /Desafío Mentes Maestras/.test(hoja), /Ulloa Jimenez, Santiago/.test(hoja), /tnr9006\.aspx/.test(hoja), /Interno TEC/.test(hoja)],
        ["torneos-universitarios.xlsx", true, true, true, false]);
    await ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
