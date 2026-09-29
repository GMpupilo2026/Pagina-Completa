/* La dificultad que se ajusta sola.
 *
 * Ejercicios por tema arranca cada tema cerca del nivel del alumno (el Elo del
 * diagnóstico, o lo que eligió en el selector), pero después se quedaba ahí:
 * al que le salía todo seguía con ejercicios que ya no le enseñaban nada, y al
 * que se trababa le seguían tocando más difíciles, porque el tema viene
 * ordenado de menor a mayor. Entrenando solo, nadie le decía «sube» o «baja».
 *
 * La regla es corta y se dice en pantalla cuando se aplica:
 *   - SUBIR_CON limpios seguidos (sin error ni pista) → un escalón más arriba.
 *   - BAJAR_CON con error o pista entre los últimos VENTANA → uno más abajo.
 * Tras cada cambio la cuenta vuelve a cero: el escalón nuevo se mide solo.
 *
 * Esto solo cuenta; qué es un escalón lo dice la página (sus opciones del
 * selector), y la página decide cuándo NO ajustar (el repaso, un tema sin
 * rating, o una dificultad que fijó la tarea del profesor).
 */
window.DificultadAdaptable = (function () {
  "use strict";

  const SUBIR_CON = 5;
  const VENTANA = 4;
  const BAJAR_CON = 3;

  function crear() {
    let hist = [];
    return {
      /* Anota un ejercicio terminado y dice si toca cambiar: "subir", "bajar" o null. */
      registrar(limpio) {
        hist.push(!!limpio);
        if (hist.length >= SUBIR_CON && hist.slice(-SUBIR_CON).every(Boolean)) { hist = []; return "subir"; }
        const ultimos = hist.slice(-VENTANA);
        if (ultimos.length === VENTANA && ultimos.filter((x) => !x).length >= BAJAR_CON) { hist = []; return "bajar"; }
        return null;
      },
      reiniciar() { hist = []; },
    };
  }

  /* El escalón vecino dentro de `opciones` (ordenadas de menor a mayor). En
     un extremo devuelve el mismo: no hay adónde ir. */
  function escalon(opciones, actual, cambio) {
    const i = opciones.indexOf(actual);
    if (i < 0) return actual;
    const j = cambio === "subir" ? Math.min(i + 1, opciones.length - 1) : Math.max(i - 1, 0);
    return opciones[j];
  }

  return { crear, escalon, SUBIR_CON, VENTANA, BAJAR_CON };
})();
