/* Comprueba en el navegador jdn-comites.html (los resultados JDN por comité),
   con un doble de Supabase (js/supabase-client.js interceptado) y torneos
   inventados:

   - por ahora es gratis y pública: sin sesión ni licencia se ve entera, no
     manda al login y no le pregunta la licencia a la base;
   - lee jdn_resultados de mil en mil (hay 1100 filas de un solo
     torneo: si la página se quedara con el primer pedido, faltarían 100);
   - junta las variantes del comité («CCDR Goicochea», «Goico», «Goicoechea A»)
     y el medallero ordena por oros, platas y bronces;
   - un puesto vacío es un empate con el de arriba, y comparte la medalla;
   - a quien no trae comité en la final se le deduce del mismo jugador en la
     eliminatoria de su ciclo, y lo dice;
   - la ficha del comité marca la medalla con su emoji y escrita, y «Jugó la
     final» en la eliminatoria;
   - el filtro de edición deja solo esa edición, y el enlace (#comite~edicion)
     vuelve a abrir lo mismo.

   Ver «Resultados JDN por comité» en docs/decisiones/juegos-y-torneos.md.

   Uso:  node herramientas/verificar-jdn-comites.js   (con el sitio en el 8777) */
"use strict";
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
    else console.log("  ✓ " + nombre);
}

const FILAS = [];
function fila(edicion, codigo, orden, puesto, nombre, comite, puntos, record) {
    FILAS.push({ edicion, codigo, orden, puesto, nombre, comite: comite || "", record: record || null, puntos });
}
// Una eliminatoria enorme: 1100 inscritos de Limón (más que un pedido).
for (let i = 1; i <= 1100; i++) fila("2018-E", "Z2-U16-IA", i, i, "Jugador " + i + ", Prueba", "CCDR Limon", 1);
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

function doble() {
    return `
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const FILAS = ${JSON.stringify(FILAS)};
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
        // Como PostgREST: nunca más de mil por pedido.
        data = FILAS.slice(q._desde, Math.min(q._hasta + 1, q._desde + 1000));
      }
      if (tabla === "profiles") data = { id: "yo", is_admin: false, role: "profesor" };
      return Promise.resolve({ data, error: null }).then(ok, mal);
    };
    return q;
  }
  window.sb = {
    auth: {
      getSession: () => respuesta({ session: null }),
      getUser: () => respuesta({ user: { id: "yo" } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => respuesta({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => respuesta({ all: [], totp: [] }) },
    },
    rpc: (nombre, args) => {
      window.__pedidos.push(nombre);
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

async function abrir(browser, ruta) {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble() }));
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

    console.log("\n=== Gratis, sin sesión ni licencia ===");
    let { ctx, p } = await abrir(browser, "jdn-comites.html");
    await p.waitForFunction(() => !document.getElementById("loading").checkVisibility());
    igual("se ve la herramienta, sin candado y sin mandar al login",
        [await visible(p, "#app"), await p.$("#denegado") === null, new URL(p.url()).pathname], [true, true, "/jdn-comites.html"]);
    igual("no le pregunta la licencia a la base", await p.evaluate(() => window.__pedidos.includes("tengo_herramienta")), false);
    await ctx.close();

    console.log("\n=== El medallero ===");
    ({ ctx, p } = await abrir(browser, "jdn-comites.html"));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("lee de mil en mil hasta el final", await p.evaluate(() => window.__pedidos.filter((x) => x.startsWith("jdn_resultados"))),
        ["jdn_resultados 0", "jdn_resultados 1000"]);
    igual("cuenta los torneos que leyó", /en los 5 torneos/.test(await p.textContent("#intro")), true);
    const m = await medallero(p);
    igual("junta las variantes y ordena por oros, platas y bronces",
        m.map((f) => f.slice(0, 5)),
        [["Goicoechea", "Z1", "2", "", ""], ["CODEA (Alajuela)", "Z1", "", "2", ""], ["Belén", "—", "", "1", ""], ["Limón", "Z2", "", "", ""], ["Escazú", "Z1", "", "", ""]]);
    igual("el empate sin desempatar comparte la plata, y el comité deducido suma su plata a CODEA",
        m.filter((f) => f[0] === "Belén" || f[0] === "CODEA (Alajuela)").map((f) => [f[0], f[3], f[5], f[6]]),
        [["CODEA (Alajuela)", "2", "1", "1"], ["Belén", "1", "1", ""]]);
    igual("las 1100 inscripciones de Limón, todas", m.find((f) => f[0] === "Limón")[8], "1100");
    igual("el medallero se ve y la ficha no", [await visible(p, "#general"), await visible(p, "#ficha")], [true, false]);

    console.log("\n=== La ficha de un comité ===");
    await p.click("#medallero button:text-is('Goicoechea')");
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("abre la ficha y esconde el medallero", [await visible(p, "#ficha"), await visible(p, "#general"), await visible(p, "#volver")], [true, false, true]);
    igual("el enlace lleva el comité", await p.evaluate(() => location.hash), "#goicoechea");
    igual("las ediciones del comité, de la más nueva a la más vieja",
        await p.$$eval("#ficha section[data-edicion]", (s) => s.map((x) => x.dataset.edicion)), ["2026-F", "2025-E"]);
    const oro = await p.$eval("#ficha section[data-edicion='2026-F'] tr[data-jugador='Mora Vargas, Ana']", (t) => t.lastElementChild.textContent.trim());
    igual("la medalla va con su emoji y escrita", oro, "🥇 Oro");
    igual("en la eliminatoria dice quién jugó la final",
        await p.$eval("#ficha section[data-edicion='2025-E'] tr[data-jugador='Mora Vargas, Ana']", (t) => t.lastElementChild.textContent.trim()), "Jugó la final");

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
    ({ ctx, p } = await abrir(browser, "jdn-comites.html#belen~2026-F"));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("abre la ficha de Belén en la final 2026", [await p.$eval("#comite", (s) => s.value), await p.$eval("#edicion", (s) => s.value)], ["belen", "2026-F"]);
    igual("el empate de Rojas comparte la plata",
        await p.$eval("#ficha tr[data-jugador='Rojas Arias, Luis']", (t) => [t.cells[3].textContent, t.lastElementChild.textContent.trim()]), ["2 de 4", "🥈 Plata"]);
    await ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
