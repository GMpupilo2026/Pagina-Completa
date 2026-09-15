/**
 * Tablero visual de "Ilumina el Tablero" — Juegos.
 * Dibuja la figura de un nivel (ver js/ilumina-engine.js) con sus piezas
 * negras fijas, una bandeja con las piezas blancas a colocar, y deja tocar
 * primero la pieza de la bandeja y después la casilla donde va — igual de
 * simple que el resto de los tableros de click del sitio (sin arrastrar).
 */
(function () {
  "use strict";

  const E = window.IluminaEngine;

  class IluminaBoard {
    /**
     * @param {HTMLElement} boardEl - contenedor de la grilla del tablero
     * @param {HTMLElement} trayEl - contenedor de la bandeja de piezas
     * @param {object} opts
     * @param {(resultado: object) => void} [opts.onChange] - se llama tras cada colocación, con el resultado de evaluate()
     */
    constructor(boardEl, trayEl, opts) {
      opts = opts || {};
      this.boardEl = boardEl;
      this.trayEl = trayEl;
      this.onChange = opts.onChange || function () {};
      this.level = null;
      this.placements = {};
      this.seleccionada = null;
      this.boardEl.setAttribute("role", "group");
      this.boardEl.setAttribute("aria-label", "Tablero de Ilumina el Tablero");
    }

    loadLevel(level) {
      this.level = level;
      this.placements = {};
      this.seleccionada = level.piezas.length ? level.piezas[0].id : null;
      this.render();
      return this.evaluar();
    }

    // Aplica una pista: coloca la PRIMERA pieza que todavía no esté en su
    // posición correcta (según level.solucion), en esa posición.
    aplicarPista() {
      if (!this.level) return null;
      const faltante = this.level.piezas.find((p) => {
        const actual = this.placements[p.id];
        const correcta = this.level.solucion[p.id];
        return !actual || actual[0] !== correcta[0] || actual[1] !== correcta[1];
      });
      if (!faltante) return null;
      this.placements[faltante.id] = this.level.solucion[faltante.id].slice();
      const siguiente = this.level.piezas.find((p) => !this.placements[p.id]);
      this.seleccionada = siguiente ? siguiente.id : null;
      this.render();
      return this.evaluar();
    }

    evaluar() {
      const r = E.evaluate(this.level, this.placements);
      this.onChange(r);
      return r;
    }

    _piezaEnCasilla(c, r) {
      for (const id in this.placements) {
        const p = this.placements[id];
        if (p[0] === c && p[1] === r) return id;
      }
      return null;
    }

    _onTrayClick(piezaId) {
      this.seleccionada = this.seleccionada === piezaId ? null : piezaId;
      this.render();
    }

    _onCellClick(c, r) {
      if (!this.level) return;
      const enFigura = this.level.figura.cells.has(E.key(c, r));
      if (!enFigura) return;
      const esNegra = this.level.negras.some((bp) => bp.c === c && bp.r === r);
      if (esNegra) return;

      const ocupante = this._piezaEnCasilla(c, r);
      if (ocupante && !this.seleccionada) {
        // Tocar una pieza ya puesta, sin nada seleccionado: la levanta para moverla.
        this.seleccionada = ocupante;
        this.render();
        return;
      }
      if (!this.seleccionada || ocupante) return; // casilla ocupada por otra pieza: no se puede soltar ahí

      this.placements[this.seleccionada] = [c, r];
      const siguiente = this.level.piezas.find((p) => !this.placements[p.id]);
      this.seleccionada = siguiente ? siguiente.id : null;
      this.render();
      this.evaluar();
    }

    render() {
      if (!this.level) return;
      const resultado = E.evaluate(this.level, this.placements);
      this._renderTray(resultado);
      this._renderBoard(resultado);
    }

    _renderTray(resultado) {
      this.trayEl.innerHTML = "";
      this.level.piezas.forEach((p) => {
        const colocada = !!this.placements[p.id];
        const neutralizada = resultado.neutralizadas.indexOf(p.id) !== -1;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "w-12 h-12 flex items-center justify-center text-2xl rounded-lg border-2 transition-colors " +
          (this.seleccionada === p.id
            ? "border-accent-500 bg-accent-500/20"
            : colocada
              ? (neutralizada ? "border-red-400 bg-red-500/10 opacity-70" : "border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-900 opacity-60")
              : "border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-900 hover:border-accent-400");
        btn.textContent = E.PIECE_GLYPH_WHITE[p.type];
        btn.setAttribute("aria-pressed", String(this.seleccionada === p.id));
        btn.setAttribute("aria-label", E.PIECE_NAME[p.type] + (colocada ? " — ya colocada" : " — sin colocar"));
        btn.addEventListener("click", () => this._onTrayClick(p.id));
        this.trayEl.appendChild(btn);
      });
    }

    _renderBoard(resultado) {
      this.boardEl.innerHTML = "";
      this.boardEl.style.gridTemplateColumns = "repeat(" + this.level.figura.cols + ", minmax(0,1fr))";
      this.boardEl.style.gridTemplateRows = "repeat(" + this.level.figura.rows + ", minmax(0,1fr))";

      for (let r = 0; r < this.level.figura.rows; r++) {
        for (let c = 0; c < this.level.figura.cols; c++) {
          const key = E.key(c, r);
          const enFigura = this.level.figura.cells.has(key);
          const cell = document.createElement("div");
          if (!enFigura) {
            cell.className = "ilumina-fuera";
            cell.setAttribute("aria-hidden", "true");
            this.boardEl.appendChild(cell);
            continue;
          }
          const clara = (c + r) % 2 === 1;
          const negra = this.level.negras.find((bp) => bp.c === c && bp.r === r);
          const blancaId = this._piezaEnCasilla(c, r);
          const iluminada = !negra && !blancaId && resultado.iluminadas.has(key);
          const neutralizada = blancaId && resultado.neutralizadas.indexOf(blancaId) !== -1;

          let cls = "ilumina-casilla " + (clara ? "clara" : "oscura");
          if (iluminada) cls += " iluminada";
          if (neutralizada) cls += " amenazada";
          cell.className = cls;
          cell.setAttribute("role", "button");
          cell.setAttribute("tabindex", "0");

          if (negra) {
            const span = document.createElement("span");
            span.className = "ilumina-pieza piece-black";
            span.textContent = E.PIECE_GLYPH_BLACK[negra.type];
            cell.appendChild(span);
            cell.setAttribute("aria-label", "Casilla " + c + "," + r + ": " + E.PIECE_NAME[negra.type] + " negro");
          } else if (blancaId) {
            const tipo = this.level.piezas.find((p) => p.id === blancaId).type;
            const span = document.createElement("span");
            span.className = "ilumina-pieza piece-white" + (neutralizada ? " amenazada" : "");
            span.textContent = E.PIECE_GLYPH_WHITE[tipo];
            cell.appendChild(span);
            cell.setAttribute("aria-label", "Casilla " + c + "," + r + ": " + E.PIECE_NAME[tipo] + " blanco" + (neutralizada ? ", amenazado, no ilumina nada" : ""));
          } else {
            cell.setAttribute("aria-label", "Casilla " + c + "," + r + (iluminada ? ", iluminada" : ", sin iluminar"));
          }

          cell.addEventListener("click", () => this._onCellClick(c, r));
          cell.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this._onCellClick(c, r); } });
          this.boardEl.appendChild(cell);
        }
      }
    }
  }

  window.IluminaBoard = IluminaBoard;
})();
