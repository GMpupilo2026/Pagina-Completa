/* ===== Ajedrez Integral — Arrastrar y soltar piezas en cualquier tablero =====
 *
 * Complementa (no reemplaza) el "clic origen, clic destino" que ya usa cada
 * tablero del sitio. Cada implementación de tablero ya tiene su propio
 * manejador de clic en las casillas, con toda la lógica de jugadas legales,
 * promoción, turnos, etc. resuelta ahí — este archivo NO reimplementa nada
 * de eso. Lo único que hace es traducir un gesto de arrastrar en la MISMA
 * secuencia de "clics" que la página ya sabe procesar, así que hereda gratis
 * toda esa validación y nunca puede quedar desincronizado de ella.
 *
 * Se usa con eventos de puntero (pointerdown/move/up) en vez de la API nativa
 * de arrastrar y soltar del navegador porque esta última se comporta de forma
 * inconsistente en pantallas táctiles (celular/tablet) — con eventos de
 * puntero, mouse y dedo funcionan igual.
 *
 * Uso típico (dentro del script de cada página, después de tener el
 * contenedor del tablero en el DOM):
 *
 *   enableBoardDrag(document.getElementById('board'), {
 *     isDraggable: (square) => { ... true si hay algo que se pueda levantar ... },
 *     isSelected: (square) => selectedSquare === square,   // opcional
 *     onSquareClick: (square) => onSquareClick(square),
 *   });
 *
 * `isDraggable` decide TODO lo que haga falta (hay pieza, es tu turno, es tu
 * color, no está bloqueada, etc.) — este archivo no sabe nada de ajedrez.
 * `isSelected` evita el caso "ya había una casilla seleccionada por un clic
 * anterior y ahora la arrastro": sin este dato, llamar a onSquareClick(origen)
 * la deseleccionaría (toggle) en vez de mantenerla seleccionada camino al
 * destino. Si no se pasa, se asume que nunca hay una selección previa.
 *
 * `shouldStartDrag(pointerEvent)` (opcional) es una válvula de escape para el
 * tablero de Clases: el profesor ya usa un toque largo en pantallas táctiles
 * para dibujar flechas/círculos sobre el tablero (ver js/clases-board.js), y
 * un evento de puntero por toque dispara TANTO ese gesto como este. Ahí se
 * pasa `(e) => e.pointerType !== "touch"` para que el arrastre por toque no
 * le quite el gesto a la función de dibujar (el clic-clic y el mouse/lápiz sí
 * siguen funcionando igual). Si no se pasa, el arrastre se activa siempre.
 */
(function () {
  "use strict";

  function enableBoardDrag(boardEl, options) {
    if (!boardEl || !options || typeof options.onSquareClick !== "function") return;
    const attr = options.squareAttr || "square";
    const dataAttr = "data-" + attr;
    const DRAG_THRESHOLD = 6; // px — por debajo de esto se trata como un simple clic/toque

    let fromSquare = null;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let ghost = null;
    let suppressClick = false;

    function cellFor(square) {
      return boardEl.querySelector("[" + dataAttr + '="' + square + '"]');
    }

    function squareUnderPoint(x, y) {
      if (ghost) ghost.style.pointerEvents = "none";
      const el = document.elementFromPoint(x, y);
      const cell = el && el.closest("[" + dataAttr + "]");
      return cell && boardEl.contains(cell) ? cell.getAttribute(dataAttr) : null;
    }

    function makeGhost(square, x, y) {
      const cell = cellFor(square);
      if (!cell) return;
      const rect = cell.getBoundingClientRect();
      ghost = document.createElement("div");
      ghost.innerHTML = cell.innerHTML;
      ghost.setAttribute("aria-hidden", "true");
      const style = getComputedStyle(cell);
      Object.assign(ghost.style, {
        position: "fixed",
        left: "0",
        top: "0",
        width: rect.width + "px",
        height: rect.height + "px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: style.fontSize,
        pointerEvents: "none",
        zIndex: "9999",
        opacity: "0.85",
        willChange: "transform",
      });
      moveGhostTo(x, y, rect.width, rect.height);
      document.body.appendChild(ghost);
      cell.classList.add("dragging-from");
    }

    function moveGhostTo(x, y, w, h) {
      if (!ghost) return;
      ghost.style.transform = "translate(" + (x - w / 2) + "px," + (y - h / 2) + "px)";
    }

    function removeGhost() {
      if (ghost) {
        ghost.remove();
        ghost = null;
      }
      boardEl.querySelectorAll(".dragging-from").forEach(function (el) {
        el.classList.remove("dragging-from");
      });
    }

    function onPointerMove(e) {
      if (!fromSquare) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        dragging = true;
        makeGhost(fromSquare, e.clientX, e.clientY);
      }
      if (dragging && ghost) {
        const rect = ghost.getBoundingClientRect();
        moveGhostTo(e.clientX, e.clientY, rect.width, rect.height);
      }
    }

    function onPointerUp(e) {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
      const from = fromSquare;
      const wasDragging = dragging;
      fromSquare = null;
      dragging = false;
      if (!wasDragging) return; // toque simple: se deja el clic normal de la casilla
      const to = squareUnderPoint(e.clientX, e.clientY);
      removeGhost();
      // Evita que, tras soltar, el navegador dispare igual un "click" sintético
      // sobre la casilla de destino (repetiría la jugada que ya vamos a hacer).
      suppressClick = true;
      setTimeout(function () {
        suppressClick = false;
      }, 0);
      if (to && to !== from) {
        if (!(options.isSelected && options.isSelected(from))) {
          options.onSquareClick(from);
        }
        options.onSquareClick(to);
      }
      // Soltar sobre la misma casilla (o fuera del tablero) cancela el
      // arrastre sin cambiar nada, igual que en lichess/chess.com.
    }

    boardEl.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return; // solo botón izquierdo / toque
      if (options.shouldStartDrag && !options.shouldStartDrag(e)) return; // ver doc de shouldStartDrag más abajo
      const cell = e.target.closest("[" + dataAttr + "]");
      if (!cell || !boardEl.contains(cell)) return;
      const square = cell.getAttribute(dataAttr);
      if (!options.isDraggable(square)) return; // nada que levantar: se deja el clic normal
      fromSquare = square;
      startX = e.clientX;
      startY = e.clientY;
      dragging = false;
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("pointercancel", onPointerUp);
    });

    // Captura el clic ANTES de que llegue al manejador propio de la casilla
    // (que sigue existiendo tal cual, para el clic-clic de siempre) y lo
    // descarta solo cuando venía justo después de soltar un arrastre real.
    boardEl.addEventListener(
      "click",
      function (e) {
        if (suppressClick) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
      true
    );
  }

  window.enableBoardDrag = enableBoardDrag;
})();
