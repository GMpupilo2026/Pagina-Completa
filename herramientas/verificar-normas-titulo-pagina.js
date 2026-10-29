/* normas-titulo.html: «Normas de título», con un doble de Supabase (la
   licencia y la Edge Function desempates-chess-results contestadas por un
   torneo armado a mano: nueve GM de 2450, de nueve federaciones, y tres
   jugadores que los enfrentan a todos).

   Lo que comprueba (el cálculo en sí lo revisa verificar-normas-titulo.js
   contra el anexo de FIDE):
   - le pide a la función la herramienta «normas-titulo»;
   - Hugo (sin título, 7 de 9): norma de GM y de IM, y la de IM vale 11
     partidas (1.4.1d); arriba de todo;
   - Carla (ya IM, 6 de 9): «Cerca de GM», le faltó ½ punto; la norma de IM
     no se le busca porque ya tiene el título;
   - Ana (WIM, 5 de 9): norma de IM y de WGM, y no se le muestra la de WIM;
   - como hay una mujer marcada, a los demás no se les buscan las femeninas;
   - «Por qué» de Carla: solo el 1.4.8 en ✗, dicho también con palabras
     (no solo con el color);
   - sin la federación de nadie, el aviso «sin-fed»;
   - sin licencia, el candado; a 390 px, la página no se desplaza a lo ancho.

   Ver «Normas de título» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js normas-titulo-pagina              */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

const FEDS = ["ESP", "CUB", "MEX", "ARG", "COL", "PER", "CHI", "VEN", "URU"];
const GMS = FEDS.map((fed, i) => ({ puesto: 4 + i, snr: 10 + i, nombre: "Gran Maestro " + (i + 1), titulo: "GM", fed, sexo: "", elo: 2450, eloFide: 2450, eloNacional: 0, puntos: 0, partidas: [] }));
// Gana las primeras `puntos` rondas (con medio punto en la siguiente) y pierde el resto.
const contra = (puntos) => GMS.map((g, i) => ({ ronda: i + 1, rivalSnr: g.snr, rivalNombre: g.nombre, bye: false, incomparecencia: null, color: i % 2 ? "b" : "w",
    puntos: Math.min(1, Math.max(0, puntos - i)), rivalFide: 2450, rivalNacional: 0 }));
const TORNEO = {
    id: "999", url: "https://s1.chess-results.com/tnr999.aspx?lan=2", titulo: "Abierto de Prueba", rondasJugadas: 9, final: true, faltantes: [],
    jugadores: [
        { puesto: 1, snr: 1, nombre: "Hugo Solano", titulo: "", fed: "CRC", sexo: "", elo: 2300, eloFide: 2300, puntos: 7, partidas: contra(7) },
        { puesto: 2, snr: 2, nombre: "Carla Mora", titulo: "IM", fed: "CRC", sexo: "", elo: 2380, eloFide: 2380, puntos: 6, partidas: contra(6) },
        { puesto: 3, snr: 3, nombre: "Ana Pérez", titulo: "WIM", fed: "CUB", sexo: "w", elo: 2200, eloFide: 2200, puntos: 5, partidas: contra(5) },
    ].concat(GMS),
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
    rpc: (n, a) => { window.__pedidos.push(n + " " + (a && a.p_herramienta || "")); return R(n === "tengo_herramienta" ? ${licencia ? "a.p_herramienta === 'normas-titulo'" : "false"} : null); },
    functions: { invoke: (n, o) => { window.__pedidos.push("invoke " + n + " " + JSON.stringify(o.body)); return R(${JSON.stringify(torneo || TORNEO)}); } },
    from: () => { const q = {}; ["select","eq","order","range","in","single","maybeSingle","limit","update","insert"].forEach((m) => q[m] = () => q); q.then = (ok) => Promise.resolve({ data: [], error: null }).then(ok); return q; },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;
}

async function abrir(browser, licencia, torneo) {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble(licencia, torneo) }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(BASE + "/normas-titulo.html", { waitUntil: "load" });
    return { ctx, p, errores };
}

async function cargar(p) {
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    await p.fill("#c-url", "https://s1.chess-results.com/tnr999.aspx");
    await p.click("#b-calcular");
    await p.waitForSelector("#r-filas tr");
}

