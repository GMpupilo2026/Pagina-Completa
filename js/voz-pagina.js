/* ===== Ajedrez Integral — «Activar voz» en todo el sitio =====
 *
 * Todo lo que una página avisa ya se escribe en regiones vivas (`aria-live`,
 * `role="status"`): «Se jugó torre david 1», «¡El profesor te dio el control!»,
 * «Ana te retó a una partida», «Guardado»… Un lector de pantalla las lee solas.
 * Pero quien ve poco muchas veces NO usa lector: agranda la letra y se acerca a
 * la pantalla, y lo que cambia no se entera. El botón 🔇/🗣️ del encabezado
 * hace que el propio navegador (Web Speech API, `BlindNotation.speak`) diga en
 * voz alta esas mismas regiones, en cualquier página.
 *
 * Lo carga js/adaptive-mode.js (que ya está en todas las páginas con el
 * encabezado del sitio), así que una página nueva lo tiene sin hacer nada. No
 * sale en las páginas que traen su propio botón de voz (`#speech-toggle-btn`,
 * `#btn-voz`: Mates, Aprender, las partidas de Juegos, Sonar…): esas ya dicen
 * cada jugada a su manera, y dos botones para lo mismo es uno de más. La
 * preferencia es la misma (`oscarSpeechMode_v1`): quien la enciende en un
 * lado la tiene encendida en todos.
 *
 * Tres decisiones que no conviene deshacer:
 *
 * 1. SE LEE LO QUE YA SE ANUNCIA, NO UNA LISTA PROPIA. No hay un segundo juego
 *    de textos «para la voz»: se escuchan las regiones vivas de la página con un
 *    MutationObserver. Un aviso nuevo, si se escribe en una región viva (como
 *    debe, para el lector), se oye también acá sin tocar nada.
 *
 * 2. SOLO LO QUE ESTÁ A LA VISTA DE ESA PERSONA. Una región dentro de un panel
 *    escondido (el del profe, cuando entra un alumno) no habla, igual que no la
 *    leería un lector. La excepción es el aviso del recuadro de comandos
 *    (`.cc-msg`): fuera del Modo Adaptado el recuadro no se ve, pero sus avisos
 *    son justo las jugadas del profesor en la clase, lo primero que necesita
 *    oír quien ve poco. Ahí manda que se vea el lugar donde está montado.
 *
 * 3. LO QUE LLEGA JUNTO SE DICE EN FILA, NO CORTADO. `BlindNotation.speak`
 *    normal corta la frase anterior; acá se encola (`encolar: true`), para que
 *    la jugada del profe y el «te dio el control» se oigan los dos. Si se
 *    acumulan más de tres, se corta todo y se dice lo último: oír avisos viejos
 *    con un minuto de atraso es peor que perderse uno. Lo `assertive` corta.
 *
 * Y para que no hable de más:
 *   - una región que se vuelve a escribir con el MISMO texto (un cartel que se
 *     repinta con cada eco de Realtime) no se repite; sí si antes quedó vacía o
 *     escondida. Las `sr-only` existen solo para anunciar: esas se dicen siempre;
 *   - una región que cambia solo en los números (una cuenta atrás, un reloj) se
 *     dice como mucho cada 10 segundos;
 *   - lo que ya estaba escrito al cargar no se dice: se empieza a escuchar
 *     cuando `#app` se destapa (las páginas de la Academia lo esconden hasta
 *     tener sus datos) y lo que aparece en el primer segundo y medio se cuenta
 *     como parte de la página, no como aviso.
 *
 * El nombre del botón dice para quién es («solo si no usas lector de
 * pantalla»): con lector encendido, esta voz habla encima de la suya. Esa parte
 * la pone `BlindNotation.setupSpeechToggle`, igual que en Entrenamiento.
 */
