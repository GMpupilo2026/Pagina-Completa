/*
 * Ctrl + K (⌘ + K en Mac) desde cualquier página de la Academia: lleva al
 * buscador del panel (clases.html?buscar=…), que encuentra tarjetas y
 * personas. Si había texto seleccionado en la página, llega ya buscándolo:
 * seleccionar «María Rojas» en una lista y apretar Ctrl + K la busca.
 *
 * Lo pone herramientas/academia-cabecera.py en las páginas de la Academia,
 * menos en tres:
 *   - clases.html, que tiene su propio atajo y lleva al campo sin recargar;
 *   - sesion.html, porque salir de la clase en vivo tiene que cerrar antes la
 *     asistencia del alumno (lo hacen sus migas y su logo), y un atajo que
 *     cambia de página por su cuenta se la saltaría;
 *   - examen.html, porque salir del examen cuenta como salida y lo congela:
 *     un atajo no puede sacar a nadie de un examen sin querer.
 *
 * Solo Ctrl + K, no «/»: en estas páginas hay tableros, ejercicios y cuadros
 * de comandos donde «/» es parte de lo que se escribe.
 */
(function () {
  "use strict";
  if (window.AtajoBuscar) return;
  window.AtajoBuscar = true;

  var arriba = (document.currentScript && document.currentScript.getAttribute("data-arriba")) || "";

  document.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || String(e.key).toLowerCase() !== "k") return;
    e.preventDefault();
    var sel = "";
    try { sel = String(window.getSelection ? window.getSelection() : "").trim().replace(/\s+/g, " ").slice(0, 80); } catch (err) {}
    window.location.href = arriba + "clases.html?buscar=" + encodeURIComponent(sel);
  });
})();
