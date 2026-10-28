/* Comprueba en el navegador las páginas de las herramientas de arbitraje, con
   un doble de Supabase (js/supabase-client.js interceptado) y torneos
   inventados:

   - seleccion-codicader.html sin licencia muestra el candado y no la
     herramienta;
   - con licencia, «Cargar de chess-results y calcular» pide cada torneo a la
     Edge Function, adivina rama y ritmo del título y pinta la selección por
     rama;
   - una mujer de un torneo absoluto sale en «Lo que hay que revisar» y con
     «Es mujer» pasa a la rama femenina;
   - sin año de nacimiento sale como falta, y «Usar este año» la mete;
   - herramientas-arbitraje.html: sin sesión, todas con candado (menos Pareo
     Integral, gratis y abierto para todos) y el aviso de
     iniciar sesión; con licencia, «Abrir la herramienta».

   Ver «Herramientas de arbitraje» en docs/decisiones/juegos-y-torneos.md.

   Uso:  node herramientas/verificar-seleccion-pagina.js   (con el sitio en el 8777) */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
    else console.log("  ✓ " + nombre);
}

function jugador(nombre, fide, eloN, nac, partidas, equipo) {
    return { nombre, fideId: fide, codigoNacional: "", eloNacional: eloN, eloFide: 0, nacimiento: nac, club: "Liceo de Prueba", equipo: equipo || "",
        partidas: (partidas || []).map((p, i) => ({ ronda: i + 1, rival: p[0], res: p[1] })) };
}
const TORNEOS = {
    "https://s3.chess-results.com/tnr1.aspx": { id: "1", url: "https://s3.chess-results.com/tnr1.aspx?lan=2", titulo: "Prueba D Individual Absoluto",
        ronda: "Clasificación Final después de 3 rondas", rondasJugadas: 3, final: true, equipos: false, leido_en: "2026-10-08T20:00:00Z",
        clasificacion: [{ puesto: 1, nombre: "Arias, Pedro" }, { puesto: 2, nombre: "Vargas, Marta" }, { puesto: 3, nombre: "Sin, Fecha" }],
        jugadores: [
            jugador("Arias, Pedro", "1001", 1700, 2010, [["Vargas, Marta", "1"], ["Sin, Fecha", "1"], ["Vargas, Marta", "½"]]),
            jugador("Vargas, Marta", "1002", 1600, 2011, [["Arias, Pedro", "0"], ["Sin, Fecha", "1"], ["Arias, Pedro", "½"]]),
            jugador("Sin, Fecha", "1003", 1500, null, [["Arias, Pedro", "0"], ["Vargas, Marta", "0"], ["bye", "- 1"]]),
        ], faltantes: [] },
    "https://s3.chess-results.com/tnr2.aspx": { id: "2", url: "https://s3.chess-results.com/tnr2.aspx?lan=2", titulo: "Prueba D Individual Femenino",
        ronda: "Clasificación Final después de 3 rondas", rondasJugadas: 3, final: true, equipos: false, leido_en: "2026-10-08T20:00:00Z",
        clasificacion: [{ puesto: 1, nombre: "Rojas, Lía" }],
        jugadores: [jugador("Rojas, Lía", "2001", 1650, 2010, [])], faltantes: [] },
};

function doble(tieneLicencia) {
    return `
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const TORNEOS = ${JSON.stringify(TORNEOS)};
  const LICENCIA = ${JSON.stringify(tieneLicencia || false)}; // true: la de la selección; "todas": todas (como quien administra)
  window.__pedidos = [];
  function respuesta(data, error) { return Promise.resolve({ data, error: error || null }); }
  function consulta(tabla) {
    const q = { _tabla: tabla };
    ["select", "eq", "order", "range", "in", "update", "insert", "single", "maybeSingle", "limit"].forEach((m) => { q[m] = () => q; });
    q.then = (ok, mal) => {
      let data = [];
      if (tabla === "selecciones_arbitraje") data = { id: "00000000-0000-0000-0000-000000000001" };
      if (tabla === "profiles") data = { id: "yo", is_admin: false, role: "profesor" };
      return Promise.resolve({ data, error: null }).then(ok, mal);
    };
    return q;
  }
  window.sb = {
    auth: {
      getSession: () => respuesta({ session: { user: { id: "yo" }, access_token: "x" } }),
      getUser: () => respuesta({ user: { id: "yo" } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => respuesta({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => respuesta({ all: [], totp: [] }) },
    },
    rpc: (nombre, args) => {
      window.__pedidos.push(nombre === "tengo_herramienta" ? nombre + " " + args.p_herramienta : nombre);
      if (nombre === "tengo_herramienta") return respuesta(LICENCIA === "todas" || (LICENCIA === true && args.p_herramienta === "seleccion-codicader"));
      return respuesta(null);
    },
    from: (t) => consulta(t),
    functions: { invoke: (nombre, { body }) => {
      window.__pedidos.push(nombre + " " + body.url);
      const t = TORNEOS[body.url];
      return t ? respuesta(t) : respuesta({ error: "no existe" });
    } },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
    removeChannel: () => {},
  };
  window.supabase = { createClient: () => window.sb };
})();`;
}

