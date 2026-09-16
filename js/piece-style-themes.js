/* ===== Ajedrez Integral — Estilo de las piezas =====
 * Preferencia por navegador (localStorage), UNA sola lista — a diferencia de
 * los colores, la forma de la pieza no necesita una versión distinta para
 * Modo Adaptado: se aplica igual en los dos modos.
 *
 * "clasico" son los glifos Unicode de siempre (♔♕♖♗♘♙): cada tablero sigue
 * dibujándolos exactamente como antes si se deja este tema elegido (es el
 * valor por defecto, así que no cambia nada para quien no toque esto).
 * "ilustrado" pide al tablero que dibuje la pieza con el set de arte vectorial
 * que ya usan los Cursos (js/chess-piece-svg.js) en vez del glifo de texto.
 *
 * No hay más opciones por ahora: un glifo Unicode no se puede "reformar" —su
 * silueta depende de la fuente del sistema, no de nada que el sitio controle—
 * y el único set de arte disponible sin depender de la red es el que ya
 * existe en el repo para Cursos. Sumar una tercera silueta pide arte nuevo.
 *
 * Cada tablero decide por su cuenta si sabe dibujar el estilo ilustrado
 * (revisando window.ChessPieceSVG) — este módulo solo guarda la preferencia.
 */
(function () {
  "use strict";

  const KEY = "piece_style_theme_v1";

  const THEMES = {
    clasico: { label: "Clásico (símbolos)" },
    ilustrado: { label: "Clásico ilustrado (dibujado)" },
  };

  function getPreference() {
    let id = "clasico";
    try {
      id = localStorage.getItem(KEY) || "clasico";
    } catch (e) {}
    return THEMES[id] ? id : "clasico";
  }

  function setPreference(id) {
    if (!THEMES[id]) id = "clasico";
    try {
      localStorage.setItem(KEY, id);
    } catch (e) {}
    return id;
  }

  window.PieceStyleThemes = { THEMES, getPreference, setPreference };
})();
