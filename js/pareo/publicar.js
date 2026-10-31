/* ===== Pareo Integral — publicar un torneo en «Torneos en Pareo Integral» =====
 *
 * Quien organiza un torneo lo publica, sin cuenta, para que cualquiera lo
 * siga en torneos-pareo.html: todas las rondas, cada jugador con sus rivales
 * y la tabla de posiciones. La escritura va por la Edge Function
 * `pareo-publicar` (supabase/functions/pareo-publicar/), que guarda solo el
 * sha256 de la clave secreta que le devuelve a quien publica: esa clave queda
 * en el torneo (`t.publicado = { id, clave, hora }`) y es lo único que deja
 * ponerlo al día o quitarlo. Ver «Torneos en Pareo Integral: el espacio
 * público» en docs/decisiones/juegos-y-torneos.md.
 *
 * Como js/pareo/elo-nacional.js, no carga el cliente de Supabase: un fetch
 * liviano con la misma URL y la clave anónima (pública por diseño).
 *
 * `datosPublicos(t)` elige campo por campo lo que viaja: nombres, centros,
 * Elo, título, federación, categoría, rondas, resultados y partidas (PGN),
 * el anuncio, si recibe inscripciones y el resumen de cada jugador (su
 * puesto, sus puntos y su rendimiento, que usan el ranking y la ficha del
 * colegio). Nunca la fecha de nacimiento, el sexo, las firmas ni las notas
 * del árbitro. El ID FIDE viaja solo a la función, que NO lo guarda: guarda
 * una huella (`ident`) para reconocer al mismo jugador en otros torneos (ver
 * «Torneos en Pareo Integral: el mismo jugador en todos sus torneos»). La
 * función vuelve a limpiar lo que llega (no se le cree al navegador).
 */
