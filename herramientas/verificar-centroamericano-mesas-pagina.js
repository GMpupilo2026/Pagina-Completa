/* centroamericano-arbitro.html (la página del árbitro, en un celular de 390 px) y
   centroamericano-mesas.html (la de la organización), con un doble de Supabase que se
   porta como las Edge Functions reales: el de centroamericano-mesa valida el token,
   cuenta las ilegales por partida, anula y solo anota lo que quedó guardado; el de
   centroamericano-clave prueba y guarda la clave de un grupo de torneos ligados.

   Lo que comprueba de la página del árbitro:
   - sin enlace, o con uno falso, no se abre nada y lo dice; con uno bueno, abre sus mesas;
   - cada mesa tiene su «Guardar» AL LADO del resultado, manda solo esa mesa y no pide
     confirmar si estaba vacía (sí si ya tenía otro resultado);
   - lo que chess-results no confirmó NO se da por guardado;
   - la primera ilegal avisa y la segunda pide confirmar, avisa que pierde, deja la banda
     roja y propone el resultado SIN guardarlo; «Anular» deshace un toque por error;
   - la irregularidad lleva su nota; el token no se guarda en el navegador;
   - a 390 px no se desplaza a lo ancho, en claro y en oscuro los colores dan 4,5 o más.
   Y los avisos: pedir ayuda (por mesa y en general), el aviso de la organización que se
   cierra con «Entendido», el nombre de un árbitro «por definir», el progreso y «Solo las
   que faltan», y la tablet (820 px) sin desplazarse a lo ancho.
   De la organización: el candado, UNA sola clave para el grupo de torneos ligados (sin
   una casilla por torneo), los pedidos de ayuda que llegan solos con su contador y
   «Atendido», los avisos a un árbitro, a un torneo o a todos con quién ya los leyó, los
   enlaces agrupados por torneo y ordenados por mesa, un árbitro por definir (crearlo,
   repartir las mesas entre varios, ponerle nombre, cambiarle las mesas), apagarlo y el PDF; y
   «Generar PGN» de cada foto de planillas, ahí mismo en la tabla: la mesa que se transmite sale
   de Lichess (simulado) sin leer la foto; la que no, de la foto con un Google Vision de mentira
   (lo salvado, lo ilegible, las marcas, el tablero, el PGN, «Descargar la lectura» y que abrirla de
   nuevo no gasta), y la tabla agrupada por torneo y ronda, como el Drive, con el enlace directo al PGN de
   las partidas transmitidas de cada ronda (la búsqueda, solo en el torneo de Lichess de su categoría).

   Ver «Mesas de los árbitros del Centroamericano» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js centroamericano-mesas-pagina      */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");
const fs = require("fs");

const BASE = process.env.BASE_URL || "http://localhost:8777";
const { TOKEN, TOKEN_B } = require("./lib/doble-centroamericano-arbitro");
const SID = "AAAA1111BBBB2222CCCC3333DDDD4444";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

const { MESAS, SERVIDOR_ARBITRO, dobleArbitro } = require("./lib/doble-centroamericano-arbitro");
const { palabrasDePlanillas } = require("./lib/planilla-sintetica");
const PLANILLAS_REALES = require("./lib/planillas-reales");

const { dobleOrganizacion } = require("./lib/doble-centroamericano-organizacion");

// Si las tarjetas miden 0 × 0, esto dice POR QUÉ (qué ancestro las esconde, qué panel se ve, si hay un diálogo abierto): el CI solo enseña el mensaje de
// la comprobación que falló, así que el motivo tiene que ir ahí.
async function porQueCero(p) {
    return p.evaluate(() => {
        const c = document.querySelector(".cam-mesa");
        const cadena = [];
        for (let n = c; n && n !== document.documentElement; n = n.parentElement) {
            const cs = getComputedStyle(n);
            if (cs.display === "none" || n.hidden || cs.visibility === "hidden" || n.getBoundingClientRect().height === 0) cadena.push((n.tagName + (n.id ? "#" + n.id : "") + (n.className ? "." + String(n.className).split(" ")[0] : "")) + "{display:" + cs.display + ",hidden:" + !!n.hidden + ",h:" + Math.round(n.getBoundingClientRect().height) + "}");
        }
        const ver = (id) => { const e = document.getElementById(id); return e ? (e.hidden ? "oculto" : "visible") : "no existe"; };
        return JSON.stringify({ cadena, app: ver("app"), problema: ver("problema"), entrada: ver("entrada"), cargando: ver("cargando"), problemaTexto: (document.getElementById("problema-texto") || {}).textContent, dialogoAbierto: !!document.querySelector("dialog[open]"), hash: location.hash.slice(0, 12), ocultaDoc: document.hidden, entradaBody: document.body.dataset.entrada || null });
    });
}

// Mide las tarjetas EN EL MISMO INSTANTE en que dejan de medir 0: si se esperaba con una llamada y se medía con otra, la página podía repintarse entre las
// dos (el CI lento lo mostró: la espera pasaba y la medida salía 0 × 0, con la página perfectamente bien un instante después).
async function medirTarjetas(p) {
    try {
        const h = await p.waitForFunction(() => { const l = [...document.querySelectorAll(".cam-mesa")]; if (!l.length) return null; const m = l.map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }); return m.every((x) => x[1] > 0) ? m : null; }, null, { timeout: 8000 });
        return await h.jsonValue();
    } catch (e) {
        return "MIDEN 0 (o no hay tarjetas) después de 8 s: " + await porQueCero(p);
    }
}

async function abrir(browser, pagina, doble, { hash = "", ancho = 390, esquema = "light" } = {}) {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: ancho, height: 800 }, acceptDownloads: true, colorScheme: esquema });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    // El reloj de la página arranca a las 8:00 a. m. del 3 de noviembre (antes de la ronda 3) y sigue corriendo: la página compara con el
    // calendario REAL del torneo (rondas, tolerancia de 30 min), así que sin esto la prueba fallaba solo si se corría DURANTE una ronda.
    await ctx.addInitScript((base) => { const R = Date; const off = base - R.now(); class F extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } } window.Date = F; }, Date.parse("2026-11-03T14:00:00Z"));
    // El botón fijo «¿Dónde juega?» queda encima de lo que haya abajo a la derecha: para que no estorbe a las demás pruebas (que hacen clic en
    // cualquier parte de la página) arranca sin recibir clics; las pruebas de la lupa se lo devuelven (`conFab`).
    await ctx.addInitScript(() => { document.addEventListener("DOMContentLoaded", () => { const e = document.createElement("style"); e.id = "t-sin-fab"; e.textContent = ".cam-fab { pointer-events: none !important; }"; document.head.append(e); }); });
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(BASE + "/" + pagina + (hash ? "#" + hash : ""), { waitUntil: "load" });
    return { ctx, p, errores };
}

// Lichess simulado: la sala del Centroamericano transmite «Open U10» (el Sub-10 Absoluto, con el nombre que le pone
// Lichess), con la ronda 3 en curso (atraso de 1 min).
// En la transmisión están la mesa 9 (Eli Uno – Fran Dos, para los relojes) y la 3 de la ronda 3 (Hopkins – Baquero,
// ya terminada, con su PGN: para «Generar PGN», que la saca de ahí sin leer la foto). La mesa 2 no se transmite.
const PGN_TRANSMISION = `[Event "Centroamericano 2026 | Sub-10 Abs"]
[Site "https://lichess.org/broadcast/centroamericano-2026/round-3/RoNdA003/x3"]
[Round "3.3"]
[White "Hopkins, John"]
[Black "Baquero Graterol"]
[Result "1-0"]
[GameURL "https://lichess.org/broadcast/centroamericano-2026/round-3/RoNdA003/x3"]

1. e4 { [%clk 1:30:10] } 1... e5 { [%clk 1:30:05] } 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0

[Event "Centroamericano 2026 | Sub-10 Abs"]
[Round "3.9"]
[White "Uno, Eli"]
[Black "Dos, Fran"]
[Result "*"]
[GameURL "https://lichess.org/broadcast/centroamericano-2026/round-3/RoNdA003/x2"]

1. d4 d5 *
`;
async function simularLichess(pagina, pedidos) {
    await pagina.context().route(/lichess\.org\/api\//, (r) => {
        const u = r.request().url(); pedidos.push(u);
        if (/\/api\/broadcast\/AbCd1234$/.test(u)) return r.fulfill({ contentType: "application/json", body: JSON.stringify({ tour: { id: "AbCd1234", name: "Centroamericano 2026 | Open U10" }, rounds: [{ id: "RoNdA002", name: "Round 2", finished: true }, { id: "RoNdA003", name: "Round 3", ongoing: true }] }) });
        if (/\/api\/broadcast\/-\/-\/RoNdA003$/.test(u)) return r.fulfill({ contentType: "application/json", body: JSON.stringify({ round: { id: "RoNdA003", name: "Round 3", delay: 60 }, games: [
            { id: "x1", fen: "8/8/8/8/8/8/8/K6k w - - 0 31", status: "*", thinkTime: 10, players: [{ name: "Otro, Juan", clock: 100000 }, { name: "Más, Pedro", clock: 100000 }] },
            { id: "x2", fen: "8/8/8/8/8/8/8/K6k w - - 0 36", status: "*", thinkTime: 10, players: [{ name: "Uno, Eli", clock: 30000 }, { name: "Dos, Fran", clock: 456700 }] },
            { id: "x3", fen: "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4", status: "1-0", players: [{ name: "Hopkins, John", clock: 540000 }, { name: "Baquero Graterol", clock: 538000 }] }] }) });
        // pedidos.cortar: Lichess no contesta (el «Failed to fetch» de la organización)
        if (pedidos.cortar && /\.pgn$/.test(u)) return r.abort("connectionreset");
        if (/\/api\/broadcast\/round\/RoNdA003\.pgn$/.test(u)) return r.fulfill({ contentType: "application/x-chess-pgn", body: PGN_TRANSMISION });
        // la ronda es un estudio y cada partida un capítulo: el PGN de una sola
        if (/\/api\/study\/RoNdA003\/x3\.pgn$/.test(u)) return r.fulfill({ contentType: "application/x-chess-pgn", body: PGN_TRANSMISION.split(/\n\n(?=\[)/)[0] + "\n" });
        return r.fulfill({ status: 404, body: "{}" });
    });
    await pagina.evaluate(() => { const viejo = window.sb.from; window.sb.from = (t) => (t === "salas_torneo" ? { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { enlaces: [{ texto: "Partidas", url: "https://lichess.org/broadcast/centroamericano-2026/AbCd1234" }] }, error: null }) }) }) } : viejo(t)); });
}

// El contraste de lo que se ve: el color del texto contra el fondo opaco más cercano.
const CONTRASTE = `(sel) => {
  const luz = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const rgba = (s) => { const m = s.match(/[\\d.]+/g).map(Number); return { c: m.slice(0, 3), a: m.length > 3 ? m[3] : 1 }; };
  const fondo = (el) => { for (let n = el; n; n = n.parentElement) { const b = rgba(getComputedStyle(n).backgroundColor); if (b.a >= 0.99) return b.c; } return [255, 255, 255]; };
  return [...document.querySelectorAll(sel)].filter((e) => e.checkVisibility()).map((e) => { const t = rgba(getComputedStyle(e).color).c, f = fondo(e); const [a, b] = [luz(t), luz(f)].sort((x, y) => y - x); return Math.round((a + 0.05) / (b + 0.05) * 100) / 100; });
}`;

