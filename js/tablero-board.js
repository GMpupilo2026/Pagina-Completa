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
  // Elementos opcionales de las funciones nuevas: rendirse, captura de leads por correo,
  // y Modo Desafío / Posición del Día (sólo existen en tablero.html).
  const resignBtn = document.getElementById("resign-btn");
  const leadSectionEl = document.getElementById("lead-capture");
  const leadFormEl = document.getElementById("lead-form");
  const leadNameEl = document.getElementById("lead-name");
  const leadEmailEl = document.getElementById("lead-email");
  const leadStatusEl = document.getElementById("lead-status");
  const challengeInfoEl = document.getElementById("challenge-info");
  const challengePlayBtn = document.getElementById("challenge-play-btn");
  const challengeShuffleBtn = document.getElementById("challenge-shuffle-btn");
  const challengeExitBtn = document.getElementById("challenge-exit-btn");
  // Elementos opcionales de accesibilidad para lectores de pantalla: repetir jugadas
  // habladas, y escribir la jugada en un recuadro de texto en vez de navegar el tablero.
  const repeatMovesBtn = document.getElementById("repeat-moves-btn");
  const repeatMovesStatusEl = document.getElementById("repeat-moves-status");
  const moveFormEl = document.getElementById("move-form");
  const moveInputEl = document.getElementById("move-input");
  const moveInputStatusEl = document.getElementById("move-input-status");
  const positionReadoutEl = document.getElementById("position-readout");
  // Interruptor "modo normal" / "modo adaptado" (lector de pantalla): controla qué tan
  // visibles están los elementos de accesibilidad y si los atajos de teclado extra del
  // tablero (más allá de las flechas) están activos.
  const modeNormalBtn = document.getElementById("mode-normal-btn");
  const modeBlindBtn = document.getElementById("mode-blind-btn");

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
  let resigned = false; // true si el visitante se rindió (termina la partida como derrota suya)
  let startFen = null; // FEN inicial de la partida actual si viene de "Modo Desafío"; null = partida estándar desde el inicio
  let challengeEntry = null; // {fen, opponent, date, oscarColor, result, moveNum} si estamos jugando el Modo Desafío
  let gameStartTime = Date.now(); // marca de tiempo del inicio de la partida actual, para calcular la duración
  let lastAnalysis = null; // {accuracy, flaggedCount, plies} tras "Analizar mis jugadas" (para el modal/correo)
  let closeEndGameModal = null; // cierra el modal de fin de partida abierto, si lo hay (ver showEndGameModal)
  let lastCapturedInfo = null; // {type, color} de la pieza capturada en la última jugada, o null si no hubo captura
  let historyReviewIndex = null; // índice de "repaso" del historial para shift+A / shift+D (sólo narra, no cambia el tablero)
  let analyzingNow = false; // true mientras analyzeGame() está corriendo (evita que updateStatus() reactive el botón a mitad del análisis)

  // ---------- Modo normal / modo adaptado (lector de pantalla) ----------
  // Todo lo agregado para accesibilidad (recuadro de jugada, botón de repetir jugadas,
  // atajos de teclado extra en el tablero) queda oculto e inactivo por defecto, para que
  // quien entra normalmente no lo vea ni lo note. Se activa con este interruptor y queda
  // recordado en este navegador.
  const BLIND_MODE_KEY = "oscarBlindMode_v1";
  let blindMode = false;
  try {
    blindMode = localStorage.getItem(BLIND_MODE_KEY) === "1";
  } catch (e) {}
  // El panel de Clases enlaza aquí con "?modo=ciego" para el icono "Robot Ciego":
  // preselecciona el modo adaptado sin tener que tocar el interruptor a mano.
  try {
    if (new URLSearchParams(window.location.search).get("modo") === "ciego") {
      blindMode = true;
    }
  } catch (e) {}

  const blindOnlyEls = Array.from(document.querySelectorAll(".blind-mode-only"));
  const normalOnlyEls = Array.from(document.querySelectorAll(".normal-mode-only"));

  // Botón "🗣️ Voz": el navegador lee en voz alta cada anuncio (además de lo que ya
  // lee un lector de pantalla real), para quien no tiene uno activado. Ver
  // js/blind-notation.js para el porqué es un complemento aparte, apagado por
  // defecto. Sólo tiene sentido mostrarlo en modo adaptado (refreshSpeechToggle se
  // vuelve a llamar cada vez que cambia blindMode, ver applyBlindModeUI).
  const refreshSpeechToggle = typeof BlindNotation !== "undefined"
    ? BlindNotation.setupSpeechToggle("speech-toggle-btn", () => blindMode)
    : null;

  function applyBlindModeUI() {
    blindOnlyEls.forEach((el) => el.classList.toggle("hidden", !blindMode));
    normalOnlyEls.forEach((el) => el.classList.toggle("hidden", blindMode));
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
  }

  function setBlindMode(value) {
    blindMode = !!value;
    try {
      localStorage.setItem(BLIND_MODE_KEY, blindMode ? "1" : "0");
    } catch (e) {}
    applyBlindModeUI();
  }

  if (modeNormalBtn) modeNormalBtn.addEventListener("click", () => setBlindMode(false));
  if (modeBlindBtn) modeBlindBtn.addEventListener("click", () => setBlindMode(true));

  // ---------- Contador de partidas (ganadas/tablas/perdidas), guardado en este navegador ----------
  // Desde el punto de vista de OSCAR (el bot), no del visitante: "Ganadas" = Oscar ganó,
  // "Perdidas" = Oscar perdió. Se acumula partida a partida, en cada dispositivo/navegador.
  // v2 porque hasta ahora el contador era al revés (desde el punto de vista del visitante);
  // cambiar la clave evita reinterpretar con el significado nuevo un contador guardado con el viejo.
  const STATS_KEY = "oscarChessStats_v2";

  function loadStats() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        wins: (parsed && Number(parsed.wins)) || 0,
        draws: (parsed && Number(parsed.draws)) || 0,
        losses: (parsed && Number(parsed.losses)) || 0,
        winStreak: (parsed && Number(parsed.winStreak)) || 0,
      };
    } catch (e) {
      return { wins: 0, draws: 0, losses: 0, winStreak: 0 };
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

  // ---------- Sistema de logros e insignias ----------
  const ACHIEVEMENTS_KEY = "oscarChessAchievements_v1";
  const ACHIEVEMENTS = {
    first_game: { title: "¡Primera partida completa!", desc: "Jugaste tu primera partida completa contra Oscar." },
    first_win: { title: "Ganaste tu primera partida", desc: "Le ganaste a Oscar por primera vez." },
    perfect_defense: {
      title: "Defensa perfecta",
      desc: "Terminaste una partida sin imprecisiones ni errores, según el análisis.",
    },
    hard_level: { title: "Jugaste contra el nivel Difícil", desc: "Te atreviste a enfrentar a Oscar en modo Difícil." },
    win_streak_3: { title: "Racha de 3 victorias", desc: "Le ganaste a Oscar tres veces seguidas." },
  };

  function loadUnlockedAchievements() {
    try {
      const raw = localStorage.getItem(ACHIEVEMENTS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      return new Set();
    }
  }

  const unlockedAchievements = loadUnlockedAchievements();

  function saveUnlockedAchievements() {
    try {
      localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(Array.from(unlockedAchievements)));
    } catch (e) {}
  }

  let toastContainerEl = null;
  function ensureToastContainer() {
    if (toastContainerEl && document.body.contains(toastContainerEl)) return toastContainerEl;
    toastContainerEl = document.createElement("div");
    toastContainerEl.id = "achievement-toasts";
    toastContainerEl.className = "fixed bottom-4 right-4 z-[70] flex flex-col gap-2 items-end max-w-[calc(100vw-2rem)]";
    toastContainerEl.setAttribute("aria-live", "polite");
    document.body.appendChild(toastContainerEl);
    return toastContainerEl;
  }

  function showAchievementToast(id) {
    const info = ACHIEVEMENTS[id];
    if (!info) return;
    const container = ensureToastContainer();
    const toast = document.createElement("div");
    toast.className =
      "bg-brand-800 text-white rounded-lg shadow-2xl px-4 py-3 max-w-xs border-l-4 border-accent-500 opacity-0 translate-y-2 transition-all duration-300";
    toast.innerHTML =
      '<p class="text-xs uppercase tracking-wide text-accent-400 font-semibold mb-0.5">🏆 Logro desbloqueado</p>' +
      '<p class="font-semibold text-sm">' +
      escapeHtml(info.title) +
      "</p>" +
      '<p class="text-xs text-brand-200 mt-0.5">' +
      escapeHtml(info.desc) +
      "</p>";
    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.remove("opacity-0", "translate-y-2");
    });
    setTimeout(() => {
      toast.classList.add("opacity-0");
      setTimeout(() => toast.remove(), 400);
    }, 5000);
  }

  function unlockAchievement(id) {
    if (unlockedAchievements.has(id)) return;
    unlockedAchievements.add(id);
    saveUnlockedAchievements();
    showAchievementToast(id);
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
    const currentSquare = e.target && e.target.getAttribute ? e.target.getAttribute("data-square") : null;
    if (!currentSquare) return;

    if (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight" || key === "Home" || key === "End") {
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
      return;
    }

    // Todo lo que sigue son atajos exclusivos del "modo adaptado" (lector de pantalla):
    // en modo normal las flechas/Inicio/Fin ya alcanzan para navegar el tablero, y estos
    // atajos de una sola letra podrían chocar con lo que alguien más espera del teclado.
    if (!blindMode) return;
    handleBoardShortcutKey(e, currentSquare);
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
  // Convierte centipawns (desde la perspectiva de quien mueve) a "% de probabilidad de
  // ganar" con la misma curva sigmoide que usa lichess, para poder calcular la precisión
  // estimada sobre pérdida de % de victoria (no sobre centipawns crudos, que exagera el
  // castigo en posiciones ya muy decididas).
  function cpToWinPercent(cp) {
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  }

  function scoreToMoverCp(score) {
    if (!score) return null;
    if (score.type === "mate") {
      return score.value > 0 ? 100000 - score.value * 100 : -100000 - score.value * 100;
    }
    return score.value;
  }

  function renderAnalysis(flagged, truncated, accuracy) {
    if (!analyzeResultsEl) return;
    // Encabezado oculto sólo para lectores de pantalla: permite ubicar y navegar directo al
    // resultado del análisis (igual que el resto de la estructura en modo adaptado), y como
    // analyze-results es una región aria-live, el análisis se anuncia solo apenas termina,
    // sin depender de dónde esté el foco.
    let html = '<h4 class="sr-only">Resultado del análisis</h4>';
    if (accuracy !== null && accuracy !== undefined) {
      html += `<p class="font-semibold text-brand-700 dark:text-brand-200 mb-2">Precisión estimada: ${accuracy}%</p>`;
    }
    if (!flagged.length) {
      html += '<p class="text-green-700 dark:text-green-400">No se detectaron errores importantes en tus jugadas. ¡Buena partida! 👏</p>';
      analyzeResultsEl.innerHTML = html;
      return;
    }
    html += '<ul class="space-y-1">';
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
    if (analyzingNow) return; // ya hay un análisis en curso (por ejemplo, el automático al terminar la partida)

    analyzingNow = true;
    analyzeBtn.disabled = true;
    // Todo el cuerpo va en try/finally: así, aunque algo falle de forma inesperada (por
    // ejemplo un error al evaluar una posición fuera del try interno de más abajo), el botón
    // y el flag de "análisis en curso" siempre se liberan al final y no quedan bloqueados
    // para siempre (ni para el resto de la partida ni, al no reiniciarse en resetGame(),
    // para partidas futuras).
    try {
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
      const userLosses = [];
      for (let i = 0; i < limited.length; i++) {
        if (movers[i] !== userColor) continue; // sólo señalamos las jugadas del visitante
        const before = scores[i];
        const afterRaw = scores[i + 1];
        if (before === null || afterRaw === null) continue;
        const afterFromMoverView = -afterRaw;
        const loss = before - afterFromMoverView;
        const winPercentLoss = Math.max(0, cpToWinPercent(before) - cpToWinPercent(afterFromMoverView));
        userLosses.push(winPercentLoss);
        let severity = null;
        if (loss >= 250) severity = "error grave";
        else if (loss >= 120) severity = "error";
        else if (loss >= 55) severity = "imprecisión";
        if (severity) {
          flagged.push({ moveNum: Math.floor(i / 2) + 1, san: sans[i], severity, loss: Math.round(loss) });
        }
      }
      // Precisión estimada al estilo lichess, a partir de la pérdida media de % de
      // probabilidad de ganar en las jugadas del visitante (no de centipawns crudos).
      const accuracy = userLosses.length
        ? Math.max(
            0,
            Math.min(
              100,
              Math.round(
                (103.1668 * Math.exp(-0.04354 * (userLosses.reduce((a, b) => a + b, 0) / userLosses.length)) - 3.1669) * 10
              ) / 10
            )
          )
        : null;
      lastAnalysis = { accuracy, flaggedCount: flagged.length, plies: limited.length };
      if (flagged.length === 0 && limited.length >= 20) unlockAchievement("perfect_defense");
      renderAnalysis(flagged, limited.length < moves.length, accuracy);
      if (leadSectionEl) leadSectionEl.classList.remove("hidden");
    } catch (err) {
      if (analyzeStatusEl) analyzeStatusEl.textContent = "No se pudo completar el análisis. Intenta de nuevo.";
    } finally {
      analyzingNow = false;
      analyzeBtn.disabled = false;
    }
  }

  if (analyzeBtn) analyzeBtn.addEventListener("click", analyzeGame);

  // ---------- Origen real de las jugadas del bot (de qué partida de Oscar salieron) ----------
  // Muestra sólo la ÚLTIMA jugada del bot reconocida como salida del libro (no el historial
  // completo), con la referencia de la partida real de la que vino.
  function renderOrigins() {
    if (!originsPanelEl) return;
    if (!botBookMoves.length) {
      originsPanelEl.innerHTML =
        '<p class="text-brand-400 dark:text-brand-500">Cuando Oscar (el bot) juegue una jugada tomada de una de sus partidas reales, aparecerá aquí.</p>';
      return;
    }
    const bm = botBookMoves[botBookMoves.length - 1];
    const origin =
      typeof OscarBot !== "undefined" && OscarBot.getMoveOrigin ? OscarBot.getMoveOrigin(bm.hash, bm.uci) : null;
    let html;
    if (!origin) {
      html = `<p>Última jugada de Oscar tomada del libro: ${bm.moveNum}. ${escapeHtml(bm.san)} — buscando la partida de origen…</p>`;
    } else {
      html = `<p>Última jugada de Oscar tomada de una partida real: ${bm.moveNum}. ${escapeHtml(
        bm.san
      )}, de su partida contra <strong>${escapeHtml(origin.opponent)}</strong> el ${escapeHtml(
        origin.date.replace(/\./g, "-")
      )} — ${escapeHtml(origin.resultLabel)}.</p>`;
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
    if (resigned) return { over: true, draw: false, winner: botColor(), resigned: true };
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
    if (info.resigned) return "Te rendiste — ¡Oscar gana! ♟️";
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
  // El contador es desde el punto de vista de Oscar (el bot): "Ganadas" suma cuando gana
  // Oscar (botColor()), "Perdidas" cuando gana el visitante — no al revés.
  function recordResultOnce(info) {
    if (resultRecorded || !info.over) return;
    resultRecorded = true;
    if (info.draw) {
      stats.draws++;
      stats.winStreak = 0;
    } else if (info.winner === botColor()) {
      stats.wins++;
      stats.winStreak = 0;
    } else {
      stats.losses++;
      stats.winStreak = (stats.winStreak || 0) + 1;
    }
    saveStats();
    renderStats();

    unlockAchievement("first_game");
    if (!info.draw && info.winner === userColor) {
      unlockAchievement("first_win");
      if (stats.winStreak >= 3) unlockAchievement("win_streak_3");
    }
    if (difficultyEl && difficultyEl.value === "hard") unlockAchievement("hard_level");

    // Apenas termina la partida (en cualquiera de los dos modos), dejamos activada de una vez
    // la opción de enviarla al correo — sin esperar a que el usuario haga clic en "Analizar
    // mis jugadas" primero — y arrancamos el análisis en segundo plano para que, cuando la
    // envíe, vaya con la precisión ya calculada ("pgn y analizada").
    if (leadSectionEl) leadSectionEl.classList.remove("hidden");
    if (analyzeBtn && !lastAnalysis) analyzeGame();

    showEndGameModal(info);
  }

  function updateStatus() {
    const info = getGameOverInfo();
    if (info.over) {
      recordResultOnce(info);
      if (statusEl) statusEl.textContent = getGameOverMessage(info);
      if (turnEl) turnEl.textContent = "Partida terminada";
      if (analyzeBtn && game.history().length > 0 && !analyzingNow) analyzeBtn.disabled = false;
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
      lastCapturedInfo = { type: moveResult.captured, color: moveResult.color === "w" ? "b" : "w" };
    } else {
      lastCapturedInfo = null;
    }
    historyReviewIndex = null; // una jugada nueva reinicia el repaso de shift+A/shift+D
    lastMove = { from: moveResult.from, to: moveResult.to };
    updateCapturedDisplay();
    updateHistoryDisplay();
    updateMaterialDisplay();
    // En modo adaptado, cada jugada se anuncia por voz apenas ocurre — la propia y la
    // respuesta de Oscar — sin importar si el foco está en el tablero o en el recuadro de
    // comandos, para no depender de tener que ir a revisar manualmente con "L".
    if (blindMode) {
      const moveNum = Math.floor((game.history().length - 1) / 2) + 1;
      announceMoveInput(describeMove(moveResult, moveNum));
    }
  }

  function isGameOver() {
    if (resigned) return true;
    return typeof game.game_over === "function" ? game.game_over() : getGameOverInfo().over;
  }

  function resign() {
    if (isGameOver() || isBotThinking) return;
    resigned = true;
    updateStatus();
    renderBoard();
  }
  if (resignBtn) resignBtn.addEventListener("click", resign);

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

  // Efectos comunes tras aplicar una jugada del visitante, venga del tablero (clic/teclado)
  // o del recuadro de texto (ver handleMoveFormSubmit): actualiza capturas/historial/material,
  // vuelve a pintar, y deja que el bot responda si le toca.
  function finishUserMove(result) {
    // Si la jugada vino del recuadro de texto ("modo adaptado"), hay que devolverle el foco
    // ahí después de repintar — cada renderBoard() reconstruye las 64 casillas del tablero
    // desde cero, y ese mutar tan grande del DOM hace que varios lectores de pantalla salgan
    // solos del "modo formulario" (deja de poder seguir escribiendo sin ir a buscar el
    // recuadro de nuevo). Si la jugada vino de un clic/tecla en el propio tablero, en cambio,
    // el foco debe seguir ahí (comportamiento de siempre, ver focusSquare más abajo).
    const cameFromInput = document.activeElement === moveInputEl;
    applyMoveSideEffects(result);
    focusSquare = result.to; // lleva el foco del teclado a la casilla donde acaba de mover
    renderBoard();
    updateStatus();
    if (cameFromInput && moveInputEl) moveInputEl.focus();
    // La jugada del bot llega en un segundo repintado, más tarde y por separado (tras pensar):
    // el mismo problema de foco puede repetirse ahí, así que se restaura otra vez al terminar.
    maybeTriggerBot().then(updateEvalBar).then(() => {
      if (cameFromInput && moveInputEl) moveInputEl.focus();
    });
  }

  function doUserMove(from, to, promotion) {
    const result = game.move({ from, to, promotion });
    if (!result) return;
    finishUserMove(result);
  }

  // ---------- Accesibilidad: escribir la jugada en un recuadro de texto ----------
  // Para quienes usan lector de pantalla, navegar las 64 casillas del tablero jugada a
  // jugada puede ser lento; este recuadro permite escribir la jugada directamente en
  // notación algebraica (en español o en inglés, con tolerancia a errores comunes de
  // tipeo) y aplicarla igual que si se hubiera hecho clic en el tablero.
  const ES_TO_EN_PIECE = { T: "R", C: "N", A: "B", D: "Q", R: "K" };
  const SAN_PIECE_LETTERS = "NBRQKTCAD"; // letras de pieza válidas en inglés o español (mayúsculas)

  function mapSpanishPieceLetter(letter) {
    return ES_TO_EN_PIECE[letter.toUpperCase()] || letter.toUpperCase();
  }

  // A partir de lo que escribió la persona, genera una lista de variantes razonables a
  // intentar (siempre probando primero el texto tal cual lo escribió): letras de pieza en
  // español traducidas al inglés que usa chess.js, mayúscula inicial si se escribió en
  // minúscula, "x" de captura insertada si se omitió, sufijo de promoción "=Q" si falta, y
  // "0-0"/"0-0-0" con ceros interpretados como enroque.
  function generateMoveCandidates(raw) {
    let s = String(raw || "").trim();
    s = s.replace(/^\d+\.(\.\.)?\s*/, ""); // por si copian "14. Cf3" o "14...Cf3"
    s = s.replace(/\s+/g, "");
    if (!s) return [];

    const candidates = new Set();
    candidates.add(s);

    if (/^0-0-0[+#]?$/.test(s) || /^0-0[+#]?$/.test(s)) candidates.add(s.replace(/0/g, "O"));

    const first = s[0];
    if (first && SAN_PIECE_LETTERS.indexOf(first.toUpperCase()) !== -1 && s.length >= 3) {
      candidates.add(first.toUpperCase() + s.slice(1));
      candidates.add(mapSpanishPieceLetter(first) + s.slice(1));
    }

    const promoMatch = s.match(/=([a-zA-Z])([+#]?)$/);
    if (promoMatch) {
      candidates.add(s.replace(/=([a-zA-Z])([+#]?)$/, "=" + mapSpanishPieceLetter(promoMatch[1]) + promoMatch[2]));
    }

    const expanded = new Set(candidates);
    for (const c of candidates) {
      const pawnCaptureNoX = c.match(/^([a-h])([a-h])([1-8])([+#]?)$/);
      if (pawnCaptureNoX) expanded.add(`${pawnCaptureNoX[1]}x${pawnCaptureNoX[2]}${pawnCaptureNoX[3]}${pawnCaptureNoX[4]}`);

      const pieceNoX = c.match(/^([NBRQK])([a-h])([1-8])([+#]?)$/);
      if (pieceNoX) expanded.add(`${pieceNoX[1]}x${pieceNoX[2]}${pieceNoX[3]}${pieceNoX[4]}`);

      const pieceDisambigNoX = c.match(/^([NBRQK])([a-h1-8])([a-h])([1-8])([+#]?)$/);
      if (pieceDisambigNoX) {
        expanded.add(`${pieceDisambigNoX[1]}${pieceDisambigNoX[2]}x${pieceDisambigNoX[3]}${pieceDisambigNoX[4]}${pieceDisambigNoX[5]}`);
      }

      const pawnPromoNoSuffix = c.match(/^([a-h](x[a-h])?[18])([+#]?)$/);
      if (pawnPromoNoSuffix && !/=/.test(c)) expanded.add(`${pawnPromoNoSuffix[1]}=Q${pawnPromoNoSuffix[3]}`);
    }

    return Array.from(expanded);
  }

  function tryParseMove(raw) {
    const candidates = generateMoveCandidates(raw);
    for (const candidate of candidates) {
      let result = null;
      try {
        result = game.move(candidate, { sloppy: true });
      } catch (e) {}
      if (result) return result;
    }
    return null;
  }

  // Vacía primero y vuelve a poner el texto con un pequeño retraso: así, si se repite el
  // mismo comando dos veces seguidas (por ejemplo para repasar algo que no se escuchó bien),
  // el lector de pantalla lo anuncia de nuevo aunque el texto no haya cambiado.
  function announceMoveInput(text) {
    if (typeof BlindNotation !== "undefined") BlindNotation.speak(text);
    if (!moveInputStatusEl) return;
    moveInputStatusEl.textContent = "";
    window.setTimeout(() => {
      moveInputStatusEl.textContent = text;
    }, 50);
  }

  // Describe una jugada del historial (verbose de chess.js) en español hablado, para los
  // anuncios de "repetir jugadas" y del comando "L" (escuchar la jugada anterior).
  function describeMove(m, moveNum) {
    const colorTxt = m.color === "w" ? "blancas" : "negras";
    const pieceName = (PIECE_INFO[m.piece] && PIECE_INFO[m.piece].name) || "pieza";
    const captureTxt = m.captured ? ", captura" : "";
    const checkTxt = /#/.test(m.san) ? ", jaque mate" : /\+/.test(m.san) ? ", jaque" : "";
    return `Jugada ${moveNum}, ${colorTxt}: ${pieceName} de ${spokenSquare(m.from)} a ${spokenSquare(m.to)}${captureTxt}${checkTxt}.`;
  }

  // Comando "L" (escuchar la jugada anterior): anuncia sólo la última jugada realizada,
  // sin tener que repetir toda la partida ni esperar a que sea el turno del visitante.
  function announceLastMove() {
    const hist = game.history({ verbose: true });
    if (!hist.length) {
      announceMoveInput("Todavía no se ha jugado ninguna jugada en esta partida.");
      return;
    }
    announceMoveInput(describeMove(hist[hist.length - 1], Math.floor((hist.length - 1) / 2) + 1));
  }

  // ---------- Comando "T" (dice la posición): describe dónde está cada pieza ----------
  const PIECE_NAME_FORMS = {
    k: { singular: "rey", plural: "reyes" },
    q: { singular: "dama", plural: "damas" },
    r: { singular: "torre", plural: "torres" },
    b: { singular: "alfil", plural: "alfiles" },
    n: { singular: "caballo", plural: "caballos" },
    p: { singular: "peón", plural: "peones" },
  };
  const POSITION_PIECE_ORDER = ["k", "q", "r", "b", "n", "p"];

  // Une una lista de casillas en español: "a1", "a1 y b2", "a1, b2 y c3".
  function joinSpanishList(items) {
    if (!items.length) return "";
    if (items.length === 1) return items[0];
    return items.slice(0, -1).join(", ") + " y " + items[items.length - 1];
  }

  function describeSide(color) {
    const board = game.board();
    const byType = { k: [], q: [], r: [], b: [], n: [], p: [] };
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const cell = board[r][f];
        if (cell && cell.color === color) byType[cell.type].push(FILES[f] + (8 - r));
      }
    }
    const parts = [];
    for (const type of POSITION_PIECE_ORDER) {
      const squares = byType[type];
      if (!squares.length) continue;
      squares.sort();
      const forms = PIECE_NAME_FORMS[type];
      const label = squares.length === 1 ? forms.singular : forms.plural;
      parts.push(`${label} ${joinSpanishList(squares)}`);
    }
    return parts.length ? parts.join(", ") : "sin piezas en el tablero";
  }

  // Cada columna (a-h) tiene una palabra propia para poder distinguir las casillas con
  // claridad al oído (parecido al alfabeto fonético "Alfa, Bravo, Charlie…", pero con la
  // letra inicial de cada palabra igual a la columna): a=anna, b=bella, c=cesar, d=david,
  // e=eva, f=felix, g=gustav, h=hector.
  const FILE_WORDS = { a: "anna", b: "bella", c: "cesar", d: "david", e: "eva", f: "felix", g: "gustav", h: "hector" };

  function wordSquare(square) {
    return FILE_WORDS[square[0]] + " " + square[1];
  }

  // Versión de wordSquare() que respeta el modo: en Modo Adaptado dice la
  // casilla con la palabra de columna ("eva 4"); en modo normal, el nombre
  // real ("e4"). Se usa en todo lo que se anuncia en voz — jugadas, capturas,
  // casillas — para que la notación adaptada no se limite solo al comando "T".
  function spokenSquare(square) {
    return blindMode ? wordSquare(square) : square;
  }

  // Arma una línea por cada tipo de pieza presente ("torre: eva 1, anna 1") para un color,
  // usando las palabras por columna en vez de las letras a-h.
  function pieceLinesForColor(color) {
    const board = game.board();
    const byType = { k: [], q: [], r: [], b: [], n: [], p: [] };
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const cell = board[r][f];
        if (cell && cell.color === color) byType[cell.type].push(FILES[f] + (8 - r));
      }
    }
    const lines = [];
    for (const type of POSITION_PIECE_ORDER) {
      const squares = byType[type];
      if (!squares.length) continue;
      squares.sort();
      // La etiqueta va siempre en singular (torre, alfil, peón...), sin importar cuántas
      // piezas de ese tipo haya: así lo pidió el usuario en su ejemplo ("torre: eva 1, anna 1").
      const label = PIECE_NAME_FORMS[type].singular;
      lines.push(`${label}: ${squares.map(wordSquare).join(", ")}`);
    }
    return lines;
  }

  // Comando "T" (dice la posición): en vez de un solo párrafo largo, arma un bloque con
  // encabezados reales (Piezas > Blancas/Negras) para poder navegarlo con las teclas de
  // encabezado del lector de pantalla, y para volver a leerlo más tarde si hace falta.
  function renderPositionReadout() {
    if (!positionReadoutEl) return;
    const turnTxt = game.turn() === "w" ? "blancas" : "negras";
    const checkTxt = game.in_check() ? ", en jaque" : "";
    const whiteLines = pieceLinesForColor("w");
    const blackLines = pieceLinesForColor("b");
    let html = `<p>Turno de ${turnTxt}${checkTxt}.</p>`;
    html += "<h2>Piezas</h2>";
    html += "<h3>Blancas</h3>";
    html += whiteLines.length
      ? whiteLines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")
      : "<p>Sin piezas blancas en el tablero.</p>";
    html += "<h3>Negras</h3>";
    html += blackLines.length
      ? blackLines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")
      : "<p>Sin piezas negras en el tablero.</p>";
    // Se vacía primero y se repuebla con un pequeño retraso, igual que announceMoveInput, para
    // que repetir el comando "T" vuelva a anunciarse aunque la posición no haya cambiado.
    positionReadoutEl.innerHTML = "";
    window.setTimeout(() => {
      positionReadoutEl.innerHTML = html;
    }, 50);
  }

  function announcePosition() {
    renderPositionReadout();
  }

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  // Adjetivo de color con concordancia de género y número: "blanco"/"blanca"/"blancos"/"blancas".
  function colorAdjectiveForCount(color, fem, count) {
    const plural = count !== 1;
    if (color === "w") return fem ? (plural ? "blancas" : "blanca") : plural ? "blancos" : "blanco";
    return fem ? (plural ? "negras" : "negra") : plural ? "negros" : "negro";
  }

  function describeSquareContents(square) {
    const piece = game.get(square);
    return spokenSquare(square) + ": " + (piece ? pieceLabel(piece) : "vacía");
  }

  // Lleva el foco del teclado a una casilla concreta del tablero sin volver a pintarlo entero
  // (para no perder la posición al usar comandos como "board a1" o los atajos del tablero).
  function focusBoardSquare(square) {
    const squares = boardSquaresInOrder();
    if (squares.indexOf(square) === -1) return false;
    const oldBtn = focusSquare ? boardEl.querySelector('[data-square="' + focusSquare + '"]') : null;
    if (oldBtn) oldBtn.tabIndex = -1;
    focusSquare = square;
    const newBtn = boardEl.querySelector('[data-square="' + square + '"]');
    if (newBtn) {
      newBtn.tabIndex = 0;
      newBtn.focus();
    }
    return true;
  }

  // ---------- Comando "p <letra>": anunciar dónde están las piezas de un tipo/color ----------
  // Letras en inglés (K,Q,R,B,N,P): mayúscula = piezas blancas, minúscula = piezas negras.
  function squaresForPieceType(type, color) {
    const board = game.board();
    const found = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const cell = board[r][f];
        if (cell && cell.type === type && cell.color === color) found.push(FILES[f] + (8 - r));
      }
    }
    found.sort();
    return found;
  }

  function announcePieceType(letter) {
    const type = letter.toLowerCase();
    const forms = PIECE_NAME_FORMS[type];
    if (!forms) {
      announceMoveInput(`No entendí "${letter}" como tipo de pieza. Usa K, Q, R, B, N o P: mayúscula para blancas, minúscula para negras.`);
      return;
    }
    const color = letter === letter.toUpperCase() ? "w" : "b";
    const squares = squaresForPieceType(type, color);
    const fem = PIECE_INFO[type].fem;
    if (!squares.length) {
      announceMoveInput(`No quedan ${forms.plural} ${colorAdjectiveForCount(color, fem, 2)} en el tablero.`);
      return;
    }
    const label = squares.length === 1 ? forms.singular : forms.plural;
    const colorTxt = colorAdjectiveForCount(color, fem, squares.length);
    announceMoveInput(`${capitalize(label)} ${colorTxt}: ${joinSpanishList(squares.map(spokenSquare))}.`);
  }

  // ---------- Comando "s <columna|fila>": anunciar las piezas de una fila o columna ----------
  function announceLine(token) {
    const t = token.toLowerCase();
    const squares = [];
    let label;
    if (/^[a-h]$/.test(t)) {
      label = "Columna " + t;
      for (let r = 1; r <= 8; r++) squares.push(t + r);
    } else if (/^[1-8]$/.test(t)) {
      label = "Fila " + t;
      for (const f of FILES) squares.push(f + t);
    } else {
      announceMoveInput(`No entendí "${token}". Usa una letra de columna (a-h) o un número de fila (1-8).`);
      return;
    }
    const found = squares.filter((sq) => game.get(sq)).map((sq) => `${pieceLabel(game.get(sq))} en ${spokenSquare(sq)}`);
    announceMoveInput(found.length ? `${label}: ${found.join(", ")}.` : `${label}: sin piezas.`);
  }

  // ---------- Atajos del tablero enfocado (modo adaptado): "o", "c", "m", "shift+m", "x"… ----------
  function announceCurrentSquare(square) {
    announceMoveInput("Casilla " + describeSquareContents(square) + ".");
  }

  function announceLastCapture() {
    const hist = game.history({ verbose: true });
    if (!hist.length) {
      announceMoveInput("Todavía no se ha jugado ninguna jugada en esta partida.");
      return;
    }
    if (!lastCapturedInfo) {
      announceMoveInput("La última jugada no capturó ninguna pieza.");
      return;
    }
    announceMoveInput("Última captura: " + pieceLabel(lastCapturedInfo) + ".");
  }

  function announcePossibleMoves(square) {
    const piece = game.get(square);
    if (!piece) {
      announceMoveInput(`La casilla ${spokenSquare(square)} está vacía.`);
      return;
    }
    const moves = game.moves({ square, verbose: true });
    if (!moves.length) {
      announceMoveInput(`${capitalize(pieceLabel(piece))} en ${spokenSquare(square)} no tiene jugadas legales ahora mismo.`);
      return;
    }
    const list = moves.map((m) => (m.captured ? `${spokenSquare(m.to)} (captura)` : spokenSquare(m.to)));
    announceMoveInput(`${capitalize(pieceLabel(piece))} en ${spokenSquare(square)} puede ir a: ${joinSpanishList(list)}.`);
  }

  function announcePossibleCaptures(square) {
    const piece = game.get(square);
    if (!piece) {
      announceMoveInput(`La casilla ${spokenSquare(square)} está vacía.`);
      return;
    }
    const moves = game.moves({ square, verbose: true }).filter((m) => m.captured || m.flags.indexOf("e") !== -1);
    if (!moves.length) {
      announceMoveInput(`${capitalize(pieceLabel(piece))} en ${spokenSquare(square)} no tiene capturas posibles ahora mismo.`);
      return;
    }
    announceMoveInput(`${capitalize(pieceLabel(piece))} en ${spokenSquare(square)} puede capturar en: ${joinSpanishList(moves.map((m) => spokenSquare(m.to)))}.`);
  }

  // Devuelve la casilla vecina desplazada (df columnas, dr filas), o null si sale del tablero.
  function squareOffset(square, df, dr) {
    const file = FILES.indexOf(square[0]);
    const rank = parseInt(square[1], 10);
    const nf = file + df;
    const nr = rank + dr;
    if (nf < 0 || nf > 7 || nr < 1 || nr > 8) return null;
    return FILES[nf] + nr;
  }

  const RAY_DIRS = [
    [0, 1, "arriba"],
    [0, -1, "abajo"],
    [-1, 0, "izquierda"],
    [1, 0, "derecha"],
    [-1, 1, "arriba-izquierda"],
    [1, 1, "arriba-derecha"],
    [-1, -1, "abajo-izquierda"],
    [1, -1, "abajo-derecha"],
  ];

  // "x" (adyacentes), "shift+x" (anillo de 8) o "alt+x" (pieza más cercana en cada dirección,
  // como el alcance de una dama) — describe lo que hay alrededor de la casilla enfocada.
  function announceSurroundings(square, mode) {
    if (mode === "rays") {
      const parts = [];
      for (const [df, dr, name] of RAY_DIRS) {
        let sq = squareOffset(square, df, dr);
        let found = null;
        while (sq) {
          const piece = game.get(sq);
          if (piece) {
            found = { sq, piece };
            break;
          }
          sq = squareOffset(sq, df, dr);
        }
        if (found) parts.push(`${name}: ${pieceLabel(found.piece)} en ${spokenSquare(found.sq)}`);
      }
      announceMoveInput(
        parts.length ? `Piezas más cercanas desde ${spokenSquare(square)} — ${parts.join("; ")}.` : `No hay piezas en ninguna dirección desde ${spokenSquare(square)}.`
      );
      return;
    }
    const dirs = mode === "ring" ? RAY_DIRS : RAY_DIRS.slice(0, 4);
    const parts = [];
    for (const [df, dr] of dirs) {
      const sq = squareOffset(square, df, dr);
      if (sq) parts.push(describeSquareContents(sq));
    }
    announceMoveInput(parts.length ? `Alrededor de ${spokenSquare(square)} — ${parts.join("; ")}.` : `${spokenSquare(square)} no tiene casillas vecinas en el tablero.`);
  }

  // "k/q/r/b/n/p": mueve el foco a la siguiente pieza de ese tipo (cualquier color); mayúscula
  // invierte el orden (busca hacia atrás en vez de hacia adelante).
  function findNextPieceSquare(type, fromSquare, forward) {
    const squares = boardSquaresInOrder();
    const idx = squares.indexOf(fromSquare);
    const n = squares.length;
    if (idx === -1) return null;
    for (let step = 1; step <= n; step++) {
      const i = forward ? (idx + step) % n : (idx - step + n) % n;
      const sq = squares[i];
      const piece = game.get(sq);
      if (piece && piece.type === type) return sq;
    }
    return null;
  }

  // "shift+a"/"shift+d": repasa el historial de jugadas hacia atrás/adelante narrándolo en voz
  // alta, sin cambiar la posición real del tablero (sólo lectura, para repasar la partida).
  function stepMoveHistoryReview(direction) {
    const hist = game.history({ verbose: true });
    if (!hist.length) {
      announceMoveInput("Todavía no se ha jugado ninguna jugada en esta partida.");
      return;
    }
    if (historyReviewIndex === null) historyReviewIndex = hist.length - 1;
    historyReviewIndex = Math.max(0, Math.min(hist.length - 1, historyReviewIndex + direction));
    announceMoveInput(describeMove(hist[historyReviewIndex], Math.floor(historyReviewIndex / 2) + 1) + ` (jugada ${historyReviewIndex + 1} de ${hist.length})`);
  }

  // Despacha los atajos de una sola tecla del tablero enfocado (sólo en modo adaptado; ver el
  // listener de keydown de boardEl). Ignora combinaciones con Ctrl/Meta para no chocar con
  // atajos del navegador (Ctrl+R, Cmd+…).
  function handleBoardShortcutKey(e, currentSquare) {
    if (e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k.length !== 1) return;
    const lower = k.toLowerCase();

    if (!e.shiftKey && !e.altKey && lower === "i") {
      e.preventDefault();
      if (moveInputEl) moveInputEl.focus();
      return;
    }
    if (!e.shiftKey && !e.altKey && lower === "o") {
      e.preventDefault();
      announceCurrentSquare(currentSquare);
      return;
    }
    if (!e.shiftKey && !e.altKey && lower === "c") {
      e.preventDefault();
      announceLastCapture();
      return;
    }
    if (!e.shiftKey && !e.altKey && lower === "l") {
      e.preventDefault();
      announceLastMove();
      return;
    }
    if (!e.altKey && lower === "m") {
      e.preventDefault();
      if (k === "M") announcePossibleCaptures(currentSquare);
      else announcePossibleMoves(currentSquare);
      return;
    }
    if (!e.altKey && lower === "x") {
      e.preventDefault();
      announceSurroundings(currentSquare, k === "X" ? "ring" : "adjacent");
      return;
    }
    if (e.altKey && !e.shiftKey && lower === "x") {
      e.preventDefault();
      announceSurroundings(currentSquare, "rays");
      return;
    }
    if (e.shiftKey && !e.altKey && (lower === "a" || lower === "d")) {
      e.preventDefault();
      stepMoveHistoryReview(lower === "a" ? -1 : 1);
      return;
    }
    if (!e.altKey && "kqrbnp".indexOf(lower) !== -1) {
      e.preventDefault();
      const forward = k === lower; // minúscula = hacia adelante, mayúscula = invierte el orden
      const next = findNextPieceSquare(lower, currentSquare, forward);
      if (next) {
        focusBoardSquare(next);
        announceMoveInput(pieceLabel(game.get(next)) + " en " + spokenSquare(next) + ".");
      } else {
        announceMoveInput(`No hay ${PIECE_NAME_FORMS[lower].plural} en el tablero.`);
      }
      return;
    }
    if (!e.shiftKey && !e.altKey && e.code && e.code.indexOf("Digit") === 0) {
      const digit = e.code.slice(5);
      if (digit >= "1" && digit <= "8") {
        e.preventDefault();
        const target = currentSquare[0] + digit;
        if (target !== currentSquare) {
          focusBoardSquare(target);
          announceCurrentSquare(target);
        }
      }
      return;
    }
    if (e.shiftKey && !e.altKey && e.code && e.code.indexOf("Digit") === 0) {
      const digit = e.code.slice(5);
      if (digit >= "1" && digit <= "8") {
        e.preventDefault();
        const target = FILES[Number(digit) - 1] + currentSquare[1];
        if (target !== currentSquare) {
          focusBoardSquare(target);
          announceCurrentSquare(target);
        }
      }
      return;
    }
  }

  // ---------- Comando "ayuda" (recuadro de jugada): recuerda los comandos disponibles ----------
  function announceHelp() {
    announceMoveInput(
      "Comandos: L o last (última jugada), T (posición actual), board o b [casilla] (ir a una casilla, e4 por defecto), " +
        "resign (rendirse), p seguido de una letra (dónde están las piezas de ese tipo; mayúscula blancas, minúscula negras), " +
        "s seguido de una columna o fila (piezas en esa línea). Con el tablero enfocado: i (ir al recuadro), o (casilla actual), " +
        "c (última captura), l (última jugada), m (jugadas posibles), shift+m (capturas posibles), flechas (moverse), " +
        "k q r b n p (saltar a la siguiente pieza de ese tipo; mayúscula invierte el orden), números 1-8 (ir a esa fila), " +
        "shift+1-8 (ir a esa columna), x, shift+x o alt+x (piezas alrededor), shift+a y shift+d (repasar jugadas anteriores/siguientes)."
    );
  }

  // Procesa lo que se escribió en el recuadro; devuelve true si el foco debe quedarse ahí
  // (el caso normal) o false si la propia acción ya movió el foco a propósito (comando
  // "board"/"b", que existe justamente para saltar al tablero).
  function processMoveFormInput(raw, trimmed) {
    // Comandos de accesibilidad: funcionan siempre, aunque no sea el turno del visitante,
    // el bot esté pensando, o la partida ya haya terminado (son sólo lectura, no mueven nada).
    const upper = trimmed.toUpperCase();
    if (upper === "L" || upper === "LAST") {
      moveInputEl.value = "";
      announceLastMove();
      return true;
    }
    if (upper === "T") {
      moveInputEl.value = "";
      announcePosition();
      return true;
    }
    if (upper === "AYUDA" || upper === "HELP" || upper === "?") {
      moveInputEl.value = "";
      announceHelp();
      return true;
    }
    if (upper === "RESIGN") {
      moveInputEl.value = "";
      if (isGameOver()) {
        announceMoveInput("La partida ya terminó.");
        return true;
      }
      resign();
      announceMoveInput("Te rendiste — Oscar gana.");
      return true;
    }
    const tokens = trimmed.split(/\s+/);
    const cmd0 = tokens[0].toUpperCase();
    if (cmd0 === "BOARD" || cmd0 === "B") {
      moveInputEl.value = "";
      const targetRaw = tokens[1];
      const target = targetRaw && /^[a-h][1-8]$/i.test(targetRaw) ? targetRaw.toLowerCase() : "e4";
      if (!focusBoardSquare(target)) {
        announceMoveInput(`Casilla inválida: "${targetRaw}".`);
        return true; // el salto falló, así que el foco nunca se movió: se queda en el recuadro
      }
      announceCurrentSquare(target);
      return false; // "board"/"b" existe justamente para saltar al tablero — no hay que revertirlo
    }
    if (cmd0 === "P" && tokens.length >= 2 && /^[a-zA-Z]$/.test(tokens[1])) {
      moveInputEl.value = "";
      announcePieceType(tokens[1]);
      return true;
    }
    if (cmd0 === "S" && tokens.length >= 2 && /^[a-h1-8]$/i.test(tokens[1])) {
      moveInputEl.value = "";
      announceLine(tokens[1]);
      return true;
    }

    if (isBotThinking) {
      announceMoveInput("Espera a que Oscar termine de pensar.");
      return true;
    }
    if (isGameOver()) {
      announceMoveInput("La partida ya terminó.");
      return true;
    }
    if (game.turn() !== userColor) {
      announceMoveInput("No es tu turno todavía.");
      return true;
    }
    const result = tryParseMove(raw);
    if (!result) {
      announceMoveInput(`No se entendió la jugada "${raw.trim()}". Revisa la notación e intenta de nuevo.`);
      return true;
    }
    moveInputEl.value = "";
    selected = null;
    legalTargets = [];
    // La jugada misma se anuncia desde applyMoveSideEffects (igual que la respuesta de Oscar
    // que viene después), así que aquí no hace falta anunciarla por separado. finishUserMove
    // ya se encarga de devolver el foco al recuadro por su cuenta (ver ahí el porqué).
    finishUserMove(result);
    return false;
  }

  function handleMoveFormSubmit(e) {
    e.preventDefault();
    if (!moveInputEl) return;
    const raw = moveInputEl.value;
    const trimmed = raw.trim();
    if (!trimmed) return;
    // Cualquier comando o jugada puede terminar redibujando el tablero (una pieza que se
    // mueve, capturas, jaque…), y ese redibujado — 64 casillas creadas de nuevo — es
    // justo lo que hace que algunos lectores de pantalla salgan solos del "modo
    // formulario" del recuadro. Se restaura el foco después de procesar, salvo que la
    // propia acción haya movido el foco a propósito (comando "board"/"b").
    const keepFocusHere = processMoveFormInput(raw, trimmed);
    if (keepFocusHere && moveInputEl) moveInputEl.focus();
  }

  if (moveFormEl) moveFormEl.addEventListener("submit", handleMoveFormSubmit);

  // ---------- Accesibilidad: repetir en voz alta las jugadas realizadas ----------
  // Útil para quien usa lector de pantalla y se le pasó por alto una jugada, o simplemente
  // quiere repasar cómo va la partida sin tener que navegar el historial visual.
  function speakableMoveList() {
    const hist = game.history({ verbose: true });
    if (!hist.length) return "Todavía no se ha jugado ninguna jugada en esta partida.";
    const parts = [];
    for (let i = 0; i < hist.length; i++) {
      parts.push(describeMove(hist[i], Math.floor(i / 2) + 1));
    }
    return parts.join(" ");
  }

  function announceMoveHistory() {
    if (!repeatMovesStatusEl) return;
    const text = speakableMoveList();
    // Se vacía primero y se vuelve a poner con un pequeño retraso para que el lector de
    // pantalla anuncie el texto de nuevo aunque no haya cambiado desde la última vez.
    repeatMovesStatusEl.textContent = "";
    window.setTimeout(() => {
      repeatMovesStatusEl.textContent = text;
    }, 50);
  }

  if (repeatMovesBtn) repeatMovesBtn.addEventListener("click", announceMoveHistory);

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

  // ---------- Modal de fin de partida (con confetti si ganaste) ----------
  function launchConfetti(container) {
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 w-full h-full pointer-events-none";
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    const COLORS = ["#f0b429", "#de911d", "#334e68", "#9fb3c8", "#ffffff"];
    const pieces = Array.from({ length: 90 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.5,
      r: 3 + Math.random() * 4,
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
      vy: 2 + Math.random() * 3,
      vx: -1.5 + Math.random() * 3,
      rot: Math.random() * Math.PI,
      vrot: -0.2 + Math.random() * 0.4,
    }));
    let frame = 0;
    let rafId;
    function tick() {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
        ctx.restore();
      }
      if (frame < 150 && canvas.isConnected) {
        rafId = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(rafId);
        canvas.remove();
      }
    }
    tick();
  }

  function formatDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m} min ${s}s` : `${s}s`;
  }

  function showEndGameModal(info) {
    if (closeEndGameModal) closeEndGameModal();
    const isWin = !info.draw && info.winner === userColor;
    const title = info.draw ? "Tablas 🤝" : isWin ? "¡Ganaste! 🎉" : info.resigned ? "Te rendiste" : "Oscar gana ♟️";

    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 bg-brand-900/60 z-[65] flex items-center justify-center p-4";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    const panel = document.createElement("div");
    panel.className = "relative bg-white dark:bg-brand-900 rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center overflow-hidden";

    const titleEl = document.createElement("h3");
    titleEl.className = "font-serif text-2xl font-bold text-brand-800 dark:text-white mb-3";
    titleEl.textContent = title;
    panel.appendChild(titleEl);

    const durationSeg = Math.max(0, Math.round((Date.now() - gameStartTime) / 1000));
    const jugadas = Math.ceil(game.history().length / 2);
    const precisionTxt = lastAnalysis && lastAnalysis.accuracy !== null ? `${lastAnalysis.accuracy}%` : "—";

    const summary = document.createElement("div");
    summary.className = "text-sm text-brand-600 dark:text-brand-300 space-y-1 mb-5";
    summary.innerHTML =
      `<p>Jugadas: <strong>${jugadas}</strong></p>` +
      `<p>Duración: <strong>${formatDuration(durationSeg)}</strong></p>` +
      `<p>Precisión estimada: <strong>${precisionTxt}</strong>${
        lastAnalysis ? "" : ' <span class="text-xs">(analiza la partida para verla)</span>'
      }</p>`;
    panel.appendChild(summary);

    const btnRow = document.createElement("div");
    btnRow.className = "flex flex-col sm:flex-row gap-2 justify-center";

    const playAgainBtn = document.createElement("button");
    playAgainBtn.type = "button";
    playAgainBtn.className = "bg-brand-700 hover:bg-brand-800 text-white font-semibold px-4 py-2 rounded-lg text-sm";
    playAgainBtn.textContent = "Jugar de nuevo";
    playAgainBtn.addEventListener("click", () => {
      closeModal();
      resetGame();
    });
    btnRow.appendChild(playAgainBtn);

    if (analyzeBtn) {
      const analyzeLinkBtn = document.createElement("button");
      analyzeLinkBtn.type = "button";
      analyzeLinkBtn.className = "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm";
      analyzeLinkBtn.textContent = "Analizar mi partida";
      analyzeLinkBtn.addEventListener("click", () => {
        closeModal();
        analyzeBtn.scrollIntoView({ behavior: "smooth", block: "center" });
        if (!lastAnalysis) analyzeGame(); // ya se disparó solo al terminar la partida; no repetirlo si ya está listo
      });
      btnRow.appendChild(analyzeLinkBtn);
    }
    panel.appendChild(btnRow);

    // Opción directa para enviarse esta partida (PGN + análisis) al correo, sin tener que
    // cerrar el modal y buscar la sección de análisis más abajo — queda disponible de una
    // vez apenas termina la partida, en los dos modos.
    if (leadFormEl) {
      const emailSection = document.createElement("div");
      emailSection.className = "mt-4 pt-4 border-t border-brand-100 dark:border-brand-700 text-left";

      const emailHeading = document.createElement("p");
      emailHeading.className = "text-sm font-semibold text-brand-800 dark:text-white mb-2 text-center";
      emailHeading.textContent = "📧 Envía esta partida a tu correo";
      emailSection.appendChild(emailHeading);

      const emailForm = document.createElement("form");
      emailForm.className = "flex flex-col gap-2";

      const modalNameInput = document.createElement("input");
      modalNameInput.type = "text";
      modalNameInput.required = true;
      modalNameInput.placeholder = "Tu nombre";
      modalNameInput.setAttribute("aria-label", "Tu nombre");
      modalNameInput.className =
        "bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus:ring-2 focus:ring-accent-500";
      emailForm.appendChild(modalNameInput);

      const modalEmailInput = document.createElement("input");
      modalEmailInput.type = "email";
      modalEmailInput.required = true;
      modalEmailInput.placeholder = "Tu correo";
      modalEmailInput.setAttribute("aria-label", "Tu correo electrónico");
      modalEmailInput.className = modalNameInput.className;
      emailForm.appendChild(modalEmailInput);

      const modalSendBtn = document.createElement("button");
      modalSendBtn.type = "submit";
      modalSendBtn.className = "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm";
      modalSendBtn.textContent = "Enviarme esta partida";
      emailForm.appendChild(modalSendBtn);

      const modalLeadStatus = document.createElement("div");
      modalLeadStatus.setAttribute("role", "status");
      modalLeadStatus.setAttribute("aria-live", "polite");
      modalLeadStatus.className = "text-xs text-brand-500 dark:text-brand-400 mt-2 text-center";

      emailForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const nombre = modalNameInput.value.trim();
        const correo = modalEmailInput.value.trim();
        if (!nombre || !correo) return;
        const ok = await sendLeadEmail(nombre, correo, modalLeadStatus, modalSendBtn);
        if (ok) emailForm.reset();
      });

      emailSection.appendChild(emailForm);
      emailSection.appendChild(modalLeadStatus);
      panel.appendChild(emailSection);
    }

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "text-brand-400 hover:text-brand-600 text-sm underline mt-3";
    closeBtn.textContent = "Cerrar";
    panel.appendChild(closeBtn);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const returnFocusTo = document.activeElement;
    function closeModal() {
      document.removeEventListener("keydown", onKeyDown, true);
      if (overlay.parentNode) document.body.removeChild(overlay);
      if (returnFocusTo && typeof returnFocusTo.focus === "function") returnFocusTo.focus();
      closeEndGameModal = null;
    }
    function onKeyDown(e) {
      if (e.key === "Escape") closeModal();
    }
    document.addEventListener("keydown", onKeyDown, true);
    closeBtn.addEventListener("click", closeModal);
    closeEndGameModal = closeModal;

    if (isWin) launchConfetti(panel);
  }

  // ---------- Captura de leads: enviar la partida analizada por correo ----------
  function buildGameSummaryText() {
    const hist = game.history();
    let text = "";
    for (let i = 0; i < hist.length; i += 2) {
      text += `${i / 2 + 1}. ${hist[i] || ""} ${hist[i + 1] || ""}\n`;
    }
    return text.trim();
  }

  // Envía la partida (PGN + resumen + análisis, si ya está calculado) al correo indicado.
  // Se usa tanto desde el formulario de la sección "Analizar partida" como desde la opción
  // directa que aparece en el modal de fin de partida (misma lógica, dos puntos de entrada).
  // Devuelve true si el envío fue exitoso, para que quien llama pueda limpiar su formulario.
  async function sendLeadEmail(nombre, correo, statusEl, submitBtn) {
    if (submitBtn) submitBtn.disabled = true;
    if (statusEl) statusEl.textContent = "Enviando…";

    const info = getGameOverInfo();
    const resultado = info.over ? (info.draw ? "draw" : info.winner === userColor ? "win" : "loss") : null;
    const duracionSeg = Math.max(0, Math.round((Date.now() - gameStartTime) / 1000));

    const payload = {
      nombre,
      correo,
      resumenPartida: buildGameSummaryText(),
      pgn: game.pgn(),
      resultado,
      jugadas: Math.ceil(game.history().length / 2),
      duracionSeg,
      precisionEstimada: lastAnalysis ? lastAnalysis.accuracy : null,
      dificultad: difficultyEl ? difficultyEl.value : null,
      colorJugador: userColor,
    };

    let ok = false;
    try {
      const res = await fetch("https://prcfbzvshnusisczlpxl.supabase.co/functions/v1/chess-lead-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sb_publishable_jZ-HV-E6d8zUfeA5ruTLvg_tHsYYllZ",
          apikey: "sb_publishable_jZ-HV-E6d8zUfeA5ruTLvg_tHsYYllZ",
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        ok = true;
        if (statusEl) {
          statusEl.textContent =
            data.emailSent === false
              ? "Guardamos tus datos, pero hubo un problema enviando el correo. Intenta de nuevo más tarde."
              : "¡Listo! Revisa tu correo — te enviamos el resumen de la partida.";
        }
      } else if (statusEl) {
        statusEl.textContent = data.error || "No se pudo enviar. Intenta de nuevo.";
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = "No se pudo conectar. Revisa tu conexión e intenta de nuevo.";
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
    return ok;
  }

  if (leadFormEl) {
    leadFormEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nombre = leadNameEl ? leadNameEl.value.trim() : "";
      const correo = leadEmailEl ? leadEmailEl.value.trim() : "";
      if (!nombre || !correo) return;
      const submitBtn = leadFormEl.querySelector('button[type="submit"]');
      const ok = await sendLeadEmail(nombre, correo, leadStatusEl, submitBtn);
      if (ok) leadFormEl.reset();
    });
  }

  // ---------- Modo Desafío / Posición del Día ----------
  const CHALLENGE_RESULT_LABEL = { W: "Oscar ganó esa partida", L: "Oscar perdió esa partida", D: "esa partida fue tablas" };
  let currentPositionIndex = 0;
  let colorBeforeChallenge = null; // color que tenía elegido el visitante antes de entrar al Modo Desafío

  function hasChallengePositions() {
    return typeof window.OSCAR_POSITIONS !== "undefined" && window.OSCAR_POSITIONS.length > 0;
  }

  function positionEntryFromRow(row) {
    const [fen, opponent, date, oscarColor, result, moveNum] = row;
    return { fen, opponent, date, oscarColor, result, moveNum };
  }

  function dailyPositionIndex() {
    const list = window.OSCAR_POSITIONS;
    const dayNum = Math.floor(Date.now() / 86400000); // días desde 1970: cambia una vez al día
    return dayNum % list.length;
  }

  function renderChallengeCard() {
    if (!challengeInfoEl) return;
    if (!hasChallengePositions()) {
      challengeInfoEl.textContent = "No disponible por el momento.";
      if (challengePlayBtn) challengePlayBtn.disabled = true;
      if (challengeShuffleBtn) challengeShuffleBtn.disabled = true;
      return;
    }
    const entry = positionEntryFromRow(window.OSCAR_POSITIONS[currentPositionIndex]);
    const resultTxt = CHALLENGE_RESULT_LABEL[entry.result] || "";
    challengeInfoEl.innerHTML =
      `Posición real tomada de la jugada ${escapeHtml(String(entry.moveNum))} de una partida de Oscar contra ` +
      `<strong>${escapeHtml(entry.opponent)}</strong> (${escapeHtml(entry.date.replace(/\./g, "-"))}, ${escapeHtml(
        resultTxt
      )}). Retoma la partida desde ahí y trata de ganarle a Oscar.`;
  }

  function startChallenge(index) {
    if (!hasChallengePositions()) return;
    if (!startFen) colorBeforeChallenge = colorEl ? colorEl.value : "w"; // sólo la 1a vez que se entra (no al cambiar de posición estando ya en modo desafío)
    currentPositionIndex = index;
    const entry = positionEntryFromRow(window.OSCAR_POSITIONS[index]);
    challengeEntry = entry;
    startFen = entry.fen;
    const turnField = entry.fen.split(" ")[1]; // "w" o "b": a quién le toca mover en esa posición real
    userColor = turnField === "b" ? "b" : "w";
    if (colorEl) {
      colorEl.value = userColor;
      colorEl.disabled = true;
    }
    resetGame({ skipColorRead: true });
    if (challengeExitBtn) challengeExitBtn.classList.remove("hidden");
    renderChallengeCard();
  }

  if (challengePlayBtn) {
    challengePlayBtn.addEventListener("click", () => startChallenge(currentPositionIndex));
  }
  if (challengeShuffleBtn) {
    challengeShuffleBtn.addEventListener("click", () => {
      if (!hasChallengePositions()) return;
      let next = currentPositionIndex;
      if (window.OSCAR_POSITIONS.length > 1) {
        while (next === currentPositionIndex) {
          next = Math.floor(Math.random() * window.OSCAR_POSITIONS.length);
        }
      }
      currentPositionIndex = next;
      renderChallengeCard();
    });
  }
  if (challengeExitBtn) {
    challengeExitBtn.addEventListener("click", () => {
      startFen = null;
      challengeEntry = null;
      if (colorEl) {
        colorEl.disabled = false;
        colorEl.value = colorBeforeChallenge || "w";
      }
      challengeExitBtn.classList.add("hidden");
      resetGame();
    });
  }

  function resetGame(opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    if (!options.skipColorRead) userColor = colorEl ? colorEl.value : "w";
    if (closeEndGameModal) closeEndGameModal();
    if (startFen) {
      game.load(startFen);
    } else {
      game.reset();
    }
    selected = null;
    legalTargets = [];
    lastMove = null;
    isBotThinking = false;
    focusSquare = null;
    capturedByWhite = [];
    capturedByBlack = [];
    resultRecorded = false;
    resigned = false;
    botBookMoves = [];
    gameStartTime = Date.now();
    lastAnalysis = null;
    lastCapturedInfo = null;
    historyReviewIndex = null;
    updateCapturedDisplay();
    updateHistoryDisplay();
    updateMaterialDisplay();
    renderOrigins();
    if (analyzeBtn) analyzeBtn.disabled = true;
    if (analyzeStatusEl) analyzeStatusEl.textContent = "";
    if (analyzeResultsEl) analyzeResultsEl.innerHTML = "";
    if (leadSectionEl) leadSectionEl.classList.add("hidden");
    if (moveInputEl) moveInputEl.value = "";
    if (moveInputStatusEl) moveInputStatusEl.textContent = "";
    if (repeatMovesStatusEl) repeatMovesStatusEl.textContent = "";
    if (positionReadoutEl) positionReadoutEl.innerHTML = "";
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
        "Tablero de ajedrez interactivo. Usa las flechas del teclado para moverte entre las casillas, e Inicio o Fin para ir al extremo de la fila. Presiona Enter o espacio sobre una pieza propia para seleccionarla, y sobre una casilla resaltada para mover ahí. Al promocionar un peón, usa las flechas o Tab para elegir la pieza y Enter para confirmar, o Escape para cancelar. Activa el modo adaptado para más comandos por teclado y por texto; escribe ayuda en el recuadro de jugada para conocerlos.";
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
  if (resignBtn && !resignBtn.getAttribute("aria-label")) resignBtn.setAttribute("aria-label", "Rendirse y terminar la partida");
  if (repeatMovesBtn && !repeatMovesBtn.getAttribute("aria-label")) {
    repeatMovesBtn.setAttribute("aria-label", "Repetir en voz alta las jugadas realizadas hasta ahora");
  }
  if (moveInputEl && !moveInputEl.getAttribute("aria-label")) {
    moveInputEl.setAttribute("aria-label", "Escribe tu jugada en notación algebraica");
  }
  if (modeNormalBtn && !modeNormalBtn.getAttribute("aria-label")) modeNormalBtn.setAttribute("aria-label", "Usar modo normal");
  if (modeBlindBtn && !modeBlindBtn.getAttribute("aria-label")) {
    modeBlindBtn.setAttribute("aria-label", "Usar modo adaptado para lector de pantalla");
  }

  // Estado inicial
  applyBlindModeUI();
  renderBoard();
  updateCapturedDisplay();
  updateHistoryDisplay();
  updateMaterialDisplay();
  renderOrigins();
  renderStats();
  updateStatus();
  applyDifficultyLabels();
  if (hasChallengePositions()) {
    currentPositionIndex = dailyPositionIndex();
    renderChallengeCard();
  }
  if (typeof OscarBot !== "undefined") {
    OscarBot.preload();
    if (OscarBot.preloadProvenance) OscarBot.preloadProvenance().then(renderOrigins);
  }
  maybeTriggerBot().then(updateEvalBar);
})();
