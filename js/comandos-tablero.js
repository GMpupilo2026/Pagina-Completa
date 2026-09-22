/* ===== Ajedrez Integral — lo que se le puede PREGUNTAR a un tablero =====
 *
 * El recuadro de los ejercicios solo aceptaba jugadas. Eso alcanza para
 * contestar, pero no para JUGAR: frente a un tablero, antes de mover, uno mira.
 * Mira dónde están sus caballos, qué hay en la casilla a la que quiere ir, qué
 * pieza le está apuntando. Quien no ve el tablero no tenía forma de preguntar
 * nada de eso — la única salida era oír la posición entera de corrido y
 * acordarse de las treinta y dos piezas.
 *
 * Así que el mismo recuadro donde se escribe la jugada contesta ahora preguntas:
 *
 *     posición            todo lo que hay, pieza por pieza
 *     caballos            dónde están (vale con cualquier pieza, y en plural)
 *     qué hay en e4       una casilla
 *     jugadas de f3       a dónde puede ir esa pieza
 *     alrededor de e4     las vecinas que tienen algo
 *     fila 4 / columna e  lo que hay en esa línea
 *     ir a e4             lleva el foco del teclado a esa casilla del tablero
 *     ayuda               esta lista
 *
 * Está escrito UNA vez, acá, y no dentro de cada ejercicio: son diez páginas, y
 * diez copias de "dónde están los caballos" habrían empezado a contestar cosas
 * distintas a la primera corrección — que es exactamente como el 4×4 terminó
 * siendo el único tablero del sitio al que se le podía preguntar algo.
 *
 * Uso:
 *     var r = ComandosTablero.interpretar(texto, { juego: () => game, tablero: api });
 *     if (r.manejado) { decirlo(r.respuesta); return; }   // era una pregunta
 *     ... si no, la página lo trata como una jugada
 */
