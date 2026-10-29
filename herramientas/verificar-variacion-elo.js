/* variacion-elo.html: «Variación de Elo del torneo», con un doble de Supabase
   (la licencia y la Edge Function desempates-chess-results contestadas por
   un torneo de cuatro jugadores armado a mano).

   Lo que comprueba, con los números sacados a mano de las reglas de FIDE
   (B.02: tope de 400, la tabla 8.1.2, K 40 / 20 / 10):
   - le pide a la función la herramienta «variacion-elo», no «desempates»;
   - el ±FIDE de cada uno: el que no tiene Elo FIDE no cambia ni cuenta como
     rival; el menor de 18 lleva K 40 y el de 2400 o más, K 10;
   - el ±nacional, con el Elo nacional de cada uno (otros números);
   - el «FIDE elo +/-» de chess-results al lado, y cuando no coincide, con qué
     K lo calculó;
   - «Partida por partida»: las partidas que contaron, con el tope de 400;
   - sin licencia, el candado y nada de la herramienta;
   - a 390 px, la tabla se desplaza dentro de su caja y la página no.

   Ver «Variación de Elo del torneo» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js variacion-elo                     */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

/* A 1800 FIDE / 1900 nac (nació 1990, K 20); B 1600 / 1500 (nació 2012: menor,
   K 40); C sin FIDE / 1700 (nació 2000); D 2500 / 2450 (K 10).
   R1: A–B 0-1, C–D ½. R2: A–C 1-0, B–D 0-1. R3: A–D ½, B–C 1-0. */
const P = (ronda, rivalSnr, rivalNombre, color, puntos, rivalFide, rivalNacional) =>
    ({ ronda, rivalSnr, rivalNombre, bye: false, incomparecencia: null, color, puntos, rivalFide, rivalNacional });
const TORNEO = {
    id: "999", url: "https://s1.chess-results.com/tnr999.aspx?lan=2", titulo: "Torneo de Prueba", rondasJugadas: 3, final: true, faltantes: [],
    jugadores: [
        { puesto: 1, snr: 2, nombre: "Bravo, Beto", elo: 1600, puntos: 2, eloFide: 1600, eloNacional: 1500, nacimiento: 2012, fideId: 222, cambioFide: 13.6,
            partidas: [P(1, 1, "Alfa, Ana", "b", 1, 1800, 1900), P(2, 4, "Delta, Dora", "w", 0, 2500, 2450), P(3, 3, "Charlie, Cata", "b", 1, 0, 1700)] },
        { puesto: 2, snr: 4, nombre: "Delta, Dora", elo: 2500, puntos: 2, eloFide: 2500, eloNacional: 2450, nacimiento: 1985, fideId: 444, cambioFide: null,
            partidas: [P(1, 3, "Charlie, Cata", "b", 0.5, 0, 1700), P(2, 2, "Bravo, Beto", "b", 1, 1600, 1500), P(3, 1, "Alfa, Ana", "b", 0.5, 1800, 1900)] },
        { puesto: 3, snr: 1, nombre: "Alfa, Ana", elo: 1800, puntos: 1.5, eloFide: 1800, eloNacional: 1900, nacimiento: 1990, fideId: 111, cambioFide: -6.8,
            partidas: [P(1, 2, "Bravo, Beto", "w", 0, 1600, 1500), P(2, 3, "Charlie, Cata", "w", 1, 0, 1700), P(3, 4, "Delta, Dora", "w", 0.5, 2500, 2450)] },
        { puesto: 4, snr: 3, nombre: "Charlie, Cata", elo: 1700, puntos: 0.5, eloFide: 0, eloNacional: 1700, nacimiento: 2000, fideId: 0, cambioFide: null,
            partidas: [P(1, 4, "Delta, Dora", "w", 0.5, 2500, 2450), P(2, 1, "Alfa, Ana", "b", 0, 1800, 1900), P(3, 2, "Bravo, Beto", "w", 0, 1600, 1500)] },
    ],
};

