/* Las capturas de la revista N.º 20 (la mesa del árbitro del Centroamericano):
   centroamericano-arbitro.html, la tableta del árbitro adjunto, y
   centroamericano-mesas.html, la página de la organización, con los mismos
   dobles de Supabase que los verificadores (herramientas/lib/doble-centroamericano-*.js)
   y el reloj puesto en la mañana de la ronda 3, como capturas-centroamericano.js.

   Los nombres de las partidas de los dobles se cambian por otros inventados: en
   una revista no van jugadores de verdad (muchos, menores).

       node herramientas/revistas-arbitraje/no20/capturas.js

   Deja las imágenes en no20/capturas/. Después: node herramientas/revistas-arbitraje/generar.js 20 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("../../lib/playwright-con-sesion");
const { TOKEN, dobleArbitro } = require("../../lib/doble-centroamericano-arbitro");
const { dobleOrganizacion } = require("../../lib/doble-centroamericano-organizacion");

const RAIZ = path.join(__dirname, "..", "..", "..");
const SALIDA = path.join(__dirname, "capturas");
fs.mkdirSync(SALIDA, { recursive: true });

/* El sitio, desde el disco, con su dirección de verdad (los enlaces y los QR dicen ajedrez-integral.com). */
const BASE = "https://ajedrez-integral.com";
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png",
    ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json", ".mp3": "audio/mpeg" };

/* Los nombres de los dobles que parecen de personas de verdad → inventados. */
const NOMBRES = [
    ["Muñoz Feliz Alejandro", "Rojas Vindas Valeria"], ["Gramajo Tovar Marco", "Quesada Mora Sofía"], ["Harvey Ian", "Solano Araya Lucía"],
    ["Acuña Porras Fabio", "Vargas Chaves Emilia"], ["Hopkins John", "Jiménez Ulate Camila"], ["Baquero Graterol", "Calderón Brenes Isabella"],
    ["Jiménez Mora, Ana Sofía", "Alfaro Picado, Daniela"], ["Pérez Mora, Ana", "Campos Rivera, Paula"], ["Rojas Vega, Lía", "Fallas León, Valentina"],
    ["Solís Arce, Eva", "Herrera Castro, Mariana"], ["Mora Cruz, Isa", "Méndez Salas, Antonella"], ["Vargas Ríos, Zoe", "Navarro Soto, Renata"],
    ["Núñez Soto, Mía", "Brenes Ulloa, Abril"], ["Castro Vega, Luis", "Arce Montero, Tomás"], ["Jiménez Mora, Sofía", "Picado Leiva, Julieta"],
    ["Solano Brenes, Diego", "Ulate Rojas, Matías"], ["Mora Ugalde, Camila", "Leiva Campos, Regina"], ["Árias Núñez, María José", "Montero Fallas, Ximena"],
    ["Zúñiga Rojas, Pedro", "Salas Navarro, Joaquín"],
    /* Los del doble de Fair Play. */
    ["Garcia Tabasco, Alberto", "Ugalde Picado, Andrés"], ["Reynoso Almonte, Owen", "Montero Arce, Gabriel"], ["Ordonez Ch., Dylan", "Leiva Rojas, Sebastián"],
    ["Farley, Jeremiah", "Campos, Emiliano"], ["Barrantes, Matias", "Fallas, Santiago"], ["Valle, Moises", "Navarro, Adrián"], ["Esquivel, Jeremy", "Brenes, Nicolás"],
    ["Clark, Arty", "Salas, Bruno"], ["Garcia, Alberto", "Ulloa, Martín"], ["Castro, Alana", "Picado, Elena"], ["Ruiz, Mia", "Arce, Luciana"],
    ["Oscar Principal", "Árbitro principal"], ["Laura Mora", "Encargada de prueba"], ["Pedro Solís", "Encargado de prueba"], ["Pérez, Luis", "Rojas, Iván"],
];
const inventar = (txt) => NOMBRES.reduce((t, [a, b]) => t.split(a).join(b), txt);

async function contexto(browser, doble, ancho, alto) {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: ancho, height: alto }, deviceScaleFactor: 1.5,
        colorScheme: "light", timezoneId: "America/Costa_Rica" });
    await ctx.route(BASE + "/**", (r) => {
        let ruta = decodeURIComponent(new URL(r.request().url()).pathname);
        if (ruta.endsWith("/")) ruta += "index.html";
        const archivo = path.join(RAIZ, path.normalize(ruta));
        if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) return r.fulfill({ status: 404, body: "" });
        r.fulfill({ status: 200, contentType: TIPOS[path.extname(archivo)] || "application/octet-stream", body: fs.readFileSync(archivo) });
    });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: inventar(doble) }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager|lichess\.org|fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    /* La mañana de la ronda 3 (empieza a las 9:00): las 9:35 a. m. de Costa Rica. */
    await ctx.addInitScript((base) => { const R = Date; const off = base - R.now(); class F extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } } window.Date = F; }, Date.parse("2026-11-03T15:35:00Z"));
    return ctx;
}

