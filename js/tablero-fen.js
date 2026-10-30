/* Un tablero que solo MUESTRA una posición (una FEN), sin jugar nada: el de la
 * sala de cine (js/transmision.js) y el de las partidas en vivo del
 * Centroamericano (js/centroamericano-partidas.js). Una sola copia.
 *
 * Mismo dibujo que el resto del sitio: las casillas con los colores que eligió
 * cada quien (--sq-light/--sq-dark, de js/board-color-themes.js) y la pieza
 * por PiezaPreferida. Las clases (.cine-tablero, .cine-sq…) están en
 * css/styles.css.
 *
 *   TableroFen.dibujar(el, fen, ultima, { miniatura, girado })
 *       ultima: la jugada en UCI («e2e4») para marcar sus dos casillas.
 *       girado: con las negras abajo.
 *   TableroFen.piezas(fen)    → { e1: { type: "k", color: "w" }, … }
 *   TableroFen.describir(fen) → la posición en palabras, para quien no la ve
 */
(function () {
  "use strict";

  const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const NOMBRE_PIEZA = { k: "rey", q: "dama", r: "torre", b: "alfil", n: "caballo", p: "peón" };
  const ORDEN_PIEZA = "kqrbnp";

  // Solo hace falta la parte de las piezas de la FEN.
  function piezas(fen) {
    const out = {};
    const filas = String(fen || INICIAL).split(" ")[0].split("/");
    if (filas.length !== 8) return out;
    filas.forEach((fila, i) => {
      const rank = 8 - i;
      let f = 0;
      for (const ch of fila) {
        if (/[1-8]/.test(ch)) { f += Number(ch); continue; }
        if (f > 7) break;
        const tipo = ch.toLowerCase();
        if (ORDEN_PIEZA.indexOf(tipo) === -1) { f++; continue; }
        out[FILES[f] + rank] = { type: tipo, color: ch === tipo ? "b" : "w" };
        f++;
      }
    });
    return out;
  }

  function dibujar(el, fen, ultima, opts) {
    const o = opts || {};
    const p = piezas(fen);
    const marcadas = ultima && /^[a-h][1-8][a-h][1-8]/.test(ultima) ? [ultima.slice(0, 2), ultima.slice(2, 4)] : [];
    el.innerHTML = "";
    for (let i = 0; i < 8; i++) {
      const rank = o.girado ? i + 1 : 8 - i;
      for (let j = 0; j < 8; j++) {
        const f = o.girado ? 7 - j : j;
        const casilla = FILES[f] + rank;
        const clara = (f + rank - 1) % 2 === 1;   // a1 oscura
        const sq = document.createElement("div");
        sq.className = "cine-sq " + (clara ? "cine-sq-clara" : "cine-sq-oscura") +
          (marcadas.indexOf(casilla) !== -1 ? " cine-sq-ultima" : "");
        sq.dataset.square = casilla;
        const pz = p[casilla];
        if (pz) {
          const span = document.createElement("span");
          span.setAttribute("aria-hidden", "true");
          if (window.PiezaPreferida) window.PiezaPreferida.pintar(span, pz.type, pz.color);
          else {
            span.className = pz.color === "w" ? "piece-white" : "piece-black";
            span.textContent = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" }[pz.type];
          }
          sq.appendChild(span);
        }
        el.appendChild(sq);
      }
    }
    requestAnimationFrame(() => ajustar(el));
    if (!o.miniatura && window.Coordenadas) window.Coordenadas.aplicar(el);
  }

  // La pieza se mide contra la casilla ya dibujada, no contra la ventana.
  function ajustar(el) {
    const sq = el.querySelector(".cine-sq");
    if (!sq) return;
    const ancho = sq.getBoundingClientRect().width;
    if (!ancho) return;
    el.style.fontSize = Math.max(8, ancho * 0.72) + "px";
  }

  function describir(fen) {
    const p = piezas(fen);
    const lado = (color) => Object.keys(p)
      .filter((c) => p[c].color === color)
      .sort((a, b) => ORDEN_PIEZA.indexOf(p[a].type) - ORDEN_PIEZA.indexOf(p[b].type) || a.localeCompare(b))
      .map((c) => NOMBRE_PIEZA[p[c].type] + " en " + c)
      .join(", ");
    return "Blancas: " + (lado("w") || "ninguna pieza") + ". Negras: " + (lado("b") || "ninguna pieza") + ".";
  }

  window.TableroFen = { INICIAL, piezas, dibujar, ajustar, describir };
})();
