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
 * (es así a propósito, por privacidad). La señal disponible más confiable
 * es de comportamiento: si la persona empieza a navegar con la tecla Tab
 * antes de tocar el mouse o la pantalla, es un indicio fuerte de que usa
 * tecnología de asistencia o depende del teclado — y en ese caso, si
 * todavía no había elegido ningún modo antes, se activa Adaptado solo.
 * Sigue siendo una aproximación, no una certeza.
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

  function announceAutoSwitch() {
    var note = document.createElement("div");
    note.setAttribute("role", "status");
    note.setAttribute("aria-live", "polite");
    note.className = "sr-only";
    note.textContent =
      "Detectamos que navegás con el teclado: se activó el modo adaptado. Podés volver al modo visual cuando quieras desde el botón en la parte superior de la página.";
    document.body.appendChild(note);
    setTimeout(function () {
      note.remove();
    }, 4000);
  }

  // ---- Detección por comportamiento (ver nota arriba) ----
  function onFirstTab(e) {
    if (e.key === "Tab" && getStored() === null) {
      setStored(true);
      applyMode(true);
      if (document.body) announceAutoSwitch();
      else document.addEventListener("DOMContentLoaded", announceAutoSwitch, { once: true });
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
