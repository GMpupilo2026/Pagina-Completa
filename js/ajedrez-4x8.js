/* El código de ajedrez-4x8.html.
 *
 * Las reglas y la computadora viven en js/ajedrez-4x8-motor.js; acá solo se
 * dibuja y se cuenta. La partida del motor se presenta como una de chess.js,
 * así que el teclado del tablero (js/tablero-accesible.js, con `columnas: 4`
 * porque no es cuadrado), el recuadro de comandos, la coronación y la posición
 * en palabras son los del resto del sitio, sin copias.
 *
 * Se juega en el aparato, sin base: no guarda nada en la cuenta. El tiempo en
 * la plataforma sí se cuenta, como «partidas» (herramientas/academia-cabecera.py,
 * TIEMPO_ACTIVIDAD).
 *
 * El reloj es local y se mide con performance.now(): no es una partida en
 * línea, así que no hay servidor que cante la bandera (ver «El reloj de la
 * partida no se fía del navegador», que es para las salas). Arranca con la
 * primera jugada y el incremento se suma al que acaba de jugar.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const M = window.Ajedrez4x8;
  const GLYPH = { w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" }, b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" } };
  const COLOR = { w: "blancas", b: "negras" };

  let partida = null;
  let cfg = null;            // { modo: "compu" | "2p", humano, nivel, base, inc }
  let tiempos = { w: 0, b: 0 };
  let corriendo = false, ultimoTic = 0;
  let terminada = null;      // { resultado, motivo }
  let elegida = null;
  let girado = false;
  let pensando = 0;          // ficha de la computadora: deshacer o empezar otra la invalida
  let teclado = null, cmd = null;

  const hablada = (sq) => (window.BlindNotation ? BlindNotation.squareSpoken(sq) : sq);
  const mostrar = (san) => (window.ComandosTablero ? ComandosTablero.jugadaParaMostrar(san) : san);
  const contraCompu = () => cfg.modo === "compu";
  const meToca = () => !terminada && (!contraCompu() || partida.turn() === cfg.humano);

  /* ------------------------------------------------------------- el reloj */
  function leerAjustes() {
    const ritmo = $("ritmo").value;
    const [min, inc] = ritmo === "0" ? [0, 0] : ritmo.split("+").map(Number);
    return {
      modo: $("modo").value === "2p" ? "2p" : "compu",
      humano: $("lado").value === "b" ? "b" : "w",
      nivel: Number($("nivel").value) || 2,
      base: min * 60000, inc: inc * 1000, conReloj: ritmo !== "0",
    };
  }
  function formato(ms) {
    ms = Math.max(0, ms);
    if (ms < 10000) return (Math.floor(ms / 100) / 10).toFixed(1).replace(".", ",");
    const s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function dichoTiempo(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60), r = s % 60;
    if (!m) return r + (r === 1 ? " segundo" : " segundos");
    return m + (m === 1 ? " minuto" : " minutos") + (r ? " y " + r + (r === 1 ? " segundo" : " segundos") : "");
  }
  function descontar() {
    if (!corriendo || terminada || !cfg.conReloj) return;
    const ahora = performance.now();
    tiempos[partida.turn()] -= ahora - ultimoTic;
    ultimoTic = ahora;
  }
  function pintarReloj() {
    ["w", "b"].forEach((c) => {
      const caja = $("reloj-" + c);
      caja.querySelector(".reloj-t").textContent = cfg.conReloj ? formato(tiempos[c]) : "—";
      const corre = !terminada && partida.turn() === c;
      caja.classList.toggle("corre", corre);
      caja.classList.toggle("poco", cfg.conReloj && tiempos[c] < 20000);
      caja.querySelector(".reloj-juega").textContent = corre ? "· juega" : "";
      caja.querySelector(".reloj-quien").textContent = COLOR[c][0].toUpperCase() + COLOR[c].slice(1)
        + (contraCompu() ? (c === cfg.humano ? " (tú)" : " (computadora)") : "");
      caja.setAttribute("aria-label", "Reloj de las " + COLOR[c] + (cfg.conReloj ? ": " + dichoTiempo(tiempos[c]) : ": sin reloj"));
    });
  }
  setInterval(() => {
    if (!partida || !corriendo || terminada || !cfg.conReloj) return;
    descontar();
    const c = partida.turn();
    if (tiempos[c] <= 0) {
      tiempos[c] = 0;
      terminar(partida.bandera(c));
    }
    pintarReloj();
  }, 100);

  /* ------------------------------------------------------------ el tablero */
  function casillasEnOrden() {
    const out = [];
    for (let fila = 8; fila >= 1; fila--) for (let col = 0; col < 4; col++) out.push(M.COLUMNAS[col] + fila);
    return girado ? out.reverse() : out;
  }
  function pintarTablero() {
    const tablero = $("board");
    tablero.innerHTML = "";
    const destinos = elegida ? partida.moves({ square: elegida, verbose: true }) : [];
    const ultima = partida.history({ verbose: true }).slice(-1)[0];
    const reyEnJaque = partida.in_check() ? casillasEnOrden().find((sq) => {
      const p = partida.get(sq);
      return p && p.type === "k" && p.color === partida.turn();
    }) : null;
    casillasEnOrden().forEach((sq) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const f = M.COLUMNAS.indexOf(sq[0]), r = Number(sq[1]) - 1;
      btn.className = "c48-casilla " + ((f + r) % 2 ? "clara" : "oscura");
      btn.dataset.square = sq;
      const p = partida.get(sq);
      const estados = [];
      const d = destinos.find((m) => m.to === sq);
      if (sq === elegida) { btn.classList.add("elegida"); estados.push("elegida"); }
      else if (sq === reyEnJaque) { btn.classList.add("jaque"); estados.push("en jaque"); }
      else if (ultima && (sq === ultima.from || sq === ultima.to)) { btn.classList.add("ultima"); estados.push("última jugada"); }
      if (d) {
        const captura = d.flags.indexOf("c") >= 0 || d.flags.indexOf("e") >= 0;
        btn.classList.add(captura ? "captura" : "destino");
        estados.push(captura ? "puedes capturar ahí" : "puedes ir ahí");
      }
      if (estados.length) btn.dataset.estado = estados.join(", ");
      if (p) {
        const span = document.createElement("span");
        if (window.PiezaPreferida) PiezaPreferida.pintar(span, p.type, p.color);
        else { span.textContent = GLYPH[p.color][p.type]; span.className = p.color === "w" ? "piece-white" : "piece-black"; }
        span.setAttribute("aria-hidden", "true");
        btn.appendChild(span);
      }
      btn.addEventListener("click", () => tocar(sq));
      tablero.appendChild(btn);
    });
    if (teclado) teclado.refrescar();
  }

  function pintarPlanilla() {
    const ol = $("planilla");
    const h = partida.history();
    ol.innerHTML = "";
    for (let i = 0; i < h.length; i += 2) {
      const li = document.createElement("li");
      li.className = "whitespace-nowrap";
      const n = document.createElement("span");
      n.className = "text-brand-500 dark:text-brand-300";
      n.textContent = (i / 2 + 1) + ". ";
      li.appendChild(n);
      li.appendChild(document.createTextNode(mostrar(h[i]) + (h[i + 1] ? " " + mostrar(h[i + 1]) : "")));
      ol.appendChild(li);
    }
    $("planilla-vacia").hidden = h.length > 0;
    ol.scrollTop = ol.scrollHeight;
  }

  /* ---------------------------------------------------------- lo que pasa */
  function turnoDicho() {
    const c = partida.turn();
    const jaque = partida.in_check() ? " Jaque." : "";
    if (!contraCompu()) return "Juegan " + COLOR[c] + "." + jaque;
    if (c === cfg.humano) return "Te toca, juegas con " + COLOR[c] + "." + jaque;
    return "Piensa la computadora…" + jaque;
  }
  function decir(texto) {
    const aviso = $("aviso");
    aviso.textContent = "";
    window.setTimeout(() => { aviso.textContent = texto; }, 40);
    if (window.BlindNotation && BlindNotation.speak) BlindNotation.speak(texto);
  }
  function resultadoDicho(fin) {
    let quien = "";
    if (fin.resultado !== "½-½") {
      const gana = fin.resultado === "1-0" ? "w" : "b";
      quien = contraCompu() ? (gana === cfg.humano ? "¡Ganaste! " : "Ganó la computadora. ")
                            : "Ganan las " + COLOR[gana] + ". ";
    } else quien = "Tablas. ";
    return quien + fin.motivo + " (" + fin.resultado + ").";
  }
  function terminar(fin) {
    terminada = fin;
    corriendo = false;
    pensando++;
    elegida = null;
    pintarTodo();
    decir(resultadoDicho(fin));
  }
  function pintarTodo() {
    pintarTablero();
    pintarPlanilla();
    pintarReloj();
    $("btn-deshacer").disabled = !partida.history().length;
    if (cmd) cmd.posicion(partida);
  }

  function jugar(jugada) {
    if (terminada) return null;
    descontar();
    const quien = partida.turn();
    const hecha = partida.move(jugada);
    if (!hecha) return null;
    if (cfg.conReloj) {
      if (corriendo) tiempos[quien] += cfg.inc;
      corriendo = true;
      ultimoTic = performance.now();
    }
    elegida = null;
    const fin = partida.fin();
    if (fin) {
      terminada = fin;
      corriendo = false;
      pintarTodo();
      decir(quienJugo(hecha) + " " + resultadoDicho(fin));
      return hecha;
    }
    pintarTodo();
    decir(quienJugo(hecha) + " " + turnoDicho());
    turnoDeLaComputadora();
    return hecha;
  }
  function quienJugo(m) {
    const quien = contraCompu() ? (m.color === cfg.humano ? "Jugaste" : "La computadora jugó") : "Las " + COLOR[m.color] + " jugaron";
    return quien + " " + mostrar(m.san) + ".";
  }

  function turnoDeLaComputadora() {
    if (!contraCompu() || terminada || partida.turn() === cfg.humano) return;
    const ficha = ++pensando;
    // Un respiro para que se vea la jugada propia antes de la respuesta, y
    // para que el aviso de «Jugaste…» alcance a leerse.
    window.setTimeout(() => {
      if (ficha !== pensando || terminada) return;
      const m = partida.jugadaDeLaComputadora(cfg.nivel);
      if (m) jugar({ from: m.from, to: m.to, promotion: m.promotion });
    }, 450);
  }

  function intentar(desde, hasta) {
    if (window.Coronacion && Coronacion.hayQueElegir(partida, desde, hasta)) {
      Coronacion.pedir(partida.turn(), (pieza) => {
        if (pieza) jugar({ from: desde, to: hasta, promotion: pieza });
        else { elegida = null; pintarTablero(); }
      });
      return;
    }
    jugar({ from: desde, to: hasta });
  }
  function tocar(sq) {
    if (!meToca()) {
      if (terminada) decir("La partida terminó. " + resultadoDicho(terminada) + " Aprieta «Nueva partida» para jugar otra.");
      else decir("Espera: piensa la computadora.");
      return;
    }
    if (elegida === sq) { elegida = null; pintarTablero(); return; }
    if (elegida && partida.moves({ square: elegida, verbose: true }).some((m) => m.to === sq)) { intentar(elegida, sq); return; }
    const p = partida.get(sq);
    elegida = p && p.color === partida.turn() ? sq : null;
    pintarTablero();
  }

  /* --------------------------------------------------- empezar y deshacer */
  function nueva() {
    cfg = leerAjustes();
    partida = new M.Partida();
    tiempos = { w: cfg.base, b: cfg.base };
    corriendo = false;
    terminada = null;
    elegida = null;
    pensando++;
    girado = contraCompu() && cfg.humano === "b";
    pintarTodo();
    const ritmo = cfg.conReloj ? "Reloj de " + dichoTiempo(cfg.base) + (cfg.inc ? " más " + dichoTiempo(cfg.inc) + " por jugada" : "") + "; arranca con la primera jugada." : "Sin reloj.";
    decir("Partida nueva. " + ritmo + " " + turnoDicho());
    turnoDeLaComputadora();
  }
  async function pedirNueva() {
    const enJuego = partida && partida.history().length && !terminada;
    if (enJuego && window.Avisos && !(await Avisos.confirmar("La partida que estás jugando se pierde.", { titulo: "¿Empezar otra partida?", aceptar: "Empezar otra" }))) return;
    nueva();
  }
  function deshacer() {
    if (!partida.history().length) return;
    pensando++;
    // Contra la computadora se devuelve también su respuesta: si no, le vuelve
    // a tocar a ella y contesta lo mismo al instante.
    let n = 1;
    if (contraCompu() && partida.turn() === cfg.humano && partida.history().length >= 2) n = 2;
    if (contraCompu() && partida.turn() !== cfg.humano && !terminada) n = 1;
    for (let i = 0; i < n; i++) partida.undo();
    terminada = null;
    elegida = null;
    if (!partida.history().length) corriendo = false;
    ultimoTic = performance.now();
    pintarTodo();
    decir("Jugada deshecha. " + turnoDicho());
    turnoDeLaComputadora();
  }

  /* -------------------------------------------- lo que se escribe (adaptado) */
  function escrito(texto, api) {
    const t = (window.CuadroComandos ? CuadroComandos.normalizar(texto) : String(texto).toLowerCase()).trim();
    if (/^(reloj|tiempo|cuanto tiempo|cuanto tiempo queda)$/.test(t)) {
      api.decir(cfg.conReloj ? "Blancas: " + dichoTiempo(tiempos.w) + ". Negras: " + dichoTiempo(tiempos.b) + "." : "Esta partida es sin reloj.");
      return;
    }
    if (/^(nueva|nueva partida|otra|otra partida|empezar)$/.test(t)) { api.limpiar(); pedirNueva(); return; }
    if (/^(deshacer|deshacer jugada|atras)$/.test(t)) { api.limpiar(); deshacer(); api.decir("Jugada deshecha."); return; }
    if (/^(girar|girar el tablero|dar vuelta)$/.test(t)) { api.limpiar(); girado = !girado; pintarTablero(); api.decir("Tablero girado."); return; }
    if (!meToca()) { api.decir(terminada ? "La partida terminó. Escribe «nueva» para jugar otra." : "Espera: piensa la computadora."); return; }
    const m = window.ComandosTablero ? ComandosTablero.jugadaEscrita(partida, texto) : null;
    if (!m) { api.decir(window.ComandosTablero ? ComandosTablero.noSePudoJugar(texto) : "No es una jugada legal."); return; }
    api.limpiar();
    const hecha = jugar({ from: m.from, to: m.to, promotion: m.promotion });
    api.decir(hecha ? quienJugo(hecha) : "No es una jugada legal.");
  }

  /* ------------------------------------------------------------- arrancar */
  async function init() {
    let sesion = null;
    try { const { data } = await sb.auth.getSession(); sesion = data && data.session; } catch (e) { sesion = null; }
    if (!sesion) {
      $("loading").textContent = "Necesitas iniciar sesión para jugar. Redirigiendo…";
      window.location.href = "login.html?next=" + encodeURIComponent("ajedrez-4x8.html");
      return;
    }
    cfg = leerAjustes();
    partida = new M.Partida();
    tiempos = { w: cfg.base, b: cfg.base };
    $("loading").classList.add("hidden");
    $("app").classList.remove("hidden");
    pintarTodo();
    if (window.TableroAccesible) {
      teclado = TableroAccesible.montar($("board"), {
        nombre: "Tablero de cuatro columnas y ocho filas",
        juego: () => partida,
        columnas: 4,
        cuadro: () => (cmd ? cmd.input : null),
      });
    }
    if (window.CuadroComandos) {
      cmd = CuadroComandos.montar($("comandos"), {
        etiqueta: "Escribe tu jugada, o una pregunta sobre la posición",
        juego: () => partida,
        tablero: () => teclado,
        onEnviar: escrito,
        // La posición se pide («posición»): dictarla entera en cada jugada tapa
        // lo único que cambió, que es la jugada, y ese aviso ya lo da la página.
        posicionViva: false,
      });
      cmd.ayuda('Jugada: «Cc3», «b4», «b2 b4», «b8=D». Pregunta: «posición», «jugadas», «última jugada». Además: «reloj», «deshacer», «nueva». «ayuda» lo dice todo.');
      cmd.posicion(partida);
    }
    if (window.Coordenadas) Coordenadas.aplicar($("board"));
    if (typeof enableBoardDrag === "function") {
      enableBoardDrag($("board"), {
        isDraggable: (sq) => { const p = partida.get(sq); return meToca() && !!p && p.color === partida.turn(); },
        isSelected: (sq) => elegida === sq,
        onSquareClick: (sq) => tocar(sq),
      });
    }
    if (window.BlindNotation && BlindNotation.setupSpeechToggle) BlindNotation.setupSpeechToggle("btn-voz", () => true);
    else $("btn-voz").remove();
    $("btn-nueva").addEventListener("click", pedirNueva);
    $("btn-deshacer").addEventListener("click", deshacer);
    $("btn-girar").addEventListener("click", () => { girado = !girado; pintarTablero(); decir("Tablero girado: abajo están las " + (girado ? "negras" : "blancas") + "."); });
    nueva();
  }
  init();
})();
