/* ===== Ajedrez Integral — el cuadro de comandos de los ejercicios =====
 *
 * Un ejercicio que SOLO se puede contestar tocando el tablero no se puede
 * contestar con lector de pantalla, y eso no da ningún error: la página
 * funciona, el ejercicio se ve, y quien no puede verlo simplemente no avanza.
 * Este módulo pone al lado del ejercicio un recuadro donde se escribe la
 * respuesta —una jugada, una casilla o la letra de una opción— y la página la
 * recibe igual que si se hubiera hecho clic.
 *
 * Existía el mismo recuadro escrito tres veces (Mates, Aprender, Desafíos y
 * Practicar tenían su #blind-panel; 4×4 su #cmd-form; los visores de los cursos
 * su .f100-cmd) y las tres versiones entendían cosas distintas: las de Entreno
 * solo aceptaban "e1 g1" —o sea, no entendían "Cf3", que es como se escribe una
 * jugada— y ninguna dejaba preguntar nada. Aquellas cuatro se reemplazaron por
 * esta, así que hoy en todo Entrenamiento se escribe igual.
 *
 * Dos decisiones que conviene no deshacer:
 *
 * 1. NO REEMPLAZA AL TABLERO, SE SUMA. Mates y sus hermanas escondían el tablero
 *    en Modo Adaptado y dejaban solo el recuadro; ya no, y era el peor de los
 *    dos mundos: la única forma de saber qué había era oír la posición entera y
 *    acordarse de las treinta y dos piezas. Ahora el tablero se queda y se
 *    recorre con el teclado (js/tablero-accesible.js). Alguien con baja visión
 *    usa las dos cosas —ve el tablero ampliado y escribe la jugada porque
 *    arrastrar una pieza de 40 px con lupa es un suplicio—, y quien acompaña a
 *    un alumno necesita ver lo que él está contestando.
 *
 * 2. LO QUE DECIDE SI SE VE ES EL CSS (`html.adaptive-mode`), no el JavaScript.
 *    Así encender y apagar el Modo Adaptado surte efecto al instante, sin que
 *    la página tenga que volver a pintar el ejercicio — la misma regla que
 *    js/curso-adaptado.js. El recuadro se monta SIEMPRE; el modo solo lo
 *    destapa. Fuera del modo va con `display: none` y no `sr-only`: un campo de
 *    texto invisible pero enfocable es una parada de tabulador fantasma para
 *    quien ve la página.
 *
 * Uso:
 *     const cmd = CuadroComandos.montar(document.getElementById('donde'), {
 *       etiqueta: 'Escribe tu respuesta',
 *       onEnviar: function (texto, api) { ... api.decir('…'); }
 *     });
 *     cmd.posicion(game);          // la posición en palabras, encima del cuadro
 *                                  // (con la cuenta ciega, encima del TABLERO)
 *     cmd.etiqueta('Escribe la letra de la opción');
 *
 * Y aparte, las tres lecturas que necesita quien reciba ese texto:
 *     CuadroComandos.opcionPedida(texto, cuantas)  -> 0..n-1 | null
 *     CuadroComandos.casillaPedida(texto)          -> "e4" | null
 *     CuadroComandos.esNoSe(texto)                 -> true | false
 */
