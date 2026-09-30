/**
 * Ajedrez Integral — Modo Adaptado para las partidas en vivo de Juegos
 * (Estándar, Niebla de Guerra, y las que se vayan sumando).
 *
 * Agrega, sobre un tablero de 2 jugadores ya existente, lo mismo que tienen los
 * tableros de Entrenamiento: el tablero se RECORRE con el teclado y se le puede
 * PREGUNTAR, además del cuadro de texto para jugar sin arrastrar piezas y de
 * cada jugada anunciada por voz. Reutiliza js/tablero-accesible.js (las flechas
 * y los atajos), js/comandos-tablero.js (las preguntas) y js/blind-notation.js
 * (la notación fonética y la voz) — escribir acá una segunda versión de
 * cualquiera de las tres es exactamente cómo el 4×4 terminó siendo, durante
 * meses, el único tablero del sitio que se podía recorrer.
 *
 * Por qué esto no lee el tablero directo: una variante puede ocultar
 * información a propósito que su tablero visual tampoco muestra (la niebla
 * de Niebla de Guerra, más adelante la mano de Ajedrez de Cartas...). Por
 * eso la posición que se lee en voz y el anuncio de la jugada del rival se
 * piden con funciones que decide quien llama a init() (getVisibleGame,
 * describeOpponentMove) en vez de mirar el chess.js real directamente — así
 * el modo adaptado nunca cuenta algo que el modo visual no muestre.
 *
 * Y por eso el objeto que devuelve getVisibleGame() puede traer `oculta(casilla)`:
 * es lo que separa "ahí no hay nada" de "no sabes qué hay ahí". Sin eso, una
 * casilla tapada por la niebla se contestaba como "vacía" —que es falso y, peor,
 * es distinto de lo que el tablero visual dice con su 🌫️—. Lo entienden los dos
 * módulos compartidos, así que basta con ponerlo en la partida visible.
 *
 * Marcado que necesita la página (igual que tablero.html):
 *   #mode-normal-btn, #mode-blind-btn (el interruptor)
 *   #speech-toggle-btn (opcional — botón de "leer en voz alta")
 *   #move-form > #move-input (el cuadro para escribir la jugada o la pregunta)
 *   #move-input-status (region viva: confirma cada jugada, error o respuesta)
 *   #position-readout (la posición completa, agrupada por pieza — NO es región
 *     viva a propósito, ver renderPositionReadout)
 *   .blind-mode-only / .normal-mode-only en lo que deba mostrarse solo en
 *   cada modo.
 *
 * Uso:
 *   const blind = JuegosBlind.init({
 *     tablero: document.getElementById("board"),
 *     tryMove: (texto) => ({ ok, san } | { ok:false }),
 *     getVisibleGame: () => objeto con .get(casilla)/.turn()/.in_check(), y
 *       opcionalmente .moves({square,verbose}) y .oculta(casilla),
 *     describeOpponentMove: (san) => texto a anunciar, o null para no decir
 *       nada más que "es tu turno" (usar null en variantes que ocultan la
 *       jugada del rival, como Niebla de Guerra).
 *   });
 *   Opcionales, para dos preguntas que el tablero no sabe contestar:
 *     reloj: () => null (partida sin reloj) o
 *       { blancas: segundos, negras: segundos, miColor: "w"|"b"|null, corre: "w"|"b"|null }
 *       — contesta "reloj" / "tiempo" y avisa cuando te quedan 30 y 10 segundos.
 *     miColor: () => "w" | "b" | null (quien mira) — para decir por qué no
 *       se puede mover cuando no se puede.
 *     ultimaJugada: () => null (nada jugado) o { san, color: "w"|"b", oculta: bool }
 *       — contesta "última jugada". `oculta` es para Niebla de Guerra: se dice
 *       que el rival jugó, no qué.
 *     historial: () => texto que contesta "historial", para las variantes en
 *       que ComandosTablero no puede contestarlo (Niebla de Guerra: solo tus
 *       jugadas).
 *
 *   blind.announceOwnMove(san);       // después de una jugada propia
 *   blind.announceOpponentMove(san);  // al llegar una jugada del rival por Realtime
 *   blind.refreshPositionReadout();   // si la posición cambió por otro motivo
 */
