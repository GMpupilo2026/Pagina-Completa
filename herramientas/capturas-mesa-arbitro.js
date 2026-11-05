/* Capturas REALES de la Mesa del árbitro (mesa-arbitro.html) para los estados
 * de WhatsApp que arma herramientas/imagenes-redes.js: que quien los vea sepa
 * cómo se ve de verdad la herramienta, no un dibujo.
 *
 * Es la página tal cual, en una tableta (768 px de ancho, a 2x: lo que lleva
 * el árbitro a la sala), con un doble
 * de Supabase como el de verificar-mesa-arbitro-pagina.js: la licencia, la
 * Edge Function que lee y guarda en chess-results y la bitácora. El torneo es
 * DE EJEMPLO y lo dice cada imagen: los nombres son inventados a propósito,
 * para no poner a jugadores reales (muchos, menores) en una publicidad.
 *
 *   node herramientas/capturas-mesa-arbitro.js     (necesita playwright)
 *
 * Deja los PNG en img/redes/capturas/mesa-arbitro/ (fuera del despliegue, como
 * todo img/redes). Después: node herramientas/imagenes-redes.js
 */
"use strict";
const path = require("path");
const fs = require("fs");
const http = require("http");
const { chromium } = require("./lib/playwright-con-sesion");

const RAIZ = path.join(__dirname, "..");
const SALIDA = path.join(RAIZ, "img", "redes", "capturas", "mesa-arbitro");

// Un suizo de ejemplo, ronda 4. Nombres inventados, como los da chess-results
// (apellidos y nombre). Las tres primeras ya tienen resultado.
const NOMBRES = [
    ["Rojas Vindas Daniel", "Quesada Mora Valeria"], ["Solano Araya Mateo", "Vargas Chaves Sofía"],
    ["Jiménez Ulate Andrés", "Calderón Brenes Lucía"], ["Herrera Castro Pablo", "Méndez Salas Emilia"],
    ["Navarro Soto Gabriel", "Alfaro Picado Isabella"], ["Campos Rivera Tomás", "Fallas León Camila"],
    ["Murillo Arias Samuel", "Zúñiga Porras Mariana"], ["Esquivel Durán Diego", "Montero Vega Antonella"],
    ["Cordero Ramírez Lucas", "Sibaja Mora Renata"], ["Guzmán Hidalgo Emiliano", "Badilla Cruz Valentina"],
    ["Salazar Marín Martín", "Ugalde Rojas Paula"], ["Benavides Pérez Joaquín", "Chacón Mena Daniela"],
];
const VALORES = ["1", "2", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];   // 1 = 1-0, 2 = tablas, 0 = sin resultado
const MESAS = NOMBRES.map(([b, n], i) => ({ mesa: i + 1, blancas: b, negras: n, valor: VALORES[i] }));

