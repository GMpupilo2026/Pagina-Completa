/* El resultado que pone el árbitro principal en su Pareo Integral llega solo a las tablets de la Mesa del árbitro
   (centroamericano-arbitro.html), en segundos y no en los 45 s de la lectura entera:

   - con un torneo de Pareo, cada 8 s la tablet pregunta SOLO `actualizado` de pareo_publicados (con el id del torneo
     armado desde el `tnr` inventado, «p» + el uuid sin guiones) y, si la hora cambió, vuelve a leer sus mesas: la mesa
     con el resultado nuevo cambia sin tocar nada;
   - si la hora no cambió, no se vuelve a leer nada;
   - con algo a medio anotar (el foco en una mesa), espera: no le pisa lo que está eligiendo;
   - con un torneo de chess-results, no pregunta nada a pareo_publicados; pero cuando «avisos» (cada 20 s) trae otro
     `ajeno` —lo último que guardó OTRO árbitro en otra tablet en una de sus mesas—, vuelve a leer y la mesa cambia;
   - del lado de Pareo, un torneo de un evento de la Mesa publica a los pocos segundos de cada cambio
     (ESPERA_PUBLICAR_MESA), no a los 30 s de siempre, y lee la cola de las tablets cada 5 s (ESPERA_COLA_MESA), así lo
     que guarda un árbitro llega pronto a las demás tablets;
   - la función `centroamericano-mesa` arma `ajeno` en «avisos» solo con chess-results, sin las líneas propias y solo en
     las mesas del enlace.

   El reloj es el de Playwright. Ver «El resultado del principal llega solo a las tablets» en
   docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js arbitro-pareo-al-dia      */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { TOKEN, dobleArbitro } = require("./lib/doble-centroamericano-arbitro");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const ok = JSON.stringify(hallado) === JSON.stringify(esperado);
    if (!ok) fallos++;
    console.log((ok ? "  ✓ " : "  ✗ ") + nombre + (ok ? "" : "\n      esperado: " + JSON.stringify(esperado) + "\n      hallado:  " + JSON.stringify(hallado)));
}

const UUID = "0f3c2a1b-9d8e-4c7b-a6f5-1e2d3c4b5a69";
const TNR = "p" + UUID.replace(/-/g, "");
const ORIGINAL_LEER = 'tnr: "1529737", torneo: "Sub-10 Femenino", categoria: "Sub-10", rama: "Femenino"';
const ORIGINAL_MESAS = "mesas: MESAS.map((m) => conFed(Object.assign({}, m)))";

// El doble de siempre; con `pareo`, «leer» contesta un torneo de Pareo Integral cuyas mesas salen de window.__mesasPareo
// (la prueba les cambia el resultado, como lo publicaría el principal), y window.sb.from contesta pareo_publicados con
// window.__actualizado, anotando cada pedido en window.__desde.
function doble(pareo) {
    let d = dobleArbitro();
    if (!d.includes(ORIGINAL_LEER) || !d.includes(ORIGINAL_MESAS)) throw new Error("El doble del árbitro cambió: no se encontró «leer».");
    d = d.replace(ORIGINAL_MESAS, "mesas: (window.__mesasPareo || MESAS).map((m) => conFed(Object.assign({}, m)))");
    if (pareo) d = d.replace(ORIGINAL_LEER, 'fuente: "pareo", marca: "ajedrez-integral", tnr: "' + TNR + '", torneo: "Abierto de prueba", categoria: "Abierto", rama: "Mixto"');
    return d + `
(function(){
  window.__desde = [];
  if (!${pareo ? "true" : "false"}) window.__avisos.ajeno = "2026-11-14T14:59:00Z|l1";
  window.__actualizado = "2026-11-14T15:00:00.000Z";
  window.__mesasPareo = [
    { mesa: 1, blancas: "Muñoz Feliz Alejandro", negras: "Gramajo Tovar Marco", valor: "0" },
    { mesa: 2, blancas: "Harvey Ian", negras: "Acuña Porras Fabio", valor: "0" },
    { mesa: 3, blancas: "Hopkins John", negras: "Baquero Graterol", valor: "2" },
  ];
  window.sb.from = (tabla) => {
    const pedido = { tabla, select: null, eq: [] };
    window.__desde.push(pedido);
    const q = {};
    q.select = (c) => { pedido.select = c; return q; };
    q.eq = (c, v) => { pedido.eq.push([c, v]); return q; };
    ["order", "range", "insert", "update"].forEach((m) => q[m] = () => q);
    const fila = () => tabla === "pareo_publicados" && pedido.eq.some(([c, v]) => c === "id" && v === "${UUID}") ? { actualizado: window.__actualizado } : null;
    q.maybeSingle = () => Promise.resolve({ data: fila(), error: null });
    q.then = (ok) => Promise.resolve({ data: [], error: null }).then(ok);
    return q;
  };
})();`;
}

async function abrir(browser, d) {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: d }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager|cloudflareinsights/, (r) => r.abort());
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.clock.install({ time: new Date("2026-11-14T15:00:00Z") });
    await p.goto(BASE + "/centroamericano-arbitro.html#" + TOKEN, { waitUntil: "load" });
    await p.waitForFunction(() => !document.getElementById("datos").hidden && document.getElementById("res-1"));
    return { ctx, p, errores };
}

