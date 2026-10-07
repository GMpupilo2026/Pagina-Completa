/* ¿Cuánto material gana esta jugada? Un buscador chiquito, con chess.js, para
 * comprobar los ejercicios de táctica de los cuentos (verificar-libro-ninos.js).
 *
 * El CI no tiene Stockfish, y un libro de trucos promete que la jugada de la
 * respuesta es LA que gana. Para posiciones de pocas piezas basta con mirar
 * unas jugadas hacia adelante contando material: negamax con poda alfa-beta
 * a `profundidad` medias jugadas y, al final, solo capturas hasta que se
 * calma (así no cuenta una pieza «ganada» que se vuelve a perder enseguida).
 * El mate vale 1000.
 *
 *   ganancias(fen, profundidad)  →  [{ san, gana }] para cada jugada legal,
 *       `gana` en puntos de material para el que mueve (peón 1 … dama 9).
 *
 * No es un motor: sirve para posiciones de iniciación en las que el truco se
 * ve en dos o tres jugadas, que es lo que trae un cuento para niños.
 */
"use strict";
const { Chess } = require("chess.js");

const VALOR = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const MATE = 1000;

function material(g) {
  let s = 0;
  for (const fila of g.board()) for (const c of fila) if (c) s += (c.color === "w" ? 1 : -1) * VALOR[c.type];
  return g.turn() === "w" ? s : -s;
}

function ordenar(movs) {
  return movs.sort((a, b) => (b.captured ? VALOR[b.captured] * 10 - VALOR[b.piece] : -100) - (a.captured ? VALOR[a.captured] * 10 - VALOR[a.piece] : -100));
}

function calma(g, alfa, beta, n) {
  if (g.in_checkmate()) return -MATE;
  const quieto = material(g);
  if (n <= 0) return quieto;
  if (quieto >= beta) return quieto;
  if (quieto > alfa) alfa = quieto;
  for (const m of ordenar(g.moves({ verbose: true }).filter((x) => x.captured))) {
    g.move(m);
    const v = -calma(g, -beta, -alfa, n - 1);
    g.undo();
    if (v >= beta) return v;
    if (v > alfa) alfa = v;
  }
  return alfa;
}

function buscar(g, prof, alfa, beta) {
  if (g.in_checkmate()) return -MATE - prof;   // el mate más cercano vale más
  // Solo el ahogado es tablas. in_draw() también da tablas con rey y caballo
  // contra rey, y entonces la pieza que se acaba de ganar valía 0: la
  // horquilla que se come la torre y queda sola parecía no ganar nada.
  if (g.in_stalemate()) return 0;
  if (prof <= 0) return calma(g, alfa, beta, 8);
  let mejor = -Infinity;
  for (const m of ordenar(g.moves({ verbose: true }))) {
    g.move(m);
    const v = -buscar(g, prof - 1, -beta, -alfa);
    g.undo();
    if (v > mejor) mejor = v;
    if (v > alfa) alfa = v;
    if (alfa >= beta) break;
  }
  return mejor;
}

function ganancias(fen, profundidad) {
  const g = new Chess(fen);
  const base = material(g);
  return g.moves({ verbose: true }).map((m) => {
    g.move(m);
    const v = -buscar(g, (profundidad || 4) - 1, -Infinity, Infinity);
    g.undo();
    return { san: m.san, gana: v >= MATE - 50 ? MATE : v - base };
  });
}

module.exports = { ganancias, material, VALOR, MATE };
