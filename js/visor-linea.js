/* ===== Ajedrez Integral — recorrer una línea en un tablero =====
 *
 * Un tablero que muestra una línea de jugadas y se recorre con ⏮ ◀ ▶ ⏭, con el
 * teclado, con el lector de pantalla y escribiendo («siguiente», «jugada 5»).
 * Lo usan la preparación de rivales (js/preparacion-rivales.js, para ver cada
 * línea del plan) y las fichas de Estudio (js/ficha-render.js, que toma de acá
 * cómo se pinta una pieza, cómo se cuenta una jugada y cómo se recorre
 * escribiendo: una sola copia de cada cosa).
 *
 * Decisiones que vienen de Estudio (ver «Estudio: el tablero de una ficha era
 * decoración» en docs/decisiones/accesibilidad.md):
 *   - las casillas son <button>: un <div> no recibe el foco, y el tablero se
 *     recorre con js/tablero-accesible.js (una sola parada de tabulador);
 *   - en cada paso se lee LA JUGADA, contada («El caballo blanco va de…»), no
 *     la posición entera: la posición queda escrita aparte, para leerla cuando
 *     se quiera o pedirla con «posición»;
 *   - la línea se recorre también escribiendo, en js/cuadro-comandos.js.
 *
 * Uso:
 *     const visor = VisorLinea.montar(contenedor, {
 *       nombre: "Tablero del plan",
 *       evaluar: (fen) => Promise<{ eval, mejor }>,   // opcional: Stockfish
 *     });
 *     visor.cargar(["e4", "e5", "Nf3"], { titulo: "…", en: 2, notas: [...] });
 *
 * `desde` (FEN) arranca la línea en esa posición y no en la inicial, y
 * `orientacion: "b"` la mira desde las negras: así la usan Ejercicios por tema
 * y Mates para «Ver la línea» de un ejercicio ya resuelto.
 *
 * `alCambiar(indice)`, opcional en montar(), avisa cada vez que se va a otra
 * jugada (la libreta de torneos la usa para comentar ESA jugada).
 *
 * `notas[i]`, si viene, es un texto sobre la jugada i (cuánto saca el rival
 * ahí, lo que dijo Stockfish): se escribe debajo de la jugada contada.
 */
