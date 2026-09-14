/* ===== Niebla de Guerra — cálculo de visibilidad =====
 *
 * Ajedrez de toda la vida — mismas reglas, mismo motor (chess.js), sin
 * ningún cambio en cómo se mueve o se valida una jugada. Lo único distinto
 * es VISUAL: cada jugador solo ve las casillas que sus propias piezas
 * alcanzan a atacar o defender en la posición actual. El resto del tablero
 * queda cubierto por niebla — puede estar vacío o tener una pieza rival, no
 * hay forma de saberlo hasta que una pieza propia le "ponga los ojos
 * encima" (o hasta que se mueva ahí y descubra qué había).
 *
 * A propósito NO es Kriegspiel puro: en Kriegspiel clásico no ves ni tu
 * propio alcance, solo un árbitro te va dando pistas ("hay una captura
 * posible", "jaque desde tal dirección"). Acá, en cambio, cada jugador ve
 * exactamente lo mismo que verían las piezas de su propio color — más
 * jugable, menos frustrante, y de todos modos genuinamente distinto a
 * cualquier variante clásica: hay que deducir dónde puede estar el rival
 * combinando lo que se ve con lo que YA NO se ve (una casilla vigilada que
 * de repente deja de estarlo, un peón que "desaparece" del último lugar
 * donde se lo vio, etc.).
 *
 * Aviso de diseño (a propósito, documentado): el ocultamiento es solo
 * visual, del lado del cliente — la posición completa (fen) sigue
 * viajando entera por Supabase como en el resto del sitio (no hay validación
 * de reglas del lado del servidor en ninguna variante de Juegos), así que
 * un alumno que abra las herramientas de desarrollador podría leer el
 * tablero completo. Es el mismo modelo de confianza que ya tiene el resto
 * del sitio; para esta variante en particular (a diferencia de Duelo
 * Simultáneo, donde SÍ hace falta ocultar una jugada de un compromiso
 * criptográfico) no se justifica construir una función de servidor aparte
 * solo para filtrar el fen por jugador.
 */
window.NieblaGuerra = (function () {
  "use strict";

  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
  function rcToSquare(r, c) { return FILES[c] + (8 - r); }
  function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

  const KNIGHT_DELTAS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KING_DELTAS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  // Todas las casillas que ve UNA pieza propia parada en (r,c): su propia
  // casilla, más lo que alcanza a atacar o defender según su tipo. A
  // propósito NO es lo mismo que "jugadas legales de chess.js":
  //  - un peón vigila sus dos casillas diagonales aunque estén vacías (no
  //    solo cuando hay algo que capturar ahí);
  //  - una torre/alfil/dama SÍ "ve" (y por lo tanto revela) una casilla
  //    ocupada por una pieza propia que está defendiendo, algo que chess.js
  //    nunca ofrece como jugada legal (no se puede capturar la propia
  //    pieza) pero que un jugador real sabe que está ahí.
  //  - un caballo ve sus 8 casillas en L sin que lo bloquee nada de por medio
  //    (salta, como siempre en ajedrez).
  function squaresSeenByPiece(board, r, c, piece) {
    const seen = [rcToSquare(r, c)];
    const type = piece.type, color = piece.color;

    function ray(dirs) {
      dirs.forEach(([dr, dc]) => {
        let rr = r + dr, cc = c + dc;
        while (inBounds(rr, cc)) {
          seen.push(rcToSquare(rr, cc));
          if (board[rr][cc]) break; // una pieza (propia o rival) tapa lo que sigue del rayo
          rr += dr; cc += dc;
        }
      });
    }

    if (type === "n") {
      KNIGHT_DELTAS.forEach(([dr, dc]) => { if (inBounds(r + dr, c + dc)) seen.push(rcToSquare(r + dr, c + dc)); });
    } else if (type === "k") {
      KING_DELTAS.forEach(([dr, dc]) => { if (inBounds(r + dr, c + dc)) seen.push(rcToSquare(r + dr, c + dc)); });
    } else if (type === "b") {
      ray(BISHOP_DIRS);
    } else if (type === "r") {
      ray(ROOK_DIRS);
    } else if (type === "q") {
      ray(BISHOP_DIRS.concat(ROOK_DIRS));
    } else if (type === "p") {
      // board() usa la fila 0 = octava fila (rango 8); blancas avanzan
      // hacia la fila 0 (dr = -1), negras hacia la fila 7 (dr = +1).
      const dir = color === "w" ? -1 : 1;
      const startRow = color === "w" ? 6 : 1;
      // Diagonales: siempre visibles, haya o no una pieza para capturar.
      [[dir, -1], [dir, 1]].forEach(([dr, dc]) => {
        if (inBounds(r + dr, c + dc)) seen.push(rcToSquare(r + dr, c + dc));
      });
      // Adelante: la casilla justo enfrente siempre se ve (vacía o no); la
      // de dos casillas solo se ve si el peón sigue en su fila inicial Y
      // las dos casillas de por medio están libres (si no, no llegaría ahí).
      if (inBounds(r + dir, c)) {
        seen.push(rcToSquare(r + dir, c));
        if (!board[r + dir][c] && r === startRow && inBounds(r + 2 * dir, c) && !board[r + 2 * dir][c]) {
          seen.push(rcToSquare(r + 2 * dir, c));
        }
      }
    }
    return seen;
  }

  // Todas las casillas visibles para `color` en la posición actual de
  // `chess` (una instancia de Chess de chess.js) — unión de lo que ve cada
  // pieza propia. Devuelve un Set de nombres de casilla ("e4", etc.).
  function visibleSquaresFor(chess, color) {
    const board = chess.board();
    const visible = new Set();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.color === color) {
          squaresSeenByPiece(board, r, c, piece).forEach((sq) => visible.add(sq));
        }
      }
    }
    return visible;
  }

  return { visibleSquaresFor: visibleSquaresFor };
})();
