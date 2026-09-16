/**
 * Ajedrez Integral — Modo Adaptado para las partidas en vivo de Juegos
 * (Estándar, Niebla de Guerra, y las que se vayan sumando).
 *
 * Agrega, sobre un tablero de 2 jugadores ya existente, el mismo tipo de
 * interacción que ya tienen Tablero/4×4/Aprender/Coordenadas: un interruptor
 * normal/adaptado, un cuadro de texto para jugar sin arrastrar piezas, y
 * cada jugada anunciada por voz — reutilizando js/blind-notation.js para la
 * notación fonética y la síntesis de voz, y js/chess-move-parser.js para
 * interpretar lo que se escribe. Comparte la MISMA clave de localStorage que
 * el resto del sitio (oscarBlindMode_v1): activar el modo adaptado en
 * cualquier página lo deja activado en todas.
 *
 * Por qué esto no lee el tablero directo: una variante puede ocultar
 * información a propósito que su tablero visual tampoco muestra (la niebla
 * de Niebla de Guerra, más adelante la mano de Ajedrez de Cartas...). Por
 * eso la posición que se lee en voz y el anuncio de la jugada del rival se
 * piden con funciones que decide quien llama a init() (getVisibleGame,
 * describeOpponentMove) en vez de mirar el chess.js real directamente — así
 * el modo adaptado nunca cuenta algo que el modo visual no muestre.
 *
 * Marcado que necesita la página (igual que tablero.html):
 *   #mode-normal-btn, #mode-blind-btn (el interruptor)
 *   #speech-toggle-btn (opcional — botón de "leer en voz alta")
 *   #move-form > #move-input (el cuadro para escribir la jugada)
 *   #move-input-status (aria-live: confirma cada jugada/error)
 *   #position-readout (aria-live: la posición completa, agrupada por pieza)
 *   .blind-mode-only / .normal-mode-only en lo que deba mostrarse solo en
 *   cada modo.
 *
 * Uso:
 *   const blind = JuegosBlind.init({
 *     tryMove: (texto) => ({ ok, san } | { ok:false }),
 *     getVisibleGame: () => objeto con .get(casilla)/.turn()/.in_check(),
 *     describeOpponentMove: (san) => texto a anunciar, o null para no decir
 *       nada más que "es tu turno" (usar null en variantes que ocultan la
 *       jugada del rival, como Niebla de Guerra).
 *   });
 *   blind.announceOwnMove(san);       // después de una jugada propia
 *   blind.announceOpponentMove(san);  // al llegar una jugada del rival por Realtime
 *   blind.refreshPositionReadout();   // si la posición cambió por otro motivo
 */
window.JuegosBlind = (function () {
  "use strict";

  const KEY = "oscarBlindMode_v1";

  function init(opts) {
    opts = opts || {};
    const tryMove = opts.tryMove || function () { return { ok: false }; };
    const getVisibleGame = opts.getVisibleGame;
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

    let blindMode = false;
    try { blindMode = localStorage.getItem(KEY) === "1"; } catch (e) {}
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
      try { localStorage.setItem(KEY, blindMode ? "1" : "0"); } catch (e) {}
      applyModeUI();
    }
    if (modeNormalBtn) modeNormalBtn.addEventListener("click", function () { setBlindMode(false); });
    if (modeBlindBtn) modeBlindBtn.addEventListener("click", function () { setBlindMode(true); });

    // Vacía primero y repuebla con un pequeño retraso: así, si se repite el mismo texto
    // (por ejemplo, dos jugadas seguidas del rival con el mismo resultado aparente), el
    // lector de pantalla lo anuncia de nuevo aunque el contenido no haya cambiado.
    function announce(text) {
      if (typeof BlindNotation !== "undefined") BlindNotation.speak(text);
      if (!moveInputStatusEl) return;
      moveInputStatusEl.textContent = "";
      window.setTimeout(function () { moveInputStatusEl.textContent = text; }, 50);
    }

    function renderPositionReadout() {
      if (!positionReadoutEl || typeof BlindNotation === "undefined" || !getVisibleGame) return;
      const html = BlindNotation.groupedReadoutHTML(getVisibleGame());
      positionReadoutEl.innerHTML = "";
      window.setTimeout(function () { positionReadoutEl.innerHTML = html; }, 50);
    }

    if (moveFormEl && moveInputEl) {
      moveFormEl.addEventListener("submit", function (e) {
        e.preventDefault();
        const raw = moveInputEl.value;
        if (!raw.trim()) return;
        const result = tryMove(raw);
        if (result && result.ok) {
          moveInputEl.value = "";
          announce(typeof BlindNotation !== "undefined" ? BlindNotation.sanSpoken(result.san) : result.san);
          renderPositionReadout();
        } else {
          announce('Jugada no válida: "' + raw + '". Revísala e intenta de nuevo.');
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
    };
  }

  return { init: init };
})();