/* Fuera lo que flota encima: los avisos que salen y se van, la burbuja, el botón «¿Dónde juega?». */
const limpiar = (p) => p.addStyleTag({ content: ".avisos-mensaje, .avisos-toast, #burbuja-en-linea, .cam-fab { display: none !important; } header { position: static !important; }" });

/* Captura de un elemento (o de varios juntos), en coordenadas de la página entera. */
async function captura(p, nombre, selectores, opc = {}) {
    const sels = [].concat(selectores);
    const caja = await p.evaluate(([sels, m]) => {
        const rs = sels.map((s) => document.querySelector(s)).filter(Boolean).map((n) => n.getBoundingClientRect());
        if (!rs.length) return null;
        const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top));
        const x2 = Math.max(...rs.map((r) => r.right)), y2 = Math.max(...rs.map((r) => r.bottom));
        return { x: Math.max(x + scrollX - m, 0), y: Math.max(y + scrollY - m, 0), width: x2 - x + 2 * m, height: y2 - y + 2 * m };
    }, [sels, opc.margen == null ? 10 : opc.margen]);
    if (!caja) { console.log("  (no está " + sels.join(", ") + " para " + nombre + ")"); return; }
    if (opc.alto) caja.height = Math.min(caja.height, opc.alto);
    await p.screenshot({ path: path.join(SALIDA, nombre + ".jpg"), type: "jpeg", quality: 86, fullPage: true, clip: caja });
    console.log("  " + nombre + ".jpg");
}
const paso = async (nombre, fn) => { try { await fn(); } catch (e) { console.log("  ✗ " + nombre + ": " + String(e.message || e).split("\n")[0]); } };

