/* ===== Ajedrez Integral — la clase en vivo, sin ver la pantalla =====
 *
 * La clase en vivo era la única parte del sitio que no se podía seguir con lector
 * de pantalla, y era justamente la más importante: la clase. No daba ningún
 * error. El tablero se pintaba y se movía para quien lo veía. Para quien no:
 *
 *   - cuando el alumno no tenía el control, las 64 casillas quedaban fuera del
 *     teclado, así que no había forma de MIRAR la posición que el profesor
 *     estaba explicando;
 *   - cuando el profesor movía, no se anunciaba nada: el tablero cambiaba en
 *     silencio;
 *   - y la pregunta y la práctica contra el motor solo se contestaban tocando
 *     piezas.
 *
 * Esto le pone a cada tablero de la clase (la pizarra, la pregunta y la práctica)
 * el mismo recuadro de Entrenamiento (js/cuadro-comandos.js): se escribe la jugada
 * ("Cf3") o una pregunta ("posición", "caballos", "qué hay en e4"), y las
 * jugadas del otro lado se anuncian. Con el mismo vocabulario que el resto del
 * sitio, porque un tercer idioma para la clase sería otro que aprender.
 *
 * Tres decisiones que no conviene deshacer:
 *
 * 1. LA JUGADA ESCRITA ENTRA POR LA MISMA PUERTA QUE EL CLIC (`board.jugar()` de
 *    js/clases-board.js). Si tuviera la suya, el día que cambiara el clic la
 *    jugada escrita dejaría de contar como respuesta a la pregunta, o de llegarle
 *    al profesor, y no fallaría nada.
 *
 * 2. SE ANUNCIA LA JUGADA, NO LA POSICIÓN. La posición queda escrita encima del
 *    recuadro (muda: `posicionViva: false`) y se pide con "posición". Dictar las
 *    treinta y dos piezas en cada jugada del profesor tapa lo único que cambió.
 *    Es la misma corrección que ya se hizo en las partidas de Juegos.
 *
 * 3. CON LAS PIEZAS OCULTAS NO SE DICE NADA DE LA POSICIÓN. "Ocultar" es un
 *    ejercicio de ver el tablero de memoria: si el recuadro contestara
 *    "caballos", quien usa lector de pantalla tendría el ejercicio resuelto y los
 *    demás no. Se dice qué pasa y que la jugada se anuncia igual, que es lo que
 *    ven los demás.
 *
 * Lo que decide si se VE es el CSS (`html.adaptive-mode`, vía js/cuadro-comandos.js):
 * fuera del Modo Adaptado el recuadro no está, y su región viva tampoco habla
 * (una región con display:none no se anuncia).
 *
 * Uso:
 *     const acc = ClaseAdaptada.montar(destino, () => board, {
 *       etiqueta: "Escribe tu jugada o una pregunta sobre la posición",
 *       porQueNoPuedes: () => "Ahora mueve tu profe.",
 *     });
 *     acc.actualizar();                    // después de cada cambio de posición
 *     acc.anunciarCambio(antes, despues);  // {fen, moves} → "Se jugó caballo felix 3."
 */
