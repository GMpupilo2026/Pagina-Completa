/**
 * Ajedrez Integral — fluidez del tablero en partida.
 *
 * Cada tablero del sitio (ver niebla-board.js y hermanos) redibuja las 64
 * casillas ENTERAS en cada jugada — es lo más simple de mantener, pero de
 * regalo la pieza "aparece" de golpe en su casilla nueva en vez de
 * deslizarse, y no queda ninguna marca de cuál fue la última jugada. Eso es
 * justo lo que se nota al lado de un tablero como el de lichess.
 *
 * Este archivo no sabe nada de ajedrez más allá de leer una FEN: compara la
 * posición anterior con la nueva y deduce de qué casilla a cuál se movió la
 * pieza, así que sirve para cualquier tablero que use notación FEN estándar
 * (los ocho campos de rango separados por "/", con o sin el sufijo "[...]"
 * de la reserva de Crazyhouse). No sirve para los motores de variante.html
 * (Abrazos, Camaleón) cuyas piezas se fusionan y no tienen un solo carácter
 * por casilla — ahí no se usa.
 *
 * Uso, desde el loadFen()/load() de un tablero:
 *   const diff = BoardFluid.diffMove(fenAnterior, fenNueva);
 *   // ... this.game.load(fenNueva); this.render(); ...
 *   if (diff) BoardFluid.slide(this.boardEl, diff.from, diff.to, this.flipped);
 */
window.BoardFluid = (function () {
  "use strict";

  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

  function parseBoard(fen) {
    if (!fen) return null;
    const placement = fen.split(" ")[0].replace(/\[.*\]$/, "");
    const ranks = placement.split("/");
    if (ranks.length !== 8) return null;
    const map = {}; // "e4" -> "P" | "p" | ... (mayúscula = blancas)
    ranks.forEach((rankStr, i) => {
      const rank = 8 - i;
      let file = 0;
      for (const ch of rankStr) {
        if (ch >= "1" && ch <= "8") { file += Number(ch); continue; }
        if (file < 8) map[FILES[file] + rank] = ch;
        file += 1;
      }
    });
    return map;
  }

  function sameColor(a, b) {
    if (!a || !b) return false;
    return (a === a.toUpperCase()) === (b === b.toUpperCase());
  }

  /**
   * Compara dos posiciones y devuelve { from, to } — o null si no se pudo
   * deducir una sola jugada de tablero (por ejemplo, una ficha que sale de
   * la reserva de Crazyhouse no tiene "de dónde" en el tablero: ahí se
   * devuelve { from: null, to } para poder al menos marcar dónde cayó).
   */
  function diffMove(oldFen, newFen) {
    const before = parseBoard(oldFen);
    const after = parseBoard(newFen);
    if (!before || !after) return null;

    const vacated = [], occupied = [];
    FILES.forEach((f) => {
      for (let rank = 1; rank <= 8; rank++) {
        const sq = f + rank;
        const a = before[sq] || null;
        const b = after[sq] || null;
        if (a && a !== b) vacated.push(sq);
        if (b && b !== a) occupied.push(sq);
      }
    });

    const fromOnly = vacated.filter((sq) => occupied.indexOf(sq) === -1);

    if (fromOnly.length === 0 && occupied.length === 1) {
      return { from: null, to: occupied[0] }; // pieza soltada desde la reserva
    }
    if (fromOnly.length === 1 && occupied.length === 1) {
      return { from: fromOnly[0], to: occupied[0] };
    }
    if (fromOnly.length > 1 && occupied.length === 1) {
      const to = occupied[0];
      const match = fromOnly.find((sq) => sameColor(before[sq], after[to]));
      return match ? { from: match, to: to } : null;
    }
    if (fromOnly.length === 1 && occupied.length > 1) {
      const from = fromOnly[0];
      const to = occupied.find((sq) => sameColor(before[from], after[sq]));
      return to ? { from: from, to: to } : null;
    }
    if (fromOnly.length === 2 && occupied.length === 2) {
      // Enroque: de las dos piezas que se movieron, la que era el rey.
      for (const from of fromOnly) {
        if (before[from] && before[from].toLowerCase() === "k") {
          const to = occupied.find((sq) => after[sq] && after[sq].toLowerCase() === "k" && sameColor(before[from], after[sq]));
          if (to) return { from: from, to: to };
        }
      }
    }
    return null;
  }

  /**
   * Desliza la pieza que quedó en `to` desde donde estaba `from` — técnica
   * FLIP: se la posiciona con un transform (sin transición) donde "se vería"
   * si todavía estuviera en `from`, y en el siguiente cuadro se deja que la
   * transición la lleve de vuelta a su lugar de verdad. `boardEl` necesita
   * casillas con `data-square` y la pieza como único hijo de la casilla.
   */
  function slide(boardEl, from, to, flipped) {
    if (!boardEl || !from || !to || from === to) return;
    const toCell = boardEl.querySelector('[data-square="' + to + '"]');
    if (!toCell) return;
    // Por clase y no por "primer hijo": la casilla puede llevar además una
    // marca de "última jugada" u otro adorno como hermano de la pieza.
    const piece = toCell.querySelector(".piece-white, .piece-black, .chess-piece-illustrated");
    if (!piece) return;
    const fileOf = (sq) => FILES.indexOf(sq[0]);
    const rankOf = (sq) => Number(sq[1]);
    let dCols = fileOf(from) - fileOf(to);
    let dRows = rankOf(to) - rankOf(from);
    if (flipped) { dCols = -dCols; dRows = -dRows; }
    if (!dCols && !dRows) return;
    const rect = toCell.getBoundingClientRect();
    piece.style.transition = "none";
    piece.style.transform = "translate(" + (dCols * rect.width) + "px," + (dRows * rect.height) + "px)";
    // Fuerza al navegador a "confirmar" esa posición de arranque antes de
    // soltar la transición — si no, colapsa las dos asignaciones en un
    // solo cuadro y no se ve ningún movimiento.
    void piece.getBoundingClientRect();
    requestAnimationFrame(() => {
      piece.style.transition = "transform 0.12s ease-out";
      piece.style.transform = "";
    });
    piece.addEventListener("transitionend", () => { piece.style.transition = ""; }, { once: true });
  }

  return { diffMove: diffMove, slide: slide };
})();
