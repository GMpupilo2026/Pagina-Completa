/* Los datos de los juegos estudiantiles que comparten historial-jugador.html y
 * estadisticas-colegios.html: los torneos (data/ajedrez-estudiantil.json, los
 * mismos de ajedrez-estudiantil.html) y quién jugó cada uno
 * (data/ajedrez-estudiantil-jugadores.json). Los dos los arma
 * herramientas/ajedrez-estudiantil.py desde lo que se leyó de chess-results.
 *
 * Una persona es su nombre como lo publica chess-results, sin tildes ni
 * mayúsculas: dos nombres escritos distinto son dos personas, y dos personas
 * con el mismo nombre, una. Las páginas lo dicen.
 *
 * Ver «Historial del jugador y estadísticas por colegio» en
 * docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const ETAPAS_JDE = ["Institucional o circuital", "Regional", "Interregional", "Nacional"];
  // El mismo color que cada etapa tiene en ajedrez-estudiantil.html
  // (css/styles.css, medidos): el nombre de la etapa va siempre escrito al lado.
  const CLASE_ETAPA = {
    "Institucional o circuital": "ae-e1", "Regional": "ae-e2", "Interregional": "ae-e3", "Nacional": "ae-e4"
  };
  const NIVEL_ETAPA = { "Institucional o circuital": 1, "Regional": 2, "Interregional": 3, "Nacional": 4 };

  const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const normalizar = (s) => sinTildes(s).replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();

  const numero = new Intl.NumberFormat("es-CR");
  const puntos = new Intl.NumberFormat("es-CR", { maximumFractionDigits: 1 });

  async function pedir(url) {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(url + ": " + r.status);
    return r.json();
  }

  /* Carga los tres archivos y arma los índices. Devuelve:
   *   torneos: Map clave → {clave, anio, etapa, categoria, nombre, inicio,
   *            lugar, region, jugadores, modalidad, ritmo, enlace}
   *   jugadores: [{i, nombre, clave, part: [participación]}]
   *   instituciones: [{i, nombre, clave}]
   *   participaciones: [{torneo, jugador, institucion, puesto, puntos, elo,
   *            partidas: [{ronda, mesa, color, resultado, rivalNombre,
   *            rivalClave, rivalInstitucion, rivalElo}] o null si no se
   *            leyeron (solo hay de individuales de 2024 en adelante, y se
   *            completan de a poco)}]
   *   equipos: [{torneo, institucion, puesto, puntos}]
   *   equiposPorTorneo: Map clave → cantidad de equipos
   */
  async function cargar() {
    const [t, j, pa] = await Promise.all([
      pedir("data/ajedrez-estudiantil.json"), pedir("data/ajedrez-estudiantil-jugadores.json"),
      pedir("data/ajedrez-estudiantil-partidas.json").catch(() => ({ partidas: [] })),
    ]);
    const torneos = new Map();
    for (const fila of t.torneos) {
      const o = {};
      t.columnas.forEach((c, i) => { o[c] = fila[i]; });
      o.enlace = "https://chess-results.com/tnr" + o.clave + ".aspx?lan=2";
      o.jde = ETAPAS_JDE.includes(o.etapa);
      torneos.set(o.clave, o);
    }
    const jugadores = j.jugadores.map(([nombre, clave], i) => ({ i, nombre, clave, part: [] }));
    const instituciones = j.instituciones.map(([nombre, clave], i) => ({ i, nombre, clave }));
    const partidasPorClaveYSnr = new Map();
    for (const fila of pa.partidas || []) {
      const o = {};
      pa.columnas.forEach((c, i) => { o[c] = fila[i]; });
      o.rivalClave = normalizar(o.rivalNombre);
      const k = o.clave + "|" + o.snr;
      if (!partidasPorClaveYSnr.has(k)) partidasPorClaveYSnr.set(k, []);
      partidasPorClaveYSnr.get(k).push(o);
    }
    const participaciones = [];
    for (const [clave, jugador, institucion, puesto, pts, elo, snr] of j.participaciones) {
      const torneo = torneos.get(clave);
      if (!torneo) continue;
      const p = {
        torneo, jugador: jugadores[jugador], institucion: institucion == null ? null : instituciones[institucion],
        puesto, puntos: pts, elo, partidas: snr == null ? null : (partidasPorClaveYSnr.get(clave + "|" + snr) || null),
      };
      participaciones.push(p);
      p.jugador.part.push(p);
    }
    const equipos = [];
    const equiposPorTorneo = new Map();
    for (const [clave, institucion, puesto, pts] of j.equipos) {
      const torneo = torneos.get(clave);
      if (!torneo) continue;
      equipos.push({ torneo, institucion: institucion == null ? null : instituciones[institucion], puesto, puntos: pts });
      equiposPorTorneo.set(clave, (equiposPorTorneo.get(clave) || 0) + 1);
    }
    // De cuántos fue el puesto: en un individual, los clasificados que se
    // leyeron (o los inscritos, si no se leyó); en uno por equipos, los equipos.
    const clasificados = new Map();
    for (const p of participaciones) {
      if (p.torneo.modalidad !== "Equipos") clasificados.set(p.torneo.clave, (clasificados.get(p.torneo.clave) || 0) + 1);
    }
    for (const o of torneos.values()) {
      // Un torneo con clasificación de equipos ES por equipos, aunque la lista
      // de torneos diga «Individual» (su nombre llegó cortado, sin «Equipos»):
      // el puesto de sus jugadores es el de su equipo.
      if (equiposPorTorneo.has(o.clave)) o.modalidad = "Equipos";
      o.de = o.modalidad === "Equipos" ? (equiposPorTorneo.get(o.clave) || 0) : (clasificados.get(o.clave) || o.jugadores);
      o.porEquipos = equiposPorTorneo.has(o.clave);
    }
    for (const x of jugadores) x.part.sort((a, b) => (a.torneo.inicio < b.torneo.inicio ? -1 : a.torneo.inicio > b.torneo.inicio ? 1 : a.torneo.clave - b.torneo.clave));
    return { actualizado: j.actualizado || t.actualizado, torneos, jugadores, instituciones, participaciones, equipos, equiposPorTorneo };
  }

  // «12 de octubre de 2026» de un AAAA-MM-DD, sin pasar por Date (que lo
  // leería en UTC y daría el día anterior en Costa Rica).
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function fechaLarga(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? Number(m[3]) + " de " + MESES[Number(m[2]) - 1] + " de " + m[1] : "";
  }

  window.JdeDatos = { cargar, normalizar, sinTildes, ETAPAS_JDE, CLASE_ETAPA, NIVEL_ETAPA, numero, puntos, fechaLarga };
})();
