/* Capturas REALES de la herramienta de mesas del Centroamericano para los estados
 * de WhatsApp que arma herramientas/imagenes-redes.js: que quien los vea sepa cómo
 * se ve de verdad la herramienta, no un dibujo.
 *
 *  - centroamericano-arbitro.html, la página del árbitro, en una tableta vertical
 *    (820 px, a 2x: lo que lleva el árbitro a la sala);
 *  - centroamericano-mesas.html, la de la organización, en una computadora chica (1080 px).
 *
 * Son las páginas tal cual, con los mismos dobles de Supabase que usa
 * verificar-centroamericano-mesas-pagina.js (herramientas/lib/doble-centroamericano-*.js)
 * y el reloj puesto en una mañana de ronda. El torneo es DE EJEMPLO y lo dice cada
 * imagen: los nombres de las jugadoras son inventados a propósito, para no poner a
 * jugadores reales (muchos, menores) en una publicidad.
 *
 *   node herramientas/capturas-centroamericano.js     (necesita playwright)
 *
 * Deja los PNG en img/redes/capturas/centroamericano/ (fuera del despliegue, como
 * todo img/redes). Después: node herramientas/imagenes-redes.js
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("./lib/playwright-con-sesion");
const { servirSitio } = require("./lib/servidor-estatico");
const { TOKEN, MESAS, dobleArbitro } = require("./lib/doble-centroamericano-arbitro");
const { dobleOrganizacion } = require("./lib/doble-centroamericano-organizacion");

const SALIDA = path.join(__dirname, "..", "img", "redes", "capturas", "centroamericano");

// Seis mesas del Sub-10 Femenino de ejemplo: nombres inventados, cada una con su federación
// (la banderita al final del nombre).
const EJEMPLO = [
    ["Rojas Vindas Valeria", "CRC", "Quesada Mora Sofía", "PAN"], ["Solano Araya Lucía", "GUA", "Vargas Chaves Emilia", "CRC"],
    ["Jiménez Ulate Camila", "ESA", "Calderón Brenes Isabella", "HON"], ["Herrera Castro Mariana", "CRC", "Méndez Salas Antonella", "NCA"],
    ["Navarro Soto Renata", "PAN", "Alfaro Picado Daniela", "GUA"], ["Campos Rivera Paula", "HON", "Fallas León Valentina", "CRC"],
].map(([b, fb, n, fn], i) => ({ mesa: i + 1, blancas: b, negras: n, fed_b: fb, fed_n: fn, valor: "0" }));

// El doble del árbitro, con estas mesas en lugar de las de la prueba.
function dobleConEjemplo() {
    const viejo = "const MESAS = " + JSON.stringify(MESAS) + ";";
    let doble = dobleArbitro();
    if (!doble.includes(viejo) || !doble.includes("desde: 1, hasta: 3")) throw new Error("El doble del árbitro cambió: hay que ajustar dobleConEjemplo()");
    return doble.replace(viejo, "const MESAS = " + JSON.stringify(EJEMPLO) + ";").replaceAll("desde: 1, hasta: 3", "desde: 1, hasta: " + EJEMPLO.length);
}

(async () => {
    fs.mkdirSync(SALIDA, { recursive: true });
    const sitio = await servirSitio();
    const browser = await chromium.launch();
    const errores = [];

    async function abrir(pagina, doble, { hash = "", ancho, alto }) {
        const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: ancho, height: alto }, deviceScaleFactor: 2,
            colorScheme: "light", timezoneId: "America/Costa_Rica" });
        await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble }));
        await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
        await ctx.route(/supabase\.co|sentry|googletagmanager|lichess\.org/, (r) => r.abort());
        // La mañana de la ronda 3 (empieza a las 9:00): las 9:35 a. m. de Costa Rica, con la ronda andando.
        await ctx.addInitScript((base) => { const R = Date; const off = base - R.now(); class F extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } } window.Date = F; }, Date.parse("2026-11-03T15:35:00Z"));
        const p = await ctx.newPage();
        p.on("pageerror", (e) => errores.push(pagina + ": " + e.message));
        await p.goto(sitio.base + "/" + pagina + (hash ? "#" + hash : ""), { waitUntil: "load" });
        return p;
    }
    // Sin los avisos que salen y se van: no son parte de la pantalla.
    const limpiar = (p) => p.addStyleTag({ content: ".avisos-mensaje, .avisos-toast, #burbuja-en-linea, .cam-fab { display: none !important; } header { position: static !important; }" });
    const guardar = async (p, nombre, clip) => {
        await p.screenshot({ path: path.join(SALIDA, nombre), clip, fullPage: true });
        console.log("img/redes/capturas/centroamericano/" + nombre);
    };
    // El rectángulo de un elemento, o de varios juntos, en la página entera.
    const caja = (p, selectores, margen = 0) => p.evaluate(([sels, m]) => {
        const rs = sels.map((s) => document.querySelector(s).getBoundingClientRect());
        const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top));
        const x2 = Math.max(...rs.map((r) => r.right)), y2 = Math.max(...rs.map((r) => r.bottom));
        return { x: x + scrollX - m, y: y + scrollY - m, width: x2 - x + 2 * m, height: y2 - y + 2 * m };
    }, [selectores, margen]);

    // ---------------------------------------------------------------- el árbitro, en la tableta
    const p = await abrir("centroamericano-arbitro.html", dobleConEjemplo(), { hash: TOKEN, ancho: 820, alto: 1180 });
    await p.waitForSelector(".cam-mesa");
    await p.evaluate(() => document.fonts.ready);
    await limpiar(p);
    await p.waitForTimeout(600);
    await guardar(p, "arbitro-lista-previa.png", await caja(p, ["#lista-previa"], 12));

    await p.click("#aprobar-paso");
    await p.waitForFunction(() => document.querySelector("#lista-previa h2") && document.querySelector("#lista-previa h2").textContent.includes("paso 2 de 2"));
    await p.click("#aprobar-paso");
    await p.waitForFunction(() => document.getElementById("lista-previa").hidden);
    // Empezó la ronda, llegaron todas (con el botón de la página, como lo hace el árbitro) y ya terminaron dos partidas.
    await p.click("#ir-ahora");
    await p.waitForFunction(() => document.getElementById("inicio-ronda").dataset.marcada === "si");
    await p.click("#presencia-todos");
    await p.waitForSelector("dialog[open] [data-avisos-aceptar]");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction(() => /Han llegado (\d+) de \1 /.test(document.getElementById("presencia-resumen").textContent + " "));
    for (const [mesa, valor] of [[1, "1"], [2, "2"]]) {
        await p.selectOption("#res-" + mesa, valor);
        await p.click('.cam-mesa[data-mesa="' + mesa + '"] [data-accion="guardar"]');
        await p.waitForSelector('.cam-mesa[data-mesa="' + mesa + '"] .cam-guardado');
    }
    await p.waitForTimeout(500);
    await guardar(p, "arbitro-pantalla.png", { x: 0, y: 0, width: 820, height: 760 });
    await guardar(p, "arbitro-mesas.png", await caja(p, ['.cam-mesa[data-mesa="1"]', '.cam-mesa[data-mesa="2"]'], 12));

    // ---------------------------------------------------------------- la organización, en la computadora
    // El pedido de ayuda de la prueba («Prueba: ven a la mesa»), con un motivo de verdad.
    const dobleOrg = dobleOrganizacion(true).replace("Prueba: ven a la mesa", "Reclamo de tablas por triple repetición");
    const q = await abrir("centroamericano-mesas.html", dobleOrg, { ancho: 1080, alto: 1000 });
    await q.waitForSelector("#pest-ronda");
    await q.evaluate(() => document.fonts.ready);
    await limpiar(q);
    await q.waitForTimeout(2500);
    // Un tramo de un panel: de lo de arriba de `desde` a lo de abajo de `hasta` (o al final del panel), a lo ancho del panel.
    const tramo = (panel, desde, hasta, abajo = 12) => q.evaluate(([pn, a, z, ab]) => {
        const P = document.querySelector(pn).getBoundingClientRect(), A = document.querySelector(a).getBoundingClientRect();
        const Z = z ? document.querySelector(z).getBoundingClientRect() : P;
        return { x: P.left + scrollX, y: A.top + scrollY - 12, width: P.width, height: Z.bottom - A.top + 12 + ab };
    }, [panel, desde, hasta, abajo]);
    // La ronda en curso hasta «Cuánto le queda a cada árbitro», con su tabla; y aparte los pedidos de ayuda.
    await guardar(q, "organizacion-ronda.png", await tramo("#panel-ronda", "#inicio-ronda",
        await q.evaluate(() => { const t = document.getElementById("t-resumen"); let n = t.nextElementSibling; while (n && !n.querySelector("table") && n.tagName !== "TABLE") n = n.nextElementSibling; if (!n) return null; n.id = n.id || "captura-resumen"; return "#" + n.id; })));
    await guardar(q, "organizacion-pedidos.png", await tramo("#panel-ronda", "#t-pedidos", null));
    await q.click("#pest-arbitros");
    await q.waitForTimeout(1200);
    // La tabla de los enlaces hasta el final de la fila de la primera árbitra (sin dejar una fila partida).
    await guardar(q, "organizacion-arbitros.png", await tramo("#panel-arbitros", "#panel-arbitros table",
        await q.evaluate(() => { const tr = [...document.querySelectorAll("#panel-arbitros table tr")].find((f) => f.textContent.includes("Ana Árbitra")); tr.id = "captura-fila"; return "#captura-fila"; }), 2));

    await browser.close();
    sitio.cerrar();
    if (errores.length) { console.error("Errores en la página:\n" + errores.join("\n")); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