window.ComandosTablero = (function () {
  "use strict";

  var TA = window.TableroAccesible || {};
  var NOMBRE = { k: "rey", q: "dama", r: "torre", b: "alfil", n: "caballo", p: "peón" };
  var PLURAL = { k: "reyes", q: "damas", r: "torres", b: "alfiles", n: "caballos", p: "peones" };
  var FEMENINA = { q: true, r: true };

  /* Cómo se puede llamar cada pieza al preguntar por ella: el nombre entero, en
     singular y en plural, en español y en inglés.

     LA INICIAL SUELTA NO VALE, y eso no es un olvido. Las preguntas de opción
     —el diagnóstico de nivel, Precisión posicional, los exámenes— se contestan
     escribiendo la LETRA de la opción, así que con "c" o "d" en esta tabla
     contestar "C" a una pregunta de cuatro opciones habría devuelto "caballos
     blancos en b1 y g1" y la respuesta no se habría marcado nunca. No daría
     ningún error: el alumno escribe su letra, oye algo sobre unos caballos y no
     entiende por qué la prueba no avanza.
     Las iniciales siguen valiendo donde no hay nada con qué confundirlas: como
     atajo de una tecla con el tablero enfocado (ver js/tablero-accesible.js). */
  var COMO_SE_LLAMA = {
    rey: "k", reyes: "k", king: "k", kings: "k",
    dama: "q", damas: "q", reina: "q", reinas: "q", queen: "q", queens: "q",
    torre: "r", torres: "r", rook: "r", rooks: "r",
    alfil: "b", alfiles: "b", bishop: "b", bishops: "b",
    caballo: "n", caballos: "n", knight: "n", knights: "n",
    peon: "p", peones: "p", pawn: "p", pawns: "p",
  };

  function sinTildes(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function normalizar(t) {
    return sinTildes(t).toLowerCase().replace(/[¿?¡!.,]/g, " ").replace(/\s+/g, " ").trim();
  }
  function hablada(sq) {
    return TA.casillaHablada ? TA.casillaHablada(sq) : sq;
  }
  function dicha(p) {
    if (!p) return "";
    if (TA.piezaDicha) return TA.piezaDicha(p);
    return NOMBRE[p.type] + (p.color === "w" ? " blanco" : " negro");
  }
  function lista(xs) {
    if (TA.listaEspanola) return TA.listaEspanola(xs);
    return xs.join(", ");
  }
  /* Sobre un tablero con niebla, cualquier recuento es un recuento de lo
     VISIBLE. Sin decirlo, "dos torres negras" se oye como el inventario de la
     partida cuando es el de lo que se alcanza a ver — y deducir lo que falta es
     justamente el juego. */
  function soloLoQueVes(juego) {
    return conNiebla(juego) ? " Es solo lo que ves: la niebla tapa el resto." : "";
  }

  // ------------------------------------------------------------------ la ayuda
  /* Con encabezados de verdad (un h3 por sección) y no un párrafo corrido: quien
     usa lector de pantalla se mueve saltando de encabezado en encabezado, así
     que una ayuda de cuatro secciones en un solo bloque obliga a oírla entera
     para llegar a la que hacía falta. Misma decisión que el 4×4. */
  var AYUDA = [
    {
      titulo: "Cómo contestar",
      texto: "Escribe la jugada en el recuadro y pulsa Intro. Vale en español o en inglés y con la " +
        "notación de siempre: \"Cf3\", \"Nf3\", \"e4\", \"Dxh7+\", \"e8=D\", \"O-O\". También sirve " +
        "escribir la casilla de origen y la de destino separadas, por ejemplo \"e1 g1\".",
    },
    {
      titulo: "Preguntarle al tablero",
      texto: "posición (todo lo que hay); caballos, torres, mi rey… (dónde está esa pieza); " +
        "\"qué hay en e4\" (una casilla); \"jugadas de f3\" (a dónde puede ir esa pieza); " +
        "\"alrededor de e4\" (sus vecinas); \"fila 4\" o \"columna e\"; \"ir a e4\" (lleva el foco " +
        "del teclado a esa casilla); turno (a quién le toca); ayuda (esta lista).",
    },
    {
      titulo: "Moverse por el tablero con el teclado",
      texto: "El tablero es una sola parada de tabulador: se entra con Tab y dentro se anda con las " +
        "flechas. Intro o espacio elige la casilla. Inicio y Fin van al principio y al final de la fila; " +
        "Re Pág y Av Pág, arriba y abajo del todo en esa columna.",
    },
    {
      titulo: "Atajos con el tablero enfocado",
      texto: "o (qué hay en esta casilla), z (la posición entera), m (a dónde puede ir esta pieza), " +
        "x (las vecinas con algo), mayúsculas+x (las ocho), alt+x (la primera pieza en cada dirección), " +
        "k q r b n p (saltar a la siguiente pieza de ese tipo; con mayúsculas, hacia atrás), " +
        "1 a 8 (ir a esa fila), mayúsculas+1 a 8 (ir a esa columna), i (volver al recuadro).",
    },
  ];

  function ayudaHTML() {
    return AYUDA.map(function (s) { return "<h3>" + s.titulo + "</h3><p>" + s.texto + "</p>"; }).join("");
  }
  function ayudaTexto() {
    return AYUDA.map(function (s) { return s.titulo + ". " + s.texto; }).join(" ");
  }

  // --------------------------------------------------------------- respuestas
  function piezasDe(juego, tipo) {
    var out = [];
    "abcdefgh".split("").forEach(function (f) {
      for (var r = 1; r <= 8; r++) {
        var sq = f + r, p = null;
        try { p = juego.get(sq); } catch (e) {}
        if (p && p.type === tipo) out.push({ sq: sq, p: p });
      }
    });
    return out;
  }

  function dondeEsta(juego, tipo) {
    var hay = piezasDe(juego, tipo);
    if (!hay.length) {
      return conNiebla(juego)
        ? "No ves ningún " + NOMBRE[tipo] + " ahora mismo."
        : "No hay " + PLURAL[tipo] + " en el tablero.";
    }
    var por = { w: [], b: [] };
    hay.forEach(function (x) { por[x.p.color].push(hablada(x.sq)); });
    var partes = [];
    ["w", "b"].forEach(function (c) {
      if (!por[c].length) return;
      var uno = por[c].length === 1;
      var color = c === "w" ? "blanc" : "negr";
      var fin = (FEMENINA[tipo] ? "a" : "o") + (uno ? "" : "s");
      partes.push((uno ? NOMBRE[tipo] : PLURAL[tipo]) + " " + color + fin + " en " + lista(por[c]));
    });
    return partes.join(". ") + "." + soloLoQueVes(juego);
  }

  /* Un tablero puede TAPAR casillas a propósito —la niebla de Niebla de Guerra—
     y ahí "vacía" es una respuesta falsa: puede haber una pieza rival. Lo
     contesta la propia partida (`juego.oculta(casilla)`) y no una opción de
     este módulo, porque es quien arma el tablero el que sabe qué esconde; una
     partida que no lo traiga se comporta exactamente como siempre. */
  function tapada(juego, sq) {
    try { return !!(juego && juego.oculta && juego.oculta(sq)); } catch (e) { return false; }
  }
  function conNiebla(juego) {
    return !!(juego && juego.oculta);
  }

  function queHayEn(juego, sq) {
    if (tapada(juego, sq)) return hablada(sq) + ": cubierta por la niebla, no sabes qué hay ahí.";
    var p = null;
    try { p = juego.get(sq); } catch (e) {}
    return hablada(sq) + (p ? ": " + dicha(p) + "." : ": vacía.");
  }

  function jugadasDe(juego, sq) {
    if (tapada(juego, sq)) return hablada(sq) + " está cubierta por la niebla: no sabes qué hay ahí.";
    var p = null;
    try { p = juego.get(sq); } catch (e) {}
    if (!p) return hablada(sq) + " está vacía.";
    /* Con niebla, las jugadas de una pieza del RIVAL no se pueden contar: su
       camino pasa por casillas que no ves. La partida visible devuelve la lista
       vacía en cuanto le toca mover al rival, y sin esta línea esa lista vacía se
       anunciaba como "no tiene jugadas ahora" — que es rotundamente falso y, lo
       peor, se oye como información buena. `miColor` va en la partida visible
       junto a `oculta`, que es donde vive lo que ESTE jugador sabe. */
    if (conNiebla(juego) && juego.miColor && p.color !== juego.miColor) {
      return "En " + hablada(sq) + " hay " + dicha(p) + ", del rival: con la niebla no puedes saber a dónde puede ir.";
    }
    var ms = [];
    try { ms = juego.moves({ square: sq, verbose: true }) || []; } catch (e) {}
    if (!ms.length) {
      var aclara = (juego.turn && p.color !== juego.turn()) ? " Ahora no le toca mover a ese color." : "";
      return dicha(p) + " en " + hablada(sq) + " no tiene jugadas ahora." + aclara;
    }
    return dicha(p) + " en " + hablada(sq) + " puede ir a " + lista(ms.map(function (m) {
      return hablada(m.to) + (m.flags.indexOf("c") >= 0 || m.flags.indexOf("e") >= 0 ? " capturando" : "");
    })) + ".";
  }

  function alrededorDe(juego, sq) {
    var f = sq.charCodeAt(0) - 97, r = parseInt(sq[1], 10);
    var partes = [];
    var tapadas = 0;
    [[-1, 1, "arriba a la izquierda"], [0, 1, "arriba"], [1, 1, "arriba a la derecha"],
     [-1, 0, "izquierda"], [1, 0, "derecha"],
     [-1, -1, "abajo a la izquierda"], [0, -1, "abajo"], [1, -1, "abajo a la derecha"]].forEach(function (d) {
      var nf = f + d[0], nr = r + d[1];
      if (nf < 0 || nf > 7 || nr < 1 || nr > 8) return;
      var v = "abcdefgh"[nf] + nr, p = null;
      if (tapada(juego, v)) { tapadas++; return; }
      try { p = juego.get(v); } catch (e) {}
      if (p) partes.push(d[2] + ": " + dicha(p) + " en " + hablada(v));
    });
    var niebla = tapadas
      ? " " + (tapadas === 1 ? "Una casilla de al lado está cubierta por la niebla." : tapadas + " casillas de al lado están cubiertas por la niebla.")
      : "";
    return (partes.length
      ? "Alrededor de " + hablada(sq) + " — " + partes.join("; ") + "."
      : "Alrededor de " + hablada(sq) + " no hay ninguna pieza a la vista.") + niebla;
  }

  function laLinea(juego, cual) {
    var casillas = [], rotulo;
    if (/^[a-h]$/.test(cual)) {
      // El nombre hablado de la columna sale de BlindNotation, que es donde
      // vive: recortarlo de la casilla ("david 1" → "david") es la clase de
      // atajo que deja de funcionar en cuanto aquello cambie de forma.
      rotulo = "Columna " + (window.BlindNotation ? BlindNotation.fileName(cual) : cual);
      for (var r = 1; r <= 8; r++) casillas.push(cual + r);
    } else {
      rotulo = "Fila " + cual;
      "abcdefgh".split("").forEach(function (f) { casillas.push(f + cual); });
    }
    var hay = [];
    var tapadas = 0;
    casillas.forEach(function (sq) {
      if (tapada(juego, sq)) { tapadas++; return; }
      var p = null;
      try { p = juego.get(sq); } catch (e) {}
      if (p) hay.push(dicha(p) + " en " + hablada(sq));
    });
    var niebla = tapadas ? " " + tapadas + (tapadas === 1 ? " casilla está cubierta" : " casillas están cubiertas") + " por la niebla." : "";
    return rotulo + ": " + (hay.length ? hay.join(", ") + "." : (tapadas ? "sin piezas a la vista." : "sin piezas.")) + niebla;
  }

  function deQuienEsElTurno(juego) {
    if (!juego || !juego.turn) return "Esta página no lleva la cuenta del turno.";
    var jaque = "";
    try { if (juego.in_check && juego.in_check()) jaque = ", y está en jaque"; } catch (e) {}
    return "Juegan " + (juego.turn() === "w" ? "blancas" : "negras") + jaque + ".";
  }

  /* ----------------------------------------------- la jugada que se escribió
     Se resuelve contra la LISTA DE JUGADAS LEGALES (`moves({verbose:true})`) y
     no probando el texto sobre la partida, y eso arregla dos cosas de una:

     1. FUNCIONA CON CUALQUIER MOTOR. Desafíos usa un motor propio (MiniChess)
        porque sus posiciones no siempre tienen reyes y chess.js los exige. El
        intérprete de antes le pasaba el texto a `game.move("Cf3")`, que MiniChess
        no entiende —solo recibe {from,to}—, así que ahí no se podía escribir
        ninguna jugada y no fallaba nada: el recuadro contestaba siempre "no es
        legal".
     2. NO TOCA LA PARTIDA. El de antes DEJABA HECHA la jugada al acertar, así
        que quien lo llamaba tenía que acordarse de pasarle una copia; el que se
        olvidara movía la pieza dos veces.

     Entiende las dos formas en que se escribe una jugada —"e2 e4" y "Cf3"—, en
     español y en inglés, con la "x" y el "+" opcionales. */
  /* La inicial de una pieza, leída en español y en inglés. OJO CON "R" Y CON
     "B": "R" es Rey en español y Rook (torre) en inglés, y "B" es Bishop
     (alfil) en inglés y no es nada en español. Son dos jugadas distintas
     escritas igual, así que se prueban LAS DOS y gana la que sea legal.
     El orden —primero la inglesa— es el mismo que ya seguía el intérprete del
     resto del sitio (js/chess-move-parser.js, que probaba el texto tal cual
     antes de traducirlo): los SAN que devuelve chess.js y los que traen los
     bancos están en inglés, así que es lo que más se copia y se pega. Con el
     orden al revés, escribir la jugada que la propia página acaba de nombrar
     movería el rey en vez de la torre, y sería legal las dos veces. */
  var LETRA_PIEZA = { t: "r", c: "n", a: "b", d: "q", n: "n", q: "q", k: "k" };
  var LETRA_AMBIGUA = { r: ["r", "k"], b: ["b"] };
  function tiposDe(inicial) {
    var l = String(inicial || "").toLowerCase();
    if (LETRA_AMBIGUA[l]) return LETRA_AMBIGUA[l];
    return LETRA_PIEZA[l] ? [LETRA_PIEZA[l]] : [];
  }

  function jugadaEscrita(juego, texto) {
    if (!juego || !juego.moves) return null;
    var legales = [];
    try { legales = juego.moves({ verbose: true }) || []; } catch (e) { return null; }
    if (!legales.length) return null;

    var t = sinTildes(String(texto || "")).trim()
      .replace(/^\d+\.(\.\.)?\s*/, "")            // "14. Cf3" o "14...Cf3"
      .replace(/[+#!?\s]/g, "")
      .replace(/^(?:juego|muevo|jugar)/i, "");
    if (!t) return null;

    // Enroque: el rey andando dos casillas. Se busca por lo que HACE y no por su
    // nombre, porque no todos los motores devuelven "O-O" en el SAN.
    var enroque = /^(?:o-?o-?o|0-?0-?0|enroquelargo)$/i.test(t) ? "largo"
                : /^(?:o-?o|0-?0|enroquecorto)$/i.test(t) ? "corto" : null;
    if (enroque) {
      var reyes = legales.filter(function (m) {
        if ((m.piece || "").toLowerCase() !== "k") return false;
        var d = Math.abs(m.to.charCodeAt(0) - m.from.charCodeAt(0));
        if (d !== 2) return false;
        return enroque === "corto" ? m.to.charCodeAt(0) > m.from.charCodeAt(0) : m.to.charCodeAt(0) < m.from.charCodeAt(0);
      });
      return reyes.length === 1 ? reyes[0] : null;
    }

    // "e2e4", "e2 e4", "e2-e4": el origen y el destino, que es lo que escribe
    // quien va leyendo el tablero casilla por casilla.
    var m = t.toLowerCase().match(/^([a-h][1-8])[x\-,]?([a-h][1-8])([tcadqrbn])?$/);
    if (m) {
      var coronaA = m[3] ? (tiposDe(m[3])[0] || null) : null;
      var caben = legales.filter(function (j) {
        return j.from === m[1] && j.to === m[2] && (!coronaA || j.promotion === coronaA);
      });
      if (caben.length === 1) return caben[0];
      // Una coronación sin decir a qué pieza: se corona dama, que es lo que
      // quiere el 99% de las veces y lo que ya hacía el recuadro de antes.
      var dama = caben.filter(function (j) { return j.promotion === "q"; });
      return dama.length === 1 ? dama[0] : (caben.length ? caben[0] : null);
    }

    // Notación de siempre: "Cf3", "Nf3", "Txa1", "e4", "exd5", "e8=D", "Cbd2".
    m = t.match(/^([TCADRKQRBNtcadrkqrbn])?([a-h])?([1-8])?[xX]?([a-h][1-8])(?:=?([TCADQRBNtcadqrbn]))?$/);
    if (!m) return null;
    /* Una minúscula al principio puede ser la columna de un peón ("exd5") o una
       inicial de pieza mal escrita. Solo se lee como pieza si va en mayúscula:
       al revés, "bxc3" —una captura de peón perfectamente normal— se leería
       como una jugada de alfil y no se haría nunca. */
    var inicial = m[1];
    var esPieza = inicial && inicial === inicial.toUpperCase() && tiposDe(inicial).length;
    var tipos = esPieza ? tiposDe(inicial) : ["p"];
    if (inicial && !esPieza && !m[2] && !m[3]) { m[2] = inicial.toLowerCase(); }
    var destino = m[4].toLowerCase();
    var corona = m[5] ? (tiposDe(m[5])[0] || null) : null;

    /* Se prueba tipo por tipo y gana el PRIMERO que dé exactamente una jugada.
       Así "Rd4" sale bien tanto cuando quien escribe piensa en la torre como
       cuando piensa en el rey: si solo una de las dos puede llegar, es esa. */
    for (var k = 0; k < tipos.length; k++) {
      var tipo = tipos[k];
      var caben2 = legales.filter(function (j) {
        if (j.to !== destino) return false;
        if ((j.piece || "").toLowerCase() !== tipo) return false;
        if (m[2] && j.from[0] !== m[2]) return false;
        if (m[3] && j.from[1] !== m[3]) return false;
        if (corona && j.promotion !== corona) return false;
        return true;
      });
      if (caben2.length === 1) return caben2[0];
      if (caben2.length > 1 && !corona) {
        var d2 = caben2.filter(function (j) { return !j.promotion || j.promotion === "q"; });
        if (d2.length === 1) return d2[0];
      }
    }
    return null;
  }

  // ------------------------------------------------------------- el intérprete
  /* Devuelve `manejado: false` cuando el texto no es ninguna de estas preguntas:
     ahí quien llama lo trata como una jugada, que es lo que se escribe casi
     siempre. Al revés —quedarse con todo— una jugada como "Ra1" se leería como
     la pregunta por el rey y la jugada no se haría nunca. */
  function interpretar(texto, ctx) {
    ctx = ctx || {};
    // `juego` y `tablero` se aceptan como valor o como función: quien llama casi
    // siempre tiene que darlos como función, porque la partida se reemplaza con
    // cada ejercicio y una referencia capturada al montar apuntaría al anterior.
    var juego = typeof ctx.juego === "function" ? ctx.juego() : ctx.juego;
    var tablero = typeof ctx.tablero === "function" ? ctx.tablero() : ctx.tablero;
    var t = normalizar(texto);
    if (!t) return { manejado: false };

    if (/^(ayuda|help|\?|comandos)$/.test(t)) {
      return { manejado: true, tipo: "ayuda", respuesta: ayudaTexto(), html: ayudaHTML() };
    }

    // Todo lo que sigue necesita saber qué hay en el tablero.
    if (!juego || !juego.get) return { manejado: false };

    /* Las palabras van enteras y nunca una letra suelta, por lo mismo que la
       tabla de arriba: "t" y "z" serían letras de opción, y "m" y "x" pueden ser
       el principio de una jugada mal escrita. */
    if (/^(posicion|la posicion|todo|todas las piezas|tablero|el tablero)$/.test(t)) {
      /* La posición en palabras sale de BlindNotation y de ningún otro lado:
         ahí viven los plurales escritos ("alfiles", no "alfils") y la forma
         hablada de las columnas, y una segunda versión acá diría la posición de
         otra manera que el resto del sitio. */
      var frase = window.BlindNotation && BlindNotation.positionSentence
        ? BlindNotation.positionSentence(juego) + soloLoQueVes(juego)
        : "No se pudo leer la posición.";
      return { manejado: true, tipo: "posicion", respuesta: frase };
    }
    if (/^(turno|a quien le toca|de quien es el turno|quien juega)$/.test(t)) {
      return { manejado: true, tipo: "turno", respuesta: deQuienEsElTurno(juego) };
    }

    var m;
    if ((m = t.match(/^(?:ir(?: a)?|foco|vete a|llevame a)\s+([a-h])\s?([1-8])$/))) {
      var destino = m[1] + m[2];
      if (tablero && tablero.enfocar && tablero.enfocar(destino)) {
        return { manejado: true, tipo: "ir", respuesta: "" };  // el foco ya lo anuncia
      }
      return { manejado: true, tipo: "ir", respuesta: "No se pudo llegar a " + hablada(destino) + "." };
    }
    if ((m = t.match(/^(?:que hay en|casilla|hay en|en)\s+([a-h])\s?([1-8])$/))) {
      return { manejado: true, tipo: "casilla", respuesta: queHayEn(juego, m[1] + m[2]) };
    }
    if ((m = t.match(/^(?:jugadas(?: de| desde)?|mueve|adonde puede ir)\s+([a-h])\s?([1-8])$/))) {
      return { manejado: true, tipo: "jugadas", respuesta: jugadasDe(juego, m[1] + m[2]) };
    }
    if ((m = t.match(/^(?:alrededor(?: de)?|vecinas(?: de)?)\s+([a-h])\s?([1-8])$/))) {
      return { manejado: true, tipo: "alrededor", respuesta: alrededorDe(juego, m[1] + m[2]) };
    }
    if ((m = t.match(/^(?:fila|rank)\s*([1-8])$/))) {
      return { manejado: true, tipo: "linea", respuesta: laLinea(juego, m[1]) };
    }
    if ((m = t.match(/^(?:columna|file)\s*([a-h])$/))) {
      return { manejado: true, tipo: "linea", respuesta: laLinea(juego, m[1]) };
    }

    /* "caballos", "mis torres", "donde esta mi rey". Va al final a propósito: la
       inicial suelta ("d", "t", "c") también es una jugada de peón mal escrita,
       y las formas de arriba son inequívocas. Lo que sí se exige acá es que no
       parezca una jugada — "Ra1" tiene casilla pegada y no entra. */
    var limpio = t.replace(/^(?:donde (?:esta|estan|hay)|mi|mis|el|la|los|las)\s+/g, "").trim();
    limpio = limpio.replace(/^(?:mi|mis|el|la|los|las)\s+/g, "").trim();
    if (COMO_SE_LLAMA[limpio]) {
      return { manejado: true, tipo: "pieza", respuesta: dondeEsta(juego, COMO_SE_LLAMA[limpio]) };
    }

    return { manejado: false };
  }

  return {
    interpretar: interpretar, jugadaEscrita: jugadaEscrita,
    AYUDA: AYUDA, ayudaHTML: ayudaHTML, ayudaTexto: ayudaTexto,
    dondeEsta: dondeEsta, queHayEn: queHayEn, jugadasDe: jugadasDe,
    alrededorDe: alrededorDe, laLinea: laLinea, deQuienEsElTurno: deQuienEsElTurno,
    COMO_SE_LLAMA: COMO_SE_LLAMA,
  };
})();
