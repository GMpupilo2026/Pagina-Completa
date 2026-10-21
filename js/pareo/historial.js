/* ===== Pareo Integral — el historial de cambios de un torneo =====
 *
 * Qué cambió entre dos versiones de un torneo, en pocas palabras: los
 * resultados de cada mesa (y de cada tablero en equipos), quién entró o
 * salió, una ronda emparejada o deshecha y los datos del torneo. Lo usa
 * js/pareo/pagina.js para la lista «Historial de cambios» y el botón
 * «Deshacer el último cambio»; cada cambio sale como { clave, vars } (las
 * claves de js/pareo/textos.js), así se escribe en el idioma de la página.
 * Funciones puras: las prueba herramientas/verificar-pareo-cierre.js.
 */
(function (raiz) {
  "use strict";

  const nombreDe = (t, id) => {
    for (const j of t.jugadores || []) {
      if (j.id === id) return j.nombre;
      for (const x of j.integrantes || []) if (x.id === id) return x.nombre;
    }
    return "?";
  };

  function describir(antes, despues) {
    const out = [];
    const ra = antes.rondas || [], rd = despues.rondas || [];
    if (rd.length > ra.length) for (let r = ra.length; r < rd.length; r++) out.push({ clave: "histEmparejada", vars: { r: r + 1 } });
    if (rd.length < ra.length) for (let r = rd.length; r < ra.length; r++) out.push({ clave: "histDeshecha", vars: { r: r + 1 } });
    for (let r = 0; r < Math.min(ra.length, rd.length); r++) {
      const ma = ra[r].mesas, md = rd[r].mesas;
      md.forEach((m, i) => {
        const a = ma[i];
        if (!a) return;
        if ((a.r || null) !== (m.r || null)) out.push({ clave: "histResultado", vars: { r: r + 1, m: i + 1, a: a.r || "—", d: m.r || "—" } });
        (m.partidas || []).forEach((p, k) => {
          const pa = (a.partidas || [])[k];
          if (pa && (pa.r || null) !== (p.r || null)) out.push({ clave: "histTablero", vars: { r: r + 1, m: i + 1, t: k + 1, a: pa.r || "—", d: p.r || "—" } });
        });
        if (JSON.stringify(a.alineacion || null) !== JSON.stringify(m.alineacion || null) && a.alineacion) out.push({ clave: "histAlineacion", vars: { r: r + 1, m: i + 1 } });
      });
      if (JSON.stringify(ra[r].incidencias || []) !== JSON.stringify(rd[r].incidencias || [])) out.push({ clave: "histIncidencias", vars: { r: r + 1 } });
    }
    const ids = (t) => new Set((t.jugadores || []).map((j) => j.id));
    const ia = ids(antes), id = ids(despues);
    for (const x of id) if (!ia.has(x)) out.push({ clave: "histEntra", vars: { n: nombreDe(despues, x) } });
    for (const x of ia) if (!id.has(x)) out.push({ clave: "histSale", vars: { n: nombreDe(antes, x) } });
    // Lo demás (datos del torneo, un jugador editado, el orden de tableros…).
    if (!out.length) {
      const sinRondas = (t) => JSON.stringify(Object.assign({}, t, { rondas: null }));
      if (sinRondas(antes) !== sinRondas(despues)) out.push({ clave: "histDatos", vars: {} });
    }
    return out;
  }

  const api = { describir };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.PareoHistorial = api;
})(typeof self !== "undefined" ? self : this);
