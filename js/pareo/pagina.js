/* ===== Pareo Integral — la página (pareo.html) =====
 *
 * Todo vive en el navegador de quien organiza: la lista de sus torneos y cada
 * torneo en localStorage, y la copia que baja (.json o TRF). Lo que sale a un
 * servidor se activa aparte, con su consentimiento: la publicación en línea
 * (js/pareo/publicar.js) y guardar los torneos en la cuenta (js/pareo/nube.js,
 * ver «Pareo Integral: los torneos en la cuenta» en
 * docs/decisiones/juegos-y-torneos.md).
 *
 * El torneo y el TRF: js/pareo/torneo.js. Los desempates: js/pareo/desempates.js.
 * El motor (bbpPairings en un Worker): js/pareo/motor.js. Los textos en español
 * y en inglés: js/pareo/textos.js. Lo escrito por la gente (nombres, el nombre
 * del torneo) entra siempre por textContent.
 *
 * Este archivo es el núcleo: lo guardado en el navegador, el estado, abrir y
 * crear torneos, las fichas, la lista de torneos y archivar, los torneos en la
 * cuenta, «Lo siguiente» y la portada, y las piezas que usan todas las demás
 * partes (el, $, C, tx, horaCR…). Se carga primero. El resto de la página está
 * en js/pareo/pagina-*.js, una parte por zona (ver «Pareo Integral: la página
 * partida por zonas» en docs/decisiones/juegos-y-torneos.md): lo de este
 * archivo que usan las otras va en window.PareoPagina, y lo de ellas se llama
 * acá como Pagina.<nombre>.
 */
