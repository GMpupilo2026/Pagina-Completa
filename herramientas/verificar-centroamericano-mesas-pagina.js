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
    { tnr: "1529733", nombre: "Sub-10 Absoluto", categoria: "Sub-10", rama: "Absoluto", orden: 3, sid_en_boveda: true, clave_puesta: "2026-11-01T10:00:00Z", acceso_tnr: "1529733" },
    // Un torneo de PRUEBA: no debe salir mezclado con los reales (solo con «Modo ensayo»).
    { tnr: "1532448", nombre: "PRUEBA grupo A", categoria: "Sub-8", rama: "Absoluto", orden: 901, sid_en_boveda: true, clave_puesta: "2026-11-01T10:00:00Z", acceso_tnr: "1532448", prueba: true }];
  // Ana abrió su enlace hace medio minuto; «Árbitro 1» (por definir) todavía no, pero ya terminó sus 15 mesas.
  const ASIG = [
    { id: "asig-ana", token: "a".repeat(64), tnr: "1529733", arbitro: "Ana Árbitra", nombrado: true, mesa_desde: 1, mesa_hasta: 15, vence: "2026-11-10T05:59:59Z", revocada: false, creada: "2026-11-02T10:00:00Z", ultimo_uso: hace(30) },
    { id: "asig-arb1", token: "b".repeat(64), tnr: "1529733", arbitro: "Árbitro 1", nombrado: false, mesa_desde: 16, mesa_hasta: 30, vence: "2026-11-10T05:59:59Z", revocada: false, creada: "2026-11-02T10:01:00Z", ultimo_uso: null },
    { id: "asig-ensayo", token: "e".repeat(64), tnr: "1532448", arbitro: "Árbitro de ensayo 1", nombrado: false, mesa_desde: 1, mesa_hasta: 15, vence: "2026-11-10T05:59:59Z", revocada: false, creada: "2026-11-02T10:02:00Z", ultimo_uso: null }];
  // El avance guarda TODAS las rondas: la vieja va primero, como la devolvía la base el 3/11 (y «Cuándo inició» decía «Ronda 2»).
  const PROGRESO = [
    { asignacion_id: "asig-arb1", ronda: 2, total: 15, con_resultado: 15, pendientes: [], actualizado: hace(400) },
    { asignacion_id: "asig-ana", ronda: 3, total: 15, con_resultado: 7, pendientes: [8, 9, 10, 11, 12, 13, 14, 15], actualizado: hace(20) },
    { asignacion_id: "asig-arb1", ronda: 3, total: 15, con_resultado: 15, pendientes: [], actualizado: hace(20) },
    { asignacion_id: "asig-ensayo", ronda: 1, total: 15, con_resultado: 0, pendientes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], actualizado: hace(20) }];
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
    { id: "pr2", asignacion_id: "asig-ana", arbitro: "Ana Árbitra", tnr: "1529733", ronda: 3, mesa: 5, color: "blancas", jugador: "Dani Cuatro", presente: true, marcada: hace(600) },
    { id: "pr3", asignacion_id: "asig-ensayo", arbitro: "Árbitro de ensayo 1", tnr: "1532448", ronda: 1, mesa: 2, color: "blancas", jugador: "Jugador de Prueba", presente: false, marcada: hace(300) }];
  const INICIOS = [];
  const SALIDAS = [];
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
  // Un árbitro toca «Ya terminé mis labores» en su tablet (lo que la organización ve en su lista).
  window.__concluir = (id) => { const x = ASIG.find((y) => y.id === id); if (x) x.concluyo_en = new Date(Date.now() - 600000).toISOString(); };
  // Un árbitro toca «Inició la ronda» en su tablet (la función guarda la fila de su categoría y ronda); con minutos = null la quita.
  window.__marcarInicio = (tnr, ronda, minutos, arbitro) => { const k = INICIOS.findIndex((x) => x.tnr === tnr && x.ronda === ronda); if (k >= 0) INICIOS.splice(k, 1);
    if (minutos != null) INICIOS.push({ tnr, ronda, inicio: new Date(Date.now() - minutos * 60000).toISOString(), asignacion_id: null, arbitro: arbitro || "", puesto_en: new Date().toISOString() }); };
  window.__leerAviso = () => { const a = AVISOS.find((x) => x.de === "organizacion" && x.asignacion_id === "asig-ana"); if (a) a.leido_en = new Date().toISOString(); };
  const TABLAS = { centroamericano_torneos: TORNEOS, centroamericano_asignaciones: ASIG, centroamericano_registro: REGISTRO, centroamericano_avisos: AVISOS, centroamericano_progreso: PROGRESO, centroamericano_finales: FINALES, centroamericano_listas: LISTAS, centroamericano_planillas: PLANILLAS, centroamericano_copias: COPIAS, centroamericano_presencia: PRESENCIA, centroamericano_tiempos: TIEMPOS, centroamericano_inicios_torneo: INICIOS, centroamericano_fair_play: [], centroamericano_salidas: SALIDAS };
  // Un árbitro con el modo concentración se sale de la pantalla (lo que la función anota en centroamericano_salidas); con minutos = null sigue fuera.
  window.__salida = (asig, hace_min, dura_seg, motivo) => SALIDAS.push({ id: "sa" + (++n), asignacion_id: asig, tnr: "1529733", arbitro: "x", salio: new Date(Date.now() - hace_min * 60000).toISOString(), volvio: dura_seg == null ? null : new Date(Date.now() - hace_min * 60000 + dura_seg * 1000).toISOString(), segundos: dura_seg, motivo: motivo || "oculta", registrada: new Date().toISOString() });
  const filtrar = (tabla, f, fin) => TABLAS[tabla].filter((r) => Object.entries(f).every(([c, v]) => r[c] === v) && Object.entries(fin || {}).every(([c, vs]) => vs.includes(r[c])));
  window.sb = {
    auth: { getSession: () => R({ session: { user: { id: "yo" }, access_token: "x" } }), getUser: () => R({ user: { id: "yo" } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => R({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => R({ all: [], totp: [] }) } },
    rpc: (f, a) => { window.__llamadas.push({ rpc: f, a: a && a.p_herramienta, copia: a && a.p_copia });
      if (f === "tengo_herramienta") return R(${licencia ? "a.p_herramienta === 'mesa-arbitro'" : "false"});
      if (f === "centroamericano_copia_manual") return R(COPIA(0));
      if (f === "centroamericano_actividad") { window.__actividadPedida = [a.p_tnr, a.p_limite]; return R([
        { cuando: hace(60), tnr: "1529733", torneo: "Sub-10 Absoluto", arbitro: "Beto", ronda: 1, mesa: null, tipo: "finalizo", detalle: "Finalizó la ronda 1" },
        { cuando: hace(120), tnr: "1529733", torneo: "Sub-10 Absoluto", arbitro: "Ana", ronda: 1, mesa: 7, tipo: "ayuda", detalle: "Pidió ayuda: Necesito al principal" },
        { cuando: hace(150), tnr: "1529733", torneo: "Sub-10 Absoluto", arbitro: "Ana", ronda: 1, mesa: 6, tipo: "levanto", detalle: "Eli Uno (negras) se levantó de la mesa" },
        { cuando: hace(180), tnr: "1529733", torneo: "Sub-10 Absoluto", arbitro: "Ana", ronda: 1, mesa: 4, tipo: "ilegal", detalle: "Cleo Tres (blancas): Enroque ilegal" },
        { cuando: hace(240), tnr: "1529733", torneo: "Sub-10 Absoluto", arbitro: "Ana", ronda: 1, mesa: 3, tipo: "planilla", detalle: "Foto de las planillas (ya está en el Drive)" },
        { cuando: hace(300), tnr: "1529733", torneo: "Sub-10 Absoluto", arbitro: "Ana", ronda: 1, mesa: 5, tipo: "presencia", detalle: "Dani Cuatro (negras): no ha llegado" },
        { cuando: hace(360), tnr: "1529733", torneo: "Sub-10 Absoluto", arbitro: "Ana", ronda: 1, mesa: 3, tipo: "resultado", detalle: "Eli – Fran → 1-0" },
        { cuando: hace(420), tnr: "1529733", torneo: "Sub-10 Absoluto", arbitro: "Beto", ronda: 1, mesa: null, tipo: "lista", detalle: "Aprobó el paso «relojes» de la revisión previa" },
        { cuando: hace(500), tnr: "1529733", torneo: "Sub-10 Absoluto", arbitro: "Beto", ronda: 1, mesa: null, tipo: "inicio", detalle: "Inició la ronda 1 en su categoría: desde ahí corre el tiempo de espera" },
        { cuando: hace(100), tnr: "1532448", torneo: "PRUEBA grupo A", arbitro: "Árbitro de ensayo 1", ronda: 1, mesa: 2, tipo: "presencia", detalle: "Jugador de Prueba (blancas): no ha llegado" }]); }
      if (f === "centroamericano_reabrir_labores") { window.__reabrirArgs = (window.__reabrirArgs || []).concat([a.p_id]);
        const x = ASIG.find((y) => y.id === a.p_id); if (!x) return R(null, { message: "Ese enlace ya no existe" });
        ASIG.filter((y) => y.id === x.id || (x.persona && y.persona === x.persona)).forEach((y) => { y.concluyo_en = null; });
        return R({ arbitro: x.arbitro, reabiertos: 1 }); }
      if (f === "centroamericano_quitar_enlace") { const x = ASIG.find((y) => y.id === a.p_id); if (!x) return R(null, { message: "Ese enlace ya no existe" });
        const hay = REGISTRO.filter((r) => r.asignacion_id === x.id).length;
        if (a.p_borrar) ASIG.splice(ASIG.indexOf(x), 1);
        return R({ arbitro: x.arbitro, tnr: x.tnr, borrado: !!a.p_borrar, anotaciones: hay, tiempos: 0, presencia: 0, planillas: 0 }); }
      if (f === "centroamericano_hojas") return R([
        { asignacion: "asig-ana", arbitro: "Ana Árbitra", tnr: "1529737", torneo: "Sub-10 Absoluto", categoria: "Sub-10", rama: "Absoluto", mesa_desde: 1, mesa_hasta: 2, ronda: 3, leida: "2026-11-03T15:00:00Z", mesas: [{ mesa: 1, blancas: "Eli", negras: "Fran", valor: "1" }, { mesa: 2, blancas: "Gus", negras: "Hana", valor: "0" }] },
        { asignacion: "asig-b", arbitro: "Beto Árbitro", tnr: "1529737", torneo: "Sub-10 Absoluto", categoria: "Sub-10", rama: "Absoluto", mesa_desde: 3, mesa_hasta: 3, ronda: 3, leida: "2026-11-03T15:00:00Z", mesas: [{ mesa: 3, blancas: "Ivo", negras: "Jana", valor: "0" }] }]);
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
      if (b.action === "resumen") { { const pa = PROGRESO.find((x) => x.asignacion_id === "asig-ana" && x.ronda === 3); pa.con_resultado = 9; pa.pendientes = [10, 11, 12, 13, 14, 15]; } return Promise.resolve({ data: { ok: true, torneos: 1, errores: [] }, error: null }); }
      if (b.action === "drive_estado") return Promise.resolve({ data: { ok: true, conectado: window.__driveOk, pendientes: PLANILLAS.filter((x) => !x.drive_ok).length, ultima_copia: window.__driveOk ? hace(300) : null }, error: null });
      if (b.action === "drive_conectar") {
        if (b.secreto === "MALOMALOMALOMALOMALOMALOMALOMALOMALO") return Promise.resolve(err(400, "No se pudo conectar: secreto. No se guardó nada."));
        window.__driveOk = true; return Promise.resolve({ data: { ok: true, carpeta: "Planillas Centroamericano" }, error: null }); }
      if (b.action === "drive_reintentar") { PLANILLAS.forEach((x) => { x.drive_ok = true; }); return Promise.resolve({ data: { ok: true, enviadas: 1, fallaron: 0, quedan: 0 }, error: null }); }
      return Promise.resolve(err(400, "Acción desconocida.")); } },
    from: (tabla) => { const f = {}; const fin = {}; let accion = "select", valores = null;
      let orden = null;
      const q = { select: () => q, order: (c, o) => { orden = [c, !(o && o.ascending === false)]; return q; }, range: () => q, eq: (c, v) => { f[c] = v; return q; }, in: (c, vs) => { fin[c] = vs; return q; },
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
          else if (accion === "update") { filtrar(tabla, f, fin).forEach((x) => Object.assign(x, valores)); window.__llamadas.push({ update: tabla, valores, f, en: fin }); r = { data: null, error: null }; }
          else { const datos = filtrar(tabla, f, fin).map((x) => Object.assign({}, x)); if (orden && ["ocurrio", "creada", "creado", "subida"].includes(orden[0])) datos.sort((a, b) => (a[orden[0]] < b[orden[0]] ? -1 : 1) * (orden[1] ? 1 : -1)); r = { data: datos, error: null }; }
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
    const medidas = () => p.$$eval(".cam-mesa", (l) => l.map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    const base = await medidas();
    igual("todas las tarjetas de las mesas miden lo mismo (ancho y alto), sea cual sea su estado", [new Set(base.map((x) => x[0])).size, new Set(base.map((x) => x[1])).size, base.length], [1, 1, 3]);
    igual("los renglones de cada jugador son fijos: el nombre ocupa siempre el mismo alto (hasta 2 líneas) y los botones van en su propio renglón", await p.evaluate(() => { const js = [...document.querySelectorAll(".cam-mesa .cam-jugador")]; return [new Set(js.map((j) => Math.round(j.getBoundingClientRect().height))).size, new Set(js.map((j) => Math.round(j.querySelector(".cam-nombre").getBoundingClientRect().height))).size, js.every((j) => j.querySelector(".cam-jugador-botones").getBoundingClientRect().top >= j.querySelector(".cam-nombre").getBoundingClientRect().bottom)]; }), [1, 1, true]);
    await p.click(acc(2, "blancas", "ilegal"));
    await p.waitForSelector("dialog[open] select");
    igual("al tocar «Ilegal» sale la lista de tipos (con «Otra») y dice que es la primera: dos minutos al rival", await p.evaluate(() => { const d = document.querySelector("dialog[open]"); return [[...d.querySelectorAll("option")].map((o) => o.textContent).slice(0, 2), d.querySelectorAll("option").length, d.textContent.includes("2 minutos más a su rival")]; }), [["Movió una pieza como esa pieza no puede moverse", "Dejó o puso su propio rey en jaque"], 8, true]);
    await p.selectOption("dialog[open] select", "enroque");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForSelector("dialog[open] [data-avisos-aceptar]");
    igual("anotada la primera, un cuadro que no se pasa por alto recuerda los 2 minutos", await p.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("Primera ilegal: dale 2 minutos al rival"), t.includes("2 minutos")]; }), [true, true]);
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForSelector('.cam-mesa[data-mesa="2"] .cam-aviso-suave');
    igual("al anotar la primera ilegal (aparecen la marca, «Anular» y el aviso) NINGUNA tarjeta cambia de tamaño ni de forma", await medidas(), base);
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
    igual("«Irregularidad» ofrece una lista para elegir, con «Otra»", await p.$eval("dialog[open] select", (s) => { const l = [...s.options]; return [l.length, l[0].textContent, l[l.length - 1].textContent]; }), [10, "Tocó una pieza y no la movió (pieza tocada)", "Otra (escribir qué pasó)"]);
    igual("y pregunta la sanción de tiempo (art. 12.9), que sale «Sin sanción» si no se toca", await p.$$eval("dialog[open] select", (l) => l.length === 2 ? [l[1].value, l[1].options.length, l[1].options[0].textContent] : null), ["", 5, "Sin sanción de tiempo"]);
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
    igual("«Llegó» se anota con la mesa y el color y se ve al instante; ese jugador queda «✓ Llegó» SIN su botón (con un «Corregir»), y los demás conservan el suyo",
      await p.evaluate((q) => { const vis = (n) => !!n && n.checkVisibility(); const j = document.querySelector(q); return [window.__llamadas.filter((l) => l.body.action === "presencia").map((l) => [l.body.mesa, l.body.color, l.body.presente]), j.querySelector(".cam-presencia-estado").textContent, vis(j.querySelector('[data-accion="presente"]')), vis(j.querySelector('[data-accion="corregir-presencia"]')), document.querySelectorAll('.cam-jugador [data-accion="presente"]').length]; }, jug("blancas")),
      [[[2, "blancas", true]], "✓ Llegó", false, true, 5]);
    await p.click(jug("blancas") + ' [data-accion="corregir-presencia"]');
    await p.waitForSelector(acc(2, "blancas", "presente"));
    igual("«Corregir» lo vuelve a poner como que NO ha llegado (se lo dice a la función) y le devuelve su botón «Llegó»",
      await p.evaluate((q) => [window.__llamadas.filter((l) => l.body.action === "presencia").map((l) => l.body.presente), document.querySelector(q + " .cam-presencia-estado").textContent, document.getElementById("presencia-resumen").textContent], jug("blancas")),
      [[true, false], "✗ No ha llegado", "Han llegado 0 de 6 jugadores · faltan 6."]);
    await p.click(acc(2, "blancas", "presente"));
    await p.waitForFunction(() => document.getElementById("presencia-resumen").textContent === "Han llegado 1 de 6 jugadores · faltan 5.");
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
        await p.evaluate(() => { const g = document.getElementById("donde-juega-grande"); const r = g.getBoundingClientRect(); return [g.matches(":modal"), g.querySelector(".cam-dj-gcat").textContent, g.querySelector(".cam-dj-gmesa").textContent, parseFloat(getComputedStyle(g.querySelector(".cam-dj-gmesa")).fontSize) >= 100, g.querySelector(".cam-dj-ginfo").firstChild.textContent, g.querySelector(".cam-dj-ginfo small").textContent.replace(/ · 9:00.*/, ""), getComputedStyle(g).backgroundColor, r.width === innerWidth && r.height === innerHeight, document.activeElement.textContent]; }),
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
    // Se equivocó con la mesa 2 de las negras: «Corregir» la deja como que no ha llegado (y vuelve su cronómetro).
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
    igual("se ve como un programa: barra de título, menú con nueve pestañas (la última, Fair Play), contenido y barra de estado abajo", await q.evaluate(() => [!!document.querySelector(".cam-ventana .cam-titulo-ventana"), [...document.querySelectorAll(".cam-pestana")].map((b) => b.dataset.panel), !!document.querySelector(".cam-ventana .cam-contenido"), document.querySelector(".cam-ventana > .cam-barra-estado") !== null, document.querySelectorAll("table.cam-rejilla").length > 3]),
        [true, ["ronda", "avisos", "arbitros", "tiempos", "planillas", "claves", "respaldo", "registro", "fairplay"], true, true, true]);
    igual("abre en «Ronda en curso» porque ya hay una clave", await q.$$eval(".cam-pestana", (l) => l.map((b) => b.getAttribute("aria-selected"))), ["true", "false", "false", "false", "false", "false", "false", "false", "false"]);
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
    await q.context().route(/lichess\.org\/api\//, (r) => {
        const u = r.request().url(); pedidosLichess.push(u);
        if (/\/api\/broadcast\/AbCd1234$/.test(u)) return r.fulfill({ contentType: "application/json", body: JSON.stringify({ tour: { id: "AbCd1234", name: "Centroamericano 2026 | Sub-10 Abs" }, rounds: [{ id: "RoNdA002", name: "Round 2", finished: true }, { id: "RoNdA003", name: "Round 3", ongoing: true }] }) });
        if (/\/api\/broadcast\/-\/-\/RoNdA003$/.test(u)) return r.fulfill({ contentType: "application/json", body: JSON.stringify({ round: { id: "RoNdA003", name: "Round 3", delay: 60 }, games: [
            { id: "x1", fen: "8/8/8/8/8/8/8/K6k w - - 0 31", status: "*", thinkTime: 10, players: [{ name: "Otro, Juan", clock: 100000 }, { name: "Más, Pedro", clock: 100000 }] },
            { id: "x2", fen: "8/8/8/8/8/8/8/K6k w - - 0 36", status: "*", thinkTime: 10, players: [{ name: "Uno, Eli", clock: 30000 }, { name: "Dos, Fran", clock: 456700 }] }] }) });
        return r.fulfill({ status: 404, body: "{}" });
    });
    await q.evaluate(() => { const viejo = window.sb.from; window.sb.from = (t) => (t === "salas_torneo" ? { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { enlaces: [{ texto: "Partidas", url: "https://lichess.org/broadcast/centroamericano-2026/AbCd1234" }] }, error: null }) }) }) } : viejo(t)); });
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
