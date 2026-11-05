/* El modo liviano de las tablets del Centroamericano (js/modo-liviano.js) y el
   cliente de Supabase de respaldo (js/supabase-sin-libreria.js).

   Lo que comprueba:
   - Todo script que cargan las tres páginas de tablet (la del árbitro, la de la
     organización y la de Fair Play) se puede leer como JavaScript de 2019 (Chrome
     66 / Safari 12): sin `?.`, `??` ni campos de clase. La única excepción es la
     librería de Supabase, que tiene su respaldo. Los dos archivos que tienen que
     correr en CUALQUIER tablet se leen como ES5.
   - Una tablet VIEJA (sin replaceChildren, flat, replaceAll ni <dialog>, y con la
     librería de Supabase que no se puede leer): la página del árbitro abre sus
     mesas igual, por el cliente de respaldo y por HTTP de verdad (un 404 de la
     función llega con su mensaje); el modo liviano se enciende solo y lo avisa;
     las hojas de la portada no se ven y nada se anima; un aviso del sitio
     (Avisos.confirmar) se abre, se acepta y se cancela con Escape; «Liviano» lo
     apaga, se recuerda al volver a abrir y se vuelve a encender.
   - Una tablet NUEVA: no se enciende; las tarjetas de las mesas NO se vuelven a
     armar si al actualizar llega lo mismo, y sí cuando cambia algo (un pedido de
     ayuda en una mesa).
   - Poca memoria (deviceMemory = 1) lo enciende, y una tablet que dibuja lento
     (menos de 12 cuadros por segundo) también, y lo recuerda para la próxima.
   - Sin errores en la consola de la página.

   Ver «Las tablets viejas: el modo liviano» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js modo-liviano      */
"use strict";
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");
const { TOKEN, MESAS, SERVIDOR_ARBITRO } = require("./lib/doble-centroamericano-arbitro");

const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

// ------------------------------------------------------------- 1. lo que una tablet vieja puede leer