function doble(licencia, torneo) {
    return `(function(){
  window.__pedidos = [];
  const R = (data, error) => Promise.resolve({ data, error: error || null });
  window.sb = {
    auth: {
      getSession: () => R({ session: { user: { id: "yo" }, access_token: "x" } }),
      getUser: () => R({ user: { id: "yo" } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => R({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => R({ all: [], totp: [] }) },
    },
    rpc: (n, a) => { window.__pedidos.push(n + " " + (a && a.p_herramienta || "")); return R(n === "tengo_herramienta" ? ${licencia ? "a.p_herramienta === 'variacion-elo'" : "false"} : null); },
    functions: { invoke: (n, o) => { window.__pedidos.push("invoke " + n + " " + JSON.stringify(o.body)); return R(${JSON.stringify(torneo || TORNEO)}); } },
    from: () => { const q = {}; ["select","eq","order","range","in","single","maybeSingle","limit","update","insert"].forEach((m) => q[m] = () => q); q.then = (ok) => Promise.resolve({ data: [], error: null }).then(ok); return q; },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;
}

async function abrir(browser, licencia, ancho, torneo) {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: ancho || 1280, height: 900 } });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble(licencia, torneo) }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(BASE + "/variacion-elo.html", { waitUntil: "load" });
    return { ctx, p, errores };
}

(async () => {
    const browser = await chromium.launch();

    console.log("\n=== Sin licencia ===");
    let { ctx, p } = await abrir(browser, false);
    await p.waitForFunction(() => document.getElementById("denegado").checkVisibility());
    igual("el candado, y la herramienta no se ve", await p.$eval("#app", (a) => a.checkVisibility()), false);
    igual("pregunta por la licencia de «variacion-elo»", await p.evaluate(() => window.__pedidos.includes("tengo_herramienta variacion-elo")), true);
    await ctx.close();

    console.log("\n=== Con licencia ===");
    let errores;
    ({ ctx, p, errores } = await abrir(browser, true));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    await p.fill("#c-anio", "2026");
    await p.fill("#c-url", "https://s1.chess-results.com/tnr999.aspx");
    await p.click("#b-calcular");
    await p.waitForSelector("#r-filas tr");
    igual("le pide a la función la herramienta «variacion-elo»",
        await p.evaluate(() => window.__pedidos.some((x) => x.startsWith("invoke desempates-chess-results") && x.includes('"herramienta":"variacion-elo"'))), true);
    const fila = (id) => p.$eval(`#r-filas tr[data-id="${id}"]`, (tr) => ["k", "fide", "cr", "nac"].map((c) => tr.querySelector(`[data-elo="${c}"]`).textContent));
    igual("Alfa (K 20): −6,8 FIDE (contra Charlie, sin Elo FIDE, no cuenta), igual que chess-results; −5,2 nacional", await fila("p1"), ["20", "-6,8", "-6,8", "-5,2"]);
    igual("Bravo, menor de 18 (K 40): +27,2 FIDE; chess-results dice +13,6, con K 20; +64 nacional", await fila("p2"), ["40", "+27,2", "+13,6con K 20", "+64"]);
    igual("Charlie, sin Elo FIDE: no cambia en FIDE; −11,6 nacional", await fila("p3"), ["—", "—", "—", "-11,6"]);
    igual("Delta, 2500 (K 10): −3,4 FIDE; −7,6 nacional", await fila("p4"), ["10", "-3,4", "—", "-7,6"]);
    igual("en el orden de la clasificación", await p.$$eval("#r-filas tr", (l) => l.map((tr) => tr.dataset.id)), ["p2", "p4", "p1", "p3"]);
    igual("sin avisos: los puntajes coinciden y chess-results sí da variación FIDE", await p.$eval("#zona-avisos", (z) => z.checkVisibility()), false);

    console.log("\n=== Partida por partida ===");
    await p.click('#r-filas tr[data-id="p1"] button');
    await p.waitForFunction(() => document.getElementById("zona-detalle").checkVisibility());
    igual("las dos partidas FIDE de Alfa, con el tope de 400 contra Delta",
        await p.$$eval("#d-contenido > div:first-child tbody tr", (l) => l.map((tr) => [...tr.children].map((td) => td.textContent))),
        [["1", "Bravo, Beto", "1600", "+200", "0,76", "0", "-15,2"], ["3", "Delta, Dora", "2500", "-400 (tope)", "0,08", "½", "+8,4"]]);
    igual("y la cuenta", (await p.textContent("#d-contenido > div:first-child")).includes("K 20 × (0,5 − 0,84) = -6,8"), true);

    console.log("\n=== En el celular ===");
    await p.setViewportSize({ width: 390, height: 800 });
    igual("la página no se desplaza a lo ancho (la tabla, dentro de su caja)", await p.evaluate(() => document.documentElement.scrollWidth), 390);
    igual("sin errores en la página", errores, []);
    await ctx.close();

    console.log("\n=== Un torneo que no vale para Elo FIDE ===");
    {
        // Como el Nacional U15 2025 en chess-results: el «FIDE elo +/-» en 0 para todos.
        const sinFide = JSON.parse(JSON.stringify(TORNEO));
        sinFide.jugadores.forEach((j) => { j.cambioFide = 0; });
        const r = await abrir(browser, true, 1280, sinFide);
        await r.p.waitForFunction(() => document.getElementById("app").checkVisibility());
        await r.p.fill("#c-url", "https://s1.chess-results.com/tnr999.aspx");
        await r.p.click("#b-calcular");
        await r.p.waitForSelector("#r-filas tr");
        igual("avisa que lo más probable es que no sea válido para Elo FIDE",
            await r.p.$eval('#avisos [data-aviso="sin-fide"]', (li) => li.checkVisibility()), true);
        await r.ctx.close();
    }

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