(async () => {
    const browser = await chromium.launch();

    console.log("\n=== Sin licencia ===");
    let { ctx, p } = await abrir(browser, false);
    await p.waitForFunction(() => document.getElementById("denegado").checkVisibility());
    igual("el candado, y la herramienta no se ve", await p.$eval("#app", (a) => a.checkVisibility()), false);
    igual("pregunta por la licencia de «normas-titulo»", await p.evaluate(() => window.__pedidos.includes("tengo_herramienta normas-titulo")), true);
    await ctx.close();

    console.log("\n=== Con licencia ===");
    let errores;
    ({ ctx, p, errores } = await abrir(browser, true));
    await cargar(p);
    igual("le pide a la función la herramienta «normas-titulo»",
        await p.evaluate(() => window.__pedidos.some((x) => x.startsWith("invoke desempates-chess-results") && x.includes('"herramienta":"normas-titulo"'))), true);
    const celda = (id) => p.$eval(`#r-filas tr[data-id="${id}"] [data-celda="norma"]`, (td) => td.textContent);
    igual("Hugo, 7 de 9 contra GM de 2450: norma de GM y de IM (ni la de WGM ni la de WIM: hay una mujer marcada y él no); la de IM, con 2½ puntos de más, vale 11 partidas (1.4.1d)", await celda("p1"), "Norma de GM y de IM (la de IM vale 11 partidas)");
    igual("Carla, ya IM, 6 de 9: cerca de GM, le faltó medio punto", await celda("p2"), "Cerca de GM: le faltó ½ punto");
    igual("Ana, WIM, 5 de 9: norma de IM y de WGM (la de WIM ya no se le busca)", await celda("p3"), "Norma de IM y de WGM (la de WGM vale 10 partidas)");
    igual("arriba las normas, después quien estuvo cerca", await p.$$eval("#r-filas tr", (l) => l.slice(0, 3).map((tr) => tr.dataset.id + ":" + tr.dataset.norma)), ["p1:norma", "p3:norma", "p2:cerca"]);
    igual("el resumen dice las cuatro normas", await p.textContent("#r-resumen"), "4 normas: Hugo Solano (GM), Hugo Solano (IM), Ana Pérez (IM), Ana Pérez (WGM).");
    igual("sin avisos: el torneo trae federaciones y títulos", await p.$eval("#zona-avisos", (z) => z.checkVisibility()), false);

    console.log("\n=== «Por qué» ===");
    await p.click('#r-filas tr[data-id="p2"] button');
    await p.waitForFunction(() => document.getElementById("zona-detalle").checkVisibility());
    igual("a Carla solo se le revisa GM (ya es IM, y no es mujer)", await p.$$eval("#d-contenido [data-titulo]", (l) => l.map((d) => d.dataset.titulo)), ["GM"]);
    igual("y le falla solo el rendimiento (1.4.8), dicho con palabras",
        await p.$$eval('#d-contenido [data-titulo="GM"] li[data-ok="no"]', (l) => l.map((li) => li.textContent.replace(/\s+/g, " ").trim())),
        ["✗ No cumple: Art. 1.4.8: Rendimiento: 2450 + 125 = 2575; hace falta 2600. Con estos rivales hacían falta 6½ puntos."]);
    igual("el foco va al detalle", await p.evaluate(() => document.activeElement.id), "zona-detalle");

    console.log("\n=== En el celular ===");
    await p.setViewportSize({ width: 390, height: 800 });
    igual("la página no se desplaza a lo ancho (la tabla, dentro de su caja)", await p.evaluate(() => document.documentElement.scrollWidth), 390);
    igual("sin errores en la página", errores, []);
    await ctx.close();

    console.log("\n=== Un torneo sin federaciones ===");
    {
        const sinFed = JSON.parse(JSON.stringify(TORNEO));
        sinFed.jugadores.forEach((j) => { j.fed = ""; });
        const r = await abrir(browser, true, sinFed);
        await cargar(r.p);
        igual("avisa que el requisito de federaciones no se puede revisar", await r.p.$eval('#avisos [data-aviso="sin-fed"]', (li) => li.checkVisibility()), true);
        igual("y nadie hace norma", await r.p.textContent("#r-resumen"), "Nadie hizo norma en este torneo.");
        await r.ctx.close();
    }

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
