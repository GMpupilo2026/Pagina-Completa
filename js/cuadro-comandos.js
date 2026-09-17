/* ===== Ajedrez Integral — el cuadro de comandos de los ejercicios =====
 *
 * Un ejercicio que SOLO se puede contestar tocando el tablero no se puede
 * contestar con lector de pantalla, y eso no da ningún error: la página
 * funciona, el ejercicio se ve, y quien no puede verlo simplemente no avanza.
 * Este módulo pone al lado del ejercicio un recuadro donde se escribe la
 * respuesta —una jugada, una casilla o la letra de una opción— y la página la
 * recibe igual que si se hubiera hecho clic.
 *
 * Ya existía el mismo recuadro escrito tres veces (Mates, Aprender, Desafíos,
 * Practicar tienen su #blind-panel; 4×4 su #cmd-form; los visores de los cursos
 * su .f100-cmd). Este archivo es para las páginas que NO lo tenían —el
 * diagnóstico, los exámenes de arbitraje, Ejercicios por tema— y para que la
 * siguiente no lo vuelva a escribir por cuarta vez.
 *
 * Dos decisiones que conviene no deshacer:
 *
 * 1. NO REEMPLAZA AL TABLERO, SE SUMA. En Mates y sus hermanas el modo adaptado
 *    esconde el tablero y deja solo el recuadro; acá conviven. Alguien con baja
 *    visión usa las dos cosas —ve el tablero ampliado y escribe la jugada
 *    porque arrastrar una pieza de 40 px con lupa es un suplicio—, y quien
 *    acompaña a un alumno necesita ver lo que él está contestando.
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

  /* La jugada escrita, contra una posición de chess.js. Delega en el intérprete
     que ya usan los visores de los cursos y las páginas de Juegos
     (js/chess-move-parser.js): entiende español, inglés y los descuidos de
     tipeo de siempre. Ojo: si acierta, la jugada QUEDA HECHA en `game`. */
  function jugadaPedida(game, texto) {
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

  // ---------------------------------------------------------------- el estilo
  // Va en su propia hoja inyectada y no en css/styles.css porque estas páginas
  // no comparten hoja: el diagnóstico usa Tailwind y Ejercicios por tema tiene
  // su propia paleta de variables. Todo se pinta con `currentColor` y con lo
  // que herede, así que el recuadro se ve como la página donde cae.
  var ESTILO = [
    ".cc-caja { display: none; }",
    "html.adaptive-mode .cc-caja { display: block; margin: 1rem 0; padding: .9rem 1rem;",
    "  border: 2px solid currentColor; border-radius: .6rem; }",
    ".cc-pos { margin: 0 0 .6rem; font-size: 1rem; line-height: 1.6; }",
    ".cc-form { display: flex; flex-wrap: wrap; gap: .5rem; align-items: flex-end; }",
    ".cc-campo { flex: 1 1 12rem; }",
    ".cc-etiqueta { display: block; font-size: .9rem; margin-bottom: .25rem; }",
    ".cc-input { width: 100%; padding: .5rem .6rem; font-size: 1.05rem; font-family: inherit;",
    "  color: inherit; background: rgba(127,127,127,.12); border: 2px solid currentColor;",
    "  border-radius: .4rem; }",
    ".cc-btn { padding: .5rem 1rem; font-size: 1rem; font-family: inherit; font-weight: 700;",
    "  color: inherit; background: rgba(127,127,127,.12); border: 2px solid currentColor;",
    "  border-radius: .4rem; cursor: pointer; }",
    ".cc-ayuda { margin: .5rem 0 0; font-size: .85rem; opacity: .85; }",
    ".cc-msg { margin: .4rem 0 0; font-size: .95rem; font-weight: 600; min-height: 1.3em; }",
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
    var pos = document.createElement("p");
    pos.className = "cc-pos";
    pos.setAttribute("aria-live", "polite");
    pos.setAttribute("aria-atomic", "true");
    caja.appendChild(pos);

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

    var msg = document.createElement("p");
    msg.className = "cc-msg";
    msg.setAttribute("role", "status");
    msg.setAttribute("aria-live", "polite");
    caja.appendChild(msg);

    destino.appendChild(caja);

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
      posicion: function (juegoOTexto) {
        pos.textContent = typeof juegoOTexto === "string"
          ? juegoOTexto
          : (juegoOTexto ? posicionEnPalabras(juegoOTexto) : "");
        return api;
      },
    };

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var texto = input.value;
      if (!String(texto).trim()) return;
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
