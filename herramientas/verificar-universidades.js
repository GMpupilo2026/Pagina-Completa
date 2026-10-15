/* Comprueba en el navegador universidades.html (los resultados
   universitarios por universidad), con un doble de Supabase
   (js/supabase-client.js interceptado) y torneos inventados. La página es
   jdn-comites.html con <body data-evento="universidades">: el mismo
   js/jdn-comites.js, con otras tablas, otra licencia y otras palabras.

   - sin licencia muestra el candado y no pide los resultados; la licencia
     que se pregunta es la de «universidades», no la de los JDN;
   - con licencia lee uni_resultados de mil en mil (hay 1100 filas de un solo
     torneo) y nunca pide jdn_* ni uni_tableros (no hay);
   - junta las variantes y las sedes de una misma universidad («UCR Grecia»,
     «Universidad de Costa Rica», «UCR (CRC)»; «ITCR», «TEC Alajuela»;
     «Santa Barbara» es la UNED), y solo salen las de Costa Rica: ni «UNA -
     NCA» (la UNA de Nicaragua) ni «UNAH - HONDURAS», en ninguna lista, y un
     país solo («NIC») no es una universidad; el puesto de las de Costa Rica
     sigue siendo el de la tabla completa;
   - el medallero tiene las columnas de universidades.html (sin zona,
     tableros ni eliminatorias) y ordena por oros, platas y bronces;
   - a quien no trae universidad (los JUDUCA individuales traen el país) se
     le deduce de su equipo en la misma edición, y lo dice;
   - la ficha de una universidad, el filtro «Evento» y el enlace que lo
     guarda;
   - las palabras: ni «comité», ni «JDN», ni «eliminatoria», ni «final» en
     todo lo que se ve (con todas las ediciones, con una, en una ficha y en
     la calidad de los datos);
   - la copa no ofrece sumar tableros;
   - el informe en PDF se llama «informe-universitario-…».

   Ver «Resultados universitarios por universidad» en
   docs/decisiones/juegos-y-torneos.md.

   Uso:  node herramientas/verificar-universidades.js   (con el sitio en el 8777) */
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
const TNR = {};
const tnr = (edicion, codigo) => TNR[edicion + codigo] || (TNR[edicion + codigo] = 800000 + Object.keys(TNR).length);
function fila(edicion, codigo, orden, puesto, nombre, comite, puntos, record) {
    FILAS.push({ edicion, codigo, tnr: tnr(edicion, codigo), orden, puesto, nombre, comite: comite || "", record: record || null, puntos });
}
// Un torneo enorme: 1100 jugadores de la UNED (más que un pedido de PostgREST).
const letras = (i) => { let t = ""; for (; i > 0; i = Math.floor((i - 1) / 26)) t = String.fromCharCode(97 + (i - 1) % 26) + t; return t; };
for (let i = 1; i <= 1100; i++) fila("2022-CONARE", "R-U-IA", i, i + 3, "Jugador " + letras(i) + ", Prueba", "UNED", 1);
fila("2022-CONARE", "R-U-IA", 1101, 1, "Mora Vargas, Ana", "UCR Grecia", 7);
fila("2022-CONARE", "R-U-IA", 1102, 2, "Solis Rojas, Juan", "ITCR Sede Alajuela", 6);
fila("2022-CONARE", "R-U-IA", 1103, 3, "Quesada Mena, Eva", "Universidad de Costa Rica Sede Rodr", 5);
fila("2023-JUNCOS", "R-U-IF", 1, 1, "Rojas Arias, Lia", "TEC Alajuela", 5);
fila("2023-JUNCOS", "R-U-IF", 2, 2, "Perez Mora, Leo", "UNA Omar Dengo", 4);
fila("2023-JUNCOS", "R-U-IF", 3, 3, "Vega Soto, Ema", "NIC", 3);
// «Santa Barbara» es la UNED (un funcionario en la FEDEU 2023).
fila("2023-FEDEU", "R-FUN-IA", 1, 1, "Vega Araya, Edwin", "Santa Barbara", 4);
fila("2023-JUNCOS", "R-U-EA", 1, 1, "UCR (CRC)", "", 10, "3-0-0");
fila("2023-JUNCOS", "R-U-EA", 2, 2, "UNA - NCA", "", 6, "1-0-2");
fila("2023-JUNCOS", "R-U-EA", 3, 3, "Tecnológico de Costa Rica", "", 4, "0-0-3");
// Un JUDUCA: el individual trae solo el país; el equipo dice la universidad.
fila("2025-JUDUCA", "C-U-IA", 1, 1, "Arce Brenes, Teo", "", 6);
fila("2025-JUDUCA", "C-U-IA", 2, 2, "Diaz Solis, Pia", "", 5);
fila("2025-JUDUCA", "C-U-EA", 1, 1, "UNED - CRC", "", 12, "2-0-0");
fila("2025-JUDUCA", "C-U-EA", 2, 2, "UNAH - HONDURAS", "", 8, "1-0-1");

