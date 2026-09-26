/**
 * Tablero de Ajedrez de Cartas: el tablero de 8x8 de siempre + la mano de
 * cartas propia debajo y un resumen de la mano rival arriba (cuántas tiene,
 * o sus nombres si "Visión" está activa).
 *
 * Interacción: tocar una carta de la mano la selecciona. Si la carta no
 * necesita objetivo (salto, robo, visión, doble), se juega al toque. Si
 * necesita una casilla (refuerzo, congelar, escudo, ascenso), el tablero
 * resalta las casillas válidas y se juega al tocar una. "Ascenso" pide
 * además la pieza destino con un selector aparte (mismo patrón que elegir
 * pieza al coronar). Para mover, igual que siempre: tocar una pieza propia
 * y después su casilla de destino (o arrastrar, ver js/board-drag.js).
 *
 * Requiere chess.js y js/cartas-engine.js cargados antes que este archivo.
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
  function otherColor(c) { return c === "w" ? "b" : "w"; }

  // Todas las casillas del tablero: sirve para ofrecer "elige una casilla
  // vacía/rival/propia" sin depender de que chess.js tenga un generador de
  // jugadas para eso (no es una jugada de pieza, es el objetivo de una carta).
  const ALL_SQUARES = squaresInOrder(false);

  class CartasBoard {
    /**
     * @param {HTMLElement} boardEl
     * @param {HTMLElement} myHandEl
     * @param {HTMLElement} rivalHandEl
     * @param {object} opts
     * @param {boolean} opts.interactive
     * @param {"w"|"b"} opts.myColor
     * @param {boolean} opts.spectator - true para quien MIRA la partida sin jugarla.
     *   Cambia una sola cosa, y es la que importa: no se le enseña ninguna mano.
     *   `myColor` sigue haciendo falta (decide de qué lado se ve el tablero), pero
     *   sin esto el espectador vería la mano completa de las blancas, que en un
     *   torneo es la información por la que se gana la partida — y se la vería
     *   quien está esperando para jugar contra ellas en la ronda siguiente.
     * @param {(info:{fen,san,gameOver,result})=>void} opts.onMove
     * @param {(cardId:string, params:object, resultado:object)=>void} opts.onCardPlayed
     * @param {(from,to,cb)=>void} opts.onPromotionNeeded - cb(piece|null)
     * @param {(square,cb)=>void} opts.onAscensoPieceNeeded - cb(piece|null)
     */
    constructor(boardEl, myHandEl, rivalHandEl, opts) {
      opts = opts || {};
      this.boardEl = boardEl;
      if (window.Coordenadas) Coordenadas.aplicar(boardEl);   // letras y números por fuera (js/coordenadas-tablero.js)
      this.myHandEl = myHandEl;
      this.rivalHandEl = rivalHandEl;
      this.interactive = !!opts.interactive;
      this.spectator = !!opts.spectator;
      this.myColor = opts.myColor || "w";
      this.flipped = this.myColor === "b";
      this.onMove = opts.onMove || function () {};
      this.onCardPlayed = opts.onCardPlayed || function () {};
      this.onPromotionNeeded = opts.onPromotionNeeded || null;
      this.onAscensoPieceNeeded = opts.onAscensoPieceNeeded || null;
      this.game = new CartasChess.Game();
      this.selected = null; // {kind:"square", square} | {kind:"card", cardId}
      this.lastError = null;
      this.boardEl.style.position = "relative";
      this.boardEl.setAttribute("role", "group");
      this.boardEl.setAttribute("aria-label", "Tablero de Ajedrez de Cartas");

      if (typeof enableBoardDrag !== "undefined") {
        enableBoardDrag(this.boardEl, {
          isDraggable: (square) => {
            if (!this._canActNow() || (this.selected && this.selected.kind === "card")) return false;
            const piece = this.game.get(square);
            return !!(piece && piece.color === this.myColor);
          },
          isSelected: (square) => !!(this.selected && this.selected.kind === "square" && this.selected.square === square),
          onSquareClick: (square) => this._onSquareClick(square),
        });
      }
    }

    loadState(data) {
      this.game = CartasChess.Game.fromJSON(data);
      this.selected = null;
      this.render();
    }

    fen() { return this.game.fen(); }
    state() { return this.game.toJSON(); }

    setInteractive(v) {
      this.interactive = !!v;
      this.render();
    }

    _canActNow() {
      return this.interactive && this.game.turn() === this.myColor;
    }

    _clearSelection() {
      this.selected = null;
      this.lastError = null;
      this.render();
    }

    // ---------- Objetivo de cada carta: qué casillas son válidas para elegir ----------
    _targetSquaresFor(cardId) {
      const g = this.game;
      const color = this.myColor;
      if (cardId === "refuerzo") {
        return ALL_SQUARES.filter((sq) => {
          if (g.get(sq)) return false;
          const rank = parseInt(sq[1], 10);
          return color === "w" ? (rank >= 2 && rank <= 4) : (rank >= 5 && rank <= 7);
        });
      }
      if (cardId === "ascenso") {
        return ALL_SQUARES.filter((sq) => { const p = g.get(sq); return p && p.type === "p" && p.color === color; });
      }
      if (cardId === "congelar") {
        return ALL_SQUARES.filter((sq) => { const p = g.get(sq); return p && p.color !== color && p.type !== "k"; });
      }
      if (cardId === "escudo") {
        return ALL_SQUARES.filter((sq) => { const p = g.get(sq); return p && p.color === color; });
      }
      return []; // salto, robo, vision, doble: sin objetivo
    }

    _onHandCardClick(cardId) {
      if (!this._canActNow() || this.game.cardPlayedThisTurn) return;
      if (this.selected && this.selected.kind === "card" && this.selected.cardId === cardId) {
        this._clearSelection();
        return;
      }
      const objetivo = CartasChess.CARTAS[cardId].objetivo;
      if (objetivo === "ninguno") {
        const resultado = this.game.playCard(this.myColor, cardId, {});
        if (!resultado.ok) { this.lastError = resultado.error; this.render(); return; }
        this.onCardPlayed(cardId, {}, resultado);
        this.selected = null;
        this.render();
        return;
      }
      this.selected = { kind: "card", cardId: cardId };
      this.lastError = null;
      this.render();
    }

    _onSquareClick(square) {
      if (!this._canActNow()) return;

      // Modo "eligiendo objetivo de una carta".
      if (this.selected && this.selected.kind === "card") {
        const cardId = this.selected.cardId;
        const validos = this._targetSquaresFor(cardId);
        if (validos.indexOf(square) === -1) return;
        if (cardId === "ascenso" && this.onAscensoPieceNeeded) {
          this.onAscensoPieceNeeded(square, (piece) => {
            if (!piece) { this._clearSelection(); return; }
            const resultado = this.game.playCard(this.myColor, "ascenso", { square: square, promotion: piece });
            if (!resultado.ok) { this.lastError = resultado.error; this.render(); return; }
            this.onCardPlayed("ascenso", { square: square, promotion: piece }, resultado);
            this._clearSelection();
          });
          return;
        }
        const resultado = this.game.playCard(this.myColor, cardId, { square: square });
        if (!resultado.ok) { this.lastError = resultado.error; this.render(); return; }
        this.onCardPlayed(cardId, { square: square }, resultado);
        this._clearSelection();
        return;
      }

      // Modo normal: mover una pieza.
      if (this.selected && this.selected.kind === "square" && this.selected.square === square) {
        this._clearSelection();
        return;
      }
      if (this.selected && this.selected.kind === "square") {
        const targets = this.game.legalMoves({ square: this.selected.square });
        const match = targets.find((m) => m.to === square);
        if (match) {
          const needsPromotion = !!match.promotion;
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
      }
      const piece = this.game.get(square);
      if (!piece || piece.color !== this.myColor) { this._clearSelection(); return; }
      this.selected = { kind: "square", square: square };
      this.lastError = null;
      this.render();
    }

    _applyMove(from, to, promotion) {
      const resultado = this.game.move({ from: from, to: to, promotion: promotion });
      if (!resultado.ok) { this.lastError = resultado.error; this.render(); return; }
      this.selected = null;
      this.lastError = null;
      this.render();
      this.onMove({ fen: this.game.fen(), san: resultado.san, gameOver: resultado.gameOver, result: resultado.result });
    }

    render() {
      this._renderBoard();
      this._renderMyHand();
      this._renderRivalHand();
    }

    _renderBoard() {
      const g = this.game;
      const canAct = this._canActNow();
      this.boardEl.innerHTML = "";
      const squares = squaresInOrder(this.flipped);

      let legalTargets = [];
      let cardTargets = [];
      if (canAct && this.selected) {
        if (this.selected.kind === "square") legalTargets = g.legalMoves({ square: this.selected.square }).map((m) => m.to);
        else cardTargets = this._targetSquaresFor(this.selected.cardId);
      }

      squares.forEach((square) => {
        const btn = document.createElement("button");
        btn.type = "button";
        const light = isLightSquare(square);
        let cls = "flex items-center justify-center select-none relative transition-colors w-full h-full border-0 p-0 m-0 text-3xl sm:text-4xl md:text-5xl ";
        cls += canAct ? "cursor-pointer " : "cursor-default ";
        cls += light ? "bg-[var(--sq-light)] " : "bg-[var(--sq-dark)] ";
        if (this.selected && this.selected.kind === "square" && this.selected.square === square) {
          cls += "outline outline-4 -outline-offset-4 outline-accent-500 ";
        }
        if (square === (g.frozenSquare && g.frozenSquare.square)) cls += "ring-4 ring-inset ring-sky-400 ";
        if (square === (g.shieldedSquare && g.shieldedSquare.square)) cls += "ring-4 ring-inset ring-emerald-400 ";
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
        if (cardTargets.indexOf(square) !== -1) {
          const dot = document.createElement("span");
          dot.setAttribute("aria-hidden", "true");
          dot.className = "absolute inset-0 rounded-full ring-4 ring-purple-500/80 ring-inset pointer-events-none animate-pulse";
          btn.appendChild(dot);
        }

        btn.addEventListener("click", () => this._onSquareClick(square));
        this.boardEl.appendChild(btn);
      });
    }

    _renderMyHand() {
      if (!this.myHandEl) return;
      this.myHandEl.innerHTML = "";
      const canPlay = this._canActNow() && !this.game.cardPlayedThisTurn;
      const mano = this.game.hands[this.myColor] || [];
      // Quien mira no ve ninguna mano: solo cuántas cartas hay de cada lado,
      // igual que ve cualquiera de los dos jugadores la del otro.
      if (this.spectator) {
        const p = document.createElement("p");
        p.className = "text-sm text-brand-450 dark:text-brand-350";
        p.textContent = mano.length
          ? "🂠".repeat(mano.length) + " (" + mano.length + " carta" + (mano.length === 1 ? "" : "s") + ") — las cartas no se le enseñan a quien mira."
          : "Sin cartas en mano.";
        this.myHandEl.appendChild(p);
        return;
      }
      if (!mano.length) {
        const empty = document.createElement("p");
        empty.className = "text-xs text-brand-300 dark:text-brand-600 italic";
        empty.textContent = "Sin cartas en mano.";
        this.myHandEl.appendChild(empty);
        return;
      }
      mano.forEach((cardId, i) => {
        const info = CartasChess.CARTAS[cardId];
        const selected = this.selected && this.selected.kind === "card" && this.selected.cardId === cardId;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "text-left w-full sm:w-44 shrink-0 rounded-xl border-2 p-2.5 transition-colors " +
          (selected ? "border-accent-500 bg-accent-500/10" : "border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-900") +
          (canPlay ? " hover:border-accent-400 cursor-pointer" : " cursor-default opacity-80");
        btn.innerHTML =
          '<span class="text-lg">' + info.emoji + ' <strong class="font-serif">' + info.nombre + '</strong></span>' +
          '<p class="text-[11px] text-brand-500 dark:text-brand-400 mt-0.5 leading-snug">' + info.texto + '</p>';
        if (canPlay) btn.addEventListener("click", () => this._onHandCardClick(cardId));
        this.myHandEl.appendChild(btn);
      });
    }

    _renderRivalHand() {
      if (!this.rivalHandEl) return;
      this.rivalHandEl.innerHTML = "";
      const rivalColor = otherColor(this.myColor);
      const mano = this.game.hands[rivalColor] || [];
      // `visionUntil` es el efecto de una carta y se lo gana quien JUEGA. Para un
      // espectador, myColor es solo el lado desde el que se dibuja el tablero, así
      // que sin este `!this.spectator` la carta de visión le destaparía la mano a
      // quien no la jugó.
      const puedoVer = !this.spectator && this.game.visionUntil === this.myColor;
      if (!mano.length) {
        this.rivalHandEl.textContent = "El rival no tiene cartas.";
        return;
      }
      if (puedoVer) {
        this.rivalHandEl.textContent = "👁️ " + mano.map((id) => CartasChess.CARTAS[id].emoji + " " + CartasChess.CARTAS[id].nombre).join(" · ");
      } else {
        this.rivalHandEl.textContent = "🂠".repeat(mano.length) + " (" + mano.length + " carta" + (mano.length === 1 ? "" : "s") + ")";
      }
    }
  }

  window.CartasBoard = CartasBoard;
})();
