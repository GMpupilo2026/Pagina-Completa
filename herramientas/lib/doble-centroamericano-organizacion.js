/* El doble de Supabase de la página de la organización del Centroamericano (centroamericano-mesas.html). Lo usan
   verificar-centroamericano-mesas-pagina.js y capturas-centroamericano.js (las pantallas de los estados de WhatsApp):
   una sola copia. `dobleOrganizacion(licencia)` devuelve el texto del script que reemplaza a js/supabase-client.js
   dentro del navegador de prueba. */
"use strict";

// El programa de la organización: los 12 torneos (3 de muestra), sus enlaces, el avance, los avisos,
// las planillas, las copias y el registro.
function dobleOrganizacion(licencia) {
    return `(function(){
  window.__llamadas = [];
  window.__torneosFallan = /[?&]torneosfallan=1/.test(location.search);
  const R = (data, error) => Promise.resolve({ data, error: error || null });
  const hace = (seg) => new Date(Date.now() - seg * 1000).toISOString();
  // Las credenciales vencen dentro de una semana, contando desde HOY: con una fecha escrita fija («el 9 de
  // noviembre»), al pasar ese día la página (que pide solo las vigentes, vence > ahora) se quedaba sin árbitros y el
  // reparto fallaba sin que nada estuviera roto.
  const VENCE = new Date(Date.now() + 7 * 86400000).toISOString();
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const TORNEOS = [
    { tnr: "1529719", nombre: "Sub-8 Absoluto", categoria: "Sub-8", rama: "Absoluto", orden: 1, sid_en_boveda: false, clave_puesta: null, acceso_tnr: null },
    { tnr: "1529729", nombre: "Sub-8 Femenino", categoria: "Sub-8", rama: "Femenino", orden: 2, sid_en_boveda: false, clave_puesta: null, acceso_tnr: null },
    { tnr: "1529733", nombre: "Sub-10 Absoluto", categoria: "Sub-10", rama: "Absoluto", orden: 3, sid_en_boveda: true, clave_puesta: "2026-11-01T10:00:00Z", acceso_tnr: "1529733" },
    // Un torneo de PRUEBA: no debe salir mezclado con los reales (solo con «Modo ensayo»).
    { tnr: "1532448", nombre: "PRUEBA grupo A", categoria: "Sub-8", rama: "Absoluto", orden: 901, sid_en_boveda: true, clave_puesta: "2026-11-01T10:00:00Z", acceso_tnr: "1532448", prueba: true }];
  // Ana abrió su enlace hace medio minuto; «Árbitro 1» (por definir) todavía no, pero ya terminó sus 15 mesas.
  const ASIG = [
    { id: "asig-ana", codigo: "K7M29QXA", token: "a".repeat(64), tnr: "1529733", arbitro: "Ana Árbitra", nombrado: true, mesa_desde: 1, mesa_hasta: 15, vence: VENCE, revocada: false, creada: "2026-11-02T10:00:00Z", ultimo_uso: hace(30) },
    { id: "asig-arb1", codigo: "N3P5R7TW", token: "b".repeat(64), tnr: "1529733", arbitro: "Árbitro 1", nombrado: false, mesa_desde: 16, mesa_hasta: 30, vence: VENCE, revocada: false, creada: "2026-11-02T10:01:00Z", ultimo_uso: null },
    { id: "asig-ensayo", codigo: "H2J4K6MX", token: "e".repeat(64), tnr: "1532448", arbitro: "Árbitro de ensayo 1", nombrado: false, mesa_desde: 1, mesa_hasta: 15, vence: VENCE, revocada: false, creada: "2026-11-02T10:02:00Z", ultimo_uso: null }];
  // «?ritmos=1» en la dirección: suma un torneo Rápido y uno Blitz con su enlace cada uno (para ver la página separada por modo).
  if (/[?&]ritmos=1/.test(location.search)) {
    TORNEOS.push({ tnr: "1533951", nombre: "Rápido Sub-10", categoria: "Sub-10", rama: "Mixto", orden: 102, sid_en_boveda: true, clave_puesta: "2026-11-01T10:00:00Z", acceso_tnr: "1529733" },
      { tnr: "1540001", nombre: "Blitz Sub-12", categoria: "Sub-12", rama: "Mixto", orden: 201, sid_en_boveda: true, clave_puesta: "2026-11-01T10:00:00Z", acceso_tnr: "1529733" });
    ASIG.push({ id: "asig-rapido", codigo: "R8S9T2UV", token: "r".repeat(64), tnr: "1533951", arbitro: "Rita Rápida", nombrado: true, mesa_desde: 1, mesa_hasta: 10, vence: VENCE, revocada: false, creada: "2026-11-02T10:03:00Z", ultimo_uso: null },
      { id: "asig-blitz", codigo: "Z3Y4X5WP", token: "z".repeat(64), tnr: "1540001", arbitro: "Blas Blitz", nombrado: true, mesa_desde: 1, mesa_hasta: 12, vence: VENCE, revocada: false, creada: "2026-11-02T10:04:00Z", ultimo_uso: null });
  }
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
  // ronda: la que anotó la base al concluir (concluyo_ronda; sin ella, solo se reabre a mano).
  window.__concluir = (id, ronda) => { const x = ASIG.find((y) => y.id === id); if (x) { x.concluyo_en = new Date(Date.now() - 600000).toISOString(); x.concluyo_ronda = ronda == null ? null : ronda; } };
  // Un árbitro toca «Inició la ronda» en su tablet (la función guarda la fila de su categoría y ronda); con minutos = null la quita.
  window.__marcarInicio = (tnr, ronda, minutos, arbitro) => { const k = INICIOS.findIndex((x) => x.tnr === tnr && x.ronda === ronda); if (k >= 0) INICIOS.splice(k, 1);
    if (minutos != null) INICIOS.push({ tnr, ronda, inicio: new Date(Date.now() - minutos * 60000).toISOString(), asignacion_id: null, arbitro: arbitro || "", puesto_en: new Date().toISOString() }); };
  window.__leerAviso = () => { const a = AVISOS.find((x) => x.de === "organizacion" && x.asignacion_id === "asig-ana"); if (a) a.leido_en = new Date().toISOString(); };
  const TABLAS = { centroamericano_torneos: TORNEOS, centroamericano_asignaciones: ASIG, centroamericano_registro: REGISTRO, centroamericano_avisos: AVISOS, centroamericano_progreso: PROGRESO, centroamericano_finales: FINALES, centroamericano_listas: LISTAS, centroamericano_planillas: PLANILLAS, centroamericano_copias: COPIAS, centroamericano_presencia: PRESENCIA, centroamericano_tiempos: TIEMPOS, centroamericano_inicios_torneo: INICIOS, centroamericano_fair_play: [], centroamericano_salidas: SALIDAS, centroamericano_fp_enlaces: [], centroamericano_tx_enlaces: [],
    // La sala pública del torneo, con su plano (vacío hasta que se guarda uno: «Plano de la sala»).
    salas_torneo: [{ clave: "centroamericano-2026", plano: null, enlaces: [
      { url: "https://ajedrez-integral.com/centroamericano-2026.html", texto: "Toda la información del torneo" },
      { url: "https://s3.chess-results.com/tnr1529776.aspx?lan=2", texto: "Sub-18 Femenino" },
      { url: "https://s3.chess-results.com/tnr1529773.aspx?lan=2", texto: "Sub-18 Absoluto" },
      { url: "https://s3.chess-results.com/tnr1529771.aspx?lan=2", texto: "Sub-16 Femenino" }] }] };
  // Los inscritos que devuelve sala-jugadores (para «Armar el borrador»): 12, 39 y 18 jugadores; el Sub-18 Absoluto con su bye (sin tablero).
  const inscritos = (n) => Array.from({ length: n }, (_, i) => ({ no: i + 1, nombre: "Jugador " + (i + 1) }));
  const SALA_JUGADORES = { modalidad: "clasico", modalidades: ["clasico"], torneos: [
    { tnr: "1529773", texto: "Sub-18 Absoluto", jugadores: inscritos(39), pareo: { ronda: 7, mesas: Array.from({ length: 20 }, (_, i) => ({ mesa: i + 1, negras: i < 19 ? { no: 2 } : null })) } },
    { tnr: "1529776", texto: "Sub-18 Femenino", jugadores: inscritos(12), pareo: { ronda: 7, mesas: Array.from({ length: 6 }, (_, i) => ({ mesa: i + 1, negras: { no: 2 } })) } },
    { tnr: "1529771", texto: "Sub-16 Femenino", jugadores: inscritos(18), pareo: null }] };
  // Un árbitro con el modo concentración se sale de la pantalla (lo que la función anota en centroamericano_salidas); con minutos = null sigue fuera.
  window.__salida = (asig, hace_min, dura_seg, motivo) => SALIDAS.push({ id: "sa" + (++n), asignacion_id: asig, tnr: "1529733", arbitro: "x", salio: new Date(Date.now() - hace_min * 60000).toISOString(), volvio: dura_seg == null ? null : new Date(Date.now() - hace_min * 60000 + dura_seg * 1000).toISOString(), segundos: dura_seg, motivo: motivo || "oculta", registrada: new Date().toISOString() });
  const filtrar = (tabla, f, fin, fgt) => TABLAS[tabla].filter((r) => Object.entries(f).every(([c, v]) => r[c] === v) && Object.entries(fin || {}).every(([c, vs]) => vs.includes(r[c])) && Object.entries(fgt || {}).every(([c, v]) => r[c] > v));
  // Para que un verificador agregue árbitros o incidencias a la prueba (el reparto desde el plano).
  window.__asig = ASIG;
  window.__tasas = [];
  window.sb = {
    auth: { getSession: () => R({ session: { user: { id: "yo" }, access_token: "x" } }), getUser: () => R({ user: { id: "yo" } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => R({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => R({ all: [], totp: [] }) } },
    rpc: (f, a) => { window.__llamadas.push({ rpc: f, a: a && a.p_herramienta, copia: a && a.p_copia });
      if (f === "tengo_herramienta") return R(${licencia ? "a.p_herramienta === 'mesa-arbitro'" : "false"});
      // Un evento nuevo: la base agrega los torneos (con la licencia) y archiva un evento.
      if (f === "centroamericano_torneos_agregar") { (window.__agregados = window.__agregados || []).push(JSON.parse(JSON.stringify(a)));
        a.p_torneos.forEach((t, i) => TORNEOS.push(Object.assign({ orden: 200 + i, sid_en_boveda: false, clave_puesta: null, acceso_tnr: null, prueba: false, archivado: false, evento: a.p_evento }, t))); return R(a.p_torneos.length); }
      // Cambiar el nombre de un torneo: window.__renombrarFalla = «mensaje» hace que la base lo rechace (como sin licencia o con el ritmo cambiado).
      if (f === "centroamericano_torneo_renombrar") { (window.__renombrados = window.__renombrados || []).push(JSON.parse(JSON.stringify(a)));
        if (window.__renombrarFalla) return R(null, { message: window.__renombrarFalla });
        const t = TORNEOS.find((x) => x.tnr === a.p_tnr); if (!t) return R(null, { message: "No existe ese torneo" });
        t.nombre = a.p_nombre; if (a.p_categoria) t.categoria = a.p_categoria; return R(null); }
      if (f === "centroamericano_evento_archivar") { let n = 0; TORNEOS.forEach((t) => { if (t.evento === a.p_evento && !t.prueba) { t.archivado = a.p_archivar; n++; } }); return R(n); }
      // El plano de la sala: sin la licencia, la base lo rechaza como sala_plano_guardar().
      if (f === "sala_plano_guardar") { (window.__planos = window.__planos || []).push(JSON.parse(JSON.stringify(a.p_plano)));
        ${licencia ? "" : "return R(null, { message: 'Solo la organización del torneo puede cambiar el plano de la sala.' });"}
        TABLAS.salas_torneo[0].plano = JSON.parse(JSON.stringify(a.p_plano)); return R(new Date().toISOString()); }
      // El reparto de los árbitros desde el plano: las tasas por torneo y aplicar todo o nada.
      if (f === "centroamericano_reparto_tasas") return R(JSON.parse(JSON.stringify(window.__tasas)));
      if (f === "centroamericano_reparto_aplicar") { (window.__repartos = window.__repartos || []).push(JSON.parse(JSON.stringify(a.p_acciones)));
        ${licencia ? "" : "return R(null, { message: 'Hace falta la herramienta de la Mesa del árbitro para cambiar las mesas de los árbitros.' });"}
        const malo = a.p_acciones.find((x) => (x.tipo === "actualizar" || x.tipo === "apagar") && !ASIG.some((y) => y.id === x.id && !y.revocada));
        if (malo) return R(null, { message: "Uno de los enlaces ya no está vigente. Vuelve a pedir la sugerencia." });
        const c = { actualizados: 0, creados: 0, apagados: 0 };
        a.p_acciones.forEach((x) => {
          if (x.tipo === "actualizar") { Object.assign(ASIG.find((y) => y.id === x.id), { mesa_desde: x.desde, mesa_hasta: x.hasta }, x.persona ? { persona: x.persona } : {}); c.actualizados++; }
          if (x.tipo === "apagar") { Object.assign(ASIG.find((y) => y.id === x.id), { revocada: true, reemplazada_en: new Date().toISOString() }); c.apagados++; }
          if (x.tipo === "crear") { ASIG.push({ id: "a" + (++n), codigo: "T" + (5550000 + n), token: String(3000 + n).repeat(16), tnr: x.tnr, arbitro: x.arbitro, nombrado: x.nombrado, mesa_desde: x.desde, mesa_hasta: x.hasta, persona: x.persona, experiencia: x.experiencia, vence: x.vence || VENCE, revocada: false, creada: new Date().toISOString(), ultimo_uso: null }); c.creados++; }
        });
        return R(c); }
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
        ASIG.filter((y) => y.id === x.id || (x.persona && y.persona === x.persona)).forEach((y) => { y.concluyo_en = null; y.concluyo_ronda = null; });
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
      if (f === "sala-jugadores") return Promise.resolve({ data: JSON.parse(JSON.stringify(SALA_JUGADORES)), error: null });
      const err = (estado, error) => ({ data: null, error: { context: { status: estado, json: () => Promise.resolve({ error }) } } });
      if (b.action === "poner") {
        if (b.sid === "MALAMALAMALA1234") return Promise.resolve(err(401, "chess-results no aceptó el código o la clave. Revísalos en Swiss-Manager. No se guardó la clave."));
        const abre = b.tnr === "1529700" ? ["1529719", "1529729"] : b.tnr === "1600000" ? ["1600001", "1600002"] : [b.tnr];
        const NOMBRES = { "1600001": "Nacional Juvenil Sub-14", "1600002": "Rápido Abierto Femenino" };
        const mios = TORNEOS.filter((t) => abre.includes(t.tnr)); if (!mios.length) return Promise.resolve(err(404, "Esa clave abre " + abre.map((t) => t + " (" + (NOMBRES[t] || "otro") + ")").join(", ") + ", y ninguno es del Centroamericano. No se guardó la clave."));
        mios.forEach((t) => { t.sid_en_boveda = true; t.acceso_tnr = b.tnr; t.clave_puesta = "2026-11-02T16:00:00Z"; });
        return Promise.resolve({ data: { ok: true, acceso: b.tnr, torneos: mios.map((t) => ({ tnr: t.tnr, nombre: t.nombre })), ronda: 1, mesas: 21, otros: [] }, error: null }); }
      if (b.action === "probar") return Promise.resolve({ data: { ok: true, torneo: "Sub-10 Absoluto", ronda: 2, mesas: 30 }, error: null });
      if (f === "centroamericano-fair-play" && b.action === "planilla_guardar") return Promise.resolve({ data: { ok: true, jugadas: b.jugadas.length, dudosas: b.dudosas.length }, error: null });
      if (b.action === "resumen") { { const pa = PROGRESO.find((x) => x.asignacion_id === "asig-ana" && x.ronda === 3); pa.con_resultado = 9; pa.pendientes = [10, 11, 12, 13, 14, 15]; } return Promise.resolve({ data: { ok: true, torneos: 1, errores: [] }, error: null }); }
      if (b.action === "drive_estado") return Promise.resolve({ data: { ok: true, conectado: window.__driveOk, pendientes: PLANILLAS.filter((x) => !x.drive_ok).length, ultima_copia: window.__driveOk ? hace(300) : null }, error: null });
      if (b.action === "drive_conectar") {
        if (b.secreto === "MALOMALOMALOMALOMALOMALOMALOMALOMALO") return Promise.resolve(err(400, "No se pudo conectar: secreto. No se guardó nada."));
        window.__driveOk = true; return Promise.resolve({ data: { ok: true, carpeta: "Planillas Centroamericano" }, error: null }); }
      if (b.action === "drive_reintentar") { PLANILLAS.forEach((x) => { x.drive_ok = true; }); return Promise.resolve({ data: { ok: true, enviadas: 1, fallaron: 0, quedan: 0 }, error: null }); }
      return Promise.resolve(err(400, "Acción desconocida.")); } },
    from: (tabla) => { const f = {}; const fin = {}; const fgt = {}; let accion = "select", valores = null;
      let orden = null;
      const q = { select: () => q, order: (c, o) => { orden = [c, !(o && o.ascending === false)]; return q; }, range: () => q, eq: (c, v) => { f[c] = v; return q; }, gt: (c, v) => { fgt[c] = v; return q; }, in: (c, vs) => { fin[c] = vs; return q; },
        maybeSingle: () => { const x = filtrar(tabla, f)[0]; return Promise.resolve({ data: x ? Object.assign({}, x) : null, error: null }); },
        insert: (v) => { accion = "insert"; valores = v; return q; }, update: (v) => { accion = "update"; valores = v; return q; },
        then: (ok, ko) => { let r;
          if (accion === "select" && tabla === "centroamericano_torneos" && window.__torneosFallan) return Promise.resolve({ data: null, error: { message: "statement timeout" } }).then(ok, ko);
          if (accion === "insert") {
            const lista = Array.isArray(valores) ? valores : [valores];
            for (const v of lista) {
              const base = tabla === "centroamericano_avisos"
                ? { id: "av-" + (++n + 20), creado: new Date().toISOString(), estado: "abierto", mesa: null, leido_en: null, atendido_en: null, tipo: "ayuda", ronda: null }
                : { id: "a" + (++n), codigo: "T" + String(2222 + n).padStart(7, "5"), token: String(1000 + n).repeat(16), revocada: false, nombrado: true, creada: new Date().toISOString(), ultimo_uso: null };
              (tabla === "centroamericano_avisos" ? AVISOS : ASIG).push(Object.assign(base, v)); }
            window.__llamadas.push({ insert: tabla, valores }); r = { data: null, error: null }; }
          else if (accion === "update") { filtrar(tabla, f, fin, fgt).forEach((x) => Object.assign(x, valores)); window.__llamadas.push({ update: tabla, valores, f, en: fin }); r = { data: null, error: null }; }
          else { const datos = filtrar(tabla, f, fin, fgt).map((x) => Object.assign({}, x)); if (orden && ["ocurrio", "creada", "creado", "subida"].includes(orden[0])) datos.sort((a, b) => (a[orden[0]] < b[orden[0]] ? -1 : 1) * (orden[1] ? 1 : -1)); r = { data: datos, error: null }; }
          return Promise.resolve(r).then(ok, ko); } };
      return q; },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;
}

module.exports = { dobleOrganizacion };

/*! rev bfb5bbb0d2d82f9f */