const JUGADORES = [];
function jugador(edicion, codigo, orden, nombre, elo, partidas, puntos, equipo, equipoOrden, tablero) {
    JUGADORES.push({ edicion, codigo, tnr: tnr(edicion, codigo), orden, equipo: equipo || null, equipo_orden: equipoOrden || null, tablero: tablero || null,
        nombre, elo, partidas, puntos, con_elo: elo ? partidas : 0, puntos_elo: elo ? puntos : 0, elo_rivales: elo ? 1600 : null, esperado: elo ? partidas / 2 : null });
}
jugador("2025-JUDUCA", "C-U-EA", 1, "Arce Brenes, Teo", 1700, 2, 2, "UNED - CRC", 1, 1);
jugador("2025-JUDUCA", "C-U-EA", 2, "Ruiz Mena, Ivo", 1650, 2, 1, "UNED - CRC", 1, 2);
jugador("2025-JUDUCA", "C-U-EA", 3, "Diaz Solis, Pia", 1600, 2, 1, "UNAH - HONDURAS", 2, 1);
jugador("2025-JUDUCA", "C-U-EA", 4, "Leon Vega, Sol", 1550, 2, 0, "UNAH - HONDURAS", 2, 2);
jugador("2025-JUDUCA", "C-U-IA", 1, "Arce Brenes, Teo", 1700, 1, 1);
jugador("2025-JUDUCA", "C-U-IA", 2, "Diaz Solis, Pia", 1600, 1, 0);
const PARTIDAS = [
    { tnr: tnr("2025-JUDUCA", "C-U-IA"), ronda: 1, orden: 1, rival: 2, vez: 1, puntos: 1 },
    { tnr: tnr("2025-JUDUCA", "C-U-EA"), ronda: 1, orden: 1, rival: 3, vez: 1, puntos: 1 },
    { tnr: tnr("2025-JUDUCA", "C-U-EA"), ronda: 1, orden: 2, rival: 4, vez: 1, puntos: 0.5 },
];

