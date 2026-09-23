/* ===== Ajedrez Integral — La pieza que eligió el alumno, en TODOS los tableros =====
 * Configuración deja elegir tres cosas de la pieza: el tema divertido
 * (js/board-themes.js: emojis), el estilo (js/piece-style-themes.js: símbolo o
 * dibujo) y el color (js/piece-color-themes.js, que va por variables CSS y no
 * pasa por acá). Los tableros compartidos (js/clases-board.js y hermanos) ya
 * preguntaban por las dos primeras, pero cada ejercicio de Entrenamiento —
 * Mates, Temas, Aprender, el diagnóstico, Racha táctica, ¡Te reto!… — tenía su
 * propio GLYPH y dibujaba siempre el símbolo. O sea que el alumno elegía el
 * dibujo, lo veía en la clase en vivo, y al abrir un ejercicio volvía el
 * símbolo de siempre. No daba ningún error: el tablero se veía bien, solo que
 * no era el suyo.
 *
 * Esto es la ÚNICA respuesta a «¿cómo se pinta esta pieza?», escrita una vez:
 * con la decisión copiada en quince páginas, la siguiente que se escriba se
 * olvida de una de las tres ramas.
 *
 *   PiezaPreferida.pintar(span, tipo, color, { clase })
 *     tipo: "k"|"q"|"r"|"b"|"n"|"p" · color: "w"|"b"
 *     clase: clases de tamaño que la página quiere conservar en el span.
 *
 * Sin los módulos de preferencias cargados cae en el glifo de siempre, así que
 * una página que no los cargue se ve exactamente como antes.
 */
(function () {
  "use strict";

  const GLYPH = {
    w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
    b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
  };
  const INICIAL = { k: "R", q: "D", r: "T", b: "A", n: "C", p: "P" };

  function emoji(tipo) {
    return window.BoardThemes && window.BoardThemes.getEmoji ? window.BoardThemes.getEmoji(tipo) : null;
  }
  function dibujado() {
    return !!(window.PieceStyleThemes && window.PieceStyleThemes.esDibujado() && window.ChessPieceSVG);
  }

  // "emoji" | "dibujado" | "glifo": el mismo orden que ya seguía ClasesBoard.
  function modo() {
    if (emoji("k")) return "emoji";
    return dibujado() ? "dibujado" : "glifo";
  }

  function pintar(span, tipo, color, opts) {
    tipo = String(tipo).toLowerCase();
    color = color === "b" ? "b" : "w";
    const extra = opts && opts.clase ? opts.clase + " " : "";
    const e = emoji(tipo);
    span.textContent = "";
    if (e) {
      span.textContent = e;
      span.className = extra + "theme-token " + (color === "w" ? "theme-token-white" : "theme-token-black");
      const label = document.createElement("span");
      label.className = "theme-token-label";
      label.textContent = INICIAL[tipo] || "";
      label.setAttribute("aria-hidden", "true");
      span.appendChild(label);
    } else if (dibujado()) {
      span.innerHTML = window.ChessPieceSVG.markup(tipo, color);
      span.className = extra + "chess-piece-illustrated";
    } else {
      span.textContent = GLYPH[color][tipo] || "";
      span.className = extra + (color === "w" ? "piece-white" : "piece-black");
    }
    return span;
  }

  // Para quien arma el tablero con una cadena de HTML en vez de nodos.
  function html(tipo, color, opts) {
    const span = document.createElement("span");
    pintar(span, tipo, color, opts);
    if (opts && opts.oculta) span.setAttribute("aria-hidden", "true");
    return span.outerHTML;
  }

  window.PiezaPreferida = { GLYPH, modo, pintar, html };
})();
