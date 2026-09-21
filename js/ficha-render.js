/**
 * Ajedrez Integral — dibuja una FICHA de estudio (js/fichas-estudio.js): el
 * mapa de una sola pantalla (idea + cuatro bloques alrededor de la pieza) y,
 * abajo, el tablero que la explica, recorrible jugada por jugada.
 *
 * Lo usa entreno/estudio.html (las 56 fichas, en sus cuatro categorías) y
 * entreno/estudio.html (solo las de aperturas y defensas, sin pestañas): las
 * dos pintan el mismo mapa y el mismo tablero, así que vive en un solo lugar
 * — antes estaba escrito dentro de entreno/fichas.html (la página que se
 * fusionó con Estudio) y corregirle algo ahí no
 * lo habría corregido en la otra página.
 *
 * Requiere que la página ya tenga cargado chess.js, js/aperturas-lineas.js,
 * js/fichas-estudio.js, js/blind-notation.js, js/chess-piece-svg.js,
 * js/piece-style-themes.js y js/coordenadas-tablero.js, y que su HTML traiga
 * estos ids:
 *
 *   t-idea/l-idea, t-1/l-1, t-2/l-2, t-3/l-3, t-4/l-4  — los cinco bloques
 *   nodo            — el círculo con la pieza, en el centro del mapa
 *   tablero         — el div.board8 del diagrama
 *   jugadas         — donde va la lista "1. e4 e5"
 *   anuncio         — región viva para lector de pantalla
 *   posicion-escrita — el <p> dentro de <details class="en-palabras">
 *   pie-diagrama    — el pie de foto del tablero (F.diagrama)
 *   controles, b-inicio, b-atras, b-adelante, b-final
 *
 * Uso:  const visor = FichaRender.crear();
 *       visor.abrir(F);           // pinta la ficha F entera y arranca en la posición de salida
 *       visor.lineaDe(F)          // la línea completa de js/aperturas-lineas.js, o null
 */
