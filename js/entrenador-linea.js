/* ===== Ajedrez Integral — jugar una línea de memoria =====
 *
 * El alumno juega EN EL TABLERO las jugadas de su color de una línea que ya
 * conoce; el entrenador mueve por el rival, con una pausa para que se vea qué
 * hizo. Una jugada legal que no es la de la línea se deshace y cuenta como
 * error; «Pista» dice cuál es y marca de dónde sale. Al terminar, la página
 * recibe cuántos errores y pistas hubo: la nota la pone lo que pasó, no el
 * alumno (la decisión de Aperturas, ver «Entrenar el plan: etapa 7» en
 * docs/decisiones/paneles.md).
 *
 * Se juega con el ratón o el dedo (tocar la pieza y la casilla), con el teclado
 * (js/tablero-accesible.js: una sola parada de tabulador) y escribiendo en el
 * cuadro del Modo Adaptado (js/cuadro-comandos.js, que entiende «Cf3», «Nf3» o
 * «e2 e4»). Cómo se pinta la pieza y cómo se cuenta la jugada salen de
 * js/visor-linea.js: una sola copia.
 *
 *     const e = EntrenadorLinea.montar(contenedor, { nombre: "Tablero del entrenamiento" });
 *     e.empezar(["e4", "e5", "Nf3"], { color: "w", titulo: "…", notas: [...],
 *                                      alTerminar: ({ errores, pistas, limpia, fallos }) => … });
 *     (`fallos`: el índice de cada jugada de la línea donde hubo error o pista)
 *
 * Lo usa plan-rival.html. El entrenador de Aperturas (js/entreno-aperturas.js)
 * hace lo mismo con su propia pantalla, más vieja que este módulo.
 *
 * Partida libre («Juega contra él», js/preparacion-sparring.js): el alumno
 * juega lo que quiera y el rival lo decide quien llama. Es el mismo tablero,
 * con el mismo clic, teclado y cuadro de comandos; no hay pista ni jugada
 * «equivocada».
 *
 *     e.jugarLibre({ color: "w", titulo: "…",
 *                    rival: async (juego) => ({ san, nota }) | null,   // null: termina
 *                    alJugar: (hecha, juego) => "nota de tu jugada",
 *                    alTerminar: ({ sec, motivo }) => … });            // motivo: "mate", "tablas", "sin-jugada", "terminada"
 *     e.terminar();   // «Terminar la partida»
 */