function doble() {
    return `(function(){
  const R = (data, error) => Promise.resolve({ data, error: error || null });
  const MESAS = ${JSON.stringify(MESAS)};
  const FILAS = [];
  const TORNEOS = [
    { tnr: "1000004", nombre: "Abierto de ejemplo", nombre_propio: "", torneo: "Abierto de ejemplo", archivado: false, primera: "2026-11-07T15:00:00Z", ultima: "2026-11-07T21:10:00Z", lineas: 9, resultados: 8, incidencias: 1 },
    { tnr: "1000003", nombre: "Rápido de los sábados", nombre_propio: "Rápido de los sábados", torneo: "Rapido sabados", archivado: false, primera: "2026-10-24T15:00:00Z", ultima: "2026-10-24T20:00:00Z", lineas: 30, resultados: 30, incidencias: 0 },
    { tnr: "1000002", nombre: "Interclubes (ejemplo)", nombre_propio: "", torneo: "Interclubes (ejemplo)", archivado: false, primera: "2026-10-10T15:00:00Z", ultima: "2026-10-11T22:00:00Z", lineas: 42, resultados: 40, incidencias: 2 }];
  window.sb = {
    auth: {
      getSession: () => R({ session: { user: { id: "yo" }, access_token: "x" } }),
      getUser: () => R({ user: { id: "yo" } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => R({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => R({ all: [], totp: [] }) },
    },
    rpc: (f, a) => {
      if (f === "arbitro_torneos_mis") return R(JSON.parse(JSON.stringify(TORNEOS)));
      return R(f === "tengo_herramienta" ? a.p_herramienta === "mesa-arbitro" : null);
    },
    functions: { invoke: (f, o) => {
      const b = o.body;
      if (b.action === "leer") return R({ tnr: "1000004", torneo: "Abierto de ejemplo", torneos: [{ tnr: "1000004", nombre: "Abierto de ejemplo", elegido: true }], ronda: 4, mesas: MESAS.map((m) => Object.assign({}, m)) });
      return R({ ok: true, ronda: b.ronda, resultados: b.cambios.map((c) => ({ mesa: c.mesa, pedido: c.valor, quedo: c.valor, ok: true })), diferencias: [] });
    } },
    from: (t) => {
      if (t !== "arbitro_bitacora") { const q = {}; ["select","eq","order","range","in","single","maybeSingle","limit","update","insert"].forEach((m) => q[m] = () => q); q.then = (ok) => Promise.resolve({ data: [], error: null }).then(ok); return q; }
      return {
        // La hora la pone la base: acá, la de una ronda de la tarde, un minuto por línea.
        insert: (rows) => { rows.forEach((r) => FILAS.push(Object.assign({ id: "id" + FILAS.length, creada_por: "yo", ocurrio: new Date(Date.UTC(2026, 10, 7, 21, 4 + FILAS.length * 2)).toISOString() }, r))); return R(null); },
        select: () => { const f = {}; const q = { eq: (c, v) => { f[c] = v; return q; }, order: () => q, range: () => q,
          then: (ok, ko) => Promise.resolve({ data: FILAS.filter((r) => Object.entries(f).every(([c, v]) => r[c] === v)), error: null }).then(ok, ko) }; return q; },
      };
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;
}

// Un servidor del sitio, solo para estas capturas.
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
    ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
function servir() {
    const srv = http.createServer((req, res) => {
        let ruta = decodeURIComponent(req.url.split(/[?#]/)[0]);
        if (ruta.endsWith("/")) ruta += "index.html";
        const archivo = path.join(RAIZ, path.normalize(ruta));
        if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { "Content-Type": TIPOS[path.extname(archivo)] || "application/octet-stream" });
        fs.createReadStream(archivo).pipe(res);
    });
    return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv)));
}

(async () => {
    fs.mkdirSync(SALIDA, { recursive: true });
    const srv = await servir();
    const BASE = "http://127.0.0.1:" + srv.address().port;
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2,
        colorScheme: "light", timezoneId: "America/Costa_Rica" });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble() }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(BASE + "/mesa-arbitro.html", { waitUntil: "load" });
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    await p.waitForSelector("#mt-lista li");
    // Nada de lo que no es la herramienta: la burbuja, el aviso de cookies…
    const limpiar = () => p.addStyleTag({ content: "#burbuja-en-linea, .burbuja, [data-burbuja], .avisos-mensaje { display: none !important; } header, nav { position: static !important; }" });
    await limpiar();
    await p.evaluate(() => document.fonts.ready);

    // La sección entera, o hasta `alto` px si es muy larga (para que se lea en un estado).
    const foto = async (sel, nombre, alto) => {
        await p.$eval(sel, (el) => el.scrollIntoView({ block: "start" }));
        await p.waitForTimeout(300);
        const r = await p.$eval(sel, (el) => { const b = el.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, width: b.width, height: b.height }; });
        if (alto && r.height > alto) r.height = alto;
        await p.screenshot({ path: path.join(SALIDA, nombre), clip: r, fullPage: true });
        console.log("img/redes/capturas/mesa-arbitro/" + nombre);
    };

    // Un pedazo de la página: de lo de arriba de `desde` a lo de abajo de `hasta`, con un margen.
    const tramo = async (desde, hasta, nombre, abajo = 20) => {
        await p.$eval(desde, (el) => el.scrollIntoView({ block: "start" }));
        await p.waitForTimeout(300);
        const r = await p.evaluate(([a, b, abajo]) => {
            const A = document.querySelector(a).getBoundingClientRect(), B = document.querySelector(b).getBoundingClientRect();
            const sec = document.querySelector(a).closest("section").getBoundingClientRect();
            return { x: sec.left + scrollX, y: A.top + scrollY - 20, width: sec.width, height: B.bottom - A.top + 20 + abajo };
        }, [desde, hasta, abajo]);
        await p.screenshot({ path: path.join(SALIDA, nombre), clip: r, fullPage: true });
        console.log("img/redes/capturas/mesa-arbitro/" + nombre);
    };

    await foto("#zona-mis-torneos", "mis-torneos.png");

    await p.fill("#m-tnr", "1000004");
    await p.fill("#m-sid", "EJEMPLO0000000000000000000000000");
    await p.click("#m-leer");
    await p.waitForSelector("#m-mesas tr");
    await p.selectOption("#m-sel-4", "3");
    await p.selectOption("#m-sel-5", "1");
    await p.selectOption("#m-sel-6", "2");
    await tramo("#t-mesas", '#m-mesas tr[data-mesa="5"]', "mesas.png", 2);   // sin asomar la fila 6

    await p.click("#m-guardar");
    await p.waitForSelector("dialog[open] [data-avisos-aceptar]");
    await p.waitForTimeout(300);
    await p.locator("dialog[open]").screenshot({ path: path.join(SALIDA, "confirmar.png") });
    console.log("img/redes/capturas/mesa-arbitro/confirmar.png");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForSelector('#m-informe li[data-ok="si"]');
    await limpiar();
    await tramo("#m-guardar", "#m-informe", "guardado.png");

    await p.fill("#b-mesa", "7");
    await p.selectOption("#b-tipo", "incidencia");
    await p.fill("#b-articulo", "art. 11.3.2");
    await p.fill("#b-texto", "Sonó un celular; el jugador perdió la partida.");
    await p.click("#b-agregar");
    await p.waitForFunction(() => document.querySelectorAll("#b-lineas tr").length === 4);
    await p.fill("#b-texto", "");
    await p.fill("#b-arbitro", "Árbitro principal");
    await limpiar();
    await tramo("#zona-bitacora table", "#b-docx", "bitacora.png");

    await browser.close();
    srv.close();
    if (errores.length) { console.error("Errores en la página:", errores); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