function doble(tieneLicencia) {
    return `
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const T = { uni_resultados: ${JSON.stringify(FILAS)}, uni_jugadores: ${JSON.stringify(JUGADORES)}, uni_partidas: ${JSON.stringify(PARTIDAS)}, uni_correcciones: [] };
  const LICENCIA = ${tieneLicencia ? "true" : "false"};
  window.__pedidos = [];
  function respuesta(data) { return Promise.resolve({ data, error: null }); }
  function consulta(tabla) {
    const q = { _desde: 0, _hasta: 999 };
    ["select", "eq", "order", "in", "single", "maybeSingle", "limit", "insert", "update", "delete"].forEach((m) => { q[m] = () => q; });
    q.range = (a, b) => { q._desde = a; q._hasta = b; return q; };
    q.then = (ok, mal) => {
      window.__pedidos.push(tabla + " " + q._desde);
      if (tabla === "profiles") return Promise.resolve({ data: { id: "yo", is_admin: false }, error: null }).then(ok, mal);
      // Como la base: una tabla que no existe es un error, y sin licencia no hay filas.
      if (!T[tabla]) return Promise.resolve({ data: null, error: { message: "no existe " + tabla } }).then(ok, mal);
      const data = LICENCIA ? T[tabla].slice(q._desde, Math.min(q._hasta + 1, q._desde + 1000)) : [];
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
const medallero = (p) => p.$$eval("#medallero tbody tr", (trs) => trs.map((t) => [...t.cells].map((c) => c.textContent.trim())));
/* Las palabras de los JDN que no deben verse en la página de universidades. */
const JDN = /comit[ée]|\bJDN\b|eliminatoria|\bfinal(es)?\b|\bzona\b/i;
const palabrasJdn = (p) => p.evaluate((re) => {
    const r = new RegExp(re, "i"), malas = [];
    const w = document.createTreeWalker(document.getElementById("main-content"), NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
        const e = n.parentElement;
        if (e && e.checkVisibility() && r.test(n.textContent)) malas.push(n.textContent.trim().slice(0, 90));
    }
    for (const e of document.querySelectorAll("#main-content [aria-label]")) if (r.test(e.getAttribute("aria-label"))) malas.push("aria-label: " + e.getAttribute("aria-label").slice(0, 90));
    return malas.slice(0, 5);
}, JDN.source);

(async () => {
    const browser = await chromium.launch();

    console.log("\n=== Sin licencia ===");
    let { ctx, p } = await abrir(browser, "universidades.html", false);
    igual("se ve el candado y no la herramienta", [await visible(p, "#denegado"), await visible(p, "#app")], [true, false]);
    igual("pregunta por la licencia de «universidades» y no pide resultados",
        await p.evaluate(() => [window.__pedidos.includes("tengo_herramienta universidades"), window.__pedidos.some((x) => /^uni_resultados|^jdn_/.test(x))]), [true, false]);
    await ctx.close();

    console.log("\n=== Con licencia: el medallero ===");
    ({ ctx, p } = await abrir(browser, "universidades.html", true));
    await p.waitForSelector("#medallero tbody tr");
    igual("lee uni_resultados de mil en mil, y nunca jdn_* ni uni_tableros",
        await p.evaluate(() => [window.__pedidos.filter((x) => x.startsWith("uni_resultados")), window.__pedidos.some((x) => /^jdn_|^uni_tableros/.test(x))]),
        [["uni_resultados 0", "uni_resultados 1000"], false]);
    igual("las columnas del medallero son las de universidades.html",
        await p.$$eval("#medallero thead th", (ths) => ths.map((t) => t.textContent.trim())),
        ["Universidad", "🥇 Oro", "🥈 Plata", "🥉 Bronce", "Medallas ind.", "Medallas eq.", "Participaciones ind.", "Equipos"]);
    igual("junta sedes y variantes; «Santa Barbara» es la UNED; ni la UNA de Nicaragua ni la UNAH; «NIC» no es una universidad; ordena por oros",
        (await medallero(p)).map((f) => f.slice(0, 4)),
        [["UNED", "3", "", ""], ["UCR", "2", "", "1"], ["TEC", "1", "1", "1"], ["UNA", "", "1", ""]]);
    igual("ninguna universidad de afuera en la lista para elegir",
        await p.$$eval("#comite option", (os) => os.filter((o) => /Nicaragua|Honduras|NIC/.test(o.textContent)).length), 0);
    igual("cada fila tiene una celda por columna", (await medallero(p)).every((f) => f.length === 8), true);
    igual("el título y la introducción hablan de universidades",
        [await p.$eval("#general-titulo", (e) => e.textContent), /universidad/.test(await p.$eval("#intro", (e) => e.textContent))], ["Medallero de todos los torneos", true]);
    igual("ninguna palabra de los JDN con todas las ediciones", await palabrasJdn(p), []);
    igual("la copa no ofrece sumar tableros", await p.$$eval("#copa-tableros", (l) => l.length ? l[0].isConnected && l[0].checkVisibility() : false), false);
    igual("la calidad de los datos habla de la universidad deducida",
        await p.$eval("#calidad", (e) => /universidad deducida/.test(e.textContent) && /no la trae/.test(e.textContent)), true);

    console.log("\n=== La ficha y los filtros ===");
    await p.selectOption("#comite", "uned");
    await p.waitForSelector("#ficha-titulo");
    igual("la ficha de la UNED", await p.$eval("#ficha-titulo", (e) => e.textContent), "UNED");
    igual("al del JUDUCA sin universidad se le deduce de su equipo, y lo dice",
        await p.$$eval("#ficha section[data-edicion='2025-JUDUCA'] tr[data-jugador='Arce Brenes, Teo']", (trs) => trs.map((t) => t.textContent.includes("universidad deducida"))), [true]);
    igual("ninguna palabra de los JDN en la ficha", await palabrasJdn(p), []);
    igual("el informe en PDF se llama como la herramienta",
        await (async () => { const [d] = await Promise.all([p.waitForEvent("download"), p.click("#ficha-pdf")]); return d.suggestedFilename(); })(),
        "informe-universitario-uned.pdf");
    await p.selectOption("#comite", "");
    await p.selectOption("#f-serie", "JUDUCA");
    await p.waitForFunction(() => /JUDUCA/.test(document.getElementById("filtros-activos").textContent));
    igual("el filtro «Evento» deja solo los JUDUCA, sin la UNAH", (await medallero(p)).map((f) => f[0]), ["UNED"]);
    igual("el enlace guarda el evento", await p.evaluate(() => decodeURIComponent(location.hash)), "#~~serie=JUDUCA");
    await ctx.close();

    ({ ctx, p } = await abrir(browser, "universidades.html#~2023-JUNCOS~serie=JUNCOS", true));
    await p.waitForSelector("#medallero tbody tr");
    igual("el enlace vuelve a abrir la edición con su filtro",
        [await p.$eval("#edicion", (e) => e.value), await p.$eval("#f-serie", (e) => e.value), await p.$eval("#general-titulo", (e) => e.textContent)],
        ["2023-JUNCOS", "JUNCOS", "Medallero · XXIV JUNCOS 2023"]);
    igual("ninguna palabra de los JDN con una edición", await palabrasJdn(p), []);
    await ctx.close();

    console.log("\n=== Los JDN no cambian ===");
    ({ ctx, p } = await abrir(browser, "jdn-comites.html", false));
    igual("jdn-comites.html sigue preguntando por su licencia", await p.evaluate(() => window.__pedidos.includes("tengo_herramienta jdn-comites")), true);
    await ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
