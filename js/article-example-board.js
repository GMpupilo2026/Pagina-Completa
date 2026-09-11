/* ===== Ajedrez Integral — Diagramas de ejemplo en los artículos =====
 * Cada artículo puede incluir una "tarjeta de ejemplo" con la posición que
 * ilustra su tema: <div class="example-card" data-fen="..."> con un
 * <div class="example-board"></div> y un <div class="example-readout">
 * dentro. En Modo normal se ve el tablero; en Modo Adaptado se reemplaza por
 * la misma descripción de posición agrupada por color y tipo de pieza que ya
 * usa Ciegos/Entrenamiento (BlindNotation, js/blind-notation.js) — la
 * notación de columnas es la misma en todas partes del sitio.
 *
 * Requiere chess.js y js/blind-notation.js cargados antes que este archivo.
 */
(function () {
  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const GLYPH = {
    p: { w: "♙", b: "♟" }, n: { w: "♘", b: "♞" }, b: { w: "♗", b: "♝" },
    r: { w: "♖", b: "♜" }, q: { w: "♕", b: "♛" }, k: { w: "♔", b: "♚" },
  };
  const BLIND_MODE_KEY = "oscarBlindMode_v1";

  function renderBoard(el, game) {
    el.innerHTML = "";
    for (let rank = 8; rank >= 1; rank--) {
      for (let f = 0; f < 8; f++) {
        const square = FILES[f] + rank;
        const light = (f + rank) % 2 === 1;
        const sq = document.createElement("div");
        sq.className = "example-sq " + (light ? "example-sq-light" : "example-sq-dark");
        const piece = game.get(square);
        if (piece) {
          const span = document.createElement("span");
          span.className = piece.color === "w" ? "piece-white" : "piece-black";
          span.setAttribute("aria-hidden", "true");
          span.textContent = GLYPH[piece.type][piece.color];
          sq.appendChild(span);
        }
        el.appendChild(sq);
      }
    }
  }

  function setActive(btn, active) {
    btn.setAttribute("aria-pressed", String(active));
    btn.classList.toggle("bg-accent-500", active);
    btn.classList.toggle("text-brand-900", active);
    btn.classList.toggle("bg-white", !active);
    btn.classList.toggle("dark:bg-brand-900", !active);
    btn.classList.toggle("text-brand-500", !active);
    btn.classList.toggle("dark:text-brand-400", !active);
  }

  function setupCard(card) {
    const fen = card.getAttribute("data-fen");
    if (!fen || typeof Chess === "undefined") return;
    let game;
    try { game = new Chess(fen); } catch (e) { return; }

    const boardWrap = card.querySelector(".example-board-wrap");
    const boardEl = card.querySelector(".example-board");
    const readoutEl = card.querySelector(".example-readout");
    const normalBtn = card.querySelector('[data-mode="normal"]');
    const adaptedBtn = card.querySelector('[data-mode="adaptado"]');
    if (!boardEl || !readoutEl) return;

    renderBoard(boardEl, game);

    function applyMode(adapted) {
      if (boardWrap) boardWrap.classList.toggle("hidden", adapted);
      readoutEl.classList.toggle("hidden", !adapted);
      if (adapted && window.BlindNotation) {
        readoutEl.innerHTML = window.BlindNotation.groupedReadoutHTML(game);
      }
      if (normalBtn) setActive(normalBtn, !adapted);
      if (adaptedBtn) setActive(adaptedBtn, adapted);
    }

    if (normalBtn) normalBtn.addEventListener("click", () => applyMode(false));
    if (adaptedBtn) adaptedBtn.addEventListener("click", () => applyMode(true));

    // Respeta la preferencia de Modo Adaptado ya elegida en el resto del sitio (Tablero,
    // Entrenamiento, Ciegos) para quien ya la activó — sin forzarla de vuelta si la
    // cambia aquí, esto es solo un ejemplo dentro del artículo, no la página principal.
    let initialAdapted = false;
    try { initialAdapted = localStorage.getItem(BLIND_MODE_KEY) === "1"; } catch (e) {}
    applyMode(initialAdapted);
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".example-card[data-fen]").forEach(setupCard);
  });
})();