console.log("\n=== Los scripts de las páginas de tablet, como los lee un navegador viejo ===");
const PAGINAS = ["centroamericano-arbitro.html", "centroamericano-mesas.html", "centroamericano-fair-play.html"];
const CON_RESPALDO = new Set(["js/vendor/supabase.js"]); // su respaldo: js/supabase-sin-libreria.js
const EN_CUALQUIERA = new Set(["js/modo-liviano.js", "js/supabase-sin-libreria.js"]);
for (const pagina of PAGINAS) {
    const html = fs.readFileSync(path.join(RAIZ, pagina), "utf8");
    const srcs = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1].replace(/^\//, "")).filter((s) => !/^https?:/.test(s));
    const malos = [];
    for (const s of srcs) {
        if (CON_RESPALDO.has(s)) continue;
        try { acorn.parse(fs.readFileSync(path.join(RAIZ, s), "utf8"), { ecmaVersion: EN_CUALQUIERA.has(s) ? 5 : 2019, sourceType: "script" }); }
        catch (e) { malos.push(s + " (" + e.message + ")"); }
    }
    igual(pagina + ": " + srcs.length + " scripts, todos se leen en Chrome 66 / Safari 12", malos, []);
    igual(pagina + ": carga js/modo-liviano.js en el <head>, antes de pintar", /<head>[\s\S]*<script src="js\/modo-liviano\.js"><\/script>[\s\S]*<\/head>/.test(html), true);
    if (pagina !== "centroamericano-mesas.html") igual(pagina + ": el respaldo de Supabase va después de js/supabase-client.js", /js\/supabase-client\.js"><\/script>\s*<script src="js\/supabase-sin-libreria\.js">/.test(html), true);
    igual(pagina + ": tiene el botón «Liviano»", /data-modo-liviano-boton/.test(html), true);
}

// ------------------------------------------------------------- 2. las tablets, en el navegador

// Lo que le falta a una tablet vieja: se borra ANTES de que corra nada de la página.
const TABLET_VIEJA = () => {
    delete Element.prototype.replaceChildren; delete Document.prototype.replaceChildren; delete DocumentFragment.prototype.replaceChildren;
    delete Array.prototype.flat; delete String.prototype.replaceAll; delete Array.prototype.at; delete Object.fromEntries;
    delete HTMLDialogElement.prototype.showModal; delete HTMLDialogElement.prototype.show; delete HTMLDialogElement.prototype.close; delete HTMLDialogElement.prototype.open;
};

async function abrir(browser, { vieja = false, memoria = null, lenta = false, guardado = null, auto = true } = {}) {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 820, height: 1100 } });
    // En un navegador de pruebas, js/modo-liviano.js no decide solo salvo que se le pida (así no cambia a mitad de
    // las otras pruebas); esta lo pide.
    if (auto) await ctx.addInitScript(() => { window.__modoLivianoAuto = true; });
    await ctx.addInitScript(`(function(){ window.__llamadas = []; window.__red = null; ${SERVIDOR_ARBITRO} })();`);
    if (vieja) {
        await ctx.addInitScript(TABLET_VIEJA);
        // La librería que un navegador viejo no sabe leer: el archivo entero falla y no deja `window.supabase`.
        await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: 'throw new SyntaxError("Unexpected token \'?\'");' }));
    }
    if (memoria != null) await ctx.addInitScript((m) => Object.defineProperty(Navigator.prototype, "deviceMemory", { configurable: true, get: () => m }), memoria);
    if (lenta) await ctx.addInitScript(() => { window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 150); });
    if (guardado) await ctx.addInitScript((g) => { if (!sessionStorage.getItem("__ya")) { sessionStorage.setItem("__ya", "1"); for (const k in g) localStorage.setItem(k, g[k]); } }, guardado);
    // La Edge Function, por HTTP de verdad: lo contesta el «servidor» de prueba que vive en la página.
    await ctx.route("**/functions/v1/**", async (r) => {
        const req = r.request();
        if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
        const nombre = req.url().split("/functions/v1/")[1];
        let body = {};
        try { body = req.postDataJSON() || {}; } catch (e) { /* sin cuerpo */ }
        const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
        if (nombre !== "centroamericano-mesa") return r.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ok: true, mesas: [] }) });
        const res = await r.request().frame().page().evaluate(async (b) => {
            window.__llamadas.push({ f: "centroamericano-mesa", body: b });
            const x = window.__servidor(b);
            if (x.error) return { status: x.error.context.status, cuerpo: await x.error.context.json() };
            return { status: 200, cuerpo: x.data };
        }, body);
        return r.fulfill({ status: res.status, headers: cors, body: JSON.stringify(res.cuerpo) });
    });
    await ctx.route(/sentry|googletagmanager|lichess\.org|chess-results/, (r) => r.abort());
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(BASE + "/centroamericano-arbitro.html#" + TOKEN, { waitUntil: "load" });
    return { ctx, p, errores };
}

const estadoLiviano = (p) => p.evaluate(() => [document.documentElement.getAttribute("data-liviano"), document.getElementById("modo-liviano").getAttribute("aria-pressed"), document.getElementById("modo-liviano").textContent.trim()]);