window.VisorLinea = (function () {
  "use strict";

  const GLYPH = {
    w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
    b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
  };
  const COLUMNAS = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const PIEZAS_ES = { N: "C", B: "A", R: "T", Q: "D", K: "R" };
  // En algebraica española («Cf3»), o en palabras para quien no ve si la página
  // carga js/comandos-tablero.js (ComandosTablero.jugadaParaMostrar).
  const aEspanol = (san) => (window.ComandosTablero && ComandosTablero.jugadaParaMostrar
    ? ComandosTablero.jugadaParaMostrar(san) : String(san).replace(/[NBRQK]/g, (l) => PIEZAS_ES[l]));
  const esClara = (sq) => ((sq.charCodeAt(0) - 97) + (parseInt(sq[1], 10) - 1)) % 2 === 1;

  // ------------------------------------------------------------ lo compartido

  // Cómo se pinta una pieza: la preferencia del alumno (js/pieza-preferida.js),
  // o el símbolo si esa no está.
  function dibujarPieza(cont, piece) {
    const span = document.createElement("span");
    span.setAttribute("aria-hidden", "true");
    if (window.PiezaPreferida) {
      PiezaPreferida.pintar(span, piece.type, piece.color);
    } else if (window.PieceStyleThemes && window.PieceStyleThemes.esDibujado() && window.ChessPieceSVG) {
      span.innerHTML = window.ChessPieceSVG.markup(piece.type, piece.color);
      span.className = "chess-piece-illustrated";
    } else {
      span.className = piece.color === "w" ? "piece-white" : "piece-black";
      span.textContent = GLYPH[piece.color][piece.type];
    }
    cont.appendChild(span);
  }

  /* La jugada CONTADA: qué pieza, de dónde a dónde, si se come algo y si da
     jaque. Es lo único que se lee solo en cada paso: una apertura son doce
     jugadas y treinta y dos piezas, y dictar la posición entera en cada una es
     lo que hace que se apague el lector de pantalla. */
  function jugadaContada(mv) {
    if (!mv) return "";
    const B = window.BlindNotation;
    const donde = (sq) => (B && B.squareSpoken ? B.squareSpoken(sq) : sq);
    const NOMBRE = { k: "el rey", q: "la dama", r: "la torre", b: "el alfil", n: "el caballo", p: "el peón" };
    const color = mv.color === "w" ? "blanco" : "negro";
    const colorF = mv.color === "w" ? "blanca" : "negra";
    const fem = mv.piece === "q" || mv.piece === "r";
    if (mv.flags && mv.flags.indexOf("k") >= 0) return "Enroque corto de las " + (mv.color === "w" ? "blancas" : "negras") + ".";
    if (mv.flags && mv.flags.indexOf("q") >= 0) return "Enroque largo de las " + (mv.color === "w" ? "blancas" : "negras") + ".";
    let t = NOMBRE[mv.piece] + " " + (fem ? colorF : color) + " va de " + donde(mv.from) + " a " + donde(mv.to);
    if (mv.captured) t += " y se come " + NOMBRE[mv.captured];
    if (mv.promotion) t += " y corona " + NOMBRE[mv.promotion].replace(/^el |^la /, "");
    // El jaque y el mate van DICHOS: el «+» no lo lee nadie en voz alta.
    const san = String(mv.san || "");
    if (/#$/.test(san)) t += " y es jaque mate";
    else if (/\+$/.test(san)) t += " y da jaque";
    t = t.charAt(0).toUpperCase() + t.slice(1);
    return t + ".";
  }

  /* Recorrer ESCRIBIENDO: «siguiente», «anterior», «inicio», «final»,
     «jugada 5». Devuelve a qué media jugada ir (el índice del visor), o null
     si el texto no es de recorrer (entonces es una pregunta para
     js/comandos-tablero.js).

     Qué es «jugada 5» depende de cómo cuenta EN VOZ ALTA la página que
     llama. Este visor, Estudio, Finales y los cursos dicen «Jugada 5 de 12»
     contando medias jugadas, y ahí «jugada 5» es la quinta media jugada. Pero
     una partida que se anuncia con el número de la partida («Jugada 2 de las
     negras», Repasar mis clases) necesita `numeracion`: ahí «jugada 2» es la
     jugada 2 de las BLANCAS y «jugada 2 negras» la de las negras. Contando
     medias jugadas, «jugada 2» llevaba a la respuesta de las negras a la
     jugada 1, que el visor anunciaba como «Jugada 1 de las negras».
     `numeracion` = { primera: número de la primera jugada, empiezanNegras }
     (lo que dice la FEN de salida; sin FEN, 1 y blancas). */
  function pasoPedido(texto, indice, total, numeracion) {
    const t = String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    if (/^(siguiente|sig|adelante|s|\+)$/.test(t)) return indice + 1;
    if (/^(anterior|atras|ant|a|-)$/.test(t)) return indice - 1;
    if (/^(inicio|principio|salida|empezar)$/.test(t)) return 0;
    if (/^(final|fin|ultima|ultimo)$/.test(t)) return total;
    const m = t.match(/^(?:jugada|ir a la jugada|ir a)\s*(\d+)(?:\s*(?:de\s+)?(?:las\s+)?(blancas|blanco|negras|negro))?$/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (!numeracion) return n;
    const negras = /^negr/.test(m[2] || "");
    const primera = numeracion.primera > 0 ? numeracion.primera : 1;
    // Medias jugadas desde el principio de la partida hasta la de salida, y
    // hasta la pedida: la resta es cuántas hay que avanzar desde la salida.
    const salida = (primera - 1) * 2 + (numeracion.empiezanNegras ? 1 : 0);
    const pedida = (n - 1) * 2 + (negras ? 2 : 1);
    return pedida - salida;
  }

  // ------------------------------------------------------------ el visor

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function boton(texto, etiqueta) {
    const b = el("button", "visor-control", texto);
    b.type = "button";
    b.setAttribute("aria-label", etiqueta);
    b.title = etiqueta;
    return b;
  }

  function montar(contenedor, cfg) {
    const o = cfg || {};
    let jugadas = [];
    let notas = [];
    let desde = null;          // FEN de salida; null = la posición inicial
    let orientacion = "w";
    let indice = 0;
    let partida = null;
    let ultima = null;
    const evals = new Map();

    contenedor.textContent = "";
    contenedor.classList.add("visor-linea");
    const titulo = el("h4", "visor-titulo");
    titulo.tabIndex = -1;
    const marco = el("div", "visor-marco");
    const tablero = el("div", "visor-tablero");
    marco.appendChild(tablero);
    const anuncio = el("p", "sr-only");
    anuncio.setAttribute("role", "status");
    const controles = el("div", "visor-controles");
    const bInicio = boton("⏮", "Ir a la posición inicial");
    const bAtras = boton("◀", "Jugada anterior");
    const bAdelante = boton("▶", "Jugada siguiente");
    const bFinal = boton("⏭", "Ir a la última jugada");
    [bInicio, bAtras, bAdelante, bFinal].forEach((b) => controles.appendChild(b));
    const escrita = el("p", "visor-escrita");
    escrita.setAttribute("role", "status");
    const nota = el("p", "visor-nota");
    const motor = el("p", "visor-motor");
    const detalles = el("details", "visor-posicion");
    const resumen = el("summary", "", "La posición, pieza por pieza");
    const completa = el("p");
    detalles.appendChild(resumen);
    detalles.appendChild(completa);
    const comandosCaja = el("div", "visor-comandos");
    const lista = el("div", "visor-jugadas");
    [titulo, marco, anuncio, controles, escrita, nota, motor, detalles, comandosCaja, lista].forEach((x) => contenedor.appendChild(x));

    function posicionEn(n) {
      const g = desde ? new Chess(desde) : new Chess();
      ultima = null;
      for (let i = 0; i < n; i++) ultima = g.move(jugadas[i], { sloppy: true });
      return g;
    }

    function dibujar() {
      tablero.textContent = "";
      const filas = orientacion === "b" ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
      const cols = orientacion === "b" ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
      for (const rank of filas) {
        for (const f of cols) {
          const square = COLUMNAS[f] + rank;
          const c = document.createElement("button");
          c.type = "button";
          c.className = "visor-sq " + (esClara(square) ? "visor-clara" : "visor-oscura");
          if (ultima && (ultima.from === square || ultima.to === square)) c.classList.add("visor-ultima");
          c.dataset.square = square;
          const p = partida.get(square);
          if (p) dibujarPieza(c, p);
          tablero.appendChild(c);
        }
      }
      if (window.Coordenadas) Coordenadas.aplicar(tablero);
    }

    let teclado = null, comandos = null;
    function montarAccesible() {
      if (!teclado && window.TableroAccesible) {
        teclado = TableroAccesible.montar(tablero, { nombre: o.nombre || "Tablero de la línea", juego: () => partida });
      }
      if (!comandos && window.CuadroComandos) {
        comandos = CuadroComandos.montar(comandosCaja, {
          etiqueta: "Recorre la línea o pregunta por la posición",
          juego: () => partida,
          tablero: () => teclado,
          onEnviar: (texto, api) => {
            const t = String(texto).trim().toLowerCase();
            if (/^(evaluaci[oó]n|motor|stockfish)$/.test(t)) { api.decir(motor.textContent || "Stockfish todavía no revisó esta posición."); return; }
            const n = pasoPedido(texto, indice, jugadas.length);
            if (n === null) { api.decir("No entendí «" + texto + "». Escribe «siguiente», «anterior», «jugada 5», «evaluación», o una pregunta como «caballos»."); return; }
            if (n < 0) { api.decir("Ya estás en la posición de salida."); return; }
            if (n > jugadas.length) { api.decir("Ya estás en la última jugada de la línea."); return; }
            api.limpiar().decir("");
            irA(n);
          },
        });
        comandos.ayuda('Recorrer: «siguiente», «anterior», «inicio», «final», «jugada 5». La evaluación: «evaluación». Preguntar: «caballos», «qué hay en e4».');
      }
    }

    function pintarLista() {
      lista.textContent = "";
      // Desde una posición a mitad de partida, la numeración sigue la de la FEN;
      // si empiezan las negras, la primera jugada va sola: «24… Txe1».
      const partes = desde ? desde.split(" ") : [];
      const empiezanNegras = partes[1] === "b";
      const primera = parseInt(partes[5], 10) || 1;
      const corrimiento = empiezanNegras ? 1 : 0;
      for (let i = -corrimiento; i < jugadas.length; i += 2) {
        const par = el("span", "visor-par");
        par.appendChild(el("b", "", (primera + (i + corrimiento) / 2) + (i < 0 ? "…" : ".")));
        [i, i + 1].forEach((k) => {
          if (k < 0) return;
          if (k >= jugadas.length) return;
          const b = el("button", "visor-jugada" + (k === indice - 1 ? " visor-actual" : ""), aEspanol(jugadas[k]));
          b.type = "button";
          if (k === indice - 1) b.setAttribute("aria-current", "step");
          b.addEventListener("click", () => irA(k + 1));
          par.appendChild(b);
        });
        lista.appendChild(par);
      }
    }

    // La evaluación de Stockfish de la posición que se ve, si la página dio con qué.
    function evaluarAhora() {
      if (!o.evaluar) { motor.hidden = true; return; }
      motor.hidden = false;
      const fen = partida.fen();
      const n = indice;
      const escribir = (e) => {
        if (n !== indice) return;
        if (!e || e.eval == null) { motor.textContent = "Stockfish no pudo evaluar esta posición."; return; }
        const T = window.PreparacionLineas;
        const v = T ? T.textoEval(e.eval) : String(e.eval);
        motor.textContent = "Stockfish: " + v + (e.mejor ? " · lo mejor: " + aEspanol(e.mejor) : "") + ".";
      };
      if (evals.has(fen)) { evals.get(fen).then(escribir, () => escribir(null)); return; }
      motor.textContent = "Stockfish está evaluando esta posición…";
      const p = Promise.resolve(o.evaluar(fen));
      evals.set(fen, p);
      p.then(escribir, () => escribir(null));
    }

    function irA(n) {
      indice = Math.max(0, Math.min(n, jugadas.length));
      partida = posicionEn(indice);
      dibujar();
      montarAccesible();
      pintarLista();
      bInicio.disabled = bAtras.disabled = indice === 0;
      bAdelante.disabled = bFinal.disabled = indice >= jugadas.length;
      const donde = indice === 0
        ? "Posición de salida."
        : "Jugada " + indice + " de " + jugadas.length + ": " + aEspanol(jugadas[indice - 1]) + ". " + jugadaContada(ultima);
      // Una región viva solo habla cuando el texto CAMBIA: se vacía y se repuebla.
      escrita.textContent = "";
      setTimeout(() => { escrita.textContent = donde; }, 50);
      anuncio.textContent = donde;
      nota.textContent = indice > 0 && notas[indice - 1] ? notas[indice - 1] : "";
      nota.hidden = !nota.textContent;
      completa.textContent = window.BlindNotation ? BlindNotation.positionSentence(partida) : "";
      evaluarAhora();
      if (o.alCambiar) o.alCambiar(indice);
    }

    bInicio.addEventListener("click", () => irA(0));
    bAtras.addEventListener("click", () => irA(indice - 1));
    bAdelante.addEventListener("click", () => irA(indice + 1));
    bFinal.addEventListener("click", () => irA(jugadas.length));

    // Cargar una línea. Las jugadas que no se pueden hacer cortan la línea ahí:
    // nunca se muestra una posición inventada.
    function cargar(sec, opciones) {
      const oc = opciones || {};
      desde = oc.desde || null;
      orientacion = oc.orientacion === "b" ? "b" : "w";
      const g = desde ? new Chess(desde) : new Chess();
      jugadas = [];
      for (const san of sec || []) { if (!g.move(san, { sloppy: true })) break; jugadas.push(san); }
      notas = (oc.notas || []).slice(0, jugadas.length);
      titulo.textContent = oc.titulo || "";
      titulo.hidden = !titulo.textContent;
      irA(oc.en == null ? jugadas.length : oc.en);
    }

    return {
      cargar, irA,
      enfocar: () => (titulo.textContent ? titulo : tablero).focus(),
      get indice() { return indice; },
      get total() { return jugadas.length; },
    };
  }

  return { montar, dibujarPieza, jugadaContada, pasoPedido, aEspanol };
})();