async function arbitro(browser) {
    /* La entrada con el código, sin enlace. */
    {
        const ctx = await contexto(browser, dobleArbitro(), 820, 1180);
        const p = await ctx.newPage();
        await p.goto(BASE + "/centroamericano-arbitro.html", { waitUntil: "load" });
        await limpiar(p);
        await p.waitForTimeout(800);
        await paso("entrada", () => captura(p, "01-arbitro-entrada", "#entrada", { margen: 14 }));
        await ctx.close();
    }
    const ctx = await contexto(browser, dobleArbitro(), 820, 1180);
    const p = await ctx.newPage();
    await p.goto(BASE + "/centroamericano-arbitro.html#" + TOKEN, { waitUntil: "load" });
    await p.waitForSelector(".cam-mesa");
    await p.evaluate(() => document.fonts.ready);
    await limpiar(p);
    await p.waitForTimeout(700);
    await paso("lista previa", () => captura(p, "02-arbitro-lista-previa", "#lista-previa", { margen: 12 }));
    await p.click("#aprobar-paso");
    await p.waitForFunction(() => document.querySelector("#lista-previa h2") && document.querySelector("#lista-previa h2").textContent.includes("paso 2 de 2"));
    await paso("lista previa 2", () => captura(p, "03-arbitro-lista-previa-2", "#lista-previa", { margen: 12 }));
    await p.click("#aprobar-paso");
    await p.waitForFunction(() => document.getElementById("lista-previa").hidden);
    await paso("inicio", () => captura(p, "04-arbitro-inicio", "#inicio-ronda", { margen: 12 }));
    await p.click("#ir-ahora");
    await p.waitForFunction(() => document.getElementById("inicio-ronda").dataset.marcada === "si");
    await p.click("#presencia-todos");
    await p.waitForSelector("dialog[open] [data-avisos-aceptar]");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForTimeout(400);
    for (const [mesa, valor] of [[1, "1"]]) {
        await p.selectOption("#res-" + mesa, valor);
        await p.click('.cam-mesa[data-mesa="' + mesa + '"] [data-accion="guardar"]');
        await p.waitForSelector('.cam-mesa[data-mesa="' + mesa + '"] .cam-guardado');
    }
    await p.waitForTimeout(500);
    await paso("pantalla", () => p.screenshot({ path: path.join(SALIDA, "05-arbitro-pantalla.jpg"), type: "jpeg", quality: 86, clip: { x: 0, y: 0, width: 820, height: 1000 } }).then(() => console.log("  05-arbitro-pantalla.jpg")));
    await paso("mesas", () => captura(p, "06-arbitro-mesas", ['.cam-mesa[data-mesa="1"]', '.cam-mesa[data-mesa="2"]'], { margen: 12 }));
    /* Una jugada ilegal en la mesa 2. */
    await paso("ilegal", async () => {
        await p.click('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="blancas"] [data-accion="ilegal"]');
        await p.waitForSelector("dialog[open]");
        await p.waitForTimeout(300);
        await captura(p, "07-arbitro-ilegal", "dialog[open]", { margen: 8 });
        const op = await p.$$eval("dialog[open] select option", (l) => l.map((o) => o.value));
        const enroque = op.find((v) => /enroque/i.test(v)) || op[1];
        if (enroque) await p.selectOption("dialog[open] select", enroque).catch(() => { });
        await p.fill("dialog[open] textarea", "Enroque con el rey en jaque.").catch(() => { });
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForTimeout(700);
        /* El aviso de «dale 2 minutos más a su rival», cerrado. */
        for (let i = 0; i < 3; i++) { const d = await p.$("dialog[open] [data-avisos-aceptar]"); if (!d) break; await d.click(); await p.waitForTimeout(400); }
        await captura(p, "08-arbitro-mesa-ilegal", '.cam-mesa[data-mesa="2"]', { margen: 12 });
    });
    /* Un aviso del principal y un control de tiempos. */
    await paso("aviso", async () => {
        await p.evaluate(() => { window.__avisos.mensajes = [{ id: "m1", creado: new Date().toISOString(), texto: "Pausa de 10 minutos: no se mueven las piezas." }]; });
        await p.click("#actualizar").catch(() => { });
        await p.waitForFunction(() => document.querySelector("#mensajes") && document.querySelector("#mensajes").textContent.includes("Pausa"), null, { timeout: 12000 });
        await captura(p, "09-arbitro-aviso", "#mensajes", { margen: 12 });
    });
    await paso("control de tiempos", async () => {
        await p.evaluate(() => { window.__avisos.mensajes = [{ id: "m2", creado: new Date().toISOString(), texto: "Control de tiempos: anota la jugada y los relojes de tus mesas.", control_tiempos: true }]; });
        await p.click("#actualizar").catch(() => { });
        await p.waitForFunction(() => { const n = document.getElementById("control-tiempos"); return n && n.checkVisibility(); }, null, { timeout: 12000 });
        await p.waitForTimeout(400);
        await captura(p, "10-arbitro-control-tiempos", "#control-tiempos", { margen: 10 });
    });
    await paso("anotado", async () => {
        await p.evaluate(() => { const d = document.querySelector("#anotado details, #anotado"); if (d && d.tagName === "DETAILS") d.open = true; });
        await p.waitForTimeout(300);
        await captura(p, "11-arbitro-anotado", "#anotado", { margen: 12, alto: 700 });
    });
    await ctx.close();
}

