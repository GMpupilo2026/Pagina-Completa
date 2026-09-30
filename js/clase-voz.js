/* ===== Ajedrez Integral — «Activar voz» en la clase en vivo =====
 *
 * Todo lo que pasa en la clase ya se escribe en regiones vivas (`aria-live`,
 * `role="status"`): «Se jugó torre david 1», «¡El profesor te dio el control!»,
 * la pregunta que aparece, el tiempo que se acaba… Un lector de pantalla las
 * lee solas. Pero quien ve poco muchas veces NO usa lector: agranda la letra y
 * se acerca a la pantalla, y el tablero cambia sin que se entere. Este botón
 * hace que el propio navegador (Web Speech API, `BlindNotation.speak`) diga en
 * voz alta esas mismas regiones.
 *
 * Tres decisiones que no conviene deshacer:
 *
 * 1. SE LEE LO QUE YA SE ANUNCIA, NO UNA LISTA PROPIA. No hay un segundo juego
 *    de textos «para la voz»: se escuchan las regiones vivas de la página con un
 *    MutationObserver. Un aviso nuevo de la clase, si se escribe en una región
 *    viva (como debe, para el lector), se oye también acá sin tocar nada.
 *
 * 2. SOLO LO QUE ESTÁ A LA VISTA DE ESA PERSONA. Una región dentro de un panel
 *    escondido (el del profe, cuando entra un alumno) no habla, igual que no la
 *    leería un lector. La excepción es el aviso del recuadro de comandos
 *    (`.cc-msg`): fuera del Modo Adaptado el recuadro no se ve, pero sus avisos
 *    son justo las jugadas del profesor, lo primero que necesita oír quien ve
 *    poco. Ahí manda que se vea el lugar donde está montado.
 *
 * 3. LO QUE LLEGA JUNTO SE DICE EN FILA, NO CORTADO. `BlindNotation.speak`
 *    normal corta la frase anterior; acá se encola (`encolar: true`), para que
 *    la jugada del profe y el «te dio el control» se oigan los dos. Si se
 *    acumulan más de tres, se corta todo y se dice lo último: oír avisos viejos
 *    con un minuto de atraso es peor que perderse uno. Lo `assertive` (el tiempo
 *    que se acaba) sí corta.
 *
 * Una región que se vuelve a escribir con el MISMO texto (el cartel de arriba
 * se repinta con cada eco de Realtime) no se repite; sí se repite si antes
 * quedó vacía o escondida. Las `sr-only` (#clase-voz, #pensar-voz…) existen
 * solo para anunciar, así que ellas se dicen siempre.
 *
 * El nombre del botón dice para quién es («solo si no usas lector de
 * pantalla»): con lector encendido, esta voz habla encima de la suya. Esa parte
 * la pone `BlindNotation.setupSpeechToggle`, igual que en Entrenamiento, y la
 * preferencia es la misma: quien la encendió en Mates la tiene encendida acá.
 */
