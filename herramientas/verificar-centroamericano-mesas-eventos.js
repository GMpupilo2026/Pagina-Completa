/* La Mesa del árbitro de la organización (centroamericano-mesas.html) trabaja UN evento a la vez:
   - con dos eventos (el Centroamericano, de chess-results, y una eliminatoria de Pareo Integral), arriba sale
     «Evento» y por omisión el que no es del Centroamericano;
   - con la eliminatoria: los torneos para crear enlaces, la ronda en curso y la lista de LiveChess traen solo sus
     torneos; la clave de chess-results no se ve (hay un botón para mostrarla), y al pegar la tabla de LiveChess
     se mandan solo los torneos del evento;
   - al pasar al Centroamericano: todo cambia a sus torneos, la clave de chess-results se ve y la eliminatoria no
     aparece en ningún lado.
   Deja una captura en la carpeta temporal del sistema.

   Ver «Cada evento de la Mesa, por separado» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js centroamericano-mesas-eventos      */
"use strict";
const os = require("os");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { dobleOrganizacion } = require("./lib/doble-centroamericano-organizacion");

const BASE = process.env.BASE_URL || "http://localhost:8777";
const PZ = "Eliminatoria PZ";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const ok = JSON.stringify(hallado) === JSON.stringify(esperado);
    if (!ok) fallos++;
    console.log((ok ? "  ✓ " : "  ✗ ") + nombre + (ok ? "" : "\n      esperado: " + JSON.stringify(esperado) + "\n      hallado:  " + JSON.stringify(hallado)));
}

const EVENTOS_ORIGINAL = 'const EVENTOS = [{ evento: "Centroamericano 2026", marca: "centroamericano" }];';
const INVOKE = "const b = o.body;";
function doble() {
    let d = dobleOrganizacion(true);
    if (!d.includes(EVENTOS_ORIGINAL) || !d.includes(INVOKE)) throw new Error("El doble de la organización cambió: no se encontraron los eventos o las funciones.");
    // Los torneos de siempre quedan sin evento (son del Centroamericano); se suman dos de Pareo de la eliminatoria.
    d = d.replace(EVENTOS_ORIGINAL, EVENTOS_ORIGINAL.replace("];", ", { evento: " + JSON.stringify(PZ) + ", marca: \"ajedrez-integral\" }];") + "\n"
        + "  TORNEOS.push({ tnr: \"p" + "a".repeat(32) + "\", nombre: \"PZ U12\", categoria: \"Sub-12\", rama: \"Mixto\", orden: 50, fuente: \"pareo\", pareo_id: \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\", evento: " + JSON.stringify(PZ) + " },\n"
        + "    { tnr: \"p" + "b".repeat(32) + "\", nombre: \"PZ U20-U16\", categoria: \"Sub-20\", rama: \"Mixto\", orden: 51, fuente: \"pareo\", pareo_id: \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\", evento: " + JSON.stringify(PZ) + " });");
    // LiveChess: la función devuelve TODOS los torneos (como la de verdad); la página tiene que quedarse con los del evento.
    d = d.replace(INVOKE, INVOKE + " if (b.action === \"livechess\") return Promise.resolve({ data: { ok: true, torneos: TORNEOS.map((t) => ({ tnr: t.tnr, nombre: t.nombre, prueba: !!t.prueba, conectado: false })) }, error: null });"
        + " if (b.action === \"livechess_guardar\") return Promise.resolve({ data: { ok: true, guardados: 0, errores: [] }, error: null });"
        + " if (b.action === \"estado\") return Promise.resolve({ data: { ok: true, conectada: false }, error: null });");
    return d;
}

const leer = (p) => p.evaluate(() => {
    const ve = (id) => !!document.getElementById(id) && document.getElementById(id).checkVisibility();
    return {
        barra: ve("evento-barra"),
        elegido: document.getElementById("evento-elegido").value,
        opciones: [...document.querySelectorAll("#evento-elegido option")].map((o) => o.value),
        torneos: [...document.querySelectorAll("#a-torneo option")].map((o) => o.textContent),
        resumen: document.getElementById("resumen").textContent,
        livechess: [...document.querySelectorAll("#livechess-lista li")].map((li) => li.textContent),
        claveCr: ve("clave-grupo"),
        botonCr: ve("cr-mostrar"),
    };
});

