/* El código de entreno/aprende-a-jugar.html: las lecciones de
   lichess.org/learn en el sitio.

   Las reglas de cada nivel (qué jugada vale, cuándo se gana o se pierde,
   cuántos puntos da) viven en js/aprende-a-jugar-motor.js y las etapas en
   js/aprende-a-jugar-etapas.js. Esta página solo pregunta y pinta: el
   tablero (js/ejercicio-tablero.js, el mismo de Desafíos y Mates), las
   estrellas, las flechas de ayuda, el menú de etapas y las estrellas que
   lleva cada nivel. Ver «Aprende a jugar: las lecciones de Lichess» en
   docs/decisiones/entrenamiento.md. */
(function () {
  "use strict";

  const NEXT_PATH = "entreno/aprende-a-jugar.html";
  const CLAVE = "entreno_aprende_jugar_v1"; // "torre:3" → mejores puntos (en CLAVES de js/progreso-usuario.js)
  const ETAPAS = window.APRENDE_ETAPAS, CATEGORIAS = window.APRENDE_CATEGORIAS, M = window.AprendeMotor;
  const $ = (id) => document.getElementById(id);
  const tableroEl = $("board");

  let etapaIdx = 0, nivelIdx = 0;
  let nivel = null;          // el AprendeMotor.Nivel en juego
  let seleccion = null, ultima = null, castigo = null;
  let flechas = [];
  let bloqueado = false;
  let temporizadores = [];

  /* ---------------- Progreso ---------------- */
  function leerProgreso() { try { return JSON.parse(localStorage.getItem(CLAVE) || "{}") || {}; } catch (e) { return {}; } }
  function puntosDe(e, n) { return leerProgreso()[e.clave + ":" + n.id] || 0; }
  function guardarPuntos(e, n, puntos) {
    const p = leerProgreso();
    const k = e.clave + ":" + n.id;
    const nuevo = !p[k];
    if (!p[k] || puntos > p[k]) { p[k] = puntos; try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch (err) {} }
    return nuevo;
  }
  const estrellasTexto = (n, max) => "★".repeat(n) + "☆".repeat((max || 3) - n);
  const estrellasDichas = (n) => (n === 1 ? "1 estrella" : n + " estrellas");
  function estrellasEtapa(e) { return M.estrellasDeLaEtapa(e, e.niveles.map((n) => puntosDe(e, n))); }
  function primerPendiente(e) { const i = e.niveles.findIndex((n) => !puntosDe(e, n)); return i < 0 ? 0 : i; }

  /* ---------------- El tablero visto desde afuera ----------------
     Por dentro, una estrella es un peón negro (ver el motor). Para lo que se
     pinta, lo que lee el lector de pantalla y lo que entiende el recuadro
     donde se escribe, la estrella no es una pieza. */
  const vista = {
    get: (sq) => (nivel ? nivel.piezaVisible(sq) : null),
    turn: () => (nivel ? nivel.juego.turn() : "w"),
    in_check: () => !!nivel && nivel.juego.in_check(),
    history: () => [],
    fen: () => {
      if (!nivel) return "";
      const g = new MiniChess(nivel.juego.fen());
      nivel.estrellas.forEach((sq) => { if (!nivel.plano.estrellasVacias) delete g.board[sq]; });
      return g.fen();
    },
    moves: (o) => {
      if (!nivel) return [];
      const casillas = o && o.square ? [o.square] : Object.keys(nivel.juego.board);
      let out = [];
      casillas.forEach((sq) => { out = out.concat(nivel.destinos(sq).map((m) => Object.assign({}, m, { san: nivel.juego.san(m) }))); });
      return out;
    },
  };

  const ESTRELLA_SVG = '<svg viewBox="0 0 24 24"><path fill="#f5b70a" stroke="#c77a00" stroke-width="1" stroke-linejoin="round" d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5L7 14.3l-5.3-5 7.2-.9z"/><path fill="#ffe27a" opacity=".7" d="M12 4.6l2 4.4 4.6.6-1.9 1.8z"/></svg>';

  function dibujar() {
    if (!nivel) return;
    const marcas = {};
    const fila = nivel.plano.resaltarFila;
    if (fila) "abcdefgh".split("").forEach((c) => { marcas[c + fila] = { clase: "fila-resaltada", estado: "fila " + fila }; });
    nivel.estrellas.forEach((sq) => { marcas[sq] = { clase: "con-estrella", estado: "estrella" }; });
    if (castigo) marcas[castigo.from] = { clase: "castigo", estado: "esta pieza come la tuya" };
    EjercicioTablero.dibujar(tableroEl, {
      juego: vista, orientacion: nivel.plano.color, seleccionada: seleccion, ultima,
      marcas, alTocar: alTocar,
    });
    nivel.estrellas.forEach((sq) => {
      const b = tableroEl.querySelector('[data-square="' + sq + '"]');
      if (b) { const s = document.createElement("span"); s.className = "estrella"; s.setAttribute("aria-hidden", "true"); s.innerHTML = ESTRELLA_SVG; b.appendChild(s); }
    });
    if (seleccion) EjercicioTablero.marcarDestinos(tableroEl, vista, seleccion);
    pintarFlechas();
    montarTeclado();
    pintarLectura();
  }

  /* Las flechas de ayuda (las mismas de Lichess): verde lo que conviene,
     rojo lo que pasa si no, amarillo y azul lo que mira cada pieza. */
  const COLORES = { verde: "#15781b", rojo: "#882020", amarillo: "#e68f00", azul: "#003088" };
  function pintarFlechas() {
    const svg = $("flechas");
    const negras = nivel && nivel.plano.color === "b";
    const xy = (sq) => {
      const f = sq.charCodeAt(0) - 97, r = parseInt(sq[1], 10);
      return negras ? [7 - f + 0.5, r - 1 + 0.5] : [f + 0.5, 8 - r + 0.5];
    };
    let defs = "<defs>";
    Object.keys(COLORES).forEach((c) => {
      defs += '<marker id="punta-' + c + '" orient="auto" markerWidth="4" markerHeight="8" refX="2.05" refY="2.01"><path d="M0,0 V4 L3,2 Z" fill="' + COLORES[c] + '"/></marker>';
    });
    defs += "</defs>";
    let cuerpo = "";
    flechas.forEach((f) => {
      const [v, colorNombre] = f.split(":");
      const color = COLORES[colorNombre] ? colorNombre : "verde";
      if (v.length === 2) {
        const [x, y] = xy(v);
        cuerpo += '<circle cx="' + x + '" cy="' + y + '" r="0.42" fill="none" stroke="' + COLORES[color] + '" stroke-width="0.07" opacity="0.6"/>';
        return;
      }
      const [x1, y1] = xy(v.slice(0, 2)), [x2, y2] = xy(v.slice(2, 4));
      const largo = Math.hypot(x2 - x1, y2 - y1), k = (largo - 0.35) / largo;
      cuerpo += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + (x1 + (x2 - x1) * k) + '" y2="' + (y1 + (y2 - y1) * k) +
        '" stroke="' + COLORES[color] + '" stroke-width="0.16" stroke-linecap="round" opacity="0.5" marker-end="url(#punta-' + color + ')"/>';
    });
    svg.innerHTML = defs + cuerpo;
  }

  /* ---------------- Menú y panel ---------------- */
  function iconoDe(e, destino) {
    destino.textContent = "";
    if (e.pieza && window.PiezaPreferida) {
      const s = document.createElement("span");
      PiezaPreferida.pintar(s, e.pieza, "w");
      destino.appendChild(s);
    } else destino.textContent = e.icono || "♙";
  }

  function pintarMenu() {
    const menu = $("aj-menu");
    menu.textContent = "";
    CATEGORIAS.forEach((c) => {
      const h = document.createElement("h2"); h.textContent = c.nombre; menu.appendChild(h);
      const ol = document.createElement("ol");
      c.etapas.forEach((e) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button"; b.className = "aj-etapa";
        if (ETAPAS.indexOf(e) === etapaIdx) b.setAttribute("aria-current", "true");
        const ic = document.createElement("span"); ic.className = "ic"; ic.setAttribute("aria-hidden", "true"); iconoDe(e, ic);
        const nom = document.createElement("span"); nom.textContent = e.titulo;
        const est = document.createElement("span"); est.className = "est";
        const n = estrellasEtapa(e);
        const hechos = e.niveles.filter((x) => puntosDe(e, x)).length;
        if (n) { est.textContent = estrellasTexto(n); est.setAttribute("aria-label", ", terminada con " + estrellasDichas(n)); }
        else if (hechos) { est.textContent = hechos + "/" + e.niveles.length; est.setAttribute("aria-label", ", " + hechos + " de " + e.niveles.length + " niveles"); }
        b.append(ic, nom, est);
        b.addEventListener("click", () => abrirEtapa(ETAPAS.indexOf(e), null, true));
        li.appendChild(b); ol.appendChild(li);
      });
      menu.appendChild(ol);
    });
    const totalEst = ETAPAS.reduce((a, e) => a + e.niveles.reduce((b, n) => b + M.estrellasDelNivel(n, puntosDe(e, n)), 0), 0);
    const totalMax = ETAPAS.reduce((a, e) => a + e.niveles.length * 3, 0);
    $("aj-total").textContent = "★ " + totalEst + " de " + totalMax + " estrellas";
  }

  function pintarPanel() {
    const e = ETAPAS[etapaIdx], p = nivel.plano;
    iconoDe(e, $("etapa-icono"));
    $("etapa-titulo").textContent = e.titulo;
    $("etapa-subtitulo").textContent = e.subtitulo;
    $("nivel-meta").textContent = p.meta;
    const cont = $("aj-niveles");
    cont.textContent = "";
    const pendiente = primerPendiente(e);
    e.niveles.forEach((n, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "aj-nivel";
      const pts = puntosDe(e, n), est = M.estrellasDelNivel(n, pts);
      if (pts) b.classList.add("hecho");
      if (i === nivelIdx) b.setAttribute("aria-current", "step");
      // Como en Lichess: se puede volver a cualquiera ya hecho y al primero sin hacer.
      const abierto = pts || i <= pendiente || i === nivelIdx || estrellasEtapa(e) > 0;
      b.disabled = !abierto;
      const num = document.createElement("span"); num.textContent = String(n.id);
      const es = document.createElement("span"); es.className = "e"; es.setAttribute("aria-hidden", "true"); es.textContent = pts ? estrellasTexto(est) : "";
      b.append(num, es);
      b.setAttribute("aria-label", "Nivel " + n.id + (pts ? ", hecho con " + estrellasDichas(est) : abierto ? ", sin hacer" : ", se abre al terminar el anterior"));
      b.addEventListener("click", () => { if (!b.disabled) cargarNivel(i); });
      cont.appendChild(b);
    });
    const max = M.maximoDelNivel(p);
    $("aj-puntos").textContent = "Puntos: " + nivel.puntos + " · jugadas: " + nivel.jugadas + " (para tres estrellas: " + p.jugadas + ")" + (puntosDe(e, p) ? " · tu mejor marca: " + puntosDe(e, p) + " de " + max : "");
  }

  function decir(texto, clase) {
    const el = $("aj-estado");
    el.textContent = texto;
    el.className = "aj-estado" + (clase ? " " + clase : "");
    if (comandos) comandos.decir(texto);
  }

  /* ---------------- Tarjetas: la presentación y el cierre de la etapa ---------------- */
  function tarjeta(o) {
    const t = $("tarjeta");
    iconoDe(o.etapa, $("tarjeta-icono"));
    $("tarjeta-titulo").textContent = o.titulo;
    $("tarjeta-texto").textContent = o.texto;
    $("tarjeta-estrellas").textContent = o.estrellas || "";
    const bs = $("tarjeta-botones");
    bs.textContent = "";
    o.botones.forEach((x) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "bctrl" + (x.primario ? " primary" : "");
      b.textContent = x.texto;
      b.addEventListener("click", () => { t.hidden = true; x.hacer(); });
      bs.appendChild(b);
    });
    t.hidden = false;
    bloqueado = true;
    const enfocar = bs.querySelector(".primary") || $("tarjeta-titulo");
    setTimeout(() => enfocar.focus(), 30);
    decir(o.titulo + ". " + o.texto + (o.estrellas ? " " + o.estrellasDichas : ""));
  }

  function abrirEtapa(i, n, conPresentacion) {
    etapaIdx = i;
    const e = ETAPAS[i];
    const idx = n == null ? primerPendiente(e) : n;
    cargarNivel(idx, true);
    if (conPresentacion && idx === 0 && !puntosDe(e, e.niveles[0])) {
      tarjeta({ etapa: e, titulo: e.titulo, texto: e.intro, botones: [{ texto: "¡Vamos!", primario: true, hacer: () => empezarNivel() }] });
    } else empezarNivel();
  }

  function cerrarEtapa() {
    const e = ETAPAS[etapaIdx];
    const est = estrellasEtapa(e);
    const sig = ETAPAS[etapaIdx + 1];
    const botones = [{ texto: "↺ Jugar la etapa otra vez", hacer: () => abrirEtapa(etapaIdx, 0, false) }];
    if (sig) botones.push({ texto: "Siguiente: " + sig.titulo + " →", primario: true, hacer: () => abrirEtapa(etapaIdx + 1, null, true) });
    tarjeta({ etapa: e, titulo: "¡Etapa terminada!", texto: e.final, estrellas: estrellasTexto(est), estrellasDichas: "Ganaste " + estrellasDichas(est) + " en la etapa.", botones });
  }

  /* ---------------- Un nivel ---------------- */
  function limpiarTemporizadores() { temporizadores.forEach(clearTimeout); temporizadores = []; }
  function luego(ms, f) { temporizadores.push(setTimeout(f, ms)); }

  function cargarNivel(i, sinEmpezar) {
    limpiarTemporizadores();
    nivelIdx = i;
    const e = ETAPAS[etapaIdx];
    nivel = new M.Nivel(e.niveles[i]);
    seleccion = null; ultima = null; castigo = null;
    flechas = (nivel.plano.flechas || []).slice();
    bloqueado = false;
    $("btn-siguiente").hidden = true;
    $("tarjeta").hidden = true;
    try { history.replaceState(null, "", "#" + e.clave + "/" + nivel.plano.id); } catch (err) {}
    pintarMenu();
    pintarPanel();
    dibujar();
    decir("");
    if (!sinEmpezar) empezarNivel();
  }

  function empezarNivel() {
    bloqueado = false;
    const e = ETAPAS[etapaIdx];
    decir(e.titulo + ", nivel " + nivel.plano.id + " de " + e.niveles.length + ". " + nivel.plano.meta + estrellasQueQuedan());
    if (nivel.empiezaElRival()) {
      bloqueado = true;
      luego(1000, () => { rivalSegunGuion(); bloqueado = false; });
    }
  }

  function estrellasQueQuedan() {
    const n = nivel.estrellas.size;
    if (!n) return "";
    return " " + (n === 1 ? "Queda 1 estrella" : "Quedan " + n + " estrellas") + ": " + [...nivel.estrellas].sort().map(casillaDicha).join(", ") + ".";
  }
  const casillaDicha = (sq) => (enPalabras() && window.BlindNotation && BlindNotation.squareSpoken ? BlindNotation.squareSpoken(sq) : sq);
  function enPalabras() { return document.documentElement.classList.contains("adaptive-mode"); }

  function rivalSegunGuion() {
    const r = nivel.rivalJuega();
    if (!r) return;
    ultima = { from: r.jugada.from, to: r.jugada.to };
    flechas = (r.flechas || []).slice();
    dibujar();
    decir("Las negras juegan " + jugadaDicha(r.jugada.san) + ". Te toca.");
  }

  function jugadaDicha(san) { return window.ComandosTablero && ComandosTablero.jugadaParaMostrar ? ComandosTablero.jugadaParaMostrar(san) : san; }

  function alTocar(sq) {
    if (bloqueado || !nivel || nivel.fallado || nivel.completo) return;
    if (seleccion && seleccion !== sq && nivel.destinos(seleccion).some((m) => m.to === sq)) { intentar(seleccion, sq); return; }
    const p = nivel.juego.get(sq);
    if (p && p.color === nivel.plano.color && !nivel.esEstrella(sq)) seleccion = seleccion === sq ? null : sq;
    else seleccion = null;
    dibujar();
  }

  function intentar(desde, hasta, promo) {
    if (promo) { ejecutar(desde, hasta, promo); return; }
    EjercicioTablero.jugarCoronando(vista, desde, hasta, (pieza) => ejecutar(desde, hasta, pieza));
  }

  function ejecutar(desde, hasta, promo) {
    const color = nivel.plano.color;
    const r = nivel.jugar({ from: desde, to: hasta, promotion: promo });
    if (r.estado === "nada") return;
    ultima = { from: r.jugada.from, to: r.jugada.to };
    seleccion = null;
    // Las flechas de ayuda se van con la primera jugada, como en Lichess.
    flechas = r.guion ? (r.guion.flechas || []).slice() : [];
    if (r.jaques && r.jaques.length) flechas = r.jaques.map((j) => j.from + j.to + ":amarillo");
    // Tomar una estrella no es comer una pieza: «Te7», no «Txe7».
    const dicha = jugadaDicha(r.comio === "estrella" && r.jugada.piece !== "p" ? r.jugada.san.replace("x", "") : r.jugada.san);

    if (r.estado === "fallo") {
      $("btn-reintentar").focus({ preventScroll: true });
      if (r.motivo === "jaque-propio") {
        flechas = r.atacantes.map((j) => j.from + j.to + ":rojo");
        dibujar();
        decir("✗ " + dicha + " deja a tu rey en jaque: esa jugada no se puede hacer. Presiona «Reintentar».", "bad");
      } else if (r.motivo === "colgada") {
        castigo = r.castigo;
        dibujar();
        decir("✗ Con " + dicha + " te comen una pieza sin proteger: " + casillaDicha(castigo.from) + " come en " + casillaDicha(castigo.to) + ". Presiona «Reintentar».", "bad");
        luego(700, () => { nivel.juego.apply(castigo); ultima = { from: castigo.from, to: castigo.to }; castigo = null; dibujar(); });
      } else {
        dibujar();
        decir("✗ " + dicha + " no era la jugada. Presiona «Reintentar» y prueba otra vez.", "bad");
        if (nivel.plano.seguirTrasFallo) luego(700, () => { const m = nivel.rivalAlAzar(); if (m) { ultima = { from: m.from, to: m.to }; dibujar(); } });
      }
      pintarPanel();
      return;
    }

    if (r.estado === "completo") {
      const e = ETAPAS[etapaIdx];
      const est = M.estrellasDelNivel(nivel.plano, nivel.puntos);
      const nuevo = guardarPuntos(e, nivel.plano, nivel.puntos);
      if (nuevo && window.EntrenoProgress) EntrenoProgress.log("aprender", { lesson_id: "aprende-a-jugar:" + e.clave + ":" + nivel.plano.id, category: "aprende-a-jugar", title: e.titulo + " — nivel " + nivel.plano.id, estrellas: est });
      dibujar();
      pintarMenu();
      pintarPanel();
      const ultimo = nivelIdx === e.niveles.length - 1;
      decir("✓ " + dicha + ". ¡Muy bien! Nivel terminado con " + estrellasDichas(est) + " " + estrellasTexto(est) + (est < 3 ? ". Con " + nivel.plano.jugadas + (nivel.plano.jugadas === 1 ? " jugada" : " jugadas") + " ganas tres." : "."), "ok");
      if (nivel.plano.botonSiguiente) {
        const b = $("btn-siguiente");
        b.hidden = false;
        b.textContent = ultimo ? "Terminar la etapa →" : "Siguiente nivel →";
        b.focus({ preventScroll: true });
      } else luego(1400, siguiente);
      return;
    }

    // Sigue: la pieza que se movió queda elegida, para seguir juntando estrellas.
    const p = nivel.juego.get(hasta);
    if (p && p.color === color && !r.guion) seleccion = hasta;
    dibujar();
    pintarPanel();
    let msg = dicha + "." + (r.comio === "estrella" ? " ⭐" : "") + estrellasQueQuedan();
    if (r.jaques && r.jaques.length) msg += " ¡Jaque!";
    decir(msg);
    if (r.guion && !nivel.guionCompleto()) {
      bloqueado = true;
      luego(1000, () => { rivalSegunGuion(); bloqueado = false; });
    }
  }

  function siguiente() {
    const e = ETAPAS[etapaIdx];
    if (nivelIdx < e.niveles.length - 1) cargarNivel(nivelIdx + 1);
    else cerrarEtapa();
  }

  $("btn-reintentar").addEventListener("click", () => cargarNivel(nivelIdx));
  $("btn-siguiente").addEventListener("click", siguiente);

  // Arrastrar y soltar (además del clic-clic): js/board-drag.js.
  if (typeof enableBoardDrag !== "undefined") {
    enableBoardDrag(tableroEl, {
      isDraggable: (sq) => {
        if (bloqueado || !nivel || nivel.fallado || nivel.completo) return false;
        const p = nivel.juego.get(sq);
        return !!(p && p.color === nivel.plano.color && !nivel.esEstrella(sq));
      },
      isSelected: (sq) => seleccion === sq,
      onSquareClick: (sq) => alTocar(sq),
    });
  }

  /* ---------------- Teclado, lector de pantalla y recuadro ---------------- */
  let teclado = null;
  function montarTeclado() {
    if (teclado || !window.TableroAccesible) return;
    teclado = TableroAccesible.montar(tableroEl, { nombre: "Tablero de la lección", juego: () => vista });
  }

  function pintarLectura() {
    const el = $("position-readout");
    if (!enPalabras() || !nivel || !window.BlindNotation) { el.style.display = "none"; return; }
    el.innerHTML = BlindNotation.groupedReadoutHTML(vista);
    if (nivel.estrellas.size) {
      const p = document.createElement("p");
      p.textContent = "Estrellas: " + [...nivel.estrellas].sort().map(casillaDicha).join(", ") + ".";
      el.appendChild(p);
    }
    el.style.display = "block";
  }

  let comandos = null;
  function montarComandos() {
    if (comandos || !window.CuadroComandos) return;
    comandos = CuadroComandos.montar($("q-comandos"), {
      etiqueta: "Escribe tu jugada, o una pregunta sobre la posición",
      juego: () => vista,
      tablero: () => teclado,
      onEnviar: escrito,
    });
    comandos.ayuda("Jugada: «Te7», «Cf3», «e2 e4». «estrellas» dice dónde quedan; «meta», lo que pide el nivel; «reintentar» y «siguiente». Pregunta: «caballos», «qué hay en e4». Escribe «ayuda» para todo.");
  }

  function escrito(texto, api) {
    const t = CuadroComandos.normalizar(texto);
    if (/^(reintentar|otra vez|de nuevo|reiniciar)$/.test(t)) { api.limpiar(); cargarNivel(nivelIdx); return; }
    if (/^(siguiente|seguir|continuar)$/.test(t)) {
      api.limpiar();
      if (!$("tarjeta").hidden) { const b = $("tarjeta-botones").querySelector(".primary"); if (b) b.click(); return; }
      if (nivel && nivel.completo) siguiente(); else api.decir("Primero termina este nivel. Escribe «meta» para oír lo que pide.");
      return;
    }
    if (/^(estrellas?|donde estan las estrellas)$/.test(t)) { api.decir(nivel.estrellas.size ? estrellasQueQuedan().trim() : "En este nivel no hay estrellas."); return; }
    if (/^(meta|leer|que hay que hacer|objetivo)$/.test(t)) { api.decir(nivel.plano.meta + estrellasQueQuedan()); return; }
    if (!$("tarjeta").hidden) { api.decir("Escribe «siguiente» para seguir."); return; }
    if (bloqueado) { api.decir("Espera un momento."); return; }
    if (nivel.fallado || nivel.completo) { api.decir(nivel.completo ? "Nivel terminado. Escribe «siguiente»." : "Escribe «reintentar» para volver a empezar el nivel."); return; }
    const mv = ComandosTablero.jugadaEscrita(vista, texto);
    if (!mv) { api.decir(ComandosTablero.noSePudoJugar(texto)); return; }
    api.limpiar();
    intentar(mv.from, mv.to, mv.promotion);
  }

  /* ---------------- Modo normal / adaptado ----------------
     El mismo interruptor de Desafíos y Aprender (js/adaptive-mode.js). */
  const modeNormalBtn = $("mode-normal-btn"), modeBlindBtn = $("mode-blind-btn");
  const refrescarVoz = window.BlindNotation ? BlindNotation.setupSpeechToggle("speech-toggle-btn", () => true) : null;
  function pintarModo() {
    const on = enPalabras();
    modeNormalBtn.classList.toggle("active", !on); modeNormalBtn.setAttribute("aria-pressed", String(!on));
    modeBlindBtn.classList.toggle("active", on); modeBlindBtn.setAttribute("aria-pressed", String(on));
    if (refrescarVoz) refrescarVoz();
    pintarLectura();
  }
  function ponerModo(on) {
    if (window.AdaptiveMode) AdaptiveMode.set(on);
    else try { localStorage.setItem("oscarBlindMode_v1", on ? "1" : "0"); } catch (e) {}
    pintarModo();
  }
  modeNormalBtn.addEventListener("click", () => ponerModo(false));
  modeBlindBtn.addEventListener("click", () => ponerModo(true));
  document.addEventListener("adaptivemode:change", pintarModo);

  /* ---------------- Arranque ---------------- */
  function desdeElEnlace() {
    const m = (location.hash || "").match(/^#([a-z-]+)(?:\/(\d+))?$/);
    if (!m) return null;
    const i = ETAPAS.findIndex((e) => e.clave === m[1]);
    if (i < 0) return null;
    const n = m[2] ? Math.min(Math.max(parseInt(m[2], 10) - 1, 0), ETAPAS[i].niveles.length - 1) : null;
    return { i, n };
  }

  async function unlock() {
    $("gate").classList.add("hidden");
    $("app").classList.remove("hidden");
    if (window.EntrenoProgress) EntrenoProgress.init();
    // El progreso vive en la cuenta: se baja y se funde con el de este aparato ANTES de pintar.
    if (window.ProgresoUsuario) await ProgresoUsuario.init();
    montarComandos();
    pintarModo();
    const d = desdeElEnlace();
    if (d) abrirEtapa(d.i, d.n, d.n == null);
    else {
      const i = ETAPAS.findIndex((e) => e.niveles.some((n) => !puntosDe(e, n)));
      abrirEtapa(i < 0 ? 0 : i, null, true);
    }
  }

  async function requireLoginThenGate() {
    let hay = false;
    try { const { data } = await sb.auth.getSession(); hay = !!(data && data.session); } catch (e) { hay = false; }
    if (!hay) {
      $("gate-checking").textContent = "Necesitas iniciar sesión para entrar a Aprende a jugar. Te llevamos a iniciar sesión…";
      window.location.href = "../login.html?next=" + encodeURIComponent(NEXT_PATH);
      return;
    }
    unlock();
  }
  requireLoginThenGate();

  // Las letras y los números del borde (js/coordenadas-tablero.js).
  if (window.Coordenadas) Coordenadas.aplicar(tableroEl);
})();
