/* El Rápido y el Blitz del Centroamericano en la página del árbitro (centroamericano-arbitro.html):
   la misma página en «modo rápido», que se enciende sola por el nombre del torneo («Rápido…»,
   «Rapid…», «Blitz…») o por el `ritmo` que mande la base. Comprueba:
   - quién es rápido y quién no (ritmoRapido) y el minuto de la ilegal en el blitz (apéndice B.3);
   - el clásico sigue igual: el desplegable con «Guardar», el control de tiempos y los iconos;
   - en el blitz: la cabecera lo dice, la revisión previa es UN botón (y la base recibe los dos
     pasos), 1-0 / ½-½ / 0-1 en botones grandes que guardan con UN toque, sin preguntar; cambiar
     un resultado ya guardado sí pregunta, y si se cancela no queda nada a medias; «Otro
     resultado» a mano con el desplegable; la ilegal en un toque, sin elegir el tipo, con su
     minuto; sin control de tiempos ni fotos de planillas; cerrar la ronda con una confirmación;
   - la presencia: antes de iniciar la ronda no se marca nada; al tocar «Inició la ronda ahora» todos
     quedan presentes (también en la base, una vez) y el árbitro marca solo «No está», que arranca la
     cuenta de ese jugador; «Llegó» la quita; nunca se anota «no ha llegado» a todos;
   - a 390 px no se desplaza a lo ancho y los botones dan 4,5:1 en claro y en oscuro.

   Ver «El Rápido y el Blitz: la mesa en un toque» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js centroamericano-modo-rapido      */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");
const C = require("../js/centroamericano-mesas.js");
const { TOKEN, dobleArbitro } = require("./lib/doble-centroamericano-arbitro");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const ok = JSON.stringify(hallado) === JSON.stringify(esperado);
    if (!ok) fallos++;
    console.log((ok ? "  ✓ " : "  ✗ ") + nombre + (ok ? "" : "\n      esperado: " + JSON.stringify(esperado) + "\n      hallado:  " + JSON.stringify(hallado)));
}

// El doble de siempre, con otro nombre de torneo (o con `ritmo`).
const doble = (nombre, ritmo) => {
    const d = dobleArbitro().replace('torneo: "Sub-10 Femenino", categoria', "torneo: " + JSON.stringify(nombre) + (ritmo ? ", ritmo: " + JSON.stringify(ritmo) : "") + ", categoria");
    if (d === dobleArbitro() && nombre !== "Sub-10 Femenino") throw new Error("El doble del árbitro cambió: no se encontró el nombre del torneo.");
    return d;
};

async function abrir(browser, d, esquema = "light") {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 800 }, colorScheme: esquema });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: d }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager|cloudflareinsights/, (r) => r.abort());
    await ctx.addInitScript((base) => { const R = Date; const off = base - R.now(); class F extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } } window.Date = F; }, Date.parse("2026-11-03T21:00:00Z"));
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(BASE + "/centroamericano-arbitro.html#" + TOKEN, { waitUntil: "load" });
    await p.waitForSelector(".cam-mesa");
    return { ctx, p, errores };
}

const CONTRASTE = `(sel) => {
  const luz = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const rgba = (s) => { const m = s.match(/[\\d.]+/g).map(Number); return { c: m.slice(0, 3), a: m.length > 3 ? m[3] : 1 }; };
  const fondo = (el) => { for (let n = el; n; n = n.parentElement) { const b = rgba(getComputedStyle(n).backgroundColor); if (b.a >= 0.99) return b.c; } return [255, 255, 255]; };
  return [...document.querySelectorAll(sel)].filter((e) => e.checkVisibility()).map((e) => { const t = rgba(getComputedStyle(e).color).c, f = fondo(e); const [a, b] = [luz(t), luz(f)].sort((x, y) => y - x); return Math.round((a + 0.05) / (b + 0.05) * 100) / 100; });
}`;

const llamadas = (p, accion) => p.evaluate((a) => window.__llamadas.filter((l) => l.body.action === a).map((l) => l.body), accion);
const rapidos = (p, mesa) => p.$$eval('.cam-mesa[data-mesa="' + mesa + '"] .cam-rapido-btn', (l) => l.map((b) => [b.querySelector(".cam-rapido-valor").textContent, b.getAttribute("aria-pressed"), b.disabled]));

