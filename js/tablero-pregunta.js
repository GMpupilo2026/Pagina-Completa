/* ===== El tablero de una pregunta con respuesta =====
 *
 * Dibuja una posición y recoge UNA respuesta: una jugada (pieza y
 * destino) o una casilla. No sabe si está bien — eso lo decide quien
 * lo monta, y en un examen lo decide el servidor.
 *
 * Existe por la misma razón que js/cuadro-comandos.js: esto ya estaba
 * escrito dentro de `entreno/diagnostico.html`, acoplado a su
 * `itemActual` y a su cuadro de comandos. Este archivo es para las
 * páginas que no lo tienen —`examen.html`— y para que la siguiente no
 * lo escriba por tercera vez. El diagnóstico sigue con el suyo: moverlo
 * ahora arriesgaría `verificar-diagnostico.js` y
 * `verificar-cuadro-comandos.js` por un cambio que no se pidió, así que
 * unificarlos queda anotado como tarea aparte.
 *
 * Uso:
 *   const t = TableroPregunta.montar(document.getElementById('board'), {
 *     fen, tipo: 'jugada' | 'casilla' | 'mirar',
 *     alSeleccionar(respuesta) { ... }    // {from,to,san} o {casilla}
 *   });
 *   t.bloquear();   // una vez respondida, no se toca más
 */
window.TableroPregunta = (function () {
  "use strict";

  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const GLYPH = {
    w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
    b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
  };

  function esClara(sq) {
    return ((sq.charCodeAt(0) - 97) + (parseInt(sq[1], 10) - 1)) % 2 === 1;
  }

  function montar(nodo, op) {
    const tipo = op.tipo || "mirar";
    let fen = op.fen;
    let origen = null;
    let bloqueado = tipo === "mirar";
    let respuesta = null;

    function juego() { return new Chess(fen); }

    function pintar(destacadas) {
      const g = juego();
      nodo.innerHTML = "";
      for (let rank = 8; rank >= 1; rank--) {
        for (const f of FILES) {
          const sq = f + rank;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.dataset.square = sq;
          btn.disabled = bloqueado;
          let cls = "flex items-center justify-center select-none w-full h-full text-2xl sm:text-3xl md:text-4xl " +
            (esClara(sq) ? "bg-brand-100 " : "bg-brand-500 ") +
            (bloqueado ? "cursor-default " : "cursor-pointer ");
          if (destacadas && destacadas.includes(sq)) {
            cls += "outline outline-4 -outline-offset-4 outline-accent-500 ";
          }
          btn.className = cls;
          const pieza = g.get(sq);
          if (pieza) {
            const span = document.createElement("span");
            span.className = pieza.color === "w" ? "piece-white" : "piece-black";
            span.textContent = GLYPH[pieza.color][pieza.type];
            span.setAttribute("aria-hidden", "true");
            btn.appendChild(span);
          }
          if (!bloqueado) btn.addEventListener("click", () => clic(sq));
          nodo.appendChild(btn);
        }
      }
      // Las coordenadas se repintan solas con su observador, pero la
      // primera vez hay que pedirlas.
      if (window.Coordenadas) window.Coordenadas.aplicar(nodo);
    }

    function clic(sq) {
      if (bloqueado) return;
      const g = juego();

      if (tipo === "casilla") {
        respuesta = { casilla: sq };
        pintar([sq]);
        if (op.alSeleccionar) op.alSeleccionar(respuesta, "Elegiste " + sq + ".");
        return;
      }

      const pieza = g.get(sq);
      if (!origen) {
        if (!pieza || pieza.color !== g.turn()) return;
        origen = sq;
        const destinos = g.moves({ square: sq, verbose: true }).map((m) => m.to);
        pintar([sq].concat(destinos));
        return;
      }
      if (sq === origen) { origen = null; pintar(); return; }

      const mov = g.move({ from: origen, to: sq, promotion: "q" });
      if (!mov) {
        // Tocar otra pieza propia cambia de pieza, en vez de no hacer nada.
        if (pieza && pieza.color === g.turn()) { origen = null; clic(sq); }
        return;
      }
      respuesta = { from: mov.from, to: mov.to, promotion: mov.promotion || null, san: mov.san };
      origen = null;
      pintar([mov.from, mov.to]);
      if (op.alSeleccionar) op.alSeleccionar(respuesta, "Jugaste " + mov.san + ".");
    }

    /* Avanzar la posición sin recoger respuesta: lo usa la línea de
       apertura para contestar por el rival. */
    function aplicar(san) {
      const g = juego();
      const mov = g.move(san);
      if (!mov) return null;
      fen = g.fen();
      pintar([mov.from, mov.to]);
      return mov;
    }

    function cargar(nuevoFen) { fen = nuevoFen; origen = null; respuesta = null; pintar(); }
    function bloquear() { bloqueado = true; origen = null; pintar(respuesta ? destacadasDe(respuesta) : null); }
    function destacadasDe(r) { return r.casilla ? [r.casilla] : [r.from, r.to]; }

    pintar();
    return {
      pintar, aplicar, cargar, bloquear,
      fen: () => fen,
      respuesta: () => respuesta,
      turno: () => juego().turn(),
    };
  }

  return { montar, GLYPH };
})();
