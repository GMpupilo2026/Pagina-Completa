/**
 * Tablero de la página Clases (clases.html).
 *
 * Sigue las mismas convenciones visuales y de accesibilidad que el tablero
 * de tablero.html (js/tablero-board.js): casillas <button> con aria-label,
 * roving tabindex y navegación con flechas, glifos Unicode con las clases
 * piece-white/piece-black de css/styles.css. No reutiliza tablero-board.js
 * directamente porque ese archivo trae lógica específica del bot (Stockfish,
 * barra de evaluación, modo ciego, etc.) que no aplica aquí.
 *
 * Además de mover piezas, dibuja flechas y círculos de pizarra (botón
 * derecho, solo si `allowArrows`): arrastrar dibuja una flecha alineada a
 * fila/columna/diagonal (las de forma de caballo se doblan en ángulo recto,
 * como en lichess); soltar sobre la misma casilla marca/desmarca un círculo.
 *
 * El historial de jugadas se reconstruye siempre reproduciendo la lista de
 * SAN (loadMoves) en vez de cargar solo el FEN, para que el historial interno
 * de chess.js quede poblado y `undo()` funcione de verdad.
 *
 * Requiere que chess.js ya esté cargado antes que este archivo.
 */
(function () {
  "use strict";

  const GLYPH = {
    w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
    b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
  };
  const PIECE_NAME = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey" };
  // Iniciales en español (notación de ajedrez en español: R/D/T/A/C, peón sin letra en
  // notación real, pero aquí sí se marca para no dejar dudas): un emoji "divertido" de
  // los temas de Configuración no siempre deja claro qué pieza es, así que se le pega
  // esta marca chiquita encima (ver .theme-token-label en css/styles.css).
  const TYPE_LABEL = { k: "R", q: "D", r: "T", b: "A", n: "C", p: "P" };
  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const MARK_COLOR = "#de911d"; // accent-500

  // Orden visual de las 64 casillas, fila por fila de arriba hacia abajo. Con `flipped`
  // se invierte el orden completo, lo que equivale exactamente a girar el tablero
  // (rank 1 arriba, columnas de h a a) sin necesidad de una segunda lista de coordenadas.
  function squaresInOrder(flipped) {
    const squares = [];
    for (let rank = 8; rank >= 1; rank--) {
      for (const file of FILES) squares.push(file + rank);
    }
    return flipped ? squares.reverse() : squares;
  }

  function isLightSquare(square) {
    const file = FILES.indexOf(square[0]);
    const rank = parseInt(square[1], 10) - 1;
    return (file + rank) % 2 === 1;
  }

  // Fila/columna (0-7) de una casilla, con fila 0 = arriba. Con `flipped` la fila 0 pasa a
  // ser la fila 1 (negras abajo), igual que gira squaresInOrder().
  function squareRowCol(square, flipped) {
    const idx = squaresInOrder(flipped).indexOf(square);
    if (idx === -1) return null;
    return { row: Math.floor(idx / 8), col: idx % 8 };
  }

  // Centro de una casilla en porcentaje (0-100) del tablero, para el <svg viewBox="0 0 100 100">.
  function centerPercent(rowCol) {
    return { x: (rowCol.col + 0.5) * 12.5, y: (rowCol.row + 0.5) * 12.5 };
  }

  class ClasesBoard {
    /**
     * @param {HTMLElement} el - contenedor #chessboard (grid de 8x8)
     * @param {object} opts
     * @param {boolean} opts.interactive - true si este usuario puede mover piezas ahora
     * @param {boolean} opts.allowArrows - true solo para el profesor (dibuja flechas/círculos)
     * @param {boolean} opts.compact - true para miniaturas mucho más chicas que el tablero
     *   principal (p. ej. la grilla "Tableros de los alumnos" en Practicar contra el motor):
     *   fija el tamaño de las piezas con estilo inline en vez de las clases text-3xl/4xl/5xl
     *   pensadas para tableros grandes. Un estilo inline no depende de que ninguna hoja de
     *   estilos externa (o el compilador de Tailwind, que corre de forma asíncrona) termine
     *   de cargar antes o después: por eso es más confiable aquí que una regla CSS aparte.
     * @param {(fen: string, san: string, moves: string[]) => void} opts.onMove
     * @param {(marks: {arrows: Array<{from:string,to:string}>, circles: string[]}) => void} opts.onMarksChange
     * @param {(san: string, fullPath: string[], context: {parentNodeId: string|null, rootPly: number}) => void} opts.onVariantMove
     */
    constructor(el, opts = {}) {
      this.el = el;
      this.interactive = !!opts.interactive;
      this.allowArrows = !!opts.allowArrows;
      this.compact = !!opts.compact;
      this.onMove = opts.onMove || (() => {});
      this.onMarksChange = opts.onMarksChange || (() => {});
      this.onVariantMove = opts.onVariantMove || (() => {});
      this.game = new Chess();
      this.startFen = null; // FEN inicial de la partida (null = posición estándar); ver loadMoves()
      this.selected = null;
      this.focusSquare = "e1";
      this.arrows = [];
      this.circles = [];
      this._drawingFrom = null;
      this.flipped = false; // vista del tablero: negras abajo (preferencia personal, no se sincroniza)
      this.showCoords = false; // vista del tablero: coordenadas a-h/1-8 (preferencia personal)
      this.piecesHidden = false; // el profesor puede ocultar las piezas en el tablero de los alumnos
      this.freeMode = false; // modo edición libre del profesor: mueve piezas ignorando las reglas
      this._freeModeTool = null; // paleta del editor: null (mover), {color,type} (colocar) o "trash" (quitar)
      // Modo revisión/exploración: viewGame/viewPath != null mientras se navega por el
      // historial (línea principal o una variante) sin tocar this.game (que sigue siendo
      // la partida real en vivo). Jugar una pieza estando aquí no mueve la partida real:
      // crea o extiende una variante (ver onVariantMove) — así se navegan y crean
      // variantes y sub-variantes sin afectar el tablero de nadie más.
      this.viewGame = null;
      this.viewPath = null;
      this._variantContext = null; // {parentNodeId, rootPly} de la posición que se ve ahora

      this.el.style.position = "relative";
      this.el.setAttribute("role", "group");
      this.el.setAttribute("aria-label", "Tablero de la clase");

      this._onKeydown = this._onKeydown.bind(this);
      this._onContextMenu = this._onContextMenu.bind(this);
      this._onMouseDown = this._onMouseDown.bind(this);
      this._onMouseUp = this._onMouseUp.bind(this);
      this.el.addEventListener("keydown", this._onKeydown);
      this.el.addEventListener("contextmenu", this._onContextMenu);
      this.el.addEventListener("mousedown", this._onMouseDown);
      this.el.addEventListener("mouseup", this._onMouseUp);

      // Coordenadas a-h/1-8 FUERA del tablero (como uno físico), siempre visibles —
      // independientes de this.showCoords, que ahora en cambio repite el nombre de cada
      // casilla ADENTRO (ver render()). Solo se pide en el tablero principal: los overlays
      // de pregunta/práctica y las miniaturas no lo necesitan.
      if (opts.externalCoords) this._setupExternalCoords();
    }

    _setupExternalCoords() {
      const parent = this.el.parentElement;
      const outer = document.createElement("div");
      outer.className = "board-coords-outer";
      // Mismo ancho máximo que traía #chessboard directamente, para que el tablero se
      // vea igual de grande que antes con las coordenadas ahora afuera.
      const maxWidthMatch = this.el.className.match(/max-w-\[(\d+)px\]/);
      if (maxWidthMatch) {
        outer.style.maxWidth = maxWidthMatch[1] + "px";
        this.el.classList.remove(maxWidthMatch[0]);
      }
      parent.insertBefore(outer, this.el);

      const ranks = document.createElement("div");
      ranks.className = "board-coords-ranks";
      ranks.setAttribute("aria-hidden", "true");

      const boardWrap = document.createElement("div");
      boardWrap.className = "board-coords-board";

      const files = document.createElement("div");
      files.className = "board-coords-files";
      files.setAttribute("aria-hidden", "true");

      outer.appendChild(ranks);
      outer.appendChild(boardWrap);
      outer.appendChild(files);
      boardWrap.appendChild(this.el);

      this._coordRanksEl = ranks;
      this._coordFilesEl = files;
      this._renderExternalCoords();
    }

    // Reconstruye las etiquetas de afuera según la orientación actual (girar el tablero
    // invierte el orden, igual que squaresInOrder()).
    _renderExternalCoords() {
      if (!this._coordRanksEl) return;
      const rankOrder = this.flipped ? ["1", "2", "3", "4", "5", "6", "7", "8"] : ["8", "7", "6", "5", "4", "3", "2", "1"];
      const fileOrder = this.flipped ? FILES.slice().reverse() : FILES;
      this._coordRanksEl.innerHTML = "";
      for (const r of rankOrder) {
        const span = document.createElement("span");
        span.textContent = r;
        this._coordRanksEl.appendChild(span);
      }
      this._coordFilesEl.innerHTML = "";
      for (const f of fileOrder) {
        const span = document.createElement("span");
        span.textContent = f;
        this._coordFilesEl.appendChild(span);
      }
    }

    // Carga la posición reproduciendo la lista de jugadas (SAN) desde el inicio, para que
    // el historial interno de chess.js quede poblado y undo() funcione. `startFen` es la
    // posición inicial de esa partida (null = la estándar): la deja el profesor al aplicar
    // una posición armada en modo edición libre (ver setFreeMode/applyFreeModeFen).
    loadMoves(moves, startFen) {
      this.startFen = startFen || null;
      this.game = this.startFen ? new Chess(this.startFen) : new Chess();
      for (const san of moves || []) {
        if (!this.game.move(san)) break; // datos corruptos: no seguir reproduciendo
      }
      this.selected = null;
      this.render();
    }

    // Solo para el arranque/casos límite; no deja historial reproducible (undo no tendría nada
    // que deshacer hasta la próxima jugada).
    loadFen(fen) {
      if (!fen || fen === "start") {
        this.game = new Chess();
      } else if (!this.game.load(fen)) {
        this.game = new Chess();
      }
      this.selected = null;
      this.render();
    }

    reset() {
      this.startFen = null;
      this.game = new Chess();
      this.selected = null;
      this.render();
    }

    // ---------- Cargar una posición mientras se edita el tablero (ver setFreeMode) ----------
    // A diferencia de loadFen(), estas SÍ avisan si lo que se pegó no es válido en vez de
    // sustituirlo en silencio por la posición inicial — el profesor necesita saber si su
    // FEN o PGN tenía un error, no terminar armando otra posición sin darse cuenta.
    loadFreeModeFen(fen) {
      const temp = new Chess();
      if (!temp.load((fen || "").trim())) return false;
      this.game = temp;
      this.selected = null;
      this.render();
      return true;
    }

    // Carga la posición FINAL de una partida en PGN (no la reproduce jugada a jugada
    // para el historial de deshacer — solo arma el tablero en esa posición; si el
    // profesor la aplica, queda como si la hubiera armado a mano).
    loadFreeModePgn(pgn) {
      const temp = new Chess();
      if (!temp.load_pgn((pgn || "").trim())) return false;
      this.game = temp;
      this.selected = null;
      this.render();
      return true;
    }

    fen() {
      return this.game.fen();
    }

    moves() {
      return this.game.history();
    }

    // Deshace la última jugada. Devuelve el movimiento deshecho (o null si no hay nada).
    undo() {
      const undone = this.game.undo();
      if (undone) {
        this.selected = null;
        this.render();
      }
      return undone;
    }

    setInteractive(interactive) {
      this.interactive = !!interactive;
      this.render();
    }

    // ---------- Preferencias de vista: girar tablero y coordenadas ----------
    // No se sincronizan por Realtime a propósito: cada quien elige cómo mirar SU pantalla.
    setFlipped(flipped) {
      this.flipped = !!flipped;
      this.render();
    }

    setShowCoords(show) {
      this.showCoords = !!show;
      this.render();
    }

    // El profesor puede ocultar las piezas en el tablero de los alumnos (por ejemplo, para
    // preguntar "¿qué hay en e4?" antes de revelar la posición). No afecta su propio tablero:
    // quien llama a esto decide con qué valor (ver sesion.html, se ignora si isTeacher).
    setPiecesHidden(hidden) {
      this.piecesHidden = !!hidden;
      this.render();
    }

    // ---------- Modo edición libre (jugadas ilegales) ----------
    // Solo lo activa el profesor sobre su propio tablero. Mientras está activo, un clic en
    // una pieza y luego en cualquier casilla la reubica ahí sin validar las reglas del
    // ajedrez (captura o pisa lo que haya). No se sincroniza jugada a jugada: el profesor
    // arma la posición y luego decide aplicarla (ver aplicación en sesion.html) o
    // descartarla y volver a la posición real.
    setFreeMode(active) {
      this.freeMode = !!active;
      this.selected = null;
      this._freeModeTool = null;
      this.render();
    }

    // ---------- Paleta de piezas del editor (colocar/quitar directo, sin arrastrar) ----------
    // `tool` es null (modo "mover piezas ya puestas", el de siempre), {color,type} para
    // colocar esa pieza en cada casilla que se toque, o "trash" para quitar la pieza que
    // haya en cada casilla que se toque. El tool queda activo entre clics (para poner/quitar
    // varias veces seguidas), hasta que se elige otro o se vuelve a tocar el mismo botón.
    setFreeModeTool(tool) {
      this._freeModeTool = tool || null;
      this.selected = null;
      this.render();
    }

    // Vacía el tablero por completo (para armar una posición desde cero).
    clearBoard() {
      this.game.clear();
      this.selected = null;
      this.render();
    }

    // Posición inicial estándar, con todos los derechos de enroque.
    setInitialPosition() {
      this.game.reset();
      this.selected = null;
      this.render();
    }

    _onFreeModeClick(square) {
      const g = this.game;
      if (this._freeModeTool) {
        if (this._freeModeTool === "trash") {
          g.remove(square);
        } else {
          g.remove(square);
          g.put({ type: this._freeModeTool.type, color: this._freeModeTool.color }, square);
        }
        this.render();
        return;
      }
      if (this.selected === square) {
        this.selected = null;
        this.render();
        return;
      }
      if (this.selected) {
        const piece = g.get(this.selected);
        if (piece) {
          g.remove(square);
          const placed = g.put(piece, square);
          if (placed) g.remove(this.selected);
        }
        this.selected = null;
        this.render();
        return;
      }
      const piece = g.get(square);
      if (piece) this.selected = square;
      this.render();
    }

    isViewingHistory() {
      return this.viewGame !== null;
    }

    getVariantContext() {
      return this._variantContext;
    }

    _setViewPath(path, context) {
      const temp = this.startFen ? new Chess(this.startFen) : new Chess();
      for (const san of path) {
        if (!temp.move(san)) break; // datos corruptos: no seguir reproduciendo
      }
      this.viewGame = temp;
      this.viewPath = path.slice();
      this._variantContext = context;
      this.selected = null;
      this.render();
    }

    // Muestra la posición después de `ply` jugadas de la línea EN VIVO (0 = posición
    // inicial), sin tocar la partida real: this.game sigue con el historial completo
    // intacto para undo()/onMove(). Jugar una pieza desde aquí crea una variante nueva
    // (parentNodeId null) con raíz en `ply`.
    viewMainAt(ply) {
      const total = this.game.history();
      const clamped = Math.max(0, Math.min(ply, total.length));
      if (clamped === total.length) {
        this.viewLive();
        return;
      }
      this._setViewPath(total.slice(0, clamped), { parentNodeId: null, rootPly: clamped });
    }

    // Muestra la posición de un nodo del árbol de variantes (fullPath = todas las
    // jugadas desde el inicio hasta ese nodo). Jugar una pieza desde aquí extiende esa
    // variante como hijo de `node.id` (una sub-variante).
    viewVariantNode(node, fullPath) {
      this._setViewPath(fullPath, { parentNodeId: node.id, rootPly: node.root_ply });
    }

    // Vuelve a mostrar la posición actual en vivo.
    viewLive() {
      this.viewGame = null;
      this.viewPath = null;
      this._variantContext = null;
      this.selected = null;
      this.render();
    }

    // Promueve la posición que se está viendo (línea principal o cualquier variante/
    // sub-variante) a ser la nueva línea en vivo. Devuelve la línea en vivo ANTERIOR
    // completa (para archivarla antes de reemplazarla: "sin borrarla"). No hace nada si
    // no se está en modo revisión.
    forkToView() {
      if (!this.isViewingHistory()) return null;
      const discardedMain = this.game.history();
      const rebuilt = this.startFen ? new Chess(this.startFen) : new Chess();
      for (const san of this.viewPath) rebuilt.move(san);
      this.game = rebuilt;
      this.viewLive();
      return discardedMain;
    }

    // Reemplaza flechas/círculos mostrados (llega vía Realtime) sin reconstruir el tablero.
    setMarks(arrows, circles) {
      this.arrows = Array.isArray(arrows) ? arrows : [];
      this.circles = Array.isArray(circles) ? circles : [];
      this._drawMarksOverlay();
    }

    _squareAriaLabel(square, g) {
      const piece = g.get(square);
      if (!piece) return square + ", casilla vacía";
      const color = piece.color === "w" ? "blanco" : "negra";
      return square + ", " + PIECE_NAME[piece.type] + " " + color;
    }

    _squareClasses(square, canInteract) {
      const light = isLightSquare(square);
      let cls = "flex items-center justify-center select-none relative transition-colors w-full h-full border-0 p-0 m-0 ";
      // En modo compacto el tamaño de fuente se fija con estilo inline (ver render()), no
      // con estas clases responsivas pensadas para un tablero de 300-560px de ancho.
      if (!this.compact) cls += "text-3xl sm:text-4xl md:text-5xl ";
      cls += canInteract ? "cursor-pointer " : "cursor-default ";
      cls += light ? "bg-brand-100 " : "bg-brand-500 ";
      if (this.selected === square) {
        cls += "outline outline-4 -outline-offset-4 outline-accent-500 ";
      }
      return cls;
    }

    render() {
      const previouslyFocused = document.activeElement;
      const hadFocusInBoard = this.el.contains(previouslyFocused);
      const g = this.viewGame || this.game;
      // A diferencia de antes, se puede interactuar también mientras se explora una
      // variante: eso es justamente cómo se crean variantes y sub-variantes.
      const canInteract = this.interactive;

      this.el.innerHTML = "";
      const squares = squaresInOrder(this.flipped);
      if (!this.focusSquare || squares.indexOf(this.focusSquare) === -1) {
        this.focusSquare = squares[0];
      }
      // En modo edición libre cualquier casilla es un destino válido (no hay "jugadas
      // legales" que resaltar); con las piezas ocultas tampoco se muestran los puntos,
      // para no delatar con ellos qué casillas tienen pieza.
      const legalTargets =
        canInteract && this.selected && !this.freeMode && !this.piecesHidden
          ? g.moves({ square: this.selected, verbose: true })
          : [];

      squares.forEach((square, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = this._squareClasses(square, canInteract);
        btn.setAttribute("data-square", square);
        btn.setAttribute("aria-label", this._squareAriaLabel(square, g));
        btn.tabIndex = square === this.focusSquare ? 0 : -1;
        if (!canInteract) btn.tabIndex = -1;

        const piece = g.get(square);
        if (piece && !this.piecesHidden) {
          const span = document.createElement("span");
          // Tema de piezas "divertido" elegido en Configuración (js/board-themes.js):
          // preferencia de este navegador, no de la partida — cada quien ve sus propios
          // tableros con el tema que eligió, sin afectar lo que ven los demás.
          const themedEmoji = window.BoardThemes ? window.BoardThemes.getEmoji(piece.type) : null;
          if (themedEmoji) {
            span.textContent = themedEmoji;
            span.className = "theme-token " + (piece.color === "w" ? "theme-token-white" : "theme-token-black");
            const label = document.createElement("span");
            label.className = "theme-token-label";
            label.textContent = TYPE_LABEL[piece.type];
            label.setAttribute("aria-hidden", "true");
            span.appendChild(label);
          } else {
            span.textContent = GLYPH[piece.color][piece.type];
            span.className = piece.color === "w" ? "piece-white" : "piece-black";
          }
          span.setAttribute("aria-hidden", "true");
          btn.appendChild(span);
        }

        const move = legalTargets.find((m) => m.to === square);
        if (move) {
          const dot = document.createElement("span");
          dot.setAttribute("aria-hidden", "true");
          dot.className = move.captured
            ? "absolute inset-0 rounded-full ring-4 ring-accent-500/70 ring-inset pointer-events-none"
            : "absolute w-1/4 h-1/4 rounded-full bg-accent-500/70 pointer-events-none";
          btn.appendChild(dot);
        }

        // El botón "🔢 Coordenadas" ya no solo marca el borde (eso ahora vive siempre
        // afuera del tablero, ver _setupExternalCoords): repite el nombre de la casilla
        // (ej. "e4") en las 64, para practicar a reconocerlas rápido de un vistazo.
        if (this.showCoords) {
          const light = isLightSquare(square);
          const label = document.createElement("span");
          label.setAttribute("aria-hidden", "true");
          label.className = "absolute top-0.5 left-1 text-[9px] sm:text-[10px] leading-none font-semibold pointer-events-none " +
            (light ? "text-brand-500" : "text-brand-100");
          label.textContent = square;
          btn.appendChild(label);
        }

        if (canInteract) {
          btn.addEventListener("click", () => this._onSquareClick(square));
        }
        this.el.appendChild(btn);
      });

      // El overlay de flechas/círculos se recrea al final: al ser position:absolute dentro del
      // grid no participa del layout (igual que los "dot" de jugada legal dentro de los
      // botones), así que flota encima de las 64 casillas sin romper el grid-cols-8.
      this._drawMarksOverlay();
      this._renderExternalCoords();

      if (this.compact) this._sizeCompactPieces();

      if (hadFocusInBoard && canInteract) {
        const target = this.el.querySelector('[data-square="' + this.focusSquare + '"]');
        if (target) target.focus();
      }
    }

    // Tamaño de pieza para tableros "compact" (opts.compact): en vez de una clase de Tailwind
    // o una regla CSS con vw/clamp (que solo aproximan el ancho real de la casilla, y además
    // dependen de que la hoja de estilos ya esté cargada), se mide el ancho real ya renderizado
    // de una casilla y se fija el font-size como fracción de ese ancho — así funciona igual de
    // bien con 2, 4 o 5 miniaturas por fila, y en cualquier tamaño de pantalla. rAF: hace falta
    // esperar a que el navegador aplique el layout del grid recién insertado en el DOM (si se
    // mide en el mismo tick, el ancho todavía puede ser 0).
    _sizeCompactPieces() {
      requestAnimationFrame(() => {
        const square = this.el.querySelector("[data-square]");
        if (!square) return;
        const cellWidth = square.getBoundingClientRect().width;
        if (!cellWidth) return;
        const fontPx = Math.max(8, Math.min(cellWidth * 0.62, 40));
        this.el.querySelectorAll("[data-square]").forEach((sq) => {
          sq.style.fontSize = fontPx + "px";
        });
      });
    }

    _drawMarksOverlay() {
      let svg = this.el.querySelector("svg.marks-overlay");
      if (this.isViewingHistory()) {
        if (svg) svg.innerHTML = "";
        return;
      }
      if (!svg) {
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "marks-overlay");
        svg.setAttribute("viewBox", "0 0 100 100");
        svg.setAttribute("preserveAspectRatio", "none");
        svg.style.position = "absolute";
        svg.style.inset = "0";
        svg.style.width = "100%";
        svg.style.height = "100%";
        svg.style.pointerEvents = "none";
        this.el.appendChild(svg);
      }
      svg.innerHTML =
        '<defs><marker id="clases-arrowhead" viewBox="0 0 10 10" refX="7" refY="5" ' +
        'markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">' +
        '<path d="M0,0 L10,5 L0,10 z" fill="' + MARK_COLOR + '"></path></marker></defs>';

      for (const square of this.circles) {
        const rc = squareRowCol(square, this.flipped);
        if (!rc) continue;
        const c = centerPercent(rc);
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", c.x);
        circle.setAttribute("cy", c.y);
        circle.setAttribute("r", "4.3");
        circle.setAttribute("fill", "none");
        circle.setAttribute("stroke", MARK_COLOR);
        circle.setAttribute("stroke-width", "1.4");
        circle.setAttribute("opacity", "0.85");
        svg.appendChild(circle);
      }

      for (const arrow of this.arrows) {
        this._drawArrow(svg, arrow.from, arrow.to);
      }
    }

    // Dibuja una flecha alineada a fila/columna/diagonal. Si el movimiento tiene forma de "L"
    // (caballo), la dobla en ángulo recto en vez de cortar en diagonal, como en lichess.
    _drawArrow(svg, fromSquare, toSquare) {
      const from = squareRowCol(fromSquare, this.flipped);
      const to = squareRowCol(toSquare, this.flipped);
      if (!from || !to) return;
      const dx = to.col - from.col;
      const dy = to.row - from.row;
      const isStraight = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);

      const p1 = centerPercent(from);
      const p3 = centerPercent(to);
      let points;
      if (isStraight) {
        points = [p1, p3];
      } else {
        // Forma de caballo: dobla en el punto que comparte la coordenada del eje "largo".
        const corner =
          Math.abs(dx) > Math.abs(dy) ? { row: from.row, col: to.col } : { row: to.row, col: from.col };
        points = [p1, centerPercent(corner), p3];
      }

      for (let i = 0; i < points.length - 1; i++) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", points[i].x);
        line.setAttribute("y1", points[i].y);
        line.setAttribute("x2", points[i + 1].x);
        line.setAttribute("y2", points[i + 1].y);
        line.setAttribute("stroke", MARK_COLOR);
        line.setAttribute("stroke-width", "1.5");
        line.setAttribute("stroke-linecap", "round");
        line.setAttribute("opacity", "0.85");
        if (i === points.length - 2) line.setAttribute("marker-end", "url(#clases-arrowhead)");
        svg.appendChild(line);
      }
    }

    _onSquareClick(square) {
      this.focusSquare = square;
      if (this.freeMode) {
        this._onFreeModeClick(square);
        return;
      }
      const g = this.viewGame || this.game;

      if (this.selected === square) {
        this.selected = null;
        this.render();
        return;
      }

      if (this.selected) {
        const move = g.moves({ square: this.selected, verbose: true }).find((m) => m.to === square);
        if (move) {
          const wasLive = !this.isViewingHistory();
          const result = g.move({ from: this.selected, to: square, promotion: "q" });
          this.selected = null;
          this.render();
          if (!result) return;
          if (wasLive) {
            // Seguíamos en la línea real: esto sí es la jugada en vivo de la clase.
            this.onMove(this.game.fen(), result.san, this.game.history());
          } else {
            // Estábamos explorando: esto crea o extiende una variante/sub-variante,
            // sin tocar la partida real de nadie más.
            this.viewPath = this.viewPath.concat([result.san]);
            this.onVariantMove(result.san, this.viewPath.slice(), this._variantContext);
          }
          return;
        }
      }

      const piece = g.get(square);
      this.selected = piece && piece.color === g.turn() ? square : null;
      this.render();
    }

    // Tras insertar en la base de datos la jugada de variante creada en _onSquareClick,
    // el llamador debe indicar el id del nodo recién creado para que la SIGUIENTE jugada
    // (si la hay) se encadene como su hijo — así se forman las sub-variantes.
    setVariantParent(nodeId) {
      if (this._variantContext) this._variantContext = { ...this._variantContext, parentNodeId: nodeId };
    }

    _onKeydown(e) {
      if (!this.interactive) return;
      const current = e.target && e.target.getAttribute ? e.target.getAttribute("data-square") : null;
      if (!current) return;
      const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (arrows.indexOf(e.key) === -1) return;
      e.preventDefault();

      const squares = squaresInOrder(this.flipped);
      const idx = squares.indexOf(current);
      const row = Math.floor(idx / 8);
      const col = idx % 8;
      let newRow = row;
      let newCol = col;
      if (e.key === "ArrowUp") newRow = Math.max(0, row - 1);
      else if (e.key === "ArrowDown") newRow = Math.min(7, row + 1);
      else if (e.key === "ArrowLeft") newCol = Math.max(0, col - 1);
      else if (e.key === "ArrowRight") newCol = Math.min(7, col + 1);

      this.focusSquare = squares[newRow * 8 + newCol];
      this.render();
      const target = this.el.querySelector('[data-square="' + this.focusSquare + '"]');
      if (target) target.focus();
    }

    // ---------- Flechas y círculos de pizarra (botón derecho) ----------
    _squareFromPoint(clientX, clientY) {
      const target = document.elementFromPoint(clientX, clientY);
      const btn = target && target.closest ? target.closest("[data-square]") : null;
      return btn ? btn.getAttribute("data-square") : null;
    }

    _onContextMenu(e) {
      if (this.allowArrows) e.preventDefault();
    }

    _onMouseDown(e) {
      if (!this.allowArrows || e.button !== 2) return;
      e.preventDefault();
      this._drawingFrom = this._squareFromPoint(e.clientX, e.clientY);
    }

    _onMouseUp(e) {
      if (!this.allowArrows || e.button !== 2 || !this._drawingFrom) return;
      const from = this._drawingFrom;
      this._drawingFrom = null;
      const to = this._squareFromPoint(e.clientX, e.clientY);
      if (!to) return;

      if (to === from) {
        // Clic derecho sin arrastrar: marca/desmarca un círculo en la casilla.
        const idx = this.circles.indexOf(from);
        this.circles = idx !== -1 ? this.circles.filter((_, i) => i !== idx) : this.circles.concat([from]);
      } else {
        const existingIndex = this.arrows.findIndex((a) => a.from === from && a.to === to);
        this.arrows =
          existingIndex !== -1 ? this.arrows.filter((_, i) => i !== existingIndex) : this.arrows.concat([{ from, to }]);
      }
      this._drawMarksOverlay();
      this.onMarksChange({ arrows: this.arrows, circles: this.circles });
    }

    clearMarks() {
      if (this.arrows.length === 0 && this.circles.length === 0) return;
      this.arrows = [];
      this.circles = [];
      this._drawMarksOverlay();
      this.onMarksChange({ arrows: this.arrows, circles: this.circles });
    }
  }

  window.ClasesBoard = ClasesBoard;
})();
