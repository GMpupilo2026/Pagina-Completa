/* Ajedrez Integral — Coordenadas insiste en las casillas que cuestan.
 *
 * Antes cada casilla salía al azar parejo y no se guardaba cuáles fallaba el
 * alumno: quien ya sabía e4 la seguía viendo tanto como la b6 que nunca
 * encuentra. Ahora cada casilla lleva la cuenta de sus aciertos y sus fallos,
 * y el sorteo la pesa:
 *
 *     peso = 1 + 3 · fallos / (aciertos + fallos + 1)
 *
 * Una casilla nunca vista o dominada pesa 1; una que se falla casi siempre,
 * hasta 4. Todas siguen saliendo (una ronda solo de las difíciles no entrena
 * el tablero entero), pero las que cuestan, bastante más seguido.
 *
 * Cada vez que se pide una casilla cuenta UNA sola vez: fallo si hubo algún
 * error o se acabó el tiempo antes de encontrarla, acierto si salió a la
 * primera. Tres clics malos seguidos en la misma no son tres fallos.
 *
 * El estado es { "e4:a": aciertos, "e4:f": fallos } en
 * "entreno_coord_casillas_v1", que viaja con la cuenta (js/progreso-usuario.js,
 * fusión maxPorClave: los contadores solo suben, así que entre dos aparatos
 * gana el más alto y no se pierde nada).
 */
(function () {
  "use strict";

  const CLAVE = "entreno_coord_casillas_v1";
  const COLUMNAS = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const TODAS = [];
  COLUMNAS.forEach((c) => { for (let f = 1; f <= 8; f++) TODAS.push(c + f); });

  function leer() {
    try {
      const o = JSON.parse(localStorage.getItem(CLAVE) || "{}");
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch (e) { return {}; }
  }
  function guardar(estado) {
    try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) {}
  }

  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  function cuenta(estado, sq) { return { aciertos: num(estado[sq + ":a"]), fallos: num(estado[sq + ":f"]) }; }

  function peso(estado, sq) {
    const c = cuenta(estado, sq);
    return 1 + 3 * c.fallos / (c.aciertos + c.fallos + 1);
  }

  /* Anota cómo salió una casilla y lo guarda. */
  function anotar(sq, acierto) {
    if (TODAS.indexOf(sq) < 0) return;
    const estado = leer();
    const k = sq + (acierto ? ":a" : ":f");
    estado[k] = num(estado[k]) + 1;
    guardar(estado);
  }

  /* Sortea una casilla con su peso. `evitar` no sale (la de recién);
     `azar` (0 ≤ x < 1) es para las pruebas. */
  function elegir(estado, evitar, azar) {
    const lista = TODAS.filter((sq) => sq !== evitar);
    const pesos = lista.map((sq) => peso(estado, sq));
    let r = (typeof azar === "number" ? azar : Math.random()) * pesos.reduce((s, p) => s + p, 0);
    for (let i = 0; i < lista.length; i++) { r -= pesos[i]; if (r < 0) return lista[i]; }
    return lista[lista.length - 1];
  }

  /* Las que más cuestan: con al menos dos fallos, de la peor a la mejor. */
  function masDificiles(estado, n) {
    return TODAS.map((sq) => Object.assign({ sq, peso: peso(estado, sq) }, cuenta(estado, sq)))
      .filter((x) => x.fallos >= 2)
      .sort((a, b) => b.peso - a.peso || b.fallos - a.fallos || (a.sq < b.sq ? -1 : 1))
      .slice(0, n || 3);
  }

  const api = { CLAVE, TODAS, leer, anotar, peso, elegir, masDificiles };
  if (typeof window !== "undefined") window.CoordenadasCasillas = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
