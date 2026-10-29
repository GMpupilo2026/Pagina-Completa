/* ===== Ranking estudiantil por categoría: el cálculo, sin pantalla =====
 *
 * Con los mismos datos de historial-jugador.html y estadisticas-colegios.html
 * (js/jde-datos.js: los torneos de los JDE publicados en chess-results), el
 * ranking de un año y una categoría: quién llegó más lejos y con qué
 * resultado. Solo torneos individuales de ritmo clásico de los JDE (en uno
 * por equipos el puesto es del equipo, y los blitz y rápidos repiten a los
 * mismos estudiantes).
 *
 * El orden, de lo que más pesa a lo que menos:
 *   1. la etapa más alta que jugó (nacional, interregional, regional,
 *      institucional): llegar a la final pesa más que ganar la regional;
 *   2. su mejor puesto en esa etapa;
 *   3. sus puntos en esa etapa (si jugó dos torneos ahí, los del mejor);
 *   4. todos sus puntos del año en la categoría.
 * Dos estudiantes iguales en las cuatro comparten el lugar. No es un Elo ni
 * pretende serlo: dice hasta dónde llegó cada uno. La página lo explica.
 *
 * La región de un estudiante es la de su torneo regional (la final no tiene
 * región); el filtro de región deja a los que jugaron la regional ahí.
 * Ver «Ranking estudiantil por categoría» en docs/decisiones/juegos-y-torneos.md.
 *
 *   RankingEstudiantil.armar(datos, { anio, categoria, rama, region })
 *     → [{ lugar, jugador, instituciones, region, etapa, nivel, puesto, de,
 *          puntosEtapa, puntos, partidas, torneos, mejor }]
 *   RankingEstudiantil.opciones(datos) → { anios, categorias, regiones }
 */
(function (raiz) {
  "use strict";

  const NIVEL = { "Institucional o circuital": 1, "Regional": 2, "Interregional": 3, "Nacional": 4 };

  const cuenta = (t) => t.jde && t.ritmo === "Clásico" && t.modalidad === "Individual" && !t.porEquipos;

  function armar(datos, filtros) {
    const f = filtros || {};
    const anio = Number(f.anio) || 0;
    const porJugador = new Map();
    for (const p of datos.participaciones) {
      const t = p.torneo;
      if (!cuenta(t) || t.anio !== anio || t.categoria !== f.categoria) continue;
      // Sin rama en el nombre (llegó cortado: «…Individual A», «…Absolu») es
      // el abierto: los torneos femeninos lo dicen siempre.
      if (f.rama && (t.rama || "Abierta") !== f.rama) continue;
      if (!porJugador.has(p.jugador.i)) porJugador.set(p.jugador.i, []);
      porJugador.get(p.jugador.i).push(p);
    }
    const filas = [];
    for (const lista of porJugador.values()) {
      const jugador = lista[0].jugador;
      const regiones = lista.filter((p) => p.torneo.etapa === "Regional" && p.torneo.region).map((p) => p.torneo.region);
      const region = masComun(regiones);
      if (f.region && !regiones.includes(f.region)) continue;
      const nivel = Math.max(...lista.map((p) => NIVEL[p.torneo.etapa] || 0));
      const enLaEtapa = lista.filter((p) => (NIVEL[p.torneo.etapa] || 0) === nivel);
      // El mejor de esa etapa: el de mejor puesto (sin puesto leído, al final) y, si empata, más puntos.
      const mejor = enLaEtapa.slice().sort((a, b) => (a.puesto || 1e9) - (b.puesto || 1e9) || (b.puntos || 0) - (a.puntos || 0))[0];
      const puntos = lista.reduce((s, p) => s + (Number(p.puntos) || 0), 0);
      const partidas = lista.reduce((s, p) => s + (Number(p.torneo.rondas) || 0), 0);
      filas.push({
        jugador, region, nivel, etapa: mejor.torneo.etapa, puesto: mejor.puesto || null, de: mejor.torneo.de || null,
        puntosEtapa: Number(mejor.puntos) || 0, puntos, partidas, torneos: lista.length, mejor,
        instituciones: [...new Set(lista.map((p) => p.institucion && p.institucion.nombre).filter(Boolean))],
      });
    }
    const clave = (x) => [-x.nivel, x.puesto || 1e9, -x.puntosEtapa, -x.puntos];
    const comparar = (a, b) => {
      const ka = clave(a), kb = clave(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
      return 0;
    };
    filas.sort((a, b) => comparar(a, b) || a.jugador.nombre.localeCompare(b.jugador.nombre, "es"));
    filas.forEach((x, i) => { x.lugar = i > 0 && comparar(filas[i - 1], x) === 0 ? filas[i - 1].lugar : i + 1; });
    return filas;
  }

  function masComun(lista) {
    const n = new Map();
    lista.forEach((x) => n.set(x, (n.get(x) || 0) + 1));
    let mejor = "", k = 0;
    for (const [x, c] of n) if (c > k || (c === k && x.localeCompare(mejor, "es") < 0)) { mejor = x; k = c; }
    return mejor;
  }

  // Los años, categorías y regiones que tienen torneos que cuentan, para los filtros.
  function opciones(datos) {
    const ts = [...datos.torneos.values()].filter(cuenta);
    return {
      anios: [...new Set(ts.map((t) => t.anio))].sort((a, b) => b - a),
      categorias: [...new Set(ts.map((t) => t.categoria).filter((c) => /^[A-E]$/.test(c)))].sort(),
      regiones: [...new Set(ts.filter((t) => t.etapa === "Regional").map((t) => t.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    };
  }

  // «1.º de 11 en la Nacional»
  function resultadoTexto(x) {
    const etapa = x.etapa === "Institucional o circuital" ? "la Institucional" : "la " + x.etapa;
    return (x.puesto ? x.puesto + ".º" + (x.de ? " de " + x.de : "") + " en " : "Jugó ") + etapa;
  }

  const api = { armar, opciones, resultadoTexto, NIVEL };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.RankingEstudiantil = api;
})(typeof self !== "undefined" ? self : this);
