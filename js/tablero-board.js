/**
 * main.js — Tablero e interacción para la página tablero.html de Ajedrez Integral.
 * Requiere: chess.js, oscar-book.js y chess-bot.js cargados antes que este archivo.
 * El visitante siempre juega con blancas; el bot (Oscar) juega con negras.
 */
(function () {
  "use strict";

  const boardEl = document.getElementById("chessboard");
  const turnEl = document.getElementById("turn-indicator");
  const statusEl = document.getElementById("status-msg");
  const difficultyEl = document.getElementById("difficulty");
  const resetBtn = document.getElementById("reset-btn");
  const capturedByWhiteEl = document.getElementById("captured-by-white");
  const capturedByBlackEl = document.getElementById("captured-by-black");
  const historyEl = document.getElementById("move-history");

  if (!boardEl || typeof Chess === "undefined") {
    console.error("Falta el tablero o la librería chess.js");
    return;
  }

  const game = new Chess();
  let selected = null; // casilla seleccionada, ej. "e2"
  let legalTargets = []; // jugadas legales (verbose) desde la casilla seleccionada
  let lastMove = null; // {from, to} de la última jugada, para resaltarla
  let isBotThinking = false;
  let capturedByWhite = []; // piezas negras capturadas por blancas
  let capturedByBlack = []; // piezas blancas capturadas por negras

  const GLYPH = {
    w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
    b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
  };

  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

  function isLightSquare(square) {
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1], 10) - 1;
    return (file + rank) % 2 === 1;
  }

  function squareClasses(square) {
    const light = isLightSquare(square);
    let cls = "flex items-center justify-center text-3xl sm:text-4xl md:text-5xl cursor-pointer select-none relative transition-colors ";
    cls += light ? "bg-brand-100 " : "bg-brand-500 ";
    if (selected === square) {
      cls += "outline outline-4 -outline-offset-4 outline-accent-500 ";
    } else if (lastMove && (lastMove.from === square || lastMove.to === square)) {
      cls += light ? "bg-accent-400/40 " : "bg-accent-600/50 ";
    }
    return cls;
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    for (let rank = 8; rank >= 1; rank--) {
      for (let f = 0; f < 8; f++) {
        const square = FILES[f] + rank;
        const div = document.createElement("div");
        div.className = squareClasses(square);
        div.setAttribute("data-square", square);

        const piece = game.get(square);
        if (piece) {
          const span = document.createElement("span");
          span.textContent = GLYPH[piece.color][piece.type];
          span.className = piece.color === "w" ? "drop-shadow-sm" : "drop-shadow-sm";
          div.appendChild(span);
        }

        const isTarget = legalTargets.some((t) => t.to === square);
        if (isTarget) {
          const dot = document.createElement("span");
          dot.className = piece
            ? "absolute inset-0 rounded-full ring-4 ring-accent-500/70 ring-inset pointer-events-none"
            : "absolute w-1/4 h-1/4 rounded-full bg-accent-500/70 pointer-events-none";
          div.appendChild(dot);
        }

        div.addEventListener("click", () => onSquareClick(square));
        boardEl.appendChild(div);
      }
    }
  }

  function pieceGlyphOf(type, color) {
    return GLYPH[color][type];
  }

  function updateCapturedDisplay() {
    capturedByWhiteEl.textContent = capturedByWhite.join(" ");
    capturedByBlackEl.textContent = capturedByBlack.join(" ");
  }

  function updateHistoryDisplay() {
    const hist = game.history();
    if (!hist.length) {
      historyEl.innerHTML = '<p class="text-brand-300">Sin jugadas todavía…</p>';
      return;
    }
    let html = "";
    for (let i = 0; i < hist.length; i += 2) {
      const moveNum = i / 2 + 1;
      const white = hist[i] || "";
      const black = hist[i + 1] || "";
      html += `<p>${moveNum}. ${white} ${black}</p>`;
    }
    historyEl.innerHTML = html;
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  function getGameOverMessage() {
    if (game.in_checkmate()) {
      return game.turn() === "w" ? "Jaque mate — ¡Oscar gana! ♟️" : "Jaque mate — ¡Ganaste! 🎉";
    }
    if (game.in_stalemate()) return "Tablas por ahogado";
    if (game.in_threefold_repetition()) return "Tablas por repetición";
    if (typeof game.insufficient_material === "function" && game.insufficient_material()) {
      return "Tablas por material insuficiente";
    }
    if (game.in_draw()) return "Tablas";
    return null;
  }

  function updateStatus() {
    const overMsg = getGameOverMessage();
    if (overMsg) {
      statusEl.textContent = overMsg;
      turnEl.textContent = "Partida terminada";
      return;
    }
    if (isBotThinking) {
      turnEl.textContent = "Turno: Negras (Oscar)";
      statusEl.textContent = "Oscar está pensando…";
    } else if (game.turn() === "w") {
      turnEl.textContent = "Turno: Blancas";
      statusEl.textContent = game.in_check() ? "¡Jaque! Tu turno" : "¡Tu turno!";
    } else {
      turnEl.textContent = "Turno: Negras (Oscar)";
      statusEl.textContent = "Oscar está pensando…";
    }
  }

  function applyMoveSideEffects(moveResult) {
    if (moveResult.captured) {
      const glyph = pieceGlyphOf(moveResult.captured, moveResult.color === "w" ? "b" : "w");
      if (moveResult.color === "w") capturedByWhite.push(glyph);
      else capturedByBlack.push(glyph);
    }
    lastMove = { from: moveResult.from, to: moveResult.to };
    updateCapturedDisplay();
    updateHistoryDisplay();
  }

  function isGameOver() {
    return typeof game.game_over === "function" ? game.game_over() : !!getGameOverMessage();
  }

  async function triggerBotMove() {
    if (isGameOver()) {
      updateStatus();
      return;
    }
    isBotThinking = true;
    updateStatus();
    renderBoard();

    const difficulty = difficultyEl ? difficultyEl.value : "medium";
    // pequeña pausa para que "Oscar está pensando…" se alcance a ver incluso si el libro responde al instante
    const minDelay = new Promise((r) => setTimeout(r, 280));
    const [move] = await Promise.all([OscarBot.getMove(game, difficulty), minDelay]);

    isBotThinking = false;
    if (move) {
      const result = game.move({ from: move.from, to: move.to, promotion: move.promotion });
      if (result) applyMoveSideEffects(result);
    }
    renderBoard();
    updateStatus();
  }

  function doUserMove(from, to, promotion) {
    const result = game.move({ from, to, promotion });
    if (!result) return;
    applyMoveSideEffects(result);
    renderBoard();
    updateStatus();
    if (!isGameOver()) {
      triggerBotMove();
    }
  }

  // ---------- Selector de promoción ----------
  function showPromotionPicker(color, onPick) {
    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 bg-brand-900/60 z-[60] flex items-center justify-center";
    const panel = document.createElement("div");
    panel.className = "bg-white rounded-xl shadow-2xl p-6 flex flex-col items-center gap-4";
    const title = document.createElement("p");
    title.className = "font-serif font-bold text-brand-800";
    title.textContent = "Elige una pieza:";
    panel.appendChild(title);

    const row = document.createElement("div");
    row.className = "flex gap-3";
    const pieces = ["q", "r", "b", "n"];
    pieces.forEach((p) => {
      const btn = document.createElement("button");
      btn.className =
        "text-4xl bg-brand-50 hover:bg-accent-400 rounded-lg w-16 h-16 flex items-center justify-center border border-brand-200 transition-colors";
      btn.textContent = GLYPH[color][p];
      btn.addEventListener("click", () => {
        document.body.removeChild(overlay);
        onPick(p);
      });
      row.appendChild(btn);
    });
    panel.appendChild(row);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  function onSquareClick(square) {
    if (isBotThinking || isGameOver() || game.turn() !== "w") return;
    const piece = game.get(square);

    if (selected) {
      const target = legalTargets.find((t) => t.to === square);
      if (target) {
        if (target.flags.indexOf("p") !== -1) {
          // promoción de peón
          const from = selected;
          selected = null;
          legalTargets = [];
          showPromotionPicker("w", (promo) => doUserMove(from, square, promo));
          renderBoard();
          return;
        }
        const from = selected;
        selected = null;
        legalTargets = [];
        doUserMove(from, square, undefined);
        return;
      }
      if (piece && piece.color === "w") {
        selected = square;
        legalTargets = game.moves({ square, verbose: true });
        renderBoard();
        return;
      }
      selected = null;
      legalTargets = [];
      renderBoard();
      return;
    }

    if (piece && piece.color === "w") {
      selected = square;
      legalTargets = game.moves({ square, verbose: true });
      renderBoard();
    }
  }

  function resetGame() {
    game.reset();
    selected = null;
    legalTargets = [];
    lastMove = null;
    isBotThinking = false;
    capturedByWhite = [];
    capturedByBlack = [];
    updateCapturedDisplay();
    updateHistoryDisplay();
    renderBoard();
    updateStatus();
  }

  if (resetBtn) resetBtn.addEventListener("click", resetGame);

  function applyDifficultyLabels() {
    if (!difficultyEl || typeof OscarBot === "undefined" || !OscarBot.difficultyLabels) return;
    Array.from(difficultyEl.options).forEach((opt) => {
      const label = OscarBot.difficultyLabels[opt.value];
      if (label) opt.textContent = label;
    });
  }

  // Estado inicial
  renderBoard();
  updateCapturedDisplay();
  updateHistoryDisplay();
  updateStatus();
  applyDifficultyLabels();
  if (typeof OscarBot !== "undefined") OscarBot.preload();
})();