window.FichaRender = (function () {
  "use strict";

  const GLYPH = {
    w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
    b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
  };
  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const PIEZAS_ES = { N: "C", B: "A", R: "T", Q: "D", K: "R" };
  const aEspanol = (san) => String(san).replace(/[NBRQK]/g, (l) => PIEZAS_ES[l]);
  const esClara = (sq) => ((sq.charCodeAt(0) - 97) + (parseInt(sq[1], 10) - 1)) % 2 === 1;

  const LINEAS_POR_ID = new Map((window.AperturasLineas ? window.AperturasLineas.LINEAS : []).map((L) => [L.id, L]));

  // De dónde sale la posición de cada ficha: de su propia línea, de una del
  // banco de aperturas, o de una FEN de estudio. Nunca de dos a la vez.
  function jugadasDe(F) {
    if (F.fen) return F.linea || [];
    if (F.jugadas) return F.jugadas;
    const L = LINEAS_POR_ID.get(F.lineaId);
    return L ? L.jugadas : [];
  }
  function lineaDe(F) {
    return F.lineaId ? LINEAS_POR_ID.get(F.lineaId) || null : null;
  }

  function dibujarPieza(cont, piece) {
    const span = document.createElement("span");
    span.setAttribute("aria-hidden", "true");
    if (window.PieceStyleThemes && window.PieceStyleThemes.getPreference() === "ilustrado" && window.ChessPieceSVG) {
      span.innerHTML = window.ChessPieceSVG.markup(piece.type, piece.color);
      span.className = "chess-piece-illustrated";
    } else {
      span.className = piece.color === "w" ? "piece-white" : "piece-black";
      span.textContent = GLYPH[piece.color][piece.type];
    }
    cont.appendChild(span);
  }

  function crear() {
    let fichaActual = null;
    let partida = null;
    let indice = 0; // cuántas jugadas de la línea se jugaron (0 = la posición de salida)

    function posicionEn(n) {
      const g = new Chess();
      if (fichaActual.fen) g.load(fichaActual.fen);
      const jugadas = jugadasDe(fichaActual);
      for (let i = 0; i < n; i++) g.move(jugadas[i], { sloppy: true });
      return g;
    }

    function dibujarTablero() {
      const board = document.getElementById("tablero");
      board.innerHTML = "";
      for (let rank = 8; rank >= 1; rank--) {
        for (let f = 0; f < 8; f++) {
          const square = FILES[f] + rank;
          const cell = document.createElement("div");
          cell.className = "sq " + (esClara(square) ? "light" : "dark");
          cell.dataset.square = square;
          const piece = partida.get(square);
          if (piece) dibujarPieza(cell, piece);
          board.appendChild(cell);
        }
      }
      if (window.Coordenadas) Coordenadas.aplicar(board);
    }

    function pintarJugadas() {
      const cont = document.getElementById("jugadas");
      const jugadas = jugadasDe(fichaActual);
      cont.innerHTML = "";
      // Una FEN de estudio no empieza en la jugada 1 de las blancas, así que su
      // línea se numera desde 1 pero sin prometer que sea la jugada 1 de la partida.
      const desdeElInicio = !fichaActual.fen;
      for (let i = 0; i < jugadas.length; i += (desdeElInicio ? 2 : 1)) {
        const par = document.createElement("span");
        par.className = "par";
        const numero = document.createElement("b");
        numero.textContent = (desdeElInicio ? (i / 2 + 1) : (i + 1)) + ".";
        par.appendChild(numero);
        const cuales = desdeElInicio ? [i, i + 1] : [i];
        cuales.forEach((idx) => {
          if (idx >= jugadas.length) return;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "jugada" + (idx === indice - 1 ? " actual" : "");
          if (idx === indice - 1) btn.setAttribute("aria-current", "step");
          btn.textContent = aEspanol(jugadas[idx]);
          btn.addEventListener("click", () => irA(idx + 1));
          par.appendChild(btn);
        });
        cont.appendChild(par);
      }
    }

    function irA(n) {
      const jugadas = jugadasDe(fichaActual);
      indice = Math.max(0, Math.min(n, jugadas.length));
      partida = posicionEn(indice);
      dibujarTablero();
      pintarJugadas();
      document.getElementById("b-inicio").disabled = indice === 0;
      document.getElementById("b-atras").disabled = indice === 0;
      document.getElementById("b-adelante").disabled = indice >= jugadas.length;
      document.getElementById("b-final").disabled = indice >= jugadas.length;
      const anuncio = document.getElementById("anuncio");
      if (indice === 0) {
        anuncio.textContent = jugadas.length ? "Posición de salida." : "";
      } else {
        anuncio.textContent = `Jugada ${indice} de ${jugadas.length}: ${aEspanol(jugadas[indice - 1])}.`;
      }
      // La posición contada pieza por pieza sale de BlindNotation, que es la única
      // tabla de nombres y plurales del sitio: escribirla acá otra vez sería otra
      // copia y se iría separando de las demás.
      const escrita = document.getElementById("posicion-escrita");
      if (escrita) escrita.textContent = window.BlindNotation ? window.BlindNotation.positionSentence(partida) : "";
    }

    function pintarMapa(F) {
      const titulos = (window.FichasEstudio ? window.FichasEstudio.TITULOS : {})[F.categoria] || [];
      const bloques = [F.centro].concat(F.bloques);
      ["idea", "1", "2", "3", "4"].forEach((slot, i) => {
        document.getElementById("t-" + slot).textContent = titulos[i] || "";
        const ul = document.getElementById("l-" + slot);
        ul.innerHTML = "";
        (bloques[i] || []).forEach((texto) => {
          const li = document.createElement("li");
          li.textContent = texto;
          ul.appendChild(li);
        });
      });
      const nodo = document.getElementById("nodo");
      nodo.innerHTML = "";
      dibujarPieza(nodo, { type: F.pieza, color: "b" });
    }

    function abrir(F) {
      fichaActual = F;
      const pie = document.getElementById("pie-diagrama");
      if (pie) pie.textContent = F.diagrama;
      pintarMapa(F);
      const jugadas = jugadasDe(F);
      const controles = document.getElementById("controles");
      if (controles) controles.style.display = jugadas.length ? "" : "none";
      irA(0);
    }

    document.getElementById("b-inicio").addEventListener("click", () => irA(0));
    document.getElementById("b-atras").addEventListener("click", () => irA(indice - 1));
    document.getElementById("b-adelante").addEventListener("click", () => irA(indice + 1));
    document.getElementById("b-final").addEventListener("click", () => irA(jugadasDe(fichaActual).length));

    return { abrir, irA, lineaDe };
  }

  return { crear, jugadasDe, lineaDe };
})();
