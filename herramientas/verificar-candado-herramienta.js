/* El candado de las herramientas que trabajan en el navegador
   (js/candado-herramienta.js): todas las herramientas llevan licencia.

   Lo que comprueba:
   - sin nada que leer: cada herramienta de la vitrina que no es gratis abre
     una página que pregunta la licencia (lleva el candado con su id, o
     pregunta tengo_herramienta() en su propio código); las páginas que antes
     eran gratis llevan el candado con el id de la vitrina; en la vitrina solo
     quedan gratis las páginas que ve el público (torneos de Costa Rica y los
     torneos universitarios);
   - en el navegador, con un doble de Supabase (window.sb):
     - sin sesión, la herramienta NO se ve (checkVisibility) y el panel pide
       iniciar sesión, con la vuelta a la misma página;
     - con sesión sin licencia, tampoco, y el panel lleva a la vitrina en la
       ficha de su tema; la base se pregunta con el id de la herramienta;
     - con licencia, se ve y el panel se va; sin red después, vale la última
       respuesta guardada en el aparato; sin red y sin nada guardado, no;
     - lo que ve el público sigue abierto: el enlace de solo lectura de Pareo
       Integral (#ver=…) y el QR de una mesa de Notara, sin sesión.

   Necesita el candado de verdad: pone CANDADO_DE_VERDAD=1 (ver
   lib/candado-de-prueba.js). Ver «Todas las herramientas llevan licencia» en
   docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js candado-herramienta               */
"use strict";
process.env.CANDADO_DE_VERDAD = "1";
const fs = require("fs"), path = require("path"), vm = require("vm");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

// ---------------------------------------------------------------- sin navegador
console.log("\n=== Cada herramienta con licencia pregunta la licencia ===");
const ventana = {};
vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "js", "herramientas-arbitraje.js"), "utf8"), { window: ventana });
const H = ventana.HerramientasArbitraje;
const CON_CANDADO = {
    "pareo.html": "pareo", "jde-arbitro.html": "pareo", "camara-tablero.html": "notara", "camaras.html": "notara",
    "reclamos-tablas.html": "reclamos-tablas", "bases-torneo.html": "bases-torneo", "inscripcion-jde.html": "inscripcion-jde",
    "ajedrez-estudiantil.html": "ajedrez-estudiantil", "historial-jugador.html": "historial-jugador",
    "estadisticas-colegios.html": "estadisticas-colegios", "ranking-estudiantil.html": "ranking-estudiantil",
    "arbitros.html": "arbitros",
};
const candadoDe = (pagina) => {
    const html = fs.readFileSync(path.join(RAIZ, pagina), "utf8");
    const m = html.match(/<script src="js\/candado-herramienta\.js" data-herramienta="([a-z0-9-]+)"><\/script>/);
    return m ? m[1] : null;
};
igual("las páginas que eran gratis llevan el candado con su id",
    Object.keys(CON_CANDADO).map((p) => [p, candadoDe(p)]), Object.entries(CON_CANDADO));
const sinCandado = H.LISTA.filter((h) => !h.gratis && h.disponible).filter((h) => {
    const pagina = h.href.split("#")[0];
    if (candadoDe(pagina)) return false;
    const html = fs.readFileSync(path.join(RAIZ, pagina), "utf8");
    const propios = [...html.matchAll(/<script src="(js\/[^"]+\.js)"/g)].map((m) => m[1]).filter((f) => fs.existsSync(path.join(RAIZ, f)));
    return !propios.some((f) => /tengo_herramienta/.test(fs.readFileSync(path.join(RAIZ, f), "utf8")));
}).map((h) => h.id);
igual("ninguna herramienta con licencia abre una página sin candado", sinCandado, []);
igual("en la vitrina, gratis solo lo que ve el público",
    H.LISTA.filter((h) => h.gratis).map((h) => h.id).sort(), ["cenfotec-2026", "torneos-costa-rica", "utn-2026"]);

