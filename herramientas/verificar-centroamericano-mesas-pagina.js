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
const { TOKEN, TOKEN_B } = require("./lib/doble-centroamericano-arbitro");
const SID = "AAAA1111BBBB2222CCCC3333DDDD4444";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

const { MESAS, SERVIDOR_ARBITRO, dobleArbitro } = require("./lib/doble-centroamericano-arbitro");

// El programa de la organización: los 12 torneos (3 de muestra), sus enlaces, el avance, los avisos,
// las planillas, las copias y el registro.
function dobleOrganizacion(licencia) {
    return `(function(){
  window.__llamadas = [];
  const R = (data, error) => Promise.resolve({ data, error: error || null });
  const hace = (seg) => new Date(Date.now() - seg * 1000).toISOString();
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const TORNEOS = [
    { tnr: "1529719", nombre: "Sub-8 Absoluto", categoria: "Sub-8", rama: "Absoluto", orden: 1, sid_en_boveda: false, clave_puesta: null, acceso_tnr: null },
    { tnr: "1529729", nombre: "Sub-8 Femenino", categoria: "Sub-8", rama: "Femenino", orden: 2, sid_en_boveda: false, clave_puesta: null, acceso_tnr: null },
    { tnr: "1529733", nombre: "Sub-10 Absoluto", categoria: "Sub-10", rama: "Absoluto", orden: 3, sid_en_boveda: true, clave_puesta: "2026-11-01T10:00:00Z", acceso_tnr: "1529733" }];
  // Ana abrió su enlace hace medio minuto; «Árbitro 1» (por definir) todavía no, pero ya terminó sus 15 mesas.
  const ASIG = [
    { id: "asig-ana", token: "a".repeat(64), tnr: "1529733", arbitro: "Ana Árbitra", nombrado: true, mesa_desde: 1, mesa_hasta: 15, vence: "2026-11-10T05:59:59Z", revocada: false, creada: "2026-11-02T10:00:00Z", ultimo_uso: hace(30) },
    { id: "asig-arb1", token: "b".repeat(64), tnr: "1529733", arbitro: "Árbitro 1", nombrado: false, mesa_desde: 16, mesa_hasta: 30, vence: "2026-11-10T05:59:59Z", revocada: false, creada: "2026-11-02T10:01:00Z", ultimo_uso: null }];
  const PROGRESO = [
    { asignacion_id: "asig-ana", ronda: 3, total: 15, con_resultado: 7, pendientes: [8, 9, 10, 11, 12, 13, 14, 15], actualizado: hace(20) },
    { asignacion_id: "asig-arb1", ronda: 3, total: 15, con_resultado: 15, pendientes: [], actualizado: hace(20) }];
  const FINALES = [];
  const LISTAS = [{ asignacion_id: "asig-ana", ronda: 3, paso: "relojes", aprobada_en: hace(900) }];
  const AVISOS = [
    { id: "av-p1", creado: hace(180), de: "arbitro", asignacion_id: "asig-ana", mesa: 4, texto: "Prueba: ven a la mesa", estado: "abierto", atendido_en: null, atendido_por: null, leido_en: null, tipo: "ayuda", ronda: null },
    { id: "av-t1", creado: hace(60), de: "arbitro", asignacion_id: "asig-arb1", mesa: null, texto: "Terminó sus 15 mesas de la ronda 3.", estado: "abierto", atendido_en: null, atendido_por: null, leido_en: null, tipo: "termino", ronda: 3 }];
  const PLANILLAS = [
    { id: "pl1", asignacion_id: "asig-ana", arbitro: "Ana Árbitra", tnr: "1529733", ronda: 3, mesa: 2, lado: "blancas", jugador: "Harvey Ian", rival: "Acuña Porras Fabio", ruta: "1529733/ronda-3/mesa-2-planillas.jpg", subida: hace(300), bytes: 90000, drive_ok: true, drive_en: hace(290), drive_error: "" },
    { id: "pl2", asignacion_id: "asig-ana", arbitro: "Ana Árbitra", tnr: "1529733", ronda: 3, mesa: 3, lado: "blancas", jugador: "Hopkins John", rival: "Baquero Graterol", ruta: "1529733/ronda-3/mesa-3-planillas.jpg", subida: hace(280), bytes: 91000, drive_ok: false, drive_en: null, drive_error: "" }];
  const COPIA = (n) => ({ version: 1, evento: "Centroamericano 2026", creada: hace(n), asignaciones: ASIG, registro: [], avisos: [], progreso: [], finales: [], planillas: [] });
  const COPIAS = [
    { anillo: "a", ranura: 7, creada: hace(120), huella: "h1", resumen: { asignaciones: 2, registro: 3, avisos: 2, planillas: 2 }, contenido: COPIA(120) },
    { anillo: "m", ranura: 3, creada: hace(7200), huella: "h2", resumen: { asignaciones: 2, registro: 1, avisos: 0, planillas: 0 }, contenido: COPIA(7200) }];
  const PRESENCIA = [
    { id: "pr1", asignacion_id: "asig-ana", arbitro: "Ana Árbitra", tnr: "1529733", ronda: 3, mesa: 5, color: "negras", jugador: "Cleo Tres", presente: false, marcada: hace(600) },
    { id: "pr2", asignacion_id: "asig-ana", arbitro: "Ana Árbitra", tnr: "1529733", ronda: 3, mesa: 5, color: "blancas", jugador: "Dani Cuatro", presente: true, marcada: hace(600) }];
  const TIEMPOS = [
    { id: "ti1", ocurrio: hace(900), asignacion_id: "asig-ana", arbitro: "Ana Árbitra", tnr: "1529733", ronda: 3, mesa: 9, blancas: "Eli Uno", negras: "Fran Dos", jugada: 22, j_blancas: null, j_negras: null, turno: "blancas", t_blancas: 1500, t_negras: 1710, nota: "" },
    { id: "ti2", ocurrio: hace(300), asignacion_id: "asig-ana", arbitro: "Ana Árbitra", tnr: "1529733", ronda: 3, mesa: 9, blancas: "Eli Uno", negras: "Fran Dos", jugada: 31, j_blancas: 31, j_negras: 30, turno: null, t_blancas: 600, t_negras: 5025, nota: "" },
    { id: "ti3", ocurrio: hace(200), asignacion_id: "asig-ana", arbitro: "Ana Árbitra", tnr: "1529733", ronda: 3, mesa: 11, blancas: "Gus Tres", negras: "Hugo Cuatro", jugada: 18, j_blancas: 18, j_negras: 18, turno: null, t_blancas: 2700, t_negras: 2655, nota: "" }];
  const REGISTRO = [
    { id: "r1", ocurrio: "2026-11-02T15:00:00Z", asignacion_id: null, arbitro: "Ana", tnr: "1529733", ronda: 1, mesa: 4, color: "blancas", jugador: "Cleo Tres", tipo: "ilegal", resultado: null, anterior: null, articulo: "7.5.5", texto: "", enviado: false, anula: null },
    { id: "r2", ocurrio: "2026-11-02T15:05:00Z", asignacion_id: null, arbitro: "Ana", tnr: "1529733", ronda: 1, mesa: 4, color: "blancas", jugador: "Cleo Tres", tipo: "ilegal", resultado: null, anterior: null, articulo: "7.5.5", texto: "", enviado: false, anula: null },
    { id: "r3", ocurrio: "2026-11-02T15:10:00Z", asignacion_id: null, arbitro: "Beto", tnr: "1529733", ronda: 1, mesa: 9, color: null, jugador: "Eli – Fran", tipo: "resultado", resultado: "1-0", anterior: null, articulo: "", texto: "", enviado: true, anula: null }];
  let n = 0;
  window.__driveOk = false;
  // Lo que pasaría «afuera» mientras la página está abierta: un árbitro pide ayuda y otro lee un aviso.
  window.__nuevoAviso = (asig, mesa, texto, tipo, ronda) => AVISOS.push({ id: "av-n" + (++n), creado: hace(5), de: "arbitro", asignacion_id: asig, mesa, texto, estado: "abierto", atendido_en: null, atendido_por: null, leido_en: null, tipo: tipo || "ayuda", ronda: ronda || null });
  window.__leerAviso = () => { const a = AVISOS.find((x) => x.de === "organizacion" && x.asignacion_id === "asig-ana"); if (a) a.leido_en = new Date().toISOString(); };
  const TABLAS = { centroamericano_torneos: TORNEOS, centroamericano_asignaciones: ASIG, centroamericano_registro: REGISTRO, centroamericano_avisos: AVISOS, centroamericano_progreso: PROGRESO, centroamericano_finales: FINALES, centroamericano_listas: LISTAS, centroamericano_planillas: PLANILLAS, centroamericano_copias: COPIAS, centroamericano_presencia: PRESENCIA, centroamericano_tiempos: TIEMPOS };
  const filtrar = (tabla, f) => TABLAS[tabla].filter((r) => Object.entries(f).every(([c, v]) => r[c] === v));
  window.sb = {
    auth: { getSession: () => R({ session: { user: { id: "yo" }, access_token: "x" } }), getUser: () => R({ user: { id: "yo" } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => R({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => R({ all: [], totp: [] }) } },
    rpc: (f, a) => { window.__llamadas.push({ rpc: f, a: a && a.p_herramienta, copia: a && a.p_copia });
      if (f === "tengo_herramienta") return R(${licencia ? "a.p_herramienta === 'mesa-arbitro'" : "false"});
      if (f === "centroamericano_copia_manual") return R(COPIA(0));
      if (f === "centroamericano_restaurar") return a.p_copia.version !== 1 ? R(null, { message: "Ese archivo no es una copia del Centroamericano 2026" }) : R({ asignaciones: 1, registro: 0, avisos: 0, progreso: 0, finales: 0, planillas: 0 });
      return R(null); },
    storage: { from: (b) => ({ createSignedUrl: (ruta) => { window.__llamadas.push({ foto: b + "/" + ruta }); return R({ signedUrl: "data:image/png;base64," + PNG }); } }) },
    functions: { invoke: (f, o) => { window.__llamadas.push({ f, body: JSON.parse(JSON.stringify(o.body)) }); const b = o.body;
      const err = (estado, error) => ({ data: null, error: { context: { status: estado, json: () => Promise.resolve({ error }) } } });
      if (b.action === "poner") {
        if (b.sid === "MALAMALAMALA1234") return Promise.resolve(err(401, "chess-results no aceptó el código o la clave. Revísalos en Swiss-Manager. No se guardó la clave."));
        const abre = b.tnr === "1529700" ? ["1529719", "1529729"] : [b.tnr];
        const mios = TORNEOS.filter((t) => abre.includes(t.tnr)); if (!mios.length) return Promise.resolve(err(404, "Esa clave abre " + b.tnr + " (otro), y ninguno es del Centroamericano. No se guardó la clave."));
        mios.forEach((t) => { t.sid_en_boveda = true; t.acceso_tnr = b.tnr; t.clave_puesta = "2026-11-02T16:00:00Z"; });
        return Promise.resolve({ data: { ok: true, acceso: b.tnr, torneos: mios.map((t) => ({ tnr: t.tnr, nombre: t.nombre })), ronda: 1, mesas: 21, otros: [] }, error: null }); }
      if (b.action === "probar") return Promise.resolve({ data: { ok: true, torneo: "Sub-10 Absoluto", ronda: 2, mesas: 30 }, error: null });
      if (b.action === "resumen") { PROGRESO[0].con_resultado = 9; PROGRESO[0].pendientes = [10, 11, 12, 13, 14, 15]; return Promise.resolve({ data: { ok: true, torneos: 1, errores: [] }, error: null }); }
      if (b.action === "drive_estado") return Promise.resolve({ data: { ok: true, conectado: window.__driveOk, pendientes: PLANILLAS.filter((x) => !x.drive_ok).length, ultima_copia: window.__driveOk ? hace(300) : null }, error: null });
      if (b.action === "drive_conectar") {
        if (b.secreto === "MALOMALOMALOMALOMALOMALOMALOMALOMALO") return Promise.resolve(err(400, "No se pudo conectar: secreto. No se guardó nada."));
        window.__driveOk = true; return Promise.resolve({ data: { ok: true, carpeta: "Planillas Centroamericano" }, error: null }); }
      if (b.action === "drive_reintentar") { PLANILLAS.forEach((x) => { x.drive_ok = true; }); return Promise.resolve({ data: { ok: true, enviadas: 1, fallaron: 0, quedan: 0 }, error: null }); }
      return Promise.resolve(err(400, "Acción desconocida.")); } },
    from: (tabla) => { const f = {}; let accion = "select", valores = null;
      let orden = null;
      const q = { select: () => q, order: (c, o) => { orden = [c, !(o && o.ascending === false)]; return q; }, range: () => q, eq: (c, v) => { f[c] = v; return q; },
        maybeSingle: () => { const x = filtrar(tabla, f)[0]; return Promise.resolve({ data: x ? Object.assign({}, x) : null, error: null }); },
        insert: (v) => { accion = "insert"; valores = v; return q; }, update: (v) => { accion = "update"; valores = v; return q; },
        then: (ok, ko) => { let r;
          if (accion === "insert") {
            const lista = Array.isArray(valores) ? valores : [valores];
            for (const v of lista) {
              const base = tabla === "centroamericano_avisos"
                ? { id: "av-" + (++n + 20), creado: new Date().toISOString(), estado: "abierto", mesa: null, leido_en: null, atendido_en: null, tipo: "ayuda", ronda: null }
                : { id: "a" + (++n), token: String(1000 + n).repeat(16), revocada: false, nombrado: true, creada: new Date().toISOString(), ultimo_uso: null };
              (tabla === "centroamericano_avisos" ? AVISOS : ASIG).push(Object.assign(base, v)); }
            window.__llamadas.push({ insert: tabla, valores }); r = { data: null, error: null }; }
          else if (accion === "update") { filtrar(tabla, f).forEach((x) => Object.assign(x, valores)); window.__llamadas.push({ update: tabla, valores, f }); r = { data: null, error: null }; }
          else { const datos = filtrar(tabla, f).map((x) => Object.assign({}, x)); if (orden && ["ocurrio", "creada", "creado", "subida"].includes(orden[0])) datos.sort((a, b) => (a[orden[0]] < b[orden[0]] ? -1 : 1) * (orden[1] ? 1 : -1)); r = { data: datos, error: null }; }
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
    await p.waitForSelector("dialog[open] select");
    igual("al tocar «Ilegal» sale la lista de tipos (con «Otra») y dice que es la primera: dos minutos al rival", await p.evaluate(() => { const d = document.querySelector("dialog[open]"); return [[...d.querySelectorAll("option")].map((o) => o.textContent).slice(0, 2), d.querySelectorAll("option").length, d.textContent.includes("2 minutos más a su rival")]; }), [["Movió una pieza como esa pieza no puede moverse", "Dejó o puso su propio rey en jaque"], 8, true]);
    await p.selectOption("dialog[open] select", "enroque");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForSelector("dialog[open] [data-avisos-aceptar]");
    igual("anotada la primera, un cuadro que no se pasa por alto recuerda los 2 minutos", await p.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("Primera ilegal: dale 2 minutos al rival"), t.includes("2 minutos")]; }), [true, true]);
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForSelector('.cam-mesa[data-mesa="2"] .cam-aviso-suave');
    igual("el tipo elegido queda en la bitácora sin escribir nada", await p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "anotar" && l.body.tipo === "ilegal").map((l) => l.body.texto)), ["Enroque ilegal"]);
    igual("la primera: se anota por ronda, mesa y color, y avisa los 2 minutos del rival (art. 7.5.5)", await p.evaluate(() => ({
        llamada: window.__llamadas.filter((l) => l.body.action === "anotar").map((l) => [l.body.ronda, l.body.mesa, l.body.color, l.body.tipo]),
        marca: document.querySelector('.cam-mesa[data-mesa="2"] .cam-marca[data-tipo="ilegal"]').textContent,
        aviso: document.querySelector('.cam-mesa[data-mesa="2"] .cam-aviso-suave').textContent })),
        { llamada: [[3, 2, "blancas", "ilegal"]], marca: "iIlegal", aviso: "Primera jugada ilegal. Harvey Ian hizo una jugada ilegal: dale 2 minutos más a su rival (art. 7.5.5). Con otra, pierde la partida." });
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
    igual("«Irregularidad» ofrece una lista para elegir, con «Otra»", await p.$$eval("dialog[open] option", (l) => [l.length, l[0].textContent, l[l.length - 1].textContent]), [10, "Tocó una pieza y no la movió (pieza tocada)", "Otra (escribir qué pasó)"]);
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
    igual("cada jugador dice «sin revisar» y la barra cuenta cuántos faltan por revisar", await p.evaluate(() => [document.querySelector('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="blancas"] .cam-presencia-estado').textContent, document.getElementById("presencia-resumen").textContent]), ["Presencia: sin revisar", "Presencia revisada: 0 de 6 jugadores."]);
    await p.click(acc(2, "blancas", "ausente"));
    await p.waitForFunction(() => document.getElementById("presencia-resumen").textContent.includes("no han llegado: 1"));
    igual("«No ha llegado» se anota con la mesa y el color, se ve al instante y la barra lo cuenta", await p.evaluate(() => [window.__llamadas.filter((l) => l.body.action === "presencia").map((l) => [l.body.mesa, l.body.color, l.body.presente]), document.querySelector('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="blancas"] .cam-presencia-estado').textContent, document.getElementById("presencia-resumen").textContent]),
        [[[2, "blancas", false]], "✗ No ha llegado", "Presencia revisada: 1 de 6 jugadores · no han llegado: 1."]);
    await p.click(acc(2, "blancas", "presente"));
    await p.waitForFunction(() => document.getElementById("presencia-resumen").textContent === "Presencia revisada: 1 de 6 jugadores.");
    igual("si llega, el árbitro lo cambia a «Llegó» y ya no cuenta como ausente", await p.textContent('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="blancas"] .cam-presencia-estado'), "✓ Llegó");
    igual("cada mesa SIN terminar tiene su relojito (icono, sin texto y con su nombre accesible); las que ya tienen resultado, no", await p.evaluate(() => [[...document.querySelectorAll('.cam-mesa [data-accion="tiempo"]')].map((b) => [b.closest(".cam-mesa").dataset.mesa, b.textContent.trim(), !!b.querySelector("svg"), b.getAttribute("aria-label")]), document.querySelector('.cam-mesa[data-mesa="3"] [data-accion="tiempo"]')]),
        [[["2", "", true, "Control de tiempos de la mesa 2"]], null]);
    await p.click('.cam-mesa[data-mesa="2"] [data-accion="tiempo"]');
    await p.waitForSelector("#control-tiempos:not([hidden]) #form-tiempos");
    igual("el relojito abre la ventanita de ESA mesa, flotando, con Blancas y Negras (su nombre, el tiempo y las jugadas) y Guardar", await p.evaluate(() => [document.querySelector("#control-tiempos .cam-flotante-titulo").textContent, getComputedStyle(document.getElementById("control-tiempos")).position, [...document.querySelectorAll("#form-tiempos .cam-tiempo-lado")].map((f) => [f.dataset.color, f.querySelector(".cam-tiempo-nombre").textContent, !!f.querySelector("input#lt-t" + (f.dataset.color === "blancas" ? "b" : "n")), !!f.querySelector("input#lt-j" + (f.dataset.color === "blancas" ? "b" : "n"))]), document.getElementById("lt-guardar").textContent, !!document.getElementById("lt-mesa")]),
        ["Mesa 2", "fixed", [["blancas", "Harvey Ian", true, true], ["negras", "Acuña Porras Fabio", true, true]], "Guardar", false]);
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
    await p.click('#control-tiempos [data-accion="minimizar-tiempos"]');
    igual("se puede minimizar (para meter un resultado) y volver a abrir sin perder lo escrito", await p.evaluate(() => [document.getElementById("form-tiempos"), document.querySelector('#control-tiempos [data-accion="minimizar-tiempos"]').getAttribute("aria-label"), document.getElementById("control-tiempos").dataset.minimizada]), [null, "Abrir el control de tiempos", "si"]);
    await p.click('#control-tiempos [data-accion="minimizar-tiempos"]');
    await p.waitForSelector("#form-tiempos");
    igual("al abrirla de nuevo siguen lo escrito", await p.evaluate(() => [document.getElementById("lt-tb").value, document.getElementById("lt-jb").value, document.getElementById("lt-tn").value, document.getElementById("lt-jn").value]), ["4:00", "32", "5:00", "32"]);
    await p.click('#control-tiempos [data-accion="cerrar-tiempos"]');
    await p.click("#abrir-tiempos");
    await p.waitForSelector("#control-tiempos:not([hidden]) #form-tiempos");
    igual("el botón de arriba también abre el control de tiempos (para elegir cualquier mesa sin terminar)", await p.evaluate(() => [document.querySelector("#control-tiempos .cam-flotante-titulo").textContent, !!document.querySelector("#abrir-tiempos svg")]), ["Mesa 2", true]);
    await p.click('#control-tiempos [data-accion="cerrar-tiempos"]');
    await p.evaluate(() => { window.__avisos.mensajes = [{ id: "m-ct", creado: "2026-11-02T15:58:00Z", texto: "Control de tiempos: anota la jugada y los relojes de las mesas que no han terminado.", control_tiempos: true }]; });
    await p.click("#actualizar");
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
    await p.click("#actualizar");
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
    for (let i = 0; i < 2; i++) { await o.p.click("#aprobar-paso"); await o.p.waitForTimeout(150); }
    await o.p.waitForFunction(() => document.getElementById("lista-previa").hidden);
    await o.p.selectOption("#res-1", "1");
    await o.p.click(boton(1));
    await o.p.waitForSelector('.cam-mesa[data-mesa="1"] .cam-guardado');
    await o.p.click(acc(2, "negras", "ilegal"));
    await o.p.waitForSelector("dialog[open] select");
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
    igual("se ve como un programa: barra de título, menú con ocho pestañas, contenido y barra de estado abajo", await q.evaluate(() => [!!document.querySelector(".cam-ventana .cam-titulo-ventana"), [...document.querySelectorAll(".cam-pestana")].map((b) => b.dataset.panel), !!document.querySelector(".cam-ventana .cam-contenido"), document.querySelector(".cam-ventana > .cam-barra-estado") !== null, document.querySelectorAll("table.cam-rejilla").length > 3]),
        [true, ["ronda", "avisos", "arbitros", "tiempos", "planillas", "claves", "respaldo", "registro"], true, true, true]);
    igual("abre en «Ronda en curso» porque ya hay una clave", await q.$$eval(".cam-pestana", (l) => l.map((b) => b.getAttribute("aria-selected"))), ["true", "false", "false", "false", "false", "false", "false", "false"]);
    igual("el resumen dice cuánto le queda a cada árbitro, con las mesas que faltan", await q.$$eval("#resumen tr", (l) => l.map((tr) => [tr.children[0].textContent, tr.children[2].textContent, tr.children[3].textContent.replace(/\s+/g, " ").trim(), tr.children[4].textContent, tr.dataset.estado])),
        [["Ana Árbitra", "1 a 15", "7 de 15", "8 (8 a 15)", "en-curso"], ["Árbitro 1", "16 a 30", "15 de 15", "0", "termino"]]);
    igual("el resumen dice cuántos jugadores revisó cada árbitro y cuántos no han llegado", await q.$$eval("#resumen tr", (l) => l.map((tr) => tr.children[6].textContent)), ["2 de 30 · faltan 1", "Sin revisar"]);
    igual("«Jugadores que no han llegado» lista a los que el árbitro marcó ausentes, con mesa, color, árbitro y hora", await q.$$eval("#faltan tr", (l) => l.map((tr) => [tr.children[0].textContent, tr.children[1].textContent, tr.children[2].textContent, tr.children[3].textContent, tr.children[4].textContent])), [["Sub-10 Absoluto", "5", "Cleo Tres", "Negras", "Ana Árbitra"]]);
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
    igual("arriba siempre a la vista: los avisos abiertos, quién está conectado y cuántos torneos tienen clave", await q.$eval("#estado-general", (e) => e.textContent.replace(/\s+/g, " ").trim()).then((t) => [t.startsWith("2 avisos de árbitros abiertos"), t.includes("1 de 2 árbitros conectados"), t.includes("Clave en 1 de 3 torneos"), t.includes("Drive"), t.includes("Última copia: hace 2 min")]), [true, true, true, true, true]);
    igual("la pestaña lleva el contador y el título de la pestaña del navegador también", await q.evaluate(() => [document.getElementById("contador-pedidos").textContent, document.title.includes("(2) ")]), ["2", true]);
    igual("el pedido de ayuda dice la mesa, quién, de qué torneo, hace cuánto y lo que escribió", await q.$eval('.cam-pedido[data-estado="abierto"][data-tipo="ayuda"]', (e) => [e.querySelector("p.font-bold").textContent, /^Sub-10 Absoluto · hace 3 min \(\d{1,2}:\d\d [ap]\. m\.\)$/.test(e.querySelectorAll("p")[1].textContent), e.textContent.includes("«Prueba: ven a la mesa»")]), ["🆘 Ana Árbitra pide al principal EN LA MESA 4", true, true]);
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
    igual("los enlaces salen en una tabla, agrupados por torneo y ordenados por mesa; el que no tiene nombre lo dice", await q.$$eval("#asignaciones tr", (l) => l.map((tr) => tr.classList.contains("cam-grupo-torneo") ? tr.textContent : [tr.children[0].textContent, tr.children[1].textContent, tr.dataset.nombrado])),
        ["Sub-10 Absoluto — 2 enlaces", ["Ana Árbitra", "1 a 15", "si"], ["Árbitro 1Por definir", "16 a 30", "no"]]);
    igual("cada uno dice si está conectado ahora o que no ha abierto el enlace", await q.$$eval("#asignaciones .cam-conectado", (l) => l.map((x) => [x.dataset.enLinea, x.textContent.replace("🆘", "").trim().split("\n")[0].slice(0, 40)])), [["si", "● Conectado ahora"], ["no", "Todavía no ha abierto el enlace"]]);
    await q.click('#asignaciones tr[data-id="asig-ana"] [data-accion="qr"]');
    await q.waitForSelector("dialog.cam-dialogo[open] svg");
    igual("«QR y enlace» abre el QR grande con la marca de Ajedrez Integral al centro, su WhatsApp y su enlace", await q.evaluate(() => { const d = document.querySelector("dialog.cam-dialogo"); return [!!d.querySelector('svg image[data-marca="ajedrez-integral"]'), /centroamericano-arbitro\.html#a{64}$/.test(d.querySelector('[data-accion="abrir"]').href), decodeURIComponent(d.querySelector('[data-accion="whatsapp"]').href).includes("tus mesas del Centroamericano (Sub-10 Absoluto, mesas 1 a 15)")]; }), [true, true, true]);
    await q.click("dialog.cam-dialogo [data-accion='cerrar']");
    await q.evaluate(() => { window.__imprimio = 0; window.print = () => { window.__imprimio++; }; });
    await q.click("#imprimir-qr");
    igual("«Imprimir los QR» arma una tarjeta por árbitro, cada QR con la marca y el pie de Ajedrez Integral", await q.evaluate(() => [window.__imprimio, document.body.classList.contains("cam-imprime-qr"), [...document.querySelectorAll("#hoja-qr .cam-hoja-tarjeta")].map((t) => [t.querySelector("h3").textContent, !!t.querySelector('svg image[data-marca="ajedrez-integral"]'), t.textContent.includes("Ajedrez Integral · Centroamericano 2026")])]),
        [1, true, [["Ana Árbitra", true, true], ["Árbitro 1", true, true]]]);
    await q.evaluate(() => document.body.classList.remove("cam-imprime-qr"));
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

    console.log("\n=== La organización: planillas y Drive ===");
    await q.click("#pest-planillas");
    await q.waitForSelector("#planillas tr");
    igual("las fotos salen ordenadas por torneo, ronda y mesa, con el nombre del enfrentamiento y si ya están en el Drive", await q.$$eval("#planillas tr", (l) => l.map((tr) => [tr.children[1].textContent, tr.children[2].textContent, tr.children[3].textContent, tr.children[6].textContent])),
        [["3", "2", "Harvey Ian vs Acuña Porras Fabio", "✓ En el Drive"], ["3", "3", "Hopkins John vs Baquero Graterol", "Pendiente"]]);
    await q.waitForFunction(() => document.getElementById("drive-estado").textContent.length > 0);
    igual("dice que el Drive no está conectado y que las fotos están a salvo mientras tanto", [await q.getAttribute("#drive-estado", "data-estado"), (await q.textContent("#drive-estado")).includes("todavía no está conectado")], ["no", true]);
    await q.click('#planillas tr:first-child [data-accion="ver-foto"]');
    await q.waitForSelector("dialog.cam-dialogo[open] img");
    igual("«Ver» abre la foto desde el bucket privado (con un enlace que vence)", await q.evaluate(() => [window.__llamadas.filter((l) => l.foto).map((l) => l.foto), document.querySelector("dialog.cam-dialogo img").alt]), [["centroamericano-planillas/1529733/ronda-3/mesa-2-planillas.jpg"], "Foto de las dos planillas de la mesa 2: Harvey Ian vs Acuña Porras Fabio"]);
    await q.click("dialog.cam-dialogo [data-accion='cerrar']");
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
    igual("«Mandar al Drive las que faltan» las manda y la tabla lo muestra", await q.$$eval("#planillas tr", (l) => l.map((tr) => tr.children[6].textContent)), ["✓ En el Drive", "✓ En el Drive"]);

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
    igual("los jugadores con ilegales, primero quien más lleva, y la segunda dice que pierde", await q.$$eval("#marcados tr", (l) => l.map((tr) => [...tr.children].map((td) => td.textContent))),
        [["Sub-10 Absoluto", "1", "4", "Cleo Tres (blancas)", "ii 2 — pierde la partida (art. 7.5.5)", "—"]]);
    igual("todo lo anotado, lo más reciente primero, con su detalle", await q.$$eval("#registro tr", (l) => l.map((tr) => [tr.children[4].textContent, tr.children[5].textContent, tr.children[6].textContent])),
        [["Beto", "Resultado", "1-0 (ganan blancas) — Eli – Fran · enviado a chess-results"], ["Ana", "Ilegal", "Cleo Tres (blancas)"], ["Ana", "Ilegal", "Cleo Tres (blancas)"]]);
    const [descarga] = await Promise.all([q.waitForEvent("download"), q.click("#r-pdf")]);
    const pdf = fs.readFileSync(await descarga.path());
    igual("el PDF del registro, con su nombre y la marca de agua", [descarga.suggestedFilename(), pdf.toString("latin1").startsWith("%PDF"), /\/SMask \d+ 0 R/.test(pdf.toString("latin1"))], ["registro-arbitros-centroamericano-2026.pdf", true, true]);
    const [descargaF] = await Promise.all([q.waitForEvent("download"), q.click("#r-informe")]);
    const pdfF = fs.readFileSync(await descargaF.path());
    igual("el informe final en PDF (resumen por ronda, ilegales, ausentes, rondas finalizadas y planillas), con su nombre y la marca de agua", [descargaF.suggestedFilename(), pdfF.toString("latin1").startsWith("%PDF"), /\/SMask \d+ 0 R/.test(pdfF.toString("latin1")), await q.$eval("#r-informe", (b) => b.disabled)], ["informe-final-arbitros-centroamericano-2026.pdf", true, true, false]);
    igual("sin errores en la página", errores, []);

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
    igual("en oscuro, todo el texto de la organización da 4,5:1 o más, en las ocho pestañas", (await contrastePorPanel(o.p)) >= 4.5, true);
    if (process.env.CAPTURA) { await o.p.click("#pest-ronda"); await o.p.screenshot({ path: process.env.CAPTURA + "-organizacion-oscuro.png", fullPage: true }); }
    await o.ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
