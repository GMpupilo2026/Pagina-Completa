/* La «Ficha del jugador federado» (admin-jugador.html), que antes era solo de
   administración y ahora también de quien tiene la licencia `ficha-federado`.

   Sin navegador, en la Edge Function chess-results-proxy: el candado deja
   pasar a administración O a quien tenga la licencia, y la licencia se
   pregunta con el token de quien llama y la clave anónima (pasa por la
   verificación en dos pasos de la base), nunca con la de servicio.

   Con navegador y un doble de Supabase (la función y la lista de la
   Federación contestadas a mano):
   - sin licencia ni administración, el candado y nada de la búsqueda;
   - con la licencia, busca y pinta al jugador con su Código FIDE;
   - el Elo nacional sale SOLO si el Código FIDE de la lista coincide (un
     homónimo no se cuela);
   - la vitrina la trae en «Clubes y federados», con licencia;
   - a 390 px no se desplaza a lo ancho y no hay errores.

   Ver «La ficha del jugador federado» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js ficha-federado                    */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

console.log("\n=== El candado de chess-results-proxy ===");
const fuente = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "chess-results-proxy", "index.ts"), "utf8");
igual("deja pasar a administración o a quien tenga la licencia «ficha-federado»",
    /let puede = !callerProfileError && !!callerProfile\?\.is_admin;/.test(fuente) && /rpc\("tengo_herramienta", \{ p_herramienta: "ficha-federado" \}\)/.test(fuente) && /if \(!puede\) \{\s*return json\(\{ error: [^}]*\}, 403\);/.test(fuente), true);
