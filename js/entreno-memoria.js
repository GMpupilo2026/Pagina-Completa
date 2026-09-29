/* El código de entreno/memoria.html: la ficha de Memoria.
 *
 * Eliges cuántas piezas y cuántos segundos. Ves una posición de una partida
 * real ese rato, desaparece y la reconstruyes (tocando casillas o
 * escribiéndola). Es Fotografía (Tipos de entrenamiento) sin niveles fijos: tú
 * pones la dificultad, y con «Una pieza más» la vas subiendo de a poco.
 *
 * Las posiciones: entreno/data/memoria.json, que arma
 * herramientas/memoria-generar.js del banco de Lichess. No se inventa
 * ninguna. La corrección es la misma de Fotografía (TiposReglas.compararFoto,
 * leerPiezas y estrellasFoto), y el tablero, el común de Entrenamiento
 * (js/ejercicio-tablero.js).
 *
 * `memoria.html?piezas=8&segundos=10` arranca directo con eso: así el
 * profesor manda un enlace con la dificultad ya puesta.
 *
 * El récord vive en la cuenta (js/progreso-usuario.js): "memoria_mejor_v1"
 * guarda, por segundos, la mayor cantidad de piezas reconstruida sin un error.
 * Ver «La ficha de Memoria» en docs/decisiones/entrenamiento.md.
 */
