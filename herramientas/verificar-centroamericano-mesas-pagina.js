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
   De la organización: el candado, las 12 claves, una clave de grupo que abre varios
   torneos, las claves pegadas en bloque, el enlace con su QR, apagarlo y el PDF.

   Ver «Mesas de los árbitros del Centroamericano» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js centroamericano-mesas-pagina      */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");
const fs = require("fs");

const BASE = process.env.BASE_URL || "http://localhost:8777";
const TOKEN = "ab12".repeat(16);
const SID = "AAAA1111BBBB2222CCCC3333DDDD4444";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

const MESAS = [
    { mesa: 1, blancas: "Muñoz Feliz Alejandro", negras: "Gramajo Tovar Marco", valor: "0" },
    { mesa: 2, blancas: "Harvey Ian", negras: "Acuña Porras Fabio", valor: "0" },
    { mesa: 3, blancas: "Hopkins John", negras: "Baquero Graterol", valor: "2" },
];

// El «servidor» del árbitro, dentro del navegador de prueba.
const SERVIDOR_ARBITRO = `
  const TOKEN = ${JSON.stringify(TOKEN)};
  const MESAS = ${JSON.stringify(MESAS)};
  const filas = []; let n = 0;
  const falla = (estado, error) => ({ data: null, error: { context: { status: estado, json: () => Promise.resolve({ error }) } } });
  const marcasDe = () => {
    const anul = new Set(filas.filter((f) => f.tipo === "anulacion").map((f) => f.anula)); const out = {};
    for (const f of filas) { if (!["ilegal", "irregularidad"].includes(f.tipo) || anul.has(f.id)) continue;
      const k = f.mesa + "|" + f.color; const m = out[k] || (out[k] = { ilegales: 0, irregularidades: 0, ultima_ilegal: null, ultima_irregularidad: null });
      if (f.tipo === "ilegal") { m.ilegales++; m.ultima_ilegal = f.id; } else { m.irregularidades++; m.ultima_irregularidad = f.id; } }
    return out; };
  const NOMBRE = { "0": "sin resultado", "1": "1-0", "2": "1/2", "3": "0-1", "D": "borrado" };
  window.__servidor = (b) => {
    if (b.token !== TOKEN) return falla(404, "Este enlace no es válido. Pídele a la organización que te mande el QR de nuevo.");
    if (b.action === "leer") return { data: { arbitro: "Ana Árbitra", tnr: "1529737", torneo: "Sub-10 Femenino", categoria: "Sub-10", rama: "Femenino", ronda: 3, desde: 1, hasta: 3, vence: "2026-11-10T05:59:59Z",
      mesas: MESAS.map((m) => Object.assign({}, m)), marcas: marcasDe(), anotaciones: filas.filter((f) => f.tipo !== "anulacion"), anuladas: filas.filter((f) => f.tipo === "anulacion").map((f) => f.anula), leido_en: "2026-11-02T15:30:00Z" }, error: null };
    if (b.action === "guardar") {
      const r = b.cambios.map((c) => { const m = MESAS.find((x) => x.mesa === c.mesa); const malo = window.__falla === true; const esperado = c.valor === "D" ? "0" : c.valor;
        if (!malo) { filas.push({ id: "f" + (++n), ocurrio: "2026-11-02T15:31:00Z", mesa: c.mesa, color: null, jugador: c.blancas + " – " + c.negras, tipo: m.valor !== "0" ? "correccion" : "resultado", resultado: NOMBRE[c.valor], anterior: m.valor !== "0" ? NOMBRE[m.valor] : null, texto: "", articulo: "", enviado: true }); m.valor = esperado; }
        return { mesa: c.mesa, pedido: c.valor, quedo: malo ? m.valor : esperado, ok: !malo }; });
      return { data: { ok: r.every((x) => x.ok), ronda: 3, resultados: r, diferencias: [], leido_en: "2026-11-02T15:31:00Z", registro_error: false }, error: null }; }
    if (b.action === "anotar") {
      const m = MESAS.find((x) => x.mesa === b.mesa); const jugador = b.color === "blancas" ? m.blancas : m.negras;
      const f = { id: "f" + (++n), ocurrio: "2026-11-02T15:32:00Z", mesa: b.mesa, color: b.color, jugador, tipo: b.tipo, resultado: null, anterior: null, texto: b.texto || "", articulo: b.tipo === "ilegal" ? "7.5.5" : "", enviado: false };
      filas.push(f); const marca = marcasDe()[b.mesa + "|" + b.color];
      return { data: { ok: true, id: f.id, jugador, color: b.color, marca, aviso: b.tipo === "ilegal" ? (marca.ilegales >= 2 ? "segunda" : "primera") : null }, error: null }; }
    if (b.action === "anular") {
      const f = filas.find((x) => x.id === b.id); if (filas.some((x) => x.anula === b.id)) return falla(409, "Esa anotación ya estaba anulada.");
      filas.push({ id: "f" + (++n), ocurrio: "2026-11-02T15:33:00Z", mesa: f.mesa, color: f.color, jugador: f.jugador, tipo: "anulacion", anula: b.id });
      return { data: { ok: true, color: f.color, mesa: f.mesa, marca: marcasDe()[f.mesa + "|" + f.color] || { ilegales: 0, irregularidades: 0, ultima_ilegal: null, ultima_irregularidad: null } }, error: null }; }
    return falla(400, "Acción desconocida.");
  };`;

