/* El código de entreno/tipos.html: la ficha de los Tipos de entrenamiento y
 * los siete primeros juegos (los otros siete, en js/entreno-tipos-mas.js).
 *
 * Qué es cada tipo y sus niveles: js/tipos-catalogo.js. Las reglas (qué es
 * posible, cómo se corrige, cómo se defiende el rey): js/tipos-reglas.js. Las
 * posiciones: entreno/data/tipos.json, que arma herramientas/tipos-generar.js.
 * Esta página solo pinta y escucha.
 *
 * El avance vive en la cuenta (js/progreso-usuario.js): "tipos_estrellas_v1"
 * guarda las mejores estrellas de cada ejercicio ("detective:det-1-…" → 3) y
 * "tipos_mejor_v1" las menos jugadas de cada final de Con lo justo. Un
 * ejercicio cuenta como resuelto con una estrella o más.
 */
(function () {
  "use strict";

  const NEXT_PATH = "entreno/tipos.html";
  const $ = (id) => document.getElementById(id);
  const C = window.TiposCatalogo;
  const R = window.TiposReglas;
  const CLAVE_ESTRELLAS = "tipos_estrellas_v1";
  const CLAVE_MEJOR = "tipos_mejor_v1";
  const LISTA_TIPOS = ["detective", "amenaza", "descarte", "balanza", "fotografia", "con-lo-justo"];

  let DATOS = null;

  /* ------------------------------------------------------------ el avance */
  function leer(clave) {
    try { return JSON.parse(localStorage.getItem(clave) || "{}") || {}; } catch (e) { return {}; }
  }
  function escribir(clave, obj) {
    try { localStorage.setItem(clave, JSON.stringify(obj)); } catch (e) {}
  }
  function estrellasDe(tipo, id) { return leer(CLAVE_ESTRELLAS)[C.clave(tipo, id)] || 0; }
  function anotarEstrellas(tipo, id, n) {
    if (!(n >= 1)) return;
    const o = leer(CLAVE_ESTRELLAS);
    const k = C.clave(tipo, id);
    if ((o[k] || 0) >= n) return;
    o[k] = n;
    escribir(CLAVE_ESTRELLAS, o);
  }
  function anotarMejor(id, jugadas) {
    const o = leer(CLAVE_MEJOR);
    if (o[id] && o[id] <= jugadas) return;
    o[id] = jugadas;
    escribir(CLAVE_MEJOR, o);
  }
  function itemsDe(tipo, nivel) {
    const l = (DATOS && DATOS[tipo]) || [];
    return nivel ? l.filter((x) => x.nivel === +nivel) : l;
  }
  function avance(tipo, nivel) {
    const items = itemsDe(tipo, nivel);
    const est = leer(CLAVE_ESTRELLAS);
    let hechos = 0, estrellas = 0;
    items.forEach((x) => { const e = est[C.clave(tipo, x.id)] || 0; if (e >= 1) hechos++; estrellas += e; });
    return { hechos, total: items.length, estrellas, maximo: items.length * 3 };
  }
  function textoEstrellas(n) { return "★".repeat(n) + "☆".repeat(Math.max(0, 3 - n)); }

  /* ------------------------------------------------------------ utilidades */
  function el(tag, cls, texto) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }
  const BTN = "text-sm font-semibold px-4 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
  const BTN_PRIMARIO = BTN + " bg-accent-500 hover:bg-accent-600 text-brand-900";
  const BTN_SEGUNDO = BTN + " bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200";
  function boton(texto, cls, fn) {
    const b = el("button", cls || BTN_PRIMARIO, texto);
    b.type = "button";
    if (fn) b.addEventListener("click", fn);
    return b;
  }
  function estado(texto) {
    const e = $("estado");
    // vaciar y volver a poner: si el texto se repite, el lector lo vuelve a leer
    e.textContent = "";
    setTimeout(() => { e.textContent = texto; }, 30);
  }
  function explicar(nodos) {
    const e = $("explicacion");
    e.innerHTML = "";
    if (!nodos) { e.classList.add("hidden"); return; }
    (Array.isArray(nodos) ? nodos : [nodos]).forEach((n) => e.appendChild(typeof n === "string" ? el("p", "mb-2", n) : n));
    e.classList.remove("hidden");
  }
  const COLOR = { w: "blancas", b: "negras" };

  /* ------------------------------------------------------------ el tablero
     Uno solo en la página, que cada juego vuelve a pintar. Las casillas son
     botones cuando se pueden tocar, y llevan su nombre en data-square: así
     js/tablero-accesible.js (flechas, «o», «z»…) y js/coordenadas-tablero.js
     funcionan sin saber nada de este juego. */
  const tab = {
    fen: null, orientacion: "w", clic: null, marcas: {}, sel: null, destinos: [], ultima: null,
    oculto: false, juego: null, piezasLibres: null,
  };
  let accesible = null;
  function piezaEn(s) {
    if (tab.piezasLibres) {
      const v = tab.piezasLibres[s];
      return v ? { color: v[0], type: v[1] } : null;
    }
    if (!tab.fen || tab.oculto) return null;
    const p = R.tablero(tab.fen)[R.idx(s)];
    return p ? { color: p.c, type: p.t } : null;
  }
  function pintar() {
    const t = $("tablero");
    t.innerHTML = "";
    t.classList.toggle("oculto", !!tab.oculto);
    const filas = tab.orientacion === "w" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
    const cols = tab.orientacion === "w" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
    filas.forEach((r) => cols.forEach((f) => {
      const s = "abcdefgh"[f] + r;
      const celda = document.createElement(tab.clic ? "button" : "div");
      if (tab.clic) { celda.type = "button"; celda.addEventListener("click", () => tab.clic(s)); }
      celda.className = "sq " + ((f + r) % 2 === 1 ? "light" : "dark");
      celda.dataset.square = s;
      if (tab.sel === s) celda.classList.add("sel");
      if (tab.destinos.indexOf(s) >= 0) celda.classList.add("destino");
      if (tab.ultima && tab.ultima.indexOf(s) >= 0) celda.classList.add("ultima");
      const m = tab.marcas[s];
      if (m) { celda.classList.add(m.cls); celda.dataset.marca = m.signo; }
      const p = piezaEn(s);
      let nombre = window.TableroAccesible ? TableroAccesible.casillaHablada(s) : s;
      if (p) {
        const span = document.createElement("span");
        span.setAttribute("aria-hidden", "true");
        if (window.PiezaPreferida) PiezaPreferida.pintar(span, p.type, p.color);
        else span.textContent = p.type;
        span.classList.add("tp-pieza");
        celda.appendChild(span);
        nombre += ", " + (window.TableroAccesible ? TableroAccesible.piezaDicha(p) : p.type);
      }
      if (m) nombre += ", " + m.dicho;
      celda.setAttribute("aria-label", nombre);
      if (!tab.clic) celda.setAttribute("role", "img");
      t.appendChild(celda);
    }));
    if (window.Coordenadas) Coordenadas.aplicar(t);
    if (!accesible && window.TableroAccesible) {
      accesible = TableroAccesible.montar(t, {
        nombre: "Tablero del ejercicio",
        // la partida de verdad cuando hay una (para «m», a dónde puede ir);
        // si no, solo lo que se ve pintado
        juego: () => tab.juego || { get: piezaEn, turn: () => (tab.fen ? tab.fen.split(" ")[1] : "w"), moves: () => [] },
        cuadro: () => (!$("jugada-form").classList.contains("hidden") ? "jugada-input" : null),
      });
    }
  }
  function tablero(fen, opciones) {
    Object.assign(tab, { fen, orientacion: "w", clic: null, marcas: {}, sel: null, destinos: [], ultima: null, oculto: false, juego: null, piezasLibres: null }, opciones || {});
    pintar();
  }
  /* Un tablero fijo, solo para mirar (la posición A de Siete diferencias). Se
     lee entero: la imagen lleva la posición dicha en su nombre accesible. */
  function tableroFijo(elId, fen, orientacion, marcas) {
    const t = $(elId);
    t.innerHTML = "";
    const tabF = R.tablero(fen);
    const filas = orientacion === "w" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
    const cols = orientacion === "w" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
    filas.forEach((r) => cols.forEach((f) => {
      const s = "abcdefgh"[f] + r;
      const celda = document.createElement("div");
      celda.className = "sq " + ((f + r) % 2 === 1 ? "light" : "dark");
      celda.dataset.square = s;
      const m = marcas && marcas[s];
      if (m) { celda.classList.add(m.cls); celda.dataset.marca = m.signo; }
      const p = tabF[R.idx(s)];
      if (p) {
        const span = document.createElement("span");
        span.setAttribute("aria-hidden", "true");
        if (window.PiezaPreferida) PiezaPreferida.pintar(span, p.t, p.c);
        else span.textContent = p.t;
        span.classList.add("tp-pieza");
        celda.appendChild(span);
      }
      t.appendChild(celda);
    }));
    t.setAttribute("role", "img");
    t.setAttribute("aria-label", window.BlindNotation ? BlindNotation.positionSentence(new Chess(fen)) : fen);
    if (window.Coordenadas) Coordenadas.aplicar(t);
  }
  function leerPosicion(fen) {
    const p = $("lectura");
    if (!fen) { p.classList.add("hidden"); p.textContent = ""; return; }
    const g = new Chess(fen);
    p.textContent = window.BlindNotation ? BlindNotation.positionSentence(g) : fen;
    p.classList.remove("hidden");
  }
  /* En Modo Adaptado la posición va también escrita debajo del tablero:
     quien no lo ve la necesita leída (menos en Fotografía mientras se
     reconstruye, que sería soplar la respuesta). */
  function adaptado() { return document.documentElement.classList.contains("adaptive-mode"); }

  /* Mover con clic: primero la pieza, después la casilla. */
  function moverConClic(juego, alMover) {
    return (s) => {
      const p = juego.get(s);
      if (tab.sel && tab.destinos.indexOf(s) >= 0) {
        const m = juego.moves({ verbose: true }).find((x) => x.from === tab.sel && x.to === s);
        tab.sel = null; tab.destinos = [];
        if (m) { alMover({ from: m.from, to: m.to, promotion: m.promotion ? "q" : undefined }); return; }
      }
      if (p && p.color === juego.turn()) {
        tab.sel = s;
        tab.destinos = juego.moves({ square: s, verbose: true }).map((x) => x.to);
      } else { tab.sel = null; tab.destinos = []; }
      pintar();
    };
  }
  /* Lo escrito, en castellano primero. ChessMoveParser prueba antes el texto
     tal cual, en inglés, y «Rc3» en inglés es la TORRE: con rey y torre, quien
     escribe «Rc3» queriendo mover el rey movía la torre. Acá la R es el rey,
     la T la torre, la D la dama, la A el alfil y la C el caballo; si así no es
     legal, se prueba lo demás (inglés, sin x, etc.). */
  const ES_EN = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
  function jugadaEscrita(juego, txt) {
    const t = String(txt || "").trim();
    if (ES_EN[t[0]]) {
      const g = new Chess(juego.fen());
      const m = ChessMoveParser.tryParseMove(g, ES_EN[t[0]] + t.slice(1).replace(/=([DTAC])/i, (_, c) => "=" + ES_EN[c.toUpperCase()]));
      if (m) return m;
    }
    return ChessMoveParser.tryParseMove(new Chess(juego.fen()), t);
  }
  let alEscribir = null;
  function pedirJugada(etiqueta, fn) {
    alEscribir = fn;
    $("jugada-label").textContent = etiqueta;
    $("jugada-form").classList.toggle("hidden", !fn);
    $("jugada-input").value = "";
  }
  $("jugada-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!alEscribir) return;
    const txt = $("jugada-input").value.trim();
    if (!txt) return;
    alEscribir(txt);
  });

  /* ------------------------------------------------------------ las vistas */
  function mostrar(vista) {
    ["vista-fichas", "vista-tipo", "vista-juego"].forEach((v) => $(v).classList.toggle("hidden", v !== vista));
  }

  function pintarFichas() {
    const ul = $("fichas");
    ul.innerHTML = "";
    C.TIPOS.forEach((t) => {
      const a = avance(t.id);
      const li = el("li", "relative flex flex-col gap-3 rounded-2xl p-6 shadow-md bg-white dark:bg-brand-900");
      const cab = el("div", "flex items-start gap-3");
      const ico = el("span", "w-12 h-12 shrink-0 rounded-xl flex items-center justify-center text-3xl bg-brand-50 dark:bg-brand-800", t.emoji);
      ico.setAttribute("aria-hidden", "true");
      cab.appendChild(ico);
      const tit = el("div");
      const h = el("h2", "font-serif text-lg font-bold text-brand-800 dark:text-white");
      const enlace = el("a", "rounded hover:text-accent-700 dark:hover:text-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500", t.nombre);
      enlace.href = "#" + t.id;
      h.appendChild(enlace);
      tit.appendChild(h);
      tit.appendChild(el("p", "text-sm font-semibold text-brand-600 dark:text-brand-300", t.pregunta));
      cab.appendChild(tit);
      li.appendChild(cab);
      const dl = el("dl", "text-sm text-brand-600 dark:text-brand-300 grid gap-2");
      [["Qué entrena", t.entrena], ["Cómo se juega", t.como], ["En clase", t.clase]].forEach(([k, v]) => {
        const d = el("div");
        d.appendChild(el("dt", "font-semibold text-brand-800 dark:text-brand-100", k));
        d.appendChild(el("dd", "m-0", v));
        dl.appendChild(d);
      });
      li.appendChild(dl);
      const niv = el("p", "text-xs text-brand-500 dark:text-brand-300");
      niv.textContent = t.niveles.length + " niveles: " + t.niveles.map((n) => n.n + ". " + n.titulo).join(" · ");
      li.appendChild(niv);
      const pie = el("div", "flex flex-wrap items-center justify-between gap-2 mt-auto");
      pie.appendChild(el("span", "text-xs text-brand-500 dark:text-brand-300", a.hechos + " de " + a.total + " resueltos · " + a.estrellas + " de " + a.maximo + " estrellas"));
      const ir = el("a", BTN_PRIMARIO + " inline-block", a.hechos ? "Continuar" : "Empezar");
      ir.href = "#" + t.id;
      ir.setAttribute("aria-label", (a.hechos ? "Continuar" : "Empezar") + ": " + t.nombre);
      pie.appendChild(ir);
      li.appendChild(pie);
      ul.appendChild(li);
    });
  }

  function pintarTipo(tipoId) {
    const t = C.tipo(tipoId);
    $("titulo-tipo").textContent = "";
    const e = el("span", null, t.emoji + " "); e.setAttribute("aria-hidden", "true");
    $("titulo-tipo").append(e, t.nombre);
    $("tipo-pregunta").textContent = t.pregunta;
    $("tipo-como").textContent = t.como;
    const ul = $("niveles");
    ul.innerHTML = "";
    t.niveles.forEach((n) => {
      const a = avance(tipoId, n.n);
      const li = el("li", "flex flex-col gap-2 rounded-xl p-5 bg-white dark:bg-brand-900 shadow-sm border-l-4 " + (a.total && a.hechos >= a.total ? "border-green-700" : "border-accent-500"));
      const h = el("h2", "font-semibold text-brand-800 dark:text-white", "Nivel " + n.n + " — " + n.titulo);
      li.appendChild(h);
      li.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300 flex-1", n.desc));
      const barra = el("div", "h-1.5 rounded bg-brand-100 dark:bg-brand-800 overflow-hidden");
      barra.setAttribute("role", "progressbar");
      barra.setAttribute("aria-label", "Avance del nivel " + n.n);
      barra.setAttribute("aria-valuemin", "0");
      barra.setAttribute("aria-valuemax", String(a.total));
      barra.setAttribute("aria-valuenow", String(a.hechos));
      const lleno = el("span", "block h-full bg-accent-500");
      lleno.style.width = (a.total ? Math.round(100 * a.hechos / a.total) : 0) + "%";
      barra.appendChild(lleno);
      li.appendChild(barra);
      li.appendChild(el("p", "text-xs text-brand-500 dark:text-brand-300", a.hechos + " de " + a.total + " resueltos · " + a.estrellas + " estrellas" + (a.total && a.hechos >= a.total ? " · completo ✓" : "")));
      const ir = el("a", BTN_PRIMARIO + " inline-block self-start", a.hechos ? (a.hechos >= a.total ? "Repasar" : "Continuar") : "Empezar");
      ir.href = "#" + tipoId + "/" + n.n;
      ir.setAttribute("aria-label", ir.textContent + ": nivel " + n.n + ", " + n.titulo);
      li.appendChild(ir);
      ul.appendChild(li);
    });
  }

  /* ------------------------------------------------------------ el juego */
  const partida = { tipo: null, nivel: null, items: [], i: 0 };
  let limpiarJuego = null;

  function abrirJuego(tipoId, nivelN, itemId) {
    const t = C.tipo(tipoId), n = C.nivel(tipoId, nivelN);
    partida.tipo = tipoId; partida.nivel = +nivelN; partida.items = itemsDe(tipoId, nivelN);
    const pedido = itemId ? partida.items.findIndex((x) => x.id === itemId) : -1;
    partida.i = pedido >= 0 ? pedido : Math.max(0, partida.items.findIndex((x) => estrellasDe(tipoId, x.id) < 1));
    $("titulo-juego").textContent = t.nombre + " — Nivel " + n.n + ": " + n.titulo;
    $("juego-desc").textContent = n.desc;
    $("volver-tipo").href = "#" + tipoId;
    cargarItem();
  }
  function cargarItem() {
    if (limpiarJuego) { limpiarJuego(); limpiarJuego = null; }
    const item = partida.items[partida.i];
    $("controles").innerHTML = "";
    $("juego-turno").textContent = "";
    explicar(null);
    pedirJugada("", null);
    leerPosicion(null);
    $("tablero-a-caja").classList.add("hidden");
    $("lectura-a").classList.add("hidden");
    $("estado").textContent = "";
    if (!item) { estado("Este nivel no tiene ejercicios."); return; }
    const e = estrellasDe(partida.tipo, item.id);
    $("juego-progreso").textContent = "Ejercicio " + (partida.i + 1) + " de " + partida.items.length + (e ? " · tu mejor: " + textoEstrellas(e) : "");
    $("btn-anterior").disabled = partida.i === 0;
    JUEGOS[partida.tipo](item);
    if (adaptado() && partida.tipo !== "fotografia") leerPosicion(item.fen);
  }
  function terminar(item, estrellas, extra) {
    anotarEstrellas(partida.tipo, item.id, estrellas);
    const e = estrellasDe(partida.tipo, item.id);
    $("juego-progreso").textContent = "Ejercicio " + (partida.i + 1) + " de " + partida.items.length + (e ? " · tu mejor: " + textoEstrellas(e) : "");
    if (extra !== false) $("btn-siguiente").focus();
  }
  $("btn-siguiente").addEventListener("click", () => {
    if (partida.i < partida.items.length - 1) { partida.i++; cargarItem(); }
    else { location.hash = "#" + partida.tipo; }
  });
  $("btn-anterior").addEventListener("click", () => { if (partida.i > 0) { partida.i--; cargarItem(); } });
  $("btn-otra-vez").addEventListener("click", () => cargarItem());

  /* ============================================================ los juegos */
  const JUEGOS = {};
  const PREPARAR = {};

  /* ---------- 1. El Detective ---------- */
  JUEGOS.detective = function (item) {
    const turno = item.fen.split(" ")[1], mueve = R.otro(turno);
    tablero(item.fen, { orientacion: "w" });
    $("juego-turno").textContent = "Juegan las " + COLOR[turno] + ": su rey " + (new Chess(item.fen).in_checkmate() ? "recibió jaque mate." : "está en jaque.");
    $("juego-enunciado").textContent = "¿Cuál fue la última jugada de las " + COLOR[mueve] + "?";
    const fs = el("fieldset", "grid gap-2");
    const lg = el("legend", "sr-only", "Opciones: cuál fue la última jugada");
    fs.appendChild(lg);
    let errores = 0, hecho = false;
    item.opciones.forEach((op, k) => {
      const lab = el("label", "flex items-start gap-2 p-3 rounded-lg bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 cursor-pointer");
      const r = el("input", "mt-1");
      r.type = "radio"; r.name = "det-op"; r.value = R.claveRetro(op); r.id = "det-op-" + k;
      const txt = el("span", null, R.etiquetaRetro(op));
      const nota = el("span", "block text-xs mt-1");
      const cuerpo = el("span", "flex-1");
      cuerpo.append(txt, nota);
      lab.append(r, cuerpo);
      fs.appendChild(lab);
      op._nota = nota; op._radio = r;
    });
    $("controles").appendChild(fs);
    const comp = boton("Comprobar", BTN_PRIMARIO + " mt-3", () => {
      if (hecho) return;
      const elegida = item.opciones.find((op) => op._radio.checked);
      if (!elegida) { estado("Elige una de las opciones."); return; }
      if (R.claveRetro(elegida) === item.correcta) {
        hecho = true;
        const n = Math.max(1, 3 - errores);
        item.opciones.forEach((op) => {
          op._radio.disabled = true;
          op._nota.textContent = R.claveRetro(op) === item.correcta ? "✓ Esta sí pudo pasar." : "✗ " + R.explicacionRetro(op.motivo, turno);
        });
        estado("✓ ¡Correcto! " + textoEstrellas(n));
        explicar("En la partida se jugó " + item.jugada + ".");
        terminar(item, n);
      } else {
        errores++;
        elegida._radio.disabled = true;
        elegida._radio.checked = false;
        elegida._nota.textContent = "✗ " + R.explicacionRetro(elegida.motivo, turno);
        estado("✗ Esa no pudo ser. " + R.explicacionRetro(elegida.motivo, turno) + " Prueba con otra.");
      }
    });
    $("controles").appendChild(comp);
  };

  /* ---------- 2. ¿Qué quiere el rival? ---------- */
  JUEGOS.amenaza = function (item) {
    const yo = item.fen.split(" ")[1], rival = R.otro(yo);
    const juego = new Chess(item.fenRival);
    let errores = 0, pista = false, hecho = false;
    const jugar = (mov) => {
      if (hecho) return;
      const r = R.amenazaAcertada(Chess, item, mov);
      if (!r.legal) { estado("Esa jugada no es legal para las " + COLOR[rival] + ". Recuerda: mueves por el rival."); return; }
      if (r.ok) {
        hecho = true;
        juego.move(mov);
        tablero(juego.fen(), { orientacion: yo, ultima: [juego.history({ verbose: true }).slice(-1)[0].from, juego.history({ verbose: true }).slice(-1)[0].to] });
        const n = pista ? 1 : Math.max(1, 3 - errores);
        estado("✓ ¡Eso es lo que quiere! " + R.sanEs(r.san) + ". " + textoEstrellas(n));
        const partes = ["La amenaza: " + item.amenazaEs + (item.mate ? " (mate en " + item.mate + ")" : "") + ". " + (item.motivo || "")];
        if (item.linea) partes.push("La línea: " + item.linea + ".");
        partes.push("Ahora que la viste, en la partida te toca a ti: ¿cómo la frenarías?");
        explicar(partes);
        pedirJugada("", null);
        terminar(item, n);
      } else {
        errores++;
        estado("✗ " + R.sanEs(r.san) + " es legal, pero no es lo que más le conviene al rival. Busca otra vez.");
        tablero(item.fenRival, { orientacion: yo, clic: moverConClic(juego, jugar), juego });
      }
    };
    tablero(item.fenRival, { orientacion: yo, clic: moverConClic(juego, jugar), juego });
    $("juego-turno").textContent = "Juegas con las " + COLOR[yo] + " (el tablero está de tu lado).";
    $("juego-enunciado").textContent = "Antes de mover: ¿qué amenaza el rival? Haz la jugada de las " + COLOR[rival] + ".";
    pedirJugada("O escribe la jugada del rival (las " + COLOR[rival] + ")", (txt) => {
      const m = jugadaEscrita(new Chess(item.fenRival), txt);
      if (!m) { estado("No entendí «" + txt + "» como una jugada de las " + COLOR[rival] + "."); return; }
      $("jugada-input").value = "";
      jugar({ from: m.from, to: m.to, promotion: m.promotion });
    });
    const bp = boton("💡 Pista", BTN_SEGUNDO + " mt-1", () => {
      if (hecho) return;
      pista = true;
      const m = new Chess(item.fenRival).move(item.amenaza);
      estado("Pista: la amenaza es con " + (window.TableroAccesible ? TableroAccesible.piezaDicha({ type: m.piece, color: rival }) : m.piece) + " de " + m.from + ". Con pista, una estrella.");
      tab.marcas = {}; tab.marcas[m.from] = { cls: "m-bien", signo: "?", dicho: "pista: esta pieza" };
      pintar();
    });
    const ver = boton("Ver la respuesta", BTN_SEGUNDO + " mt-1 ml-2", () => {
      if (hecho) return;
      hecho = true;
      estado("La amenaza era " + item.amenazaEs + ".");
      explicar([(item.motivo || "") + (item.linea ? " La línea: " + item.linea + "." : "")]);
      pedirJugada("", null);
    });
    $("controles").append(bp, ver);
  };

  /* ---------- 3. Descarte ---------- */
  JUEGOS.descarte = function (item) {
    const yo = item.fen.split(" ")[1];
    tablero(item.fen, { orientacion: yo });
    $("juego-turno").textContent = "Juegan las " + COLOR[yo] + ".";
    $("juego-enunciado").textContent = "Tacha las jugadas que pierden (las que el rival castiga).";
    const fs = el("fieldset", "grid gap-2");
    fs.appendChild(el("legend", "sr-only", "Candidatas: marca las que pierden"));
    const filas = item.candidatas.map((c, k) => {
      const lab = el("label", "flex items-start gap-2 p-3 rounded-lg bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 cursor-pointer");
      const cb = el("input", "mt-1");
      cb.type = "checkbox"; cb.id = "des-" + k; cb.value = c.san;
      const cuerpo = el("span", "flex-1");
      cuerpo.appendChild(el("span", "font-semibold", "✂️ Tachar " + c.sanEs));
      const nota = el("span", "block text-xs mt-1");
      cuerpo.appendChild(nota);
      lab.append(cb, cuerpo);
      fs.appendChild(lab);
      return { c, cb, nota };
    });
    $("controles").appendChild(fs);
    let hecho = false;
    $("controles").appendChild(boton("Comprobar", BTN_PRIMARIO + " mt-3", () => {
      if (hecho) return;
      hecho = true;
      const r = R.corregirDescarte(item, filas.filter((f) => f.cb.checked).map((f) => f.c.san));
      filas.forEach((f) => {
        f.cb.disabled = true;
        const bien = f.c.pierde === f.cb.checked;
        f.nota.textContent = (bien ? "✓ " : "✗ ") + (f.c.pierde
          ? "Pierde: " + (f.c.mateEn ? "recibe mate en " + f.c.mateEn : "queda " + R.numeroBalanza(f.c.eval / 100 * (yo === "w" ? 1 : -1)) + " para las blancas") + (f.c.refuta ? " tras " + f.c.refuta : "") + "."
          : "Aguanta" + (f.c.eval !== null ? " (queda " + R.numeroBalanza(f.c.eval / 100 * (yo === "w" ? 1 : -1)) + " para las blancas)" : "") + ".");
      });
      const errores = r.total - r.aciertos;
      const n = errores === 0 ? 3 : errores === 1 ? 2 : errores === 2 ? 1 : 0;
      estado((r.perfecto ? "✓ ¡Perfecto! " : "Acertaste " + r.aciertos + " de " + r.total + ". ") + (n ? textoEstrellas(n) : "Sin estrellas: prueba otra vez."));
      explicar("Las evaluaciones son de Stockfish: una jugada «pierde» si queda 2,5 peones o más peor que la mejor.");
      terminar(item, n);
    }));
  };

  /* ---------- 4. Siete diferencias ---------- */
  JUEGOS.diferencias = function (item) {
    const turno = item.fen.split(" ")[1], rival = R.otro(turno);
    const quien = (v, mate) => mate ? (mate > 0 ? "mate en " + mate : "recibe mate en " + (-mate)) : R.numeroBalanza(v / 100);
    // En B el golpe ya no es mate ni jaque de la misma forma: se nombra sin + ni #.
    const golpe = item.golpeEs.replace(/[+#]$/, "");
    let errores = 0, hecho = false;
    $("tablero-a-caja").classList.remove("hidden");
    $("tablero-a-titulo").textContent = "A: aquí " + item.golpeEs + " gana";
    tableroFijo("tablero-a", item.fenA, turno);
    if (adaptado()) { $("lectura-a").textContent = "Posición A: " + $("tablero-a").getAttribute("aria-label"); $("lectura-a").classList.remove("hidden"); }
    $("juego-turno").textContent = "B: casi igual, y aquí " + golpe + " ya no gana. Juegan las " + COLOR[turno] + " en las dos.";
    $("juego-enunciado").textContent = "¿Qué casilla es distinta en B? Tócala en el tablero B o escríbela.";
    const elegir = (s) => {
      if (hecho) return;
      s = String(s || "").trim().toLowerCase();
      if (!/^[a-h][1-8]$/.test(s)) { estado("Escribe una casilla, por ejemplo e4."); return; }
      if (item.cambio.casillas.indexOf(s) < 0) {
        errores++;
        tab.marcas[s] = { cls: "m-mal", signo: "✗", dicho: "igual en las dos" };
        pintar();
        estado("✗ En " + s + " las dos posiciones son iguales. Busca otra vez.");
        return;
      }
      hecho = true;
      const marcas = {};
      item.cambio.casillas.forEach((c) => { marcas[c] = { cls: "m-bien", signo: "✓", dicho: "aquí está la diferencia" }; });
      tableroFijo("tablero-a", item.fenA, turno, marcas);
      Object.assign(tab.marcas, marcas);
      const n = Math.max(1, 3 - errores);
      if (!item.salvan) return cerrar(n, "✓ ¡Ahí está! " + item.texto);
      // Segundo paso: cómo se defiende el rival en B.
      const g = new Chess(item.fen);
      g.move(item.golpe);
      const juego = new Chess(g.fen());
      tablero(juego.fen(), { orientacion: turno, marcas, juego, clic: moverConClic(juego, refutar) });
      estado("✓ ¡Ahí está! " + item.texto + " Ahora: en B, tras " + golpe + ", ¿cómo se defiende el rival?");
      $("juego-enunciado").textContent = "Haz la jugada de las " + COLOR[rival] + " que refuta " + golpe + " en B.";
      pedirJugada("O escribe la jugada de las " + COLOR[rival], (txt) => {
        const m = jugadaEscrita(new Chess(g.fen()), txt);
        if (!m) { estado("No entendí «" + txt + "» como una jugada de las " + COLOR[rival] + "."); return; }
        $("jugada-input").value = "";
        refutar({ from: m.from, to: m.to, promotion: m.promotion });
      });
      $("controles").innerHTML = "";
      $("controles").appendChild(boton("No sé: ver la respuesta", BTN_SEGUNDO, () => cerrar(Math.max(1, n - 1), "La refutación era " + item.salvan.map(R.sanEs).join(" o ") + ".")));
      function refutar(mov) {
        const h = new Chess(g.fen());
        const m = h.move(mov);
        if (!m) { estado("Esa jugada no es legal para las " + COLOR[rival] + "."); return; }
        if (item.salvan.indexOf(m.san) >= 0) cerrar(n, "✓ ¡Eso es! " + R.sanEs(m.san) + " refuta el golpe en B.");
        else cerrar(Math.max(1, n - 1), "✗ " + R.sanEs(m.san) + " no alcanza. La refutación era " + item.salvan.map(R.sanEs).join(" o ") + ".");
      }
    };
    function cerrar(n, texto) {
      pedirJugada("", null);
      $("controles").innerHTML = "";
      tab.clic = null;
      pintar();
      estado(texto + " " + textoEstrellas(n));
      explicar([
        item.texto,
        "En A, " + item.golpeEs + " queda " + quien(item.evalA, item.mateA) + " para las " + COLOR[turno] + ".",
        "En B, " + golpe + " queda " + quien(item.evalB, item.mateB) + " para las " + COLOR[turno] + ": " + item.lineaB + ".",
      ]);
      terminar(item, n);
    }
    tablero(item.fen, { orientacion: turno, clic: elegir });
    pedirJugada("O escribe la casilla (por ejemplo, e4)", (txt) => { $("jugada-input").value = ""; elegir(txt); });
  };

  /* ---------- 5. La balanza ---------- */
  JUEGOS.balanza = function (item) {
    tablero(item.fen, { orientacion: "w" });
    const turno = item.fen.split(" ")[1];
    $("juego-turno").textContent = "Juegan las " + COLOR[turno] + ".";
    $("juego-enunciado").textContent = "¿Quién está mejor, y por cuánto?";
    const caja = el("div", "grid gap-2");
    const lab = el("label", "text-sm text-brand-600 dark:text-brand-300", "Tu evaluación, de −5 (ganan las negras) a +5 (ganan las blancas)");
    lab.htmlFor = "aguja";
    const aguja = el("input", "tp-aguja");
    Object.assign(aguja, { type: "range", id: "aguja", min: "-5", max: "5", step: "0.5", value: "0" });
    const lectura = el("p", "text-center font-semibold text-brand-800 dark:text-white");
    lectura.setAttribute("aria-hidden", "true");
    const decir = () => {
      const v = +aguja.value;
      const t = R.numeroBalanza(v) + " — " + R.veredictoBalanza(v);
      lectura.textContent = t;
      aguja.setAttribute("aria-valuetext", t);
    };
    aguja.addEventListener("input", decir);
    decir();
    const extremos = el("div", "flex justify-between text-xs text-brand-500 dark:text-brand-300");
    extremos.setAttribute("aria-hidden", "true");
    extremos.append(el("span", null, "−5 negras"), el("span", null, "0"), el("span", null, "+5 blancas"));
    caja.append(lab, aguja, extremos, lectura);
    $("controles").appendChild(caja);
    let hecho = false;
    $("controles").appendChild(boton("Comprobar", BTN_PRIMARIO + " mt-3", () => {
      if (hecho) return;
      hecho = true;
      aguja.disabled = true;
      const r = R.puntosBalanza(+aguja.value, item.eval);
      const motor = item.mate ? "mate en " + Math.abs(item.mate) + " para las " + (item.mate > 0 ? "blancas" : "negras") : R.numeroBalanza(item.eval) + " (" + R.veredictoBalanza(item.eval) + ")";
      estado((r.acierto ? "✓ " : "") + "El motor dice " + motor + ". Tú: " + R.numeroBalanza(+aguja.value) + ". " + (r.estrellas ? textoEstrellas(r.estrellas) : "Sin estrellas."));
      const mat = item.material === 0 ? "igual" : (item.material > 0 ? "+" + item.material + " para las blancas" : "+" + (-item.material) + " para las negras");
      explicar(["Material: " + mat + ".", item.linea ? "Lo que ve el motor: " + item.linea + "." : "", item.nombre ? "Posición de la línea «" + item.nombre + "»." : ""].filter(Boolean));
      terminar(item, r.estrellas);
    }));
  };

  /* ---------- 6. Fotografía ---------- */
  JUEGOS.fotografia = function (item) {
    const n = C.nivel("fotografia", item.nivel);
    let quedan = n.segundos, reloj = null;
    tablero(item.fen, { orientacion: "w" });
    $("juego-turno").textContent = item.piezas + " piezas en el tablero.";
    $("juego-enunciado").textContent = "Mírala bien: tienes " + n.segundos + " segundos.";
    const cuenta = el("p", "text-3xl font-bold text-center text-brand-800 dark:text-white my-3 tabular-nums", String(quedan));
    cuenta.setAttribute("aria-hidden", "true");
    $("controles").appendChild(cuenta);
    if (adaptado()) leerPosicion(item.fen);
    estado("Tienes " + n.segundos + " segundos para memorizar la posición.");
    const listo = boton("Ya la tengo", BTN_PRIMARIO, () => ocultar());
    $("controles").appendChild(listo);
    reloj = setInterval(() => {
      quedan--;
      cuenta.textContent = String(quedan);
      if (quedan <= 0) ocultar();
    }, 1000);
    limpiarJuego = () => clearInterval(reloj);
    function ocultar() {
      clearInterval(reloj);
      leerPosicion(null);
      $("controles").innerHTML = "";
      if (item.preguntas) preguntar(); else reconstruir();
    }
    function preguntar() {
      tablero(item.fen, { orientacion: "w", oculto: true });
      $("juego-enunciado").textContent = "Contesta sobre lo que viste.";
      const grupos = item.preguntas.map((q, k) => {
        const fs = el("fieldset", "mb-3");
        fs.appendChild(el("legend", "font-semibold text-sm text-brand-800 dark:text-white mb-1", q.texto));
        const nota = el("p", "text-xs mt-1");
        q.opciones.forEach((o, j) => {
          const lab = el("label", "inline-flex items-center gap-1 mr-3 mb-1 text-sm cursor-pointer");
          const r = el("input");
          r.type = "radio"; r.name = "foto-q" + k; r.value = o;
          lab.append(r, document.createTextNode(o));
          fs.appendChild(lab);
        });
        fs.appendChild(nota);
        $("controles").appendChild(fs);
        return { q, fs, nota };
      });
      estado("Las piezas desaparecieron. Contesta las tres preguntas.");
      $("controles").appendChild(boton("Comprobar", BTN_PRIMARIO + " mt-2", function () {
        this.disabled = true;
        let bien = 0;
        grupos.forEach((g) => {
          const marcada = g.fs.querySelector("input:checked");
          const ok = marcada && marcada.value === g.q.correcta;
          if (ok) bien++;
          g.fs.querySelectorAll("input").forEach((x) => { x.disabled = true; });
          g.nota.textContent = ok ? "✓ Correcto." : "✗ Era: " + g.q.correcta + ".";
        });
        tablero(item.fen, { orientacion: "w" });
        estado("Acertaste " + bien + " de 3. " + (bien ? textoEstrellas(bien) : "Sin estrellas."));
        terminar(item, bien);
      }));
    }
    function reconstruir() {
      const colocado = {};
      let elegida = "wp";
      tablero(null, { orientacion: "w", piezasLibres: colocado, clic: (s) => {
        if (colocado[s] === elegida || elegida === "x") delete colocado[s];
        else colocado[s] = elegida;
        pintar();
        if (accesible) accesible.decir(s + ": " + (colocado[s] ? TableroAccesible.piezaDicha({ color: colocado[s][0], type: colocado[s][1] }) : "vacía"));
      } });
      $("juego-enunciado").textContent = "Reconstrúyela: elige una pieza y toca las casillas.";
      const paleta = el("div", "tp-paleta flex flex-wrap gap-1 mb-3");
      paleta.setAttribute("role", "group");
      paleta.setAttribute("aria-label", "Pieza para colocar");
      const opciones = ["wk", "wq", "wr", "wb", "wn", "wp", "bk", "bq", "br", "bb", "bn", "bp", "x"];
      const botones = opciones.map((o) => {
        const b = el("button", "w-10 h-10 rounded-lg bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 text-2xl flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
        b.type = "button";
        if (o === "x") { b.textContent = "🧽"; b.setAttribute("aria-label", "Borrar: tocar una casilla la vacía"); }
        else {
          const sp = el("span"); sp.setAttribute("aria-hidden", "true");
          if (window.PiezaPreferida) PiezaPreferida.pintar(sp, o[1], o[0]); else sp.textContent = o;
          b.appendChild(sp);
          b.setAttribute("aria-label", TableroAccesible.piezaDicha({ color: o[0], type: o[1] }));
        }
        b.setAttribute("aria-pressed", o === elegida ? "true" : "false");
        b.addEventListener("click", () => { elegida = o; botones.forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false")); });
        paleta.appendChild(b);
        return b;
      });
      $("controles").appendChild(paleta);
      // Escribirla: también sirve sin ver el tablero.
      const escr = el("div", "grid gap-2 mb-3");
      const campos = ["w", "b"].map((c) => {
        const lab = el("label", "text-xs text-brand-600 dark:text-brand-300", "Piezas " + COLOR[c] + " (ej.: Rg1 Tf1 Dd1 Ce5 Ab2 a2 b3)");
        const inp = el("input", "bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500");
        inp.type = "text"; inp.id = "foto-" + c; inp.autocomplete = "off"; inp.spellcheck = false;
        lab.htmlFor = inp.id;
        escr.append(lab, inp);
        return { c, inp };
      });
      escr.appendChild(boton("Colocar lo escrito", BTN_SEGUNDO, () => {
        const malas = [];
        campos.forEach(({ c, inp }) => {
          const r = R.leerPiezas(inp.value, c);
          Object.keys(r.piezas).forEach((s) => { colocado[s] = r.piezas[s]; });
          malas.push(...r.malas);
        });
        pintar();
        estado(malas.length ? "No entendí: " + malas.join(", ") + "." : "Colocadas " + Object.keys(colocado).length + " piezas.");
      }));
      $("controles").appendChild(escr);
      estado("Las piezas desaparecieron. Reconstruye la posición.");
      $("controles").appendChild(boton("Comprobar", BTN_PRIMARIO, function () {
        this.disabled = true;
        const r = R.compararFoto(item.fen, colocado);
        const marcas = {};
        const real = R.tablero(item.fen);
        for (let i = 0; i < 64; i++) {
          const s = R.sq(i);
          if (real[i] && colocado[s] === real[i].c + real[i].t) marcas[s] = { cls: "m-bien", signo: "✓", dicho: "bien" };
        }
        r.faltan.forEach((s) => { marcas[s] = { cls: "m-mal", signo: "−", dicho: "faltaba" }; });
        r.cambiadas.forEach((s) => { marcas[s] = { cls: "m-mal", signo: "✗", dicho: "otra pieza" }; });
        r.sobran.forEach((s) => { marcas[s] = { cls: "m-mal", signo: "+", dicho: "sobraba" }; });
        tablero(item.fen, { orientacion: "w", marcas });
        const n = R.estrellasFoto(r.errores, r.total);
        estado((r.errores ? "Acertaste " + r.aciertos + " de " + r.total + " piezas. " : "✓ ¡Perfecta! ") + (n ? textoEstrellas(n) : "Sin estrellas."));
        const partes = [];
        if (r.faltan.length) partes.push("Te faltaron: " + r.faltan.join(", ") + ".");
        if (r.cambiadas.length) partes.push("Pieza equivocada en: " + r.cambiadas.join(", ") + ".");
        if (r.sobran.length) partes.push("Pusiste de más en: " + r.sobran.join(", ") + ".");
        partes.push("En el tablero: ✓ bien, − faltaba, ✗ otra pieza, + sobraba.");
        explicar(partes);
        terminar(item, n);
      }));
    }
  };

  /* ---------- 7. Con lo justo ---------- */
  JUEGOS["con-lo-justo"] = function (item) {
    const juego = new Chess(item.fen);
    let jugadas = 0, hecho = false, ocupado = false;
    const mejor = leer(CLAVE_MEJOR)[item.id];
    $("juego-turno").textContent = "Juegan las blancas. Contra la mejor defensa: mate en " + item.minimo + (mejor ? " · tu mejor: " + mejor : "") + ".";
    $("juego-enunciado").textContent = "Da mate antes de las 50 jugadas.";
    const cuenta = el("p", "text-sm text-brand-600 dark:text-brand-300", "Jugadas: 0");
    $("controles").appendChild(cuenta);
    const redibujar = (ultima) => tablero(juego.fen(), { orientacion: "w", clic: hecho || ocupado ? null : moverConClic(juego, jugar), juego, ultima });
    function fin(texto, estrellas) {
      hecho = true;
      pedirJugada("", null);
      redibujar(tab.ultima);
      estado(texto + (estrellas ? " " + textoEstrellas(estrellas) : ""));
      if (estrellas) { anotarMejor(item.id, jugadas); terminar(item, estrellas); }
    }
    function jugar(mov) {
      if (hecho || ocupado) return;
      const m = juego.move(mov);
      if (!m) { estado("Esa jugada no es legal."); return; }
      jugadas++;
      cuenta.textContent = "Jugadas: " + jugadas;
      tab.ultima = [m.from, m.to];
      if (juego.in_checkmate()) return fin("✓ ¡Jaque mate en " + jugadas + "! Contra la mejor defensa hacen falta " + item.minimo + ".", R.estrellasFinal(jugadas, item.minimo));
      if (juego.in_stalemate()) return fin("✗ Ahogado: el rey negro no tiene jugadas y no está en jaque. Son tablas. Prueba otra vez.", 0);
      ocupado = true;
      redibujar([m.from, m.to]);
      setTimeout(() => {
        ocupado = false;
        const d = R.defensaRey(Chess, juego.fen());
        const r = juego.move(d);
        estado("El rey negro juega " + R.sanEs(r.san) + ".");
        if (r.captured) return fin("✗ El rey se comió una pieza que estaba sola: ya no hay mate posible. Prueba otra vez.", 0);
        if (jugadas >= 50) return fin("✗ Pasaron 50 jugadas sin mate: son tablas. Prueba otra vez.", 0);
        redibujar([r.from, r.to]);
      }, 350);
    }
    redibujar(null);
    pedirJugada("O escribe tu jugada", (txt) => {
      const m = jugadaEscrita(juego, txt);
      if (!m) { estado("No entendí «" + txt + "» como una jugada de las blancas."); return; }
      $("jugada-input").value = "";
      jugar({ from: m.from, to: m.to, promotion: m.promotion });
    });
  };

  /* ------------------------------------------------------------ el # manda */
  function rutear() {
    const h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    const [tipo, nivel, item] = h.split("/");
    if (tipo && C.tipo(tipo) && nivel && C.nivel(tipo, nivel)) {
      mostrar("vista-juego");
      // Algunos tipos cargan algo aparte antes de jugar (las partidas del
      // maestro, detrás del candado de los cursos; la tabla de rey y peón).
      const prep = PREPARAR[tipo] ? PREPARAR[tipo]() : Promise.resolve();
      $("controles").innerHTML = "";
      $("juego-enunciado").textContent = "";
      prep.then(() => abrirJuego(tipo, nivel, item), (e) => {
        console.error(e);
        $("titulo-juego").textContent = C.tipo(tipo).nombre;
        $("juego-desc").textContent = "";
        estado(e && e.mensaje ? e.mensaje : "No se pudo cargar este tipo de entrenamiento. Intenta recargar la página.");
      });
    } else if (tipo && C.tipo(tipo)) {
      if (limpiarJuego) { limpiarJuego(); limpiarJuego = null; }
      mostrar("vista-tipo");
      pintarTipo(tipo);
    } else {
      if (limpiarJuego) { limpiarJuego(); limpiarJuego = null; }
      mostrar("vista-fichas");
      pintarFichas();
    }
    window.scrollTo({ top: 0 });
  }
  window.addEventListener("hashchange", rutear);

  /* ------------------------------------------------------------ arranque */
  async function unlock() {
    $("gate").classList.add("hidden");
    $("app").classList.remove("hidden");
    // El avance vive en la cuenta: se baja ANTES de pintar.
    try { await ProgresoUsuario.init(); } catch (e) {}
    try {
      const r = await fetch("data/tipos.json");
      if (!r.ok) throw new Error("tipos.json: " + r.status);
      DATOS = await r.json();
    } catch (e) {
      console.error(e);
      $("main-content").innerHTML = '<p class="text-center text-brand-500 dark:text-brand-300 py-10">No se pudieron cargar los ejercicios. Intenta recargar la página.</p>';
      return;
    }
    rutear();
  }
  async function requireLoginThenGate() {
    let hay = false;
    try { const { data } = await sb.auth.getSession(); hay = !!(data && data.session); } catch (e) { hay = false; }
    if (!hay) {
      $("gate-checking").textContent = "Necesitas iniciar sesión para entrar a los Tipos de entrenamiento. Redirigiendo…";
      window.location.href = "../login.html?next=" + encodeURIComponent(NEXT_PATH);
      return;
    }
    unlock();
  }
  // Para los verificadores: qué posición está pintada ahora.
  window.TiposEntreno = { datos: () => DATOS, fen: () => tab.fen };
  /* Las piezas de la página que usan los juegos de js/entreno-tipos-mas.js
     (tipos 8 a 14): el mismo tablero, los mismos avisos, las mismas estrellas. */
  window.TiposUI = {
    JUEGOS, PREPARAR, $, el, boton, estado, explicar, textoEstrellas, terminar,
    tablero, pintar, tab: () => tab, tableroFijo, leerPosicion, adaptado,
    pedirJugada, jugadaEscrita, moverConClic, COLOR, BTN_PRIMARIO, BTN_SEGUNDO,
    datos: () => DATOS, ponerDatos: (k, v) => { DATOS[k] = v; }, alLimpiar: (fn) => { limpiarJuego = fn; },
  };
  requireLoginThenGate();
})();
