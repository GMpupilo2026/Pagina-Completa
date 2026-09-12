/**
 * Tablero de Crazyhouse: el tablero de 8x8 de siempre + dos "bandejas" de
 * reserva (una por color) con las piezas capturadas disponibles para
 * soltar. Interacción por toques: tocar una pieza propia (en el tablero o
 * en tu bandeja) selecciona; tocar después una casilla resaltada mueve o
 * suelta ahí; tocar la misma pieza otra vez la deselecciona. Además, una
 * pieza que ya está en el tablero también se puede arrastrar de una casilla
 * a otra (ver js/board-drag.js) — soltar una pieza de la bandeja sigue
 * siendo por toques, no por arrastre.
 *
 * Requiere chess.js y js/crazyhouse-engine.js cargados antes que este archivo.
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
  function otherColor(c) {
    return c === "w" ? "b" : "w";
  }

  class CrazyhouseBoard {
    /**
     * @param {HTMLElement} boardEl - contenedor del tablero (grid 8x8)
     * @param {HTMLElement} topPocketEl - bandeja de arriba (reserva rival)
     * @param {HTMLElement} bottomPocketEl - bandeja de abajo (mi reserva)
     * @param {object} opts
     * @param {boolean} opts.interactive - true si este usuario puede mover/soltar ahora
     * @param {"w"|"b"} opts.myColor - con qué color juega quien mira esta pantalla
     * @param {(info: {fen, san, drop, gameOver, result}) => void} opts.onMove
     */
    constructor(boardEl, topPocketEl, bottomPocketEl, opts) {
      opts = opts || {};
      this.boardEl = boardEl;
      this.topPocketEl = topPocketEl;
      this.bottomPocketEl = bottomPocketEl;
      this.interactive = !!opts.interactive;
      this.myColor = opts.myColor || "w";
      this.flipped = this.myColor === "b";
      this.onMove = opts.onMove || function () {};
      this.onPromotionNeeded = opts.onPromotionNeeded || null; // (from, to, callback(piece|null))
      this.game = new Crazyhouse.Game();
      this.selected = null; // {kind:"square", square} | {kind:"pocket", piece}
      this.boardEl.style.position = "relative";
      this.boardEl.setAttribute("role", "group");
      this.boardEl.setAttribute("aria-label", "Tablero de Crazyhouse");

      // Arrastrar y soltar piezas del tablero (además del toque-toque de siempre): ver
      // js/board-drag.js. Soltar una pieza de la bandeja de reserva sigue siendo solo
      // por toques (arrastrarla implicaría un segundo contenedor fuera del tablero, que
      // este ayudante genérico no cubre).
      if (typeof enableBoardDrag !== "undefined") {
        enableBoardDrag(this.boardEl, {
          isDraggable: (square) => {
            if (!this._canActNow()) return false;
            const piece = this.game.get(square);
            return !!(piece && piece.color === this.myColor);
          },
          isSelected: (square) => !!(this.selected && this.selected.kind === "square" && this.selected.square === square),
          onSquareClick: (square) => this._onSquareClick(square),
        });
      }
    }

    loadFen(fen) {
      this.game.load(fen);
      this.selected = null;
      this.render();
    }

    fen() {
      return this.game.fen();
    }

    setInteractive(v) {
      this.interactive = !!v;
      this.render();
    }

    _canActNow() {
      return this.interactive && this.game.turn() === this.myColor;
    }

    _legalTargetsFromSquare(square) {
      return this.game.moves({ square: square, verbose: true });
    }

    _selectSquare(square) {
      const piece = this.game.get(square);
      if (!piece || piece.color !== this.myColor) return;
      this.selected = { kind: "square", square: square };
      this.render();
    }

    _selectPocket(type) {
      if (!this.game.pocket(this.myColor)[type]) return;
      this.selected = { kind: "pocket", piece: type };
      this.render();
    }

    _clearSelection() {
      this.selected = null;
      this.render();
    }

    _applyMove(from, to, promotion) {
      const move = this.game.move({ from: from, to: to, promotion: promotion || "q" });
      if (!move) return;
      this._finishTurn(move.san, false);
    }

    _applyDrop(type, square) {
      const move = this.game.drop(type, square);
      if (!move) return;
      this._finishTurn(move.san, true);
    }

    _finishTurn(san, wasDrop) {
      this.selected = null;
      this.render();
      let gameOver = false, result = null;
      if (this.game.in_checkmate()) {
        gameOver = true;
        result = this.game.turn() === "w" ? "black" : "white"; // a quien le toca mover es quien esta mate
      } else if (this.game.in_draw()) {
        gameOver = true;
        result = "draw";
      }
      this.onMove({ fen: this.game.fen(), san: san, drop: wasDrop, gameOver: gameOver, result: result });
    }

    _onSquareClick(square) {
      if (!this._canActNow()) return;
      if (this.selected && this.selected.kind === "square" && this.selected.square === square) {
        this._clearSelection();
        return;
      }
      if (this.selected) {
        if (this.selected.kind === "square") {
          const targets = this._legalTargetsFromSquare(this.selected.square);
          const match = targets.find((m) => m.to === square);
          if (match) {
            const needsPromotion = targets.some((m) => m.to === square && m.promotion);
            if (needsPromotion && this.onPromotionNeeded) {
              const from = this.selected.square;
              this.onPromotionNeeded(from, square, (piece) => {
                if (piece) this._applyMove(from, square, piece);
                else this._clearSelection();
              });
              return;
            }
            this._applyMove(this.selected.square, square, needsPromotion ? "q" : undefined);
            return;
          }
        } else if (this.selected.kind === "pocket") {
          const drops = this.game.dropSquares(this.selected.piece, this.myColor);
          if (drops.indexOf(square) !== -1) {
            this._applyDrop(this.selected.piece, square);
            return;
          }
        }
      }
      this._selectSquare(square);
    }

    _onPocketClick(type) {
      if (!this._canActNow()) return;
      if (this.selected && this.selected.kind === "pocket" && this.selected.piece === type) {
        this._clearSelection();
        return;
      }
      this._selectPocket(type);
    }

    render() {
      this._renderBoard();
      const bottomColor = this.myColor;
      const topColor = otherColor(this.myColor);
      this._renderPocket(this.topPocketEl, topColor);
      this._renderPocket(this.bottomPocketEl, bottomColor);
    }

    _renderBoard() {
      const g = this.game;
      const canAct = this._canActNow();
      this.boardEl.innerHTML = "";
      const squares = squaresInOrder(this.flipped);

      let legalTargets = [];
      if (canAct && this.selected) {
        if (this.selected.kind === "square") legalTargets = this._legalTargetsFromSquare(this.selected.square).map((m) => m.to);
        else legalTargets = g.dropSquares(this.selected.piece, this.myColor);
      }

      squares.forEach((square) => {
        const btn = document.createElement("button");
        btn.type = "button";
        const light = isLightSquare(square);
        let cls = "flex items-center justify-center select-none relative transition-colors w-full h-full border-0 p-0 m-0 text-3xl sm:text-4xl md:text-5xl ";
        cls += canAct ? "cursor-pointer " : "cursor-default ";
        cls += light ? "bg-brand-100 " : "bg-brand-500 ";
        if (this.selected && this.selected.kind === "square" && this.selected.square === square) {
          cls += "outline outline-4 -outline-offset-4 outline-accent-500 ";
        }
        btn.className = cls;
        btn.setAttribute("data-square", square);
        const piece = g.get(square);
        const pieceName = piece ? ((piece.color === "w" ? "Blanco" : "Negro") + " " + PIECE_NAME[piece.type]) : "vacía";
        btn.setAttribute("aria-label", "Casilla " + square + ": " + pieceName);

        if (piece) {
          const span = document.createElement("span");
          span.textContent = GLYPH[piece.type][piece.color];
          span.className = piece.color === "w" ? "piece-white" : "piece-black";
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

    _renderPocket(el, color) {
      if (!el) return;
      el.innerHTML = "";
      const pocket = this.game.pocket(color);
      const canDrop = this._canActNow() && color === this.myColor;
      const types = ["q", "r", "b", "n", "p"];
      let any = false;
      types.forEach((type) => {
        const count = pocket[type];
        if (!count) return;
        any = true;
        const btn = document.createElement("button");
        btn.type = "button";
        const selected = this.selected && this.selected.kind === "pocket" && this.selected.piece === type && color === this.myColor;
        btn.className = "relative w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-2xl sm:text-3xl rounded-lg border-2 transition-colors " +
          (selected
            ? "border-accent-500 bg-accent-500/10"
            : "border-transparent " + (canDrop ? "hover:border-accent-400 cursor-pointer" : "cursor-default opacity-90"));
        const span = document.createElement("span");
        span.textContent = GLYPH[type][color];
        span.className = color === "w" ? "piece-white" : "piece-black";
        span.setAttribute("aria-hidden", "true");
        btn.appendChild(span);
        const badge = document.createElement("span");
        badge.className = "absolute -bottom-1 -right-1 bg-brand-800 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center";
        badge.textContent = String(count);
        badge.setAttribute("aria-hidden", "true");
        btn.appendChild(badge);
        btn.setAttribute("aria-label", (color === "w" ? "Blancas" : "Negras") + ": " + count + " " + PIECE_NAME[type] + (count === 1 ? "" : "s") + " en reserva");
        if (canDrop) btn.addEventListener("click", () => this._onPocketClick(type));
        el.appendChild(btn);
      });
      if (!any) {
        const empty = document.createElement("span");
        empty.className = "text-xs text-brand-300 dark:text-brand-600 italic px-1";
        empty.textContent = "Sin piezas en reserva";
        el.appendChild(empty);
      }
    }
  }

  window.CrazyhouseBoard = CrazyhouseBoard;
})();