(async () => {
    const browser = await chromium.launch();

    console.log("\n=== Una tablet vieja (sin replaceChildren ni <dialog>, y la librería de Supabase que no se lee) ===");
    let r = await abrir(browser, { vieja: true });
    await r.p.waitForSelector("#app:not([hidden])", { timeout: 15000 });
    igual("abre sus mesas igual: las " + MESAS.length + " tarjetas", await r.p.$$eval("#lista .cam-mesa", (xs) => xs.filter((x) => x.checkVisibility()).length), MESAS.length);
    igual("por el cliente de respaldo, sin la librería", await r.p.evaluate(() => [typeof window.supabase, !!(window.sb && window.sb.sinLibreria)]), ["undefined", true]);
    igual("se rellenó lo que le faltaba", await r.p.evaluate(() => window.ModoLiviano.rellenado().filter((x) => ["replaceChildren", "flat", "replaceAll", "dialog"].includes(x)).sort()), ["dialog", "flat", "replaceAll", "replaceChildren"]);
    igual("un «no» de la función llega con su estado y su mensaje (por HTTP)", await r.p.evaluate(async () => { const x = await window.sb.functions.invoke("centroamericano-mesa", { body: { action: "leer", token: "f".repeat(64) } }); return [x.data, x.error.context.status, (await x.error.context.json()).error.slice(0, 22)]; }), [null, 404, "Este enlace no es váli"]);
    igual("el modo liviano se encendió solo (navegador antiguo), y el botón lo dice", await estadoLiviano(r.p), ["si", "true", "🪶 Liviano: sí"]);
    igual("y por qué", await r.p.evaluate(() => window.ModoLiviano.motivos()), ["navegador antiguo"]);
    igual("lo avisa una vez", await r.p.evaluate(() => document.body.innerText.includes("se encendió el modo liviano")), true);
    igual("las hojas de la portada no se ven, la mascota va sin sombra y nada se anima", await r.p.evaluate(() => [
        [...document.querySelectorAll(".cac-hojas")].some((x) => x.checkVisibility()),
        getComputedStyle(document.querySelector(".cam-mascota")).filter,
        [...document.querySelectorAll("body *")].filter((x) => x.checkVisibility() && getComputedStyle(x).animationName !== "none").length]), [false, "none", 0]);
    console.log("  (un aviso del sitio, con el <dialog> rellenado)");
    const confirmar = r.p.evaluate(() => window.Avisos.confirmar("¿Seguro que sí?", { titulo: "Prueba", aceptar: "Sí, seguir" }));
    await r.p.waitForSelector("dialog[open]");
    igual("se abre encima de todo y se ve", await r.p.evaluate(() => { const d = document.querySelector("dialog[open]"); const c = d.getBoundingClientRect(); return [d.checkVisibility(), document.elementFromPoint(c.left + c.width / 2, c.top + 10) && d.contains(document.elementFromPoint(c.left + c.width / 2, c.top + 10))]; }), [true, true]);
    await r.p.click("dialog[open] [data-avisos-aceptar]");
    igual("«Sí, seguir» lo acepta (y no se recarga la página)", [await confirmar, await r.p.evaluate(() => [document.querySelectorAll("dialog").length, document.querySelectorAll("[data-dialogo-fondo]").length, !!window.ModoLiviano])], [true, [0, 0, true]]);
    const cancelado = r.p.evaluate(() => window.Avisos.confirmar("¿Otra vez?", { aceptar: "Sí" }));
    await r.p.waitForSelector("dialog[open]");
    await r.p.keyboard.press("Escape");
    igual("Escape lo cancela", await cancelado, false);
    console.log("  (el botón «Liviano»)");
    await r.p.click("#modo-liviano");
    igual("«Liviano» lo apaga", await estadoLiviano(r.p), [null, "false", "🪶 Liviano: no"]);
    igual("y las hojas vuelven", await r.p.evaluate(() => [...document.querySelectorAll(".cac-hojas")].some((x) => x.checkVisibility())), true);
    await r.p.reload({ waitUntil: "load" });
    await r.p.waitForSelector("#app:not([hidden])", { timeout: 15000 });
    igual("al volver a abrir, sigue apagado (manda lo que eligió el árbitro)", await estadoLiviano(r.p), [null, "false", "🪶 Liviano: no"]);
    await r.p.click("#modo-liviano");
    igual("y se vuelve a encender", await estadoLiviano(r.p), ["si", "true", "🪶 Liviano: sí"]);
    // El único error es el de la librería que no se pudo leer (el que se simula): nada más se cae.
    igual("sin otros errores en la página que el de la librería", r.errores.filter((m) => m !== "Unexpected token '?'"), []);
    await r.ctx.close();

    console.log("\n=== Una tablet nueva ===");
    r = await abrir(browser, { memoria: 8 });
    await r.p.waitForSelector("#app:not([hidden])", { timeout: 15000 });
    igual("no se enciende: nada le falta", [await estadoLiviano(r.p), await r.p.evaluate(() => [window.ModoLiviano.rellenado(), !!window.sb.sinLibreria])], [[null, "false", "🪶 Liviano: no"], [[], false]]);
    // Se marca la tarjeta de la mesa 2: si se vuelve a armar, la marca se pierde.
    const marcar = () => r.p.evaluate(() => { const t = document.querySelectorAll("#lista .cam-mesa")[1]; t.__marca = true; });
    const sigue = () => r.p.evaluate(() => !!document.querySelectorAll("#lista .cam-mesa")[1].__marca);
    const actualizar = async () => {
        const antes = await r.p.evaluate(() => window.__llamadas.filter((x) => ["leer", "avisos"].includes(x.body.action)).length);
        await r.p.click("#actualizar");
        await r.p.waitForFunction((n) => window.__llamadas.filter((x) => ["leer", "avisos"].includes(x.body.action)).length >= n + 2, antes);
        await r.p.waitForFunction(() => !document.getElementById("actualizar").disabled);
        await r.p.waitForTimeout(300);
    };
    await marcar();
    await actualizar();
    igual("«Actualizar» con lo mismo: las tarjetas NO se vuelven a armar", await sigue(), true);
    await r.p.evaluate(() => { window.__avisos.abiertas = [2]; });
    await actualizar();
    igual("con un pedido de ayuda nuevo en la mesa 2: sí se vuelve a armar, y lo muestra", [await sigue(), await r.p.evaluate(() => document.querySelectorAll("#lista .cam-mesa")[1].querySelector(".cam-ayuda-mesa").disabled)], [false, true]);
    igual("sin errores en la página", r.errores, []);
    await r.ctx.close();

    console.log("\n=== En un navegador de pruebas, no decide solo (salvo que se le pida) ===");
    r = await abrir(browser, { vieja: true, memoria: 1, lenta: true, auto: false });
    await r.p.waitForSelector("#app:not([hidden])", { timeout: 15000 });
    await r.p.waitForTimeout(6500);
    igual("ni con el navegador viejo, poca memoria y dibujo lento: las otras pruebas no lo ven cambiar", [(await estadoLiviano(r.p))[0], await r.p.evaluate(() => [window.ModoLiviano.motivos(), localStorage.getItem("modo_liviano_medido_v1")])], [null, [[], null]]);
    await r.p.click("#modo-liviano");
    igual("pero el botón sí lo enciende", (await estadoLiviano(r.p))[0], "si");
    await r.ctx.close();

    console.log("\n=== Lo que dice la tablet y lo que se mide ===");
    r = await abrir(browser, { memoria: 1 });
    igual("poca memoria (1 GB) lo enciende", [await estadoLiviano(r.p), await r.p.evaluate(() => window.ModoLiviano.motivos())], [["si", "true", "🪶 Liviano: sí"], ["poca memoria (1 GB)"]]);
    await r.ctx.close();
    r = await abrir(browser, { memoria: 8, lenta: true });
    igual("una tablet que dibuja lento: al abrir todavía no", (await estadoLiviano(r.p))[0], null);
    await r.p.waitForFunction(() => document.documentElement.getAttribute("data-liviano") === "si", null, { timeout: 12000 }).catch(() => {});
    igual("después de medir unos segundos, sí, y lo recuerda", [(await estadoLiviano(r.p))[0], await r.p.evaluate(() => localStorage.getItem("modo_liviano_medido_v1")), await r.p.evaluate(() => window.ModoLiviano.motivos()[0].startsWith("dibuja "))], ["si", "lenta", true]);
    await r.ctx.close();
    r = await abrir(browser, { memoria: 8, guardado: { modo_liviano_medido_v1: "lenta" } });
    igual("la próxima vez, encendido desde el principio", (await estadoLiviano(r.p))[0], "si");
    igual("sin errores en la página", r.errores, []);
    await r.ctx.close();

    await browser.close();
    console.log(fallos ? "\n✗ " + fallos + " comprobaciones fallaron." : "\n✓ El modo liviano y el respaldo de Supabase funcionan.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