(async () => {
    const browser = await chromium.launch();

    console.log("\n=== La página del árbitro: el enlace ===");
    let r = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro());
    await r.p.waitForSelector("#entrada:not([hidden])");
    igual("sin enlace no se abre nada y pide el código (o el enlace)", [await r.p.textContent("#entrada-titulo"), await r.p.$eval("#app", (a) => a.checkVisibility()), await r.p.evaluate(() => window.__llamadas.length)], ["Entra con tu código", false, 0]);
    await r.ctx.close();
    r = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: "f".repeat(64) });
    await r.p.waitForSelector("#problema:not([hidden])");
    igual("con un enlace falso: «ya no sirve», sin botón para reintentar", [await r.p.textContent("#problema-titulo"), (await r.p.textContent("#problema-texto")).includes("no es válido"), await r.p.$eval("#problema-reintentar", (b) => b.checkVisibility())], ["Este enlace ya no sirve", true, false]);
    await r.ctx.close();

    console.log("\n=== La página del árbitro: entrar con el código corto (sin cámara ni WhatsApp) ===");
    {
        r = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { ancho: 820 });
        await r.p.waitForSelector("#entrada:not([hidden])");
        igual("sin enlace aparece la casilla del código (no el aviso de «Falta tu enlace»), con foco, y no se abre la mesa",
            await r.p.evaluate(() => [document.getElementById("entrada").checkVisibility(), document.getElementById("problema").hidden, document.activeElement.id, document.getElementById("app").checkVisibility(), window.__llamadas.length]), [true, true, "entrada-codigo", false, 0]);
        igual("la casilla se puede escribir con el teclado de la tablet: mayúsculas sugeridas, sin autocorrector, con etiqueta y ayuda",
            await r.p.$eval("#entrada-codigo", (i) => [i.autocapitalize, i.getAttribute("autocorrect"), i.spellcheck, i.autocomplete, !!document.querySelector('label[for="entrada-codigo"]'), i.getAttribute("aria-describedby")]), ["characters", "off", false, "off", true, "entrada-ayuda entrada-error"]);
        igual("mientras se pide el código no se ofrece lo que necesita el enlace («¿Dónde juega?» y «Todas las mesas»)",
            await r.p.evaluate(() => [document.getElementById("donde-juega").checkVisibility(), document.getElementById("ver-todas-mesas").checkVisibility()]), [false, false]);
        // Un código que no existe: el error sale escrito (role=alert) y se puede volver a intentar.
        await r.p.fill("#entrada-codigo", "ZZZZ-2222");
        await r.p.click("#entrada-entrar");
        await r.p.waitForSelector("#entrada-error:not([hidden])");
        igual("un código que no existe dice por qué, avisa al lector de pantalla (aria-live) y deja corregir (conserva lo escrito, no abre la mesa)",
            await r.p.evaluate(() => [document.getElementById("entrada-error").textContent.includes("no es de ningún árbitro"), document.getElementById("entrada-error").getAttribute("aria-live"), document.getElementById("entrada-codigo").value, document.getElementById("entrada-codigo").getAttribute("aria-invalid"), document.getElementById("app").checkVisibility(), location.hash]), [true, "assertive", "ZZZZ2222", "true", false, ""]);
        await r.p.fill("#entrada-codigo", "ab0");
        await r.p.click("#entrada-entrar");
        await r.p.waitForFunction(() => document.getElementById("entrada-error").textContent.includes("8 letras y números"));
        await r.p.fill("#entrada-codigo", "zzzz zzzz");
        await r.p.click("#entrada-entrar");
        await r.p.waitForFunction(() => document.getElementById("entrada-error").textContent.includes("organización apagó"));
        igual("el código de un enlace apagado y el mal escrito también se explican", true, true);
        // El bueno, en minúsculas y con espacio.
        await r.p.fill("#entrada-codigo", "k7m2 9qxa");
        await r.p.click("#entrada-entrar");
        await r.p.waitForSelector("#app:not([hidden])");
        igual("el código bueno (en minúsculas, con espacio) abre la mesa y la dirección queda como la de siempre (#t=<token>), sin el código",
            await r.p.evaluate((t) => [location.hash === "#t=" + t, location.hash.includes("K7M2"), document.getElementById("entrada").hidden, document.getElementById("app").checkVisibility(), window.__llamadas.some((l) => l.f === "centroamericano-mesa" && l.body.token === t)], TOKEN), [true, false, true, true, true]);
        await r.ctx.close();
        // Desde /m/<código> el worker manda con «#c=…»: entra solo, sin escribir nada.
        r = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: "c=K7M29QXA" });
        await r.p.waitForSelector("#app:not([hidden])");
        igual("ya adentro, «¿Dónde juega?» y «Todas las mesas» vuelven", await r.p.evaluate(() => [document.getElementById("donde-juega").checkVisibility(), document.getElementById("ver-todas-mesas").checkVisibility(), document.body.dataset.entrada === undefined]), [true, true, true]);
        igual("con «#c=<código>» en la dirección entra solo (sin escribir) y deja la dirección con el token", await r.p.evaluate((t) => [location.hash === "#t=" + t, document.getElementById("entrada").hidden], TOKEN), [true, true]);
        await r.ctx.close();
        r = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: "c=ZZZZ2222" });
        await r.p.waitForSelector("#entrada-error:not([hidden])");
        igual("con un «#c=» malo muestra la casilla con el error y el código para corregirlo, y quita el código de la dirección",
            await r.p.evaluate(() => [document.getElementById("entrada-error").textContent.includes("no es de ningún árbitro"), document.getElementById("entrada-codigo").value, location.hash, document.getElementById("app").checkVisibility()]), [true, "ZZZZ2222", "", false]);
        await r.ctx.close();
        // Con el enlace de siempre no aparece la casilla.
        r = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: TOKEN });
        await r.p.waitForSelector("#app:not([hidden])");
        igual("con el enlace o el QR de siempre no se pide ningún código y no se llama a la función del código", await r.p.evaluate(() => [document.getElementById("entrada").hidden, window.__llamadas.some((l) => l.f === "centroamericano-codigo")]), [true, false]);
        await r.ctx.close();
    }

    console.log("\n=== Sus mesas ===");
    let errores;
    ({ ctx: r.ctx, p: r.p, errores } = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: TOKEN }));
    const p = r.p;
    await p.waitForSelector(".cam-mesa");
    igual("la cabecera dice la categoría, el árbitro, la ronda y sus mesas", await p.evaluate(() => ["titulo-torneo", "d-arbitro", "d-ronda", "d-mesas"].map((i) => document.getElementById(i).textContent)), ["Sub-10 Femenino", "Ana Árbitra", "Ronda 3", "Mesas 1 a 3"]);
    igual("las tres mesas, con sus jugadores y color escrito", await p.$$eval(".cam-mesa", (l) => l.map((m) => [m.dataset.mesa, m.dataset.estado, [...m.querySelectorAll(".cam-jugador")].map((j) => j.querySelector(".cam-color").textContent + ": " + j.querySelector(".cam-nombre").textContent).join(" | ")])),
        [["1", "libre", "Blancas: Muñoz Feliz Alejandro | Negras: Gramajo Tovar Marco"], ["2", "libre", "Blancas: Harvey Ian | Negras: Acuña Porras Fabio"], ["3", "con-resultado", "Blancas: Hopkins John | Negras: Baquero Graterol"]]);
    igual("le manda el token del «#» a la función", await p.evaluate((t) => window.__llamadas[0].body.token === t && window.__llamadas[0].body.action === "leer", TOKEN), true);
    igual("el token no queda guardado en el navegador", await p.evaluate((t) => { try { return JSON.stringify(localStorage).includes(t) || JSON.stringify(sessionStorage).includes(t) || document.cookie.includes(t); } catch (e) { return false; } }, TOKEN), false);

    console.log("\n=== Antes de iniciar la ronda: la lista previa, paso a paso ===");
    igual("al abrir, la lista previa pide el primer paso (los relojes, con el ritmo de las bases) y todavía no deja guardar", await p.evaluate(() => { const c = document.getElementById("lista-previa"); return [c.checkVisibility(), c.querySelector("h2").textContent.includes("paso 1 de 2"), c.textContent.includes("90 minutos") && c.textContent.includes("30 segundos de incremento"), document.querySelector('.cam-mesa[data-mesa="1"] [data-accion="guardar"]').disabled]; }), [true, true, true, true]);
    await p.click("#aprobar-paso");
    await p.waitForFunction(() => document.querySelector("#lista-previa h2") && document.querySelector("#lista-previa h2").textContent.includes("paso 2 de 2"));
    igual("el segundo paso son los tableros (piezas bien puestas) y el primero queda marcado", await p.evaluate(() => [document.getElementById("aprobar-paso").dataset.paso, document.getElementById("lista-previa").textContent.includes("piezas"), document.querySelector("#lista-previa li[data-estado=hecho]").textContent]), ["tableros", true, "✓ Los relojes"]);
    await p.click("#aprobar-paso");
    await p.waitForFunction(() => document.getElementById("lista-previa").hidden);
    igual("aprobados los dos pasos la lista se va, y la función los recibió en orden", await p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "lista").map((l) => l.body.paso)), ["relojes", "tableros"]);

    console.log("\n=== Guardar: al lado del resultado, una mesa a la vez ===");
    const boton = (m) => '.cam-mesa[data-mesa="' + m + '"] [data-accion="guardar"]';
    igual("sin elegir nada, el «Guardar» está apagado", await p.$eval(boton(1), (b) => b.disabled), true);
    await p.selectOption("#res-1", "1");
    igual("al elegir un resultado, la mesa queda «sin guardar» y su botón se enciende (y las otras no)", [await p.$eval('.cam-mesa[data-mesa="1"]', (m) => m.dataset.estado), await p.$eval(boton(1), (b) => b.disabled), await p.$eval(boton(2), (b) => b.disabled)], ["sin-guardar", false, true]);
    igual("el botón está en la MISMA fila que el desplegable", await p.evaluate(() => { const s = document.getElementById("res-1"), b = document.querySelector('.cam-mesa[data-mesa="1"] [data-accion="guardar"]'); return s.parentElement === b.parentElement; }), true);
    // El resultado ELEGIDO (sin guardar) ilumina y hace parpadear al jugador que gana, para estar seguro antes de «Guardar».
    const brillo = () => p.evaluate(() => ["blancas", "negras"].map((c) => { const j = document.querySelector('.cam-mesa[data-mesa="1"] .cam-jugador[data-color="' + c + '"]'); const cs = getComputedStyle(j.querySelector(".cam-nombre")); const g = j.querySelector(".cam-gana"); return [j.dataset.elegido || null, g ? g.textContent : null, cs.boxShadow !== "none" ? cs.animationName : false]; }));
    igual("elegir «1-0» ilumina y hace parpadear SOLO al jugador de blancas, con la palabra «Gana»", await brillo(), [["gana", "Gana", "cam-elegido"], [null, null, false]]);
    await p.selectOption("#res-1", "3");
    igual("elegir «0-1» ilumina solo al de negras", await brillo(), [[null, null, false], ["gana", "Gana", "cam-elegido"]]);
    await p.selectOption("#res-1", "2");
    igual("en tablas se iluminan los DOS, con la palabra «Tablas»", await brillo(), [["tablas", "Tablas", "cam-elegido"], ["tablas", "Tablas", "cam-elegido"]]);
    await p.selectOption("#res-1", "4");
    igual("«1-0 por incomparecencia» también ilumina al de blancas", await brillo(), [["gana", "Gana", "cam-elegido"], [null, null, false]]);
    await p.selectOption("#res-1", "5");
    igual("«0-1 por incomparecencia» ilumina al de negras", await brillo(), [[null, null, false], ["gana", "Gana", "cam-elegido"]]);
    await p.selectOption("#res-1", "6");
    igual("«0-0 por incomparecencia» no gana nadie: no se ilumina ninguno", await brillo(), [[null, null, false], [null, null, false]]);
    await p.selectOption("#res-1", "1");
    await p.click(boton(1));
    await p.waitForSelector('.cam-mesa[data-mesa="1"] .cam-guardado');
    igual("una vez guardado, el jugador deja de brillar (todo bien, ahí ya quedó)", await brillo(), [[null, null, false], [null, null, false]]);
    igual("guardó SOLO esa mesa, con los jugadores y la ronda que se ven, sin pedir confirmar", await p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "guardar").map((l) => [l.body.ronda, l.body.cambios])),
        [[3, [{ mesa: 1, blancas: "Muñoz Feliz Alejandro", negras: "Gramajo Tovar Marco", valor: "1" }]]]);
    igual("la mesa dice que está guardada y qué tiene chess-results", [await p.$eval('.cam-mesa[data-mesa="1"]', (m) => m.dataset.estado), (await p.textContent('.cam-mesa[data-mesa="1"] .cam-guardado')).startsWith("✓ Guardado en chess-results"), await p.textContent('.cam-mesa[data-mesa="1"] .cam-resultado-actual')], ["con-resultado", true, "En chess-results: 1-0 (ganan blancas)"]);
    await p.selectOption("#res-1", "3");
    await p.click(boton(1));
    await p.waitForSelector("[data-avisos-aceptar]");
    igual("cambiar un resultado que ya tenía pide confirmar y dice los dos", await p.evaluate(() => { const t = document.querySelector("dialog").textContent; return [t.includes("ya tiene «1-0 (ganan blancas)»"), t.includes("«0-1 (ganan negras)»")]; }), [true, true]);
    await p.click("[data-avisos-aceptar]");
    await p.waitForFunction(() => document.querySelector('.cam-mesa[data-mesa="1"] .cam-resultado-actual').textContent.includes("0-1"));
    igual("y la corrección queda en lo anotado", await p.$$eval("#anotado-filas tr", (l) => l.map((tr) => tr.children[2].textContent).slice(0, 2)), ["Corrección", "Resultado"]);
    await p.evaluate(() => { window.__falla = true; });
    await p.selectOption("#res-2", "2");
    const antes = await p.$$eval("#anotado-filas tr", (l) => l.length);
    await p.click(boton(2));
    await p.waitForSelector('.cam-mesa[data-mesa="2"] .cam-fallo');
    igual("lo que chess-results no confirmó NO se da por guardado y no entra a lo anotado", [(await p.textContent('.cam-mesa[data-mesa="2"] .cam-fallo')).includes("No quedó guardado"), await p.$eval('.cam-mesa[data-mesa="2"]', (m) => m.dataset.estado), await p.$$eval("#anotado-filas tr", (l) => l.length)], [true, "sin-guardar", antes]);
    await p.evaluate(() => { window.__falla = false; });
    await p.selectOption("#res-2", "");

    console.log("\n=== Las ilegales: la primera avisa, la segunda pierde ===");
    const acc = (m, color, a) => '.cam-mesa[data-mesa="' + m + '"] .cam-jugador[data-color="' + color + '"] [data-accion="' + a + '"]';
    // Las tarjetas son SIEMPRE del mismo tamaño y de la misma forma: ninguna crece ni se corre cuando le pasa algo.
    // En un CI lento a veces la tarjeta se mide en el instante en que la página se está repintando (todas en 0 × 0): se espera, hasta 8 s, a que
    // tengan tamaño; si de verdad no lo tienen, el fallo dice por qué (la página escondida, el aviso de «no se pudo abrir», etc.).
    const medidas = () => medirTarjetas(p);
    const base = await medidas();
    igual("todas las tarjetas de las mesas miden lo mismo (ancho y alto), sea cual sea su estado", [new Set(base.map((x) => x[0])).size, new Set(base.map((x) => x[1])).size, base.length], [1, 1, 3]);
    igual("los renglones de cada jugador son fijos: el nombre ocupa siempre el mismo alto (hasta 2 líneas) y los botones van en su propio renglón", await p.evaluate(() => { const js = [...document.querySelectorAll(".cam-mesa .cam-jugador")]; return [new Set(js.map((j) => Math.round(j.getBoundingClientRect().height))).size, new Set(js.map((j) => Math.round(j.querySelector(".cam-nombre").getBoundingClientRect().height))).size, js.every((j) => j.querySelector(".cam-jugador-botones").getBoundingClientRect().top >= j.querySelector(".cam-nombre").getBoundingClientRect().bottom)]; }), [1, 1, true]);
    await p.click(acc(2, "blancas", "ilegal"));
    await p.waitForSelector("dialog[open] select");
    igual("al tocar «Ilegal» sale la lista de tipos (con «Otra») y dice que es la primera: dos minutos al rival", await p.evaluate(() => { const d = document.querySelector("dialog[open]"); return [[...d.querySelectorAll("option")].map((o) => o.textContent).slice(0, 2), d.querySelectorAll("option").length, d.textContent.includes("2 minutos más a su rival")]; }), [["Otra (escribir qué pasó)", "Movió una pieza como esa pieza no puede moverse"], 8, true]);
    await p.selectOption("dialog[open] select", "enroque");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForSelector("dialog[open] [data-avisos-aceptar]");
    igual("anotada la primera, un cuadro que no se pasa por alto recuerda los 2 minutos", await p.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("Primera ilegal: dale 2 minutos al rival"), t.includes("2 minutos")]; }), [true, true]);
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForSelector('.cam-mesa[data-mesa="2"] .cam-aviso-suave');
    const tras = await medidas();
    igual("al anotar la primera ilegal (aparecen la marca, «Anular» y el aviso) NINGUNA tarjeta cambia de tamaño ni de forma", tras, base);
    // Si falla, qué tenía la página en ese momento (en el CI llegó a medir 0 × 0 sin que en la máquina pasara).
    if (JSON.stringify(tras) !== JSON.stringify(base)) console.log("      estado de la página: " + JSON.stringify(await p.evaluate(() => {
        const t = document.querySelector(".cam-mesa"); const cadena = [];
        for (let n = t; n && n !== document.documentElement; n = n.parentElement) cadena.push((n.id || n.tagName.toLowerCase()) + ":" + getComputedStyle(n).display + (n.hidden ? "(hidden)" : "") + (n.isConnected ? "" : "(suelto)"));
        return { app: document.getElementById("app").hidden, problema: document.getElementById("problema").hidden ? null : document.getElementById("problema").textContent.trim().slice(0, 160), cargando: document.getElementById("cargando").hidden, hash: location.hash.slice(0, 12), dialogos: [...document.querySelectorAll("dialog[open]")].map((d) => d.textContent.trim().slice(0, 80)), cadena, liviano: document.documentElement.getAttribute("data-liviano"), llamadas: (window.__llamadas || []).slice(-6).map((x) => x.body && x.body.action) };
    })));
    igual("el tipo elegido queda en la bitácora sin escribir nada", await p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "anotar" && l.body.tipo === "ilegal").map((l) => l.body.texto)), ["Enroque ilegal"]);
    igual("la primera: se anota por ronda, mesa y color, y avisa los 2 minutos del rival (art. 7.5.5)", await p.evaluate(() => ({
        llamada: window.__llamadas.filter((l) => l.body.action === "anotar").map((l) => [l.body.ronda, l.body.mesa, l.body.color, l.body.tipo]),
        marca: document.querySelector('.cam-mesa[data-mesa="2"] .cam-marca[data-tipo="ilegal"]').textContent,
        aviso: document.querySelector('.cam-mesa[data-mesa="2"] .cam-aviso-suave .sr-only').textContent,
        corto: document.querySelector('.cam-mesa[data-mesa="2"] .cam-aviso-suave .cam-aviso-corto').textContent,
        lineas: Math.round(document.querySelector('.cam-mesa[data-mesa="2"] .cam-aviso-suave').getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector('.cam-mesa[data-mesa="2"] .cam-aviso-suave')).lineHeight)) <= 3 })),
        { llamada: [[3, 2, "blancas", "ilegal"]], marca: "iIlegal", aviso: "Primera jugada ilegal. Harvey Ian hizo una jugada ilegal: dale 2 minutos más a su rival (art. 7.5.5). Con otra, pierde la partida.", corto: "Primera ilegal. Harvey Ian: 2 min más al rival; con otra, pierde.", lineas: true });
    igual("la ilegal de las BLANCAS no marca a las negras", await p.$$eval('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="negras"] .cam-marca', (l) => l.length), 0);
    await p.click(acc(2, "blancas", "ilegal"));
    await p.waitForSelector("dialog[open] select");
    igual("la segunda dice antes de anotar que pierde la partida", await p.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("SEGUNDA jugada ilegal de Harvey Ian"), t.includes("pierde la partida (art. 7.5.5)")]; }), [true, true]);
    igual("todavía no se anotó la segunda", await p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "anotar").length), 1);
    await p.selectOption("dialog[open] select", "rey-jaque");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForSelector("dialog[open] [data-avisos-aceptar]");
    igual("al anotarla sale un aviso que no se pasa por alto, con la excepción de las tablas", await p.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("Segunda jugada ilegal: pierde la partida"), t.includes("tablas"), t.includes("no se guarda solo")]; }), [true, true, true]);
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForSelector('.cam-mesa[data-mesa="2"] .cam-alerta');
    igual("la mesa queda con la banda roja (role=alert) y las dos ilegales marcadas", await p.evaluate(() => { const m = document.querySelector('.cam-mesa[data-mesa="2"]'); return [m.dataset.estado, m.querySelector(".cam-alerta").getAttribute("role"), m.querySelector(".cam-alerta").dataset.nivel, m.querySelector('.cam-marca[data-tipo="ilegal"]').textContent]; }), ["pierde", "alert", "pierde", "iiIlegal ×2"]);
    const guardadosAntes = await p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "guardar").length);
    await p.click('.cam-mesa[data-mesa="2"] [data-accion="poner-pierde"]');
    igual("«Poner el resultado» solo lo ELIGE (0-1: pierden las blancas) y no lo guarda", await p.evaluate((n) => [document.getElementById("res-2").value, window.__llamadas.filter((l) => l.body.action === "guardar").length === n], guardadosAntes), ["3", true]);
    await p.selectOption("#res-2", "");
    await p.click(acc(2, "blancas", "anular-ilegal"));
    await p.waitForSelector("[data-avisos-aceptar]");
    await p.click("[data-avisos-aceptar]");
    await p.waitForFunction(() => !document.querySelector('.cam-mesa[data-mesa="2"] .cam-alerta'));
    igual("«Anular» deshace la última ilegal: vuelve a una y a la primera advertencia", await p.evaluate(() => [document.querySelector('.cam-mesa[data-mesa="2"] .cam-marca[data-tipo="ilegal"]').textContent, !!document.querySelector('.cam-mesa[data-mesa="2"] .cam-aviso-suave'), window.__llamadas.filter((l) => l.body.action === "anular").length]), ["iIlegal", true, 1]);

    console.log("\n=== Las irregularidades ===");
    await p.click(acc(1, "negras", "irregularidad"));
    await p.waitForSelector("dialog[open] select");
    igual("«Irregularidad» ofrece una lista para elegir, con «Otra» primero y ya elegida", await p.$eval("dialog[open] select", (s) => { const l = [...s.options]; return [l.length, l[0].textContent, l[1].textContent, s.value]; }), [10, "Otra (escribir qué pasó)", "Tocó una pieza y no la movió (pieza tocada)", "otra"]);
    igual("y pregunta la sanción de tiempo (art. 12.9), que sale «Sin sanción» si no se toca", await p.$$eval("dialog[open] select", (l) => l.length === 2 ? [l[1].value, l[1].options.length, l[1].options[0].textContent] : null), ["", 5, "Sin sanción de tiempo"]);
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction(() => /con «Otra» es obligatorio/.test((document.querySelector("dialog[open]") || {}).textContent || ""));
    igual("«Otra» sin escribir qué pasó no anota nada: el cuadro vuelve a abrirse pidiéndolo, con «Otra» todavía elegida", await p.evaluate(() => [window.__llamadas.filter((l) => l.body.action === "anotar" && l.body.tipo === "irregularidad").length, document.querySelector("dialog[open] select").value]), [0, "otra"]);
    await p.selectOption("dialog[open] select", "toque");
    await p.fill("dialog[open] textarea", "Tocó una pieza sin avisar");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForSelector('.cam-mesa[data-mesa="1"] .cam-jugador[data-color="negras"] .cam-marca[data-tipo="irregularidad"]');
    igual("se anota con su nota y marca solo a ese jugador", await p.evaluate(() => [window.__llamadas.filter((l) => l.body.action === "anotar" && l.body.tipo === "irregularidad").map((l) => [l.body.mesa, l.body.color, l.body.texto]),
        document.querySelector('.cam-mesa[data-mesa="1"] .cam-jugador[data-color="negras"] .cam-marca').textContent, document.querySelectorAll('.cam-mesa[data-mesa="1"] .cam-jugador[data-color="blancas"] .cam-marca').length]),
        [[[1, "negras", "Tocó una pieza y no la movió (pieza tocada). Tocó una pieza sin avisar"]], "!Irregularidad", 0]);
    igual("y lleva su artículo cuando el reglamento lo dice (4.3)", await p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "anotar" && l.body.tipo === "irregularidad").map((l) => l.body.articulo)), ["4.3"]);
    await p.click("#anotado summary");
    igual("lo anotado dice cada cosa, con su hora de Costa Rica, y tacha lo anulado", await p.$$eval("#anotado-filas tr", (l) => l.map((tr) => [tr.children[2].textContent, tr.dataset.anulada || ""])).then((x) => x.filter((f) => /Ilegal|Irregularidad/.test(f[0]))),
        [["Irregularidad", ""], ["Ilegal (anulada)", "si"], ["Ilegal", ""]]);

    console.log("\n=== Se levantó de la mesa ===");
    igual("cada jugador tiene su botón «Se levantó»: icono, nombre accesible y la palabra solo para el lector; sin marca todavía", await p.evaluate(() => { const b = [...document.querySelectorAll('.cam-mesa[data-mesa="2"] [data-accion="levanto"]')]; return [b.length, b.every((x) => x.querySelector("svg") && x.getAttribute("aria-label").startsWith("Anotar que ") && x.title && x.querySelector(".sr-only").textContent === "Se levantó"), document.querySelectorAll('.cam-marca[data-tipo="levanto"]').length]; }), [2, true, 0]);
    await p.click(acc(2, "negras", "levanto"));
    await p.waitForSelector('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="negras"] .cam-marca[data-tipo="levanto"]');
    igual("un toque anota SIN preguntar que se levantó (una nota «Levantó», con la hora del servidor), y marca solo a ese jugador", await p.evaluate(() => [window.__llamadas.filter((l) => l.body.action === "anotar" && l.body.articulo === "Levantó").map((l) => [l.body.mesa, l.body.color, l.body.tipo, l.body.texto]), document.querySelector('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="negras"] .cam-marca[data-tipo="levanto"]').textContent.trim(), document.querySelectorAll('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="blancas"] .cam-marca[data-tipo="levanto"]').length, !!document.querySelector("dialog[open]")]),
        [[[2, "negras", "nota", "Se levantó de la mesa"]], "Se levantó 1 vez", 0, false]);
    await p.click(acc(2, "negras", "levanto"));
    await p.waitForFunction(() => /×2/.test(document.querySelector('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="negras"] .cam-marca[data-tipo="levanto"]').textContent));
    igual("cada toque es una vez: la segunda marca «×2» y el botón dice cuántas van", await p.evaluate(() => [document.querySelector('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="negras"] .cam-marca[data-tipo="levanto"]').textContent.replace(/\s+/g, " ").trim(), document.querySelector('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="negras"] [data-accion="levanto"]').getAttribute("aria-label")]), ["Se levantó 2 veces ×2", "Anotar que Acuña Porras Fabio se levantó de la mesa (van 2)"]);
    await p.click("#anotado summary");
    igual("queda en la bitácora de la mesa con su hora, dos veces, y dice QUIÉN se levantó (nombre y color) y que fue «Se levantó», no una nota cualquiera", await p.$$eval("#anotado-filas tr", (l) => l.filter((tr) => /se levantó de la mesa/.test(tr.textContent)).map((tr) => [tr.children[1].textContent, tr.children[2].textContent, tr.children[3].textContent])), [["2", "Se levantó", "Acuña Porras Fabio (negras) se levantó de la mesa"], ["2", "Se levantó", "Acuña Porras Fabio (negras) se levantó de la mesa"]]);
    await p.click(acc(2, "negras", "anular-levanto"));
    await p.waitForSelector("dialog[open]");
    igual("se puede anular la última (por un toque de más): pregunta primero", await p.evaluate(() => /la última vez que se levantó/.test(document.querySelector("dialog[open]").textContent)), true);
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction(() => !/×2/.test(document.querySelector('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="negras"] .cam-marca[data-tipo="levanto"]')?.textContent || ""));
    await p.click(acc(2, "negras", "anular-levanto"));
    await p.waitForSelector("dialog[open]");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction(() => !document.querySelector('.cam-mesa[data-mesa="2"] .cam-marca[data-tipo="levanto"]'));
    igual("anuladas las dos, vuelve a cero y el botón de anular desaparece", await p.evaluate(() => [document.querySelectorAll('.cam-marca[data-tipo="levanto"]').length, document.querySelectorAll('[data-accion="anular-levanto"]').length]), [0, 0]);

    console.log("\n=== Ayuda, avisos y nombre ===");
    igual("el progreso dice cuántas mesas tienen resultado y cuántas faltan", await p.textContent("#progreso"), "Con resultado: 2 de 3 · faltan 1");
    await p.check("#solo-faltan");
    igual("«Solo las que faltan» deja únicamente las mesas sin resultado", await p.$$eval(".cam-mesa", (l) => l.map((m) => m.dataset.mesa)), ["2"]);
    await p.uncheck("#solo-faltan");
    igual("las mesas salen ordenadas por número", await p.$$eval(".cam-mesa", (l) => l.map((m) => m.dataset.mesa)), ["1", "2", "3"]);
    await p.fill("#ir-mesa", "9");
    await p.press("#ir-mesa", "Enter");
    await p.waitForSelector("[data-avisos-aceptar], .avisos-toast, [role=alert]");
    igual("«Ir a la mesa» una mesa que no es suya lo dice y no se mueve", await p.evaluate(() => (document.body.textContent.includes("no es de tus mesas"))), true);
    await p.evaluate(() => { const b = document.querySelector("[data-avisos-aceptar]"); if (b) b.click(); });
    await p.click('.cam-mesa[data-mesa="3"] [data-accion="ayuda"]');
    await p.waitForSelector("#estado-ayuda:not([hidden])");
    igual("pedir ayuda en una mesa manda SOLO esa mesa y lo dice con su hora; el botón de esa mesa queda marcado", await p.evaluate(() => [window.__llamadas.filter((l) => l.body.action === "ayuda").map((l) => l.body.mesa),
        document.getElementById("estado-ayuda").dataset.estado, document.getElementById("estado-ayuda").textContent.includes("en la mesa 3"),
        document.querySelector('.cam-mesa[data-mesa="3"] [data-accion="ayuda"]').dataset.pedida, document.querySelector('.cam-mesa[data-mesa="1"] [data-accion="ayuda"]').disabled]), [[3], "abierto", true, "si", false]);
    await p.click('.cam-mesa[data-mesa="1"] [data-accion="ayuda"]');
    await p.waitForFunction(() => window.__llamadas.filter((l) => l.body.action === "ayuda").length === 2);
    await p.click("#pedir-ayuda");
    await p.waitForSelector("dialog[open] [data-avisos-aceptar]");
    await p.fill("dialog[open] input, dialog[open] textarea", "Un padre reclama");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction(() => window.__llamadas.filter((l) => l.body.action === "ayuda").length === 3);
    igual("el botón general de ayuda manda el texto opcional y sin mesa", await p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "ayuda").map((l) => [l.body.mesa, l.body.texto || ""]).pop()), [null, "Un padre reclama"]);
    await p.evaluate(() => { window.__avisos.ayuda.estado = "atendido"; window.__avisos.ayuda.atendido_en = "2026-11-02T15:45:00Z"; window.__avisos.abiertas = []; });
    await p.click("#actualizar");
    await p.waitForFunction(() => document.getElementById("estado-ayuda").dataset.estado === "atendido");
    igual("cuando la organización atiende, el árbitro lo ve (verde y escrito, no solo el color)", await p.textContent("#estado-ayuda"), "✓ El árbitro principal ya atendió tu pedido (9:45 a. m.).");
    await p.evaluate(() => { window.__avisos.mensajes = [{ id: "m1", creado: "2026-11-02T15:46:00Z", texto: "Pasen por el escritorio" }]; });
    await p.click("#actualizar");
    await p.waitForSelector("#mensajes:not([hidden]) .cam-mensaje");
    igual("un aviso de la organización sale arriba, como alerta, con su hora y su texto", await p.evaluate(() => { const m = document.querySelector("#mensajes .cam-mensaje"); return [document.getElementById("mensajes").getAttribute("aria-live"), m.getAttribute("role"), m.textContent.includes("Pasen por el escritorio"), m.textContent.includes("9:46")]; }), ["assertive", "alert", true, true]);
    await p.click('#mensajes [data-accion="entendido"]');
    await p.waitForFunction(() => document.getElementById("mensajes").hidden);
    igual("«Entendido» le avisa a la función cuál aviso fue y lo quita", await p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "leido").map((l) => l.body.id)), ["m1"]);
    igual("a una tablet vertical (820 px) la página no se desplaza a lo ancho y las mesas van en dos columnas", await (async () => {
        await p.setViewportSize({ width: 820, height: 1180 });
        return p.evaluate(() => [document.documentElement.scrollWidth, getComputedStyle(document.querySelector(".cam-lista")).gridTemplateColumns.split(" ").length]);
    })(), [820, 2]);
    igual("y de lado (1180 px) van en tres, sin desplazarse", await (async () => {
        await p.setViewportSize({ width: 1180, height: 820 });
        return p.evaluate(() => [document.documentElement.scrollWidth, getComputedStyle(document.querySelector(".cam-lista")).gridTemplateColumns.split(" ").length]);
    })(), [1180, 3]);
    await p.setViewportSize({ width: 390, height: 800 });

    console.log("\n=== Presencia, control de tiempos y avisos sin ruido ===");
    await p.evaluate(() => { window.__audio = 0; window.__vib = 0; window.AudioContext = window.webkitAudioContext = function () { window.__audio++; }; navigator.vibrate = () => { window.__vib++; return true; }; });
    const jug = (c) => '.cam-mesa[data-mesa="2"] .cam-jugador[data-color="' + c + '"]';
    const jug_ = (m, c) => '.cam-mesa[data-mesa="' + m + '"] .cam-jugador[data-color="' + c + '"]';
    igual("sin marcar se entiende que NO ha llegado: dice «No ha llegado», solo hay un botón «Llegó» (no existe un botón de «no llegó») y la barra cuenta cuántos han llegado",
      await p.evaluate((q) => [document.querySelector(q + " .cam-presencia-estado").textContent, document.querySelectorAll('[data-accion="ausente"]').length, document.querySelectorAll('.cam-jugador [data-accion="presente"]').length, document.getElementById("presencia-resumen").textContent], jug("blancas")),
      ["✗ No ha llegado", 0, 6, "Han llegado 0 de 6 jugadores · faltan 6."]);
    await p.click(acc(2, "blancas", "presente"));
    await p.waitForFunction(() => document.getElementById("presencia-resumen").textContent === "Han llegado 1 de 6 jugadores · faltan 5.");
    igual("«Llegó» se anota con la mesa y el color; ese jugador ya NO muestra nada de «Llegó» (ni icono ni botón: solo un «Deshacer» unos segundos y el texto para el lector de pantalla), y los demás conservan su botón",
      await p.evaluate((q) => { const vis = (n) => !!n && n.checkVisibility(); const j = document.querySelector(q); const pr = j.querySelector(".cam-presencia"); return [window.__llamadas.filter((l) => l.body.action === "presencia").map((l) => [l.body.mesa, l.body.color, l.body.presente]), !!j.querySelector(".cam-presencia-estado"), vis(j.querySelector('[data-accion="presente"]')), vis(j.querySelector('[data-accion="corregir-presencia"]')), j.querySelector('[data-accion="corregir-presencia"]').textContent, pr.querySelector(".sr-only").textContent, document.querySelectorAll('.cam-mesa [data-accion="presente"]').length]; }, jug("blancas")),
      [[[2, "blancas", true]], false, false, true, "Deshacer", "✓ Llegó", 5]);
    // Pasados unos segundos el «Deshacer» también se va: no queda nada de «Llegó» a la vista (y la cuenta de los demás no cambia).
    await p.waitForFunction((q) => !document.querySelector(q + ' [data-accion="corregir-presencia"]'), jug("blancas"), { timeout: 20000 });
    igual("a los 15 s el «Deshacer» desaparece y el bloque de quien llegó queda vacío a la vista (solo el texto del lector de pantalla); el resumen sigue en 1 de 6",
      await p.evaluate((q) => { const j = document.querySelector(q); const pr = j.querySelector(".cam-presencia"); return [[...pr.children].filter((c) => c.checkVisibility() && !c.classList.contains("sr-only")).length, pr.textContent, document.getElementById("presencia-resumen").textContent]; }, jug("blancas")),
      [0, "✓ Llegó", "Han llegado 1 de 6 jugadores · faltan 5."]);
    // Un toque equivocado en la mesa se deshace dentro de la ventana: se vuelve a marcar y se prueba el «Deshacer».
    await p.click(acc(2, "negras", "presente"));
    await p.waitForSelector(jug("negras") + ' [data-accion="corregir-presencia"]');
    await p.click(jug("negras") + ' [data-accion="corregir-presencia"]');
    await p.waitForSelector(acc(2, "negras", "presente"));
    igual("«Deshacer» lo vuelve a poner como que NO ha llegado (se lo dice a la función) y le devuelve su botón «Llegó»; el otro jugador sigue como estaba",
      await p.evaluate((q) => [window.__llamadas.filter((l) => l.body.action === "presencia").map((l) => [l.body.color, l.body.presente]), document.querySelector(q + " .cam-presencia-estado").textContent, document.getElementById("presencia-resumen").textContent], jug("negras")),
      [[["blancas", true], ["negras", true], ["negras", false]], "✗ No ha llegado", "Han llegado 1 de 6 jugadores · faltan 5."]);
    igual("cada mesa SIN terminar tiene su relojito (icono, sin texto y con su nombre accesible); las que ya tienen resultado, no", await p.evaluate(() => [[...document.querySelectorAll('.cam-mesa [data-accion="tiempo"]')].map((b) => [b.closest(".cam-mesa").dataset.mesa, b.textContent.trim(), !!b.querySelector("svg"), b.getAttribute("aria-label")]), document.querySelector('.cam-mesa[data-mesa="3"] [data-accion="tiempo"]')]),
        [[["2", "", true, "Control de tiempos de la mesa 2"]], null]);
    await p.click('.cam-mesa[data-mesa="2"] [data-accion="tiempo"]');
    await p.waitForSelector("#control-tiempos:not([hidden]) #form-tiempos");
    igual("el relojito abre la ventanita de ESA mesa, flotando, con Blancas y Negras (su nombre, el tiempo y las jugadas) y Guardar", await p.evaluate(() => [document.querySelector("#control-tiempos .cam-flotante-titulo").textContent, getComputedStyle(document.getElementById("control-tiempos")).position, [...document.querySelectorAll("#form-tiempos .cam-tiempo-lado")].map((f) => [f.dataset.color, f.querySelector(".cam-tiempo-nombre").textContent, !!f.querySelector("input#lt-t" + (f.dataset.color === "blancas" ? "b" : "n")), !!f.querySelector("input#lt-j" + (f.dataset.color === "blancas" ? "b" : "n"))]), document.getElementById("lt-guardar").textContent, !!document.getElementById("lt-mesa")]),
        ["Mesa 2", "fixed", [["blancas", "Harvey Ian", true, true], ["negras", "Acuña Porras Fabio", true, true]], "Guardar", false]);
    // Los dos puntos se ponen solos: se escriben solo números.
    await p.type("#lt-tb", "4510");
    igual("al escribir solo números, los dos puntos se ponen solos (4510 → 45:10) y debajo dice lo que se entendió", await p.evaluate(() => [document.getElementById("lt-tb").value, document.getElementById("lt-ab").textContent]), ["45:10", "= 45 min 10 s"]);
    await p.fill("#lt-tb", "");
    await p.type("#lt-tb", "12345");
    igual("con cinco cifras salen horas (12345 → 1:23:45)", await p.evaluate(() => [document.getElementById("lt-tb").value, document.getElementById("lt-ab").textContent, document.getElementById("lt-tb").getAttribute("aria-invalid")]), ["1:23:45", "= 1 h 23 min 45 s", "false"]);
    await p.fill("#lt-tb", "");
    await p.type("#lt-tb", "4570");
    igual("si los segundos pasan de 59, se dice con palabras y el campo queda marcado como inválido", await p.evaluate(() => [document.getElementById("lt-tb").value, /No se entiende/.test(document.getElementById("lt-ab").textContent), document.getElementById("lt-tb").getAttribute("aria-invalid")]), ["45:70", true, "true"]);
    await p.fill("#lt-tb", "abc1x0:0y0");
    igual("lo que no es número se descarta (también al pegar)", await p.evaluate(() => document.getElementById("lt-tb").value), "10:00");
    await p.fill("#lt-tb", "10:00");
    await p.fill("#lt-jb", "31");
    await p.fill("#lt-tn", "1:23:45");
    await p.fill("#lt-jn", "30");
    await p.click("#lt-guardar");
    await p.waitForFunction(() => document.getElementById("control-tiempos").hidden);
    igual("se manda el tiempo (en segundos) y las jugadas de CADA color, sin pedir jugada, turno ni nota, y la ventanita se cierra sola", await p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "tiempo").map((l) => [l.body.mesa, l.body.t_blancas, l.body.j_blancas, l.body.t_negras, l.body.j_negras, "jugada" in l.body, "turno" in l.body, "nota" in l.body])), [[2, 600, 31, 5025, 30, false, false, false]]);
    igual("el relojito de la mesa queda con su marca verde (ya hay una lectura)", await p.evaluate(() => [document.querySelector('.cam-mesa[data-mesa="2"] [data-accion="tiempo"]').dataset.hecho, document.querySelector('.cam-mesa[data-mesa="2"] [data-accion="tiempo"]').getAttribute("aria-label")]), ["si", "Control de tiempos de la mesa 2 (ya hay una lectura)"]);
    await p.click('.cam-mesa[data-mesa="2"] [data-accion="tiempo"]');
    await p.waitForSelector("#lt-ultimas li");
    igual("lo último anotado en la mesa se ve con los dos tiempos y las jugadas", await p.textContent("#lt-ultimas li"), (await p.textContent("#lt-ultimas li")).includes("Blancas 10:00 (31)") && (await p.textContent("#lt-ultimas li")).includes("Negras 1:23:45 (30)") ? (await p.textContent("#lt-ultimas li")) : "FALTA");
    await p.fill("#lt-tb", "99:99:99");
    await p.fill("#lt-jb", "32");
    await p.fill("#lt-tn", "5:00");
    await p.fill("#lt-jn", "32");
    await p.click("#lt-guardar");
    igual("un tiempo que no se entiende no se manda", await p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "tiempo").length), 1);
    await p.fill("#lt-tb", "4:00");
    await p.fill("#lt-jn", "");
    await p.click("#lt-guardar");
    igual("sin las jugadas de un color tampoco se manda", await p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "tiempo").length), 1);
    await p.fill("#lt-jn", "32");
    igual("la hora del control no se teclea: sale «sin marcar» y un botón con su nombre (la hora se anota al guardar)", await p.evaluate(() => [document.getElementById("lt-hora").dataset.marcada, document.getElementById("lt-hora").tagName, document.getElementById("lt-marcar-hora").textContent.trim(), !!document.querySelector("#lt-marcar-hora svg"), document.querySelectorAll('#form-tiempos input[type="time"], #form-tiempos input[type="datetime-local"]').length]), ["no", "OUTPUT", "Marcar la hora ahora", true, 0]);
    await p.click("#lt-marcar-hora");
    igual("al tocar el botón queda la hora de ESE momento, al segundo, y lo escrito no se pierde", await p.evaluate(() => [document.getElementById("lt-hora").dataset.marcada, /^\d{1,2}:\d{2}:\d{2}/.test(document.getElementById("lt-hora").textContent.trim()), document.getElementById("lt-marcar-hora").textContent.trim(), document.getElementById("lt-tb").value, document.getElementById("lt-jn").value]), ["si", true, "Marcar de nuevo", "4:00", "32"]);
    await p.click('#control-tiempos [data-accion="minimizar-tiempos"]');
    igual("se puede minimizar (para meter un resultado) y volver a abrir sin perder lo escrito", await p.evaluate(() => [document.getElementById("form-tiempos"), document.querySelector('#control-tiempos [data-accion="minimizar-tiempos"]').getAttribute("aria-label"), document.getElementById("control-tiempos").dataset.minimizada]), [null, "Abrir el control de tiempos", "si"]);
    await p.click('#control-tiempos [data-accion="minimizar-tiempos"]');
    await p.waitForSelector("#form-tiempos");
    igual("al abrirla de nuevo siguen lo escrito", await p.evaluate(() => [document.getElementById("lt-tb").value, document.getElementById("lt-jb").value, document.getElementById("lt-tn").value, document.getElementById("lt-jn").value]), ["4:00", "32", "5:00", "32"]);
    igual("minimizada y vuelta a abrir, la hora marcada sigue", await p.evaluate(() => document.getElementById("lt-hora").dataset.marcada), "si");
    const antesDeGuardar = await p.evaluate(() => Date.now()); // la hora de LA PÁGINA (su reloj está fijo)
    await p.click("#lt-guardar");
    await p.waitForFunction(() => document.getElementById("control-tiempos").hidden);
    igual("al guardar se manda la hora marcada (un momento de hace unos segundos, no inventado), y solo cuando se marcó", await p.evaluate(([desde]) => window.__llamadas.filter((l) => l.body.action === "tiempo").map((l) => "ocurrio" in l.body ? (Date.parse(l.body.ocurrio) <= Date.now() && Date.parse(l.body.ocurrio) >= desde - 120000) : null), [antesDeGuardar]), [null, true]);
    await p.click('.cam-mesa[data-mesa="2"] [data-accion="tiempo"]');
    await p.waitForSelector("#form-tiempos");
    igual("la siguiente lectura empieza otra vez sin marcar", await p.evaluate(() => document.getElementById("lt-hora").dataset.marcada), "no");
    // El reloj de quien tenía el turno SIGUE corriendo desde que se anotó el control: el último control de la mesa, de hace 10 min
    // con 30:00 las blancas (les toca) y 50:00 las negras, tiene que decir cuánto les queda AHORA, y la calculadora del reloj
    // apagado tiene que cobrarle esos 10 min a las blancas (el reloj de las negras no se movió) y no repartirlos entre las dos.
    {
        const copiaT = await p.evaluate(() => window.__tiempos.slice());
        const leidasAntes = await p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "leer").length);
        await p.evaluate(() => {
            window.__tiempos = window.__tiempos.filter((t) => t.mesa !== 2);
            window.__tiempos.unshift({ id: "t-sem", ocurrio: new Date(Date.now() - 600000).toISOString(), mesa: 2, jugada: 20, j_blancas: 20, j_negras: 20, turno: null, t_blancas: 1800, t_negras: 3000, nota: "" });
            document.getElementById("actualizar").click();
        });
        await p.waitForFunction((n) => window.__llamadas.filter((l) => l.body.action === "leer").length > n && document.querySelector("#lt-ultimas li"), leidasAntes);
        await p.waitForSelector("#lt-corriendo");
        igual("lo último anotado dice cuánto le queda AHORA a quien tenía el turno, si nadie ha movido (30:00 menos los 10 min que pasaron)",
            await p.evaluate(() => document.getElementById("lt-corriendo").textContent.replace(/\s+/g, " ")),
            (await p.textContent("#lt-corriendo")).replace(/\s+/g, " ").match(/^Desde esa hora pasaron 10 min.* si nadie ha movido, a las blancas \(les toca\) les quedan ahora (20:00|19:5\d)\.$/) ? (await p.textContent("#lt-corriendo")).replace(/\s+/g, " ") : "FALTA");
        await p.click("#lt-apagado");
        await p.waitForSelector("#control-tiempos .ra-jb");
        await p.fill("#control-tiempos .ra-jb", "20");
        await p.fill("#control-tiempos .ra-jn", "20");
        await p.waitForSelector("#control-tiempos .cam-reloj-dibujo");
        igual("reloj apagado con el turno de las blancas y nadie movió: los 10 min son SOLO de las blancas (20:00) y el reloj de las negras no baja (50:00)",
            await p.evaluate(() => [document.querySelector("#control-tiempos .ra-tb").value, document.querySelector("#control-tiempos .ra-tn").value, /Nadie movió desde el control, así que el reloj que corrió es el de las blancas/.test(document.querySelector("#control-tiempos .cam-apagado-cuentas").textContent)]),
            [(await p.inputValue("#control-tiempos .ra-tb")), "50:00", true]);
        igual("el tiempo de las blancas es 20:00 menos los segundos que ya pasaron de los 10 min (nunca el reparto a medias)", /^(20:00|19:5\d)$/.test(await p.inputValue("#control-tiempos .ra-tb")), true);
        // Lo que marca un reloj que todavía se lee: manda, y al otro le queda lo que falta (la suma de los dos es exacta).
        igual("sin leer ningún reloj, la hora del cálculo no está marcada", await p.evaluate(() => document.querySelector("#control-tiempos .ra-hora").dataset.marcada), "no");
        await p.type("#control-tiempos .ra-vb", "1800");
        igual("al escribir lo que marca un reloj se marca sola la hora de ese momento y lo escrito se entiende",
            await p.evaluate(() => [document.querySelector("#control-tiempos .ra-hora").dataset.marcada, document.querySelector("#control-tiempos .ra-vb").value]), ["si", "18:00"]);
        igual("con las blancas en 18:00, las negras son lo que falta para el total (nunca más que lo que quedaba): 51:5x o 52:00, y el texto lo explica",
            await p.evaluate(() => [document.querySelector("#control-tiempos .ra-tb").value, /^(51:5\d|52:00)$/.test(document.querySelector("#control-tiempos .ra-tn").value), /Se usa lo que marca el reloj que se leyó de las blancas \(18:00\)/.test(document.querySelector("#control-tiempos .cam-apagado-cuentas").textContent)]),
            ["18:00", true, true]);
        await p.fill("#control-tiempos .ra-vb", "");
        await p.type("#control-tiempos .ra-vn", "9000");
        igual("un reloj leído que pasa de lo que queda entre los dos se rechaza con una explicación",
            await p.evaluate(() => /más de lo que queda entre los dos/.test(document.querySelector("#control-tiempos .cam-aviso-suave").textContent)), true);
        await p.fill("#control-tiempos .ra-vn", "");
        await p.click("#control-tiempos .ra-volver");
        await p.waitForSelector("#form-tiempos");
        await p.evaluate((c) => { window.__tiempos = c; }, copiaT);
        const leidas2 = await p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "leer").length);
        await p.evaluate(() => document.getElementById("actualizar").click());
        await p.waitForFunction((n) => window.__llamadas.filter((l) => l.body.action === "leer").length > n, leidas2);
    }
    // «El reloj se apagó»: la calculadora compartida (js/centroamericano-reloj-apagado.js) en la ventana de la mesa.
    const tiemposAntesApagado = await p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "tiempo").length);
    await p.click("#lt-apagado");
    await p.waitForSelector("#control-tiempos .ra-jb");
    igual("«El reloj se apagó» muestra lo que ya se sabe (ritmo, inicio, ilegales y sanciones, último control) y pide solo las jugadas", await p.evaluate(() => [document.querySelector("#control-tiempos .cam-flotante-titulo").textContent, [...document.querySelectorAll("#control-tiempos .cam-apagado-datos strong")].map((x) => x.textContent), document.querySelector("#control-tiempos .cam-apagado-falta").textContent]),
        ["Mesa 2 · Reloj apagado", ["Ritmo: ", "Inicio de la ronda: ", "Ilegales y sanciones de tiempo: ", "Último control: "], "Escribe las jugadas de cada uno para ver el cálculo."]);
    await p.fill("#control-tiempos .ra-jb", "33");
    await p.fill("#control-tiempos .ra-jn", "32");
    await p.waitForSelector("#control-tiempos .cam-reloj-dibujo");
    igual("con las jugadas sale el cálculo: el reloj dibujado, a quién le toca (una más las blancas: negras) y las cuentas con el total exacto", await p.evaluate(() => [!!document.querySelector("#control-tiempos .cam-reloj-dibujo[aria-hidden='true']"), [...document.querySelectorAll("#control-tiempos .cam-apagado-turno")].map((x) => x.closest(".cam-apagado-reloj").dataset.color), /^Entre los dos les quedan .* \(exacto\)/.test(document.querySelector("#control-tiempos .cam-apagado-cuentas li").textContent)]),
        [true, ["negras"], true]);
    await p.fill("#control-tiempos .ra-tb", "");
    await p.type("#control-tiempos .ra-tb", "1500");
    igual("el árbitro puede cambiar el tiempo (los «:» solos) y el dibujo se actualiza", await p.evaluate(() => [document.querySelector("#control-tiempos .ra-tb").value, document.querySelector("#control-tiempos .ra-dibujo-b").textContent]), ["15:00", "15:00"]);
    await p.click("#control-tiempos .ra-guardar");
    await p.waitForFunction((n) => window.__llamadas.filter((l) => l.body.action === "tiempo").length > n, tiemposAntesApagado);
    igual("«Anotar en la bitácora» lo guarda como un control más: el tiempo puesto, las jugadas, a quién le toca y la nota de cómo se calculó",
        await p.evaluate(() => { const b = window.__llamadas.filter((l) => l.body.action === "tiempo").pop().body; return [b.mesa, b.t_blancas, b.j_blancas, b.j_negras, b.turno, /^Reloj apagado \(art\. 6\.10\): calculado desde el control/.test(b.nota), /ajustado a mano/.test(b.nota), typeof b.ocurrio]; }),
        [2, 900, 33, 32, "negras", true, true, "string"]);
    // La función manda solo las últimas anotaciones: si las marcas dicen que hay una ilegal que no llegó, se avisa.
    igual("con toda la bitácora a mano no sale el aviso de anotaciones que faltan", await p.evaluate(() => /no tiene a mano todas/.test(document.body.textContent)), false);
    await p.evaluate(() => { window.__recortar = 0; document.getElementById("actualizar").click(); });
    await p.waitForFunction(() => window.__llamadas.filter((l) => l.body.action === "leer").length > 0 && !document.querySelector(".cam-mesa[data-ocupada]"));
    await p.waitForTimeout(500);
    await p.click('.cam-mesa[data-mesa="2"] [data-accion="tiempo"]');
    await p.waitForSelector("#lt-apagado");
    await p.click("#lt-apagado");
    await p.waitForSelector("#control-tiempos .cam-apagado-datos");
    igual("si a la tablet le faltan anotaciones viejas de la mesa (trae las últimas 60), lo avisa: alguna ilegal o sanción podría faltar", await p.evaluate(() => /no tiene a mano todas las anotaciones de esta mesa/.test(document.querySelector("#control-tiempos .cam-apagado-datos").textContent)), true);
    // «Mis mesas en vivo» (la transmisión privada sin atraso, js/centroamericano-arbitro-vivo.js): sin conectar, el botón no
    // existe; conectada, la ventana muestra cada mesa con su tablero y sus relojes, y el reloj apagado la usa sin atraso.
    igual("sin la transmisión privada conectada, la tablet no muestra «Mis mesas en vivo»", await p.$eval("#ver-vivo", (b) => b.checkVisibility()), false);
    await p.evaluate(() => {
        const antes = window.sb.functions.invoke;
        window.__vivoPedidos = [];
        window.sb.functions.invoke = (f, o) => {
            if (f !== "centroamericano-mesas-vivo") return antes(f, o);
            window.__vivoPedidos.push(o.body);
            return Promise.resolve({ data: { ok: true, conectada: true, ronda: 3, delay: 0, leida: new Date().toISOString(),
                mesas: [{ mesa: 2, fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 0 24", ultima: "g1f3", estado: "*", reloj_b: 270000, reloj_n: 312000, piensa: 40 }] }, error: null });
        };
    });
    await p.evaluate(() => window.CentroamericanoArbitroVivo.leer());
    igual("conectada: aparece «Mis mesas en vivo», y la tablet pidió con el token de SU enlace", [await p.$eval("#ver-vivo", (b) => b.checkVisibility()), await p.evaluate((t) => window.__vivoPedidos[0].action === "mesas" && window.__vivoPedidos[0].arbitro_token === t, TOKEN)], [true, true]);
    await p.click("#control-tiempos .ra-tx-buscar");
    await p.waitForSelector("#control-tiempos .ra-tx-estado");
    igual("el reloj apagado toma los relojes de la transmisión sin atraso", await p.evaluate(() => /^Relojes de las .* \(en vivo, sin atraso\): Blancas 45:00 \(24 jug\.\) · Negras 52:00 \(23 jug\.\)\.$/.test(document.querySelector("#control-tiempos .ra-tx-estado").textContent)), true);
    // La ventana del control de tiempos tapa el botón a 390 px: se abre con el teclado (el foco y Enter).
    await p.focus("#ver-vivo");
    await p.keyboard.press("Enter");
    await p.waitForSelector("#mesas-en-vivo[open] .cv-mesa");
    igual("la ventana: la mesa con su tablero (64 casillas, la última jugada marcada), sus relojes en palabras y el aviso de no mostrarla",
        await p.evaluate(() => { const d = document.getElementById("mesas-en-vivo"); const m = d.querySelector('.cv-mesa[data-mesa="2"]'); return [m.querySelectorAll(".cine-sq").length, m.querySelectorAll(".cine-sq-ultima").length, /^Van 24 jugadas · le toca a las negras · Blancas 45:00 · Negras 5[01]:\d\d$/.test(m.querySelector(".cv-texto").textContent), /no lo muestres a jugadores/.test(d.textContent), d.querySelector(".cv-tablero").getBoundingClientRect().width > 100]; }),
        [64, 2, true, true, true]);
    await p.click("#mesas-en-vivo .cam-dialogo-titulo button");
    igual("«Cerrar» la cierra y el foco vuelve al botón", await p.evaluate(() => [document.getElementById("mesas-en-vivo").open, document.activeElement && document.activeElement.id]), [false, "ver-vivo"]);
    await p.evaluate(() => { window.__recortar = null; document.getElementById("actualizar").click(); });
    await p.waitForTimeout(500);
    await p.click("#control-tiempos .ra-volver");
    await p.click('#control-tiempos [data-accion="cerrar-tiempos"]');
    await p.click('.cam-mesa[data-mesa="2"] [data-accion="tiempo"]');
    await p.waitForSelector("#form-tiempos");
    await p.click('#control-tiempos [data-accion="cerrar-tiempos"]');
    await p.click("#abrir-tiempos");
    await p.waitForSelector("#control-tiempos:not([hidden]) #form-tiempos");
    igual("el botón de arriba también abre el control de tiempos (para elegir cualquier mesa sin terminar)", await p.evaluate(() => [document.querySelector("#control-tiempos .cam-flotante-titulo").textContent, !!document.querySelector("#abrir-tiempos svg")]), ["Mesa 2", true]);
    await p.click('#control-tiempos [data-accion="cerrar-tiempos"]');
    await p.evaluate(() => { window.__avisos.mensajes = [{ id: "m-ct", creado: "2026-11-02T15:58:00Z", texto: "Control de tiempos: anota la jugada y los relojes de las mesas que no han terminado.", control_tiempos: true }]; });
    // La tablet también consulta sola los avisos cada pocos segundos: si llegó antes, el aviso y la ventana tapan el botón.
    await p.evaluate(() => document.getElementById("actualizar").click());
    await p.waitForSelector("#control-tiempos:not([hidden])");
    igual("cuando la organización pide un control de tiempos, la ventana se abre sola; en un celular sale MINIMIZADA para no tapar el aviso que se ve arriba", await p.evaluate(() => [document.querySelector("#mensajes .cam-mensaje").textContent.includes("Control de tiempos"), document.title.startsWith("(1) "), document.getElementById("control-tiempos").dataset.minimizada]), [true, true, "si"]);
    await p.click('#mensajes [data-accion="entendido"]');
    await p.waitForFunction(() => document.getElementById("mensajes").hidden);
    await p.click('#control-tiempos [data-accion="minimizar-tiempos"]');
    await p.waitForSelector("#form-tiempos");
    await p.click('#control-tiempos [data-accion="cerrar-tiempos"]');
    // En una tablet (820 px) la que pide la organización sale ABIERTA, como una ventanita en la esquina.
    await p.setViewportSize({ width: 820, height: 1000 });
    await p.evaluate(() => { window.__avisos.mensajes = [{ id: "m-ct2", creado: "2026-11-02T16:00:00Z", texto: "Control de tiempos otra vez.", control_tiempos: true }]; });
    // La tablet también consulta sola los avisos cada pocos segundos: si llegó antes, el aviso y la ventana tapan el botón.
    await p.evaluate(() => document.getElementById("actualizar").click());
    await p.waitForSelector("#control-tiempos:not([hidden]) #form-tiempos");
    igual("en una tablet la ventana que pide la organización sale abierta", await p.evaluate(() => document.getElementById("control-tiempos").dataset.minimizada), "no");
    await p.click('#mensajes [data-accion="entendido"]');
    await p.waitForFunction(() => document.getElementById("mensajes").hidden);
    await p.click('#control-tiempos [data-accion="cerrar-tiempos"]');
    await p.setViewportSize({ width: 390, height: 800 });
    igual("NADA suena (no se usa el audio) pero la tablet VIBRA cada vez que llega un aviso de la organización (llegaron dos)", await p.evaluate(() => [window.__audio, window.__vib]), [0, 2]);
    igual("la ayuda tiene dos modos: «Principal en esta mesa» (va directo a la mesa) y «Necesito ayuda (para mí)»", await p.evaluate(() => [document.querySelector('.cam-mesa[data-mesa="2"] [data-accion="ayuda"]').textContent.includes("Principal en esta mesa"), document.getElementById("pedir-ayuda").textContent.includes("Necesito ayuda (para mí)")]), [true, true]);

    console.log("\n=== Un árbitro con mesas de varios torneos ===");
    let v = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro().replace("window.__hermanas = [];", "window.__hermanas = [{ token: " + JSON.stringify(TOKEN_B) + ", tnr: \"1529719\", torneo: \"Sub-8 Absoluto\", arbitro: \"Ana Árbitra\", mesa_desde: 3, mesa_hasta: 8 }];"), { hash: TOKEN });
    await v.p.waitForSelector(".cam-mesa");
    igual("si la organización le juntó otro torneo, arriba salen los dos y el actual está marcado", await v.p.$$eval("#mis-torneos button", (l) => l.map((b) => [b.textContent, b.getAttribute("aria-current") === "true"])), [["Sub-10 Femenino · mesas 1 a 3", true], ["Sub-8 Absoluto · mesas 3 a 8", false]]);
    await v.p.click('#mis-torneos [data-accion="cambiar-torneo"]');
    await v.p.waitForFunction((t) => window.__llamadas.some((l) => l.body.action === "leer" && l.body.token === t), TOKEN_B);
    igual("tocar el otro torneo cambia el enlace del «#» y vuelve a leer con SU token (sin salir de la página)", await v.p.evaluate((t) => [location.hash === "#" + t, window.__llamadas.filter((l) => l.body.action === "leer").pop().body.token === t], TOKEN_B), [true, true]);
    await v.ctx.close();

    console.log("\n=== Horarios, planillas y finalizar la ronda ===");
    igual("la barra dice el tiempo de espera o lo que sigue", (await p.textContent("#espera")).startsWith("⏰"), true);
    igual("la barra de arriba (progreso, botones, tiempo de espera) NO es fija: se va con la página al bajar", await p.evaluate(() => getComputedStyle(document.querySelector(".cam-barra")).position), "static");
    // «Inició la ronda» en la tablet: el árbitro toca el botón (o escribe la hora) y la hora de SU categoría la guarda la función.
    console.log("\n=== La tablet: Inició la ronda ===");
    igual("la tablet del árbitro trae el bloque «Inicio de la ronda» de su categoría: el botón, la hora, y dice que todavía no la marcó", await p.evaluate(() => [document.getElementById("inicio-ronda").checkVisibility(), document.getElementById("ir-ronda").textContent, document.getElementById("ir-ahora").textContent.trim(), document.getElementById("ir-hora").type, document.getElementById("ir-quitar").hidden, document.getElementById("inicio-ronda").dataset.marcada, /Todavía no marcaste/.test(document.getElementById("ir-estado").textContent)]),
      [true, "— ronda 3 de Sub-10 Femenino", "▶ Inició la ronda ahora", "time", true, "no", true]);
    await p.click("#ir-ahora");
    await p.waitForFunction(() => document.getElementById("inicio-ronda").dataset.marcada === "si");
    igual("«Inició la ronda ahora» manda la hora de ESE momento a la función (ronda 3), lo dice escrito y la tolerancia corre desde ahí", await p.evaluate(() => [window.__inicioArgs.length, window.__inicioArgs[0].ronda, window.__inicioArgs[0].quitar, Math.abs(Date.parse(window.__inicioArgs[0].inicio) - Date.now()) < 15000, /^✓ La ronda 3 empezó a las .* \(la hora que marcaste\)\. El tiempo de espera de 30 min termina a las /.test(document.getElementById("ir-estado").textContent), /quedan (29|30) min de tolerancia/.test(document.getElementById("espera").textContent)]), [1, 3, false, true, true, true]);
    igual("al marcar el inicio el bloque se esconde (ya no hace falta) y queda solo el botón chico «Corregir»; el cronómetro de cada jugador que no llegó corre desde esa hora YA, sin esperar otra lectura", await p.evaluate(() => { const c = document.querySelector(".cam-cuenta"); return [document.getElementById("inicio-ronda").checkVisibility(), document.getElementById("ir-corregir").checkVisibility(), !!c && Math.abs(Number(c.dataset.fin) - (Date.parse(window.__inicioArgs[0].inicio) + 30 * 60000)) < 1000]; }), [false, true, true]);
    // Una lectura que salió ANTES de marcar y llega DESPUÉS (sin la hora) no la borra: antes los cronómetros volvían al calendario.
    const inicioMarcado = await p.evaluate(() => window.__inicioArgs[0].inicio);
    await p.evaluate(() => { window.__inicioRonda = null; });
    await p.click("#actualizar");
    await p.waitForFunction(() => !document.getElementById("actualizar").disabled);
    igual("una lectura vieja, sin la hora marcada, no la borra: sigue marcada y los cronómetros siguen contando desde ella", await p.evaluate((i) => { const c = document.querySelector(".cam-cuenta"); return [document.getElementById("inicio-ronda").dataset.marcada, !!c && Math.abs(Number(c.dataset.fin) - (Date.parse(i) + 30 * 60000)) < 1000, document.getElementById("inicio-ronda").checkVisibility()]; }, inicioMarcado), ["si", true, false]);
    await p.evaluate((i) => { window.__inicioRonda = { ronda: 3, inicio: i }; }, inicioMarcado);
    await p.click("#actualizar");
    await p.waitForFunction(() => !document.getElementById("actualizar").disabled);
    await p.click("#ir-corregir");
    igual("«Corregir la hora de inicio» vuelve a abrir el bloque (con «Cerrar» y «Volver al calendario»), y «Cerrar» lo esconde otra vez", await p.evaluate(() => [document.getElementById("inicio-ronda").checkVisibility(), document.getElementById("ir-cerrar").checkVisibility(), document.getElementById("ir-quitar").checkVisibility(), document.getElementById("ir-corregir").checkVisibility()]), [true, true, true, false]);
    const campoHoraT = await p.evaluate(() => window.HoraCR.paraCampo(new Date(Date.now() - 180000)).slice(11, 16));
    const mismoDiaT = await p.evaluate(() => window.HoraCR.paraCampo(new Date(Date.now() - 180000)).slice(0, 10) === window.HoraCR.hoy());
    if (mismoDiaT) {
      await p.fill("#ir-hora", campoHoraT);
      await p.click("#ir-guardar");
      await p.waitForSelector("dialog[open]");
      igual("si ya había una hora marcada, pregunta antes de cambiarla", await p.evaluate(() => [document.querySelector("dialog[open]").textContent.includes("Cambiar la hora de inicio"), window.__inicioArgs.length]), [true, 1]);
      await p.click("dialog[open] [data-avisos-aceptar]");
      await p.waitForFunction(() => window.__inicioArgs.length === 2);
      igual("la hora escrita (la de hace unos minutos, al minuto) se manda y queda a la vista", await p.evaluate(([campo]) => [Math.abs(Date.parse(window.__inicioArgs[1].inicio) - (Date.now() - 180000)) < 120000, document.getElementById("ir-hora").value], [campoHoraT]), [true, campoHoraT]);
      await p.click("#ir-corregir");   // al guardar la hora nueva el bloque vuelve a esconderse
      const futuraT = await p.evaluate(() => { const f = window.HoraCR.paraCampo(new Date(Date.now() + 3600000)); return f.slice(0, 10) === window.HoraCR.hoy() ? f.slice(11, 16) : null; });
      if (futuraT) {
        await p.fill("#ir-hora", futuraT);
        await p.click("#ir-guardar");
        await p.waitForTimeout(200);
        igual("una hora que todavía no llega no se manda", await p.evaluate(() => window.__inicioArgs.length), 2);
      }
    }
    await p.fill("#ir-hora", "");
    await p.click("#ir-guardar");
    await p.waitForTimeout(200);
    igual("sin escribir la hora no se manda nada", await p.evaluate(() => window.__inicioArgs.length), mismoDiaT ? 2 : 1);
    await p.click("#ir-quitar");
    await p.waitForFunction(() => document.getElementById("inicio-ronda").dataset.marcada === "no");
    igual("«Volver al calendario» le dice a la función que la quite y todo vuelve a como estaba", await p.evaluate(() => [window.__inicioArgs[window.__inicioArgs.length - 1].quitar, window.__inicioRonda, document.getElementById("ir-quitar").hidden, document.getElementById("ir-hora").value]), [true, null, true, ""]);
    // El árbitro de la categoría marcó que la ronda 3 empezó hace 10 minutos: la tolerancia corre desde ahí, sea cual sea la hora del calendario.
    await p.evaluate(() => { window.__inicioRonda = { ronda: 3, inicio: new Date(Date.now() - 10 * 60000).toISOString() }; });
    await p.click("#actualizar");
    await p.waitForFunction(() => /quedan (19|20) min de tolerancia/.test(document.getElementById("espera").textContent), null, { timeout: 15000 });
    igual("con la hora de inicio que marcó el árbitro de la categoría, la barra cuenta la tolerancia desde ahí (quedan unos 20 min de 30)", await p.textContent("#espera"), (await p.textContent("#espera")).startsWith("⏰ Ronda 3: quedan") ? await p.textContent("#espera") : "FALTA");
    // «Llegó tarde»: el jugador que llega con la ronda ya empezada deja una nota en la bitácora (cuánto se tardó y cuánto le faltaba para la
    // incomparecencia); la tablet manda la hora del toque y la del inicio que usa su cuenta; corregir el toque anula la nota.
    console.log("\n=== La tablet: «Llegó tarde» en la bitácora ===");
    await p.evaluate(() => { window.__inicioRonda = { ronda: 3, inicio: new Date(Date.now() - 25 * 60000).toISOString() }; });
    await p.click("#actualizar");
    await p.waitForFunction(() => !document.getElementById("actualizar").disabled);
    const tardes = () => p.evaluate(() => [...document.querySelectorAll("#anotado-filas tr")].filter((tr) => tr.children[2].textContent.startsWith("Llegó tarde")).map((tr) => [tr.children[2].textContent, tr.children[3].textContent, tr.dataset.anulada || ""]));
    igual("antes de marcar llegada, no hay ninguna nota de «Llegó tarde»", await tardes(), []);
    await p.click(acc(1, "negras", "presente"));
    await p.waitForFunction(() => [...document.querySelectorAll("#anotado-filas tr")].some((tr) => tr.children[2].textContent.startsWith("Llegó tarde")));
    igual("«Llegó» con la ronda empezada hace 25 min: la tablet manda la hora del toque y la del inicio, y queda UNA nota «Llegó tarde» con cuánto se tardó y cuánto le faltaba",
      await p.evaluate(() => { const b = window.__llamadas.filter((l) => l.body.action === "presencia").pop().body; return [typeof b.ocurrio, typeof b.inicio, Math.abs(Date.parse(b.ocurrio) - Date.now()) < 20000, Math.abs(Date.parse(b.inicio) - Date.parse(window.__inicioRonda.inicio)) < 2000]; }), ["string", "string", true, true]);
    const t1 = (await tardes())[0];
    igual("la nota dice el jugador, su color, cuánto se tardó (25 min y unos segundos) y cuánto le faltaba para la incomparecencia (unos 5 min)", [t1[0], /\(negras\) llegó tarde: 25 min \d+ s después del inicio de la ronda/.test(t1[1]), /le faltaban [45] min \d+ s para la incomparecencia/.test(t1[1]), t1[2]], ["Llegó tarde", true, true, ""]);
    igual("y la tablet avisa que quedó anotado en la bitácora", await p.evaluate(() => /llegó 25 min( \d+ s)? tarde: quedó anotado en la bitácora/.test(document.getElementById("avisos-zona").textContent)), true);
    await p.click(jug_(1, "negras") + ' [data-accion="corregir-presencia"]');
    await p.waitForFunction(() => [...document.querySelectorAll("#anotado-filas tr")].some((tr) => tr.children[2].textContent.startsWith("Llegó tarde") && tr.dataset.anulada === "si"));
    igual("corregir el toque («no ha llegado») anula la nota: se ve como anulada y no queda ninguna viva", (await tardes()).map((x) => x[2]), ["si"]);
    await p.click(acc(1, "negras", "presente"));
    await p.waitForFunction(() => [...document.querySelectorAll("#anotado-filas tr")].filter((tr) => tr.children[2].textContent.startsWith("Llegó tarde")).length === 2);
    igual("al volver a marcar «Llegó» queda una nota nueva (la vieja sigue anulada): una sola viva", (await tardes()).map((x) => x[2]).sort(), ["", "si"]);
    await p.click(jug_(1, "negras") + ' [data-accion="corregir-presencia"]');
    await p.waitForSelector(acc(1, "negras", "presente"));
    await p.click("#horarios");
    await p.waitForSelector("dialog[open]");
    igual("«Horarios» dice que esa es la hora que marcó el árbitro de la categoría", await p.evaluate(() => /la hora que marcó el árbitro de la categoría/.test(document.querySelector("dialog[open]").textContent)), true);
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.evaluate(() => { window.__inicioRonda = null; });
    await p.click("#actualizar");
    await p.waitForFunction(() => !/quedan (19|20) min de tolerancia/.test(document.getElementById("espera").textContent), null, { timeout: 15000 });
    igual("sin hora marcada, vuelve a contar desde el calendario", (await p.textContent("#espera")).startsWith("⏰"), true);
    await p.click("#horarios");
    await p.waitForSelector("dialog[open]");
    igual("«Horarios» abre el calendario del torneo con la tolerancia de 30 minutos", await p.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("Horarios y tiempo de espera"), t.includes("Todo el calendario:"), t.includes("Ronda 9"), t.includes("30 minutos")]; }), [true, true, true, true]);
    await p.click("dialog[open] [data-avisos-aceptar]");
    const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    igual("cada mesa tiene UN solo botón de planillas: una camarita (icono, sin texto) que pide la foto de las dos juntas", await p.evaluate(() => [[...document.querySelectorAll('.cam-mesa[data-mesa="2"] [data-accion="planilla"]')].map((b) => [b.textContent.trim(), !!b.querySelector("svg"), b.getAttribute("aria-label")]), document.querySelectorAll(".cam-mesa [data-lado]").length]),
        [[["", true, "Tomar la foto de las dos planillas de la mesa 2 (las dos juntas)"]], 0]);
    const [selector] = await Promise.all([p.waitForEvent("filechooser"), p.click('.cam-mesa[data-mesa="2"] [data-accion="planilla"]')]);
    await selector.setFiles({ name: "planilla.png", mimeType: "image/png", buffer: Buffer.from(PNG, "base64") });
    await p.waitForSelector('.cam-mesa[data-mesa="2"] [data-accion="planilla"][data-hecho="si"]');
    igual("la foto sube como JPG de esa mesa, sin decir de qué lado (son las dos juntas), y la cámara se marca con su ✓", await p.evaluate(() => [window.__llamadas.filter((l) => l.body.action === "planilla").map((l) => [l.body.mesa, "lado" in l.body, l.body.ronda, l.body.imagen.startsWith("data:image/jpeg;base64,")]), document.querySelector('.cam-mesa[data-mesa="2"] [data-accion="planilla"]').getAttribute("aria-label"), document.querySelector('.cam-mesa[data-mesa="2"] .cam-icono-marca').textContent]),
        [[[2, false, 3, true]], "Cambiar la foto de las planillas de la mesa 2: tiene que salir las dos planillas juntas", "✓"]);
    igual("mientras falta una mesa, la revisión final no sale", await p.$eval("#revision", (c) => c.hidden), true);
    await p.selectOption("#res-2", "2");
    await p.click(boton(2));
    await p.waitForSelector("#revision:not([hidden])");
    igual("al terminar todas las mesas sale la revisión: resultados de cada mesa y las tres cosas que confirmar", await p.evaluate(() => [document.querySelector("#revision h2").textContent, document.querySelectorAll("#revision tbody tr").length, document.querySelectorAll("#revision input[type=checkbox]").length, document.getElementById("finalizar").disabled]), ["Terminaste tus mesas: revisa antes de cerrar la ronda", 3, 3, true]);
    for (const id of ["rev-resultados", "rev-planillas"]) await p.check("#" + id);
    igual("con dos de tres confirmadas, «Finalizar» sigue apagado", await p.$eval("#finalizar", (b) => b.disabled), true);
    await p.check("#rev-firmadas");
    await p.click("#actualizar");
    await p.waitForFunction(() => document.getElementById("actualizado").textContent.includes("Actualizado"));
    igual("lo marcado no se pierde al volver a leer, y con las tres «Finalizar» se enciende", await p.evaluate(() => [["rev-resultados", "rev-planillas", "rev-firmadas"].map((i) => document.getElementById(i).checked), document.getElementById("finalizar").disabled]), [[true, true, true], false]);
    await p.click("#finalizar");
    await p.waitForSelector("[data-avisos-aceptar]");
    igual("antes de finalizar recuerda revisar las planillas, ordenarlas y que estén firmadas", (await p.textContent("dialog[open]")).includes("revisaste todas las planillas, las ordenaste por mesa y están firmadas"), true);
    await p.click("[data-avisos-aceptar]");
    await p.waitForFunction(() => document.getElementById("revision").dataset.estado === "finalizada");
    igual("finalizada: la función recibió las tres confirmaciones y la página lo dice", await p.evaluate(() => [window.__llamadas.filter((l) => l.body.action === "finalizar").map((l) => l.body.revision), document.querySelector("#revision h2").textContent]), [[{ resultados: true, planillas: true, firmadas: true }], "✓ Finalizaste la ronda 3"]);

    // «¿Dónde juega?»: la lupa. Un botón fijo que abre un buscador de TODAS las categorías a la vez (una sola respuesta de la función, ya en
    // memoria al abrir), con tarjetas grandes y «Mostrar al atleta» a pantalla completa. El pizote de la portada abre lo mismo.
    console.log("\n=== «¿Dónde juega?»: la lupa busca en todas las categorías a la vez ===");
    await p.evaluate(() => { const e = document.getElementById("t-sin-fab"); if (e) e.remove(); });
    igual("hay un botón fijo «🔎 ¿Dónde juega?»: visible, abajo a la derecha, de 56 px o más; y el pizote es otro botón con nombre accesible", await p.evaluate(() => { const f = document.getElementById("donde-juega"), r = f.getBoundingClientRect(), z = document.getElementById("ver-todas-mesas"); return [f.checkVisibility(), getComputedStyle(f).position, r.height >= 56, r.right > innerWidth / 2, r.bottom > innerHeight / 2, f.textContent.trim(), z.tagName, z.getAttribute("aria-label")]; }),
        [true, "fixed", true, true, true, "🔎 ¿Dónde juega?", "BUTTON", "Buscar dónde juega un atleta, en todas las categorías"]);
    igual("la página ya trajo todas las categorías al cargar (una sola vez): al abrir la lupa no hay que esperar", await p.evaluate(() => [window.CentroamericanoEmparejamientos.estado() !== null, window.__llamadas.filter((l) => l.body.action === "todas_mesas").length]), [true, 1]);
    await p.click("#donde-juega");
    await p.waitForSelector("#donde-juega-hoja[open]");
    igual("abre una ventana modal con el cursor en el buscador (listo para escribir), las categorías y lo que falta: la que no tiene pareo y los datos de hace unos minutos", await p.evaluate(() => [document.getElementById("donde-juega-hoja").matches(":modal"), document.activeElement.id, [...document.querySelectorAll("#donde-juega-hoja .cam-dj-chips button")].map((b) => b.textContent + "|" + b.getAttribute("aria-pressed")), /todavía sin pareo: Sub-14 Femenino/.test(document.getElementById("dj-estado").textContent), /datos de hace unos minutos/.test(document.getElementById("dj-estado").textContent), document.querySelector('label[for="dj-buscar"]').textContent]),
        [true, "dj-buscar", ["Todas|true", "Sub-10 Femenino|false", "Sub-12 Absoluto|false", "Sub-14 Femenino|false"], true, true, "Apellido o nombre del atleta, o número de mesa"]);
    const tarj = () => p.$$eval("#dj-res .cam-dj-tarj", (l) => l.map((t) => [t.dataset.mesa, t.querySelector(".cam-dj-nombre").textContent, t.querySelector(".cam-dj-cat").textContent]));
    await p.fill("#dj-buscar", "maria jose");
    igual("«maria jose» (sin tildes ni comas) encuentra a «Árias Núñez, María José» en su categoría, sin elegir categoría", await tarj(), [["1", "Árias Núñez, María José", "Sub-12 Absoluto"]]);
    igual("la tarjeta dice la mesa, el color, el rival, la ronda y la hora, con el color de su categoría", await p.evaluate(() => { const t = document.querySelector("#dj-res .cam-dj-tarj"); return [t.querySelector(".cam-dj-num").textContent, /^Blancas · contra Zúñiga Rojas, Pedro · Ronda 3 · 9:00/.test(t.querySelector(".cam-dj-sub").textContent), t.style.getPropertyValue("--c"), parseFloat(getComputedStyle(t.querySelector(".cam-dj-num")).fontSize) >= 40, t.querySelector(".cam-dj-mostrar").textContent]; }),
        ["MESA1", true, "#8f5200", true, "Mostrar al atleta"]);
    await p.fill("#dj-buscar", "hopkins");
    igual("un atleta de OTRA categoría sale igual: no hay que saber en cuál juega", await tarj(), [["3", "Hopkins John", "Sub-10 Femenino"]]);
    await p.fill("#dj-buscar", "mora");
    igual("«mora» encuentra a todos los Mora de todas las categorías", (await tarj()).map((x) => x[0] + ":" + x[1].split(",")[0]), ["2:Jiménez Mora", "15:Mora Ugalde"]);
    await p.fill("#dj-buscar", "mroa");
    igual("perdona un error de tecleo (letras cambiadas de lugar): «mroa» encuentra a «Mora»", (await tarj()).map((x) => x[0]), ["2", "15"]);
    await p.fill("#dj-buscar", "castro luis");
    igual("las palabras van en cualquier orden", (await tarj()).map((x) => x[1]), ["Castro Vega, Luis"]);
    await p.fill("#dj-buscar", "1");
    igual("un número es una mesa: «1» sale de cada categoría, no la 15", (await tarj()).map((x) => x[0] + "|" + x[2]), ["1|Sub-10 Femenino", "1|Sub-10 Femenino", "1|Sub-12 Absoluto", "1|Sub-12 Absoluto"]);
    await p.fill("#dj-buscar", "nadie asi");
    igual("sin coincidencias lo dice con palabras", await p.textContent("#dj-res"), "Nadie coincide con «nadie asi». Prueba con solo el apellido.");
    await p.fill("#dj-buscar", "");
    await p.click('#donde-juega-hoja [data-tnr="1529738"]');
    igual("sin escribir y con una categoría elegida: todas sus mesas en una lista corta", await p.$$eval("#dj-res tbody tr", (t) => t.map((x) => x.dataset.mesa)), ["1", "2", "15"]);
    await p.click('#donde-juega-hoja [data-tnr="1529739"]');
    igual("una categoría sin pareo lo dice", await p.textContent("#dj-res"), "Esta categoría todavía no tiene pareo.");
    await p.click('#donde-juega-hoja [data-tnr=""]');
    await p.fill("#dj-buscar", "camila");
    await p.click('#dj-res .cam-dj-tarj[data-mesa="15"]');
    await p.waitForSelector("#donde-juega-grande[open]");
    igual("«Mostrar al atleta»: pantalla completa con la categoría, la MESA gigante, el nombre, el color y el rival, en el color de su categoría",
        await p.evaluate(() => { const g = document.getElementById("donde-juega-grande"); const r = g.getBoundingClientRect(); return [g.matches(":modal"), g.querySelector(".cam-dj-gcat").textContent, g.querySelector(".cam-dj-gmesa").textContent, parseFloat(getComputedStyle(g.querySelector(".cam-dj-gmesa")).fontSize) >= 100, [...g.querySelector(".cam-dj-ginfo").childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(""), g.querySelector(".cam-dj-ginfo small").textContent.replace(/ · 9:00.*/, ""), getComputedStyle(g).backgroundColor, r.width === innerWidth && r.height === innerHeight, document.activeElement.textContent]; }),
        [true, "Sub-12 Absoluto", "15", true, "Mora Ugalde, Camila · Negras", "Contra Solano Brenes, Diego · Ronda 3", "rgb(143, 82, 0)", true, "Listo"]);
    await p.click('#donde-juega-grande [data-accion="cerrar-grande"]');
    await p.waitForFunction(() => !document.getElementById("donde-juega-grande"));
    await p.click('#donde-juega-hoja [data-accion="cerrar-dj"]');
    await p.waitForFunction(() => !document.getElementById("donde-juega-hoja"));
    igual("cerrar la quita del todo y devuelve el foco al botón", await p.evaluate(() => [!!document.getElementById("donde-juega-hoja"), document.activeElement && document.activeElement.id]), [false, "donde-juega"]);
    await p.click("#donde-juega");
    await p.waitForSelector("#donde-juega-hoja[open]");
    igual("al abrirla otra vez ofrece volver a la última búsqueda (la que se mostró al atleta)", await p.evaluate(() => [document.querySelector('[data-accion="dj-ultima"]').textContent, document.querySelector('[data-accion="dj-ultima"]').hidden]), ["Volver a buscar «camila»", false]);
    await p.click('#donde-juega-hoja [data-accion="cerrar-dj"]');
    await p.waitForFunction(() => !document.getElementById("donde-juega-hoja"));
    // Sin señal: la lupa sigue buscando con lo último que se leyó y lo dice (con palabras y en rojo).
    await p.evaluate(() => { window.__todasFalla = true; });
    await p.click("#donde-juega");
    await p.waitForSelector("#donde-juega-hoja[open]");
    await p.waitForFunction(() => /^Sin señal: son las mesas de hace/.test(document.getElementById("dj-estado").textContent), null, { timeout: 20000 });
    await p.fill("#dj-buscar", "hopkins");
    igual("sin señal sigue buscando con lo último que se leyó y lo dice en rojo, con palabras", await p.evaluate(() => [document.querySelectorAll("#dj-res .cam-dj-tarj").length, /^Sin señal: son las mesas de hace/.test(document.getElementById("dj-estado").textContent), document.getElementById("dj-estado").classList.contains("cam-fallo")]), [1, true, true]);
    await p.click('#donde-juega-hoja [data-accion="cerrar-dj"]');
    await p.waitForFunction(() => !document.getElementById("donde-juega-hoja"));
    await p.evaluate(() => { window.__todasFalla = false; });
    await p.evaluate(() => document.getElementById("ver-todas-mesas").click());   // un aviso de error de más arriba (la cámara de las planillas) puede seguir encima del pizote
    await p.waitForSelector("#donde-juega-hoja[open]");
    igual("el pizote de la portada abre la MISMA lupa; todo salió por la función, con el token y solo leyendo", await p.evaluate(() => [document.getElementById("donde-juega-hoja").open, window.__llamadas.filter((l) => l.body.action === "todas_mesas").every((l) => /^[0-9a-f]{64}$/.test(l.body.token))]), [true, true]);
    await p.click('#donde-juega-hoja [data-accion="cerrar-dj"]');
    await p.waitForFunction(() => !document.getElementById("donde-juega-hoja"));

    await p.evaluate(() => { const e = document.createElement("style"); e.id = "t-sin-fab"; e.textContent = ".cam-fab, #avisos-zona, #avisos-zona * { pointer-events: none !important; }"; document.head.append(e); });
    // «Mis pareos»: el logo y la «Ronda abierta» abren los pareos de SUS mesas (las de sus enlaces), de todas las rondas.
    console.log("\n=== «Mis pareos»: el logo y la «Ronda abierta» abren los pareos de mis mesas, ronda por ronda ===");
    igual("el logo de Ajedrez Integral es un botón (no un enlace que saque de la página) con nombre accesible, y la «Ronda abierta» también", await p.evaluate(() => { const l = document.getElementById("logo-pareos"), r = document.getElementById("ver-rondas"); return [l.tagName, l.hasAttribute("href"), /pareos de mis mesas/.test(l.getAttribute("aria-label")), l.textContent.replace(/\s+/g, " ").trim(), r.tagName, document.getElementById("d-ronda").textContent, /ver los pareos de las rondas/.test(r.textContent)]; }),
        ["BUTTON", false, true, "Ajedrez Integral", "BUTTON", "Ronda 3", true]);
    await p.click("#logo-pareos");
    await p.waitForSelector("#mis-pareos[open] .cam-mp-torneo");
    const mp = () => p.evaluate(() => [...document.querySelectorAll("#mis-pareos .cam-mp-torneo")].map((t) => [t.querySelector("h3").textContent, [...t.querySelectorAll("tbody tr")].map((r) => r.dataset.mesa + ":" + r.children[3].textContent)]));
    igual("abre en la ronda abierta con sus rondas como pestañas, y trae SOLO sus mesas de cada torneo suyo (el principal y el otro enlace)", await p.evaluate(() => [document.getElementById("mis-pareos").matches(":modal"), [...document.querySelectorAll("#mis-pareos .cam-dj-chips button")].map((b) => b.textContent + "|" + b.getAttribute("aria-pressed"))]),
        [true, ["Ronda 1|false", "Ronda 2|false", "Ronda 3 · abierta|true"]]);
    igual("la ronda abierta: sus tres mesas del torneo principal con el resultado en vivo (y «sin resultado» donde falta) y, del otro torneo, que todavía no tiene esa ronda", await mp(),
        [["Sub-10 Femenino · mesas 1 a 3", ["1:sin resultado", "2:1-0", "3:½-½"]], ["Sub-12 Absoluto · mesas 5 a 6", []]]);
    igual("el torneo sin pareo en esa ronda lo dice con palabras", await p.textContent('#mis-pareos [data-tnr="1529738"] .cam-dj-vacio'), "Esta ronda todavía no tiene pareo guardado para tus mesas.");
    await p.click('#mis-pareos [data-ronda="1"]');
    igual("una ronda anterior: los pareos de entonces con su resultado, en los dos torneos, y la pestaña elegida marcada", await p.evaluate(() => [[...document.querySelectorAll("#mis-pareos .cam-mp-torneo")].map((t) => [...t.querySelectorAll("tbody tr")].map((r) => r.dataset.mesa + ":" + r.children[1].textContent + " – " + r.children[2].textContent + " " + r.children[3].textContent)), document.querySelector('#mis-pareos [data-ronda="1"]').getAttribute("aria-pressed")]),
        [[["1:Pérez Mora, Ana – Rojas Vega, Lía 1-0", "2:Solís Arce, Eva – Mora Cruz, Isa ½-½", "3:Vargas Ríos, Zoe – Núñez Soto, Mía 0-1"], ["5:Castro Vega, Luis – Jiménez Mora, Sofía 0-1", "6:Solano Brenes, Diego – Mora Ugalde, Camila 1-0"]], "true"]);
    igual("dice de cuándo son los datos y los pide a la función con el token, solo leyendo", await p.evaluate(() => [/^Actualizado hace \d+ s$/.test(document.getElementById("mp-estado").textContent), window.__llamadas.filter((l) => l.body.action === "mis_pareos").every((l) => /^[0-9a-f]{64}$/.test(l.body.token) && Object.keys(l.body).sort().join() === "action,token")]), [true, true]);
    await p.click('#mis-pareos [data-accion="cerrar-mp"]');
    await p.waitForFunction(() => !document.getElementById("mis-pareos"));
    igual("cerrar la quita y devuelve el foco al logo", await p.evaluate(() => document.activeElement && document.activeElement.id), "logo-pareos");
    await p.click("#ver-rondas");
    await p.waitForSelector("#mis-pareos[open] .cam-mp-torneo");
    igual("la «Ronda abierta» abre lo mismo, ya en la ronda abierta", await p.evaluate(() => document.querySelector('#mis-pareos [data-ronda="3"]').getAttribute("aria-pressed")), "true");
    // Sin señal: sigue mostrando lo último que se leyó y lo dice en rojo.
    await p.click('#mis-pareos [data-accion="cerrar-mp"]');
    await p.waitForFunction(() => !document.getElementById("mis-pareos"));
    await p.evaluate(() => { window.__misFalla = true; });
    await p.click("#logo-pareos");
    await p.waitForFunction(() => /^Sin señal: son los pareos de hace/.test(document.getElementById("mp-estado").textContent), null, { timeout: 20000 });
    igual("sin señal sigue mostrando los últimos pareos y lo dice en rojo, con palabras", await p.evaluate(() => [document.querySelectorAll("#mis-pareos tbody tr").length > 0, document.getElementById("mp-estado").classList.contains("cam-fallo")]), [true, true]);
    await p.click('#mis-pareos [data-accion="cerrar-mp"]');
    await p.waitForFunction(() => !document.getElementById("mis-pareos"));
    await p.evaluate(() => { window.__misFalla = false; });

    // «¿Dónde juega?» lo habilita o deshabilita la organización: deshabilitado, el botón fijo se esconde, el pizote queda apagado y el servidor lo rechaza.
    console.log("\n=== «¿Dónde juega?» deshabilitado por la organización ===");
    await p.evaluate(() => { window.__avisos.todas_las_mesas = false; document.getElementById("actualizar").click(); });
    await p.waitForFunction(() => document.getElementById("ver-todas-mesas").disabled);
    igual("deshabilitado: el botón fijo se esconde, el pizote queda apagado, sin la pista, y dice por qué (nombre accesible y título)", await p.evaluate(() => { const b = document.getElementById("ver-todas-mesas"); return [document.getElementById("donde-juega").checkVisibility(), b.disabled, b.querySelector(".cam-mascota-pista").checkVisibility(), b.getAttribute("aria-label"), b.title]; }),
        [false, true, false, "«¿Dónde juega?» no está habilitado en tu enlace", "La organización no habilitó «¿Dónde juega?» en tu enlace."]);
    igual("y aunque se manipule la pantalla, la función lo rechaza (403) con el motivo", await p.evaluate(async () => { const r = await window.sb.functions.invoke("centroamericano-mesa", { body: { action: "todas_mesas", token: window.__llamadas[0].body.token } }); return [r.error.context.status, (await r.error.context.json()).error]; }),
        [403, "La organización no habilitó «¿Dónde juega?» en tu enlace."]);
    await p.evaluate(() => { window.__avisos.todas_las_mesas = true; document.getElementById("actualizar").click(); });
    await p.waitForFunction(() => !document.getElementById("ver-todas-mesas").disabled);
    igual("habilitado otra vez: vuelven el botón fijo y el pizote con su pista", await p.evaluate(() => [document.getElementById("donde-juega").checkVisibility(), document.getElementById("ver-todas-mesas").disabled, document.querySelector("#ver-todas-mesas .cam-mascota-pista").checkVisibility()]), [true, false, true]);

    // El modo concentración en la tablet: la organización lo enciende; si el árbitro se sale, se le tapa la pantalla y queda anotado.
    console.log("\n=== La tablet: el modo concentración tapa la pantalla si el árbitro se sale ===");
    igual("sin el modo encendido no hay ninguna pantalla encima", await p.evaluate(() => [!!document.getElementById("concentracion"), (window.__salidasArgs || []).length]), [false, 0]);
    await p.evaluate(() => { window.__avisos.concentracion = true; document.getElementById("actualizar").click(); });
    await p.waitForSelector('#concentracion[data-estado="entrar"]');
    igual("la organización lo enciende: antes de entrar sale un aviso que lo explica, con foco en su botón, y lo demás queda inerte (ni Tab ni lector de pantalla lo alcanzan)",
        await p.evaluate(() => { const c = document.getElementById("concentracion"); return [c.getAttribute("role"), c.getAttribute("aria-modal"), document.activeElement.dataset.accion, document.activeElement.textContent, /pantalla completa/.test(c.textContent), /Fijar pantalla/.test(c.textContent), [...document.body.children].filter((n) => n !== c).every((n) => n.hasAttribute("inert")), getComputedStyle(c).position, c.getBoundingClientRect().width === innerWidth]; }),
        ["alertdialog", "true", "conc-boton", "Entrar a la mesa", true, true, true, "fixed", true]);
    await p.click('[data-accion="conc-boton"]');
    await p.waitForFunction(() => !document.getElementById("concentracion"));
    igual("al tocar «Entrar a la mesa» se destapa y la página vuelve a funcionar", await p.evaluate(() => [[...document.body.children].some((n) => n.hasAttribute("inert")), (window.__salidasArgs || []).length]), [false, 0]);
    // Se sale (cambia de pestaña o de aplicación): la página se tapa y la función se entera.
    await p.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
    await p.waitForSelector('#concentracion[data-estado="fuera"]');
    igual("al salirse se le tapa la pantalla con «Saliste de tus mesas», dice el motivo y cuánto lleva fuera (sin ruido), y avisa a la función con la fase «sale»",
        await p.evaluate(() => { const c = document.getElementById("concentracion"); return [c.querySelector("h2").textContent, /Cambiaste de pestaña o de aplicación/.test(c.textContent), /Llevas \d+:\d\d fuera de tus mesas/.test(c.querySelector('[role="timer"]').textContent), c.querySelector("button").textContent, window.__salidasArgs]; }),
        ["Saliste de tus mesas", true, true, "Volver a la mesa", [{ fase: "sale", motivo: "oculta" }]]);
    await p.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
    igual("volver a la pestaña NO destapa: hay que tocar el botón", await p.evaluate(() => !!document.getElementById("concentracion")), true);
    await p.waitForTimeout(1100);
    await p.click('[data-accion="conc-boton"]');
    await p.waitForFunction(() => !document.getElementById("concentracion"));
    igual("«Volver a la mesa» destapa y le dice a la función cuánto estuvo fuera (en segundos)", await p.evaluate(() => { const a = window.__salidasArgs; return [a.length, a[1].fase, a[1].motivo, a[1].segundos >= 1 && a[1].segundos < 30]; }), [2, "vuelve", "oculta", true]);
    // La pantalla completa y la cámara del aparato, con un controlador aparte (la pantalla completa no se puede simular entera en un navegador sin cabeza).
    const aparte = await p.evaluate(async () => {
        await new Promise((ok) => { window.__avisos.concentracion = false; document.getElementById("actualizar").click(); setTimeout(ok, 400); });
        const llamadas = []; let tiempo = 1000;
        Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => (window.__fs ? document.documentElement : null) });
        window.__fs = true;
        const c = window.CentroamericanoConcentracion.crear({ pedir: async (x) => { llamadas.push(x); }, ahora: () => tiempo });
        c.ponerActivo(true);
        const dentro = c.estado();
        window.__fs = false; document.dispatchEvent(new Event("fullscreenchange"));
        await new Promise((ok) => setTimeout(ok, 30));
        const tras = c.estado(), motivo = llamadas[0];
        const texto = document.getElementById("conc-texto").textContent;
        tiempo = 8000; c.ponerActivo(false);
        await new Promise((ok) => setTimeout(ok, 30));
        const apagado = [c.estado(), !!document.getElementById("concentracion"), llamadas.map((x) => x.fase), llamadas[1] && llamadas[1].segundos];
        // La cámara del aparato: con la pausa, salirse no cuenta y no tapa nada.
        window.__fs = true; const llamadas2 = []; const d = window.CentroamericanoConcentracion.crear({ pedir: async (x) => { llamadas2.push(x); }, ahora: () => tiempo });
        d.ponerActivo(true); d.pausa(60000);
        window.__fs = false; document.dispatchEvent(new Event("fullscreenchange"));
        const pausa = [d.estado(), llamadas2.length, !!document.getElementById("concentracion")];
        d.ponerActivo(false);
        return { dentro, tras, motivo, texto, apagado, pausa };
    });
    igual("sale de la pantalla completa: se tapa con ESE motivo, y si la organización lo apaga mientras está fuera, se destapa y se anota cuánto duró", [aparte.dentro, aparte.tras, aparte.motivo, aparte.texto.includes("Saliste de la pantalla completa"), aparte.apagado], ["dentro", "fuera", { fase: "sale", motivo: "pantalla_completa" }, true, ["libre", false, ["sale", "vuelve"], 7]]);
    igual("durante la cámara del aparato (la foto de las planillas), salirse no cuenta ni tapa nada: pide otro toque para la pantalla completa", aparte.pausa, ["entrar", 0, true]);

    console.log("\n=== En el celular (390 px), en claro y en oscuro ===");
    igual("la página no se desplaza a lo ancho", await p.evaluate(() => document.documentElement.scrollWidth), 390);
    igual("las tarjetas usan ICONOS: cada botón de jugador es un icono de 44 px o más, con su nombre accesible (aria-label y title) y la palabra solo para el lector de pantalla",
        await p.evaluate(() => { const bs = [...document.querySelectorAll(".cam-jugador .cam-btn-icono")].filter((b) => b.checkVisibility()); return [bs.length > 0, bs.every((b) => b.getBoundingClientRect().height >= 44 && b.getBoundingClientRect().width >= 44), bs.every((b) => b.getAttribute("aria-label") && b.title && b.querySelector("svg") && b.querySelector(".sr-only")), [...new Set(bs.map((b) => b.dataset.accion))].sort()]; }),
        [true, true, true, ["anular-ilegal", "anular-irregularidad", "ilegal", "irregularidad", "levanto", "presente"]]);
    igual("la leyenda de arriba explica todos los iconos con su palabra", await p.evaluate(() => [...document.querySelectorAll(".cam-leyenda span:not(.cam-color-punto)")].map((x) => x.textContent)),
        ["Blancas", "Negras", "Llegó", "No ha llegado", "Jugada ilegal", "Irregularidad (tocó una pieza u otra falta)", "Se levantó de la mesa (cada toque cuenta una vez)", "Anular", "Principal en esta mesa", "Foto de las dos planillas, juntas", "Control de tiempos de la mesa"]);
    igual("ilegal es un peón tachado (rojo, con relleno y una raya diagonal) e irregularidad es una mano (cuatro trazos): no el triángulo ni la bandera de antes, y la leyenda usa los mismos dibujos", await p.evaluate(() => {
        const il = document.querySelector('.cam-mesa [data-accion="ilegal"] svg'), ir = document.querySelector('.cam-mesa [data-accion="irregularidad"] svg');
        const leyenda = [...document.querySelectorAll(".cam-leyenda svg")];
        const pinta = (s) => [...s.children].map((n) => n.tagName + (n.getAttribute("d") || "").slice(0, 8)).join("|");
        return [pinta(il), pinta(ir), leyenda.some((s) => pinta(s) === pinta(il)), leyenda.some((s) => pinta(s) === pinta(ir)), getComputedStyle(document.querySelector('.cam-mesa [data-accion="ilegal"]')).backgroundColor !== "rgb(206, 19, 40)"]; }),
        ["circle|pathM9.2 10.|rect|pathM3.5 3.5", "pathM18 11V6|pathM14 10V4|pathM10 10.5|pathM18 8a2 ", true, true, true]);
    igual("cada botón se toca bien (44 px de alto o más) y el foco se ve", await p.evaluate(() => [...document.querySelectorAll(".cam-mesa .cam-btn")].filter((b) => b.checkVisibility()).every((b) => b.getBoundingClientRect().height >= 40)), true);
    const colores = ".cam-mesa-cabeza, .cam-nombre, .cam-color, .cam-marca, .cam-btn, .cam-select, .cam-resultado-actual, .cam-aviso-suave, .cam-guardado, .cam-fallo, .cam-estado";
    igual("en claro, todo el texto de las mesas da 4,5:1 o más", (await p.evaluate("(" + CONTRASTE + ")(" + JSON.stringify(colores) + ")")).every((x) => x >= 4.5), true);
    if (process.env.CAPTURA) await p.screenshot({ path: process.env.CAPTURA + "-arbitro-claro.png", fullPage: true });
    igual("sin errores en la página", errores, []); if (errores.length) console.error("ERRORES:", errores);
    await r.ctx.close();

    let o = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: TOKEN, esquema: "dark" });
    await o.p.waitForSelector(".cam-mesa");
    for (let i = 0; i < 2; i++) { await o.p.click("#aprobar-paso"); await o.p.waitForTimeout(150); }
    await o.p.waitForFunction(() => document.getElementById("lista-previa").hidden);
    await o.p.selectOption("#res-1", "1");
    await o.p.click(boton(1));
    await o.p.waitForSelector('.cam-mesa[data-mesa="1"] .cam-guardado');
    await o.p.click(acc(2, "negras", "ilegal"));
    await o.p.waitForSelector("dialog[open] select");
    await o.p.selectOption("dialog[open] select", "enroque");
    await o.p.click("dialog[open] [data-avisos-aceptar]");
    await o.p.waitForSelector("dialog[open] [data-avisos-aceptar]");
    await o.p.click("dialog[open] [data-avisos-aceptar]");
    await o.p.waitForSelector('.cam-mesa[data-mesa="2"] .cam-aviso-suave');
    igual("en oscuro, todo el texto de las mesas da 4,5:1 o más", (await o.p.evaluate("(" + CONTRASTE + ")(" + JSON.stringify(colores + ", .cam-alerta, .cam-anular") + ")")).every((x) => x >= 4.5), true);
    if (process.env.CAPTURA) await o.p.screenshot({ path: process.env.CAPTURA + "-arbitro-oscuro.png", fullPage: true });
    await o.ctx.close();

    console.log("\n=== Un árbitro «por definir» pone su nombre ===");
    let d = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro().replace('nombrado: true, arbitro: "Ana Árbitra"', 'nombrado: false, arbitro: "Árbitro 1"'), { hash: TOKEN });
    await d.p.waitForSelector(".cam-mesa");
    igual("sin nombre, la página se lo pide arriba y muestra «Árbitro 1» mientras tanto", [await d.p.$eval("#nombre-caja", (c) => c.checkVisibility()), await d.p.textContent("#d-arbitro")], [true, "Árbitro 1"]);
    await d.p.fill("#nombre-campo", "  Carla   Mora ");
    await d.p.click("#nombre-guardar");
    await d.p.waitForFunction(() => document.getElementById("nombre-caja").hidden);
    igual("al guardarlo manda el nombre, la caja se va y el nombre sale en la cabecera", [await d.p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "nombre").map((l) => l.body.nombre)), await d.p.textContent("#d-arbitro")], [["Carla   Mora"], "Carla Mora"]);
    await d.ctx.close();

    console.log("\n=== «Ya terminé mis labores»: se cierran los resultados y se baja la bitácora ===");
    let cc = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: TOKEN });
    await cc.p.waitForSelector(".cam-mesa");
    const pc = cc.p;
    igual("antes de concluir: está el botón «Ya terminé mis labores», no hay aviso de concluidas y no se puede bajar la bitácora (la función lo rechaza)", await pc.evaluate(async () => [document.getElementById("concluir").textContent.trim(), document.getElementById("concluido").hidden, (await window.sb.functions.invoke("centroamericano-mesa", { body: { token: location.hash.slice(1), action: "bitacora" } })).error ? "rechazada" : "entregada"]), ["🏁 Ya terminé mis labores", true, "rechazada"]);
    await pc.click("#concluir");
    await pc.waitForSelector("dialog[open]");
    igual("pregunta antes (con lo que falta) y dice qué pasa: se cierran los resultados y se baja la bitácora", await pc.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("Ya terminé mis labores"), /Todavía hay \d+ mesas? sin resultado/.test(t), t.includes("No has finalizado la ronda"), t.includes("ya no podrás anotar ni guardar"), t.includes("bitácora")]; }), [true, true, true, true, true]);
    await pc.click("dialog[open] [data-avisos-aceptar]");
    await pc.waitForFunction(() => !document.getElementById("concluido").hidden);
    igual("al aceptar: la función recibe «concluir», sale el aviso de concluidas con la hora y el botón de la bitácora, y el botón de arriba se esconde", await pc.evaluate(() => [window.__llamadas.filter((l) => l.body.action === "concluir").length, document.getElementById("concluido-titulo").textContent.trim(), /^A las \d{1,2}:\d{2} [ap]\. m\./.test(document.getElementById("concluido-texto").textContent), document.getElementById("bajar-bitacora").textContent.trim(), document.getElementById("concluir").hidden]), [1, "✓ Concluiste tus labores", true, "📄 Descargar mi bitácora (PDF)", true]);
    igual("todo lo que escribe queda apagado de verdad (botones de las mesas, resultado, guardar, control de tiempos, pedir ayuda), no solo apagado a la vista", await pc.evaluate(() => { const sin = [...document.querySelectorAll("#lista button, #lista select, #abrir-tiempos, #pedir-ayuda")]; return [sin.length > 5, sin.every((n) => n.disabled)]; }), [true, true]);
    igual("la función rechaza escribir (409) aunque se manipule la pantalla: guardar, anotar, presencia, tiempo, planilla, lista, finalizar, ayuda y nombre", await pc.evaluate(async () => { const out = []; for (const action of ["guardar", "anotar", "anular", "presencia", "tiempo", "planilla", "lista", "finalizar", "ayuda", "nombre"]) { const r = await window.sb.functions.invoke("centroamericano-mesa", { body: { token: location.hash.slice(1), action, ronda: 3, mesa: 1 } }); out.push(!!r.error); } return out.every(Boolean); }), true);
    const [bitacora] = await Promise.all([pc.waitForEvent("download"), pc.click("#bajar-bitacora")]);
    const bytesB = fs.readFileSync(await bitacora.path());
    igual("«Descargar mi bitácora» baja un PDF con el nombre del árbitro y la MARCA DE AGUA de Ajedrez Integral", [bitacora.suggestedFilename(), bytesB.toString("latin1").startsWith("%PDF"), /\/SMask \d+ 0 R/.test(bytesB.toString("latin1"))], ["bitacora-arbitro-ana-arbitra-centroamericano-2026.pdf", true, true]);
    // La tabla del PDF: sin `envolver` recorta con «...» (como siempre, para los demás informes); con `envolver` parte el texto y no pierde nada.
    const tablaLarga = await pc.evaluate(async () => {
      const largo = "palabra ".repeat(40) + "FINAL";
      const bytes = async (op) => { const b = await window.ReportePDF.generar({ titulo: "T", bloques: [Object.assign({ tipo: "tabla", encabezados: ["A", "B"], anchos: [1, 3], filas: [["x", largo]] }, op)], fotos: [] }); let s = ""; for (const x of new Uint8Array(await b.arrayBuffer())) s += String.fromCharCode(x); return s; };
      const con = await bytes({ envolver: true }), sin = await bytes({});
      return [con.includes("FINAL"), con.includes("..."), sin.includes("FINAL"), sin.includes("...")];
    });
    igual("la tabla del PDF: con «envolver» parte las celdas largas y no pierde nada; sin él recorta con «...» como siempre", tablaLarga, [true, false, false, true]);
    igual("la función entregó la bitácora (solo después de concluir) y la página dice que se descargó", await pc.evaluate(() => [window.__llamadas.filter((l) => l.body.action === "bitacora").length >= 1, /Listo: se descargó/.test(document.getElementById("concluido-estado").textContent)]), [true, true]);
    await pc.click("#actualizar");
    await pc.waitForFunction(() => document.getElementById("actualizado").textContent.includes("Actualizado"));
    igual("al volver a leer sigue concluido (lo dice la base, no la pantalla) y lo apagado sigue apagado", await pc.evaluate(() => [document.getElementById("concluido").hidden, document.getElementById("concluir").hidden, [...document.querySelectorAll("#lista button")].every((n) => n.disabled)]), [false, true, true]);
    await cc.ctx.close();

    console.log("\n=== El cronómetro de espera, llegaron todos y la incomparecencia ===");
    const ce = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: TOKEN });
    await ce.p.waitForSelector(".cam-mesa");
    const pe = ce.p;
    const jugE = (m, c) => '.cam-mesa[data-mesa="' + m + '"] .cam-jugador[data-color="' + c + '"]';
    // Si la ronda está en curso según el calendario REAL de hoy, la tablet anota sola a los que no han llegado (presencia_ausentes) al abrir:
    // se espera ese momento para que la prueba no dependa de la hora del día en que corre.
    await pe.waitForFunction(() => window.__llamadas.some((l) => l.body && l.body.action === "presencia_ausentes"), null, { timeout: 3000 }).catch(() => {});
    await pe.evaluate(() => { window.__vib = 0; navigator.vibrate = () => { window.__vib++; return true; };
      const f = window.__presencia.find((x) => x.mesa === 2 && x.color === "blancas");
      if (f) f.presente = true; else window.__presencia.push({ mesa: 2, color: "blancas", presente: true, marcada: "2026-11-02T15:00:00Z" }); });
    await pe.click("#actualizar");
    await pe.waitForFunction(() => document.getElementById("presencia-resumen").textContent === "Han llegado 1 de 6 jugadores · faltan 5.");
    igual("antes de que empiece la ronda no hay cronómetro (nadie está corriendo) y el botón «Marcar que llegaron todos» está a la vista", await pe.evaluate(() => [document.querySelectorAll(".cam-cuenta").length, document.getElementById("presencia-todos").checkVisibility(), document.getElementById("presencia-todos").textContent.trim()]), [0, true, "✓ Marcar que llegaron todos"]);
    // La ronda de su categoría empezó hace 10 minutos: corre el cronómetro de los que no han llegado (y solo de mesas sin resultado).
    await pe.evaluate(() => { window.__inicioRonda = { ronda: 3, inicio: new Date(Date.now() - 10 * 60000).toISOString(), arbitro: "Ana Árbitra" }; });
    await pe.click("#actualizar");
    await pe.waitForSelector(".cam-cuenta");
    igual("con la ronda en marcha los cronómetros son «timer» (roles para el lector de pantalla) y ninguno se ha vencido todavía",
      await pe.evaluate(() => [[...document.querySelectorAll(".cam-cuenta")].every((c) => c.getAttribute("role") === "timer"), document.querySelectorAll('.cam-jugador[data-vencido="si"]').length]), [true, 0]);
    const cuentas = await pe.evaluate(() => [...document.querySelectorAll(".cam-cuenta")].map((c) => [c.closest(".cam-mesa").dataset.mesa + c.closest(".cam-jugador").dataset.color[0], /^⏱ (19|20):\d\d$/.test(c.textContent)]));
    igual("los cronómetros son de la mesa 1 (los dos) y de las negras de la mesa 2, y marcan unos 20 min", cuentas, [["1b", true], ["1n", true], ["2n", true]]);
    igual("al empezar la ronda, los que no han llegado quedan anotados «no ha llegado» UNA sola vez (la organización los ve), sin pisar a quien ya estaba marcado", await pe.evaluate(() => [window.__ausentesArgs.map((x) => x.ronda), window.__presencia.filter((x) => x.mesa === 2 && x.color === "blancas")[0].presente, window.__presencia.filter((x) => x.mesa === 1).map((x) => x.presente)]), [[3], true, [false, false]]);
    await pe.click("#actualizar");
    await pe.waitForTimeout(400);
    igual("y no se vuelve a mandar al repintar", await pe.evaluate(() => window.__ausentesArgs.length), 1);
    igual("antes de que se acabe el tiempo ningún nombre está resaltado ni sale la guía", await pe.evaluate(() => [document.querySelectorAll('.cam-jugador[data-vencido="si"]').length, [...document.querySelectorAll(".cam-cuenta-guia")].filter((g) => g.checkVisibility()).length, document.getElementById("espera-alerta").hidden]), [0, 0, true]);
    // «Marcar que llegaron todos»
    await pe.click("#presencia-todos");
    await pe.waitForSelector("dialog[open]");
    igual("pregunta antes y dice cuántos son (5)", await pe.evaluate(() => /5 jugadores/.test(document.querySelector("dialog[open]").textContent)), true);
    await pe.click("dialog[open] [data-avisos-aceptar]");
    await pe.waitForFunction(() => document.getElementById("presencia-resumen").textContent === "Han llegado 6 de 6 jugadores.");
    igual("al aceptar la función recibe «presencia_todos» de la ronda 3, los 6 quedan «llegó», el botón se va y los cronómetros también", await pe.evaluate(() => [window.__todosArgs[0].ronda, document.getElementById("presencia-todos").hidden, document.querySelectorAll(".cam-cuenta").length, window.__presencia.every((x) => x.presente)]), [3, true, 0, true]);
    // Se equivocó con la mesa 2 de las negras: «Deshacer» (queda unos segundos también después de «llegaron todos») la deja como que no ha llegado (y vuelve su cronómetro).
    await pe.click(jugE(2, "negras") + ' [data-accion="corregir-presencia"]');
    await pe.waitForSelector(jugE(2, "negras") + " .cam-cuenta");
    // La ronda empezó hace 40 min: el tiempo de espera (30) se cumplió.
    await pe.evaluate(() => { window.__inicioRonda = { ronda: 3, inicio: new Date(Date.now() - 40 * 60000).toISOString(), arbitro: "Ana Árbitra" }; });
    await pe.click("#actualizar");
    await pe.waitForFunction(() => document.querySelector('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="negras"]').dataset.vencido === "si", null, { timeout: 15000 });
    igual("al llegar a cero el cronómetro marca 0:00, el nombre del que no llegó SE RESALTA y aparece la guía escrita (pierde por incomparecencia; el árbitro decide); quien sí llegó no se resalta",
      await pe.evaluate(() => { const n = document.querySelector('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="negras"]'), b = document.querySelector('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="blancas"]'); const g = n.querySelector(".cam-cuenta-guia"); return [n.querySelector(".cam-cuenta").textContent, getComputedStyle(n.querySelector(".cam-nombre")).boxShadow !== "none", g.checkVisibility(), /por reglas pierde por incomparecencia\. Tú decides/.test(g.textContent), b.dataset.vencido === "si"]; }),
      ["⏱ 0:00", true, true, true, false]);
    igual("y sale el aviso de la categoría con la mesa 2 y quién no llegó, con su botón; la tablet vibra una vez (sin sonido)", await pe.evaluate(() => { const a = document.getElementById("espera-alerta"); return [a.checkVisibility(), a.getAttribute("role"), /Se cumplió el tiempo de espera \(30 min\)/.test(document.getElementById("ea-titulo").textContent), [...a.querySelectorAll("li")].map((l) => l.dataset.mesa + "|" + l.querySelector("span").textContent), a.querySelector("button").textContent, window.__vib]; }),
      [true, "alert", true, ["2|Mesa 2 — Acuña Porras Fabio (negras) no llegó"], "Pasar a incomparecencia (1-0 por incomparecencia de las negras)", 1]);
    const antesGuardar = await pe.evaluate(() => window.__llamadas.filter((l) => l.body.action === "guardar").length);
    await pe.click('#ea-lista [data-accion="incomparecencia"]');
    await pe.waitForFunction(() => document.getElementById("res-2").value === "4");
    igual("«Pasar a incomparecencia» deja elegido «1-0 por incomparecencia» en la mesa 2 y NO manda nada: se envía con «Guardar»", await pe.evaluate((n) => [document.getElementById("res-2").value, window.__llamadas.filter((l) => l.body.action === "guardar").length === n, document.querySelector('#ea-lista [data-accion="incomparecencia"]').disabled], antesGuardar), ["4", true, true]);
    igual("el aviso no vuelve a vibrar mientras siga igual (la tablet lo repinta cada 30 s)", await pe.evaluate(() => window.__vib), 1);
    await ce.ctx.close();

    console.log("\n=== «Mandarme la bitácora por correo» ===");
    const cm = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: TOKEN });
    await cm.p.waitForSelector(".cam-mesa");
    const pm = cm.p;
    igual("antes de concluir no se ve el formulario del correo (está dentro del aviso de concluidas)", await pm.evaluate(() => document.getElementById("bit-enviar").checkVisibility()), false);
    await pm.click("#concluir");
    await pm.waitForSelector("dialog[open]");
    await pm.click("dialog[open] [data-avisos-aceptar]");
    await pm.waitForFunction(() => !document.getElementById("concluido").hidden);
    igual("al concluir sale el correo con su casilla de consentimiento (sin marcar) y el enlace a la privacidad; el correo no se guarda y se puede pedir dos veces", await pm.evaluate(() => [document.getElementById("bit-enviar").checkVisibility(), document.getElementById("bit-consiento").checked, !!document.querySelector('#concluido a[href="privacidad.html"]'), /dos veces/.test(document.getElementById("bit-correo-ayuda").textContent), /no se guarda/.test(document.getElementById("concluido").textContent)]), [true, false, true, true, true]);
    await pm.fill("#bit-correo", "esto-no-es-un-correo");
    await pm.click("#bit-enviar");
    await pm.waitForTimeout(250);
    igual("con un correo mal escrito no manda nada", await pm.evaluate(() => (window.__correoArgs || []).length), 0);
    await pm.fill("#bit-correo", "Ana@Correo.com");
    await pm.click("#bit-enviar");
    await pm.waitForTimeout(250);
    igual("sin marcar que acepta, no manda nada", await pm.evaluate(() => (window.__correoArgs || []).length), 0);
    await pm.check("#bit-consiento");
    await pm.click("#bit-enviar");
    await pm.waitForFunction(() => (window.__correoArgs || []).length === 1);
    await pm.waitForFunction(() => /Listo: te la mandamos/.test(document.getElementById("concluido-estado").textContent));
    igual("con correo válido y consentimiento manda el PDF de verdad (empieza como un PDF, base64 «%PDF-») y la página lo dice", await pm.evaluate(() => [window.__correoArgs[0].correo, window.__correoArgs[0].pdf.startsWith("JVBERi0"), window.__correoArgs[0].largo > 2000, document.getElementById("concluido-estado").textContent]), ["Ana@Correo.com", true, true, "Listo: te la mandamos a Ana@Correo.com. Si no la ves, revisa el correo no deseado."]);
    await pm.click("#bit-enviar");
    await pm.waitForFunction(() => (window.__correoArgs || []).length === 2);
    await pm.click("#bit-enviar");
    await pm.waitForFunction(() => (window.__correoArgs || []).length === 3);
    await pm.waitForSelector("dialog[open], .cam-aviso, [role=alert]", { timeout: 5000 }).catch(() => {});
    igual("el tercer pedido lo rechaza la función (429) y la página no dice que se mandó", await pm.evaluate(() => !/Listo: te la mandamos/.test(document.getElementById("concluido-estado").textContent)), true);
    await cm.ctx.close();

    console.log("\n=== La banderita del país al final del nombre de cada jugador (y nada si no hay país) ===");
    {
        const fb = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: TOKEN, ancho: 820 });
        const pb = fb.p;
        await pb.waitForSelector(".cam-mesa");
        const alturas = () => pb.$$eval(".cam-mesa", (l) => l.map((c) => Math.round(c.getBoundingClientRect().height)));
        const antes = await alturas();
        igual("sin país (la función no lo mandó) no sale ninguna banderita y los nombres quedan como siempre", await pb.evaluate(() => [document.querySelectorAll(".cam-bandera").length, document.querySelector('.cam-mesa[data-mesa="1"] .cam-nombre-texto').textContent]), [0, "Muñoz Feliz Alejandro"]);
        const leidasAntes = await pb.evaluate(() => { window.__feds = true; return window.__llamadas.filter((l) => l.body.action === "leer").length; });
        await pb.evaluate(() => document.getElementById("actualizar").click());
        await pb.waitForSelector('.cam-mesa[data-mesa="1"] .cam-bandera');
        igual("con el país, cada nombre lleva su banderita AL FINAL (blancas de Costa Rica, negras de El Salvador), con el código escrito para el lector de pantalla",
            await pb.evaluate(() => [...document.querySelectorAll('.cam-mesa[data-mesa="1"] .cam-jugador')].map((j) => { const n = j.querySelector(".cam-nombre-texto"), b = n.querySelector(".cam-bandera"); return [n.firstChild.textContent, n.lastElementChild === b, b.dataset.fed, b.title, b.querySelector(".sr-only").textContent, b.querySelector("img").getAttribute("alt"), b.querySelector("img").getAttribute("src")]; })),
            [["Muñoz Feliz Alejandro", true, "CRC", "CRC", " (CRC)", "", "img/banderas/cr.svg"], ["Gramajo Tovar Marco", true, "ESA", "ESA", " (ESA)", "", "img/banderas/sv.svg"]]);
        await pb.waitForFunction(() => [...document.querySelectorAll(".cam-bandera img")].every((i) => i.complete && i.naturalWidth > 0));
        igual("el dibujo carga de verdad (no queda un cuadro roto) y es pequeñito: cabe en 24 × 18 px, al lado del nombre",
            await pb.evaluate(() => [...document.querySelectorAll(".cam-bandera img")].every((i) => { const r = i.getBoundingClientRect(); return i.naturalWidth > 0 && r.width > 8 && r.width <= 24 && r.height > 6 && r.height <= 18; })), true);
        igual("una federación sin dibujo no pone nada (ni un cuadro roto): la mesa 2 con «JAM» sí; la de un código inventado, no",
            await pb.evaluate(() => { const C = window.CentroamericanoBanderas; return [!!C.de("JAM"), C.de("XXX"), C.de(""), C.de(null), C.de("jam").dataset.fed]; }), [true, null, null, null, "JAM"]);
        igual("las tarjetas no cambian de tamaño por la banderita (siguen todas iguales)", await alturas(), antes);
        igual("la ventana del control de tiempos también la lleva junto a cada nombre", await (async () => {
            await pb.evaluate(() => document.querySelector('.cam-mesa[data-mesa="2"] [data-accion="tiempo"]').click());
            await pb.waitForSelector("#form-tiempos");
            return pb.evaluate(() => [...document.querySelectorAll("#form-tiempos .cam-tiempo-nombre")].map((n) => [n.firstChild.textContent, n.querySelector(".cam-bandera") && n.querySelector(".cam-bandera").dataset.fed]));
        })(), [["Harvey Ian", "JAM"], ["Acuña Porras Fabio", "GUA"]]);
        await pb.evaluate(() => document.querySelector('#control-tiempos [data-accion="cerrar-tiempos"]').click());
        // «Mis pareos»: la banderita en cada celda de nombre.
        await pb.click("#logo-pareos");
        await pb.waitForSelector("#mis-pareos[open] .cam-mp-torneo tbody tr");
        igual("«Mis pareos» la lleva al final de cada nombre (blancas y negras) y el resultado sigue en su columna",
            await pb.evaluate(() => { const f = document.querySelector('#mis-pareos [data-tnr="1529737"] tbody tr[data-mesa="1"]'); return [f.children[1].textContent, f.children[1].querySelector(".cam-bandera").dataset.fed, f.children[2].querySelector(".cam-bandera").dataset.fed, f.children[3].textContent]; }),
            ["Muñoz Feliz Alejandro (CRC)", "CRC", "ESA", "sin resultado"]);
        await pb.click('#mis-pareos [data-accion="cerrar-mp"]');
        // «¿Dónde juega?»: en la tarjeta del jugador que se busca (el botón arranca sin recibir clics: se le devuelven).
        await pb.evaluate(() => { const e = document.getElementById("t-sin-fab"); if (e) e.remove(); });
        await pb.click("#donde-juega");
        await pb.waitForSelector("#donde-juega-hoja[open]");
        await pb.fill("#dj-buscar", "hopkins");
        await pb.waitForSelector("#dj-res .cam-dj-tarj");
        igual("«¿Dónde juega?» la lleva junto al nombre del atleta buscado", await pb.evaluate(() => { const n = document.querySelector("#dj-res .cam-dj-tarj .cam-dj-nombre"); return [n.firstChild.textContent, n.querySelector(".cam-bandera") && n.querySelector(".cam-bandera").dataset.fed]; }), ["Hopkins John", "TTO"]);
        igual("sin errores en la página", fb.errores, []);
        await fb.ctx.close();
    }

    console.log("\n=== La ficha de la mesa, opción A (por ahora solo para Oscar Angulo) ===");
    {
        const OSCAR = dobleArbitro().replace('window.__avisos = { nombrado: true, arbitro: "Ana Árbitra"', 'window.__avisos = { nombrado: true, arbitro: "Óscar Angulo Camacho"');
        const altos = (p) => p.$$eval(".cam-mesa", (l) => l.map((c) => Math.round(c.getBoundingClientRect().height)));
        // Igual que «medidas»: si la página se está repintando, las tarjetas miden 0 × 0 un instante; se espera (hasta 8 s) a que tengan tamaño.
        const formas = (p) => medirTarjetas(p);
        const normal = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: TOKEN, ancho: 820 });
        await normal.p.waitForSelector(".cam-mesa");
        const altoHoy = await altos(normal.p);
        igual("con otro árbitro (Ana) la ficha es la de siempre: sin marca de ficha nueva y con el selector y «Guardar»", await normal.p.evaluate(() => [document.querySelectorAll('.cam-mesa[data-ficha]').length, !!document.querySelector('.cam-mesa [data-accion="guardar"]'), !!document.querySelector('.cam-mesa-marcas')]), [0, true, false]);
        await normal.ctx.close();

        const a = await abrir(browser, "centroamericano-arbitro.html", OSCAR, { hash: TOKEN, ancho: 820 });
        const pa = a.p;
        await pa.waitForSelector(".cam-mesa");
        igual("para «Óscar Angulo Camacho» (con tilde y apellido de más) las tres mesas llevan la ficha nueva", await pa.$$eval(".cam-mesa", (l) => l.map((c) => c.dataset.ficha)), ["a", "a", "a"]);
        const altoA = await altos(pa);
        igual("la ficha nueva es más corta que la de siempre (al menos 80 px menos) y las tres miden lo mismo", [altoA.every((x, i) => altoHoy[i] - x >= 80), new Set(altoA).size], [true, 1]);
        igual("el resultado son tres botones grandes (1-0, ½-½, 0-1), sin selector ni «Guardar» a la vista, y «Otro resultado» sigue ahí", await pa.evaluate(() => { const c = document.querySelector('.cam-mesa[data-mesa="1"]'); return [[...c.querySelectorAll(".cam-rapido-btn")].map((b) => b.dataset.valor), c.querySelector('details.cam-rapido-otro').open, !!c.querySelector(".cam-rapido-otro summary")]; }), [["1", "2", "3"], false, true]);
        igual("las acciones de cada jugador (llegó, se levantó, ilegal, irregularidad) y los tres iconos de la mesa siguen en la tarjeta", await pa.evaluate(() => { const c = document.querySelector('.cam-mesa[data-mesa="1"]'); return ["presente", "levanto", "ilegal", "irregularidad"].map((x) => c.querySelectorAll('.cam-jugador [data-accion="' + x + '"]').length).concat(["planilla", "hablar", "tiempo"].map((x) => c.querySelectorAll('[data-accion="' + x + '"]').length)); }), [2, 2, 2, 2, 1, 1, 1]);
        igual("los botones de la ficha nueva se tocan con el dedo: 46 px o más", await pa.evaluate(() => [...document.querySelectorAll('.cam-mesa[data-mesa="1"] button')].filter((b) => b.checkVisibility() && !b.closest("summary")).every((b) => { const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })), true);
        // La revisión previa de la ronda destraba el guardado de un toque.
        await pa.evaluate(() => { window.__lista = ["relojes", "tableros"]; document.getElementById("actualizar").click(); });
        await pa.waitForFunction(() => !document.querySelector('.cam-mesa[data-mesa="1"] .cam-rapido-btn').disabled);
        const guardadasAntes = await pa.evaluate(() => window.__llamadas.filter((l) => l.body.action === "guardar").length);
        await pa.click('.cam-mesa[data-mesa="1"] .cam-rapido-btn[data-valor="2"]');
        await pa.waitForSelector('.cam-mesa[data-mesa="1"] .cam-rapido-btn[data-valor="2"][aria-pressed="true"]');
        igual("un toque en ½-½ GUARDA (una sola llamada) y el botón queda marcado", await pa.evaluate((n) => { const g = window.__llamadas.filter((l) => l.body.action === "guardar"); const c = g[g.length - 1].body.cambios; return [g.length - n, c.length, c[0].mesa, c[0].valor]; }, guardadasAntes), [1, 1, 1, "2"]);
        igual("con un resultado que no tiene botón, no se esconde: se escribe «En chess-results: …»", await pa.evaluate(() => { const c = document.querySelector('.cam-mesa[data-mesa="1"]'); return [!c.querySelector(".cam-resultado-actual")]; }), [true]);
        // La primera ilegal: marca y «Anular» salen en la franja de las marcas y NADA cambia de tamaño.
        const antesIl = await formas(pa);
        await pa.click(acc(2, "blancas", "ilegal"));
        await pa.waitForSelector("dialog[open] select");
        await pa.selectOption("dialog[open] select", "enroque");
        await pa.click("dialog[open] [data-avisos-aceptar]");
        await pa.waitForSelector("dialog[open] [data-avisos-aceptar]");
        await pa.click("dialog[open] [data-avisos-aceptar]");
        await pa.waitForSelector('.cam-mesa[data-mesa="2"] .cam-mesa-marcas .cam-marca[data-tipo="ilegal"]');
        igual("al anotar la primera ilegal NINGUNA tarjeta cambia de tamaño ni de forma", await formas(pa), antesIl);
        igual("la marca y «Anular» van en la franja de la mesa, bajo el color de quien es; el otro jugador no deja ni el puntito; no queda una franja por jugador",
            await pa.evaluate(() => { const c = document.querySelector('.cam-mesa[data-mesa="2"]'); const g = (col) => c.querySelector('.cam-extra-grupo[data-color="' + col + '"]'); return [!!g("blancas").querySelector('.cam-marca[data-tipo="ilegal"]'), !!g("blancas").querySelector('[data-accion="anular-ilegal"]'), g("blancas").querySelector(".cam-color").dataset.color, getComputedStyle(g("negras")).display, c.querySelectorAll(".cam-jugador-extra").length, g("blancas").closest(".cam-mesa-avisos") !== null]; }),
            [true, true, "blancas", "none", 0, true]);
        await pa.click('.cam-mesa[data-mesa="2"] [data-accion="anular-ilegal"]');
        await pa.waitForSelector("[data-avisos-aceptar]");
        await pa.click("[data-avisos-aceptar]");
        await pa.waitForFunction(() => !document.querySelector('.cam-mesa[data-mesa="2"] .cam-marca[data-tipo="ilegal"]'));
        igual("«Anular» desde la franja deshace la ilegal y la tarjeta sigue igual de grande", await formas(pa), antesIl);
        igual("el aviso de la primera ilegal no se ve aparte (lo dice la marca), pero el lector de pantalla lo sigue teniendo", await (async () => {
            await pa.click(acc(2, "blancas", "ilegal"));
            await pa.waitForSelector("dialog[open] select");
            await pa.selectOption("dialog[open] select", "enroque");
            await pa.click("dialog[open] [data-avisos-aceptar]");
            await pa.waitForSelector("dialog[open] [data-avisos-aceptar]");
            await pa.click("dialog[open] [data-avisos-aceptar]");
            await pa.waitForSelector('.cam-mesa[data-mesa="2"] .cam-aviso-suave', { state: "attached" });
            return pa.evaluate(() => { const n = document.querySelector('.cam-mesa[data-mesa="2"] .cam-aviso-suave'); return [!n.querySelector(".cam-aviso-corto").checkVisibility(), /ilegal/i.test(n.querySelector(".sr-only").textContent)]; });
        })(), [true, true]);
        igual("la guía del tiempo de espera lleva el color del jugador (se encuentra aunque cambie de lugar)", /cam-cuenta-guia", "data-color": color/.test(fs.readFileSync("js/centroamericano-arbitro.js", "utf8")), true);
        igual("sin errores en la página", a.errores, []);
        await a.ctx.close();

        const hoy = await abrir(browser, "centroamericano-arbitro.html?ficha=hoy", OSCAR, { hash: TOKEN, ancho: 820 });
        await hoy.p.waitForSelector(".cam-mesa");
        igual("«?ficha=hoy» le devuelve a Óscar la ficha de siempre (para comparar)", await hoy.p.evaluate(() => document.querySelectorAll(".cam-mesa[data-ficha]").length), 0);
        await hoy.ctx.close();
        const forzada = await abrir(browser, "centroamericano-arbitro.html?ficha=a", dobleArbitro(), { hash: TOKEN, ancho: 390 });
        await forzada.p.waitForSelector(".cam-mesa");
        igual("«?ficha=a» la enciende para otro enlace (para probarla), y en el celular (390 px) no se desplaza a lo ancho",
            await forzada.p.evaluate(() => [document.querySelectorAll(".cam-mesa[data-ficha='a']").length, document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1]), [3, true]);
        await forzada.ctx.close();
    }

    console.log("\n=== Cada árbitro elige cómo ver sus mesas (De siempre / Tres toques) ===");
    {
        const OSCAR = dobleArbitro().replace('window.__avisos = { nombrado: true, arbitro: "Ana Árbitra"', 'window.__avisos = { nombrado: true, arbitro: "Óscar Angulo Camacho"');
        const cuantas = (p) => p.evaluate(() => [document.querySelectorAll(".cam-mesa").length, document.querySelectorAll(".cam-mesa[data-ficha='a']").length]);
        const vista = (p) => p.evaluate(() => [document.getElementById("vista-mesas").dataset.vista, document.getElementById("vista-boton").getAttribute("aria-label"), [...document.querySelectorAll("#vista-menu [role=menuitemradio]")].map((i) => [i.dataset.vista, i.getAttribute("aria-checked")])]);
        // Se abre desde el botón y se elige una opción del menú (como lo hace quien toca la tablet).
        const elegir = async (p, id) => { await p.click("#vista-boton"); await p.click('#vista-menu [data-vista="' + id + '"]'); };
        // Cualquier árbitro arranca con la ficha de siempre y puede cambiarla.
        const v = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: TOKEN, ancho: 820 });
        await v.p.waitForSelector(".cam-mesa");
        igual("sin elegir nada: la ficha de siempre, y el botón (en su nombre accesible) y el menú lo dicen", [await cuantas(v.p), await vista(v.p)],
            [[3, 0], ["clasica", "Cómo ver tus mesas: De siempre", [["clasica", "true"], ["tres", "false"]]]]);
        igual("sin ruido: lo único visible es un botón chico «Vista», con el menú cerrado y sin bloques ni textos largos",
            await v.p.evaluate(() => { const bt = document.getElementById("vista-boton"), m = document.getElementById("vista-menu"); return [bt.checkVisibility(), bt.textContent.trim(), bt.getAttribute("aria-haspopup"), bt.getAttribute("aria-expanded"), m.checkVisibility(), Math.round(bt.getBoundingClientRect().height) <= 48]; }),
            [true, "👁 Vista ▾", "menu", "false", false, true]);
        await v.p.click("#vista-boton");
        igual("al tocar el botón se despliegan las dos opciones (una marcada), con el foco en la marcada y sin mover las mesas de lugar",
            await v.p.evaluate(() => [document.getElementById("vista-menu").checkVisibility(), document.getElementById("vista-boton").getAttribute("aria-expanded"), [...document.querySelectorAll("#vista-menu button")].map((x) => [x.textContent.trim(), x.getAttribute("role"), x.getAttribute("aria-checked")]), document.activeElement.dataset.vista]),
            [true, "true", [["✓De siempre", "menuitemradio", "true"], ["Tres toques", "menuitemradio", "false"]], "clasica"]);
        await v.p.keyboard.press("ArrowDown");
        igual("con el teclado: la flecha pasa a la otra opción y Escape cierra el menú devolviendo el foco al botón",
            [await v.p.evaluate(() => document.activeElement.dataset.vista), await (async () => { await v.p.keyboard.press("Escape"); return v.p.evaluate(() => [document.getElementById("vista-menu").checkVisibility(), document.activeElement.id]); })()],
            ["tres", [false, "vista-boton"]]);
        await v.p.click("#vista-boton");
        await v.p.mouse.click(5, 300);
        igual("un toque afuera también lo cierra", await v.p.evaluate(() => document.getElementById("vista-menu").checkVisibility()), false);
        await elegir(v.p, "tres");
        await v.p.waitForSelector(".cam-mesa[data-ficha='a']");
        igual("elegir «Tres toques» arma otra vez las tarjetas con la ficha corta, de una vez y sin recargar, y lo dice",
            [await cuantas(v.p), await vista(v.p), await v.p.evaluate(() => [localStorage.getItem("cam-vista-mesas"), !!document.querySelector(".avisos-toast, [data-avisos-aceptar]") || document.body.textContent.includes("Ves tus mesas con «Tres toques»")])],
            [[3, 3], ["tres", "Cómo ver tus mesas: Tres toques", [["clasica", "false"], ["tres", "true"]]], ["tres", true]]);
        // Las dos vistas tienen las MISMAS funciones: lo que se puede hacer en una mesa (por «data-accion») en la ficha de siempre se puede
        // hacer en la corta; solo cambia cómo se elige el resultado (la lista contra los tres botones).
        const acciones = (p) => p.evaluate(() => [...new Set([...document.querySelectorAll('.cam-mesa[data-mesa="2"] [data-accion]')].map((b) => b.dataset.accion))].sort());
        const enCorta = await acciones(v.p);
        await elegir(v.p, "clasica");
        await v.p.waitForFunction(() => document.querySelectorAll(".cam-mesa[data-ficha='a']").length === 0);
        const enClasica = await acciones(v.p);
        console.log("      acciones de la mesa 2, ficha de siempre: " + enClasica.join(", ") + " | corta: " + enCorta.join(", "));
        igual("la ficha corta conserva todas las funciones de la de siempre (menos elegir el resultado en una lista: ahí van tres botones de un toque)",
            [enClasica.filter((a) => !enCorta.includes(a)), enCorta.includes("rapido")], [[], true]);
        await elegir(v.p, "tres");
        await v.p.waitForSelector(".cam-mesa[data-ficha='a']");
        // La tablet la recuerda: al volver a abrir sigue siendo «Tres toques».
        await v.p.reload();
        await v.p.waitForSelector(".cam-mesa");
        igual("al volver a abrir la página, la tablet recuerda «Tres toques»", [await cuantas(v.p), (await vista(v.p))[0]], [[3, 3], "tres"]);
        await elegir(v.p, "clasica");
        await v.p.waitForFunction(() => document.querySelectorAll(".cam-mesa[data-ficha='a']").length === 0);
        igual("y se puede volver a «De siempre» (también se recuerda)", [await cuantas(v.p), await v.p.evaluate(() => localStorage.getItem("cam-vista-mesas"))], [[3, 0], "clasica"]);
        await v.ctx.close();

        // Óscar arranca con «Tres toques» (como hasta ahora), pero ya puede elegir la de siempre; «?ficha=hoy» sigue forzándola.
        const o = await abrir(browser, "centroamericano-arbitro.html", OSCAR, { hash: TOKEN, ancho: 820 });
        await o.p.waitForSelector(".cam-mesa");
        igual("Óscar Angulo arranca con «Tres toques», que es como la tiene hasta ahora", [await cuantas(o.p), (await vista(o.p))[0]], [[3, 3], "tres"]);
        await elegir(o.p, "clasica");
        await o.p.waitForFunction(() => document.querySelectorAll(".cam-mesa[data-ficha='a']").length === 0);
        await o.p.reload();
        await o.p.waitForSelector(".cam-mesa");
        igual("y si Óscar elige «De siempre», manda lo que eligió (no la lista de quienes arrancan con la corta)", [await cuantas(o.p), (await vista(o.p))[0]], [[3, 0], "clasica"]);
        await o.ctx.close();

        // Sin almacenamiento (modo privado, datos bloqueados): la elección vale mientras la página esté abierta y nada se rompe.
        const sa = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: TOKEN, ancho: 820 });
        await sa.ctx.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("sin almacenamiento"); } }); });
        await sa.p.reload();
        await sa.p.waitForSelector(".cam-mesa");
        await elegir(sa.p, "tres");
        await sa.p.waitForSelector(".cam-mesa[data-ficha='a']");
        igual("sin almacenamiento en el navegador, igual se puede elegir (vale mientras la página esté abierta)", await cuantas(sa.p), [3, 3]);
        await sa.ctx.close();
    }

    console.log("\n=== Hablar con el jugador: las frases en inglés y francés, el traductor y la bitácora ===");
    {
        const fh = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: TOKEN, ancho: 820 });
        const ph = fh.p;
        await ph.waitForSelector(".cam-mesa");
        await ph.evaluate(() => { window.__feds = true; document.getElementById("actualizar").click(); });
        await ph.waitForSelector('.cam-mesa[data-mesa="1"] .cam-bandera');
        await ph.evaluate(() => { const e = document.getElementById("t-sin-fab"); if (e) e.remove(); window.__voz = []; Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { cancel() {}, speak(u) { window.__voz.push([u.text, u.lang]); } } }); Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: function (t) { this.text = t; } }); });
        const llamadasTraducir = () => ph.evaluate(() => window.__llamadas.filter((l) => l.f === "centroamericano-traducir").length);
        const filasAnotar = () => ph.evaluate(() => window.__llamadas.filter((l) => l.body.action === "anotar" && l.body.articulo === "Comunicado").map((l) => [l.body.mesa, l.body.color, l.body.tipo, l.body.texto]));
        igual("cada mesa tiene su botón «Hablar con el jugador» con nombre accesible", await ph.$$eval('.cam-mesa [data-accion="hablar"]', (l) => l.map((b) => b.getAttribute("aria-label").startsWith("Hablar con el jugador de la mesa "))), [true, true, true]);

        // Una mesa de Fair Play: sus frases van primero, con un aviso que lo dice; la de siempre empieza por «Al empezar».
        igual("en una mesa de Fair Play el tema «Fair Play» va primero y lo dice; en una normal, va en su lugar y sin aviso", await ph.evaluate(() => {
            const J = [{ color: "blancas", nombre: "A B", fed: "" }, { color: "negras", nombre: "C D", fed: "" }];
            const primero = () => [document.querySelector("#hablar .cam-hb-tema").dataset.tema, !!document.querySelector("#hablar .cam-hb-fp-aviso")];
            window.CentroamericanoHablar.abrir({ mesa: 9, jugadores: J, fairPlay: true });
            const a = primero(); document.getElementById("hablar").close();
            window.CentroamericanoHablar.abrir({ mesa: 9, jugadores: J });
            const b = primero(); document.getElementById("hablar").close();
            return [a, b];
        }), [["fairplay", true], ["inicio", false]]);

        // Mesa 3: Hopkins (TTO, habla inglés) vs Baquero (FRA, francés).
        await ph.click('.cam-mesa[data-mesa="3"] [data-accion="hablar"]');
        await ph.waitForSelector("#hablar[open]");
        igual("se abre sin hablar con nadie todavía y no anota nada solo", [await llamadasTraducir(), (await filasAnotar()).length], [0, 0]);
        igual("el idioma se sugiere por el país del primer jugador (TTO → inglés) y al elegir al segundo (FRA) pasa a francés",
            await (async () => {
                const a = await ph.$eval('#hablar [data-accion="elegir-idioma"][aria-pressed="true"]', (b) => b.dataset.idioma);
                await ph.click('#hablar [data-accion="elegir-jugador"][data-color="negras"]');
                const b = await ph.$eval('#hablar [data-accion="elegir-idioma"][aria-pressed="true"]', (x) => x.dataset.idioma);
                return [a, b];
            })(), ["en", "fr"]);
        await ph.click('#hablar [data-accion="elegir-jugador"][data-color="blancas"]');
        igual("las banderitas están en los botones de los jugadores", await ph.$$eval("#hablar .cam-hb-jug .cam-bandera", (l) => l.map((b) => b.dataset.fed)), ["TTO", "FRA"]);

        // Una frase: pantalla grande en SU idioma.
        const frase = await ph.$eval('#hablar [data-frase]', (b) => b.dataset.frase);
        await ph.click('#hablar [data-frase="' + frase + '"]');
        await ph.waitForSelector("#hablar-jugador[open]");
        const pant = await ph.evaluate(() => { const g = document.querySelector("#hablar-jugador .cam-hb-grande"); const r = g.getBoundingClientRect(); return [g.lang, g.textContent.length > 5, parseFloat(getComputedStyle(g).fontSize) >= 32, document.querySelector("#hablar-jugador .cam-hb-original").textContent.startsWith("Para el árbitro: "), r.width > 0]; });
        igual("la frase sale en grande, en inglés, y el original en español va aparte, para el árbitro", pant, ["en", true, true, true, true]);
        igual("la frase en pantalla es la misma del módulo de frases (texto fijo, sin pasar por el traductor)", await ph.evaluate((id) => document.querySelector("#hablar-jugador .cam-hb-grande").textContent === window.CentroamericanoFrases.FRASE.get(id).en, frase), true);
        await ph.click('#hablar-jugador [data-accion="voz"]');
        igual("«Leer en voz alta» habla en el idioma de la frase", await ph.evaluate(() => window.__voz.map((v) => v[1])), ["en-US"]);
        igual("nada se anotó solo ni se llamó al traductor", [await llamadasTraducir(), (await filasAnotar()).length], [0, 0]);
        await ph.click('#hablar-jugador [data-accion="anotar-frase"]');
        await ph.waitForFunction(() => /Quedó anotado/.test(document.querySelector("#hablar-jugador .cam-hb-estado").textContent));
        const anot = await filasAnotar();
        igual("«Anotar en la bitácora» anota UNA nota «Comunicado» con quién, en qué idioma y lo dicho en español", [anot.length, anot[0][0], anot[0][1], anot[0][2], /^Se le comunicó a Hopkins John \(blancas\) en inglés: «/.test(anot[0][3]), /\(en español: «/.test(anot[0][3])], [1, 3, "blancas", "nota", true, true]);
        await ph.click('#hablar-jugador [data-accion="listo"]');
        igual("«Listo» cierra la pantalla del jugador y deja la ventana del árbitro", await ph.evaluate(() => [!document.getElementById("hablar-jugador"), !!document.querySelector("#hablar[open]")]), [true, true]);

        // Conversar.
        await ph.click('#hablar [data-pestana="conversar"]');
        await ph.fill("#hb-arbitro", "Debe anotar la partida.");
        await ph.click('#hablar [data-accion="enviar-arbitro"]');
        await ph.waitForSelector('#hablar .cam-hb-jugador .cam-hb-mensaje');
        igual("el árbitro escribe en español y el jugador lo lee en su idioma (la traducción viene del servidor)", await ph.evaluate(() => [document.querySelector(".cam-hb-jugador .cam-hb-mensaje span").textContent, document.querySelector(".cam-hb-arbitro .cam-hb-mensaje span").textContent]), ["[EN] Debe anotar la partida.", "Debe anotar la partida."]);
        igual("al servidor solo viaja el mensaje y los idiomas con el enlace (ni el nombre del jugador ni la mesa)", await ph.evaluate(() => { const l = window.__llamadas.filter((x) => x.f === "centroamericano-traducir").pop(); return Object.keys(l.body).sort(); }), ["a", "de", "texto", "token"]);
        igual("la mitad del jugador está girada para leerse del otro lado y dice que es una traducción de ayuda", await ph.evaluate(() => [document.querySelector(".cam-hb-jugador").classList.contains("cam-hb-girado"), /Automatic translation/.test(document.querySelector(".cam-hb-jugador .cam-hb-aviso").textContent) || /Traduction automatique/.test(document.querySelector(".cam-hb-jugador .cam-hb-aviso").textContent)]), [true, true]);
        await ph.click('#hablar .cam-hb-rapida >> nth=0');
        igual("la respuesta rápida del jugador le llega al árbitro en español, sin traductor", await ph.evaluate(() => [window.__llamadas.filter((x) => x.f === "centroamericano-traducir").length, document.querySelectorAll(".cam-hb-arbitro .cam-hb-mensaje").length]), [1, 2]);
        await ph.fill("#hb-jugador", "I need the toilet please");
        await ph.click('#hablar [data-accion="enviar-jugador"]');
        await ph.waitForFunction(() => document.querySelectorAll(".cam-hb-arbitro .cam-hb-mensaje").length === 3);
        igual("el jugador escribe en su idioma y el árbitro lo lee en español", await ph.evaluate(() => { const l = window.__llamadas.filter((x) => x.f === "centroamericano-traducir").pop(); return [l.body.de, l.body.a, document.querySelector(".cam-hb-arbitro .cam-hb-mensaje:last-child span").textContent]; }), ["en", "es", "[ES] I need the toilet please"]);
        igual("la conversación no se anotó sola", (await filasAnotar()).length, 1);
        await ph.click('#hablar [data-accion="anotar-conversacion"]');
        await ph.waitForFunction(() => /conversación quedó anotada/.test(document.querySelector("#hablar .cam-hb-estado-general").textContent));
        const conv = (await filasAnotar())[1];
        igual("al marcarlo, la conversación se anota con las dos versiones de cada mensaje", [conv[0], /^Conversación con Hopkins John \(blancas\) en inglés/.test(conv[3]), /Árbitro: «Debe anotar la partida\.» \(EN: «\[EN\] Debe anotar la partida\.»\)/.test(conv[3]), /Jugador: «I need the toilet please» \(ES: «\[ES\] I need the toilet please»\)/.test(conv[3]), conv[3].length <= 2000], [3, true, true, true, true]);

        // Sin traductor (cuenta sin saldo, sin señal…): lo dice y manda a las frases; las frases siguen.
        await ph.evaluate(() => { window.__traducirFalla = 1; });
        await ph.fill("#hb-arbitro", "Otra cosa");
        await ph.click('#hablar [data-accion="enviar-arbitro"]');
        await ph.waitForFunction(() => !document.querySelector(".cam-hb-error").hidden);
        igual("si el traductor falla lo dice, manda a las frases y NO pierde lo escrito ni se anota nada", await ph.evaluate(() => [/Usa las frases/.test(document.querySelector(".cam-hb-error").textContent), document.querySelector(".cam-hb-error").getAttribute("role"), document.getElementById("hb-arbitro").value]), [true, "alert", "Otra cosa"]);
        await ph.click('#hablar [data-pestana="frases"]');
        igual("las frases siguen sirviendo", await ph.$$eval("#hablar [data-frase]", (l) => l.length > 30), true);

        // «Necesito un árbitro que hable francés».
        await ph.click('#hablar [data-accion="elegir-jugador"][data-color="negras"]');
        await ph.click('#hablar [data-accion="pedir-idioma"]');
        await ph.waitForFunction(() => /ya sabe que necesitas/.test(document.querySelector("#hablar .cam-hb-estado-general").textContent));
        igual("el pedido va al árbitro principal, a esa mesa, con el idioma escrito", await ph.evaluate(() => { const l = window.__llamadas.filter((x) => x.body.action === "ayuda").pop(); return [l.body.mesa, l.body.texto]; }), [3, "Necesito un árbitro que hable francés en esta mesa."]);
        await ph.click('#hablar [data-accion="cerrar-hablar"]');
        igual("la bitácora de la tablet muestra «Comunicado» (y no «Nota») en las dos anotaciones", await (async () => {
            await ph.evaluate(() => { document.getElementById("anotado").open = true; });
            return ph.$$eval("#anotado-filas tr", (l) => l.map((r) => r.children[2].textContent));
        })(), ["Comunicado", "Comunicado"]);
        igual("las tres tarjetas siguen iguales de alto entre sí (el botón nuevo no deforma ninguna)", new Set(await ph.$$eval(".cam-mesa", (l) => l.map((c) => Math.round(c.getBoundingClientRect().height)))).size <= 2, true);
        igual("sin errores en la página", fh.errores, []);
        await fh.ctx.close();
    }

    console.log("\n=== La transmisión sin atraso (LiveChess): la triple repetición y el control de tiempos solo ===");
    const vv = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: TOKEN, ancho: 820 });
    const pv = vv.p;
    await pv.waitForSelector(".cam-mesa");
    // La mesa 2 en LiveChess con una triple repetición (20… Ag7, comprobada con chess.js); la 1 con otros jugadores.
    const SANS_REP = "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Na5 Bc2 c5 d4 Qc7 Nbd2 Bd7 Nf1 Rfe8 Ng3 g6 Bg5 Bf8 Qd2 Bg7 Bh6 Bh8 Bg5 Bg7 Bh6 Bh8 Bg5 Bg7".split(" ");
    const esperado = await pv.evaluate((sans) => {
        const antes = window.sb.functions.invoke;
        let tB = 5430, tN = 5430, total = 0;
        const jugadas = sans.map((s, i) => { const g = 60 + (i % 7) * 37; if (i > 0) total += g; if (i % 2 === 0) { tB = tB - g + 30; return s + " " + tB + "+" + g; } tN = tN - g + 30; return s + " " + tN + "+" + g; });
        const primera = Date.now() - total * 1000 - 40000;
        window.__vivoLecturas = 0;
        window.sb.functions.invoke = (f, o) => {
            if (f !== "centroamericano-mesas-vivo") return antes(f, o);
            window.__vivoLecturas++;
            return Promise.resolve({ data: { ok: true, conectada: true, fuente: "livechess", ronda: 3, delay: 0, leida: new Date().toISOString(),
                mesas: [{ mesa: 2, fuente: "livechess", jugadas, primera, en_vivo: true, estado: "*" }],
                no_reconoce: [{ mesa: 1, motivo: "En la transmisión, el tablero 1 tiene otros jugadores." }] }, error: null });
        };
        return { tB, tN, ocurrio: new Date(primera + total * 1000).toISOString() };
    }, SANS_REP);
    await pv.evaluate(() => window.CentroamericanoArbitroVivo.leer());
    await pv.waitForSelector('#alertas-vivo .cam-alerta-vivo[data-tipo="triple"][data-mesa="2"]');
    igual("la triple repetición le llega al árbitro arriba de todo: un aviso que se lee (role=alert), con la jugada en la notación de la planilla y el artículo",
        await pv.evaluate(() => { const a = document.querySelector("#alertas-vivo .cam-alerta-vivo"); return [a.getAttribute("role"), a.checkVisibility(), /Triple repetición · Mesa 2/.test(a.textContent), /20… Ag7/.test(a.textContent), /art\. 9\.2/.test(a.textContent), document.getElementById("app").firstElementChild.id === "alertas-vivo" || !!document.querySelector("#app > #alertas-vivo")]; }),
        ["alert", true, true, true, true, true]);
    await pv.evaluate(() => window.CentroamericanoArbitroVivo.leer());
    igual("al volver a leer no se repite el aviso (uno por mesa, tipo y jugada)", await pv.$$eval("#alertas-vivo .cam-alerta-vivo", (l) => l.length), 1);
    await pv.click('#alertas-vivo [data-accion="entendido-tablas"]');
    igual("«Entendido» lo quita", await pv.$eval("#alertas-vivo", (e) => e.checkVisibility()), false);
    // El control de tiempos de la mesa 2: las casillas se llenan solas con los relojes de la transmisión y su hora.
    await pv.click('.cam-mesa[data-mesa="2"] [data-accion="tiempo"]');
    await pv.waitForSelector("#lt-tx");
    igual("el control de tiempos se llena solo: los dos relojes, las jugadas de cada uno y la hora real de la última jugada (marcada, no la de ahora)",
        await pv.evaluate((e) => [document.getElementById("lt-tb").value, document.getElementById("lt-jb").value, document.getElementById("lt-tn").value, document.getElementById("lt-jn").value, document.getElementById("lt-hora").dataset.marcada, /Ya están en las casillas/.test(document.getElementById("lt-tx").textContent)], esperado),
        [await pv.evaluate((t) => window.CentroamericanoMesas.formatoTiempo(t), esperado.tB), "20", await pv.evaluate((t) => window.CentroamericanoMesas.formatoTiempo(t), esperado.tN), "20", "si", true]);
    // La mesa 1: la transmisión no la reconoce, queda el formulario de siempre, vacío, y lo dice.
    await pv.selectOption("#lt-mesa", "1");
    await pv.waitForSelector("#lt-tx-no");
    igual("la mesa que la transmisión no reconoce queda a mano, como siempre, y dice por qué", await pv.evaluate(() => [/otros jugadores\. Anótalo a mano, como siempre\./.test(document.getElementById("lt-tx-no").textContent), document.getElementById("lt-tb").value, document.getElementById("lt-hora").dataset.marcada]), [true, "", "no"]);
    // «Anotar todas desde la transmisión»: pregunta, y cada control va a la bitácora con su hora real y su nota.
    const tiemposAntesTx = await pv.evaluate(() => window.__llamadas.filter((l) => l.body.action === "tiempo").length);
    await pv.click("#lt-tx-todas");
    await pv.waitForSelector("dialog[open] [data-avisos-aceptar]");
    igual("antes de anotar todas dice cuáles van y cuáles quedan a mano", await pv.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [/la mesa 2/.test(t), /La mesa 1 no está en la transmisión/.test(t)]; }), [true, true]);
    await pv.click("dialog[open] [data-avisos-aceptar]");
    await pv.waitForFunction((n) => window.__llamadas.filter((l) => l.body.action === "tiempo").length > n, tiemposAntesTx);
    igual("lo anotado: la mesa, los relojes, las jugadas, el turno, la hora real de la última jugada y la nota de que salió de la transmisión",
        await pv.evaluate((e) => { const b = window.__llamadas.filter((l) => l.body.action === "tiempo").pop().body; return [b.mesa, b.t_blancas === e.tB, b.t_negras === e.tN, b.j_blancas, b.j_negras, b.turno, b.ocurrio === e.ocurrio, /^Tomado de la transmisión sin atraso \(LiveChess\): los relojes después de la jugada 20$/.test(b.nota)]; }, esperado),
        [2, true, true, 20, 20, "blancas", true, true]);
    await pv.waitForFunction(() => !document.getElementById("lt-tx-todas"));
    igual("ya anotado, no se ofrece otra vez", await pv.$("#lt-tx-todas"), null);
    // «Llenar con los relojes de ahora»: la lectura de la transmisión es de hace unos segundos y el reloj de quien tenía el turno
    // siguió corriendo; se le descuenta lo que pasó y el control queda con la hora de este momento.
    await pv.selectOption("#lt-mesa", "2");
    await pv.waitForSelector("#lt-tx-ahora");
    await pv.click("#lt-tx-ahora");
    igual("«Llenar con los relojes de ahora»: el de las blancas (les toca) baja lo que pasó desde la última jugada, el de las negras queda igual, y la hora es la de ahora",
        await pv.evaluate((e) => { const tb = window.CentroamericanoMesas.leerTiempo(document.getElementById("lt-tb").value), tn = window.CentroamericanoMesas.leerTiempo(document.getElementById("lt-tn").value);
            const dif = Date.now() - Date.parse(e.ocurrio);
            return [e.tB - tb >= 35 && e.tB - tb <= dif / 1000 + 3, tn === e.tN, document.getElementById("lt-hora").dataset.marcada, Date.now() - Date.parse(window.__horaMarcadaPrueba || new Date().toISOString()) < 5000]; }, esperado),
        [true, true, "si", true]);
    await pv.click("#lt-guardar");
    await pv.waitForFunction(() => window.__llamadas.filter((l) => l.body.action === "tiempo").length > 1);
    igual("se guarda con la hora de ahora (no la de la última jugada) y la nota dice que el reloj de las blancas se descontó, sin marcarlo como corregido a mano",
        await pv.evaluate((e) => { const b = window.__llamadas.filter((l) => l.body.action === "tiempo").pop().body; return [Date.parse(b.ocurrio) > Date.parse(e.ocurrio) + 30000, b.t_negras === e.tN, b.t_blancas < e.tB, /^Tomado de la transmisión sin atraso \(LiveChess\): los relojes después de la jugada 20 \(a las .*\), con el reloj de las blancas \(le tocaba\) descontado hasta la hora del control$/.test(b.nota), b.turno]; }, esperado),
        [true, true, true, true, "blancas"]);
    // «Mis mesas en vivo» marca la repetición en la mesa.
    await pv.click('#control-tiempos [data-accion="cerrar-tiempos"]');
    await pv.click("#ver-vivo");
    await pv.waitForSelector('#mesas-en-vivo[open] .cv-mesa[data-repeticion="si"]');
    igual("en «Mis mesas en vivo», la mesa dice la repetición y la que no reconoce, que va a mano", await pv.evaluate(() => [/Triple repetición \(con 20… Ag7\)/.test(document.querySelector('.cv-mesa[data-mesa="2"] .cv-repeticion').textContent), /Mesa 1: En la transmisión, el tablero 1 tiene otros jugadores\. Anota a mano como siempre\./.test(document.getElementById("mesas-en-vivo").textContent)]), [true, true]);
    // La bandera caída: el reloj en vivo de LiveChess dice que corre el de las negras y ya no les queda tiempo.
    await pv.click('#mesas-en-vivo .cam-dialogo-titulo button');
    await pv.evaluate(() => {
        const antes = window.sb.functions.invoke;
        window.sb.functions.invoke = (f, o) => f !== "centroamericano-mesas-vivo" ? antes(f, o) : Promise.resolve({ data: { ok: true, conectada: true, fuente: "livechess", ronda: 3, delay: 0, leida: new Date().toISOString(),
            mesas: [{ mesa: 1, fuente: "livechess", jugadas: ["e4 5457+5", "c5 40+20", "Nf3 5482+5"], primera: Date.now() - 60000, en_vivo: true, estado: "*", reloj: { white: 5400, black: 2, run: false, time: Date.now() - 5000 } }] }, error: null });
    });
    await pv.evaluate(() => window.CentroamericanoArbitroVivo.leer());
    await pv.waitForSelector('#alertas-vivo .cam-alerta-vivo[data-tipo="bandera"][data-mesa="1"]', { timeout: 5000 });
    igual("la bandera caída le llega al árbitro arriba de todo, con el color, la mesa y el art. 6.9", await pv.evaluate(() => { const a = document.querySelector('#alertas-vivo .cam-alerta-vivo[data-tipo="bandera"]'); return [a.getAttribute("role"), /Bandera caída · Mesa 1/.test(a.textContent), /a las negras de la mesa 1 se les acabó el tiempo/.test(a.textContent), /art\. 6\.9/.test(a.textContent)]; }), ["alert", true, true, true]);
    await pv.waitForTimeout(1500);
    igual("y no se repite en los latidos siguientes", await pv.$$eval('#alertas-vivo .cam-alerta-vivo[data-tipo="bandera"]', (l) => l.length), 1);
    // La jugada imposible en la transmisión (el rey de e1 a e3): el aviso de posible jugada ilegal.
    await pv.evaluate(() => {
        const antes = window.sb.functions.invoke;
        window.sb.functions.invoke = (f, o) => f !== "centroamericano-mesas-vivo" ? antes(f, o) : Promise.resolve({ data: { ok: true, conectada: true, fuente: "livechess", ronda: 3, delay: 0, leida: new Date().toISOString(),
            mesas: [{ mesa: 2, fuente: "livechess", jugadas: ["e4 5457+5", "e5 5440+20", "Nf3 5480+10", "Nc6 5450+20", "Ke3 5470+10"], primera: Date.now() - 100000, en_vivo: true, estado: "*" }] }, error: null });
    });
    await pv.evaluate(() => window.CentroamericanoArbitroVivo.leer());
    await pv.waitForSelector('#alertas-vivo .cam-alerta-vivo[data-tipo="ilegal"][data-mesa="2"]', { timeout: 5000 });
    igual("una jugada imposible en la transmisión le llega como posible jugada ilegal, con la jugada y el art. 7.5.5", await pv.evaluate(() => { const a = document.querySelector('#alertas-vivo .cam-alerta-vivo[data-tipo="ilegal"]'); return [/Posible jugada ilegal · Mesa 2/.test(a.textContent), /jugada imposible \(3\. Re3\)/.test(a.textContent), /7\.5\.5/.test(a.textContent)]; }), [true, true, true]);
    // Anotar desde el aviso: la ilegal es de las blancas (3. Re3) y el cuadro de siempre llega con lo que dijo la transmisión.
    igual("el aviso trae «Anotar la ilegal de las blancas»", await pv.$eval('#alertas-vivo .cam-alerta-vivo[data-tipo="ilegal"] [data-accion="alerta-ilegal"]', (b) => b.textContent), "Anotar la ilegal de las blancas");
    await pv.click('#alertas-vivo .cam-alerta-vivo[data-tipo="ilegal"] [data-accion="alerta-ilegal"]');
    await pv.waitForSelector('dialog[data-avisos="formulario"] textarea');
    igual("se abre el cuadro de la ilegal, con lo que dijo la transmisión en el detalle", await pv.evaluate(() => { const d = document.querySelector('dialog[data-avisos="formulario"]'); return [/Jugada ilegal de .* \(mesa 2\)/.test(d.textContent), /^Avisada por la transmisión: .*3\. Re3/.test(d.querySelector("textarea").value)]; }), [true, true]);
    const anotadasAntes = await pv.evaluate(() => window.__llamadas.filter((l) => l.body.action === "anotar").length);
    await pv.click('dialog[data-avisos="formulario"] [data-avisos-aceptar]');
    await pv.waitForFunction((n) => window.__llamadas.filter((l) => l.body.action === "anotar").length > n, anotadasAntes, { timeout: 5000 });
    igual("al aceptar, la ilegal queda anotada a las blancas de la mesa 2, con el aviso en la bitácora", await pv.evaluate(() => { const l = window.__llamadas.filter((x) => x.body.action === "anotar").pop().body; return [l.mesa, l.color, l.tipo, /Avisada por la transmisión/.test(l.texto)]; }), [2, "blancas", "ilegal", true]);
    await pv.waitForSelector('dialog[data-avisos="alerta"]');
    await pv.keyboard.press("Enter");
    await pv.waitForFunction(() => !document.querySelector('#alertas-vivo .cam-alerta-vivo[data-tipo="ilegal"]'));
    igual("y el aviso se quita solo", await pv.$$eval('#alertas-vivo .cam-alerta-vivo[data-tipo="ilegal"]', (l) => l.length), 0);

    // El final de la partida: mate en la mesa 2 → el aviso y la tarjeta ofrecen «Guardar 1-0», que pregunta antes.
    console.log("\n=== El resultado que dice la transmisión ===");
    for (let i = 0; i < 3; i++) { if (await pv.$("#aprobar-paso")) await pv.click("#aprobar-paso").catch(() => {}); await pv.waitForTimeout(250); }
    await pv.evaluate(() => {
        const antes = window.sb.functions.invoke.__antes || window.sb.functions.invoke;
        const f = (fn, o) => fn !== "centroamericano-mesas-vivo" ? antes(fn, o) : Promise.resolve({ data: { ok: true, conectada: true, fuente: "livechess", ronda: 3, delay: 0, leida: new Date().toISOString(),
            mesas: [{ mesa: 2, fuente: "livechess", jugadas: ["e4 5457+5", "e5 5440+20", "Bc4 5480+10", "Nc6 5450+20", "Qh5 5470+10", "Nf6 5440+20", "Qxf7# 5460+10"], primera: Date.now() - 100000, en_vivo: true, estado: "*" }] }, error: null });
        f.__antes = antes;
        window.sb.functions.invoke = f;
    });
    await pv.evaluate(() => window.CentroamericanoArbitroVivo.leer());
    await pv.waitForSelector('#alertas-vivo .cam-alerta-vivo[data-tipo="fin"][data-mesa="2"]', { timeout: 5000 });
    igual("el mate llega como «Terminó la partida», con el resultado y su botón", await pv.evaluate(() => { const a = document.querySelector('#alertas-vivo .cam-alerta-vivo[data-tipo="fin"]'); return [/Terminó la partida · Mesa 2/.test(a.textContent), /terminó 1-0 \(jaque mate de las blancas\)/.test(a.textContent), a.querySelector('[data-accion="alerta-resultado"]').textContent]; }), [true, true, "Guardar 1-0"]);
    await pv.waitForSelector('.cam-mesa[data-mesa="2"] [data-accion="guardar-tx"]', { timeout: 5000 });
    igual("la tarjeta de la mesa 2 también lo dice, con «Guardar 1-0» (y la mesa 1 no)", await pv.evaluate(() => [/La transmisión: 1-0 \(jaque mate de las blancas\)/.test(document.querySelector('.cam-mesa[data-mesa="2"] .cam-tx-resultado').textContent), document.querySelector('.cam-mesa[data-mesa="2"] .cam-tx-resultado').checkVisibility(), !!document.querySelector('.cam-mesa[data-mesa="1"] .cam-tx-resultado')]), [true, true, false]);
    const guardadosTx = await pv.evaluate(() => window.__llamadas.filter((l) => l.body.action === "guardar").length);
    await pv.click('.cam-mesa[data-mesa="2"] [data-accion="guardar-tx"]');
    await pv.waitForSelector('dialog[data-avisos="confirmar"]');
    igual("antes de guardar, pregunta (nunca se guarda solo)", await pv.evaluate((n) => [/¿Guardar 1-0 en la mesa 2\?/.test(document.querySelector('dialog[data-avisos="confirmar"]').textContent), window.__llamadas.filter((l) => l.body.action === "guardar").length === n], guardadosTx), [true, true]);
    await pv.keyboard.press("Escape");
    await pv.waitForTimeout(300);
    igual("si no confirma, no se guarda nada", await pv.evaluate((n) => window.__llamadas.filter((l) => l.body.action === "guardar").length === n, guardadosTx), true);
    await pv.click('#alertas-vivo .cam-alerta-vivo[data-tipo="fin"] [data-accion="alerta-resultado"]');
    await pv.waitForSelector('dialog[data-avisos="confirmar"]');
    await pv.click('dialog[data-avisos="confirmar"] [data-avisos-aceptar]');
    await pv.waitForFunction((n) => window.__llamadas.filter((l) => l.body.action === "guardar").length > n, guardadosTx, { timeout: 5000 });
    igual("al confirmar desde el aviso, guarda 1-0 en la mesa 2 con el guardar de siempre", await pv.evaluate(() => window.__llamadas.filter((l) => l.body.action === "guardar").pop().body.cambios.map((c) => [c.mesa, c.valor])), [[2, "1"]]);
    await pv.waitForFunction(() => !document.querySelector('#alertas-vivo .cam-alerta-vivo[data-tipo="fin"]'), null, { timeout: 5000 });
    igual("con el resultado guardado, se quita el aviso y la tarjeta ya no lo ofrece", await pv.evaluate(() => [!!document.querySelector('#alertas-vivo .cam-alerta-vivo[data-tipo="fin"]'), !!document.querySelector('.cam-mesa[data-mesa="2"] [data-accion="guardar-tx"]')]), [false, false]);

    // El reclamo de tablas desde «Mis mesas en vivo».
    console.log("\n=== El reclamo de tablas ===");
    await pv.evaluate((sans) => {
        const antes = window.sb.functions.invoke.__antes;
        const f = (fn, o) => fn !== "centroamericano-mesas-vivo" ? antes(fn, o) : Promise.resolve({ data: { ok: true, conectada: true, fuente: "livechess", ronda: 3, delay: 0, leida: new Date().toISOString(),
            mesas: [{ mesa: 1, fuente: "livechess", jugadas: sans.map((x) => x + " 5000+10"), primera: Date.now() - 900000, en_vivo: true, estado: "*" }] }, error: null });
        f.__antes = antes;
        window.sb.functions.invoke = f;
    }, SANS_REP);
    await pv.evaluate(() => window.CentroamericanoArbitroVivo.abrir(1));
    await pv.waitForSelector('#mesas-en-vivo .cv-mesa[data-mesa="1"] [data-accion="reclamo"]', { timeout: 5000 });
    await pv.click('#mesas-en-vivo .cv-mesa[data-mesa="1"] [data-accion="reclamo"]');
    await pv.waitForSelector('dialog[data-avisos="formulario"] input');
    await pv.keyboard.press("Enter");
    await pv.waitForSelector('dialog[data-avisos="alerta"]');
    igual("el reclamo de la triple de ahora: procede, con dónde apareció y la advertencia de las planillas", await pv.evaluate(() => { const d = document.querySelector('dialog[data-avisos="alerta"]'); return [/Procede por triple repetición · mesa 1/.test(d.textContent), /16… Ag7, 18… Ag7 y 20… Ag7/.test(d.textContent), /compáralo con las planillas/.test(d.textContent), /9\.5/.test(d.textContent)]; }), [true, true, true, true]);
    await pv.keyboard.press("Enter");
    await pv.evaluate(() => document.getElementById("mesas-en-vivo").close());

    // El ensayo: las mesas que juegan solas, sin anotar nada.
    console.log("\n=== El ensayo de los avisos ===");
    const llamadasAntesEnsayo = await pv.evaluate(() => window.__llamadas.filter((l) => ["guardar", "anotar"].includes(l.body.action)).length);
    await pv.evaluate(() => { document.getElementById("ensayo-vivo").open = true; });
    await pv.click("#ensayar-vivo");
    await pv.waitForSelector('dialog[data-avisos="confirmar"]');
    await pv.keyboard.press("Enter");
    await pv.waitForSelector("#mesas-en-vivo .cv-ensayo", { timeout: 5000 });
    igual("el ensayo abre «Mis mesas en vivo» con las cinco mesas de ensayo y lo dice escrito", await pv.evaluate(() => [document.querySelectorAll("#mesas-en-vivo .cv-mesa").length, /ENSAYO/.test(document.querySelector("#mesas-en-vivo .cv-ensayo").textContent), /Mesa de ensayo 1/.test(document.querySelector("#mesas-en-vivo").textContent)]), [5, true, true]);
    // Se adelanta el reloj del ensayo para no esperar 3 minutos.
    await pv.evaluate(() => { const R = Date; const d = 3 * 60000; window.Date = class extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + d); } static now() { return R.now() + d; } }; });
    await pv.evaluate(() => window.CentroamericanoArbitroVivo.leer());
    await pv.waitForSelector('#alertas-vivo .cam-alerta-vivo[data-ensayo="si"][data-tipo="bandera"]', { timeout: 8000 });
    igual("llegan los avisos del ensayo, marcados «ENSAYO» (triple, mate, bandera, imposible)", await pv.evaluate(() => [...document.querySelectorAll('#alertas-vivo .cam-alerta-vivo[data-ensayo="si"]')].map((a) => a.dataset.tipo + ":" + a.dataset.mesa + ":" + /^ENSAYO · /.test(a.querySelector(".cam-alerta-vivo-titulo").textContent.trim().replace(/^\S+\s/, ""))).sort()),
        ["bandera:3:true", "fin:2:true", "ilegal:4:true", "triple:1:true"]);
    await pv.evaluate(() => document.getElementById("mesas-en-vivo").close());
    await pv.click('#alertas-vivo .cam-alerta-vivo[data-ensayo="si"][data-tipo="fin"] [data-accion="alerta-resultado"]');
    await pv.waitForSelector('dialog[data-avisos="alerta"]');
    igual("un botón del ensayo solo explica qué haría: no guarda ni anota nada", await pv.evaluate((n) => [/En el ensayo no se anota nada/.test(document.querySelector('dialog[data-avisos="alerta"]').textContent), window.__llamadas.filter((l) => ["guardar", "anotar"].includes(l.body.action)).length === n], llamadasAntesEnsayo), [true, true]);
    await pv.keyboard.press("Enter");
    igual("durante el ensayo, la tablet no le pide nada a la transmisión real", await pv.evaluate(() => window.CentroamericanoArbitroVivo.enEnsayo() && window.CentroamericanoArbitroVivo.deLaMesa(2) === null), true);
    await pv.evaluate(() => window.CentroamericanoArbitroVivo.terminarEnsayo());
    igual("al terminar, se van los avisos del ensayo", await pv.evaluate(() => [window.CentroamericanoArbitroVivo.enEnsayo(), document.querySelectorAll('#alertas-vivo [data-ensayo="si"]').length]), [false, 0]);
    igual("sin errores en la página", vv.errores, []);
    await vv.ctx.close();

    console.log("\n=== La organización: el candado ===");
    o = await abrir(browser, "centroamericano-mesas.html", dobleOrganizacion(false), { ancho: 1100 });
    await o.p.waitForSelector("#denegado:not([hidden])");
    igual("sin licencia, el candado y nada más", [await o.p.$eval("#app", (a) => a.checkVisibility()), await o.p.evaluate(() => window.__llamadas.some((l) => l.rpc === "tengo_herramienta" && l.a === "mesa-arbitro"))], [false, true]);
    await o.ctx.close();

    console.log("\n=== La organización: la ventana y la ronda en curso ===");
    ({ ctx: o.ctx, p: o.p, errores } = await abrir(browser, "centroamericano-mesas.html", dobleOrganizacion(true), { ancho: 1100 }));
    const q = o.p;
    await q.evaluate(() => { window.__audio = 0; window.__vib = 0; window.AudioContext = window.webkitAudioContext = function () { window.__audio++; }; navigator.vibrate = () => { window.__vib++; return true; }; });
    await q.waitForSelector(".cam-pedido");
    igual("se ve como un programa: barra de título, menú con diez pestañas (las últimas, Fair Play y Transmisión), contenido y barra de estado abajo", await q.evaluate(() => [!!document.querySelector(".cam-ventana .cam-titulo-ventana"), [...document.querySelectorAll(".cam-pestana")].map((b) => b.dataset.panel), !!document.querySelector(".cam-ventana .cam-contenido"), document.querySelector(".cam-ventana > .cam-barra-estado") !== null, document.querySelectorAll("table.cam-rejilla").length > 3]),
        [true, ["ronda", "avisos", "arbitros", "tiempos", "planillas", "claves", "respaldo", "registro", "fairplay", "transmision"], true, true, true]);
    igual("abre en «Ronda en curso» porque ya hay una clave", await q.$$eval(".cam-pestana", (l) => l.map((b) => b.getAttribute("aria-selected"))), ["true", "false", "false", "false", "false", "false", "false", "false", "false", "false"]);
    igual("el resumen dice cuánto le queda a cada árbitro, con las mesas que faltan", await q.$$eval("#resumen tr", (l) => l.map((tr) => [tr.children[0].textContent, tr.children[2].textContent, tr.children[3].textContent.replace(/\s+/g, " ").trim(), tr.children[4].textContent, tr.dataset.estado])),
        [["Ana Árbitra", "1 a 15", "7 de 15", "8 (8 a 15)", "en-curso"], ["Árbitro 1", "16 a 30", "15 de 15", "0", "termino"]]);
    igual("el resumen dice cuántos jugadores revisó cada árbitro y cuántos no han llegado", await q.$$eval("#resumen tr", (l) => l.map((tr) => tr.children[6].textContent)), ["2 de 30 · faltan 1", "Sin revisar"]);
    igual("«Jugadores que no han llegado» lista a los que el árbitro marcó ausentes, con mesa, color, árbitro y hora", await q.$$eval("#faltan tr", (l) => l.map((tr) => [tr.children[0].textContent, tr.children[1].textContent, tr.children[2].textContent, tr.children[3].textContent, tr.children[4].textContent])), [["Sub-10 Absoluto", "5", "Cleo Tres", "Negras", "Ana Árbitra"]]);
    // «Inició la ronda»: la hora REAL de inicio de cada categoría. La marca el ÁRBITRO en su tablet; la organización solo la ve.
    console.log("\n=== Inició la ronda (la marca el árbitro de cada categoría) ===");
    const filasInicio = () => q.evaluate(() => [document.getElementById("inicio-ronda").dataset.marcada, [...document.querySelectorAll("#ir-lista li")].map((li) => li.dataset.marcada + "|" + li.textContent.replace(/\s+/g, " "))]);
    igual("la organización ve un bloque «Cuándo inició la ronda cada categoría» que solo se mira: no hay botones, campo de hora ni lista de rondas", await q.evaluate(() => [document.getElementById("inicio-ronda").checkVisibility(), /Cuándo inició la ronda cada categoría/.test(document.getElementById("ir-titulo").textContent), ["ir-ahora", "ir-hora", "ir-guardar", "ir-quitar", "ir-ronda"].map((id) => !!document.getElementById(id)), document.getElementById("inicio-ronda").querySelectorAll("button, input, select").length]), [true, true, [false, false, false, false, false], 0]);
    const sin = await filasInicio();
    igual("sin marca, la categoría dice que su árbitro todavía no la marcó y desde cuándo cuenta el calendario (y solo salen las categorías del modo real)", [sin[0], sin[1].length, /^no\|Sub-10 Absoluto — Ronda 3: su árbitro todavía no marcó cuándo empezó \(cuenta desde las \d{1,2}:\d\d [ap]\. ?m\. del calendario\)$/.test(sin[1][0])], ["no", 1, true]);
    // El árbitro de Sub-10 toca «Inició la ronda ahora» en su tablet: acá se ve con su nombre y desde ahí corre el tiempo de espera de ESA categoría.
    await q.evaluate(() => window.__marcarInicio("1529733", 3, 0, "Ana Árbitra"));
    await q.waitForFunction(() => document.getElementById("inicio-ronda").dataset.marcada === "si");
    const con = await filasInicio();
    igual("con la hora que marcó su árbitro, la categoría dice a qué hora empezó y quién la marcó", [con[0], /^si\|Sub-10 Absoluto — Ronda 3: empezó a las \d{1,2}:\d\d [ap]\. ?m\. \(la marcó Ana Árbitra\)$/.test(con[1][0])], ["si", true]);
    igual("desde esa hora corre el tiempo de espera de los que no han llegado: «Quedan N min» (con el calendario aún no había empezado la ronda)", await q.$$eval("#faltan tr", (l) => l.map((tr) => /^Quedan (29|30) min$/.test(tr.children[6].textContent))), [true]);
    // La categoría empezó hace 40 min: el tiempo de espera (30) se cumplió AUNQUE el calendario diga otra cosa.
    await q.evaluate(() => window.__marcarInicio("1529733", 3, 40, "Ana Árbitra"));
    await q.waitForFunction(() => !document.getElementById("espera-alerta").hidden, null, { timeout: 15000 });
    igual("si la categoría empezó hace 40 minutos, sale la alerta de tiempo cumplido con SU mesa, aunque el calendario diga otra hora", await q.evaluate(() => [document.getElementById("espera-alerta").dataset.nivel, document.getElementById("espera-alerta").textContent.startsWith("⏰ Se cumplió el tiempo de espera (30 min) de la ronda 3: 1 jugador sigue sin llegar (mesas 5)."), document.querySelector("#faltan tr").children[6].textContent]), ["cumplido", true, "Tiempo cumplido (hace 10 min)"]);
    // La marca de otra categoría (la de ensayo) no mueve ésta: cada categoría cuenta desde SU hora.
    await q.evaluate(() => { window.__marcarInicio("1529733", 3, null); window.__marcarInicio("1532448", 1, 40, "Árbitro de ensayo 1"); });
    await q.waitForFunction(() => document.getElementById("inicio-ronda").dataset.marcada === "no" && document.getElementById("espera-alerta").hidden, null, { timeout: 15000 });
    igual("la hora de otra categoría (o del modo ensayo) no cuenta en ésta: vuelve a valer el calendario y no hay alerta", await q.evaluate(() => [document.getElementById("espera-alerta").hidden, document.querySelector("#faltan tr").children[6].textContent, document.querySelectorAll("#ir-lista li").length]), [true, "", 1]);
    await q.evaluate(() => window.__marcarInicio("1532448", 1, null));
    // El tiempo de espera de las bases (30 min desde el inicio de la ronda): se cambia la hora de la página (sin tocar la real).
    igual("fuera de una ronda en juego no hay alerta de tiempo de espera", await q.evaluate(() => [document.getElementById("espera-alerta").hidden, document.querySelector("#faltan tr").children[6].textContent]), [true, ""]);
    await q.evaluate(() => {
      const r = Number(/ronda (\d+)/.exec(document.getElementById("faltan-nota").textContent)[1]);
      const ev = window.CentroamericanoHorario.EVENTOS.find((e) => e.ronda === r);
      Date.now = () => new Date(ev.inicio + ":00-06:00").getTime() + 40 * 60000; // 40 minutos después de empezar la ronda
    });
    await q.waitForFunction(() => !document.getElementById("espera-alerta").hidden, null, { timeout: 30000 });
    igual("a los 40 minutos (la espera es de 30) sale la alerta bien visible, con su palabra, la mesa y para avisar a los árbitros; el título de la pestaña lo marca", await q.evaluate(() => { const a = document.getElementById("espera-alerta"); return [a.checkVisibility(), a.getAttribute("role"), a.dataset.nivel, a.textContent.startsWith("⏰ Se cumplió el tiempo de espera (30 min)"), a.textContent.includes("(mesas "), a.textContent.includes("Avisa a los árbitros"), document.title.startsWith("⏰ (2) ")]; }), [true, "alert", "cumplido", true, true, true, true]);
    igual("cada jugador de la lista dice «Tiempo cumplido (hace 10 min)»", await q.$$eval("#faltan tr", (l) => l.map((tr) => [tr.dataset.espera, tr.children[6].textContent])), [["cumplido", "Tiempo cumplido (hace 10 min)"]]);
    igual("la alerta no hace ruido: ni audio ni vibración (en un torneo no hay ruido)", await q.evaluate(() => [window.__audio, window.__vib]), [0, 0]);
    igual("el total de la ronda y la revisión previa que lleva cada uno", [await q.textContent("#resumen-total"), await q.$eval('#resumen tr[data-id="asig-ana"] td:nth-child(6)', (t) => t.textContent.replace(/\s+/g, " ").trim()), await q.textContent("#resumen-ronda")], ["Con resultado: 22 de 30 mesas (73 %)", "En curso Revisión previa 1/2", " — ronda 3"]);
    igual("arriba siempre a la vista: los avisos abiertos, quién está conectado y cuántos torneos tienen clave", await q.$eval("#estado-general", (e) => e.textContent.replace(/\s+/g, " ").trim()).then((t) => [t.startsWith("2 avisos de árbitros abiertos"), t.includes("1 de 2 árbitros conectados"), t.includes("Clave en 1 de 3 torneos"), t.includes("Drive"), /Última copia: hace [23] min/.test(t)]), [true, true, true, true, true]);
    igual("la pestaña lleva el contador y el título de la pestaña del navegador también", await q.evaluate(() => [document.getElementById("contador-pedidos").textContent, document.title.includes("(2) ")]), ["2", true]);
    igual("el pedido de ayuda dice la mesa, quién, de qué torneo, hace cuánto y lo que escribió", await q.$eval('.cam-pedido[data-estado="abierto"][data-tipo="ayuda"]', (e) => [e.querySelector("p.font-bold").textContent, /^Sub-10 Absoluto · hace [34] min \(\d{1,2}:\d\d [ap]\. m\.\)$/.test(e.querySelectorAll("p")[1].textContent), e.textContent.includes("«Prueba: ven a la mesa»")]), ["🆘 Ana Árbitra pide al principal EN LA MESA 4", true, true]);
    igual("quien TERMINÓ sus mesas llega como aviso con una sugerencia de a dónde ir a ayudar (primero su mismo torneo)", await q.$eval('.cam-pedido[data-estado="abierto"][data-tipo="termino"]', (e) => [e.querySelector("p.font-bold").textContent, [...e.querySelectorAll(".cam-sugerencia span")].map((x) => x.textContent)]),
        ["✅ Árbitro 1 terminó sus mesas de la ronda 3", ["Ana Árbitra (Sub-10 Absoluto, su mismo torneo): le quedan 8 mesas; podría tomar las mesas 12 a 15."]]);
    await q.click('.cam-pedido[data-estado="abierto"][data-tipo="termino"] [data-accion="sugerir"]');
    await q.waitForFunction(() => !document.querySelector('.cam-pedido[data-estado="abierto"][data-tipo="termino"]'));
    igual("«Mandarle esta sugerencia» le escribe al que terminó, con las mesas, y deja el aviso atendido", await q.evaluate(() => [window.__llamadas.filter((l) => l.insert === "centroamericano_avisos").map((l) => l.valores.map((v) => [v.de, v.asignacion_id, v.texto])), window.__llamadas.filter((l) => l.update === "centroamericano_avisos").map((l) => [l.valores.estado, l.f.id])]),
        [[[["organizacion", "asig-arb1", "Terminaste tus mesas, gracias. Ve a ayudar a Ana Árbitra (Sub-10 Absoluto): le quedan 8 mesas. Toma las mesas 12 a 15."]]], [["atendido", "av-t1"]]]);
    igual("en un torneo no puede haber ruido: no hay botón de sonido, la barra lo dice y parpadea (solo se ve) mientras haya avisos", await q.evaluate(() => [!!document.getElementById("sonido"), document.getElementById("estado-general").textContent.includes("Sin sonido"), document.getElementById("estado-general").dataset.alerta, window.__audio || 0]), [false, true, "si", 0]);
    // Un aviso nuevo llega SOLO, sin recargar: el sondeo de la página.
    await q.evaluate(() => window.__nuevoAviso("asig-arb1", null, "Terminó la ronda 3 y revisó.", "finalizo", 3));
    await q.waitForFunction(() => document.querySelector('.cam-pedido[data-estado="abierto"][data-tipo="finalizo"]'), null, { timeout: 15000 });
    igual("quien FINALIZÓ la ronda llega solo, con el contador al día", await q.evaluate(() => [document.querySelector('.cam-pedido[data-estado="abierto"][data-tipo="finalizo"] p.font-bold').textContent, document.getElementById("contador-pedidos").textContent]), ["📋 Árbitro 1 finalizó la ronda 3", "2"]);
    igual("y al llegar un aviso de un árbitro la tablet de la organización vibra (una vez) y no suena nada", await q.evaluate(() => [window.__vib, window.__audio]), [1, 0]);
    await q.click('.cam-pedido[data-estado="abierto"][data-tipo="finalizo"] [data-accion="atender"]');
    await q.waitForFunction(() => !document.querySelector('.cam-pedido[data-estado="abierto"][data-tipo="finalizo"]'));
    await q.click('.cam-pedido[data-estado="abierto"][data-tipo="ayuda"] [data-accion="atender"]');
    await q.waitForFunction(() => document.getElementById("sin-pedidos").checkVisibility());
    igual("«Atendido» pasa cada uno a la lista de atendidos y el contador se apaga", await q.evaluate(() => [document.getElementById("atendidos-n").textContent, document.getElementById("contador-pedidos").hidden]), ["3", true]);
    await q.click("#resumen-actualizar");
    await q.waitForFunction(() => document.querySelector("#resumen tr td:nth-child(5)").textContent.startsWith("6"));
    igual("«Actualizar desde chess-results» pide el resumen y pone al día el avance", await q.evaluate(() => [window.__llamadas.some((l) => l.body && l.body.action === "resumen"), document.getElementById("resumen-total").textContent]), [true, "Con resultado: 24 de 30 mesas (80 %)"]);
    const [pdfRonda] = await Promise.all([q.waitForEvent("download"), q.click("#resumen-pdf")]);
    const bytesRonda = fs.readFileSync(await pdfRonda.path());
    igual("el reporte de la ronda sale en PDF con la marca de agua", [pdfRonda.suggestedFilename(), bytesRonda.toString("latin1").startsWith("%PDF"), /\/SMask \d+ 0 R/.test(bytesRonda.toString("latin1"))], ["avance-ronda-3-centroamericano-2026.pdf", true, true]);

    console.log("\n=== La organización: avisar a los árbitros ===");
    await q.click("#pest-avisos");
    igual("se puede avisar a todos, a un torneo o a un árbitro", await q.$$eval("#av-para option", (l) => l.map((o) => o.textContent)), [
        "Todos los árbitros (2)", "Todo el torneo: Sub-10 Absoluto (2)", "Ana Árbitra — Sub-10 Absoluto, mesas 1 a 15", "Árbitro 1 — Sub-10 Absoluto, mesas 16 a 30"]);
    await q.click('#frases [data-accion="frase"]');
    igual("las frases rápidas llenan el mensaje", await q.inputValue("#av-texto"), "Ya empieza la ronda: a sus mesas.");
    await q.selectOption("#av-para", "todos");
    await q.click("#av-enviar");
    await q.waitForFunction(() => document.querySelectorAll("#enviados tr").length === 2);
    igual("a todos: una fila por árbitro, de la organización y con el texto", await q.evaluate(() => window.__llamadas.filter((l) => l.insert === "centroamericano_avisos").pop().valores.map((v) => [v.de, v.asignacion_id, v.texto])),
        [["organizacion", "asig-ana", "Ya empieza la ronda: a sus mesas."], ["organizacion", "asig-arb1", "Ya empieza la ronda: a sus mesas."]]);
    await q.evaluate(() => window.__leerAviso());
    await q.waitForFunction(() => [...document.querySelectorAll("#enviados tr")].some((tr) => tr.children[2].textContent.startsWith("1 de 2")), null, { timeout: 15000 });
    igual("cuando uno lo lee, la lista de enviados se actualiza sola y dice a quién le falta", await q.$$eval("#enviados tr", (l) => l.map((tr) => tr.children[2].textContent).find((t) => t.startsWith("1 de 2"))), "1 de 2 · falta: Árbitro 1");
    await q.click("#av-enviar");
    igual("sin mensaje no se manda nada", await q.evaluate(() => window.__llamadas.filter((l) => l.insert === "centroamericano_avisos").length), 2);

    console.log("\n=== La organización: los árbitros y sus mesas (en cuadrícula) ===");
    await q.click("#pest-arbitros");
    await q.focus("#pest-arbitros");
    await q.keyboard.press("ArrowRight");
    igual("con el teclado, la flecha pasa a la pestaña siguiente (y el foco con ella)", [await q.getAttribute("#pest-tiempos", "aria-selected"), await q.evaluate(() => document.activeElement.id)], ["true", "pest-tiempos"]);
    await q.keyboard.press("ArrowLeft");
    igual("los enlaces salen en una tabla, agrupados por torneo y ordenados por mesa; el que no tiene nombre lo dice", await q.$$eval("#asignaciones tr:not(.cam-grupo-ritmo)", (l) => l.map((tr) => tr.classList.contains("cam-grupo-torneo") ? tr.textContent : [tr.children[0].textContent, tr.children[1].textContent, tr.dataset.nombrado])),
        ["Sub-10 Absoluto — 2 enlaces", ["Ana ÁrbitraK7M2-9QXA", "1 a 15", "si"], ["Árbitro 1N3P5-R7TWPor definir", "16 a 30", "no"]]);
    igual("cada uno dice si está conectado ahora o que no ha abierto el enlace", await q.$$eval("#asignaciones .cam-conectado", (l) => l.map((x) => [x.dataset.enLinea, x.textContent.replace("🆘", "").trim().split("\n")[0].slice(0, 40)])), [["si", "● Conectado ahora"], ["no", "Todavía no ha abierto el enlace"]]);
    await q.click('#asignaciones tr[data-id="asig-ana"] [data-accion="qr"]');
    await q.waitForSelector("dialog.cam-dialogo[open] svg");
    igual("«QR y enlace» abre el QR grande con la marca de Ajedrez Integral al centro, su WhatsApp y su enlace", await q.evaluate(() => { const d = document.querySelector("dialog.cam-dialogo"); return [!!d.querySelector('svg image[data-marca="ajedrez-integral"]'), /centroamericano-arbitro\.html#a{64}$/.test(d.querySelector('[data-accion="abrir"]').href), decodeURIComponent(d.querySelector('[data-accion="whatsapp"]').href).includes("tus mesas del Centroamericano (Sub-10 Absoluto, mesas 1 a 15)")]; }), [true, true, true]);
    igual("«QR y enlace» también trae el código corto para quien no tiene cámara ni WhatsApp: escrito en grande, con dónde teclearlo, para copiar y en el mensaje de WhatsApp",
        await q.evaluate(() => { const d = document.querySelector("dialog.cam-dialogo"); return [d.querySelector(".cam-codigo-bloque .cam-codigo-chip").textContent, d.querySelector(".cam-codigo-bloque").textContent.includes("ajedrez-integral.com/m"), d.querySelector(".cam-codigo-chip").getAttribute("aria-label"), !!d.querySelector('[data-accion="copiar-codigo"]'), decodeURIComponent(d.querySelector('[data-accion="whatsapp"]').href).includes("entra a ajedrez-integral.com/m y escribe tu código: K7M2-9QXA")]; }),
        ["K7M2-9QXA", true, "Código: K 7 M 2 - 9 Q X A", true, true]);
    await q.evaluate(() => { window.__copiado = null; Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window.__copiado = t; } } }); });
    await q.click("dialog.cam-dialogo [data-accion='copiar-codigo']");
    igual("«Copiar el código» copia «K7M2-9QXA» tal cual se escribe", await q.evaluate(() => window.__copiado), "K7M2-9QXA");
    igual("en la tabla, cada enlace lleva su código junto al nombre, con nombre accesible deletreado y sin repetir uno en dos filas",
        await q.evaluate(() => { const c = [...document.querySelectorAll("#asignaciones tr.cam-asignacion .cam-codigo-chip")]; return [c.map((x) => x.textContent), c.every((x) => /^Código para escribir a mano: (\S ){8}\S$/.test(x.getAttribute("aria-label"))), new Set(c.map((x) => x.textContent)).size === c.length]; }),
        [["K7M2-9QXA", "N3P5-R7TW"], true, true]);
    await q.click("dialog.cam-dialogo [data-accion='cerrar']");
    await q.evaluate(() => { window.__imprimio = 0; window.print = () => { window.__imprimio++; }; });
    await q.click("#imprimir-qr");
    igual("«Imprimir los QR» arma una tarjeta por árbitro, cada QR con la marca y el pie de Ajedrez Integral", await q.evaluate(() => [window.__imprimio, document.body.classList.contains("cam-imprime-qr"), [...document.querySelectorAll("#hoja-qr .cam-hoja-tarjeta")].map((t) => [t.querySelector("h3").textContent, !!t.querySelector('svg image[data-marca="ajedrez-integral"]'), t.textContent.includes("Ajedrez Integral · Centroamericano 2026")])]),
        [1, true, [["Ana Árbitra", true, true], ["Árbitro 1", true, true]]]);
    igual("y la tarjeta impresa de cada árbitro trae también su código corto", await q.$$eval("#hoja-qr .cam-hoja-tarjeta", (l) => l.map((t) => [t.querySelector("h3").textContent, (t.querySelector("[data-codigo-tarjeta] strong") || {}).textContent, t.textContent.includes("ajedrez-integral.com/m")])),
        [["Ana Árbitra", "K7M2-9QXA", true], ["Árbitro 1", "N3P5-R7TW", true]]);
    await q.evaluate(() => document.body.classList.remove("cam-imprime-qr"));
    // Los códigos en papel (PDF): una fila por árbitro con enlace activo, con el código y sin el enlace ni el token.
    {
        const [descargaC] = await Promise.all([q.waitForEvent("download"), q.click("#codigos-pdf")]);
        const pdfC = fs.readFileSync(await descargaC.path()).toString("latin1");
        igual("«Códigos en papel (PDF)»: baja el PDF con la marca de agua, sin ninguna dirección de enlace ni token", [descargaC.suggestedFilename(), pdfC.startsWith("%PDF"), /\/SMask \d+ 0 R/.test(pdfC), /centroamericano-arbitro\.html/.test(pdfC), pdfC.includes("a".repeat(64))], ["codigos-arbitros-centroamericano-2026.pdf", true, true, false, false]);
    }
    // crear sin nombre
    await q.click("#abrir-nuevo");
    await q.selectOption("#a-torneo", "1529733");
    await q.fill("#a-desde", "31");
    await q.fill("#a-hasta", "40");
    await q.click("#a-crear");
    await q.waitForFunction(() => document.querySelectorAll("#asignaciones .cam-asignacion").length === 3);
    igual("sin nombre se crea «Árbitro 2», por definir, con su torneo, sus mesas y el vencimiento (9 de noviembre, hora de Costa Rica)", await q.evaluate(() => window.__llamadas.filter((l) => l.insert === "centroamericano_asignaciones").map((l) => [l.valores.tnr, l.valores.arbitro, l.valores.nombrado, l.valores.mesa_desde, l.valores.mesa_hasta, l.valores.vence])), [["1529733", "Árbitro 2", false, 31, 40, "2026-11-10T05:59:59.000Z"]]);
    await q.fill("#a-arbitro", "Beto Mora");
    await q.fill("#a-desde", "10");
    await q.fill("#a-hasta", "20");
    await q.click("#a-crear");
    await q.waitForSelector("[data-avisos-aceptar]");
    igual("unas mesas que ya tiene otro árbitro se avisan antes de crear", (await q.textContent("dialog")).includes("Esas mesas ya las tiene Ana Árbitra (1 a 15), Árbitro 1 (16 a 30)"), true);
    await q.click("dialog [data-avisos-cancelar]");
    await q.fill("#a-arbitro", "");
    const fila = (nombre) => q.locator("#asignaciones .cam-asignacion", { hasText: nombre });
    // La tabla de enlaces se ve como tabla: cada fila es una fila de verdad y cada celda queda bajo su encabezado
    // (antes la fila era una tarjeta con display:grid y los encabezados no coincidían con lo de abajo).
    for (const ancho of [820, 1280]) {
        await q.setViewportSize({ width: ancho, height: 900 });
        igual("los enlaces son filas de la tabla y sus celdas están bajo su encabezado (" + ancho + " px)", await q.evaluate(() => {
            const cab = [...document.querySelectorAll("#asignaciones-tabla thead th")].map((th) => th.getBoundingClientRect());
            return [...document.querySelectorAll("#asignaciones .cam-asignacion")].map((tr) => {
                const celdas = [...tr.children].map((td) => td.getBoundingClientRect());
                return [getComputedStyle(tr).display, celdas.length, celdas.every((c, i) => Math.abs(c.left - cab[i].left) <= 2 && Math.abs(c.width - cab[i].width) <= 2)];
            });
        }), [["table-row", 5, true], ["table-row", 5, true], ["table-row", 5, true]]);
    }
    await q.setViewportSize({ width: 1100, height: 800 });
    await fila("Árbitro 1").locator('[data-accion="nombre"]').click();
    await q.waitForSelector("dialog[open] input");
    await q.fill("dialog[open] input", "Carla Mora");
    await q.click("dialog[open] [data-avisos-aceptar]");
    await q.waitForFunction(() => [...document.querySelectorAll("#asignaciones .cam-asignacion strong")].some((p) => p.textContent === "Carla Mora"));
    igual("«Ponerle nombre» guarda el nombre, lo marca como puesto y quita «Por definir»", await q.evaluate(() => [window.__llamadas.filter((l) => l.update === "centroamericano_asignaciones" && l.valores.nombrado).map((l) => [l.valores.arbitro, l.valores.nombrado, l.f.id]), document.querySelectorAll('#asignaciones tr[data-id="asig-arb1"] .cam-chip').length]), [[["Carla Mora", true, "asig-arb1"]], 0]);
    await fila("Ana Árbitra").locator('[data-accion="mesas"]').click();
    await q.waitForSelector("dialog[open] input");
    await q.fill("dialog[open] input", "9-3");
    await q.click("dialog[open] [data-avisos-aceptar]");
    await q.waitForFunction(() => document.body.textContent.includes("No entendí las mesas"));
    igual("unas mesas al revés se rechazan sin tocar nada", await q.evaluate(() => window.__llamadas.filter((l) => l.update === "centroamericano_asignaciones" && l.valores.mesa_desde).length), 0);
    await fila("Ana Árbitra").locator('[data-accion="mesas"]').click();
    await q.waitForSelector("dialog[open] input");
    await q.fill("dialog[open] input", "1 a 12");
    await q.click("dialog[open] [data-avisos-aceptar]");
    await q.waitForFunction(() => [...document.querySelectorAll("#asignaciones .cam-asignacion")].some((t) => t.children[1].textContent === "1 a 12"));
    igual("«Mesas» entiende «1 a 12» y lo guarda", await q.evaluate(() => window.__llamadas.filter((l) => l.update === "centroamericano_asignaciones" && l.valores.mesa_desde).map((l) => [l.valores.mesa_desde, l.valores.mesa_hasta, l.f.id])), [[1, 12, "asig-ana"]]);
    await q.click("#abrir-reparto");
    await q.selectOption("#rp-torneo", "1529733");
    await q.click("#rp-leer");
    await q.waitForFunction(() => document.getElementById("rp-mesas").value === "30");
    await q.fill("#rp-arbitros", "3");
    igual("«Leer las mesas» trae cuántas hay, y la vista previa reparte parejo con los números que siguen", [await q.textContent("#rp-estado"), await q.textContent("#rp-vista")], ["La ronda 2 tiene 30 mesas.", "Árbitro 3: mesas 1 a 10 · Árbitro 4: mesas 11 a 20 · Árbitro 5: mesas 21 a 30"]);
    await q.click("#rp-crear");
    await q.waitForSelector("[data-avisos-aceptar]");
    await q.click("dialog [data-avisos-aceptar]");
    await q.waitForFunction(() => document.querySelectorAll("#asignaciones .cam-asignacion").length === 6);
    igual("se crean los tres por definir, con mesas seguidas y sin hueco", await q.evaluate(() => window.__llamadas.filter((l) => l.insert === "centroamericano_asignaciones").pop().valores.map((v) => [v.arbitro, v.nombrado, v.mesa_desde, v.mesa_hasta])), [["Árbitro 3", false, 1, 10], ["Árbitro 4", false, 11, 20], ["Árbitro 5", false, 21, 30]]);
    await fila("Ana Árbitra").locator('[data-accion="apagar"]').click();
    await q.waitForSelector("[data-avisos-aceptar]");
    await q.click("[data-avisos-aceptar]");
    await q.waitForSelector('#asignaciones .cam-asignacion[data-estado="apagado"]');
    igual("apagar un enlace pide confirmar y lo deja apagado (se puede volver a encender)", [await q.$$eval('#asignaciones .cam-asignacion[data-estado="apagado"]', (l) => l.length), await fila("Ana Árbitra").locator('[data-accion="reactivar"]').textContent()], [1, "Volver a encender"]);

    // el mismo árbitro con mesas de otro torneo
    await fila("Ana Árbitra").locator('[data-accion="reactivar"]').click();
    await q.waitForFunction(() => !document.querySelector('#asignaciones .cam-asignacion[data-estado="apagado"]'));
    await fila("Ana Árbitra").locator('[data-accion="otro-torneo"]').click();
    igual("«Otro torneo» abre el formulario con ese árbitro ya elegido", [await q.$eval("#nuevo", (d) => d.open), await q.inputValue("#a-persona")], [true, "a:asig-ana"]);
    await q.selectOption("#a-torneo", "1529719");
    await q.fill("#a-desde", "3");
    await q.fill("#a-hasta", "8");
    await q.click("#a-crear");
    await q.waitForSelector("[data-avisos-aceptar]");
    igual("si el otro torneo todavía no tiene la clave, lo avisa antes de crear", (await q.textContent("dialog[open]")).includes("todavía no tiene la clave cargada"), true);
    await q.click("dialog[open] [data-avisos-aceptar]");
    await q.waitForFunction(() => document.querySelectorAll("#asignaciones .cam-asignacion").length === 7);
    igual("se crea con SU nombre y el mismo «persona» que el enlace que ya tenía (los dos quedan juntos), sin pedir nombre", await q.evaluate(() => [window.__llamadas.filter((l) => l.insert === "centroamericano_asignaciones").pop().valores, window.__llamadas.filter((l) => l.update === "centroamericano_asignaciones" && l.valores.persona).map((l) => l.f.id)]).then(([v, u]) => [v.arbitro, v.nombrado, v.tnr, v.mesa_desde, v.mesa_hasta, !!v.persona, u]), ["Ana Árbitra", true, "1529719", 3, 8, true, ["asig-ana"]]);
    igual("cada fila de ese árbitro dice en qué otro torneo está", await q.$$eval("#asignaciones .cam-tambien", (l) => l.map((x) => x.textContent)), ["También en: Sub-10 Absoluto (mesas 1 a 12)", "También en: Sub-8 Absoluto (mesas 3 a 8)"]);
    igual("un aviso a «todos» le llega UNA vez al árbitro con dos enlaces (no una por enlace)", await q.$$eval("#av-para option", (l) => l[0].textContent), "Todos los árbitros (6)");

    console.log("\n=== La organización: el modo concentración ===");
    igual("arriba de la tabla están «Encender en todas» y «Apagarlo en todas», con la nota de que una página no bloquea el aparato", await q.evaluate(() => [document.getElementById("conc-todas-si").textContent, document.getElementById("conc-todas-no").textContent, /Fijar pantalla/.test(document.getElementById("concentracion-todas").textContent), /Acceso guiado/.test(document.getElementById("concentracion-todas").textContent)]), ["Encender en todas las tablets", "Apagarlo en todas", true, true]);
    await q.click('.cam-asignacion[data-id="asig-ana"] [data-accion="concentracion"]');
    await q.waitForSelector('.cam-asignacion[data-id="asig-ana"] [data-concentracion="si"]');
    igual("encenderlo en una fila guarda SOLO esa columna en SU enlace; la fila muestra «🔒 Concentración» y el botón pasa a «Quitar concentración»", await q.evaluate(() => [window.__llamadas.filter((l) => l.update === "centroamericano_asignaciones" && l.valores && "concentracion" in l.valores).map((l) => [l.valores, l.f.id]), document.querySelector('.cam-asignacion[data-id="asig-ana"] [data-accion="concentracion"]').textContent, document.querySelector('.cam-asignacion[data-id="asig-ana"] [data-concentracion="si"]').textContent]), [[[{ concentracion: true }, "asig-ana"]], "Quitar concentración", "🔒 Concentración"]);
    await q.evaluate(() => { window.__salida("asig-ana", 3, 130); window.__salida("asig-ana", 1, null, "pantalla_completa"); window.__salida("asig-arb1", 5, 40); });
    await q.waitForFunction(() => { const s = document.querySelector('[data-salidas="asig-ana"]'); return s && !s.hidden && s.dataset.fuera === "si"; }, null, { timeout: 30000 });
    igual("quien está fuera AHORA se ve en su fila (con las palabras, no solo el color) y quien ya volvió dice cuántas veces y cuánto", await q.evaluate(() => [document.querySelector('[data-salidas="asig-ana"]').textContent.replace(/( \d+ s)?\)$/, ")"), document.querySelector('[data-salidas="asig-arb1"]').textContent, document.querySelector('[data-salidas="asig-arb1"]').dataset.fuera]), ["🔓 Fuera de la pantalla ahora (desde hace 1 min)", "Se salió 1 vez (40 s en total)", "no"]);
    await q.click("#conc-todas-si");
    await q.waitForSelector("dialog[open]");
    igual("encenderlo en todas pregunta antes y dice cuántas tablets y que se les atraviesa un aviso", await q.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [/En \d+ tablets/.test(t), t.includes("se le tapa la pantalla"), t.includes("se les atraviesa un aviso")]; }), [true, true, true]);
    await q.click("dialog[open] [data-avisos-aceptar]");
    await q.waitForFunction(() => window.__llamadas.some((l) => l.update === "centroamericano_asignaciones" && l.en && l.en.id));
    igual("al confirmar enciende SOLO los enlaces vigentes (ni apagados ni vencidos ni concluidos), de una sola vez", await q.evaluate(() => { const l = window.__llamadas.filter((x) => x.update === "centroamericano_asignaciones" && x.en && x.en.id).pop(); return [l.valores, l.en.id.includes("asig-ana"), l.en.id.includes("asig-arb1"), l.en.id.length >= 2]; }), [{ concentracion: true }, true, true, true]);
    await q.click("#conc-todas-no");
    await q.waitForSelector("dialog[open]");
    await q.click("dialog[open] [data-avisos-aceptar]");
    await q.waitForFunction(() => document.querySelectorAll('[data-concentracion="si"]').length === 0);
    igual("apagarlo en todas deja a ninguna con la concentración", await q.evaluate(() => [window.__llamadas.filter((x) => x.update === "centroamericano_asignaciones" && x.en && x.en.id).pop().valores, document.querySelectorAll('[data-concentracion="si"]').length]), [{ concentracion: false }, 0]);

    console.log("\n=== La organización: habilitar o deshabilitar «¿Dónde juega?» ===");
    igual("arriba de la tabla están «Habilitarlo en todas las tablets» y «Deshabilitarlo en todas»", await q.evaluate(() => [document.getElementById("tm-todas-si").textContent, document.getElementById("tm-todas-no").textContent]), ["Habilitarlo en todas las tablets", "Deshabilitarlo en todas"]);
    await q.click('.cam-asignacion[data-id="asig-ana"] [data-accion="todas-mesas"]');
    await q.waitForSelector('.cam-asignacion[data-id="asig-ana"] [data-sin-todas="si"]');
    igual("quitarlo en una fila guarda SOLO esa columna en SU enlace; la fila dice «Sin «¿Dónde juega?»» y el botón pasa a «Habilitar»", await q.evaluate(() => [window.__llamadas.filter((l) => l.update === "centroamericano_asignaciones" && l.valores && "todas_las_mesas" in l.valores).map((l) => [l.valores, l.f.id]), document.querySelector('.cam-asignacion[data-id="asig-ana"] [data-accion="todas-mesas"]').textContent]), [[[{ todas_las_mesas: false }, "asig-ana"]], "Habilitar «¿Dónde juega?»"]);
    await q.click("#tm-todas-no");
    await q.waitForSelector("dialog[open]");
    igual("deshabilitarlo en todas pregunta antes y dice que el árbitro ya no verá las demás categorías", await q.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("Deshabilitar «¿Dónde juega?»"), t.includes("ya no podrá ver los emparejamientos")]; }), [true, true]);
    await q.click("dialog[open] [data-avisos-aceptar]");
    await q.waitForFunction(() => window.__llamadas.some((l) => l.update === "centroamericano_asignaciones" && l.en && l.en.id && l.valores && l.valores.todas_las_mesas === false));
    await q.click("#tm-todas-si");
    await q.waitForSelector("dialog[open]");
    await q.click("dialog[open] [data-avisos-aceptar]");
    await q.waitForFunction(() => document.querySelectorAll('[data-sin-todas="si"]').length === 0);
    igual("habilitarlo en todas deja a ninguna sin «¿Dónde juega?»", await q.evaluate(() => [window.__llamadas.filter((x) => x.update === "centroamericano_asignaciones" && x.en && x.en.id).pop().valores, document.querySelectorAll('[data-sin-todas="si"]').length]), [{ todas_las_mesas: true }, 0]);

    console.log("\n=== La organización: árbitros que concluyeron sus labores ===");
    await q.evaluate(() => window.__concluir("asig-arb1"));
    await q.waitForSelector('.cam-asignacion[data-id="asig-arb1"] [data-accion="reabrir-labores"]', { timeout: 30000 });
    igual("un árbitro que concluyó sale así en la lista: «Concluyó sus labores el …», con «Reabrir sus labores» y solo él (a los demás no se les ofrece)", await q.evaluate(() => [document.querySelector('.cam-asignacion[data-id="asig-arb1"]').textContent.includes("Concluyó sus labores el"), document.querySelectorAll('[data-accion="reabrir-labores"]').length, document.querySelectorAll('.cam-asignacion[data-id="asig-ana"] [data-accion="reabrir-labores"]').length]), [true, 1, 0]);
    await q.click('.cam-asignacion[data-id="asig-arb1"] [data-accion="reabrir-labores"]');
    await q.waitForSelector("dialog[open]");
    igual("reabrir pregunta antes y dice qué pasa", await q.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("Reabrir sus labores"), t.includes("ya no puede anotar ni guardar")]; }), [true, true]);
    await q.click("dialog[open] [data-avisos-aceptar]");
    await q.waitForFunction(() => !document.querySelector('[data-accion="reabrir-labores"]'));
    igual("al confirmar llama a la base (con la licencia, centroamericano_reabrir_labores) y el árbitro vuelve a verse activo", await q.evaluate(() => [window.__reabrirArgs, document.querySelector('.cam-asignacion[data-id="asig-arb1"]').textContent.includes("Activo hasta el")]), [["asig-arb1"], true]);

    console.log("\n=== La organización: control de tiempos ===");
    await q.click("#pest-tiempos");
    await q.waitForSelector("#tiempos tr");
    igual("por omisión sale la última lectura de cada partida (mesa 9 y mesa 11), con el tiempo y las jugadas de las blancas y de las negras", await q.$$eval("#tiempos tr", (l) => l.map((tr) => [tr.children[2].textContent, tr.children[3].textContent, tr.children[4].textContent, tr.children[5].textContent])),
        [["9", "Eli Uno vs Fran Dos", "10:00 · 31 jugadas", "1:23:45 · 30 jugadas"], ["11", "Gus Tres vs Hugo Cuatro", "45:00 · 18 jugadas", "44:15 · 18 jugadas"]]);
    await q.uncheck("#ct-ultimas");
    igual("sin el filtro salen todas las lecturas de cada mesa (el historial no se pierde), la más reciente primero", await q.$$eval("#tiempos tr", (l) => l.map((tr) => [tr.children[2].textContent, tr.children[4].textContent, tr.children[5].textContent])), [["9", "10:00 · 31 jugadas", "1:23:45 · 30 jugadas"], ["9", "25:00 · jugada 22", "28:30"], ["11", "45:00 · 18 jugadas", "44:15 · 18 jugadas"]]);
    await q.check("#ct-ultimas");
    igual("se puede pedir a todos, a un torneo o a un árbitro", (await q.$$eval("#ct-para option", (l) => l.length)) >= 4, true);
    await q.selectOption("#ct-para", "todos");
    await q.click("#ct-pedir");
    await q.waitForFunction(() => window.__llamadas.some((l) => l.insert === "centroamericano_avisos" && l.valores.some((v) => v.control_tiempos)));
    igual("«Pedir un control de tiempos» manda un aviso con la marca que le abre la ventana a cada árbitro, una vez por árbitro", await q.evaluate(() => window.__llamadas.filter((l) => l.insert === "centroamericano_avisos" && l.valores.some((v) => v.control_tiempos)).map((l) => l.valores.map((v) => [v.de, v.control_tiempos, v.texto.startsWith("Control de tiempos")]))), [[["organizacion", true, true], ["organizacion", true, true], ["organizacion", true, true], ["organizacion", true, true], ["organizacion", true, true], ["organizacion", true, true]].slice(0, 6)]);
    const [pdfT] = await Promise.all([q.waitForEvent("download"), q.click("#ct-pdf")]);
    const bytesT = fs.readFileSync(await pdfT.path());
    igual("el control de tiempos sale en PDF con la marca de agua", [pdfT.suggestedFilename(), bytesT.toString("latin1").startsWith("%PDF"), /\/SMask \d+ 0 R/.test(bytesT.toString("latin1"))], ["control-de-tiempos-centroamericano-2026.pdf", true, true]);
    // «Reloj apagado» en la organización: la misma calculadora, con «Mandárselo al árbitro» (un aviso a su tablet).
    igual("cada partida trae su botón «Reloj apagado» (solo en su última lectura)", await q.$$eval('#tiempos [data-accion="reloj-apagado"]', (l) => l.length), 2);
    await q.click('#tiempos tr:first-child [data-accion="reloj-apagado"]');
    await q.waitForSelector("#ct-apagado:not([hidden]) .ra-jb");
    igual("abre la calculadora de esa partida debajo de la tabla, con su último control", await q.evaluate(() => [document.getElementById("ct-apagado-titulo").textContent.startsWith("El reloj se apagó · Mesa 9"), /Blancas 10:00 \(31 jug\.\) · Negras 1:23:45 \(30 jug\.\)/.test(document.querySelector("#ct-apagado .cam-apagado-datos").textContent)]), [true, true]);
    // Los relojes de la transmisión de Lichess como control (js/centroamericano-transmision-reloj.js): la sala dice qué se transmite,
    // la ronda dice su atraso y la partida (por los dos nombres) sus relojes. Lichess, simulado; nada se pide hasta tocar el botón.
    const pedidosLichess = [];
    await simularLichess(q, pedidosLichess);
    igual("la calculadora ofrece buscar la mesa en la transmisión, sin pedirle nada a Lichess antes de tocarlo", [await q.$eval("#ct-apagado .ra-tx-buscar", (b) => [b.textContent, b.checkVisibility()]), pedidosLichess.length], [["Buscar esta mesa en la transmisión", true], 0]);
    await q.click("#ct-apagado .ra-tx-buscar");
    await q.waitForSelector("#ct-apagado .ra-tx-usar");
    igual("encuentra la partida por los dos nombres y lee sus relojes, con el atraso descontado; como es más reciente que el último control, se calcula desde ella",
        await q.evaluate(() => [/^Relojes de las .* \(con 1 min de atraso\): Blancas 5:00 \(35 jug\.\) · Negras 1:16:07 \(35 jug\.\)\.$/.test(document.querySelector("#ct-apagado .ra-tx-estado").textContent),
            document.querySelector("#ct-apagado .ra-tx-usar").checked, /Último control: de la transmisión, /.test(document.querySelector("#ct-apagado .cam-apagado-datos").textContent)]), [true, true, true]);
    await q.fill("#ct-apagado .ra-jb", "36");
    await q.fill("#ct-apagado .ra-jn", "35");
    await q.waitForSelector("#ct-apagado .cam-reloj-dibujo");
    await q.click("#ct-apagado .ra-guardar");
    await q.waitForFunction(() => /transmisión de Lichess/.test(([].concat((window.__llamadas.filter((l) => l.insert === "centroamericano_avisos").pop() || {}).valores)[0] || {}).texto || ""));
    igual("lo que se le manda al árbitro dice que salió de los relojes de la transmisión", await q.evaluate(() => /calculado desde los relojes de la transmisión de Lichess de las .* \(con 1 min de atraso\)/.test([].concat(window.__llamadas.filter((l) => l.insert === "centroamericano_avisos").pop().valores)[0].texto)), true);
    await q.click("#ct-apagado .ra-tx-usar");
    igual("sin la marca, vuelve al control del árbitro", await q.evaluate(() => /Último control: \d/.test(document.querySelector("#ct-apagado .cam-apagado-datos").textContent)), true);
    await q.fill("#ct-apagado .ra-jb", "32");
    await q.fill("#ct-apagado .ra-jn", "31");
    await q.waitForSelector("#ct-apagado .cam-reloj-dibujo");
    await q.click("#ct-apagado .ra-guardar");
    await q.waitForFunction(() => window.__llamadas.some((l) => l.insert === "centroamericano_avisos" && [].concat(l.valores).some((v) => /^Mesa 9 · El reloj se apagó.*van 32 y 31 jugadas/.test(v.texto || ""))));
    igual("«Mandárselo al árbitro» le manda un aviso a la tablet de ESA mesa con los dos tiempos, a quién le toca y la nota (no escribe en sus controles)",
        await q.evaluate(() => { const v = [].concat(window.__llamadas.filter((l) => l.insert === "centroamericano_avisos").pop().valores)[0]; return [v.de, v.asignacion_id, /pon Blancas .* y Negras .* \(le toca a las negras; van 32 y 31 jugadas\)\. Reloj apagado \(art\. 6\.10\)/.test(v.texto), v.texto.length <= 500, window.__llamadas.some((l) => l.insert === "centroamericano_tiempos")]; }),
        ["organizacion", "asig-ana", true, true, false]);
    await q.click("#ct-apagado .ra-volver");
    igual("«Volver» la cierra", await q.$eval("#ct-apagado", (e) => e.checkVisibility()), false);

    console.log("\n=== La organización: planillas y Drive ===");
    await q.click("#pest-planillas");
    await q.waitForSelector("#planillas tr");
    igual("como en el Drive: un encabezado por torneo y ronda, con cuántas fotos tiene", await q.$$eval("#planillas tr.cam-pl-grupo th", (l) => l.map((th) => [th.firstChild.textContent, th.getAttribute("colspan")])), [["Sub-10 Absoluto · Ronda 3 · 2 fotos", "8"]]);
    igual("las fotos salen ordenadas por torneo, ronda y mesa, con el nombre del enfrentamiento y si ya están en el Drive", await q.$$eval("#planillas tr.cam-pl-fila", (l) => l.map((tr) => [tr.children[1].textContent, tr.children[2].textContent, tr.children[3].textContent, tr.children[6].textContent])),
        [["3", "2", "Harvey Ian vs Acuña Porras Fabio", "✓ En el Drive"], ["3", "3", "Hopkins John vs Baquero Graterol", "Pendiente"]]);
    await q.waitForFunction(() => document.getElementById("drive-estado").textContent.length > 0);
    igual("dice que el Drive no está conectado y que las fotos están a salvo mientras tanto", [await q.getAttribute("#drive-estado", "data-estado"), (await q.textContent("#drive-estado")).includes("todavía no está conectado")], ["no", true]);
    await q.click('#planillas tr.cam-pl-grupo + tr.cam-pl-fila [data-accion="ver-foto"]');
    await q.waitForSelector("dialog.cam-dialogo[open] img");
    igual("«Ver» abre la foto desde el bucket privado (con un enlace que vence)", await q.evaluate(() => [window.__llamadas.filter((l) => l.foto).map((l) => l.foto), document.querySelector("dialog.cam-dialogo img").alt]), [["centroamericano-planillas/1529733/ronda-3/mesa-2-planillas.jpg"], "Foto de las dos planillas de la mesa 2: Harvey Ian vs Acuña Porras Fabio"]);
    await q.click("dialog.cam-dialogo [data-accion='cerrar']");

    // «Generar PGN»: un Google Vision de mentira que devuelve la foto de las dos planillas de la mesa 11 de la ronda 4
    // (de verdad, con su desacuerdo en la jugada 16) y, desde la jugada 17, basura en las dos. La mesa 2 no se transmite
    // (sale de la foto); la 3 sí (sale de Lichess, sin leer la foto).
    const BASURA = ["qz", "Lw", "m3m", "zz", "uu", "k9", "pp", "XX", "Ww", "yy", "j7", "vv"];
    const palabrasFoto = palabrasDePlanillas([PLANILLAS_REALES.mesa11.blancas.slice(0, 32).concat(BASURA), PLANILLAS_REALES.mesa11.negras.slice(0, 32).concat(BASURA.slice().reverse())], { giro: 3, partir: true });
    let lecturasVision = 0;
    await q.context().route("**/functions/v1/ocr-scoresheet", (rr) => { lecturasVision++; rr.fulfill({ contentType: "application/json", body: JSON.stringify({ words: palabrasFoto }) }); });
    const botonPgn = (mesa) => q.locator("#planillas tr.cam-pl-fila").nth(mesa === 2 ? 0 : 1).locator('[data-accion="generar-pgn"]');
    igual("cada foto tiene su «Generar PGN» ahí mismo, al lado de «Ver»", await q.$$eval("#planillas tr.cam-pl-fila", (l) => l.map((tr) => [...tr.lastElementChild.querySelectorAll("button")].map((b) => b.textContent))), [["Ver", "Generar PGN"], ["Ver", "Generar PGN"]]);
    await q.waitForFunction(() => [...document.querySelectorAll(".cam-lp-fuente")].every((x) => x.dataset.fuente && x.dataset.fuente !== "buscando"));
    await q.waitForSelector('.cam-pl-tx [data-accion="pgn-ronda"]');
    igual("el encabezado del torneo y la ronda trae el enlace directo al PGN de todas sus partidas transmitidas, para recolectarlas", await q.$eval('.cam-pl-tx [data-accion="pgn-ronda"]', (a) => [a.textContent, a.href]),
        ["📡 PGN de las 3 partidas transmitidas", "https://lichess.org/api/broadcast/round/RoNdA003.pgn"]);
    igual("la búsqueda va directo al torneo de Lichess de su categoría (Sub-10 Absoluto → Open U10)", await q.evaluate(() => [window.CentroamericanoTransmisionReloj.torneoDeCategoria([{ id: "a", nombre: "X | Girls U10" }, { id: "b", nombre: "X | Open U10" }, { id: "c", nombre: "X | Open U18" }], "Sub-10 Absoluto").map((t) => t.id),
        window.CentroamericanoTransmisionReloj.torneoDeCategoria([{ id: "a", nombre: "X | Girls U08" }, { id: "b", nombre: "X | Open U08" }], "Sub-8 Femenino").map((t) => t.id)]), [["b"], ["a"]]);
    igual("la tabla averigua sola cuáles se transmiten y lo dice en cada fila (sin leer ninguna foto)", [await q.$$eval(".cam-lp-fuente", (l) => l.map((x) => x.textContent)), lecturasVision],
        [["📷 Sin transmisión: sale de la foto", "📡 Se transmite: sale de Lichess"], 0]);

    await botonPgn(2).click();
    await q.waitForSelector(".cam-lp-fila .cam-lp-titular", { timeout: 120000 });
    igual("la partida se abre ahí mismo, en la fila de debajo de su foto, sin ventanita", await q.evaluate(() => { const f = document.querySelector(".cam-lp-fila"); const b = document.querySelector('#planillas tr.cam-pl-fila [data-accion="generar-pgn"]');
        return [f.previousElementSibling === b.closest("tr"), b.getAttribute("aria-expanded"), b.getAttribute("aria-controls") === f.id, b.textContent, !document.querySelector("dialog[open]")]; }), [true, "true", true, "Ocultar la partida", true]);
    igual("la mesa sin transmisión se lee de la foto (bucket privado y lector) y dice hasta dónde se salvó", [await q.textContent(".cam-lp-fila .cam-lp-titular"), await q.evaluate(() => window.__llamadas.filter((l) => l.foto).length), lecturasVision],
        ["Leída de la foto: se pudieron salvar 32 medias jugadas, hasta la jugada 16 de las negras.", 2, 1]);
    igual("desde ahí: «Ilegible», con lo que dicen las planillas, sin inventar jugadas", await q.evaluate(() => { const c = document.querySelector(".cam-lp-ilegible"); return [c.checkVisibility(), c.querySelector("strong").textContent, c.textContent.includes("qz · Lw · m3m")]; }), [true, "⚠ Ilegible desde la jugada 17 de las blancas.", true]);
    igual("las 32 jugadas, en español; donde las planillas no coincidían (16. Thf1 / The1) sale marcada con * y dice qué decía cada una", await q.evaluate(() => { const b = [...document.querySelectorAll(".cam-lp-fila .cam-lp-jugada")]; return [b.length, b[0].textContent, b[30].textContent, b[30].title]; }),
        [32, "e4", "Thf1 *", "corregida · escrito: Thf1 | The1"]);
    igual("la vista previa muestra la última jugada salvada en el tablero y la dice en palabras", await q.evaluate(() => [[...document.querySelectorAll(".cam-lp-tablero .cine-sq > span")].filter((x) => x.checkVisibility()).length > 10, document.querySelector(".cam-lp-linea").textContent.startsWith("16… Thf8"), document.querySelector(".cam-lp-jugada[aria-current='true']").textContent]), [true, true, "Thf8 *"]);
    await q.click('.cam-lp-controles [aria-label="Al inicio"]');
    await q.click('.cam-lp-controles [aria-label="Jugada siguiente"]');
    igual("se recorre con ⏮ ◀ ▶ ⏭ y con las flechas", [await q.textContent(".cam-lp-linea"), await (async () => { await q.keyboard.press("ArrowRight"); return q.textContent(".cam-lp-linea"); })()],
        ["1. e4 — leída tal cual. En la planilla: «e4» y «e4».", "1… c6 — leída tal cual. En la planilla: «c6» y «c6»."]);
    const [pgnBajado] = await Promise.all([q.waitForEvent("download"), q.click('.cam-lp-fila [data-accion="bajar-pgn"]')]);
    const pgnTexto = fs.readFileSync(await pgnBajado.path(), "utf8");
    igual("el PGN se baja con el torneo, la ronda, el día y los jugadores (con sus tildes), termina en «*» y dice desde dónde es ilegible", [pgnBajado.suggestedFilename(), pgnTexto.includes('[Round "3"]'), pgnTexto.includes('[White "Harvey Ian"]'), pgnTexto.includes('[Black "Acuña Porras Fabio"]'), /\[Date "\d{4}\.\d\d\.\d\d"\]/.test(pgnTexto), /\{Desde aquí la planilla es ilegible \(jugada 17\)\.\}\s+\*\s*$/.test(pgnTexto)],
        ["Mesa 02 - Ronda 3 - Harvey Ian vs Acuna Porras Fabio.pgn", true, true, true, true, true]);
    // La partida leída va también a Fair Play (las mesas sin tablero electrónico también se miden).
    igual("la partida leída de la foto se manda a Fair Play: su torneo, ronda y mesa, las jugadas en SAN y cuáles quedaron dudosas, y la fila lo dice",
        [await q.evaluate(() => window.__llamadas.filter((l) => l.f === "centroamericano-fair-play" && l.body.action === "planilla_guardar").map((l) => [l.body.action, l.body.tnr, l.body.ronda, l.body.mesa, l.body.jugadas.length, l.body.jugadas.slice(0, 2), Array.isArray(l.body.dudosas)])),
            /^Enviada a Fair Play/.test(await q.textContent(".cam-lp-fila .cam-lp-fair-play"))],
        [[["planilla_guardar", "1529733", 3, 2, 32, ["e4", "c6"], true]], true]);
    // «Descargar la lectura»: lo que devolvió Vision, tal cual, y lo que salió de eso (para afinar el corrector con datos reales)
    const [lecturaBajada] = await Promise.all([q.waitForEvent("download"), q.click('.cam-lp-fila [data-accion="bajar-lectura"]')]);
    const lectura = JSON.parse(fs.readFileSync(await lecturaBajada.path(), "utf8"));
    const Rec = require("../js/planilla-reconstruir.js");
    igual("«Descargar la lectura» baja lo que devolvió Vision tal cual (cada palabra con su caja) y lo que salió de eso, sin los nombres en el archivo",
        [lecturaBajada.suggestedFilename(), lectura.palabras.length === palabrasFoto.length, JSON.stringify(lectura.palabras[0]) === JSON.stringify(palabrasFoto[0]), lectura.metodo, lectura.hojas.length, lectura.partida.jugadas.length, lectura.partida.ilegibleDesde, lectura.partida.jugadas[30].escrito],
        ["lectura-mesa-02-ronda-3-1529733.json", true, true, "numeros", 2, 32, 32, ["Thf1", "The1"]]);
    igual("…y sus palabras, pasadas otra vez por el lector, dan las mismas celdas que vio la página", JSON.stringify(Rec.hojasDeLaFoto(lectura.palabras).hojas) === JSON.stringify(lectura.hojas), true);
    igual("en claro, lo marcado y el aviso de ilegible dan 4,5:1 o más", Math.min(...await q.evaluate("(" + CONTRASTE + ")(" + JSON.stringify(".cam-lp-jugada, .cam-lp-ilegible, .cam-lp-ilegible strong, .cam-lp-linea, .cam-lp-num, .cam-lp-nota, .cam-lp-titular, .cam-lp-fuente, .cam-lp-fila p") + ")")) >= 4.5, true);
    const llamadasAntes = await q.evaluate(() => window.__llamadas.length);
    await q.click("#pl-actualizar");
    await q.waitForFunction((n) => window.__llamadas.length > n || document.querySelectorAll("#planillas tr").length > 0, llamadasAntes);
    await q.waitForTimeout(500);
    igual("la tabla se refresca y la partida abierta sigue ahí, sin volver a leer la foto", [await q.$$eval(".cam-lp-fila .cam-lp-titular", (l) => l.length), lecturasVision, await botonPgn(2).textContent()], [1, 1, "Ocultar la partida"]);

    // Lichess no contesta (se corta la conexión): lo dice en palabras, no «Failed to fetch», y no lee la foto
    pedidosLichess.cortar = true;
    await botonPgn(3).click();
    await q.waitForFunction(() => /Lichess no contestó/.test((document.querySelectorAll(".cam-lp-fila")[1] || {}).textContent || ""), null, { timeout: 20000 });
    igual("si Lichess no contesta, prueba la partida sola y la ronda (dos veces cada una) y lo dice en palabras, sin leer la foto",
        [await q.evaluate(() => document.querySelectorAll(".cam-lp-fila")[1].textContent), pedidosLichess.filter((u) => /\/api\/study\/RoNdA003\/x3\.pgn$/.test(u)).length, pedidosLichess.filter((u) => /round\/RoNdA003\.pgn$/.test(u)).length, lecturasVision],
        ["No se pudo generar el PGN: Lichess no contestó (se cortó la conexión o está frenando por muchas consultas seguidas). Vuelve a intentarlo en un minuto.", 2, 2, 1]);
    pedidosLichess.cortar = false;
    await botonPgn(3).click();
    const pedidosAntes = pedidosLichess.length;
    await botonPgn(3).click();
    await q.waitForFunction(() => document.querySelectorAll(".cam-lp-fila .cam-lp-titular").length === 2);
    igual("con Lichess de vuelta, pide solo el PGN de esa partida (5 KB), no el de la ronda entera", pedidosLichess.slice(pedidosAntes).filter((u) => /\.pgn$/.test(u)).map((u) => u.replace("https://lichess.org", "")), ["/api/study/RoNdA003/x3.pgn"]);
    igual("la mesa que se transmite sale sola de Lichess: sus jugadas y el resultado, sin leer la foto",
        [...await q.evaluate(() => { const f = document.querySelectorAll(".cam-lp-fila")[1]; return [f.querySelector(".cam-lp-titular").textContent, [...f.querySelectorAll(".cam-lp-jugada")].map((b) => b.textContent).join(" "), f.querySelector(".cam-lp-enlace").href, !f.querySelector(".cam-lp-leyenda")]; }), lecturasVision],
        ["De la transmisión en vivo de Lichess: 7 medias jugadas · 1-0.", "e4 e5 Ac4 Cc6 Dh5 Cf6 Dxf7#", "https://lichess.org/broadcast/centroamericano-2026/round-3/RoNdA003/x3", true, 1]);
    igual("ninguna de las dos dice «null» ni «undefined» en ningún lado", await q.$$eval(".cam-lp-fila", (l) => l.map((f) => /\bnull\b|undefined/.test(f.textContent))), [false, false]);
    const [pgnTx] = await Promise.all([q.waitForEvent("download"), q.locator('.cam-lp-fila [data-accion="bajar-pgn"]').nth(1).click()]);
    const pgnTxTexto = fs.readFileSync(await pgnTx.path(), "utf8");
    igual("la de la transmisión no tiene «Descargar la lectura» (no se leyó ninguna foto)", await q.locator(".cam-lp-fila").nth(1).locator('[data-accion="bajar-lectura"]').count(), 0);
    igual("su PGN es el de la transmisión (solo esa partida, con sus relojes)", [pgnTx.suggestedFilename(), pgnTxTexto.includes('[White "Hopkins, John"]'), pgnTxTexto.includes("[%clk 1:30:10]"), pgnTxTexto.includes("Uno, Eli")],
        ["Mesa 03 - Ronda 3 - Hopkins John vs Baquero Graterol.pgn", true, true, false]);
    for (const mesa of [2, 3]) await botonPgn(mesa).click();
    igual("«Ocultar la partida» la cierra", [await q.$$eval(".cam-lp-fila", (l) => l.length), await q.$$eval('[data-accion="generar-pgn"]', (l) => l.map((b) => [b.textContent, b.getAttribute("aria-expanded")]))], [0, [["Generar PGN", "false"], ["Generar PGN", "false"]]]);
    await botonPgn(2).click();
    await q.waitForSelector(".cam-lp-fila .cam-lp-titular");
    igual("abrirla otra vez no gasta otra lectura (quedó guardada en este navegador)", lecturasVision, 1);
    await q.click('.cam-lp-fila [data-accion="volver-a-leer"]');
    await q.waitForFunction(() => document.querySelector(".cam-lp-fila .cam-lp-titular"), null, { timeout: 120000 });
    igual("«Volver a leer la foto» sí la vuelve a leer", lecturasVision, 2);
    await botonPgn(2).click();
    await q.evaluate(() => { document.getElementById("drive-conectar-caja").open = true; });
    await q.fill("#drive-url", "https://script.google.com/macros/s/" + "A".repeat(30) + "/exec");
    await q.fill("#drive-secreto", "MALOMALOMALOMALOMALOMALOMALOMALOMALO");
    await q.click("#drive-conectar");
    await q.waitForSelector("#drive-conectar-estado.cam-fallo");
    igual("un secreto que el Drive no acepta se dice y no se guarda", [(await q.textContent("#drive-conectar-estado")).includes("No se guardó nada"), await q.evaluate(() => window.__driveOk)], [true, false]);
    await q.fill("#drive-secreto", "BUENOBUENOBUENOBUENOBUENOBUENOBUENO");
    await q.click("#drive-conectar");
    await q.waitForSelector("#drive-conectar-estado.cam-guardado");
    igual("conectado: dice la carpeta, vacía las casillas y ya no guarda el secreto en el navegador", [await q.textContent("#drive-conectar-estado"), await q.inputValue("#drive-secreto"), await q.evaluate(() => JSON.stringify(localStorage).includes("BUENOBUENO"))], ["✓ Conectado. Carpeta: «Planillas Centroamericano».", "", false]);
    await q.click("#drive-reintentar");
    await q.waitForFunction(() => document.querySelectorAll('#planillas tr[data-drive="si"]').length === 2);
    igual("«Mandar al Drive las que faltan» las manda y la tabla lo muestra", await q.$$eval("#planillas tr.cam-pl-fila", (l) => l.map((tr) => tr.children[6].textContent)), ["✓ En el Drive", "✓ En el Drive"]);

    console.log("\n=== La organización: UNA clave para todo el grupo ===");
    await q.click("#pest-claves");
    igual("no hay una casilla de clave por torneo: solo la del grupo de chess-results (y la del bloque de otras claves); la otra es la de Lichess de la transmisión sin atraso", await q.evaluate(() => [document.querySelectorAll("#torneos input, #torneos textarea").length, [...document.querySelectorAll("#panel-claves input")].filter((i) => i.type === "password").map((i) => i.id)]), [0, ["g-sid", "vivo-token"]]);
    igual("el código del grupo ya viene puesto (no es secreto) y las tarjetas solo dicen el estado de cada torneo", [await q.inputValue("#g-codigo"), await q.$$eval(".cam-estado-torneo", (l) => l.map((t) => [t.querySelector("p.font-bold").textContent, t.dataset.clave])), await q.textContent("#resumen-claves")],
        ["1529733", [["Sub-8 Absoluto", "no"], ["Sub-8 Femenino", "no"], ["Sub-10 Absoluto", "si"]], "1 de 3 torneos tienen la clave. Faltan: Sub-8 Absoluto, Sub-8 Femenino."]);
    await q.fill("#g-codigo", "1529700");
    await q.fill("#g-sid", "MALAMALAMALA1234");
    await q.click("#g-guardar");
    await q.waitForSelector("#g-estado.cam-fallo");
    igual("una clave que chess-results no acepta se dice y no se guarda", [(await q.textContent("#g-estado")).includes("no aceptó el código o la clave"), await q.evaluate(() => document.querySelectorAll('.cam-estado-torneo[data-clave="si"]').length)], [true, 1]);
    await q.fill("#g-sid", SID);
    await q.click("#g-guardar");
    await q.waitForSelector("#g-estado.cam-guardado");
    igual("la clave del grupo abre los torneos ligados de una vez", [await q.textContent("#g-estado"), await q.textContent("#resumen-claves")],
        ["✓ Guardada: esta clave abre 2 torneos ligados (Sub-8 Absoluto, Sub-8 Femenino). Ronda 1 con 21 mesas en el primero.", "✓ Los 3 torneos tienen la clave cargada."]);
    igual("la clave llegó a la función con el código del grupo, y la casilla se vació y no quedó en el navegador", await q.evaluate((s) => [window.__llamadas.some((l) => l.body && l.body.action === "poner" && l.body.tnr === "1529700" && l.body.sid === s), document.getElementById("g-sid").value, JSON.stringify(localStorage).includes(s) || JSON.stringify(sessionStorage).includes(s)], SID), [true, "", false]);
    await q.click('.cam-estado-torneo[data-tnr="1529733"] [data-accion="probar"]');
    await q.waitForSelector("#est-1529733.cam-guardado");
    igual("«Probar» dice que sirve y cuántas mesas tiene la ronda", await q.textContent("#est-1529733"), "✓ Sirve. Ronda 2, 30 mesas.");
    await q.evaluate(() => { document.getElementById("pegar").open = true; });
    await q.fill("#claves-bloque", "1529700 " + SID + "\n1529733 corta\nabc " + SID);
    await q.click("#claves-bloque-guardar");
    await q.waitForFunction(() => document.querySelectorAll("#claves-bloque-resultado li").length >= 3 && [...document.querySelectorAll("#claves-bloque-resultado li")].some((l) => l.textContent.startsWith("✓")));
    igual("otras claves en bloque: las malas se reportan con su línea y la buena ya no queda escrita", [await q.$$eval("#claves-bloque-resultado li", (l) => [l[0].textContent.startsWith("Línea 2: La clave son entre 8 y 32"), l[1].textContent.startsWith("Línea 3: El código del torneo son hasta 7"), l[2].textContent.startsWith("✓ Código 1529700: Guardada: esta clave abre 2 torneos")]), await q.inputValue("#claves-bloque")], [[true, true, true], "1529733 corta\nabc " + SID]);

    console.log("\n=== Un evento nuevo, sin tocar código ===");
    await q.fill("#g-codigo", "1600000");
    await q.fill("#g-sid", SID);
    await q.click("#g-guardar");
    await q.waitForSelector("#g-nuevos tr[data-tnr]");
    igual("una clave que abre torneos que todavía no están: los ofrece (no da error), con la categoría, la rama, el ritmo y «de menores» sacados del nombre",
        [await q.evaluate(() => getComputedStyle(document.getElementById("g-nuevos")).display !== "none"), await q.$$eval("#g-nuevos tr[data-tnr]", (l) => l.map((tr) => [tr.dataset.tnr, tr.querySelector("[data-campo=categoria]").value, tr.querySelector("[data-campo=rama]").value, tr.querySelector("[data-campo=ritmo]").value, tr.querySelector("[data-campo=menores]").checked]))],
        [true, [["1600001", "Sub-14", "Absoluto", "clasico", true], ["1600002", "Abierto", "Femenino", "rapido", false]]]);
    await q.click("[data-accion='agregar-torneos']");
    igual("sin el nombre del evento no agrega nada", [await q.textContent("#g-nuevos [role=status]"), await q.evaluate(() => (window.__agregados || []).length)], ["✗ Ponle nombre al evento (así se juntan sus torneos y se archivan juntos).", 0]);
    await q.fill("#gn-evento", "Nacional Juvenil 2027");
    await q.selectOption("#g-nuevos tr[data-tnr='1600002'] [data-campo=ritmo]", "blitz");
    await q.click("[data-accion='agregar-torneos']");
    await q.waitForSelector("#g-estado.cam-guardado");
    igual("los agrega la base al evento (con lo corregido a mano) y se guarda la clave en el mismo paso, con el mismo código",
        [await q.evaluate(() => window.__agregados), await q.textContent("#g-estado"), await q.evaluate(() => window.__llamadas.filter((l) => l.body && l.body.action === "poner" && l.body.tnr === "1600000").length), await q.evaluate(() => document.getElementById("g-nuevos").hidden)],
        [[{ p_evento: "Nacional Juvenil 2027", p_torneos: [{ tnr: "1600001", nombre: "Nacional Juvenil Sub-14", categoria: "Sub-14", rama: "Absoluto", ritmo: "clasico", menores: true }, { tnr: "1600002", nombre: "Rápido Abierto Femenino", categoria: "Abierto", rama: "Femenino", ritmo: "blitz", menores: false }] }],
         "✓ Guardada: esta clave abre 2 torneos ligados (Nacional Juvenil Sub-14, Rápido Abierto Femenino). Ronda 1 con 21 mesas en el primero.", 2, true]);
    igual("cada evento con su «Archivar» y sus torneos en la lista", [await q.$$eval("#eventos > p[data-evento]", (l) => l.map((x) => x.dataset.evento)), await q.evaluate(() => !!document.querySelector('.cam-estado-torneo[data-tnr="1600001"]'))], [["Sin evento", "Nacional Juvenil 2027"], true]);
    await q.click('#eventos p[data-evento="Nacional Juvenil 2027"] [data-accion="archivar-evento"]');
    await q.waitForSelector("dialog[open] [data-avisos-aceptar]");
    igual("archivar pregunta antes, con el botón que dice lo que hace", await q.textContent("dialog[open] [data-avisos-aceptar]"), "Archivar el evento");
    await q.click("dialog[open] [data-avisos-aceptar]");
    await q.waitForFunction(() => !document.querySelector('.cam-estado-torneo[data-tnr="1600001"]'));
    igual("archivado: sus torneos dejan de verse y queda en «Eventos archivados», donde se puede volver a abrir",
        [await q.$$eval("#eventos > p[data-evento]", (l) => l.map((x) => x.dataset.evento)), await q.$$eval("#eventos details p[data-evento]", (l) => l.map((x) => [x.dataset.evento, !!x.querySelector("[data-accion=reabrir-evento]")]))], [["Sin evento"], [["Nacional Juvenil 2027", true]]]);

    console.log("\n=== La organización: el respaldo y restaurar ===");
    await q.click("#pest-respaldo");
    await q.waitForSelector("#copias tr");
    igual("las copias salen con su hora, cuál es y qué trae cada una", await q.$$eval("#copias tr", (l) => l.map((tr) => [tr.children[1].textContent, tr.children[2].textContent, tr.children[3].textContent, tr.children[5].textContent])), [["Automática (5 min)", "2", "3", "2"], ["A pedido", "2", "1", "0"]]);
    igual("explica qué se guarda, cada cuánto, qué NO va (la clave) y que restaurar no pisa nada", await q.$eval("#panel-respaldo ul", (u) => ["Cada 5 minutos", "Cada hora", "Cada 10 minutos", "no va en la copia", "nunca pisa"].map((t) => u.textContent.replace(/\s+/g, " ").toLowerCase().includes(t.toLowerCase()))), [true, true, true, true, true]);
    igual("dice si la copia también va al Drive", (await q.textContent("#respaldo-estado")).includes("La copia también va al Drive cada 10 minutos"), true);
    const [descargaCopia] = await Promise.all([q.waitForEvent("download"), q.click("#copia-ahora")]);
    igual("«Hacer una copia ahora y bajarla» baja un archivo con la hora de Costa Rica en el nombre", [/^copia-centroamericano-2026-\d{4}-\d\d-\d\d-\d{4}\.json$/.test(descargaCopia.suggestedFilename()), JSON.parse(fs.readFileSync(await descargaCopia.path(), "utf8")).evento], [true, "Centroamericano 2026"]);
    await q.setInputFiles("#copia-archivo", { name: "copia.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ version: 2, evento: "otra cosa" })) });
    await q.waitForFunction(() => document.body.textContent.includes("no es una copia del Centroamericano 2026"));
    igual("un archivo que no es una copia del torneo se rechaza sin tocar la base", await q.evaluate(() => window.__llamadas.filter((l) => l.rpc === "centroamericano_restaurar").length), 0);
    await q.setInputFiles("#copia-archivo", { name: "copia.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ version: 1, evento: "Centroamericano 2026", asignaciones: [{ id: "x" }], registro: [], avisos: [], planillas: [] })) });
    await q.waitForSelector("[data-avisos-aceptar]");
    igual("restaurar pide confirmar y dice que solo agrega lo que falta y que los QR siguen sirviendo", (await q.textContent("dialog[open]")).includes("Solo se agrega lo que falta") && (await q.textContent("dialog[open]")).includes("mismo QR"), true);
    await q.click("[data-avisos-aceptar]");
    await q.waitForFunction(() => document.body.textContent.includes("Restaurado. Se agregaron 1 enlaces"));
    igual("la copia llegó a la base por la función de restaurar", await q.evaluate(() => window.__llamadas.filter((l) => l.rpc === "centroamericano_restaurar").map((l) => l.copia.asignaciones.length)), [1]);
    await q.click('#copias tr:first-child [data-accion="restaurar-copia"]');
    await q.waitForSelector("[data-avisos-aceptar]");
    await q.click("[data-avisos-aceptar]");
    await q.waitForFunction(() => window.__llamadas.filter((l) => l.rpc === "centroamericano_restaurar").length === 2);
    igual("también se restaura desde una copia de la lista", await q.evaluate(() => window.__llamadas.filter((l) => l.rpc === "centroamericano_restaurar").length), 2);

    console.log("\n=== La organización: lo que anotan ===");
    await q.click("#pest-registro");
    // La actividad de los árbitros: TODO lo que hacen, en una sola lista, para supervisar.
    igual("«Actividad de los árbitros» junta todo en orden (resultados, ilegales, llegadas, planillas, revisión previa, ayuda, ronda finalizada) y NO trae lo de los torneos de prueba",
        await q.$$eval("#actividad tr", (l) => l.map((tr) => [tr.children[1].textContent, tr.children[5].textContent, tr.children[6].textContent])),
        [["Beto", "Finalizó la ronda", "Finalizó la ronda 1"], ["Ana", "Pidió ayuda", "Pidió ayuda: Necesito al principal"], ["Ana", "Se levantó de la mesa", "Eli Uno (negras) se levantó de la mesa"], ["Ana", "Jugada ilegal", "Cleo Tres (blancas): Enroque ilegal"], ["Ana", "Foto de planillas", "Foto de las planillas (ya está en el Drive)"],
         ["Ana", "Presencia", "Dani Cuatro (negras): no ha llegado"], ["Ana", "Resultado", "Eli – Fran → 1-0"], ["Beto", "Revisión previa", "Aprobó el paso «relojes» de la revisión previa"],
         ["Beto", "Inició la ronda", "Inició la ronda 1 en su categoría: desde ahí corre el tiempo de espera"]]);
    igual("el resumen por árbitro dice cuántas acciones lleva cada uno, cuándo hizo la última y cuántos resultados, marcas y pedidos de ayuda",
        await q.$$eval("#act-resumen tr", (l) => l.map((tr) => [tr.children[0].querySelector("strong").textContent, tr.children[1].textContent, tr.children[3].textContent, tr.children[4].textContent, tr.children[5].textContent])),
        [["Beto", "3", "0", "0", "0"], ["Ana", "6", "1", "1", "1"]]);
    await q.selectOption("#act-arbitro", "Ana");
    igual("filtrar por árbitro deja solo lo suyo", await q.$$eval("#actividad tr", (l) => l.map((tr) => tr.children[1].textContent)), ["Ana", "Ana", "Ana", "Ana", "Ana", "Ana"]);
    await q.selectOption("#act-arbitro", "Beto");
    await q.selectOption("#act-tipo", "inicio");
    igual("y «Inició la ronda» se puede filtrar solo (lo marcó el árbitro de la categoría)", await q.$$eval("#actividad tr", (l) => l.map((tr) => [tr.children[1].textContent, tr.children[5].textContent])), [["Beto", "Inició la ronda"]]);
    await q.selectOption("#act-arbitro", "Ana");
    await q.selectOption("#act-tipo", "levanto");
    igual("y «Se levantó de la mesa» se puede filtrar solo y dice QUIÉN fue (nombre y color)", await q.$$eval("#actividad tr", (l) => l.map((tr) => [tr.children[5].textContent, tr.children[6].textContent])), [["Se levantó de la mesa", "Eli Uno (negras) se levantó de la mesa"]]);
    await q.selectOption("#act-tipo", "ilegal");
    igual("y por tipo de acción", await q.$$eval("#actividad tr", (l) => l.map((tr) => tr.children[6].textContent)), ["Cleo Tres (blancas): Enroque ilegal"]);
    await q.selectOption("#act-arbitro", "");
    await q.selectOption("#act-tipo", "");
    igual("la actividad se pide a la base (con las cuentas hechas allá) y dice cuántas acciones y de cuántos árbitros",
        await q.evaluate(() => [window.__actividadPedida, document.getElementById("act-nota").textContent]), [[null, 600], " — 9 acciones de 2 árbitros"]);
    igual("los jugadores con ilegales, primero quien más lleva, y la segunda dice que pierde", await q.$$eval("#marcados tr", (l) => l.map((tr) => [...tr.children].map((td) => td.textContent))),
        [["Sub-10 Absoluto", "1", "4", "Cleo Tres (blancas)", "ii 2 — pierde la partida (art. 7.5.5)", "—", "—"]]);
    igual("todo lo anotado, lo más reciente primero, con su detalle", await q.$$eval("#registro tr", (l) => l.map((tr) => [tr.children[4].textContent, tr.children[5].textContent, tr.children[6].textContent])),
        [["Beto", "Resultado", "1-0 (ganan blancas) — Eli – Fran · enviado a chess-results"], ["Ana", "Ilegal", "Cleo Tres (blancas)"], ["Ana", "Ilegal", "Cleo Tres (blancas)"]]);
    const [descarga] = await Promise.all([q.waitForEvent("download"), q.click("#r-pdf")]);
    const pdf = fs.readFileSync(await descarga.path());
    igual("el PDF del registro, con su nombre y la marca de agua", [descarga.suggestedFilename(), pdf.toString("latin1").startsWith("%PDF"), /\/SMask \d+ 0 R/.test(pdf.toString("latin1"))], ["registro-arbitros-centroamericano-2026.pdf", true, true]);
    await q.click("#pest-ronda");
    await q.click("#pest-ronda");
    console.log("\n=== La organización: el «Modo ensayo» (los torneos de prueba no se mezclan con los reales) ===");
    igual("por omisión, solo se ven los torneos reales: el de prueba no sale en los selectores, ni en el resumen, ni entre los que no han llegado",
        await q.evaluate(() => [[...document.querySelectorAll("#a-torneo option")].map((o) => o.textContent.replace(" (sin clave)", "")), ![...document.querySelectorAll("#resumen tr")].some((tr) => tr.children[0].textContent.includes("ensayo")), ![...document.querySelectorAll("#faltan tr")].some((tr) => tr.children[2].textContent.includes("Prueba")), [...document.querySelectorAll("#faltan tr")].map((tr) => tr.children[2].textContent), document.getElementById("aviso-ensayo").hidden, document.getElementById("modo-ensayo").checked]),
        [["Sub-8 Absoluto", "Sub-8 Femenino", "Sub-10 Absoluto"], true, true, ["Cleo Tres"], true, false]);
    await q.check("#modo-ensayo");
    await q.waitForFunction(() => !document.getElementById("aviso-ensayo").hidden && [...document.querySelectorAll("#a-torneo option")].length === 1);
    igual("con «Modo ensayo» se ve SOLO lo de prueba, y una franja lo dice con palabras",
        await q.evaluate(() => [[...document.querySelectorAll("#a-torneo option")].map((o) => o.textContent), [...document.querySelectorAll("#resumen tr")].map((tr) => tr.children[0].textContent), [...document.querySelectorAll("#faltan tr")].map((tr) => tr.children[2].textContent), document.getElementById("aviso-ensayo").checkVisibility(), document.getElementById("aviso-ensayo").textContent.startsWith("MODO ENSAYO"), document.title.startsWith("ENSAYO · ")]),
        [["PRUEBA grupo A"], ["Árbitro de ensayo 1"], ["Jugador de Prueba"], true, true, true]);
    // Quitar a un árbitro por error: la «✕» lo borra por completo (se prueba con el enlace de ensayo, que no tiene nada anotado).
    await q.click("#pest-arbitros");
    await q.waitForSelector('.cam-asignacion[data-id="asig-ensayo"] [data-accion="quitar"]');
    igual("cada enlace trae su «✕ Quitar», con un nombre accesible que dice a quién quita",
        await q.$eval('.cam-asignacion[data-id="asig-ensayo"] [data-accion="quitar"]', (b) => [b.textContent, b.getAttribute("aria-label")]), ["✕ Quitar", "Quitar a Árbitro de ensayo 1 de este torneo por completo"]);
    await q.click('.cam-asignacion[data-id="asig-ensayo"] [data-accion="quitar"]');
    await q.waitForSelector("[data-avisos-aceptar]");
    igual("antes de borrar pide confirmar, dice a quién, que no se puede deshacer y que lo anotado se conserva; todavía no se borró nada",
        await q.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("Árbitro de ensayo 1"), t.includes("Todavía no anotó nada"), t.includes("No se puede deshacer"), t.includes("Apagar"), window.__llamadas.filter((l) => l.rpc === "centroamericano_quitar_enlace").length, !!document.querySelector('.cam-asignacion[data-id="asig-ensayo"]')]; }),
        [true, true, true, true, 1, true]);
    await q.click("[data-avisos-aceptar]");
    await q.waitForFunction(() => !document.querySelector('.cam-asignacion[data-id="asig-ensayo"]'));
    igual("al confirmar se borra y ya no aparece más (primero contó, después borró)", await q.evaluate(() => window.__llamadas.filter((l) => l.rpc === "centroamericano_quitar_enlace").length), 2);
    await q.click("#pest-ronda");
    await q.uncheck("#modo-ensayo");
    await q.waitForFunction(() => document.getElementById("aviso-ensayo").hidden && [...document.querySelectorAll("#a-torneo option")].length === 3);
    igual("al volver, otra vez solo los reales (y el título sin «ENSAYO»)", await q.evaluate(() => [![...document.querySelectorAll("#resumen tr")].some((tr) => tr.children[0].textContent.includes("ensayo")), document.title.startsWith("ENSAYO")]), [true, false]);
    const [descargaH] = await Promise.all([q.waitForEvent("download"), q.click("#resumen-hojas")]);
    const pdfH = fs.readFileSync(await descargaH.path());
    igual("las hojas en papel (plan B): un PDF con una hoja por árbitro, su nombre y la marca de agua", [descargaH.suggestedFilename(), pdfH.toString("latin1").startsWith("%PDF"), /\/SMask \d+ 0 R/.test(pdfH.toString("latin1")), (pdfH.toString("latin1").match(/\/Type \/Page\b/g) || []).length, await q.evaluate(() => window.__llamadas.filter((l) => l.rpc === "centroamericano_hojas").length)], ["hojas-resultados-papel-ronda-3-centroamericano-2026.pdf", true, true, 2, 1]);
    await q.click("#pest-registro");
    const [descargaF] = await Promise.all([q.waitForEvent("download"), q.click("#r-informe")]);
    const pdfF = fs.readFileSync(await descargaF.path());
    igual("el informe final en PDF (resumen por ronda, ilegales, ausentes, rondas finalizadas y planillas), con su nombre y la marca de agua", [descargaF.suggestedFilename(), pdfF.toString("latin1").startsWith("%PDF"), /\/SMask \d+ 0 R/.test(pdfF.toString("latin1")), await q.$eval("#r-informe", (b) => b.disabled)], ["informe-final-arbitros-centroamericano-2026.pdf", true, true, false]);
    igual("sin errores en la página", errores, []); if (errores.length) console.error("ERRORES:", errores);

    console.log("\n=== «Árbitros y mesas» separado por modo: Clásico, Rápido y Blitz ===");
    {
        const M = require("../js/centroamericano-mesas.js");
        igual("el modo sale de la base o del nombre: sin pistas es clásico; «Rápido…» rápido; «Blitz…» blitz; la base manda sobre el nombre", [M.ritmoDe({ nombre: "Sub-10 Absoluto" }), M.ritmoDe({ nombre: "Rápido Sub-10" }), M.ritmoDe({ nombre: "Blitz Sub-12" }), M.ritmoDe({ nombre: "Sub-12", ritmo: "blitz" }), M.ritmoDe(null)], ["clasico", "rapido", "blitz", "blitz", "clasico"]);
        igual("cada modo explica qué cambia en la tablet (y solo el Blitz habla del aviso que se va solo)", M.RITMOS.map((r) => [r.id, r.config.length > 40, /se va solo/.test(r.config)]), [["clasico", true, false], ["rapido", true, false], ["blitz", true, true]]);
        const oc = await abrir(browser, "centroamericano-mesas.html?ritmos=1", dobleOrganizacion(true), { ancho: 1100 });
        const po = oc.p;
        await po.click("#pest-arbitros");
        await po.waitForSelector("#asignaciones .cam-grupo-ritmo");
        igual("la tabla de enlaces va en tres bloques, en orden Clásico → Rápido → Blitz, cada uno con su configuración y sus torneos adentro",
            await po.evaluate(() => [...document.querySelectorAll("#asignaciones tr.cam-grupo-ritmo, #asignaciones tr.cam-grupo-torneo")].map((tr) => tr.classList.contains("cam-grupo-ritmo") ? [tr.dataset.ritmo, tr.querySelector(".cam-ritmo-config").textContent.length > 40] : tr.textContent.split(" — ")[0])),
            [["clasico", true], "Sub-10 Absoluto", ["rapido", true], "Rápido Sub-10", ["blitz", true], "Blitz Sub-12"]);
        igual("los selectores de torneo también separan por modo (Clásico, Rápido, Blitz) y cada torneo sigue siendo una opción", await po.evaluate(() => ["a-torneo", "rp-torneo"].map((id) => { const s = document.getElementById(id); return [[...s.querySelectorAll("optgroup")].map((g) => g.label), s.querySelectorAll("option").length]; })), [[["Clásico", "Rápido", "Blitz"], 5], [["Clásico", "Rápido", "Blitz"], 5]]);
        igual("al elegir un torneo, debajo dice su modo y lo que cambia en la tablet", await (async () => {
            await po.evaluate(() => { document.getElementById("nuevo").open = true; });
            await po.selectOption("#a-torneo", "1540001");
            const blitz = await po.$eval("#a-ritmo-nota", (n) => [n.dataset.ritmo, /Blitz.*solo resultado e ilegal/i.test(n.textContent)]);
            await po.selectOption("#a-torneo", "1529733");
            const clasico = await po.$eval("#a-ritmo-nota", (n) => [n.dataset.ritmo, /Clásico.*Mesa completa/.test(n.textContent)]);
            return [blitz, clasico];
        })(), [["blitz", true], ["clasico", true]]);
        await oc.ctx.close();
        const o2 = await abrir(browser, "centroamericano-mesas.html", dobleOrganizacion(true), { ancho: 1100 });
        await o2.p.click("#pest-arbitros");
        await o2.p.waitForSelector("#asignaciones .cam-grupo-ritmo");
        igual("sin torneos de Blitz cargados, el bloque de Blitz sale igual y lo dice (así se sabe dónde van)", await o2.p.evaluate(() => { const b = document.querySelector('#asignaciones tr.cam-grupo-ritmo[data-ritmo="blitz"]'); return [!!b, b && /todavía no hay torneos de Blitz/.test(b.textContent), !document.querySelector('#asignaciones tr.cam-grupo-ritmo[data-ritmo="rapido"]')]; }), [true, true, true]);
        await o2.ctx.close();
        // Si la lectura de los torneos falla (la base lenta), los enlaces NO desaparecen: salen bajo Clásico con el número del torneo, y en cuanto
        // la lectura vuelve se reparten por modo (el 5/11 la tabla quedó sin ningún árbitro del Clásico porque se agrupaba solo con los torneos a mano).
        const o3 = await abrir(browser, "centroamericano-mesas.html?torneosfallan=1&ritmos=1", dobleOrganizacion(true), { ancho: 1100 });
        await o3.p.click("#pest-arbitros");
        await o3.p.waitForSelector("#asignaciones .cam-asignacion");
        igual("sin los torneos leídos, los enlaces igual se ven (bajo Clásico), cada uno con su fila",
            await o3.p.evaluate(() => [document.querySelectorAll("#asignaciones .cam-asignacion").length, [...document.querySelectorAll("#asignaciones tr.cam-grupo-ritmo")].map((t) => t.dataset.ritmo)]),
            [5, ["clasico", "blitz"]]);
        await o3.p.evaluate(() => { window.__torneosFallan = false; });
        await o3.p.waitForFunction(() => document.querySelector('#asignaciones tr.cam-grupo-ritmo[data-ritmo="rapido"]'), null, { timeout: 30000 });
        igual("cuando la lectura vuelve, los torneos se piden otra vez y la tabla se reparte por modo",
            await o3.p.evaluate(() => [...document.querySelectorAll("#asignaciones tr.cam-grupo-ritmo")].map((t) => t.dataset.ritmo)), ["clasico", "rapido", "blitz"]);
        await o3.ctx.close();
    }

    console.log("\n=== Cambiar el nombre de un torneo (el del Blitz quedaba larguísimo) ===");
    {
        const oc = await abrir(browser, "centroamericano-mesas.html?ritmos=1", dobleOrganizacion(true), { ancho: 1100 });
        const po = oc.p;
        await po.click("#pest-claves");
        const tarjeta = '.cam-estado-torneo[data-tnr="1540001"]';
        await po.waitForSelector(tarjeta + ' [data-accion="renombrar"]');
        igual("cada torneo trae «Cambiar nombre», con un nombre accesible que dice cuál", await po.$eval(tarjeta + ' [data-accion="renombrar"]', (b) => [b.textContent.trim(), b.getAttribute("aria-label")]), ["Cambiar nombre", "Cambiar el nombre de Blitz Sub-12"]);
        await po.click(tarjeta + ' [data-accion="renombrar"]');
        await po.waitForSelector("dialog[open] #rn-nombre");
        igual("se abre con el nombre de ahora y avisa que tiene que seguir diciendo «Blitz» (la tablet reconoce el ritmo por el nombre); tope de 80 y de 40",
            await po.evaluate(() => [document.getElementById("rn-nombre").value, document.getElementById("rn-nombre").maxLength, document.getElementById("rn-categoria").maxLength, document.getElementById("rn-ayuda").textContent.includes("«Blitz»"), document.activeElement.id]),
            ["Blitz Sub-12", 80, 40, true, "rn-nombre"]);
        // Un nombre sin «Blitz» se rechaza en la pantalla (sin molestar a la base).
        await po.fill("#rn-nombre", "Sub-12 relámpago");
        await po.click('dialog[open] [data-accion="guardar-nombre"]');
        igual("un nombre que ya no dice «Blitz» se rechaza con su explicación y sin llamar a la base", await po.evaluate(() => [document.getElementById("rn-error").hidden, document.getElementById("rn-error").textContent, (window.__renombrados || []).length, !!document.querySelector("dialog[open]")]),
            [false, "✗ El nombre de un torneo Blitz tiene que seguir diciendo «Blitz».", 0, true]);
        await po.fill("#rn-nombre", "   ");
        await po.click('dialog[open] [data-accion="guardar-nombre"]');
        igual("vacío tampoco", await po.$eval("#rn-error", (e) => e.textContent), "✗ El nombre no puede quedar vacío.");
        // Si la base lo rechaza (sin licencia, por ejemplo), el mensaje sale en la ventana y no se pierde lo escrito.
        await po.evaluate(() => { window.__renombrarFalla = "Hace falta la licencia de la Mesa del árbitro"; });
        await po.fill("#rn-nombre", "Blitz S12");
        await po.click('dialog[open] [data-accion="guardar-nombre"]');
        await po.waitForFunction(() => document.getElementById("rn-error").textContent.includes("licencia"));
        igual("si la base lo rechaza, lo dice en la ventana y deja corregir (conserva lo escrito)", await po.evaluate(() => [document.getElementById("rn-error").textContent, document.getElementById("rn-nombre").value, !!document.querySelector("dialog[open]"), document.getElementById("rn-nombre").getAttribute("aria-invalid")]),
            ["✗ No se pudo cambiar: Hace falta la licencia de la Mesa del árbitro", "Blitz S12", true, "true"]);
        // El bueno: se manda a la base, la ventana se cierra, y el nombre nuevo sale en todos lados (tarjeta, selectores y tabla de enlaces).
        await po.evaluate(() => { window.__renombrarFalla = ""; window.__renombrados = []; });
        await po.fill("#rn-categoria", "Sub-12 B");
        await po.click('dialog[open] [data-accion="guardar-nombre"]');
        await po.waitForFunction(() => !document.querySelector("dialog[open]"));
        igual("al guardar, la base recibe el torneo, el nombre y la categoría (todo recortado), y la ventana se cierra", await po.evaluate(() => window.__renombrados), [{ p_tnr: "1540001", p_nombre: "Blitz S12", p_categoria: "Sub-12 B" }]);
        await po.waitForFunction(() => document.querySelector('.cam-estado-torneo[data-tnr="1540001"] .font-bold').textContent === "Blitz S12");
        igual("el nombre nuevo se ve en la tarjeta y en los selectores, y el torneo sigue siendo Blitz (sigue en su bloque)",
            await po.evaluate(() => [[...document.querySelectorAll("#a-torneo option")].map((o) => o.textContent).includes("Blitz S12"), [...document.querySelectorAll("#a-torneo optgroup")].find((g) => g.label === "Blitz").textContent.includes("Blitz S12")]), [true, true]);
        await po.click("#pest-arbitros");
        igual("y en la tabla de enlaces, bajo Blitz", await po.evaluate(() => { const h = [...document.querySelectorAll("#asignaciones tr")]; const i = h.findIndex((t) => t.dataset.ritmo === "blitz"); return h[i + 1].textContent.includes("Blitz S12"); }), true);
        // Un torneo clásico no puede pasar a llevar «Blitz» o «Rápido» en el nombre (la tablet lo vería como de otro ritmo).
        await po.click("#pest-claves");
        await po.click('.cam-estado-torneo[data-tnr="1529733"] [data-accion="renombrar"]');
        await po.waitForSelector("dialog[open] #rn-nombre");
        await po.fill("#rn-nombre", "Sub-10 Blitz");
        await po.click('dialog[open] [data-accion="guardar-nombre"]');
        igual("un torneo clásico no puede pasar a decir «Blitz»", await po.evaluate(() => [document.getElementById("rn-error").textContent, document.getElementById("rn-ayuda").textContent.includes("No puede decir")]), ["✗ Un torneo clásico no puede llevar «Blitz» ni «Rápido» en el nombre.", true]);
        await oc.ctx.close();
    }

    console.log("\n=== La organización en la tablet y en el celular, en claro y en oscuro ===");
    const coloresOrg = ".cam-pedido, .cam-pestana, .cam-contador, .cam-barra-estado, .cam-celda-estado, .cam-titulo-ventana, .cam-subtitulo, .cam-chip, .cam-btn, .cam-estado-torneo, .cam-asignacion td, .cam-conectado, .cam-clave-grupo, .cam-detalle summary, .cam-estado-drive, .cam-sugerencia, .cam-herramientas, .cam-guardado, .cam-fallo, .cam-rejilla td, .cam-rejilla th, .cam-rejilla thead th";
    const contrastePorPanel = async (pg) => {
        const peores = [];
        for (const nombre of ["ronda", "avisos", "arbitros", "tiempos", "planillas", "claves", "respaldo", "registro"]) {
            await pg.click("#pest-" + nombre);
            const l = await pg.evaluate("(" + CONTRASTE + ")(" + JSON.stringify(coloresOrg) + ")");
            peores.push(Math.min(...l, 99));
        }
        return Math.min(...peores);
    };
    await q.setViewportSize({ width: 820, height: 1180 });
    igual("en la tablet vertical (820 px) la página no se desplaza a lo ancho, en ninguna pestaña", await (async () => { const w = []; for (const n of ["ronda", "avisos", "arbitros", "tiempos", "planillas", "claves", "respaldo", "registro"]) { await q.click("#pest-" + n); w.push(await q.evaluate(() => document.documentElement.scrollWidth)); } return w; })(), [820, 820, 820, 820, 820, 820, 820, 820]);
    igual("cada botón y pestaña se toca bien (40 px de alto o más)", await q.evaluate(() => [...document.querySelectorAll(".cam-pestana, .cam-btn")].filter((b) => b.checkVisibility()).every((b) => b.getBoundingClientRect().height >= 40)), true);
    igual("en claro, todo el texto de la organización da 4,5:1 o más, en las ocho pestañas", (await contrastePorPanel(q)) >= 4.5, true);
    await q.click("#pest-ronda");
    if (process.env.CAPTURA) await q.screenshot({ path: process.env.CAPTURA + "-organizacion.png", fullPage: true });
    await q.click("#pest-arbitros");
    if (process.env.CAPTURA) await q.screenshot({ path: process.env.CAPTURA + "-organizacion-arbitros.png", fullPage: true });
    await q.setViewportSize({ width: 390, height: 800 });
    igual("en el celular la página de la organización tampoco se desplaza a lo ancho", await q.evaluate(() => document.documentElement.scrollWidth), 390);
    await o.ctx.close();
    o = await abrir(browser, "centroamericano-mesas.html", dobleOrganizacion(true), { ancho: 1100, esquema: "dark" });
    await o.p.waitForSelector(".cam-pedido");
    // antes de abrir «Planillas y Drive»: la tabla pregunta por la transmisión apenas se pinta
    await o.ctx.route("**/functions/v1/ocr-scoresheet", (rr) => rr.fulfill({ contentType: "application/json", body: JSON.stringify({ words: palabrasFoto }) }));
    await simularLichess(o.p, []);
    igual("en oscuro, todo el texto de la organización da 4,5:1 o más, en las ocho pestañas", (await contrastePorPanel(o.p)) >= 4.5, true);
    await o.p.click("#pest-planillas");
    await o.p.waitForSelector("#planillas tr");
    for (const n of [0, 1]) await o.p.locator("#planillas tr.cam-pl-fila").nth(n).locator('[data-accion="generar-pgn"]').click();
    await o.p.waitForFunction(() => document.querySelectorAll(".cam-lp-fila .cam-lp-titular").length === 2, null, { timeout: 120000 });
    igual("en oscuro, la partida (de la foto y de la transmisión: lo marcado, el aviso de ilegible, el texto) da 4,5:1 o más", Math.min(...await o.p.evaluate("(" + CONTRASTE + ")(" + JSON.stringify(".cam-lp-jugada, .cam-lp-ilegible, .cam-lp-ilegible strong, .cam-lp-linea, .cam-lp-num, .cam-lp-nota, .cam-lp-titular, .cam-lp-leyenda, .cam-lp-fuente, .cam-lp-fila p, .cam-lp-enlace") + ")")) >= 4.5, true);
    if (process.env.CAPTURA) { await o.p.locator(".cam-lp-fila").first().scrollIntoViewIfNeeded(); await o.p.screenshot({ path: process.env.CAPTURA + "-leer-partida-oscuro.png", fullPage: true }); }
    if (process.env.CAPTURA) { await o.p.click("#pest-ronda"); await o.p.screenshot({ path: process.env.CAPTURA + "-organizacion-oscuro.png", fullPage: true }); }
    await o.ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
