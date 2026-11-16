/* Las capturas de la revista N.º 19 (Pareo Integral y la mesa del árbitro).
   Juega un torneo de prueba de punta a punta en pareo.html —con jugadores
   inventados, en este navegador, sin publicar nada— y abre la mesa del árbitro
   con un doble de Supabase, como los verificadores (verificar-pareo-pagina.js,
   verificar-mesa-arbitro-pareo.js). Deja las imágenes en no19/capturas/.

       node herramientas/revistas-arbitraje/no19/capturas.js

   Después: node herramientas/revistas-arbitraje/generar.js 19 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("../../lib/playwright-con-sesion");
const RAIZ = path.join(__dirname, "..", "..", "..");
/* El sitio se sirve desde el disco, pero con su dirección de verdad: así los
   enlaces que muestran las pantallas dicen ajedrez-integral.com y no 127.0.0.1. */
const BASE = "https://ajedrez-integral.com";
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png",
    ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json", ".mp3": "audio/mpeg" };
async function servirDesdeDisco(ctx) {
    await ctx.route(BASE + "/**", (r) => {
        let ruta = decodeURIComponent(new URL(r.request().url()).pathname);
        if (ruta.endsWith("/")) ruta += "index.html";
        const archivo = path.join(RAIZ, path.normalize(ruta));
        if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) return r.fulfill({ status: 404, body: "" });
        r.fulfill({ status: 200, contentType: TIPOS[path.extname(archivo)] || "application/octet-stream", body: fs.readFileSync(archivo) });
    });
}
const P = require("../../lib/pareo-pruebas");

const SALIDA = path.join(__dirname, "capturas");
fs.mkdirSync(SALIDA, { recursive: true });

/* Jugadores inventados (nombre;Elo;título;federación). */
const JUGADORES = ["Rojas Mora, Ana;2105;WFM;CRC", "Vargas Solís, Bruno;2040;;CRC", "Díaz Ulate, Daniel;1985;;CRC", "Esquivel Brenes, Elena;1940;;CRC",
    "Mora Castro, Fabián;1890;;CRC", "Solano Arias, Gabriela;1835;;CRC", "Brenes Quirós, Héctor;1780;;CRC", "Chaves Mena, Irene;1720;;CRC",
    "Jiménez Pérez, Jorge;1660;;CRC", "Ugalde Rojas, Karla;1600;;CRC"];
/* Los resultados de cada ronda, mesa por mesa (se repiten si faltan). */
const RESULTADOS = { 1: ["1-0", "=", "0-1", "1-0", "1-0"], 2: ["=", "1-0", "1-0", "0-1", "="], 3: ["1-0", "0-1", "=", "1-0", "0-1"] };

const ABIERTO = () => { window.CandadoHerramienta = { herramienta: "", liberar() { }, listo: Promise.resolve(true), estado: "abierta" }; };

async function captura(p, nombre, sel, opc = {}) {
    const el = await p.$(sel);
    if (!el) throw new Error("No está " + sel + " para " + nombre);
    /* Fuera lo que flota encima (el encabezado fijo del sitio, los avisos):
       en una captura de página entera se pinta en medio de la imagen. */
    await p.evaluate(() => {
        for (const n of document.querySelectorAll("body *")) {
            const pos = getComputedStyle(n).position;
            if (pos === "fixed") n.style.setProperty("display", "none", "important");
            else if (pos === "sticky") n.style.setProperty("position", "static", "important");
        }
    });
    await el.scrollIntoViewIfNeeded();
    /* boundingBox es de la ventana; la captura de página entera va en coordenadas de la página. */
    const b = await el.boundingBox();
    const desplazado = await p.evaluate(() => [window.scrollX, window.scrollY]);
    const caja = { x: b.x + desplazado[0], y: b.y + desplazado[1], width: b.width, height: b.height };
    const alto = Math.min(caja.height, opc.alto || 820);
    await p.screenshot({ path: path.join(SALIDA, nombre + ".jpg"), type: "jpeg", quality: 86, fullPage: true,
        clip: { x: Math.max(caja.x - 8, 0), y: caja.y - 8 + (opc.desde || 0), width: Math.min(caja.width + 16, 1280), height: alto + 16 } });
    console.log("  " + nombre + ".jpg");
}