window.JuegosBlind = (function () {
  "use strict";

  const KEY = "oscarBlindMode_v1";

  /* Si el Modo Adaptado está encendido AHORA se lee del <html>, que es donde lo
     pone js/adaptive-mode.js — no del localStorage: así vale también para el
     modo que se adivinó solo (el contraste del sistema, el primer Tab). */
  function modoPuesto() {
    return document.documentElement.classList.contains("adaptive-mode");
  }

  /* "4 minutos y 5 segundos", no "4:05": leído en voz alta, "cuatro dos
     puntos cero cinco" no es algo que se entienda a la primera, y con el
     reloj corriendo no hay tiempo para descifrarlo. */
  function tiempoDicho(segundos) {
    if (segundos == null) return "sin reloj";
    const s = Math.max(0, Math.ceil(segundos));
    const m = Math.floor(s / 60), r = s % 60;
    const min = m ? m + (m === 1 ? " minuto" : " minutos") : "";
    const seg = r || !m ? r + (r === 1 ? " segundo" : " segundos") : "";
    return min && seg ? min + " y " + seg : (min || seg);
  }

  function init(opts) {
    opts = opts || {};
    const tryMove = opts.tryMove || function () { return { ok: false }; };
    const getVisibleGame = opts.getVisibleGame;
    const leerReloj = typeof opts.reloj === "function" ? opts.reloj : null;
    const leerUltima = typeof opts.ultimaJugada === "function" ? opts.ultimaJugada : null;
    const describeOpponentMove = opts.describeOpponentMove || function (san) {
      return typeof BlindNotation !== "undefined" ? "El rival jugó: " + BlindNotation.sanSpoken(san) : null;
    };

    const modeNormalBtn = document.getElementById("mode-normal-btn");
    const modeBlindBtn = document.getElementById("mode-blind-btn");
    const moveFormEl = document.getElementById("move-form");
    const moveInputEl = document.getElementById("move-input");
    const moveInputStatusEl = document.getElementById("move-input-status");
    const positionReadoutEl = document.getElementById("position-readout");
    const blindOnlyEls = Array.from(document.querySelectorAll(".blind-mode-only"));
    const normalOnlyEls = Array.from(document.querySelectorAll(".normal-mode-only"));

    /* El interruptor de esta página escribía la preferencia a mano y NO encendía
       la clase `adaptive-mode` del <html>. No daba ningún error: el botón se
       marcaba como activado y la mitad del modo —el contraste, el tamaño de
       letra, los atajos del tablero, que cuelgan todos de esa clase— se quedaba
       apagada hasta recargar la página. Es literalmente el mismo fallo que ya se
       había arreglado en las cinco páginas de Entrenamiento que traen su propio
       "🔊 Adaptado". Ahora pasa por AdaptiveMode, que es quien pone la clase y
       avisa al resto del sitio con `adaptivemode:change`. */
    function leerPreferencia() {
      if (window.AdaptiveMode) return AdaptiveMode.isOn();
      try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; }
    }
    function guardarPreferencia(on) {
      if (window.AdaptiveMode) { AdaptiveMode.set(on); return; }
      try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {}
      document.documentElement.classList.toggle("adaptive-mode", !!on);
    }

    let blindMode = leerPreferencia();
    // Mismo atajo que ya usa js/tablero-board.js: un enlace con "?modo=ciego"
    // (por ejemplo, desde ciegos.html) preselecciona el modo adaptado sin
    // tener que tocar el interruptor a mano.
    try {
      if (new URLSearchParams(window.location.search).get("modo") === "ciego") blindMode = true;
    } catch (e) {}

    const refreshSpeechToggle = typeof BlindNotation !== "undefined"
      ? BlindNotation.setupSpeechToggle("speech-toggle-btn", function () { return true; })
      : null;

    function applyModeUI() {
      blindOnlyEls.forEach(function (el) { el.classList.toggle("hidden", !blindMode); });
      normalOnlyEls.forEach(function (el) { el.classList.toggle("hidden", blindMode); });
      if (modeNormalBtn) {
        modeNormalBtn.setAttribute("aria-pressed", blindMode ? "false" : "true");
        modeNormalBtn.classList.toggle("bg-brand-700", !blindMode);
        modeNormalBtn.classList.toggle("text-white", !blindMode);
      }
      if (modeBlindBtn) {
        modeBlindBtn.setAttribute("aria-pressed", blindMode ? "true" : "false");
        modeBlindBtn.classList.toggle("bg-brand-700", blindMode);
        modeBlindBtn.classList.toggle("text-white", blindMode);
      }
      if (refreshSpeechToggle) refreshSpeechToggle();
      if (blindMode) renderPositionReadout();
    }

    function setBlindMode(v) {
      blindMode = !!v;
      guardarPreferencia(blindMode);
      applyModeUI();
    }
    if (modeNormalBtn) modeNormalBtn.addEventListener("click", function () { setBlindMode(false); });
    if (modeBlindBtn) modeBlindBtn.addEventListener("click", function () { setBlindMode(true); });

    /* El modo se puede encender desde el interruptor del encabezado, desde otra
       pestaña o porque se adivinó solo. Sin escuchar el aviso, esta página se
       quedaba con su botón diciendo "Modo normal" y el recuadro escondido
       mientras el resto del sitio ya estaba en Adaptado. */
    document.addEventListener("adaptivemode:change", function (ev) {
      const activo = !!(ev && ev.detail && ev.detail.activo);
      if (activo === blindMode) return;
      blindMode = activo;
      applyModeUI();
      /* Al ENCENDERLO se dice qué acaba de aparecer: lo que destapa el recuadro
         es el CSS, y un lector de pantalla no percibe el CSS — sin este aviso,
         quien aprieta el interruptor no oye absolutamente nada. */
      if (activo) {
        announce("Modo adaptado. Debajo del tablero tienes un recuadro para escribir tu jugada "
          + "o preguntarle a la posición. Escribe \"ayuda\" para ver todo lo que se puede escribir.");
      }
    });

    // Vacía primero y repuebla con un pequeño retraso: así, si se repite el mismo texto
    // (por ejemplo, dos jugadas seguidas del rival con el mismo resultado aparente), el
    // lector de pantalla lo anuncia de nuevo aunque el contenido no haya cambiado.
    function announce(text) {
      if (typeof BlindNotation !== "undefined") BlindNotation.speak(text);
      if (!moveInputStatusEl) return;
      moveInputStatusEl.textContent = "";
      window.setTimeout(function () { moveInputStatusEl.textContent = text; }, 50);
    }

    /* La posición entera NO se anuncia sola en cada jugada, y eso es el cambio
       que hace usable una partida larga. Vivía en una región viva, así que cada
       jugada —la propia y la del rival— volvía a dictar las treinta y dos
       piezas: para enterarse de que el rival jugó Cf3 había que oír el tablero
       completo. Ahora lo que se anuncia es la JUGADA, que es lo que cambió, y la
       posición se queda escrita ahí para leerla cuando se quiera, se pide con
       "posición" en el recuadro o con la tecla z sobre el tablero. Misma
       decisión que se tomó en las fichas de Estudio, y por lo mismo. */
    function renderPositionReadout() {
      if (!positionReadoutEl || typeof BlindNotation === "undefined" || !getVisibleGame) return;
      positionReadoutEl.innerHTML = BlindNotation.groupedReadoutHTML(getVisibleGame());
    }

    /* ------------------------------------------------------------- el tablero
       Las 64 casillas eran 64 paradas de tabulador: para pasar del tablero al
       botón de abajo había que apretar Tab sesenta y cinco veces, y no había
       forma de MIRAR el tablero —un lector de pantalla lee la casilla enfocada,
       así que saber qué hay alrededor del rey costaba recorrer las 64 de una en
       una y acordarse—. Con esta línea el tablero se recorre con las flechas y
       contesta los atajos de siempre (o, z, m, x, k q r b n p, 1-8, i). */
    let tableroApi = null;
    const tableroEl = typeof opts.tablero === "function" ? opts.tablero() : opts.tablero;
    if (tableroEl && window.TableroAccesible) {
      tableroApi = TableroAccesible.montar(tableroEl, {
        nombre: opts.nombreTablero || "Tablero de la partida",
        juego: getVisibleGame,
        cuadro: function () { return moveInputEl; },
      });
    }

    /* El foco no se puede perder en cada repintado. El tablero de las partidas
       (js/niebla-board.js) se vacía y se vuelve a llenar en cada clic, y al
       sacar del documento la casilla que tenía el foco el navegador lo manda al
       <body>: elegías la pieza con Intro y te quedabas fuera del tablero, sin
       saber dónde, justo a mitad de la jugada. No daba ningún error, y con el
       ratón no se nota. Se recuerda en qué casilla estaba y, si el foco se
       perdió por el repintado —no porque saliste a otro lado—, vuelve ahí.
       Pasa lo mismo al cerrar el diálogo de la coronación: devuelve el foco a
       la casilla, y la jugada que sigue la repinta. */
    if (tableroEl) {
      let casillaConFoco = null;
      tableroEl.addEventListener("focusin", function (e) {
        const c = e.target.closest ? e.target.closest("[data-square]") : null;
        casillaConFoco = c ? c.dataset.square : null;
      });
      tableroEl.addEventListener("focusout", function (e) {
        const quien = e.target;
        // Si la casilla sigue en la página, el foco se fue porque te fuiste tú.
        if (e.relatedTarget && !tableroEl.contains(e.relatedTarget)) { casillaConFoco = null; return; }
        window.setTimeout(function () { if (quien.isConnected && !tableroEl.contains(document.activeElement)) casillaConFoco = null; }, 0);
      });
      new MutationObserver(function () {
        if (!casillaConFoco) return;
        const activo = document.activeElement;
        if (activo && activo !== document.body && activo.isConnected) return;
        const celda = tableroEl.querySelector('[data-square="' + casillaConFoco + '"]');
        if (celda) { try { celda.focus({ preventScroll: true }); } catch (e) {} }
      }).observe(tableroEl, { childList: true, subtree: true });
    }

    /* La ayuda, plegada y con encabezados de verdad — la misma de todo el sitio
       (ComandosTablero), no una segunda lista que se iría separando. Plegada
       porque quien entra a una partida quiere jugarla, no oír el manual; con
       encabezados porque así se salta directo a la sección que hace falta. Se
       escribe al montar aunque esté cerrada: si solo se escribiera al pedirla
       con el comando, abrirla a mano mostraría una caja vacía. */
    /* A la ayuda de todo el sitio se le suma lo que solo existe en una partida:
       el reloj y la última jugada. Un comando que no sale en la ayuda no
       existe para quien no puede descubrirlo mirando la pantalla. */
    function ayudaDeLaPartida() {
      return ComandosTablero.ayudaHTML()
        + "<h3>La partida</h3><p>\"reloj\" o \"tiempo\": cuánto les queda a cada uno. "
        + "\"última jugada\": la jugada que se acaba de hacer."
        + (leerReloj ? " Cuando a tu reloj le quedan 30 y 10 segundos, se avisa solo." : "") + "</p>";
    }
    let detAyuda = null, cuerpoAyuda = null;
    if (moveFormEl && window.ComandosTablero) {
      detAyuda = document.createElement("details");
      detAyuda.className = "cc-ayuda-det";
      const sum = document.createElement("summary");
      sum.textContent = "Qué se puede escribir: jugadas, preguntas y atajos";
      detAyuda.appendChild(sum);
      cuerpoAyuda = document.createElement("div");
      cuerpoAyuda.setAttribute("role", "region");
      cuerpoAyuda.setAttribute("aria-label", "Qué se puede escribir");
      cuerpoAyuda.innerHTML = ayudaDeLaPartida();
      detAyuda.appendChild(cuerpoAyuda);
      (positionReadoutEl && positionReadoutEl.parentNode ? positionReadoutEl.parentNode : moveFormEl.parentNode)
        .appendChild(detAyuda);
    }
    function abrirAyuda() {
      if (!detAyuda) return;
      detAyuda.open = true;
      // Vaciar y repoblar: pedir "ayuda" dos veces seguidas tiene que volver a
      // leerla, y una región viva solo reacciona cuando el texto cambia.
      const html = ayudaDeLaPartida();
      cuerpoAyuda.innerHTML = "";
      window.setTimeout(function () { cuerpoAyuda.innerHTML = html; }, 50);
    }

    function normalizarPedido(texto) {
      return String(texto || "").toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[¿?¡!.,]/g, " ").replace(/\s+/g, " ").trim();
    }

    function textoDelReloj() {
      const r = leerReloj ? leerReloj() : null;
      if (!r) return "Esta partida no tiene reloj.";
      const corre = r.corre === "w" ? " Corre el de las blancas." : r.corre === "b" ? " Corre el de las negras." : " Los relojes están parados.";
      if (r.miColor === "w" || r.miColor === "b") {
        const mio = r.miColor === "w" ? r.blancas : r.negras;
        const suyo = r.miColor === "w" ? r.negras : r.blancas;
        return "Te quedan " + tiempoDicho(mio) + ". Al rival, " + tiempoDicho(suyo) + "." + corre;
      }
      return "Blancas: " + tiempoDicho(r.blancas) + ". Negras: " + tiempoDicho(r.negras) + "." + corre;
    }

    function textoUltimaJugada() {
      const u = leerUltima ? leerUltima() : null;
      if (!u || !u.san) return "Todavía no se ha jugado nada.";
      const quien = u.color === "w" ? "las blancas" : "las negras";
      /* En Niebla de Guerra la jugada del rival NO se dice: la lista de jugadas
         también se esconde mientras dura la partida, y decirla acá sería
         levantar la niebla por el recuadro. */
      if (u.oculta) return "La última jugada fue del rival, con " + quien + ": con la niebla no se ve cuál fue.";
      const dicha = typeof BlindNotation !== "undefined" ? BlindNotation.sanSpoken(u.san) : u.san;
      return "La última jugada fue de " + quien + ": " + dicha + ".";
    }

    /* Los avisos de tiempo: a los 30 y a los 10 segundos de TU reloj, una vez
       cada uno. En pantalla el reloj se pone rojo; sin verla no había ningún
       aviso, y la partida se perdía por tiempo con la jugada ya pensada. Si el
       incremento te devuelve por encima del umbral, el aviso se rearma. */
    const UMBRALES = [30, 10];
    const avisados = {};
    function vigilarReloj() {
      const r = leerReloj ? leerReloj() : null;
      if (!r || (r.miColor !== "w" && r.miColor !== "b")) return;
      const mio = r.miColor === "w" ? r.blancas : r.negras;
      if (mio == null) return;
      let cruzado = false;
      UMBRALES.forEach(function (u) {
        if (mio > u) { avisados[u] = false; return; }
        if (avisados[u] || r.corre !== r.miColor || mio <= 0) return;
        // Se marcan todos los que ya se pasaron: si tu turno empieza con 8
        // segundos, se dice UNA vez cuánto queda, no "30" y después "10".
        avisados[u] = true;
        cruzado = true;
      });
      if (cruzado) announce("Te quedan " + tiempoDicho(mio) + " en el reloj.");
    }
    if (leerReloj) window.setInterval(vigilarReloj, 500);

    /* Lo que no se pudo jugar se queda en el recuadro (para corregirlo), pero
       SELECCIONADO: si no, lo siguiente que se escribía se pegaba detrás
       («e4e5», «tiempob») y volvía a fallar, y sin ver el recuadro no hay cómo
       saber que ya tenía texto. Seleccionado, lo nuevo lo reemplaza, y con
       una flecha se puede corregir lo que estaba. */
    function seleccionarLoEscrito() {
      try { moveInputEl.select(); } catch (e) {}
    }

    if (moveFormEl && moveInputEl) {
      moveFormEl.addEventListener("submit", function (e) {
        e.preventDefault();
        const raw = moveInputEl.value;
        if (!raw.trim()) return;

        /* Antes de tratarlo como jugada se mira si era una PREGUNTA ("caballos",
           "qué hay en e4", "posición"). ComandosTablero devuelve
           `manejado: false` cuando no es ninguna de las suyas y entonces sigue
           el camino de siempre — al revés, quedarse con todo, una jugada como
           "Ra1" se leería como la pregunta por el rey y no se jugaría nunca. */
        /* Dos preguntas que el tablero no sabe contestar y la pantalla sí: el
           reloj y la última jugada. Quien ve, los mira de reojo; quien no, no
           tenía forma de saber cuánto le quedaba hasta que se le caía la
           bandera, ni de volver a oír la jugada del rival si se le pasó el
           aviso. Van antes de las preguntas del tablero y de la jugada: son
           solo lectura y tienen que contestar también fuera de turno. */
        const pedido = normalizarPedido(raw);
        if (/^(reloj|relojes|tiempo|cuanto tiempo( me queda| queda)?|cuanto me queda)$/.test(pedido)) {
          moveInputEl.value = "";
          announce(textoDelReloj());
          return;
        }
        if (/^(ultima|ultima jugada|la ultima|la ultima jugada|que jugo|que jugo el rival|jugada anterior)$/.test(pedido)) {
          moveInputEl.value = "";
          announce(textoUltimaJugada());
          return;
        }

        /* «mis jugadas» fuera de turno: la partida visible solo sabe las jugadas
           del bando al que le toca, así que en el turno del rival contestaba
           con las jugadas DEL RIVAL, dichas como si fueran tuyas («Tienes 29
           jugadas…»). Sin ver el tablero no hay cómo darse cuenta. */
        if (/^(mis jugadas|jugadas posibles|jugadas legales|que puedo jugar|todas mis jugadas|que jugadas tengo)$/.test(pedido)
            && typeof opts.miColor === "function" && getVisibleGame) {
          const mioColor = opts.miColor();
          const gv = getVisibleGame();
          if ((mioColor === "w" || mioColor === "b") && gv && gv.turn && gv.turn() !== mioColor) {
            moveInputEl.value = "";
            announce("Ahora le toca al rival: tus jugadas se pueden ver cuando te toque.");
            return;
          }
        }
        /* «historial» con una lista que decide la página. Hace falta en Niebla
           de Guerra: ComandosTablero no contesta el historial con niebla (diría
           las jugadas del rival), y sin esto «historial» caía como jugada y se
           oía «Jugada no válida». La página devuelve solo lo que se puede decir. */
        if (typeof opts.historial === "function"
            && /^(historial|jugadas de la partida|las jugadas|la partida|todas las jugadas|mis jugadas hechas)$/.test(pedido)) {
          moveInputEl.value = "";
          announce(opts.historial());
          return;
        }

        if (window.ComandosTablero && getVisibleGame) {
          const r = ComandosTablero.interpretar(raw, { juego: getVisibleGame, tablero: tableroApi });
          if (r.manejado) {
            moveInputEl.value = "";
            if (r.tipo === "ayuda") { abrirAyuda(); announce("Ayuda desplegada debajo del recuadro."); }
            else if (r.respuesta) announce(r.respuesta);
            return;
          }
        }

        const result = tryMove(raw);
        if (result && result.ok) {
          moveInputEl.value = "";
          announce(typeof BlindNotation !== "undefined" ? BlindNotation.sanSpoken(result.san) : result.san);
          renderPositionReadout();
        } else if (result && result.reason === "no_turn") {
          /* Fuera de turno la jugada no es "no válida": puede ser perfecta y
             solo hay que esperar. Decir "Jugada no válida" mandaba a revisar
             algo que estaba bien, y quien no ve la pantalla no tenía cómo
             saber que el problema era el turno (o que la partida no había
             empezado, o que ya terminó). */
          const g = getVisibleGame ? getVisibleGame() : null;
          const mio = typeof opts.miColor === "function" ? opts.miColor() : undefined;
          if (mio === null) announce("Estás mirando esta partida: solo pueden mover quienes la juegan.");
          else if (mio && g && g.turn && g.turn() === mio) announce("Ahora no se puede mover: la partida todavía no empezó o ya terminó.");
          else announce("No es tu turno: espera la jugada del rival.");
          seleccionarLoEscrito();
        } else {
          announce('Jugada no válida: "' + raw + '". Revísala e intenta de nuevo. Escribe "ayuda" para ver qué más se puede escribir.');
          seleccionarLoEscrito();
        }
      });
    }

    applyModeUI();

    return {
      isOn: function () { return blindMode; },
      announceOwnMove: function (san) {
        announce(typeof BlindNotation !== "undefined" ? BlindNotation.sanSpoken(san) : san);
        renderPositionReadout();
      },
      announceOpponentMove: function (san) {
        const text = describeOpponentMove(san);
        if (text) announce(text);
        renderPositionReadout();
      },
      announceStatus: function (text) { announce(text); },
      refreshPositionReadout: renderPositionReadout,
      tablero: function () { return tableroApi; },
    };
  }

  return { init: init, modoPuesto: modoPuesto, tiempoDicho: tiempoDicho };
})();