async function abrir(browser, ruta, licencia) {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble(licencia) }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    const p = await ctx.newPage();
    p.on("pageerror", (e) => { console.log("  ✗ error en la página: " + e.message); fallos++; });
    await p.goto(BASE + "/" + ruta, { waitUntil: "load" });
    return { ctx, p };
}
const visible = (p, sel) => p.$eval(sel, (e) => e.checkVisibility());

(async () => {
    const browser = await chromium.launch();

    console.log("\n=== Sin licencia ===");
    let { ctx, p } = await abrir(browser, "seleccion-codicader.html", false);
    await p.waitForFunction(() => !document.getElementById("loading").checkVisibility());
    igual("se ve el candado y no la herramienta", [await visible(p, "#denegado"), await visible(p, "#app")], [true, false]);
    await ctx.close();

    console.log("\n=== Con licencia ===");
    ({ ctx, p } = await abrir(browser, "seleccion-codicader.html", true));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    await p.evaluate(() => localStorage.removeItem("seleccion_codicader_borrador_v1"));
    await p.fill("#torneos li:nth-child(1) input[type=url]", "https://s3.chess-results.com/tnr1.aspx");
    await p.dispatchEvent("#torneos li:nth-child(1) input[type=url]", "change");
    await p.click("#b-agregar");
    await p.fill("#torneos li:nth-child(2) input[type=url]", "https://s3.chess-results.com/tnr2.aspx");
    await p.dispatchEvent("#torneos li:nth-child(2) input[type=url]", "change");
    await p.click("#b-calcular");
    await p.waitForFunction(() => document.getElementById("zona-resultados").checkVisibility());
    igual("pidió los dos torneos a la Edge Function", await p.evaluate(() => window.__pedidos.filter((x) => x.startsWith("seleccion-chess-results")).length), 2);
    igual("adivinó la rama del femenino por el título", await p.$eval("#torneos li:nth-child(2) select", (s) => s.value), "F");
    const filas = () => p.$$eval("#r-filas > tr:not(.hidden)", (trs) => trs.map((t) => t.querySelector("button").textContent));
    igual("la rama masculina, sin quien no tiene año", await filas(), ["Arias, Pedro", "Vargas, Marta"]);
    const avisos = await p.$$eval("#avisos > li", (l) => l.map((x) => x.textContent));
    igual("avisa que falta el año y que Marta puede ser mujer",
        [avisos.some((t) => /Falta: Sin, Fecha no tiene año/.test(t)), avisos.some((t) => /¿Vargas, Marta es mujer\?/.test(t))], [true, true]);

    await p.click("#avisos li:has-text('Vargas, Marta') button:text-is('Es mujer')");
    await p.click("#tab-F");
    igual("con «Es mujer», Marta pasa a la rama femenina", (await filas()).sort(), ["Rojas, Lía", "Vargas, Marta"]);
    await p.click("#tab-M");
    igual("y sale de la masculina", await filas(), ["Arias, Pedro"]);

    await p.fill("#avisos li:has-text('Sin, Fecha') input[type=number]", "2010");
    await p.click("#avisos li:has-text('Sin, Fecha') button:text-is('Usar este año')");
    igual("con el año escrito, entra", await filas(), ["Arias, Pedro", "Sin, Fecha"]);
    igual("los ajustes a mano quedan a la vista", await p.$$eval("#ajustes > li", (l) => l.length), 2);
    igual("se ve el modo en vivo", await visible(p, "#zona-vivo"), true);
    await ctx.close();

    console.log("\n=== La vitrina pública ===");
    const ctx2 = await browser.newContext({ serviceWorkers: "block" });
    await ctx2.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    const v = await ctx2.newPage();
    await v.addInitScript(() => { try { localStorage.clear(); } catch (e) { } });
    await v.goto(BASE + "/herramientas-arbitraje.html", { waitUntil: "load" });
    await v.waitForFunction(() => document.querySelectorAll("#lista > li").length > 0);
    igual("sin sesión: todas con candado y el aviso de iniciar sesión, menos las gratis (Pareo Integral, la lista de árbitros y las de datos estudiantiles)",
        [await v.$$eval("#lista > li:not([data-herramienta='pareo']):not([data-herramienta='arbitros']):not([data-herramienta='ajedrez-estudiantil']):not([data-herramienta='historial-jugador']):not([data-herramienta='estadisticas-colegios']):not([data-herramienta='inscripcion-jde']):not([data-herramienta='cenfotec-2026']):not([data-herramienta='torneos-costa-rica']):not([data-herramienta='utn-2026'])", (l) => l.every((x) => /🔒/.test(x.textContent))), await visible(v, "#activar-sin-sesion"), await visible(v, "#activar-con-sesion")],
        [true, true, false]);
    // Pareo Integral no lleva licencia: abierto para todos, sin sesión, con su manual.
    igual("sin sesión, Pareo Integral sale gratis y se abre",
        await v.$eval("#lista li[data-herramienta='pareo']", (li) => [/Gratis/.test(li.textContent), !/🔒/.test(li.textContent),
            !!li.querySelector("a[href='pareo.html']"), !!li.querySelector("a[href='pareo-manual.html']"), !li.querySelector("a[href^='https://wa.me']")]),
        [true, true, true, true, true]);
    igual("sin sesión, la lista de árbitros sale gratis y se abre",
        await v.$eval("#lista li[data-herramienta='arbitros']", (li) => [/Gratis/.test(li.textContent), !/🔒/.test(li.textContent), !!li.querySelector("a[href='arbitros.html']")]),
        [true, true, true]);
    igual("sin sesión, Ajedrez estudiantil sale gratis y se abre",
        await v.$eval("#lista li[data-herramienta='ajedrez-estudiantil']", (li) => [/Gratis/.test(li.textContent), !/🔒/.test(li.textContent), !!li.querySelector("a[href='ajedrez-estudiantil.html']")]),
        [true, true, true]);
    for (const [id, href] of [["historial-jugador", "historial-jugador.html"], ["estadisticas-colegios", "estadisticas-colegios.html"], ["inscripcion-jde", "inscripcion-jde.html"], ["cenfotec-2026", "cenfotec-2026.html"], ["utn-2026", "utn-2026.html"], ["torneos-costa-rica", "torneos-pareo.html#tambien"]]) {
        igual("sin sesión, " + id + " sale gratis y se abre",
            await v.$eval("#lista li[data-herramienta='" + id + "']", (li, h) => [/Gratis/.test(li.textContent), !/🔒/.test(li.textContent), !!li.querySelector("a[href='" + h + "']")], href),
            [true, true, true]);
    }

    // Las fichas por tema: se ve solo lo del tema elegido, medido en la pantalla.
    const vistas = () => v.$$eval("#lista > li", (l) => l.filter((x) => x.checkVisibility()).map((x) => x.dataset.herramienta));
    igual("las tarjetas de tema, en orden y con cuántas herramientas trae cada una",
        await v.$$eval("#temas [role=tab]", (l) => l.map((b) => [b.dataset.tema, b.querySelector(".font-serif").textContent, /^\d+ herramientas? →$/.test(b.lastChild.textContent) && b.lastChild.textContent.split(" ")[0], b.getAttribute("aria-selected")])),
        [["arbitraje", "Arbitraje", "7", "false"], ["jde", "Juegos Deportivos Estudiantiles", "6", "false"], ["jdn", "Juegos Deportivos Nacionales", "2", "false"], ["universitarios", "Universitarios", "4", "false"]]);
    igual("de entrada no hay tema elegido: ninguna herramienta abajo, y Oscar pide elegir uno",
        [await vistas(), await visible(v, "#panel-tema"), await visible(v, "#tema-invitacion img[src='img/oscar-avatar-160.jpg']"),
            (await v.textContent("#tema-invitacion")).includes("¡Elige un tema!"), await v.$eval("#tab-arbitraje", (b) => b.tabIndex)],
        [[], false, true, true, 0]);
    await v.click("#tab-arbitraje");
    igual("al tocar Arbitraje, Oscar se va y salen sus herramientas",
        [await vistas(), await visible(v, "#tema-invitacion"), await v.$eval("#tab-arbitraje", (b) => b.getAttribute("aria-selected"))],
        [["pareo", "torneos-costa-rica", "arbitros", "arbitros-cr", "desempates", "variacion-elo", "reclamos-tablas"], false, "true"]);
    igual("lo que hace cada herramienta va detrás de «Qué hace», cerrado",
        await v.$eval("#lista li[data-herramienta='pareo'] details", (d) => [d.querySelector("summary").textContent, d.open, d.querySelector("ul").checkVisibility()]),
        ["Qué hace (5)", false, false]);
    await v.click("#lista li[data-herramienta='pareo'] summary");
    igual("y se abre al tocarlo", await v.$eval("#lista li[data-herramienta='pareo'] details ul", (u) => u.checkVisibility()), true);
    await v.click("#tab-jdn");
    igual("en la ficha JDN, solo las de los JDN, y la dirección la recuerda",
        [await vistas(), await v.evaluate(() => location.hash), await v.$eval("#panel-tema", (d) => d.getAttribute("aria-labelledby"))],
        [["jdn-comites", "jdn-proyeccion"], "#jdn", "tab-jdn"]);
    igual("y el título de la lista dice el tema", await v.$eval("#tema-titulo", (h) => h.textContent), "🏆 Juegos Deportivos Nacionales");
    await v.focus("#tab-jdn");
    await v.keyboard.press("ArrowRight");
    igual("con la flecha se pasa a la ficha siguiente, la de los torneos universitarios",
        [await vistas(), await v.evaluate(() => document.activeElement.id)], [["universidades", "torneos-universitarios", "cenfotec-2026", "utn-2026"], "tab-universitarios"]);
    igual("el catálogo de torneos universitarios se pide con la licencia de los resultados universitarios",
        await v.$eval("#lista li[data-herramienta='torneos-universitarios'] a[href^='https://wa.me']", (a) => decodeURIComponent(a.href).includes("«Resultados universitarios por universidad»")), true);
    await v.goto(BASE + "/herramientas-arbitraje.html#jde", { waitUntil: "load" });
    await v.waitForFunction(() => document.querySelectorAll("#lista > li").length > 0);
    igual("un enlace con #jde abre la ficha JDE",
        await vistas(), ["seleccion-codicader", "ajedrez-estudiantil", "historial-jugador", "estadisticas-colegios", "inscripcion-jde", "acta-jde"]);
    await ctx2.close();
    // Con #jde, para que la selección (de los JDE) se vea abierta.
    ({ ctx, p } = await abrir(browser, "herramientas-arbitraje.html#jde", true));
    await p.waitForFunction(() => document.getElementById("activar-con-sesion").checkVisibility());
    await p.waitForSelector("#lista li[data-herramienta='seleccion-codicader'] a[href='seleccion-codicader.html']");
    igual("con licencia: «Abrir la herramienta» en la que tiene, candado en las demás",
        await p.$$eval("#lista > li", (l) => l.map((x) => [x.dataset.herramienta, /🔓/.test(x.textContent)])),
        [["pareo", false], ["torneos-costa-rica", false], ["arbitros", false], ["arbitros-cr", false], ["desempates", false], ["variacion-elo", false], ["reclamos-tablas", false], ["seleccion-codicader", true], ["ajedrez-estudiantil", false], ["historial-jugador", false], ["estadisticas-colegios", false], ["inscripcion-jde", false], ["acta-jde", false], ["jdn-comites", false], ["jdn-proyeccion", false], ["universidades", false], ["torneos-universitarios", false], ["cenfotec-2026", false], ["utn-2026", false]]);
    igual("las gratis no se le preguntan a la base (y las demás sí)",
        await p.evaluate(() => [window.__pedidos.includes("tengo_herramienta ajedrez-estudiantil") || window.__pedidos.includes("tengo_herramienta historial-jugador") || window.__pedidos.includes("tengo_herramienta estadisticas-colegios") || window.__pedidos.includes("tengo_herramienta inscripcion-jde"), window.__pedidos.includes("tengo_herramienta pareo"), window.__pedidos.includes("tengo_herramienta seleccion-codicader")]),
        [false, false, true]);
    igual("el catálogo de torneos universitarios pregunta por la licencia de «universidades», no por una suya",
        await p.evaluate(() => [window.__pedidos.includes("tengo_herramienta universidades"), window.__pedidos.includes("tengo_herramienta torneos-universitarios")]),
        [true, false]);
    await ctx.close();
    // Con todas las herramientas (la licencia «todas», o quien administra), las
    // que todavía no se pueden usar siguen diciendo «Próximamente», no «Abierta».
    ({ ctx, p } = await abrir(browser, "herramientas-arbitraje.html#arbitraje", "todas"));
    await p.waitForSelector("#lista li[data-herramienta='desempates'] a[href='desempates.html']");
    igual("con todas: las que vienen siguen en «Próximamente», sin «Abierta para tu cuenta»",
        await p.$$eval("#lista li[data-herramienta='variacion-elo'], #lista li[data-herramienta='reclamos-tablas'], #lista li[data-herramienta='desempates']", (l) => l.map((x) => [x.dataset.herramienta, /Próximamente/.test(x.textContent), /Abierta para tu cuenta/.test(x.textContent)])),
        [["desempates", false, true], ["variacion-elo", true, false], ["reclamos-tablas", true, false]]);
    await ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
