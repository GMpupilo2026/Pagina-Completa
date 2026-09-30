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

  /* La voz del navegador (js/blind-notation.js): solo habla si la persona la
     encendió con «Activar voz». Con lector de pantalla se deja apagada, y
     entonces esto no hace nada. */
  function hablar(texto) {
    if (!texto || !window.BlindNotation || !BlindNotation.speak) return;
    // Los emojis son adorno: la voz los leería en inglés ("warning sign").
    BlindNotation.speak(String(texto).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim());
  }

  /* "12. Cf3 Cc6 13. Ab5": las jugadas de `path` desde la número `desde`,
     numeradas según la posición de salida (`startFen`). */
  function numerarJugadas(path, desde, startFen) {
    var numero = 1, turno = "w";
    try {
      var partes = (startFen || "").split(" ");
      if (partes[1] === "b") turno = "b";
      if (parseInt(partes[5], 10) > 0) numero = parseInt(partes[5], 10);
    } catch (e) {}
    var textos = [];
    path.forEach(function (san, i) {
      if (i >= desde) {
        if (turno === "w") textos.push(numero + ". " + san);
        else textos.push(i === desde ? numero + "… " + san : san);
      }
      if (turno === "b") numero++;
      turno = turno === "w" ? "b" : "w";
    });
    return textos.join(" ");
  }

  /* Qué está mostrando el profe (game_state.vista), dicho para quien lo sigue.
     `principal` son las jugadas de la partida en vivo. null = la posición en
     vivo. Lo usan la clase (sesion.js) y la de los invitados (ver-clase.js). */
  function describirVista(vista, principal, startFen) {
    if (!vista || !Array.isArray(vista.path)) return null;
    var root = Math.max(0, Math.min(vista.root || 0, vista.path.length));
    // Una respuesta que el profe le muestra a la clase.
    if (vista.respuesta && typeof vista.respuesta === "object") {
      var quien = vista.respuesta.nombre ? String(vista.respuesta.nombre) : "un compañero";
      return "📺 Así lo resolvió " + quien + ": " + numerarJugadas(vista.path, root, startFen) + ".";
    }
    principal = principal || [];
    var esVariante = vista.path.length > root || vista.path.some(function (san, i) { return principal[i] !== san; });
    if (!esVariante) {
      return vista.path.length
        ? "Tu profe volvió a una jugada anterior: " + numerarJugadas(vista.path, vista.path.length - 1, startFen) + "."
        : "Tu profe volvió a la posición de salida.";
    }
    return "Tu profe está mostrando una variante: " + numerarJugadas(vista.path, root, startFen) + ".";
  }

  function hablarJugada(san) {
    return window.BlindNotation && BlindNotation.sanSpoken ? BlindNotation.sanSpoken(san) : san;
  }

  function casillaDicha(sq) {
    return window.BlindNotation && BlindNotation.squareSpoken ? BlindNotation.squareSpoken(sq) : sq;
  }

  /* Las flechas y los círculos del profe, dichos: para quien no ve el tablero
     son la mitad de la explicación, y dibujados no hacen ningún ruido. Se dicen
     solo los que se AGREGARON: repetir las tres flechas que ya estaban cada vez
     que el profe suma una tapa la nueva. Devuelve una función con su propia
     memoria —cada tablero lleva la suya—; `reiniciar` olvida lo que había (la
     primera carga: lo que ya estaba dibujado al entrar no es noticia).
     La usan la clase (sesion.js) y la de los invitados (ver-clase.js): con una
     copia en cada una, una diría la flecha y la otra no. */
  function vigiaDeMarcas() {
    var antes = null;
    return function (arrows, circles, reiniciar) {
      if (reiniciar) antes = null;
      arrows = arrows || [];
      circles = circles || [];
      var cuadroDe = function (c) { return typeof c === "string" ? c : c && c.square; };
      var ahora = arrows.map(function (a) { return "f:" + a.from + a.to; })
        .concat(circles.map(function (c) { return "c:" + cuadroDe(c); }));
      var previas = antes;
      antes = ahora;
      if (!previas) return null;
      var textos = [];
      arrows.forEach(function (a) {
        if (previas.indexOf("f:" + a.from + a.to) < 0) textos.push("una flecha de " + casillaDicha(a.from) + " a " + casillaDicha(a.to));
      });
      circles.forEach(function (c) {
        if (previas.indexOf("c:" + cuadroDe(c)) < 0) textos.push("la casilla " + casillaDicha(cuadroDe(c)));
      });
      return textos.length ? "Tu profe marcó " + textos.join(", ") + "." : null;
    };
  }

  /* «última jugada» y «jugadas»: el alumno no tiene la lista de jugadas a la
     vista (es del profe), y quien no ve el tablero se pierde con una sola
     jugada que no alcanzó a oír. Las contesta js/comandos-tablero.js, como en
     todo el sitio; acá solo se cubren los dos casos en que el recuadro no se
     las llega a pasar: «jugadas» a secas (fuera de la clase es el principio de
     «jugadas de f3») y las piezas OCULTAS, donde el recuadro no le da la
     partida para que no cuente piezas. Las jugadas se anuncian igual con las
     piezas ocultas, así que decirlas no es trampa. */
  var PIDE_ULTIMA = /^(la )?ultima( jugada)?$|^que se jugo$/;
  var PIDE_JUGADAS = /^(las )?jugadas( de la partida)?$|^(la )?partida$|^lista de jugadas$/;

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

    // Lo que contesta el recuadro se escribe en su región viva y, con la voz
    // encendida, además se dice (las preguntas ya las dice cuadro-comandos.js).
    function decirEnCaja(api, texto) { api.decir(texto); hablar(texto); }

    /* Los avisos de lo que pasa en el tablero. Por defecto van a la región viva
       del recuadro; `cfg.anunciar(texto)` los manda a otra parte —la página de
       los invitados tiene una sola región para todos sus avisos, que habla
       también fuera del Modo Adaptado—. */
    /* Lo que llega junto se dice junto: la jugada, la variante que muestra el
       profe y sus flechas suelen llegar en el MISMO cambio de la base, y dos
       cambios seguidos de una región viva se pisan —el lector dice solo el
       último—. Se juntan los avisos de 60 ms en un solo texto. */
    var porDecir = [];
    function avisar(texto) {
      if (!texto) return;
      if (typeof cfg.anunciar === "function") { cfg.anunciar(texto); return; }
      porDecir.push(texto);
      if (porDecir.length > 1) return;
      cmd.decir("");
      window.setTimeout(function () {
        var junto = porDecir.join(" ");
        porDecir = [];
        cmd.decir(junto);
      }, 60);
    }

    var cmd = CuadroComandos.montar(destino, {
      etiqueta: cfg.etiqueta || "Escribe tu jugada o una pregunta sobre la posición",
      posicionViva: false,
      juego: juegoVisible,
      tablero: tableroApi,
      onEnviar: function (texto, api) {
        var b = board();
        if (!b) return;
        /* Lo propio de cada tablero va primero: en una pregunta de opciones lo
           que se escribe es la LETRA de la opción, no una jugada. Devuelve el
           texto de la respuesta si lo manejó, o null para seguir como siempre. */
        var pedido = CuadroComandos.normalizar(texto).replace(/[.!¡¿?]+/g, "").trim();
        var pideUltima = PIDE_ULTIMA.test(pedido);
        if ((pideUltima || PIDE_JUGADAS.test(pedido)) && window.ComandosTablero) {
          var r = ComandosTablero.interpretar(pideUltima ? "ultima jugada" : "historial", { juego: b.viewGame || b.game });
          if (r && r.manejado && r.respuesta) { api.limpiar(); decirEnCaja(api, r.respuesta); return; }
        }
        if (typeof cfg.contestar === "function") {
          var propia = cfg.contestar(texto, function (t) { api.limpiar(); decirEnCaja(api, t); });
          if (propia) { decirEnCaja(api, propia); return; }
          if (propia === "") return;   // ya contesta él, cuando termine
        }
        if (b.piecesHidden) {
          decirEnCaja(api, "Las piezas están ocultas: el ejercicio es verlas de memoria. "
            + "Las jugadas se siguen anunciando.");
          return;
        }
        if (!b.interactive) {
          decirEnCaja(api, (cfg.porQueNoPuedes && cfg.porQueNoPuedes()) || "Ahora no te toca mover.");
          return;
        }
        var g = b.viewGame || b.game;
        var mv = window.ComandosTablero && ComandosTablero.jugadaEscrita
          ? ComandosTablero.jugadaEscrita(g, texto) : null;
        if (!mv) {
          decirEnCaja(api, "\"" + texto.trim() + "\" no es una jugada legal en esta posición. "
            + "Escribe \"posición\" para oírla, o \"ayuda\" para ver qué se puede escribir.");
          return;
        }
        var hecha = b.jugar(mv);
        if (!hecha) { decirEnCaja(api, "No se pudo hacer esa jugada."); return; }
        api.limpiar();
        decirEnCaja(api, "Jugaste " + hablarJugada(hecha.san) + ".");
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
      avisar(texto);
      actualizar();
    }

    /* El tablero mismo, con el teclado de todo el sitio (js/tablero-accesible.js):
       `aria-roledescription="tablero de ajedrez"`, el rol de aplicación en Modo
       Adaptado —sin él, NVDA y JAWS se quedan con las teclas de una letra— y los
       atajos o, z, m, x, las letras de las piezas e i para volver al recuadro.
       Antes el de la clase era un `role="group"` sin nada de eso: se recorría con
       las flechas, pero para saber qué había alrededor de una pieza había que
       salir del tablero a escribir, y Alt + Mayúscula + B (js/vision-cuenta.js,
       que busca justo ese roledescription) decía que en la página no había
       ningún tablero. Las flechas las lleva ese módulo y ClasesBoard le cede las
       suyas (ver `_onKeydown`); lo que dice cada casilla sigue siendo de
       ClasesBoard, que es quien sabe si las piezas están ocultas. */
    function montarTeclado() {
      var b = board();
      if (!b || !b.el || b.compact || !window.TableroAccesible) return;
      TableroAccesible.montar(b.el, {
        nombre: b.el.getAttribute("aria-label") || "Tablero de la clase",
        juego: function () { var x = board(); return x && !x.piecesHidden ? (x.viewGame || x.game) : null; },
        cuadro: function () { return cmd.input; },
      });
      /* Con las piezas OCULTAS los atajos que cuentan piezas no contestan —la
         misma regla que el recuadro—. Va en la fase de captura para llegar antes
         que el módulo, que sin partida diría «esta página no lleva la cuenta de
         la posición», que es falso. */
      b.el.addEventListener("keydown", function (e) {
        var x = board();
        if (!x || !x.piecesHidden || !CuadroComandos.activo()) return;
        if (e.ctrlKey || e.metaKey || !e.key || e.key.length !== 1) return;
        if ("ozmxtkqrbnp".indexOf(e.key.toLowerCase()) < 0) return;
        e.preventDefault();
        e.stopPropagation();
        var ta = b.el.__tableroAccesible;
        var t = "Las piezas están ocultas: el ejercicio es verlas de memoria.";
        if (ta && ta.decir) ta.decir(t); else avisar(t);
      }, true);
    }
    montarTeclado();

    /* Lo que el recuadro de la clase entiende además de lo de Entrenamiento. Va
       escrito debajo del cuadro: la ayuda plegada es la de todo el sitio. */
    cmd.ayuda("También puedes escribir «última jugada» o «jugadas» para oír lo que se jugó.");

    actualizar();
    return {
      cmd: cmd,
      actualizar: actualizar,
      anunciarCambio: anunciarCambio,
      decir: avisar,
      enfocar: function () { cmd.enfocar(); },
    };
  }

  return { montar: montar, hablarJugada: hablarJugada, hablar: hablar,
    numerarJugadas: numerarJugadas, describirVista: describirVista,
    vigiaDeMarcas: vigiaDeMarcas, casillaDicha: casillaDicha };
})();