async function organizacion(browser) {
    const doble = dobleOrganizacion(true).replace("Prueba: ven a la mesa", "Reclamo de tablas por triple repetición");
    const ctx = await contexto(browser, doble, 1180, 1000);
    const p = await ctx.newPage();
    await p.goto(BASE + "/centroamericano-mesas.html", { waitUntil: "load" });
    await p.waitForSelector("#pest-ronda");
    await p.evaluate(() => document.fonts.ready);
    await limpiar(p);
    await p.evaluate(() => { if (window.__marcarInicio) window.__marcarInicio("1529733", 3, 35, "Ana Árbitra"); });
    await p.waitForTimeout(2500);
    const pestana = async (id) => { await p.click("#pest-" + id); await p.waitForTimeout(1300); await p.evaluate(() => window.scrollTo(0, 0)); };
    await paso("estado", () => captura(p, "25-org-estado", "#estado-general", { margen: 6 }));
    /* La barra de abajo es fija: en las demás capturas se pintaría encima. */
    await p.addStyleTag({ content: "#estado-general { position: static !important; }" });
    await paso("pestañas", () => captura(p, "12-org-pestanas", '[role="tablist"]', { margen: 8 }));
    await paso("ronda", () => captura(p, "13-org-ronda", "#panel-ronda", { alto: 1100 }));
    await paso("avisos", async () => {
        await pestana("avisos");
        await p.fill("#av-texto", "Ya empieza la ronda: a sus mesas.");
        await p.click("#av-enviar");
        const d = await p.$("dialog[open] [data-avisos-aceptar]");
        if (d) await d.click();
        await p.waitForTimeout(800);
        await p.evaluate(() => { if (window.__leerAviso) window.__leerAviso(); });
        await p.waitForTimeout(1500);
        await captura(p, "15-org-avisos", "#panel-avisos", { alto: 1000 });
    });
    await paso("árbitros", async () => {
        await pestana("arbitros");
        await captura(p, "16-org-arbitros", "#panel-arbitros", { alto: 1150 });
    });
    await paso("nuevo árbitro", async () => {
        const b = await p.$("#panel-arbitros button:has-text('Nuevo árbitro')");
        if (b) { await b.click(); await p.waitForTimeout(600); }
        const caja = await p.$("#panel-arbitros form:visible, dialog[open]");
        if (caja) await captura(p, "17-org-nuevo-arbitro", (await caja.evaluate((n) => n.tagName)) === "DIALOG" ? "dialog[open]" : "#panel-arbitros form", { margen: 10 });
        const cerrar = await p.$("dialog[open] [data-avisos-cancelar], dialog[open] button:has-text('Cancelar')");
        if (cerrar) await cerrar.click();
    });
    await paso("qr", async () => {
        const b = await p.$("#asignaciones button:has-text('QR y enlace')");
        if (!b) return;
        await b.click();
        await p.waitForSelector("dialog[open]");
        await p.waitForTimeout(600);
        await captura(p, "18-org-qr", "dialog[open]", { margen: 8 });
        await p.keyboard.press("Escape");
        await p.waitForTimeout(300);
    });
    await paso("tiempos", async () => { await pestana("tiempos"); await captura(p, "19-org-tiempos", "#panel-tiempos", { alto: 1000 }); });
    await paso("planillas", async () => { await pestana("planillas"); await captura(p, "20-org-planillas", "#panel-planillas", { alto: 900 }); });
    await paso("torneos", async () => { await pestana("claves"); await captura(p, "21-org-torneos", "#panel-claves", { alto: 880 }); });
    await paso("respaldo", async () => { await pestana("respaldo"); await captura(p, "22-org-respaldo", "#panel-respaldo", { alto: 900 }); });
    await paso("registro", async () => { await pestana("registro"); await captura(p, "23-org-registro", "#panel-registro", { alto: 1150 }); });
    await paso("plano", async () => {
        await pestana("plano");
        const b = await p.$("#pl-borrador");
        if (b) { await b.click(); await p.waitForTimeout(1500); const d = await p.$("dialog[open] [data-avisos-aceptar]"); if (d) { await d.click(); await p.waitForTimeout(1200); } }
        await captura(p, "24-org-plano", "#panel-plano", { alto: 1150 });
    });
    await ctx.close();
}

/* El doble de Fair Play es el de herramientas/verificar-centroamericano-fair-play.js:
   sus primeras líneas son solo definiciones (hasta DOBLE_PRINCIPAL), así que se
   cargan sin correr sus pruebas. */
function dobleFairPlay() {
    const archivo = path.join(__dirname, "..", "..", "verificar-centroamericano-fair-play.js");
    const lineas = fs.readFileSync(archivo, "utf8").split(/\r?\n/);
    const fin = lineas.findIndex((l) => l.startsWith("async function abrir("));
    if (fin < 0) throw new Error("verificar-centroamericano-fair-play.js cambió: no encuentro abrir()");
    /* Es código del propio repositorio (el verificador), no algo que llegue de afuera. */
    const req = require("module").createRequire(archivo);
    return new Function("require", "__dirname", lineas.slice(0, fin).join("\n") + "\nreturn DOBLE_PRINCIPAL;")(req, path.dirname(archivo));
}

async function fairplay(browser) {
    const ctx = await contexto(browser, dobleFairPlay(), 1180, 1000);
    const p = await ctx.newPage();
    await p.goto(BASE + "/centroamericano-mesas.html#fairplay", { waitUntil: "load" });
    await p.waitForFunction(() => document.querySelectorAll("#fp-enlaces .cam-fp-enlace").length >= 1, null, { timeout: 20000 });
    await limpiar(p);
    await p.addStyleTag({ content: "#estado-general { position: static !important; }" });
    await p.waitForTimeout(2500);
    await captura(p, "26-org-fairplay", "#panel-fairplay", { alto: 1300 });
    await ctx.close();
}

(async () => {
    const browser = await chromium.launch();
    try {
        /* SOLO=arbitro o SOLO=org saca solo esa parte. */
        if (process.env.SOLO !== "org") await arbitro(browser);
        if (process.env.SOLO !== "arbitro" && process.env.SOLO !== "fp") await organizacion(browser);
        if (!process.env.SOLO || process.env.SOLO === "fp") await paso("fair play", () => fairplay(browser));
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
