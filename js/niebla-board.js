/**
 * Tablero de Niebla de Guerra: ajedrez de toda la vida (mismo motor,
 * chess.js) con una capa visual encima — las casillas que mis propias
 * piezas no alcanzan a atacar o defender quedan cubiertas por niebla, sin
 * mostrar lo que hay ahí (puede estar vacío o tener una pieza rival). Un
 * espectador (por ejemplo el profesor, si no juega) ve el tablero completo,
 * sin niebla — sirve para supervisar.
 *
 * Interacción idéntica a Crazyhouse (toque para seleccionar origen, toque
 * para elegir destino entre las jugadas legales resaltadas, o arrastrar la
 * pieza — ver js/board-drag.js): la niebla es solo visual, no cambia qué
 * jugadas son legales ni cómo se hacen.
 *
 * Requiere chess.js y js/niebla-engine.js cargados antes que este archivo.
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

  class NieblaBoard {
    /**
     * @param {HTMLElement} boardEl
     * @param {object} opts
     * @param {boolean} opts.interactive
     * @param {"w"|"b"} opts.myColor
     * @param {boolean} opts.spectator - true = ve el tablero completo, sin niebla
     * @param {(info:{fen, san, gameOver, result})=>void} opts.onMove
     * @param {(from,to,cb)=>void} opts.onPromotionNeeded
     */
    constructor(boardEl, opts) {
      opts = opts || {};
      this.boardEl = boardEl;
      if (window.Coordenadas) Coordenadas.aplicar(boardEl);   // letras y números por fuera (js/coordenadas-tablero.js)
      this.interactive = !!opts.interactive;
      this.myColor = opts.myColor || "w";
      this.spectator = !!opts.spectator;
      this.flipped = this.myColor === "b";
      this.onMove = opts.onMove || function () {};
      this.onPromotionNeeded = opts.onPromotionNeeded || null;
      this.game = new Chess();
      this.selected = null; // casilla de origen elegida
      this.lastMove = null; // {from,to} de la última jugada — para el resalte y el deslizamiento
      this._loadedOnce = false;
      this.boardEl.style.position = "relative";
      this.boardEl.setAttribute("role", "group");
      this.boardEl.setAttribute("aria-label", "Tablero de Niebla de Guerra");

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

    loadFen(fen) {
      // Solo se compara con lo anterior a partir de la segunda carga: la
      // primera es la posición inicial de la partida, no una jugada — no
      // hay nada que deslizar ni ninguna "última jugada" que resaltar ahí.
      const prevFen = this._loadedOnce ? this.game.fen() : null;
      this.game.load(fen);
      this.selected = null;
      // Se desliza solo lo que cambió EN ESTA carga: un eco con la misma
      // posición no tiene que volver a animar la jugada de antes.
      let diff = null;
      if (prevFen && prevFen !== fen && window.BoardFluid) {
        diff = BoardFluid.diffMove(prevFen, fen);
        if (diff) this.lastMove = diff;
      }
      this._loadedOnce = true;
      this.render();
      if (diff && diff.from && window.BoardFluid) {
        // Deslizar desde una casilla tapada delataría de dónde salió la pieza.
        const visible = this._visibleSquares();
        if (!visible || (visible.has(diff.from) && visible.has(diff.to))) {
          BoardFluid.slide(this.boardEl, diff.from, diff.to, this.flipped);
        }
      }
    }

    fen() { return this.game.fen(); }

    setInteractive(v) {
      this.interactive = !!v;
      this.render();
    }

    _canActNow() {
      return this.interactive && this.game.turn() === this.myColor;
    }

    _visibleSquares() {
      // Espectador (por ejemplo el profesor mirando sin jugar): ve todo,
      // sin niebla — le sirve para supervisar la partida.
      if (this.spectator) return null;
      return NieblaGuerra.visibleSquaresFor(this.game, this.myColor);
    }

    _legalTargetsFromSquare(square) {
      return this.game.moves({ square: square, verbose: true });
    }

    _clearSelection() {
      this.selected = null;
      this.render();
    }

    _applyMove(from, to, promotion) {
      const move = this.game.move({ from: from, to: to, promotion: promotion || "q" });
      if (!move) return;
      this.selected = null;
      // La jugada propia ya se vio moverse con el arrastre o el toque —
      // acá solo hace falta el resalte, sin deslizamiento otra vez encima.
      this.lastMove = { from: from, to: to };
      this.render();
      this._afterMove(move);
    }

    _afterMove(move) {
      let gameOver = false, result = null;
      if (this.game.in_checkmate()) {
        gameOver = true;
        result = this.game.turn() === "w" ? "black" : "white"; // a quien le toca mover es quien está mate
      } else if (this.game.in_draw()) {
        gameOver = true;
        result = "draw";
      }
      this.onMove({ fen: this.game.fen(), san: move.san, gameOver: gameOver, result: result });
    }

    // ---------- Accesibilidad: jugar escribiendo la jugada en vez de tocar el tablero ----------
    // Usa el mismo intérprete de texto que el resto del sitio (js/chess-move-parser.js) —
    // ver js/juegos-blind.js, que llama a esto desde el cuadro de texto del modo adaptado.
    tryMove(rawText) {
      if (!this._canActNow()) return { ok: false, reason: "no_turn" };
      if (typeof ChessMoveParser === "undefined") return { ok: false, reason: "no_parser" };
      const move = ChessMoveParser.tryParseMove(this.game, rawText);
      if (!move) return { ok: false, reason: "invalid" };
      this.selected = null;
      this.lastMove = { from: move.from, to: move.to };
      this.render();
      this._afterMove(move);
      return { ok: true, san: move.san };
    }

    _onSquareClick(square) {
      if (!this._canActNow()) return;
      if (this.selected === square) { this._clearSelection(); return; }
      if (this.selected) {
        const targets = this._legalTargetsFromSquare(this.selected);
        const match = targets.find((m) => m.to === square);
        if (match) {
          const needsPromotion = !!match.promotion;
          if (needsPromotion && this.onPromotionNeeded) {
            const from = this.selected;
            this.onPromotionNeeded(from, square, (piece) => {
              if (piece) this._applyMove(from, square, piece);
              else this._clearSelection();
            });
            return;
          }
          this._applyMove(this.selected, square, needsPromotion ? "q" : undefined);
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
      const visible = this._visibleSquares(); // null = sin niebla (espectador)
      this.boardEl.innerHTML = "";
      const squares = squaresInOrder(this.flipped);

      let legalTargets = [];
      if (canAct && this.selected) {
        legalTargets = this._legalTargetsFromSquare(this.selected).map((m) => m.to);
      }

      squares.forEach((square) => {
        const btn = document.createElement("button");
        btn.type = "button";
        const light = isLightSquare(square);
        const fogged = !!(visible && !visible.has(square));
        let cls = "flex items-center justify-center select-none relative transition-colors w-full h-full border-0 p-0 m-0 text-3xl sm:text-4xl md:text-5xl ";
        cls += canAct ? "cursor-pointer " : "cursor-default ";
        cls += light ? "bg-[var(--sq-light)] " : "bg-[var(--sq-dark)] ";
        if (this.selected === square) cls += "outline outline-4 -outline-offset-4 outline-accent-500 ";
        btn.className = cls;
        btn.setAttribute("data-square", square);

        const piece = fogged ? null : g.get(square);
        const pieceName = fogged ? "cubierta por la niebla" : (piece ? ((piece.color === "w" ? "Blanco" : "Negro") + " " + PIECE_NAME[piece.type]) : "vacía");
        btn.setAttribute("aria-label", "Casilla " + square + ": " + pieceName);

        if (this.lastMove && !fogged && (this.lastMove.from === square || this.lastMove.to === square)) {
          const mark = document.createElement("span");
          mark.setAttribute("aria-hidden", "true");
          mark.className = "absolute inset-0 bg-accent-400/30 pointer-events-none";
          btn.appendChild(mark);
        }

        if (fogged) {
          const fog = document.createElement("span");
          fog.className = "absolute inset-0 bg-brand-900/70 flex items-center justify-center text-base";
          fog.setAttribute("aria-hidden", "true");
          fog.textContent = "🌫️";
          btn.appendChild(fog);
        } else if (piece) {
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
          dot.className = (piece && !fogged)
            ? "absolute inset-0 rounded-full ring-4 ring-accent-500/70 ring-inset pointer-events-none"
            : "absolute w-1/4 h-1/4 rounded-full bg-accent-500/70 pointer-events-none z-10";
          btn.appendChild(dot);
        }

        btn.addEventListener("click", () => this._onSquareClick(square));
        this.boardEl.appendChild(btn);
      });
    }
  }

  window.NieblaBoard = NieblaBoard;
})();
