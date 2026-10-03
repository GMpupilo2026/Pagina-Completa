/* ===== Ajedrez Integral — El tablero cabe en la pantalla =====
 *
 * Un tablero con solo un ancho máximo (420 px) se corta por abajo en una
 * pantalla baja: una computadora de 1366 × 768 con el navegador a 125 %, o
 * una laptop con la barra de tareas, deja menos de 600 px de alto, y entre el
 * encabezado, el título y la descripción el tablero empezaba a la mitad y
 * terminaba debajo del borde. Se veía la fila 1 y no la 8.
 *
 * Este módulo mide el alto que de verdad queda y se lo pasa al tablero como
 * la variable --alto-cabe. El tamaño máximo lo sigue poniendo la página, que
 * solo la usa como un tope más:
 *
 *   max-width: min(420px, var(--alto-cabe, 420px));
 *
 * Se activa con el atributo data-cabe en el tablero. Sin el módulo (o sin JS)
 * la variable no existe y el tablero queda como antes.
 *
 * Cómo se elige el tamaño:
 *  1. Que entre todo sin bajar: del borde de arriba del tablero hasta el de
 *     abajo de la ventana, menos lo que ocupan las coordenadas de abajo.
 *  2. Si así quedaría más chico que MINIMO (la pantalla es muy baja, o arriba
 *     hay mucho texto), que entre entero al bajar hasta él: el alto de la
 *     ventana menos el encabezado fijo y el renglón «Juegan las negras.».
 *     Achicarlo más lo dejaría ilegible; mejor bajar un poco.
 */
(function () {
  "use strict";

  const MINIMO = 260;   // px: menos que esto, las piezas ya no se distinguen.
  const ABAJO = 30;     // px: las coordenadas de abajo (18) y un poco de aire.
  const ARRIBA = 40;    // px: el renglón de arriba del tablero, si se baja hasta él.

  function altoEncabezado() {
    const h = document.getElementById("header");
    if (!h) return 0;
    const pos = getComputedStyle(h).position;
    return pos === "sticky" || pos === "fixed" ? h.getBoundingClientRect().height : 0;
  }

  function ajustar(tablero) {
    const r = tablero.getBoundingClientRect();
    // Escondido (otra vista de la página): no hay nada que medir.
    if (!r.width && !r.height) return;
    const alto = window.innerHeight;
    const arriba = r.top + window.scrollY;   // en el documento: no cambia al bajar
    let cabe = alto - arriba - ABAJO;
    if (cabe < MINIMO) cabe = alto - altoEncabezado() - ARRIBA - ABAJO;
    cabe = Math.max(MINIMO, Math.floor(cabe));
    const valor = cabe + "px";
    // Solo si cambia: el ResizeObserver de abajo vuelve a llamar al cambiar el
    // tablero, y así se detiene en la segunda vuelta.
    if (tablero.style.getPropertyValue("--alto-cabe") !== valor) {
      tablero.style.setProperty("--alto-cabe", valor);
    }
  }

  let pendiente = false;
  function ajustarTodos() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => {
      pendiente = false;
      document.querySelectorAll("[data-cabe]").forEach(ajustar);
    });
  }

  function iniciar() {
    ajustarTodos();
    window.addEventListener("resize", ajustarTodos);
    window.addEventListener("orientationchange", ajustarTodos);
    // Cambia lo que hay arriba del tablero (se abre un ejercicio, la
    // descripción ocupa otro renglón, aparece la posición A de Siete
    // diferencias): cambia el alto de la página.
    if (window.ResizeObserver) new ResizeObserver(ajustarTodos).observe(document.body);
  }

  window.TableroCabe = { ajustar: ajustarTodos };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