async function pareo(browser, base) {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5 });
    await ctx.addInitScript(ABIERTO);
    await ctx.addInitScript(P.autoConfirmarCambios);
    await ctx.addInitScript(P.dobleSupabase);
    await ctx.route(/fonts\.googleapis|fonts\.gstatic|sentry|googletagmanager|supabase\.co/, (r) => r.abort());
    /* Publicar es automático al emparejar la ronda 1: acá no sale nada del navegador. */
    await ctx.route("**/functions/v1/pareo-publicar", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ ok: true, id: "00000000-0000-4000-8000-000000000019", clave: "clave-19" }) }));
    await servirDesdeDisco(ctx);
    const p = await ctx.newPage();
    await p.addInitScript(() => { window.print = () => { }; });
    await p.goto(base + "/pareo.html");
    const ficha = async (f) => { await p.click("#pi-f-" + f); await p.waitForTimeout(250); };

    /* 1. Los datos del torneo. */
    await ficha("torneo");
    const campo = async (nombre, valor) => {
        const sel = '#pi-form-torneo [name="' + nombre + '"]';
        if (!(await p.$(sel))) return;
        await p.fill(sel, valor);
        await p.dispatchEvent(sel, "change");
    };
    await campo("nombre", "Abierto Ajedrez Integral 2026");
    await campo("ciudad", "San José");
    await campo("rondasTotales", "5");
    await campo("ritmo", "60 min + 30 s");
    await campo("arbitro", "Árbitro principal");
    await p.selectOption('#pi-form-torneo select[name="validoElo"]', "fide").catch(() => { });
    await captura(p, "01-torneo-datos", "#pi-form-torneo", { alto: 760 });
    await captura(p, "02-torneo-sistema", "#pi-form-torneo fieldset:has(input[type=radio])", { alto: 520 }).catch(() => console.log("  (sin el recuadro del sistema)"));

    /* 2. Los jugadores. */
    await ficha("jugadores");
    await p.click("#pi-p-jugadores summary");
    await p.fill("#pi-pegar", JUGADORES.join("\n"));
    await captura(p, "03-jugadores-pegar", "#pi-p-jugadores details[open]", { alto: 420 });
    await p.click("#pi-pegar-agregar");
    await p.waitForFunction(() => document.querySelectorAll("#pi-tabla-jugadores tbody tr").length >= 10);
    await p.click("#pi-p-jugadores details[open] summary").catch(() => { });
    await captura(p, "04-jugadores-inscritos", "#pi-tabla-jugadores", { alto: 600 });

    /* 3. Las rondas: antes de emparejar, emparejada y con resultados. */
    await ficha("rondas");
    await captura(p, "05-ronda-antes", "#pi-ronda", { alto: 640 });
    const emparejar = async (r) => {
        await p.click("#pi-emparejar");
        await p.waitForFunction((r) => { const h = document.querySelector("#pi-ronda h2"); return h && h.textContent.startsWith("Emparejamientos de la ronda " + r); }, r, { timeout: 30000 });
    };
    const anotar = async (lista) => {
        const n = await p.$$eval("#pi-ronda table select", (l) => l.length);
        for (let i = 0; i < n; i++) {
            const s = (await p.$$("#pi-ronda table select"))[i];
            await s.selectOption(lista[i % lista.length]);
            await p.waitForTimeout(80);
        }
    };
    await emparejar(1);
    await captura(p, "06-ronda-emparejada", "#pi-ronda", { alto: 300 });
    await captura(p, "06b-ronda-mesas", "#pi-ronda table", { alto: 500 });
    await anotar(RESULTADOS[1]);
    await captura(p, "07-ronda-resultados", "#pi-ronda table", { alto: 500 });
    for (const r of [2, 3]) {
        const botones = await p.$$("#pi-rondas-nav button");
        await botones[botones.length - 1].click();
        await emparejar(r);
        await anotar(RESULTADOS[r]);
    }
    /* La ronda 4, emparejada y en juego, con dos resultados. */
    {
        const botones = await p.$$("#pi-rondas-nav button");
        await botones[botones.length - 1].click();
        await emparejar(4);
        const sels = await p.$$("#pi-ronda table select");
        await sels[0].selectOption("1-0");
        await p.waitForTimeout(150);
        await (await p.$$("#pi-ronda table select"))[2].selectOption("=");
    }
    await captura(p, "08-ronda-herramientas", "#pi-p-rondas", { alto: 820 });

    /* 4. El centro del evento, la clasificación, la tabla cruzada y los archivos. */
    await ficha("centro");
    await captura(p, "09-centro", "#pi-p-centro", { alto: 760 });
    await ficha("clasificacion");
    await captura(p, "10-clasificacion", "#pi-p-clasificacion", { alto: 760 });
    await ficha("cruzada");
    await captura(p, "11-cruzada", "#pi-p-cruzada", { alto: 560 });
    await ficha("archivos");
    await captura(p, "12-archivos", "#pi-p-archivos", { alto: 820 });
    await ctx.close();
}