igual("la licencia se pregunta con el token de quien llama y la clave ANÓNIMA",
    /createClient\(SUPABASE_URL, ANON_KEY, \{[\s\S]*?Authorization: `Bearer \$\{jwt\}`[\s\S]*?rpc\("tengo_herramienta"/.test(fuente), true);
igual("y antes de tocar chess-results", fuente.indexOf("if (!puede)") < fuente.indexOf('body.action === "search"'), true);
{
    const ventana = {};
    new Function("window", fs.readFileSync(path.join(__dirname, "..", "js", "herramientas-arbitraje.js"), "utf8"))(ventana);
    const h = ventana.HerramientasArbitraje.porId.get("ficha-federado");
    igual("en la vitrina: disponible, con licencia propia, en «Clubes y federados»", h && [h.disponible, !!h.gratis, h.licencia || "", h.tema, h.href], [true, false, "", "clubes", "admin-jugador.html"]);
}

const FILAS = [
    { fideId: "6511635", nombreMostrado: "Ramos Rodriguez, Daniel", club: "CTP Granadilla", fed: "CRC", torneoNombre: "Etapa Nacional JDE D", torneoUrl: "https://chess-results.com/tnr1423856.aspx", fechaFinal: "2026/05/29", puesto: "2", participantes: "11", rondas: "5", tnr: "1423856", snr: "1" },
    { fideId: "6511635", nombreMostrado: "Ramos Rodriguez, Daniel", club: "CTP Granadilla", fed: "CRC", torneoNombre: "Abierto de San José", torneoUrl: "https://chess-results.com/tnr1.aspx", fechaFinal: "2026/03/08", puesto: "4", participantes: "40", rondas: "7", tnr: "1", snr: "9" },
    { fideId: "6599999", nombreMostrado: "Ramos Rodriguez, Daniel", club: "Club X", fed: "CRC", torneoNombre: "Otro", torneoUrl: "https://chess-results.com/tnr2.aspx", fechaFinal: "2025/01/01", puesto: "1", participantes: "8", rondas: "5", tnr: "2", snr: "1" },
];

function doble(admin, licencia) {
    return `(function(){
  window.__pedidos = [];
  window.SUPABASE_URL = "https://doble.supabase.test";
  window.SUPABASE_ANON_KEY = "anon";
  const R = (data, error) => Promise.resolve({ data, error: error || null });
  window.sb = {
    auth: {
      getSession: () => R({ session: { user: { id: "yo" }, access_token: "x" } }),
      getUser: () => R({ user: { id: "yo" } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => R({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => R({ all: [], totp: [] }) },
    },
    rpc: (n, a) => { window.__pedidos.push(n + " " + (a && a.p_herramienta || "")); return R(n === "tengo_herramienta" ? ${licencia ? "a.p_herramienta === 'ficha-federado'" : "false"} : null); },
    from: (t) => { const q = {}; ["select","eq","order","range","in","limit"].forEach((m) => q[m] = () => q);
      q.single = () => R(t === "profiles" ? { is_admin: ${admin} } : null); q.maybeSingle = q.single;
      q.then = (ok) => Promise.resolve({ data: [], error: null }).then(ok); return q; },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;
}

async function abrir(browser, admin, licencia, ancho) {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: ancho || 1280, height: 900 } });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble(admin, licencia) }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route("https://doble.supabase.test/functions/v1/chess-results-proxy", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ filas: FILAS }) }));
    // La lista de la Federación: el mismo nombre, pero con el Código FIDE del primero.
    await ctx.route("**/functions/v1/pareo-elo-nacional", (r) => r.fulfill({ contentType: "application/json",
        body: JSON.stringify({ ok: true, resultados: [{ nombre: "Ramos Rodriguez, Daniel", estado: "encontrado", nacional: 2040, fideEstandar: 2035, fideId: "6511635" }] }) }));
    await ctx.route(/bgtijpimpcokxatxxbki\.supabase\.co(?!\/functions\/v1\/pareo-elo-nacional)|sentry|googletagmanager/, (r) => r.abort());
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(BASE + "/admin-jugador.html", { waitUntil: "load" });
    return { ctx, p, errores };
}

(async () => {
    const browser = await chromium.launch();

    console.log("\n=== Sin licencia ===");
    let { ctx, p } = await abrir(browser, false, false);
    await p.waitForFunction(() => document.getElementById("denied").checkVisibility());
    igual("el candado con «Activar o pedir una licencia», y la búsqueda no se ve",
        [await p.$eval("#app", (a) => a.checkVisibility()), await p.$eval("#denied a", (a) => a.getAttribute("href"))], [false, "herramientas-arbitraje.html#activar"]);
    igual("preguntó por la licencia de «ficha-federado»", await p.evaluate(() => window.__pedidos.includes("tengo_herramienta ficha-federado")), true);
    await ctx.close();

    console.log("\n=== Administración, sin licencia ===");
    ({ ctx, p } = await abrir(browser, true, false));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("entra como siempre, sin preguntar por la licencia", await p.evaluate(() => window.__pedidos.includes("tengo_herramienta ficha-federado")), false);
    await ctx.close();

    console.log("\n=== Con la licencia ===");
    let errores;
    ({ ctx, p, errores } = await abrir(browser, false, true));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("el título dice qué es", await p.textContent("#app h1"), "🔎 Ficha del jugador federado");
    igual("las migas cuelgan de la Academia, no de Administración", await p.$$eval("#migas li", (l) => l.map((x) => x.textContent.trim())), ["🏛️ Academia", "›Ficha del jugador federado"]);
    await p.fill("#f-apellido", "Ramos Rodriguez");
    await p.click("#search-btn");
    await p.waitForSelector("#grupos-container h3");
    igual("dos personas, separadas por el Código FIDE", await p.$$eval("#grupos-container h3", (l) => l.length), 2);
    await p.waitForFunction(() => [...document.querySelectorAll(".elo-oficial")].every((x) => !/Buscando/.test(x.textContent)));
    igual("el Elo nacional, solo en la de su Código FIDE; el homónimo no lo recibe", await p.$$eval(".elo-oficial", (l) => l.map((x) => x.textContent)),
        ["Elo nacional 2040 · Elo FIDE estándar 2035 (lista de la Federación, ajedrezcostarica.com)", "No está en la lista de la Federación con este Código FIDE."]);
    await p.setViewportSize({ width: 390, height: 800 });
    igual("a 390 px, la página no se desplaza a lo ancho", await p.evaluate(() => document.documentElement.scrollWidth), 390);
    igual("sin errores en la página", errores, []);
    await ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
