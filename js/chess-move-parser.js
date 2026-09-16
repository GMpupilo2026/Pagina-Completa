/**
 * Ajedrez Integral — interpretar una jugada escrita a mano.
 *
 * Para quienes usan lector de pantalla, navegar las 64 casillas del tablero
 * jugada a jugada puede ser lento; este módulo interpreta lo que se escribe
 * en un recuadro de texto (notación algebraica en español o en inglés, con
 * tolerancia a errores comunes de tipeo) igual que si se hubiera hecho clic
 * en el tablero. Extraído de js/tablero-board.js (que sigue con su propia
 * copia — no vale la pena arriesgar esa página, ya en producción, por una
 * refactorización) para que las páginas de Juegos (Estándar, Niebla de
 * Guerra, y las que sigan) lo reutilicen sin duplicar la lógica de nuevo.
 *
 * Uso: ChessMoveParser.tryParseMove(game, texto) — `game` es la instancia de
 * chess.js sobre la que se intenta la jugada; devuelve el objeto de jugada
 * de chess.js si alguna variante del texto resultó válida, o null si ninguna.
 */
window.ChessMoveParser = (function () {
  "use strict";

  const ES_TO_EN_PIECE = { T: "R", C: "N", A: "B", D: "Q", R: "K" };
  const SAN_PIECE_LETTERS = "NBRQKTCAD"; // letras de pieza válidas en inglés o español (mayúsculas)

  function mapSpanishPieceLetter(letter) {
    return ES_TO_EN_PIECE[letter.toUpperCase()] || letter.toUpperCase();
  }

  // A partir de lo que escribió la persona, genera una lista de variantes razonables a
  // intentar (siempre probando primero el texto tal cual lo escribió): letras de pieza en
  // español traducidas al inglés que usa chess.js, mayúscula inicial si se escribió en
  // minúscula, "x" de captura insertada si se omitió, sufijo de promoción "=Q" si falta, y
  // "0-0"/"0-0-0" con ceros interpretados como enroque.
  function generateMoveCandidates(raw) {
    let s = String(raw || "").trim();
    s = s.replace(/^\d+\.(\.\.)?\s*/, ""); // por si copian "14. Cf3" o "14...Cf3"
    s = s.replace(/\s+/g, "");
    if (!s) return [];

    const candidates = new Set();
    candidates.add(s);

    if (/^0-0-0[+#]?$/.test(s) || /^0-0[+#]?$/.test(s)) candidates.add(s.replace(/0/g, "O"));

    const first = s[0];
    if (first && SAN_PIECE_LETTERS.indexOf(first.toUpperCase()) !== -1 && s.length >= 3) {
      candidates.add(first.toUpperCase() + s.slice(1));
      candidates.add(mapSpanishPieceLetter(first) + s.slice(1));
    }

    const promoMatch = s.match(/=([a-zA-Z])([+#]?)$/);
    if (promoMatch) {
      candidates.add(s.replace(/=([a-zA-Z])([+#]?)$/, "=" + mapSpanishPieceLetter(promoMatch[1]) + promoMatch[2]));
    }

    const expanded = new Set(candidates);
    for (const c of candidates) {
      const pawnCaptureNoX = c.match(/^([a-h])([a-h])([1-8])([+#]?)$/);
      if (pawnCaptureNoX) expanded.add(`${pawnCaptureNoX[1]}x${pawnCaptureNoX[2]}${pawnCaptureNoX[3]}${pawnCaptureNoX[4]}`);

      const pieceNoX = c.match(/^([NBRQK])([a-h])([1-8])([+#]?)$/);
      if (pieceNoX) expanded.add(`${pieceNoX[1]}x${pieceNoX[2]}${pieceNoX[3]}${pieceNoX[4]}`);

      const pieceDisambigNoX = c.match(/^([NBRQK])([a-h1-8])([a-h])([1-8])([+#]?)$/);
      if (pieceDisambigNoX) {
        expanded.add(`${pieceDisambigNoX[1]}${pieceDisambigNoX[2]}x${pieceDisambigNoX[3]}${pieceDisambigNoX[4]}${pieceDisambigNoX[5]}`);
      }

      const pawnPromoNoSuffix = c.match(/^([a-h](x[a-h])?[18])([+#]?)$/);
      if (pawnPromoNoSuffix && !/=/.test(c)) expanded.add(`${pawnPromoNoSuffix[1]}=Q${pawnPromoNoSuffix[3]}`);
    }

    return Array.from(expanded);
  }

  function tryParseMove(game, raw) {
    const candidates = generateMoveCandidates(raw);
    for (const candidate of candidates) {
      let result = null;
      try {
        result = game.move(candidate, { sloppy: true });
      } catch (e) {}
      if (result) return result;
    }
    return null;
  }

  return { tryParseMove, generateMoveCandidates };
})();
