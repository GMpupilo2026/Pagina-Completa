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

  /* Lo que se escribe en la pista se lee en voz alta (lector de pantalla o
     «Activar voz»): «Jugaste enroque corto», no «Jugaste O-O», que se lee
     letra por letra. Si la página no carga js/blind-notation.js, queda la
     notación de siempre. */
  function casillaDicha(sq) {
    return window.BlindNotation && BlindNotation.squareSpoken ? BlindNotation.squareSpoken(sq) : sq;
  }
  function jugadaDicha(san) {
    return window.BlindNotation && BlindNotation.sanSpoken ? BlindNotation.sanSpoken(san).replace(/^\S/, (c) => c.toLowerCase()) : san;
  }

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
          /* Bloqueado NO es `disabled`: un botón deshabilitado no recibe el
             foco, y el tablero de una pregunta de opción (o ya contestada)
             quedaba imposible de recorrer con el teclado — justo el tablero
             que hay que mirar para contestar. Se dice con aria-disabled y el
             clic simplemente no hace nada. */
          if (bloqueado) btn.setAttribute("aria-disabled", "true");
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
            if (window.PiezaPreferida) PiezaPreferida.pintar(span, pieza.type, pieza.color);
            else {
              span.className = pieza.color === "w" ? "piece-white" : "piece-black";
              span.textContent = GLYPH[pieza.color][pieza.type];
            }
            span.setAttribute("aria-hidden", "true");
            btn.appendChild(span);
          }
          // Qué dice cada casilla lo escribe js/tablero-accesible.js: eran 64
          // botones mudos, o sea un tablero que con lector de pantalla no se
          // podía ni mirar, en preguntas que hablan justamente de él.
          if (destacadas && destacadas.includes(sq)) btn.dataset.estado = "elegida";
          if (!bloqueado) btn.addEventListener("click", () => clic(sq));
          nodo.appendChild(btn);
        }
      }
      // Las coordenadas se repintan solas con su observador, pero la
      // primera vez hay que pedirlas.
      if (window.Coordenadas) window.Coordenadas.aplicar(nodo);
      montarTeclado();
    }

    /* Una sola parada de tabulador para todo el tablero y las flechas por
       dentro, más los atajos de una tecla en Modo Adaptado. Antes eran 64
       paradas de tabulador entre el enunciado y el botón de "Siguiente". */
    let teclado = null;
    function montarTeclado() {
      if (teclado || !window.TableroAccesible) return;
      teclado = TableroAccesible.montar(nodo, {
        nombre: "Tablero de la pregunta",
        juego: juego,
      });
    }

    function clic(sq) {
      if (bloqueado) return;
      const g = juego();

      if (tipo === "casilla") {
        respuesta = { casilla: sq };
        pintar([sq]);
        if (op.alSeleccionar) op.alSeleccionar(respuesta, "Elegiste " + casillaDicha(sq) + ".");
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

      if (window.Coronacion && Coronacion.hayQueElegir(g, origen, sq)) {
        // El peón corona: la pieza la elige quien contesta (js/coronacion.js).
        const desde = origen;
        origen = null;
        pintar();
        Coronacion.pedir(g.turn(), (elegida) => {
          if (elegida && !bloqueado) responder(g, g.move({ from: desde, to: sq, promotion: elegida }));
        });
        return;
      }
      const mov = g.move({ from: origen, to: sq });
      if (!mov) {
        // Tocar otra pieza propia cambia de pieza, en vez de no hacer nada.
        if (pieza && pieza.color === g.turn()) { origen = null; clic(sq); }
        return;
      }
      responder(g, mov);
    }

    function responder(g, mov) {
      if (!mov) return;
      respuesta = { from: mov.from, to: mov.to, promotion: mov.promotion || null, san: mov.san };
      origen = null;
      pintar([mov.from, mov.to]);
      if (op.alSeleccionar) op.alSeleccionar(respuesta, "Jugaste " + jugadaDicha(mov.san) + ".");
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

    /* La respuesta ESCRITA (el recuadro de comandos del examen): «e4» o
       «eva 4» en una de casilla, «Cf3» o «enroque corto» en una de jugada.
       Devuelve lo que se entendió, o null. La jugada se busca entre las
       legales (ComandosTablero.jugadaEscrita), igual que en Entrenamiento. */
    function escribir(texto) {
      if (bloqueado) return null;
      if (tipo === "casilla") {
        const sq = window.CuadroComandos ? CuadroComandos.casillaPedida(texto) : null;
        if (!sq) return null;
        clic(sq);
        return respuesta;
      }
      if (tipo !== "jugada" || !window.ComandosTablero) return null;
      const g = juego();
      const mv = ComandosTablero.jugadaEscrita(g, texto);
      if (!mv) return null;
      origen = null;
      responder(g, g.move({ from: mv.from, to: mv.to, promotion: mv.promotion || undefined }));
      return respuesta;
    }

    function cargar(nuevoFen) { fen = nuevoFen; origen = null; respuesta = null; pintar(); }
    function bloquear() { bloqueado = true; origen = null; pintar(respuesta ? destacadasDe(respuesta) : null); }
    function destacadasDe(r) { return r.casilla ? [r.casilla] : [r.from, r.to]; }

    pintar();
    return {
      pintar, aplicar, cargar, bloquear, escribir,
      teclado: () => teclado,
      tipo: () => tipo,
      fen: () => fen,
      respuesta: () => respuesta,
      turno: () => juego().turn(),
    };
  }

  return { montar, GLYPH };
})();