window.CuadroComandos = (function () {
  "use strict";

  var LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  // Las columnas se dicen "anna, bella, cesar…" en todo el sitio
  // (js/blind-notation.js), así que también se tienen que poder ESCRIBIR así:
  // quien oye "eva 4" y teclea "eva 4" tiene que llegar a e4.
  var COLUMNA_HABLADA = {
    anna: "a", bella: "b", cesar: "c", david: "d",
    eva: "e", felix: "f", gustav: "g", hector: "h",
  };

  function sinTildes(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function normalizar(texto) {
    return sinTildes(texto).toLowerCase().replace(/\s+/g, " ").trim();
  }

  function letra(i) { return LETRAS[i] || String(i + 1); }

  // "no lo sé" es una respuesta de verdad del diagnóstico y del examen de
  // arbitraje —vale cero como fallar, pero se guarda aparte—, así que tiene que
  // poder escribirse igual que se puede apretar.
  function esNoSe(texto) {
    var t = normalizar(texto).replace(/[.!?]+$/, "");
    return /^(no( lo)? se( todavia)?|ns|ni idea|paso|en blanco|dejar en blanco|blanco)$/.test(t);
  }

  /* "B", "b)", "opción B", "la b", "2" → el índice de esa opción.
     Devuelve null si no se entiende o si se sale de la cantidad de opciones:
     mejor decir "no te entendí" que marcar cualquier cosa. */
  function opcionPedida(texto, cuantas) {
    var t = normalizar(texto).replace(/[).:\-]+$/, "").replace(/^(la |el )?opcion\s+/, "").replace(/^(la|el)\s+/, "");
    if (/^[a-z]$/.test(t)) {
      var i = LETRAS.indexOf(t.toUpperCase());
      return i >= 0 && i < cuantas ? i : null;
    }
    if (/^\d+$/.test(t)) {
      var n = parseInt(t, 10) - 1;
      return n >= 0 && n < cuantas ? n : null;
    }
    return null;
  }

  /* "e4", "e 4", "eva 4", "Eva4" → "e4". */
  function casillaPedida(texto) {
    var t = normalizar(texto).replace(/[.,]/g, "");
    var m = t.match(/^([a-h])\s?([1-8])$/);
    if (m) return m[1] + m[2];
    m = t.match(/^([a-z]+)\s?([1-8])$/);
    if (m && COLUMNA_HABLADA[m[1]]) return COLUMNA_HABLADA[m[1]] + m[2];
    return null;
  }

  /* La jugada escrita. La resuelve ComandosTablero.jugadaEscrita(), que la busca
     entre las jugadas LEGALES en vez de probar el texto sobre la partida: así
     vale también para los motores que no son chess.js —Desafíos usa el suyo,
     porque sus posiciones no siempre tienen reyes— y no deja la partida movida
     por el camino. Si aquel módulo no está, cae en js/chess-move-parser.js, que
     es lo que había antes.
     Ojo, el contrato no cambió: si acierta, la jugada QUEDA HECHA en `game`. */
  function jugadaPedida(game, texto) {
    if (window.ComandosTablero && ComandosTablero.jugadaEscrita) {
      var mv = ComandosTablero.jugadaEscrita(game, texto);
      if (!mv) return null;
      try { return game.move({ from: mv.from, to: mv.to, promotion: mv.promotion || undefined }); } catch (e) { return null; }
    }
    if (typeof ChessMoveParser === "undefined") return null;
    return ChessMoveParser.tryParseMove(game, texto);
  }

  /* La posición en palabras. Sale de js/blind-notation.js, que es donde vive la
     forma hablada de las casillas y —lo que más importa— los plurales escritos
     de las piezas: "alfiles", no "alfils". */
  function posicionEnPalabras(game) {
    if (window.BlindNotation && BlindNotation.positionSentence) return BlindNotation.positionSentence(game);
    return "";
  }

  /* La posición en dos listas, «Blancas» y «Negras», cada una bajo su <h3>
     (va debajo del <h2> «Piezas» del recuadro), y al final quién juega. La
     pinta js/blind-notation.js, que es la única copia del sitio. */
  function pintarPorColor(destino, game) {
    destino.textContent = "";
    if (window.BlindNotation && BlindNotation.pintarPiezas) BlindNotation.pintarPiezas(destino, game, { titulo: false });
  }

  /* La cuenta marcada como ciega por administración (`modo-ciego` en el
     <html>). Se pregunta cada vez y no una al montar: la primera visita monta
     el recuadro antes de que la base conteste. */
  function cuentaCiega() {
    return document.documentElement.classList.contains("modo-ciego");
  }

  /* Una huella de la posición para saber si cambió. Con fen() si la partida lo
     tiene; si no, casilla por casilla. */
  function huella(game) {
    if (typeof game.fen === "function") return game.fen();
    var t = "";
    "abcdefgh".split("").forEach(function (f) {
      for (var r = 1; r <= 8; r++) { var c = game.get(f + r); t += c ? c.color + c.type : "."; }
    });
    return t;
  }

  function seVe(el) {
    if (typeof el.checkVisibility === "function") return el.checkVisibility();
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  // ---------------------------------------------------------------- el estilo
  // Va en su propia hoja inyectada y no en css/styles.css porque estas páginas
  // no comparten hoja: el diagnóstico usa Tailwind y Ejercicios por tema tiene
  // su propia paleta de variables. Todo se pinta con `currentColor` y con lo
  // que herede, así que el recuadro se ve como la página donde cae.
  var ESTILO = [
    ".cc-caja { display: none; }",
    "html.adaptive-mode .cc-caja { display: block; margin: 1rem 0; padding: .9rem 1rem;",
    "  border: 2px solid currentColor; border-radius: .6rem; }",
    ".cc-pos-titulo { margin: 0 0 .3rem; font-size: 1.05rem; font-weight: 700; }",
    ".cc-pos .bn-piezas-color { margin: .4rem 0 .1rem; font-size: 1rem; font-weight: 700; }",
    ".cc-pos .bn-piezas-lista { margin: 0 0 .3rem; padding-left: 1.2rem; list-style: disc; }",
    ".cc-pos { margin: 0 0 .6rem; font-size: 1rem; line-height: 1.6; }",
    /* Fuera del recuadro cae a veces en una grilla o una fila flex (el visor
       de los cursos): ocupa el renglón entero, para no correr al tablero de
       su columna. */
    ".cc-piezas-fuera { grid-column: 1 / -1; flex: 1 1 100%; }",
    ".cc-form { display: flex; flex-wrap: wrap; gap: .5rem; align-items: flex-end; }",
    ".cc-campo { flex: 1 1 12rem; }",
    ".cc-etiqueta { display: block; font-size: .9rem; margin-bottom: .25rem; }",
    ".cc-input { width: 100%; padding: .5rem .6rem; font-size: 1.05rem; font-family: inherit;",
    "  color: inherit; background: rgba(127,127,127,.12); border: 2px solid currentColor;",
    "  border-radius: .4rem; }",
    ".cc-btn { padding: .5rem 1rem; font-size: 1rem; font-family: inherit; font-weight: 700;",
    "  color: inherit; background: rgba(127,127,127,.12); border: 2px solid currentColor;",
    "  border-radius: .4rem; cursor: pointer; }",
    ".cc-ayuda, .cc-dictar-pista { margin: .5rem 0 0; font-size: .85rem; opacity: .85; }",
    ".cc-msg { margin: .4rem 0 0; font-size: .95rem; font-weight: 600; min-height: 1.3em; }",
    /* `.cc-ayuda-det` NO va acá: vive en css/styles.css porque la usan dos
       módulos —este y js/juegos-blind.js— y el bloque de ayuda tiene que verse
       igual en un ejercicio de Entrenamiento y en una partida de Juegos. Puesta
       en el estilo que inyecta este archivo, la de Juegos salía sin formato
       —encabezados del tamaño del texto y sin separación— y no fallaba nada. */
  ].join("\n");

  var estiloPuesto = false;
  function ponerEstilo() {
    if (estiloPuesto) return;
    estiloPuesto = true;
    var st = document.createElement("style");
    st.id = "cuadro-comandos-estilo";
    st.textContent = ESTILO;
    document.head.appendChild(st);
  }

  var seq = 0;

  function montar(destino, cfg) {
    if (!destino) return null;
    cfg = cfg || {};
    ponerEstilo();
    var id = "cc-input-" + (++seq);

    var caja = document.createElement("div");
    caja.className = "cc-caja";

    // La posición va ARRIBA del cuadro y no al final del ejercicio: leerla y
    // contestarla son el mismo gesto (misma razón que en js/curso-adaptado.js).
    // Región viva, para que cada cambio se vuelva a leer solo.
    /* Con `encabezadoPosicion`, o con la cuenta ciega, la posición no es un
       renglón sino un encabezado «Piezas» y debajo una lista por color, cada
       una con el suyo («Blancas», «Negras»): con la H se llega directo a la
       posición y, desde ahí, a las piezas del rival. Lo pidió el grupo de
       personas ciegas para la Racha táctica, y después para TODOS los
       ejercicios: con la cuenta ciega va siempre (ver «Las piezas, siempre
       bajo su encabezado» en docs/decisiones/accesibilidad.md). */
    function porColor() { return !!cfg.encabezadoPosicion || cuentaCiega(); }
    var pos = document.createElement("div");
    pos.className = "cc-pos";
    /* `posicionViva: false` la deja escrita pero muda. Es para un tablero que se
       mueve SOLO —la clase en vivo, donde mueve el profesor—: ahí dictar las
       treinta y dos piezas en cada jugada ajena tapa lo único que cambió, que es
       la jugada. Esa página anuncia la jugada y la posición se pide. */
    function viva(si) {
      if (si && cfg.posicionViva !== false) {
        pos.setAttribute("aria-live", "polite");
        pos.setAttribute("aria-atomic", "true");
      } else {
        pos.removeAttribute("aria-live");
        pos.removeAttribute("aria-atomic");
      }
    }
    viva(true);
    /* El encabezado va SIEMPRE en el recuadro y se destapa cuando hay piezas
       que poner debajo. Fuera de la cuenta ciega y sin `encabezadoPosicion`,
       la posición sigue en un renglón, sin encabezado. */
    var tit = document.createElement("h2");
    tit.className = "cc-pos-titulo bn-piezas-titulo";
    tit.textContent = cfg.encabezadoPosicion || "Piezas";
    tit.hidden = true;
    /* El encabezado y la lista van juntos en un bloque, que con la cuenta ciega
       se muda ANTES del tablero (ver `colocar()`, más abajo). */
    var bloque = document.createElement("div");
    bloque.className = "cc-piezas";
    bloque.appendChild(tit);
    bloque.appendChild(pos);
    caja.appendChild(bloque);

    var form = document.createElement("form");
    form.className = "cc-form";
    var campo = document.createElement("div");
    campo.className = "cc-campo";
    var lab = document.createElement("label");
    lab.className = "cc-etiqueta";
    lab.setAttribute("for", id);
    lab.textContent = cfg.etiqueta || "Escribe tu respuesta";
    var input = document.createElement("input");
    input.type = "text";
    input.id = id;
    input.className = "cc-input";
    input.autocomplete = "off";
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("spellcheck", "false");
    campo.appendChild(lab);
    campo.appendChild(input);
    var btn = document.createElement("button");
    btn.type = "submit";
    btn.className = "cc-btn";
    btn.textContent = "Responder";
    form.appendChild(campo);
    form.appendChild(btn);
    caja.appendChild(form);

    var ayuda = document.createElement("p");
    ayuda.className = "cc-ayuda";
    caja.appendChild(ayuda);

    /* Cómo oír la posición despacio, dicho en el recuadro: quien la pone en su
       tablero de verdad no llega a seguirla de corrido, y un comando que no se
       conoce no se usa. Solo donde hay tablero y quien dicte. Va debajo de la
       ayuda y con su propia clase: la posición sigue pegada al recuadro. */
    if (typeof cfg.juego === "function" && window.ComandosTablero && window.BlindNotation && BlindNotation.pasosDeDictado) {
      var pista = document.createElement("p");
      pista.className = "cc-dictar-pista";
      pista.textContent = "Para poner la posición en tu tablero, escribe «dictar»: la dice pieza por pieza, a tu ritmo.";
      caja.appendChild(pista);
    }

    /* El aviso va con `role="status"` y SIN un `aria-live` encima: el rol ya
       vale por una región viva cortés, y poner los dos deja a los lectores de
       pantalla eligiendo entre dos instrucciones que se contradicen. */
    var msg = document.createElement("p");
    msg.className = "cc-msg";
    msg.setAttribute("role", "status");
    caja.appendChild(msg);

    /* La ayuda, plegada y con encabezados de verdad. Plegada porque quien llega
       a un ejercicio quiere contestarlo, no oír el manual; con encabezados
       porque así se salta directo a la sección que hace falta en vez de
       escucharla entera. La misma lección que dejó el 4×4. Y se escribe al
       montar aunque esté cerrada: si solo se escribiera al pedirla con el
       comando, abrirla a mano mostraría una caja vacía. */
    var det = null, ayudaCuerpo = null;
    if (window.ComandosTablero) {
      det = document.createElement("details");
      det.className = "cc-ayuda-det";
      var sum = document.createElement("summary");
      sum.textContent = "Qué se puede escribir: jugadas, preguntas y atajos";
      det.appendChild(sum);
      ayudaCuerpo = document.createElement("div");
      ayudaCuerpo.setAttribute("role", "region");
      ayudaCuerpo.setAttribute("aria-label", "Qué se puede escribir");
      ayudaCuerpo.innerHTML = ComandosTablero.ayudaHTML();
      det.appendChild(ayudaCuerpo);
      caja.appendChild(det);
    }

    destino.appendChild(caja);

    /* Las piezas, ARRIBA del tablero. Con la cuenta ciega, el bloque «Piezas»
       no se queda en el recuadro —que va DEBAJO del tablero— sino que se muda
       justo antes del tablero: primero se lee la posición y después se
       resuelve (ver «Las piezas, arriba del tablero» en
       docs/decisiones/accesibilidad.md). Lo hace el recuadro y no cada página
       para que haya una sola copia: el tablero lo da `tablero().el` (el de
       js/tablero-accesible.js) o, donde no hay ese, `tableroEl`.
       Se pone delante del pedazo de página que contiene al tablero y no al
       recuadro (el hijo del ancestro común que lleva el tablero): así no se
       mete dentro del envoltorio del tablero, que suele tener las coordenadas
       en posición absoluta (si cae en una grilla, ocupa el renglón entero:
       ver `.cc-piezas-fuera` en el estilo). Si el recuadro deja la página
       (un visor que se vuelve a armar), el bloque vuelve a él y se va con él;
       y si el recuadro no se ve, el bloque tampoco. */
    function elTablero() {
      var t = cfg.tablero, e = cfg.tableroEl;
      try { if (typeof t === "function") t = t(); } catch (x) { t = null; }
      if (t && t.el && t.el.nodeType === 1) return t.el;
      try { if (typeof e === "function") e = e(); } catch (x) { e = null; }
      return e && e.nodeType === 1 ? e : null;
    }
    function colocar() {
      var tab = cuentaCiega() && caja.isConnected ? elTablero() : null;
      var ancla = null;
      if (tab && tab.isConnected && !tab.contains(caja)) {
        ancla = tab;
        while (ancla.parentNode && !ancla.parentNode.contains(caja)) ancla = ancla.parentNode;
        if (!ancla.parentNode) ancla = null;
      }
      if (ancla) {
        if (bloque.parentNode !== ancla.parentNode || bloque.nextSibling !== ancla) ancla.parentNode.insertBefore(bloque, ancla);
        bloque.classList.add("cc-piezas-fuera");
        bloque.hidden = !seVe(caja);
      } else if (bloque.parentNode !== caja) {
        caja.insertBefore(bloque, caja.firstChild);
        bloque.classList.remove("cc-piezas-fuera");
        bloque.hidden = false;
      }
    }

    var api = {
      el: caja,
      input: input,
      decir: function (texto) { msg.textContent = texto || ""; return api; },
      limpiar: function () { input.value = ""; return api; },
      enfocar: function () { try { input.focus(); } catch (e) {} return api; },
      etiqueta: function (texto) { lab.textContent = texto; return api; },
      ayuda: function (texto) { ayuda.textContent = texto || ""; return api; },
      /* La posición en palabras. Se le pasa la partida de chess.js; con un
         texto suelto, lo escribe tal cual (para un ejercicio sin tablero). */
      abrirAyuda: function () {
        if (!det) return api;
        det.open = true;
        // Vaciar y repoblar: pedir "ayuda" dos veces seguidas tiene que volver a
        // leerla, y una región viva solo reacciona cuando el texto cambia.
        var html = ComandosTablero.ayudaHTML();
        ayudaCuerpo.innerHTML = "";
        window.setTimeout(function () { ayudaCuerpo.innerHTML = html; }, 50);
        return api;
      },
      posicion: function (juegoOTexto) {
        // La página la escribe: desde acá manda ella, no la lectura sola de abajo.
        if (!manual) { manual = true; viva(true); }
        escribir(juegoOTexto);
        return api;
      },
    };

    function escribir(juegoOTexto) {
      colocar();
      if (porColor() && juegoOTexto && typeof juegoOTexto !== "string") {
        pintarPorColor(pos, juegoOTexto);
        tit.hidden = false;
        return;
      }
      pos.textContent = typeof juegoOTexto === "string"
        ? juegoOTexto
        : (juegoOTexto ? posicionEnPalabras(juegoOTexto) : "");
      // Un aviso suelto («las piezas están ocultas») también va bajo «Piezas».
      tit.hidden = !(porColor() && pos.textContent);
    }

    /* Con la cuenta ciega, la posición está SIEMPRE escrita en el recuadro,
       también en los ejercicios que nunca la escribían (Mates, Practicar,
       Finales, Aperturas, los cursos…): ahí solo se oía pidiéndola con
       «posición». Si la página no llama a `posicion()`, el recuadro la toma de
       `juego` y la vuelve a escribir cuando cambia. Va MUDA: cada jugada ya se
       dice sola, y dictar las treinta y dos piezas después de cada una taparía
       el «¡Correcto!» (la misma razón que en Juegos). Y si la página ya tiene
       su propia lectura con «Piezas» a la vista (Mates, Desafíos, los visores),
       esta se calla: dos encabezados iguales seguidos son una parada de más. */
    var manual = false, ultima = null;
    function lecturaSola() {
      colocar();
      if (manual || !cuentaCiega()) return;
      var g = null;
      try { g = cfg.juego(); } catch (e) { g = null; }
      // Solo una partida de verdad (con fen): Memoria pasa una de mentira con lo
      // colocado, y escribirla bajo «Piezas» sería confundir.
      if (!g || typeof g.get !== "function" || typeof g.fen !== "function") {
        if (ultima !== null) { ultima = null; pos.textContent = ""; tit.hidden = true; }
        return;
      }
      var otra = Array.prototype.some.call(document.querySelectorAll(".bn-piezas-titulo"), function (h) {
        return h !== tit && !caja.contains(h) && seVe(h);
      });
      if (otra) {
        if (ultima !== null) { ultima = null; pos.textContent = ""; tit.hidden = true; }
        return;
      }
      var h;
      try { h = huella(g); } catch (e) { return; }
      if (h === ultima) return;
      ultima = h;
      viva(false);
      escribir(g);
    }
    if (typeof cfg.juego === "function") window.setInterval(lecturaSola, 400);

    /* Antes de tratar el texto como una jugada se mira si era una PREGUNTA
       ("caballos", "qué hay en e4", "posición"). Va acá y no dentro de cada
       página por lo de siempre: diez copias de lo mismo se habrían ido
       separando. ComandosTablero devuelve `manejado: false` cuando no es
       ninguna de sus preguntas, y entonces sigue el camino de siempre — al
       revés, una jugada como "Ra1" se leería como la pregunta por el rey y no
       se jugaría nunca. */
    /* Al ENCENDER el Modo Adaptado se dice qué acaba de aparecer. Lo que destapa
       el recuadro es el CSS, y un lector de pantalla no percibe el CSS: sin este
       aviso, quien aprieta el interruptor no oye absolutamente nada y no tiene
       forma de saber que ahora hay dónde escribir.
       Solo al encenderlo, no al cargar la página con el modo ya puesto: ahí el
       recuadro se encuentra tabulando, y repetir el aviso en cada visita es la
       clase de cartel que se deja de leer. */
    document.addEventListener("adaptivemode:change", function (ev2) {
      if (!ev2.detail || !ev2.detail.activo) return;
      msg.textContent = "";
      window.setTimeout(function () {
        msg.textContent = "Modo adaptado. Debajo del tablero tienes un recuadro para escribir tu jugada "
          + "o preguntarle a la posición. Escribe \"ayuda\" para ver todo lo que se puede escribir.";
      }, 80);
    });

    /* `recorrer` = { siguiente, anterior, inicio, final }: un recuadro que
       recorre una partida (Repasar mis clases, los visores de líneas). Con el
       recuadro VACÍO, Enter o → avanzan una jugada, ← retrocede, Inicio y Fin
       van a las puntas. Lo pidieron los alumnos ciegos: escribir «siguiente»
       en cada jugada de una partida de cuarenta es demasiado, y los botones
       ⏮ ◀ ▶ ⏭ quedan arriba del recuadro, a varios Tab de distancia. Solo
       vacío: con texto, las flechas y Inicio/Fin siguen moviendo el cursor
       dentro de lo escrito, que es lo que el lector de pantalla espera. Cada
       función recibe `api` para decir si ya no hay a dónde ir. */
    /* ------------------------------------------------------------ el dictado
       «dictar» dice la posición PIEZA POR PIEZA, para ponerla en un tablero de
       verdad. La posición de corrido se lee demasiado rápido: mientras se
       busca la torre ya van por los peones, y volver a pedirla la empieza de
       nuevo. Acá manda quien escucha: con el recuadro vacío, Intro (o →) dice
       la siguiente, ↑ repite, ← vuelve a la anterior y Escape termina.
       «dictar solo» las dice sola, con una pausa entre una y otra, para quien
       tiene las dos manos en el tablero; cualquiera de esas teclas la detiene
       y se sigue a mano.

       Mientras se dicta, esas teclas son del dictado y no de `recorrer`: Intro
       no avanza la partida a mitad de armar la posición. Y el dictado se
       termina solo si la posición cambia o si se escribe otra cosa: nadie
       queda encerrado en él. Los pasos los arma js/blind-notation.js
       (pasosDeDictado), con las mismas palabras que el resto del sitio. */
    var PAUSA_KEY = "oscarDictadoPausa_v1";
    function pausaGuardada() {
      var v = NaN;
      try { v = parseInt(localStorage.getItem(PAUSA_KEY), 10); } catch (e) {}
      return isFinite(v) ? Math.max(2, Math.min(30, v)) : 5;
    }
    var dictado = null;
    function huellaActual() {
      try { var g = cfg.juego(); return g ? huella(g) : null; } catch (e) { return null; }
    }
    function decirDictado(texto, alTerminar) {
      // Vaciar y repoblar: «repetir» escribe lo mismo, y una región viva solo
      // habla cuando el texto cambia.
      msg.textContent = "";
      window.setTimeout(function () { msg.textContent = texto; }, 40);
      var hablo = false;
      if (window.BlindNotation && BlindNotation.speak) hablo = BlindNotation.speak(texto, alTerminar ? { alTerminar: alTerminar } : undefined);
      return hablo;
    }
    function terminarDictado(aviso) {
      if (!dictado) return;
      window.clearTimeout(dictado.reloj);
      dictado = null;
      delete input.dataset.dictando;
      if (aviso) decirDictado(aviso);
    }
    function pasoDictado(i, prefijo) {
      if (!dictado) return;
      window.clearTimeout(dictado.reloj);
      if (dictado.huella !== huellaActual()) {
        terminarDictado("La posición cambió y el dictado se terminó. Escribe «dictar» para empezar con la nueva.");
        return;
      }
      var d = dictado;
      if (i < 0) { decirDictado("Es la primera pieza. " + d.pasos[0]); d.i = 0; return; }
      if (i >= d.pasos.length) { terminarDictado(d.fin); return; }
      d.i = i;
      d.turno += 1;
      var turno = d.turno, texto = (prefijo || "") + d.pasos[i];
      if (!d.auto) { decirDictado(texto); return; }
      /* Sola: la pausa empieza a contar cuando la voz termina de decir la
         pieza. Con lector de pantalla no hay forma de saber cuándo terminó, así
         que se le da el tiempo de leerla (lo que mide la frase) más la pausa. */
      var hecho = false;
      var sigue = function () {
        if (hecho) return;
        hecho = true;
        if (!dictado || dictado !== d || d.turno !== turno || !d.auto) return;
        window.clearTimeout(d.reloj);
        d.reloj = window.setTimeout(function () { if (dictado === d && d.turno === turno && d.auto) pasoDictado(d.i + 1); }, d.segundos * 1000);
      };
      var hablo = decirDictado(texto, sigue);
      /* Y un plazo por si la voz no avisa que terminó (hay navegadores que no
         lo hacen, y sin voces instaladas no avisa nunca): el dictado no se
         queda esperando para siempre. */
      d.reloj = window.setTimeout(sigue, hablo ? 3000 + texto.length * 130 : 1200 + texto.length * 70);
    }
    function empezarDictado(r) {
      terminarDictado();
      if (!r.pasos || !r.pasos.length) { decirDictado("No hay piezas que dictar."); return; }
      var segundos = pausaGuardada();
      if (r.auto && r.segundos) {
        segundos = Math.max(2, Math.min(30, r.segundos));
        try { localStorage.setItem(PAUSA_KEY, String(segundos)); } catch (e) {}
      }
      dictado = { pasos: r.pasos, fin: r.fin, i: 0, turno: 0, auto: !!r.auto, segundos: segundos, huella: huellaActual(), reloj: 0 };
      input.dataset.dictando = "1";
      var cuantas = r.total === 1 ? "una pieza" : r.total + " piezas";
      pasoDictado(0, r.auto
        ? "Dictado automático: " + cuantas + ", una cada " + segundos + " segundos. Intro lo detiene y sigues a tu ritmo; Escape termina. "
        : "Dictado: " + cuantas + ". Con el recuadro vacío, Intro dice la siguiente, flecha arriba la repite, flecha izquierda vuelve atrás y Escape termina. ");
    }
    // Una tecla del dictado. Sola iba; al tocarla se detiene y se sigue a mano.
    function teclaDeDictado(que) {
      if (!dictado) return false;
      var solaIba = dictado.auto;
      dictado.auto = false;
      window.clearTimeout(dictado.reloj);
      if (que === "terminar") { terminarDictado("Dictado terminado."); return true; }
      if (solaIba && que === "siguiente") { pasoDictado(dictado.i, "Dictado detenido: ahora Intro dice la siguiente. Vas por: "); return true; }
      pasoDictado(que === "siguiente" ? dictado.i + 1 : que === "anterior" ? dictado.i - 1 : dictado.i);
      return true;
    }
    input.addEventListener("keydown", function (ev) {
      if (!dictado || input.value !== "" || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      var que = { ArrowRight: "siguiente", ArrowLeft: "anterior", ArrowUp: "repetir", Escape: "terminar" }[ev.key];
      if (!que) return;
      ev.preventDefault();
      // Que ni `recorrer` ni un diálogo que cierre con Escape la tomen también.
      ev.stopImmediatePropagation();
      teclaDeDictado(que);
    });

    var recorrer = cfg.recorrer || null;
    if (recorrer) {
      input.setAttribute("aria-keyshortcuts", "Enter ArrowRight ArrowLeft Home End");
      // Que al llegar al recuadro se oiga cómo se avanza, no solo la etiqueta.
      ayuda.id = id + "-ayuda";
      input.setAttribute("aria-describedby", ayuda.id);
      input.addEventListener("keydown", function (ev) {
        if (dictado || input.value !== "" || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
        var f = { ArrowRight: "siguiente", ArrowLeft: "anterior", Home: "inicio", End: "final" }[ev.key];
        if (!f || typeof recorrer[f] !== "function") return;
        ev.preventDefault();
        recorrer[f](api);
      });
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var texto = input.value;
      if (!String(texto).trim()) {
        input.value = "";
        if (teclaDeDictado("siguiente")) return;
        if (recorrer && typeof recorrer.siguiente === "function") recorrer.siguiente(api);
        return;
      }
      /* Mientras se dicta, las palabras de siempre son del dictado; cualquier
         otra cosa lo termina y sigue su camino (una jugada, «siguiente»…). */
      if (dictado) {
        var orden = normalizar(texto).replace(/[.!¡¿?,]/g, " ").replace(/\s+/g, " ").trim();
        // Nunca una letra sola: «a» es también la opción A de una pregunta.
        var que = /^(siguiente|sigue|otra)$/.test(orden) ? "siguiente"
          : /^(repetir|repite|otra vez)$/.test(orden) ? "repetir"
          : /^(atras|anterior)$/.test(orden) ? "anterior"
          : /^(salir|terminar|fin|basta|parar|listo)$/.test(orden) ? "terminar" : null;
        if (que) { input.value = ""; teclaDeDictado(que); return; }
        terminarDictado();
      }
      if (window.ComandosTablero && (cfg.juego || cfg.tablero)) {
        var r = ComandosTablero.interpretar(texto, { juego: cfg.juego, tablero: cfg.tablero });
        if (r.manejado && r.tipo === "dictado") { input.value = ""; empezarDictado(r); return; }
        if (r.manejado) {
          input.value = "";
          if (r.tipo === "ayuda") { api.abrirAyuda(); api.decir("Ayuda desplegada debajo del recuadro."); }
          else api.decir(r.respuesta);
          if (window.BlindNotation && BlindNotation.speak && r.respuesta) BlindNotation.speak(r.respuesta);
          return;
        }
      }
      if (typeof cfg.onEnviar === "function") cfg.onEnviar(texto, api);
    });

    return api;
  }

  /* Si el Modo Adaptado está encendido AHORA. Se lee del <html>, que es donde
     lo pone js/adaptive-mode.js, y no del localStorage: así también vale para
     el modo que se adivinó solo (contraste del sistema, primer Tab). */
  function activo() {
    return document.documentElement.classList.contains("adaptive-mode");
  }

  return {
    montar: montar, activo: activo, letra: letra,
    esNoSe: esNoSe, opcionPedida: opcionPedida, casillaPedida: casillaPedida,
    jugadaPedida: jugadaPedida, posicionEnPalabras: posicionEnPalabras,
    normalizar: normalizar,
  };
})();

/*! rev bfb5bbb0d2d82f9f */