(async () => {
    const browser = await chromium.launch();
    try {
        const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
        await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble() }));
        await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
        await ctx.route(/supabase\.co|sentry|googletagmanager|cloudflareinsights/, (r) => r.abort());
        const p = await ctx.newPage();
        const errores = [];
        p.on("pageerror", (e) => errores.push(e.message));
        await p.goto(BASE + "/centroamericano-mesas.html", { waitUntil: "load" });
        await p.waitForFunction(() => !document.getElementById("app").hidden && document.querySelectorAll("#evento-elegido option").length > 1, null, { timeout: 10000 });
        await p.click("#pest-claves");
        await p.waitForFunction(() => document.querySelectorAll("#livechess-lista li").length > 0, null, { timeout: 8000 }).catch(() => {});

        console.log("La eliminatoria de Pareo Integral (por omisión):");
        let v = await leer(p);
        igual("arriba sale «Evento» con los dos eventos, la eliminatoria primero", [v.barra, v.opciones], [true, [PZ, "Centroamericano 2026"]]);
        igual("por omisión, la eliminatoria", v.elegido, PZ);
        igual("los torneos para crear enlaces son solo los de la eliminatoria", v.torneos, ["PZ U12", "PZ U20-U16"]);
        igual("la ronda en curso no trae a los árbitros del Centroamericano", v.resumen.includes("Ana Árbitra"), false);
        igual("LiveChess lista solo los torneos de la eliminatoria", v.livechess.map((t) => t.replace(/^(—|✓) /, "").split(":")[0]), ["PZ U12", "PZ U20-U16"]);
        igual("la clave de chess-results no se ve, y sí el botón para mostrarla", [v.claveCr, v.botonCr], [false, true]);
        await p.screenshot({ path: path.join(os.tmpdir(), "mesas-eventos-pz.png"), fullPage: false });
        await p.fill("#livechess-texto", "SUB-12 ABS 1-5 https://view.livechesscloud.com/#00000000-0000-0000-0000-000000000000");
        await p.click("#livechess-guardar");
        await p.waitForFunction(() => window.__llamadas.some((x) => x.body && x.body.action === "livechess_guardar"), null, { timeout: 5000 });
        igual("al pegar la tabla de LiveChess se mandan solo los torneos del evento",
            await p.evaluate(() => window.__llamadas.find((x) => x.body && x.body.action === "livechess_guardar").body.tnrs), ["p" + "a".repeat(32), "p" + "b".repeat(32)]);
        await p.click("#cr-mostrar");
        igual("«Este evento también tiene torneos en chess-results» muestra la clave", await p.evaluate(() => document.getElementById("clave-grupo").checkVisibility()), true);

        console.log("\nAl pasar al Centroamericano 2026:");
        await p.selectOption("#evento-elegido", "Centroamericano 2026");
        await p.waitForFunction(() => [...document.querySelectorAll("#a-torneo option")].some((o) => o.textContent.startsWith("Sub-10")), null, { timeout: 8000 }).catch(() => {});
        await p.waitForFunction(() => [...document.querySelectorAll("#livechess-lista li")].some((li) => li.textContent.includes("Sub-8")), null, { timeout: 8000 }).catch(() => {});
        v = await leer(p);
        igual("los torneos para crear enlaces son los del Centroamericano, sin los de la eliminatoria", v.torneos.some((t) => t.startsWith("PZ")) || !v.torneos.some((t) => t.startsWith("Sub-10")), false);
        igual("LiveChess ya no trae la eliminatoria", v.livechess.some((t) => t.includes("PZ")), false);
        igual("LiveChess trae los del Centroamericano (sin el de prueba)", v.livechess.some((t) => t.includes("Sub-8 Absoluto")) && !v.livechess.some((t) => t.includes("PRUEBA")), true);
        igual("la clave de chess-results se ve", v.claveCr, true);
        igual("sin errores de la página", errores, []);
        await ctx.close();
    } finally {
        await browser.close();
    }
    console.log(fallos ? "\n✗ " + fallos + " comprobaciones fallaron." : "\n✓ Cada evento de la Mesa se ve por separado.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
