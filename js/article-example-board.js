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
        // OJO: la paridad se calcula con (rank - 1), no con rank tal cual — h1 debe ser
        // una casilla clara (como en el tablero real y en ClasesBoard, ver isLightSquare()
        // en clases-board.js) y "rank" aquí ya viene en base 1 (8..1), no en base 0. Usarlo
        // sin el -1 invierte el color de las 64 casillas del diagrama.
        const light = (f + (rank - 1)) % 2 === 1;
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
    sizePieces(el);
  }

  // El tamaño de pieza NO se fija en CSS con vw (min(6vw,28px) queda atado al ancho de
  // la VENTANA, no al del propio tablero — que cada artículo puede envolver en un
  // .example-board-wrap más angosto o más ancho con max-w-[Npx]): con eso la pieza queda
  // desproporcionada al tamaño real de la casilla y "se ve mal". En su lugar se mide el
  // ancho ya renderizado de una casilla y se fija el font-size como fracción de ese
  // ancho, igual que hace ClasesBoard con sus miniaturas (ver _sizeCompactPieces en
  // clases-board.js) — así queda bien en cualquier ancho de tablero.
  function sizePieces(el) {
    requestAnimationFrame(() => {
      const square = el.querySelector(".example-sq");
      if (!square) return;
      const cellWidth = square.getBoundingClientRect().width;
      if (!cellWidth) return;
      const fontPx = Math.max(14, Math.min(cellWidth * 0.62, 32));
      el.querySelectorAll(".example-sq").forEach((sq) => { sq.style.fontSize = fontPx + "px"; });
    });
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
