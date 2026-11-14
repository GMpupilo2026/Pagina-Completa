/* La portada de «Mis mesas» (centroamericano-arbitro.html) según de quién es el torneo:
   - con el enlace del Centroamericano (chess-results): la píldora «XXI Campeonato» y el pizote;
   - con un torneo de Pareo Integral de Tacho Chess: SIN la píldora y con Tacho, su mascota
     (img/tacho-chess-2/mascota.png), medida por el alto para no estirar la franja;
   - con otro torneo de Pareo Integral: sin la píldora, y el pizote de siempre;
   - en los tres, «Todas las mesas» sigue siendo el botón de la mascota.
   Se mide lo que se ve (checkVisibility y la imagen cargada), no la clase. Deja capturas en
   la carpeta temporal del sistema.

   Ver «La portada de "Mis mesas" según el torneo» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js centroamericano-arbitro-marca      */
"use strict";
const os = require("os");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { TOKEN, dobleArbitro } = require("./lib/doble-centroamericano-arbitro");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const ok = JSON.stringify(hallado) === JSON.stringify(esperado);
    if (!ok) fallos++;
    console.log((ok ? "  ✓ " : "  ✗ ") + nombre + (ok ? "" : "\n      esperado: " + JSON.stringify(esperado) + "\n      hallado:  " + JSON.stringify(hallado)));
}

const ORIGINAL = 'torneo: "Sub-10 Femenino", categoria: "Sub-10", rama: "Femenino"';
// El doble de siempre; con `pareo`, el torneo viene de Pareo Integral con ese nombre (como lo manda la base: categoría «Abierto», rama «Mixto»).
const doble = (pareo) => {
    const d = dobleArbitro();
    if (!d.includes(ORIGINAL)) throw new Error("El doble del árbitro cambió: no se encontró el torneo.");
    return pareo ? d.replace(ORIGINAL, 'fuente: "pareo", torneo: ' + JSON.stringify(pareo) + ', categoria: "Abierto", rama: "Mixto"') : d;
};

async function abrir(browser, d, ancho) {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: ancho, height: 800 } });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: d }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager|cloudflareinsights/, (r) => r.abort());
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(BASE + "/centroamericano-arbitro.html#" + TOKEN, { waitUntil: "load" });
    await p.waitForFunction(() => !document.getElementById("datos").hidden);
    await p.waitForFunction(() => { const i = document.getElementById("mascota-evento"); return i.complete && i.naturalWidth > 0; });
    return { ctx, p, errores };
}

const portada = (p) => p.evaluate(() => {
    const i = document.getElementById("mascota-evento"), r = i.getBoundingClientRect();
    return {
        pildora: document.querySelector(".cac-pildora").checkVisibility(),
        mascota: i.getAttribute("src"),
        seVe: i.checkVisibility() && i.naturalWidth > 0,
        enBoton: !!i.closest("#ver-todas-mesas"),
        alto: Math.round(r.height),
    };
});

(async () => {
    const browser = await chromium.launch();
    try {
        const casos = [
            ["el Centroamericano", null, true, "img/centroamericano-2026/mascota-tablero.png"],
            ["Tacho Chess (Pareo)", "Tacho Chess 2 (1er Ciclo) (Rápido)", false, "img/tacho-chess-2/mascota.png"],
            ["otro torneo de Pareo", "Abierto de Pérez Zeledón", false, "img/centroamericano-2026/mascota-tablero.png"],
        ];
        for (const [nombre, pareo, pildora, mascota] of casos) {
            console.log("\n" + nombre + ":");
            const { ctx, p, errores } = await abrir(browser, doble(pareo), 1280);
            const v = await portada(p);
            igual("la píldora «XXI Campeonato» " + (pildora ? "se ve" : "no se ve"), v.pildora, pildora);
            igual("la mascota es " + mascota + ", se ve y es el botón de «Todas las mesas»", [v.mascota, v.seVe, v.enBoton], [mascota, true, true]);
            if (pareo && /tacho/i.test(pareo)) igual("Tacho, de pie, no estira la franja (170 px de alto o menos)", v.alto > 0 && v.alto <= 170, true);
            igual("sin errores de la página", errores, []);
            await p.screenshot({ path: path.join(os.tmpdir(), "arbitro-marca-" + (pareo ? (/tacho/i.test(pareo) ? "tacho" : "pareo") : "centroamericano") + ".png"), clip: { x: 0, y: 0, width: 1280, height: 460 } });
            await ctx.close();
        }
        // En el celular, Tacho también cabe en la franja.
        const { ctx, p } = await abrir(browser, doble("Tacho Chess 2 (2do Ciclo) (Rápido)"), 390);
        const v = await portada(p);
        igual("a 390 px, sin píldora y con Tacho de 110 px de alto o menos, sin desplazar a lo ancho",
            [v.pildora, v.mascota, v.alto <= 110, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)], [false, "img/tacho-chess-2/mascota.png", true, true]);
        await p.screenshot({ path: path.join(os.tmpdir(), "arbitro-marca-tacho-celular.png"), clip: { x: 0, y: 0, width: 390, height: 420 } });
        await ctx.close();
    } finally { await browser.close(); }
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
