/**
 * Ajedrez Integral — visor de cursos basados en partidas modelo
 * (cursos/protegido/data/<slug>.json). Se usa en "Desequilibrios de material" y
 * "Partidas modelo: comprender el ajedrez jugada a jugada".
 *
 * Tres componentes, que se activan sobre el fragmento del curso:
 *   <div class="cp-partida" data-id="imb-16">   partida comentada: tablero, jugadas, comentarios,
 *                                                 modo "adivinar la jugada" en los momentos clave y
 *                                                 práctica contra el motor desde cualquier posición.
 *   <div class="cp-ejercicio" data-id="ej-3">     posición para resolver: hay que encontrar la jugada.
 *   <div class="cp-quiz" data-id="lec-04">        cuestionario de opción múltiple de la lección.
 *
 * API: window.CursoPartidas.init(root)  — la llama js/curso-acceso.js.
 * Progreso: localStorage "cp:<slug>" y, con sesión, EntrenoProgress.log(slug).
 */
(function () {
  "use strict";

  const LIGHT = "#f0dcc0", DARK = "#a5744a", BORDER = "#2b1d12", MARK = "#c8961e", SEL = "#3b82f6", OK = "#2f855a", BAD = "#c53030";
  const ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
  const RES_TXT = { "1-0": "Ganan blancas", "0-1": "Ganan negras", "½-½": "Tablas", "": "" };

  let data = null, dataPromise = null, slug = null, cmdSeq = 0;

  // Carpeta de datos relativa a ESTE archivo (no a la página): así el visor funciona
  // igual desde cursos/<curso>.html y desde cursos/academia/<curso>.html.
  const DATA_BASE = (function () {
    try {
      const me = document.currentScript && document.currentScript.src;
      if (me) return new URL("../cursos/protegido/data/", me).href;
    } catch (e) {}
    return "protegido/data/";
  })();
  function loadData(root) {
    if (data) return Promise.resolve(data);
    if (dataPromise) return dataPromise;
    const holder = (root && root.closest && root.closest("[data-course]")) || document.querySelector("[data-course]");
    slug = holder ? holder.dataset.course : "curso";
    dataPromise = fetch(DATA_BASE + slug + ".json", { credentials: "same-origin" })
      .then((r) => { if (!r.ok) throw new Error("datos " + r.status); return r.json(); })
      .then((d) => { data = d; return d; });
    return dataPromise;
  }

  function injectDefs() {
    if (window.ChessPieceSVG) window.ChessPieceSVG.injectDefs();
  }

  // ---------- utilidades ----------
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function esSan(san) { return String(san).replace(/^([KQRBN])/, (m, p) => ES[p]).replace(/=([QRBN])/, (m, p) => "=" + ES[p]); }
  // Igual que en Modo Adaptado (js/blind-notation.js): nombra la pieza completa y dice cada
  // casilla con su palabra fonética ("felix 3", no "f3"), para las respuestas del cuadro de
  // comandos ("Escribe tu jugada") — ahí sí importa: quien no ve el tablero (lector de
  // pantalla) necesita oír algo sin ambigüedad, a diferencia de la lista de jugadas visible
  // (esSan/moveLabel), que sigue en notación compacta porque eso sí se lee con la vista.
  function spokenSan(san) { return window.BlindNotation ? BlindNotation.sanSpoken(san) : esSan(san); }
  function spokenSquares(sqs) {
    return window.BlindNotation ? sqs.map((sq) => BlindNotation.squareSpoken(sq)).join(", ") : sqs.join(", ");
  }
  function parseFen(fen) {
    const parts = fen.split(" "), rows = parts[0].split("/"), board = {};
    for (let r = 0; r < 8; r++) { let f = 0; for (const ch of rows[r]) { if (/\d/.test(ch)) f += parseInt(ch, 10); else { board["abcdefgh"[f] + (8 - r)] = ch; f++; } } }
    return { board, turn: parts[1] || "w", full: parseInt(parts[5] || "1", 10) };
  }
  // Sin BlindNotation cargado se queda con el singular: es mejor "alfil en c1, f1"
  // que inventar un plural.
  function nombrePieza(t, cuantas) {
    if (window.BlindNotation && BlindNotation.pieceLabel) return BlindNotation.pieceLabel(t, cuantas);
    return { K: "rey", Q: "dama", R: "torre", B: "alfil", N: "caballo", P: "peón" }[t.toUpperCase()] || t;
  }

  function describe(fen) {
    const { board, turn } = parseFen(fen);
    const out = [];
    [["w", "Blancas"], ["b", "Negras"]].forEach(([col, nom]) => {
      const parts = [];
      "KQRBNP".split("").forEach((t) => {
        const sqs = Object.keys(board).filter((sq) => board[sq] === (col === "w" ? t : t.toLowerCase())).sort();
        // El plural sale de BlindNotation: sumarle una "s" daba "alfils" y "peóns",
        // que el lector de pantalla dice tal cual. Es el mismo lugar del que sale la
        // forma hablada de las casillas, dos líneas más abajo.
        if (sqs.length) parts.push(nombrePieza(t, sqs.length) + " en " + spokenSquares(sqs));
      });
      out.push(nom + ": " + (parts.join("; ") || "sin piezas") + ".");
    });
    return out.join(" ") + (turn === "w" ? " Juegan blancas." : " Juegan negras.");
  }
  function moveLabel(m) { return (m.color === "w" ? m.n + "." : m.n + "…") + esSan(m.san) + (m.nag || ""); }

  // ---------- tablero SVG ----------
  function boardSvg(fen, opts) {
    opts = opts || {};
    const { board, turn } = parseFen(fen);
    const size = 100, cell = size / 8, pad = 5.5, total = size + 2 * pad, flip = !!opts.flip;
    const s = ['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + total + " " + total + '" class="cp-svg" role="img" aria-label="' + esc(opts.label || "Tablero") + '">'];
    s.push('<rect x="0" y="0" width="' + total + '" height="' + total + '" fill="#fff"/>');
    s.push('<rect x="' + (pad - 1) + '" y="' + (pad - 1) + '" width="' + (size + 2) + '" height="' + (size + 2) + '" fill="' + BORDER + '"/>');
    const xy = (sq) => { let f = "abcdefgh".indexOf(sq[0]), r = 8 - parseInt(sq[1], 10); if (flip) { f = 7 - f; r = 7 - r; } return [pad + f * cell, pad + r * cell]; };
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const sq = "abcdefgh"[flip ? 7 - c : c] + (flip ? r + 1 : 8 - r);
      s.push('<rect data-sq="' + sq + '" x="' + (pad + c * cell) + '" y="' + (pad + r * cell) + '" width="' + cell + '" height="' + cell + '" fill="' + ((r + c) % 2 === 0 ? LIGHT : DARK) + '"/>');
    }
    const shade = (sqs, color, op) => (sqs || []).forEach((sq) => { const [x, y] = xy(sq); s.push('<rect x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell + '" fill="' + color + '" fill-opacity="' + op + '" pointer-events="none"/>'); });
    shade(opts.last, MARK, 0.45); shade(opts.sel ? [opts.sel] : [], SEL, 0.45); shade(opts.good, OK, 0.5); shade(opts.bad, BAD, 0.5);
    for (let c = 0; c < 8; c++) s.push('<text x="' + (pad + c * cell + cell / 2) + '" y="' + (total - 1.2) + '" font-size="3.6" fill="#6b5442" text-anchor="middle" font-family="sans-serif">' + "abcdefgh"[flip ? 7 - c : c] + "</text>");
    for (let r = 0; r < 8; r++) s.push('<text x="' + (pad * 0.45) + '" y="' + (pad + r * cell + cell / 2 + 1.3) + '" font-size="3.6" fill="#6b5442" text-anchor="middle" font-family="sans-serif">' + (flip ? r + 1 : 8 - r) + "</text>");
    (opts.dots || []).forEach((sq) => { const [x, y] = xy(sq); s.push('<circle cx="' + (x + cell / 2) + '" cy="' + (y + cell / 2) + '" r="' + (cell * 0.14) + '" fill="' + SEL + '" fill-opacity="0.55" pointer-events="none"/>'); });
    const scale = (cell / 45) * 0.9, off = (cell - 45 * scale) / 2;
    Object.keys(board).forEach((sq) => {
      const p = board[sq]; const [x, y] = xy(sq);
      s.push('<use xlink:href="#' + (p === p.toUpperCase() ? "w" : "b") + p.toUpperCase() + '" transform="translate(' + (x + off).toFixed(2) + "," + (y + off).toFixed(2) + ") scale(" + scale.toFixed(4) + ')" pointer-events="none"/>');
    });
    let cy = turn === "w" ? pad + size - cell * 0.35 : pad + cell * 0.35;
    if (flip) cy = turn === "w" ? pad + cell * 0.35 : pad + size - cell * 0.35;
    s.push('<circle cx="' + (total - pad * 0.5) + '" cy="' + cy + '" r="1.6" fill="' + (turn === "w" ? "#fff" : "#1f1710") + '" stroke="#1f1710" stroke-width="0.4"/>');
    s.push("</svg>");
    return s.join("");
  }

  // ---------- progreso ----------
  function progreso() { try { return JSON.parse(localStorage.getItem("cp:" + slug) || "{}"); } catch (e) { return {}; } }
  function guardar(id, rec) {
    try { const p = progreso(); p[id] = Object.assign({ fecha: new Date().toISOString().slice(0, 10) }, rec); localStorage.setItem("cp:" + slug, JSON.stringify(p)); } catch (e) {}
    if (window.EntrenoProgress) { try { window.EntrenoProgress.log(slug, Object.assign({ item: id }, rec)); } catch (e) {} }
    document.dispatchEvent(new CustomEvent("cp:progreso", { detail: { id, rec } }));
  }

  // ---------- entrada de jugadas sobre el tablero (compartido) ----------
  // Permite al usuario jugar una jugada con clics; llama onMove(uciConPromocion) cuando es legal.
  function boardInput(boardEl, promoEl, getGame, onMove, render) {
    let sel = null, pendingPromo = null, enabled = false;
    boardEl.addEventListener("click", (ev) => {
      if (!enabled || pendingPromo) return;
      const r = ev.target.closest("[data-sq]"); if (!r) return;
      const game = getGame(); if (!game) return;
      const sq = r.dataset.sq;
      if (sel) {
        const mv = game.moves({ square: sel, verbose: true }).find((m) => m.to === sq);
        if (mv) {
          if (mv.flags.indexOf("p") !== -1) { pendingPromo = { from: sel, to: sq }; promoEl.hidden = false; render(sel); return; }
          const from = sel; sel = null; onMove(from + sq); return;
        }
      }
      const p = game.get(sq);
      sel = p && p.color === game.turn() ? sq : null;
      render(sel);
    });
    promoEl.addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-p]"); if (!b || !pendingPromo) return;
      const mv = pendingPromo.from + pendingPromo.to + b.dataset.p; pendingPromo = null; sel = null; promoEl.hidden = true; onMove(mv);
    });
    return { enable(v) { enabled = v; sel = null; pendingPromo = null; promoEl.hidden = true; }, get sel() { return sel; } };
  }

  // ---------- 1. partida comentada ----------
  function makeGame(el, g) {
    const moves = g.moves, claves = g.claves || [];
    const claveAt = {}; claves.forEach((c) => { claveAt[c.ply] = c; });
    const state = { ply: 0, flip: g.orientacion === "b", mode: "ver", guess: null, intentos: 0, aciertos: 0, fallos: 0, pendientes: null };
    const cmdId = "cp-cmd-" + (++cmdSeq);
    el.classList.add("cp-viewer");
    el.innerHTML =
      '<div class="cp-head"><span class="cp-players">' + esc(g.blancas) + " – " + esc(g.negras) + '</span><span class="cp-event">' + esc(g.evento || "") + '</span><span class="cp-res" data-res="' + esc(g.resultado) + '">' + esc(g.resultado || "") + "</span></div>" +
      '<div class="cp-board" tabindex="0" aria-label="Tablero de la partida"></div>' +
      '<div class="cp-side">' +
      '<div class="cp-controls" role="group" aria-label="Recorrer la partida">' +
      '<button type="button" data-act="first" aria-label="Posición inicial">⏮</button><button type="button" data-act="prev" aria-label="Jugada anterior">◀</button>' +
      '<span class="cp-ply" aria-live="polite"></span>' +
      '<button type="button" data-act="next" aria-label="Jugada siguiente">▶</button><button type="button" data-act="last" aria-label="Última jugada">⏭</button>' +
      '<button type="button" data-act="flip" aria-label="Girar el tablero" title="Girar el tablero">⇅</button></div>' +
      '<div class="cp-comment" aria-live="polite"></div>' +
      '<div class="cp-actions"><button type="button" data-act="guess" class="cp-btn">🎯 Adivinar las jugadas clave</button>' +
      '<button type="button" data-act="practice" class="cp-btn cp-btn2">♟ Jugar desde aquí contra el motor</button>' +
      '<label class="cp-level">Nivel <select data-act="level"><option value="1500">1500</option><option value="1800" selected>1800</option><option value="max">Máximo</option></select></label></div>' +
      '<form class="cp-cmd" hidden><label for="' + cmdId + '">Escribe tu jugada</label> ' +
      '<input type="text" id="' + cmdId + '" class="cp-cmd-input" autocomplete="off" placeholder="ej. Cf3, e4, Dxh7+, e8=D"> ' +
      '<button type="submit" class="cp-mini">Jugar</button></form>' +
      '<div class="cp-promo" hidden><span>Coronar:</span><button type="button" data-p="q">♕ Dama</button><button type="button" data-p="r">♖ Torre</button><button type="button" data-p="b">♗ Alfil</button><button type="button" data-p="n">♘ Caballo</button></div>' +
      '<div class="cp-msg" aria-live="polite"></div></div>' +
      '<div class="cp-moves" aria-label="Jugadas de la partida"></div>' +
      '<p class="cp-desc sr-only" aria-live="polite" aria-atomic="true"></p>';
    const boardEl = el.querySelector(".cp-board"), movesEl = el.querySelector(".cp-moves"), plyEl = el.querySelector(".cp-ply");
    const comEl = el.querySelector(".cp-comment"), msgEl = el.querySelector(".cp-msg"), descEl = el.querySelector(".cp-desc"), promoEl = el.querySelector(".cp-promo");
    const guessBtn = el.querySelector('[data-act="guess"]'), practBtn = el.querySelector('[data-act="practice"]');
    const cmdForm = el.querySelector(".cp-cmd"), cmdInput = cmdForm.querySelector("input");

    function fenAt(ply) { return ply === 0 ? g.start_fen : moves[ply - 1].fen; }
    function lastSquares(ply) { if (ply === 0) return []; const u = moves[ply - 1].uci; return [u.slice(0, 2), u.slice(2, 4)]; }
    function commentHtml(ply) {
      if (ply === 0) return '<p class="cp-c">' + esc(g.resumen || "") + "</p>";
      const m = moves[ply - 1];
      let h = '<p class="cp-c"><strong>' + esc(moveLabel(m)) + "</strong>" + (m.comentario ? " " + esc(m.comentario) : "") + "</p>";
      if (m.gap && ply > 1) h = '<p class="cp-c cp-gap">La partida continúa desde esta posición (el libro omite las jugadas anteriores).</p>' + h;
      return h;
    }
    function renderView(extra) {
      const fen = fenAt(state.ply);
      boardEl.innerHTML = boardSvg(fen, Object.assign({ flip: state.flip, last: lastSquares(state.ply), label: describe(fen) }, extra || {}));
      descEl.textContent = describe(fen);
      plyEl.textContent = state.ply + "/" + moves.length;
      movesEl.querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", i + 1 === state.ply));
      const on = movesEl.querySelector("button.on"); if (on && on.scrollIntoView) { try { on.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) {} }
      el.querySelectorAll('[data-act="first"],[data-act="prev"]').forEach((b) => (b.disabled = state.ply === 0));
      el.querySelectorAll('[data-act="next"],[data-act="last"]').forEach((b) => (b.disabled = state.ply >= moves.length));
      if (state.mode === "ver") comEl.innerHTML = commentHtml(state.ply);
    }
    function renderMoves(hideFrom) {
      let html = "";
      moves.forEach((m, i) => {
        const ply = i + 1;
        if (hideFrom != null && ply >= hideFrom) return;
        const pre = m.color === "w" ? m.n + "." : (i === 0 || m.gap ? m.n + "…" : "");
        html += '<button type="button" data-ply="' + ply + '"' + (m.comentario ? ' class="hasc"' : "") + (claveAt[ply] ? ' data-key="1" title="Momento clave"' : "") + ">" + esc(pre + esSan(m.san) + (m.nag || "")) + "</button>";
      });
      if (hideFrom == null && g.resultado) html += '<span class="cp-h"> ' + esc(g.resultado) + "</span>";
      movesEl.innerHTML = html;
    }
    renderMoves(); renderView();

    // ----- modo "adivinar la jugada" -----
    let game = null;
    const input = boardInput(boardEl, promoEl, () => game, onHumanMove, (sel) => {
      const fen = game.fen(), dots = sel ? game.moves({ square: sel, verbose: true }).map((m) => m.to) : [];
      const h = game.history({ verbose: true }), lm = h.length ? h[h.length - 1] : null;
      boardEl.innerHTML = boardSvg(fen, { flip: state.flip, sel, dots, last: lm ? [lm.from, lm.to] : [], label: describe(fen) });
      descEl.textContent = describe(fen);
    });
    const cmdBtn = cmdForm.querySelector('button[type="submit"]');
    function setMoveInputEnabled(v) { input.enable(v); cmdInput.disabled = !v; cmdBtn.disabled = !v; }
    // Alternativa a clicar en el tablero: escribir la jugada (ej. "Cf3", "e4", "Dxh7+", "e8=D")
    // y que ChessMoveParser la interprete — así se puede adivinar/practicar sin arrastrar ni
    // hacer clic en el SVG, que no es operable por teclado ni por lector de pantalla.
    cmdForm.addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (cmdInput.disabled) return;
      const raw = cmdInput.value;
      if (!raw.trim()) return;
      if (!game) return;
      if (typeof ChessMoveParser === "undefined") { msgEl.textContent = "Falta cargar el intérprete de jugadas."; return; }
      const probe = new Chess(game.fen());
      const mv = ChessMoveParser.tryParseMove(probe, raw);
      if (!mv) { msgEl.textContent = 'Jugada no válida: "' + raw + '". Revísala e intenta de nuevo.'; return; }
      cmdInput.value = "";
      onHumanMove(mv.from + mv.to + (mv.promotion || ""));
    });

    function startGuess() {
      if (typeof Chess !== "function") { msgEl.textContent = "Falta la biblioteca de ajedrez (chess.js)."; return; }
      if (!claves.length) { msgEl.textContent = "Esta partida no tiene momentos clave marcados."; return; }
      state.mode = "adivinar"; state.aciertos = 0; state.fallos = 0;
      state.pendientes = claves.map((c) => c.ply).filter((p) => p >= 1 && p <= moves.length).sort((a, b) => a - b);
      guessBtn.textContent = "✕ Salir del modo adivinar"; practBtn.disabled = true;
      nextGuess();
    }
    function nextGuess() {
      if (!state.pendientes.length) { finishGuess(); return; }
      const ply = state.pendientes.shift();
      state.guess = claveAt[ply]; state.intentos = 0; state.ply = ply - 1;
      game = new Chess(); game.load(fenAt(ply - 1));
      renderMoves(ply); renderView();
      const m = moves[ply - 1];
      comEl.innerHTML = '<p class="cp-c cp-ask"><strong>Momento clave ' + (claves.length - state.pendientes.length) + "/" + claves.length + " · juegan " + (m.color === "w" ? "blancas" : "negras") + ".</strong> " + esc(state.guess.pregunta || "¿Qué jugarías aquí?") + " Haz la jugada en el tablero.</p>";
      msgEl.innerHTML = '<button type="button" data-act="hint" class="cp-mini">Pista</button> <button type="button" data-act="skip" class="cp-mini">Ver la jugada</button>';
      cmdForm.hidden = false; setMoveInputEnabled(true);
    }
    function onHumanMove(uci) {
      if (state.mode === "adivinar") {
        const ply = state.ply + 1, m = moves[ply - 1];
        const exp = m.uci.length > 4 ? m.uci : m.uci; const ok = uci === exp || (uci.slice(0, 4) === exp.slice(0, 4) && exp.length === 4);
        const alt = (state.guess.alternativas || []).indexOf(uci) !== -1 || (state.guess.alternativas || []).indexOf(uci.slice(0, 4)) !== -1;
        if (ok || alt) {
          state.aciertos++; setMoveInputEnabled(false); state.ply = ply;
          renderMoves(); renderView({ good: [uci.slice(0, 2), uci.slice(2, 4)] });
          comEl.innerHTML = '<p class="cp-c cp-good"><strong>' + (ok ? "¡Correcto! " : "¡Muy bien! Esa jugada también es buena; en la partida se jugó " + esc(spokenSan(m.san)) + ". ") + "</strong> " + esc(state.guess.explicacion || m.comentario || "") + "</p>";
          msgEl.innerHTML = '<button type="button" data-act="continue" class="cp-btn">Seguir ▶</button>';
        } else {
          state.intentos++;
          renderView({ bad: [uci.slice(0, 2), uci.slice(2, 4)] });
          if (state.intentos >= 2) { revealGuess(true); return; }
          comEl.innerHTML = '<p class="cp-c cp-bad"><strong>No es esa.</strong> ' + esc(state.guess.pista || "Prueba otra vez: piensa en el plan de la lección.") + "</p>";
        }
        return;
      }
      if (state.mode === "practicar") { game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined }); afterHumanPractice(); }
    }
    function revealGuess(failed) {
      const ply = state.ply + 1, m = moves[ply - 1];
      if (failed) state.fallos++;
      setMoveInputEnabled(false); state.ply = ply; renderMoves(); renderView();
      comEl.innerHTML = '<p class="cp-c ' + (failed ? "cp-bad" : "") + '"><strong>La jugada de la partida fue ' + esc(spokenSan(m.san)) + ".</strong> " + esc(state.guess.explicacion || m.comentario || "") + "</p>";
      msgEl.innerHTML = '<button type="button" data-act="continue" class="cp-btn">Seguir ▶</button>';
    }
    function finishGuess() {
      const total = claves.length, pct = total ? Math.round((100 * state.aciertos) / total) : 0;
      state.mode = "ver"; setMoveInputEnabled(false); cmdForm.hidden = true; guessBtn.textContent = "🎯 Adivinar las jugadas clave"; practBtn.disabled = false;
      renderMoves(); renderView();
      msgEl.innerHTML = "";
      comEl.innerHTML = '<p class="cp-c cp-good"><strong>Resultado: ' + state.aciertos + " de " + total + " momentos clave (" + pct + "%).</strong> " + (pct >= 80 ? "Excelente: entendiste el hilo de la partida." : pct >= 50 ? "Bien. Repasa los comentarios de los momentos que fallaste y vuelve a intentarlo." : "Vuelve a recorrer la partida leyendo los comentarios y repite el ejercicio.") + "</p>";
      guardar(g.id, { tipo: "adivinar", aciertos: state.aciertos, total: total, pct: pct });
    }
    function stopGuess() { state.mode = "ver"; setMoveInputEnabled(false); cmdForm.hidden = true; guessBtn.textContent = "🎯 Adivinar las jugadas clave"; practBtn.disabled = false; msgEl.innerHTML = ""; renderMoves(); renderView(); }

    // ----- práctica contra el motor desde la posición actual -----
    let human = "w";
    function levelKey() { return el.querySelector('[data-act="level"]').value; }
    function startPractice() {
      if (typeof Chess !== "function" || !window.PracticeEngine) { msgEl.textContent = "El motor no está disponible en este navegador."; return; }
      game = new Chess(); if (!game.load(fenAt(state.ply))) { msgEl.textContent = "No se pudo cargar la posición."; return; }
      human = game.turn(); state.mode = "practicar";
      practBtn.textContent = "✕ Terminar la práctica"; guessBtn.disabled = true;
      comEl.innerHTML = '<p class="cp-c">Juegas con ' + (human === "w" ? "blancas" : "negras") + " desde la posición de la jugada " + state.ply + ". Intenta seguir el plan de la partida; el motor responde por el otro bando.</p>";
      msgEl.textContent = "";
      cmdForm.hidden = false;
      PracticeEngine.preload(); setMoveInputEnabled(true); renderPractice();
    }
    function renderPractice(txt) {
      const fen = game.fen(), h = game.history({ verbose: true }), lm = h.length ? h[h.length - 1] : null;
      boardEl.innerHTML = boardSvg(fen, { flip: state.flip, last: lm ? [lm.from, lm.to] : [], label: describe(fen) });
      descEl.textContent = describe(fen);
      movesEl.innerHTML = h.map((m, i) => '<span class="cp-h">' + esSan(m.san) + "</span>").join(" ");
      plyEl.textContent = "práctica";
      if (txt) msgEl.textContent = txt;
    }
    function resultOf() {
      if (game.in_checkmate()) return game.turn() === "w" ? "0-1" : "1-0";
      if (game.in_stalemate() || game.insufficient_material() || game.in_threefold_repetition() || game.in_draw()) return "½-½";
      return null;
    }
    async function afterHumanPractice() {
      renderPractice();
      const r = resultOf(); if (r) { endPractice(r); return; }
      thinking = true; setMoveInputEnabled(false); msgEl.textContent = "El motor piensa…";
      let uci = null;
      try { uci = await PracticeEngine.getMove(game.fen(), levelKey()); } catch (e) { uci = null; }
      thinking = false;
      if (state.mode !== "practicar") return;
      if (!uci) { renderPractice("El motor no respondió. Prueba de nuevo o recarga la página."); setMoveInputEnabled(true); return; }
      const rival = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
      msgEl.textContent = "El motor jugó " + spokenSan(rival.san) + ". Te toca."; setMoveInputEnabled(true); renderPractice();
      const r2 = resultOf(); if (r2) endPractice(r2);
    }
    function endPractice(res) {
      const humanWon = (res === "1-0" && human === "w") || (res === "0-1" && human === "b");
      const txt = "Fin de la partida: " + RES_TXT[res] + (humanWon ? ". ¡Bien jugado!" : res === "½-½" ? "." : ". Revisa la partida modelo y vuelve a intentarlo.");
      guardar(g.id, { tipo: "practica", resultado: res, jugaste: human, desde: state.ply, nivel: levelKey(), jugadas: game.history().length });
      stopPractice(); msgEl.textContent = txt;
    }
    function stopPractice() { state.mode = "ver"; setMoveInputEnabled(false); cmdForm.hidden = true; practBtn.textContent = "♟ Jugar desde aquí contra el motor"; guessBtn.disabled = false; msgEl.textContent = ""; renderMoves(); renderView(); }

    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      const act = b.dataset.act;
      if (b.dataset.ply) { if (state.mode !== "ver") return; state.ply = parseInt(b.dataset.ply, 10); renderView(); return; }
      if (state.mode === "ver" && ["first", "prev", "next", "last"].includes(act)) {
        if (act === "first") state.ply = 0; else if (act === "prev") state.ply = Math.max(0, state.ply - 1);
        else if (act === "next") state.ply = Math.min(moves.length, state.ply + 1); else state.ply = moves.length;
        renderView(); return;
      }
      if (act === "flip") { state.flip = !state.flip; if (state.mode === "practicar") renderPractice(); else renderView(); return; }
      if (act === "guess") { state.mode === "adivinar" ? stopGuess() : startGuess(); return; }
      if (act === "practice") { state.mode === "practicar" ? stopPractice() : startPractice(); return; }
      if (act === "hint" && state.guess) { comEl.innerHTML = '<p class="cp-c cp-ask"><strong>Pista:</strong> ' + esc(state.guess.pista || "Busca la jugada que cumple el plan de la lección.") + "</p>"; return; }
      if (act === "skip") { revealGuess(true); return; }
      if (act === "continue") { nextGuess(); return; }
    });
    boardEl.addEventListener("keydown", (ev) => {
      if (state.mode !== "ver") return;
      if (ev.key === "ArrowRight") { state.ply = Math.min(moves.length, state.ply + 1); renderView(); ev.preventDefault(); }
      if (ev.key === "ArrowLeft") { state.ply = Math.max(0, state.ply - 1); renderView(); ev.preventDefault(); }
    });
  }

  // ---------- 2. ejercicio: encontrar la jugada ----------
  function makeExercise(el, x) {
    const sol = x.solucion || [];
    const state = { ply: 0, flip: parseFen(x.fen).turn === "b", solved: false, tries: 0 };
    const cmdId = "cp-cmd-" + (++cmdSeq);
    el.classList.add("cp-viewer", "cp-ej");
    el.innerHTML =
      '<div class="cp-head"><span class="cp-players">' + esc(x.titulo || ("Ejercicio " + x.n)) + '</span><span class="cp-res">' + (parseFen(x.fen).turn === "w" ? "Juegan blancas" : "Juegan negras") + "</span></div>" +
      '<div class="cp-board" tabindex="0" aria-label="Tablero del ejercicio"></div>' +
      '<div class="cp-side"><div class="cp-comment"><p class="cp-c">' + esc(x.pregunta || "Encuentra la mejor jugada.") + " Juégala en el tablero.</p></div>" +
      '<div class="cp-controls" role="group" aria-label="Recorrer la solución" hidden><button type="button" data-act="first">⏮</button><button type="button" data-act="prev">◀</button><span class="cp-ply"></span><button type="button" data-act="next">▶</button><button type="button" data-act="last">⏭</button></div>' +
      '<div class="cp-actions"><button type="button" data-act="hint" class="cp-mini">Pista</button><button type="button" data-act="show" class="cp-mini">Ver la solución</button></div>' +
      '<form class="cp-cmd"><label for="' + cmdId + '">Escribe tu jugada</label> ' +
      '<input type="text" id="' + cmdId + '" class="cp-cmd-input" autocomplete="off" placeholder="ej. Cf3, e4, Dxh7+, e8=D"> ' +
      '<button type="submit" class="cp-mini">Jugar</button></form>' +
      '<div class="cp-promo" hidden><span>Coronar:</span><button type="button" data-p="q">♕ Dama</button><button type="button" data-p="r">♖ Torre</button><button type="button" data-p="b">♗ Alfil</button><button type="button" data-p="n">♘ Caballo</button></div>' +
      '<div class="cp-msg" aria-live="polite"></div></div><div class="cp-moves"></div><p class="cp-desc sr-only" aria-live="polite" aria-atomic="true"></p>';
    const boardEl = el.querySelector(".cp-board"), comEl = el.querySelector(".cp-comment"), movesEl = el.querySelector(".cp-moves"), ctr = el.querySelector(".cp-controls"), plyEl = el.querySelector(".cp-ply"), promoEl = el.querySelector(".cp-promo"), descEl = el.querySelector(".cp-desc");
    const cmdForm = el.querySelector(".cp-cmd"), cmdInput = cmdForm.querySelector("input"), msgEl = el.querySelector(".cp-msg");
    let game = null;
    function fenAt(p) { return p === 0 ? x.fen : sol[p - 1].fen; }
    function render(extra) {
      const fen = state.solved ? fenAt(state.ply) : (game ? game.fen() : x.fen);
      const last = state.solved && state.ply ? [sol[state.ply - 1].uci.slice(0, 2), sol[state.ply - 1].uci.slice(2, 4)] : [];
      boardEl.innerHTML = boardSvg(fen, Object.assign({ flip: state.flip, last, label: describe(fen) }, extra || {}));
      descEl.textContent = describe(fen);
      if (state.solved) {
        plyEl.textContent = state.ply + "/" + sol.length;
        movesEl.querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", i + 1 === state.ply));
        const m = state.ply ? sol[state.ply - 1] : null;
        comEl.innerHTML = '<p class="cp-c">' + (m ? "<strong>" + esc(moveLabel(m)) + "</strong> " + esc(m.comentario || "") : esc(x.explicacion || "")) + "</p>";
      }
    }
    function onExerciseMove(uci) {
      state.tries++;
      const exp = sol.length ? sol[0].uci : null;
      const ok = exp && (uci === exp || uci.slice(0, 4) === exp.slice(0, 4) && exp.length === 4) || (x.alternativas || []).indexOf(uci) !== -1;
      if (ok) { solve(true); }
      else {
        render({ bad: [uci.slice(0, 2), uci.slice(2, 4)] });
        if (state.tries >= 3) { comEl.innerHTML = '<p class="cp-c cp-bad"><strong>No es esa.</strong> Mira la solución y estudia la idea.</p>'; }
        else comEl.innerHTML = '<p class="cp-c cp-bad"><strong>No es esa.</strong> ' + esc(x.pista || "Busca la idea principal de la lección.") + " Intento " + state.tries + " de 3.</p>";
      }
    }
    const input = boardInput(boardEl, promoEl, () => game, onExerciseMove, (sel) => {
      const dots = sel ? game.moves({ square: sel, verbose: true }).map((m) => m.to) : [];
      boardEl.innerHTML = boardSvg(game.fen(), { flip: state.flip, sel, dots, label: describe(game.fen()) });
    });
    const cmdBtn = cmdForm.querySelector('button[type="submit"]');
    // Misma idea que en la partida comentada: escribir la jugada en vez de hacer clic en el
    // SVG del tablero, que no es operable por teclado ni por lector de pantalla.
    cmdForm.addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (state.solved || !game) return;
      const raw = cmdInput.value;
      if (!raw.trim()) return;
      if (typeof ChessMoveParser === "undefined") { msgEl.textContent = "Falta cargar el intérprete de jugadas."; return; }
      const probe = new Chess(game.fen());
      const mv = ChessMoveParser.tryParseMove(probe, raw);
      if (!mv) { msgEl.textContent = 'Jugada no válida: "' + raw + '". Revísala e intenta de nuevo.'; return; }
      cmdInput.value = "";
      onExerciseMove(mv.from + mv.to + (mv.promotion || ""));
    });
    function solve(byUser) {
      state.solved = true; input.enable(false); cmdForm.hidden = true; cmdInput.disabled = true; cmdBtn.disabled = true;
      ctr.hidden = false; el.querySelector('[data-act="show"]').hidden = true; el.querySelector('[data-act="hint"]').hidden = true;
      movesEl.innerHTML = sol.map((m, i) => '<button type="button" data-ply="' + (i + 1) + '">' + esc(moveLabel(m)) + "</button>").join("") + (x.resultado ? '<span class="cp-h"> ' + esc(x.resultado) + "</span>" : "");
      state.ply = 1; render(byUser ? { good: [sol[0].uci.slice(0, 2), sol[0].uci.slice(2, 4)] } : {});
      comEl.innerHTML = '<p class="cp-c ' + (byUser ? "cp-good" : "") + '"><strong>' + (byUser ? "¡Correcto! " : "Solución: ") + esc(spokenSan(sol[0].san)) + ".</strong> " + esc(x.explicacion || sol[0].comentario || "") + " Recorre la línea completa con las flechas.</p>";
      guardar(x.id, { tipo: "ejercicio", ok: !!byUser, intentos: state.tries });
    }
    if (typeof Chess === "function") { game = new Chess(); game.load(x.fen); input.enable(true); }
    render();
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      const act = b.dataset.act;
      if (b.dataset.ply) { state.ply = parseInt(b.dataset.ply, 10); render(); return; }
      if (act === "hint") { comEl.innerHTML = '<p class="cp-c cp-ask"><strong>Pista:</strong> ' + esc(x.pista || "Piensa en el desequilibrio de material y en qué pieza está mal colocada.") + "</p>"; return; }
      if (act === "show") { solve(false); return; }
      if (!state.solved) return;
      if (act === "first") state.ply = 0; else if (act === "prev") state.ply = Math.max(0, state.ply - 1);
      else if (act === "next") state.ply = Math.min(sol.length, state.ply + 1); else if (act === "last") state.ply = sol.length;
      render();
    });
  }

  // ---------- 3. cuestionario ----------
  function makeQuiz(el, q) {
    const items = q.preguntas || [];
    el.classList.add("cp-quiz-box");
    el.innerHTML = '<form class="cp-quiz-form">' + items.map((it, i) =>
      '<fieldset class="cp-q"><legend><strong>' + (i + 1) + ".</strong> " + esc(it.pregunta) + "</legend>" +
      it.opciones.map((o, j) => '<label class="cp-opt"><input type="radio" name="' + esc(q.id) + "-" + i + '" value="' + j + '"> <span>' + esc(o) + "</span></label>").join("") +
      '<p class="cp-qexp" hidden></p></fieldset>').join("") +
      '<div class="cp-actions"><button type="submit" class="cp-btn">Comprobar respuestas</button><span class="cp-qscore" aria-live="polite"></span></div></form>';
    const form = el.querySelector("form");
    const prev = progreso()[q.id];
    if (prev) el.querySelector(".cp-qscore").textContent = "Último resultado: " + prev.aciertos + "/" + prev.total + " (" + prev.fecha + ")";
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      let ok = 0, answered = 0;
      items.forEach((it, i) => {
        const fs = form.querySelectorAll(".cp-q")[i], sel = form.querySelector('input[name="' + q.id + "-" + i + '"]:checked');
        const exp = fs.querySelector(".cp-qexp");
        fs.querySelectorAll(".cp-opt").forEach((lab, j) => { lab.classList.remove("ok", "bad"); if (j === it.correcta) lab.classList.add("ok"); });
        if (sel) {
          answered++;
          const v = parseInt(sel.value, 10);
          if (v === it.correcta) ok++; else fs.querySelectorAll(".cp-opt")[v].classList.add("bad");
        }
        exp.hidden = false; exp.textContent = (sel && parseInt(sel.value, 10) === it.correcta ? "✔ " : "✘ ") + (it.explicacion || "");
      });
      const pct = items.length ? Math.round((100 * ok) / items.length) : 0;
      el.querySelector(".cp-qscore").textContent = "Resultado: " + ok + " de " + items.length + " (" + pct + "%)" + (answered < items.length ? " · dejaste " + (items.length - answered) + " sin responder" : "") + (pct >= 80 ? " · ¡muy bien!" : pct >= 60 ? " · aprobado; repasa lo que fallaste" : " · repasa la lección y vuelve a intentarlo");
      guardar(q.id, { tipo: "quiz", aciertos: ok, total: items.length, pct: pct });
    });
  }

  // ---------- inicialización perezosa (los <details> cerrados esperan) ----------
  function pendientes(root) {
    return Array.from(root.querySelectorAll(".cp-partida[data-id]:not(.cp-viewer),.cp-ejercicio[data-id]:not(.cp-viewer),.cp-quiz[data-id]:not(.cp-quiz-box)")).filter((el) => {
      let p = el.parentElement;
      while (p && p !== root) { if (p.tagName === "DETAILS" && !p.open) return false; p = p.parentElement; }
      return true;
    });
  }
  function init(root) {
    root = root || document;
    if (!root.__cp) { root.__cp = true; root.querySelectorAll("details").forEach((dt) => dt.addEventListener("toggle", () => { if (dt.open) init(root); })); }
    const nodes = pendientes(root);
    if (!nodes.length) return Promise.resolve();
    injectDefs();
    return loadData(root).then(() => {
      nodes.forEach((el) => {
        const id = el.dataset.id;
        if (el.classList.contains("cp-partida")) { const g = data.partidas[id]; if (g) makeGame(el, g); else fallo(el, id); }
        else if (el.classList.contains("cp-ejercicio")) { const x = (data.ejercicios || {})[id]; if (x) makeExercise(el, x); else fallo(el, id); }
        else if (el.classList.contains("cp-quiz")) { const q = (data.quizzes || {})[id]; if (q) makeQuiz(el, q); else fallo(el, id); }
      });
      marcarProgreso(root);
    }).catch((e) => { nodes.forEach((el) => { el.innerHTML = '<p class="text-xs text-red-500">No se pudo cargar el contenido del curso (' + esc(e.message) + ").</p>"; }); });
  }
  function fallo(el, id) { el.innerHTML = '<p class="text-xs text-red-500">Elemento no encontrado (' + esc(id) + ").</p>"; el.classList.add("cp-viewer"); }
  function marcarProgreso(root) {
    const p = progreso();
    (root || document).querySelectorAll(".cp-partida[data-id],.cp-ejercicio[data-id]").forEach((el) => {
      const rec = p[el.dataset.id], head = el.querySelector(".cp-head");
      if (rec && head && !head.querySelector(".cp-done")) {
        const s = document.createElement("span"); s.className = "cp-done";
        s.textContent = rec.tipo === "adivinar" ? "✔ " + rec.aciertos + "/" + rec.total : rec.tipo === "ejercicio" ? (rec.ok ? "✔ resuelto" : "• visto") : "• practicado";
        head.appendChild(s);
      }
    });
  }
  document.addEventListener("cp:progreso", () => marcarProgreso(document));

  window.CursoPartidas = { init, loadData, boardSvg, progreso };
})();