(function () {
  "use strict";

  window.PareoPagina = {};
  const Pagina = window.PareoPagina;

  const T = window.PareoTorneo;
  const D = window.PareoDesempates;
  const G = window.PareoGrupos;
  const E = window.PareoEquipos;
  const V = window.PareoEvento;
  const X = window.PareoTextos;
  const H = window.PareoHistorial;
  const motor = window.PareoMotor.enNavegador("js/pareo/motor-worker.js");

  const CLAVE_LISTA = "pareo_lista_v1";
  const CLAVE_IDIOMA = "pareo_idioma_v1";
  const CLAVE_FICHA = "pareo_ficha_v1";
  const PREFIJO = "pareo_torneo_v1_";
  const CLAVE_MODO_JDE = "pareo_modo_jde_v1";

  const C = {
    campo: "w-full rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 text-brand-800 dark:text-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
    campoChico: "rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 text-brand-800 dark:text-white px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
    boton: "bg-brand-800 hover:bg-brand-900 dark:bg-brand-700 dark:hover:bg-brand-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50 disabled:cursor-not-allowed",
    botonSec: "inline-block border border-brand-300 dark:border-brand-600 text-brand-800 dark:text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-brand-50 dark:hover:bg-brand-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
    mini: "border border-brand-300 dark:border-brand-600 text-brand-800 dark:text-white px-2 py-1 rounded-md text-xs font-semibold hover:bg-brand-50 dark:hover:bg-brand-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-40 disabled:cursor-not-allowed",
    miniPeligro: "border border-red-700 text-red-700 dark:border-red-400 dark:text-red-300 px-2 py-1 rounded-md text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
    nota: "text-sm text-brand-600 dark:text-brand-300",
    // Las pestañas pegadas al panel, como las de un programa: el color de la
    // abierta lo pone [aria-selected] en css/styles.css («Pareo Integral como
    // programa de computadora»).
    ficha: "pi-ficha text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
    rondaBoton: "pi-ronda-boton text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
  };

  // ---------- Lo guardado en el navegador (puede no estar: modo privado) ----------
  function leer(clave) { try { return localStorage.getItem(clave); } catch (e) { return null; } }
  function escribir(clave, v) {
    try { localStorage.setItem(clave, v); } catch (e) { return false; }
    avisarNube(clave, true);
    return true;
  }
  function quitar(clave) { try { localStorage.removeItem(clave); } catch (e) { /* nada */ } avisarNube(clave, false); }
  // Cada torneo que se escribe o se quita, a la cuenta si se guarda ahí
  // (js/pareo/nube.js; ver «Pareo Integral: los torneos en la cuenta»). Todo
  // lo que toca un torneo pasa por escribir() o quitar(): por eso el aviso va
  // acá y no en cada lugar que guarda.
  function avisarNube(clave, puesto) {
    if (!window.PareoNube || !clave.startsWith(PREFIJO)) return;
    const id = clave.slice(PREFIJO.length);
    if (puesto) window.PareoNube.cambio(id); else window.PareoNube.borrado(id);
  }
  function leerJSON(clave, defecto) { try { const v = JSON.parse(leer(clave)); return v == null ? defecto : v; } catch (e) { return defecto; } }

  const $ = (id) => document.getElementById(id);
  function el(tag, attrs, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "texto") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const h of hijos.flat()) if (h != null) n.append(h.nodeType ? h : document.createTextNode(String(h)));
    return n;
  }

  let idioma = leer(CLAVE_IDIOMA) === "en" ? "en" : "es";
  const tx = (clave, vars) => X.t(idioma, clave, vars);

  const estado = { lista: leerJSON(CLAVE_LISTA, []), id: null, t: null, ficha: leer(CLAVE_FICHA) || "jugadores", ronda: null, filtroInstitucion: "", filtroJugador: "", eloPendientes: [], enVivo: false, canalVivo: null, sugerencia: null, eventoVivo: null, adjuntos: null, capitanes: null, camaras: null, verCapitanes: false, marcados: new Set(),
    // El historial de cambios de cada torneo (solo en esta pestaña) y lo que
    // se guardó la última vez, para saber qué cambió y para notar si otra
    // pestaña lo cambió por debajo.
    historial: new Map(), ultimoGuardado: null, deshaciendo: false, respaldoArchivo: null };

  // Al cambiar de torneo: cortar el canal del que se sale, para no seguir
  // mandando SU estado por la conexión que había quedado abierta.
  function apagarEnVivo() {
    Pagina.desactivarEnVivo();
    const caja = $("pi-ver-compartir");
    if (caja) caja.hidden = true;
    const chk = $("pi-ver-en-vivo");
    if (chk) chk.checked = false;
  }

  function nuevoCodigoVivo() {
    const letras = "abcdefghjkmnpqrstuvwxyz23456789"; // sin 0/1/i/l/o: se puede leer a mano si hace falta
    let s = "";
    for (let i = 0; i < 8; i++) s += letras[Math.floor(Math.random() * letras.length)];
    return s;
  }

  // Sin tildes y en minúsculas, para que buscar "Jose" encuentre "José".
  function normalizarBusqueda(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

  function nuevoId() { return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function idJugador() { return "j" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function guardar() {
    if (!estado.t) return;
    if (!estado.deshaciendo) Pagina.avisarRetiros(estado.t, Pagina.retirosAuto(estado.t));
    Pagina.pedirAlmacenamientoFijo();
    V.marcarTiempos(estado.t, Date.now());
    const texto = JSON.stringify(estado.t);
    if (estado.ultimoGuardado && estado.ultimoGuardado !== texto && !estado.deshaciendo) {
      const lista = estado.historial.get(estado.id) || [];
      const cambios = H.describir(JSON.parse(estado.ultimoGuardado), estado.t);
      if (cambios.length) {
        lista.push({ hora: Date.now(), antes: estado.ultimoGuardado, cambios });
        if (lista.length > TOPE_HISTORIAL) lista.shift();
        estado.historial.set(estado.id, lista);
      }
    }
    estado.ultimoGuardado = texto;
    if (!escribir(PREFIJO + estado.id, texto)) {
      Avisos.avisar(tx("noGuarda"), { tipo: "error" });
    } else estado.guardadoEn = Date.now();
    pintarEstado();
    actualizarProyector();
    const item = estado.lista.find((x) => x.id === estado.id);
    const nombre = estado.t.nombre || "";
    // El evento va también en la lista, para separar los torneos de cada uno.
    const ev = estado.t.evento ? { id: estado.t.evento.id, nombre: estado.t.evento.nombre || "" } : null;
    if (item) { item.nombre = nombre; item.actualizado = Date.now(); item.evento = ev; }
    else estado.lista.push({ id: estado.id, nombre, actualizado: Date.now(), evento: ev });
    escribir(CLAVE_LISTA, JSON.stringify(estado.lista));
    escribir("pareo_abierto_v1", estado.id);
    if (estado.enVivo) Pagina.difundirEnVivo();
    if (estado.eventoVivo && estado.t.evento && estado.t.evento.id === estado.eventoVivo.id) Pagina.difundirEvento();
    if (estado.adjuntos && estado.adjuntos.idTorneo === estado.id) Pagina.enviarAdjuntos();
    if (estado.capitanes && estado.capitanes.idTorneo === estado.id) for (const c of estado.capitanes.canales.keys()) Pagina.enviarCapitan(c);
    if (estado.respaldoArchivo && estado.t.evento && estado.t.evento.id === estado.respaldoArchivo.id) Pagina.programarRespaldo();
    avisarRondaCompleta();
    if (estado.t.publicado) Pagina.programarPublicacion();
    else if (estado.t.rondas.length) Pagina.publicarSolo(estado.id);
  }
  const TOPE_HISTORIAL = 40;

  // «Ronda lista para emparejar»: al anotarse la última mesa de una ronda
  // (y si quedan rondas), un aviso que se queda un rato y, si se pidió, un
  // sonido. Una vez por ronda y torneo. En la lista de torneos, los que
  // están listos lo dicen junto al nombre (listaParaEmparejar).
  const CLAVE_SONIDO = "pareo_sonido_ronda_v1";
  const avisadas = new Set();
  function listaParaEmparejar(y) {
    const n = y.rondas.length;
    return n > 0 && T.rondaCompleta(y.rondas[n - 1]) && n < V.totalRondas(y) ? n + 1 : 0;
  }
  function avisarRondaCompleta() {
    const v = t();
    const sigue = listaParaEmparejar(v);
    const clave = estado.id + "|" + v.rondas.length;
    if (!sigue) { if (avisadas.delete(clave)) pintarLista(); return; }
    if (avisadas.has(clave)) return;
    avisadas.add(clave);
    pintarLista();
    Avisos.avisar(tx("rondaListaEmparejar", { r: sigue - 1, s: sigue, t: v.nombre || tx("sinNombre") }), { duracion: 20000 });
    if (leer(CLAVE_SONIDO) === "1") sonar();
  }
  // Dos notas cortas, con el audio del navegador (nada que bajar).
  function sonar() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [[880, 0], [1320, 0.18]].forEach(([f, cuando]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + cuando);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + cuando + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + cuando + 0.16);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + cuando);
        o.stop(ctx.currentTime + cuando + 0.17);
      });
      setTimeout(() => ctx.close(), 600);
    } catch (e) { /* sin audio */ }
  }

  function abrir(id) {
    const t = leerJSON(PREFIJO + id, null);
    if (!t) return false;
    apagarEnVivo();
    estado.id = id;
    estado.t = T.nuevo(t);
    estado.ultimoGuardado = JSON.stringify(estado.t);
    estado.ronda = null;
    estado.filtroInstitucion = "";
    estado.filtroJugador = "";
    estado.eloPendientes = [];
    estado.marcados = new Set();
    estado.sugerencia = null;
    escribir("pareo_abierto_v1", id);
    // Lo que los adjuntos dejaron guardado mientras esta pestaña estaba
    // cerrada se lee apenas se abre el torneo, en cualquier ficha. También
    // sin adjuntos propios: los árbitros de la Mesa del árbitro (un evento
    // con este torneo vinculado) dejan lo suyo en la misma cola.
    if (estado.t.publicado) setTimeout(() => { if (estado.id === id) Pagina.conectarAdjuntos(); }, 0);
    return true;
  }

  function crear(t) {
    apagarEnVivo();
    estado.id = nuevoId();
    estado.t = t || T.nuevo({ fechaInicio: window.HoraCR ? HoraCR.hoy() : "" });
    estado.ultimoGuardado = null;
    estado.ronda = null;
    estado.filtroInstitucion = "";
    estado.filtroJugador = "";
    estado.eloPendientes = [];
    estado.marcados = new Set();
    estado.sugerencia = null;
    guardar();
  }

  // ---------- Lo que se deriva del torneo ----------
  const t = () => estado.t;
  const jugador = (id) => t().jugadores.find((j) => j.id === id);
  const nombreDe = (id) => (jugador(id) || {}).nombre || "?";
  function rondasCompletas() {
    let k = 0;
    while (k < t().rondas.length && T.rondaCompleta(t().rondas[k])) k++;
    return k;
  }
  function totalRondas() { return T.rondasDelTorneo(t()); }
  function hasta(k) { return Object.assign({}, t(), { rondas: t().rondas.slice(0, k) }); }
  function formatoNum(x) {
    if (x == null || Number.isNaN(x)) return "";
    return Number(x).toLocaleString(idioma === "en" ? "en-US" : "es-CR", { maximumFractionDigits: 2 });
  }
  const puntosTexto = (x) => formatoNum(x).replace(/[.,]5$/, "½").replace(/^0½$/, "½");
  function nombreArchivo(ext) {
    const base = (t().nombre || "torneo").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "torneo";
    return base + ext;
  }
  function bajar(nombre, texto, tipo) {
    const url = URL.createObjectURL(new Blob([texto], { type: tipo || "text/plain;charset=utf-8" }));
    const a = el("a", { href: url, download: nombre });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------- Textos fijos y fichas ----------
  function pintarTextos() {
    document.documentElement.lang = idioma;
    document.querySelectorAll("[data-t]").forEach((n) => { n.textContent = tx(n.dataset.t); });
    document.querySelectorAll("[data-t-aria]").forEach((n) => n.setAttribute("aria-label", tx(n.dataset.tAria)));
    const b = $("pi-idioma");
    b.textContent = idioma === "es" ? "English" : "Español";
    b.setAttribute("lang", idioma === "es" ? "en" : "es");
    document.title = tx("tituloPagina");
  }

  // La Portada y Herramientas (el comprobador, el generador y los créditos)
  // son partes nuevas: ver «Pareo Integral con el aspecto del panel de la
  // Academia» en docs/decisiones/juegos-y-torneos.md.
  const FICHAS = ["inicio", "torneo", "jugadores", "rondas", "centro", "clasificacion", "cruzada", "archivos", "herramientas"];
  function pintarFichas() {
    // Con «Solo lo de los JDE», Herramientas no se ve: si estaba abierta, se va a Archivos.
    if (estado.ficha === "herramientas" && document.body.classList.contains("pi-modo-jde")) estado.ficha = "archivos";
    if (!FICHAS.includes(estado.ficha)) estado.ficha = "jugadores";
    for (const f of FICHAS) {
      const b = $("pi-f-" + f);
      const si = f === estado.ficha;
      b.className = C.ficha + (f === "herramientas" ? " pi-no-jde" : "");
      b.setAttribute("aria-selected", si ? "true" : "false");
      b.tabIndex = si ? 0 : -1;
      $("pi-p-" + f).hidden = !si;
    }
  }
  function irA(f, foco) {
    estado.ficha = f;
    escribir(CLAVE_FICHA, f);
    pintarFichas();
    pintarPanel();
    if (foco) $("pi-f-" + f).focus();
  }

  // Los torneos guardados, agrupados por evento (y los sueltos aparte), y
  // el filtro de evento cuando hay más de uno guardado en el navegador.
  const CLAVE_FILTRO_EVENTO = "pareo_filtro_evento_v1";
  function eventoDeItem(x) {
    if (x.evento === undefined) {
      const y = x.id === estado.id ? t() : leerJSON(PREFIJO + x.id, null);
      x.evento = y && y.evento ? { id: y.evento.id, nombre: y.evento.nombre || "" } : null;
    }
    return x.evento;
  }
  // «Archivar torneos»: los que ya no hacen falta a la vista se bajan en un
  // archivo (el mismo formato del respaldo de un evento, que se vuelve a
  // abrir con «Abrir un TRF o una copia .json») y se quitan de la lista.
  // Primero se baja y después se quita: nunca al revés.
  const archivar = { marcados: new Set() };
  function estadoParaArchivar(x) {
    const y = x.id === estado.id ? t() : leerJSON(PREFIJO + x.id, null);
    if (!y) return { y: null, texto: "" };
    if (V.terminado(y)) return { y, terminado: true, texto: tx("archivarTerminado") };
    if (!y.rondas.length) return { y, texto: tx("archivarSinEmpezar") };
    return { y, texto: tx("archivarRondas", { k: V.rondasCompletas(y), n: V.totalRondas(y) }) };
  }
  function pintarArchivar() {
    const caja = $("pi-archivar-caja");
    if (caja.hidden) return;
    const lista = estado.lista.slice().sort((a, b) => b.actualizado - a.actualizado);
    const info = new Map(lista.map((x) => [x.id, estadoParaArchivar(x)]));
    for (const id of [...archivar.marcados]) if (!info.has(id)) archivar.marcados.delete(id);
    const grupos = new Map();
    for (const x of lista) {
      const e = eventoDeItem(x);
      const k = e ? e.id : "";
      if (!grupos.has(k)) grupos.set(k, { nombre: e ? e.nombre || tx("sinNombre") : tx("filtroSueltos"), xs: [] });
      grupos.get(k).xs.push(x);
    }
    const hacer = el("button", { type: "button", id: "pi-archivar-hacer", class: C.boton }, tx("archivarHacer", { n: archivar.marcados.size }));
    hacer.disabled = !archivar.marcados.size;
    const alMarcar = () => { hacer.textContent = tx("archivarHacer", { n: archivar.marcados.size }); hacer.disabled = !archivar.marcados.size; };
    const casillas = [];
    const campos = [...grupos].map(([k, g]) => {
      const todoEv = el("button", { type: "button", class: C.mini, "data-archivar-evento": k }, tx("archivarEvento"));
      todoEv.addEventListener("click", () => { for (const x of g.xs) archivar.marcados.add(x.id); pintarArchivar(); });
      return el("fieldset", { class: "mt-3" },
        el("legend", { class: "font-semibold text-sm" }, g.nombre),
        k ? el("div", { class: "mt-1" }, todoEv) : null,
        el("ul", { class: "mt-1 space-y-1" }, g.xs.map((x) => {
          const i = info.get(x.id);
          const c = el("input", { type: "checkbox", id: "pi-archivar-" + x.id, value: x.id, "data-terminado": i.terminado ? "1" : "" });
          c.checked = archivar.marcados.has(x.id);
          c.addEventListener("change", () => { if (c.checked) archivar.marcados.add(x.id); else archivar.marcados.delete(x.id); alMarcar(); });
          casillas.push(c);
          return el("li", {}, el("label", { for: c.id, class: "flex items-start gap-2 text-sm" }, c,
            el("span", {}, x.nombre || tx("sinNombre"), el("span", { class: C.nota, texto: " · " + [i.texto, x.id === estado.id ? tx("archivarAbierto") : ""].filter(Boolean).join(" · ") }))));
        })));
    });
    const terminados = el("button", { type: "button", id: "pi-archivar-terminados", class: C.mini }, tx("archivarTerminados"));
    terminados.addEventListener("click", () => { for (const [id, i] of info) if (i.terminado) archivar.marcados.add(id); pintarArchivar(); });
    const ninguno = el("button", { type: "button", class: C.mini }, tx("archivarNinguno"));
    ninguno.addEventListener("click", () => { archivar.marcados.clear(); pintarArchivar(); });
    hacer.addEventListener("click", () => archivarMarcados(info));
    // Lo que ya se archivó en este navegador (solo nombres y fechas).
    const hechos = leerJSON(CLAVE_ARCHIVADOS, []);
    let historial = null;
    if (Array.isArray(hechos) && hechos.length) {
      const olvidar = el("button", { type: "button", id: "pi-archivados-olvidar", class: C.mini }, tx("archivadosOlvidar"));
      olvidar.addEventListener("click", () => { quitar(CLAVE_ARCHIVADOS); pintarArchivar(); });
      historial = el("div", { id: "pi-archivados", class: "mt-6 border-t border-brand-200 dark:border-brand-700 pt-3" },
        el("h3", { class: "font-semibold text-sm", texto: tx("archivadosTitulo") }),
        el("ul", { class: "mt-1 space-y-2 text-sm" }, hechos.map((x) => el("li", {},
          el("span", { class: "font-mono break-all", texto: String(x.archivo || "") }),
          el("span", { class: C.nota, texto: " · " + (window.HoraCR ? HoraCR.dia(x.hora) + " " : "") + horaCR(x.hora) }),
          el("span", { class: "block", texto: (x.evento ? x.evento + ": " : "") + (x.torneos || []).join(", ") })))),
        el("div", { class: "mt-2" }, olvidar));
    }
    caja.replaceChildren(el("p", { class: C.nota, texto: tx("archivarTexto") }),
      el("div", { class: "mt-3 flex flex-wrap gap-2" }, terminados, ninguno), ...campos, el("div", { class: "mt-4" }, hacer), ...[historial].filter(Boolean));
  }
  async function archivarMarcados(info) {
    const ids = listaOrdenada().filter((x) => archivar.marcados.has(x.id)).map((x) => x.id);
    if (!ids.length) { Avisos.avisar(tx("archivarNada"), { tipo: "error" }); return; }
    const ok = await Avisos.confirmar(tx("archivarConfirmar", { n: ids.length }), { aceptar: tx("archivarSi"), peligro: true });
    if (!ok) return;
    const torneos = ids.map((id) => info.get(id).y).filter(Boolean);
    // Un solo evento: el archivo es su respaldo. Mezclados: un «evento» que
    // solo sirve de rótulo (al abrirlo, cada torneo trae el suyo).
    const eventos = new Set(torneos.map((y) => (y.evento ? y.evento.id : "")));
    const uno = eventos.size === 1 && torneos[0].evento ? torneos[0].evento : null;
    const ev = uno ? { id: uno.id, nombre: uno.nombre || "" } : { id: "archivo-" + Date.now(), nombre: tx("archivarNombre") };
    const archivo = window.PareoPDF.nombreArchivo((uno ? ev.nombre : "torneos") + " " + (window.HoraCR ? HoraCR.hoy() : ""), "archivados").replace(/\.pdf$/, ".json");
    bajar(archivo, JSON.stringify(V.respaldo(ev, torneos), null, 1), "application/json");
    quitarArchivados(ids, archivo, torneos.map((y) => y.nombre || ""), ev.nombre);
    Avisos.avisar(tx("archivarListo", { n: ids.length, a: archivo }));
  }
  // Quitar de la lista lo que ya quedó en un archivo, y anotar en cuál (la
  // lista de lo archivado: qué, cuándo y con qué nombre de archivo, para
  // saber cuál buscar mañana). Solo nombres y fechas: lo archivado no se
  // guarda en el navegador.
  const CLAVE_ARCHIVADOS = "pareo_archivados_v1";
  function quitarArchivados(ids, archivo, nombres, evento) {
    for (const id of ids) quitar(PREFIJO + id);
    estado.lista = estado.lista.filter((x) => !ids.includes(x.id));
    escribir(CLAVE_LISTA, JSON.stringify(estado.lista));
    const antes = leerJSON(CLAVE_ARCHIVADOS, []);
    escribir(CLAVE_ARCHIVADOS, JSON.stringify([{ archivo, hora: Date.now(), evento: evento || "", torneos: nombres }].concat(Array.isArray(antes) ? antes : []).slice(0, 50)));
    archivar.marcados.clear();
    if (ids.includes(estado.id)) {
      const otro = listaOrdenada()[0];
      if (!otro || !abrir(otro.id)) crear();
    }
    pintarTodo();
    pintarArchivar();
  }
  const listaOrdenada = () => estado.lista.slice().sort((a, b) => b.actualizado - a.actualizado);

  function pintarLista() {
    const s = $("pi-lista");
    s.replaceChildren();
    const lista = estado.lista.slice().sort((a, b) => b.actualizado - a.actualizado);
    const eventos = new Map();
    for (const x of lista) { const e = eventoDeItem(x); if (e && !eventos.has(e.id)) eventos.set(e.id, e.nombre); }
    // El filtro: «todos», un evento o los torneos sueltos.
    const f = $("pi-evento-filtro");
    let filtro = leer(CLAVE_FILTRO_EVENTO) || "";
    if (filtro && filtro !== "-" && !eventos.has(filtro)) filtro = "";
    f.replaceChildren(el("option", { value: "", texto: tx("filtroTodos") }),
      ...[...eventos].map(([id, nombre]) => el("option", { value: id, texto: nombre || tx("sinNombre") })),
      el("option", { value: "-", texto: tx("filtroSueltos") }));
    f.value = filtro;
    f.closest("label").hidden = eventos.size < 2;
    const pasa = (x) => {
      if (x.id === estado.id || !filtro) return true;
      const e = eventoDeItem(x);
      return filtro === "-" ? !e : !!e && e.id === filtro;
    };
    const grupos = new Map();
    for (const x of lista.filter(pasa)) {
      const e = eventoDeItem(x);
      const k = e ? e.id : "";
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(x);
    }
    for (const [k, xs] of grupos) {
      const opciones = xs.map((x) => {
        const y = x.id === estado.id ? t() : leerJSON(PREFIJO + x.id, null);
        const sigue = y ? listaParaEmparejar(y) : 0;
        return el("option", { value: x.id, texto: (x.nombre || tx("sinNombre")) + (sigue ? " — " + tx("listaParaEmparejar", { r: sigue }) : "") });
      });
      if (eventos.size) s.append(el("optgroup", { label: k ? eventos.get(k) || tx("sinNombre") : tx("filtroSueltos") }, opciones));
      else s.append(...opciones);
    }
    s.value = estado.id;
    pintarArchivar();
  }
  function cambiarFiltroEvento(valor) {
    escribir(CLAVE_FILTRO_EVENTO, valor);
    // Si el abierto no es del evento elegido, se abre el último de ese evento.
    const e = eventoDeItem(estado.lista.find((x) => x.id === estado.id) || {});
    const delFiltro = (x) => { const y = eventoDeItem(x); return valor === "-" ? !y : !!y && y.id === valor; };
    if (valor && !delFiltro({ id: estado.id, evento: e })) {
      const otro = estado.lista.filter(delFiltro).sort((a, b) => b.actualizado - a.actualizado)[0];
      if (otro && abrir(otro.id)) { pintarTodo(); Pagina.avisarPestanas(); return; }
    }
    pintarLista();
  }

  function pintarPanel() {
    ({ inicio: pintarInicio, torneo: Pagina.pintarTorneo, jugadores: Pagina.pintarJugadores, rondas: Pagina.pintarRondas, centro: Pagina.pintarCentro,
      clasificacion: Pagina.pintarClasificacion, cruzada: Pagina.pintarCruzada, archivos: Pagina.pintarEvento, herramientas: () => {} })[estado.ficha]();
    pintarSiguiente();
  }

  function pintarTodo() {
    pintarTextos();
    pintarLista();
    pintarFichas();
    pintarPanel();
    pintarEstado();
    if (window.PareoNube) window.PareoNube.pintar();
  }

  // ---------- Los torneos en la cuenta (js/pareo/nube.js) ----------
  // Lo que la nube escribe NO pasa por escribir()/quitar(): lo que llega de la
  // cuenta no se vuelve a subir.
  function itemDeLista(id, datos, actualizado) {
    const ev = datos.evento ? { id: datos.evento.id, nombre: datos.evento.nombre || "" } : null;
    const item = estado.lista.find((x) => x.id === id);
    if (item) Object.assign(item, { nombre: datos.nombre || "", actualizado, evento: ev });
    else estado.lista.push({ id, nombre: datos.nombre || "", actualizado, evento: ev });
  }
  function escribirSinNube(clave, v) { try { localStorage.setItem(clave, v); return true; } catch (e) { return false; } }
  const nubeLocal = {
    ids: () => estado.lista.map((x) => x.id),
    texto: (id) => leer(PREFIJO + id),
    poner(id, datos, info) {
      if (!escribirSinNube(PREFIJO + id, JSON.stringify(datos))) return;
      itemDeLista(id, datos, Number(info && info.actualizado) || Date.now());
      escribirSinNube(CLAVE_LISTA, JSON.stringify(estado.lista));
    },
    sacar(id) {
      try { localStorage.removeItem(PREFIJO + id); } catch (e) { /* nada */ }
      estado.lista = estado.lista.filter((x) => x.id !== id);
      escribirSinNube(CLAVE_LISTA, JSON.stringify(estado.lista));
    },
    // Lo de esta computadora cuando otra guardó el mismo torneo antes: queda
    // como un torneo aparte, con otro nombre (y sí se sube).
    copia(datos) {
      const id = nuevoId();
      datos.nombre = (datos.nombre || tx("sinNombre")) + " " + tx("nubeCopiaSufijo");
      if (!escribir(PREFIJO + id, JSON.stringify(datos))) return null;
      itemDeLista(id, datos, Date.now());
      escribir(CLAVE_LISTA, JSON.stringify(estado.lista));
      return id;
    },
  };
  const torneoVacio = (y) => !y || (!y.nombre && !(y.jugadores || []).length && !(y.rondas || []).length);
  function alTraerDeLaNube(c) {
    let cambiarAbierto = c.quitados.includes(estado.id);
    // El torneo vacío que esta computadora creó al abrir sobra cuando llegan
    // los de la cuenta.
    if (c.traidos.length && !c.traidos.includes(estado.id) && torneoVacio(estado.t)) {
      nubeLocal.sacar(estado.id);
      cambiarAbierto = true;
    }
    if (cambiarAbierto) {
      const otro = listaOrdenada()[0];
      if (!(otro && abrir(otro.id))) crear();
    } else if (c.traidos.includes(estado.id)) {
      // El abierto, con lo que trajo la cuenta, sin cortar lo que está
      // compartido en vivo (abrir() lo apagaría).
      const y = leerJSON(PREFIJO + estado.id, null);
      if (y) {
        estado.t = T.nuevo(y);
        estado.ultimoGuardado = JSON.stringify(estado.t);
        if (estado.ronda != null && estado.ronda >= estado.t.rondas.length) estado.ronda = null;
        if (estado.enVivo) Pagina.difundirEnVivo();
        Avisos.avisar(tx("nubeAbiertoNuevo", { t: estado.t.nombre || tx("sinNombre") }));
      }
    }
    pintarTodo();
    const traidos = c.traidos.filter((id) => id !== estado.id || cambiarAbierto).length;
    if (traidos) Avisos.avisar(tx("nubeTraidos", { n: traidos }));
    if (c.copias.length) Avisos.avisar(tx("nubeCopias", { n: c.copias.length }), { duracion: 20000 });
  }

  // La barra de estado de abajo, como la de un programa de computadora: el
  // torneo abierto, cuántos juegan, por qué ronda va y cuándo se guardó.
  function pintarEstado() {
    const barra = $("pi-barra-estado");
    if (!barra) return;
    const v = estado.t;
    if (!v) { barra.replaceChildren(); pintarResumen(); return; }
    const n = v.jugadores.length;
    const total = T.rondasDelTorneo(v);
    const r = v.rondas.length;
    const partes = [
      v.nombre || tx("estadoSinNombre"),
      n === 1 ? tx("estadoUnJugador") : tx("estadoJugadores", { n }),
      r ? tx("estadoRonda", { r, total: Math.max(total, r) }) : tx("estadoSinRondas"),
    ];
    if (estado.guardadoEn) partes.push(tx("estadoGuardado", { h: horaCR(estado.guardadoEn) }));
    barra.replaceChildren(...partes.map((texto) => el("span", { texto })));
    pintarResumen();
  }

  // ---------- «Lo siguiente», la portada y lo que dice cada parte ----------
  // Lo que toca hacer ahora con el torneo abierto, en una frase y con el botón
  // para hacerlo: arriba de cada parte (#pi-siguiente) y en grande en la
  // Portada. Ver «Pareo Integral con el aspecto del panel de la Academia» en
  // docs/decisiones/juegos-y-torneos.md.
  function mesasDe(R) {
    const conMesa = R.mesas.filter((m) => m.n);
    return { total: conMesa.length, faltan: conMesa.filter((m) => !T.rondaCompleta({ mesas: [m] })).length };
  }
  function irARonda(r, buscarPendiente) {
    estado.ronda = r;
    irA("rondas");
    const sel = buscarPendiente && [...document.querySelectorAll("#pi-ronda select[data-resultado]")].find((s) => !s.value && s.checkVisibility());
    if (sel) sel.focus();
    else $("pi-f-rondas").focus();
  }
  function primeroDeLaClasificacion(v) {
    const k = rondasCompletas();
    if (!k || !v.jugadores.length) return null;
    try {
      const f = E.clasificacion(hasta(k), v.sistema === "eliminacion" ? [] : v.desempates)[0];
      const j = f && jugador(f.id);
      return j ? { nombre: j.nombre, puntos: puntosTexto(f.puntos) } : null;
    } catch (e) { return null; }
  }
  function loSiguiente() {
    const v = estado.t;
    const n = v.jugadores.length;
    const hay = v.rondas.length;
    const total = totalRondas();
    if (!n) {
      return { titulo: tx("sigAgregarT"), detalle: tx("sigAgregarD"), ficha: "jugadores",
        botones: [
          { texto: tx("sigAgregarBoton"), hacer: () => { irA("jugadores"); $("pi-form-jugador").elements.nombre.focus(); } },
          { texto: tx("sigSubirBoton"), hacer: () => { irA("torneo"); $("pi-subir-lista").focus(); } },
        ] };
    }
    const ultima = hay ? v.rondas[hay - 1] : null;
    if (ultima && !T.rondaCompleta(ultima)) {
      const m = mesasDe(ultima);
      return { titulo: tx("sigResultadosT", { r: hay }), detalle: tx(m.faltan === 1 ? "sigResultadosD1" : "sigResultadosD", { k: m.faltan, m: m.total }), ficha: "rondas", ronda: hay - 1, alerta: true,
        botones: [
          { texto: tx("sigResultadosBoton"), hacer: () => irARonda(hay - 1, true) },
          { texto: tx("sigClasBoton"), hacer: () => irA("clasificacion") },
        ] };
    }
    if (hay < total) {
      return { titulo: tx("sigEmparejarT", { r: hay + 1 }), detalle: hay ? tx("sigEmparejarD", { p: hay }) : tx(n === 1 ? "sigEmparejar1D1" : "sigEmparejar1D", { n }), ficha: "rondas", ronda: hay,
        botones: [
          { texto: tx("sigEmparejarBoton", { r: hay + 1 }), hacer: () => irARonda(hay) },
          hay ? { texto: tx("sigClasBoton"), hacer: () => irA("clasificacion") } : { texto: tx("sigRevisarBoton"), hacer: () => irA("jugadores") },
        ] };
    }
    const primero = primeroDeLaClasificacion(v);
    return { titulo: tx("sigTerminadoT"), detalle: primero ? tx("sigTerminadoD", { j: primero.nombre, p: primero.puntos }) : tx("sigTerminadoD0"), ficha: "clasificacion",
      botones: [
        { texto: tx("sigClasBoton"), hacer: () => irA("clasificacion") },
        { texto: tx("bajarTrf"), hacer: () => irA("archivos") },
      ] };
  }
  // La tira de arriba de cada parte: lo siguiente y su botón (en la parte a la
  // que ya lleva el botón, sin botón). En la Portada no va: ahí está en grande.
  function pintarSiguiente() {
    const caja = $("pi-siguiente");
    if (!caja) return;
    const v = estado.t;
    if (!v || estado.ficha === "inicio") { caja.hidden = true; caja.replaceChildren(); return; }
    const s = loSiguiente();
    const aqui = s.ficha === estado.ficha && (s.ronda == null || s.ronda === estado.ronda);
    const b = s.botones[0];
    caja.className = "pi-siguiente no-imprimir" + (s.alerta ? " pi-siguiente-alerta" : "");
    caja.replaceChildren(...[
      el("span", { class: "pi-siguiente-etiqueta", texto: tx("sigEtiqueta") }),
      el("span", { class: "pi-siguiente-texto" }, el("b", { texto: s.titulo }), " ", s.detalle),
      aqui ? null : el("button", { type: "button", class: "pi-boton-rosa", onclick: b.hacer }, b.texto)].filter(Boolean));
    caja.hidden = false;
  }
  // Lo que dice cada parte en la barra lateral: cuántos juegan y cómo va la ronda.
  function pintarInsignias() {
    const v = estado.t;
    const poner = (f, texto, alerta) => {
      const s = document.querySelector("#pi-f-" + f + " .pi-insignia");
      if (!s) return;
      s.textContent = texto || "";
      s.classList.toggle("pi-insignia-alerta", !!alerta);
    };
    if (!v) { for (const f of FICHAS) poner(f, ""); return; }
    poner("jugadores", String(v.jugadores.length), !v.jugadores.length);
    const hay = v.rondas.length;
    const total = Math.max(totalRondas(), hay);
    const ultima = hay ? v.rondas[hay - 1] : null;
    const faltan = ultima && !T.rondaCompleta(ultima) ? mesasDe(ultima).faltan : 0;
    poner("rondas", hay ? tx("insRondas", { r: hay, t: total }) + (faltan ? " · " + tx("insFaltan", { k: faltan }) : "") : (v.jugadores.length ? tx("porEmparejar") : ""), !!faltan);
    poner("clasificacion", rondasCompletas() ? tx("insTras", { r: rondasCompletas() }) : "");
  }
  function pintarResumen() {
    pintarInsignias();
    pintarSiguiente();
    if (estado.ficha === "inicio") pintarInicio();
  }

  // La Portada: «Lo siguiente» en grande, seis tarjetas de color que llevan a
  // su parte (cada una con el dato escrito: el color nunca va solo) y «Lo que
  // viene», la lista de las rondas.
  // El color de la tarjeta de Resultados (el dato también va escrito).
  const COLOR_FALTA = "naranja", COLOR_LISTO = "verde";
  function pintarInicio() {
    const caja = $("pi-inicio");
    if (!caja) return;
    const v = estado.t;
    if (!v) { caja.replaceChildren(); return; }
    const s = loSiguiente();
    const n = v.jugadores.length;
    const hay = v.rondas.length;
    const total = Math.max(totalRondas(), hay);
    const sistema = { suizo: "sistemaSuizoCorto", todos: "sistemaTodosCorto", scheveningen: "sistemaSchevCorto", eliminacion: "sistemaElimCorto", keizer: "sistemaKeizerCorto" }[v.sistema];
    const chips = [
      sistema ? tx(sistema) : null,
      total ? tx(total === 1 ? "iniUnaRonda" : "iniRondas", { n: total }) : null,
      v.ritmo || null,
      v.fechaInicio ? fechaCorta(v.fechaInicio) : null,
      v.ciudad || null,
    ].filter(Boolean);
    const heroe = el("div", { class: "pi-heroe" },
      el("p", { class: "pi-heroe-nombre", texto: v.nombre || tx("estadoSinNombre") }),
      chips.length ? el("ul", { class: "pi-chips", "aria-label": tx("iniDatos") }, chips.map((c) => el("li", { texto: c }))) : null,
      el("p", { class: "pi-heroe-etiqueta", texto: tx("sigEtiqueta") }),
      el("h2", { texto: s.titulo }),
      el("p", { class: "pi-heroe-detalle", texto: s.detalle }),
      el("div", { class: "pi-heroe-botones" }, s.botones.map((b, i) =>
        el("button", { type: "button", class: i === 0 ? "pi-boton-rosa" : "pi-boton-blanco", onclick: b.hacer }, b.texto))));

    const ultima = hay ? v.rondas[hay - 1] : null;
    const m = ultima ? mesasDe(ultima) : null;
    const primero = primeroDeLaClasificacion(v);
    const sala = (color, icono, titulo, numero, detalle, hacer) => el("button", { type: "button", class: "pi-sala pi-sala-" + color, onclick: hacer },
      el("span", { class: "pi-sala-icono", "aria-hidden": "true", texto: icono }),
      el("span", { class: "pi-sala-titulo", texto: titulo }),
      el("span", { class: "pi-sala-numero", texto: numero }),
      el("span", { class: "pi-sala-detalle", texto: detalle }));
    const salas = el("div", { class: "pi-salas" },
      sala("azul", "👥", tx("fJugadores"), String(n), tx("iniJugadoresDet"), () => irA("jugadores")),
      sala("turquesa", "♟️", tx("iniRonda"), hay ? tx("insRondas", { r: hay, t: total }) : "—", hay ? tx("iniRondaDet") : tx("iniSinEmpezar"), () => irARonda(Math.max(0, hay - 1))),
      sala(m && m.faltan ? COLOR_FALTA : COLOR_LISTO, "✍️", tx("iniResultados"), !m ? "—" : m.faltan ? tx("insFaltan", { k: m.faltan }) : tx("iniCompletos"), m ? tx("iniResultadosDet", { r: hay }) : tx("iniSinEmpezar"), () => irARonda(Math.max(0, hay - 1), true)),
      sala("rojo", "🏆", tx("iniPrimero"), primero ? primero.nombre : "—", primero ? tx("iniPuntos", { p: primero.puntos }) : tx("iniSinResultados"), () => irA("clasificacion")),
      sala("morado", "📲", tx("iniVivo"), estado.enVivo ? tx("iniVivoSi") : tx("iniVivoNo"), tx("verDesdeElCelular"), () => irARonda(Math.max(0, hay - 1))),
      sala("pizarra", "📁", tx("fArchivos"), "TRF", tx("iniArchivosDet"), () => irA("archivos")));

    const items = [];
    const enJuego = ultima && !T.rondaCompleta(ultima);
    for (let r = 0; r < total; r++) {
      let texto, clase = null;
      if (r < hay) {
        const mr = mesasDe(v.rondas[r]);
        if (mr.faltan) { texto = tx("iniVieneJuego", { k: mr.faltan }); clase = "pi-viene-ahora"; }
        else texto = tx("iniVieneJugada");
      } else if (r === hay) { texto = tx("porEmparejar"); if (!enJuego) clase = "pi-viene-ahora"; }
      else texto = tx("iniVieneLuego");
      items.push(el("li", { class: clase }, el("span", { class: "pi-viene-que", texto: tx("rondaN", { r: r + 1 }) }), el("span", { class: "pi-viene-det", texto })));
    }
    // Las que ya se jugaron, salvo las dos últimas, se juntan en una línea.
    const jugadas = Math.max(0, Math.min(hay, total) - 2);
    const lista = jugadas > 1
      ? [el("li", {}, el("span", { class: "pi-viene-que", texto: tx("iniVieneAntes", { n: jugadas }) }), el("span", { class: "pi-viene-det", texto: tx("iniVieneJugadas") }))].concat(items.slice(jugadas))
      : items;
    lista.push(el("li", {}, el("span", { class: "pi-viene-que", texto: tx("iniVieneFin") }), el("span", { class: "pi-viene-det", texto: tx("iniVieneFinDet") })));
    const viene = el("section", { class: "pi-viene", "aria-labelledby": "pi-viene-titulo" },
      el("h2", { id: "pi-viene-titulo", texto: tx("iniViene") }), el("ol", {}, lista));

    caja.replaceChildren(el("div", { class: "pi-portada" }, el("div", { class: "pi-portada-principal" }, heroe, salas), viene));
  }
  function fechaCorta(iso) {
    const [a, mes, d] = String(iso).split("-").map(Number);
    if (!a || !mes || !d) return iso;
    // Un día de calendario: se arma a mediodía UTC y se muestra en hora de Costa Rica.
    return new Intl.DateTimeFormat(idioma === "en" ? "en-US" : "es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Costa_Rica" }).format(new Date(Date.UTC(a, mes - 1, d, 12)));
  }

  // ---------- La ronda y los resultados en el proyector (js/pareo/proyectar.js) ----------
  // El modelo ya trae todo escrito (nombres, puntos antes de la ronda y el
  // resultado corto): proyectar.js solo lo pinta. La ronda que se abrió;
  // si era la última, sigue a la última (al emparejar la siguiente, pasa sola).
  const proy = { ronda: null, seguirUltima: true };
  function modeloProyector() {
    const v = t();
    const hay = v.rondas.length;
    const r = proy.seguirUltima || proy.ronda == null || proy.ronda >= hay ? hay - 1 : proy.ronda;
    const k = rondasCompletas();
    const base = { torneo: v.grupo || v.nombre || tx("estadoSinNombre"), mesas: [], totalMesas: 0, faltan: 0,
      rondaTitulo: tx("fRondas"), clasTitulo: k ? tx("proyClasTras", { r: k }) : tx("fClasificacion"), clasificacion: [] };
    if (k && v.jugadores.length) {
      try {
        base.clasificacion = E.clasificacion(hasta(k), v.sistema === "eliminacion" ? [] : v.desempates).map((f) => {
          const j = jugador(f.id) || {};
          return { p: f.puesto, nombre: (j.nombre || "?") + (j.titulo ? " (" + j.titulo + ")" : ""), inst: j.institucion || "", pts: puntosTexto(f.puntos) };
        });
      } catch (e) { base.clasificacion = []; }
    }
    if (r < 0) return base;
    const R = v.rondas[r];
    const antes = (id) => puntosTexto(T.puntosHasta(v, id, r));
    const m = mesasDe(R);
    return Object.assign(base, {
      rondaTitulo: tx("proyRonda", { r: r + 1 }) + (v.sistema === "eliminacion" ? " · " + Pagina.nombreRondaElim(v, r) : ""),
      totalMesas: m.total, faltan: m.faltan,
      mesas: R.mesas.map((x, i) => ({ mesa: V.mesaFisica(v, i), r: x.r || null, rTexto: x.r ? tx("corto_" + x.r) : "",
        b: { nombre: nombreDe(x.b), pts: antes(x.b) }, n: x.n === null ? null : { nombre: nombreDe(x.n), pts: antes(x.n) } })),
    });
  }
  function textosProyector() {
    const claves = ["proyTitulo", "proyResultados", "proyCompleta", "proyEnJuego", "proyPagina", "proyCambiaSola", "proyPausado", "proyPausar", "proySeguir",
      "proyAnterior", "proySiguiente", "proyVerClas", "proyVerRonda", "proySalir", "proyClasSin", "proyAyuda"];
    const o = Object.fromEntries(claves.map((c) => [c, X.t(idioma, c)]));
    o.proyBye = tx("proyBye", { p: puntosTexto(t().puntos.bye) });
    return o;
  }
  function abrirProyector(vista, volver) {
    const v = t();
    proy.seguirUltima = estado.ronda == null || estado.ronda >= v.rondas.length - 1;
    proy.ronda = estado.ronda;
    PareoProyectar.abrir(modeloProyector(), { textos: textosProyector(), vista, volver });
  }
  function actualizarProyector() {
    if (window.PareoProyectar && PareoProyectar.abierto() && estado.t) PareoProyectar.actualizar(modeloProyector());
  }

  // Los menús de botones (<details class="pi-menu">): se cierran al elegir,
  // al tocar afuera y con Escape, y nunca queda más de uno abierto.
  function engancharMenus() {
    document.addEventListener("click", (e) => {
      const dentro = e.target.closest("details.pi-menu");
      for (const d of document.querySelectorAll("details.pi-menu[open]")) {
        if (d !== dentro) d.open = false;
        else if (e.target.closest(".pi-menu-lista button")) d.open = false;
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const abierto = document.querySelector("details.pi-menu[open]");
      if (!abierto) return;
      abierto.open = false;
      abierto.querySelector("summary").focus();
    });
  }
  // Un menú de botones; los que vienen nulos no se ponen, y sin ninguno no hay menú.
  function menuDeBotones(id, etiqueta, botones) {
    const lista = botones.filter(Boolean);
    if (!lista.length) return null;
    for (const b of lista) b.className = "pi-menu-item";
    return el("details", { id, class: "pi-menu no-imprimir" }, el("summary", { class: C.botonSec }, etiqueta), el("div", { class: "pi-menu-lista" }, lista));
  }

  // Si el torneo cambia el Elo de quien juega: lo dice la lista pública.
  const VALIDO_ELO = ["fide", "nacional", "no"];
  // La provincia: la lista pública agrupa y filtra por ella (si no se dice,
  // la base la deduce de la ciudad: public.pareo_provincia).
  const PROVINCIAS = ["San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón"];

  const horaCR = (ms) => (window.HoraCR ? HoraCR.hora(ms) : new Date(ms).toLocaleTimeString("es-CR", { hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica" }));

  Object.assign(Pagina, { T, G, E, V, X, motor, CLAVE_LISTA, CLAVE_IDIOMA, CLAVE_FICHA, PREFIJO,
    CLAVE_MODO_JDE, C, leer, escribir, quitar, leerJSON, $, el, tx, estado, apagarEnVivo, nuevoCodigoVivo,
    normalizarBusqueda, nuevoId, idJugador, guardar, CLAVE_SONIDO, sonar, abrir, crear, t, jugador, nombreDe,
    rondasCompletas, totalRondas, hasta, formatoNum, puntosTexto, nombreArchivo, bajar, FICHAS, irA,
    pintarArchivar, quitarArchivados, pintarLista, cambiarFiltroEvento, pintarTodo, nubeLocal,
    alTraerDeLaNube, engancharMenus, menuDeBotones, abrirProyector, actualizarProyector, VALIDO_ELO, PROVINCIAS, horaCR });
  Object.defineProperty(Pagina, "idioma", { get: () => idioma, set: (x) => { idioma = x; } });
})();

/*! rev bfb5bbb0d2d82f9f */
