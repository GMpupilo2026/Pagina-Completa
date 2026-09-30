/**
 * Ajedrez Integral — "El mapa de los finales"
 *
 * Da vida al contenido protegido del curso (cursos/protegido/el-mapa-de-los-finales.html):
 * cada <div class="f100-diag" data-id="F52-1"> se convierte en un tablero con la
 * línea principal (jugada a jugada) y un modo "Practicar contra el motor" que usa
 * el Stockfish del sitio (js/shared-engine.js + js/practice-engine.js) y chess.js.
 *
 * Datos: cursos/protegido/data/el-mapa-de-los-finales.json (la base de datos del curso,
 * protegida por el Worker igual que el resto del contenido). Se descarga una sola
 * vez y se guarda en memoria.
 *
 * API: window.Finales100.init(rootElement) — la llama el cargador del curso
 * después de inyectar el fragmento protegido.
 *
 * Progreso: cada práctica terminada se guarda en localStorage (f100:progreso) y,
 * si hay sesión de Academia y EntrenoProgress, también en training_progress con
 * activity "finales100" y el curso en detail.curso: cuenta para la meta del día,
 * la racha y los logros, y su tiempo va con el del curso.
 */
(function () {
  "use strict";

  /* De qué archivo salen las posiciones. Este módulo nació para "Los 100
     finales", pero el visor (tablero, línea jugada a jugada y práctica contra
     el motor) sirve para cualquier curso: el curso lo dice en el
     data-course de #course-content-body y de ahí sale el JSON. */
  // Carpeta de datos relativa a ESTE archivo (no a la página): así el visor funciona
  // igual desde cursos/<curso>.html y desde cursos/academia/<curso>.html.
  const DATA_BASE = (function () {
    try {
      const me = document.currentScript && document.currentScript.src;
      if (me) return new URL("../cursos/protegido/data/", me).href;
    } catch (e) {}
    return "protegido/data/";
  })();
  const CURSO_POR_DEFECTO = "el-mapa-de-los-finales";

  function cursoDe(root) {
    const cont = (root && root.closest && root.closest("[data-course]")) ||
      (root && root.querySelector && root.querySelector("[data-course]")) ||
      document.getElementById("course-content-body");
    return (cont && cont.dataset && cont.dataset.course) || CURSO_POR_DEFECTO;
  }
  function urlDatos(root) { return DATA_BASE + cursoDe(root) + ".json"; }
  // El curso de lo practicado: la base cuenta esa fila en el tiempo del curso
  // (tiempo_por_seccion la junta con «curso:<slug>», donde se fue el rato).
  let cursoActual = CURSO_POR_DEFECTO;
  const LIGHT = "#f0dcc0", DARK = "#a5744a", BORDER = "#2b1d12", MARK = "#c8961e", SEL = "#3b82f6";
  const RES_TXT = { "1-0": "Ganan blancas", "0-1": "Ganan negras", "½": "Tablas" };
  const ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };

  let data = null, dataPromise = null, cmdSeq = 0;

  function loadData(url) {
    if (data && data.__url === url) return Promise.resolve(data);
    if (dataPromise && dataPromise.__url === url) return dataPromise;
    dataPromise = fetch(url, { credentials: "same-origin" })
      .then((r) => { if (!r.ok) throw new Error("datos " + r.status); return r.json(); })
      .then((d) => { d.__url = url; data = d; buildIndex(); return d; });
    dataPromise.__url = url;
    return dataPromise;
  }

  const byId = {};
  function buildIndex() {
    (data.finales || []).forEach((f) => (f.diagramas || []).forEach((d) => { byId[d.id] = Object.assign({ final: f }, d); }));
    if (!data.examenes) return;   // un curso puede traer solo posiciones
    data.examenes.basico.forEach((q) => { byId["EB-" + q.n] = Object.assign({ examen: "basico" }, q, { id: "EB-" + q.n, titulo: q.pregunta, comentario: q.respuesta, fenInicio: q.fen, fen: q.fen_solucion, jugadas: q.jugadas }); });
    data.examenes.final.forEach((q) => { byId["EF-" + q.n] = Object.assign({ examen: "final" }, q, { id: "EF-" + q.n, titulo: q.pregunta, comentario: q.respuesta, fenInicio: q.fen, fen: q.fen_solucion, jugadas: q.jugadas }); });
    (data.fortalezas || []).forEach((f) => { byId["FT-" + f.n] = Object.assign({ fortaleza: true }, f, { id: "FT-" + f.n, resultado: "½", jugadas: [], comentario: f.nota, linea: "" }); });
  }

  function injectDefs() {
    if (window.ChessPieceSVG) window.ChessPieceSVG.injectDefs();
  }

  // ---------- FEN ----------
  function parseFen(fen) {
    const parts = fen.split(" ");
    const rows = parts[0].split("/");
    const board = {};
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of rows[r]) {
        if (/\d/.test(ch)) f += parseInt(ch, 10);
        else { board["abcdefgh"[f] + (8 - r)] = ch; f++; }
      }
    }
    return { board, turn: parts[1] || "w" };
  }

  function esSan(san) {
    return san.replace(/^([KQRBN])/, (m, p) => ES[p]).replace(/=([QRBN])/, (m, p) => "=" + ES[p]);
  }

  // ---------- tablero SVG ----------
  function boardSvg(fen, opts) {
    opts = opts || {};
    const { board, turn } = parseFen(fen);
    const size = 100, cell = size / 8, pad = 5.5, total = size + 2 * pad;
    const flip = !!opts.flip;
    const s = ['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + total + " " + total + '" class="f100-svg" role="img" aria-label="' + (opts.label || "Tablero") + '">'];
    s.push('<rect x="0" y="0" width="' + total + '" height="' + total + '" fill="#fff"/>');
    s.push('<rect x="' + (pad - 1) + '" y="' + (pad - 1) + '" width="' + (size + 2) + '" height="' + (size + 2) + '" fill="' + BORDER + '"/>');
    const xy = (sq) => {
      let f = "abcdefgh".indexOf(sq[0]), r = 8 - parseInt(sq[1], 10);
      if (flip) { f = 7 - f; r = 7 - r; }
      return [pad + f * cell, pad + r * cell];
    };
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const sq = "abcdefgh"[flip ? 7 - c : c] + (flip ? r + 1 : 8 - r);
      s.push('<rect data-sq="' + sq + '" x="' + (pad + c * cell) + '" y="' + (pad + r * cell) + '" width="' + cell + '" height="' + cell + '" fill="' + ((r + c) % 2 === 0 ? LIGHT : DARK) + '"/>');
    }
    (opts.last || []).forEach((sq) => { const [x, y] = xy(sq); s.push('<rect x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell + '" fill="' + MARK + '" fill-opacity="0.45" pointer-events="none"/>'); });
    (opts.sel ? [opts.sel] : []).forEach((sq) => { const [x, y] = xy(sq); s.push('<rect x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell + '" fill="' + SEL + '" fill-opacity="0.45" pointer-events="none"/>'); });
    for (let c = 0; c < 8; c++) s.push('<text x="' + (pad + c * cell + cell / 2) + '" y="' + (total - 1.2) + '" font-size="3.6" fill="#6b5442" text-anchor="middle" font-family="sans-serif">' + "abcdefgh"[flip ? 7 - c : c] + "</text>");
    for (let r = 0; r < 8; r++) s.push('<text x="' + (pad * 0.45) + '" y="' + (pad + r * cell + cell / 2 + 1.3) + '" font-size="3.6" fill="#6b5442" text-anchor="middle" font-family="sans-serif">' + (flip ? r + 1 : 8 - r) + "</text>");
    (opts.marks || []).forEach((sq) => { const [x, y] = xy(sq); s.push('<circle cx="' + (x + cell / 2) + '" cy="' + (y + cell / 2) + '" r="' + (cell * 0.16) + '" fill="' + MARK + '" fill-opacity="0.9" pointer-events="none"/>'); });
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
  function progreso() { try { return JSON.parse(localStorage.getItem("f100:progreso") || "{}"); } catch (e) { return {}; } }
  function guardar(id, rec) {
    try { const p = progreso(); p[id] = rec; localStorage.setItem("f100:progreso", JSON.stringify(p)); } catch (e) {}
    if (window.EntrenoProgress) { try { window.EntrenoProgress.log("finales100", Object.assign({ diagrama: id, curso: cursoActual }, rec)); } catch (e) {} }
    document.dispatchEvent(new CustomEvent("f100:progreso", { detail: { id, rec } }));
  }

  // ---------- visor ----------
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  // Igual que en Modo Adaptado (js/blind-notation.js): "a1" se dice "anna 1", no letra por
  // letra, para que un lector de pantalla no confunda "b"/"v" ni "c"/"s" al oído. describe()
  // solo alimenta contenido sr-only (.f100-desc) y el aria-label del SVG, nunca texto visible,
  // así que la notación hablada no cambia nada para quien ve el tablero.
  function spokenSquares(sqs) {
    return window.BlindNotation ? sqs.map((sq) => BlindNotation.squareSpoken(sq)).join(", ") : sqs.join(", ");
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

  /* La posición que el visor tiene AHORA en pantalla, publicada en el propio
     elemento. Quien lo envuelve puede así ofrecer algo con ella sin volver a
     leer el archivo de datos ni rehacer la cuenta de jugadas: sesion.html le
     pone a cada diagrama un botón que la transmite al tablero de la clase en
     vivo, y lo que transmite es lo que el profesor está viendo — la posición
     inicial o la jugada de la línea a la que llegó, no siempre la primera. */
  function publicarFen(el, fen) { el.dataset.fenActual = fen; }

  /* ---------- el recuadro donde se escribe ----------
     Era un <form> propio que solo entendía jugadas y solo aparecía al
     practicar: con lector de pantalla no había forma de preguntarle nada a la
     posición («caballos», «qué hay en e4») ni de recorrer la línea sin salir a
     buscar los botones. Ahora es el mismo cuadro de comandos de Entrenamiento
     (js/cuadro-comandos.js), con sus preguntas, y además recorre la línea
     escribiendo («siguiente», «jugada 5»), como el tablero de Estudio.
     Las piezas las trae js/curso-adaptado.js (CursoAdaptado.piezas); donde esa
     página no está (la vista pública del curso) queda un recuadro sencillo que
     entiende jugadas, que es lo que había. */
  function conPiezas(listo) {
    if (window.CursoAdaptado && window.CursoAdaptado.piezas) window.CursoAdaptado.piezas(listo);
    else listo();
  }
  function cuadroSencillo(host, cfg) {
    const form = document.createElement("form");
    const id = "f100-cmd-" + (++cmdSeq);
    const lab = document.createElement("label");
    lab.setAttribute("for", id);
    lab.textContent = cfg.etiqueta;
    const input = document.createElement("input");
    input.type = "text"; input.id = id; input.autocomplete = "off";
    // `.cc-input`: así lo encuentra Alt + Mayúscula + C (js/vision-cuenta.js).
    input.className = "cc-input f100-cmd-input";
    input.placeholder = "ej. Cf3, e4, Dxh7+, e8=D";
    const btn = document.createElement("button");
    btn.type = "submit"; btn.className = "f100-btn f100-btn2"; btn.textContent = "Enviar";
    const msg = document.createElement("span");
    msg.setAttribute("role", "status");
    form.append(lab, input, btn, msg);
    host.appendChild(form);
    const api = {
      el: form, input,
      decir(t) { msg.textContent = t || ""; return api; },
      limpiar() { input.value = ""; return api; },
      ayuda() { return api; },
    };
    form.addEventListener("submit", (ev) => { ev.preventDefault(); if (input.value.trim()) cfg.onEnviar(input.value, api); });
    return api;
  }
  function montarCuadro(host, cfg, listo) {
    conPiezas(() => {
      const api = window.CuadroComandos ? window.CuadroComandos.montar(host, cfg) : cuadroSencillo(host, cfg);
      /* Dentro del contenedor (que es flex), el recuadro ocupa todo el ancho y
         puede encogerse; y su etiqueta se parte en renglones: la hoja del curso
         deja las etiquetas de ese contenedor en una sola línea, y la del
         recuadro, larga, lo empujaba fuera de la columna. */
      if (api && api.el) {
        api.el.style.flex = "1 1 100%";
        api.el.style.minWidth = "0";
        const lab = api.el.querySelector("label");
        if (lab) lab.style.whiteSpace = "normal";
      }
      listo(api);
    });
  }
  // La jugada escrita, buscada entre las legales (js/comandos-tablero.js); sin
  // ese módulo, el intérprete de siempre sobre una copia de la partida.
  function jugadaEscrita(game, texto) {
    if (window.ComandosTablero && window.ComandosTablero.jugadaEscrita) return window.ComandosTablero.jugadaEscrita(game, texto);
    if (typeof ChessMoveParser === "undefined") return null;
    return ChessMoveParser.tryParseMove(new Chess(game.fen()), texto);
  }
  /* Una jugada CONTADA, para decirla: «el caballo negro va de gustav 8 a felix
     6». Sin js/visor-linea.js, al menos la jugada en palabras. */
  function contar(mv) {
    if (!mv) return "";
    if (window.VisorLinea && window.VisorLinea.jugadaContada) {
      const t = window.VisorLinea.jugadaContada(mv);
      return t.charAt(0).toLowerCase() + t.slice(1).replace(/\.$/, "");
    }
    return window.BlindNotation ? window.BlindNotation.sanSpoken(mv.san) : esSan(mv.san);
  }
  function sinTildes(t) { return String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }

  function makeViewer(el, d) {
    const startFen = d.fenInicio || d.fen;
    const moves = d.jugadas || [];
    const state = { ply: 0, flip: false, mode: "ver", practice: null, showSol: !d.examen };
    const hasSol = moves.length > 0 && !d.ilustracion;
    el.classList.add("f100-viewer");
    el.innerHTML =
      '<div class="f100-head"><span class="f100-num">' + esc(d.id.replace(/^F(\d+)-(\d+)$/, "Final $1 · diagrama $2").replace(/^EB-/, "Pregunta ").replace(/^EF-/, "Pregunta ").replace(/^FT-/, "Fortaleza ")) + "</span>" +
      '<span class="f100-res" data-res="' + esc(d.resultado) + '">' + esc(d.examen ? "Juegan " + (d.turno === "w" ? "blancas" : "negras") : RES_TXT[d.resultado] + (d.fin ? " → " + RES_TXT[d.fin] : "")) + "</span></div>" +
      '<div class="f100-board" tabindex="0" aria-label="Diagrama"></div>' +
      // La posición escrita NO es región viva: se lee cuando se quiere (o se
      // pide con «posición»); lo que se dice solo en cada paso es la jugada,
      // en .f100-anuncio.
      '<p class="f100-desc sr-only"></p>' +
      '<div class="f100-controls" role="group" aria-label="Recorrer la línea">' +
      '<button type="button" data-act="first" aria-label="Posición inicial">⏮</button><button type="button" data-act="prev" aria-label="Jugada anterior">◀</button>' +
      '<span class="f100-ply"></span><span class="f100-anuncio sr-only" role="status"></span>' +
      '<button type="button" data-act="next" aria-label="Jugada siguiente">▶</button><button type="button" data-act="last" aria-label="Última jugada">⏭</button>' +
      '<button type="button" data-act="flip" aria-label="Girar el tablero" title="Girar el tablero">⇅</button></div>' +
      '<div class="f100-moves" aria-label="Línea principal"></div>' +
      '<div class="f100-practice"><button type="button" data-act="practice" class="f100-btn">♟ Practicar contra el motor</button>' +
      '<label class="f100-level">Nivel <select data-act="level"><option value="1500">1500</option><option value="1800" selected>1800</option><option value="max">Máximo</option></select></label>' +
      '<span class="f100-pstatus" aria-live="polite"></span></div>' +
      '<div class="f100-cmd" hidden></div>' +
      '<div class="f100-promo" hidden><span>Coronar:</span><button data-p="q">♕ Dama</button><button data-p="r">♖ Torre</button><button data-p="b">♗ Alfil</button><button data-p="n">♘ Caballo</button></div>' +
      '<div class="f100-msg" aria-live="polite"></div>';
    const boardEl = el.querySelector(".f100-board");
    const movesEl = el.querySelector(".f100-moves");
    const plyEl = el.querySelector(".f100-ply");
    const msgEl = el.querySelector(".f100-msg");
    const pst = el.querySelector(".f100-pstatus");
    const descEl = el.querySelector(".f100-desc");
    const anuncioEl = el.querySelector(".f100-anuncio");
    const cmdHost = el.querySelector(".f100-cmd");
    let cuadro = null;

    /* Vaciar y repoblar: una región viva no habla si el texto no cambió
       (volver a la misma jugada desde el otro lado). */
    function anunciar(texto) {
      anuncioEl.textContent = "";
      setTimeout(() => { anuncioEl.textContent = texto; }, 50);
      if (window.BlindNotation && window.BlindNotation.speak) window.BlindNotation.speak(texto);
    }
    /* El recuadro se ve en Modo Adaptado (lo decide el CSS de
       js/cuadro-comandos.js) y, para todos, mientras se practica: escribir la
       jugada en vez de hacer clic en el tablero era lo que ya ofrecía. */
    function mostrarCuadro() {
      const practicando = state.mode === "practicar";
      cmdHost.hidden = !(practicando || document.documentElement.classList.contains("adaptive-mode"));
      if (cuadro && cuadro.el) cuadro.el.style.display = practicando ? "block" : "";
    }
    document.addEventListener("adaptivemode:change", mostrarCuadro);

    /* El tablero: el SVG de siempre, o en Modo Adaptado el de casillas que se
       recorre con el teclado (js/curso-adaptado.js, CursoAdaptado.tablero). Las
       dos van por acá para que ninguna de las formas de repintar se olvide de
       una. */
    function pintarTablero(fen, opts) {
      const o = Object.assign({ nombre: "Tablero del diagrama", cuadro: () => el.querySelector(".cc-input") }, opts);
      if (window.CursoAdaptado && window.CursoAdaptado.tablero && window.CursoAdaptado.tablero(boardEl, fen, o)) return;
      boardEl.innerHTML = boardSvg(fen, opts);
    }

    function currentFen() { return state.ply === 0 ? startFen : moves[state.ply - 1].fen; }
    function lastSquares() {
      if (state.ply === 0) return [];
      const u = moves[state.ply - 1].uci; return [u.slice(0, 2), u.slice(2, 4)];
    }
    function renderView() {
      const fen = currentFen();
      publicarFen(el, fen);
      pintarTablero(fen, { flip: state.flip, marks: state.ply === 0 ? d.marcas : [], last: lastSquares(), label: describe(fen) });
      descEl.textContent = describe(fen);
      plyEl.textContent = moves.length ? state.ply + "/" + moves.length : "";
      movesEl.querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", i + 1 === state.ply));
      el.querySelectorAll('[data-act="first"],[data-act="prev"]').forEach((b) => (b.disabled = state.ply === 0));
      el.querySelectorAll('[data-act="next"],[data-act="last"]').forEach((b) => (b.disabled = state.ply >= moves.length));
    }
    function renderMoves() {
      if (!hasSol || !state.showSol) { movesEl.innerHTML = d.examen && hasSol ? '<button type="button" class="f100-btn f100-showsol">Ver la solución</button>' : ""; return; }
      const t0 = parseFen(startFen).turn;
      let html = "";
      moves.forEach((m, i) => {
        const n = Math.floor((i + (t0 === "b" ? 1 : 0)) / 2) + 1;
        const pre = i === 0 && t0 === "b" ? n + "…" : (i + (t0 === "b" ? 1 : 0)) % 2 === 0 ? n + "." : "";
        html += '<button type="button" data-ply="' + (i + 1) + '">' + pre + esSan(m.san) + "</button>";
      });
      movesEl.innerHTML = html;
    }
    renderMoves(); renderView();
    // Encender o apagar el Modo Adaptado cambia de tablero en el momento; y las
    // piezas del de casillas llegan después del primer dibujo.
    function repintar() { if (state.mode === "practicar" && game) renderPractice(); else renderView(); }
    document.addEventListener("adaptivemode:change", repintar);

    /* Ir a una jugada de la línea y DECIRLA: «Jugada 3 de 12: el rey blanco va
       de eva 5 a david 6». Antes solo cambiaba el «3/12» y la posición entera
       se volvía a dictar; lo que cambió era la jugada. */
    function irA(ply) {
      state.ply = Math.max(0, Math.min(moves.length, ply));
      renderView();
      if (state.ply === 0) { anunciar("Posición inicial."); return; }
      let mv = null;
      try { mv = new Chess(state.ply === 1 ? startFen : moves[state.ply - 2].fen).move(moves[state.ply - 1].san, { sloppy: true }); } catch (e) {}
      const t = contar(mv) || esSan(moves[state.ply - 1].san);
      anunciar("Jugada " + state.ply + " de " + moves.length + ": " + t + ".");
    }

    // La posición que se está mirando, para las preguntas del recuadro.
    let vista = null;
    function juegoVisto() {
      if (state.mode === "practicar" && game) return game;
      const fen = currentFen();
      if (!vista || vista.__fen !== fen) { try { vista = new Chess(fen); vista.__fen = fen; } catch (e) { vista = null; } }
      return vista;
    }

    function alEscribir(texto, api) {
      const t = sinTildes(texto);
      if (state.mode === "practicar") {
        if (/^(terminar|salir|parar)( la practica)?$/.test(t)) { stopPractice(); api.limpiar().decir("Terminaste la práctica."); return; }
        if (thinking) { api.decir("El motor está pensando: espera su jugada."); return; }
        if (pendingPromo) { api.decir("Elige la pieza para coronar con los botones de debajo."); return; }
        if (game.turn() !== human) { api.decir("No es tu turno todavía."); return; }
        const mv = jugadaEscrita(game, texto);
        if (!mv) { api.decir("Jugada no válida: «" + texto.trim() + "». Revísala e intenta de nuevo, o pregunta «posición» o «caballos»."); return; }
        const hecha = game.move({ from: mv.from, to: mv.to, promotion: mv.promotion || undefined });
        if (!hecha) { api.decir("Jugada no válida: «" + texto.trim() + "»."); return; }
        api.limpiar().decir(""); sel = null; afterHuman();
        return;
      }
      if (/^(practicar|jugar|jugar contra el motor)$/.test(t)) { api.limpiar(); startPractice(); return; }
      if (/^girar( el tablero)?$/.test(t)) { api.limpiar(); state.flip = !state.flip; renderView(); api.decir(state.flip ? "Ahora ves el tablero desde las negras." : "Ahora ves el tablero desde las blancas."); return; }
      const n = window.VisorLinea ? window.VisorLinea.pasoPedido(texto, state.ply, moves.length) : null;
      if (n === null) { api.decir("No entendí «" + texto.trim() + "». Escribe «siguiente», «anterior», «jugada 5», «practicar» para jugar contra el motor, o una pregunta como «caballos»."); return; }
      if (!hasSol) { api.decir("Esta posición no trae una línea para recorrer. Escribe «practicar» para jugarla contra el motor."); return; }
      /* Con la solución tapada, recorrer la línea es pedir verla: se hace lo
         que haría el botón «Ver la solución» y se va a la jugada pedida. Antes
         contestaba «usa el botón», y quien no ve tenía que salir del recuadro
         a buscarlo con Tab. */
      if (!state.showSol) {
        state.showSol = true; renderMoves(); renderView();
        api.limpiar().decir("Aquí está la solución: la línea tiene " + moves.length + (moves.length === 1 ? " jugada." : " jugadas."));
        if (n >= 1) irA(Math.min(n, moves.length));
        return;
      }
      if (n < 0) { api.decir("Ya estás en la posición inicial."); return; }
      if (n > moves.length) { api.decir("Ya estás en la última jugada de la línea."); return; }
      api.limpiar().decir("");
      irA(n);
    }

    montarCuadro(cmdHost, {
      etiqueta: "Escribe tu jugada, recorre la línea o pregunta por la posición",
      juego: juegoVisto,
      // La posición no se dicta en cada jugada: se dice la jugada.
      posicionViva: false,
      onEnviar: alEscribir,
    }, (api) => {
      cuadro = api;
      api.ayuda("Recorrer: «siguiente», «anterior», «jugada 5». Jugar contra el motor: «practicar», y luego la jugada («Cf3», «e4»). Preguntar: «posición», «caballos», «qué hay en e4».");
      mostrarCuadro();
    });
    mostrarCuadro();

    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.classList.contains("f100-showsol")) { state.showSol = true; renderMoves(); renderView(); return; }
      if (b.dataset.ply) { if (state.mode !== "ver") return; irA(parseInt(b.dataset.ply, 10)); return; }
      const act = b.dataset.act;
      // Recorrer la línea con ◀ ▶ muestra las jugadas en el tablero: es ver la
      // solución, así que la lista se destapa también (como «jugada 2» escrita).
      if (state.mode === "ver" && hasSol && !state.showSol && /^(first|prev|next|last)$/.test(act || "")) { state.showSol = true; renderMoves(); }
      if (state.mode === "ver") {
        if (act === "first") { irA(0); return; }
        if (act === "prev") { irA(state.ply - 1); return; }
        if (act === "next") { irA(state.ply + 1); return; }
        if (act === "last") { irA(moves.length); return; }
      }
      if (act === "flip") { state.flip = !state.flip; state.mode === "ver" ? renderView() : renderPractice(); return; }
      if (act === "practice") { state.mode === "ver" ? startPractice() : stopPractice(); return; }
      if (b.dataset.p) { finishPromotion(b.dataset.p); return; }
    });
    boardEl.addEventListener("keydown", (ev) => {
      // Sobre una casilla, las flechas son de js/tablero-accesible.js (mover el
      // foco), no de la línea: si no, cada flecha haría las dos cosas.
      if (state.mode !== "ver" || (ev.target.closest && ev.target.closest("[data-square]"))) return;
      if (ev.key === "ArrowRight") { irA(state.ply + 1); ev.preventDefault(); }
      if (ev.key === "ArrowLeft") { irA(state.ply - 1); ev.preventDefault(); }
    });

    // ----- práctica contra el motor -----
    let game = null, human = "w", sel = null, pendingPromo = null, thinking = false, expected = d.resultado;
    const practBtn = el.querySelector('[data-act="practice"]');
    conPiezas(repintar);
    function levelKey() { return el.querySelector('[data-act="level"]').value; }

    function startPractice() {
      if (typeof Chess !== "function" || !window.PracticeEngine) { msgEl.textContent = "El motor no está disponible en este navegador."; return; }
      game = new Chess(); if (!game.load(state.ply === 0 || d.examen ? startFen : currentFen())) { msgEl.textContent = "No se pudo cargar la posición."; return; }
      human = game.turn(); state.mode = "practicar"; sel = null; pendingPromo = null;
      // Resultado que se espera desde ESTA posición (si se empieza a mitad de línea, el del final de la línea).
      expected = state.ply > 0 && d.fin && state.ply === moves.length ? d.fin : state.ply > 0 && d.fin ? d.fin : d.resultado;
      practBtn.textContent = "✕ Terminar la práctica";
      msgEl.textContent = "";
      pst.textContent = "Juegas con " + (human === "w" ? "blancas" : "negras") + ". Objetivo: " + objetivo()
        + ". Haz la jugada en el tablero o escríbela en el recuadro.";
      mostrarCuadro();
      PracticeEngine.preload();
      renderPractice();
    }
    function objetivo() {
      if (expected === "½") return human === "w" ? "sostener las tablas contra el motor" : "sostener las tablas contra el motor";
      const winner = expected === "1-0" ? "w" : "b";
      return winner === human ? "ganar la posición" : "resistir (el motor debería ganar; aguanta lo más posible)";
    }
    function stopPractice(final) {
      state.mode = "ver"; practBtn.textContent = "♟ Practicar contra el motor"; pst.textContent = "";
      el.querySelector(".f100-promo").hidden = true; thinking = false;
      mostrarCuadro();
      if (!final) msgEl.textContent = "";
      renderView();
    }
    function renderPractice(extra) {
      const fen = game.fen();
      publicarFen(el, fen);
      const dots = sel ? game.moves({ square: sel, verbose: true }).map((m) => m.to) : [];
      const h = game.history({ verbose: true }); const lm = h.length ? h[h.length - 1] : null;
      pintarTablero(fen, { flip: state.flip, sel, dots, last: lm ? [lm.from, lm.to] : [], label: describe(fen) });
      descEl.textContent = describe(fen);
      const t0 = human;
      movesEl.innerHTML = h.map((m, i) => '<span class="f100-h">' + (i % 2 === 0 ? Math.floor(i / 2) + 1 + (t0 === "b" ? "…" : ".") : "") + esSan(m.san) + "</span>").join(" ");
      plyEl.textContent = "";
      if (extra) msgEl.textContent = extra;
    }
    boardEl.addEventListener("click", (ev) => {
      if (state.mode !== "practicar" || thinking || pendingPromo) return;
      // `data-sq` en el SVG; `data-square` en el tablero de casillas del Modo Adaptado.
      const r = ev.target.closest("[data-sq],[data-square]"); if (!r) return;
      const sq = r.dataset.sq || r.dataset.square;
      if (game.turn() !== human) return;
      if (sel) {
        const mv = game.moves({ square: sel, verbose: true }).find((m) => m.to === sq);
        if (mv) {
          if (mv.flags.indexOf("p") !== -1) {
            pendingPromo = { from: sel, to: sq }; el.querySelector(".f100-promo").hidden = false;
            // Con el teclado, la pregunta de la coronación se contesta donde aparece.
            if (boardEl.contains(document.activeElement)) el.querySelector(".f100-promo button").focus();
            return;
          }
          game.move({ from: sel, to: sq }); sel = null; afterHuman(); return;
        }
      }
      const p = game.get(sq);
      sel = p && p.color === human ? sq : null;
      renderPractice();
    });
    function finishPromotion(piece) {
      if (!pendingPromo) return;
      game.move({ from: pendingPromo.from, to: pendingPromo.to, promotion: piece });
      const volver = el.querySelector(".f100-promo").contains(document.activeElement);
      pendingPromo = null; sel = null; el.querySelector(".f100-promo").hidden = true; afterHuman();
      // Y el foco vuelve al tablero, que es donde estaba.
      const casilla = volver && boardEl.querySelector('[data-square][tabindex="0"]');
      if (casilla) casilla.focus();
    }
    function resultOf() {
      if (game.in_checkmate()) return game.turn() === "w" ? "0-1" : "1-0";
      if (game.in_stalemate() || game.insufficient_material() || game.in_threefold_repetition() || game.in_draw()) return "½";
      // Reglas prácticas de fin: la torre contra rey solo y demás mates elementales se juegan igual; si hay dama contra rey, se da por ganado.
      return null;
    }
    function checkEnd() {
      const res = resultOf(); if (!res) return false;
      const ok = res === expected;
      const humanWon = (res === "1-0" && human === "w") || (res === "0-1" && human === "b");
      let txt = "Fin de la partida: " + RES_TXT[res] + ". ";
      if (expected === "½") txt += res === "½" ? "¡Bien! Sostuviste las tablas, como dice la teoría." : humanWon ? "¡Ganaste! El motor se equivocó en una posición de tablas." : "La teoría dice tablas: repasa la defensa y vuelve a intentarlo.";
      else if (ok) txt += humanWon ? "¡Bien! Ganaste la posición como dice la teoría." : "El motor ganó, como dice la teoría. Fíjate cuántas jugadas resististe.";
      else txt += humanWon ? "¡Ganaste una posición que la teoría da por perdida!" : "La teoría dice " + RES_TXT[expected] + ": repasa la línea principal y prueba de nuevo.";
      guardar(d.id, { resultado: res, esperado: expected, jugaste: human, nivel: levelKey(), ok: ok, jugadas: game.history().length, fecha: new Date().toISOString().slice(0, 10) });
      renderPractice(txt); stopPractice(true); msgEl.textContent = txt;
      return true;
    }
    async function afterHuman() {
      renderPractice();
      // La jugada propia también se dice: quien la escribió oye que entró, y
      // quien la hizo con el ratón y la lupa, cuál quedó.
      const hist = game.history({ verbose: true });
      if (hist.length) anunciar("Jugaste: " + contar(hist[hist.length - 1]) + ".");
      if (checkEnd()) return;
      thinking = true; pst.textContent = "El motor piensa…";
      let uci = null;
      try { uci = await PracticeEngine.getMove(game.fen(), levelKey()); } catch (e) { uci = null; }
      if (!uci) uci = PracticeEngine.jugadaDeRespaldo(game.fen());
      thinking = false;
      if (state.mode !== "practicar") return;
      if (!uci) { renderPractice("El motor no respondió. Prueba de nuevo o recarga la página."); return; }
      const rival = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
      /* La jugada del motor, DICHA. Antes solo decía «Te toca», y quien no ve
         el tablero no tenía forma de saber qué había cambiado sin volver a oír
         la posición entera. */
      pst.textContent = "El motor jugó: " + contar(rival) + ". Te toca.";
      renderPractice();
      checkEnd();
    }
  }

  // Los tableros se construyen cuando se ven: los <details> cerrados esperan a abrirse
  // (el curso tiene más de 300 diagramas; construirlos todos de golpe frenaría el celular).
  function pendientes(root) {
    return Array.from(root.querySelectorAll(".f100-diag[data-id]:not(.f100-viewer)")).filter((el) => {
      let p = el.parentElement;
      while (p && p !== root) { if (p.tagName === "DETAILS" && !p.open) return false; p = p.parentElement; }
      return true;
    });
  }
  function init(root) {
    root = root || document;
    if (!root.__f100) {
      root.__f100 = true;
      root.querySelectorAll("details").forEach((dt) => dt.addEventListener("toggle", () => { if (dt.open) init(root); }));
    }
    const nodes = pendientes(root);
    if (!nodes.length) return Promise.resolve();
    injectDefs();
    // El progreso del curso (qué finales ya practicó) vive en la cuenta del
    // alumno: se baja antes de marcar nada, así lo practicado en otro aparato
    // aparece igual aquí. Si no hay sesión, sigue el progreso local de siempre.
    const cuenta = window.ProgresoUsuario ? window.ProgresoUsuario.init().catch(() => {}) : Promise.resolve();
    cursoActual = cursoDe(root === document ? null : root);
    const url = urlDatos(root === document ? null : root);
    return cuenta.then(() => loadData(url)).then(() => {
      nodes.forEach((el) => {
        const d = byId[el.dataset.id];
        if (!d) { el.innerHTML = '<p class="text-xs text-red-500">Diagrama no encontrado (' + esc(el.dataset.id) + ").</p>"; el.classList.add("f100-viewer"); return; }
        makeViewer(el, d);
      });
      marcarProgreso(root);
    }).catch((e) => {
      nodes.forEach((el) => { el.innerHTML = '<p class="text-xs text-red-500">No se pudieron cargar las posiciones del curso (' + esc(e.message) + ").</p>"; });
    });
  }

  function marcarProgreso(root) {
    const p = progreso();
    (root || document).querySelectorAll(".f100-diag[data-id]").forEach((el) => {
      const rec = p[el.dataset.id]; const head = el.querySelector(".f100-head");
      if (rec && head && !head.querySelector(".f100-done")) {
        const s = document.createElement("span"); s.className = "f100-done"; s.title = "Última práctica: " + rec.fecha + " (" + rec.resultado + ")";
        s.textContent = rec.ok ? "✔ practicado" : "• practicado"; head.appendChild(s);
      }
    });
  }
  document.addEventListener("f100:progreso", () => marcarProgreso(document));

  window.Finales100 = { init, loadData, boardSvg, progreso };
})();
