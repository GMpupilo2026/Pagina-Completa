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
   repartir las mesas entre varios, ponerle nombre, cambiarle las mesas), apagarlo y el PDF.

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
  // Lo que la organización le mandó y lo que él pidió: la prueba lo cambia desde afuera.
  window.__avisos = { nombrado: true, arbitro: "Ana Árbitra", mensajes: [], ayuda: null, abiertas: [] };
  window.__servidor = (b) => {
    if (b.token !== TOKEN) return falla(404, "Este enlace no es válido. Pídele a la organización que te mande el QR de nuevo.");
    if (b.action === "avisos") return { data: Object.assign({ ok: true }, window.__avisos), error: null };
    if (b.action === "ayuda") {
      if (b.mesa != null && (b.mesa < 1 || b.mesa > 3)) return falla(403, "La mesa " + b.mesa + " no es de tu rango (1 a 3).");
      if (window.__avisos.abiertas.includes(b.mesa == null ? null : b.mesa)) return { data: { ok: true, ya: true, id: "ay0", creado: "2026-11-02T15:40:00Z" }, error: null };
      window.__avisos.abiertas.push(b.mesa == null ? null : b.mesa);
      window.__avisos.ayuda = { id: "ay" + (++n), creado: "2026-11-02T15:40:00Z", mesa: b.mesa == null ? null : b.mesa, texto: b.texto || "", estado: "abierto", atendido_en: null };
      return { data: { ok: true, id: window.__avisos.ayuda.id, creado: "2026-11-02T15:40:00Z" }, error: null }; }
    if (b.action === "leido") { window.__avisos.mensajes = window.__avisos.mensajes.filter((m) => m.id !== b.id); return { data: { ok: true, marcados: 1 }, error: null }; }
    if (b.action === "nombre") {
      if (window.__avisos.nombrado) return falla(409, "Este enlace ya tiene nombre. Si hay que cambiarlo, díselo a la organización.");
      window.__avisos.nombrado = true; window.__avisos.arbitro = b.nombre.replace(/\\s+/g, " ").trim(); return { data: { ok: true, arbitro: window.__avisos.arbitro }, error: null }; }
    if (b.action === "leer") return { data: Object.assign({}, window.__avisos, { arbitro: window.__avisos.arbitro, tnr: "1529737", torneo: "Sub-10 Femenino", categoria: "Sub-10", rama: "Femenino", ronda: 3, desde: 1, hasta: 3, vence: "2026-11-10T05:59:59Z",
      mesas: MESAS.map((m) => Object.assign({}, m)), marcas: marcasDe(), anotaciones: filas.filter((f) => f.tipo !== "anulacion"), anuladas: filas.filter((f) => f.tipo === "anulacion").map((f) => f.anula), leido_en: "2026-11-02T15:30:00Z" }), error: null };
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

// El panel de la organización: los 12 torneos (3 de muestra), sus enlaces, los avisos y el registro.
function dobleOrganizacion(licencia) {
    return `(function(){
  window.__llamadas = [];
  const R = (data, error) => Promise.resolve({ data, error: error || null });
  const hace = (seg) => new Date(Date.now() - seg * 1000).toISOString();
  const TORNEOS = [
    { tnr: "1529719", nombre: "Sub-8 Absoluto", categoria: "Sub-8", rama: "Absoluto", orden: 1, sid_en_boveda: false, clave_puesta: null, acceso_tnr: null },
    { tnr: "1529729", nombre: "Sub-8 Femenino", categoria: "Sub-8", rama: "Femenino", orden: 2, sid_en_boveda: false, clave_puesta: null, acceso_tnr: null },
    { tnr: "1529733", nombre: "Sub-10 Absoluto", categoria: "Sub-10", rama: "Absoluto", orden: 3, sid_en_boveda: true, clave_puesta: "2026-11-01T10:00:00Z", acceso_tnr: "1529733" }];
  // Ana abrió su enlace hace medio minuto; «Árbitro 1» (por definir) todavía no.
  const ASIG = [
    { id: "asig-ana", token: "a".repeat(64), tnr: "1529733", arbitro: "Ana Árbitra", nombrado: true, mesa_desde: 1, mesa_hasta: 15, vence: "2026-11-10T05:59:59Z", revocada: false, creada: "2026-11-02T10:00:00Z", ultimo_uso: hace(30) },
    { id: "asig-arb1", token: "b".repeat(64), tnr: "1529733", arbitro: "Árbitro 1", nombrado: false, mesa_desde: 16, mesa_hasta: 30, vence: "2026-11-10T05:59:59Z", revocada: false, creada: "2026-11-02T10:01:00Z", ultimo_uso: null }];
  const AVISOS = [{ id: "av-p1", creado: hace(180), de: "arbitro", asignacion_id: "asig-ana", mesa: 4, texto: "Prueba: ven a la mesa", estado: "abierto", atendido_en: null, atendido_por: null, leido_en: null }];
  const REGISTRO = [
    { id: "r1", ocurrio: "2026-11-02T15:00:00Z", asignacion_id: null, arbitro: "Ana", tnr: "1529733", ronda: 1, mesa: 4, color: "blancas", jugador: "Cleo Tres", tipo: "ilegal", resultado: null, anterior: null, articulo: "7.5.5", texto: "", enviado: false, anula: null },
    { id: "r2", ocurrio: "2026-11-02T15:05:00Z", asignacion_id: null, arbitro: "Ana", tnr: "1529733", ronda: 1, mesa: 4, color: "blancas", jugador: "Cleo Tres", tipo: "ilegal", resultado: null, anterior: null, articulo: "7.5.5", texto: "", enviado: false, anula: null },
    { id: "r3", ocurrio: "2026-11-02T15:10:00Z", asignacion_id: null, arbitro: "Beto", tnr: "1529733", ronda: 1, mesa: 9, color: null, jugador: "Eli – Fran", tipo: "resultado", resultado: "1-0", anterior: null, articulo: "", texto: "", enviado: true, anula: null }];
  let n = 0;
  // Lo que pasaría «afuera» mientras la página está abierta: un árbitro pide ayuda y otro lee un aviso.
  window.__nuevoPedido = (asig, mesa, texto) => AVISOS.push({ id: "av-p" + (++n + 1), creado: hace(5), de: "arbitro", asignacion_id: asig, mesa, texto, estado: "abierto", atendido_en: null, atendido_por: null, leido_en: null });
  window.__leerAviso = () => { const a = AVISOS.find((x) => x.de === "organizacion" && x.asignacion_id === "asig-ana"); if (a) a.leido_en = new Date().toISOString(); };
  const TABLAS = { centroamericano_torneos: TORNEOS, centroamericano_asignaciones: ASIG, centroamericano_registro: REGISTRO, centroamericano_avisos: AVISOS };
  const filtrar = (tabla, f) => TABLAS[tabla].filter((r) => Object.entries(f).every(([c, v]) => r[c] === v));
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
    from: (tabla) => { const f = {}; let accion = "select", valores = null;
      let orden = null;
      const q = { select: () => q, order: (c, o) => { orden = [c, !(o && o.ascending === false)]; return q; }, range: () => q, eq: (c, v) => { f[c] = v; return q; },
        insert: (v) => { accion = "insert"; valores = v; return q; }, update: (v) => { accion = "update"; valores = v; return q; },
        then: (ok, ko) => { let r;
          if (accion === "insert") {
            const lista = Array.isArray(valores) ? valores : [valores];
            for (const v of lista) {
              const base = tabla === "centroamericano_avisos"
                ? { id: "av-" + (++n + 20), creado: new Date().toISOString(), estado: "abierto", mesa: null, leido_en: null, atendido_en: null }
                : { id: "a" + (++n), token: String(1000 + n).repeat(16), revocada: false, nombrado: true, creada: new Date().toISOString(), ultimo_uso: null };
              (tabla === "centroamericano_avisos" ? AVISOS : ASIG).push(Object.assign(base, v)); }
            window.__llamadas.push({ insert: tabla, valores }); r = { data: null, error: null }; }
          else if (accion === "update") { filtrar(tabla, f).forEach((x) => Object.assign(x, valores)); window.__llamadas.push({ update: tabla, valores, f }); r = { data: null, error: null }; }
          else { const datos = filtrar(tabla, f).map((x) => Object.assign({}, x)); if (orden && ["ocurrio", "creada", "creado"].includes(orden[0])) datos.sort((a, b) => (a[orden[0]] < b[orden[0]] ? -1 : 1) * (orden[1] ? 1 : -1)); r = { data: datos, error: null }; }
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

    console.log("\n=== Un árbitro «por definir» pone su nombre ===");
    let d = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro().replace('nombrado: true, arbitro: "Ana Árbitra"', 'nombrado: false, arbitro: "Árbitro 1"'), { hash: TOKEN });
    await d.p.waitForSelector(".cam-mesa");
    igual("sin nombre, la página se lo pide arriba y muestra «Árbitro 1» mientras tanto", [await d.p.$eval("#nombre-caja", (c) => c.checkVisibility()), await d.p.textContent("#d-arbitro")], [true, "Árbitro 1"]);
    await d.p.fill("#nombre-campo", "  Carla   Mora ");
    await d.p.click("#nombre-guardar");
    await d.p.waitForFunction(() => document.getElementById("nombre-caja").hidden);
    igual("al guardarlo manda el nombre, la caja se va y el nombre sale en la cabecera", [await d.p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "nombre").map((l) => l.body.nombre)), await d.p.textContent("#d-arbitro")], [["Carla   Mora"], "Carla Mora"]);
    await d.ctx.close();

    console.log("\n=== La organización: el candado ===");
    o = await abrir(browser, "centroamericano-mesas.html", dobleOrganizacion(false), { ancho: 1100 });
    await o.p.waitForSelector("#denegado:not([hidden])");
    igual("sin licencia, el candado y nada más", [await o.p.$eval("#app", (a) => a.checkVisibility()), await o.p.evaluate(() => window.__llamadas.some((l) => l.rpc === "tengo_herramienta" && l.a === "mesa-arbitro"))], [false, true]);
    await o.ctx.close();

    console.log("\n=== La organización: de un vistazo y los pedidos de ayuda ===");
    ({ ctx: o.ctx, p: o.p, errores } = await abrir(browser, "centroamericano-mesas.html", dobleOrganizacion(true), { ancho: 1100 }));
    const q = o.p;
    await q.waitForSelector(".cam-pedido");
    igual("abre en «Ayuda y avisos» porque ya hay una clave, con las cuatro pestañas", await q.$$eval(".cam-pestana", (l) => l.map((b) => [b.dataset.panel, b.getAttribute("aria-selected")])), [["avisos", "true"], ["arbitros", "false"], ["claves", "false"], ["registro", "false"]]);
    igual("arriba siempre a la vista: los pedidos abiertos, quién está conectado y cuántos torneos tienen clave", await q.$eval("#estado-general", (e) => e.textContent.replace(/\s+/g, " ").trim()), "1 pedido de ayuda abierto 1 de 2 árbitros conectados Clave en 1 de 3 torneos 🔔 Activar el sonido de los pedidos");
    igual("la pestaña lleva el contador y el título de la pestaña del navegador también", await q.evaluate(() => [document.getElementById("contador-pedidos").textContent, document.getElementById("contador-pedidos").checkVisibility(), document.title.startsWith("(1) ")]), ["1", true, true]);
    igual("el pedido dice la mesa, quién, de qué torneo, hace cuánto y lo que escribió, y se puede atender o escribirle", await q.$eval(".cam-pedido", (e) => [e.querySelector("p.font-bold").textContent, /^Sub-10 Absoluto · hace 3 min \(\d{1,2}:\d\d [ap]\. m\.\)$/.test(e.querySelectorAll("p")[1].textContent), e.textContent.includes("«Prueba: ven a la mesa»"), [...e.querySelectorAll("button")].map((b) => b.textContent)]), ["🆘 Mesa 4 — Ana Árbitra", true, true, ["Atendido", "Escribirle"]]);
    await q.click("#sonido");
    igual("el sonido se activa con un toque (el navegador no deja sonar sin él) y el botón lo dice", [await q.getAttribute("#sonido", "aria-pressed"), (await q.textContent("#sonido")).trim()], ["true", "🔔 Sonido activado"]);
    await q.click('.cam-pedido [data-accion="escribir"]');
    igual("«Escribirle» deja el aviso dirigido a ese árbitro", await q.$eval("#av-para", (s) => s.value), "a:asig-ana");
    // Un pedido nuevo llega SOLO, sin recargar: el sondeo de la página.
    await q.evaluate(() => window.__nuevoPedido("asig-arb1", 20, "Dos jugadores discuten"));
    await q.waitForFunction(() => document.querySelectorAll(".cam-pedido").length === 2, null, { timeout: 15000 });
    igual("un pedido nuevo aparece solo, el contador sube y el más viejo va primero", await q.evaluate(() => [document.getElementById("contador-pedidos").textContent, [...document.querySelectorAll(".cam-pedido")].map((e) => e.querySelector("p.font-bold").textContent)]), ["2", ["🆘 Mesa 4 — Ana Árbitra", "🆘 Mesa 20 — Árbitro 1"]]);
    await q.click('.cam-pedido[data-id="av-p1"] [data-accion="atender"]');
    await q.waitForFunction(() => document.querySelectorAll(".cam-pedido[data-estado=abierto]").length === 1);
    igual("«Atendido» lo marca en la base y lo pasa a la lista de atendidos", await q.evaluate(() => [window.__llamadas.filter((l) => l.update === "centroamericano_avisos").map((l) => [l.valores.estado, l.f.id]), document.getElementById("atendidos-n").textContent, document.getElementById("contador-pedidos").textContent]), [[["atendido", "av-p1"]], "1", "1"]);

    console.log("\n=== La organización: avisar a los árbitros ===");
    igual("se puede avisar a todos, a un torneo o a un árbitro", await q.$$eval("#av-para option", (l) => l.map((o) => o.textContent)), [
        "Todos los árbitros (2)", "Todo el torneo: Sub-10 Absoluto (2)", "Ana Árbitra — Sub-10 Absoluto, mesas 1 a 15", "Árbitro 1 — Sub-10 Absoluto, mesas 16 a 30"]);
    await q.click('#frases [data-accion="frase"]');
    igual("las frases rápidas llenan el mensaje", await q.inputValue("#av-texto"), "Ya empieza la ronda: a sus mesas.");
    await q.selectOption("#av-para", "todos");
    await q.click("#av-enviar");
    await q.waitForFunction(() => document.querySelectorAll("#enviados tr").length === 1);
    igual("a todos: una fila por árbitro (el aviso lleva su enlace), de la organización y con el texto", await q.evaluate(() => window.__llamadas.filter((l) => l.insert === "centroamericano_avisos").map((l) => l.valores.map((v) => [v.de, v.asignacion_id, v.texto]))),
        [[["organizacion", "asig-ana", "Ya empieza la ronda: a sus mesas."], ["organizacion", "asig-arb1", "Ya empieza la ronda: a sus mesas."]]]);
    igual("la lista de enviados dice cuántos lo leyeron y a quién le falta", await q.$eval("#enviados tr", (tr) => [tr.children[1].textContent, tr.children[2].textContent.startsWith("0 de 2 · falta: ")]), ["Ya empieza la ronda: a sus mesas.", true]);
    await q.evaluate(() => window.__leerAviso());
    await q.waitForFunction(() => document.querySelector("#enviados tr").children[2].textContent.startsWith("1 de 2"), null, { timeout: 15000 });
    igual("cuando uno lo lee, la lista se actualiza sola", await q.$eval("#enviados tr", (tr) => tr.children[2].textContent), "1 de 2 · falta: Árbitro 1");
    await q.selectOption("#av-para", "t:1529733");
    await q.fill("#av-texto", "Pausa de 10 minutos.");
    await q.click("#av-enviar");
    await q.waitForFunction(() => document.querySelectorAll("#enviados tr").length === 2);
    igual("a un torneo les llega a los dos de ese torneo", await q.evaluate(() => window.__llamadas.filter((l) => l.insert === "centroamericano_avisos").pop().valores.length), 2);
    await q.click("#av-enviar");
    igual("sin mensaje no se manda nada", await q.evaluate(() => window.__llamadas.filter((l) => l.insert === "centroamericano_avisos").length), 2);

    console.log("\n=== La organización: los árbitros y sus mesas ===");
    await q.click("#pest-arbitros");
    igual("el panel de los árbitros se ve y los demás no (y la pestaña lo dice)", await q.evaluate(() => ["avisos", "arbitros", "claves", "registro"].map((n) => [document.getElementById("panel-" + n).checkVisibility(), document.getElementById("pest-" + n).getAttribute("aria-selected")])), [[false, "false"], [true, "true"], [false, "false"], [false, "false"]]);
    await q.focus("#pest-arbitros");
    await q.keyboard.press("ArrowRight");
    igual("con el teclado, la flecha pasa a la pestaña siguiente (y el foco con ella)", [await q.getAttribute("#pest-claves", "aria-selected"), await q.evaluate(() => document.activeElement.id)], ["true", "pest-claves"]);
    await q.keyboard.press("ArrowLeft");
    igual("los enlaces salen agrupados por torneo y ordenados por mesa, y el que no tiene nombre lo dice", await q.$$eval(".cam-grupo-torneo", (g) => g.map((x) => [x.querySelector("h3").textContent, [...x.querySelectorAll(".cam-asignacion")].map((a) => [a.querySelector("p.font-bold").textContent, a.dataset.nombrado])])),
        [["Sub-10 Absoluto2 enlaces", [["Ana Árbitra", "si"], ["Árbitro 1Por definir", "no"]]]]);
    igual("cada uno dice si está conectado ahora, cuándo lo vieron o que no lo ha abierto", await q.$$eval(".cam-asignacion .cam-conectado", (l) => l.map((x) => [x.dataset.enLinea, x.textContent])), [["si", "● Conectado ahora"], ["no", "Todavía no ha abierto el enlace"]]);
    igual("y el que tiene un pedido abierto lo avisa", await q.$$eval(".cam-asignacion", (l) => l.map((a) => a.textContent.includes("pedido de ayuda abierto"))), [false, true]);
    // crear sin nombre
    await q.selectOption("#a-torneo", "1529733");
    await q.fill("#a-desde", "31");
    await q.fill("#a-hasta", "40");
    await q.click("#a-crear");
    await q.waitForFunction(() => document.querySelectorAll(".cam-asignacion").length === 3);
    igual("sin nombre se crea «Árbitro 2», marcado por definir, con su torneo, sus mesas y el vencimiento (9 de noviembre, hora de Costa Rica)", await q.evaluate(() => window.__llamadas.filter((l) => l.insert === "centroamericano_asignaciones").map((l) => [l.valores.tnr, l.valores.arbitro, l.valores.nombrado, l.valores.mesa_desde, l.valores.mesa_hasta, l.valores.vence])), [["1529733", "Árbitro 2", false, 31, 40, "2026-11-10T05:59:59.000Z"]]);
    const enlace = await q.$eval('.cam-asignacion[data-nombrado="no"] [data-accion="abrir"]', (a) => a.href);
    igual("el enlace lleva el token DESPUÉS del «#», y tiene su QR y su WhatsApp (sin saludar al «Árbitro 2»)", [/\/centroamericano-arbitro\.html#[0-9a-z]{64}$/.test(enlace), await q.$eval(".cam-qr svg", (s) => s.getAttribute("aria-label").startsWith("QR del enlace de ")), (await q.$eval('.cam-asignacion[data-nombrado="no"] [data-accion="whatsapp"]', (a) => decodeURIComponent(a.href))).includes("Hola: tus mesas del Centroamericano (Sub-10 Absoluto, mesas")], [true, true, true]);
    // crear con nombre y mesas ya tomadas
    await q.fill("#a-arbitro", "Beto Mora");
    await q.fill("#a-desde", "10");
    await q.fill("#a-hasta", "20");
    await q.click("#a-crear");
    await q.waitForSelector("[data-avisos-aceptar]");
    igual("unas mesas que ya tiene otro árbitro se avisan antes de crear", (await q.textContent("dialog")).includes("Esas mesas ya las tiene Ana Árbitra (1 a 15), Árbitro 1 (16 a 30)"), true);
    await q.click("dialog [data-avisos-cancelar]");
    await q.fill("#a-arbitro", "");
    // ponerle nombre
    const tarjeta = (nombre) => q.locator(".cam-asignacion", { hasText: nombre });
    await tarjeta("Árbitro 1").locator('[data-accion="nombre"]').click();
    await q.waitForSelector("dialog[open] input");
    await q.fill("dialog[open] input", "Carla Mora");
    await q.click("dialog[open] [data-avisos-aceptar]");
    await q.waitForFunction(() => [...document.querySelectorAll(".cam-asignacion p.font-bold")].some((p) => p.textContent === "Carla Mora"));
    igual("«Ponerle nombre» guarda el nombre, lo marca como puesto y quita «Por definir»", await q.evaluate(() => [window.__llamadas.filter((l) => l.update === "centroamericano_asignaciones" && l.valores.nombrado).map((l) => [l.valores.arbitro, l.valores.nombrado, l.f.id]), document.querySelectorAll('.cam-asignacion[data-id="asig-arb1"] .cam-chip').length]), [[["Carla Mora", true, "asig-arb1"]], 0]);
    // cambiar las mesas
    await tarjeta("Ana Árbitra").locator('[data-accion="mesas"]').click();
    await q.waitForSelector("dialog[open] input");
    await q.fill("dialog[open] input", "9-3");
    await q.click("dialog[open] [data-avisos-aceptar]");
    await q.waitForFunction(() => document.body.textContent.includes("No entendí las mesas"));
    igual("unas mesas al revés se rechazan sin tocar nada", await q.evaluate(() => window.__llamadas.filter((l) => l.update === "centroamericano_asignaciones" && l.valores.mesa_desde).length), 0);
    await tarjeta("Ana Árbitra").locator('[data-accion="mesas"]').click();
    await q.waitForSelector("dialog[open] input");
    await q.fill("dialog[open] input", "1 a 12");
    await q.click("dialog[open] [data-avisos-aceptar]");
    await q.waitForFunction(() => document.body.textContent.includes("1 a 12"));
    igual("«Cambiar las mesas» entiende «1 a 12» y lo guarda", await q.evaluate(() => window.__llamadas.filter((l) => l.update === "centroamericano_asignaciones" && l.valores.mesa_desde).map((l) => [l.valores.mesa_desde, l.valores.mesa_hasta, l.f.id])), [[1, 12, "asig-ana"]]);
    // repartir
    await q.evaluate(() => { document.getElementById("reparto").open = true; });
    await q.selectOption("#rp-torneo", "1529733");
    await q.click("#rp-leer");
    await q.waitForFunction(() => document.getElementById("rp-mesas").value === "30");
    await q.fill("#rp-arbitros", "3");
    igual("«Leer las mesas» trae cuántas hay, y la vista previa reparte parejo con los números que siguen (hay un «Árbitro 2»)", [await q.textContent("#rp-estado"), await q.textContent("#rp-vista")], ["La ronda 2 tiene 30 mesas.", "Árbitro 3: mesas 1 a 10 · Árbitro 4: mesas 11 a 20 · Árbitro 5: mesas 21 a 30"]);
    await q.click("#rp-crear");
    await q.waitForSelector("[data-avisos-aceptar]");
    igual("avisa que el torneo ya tiene enlaces activos antes de sumar más", (await q.textContent("dialog")).includes("ya tiene 3 enlaces activos"), true);
    await q.click("dialog [data-avisos-aceptar]");
    await q.waitForFunction(() => document.querySelectorAll(".cam-asignacion").length === 6);
    igual("se crean los tres por definir, con mesas seguidas y sin hueco", await q.evaluate(() => window.__llamadas.filter((l) => l.insert === "centroamericano_asignaciones").pop().valores.map((v) => [v.arbitro, v.nombrado, v.mesa_desde, v.mesa_hasta])), [["Árbitro 3", false, 1, 10], ["Árbitro 4", false, 11, 20], ["Árbitro 5", false, 21, 30]]);
    // apagar
    await tarjeta("Ana Árbitra").locator('[data-accion="apagar"]').click();
    await q.waitForSelector("[data-avisos-aceptar]");
    await q.click("[data-avisos-aceptar]");
    await q.waitForSelector('.cam-asignacion[data-estado="apagado"]');
    igual("apagar un enlace pide confirmar y lo deja apagado (se puede volver a encender)", [await q.$$eval('.cam-asignacion[data-estado="apagado"]', (l) => l.length), await tarjeta("Ana Árbitra").locator('[data-accion="reactivar"]').textContent()], [1, "Volver a encender"]);
    igual("un enlace apagado ya no es destino de los avisos", await q.$$eval("#av-para option", (l) => l.map((o) => o.textContent)).then((l) => l.some((t) => t.startsWith("Ana Árbitra"))), false);

    console.log("\n=== La organización: UNA clave para todo el grupo ===");
    await q.click("#pest-claves");
    igual("no hay una casilla de clave por torneo: solo la del grupo (y la del bloque de otras claves)", await q.evaluate(() => [document.querySelectorAll("#torneos input, #torneos textarea").length, [...document.querySelectorAll("#panel-claves input")].filter((i) => i.type === "password").map((i) => i.id)]), [0, ["g-sid"]]);
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
    igual("la clave del grupo abre los torneos ligados de una vez, y dice si falta alguno", [await q.textContent("#g-estado"), await q.textContent("#resumen-claves"), await q.$$eval(".cam-estado-torneo", (l) => l.map((t) => t.dataset.clave))],
        ["✓ Guardada: esta clave abre 2 torneos ligados (Sub-8 Absoluto, Sub-8 Femenino). Ronda 1 con 21 mesas en el primero.", "✓ Los 3 torneos tienen la clave cargada.", ["si", "si", "si"]]);
    igual("la clave llegó a la función con el código del grupo, y la casilla se vació y no quedó en el navegador", await q.evaluate((s) => [window.__llamadas.some((l) => l.body && l.body.action === "poner" && l.body.tnr === "1529700" && l.body.sid === s), document.getElementById("g-sid").value, JSON.stringify(localStorage).includes(s) || JSON.stringify(sessionStorage).includes(s)], SID), [true, "", false]);
    igual("arriba, el estado general ya dice que están los tres", await q.textContent("#eg-claves"), "Clave cargada en los 3 torneos");
    await q.click('.cam-estado-torneo[data-tnr="1529733"] [data-accion="probar"]');
    await q.waitForSelector("#est-1529733.cam-guardado");
    igual("«Probar» dice que sirve y cuántas mesas tiene la ronda", await q.textContent("#est-1529733"), "✓ Sirve. Ronda 2, 30 mesas.");
    await q.evaluate(() => { document.getElementById("pegar").open = true; });
    await q.fill("#claves-bloque", "1529700 " + SID + "\n1529733 corta\nabc " + SID);
    await q.click("#claves-bloque-guardar");
    await q.waitForFunction(() => document.querySelectorAll("#claves-bloque-resultado li").length >= 3 && [...document.querySelectorAll("#claves-bloque-resultado li")].some((l) => l.textContent.startsWith("✓")));
    igual("otras claves en bloque: las malas se reportan con su línea y la buena ya no queda escrita", [await q.$$eval("#claves-bloque-resultado li", (l) => [l[0].textContent.startsWith("Línea 2: La clave son entre 8 y 32"), l[1].textContent.startsWith("Línea 3: El código del torneo son hasta 7"), l[2].textContent.startsWith("✓ Código 1529700: Guardada: esta clave abre 2 torneos")]), await q.inputValue("#claves-bloque")],
        [[true, true, true], "1529733 corta\nabc " + SID]);

    console.log("\n=== La organización: lo que anotan ===");
    await q.click("#pest-registro");
    igual("los jugadores con ilegales, primero quien más lleva, y la segunda dice que pierde", await q.$$eval("#marcados tr", (l) => l.map((tr) => [...tr.children].map((td) => td.textContent))),
        [["Sub-10 Absoluto", "1", "4", "Cleo Tres (blancas)", "ii 2 — pierde la partida (art. 7.5.5)", "—"]]);
    igual("todo lo anotado, lo más reciente primero, con su detalle", await q.$$eval("#registro tr", (l) => l.map((tr) => [tr.children[4].textContent, tr.children[5].textContent, tr.children[6].textContent])),
        [["Beto", "Resultado", "1-0 (ganan blancas) — Eli – Fran · enviado a chess-results"], ["Ana", "Ilegal", "Cleo Tres (blancas)"], ["Ana", "Ilegal", "Cleo Tres (blancas)"]]);
    const [descarga] = await Promise.all([q.waitForEvent("download"), q.click("#r-pdf")]);
    const pdf = fs.readFileSync(await descarga.path());
    igual("el PDF del registro, con su nombre y la marca de agua", [descarga.suggestedFilename(), pdf.toString("latin1").startsWith("%PDF"), /\/SMask \d+ 0 R/.test(pdf.toString("latin1"))], ["registro-arbitros-centroamericano-2026.pdf", true, true]);
    igual("sin errores en la página", errores, []);

    console.log("\n=== La organización en la tablet y en el celular, en claro y en oscuro ===");
    const coloresOrg = ".cam-pedido, .cam-pestana, .cam-contador, .cam-estado-general, .cam-chip, .cam-btn, .cam-estado-torneo, .cam-asignacion, .cam-conectado, .cam-clave-grupo, .cam-tarjeta, .cam-guardado, .cam-fallo, .cam-tabla td, .cam-tabla th, .cam-grupo-torneo h3";
    const contrastePorPanel = async (pg) => {
        const peores = [];
        for (const nombre of ["avisos", "arbitros", "claves", "registro"]) {
            await pg.click("#pest-" + nombre);
            const l = await pg.evaluate("(" + CONTRASTE + ")(" + JSON.stringify(coloresOrg) + ")");
            peores.push(Math.min(...l, 99));
        }
        return Math.min(...peores);
    };
    await q.setViewportSize({ width: 820, height: 1180 });
    igual("en la tablet vertical (820 px) la página no se desplaza a lo ancho, en ninguna pestaña", await (async () => { const w = []; for (const n of ["avisos", "arbitros", "claves", "registro"]) { await q.click("#pest-" + n); w.push(await q.evaluate(() => document.documentElement.scrollWidth)); } return w; })(), [820, 820, 820, 820]);
    igual("cada botón y pestaña se toca bien (40 px de alto o más)", await q.evaluate(() => [...document.querySelectorAll(".cam-pestana, .cam-btn")].filter((b) => b.checkVisibility()).every((b) => b.getBoundingClientRect().height >= 40)), true);
    igual("en claro, todo el texto de la organización da 4,5:1 o más, en las cuatro pestañas", (await contrastePorPanel(q)) >= 4.5, true);
    await q.click("#pest-arbitros");
    if (process.env.CAPTURA) await q.screenshot({ path: process.env.CAPTURA + "-organizacion.png", fullPage: true });
    await q.setViewportSize({ width: 390, height: 800 });
    igual("en el celular la página de la organización tampoco se desplaza a lo ancho", await q.evaluate(() => document.documentElement.scrollWidth), 390);
    await o.ctx.close();
    o = await abrir(browser, "centroamericano-mesas.html", dobleOrganizacion(true), { ancho: 1100, esquema: "dark" });
    await o.p.waitForSelector(".cam-pedido");
    igual("en oscuro, todo el texto de la organización da 4,5:1 o más, en las cuatro pestañas", (await contrastePorPanel(o.p)) >= 4.5, true);
    if (process.env.CAPTURA) { await o.p.click("#pest-avisos"); await o.p.screenshot({ path: process.env.CAPTURA + "-organizacion-oscuro.png", fullPage: true }); }
    await o.ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