// ---------------------------------------------------------------- en el navegador
/* El doble: una sesión o ninguna, y lo que contesta tengo_herramienta(). */
function doble({ sesion, licencia, sinRed, guardado }) {
    return ({ sesion, licencia, sinRed, guardado }) => {
        window.__preguntas = [];
        if (guardado) localStorage.setItem("candado_herramienta_v1", JSON.stringify(guardado));
        window.sb = {
            auth: {
                getSession: async () => ({ data: { session: sesion ? { user: { id: "u-1" }, access_token: "x", expires_at: Math.floor(Date.now() / 1000) + 3600 } : null } }),
                onAuthStateChange() { return { data: { subscription: { unsubscribe() { } } } }; },
            },
            rpc: async (fn, args) => {
                window.__preguntas.push([fn, args]);
                if (sinRed) return { data: null, error: { message: "Failed to fetch" } };
                return { data: !!licencia, error: null };
            },
            from() { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null }) }; },
            channel() { return { on() { return this; }, subscribe() { return this; }, send() { } }; },
            removeChannel() { },
        };
    };
}

(async () => {
    const browser = await chromium.launch();
    async function abrir(ruta, opciones) {
        const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
        await ctx.route(/supabase\.co|sentry|googletagmanager|cloudflareinsights/, (r) => r.abort());
        await ctx.addInitScript(doble(opciones), opciones);
        const p = await ctx.newPage();
        const errores = [];
        p.on("pageerror", (e) => errores.push(e.message));
        await p.goto(BASE + "/" + ruta, { waitUntil: "load" });
        await p.waitForFunction(() => window.CandadoHerramienta && window.CandadoHerramienta.estado !== "revisando"
            || (document.getElementById("candado-herramienta") && /No se pudo/.test(document.getElementById("candado-herramienta").textContent)), null, { timeout: 15000 }).catch(() => { });
        return { p, ctx, errores };
    }
    const vista = (p) => p.evaluate(() => {
        const main = document.getElementById("main-content");
        const panel = document.getElementById("candado-herramienta");
        const enlaces = panel ? [...panel.querySelectorAll("a")].map((a) => a.getAttribute("href")) : [];
        return { herramienta: main.checkVisibility(), panel: panel ? panel.checkVisibility() : false, titulo: panel ? panel.querySelector("h1").textContent : "", enlaces };
    });

    console.log("\n=== Sin sesión ===");
    let x = await abrir("reclamos-tablas.html", { sesion: false });
    let v = await vista(x.p);
    igual("la herramienta no se ve; el panel sí", [v.herramienta, v.panel], [false, true]);
    igual("pide iniciar sesión y vuelve a la misma página", [/Inicia sesión/.test(v.titulo), v.enlaces[0]], [true, "login.html?next=reclamos-tablas.html"]);
    igual("dice el nombre de la herramienta", v.titulo.includes("Reclamos de tablas"), true);
    igual("sin errores", x.errores, []);
    await x.ctx.close();

    console.log("\n=== Con sesión y sin licencia ===");
    x = await abrir("ranking-estudiantil.html", { sesion: true, licencia: false });
    v = await vista(x.p);
    igual("la herramienta no se ve", [v.herramienta, v.panel], [false, true]);
    igual("dice que falta la licencia y lleva a la vitrina, en su tema", [/licencia/.test(v.titulo), v.enlaces[0]], [true, "herramientas-arbitraje.html#jde"]);
    igual("se le preguntó a la base con el id de la herramienta",
        await x.p.evaluate(() => window.__preguntas), [["tengo_herramienta", { p_herramienta: "ranking-estudiantil" }]]);
    await x.ctx.close();

    console.log("\n=== Con licencia ===");
    x = await abrir("pareo.html", { sesion: true, licencia: true });
    v = await vista(x.p);
    igual("Pareo Integral se ve y el panel se fue", [v.herramienta, v.panel], [true, false]);
    igual("el editor está a la vista", await x.p.$eval("#pi-editor", (e) => e.checkVisibility()), true);
    igual("la respuesta queda guardada en el aparato",
        await x.p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("candado_herramienta_v1") || "{}"))), ["u-1|pareo"]);
    igual("sin errores", x.errores, []);
    await x.ctx.close();

    console.log("\n=== Sin red ===");
    x = await abrir("bases-torneo.html", { sesion: true, sinRed: true, guardado: { "u-1|bases-torneo": Date.now() - 86400000 } });
    v = await vista(x.p);
    igual("con la licencia guardada hace un día, se abre", [v.herramienta, v.panel], [true, false]);
    await x.ctx.close();
    x = await abrir("bases-torneo.html", { sesion: true, sinRed: true, guardado: { "u-1|bases-torneo": Date.now() - 8 * 86400000 } });
    v = await vista(x.p);
    igual("guardada hace ocho días, ya no", [v.herramienta, /No se pudo/.test(v.titulo)], [false, true]);
    await x.ctx.close();
    x = await abrir("bases-torneo.html", { sesion: true, sinRed: true, guardado: { "otra|bases-torneo": Date.now() } });
    v = await vista(x.p);
    igual("guardada para otra cuenta, tampoco", v.herramienta, false);
    await x.ctx.close();

    console.log("\n=== El código de la herramienta, solo con la cookie de la sesión ===");
    /* Lo que hace el worker con CODIGO_CON_LICENCIA (lo prueba
       verificar-worker.js): sin la cookie, en lugar del código manda un aviso
       que anota el archivo. Acá se imita eso y se mira qué hace la página: con
       la licencia confirmada, escribe la cookie y recarga una sola vez. */
    {
        const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
        await ctx.route(/supabase\.co|sentry|googletagmanager|cloudflareinsights/, (r) => r.abort());
        await ctx.addInitScript(doble({}), { sesion: true, licencia: true });
        const pedidos = [];
        let siempreSinCookie = false;
        await ctx.route(/\/js\/bases-torneo(-pagina)?\.js/, async (r) => {
            const conCookie = /ai_sesion_cursos=x/.test(r.request().headers().cookie || "") && !siempreSinCookie;
            pedidos.push(conCookie);
            if (conCookie) return r.continue();
            const ruta = new URL(r.request().url()).pathname;
            return r.fulfill({ status: 200, contentType: "application/javascript", headers: { "Cache-Control": "no-store" },
                body: "window.__codigoNegado = (window.__codigoNegado || []).concat(" + JSON.stringify(ruta) + ");" });
        });
        const p = await ctx.newPage();
        const errores = [];
        p.on("pageerror", (e) => errores.push(e.message));
        // Cada carga de la página pide los dos archivos: las cargas se cuentan por ahí
        // (el evento «load» no sirve: la recarga sale antes de que termine la primera).
        const cargas = () => pedidos.length / 2;
        await p.goto(BASE + "/bases-torneo.html", { waitUntil: "load" });
        await p.waitForFunction(() => window.CandadoHerramienta && window.CandadoHerramienta.estado === "abierta", null, { timeout: 20000 }).catch(() => { });
        v = await vista(p);
        igual("sin la cookie llega el aviso; con la licencia, escribe la cookie y recarga: la segunda vez llega el código",
            [pedidos.slice(0, 2), pedidos.slice(-2)], [[false, false], [true, true]]);
        igual("recargó una sola vez", cargas(), 2);
        igual("la herramienta se ve y funciona (su código cargó)", [v.herramienta, v.panel, await p.evaluate(() => typeof window.BasesTorneo)], [true, false, "object"]);
        igual("sin errores", errores, []);
        // Si el código sigue sin llegar después de recargar, lo dice y no recarga en bucle.
        siempreSinCookie = true;
        await p.evaluate(() => sessionStorage.clear());
        pedidos.length = 0;
        await p.goto(BASE + "/bases-torneo.html", { waitUntil: "load" });
        await p.waitForFunction(() => /No se pudo cargar/.test((document.getElementById("candado-herramienta") || {}).textContent || ""), null, { timeout: 20000 }).catch(() => { });
        await p.waitForTimeout(1500);
        v = await vista(p);
        igual("si el código no llega ni después de recargar: no recarga en bucle y lo dice", [cargas(), v.herramienta, /No se pudo cargar/.test(v.titulo)], [2, false, true]);
        await ctx.close();
    }

    console.log("\n=== Lo que ve el público sigue abierto ===");
    x = await abrir("pareo.html#ver=nada", { sesion: false });
    v = await vista(x.p);
    igual("el enlace de solo lectura de Pareo Integral se ve sin sesión, sin el editor",
        [v.herramienta, v.panel, await x.p.$eval("#pi-editor", (e) => e.checkVisibility())], [true, false, false]);
    await x.ctx.close();
    x = await abrir("camara-tablero.html#t=11111111-2222-3333-4444-555555555555&c=abcdefgh&m=3", { sesion: false });
    v = await vista(x.p);
    igual("el QR de una mesa de Notara abre sin sesión", [v.herramienta, v.panel], [true, false]);
    await x.ctx.close();
    x = await abrir("camara-tablero.html", { sesion: true, licencia: false });
    v = await vista(x.p);
    igual("Notara sin el QR y sin licencia, cerrada", [v.herramienta, v.panel], [false, true]);
    await x.ctx.close();

    await browser.close();
    console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : "\nTodo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