window.VozPagina = (function () {
  "use strict";

  var REGION = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"]';
  var MAX_LARGO = 400;
  var MAX_EN_FILA = 3;
  var CALMA_AL_CARGAR = 1500;
  var CADA_CUANTO_NUMEROS = 10000;

  var ultimo = new WeakMap();   // región → último texto dicho ("" si quedó vacía/escondida)
  var ultimoMolde = new WeakMap();   // región → { molde (sin números), en }
  var pendientes = new Set();
  var temporizador = null;
  var enFila = 0;
  var observador = null;
  var raizActual = null;

  function limpio(t) { return String(t || "").replace(/\s+/g, " ").trim(); }
  function hablando() { return !!(window.BlindNotation && BlindNotation.isSpeechEnabled()); }

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
    if (!hablando()) return;
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
    if (!hablando()) return;
    regiones.sort(function (a, b) {
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    var ahora = Date.now();
    regiones.forEach(function (region) {
      var texto = limpio(region.textContent);
      if (!texto || !visible(region)) { ultimo.set(region, ""); return; }
      var siempre = region.classList.contains("sr-only");
      if (!siempre && ultimo.get(region) === texto) return;
      /* Un reloj o una cuenta atrás: el mismo texto con otro número. */
      var molde = texto.replace(/\d+/g, "#");
      var antes = ultimoMolde.get(region);
      if (antes && antes.molde === molde && molde !== texto && ahora - antes.en < CADA_CUANTO_NUMEROS) {
        ultimo.set(region, texto);
        return;
      }
      ultimo.set(region, texto);
      ultimoMolde.set(region, { molde: molde, en: ahora });
      var urgente = region.getAttribute("aria-live") === "assertive" || region.getAttribute("role") === "alert";
      decir(recortar(texto), urgente);
    });
  }

  function alCambiar(registros) {
    if (!hablando()) return;
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
      /* Una caja nueva que YA es región viva (el aviso de «Partida asignada», que
         se agrega entero al <body>): la región no es el padre, es lo que llegó. */
      r.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        if (n.matches(REGION)) anotar(n);
        n.querySelectorAll(REGION).forEach(anotar);
      });
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
    var app = document.getElementById("app");
    if (app && raiz.contains(app) && !seVe(app)) {
      var espera = new MutationObserver(function () {
        if (!seVe(app)) return;
        espera.disconnect();
        escuchar(raiz);
      });
      espera.observe(app, { attributes: true, attributeFilter: ["hidden", "class"] });
      return;
    }
    tomarFoto(raiz);
    var empezo = Date.now();
    observador = new MutationObserver(function (registros) {
      if (Date.now() - empezo < CALMA_AL_CARGAR) { tomarFoto(raiz); return; }
      alCambiar(registros);
    });
    observador.observe(raiz, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ["hidden", "class"],
    });
    /* Lo que terminó de llegar justo en la calma también es parte de la página. */
    setTimeout(function () { tomarFoto(raiz); }, CALMA_AL_CARGAR + 50);
  }

  /* `boton`: el elemento del botón (o su id). `opts.claseTexto` le pone una
     clase a la palabra (el encabezado lo deja solo en ícono, como sus vecinos). */
  function montar(boton, raiz, opts) {
    opts = opts || {};
    if (!window.BlindNotation || !BlindNotation.setupSpeechToggle) return false;
    var btn = typeof boton === "string" ? document.getElementById(boton) : boton;
    if (!btn || !btn.id) return false;
    raizActual = raiz || document.body;
    var pintar = BlindNotation.setupSpeechToggle(btn.id, function () { return true; },
      { claseTexto: opts.claseTexto });
    if (!pintar) { btn.hidden = true; return false; }   // el navegador no sabe hablar
    escuchar(raizActual);
    btn.addEventListener("click", function () {
      enFila = 0;
      if (!hablando()) return;
      tomarFoto(raizActual);
      BlindNotation.speak("Voz activada. Te voy a decir en voz alta los avisos de esta página.");
    });
    return true;
  }

  /* ---- El botón del encabezado ----
     Va junto al del Modo Adaptado (o al del modo oscuro), con su misma forma. */
  var PROPIOS = "#speech-toggle-btn, #btn-voz";

  function cargar(src, listo) {
    var s = document.createElement("script");
    s.src = src;
    s.onload = listo;
    document.head.appendChild(s);
  }

  function enElEncabezado(base) {
    if (document.getElementById("voz-toggle") || document.querySelector(PROPIOS)) return;
    if (!("speechSynthesis" in window)) return;
    var vecino = document.getElementById("adaptive-toggle") || document.getElementById("theme-toggle");
    if (!vecino || !vecino.parentElement) return;
    function poner() {
      if (document.getElementById("voz-toggle")) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.id = "voz-toggle";
      btn.className = (document.getElementById("theme-toggle") || vecino).className;
      vecino.parentElement.insertBefore(btn, vecino);
      montar(btn, document.body, { claseTexto: "sr-only" });
    }
    if (window.BlindNotation && BlindNotation.setupSpeechToggle) poner();
    else cargar(base + "blind-notation.js", poner);
  }

  return { montar: montar, enElEncabezado: enElEncabezado };
})();
