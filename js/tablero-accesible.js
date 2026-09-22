/* ===== Ajedrez Integral — el teclado de los tableros =====
 *
 * Todos los tableros de Entrenamiento se dibujaban como 64 botones sueltos. Eso
 * no da ningún error —se ven perfectos y el ratón funciona igual— y deja dos
 * cosas rotas para quien no usa el ratón:
 *
 *   1. SESENTA Y CUATRO PARADAS DE TABULADOR. Para pasar del tablero al botón
 *      de "Pista" había que apretar Tab sesenta y cinco veces. Nadie hace eso:
 *      se abandona la página.
 *   2. NO SE PUEDE MIRAR EL TABLERO. Un lector de pantalla lee la casilla que
 *      tiene el foco, así que la única forma de saber qué hay alrededor de la
 *      dama era recorrer las 64 de una en una y acordarse.
 *
 * El 4×4 ya lo tenía resuelto —flechas, atajos de una tecla, la posición
 * dictada— pero escrito DENTRO de su página y atado a su tablero de cuatro por
 * cuatro. Esto es lo mismo, para cualquier tablero del sitio, escrito una sola
 * vez: copiarlo en las diez páginas de Entrenamiento se habría separado a la
 * primera corrección, que es como aquel quedó siendo el único que se podía
 * recorrer.
 *
 * Uso: una línea por página, cuando el tablero ya existe.
 *
 *     TableroAccesible.montar(document.getElementById('board'), {
 *       nombre: 'Tablero del ejercicio',
 *       juego: () => game,              // la partida de chess.js, si la hay
 *     });
 *
 * A partir de ahí se repone solo: la página redibuja el tablero cuando quiere
 * —y casi todas lo hacen en cada jugada— y un observador vuelve a poner el
 * tabindex y el foco donde estaban. Mismo patrón que js/coordenadas-tablero.js,
 * y por la misma razón: acordarse de llamar a una función después de cada
 * repintado es acordarse de algo que tarde o temprano se olvida, y el síntoma
 * sería que el tablero deja de responder al teclado a mitad del ejercicio.
 *
 * Requisito: cada casilla lleva su nombre en `data-square` ("e4"), que es lo que
 * ya hacen todos los tableros del sitio para las coordenadas.
 */