(function () {
  "use strict";

  const NEXT_PATH = "entreno/memoria.html";
  const $ = (id) => document.getElementById(id);
  const R = window.TiposReglas;
  const CLAVE_MEJOR = "memoria_mejor_v1";
  const SEGUNDOS = [3, 5, 8, 10, 15, 20, 30, 45, 60];
  const PALETA = ["wk", "wq", "wr", "wb", "wn", "wp", "bk", "bq", "br", "bb", "bn", "bp", "x"];

  let DATOS = null;
  let ajustes = { piezas: 8, segundos: 10 };
  let item = null;
  let reloj = null;
  const recientes = [];   // para no repetir la misma posición enseguida

  /* ------------------------------------------------------------ el récord */
  function leerMejor() {
    try { return JSON.parse(localStorage.getItem(CLAVE_MEJOR) || "{}") || {}; } catch (e) { return {}; }
  }
  function anotarMejor(segundos, piezas) {
    const o = leerMejor();
    if ((o[segundos] || 0) >= piezas) return false;
    o[segundos] = piezas;
    try { localStorage.setItem(CLAVE_MEJOR, JSON.stringify(o)); } catch (e) {}
    return true;
  }
  function pintarRecords() {
    const o = leerMejor();
    const ul = $("records");
    ul.innerHTML = "";
    const claves = Object.keys(o).map(Number).filter((s) => o[s] > 0).sort((a, b) => a - b);
    $("records-vacio").classList.toggle("hidden", claves.length > 0);
    claves.forEach((s) => {
      ul.appendChild(el("li", "", s + " segundos: " + o[s] + " piezas sin un error"));
    });
  }

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
  function explicar(partes) {
    const e = $("explicacion");
    e.innerHTML = "";
    if (!partes) { e.classList.add("hidden"); return; }
    partes.forEach((t) => e.appendChild(el("p", "mb-2", t)));
    e.classList.remove("hidden");
  }
  function textoEstrellas(n) { return "★".repeat(n) + "☆".repeat(Math.max(0, 3 - n)); }
  function adaptado() { return document.documentElement.classList.contains("adaptive-mode"); }
  function leerPosicion(fen) {
    const p = $("lectura");
    if (!fen) { p.classList.add("hidden"); p.textContent = ""; return; }
    p.textContent = window.BlindNotation ? BlindNotation.positionSentence(new Chess(fen)) : fen;
    p.classList.remove("hidden");
  }

  /* ------------------------------------------------------------ el tablero
     El común de Entrenamiento. Lo que muestra sale de `piezaEn`: la posición
     mientras se mira, lo colocado mientras se reconstruye (nunca la respuesta:
     el lector de pantalla lee lo mismo que se ve). */
  let piezaEn = () => null;
  let alTocar = null;
  let marcas = {};
  let teclado = null;
  function pintar() {
    const t = $("tablero");
    const juego = { get: (s) => piezaEn(s), turn: () => "w", moves: () => [] };
    const m = {};
    Object.keys(marcas).forEach((s) => { m[s] = { clase: marcas[s].clase, estado: marcas[s].dicho }; });
    EjercicioTablero.dibujar(t, { juego, orientacion: "w", marcas: m, alTocar });
    // El color de la corrección nunca va solo: cada casilla lleva su signo.
    Object.keys(marcas).forEach((s) => {
      const c = t.querySelector('[data-square="' + s + '"]');
      if (c) c.dataset.marca = marcas[s].signo;
    });
    if (!teclado && window.TableroAccesible) {
      teclado = TableroAccesible.montar(t, { nombre: "Tablero de la memoria", juego: () => juego });
    }
  }
  function desdeFen(fen) {
    const tab = R.tablero(fen);
    return (s) => { const p = tab[R.idx(s)]; return p ? { color: p.c, type: p.t } : null; };
  }

  /* ------------------------------------------------------------ las vistas */
  function mostrar(cual) {
    $("vista-ajustes").classList.toggle("hidden", cual !== "ajustes");
    $("vista-juego").classList.toggle("hidden", cual !== "juego");
  }
  function limpiar() {
    if (reloj) { clearInterval(reloj); reloj = null; }
    $("controles").innerHTML = "";
    $("acciones").innerHTML = "";
    explicar(null);
    marcas = {};
    alTocar = null;
  }
  function ponerUrl() {
    const u = new URL(location.href);
    u.searchParams.set("piezas", ajustes.piezas);
    u.searchParams.set("segundos", ajustes.segundos);
    history.replaceState(null, "", u.pathname + u.search);
  }
  function elegir() {
    const lista = DATOS.porPiezas[ajustes.piezas] || [];
    const libres = lista.filter((x) => recientes.indexOf(x.id) < 0);
    const de = libres.length ? libres : lista;
    const x = de[Math.floor(Math.random() * de.length)];
    recientes.push(x.id);
    if (recientes.length > Math.min(20, lista.length - 1)) recientes.shift();
    return x;
  }

  /* ------------------------------------------------------------ 1. mirar */
  function empezar() {
    limpiar();
    ponerUrl();
    mostrar("juego");
    item = elegir();
    $("juego-ajustes").textContent = ajustes.piezas + " piezas · " + ajustes.segundos + " segundos";
    piezaEn = desdeFen(item.fen);
    pintar();
    let quedan = ajustes.segundos;
    $("juego-enunciado").textContent = "Mírala bien: tienes " + ajustes.segundos + " segundos.";
    const cuenta = el("p", "text-3xl font-bold text-center text-brand-800 dark:text-white my-3 tabular-nums", String(quedan));
    cuenta.id = "cuenta";
    cuenta.setAttribute("aria-hidden", "true");
    $("controles").appendChild(cuenta);
    if (adaptado()) leerPosicion(item.fen);
    estado("Tienes " + ajustes.segundos + " segundos para memorizar la posición.");
    $("controles").appendChild(boton("Ya la tengo", BTN_PRIMARIO, ocultar));
    reloj = setInterval(() => {
      quedan--;
      cuenta.textContent = String(quedan);
      if (quedan <= 0) ocultar();
    }, 1000);
  }

  /* ------------------------------------------------------------ 2. reconstruir */
  function ocultar() {
    if (reloj) { clearInterval(reloj); reloj = null; }
    leerPosicion(null);   // leída mientras se reconstruye sería soplar
    $("controles").innerHTML = "";
    const colocado = {};
    let elegida = "wp";
    piezaEn = (s) => (colocado[s] ? { color: colocado[s][0], type: colocado[s][1] } : null);
    alTocar = (s) => {
      if (colocado[s] === elegida || elegida === "x") delete colocado[s];
      else colocado[s] = elegida;
      pintar();
      if (teclado) teclado.decir(s + ": " + (colocado[s] ? TableroAccesible.piezaDicha({ color: colocado[s][0], type: colocado[s][1] }) : "vacía"));
    };
    pintar();
    $("juego-enunciado").textContent = "Reconstrúyela: elige una pieza y toca las casillas.";

    const paleta = el("div", "mem-paleta flex flex-wrap gap-1 mb-3");
    paleta.setAttribute("role", "group");
    paleta.setAttribute("aria-label", "Pieza para colocar");
    const botones = PALETA.map((o) => {
      const b = el("button", "w-10 h-10 rounded-lg bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 text-2xl flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
      b.type = "button";
      b.dataset.pieza = o;
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
    const campos = [["w", "blancas"], ["b", "negras"]].map(([c, nombre]) => {
      const lab = el("label", "text-xs text-brand-600 dark:text-brand-300", "Piezas " + nombre + " (ej.: Rg1 Tf1 Dd1 Ce5 Ab2 a2 b3)");
      const inp = el("input", "bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500");
      inp.type = "text"; inp.id = "mem-" + c; inp.autocomplete = "off"; inp.spellcheck = false;
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
    const comprobar = boton("Comprobar", BTN_PRIMARIO, () => corregir(colocado));
    comprobar.id = "btn-comprobar";
    $("controles").appendChild(comprobar);
  }

  /* ------------------------------------------------------------ 3. corregir */
  function corregir(colocado) {
    $("controles").innerHTML = "";
    alTocar = null;
    const r = R.compararFoto(item.fen, colocado);
    const real = R.tablero(item.fen);
    marcas = {};
    for (let i = 0; i < 64; i++) {
      const s = R.sq(i);
      if (real[i] && colocado[s] === real[i].c + real[i].t) marcas[s] = { clase: "m-bien", signo: "✓", dicho: "bien" };
    }
    r.faltan.forEach((s) => { marcas[s] = { clase: "m-mal", signo: "−", dicho: "faltaba" }; });
    r.cambiadas.forEach((s) => { marcas[s] = { clase: "m-mal", signo: "✗", dicho: "otra pieza" }; });
    r.sobran.forEach((s) => { marcas[s] = { clase: "m-mal", signo: "+", dicho: "sobraba" }; });
    piezaEn = desdeFen(item.fen);
    pintar();
    const n = R.estrellasFoto(r.errores, r.total);
    const record = !r.errores && anotarMejor(ajustes.segundos, ajustes.piezas);
    // Cada posición reconstruida suma a la meta del día, la racha, los logros
    // y las tareas (training_progress). Sin puzzle_id: la posición se sortea,
    // así que cada ronda cuenta. `limpio` es sin un error.
    if (window.EntrenoProgress) EntrenoProgress.log("memoria", {
      piezas: ajustes.piezas, segundos: ajustes.segundos, aciertos: r.aciertos, total: r.total, estrellas: n, limpio: !r.errores,
    });
    $("juego-enunciado").textContent = r.errores ? "Así era la posición." : "¡Perfecta!";
    estado((r.errores ? "Acertaste " + r.aciertos + " de " + r.total + " piezas. " : "✓ ¡Perfecta! ") +
      (n ? textoEstrellas(n) : "Sin estrellas.") + (record ? " Nuevo récord con " + ajustes.segundos + " segundos." : ""));
    const partes = [];
    if (r.faltan.length) partes.push("Te faltaron: " + r.faltan.join(", ") + ".");
    if (r.cambiadas.length) partes.push("Pieza equivocada en: " + r.cambiadas.join(", ") + ".");
    if (r.sobran.length) partes.push("Pusiste de más en: " + r.sobran.join(", ") + ".");
    if (r.errores) partes.push("En el tablero: ✓ bien, − faltaba, ✗ otra pieza, + sobraba.");
    explicar(partes.length ? partes : null);
    if (item.partida && /^https:\/\/lichess\.org\//.test(item.partida)) {
      const p = el("p", "text-xs text-brand-500 dark:text-brand-300 mt-2");
      const a = el("a", "underline underline-offset-2 hover:text-accent-700 dark:hover:text-accent-400 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500", "Ver la partida de donde salió (Lichess, se abre en otra pestaña)");
      a.href = item.partida; a.target = "_blank"; a.rel = "noopener";
      p.appendChild(a);
      $("controles").appendChild(p);
    }
    const acc = $("acciones");
    acc.appendChild(boton("Otra posición", BTN_PRIMARIO, empezar));
    if (!r.errores && ajustes.piezas < DATOS.max) {
      acc.appendChild(boton("Una pieza más (" + (ajustes.piezas + 1) + ")", BTN_SEGUNDO, () => {
        ajustes.piezas++;
        $("sel-piezas").value = String(ajustes.piezas);
        empezar();
      }));
    }
    acc.appendChild(boton("Cambiar piezas o segundos", BTN_SEGUNDO, volverAjustes));
  }

  function volverAjustes() {
    limpiar();
    leerPosicion(null);
    pintarRecords();
    mostrar("ajustes");
    $("sel-piezas").focus();
  }

  /* ------------------------------------------------------------ arranque */
  function armarAjustes() {
    const sp = $("sel-piezas"), ss = $("sel-segundos");
    for (let n = DATOS.min; n <= DATOS.max; n++) sp.appendChild(new Option(n + " piezas", String(n)));
    SEGUNDOS.forEach((s) => ss.appendChild(new Option(s + " segundos", String(s))));
    const q = new URLSearchParams(location.search);
    const p = parseInt(q.get("piezas"), 10), s = parseInt(q.get("segundos"), 10);
    if (p >= DATOS.min && p <= DATOS.max) ajustes.piezas = p;
    if (SEGUNDOS.indexOf(s) >= 0) ajustes.segundos = s;
    sp.value = String(ajustes.piezas);
    ss.value = String(ajustes.segundos);
    $("form-ajustes").addEventListener("submit", (e) => {
      e.preventDefault();
      ajustes = { piezas: +sp.value, segundos: +ss.value };
      empezar();
    });
    $("btn-cambiar").addEventListener("click", volverAjustes);
    pintarRecords();
    // Con el enlace ya armado (?piezas=…&segundos=…), directo a mirar.
    if (q.has("piezas") || q.has("segundos")) empezar(); else mostrar("ajustes");
  }
  async function unlock() {
    $("gate").classList.add("hidden");
    $("app").classList.remove("hidden");
    // El récord vive en la cuenta: se baja ANTES de pintar.
    try { await ProgresoUsuario.init(); } catch (e) {}
    try {
      const r = await fetch("data/memoria.json");
      if (!r.ok) throw new Error("memoria.json: " + r.status);
      DATOS = await r.json();
    } catch (e) {
      console.error(e);
      $("main-content").innerHTML = '<p class="text-center text-brand-500 dark:text-brand-300 py-10">No se pudieron cargar las posiciones. Intenta recargar la página.</p>';
      return;
    }
    armarAjustes();
  }
  async function requireLoginThenGate() {
    let hay = false;
    try { const { data } = await sb.auth.getSession(); hay = !!(data && data.session); } catch (e) { hay = false; }
    if (!hay) {
      $("gate-checking").textContent = "Necesitas iniciar sesión para entrar a Memoria. Redirigiendo…";
      window.location.href = "../login.html?next=" + encodeURIComponent(NEXT_PATH);
      return;
    }
    unlock();
  }
  // Para los verificadores: qué posición se está jugando.
  window.MemoriaEntreno = { datos: () => DATOS, item: () => item, ajustes: () => ajustes };
  if (window.Coordenadas) Coordenadas.aplicar($("tablero"));
  requireLoginThenGate();
})();
