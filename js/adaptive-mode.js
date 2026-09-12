/* ===== Ajedrez Integral — Modo Adaptado (Visual / Lector de pantalla) =====
 *
 * Reutiliza la misma clave de localStorage que ya usan Tablero, 4×4,
 * Aprender, Coordenadas y Practicar ("oscarBlindMode_v1") para que elegir
 * el modo en cualquiera de esas páginas — o desde el interruptor que este
 * archivo agrega en el header de todas las demás — quede recordado en
 * TODO el sitio, no solo en la página donde se eligió.
 *
 * En esas 5 páginas el "modo adaptado" reemplaza por completo la forma de
 * interactuar (clic en el tablero -> escribir la casilla, con cada jugada
 * anunciada por voz) porque ahí sí hace falta: el tablero es visual y
 * espacial. Este archivo NO les agrega un segundo interruptor (ya tienen
 * el suyo, mucho más rico) — solo comparte con ellas la detección
 * automática y la clave de preferencia.
 *
 * En el resto del sitio (artículos, cursos, paneles) el contenido ya es
 * texto normal: un lector de pantalla real lo lee igual sin importar el
 * CSS, siempre que el HTML tenga buena semántica (por eso el trabajo de
 * accesibilidad real pasa por los landmarks, las etiquetas y el orden,
 * no por un "modo" visual). Lo que SÍ cambia con este interruptor ahí es
 * una capa de "modo lectura" (texto más grande, más contraste, sin
 * animaciones) que ayuda de verdad a baja visión y a quien navega solo
 * con teclado, y es inofensiva para quien usa lector de pantalla (no le
 * cambia nada, porque el screen reader no percibe el CSS).
 *
 * Detección automática — límite honesto: no existe ninguna API del
 * navegador para saber con certeza si hay un lector de pantalla activo
 * (es así a propósito, por privacidad). Se usan dos señales, ninguna
 * certera del todo, pero suficientes para no obligar a nadie a buscar el
 * interruptor a mano:
 *   1. Preferencia del sistema operativo (prefers-contrast: more) — si la
 *      persona ya tiene activado "Aumentar contraste" (macOS) o un
 *      equivalente, el navegador lo informa desde el primer instante.
 *   2. Comportamiento: si la persona empieza a navegar con la tecla Tab
 *      antes de tocar el mouse o la pantalla, es un indicio fuerte de que
 *      usa tecnología de asistencia o depende del teclado.
 * En cualquiera de los dos casos, si todavía no había elegido ningún modo
 * antes, se activa Adaptado solo. Sigue siendo una aproximación, no una
 * certeza — y es independiente de "forced-colors" (Windows con un tema de
 * contraste alto activado), que se resuelve aparte en css/styles.css
 * porque ahí el problema es distinto: no falta contraste, sino que Windows
 * podría aplanar los colores del propio tablero de ajedrez.
 */
