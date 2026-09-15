/**
 * Motor de reglas de "Ilumina el Tablero" — Juegos.
 *
 * La idea: cada nivel es una figura (un subconjunto de casillas de un
 * tablero, dibujada con arte ASCII) más algunas piezas negras fijas.
 * Se te dan una o varias piezas blancas para colocar en CUALQUIER casilla
 * vacía de la figura; ganas cuando, entre todas tus piezas ya colocadas,
 * el alcance de captura de cada una (igual que en ajedrez de siempre)
 * cubre TODAS las casillas vacías de la figura.
 *
 * Dos reglas que le dan intriga al asunto (documentadas también en las
 * instrucciones del juego):
 *   1. Una pieza blanca colocada en una casilla que una pieza negra
 *      atacaría, no ilumina nada — como si estuviera "amenazada" y
 *      demasiado ocupada cuidándose para vigilar otra casilla. Para
 *      arreglarlo: muévela a otra casilla, o pon otra pieza propia en
 *      medio del ataque para bloquearlo (solo funciona contra torres,
 *      alfiles y damas negras — un caballo, un rey o un peón no se
 *      pueden bloquear).
 *   2. El alcance de cada pieza es EXACTAMENTE el de ajedrez normal: las
 *      piezas que se deslizan (torre/alfil/dama) se detienen en cuanto
 *      chocan con otra pieza (propia o negra) o con el borde de la
 *      figura — salirse de la figura corta el rayo igual que el borde
 *      de un tablero de verdad.
 *
 * No depende de chess.js: la figura no es un tablero de 8x8, así que hace
 * falta una función de alcance propia, agnóstica de la forma del tablero
 * (como ya hace js/fourplayer-engine.js con su tablero en cruz).
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Figura: arte ASCII -> conjunto de casillas jugables. 'X' es una casilla
  // de la figura, cualquier otro carácter (normalmente '.') es "fuera" —
  // una pared que corta el alcance de las piezas que se deslizan.
  // ---------------------------------------------------------------------
  function parseShape(art) {
    const cells = new Set();
    let cols = 0;
    art.forEach((fila, r) => {
      cols = Math.max(cols, fila.length);
      for (let c = 0; c < fila.length; c++) {
        if (fila[c] === "X") cells.add(key(c, r));
      }
    });
    return { cells, rows: art.length, cols };
  }

  function key(c, r) {
    return c + "," + r;
  }

  const KNIGHT_OFFSETS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const KING_OFFSETS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const PIECE_NAME = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey" };
  const PIECE_GLYPH_WHITE = { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" };
  const PIECE_GLYPH_BLACK = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" };

  // Casillas que ataca UNA pieza (blanca o negra), respetando el borde de
  // la figura y el bloqueo de cualquier pieza ya colocada. `occupied` es un
  // Map casilla -> pieza (para saber dónde cortar un rayo).
  function pieceAttacks(shape, occupied, piece) {
    const { c, r, type } = piece;
    const within = (cc, rr) => shape.cells.has(key(cc, rr));
    const out = [];
    if (type === "n") {
      KNIGHT_OFFSETS.forEach(([dc, dr]) => { const cc = c + dc, rr = r + dr; if (within(cc, rr)) out.push([cc, rr]); });
    } else if (type === "k") {
      KING_OFFSETS.forEach(([dc, dr]) => { const cc = c + dc, rr = r + dr; if (within(cc, rr)) out.push([cc, rr]); });
    } else if (type === "r" || type === "b" || type === "q") {
      const dirs = type === "r" ? ROOK_DIRS : type === "b" ? BISHOP_DIRS : ROOK_DIRS.concat(BISHOP_DIRS);
      dirs.forEach(([dc, dr]) => {
        let cc = c + dc, rr = r + dr;
        while (within(cc, rr)) {
          out.push([cc, rr]);
          if (occupied.has(key(cc, rr))) break;
          cc += dc; rr += dr;
        }
      });
    } else if (type === "p") {
      // Peón blanco: ataca en diagonal "hacia adelante" (fila menor = arriba
      // de la figura, como se ve dibujada en la pantalla).
      [[-1, -1], [1, -1]].forEach(([dc, dr]) => { const cc = c + dc, rr = r + dr; if (within(cc, rr)) out.push([cc, rr]); });
    }
    return out;
  }

  // Evalúa un nivel dado un conjunto de colocaciones {piezaId: [c, r]} —
  // puede estar incompleto (piezas blancas todavía sin colocar).
  function evaluate(level, placements) {
    const occupied = new Map();
    level.negras.forEach((bp, i) => occupied.set(key(bp.c, bp.r), { color: "b", type: bp.type, c: bp.c, r: bp.r, id: "n" + i }));
    const colocadas = [];
    level.piezas.forEach((p) => {
      const pos = placements[p.id];
      if (!pos) return;
      const pieza = { id: p.id, type: p.type, color: "w", c: pos[0], r: pos[1] };
      occupied.set(key(pos[0], pos[1]), pieza);
      colocadas.push(pieza);
    });

    // Casillas que las negras atacan ahora mismo (con el bloqueo de lo ya colocado).
    const atacadasPorNegras = new Set();
    level.negras.forEach((bp) => {
      pieceAttacks(level.figura, occupied, { c: bp.c, r: bp.r, type: bp.type }).forEach(([cc, rr]) => atacadasPorNegras.add(key(cc, rr)));
    });

    // Una pieza blanca en una casilla atacada no ilumina nada (regla 1).
    const neutralizadas = colocadas.filter((p) => atacadasPorNegras.has(key(p.c, p.r))).map((p) => p.id);
    const iluminadas = new Set();
    colocadas.forEach((pieza) => {
      if (atacadasPorNegras.has(key(pieza.c, pieza.r))) return;
      pieceAttacks(level.figura, occupied, pieza).forEach(([cc, rr]) => iluminadas.add(key(cc, rr)));
    });

    // Casillas objetivo: las de la figura sin ninguna pieza encima.
    const objetivos = [];
    level.figura.cells.forEach((k) => { if (!occupied.has(k)) objetivos.push(k); });
    const faltantes = objetivos.filter((k) => !iluminadas.has(k));
    const todasColocadas = level.piezas.every((p) => Object.prototype.hasOwnProperty.call(placements, p.id));

    return {
      iluminadas, atacadasPorNegras, neutralizadas,
      objetivosTotal: objetivos.length,
      objetivosIluminados: objetivos.length - faltantes.length,
      todasColocadas,
      resuelto: todasColocadas && faltantes.length === 0,
    };
  }

  window.IluminaEngine = {
    parseShape, pieceAttacks, evaluate, key,
    PIECE_NAME, PIECE_GLYPH_WHITE, PIECE_GLYPH_BLACK,
  };
})();