(async () => {
    console.log("\n=== Quién es rápido ===");
    igual("por el nombre: Rápido, Rápidas, Rapid y Blitz; el clásico, no", ["Rápido Sub-10 Absoluto", "Rápidas Sub-12 Femenino", "Rapid Sub-8 Absoluto", "Blitz Sub-14 Femenino", "BLITZ sub-16", "Sub-10 Absoluto", "PRUEBA grupo A", "Sub-18 Femenino"].map((n) => C.ritmoRapido(n)),
        ["rapido", "rapido", "rapido", "blitz", "blitz", null, null, null]);
    igual("el `ritmo` de la base manda sobre el nombre", [C.ritmoRapido("Sub-10 Absoluto", "blitz"), C.ritmoRapido("Sub-10 Absoluto", "rapido"), C.ritmoRapido("Sub-10 Absoluto", "clasico")], ["blitz", "rapido", null]);
    igual("la primera ilegal: 2 minutos; en el blitz, 1 (apéndice B.3)", [C.minutosIlegal(null), C.minutosIlegal("rapido"), C.minutosIlegal("blitz"), C.avisoIlegal(1, "Ana", "blancas", 1).texto.includes("dale 1 minuto más"), C.avisoIlegal(1, "Ana", "blancas").texto.includes("dale 2 minutos más")], [2, 2, 1, true, true]);

    const browser = await chromium.launch();

    console.log("\n=== El clásico no cambia ===");
    let r = await abrir(browser, doble("Sub-10 Femenino"));
    igual("sin modo rápido: desplegable con «Guardar», control de tiempos e iconos de cada mesa", await r.p.evaluate(() => [
        document.querySelectorAll(".cam-rapido-btn").length, !!document.querySelector('.cam-mesa[data-mesa="1"] select'), document.getElementById("abrir-tiempos").checkVisibility(),
        document.getElementById("modo-rapido").checkVisibility(), !!document.querySelector('.cam-mesa[data-mesa="1"] [data-accion="tiempo"]'), !!document.querySelector('.cam-mesa[data-mesa="1"] [data-accion="planilla"]'), document.getElementById("titulo-torneo").textContent]),
        [0, true, true, false, true, true, "Sub-10 Femenino"]);
    igual("la revisión previa sigue en dos pasos, con el ritmo de las bases", await r.p.evaluate(() => document.querySelector("#lista-previa h2").textContent.includes("paso 1 de 2") && document.getElementById("lista-previa").textContent.includes("90 minutos")), true);
    igual("sin errores en la página", r.errores, []);
    await r.ctx.close();

    console.log("\n=== El Blitz: todo en un toque ===");
    r = await abrir(browser, doble("Blitz Sub-10 Femenino"));
    const p = r.p;
    igual("la cabecera y el aviso dicen Blitz; sin control de tiempos ni iconos de cámara y reloj", await p.evaluate(() => [
        document.getElementById("titulo-torneo").textContent, document.getElementById("modo-rapido").checkVisibility(), document.getElementById("modo-rapido-ritmo").textContent,
        document.getElementById("abrir-tiempos").checkVisibility(), document.querySelectorAll('[data-accion="tiempo"], [data-accion="planilla"]').length, document.getElementById("regla-minutos").textContent]),
        ["Sub-10 Femenino · Blitz", true, "Blitz", false, 0, "1 minuto"]);
    igual("tres botones por mesa (1-0, ½-½, 0-1), apagados hasta la revisión previa; el guardado se ve marcado", [await rapidos(p, 1), await rapidos(p, 3)],
        [[["1-0", "false", true], ["½-½", "false", true], ["0-1", "false", true]], [["1-0", "false", true], ["½-½", "true", true], ["0-1", "false", true]]]);
    igual("la revisión previa es UN botón, sin el ritmo del clásico", await p.evaluate(() => { const c = document.getElementById("lista-previa"); return [c.checkVisibility(), c.querySelectorAll("button").length, document.getElementById("aprobar-paso").textContent, c.textContent.includes("90 minutos")]; }),
        [true, 1, "Relojes y tableros listos", false]);
    await p.click("#aprobar-paso");
    await p.waitForFunction(() => document.getElementById("lista-previa").hidden);
    igual("un toque aprueba los dos pasos en la base, en orden", (await llamadas(p, "lista")).map((b) => b.paso), ["relojes", "tableros"]);
    igual("y los botones se encienden", (await rapidos(p, 1)).map((x) => x[2]), [false, false, false]);

    console.log("\n=== La presencia: iniciada la ronda, todos están ===");
    const pres = () => p.evaluate(() => [...document.querySelectorAll(".cam-mesa")].map((m) => [m.dataset.mesa, [...m.querySelectorAll(".cam-presencia")].map((x) => x.dataset.presente + ":" + [...x.querySelectorAll("button")].map((b) => b.dataset.accion).join(",")).join(" ")]));
    igual("antes de iniciar la ronda no hay nada que marcar, ni cuenta, y lo explica", [await pres(), await p.evaluate(() => [document.querySelectorAll(".cam-cuenta").length, document.getElementById("presencia-resumen").textContent.includes("todos cuentan como presentes"), document.getElementById("presencia-todos").checkVisibility()])],
        [[["1", ""], ["2", ""], ["3", ""]], [0, true, false]]);
    await p.click("#ir-ahora");
    await p.waitForFunction(() => document.querySelector('.cam-mesa[data-mesa="1"] .cam-presencia'));
    igual("al iniciar, todos presentes también en la base (una vez) y nunca «no ha llegado» a todos", await p.evaluate(() => [(window.__todosArgs || []).length, (window.__ausentesArgs || []).length]), [1, 0]);
    igual("cada jugador sin resultado lleva «No está»; la mesa con resultado, nada", await pres(), [["1", "si:ausente si:ausente"], ["2", "si:ausente si:ausente"], ["3", ""]]);
    igual("sin ausentes no corre ninguna cuenta", await p.evaluate(() => [document.querySelectorAll(".cam-cuenta").length, document.getElementById("presencia-resumen").textContent]), [0, "Todos presentes. Si alguien no está, toca su «No está»."]);
    await p.click('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="negras"] [data-accion="ausente"]');
    await p.waitForFunction(() => document.querySelector('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="negras"] .cam-cuenta'));
    igual("«No está» lo anota y arranca SU cuenta (30 min desde el inicio), solo la suya", await p.evaluate(() => [
        window.__llamadas.filter((l) => l.body.action === "presencia").map((l) => [l.body.mesa, l.body.color, l.body.presente]),
        [...document.querySelectorAll(".cam-cuenta")].map((c) => c.closest(".cam-mesa").dataset.mesa + "|" + c.closest(".cam-jugador").dataset.color),
        /^⏱ (29:\d\d|30:00)$/.test(document.querySelector(".cam-cuenta").textContent), document.getElementById("presencia-resumen").textContent]),
        [[[2, "negras", false]], ["2|negras"], true, "No están: 1 de 6 jugadores (corre su tiempo de espera)."]);
    await p.click('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="negras"] [data-accion="presente"]');
    await p.waitForFunction(() => !document.querySelector(".cam-cuenta"));
    igual("si llega, «Llegó» lo vuelve a poner presente y su cuenta se va", await p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "presencia").map((l) => l.body.presente)), [false, true]);
    await p.click('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="negras"] [data-accion="ausente"]');
    await p.waitForFunction(() => document.querySelector(".cam-cuenta"));

    await p.click('.cam-mesa[data-mesa="1"] .cam-rapido-btn[data-valor="1"]');
    await p.waitForFunction(() => document.querySelector('.cam-mesa[data-mesa="1"]').dataset.estado === "con-resultado");
    igual("tocar 1-0 lo GUARDA de una vez (sin «Guardar» ni preguntar), solo esa mesa", [(await llamadas(p, "guardar")).map((b) => b.cambios), await p.evaluate(() => !!document.querySelector("dialog[open]"))],
        [[[{ mesa: 1, blancas: "Muñoz Feliz Alejandro", negras: "Gramajo Tovar Marco", valor: "1" }]], false]);
    igual("queda marcado 1-0, dice que se guardó y suma en el progreso", await p.evaluate(() => [document.querySelector('.cam-mesa[data-mesa="1"] .cam-rapido-btn[aria-pressed="true"]').textContent, document.querySelector('.cam-mesa[data-mesa="1"] .cam-guardado').textContent.startsWith("✓ Guardado"), document.getElementById("progreso").textContent]),
        ["1-0ganan blancas", true, "Con resultado: 2 de 3 · faltan 1"]);

    // Cambiar uno ya guardado pregunta; si se cancela, no queda nada elegido.
    await p.click('.cam-mesa[data-mesa="1"] .cam-rapido-btn[data-valor="3"]');
    await p.waitForSelector("dialog[open]");
    igual("cambiar un resultado ya guardado sí pregunta", await p.evaluate(() => document.querySelector("dialog[open]").textContent.includes("¿Cambiarlo a «0-1")), true);
    await p.keyboard.press("Escape");
    await p.waitForFunction(() => !document.querySelector("dialog[open]"));
    igual("cancelado: no se manda nada y la mesa queda como estaba, sin nada a medias", [(await llamadas(p, "guardar")).length, await p.evaluate(() => document.querySelector('.cam-mesa[data-mesa="1"]').dataset.estado), await p.$$eval('.cam-mesa[data-mesa="1"] [data-elegido]', (l) => l.filter((x) => x.dataset.elegido).length)], [1, "con-resultado", 0]);

    // Otro resultado, a mano: el desplegable de siempre, dentro de «Otro resultado».
    igual("«Otro resultado» empieza cerrado y trae incomparecencias y 0-0", await p.evaluate(() => { const d = document.querySelector('.cam-mesa[data-mesa="2"] .cam-rapido-otro'); return [d.open, [...d.querySelectorAll("option")].map((o) => o.value).join(",")]; }), [false, ",1,2,3,4,5,6"]);
    await p.click('.cam-mesa[data-mesa="2"] .cam-rapido-otro summary');
    await p.selectOption("#res-2", "5");
    igual("al elegir a mano queda abierto, con su «Guardar»", await p.evaluate(() => [document.querySelector('.cam-mesa[data-mesa="2"] .cam-rapido-otro').open, document.querySelector('.cam-mesa[data-mesa="2"] [data-accion="guardar"]').disabled]), [true, false]);
    await p.click('.cam-mesa[data-mesa="2"] [data-accion="guardar"]');
    await p.waitForFunction(() => document.querySelector('.cam-mesa[data-mesa="2"]').dataset.estado === "con-resultado");
    igual("y se guarda el 0-1 por incomparecencia", (await llamadas(p, "guardar")).pop().cambios[0].valor, "5");

    console.log("\n=== La ilegal, en un toque ===");
    await p.click('.cam-mesa[data-mesa="1"] .cam-jugador[data-color="negras"] [data-accion="ilegal"]');
    await p.waitForSelector("dialog[open]");
    igual("no pide elegir el tipo: se anota y avisa el minuto del blitz", [(await llamadas(p, "anotar")).map((b) => [b.mesa, b.color, b.tipo, b.texto]), await p.evaluate(() => [!!document.querySelector("dialog[open] select"), document.querySelector("dialog[open]").textContent.includes("Primera ilegal: dale 1 minuto al rival")])],
        [[[1, "negras", "ilegal", "Jugada ilegal (Blitz: sin elegir el tipo)"]], [false, true]]);
    await p.click("dialog[open] [data-avisos-aceptar]");
    igual("queda la marca y «Anular la última ilegal» para un toque por error", await p.evaluate(() => [!!document.querySelector('.cam-mesa[data-mesa="1"] .cam-jugador[data-color="negras"] .cam-marca[data-tipo="ilegal"]'), !!document.querySelector('.cam-mesa[data-mesa="1"] [data-accion="anular-ilegal"]')]), [true, true]);

    console.log("\n=== Cerrar la ronda ===");
    igual("la revisión final es una sola casilla, sin planillas ni fotos", await p.evaluate(() => { const c = document.getElementById("revision"); return [c.checkVisibility(), c.querySelectorAll("input[type=checkbox]").length, /planilla|foto/i.test(c.textContent), document.getElementById("finalizar").disabled]; }), [true, 1, false, true]);
    await p.check("#rev-resultados");
    await p.click("#finalizar");
    await p.waitForFunction(() => document.getElementById("revision").dataset.estado === "finalizada");
    igual("finaliza con un toque, y lo finalizado no habla de planillas", [(await llamadas(p, "finalizar")).length, await p.evaluate(() => /planilla/i.test(document.getElementById("revision").textContent))], [1, false]);

    if (process.env.CAPTURA) await p.screenshot({ path: process.env.CAPTURA + "-blitz.png", fullPage: true });
    igual("a 390 px no se desplaza a lo ancho", await p.evaluate(() => document.documentElement.scrollWidth), 390);
    igual("los botones de resultado se tocan bien (60 px de alto o más)", await p.$$eval(".cam-rapido-btn", (l) => l.every((b) => b.getBoundingClientRect().height >= 60)), true);
    const sel = ".cam-rapido-valor, .cam-rapido-ayuda, .cam-rapido-otro summary, .cam-modo-rapido, .cam-modo-rapido strong";
    igual("en claro, todo da 4,5:1 o más", Math.min(...(await p.evaluate("(" + CONTRASTE + ")(" + JSON.stringify(sel) + ")"))) >= 4.5, true);
    igual("sin errores en la página", r.errores, []);
    await r.ctx.close();

    r = await abrir(browser, doble("Sub-10 Femenino", "rapido"), "dark");
    igual("con `ritmo: rapido` de la base también se enciende (Rápido, 2 minutos)", await r.p.evaluate(() => [document.getElementById("titulo-torneo").textContent, document.getElementById("regla-minutos").textContent, document.querySelectorAll(".cam-rapido-btn").length]), ["Sub-10 Femenino · Rápido", "2 minutos", 9]);
    await r.p.click("#aprobar-paso");
    await r.p.waitForFunction(() => document.getElementById("lista-previa").hidden);
    if (process.env.CAPTURA) await r.p.screenshot({ path: process.env.CAPTURA + "-rapido-oscuro.png", fullPage: true });
    igual("en oscuro, todo da 4,5:1 o más (también el resultado guardado)", Math.min(...(await r.p.evaluate("(" + CONTRASTE + ")(" + JSON.stringify(sel) + ")"))) >= 4.5, true);
    await r.ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
