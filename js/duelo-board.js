/**
 * Tablero de Duelo Simultáneo: el tablero de 8x8 de siempre, pero SIN turno
 * — los dos jugadores pueden elegir su jugada en cualquier momento de la
 * ronda. Tocar una pieza propia la selecciona, tocar una casilla resaltada
 * la deja "lista" (todavía sin comprometer); un botón aparte confirma el
 * compromiso (a partir de ahí ya no se puede cambiar). El resto de la
 * ronda, mientras se espera al rival, el tablero se ve pero no se puede
 * tocar — nada que hacer hasta que las dos jugadas estén reveladas y la
 * página resuelva la ronda.
 *
 * Requiere chess.js y js/duelo-engine.js cargados antes que este archivo.
 */
(function () {
  "use strict";

  const GLYPH = {
    p: { w: "♙", b: "♟" }, n: { w: "♘", b: "♞" }, b: { w: "♗", b: "♝" },
    r: { w: "♖", b: "♜" }, q: { w: "♕", b: "♛" }, k: { w: "♔", b: "♚" },
  };
  const PIECE_NAME = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama" };
  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

  function squaresInOrder(flipped) {
    const squares = [];
    for (let rank = 8; rank >= 1; rank--) for (const f of FILES) squares.push(f + rank);
    return flipped ? squares.reverse() : squares;
  }
  function isLightSquare(square) {
    const file = FILES.indexOf(square[0]);
    const rank = parseInt(square[1], 10) - 1;
    return (file + rank) % 2 === 1;
  }

  class DueloBoard {
    /**
     * @param {HTMLElement} boardEl
     * @param {object} opts
     * @param {boolean} opts.interactive - false si la partida no está en curso
     * @param {"w"|"b"} opts.myColor
     * @param {(from,to,cb)=>void} opts.onPromotionNeeded - cb(piece|null)
     * @param {(pending:{from,to,promotion?}|null)=>void} opts.onStagedChange - se llama cuando cambia la jugada "lista" (sin comprometer todavía)
     */
    constructor(boardEl, opts) {
      opts = opts || {};
      this.boardEl = boardEl;
      if (window.Coordenadas) Coordenadas.aplicar(boardEl);   // letras y números por fuera (js/coordenadas-tablero.js)
      this.myColor = opts.myColor || "w";
      this.flipped = this.myColor === "b";
      this.interactive = !!opts.interactive;
      this.onPromotionNeeded = opts.onPromotionNeeded || null;
      this.onStagedChange = opts.onStagedChange || function () {};
      this.game = new DueloSimultaneo.Game();
      this.selected = null; // casilla de origen elegida
      this.staged = null; // {from,to,promotion?} — jugada lista, todavía sin comprometer
      this.locked = false; // true una vez comprometida esta ronda (ya no se puede tocar el tablero)
      this.boardEl.style.position = "relative";
      this.boardEl.setAttribute("role", "group");
      this.boardEl.setAttribute("aria-label", "Tablero de Duelo Simultáneo");

      if (typeof enableBoardDrag !== "undefined") {
        enableBoardDrag(this.boardEl, {
          isDraggable: (square) => {
            if (!this._canActNow()) return false;
            const piece = this.game.get(square);
            return !!(piece && piece.color === this.myColor);
          },
          isSelected: (square) => this.selected === square,
          onSquareClick: (square) => this._onSquareClick(square),
        });
      }
    }

    loadState(data) {
      this.game = DueloSimultaneo.Game.fromJSON(data);
      this.selected = null;
      this.staged = null;
      this.locked = !!this.game.commit[this.myColor];
      this.render();
    }

    setInteractive(v) {
      this.interactive = !!v;
      this.render();
    }

    _canActNow() {
      return this.interactive && !this.game.gameOver && !this.locked;
    }

    clearStaged() {
      this.selected = null;
      this.staged = null;
      this.onStagedChange(null);
      this.render();
    }

    markLocked() {
      this.locked = true;
      this.render();
    }

    _stage(from, to, promotion) {
      this.staged = { from: from, to: to, promotion: promotion };
      this.selected = null;
      this.onStagedChange(this.staged);
      this.render();
    }

    _onSquareClick(square) {
      if (!this._canActNow() || this.staged) return; // con una jugada ya lista, hay que "Cambiar" (ver la página) antes de tocar otra vez
      if (this.selected === square) { this.selected = null; this.render(); return; }
      if (this.selected) {
        const targets = this.game.legalMovesFor(this.myColor).filter((m) => m.from === this.selected);
        const match = targets.find((m) => m.to === square);
        if (match) {
          if (match.promotion && this.onPromotionNeeded) {
            const from = this.selected;
            this.onPromotionNeeded(from, square, (piece) => {
              if (piece) this._stage(from, square, piece);
              else { this.selected = null; this.render(); }
            });
            return;
          }
          this._stage(this.selected, square, undefined);
          return;
        }
      }
      const piece = this.game.get(square);
      if (!piece || piece.color !== this.myColor) { this.selected = null; this.render(); return; }
      this.selected = square;
      this.render();
    }

    render() {
      const g = this.game;
      const canAct = this._canActNow();
      this.boardEl.innerHTML = "";
      const squares = squaresInOrder(this.flipped);

      let legalTargets = [];
      if (canAct && this.selected) {
        legalTargets = g.legalMovesFor(this.myColor).filter((m) => m.from === this.selected).map((m) => m.to);
      }

      squares.forEach((square) => {
        const btn = document.createElement("button");
        btn.type = "button";
        const light = isLightSquare(square);
        let cls = "flex items-center justify-center select-none relative transition-colors w-full h-full border-0 p-0 m-0 text-3xl sm:text-4xl md:text-5xl ";
        cls += (canAct && !this.staged) ? "cursor-pointer " : "cursor-default ";
        cls += light ? "bg-[var(--sq-light)] " : "bg-[var(--sq-dark)] ";
        if (this.selected === square) cls += "outline outline-4 -outline-offset-4 outline-accent-500 ";
        if (this.staged && (this.staged.from === square || this.staged.to === square)) cls += "ring-4 ring-inset ring-purple-500 ";
        btn.className = cls;
        btn.setAttribute("data-square", square);
        const piece = g.get(square);
        const pieceName = piece ? ((piece.color === "w" ? "Blanco" : "Negro") + " " + PIECE_NAME[piece.type]) : "vacía";
        btn.setAttribute("aria-label", "Casilla " + square + ": " + pieceName);

        if (piece) {
          const span = document.createElement("span");
          if (window.PiezaPreferida) {
            PiezaPreferida.pintar(span, piece.type, piece.color);
          } else if (window.PieceStyleThemes && window.PieceStyleThemes.esDibujado() && window.ChessPieceSVG) {
            span.innerHTML = window.ChessPieceSVG.markup(piece.type, piece.color);
            span.className = "chess-piece-illustrated";
          } else {
            span.textContent = GLYPH[piece.type][piece.color];
            span.className = piece.color === "w" ? "piece-white" : "piece-black";
          }
          span.setAttribute("aria-hidden", "true");
          btn.appendChild(span);
        }

        if (legalTargets.indexOf(square) !== -1) {
          const dot = document.createElement("span");
          dot.setAttribute("aria-hidden", "true");
          dot.className = piece
            ? "absolute inset-0 rounded-full ring-4 ring-accent-500/70 ring-inset pointer-events-none"
            : "absolute w-1/4 h-1/4 rounded-full bg-accent-500/70 pointer-events-none";
          btn.appendChild(dot);
        }

        btn.addEventListener("click", () => this._onSquareClick(square));
        this.boardEl.appendChild(btn);
      });
    }
  }

  window.DueloBoard = DueloBoard;
})();
