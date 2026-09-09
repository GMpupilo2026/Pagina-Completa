/**
 * tablero-board.js — Tablero e interacción para la página tablero.html de Ajedrez Integral.
 * Requiere: chess.js, oscar-book.js y chess-bot.js cargados antes que este archivo.
 * El visitante elige si juega con blancas o con negras; el bot (Oscar) juega el otro color.
 */
(function () {
  "use strict";

  const boardEl = document.getElementById("chessboard");
  const turnEl = document.getElementById("turn-indicator");
  const statusEl = document.getElementById("status-msg");
  const difficultyEl = document.getElementById("difficulty");
  const colorEl = document.getElementById("player-color");
  const resetBtn = document.getElementById("reset-btn");
  const capturedByWhiteEl = document.getElementById("captured-by-white");
  const capturedByBlackEl = document.getElementById("captured-by-black");
  const historyEl = document.getElementById("move-history");
  const statWinsEl = document.getElementById("stat-wins");
  const statDrawsEl = document.getElementById("stat-draws");
  const statLossesEl = document.getElementById("stat-losses");
  // Elementos opcionales de "Valor pedagógico" (sólo existen en tablero.html, no en el
  // tablero compacto del inicio): barra de evaluación/material, análisis post-partida y
  // origen real de las jugadas de Oscar.
  const evalBarWhiteEl = document.getElementById("eval-bar-white");
  const evalLabelEl = document.getElementById("eval-label");
  const materialLabelEl = document.getElementById("material-label");
  const analyzeBtn = document.getElementById("analyze-btn");
  const analyzeStatusEl = document.getElementById("analyze-status");
  const analyzeResultsEl = document.getElementById("analyze-results");
  const originsToggleEl = document.getElementById("origins-toggle");
  const originsPanelEl = document.getElementById("origins-panel");

  if (!boardEl || typeof Chess === "undefined") {
    console.error("Falta el tablero o la librería chess.js");
    return;
  }

  const game = new Chess();
  let userColor = colorEl ? colorEl.value : "w"; // "w" o "b" — color con el que juega el visitante
  let selected = null; // casilla seleccionada, ej. "e2"
  let legalTargets = []; // jugadas legales (verbose) desde la casilla seleccionada
  let lastMove = null; // {from, to} de la última jugada, para resaltarla
  let isBotThinking = false;
  let focusSquare = null; // casilla con tabindex="0" (tabulación circular / roving tabindex) para el teclado
  let forceFocusRestore = false; // fuerza devolver el foco al tablero en el próximo renderBoard() (p.ej. tras promocionar)
  let capturedByWhite = []; // piezas negras capturadas por blancas
  let capturedByBlack = []; // piezas blancas capturadas por negras
  let resultRecorded = false; // evita contar dos veces el resultado de una misma partida
  let botBookMoves = []; // jugadas del bot que salieron del libro de Oscar: {moveNum, san, hash, uci}
  let evalRequestId = 0; // descarta respuestas de evaluación que ya quedaron obsoletas (posición cambió)

  // ---------- Contador de partidas (ganadas/tablas/perdidas), guardado en este navegador ----------
  const STATS_KEY = "oscarChessStats_v1";

  function loadStats() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        wins: (parsed && Number(parsed.wins)) || 0,
        draws: (parsed && Number(parsed.draws)) || 0,
        losses: (parsed && Number(parsed.losses)) || 0,
      };
    } catch (e) {
      return { wins: 0, draws: 0, losses: 0 };
    }
  }

  function saveStats() {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (e) {}
  }

  const stats = loadStats();

  function renderStats() {
    if (statWinsEl) statWinsEl.textContent = String(stats.wins);
    if (statDrawsEl) statDrawsEl.textContent = String(stats.draws);
    if (statLossesEl) statLossesEl.textContent = String(stats.losses);
  }

  const GLYPH = {
    w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
    b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
  };

  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

  function botColor() {
    return userColor === "w" ? "b" : "w";
  }

  function colorLabel(c) {
    return c === "w" ? "Blancas" : "Negras";
  }

  function isLightSquare(square) {
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1], 10) - 1;
    return (file + rank) % 2 === 1;
  }

  function squareClasses(square) {
    const light = isLightSquare(square);
    let cls =
      "flex items-center justify-center text-3xl sm:text-4xl md:text-5xl cursor-pointer select-none relative transition-colors w-full h-full border-0 p-0 m-0 ";
    cls += light ? "bg-brand-100 " : "bg-brand-500 ";
    if (selected === square) {
      cls += "outline outline-4 -outline-offset-4 outline-accent-500 ";
    } else if (lastMove && (lastMove.from === square || lastMove.to === square)) {
      cls += light ? "bg-accent-400/40 " : "bg-accent-600/50 ";
    }
    return cls;
  }

  // ---------- Accesibilidad: nombres de piezas en español para lectores de pantalla ----------
  const PIECE_INFO = {
    p: { name: "peón", fem: false },
    n: { name: "caballo", fem: false },
    b: { name: "alfil", fem: false },
    r: { name: "torre", fem: true },
    q: { name: "dama", fem: true },
    k: { name: "rey", fem: false },
  };

  function colorAdjective(color, fem) {
    if (color === "w") return fem ? "blanca" : "blanco";
    return fem ? "negra" : "negro";
  }

  function pieceLabel(piece) {
    const info = PIECE_INFO[piece.type];
    return info.name + " " + colorAdjective(piece.color, info.fem);
  }

  // Descripción hablada de una casilla (pieza, si está seleccionada, si es un movimiento
  // posible o la última jugada), para el aria-label del botón de cada casilla.
  function squareAriaLabel(square) {
    const piece = game.get(square);
    let label = square + ", " + (piece ? pieceLabel(piece) : "casilla vacía");
    const extras = [];
    if (selected === square) {
      extras.push("seleccionada");
    } else if (legalTargets.some((t) => t.to === square)) {
      extras.push(piece ? "puedes capturar aquí" : "movimiento posible");
    }
    if (lastMove && (lastMove.from === square || lastMove.to === square)) {
      extras.push("última jugada");
    }
    if (extras.length) label += ", " + extras.join(", ");
    return label;
  }

  // Devuelve las casillas en el orden en que deben pintarse (fila por fila, izq. a der.)
  // según de qué lado esté jugando el visitante.
  function boardSquaresInOrder() {
    const squares = [];
    if (userColor === "b") {
      // Vista desde negras: fila 1 arriba, columnas de h a a.
      for (let rank = 1; rank <= 8; rank++) {
        for (let f = 7; f >= 0; f--) {
          squares.push(FILES[f] + rank);
        }
      }
    } else {
      // Vista desde blancas (por defecto): fila 8 arriba, columnas de a a h.
      for (let rank = 8; rank >= 1; rank--) {
        for (let f = 0; f < 8; f++) {
          squares.push(FILES[f] + rank);
        }
      }
    }
    return squares;
  }

  function renderBoard() {
    // Conserva el foco del teclado en la misma casilla tras volver a pintar el tablero
    // (se reconstruye por completo en cada jugada), para no interrumpir la navegación.
    const previouslyFocused = document.activeElement;
    const hadFocusInBoard = boardEl.contains(previouslyFocused) || forceFocusRestore;
    forceFocusRestore = false;

    boardEl.innerHTML = "";
    const squares = boardSquaresInOrder();
    if (!focusSquare || squares.indexOf(focusSquare) === -1) {
      focusSquare = squares[0];
    }

    for (const square of squares) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = squareClasses(square);
      btn.setAttribute("data-square", square);
      btn.setAttribute("aria-label", squareAriaLabel(square));
      // Tabulación circular ("roving tabindex"): sólo una casilla es alcanzable con Tab;
      // dentro del tablero se navega con las flechas (ver el listener de keydown más abajo).
      btn.tabIndex = square === focusSquare ? 0 : -1;

      const piece = game.get(square);
      if (piece) {
        const span = document.createElement("span");
        span.textContent = GLYPH[piece.color][piece.type];
        // Los glifos Unicode de piezas "blancas" (♔♕♖♗♘♙) son sólo un contorno hueco: si se
        // pintan con el mismo color que las negras (heredado del texto de la página) quedan
        // indistinguibles entre sí. piece-white/piece-black (css/styles.css) les dan relleno y
        // contorno propios para que se vean claramente en cualquier casilla y en cualquier tema.
        span.className = piece.color === "w" ? "piece-white" : "piece-black";
        span.setAttribute("aria-hidden", "true");
        btn.appendChild(span);
      }

      const isTarget = legalTargets.some((t) => t.to === square);
      if (isTarget) {
        const dot = document.createElement("span");
        dot.setAttribute("aria-hidden", "true");
        dot.className = piece
          ? "absolute inset-0 rounded-full ring-4 ring-accent-500/70 ring-inset pointer-events-none"
          : "absolute w-1/4 h-1/4 rounded-full bg-accent-500/70 pointer-events-none";
        btn.appendChild(dot);
      }

      btn.addEventListener("click", () => onSquareClick(square));
      boardEl.appendChild(btn);
    }

    if (hadFocusInBoard) {
      const target = boardEl.querySelector('[data-square="' + focusSquare + '"]');
      if (target) target.focus();
    }
  }

  // Navegación con flechas del teclado entre casillas (respeta el volteo del tablero
  // cuando el visitante juega con negras, porque usa boardSquaresInOrder()). Enter/espacio
  // activan la casilla enfocada de forma nativa, al ser <button>.
  boardEl.addEventListener("keydown", (e) => {
    const key = e.key;
    if (key !== "ArrowUp" && key !== "ArrowDown" && key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") {
      return;
    }
    const currentSquare = e.target && e.target.getAttribute ? e.target.getAttribute("data-square") : null;
    if (!currentSquare) return;
    e.preventDefault();

    const squares = boardSquaresInOrder();
    const idx = squares.indexOf(currentSquare);
    if (idx === -1) return;
    const row = Math.floor(idx / 8);
    const col = idx % 8;
    let newRow = row;
    let newCol = col;
    if (key === "ArrowUp") newRow = Math.max(0, row - 1);
    else if (key === "ArrowDown") newRow = Math.min(7, row + 1);
    else if (key === "ArrowLeft") newCol = Math.max(0, col - 1);
    else if (key === "ArrowRight") newCol = Math.min(7, col + 1);
    else if (key === "Home") newCol = 0;
    else if (key === "End") newCol = 7;

    const newSquare = squares[newRow * 8 + newCol];
    if (!newSquare || newSquare === currentSquare) return;
    const oldBtn = boardEl.querySelector('[data-square="' + currentSquare + '"]');
    const newBtn = boardEl.querySelector('[data-square="' + newSquare + '"]');
    if (oldBtn) oldBtn.tabIndex = -1;
    if (newBtn) {
      newBtn.tabIndex = 0;
      newBtn.focus();
    }
    focusSquare = newSquare;
  });

  function pieceGlyphOf(type, color) {
    return GLYPH[color][type];
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Material y barra de evaluación en vivo ----------
  const MATERIAL_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  function computeMaterialDiff() {
    const board = game.board();
    let white = 0;
    let black = 0;
    for (const row of board) {
      for (const cell of row) {
        if (!cell) continue;
        const v = MATERIAL_VALUE[cell.type] || 0;
        if (cell.color === "w") white += v;
        else black += v;
      }
    }
    return white - black;
  }

  function updateMaterialDisplay() {
    if (!materialLabelEl) return;
    const diff = computeMaterialDiff();
    if (diff === 0) materialLabelEl.textContent = "Material: igual";
    else if (diff > 0) materialLabelEl.textContent = "Material: +" + diff + " (blancas)";
    else materialLabelEl.textContent = "Material: +" + -diff + " (negras)";
  }

  // Convierte { type: "cp"|"mate", value } (desde el punto de vista de quien mueve en esa
  // posición) a centipawns desde el punto de vista de las BLANCAS, para la barra de evaluación.
  function scoreToWhiteCp(score, turnAtEval) {
    if (!score) return null;
    let value;
    if (score.type === "mate") {
      value = score.value > 0 ? 100000 - score.value : -100000 - score.value;
    } else {
      value = score.value;
    }
    return turnAtEval === "w" ? value : -value;
  }

  // Aplasta centipawns a un porcentaje 2-98 para el ancho de la barra (parecido a lichess).
  function evalToBarPercent(whiteCp) {
    if (whiteCp === null) return 50;
    const k = 0.0035;
    const pct = 50 + 50 * (2 / (1 + Math.exp(-k * whiteCp)) - 1);
    return Math.max(2, Math.min(98, pct));
  }

  async function updateEvalBar() {
    if (!evalBarWhiteEl && !evalLabelEl) return;
    if (typeof OscarBot === "undefined" || !OscarBot.evaluatePosition) return;
    const myRequestId = ++evalRequestId;
    const fen = game.fen();
    const turnAtEval = game.turn();
    if (evalLabelEl) evalLabelEl.textContent = "Evaluación: calculando…";
    let score = null;
    try {
      score = await OscarBot.evaluatePosition(fen);
    } catch (e) {}
    if (myRequestId !== evalRequestId) return; // la posición ya cambió mientras esperábamos
    const whiteCp = scoreToWhiteCp(score, turnAtEval);
    if (evalBarWhiteEl) evalBarWhiteEl.style.width = evalToBarPercent(whiteCp) + "%";
    if (evalLabelEl) {
      if (whiteCp === null) evalLabelEl.textContent = "Evaluación: no disponible";
      else if (score.type === "mate") evalLabelEl.textContent = "Evaluación: mate en " + Math.abs(score.value);
      else evalLabelEl.textContent = "Evaluación: " + (whiteCp >= 0 ? "+" : "") + (whiteCp / 100).toFixed(1);
    }
  }

  // ---------- Analizar partida (imprecisiones/errores del visitante) ----------
  function scoreToMoverCp(score) {
    if (!score) return null;
    if (score.type === "mate") {
      return score.value > 0 ? 100000 - score.value * 100 : -100000 - score.value * 100;
    }
    return score.value;
  }

  function renderAnalysis(flagged, truncated) {
    if (!analyzeResultsEl) return;
    if (!flagged.length) {
      analyzeResultsEl.innerHTML =
        '<p class="text-green-700 dark:text-green-400">No se detectaron errores importantes en tus jugadas. ¡Buena partida! 👏</p>';
      return;
    }
    let html = '<ul class="space-y-1">';
    for (const f of flagged) {
      const color =
        f.severity === "error grave"
          ? "text-red-600 dark:text-red-400"
          : f.severity === "error"
          ? "text-orange-600 dark:text-orange-400"
          : "text-yellow-700 dark:text-yellow-400";
      html += `<li class="${color}">Jugada ${f.moveNum} (${escapeHtml(f.san)}): ${f.severity} — perdiste unos ${(f.loss / 100).toFixed(1)} peones de ventaja</li>`;
    }
    html += "</ul>";
    if (truncated) html += '<p class="text-xs text-brand-400 mt-2">(Sólo se analizaron las primeras 40 jugadas de cada lado.)</p>';
    analyzeResultsEl.innerHTML = html;
  }

  async function analyzeGame() {
    if (!analyzeBtn) return;
    if (typeof OscarBot === "undefined" || !OscarBot.evaluatePosition || typeof Chess === "undefined") return;
    const moves = game.history({ verbose: true });
    if (!moves.length) return;

    analyzeBtn.disabled = true;
    if (analyzeResultsEl) analyzeResultsEl.innerHTML = "";
    const MAX_PLIES_ANALYZED = 80; // ~40 jugadas por lado, para acotar el tiempo de análisis
    const limited = moves.slice(0, MAX_PLIES_ANALYZED);

    const replay = new Chess();
    const fens = [replay.fen()];
    const sans = [];
    const movers = [];
    for (const m of limited) {
      const applied = replay.move({ from: m.from, to: m.to, promotion: m.promotion });
      sans.push(applied ? applied.san : m.san);
      movers.push(m.color);
      fens.push(replay.fen());
    }

    const scores = [];
    for (let i = 0; i < fens.length; i++) {
      if (analyzeStatusEl) analyzeStatusEl.textContent = `Analizando… posición ${i + 1} de ${fens.length}`;
      let s = null;
      try {
        s = await OscarBot.evaluatePosition(fens[i], 400);
      } catch (e) {}
      scores.push(scoreToMoverCp(s));
    }
    if (analyzeStatusEl) analyzeStatusEl.textContent = "";

    const flagged = [];
    for (let i = 0; i < limited.length; i++) {
      if (movers[i] !== userColor) continue; // sólo señalamos las jugadas del visitante
      const before = scores[i];
      const afterRaw = scores[i + 1];
      if (before === null || afterRaw === null) continue;
      const afterFromMoverView = -afterRaw;
      const loss = before - afterFromMoverView;
      let severity = null;
      if (loss >= 250) severity = "error grave";
      else if (loss >= 120) severity = "error";
      else if (loss >= 55) severity = "imprecisión";
      if (severity) {
        flagged.push({ moveNum: Math.floor(i / 2) + 1, san: sans[i], severity, loss: Math.round(loss) });
      }
    }
    renderAnalysis(flagged, limited.length < moves.length);
    analyzeBtn.disabled = false;
  }

  if (analyzeBtn) analyzeBtn.addEventListener("click", analyzeGame);

  // ---------- Origen real de las jugadas del bot (de qué partida de Oscar salieron) ----------
  function renderOrigins() {
    if (!originsPanelEl) return;
    if (!botBookMoves.length) {
      originsPanelEl.innerHTML =
        '<p class="text-brand-400 dark:text-brand-500">Cuando Oscar (el bot) juegue una jugada tomada de una de sus partidas reales, aparecerá aquí.</p>';
      return;
    }
    let html = "";
    for (const bm of botBookMoves) {
      const origin =
        typeof OscarBot !== "undefined" && OscarBot.getMoveOrigin ? OscarBot.getMoveOrigin(bm.hash, bm.uci) : null;
      if (!origin) {
        html += `<p>Jugada ${bm.moveNum} (${escapeHtml(bm.san)}): tomada del libro de partidas reales de Oscar.</p>`;
      } else {
        html += `<p>Jugada ${bm.moveNum} (${escapeHtml(bm.san)}): de una partida real (${escapeHtml(
          origin.bucketLabel
        )}) de Oscar contra <strong>${escapeHtml(origin.opponent)}</strong> el ${escapeHtml(
          origin.date.replace(/\./g, "-")
        )} — ${escapeHtml(origin.resultLabel)}.</p>`;
      }
    }
    originsPanelEl.innerHTML = html;
  }

  if (originsToggleEl && originsPanelEl) {
    originsToggleEl.addEventListener("click", () => {
      const isHidden = originsPanelEl.classList.contains("hidden");
      originsPanelEl.classList.toggle("hidden");
      originsToggleEl.setAttribute("aria-expanded", isHidden ? "true" : "false");
    });
  }

  // capturedByWhiteEl/capturedByBlackEl/historyEl son opcionales: algunas páginas
  // (como el tablero compacto del inicio) sólo traen el tablero, sin estos paneles.
  function updateCapturedDisplay() {
    if (capturedByWhiteEl) capturedByWhiteEl.textContent = capturedByWhite.join(" ");
    if (capturedByBlackEl) capturedByBlackEl.textContent = capturedByBlack.join(" ");
  }

  function updateHistoryDisplay() {
    if (!historyEl) return;
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

  // Devuelve info estructurada de fin de partida (o { over: false }), para poder
  // tanto mostrar un mensaje como llevar el contador de ganadas/tablas/perdidas.
  function getGameOverInfo() {
    if (game.in_checkmate()) {
      // Quien tiene el turno ahora está en jaque mate; el otro color ganó.
      const winner = game.turn() === "w" ? "b" : "w";
      return { over: true, draw: false, winner };
    }
    if (game.in_stalemate()) return { over: true, draw: true, reason: "ahogado" };
    if (game.in_threefold_repetition()) return { over: true, draw: true, reason: "repetición" };
    if (typeof game.insufficient_material === "function" && game.insufficient_material()) {
      return { over: true, draw: true, reason: "material insuficiente" };
    }
    if (game.in_draw()) return { over: true, draw: true, reason: null };
    return { over: false };
  }

  function getGameOverMessage(info) {
    if (!info.over) return null;
    if (!info.draw) {
      return info.winner === userColor ? "Jaque mate — ¡Ganaste! 🎉" : "Jaque mate — ¡Oscar gana! ♟️";
    }
    if (info.reason === "ahogado") return "Tablas por ahogado";
    if (info.reason === "repetición") return "Tablas por repetición";
    if (info.reason === "material insuficiente") return "Tablas por material insuficiente";
    return "Tablas";
  }

  // Suma el resultado a las estadísticas guardadas la primera vez que se detecta
  // el fin de una partida (resultRecorded evita contarlo de nuevo en renders posteriores).
  function recordResultOnce(info) {
    if (resultRecorded || !info.over) return;
    resultRecorded = true;
    if (info.draw) {
      stats.draws++;
    } else if (info.winner === userColor) {
      stats.wins++;
    } else {
      stats.losses++;
    }
    saveStats();
    renderStats();
  }

  function updateStatus() {
    const info = getGameOverInfo();
    if (info.over) {
      recordResultOnce(info);
      if (statusEl) statusEl.textContent = getGameOverMessage(info);
      if (turnEl) turnEl.textContent = "Partida terminada";
      if (analyzeBtn && game.history().length > 0) analyzeBtn.disabled = false;
      return;
    }
    const turn = game.turn();
    const whoLabel = turn === userColor ? "(tú)" : "(Oscar)";
    if (turnEl) turnEl.textContent = `Turno: ${colorLabel(turn)} ${whoLabel}`;
    if (!statusEl) {
      // nada más que hacer si esta página no incluye el panel de estado
    } else if (isBotThinking) {
      statusEl.textContent = "Oscar está pensando…";
    } else if (turn === userColor) {
      statusEl.textContent = game.in_check() ? "¡Jaque! Tu turno" : "¡Tu turno!";
    } else {
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
    updateMaterialDisplay();
  }

  function isGameOver() {
    return typeof game.game_over === "function" ? game.game_over() : getGameOverInfo().over;
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
      if (result) {
        applyMoveSideEffects(result);
        focusSquare = result.to; // si el foco ya estaba en el tablero, sigue la jugada de Oscar
        // Si la jugada salió del libro de aperturas de Oscar, guardamos de qué posición/jugada
        // exacta se trata para poder mostrar luego de qué partida real vino (ver renderOrigins).
        if (move._bookHash && move._bookUci) {
          botBookMoves.push({
            moveNum: Math.ceil(game.history().length / 2),
            san: result.san,
            hash: move._bookHash,
            uci: move._bookUci,
          });
          renderOrigins();
        }
      }
    }
    renderBoard();
    updateStatus();
  }

  // Si le toca mover al bot (y la partida sigue), dispara su jugada. Devuelve una promesa
  // (se resuelve enseguida si no le toca al bot) para poder encadenar la actualización de la
  // barra de evaluación DESPUÉS de que el bot termine de pensar, y no competir por el motor.
  function maybeTriggerBot() {
    if (isGameOver()) return Promise.resolve();
    if (game.turn() === botColor()) {
      return triggerBotMove();
    }
    return Promise.resolve();
  }

  function doUserMove(from, to, promotion) {
    const result = game.move({ from, to, promotion });
    if (!result) return;
    applyMoveSideEffects(result);
    focusSquare = to; // lleva el foco del teclado a la casilla donde acaba de mover
    renderBoard();
    updateStatus();
    maybeTriggerBot().then(updateEvalBar);
  }

  // ---------- Selector de promoción (accesible: diálogo modal, navegable con teclado) ----------
  const PROMOTION_NAMES_ES = { q: "Dama", r: "Torre", b: "Alfil", n: "Caballo" };

  function showPromotionPicker(color, onPick) {
    const returnFocusTo = document.activeElement;

    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 bg-brand-900/60 z-[60] flex items-center justify-center";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    const panel = document.createElement("div");
    panel.className = "bg-white dark:bg-brand-900 rounded-xl shadow-2xl p-6 flex flex-col items-center gap-4";
    const title = document.createElement("p");
    title.className = "font-serif font-bold text-brand-800 dark:text-white";
    title.id = "promotion-picker-title-" + Date.now();
    title.textContent = "Elige una pieza:";
    panel.appendChild(title);
    overlay.setAttribute("aria-labelledby", title.id);

    const row = document.createElement("div");
    row.className = "flex gap-3";
    const pieces = ["q", "r", "b", "n"];
    const buttons = [];

    function closeOverlay() {
      document.removeEventListener("keydown", onKeyDown, true);
      if (overlay.parentNode) document.body.removeChild(overlay);
      if (returnFocusTo && typeof returnFocusTo.focus === "function") {
        returnFocusTo.focus();
      }
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        // Cancela la promoción sin mover: onSquareClick ya limpió la selección antes de abrir este diálogo.
        closeOverlay();
        renderBoard();
      } else if (e.key === "Tab") {
        // Foco atrapado dentro del diálogo mientras esté abierto.
        e.preventDefault();
        const idx = buttons.indexOf(document.activeElement);
        let next;
        if (e.shiftKey) next = idx <= 0 ? buttons.length - 1 : idx - 1;
        else next = idx === buttons.length - 1 ? 0 : idx + 1;
        buttons[next].focus();
      }
    }

    pieces.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "text-4xl bg-brand-50 dark:bg-brand-800 hover:bg-accent-400 rounded-lg w-16 h-16 flex items-center justify-center border border-brand-200 dark:border-brand-700 transition-colors " +
        (color === "w" ? "piece-white" : "piece-black");
      btn.textContent = GLYPH[color][p];
      btn.setAttribute("aria-label", PROMOTION_NAMES_ES[p]);
      btn.addEventListener("click", () => {
        document.removeEventListener("keydown", onKeyDown, true);
        if (overlay.parentNode) document.body.removeChild(overlay);
        forceFocusRestore = true;
        onPick(p);
      });
      row.appendChild(btn);
      buttons.push(btn);
    });
    panel.appendChild(row);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKeyDown, true);
    buttons[0].focus();
  }

  function onSquareClick(square) {
    if (isBotThinking || isGameOver() || game.turn() !== userColor) return;
    const piece = game.get(square);

    if (selected) {
      const target = legalTargets.find((t) => t.to === square);
      if (target) {
        if (target.flags.indexOf("p") !== -1) {
          // promoción de peón
          const from = selected;
          selected = null;
          legalTargets = [];
          showPromotionPicker(userColor, (promo) => doUserMove(from, square, promo));
          renderBoard();
          return;
        }
        const from = selected;
        selected = null;
        legalTargets = [];
        doUserMove(from, square, undefined);
        return;
      }
      if (piece && piece.color === userColor) {
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

    if (piece && piece.color === userColor) {
      selected = square;
      legalTargets = game.moves({ square, verbose: true });
      renderBoard();
    }
  }

  function resetGame() {
    userColor = colorEl ? colorEl.value : "w";
    game.reset();
    selected = null;
    legalTargets = [];
    lastMove = null;
    isBotThinking = false;
    focusSquare = null;
    capturedByWhite = [];
    capturedByBlack = [];
    resultRecorded = false;
    botBookMoves = [];
    updateCapturedDisplay();
    updateHistoryDisplay();
    updateMaterialDisplay();
    renderOrigins();
    if (analyzeBtn) analyzeBtn.disabled = true;
    if (analyzeStatusEl) analyzeStatusEl.textContent = "";
    if (analyzeResultsEl) analyzeResultsEl.innerHTML = "";
    renderBoard();
    updateStatus();
    // Si el visitante eligió jugar con negras, el bot (blancas) abre la partida.
    maybeTriggerBot().then(updateEvalBar);
  }

  if (resetBtn) resetBtn.addEventListener("click", resetGame);
  if (colorEl) colorEl.addEventListener("change", resetGame);

  function applyDifficultyLabels() {
    if (!difficultyEl || typeof OscarBot === "undefined" || !OscarBot.difficultyLabels) return;
    Array.from(difficultyEl.options).forEach((opt) => {
      const label = OscarBot.difficultyLabels[opt.value];
      if (label) opt.textContent = label;
    });
  }

  // ---------- Accesibilidad: roles/etiquetas ARIA para lector de pantalla ----------
  // Todo esto vive aquí (no en el HTML) para que aplique por igual a tablero.html y al
  // tablero compacto de index.html, que comparten este mismo script.
  boardEl.setAttribute("role", "group");
  boardEl.setAttribute("aria-label", "Tablero de ajedrez");
  if (boardEl.parentNode) {
    let instructionsEl = document.getElementById("board-instructions");
    if (!instructionsEl) {
      instructionsEl = document.createElement("p");
      instructionsEl.id = "board-instructions";
      instructionsEl.className = "sr-only";
      instructionsEl.textContent =
        "Tablero de ajedrez interactivo. Usa las flechas del teclado para moverte entre las casillas, e Inicio o Fin para ir al extremo de la fila. Presiona Enter o espacio sobre una pieza propia para seleccionarla, y sobre una casilla resaltada para mover ahí. Al promocionar un peón, usa las flechas o Tab para elegir la pieza y Enter para confirmar, o Escape para cancelar.";
      boardEl.parentNode.insertBefore(instructionsEl, boardEl.nextSibling);
    }
    boardEl.setAttribute("aria-describedby", "board-instructions");
  }
  if (turnEl) {
    turnEl.setAttribute("role", "status");
    turnEl.setAttribute("aria-live", "polite");
  }
  if (statusEl) {
    statusEl.setAttribute("role", "status");
    statusEl.setAttribute("aria-live", "polite");
  }
  if (colorEl && !colorEl.getAttribute("aria-label")) colorEl.setAttribute("aria-label", "Elegir tu color");
  if (difficultyEl && !difficultyEl.getAttribute("aria-label")) difficultyEl.setAttribute("aria-label", "Elegir nivel de dificultad");
  if (resetBtn && !resetBtn.getAttribute("aria-label")) resetBtn.setAttribute("aria-label", "Reiniciar partida");

  // Estado inicial
  renderBoard();
  updateCapturedDisplay();
  updateHistoryDisplay();
  updateMaterialDisplay();
  renderOrigins();
  renderStats();
  updateStatus();
  applyDifficultyLabels();
  if (typeof OscarBot !== "undefined") {
    OscarBot.preload();
    if (OscarBot.preloadProvenance) OscarBot.preloadProvenance().then(renderOrigins);
  }
  maybeTriggerBot().then(updateEvalBar);
})();