window.ClaseVoz = (function () {
  "use strict";

  var REGION = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"]';
  var MAX_LARGO = 400;
  var MAX_EN_FILA = 3;

  var ultimo = new WeakMap();   // región → último texto dicho ("" si quedó vacía/escondida)
  var pendientes = new Set();
  var temporizador = null;
  var enFila = 0;
  var observador = null;

  function limpio(t) { return String(t || "").replace(/\s+/g, " ").trim(); }

  function seVe(el) {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === "function") return el.checkVisibility();
    return !!(el.offsetParent || el.getClientRects().length);
  }

  /* El aviso del recuadro de comandos se juzga por dónde está montado: fuera del
     Modo Adaptado la caja es display:none, pero la jugada del profe se dice. */
  function visible(region) {
    if (region.classList.contains("cc-msg")) {
      var caja = region.closest(".cc-caja");
      return seVe(caja && caja.parentElement);
    }
    return seVe(region);
  }

  function recortar(t) {
    if (t.length <= MAX_LARGO) return t;
    var corte = t.lastIndexOf(". ", MAX_LARGO);
    return (corte > 80 ? t.slice(0, corte + 1) : t.slice(0, MAX_LARGO) + "…");
  }

  function decir(texto, urgente) {
    if (!window.BlindNotation || !BlindNotation.speak || !BlindNotation.isSpeechEnabled()) return;
    if (urgente || enFila >= MAX_EN_FILA) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
      enFila = 0;
    }
    var dicho = BlindNotation.speak(texto, {
      encolar: true,
      alTerminar: function () { enFila = Math.max(0, enFila - 1); },
    });
    if (dicho) enFila += 1;
  }

  function regionDe(nodo) {
    var el = nodo && (nodo.nodeType === 1 ? nodo : nodo.parentElement);
    return el ? el.closest(REGION) : null;
  }

  /* En el momento del cambio: si la región quedó vacía o escondida, se olvida lo
     último que dijo, para que el mismo aviso se vuelva a oír cuando reaparezca. */
  function anotar(region) {
    if (!region) return;
    if (!limpio(region.textContent) || !visible(region)) ultimo.set(region, "");
    pendientes.add(region);
    if (!temporizador) temporizador = setTimeout(leerPendientes, 150);
  }

  function leerPendientes() {
    temporizador = null;
    var regiones = Array.from(pendientes);
    pendientes.clear();
    if (!window.BlindNotation || !BlindNotation.isSpeechEnabled()) return;
    regiones.sort(function (a, b) {
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    regiones.forEach(function (region) {
      var texto = limpio(region.textContent);
      if (!texto || !visible(region)) { ultimo.set(region, ""); return; }
      var siempre = region.classList.contains("sr-only");
      if (!siempre && ultimo.get(region) === texto) return;
      ultimo.set(region, texto);
      var urgente = region.getAttribute("aria-live") === "assertive" || region.getAttribute("role") === "alert";
      decir(recortar(texto), urgente);
    });
  }

  function alCambiar(registros) {
    if (!window.BlindNotation || !BlindNotation.isSpeechEnabled()) return;
    registros.forEach(function (r) {
      if (r.type === "attributes") {
        /* Algo que aparece o desaparece (hidden, la clase "hidden"): cuentan las
           regiones de adentro y la región que lo contiene. */
        var el = r.target;
        if (el.matches && el.matches(REGION)) anotar(el);
        if (el.querySelectorAll) el.querySelectorAll(REGION).forEach(anotar);
        anotar(regionDe(el.parentElement));
        return;
      }
      anotar(regionDe(r.target));
    });
  }

  /* Lo que ya está escrito al encender (o al aparecer la página) no se dice: se
     anota como dicho. Si no, al cargar se oirían de golpe todos los carteles. */
  function tomarFoto(raiz) {
    raiz.querySelectorAll(REGION).forEach(function (reg) {
      ultimo.set(reg, visible(reg) ? limpio(reg.textContent) : "");
    });
  }

  /* Se empieza a escuchar cuando la página ya se ve: `#app` se destapa después
     de pintar todo, y ese destape no es un aviso. */
  function escuchar(raiz) {
    if (observador || !raiz) return;
    if (!seVe(raiz)) {
      var espera = new MutationObserver(function () {
        if (!seVe(raiz)) return;
        espera.disconnect();
        escuchar(raiz);
      });
      espera.observe(raiz, { attributes: true, attributeFilter: ["hidden", "class"] });
      return;
    }
    tomarFoto(raiz);
    observador = new MutationObserver(alCambiar);
    observador.observe(raiz, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ["hidden", "class"],
    });
  }

  function montar(botonId, raiz) {
    if (!window.BlindNotation || !BlindNotation.setupSpeechToggle) return;
    var btn = document.getElementById(botonId);
    raiz = raiz || document.body;
    /* En el celular, solo el ícono: con la palabra, el renglón del título se
       parte en dos y el tablero baja (verificar-clase-movil.js lo mide). */
    var pintar = BlindNotation.setupSpeechToggle(botonId, function () { return true; },
      { claseTexto: "hidden sm:inline" });
    if (!pintar) { if (btn) btn.hidden = true; return; }   // el navegador no sabe hablar
    escuchar(raiz);
    btn.addEventListener("click", function () {
      enFila = 0;
      if (!BlindNotation.isSpeechEnabled()) return;
      tomarFoto(raiz);
      BlindNotation.speak("Voz activada. Te voy a decir en voz alta lo que pasa en la clase.");
    });
  }

  return { montar: montar };
})();

if (document.getElementById("voz-clase-btn")) {
  ClaseVoz.montar("voz-clase-btn", document.getElementById("app"));
}
