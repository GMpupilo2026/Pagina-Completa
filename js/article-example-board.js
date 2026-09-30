/* ===== Ajedrez Integral — Diagramas de ejemplo en los artículos =====
 * Cada artículo puede incluir una "tarjeta de ejemplo" con la posición que
 * ilustra su tema: <div class="example-card" data-fen="..."> con un
 * <div class="example-board"></div> y un <div class="example-readout">
 * dentro. El tablero se ve siempre; en Modo Adaptado se le suma debajo la
 * misma descripción de posición agrupada por color y tipo de pieza que ya usa
 * Ciegos/Entrenamiento (BlindNotation, js/blind-notation.js) — la notación de
 * columnas es la misma en todas partes del sitio.
 *
 * El diagrama SE RECORRE con el teclado (js/tablero-accesible.js, solo para
 * mirar): el contenedor era `role="img"`, y los hijos de una imagen no le
 * llegan al lector de pantalla, así que las 64 casillas rotuladas no se oían.
 * Ahora es una parada de Tab y adentro se anda con las flechas, igual que el
 * tablero de una ficha de Estudio. Y ya no se esconde en Modo Adaptado (ver
 * «El tablero ya no se esconde en Modo Adaptado»): un tablero se MIRA.
 *
 * Requiere chess.js y js/blind-notation.js cargados antes que este archivo.
 * js/tablero-accesible.js lo trae él mismo si la página no lo cargó: son
 * decenas de artículos, y sumar la línea a mano en cada uno es la clase de
 * cosa que se olvida en el siguiente.
 */
