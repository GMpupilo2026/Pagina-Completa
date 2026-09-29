/* Ajedrez Integral — ¿esta jugada cumple el motivo táctico que se pide?
 *
 * Practicar (js/entreno-practicas.js) y Aprender (js/entreno-aprender.js)
 * guardan UNA jugada por ejercicio y solo aceptaban esa. Pero en un ataque
 * descubierto cualquier salto del caballo descubre el jaque, y en varias
 * horquillas hay otra que también lo es (Cf7+ además de Cc6): la página le
 * decía «no es la jugada que buscamos» a una respuesta buena, y eso no da
 * ningún error. Lo encontró herramientas/verificar-practicar-aprender.js, que
 * usa este mismo módulo: una sola copia de qué es cada motivo.
 *
 *   MotivosTacticos.cumple(motivo, fenAntes, jugada) → true | false
 *       `jugada` es la de chess.js (verbose: from, to, piece, captured…).
 *       Los motivos:
 *         "horquilla"   el caballo que se mueve ataca dos piezas que valen
 *                       (rey, dama, torre, alfil o caballo) y el rival no lo
 *                       puede comer;
 *         "doble"       lo mismo con una pieza de largo alcance (o el rey);
 *         "clavada"     se come una pieza clavada a su rey, y el rival no
 *                       puede volver a comer en esa casilla;
 *         "descubierto" después de la jugada da jaque OTRA pieza, no la que
 *                       se movió.
 *       «No lo puede comer» cuenta: una horquilla que regala la pieza no es
 *       lo que el ejercicio enseña.
 *
 *   MotivosTacticos.ataques(juego, casilla) → casillas que ataca esa pieza
 *       (sin mirar de quién es el turno; las jugadas de chess.js no sirven para
 *       esto: nunca «capturan» al rey).
 */
(function () {
  "use strict";

  const COL = "abcdefgh";
  const sq = (f, r) => COL[f] + (r + 1);
  const dentro = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
  const REC = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const CABALLO = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  const VALE = { k: true, q: true, r: true, b: true, n: true };

  function ataques(juego, desde) {
    const p = juego.get(desde);
    if (!p) return [];
    const f0 = COL.indexOf(desde[0]), r0 = +desde[1] - 1, out = [];
    const salto = (d) => d.forEach(([df, dr]) => { if (dentro(f0 + df, r0 + dr)) out.push(sq(f0 + df, r0 + dr)); });
    const rayo = (d) => d.forEach(([df, dr]) => {
      let f = f0 + df, r = r0 + dr;
      while (dentro(f, r)) { out.push(sq(f, r)); if (juego.get(sq(f, r))) break; f += df; r += dr; }
    });
    if (p.type === "n") salto(CABALLO);
    if (p.type === "k") salto(REC.concat(DIAG));
    if (p.type === "p") salto(p.color === "w" ? [[1, 1], [-1, 1]] : [[1, -1], [-1, -1]]);
    if (p.type === "r" || p.type === "q") rayo(REC);
    if (p.type === "b" || p.type === "q") rayo(DIAG);
    return out;
  }
  function casillas(juego, filtro) {
    const out = [];
    for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) { const s = sq(f, r), p = juego.get(s); if (p && filtro(p, s)) out.push(s); }
    return out;
  }
  const reyDe = (juego, color) => casillas(juego, (p) => p.type === "k" && p.color === color)[0] || null;
  function objetivos(juego, desde) {
    const yo = juego.get(desde).color;
    return ataques(juego, desde).filter((s) => { const p = juego.get(s); return p && p.color !== yo && VALE[p.type]; });
  }
  // Las piezas del que acaba de mover que atacan al rey del que le toca.
  function quienesDanJaque(juego) {
    const rey = reyDe(juego, juego.turn());
    return casillas(juego, (p, s) => p.color !== juego.turn() && ataques(juego, s).includes(rey));
  }
  // Clavada a su rey: sacarla del tablero deja a su rey atacado.
  function clavadaASuRey(juego, s) {
    const p = juego.get(s);
    if (!p || p.type === "k") return false;
    const g = new Chess(juego.fen());
    g.remove(s);
    const rey = reyDe(g, p.color);
    return casillas(g, (q, x) => q.color !== p.color && ataques(g, x).includes(rey)).length > 0;
  }
  // Después de la jugada, ¿el rival puede comer en esa casilla?
  const sePuedeComer = (despues, casilla) => despues.moves({ verbose: true }).some((m) => m.to === casilla);

  function cumple(motivo, fenAntes, jugada) {
    if (!jugada) return false;
    const antes = new Chess(fenAntes);
    const despues = new Chess(fenAntes);
    if (!despues.move({ from: jugada.from, to: jugada.to, promotion: jugada.promotion || "q" })) return false;
    const pieza = antes.get(jugada.from);
    if (!pieza) return false;
    if (motivo === "horquilla") return pieza.type === "n" && objetivos(despues, jugada.to).length >= 2 && !sePuedeComer(despues, jugada.to);
    if (motivo === "doble") return pieza.type !== "n" && pieza.type !== "p" && objetivos(despues, jugada.to).length >= 2 && !sePuedeComer(despues, jugada.to);
    if (motivo === "clavada") return !!antes.get(jugada.to) && clavadaASuRey(antes, jugada.to) && !sePuedeComer(despues, jugada.to);
    if (motivo === "descubierto") return despues.in_check() && quienesDanJaque(despues).some((s) => s !== jugada.to);
    return false;
  }

  const api = { cumple, ataques, quienesDanJaque, MOTIVOS: ["horquilla", "doble", "clavada", "descubierto"] };
  if (typeof window !== "undefined") window.MotivosTacticos = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
