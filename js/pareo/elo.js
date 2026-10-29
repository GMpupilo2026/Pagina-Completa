/* ===== Pareo Integral — el Elo que gana o pierde cada jugador =====
 *
 * Con las reglas de FIDE (Reglamento de Rating, B.02, vigente desde 2024):
 *   - cuentan solo las partidas jugadas (no las ganadas por incomparecencia
 *     ni los byes) entre dos jugadores con Elo;
 *   - una diferencia de más de 400 puntos se cuenta como de 400;
 *   - lo esperado sale de la tabla 8.1.2 (escrita abajo, tal cual), y el
 *     rendimiento de la 8.1 (la de los desempates, js/pareo/desempates.js:
 *     dpDeP);
 *   - el cambio es K × (puntos − esperado), con K = 40 hasta el final del
 *     año en que cumple 18 (con menos de 2300), 10 desde 2400 y 20 para los
 *     demás. «Hasta el final del año en que cumple 18» incluye ese año: quien
 *     nació en 2007 lleva K 40 en todo 2025 (se comprobó contra el «FIDE elo
 *     +/-» de chess-results en torneos reales; antes se cortaba un año antes). El K de un jugador nuevo (menos de 30 partidas con
 *     Elo, también 40) no se puede saber desde acá: se anota en «Editar».
 *
 * Es una cuenta del torneo, no el Elo oficial: FIDE (o la federación) junta
 * todos los torneos del período y lo publica. Con el Elo que tenga anotado
 * cada jugador, sea FIDE o Nacional.
 *
 *   PareoElo.calcular(t, hasta) → Map id → { elo, k, partidas, puntos,
 *     esperado, cambio, rp, rivales, juegos }
 *   `juegos`: cada partida que contó, para explicar el número (lo usa la
 *   «Variación de Elo del torneo», variacion-elo.html): { ronda, rival,
 *   eloRival, dif (ya con el tope de 400), esperado, puntos }.
 */
(function (raiz) {
  "use strict";

  const enNode = typeof module !== "undefined" && module.exports;
  const T = enNode ? require("./torneo.js") : raiz.PareoTorneo;
  const D = enNode ? require("./desempates.js") : raiz.PareoDesempates;

  const TOPE = 400;

  // La tabla 8.1.2 de FIDE: hasta qué diferencia de Elo (inclusive) se
  // espera 0,50, 0,51, 0,52… para el de más Elo. Escrita tal cual: sus cortes
  // casi son los puntos medios de la tabla 8.1 (dpDeP), pero no en los
  // empates (25 da 0,53; 392 da 0,92), y es la que usa FIDE.
  const HASTA = [3, 10, 17, 25, 32, 39, 46, 53, 61, 68, 76, 83, 91, 98, 106, 113, 121, 129, 137, 145, 153, 162, 170, 179, 188,
    197, 206, 215, 225, 235, 245, 256, 267, 278, 290, 302, 315, 328, 344, 357, 374, 391, 411, 432, 456, 484, 517, 559, 619, 735];
  function esperado(dif) {
    const d = Math.abs(Math.round(dif));
    let i = HASTA.findIndex((h) => d <= h);
    if (i < 0) i = 50;
    const alto = Math.round((50 + i)) / 100;
    return dif >= 0 ? alto : Math.round((1 - alto) * 100) / 100;
  }

  function kDe(j, anio) {
    const fijo = Number(j.kFide);
    if (fijo === 40 || fijo === 20 || fijo === 10) return fijo;
    const e = Number(j.elo) || 0;
    if (e >= 2400) return 10;
    const nace = Number(String(j.nacimiento || "").slice(0, 4));
    if (nace && anio - nace <= 18 && e < 2300) return 40;
    return 20;
  }

  const anioDe = (t) => Number(String(t.fechaInicio || "").slice(0, 4)) || Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }).slice(0, 4));

  function calcular(t, hasta) {
    const h = Math.min(hasta == null ? t.rondas.length : hasta, t.rondas.length);
    const anio = anioDe(t);
    const porId = new Map(t.jugadores.map((j) => [j.id, j]));
    const out = new Map();
    for (const j of t.jugadores) {
      const elo = Number(j.elo) || 0;
      const x = { elo, k: elo ? kDe(j, anio) : null, partidas: 0, puntos: 0, esperado: 0, cambio: null, rp: null, rivales: 0, juegos: [] };
      if (elo) {
        let sumaRivales = 0;
        for (let r = 0; r < h; r++) {
          const s = T.situacion(t, r, j.id);
          if (s.tipo !== "partida") continue;
          const rival = porId.get(s.rival);
          const er = Number(rival && rival.elo) || 0;
          if (!er) continue;
          const dif = Math.max(-TOPE, Math.min(TOPE, elo - er));
          const pts = s.codigo === "1" ? 1 : s.codigo === "=" ? 0.5 : 0;
          x.partidas++;
          x.puntos += pts;
          x.esperado += esperado(dif);
          x.juegos.push({ ronda: r + 1, rival: s.rival, eloRival: er, dif, esperado: esperado(dif), puntos: pts });
          sumaRivales += er;
        }
        if (x.partidas) {
          x.esperado = Math.round(x.esperado * 100) / 100;
          x.cambio = Math.round(x.k * (x.puntos - x.esperado) * 10) / 10;
          x.rivales = Math.round(sumaRivales / x.partidas);
          const p = Math.round((x.puntos / x.partidas) * 100) / 100;
          x.rp = Math.round(x.rivales + D.dpDeP(p));
        }
      }
      out.set(j.id, x);
    }
    return out;
  }

  // «+12,4», «−3», «0»: con signo y coma decimal (en inglés, punto).
  function textoCambio(x, idioma) {
    if (x == null) return "";
    const s = Math.abs(x).toLocaleString(idioma === "en" ? "en-US" : "es-CR", { maximumFractionDigits: 1 });
    return x > 0 ? "+" + s : x < 0 ? "-" + s : "0";
  }

  const api = { calcular, esperado, kDe, textoCambio, TOPE };
  if (enNode) module.exports = api;
  else raiz.PareoElo = api;
})(typeof self !== "undefined" ? self : this);
