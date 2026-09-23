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
 * "aro" es el MISMO dibujo, con un aro del color contrario alrededor de cada
 * pieza (negro alrededor de las blancas, blanco alrededor de las negras). Es
 * para el celular con «Texto de alto contraste» encendido (Android, Samsung):
 * ese ajuste repinta TODO texto en blanco con borde negro, y como el glifo
 * ♚ es texto, las piezas negras salen blancas — el tablero se ve y no se sabe
 * de quién es cada pieza. No da ningún error y el sitio no lo puede detectar
 * (no es `forced-colors`), así que se elige a mano. Un dibujo SVG no es texto
 * y ese ajuste no lo toca; el aro es lo que la separa de su casilla sea cual
 * sea el color de esta.
 *
 * Los tableros preguntan esDibujado(), NUNCA por el id: con el id escrito en
 * cada tablero, un tercer estilo dibujado dejaría a la mitad dibujando el
 * glifo sin que nada fallara.
 *
 * Cada tablero decide por su cuenta si sabe dibujar el estilo ilustrado
 * (revisando window.ChessPieceSVG) — este módulo solo guarda la preferencia.
 */
(function () {
  "use strict";

  const KEY = "piece_style_theme_v1";

  const THEMES = {
    clasico: { label: "Clásico (símbolos)" },
    ilustrado: { label: "Clásico ilustrado (dibujado)", dibujado: true },
    aro: { label: "Dibujado con aro (celular en alto contraste)", dibujado: true },
  };

  // En Modo Adaptado, quien NUNCA eligió un estilo recibe el dibujado con
  // aro y no el glifo: ese modo se enciende por baja visión, que es justo
  // quien tiene encendido el «Texto de alto contraste» del celular, y ahí el
  // glifo negro sale blanco (con el contorno blanco del modo encima, además,
  // se ve brillando). Lo que la persona eligió a mano se respeta siempre.
  function modoAdaptado() {
    try {
      if (document.documentElement.classList.contains("adaptive-mode")) return true;
      return localStorage.getItem("oscarBlindMode_v1") === "1";
    } catch (e) {
      return false;
    }
  }

  function getPreference() {
    let id = null;
    try {
      id = localStorage.getItem(KEY);
    } catch (e) {}
    if (id && THEMES[id]) return id;
    return modoAdaptado() ? "aro" : "clasico";
  }

  function esDibujado() {
    return !!THEMES[getPreference()].dibujado;
  }

  // El aro lo decide el CSS (html[data-pieza="aro"]), no cada tablero: así
  // sale igual en los diez sin tocar ninguno.
  function aplicar(id) {
    try { document.documentElement.setAttribute("data-pieza", id); } catch (e) {}
  }

  function setPreference(id) {
    if (!THEMES[id]) id = "clasico";
    try {
      localStorage.setItem(KEY, id);
    } catch (e) {}
    aplicar(id);
    return id;
  }

  aplicar(getPreference());
  // Encender o apagar el modo cambia el estilo POR OMISIÓN: sin volver a
  // aplicarlo, el aro se quedaría puesto (o sin poner) hasta recargar.
  document.addEventListener("adaptivemode:change", function () {
    aplicar(getPreference());
  });
  window.PieceStyleThemes = { THEMES, getPreference, setPreference, esDibujado };
})();