(function () {
  // De dónde se cargó este archivo: tablero-accesible.js vive al lado, y los
  // artículos están un nivel más abajo que el resto (../js/).
  const ESTE_SCRIPT = document.currentScript && document.currentScript.src;
  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const GLYPH = {
    p: { w: "♙", b: "♟" }, n: { w: "♘", b: "♞" }, b: { w: "♗", b: "♝" },
    r: { w: "♖", b: "♜" }, q: { w: "♕", b: "♛" }, k: { w: "♔", b: "♚" },
  };
  const NOMBRE = { k: "rey", q: "dama", r: "torre", b: "alfil", n: "caballo", p: "peón" };

  function casillaDicha(sq) {
    return window.BlindNotation && BlindNotation.squareSpoken ? BlindNotation.squareSpoken(sq) : sq;
  }
  function piezaDicha(p) {
    const fem = p.type === "q" || p.type === "r";
    return NOMBRE[p.type] + " " + (p.color === "w" ? (fem ? "blanca" : "blanco") : (fem ? "negra" : "negro"));
  }

  /* `opciones.accesible`: el tablero lo va a rotular js/tablero-accesible.js,
     que les da a las casillas su rol de control y el foco. Sin eso (la vista
     previa de sesion.html, Precisión posicional) cada casilla se queda como
     imagen con su nombre, que es lo mejor que se puede sin teclado. */
  function renderBoard(el, game, opciones) {
    const accesible = !!(opciones && opciones.accesible);
    el.innerHTML = "";
    for (let rank = 8; rank >= 1; rank--) {
      for (let f = 0; f < 8; f++) {
        const square = FILES[f] + rank;
        // OJO: la paridad se calcula con (rank - 1), no con rank tal cual — h1 debe ser
        // una casilla clara (como en el tablero real y en ClasesBoard, ver isLightSquare()
        // en clases-board.js) y "rank" aquí ya viene en base 1 (8..1), no en base 0. Usarlo
        // sin el -1 invierte el color de las 64 casillas del diagrama.
        const light = (f + (rank - 1)) % 2 === 1;
        const sq = document.createElement("div");
        sq.className = "example-sq " + (light ? "example-sq-light" : "example-sq-dark");
        sq.dataset.square = square;   // de aquí lee js/coordenadas-tablero.js
        const piece = game.get(square);
        /* Qué hay en la casilla, dicho como en todo el sitio («eva 4, caballo
           blanco»): sin esto, fuera del Modo Adaptado el diagrama era mudo para
           el lector de pantalla, y «Activar voz» no tenía qué leer. */
        if (!accesible) sq.setAttribute("role", "img");
        sq.setAttribute("aria-label", casillaDicha(square) + ", " + (piece ? piezaDicha(piece) : "vacía"));
        if (piece) {
          const span = document.createElement("span");
          span.setAttribute("aria-hidden", "true");
          if (window.PiezaPreferida) {
            PiezaPreferida.pintar(span, piece.type, piece.color);
          } else if (window.PieceStyleThemes && window.PieceStyleThemes.esDibujado() && window.ChessPieceSVG) {
            span.innerHTML = window.ChessPieceSVG.markup(piece.type, piece.color);
            span.className = "chess-piece-illustrated";
          } else {
            span.className = piece.color === "w" ? "piece-white" : "piece-black";
            span.textContent = GLYPH[piece.type][piece.color];
          }
          sq.appendChild(span);
        }
        el.appendChild(sq);
      }
    }
    sizePieces(el);
    if (window.Coordenadas) Coordenadas.aplicar(el);   // letras y números por fuera
  }

  // El tamaño de pieza NO se fija en CSS con vw (min(6vw,28px) queda atado al ancho de
  // la VENTANA, no al del propio tablero — que cada artículo puede envolver en un
  // .example-board-wrap más angosto o más ancho con max-w-[Npx]): con eso la pieza queda
  // desproporcionada al tamaño real de la casilla y "se ve mal". En su lugar se mide el
  // ancho ya renderizado de una casilla y se fija el font-size como fracción de ese
  // ancho, igual que hace ClasesBoard con sus miniaturas (ver _sizeCompactPieces en
  // clases-board.js) — así queda bien en cualquier ancho de tablero.
  function sizePieces(el) {
    requestAnimationFrame(() => {
      const square = el.querySelector(".example-sq");
      if (!square) return;
      const cellWidth = square.getBoundingClientRect().width;
      if (!cellWidth) return;
      const fontPx = Math.max(14, Math.min(cellWidth * 0.62, 32));
      el.querySelectorAll(".example-sq").forEach((sq) => { sq.style.fontSize = fontPx + "px"; });
    });
  }

  function setActive(btn, active) {
    btn.setAttribute("aria-pressed", String(active));
    btn.classList.toggle("bg-accent-500", active);
    btn.classList.toggle("text-brand-900", active);
    btn.classList.toggle("bg-white", !active);
    btn.classList.toggle("dark:bg-brand-900", !active);
    btn.classList.toggle("text-brand-500", !active);
    btn.classList.toggle("dark:text-brand-400", !active);
  }

  function setupCard(card) {
    const fen = card.getAttribute("data-fen");
    if (!fen || typeof Chess === "undefined") return;
    let game;
    try { game = new Chess(fen); } catch (e) { return; }

    const boardWrap = card.querySelector(".example-board-wrap");
    const boardEl = card.querySelector(".example-board");
    const readoutEl = card.querySelector(".example-readout");
    const normalBtn = card.querySelector('[data-mode="normal"]');
    const adaptedBtn = card.querySelector('[data-mode="adaptado"]');
    if (!boardEl || !readoutEl) return;

    /* Un `role="img"` en el contenedor tapa todo lo de adentro: se quita aunque
       el HTML lo traiga, para que ningún artículo viejo vuelva a dejar el
       diagrama mudo. El nombre ("Diagrama de ejemplo") se queda: pasa a ser el
       del tablero. */
    if (boardEl.getAttribute("role") === "img") boardEl.removeAttribute("role");
    renderBoard(boardEl, game, { accesible: true });
    conTableroAccesible(function () {
      TableroAccesible.montar(boardEl, { nombre: "Diagrama de ejemplo", juego: () => game });
    });

    function applyMode(adapted) {
      // El tablero se queda a la vista en los dos modos: lo que suma el
      // adaptado es la posición escrita debajo.
      if (boardWrap) boardWrap.classList.remove("hidden");
      readoutEl.classList.toggle("hidden", !adapted);
      if (adapted && window.BlindNotation) {
        readoutEl.innerHTML = window.BlindNotation.groupedReadoutHTML(game);
      }
      if (normalBtn) setActive(normalBtn, !adapted);
      if (adaptedBtn) setActive(adaptedBtn, adapted);
    }

    if (normalBtn) normalBtn.addEventListener("click", () => applyMode(false));
    if (adaptedBtn) adaptedBtn.addEventListener("click", () => applyMode(true));

    /* Arranca como está el Modo Adaptado del sitio AHORA, leído de la clase del
       <html> (la pone js/adaptive-mode.js) y no del localStorage: así vale
       también el modo que se adivinó solo (contraste del sistema, primer Tab),
       que no se guarda. Y sigue al modo cuando se cambia desde la cabecera u
       otra pestaña. Los dos botones de la tarjeta siguen siendo solo de este
       ejemplo: no cambian el modo del sitio. */
    applyMode(document.documentElement.classList.contains("adaptive-mode"));
    document.addEventListener("adaptivemode:change", function (ev) {
      const activo = ev.detail && typeof ev.detail.activo === "boolean"
        ? ev.detail.activo
        : document.documentElement.classList.contains("adaptive-mode");
      applyMode(activo);
    });
  }

  // Trae js/tablero-accesible.js si la página no lo cargó, una sola vez.
  let esperando = null;
  function conTableroAccesible(listo) {
    if (window.TableroAccesible) { listo(); return; }
    if (!esperando) {
      esperando = [];
      const s = document.createElement("script");
      s.src = ESTE_SCRIPT ? new URL("tablero-accesible.js", ESTE_SCRIPT).href : "/js/tablero-accesible.js";
      s.onload = function () { const xs = esperando; esperando = []; xs.forEach(function (f) { f(); }); };
      document.head.appendChild(s);
    }
    esperando.push(listo);
  }

  /* Y js/comandos-tablero.js, que es el que pone la posición en palabras:
     Alt + Mayúscula + B (js/vision-cuenta.js) le pide la posición al diagrama
     a través de él, y los artículos no lo cargaban — el diagrama tenía su
     partida y aun así se oía «no hay una posición que decir». */
  function conComandosTablero() {
    if (window.ComandosTablero || document.querySelector("script[data-comandos-tablero]")) return;
    const s = document.createElement("script");
    s.src = ESTE_SCRIPT ? new URL("comandos-tablero.js", ESTE_SCRIPT).href : "/js/comandos-tablero.js";
    s.setAttribute("data-comandos-tablero", "");
    document.head.appendChild(s);
  }

  document.addEventListener("DOMContentLoaded", function () {
    const tarjetas = document.querySelectorAll(".example-card[data-fen]");
    tarjetas.forEach(setupCard);
    if (tarjetas.length) conTableroAccesible(conComandosTablero);
  });

  // El diagrama en sí (tablero de 8x8, con el tamaño de pieza MEDIDO sobre la
  // casilla ya renderizada) sirve fuera de los artículos: la vista previa de
  // Táctica de sesion.html lo usa para enseñar la posición de un ejercicio antes
  // de mandársela a la clase. Se exporta en vez de copiarlo allá — la copia que
  // había ya se había separado de este original: dibujaba las piezas con un
  // font-size fijo de 24px dentro de casillas de 22, así que se salían de su
  // casilla, y no entendía el juego de piezas ilustrado.
  window.ExampleBoard = { render: renderBoard, sizePieces: sizePieces };
})();