(function (raiz) {
  "use strict";
  const URL_FUNCION = "https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/pareo-publicar";
  const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJndGlqcGltcGNva3hhdHh4YmtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5ODczMjksImV4cCI6MjEwNDU2MzMyOX0.h-AcAEQNaYMVo5UVtdWqUCTYgiSLFKDgXsn3lnbAhmQ";

  const persona = (j) => {
    const x = { id: j.id, nombre: j.nombre, institucion: j.institucion || "", elo: Number(j.elo) || 0, titulo: j.titulo || "", fed: j.fed || "", categoria: j.categoria || "",
      retiradoDespuesDe: j.retiradoDespuesDe == null ? null : j.retiradoDespuesDe };
    // Solo para la huella: la función lo cambia por `ident` y no lo guarda.
    if (/^[0-9]{1,12}$/.test(String(j.fideId || "").trim())) x.fideId = String(j.fideId).trim();
    if (Array.isArray(j.integrantes)) x.integrantes = j.integrantes.map(persona);
    return x;
  };
  const mesa = (m) => {
    const x = { b: m.b, n: m.n == null ? null : m.n, r: m.r || null };
    // En equipos, cada tablero con su resultado y su partida, si la hay (sin la marca interna de la cámara).
    if (Array.isArray(m.partidas)) x.partidas = m.partidas.map((p) => Object.assign({ r: (p && p.r) || null }, p && p.pgn ? { pgn: String(p.pgn) } : {}));
    if (m.alineacion) x.alineacion = { b: (m.alineacion.b || []).slice(), n: (m.alineacion.n || []).slice() };
    if (m.pgn) x.pgn = String(m.pgn);
    // La eliminación directa: el lugar en el cuadro y, si fue tablas, quién pasó y cómo.
    if (m.ko) { x.ko = true; x.slot = m.slot; if (m.pasa) { x.pasa = m.pasa; x.desempate = String(m.desempate || ""); } }
    return x;
  };

  // El ritmo (clásico, rápido, relámpago) leído del control de tiempo, con la
  // única copia de esa cuenta: la lista pública filtra por él en la base.
  const Ritmo = raiz.RitmoControl || (typeof require === "function" ? require("../ritmo-control.js") : null);
  const ritmoTipo = (t) => (Ritmo && Ritmo.deducir(t.ritmo || "", t.nombre || "")) || "";

  // El resumen de cada jugador tras las rondas completas: el puesto con los
  // desempates del torneo, los puntos, las partidas jugadas (ganadas, tablas,
  // perdidas) y, con Elo, el rendimiento y el ± Elo de FIDE. Lo calcula quien
  // publica con los mismos módulos que la clasificación; el ranking y la
  // ficha del colegio lo suman en la base. Solo torneos individuales.
  const modulo = (nombre, archivo) => raiz[nombre] || (typeof require === "function" ? require(archivo) : null);
  const PROVINCIAS = ["San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón"];
  function resumenJugadores(t) {
    const T = modulo("PareoTorneo", "./torneo.js"), E = modulo("PareoEquipos", "./equipos.js"), V = modulo("PareoEvento", "./evento.js"), Elo = modulo("PareoElo", "./elo.js");
    if (!T || !E || !V || t.tipo === "equipos") return [];
    const k = V.rondasCompletas(t);
    if (!k) return [];
    const filas = V.aplicarDesempate(t, E.clasificacion(Object.assign({}, t, { rondas: t.rondas.slice(0, k) }), t.desempates));
    const elo = Elo ? Elo.calcular(t, k) : new Map();
    return filas.map((f) => {
      let g = 0, e = 0, p = 0;
      for (let r = 0; r < k; r++) {
        const s = T.situacion(t, r, f.id);
        if (s.tipo !== "partida") continue;
        if (s.codigo === "1") g++; else if (s.codigo === "=") e++; else if (s.codigo === "0") p++;
      }
      const x = elo.get(f.id) || {};
      return { id: f.id, puesto: f.puesto, puntos: f.puntos, rondas: k, g, e, p,
        pe: x.partidas || 0, rp: x.rp == null ? null : x.rp, cambio: x.cambio == null ? null : x.cambio };
    });
  }

  // `extra.codigoEvento`: el código del enlace en vivo del evento (vive en el
  // navegador, no en el torneo).
  function datosPublicos(t, extra) {
    const e = extra || {};
    return {
      nombre: t.nombre || "", grupo: t.grupo || "", ciudad: t.ciudad || "", provincia: PROVINCIAS.includes(t.provincia) ? t.provincia : "", federacion: t.federacion || "",
      fechaInicio: t.fechaInicio || "", fechaFin: t.fechaFin || "", arbitro: t.arbitro || "", arbitroAdjunto: t.arbitroAdjunto || "", ritmo: t.ritmo || "", ritmoTipo: ritmoTipo(t), validoElo: t.validoElo || "",
      sistema: t.sistema, dobleVuelta: !!t.dobleVuelta, rondasTotales: t.sistema === "scheveningen" || t.sistema === "eliminacion" ? modulo("PareoTorneo", "./torneo.js").rondasDelTorneo(t) : t.rondasTotales, tipo: t.tipo, tableros: t.tableros,
      puntos: t.puntos, desempates: (t.desempates || []).slice(), mesaInicial: t.mesaInicial,
      evento: t.evento ? { nombre: t.evento.nombre || "" } : null,
      jugadores: (t.jugadores || []).map(persona),
      numeracion: t.numeracion ? t.numeracion.slice() : null,
      rondas: (t.rondas || []).map((R) => ({ mesas: R.mesas.map(mesa), ausencias: Object.assign({}, R.ausencias || {}), inicio: R.inicio, fin: R.fin, emparejada: R.emparejada })),
      desempateCorte: t.desempateCorte ? { formato: t.desempateCorte.formato || "", orden: (t.desempateCorte.orden || []).slice() } : undefined,
      // El anuncio (un torneo que todavía no empieza) y la inscripción previa.
      anuncio: t.anuncio ? { hora: t.anuncio.hora || "", contacto: t.anuncio.contacto || "", texto: t.anuncio.texto || "" } : undefined,
      inscripcion: t.inscripcion ? { abierta: !!t.inscripcion.abierta, hasta: t.inscripcion.hasta || "" } : undefined,
      // Los códigos de los enlaces en vivo: un enlace que ya nadie transmite
      // lleva desde ellos al torneo publicado (js/pareo/ver.js).
      vivo: t.liveCodigo || undefined, codigoEvento: e.codigoEvento || undefined,
      resumen: resumenJugadores(t),
    };
  }

  /* Nunca lanza: un problema de red o de la función vuelve como
     { ok: false, error } (error null si no hubo respuesta). */
  async function llamar(cuerpo) {
    let res;
    try {
      res = await fetch(URL_FUNCION, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + ANON, apikey: ANON },
        body: JSON.stringify(cuerpo),
      });
    } catch (e) {
      return { ok: false, error: null };
    }
    let datos;
    try { datos = await res.json(); } catch (e) { return { ok: false, error: null }; }
    return datos && typeof datos === "object" ? datos : { ok: false, error: null };
  }

  // `extra.organizador`: { id, clave } de la organización de este navegador
  // (guardarOrganizador): el torneo queda a su nombre.
  const conOrganizador = (cuerpo, extra) => (extra && extra.organizador && extra.organizador.id
    ? Object.assign(cuerpo, { organizador: { id: extra.organizador.id, clave: extra.organizador.clave } }) : cuerpo);
  const crear = (t, extra) => llamar(conOrganizador({ accion: "crear", torneo: datosPublicos(t, extra) }, extra));
  const actualizar = (t, extra) => llamar(conOrganizador({ accion: "actualizar", id: t.publicado.id, clave: t.publicado.clave, torneo: datosPublicos(t, extra) }, extra));
  // La organización: { nombre, logo } nueva, o con { id, clave } para
  // cambiarla. `logo` en null la quita; sin `logo`, se queda la que tenía.
  // `correo` en "" lo quita; un correo nuevo va con su `consentimiento`.
  const guardarOrganizador = (o) => {
    const cuerpo = { accion: "organizador", nombre: o.nombre };
    if (o.id) Object.assign(cuerpo, { id: o.id, clave: o.clave });
    if (o.logo !== undefined) cuerpo.logo = o.logo;
    if (o.correo !== undefined) Object.assign(cuerpo, { correo: o.correo, consentimiento: !!o.consentimiento });
    return llamar(cuerpo);
  };
  // Lo que la organización ve de sí misma: el sello, su correo (tapado) y si
  // pidió el sello. Confirmar el correo, recuperarla y pedir el sello.
  const estadoOrganizador = (o) => llamar({ accion: "organizador_estado", id: o.id, clave: o.clave });
  const confirmarCorreo = (id, token) => llamar({ accion: "confirmar_correo", id, token });
  const recuperarOrganizador = (correo) => llamar({ accion: "recuperar", correo });
  const recuperarConfirmar = (id, token) => llamar({ accion: "recuperar_confirmar", id, token });
  const pedirSello = (o, datos) => llamar(Object.assign({ accion: "pedir_sello", id: o.id, clave: o.clave, consentimiento: true }, datos));
  // «Reportar este torneo» (la página pública, sin clave).
  const reportar = (id, motivo, detalle) => llamar({ accion: "reportar", id, motivo, detalle: detalle || "" });
  const borrar = (p) => llamar({ accion: "borrar", id: p.id, clave: p.clave });
  // La inscripción previa: mandarla (la página pública, sin clave), leerlas
  // y marcarlas (quien organiza, con la clave de su torneo).
  const inscribir = (id, inscripcion) => llamar({ accion: "inscribir", id, inscripcion, consentimiento: true });
  const inscripciones = (p) => llamar({ accion: "inscripciones", id: p.id, clave: p.clave });
  const marcar = (p, ids, estado) => llamar({ accion: "marcar", id: p.id, clave: p.clave, ids, estado });
  // Seguir a un jugador por correo (la página pública, sin cuenta): pedirlo,
  // confirmarlo y darse de baja con los enlaces que llegan por correo.
  const seguirCorreo = (nombre, ident, correo) => llamar({ accion: "seguir_correo", nombre, ident: ident || "", correo, consentimiento: true });
  const seguirConfirmar = (id, token) => llamar({ accion: "seguir_confirmar", id, token });
  const seguirBaja = (id, token) => llamar({ accion: "seguir_baja", id, token });
  // Los mismos avisos en este aparato (push): la llave pública del sitio, y
  // seguir o dejar de seguir con la suscripción que da el navegador.
  const pushLlave = () => llamar({ accion: "push_llave" });
  const seguirPush = (nombre, ident, suscripcion) => llamar({ accion: "seguir_push", nombre, ident: ident || "", suscripcion });
  const seguirPushBaja = (nombre, ident, suscripcion) => llamar({ accion: "seguir_push_baja", nombre, ident: ident || "", suscripcion });
  // La dirección pública de un torneo publicado (desde la página que llama).
  const enlace = (id) => new URL("torneos-pareo.html#t=" + encodeURIComponent(id), location.href).href;

  const api = { datosPublicos, crear, actualizar, guardarOrganizador, estadoOrganizador, confirmarCorreo, recuperarOrganizador, recuperarConfirmar, pedirSello, reportar, borrar, inscribir, inscripciones, marcar, seguirCorreo, seguirConfirmar, seguirBaja, pushLlave, seguirPush, seguirPushBaja, enlace, URL_FUNCION };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.PareoPublicar = api;
})(typeof self !== "undefined" ? self : this);