(function () {
  "use strict";

  var KEY = "oscarBlindMode_v1";

  function getStored() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }
  function setStored(on) {
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch (e) {}
  }

  function isOn() {
    return getStored() === "1";
  }

  var toggleBtn = null;

  function applyMode(on) {
    document.documentElement.classList.toggle("adaptive-mode", !!on);
    updateToggleUI();
  }

  function updateToggleUI() {
    if (!toggleBtn) return;
    var on = isOn();
    toggleBtn.innerHTML = '<span aria-hidden="true">' + (on ? "🦯" : "👁️") + "</span>";
    toggleBtn.setAttribute(
      "aria-label",
      on ? "Modo adaptado activado — volver al modo visual" : "Activar el modo adaptado para lector de pantalla"
    );
    toggleBtn.setAttribute("aria-pressed", on ? "true" : "false");
    toggleBtn.title = on
      ? "Modo adaptado (lector de pantalla) — clic para volver al modo visual"
      : "Modo visual — clic para activar el modo adaptado";
  }

  function set(on) {
    setStored(on);
    applyMode(on);
  }

  function announceAutoSwitch(reason) {
    var note = document.createElement("div");
    note.setAttribute("role", "status");
    note.setAttribute("aria-live", "polite");
    note.className = "sr-only";
    note.textContent =
      reason + " Podés volver al modo visual cuando quieras desde el botón en la parte superior de la página.";
    document.body.appendChild(note);
    setTimeout(function () {
      note.remove();
    }, 4000);
  }
  function announceAutoSwitchWhenReady(reason) {
    if (document.body) announceAutoSwitch(reason);
    else document.addEventListener("DOMContentLoaded", function () { announceAutoSwitch(reason); }, { once: true });
  }

  // ---- Detección por comportamiento (ver nota arriba) ----
  function onFirstTab(e) {
    if (e.key === "Tab" && getStored() === null) {
      setStored(true);
      applyMode(true);
      announceAutoSwitchWhenReady("Detectamos que navegás con el teclado: se activó el modo adaptado.");
    }
    cleanupDetection();
  }
  function onPointer() {
    cleanupDetection();
  }
  function cleanupDetection() {
    document.removeEventListener("keydown", onFirstTab, true);
    document.removeEventListener("mousedown", onPointer, true);
    document.removeEventListener("touchstart", onPointer, true);
  }
  // ---- Detección por preferencia del sistema operativo: contraste alto ----
  // A diferencia de la detección por teclado (que espera a la primera
  // interacción), esta preferencia ya se sabe desde el primer instante —
  // "Aumentar contraste" en macOS, o equivalentes en Windows/navegador que
  // se traducen en "prefers-contrast: more" sin imponer una paleta fija
  // (eso es "forced-colors", una señal distinta, resuelta aparte en
  // css/styles.css para que el propio tablero de ajedrez no pierda la
  // distinción entre casillas claras y oscuras). Como Modo Adaptado ya trae
  // texto más grande, más contraste y foco bien marcado, activarlo solo es
  // justo lo que esa preferencia pide — se aplica de una vez, antes de
  // pintar la página, igual que el modo oscuro (prefers-color-scheme).
  function prefersHighContrast() {
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-contrast: more)").matches);
    } catch (e) {
      return false;
    }
  }
  if (getStored() === null && prefersHighContrast()) {
    setStored(true);
    cleanupDetection(); // ya se sabe que conviene Adaptado: no hace falta esperar el primer Tab
    announceAutoSwitchWhenReady("Detectamos que tu computadora tiene activado el contraste alto: se activó el modo adaptado.");
  }

  // Solo tiene sentido escuchar si la preferencia todavía no está definida.
  if (getStored() === null) {
    document.addEventListener("keydown", onFirstTab, true);
    document.addEventListener("mousedown", onPointer, true);
    document.addEventListener("touchstart", onPointer, true);
  }

  // Aplica el modo ya guardado lo antes posible (este script se carga en el
  // <head>, antes de pintar la página) para no mostrar primero el modo
  // visual y "saltar" al adaptado un instante después.
  applyMode(isOn());

  // El interruptor en el header se agrega solo en páginas que no traigan ya
  // el suyo propio (Tablero, 4×4, Aprender, Coordenadas, Practicar tienen
  // "mode-blind-btn" con una interacción completa, no un simple botón).
  function injectToggle() {
    if (document.getElementById("mode-blind-btn")) {
      updateToggleUI(); // no hay botón propio que actualizar, pero no está de más
      return;
    }
    var themeBtn = document.getElementById("theme-toggle");
    if (!themeBtn || !themeBtn.parentElement) return;
    toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.id = "adaptive-toggle";
    toggleBtn.className = themeBtn.className;
    themeBtn.parentElement.insertBefore(toggleBtn, themeBtn);
    toggleBtn.addEventListener("click", function () {
      set(!isOn());
    });
    updateToggleUI();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectToggle);
  } else {
    injectToggle();
  }

  window.AdaptiveMode = { isOn: isOn, set: set };
})();