const lecturas = (p) => p.evaluate(() => window.__llamadas.filter((x) => x.body.action === "leer").length);
const preguntas = (p) => p.evaluate(() => window.__desde.filter((x) => x.tabla === "pareo_publicados"));
// Lo que la tarjeta dice que hay en Pareo («En Pareo Integral: 1-0»), lo que se ve.
const enPareo = (p, mesa) => p.evaluate((n) => { const x = document.querySelector('#mesa-' + n + ' .cam-resultado-actual:not([data-mandado])'); return x && x.checkVisibility() ? x.textContent.trim() : null; }, mesa);
const correr = async (p, ms) => { await p.clock.runFor(ms); await p.waitForTimeout(50); };

(async () => {
    const browser = await chromium.launch();
    try {
        console.log("\nUn torneo de Pareo Integral:");
        {
            const { ctx, p, errores } = await abrir(browser, doble(true));
            igual("la mesa 1 empieza sin resultado", await enPareo(p, 1), "En Pareo Integral: Sin resultado");
            const l0 = await lecturas(p);
            await correr(p, 9000);
            const q = await preguntas(p);
            igual("a los 8 s pregunta solo `actualizado` del torneo, con el uuid armado desde el tnr",
                q.length >= 1 && q.every((x) => x.select === "actualizado" && JSON.stringify(x.eq) === JSON.stringify([["id", UUID]])), true);
            await correr(p, 9000);
            igual("si la hora no cambió, no vuelve a leer las mesas", await lecturas(p), l0);

            // El principal pone 1-0 en la mesa 1 y su Pareo publica.
            await p.evaluate(() => { window.__mesasPareo[0].valor = "1"; window.__actualizado = "2026-11-14T15:00:20.000Z"; });
            await correr(p, 9000);
            igual("con una publicación nueva vuelve a leer, sin tocar nada", await lecturas(p), l0 + 1);
            igual("y la mesa 1 dice 1-0", await enPareo(p, 1), "En Pareo Integral: 1-0 (ganan blancas)");

            // Con el foco en una mesa (a medio anotar), espera.
            await p.evaluate(() => { window.__mesasPareo[1].valor = "3"; window.__actualizado = "2026-11-14T15:00:40.000Z"; document.getElementById("res-2").focus(); });
            await correr(p, 9000);
            igual("con algo a medio anotar no lee (no le pisa lo que elige)", await lecturas(p), l0 + 1);
            igual("y la mesa 2 sigue como estaba", await enPareo(p, 2), "En Pareo Integral: Sin resultado");
            await p.evaluate(() => document.activeElement.blur());
            await correr(p, 8000);
            igual("al soltarlo, lee en la vuelta siguiente y la mesa 2 dice 0-1",
                [(await lecturas(p)) > l0 + 1, await enPareo(p, 2)], [true, "En Pareo Integral: 0-1 (ganan negras)"]);
            igual("sin errores de la página", errores, []);
            await ctx.close();
        }

        console.log("\nUn torneo de chess-results:");
        {
            const { ctx, p, errores } = await abrir(browser, doble(false));
            const l0 = await lecturas(p);
            await correr(p, 21000);
            igual("no le pregunta nada a pareo_publicados", (await preguntas(p)).length, 0);
            igual("si nadie más guardó nada, no vuelve a leer", await lecturas(p), l0);
            // Otro árbitro guarda 0-1 en la mesa 2 desde su tablet: «avisos» trae otro `ajeno`.
            await p.evaluate(() => { window.__mesasPareo[1].valor = "3"; window.__avisos.ajeno = "2026-11-14T15:00:30Z|l2"; });
            await correr(p, 20000);
            igual("lo que guardó otro árbitro se ve sin tocar nada (antes de los 45 s de la lectura entera)",
                [await lecturas(p), await p.evaluate(() => { const x = document.querySelector("#mesa-2 .cam-resultado-actual:not([data-mandado])"); return x && x.textContent.trim(); })],
                [l0 + 1, "En chess-results: 0-1 (ganan negras)"]);
            igual("sin errores de la página", errores, []);
            await ctx.close();
        }
    } finally { await browser.close(); }

    console.log("\nEl Pareo del principal:");
    const pagina = fs.readFileSync(path.join(__dirname, "..", "js", "pareo", "pagina.js"), "utf8");
    const espera = /const ESPERA_PUBLICAR_MESA = (\d+);/.exec(pagina);
    igual("en un evento de la Mesa publica a los pocos segundos (10 s o menos)", !!espera && Number(espera[1]) > 0 && Number(espera[1]) <= 10000, true);
    igual("y es la espera que usa programarPublicacion cuando el torneo es de la Mesa",
        /estado\.adjuntos\.mesa[\s\S]{0,200}deLaMesa \? ESPERA_PUBLICAR_MESA : ESPERA_PUBLICAR/.test(pagina), true);

    igual("y lee la cola de las tablets cada 5 s o menos en un evento de la Mesa",
        /ESPERA_COLA_MESA = (\d+)/.test(pagina) && Number(/ESPERA_COLA_MESA = (\d+)/.exec(pagina)[1]) <= 5000 && /cadaCola\(r\.mesa \? ESPERA_COLA_MESA/.test(pagina), true);

    console.log("\nLa función centroamericano-mesa:");
    const fn = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "centroamericano-mesa", "index.ts"), "utf8");
    const avisos = (/if \(cuerpo\.action === "avisos"\) \{[\s\S]*?\n    \}/.exec(fn) || [""])[0];
    igual("«avisos» trae `ajeno`: solo con chess-results, de otros enlaces, en las mesas del enlace",
        ["esPareo ?", '.neq("asignacion_id", a.id)', '.gte("mesa", a.mesa_desde).lte("mesa", a.mesa_hasta)', "ajeno:"].every((x) => avisos.includes(x)), true);

    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