window.EntrenadorLinea = (function () {
  "use strict";

  const COLUMNAS = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const esClara = (sq) => ((sq.charCodeAt(0) - 97) + (parseInt(sq[1], 10) - 1)) % 2 === 1;
  const V = () => window.VisorLinea;

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function montar(contenedor, cfg) {
    const o = cfg || {};
    let jugadas = [], notas = [], color = "w", alTerminar = null;
    // Partida libre: { rival, alJugar }; null en el modo de la línea.
    let libre = null, partida = 0;
    let juego = null, indice = 0, errores = 0, pistas = 0;
    // Las jugadas de la línea (su índice) donde hubo un error o una pista.
    let fallos = new Set();
    let seleccion = null, esperandoRival = false, terminada = false, pistaDesde = null;

    contenedor.textContent = "";
    contenedor.classList.add("visor-linea");
    const titulo = el("h4", "visor-titulo");
    titulo.tabIndex = -1;
    const turno = el("p", "entrenador-turno");
    turno.setAttribute("role", "status");
    const marco = el("div", "visor-marco");
    const tablero = el("div", "visor-tablero");
    marco.appendChild(tablero);
    const controles = el("div", "visor-controles");
    const bPista = el("button", "visor-control entrenador-boton", "Pista");
    bPista.type = "button";
    const bOtraVez = el("button", "visor-control entrenador-boton", "Empezar de nuevo");
    bOtraVez.type = "button";
    const bTerminar = el("button", "visor-control entrenador-boton", "Terminar la partida");
    bTerminar.type = "button";
    bTerminar.hidden = true;
    controles.append(bPista, bOtraVez, bTerminar);
    const mensaje = el("p", "visor-nota");
    mensaje.setAttribute("role", "status");
    const hechas = el("p", "visor-escrita");
    const comandosCaja = el("div", "visor-comandos");
    [titulo, turno, marco, controles, mensaje, hechas, comandosCaja].forEach((x) => contenedor.appendChild(x));

    const meToca = () => libre ? !terminada && juego.turn() === color
      : indice < jugadas.length && (color === "w") === (indice % 2 === 0);

    function decir(texto) {
      mensaje.textContent = texto || "";
      mensaje.hidden = !texto;
      if (comandos && texto) comandos.decir(texto);
    }

    function pintarTurno() {
      turno.textContent = terminada ? (libre ? "Partida terminada." : "Línea completa.")
        : meToca() ? "Te toca: juegas con " + (color === "w" ? "blancas" : "negras") + "."
        : "Juega el rival…";
    }

    function pintarHechas() {
      const partes = [];
      const sec = libre ? juego.history() : jugadas.slice(0, indice);
      for (let i = 0; i < sec.length; i++) {
        const num = Math.floor(i / 2) + 1;
        partes.push((i % 2 === 0 ? num + "." : "") + V().aEspanol(sec[i]));
      }
      hechas.textContent = partes.length ? partes.join(" ") : "";
      hechas.hidden = !partes.length;
    }

    function dibujar() {
      tablero.textContent = "";
      // Desde el lado del alumno: quien juega con negras ve su lado abajo.
      const filas = color === "w" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
      const cols = color === "w" ? COLUMNAS : COLUMNAS.slice().reverse();
      filas.forEach((rank) => cols.forEach((f) => {
        const sq = f + rank;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "visor-sq " + (esClara(sq) ? "visor-clara" : "visor-oscura");
        b.dataset.square = sq;
        if (sq === seleccion || sq === pistaDesde) { b.classList.add("visor-seleccionada"); b.dataset.estado = "seleccionada"; }
        const p = juego.get(sq);
        if (p) V().dibujarPieza(b, p);
        b.addEventListener("click", () => tocar(sq));
        tablero.appendChild(b);
      }));
      if (window.Coordenadas) Coordenadas.aplicar(tablero);
      montarAccesible();
    }

    let teclado = null, comandos = null;
    function montarAccesible() {
      if (!teclado && window.TableroAccesible) {
        teclado = TableroAccesible.montar(tablero, { nombre: o.nombre || "Tablero del entrenamiento", juego: () => juego });
      }
      if (!comandos && window.CuadroComandos) {
        comandos = CuadroComandos.montar(comandosCaja, {
          etiqueta: "Escribe tu jugada, o una pregunta sobre la posición",
          juego: () => juego,
          tablero: () => teclado,
          onEnviar: (texto, api) => {
            if (!libre && /^pista$/i.test(String(texto).trim())) { api.limpiar(); pista(); return; }
            if (terminada || esperandoRival || !meToca()) { api.decir("Ahora no te toca mover."); return; }
            const mv = window.ComandosTablero && ComandosTablero.jugadaEscrita(juego, texto);
            if (!mv) { api.decir("«" + texto + "» no es una jugada legal en esta posición. Escribe «pista» si no la recuerdas."); return; }
            api.limpiar().decir("");
            if (libre) jugarLibreJugada({ from: mv.from, to: mv.to, promotion: mv.promotion });
            else intentar({ from: mv.from, to: mv.to, promotion: mv.promotion });
          },
        });
        comandos.ayuda("Jugada: «Cf3», «Nf3», «e2 e4». «pista» si no la recuerdas. Pregunta: «caballos», «qué hay en e4».");
      }
    }

    function marcarMal(sq) {
      const c = tablero.querySelector('[data-square="' + sq + '"]');
      if (!c) return;
      c.classList.add("visor-mal");
      setTimeout(() => c.classList.remove("visor-mal"), 400);
    }

    function tocar(sq) {
      if (terminada || esperandoRival || !meToca()) return;
      if (!seleccion) {
        const p = juego.get(sq);
        if (!p || p.color !== juego.turn()) return;
        seleccion = sq;
        dibujar();
        return;
      }
      if (sq === seleccion) { seleccion = null; dibujar(); return; }
      const posibles = juego.moves({ square: seleccion, verbose: true }).filter((m) => m.to === sq);
      if (!posibles.length) {
        const p = juego.get(sq);
        if (p && p.color === juego.turn()) { seleccion = sq; dibujar(); return; }
        marcarMal(sq);
        return;
      }
      if (libre) {
        // En la partida libre la pieza la elige quien juega (js/coronacion.js).
        const desde = seleccion;
        if (posibles[0].promotion && window.Coronacion) {
          Coronacion.pedir(color, (pieza) => { if (pieza) jugarLibreJugada({ from: desde, to: sq, promotion: pieza }); });
          return;
        }
        jugarLibreJugada({ from: desde, to: sq, promotion: posibles[0].promotion ? "q" : undefined });
        return;
      }
      // Coronar: si la de la línea corona en esa casilla, esa pieza; si no, dama.
      let promo = posibles[0].promotion;
      if (promo) {
        const prueba = new Chess(juego.fen());
        const esperada = prueba.move(jugadas[indice], { sloppy: true });
        promo = esperada && esperada.from === seleccion && esperada.to === sq && esperada.promotion ? esperada.promotion : "q";
      }
      intentar({ from: seleccion, to: sq, promotion: promo });
    }

    function intentar(j) {
      const hecha = juego.move(j);
      if (!hecha) { marcarMal(j.to); return; }
      const limpia = (s) => String(s).replace(/[+#!?]+$/, "");
      if (limpia(hecha.san) !== limpia(jugadas[indice])) {
        // Legal, pero no es la del plan: se deshace y cuenta.
        juego.undo();
        errores += 1;
        fallos.add(indice);
        seleccion = null;
        dibujar();
        marcarMal(j.to);
        decir("Esa no es la jugada del plan. Vuelve a intentarlo" + (errores >= 2 ? ", o pide una pista." : "."));
        return;
      }
      indice += 1;
      seleccion = null;
      pistaDesde = null;
      decir(notas[indice - 1] || "");
      dibujar();
      pintarHechas();
      if (indice >= jugadas.length) terminar();
      else jugarRival();
    }

    // El rival mueve solo. Lo que jugó se DICE: la lista no es región viva, y
    // sin esto quien no ve la pantalla no puede seguir la línea.
    function jugarRival() {
      if (meToca() || indice >= jugadas.length) { pintarTurno(); return; }
      esperandoRival = true;
      pintarTurno();
      setTimeout(() => {
        if (!juego) return;
        const hecha = juego.move(jugadas[indice], { sloppy: true });
        indice += 1;
        esperandoRival = false;
        dibujar();
        pintarHechas();
        const contada = hecha ? V().jugadaContada(hecha) : "";
        decir((contada ? "El rival: " + contada + " " : "") + (notas[indice - 1] || ""));
        if (indice >= jugadas.length) terminar();
        else pintarTurno();
      }, o.pausa == null ? 550 : o.pausa);
    }

    function pista() {
      if (terminada || !meToca()) return;
      pistas += 1;
      fallos.add(indice);
      const prueba = new Chess(juego.fen());
      const m = prueba.move(jugadas[indice], { sloppy: true });
      pistaDesde = m ? m.from : null;
      dibujar();
      decir("La jugada del plan es " + V().aEspanol(jugadas[indice]) + ". Hazla en el tablero.");
    }

    function terminar() {
      terminada = true;
      pintarTurno();
      bPista.disabled = true;
      if (alTerminar) alTerminar({ errores, pistas, limpia: errores === 0 && pistas === 0, fallos: [...fallos].sort((a, b) => a - b) });
    }

    // ---------------------------------------------------------- partida libre

    function finDePartida() {
      if (juego.in_checkmate()) return "mate";
      if (juego.in_draw() || juego.in_stalemate() || juego.in_threefold_repetition()) return "tablas";
      return null;
    }

    function terminarLibre(motivo) {
      if (terminada) return;
      terminada = true;
      esperandoRival = false;
      bTerminar.disabled = true;
      pintarTurno();
      if (alTerminar) alTerminar({ sec: juego.history(), motivo });
    }

    function jugarLibreJugada(j) {
      if (terminada || esperandoRival || !meToca()) return;
      const hecha = juego.move(j);
      if (!hecha) { marcarMal(j.to); return; }
      seleccion = null;
      dibujar();
      pintarHechas();
      decir(libre.alJugar ? libre.alJugar(hecha, juego) || "" : "");
      const fin = finDePartida();
      if (fin) terminarLibre(fin);
      else rivalLibre();
    }

    // El rival de la partida libre: lo decide quien llama (su libro, o el
    // motor). Si mientras piensa se empieza otra partida, su jugada se tira.
    async function rivalLibre() {
      if (terminada || meToca()) { pintarTurno(); return; }
      esperandoRival = true;
      pintarTurno();
      const esta = partida;
      const pausa = new Promise((res) => setTimeout(res, o.pausa == null ? 550 : o.pausa));
      let r = null;
      try { r = await libre.rival(juego); } catch (e) { r = null; }
      await pausa;
      if (esta !== partida || terminada) return;
      esperandoRival = false;
      const hecha = r && r.san ? juego.move(r.san, { sloppy: true }) : null;
      if (!hecha) { terminarLibre("sin-jugada"); return; }
      dibujar();
      pintarHechas();
      decir("El rival: " + V().jugadaContada(hecha) + (r.nota ? " " + r.nota : ""));
      const fin = finDePartida();
      if (fin) terminarLibre(fin);
      else pintarTurno();
    }

    function jugarLibre(opciones) {
      const oc = opciones || {};
      ultima = { libre: oc };
      partida += 1;
      libre = { rival: oc.rival, alJugar: oc.alJugar || null };
      color = oc.color === "b" ? "b" : "w";
      alTerminar = oc.alTerminar || null;
      juego = new Chess();
      jugadas = []; notas = []; indice = 0; errores = 0; pistas = 0;
      seleccion = null; pistaDesde = null; esperandoRival = false; terminada = false;
      titulo.textContent = oc.titulo || "";
      titulo.hidden = !titulo.textContent;
      bPista.hidden = true;
      bTerminar.hidden = false;
      bTerminar.disabled = false;
      decir("");
      dibujar();
      pintarHechas();
      if (!meToca()) rivalLibre(); else pintarTurno();
    }

    let ultima = null;
    function empezar(sec, opciones) {
      const oc = opciones || {};
      ultima = { sec, oc };
      // Solo lo que se puede jugar: una jugada ilegal corta la línea ahí.
      const g = new Chess();
      partida += 1;
      libre = null;
      bPista.hidden = false;
      bTerminar.hidden = true;
      jugadas = [];
      for (const san of sec || []) { if (!g.move(san, { sloppy: true })) break; jugadas.push(san); }
      notas = (oc.notas || []).slice(0, jugadas.length);
      color = oc.color === "b" ? "b" : "w";
      alTerminar = oc.alTerminar || null;
      juego = new Chess();
      indice = 0; errores = 0; pistas = 0; fallos = new Set();
      seleccion = null; pistaDesde = null; esperandoRival = false; terminada = false;
      titulo.textContent = oc.titulo || "";
      titulo.hidden = !titulo.textContent;
      bPista.disabled = false;
      decir("");
      dibujar();
      pintarHechas();
      if (!meToca()) jugarRival(); else pintarTurno();
    }

    bPista.addEventListener("click", pista);
    bOtraVez.addEventListener("click", () => {
      if (!ultima) return;
      if (ultima.libre) jugarLibre(ultima.libre);
      else empezar(ultima.sec, ultima.oc);
    });
    bTerminar.addEventListener("click", () => { if (libre) terminarLibre("terminada"); });

    return {
      empezar,
      jugarLibre,
      terminar: () => { if (libre) terminarLibre("terminada"); },
      get juego() { return juego; },
      enfocar: () => (titulo.textContent ? titulo : tablero).focus(),
      get indice() { return indice; },
      get errores() { return errores; },
      get pistas() { return pistas; },
    };
  }

  return { montar };
})();
