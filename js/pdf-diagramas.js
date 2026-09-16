/**
 * Ajedrez Integral — leer un PDF durante la clase y reconocer sus diagramas de
 * ajedrez para mandarlos al editor del tablero (ver sesion.html, panel "📄 PDF").
 *
 * El PDF es privado del profesor: se abre con pdf.js (js/pdf.min.js, vendorizado
 * localmente junto con su worker — la versión con módulos ES ya no trae un build
 * clásico, y vendorizarlo evita depender de un CDN externo solo para esto) y
 * nunca se sube a ningún lado ni se comparte con los alumnos.
 *
 * Reconocimiento de diagramas — cómo funciona y qué tan confiable es:
 *
 * 1. El profesor toca cerca del diagrama en la página renderizada. A partir de
 *    ese punto se busca, en un entorno local (no en toda la página, sería muy
 *    lento), el cuadrado que mejor se parece a un tablero de ajedrez: se prueba
 *    con varios tamaños y posiciones, se parte cada candidato en una grilla de
 *    8x8 y se mide qué tan bien las 64 celdas caen en dos grupos de brillo bien
 *    separados siguiendo el patrón de casillas claras/oscuras alternadas
 *    (`checkerboardScoreAt`). No es visión por computadora "de verdad" (no hay
 *    ningún modelo entrenado acá) — es una heurística de patrón geométrico, así
 *    que funciona mejor cuanto más limpio y derecho esté el diagrama (un PDF
 *    armado en computadora) y peor cuanto más torcida o ruidosa sea una foto o
 *    escaneo. Si el recuadro detectado no es el correcto, no hay un ajuste fino
 *    a mano todavía: se cancela la revisión y se vuelve a tocar en otro punto
 *    (la búsqueda es local al punto tocado, así que un punto distinto explora
 *    otra zona de la página).
 *
 * 2. Confirmado el recuadro, se recorta cada una de las 64 casillas y se arma
 *    una "firma" visual de cada una (imagen chica, en escala de grises,
 *    normalizada). Esas firmas se comparan contra un diccionario de glifos YA
 *    identificados en este mismo documento (persistido en localStorage por
 *    documento, así que un PDF que se vuelve a abrir en otra clase ya viene
 *    calibrado — esto SÍ está probado de punta a punta): si una firma se
 *    parece lo suficiente a una ya etiquetada, se asigna esa pieza sola; si no,
 *    la casilla queda "sin identificar", agrupada con otras casillas de ESTE
 *    mismo diagrama que compartan un glifo lo bastante parecido — corregir una
 *    corrige a todo el grupo de una vez, y la corrección queda guardada para
 *    la próxima vez que aparezca ese glifo (en este documento o en cualquier
 *    otro que se abra después en este navegador). En la práctica, dentro de UN
 *    diagrama nuevo el agrupado es conservador (dos peones iguales en la misma
 *    posición del tablero a veces no se agrupan solos, por el antialiasing de
 *    cada recorte): conviene pensar la primera pasada de un diagrama nuevo como
 *    "corregir bastantes casillas, no un puñado", y la ganancia real de la
 *    calibración se nota sobre todo al reabrir el MISMO PDF más adelante.
 *
 * 3. El resultado (con las casillas sin identificar vacías, nunca adivinadas a
 *    ciegas) se manda al editor de tablero YA EXISTENTE de sesion.html —
 *    board.loadFreeModeFen(...) — así que el profesor termina de ajustarlo con
 *    la misma paleta de siempre y lo aplica con el mismo botón de siempre. Este
 *    archivo no reimplementa nada de esa parte.
 *
 * Requiere: js/pdf.min.js cargado antes. Expone window.PdfDiagramas.init(opts).
 */