function dobleArbitro() {
    return `(function(){
  window.__llamadas = [];
  ${SERVIDOR_ARBITRO}
  const R = (data, error) => Promise.resolve({ data, error: error || null });
  window.sb = {
    auth: { getSession: () => R({ session: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    functions: { invoke: (f, o) => { window.__llamadas.push({ f, body: JSON.parse(JSON.stringify(o.body)) }); return Promise.resolve(window.__servidor(o.body)); } },
    from: () => { const q = {}; ["select","eq","order","range","insert","update"].forEach((m) => q[m] = () => q); q.then = (ok) => Promise.resolve({ data: [], error: null }).then(ok); return q; },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;
}

// El panel de la organización: los 12 torneos (3 de muestra), sus enlaces y el registro.
function dobleOrganizacion(licencia) {
    return `(function(){
  window.__llamadas = [];
  const R = (data, error) => Promise.resolve({ data, error: error || null });
  const TORNEOS = [
    { tnr: "1529719", nombre: "Sub-8 Absoluto", categoria: "Sub-8", rama: "Absoluto", orden: 1, sid_en_boveda: false, clave_puesta: null, acceso_tnr: null },
    { tnr: "1529729", nombre: "Sub-8 Femenino", categoria: "Sub-8", rama: "Femenino", orden: 2, sid_en_boveda: false, clave_puesta: null, acceso_tnr: null },
    { tnr: "1529733", nombre: "Sub-10 Absoluto", categoria: "Sub-10", rama: "Absoluto", orden: 3, sid_en_boveda: true, clave_puesta: "2026-11-01T10:00:00Z", acceso_tnr: "1529733" }];
  const ASIG = [];
  const REGISTRO = [
    { id: "r1", ocurrio: "2026-11-02T15:00:00Z", asignacion_id: null, arbitro: "Ana", tnr: "1529733", ronda: 1, mesa: 4, color: "blancas", jugador: "Cleo Tres", tipo: "ilegal", resultado: null, anterior: null, articulo: "7.5.5", texto: "", enviado: false, anula: null },
    { id: "r2", ocurrio: "2026-11-02T15:05:00Z", asignacion_id: null, arbitro: "Ana", tnr: "1529733", ronda: 1, mesa: 4, color: "blancas", jugador: "Cleo Tres", tipo: "ilegal", resultado: null, anterior: null, articulo: "7.5.5", texto: "", enviado: false, anula: null },
    { id: "r3", ocurrio: "2026-11-02T15:10:00Z", asignacion_id: null, arbitro: "Beto", tnr: "1529733", ronda: 1, mesa: 9, color: null, jugador: "Eli – Fran", tipo: "resultado", resultado: "1-0", anterior: null, articulo: "", texto: "", enviado: true, anula: null }];
  let n = 0;
  const filtrar = (tabla, f) => ({ torneos: TORNEOS, asignaciones: ASIG, registro: REGISTRO }[tabla]).filter((r) => Object.entries(f).every(([c, v]) => r[c] === v));
  window.sb = {
    auth: { getSession: () => R({ session: { user: { id: "yo" }, access_token: "x" } }), getUser: () => R({ user: { id: "yo" } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => R({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => R({ all: [], totp: [] }) } },
    rpc: (f, a) => { window.__llamadas.push({ rpc: f, a: a && a.p_herramienta }); return R(f === "tengo_herramienta" ? ${licencia ? "a.p_herramienta === 'mesa-arbitro'" : "false"} : null); },
    functions: { invoke: (f, o) => { window.__llamadas.push({ f, body: JSON.parse(JSON.stringify(o.body)) }); const b = o.body;
      const err = (estado, error) => ({ data: null, error: { context: { status: estado, json: () => Promise.resolve({ error }) } } });
      if (b.action === "poner") {
        if (b.sid === "MALAMALAMALA1234") return Promise.resolve(err(401, "chess-results no aceptó el código o la clave. Revísalos en Swiss-Manager. No se guardó la clave."));
        const abre = b.tnr === "1529700" ? ["1529719", "1529729"] : [b.tnr];
        const mios = TORNEOS.filter((t) => abre.includes(t.tnr)); if (!mios.length) return Promise.resolve(err(404, "Esa clave abre " + b.tnr + " (otro), y ninguno es del Centroamericano. No se guardó la clave."));
        mios.forEach((t) => { t.sid_en_boveda = true; t.acceso_tnr = b.tnr; t.clave_puesta = "2026-11-02T16:00:00Z"; });
        return Promise.resolve({ data: { ok: true, acceso: b.tnr, torneos: mios.map((t) => ({ tnr: t.tnr, nombre: t.nombre })), ronda: 1, mesas: 21, otros: [] }, error: null }); }
      if (b.action === "probar") return Promise.resolve({ data: { ok: true, torneo: "Sub-10 Absoluto", ronda: 2, mesas: 30 }, error: null });
      return Promise.resolve(err(400, "Acción desconocida.")); } },
    from: (tabla) => { const t = { centroamericano_torneos: "torneos", centroamericano_asignaciones: "asignaciones", centroamericano_registro: "registro" }[tabla]; const f = {}; let accion = "select", valores = null;
      let orden = null;
      const q = { select: () => q, order: (c, o) => { orden = [c, !(o && o.ascending === false)]; return q; }, range: () => q, eq: (c, v) => { f[c] = v; return q; },
        insert: (v) => { accion = "insert"; valores = v; return q; }, update: (v) => { accion = "update"; valores = v; return q; },
        then: (ok, ko) => { let r;
          if (accion === "insert") { const fila = Object.assign({ id: "a" + (++n), token: "ab12".repeat(16).replace(/ab12/, "cd34").slice(0, 60) + String(1000 + n), revocada: false, creada: "2026-11-02T16:30:00Z", ultimo_uso: null }, valores); ASIG.unshift(fila); window.__llamadas.push({ insert: tabla, valores }); r = { data: null, error: null }; }
          else if (accion === "update") { filtrar(t, f).forEach((x) => Object.assign(x, valores)); window.__llamadas.push({ update: tabla, valores, f }); r = { data: null, error: null }; }
          else { const datos = filtrar(t, f).map((x) => Object.assign({}, x)); if (orden && ["ocurrio", "creada"].includes(orden[0])) datos.sort((a, b) => (a[orden[0]] < b[orden[0]] ? -1 : 1) * (orden[1] ? 1 : -1)); r = { data: datos, error: null }; }
          return Promise.resolve(r).then(ok, ko); } };
      return q; },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;
}

async function abrir(browser, pagina, doble, { hash = "", ancho = 390, esquema = "light" } = {}) {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: ancho, height: 800 }, acceptDownloads: true, colorScheme: esquema });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(BASE + "/" + pagina + (hash ? "#" + hash : ""), { waitUntil: "load" });
    return { ctx, p, errores };
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
    await r.p.waitForSelector("#problema:not([hidden])");
    igual("sin enlace no se abre nada y lo dice", [await r.p.textContent("#problema-titulo"), await r.p.$eval("#app", (a) => a.checkVisibility()), await r.p.evaluate(() => window.__llamadas.length)], ["Falta tu enlace", false, 0]);
    await r.ctx.close();
    r = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: "f".repeat(64) });
    await r.p.waitForSelector("#problema:not([hidden])");
    igual("con un enlace falso: «ya no sirve», sin botón para reintentar", [await r.p.textContent("#problema-titulo"), (await r.p.textContent("#problema-texto")).includes("no es válido"), await r.p.$eval("#problema-reintentar", (b) => b.checkVisibility())], ["Este enlace ya no sirve", true, false]);
    await r.ctx.close();

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

    console.log("\n=== Guardar: al lado del resultado, una mesa a la vez ===");
    const boton = (m) => '.cam-mesa[data-mesa="' + m + '"] [data-accion="guardar"]';
    igual("sin elegir nada, el «Guardar» está apagado", await p.$eval(boton(1), (b) => b.disabled), true);
    await p.selectOption("#res-1", "1");
    igual("al elegir un resultado, la mesa queda «sin guardar» y su botón se enciende (y las otras no)", [await p.$eval('.cam-mesa[data-mesa="1"]', (m) => m.dataset.estado), await p.$eval(boton(1), (b) => b.disabled), await p.$eval(boton(2), (b) => b.disabled)], ["sin-guardar", false, true]);
    igual("el botón está en la MISMA fila que el desplegable", await p.evaluate(() => { const s = document.getElementById("res-1"), b = document.querySelector('.cam-mesa[data-mesa="1"] [data-accion="guardar"]'); return s.parentElement === b.parentElement; }), true);
    await p.click(boton(1));
    await p.waitForSelector('.cam-mesa[data-mesa="1"] .cam-guardado');
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
    await p.click(acc(2, "blancas", "ilegal"));
    await p.waitForSelector('.cam-mesa[data-mesa="2"] .cam-aviso-suave');
    igual("la primera: se anota por ronda, mesa y color, y avisa los 2 minutos del rival (art. 7.5.5)", await p.evaluate(() => ({
        llamada: window.__llamadas.filter((l) => l.body.action === "anotar").map((l) => [l.body.ronda, l.body.mesa, l.body.color, l.body.tipo]),
        marca: document.querySelector('.cam-mesa[data-mesa="2"] .cam-marca[data-tipo="ilegal"]').textContent,
        aviso: document.querySelector('.cam-mesa[data-mesa="2"] .cam-aviso-suave').textContent })),
        { llamada: [[3, 2, "blancas", "ilegal"]], marca: "iIlegal", aviso: "Primera jugada ilegal. Harvey Ian hizo una jugada ilegal: dale 2 minutos más a su rival (art. 7.5.5). Con otra, pierde la partida." });
    igual("la ilegal de las BLANCAS no marca a las negras", await p.$$eval('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="negras"] .cam-marca', (l) => l.length), 0);
    await p.click(acc(2, "blancas", "ilegal"));
    await p.waitForSelector("[data-avisos-aceptar]");
    igual("la segunda pide confirmar antes y dice que pierde la partida", await p.evaluate(() => { const t = document.querySelector("dialog").textContent; return [t.includes("SEGUNDA jugada ilegal de Harvey Ian"), t.includes("pierde la partida (art. 7.5.5)")]; }), [true, true]);
    igual("todavía no se anotó la segunda", await p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "anotar").length), 1);
    await p.click("[data-avisos-aceptar]");
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
    await p.waitForSelector("dialog[open] input");
    await p.fill("dialog[open] input", "Tocó una pieza sin avisar");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForSelector('.cam-mesa[data-mesa="1"] .cam-jugador[data-color="negras"] .cam-marca[data-tipo="irregularidad"]');
    igual("se anota con su nota y marca solo a ese jugador", await p.evaluate(() => [window.__llamadas.filter((l) => l.body.action === "anotar" && l.body.tipo === "irregularidad").map((l) => [l.body.mesa, l.body.color, l.body.texto]),
        document.querySelector('.cam-mesa[data-mesa="1"] .cam-jugador[data-color="negras"] .cam-marca').textContent, document.querySelectorAll('.cam-mesa[data-mesa="1"] .cam-jugador[data-color="blancas"] .cam-marca').length]),
        [[[1, "negras", "Tocó una pieza sin avisar"]], "!Irregularidad", 0]);
    await p.click("#anotado summary");
    igual("lo anotado dice cada cosa, con su hora de Costa Rica, y tacha lo anulado", await p.$$eval("#anotado-filas tr", (l) => l.map((tr) => [tr.children[2].textContent, tr.dataset.anulada || ""])).then((x) => x.filter((f) => /Ilegal|Irregularidad/.test(f[0]))),
        [["Irregularidad", ""], ["Ilegal (anulada)", "si"], ["Ilegal", ""]]);

    console.log("\n=== En el celular (390 px), en claro y en oscuro ===");
    igual("la página no se desplaza a lo ancho", await p.evaluate(() => document.documentElement.scrollWidth), 390);
    igual("cada botón se toca bien (44 px de alto o más) y el foco se ve", await p.evaluate(() => [...document.querySelectorAll(".cam-mesa .cam-btn")].filter((b) => b.checkVisibility()).every((b) => b.getBoundingClientRect().height >= 40)), true);
    const colores = ".cam-mesa-cabeza, .cam-nombre, .cam-color, .cam-marca, .cam-btn, .cam-select, .cam-resultado-actual, .cam-aviso-suave, .cam-guardado, .cam-fallo, .cam-estado";
    igual("en claro, todo el texto de las mesas da 4,5:1 o más", (await p.evaluate("(" + CONTRASTE + ")(" + JSON.stringify(colores) + ")")).every((x) => x >= 4.5), true);
    if (process.env.CAPTURA) await p.screenshot({ path: process.env.CAPTURA + "-arbitro-claro.png", fullPage: true });
    igual("sin errores en la página", errores, []);
    await r.ctx.close();

    let o = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: TOKEN, esquema: "dark" });
    await o.p.waitForSelector(".cam-mesa");
    await o.p.selectOption("#res-1", "1");
    await o.p.click(boton(1));
    await o.p.waitForSelector('.cam-mesa[data-mesa="1"] .cam-guardado');
    await o.p.click(acc(2, "negras", "ilegal"));
    await o.p.waitForSelector('.cam-mesa[data-mesa="2"] .cam-aviso-suave');
    igual("en oscuro, todo el texto de las mesas da 4,5:1 o más", (await o.p.evaluate("(" + CONTRASTE + ")(" + JSON.stringify(colores + ", .cam-alerta, .cam-anular") + ")")).every((x) => x >= 4.5), true);
    if (process.env.CAPTURA) await o.p.screenshot({ path: process.env.CAPTURA + "-arbitro-oscuro.png", fullPage: true });
    await o.ctx.close();

    console.log("\n=== La organización: el candado ===");
    o = await abrir(browser, "centroamericano-mesas.html", dobleOrganizacion(false), { ancho: 1100 });
    await o.p.waitForSelector("#denegado:not([hidden])");
    igual("sin licencia, el candado y nada más", [await o.p.$eval("#app", (a) => a.checkVisibility()), await o.p.evaluate(() => window.__llamadas.some((l) => l.rpc === "tengo_herramienta" && l.a === "mesa-arbitro"))], [false, true]);
    await o.ctx.close();

    console.log("\n=== La organización: las claves ===");
    ({ ctx: o.ctx, p: o.p, errores } = await abrir(browser, "centroamericano-mesas.html", dobleOrganizacion(true), { ancho: 1100 }));
    const q = o.p;
    await q.waitForSelector(".cam-torneo");
    igual("los torneos con su estado, y cuántos tienen clave", [await q.$$eval(".cam-torneo", (l) => l.map((t) => [t.querySelector("p.font-bold").textContent, t.dataset.clave])), await q.textContent("#resumen-claves")],
        [[["Sub-8 Absoluto", "no"], ["Sub-8 Femenino", "no"], ["Sub-10 Absoluto", "si"]], "1 de 3 torneos con clave cargada."]);
    await q.fill("#sid-1529719", "MALAMALAMALA1234");
    await q.click('.cam-torneo[data-tnr="1529719"] [data-accion="poner"]');
    await q.waitForSelector("#est-1529719.cam-fallo");
    igual("una clave que chess-results no acepta se dice y no se guarda", [(await q.textContent("#est-1529719")).includes("no aceptó el código o la clave"), await q.$eval('.cam-torneo[data-tnr="1529719"]', (t) => t.dataset.clave)], [true, "no"]);
    await q.evaluate(() => { document.getElementById("pegar").open = true; });
    await q.fill("#claves-bloque", "1529700 " + SID + "\n1529733 corta\nabc " + SID);
    await q.click("#claves-bloque-guardar");
    await q.waitForFunction(() => document.querySelectorAll("#claves-bloque-resultado li").length >= 3 && [...document.querySelectorAll("#claves-bloque-resultado li")].some((l) => l.textContent.startsWith("✓")));
    igual("las claves pegadas: la del grupo abre dos torneos ligados y las malas se reportan con su línea", await q.$$eval("#claves-bloque-resultado li", (l) => l.map((x) => x.textContent)),
        ["Línea 2: La clave son entre 8 y 32 letras y números.", "Línea 3: El código del torneo son hasta 7 números.", "✓ Código 1529700: Guardada: esta clave abre 2 torneos ligados (Sub-8 Absoluto, Sub-8 Femenino). Ronda 1 con 21 mesas en el primero."]);
    igual("quedan los dos torneos con clave y dicen que entran por el grupo", [await q.textContent("#resumen-claves"), await q.$$eval(".cam-torneo", (l) => l.map((t) => t.querySelector("p.text-sm.mt-1") ? t.querySelector("p.text-sm.mt-1").textContent : ""))],
        ["3 de 3 torneos con clave cargada. ¡Todos listos!", ["Entra por el grupo 1529700", "Entra por el grupo 1529700", ""]]);
    igual("la clave llegó a la función con su código y la línea guardada ya NO está escrita en la página (solo las que hay que corregir)", await q.evaluate((s) => [window.__llamadas.some((l) => l.body && l.body.action === "poner" && l.body.tnr === "1529700" && l.body.sid === s), document.getElementById("claves-bloque").value, JSON.stringify(localStorage).includes(s), document.getElementById("sid-1529719").value], SID), [true, "1529733 corta\nabc " + SID, false, "MALAMALAMALA1234"]);
    await q.fill("#sid-1529733", SID);
    await q.click('.cam-torneo[data-tnr="1529733"] [data-accion="poner"]');
    await q.waitForSelector("#est-1529733.cam-guardado");
    igual("la clave de la tarjeta de un torneo se vacía en cuanto se guarda", await q.$eval("#sid-1529733", (i) => i.value), "");

    console.log("\n=== La organización: el enlace de cada árbitro ===");
    await q.fill("#a-arbitro", "Ana Árbitra");
    await q.selectOption("#a-torneo", "1529733");
    await q.fill("#a-desde", "1");
    await q.fill("#a-hasta", "15");
    await q.click("#a-crear");
    await q.waitForSelector(".cam-asignacion");
    const enlace = await q.$eval('.cam-asignacion [data-accion="abrir"]', (a) => a.href);
    igual("se crea con el torneo, el rango y el vencimiento (el 9 de noviembre, hora de Costa Rica)", await q.evaluate(() => window.__llamadas.filter((l) => l.insert).map((l) => [l.valores.tnr, l.valores.arbitro, l.valores.mesa_desde, l.valores.mesa_hasta, l.valores.vence])), [["1529733", "Ana Árbitra", 1, 15, "2026-11-10T05:59:59.000Z"]]);
    igual("el enlace lleva el token DESPUÉS del «#», y tiene su QR y su WhatsApp", [/\/centroamericano-arbitro\.html#[0-9a-z]{64}$/.test(enlace), await q.$eval(".cam-qr svg", (s) => s.getAttribute("aria-label")), (await q.$eval('.cam-asignacion [data-accion="whatsapp"]', (a) => decodeURIComponent(a.href))).includes("tus mesas del Centroamericano (Sub-10 Absoluto, mesas 1 a 15)")], [true, "QR del enlace de Ana Árbitra", true]);
    await q.fill("#a-arbitro", "Beto");
    await q.selectOption("#a-torneo", "1529733");
    await q.fill("#a-desde", "10");
    await q.fill("#a-hasta", "20");
    await q.click("#a-crear");
    await q.waitForSelector("[data-avisos-aceptar]");
    igual("unas mesas que ya tiene otro árbitro se avisan antes de crear", (await q.textContent("dialog")).includes("Esas mesas ya las tiene Ana Árbitra (1 a 15)"), true);
    await q.click("dialog [data-avisos-cancelar]");
    await q.click('.cam-asignacion [data-accion="apagar"]');
    await q.waitForSelector("[data-avisos-aceptar]");
    await q.click("[data-avisos-aceptar]");
    await q.waitForSelector('.cam-asignacion[data-estado="apagado"]');
    igual("apagar un enlace pide confirmar y lo deja apagado (se puede volver a encender)", [await q.$eval(".cam-asignacion", (a) => a.dataset.estado), await q.$eval('.cam-asignacion [data-accion="reactivar"]', (b) => b.textContent)], ["apagado", "Volver a encender"]);

    console.log("\n=== La organización: lo que anotan ===");
    igual("los jugadores con ilegales, primero quien más lleva, y la segunda dice que pierde", await q.$$eval("#marcados tr", (l) => l.map((tr) => [...tr.children].map((td) => td.textContent))),
        [["Sub-10 Absoluto", "1", "4", "Cleo Tres (blancas)", "ii 2 — pierde la partida (art. 7.5.5)", "—"]]);
    igual("todo lo anotado, lo más reciente primero, con su detalle", await q.$$eval("#registro tr", (l) => l.map((tr) => [tr.children[4].textContent, tr.children[5].textContent, tr.children[6].textContent])),
        [["Beto", "Resultado", "1-0 (ganan blancas) — Eli – Fran · enviado a chess-results"], ["Ana", "Ilegal", "Cleo Tres (blancas)"], ["Ana", "Ilegal", "Cleo Tres (blancas)"]]);
    const [descarga] = await Promise.all([q.waitForEvent("download"), q.click("#r-pdf")]);
    const pdf = fs.readFileSync(await descarga.path());
    igual("el PDF del registro, con su nombre y la marca de agua", [descarga.suggestedFilename(), pdf.toString("latin1").startsWith("%PDF"), /\/SMask \d+ 0 R/.test(pdf.toString("latin1"))], ["registro-arbitros-centroamericano-2026.pdf", true, true]);
    if (process.env.CAPTURA) await q.screenshot({ path: process.env.CAPTURA + "-organizacion.png", fullPage: true });
    igual("sin errores en la página", errores, []);
    await q.setViewportSize({ width: 390, height: 800 });
    igual("en el celular la página de la organización tampoco se desplaza a lo ancho", await q.evaluate(() => document.documentElement.scrollWidth), 390);
    await o.ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
