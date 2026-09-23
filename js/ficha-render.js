/**
 * Ajedrez Integral — dibuja una FICHA de estudio (js/fichas-estudio.js): el
 * mapa de una sola pantalla (idea + cuatro bloques alrededor de la pieza) y,
 * abajo, el tablero que la explica, recorrible jugada por jugada.
 *
 * Lo usa entreno/estudio.html, las 56 fichas en sus cuatro categorías. Vive
 * aparte y no dentro de esa página porque antes estaba escrito dentro de
 * entreno/fichas.html —la página que se fusionó con Estudio— y corregirle algo
 * ahí no lo habría corregido en la otra.
 *
 * El tablero SE RECORRE con el teclado y se le puede preguntar: era
 * `aria-hidden`, o sea que para un lector de pantalla la posición de cada ficha
 * no existía, y lo único que quedaba era un desplegable al final del bloque que
 * había que abrir de nuevo después de cada jugada. Ver js/tablero-accesible.js.
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
 *   posicion-escrita  — el <p> de .en-palabras, pegado a los controles: es
 *                       región viva y dice LA JUGADA, no la posición entera
 *   posicion-completa — la posición pieza por pieza, ahí al lado y sin ser
 *                       región viva: se lee cuando se quiere, no en cada paso
 *   pie-diagrama    — el pie de foto del tablero (F.diagrama)
 *   controles, b-inicio, b-atras, b-adelante, b-final
 *   q-comandos      — donde se monta el recuadro (js/cuadro-comandos.js)
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
    if (window.PieceStyleThemes && window.PieceStyleThemes.esDibujado() && window.ChessPieceSVG) {
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

    let ultimaJugada = null;   // el objeto de chess.js de la jugada recién hecha

    function posicionEn(n) {
      const g = new Chess();
      if (fichaActual.fen) g.load(fichaActual.fen);
      const jugadas = jugadasDe(fichaActual);
      ultimaJugada = null;
      for (let i = 0; i < n; i++) ultimaJugada = g.move(jugadas[i], { sloppy: true });
      return g;
    }

    /* La jugada CONTADA: qué pieza, de dónde a dónde, si se come algo y si da
       jaque. Es lo que hace falta al recorrer una línea, y es lo único que se
       lee solo en cada paso.
       LA POSICIÓN ENTERA NO SE LEE EN CADA JUGADA, y ese es el punto: una
       apertura son doce jugadas y treinta y dos piezas, o sea trescientas
       ochenta y cuatro casillas dictadas para ver una línea que dura medio
       minuto. Nadie escucha eso — se apaga el lector de pantalla y se abandona
       la ficha. La posición completa se queda escrita debajo, para leerla
       cuando se quiera o pedirla con "posición". */
    function jugadaContada(mv) {
      if (!mv) return "";
      const B = window.BlindNotation;
      const donde = (sq) => (B && B.squareSpoken ? B.squareSpoken(sq) : sq);
      const NOMBRE = { k: "el rey", q: "la dama", r: "la torre", b: "el alfil", n: "el caballo", p: "el peón" };
      const color = mv.color === "w" ? "blanco" : "negro";
      const colorF = mv.color === "w" ? "blanca" : "negra";
      const fem = mv.piece === "q" || mv.piece === "r";
      if (mv.flags && mv.flags.indexOf("k") >= 0) return "Enroque corto de las " + (mv.color === "w" ? "blancas" : "negras") + ".";
      if (mv.flags && mv.flags.indexOf("q") >= 0) return "Enroque largo de las " + (mv.color === "w" ? "blancas" : "negras") + ".";
      let t = NOMBRE[mv.piece] + " " + (fem ? colorF : color) + " va de " + donde(mv.from) + " a " + donde(mv.to);
      if (mv.captured) t += " y se come " + NOMBRE[mv.captured];
      if (mv.promotion) t += " y corona " + NOMBRE[mv.promotion].replace(/^el |^la /, "");
      // La frase va detrás de un punto ("Jugada 3 de 12: Cf3. El caballo…"), así
      // que empieza en mayúscula: un lector de pantalla no lo nota, pero esto
      // también se lee con los ojos.
      // El jaque y el mate van DICHOS. El "+" del final de la notación no lo
      // lee nadie en voz alta, y es justo el dato que cambia cómo se mira la
      // posición que viene.
      const san = String(mv.san || "");
      if (/#$/.test(san)) t += " y es jaque mate";
      else if (/\+$/.test(san)) t += " y da jaque";
      t = t.charAt(0).toUpperCase() + t.slice(1);
      return t + ".";
    }

    function dibujarTablero() {
      const board = document.getElementById("tablero");
      board.innerHTML = "";
      for (let rank = 8; rank >= 1; rank--) {
        for (let f = 0; f < 8; f++) {
          const square = FILES[f] + rank;
          /* Un <button> y no un <div>: el tablero de la ficha se recorre con el
             teclado como cualquier otro del sitio, y un div no recibe el foco.
             No hace nada al pulsarlo —una ficha se mira, no se juega— pero
             enfocarlo es justamente lo que hace falta para poder mirarla sin
             ver. Qué dice cada casilla lo escribe js/tablero-accesible.js. */
          const cell = document.createElement("button");
          cell.type = "button";
          cell.className = "sq " + (esClara(square) ? "light" : "dark");
          cell.dataset.square = square;
          const piece = partida.get(square);
          if (piece) dibujarPieza(cell, piece);
          board.appendChild(cell);
        }
      }
      if (window.Coordenadas) Coordenadas.aplicar(board);
      montarTeclado();
    }

    /* El teclado del tablero y el recuadro donde se le pregunta. Se montan una
       vez y valen para todas las fichas: el tablero es el mismo nodo, lo que
       cambia es lo que tiene dentro. */
    let teclado = null;
    function montarTeclado() {
      if (teclado || !window.TableroAccesible) return;
      teclado = TableroAccesible.montar(document.getElementById("tablero"), {
        nombre: "Tablero de la ficha",
        juego: () => partida,
      });
    }

    let comandos = null;
    function montarComandos() {
      if (comandos || !window.CuadroComandos) return;
      const donde = document.getElementById("q-comandos");
      if (!donde) return;
      comandos = CuadroComandos.montar(donde, {
        etiqueta: "Recorre la línea o pregunta por la posición",
        juego: () => partida,
        tablero: () => teclado,
        onEnviar: recorrerEscribiendo,
      });
      comandos.ayuda('Recorrer: "siguiente", "anterior", "inicio", "final", "jugada 5". Preguntar: "caballos", "qué hay en e4". Escribe "ayuda" para todo.');
    }

    /* Recorrer la línea ESCRIBIENDO. Los cuatro botones ⏮ ◀ ▶ ⏭ están bien para
       el ratón, pero quien contesta desde el recuadro tendría que salir de él,
       tabular hasta el botón, volver y repetirlo en cada jugada. Acá "siguiente"
       avanza y la posición nueva se lee sola.
       Lo que NO es ninguna de estas palabras vuelve a js/comandos-tablero.js
       como pregunta, que ya lo atendió antes de llegar hasta acá. */
    function recorrerEscribiendo(texto, api) {
      const t = String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const total = jugadasDe(fichaActual).length;
      let n = null;
      if (/^(siguiente|sig|adelante|s|\+)$/.test(t)) n = indice + 1;
      else if (/^(anterior|atras|ant|a|-)$/.test(t)) n = indice - 1;
      else if (/^(inicio|principio|salida|empezar)$/.test(t)) n = 0;
      else if (/^(final|fin|ultima|ultimo)$/.test(t)) n = total;
      else {
        const m = t.match(/^(?:jugada|ir a la jugada|ir a)\s*(\d+)$/);
        if (m) n = parseInt(m[1], 10);
      }
      if (n === null) {
        api.decir(`No entendí "${texto}". Escribe "siguiente", "anterior", "jugada 5", o una pregunta como "caballos". Escribe "ayuda" para la lista.`);
        return;
      }
      if (n < 0) { api.decir("Ya estás en la posición de salida."); return; }
      if (n > total) { api.decir("Ya estás en la última jugada de la línea."); return; }
      api.limpiar().decir("");
      irA(n);
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
      const donde = indice === 0
        ? (jugadas.length ? "Posición de salida." : "")
        : `Jugada ${indice} de ${jugadas.length}: ${aEspanol(jugadas[indice - 1])}. ${jugadaContada(ultimaJugada)}`;
      /* Lo que se lee SOLO en cada jugada es la jugada. Se vacía y se repuebla
         con un retraso porque una región viva solo reacciona cuando el texto
         cambia: volver a la misma posición desde el otro lado no se anunciaría. */
      const escrita = document.getElementById("posicion-escrita");
      if (escrita) {
        escrita.textContent = "";
        window.setTimeout(function () { escrita.textContent = donde; }, 50);
      }
      /* Y la posición entera se queda escrita justo debajo, SIN ser región viva:
         está ahí para leerla cuando se quiera —o pedirla con "posición"— pero no
         se dicta sola en cada paso. La saca BlindNotation, que es la única tabla
         de nombres y plurales del sitio. */
      const todo = document.getElementById("posicion-completa");
      if (todo) todo.textContent = window.BlindNotation ? window.BlindNotation.positionSentence(partida) : "";
      const anuncio = document.getElementById("anuncio");
      if (anuncio) anuncio.textContent = donde;
      if (window.BlindNotation && window.BlindNotation.speak) window.BlindNotation.speak(donde);
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
      montarComandos();
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
