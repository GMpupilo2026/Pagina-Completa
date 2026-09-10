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
 * Además de mover piezas, dibuja flechas de pizarra (botón derecho + arrastre,
 * solo si `allowArrows`) que se sincronizan por separado de la posición.
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
  const ARROW_COLOR = "#de911d"; // accent-500

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

  // Centro de una casilla en porcentaje (0-100) del tablero, para dibujar flechas en un
  // <svg viewBox="0 0 100 100"> que se estira exactamente igual que la grilla de 8x8.
  function squareCenterPercent(square) {
    const idx = squaresInOrder().indexOf(square);
    if (idx === -1) return null;
    const row = Math.floor(idx / 8);
    const col = idx % 8;
    return { x: (col + 0.5) * 12.5, y: (row + 0.5) * 12.5 };
  }

  class ClasesBoard {
    /**
     * @param {HTMLElement} el - contenedor #chessboard (grid de 8x8)
     * @param {object} opts
     * @param {boolean} opts.interactive - true si este usuario puede mover piezas ahora
     * @param {boolean} opts.allowArrows - true solo para el profesor (dibuja flechas)
     * @param {(fen: string, san: string|null) => void} opts.onMove
     * @param {(arrows: Array<{from:string,to:string}>) => void} opts.onArrowsChange
     */
    constructor(el, opts = {}) {
      this.el = el;
      this.interactive = !!opts.interactive;
      this.allowArrows = !!opts.allowArrows;
      this.onMove = opts.onMove || (() => {});
      this.onArrowsChange = opts.onArrowsChange || (() => {});
      this.game = new Chess();
      this.selected = null;
      this.focusSquare = "e1";
      this.arrows = [];
      this._drawingFrom = null;

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

    setInteractive(interactive) {
      this.interactive = !!interactive;
      this.render();
    }

    // Reemplaza las flechas mostradas (llega vía Realtime) sin reconstruir el tablero.
    setArrows(arrows) {
      this.arrows = Array.isArray(arrows) ? arrows : [];
      this._drawArrowsOverlay();
    }

    _squareAriaLabel(square) {
      const piece = this.game.get(square);
      if (!piece) return square + ", casilla vacía";
      const color = piece.color === "w" ? "blanco" : "negra";
      return square + ", " + PIECE_NAME[piece.type] + " " + color;
    }

    _squareClasses(square) {
      const light = isLightSquare(square);
      let cls =
        "flex items-center justify-center text-3xl sm:text-4xl md:text-5xl select-none relative transition-colors w-full h-full border-0 p-0 m-0 ";
      cls += this.interactive ? "cursor-pointer " : "cursor-default ";
      cls += light ? "bg-brand-100 " : "bg-brand-500 ";
      if (this.selected === square) {
        cls += "outline outline-4 -outline-offset-4 outline-accent-500 ";
      }
      return cls;
    }

    render() {
      const previouslyFocused = document.activeElement;
      const hadFocusInBoard = this.el.contains(previouslyFocused);

      this.el.innerHTML = "";
      const squares = squaresInOrder();
      if (!this.focusSquare || squares.indexOf(this.focusSquare) === -1) {
        this.focusSquare = squares[0];
      }
      const legalTargets = this.selected ? this.game.moves({ square: this.selected, verbose: true }) : [];

      for (const square of squares) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = this._squareClasses(square);
        btn.setAttribute("data-square", square);
        btn.setAttribute("aria-label", this._squareAriaLabel(square));
        btn.tabIndex = square === this.focusSquare ? 0 : -1;
        if (!this.interactive) btn.tabIndex = -1;

        const piece = this.game.get(square);
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

        if (this.interactive) {
          btn.addEventListener("click", () => this._onSquareClick(square));
        }
        this.el.appendChild(btn);
      }

      // El overlay de flechas se recrea al final: al ser position:absolute dentro del grid
      // no participa del layout de la grilla (igual que los "dot" de jugada legal dentro de
      // los botones), así que flota encima de las 64 casillas sin romper el grid-cols-8.
      this._drawArrowsOverlay();

      if (hadFocusInBoard && this.interactive) {
        const target = this.el.querySelector('[data-square="' + this.focusSquare + '"]');
        if (target) target.focus();
      }
    }

    _drawArrowsOverlay() {
      let svg = this.el.querySelector("svg.arrows-overlay");
      if (!svg) {
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "arrows-overlay");
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
        '<defs><marker id="clases-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" ' +
        'markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">' +
        '<path d="M0,0 L10,5 L0,10 z" fill="' + ARROW_COLOR + '"></path></marker></defs>';

      for (const arrow of this.arrows) {
        const from = squareCenterPercent(arrow.from);
        const to = squareCenterPercent(arrow.to);
        if (!from || !to) continue;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", from.x);
        line.setAttribute("y1", from.y);
        line.setAttribute("x2", to.x);
        line.setAttribute("y2", to.y);
        line.setAttribute("stroke", ARROW_COLOR);
        line.setAttribute("stroke-width", "2.5");
        line.setAttribute("stroke-linecap", "round");
        line.setAttribute("opacity", "0.85");
        line.setAttribute("marker-end", "url(#clases-arrowhead)");
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
          if (result) this.onMove(this.game.fen(), result.san);
          return;
        }
      }

      const piece = this.game.get(square);
      this.selected = piece && piece.color === this.game.turn() ? square : null;
      this.render();
    }

    _onKeydown(e) {
      if (!this.interactive) return;
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

    // ---------- Flechas de pizarra (botón derecho + arrastre) ----------
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
      if (!to || to === from) return;

      const existingIndex = this.arrows.findIndex((a) => a.from === from && a.to === to);
      if (existingIndex !== -1) {
        this.arrows = this.arrows.filter((_, i) => i !== existingIndex);
      } else {
        this.arrows = this.arrows.concat([{ from, to }]);
      }
      this._drawArrowsOverlay();
      this.onArrowsChange(this.arrows);
    }

    clearArrows() {
      if (this.arrows.length === 0) return;
      this.arrows = [];
      this._drawArrowsOverlay();
      this.onArrowsChange(this.arrows);
    }
  }

  window.ClasesBoard = ClasesBoard;
})();