/* La mesa del árbitro: el mismo doble de Supabase del verificador, con un
   torneo y unos nombres de prueba. */
function dobleMesa() {
    const v = fs.readFileSync(path.join(__dirname, "..", "..", "verificar-mesa-arbitro-pareo.js"), "utf8");
    const m = v.match(/const doble = `([\s\S]*?)`;\r?\n/);
    if (!m) throw new Error("No encontré el doble de la mesa en verificar-mesa-arbitro-pareo.js");
    return m[1].split("${CODIGO}").join("abcd2345").replace(/Eliminatoria JDN PZ · U12/g, "Abierto Ajedrez Integral 2026").replace(/Jean Carlo Quesada/g, "Árbitro principal")
        .replace(/Adjunta de prueba/g, "Árbitro adjunto");
}

async function mesa(browser, base) {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5 });
    await servirDesdeDisco(ctx);
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: dobleMesa() }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager|fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await ctx.route("**/functions/v1/pareo-publicar", (r) => r.abort());
    const p = await ctx.newPage();
    await p.goto(base + "/mesa-arbitro.html", { waitUntil: "load" });
    await p.waitForFunction(() => document.getElementById("app") && document.getElementById("app").checkVisibility(), null, { timeout: 15000 }).catch(() => { });
    await p.waitForTimeout(600);
    await captura(p, "13-mesa-entrada", "#app", { alto: 640 });
    /* Otra pestaña: cambiar solo el #… no vuelve a cargar la página. */
    await p.close();
    const q = await ctx.newPage();
    q.on("pageerror", (e) => console.log("   [error]", e.message));
    await q.goto(base + "/mesa-arbitro.html#solo", { waitUntil: "load" });
    await q.waitForFunction(() => document.getElementById("app").checkVisibility());
    await q.fill("#p-enlace", "https://ajedrez-integral.com/pareo.html#adjunto=abcd2345&m=1-3");
    await q.click("#p-conectar");
    await q.waitForFunction(() => document.querySelectorAll("#p-mesas tr").length > 0, null, { timeout: 8000 }).catch(async () => { console.log(await q.evaluate(() => JSON.stringify([window.__canales, window.__mandados, (document.getElementById("zona-pareo") || document.body).innerText.slice(0, 600)]))); throw new Error("sin mesas"); });
    await q.click('#p-mesas tr[data-mesa="1"] button[data-r="1-0"]');
    await q.waitForTimeout(700);
    await captura(q, "14-mesa-mesas", "#zona-pareo", { alto: 760 });
    await ctx.close();
}

(async () => {
    const browser = await chromium.launch();
    try {
        /* SOLO=pareo o SOLO=mesa saca solo esa parte. */
        if (process.env.SOLO !== "mesa") await pareo(browser, BASE);
        if (process.env.SOLO !== "pareo") await mesa(browser, BASE);
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