window.TableroAccesible = (function () {
  "use strict";

  /* ---------------------------------------------------------------- hablarlo
     Las columnas se dicen "anna, bella, cesar…" en todo el sitio
     (js/blind-notation.js): "b4" y "v4" suenan igual leídos en voz alta, y
     equivocarse de columna es equivocarse de jugada. */
  function casillaHablada(sq) {
    if (window.BlindNotation && BlindNotation.squareSpoken) return BlindNotation.squareSpoken(sq);
    return sq;
  }
  var NOMBRE = { k: "rey", q: "dama", r: "torre", b: "alfil", n: "caballo", p: "peón" };
  var PLURAL = { k: "reyes", q: "damas", r: "torres", b: "alfiles", n: "caballos", p: "peones" };
  // "la torre blanca", "el caballo negro": el género de la pieza va escrito,
  // no deducido. "torre blanco" lo dice el lector tal cual y suena a error.
  var FEMENINA = { q: true, r: true };
  function piezaDicha(p) {
    if (!p) return "";
    var color = p.color === "w" ? (FEMENINA[p.type] ? "blanca" : "blanco") : (FEMENINA[p.type] ? "negra" : "negro");
    return NOMBRE[p.type] + " " + color;
  }
  function listaEspanola(xs) {
    if (!xs.length) return "";
    if (xs.length === 1) return xs[0];
    return xs.slice(0, -1).join(", ") + " y " + xs[xs.length - 1];
  }

  var COLUMNAS = ["a", "b", "c", "d", "e", "f", "g", "h"];

  /* ---------------------------------------------------------- la región viva
     Una sola por tablero, `sr-only`, con `role="status"`. Va con role y SIN un
     `aria-live` encima: `role="status"` ya vale por un aria-live cortés, y
     ponerle "assertive" además deja a los tres lectores de pantalla decidiendo
     entre dos cosas que se contradicen — JAWS lo interrumpe todo y VoiceOver a
     veces no lo lee.
     El vaciar y repoblar con un retraso no es una manía: sin eso, pedir dos
     veces seguidas lo mismo (la posición, por ejemplo) no se anuncia la segunda,
     porque el texto no cambió y la región viva solo reacciona a los cambios. */
  var ESTILO_ID = "tablero-accesible-css";
  function asegurarEstilo() {
    if (document.getElementById(ESTILO_ID)) return;
    var st = document.createElement("style");
    st.id = ESTILO_ID;
    st.textContent = [
      ".ta-voz { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;",
      "  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }",
      /* El foco del teclado sobre una casilla tiene que VERSE: quien navega con
         teclado sin lector de pantalla no tiene otra forma de saber dónde está,
         y los tableros pintan las casillas con su propio color de fondo. */
      "[data-square]:focus-visible { outline: 3px solid #f0b429; outline-offset: -3px; z-index: 2; }",
      "@media (forced-colors: active) { [data-square]:focus-visible { outline-color: Highlight; } }",
    ].join("\n");
    document.head.appendChild(st);
  }

  var seqTablero = 0;

  function montar(tablero, cfg) {
    if (!tablero) return null;
    if (tablero.__tableroAccesible) return tablero.__tableroAccesible;
    cfg = cfg || {};
    asegurarEstilo();

    var voz = document.createElement("p");
    // Dos clases: `ta-voz` esconde a la vista, `ta-dice` la identifica. La línea
    // fija de "cómo se anda" comparte el escondite pero no es lo mismo, y
    // confundirlas deja mirando un párrafo que nunca cambia.
    voz.className = "ta-voz ta-dice";
    voz.setAttribute("role", "status");
    (tablero.parentNode || document.body).insertBefore(voz, tablero.nextSibling);

    var enfocada = null;      // el nombre de la casilla que tiene el tabindex
    var pintando = false;

    function casillas() {
      return Array.prototype.slice.call(tablero.querySelectorAll("[data-square]"));
    }
    function lado() {
      var n = casillas().length;
      var l = Math.round(Math.sqrt(n));
      return l * l === n ? l : 0;
    }
    function juego() {
      try { return typeof cfg.juego === "function" ? cfg.juego() : null; } catch (e) { return null; }
    }
    function pieza(sq) {
      var g = juego();
      try { return g && g.get ? g.get(sq) : null; } catch (e) { return null; }
    }
    /* Cuándo valen los atajos de una sola tecla. Por omisión, en Modo Adaptado:
       fuera de él, una "p" sobre el tablero es la tecla de navegación rápida del
       lector de pantalla de quien está leyendo la página, y robársela es peor
       que no tener el atajo. */
    function conAtajos() {
      if (typeof cfg.atajos === "function") return !!cfg.atajos();
      return document.documentElement.classList.contains("adaptive-mode");
    }

    function decir(texto) {
      if (!texto) return;
      voz.textContent = "";
      window.setTimeout(function () { voz.textContent = texto; }, 50);
      if (window.BlindNotation && BlindNotation.speak) BlindNotation.speak(texto);
    }

    // ------------------------------------------------------- lo que dice cada casilla
    /* Qué dice cada casilla. Lo escribe ESTE módulo y no cada página, por lo
       de siempre: diez versiones de "eva 4, caballo blanco" se habrían ido
       separando, y ya se veía —Aperturas dejaba las 64 casillas mudas y
       Coordenadas las hacía decir "Casilla" a las 64, o sea un tablero que con
       lector de pantalla no se podía ni mirar—.
       Lo que la página sí decide es el ESTADO de una casilla (seleccionada, se
       puede capturar ahí, es la última jugada): lo pone en `data-estado` y se
       añade al final. Un aria-label escrito a mano por la página se respeta,
       pero entonces es suyo y este módulo no lo toca más. */
    /* Hay tableros que TAPAN casillas a propósito, y eso no se puede contar como
       si estuvieran vacías. En Niebla de Guerra el tablero visual pinta 🌫️ sobre
       lo que la posición no deja ver; decir ahí "vacía" no es un descuido de
       redacción, es contarle a quien no ve la pantalla algo distinto de lo que
       el tablero dice —y encima falso, porque ahí puede haber una pieza rival—.
       Lo pregunta la PARTIDA (`juego().oculta(casilla)`) y no una opción de este
       módulo, porque es ahí donde vive ese conocimiento: quien arma el tablero
       sabe qué esconde. Una partida que no lo traiga se comporta como siempre, y
       la variante que mañana esconda algo lo hereda sin tocar nada de acá. */
    function escondida(sq) {
      var g = juego();
      try { return !!(g && g.oculta && g.oculta(sq)); } catch (e) { return false; }
    }
    function describir(sq) {
      // Sin partida detrás —Coordenadas, por ejemplo, tiene el tablero vacío a
      // propósito— se dice solo el nombre: repetir "vacía" sesenta y cuatro
      // veces es ruido, y no aporta nada que no se sepa ya.
      if (!juego()) return casillaHablada(sq);
      if (escondida(sq)) return casillaHablada(sq) + ", cubierta por la niebla";
      var p = pieza(sq);
      return casillaHablada(sq) + (p ? ", " + piezaDicha(p) : ", vacía");
    }
    function rotular(celda) {
      if (celda.dataset.etiquetaPropia) return;
      var base = describir(celda.dataset.square);
      celda.setAttribute("aria-label", celda.dataset.estado ? base + ", " + celda.dataset.estado : base);
    }

    // ------------------------------------------------------------- el tabindex
    /* Una sola parada de tabulador para todo el tablero, y dentro se anda con
       las flechas — el patrón de rejilla de ARIA. Con los 64 botones tabbables
       que había antes, llegar al botón de abajo costaba sesenta y cinco Tab. */
    function repartirTabindex() {
      var cs = casillas();
      if (!cs.length) return;
      var hay = enfocada && cs.some(function (c) { return c.dataset.square === enfocada; });
      if (!hay) enfocada = cs[0].dataset.square;
      cs.forEach(function (c) {
        c.tabIndex = c.dataset.square === enfocada ? 0 : -1;
        if (c.tagName !== "BUTTON" && !c.getAttribute("role")) c.setAttribute("role", "button");
        rotular(c);
      });
    }

    function celdaDe(sq) {
      return tablero.querySelector('[data-square="' + sq + '"]');
    }

    function enfocar(sq, avisar) {
      var celda = celdaDe(sq);
      if (!celda) return false;
      enfocada = sq;
      repartirTabindex();
      try { celda.focus(); } catch (e) {}
      // Al mover el foco NO se anuncia por la región viva: el lector de pantalla
      // acaba de leer el aria-label de la casilla, y decirlo otra vez lo repite
      // todo dos veces. Solo se anuncia lo que el foco no dice (un atajo, un
      // error), o cuando quien llama lo pide a propósito.
      if (avisar) decir(describir(sq));
      return true;
    }

    // -------------------------------------------------------------- moverse
    /* El tablero se puede estar viendo girado (quien juega con negras lo ve al
       revés), así que moverse "a la derecha" es moverse a la celda siguiente EN
       EL DOM, no a la columna siguiente del alfabeto. Con la cuenta hecha sobre
       las letras, las flechas irían al revés para la mitad de los ejercicios y
       no fallaría nada: simplemente el tablero se movería al lado contrario. */
    function indiceDe(sq) {
      var cs = casillas();
      for (var i = 0; i < cs.length; i++) if (cs[i].dataset.square === sq) return i;
      return -1;
    }
    function porIndice(i) {
      var cs = casillas();
      return cs[i] ? cs[i].dataset.square : null;
    }
    function mover(dFila, dCol) {
      var l = lado();
      if (!l) return;
      var i = indiceDe(enfocada);
      if (i < 0) return;
      var f = Math.floor(i / l), c = i % l;
      var nf = Math.min(l - 1, Math.max(0, f + dFila));
      var nc = Math.min(l - 1, Math.max(0, c + dCol));
      if (nf === f && nc === c) return;
      enfocar(porIndice(nf * l + nc));
    }
    function irABorde(que) {
      var l = lado();
      if (!l) return;
      var i = indiceDe(enfocada);
      var f = Math.floor(i / l), c = i % l;
      if (que === "inicioFila") enfocar(porIndice(f * l));
      else if (que === "finFila") enfocar(porIndice(f * l + l - 1));
      else if (que === "arriba") enfocar(porIndice(c));
      else if (que === "abajo") enfocar(porIndice((l - 1) * l + c));
    }

    // --------------------------------------------------------- los atajos
    function piezasPorTipo(tipo) {
      var g = juego();
      if (!g || !g.get) return [];
      var out = [];
      casillas().forEach(function (c) {
        var p = null;
        try { p = g.get(c.dataset.square); } catch (e) {}
        if (p && p.type === tipo) out.push({ sq: c.dataset.square, p: p });
      });
      return out;
    }

    /* Sobre un tablero que esconde casillas, TODO lo que se cuente es un
       recuento de lo visible y nada más. Decirlo importa: "cuatro peones
       blancos" sin esta coletilla se oye como el inventario de la partida, y lo
       que hay es el de lo que se alcanza a ver — que es justo lo que en Niebla
       de Guerra hay que deducir, no dar por sabido. */
    function soloLoQueVes() {
      var g = juego();
      return g && g.oculta ? " Es solo lo que ves: la niebla tapa el resto." : "";
    }

    function decirPosicion() {
      var g = juego();
      if (!g) { decir("Esta página no lleva la cuenta de la posición."); return; }
      if (window.BlindNotation && BlindNotation.positionSentence) decir(BlindNotation.positionSentence(g) + soloLoQueVes());
    }

    function decirTipo(tipo) {
      var g = juego();
      if (!g) { decir("Esta página no lleva la cuenta de la posición."); return; }
      var encontradas = piezasPorTipo(tipo);
      if (!encontradas.length) {
        decir(g.oculta ? "No ves ningún " + NOMBRE[tipo] + " ahora mismo." : "No hay " + PLURAL[tipo] + " en el tablero.");
        return;
      }
      var por = { w: [], b: [] };
      encontradas.forEach(function (x) { por[x.p.color].push(casillaHablada(x.sq)); });
      var partes = [];
      if (por.w.length) partes.push((por.w.length === 1 ? NOMBRE[tipo] + " blanc" + (FEMENINA[tipo] ? "a" : "o") : PLURAL[tipo] + " blanc" + (FEMENINA[tipo] ? "as" : "os")) + " en " + listaEspanola(por.w));
      if (por.b.length) partes.push((por.b.length === 1 ? NOMBRE[tipo] + " negr" + (FEMENINA[tipo] ? "a" : "o") : PLURAL[tipo] + " negr" + (FEMENINA[tipo] ? "as" : "os")) + " en " + listaEspanola(por.b));
      decir(partes.join(". ") + "." + soloLoQueVes());
    }

    // "m": qué puede hacer la pieza que está bajo el foco. Es la pregunta que se
    // hace de verdad frente a un tablero, y sin verlo no hay forma de contestarla.
    function decirJugadas(sq) {
      var g = juego();
      if (!g || !g.moves) { decir("Esta página no lleva la cuenta de las jugadas."); return; }
      if (escondida(sq)) { decir(casillaHablada(sq) + " está cubierta por la niebla: no sabes qué hay ahí."); return; }
      var p = pieza(sq);
      if (!p) { decir(casillaHablada(sq) + " está vacía."); return; }
      /* Con niebla, las jugadas de una pieza del RIVAL no se pueden contar: su
         camino pasa por casillas que no ves, así que la partida visible devuelve
         la lista vacía en cuanto le toca mover. Sin esta línea esa lista vacía se
         anunciaba como "no tiene jugadas ahora", que es falso y se oye como
         información buena. */
      if (g.oculta && g.miColor && p.color !== g.miColor) {
        decir("En " + casillaHablada(sq) + " hay " + piezaDicha(p) + ", del rival: con la niebla no puedes saber a dónde puede ir.");
        return;
      }
      var ms = [];
      try { ms = g.moves({ square: sq, verbose: true }) || []; } catch (e) {}
      if (!ms.length) {
        var deQuien = p.color === g.turn() ? "" : " Ahora no le toca mover a ese color.";
        decir(piezaDicha(p) + " en " + casillaHablada(sq) + " no tiene jugadas ahora." + deQuien);
        return;
      }
      decir(piezaDicha(p) + " en " + casillaHablada(sq) + " puede ir a " +
        listaEspanola(ms.map(function (m) {
          return casillaHablada(m.to) + (m.flags.indexOf("c") >= 0 || m.flags.indexOf("e") >= 0 ? " capturando" : "");
        })) + ".");
    }

    var DIRS = [
      [-1, 0, "arriba"], [1, 0, "abajo"], [0, -1, "izquierda"], [0, 1, "derecha"],
      [-1, -1, "arriba a la izquierda"], [-1, 1, "arriba a la derecha"],
      [1, -1, "abajo a la izquierda"], [1, 1, "abajo a la derecha"],
    ];
    function vecina(sq, dFila, dCol) {
      var l = lado();
      var i = indiceDe(sq);
      if (i < 0 || !l) return null;
      var f = Math.floor(i / l) + dFila, c = (i % l) + dCol;
      if (f < 0 || f >= l || c < 0 || c >= l) return null;
      return porIndice(f * l + c);
    }
    function decirAlrededor(sq, modo) {
      var dirs = modo === "lado" ? DIRS.slice(0, 4) : DIRS;
      if (modo === "rayos") {
        var lejos = [];
        DIRS.forEach(function (d) {
          var actual = vecina(sq, d[0], d[1]);
          while (actual) {
            /* El rayo se CORTA en la niebla, no la atraviesa. Siguiendo de largo
               se anunciaría como "la primera pieza en esa dirección" una que está
               detrás de lo que no se ve, y con eso quien no mira la pantalla
               jugaría dando por libre un camino que a lo mejor está tapado. */
            if (escondida(actual)) { lejos.push(d[2] + ": niebla desde " + casillaHablada(actual)); break; }
            var p = pieza(actual);
            if (p) { lejos.push(d[2] + ": " + piezaDicha(p) + " en " + casillaHablada(actual)); break; }
            actual = vecina(actual, d[0], d[1]);
          }
        });
        decir(lejos.length
          ? "Desde " + casillaHablada(sq) + ", lo primero en cada dirección — " + lejos.join("; ") + "."
          : "Desde " + casillaHablada(sq) + " no hay ninguna pieza en ninguna dirección.");
        return;
      }
      var partes = [];
      var tapadas = 0;
      dirs.forEach(function (d) {
        var v = vecina(sq, d[0], d[1]);
        if (!v) return;
        if (escondida(v)) { tapadas++; return; }
        var p = pieza(v);
        if (p) partes.push(d[2] + ": " + piezaDicha(p) + " en " + casillaHablada(v));
      });
      var niebla = tapadas ? " " + (tapadas === 1 ? "Una casilla de al lado está cubierta por la niebla." : tapadas + " casillas de al lado están cubiertas por la niebla.") : "";
      decir((partes.length
        ? "Alrededor de " + casillaHablada(sq) + " — " + partes.join("; ") + "."
        : "Alrededor de " + casillaHablada(sq) + " no hay ninguna pieza a la vista.") + niebla);
    }

    // Saltar a la siguiente pieza de un tipo: minúscula adelante, mayúscula
    // hacia atrás. Es cómo se recorre un tablero de verdad — "¿dónde tengo los
    // caballos?" — en vez de pasar por las 64 casillas.
    function saltarA(tipo, adelante) {
      var cs = casillas();
      var i = indiceDe(enfocada);
      if (i < 0) return;
      for (var paso = 1; paso <= cs.length; paso++) {
        var j = adelante ? (i + paso) % cs.length : (i - paso + cs.length) % cs.length;
        var sq = cs[j].dataset.square;
        var p = pieza(sq);
        // Sin avisar: el foco acaba de llegar ahí y el lector de pantalla ya
        // leyó el aria-label de la casilla. Decirlo también por la región viva
        // lo repite todo dos veces seguidas, que es justo lo que cansa.
        if (p && p.type === tipo) { enfocar(sq); return; }
      }
      decir("No hay " + PLURAL[tipo] + " en el tablero.");
    }

    function irAlCuadro() {
      var destino = typeof cfg.cuadro === "function" ? cfg.cuadro() : null;
      if (typeof destino === "string") destino = document.getElementById(destino);
      if (!destino) destino = document.querySelector(".cc-caja .cc-input, #cmd-input, #blind-move-input");
      if (destino) { try { destino.focus(); } catch (e) {} }
      else decir("Esta página no tiene recuadro para escribir.");
    }

    // ------------------------------------------------------------- el teclado
    tablero.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey) return;
      var celda = e.target.closest ? e.target.closest("[data-square]") : null;
      if (!celda) return;
      enfocada = celda.dataset.square;
      var k = e.key;

      if (k === "ArrowUp") { e.preventDefault(); mover(-1, 0); return; }
      if (k === "ArrowDown") { e.preventDefault(); mover(1, 0); return; }
      if (k === "ArrowLeft") { e.preventDefault(); mover(0, -1); return; }
      if (k === "ArrowRight") { e.preventDefault(); mover(0, 1); return; }
      if (k === "Home") { e.preventDefault(); irABorde("inicioFila"); return; }
      if (k === "End") { e.preventDefault(); irABorde("finFila"); return; }
      if (k === "PageUp") { e.preventDefault(); irABorde("arriba"); return; }
      if (k === "PageDown") { e.preventDefault(); irABorde("abajo"); return; }
      if (k === "Enter" || k === " ") {
        // Las casillas son botones de verdad: el navegador ya dispara su clic.
        // Solo hay que atajarlo cuando no lo son.
        if (celda.tagName !== "BUTTON") { e.preventDefault(); celda.click(); }
        return;
      }
      if (!conAtajos() || k.length !== 1) return;

      var min = k.toLowerCase();
      var sq = enfocada;
      if (e.altKey) {
        if (min === "x") { e.preventDefault(); decirAlrededor(sq, "rayos"); }
        return;
      }
      if (min === "o") { e.preventDefault(); decir(describir(sq)); return; }
      if (min === "z" || min === "t") { e.preventDefault(); decirPosicion(); return; }
      if (min === "m") { e.preventDefault(); decirJugadas(sq); return; }
      if (min === "x") { e.preventDefault(); decirAlrededor(sq, k === "X" ? "anillo" : "lado"); return; }
      if (min === "i") { e.preventDefault(); irAlCuadro(); return; }
      if ("kqrbnp".indexOf(min) >= 0) { e.preventDefault(); saltarA(min, k === min); return; }
      if (e.code && e.code.indexOf("Digit") === 0) {
        var d = parseInt(e.code.slice(5), 10);
        var l = lado();
        if (!(d >= 1 && d <= l)) return;
        e.preventDefault();
        var i = indiceDe(sq);
        var f = Math.floor(i / l), c = i % l;
        // Sin shift, el número es la FILA del tablero tal como se ve: la de
        // abajo es la 1. Con shift, la columna, contada desde la izquierda.
        // Tampoco acá: el foco que llega a la casilla ya la anuncia.
        if (e.shiftKey) enfocar(porIndice(f * l + (d - 1)));
        else enfocar(porIndice((l - d) * l + c));
      }
    });

    tablero.addEventListener("focusin", function (e) {
      var celda = e.target.closest ? e.target.closest("[data-square]") : null;
      if (celda) { enfocada = celda.dataset.square; repartirTabindex(); }
    });

    /* ------------------------------------------------------------ el repintado
       Las páginas vacían el tablero y lo vuelven a llenar en cada jugada. Sin
       esto, el tabindex se pierde —vuelven las 64 paradas— y, peor, el foco se
       va al <body>: quien estaba en e4 se queda sin saber dónde quedó, que es
       justo el momento en que más falta hace. */
    var observador = new MutationObserver(function () {
      if (pintando) return;
      pintando = true;
      observador.disconnect();
      var teniaFoco = tablero.contains(document.activeElement);
      repartirTabindex();
      if (teniaFoco && enfocada) { var c = celdaDe(enfocada); if (c) { try { c.focus(); } catch (e) {} } }
      observador.observe(tablero, { childList: true, subtree: true });
      pintando = false;
    });
    repartirTabindex();
    observador.observe(tablero, { childList: true, subtree: true });

    /* ------------------------------------------------- qué es esto para el lector
       En Modo Adaptado el tablero se anuncia como `application`, y no es un
       adorno: con el rol de siempre, NVDA y JAWS están en su modo de lectura y
       se quedan ellos con las teclas de una letra —"p" es "párrafo siguiente"—,
       así que los atajos de acá no llegarían nunca y no fallaría nada: quien los
       intente oye moverse el lector de pantalla y no el tablero. Con
       `application` el foco manda y las teclas llegan enteras. Fuera del Modo
       Adaptado se deja el rol de grupo, para no quitarle a nadie la navegación
       normal de la página que no pidió cambiar. */
    /* Y cómo se navega, DICHO. Un tablero que se anuncia como aplicación pero no
       explica que se anda con las flechas es un tablero donde quien entra se
       queda quieto: los atajos no se adivinan, y en el modo de aplicación las
       teclas de navegación del lector de pantalla ya no contestan. La línea va
       en un párrafo escondido a la vista y enganchada con `aria-describedby`,
       que es lo que el lector lee UNA vez al entrar al tablero — no en cada
       casilla. */
    var ayudaId = "ta-como-" + (++seqTablero);
    var comoSeAnda = document.createElement("p");
    comoSeAnda.className = "ta-voz";
    comoSeAnda.id = ayudaId;
    comoSeAnda.textContent = "Las flechas mueven entre casillas. Intro o espacio elige. "
      + "Con el tablero enfocado: o dice qué hay en esta casilla, z la posición entera, "
      + "m a dónde puede ir esta pieza, x las casillas de alrededor, "
      + "las letras k, q, r, b, n y p saltan a la siguiente pieza de ese tipo, "
      + "los números 1 a 8 van a esa fila y con mayúsculas a esa columna, "
      + "e i vuelve al recuadro donde se escribe.";
    (tablero.parentNode || document.body).insertBefore(comoSeAnda, tablero);

    function rolSegunModo() {
      var adaptado = document.documentElement.classList.contains("adaptive-mode");
      tablero.setAttribute("role", adaptado ? "application" : "group");
      tablero.setAttribute("aria-roledescription", "tablero de ajedrez");
      if (!tablero.getAttribute("aria-label") && cfg.nombre) tablero.setAttribute("aria-label", cfg.nombre);
      // Fuera del Modo Adaptado los atajos no valen, así que prometerlos sería
      // mandar a alguien a apretar teclas que no hacen nada.
      if (adaptado) tablero.setAttribute("aria-describedby", ayudaId);
      else tablero.removeAttribute("aria-describedby");
    }
    rolSegunModo();
    document.addEventListener("adaptivemode:change", rolSegunModo);

    var api = {
      el: tablero,
      decir: decir,
      enfocar: function (sq) { return enfocar(sq, true); },
      enfocada: function () { return enfocada; },
      refrescar: repartirTabindex,
      describir: describir,
      decirPosicion: decirPosicion,
      decirTipo: decirTipo,
      decirJugadas: decirJugadas,
      decirAlrededor: decirAlrededor,
    };
    tablero.__tableroAccesible = api;
    return api;
  }

  return { montar: montar, casillaHablada: casillaHablada, piezaDicha: piezaDicha, listaEspanola: listaEspanola, NOMBRE: NOMBRE, PLURAL: PLURAL };
})();
