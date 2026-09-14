/* ===== Ajedrez Integral — Coordenadas sobre el tablero =====
 *
 * Los tableros de los ejercicios se dibujaban sin coordenadas, y sin ellas el
 * alumno no sabe hacia dónde avanza: si no ve dónde está la fila 1, tampoco sabe
 * para qué lado corren los peones ni cómo leer "e4" cuando el enunciado lo dice.
 *
 * Este ayudante escribe la letra de columna en la fila de abajo y el número de
 * fila en la columna de la izquierda, DENTRO de las casillas del borde — como en
 * Lichess —, así que no cambia el tamaño ni la maqueta de ninguna página.
 *
 * Uso: una sola línea por página, cuando el tablero ya existe en el documento.
 *
 *     Coordenadas.aplicar(document.getElementById('board'));
 *
 * A partir de ahí se vuelve a pintar solo: la página redibuja el tablero cuando
 * quiere (y muchas lo hacen en cada jugada) y un observador repone las etiquetas.
 * Funciona igual con el tablero girado —lee el nombre real de cada casilla, no
 * su posición— y con tableros que no son de 8×8, como el 4×4 de Entreno.
 *
 * Requisito: cada casilla debe llevar su nombre en `data-square` ("e4").
 */
window.Coordenadas = (function () {
  "use strict";

  const ESTILO_ID = "coordenadas-tablero-css";

  // El color de la etiqueta es el de la casilla contraria, que es lo que se lee
  // bien sobre ambas; el tamaño va en porcentaje del ancho de la casilla para
  // que encoja con el tablero en el celular.
  const CSS = `
    [data-square] { position: relative; }
    .coord-etiqueta {
      position: absolute;
      font-size: clamp(7px, 26%, 13px);
      font-weight: 700;
      line-height: 1;
      pointer-events: none;
      user-select: none;
      opacity: .85;
      font-family: 'Inter', system-ui, sans-serif;
    }
    .coord-columna { bottom: 4%; right: 5%; }
    .coord-fila { top: 4%; left: 5%; }
    .coord-sobre-clara { color: #486581; }
    .coord-sobre-oscura { color: #f0f4f8; }
    /* En modo de alto contraste del sistema, que las pinte el sistema. */
    @media (forced-colors: active) { .coord-etiqueta { color: CanvasText; } }
  `;

  function asegurarEstilo() {
    if (document.getElementById(ESTILO_ID)) return;
    const estilo = document.createElement("style");
    estilo.id = ESTILO_ID;
    estilo.textContent = CSS;
    document.head.appendChild(estilo);
  }

  function esClara(nombre) {
    return ((nombre.charCodeAt(0) - 97) + (parseInt(nombre.slice(1), 10) - 1)) % 2 === 1;
  }

  function etiqueta(casilla, texto, clase) {
    const span = document.createElement("span");
    span.className = "coord-etiqueta " + clase + " " + (esClara(casilla.dataset.square) ? "coord-sobre-clara" : "coord-sobre-oscura");
    span.textContent = texto;
    span.setAttribute("aria-hidden", "true");   // el nombre de la casilla ya está en data-square
    casilla.appendChild(span);
  }

  function pintar(tablero) {
    const casillas = [...tablero.querySelectorAll("[data-square]")];
    if (!casillas.length) return;
    const lado = Math.round(Math.sqrt(casillas.length));
    if (lado * lado !== casillas.length) return;   // no es una cuadrícula completa: se deja como está

    tablero.querySelectorAll(".coord-etiqueta").forEach((e) => e.remove());
    casillas.forEach((casilla, i) => {
      const nombre = casilla.dataset.square;
      if (!nombre || !/^[a-z]\d+$/.test(nombre)) return;
      const fila = Math.floor(i / lado), columna = i % lado;
      if (fila === lado - 1) etiqueta(casilla, nombre[0], "coord-columna");        // abajo: la letra
      if (columna === 0) etiqueta(casilla, nombre.slice(1), "coord-fila");         // izquierda: el número
    });
  }

  function aplicar(tablero) {
    if (!tablero || tablero.__coordenadas) return;
    asegurarEstilo();
    tablero.__coordenadas = true;
    // La página redibuja el tablero cuando quiere; las etiquetas se reponen
    // solas. El observador se desconecta mientras se pinta: si no, las propias
    // etiquetas que añade dispararían otra pasada, y otra, sin parar.
    const observador = new MutationObserver(repintar);
    function repintar() {
      observador.disconnect();
      pintar(tablero);
      observador.observe(tablero, { childList: true, subtree: true });
    }
    repintar();
  }

  return { aplicar, pintar };
})();
