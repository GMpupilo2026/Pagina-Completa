/* ===== Ajedrez Integral — Elegir la pieza al coronar, en TODOS los tableros =====
 *
 * Un peón que llega a la última fila se puede convertir en dama, torre, alfil
 * o caballo, y la elección es de quien juega. Varios tableros del sitio (la
 * clase en vivo, los torneos, el bot, los exámenes, Racha táctica, ¡Te reto!,
 * el diagnóstico, Aprender, Prácticas y Tipos de entrenamiento) mandaban
 * `promotion: "q"` fijo: el peón se volvía dama siempre, sin preguntar. No
 * daba ningún error; solo que la subpromoción —la que a veces es la única que
 * gana, o la única que no ahoga— no se podía jugar.
 *
 * Esto es la ÚNICA pregunta «¿en qué pieza coronas?», escrita una vez:
 *
 *   Coronacion.hayQueElegir(juego, desde, hasta)
 *       → true si de `desde` a `hasta` hay una jugada legal que corona.
 *       `juego` es una partida de chess.js (o algo con el mismo `moves()`).
 *
 *   Coronacion.pedir(color, alElegir)
 *       Abre el diálogo y llama `alElegir("q"|"r"|"b"|"n")`, o
 *       `alElegir(null)` si se canceló (Escape o «Cancelar»): la jugada no
 *       se hace y el tablero queda como estaba. También devuelve una promesa
 *       con lo mismo, para quien prefiera `await`.
 *
 * Cada botón lleva la pieza dibujada como la eligió el alumno
 * (js/pieza-preferida.js) y su nombre escrito: la pieza nunca va sola. Es un
 * <dialog> con showModal(), que encierra el foco y cierra con Escape; el foco
 * arranca en la dama y vuelve a donde estaba al cerrar.
 *
 * herramientas/tablero-cabecera.py lo pone en toda página con tablero.
 */
(function () {
  "use strict";
  if (window.Coronacion) return;

  const PIEZAS = ["q", "r", "b", "n"];
  const NOMBRE = { q: "Dama", r: "Torre", b: "Alfil", n: "Caballo" };
  const GLYPH = {
    w: { q: "♕", r: "♖", b: "♗", n: "♘" },
    b: { q: "♛", r: "♜", b: "♝", n: "♞" },
  };

  const BTN_BASE = "rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-brand-900";
  const BTN_PIEZA = BTN_BASE + " flex flex-col items-center justify-center gap-1 w-16 sm:w-20 py-2 bg-brand-50 dark:bg-brand-800 text-brand-800 dark:text-white border border-brand-200 dark:border-brand-700 hover:border-accent-400";
  const BTN_CANCELAR = BTN_BASE + " font-semibold px-4 py-2 text-sm border border-brand-200 dark:border-brand-700 text-brand-700 dark:text-brand-200 hover:border-accent-400";

  function el(tag, clases, texto) {
    const n = document.createElement(tag);
    if (clases) n.className = clases;
    if (texto != null) n.textContent = texto;
    return n;
  }

  function hayQueElegir(juego, desde, hasta) {
    if (!juego || !desde || !hasta) return false;
    let jugadas = [];
    try { jugadas = juego.moves({ square: desde, verbose: true }) || []; } catch (e) { return false; }
    return jugadas.some((m) => m.to === hasta && (m.promotion || (m.flags && m.flags.indexOf("p") !== -1)));
  }

  let serie = 0;

  function pedir(color, alElegir) {
    color = color === "b" ? "b" : "w";
    return new Promise((resolver) => {
      const antes = document.activeElement;
      const id = "coronacion-" + (++serie);
      const d = el("dialog", "coronacion-dialogo w-[calc(100%-2rem)] max-w-sm rounded-2xl shadow-2xl p-0 bg-white dark:bg-brand-900 text-brand-800 dark:text-white backdrop:bg-black/50");
      const form = el("form", "p-5 flex flex-col items-center gap-4");
      form.method = "dialog";
      const titulo = el("h2", "font-serif text-lg font-bold text-center", "¿En qué pieza coronas?");
      titulo.id = id + "-titulo";
      d.setAttribute("aria-labelledby", titulo.id);
      form.appendChild(titulo);

      let listo = false;
      function terminar(pieza) {
        if (listo) return;
        listo = true;
        if (d.open) d.close();
        d.remove();
        if (antes && typeof antes.focus === "function" && document.contains(antes)) {
          try { antes.focus({ preventScroll: true }); } catch (e) { /* nada */ }
        }
        if (typeof alElegir === "function") alElegir(pieza);
        resolver(pieza);
      }

      const fila = el("div", "flex flex-wrap justify-center gap-2");
      const botones = PIEZAS.map((p) => {
        const b = el("button", BTN_PIEZA);
        b.type = "button";
        b.dataset.pieza = p;
        const figura = el("span", "text-4xl leading-none");
        figura.setAttribute("aria-hidden", "true");
        if (window.PiezaPreferida) window.PiezaPreferida.pintar(figura, p, color, { clase: "text-4xl leading-none" });
        else {
          figura.textContent = GLYPH[color][p];
          figura.className = "text-4xl leading-none " + (color === "w" ? "piece-white" : "piece-black");
        }
        b.appendChild(figura);
        b.appendChild(el("span", "text-xs font-semibold", NOMBRE[p]));
        b.addEventListener("click", () => terminar(p));
        fila.appendChild(b);
        return b;
      });
      form.appendChild(fila);

      const cancelar = el("button", BTN_CANCELAR, "Cancelar");
      cancelar.type = "button";
      cancelar.addEventListener("click", () => terminar(null));
      form.appendChild(cancelar);

      // Escape: el navegador cierra el diálogo; acá se avisa que no se eligió nada.
      d.addEventListener("cancel", (e) => { e.preventDefault(); terminar(null); });
      d.addEventListener("close", () => terminar(null));

      // Flechas para pasar de una pieza a otra, como en un grupo de botones.
      fila.addEventListener("keydown", (e) => {
        const i = botones.indexOf(document.activeElement);
        if (i < 0) return;
        let j = -1;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % botones.length;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + botones.length) % botones.length;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = botones.length - 1;
        if (j < 0) return;
        e.preventDefault();
        botones[j].focus();
      });

      d.appendChild(form);
      document.body.appendChild(d);
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
      botones[0].focus();
    });
  }

  window.Coronacion = { hayQueElegir, pedir, NOMBRE };
})();