(function () {
  "use strict";

  const CELL_PREVIEW_PX = 28; // tamaño del recorte normalizado de cada casilla, para comparar firmas
  const MATCH_THRESHOLD = 18; // diferencia media de brillo (0-255) por debajo de la cual dos firmas "son la misma pieza"
  const DICT_STORAGE_PREFIX = "pdfDiagramas:dict:";

  const PIECES = [
    { color: "w", type: "k", glyph: "♔" }, { color: "w", type: "q", glyph: "♕" },
    { color: "w", type: "r", glyph: "♖" }, { color: "w", type: "b", glyph: "♗" },
    { color: "w", type: "n", glyph: "♘" }, { color: "w", type: "p", glyph: "♙" },
    { color: "b", type: "k", glyph: "♚" }, { color: "b", type: "q", glyph: "♛" },
    { color: "b", type: "r", glyph: "♜" }, { color: "b", type: "b", glyph: "♝" },
    { color: "b", type: "n", glyph: "♞" }, { color: "b", type: "p", glyph: "♟" },
  ];

  function $(id) { return document.getElementById(id); }

  // ---------- Utilidades de imagen ----------

  function toGrayscaleBuffer(canvas) {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    const gray = new Float32Array(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    return { gray, width, height };
  }

  function sampleAvg(gray, width, height, cx, cy, half) {
    const x0 = Math.max(0, Math.round(cx - half)), x1 = Math.min(width - 1, Math.round(cx + half));
    const y0 = Math.max(0, Math.round(cy - half)), y1 = Math.min(height - 1, Math.round(cy + half));
    let sum = 0, count = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) { sum += gray[y * width + x]; count++; }
    }
    return count ? sum / count : 0;
  }

  function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
  function variance(arr, m) { return arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length; }

  // Qué tan bien el cuadrado [x0,y0,size,size] se parece a un tablero de ajedrez:
  // separa las 64 celdas por paridad (casillas "claras" vs. "oscuras") y premia
  // que esos dos grupos tengan brillos bien distintos y cada uno sea uniforme.
  function checkerboardScoreAt(gray, width, height, x0, y0, size) {
    const n = 8;
    const cell = size / n;
    const half = cell * 0.22;
    if (x0 - half < 0 || y0 - half < 0 || x0 + size + half >= width || y0 + size + half >= height) return -Infinity;
    const groupA = [], groupB = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const cx = x0 + (c + 0.5) * cell, cy = y0 + (r + 0.5) * cell;
        const v = sampleAvg(gray, width, height, cx, cy, half);
        ((r + c) % 2 === 0 ? groupA : groupB).push(v);
      }
    }
    const meanA = mean(groupA), meanB = mean(groupB);
    const separation = Math.abs(meanA - meanB);
    const within = (variance(groupA, meanA) + variance(groupB, meanB)) / 2;
    return separation - 0.6 * Math.sqrt(within);
  }

  // Busca, alrededor de (clickX, clickY), el cuadrado que mejor puntúa como
  // tablero de ajedrez. Búsqueda local (no en toda la página) para que sea
  // rápida: se prueban tamaños entre minSize y maxSize, y para cada tamaño,
  // posiciones tales que el punto tocado quede DENTRO del candidato.
  function findBoardNear(gray, width, height, clickX, clickY) {
    const maxSize = Math.min(width, height) * 0.9;
    const minSize = Math.max(60, Math.min(width, height) * 0.15);
    let best = null, bestScore = -Infinity;
    const sizeSteps = 14, posSteps = 9;
    for (let si = 0; si < sizeSteps; si++) {
      const size = minSize + ((maxSize - minSize) * si) / (sizeSteps - 1);
      const xMin = Math.max(0, clickX - size), xMax = Math.min(width - size, clickX);
      const yMin = Math.max(0, clickY - size), yMax = Math.min(height - size, clickY);
      if (xMax < xMin || yMax < yMin) continue;
      for (let pxi = 0; pxi < posSteps; pxi++) {
        const x0 = xMin + ((xMax - xMin) * pxi) / Math.max(1, posSteps - 1);
        for (let pyi = 0; pyi < posSteps; pyi++) {
          const y0 = yMin + ((yMax - yMin) * pyi) / Math.max(1, posSteps - 1);
          const score = checkerboardScoreAt(gray, width, height, x0, y0, size);
          if (score > bestScore) { bestScore = score; best = { x: x0, y: y0, size }; }
        }
      }
    }
    return best;
  }

  // ---------- Diccionario de glifos por documento (localStorage) ----------

  function loadDict(docKey) {
    try {
      const raw = localStorage.getItem(DICT_STORAGE_PREFIX + docKey);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function saveDict(docKey, dict) {
    try { localStorage.setItem(DICT_STORAGE_PREFIX + docKey, JSON.stringify(dict)); } catch (e) {}
  }

  // Firma de una casilla: promedio de brillo en una grilla chica (normalizado
  // en contraste) — no es una imagen pixel a pixel, así que tolera bastante
  // variación de escala/color entre el mismo glifo repetido.
  function cellSignature(ctx, sx, sy, sSize) {
    const tmp = document.createElement("canvas");
    tmp.width = CELL_PREVIEW_PX; tmp.height = CELL_PREVIEW_PX;
    const tctx = tmp.getContext("2d");
    tctx.drawImage(ctx.canvas, sx, sy, sSize, sSize, 0, 0, CELL_PREVIEW_PX, CELL_PREVIEW_PX);
    const data = tctx.getImageData(0, 0, CELL_PREVIEW_PX, CELL_PREVIEW_PX).data;
    const gray = new Array(CELL_PREVIEW_PX * CELL_PREVIEW_PX);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const m = mean(gray);
    const spread = Math.sqrt(variance(gray, m)) || 1;
    return { thumb: tmp.toDataURL(), norm: gray.map((v) => (v - m) / spread) };
  }

  function signatureDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; sum += d * d; }
    return Math.sqrt(sum / a.length) * 40; // escala aproximada a "diferencia media de brillo" (ver MATCH_THRESHOLD)
  }

  // ---------- Estado del módulo ----------

  let onFenReady = null;
  let pdfDoc = null, currentPage = 1, totalPages = 0, docKey = null;
  let dict = []; // [{norm, piece: {color,type}|null, thumb}]
  let review = null; // { squares: [{signature, groupIndex, piece}], turn: "w" }
  let activeTool = null; // null (borrar) o {color,type}

  function setMsg(text) { const el = $("pdf-msg"); if (el) el.textContent = text || ""; }

  // ---------- Cargar y mostrar el PDF ----------

  async function onFileChosen(file) {
    setMsg("");
    if (!file) return;
    if (!window.pdfjsLib) { setMsg("No se pudo cargar el lector de PDF."); return; }
    docKey = file.name + ":" + file.size;
    dict = loadDict(docKey);
    setMsg("Abriendo PDF…");
    try {
      const buf = await file.arrayBuffer();
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "js/pdf.worker.min.js";
      pdfDoc = await window.pdfjsLib.getDocument({ data: buf }).promise;
      totalPages = pdfDoc.numPages;
      currentPage = 1;
      $("pdf-viewer").classList.remove("hidden");
      setMsg("");
      await renderCurrentPage();
    } catch (e) {
      setMsg("No se pudo abrir ese PDF: " + e.message);
    }
  }

  async function renderCurrentPage() {
    const page = await pdfDoc.getPage(currentPage);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = $("pdf-page-canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const overlay = $("pdf-overlay-canvas");
    overlay.width = viewport.width; overlay.height = viewport.height;
    overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
    $("pdf-page-indicator").textContent = "Página " + currentPage + " de " + totalPages;
  }

  function drawDetectedSquare(rect) {
    const overlay = $("pdf-overlay-canvas");
    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (!rect) return;
    ctx.strokeStyle = "#e0554f";
    ctx.lineWidth = 3;
    ctx.strokeRect(rect.x, rect.y, rect.size, rect.size);
  }

  async function onPageClick(evt) {
    const canvas = $("pdf-page-canvas");
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    const clickX = (evt.clientX - rect.left) * scaleX, clickY = (evt.clientY - rect.top) * scaleY;
    setMsg("Buscando el diagrama…");
    const { gray, width, height } = toGrayscaleBuffer(canvas);
    const found = findBoardNear(gray, width, height, clickX, clickY);
    if (!found) { setMsg("No se encontró un diagrama cerca de donde tocaste. Prueba tocar más centrado sobre el tablero."); return; }
    drawDetectedSquare(found);
    setMsg("");
    startReview(canvas, found);
  }

  // ---------- Recorte y reconocimiento de las 64 casillas ----------

  function startReview(pageCanvas, rect) {
    const ctx = pageCanvas.getContext("2d");
    const cellSize = rect.size / 8;
    const squares = [];
    // Agrupa por parecido visual las casillas de ESTE diagrama que todavía no
    // están en el diccionario, para que corregir una corrija a todas las
    // iguales de una vez (ver comentario del archivo).
    const localGroups = []; // [{norm, memberIdx: []}]
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sig = cellSignature(ctx, rect.x + c * cellSize, rect.y + r * cellSize, cellSize);
        let piece = matchInDict(sig.norm);
        let groupIndex = -1;
        if (piece === undefined) {
          groupIndex = localGroups.findIndex((g) => signatureDistance(g.norm, sig.norm) < MATCH_THRESHOLD);
          if (groupIndex === -1) { groupIndex = localGroups.length; localGroups.push({ norm: sig.norm }); }
          piece = null;
        }
        squares.push({ thumb: sig.thumb, norm: sig.norm, groupIndex, piece: piece === undefined ? null : piece });
      }
    }
    review = { squares, localGroups, turn: "w" };
    renderReviewPanel();
    $("pdf-diagram-review-panel").classList.remove("hidden");
    $("pdf-panel").classList.add("hidden");
  }

  // Busca en el diccionario del documento una firma parecida. Devuelve la
  // pieza (o "empty") si hay match, o undefined si no hay ninguna coincidencia
  // todavía (glifo nuevo, sin identificar).
  function matchInDict(norm) {
    let best = null, bestDist = Infinity;
    dict.forEach((entry) => {
      const d = signatureDistance(entry.norm, norm);
      if (d < bestDist) { bestDist = d; best = entry; }
    });
    if (best && bestDist < MATCH_THRESHOLD) return best.piece;
    return undefined;
  }

  function renderReviewPanel() {
    const grid = $("pdf-review-grid");
    grid.innerHTML = "";
    review.squares.forEach((sq, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "relative aspect-square bg-cover bg-center flex items-center justify-center text-lg " +
        ((Math.floor(i / 8) + (i % 8)) % 2 === 0 ? "bg-brand-100 dark:bg-brand-700" : "bg-brand-300 dark:bg-brand-600");
      btn.style.backgroundImage = "url(" + sq.thumb + ")";
      btn.title = sq.piece ? (sq.piece === "empty" ? "Vacía" : sq.piece.color + " " + sq.piece.type) : "Sin identificar — toca para asignar";
      const label = document.createElement("span");
      label.className = "relative z-10 drop-shadow-[0_0_2px_white] dark:drop-shadow-[0_0_2px_black]";
      label.textContent = sq.piece ? (sq.piece === "empty" ? "" : PIECES.find((p) => p.color === sq.piece.color && p.type === sq.piece.type).glyph) : "?";
      btn.appendChild(label);
      btn.addEventListener("click", () => applyToolToSquare(i));
      grid.appendChild(btn);
    });
  }

  function applyToolToSquare(i) {
    const sq = review.squares[i];
    const piece = activeTool || "empty";
    sq.piece = piece;
    // Corrige de una vez todas las casillas del mismo grupo visual (mismo glifo
    // sin identificar todavía) — y, si el grupo tenía otras casillas ya vistas,
    // ya habrán heredado el match del diccionario en la próxima apertura.
    if (sq.groupIndex >= 0) {
      review.squares.forEach((other) => { if (other.groupIndex === sq.groupIndex) other.piece = piece; });
      dict.push({ norm: sq.norm, piece });
      saveDict(docKey, dict);
    }
    renderReviewPanel();
  }

  function renderPalette() {
    const box = $("pdf-review-palette");
    box.innerHTML = "";
    PIECES.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "w-9 h-9 flex items-center justify-center text-2xl rounded-lg border transition-colors bg-white dark:bg-brand-800 border-brand-200 dark:border-brand-700 hover:border-accent-500 text-brand-800 dark:text-brand-100";
      btn.textContent = p.glyph;
      btn.title = "Asignar " + (p.color === "w" ? "blanco" : "negro") + " " + p.type;
      btn.addEventListener("click", () => {
        const same = activeTool && activeTool.color === p.color && activeTool.type === p.type;
        activeTool = same ? null : { color: p.color, type: p.type };
        renderPaletteState();
      });
      box.appendChild(btn);
    });
    const trash = document.createElement("button");
    trash.type = "button";
    trash.id = "pdf-review-trash-btn";
    trash.className = "w-9 h-9 flex items-center justify-center text-lg rounded-lg border transition-colors bg-white dark:bg-brand-800 border-brand-200 dark:border-brand-700 hover:border-red-400";
    trash.title = "Marcar casilla vacía";
    trash.textContent = "🗑️";
    trash.addEventListener("click", () => { activeTool = null; renderPaletteState(); });
    box.appendChild(trash);
    renderPaletteState();
  }

  function renderPaletteState() {
    Array.from($("pdf-review-palette").children).forEach((btn) => {
      btn.classList.remove("border-2", "border-accent-500", "bg-accent-500/20");
    });
  }

  // ---------- Construir el FEN y entregarlo al editor del tablero ----------

  function buildFen() {
    const rows = [];
    for (let r = 0; r < 8; r++) {
      let row = "", empty = 0;
      for (let c = 0; c < 8; c++) {
        const sq = review.squares[r * 8 + c];
        if (!sq.piece || sq.piece === "empty") { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        const letter = sq.piece.type;
        row += sq.piece.color === "w" ? letter.toUpperCase() : letter;
      }
      if (empty) row += empty;
      rows.push(row);
    }
    return rows.join("/") + " " + review.turn + " KQkq - 0 1";
  }

  function closeReview() {
    $("pdf-diagram-review-panel").classList.add("hidden");
    review = null; activeTool = null;
  }

  function init(opts) {
    onFenReady = (opts && opts.onFenReady) || function () {};

    $("toggle-pdf-btn").addEventListener("click", () => {
      const panel = $("pdf-panel");
      panel.classList.toggle("hidden");
      $("lesson-picker-panel").classList.add("hidden");
      document.getElementById("board-edit-panel").classList.add("hidden");
    });
    $("pdf-panel-close-btn").addEventListener("click", () => $("pdf-panel").classList.add("hidden"));
    $("pdf-file-input").addEventListener("change", (e) => onFileChosen(e.target.files[0]));
    $("pdf-prev-btn").addEventListener("click", async () => { if (currentPage > 1) { currentPage--; await renderCurrentPage(); } });
    $("pdf-next-btn").addEventListener("click", async () => { if (currentPage < totalPages) { currentPage++; await renderCurrentPage(); } });
    $("pdf-page-canvas").addEventListener("click", onPageClick);

    renderPalette();
    $("pdf-review-turn-w").addEventListener("click", () => setReviewTurn("w"));
    $("pdf-review-turn-b").addEventListener("click", () => setReviewTurn("b"));
    $("pdf-review-close-btn").addEventListener("click", closeReview);
    $("pdf-review-cancel-btn").addEventListener("click", closeReview);
    $("pdf-review-apply-btn").addEventListener("click", () => {
      const fen = buildFen();
      closeReview();
      onFenReady(fen);
    });
  }

  function setReviewTurn(turn) {
    review.turn = turn;
    const ACTIVE = "text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors bg-accent-500 text-brand-900";
    const INACTIVE = "text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200";
    $("pdf-review-turn-w").className = turn === "w" ? ACTIVE : INACTIVE;
    $("pdf-review-turn-b").className = turn === "b" ? ACTIVE : INACTIVE;
  }

  window.PdfDiagramas = {
    init,
    // Expuestas para pruebas automatizadas (ver herramientas de verificación):
    _internal: { checkerboardScoreAt, findBoardNear, toGrayscaleBuffer, signatureDistance, cellSignature },
  };
})();
