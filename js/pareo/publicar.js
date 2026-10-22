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
 * Elo, título, federación, categoría, rondas y resultados. Nunca la fecha de
 * nacimiento, el sexo, el ID FIDE, las firmas ni las notas del árbitro. La
 * función vuelve a limpiar lo que llega (no se le cree al navegador).
 */
(function (raiz) {
  "use strict";
  const URL_FUNCION = "https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/pareo-publicar";
  const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJndGlqcGltcGNva3hhdHh4YmtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5ODczMjksImV4cCI6MjEwNDU2MzMyOX0.h-AcAEQNaYMVo5UVtdWqUCTYgiSLFKDgXsn3lnbAhmQ";

  const persona = (j) => {
    const x = { id: j.id, nombre: j.nombre, institucion: j.institucion || "", elo: Number(j.elo) || 0, titulo: j.titulo || "", fed: j.fed || "", categoria: j.categoria || "",
      retiradoDespuesDe: j.retiradoDespuesDe == null ? null : j.retiradoDespuesDe };
    if (Array.isArray(j.integrantes)) x.integrantes = j.integrantes.map(persona);
    return x;
  };
  const mesa = (m) => {
    const x = { b: m.b, n: m.n == null ? null : m.n, r: m.r || null };
    if (Array.isArray(m.partidas)) x.partidas = m.partidas.map((p) => ({ r: (p && p.r) || null }));
    if (m.alineacion) x.alineacion = { b: (m.alineacion.b || []).slice(), n: (m.alineacion.n || []).slice() };
    return x;
  };

  function datosPublicos(t) {
    return {
      nombre: t.nombre || "", grupo: t.grupo || "", ciudad: t.ciudad || "", federacion: t.federacion || "",
      fechaInicio: t.fechaInicio || "", fechaFin: t.fechaFin || "", arbitro: t.arbitro || "", arbitroAdjunto: t.arbitroAdjunto || "", ritmo: t.ritmo || "",
      sistema: t.sistema, dobleVuelta: !!t.dobleVuelta, rondasTotales: t.rondasTotales, tipo: t.tipo, tableros: t.tableros,
      puntos: t.puntos, desempates: (t.desempates || []).slice(), mesaInicial: t.mesaInicial,
      evento: t.evento ? { nombre: t.evento.nombre || "" } : null,
      jugadores: (t.jugadores || []).map(persona),
      numeracion: t.numeracion ? t.numeracion.slice() : null,
      rondas: (t.rondas || []).map((R) => ({ mesas: R.mesas.map(mesa), ausencias: Object.assign({}, R.ausencias || {}), inicio: R.inicio, fin: R.fin, emparejada: R.emparejada })),
      desempateCorte: t.desempateCorte ? { formato: t.desempateCorte.formato || "", orden: (t.desempateCorte.orden || []).slice() } : undefined,
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

  const crear = (t) => llamar({ accion: "crear", torneo: datosPublicos(t) });
  const actualizar = (t) => llamar({ accion: "actualizar", id: t.publicado.id, clave: t.publicado.clave, torneo: datosPublicos(t) });
  const borrar = (p) => llamar({ accion: "borrar", id: p.id, clave: p.clave });
  // La dirección pública de un torneo publicado (desde la página que llama).
  const enlace = (id) => new URL("torneos-pareo.html#t=" + encodeURIComponent(id), location.href).href;

  const api = { datosPublicos, crear, actualizar, borrar, enlace, URL_FUNCION };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.PareoPublicar = api;
})(typeof self !== "undefined" ? self : this);
