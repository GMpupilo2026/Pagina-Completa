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
  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const MARK_COLOR = "#de911d"; // accent-500

  function squaresInOrder() {
    const squares = [];
    for (let rank = 8; rank >= 1; rank--) {
      for (const file of FILES) squares.push(file + rank);
    }
    return squares;
  }

  function isLightSquare(square) {
    const file = FILES.indexOf(square[0]);
    const rank = parseInt(square[1], 10);
    return (file + rank) % 2 === 1;
  }

  // Fila/columna (0-7) de una casilla, con fila 0 = arriba (rank 8), igual que squaresInOrder().
  function squareRowCol(square) {
    const idx = squaresInOrder().indexOf(square);
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
     * @param {(fen: string, san: string, moves: string[]) => void} opts.onMove
     * @param {(marks: {arrows: Array<{from:string,to:string}>, circles: string[]}) => void} opts.onMarksChange
     */
    constructor(el, opts = {}) {
      this.el = el;
      this.interactive = !!opts.interactive;
      this.allowArrows = !!opts.allowArrows;
      this.onMove = opts.onMove || (() => {});
      this.onMarksChange = opts.onMarksChange || (() => {});
      this.game = new Chess();
      this.selected = null;
      this.focusSquare = "e1";
      this.arrows = [];
      this.circles = [];
      this._drawingFrom = null;
      // Modo revisión: viewGame/viewPly != null mientras se navega hacia atrás en el
      // historial sin tocar this.game (que sigue siendo la partida real, para poder
      // seguir jugando/deshaciendo normalmente al volver a "en vivo").
      this.viewGame = null;
      this.viewPly = null;

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
    }

    // Carga la posición reproduciendo la lista de jugadas (SAN) desde el inicio, para que
    // el historial interno de chess.js quede poblado y undo() funcione.
    loadMoves(moves) {
      this.game = new Chess();
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
      this.game = new Chess();
      this.selected = null;
      this.render();
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

    isViewingHistory() {
      return this.viewGame !== null;
    }

    // Muestra la posición después de `ply` jugadas (0 = posición inicial) sin tocar la
    // partida real: this.game sigue con el historial completo intacto para undo()/onMove().
    viewAt(ply) {
      const total = this.game.history();
      const clamped = Math.max(0, Math.min(ply, total.length));
      if (clamped === total.length) {
        this.viewLive();
        return;
      }
      const temp = new Chess();
      for (let i = 0; i < clamped; i++) temp.move(total[i]);
      this.viewGame = temp;
      this.viewPly = clamped;
      this.selected = null;
      this.render();
    }

    // Vuelve a mostrar la posición actual en vivo.
    viewLive() {
      this.viewGame = null;
      this.viewPly = null;
      this.selected = null;
      this.render();
    }

    // Descarta la continuación después de `keepPly` jugadas (para "jugar desde aquí" y
    // crear una variante). Devuelve las jugadas descartadas (SAN) para poder archivarlas
    // antes de perderlas. No hace nada si no se está en modo revisión.
    forkAt(keepPly) {
      const total = this.game.history();
      const discarded = total.slice(keepPly);
      const rebuilt = new Chess();
      for (let i = 0; i < keepPly; i++) rebuilt.move(total[i]);
      this.game = rebuilt;
      this.viewLive();
      return discarded;
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
      let cls =
        "flex items-center justify-center text-3xl sm:text-4xl md:text-5xl select-none relative transition-colors w-full h-full border-0 p-0 m-0 ";
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
      const canInteract = this.interactive && !this.isViewingHistory();

      this.el.innerHTML = "";
      const squares = squaresInOrder();
      if (!this.focusSquare || squares.indexOf(this.focusSquare) === -1) {
        this.focusSquare = squares[0];
      }
      const legalTargets = canInteract && this.selected ? g.moves({ square: this.selected, verbose: true }) : [];

      for (const square of squares) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = this._squareClasses(square, canInteract);
        btn.setAttribute("data-square", square);
        btn.setAttribute("aria-label", this._squareAriaLabel(square, g));
        btn.tabIndex = square === this.focusSquare ? 0 : -1;
        if (!canInteract) btn.tabIndex = -1;

        const piece = g.get(square);
        if (piece) {
          const span = document.createElement("span");
          span.textContent = GLYPH[piece.color][piece.type];
          span.className = piece.color === "w" ? "piece-white" : "piece-black";
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

        if (canInteract) {
          btn.addEventListener("click", () => this._onSquareClick(square));
        }
        this.el.appendChild(btn);
      }

      // El overlay de flechas/círculos se recrea al final: al ser position:absolute dentro del
      // grid no participa del layout (igual que los "dot" de jugada legal dentro de los
      // botones), así que flota encima de las 64 casillas sin romper el grid-cols-8.
      this._drawMarksOverlay();

      if (hadFocusInBoard && canInteract) {
        const target = this.el.querySelector('[data-square="' + this.focusSquare + '"]');
        if (target) target.focus();
      }
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
        const rc = squareRowCol(square);
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
      const from = squareRowCol(fromSquare);
      const to = squareRowCol(toSquare);
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

      if (this.selected === square) {
        this.selected = null;
        this.render();
        return;
      }

      if (this.selected) {
        const move = this.game.moves({ square: this.selected, verbose: true }).find((m) => m.to === square);
        if (move) {
          const result = this.game.move({ from: this.selected, to: square, promotion: "q" });
          this.selected = null;
          this.render();
          if (result) this.onMove(this.game.fen(), result.san, this.game.history());
          return;
        }
      }

      const piece = this.game.get(square);
      this.selected = piece && piece.color === this.game.turn() ? square : null;
      this.render();
    }

    _onKeydown(e) {
      if (!this.interactive || this.isViewingHistory()) return;
      const current = e.target && e.target.getAttribute ? e.target.getAttribute("data-square") : null;
      if (!current) return;
      const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (arrows.indexOf(e.key) === -1) return;
      e.preventDefault();

      const squares = squaresInOrder();
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
