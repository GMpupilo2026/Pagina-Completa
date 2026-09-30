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
 *     qué ataca e4        a qué piezas apunta la pieza de esa casilla
 *     quién ataca e4      qué piezas rivales le apuntan a esa casilla
 *     quién defiende e4   qué piezas propias la cuidan
 *     última jugada       la última jugada de la partida
 *     historial           todas las jugadas de la partida
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
    return NOMBRE[p.type] + (p.color === "w" ? (FEMENINA[p.type] ? " blanca" : " blanco") : (FEMENINA[p.type] ? " negra" : " negro"));
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
        "del teclado a esa casilla); \"mis jugadas\" (todas las que puedes hacer); \"qué ataca e4\" (a qué piezas apunta); \"quién ataca e4\" y " +
        "\"quién defiende e4\" (quién le apunta a esa casilla); \"última jugada\"; historial (las jugadas " +
        "de la partida); turno (a quién le toca); ayuda (esta lista).",
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

  /* Con la cuenta ciega (js/vision-cuenta.js) el recuadro hace además todo lo
     de la página: se dice primero, porque es lo que más se usa. */
  var AYUDA_CIEGO = {
    titulo: "Todo desde el recuadro",
    texto: "acciones (qué botones hay); el nombre de un botón para apretarlo, por ejemplo \"pista\"; " +
      "siguiente, otra vez, solución; leer (el ejercicio); dónde estoy; atajos; panel (volver a tu panel).",
  };
  function modoCiego() {
    return typeof document !== "undefined" && document.documentElement.classList.contains("modo-ciego");
  }
  function ayudaSecciones() {
    return modoCiego() ? [AYUDA_CIEGO].concat(AYUDA) : AYUDA;
  }
  function ayudaHTML() {
    return ayudaSecciones().map(function (s) { return "<h3>" + s.titulo + "</h3><p>" + s.texto + "</p>"; }).join("");
  }
  function ayudaTexto() {
    return ayudaSecciones().map(function (s) { return s.titulo + ". " + s.texto; }).join(" ");
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

  /* ------------------------------------------------ quién le apunta a quién
     Lo que un tablero dice de un vistazo —esa torre está clavada, ese peón no
     tiene quien lo cuide— y que casilla por casilla no se ve nunca: hay que
     preguntarlo. Se calcula con la geometría de cada pieza sobre lo que dice
     `get()`, no con las jugadas legales: una pieza clavada igual DEFIENDE, y la
     que defiende a una propia no tiene una "jugada" para capturarla. Así vale
     también para los tableros que no son una partida (Memoria, Estudio). */
  var SALTOS = {
    n: [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]],
    k: [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]],
  };
  var RAYOS = {
    r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
    q: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
  };
  function casillaEn(f, r) { return f < 0 || f > 7 || r < 1 || r > 8 ? null : "abcdefgh"[f] + r; }
  function piezaEn(juego, sq) {
    if (tapada(juego, sq)) return null;
    try { return juego.get(sq); } catch (e) { return null; }
  }
  // Las casillas a las que apunta la pieza `p` puesta en `sq`.
  function apuntaA(juego, sq, p) {
    var f = sq.charCodeAt(0) - 97, r = parseInt(sq[1], 10), out = [];
    if (p.type === "p") {
      var d = p.color === "w" ? 1 : -1;
      [casillaEn(f - 1, r + d), casillaEn(f + 1, r + d)].forEach(function (c) { if (c) out.push(c); });
      return out;
    }
    if (SALTOS[p.type]) {
      SALTOS[p.type].forEach(function (s) { var c = casillaEn(f + s[0], r + s[1]); if (c) out.push(c); });
      return out;
    }
    (RAYOS[p.type] || []).forEach(function (s) {
      for (var i = 1; i < 8; i++) {
        var c = casillaEn(f + s[0] * i, r + s[1] * i);
        if (!c) break;
        out.push(c);
        if (tapada(juego, c) || piezaEn(juego, c)) break;   // lo que hay (o no se ve) corta la línea
      }
    });
    return out;
  }
  function todasLasPiezas(juego) {
    var out = [];
    "abcdefgh".split("").forEach(function (f) {
      for (var r = 1; r <= 8; r++) {
        var sq = f + r, p = piezaEn(juego, sq);
        if (p) out.push({ sq: sq, p: p });
      }
    });
    return out;
  }
  function quienesApuntan(juego, sq, color) {
    return todasLasPiezas(juego).filter(function (x) {
      return x.sq !== sq && x.p.color === color && apuntaA(juego, x.sq, x.p).indexOf(sq) >= 0;
    });
  }
  function nombrarTodas(xs) {
    return lista(xs.map(function (x) { return dicha(x.p) + " en " + hablada(x.sq); }));
  }

  function queAtaca(juego, sq) {
    if (tapada(juego, sq)) return hablada(sq) + " está cubierta por la niebla: no sabes qué hay ahí.";
    var p = piezaEn(juego, sq);
    if (!p) return hablada(sq) + " está vacía: no hay pieza que ataque.";
    var blancos = apuntaA(juego, sq, p).map(function (c) { return { sq: c, p: piezaEn(juego, c) }; })
      .filter(function (x) { return x.p; });
    var rivales = blancos.filter(function (x) { return x.p.color !== p.color; });
    var propias = blancos.filter(function (x) { return x.p.color === p.color; });
    var frase = dicha(p) + " en " + hablada(sq) + " " + (rivales.length ? "ataca a " + nombrarTodas(rivales) : "no ataca ninguna pieza rival");
    frase += propias.length ? "; y defiende a " + nombrarTodas(propias) + "." : ".";
    return frase + soloLoQueVes(juego);
  }

  function quienAtaca(juego, sq, defender) {
    if (tapada(juego, sq)) return hablada(sq) + " está cubierta por la niebla.";
    var p = piezaEn(juego, sq);
    if (!p) {
      var bl = quienesApuntan(juego, sq, "w"), ng = quienesApuntan(juego, sq, "b");
      return hablada(sq) + " está vacía. " +
        (bl.length ? "Las blancas le apuntan con " + nombrarTodas(bl) + ". " : "Ninguna pieza blanca le apunta. ") +
        (ng.length ? "Las negras le apuntan con " + nombrarTodas(ng) + "." : "Ninguna pieza negra le apunta.") + soloLoQueVes(juego);
    }
    var mismo = p.color, rival = p.color === "w" ? "b" : "w";
    var atacan = quienesApuntan(juego, sq, rival), defienden = quienesApuntan(juego, sq, mismo);
    var sobre = dicha(p) + " en " + hablada(sq);
    var a = atacan.length ? (atacan.length === 1 ? "La ataca " : "La atacan ") + nombrarTodas(atacan) + "." : "Nadie la ataca.";
    var d = defienden.length ? (defienden.length === 1 ? "La defiende " : "La defienden ") + nombrarTodas(defienden) + "." : "Nadie la defiende.";
    return sobre + ": " + (defender ? d + " " + a : a + " " + d) + soloLoQueVes(juego);
  }

  /* La última jugada y la partida entera, en palabras. Solo si la partida
     lleva historia (chess.js la guarda desde que se armó); un ejercicio que
     arrancó en la posición no tiene jugadas previas, y se dice. Con niebla no
     se contesta acá: la jugada del rival no se ve, y eso lo sabe la página. */
  function historiaDe(juego) {
    try { return juego.history ? (juego.history() || []) : null; } catch (e) { return null; }
  }
  function sanHablada(san) {
    return window.BlindNotation && BlindNotation.sanSpoken ? BlindNotation.sanSpoken(san) : san;
  }
  function ultimaJugada(juego) {
    var h = historiaDe(juego);
    if (!h || !h.length) return "Todavía no hay jugadas: la partida (o el ejercicio) empieza en esta posición.";
    var quien = h.length % 2 === 1 ? "blancas" : "negras";
    try {
      var inicio = juego.history({ verbose: true })[0];
      if (inicio && inicio.color === "b") quien = h.length % 2 === 1 ? "negras" : "blancas";
    } catch (e) {}
    return "La última jugada fue de las " + quien + ": " + sanHablada(h[h.length - 1]) + ".";
  }
  /* Todas las jugadas que se pueden hacer ahora, por pieza y en palabras. Quien
     no ve el tablero no puede «mirar» qué tiene: así elige entre lo que hay,
     sin probar jugadas a ciegas. Solo las del bando al que le toca. */
  function todasLasJugadas(juego) {
    var ms = [];
    try { ms = juego.moves ? (juego.moves({ verbose: true }) || []) : []; } catch (e) {}
    if (!ms.length) return "Ahora no hay jugadas para hacer.";
    var porPieza = {}, orden = [];
    ms.forEach(function (mv) {
      var k = mv.from;
      if (!porPieza[k]) { porPieza[k] = []; orden.push(k); }
      porPieza[k].push(hablada(mv.to) + (mv.flags.indexOf("c") >= 0 || mv.flags.indexOf("e") >= 0 ? " capturando" : "") +
        (/[+#]$/.test(mv.san || "") ? (/#$/.test(mv.san) ? " con mate" : " con jaque") : ""));
    });
    var partes = orden.map(function (sq) {
      var p = null;
      try { p = juego.get(sq); } catch (e) {}
      return (p ? dicha(p) : "La pieza") + " en " + hablada(sq) + ": " + lista(porPieza[sq]);
    });
    return (ms.length === 1 ? "Tienes una sola jugada. " : "Tienes " + ms.length + " jugadas. ") + partes.join(". ") + ".";
  }

  function historial(juego) {
    var h = historiaDe(juego);
    if (!h || !h.length) return "Todavía no hay jugadas: la partida (o el ejercicio) empieza en esta posición.";
    var negrasPrimero = false;
    try { var v = juego.history({ verbose: true }); negrasPrimero = v[0] && v[0].color === "b"; } catch (e) {}
    var partes = [], n = 1, i = 0;
    if (negrasPrimero) { partes.push("1, negras: " + sanHablada(h[0])); i = 1; n = 2; }
    for (; i < h.length; i += 2, n++) {
      partes.push(n + ": " + sanHablada(h[i]) + (h[i + 1] ? ", " + sanHablada(h[i + 1]) : ""));
    }
    return h.length + (h.length === 1 ? " jugada. " : " jugadas. ") + partes.join("; ") + ".";
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
  /* ------------------------------------------------ qué decir cuando no se jugó
     Tres casos distintos que se decían igual («"X" no es una jugada legal»), y
     quien no ve el tablero se queda sin saber qué pasó:
       - lo escrito ni siquiera es una jugada («solución», «hola»): no se
         entendió — decirle «no es legal» lo manda a revisar una jugada que no
         escribió;
       - es una jugada, pero no se puede hacer en esta posición: «no es una
         jugada legal»;
       - es legal pero no es la respuesta: «Respuesta incorrecta» (eso lo dice
         cada ejercicio con `incorrecta()`, que es el que sabe qué se buscaba).
     Lo usan todos los recuadros del sitio, para que digan lo mismo. */
  var HABLADAS = "anna|bella|cesar|david|eva|felix|gustav|hector";
  function pareceJugada(texto) {
    var t = sinTildes(String(texto || "")).toLowerCase().trim()
      .replace(/^\d+\.(\.\.)?\s*/, "").replace(/[+#!?]+$/, "");
    if (!t) return false;
    if (/^(o-o(-o)?|0-0(-0)?|enroque( corto| largo)?)$/.test(t)) return true;
    if (/^(?:[kqrbnrdtac]|rey|dama|torre|alfil|caballo|peon)?\s*[a-h]?[1-8]?\s*x?\s*[a-h][1-8](?:\s*=?\s*[qrbndtac])?$/.test(t)) return true;
    if (/^[a-h][1-8]\s*[-x ]?\s*[a-h][1-8]/.test(t)) return true;
    return new RegExp("(" + HABLADAS + ")\\s*[1-8]").test(t);
  }
  // Lo que se pide a un botón («solución», «pista»…) donde la página no lo tiene.
  var ACCIONES_CONOCIDAS = /^(siguiente|anterior|solucion|la solucion|ver la solucion|pista|otra pista|otra vez|reiniciar|comprobar|volver|saltar|tiempo|reloj)$/;
  function noSePudoJugar(texto) {
    var dicho = String(texto || "").trim();
    if (pareceJugada(dicho)) return "«" + dicho + "» no es una jugada legal en esta posición.";
    if (ACCIONES_CONOCIDAS.test(normalizar(dicho))) {
      return "En este ejercicio no hay «" + dicho + "». Escribe «acciones» para oír lo que sí puedes hacer.";
    }
    return "No entendí «" + dicho + "». Escribe tu jugada (por ejemplo «Cf3»), una pregunta como «posición», o «acciones» para oír qué más puedes hacer.";
  }
  // «Respuesta incorrecta: …»: la jugada se pudo hacer, pero no era la buscada.
  function incorrecta(jugadaDicha, porque) {
    return "Respuesta incorrecta: " + jugadaDicha + " no es la jugada que buscamos." + (porque ? " " + porque : "");
  }

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
      /* Con la cuenta ciega el tablero no está en el camino del lector (es para
         quien acompaña): «ir a» contesta lo que hay ahí, sin mover el foco. */
      if (modoCiego()) {
        return { manejado: true, tipo: "casilla", respuesta: queHayEn(juego, destino) };
      }
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
    if ((m = t.match(/^(?:que ataca|a que ataca|ataques de|que amenaza)\s+([a-h])\s?([1-8])$/))) {
      return { manejado: true, tipo: "ataca", respuesta: queAtaca(juego, m[1] + m[2]) };
    }
    if ((m = t.match(/^(?:quien ataca|quienes atacan|quien ataca a|quienes atacan a|atacantes de)\s+([a-h])\s?([1-8])$/))) {
      return { manejado: true, tipo: "atacan", respuesta: quienAtaca(juego, m[1] + m[2], false) };
    }
    if ((m = t.match(/^(?:quien defiende|quienes defienden|quien defiende a|quienes defienden a|defensores de|quien protege)\s+([a-h])\s?([1-8])$/))) {
      return { manejado: true, tipo: "defienden", respuesta: quienAtaca(juego, m[1] + m[2], true) };
    }
    if (/^(mis jugadas|jugadas posibles|jugadas legales|que puedo jugar|todas mis jugadas|que jugadas tengo)$/.test(t)) {
      return { manejado: true, tipo: "legales", respuesta: todasLasJugadas(juego) };
    }
    if (!conNiebla(juego) && historiaDe(juego) && /^(ultima jugada|la ultima jugada|ultima|que se jugo|que jugo|jugada anterior)$/.test(t)) {
      return { manejado: true, tipo: "ultima", respuesta: ultimaJugada(juego) };
    }
    if (!conNiebla(juego) && historiaDe(juego) && /^(historial|jugadas de la partida|las jugadas|la partida|todas las jugadas)$/.test(t)) {
      return { manejado: true, tipo: "historial", respuesta: historial(juego) };
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
    pareceJugada: pareceJugada, noSePudoJugar: noSePudoJugar, incorrecta: incorrecta,
    AYUDA: AYUDA, ayudaHTML: ayudaHTML, ayudaTexto: ayudaTexto,
    dondeEsta: dondeEsta, queHayEn: queHayEn, jugadasDe: jugadasDe,
    alrededorDe: alrededorDe, laLinea: laLinea, deQuienEsElTurno: deQuienEsElTurno,
    COMO_SE_LLAMA: COMO_SE_LLAMA,
  };
})();
