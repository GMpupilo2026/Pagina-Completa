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

  /* Encender el modo tiene que AVISAR. Cinco páginas de Entrenamiento traen su
     propio interruptor ("🔊 Adaptado") y guardan en esta misma clave, pero cada
     una llevaba su variable aparte: apretarlo escribía la preferencia y NO
     encendía la clase del <html>, así que todo lo que cuelga de ella —el
     recuadro donde se escribe la jugada, los atajos del tablero, el contraste—
     se quedaba apagado hasta recargar la página. No daba ningún error: el botón
     se marcaba como activado y la mitad del modo adaptado no llegaba.
     Ahora la clase la pone esta función y sale un evento, así que cualquier
     pieza del sitio se entera en el momento sin tener que preguntar cada tanto.
     Vale también entre pestañas, más abajo, por la misma razón. */
  function applyMode(on) {
    var antes = document.documentElement.classList.contains("adaptive-mode");
    document.documentElement.classList.toggle("adaptive-mode", !!on);
    updateToggleUI();
    if (antes === !!on) return;
    try {
      document.dispatchEvent(new CustomEvent("adaptivemode:change", { detail: { activo: !!on } }));
    } catch (e) {}
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
      reason + " Puedes volver al modo visual cuando quieras desde el botón en la parte superior de la página.";
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
      announceAutoSwitchWhenReady("Detectamos que navegas con el teclado: se activó el modo adaptado.");
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

  /* ---- En el celular se PREGUNTA, una sola vez ----
     Las dos señales de arriba no llegan nunca en un teléfono: con TalkBack o
     VoiceOver no hay tecla Tab, y "aumentar contraste" casi nadie lo tiene
     puesto. O sea que en el celular el modo arrancaba SIEMPRE apagado, y quien
     no ve la pantalla tenía que encontrar solo un botón de 36 px en el
     encabezado cuyo nombre no puede adivinar. No daba ningún error: el alumno
     simplemente no encontraba cómo entrenar.
     Así que en un aparato táctil, mientras la preferencia no esté definida, se
     pone lo primero de la página —justo después de "Saltar al contenido", que
     es por donde empieza quien recorre la página deslizando el dedo— una
     pregunta con dos botones. Cualquiera de las dos respuestas se guarda, así
     que no vuelve a salir. Solo en aparatos táctiles: en la computadora ya
     funciona la detección por Tab, y un cartel de más en cada página es la
     clase de cosa que se deja de leer. */
  function esTactil() {
    try {
      return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches &&
        !window.matchMedia("(pointer: fine)").matches);
    } catch (e) {
      return false;
    }
  }
  function ofrecerEnCelular() {
    if (getStored() !== null || !esTactil() || !document.body) return;
    if (document.getElementById("am-oferta")) return;
    if (!document.getElementById("theme-toggle")) return;   // documentos sueltos sin encabezado del sitio
    var st = document.createElement("style");
    st.textContent =
      "#am-oferta{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:.5rem;" +
      "padding:.75rem 1rem;background:#102a43;color:#fff;font-size:1rem;line-height:1.4;text-align:center}" +
      "#am-oferta p{margin:0;flex:1 1 100%}" +
      "#am-oferta button{min-height:44px;padding:.5rem 1rem;border-radius:.5rem;font-weight:700;font-size:1rem;" +
      "border:2px solid #f0b429;cursor:pointer}" +
      "#am-oferta .am-si{background:#f0b429;color:#102a43}#am-oferta .am-no{background:transparent;color:#fff}";
    document.head.appendChild(st);
    var caja = document.createElement("section");
    caja.id = "am-oferta";
    caja.setAttribute("aria-labelledby", "am-oferta-texto");
    var p = document.createElement("p");
    p.id = "am-oferta-texto";
    p.textContent = "¿Usas lector de pantalla (TalkBack o VoiceOver)? El modo adaptado te deja entrenar escribiendo las jugadas y oyendo el tablero.";
    var si = document.createElement("button");
    si.type = "button";
    si.className = "am-si";
    si.textContent = "Sí, activar el modo adaptado";
    var no = document.createElement("button");
    no.type = "button";
    no.className = "am-no";
    no.textContent = "No, gracias";
    caja.appendChild(p);
    caja.appendChild(si);
    caja.appendChild(no);
    var salto = document.querySelector('a[href="#main-content"]');
    if (salto && salto.parentNode === document.body) document.body.insertBefore(caja, salto.nextSibling);
    else document.body.insertBefore(caja, document.body.firstChild);
    function responder(on) {
      set(on);
      caja.remove();
      var nota = document.createElement("div");
      nota.setAttribute("role", "status");
      nota.className = "sr-only";
      document.body.appendChild(nota);
      setTimeout(function () {
        nota.textContent = on
          ? "Listo: se activó el modo adaptado. Se puede apagar con el botón «Modo adaptado» de arriba."
          : "Entendido: se queda el modo visual. Se puede cambiar con el botón «Modo adaptado» de arriba.";
      }, 60);
      setTimeout(function () { nota.remove(); }, 5000);
      // El foco no puede quedarse en un botón que ya no existe.
      var destino = document.getElementById("main-content") || document.querySelector("main");
      if (destino) {
        if (!destino.hasAttribute("tabindex")) destino.setAttribute("tabindex", "-1");
        destino.focus();
      }
    }
    si.addEventListener("click", function () { responder(true); });
    no.addEventListener("click", function () { responder(false); });
  }

  function alCargar() {
    injectToggle();
    ofrecerEnCelular();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", alCargar);
  } else {
    alCargar();
  }

  /* Si el modo se cambia en OTRA pestaña, esta se entera: la preferencia es del
     navegador, así que dos pestañas abiertas del mismo ejercicio no pueden
     quedar una en cada modo — quien lo encendió en una y vuelve a la otra
     encuentra el recuadro apagado y cree que no funciona. */
  window.addEventListener("storage", function (e) {
    if (e && e.key === KEY) applyMode(isOn());
  });

  window.AdaptiveMode = { isOn: isOn, set: set };
})();
