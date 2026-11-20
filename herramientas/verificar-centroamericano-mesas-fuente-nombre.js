/* La Mesa del árbitro de la organización (centroamericano-mesas.html) dice de dónde lee las mesas:
   - con todos los torneos en Pareo Integral (el principal eligió Pareo): el botón dice «Actualizar
     desde Pareo Integral», la nota de abajo igual, las pestañas «Fair Play» y «Transmisión» se ven, la barra de la ventana trae el nombre del evento
     y en ningún lado de la «Ronda en curso» se nombra chess-results;
   - al tocarlo, mientras lee, dice «Leyendo Pareo Integral…»;
   - con los torneos del Centroamericano (chess-results): todo sigue diciendo chess-results y la
     barra «Mesa del árbitro — Centroamericano 2026».
   Deja una captura en la carpeta temporal del sistema.

   Ver «La organización nombra la fuente que eligió» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js centroamericano-mesas-fuente-nombre      */
"use strict";
const os = require("os");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { dobleOrganizacion } = require("./lib/doble-centroamericano-organizacion");

const BASE = process.env.BASE_URL || "http://localhost:8777";
const EVENTO = "Torneo Intereducativo Tacho Chess";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const ok = JSON.stringify(hallado) === JSON.stringify(esperado);
    if (!ok) fallos++;
    console.log((ok ? "  ✓ " : "  ✗ ") + nombre + (ok ? "" : "\n      esperado: " + JSON.stringify(esperado) + "\n      hallado:  " + JSON.stringify(hallado)));
}

const EVENTOS_ORIGINAL = 'const EVENTOS = [{ evento: "Centroamericano 2026", marca: "centroamericano" }];';
// El doble de siempre; con `pareo`, todos sus torneos pasan a Pareo Integral, de un evento con la cara neutra.
const doble = (pareo) => {
    const d = dobleOrganizacion(true);
    if (!d.includes(EVENTOS_ORIGINAL)) throw new Error("El doble de la organización cambió: no se encontraron los eventos.");
    return pareo ? d.replace(EVENTOS_ORIGINAL, "const EVENTOS = [{ evento: " + JSON.stringify(EVENTO) + ", marca: \"ajedrez-integral\" }];\n"
        + "  TORNEOS.forEach((t) => { t.fuente = \"pareo\"; t.pareo_id = \"00000000-0000-0000-0000-0000000000\" + t.orden; t.evento = " + JSON.stringify(EVENTO) + "; });") : d;
};

async function abrir(browser, d) {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: d }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager|cloudflareinsights/, (r) => r.abort());
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(BASE + "/centroamericano-mesas.html", { waitUntil: "load" });
    await p.waitForFunction(() => !document.getElementById("app").hidden && document.getElementById("titulo-ventana").textContent !== "");
    return { ctx, p, errores };
}

// «Fair Play» y «Transmisión» salen en las dos caras: se mide si se ven, no el atributo (ver «Fair Play y Transmisión en
// cualquier evento»).
const pestanas = (p) => p.evaluate(() => ["pest-fairplay", "pest-transmision"].map((id) => document.getElementById(id).checkVisibility()));

const leer = (p) => p.evaluate(() => ({
    boton: document.getElementById("resumen-actualizar").textContent.trim(),
    barra: document.getElementById("titulo-ventana").textContent,
    nota: [...document.querySelectorAll("#panel-ronda .cam-herramientas-nota")].map((n) => n.textContent).find((t) => t.includes("Actualizar desde")) || "",
}));

(async () => {
    const browser = await chromium.launch();
    try {
        console.log("Torneos de Pareo Integral:");
        let { ctx, p, errores } = await abrir(browser, doble(true));
        await p.waitForFunction(() => document.getElementById("resumen-actualizar").textContent.includes("Pareo"), null, { timeout: 8000 }).catch(() => {});
        let v = await leer(p);
        igual("el botón dice «Actualizar desde Pareo Integral»", v.boton, "🔄 Actualizar desde Pareo Integral");
        igual("la barra de la ventana trae el evento, no el Centroamericano", v.barra, "Mesa del árbitro — " + EVENTO);
        igual("la nota de abajo nombra Pareo Integral", v.nota.includes("«Actualizar desde Pareo Integral»"), true);
        igual("con la cara neutra se ven «Fair Play» y «Transmisión»", await pestanas(p), [true, true]);
        igual("la «Ronda en curso» no nombra chess-results en ningún lado que se vea", await p.evaluate(() => document.getElementById("panel-ronda").innerText.includes("chess-results")), false);
        // Mientras lee: el resumen no contesta todavía.
        await p.evaluate(() => { const sb = window.sb, antes = sb.functions.invoke; sb.functions.invoke = (f, o) => (o && o.body && o.body.action === "resumen" ? new Promise(() => {}) : antes(f, o)); });
        await p.click("#resumen-actualizar");
        igual("al tocarlo, dice «Leyendo Pareo Integral…»", await p.textContent("#resumen-total"), "Leyendo Pareo Integral…");
        igual("sin errores de la página", errores, []);
        await p.screenshot({ path: path.join(os.tmpdir(), "mesas-fuente-pareo.png"), clip: { x: 0, y: 0, width: 1280, height: 620 } });
        await ctx.close();

        console.log("\nTorneos del Centroamericano (chess-results):");
        ({ ctx, p, errores } = await abrir(browser, doble(false)));
        v = await leer(p);
        igual("el botón sigue diciendo «Actualizar desde chess-results»", v.boton, "🔄 Actualizar desde chess-results");
        igual("la barra sigue diciendo «Mesa del árbitro — Centroamericano 2026»", v.barra, "Mesa del árbitro — Centroamericano 2026");
        igual("la nota de abajo nombra chess-results", v.nota.includes("«Actualizar desde chess-results»"), true);
        igual("con la cara del Centroamericano también se ven «Fair Play» y «Transmisión»", await pestanas(p), [true, true]);
        igual("sin errores de la página", errores, []);
        await ctx.close();
    } finally { await browser.close(); }
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