window.ClaseAdaptada = (function () {
  "use strict";

  function hablarJugada(san) {
    return window.BlindNotation && BlindNotation.sanSpoken ? BlindNotation.sanSpoken(san) : san;
  }

  function turnoDicho(g) {
    if (!g || !g.turn) return "";
    try {
      if (g.in_checkmate && g.in_checkmate()) return "Jaque mate.";
      if (g.in_stalemate && g.in_stalemate()) return "Tablas por ahogado.";
    } catch (e) {}
    return "Juegan " + (g.turn() === "w" ? "blancas" : "negras") + ".";
  }

  function montar(destino, getBoard, cfg) {
    if (!destino || !window.CuadroComandos) return null;
    cfg = cfg || {};
    var board = function () { return typeof getBoard === "function" ? getBoard() : getBoard; };
    function juegoVisible() {
      var b = board();
      if (!b || b.piecesHidden) return null;
      return b.viewGame || b.game;
    }

    /* "ir a e4" lleva el foco del teclado a esa casilla del tablero. */
    var tableroApi = {
      enfocar: function (sq) {
        var b = board();
        if (!b || !b.el) return false;
        b.focusSquare = sq;
        b.render();
        var celda = b.el.querySelector('[data-square="' + sq + '"]');
        if (!celda) return false;
        celda.focus();
        return true;
      },
    };

    var cmd = CuadroComandos.montar(destino, {
      etiqueta: cfg.etiqueta || "Escribe tu jugada o una pregunta sobre la posición",
      posicionViva: false,
      juego: juegoVisible,
      tablero: tableroApi,
      onEnviar: function (texto, api) {
        var b = board();
        if (!b) return;
        if (b.piecesHidden) {
          api.decir("Las piezas están ocultas: el ejercicio es verlas de memoria. "
            + "Las jugadas se siguen anunciando.");
          return;
        }
        if (!b.interactive) {
          api.decir((cfg.porQueNoPuedes && cfg.porQueNoPuedes()) || "Ahora no te toca mover.");
          return;
        }
        var g = b.viewGame || b.game;
        var mv = window.ComandosTablero && ComandosTablero.jugadaEscrita
          ? ComandosTablero.jugadaEscrita(g, texto) : null;
        if (!mv) {
          api.decir("\"" + texto.trim() + "\" no es una jugada legal en esta posición. "
            + "Escribe \"posición\" para oírla, o \"ayuda\" para ver qué se puede escribir.");
          return;
        }
        var hecha = b.jugar(mv);
        if (!hecha) { api.decir("No se pudo hacer esa jugada."); return; }
        api.limpiar();
        api.decir("Jugaste " + hablarJugada(hecha.san) + ".");
        actualizar();
      },
    });

    function actualizar() {
      var b = board();
      if (!b) return;
      if (b.piecesHidden) {
        cmd.posicion("Las piezas están ocultas: el ejercicio es ver el tablero de memoria.");
        return;
      }
      cmd.posicion(b.viewGame || b.game);
    }

    /* Qué cambió entre dos estados del tablero, dicho en una frase. `antes` y
       `despues` son {inicio, jugadas} — la FEN de salida y la lista de jugadas,
       que es lo que viaja por game_state. */
    function anunciarCambio(antes, despues) {
      var b = board();
      if (!b || !despues) return;
      var g = b.game;
      var texto;
      var mismaSalida = antes && (antes.inicio || "") === (despues.inicio || "");
      var a = (antes && antes.jugadas) || [], d = despues.jugadas || [];
      var prefijo = mismaSalida && a.every(function (m, i) { return d[i] === m; });
      if (!antes) {
        texto = "Tablero de la clase. " + turnoDicho(g);
      } else if (!mismaSalida) {
        texto = "Tu profe puso una posición nueva en el tablero. " + turnoDicho(g)
          + " Escribe \"posición\" para oírla.";
      } else if (prefijo && d.length > a.length) {
        texto = "Se jugó " + hablarJugada(d[d.length - 1]) + ". " + turnoDicho(g);
      } else if (d.length < a.length && d.every(function (m, i) { return a[i] === m; })) {
        texto = "Se deshizo " + (a.length - d.length === 1 ? "una jugada" : (a.length - d.length) + " jugadas")
          + ". " + turnoDicho(g);
      } else if (a.join(" ") === d.join(" ")) {
        return;   // no cambió la posición (flechas, control): nada que anunciar acá
      } else {
        texto = "Cambió la línea del tablero. " + turnoDicho(g);
      }
      if (b.piecesHidden && /posición nueva/.test(texto)) {
        texto = "Tu profe puso una posición nueva, con las piezas ocultas. " + turnoDicho(g);
      }
      cmd.decir("");
      window.setTimeout(function () { cmd.decir(texto); }, 60);
      actualizar();
    }

    actualizar();
    return {
      cmd: cmd,
      actualizar: actualizar,
      anunciarCambio: anunciarCambio,
      decir: function (t) { cmd.decir(""); window.setTimeout(function () { cmd.decir(t); }, 60); },
      enfocar: function () { cmd.enfocar(); },
    };
  }

  return { montar: montar, hablarJugada: hablarJugada };
})();
