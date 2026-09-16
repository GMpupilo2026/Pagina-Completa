/**
 * Tablero genérico de las variantes (variante.html): un grid 8x8 de botones,
 * como el de Crazyhouse, pero con el motor de reglas enchufable (cualquiera de
 * js/variantes-engines.js). Interacción por toques: tocar una pieza propia la
 * selecciona y marca sus destinos; tocar un destino mueve; tocar la misma pieza
 * la deselecciona. Cada casilla lleva aria-label con lo que hay en ella.
 *
 * Opciones:
 *   engine            motor (load/serialize/turn/get/movesFrom/move)
 *   myColor           "w" | "b" (los espectadores miran con blancas abajo)
 *   interactive       si este usuario puede mover ahora
 *   hidePieces        Ciegas: no dibuja piezas (solo casillas y coordenadas)
 *   onMove(info)      { san, fen, gameOver, result, from, to }
 *   onPromotionNeeded(from, to, cb)  cb(pieza | null)
 */
(function () {
  "use strict";

  const GLYPH = {
    p: { w: "♙", b: "♟" }, n: { w: "♘", b: "♞" }, b: { w: "♗", b: "♝" },
    r: { w: "♖", b: "♜" }, q: { w: "♕", b: "♛" }, k: { w: "♔", b: "♚" },
  };
  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

  function squaresInOrder(flipped) {
    const squares = [];
    for (let rank = 8; rank >= 1; rank--) for (const f of FILES) squares.push(f + rank);
    return flipped ? squares.reverse() : squares;
  }
  function isLightSquare(square) { return (FILES.indexOf(square[0]) + parseInt(square[1], 10) - 1) % 2 === 1; }

  class VarianteBoard {
    constructor(boardEl, opts) {
      opts = opts || {};
      this.boardEl = boardEl;
      this.engine = opts.engine;
      this.myColor = opts.myColor || "w";
      this.flipped = this.myColor === "b";
      this.interactive = !!opts.interactive;
      this.hidePieces = !!opts.hidePieces;
      this.onMove = opts.onMove || function () {};
      this.onPromotionNeeded = opts.onPromotionNeeded || null;
      this.selected = null;
      this.lastMove = null;
      this.boardEl.style.position = "relative";
      this.boardEl.setAttribute("role", "group");
      this.boardEl.setAttribute("aria-label", opts.ariaLabel || "Tablero");
    }
    load(texto) { this.engine.load(texto); this.selected = null; this.render(); }
    setInteractive(v) { this.interactive = !!v; this.render(); }
    setHidePieces(v) { this.hidePieces = !!v; this.render(); }
    setLastMove(m) { this.lastMove = m || null; this.render(); }
    _canActNow() { return this.interactive && this.engine.turn() === this.myColor; }

    _onSquareClick(square) {
      if (!this._canActNow()) return;
      if (this.selected === square) { this.selected = null; this.render(); return; }
      if (this.selected) {
        const targets = this.engine.movesFrom(this.selected);
        const match = targets.find((m) => m.to === square);
        if (match) {
          const from = this.selected;
          if (match.promotion && this.onPromotionNeeded) {
            this.onPromotionNeeded(from, square, (piece) => { if (piece) this._apply(from, square, piece); else { this.selected = null; this.render(); } });
            return;
          }
          this._apply(from, square, match.promotion ? "q" : undefined);
          return;
        }
      }
      const p = this.engine.get(square);
      if (p && p.color === this.myColor) { this.selected = square; this.render(); }
    }

    _apply(from, to, promotion) {
      const r = this.engine.move({ from, to, promotion });
      if (!r) return;
      this.selected = null;
      this.lastMove = { from, to };
      this.render();
      this.onMove(Object.assign({ from, to, fen: this.engine.serialize() }, r));
    }

    render() {
      const canAct = this._canActNow();
      this.boardEl.innerHTML = "";
      const targets = canAct && this.selected ? this.engine.movesFrom(this.selected).map((m) => m.to) : [];
      squaresInOrder(this.flipped).forEach((square) => {
        const btn = document.createElement("button");
        btn.type = "button";
        const light = isLightSquare(square);
        let cls = "flex items-center justify-center select-none relative transition-colors w-full h-full border-0 p-0 m-0 text-3xl sm:text-4xl md:text-5xl ";
        cls += canAct ? "cursor-pointer " : "cursor-default ";
        cls += light ? "bg-[var(--sq-light)] " : "bg-[var(--sq-dark)] ";
        if (this.selected === square) cls += "outline outline-4 -outline-offset-4 outline-accent-500 ";
        btn.className = cls;
        btn.setAttribute("data-square", square);
        const p = this.hidePieces ? null : this.engine.get(square);
        btn.setAttribute("aria-label", "Casilla " + square + ": " + (this.hidePieces ? "oculta" : p ? p.label : "vacía"));
        if (this.lastMove && (this.lastMove.from === square || this.lastMove.to === square) && !this.hidePieces) {
          const mark = document.createElement("span"); mark.setAttribute("aria-hidden", "true");
          mark.className = "absolute inset-0 bg-accent-400/30 pointer-events-none"; btn.appendChild(mark);
        }
        if (p) {
          const types = p.types || [];
          // Abrazos: cuando el abrazo fue entre piezas del MISMO tipo, "types"
          // no crece (peón+peón sigue siendo solo "p") — sin el anillo de acá
          // se vería idéntico a una captura común. "veces" (cuántas piezas
          // originales se fusionaron) es lo que permite distinguirlo.
          const fusionada = types.length > 1 || (p.veces && p.veces > 1);
          if (!fusionada) {
            const span = document.createElement("span");
            if (window.PieceStyleThemes && window.PieceStyleThemes.getPreference() === "ilustrado" && window.ChessPieceSVG) {
              span.innerHTML = window.ChessPieceSVG.markup(types[0], p.color);
              span.className = "chess-piece-illustrated relative";
            } else {
              span.textContent = GLYPH[types[0]][p.color];
              span.className = (p.color === "w" ? "piece-white" : "piece-black") + " relative";
            }
            span.setAttribute("aria-hidden", "true");
            btn.appendChild(span);
          } else if (types.length === 1) {
            // unión de piezas del mismo tipo: un solo glifo, pero con el
            // mismo anillo de "unión" para que no se vea como una captura.
            const ring = document.createElement("span"); ring.className = "absolute inset-1 rounded-full ring-2 ring-accent-500/80 pointer-events-none"; ring.setAttribute("aria-hidden", "true");
            const span = document.createElement("span");
            span.textContent = GLYPH[types[0]][p.color];
            span.className = (p.color === "w" ? "piece-white" : "piece-black") + " relative";
            span.setAttribute("aria-hidden", "true");
            btn.appendChild(ring); btn.appendChild(span);
          } else {
            // unión de varias piezas (Abrazos): las piezas en miniatura, en fila
            const wrap = document.createElement("span");
            wrap.className = "relative flex flex-wrap items-center justify-center leading-none " + (types.length > 2 ? "text-base sm:text-xl" : "text-xl sm:text-2xl md:text-3xl");
            wrap.setAttribute("aria-hidden", "true");
            types.forEach((t) => { const s = document.createElement("span"); s.textContent = GLYPH[t][p.color]; s.className = p.color === "w" ? "piece-white" : "piece-black"; wrap.appendChild(s); });
            const ring = document.createElement("span"); ring.className = "absolute inset-1 rounded-full ring-2 ring-accent-500/80 pointer-events-none"; ring.setAttribute("aria-hidden", "true");
            btn.appendChild(ring); btn.appendChild(wrap);
          }
        }
        if (this.hidePieces && (square[0] === "a" || square[1] === "1")) {
          const c = document.createElement("span"); c.setAttribute("aria-hidden", "true");
          c.className = "absolute bottom-0.5 right-1 text-[10px] sm:text-xs font-semibold text-brand-800/70 pointer-events-none"; c.textContent = square; btn.appendChild(c);
        }
        if (targets.indexOf(square) !== -1) {
          const dot = document.createElement("span"); dot.setAttribute("aria-hidden", "true");
          dot.className = p ? "absolute inset-0 rounded-full ring-4 ring-accent-500/70 ring-inset pointer-events-none" : "absolute w-1/4 h-1/4 rounded-full bg-accent-500/70 pointer-events-none";
          btn.appendChild(dot);
        }
        btn.addEventListener("click", () => this._onSquareClick(square));
        this.boardEl.appendChild(btn);
      });
    }
  }

  window.VarianteBoard = VarianteBoard;
})();
