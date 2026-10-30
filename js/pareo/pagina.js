/* ===== Pareo Integral — la página (pareo.html) =====
 *
 * Todo vive en el navegador de quien organiza: la lista de sus torneos y cada
 * torneo en localStorage, y la copia que baja (.json o TRF). Nada se manda a
 * ningún servidor, así que no hay cuenta ni consentimiento que pedir; el día
 * que se publique un torneo en línea, eso cambia (ver «Pareo Integral» en
 * docs/decisiones/juegos-y-torneos.md).
 *
 * El torneo y el TRF: js/pareo/torneo.js. Los desempates: js/pareo/desempates.js.
 * El motor (bbpPairings en un Worker): js/pareo/motor.js. Los textos en español
 * y en inglés: js/pareo/textos.js. Lo escrito por la gente (nombres, el nombre
 * del torneo) entra siempre por textContent.
 */
(function () {
  "use strict";

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
    fichaSi: "px-4 py-2 rounded-lg text-sm font-semibold border border-brand-200 dark:border-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 bg-accent-500 text-brand-900",
    fichaNo: "px-4 py-2 rounded-lg text-sm font-semibold border border-brand-200 dark:border-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 bg-white dark:bg-brand-900 text-brand-700 dark:text-brand-100",
  };

  // ---------- Lo guardado en el navegador (puede no estar: modo privado) ----------
  function leer(clave) { try { return localStorage.getItem(clave); } catch (e) { return null; } }
  function escribir(clave, v) { try { localStorage.setItem(clave, v); return true; } catch (e) { return false; } }
  function quitar(clave) { try { localStorage.removeItem(clave); } catch (e) { /* nada */ } }
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
    desactivarEnVivo();
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
    if (!estado.deshaciendo) avisarRetiros(estado.t, retirosAuto(estado.t));
    pedirAlmacenamientoFijo();
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
    }
    const item = estado.lista.find((x) => x.id === estado.id);
    const nombre = estado.t.nombre || "";
    // El evento va también en la lista, para separar los torneos de cada uno.
    const ev = estado.t.evento ? { id: estado.t.evento.id, nombre: estado.t.evento.nombre || "" } : null;
    if (item) { item.nombre = nombre; item.actualizado = Date.now(); item.evento = ev; }
    else estado.lista.push({ id: estado.id, nombre, actualizado: Date.now(), evento: ev });
    escribir(CLAVE_LISTA, JSON.stringify(estado.lista));
    escribir("pareo_abierto_v1", estado.id);
    if (estado.enVivo) difundirEnVivo();
    if (estado.eventoVivo && estado.t.evento && estado.t.evento.id === estado.eventoVivo.id) difundirEvento();
    if (estado.adjuntos && estado.adjuntos.idTorneo === estado.id) enviarAdjuntos();
    if (estado.capitanes && estado.capitanes.idTorneo === estado.id) for (const c of estado.capitanes.canales.keys()) enviarCapitan(c);
    if (estado.respaldoArchivo && estado.t.evento && estado.t.evento.id === estado.respaldoArchivo.id) programarRespaldo();
    avisarRondaCompleta();
    if (estado.t.publicado) programarPublicacion();
    else if (estado.t.rondas.length) publicarSolo(estado.id);
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

  const FICHAS = ["torneo", "jugadores", "rondas", "clasificacion", "cruzada", "archivos"];
  function pintarFichas() {
    for (const f of FICHAS) {
      const b = $("pi-f-" + f);
      const si = f === estado.ficha;
      b.className = si ? C.fichaSi : C.fichaNo;
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
      if (otro && abrir(otro.id)) { pintarTodo(); avisarPestanas(); return; }
    }
    pintarLista();
  }

  function pintarPanel() {
    ({ torneo: pintarTorneo, jugadores: pintarJugadores, rondas: pintarRondas,
      clasificacion: pintarClasificacion, cruzada: pintarCruzada, archivos: pintarEvento })[estado.ficha]();
  }

  function pintarTodo() {
    pintarTextos();
    pintarLista();
    pintarFichas();
    pintarPanel();
  }

  // Si el torneo cambia el Elo de quien juega: lo dice la lista pública.
  const VALIDO_ELO = ["fide", "nacional", "no"];
  // La provincia: la lista pública agrupa y filtra por ella (si no se dice,
  // la base la deduce de la ciudad: public.pareo_provincia).
  const PROVINCIAS = ["San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón"];

  // ---------- Torneo ----------
  function pintarTorneo() {
    const f = $("pi-form-torneo");
    const v = t();
    for (const k of ["nombre", "ciudad", "federacion", "fechaInicio", "fechaFin", "arbitro", "arbitroAdjunto", "ritmo", "rondasTotales", "colorInicial"]) {
      f.elements[k].value = v[k] == null ? "" : v[k];
    }
    f.elements.validoElo.value = VALIDO_ELO.includes(v.validoElo) ? v.validoElo : "";
    f.elements.provincia.value = PROVINCIAS.includes(v.provincia) ? v.provincia : "";
    // El nombre de un torneo de los JDE es el oficial del evento (etapa y
    // lugar, igual para todos): no se escribe a mano. Se corrige volviendo a
    // elegir la etapa con «Aplicar la configuración de los JDE».
    f.elements.nombre.readOnly = !!v.jde;
    $("pi-nombre-jde").hidden = !v.jde;
    f.elements.baku.checked = !!v.baku;
    f.elements.dobleVuelta.checked = !!v.dobleVuelta;
    for (const r of f.querySelectorAll('input[name="sistema"]')) {
      r.checked = r.value === v.sistema;
      r.disabled = v.rondas.length > 0;
    }
    $("pi-sistema-fijo").hidden = v.rondas.length === 0;
    $("pi-campo-rondas").hidden = T.fijo(v);
    $("pi-campo-baku").hidden = T.fijo(v);
    $("pi-campo-doble").hidden = !T.fijo(v);
    f.elements.dobleVuelta.disabled = v.rondas.length > 0;
    f.elements.colorInicial.disabled = v.rondas.length > 0;
    f.elements.baku.disabled = v.rondas.length > 0;
    for (const k of ["victoria", "tablas", "derrota", "bye"]) {
      f.elements["p_" + k].value = v.puntos[k];
      f.elements["p_" + k].disabled = v.rondas.length > 0;
    }
    f.elements.rondasTotales.min = Math.max(1, v.rondas.length);
    $("pi-config-jde-aplicar").disabled = v.rondas.length > 0;
    // Con la configuración de los JDE puesta, el ritmo, el sistema, los
    // puntos y los desempates quedan fijos: se cambian con un motivo, que va
    // al acta (V.cambiosDeConfiguracion).
    const fija = configFija(v);
    f.elements.ritmo.readOnly = fija;
    if (fija) {
      for (const r of f.querySelectorAll('input[name="sistema"]')) r.disabled = true;
      for (const k of ["victoria", "tablas", "derrota", "bye"]) f.elements["p_" + k].disabled = true;
    }
    pintarConfigFija(v);
    pintarVivoTorneo();
    pintarPlazoAlineacion(v);
    pintarDesempates();
    // La sugerencia de un torneo por grupo vive en esta ficha (junto a «Subir
    // la lista»): se vuelve a pintar con ella (el idioma, por ejemplo).
    pintarSugerencia();
  }

  // El enlace en vivo, también en la ficha Torneo (lo pidió el dueño del
  // sitio): el del evento si el torneo es de uno, si no el de este torneo.
  // Los mismos canales que en Archivos y en Rondas, no otros.
  function pintarVivoTorneo() {
    const v = t();
    const caja = $("pi-torneo-vivo");
    caja.replaceChildren();
    const qr = el("div", { id: "pi-tv-qr", class: "mt-3" });
    const ev = v.evento;
    const vivo = ev ? !!(estado.eventoVivo && estado.eventoVivo.id === ev.id) : !!estado.enVivo;
    const b = el("button", { type: "button", id: "pi-tv-boton", class: vivo ? C.botonSec : C.boton, "aria-pressed": vivo ? "true" : "false" },
      tx(vivo ? "eventoVivoApagar" : ev ? "eventoVivoPrender" : "vivoTorneoPrender"));
    b.addEventListener("click", async () => {
      if (ev) {
        if (vivo) apagarEventoVivo(); else if (!(await prenderEventoVivo(ev))) return;
      } else if (vivo) { $("pi-ver-en-vivo").checked = false; desactivarEnVivo(); }
      else { $("pi-ver-en-vivo").checked = true; if (!(await activarEnVivo())) return; }
      pintarVivoTorneo();
      $("pi-tv-boton").focus();
    });
    caja.append(el("h3", { class: "font-semibold", texto: tx(ev ? "eventoVivoTitulo" : "vivoTorneoTitulo") }),
      el("p", { class: C.nota + " mt-1", texto: tx(ev ? "eventoVivoTexto" : "vivoTorneoTexto") }), el("div", { class: "mt-2" }, b), qr);
    if (!vivo) return;
    if (ev) { mostrarQrEvento(qr, "pi-tv"); return; }
    const url = location.origin + location.pathname + "#vivo=" + v.liveCodigo;
    PareoQr.cargar().then(() => {
      const copiar = el("button", { type: "button", class: C.mini }, tx("copiarEnlace"));
      copiar.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(url); Avisos.avisar(tx("enlaceCopiado")); }
        catch (e) { Avisos.avisar(tx("noCopia"), { tipo: "error" }); }
      });
      qr.replaceChildren(el("div", { class: "w-48 bg-white p-2 rounded-lg" }, PareoQr.svg(url, tx("qrEtiqueta"))),
        el("p", { id: "pi-tv-url", class: "text-xs break-all mt-2 font-mono", texto: url }), el("div", { class: "mt-1" }, copiar));
    }).catch((e) => Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" }));
  }

  // En un torneo por equipos: cuántos minutos antes de la ronda pueden los
  // capitanes cambiar la alineación desde su celular (limiteAlineacion).
  function pintarPlazoAlineacion(v) {
    const caja = $("pi-plazo-alineacion");
    caja.replaceChildren();
    caja.hidden = !E.esDeEquipos(v);
    if (caja.hidden) return;
    const campo = el("input", { id: "pi-plazo-min", type: "number", min: "0", max: "180", step: "5", inputmode: "numeric", class: C.campo + " w-28", value: v.plazoAlineacion == null ? "" : String(v.plazoAlineacion) });
    campo.addEventListener("change", () => {
      const n = Math.round(Number(campo.value));
      if (campo.value === "") delete v.plazoAlineacion;
      else if (n >= 0 && n <= 180) v.plazoAlineacion = n;
      else { campo.value = v.plazoAlineacion == null ? "" : String(v.plazoAlineacion); return; }
      guardar();
      pintarPlazoAlineacion(v);
      $("pi-plazo-min").focus();
    });
    const limite = limiteAlineacion(v);
    caja.append(el("h3", { class: "font-semibold" }, tx("plazoTitulo")),
      el("label", { for: "pi-plazo-min", class: "flex flex-wrap items-center gap-2 text-sm mt-2" }, el("span", { texto: tx("plazoAntes") }), campo, el("span", { texto: tx("plazoMinutos") })),
      el("p", { class: C.nota + " mt-1", texto: tx("plazoAyuda") }),
      el("p", { id: "pi-plazo-estado", class: "text-sm font-semibold mt-1", role: "status",
        texto: v.plazoAlineacion == null ? tx("plazoSin") : limite ? tx("plazoHasta", { h: horaCR(limite), r: v.rondas.length }) : tx("plazoSinHora") }));
  }

  const configFija = (v) => !!v.jde && !v.configLibre;
  function pintarConfigFija(v) {
    const caja = $("pi-config-fija");
    caja.replaceChildren();
    caja.hidden = !v.jde;
    if (!v.jde) return;
    const fija = configFija(v);
    const b = el("button", { type: "button", id: "pi-config-cambiar", class: C.mini }, tx(fija ? "configCambiar" : "configFijar"));
    b.addEventListener("click", () => (fija ? cambiarConfigJde() : fijarConfigJde()));
    caja.append(el("p", { class: "text-sm" }, el("span", { class: "font-semibold", texto: tx(fija ? "configFijaTitulo" : "configLibreTitulo") + " " }), tx(fija ? "configFijaTexto" : "configLibreTexto")),
      el("div", { class: "mt-2" }, b));
  }
  async function cambiarConfigJde() {
    const v = t();
    const r = await Avisos.formulario({ titulo: tx("configCambiarTitulo"), texto: tx("configCambiarTexto"), aceptar: tx("configCambiarSi"), cancelar: tx("cancelar"),
      campos: [{ nombre: "motivo", etiqueta: tx("configMotivo"), max: 300 }] });
    if (!r || t() !== v) return;
    const motivo = String(r.motivo || "").trim();
    if (motivo.length < 3) { Avisos.avisar(tx("configMotivoFalta"), { tipo: "error" }); return; }
    v.cambiosConfig = (v.cambiosConfig || []).concat({ hora: Date.now(), motivo, antes: V.configuracionDe(v) });
    v.configLibre = true;
    guardar();
    pintarTorneo();
    Avisos.avisar(tx("configCambioAnotado"));
    $("pi-form-torneo").elements.ritmo.focus();
  }
  function fijarConfigJde() {
    delete t().configLibre;
    guardar();
    pintarTorneo();
    $("pi-config-cambiar").focus();
  }

  // «Aplicar la configuración de los JDE» al torneo abierto, antes de la
  // ronda 1: con rondas jugadas el sistema, los puntos y el color ya no se
  // cambian, así que el botón no hace nada (y lo dice).
  // La de un torneo individual o, en uno por equipos, con los puntos de
  // encuentro y los puntos de tablero como primer desempate. n es cuántos
  // juegan: jugadores o equipos, que es lo que se empareja.
  function configuracionPara(n, actual, deEquipos, etapa) {
    const c = G.configuracionJde(n, actual, etapa);
    if (deEquipos) { c.puntos = Object.assign({}, E.PUNTOS_EQUIPOS); c.desempates = E.desempatesPara(c.sistema); }
    return c;
  }

  // Antes de aplicar la configuración de los JDE se pregunta de qué etapa
  // es el torneo y, en la Regional y la Interregional, de cuál: así el
  // nombre del evento sale siempre igual para todos, ajustado al lugar
  // («JDE 2026 · Etapa Regional · DRE Alajuela»), y la Interregional queda
  // en todos contra todos (art. 66.2.c). Dos pasos con Avisos.formulario:
  // la etapa, y después lo que esa etapa pide. Devuelve { anio, etapa,
  // lugar } o null si se cancela.
  // Las claves de textos.js de cada etapa, enteras (verificar-pareo-pagina.js
  // busca las claves que usa la página por su nombre completo).
  const TEXTO_ETAPA = { institucional: "etapaInstitucional", regional: "etapaRegional", interregional: "etapaInterregionalNombre" };
  const TEXTO_ETAPA_LUGAR = { institucional: "etapaLugarInstitucional", regional: "etapaLugarRegional", interregional: "etapaLugarInterregional" };

  async function pedirEtapaJde(previo, regionesDelArchivo) {
    const anterior = previo || {};
    // Las Direcciones Regionales que trae la inscripción (una en la
    // Regional; dos o tres juntas en la Interregional).
    const dres = [].concat(regionesDelArchivo || []).map((r) => G.direccionDe(r)).filter(Boolean);
    const regionDelArchivo = dres.length === 1 ? dres[0] : "";
    const opciones = (pares) => pares.map((x) => [x.valor, x.texto]);
    const etapas = opciones(Object.keys(G.JDE_ETAPAS).map((k) => ({ valor: k, texto: tx(TEXTO_ETAPA[k]) })));
    const r1 = await Avisos.formulario({
      titulo: tx("etapaTitulo"), texto: tx("etapaTexto"), aceptar: tx("etapaSeguir"), cancelar: tx("cancelar"),
      campos: [{ nombre: "etapa", etiqueta: tx("etapaCampo"), tipo: "select", opciones: etapas, valor: anterior.etapa || "regional" }],
    });
    if (!r1) return null;
    const etapa = r1.etapa;
    const anio = Number(String(t().fechaInicio || "").slice(0, 4)) || Number((window.HoraCR ? HoraCR.hoy() : "").slice(0, 4)) || G.JDE_ANIO_NORMATIVA;
    let campo;
    if (etapa === "regional") {
      const sugerida = (anterior.etapa === "regional" && anterior.lugar) || G.direccionDe(regionDelArchivo) || "";
      campo = { nombre: "lugar", etiqueta: tx("etapaDre"), tipo: "select", valor: sugerida,
        opciones: opciones([{ valor: "", texto: tx("etapaElegir") }].concat(G.JDE_DIRECCIONES.map((d) => ({ valor: d, texto: d })))) };
    } else if (etapa === "interregional") {
      const sugerida = (anterior.etapa === "interregional" && anterior.lugar) ||
        (dres.length ? (G.JDE_INTERREGIONALES.find((x) => dres.every((d) => x.regiones.includes(d))) || {}).numero : "") || "";
      campo = { nombre: "lugar", etiqueta: tx("etapaInterregional"), tipo: "select", valor: sugerida,
        opciones: opciones([{ valor: "", texto: tx("etapaElegir") }].concat(G.JDE_INTERREGIONALES.map((x) => ({ valor: x.numero, texto: G.nombreInterregional(x) })))) };
    } else {
      campo = { nombre: "lugar", etiqueta: tx("etapaCentro"), valor: anterior.etapa === "institucional" ? anterior.lugar || "" : "", max: 80, ayuda: tx("etapaCentroAyuda") };
    }
    // La Regional y la Interregional piden a cuál: sin elegir, se vuelve a preguntar.
    for (;;) {
      const r2 = await Avisos.formulario({ titulo: tx(TEXTO_ETAPA[etapa]), texto: tx(TEXTO_ETAPA_LUGAR[etapa]), aceptar: tx("etapaAplicar"), cancelar: tx("cancelar"), campos: [campo] });
      if (!r2) return null;
      const lugar = String(r2.lugar || "").trim();
      if (etapa !== "institucional" && !lugar) { Avisos.avisar(tx("etapaFalta"), { tipo: "error" }); continue; }
      return { anio, etapa, lugar };
    }
  }

  // El nombre de un torneo de los JDE: el del evento y, si lo tiene, su grupo
  // («Individual · Categoría A · Mujeres»).
  const nombreConGrupo = (jde, grupo) => G.nombreEventoJde(jde) + (grupo ? " — " + grupo : "");

  async function aplicarConfigJde() {
    const v = t();
    if (v.rondas.length) { Avisos.avisar(tx("configJdeConRondas"), { tipo: "error" }); return; }
    const jde = await pedirEtapaJde(v.jde, v.jde && v.jde.lugar);
    if (!jde || t() !== v || v.rondas.length) return;
    // Un torneo sin grupo guardado (armado a mano) conserva su nombre como
    // grupo la primera vez; las siguientes, solo cambia el evento.
    if (v.grupo == null) v.grupo = v.jde ? "" : String(v.nombre || "").trim();
    Object.assign(v, configuracionPara(v.jugadores.length, v, E.esDeEquipos(v), jde.etapa), { jde, nombre: nombreConGrupo(jde, v.grupo) });
    delete v.configLibre;
    guardar();
    pintarTorneo();
    pintarLista();
    Avisos.avisar(tx("configJdeAplicada", { s: tx(v.sistema === "todos" ? "todos" : "suizo") }));
  }

  function alCambiarTorneo(e) {
    const v = t();
    const n = e.target.name;
    if (!n) return;
    if (n === "nombre" && v.jde) { e.target.value = v.nombre || ""; return; }
    if (configFija(v) && (n === "ritmo" || n === "sistema" || n.startsWith("p_"))) { pintarTorneo(); return; }
    if (n === "sistema") { if (v.rondas.length === 0) v.sistema = e.target.value; }
    else if (n === "baku" || n === "dobleVuelta") v[n] = e.target.checked;
    else if (n === "rondasTotales") {
      const r = Math.round(Number(e.target.value));
      if (r >= Math.max(1, v.rondas.length) && r <= 30) v.rondasTotales = r;
      else { Avisos.avisar(tx("rondasInvalidas", { min: Math.max(1, v.rondas.length) }), { tipo: "error" }); e.target.value = v.rondasTotales; return; }
    } else if (n.startsWith("p_")) {
      const k = n.slice(2);
      const x = Number(e.target.value);
      if (!(x >= 0 && x <= 9) || Math.round(x * 2) !== x * 2) { e.target.value = v.puntos[k]; return; }
      v.puntos[k] = x;
    } else if (n === "federacion") v.federacion = e.target.value.trim().toUpperCase();
    else if (n === "validoElo") { if (e.target.value) v.validoElo = e.target.value; else delete v.validoElo; }
    else if (n === "provincia") { if (PROVINCIAS.includes(e.target.value)) v.provincia = e.target.value; else delete v.provincia; }
    else v[n] = e.target.value;
    guardar();
    if (n === "nombre") pintarLista();
    if (n === "sistema") pintarTorneo();
  }

  function pintarDesempates() {
    const ol = $("pi-desempates");
    ol.replaceChildren();
    const lista = t().desempates;
    const fija = configFija(t());
    lista.forEach((c, i) => {
      const info = E.catalogo(t()).find((x) => x.codigo === c);
      if (!info) return;
      const mover = (d) => () => {
        const [x] = lista.splice(i, 1);
        lista.splice(i + d, 0, x);
        guardar();
        pintarDesempates();
        const b = ol.children[i + d] && ol.children[i + d].querySelector(d < 0 ? ".pi-sube" : ".pi-baja");
        if (b && !b.disabled) b.focus();
      };
      ol.append(el("li", { class: "flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 dark:border-brand-700 px-3 py-2" },
        el("span", { class: "font-mono text-xs font-bold w-6 text-right", texto: (i + 1) + "." }),
        el("span", { class: "flex-1 min-w-[10rem]" }, el("span", { class: "font-semibold", texto: info[idioma] }), " ",
          el("span", { class: "text-xs text-brand-600 dark:text-brand-300", texto: "(" + c + ")" })),
        el("button", { type: "button", class: C.mini + " pi-sube", disabled: fija || i === 0, "aria-label": tx("subir", { n: info[idioma] }), onclick: mover(-1) }, "↑"),
        el("button", { type: "button", class: C.mini + " pi-baja", disabled: fija || i === lista.length - 1, "aria-label": tx("bajar", { n: info[idioma] }), onclick: mover(1) }, "↓"),
        el("button", { type: "button", class: C.miniPeligro, disabled: fija, "aria-label": tx("quitarDesempate", { n: info[idioma] }), onclick: () => { lista.splice(i, 1); guardar(); pintarDesempates(); $("pi-desempate-nuevo").focus(); } }, tx("quitar"))
      ));
    });
    if (!lista.length) ol.append(el("li", { class: C.nota + " italic", texto: tx("sinDesempates") }));
    const s = $("pi-desempate-nuevo");
    s.replaceChildren();
    for (const x of E.catalogo(t())) if (!lista.includes(x.codigo)) s.append(el("option", { value: x.codigo, texto: x[idioma] + " (" + x.codigo + ")" }));
    s.disabled = fija;
    $("pi-desempate-agregar").disabled = fija || !s.options.length;
  }

  // ---------- Jugadores ----------
  function instituciones() {
    const v = t();
    const vistas = new Set();
    for (const j of v.jugadores) if (j.institucion) vistas.add(j.institucion);
    return [...vistas].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }

  function pintarSelectInstitucion(sel) {
    const lista = instituciones();
    sel.replaceChildren(el("option", { value: "", texto: tx("todasInstituciones") }));
    for (const inst of lista) sel.append(el("option", { value: inst, texto: inst }));
    // Si la institución filtrada ya no tiene a nadie (se borró o se editó),
    // el filtro vuelve a «todas»: nunca se queda filtrando en silencio algo
    // que el select ya no ofrece.
    if (!lista.includes(estado.filtroInstitucion)) estado.filtroInstitucion = "";
    sel.value = estado.filtroInstitucion;
  }

  function pintarEloPendientes() {
    const ul = $("pi-elo-pendientes");
    estado.eloPendientes = estado.eloPendientes.filter((x) => {
      const j = jugador(x.id);
      return j && !(Number(j.elo) > 0);
    });
    ul.replaceChildren();
    ul.hidden = !estado.eloPendientes.length;
    for (const x of estado.eloPendientes) {
      ul.append(el("li", { class: "flex items-center justify-between gap-2" },
        el("span", {},
          el("span", { class: "font-semibold", texto: x.nombre }), " — ",
          el("span", { class: "text-brand-600 dark:text-brand-300", texto: tx(x.estado === "ambiguo" ? "eloAmbiguo" : "eloNoEncontrado") })),
        el("button", { type: "button", class: C.mini, "aria-label": tx("editarA", { n: x.nombre }), onclick: () => editarJugador(x.id) }, tx("editar"))));
    }
  }

  function pintarJugadores() {
    const v = t();
    const num = T.numeros(v);
    const orden = T.ordenInicial(v);
    const tabla = $("pi-tabla-jugadores");
    tabla.replaceChildren();
    // La acreditación, en la lista de inscritos (antes de emparejar también
    // está en Rondas). En equipos no: se acredita el equipo en la sala.
    const acred = $("pi-acreditacion");
    acred.replaceChildren();
    if (!E.esDeEquipos(v) && v.jugadores.length) pintarPasarLista(acred, pintarJugadores, "pi-j");
    // En un torneo por equipos no se agrega gente a mano ni se busca el Elo
    // Nacional de un equipo: los equipos salen de la inscripción.
    const deEquipos = E.esDeEquipos(v);
    $("pi-nota-equipos").hidden = !deEquipos;
    $("pi-form-jugador").hidden = deEquipos;
    $("pi-pegar-caja").hidden = deEquipos;
    $("pi-caja-elo-nacional").hidden = deEquipos;
    tabla.hidden = deEquipos;
    $("pi-masivo").hidden = true;
    $("pi-equipos").hidden = !deEquipos;
    if (deEquipos) {
      $("pi-cuenta").textContent = v.jugadores.length;
      $("pi-sin-jugadores").hidden = v.jugadores.length > 0;
      $("pi-sin-coincidencias").hidden = true;
      $("pi-orden-ayuda").textContent = tx(v.rondas.length ? "ordenTablerosFijo" : "ordenTablerosAyuda");
      pintarSugerencia();
      pintarEquipos();
      return;
    }
    $("pi-cuenta").textContent = v.jugadores.length;
    $("pi-sin-jugadores").hidden = v.jugadores.length > 0;
    $("pi-orden-ayuda").textContent = tx(Array.isArray(v.numeracion) ? "ordenFijo" : "ordenAyuda");
    $("pi-buscar-jugador").value = estado.filtroJugador;
    pintarEloPendientes();
    pintarSugerencia();
    if (!v.jugadores.length) { $("pi-sin-coincidencias").hidden = true; return; }
    const q = normalizarBusqueda(estado.filtroJugador);
    const filtrado = q ? orden.filter((id) => {
      const j = jugador(id);
      return normalizarBusqueda(j.nombre).includes(q) || normalizarBusqueda(j.institucion).includes(q);
    }) : orden;
    $("pi-sin-coincidencias").hidden = filtrado.length > 0;
    if (!filtrado.length) return;
    // Marcar varios (o todos los que se ven) para eliminarlos de una vez.
    for (const id of [...estado.marcados]) if (!jugador(id)) estado.marcados.delete(id);
    const todosMarcados = filtrado.every((id) => estado.marcados.has(id));
    pintarMasivo(filtrado);
    tabla.append(el("thead", {}, el("tr", {},
      el("th", { scope: "col", class: "w-8" }, el("input", { type: "checkbox", id: "pi-marcar-todos", "aria-label": tx("marcarTodos"), checked: todosMarcados, onchange: (e) => {
        for (const id of filtrado) { if (e.target.checked) estado.marcados.add(id); else estado.marcados.delete(id); }
        pintarJugadores();
        const x = $("pi-marcar-todos"); if (x) x.focus();
      } })),
      el("th", { class: "num", scope: "col", texto: tx("nro") }), el("th", { scope: "col", texto: tx("nombre") }),
      el("th", { scope: "col", texto: tx("institucion") }), el("th", { scope: "col", texto: tx("categoria") }),
      el("th", { scope: "col", texto: tx("titulo") }), el("th", { class: "num", scope: "col", texto: "Elo" }),
      el("th", { scope: "col", texto: tx("fed") }), el("th", { scope: "col", texto: tx("fideId") }),
      el("th", { class: "num", scope: "col", texto: tx("pts") }), el("th", { scope: "col", texto: tx("estado") }),
      el("th", { scope: "col", texto: tx("acciones") }))));
    const cuerpo = el("tbody");
    const enUnaMesa = new Set();
    for (const R of v.rondas) for (const m of R.mesas) { enUnaMesa.add(m.b); if (m.n) enUnaMesa.add(m.n); }
    for (const id of filtrado) {
      const j = jugador(id);
      const retirado = j.retiradoDespuesDe != null;
      const cid = "pi-marcar-" + id;
      cuerpo.append(el("tr", {},
        el("td", {}, el("input", { type: "checkbox", id: cid, "aria-label": tx("marcarA", { n: j.nombre }), checked: estado.marcados.has(id), onchange: (e) => {
          if (e.target.checked) estado.marcados.add(id); else estado.marcados.delete(id);
          pintarJugadores();
          const x = $(cid); if (x) x.focus();
        } })),
        el("td", { class: "num", texto: num.get(id) }),
        el("td", { class: "font-semibold" }, j.nombre, j.mesaFija ? el("span", { class: "block text-xs font-normal", texto: tx("mesaFijaEn", { m: j.mesaFija }) }) : null),
        el("td", { texto: j.institucion || "" }),
        el("td", { texto: j.categoria || "" }),
        el("td", { texto: j.titulo || "" }),
        el("td", { class: "num", texto: Number(j.elo) > 0 ? j.elo : "" }),
        el("td", { texto: j.fed || "" }),
        el("td", { texto: j.fideId || "" }),
        el("td", { class: "num", texto: puntosTexto(T.puntos(v, id)) }),
        el("td", { texto: retirado ? tx(j.retiroAuto != null ? "retiradoIncomparecencia" : "retiradoDesde", { r: j.retiradoDespuesDe + 1 }) : tx("activo") }),
        el("td", { class: "whitespace-nowrap" },
          el("button", { type: "button", class: C.mini, "aria-label": tx("editarA", { n: j.nombre }), onclick: () => editarJugador(id) }, tx("editar")), " ",
          v.evento && !v.rondas.length ? el("button", { type: "button", class: C.mini, "aria-label": tx("moverA", { n: j.nombre }), onclick: () => moverDeTorneo(id) }, tx("mover")) : null, " ",
          enUnaMesa.has(id) || v.rondas.length
            ? el("button", { type: "button", class: C.mini, "aria-label": tx(retirado ? "volverA" : "retirarA", { n: j.nombre }), onclick: () => retirar(id) }, tx(retirado ? "volver" : "retirar"))
            : el("button", { type: "button", class: C.miniPeligro, "aria-label": tx("eliminarA", { n: j.nombre }), onclick: () => eliminar(id) }, tx("eliminar"))
        )));
    }
    tabla.append(cuerpo);
  }

  // Los equipos, cada uno con su orden de tableros (art. 66.2.h): se da en
  // el congresillo y se mantiene en toda la etapa, así que ↑ y ↓ solo
  // funcionan antes de la ronda 1. El quinto es el suplente.
  function pintarEquipos() {
    const v = t();
    const num = T.numeros(v);
    const caja = $("pi-equipos");
    caja.replaceChildren();
    caja.append(formularioEquipo());
    if (!v.jugadores.length) return;
    const fijo = v.rondas.length > 0;
    caja.append(el("div", { class: "flex flex-wrap gap-2" },
      el("button", { type: "button", class: C.botonSec, onclick: imprimirOrdenTableros }, tx("imprimirOrdenTableros"))));
    for (const id of T.ordenInicial(v)) {
      const e = jugador(id);
      const ol = el("ol", { class: "mt-1 space-y-1 text-sm" });
      e.integrantes.forEach((j, k) => {
        const mover = (d) => () => {
          if (!E.moverIntegrante(v, id, k, d)) return;
          guardar();
          pintarEquipos();
          const b = $("pi-orden-" + id + "-" + (k + d) + (d < 0 ? "-sube" : "-baja"));
          if (b && !b.disabled) b.focus();
        };
        ol.append(el("li", { class: "flex flex-wrap items-center gap-2" },
          el("span", { class: "font-mono text-xs font-bold w-24", texto: k < E.TABLEROS ? tx("tableroN", { t: k + 1 }) : tx("suplente") }),
          el("span", { class: "flex-1 min-w-[10rem]", texto: j.nombre + (Number(j.elo) > 0 ? " (" + j.elo + ")" : "") }),
          el("button", { type: "button", id: "pi-orden-" + id + "-" + k + "-sube", class: C.mini, disabled: fijo || k === 0, "aria-label": tx("subir", { n: j.nombre }), onclick: mover(-1) }, "↑"),
          el("button", { type: "button", id: "pi-orden-" + id + "-" + k + "-baja", class: C.mini, disabled: fijo || k === e.integrantes.length - 1, "aria-label": tx("bajar", { n: j.nombre }), onclick: mover(1) }, "↓"),
          fijo ? null : el("button", { type: "button", id: "pi-reemplazar-" + id + "-" + k, class: C.mini, "aria-label": tx("reemplazarA", { n: j.nombre }), onclick: () => reemplazarIntegrante(id, k) }, tx("reemplazar")),
          fijo ? null : el("button", { type: "button", id: "pi-quitar-" + id + "-" + k, class: C.miniPeligro, "aria-label": tx("quitarIntegranteA", { n: j.nombre, e: e.nombre }), onclick: () => quitarIntegrante(id, k) }, tx("quitar"))));
      });
      caja.append(el("section", { class: "rounded-xl border border-brand-200 dark:border-brand-700 p-3", "data-equipo": id },
        el("h3", { class: "font-semibold", texto: num.get(id) + ". " + e.nombre }),
        el("p", { class: C.nota, texto: tx("equipoResumen", { n: e.integrantes.length, p: puntosTexto(T.puntos(v, id)), pt: puntosTexto(E.puntosTablero(v, id)), elo: e.elo || "—" }) }),
        ol));
    }
  }

  // Cambiar a un integrante antes de la ronda 1 (si la normativa y el
  // congresillo lo permiten): por uno de los descartados de su centro o por
  // alguien escrito a mano. Entra en el mismo lugar del orden de tableros y
  // queda en el acta.
  async function reemplazarIntegrante(idE, k) {
    const v = t();
    const e = jugador(idE);
    const sale = e.integrantes[k];
    const descartados = ((v.evento && v.evento.decisiones && v.evento.decisiones.descartados) || [])
      .filter((x) => sinTildes(x.institucion) === sinTildes(e.institucion)).map((x) => x.nombre);
    const campos = [];
    if (descartados.length) campos.push({ nombre: "descartado", etiqueta: tx("reemplazoDescartado"), tipo: "select", valor: "", opciones: [["", tx("reemplazoOtro")]].concat(descartados.map((n) => [n, n])) });
    campos.push({ nombre: "nombre", etiqueta: tx("reemplazoNombre"), valor: "", max: 33 });
    const r = await Avisos.formulario({ titulo: tx("reemplazarA", { n: sale.nombre }), texto: tx("reemplazoTexto", { e: e.nombre }), aceptar: tx("reemplazar"), cancelar: tx("cancelar"), campos });
    if (!r || t() !== v || v.rondas.length) return;
    const nombre = String(r.descartado || r.nombre || "").trim().slice(0, 33);
    if (!nombre) { Avisos.avisar(tx("faltaNombre"), { tipo: "error" }); return; }
    e.integrantes[k] = { id: idJugador(), nombre, institucion: sale.institucion || e.institucion, sexo: sale.sexo, categoria: sale.categoria, region: sale.region, retiradoDespuesDe: null };
    if (!e.integrantes[k].region) delete e.integrantes[k].region;
    e.elo = E.eloDeEquipo(e.integrantes);
    v.reemplazos = (v.reemplazos || []).concat({ equipo: e.nombre, sale: sale.nombre, entra: nombre });
    guardar();
    pintarEquipos();
    Avisos.avisar(tx("reemplazado", { s: sale.nombre, e: nombre }));
    const b = $("pi-reemplazar-" + idE + "-" + k); if (b) b.focus();
  }

  // Sacar a un integrante que no vino (antes de la ronda 1): queda en el
  // acta. Un equipo que se queda sin nadie sale del torneo.
  async function quitarIntegrante(idE, k) {
    const v = t();
    const e = jugador(idE);
    const sale = e.integrantes[k];
    const ok = await Avisos.confirmar(tx("quitarIntegranteTexto", { n: sale.nombre, e: e.nombre, q: e.integrantes.length - 1, m: G.JDE_MIN_EQUIPO }), { aceptar: tx("quitarIntegranteSi"), peligro: true });
    if (!ok || t() !== v || v.rondas.length) return;
    e.integrantes.splice(k, 1);
    v.bajasEquipo = (v.bajasEquipo || []).concat({ equipo: e.nombre, nombre: sale.nombre });
    if (!e.integrantes.length) v.jugadores = v.jugadores.filter((x) => x.id !== idE);
    else e.elo = E.eloDeEquipo(e.integrantes);
    guardar();
    pintarJugadores();
    Avisos.avisar(tx("integranteQuitado", { n: sale.nombre, e: e.nombre }));
    const b = $("pi-quitar-" + idE + "-" + Math.min(k, e.integrantes.length - 1)) || $("pi-eq-nuevo-centro");
    if (b) b.focus();
  }

  // Un equipo que llegó y no estaba en la lista: su centro y sus
  // integrantes (uno por línea, en el orden de tableros). Con rondas ya
  // jugadas entra desde la siguiente y queda en el acta como inscripción
  // tardía, como un jugador.
  function formularioEquipo() {
    const centro = el("input", { id: "pi-eq-nuevo-centro", class: C.campo + " w-full", maxlength: "80", autocomplete: "off" });
    const lista = el("textarea", { id: "pi-eq-nuevo-integrantes", rows: "5", class: C.campo + " w-full font-mono text-xs" });
    const boton = el("button", { type: "button", id: "pi-eq-nuevo-agregar", class: C.botonSec + " mt-2" }, tx("equipoNuevoAgregar"));
    boton.addEventListener("click", () => {
      const v = t();
      const inst = centro.value.trim();
      const nombres = lista.value.split(/\r?\n/).map((l) => l.split(/\t|;/).map((x) => x.trim())).filter((x) => x[0]);
      if (!inst) { Avisos.avisar(tx("equipoNuevoFaltaCentro"), { tipo: "error" }); centro.focus(); return; }
      if (!nombres.length) { Avisos.avisar(tx("equipoNuevoFaltan"), { tipo: "error" }); lista.focus(); return; }
      if (nombres.length > G.JDE_MAX_EQUIPO) { Avisos.avisar(tx("equipoNuevoDeMas", { n: G.JDE_MAX_EQUIPO }), { tipo: "error" }); return; }
      if (v.jugadores.some((x) => mismoCentro(x.institucion || x.nombre, inst))) { Avisos.avisar(tx("equipoNuevoYaEsta", { i: inst }), { tipo: "error" }); return; }
      const integrantes = nombres.map(([nombre, elo]) => ({ id: idJugador(), nombre: nombre.slice(0, 33), institucion: inst, elo: Number(elo) > 0 ? Number(elo) : 0, retiradoDespuesDe: null }));
      const eq = E.armarEquipos(integrantes, idJugador)[0];
      eq.categoria = categoriaDe(v);
      v.jugadores.push(eq);
      if (v.rondas.length) v.tardios = (v.tardios || []).concat({ nombre: eq.nombre, institucion: inst, ronda: v.rondas.length + 1, hora: Date.now(), aviso: "" });
      guardar();
      pintarJugadores();
      Avisos.avisar(tx("equipoNuevoListo", { i: inst, n: integrantes.length }) + (integrantes.length < G.JDE_MIN_EQUIPO ? " " + tx("equipoNuevoCorto", { m: G.JDE_MIN_EQUIPO }) : "") +
        (v.rondas.length ? " " + tx("inscripcionTardia", { r: v.rondas.length }) : ""));
      const x = $("pi-eq-nuevo-centro"); if (x) x.focus();
    });
    // Queda abierto al volver a pintar (para agregar otro seguido).
    const det = el("details", { id: "pi-eq-nuevo", class: "rounded-xl border border-brand-200 dark:border-brand-700 p-3", open: !!estado.equipoNuevoAbierto });
    det.addEventListener("toggle", () => { estado.equipoNuevoAbierto = det.open; });
    det.append(
      el("summary", { class: "cursor-pointer font-semibold rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto: tx("equipoNuevoTitulo") }),
      el("p", { class: C.nota + " mt-1", texto: tx("equipoNuevoTexto") }),
      el("label", { for: "pi-eq-nuevo-centro", class: "block text-sm font-semibold mt-2 mb-1", texto: tx("institucion") }), centro,
      el("label", { for: "pi-eq-nuevo-integrantes", class: "block text-sm font-semibold mt-2 mb-1", texto: tx("equipoNuevoIntegrantes") }), lista, boton);
    return det;
  }

  // El orden de tableros de cada equipo, una hoja por equipo, para que el
  // delegado la firme en el congresillo.
  function imprimirOrdenTableros() {
    const v = t();
    const cont = $("pi-firmas");
    cont.replaceChildren();
    for (const id of T.ordenInicial(v)) {
      const e = jugador(id);
      const hoja = el("div", { class: "pi-firma-mesa" },
        el("h1", { class: "pi-firma-titulo", texto: tx("ordenTablerosTitulo", { e: e.nombre }) + (v.nombre ? " — " + v.nombre : "") }));
      e.integrantes.forEach((j, k) => hoja.append(el("p", { class: "pi-firma-jugador",
        texto: (k < E.TABLEROS ? tx("tableroN", { t: k + 1 }) : tx("suplente")) + ": " + j.nombre })));
      hoja.append(el("p", { class: "pi-firma-linea", texto: tx("firmaDelegado") }), el("p", { class: "pi-firma-linea", texto: tx("firmaArbitro") }));
      cont.append(hoja);
    }
    document.body.classList.add("pi-imprimiendo-firmas");
    window.print();
  }

  function datosJugador(f) {
    const g = (k) => String(f[k] == null ? "" : f[k]).trim();
    const elo = Math.round(Number(g("elo")) || 0);
    return {
      nombre: g("nombre").slice(0, 33), institucion: g("institucion").slice(0, 80), categoria: g("categoria").slice(0, 40),
      elo: elo > 0 && elo <= 3500 ? elo : 0,
      titulo: ["GM", "IM", "WGM", "FM", "WIM", "CM", "WFM", "WCM"].includes(g("titulo").toUpperCase()) ? g("titulo").toUpperCase() : "",
      fed: g("fed").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3),
      fideId: g("fideId").replace(/\D/g, "").slice(0, 11),
      sexo: g("sexo") === "m" || g("sexo") === "w" ? g("sexo") : "",
      nacimiento: /^\d{4}-\d{2}-\d{2}$/.test(g("nacimiento")) ? g("nacimiento") : "",
    };
  }

  // Quienes comparten nombre (sin tildes ni importar el orden de apellidos y
  // nombre, el mismo bolsillo que usa el Elo Nacional) entre los recién
  // agregados y el resto del torneo: no se bloquea, puede ser un homónimo de
  // verdad, pero se avisa para que quien organiza revise si es la misma
  // persona anotada dos veces.
  function duplicadosEntre(idsNuevos) {
    const v = t();
    const porBolsillo = new Map();
    for (const j of v.jugadores) {
      const b = bolsilloNombre(j.nombre);
      if (!b) continue;
      if (!porBolsillo.has(b)) porBolsillo.set(b, 0);
      porBolsillo.set(b, porBolsillo.get(b) + 1);
    }
    const vistos = new Set();
    const nombres = [];
    for (const id of idsNuevos) {
      const j = jugador(id);
      const b = bolsilloNombre(j.nombre);
      if (porBolsillo.get(b) > 1 && !vistos.has(b)) {
        vistos.add(b);
        nombres.push(j.nombre);
      }
    }
    return nombres;
  }

  function agregarJugadores(lista) {
    const v = t();
    let n = 0;
    const idsNuevos = [];
    for (const datos of lista) {
      if (!datos.nombre) continue;
      const id = idJugador();
      v.jugadores.push(Object.assign({ id, retiradoDespuesDe: null }, datos));
      idsNuevos.push(id);
      n++;
    }
    if (n) {
      // En los JDE: la categoría según el año de nacimiento, y quien entra
      // con rondas ya jugadas queda en el acta como inscripción tardía.
      const nuevos = idsNuevos.map((id) => v.jugadores.find((j) => j.id === id));
      const anio = v.evento && v.evento.jde && v.evento.jde.anio;
      const rev = anio ? G.revisarCategorias(nuevos, anio) : null;
      const malos = rev ? rev.noPermitidos : [];
      for (const c of malos) Avisos.avisar(tx("tardioCategoria", { n: c.jugador.nombre, c: c.categoria, a: c.nace, p: c.propia || "—" }), { tipo: "error" });
      if (v.rondas.length && v.evento) {
        v.tardios = (v.tardios || []).concat(nuevos.map((j) => ({ nombre: j.nombre, institucion: j.institucion || "", ronda: v.rondas.length + 1, hora: Date.now(),
          aviso: (malos.find((c) => c.jugador === j) ? "No está en la categoría de su año de nacimiento." : "") })));
      }
      guardar();
      pintarJugadores();
      if (v.rondas.length) Avisos.avisar(tx("inscripcionTardia", { r: v.rondas.length }), { tipo: "info" });
      const repetidos = duplicadosEntre(idsNuevos);
      if (repetidos.length) Avisos.avisar(tx("nombresRepetidos", { n: repetidos.join(", ") }), { tipo: "info" });
    }
    return n;
  }

  // ---------- Subir una lista (Word o Excel) ----------
  // Las mismas claves que ya entiende "Pegar una lista", en el mismo orden,
  // para cuando el archivo no trae una cabecera reconocible.
  const ORDEN_LISTA = ["nombre", "institucion", "elo", "titulo", "fed", "fideId", "categoria"];
  // De cada etiqueta posible (sin tildes, en minúscula) a su campo. Una sola
  // tabla, no una de arrays: dos claves "palabra" seguidas entre corchetes
  // son justo el patrón con el que verificar-pareo-pagina.js reconoce una
  // lista de opciones traducible, y esta no lo es.
  const SINONIMOS_COLUMNA = {
    nombre: "nombre", name: "nombre", jugador: "nombre", player: "nombre",
    "nombre completo": "nombre",
    institucion: "institucion", colegio: "institucion", escuela: "institucion",
    "centro educativo": "institucion", "nombre de centro educativo": "institucion",
    "nombre del centro educativo": "institucion",
    club: "institucion", institution: "institucion", school: "institucion",
    elo: "elo", rating: "elo",
    titulo: "titulo", title: "titulo",
    fed: "fed", federacion: "fed", pais: "fed", country: "fed", federation: "fed",
    fideid: "fideId", "fide id": "fideId", "id fide": "fideId",
    "codigo fide": "fideId", "fide code": "fideId",
    categoria: "categoria", category: "categoria", nivel: "categoria", division: "categoria",
    // Lo que trae la inscripción de los JDE (y cualquier lista parecida):
    // con estas tres se sugiere partirla en torneos (js/pareo/grupos.js).
    sexo: "sexo", genero: "sexo", sex: "sexo", gender: "sexo",
    // El torneo, cuando el archivo lo dice aparte del sexo (Mujeres o
    // Abierto): en el abierto juegan también mujeres.
    torneo: "torneo", rama: "torneo", "torneo (mujeres/abierto)": "torneo", seccion: "torneo", section: "torneo",
    fdn: "nacimiento", nacimiento: "nacimiento", "fecha de nacimiento": "nacimiento",
    "date of birth": "nacimiento", "birth date": "nacimiento", birthday: "nacimiento",
    "equipo/ind": "modalidad", "equipo / ind": "modalidad", "equipo/individual": "modalidad",
    "equipo o individual": "modalidad", modalidad: "modalidad", "team/individual": "modalidad",
    "direccion regional": "region", regional: "region",
    // La etapa de la que viene una lista de clasificados (la escribe
    // js/pareo/evento.js): con ella se ofrece armar la etapa que sigue.
    etapa: "etapa", stage: "etapa",
    // El puesto también lo trae solo una lista de clasificados (también las
    // que se bajaron antes de que existiera la columna «Etapa»).
    puesto: "puesto",
    // Solo para reconocer a la misma persona inscrita dos veces: no se
    // guarda en el torneo (soloJugador).
    "documento de identidad": "documento", documento: "documento", cedula: "documento",
    identificacion: "documento",
  };
  const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  // Una fila es cabecera si reconoce al menos la columna "nombre" (con
  // cualquiera de sus etiquetas); si no, se lee en ORDEN_LISTA y la primera
  // fila es ya un jugador. Nunca se adivina a medias: o se reconoce el
  // nombre, o se cae al orden fijo entero.
  function columnasDeLista(primeraFila) {
    const mapa = {};
    (primeraFila || []).forEach((celda, i) => {
      const campo = SINONIMOS_COLUMNA[sinTildes(celda)];
      if (campo && mapa[campo] == null) mapa[campo] = i;
    });
    return mapa.nombre != null ? mapa : null;
  }

  // La cabecera se busca en las primeras filas, no solo en la primera: el
  // Excel de los JDE trae arriba el título del reporte y la fecha en que se
  // exportó, y sin esto esas dos filas entraban como jugadores.
  const FILAS_ANTES_DE_CABECERA = 10;

  // Cada jugador, con la modalidad y la regional aparte: sirven para sugerir
  // cómo partir la lista, pero no son datos del jugador en el torneo.
  function filasAJugadores(filas) {
    if (!filas || !filas.length) return [];
    let fila0 = -1, conCabecera = null;
    for (let i = 0; i < Math.min(filas.length, FILAS_ANTES_DE_CABECERA) && !conCabecera; i++) {
      conCabecera = columnasDeLista(filas[i]);
      if (conCabecera) fila0 = i;
    }
    const mapa = conCabecera || Object.fromEntries(ORDEN_LISTA.map((campo, i) => [campo, i]));
    const datos = conCabecera ? filas.slice(fila0 + 1) : filas;
    const celda = (fila, campo) => (mapa[campo] != null ? fila[mapa[campo]] : "");
    const ordenFecha = G.ordenFechas(datos.map((fila) => celda(fila, "nacimiento")));
    return datos.map((fila) => Object.assign(datosJugador({
      nombre: mapa.nombre != null ? fila[mapa.nombre] : "",
      institucion: mapa.institucion != null ? fila[mapa.institucion] : "",
      elo: mapa.elo != null ? fila[mapa.elo] : "",
      titulo: mapa.titulo != null ? fila[mapa.titulo] : "",
      fed: mapa.fed != null ? fila[mapa.fed] : "",
      fideId: mapa.fideId != null ? fila[mapa.fideId] : "",
      categoria: mapa.categoria != null ? fila[mapa.categoria] : "",
      sexo: G.leerSexo(celda(fila, "sexo")),
      nacimiento: G.leerFecha(celda(fila, "nacimiento"), ordenFecha),
    }), {
      modalidad: G.leerModalidad(celda(fila, "modalidad")),
      region: String(celda(fila, "region") || "").trim(),
      documento: String(celda(fila, "documento") || "").trim(),
      torneo: G.leerTorneo(celda(fila, "torneo")),
      etapaOrigen: G.leerEtapa(celda(fila, "etapa")),
      deClasificados: mapa.puesto != null || mapa.etapa != null,
    })).filter((d) => d.nombre);
  }

  // Lo que se guarda del jugador: sin la modalidad ni la regional.
  // La Dirección Regional sí se guarda: la usa la lista de clasificados
  // para la etapa siguiente (js/pareo/evento.js).
  const soloJugador = ({ modalidad, alAbierto, documento, torneo, origen, etapaOrigen, deClasificados, ...d }) => (d.region ? d : (delete d.region, d));

  // Uno o varios archivos: en la Etapa Interregional llegan los
  // clasificados de cada Dirección Regional por separado (la lista que baja
  // «Clasificados», en la ficha Archivos), y se suben juntos.
  async function subirLista(archivos) {
    const estadoEl = $("pi-subir-lista-estado");
    const todos = Array.from(archivos.length != null ? archivos : [archivos]);
    if (todos.some((a) => a.size > 5 * 1024 * 1024)) { Avisos.avisar(tx("archivoGrande"), { tipo: "error" }); return; }
    estadoEl.textContent = tx("leyendoArchivo");
    try {
      const leida = [];
      for (const archivo of todos) {
        const nombreArch = (archivo.name || "").toLowerCase();
        let filas;
        if (archivo.filas) filas = archivo.filas; // la lista que pasa la inscripción de los JDE: ya son filas
        else if (nombreArch.endsWith(".docx")) filas = await window.ReporteTextos.filasDeDocx(archivo);
        else if (nombreArch.endsWith(".doc")) { estadoEl.textContent = ""; Avisos.avisar(tx("archivoDocAntiguo"), { tipo: "error" }); return; }
        else filas = (await window.ReporteExcel.leer(archivo)).filas;
        // El archivo de cada uno: si una persona viene en dos listas, se avisa.
        leida.push(...filasAJugadores(filas).map((j) => Object.assign(j, { origen: archivo.name || "" })));
      }
      const archivo = todos[0];
      estadoEl.textContent = "";
      if (!leida.length) { Avisos.avisar(tx("archivoSinJugadores"), { tipo: "error" }); return; }
      // La inscripción de una etapa subida junto con los clasificados de la
      // anterior (los que traen «Etapa»): se comparan, y juega la inscripción.
      const conEtapa = leida.filter((j) => j.deClasificados), sinEtapa = leida.filter((j) => !j.deClasificados);
      const comparar = conEtapa.length > 0 && sinEtapa.length > 0;
      const extra = { siguiente: V.siguienteDe((comparar ? conEtapa : leida).map((j) => j.etapaOrigen)), comparacion: comparar ? V.compararEtapa(sinEtapa, conEtapa) : null };
      const limpia = G.quitarRepetidos(comparar ? sinEtapa : leida);
      const lista = limpia.lista;
      G.pasarMujeresAlAbierto(lista, true);
      if (G.agrupar(lista).grupos.length > 1) { sugerirGrupos(lista, archivo.name, limpia, extra); return; }
      const sobran = limpia.repetidos.reduce((a, r) => a + r.veces - 1, 0);
      if (sobran) Avisos.avisar(tx("repetidasQuitadas", { n: sobran }), { tipo: "info" });
      agregarTodos(lista);
    } catch (err) {
      estadoEl.textContent = "";
      Avisos.avisar(tx("noAbre", { e: err.message }), { tipo: "error" });
    }
  }

  // «Abrir en Pareo Integral», de la inscripción de los JDE (inscripcion-jde.html): las filas
  // de su Excel llegan por el almacenamiento del navegador, sin servidor. Se leen una vez, se
  // borran y valen diez minutos; entran por el mismo camino que «Subir una lista».
  function recogerDeInscripcion() {
    let carga = null;
    try { carga = JSON.parse(localStorage.getItem("ij_para_pareo_v1")); localStorage.removeItem("ij_para_pareo_v1"); } catch (e) { /* sin almacenamiento */ }
    history.replaceState(null, "", location.pathname + location.search);
    if (!carga || !Array.isArray(carga.filas) || Date.now() - Number(carga.hora) > 10 * 60 * 1000) { Avisos.avisar(tx("desdeInscripcionVacia"), { tipo: "error" }); return; }
    if (estado.ficha !== "torneo") irA("torneo");
    subirLista([{ name: String(carga.nombre || "inscripcion-jde.xlsx"), filas: carga.filas }]);
  }

  function agregarTodos(lista) {
    const n = agregarJugadores(lista.map(soloJugador));
    // Subida desde la ficha Torneo: se ve la lista que quedó.
    if (n && estado.ficha !== "jugadores") irA("jugadores");
    if (n) Avisos.avisar(tx("agregados", { n }));
    else Avisos.avisar(tx("nadaQueAgregar"), { tipo: "error" });
  }

  // ---------- La sugerencia: un torneo por grupo ----------
  // Cuando la lista trae a la vez a hombres y mujeres, equipos e individual o
  // varias categorías, no se agrega a nadie todavía: se le muestra al árbitro
  // cómo quedaría partida, con cada grupo marcado (menos el que tiene un solo
  // jugador, que no alcanza para un torneo), y él decide.
  function sugerirGrupos(lista, nombreArchivo, limpia, extra) {
    const regiones = [...new Set(lista.map((j) => j.region).filter(Boolean))];
    const base = regiones.length === 1 ? tx("grupoRegional", { r: regiones[0] })
      : String(nombreArchivo || "").replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
    // El año del torneo: el de su fecha de inicio, o el de hoy.
    const anio = Number(String(t().fechaInicio || "").slice(0, 4)) || Number((window.HoraCR ? HoraCR.hoy() : "").slice(0, 4)) || G.JDE_ANIO_NORMATIVA;
    // Una lista de clasificados (con su columna «Etapa») trae la etapa que sigue.
    const siguiente = extra ? extra.siguiente : V.siguienteDe(lista.map((j) => j.etapaOrigen));
    estado.sugerencia = { lista, base, anio, region: regiones, siguiente, comparacion: extra ? extra.comparacion : null, pasarMujeres: true, grupos: [], elegidos: new Map(), abiertos: new Set(), limpia, dondeQueda: new Map(), configJde: true, amistoso: true };
    calcularSugerencia();
    // La lista se sube en la ficha Torneo, y ahí sale la sugerencia.
    if (estado.ficha !== "torneo") irA("torneo");
    pintarSugerencia();
    const caja = $("pi-sugerencia");
    caja.scrollIntoView({ block: "nearest" });
    caja.focus();
  }

  // Cuántos equipos (centros educativos) hay en un grupo de equipos: es lo
  // que se empareja, y de eso sale el sistema.
  const equiposDelGrupo = (g) => new Set(g.jugadores.map((j) => String(j.institucion || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase())).size;
  const participantesDelGrupo = (g) => (g.modalidad === "equipo" ? equiposDelGrupo(g) : g.jugadores.length);

  // Los grupos y la revisión de categorías salen de la lista con o sin el
  // pase de mujeres al abierto, según la casilla. Un grupo que ya estaba
  // conserva su marca; uno nuevo viene marcado si tiene al menos dos.
  function calcularSugerencia() {
    const s = estado.sugerencia;
    // Quien está en dos modalidades o categorías (art. 66.1.h) queda en la
    // que elija el árbitro; mientras no elija, en las dos. La inscripción que
    // no elige sale antes de todo lo demás: el pase, los equipos y los grupos
    // se arman sin ella.
    const fuera = new Set();
    ((s.limpia && s.limpia.dosModalidades) || []).forEach((d, k) => {
      const elegida = s.dondeQueda.get(k);
      if (elegida != null) d.inscripciones.forEach((x, i) => { if (i !== elegida) fuera.add(x.jugador); });
    });
    s.fueraPorModalidad = fuera;
    const lista = s.lista.filter((j) => !fuera.has(j));
    s.pase = G.pasarMujeresAlAbierto(lista, s.pasarMujeres);
    // En cada equipo de más de cinco juegan los que eligió el árbitro (de
    // entrada, los cinco primeros de la inscripción); el resto queda
    // descartado y no entra a ningún torneo.
    s.equipos = G.equiposDeMas(lista).map((e) => Object.assign(e, { maximo: G.JDE_MAX_EQUIPO, tipo: "eq" }));
    s.individuales = G.individualesDeMas(lista).map((e) => Object.assign(e, { maximo: G.JDE_MAX_INDIVIDUAL, tipo: "ind" }));
    s.descartados = new Set();
    // La elección se guarda por equipo y por estado de la casilla del pase:
    // los integrantes de un equipo cambian al prenderla o apagarla, y al
    // volver, cada equipo queda como el árbitro lo había dejado. Si el
    // árbitro desmarca a alguien, el lugar queda libre para que elija.
    // Lo mismo para el tope de dos por centro en individual (art. 66.1.f).
    for (const e of s.equipos.concat(s.individuales)) {
      e.eleccion = e.tipo + "|" + e.clave + "|" + (s.pasarMujeres ? "pase" : "sin-pase");
      const antes = s.elegidos.get(e.eleccion);
      const elegidos = antes ? e.integrantes.filter((j) => antes.has(j)) : e.integrantes.slice(0, e.maximo);
      s.elegidos.set(e.eleccion, new Set(elegidos));
      for (const j of e.integrantes) if (!elegidos.includes(j)) s.descartados.add(j);
    }
    s.juegan = lista.filter((j) => !s.descartados.has(j));
    const { dimensiones, grupos } = G.agrupar(s.juegan);
    const antes = new Map(s.grupos.map((g) => [g.clave, g.marcado]));
    s.dimensiones = dimensiones;
    s.grupos = grupos.map((g) => Object.assign(g, { marcado: antes.has(g.clave) ? antes.get(g.clave) : participantesDelGrupo(g) >= 2 }));
    s.revision = G.revisarCategorias(s.juegan, s.anio);
    s.cortos = G.equiposCortos(s.juegan);
    s.hombresEnMujeres = G.hombresEnMujeres(s.juegan);
  }

  // Los equipos que quedan con menos de tres, con quiénes son: se recalcula
  // con cada decisión del árbitro (pase, los cinco, dónde queda quien estaba
  // en dos modalidades).
  // Quien está anotado como hombre en un torneo de mujeres (individual o
  // equipo): se avisa con su nombre, su centro y el torneo.
  function pintarHombresEnMujeres(s) {
    if (!s.hombresEnMujeres || !s.hombresEnMujeres.length) return null;
    const modo = (j) => tx(j.modalidad === "equipo" ? "grupoEquipos" : "grupoIndividual");
    return el("div", { id: "pi-hombres-mujeres", class: "pi-revisar" },
      el("h4", { class: "pi-revisar-titulo", texto: tx("hombresTitulo") }),
      el("p", { class: "text-sm mt-1", texto: tx("hombresTexto", { n: s.hombresEnMujeres.length }) }),
      el("ul", { id: "pi-hombres-lista", class: "mt-1 space-y-1 text-sm list-disc pl-5" }, s.hombresEnMujeres.map((j) =>
        el("li", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }),
          tx("hombresCaso", { n: j.nombre, i: j.institucion || "—", m: modo(j), c: String(j.categoria || "").trim() })))));
  }

  function pintarEquiposCortos(s) {
    if (!s.cortos || !s.cortos.length) return null;
    return el("div", { id: "pi-equipos-cortos", class: "pi-revisar" },
      el("h4", { class: "pi-revisar-titulo", texto: tx("cortosTitulo", { m: G.JDE_MIN_EQUIPO }) }),
      el("p", { class: "text-sm mt-1", texto: tx("cortosTexto", { m: G.JDE_MIN_EQUIPO, n: s.cortos.length }) }),
      el("ul", { id: "pi-cortos-lista", class: "mt-1 space-y-1 text-sm list-disc pl-5" }, s.cortos.map((e) =>
        el("li", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }),
          tx(e.integrantes.length === 1 ? "cortosUno" : "cortosVarios", {
            i: e.institucion || "—", c: e.categoria, t: tx(e.torneo === "w" ? "grupoMujeres" : "grupoAbierto"),
            k: e.integrantes.length, n: e.integrantes.map((j) => j.nombre).join(", "),
          })))));
  }

  // Lo que se limpió de la lista antes de partirla: las inscripciones
  // repetidas (se dejó una) y quien está en dos modalidades o categorías
  // (art. 66.1.h: se avisa, decide el árbitro).
  function pintarRepetidos(s) {
    const { repetidos, dosModalidades } = s.limpia || { repetidos: [], dosModalidades: [] };
    if (!repetidos.length && !dosModalidades.length) return null;
    const caja = el("div", { id: "pi-repetidos", class: "pi-revisar" });
    caja.append(el("h4", { class: "pi-revisar-titulo", texto: tx("repetidosTitulo") }));
    if (repetidos.length) {
      const sobran = repetidos.reduce((a, r) => a + r.veces - 1, 0);
      caja.append(el("p", { class: "text-sm mt-1" },
        el("span", { class: "pi-sello pi-sello-listo mr-2", texto: "✓ " + tx("repetidosResuelto") }),
        tx("repetidosTexto", { p: repetidos.length, n: sobran })),
        el("details", { class: "mt-1" },
          el("summary", { class: "cursor-pointer text-sm rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto: tx("repetidosVer") }),
          el("ul", { id: "pi-repetidos-lista", class: "mt-1 space-y-1 text-sm list-disc pl-5" }, repetidos.map((r) =>
            el("li", { texto: tx("repetidosCaso", { n: r.jugador.nombre, i: r.jugador.institucion || "—", v: r.veces }) })))));
    }
    if (dosModalidades.length) {
      // Una pregunta por persona: en cuál de sus inscripciones queda, o
      // «todavía no decido» (queda en las dos), que es como viene. Cada una
      // en su tarjeta: el nombre arriba, el centro debajo y las opciones como
      // botones; la tarjeta dice con letra (no solo con color) si ya se decidió.
      const modo = (x) => tx(x.modalidad === "equipo" ? "grupoEquipos" : "grupoIndividual") + " " + x.categoria;
      const sinDecidir = dosModalidades.filter((d, k) => !s.dondeQueda.has(k)).length;
      caja.append(
        el("h5", { class: "font-semibold text-sm mt-3", texto: tx("dosModalidadesSub") }),
        el("p", { class: "text-sm mt-1" },
          el("span", { id: "pi-dm-faltan", class: "pi-sello mr-2 " + (sinDecidir ? "pi-sello-falta" : "pi-sello-listo"),
            texto: sinDecidir ? tx("dosModalidadesFaltan", { n: sinDecidir }) : "✓ " + tx("dosModalidadesListo") }),
          tx("dosModalidadesTexto")));
      const lista = el("div", { id: "pi-dos-modalidades", class: "mt-2 grid lg:grid-cols-2 gap-2" });
      dosModalidades.forEach((d, k) => {
        const nombre = "pi-dm-" + k;
        const elegida = s.dondeQueda.has(k) ? s.dondeQueda.get(k) : -1;
        const opcion = (valor, texto) => {
          const id = nombre + "-" + (valor < 0 ? "x" : valor);
          return el("label", { class: "pi-dm-opcion" },
            el("input", { type: "radio", name: nombre, id, value: String(valor), checked: valor === elegida, onchange: () => {
              if (valor < 0) s.dondeQueda.delete(k); else s.dondeQueda.set(k, valor);
              calcularSugerencia(); pintarSugerencia(); $(id).focus();
            } }),
            el("span", { texto }));
        };
        const estado = elegida < 0 ? tx("dosModalidadesPendiente") : tx("dosModalidadesQueda", { m: modo(d.inscripciones[elegida]) });
        lista.append(el("fieldset", { class: "pi-dm-tarjeta" + (elegida < 0 ? "" : " pi-dm-lista") },
          el("legend", { class: "sr-only", texto: tx("dosModalidadesCaso", { n: d.jugador.nombre, i: d.jugador.institucion || "—", m: d.inscripciones.map(modo).join(" y ") }) }),
          el("div", { "aria-hidden": "true" },
            el("p", { class: "font-semibold text-sm leading-snug", texto: d.jugador.nombre }),
            el("p", { class: "text-xs text-brand-600 dark:text-brand-300", texto: (d.jugador.institucion || "—") + " · " + d.inscripciones.map(modo).join(" y ") })),
          el("p", { class: "text-xs font-semibold mt-1 " + (elegida < 0 ? "pi-dm-pendiente" : ""), texto: (elegida < 0 ? "⏳ " : "✓ ") + estado }),
          el("div", { class: "flex flex-wrap gap-1.5 mt-2" },
            d.inscripciones.map((x, i) => opcion(i, tx("dosModalidadesDejar", { m: modo(x) }))),
            opcion(-1, tx("dosModalidadesNoDecido")))));
      });
      caja.append(lista);
    }
    return caja;
  }

  // Quien viene en las listas de dos Direcciones Regionales (al subir juntos
  // los clasificados de varias, en la Interregional): es un error de una de
  // ellas, y lo resuelve el árbitro con las dos. Queda una sola inscripción.
  function pintarVariosOrigenes(s) {
    const varios = (s.limpia && s.limpia.variosOrigenes) || [];
    if (!varios.length) return null;
    return el("div", { id: "pi-varios-origenes", class: "pi-revisar" },
      el("h4", { class: "pi-revisar-titulo", texto: tx("origenesTitulo") }),
      el("p", { class: "text-sm mt-1", texto: tx("origenesTexto", { n: varios.length }) }),
      el("ul", { id: "pi-origenes-lista", class: "mt-1 space-y-1 text-sm list-disc pl-5" }, varios.map((x) =>
        el("li", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }),
          tx("origenesCaso", { n: x.jugador.nombre, i: x.jugador.institucion || "—", o: x.origenes.join(" " + tx("y") + " ") })))));
  }

  // La inscripción contra los clasificados de la etapa anterior: quién se
  // inscribió sin haber clasificado (queda para revisar antes de la ronda 1)
  // y quién clasificó y no viene.
  function pintarComparacion(s) {
    const c = s.comparacion;
    if (!c) return null;
    const persona = (j) => j.nombre + " (" + (j.institucion || "—") + ")";
    const caja = el("div", { id: "pi-comparacion", class: "pi-revisar" },
      el("h4", { class: "pi-revisar-titulo", texto: tx("compTitulo") }));
    if (!c.noClasificaron.length && !c.faltan.length) { caja.append(el("p", { class: "text-sm mt-1", texto: tx("compIgual") })); return caja; }
    if (c.noClasificaron.length) caja.append(el("p", { class: "text-sm mt-1", texto: tx("compNoClasificaron", { n: c.noClasificaron.length }) }),
      el("ul", { id: "pi-comp-no", class: "mt-1 space-y-1 text-sm list-disc pl-5" }, c.noClasificaron.map((j) => el("li", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }), persona(j)))));
    if (c.faltan.length) caja.append(el("p", { class: "text-sm mt-2", texto: tx("compFaltan", { n: c.faltan.length }) }),
      el("ul", { id: "pi-comp-faltan", class: "mt-1 space-y-1 text-sm list-disc pl-5" }, c.faltan.map((j) => el("li", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }), persona(j)))));
    return caja;
  }

  // Elegir los cinco de cada equipo que se pasa: una casilla por integrante,
  // y con cinco marcados las demás no se pueden marcar.
  // Los mismos controles para los dos topes: los equipos de más de cinco y
  // los centros con más de dos en un torneo individual.
  function pintarEquiposDeMas(s) {
    return pintarTopes(s, s.equipos, { id: "pi-equipos-de-mas", casilla: "pi-eq-", titulo: "equiposTitulo", texto: "equiposTexto", resumen: "equiposResumen", maximo: G.JDE_MAX_EQUIPO });
  }
  function pintarIndividualesDeMas(s) {
    return pintarTopes(s, s.individuales, { id: "pi-individuales-de-mas", casilla: "pi-ind-", titulo: "individualesTitulo", texto: "individualesTexto", resumen: "individualesResumen", maximo: G.JDE_MAX_INDIVIDUAL });
  }
  function pintarTopes(s, cuales, o) {
    if (!cuales.length) return null;
    const caja = el("div", { id: o.id, class: "pi-revisar" });
    const fuera = cuales.reduce((a, e) => a + e.integrantes.length - s.elegidos.get(e.eleccion).size, 0);
    caja.append(
      el("h4", { class: "pi-revisar-titulo", texto: tx(o.titulo, { m: o.maximo }) }),
      el("p", { class: "text-sm mt-1", texto: tx(o.texto, { m: o.maximo, d: fuera }) }));
    cuales.forEach((e, k) => {
      const elegidos = s.elegidos.get(e.eleccion);
      const lleno = elegidos.size >= o.maximo;
      const detalles = el("details", { class: "mt-2", "data-equipo": e.clave, open: s.abiertos.has(e.clave) });
      detalles.addEventListener("toggle", () => { if (detalles.open) s.abiertos.add(e.clave); else s.abiertos.delete(e.clave); });
      detalles.append(el("summary", { class: "cursor-pointer text-sm font-semibold rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
        texto: tx(o.resumen, { i: e.institucion || "—", c: e.categoria, t: tx(e.torneo === "w" ? "grupoMujeres" : "grupoAbierto"), n: e.integrantes.length, e: elegidos.size, m: o.maximo }) }));
      const ul = el("ul", { class: "mt-1 space-y-1 text-sm pl-2" });
      e.integrantes.forEach((j, i) => {
        const id = o.casilla + k + "-" + i;
        const si = elegidos.has(j);
        ul.append(el("li", { class: "flex items-start gap-2" },
          el("input", { type: "checkbox", id, class: "mt-1", checked: si, disabled: !si && lleno, onchange: (ev) => {
            if (ev.target.checked) elegidos.add(j); else elegidos.delete(j);
            calcularSugerencia(); pintarSugerencia(); $(id).focus();
          } }),
          el("label", { for: id, texto: j.nombre + (si ? "" : " — " + tx("equiposDescartado")) })));
      });
      detalles.append(ul);
      caja.append(detalles);
    });
    return caja;
  }

  // Las mujeres de equipos que no alcanzan para un equipo propio (art.
  // 66.1.g) y pasan al abierto de su centro, con la casilla para no hacerlo.
  function pintarPaseAbierto(s) {
    const { pasadas, sinAbierto } = s.pase;
    if (!pasadas.length && !sinAbierto.length) return null;
    const caja = el("div", { id: "pi-pase-abierto", class: "pi-revisar" });
    caja.append(el("h4", { class: "pi-revisar-titulo", texto: tx("paseTitulo") }));
    const nombres = (c) => c.mujeres.map((j) => j.nombre).join(", ");
    if (pasadas.length) {
      caja.append(
        el("p", { class: "text-sm mt-1", texto: tx("paseTexto", { m: G.JDE_MIN_EQUIPO }) }),
        el("label", { class: "flex items-start gap-2 text-sm mt-2" },
          el("input", { type: "checkbox", id: "pi-pase-abierto-si", class: "mt-1", checked: s.pasarMujeres, onchange: (e) => {
            s.pasarMujeres = e.target.checked; calcularSugerencia(); pintarSugerencia(); $("pi-pase-abierto-si").focus();
          } }),
          el("span", { class: "font-semibold", texto: tx("paseCasilla", { n: pasadas.reduce((a, c) => a + c.mujeres.length, 0) }) })),
        el("ul", { id: "pi-pase-lista", class: "mt-2 space-y-1 text-sm list-disc pl-5" }, pasadas.map((c) =>
          el("li", { texto: tx(c.mujeres.length === 1 ? "paseUna" : "paseDos", { i: c.institucion || "—", c: c.categoria, n: nombres(c), a: c.abierto, t: c.abierto + c.mujeres.length }) }))));
    }
    if (sinAbierto.length) {
      caja.append(el("p", { class: C.nota + " mt-2", texto: tx("paseSinAbierto") }),
        el("ul", { id: "pi-pase-sin", class: "mt-1 space-y-1 text-sm list-disc pl-5" }, sinAbierto.map((c) =>
          el("li", { texto: tx("paseSinAbiertoCaso", { i: c.institucion || "—", c: c.categoria, n: nombres(c) }) }))));
    }
    return caja;
  }

  function etiquetaGrupo(g) {
    const partes = [];
    if (g.modalidad) partes.push(tx(g.modalidad === "equipo" ? "grupoEquipos" : "grupoIndividual"));
    else if (estado.sugerencia.dimensiones.includes("modalidad")) partes.push(tx("grupoSinModalidad"));
    if (g.categoria) partes.push(tx("grupoCategoria", { c: g.categoria }));
    else if (estado.sugerencia.dimensiones.includes("categoria")) partes.push(tx("grupoSinCategoria"));
    if (g.sexo) partes.push(tx(g.sexo === "w" ? "grupoMujeres" : "grupoAbierto"));
    else if (estado.sugerencia.dimensiones.includes("sexo")) partes.push(tx("grupoSinSexo"));
    return partes.join(" · ");
  }

  function pintarSugerencia() {
    const caja = $("pi-sugerencia");
    const s = estado.sugerencia;
    caja.replaceChildren();
    caja.hidden = !s;
    if (!s) return;
    const marcados = s.grupos.filter((g) => g.marcado).length;
    const nombresDim = { modalidad: tx("dimensionModalidad"), categoria: tx("dimensionCategoria"), sexo: tx("dimensionSexo") };
    const dims = s.dimensiones.map((d) => nombresDim[d]);
    const unidas = dims.length > 1 ? dims.slice(0, -1).join(", ") + " " + tx("y") + " " + dims[dims.length - 1] : dims[0];
    // Una sección por modalidad (Individual, Equipos) y en cada una una
    // tarjeta por grupo: la categoría y el sexo en grande, cuántos son a la
    // derecha y, abajo, el sistema sugerido. La modalidad no se repite en
    // cada tarjeta (va en el título de la sección), pero sigue en el texto
    // para el lector de pantalla (sr-only).
    const porModalidad = s.dimensiones.includes("modalidad");
    const secciones = new Map();
    s.grupos.forEach((g, i) => {
      const k = porModalidad ? (g.modalidad || "") : "";
      if (!secciones.has(k)) secciones.set(k, []);
      secciones.get(k).push([g, i]);
    });
    const tarjeta = (g, i) => {
      // En equipos se empareja por equipos: el sistema sale de cuántos hay.
      const nEquipos = g.modalidad === "equipo" ? equiposDelGrupo(g) : 0;
      const n = g.jugadores.length;
      const sistema = G.sistemaSugerido(nEquipos || n);
      const id = "pi-sugerencia-g" + i;
      const etiqueta = etiquetaGrupo(g);
      const sinModalidad = porModalidad ? etiqueta.split(" · ").slice(1).join(" · ") : etiqueta;
      const prefijo = porModalidad ? etiqueta.split(" · ")[0] + " · " : "";
      return el("li", { class: "pi-sug-tarjeta" + (g.marcado ? " pi-sug-si" : "") + (sistema ? "" : " pi-sug-no") },
        el("input", { type: "checkbox", id, class: "mt-1 shrink-0", checked: g.marcado, onchange: (e) => { g.marcado = e.target.checked; pintarSugerencia(); $(id).focus(); } }),
        el("label", { for: id, class: "flex-1 min-w-0" },
          el("span", { class: "flex flex-wrap items-baseline justify-between gap-x-3" },
            el("span", { class: "font-semibold text-base" }, prefijo ? el("span", { class: "sr-only", texto: prefijo }) : null, sinModalidad),
            el("span", { class: "sr-only", texto: " — " }),
            el("span", { class: "pi-sug-cuantos", texto: tx(n === 1 ? "grupoUnJugador" : "grupoJugadores", { n }) + (nEquipos ? " " + tx(nEquipos === 1 ? "grupoUnEquipo" : "grupoEnEquipos", { e: nEquipos }) : "") })),
          el("span", { class: "block text-sm mt-0.5 " + (sistema ? "text-brand-600 dark:text-brand-300" : "font-semibold") },
            el("span", { class: "sr-only", texto: " · " }),
            sistema ? tx(sistema === "todos" ? "sugeridoTodos" : "sugeridoSuizo", { r: G.JDE_RONDAS_SUIZO }) : tx("grupoNoAlcanza"))));
    };
    const listas = [...secciones].map(([k, xs]) => {
      const jugadores = xs.reduce((a, [g]) => a + g.jugadores.length, 0);
      return el("section", { class: "mt-4" },
        k || porModalidad ? el("h4", { class: "font-semibold flex flex-wrap items-baseline gap-x-2" },
          tx(k === "equipo" ? "grupoEquipos" : k ? "grupoIndividual" : "grupoSinModalidad"),
          el("span", { class: C.nota, texto: tx("sugSeccionCuenta", { t: xs.length, n: jugadores }) })) : null,
        el("ul", { class: "mt-2 grid sm:grid-cols-2 xl:grid-cols-3 gap-2 text-sm" }, xs.map(([g, i]) => tarjeta(g, i))));
    });
    const lista = el("div", {}, listas);
    const noAlcanzan = s.grupos.filter((g) => !G.sistemaSugerido(g.modalidad === "equipo" ? equiposDelGrupo(g) : g.jugadores.length)).length;
    const hayEquipos = s.grupos.some((g) => g.modalidad === "equipo");
    const porSexo = s.dimensiones.includes("sexo");
    // Lo que hay que revisar, abajo: un índice arriba para ir directo a
    // cada parte (con una inscripción grande la propuesta es larga).
    const partes = [pintarRepetidos(s), pintarVariosOrigenes(s), pintarComparacion(s), pintarPaseAbierto(s), pintarEquiposDeMas(s),
      pintarIndividualesDeMas(s), pintarHombresEnMujeres(s), pintarEquiposCortos(s), pintarRevisionCategorias(s.revision)].filter(Boolean);
    const indice = partes.length ? el("nav", { id: "pi-sugerencia-indice", class: "mt-3 text-sm rounded-lg bg-accent-50 dark:bg-brand-800 border border-accent-300 dark:border-brand-700 p-2", "aria-label": tx("sugerenciaIndice") },
      el("span", { class: "font-semibold mr-1", texto: tx("sugerenciaIndice") + ":" }),
      partes.map((x) => {
        const h = x.querySelector("h4");
        x.tabIndex = -1;
        return el("button", { type: "button", class: C.mini + " mr-1 mb-1", "data-ir": x.id, onclick: () => { x.scrollIntoView({ block: "start" }); x.focus({ preventScroll: true }); } }, h ? h.textContent : x.id);
      })) : null;
    // El resumen en números, arriba, antes de la explicación.
    const cifra = (n, texto) => el("span", { class: "pi-sug-cifra" }, el("strong", { texto: String(n) }), " " + texto);
    caja.append(...[
      el("h3", { id: "pi-sugerencia-titulo", class: "font-serif text-lg font-bold", texto: tx("sugerenciaTitulo", { n: s.grupos.length }) }),
      el("p", { class: "text-sm mt-1", texto: tx("sugerenciaTexto", { total: s.juegan.length, d: unidas }) }),
      el("div", { id: "pi-sug-resumen", class: "flex flex-wrap gap-2 mt-2" },
        cifra(s.juegan.length, tx("sugCifraJugadores")), cifra(marcados, tx("sugCifraCrear")),
        noAlcanzan ? cifra(noAlcanzan, tx("sugCifraNoAlcanzan")) : null),
      indice,
      s.siguiente ? el("p", { id: "pi-sugerencia-siguiente", class: "text-sm mt-2 font-semibold", texto: tx("sugerenciaSiguiente", { d: tx(TEXTO_ETAPA[s.siguiente.desde]), e: tx(TEXTO_ETAPA[s.siguiente.etapa]) }) }) : null,
      el("fieldset", {}, el("legend", { class: "sr-only", texto: tx("sugerenciaLeyenda") }), lista),
      ...partes,
      // Cómo se arman: se lee una vez, así que va plegado.
      el("details", { id: "pi-sugerencia-como", class: "mt-4" },
        el("summary", { class: "cursor-pointer text-sm font-semibold rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto: tx("sugerenciaComo") }),
        porSexo ? el("p", { class: C.nota + " mt-2", texto: tx("sugerenciaAbierto") }) : null,
        hayEquipos ? el("p", { class: C.nota + " mt-2", texto: tx("sugerenciaEquipos") }) : null,
        el("p", { class: C.nota + " mt-2", texto: tx("sugerenciaNormativa", { r: G.JDE_RONDAS_SUIZO, ritmo: G.JDE_RITMO_MINIMO }) }),
        el("p", { class: C.nota + " mt-2", texto: s.configJde ? tx("sugerenciaNombreJde") : tx("sugerenciaNombre", { b: t().nombre.trim() || s.base }) })),
      el("label", { class: "flex items-start gap-2 text-sm mt-3" },
        el("input", { type: "checkbox", id: "pi-config-jde", class: "mt-1", checked: s.configJde, onchange: (e) => { s.configJde = e.target.checked; pintarSugerencia(); $("pi-config-jde").focus(); } }),
        el("span", {}, el("span", { class: "font-semibold", texto: tx("configJdeCasilla") }), " " + tx("configJdeAyuda", { r: G.JDE_RONDAS_SUIZO, ritmo: G.JDE_RITMO_MINIMO }))),
      sinRivales(s).length >= 2 ? el("label", { class: "flex items-start gap-2 text-sm mt-3" },
        el("input", { type: "checkbox", id: "pi-amistoso", class: "mt-1", checked: s.amistoso, onchange: (e) => { s.amistoso = e.target.checked; pintarSugerencia(); $("pi-amistoso").focus(); } }),
        el("span", {}, el("span", { class: "font-semibold", texto: tx("amistosoCasilla", { n: sinRivales(s).length }) }), " " + tx("amistosoAyuda"))) : null,
      el("div", { class: "flex flex-wrap gap-2 mt-3" },
        el("button", { type: "button", id: "pi-sugerencia-crear", class: C.boton, disabled: marcados === 0, onclick: crearTorneosDeGrupos, texto: tx("sugerenciaCrear", { n: marcados }) }),
        el("button", { type: "button", id: "pi-sugerencia-todos", class: C.botonSec, onclick: () => { const l = s.juegan; estado.sugerencia = null; pintarSugerencia(); agregarTodos(l); }, texto: tx("sugerenciaTodosAqui", { n: s.juegan.length }) }),
        el("button", { type: "button", id: "pi-sugerencia-descartar", class: C.botonSec, onclick: () => { estado.sugerencia = null; pintarSugerencia(); Avisos.avisar(tx("sugerenciaDescartada"), { tipo: "info" }); }, texto: tx("sugerenciaDescartar") }))].flat().filter(Boolean));
  }

  // Lo que dice la revisión de categoría por año (art. 17 y 18): cada caso
  // escrito entero, con «Permitido» o «No permitido» al frente (el color de
  // la lista nunca va solo).
  function pintarRevisionCategorias(r) {
    if (!r || (!r.revisados && !r.sinFecha.length)) return null;
    const caja = el("div", { id: "pi-revision-categorias", class: "pi-revisar" });
    const enSuCategoria = r.revisados - r.permitidos.length - r.noPermitidos.length;
    caja.append(
      el("h4", { class: "pi-revisar-titulo", texto: tx("catTitulo") }),
      el("p", { class: "text-sm mt-1", texto: tx("catResumen", { n: r.revisados, ok: enSuCategoria, p: r.permitidos.length, x: r.noPermitidos.length }) }));
    if (r.anio !== r.normativa) caja.append(el("p", { class: C.nota + " mt-1", texto: tx("catOtroAnio", { a: r.anio, b: r.normativa }) }));
    // Cada caso, con «Permitido» o «No permitido» al frente y el nombre en
    // negrita; agrupados por motivo, cada grupo plegable con cuántos son
    // (con muchos, la lista no tapa todo lo demás).
    const CLAVE = { mayor: "catMayor", individual: "catIndividual", salto: "catSalto", tope: "catTope", "": "catPermitido" };
    const GRUPO_CAT = { mayor: "catGrupoMayor", individual: "catGrupoIndividual", salto: "catGrupoSalto", tope: "catGrupoTope", permitido: "catGrupoPermitido" };
    const caso = (c) => {
      const j = c.jugador;
      const v = { n: j.nombre, i: j.institucion || "—", a: c.nace, p: c.propia, c: c.categoria, d: c.desde, k: c.cuantos, m: G.JDE_MAX_ASCENSOS };
      const texto = tx(CLAVE[c.motivo || ""], v);
      const resto = texto.startsWith(j.nombre) ? texto.slice(j.nombre.length) : " " + texto;
      return el("li", {}, el("span", { class: "pi-cat-sello", texto: tx(c.motivo ? "catNoPermitido" : "catSiPermitido") + " " }),
        el("strong", { texto: texto.startsWith(j.nombre) ? j.nombre : "" }), resto);
    };
    const porMotivo = (lista, id) => {
      const grupos = new Map();
      for (const c of lista) { const k = c.motivo || ""; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(c); }
      return el("div", { id, class: "mt-2 space-y-2" }, [...grupos].map(([k, cs]) => el("details", { class: "rounded-lg border border-brand-100 dark:border-brand-800 px-3 py-2", open: cs.length <= 5 },
        el("summary", { class: "cursor-pointer text-sm font-semibold rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" },
          tx(k ? "catNoPermitido" : "catSiPermitido") + " " + tx(GRUPO_CAT[k || "permitido"]), el("span", { class: "pi-sug-cifra ml-2", texto: String(cs.length) })),
        el("ul", { class: "mt-2 space-y-1 text-sm list-disc pl-5" }, cs.map(caso)))));
    };
    if (r.noPermitidos.length) caja.append(porMotivo(r.noPermitidos, "pi-cat-no"));
    if (r.permitidos.length) caja.append(porMotivo(r.permitidos, "pi-cat-si"));
    if (r.sinFecha.length) caja.append(el("p", { class: C.nota + " mt-2", texto: tx("catSinFecha", { n: r.sinFecha.length }) }));
    return caja;
  }

  // Un torneo por cada grupo marcado, con los datos del que está abierto
  // (ciudad, fechas, árbitros, ritmo, puntos, desempates) y el sistema
  // sugerido por la normativa de los JDE: el suizo con al menos 5 rondas y,
  // si el abierto no tiene ritmo, el mínimo que pide. Si el abierto está vacío —sin jugadores ni rondas— se usa para
  // el primer grupo, en vez de dejar un torneo «(sin nombre)» de más.
  // Los que se quedan sin torneo por falta de rivales (un grupo de uno, o
  // un solo equipo en su categoría): juegan juntos un torneo individual,
  // «Categoría Amistoso», para no irse a la casa sin jugar. No clasifica ni
  // suma medallas al medallero (V.clasificados, V.medallero).
  const sinRivales = (s) => s.grupos.filter((g) => !g.marcado && !G.sistemaSugerido(participantesDelGrupo(g))).flatMap((g) => g.jugadores);

  async function crearTorneosDeGrupos() {
    const s = estado.sugerencia;
    const elegidos = s.grupos.filter((g) => g.marcado);
    const amistosos = s.amistoso ? sinRivales(s) : [];
    if (amistosos.length >= 2) elegidos.push({ modalidad: "individual", jugadores: amistosos, amistoso: true });
    if (!elegidos.length) return;
    const actual = t();
    // Con la configuración de los JDE, primero la etapa y el lugar: el
    // nombre de cada torneo sale de ahí.
    let jde = null;
    if (s.configJde) {
      jde = await pedirEtapaJde(s.siguiente ? { etapa: s.siguiente.etapa } : actual.jde, s.region);
      if (!jde || estado.sugerencia !== s || t() !== actual) return;
      // En la Interregional, una Dirección Regional que no es de esa
      // interregional casi siempre es un archivo equivocado: se pregunta.
      const inter = jde.etapa === "interregional" && G.JDE_INTERREGIONALES.find((x) => x.numero === jde.lugar);
      const ajenas = inter ? [...new Set(s.region.map((r) => G.direccionDe(r)).filter((d) => d && !inter.regiones.includes(d)))] : [];
      if (ajenas.length) {
        const ok = await Avisos.confirmar(tx("interregionalAjena", { d: ajenas.join(", "), i: G.nombreInterregional(inter) }), { aceptar: tx("interregionalAjenaSi") });
        if (!ok || estado.sugerencia !== s || t() !== actual) return;
      }
    }
    const base = actual.nombre.trim() || s.base;
    // El evento: lo que tienen en común los torneos que se crean ahora, con
    // las decisiones del árbitro en la sugerencia (para el acta del
    // congresillo, js/pareo/evento.js). Cada torneo guarda su copia.
    const evento = { id: "e" + nuevoId(), nombre: jde ? G.nombreEventoJde(jde) : base, jde: jde || undefined,
      creado: window.HoraCR ? HoraCR.hoy() : "", decisiones: decisionesDe(s) };
    if (!jde) delete evento.jde;
    // Con la configuración de los JDE (la casilla, marcada de entrada), cada
    // torneo lleva la suya según cuántos juegan; sin ella, copia las rondas,
    // el ritmo, los puntos y los desempates del abierto tal cual.
    const comunes = {
      ciudad: actual.ciudad, provincia: actual.provincia, federacion: actual.federacion, fechaInicio: actual.fechaInicio, fechaFin: actual.fechaFin,
      arbitro: actual.arbitro, arbitroAdjunto: actual.arbitroAdjunto, ritmo: actual.ritmo, validoElo: actual.validoElo,
      colorInicial: actual.colorInicial, baku: actual.baku, rondasTotales: actual.rondasTotales,
      puntos: Object.assign({}, actual.puntos), desempates: actual.desempates.slice(),
    };
    const reusar = !actual.jugadores.length && !actual.rondas.length;
    apagarEnVivo();
    const ids = [];
    elegidos.forEach((g, i) => {
      const jugadores = g.jugadores.map((j) => Object.assign({ id: idJugador(), retiradoDespuesDe: null }, soloJugador(j)));
      // Un grupo de equipos es un torneo por equipos: un participante por
      // centro educativo, con sus integrantes en el orden de la inscripción
      // (que es el orden de tableros hasta que el árbitro lo cambie).
      const deEquipos = g.modalidad === "equipo";
      const participantes = deEquipos ? E.armarEquipos(jugadores, idJugador) : jugadores;
      const n = participantes.length;
      const grupo = g.amistoso ? tx("amistosoGrupo") : etiquetaGrupo(g);
      const datos = Object.assign({}, comunes, {
        nombre: jde ? nombreConGrupo(jde, grupo) : (base ? base + " — " : "") + grupo,
        grupo, jde: jde || undefined, evento, ordenEnEvento: i,
        sistema: G.sistemaSugerido(n) || "suizo",
      }, deEquipos ? { puntos: Object.assign({}, E.PUNTOS_EQUIPOS), desempates: E.desempatesPara(G.sistemaSugerido(n) || "suizo") } : {},
      s.configJde ? configuracionPara(n, actual, deEquipos, jde.etapa) : {}, {
        tipo: deEquipos ? "equipos" : undefined, tableros: deEquipos ? E.TABLEROS : undefined,
        jugadores: participantes,
        rondas: [], numeracion: null,
      });
      if (!deEquipos) { delete datos.tipo; delete datos.tableros; }
      if (g.amistoso) datos.amistoso = true;
      if (!jde) delete datos.jde;
      if (i === 0 && reusar) estado.t = T.nuevo(Object.assign({}, actual, datos));
      else { estado.id = nuevoId(); estado.t = T.nuevo(datos); }
      guardar();
      ids.push(estado.id);
    });
    // Se guardaron en el mismo milisegundo: «Mis torneos» (el más reciente
    // arriba) los mostraría en cualquier orden. Quedan en el de la sugerencia.
    const ahora = Date.now();
    ids.forEach((id, i) => { const x = estado.lista.find((y) => y.id === id); if (x) x.actualizado = ahora - i; });
    escribir(CLAVE_LISTA, JSON.stringify(estado.lista));
    abrir(ids[0]);
    estado.ficha = "jugadores";
    escribir(CLAVE_FICHA, "jugadores");
    pintarTodo();
    Avisos.avisar(tx("torneosCreados", { n: ids.length }));
  }

  // ---------- Repetir un evento ----------
  // El evento del año pasado (o de la etapa anterior) como punto de partida:
  // los mismos torneos, con su configuración, sus plazos y el horario del
  // día, pero sin jugadores, rondas, fechas ni nada de lo que pasó ese día
  // (actas, firmas, incidencias, publicación, enlaces). Se copia campo por
  // campo, nunca el torneo entero: lo que no está en esta lista no viaja.
  // Ver «Repetir un evento» en docs/decisiones/juegos-y-torneos.md.
  const COPIA_REPETIR = ["grupo", "ciudad", "provincia", "federacion", "arbitro", "arbitroAdjunto", "ritmo", "validoElo", "sistema", "dobleVuelta",
    "rondasTotales", "colorInicial", "baku", "tipo", "tableros", "amistoso", "ordenEnEvento", "mesaInicial", "configLibre", "plazoAlineacion"];
  // «Abierto 2025» → «Abierto 2026»: el año del evento viejo en el nombre.
  const conAnio = (texto, viejo, nuevo) => (viejo && viejo !== nuevo ? String(texto || "").replace(new RegExp("\\b" + viejo + "\\b", "g"), nuevo) : String(texto || ""));
  async function repetirEvento(ev, torneos) {
    if (!torneos.length) return;
    const ok = await Avisos.confirmar(tx("repetirEventoPregunta", { n: torneos.length }), { aceptar: tx("repetirEventoSi"), cancelar: tx("repetirEventoNo") });
    if (!ok) return;
    const hoy = window.HoraCR ? HoraCR.hoy() : "";
    const anioNuevo = hoy.slice(0, 4);
    const anioViejo = String((ev.jde && ev.jde.anio) || (torneos[0].fechaInicio || ev.creado || "").slice(0, 4));
    const jde = ev.jde ? Object.assign({}, ev.jde, { anio: anioNuevo ? Number(anioNuevo) || anioNuevo : ev.jde.anio }) : undefined;
    const evento = { id: "e" + nuevoId(), nombre: jde ? G.nombreEventoJde(jde) : conAnio(ev.nombre, anioViejo, anioNuevo), creado: hoy, decisiones: {} };
    if (jde) evento.jde = jde;
    apagarEnVivo();
    const ids = [];
    torneos.forEach((y) => {
      const datos = { evento, jugadores: [], rondas: [], numeracion: null, fechaInicio: "", fechaFin: "",
        puntos: Object.assign({}, y.puntos), desempates: (y.desempates || []).slice() };
      for (const k of COPIA_REPETIR) if (y[k] !== undefined) datos[k] = y[k];
      if (jde) { datos.jde = jde; datos.nombre = nombreConGrupo(jde, y.grupo); }
      else datos.nombre = conAnio(y.nombre, anioViejo, anioNuevo);
      estado.id = nuevoId();
      estado.t = T.nuevo(datos);
      estado.ultimoGuardado = null;
      guardar();
      ids.push(estado.id);
    });
    // El horario del día (hora de inicio y descanso) es del evento.
    for (const sufijo of ["", "_descanso"]) {
      const x = leer(CLAVE_HORARIO + ev.id + sufijo);
      if (x) escribir(CLAVE_HORARIO + evento.id + sufijo, x);
    }
    const ahora = Date.now();
    ids.forEach((id, i) => { const x = estado.lista.find((z) => z.id === id); if (x) x.actualizado = ahora - i; });
    escribir(CLAVE_LISTA, JSON.stringify(estado.lista));
    abrir(ids[0]);
    estado.ficha = "torneo";
    escribir(CLAVE_FICHA, "torneo");
    pintarTodo();
    Avisos.avisar(tx("repetirEventoListo", { n: ids.length, e: evento.nombre }), { duracion: 12000 });
  }

  // Lo que decidió el árbitro en la sugerencia, en texto llano y en español
  // (va al acta, que es un documento oficial del MEP).
  function decisionesDe(s) {
    const es = (clave, vars) => X.t("es", clave, vars);
    const MODO = { equipo: "Equipos", individual: "Individual" };
    const TORNEO = { w: "Mujeres", m: "Abierto" };
    const modo = (x) => (MODO[x.modalidad] || MODO.individual) + " " + x.categoria;
    const grupoDe = (e, equipo) => (equipo ? MODO.equipo : MODO.individual) + " · Categoría " + e.categoria + " · " + (TORNEO[e.torneo] || TORNEO.m);
    const limpia = s.limpia || { repetidos: [], dosModalidades: [] };
    const descartados = [];
    for (const e of s.equipos.concat(s.individuales)) {
      const elegidos = s.elegidos.get(e.eleccion);
      for (const j of e.integrantes) if (!elegidos.has(j)) descartados.push({ nombre: j.nombre, institucion: e.institucion, grupo: grupoDe(e, e.tipo === "eq") });
    }
    const r = s.revision || { permitidos: [], noPermitidos: [] };
    const caso = (c) => {
      const j = c.jugador;
      const v = { n: j.nombre, i: j.institucion || "—", a: c.nace, p: c.propia, c: c.categoria, d: c.desde, k: c.cuantos, m: G.JDE_MAX_ASCENSOS };
      const clave = c.motivo ? { mayor: "catMayor", individual: "catIndividual", salto: "catSalto", tope: "catTope" }[c.motivo] : "catPermitido";
      return es(c.motivo ? "catNoPermitido" : "catSiPermitido") + " " + es(clave, v);
    };
    return {
      repetidos: limpia.repetidos.map((x) => ({ nombre: x.jugador.nombre, institucion: x.jugador.institucion || "—", veces: x.veces })),
      dosModalidades: limpia.dosModalidades.map((d, k) => ({
        nombre: d.jugador.nombre, institucion: d.jugador.institucion || "—", inscripciones: d.inscripciones.map(modo).join(" y "),
        queda: s.dondeQueda.has(k) ? modo(d.inscripciones[s.dondeQueda.get(k)]) : "",
      })),
      pase: s.pasarMujeres ? s.pase.pasadas.map((c) => ({ institucion: c.institucion || "—", categoria: c.categoria, nombres: c.mujeres.map((j) => j.nombre).join(", ") })) : [],
      descartados,
      cortos: (s.cortos || []).map((e) => ({ institucion: e.institucion || "—", grupo: grupoDe(e, true), cuantos: e.integrantes.length, nombres: e.integrantes.map((j) => j.nombre).join(", ") })),
      categorias: r.noPermitidos.concat(r.permitidos).map(caso),
      hombresEnMujeres: (s.hombresEnMujeres || []).map((j) => j.nombre + " (" + (j.institucion || "—") + ")"),
      variosOrigenes: (limpia.variosOrigenes || []).map((x) => ({ nombre: x.jugador.nombre, institucion: x.jugador.institucion || "—", origenes: x.origenes.join(" y ") })),
      comparacion: s.comparacion ? {
        noClasificaron: s.comparacion.noClasificaron.map((j) => j.nombre + " (" + (j.institucion || "—") + ")"),
        faltan: s.comparacion.faltan.map((j) => j.nombre + " (" + (j.institucion || "—") + ")"),
      } : undefined,
      // Lo que el árbitro tiene que marcar como visto antes de emparejar la
      // ronda 1 de cada torneo (js/pareo/evento.js: pendientes). Sin texto
      // armado: se escribe en el idioma de la página al mostrarlo.
      revisar: [].concat(
        limpia.dosModalidades.filter((d, k) => !s.dondeQueda.has(k)).map((d) => ({ tipo: "dosModalidades", personas: [d.jugador.nombre],
          vars: { n: d.jugador.nombre, i: d.jugador.institucion || "—", m: d.inscripciones.map(modo).join(" / ") } })),
        (limpia.variosOrigenes || []).map((x) => ({ tipo: "origenes", personas: [x.jugador.nombre], vars: { n: x.jugador.nombre, i: x.jugador.institucion || "—", o: x.origenes.join(" / ") } })),
        r.noPermitidos.map((c) => ({ tipo: "categoria", motivo: c.motivo, personas: [c.jugador.nombre],
          vars: { n: c.jugador.nombre, i: c.jugador.institucion || "—", a: c.nace, p: c.propia, c: c.categoria, d: c.desde, k: c.cuantos, m: G.JDE_MAX_ASCENSOS } })),
        (s.hombresEnMujeres || []).map((j) => ({ tipo: "hombre", personas: [j.nombre], vars: { n: j.nombre, i: j.institucion || "—" } })),
        (s.comparacion ? s.comparacion.noClasificaron : []).map((j) => ({ tipo: "noClasifico", personas: [j.nombre], vars: { n: j.nombre, i: j.institucion || "—" } })),
        (s.cortos || []).map((e) => ({ tipo: "corto", personas: e.integrantes.map((j) => j.nombre), vars: { i: e.institucion || "—", k: e.integrantes.length, m: G.JDE_MIN_EQUIPO } }))),
    };
  }

  // Lo que hay que revisar antes de la ronda 1, escrito.
  const TEXTO_REVISAR = { dosModalidades: "revisarDosModalidades", origenes: "revisarOrigenes", hombre: "revisarHombre", corto: "revisarCorto", noClasifico: "revisarNoClasifico" };
  const MOTIVO_CATEGORIA = { mayor: "catMayor", individual: "catIndividual", salto: "catSalto", tope: "catTope" };
  const textoRevisar = (x) => (x.tipo === "categoria" ? tx("catNoPermitido") + " " + tx(MOTIVO_CATEGORIA[x.motivo], x.vars) : tx(TEXTO_REVISAR[x.tipo], x.vars));
  const claveRevisar = (x) => x.tipo + "|" + x.personas.join(",");
  // Cuántos puntos de la revisión siguen sin marcar en un torneo (0 si ya
  // arrancó: después de la ronda 1 la revisión no detiene nada).
  const sinRevisar = (v) => {
    if (v.rondas.length) return 0;
    const vistos = new Set(v.revisadoAntes || []);
    return V.pendientes(v).filter((x) => !vistos.has(claveRevisar(x))).length;
  };

  // ---------- El evento: acta, informe y clasificados ----------
  // Los torneos del mismo evento que el abierto, en el orden en que se
  // crearon (el de la sugerencia). El abierto, con lo último que tiene.
  function torneosDelEvento(idEvento) {
    const id = idEvento || (t().evento && t().evento.id);
    if (!id) return [];
    const otros = estado.lista.map((x) => {
      const y = x.id === estado.id ? t() : leerJSON(PREFIJO + x.id, null);
      if (y && !Object.prototype.hasOwnProperty.call(y, "__id")) Object.defineProperty(y, "__id", { value: x.id });
      return y;
    }).filter((x) => x && x.evento && x.evento.id === id);
    return otros.sort((a, b) => (a.ordenEnEvento || 0) - (b.ordenEnEvento || 0));
  }

  // Guardar un torneo del evento que puede no ser el abierto.
  // Quien pierde por incomparecencia queda fuera de las rondas que siguen
  // hasta que el árbitro lo vuelva a poner (js/pareo/torneo.js). En un torneo
  // por equipos no: ahí la incomparecencia es de un tablero o del encuentro.
  const retirosAuto = (v) => (E.esDeEquipos(v) ? { fuera: [], vuelven: [] } : T.retirosPorIncomparecencia(v));
  function avisarRetiros(v, x) {
    const nombres = (ids) => ids.map((id) => (v.jugadores.find((j) => j.id === id) || {}).nombre || "?").join(", ");
    if (x.fuera.length) Avisos.avisar(tx("incomparecenciaFuera", { n: nombres(x.fuera), r: v.rondas.length + 1 }), { tipo: "info" });
    if (x.vuelven.length) Avisos.avisar(tx("incomparecenciaVuelve", { n: nombres(x.vuelven) }), { tipo: "info" });
  }

  // ---------- Que cerrar la página por accidente no borre nada ----------
  // Todo cambio ya se guarda al momento en el navegador (guardar). Lo que
  // quedaba fuera: lo escrito en un campo sin salir de él, el jugador o la
  // lista a medio escribir, lo marcado antes de emparejar (v.pedidas) y el
  // archivo del respaldo automático. Y que el navegador no borre los datos
  // por falta de espacio: se le pide guardarlos para siempre (persist).
  function pedirAlmacenamientoFijo() {
    if (estado.persistencia || !navigator.storage || !navigator.storage.persist) return;
    estado.persistencia = true;
    navigator.storage.persist().catch(() => {});
  }
  // Lo escrito en los datos del torneo se guarda mientras se escribe (no
  // solo al salir del campo).
  let temporizadorCampo = null, campoPendiente = null;
  function alEscribirTorneo(e) {
    const x = e.target;
    if (!x.name || x.type === "number" || x.type === "radio" || x.type === "checkbox" || x.tagName === "SELECT" || x.readOnly) return;
    clearTimeout(temporizadorCampo);
    campoPendiente = x;
    temporizadorCampo = setTimeout(guardarCampoPendiente, 500);
  }
  function guardarCampoPendiente() {
    clearTimeout(temporizadorCampo);
    temporizadorCampo = null;
    const x = campoPendiente;
    campoPendiente = null;
    if (x && x.isConnected) alCambiarTorneo({ target: x });
  }
  // El jugador y la lista a medio escribir: un borrador por torneo.
  const CLAVE_BORRADOR = "pareo_borrador_v1";
  function guardarBorrador() {
    const d = {};
    for (const x of $("pi-form-jugador").elements) if (x.name && x.value) d[x.name] = x.value;
    const pegar = $("pi-pegar").value;
    if (!Object.keys(d).length && !pegar.trim()) { escribir(CLAVE_BORRADOR, ""); return; }
    escribir(CLAVE_BORRADOR, JSON.stringify({ id: estado.id, jugador: d, pegar }));
  }
  function restaurarBorrador() {
    const b = leerJSON(CLAVE_BORRADOR, null);
    if (!b || b.id !== estado.id) return;
    const f = $("pi-form-jugador");
    for (const [k, val] of Object.entries(b.jugador || {})) if (f.elements[k]) f.elements[k].value = val;
    if (b.pegar) { $("pi-pegar").value = b.pegar; $("pi-pegar-caja").open = true; }
    Avisos.avisar(tx("borradorRecuperado"), { tipo: "info" });
  }
  // Al cerrar o esconder la pestaña: lo que estaba por guardarse, ya.
  function guardarAlSalir() {
    if (campoPendiente) guardarCampoPendiente();
    guardarBorrador();
  }

  // El archivo del respaldo automático se recuerda (IndexedDB guarda el
  // permiso de Chrome y Edge): al volver a abrir, un clic lo retoma.
  const BD_RESPALDO = "pareo-respaldo";
  function bdRespaldo(modo, fn) {
    return new Promise((ok, mal) => {
      if (!window.indexedDB) { ok(null); return; }
      const pedido = indexedDB.open(BD_RESPALDO, 1);
      pedido.onupgradeneeded = () => pedido.result.createObjectStore("archivos");
      pedido.onerror = () => mal(pedido.error);
      pedido.onsuccess = () => {
        try {
          const tx2 = pedido.result.transaction("archivos", modo);
          const r = fn(tx2.objectStore("archivos"));
          tx2.oncomplete = () => ok(r && "result" in r ? r.result : null);
          tx2.onerror = () => mal(tx2.error);
        } catch (e) { mal(e); } // (un archivo que no se puede guardar: no se recuerda)
      };
    });
  }
  const recordarArchivoRespaldo = (id, archivo) => bdRespaldo("readwrite", (s) => (archivo ? s.put(archivo, id) : s.delete(id))).catch(() => null);
  const archivoRecordado = (id) => bdRespaldo("readonly", (s) => s.get(id)).catch(() => null);
  async function retomarRespaldo(ev, archivo) {
    try {
      if ((await archivo.requestPermission({ mode: "readwrite" })) !== "granted") return;
    } catch (e) { return; }
    estado.respaldoArchivo = { id: ev.id, archivo };
    await escribirRespaldo();
    pintarEvento();
    Avisos.avisar(tx("respaldoRetomado", { a: archivo.name }));
  }

  function guardarDelEvento(tor) {
    if (tor === t() || tor.__id === estado.id) { guardar(); return true; }
    const ok = escribir(PREFIJO + tor.__id, JSON.stringify(tor));
    if (!ok) Avisos.avisar(tx("noGuarda"), { tipo: "error" });
    return ok;
  }

  // Los PDF de Pareo Integral llevan arriba el nombre y el logo de la
  // organización de este navegador, si tiene (la marca de agua sigue siendo
  // la de Ajedrez Integral). Si el logo no se puede armar, sale con el nombre.
  async function conOrganizacion(doc) {
    const o = organizacion();
    if (!o || !o.nombre || doc.cabecera) return doc;
    let logo = null;
    if (o.logo && window.MarcaAgua && window.MarcaAgua.prepararDesdeDatos) {
      try { logo = await window.MarcaAgua.prepararDesdeDatos(o.logo); } catch (e) { logo = null; }
    }
    return Object.assign({}, doc, { cabecera: { nombre: o.nombre, color: "#102a43", logo } });
  }
  function bajarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: nombre });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function bajarDocumento(doc, sufijo, boton) {
    if (boton) boton.disabled = true;
    try {
      bajarBlob(await window.PareoPDF.generar(await conOrganizacion(doc)), window.PareoPDF.nombreArchivo(doc.subtitulo, sufijo));
    } catch (e) {
      Avisos.avisar(tx("noPdf", { e: e.message }), { tipo: "error" });
    } finally {
      if (boton) boton.disabled = false;
    }
  }

  // El historial de cambios de este torneo y «Deshacer el último cambio».
  // Vive en esta pestaña: al recargar la página empieza de cero.
  function pintarHistorial() {
    const caja = $("pi-historial");
    const lista = estado.historial.get(estado.id) || [];
    caja.replaceChildren(el("h3", { class: "font-semibold", texto: tx("histTitulo") }),
      el("p", { class: C.nota, texto: tx("histTexto") }));
    if (!lista.length) { caja.append(el("p", { class: C.nota + " mt-1", texto: tx("histVacio") })); return; }
    const b = el("button", { type: "button", id: "pi-deshacer", class: C.botonSec + " mt-2" }, tx("histDeshacer"));
    b.addEventListener("click", deshacerUltimo);
    caja.append(b, el("ol", { id: "pi-historial-lista", class: "mt-2 space-y-1 text-sm list-decimal pl-6" }, lista.slice().reverse().map((x) =>
      el("li", { texto: horaCR(x.hora) + " · " + x.cambios.slice(0, 4).map((c) => tx(c.clave, c.vars)).join("; ") + (x.cambios.length > 4 ? " (+" + (x.cambios.length - 4) + ")" : "") }))));
  }
  async function deshacerUltimo() {
    const lista = estado.historial.get(estado.id) || [];
    const x = lista[lista.length - 1];
    if (!x) return;
    const ok = await Avisos.confirmar(tx("histConfirmar", { c: x.cambios.map((c) => tx(c.clave, c.vars)).join("; ") }), { aceptar: tx("histDeshacer") });
    if (!ok || lista[lista.length - 1] !== x) return;
    lista.pop();
    estado.t = T.nuevo(JSON.parse(x.antes));
    estado.deshaciendo = true;
    guardar();
    estado.deshaciendo = false;
    pintarTodo();
    Avisos.avisar(tx("histDeshecho"));
  }

  // ---------- Dos pestañas con el mismo torneo ----------
  // Cada pestaña dice cuál torneo tiene abierto; si otra tiene el mismo, o
  // si otra pestaña lo guardó por debajo (el evento «storage» llega solo a
  // las demás), se avisa: lo que guarde esta puede pisar lo de la otra.
  const canalPestanas = (() => { try { return new BroadcastChannel("pareo-pestanas"); } catch (e) { return null; } })();
  const yo = "p" + Math.random().toString(36).slice(2);
  function avisarPestanas() { if (canalPestanas && estado.id) canalPestanas.postMessage({ yo, id: estado.id }); }
  function otraPestana(clave) {
    const caja = $("pi-otra-pestana");
    // «La otra guardó cambios» es más grave que «está abierta en otra»: no
    // se tapa con el aviso más leve (los dos llegan en cualquier orden).
    if (clave === "pestanaMisma" && !caja.hidden && caja.dataset.aviso === "pestanaCambio") return;
    caja.dataset.aviso = clave;
    const recargar = el("button", { type: "button", id: "pi-otra-cargar", class: C.botonSec + " mt-2" }, tx("pestanaCargar"));
    recargar.addEventListener("click", () => { if (abrir(estado.id)) { caja.hidden = true; pintarTodo(); } });
    caja.replaceChildren(el("p", { class: "font-semibold", texto: tx(clave) }), recargar);
    caja.hidden = false;
  }
  if (canalPestanas) canalPestanas.addEventListener("message", (e) => {
    const d = e.data || {};
    if (d.yo === yo || d.id !== estado.id) return;
    otraPestana("pestanaMisma");
    // Contestar una vez, para que la otra también se entere.
    if (!d.respuesta) canalPestanas.postMessage({ yo, id: estado.id, respuesta: true });
  });
  window.addEventListener("storage", (e) => {
    if (!estado.id || e.key !== PREFIJO + estado.id || e.newValue == null || e.newValue === estado.ultimoGuardado) return;
    otraPestana("pestanaCambio");
  });

  // ---------- El respaldo automático del evento ----------
  // Con un archivo elegido una vez (la API de archivos de Chrome y Edge), el
  // respaldo del evento se escribe solo, unos segundos después de cada
  // cambio. Sin esa API, se baja solo cada vez que se completa una ronda.
  let temporizadorRespaldo = null;
  function programarRespaldo() {
    clearTimeout(temporizadorRespaldo);
    temporizadorRespaldo = setTimeout(escribirRespaldo, 3000);
  }
  async function escribirRespaldo() {
    const r = estado.respaldoArchivo;
    if (!r) return;
    const lista = torneosDelEvento(r.id);
    if (!lista.length) return;
    const texto = JSON.stringify(V.respaldo(lista[0].evento, lista), null, 1);
    try {
      if (r.archivo) {
        const w = await r.archivo.createWritable();
        await w.write(texto);
        await w.close();
      } else {
        // Sin la API: solo cuando una ronda queda completa, y una vez por ronda.
        const clave = lista.map((x) => x.rondas.filter((R) => T.rondaCompleta(R)).length).join(",");
        if (clave === r.ultimaClave) return;
        r.ultimaClave = clave;
        bajar(window.PareoPDF.nombreArchivo(lista[0].evento.nombre, "respaldo").replace(/\.pdf$/, ".json"), texto, "application/json");
      }
      r.hora = Date.now();
      const x = $("pi-respaldo-estado");
      if (x) x.textContent = tx("respaldoAutoHecho", { h: horaCR(r.hora) });
    } catch (e) {
      Avisos.avisar(tx("respaldoAutoError", { e: e.message }), { tipo: "error" });
    }
  }
  async function prenderRespaldo(ev) {
    if (window.showSaveFilePicker) {
      try {
        const archivo = await window.showSaveFilePicker({ suggestedName: window.PareoPDF.nombreArchivo(ev.nombre, "respaldo").replace(/\.pdf$/, ".json"), types: [{ description: "JSON", accept: { "application/json": [".json"] } }] });
        estado.respaldoArchivo = { id: ev.id, archivo };
        recordarArchivoRespaldo(ev.id, archivo);
      } catch (e) { return; }
    } else {
      const lista = torneosDelEvento(ev.id);
      estado.respaldoArchivo = { id: ev.id, archivo: null, ultimaClave: lista.map((x) => x.rondas.filter((R) => T.rondaCompleta(R)).length).join(",") };
    }
    await escribirRespaldo();
    pintarEvento();
  }

  // Las ausencias y las incomparecencias de los torneos del evento
  // (V.ausenciasDe), con si justificó: lo anota el árbitro y va al informe
  // oficial. Se guarda en cada torneo (`justificaciones`, por «ronda|id»).
  const TEXTO_AUSENCIA = { incomparecencia: "ausTipoIncomparecencia", noViene: "ausTipoNoViene", sinAcreditar: "ausTipoSinAcreditar", bye: "ausTipoBye", sacado: "ausTipoSacado" };
  function pintarAusencias(caja, torneos) {
    const aus = torneos.flatMap((tor) => V.ausenciasDe(tor).map((x) => ({ tor, x })));
    if (!aus.length) return;
    const filas = aus.map(({ tor, x }, k) => {
      const sel = el("select", { id: "pi-aus-" + k, class: C.campoChico, "data-ausencia": x.clave, "aria-label": tx("ausJustificoA", { n: x.nombre, r: x.ronda }) },
        el("option", { value: "", texto: tx("ausSinDecidir") }), el("option", { value: "si", texto: tx("ausSi") }), el("option", { value: "no", texto: tx("ausNo") }));
      sel.value = x.justificada === true ? "si" : x.justificada === false ? "no" : "";
      sel.addEventListener("change", () => {
        tor.justificaciones = Object.assign({}, tor.justificaciones);
        if (sel.value) tor.justificaciones[x.clave] = sel.value === "si";
        else delete tor.justificaciones[x.clave];
        guardarDelEvento(tor);
      });
      const siguio = x.fuera ? tx("ausFuera", { r: x.ronda + 1 }) : x.volvio ? tx("ausVolvio") : "";
      return el("tr", {}, el("td", { texto: V.nombreTorneo(tor) }), el("td", { class: "num", texto: x.ronda }),
        el("td", { class: "font-semibold", texto: x.nombre }), el("td", { texto: tx(TEXTO_AUSENCIA[x.tipo]) + (siguio ? " · " + siguio : "") }), el("td", {}, sel));
    });
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("ausTitulo") }), el("p", { class: C.nota, texto: tx("ausTexto") }),
      el("div", { class: "overflow-x-auto mt-2" }, el("table", { id: "pi-ausencias", class: "pi-tabla" },
        el("thead", {}, el("tr", {}, el("th", { scope: "col", texto: tx("ausTorneo") }), el("th", { class: "num", scope: "col", texto: tx("ausRonda") }),
          el("th", { scope: "col", texto: tx("nombre") }), el("th", { scope: "col", texto: tx("ausQuePaso") }), el("th", { scope: "col", texto: tx("ausJustifico") }))),
        el("tbody", {}, filas))));
  }

  function pintarEvento() {
    pintarHistorial();
    pintarPublicar();
    pintarOrganizacion();
    $("pi-bajar-trf-equipos").hidden = !E.esDeEquipos(t());
    const caja = $("pi-evento");
    caja.replaceChildren();
    const ev = t().evento;
    caja.hidden = !ev;
    if (!ev) return;
    const torneos = torneosDelEvento();
    const n = V.cupo(ev.jde);
    const siguiente = ev.jde ? V.SIGUIENTE[ev.jde.etapa] : null;
    caja.append(
      el("h2", { class: "font-serif text-xl font-bold mb-1", texto: tx("eventoTitulo") }),
      el("p", { class: "font-semibold", texto: ev.nombre }),
      el("p", { class: C.nota + " mb-3", texto: tx("eventoTexto", { n: torneos.length }) }));
    const acciones = el("div", { class: "flex flex-wrap gap-2" });
    const bActa = el("button", { type: "button", id: "pi-evento-acta", class: C.boton }, tx("eventoActa"));
    bActa.addEventListener("click", () => bajarDocumento(V.acta(ev, torneosDelEvento()), "acta-congresillo", bActa));
    const bInforme = el("button", { type: "button", id: "pi-evento-informe", class: C.botonSec }, tx("eventoInforme"));
    bInforme.addEventListener("click", () => bajarDocumento(V.informe(ev, torneosDelEvento()), "informe-oficial", bInforme));
    const bPremiacion = el("button", { type: "button", id: "pi-evento-premiacion", class: C.botonSec }, tx("eventoPremiacion"));
    bPremiacion.addEventListener("click", () => bajarDocumento(V.premiacion(ev, torneosDelEvento()), "premiacion", bPremiacion));
    const bDiplomas = el("button", { type: "button", id: "pi-evento-diplomas", class: C.botonSec }, tx("eventoDiplomas"));
    bDiplomas.addEventListener("click", () => imprimirDiplomas(V.diplomas(ev, torneosDelEvento())));
    const bEstadisticas = el("button", { type: "button", id: "pi-evento-estadisticas", class: C.botonSec }, tx("eventoEstadisticas"));
    bEstadisticas.addEventListener("click", () => {
      window.TablaExcel.bajar(window.PareoPDF.nombreArchivo(ev.nombre, "estadisticas").replace(/\.pdf$/, ".xlsx"), V.estadisticas(ev, torneosDelEvento()));
    });
    const bConstancias = el("button", { type: "button", id: "pi-evento-constancias", class: C.botonSec }, tx("eventoConstancias"));
    bConstancias.addEventListener("click", () => imprimirConstancias(V.constancias(ev, torneosDelEvento())));
    const bCertificados = el("button", { type: "button", id: "pi-evento-certificados", class: C.botonSec }, tx("eventoCertificados"));
    bCertificados.addEventListener("click", () => imprimirCertificadosArbitro(V.certificadosArbitro(ev, torneosDelEvento())));
    const bCartel = el("button", { type: "button", id: "pi-evento-cartel", class: C.botonSec }, tx("eventoCartel"));
    bCartel.addEventListener("click", () => imprimirCartel(ev));
    const bRepetir = el("button", { type: "button", id: "pi-evento-repetir", class: C.botonSec }, tx("repetirEvento"));
    bRepetir.addEventListener("click", () => repetirEvento(ev, torneosDelEvento()));
    acciones.append(bActa, bInforme, bPremiacion, bDiplomas, bConstancias, bCertificados, bEstadisticas, bCartel, bRepetir);
    caja.append(acciones, el("p", { class: C.nota + " mt-2", texto: tx("eventoPapelesAyuda") }),
      el("p", { class: C.nota + " mt-1", texto: tx("eventoPremiacionAyuda") }));
    pintarAusencias(caja, torneos);

    // El medallero por centro educativo, con las medallas de todos los torneos.
    const med = V.medallero(torneos);
    if (med.length) {
      caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("medalleroTitulo") }),
        el("p", { class: C.nota, texto: tx("medalleroTexto") }),
        el("div", { class: "overflow-x-auto mt-2" }, el("table", { id: "pi-medallero", class: "pi-tabla" },
          el("thead", {}, el("tr", {}, el("th", { class: "num", scope: "col", texto: tx("puesto") }), el("th", { scope: "col", texto: tx("institucion") }),
            el("th", { class: "num", scope: "col", texto: tx("oro") }), el("th", { class: "num", scope: "col", texto: tx("plata") }),
            el("th", { class: "num", scope: "col", texto: tx("bronce") }), el("th", { class: "num", scope: "col", texto: tx("total") }))),
          el("tbody", {}, med.map((x, i) => el("tr", {}, el("td", { class: "num", texto: i + 1 }), el("td", { class: "font-semibold", texto: x.centro }),
            el("td", { class: "num", texto: x.oro }), el("td", { class: "num", texto: x.plata }), el("td", { class: "num", texto: x.bronce }), el("td", { class: "num", texto: x.total })))))));
    }

    // Por Dirección Regional, cuando el evento junta varias (la Interregional).
    const dres = V.porDireccion(torneos, n);
    if (dres.length > 1) {
      caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("porDreTitulo") }),
        el("div", { class: "overflow-x-auto mt-2" }, el("table", { id: "pi-por-dre", class: "pi-tabla" },
          el("thead", {}, el("tr", {}, el("th", { scope: "col", texto: tx("porDreRegion") }), el("th", { class: "num", scope: "col", texto: tx("porDreEstudiantes") }),
            el("th", { class: "num", scope: "col", texto: tx("oro") }), el("th", { class: "num", scope: "col", texto: tx("plata") }),
            el("th", { class: "num", scope: "col", texto: tx("bronce") }), el("th", { class: "num", scope: "col", texto: tx("porDreClasifican") }))),
          el("tbody", {}, dres.map((x) => el("tr", {}, el("td", { class: "font-semibold", texto: x.region }), el("td", { class: "num", texto: x.estudiantes }),
            el("td", { class: "num", texto: x.oro }), el("td", { class: "num", texto: x.plata }), el("td", { class: "num", texto: x.bronce }), el("td", { class: "num", texto: x.clasifican })))))));
    }

    // El horario del día: la hora de cada ronda según el ritmo de cada torneo.
    const inicio = el("input", { id: "pi-horario-inicio", type: "time", value: leer(CLAVE_HORARIO + ev.id) || "08:00", class: C.campoChico });
    const descanso = el("input", { id: "pi-horario-descanso", type: "number", min: "0", max: "120", value: leer(CLAVE_HORARIO + ev.id + "_descanso") || "10", inputmode: "numeric", class: C.campoChico + " w-20" });
    const listaHorario = el("ul", { id: "pi-horario-lista", class: "mt-2 space-y-1 text-sm" });
    const pintarHorario = () => {
      escribir(CLAVE_HORARIO + ev.id, inicio.value);
      escribir(CLAVE_HORARIO + ev.id + "_descanso", descanso.value);
      listaHorario.replaceChildren(...V.horario(torneosDelEvento(), inicio.value, descanso.value).map((x) => el("li", {},
        el("span", { class: "font-semibold", texto: x.torneo + ": " }),
        x.dura ? x.rondas.map((rr) => tx("rondaN", { r: rr.n }) + " " + rr.hora).join(" · ") : tx("horarioSinRitmo"))));
    };
    // Al cambiarlo, el enlace del evento recibe las horas nuevas (la cuenta
    // regresiva de la próxima ronda).
    inicio.addEventListener("change", () => { pintarHorario(); difundirEvento(); });
    descanso.addEventListener("change", () => { pintarHorario(); difundirEvento(); });
    const bHorario = el("button", { type: "button", id: "pi-horario-imprimir", class: C.botonSec }, tx("horarioImprimir"));
    bHorario.addEventListener("click", () => imprimirHorario(ev, V.horario(torneosDelEvento(), inicio.value, descanso.value)));
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("horarioTitulo") }),
      el("p", { class: C.nota, texto: tx("horarioTexto") }),
      el("div", { class: "flex flex-wrap items-end gap-3 mt-2" },
        el("label", { class: "text-sm" }, el("span", { class: "block font-semibold", texto: tx("horarioInicio") }), inicio),
        el("label", { class: "text-sm" }, el("span", { class: "block font-semibold", texto: tx("horarioDescanso") }), descanso),
        bHorario),
      listaHorario);
    pintarHorario();

    // Lo que falta revisar antes de la ronda 1, en todo el evento.
    const conPendientes = torneos.map((x) => [x, sinRevisar(x)]).filter(([, k]) => k > 0);
    if (conPendientes.length) {
      caja.append(el("div", { id: "pi-evento-revisar", class: "mt-4" },
        el("p", { class: "text-sm font-semibold", texto: tx("cortosAviso") + " " + tx("eventoRevisar") }),
        el("ul", { class: "list-disc pl-6 text-sm" }, conPendientes.map(([x, k]) => el("li", { texto: (x.grupo || x.nombre) + ": " + k })))));
    }

    // Para chess-results: el TRF de cada torneo, en un .zip. chess-results no
    // recibe archivos directo: se abren en Swiss-Manager y se suben desde ahí.
    const bChess = el("button", { type: "button", id: "pi-evento-chess", class: C.botonSec }, tx("chessBajar"));
    bChess.addEventListener("click", () => {
      const lista = torneosDelEvento();
      const partes = [];
      const faltan = [];
      for (const x of lista) {
        const k = x.rondas.filter((R) => T.rondaCompleta(R)).length;
        const nombre = window.PareoPDF.nombreArchivo(x.grupo || x.nombre, "").replace(/-?\.pdf$/, "");
        try {
          partes.push({ nombre: nombre + ".trf", texto: T.aTrf(x, { hasta: k }) });
          if (E.esDeEquipos(x)) partes.push({ nombre: nombre + "-equipos.trf", texto: E.aTrfEquipos(x, k) });
        } catch (e) { faltan.push(x.grupo || x.nombre); }
      }
      if (!partes.length) { Avisos.avisar(tx("chessNada"), { tipo: "error" }); return; }
      bajar(window.PareoPDF.nombreArchivo(ev.nombre, "chess-results").replace(/\.pdf$/, ".zip"), window.TablaExcel.zip(partes), "application/zip");
      Avisos.avisar(tx("chessListo", { n: partes.length }) + (faltan.length ? " " + tx("chessFaltan", { t: faltan.join(", ") }) : ""));
    });
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("chessTitulo") }),
      el("p", { class: C.nota, texto: tx("chessTexto") }), el("div", { class: "mt-2" }, bChess));

    // Comparado con el año anterior (los torneos de chess-results que ya
    // tiene «Ajedrez estudiantil en Costa Rica»).
    if (ev.jde && ev.jde.etapa !== "institucional") {
      const cajaAnio = el("div", { id: "pi-anio-anterior", class: "mt-2" });
      const bAnio = el("button", { type: "button", id: "pi-evento-anio", class: C.botonSec }, tx("anioBoton", { a: ev.jde.anio - 1 }));
      bAnio.addEventListener("click", () => compararAnio(ev, cajaAnio, bAnio));
      caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("anioTitulo") }),
        el("p", { class: C.nota, texto: tx("anioTexto") }), el("div", { class: "mt-2" }, bAnio), cajaAnio);
    }

    // El cierre: lo que falta, y el paquete final en un .zip.
    const cierre = V.revisarCierre(ev, torneos);
    const faltan = cierre.filter((x) => x.problemas.length);
    const bCierre = el("button", { type: "button", id: "pi-evento-cierre", class: faltan.length ? C.botonSec : C.boton }, tx("cierreBajar"));
    bCierre.addEventListener("click", async () => {
      if (faltan.length) {
        const ok = await Avisos.confirmar(tx("cierreIgual", { n: faltan.length }), { aceptar: tx("cierreBajarIgual") });
        if (!ok) return;
      }
      bajarPaquete(ev, bCierre);
    });
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("cierreTitulo") }),
      el("p", { class: C.nota, texto: tx("cierreTexto") }),
      faltan.length
        ? el("ul", { id: "pi-cierre-faltan", class: "mt-2 space-y-1 text-sm list-disc pl-6" }, faltan.map((x) => el("li", {},
          el("span", { class: "font-semibold", texto: x.torneo + ": " }), x.problemas.map((p) => tx(p.clave, p.vars)).join(" · "))))
        : el("p", { id: "pi-cierre-listo", class: "text-sm font-semibold mt-2", texto: tx("cierreListo") }),
      el("div", { class: "mt-2" }, bCierre));

    // El enlace en vivo de todo el evento: un solo QR para el público.
    const vivo = estado.eventoVivo && estado.eventoVivo.id === ev.id;
    const qr = el("div", { id: "pi-evento-qr", class: "mt-3" });
    const bVivo = el("button", { type: "button", id: "pi-evento-vivo", class: vivo ? C.botonSec : C.boton, "aria-pressed": vivo ? "true" : "false" },
      tx(vivo ? "eventoVivoApagar" : "eventoVivoPrender"));
    bVivo.addEventListener("click", async () => {
      if (estado.eventoVivo && estado.eventoVivo.id === ev.id) apagarEventoVivo();
      else if (!(await prenderEventoVivo(ev))) return;
      pintarEvento();
      const b = $("pi-evento-vivo");
      if (b) b.focus();
    });
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("eventoVivoTitulo") }),
      el("p", { class: C.nota, texto: tx("eventoVivoTexto") }), el("div", { class: "mt-2" }, bVivo), qr);
    if (vivo) mostrarQrEvento(qr);

    // El respaldo: todos los torneos del evento en un solo archivo.
    const bRespaldo = el("button", { type: "button", id: "pi-evento-respaldo", class: C.botonSec }, tx("eventoRespaldo"));
    bRespaldo.addEventListener("click", () => {
      const lista = torneosDelEvento();
      bajar(window.PareoPDF.nombreArchivo(ev.nombre, "respaldo").replace(/\.pdf$/, ".json"), JSON.stringify(V.respaldo(ev, lista), null, 1), "application/json");
      Avisos.avisar(tx("eventoRespaldoListo", { n: lista.length }));
    });
    const auto = estado.respaldoArchivo && estado.respaldoArchivo.id === ev.id;
    const bAuto = el("button", { type: "button", id: "pi-respaldo-auto", class: C.botonSec, "aria-pressed": auto ? "true" : "false" },
      tx(auto ? "respaldoAutoApagar" : (window.showSaveFilePicker ? "respaldoAutoPrender" : "respaldoAutoPrenderDescarga")));
    bAuto.addEventListener("click", () => {
      if (estado.respaldoArchivo && estado.respaldoArchivo.id === ev.id) { estado.respaldoArchivo = null; recordarArchivoRespaldo(ev.id, null); pintarEvento(); }
      else prenderRespaldo(ev);
    });
    // Se cerró la página con el respaldo prendido: un clic lo retoma en el
    // mismo archivo (el navegador pide el permiso otra vez).
    const bRetomar = el("button", { type: "button", id: "pi-respaldo-retomar", class: C.boton, hidden: true });
    if (!auto && window.showSaveFilePicker) archivoRecordado(ev.id).then((archivo) => {
      if (!archivo || !bRetomar.isConnected || estado.respaldoArchivo) return;
      bRetomar.textContent = tx("respaldoRetomar", { a: archivo.name });
      bRetomar.hidden = false;
      bRetomar.onclick = () => retomarRespaldo(ev, archivo);
    });
    // Las firmas del acta: en esta pantalla (con el dedo o el mouse) o desde
    // un celular, con su enlace. Van como imagen en el PDF del acta.
    const firmas = ev.firmas || [];
    const listaFirmas = el("ul", { id: "pi-firmas-lista", class: "mt-2 space-y-1 text-sm" }, firmas.map((f, k) => el("li", { class: "flex flex-wrap items-center gap-2" },
      el("span", { texto: (V.CARGOS_FIRMA[f.cargo] || f.cargo) + ": " + f.nombre + " · " + horaCR(f.hora) }),
      el("button", { type: "button", class: C.mini, "data-quitar-firma": String(k), onclick: () => { guardarFirmas(ev.id, firmas.filter((x, i) => i !== k)); pintarEvento(); } }, tx("quitar")))));
    const bFirmar = el("button", { type: "button", id: "pi-firmar-aqui", class: C.botonSec }, tx("firmarAqui"));
    bFirmar.addEventListener("click", async () => {
      const f = await pedirFirma();
      if (!f) return;
      guardarFirmas(ev.id, (t().evento.firmas || []).concat(f));
      pintarEvento();
      Avisos.avisar(tx("firmaGuardada", { n: f.nombre }));
    });
    const firmando = estado.firmaCelular && estado.firmaCelular.id === ev.id;
    const bCelular = el("button", { type: "button", id: "pi-firmar-celular", class: C.botonSec, "aria-pressed": firmando ? "true" : "false" }, tx(firmando ? "firmarCelularApagar" : "firmarCelular"));
    bCelular.addEventListener("click", async () => {
      if (estado.firmaCelular && estado.firmaCelular.id === ev.id) { estado.firmaCelular.canal.unsubscribe(); estado.firmaCelular = null; }
      else await prenderFirmaCelular(ev);
      pintarEvento();
      const b = $("pi-firmar-celular"); if (b) b.focus();
    });
    const cajaFirmaCel = el("div", { id: "pi-firma-celular-caja", class: "mt-2" });
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("firmasTitulo") }),
      el("p", { class: C.nota, texto: tx("firmasTexto") }), listaFirmas,
      el("div", { class: "mt-2 flex flex-wrap gap-2" }, bFirmar, bCelular), cajaFirmaCel);
    if (firmando) mostrarFirmaCelular(cajaFirmaCel);

    // El informe para la prensa: un texto corto para pegar.
    const cajaPrensa = el("div", { id: "pi-prensa-caja", class: "mt-2" });
    const bPrensa = el("button", { type: "button", id: "pi-evento-prensa", class: C.botonSec }, tx("prensaArmar"));
    bPrensa.addEventListener("click", () => {
      const texto = V.informePrensa(ev, torneosDelEvento(), window.HoraCR.dia(Date.now()));
      const area = el("textarea", { id: "pi-prensa-texto", rows: "12", readonly: true, class: C.campo + " font-mono text-xs mt-2", "aria-label": tx("prensaTitulo") });
      area.value = texto;
      const copiar = el("button", { type: "button", id: "pi-prensa-copiar", class: C.mini + " mt-2" }, tx("prensaCopiar"));
      copiar.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(area.value); Avisos.avisar(tx("prensaCopiado")); }
        catch (e) { area.select(); Avisos.avisar(tx("noCopia"), { tipo: "error" }); }
      });
      cajaPrensa.replaceChildren(area, copiar);
      area.focus();
    });
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("prensaTitulo") }),
      el("p", { class: C.nota, texto: tx("prensaTexto") }), el("div", { class: "mt-2" }, bPrensa), cajaPrensa);

    // Pasar el evento a otra computadora, por el mismo canal que el enlace en
    // vivo: la otra abre la dirección, lo pide y esta pregunta antes de mandarlo.
    const pasando = estado.pasar && estado.pasar.id === ev.id;
    const bPasar = el("button", { type: "button", id: "pi-evento-pasar", class: C.botonSec, "aria-pressed": pasando ? "true" : "false" }, tx(pasando ? "pasarApagar" : "pasarPrender"));
    bPasar.addEventListener("click", async () => {
      if (estado.pasar && estado.pasar.id === ev.id) apagarPasar(); else await prenderPasar(ev);
      pintarEvento();
      const b = $("pi-evento-pasar");
      if (b) b.focus();
    });
    const cajaPasar = el("div", { id: "pi-pasar-caja", class: "mt-2" });
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("pasarTitulo") }),
      el("p", { class: C.nota, texto: tx("pasarTexto") }), el("div", { class: "mt-2" }, bPasar), cajaPasar);
    if (pasando) mostrarPasar(cajaPasar);
    // La inscripción tardía desde el celular de los entrenadores.
    pintarInscripcionCelular(caja, ev);
    // Cuánto duró cada ronda de cada categoría, para el horario del próximo.
    pintarDuraciones(caja, ev);
    // Las mesas de la sala: cada torneo con su rango de mesas físicas, para
    // que ningún número se repita con varias categorías en la misma sala.
    pintarMesasDeLaSala(caja, ev);
    // Las plantillas de la pared de la ronda en juego de TODAS las
    // categorías, en un solo trabajo de impresión (una por hoja).
    const bPlantillas = el("button", { type: "button", id: "pi-evento-plantillas", class: C.botonSec }, tx("eventoPlantillas"));
    bPlantillas.addEventListener("click", () => imprimirPlantillasDelEvento());
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("eventoPlantillasTitulo") }),
      el("p", { class: C.nota, texto: tx("eventoPlantillasTexto") }), el("div", { class: "mt-2" }, bPlantillas));
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("eventoRespaldoTitulo") }),
      el("p", { class: C.nota, texto: tx("eventoRespaldoTexto") }), el("div", { class: "mt-2 flex flex-wrap gap-2" }, bRetomar, bRespaldo, bAuto),
      el("p", { id: "pi-respaldo-estado", class: C.nota + " mt-1", role: "status",
        texto: auto ? (estado.respaldoArchivo.hora ? tx("respaldoAutoHecho", { h: horaCR(estado.respaldoArchivo.hora) }) : tx(window.showSaveFilePicker ? "respaldoAutoActivo" : "respaldoAutoActivoDescarga")) : tx(window.showSaveFilePicker ? "respaldoAutoAyuda" : "respaldoAutoAyudaDescarga") }));

    if (!siguiente || !n) return;
    // Los clasificados: los primeros n de cada torneo (art. 66.1).
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("clasificadosTitulo", { e: tx(TEXTO_ETAPA_SIGUIENTE[siguiente]), n }) }),
      el("p", { class: C.nota, texto: tx("clasificadosTexto", { n }) }));
    const lista = el("div", { id: "pi-clasificados", class: "mt-2 space-y-3" });
    for (const tor of torneos) {
      const c = V.clasificados(tor, n);
      const sec = el("section", { class: "text-sm" }, el("h4", { class: "font-semibold", texto: tor.grupo || tor.nombre }));
      if (!c.filas.length) sec.append(el("p", { class: C.nota, texto: tx("clasificadosSinRondas") }));
      else {
        if (!c.terminado) sec.append(el("p", { class: C.nota, texto: tx("clasificadosProvisional", { r: c.rondas, t: c.total }) }));
        sec.append(el("ol", { class: "list-decimal pl-6" }, c.filas.map((f) => {
          const p = tor.jugadores.find((j) => j.id === f.id);
          return el("li", { texto: p.nombre + " (" + (p.institucion || "—") + ") · " + puntosTexto(f.puntos) });
        })));
        if (c.empate) sec.append(el("p", { class: "font-semibold" }, tx("cortosAviso") + " " + tx("clasificadosEmpate")));
        const empatados = V.empatadosEnCorte(Object.assign({}, tor, { desempateCorte: null }), n);
        if (empatados.length) {
          const resuelto = c.filas.some((f) => f.porDesempate);
          if (resuelto) sec.append(el("p", { class: "text-sm", texto: tx("desempateHecho", { f: tor.desempateCorte.formato || tx("desempateRapido") }) }));
          const b = el("button", { type: "button", class: C.mini + " mt-1", "data-desempate": tor.__id }, tx(resuelto ? "desempateCambiar" : "desempateArmar"));
          b.addEventListener("click", () => armarDesempate(tor, empatados, n));
          sec.append(b);
        }
      }
      lista.append(sec);
    }
    const bLista = el("button", { type: "button", id: "pi-evento-clasificados", class: C.botonSec + " mt-3" }, tx("clasificadosBajar"));
    bLista.addEventListener("click", () => {
      const filas = V.filasClasificados(ev, torneosDelEvento());
      if (!filas.length) { Avisos.avisar(tx("clasificadosNadie"), { tipo: "error" }); return; }
      window.TablaExcel.bajar(window.PareoPDF.nombreArchivo(ev.nombre, "clasificados").replace(/\.pdf$/, ".xlsx"), [{ nombre: "Clasificados", filas: [V.ENCABEZADOS].concat(filas) }]);
    });
    caja.append(lista, bLista, el("p", { class: C.nota + " mt-2", texto: tx("clasificadosAyuda") }));
  }
  const CLAVE_HORARIO = "pareo_horario_v1_";

  async function compararAnio(ev, cont, boton) {
    boton.disabled = true;
    try {
      const r = await fetch("data/ajedrez-estudiantil.json", { cache: "no-cache" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const c = V.compararAnioAnterior(ev, torneosDelEvento(), await r.json());
      if (!c.torneosAntes) { cont.replaceChildren(el("p", { class: "text-sm mt-2", texto: tx("anioNada", { a: c.anio }) })); return; }
      cont.replaceChildren(
        el("p", { class: "text-sm mt-2 font-semibold", texto: tx("anioResumen", { a: c.anio, t: c.torneosAntes, x: c.totalAntes, y: c.totalAhora }) }),
        el("div", { class: "overflow-x-auto mt-2" }, el("table", { id: "pi-anio-tabla", class: "pi-tabla" },
          el("thead", {}, el("tr", {}, el("th", { scope: "col", texto: tx("anioGrupo") }), el("th", { class: "num", scope: "col", texto: String(c.anio) }), el("th", { class: "num", scope: "col", texto: String(c.anio + 1) }))),
          el("tbody", {}, c.filas.map((f) => el("tr", {}, el("td", { texto: f.grupo }), el("td", { class: "num", texto: f.antes == null ? "—" : f.antes }), el("td", { class: "num", texto: f.ahora == null ? "—" : f.ahora })))))),
        el("p", { class: C.nota + " mt-1", texto: tx("anioNota") }));
    } catch (e) {
      cont.replaceChildren(el("p", { class: "text-sm mt-2", texto: tx("anioError", { e: e.message }) }));
    } finally {
      boton.disabled = false;
    }
  }

  // El paquete final del evento: el acta, el informe y la premiación en
  // PDF, los clasificados y las estadísticas en Excel y el respaldo, en un
  // solo .zip (js/tabla-excel.js: zip).
  async function bajarPaquete(ev, boton) {
    boton.disabled = true;
    try {
      const lista = torneosDelEvento();
      const pdf = async (doc) => new Uint8Array(await (await window.PareoPDF.generar(doc)).arrayBuffer());
      const partes = [
        { nombre: "acta-congresillo.pdf", bytes: await pdf(V.acta(ev, lista)) },
        { nombre: "informe-oficial.pdf", bytes: await pdf(V.informe(ev, lista)) },
        { nombre: "premiacion.pdf", bytes: await pdf(V.premiacion(ev, lista)) },
        { nombre: "estadisticas.xlsx", bytes: window.TablaExcel.armar(V.estadisticas(ev, lista)) },
        { nombre: "respaldo.json", texto: JSON.stringify(V.respaldo(ev, lista), null, 1) },
      ];
      const filas = V.filasClasificados(ev, lista);
      if (filas.length) partes.splice(3, 0, { nombre: "clasificados.xlsx", bytes: window.TablaExcel.armar([{ nombre: "Clasificados", filas: [V.ENCABEZADOS].concat(filas) }]) });
      const archivo = window.PareoPDF.nombreArchivo(ev.nombre, "paquete-final").replace(/\.pdf$/, ".zip");
      bajar(archivo, window.TablaExcel.zip(partes), "application/zip");
      Avisos.avisar(tx("cierreBajado", { n: partes.length }));
      // El paquete ya trae el respaldo: se ofrece sacar el evento de la lista.
      const ok = await Avisos.confirmar(tx("cierreArchivar", { n: lista.length, a: archivo }), { aceptar: tx("cierreArchivarSi"), cancelar: tx("cierreArchivarNo") });
      if (ok) {
        quitarArchivados(lista.map((y) => y.__id).filter(Boolean), archivo, lista.map((y) => y.nombre || ""), ev.nombre);
        Avisos.avisar(tx("cierreArchivado", { n: lista.length }));
      }
    } catch (e) {
      Avisos.avisar(tx("noPdf", { e: e.message }), { tipo: "error" });
    } finally {
      boton.disabled = false;
    }
  }

  // El desempate rápido del corte: el formato y el orden en que quedaron.
  // Lo jugado fuera de Pareo Integral (un blitz, un Armagedón) se anota acá
  // y ordena a los empatados (V.aplicarDesempate).
  async function armarDesempate(tor, empatados, n) {
    const nombre = (id) => (tor.jugadores.find((j) => j.id === id) || {}).nombre || "?";
    const opciones = empatados.map((id) => [id, nombre(id)]);
    const previo = (tor.desempateCorte && tor.desempateCorte.orden) || empatados;
    const campos = [{ nombre: "formato", etiqueta: tx("desempateFormato"), valor: (tor.desempateCorte && tor.desempateCorte.formato) || tx("desempateBlitz"), max: 60 }]
      .concat(empatados.map((id, k) => ({ nombre: "p" + k, etiqueta: tx("desempatePuesto", { p: k + 1 }), tipo: "select", opciones, valor: previo[k] || id })));
    const r = await Avisos.formulario({ titulo: tx("desempateTitulo", { t: tor.grupo || tor.nombre }), texto: tx("desempateTexto", { n }), aceptar: tx("desempateGuardar"), cancelar: tx("cancelar"), campos });
    if (!r) return;
    const orden = empatados.map((id, k) => r["p" + k]);
    if (new Set(orden).size !== orden.length) { Avisos.avisar(tx("desempateRepetido"), { tipo: "error" }); return; }
    tor.desempateCorte = { formato: String(r.formato || "").trim().slice(0, 60), orden };
    if (!guardarDelEvento(tor)) return;
    pintarEvento();
    Avisos.avisar(tx("desempateListo"));
  }

  // El horario del día en una hoja, para la pared y las delegaciones.
  function imprimirHorario(ev, horario) {
    const cont = $("pi-firmas");
    cont.replaceChildren();
    const hoja = el("div", { class: "pi-firma-mesa" }, el("h1", { class: "pi-firma-titulo", texto: tx("horarioTitulo") + " — " + ev.nombre }));
    for (const x of horario) {
      hoja.append(el("p", { class: "pi-firma-jugador font-semibold", texto: x.torneo }),
        el("p", { class: "pi-firma-resultado", texto: x.dura ? x.rondas.map((rr) => tx("rondaN", { r: rr.n }) + ": " + rr.hora).join("   ·   ") : tx("horarioSinRitmo") }));
    }
    cont.append(hoja);
    document.body.classList.add("pi-imprimiendo-firmas");
    window.print();
  }

  // Las constancias de participación: como los diplomas, una por hoja.
  function imprimirConstancias(lista) {
    if (!lista.length) { Avisos.avisar(tx("constanciasNadie"), { tipo: "error" }); return; }
    const cont = $("pi-firmas");
    cont.replaceChildren();
    const primero = torneosDelEvento()[0] || {};
    for (const c of lista) {
      const x = V.textoConstancia(c);
      cont.append(el("div", { class: "pi-diploma", lang: "es" },
        el("p", { class: "pi-diploma-evento", texto: x.encabezado }),
        el("p", { class: "pi-diploma-nombre", texto: x.titulo }),
        el("p", { class: "pi-diploma-otorga", texto: x.otorga }),
        el("p", { class: "pi-diploma-nombre", texto: x.nombre }),
        x.centro ? el("p", { class: "pi-diploma-texto", texto: x.centro }) : null,
        el("p", { class: "pi-diploma-texto", texto: x.motivo }),
        el("div", { class: "pi-diploma-firmas" },
          el("p", { class: "pi-firma-linea", texto: "Árbitro principal" + (primero.arbitro ? ": " + primero.arbitro : "") }),
          el("p", { class: "pi-firma-linea", texto: "Comité Organizador" }))));
    }
    document.body.classList.add("pi-imprimiendo-firmas");
    window.print();
  }

  // Los certificados de los árbitros: como las constancias, uno por hoja.
  function imprimirCertificadosArbitro(lista) {
    if (!lista.length) { Avisos.avisar(tx("certificadosNadie"), { tipo: "error" }); return; }
    const cont = $("pi-firmas");
    cont.replaceChildren();
    for (const c of lista) {
      const x = V.textoCertificadoArbitro(c);
      cont.append(el("div", { class: "pi-diploma", lang: "es" },
        el("p", { class: "pi-diploma-evento", texto: x.encabezado }),
        el("p", { class: "pi-diploma-nombre", texto: x.titulo }),
        el("p", { class: "pi-diploma-otorga", texto: x.otorga }),
        el("p", { class: "pi-diploma-nombre", texto: x.nombre }),
        el("p", { class: "pi-diploma-texto", texto: x.motivo }),
        el("div", { class: "pi-diploma-firmas" },
          el("p", { class: "pi-firma-linea", texto: "Comité Organizador" }),
          el("p", { class: "pi-firma-linea", texto: "Comisión de Árbitros" }))));
    }
    document.body.classList.add("pi-imprimiendo-firmas");
    window.print();
  }

  // El cartel para la entrada: el nombre del evento, el QR del enlace en
  // vivo (lo prende si hace falta), el horario y los torneos.
  async function imprimirCartel(ev) {
    if (!(estado.eventoVivo && estado.eventoVivo.id === ev.id)) {
      const ok = await Avisos.confirmar(tx("cartelPrender"), { aceptar: tx("eventoVivoPrender") });
      if (!ok || !(await prenderEventoVivo(ev))) return;
      pintarEvento();
    }
    try { await PareoQr.cargar(); } catch (e) { Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" }); return; }
    const url = location.origin + location.pathname + "#evento=" + estado.eventoVivo.codigo;
    const lista = torneosDelEvento(ev.id);
    const inicio = leer(CLAVE_HORARIO + ev.id);
    const horario = inicio ? V.horario(lista, inicio, leer(CLAVE_HORARIO + ev.id + "_descanso") || "10") : [];
    const cont = $("pi-firmas");
    cont.replaceChildren(el("div", { class: "pi-cartel", lang: "es" },
      el("h1", { class: "pi-cartel-titulo", texto: ev.nombre || "" }),
      el("p", { class: "pi-cartel-texto", texto: "Resultados, rondas y clasificación en vivo: escanea el código con el celular." }),
      el("div", { class: "pi-cartel-qr" }, PareoQr.svg(url, tx("qrEtiqueta"))),
      el("p", { class: "pi-cartel-url", texto: url }),
      horario.some((x) => x.rondas.length) ? el("div", { class: "pi-cartel-horario" },
        el("h2", { texto: "Horario" }),
        el("ul", {}, horario.filter((x) => x.rondas.length).map((x) => el("li", { texto: x.torneo + ": " + x.rondas.map((rr) => "R" + rr.n + " " + rr.hora).join(" · ") })))) : null,
      el("div", { class: "pi-cartel-torneos" },
        el("h2", { texto: "Torneos" }),
        el("ul", {}, lista.map((x) => el("li", { texto: (x.grupo || x.nombre) + " · " + x.jugadores.length + (E.esDeEquipos(x) ? " equipos" : " participantes") }))))));
    document.body.classList.add("pi-imprimiendo-firmas");
    window.print();
  }

  const TEXTO_ETAPA_SIGUIENTE = { regional: "etapaRegional", interregional: "etapaInterregionalNombre", nacional: "etapaNacional" };

  // Un diploma por hoja, apaisado (el texto, de js/pareo/evento.js: en
  // español, como el acta).
  function imprimirDiplomas(lista) {
    if (!lista.length) { Avisos.avisar(tx("diplomasNadie"), { tipo: "error" }); return; }
    const cont = $("pi-firmas");
    cont.replaceChildren();
    const primero = torneosDelEvento()[0] || {};
    for (const d of lista) {
      const x = V.textoDiploma(d);
      cont.append(el("div", { class: "pi-diploma", lang: "es" },
        el("p", { class: "pi-diploma-evento", texto: x.encabezado }),
        el("p", { class: "pi-diploma-otorga", texto: x.otorga }),
        el("p", { class: "pi-diploma-nombre", texto: x.nombre }),
        x.centro ? el("p", { class: "pi-diploma-texto", texto: x.centro }) : null,
        el("p", { class: "pi-diploma-texto", texto: x.motivo }),
        el("div", { class: "pi-diploma-firmas" },
          el("p", { class: "pi-firma-linea", texto: "Árbitro principal" + (primero.arbitro ? ": " + primero.arbitro : "") }),
          el("p", { class: "pi-firma-linea", texto: "Comité Organizador" }))));
    }
    document.body.classList.add("pi-imprimiendo-firmas");
    window.print();
  }

  // ---------- El evento en vivo, desde el celular ----------
  // El mismo canal de Supabase Realtime en modo Broadcast que el de un torneo
  // («El canal en vivo»), con todos los torneos del evento. El código queda
  // guardado por evento: el QR impreso sirve todo el día. Quien abre el
  // enlace pide el estado al entrar («pedir»), así no espera al próximo
  // resultado.
  const CLAVE_VIVO_EVENTO = "pareo_evento_vivo_v1_";
  async function prenderEventoVivo(ev) {
    try { await PareoVer.cargarSupabase(); }
    catch (e) { Avisos.avisar(tx("errorEnVivo", { e: e.message }), { tipo: "error" }); return false; }
    apagarEventoVivo();
    let codigo = leer(CLAVE_VIVO_EVENTO + ev.id);
    if (!codigo) { codigo = nuevoCodigoVivo(); escribir(CLAVE_VIVO_EVENTO + ev.id, codigo); }
    const canal = window.sb.channel("pareo-evento-" + codigo);
    estado.eventoVivo = { id: ev.id, codigo, canal };
    canal.on("broadcast", { event: "pedir" }, () => difundirEvento());
    canal.subscribe((st) => { if (st === "SUBSCRIBED") difundirEvento(); });
    return true;
  }
  function apagarEventoVivo() {
    if (estado.eventoVivo) { estado.eventoVivo.canal.unsubscribe(); estado.eventoVivo = null; }
  }
  function difundirEvento() {
    const x = estado.eventoVivo;
    if (!x) return;
    const lista = torneosDelEvento(x.id);
    if (!lista.length) return;
    // Las horas de cada ronda van solo si quien organiza puso el horario.
    const inicio = leer(CLAVE_HORARIO + x.id);
    const horario = inicio ? V.horario(lista, inicio, leer(CLAVE_HORARIO + x.id + "_descanso") || "10") : null;
    PareoVer.paraMandar(V.vistaEvento(lista[0].evento, lista, horario)).then((payload) => x.canal.send({ type: "broadcast", event: "estado", payload }));
  }
  // `pre`: el prefijo de los ids (la ficha Archivos y la ficha Torneo lo
  // muestran a la vez en la página).
  async function mostrarQrEvento(cont, pre) {
    pre = pre || "pi-evento";
    const url = location.origin + location.pathname + "#evento=" + estado.eventoVivo.codigo;
    try {
      await PareoQr.cargar();
      const copiar = el("button", { type: "button", class: C.mini }, tx("copiarEnlace"));
      copiar.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(url); Avisos.avisar(tx("enlaceCopiado")); }
        catch (e) { Avisos.avisar(tx("noCopia"), { tipo: "error" }); }
      });
      cont.replaceChildren(el("div", { class: "w-48 bg-white p-2 rounded-lg" }, PareoQr.svg(url, tx("qrEtiqueta"))),
        el("p", { id: pre + "-url", class: "text-xs break-all mt-2 font-mono", texto: url }), el("div", { class: "mt-1 flex flex-wrap gap-2" }, copiar,
          el("a", { id: pre + "-proyectar", href: url + "&proyectar", target: "_blank", rel: "noopener", class: C.mini }, tx("eventoProyectar"))),
        el("p", { class: C.nota + " mt-1", texto: tx("eventoVivoActivo") }));
    } catch (e) {
      Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" });
    }
  }

  // El mismo bolsillo de palabras que usa la Edge Function, para emparejar
  // su respuesta (que viene por nombre, no por id) con el jugador de acá.
  function bolsilloNombre(nombre) {
    const limpio = String(nombre || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toUpperCase().replace(/[^A-Z ,]/g, " ").replace(/,/g, " ");
    return limpio.split(/\s+/).filter(Boolean).sort().join(" ");
  }

  const TOPE_BUSQUEDA_ELO = 40;   // el mismo tope que exige la Edge Function

  async function buscarEloNacional() {
    const v = t();
    const todosFaltantes = v.jugadores.filter((j) => !(Number(j.elo) > 0));
    if (!todosFaltantes.length) { Avisos.avisar(tx("sinQuienBuscar")); return; }
    const faltantes = todosFaltantes.slice(0, TOPE_BUSQUEDA_ELO);
    const boton = $("pi-elo-nacional");
    const estadoEl = $("pi-elo-nacional-estado");
    const barraEl = $("pi-elo-barra-caja");
    boton.disabled = true;
    estadoEl.textContent = tx("buscandoElo", { n: faltantes.length });
    // Es UNA sola llamada que solo contesta al terminar (ver elo-nacional.js):
    // no hay un «n de total» real que mostrar sin partirla en varios pedidos,
    // y eso gastaría varias veces el tope por hora del freno por la misma
    // búsqueda. La barra es indeterminada a propósito: nunca un número inventado.
    barraEl.hidden = false;
    const r = await window.PareoEloNacional.buscar(faltantes.map((j) => j.nombre));
    barraEl.hidden = true;
    boton.disabled = false;
    estadoEl.textContent = "";
    if (!r || r.ok === false) { Avisos.avisar((r && r.error) || tx("eloNacionalError"), { tipo: "error" }); return; }
    // Por índice, no por nombre: dos jugadores con el mismo nombre piden la
    // misma búsqueda pero son personas distintas, y el bolsillo de palabras
    // los mezclaría. La función contesta en el mismo orden en que se le manda.
    const resultados = r.resultados || [];
    let n = 0, conId = 0;
    const pendientes = [];
    faltantes.forEach((j, i) => {
      const res = resultados[i];
      if (res && res.estado === "encontrado" && Number(res.nacional) > 0) {
        j.elo = res.nacional; n++;
        // La lista nacional identifica a cada jugador por su ID FIDE: si no
        // lo tenía, queda puesto (el TRF lo necesita para el Elo).
        if (!j.fideId && res.fideId && /^\d{3,11}$/.test(String(res.fideId))) { j.fideId = String(res.fideId); conId++; }
      }
      else pendientes.push({ id: j.id, nombre: j.nombre, estado: (res && res.estado) || "no_encontrado" });
    });
    if (n) guardar();
    estado.eloPendientes = pendientes;
    pintarJugadores();
    Avisos.avisar(tx("eloNacionalResultado", { n: n, total: faltantes.length }) + (conId ? " " + tx("eloNacionalConId", { n: conId }) : ""));
    if (todosFaltantes.length > TOPE_BUSQUEDA_ELO) {
      Avisos.avisar(tx("eloNacionalTope", { tope: TOPE_BUSQUEDA_ELO }), { tipo: "info" });
    }
  }

  async function editarJugador(id) {
    const j = jugador(id);
    const r = await Avisos.formulario({
      titulo: tx("editarA", { n: j.nombre }),
      aceptar: tx("guardarCambios"),
      campos: [
        { nombre: "nombre", etiqueta: tx("nombreJugador"), valor: j.nombre, max: 33 },
        { nombre: "institucion", etiqueta: tx("institucion"), valor: j.institucion || "", max: 80 },
        { nombre: "categoria", etiqueta: tx("categoria"), valor: j.categoria || "", max: 40 },
        { nombre: "elo", etiqueta: "Elo FIDE", valor: String(j.elo || ""), inputmode: "numeric" },
        { nombre: "titulo", etiqueta: tx("titulo"), tipo: "select", valor: j.titulo || "", opciones: [["", "—"]].concat(T.TITULOS.map((x) => [x, x])) },
        { nombre: "fed", etiqueta: tx("fed"), valor: j.fed || "", max: 3 },
        { nombre: "fideId", etiqueta: tx("fideId"), valor: j.fideId || "", inputmode: "numeric", max: 11 },
        { nombre: "sexo", etiqueta: tx("sexo"), tipo: "select", valor: j.sexo || "", opciones: [["", "—"], ["m", tx("masculino")], ["w", tx("femenino")]] },
        { nombre: "nacimiento", etiqueta: tx("nacimientoFormato"), valor: j.nacimiento || "", max: 10 },
        { nombre: "kFide", etiqueta: tx("eloKCampo"), tipo: "select", valor: j.kFide ? String(j.kFide) : "", ayuda: tx("eloKAyuda"),
          opciones: [["", tx("eloKAuto")]].concat([40, 20, 10].map((n) => [String(n), String(n)])) },
        { nombre: "mesaFija", etiqueta: tx("mesaFija"), valor: j.mesaFija ? String(j.mesaFija) : "", inputmode: "numeric", max: 3, ayuda: tx("mesaFijaAyuda") },
      ],
    });
    if (!r) return;
    const d = datosJugador(r);
    if (!d.nombre) { Avisos.avisar(tx("faltaNombre"), { tipo: "error" }); return; }
    const mesa = Math.round(Number(String(r.mesaFija || "").trim()) || 0);
    d.mesaFija = mesa >= 1 && mesa <= 500 ? mesa : null;
    d.kFide = ["40", "20", "10"].includes(r.kFide) ? Number(r.kFide) : null;
    Object.assign(j, d);
    guardar();
    pintarJugadores();
  }

  // La barra de los marcados: cuántos hay y «Eliminar los marcados». Quien
  // ya jugó una ronda no se elimina (se retira, uno por uno): se dice cuántos
  // quedan fuera y por qué.
  function pintarMasivo(visibles) {
    const barra = $("pi-masivo");
    const v = t();
    const n = estado.marcados.size;
    barra.hidden = false;
    barra.replaceChildren(
      el("span", { id: "pi-masivo-cuenta", class: "text-sm", role: "status", texto: n ? tx("marcadosCuenta", { n }) : tx("marcadosNinguno") }),
      el("button", { type: "button", id: "pi-marcar-visibles", class: C.mini, onclick: () => { for (const id of visibles) estado.marcados.add(id); pintarJugadores(); } },
        tx(visibles.length === v.jugadores.length ? "marcarTodosBoton" : "marcarVisibles", { n: visibles.length })),
      n ? el("button", { type: "button", id: "pi-desmarcar", class: C.mini, onclick: () => { estado.marcados.clear(); pintarJugadores(); } }, tx("desmarcar")) : null,
      n ? el("button", { type: "button", id: "pi-eliminar-marcados", class: C.miniPeligro, onclick: eliminarMarcados }, tx("eliminarMarcados", { n })) : null);
  }

  async function eliminarMarcados() {
    const v = t();
    const enUnaMesa = new Set();
    for (const R of v.rondas) for (const m of R.mesas) { enUnaMesa.add(m.b); if (m.n) enUnaMesa.add(m.n); }
    const ids = [...estado.marcados].filter((id) => jugador(id));
    const se = ids.filter((id) => !enUnaMesa.has(id));
    const no = ids.length - se.length;
    if (!se.length) { Avisos.avisar(tx("eliminarNingunoJugo"), { tipo: "error" }); return; }
    const ok = await Avisos.confirmar(tx("confirmarEliminarMarcados", { n: se.length }) + (no ? " " + tx("eliminarQuedanFuera", { n: no }) : ""),
      { aceptar: tx("eliminarMarcados", { n: se.length }), peligro: true });
    if (!ok || t() !== v) return;
    const fuera = new Set(se);
    v.jugadores = v.jugadores.filter((j) => !fuera.has(j.id));
    for (const id of se) estado.marcados.delete(id);
    guardar();
    pintarJugadores();
    Avisos.avisar(tx("eliminadosMarcados", { n: se.length }));
  }

  // Pasar a alguien a otro torneo del mismo evento (lo decide el
  // congresillo), antes de la ronda 1 de los dos. Queda en el acta.
  // ¿Puede jugar en la categoría del torneo al que va? La Normativa de los
  // JDE (G.revisarCategorias): por año de nacimiento (art. 17) y subir solo
  // en equipos, de A a B, de C a D o de D a E, hasta tres por equipo (art.
  // 18). Sin fecha de nacimiento o sin categoría en el torneo, no se revisa.
  const MODALIDAD_DE = { true: "equipo", false: "individual" };
  const TEXTO_CATEGORIA_NO = { mayor: "categoriaNoMayor", individual: "categoriaNoIndividual", salto: "categoriaNoSalto", tope: "categoriaNoTope" };
  const categoriaDe = (y) => (/Categoría (\S+)/.exec(y.grupo || y.nombre || "") || [])[1] || "";
  const mismoCentro = (a, b) => String(a || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim() === String(b || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
  function revisarCategoriaDestino(j, destino, equipo) {
    const cat = categoriaDe(destino);
    if (!cat || !j.nacimiento) return { ok: true };
    const anio = (destino.jde && destino.jde.anio) || Number(String(destino.fechaInicio || "").slice(0, 4)) || G.JDE_ANIO_NORMATIVA;
    const deEquipos = E.esDeEquipos(destino);
    // Todos «al abierto»: el tope se cuenta por equipo, sin separar por sexo.
    const comoEn = (x) => Object.assign({}, x, { categoria: cat, modalidad: MODALIDAD_DE[deEquipos], institucion: equipo ? equipo.institucion : x.institucion, alAbierto: true });
    const yo = Object.assign(comoEn(j), { esteEs: true });
    const r = G.revisarCategorias((equipo ? equipo.integrantes.map(comoEn) : []).concat(yo), anio);
    const no = r.noPermitidos.find((c) => c.jugador.esteEs);
    if (no) return { ok: false, texto: tx(TEXTO_CATEGORIA_NO[no.motivo], { n: j.nombre, a: no.nace, c: cat, p: no.propia || "—", i: equipo ? equipo.nombre : j.institucion || "—", x: (no.cuantos || 1) - 1 }) };
    const sube = r.permitidos.find((c) => c.jugador.esteEs);
    return { ok: true, texto: sube ? tx("categoriaSube", { n: j.nombre, p: sube.propia, c: cat }) : "" };
  }

  async function moverDeTorneo(id) {
    const v = t();
    const j = jugador(id);
    // A otro torneo del mismo evento que no empezó: individual o por equipos
    // (entra al equipo de su centro, si tiene cupo).
    const destinos = estado.lista.filter((x) => x.id !== estado.id).map((x) => [x.id, leerJSON(PREFIJO + x.id, null)])
      .filter(([, y]) => y && y.evento && v.evento && y.evento.id === v.evento.id && !y.rondas.length);
    if (!destinos.length) { Avisos.avisar(tx("moverSinDestino"), { tipo: "error" }); return; }
    const r = await Avisos.formulario({
      titulo: tx("moverA", { n: j.nombre }), texto: tx("moverTexto"), aceptar: tx("moverSi"), cancelar: tx("cancelar"),
      campos: [{ nombre: "destino", etiqueta: tx("moverDestino"), tipo: "select", valor: destinos[0][0], opciones: destinos.map(([idT, y]) => [idT, y.grupo || y.nombre]) }],
    });
    if (!r || t() !== v || v.rondas.length) return;
    const destino = leerJSON(PREFIJO + r.destino, null);
    if (!destino || destino.rondas.length) { Avisos.avisar(tx("moverSinDestino"), { tipo: "error" }); return; }
    const deEquipos = E.esDeEquipos(destino);
    const equipo = deEquipos ? destino.jugadores.find((e) => mismoCentro(e.institucion || e.nombre, j.institucion)) : null;
    // El equipo de su centro, lleno: primero hay que sacar a alguien.
    if (equipo && equipo.integrantes.length >= G.JDE_MAX_EQUIPO) {
      Avisos.avisar(tx("moverEquipoLleno", { i: equipo.nombre, n: G.JDE_MAX_EQUIPO }), { tipo: "error" });
      return;
    }
    const cat = revisarCategoriaDestino(j, destino, equipo);
    if (!cat.ok) { Avisos.avisar(cat.texto, { tipo: "error" }); return; }
    v.jugadores = v.jugadores.filter((x) => x.id !== id);
    if (!deEquipos) destino.jugadores.push(j);
    else if (equipo) { equipo.integrantes.push(Object.assign({}, j, { id: idJugador() })); equipo.elo = E.eloDeEquipo(equipo.integrantes); }
    else destino.jugadores.push(E.armarEquipos([Object.assign({}, j, { id: idJugador() })], idJugador)[0]);
    destino.movimientos = (destino.movimientos || []).concat({ nombre: j.nombre, institucion: j.institucion || "", desde: v.grupo || v.nombre });
    if (!escribir(PREFIJO + r.destino, JSON.stringify(destino))) { Avisos.avisar(tx("noGuarda"), { tipo: "error" }); return; }
    guardar();
    pintarJugadores();
    Avisos.avisar(tx("movido", { n: j.nombre, t: destino.grupo || destino.nombre }) + (cat.texto ? " " + cat.texto : "") +
      (deEquipos && !equipo ? " " + tx("moverEquipoNuevo", { i: j.institucion || "—", m: G.JDE_MIN_EQUIPO }) : ""));
  }

  // Vuelve a los emparejamientos. Si lo sacó una incomparecencia, esa misma
  // ya no lo vuelve a sacar (T.retirosPorIncomparecencia).
  function devolverAlTorneo(j) {
    j.retiradoDespuesDe = null;
    if (j.retiroAuto != null) { j.vuelveTras = j.retiroAuto - 1; delete j.retiroAuto; }
    guardar();
  }

  async function retirar(id) {
    const j = jugador(id);
    const v = t();
    if (j.retiradoDespuesDe != null) {
      devolverAlTorneo(j);
      pintarJugadores();
      Avisos.avisar(tx("vuelve", { n: j.nombre }));
      return;
    }
    // No juega desde la ronda que todavía no está emparejada.
    const desde = v.rondas.length;
    const ok = await Avisos.confirmar(tx("confirmarRetiro", { n: j.nombre, r: desde + 1 }), { aceptar: tx("retirar") });
    if (!ok) return;
    j.retiradoDespuesDe = desde;
    guardar();
    pintarJugadores();
  }

  async function eliminar(id) {
    const j = jugador(id);
    const ok = await Avisos.confirmar(tx("confirmarEliminar", { n: j.nombre }), { aceptar: tx("eliminar"), peligro: true });
    if (!ok) return;
    t().jugadores = t().jugadores.filter((x) => x.id !== id);
    guardar();
    pintarJugadores();
  }

  // ---------- Rondas ----------
  function pintarRondas() {
    const v = t();
    const nav = $("pi-rondas-nav");
    nav.replaceChildren();
    const total = totalRondas();
    const hay = v.rondas.length;
    const siguiente = hay < total ? hay : null;
    if (estado.ronda == null || estado.ronda > hay || (estado.ronda === hay && siguiente == null)) {
      estado.ronda = siguiente != null && (hay === 0 || T.rondaCompleta(v.rondas[hay - 1])) ? hay : Math.max(0, hay - 1);
    }
    for (let r = 0; r < hay + (siguiente != null ? 1 : 0); r++) {
      const si = r === estado.ronda;
      nav.append(el("button", {
        type: "button", "aria-pressed": si ? "true" : "false",
        class: si ? C.fichaSi : C.fichaNo,
        onclick: () => { estado.ronda = r; pintarRondas(); },
      }, tx("rondaN", { r: r + 1 }) + (r === hay ? " · " + tx("porEmparejar") : T.rondaCompleta(v.rondas[r]) ? "" : " · " + tx("enJuego"))));
    }
    const caja = $("pi-ronda");
    caja.replaceChildren();
    if (!v.jugadores.length) { caja.append(el("p", { class: C.nota, texto: tx("primeroJugadores") })); return; }
    if (estado.ronda < hay) pintarRondaJugada(caja, estado.ronda);
    else if (siguiente != null) pintarRondaNueva(caja, siguiente);
    else caja.append(el("p", { class: C.nota, texto: tx("torneoTerminado") }));
  }

  const RESULTADOS = [["", "resSin"], ["1-0", "res10"], ["=", "resTablas"], ["0-1", "res01"], ["+-", "resMasMenos"], ["-+", "resMenosMas"], ["--", "resMenosMenos"]];

  // «Reimprimir una mesa»: la planilla de anotación o la de firmar de una
  // sola mesa (la que se rompió o se perdió), sin sacar toda la ronda. Va
  // debajo de las mesas: sus selects de resultado son los primeros de la
  // ronda (el teclado y las pruebas los buscan así).
  function pintarReimprimirMesa(caja, r) {
    const R = t().rondas[r];
    const mesas = R.mesas.map((m, i) => [m, i]).filter(([m]) => m.n !== null);
    if (!mesas.length) return;
    const sel = el("select", { id: "pi-imprimir-mesa", class: C.campoChico, "aria-label": tx("reimprimirMesa") },
      mesas.map(([, i]) => el("option", { value: String(i), texto: tx("mesa") + " " + V.mesaFisica(t(), i) })));
    const una = () => Number(sel.value);
    caja.append(el("div", { class: "no-imprimir mt-4 mb-4 flex flex-wrap items-center gap-2" },
      el("span", { class: "text-sm font-semibold", texto: tx("reimprimirMesa") }), sel,
      el("button", { type: "button", id: "pi-una-anotacion", class: C.mini, onclick: () => imprimirPlanillasAnotacion(r, una()) }, tx("reimprimirAnotacion")),
      el("button", { type: "button", id: "pi-una-firma", class: C.mini, onclick: () => imprimirPlanillasFirma(r, una()) }, tx("reimprimirFirma"))));
  }

  function pintarRondaJugada(caja, r) {
    const v = t();
    const R = v.rondas[r];
    const pendientes = R.mesas.filter((m) => m.n && !m.r).length;
    const ultima = r === v.rondas.length - 1;
    caja.append(el("div", { class: "flex flex-wrap items-baseline justify-between gap-3 mb-3" },
      el("h2", { class: "font-serif text-xl font-bold", texto: tx("emparejamientosRonda", { r: r + 1 }) + (v.nombre ? " — " + v.nombre : "") }),
      el("div", { class: "flex flex-wrap gap-2 no-imprimir" },
        el("button", { type: "button", class: C.botonSec, onclick: () => window.print() }, tx("imprimir")),
        el("button", { type: "button", class: C.botonSec, onclick: () => imprimirPlantillaMesas(r) }, tx("plantillaMesas")),
        el("button", { type: "button", id: "pi-planillas-firma", class: C.botonSec, onclick: () => imprimirPlanillasFirma(r) }, tx("planillasFirma")),
        E.esDeEquipos(v) ? el("button", { type: "button", id: "pi-alineaciones", class: C.botonSec, onclick: () => imprimirAlineaciones(r) }, tx("alineacionesImprimir")) : null,
        el("button", { type: "button", class: C.botonSec, onclick: () => compartirLectura(r) }, tx("verDesdeElCelular")),
        el("button", { type: "button", id: "pi-ronda-whatsapp", class: C.botonSec, "aria-expanded": "false", "aria-controls": "pi-ronda-compartir",
          onclick: (e) => abrirCompartir($("pi-ronda-compartir"), e.currentTarget, PareoCompartir.textoRonda(t(), r, { idioma, enlace: enlaceVivoActual() })) }, tx("whatsappBoton")),
        ultima ? el("button", { type: "button", id: "pi-adjunto", class: C.botonSec, onclick: () => enlaceAdjunto(r) }, tx("adjuntoBoton")) : null,
        ultima ? el("button", { type: "button", id: "pi-camaras", class: C.botonSec, onclick: pedirCodigoCamaras }, tx("camarasBoton")) : null,
        el("button", { type: "button", id: "pi-planillas-anotacion", class: C.botonSec, onclick: () => imprimirPlanillasAnotacion(r) }, tx("anotacionBoton")),
        el("button", { type: "button", id: "pi-imprimir-todo", class: C.botonSec, onclick: () => imprimirTodoDeRonda(r) }, tx("imprimirTodo")),
        ultima ? el("button", { type: "button", class: C.miniPeligro + " px-3 py-2", onclick: () => deshacerRonda(r) }, tx("deshacerRonda")) : null)));
    caja.append(el("div", { id: "pi-ronda-compartir", class: "no-imprimir", hidden: true }));
    caja.append(el("p", { class: C.nota + " mb-3 no-imprimir", role: "status", texto: pendientes ? tx("faltanResultados", { n: pendientes }) : tx("rondaCompleta") }));
    if (!ultima) caja.append(el("p", { class: C.nota + " mb-3 no-imprimir", texto: tx("avisoCorregir") }));

    // Buscar una mesa por el nombre de quien juega, y los atajos del teclado.
    const buscarMesa = el("input", { id: "pi-buscar-mesa", type: "search", autocomplete: "off", class: C.campo, "aria-describedby": "pi-atajos-ayuda" });
    caja.append(el("div", { class: "no-imprimir mb-3 max-w-md" },
      el("label", { for: "pi-buscar-mesa", class: "block text-sm font-semibold mb-1", texto: tx("buscarMesa") }), buscarMesa,
      el("p", { id: "pi-atajos-ayuda", class: C.nota + " mt-1", texto: tx("atajosAyuda") })));
    buscarMesa.addEventListener("input", () => filtrarMesas(buscarMesa.value));
    buscarMesa.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const primero = [...document.querySelectorAll("#pi-ronda select[data-resultado]")].find((s) => s.checkVisibility());
      if (primero) primero.focus();
    });
    if (ultima || v.rondas[r].inicio) pintarReloj(caja, r);
    const cajaAdjunto = el("div", { id: "pi-adjunto-caja", class: "no-imprimir mb-4", hidden: true });
    // Las llamadas de los adjuntos y el chat con ellos.
    const cajaLlamadas = el("section", { id: "pi-llamadas", class: "no-imprimir mb-4 rounded-xl border-2 border-accent-500 p-3", role: "region", "aria-labelledby": "pi-llamadas-titulo", hidden: true });
    const cajaChat = el("section", { id: "pi-chat-adjuntos", class: "no-imprimir mb-4 rounded-xl border border-brand-200 dark:border-brand-700 p-3", hidden: true });
    const cajaCamaras = el("section", { id: "pi-camaras-caja", class: "no-imprimir mb-4 rounded-xl border border-brand-200 dark:border-brand-700 p-3", hidden: true });
    caja.append(cajaLlamadas, cajaAdjunto, cajaChat, cajaCamaras);
    if (ultima && (v.adjuntos || []).some((a) => a.activo)) { conectarAdjuntos(); mostrarAdjuntos(cajaAdjunto); }
    if (ultima && !E.esDeEquipos(v) && v.camaras && v.camaras.activo) conectarCamaras().then(pintarCamaras);
    if (ultima) pintarCamaras();
    if (ultima) { pintarLlamadas(); pintarChat(); }
    if (E.esDeEquipos(v)) pintarEncuentros(caja, r);
    else pintarMesasIndividuales(caja, r);
    pintarReimprimirMesa(caja, r);
    pintarNoJuegan(caja, r);
    pintarRevisionPareo(caja, r);
    pintarConfirmar(caja, r);
    pintarIncidencias(caja, r);
    for (const s of caja.querySelectorAll("select[data-resultado]")) atajosResultado(s);
  }

  // Esconde las mesas en que no juega nadie con ese nombre (sin tildes ni
  // mayúsculas). Cada mesa lleva sus nombres en data-nombres.
  function filtrarMesas(texto) {
    const q = normalizarBusqueda(texto).trim();
    for (const fila of document.querySelectorAll("#pi-ronda [data-nombres]")) fila.hidden = !!q && !fila.dataset.nombres.includes(q);
  }

  // Los atajos de un resultado: 1 gana blancas, 0 gana negras, = (o 5)
  // tablas; y salta solo al siguiente. En la ronda en juego no pide nada;
  // en una cerrada, el diálogo del motivo sale igual (lo pide el cambio).
  const ATAJOS = { "1": "1-0", "0": "0-1", "=": "=", "5": "=" };
  function atajosResultado(sel) {
    sel.addEventListener("keydown", (e) => {
      const val = ATAJOS[e.key];
      if (!val || e.altKey || e.ctrlKey || e.metaKey || ![...sel.options].some((o) => o.value === val)) return;
      e.preventDefault();
      const id = sel.id;
      sel.value = val;
      sel.dispatchEvent(new Event("change"));
      // El cambio puede volver a pintar la ronda: el siguiente se busca de nuevo.
      setTimeout(() => {
        if (document.querySelector('dialog[open]')) return;
        const todos = [...document.querySelectorAll("#pi-ronda select[data-resultado]")].filter((s) => s.checkVisibility());
        const k = todos.findIndex((s) => s.id === id);
        const siguiente = todos[k + 1];
        if (siguiente) siguiente.focus();
      }, 0);
    });
  }

  const horaCR = (ms) => (window.HoraCR ? HoraCR.hora(ms) : new Date(ms).toLocaleTimeString("es-CR", { hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica" }));

  // ---------- Los árbitros adjuntos anotan desde el celular ----------
  // Un enlace por adjunto, cada uno con su código y sus mesas
  // (#adjunto=<código>&m=1-10), guardados en el torneo (`adjuntos`): si se
  // pierde un celular, ese enlace se apaga sin tocar los demás. Por el mismo
  // canal de Supabase Realtime en modo Broadcast que el enlace en vivo, el
  // adjunto pide la ronda («pedir») y manda cada resultado («resultado»).
  // Esta pestaña, la del árbitro principal, es la que decide: solo acepta un
  // resultado de la última ronda, de una mesa de su rango, que todavía no lo
  // tiene —nunca pisa lo que ya está— y de la lista; lo marca «lo anotó el
  // adjunto». En equipos, tablero por tablero. Mientras esta pestaña esté
  // abierta.
  const RESULTADOS_VALIDOS = new Set(["1-0", "=", "0-1", "+-", "-+", "--"]);
  async function enlaceAdjunto(r) {
    const v = t();
    const total = v.rondas[r].mesas.length;
    const res = await Avisos.formulario({ titulo: tx("adjuntoTitulo"), texto: tx("adjuntoTexto"), aceptar: tx("adjuntoCrear"), cancelar: tx("cancelar"),
      campos: [{ nombre: "arbitro", etiqueta: tx("adjuntoNombre"), valor: "", max: 60 },
        { nombre: "desde", etiqueta: tx("adjuntoDesde"), valor: "1", inputmode: "numeric" }, { nombre: "hasta", etiqueta: tx("adjuntoHasta"), valor: String(total), inputmode: "numeric" }] });
    if (!res || t() !== v) return;
    const arbitro = String(res.arbitro || "").trim().slice(0, 60);
    if (!arbitro) { Avisos.avisar(tx("adjuntoFaltaNombre"), { tipo: "error" }); return; }
    const desde = Math.max(1, Math.round(Number(res.desde)) || 1), hasta = Math.min(total, Math.round(Number(res.hasta)) || total);
    if (desde > hasta) { Avisos.avisar(tx("adjuntoRango"), { tipo: "error" }); return; }
    v.adjuntos = (v.adjuntos || []).concat({ codigo: nuevoCodigoVivo(), rango: desde + "-" + hasta, activo: true, nombre: arbitro });
    guardar();
    await conectarAdjuntos();
    pintarRondas();
  }
  async function conectarAdjuntos() {
    const v = t();
    const activos = (v.adjuntos || []).filter((a) => a.activo);
    if (!estado.adjuntos || estado.adjuntos.idTorneo !== estado.id) {
      if (!activos.length) return true;
      desconectarAdjuntos();
      estado.adjuntos = { idTorneo: estado.id, canales: new Map() };
    }
    if (activos.length) {
      try { await PareoVer.cargarSupabase(); }
      catch (e) { Avisos.avisar(tx("errorEnVivo", { e: e.message }), { tipo: "error" }); return false; }
    }
    for (const a of activos) {
      if (estado.adjuntos.canales.has(a.codigo)) continue;
      const canal = window.sb.channel("pareo-adjunto-" + a.codigo);
      canal.on("broadcast", { event: "pedir" }, () => enviarAdjunto(a.codigo));
      canal.on("broadcast", { event: "resultado" }, (msg) => recibirDeAdjunto(a.codigo, msg.payload || {}));
      canal.on("broadcast", { event: "nota" }, (msg) => recibirNotaDeAdjunto(a.codigo, msg.payload || {}));
      canal.on("broadcast", { event: "chat" }, (msg) => recibirChatDeAdjunto(a.codigo, msg.payload || {}));
      canal.on("broadcast", { event: "llamada" }, (msg) => recibirLlamada(a.codigo, msg.payload || {}));
      canal.subscribe((st) => { if (st === "SUBSCRIBED") enviarAdjunto(a.codigo); });
      estado.adjuntos.canales.set(a.codigo, canal);
    }
    // Los apagados: se les avisa y se corta su canal.
    for (const [c, canal] of estado.adjuntos.canales) {
      if (activos.some((a) => a.codigo === c)) continue;
      canal.send({ type: "broadcast", event: "estado", payload: { apagado: true } });
      canal.unsubscribe();
      estado.adjuntos.canales.delete(c);
    }
    return true;
  }
  function desconectarAdjuntos() {
    if (estado.adjuntos) for (const canal of estado.adjuntos.canales.values()) canal.unsubscribe();
    estado.adjuntos = null;
  }
  const torneoDelAdjunto = () => estado.adjuntos && (estado.adjuntos.idTorneo === estado.id ? t() : leerJSON(PREFIJO + estado.adjuntos.idTorneo, null));
  const adjuntoActivo = (v, codigo) => (v.adjuntos || []).find((a) => a.codigo === codigo && a.activo);
  function enviarAdjunto(codigo) {
    const v = torneoDelAdjunto();
    const canal = estado.adjuntos && estado.adjuntos.canales.get(codigo);
    if (!v || !canal || !v.rondas.length) return;
    const R = v.rondas[v.rondas.length - 1];
    const nombre = (id) => (v.jugadores.find((j) => j.id === id) || {}).nombre || "?";
    const deEquipos = E.esDeEquipos(v);
    const integrante = (idE, idJ) => { const e = v.jugadores.find((x) => x.id === idE); const j = e && idJ && e.integrantes.find((y) => y.id === idJ); return j ? j.nombre : null; };
    // Las marcas de las incidencias y su detalle, para que el adjunto también
    // sepa quién ya tiene una ilegal; y a quién puede anotarle una.
    const marcas = V.marcasIncidencias(R);
    const marcaPara = (id) => { const mm = id && marcas.get(id); return mm ? { t: V.textoMarca(mm), d: mm.items.map(textoIncidencia), pierde: mm.ilegales >= 2 } : null; };
    const a = adjuntoActivo(v, codigo) || {};
    canal.send({ type: "broadcast", event: "estado", payload: {
      nombre: v.nombre || "", ronda: v.rondas.length,
      // Quién es él, quién es el principal, su chat y sus llamadas.
      arbitro: a.nombre || "", principal: v.arbitro || "",
      chat: chatDe(v, codigo).slice(-30).map((x) => ({ hora: x.hora, de: x.de === "principal" ? x.de : QUIEN_CHAT[x.de === codigo], nombre: x.nombre, texto: x.texto })),
      llamadas: (v.llamadas || []).filter((x) => x.codigo === codigo).slice(-5).map((x) => ({ hora: x.hora, mesa: x.mesa, atendida: x.atendida || null })),
      mesas: R.mesas.map((m, i) => {
        const x = { m: i + 1, f: V.mesaFisica(v, i), b: nombre(m.b), n: m.n == null ? null : nombre(m.n), r: m.r || null, mia: !!m.r && m.adjunto === codigo,
          mb: marcaPara(m.b), mn: m.n == null ? null : marcaPara(m.n), quien: jugadoresDeMesa(v, m).map(([k, , etiqueta]) => ({ k, e: etiqueta })) };
        if (deEquipos && m.n != null) {
          // Sin tocar lo guardado: una copia con la alineación de entrada.
          const copia = m.alineacion ? m : E.prepararMesa(v, JSON.parse(JSON.stringify(m)));
          x.tableros = E.tablerosDe(v, copia).map((k) => ({ t: k.k + 1, b: integrante(k.bBlancas ? m.b : m.n, k.blancas), n: integrante(k.bBlancas ? m.n : m.b, k.negras), r: k.r || null, fijo: k.fijo,
            mb: marcaPara(k.blancas), mn: marcaPara(k.negras) }));
        }
        return x;
      }),
    } });
  }
  function enviarAdjuntos() { if (estado.adjuntos) for (const c of estado.adjuntos.canales.keys()) enviarAdjunto(c); }
  function recibirDeAdjunto(codigo, p) {
    const v = torneoDelAdjunto();
    const a = v && adjuntoActivo(v, codigo);
    if (!a) return;
    const [desde, hasta] = a.rango.split("-").map(Number);
    const mesa = Number(p.mesa);
    const R = v.rondas[v.rondas.length - 1];
    const m = R && R.mesas[mesa - 1];
    const rechazar = () => enviarAdjunto(codigo);
    // Solo la última ronda, una mesa de su rango con rival, un resultado válido.
    if (!m || mesa < desde || mesa > hasta || Number(p.ronda) !== v.rondas.length || m.n == null || !RESULTADOS_VALIDOS.has(p.r)) return rechazar();
    let texto;
    if (E.esDeEquipos(v)) {
      E.prepararMesa(v, m);
      const k = Number(p.tablero) - 1;
      const x = E.tablerosDe(v, m)[k];
      if (x && !x.fijo && x.r && x.r !== p.r) anotarDiscrepancia(v, R, { mesa, tablero: k + 1, r: p.r, ya: x.r });
      if (!x || x.fijo || x.r || E.puntosDelEncuentro(v, m).incomparecencia) return rechazar();
      m.partidas[k].r = p.r;
      m.r = E.resultadoEncuentro(v, m);
      texto = tx("adjuntoLlegoTablero", { m: mesa, t: k + 1, r: tx("corto_" + p.r) });
    } else {
      // Corregir el que él mismo anotó (lo confirmó en su celular): sí, y
      // queda la constancia en las incidencias. Lo que anotó otro, nunca se
      // pisa: queda para que el principal lo confirme.
      const suya = !!m.r && !!p.corrige && m.adjunto === codigo;
      if (m.r && !suya) { if (m.r !== p.r) anotarDiscrepancia(v, R, { mesa, r: p.r, ya: m.r }); return rechazar(); }
      if (suya && m.r === p.r) return rechazar();
      const antes = m.r;
      m.r = p.r;
      if (suya) anotarCorreccion(R, mesa - 1, antes, p.r, tx("correccionAdjunto", { n: a.nombre || "—" }));
      texto = tx(suya ? "adjuntoCorrigio" : "adjuntoLlego", { m: mesa, r: tx("corto_" + p.r), n: a.nombre || "—" });
    }
    m.porAdjunto = a.nombre || true;
    m.adjunto = codigo;
    if (v === t()) { guardar(); if (estado.ficha === "rondas" && estado.ronda === v.rondas.length - 1) pintarRondas(); }
    else { avisarRetiros(v, retirosAuto(v)); escribir(PREFIJO + estado.adjuntos.idTorneo, JSON.stringify(v)); }
    Avisos.avisar(texto, { tipo: "info" });
    enviarAdjunto(codigo);
  }
  // ---------- Las cámaras de las mesas ----------
  // La cámara que lee el tablero (camara-tablero.html, de quien administra la
  // Academia) transmite cada mesa de un torneo publicado por un canal de
  // Supabase Realtime en modo Broadcast: `tablero-vivo-<código>`, el mismo
  // que mira tablero-vivo.html. Esta pestaña lo escucha con el código de las
  // cámaras (`camaras`: { codigo, activo }, guardado en el torneo) y:
  //  - la partida de cada mesa entra sola a la mesa (`m.pgn`, con
  //    `pgnCamara`): sale en el torneo publicado. Nunca pisa una que se
  //    escribió a mano.
  //  - el resultado NUNCA se anota solo: queda en «Resultados para confirmar»
  //    (`R.deCamaras`), con «Anotar» y «Descartar».
  // Solo la última ronda de un torneo publicado (la cámara
  // elige el torneo publicado por su id), y lo que llega se vuelve a jugar con
  // chess.js (PartidaEnVivo.leer). Mientras esta pestaña esté abierta.
  // En un torneo por equipos, cada tablero de un encuentro tiene su cámara
  // (mesa y tablero): su partida va en `m.partidas[k].pgn` y su resultado se
  // confirma por tablero; el del encuentro sale de los tableros. Esa partida
  // queda en esta computadora (y va a Lichess si se transmite): el torneo
  // publicado lleva solo el resultado de cada tablero.
  let cargaVivo = null;
  function cargarVivo() {
    if (window.PartidaEnVivo) return Promise.resolve();
    if (!cargaVivo) cargaVivo = cargarChess().then(() => new Promise((listo, fallo) => {
      const sc = document.createElement("script");
      sc.src = "js/partida-en-vivo.js";
      sc.addEventListener("load", listo);
      sc.addEventListener("error", () => { cargaVivo = null; fallo(new Error("No cargó partida-en-vivo.js")); });
      document.head.appendChild(sc);
    }));
    return cargaVivo;
  }
  const CODIGO_CAMARAS = /^[a-hjkmnp-z2-9]{8}$/;
  async function pedirCodigoCamaras() {
    const v = t();
    if (!v.publicado) { Avisos.avisar(tx("camarasSinPublicar"), { tipo: "error" }); return; }
    const res = await Avisos.formulario({ titulo: tx("camarasTitulo"), texto: tx("camarasTexto"), aceptar: tx("camarasConectar"), cancelar: tx("cancelar"),
      campos: [{ nombre: "codigo", etiqueta: tx("camarasCodigo"), valor: (v.camaras && v.camaras.codigo) || "", max: 8 }] });
    if (!res || t() !== v) return;
    const codigo = String(res.codigo || "").replace(/\s+/g, "").toLowerCase();
    if (!CODIGO_CAMARAS.test(codigo)) { Avisos.avisar(tx("camarasCodigoMalo"), { tipo: "error" }); return; }
    v.camaras = { codigo, activo: true };
    guardar();
    if (await conectarCamaras()) Avisos.avisar(tx("camarasConectadas"));
    pintarRondas();
  }
  async function conectarCamaras() {
    const v = t();
    const c = v.camaras && v.camaras.activo ? v.camaras.codigo : null;
    if (estado.camaras && (estado.camaras.idTorneo !== estado.id || estado.camaras.codigo !== c)) desconectarCamaras();
    if (!c || estado.camaras) return true;
    try { await PareoVer.cargarSupabase(); await cargarVivo(); }
    catch (e) { Avisos.avisar(tx("errorEnVivo", { e: e.message }), { tipo: "error" }); return false; }
    if (estado.camaras) return true;
    const canal = window.sb.channel(window.PartidaEnVivo.canal(c));
    canal.on("broadcast", { event: "estado" }, (msg) => recibirDeCamara(msg.payload || {}));
    canal.on("broadcast", { event: "alerta" }, (msg) => alertaDeCamara(msg.payload || {}));
    canal.on("broadcast", { event: "foto" }, (msg) => fotoDeCamara(msg.payload || {}));
    canal.on("broadcast", { event: "latido" }, (msg) => latidoDeCamara(msg.payload || {}));
    canal.subscribe((st) => { if (st === "SUBSCRIBED") canal.send({ type: "broadcast", event: "pedir", payload: {} }); });
    estado.camaras = { idTorneo: estado.id, codigo: c, canal, mesas: new Map(), alertas: new Map(), partidas: new Map(), pedidas: new Map(), fotos: new Map(), desde: new Map(), cuenta: new Map(), latidos: new Map() };
    return true;
  }
  function desconectarCamaras() {
    if (estado.camaras) { try { window.sb.removeChannel(estado.camaras.canal); } catch (e) { /* ya cerrado */ } }
    estado.camaras = null;
  }
  function dejarCamaras() {
    const v = t();
    if (v.camaras) v.camaras.activo = false;
    desconectarCamaras();
    guardar();
    pintarRondas();
    Avisos.avisar(tx("camarasApagadas"));
  }
  const torneoDeCamaras = () => estado.camaras && (estado.camaras.idTorneo === estado.id ? t() : leerJSON(PREFIJO + estado.camaras.idTorneo, null));
  // El lugar de una cámara: «5» o, en un torneo por equipos, «5.2» (mesa y
  // tablero: cada tablero de un encuentro es una partida). Así se guarda; se
  // muestra «5 · tablero 2».
  const claveCamara = (mesa, tablero) => String(mesa) + (tablero ? "." + tablero : "");
  const verLugar = (clave) => String(clave).replace(/\.(\d+)$/, (x, k) => " · " + tx("tableroN", { t: k }).toLowerCase());
  const ordenLugar = (a, b) => parseFloat(a) - parseFloat(b);
  function recibirDeCamara(p) {
    const v = torneoDeCamaras();
    if (!v || !v.publicado || !v.rondas.length || !window.PartidaEnVivo) return;
    const equipos = E.esDeEquipos(v);
    // La cámara manda casi siempre solo lo nuevo: se pega a la partida que
    // ya llegó de esa mesa (y tablero). Si no calza (se perdió un mensaje), se pide entera.
    const c = estado.camaras;
    const antes = c.partidas.get(claveCamara(Number(p.mesa), Number(p.tablero) || null));
    if (antes && Number(p.t) < antes.t) return;
    const d = window.PartidaEnVivo.leer(p, antes);
    if (d && d.falta) {
      const k = claveCamara(d.mesa, d.tablero), ya = c.pedidas.get(k) || 0;
      if (d.mesa && Date.now() - ya >= 3000) { c.pedidas.set(k, Date.now()); c.canal.send({ type: "broadcast", event: "pedir", payload: { mesa: d.mesa, tablero: d.tablero || undefined } }); }
      return;
    }
    if (!d || d.torneo !== v.publicado.id || d.ronda !== v.rondas.length || !d.mesa || !!d.tablero !== equipos) return;
    const R = v.rondas[v.rondas.length - 1];
    const i = R.mesas.findIndex((x, k) => V.mesaFisica(v, k) === d.mesa);
    const m = R.mesas[i];
    if (!m || m.n == null) return;
    // Dónde va: la mesa, o en un encuentro por equipos, la partida de su tablero.
    let lugar = m;
    if (equipos) {
      E.prepararMesa(v, m);
      lugar = m.partidas[d.tablero - 1];
      if (!lugar) return;
    }
    const clave = claveCamara(d.mesa, d.tablero);
    d.recibido = Date.now(); // para el reloj de la cámara (ver relojesCamaras)
    c.partidas.set(clave, d);
    anotarLectura(v, claveCamara(d.mesa, d.tablero), d);
    c.mesas.set(clave, Date.now());
    if (!c.desde.has(clave)) c.desde.set(clave, Date.now());
    let cambio = false, repintar = false, aviso = null;
    // La partida: la de la cámara, salvo que la mesa tenga una escrita a mano.
    const pgn = d.juego.history().length ? window.PartidaEnVivo.pgn(d.juego, d.resultado, d.tiempos) : "";
    if (pgn && (!lugar.pgn || lugar.pgnCamara) && lugar.pgn !== pgn) { lugar.pgn = pgn; lugar.pgnCamara = true; cambio = true; }
    // El resultado: para confirmar, nunca anotado solo.
    if (d.resultado) {
      R.deCamaras = R.deCamaras || [];
      const ya = R.deCamaras.find((x) => x.mesa === i + 1 && (x.tablero || null) === (d.tablero || null) && !x.resuelta);
      if (lugar.r === d.resultado) { if (ya) { ya.resuelta = "igual"; cambio = repintar = true; } }
      else if (!ya || ya.r !== d.resultado) {
        if (ya) ya.resuelta = "otro";
        R.deCamaras.push(Object.assign({ hora: Date.now(), mesa: i + 1, r: d.resultado }, d.tablero ? { tablero: d.tablero } : {}));
        cambio = repintar = true;
        aviso = tx("camaraResultadoLlego", { m: verLugar(clave), r: tx("corto_" + d.resultado) });
      }
    }
    // Una jugada nueva no vuelve a pintar la ronda (le movería la página a
    // quien está anotando): solo la marca del botón de la partida.
    const enLaRonda = v === t() && estado.ficha === "rondas" && estado.ronda === v.rondas.length - 1;
    if (cambio) {
      if (v === t()) guardar();
      else escribir(PREFIJO + estado.camaras.idTorneo, JSON.stringify(v));
    }
    if (enLaRonda && repintar) pintarRondas();
    else {
      if (enLaRonda && !equipos) { const b = document.querySelector('#pi-ronda [data-pgn="' + i + '"]'); if (b && m.pgn) b.textContent = "✓ " + tx("pgnBoton"); }
      pintarCamaras();
    }
    if (aviso) Avisos.avisar(aviso, { tipo: "info" });
    lichessPronto();
  }
  // La cámara ve algo que no sale de ninguna jugada legal: puede ser una
  // jugada ilegal. Se avisa (sin las casillas: con retraso, eso sería pasar
  // la jugada) y queda en la caja de las cámaras hasta que se marca «Visto».
  // Una vez cada 30 segundos por mesa, como mucho. También llegan la
  // repetición y las 50 jugadas (`tipo`), que no se marcan solas: el árbitro
  // las confirma si alguien reclama (o, con cinco veces y 75 jugadas, solo).
  // y la bandera que cae en el reloj de la cámara (con el color, `color`).
  const TIPOS_ALERTA = { ilegal: "camaraAlerta", repeticion3: "camaraTablas3", jugadas50: "camaraTablas50", repeticion5: "camaraTablas5", jugadas75: "camaraTablas75", bandera: "camaraBandera", sinMover: "camaraSinMover", sinApretar: "camaraSinApretar" };
  const colorTx = (c) => tx(c === "w" ? "colorLasBlancas" : "colorLasNegras");
  function alertaDeCamara(p) {
    const v = torneoDeCamaras();
    if (!v || !v.publicado || !v.rondas.length || p.torneo !== v.publicado.id || Number(p.ronda) !== v.rondas.length) return;
    const mesa = Number(p.mesa), tablero = E.esDeEquipos(v) ? Number(p.tablero) || null : null;
    const R = v.rondas[v.rondas.length - 1];
    if (!R.mesas.some((x, k) => V.mesaFisica(v, k) === mesa)) return;
    const clave = claveCamara(mesa, tablero), tipo = TIPOS_ALERTA[p.tipo] ? p.tipo : "ilegal";
    const k = tipo === "ilegal" ? clave : clave + "|" + tipo; // cada aviso por su lado: uno no tapa al otro
    const antes = estado.camaras.alertas.get(k);
    if (antes && Date.now() - antes.h < 30000) return;
    const color = p.color === "w" || p.color === "b" ? p.color : null;
    estado.camaras.alertas.set(k, { h: Date.now(), tipo, m: clave, color });
    // Para el informe: «Visto» quita el aviso de la lista, pero no de la cuenta.
    const cu = estado.camaras.cuenta.get(clave) || { ilegal: 0, tablas: 0 };
    if (tipo === "ilegal") cu.ilegal++;
    else if (/^(repeticion|jugadas)/.test(tipo)) cu.tablas++;
    estado.camaras.cuenta.set(clave, cu);
    Avisos.avisar(tx(TIPOS_ALERTA[tipo], { m: verLugar(clave), q: color ? colorTx(color) : "" }), { tipo: { ilegal: "error", bandera: "error", sinMover: "error" }[tipo] || "info" });
    pintarCamaras();
  }

  // La foto del tablero (visto desde arriba, recortado: solo el tablero, sin
  // nadie alrededor) que manda la cámara con cada resultado y cada aviso:
  // una prueba si hay un reclamo. Queda en la memoria de esta pestaña y, si
  // el árbitro la pasa, en las incidencias de la ronda (y en el respaldo del
  // torneo). No se publica.
  const FOTO_VALIDA = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;
  const MOTIVOS_FOTO = ["resultado", "bandera", "ilegal", "repeticion3", "jugadas50", "repeticion5", "jugadas75"];
  function fotoDeCamara(p) {
    const v = torneoDeCamaras();
    if (!v || !v.publicado || !v.rondas.length || p.torneo !== v.publicado.id || Number(p.ronda) !== v.rondas.length) return;
    if (typeof p.img !== "string" || p.img.length > 120000 || !FOTO_VALIDA.test(p.img) || !MOTIVOS_FOTO.includes(p.motivo)) return;
    const mesa = Number(p.mesa), tablero = E.esDeEquipos(v) ? Number(p.tablero) || null : null;
    const R = v.rondas[v.rondas.length - 1];
    if (!R.mesas.some((x, k) => V.mesaFisica(v, k) === mesa)) return;
    const clave = claveCamara(mesa, tablero);
    const lista = (estado.camaras.fotos.get(clave) || []).concat({ h: Date.now(), motivo: p.motivo, img: p.img, mesa, tablero });
    estado.camaras.fotos.set(clave, lista.slice(-6));
    pintarCamaras();
    if (p.motivo === "resultado") pintarRondas(); // el botón de la foto va junto al resultado para confirmar
  }
  // La última foto de esa mesa desde un poco antes de `desde` (el aviso o el resultado).
  const fotoDe = (clave, desde) => {
    const lista = (estado.camaras && estado.camaras.fotos.get(String(clave))) || [];
    return lista.filter((f) => f.h >= (desde || 0) - 120000).pop() || null;
  };
  const textoMotivo = (m) => tx(m === "resultado" ? "fotoMotivoResultado" : m === "ilegal" ? "fotoMotivoIlegal" : TIPOS_ALERTA[m] + "Corto");
  function verFoto(f, pasar) {
    const cerrarB = el("button", { type: "button", class: C.botonSec }, tx("cerrar"));
    const pasarB = pasar ? el("button", { type: "button", id: "pi-foto-pasar", class: C.boton }, tx("fotoPasar")) : null;
    const d = el("dialog", { id: "pi-foto-dialogo", class: "rounded-2xl p-5 max-w-md w-full bg-white dark:bg-brand-900 text-brand-800 dark:text-white", "aria-labelledby": "pi-foto-dialogo-t" },
      el("h2", { id: "pi-foto-dialogo-t", class: "font-serif text-xl font-bold mb-1", texto: tx("fotoTitulo", { m: verLugar(claveCamara(f.mesa, f.tablero)) }) }),
      el("p", { class: C.nota, texto: horaCR(f.h) + (f.motivo ? " · " + textoMotivo(f.motivo) : "") }),
      el("img", { src: f.img, alt: tx("fotoAlt", { m: verLugar(claveCamara(f.mesa, f.tablero)) }), width: "256", height: "256", class: "mt-3 mx-auto rounded-lg w-64 h-64" }),
      el("div", { class: "flex flex-wrap gap-2 mt-4" }, pasarB, cerrarB));
    const cerrar = () => { d.close(); d.remove(); };
    cerrarB.addEventListener("click", cerrar);
    d.addEventListener("cancel", (e) => { e.preventDefault(); cerrar(); });
    if (pasarB) pasarB.addEventListener("click", () => { pasar(); cerrar(); });
    document.body.append(d);
    d.showModal();
    cerrarB.focus();
  }
  // Pasar la foto a las incidencias de la ronda en juego, con su mesa.
  function fotoAIncidencias(f) {
    const v = t(), R = v.rondas[v.rondas.length - 1];
    const k = R.mesas.findIndex((x, i) => V.mesaFisica(v, i) === f.mesa);
    if (k < 0) return;
    R.incidencias = (R.incidencias || []).concat({ hora: f.h, mesa: k + 1, tipo: "otra",
      texto: tx("fotoIncidencia", { q: textoMotivo(f.motivo), b: f.tablero ? " " + tx("fotoTablero", { b: f.tablero }) : "" }), foto: f.img });
    guardar(); pintarRondas();
    Avisos.avisar(tx("fotoPasada"), { tipo: "ok" });
  }
  const botonFoto = (f) => el("button", { type: "button", class: C.mini, "data-foto": "1", onclick: () => verFoto(f, () => fotoAIncidencias(f)) },
    el("span", { "aria-hidden": "true", texto: "📷 " }), tx("fotoVer"));

  // El informe de las cámaras de la ronda: desde y hasta cuándo transmitió
  // cada mesa, cuántas jugadas anotó sola y cuántas se escribieron a mano en
  // la cámara, sus avisos y su resultado. Sirve para ver qué mesa necesita
  // mejor luz o mejor ángulo. Sale de lo que llegó a esta pestaña (no se
  // guarda en el torneo).
  function informeCamaras() {
    const c = estado.camaras;
    const claves = [...c.partidas.keys()].sort(ordenLugar);
    if (!claves.length) return null;
    const avisos = (k, cual) => (c.cuenta.get(k) || {})[cual] || 0;
    const th = (clave) => el("th", { scope: "col", class: "py-1 pr-3 text-left font-semibold", texto: tx(clave) });
    /* La ronda en un vistazo: cuántas mesas leyeron solas de punta a punta y,
     * mesa por mesa, qué mejorar para la próxima (luz, ángulo, batería). */
    const vistazo = (k) => {
      const d = c.partidas.get(k), n = d.juego.history().length, mano = Math.min(d.mano || 0, n), dudas = d.dudas || 0, ilegal = avisos(k, "ilegal");
      const mejorar = [];
      if (d.equipo && d.equipo.luz === "poca") mejorar.push(tx("vistazoLuz"));
      if (n && mano / n >= 0.2) mejorar.push(tx("vistazoMano"));
      if (dudas >= 3) mejorar.push(tx("vistazoDudas", { n: dudas }));
      if (ilegal) mejorar.push(tx("vistazoIlegal", { n: ilegal }));
      if (!d.resultado && Date.now() - (c.mesas.get(k) || 0) > SIN_NOTICIAS_MS) mejorar.push(tx("vistazoSinNoticias"));
      const terminada = { true: "sola", false: "corregida" }[!mano && !ilegal];
      return { estado: d.resultado ? terminada : "juega", mejorar };
    };
    const vistos = new Map(claves.map((k) => [k, vistazo(k)]));
    const cuenta = (e) => [...vistos.values()].filter((x) => x.estado === e).length;
    const conAlgo = claves.filter((k) => vistos.get(k).mejorar.length);
    const resumen = el("div", { id: "pi-camaras-vistazo", class: "text-sm mt-1" },
      el("p", { class: "font-semibold", texto: tx("camarasVistazo", { n: claves.length, s: cuenta("sola"), c: cuenta("corregida"), j: cuenta("juega") }) }),
      conAlgo.length ? el("p", { texto: tx("camarasVistazoMejorar", { l: conAlgo.map((k) => tx("vistazoMesa", { m: verLugar(k), q: vistos.get(k).mejorar.join(", ") })).join("; ") }) }) : null);
    const filas = claves.map((k) => {
      const d = c.partidas.get(k), n = d.juego.history().length, mano = Math.min(d.mano || 0, n);
      return el("tr", { "data-informe": k },
        el("td", { class: "py-1 pr-3 font-semibold", texto: verLugar(k) }),
        el("td", { class: "py-1 pr-3", texto: horaCR(c.desde.get(k)) + " – " + horaCR(c.mesas.get(k)) }),
        el("td", { class: "py-1 pr-3", texto: (d.equipo && d.equipo.tablero) || "—" }),
        el("td", { class: "py-1 pr-3", texto: d.equipo && d.equipo.luz ? tx(LUZ_TX[d.equipo.luz]) : "—" }),
        el("td", { class: "py-1 pr-3", texto: String(n - mano) }),
        el("td", { class: "py-1 pr-3", texto: String(mano) }),
        el("td", { class: "py-1 pr-3", texto: String(avisos(k, "ilegal")) }),
        el("td", { class: "py-1 pr-3", texto: String(avisos(k, "tablas")) }),
        el("td", { class: "py-1 pr-3", texto: d.resultado ? tx("corto_" + d.resultado) : "—" }),
        el("td", { class: "py-1", "data-mejorar": "", texto: vistos.get(k).mejorar.join(", ") || tx("vistazoNada") }));
    });
    // Lo de todos los torneos de esta computadora, por tablero y luz (ver anotarLectura).
    const historial = resumenLectura();
    const tablaHistorial = historial.length ? el("div", { class: "overflow-x-auto mt-3" },
      el("p", { class: "text-sm font-semibold", texto: tx("camarasLecturaTitulo") }),
      el("p", { class: C.nota, texto: tx("camarasLecturaTexto") }),
      el("table", { id: "pi-camaras-lectura", class: "text-sm mt-1" },
        el("thead", {}, el("tr", {}, th("camarasInfTablero"), th("camarasInfLuz"), th("camarasLecturaPartidas"), th("camarasInfSolas"), th("camarasInfMano"), th("camarasLecturaDudas"))),
        el("tbody", {}, historial.map((g) => el("tr", {},
          el("td", { class: "py-1 pr-3 font-semibold", texto: g.tablero || "—" }),
          el("td", { class: "py-1 pr-3", texto: g.luz ? tx(LUZ_TX[g.luz]) : "—" }),
          el("td", { class: "py-1 pr-3", texto: String(g.partidas) }),
          el("td", { class: "py-1 pr-3", texto: tx("camarasLecturaSolas", { s: g.jugadas - g.mano, n: g.jugadas, p: Math.round(100 * (g.jugadas - g.mano) / g.jugadas) }) }),
          el("td", { class: "py-1 pr-3", texto: String(g.mano) }),
          el("td", { class: "py-1 pr-3", texto: String(g.dudas) })))))) : null;
    // Se vuelve a pintar con cada jugada que llega: si estaba abierto, sigue abierto.
    const abierto = !!(document.getElementById("pi-camaras-informe") || {}).open;
    return el("details", { id: "pi-camaras-informe", class: "mt-2", open: abierto },
      el("summary", { class: "text-sm font-semibold cursor-pointer", texto: tx("camarasInforme") }),
      el("p", { class: C.nota, texto: tx("camarasInformeTexto") }),
      resumen,
      el("div", { class: "overflow-x-auto" }, el("table", { class: "text-sm mt-1" },
        el("thead", {}, el("tr", {}, th("camarasInfLugar"), th("camarasInfHoras"), th("camarasInfTablero"), th("camarasInfLuz"), th("camarasInfSolas"), th("camarasInfMano"), th("camarasInfIlegal"), th("camarasInfTablas"), th("camarasInfResultado"), th("camarasInfMejorar"))),
        el("tbody", {}, filas))),
      el("button", { type: "button", id: "pi-camaras-planillas", class: C.mini + " mt-2", onclick: planillasDeCamaras }, el("span", { "aria-hidden": "true", texto: "📝 " }), tx("camarasPlanillas")),
      tablaHistorial);
  }

  /* Cómo leyó cada cámara su partida, guardado en ESTA computadora para todos
   * los torneos (no va en el torneo, que se publica): una fila por partida
   * terminada, con el tablero y la luz que dice la cámara. Así quien organiza
   * sabe qué tableros conviene llevar. */
  const LECTURA_CAMARAS = "pareo_camaras_lectura_v1";
  const LUZ_TX = { poca: "luzPoca", normal: "luzNormal", mucha: "luzMucha" };
  function anotarLectura(v, clave, d) {
    const n = d.juego.history().length;
    if (!d.resultado || n < 2) return;
    const lista = leerJSON(LECTURA_CAMARAS, []).filter((x) => x.k !== v.id + "|" + d.ronda + "|" + clave);
    lista.push({ k: v.id + "|" + d.ronda + "|" + clave, tablero: (d.equipo && d.equipo.tablero) || "", luz: (d.equipo && d.equipo.luz) || null,
      jugadas: n, mano: Math.min(d.mano || 0, n), dudas: d.dudas || 0 });
    escribir(LECTURA_CAMARAS, JSON.stringify(lista.slice(-2000)));
  }
  function resumenLectura() {
    const grupos = new Map();
    for (const x of leerJSON(LECTURA_CAMARAS, [])) {
      const k = x.tablero + "|" + (x.luz || "");
      const g = grupos.get(k) || { tablero: x.tablero, luz: x.luz, partidas: 0, jugadas: 0, mano: 0, dudas: 0 };
      g.partidas++; g.jugadas += x.jugadas; g.mano += x.mano; g.dudas += x.dudas;
      grupos.set(k, g);
    }
    return [...grupos.values()].filter((g) => g.jugadas).sort((a, b) => (b.jugadas - b.mano) / b.jugadas - (a.jugadas - a.mano) / a.jugadas);
  }

  // Las planillas de anotación de la ronda en juego, de lo que mandaron las
  // cámaras (js/planilla-pdf.js, la misma de la cámara): una por jugador.
  let cargaPlanillas = null;
  function cargarPlanillas() {
    const una = (src) => new Promise((ok, mal) => { const sc = document.createElement("script"); sc.src = src; sc.onload = ok; sc.onerror = () => mal(new Error(src)); document.head.appendChild(sc); });
    if (!cargaPlanillas) cargaPlanillas = (window.ComandosTablero ? Promise.resolve() : una("js/comandos-tablero.js")).then(() => (window.PlanillaPDF ? null : una("js/planilla-pdf.js")));
    cargaPlanillas.catch(() => { cargaPlanillas = null; });
    return cargaPlanillas;
  }
  async function planillasDeCamaras() {
    const v = t(), c = estado.camaras;
    const partidas = [...c.partidas.entries()].sort((a, b) => ordenLugar(a[0], b[0]))
      .filter(([, d]) => d.ronda === v.rondas.length && d.juego.history().length && !d.juego.header().FEN)
      .map(([k, d]) => ({ jugadas: d.juego.history(), blancas: d.blancas, negras: d.negras, resultado: d.resultado || null,
        evento: v.nombre || "", ronda: v.rondas.length, mesa: verLugar(k), fecha: window.HoraCR ? HoraCR.hoy() : "" }));
    if (!partidas.length) { Avisos.avisar(tx("camarasPlanillasNinguna"), { tipo: "info" }); return; }
    try {
      await cargarPlanillas();
      await window.PlanillaPDF.descargar(partidas, "planillas-ronda-" + v.rondas.length + ".pdf", { en: idioma === "en" });
      Avisos.avisar(tx("camarasPlanillasListas", { n: partidas.length }), { tipo: "ok" });
    } catch (e) { Avisos.avisar(tx("camarasPlanillasError"), { tipo: "error" }); }
  }

  // ---------- Transmitir a Lichess ----------
  // Las partidas de las mesas de la ronda en juego (las de las cámaras y las
  // escritas a mano) y sus resultados van a una transmisión de Lichess de
  // quien organiza: POST /api/broadcast/round/{id}/push, con su clave
  // («study:write»). La transmisión y cada ronda se crean en Lichess: crearlas
  // desde acá no se puede (Lichess no le contesta a otra página fuera de
  // /api/), y pegar el enlace de la ronda es un clic. La clave queda solo en
  // esta computadora (nunca en el torneo, que se exporta y se publica); qué
  // ronda de Lichess es cada ronda, por torneo. Se manda como mucho una vez
  // cada 5 segundos, y una vez por minuto igual (un resultado anotado a mano).
  // Ver «Transmitir a Lichess» en docs/decisiones/juegos-y-torneos.md.
  const LICHESS_CLAVE = "pareo_lichess_clave_v1", LICHESS_RONDAS = "pareo_lichess_v1_";
  const LICHESS_API = "https://lichess.org/api/broadcast/round/";
  const RESULTADO_PGN = { "1-0": "1-0", "=": "1/2-1/2", "0-1": "0-1", "+-": "1-0", "-+": "0-1" };
  // El id de una RONDA: el enlace es lichess.org/broadcast/<torneo>/<ronda>/<id>
  // (el de la transmisión entera, /broadcast/<torneo>/<id>, no sirve para mandar).
  function rondaLichess(texto) {
    const x = String(texto || "").trim();
    if (/^[A-Za-z0-9]{8}$/.test(x)) return x;
    let u;
    try { u = new URL(x); } catch (e) { return null; }
    const p = u.pathname.split("/").filter(Boolean);
    return u.hostname === "lichess.org" && p[0] === "broadcast" && p.length === 4 && /^[A-Za-z0-9]{8}$/.test(p[3]) ? p[3] : null;
  }
  const rondasLichess = (id) => leerJSON(LICHESS_RONDAS + id, {});
  function pgnParaLichess(v) {
    const n = v.rondas.length, R = v.rondas[n - 1];
    const jugador = (lista, id) => (lista || []).find((j) => j.id === id) || {};
    const encabezado = (k, x) => "[" + k + ' "' + String(x == null ? "" : x).replace(/["\\\n\r]/g, "").slice(0, 120) + '"]';
    // Solo las jugadas de lo guardado (sin su cabecera ni su resultado) y el resultado anotado.
    const juego = (cab, pgn, r) => {
      const jugadas = String(pgn || "").replace(/^(\s*\[[^\]]*\]\s*)+/, "").replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/, "").trim();
      const res = RESULTADO_PGN[r] || "*";
      cab.push(["Result", res]);
      return cab.map(([k, x]) => encabezado(k, x)).join("\n") + "\n\n" + (jugadas ? jugadas + " " : "") + res;
    };
    const juegos = [];
    R.mesas.forEach((m, i) => {
      if (m.n == null || m.r === "--") return;
      const f = V.mesaFisica(v, i);
      const comun = [["Event", v.nombre || "Pareo Integral"], ["Site", v.ciudad || ""]];
      if (!E.esDeEquipos(v)) {
        const b = jugador(v.jugadores, m.b), ne = jugador(v.jugadores, m.n);
        juegos.push(juego(comun.concat([["Round", n + "." + f], ["White", b.nombre], ["Black", ne.nombre],
          ["WhiteElo", Number(b.elo) || ""], ["BlackElo", Number(ne.elo) || ""]]).filter(([, x]) => x !== ""), m.pgn, m.r));
        return;
      }
      const eb = jugador(v.jugadores, m.b), en = jugador(v.jugadores, m.n);
      const copia = Object.assign({}, m);
      if (!copia.alineacion) copia.alineacion = { b: E.alineacionPorOmision(v, m.b), n: E.alineacionPorOmision(v, m.n) };
      for (const x of E.tablerosDe(v, copia)) {
        if (!x.blancas || !x.negras) continue;
        const eqB = x.bBlancas ? eb : en, eqN = x.bBlancas ? en : eb;
        const b = jugador(eqB.integrantes, x.blancas), ne = jugador(eqN.integrantes, x.negras);
        const p = (m.partidas || [])[x.k] || {};
        juegos.push(juego(comun.concat([["Round", n + "." + f + "." + (x.k + 1)], ["White", b.nombre], ["Black", ne.nombre],
          ["WhiteTeam", eqB.nombre], ["BlackTeam", eqN.nombre], ["WhiteElo", Number(b.elo) || ""], ["BlackElo", Number(ne.elo) || ""]]).filter(([, y]) => y !== ""), p.pgn, x.r));
      }
    });
    return juegos.slice(0, 100).join("\n\n\n");
  }
  let lichessReloj = null;
  function lichessPronto() {
    if (lichessReloj || !estado.camaras || !leer(LICHESS_CLAVE)) return;
    const pasado = Date.now() - ((estado.lichess && estado.lichess.hora) || 0);
    lichessReloj = setTimeout(() => { lichessReloj = null; mandarALichess(); }, Math.max(0, 5000 - pasado));
  }
  setInterval(() => lichessPronto(), 60000);
  async function mandarALichess() {
    const v = torneoDeCamaras(), clave = leer(LICHESS_CLAVE);
    if (!v || !clave || !v.rondas.length) return;
    const n = v.rondas.length, ronda = rondasLichess(estado.camaras.idTorneo)[n];
    if (!ronda) { estado.lichess = { falta: n }; pintarCamaras(); return; }
    const pgn = pgnParaLichess(v);
    let r = { hora: Date.now(), n, partidas: 0, error: null };
    try {
      const res = await fetch(LICHESS_API + ronda.id + "/push", { method: "POST", headers: { Authorization: "Bearer " + clave, "Content-Type": "text/plain" }, body: pgn });
      const datos = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) r.error = tx("lichessClaveMala");
      else if (!res.ok) r.error = tx("lichessError", { e: (datos && datos.error) || "HTTP " + res.status });
      else r.partidas = Array.isArray(datos.games) ? datos.games.length : 0;
    } catch (e) { r.error = tx("lichessError", { e: e.message }); }
    estado.lichess = r;
    pintarCamaras();
  }
  async function conectarLichess() {
    const v = t();
    if (!estado.camaras || estado.camaras.idTorneo !== estado.id) return;
    const n = v.rondas.length, guardada = !!leer(LICHESS_CLAVE);
    const res = await Avisos.formulario({ titulo: tx("lichessTitulo"), texto: tx("lichessTexto", { r: n }), aceptar: tx("lichessConectar"), cancelar: tx("cancelar"),
      campos: [{ nombre: "clave", etiqueta: tx("lichessClave"), valor: "", max: 200, ayuda: guardada ? tx("lichessClaveGuardada") : undefined },
        { nombre: "ronda", etiqueta: tx("lichessRonda", { r: n }), valor: "", max: 300 }] });
    if (!res) return;
    const clave = String(res.clave || "").trim();
    if (!clave && !guardada) { Avisos.avisar(tx("lichessSinClave"), { tipo: "error" }); return; }
    const id = rondaLichess(res.ronda);
    if (!id) { Avisos.avisar(tx("lichessRondaMala"), { tipo: "error" }); return; }
    if (clave) escribir(LICHESS_CLAVE, clave);
    const rondas = rondasLichess(estado.id);
    rondas[n] = { id, url: /^https:\/\/lichess\.org\//.test(String(res.ronda).trim()) ? String(res.ronda).trim() : "https://lichess.org/broadcast/-/-/" + id };
    escribir(LICHESS_RONDAS + estado.id, JSON.stringify(rondas));
    await mandarALichess();
  }
  function dejarLichess() {
    try { localStorage.removeItem(LICHESS_CLAVE); localStorage.removeItem(LICHESS_RONDAS + estado.id); } catch (e) { /* sin almacenamiento */ }
    estado.lichess = null;
    pintarCamaras();
    Avisos.avisar(tx("lichessDejado"));
  }
  // Lo de Lichess dentro de la caja de las cámaras.
  function pintarLichess(v) {
    const clave = leer(LICHESS_CLAVE), n = v.rondas.length, ronda = rondasLichess(estado.id)[n];
    const lx = estado.lichess;
    if (!clave) return el("div", { id: "pi-lichess", class: "mt-2" }, el("button", { type: "button", id: "pi-lichess-conectar", class: C.mini, onclick: conectarLichess }, tx("lichessBoton")));
    const texto = !ronda ? tx("lichessFaltaRonda", { r: n }) : lx && lx.error ? lx.error : lx && lx.hora ? tx("lichessEnviado", { n: lx.partidas, r: lx.n, h: horaCR(lx.hora) }) : "";
    return el("div", { id: "pi-lichess", class: "mt-2 text-sm" },
      el("p", { id: "pi-lichess-estado", role: "status", class: lx && lx.error ? "font-semibold" : "", texto }),
      el("div", { class: "flex flex-wrap gap-2 mt-1" },
        !ronda ? el("button", { type: "button", id: "pi-lichess-conectar", class: C.mini, onclick: conectarLichess }, tx("lichessRondaBoton", { r: n })) : null,
        ronda ? el("a", { href: ronda.url, target: "_blank", rel: "noopener", class: C.mini }, tx("lichessVer")) : null,
        el("button", { type: "button", id: "pi-lichess-dejar", class: C.mini, onclick: dejarLichess }, tx("lichessDejar"))));
  }

  // Arriba de la ronda: con qué código se escucha y qué mesas mandan.
  /* El latido de cada cámara (cada 30 s y cuando algo cambia): que sigue
   * viva aunque nadie mueva, su batería y si la mesa está lista (lee las 64,
   * hay luz, transmite, la pantalla no se apaga). Ver «Que no se caiga» en
   * js/camara-tablero.js. */
  const FALTA_TX = { lectura: "camaraFaltaLectura", luz: "camaraFaltaLuz", bateria: "camaraFaltaBateria", senal: "camaraFaltaSenal", pantalla: "camaraFaltaPantalla" };
  const SIN_NOTICIAS_MS = 90000;
  function latidoDeCamara(p) {
    const v = torneoDeCamaras();
    if (!v || !v.publicado || !v.rondas.length || p.torneo !== v.publicado.id || Number(p.ronda) !== v.rondas.length) return;
    const mesa = Number(p.mesa), tablero = E.esDeEquipos(v) ? Number(p.tablero) || null : null;
    if (!v.rondas[v.rondas.length - 1].mesas.some((x, k) => V.mesaFisica(v, k) === mesa)) return;
    const clave = claveCamara(mesa, tablero);
    const nivel = p.bateria && Number.isFinite(p.bateria.nivel) ? Math.max(0, Math.min(100, Math.round(p.bateria.nivel))) : null;
    const faltan = p.lista && Array.isArray(p.lista.faltan) ? p.lista.faltan.filter((k) => FALTA_TX[k]).slice(0, 5) : null;
    estado.camaras.latidos.set(clave, { h: Date.now(), ronda: v.rondas.length, bateria: nivel === null ? null : { nivel, cargando: !!p.bateria.cargando }, faltan });
    const nueva = !estado.camaras.mesas.has(clave);
    estado.camaras.mesas.set(clave, Date.now());
    if (nueva) pintarCamaras(); else relojesCamaras();
  }
  // Las mesas de la ronda que necesitan a alguien: sin noticias, sin batería o por revisar.
  function saludCamaras(v) {
    const c = estado.camaras, ahora = Date.now(), lineas = [];
    const sinNoticias = [], baja = [], revisar = [], listas = [];
    for (const clave of [...c.mesas.keys()].sort(ordenLugar)) {
      const d = c.partidas.get(clave), l = c.latidos.get(clave);
      const ronda = (d && d.ronda) || (l && l.ronda);
      if (ronda !== v.rondas.length || (d && d.resultado)) continue;
      const hace = ahora - c.mesas.get(clave);
      if (hace > SIN_NOTICIAS_MS) sinNoticias.push(tx("camaraSinNoticiasMesa", { m: verLugar(clave), n: Math.floor(hace / 60000) }));
      if (l && l.bateria && !l.bateria.cargando && l.bateria.nivel < 20) baja.push(tx("camaraBateriaMesa", { m: verLugar(clave), n: l.bateria.nivel }));
      if (l && l.faltan) {
        if (l.faltan.length) revisar.push(tx("camaraRevisarMesa", { m: verLugar(clave), q: l.faltan.map((k) => tx(FALTA_TX[k])).join(", ") }));
        else listas.push(verLugar(clave));
      }
    }
    if (sinNoticias.length) lineas.push(tx("camarasSinNoticias", { l: sinNoticias.join(", ") }));
    if (baja.length) lineas.push(tx("camarasBateriaBaja", { l: baja.join(", ") }));
    if (revisar.length) lineas.push(tx("camarasRevisar", { l: revisar.join("; ") }));
    if (listas.length) lineas.push(tx("camarasListas", { l: listas.join(", ") }));
    return lineas;
  }

  /* Las mesas de la ronda cuyo reloj de la cámara corre con menos de un
   * minuto: cada segundo, solo ese renglón (la caja no se vuelve a armar). */
  function relojesCamaras() {
    const e = $("pi-camaras-poco"), v = estado.camaras && estado.camaras.idTorneo === estado.id ? t() : null;
    if (!e || !v || !window.PartidaEnVivo) return;
    const P = window.PartidaEnVivo, cortas = [];
    for (const [clave, d] of [...estado.camaras.partidas.entries()].sort((a, b) => ordenLugar(a[0], b[0]))) {
      if (d.ronda !== v.rondas.length) continue;
      const r = P.relojDe(d), poco = P.pocoTiempo(r);
      if (poco) cortas.push(tx("camaraPocoMesa", { m: verLugar(clave), q: colorTx(poco), t: P.tiempoReloj(r[poco]) }));
    }
    const texto = cortas.length ? tx("camaraPocoTiempo", { l: cortas.join(", ") }) : "";
    e.hidden = !cortas.length;
    if (e.textContent !== texto) e.textContent = texto;
    const s = $("pi-camaras-salud");
    if (s) {
      const lineas = saludCamaras(v), txt = lineas.join("\n");
      s.hidden = !lineas.length;
      if (s.dataset.txt !== txt) { s.dataset.txt = txt; s.replaceChildren(...lineas.map((x) => el("li", { texto: x }))); }
    }
  }
  setInterval(relojesCamaras, 1000);
  function pintarCamaras() {
    const caja = $("pi-camaras-caja");
    if (!caja) return;
    const v = t();
    const activas = !!(v.camaras && v.camaras.activo);
    caja.hidden = !activas;
    if (!activas) { caja.replaceChildren(); return; }
    const mesas = estado.camaras && estado.camaras.idTorneo === estado.id ? [...estado.camaras.mesas.keys()].sort(ordenLugar).map(verLugar) : [];
    const dejar = el("button", { type: "button", id: "pi-camaras-dejar", class: C.mini, onclick: dejarCamaras }, tx("camarasDejar"));
    const alertas = estado.camaras && estado.camaras.idTorneo === estado.id ? [...estado.camaras.alertas.entries()].sort((a, b) => ordenLugar(a[1].m, b[1].m)) : [];
    const listaAlertas = alertas.length ? el("ul", { id: "pi-camaras-alertas", class: "mt-2 space-y-1 text-sm" }, alertas.map(([k, a]) => el("li", { class: "flex flex-wrap items-center gap-2", "data-alerta": String(a.m), "data-tipo": a.tipo },
      el("span", { class: "font-semibold", texto: tx(a.tipo === "ilegal" ? "camaraAlertaFila" : "camaraTablasFila", { m: verLugar(a.m), h: horaCR(a.h), q: a.tipo === "ilegal" ? "" : a.tipo === "bandera" && a.color ? tx("camaraBanderaDe", { q: colorTx(a.color) }) : tx(TIPOS_ALERTA[a.tipo] + "Corto") }) }),
      fotoDe(a.m, a.h) ? botonFoto(fotoDe(a.m, a.h)) : null,
      el("button", { type: "button", class: C.mini, onclick: () => { estado.camaras.alertas.delete(k); pintarCamaras(); } }, tx("camaraAlertaVista"))))) : null;
    caja.replaceChildren(el("h3", { class: "font-semibold" }, el("span", { "aria-hidden": "true", texto: "🎥 " }), tx("camarasCajaTitulo")),
      el("p", { class: C.nota, texto: tx("camarasCajaTexto", { c: v.camaras.codigo }) }),
      el("p", { id: "pi-camaras-mesas", class: "text-sm mt-1", texto: mesas.length ? tx("camarasMesas", { m: mesas.join(", ") }) : tx("camarasNinguna") }),
      el("p", { id: "pi-camaras-poco", class: "text-sm font-semibold text-red-800 dark:text-red-200 mt-1", hidden: true }),
      el("ul", { id: "pi-camaras-salud", class: "text-sm mt-1 space-y-0.5", hidden: true }),
      listaAlertas, estado.camaras && estado.camaras.idTorneo === estado.id ? informeCamaras() : null,
      estado.camaras && estado.camaras.idTorneo === estado.id ? pintarLichess(v) : null, el("div", { class: "mt-2" }, dejar));
    relojesCamaras();
  }

  // ---------- El chat con los adjuntos y sus llamadas ----------
  // Los mensajes van con el torneo (`chat`, los últimos 300): a todos o a un
  // adjunto, y de cada adjunto al principal. Llegan por el mismo canal del
  // adjunto, con el estado (`enviarAdjunto`). Una llamada («Te necesitan en
  // la mesa X») queda en `llamadas` hasta que el principal toca «Voy».
  const QUIEN_CHAT = { true: "yo", false: "otro" };
  const chatDe = (v, codigo) => (v.chat || []).filter((x) => x.para === "todos" || x.para === codigo || x.de === codigo);
  function guardarDelAdjunto(v) {
    if (v === t()) guardar();
    else { escribir(PREFIJO + estado.adjuntos.idTorneo, JSON.stringify(v)); enviarAdjuntos(); }
  }
  function agregarChat(v, x) { v.chat = (v.chat || []).concat(Object.assign({ hora: Date.now() }, x)).slice(-300); }
  function recibirChatDeAdjunto(codigo, p) {
    const v = torneoDelAdjunto();
    const a = v && adjuntoActivo(v, codigo);
    const texto = typeof p.texto === "string" ? p.texto.trim().slice(0, 300) : "";
    if (!a || !texto) return;
    agregarChat(v, { de: codigo, nombre: a.nombre || "", para: "principal", texto });
    guardarDelAdjunto(v);
    Avisos.avisar(tx("chatLlego", { n: a.nombre || a.rango, t: texto }), { tipo: "info" });
    pintarChat();
  }
  function recibirLlamada(codigo, p) {
    const v = torneoDelAdjunto();
    const a = v && adjuntoActivo(v, codigo);
    if (!a || !v.rondas.length) return;
    const [desde, hasta] = a.rango.split("-").map(Number);
    const mesa = Number(p.mesa);
    if (!(mesa >= desde && mesa <= hasta)) return;
    v.llamadas = (v.llamadas || []).concat({ id: nuevoId(), hora: Date.now(), codigo, nombre: a.nombre || "", mesa, ronda: v.rondas.length }).slice(-100);
    guardarDelAdjunto(v);
    Avisos.avisar(tx("llamadaLlego", { n: a.nombre || a.rango, m: V.mesaFisica(v, mesa - 1) }), { tipo: "error" });
    pintarLlamadas();
  }
  // Las llamadas sin atender, arriba de la ronda, con «Voy» (que se lo dice
  // al adjunto también por el chat).
  function pintarLlamadas() {
    const caja = $("pi-llamadas");
    if (!caja) return;
    const v = t();
    const pendientes = (v.llamadas || []).filter((x) => !x.atendida);
    caja.replaceChildren();
    caja.hidden = !pendientes.length;
    if (!pendientes.length) return;
    caja.append(el("h3", { id: "pi-llamadas-titulo", class: "font-semibold" }, el("span", { "aria-hidden": "true", texto: "🔔 " }), tx("llamadasTitulo")),
      el("ul", { class: "mt-2 space-y-2 text-sm" }, pendientes.map((x) => el("li", { class: "flex flex-wrap items-center gap-2", "data-llamada": x.id },
        el("span", { class: "font-semibold", texto: tx("llamadaFila", { n: x.nombre || "—", m: V.mesaFisica(v, x.mesa - 1), h: horaCR(x.hora) }) }),
        el("button", { type: "button", class: C.boton + " px-3 py-1", "data-voy": x.id, onclick: () => {
          x.atendida = Date.now();
          agregarChat(v, { de: "principal", nombre: v.arbitro || tx("principal"), para: x.codigo, texto: tx("voyMesa", { m: V.mesaFisica(v, x.mesa - 1) }) });
          guardar();
          pintarLlamadas();
          pintarChat();
        } }, tx("voy"))))));
  }
  // El chat del principal: a todos los adjuntos o a uno.
  function pintarChat() {
    const caja = $("pi-chat-adjuntos");
    if (!caja) return;
    const v = t();
    const activos = (v.adjuntos || []).filter((a) => a.activo);
    caja.hidden = !activos.length;
    if (!activos.length) { caja.replaceChildren(); return; }
    const nombreDe = (c) => ((v.adjuntos || []).find((a) => a.codigo === c) || {}).nombre || c;
    const lista = el("ol", { id: "pi-chat-lista", class: "mt-2 space-y-1 text-sm max-h-64 overflow-y-auto", "aria-live": "polite" },
      (v.chat || []).slice(-50).map((x) => el("li", { class: x.de === "principal" ? "pi-chat-mio" : "" },
        el("span", { class: "text-xs " + C.nota, texto: horaCR(x.hora) + " · " }),
        el("span", { class: "font-semibold", texto: (x.de === "principal" ? tx("chatYo") + (x.para === "todos" ? " → " + tx("chatTodos") : " → " + nombreDe(x.para)) : x.nombre || nombreDe(x.de)) + ": " }),
        el("span", { texto: x.texto }))));
    const para = el("select", { id: "pi-chat-para", class: C.campoChico, "aria-label": tx("chatPara") },
      el("option", { value: "todos", texto: tx("chatTodos") }), activos.map((a) => el("option", { value: a.codigo, texto: a.nombre || a.rango })));
    if (caja.__para) para.value = caja.__para;
    para.addEventListener("change", () => { caja.__para = para.value; });
    const texto = el("input", { id: "pi-chat-texto", type: "text", maxlength: "300", autocomplete: "off", class: C.campo, "aria-label": tx("chatEscribe") });
    const mandar = el("button", { type: "submit", id: "pi-chat-mandar", class: C.botonSec }, tx("chatMandar"));
    const form = el("form", { class: "mt-2 flex flex-wrap items-center gap-2" }, para, texto, mandar);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const t2 = texto.value.trim().slice(0, 300);
      if (!t2) return;
      agregarChat(v, { de: "principal", nombre: v.arbitro || tx("principal"), para: para.value, texto: t2 });
      guardar();
      pintarChat();
      const x = $("pi-chat-texto"); if (x) x.focus();
    });
    caja.replaceChildren(el("h3", { class: "font-semibold" }, tx("chatTitulo")), lista, form);
    lista.scrollTop = lista.scrollHeight;
  }

  // Una nota de un adjunto para el informe: va a las incidencias de la
  // última ronda, con su nombre y, si la dice, la mesa (de su rango).
  function recibirNotaDeAdjunto(codigo, p) {
    const v = torneoDelAdjunto();
    const a = v && adjuntoActivo(v, codigo);
    const R = v && v.rondas[v.rondas.length - 1];
    const texto = typeof p.texto === "string" ? p.texto.trim().slice(0, 500) : "";
    const autor = typeof p.autor === "string" ? p.autor.trim().slice(0, 60) : "";
    if (!a || !R || !texto || !autor) return;
    const [desde, hasta] = a.rango.split("-").map(Number);
    const mesa = Number(p.mesa);
    const enRango = mesa >= desde && mesa <= hasta && mesa <= R.mesas.length;
    // El tipo y el artículo, solo de las listas; el jugador, solo de su mesa
    // (por su lado: «b», «n», «t2b»… el celular no ve los ids).
    const tipo = ["reclamo", "sancion", "decision", "otra"].includes(p.tipo) ? p.tipo : "adjunto";
    const nueva = { hora: Date.now(), tipo, autor, texto, mesa: enRango ? mesa : null, porAdjunto: true };
    if (Object.prototype.hasOwnProperty.call(V.ARTICULOS, p.articulo)) nueva.articulo = p.articulo;
    const elegido = enRango && typeof p.lado === "string" ? jugadoresDeMesa(v, R.mesas[mesa - 1]).find(([k]) => k === p.lado) : null;
    if (elegido) nueva.jugador = elegido[1];
    R.incidencias = (R.incidencias || []).concat(nueva);
    if (v === t()) { guardar(); if (estado.ficha === "rondas" && estado.ronda === v.rondas.length - 1) pintarRondas(); }
    else escribir(PREFIJO + estado.adjuntos.idTorneo, JSON.stringify(v));
    Avisos.avisar(tx("notaAdjuntoLlego", { a: autor }), { tipo: "info" });
    const canal = estado.adjuntos && estado.adjuntos.canales.get(codigo);
    if (canal) canal.send({ type: "broadcast", event: "notaRecibida", payload: { hora: Date.now() } });
  }

  // Un adjunto mandó otro resultado para una mesa (o tablero) que ya estaba
  // anotada: no se pisa, pero queda para que el principal lo confirme.
  function anotarDiscrepancia(v, R, x) {
    R.discrepancias = R.discrepancias || [];
    if (R.discrepancias.some((y) => y.mesa === x.mesa && y.tablero === x.tablero && y.r === x.r && !y.resuelta)) return;
    R.discrepancias.push(Object.assign({ hora: Date.now() }, x));
    if (v === t()) { guardar(); if (estado.ficha === "rondas" && estado.ronda === v.rondas.length - 1) pintarRondas(); }
    else escribir(PREFIJO + estado.adjuntos.idTorneo, JSON.stringify(v));
    Avisos.avisar(tx("discrepanciaLlego", { m: x.mesa }), { tipo: "error" });
  }

  // Quiénes juegan en una mesa, para elegir a quién va una incidencia: en
  // individual, los dos; en equipos, cada integrante con su tablero. Con
  // la clave corta que usa el celular del adjunto («b», «n», «t2b»…).
  // El nombre de un jugador o de un integrante de un equipo, por su id.
  function nombreDeQuien(id) {
    const j = jugador(id);
    if (j) return j.nombre;
    for (const e of t().jugadores) { const y = (e.integrantes || []).find((z) => z.id === id); if (y) return y.nombre; }
    return "?";
  }
  function jugadoresDeMesa(v, m) {
    if (!m || m.n == null) return [];
    if (!E.esDeEquipos(v)) return [["b", m.b, tx("blancas") + ": " + nombreDe(m.b)], ["n", m.n, tx("negras") + ": " + nombreDe(m.n)]];
    const copia = m.alineacion ? m : E.prepararMesa(v, JSON.parse(JSON.stringify(m)));
    const out = [];
    for (const x of E.tablerosDe(v, copia)) {
      const eb = x.bBlancas ? m.b : m.n, en = x.bBlancas ? m.n : m.b;
      const nom = (idE, idJ) => ((jugador(idE) || { integrantes: [] }).integrantes.find((y) => y.id === idJ) || {}).nombre;
      if (x.blancas) out.push(["t" + (x.k + 1) + "b", x.blancas, tx("tableroN", { t: x.k + 1 }) + " · " + tx("blancas") + ": " + nom(eb, x.blancas)]);
      if (x.negras) out.push(["t" + (x.k + 1) + "n", x.negras, tx("tableroN", { t: x.k + 1 }) + " · " + tx("negras") + ": " + nom(en, x.negras)]);
    }
    return out;
  }

  // ---------- Las marcas de las incidencias junto a cada nombre ----------
  // «i» por jugada ilegal y «!» por cada otra irregularidad de esta ronda
  // (V.marcasIncidencias). La marca es un botón chico: al tocarlo se abre,
  // debajo de la mesa, de qué fue cada una; así no estorba a la vista.
  function textoIncidencia(x) {
    return horaCR(x.hora) + " · " + tx(TEXTO_INCIDENCIA[x.tipo] || TEXTO_INCIDENCIA.otra) + (x.articulo ? " (" + V.articuloTexto(x.articulo) + ")" : "") +
      (x.autor ? " · " + x.autor : "") + ": " + x.texto;
  }
  // Devuelve [la marca, su detalle] (o [null, null] si no tiene nada).
  function marcaDe(marcas, id, nombre, alAbrir) {
    const m = marcas.get(id);
    if (!m) return [null, null];
    const idDet = "pi-inc-det-" + id + "-" + Math.random().toString(36).slice(2, 7);
    const det = el("div", { id: idDet, class: "pi-inc-detalle text-sm", hidden: true },
      el("p", { class: "font-semibold", texto: nombre + (m.ilegales >= 2 ? " · " + tx("marcaPierde") : m.ilegales === 1 ? " · " + tx("marcaUnaIlegal") : "") }),
      el("ul", { class: "list-disc pl-5" }, m.items.map((x) => el("li", { texto: textoIncidencia(x) }))));
    const b = el("button", { type: "button", class: "pi-marca-inc", "data-marca": V.textoMarca(m), "aria-expanded": "false", "aria-controls": idDet,
      title: tx("marcaVer", { n: nombre, i: m.ilegales, x: m.irregularidades }), "aria-label": tx("marcaVer", { n: nombre, i: m.ilegales, x: m.irregularidades }) }, V.textoMarca(m));
    b.addEventListener("click", () => {
      det.hidden = !det.hidden;
      b.setAttribute("aria-expanded", det.hidden ? "false" : "true");
      if (alAbrir) alAbrir();
    });
    return [b, det];
  }

  // ---------- Revisar el pareo antes de anunciarlo ----------
  // Lo que conviene mirar en la última ronda emparejada, mientras no tenga
  // resultados (V.revisarPareo). Si algo no gusta, «Deshacer el
  // emparejamiento» y volver a emparejar; si está bien, «Visto».
  function pintarRevisionPareo(caja, r) {
    const v = t();
    const R = v.rondas[r];
    if (r !== v.rondas.length - 1 || R.pareoVisto || R.mesas.some((m) => m.n != null && m.r && !E.esDeEquipos(v) && m.r !== "+-" && m.r !== "-+" && m.r !== "--")) return;
    const avisos = V.revisarPareo(v, r);
    if (!avisos.length) return;
    const texto = (x) => x.tipo === "centro" ? tx("pareoCentro", { m: x.mesa + 1, c: x.centro, b: x.b, n: x.n })
      : x.tipo === "colores" ? tx("pareoColores", { m: x.mesa + 1, j: x.nombre, c: tx(x.color === "w" ? "blancas" : "negras") })
      : tx("pareoPuntos", { m: x.mesa + 1, b: x.b, n: x.n, pb: puntosTexto(x.pb), pn: puntosTexto(x.pn) });
    const visto = el("button", { type: "button", id: "pi-pareo-visto", class: C.mini }, tx("pareoVisto"));
    visto.addEventListener("click", () => { R.pareoVisto = true; guardar(); pintarRondas(); });
    caja.append(el("section", { id: "pi-revision-pareo", class: "no-imprimir mb-4 rounded-xl border-2 border-accent-500 p-3", "aria-labelledby": "pi-revision-pareo-titulo" },
      el("h3", { id: "pi-revision-pareo-titulo", class: "font-semibold", texto: tx("pareoTitulo") }),
      el("p", { class: C.nota, texto: tx("pareoTexto") }),
      el("ul", { class: "mt-2 space-y-1 text-sm list-disc pl-5" }, avisos.map((x) => el("li", { texto: texto(x) }))),
      el("div", { class: "mt-2" }, visto)));
  }

  // ---------- Los resultados para confirmar ----------
  // Las sorpresas de Elo (V.sorpresas) y lo que un adjunto anotó distinto.
  // No bloquea nada: cada uno se confirma con un botón, o se cambia.
  function pintarConfirmar(caja, r) {
    const v = t();
    const R = v.rondas[r];
    const vistas = new Set(R.confirmadas || []);
    const sorpresas = V.sorpresas(v, r).filter((x) => !vistas.has(x.mesa + "|" + x.r));
    const discrepancias = (R.discrepancias || []).map((x, k) => Object.assign({ k }, x)).filter((x) => !x.resuelta);
    const deCamaras = (R.deCamaras || []).map((x, k) => Object.assign({ k }, x)).filter((x) => !x.resuelta);
    if (!sorpresas.length && !discrepancias.length && !deCamaras.length) return;
    const lista = el("ul", { class: "mt-2 space-y-2 text-sm" });
    for (const x of sorpresas) {
      const bien = el("button", { type: "button", class: C.mini, "data-confirmar": String(x.mesa) }, tx("confirmarBien"));
      bien.addEventListener("click", () => { R.confirmadas = (R.confirmadas || []).concat(x.mesa + "|" + x.r); guardar(); pintarRondas(); });
      lista.append(el("li", { class: "flex flex-wrap items-center gap-2" },
        el("span", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }),
          tx("sorpresaTexto", { m: x.mesa + 1, g: x.gana, p: x.pierde, d: x.dif })), bien));
    }
    for (const x of discrepancias) {
      const dejar = el("button", { type: "button", class: C.mini, "data-discrepancia": String(x.k) }, tx("discrepanciaDejar", { r: tx("corto_" + x.ya) }));
      dejar.addEventListener("click", () => { R.discrepancias[x.k].resuelta = "dejar"; guardar(); pintarRondas(); });
      const poner = el("button", { type: "button", class: C.mini, "data-poner": String(x.k) }, tx("discrepanciaPoner", { r: tx("corto_" + x.r) }));
      poner.addEventListener("click", () => {
        const m = R.mesas[x.mesa - 1];
        if (x.tablero) { E.prepararMesa(v, m); m.partidas[x.tablero - 1].r = x.r; m.r = E.resultadoEncuentro(v, m); }
        else m.r = x.r;
        R.discrepancias[x.k].resuelta = "poner";
        guardar(); pintarRondas();
      });
      lista.append(el("li", { class: "flex flex-wrap items-center gap-2" },
        el("span", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }),
          tx(x.tablero ? "discrepanciaTablero" : "discrepanciaTexto", { m: x.mesa, t: x.tablero, r: tx("corto_" + x.r), y: tx("corto_" + x.ya) })),
        dejar, r === v.rondas.length - 1 ? poner : null));
    }
    for (const x of deCamaras) {
      const m = R.mesas[x.mesa - 1];
      // En un encuentro por equipos, el resultado es del tablero; el del encuentro sale de los tableros.
      const ahora = () => (x.tablero ? (E.prepararMesa(v, m).partidas[x.tablero - 1] || {}).r : m.r);
      const ya = m ? ahora() : null;
      const anotar = el("button", { type: "button", class: C.mini, "data-camara-anotar": String(x.k) }, tx("camaraAnotar", { r: tx("corto_" + x.r) }));
      anotar.addEventListener("click", async () => {
        const antes = ahora();
        if (antes && antes !== x.r) {
          if (!(await confirmarCambio(r, x.mesa - 1, antes, x.r, x.tablero))) return;
          anotarCorreccion(R, x.mesa - 1, antes, x.r, tx("correccionCamara"), x.tablero);
        }
        if (x.tablero) { m.partidas[x.tablero - 1].r = x.r; m.r = E.resultadoEncuentro(v, m); }
        else m.r = x.r;
        R.deCamaras[x.k].resuelta = "anotado";
        guardar(); pintarRondas();
      });
      const descartar = el("button", { type: "button", class: C.mini, "data-camara-descartar": String(x.k) }, tx("camaraDescartar"));
      descartar.addEventListener("click", () => { R.deCamaras[x.k].resuelta = "descartado"; guardar(); pintarRondas(); });
      lista.append(el("li", { class: "flex flex-wrap items-center gap-2" },
        el("span", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }),
          tx(ya && ya !== x.r ? "camaraDistinto" : "camaraConfirmar", { m: verLugar(claveCamara(V.mesaFisica(v, x.mesa - 1), x.tablero)), r: tx("corto_" + x.r), y: ya ? tx("corto_" + ya) : "" })),
        r === v.rondas.length - 1 ? anotar : null, descartar,
        fotoDe(claveCamara(V.mesaFisica(v, x.mesa - 1), x.tablero), x.hora) ? botonFoto(fotoDe(claveCamara(V.mesaFisica(v, x.mesa - 1), x.tablero), x.hora)) : null));
    }
    caja.append(el("section", { id: "pi-confirmar", class: "no-imprimir mb-4 rounded-xl border-2 border-accent-500 p-3", "aria-labelledby": "pi-confirmar-titulo" },
      el("h3", { id: "pi-confirmar-titulo", class: "font-semibold", texto: tx("confirmarTitulo") }),
      el("p", { class: C.nota, texto: tx("confirmarTexto", { d: V.DIFERENCIA_SORPRESA }) }), lista));
  }

  async function mostrarAdjuntos(cont) {
    const v = t();
    const activos = (v.adjuntos || []).filter((a) => a.activo);
    cont.hidden = !activos.length;
    if (!activos.length) return;
    try { await PareoQr.cargar(); } catch (e) { Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" }); return; }
    const lista = el("div", { class: "grid sm:grid-cols-2 gap-3 mt-2" });
    for (const a of activos) {
      const url = location.origin + location.pathname + "#adjunto=" + a.codigo + "&m=" + a.rango;
      const copiar = el("button", { type: "button", class: C.mini }, tx("copiarEnlace"));
      copiar.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(url); Avisos.avisar(tx("enlaceCopiado")); }
        catch (e) { Avisos.avisar(tx("noCopia"), { tipo: "error" }); }
      });
      const apagar = el("button", { type: "button", class: C.miniPeligro, "data-apagar": a.codigo }, tx("adjuntoApagar"));
      apagar.addEventListener("click", async () => {
        const ok = await Avisos.confirmar(tx("adjuntoApagarConfirmar", { r: a.rango }), { aceptar: tx("adjuntoApagar"), peligro: true });
        if (!ok) return;
        a.activo = false;
        guardar();
        await conectarAdjuntos();
        pintarRondas();
        Avisos.avisar(tx("adjuntoApagado", { r: a.rango }));
      });
      lista.append(el("div", { class: "rounded-xl border border-brand-200 dark:border-brand-700 p-3", "data-adjunto": a.codigo },
        el("h4", { class: "font-semibold", texto: (a.nombre ? a.nombre + " · " : "") + tx("adjuntoListo", { r: a.rango }) }),
        el("div", { class: "w-32 bg-white p-2 rounded-lg mt-2" }, PareoQr.svg(url, tx("qrEtiqueta"))),
        el("p", { class: "pi-adjunto-url text-xs break-all mt-2 font-mono", texto: url }),
        el("div", { class: "flex flex-wrap gap-2 mt-1" }, copiar, apagar)));
    }
    cont.replaceChildren(el("p", { class: C.nota, texto: tx("adjuntoAyuda") }), lista);
  }

  // ---------- Los capitanes confirman la alineación desde su celular ----------
  // Un enlace por equipo (#capitan=<código>), guardado en el torneo
  // (`capitanes`: { idEquipo: código }). El capitán marca a los que juegan y
  // lo manda; esta pestaña lo acepta solo en la última ronda, si su
  // encuentro todavía no tiene ningún tablero anotado, y si todos son de su
  // equipo (hasta 4, en el orden de tableros). Queda dicho en el encuentro.
  function asegurarCapitanes() {
    const v = t();
    v.capitanes = v.capitanes || {};
    for (const e of v.jugadores) if (!v.capitanes[e.id]) v.capitanes[e.id] = nuevoCodigoVivo();
  }
  async function conectarCapitanes() {
    const v = t();
    const codigos = Object.entries(v.capitanes || {});
    if (!codigos.length) return true;
    if (estado.capitanes && estado.capitanes.idTorneo !== estado.id) desconectarCapitanes();
    if (!estado.capitanes) estado.capitanes = { idTorneo: estado.id, canales: new Map() };
    try { await PareoVer.cargarSupabase(); }
    catch (e) { Avisos.avisar(tx("errorEnVivo", { e: e.message }), { tipo: "error" }); return false; }
    for (const [idE, codigo] of codigos) {
      if (estado.capitanes.canales.has(codigo)) continue;
      const canal = window.sb.channel("pareo-capitan-" + codigo);
      canal.on("broadcast", { event: "pedir" }, () => enviarCapitan(codigo));
      canal.on("broadcast", { event: "alineacion" }, (msg) => recibirDeCapitan(codigo, msg.payload || {}));
      canal.subscribe((st) => { if (st === "SUBSCRIBED") enviarCapitan(codigo); });
      estado.capitanes.canales.set(codigo, { canal, idE });
    }
    return true;
  }
  function desconectarCapitanes() {
    if (estado.capitanes) for (const x of estado.capitanes.canales.values()) x.canal.unsubscribe();
    estado.capitanes = null;
  }
  const torneoDeCapitanes = () => estado.capitanes && (estado.capitanes.idTorneo === estado.id ? t() : leerJSON(PREFIJO + estado.capitanes.idTorneo, null));
  // El encuentro del equipo en la última ronda y de qué lado está.
  function encuentroDe(v, idE) {
    const R = v.rondas[v.rondas.length - 1];
    const m = R && R.mesas.find((x) => x.b === idE || x.n === idE);
    return m ? { m, lado: "bn"[m.b === idE ? 0 : 1] } : null;
  }
  // Hasta cuándo cambian los capitanes la alineación (lo elige el árbitro en
  // la ficha Torneo: `v.plazoAlineacion`, minutos antes de la ronda). La hora
  // de la ronda sale del horario del evento (Archivos, «Horario del día») y,
  // sin él, de cuando se echó a andar el reloj de la ronda. Sin plazo o sin
  // hora: hasta que se anote el primer tablero, como antes. En milisegundos.
  function inicioDeRonda(v, r) {
    const ev = v.evento;
    const inicio = ev ? leer(CLAVE_HORARIO + ev.id) : "";
    if (inicio) {
      const h = (V.horario([v], inicio, leer(CLAVE_HORARIO + ev.id + "_descanso") || "10")[0] || { rondas: [] }).rondas[r];
      const dia = window.HoraCR ? HoraCR.hoy() : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
      // Costa Rica no cambia de hora: siempre UTC−6.
      if (h) return Date.parse(dia + "T" + h.hora.padStart(5, "0") + ":00-06:00");
    }
    const R = v.rondas[r];
    return R && R.inicio ? R.inicio : null;
  }
  function limiteAlineacion(v) {
    const min = Number(v.plazoAlineacion);
    if (!(min >= 0) || v.plazoAlineacion == null || v.plazoAlineacion === "" || !v.rondas.length) return null;
    const base = inicioDeRonda(v, v.rondas.length - 1);
    return base ? base - min * 60000 : null;
  }

  function enviarCapitan(codigo) {
    const v = torneoDeCapitanes();
    const x = estado.capitanes && estado.capitanes.canales.get(codigo);
    if (!v || !x) return;
    const e = v.jugadores.find((y) => y.id === x.idE);
    if (!e) return;
    const enc = v.rondas.length ? encuentroDe(v, e.id) : null;
    const m = enc && enc.m;
    const rival = m && m.n != null ? (v.jugadores.find((y) => y.id === (enc.lado === "b" ? m.n : m.b)) || {}).nombre : null;
    const alineacion = m && m.n != null ? ((m.alineacion && m.alineacion[enc.lado]) || E.alineacionPorOmision(v, e.id)) : [];
    const limite = limiteAlineacion(v);
    const vencido = !!limite && Date.now() > limite;
    x.canal.send({ type: "broadcast", event: "estado", payload: {
      nombre: v.nombre || "", equipo: e.nombre, ronda: v.rondas.length, rival,
      integrantes: e.integrantes.map((j) => ({ id: j.id, nombre: j.nombre })), alineacion,
      limite, vencido,
      bloqueada: !m || m.n == null || vencido || (m.partidas || []).some((p) => p.r),
      confirmada: (m && m.alineacionCapitan && m.alineacionCapitan[enc.lado]) || null,
    } });
  }
  function recibirDeCapitan(codigo, p) {
    const v = torneoDeCapitanes();
    const x = estado.capitanes && estado.capitanes.canales.get(codigo);
    if (!v || !x || Number(p.ronda) !== v.rondas.length) return enviarCapitan(codigo);
    // Pasado el plazo, ya no (lo decide esta pestaña, no el celular).
    const limite = limiteAlineacion(v);
    if (limite && Date.now() > limite) return enviarCapitan(codigo);
    const e = v.jugadores.find((y) => y.id === x.idE);
    const enc = e && encuentroDe(v, e.id);
    if (!enc || enc.m.n == null || (enc.m.partidas || []).some((q) => q.r)) return enviarCapitan(codigo);
    const ids = Array.isArray(p.alineacion) ? p.alineacion.map(String) : [];
    const deEquipo = e.integrantes.map((j) => j.id);
    if (ids.length > E.TABLEROS || new Set(ids).size !== ids.length || ids.some((id) => !deEquipo.includes(id))) return enviarCapitan(codigo);
    E.prepararMesa(v, enc.m);
    enc.m.alineacion[enc.lado] = deEquipo.filter((id) => ids.includes(id));
    enc.m.alineacionCapitan = Object.assign({}, enc.m.alineacionCapitan, { [enc.lado]: Date.now() });
    enc.m.r = E.resultadoEncuentro(v, enc.m);
    if (v === t()) { guardar(); if (estado.ficha === "rondas") pintarRondas(); }
    else escribir(PREFIJO + estado.capitanes.idTorneo, JSON.stringify(v));
    Avisos.avisar(tx("capitanLlego", { e: e.nombre }), { tipo: "info" });
    enviarCapitan(codigo);
  }
  async function mostrarCapitanes(cont, R) {
    const v = t();
    try { await PareoQr.cargar(); } catch (e) { Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" }); return; }
    const enLaRonda = R.mesas.flatMap((m) => (m.n == null ? [] : [m.b, m.n]));
    const lista = el("div", { class: "grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2" });
    for (const idE of enLaRonda) {
      const e = jugador(idE);
      const codigo = (v.capitanes || {})[idE];
      if (!e || !codigo) continue;
      const url = location.origin + location.pathname + "#capitan=" + codigo;
      // Mandárselo al capitán: por WhatsApp o por correo (el teléfono y el
      // correo los pone quien lo manda; Pareo no los guarda), o copiarlo.
      const mensaje = tx("capitanMensaje", { e: e.nombre, r: v.rondas.length, t: v.grupo || v.nombre || "", u: url });
      const copiar = el("button", { type: "button", class: C.mini, "data-capitan-copiar": idE, "aria-label": tx("capitanCopiarA", { e: e.nombre }) }, tx("copiarEnlace"));
      copiar.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(mensaje); Avisos.avisar(tx("enlaceCopiado")); }
        catch (err) { Avisos.avisar(tx("noCopia"), { tipo: "error" }); }
      });
      lista.append(el("div", { class: "rounded-xl border border-brand-200 dark:border-brand-700 p-3", "data-capitan-equipo": idE },
        el("h4", { class: "font-semibold", texto: e.nombre }),
        el("div", { class: "w-28 bg-white p-2 rounded-lg mt-2" }, PareoQr.svg(url, tx("qrEtiqueta"))),
        el("p", { class: "pi-capitan-url text-xs break-all mt-2 font-mono", texto: url }),
        el("div", { class: "flex flex-wrap gap-2 mt-2" },
          el("a", { href: PareoCompartir.enlaceWhatsapp(mensaje), target: "_blank", rel: "noopener", class: C.mini, "data-capitan-whatsapp": idE, "aria-label": tx("capitanWhatsappA", { e: e.nombre }) }, tx("capitanWhatsapp")),
          el("a", { href: "mailto:?subject=" + encodeURIComponent(tx("capitanAsunto", { e: e.nombre, r: v.rondas.length })) + "&body=" + encodeURIComponent(mensaje),
            class: C.mini, "data-capitan-correo": idE, "aria-label": tx("capitanCorreoA", { e: e.nombre }) }, tx("capitanCorreo")),
          copiar)));
    }
    cont.replaceChildren(el("p", { class: C.nota, texto: tx("capitanesAyuda") }), lista);
  }

  // ---------- El sorteo del congresillo, en el proyector ----------
  // Los números de salida (todos contra todos) o el color del n.º 1 en la
  // ronda 1 (suizo), sorteados a pantalla completa para que la sala lo vea:
  // primero se barajan a la vista y después se anuncian uno por uno. Con
  // «menos movimiento» del sistema sale todo de una vez. Queda anotado en el
  // torneo (t.sorteo) y el acta del evento lo trae con la hora.
  function anotarSorteo(v, tipo) {
    v.sorteo = { tipo, hora: Date.now(), orden: tipo === "numeros" ? v.numeracion.slice() : undefined, color: tipo === "color" ? v.colorInicial : undefined };
  }
  let sorteoTimer = null;
  function cerrarSorteo() {
    const caja = $("pi-sorteo");
    if (sorteoTimer) { clearTimeout(sorteoTimer); sorteoTimer = null; }
    caja.hidden = true;
    caja.replaceChildren();
    document.body.classList.remove("pi-sorteo-abierto");
    // Al salir de la pantalla completa el navegador suelta el foco: se
    // devuelve al botón después de salir.
    const volver = () => { const b = $(caja.dataset.volver || ""); if (b) b.focus(); };
    if (document.fullscreenElement) document.exitFullscreen().then(volver, volver);
    else volver();
  }
  function abrirSorteo(tipo) {
    const v = t();
    if (v.rondas.length) return;
    const caja = $("pi-sorteo");
    caja.dataset.volver = tipo === "color" ? "pi-sortear-color" : "pi-sortear-proyector";
    const quieto = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const estadoTxt = el("p", { id: "pi-sorteo-estado", class: "pi-sorteo-estado", role: "status" });
    const cuerpo = el("div", { class: "pi-sorteo-cuerpo" });
    const sortear = el("button", { type: "button", id: "pi-sorteo-sortear", class: "pi-sorteo-boton" }, tx("sorteoSortear"));
    const cerrar = el("button", { type: "button", id: "pi-sorteo-cerrar", class: "pi-sorteo-boton pi-sorteo-sec" }, tx("cerrar"));
    cerrar.addEventListener("click", cerrarSorteo);
    caja.replaceChildren(el("div", { class: "pi-sorteo-marco" },
      el("p", { class: "pi-sorteo-torneo", texto: v.grupo || v.nombre || "" }),
      el("h2", { id: "pi-sorteo-titulo", class: "pi-sorteo-titulo", texto: tx(tipo === "color" ? "sorteoTituloColor" : "sorteoTituloNumeros") }),
      cuerpo, estadoTxt, el("div", { class: "pi-sorteo-botones" }, sortear, cerrar)));
    caja.onkeydown = (e) => {
      if (e.key === "Escape") { e.preventDefault(); cerrarSorteo(); return; }
      if (e.key !== "Tab") return;
      const f = [...caja.querySelectorAll("button:not([disabled])")];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    // Antes de sortear: los nombres (o la pregunta del color).
    if (tipo === "numeros") cuerpo.append(el("ol", { class: "pi-sorteo-lista" }, T.ordenInicial(v).map((id) => el("li", {}, el("span", { class: "pi-sorteo-num", texto: "?" }), el("span", { texto: nombreDe(id) })))));
    else cuerpo.append(el("p", { class: "pi-sorteo-color", texto: tx("sorteoPreguntaColor", { n: nombreDe(T.ordenInicial(v)[0]) }) }));
    sortear.addEventListener("click", () => {
      sortear.disabled = true;
      if (tipo === "color") {
        v.colorInicial = T.sortearColor();
        anotarSorteo(v, "color"); guardar();
        const fin = () => {
          cuerpo.replaceChildren(el("p", { class: "pi-sorteo-color pi-sorteo-resultado", texto: v.colorInicial === "b" ? tx("sorteoColorNegras", { n: nombreDe(T.ordenInicial(v)[0]) }) : tx("sorteoColorBlancas", { n: nombreDe(T.ordenInicial(v)[0]) }) }));
          estadoTxt.textContent = tx("sorteoListo"); cerrar.focus(); pintarTorneo(); pintarRondas();
        };
        if (quieto) fin(); else { cuerpo.replaceChildren(el("p", { class: "pi-sorteo-color pi-sorteo-girando", "aria-hidden": "true", texto: "♔ ♚" })); sorteoTimer = setTimeout(fin, 1800); }
        return;
      }
      T.sortearNumeracion(v); anotarSorteo(v, "numeros"); guardar();
      const orden = v.numeracion.slice();
      const ol = el("ol", { class: "pi-sorteo-lista" });
      cuerpo.replaceChildren(ol);
      let i = 0;
      const uno = () => {
        ol.append(el("li", { class: "pi-sorteo-nuevo" }, el("span", { class: "pi-sorteo-num", texto: String(i + 1) }), el("span", { texto: nombreDe(orden[i]) })));
        estadoTxt.textContent = tx("sorteoUno", { n: i + 1, j: nombreDe(orden[i]) });
        i++;
        if (i < orden.length) sorteoTimer = setTimeout(uno, quieto ? 0 : 1200);
        else { estadoTxt.textContent = tx("sorteoListo"); cerrar.focus(); pintarRondas(); }
      };
      if (quieto) { while (i < orden.length - 1) { ol.append(el("li", {}, el("span", { class: "pi-sorteo-num", texto: String(i + 1) }), el("span", { texto: nombreDe(orden[i]) }))); i++; } uno(); }
      else uno();
    });
    caja.hidden = false;
    document.body.classList.add("pi-sorteo-abierto");
    if (caja.requestFullscreen) caja.requestFullscreen().catch(() => {});
    sortear.focus();
  }

  // ---------- La partida de una mesa (PGN) ----------
  // Se pega, se comprueba jugada por jugada con chess.js (js/pareo/partida.js,
  // que acepta las letras en español) y se guarda en la mesa (`m.pgn`): sale
  // en torneos-pareo.html si el torneo está publicado. chess.js se carga
  // solo la primera vez que se usa (Pareo Integral no lo necesita para nada más).
  let cargaChess = null;
  function cargarChess() {
    if (window.Chess) return Promise.resolve();
    if (!cargaChess) cargaChess = new Promise((listo, fallo) => {
      const sc = document.createElement("script");
      sc.src = "js/vendor/chess.js";
      sc.addEventListener("load", listo);
      sc.addEventListener("error", () => { cargaChess = null; fallo(new Error("No cargó chess.js")); });
      document.head.appendChild(sc);
    });
    return cargaChess;
  }
  async function editarPartida(r, i, boton) {
    const v = t();
    const m = v.rondas[r].mesas[i];
    const mesa = V.mesaFisica(v, i);
    const datos = await Avisos.formulario({ titulo: tx("pgnTitulo", { m: mesa }), texto: tx("pgnTexto"), aceptar: tx("pgnGuardar"),
      campos: [{ nombre: "pgn", etiqueta: tx("pgnCampo"), tipo: "textarea", valor: m.pgn || "", max: 12000 }] });
    if (!datos) return;
    const texto = String(datos.pgn || "").trim();
    if (!texto) {
      if (m.pgn) { delete m.pgn; guardar(); pintarRondas(); Avisos.avisar(tx("pgnQuitada")); }
      return;
    }
    try { await cargarChess(); } catch (e) { Avisos.avisar(tx("publicarSinRed"), { tipo: "error" }); return; }
    const lectura = PareoPartida.leer(texto, window.Chess);
    if (!lectura.ok) { Avisos.avisar(tx("pgnMala", { j: lectura.fallaEn || 1 }), { tipo: "error" }); return; }
    m.pgn = texto;
    delete m.pgnCamara; // escrita a mano: la cámara ya no la cambia
    guardar();
    pintarRondas();
    Avisos.avisar(tx("pgnGuardada", { j: Math.ceil(lectura.jugadas.length / 2) }));
    const b = document.querySelector('#pi-ronda [data-pgn="' + i + '"]'); if (b) b.focus();
  }

  // ---------- El reloj del retraso ----------
  // Quien no está sentado al empezar la ronda se marca, y la página cuenta
  // los minutos: en ajedrez pierde cuando su reloj cae a cero (art. 30), es
  // decir, al pasar el tiempo base del ritmo (V.minutosBase). Se vuelve a
  // pintar cada 20 segundos mientras la ronda esté en pantalla.
  let relojIntervalo = null;
  function pintarReloj(caja, r) {
    const v = t();
    const R = v.rondas[r];
    if (relojIntervalo) { clearInterval(relojIntervalo); relojIntervalo = null; }
    const base = V.minutosBase(v.ritmo);
    const sec = el("section", { id: "pi-reloj", class: "no-imprimir mb-4 rounded-xl border border-brand-200 dark:border-brand-700 p-3", "aria-labelledby": "pi-reloj-titulo" },
      el("h3", { id: "pi-reloj-titulo", class: "font-semibold", texto: tx("relojTitulo") }));
    caja.append(sec);
    if (!R.inicio) {
      sec.append(el("p", { class: C.nota, texto: base ? tx("relojTexto", { m: base }) : tx("relojSinRitmo") }),
        el("button", { type: "button", id: "pi-reloj-empezar", class: C.botonSec + " mt-2", onclick: () => {
          R.inicio = Date.now(); guardar(); pintarRondas(); const x = $("pi-reloj-quien"); if (x) x.focus();
        } }, tx("relojEmpezar")));
      return;
    }
    R.tarde = R.tarde || {};
    sec.append(el("p", { class: "text-sm", texto: tx("relojEmpezo", { h: horaCR(R.inicio) }) + " " + (base ? tx("relojTexto", { m: base }) : tx("relojSinRitmo")) }));
    const enMesa = [];
    R.mesas.forEach((m, i) => { if (m.n !== null) enMesa.push([m.b, i], [m.n, i]); });
    const sel = el("select", { id: "pi-reloj-quien", class: C.campoChico, "aria-label": tx("relojQuien") },
      el("option", { value: "", texto: tx("relojElegir") }),
      enMesa.filter(([id]) => !R.tarde[id]).map(([id, i]) => el("option", { value: id, texto: tx("mesa") + " " + V.mesaFisica(t(), i) + ": " + nombreDe(id) })));
    const agregar = el("button", { type: "button", id: "pi-reloj-agregar", class: C.mini }, tx("relojNoLlego"));
    agregar.addEventListener("click", () => {
      if (!sel.value) return;
      R.tarde[sel.value] = { llego: null };
      guardar(); pintarRondas();
      const x = $("pi-reloj-quien"); if (x) x.focus();
    });
    sec.append(el("div", { class: "flex flex-wrap items-center gap-2 mt-2" }, sel, agregar));
    const ul = el("ul", { id: "pi-reloj-lista", class: "mt-2 space-y-2 text-sm" });
    // La ronda atrasada: pasó lo que dura con este ritmo y hay mesas jugando.
    const dura = V.duracionRonda(v.ritmo);
    const atrasada = el("p", { id: "pi-reloj-atrasada", class: "text-sm font-semibold mt-2", role: "status" });
    const pintarLista = () => {
      const lleva = Math.floor((Date.now() - R.inicio) / 60000);
      const jugando = R.mesas.map((m, i) => (m.n !== null && !m.r ? V.mesaFisica(v, i) : 0)).filter(Boolean);
      atrasada.textContent = dura && lleva > dura && jugando.length ? tx("cortosAviso") + " " + tx("relojAtrasada", { l: lleva, d: dura, m: jugando.join(", ") }) : "";
      atrasada.hidden = !atrasada.textContent;
      ul.replaceChildren();
      for (const [id, x] of Object.entries(R.tarde)) {
        const e = V.estadoRetraso(R, id, Date.now(), base);
        const i = R.mesas.findIndex((m) => m.b === id || m.n === id);
        const m = R.mesas[i];
        const li = el("li", { class: "flex flex-wrap items-center gap-2", "data-reloj": id },
          el("span", { class: "font-semibold", texto: nombreDe(id) }),
          el("span", { texto: e.llego ? tx("relojLlegoTarde", { m: e.minutos }) : e.vencido ? tx("relojVencido", { m: e.minutos }) : base ? tx("relojLleva", { m: e.minutos, b: base }) : tx("relojLlevaSinBase", { m: e.minutos }) }));
        if (!e.llego) li.append(el("button", { type: "button", class: C.mini, "aria-label": tx("relojLlegoA", { n: nombreDe(id) }), onclick: () => { x.llego = Date.now(); guardar(); pintarRondas(); } }, tx("relojLlego")));
        if (e.vencido && m && !m.r) li.append(el("button", { type: "button", class: C.miniPeligro, onclick: () => anotarIncomparecencia(r, i, id) }, tx("relojAnotar")));
        li.append(el("button", { type: "button", class: C.mini, "aria-label": tx("relojQuitarA", { n: nombreDe(id) }), onclick: () => { delete R.tarde[id]; guardar(); pintarRondas(); } }, tx("quitar")));
        ul.append(li);
      }
    };
    pintarLista();
    sec.append(atrasada, ul);
    if (Object.keys(R.tarde).length || R.mesas.some((m) => m.n !== null && !m.r)) {
      relojIntervalo = setInterval(() => {
        if (!document.body.contains(ul)) { clearInterval(relojIntervalo); relojIntervalo = null; return; }
        pintarLista();
      }, 20000);
    }
  }

  // Su reloj cayó: pierde por incomparecencia. En equipos, el equipo entero
  // (sin nadie presente pierde el encuentro). Queda anotado en las incidencias.
  function anotarIncomparecencia(r, i, id) {
    const v = t();
    const R = v.rondas[r];
    const m = R.mesas[i];
    if (E.esDeEquipos(v)) { E.prepararMesa(v, m); m.alineacion[Object.keys(m.alineacion).find((k) => m[k] === id)] = []; m.r = E.resultadoEncuentro(v, m); }
    else m.r = m.b === id ? "-+" : "+-";
    R.incidencias = (R.incidencias || []).concat({ hora: Date.now(), mesa: i + 1, tipo: "decision", texto: tx("relojIncidencia", { n: nombreDe(id) }) });
    guardar();
    pintarRondas();
    Avisos.avisar(tx("relojAnotado", { n: nombreDe(id) }));
  }

  // ¿Cambiar un resultado que ya estaba anotado? (la ronda en juego).
  function confirmarCambio(r, i, antes, despues, tablero) {
    const corto = (x) => (x ? tx("corto_" + x) : tx("resSin"));
    return Avisos.confirmar(tx("cambiarResultadoConfirma", { m: V.mesaFisica(t(), i), a: corto(antes), d: corto(despues) }) + (tablero ? " (" + tx("tableroN", { t: tablero }) + ")" : ""),
      { aceptar: tx("cambiarResultadoSi"), cancelar: tx("cambiarResultadoNo") });
  }

  // El motivo de una corrección (null si se cancela).
  async function pedirMotivo(r, i, antes, despues, tablero) {
    const corto = (x) => (x ? tx("corto_" + x) : tx("resSin"));
    const res = await Avisos.formulario({
      titulo: tx("correccionTitulo", { r: r + 1, m: V.mesaFisica(t(), i) }) + (tablero ? " · " + tx("tableroN", { t: tablero }) : ""),
      texto: tx("correccionTexto", { a: corto(antes), d: corto(despues) }),
      aceptar: tx("correccionSi"), cancelar: tx("cancelar"),
      campos: [{ nombre: "motivo", etiqueta: tx("correccionMotivo"), max: 300 }],
    });
    const motivo = res && String(res.motivo || "").trim();
    if (res && !motivo) Avisos.avisar(tx("correccionFalta"), { tipo: "error" });
    return motivo || null;
  }
  function anotarCorreccion(R, i, antes, despues, motivo, tablero) {
    const corto = (x) => (x ? tx("corto_" + x) : tx("resSin"));
    R.incidencias = (R.incidencias || []).concat({ hora: Date.now(), mesa: i + 1, tipo: "correccion",
      texto: (tablero ? tx("tableroN", { t: tablero }) + ": " : "") + tx("correccionIncidencia", { a: corto(antes), d: corto(despues), m: motivo }) });
  }

  // ---------- Las incidencias de la ronda ----------
  // Reclamos, sanciones y decisiones del árbitro, con su hora y su mesa: van
  // al informe oficial (V.incidenciasDe).
  const TEXTO_INCIDENCIA = { reclamo: "incReclamo", sancion: "incSancion", decision: "incDecision", apelacion: "incApelacion", correccion: "incCorreccion", adjunto: "incAdjunto", otra: "incOtra" };
  function pintarIncidencias(caja, r) {
    const R = t().rondas[r];
    const sec = el("section", { id: "pi-incidencias", class: "no-imprimir mt-6", "aria-labelledby": "pi-inc-titulo" },
      el("h3", { id: "pi-inc-titulo", class: "font-semibold", texto: tx("incTitulo") }),
      el("p", { class: C.nota, texto: tx("incTexto") }));
    const lista = el("ul", { id: "pi-inc-lista", class: "mt-2 space-y-1 text-sm" });
    (R.incidencias || []).forEach((x, k) => lista.append(el("li", { class: "flex flex-wrap items-start gap-2" },
      el("span", { texto: horaCR(x.hora) + (x.mesa ? " · " + tx("mesa") + " " + V.mesaFisica(t(), x.mesa - 1) : "") + " · " + tx(TEXTO_INCIDENCIA[x.tipo] || TEXTO_INCIDENCIA.otra) +
        (x.articulo ? " (" + V.articuloTexto(x.articulo) + ")" : "") + (x.autor ? " · " + x.autor : "") + (x.jugador ? " · " + tx("incA", { n: nombreDeQuien(x.jugador) }) : "") + ": " + x.texto +
        (x.presenta ? " " + tx("apelacionPresenta", { p: x.presenta }) : "") + (x.tipo === "apelacion" ? " " + tx("apelacionResolucion", { r: x.resolucion || tx("apelacionPendiente") }) : "") }),
      x.foto && FOTO_VALIDA.test(x.foto) ? el("button", { type: "button", class: C.mini, "data-foto-inc": String(k),
        onclick: () => verFoto({ h: x.hora, motivo: null, img: x.foto, mesa: x.mesa ? V.mesaFisica(t(), x.mesa - 1) : null, tablero: null }) },
        el("span", { "aria-hidden": "true", texto: "📷 " }), tx("fotoVer")) : null,
      x.tipo === "apelacion" ? el("button", { type: "button", class: C.mini, onclick: () => resolverApelacion(R, k) }, tx(x.resolucion ? "apelacionCambiar" : "apelacionResolver")) : null,
      x.tipo === "sancion" && x.mesa && !E.esDeEquipos(t()) && R.mesas[x.mesa - 1] && R.mesas[x.mesa - 1].n
        ? el("button", { type: "button", class: C.mini, "data-sancion": k, onclick: () => aplicarSancion(R, k) }, tx(x.aplicada ? "sancionCambiar" : "sancionAplicar")) : null,
      el("button", { type: "button", class: C.mini, onclick: () => { R.incidencias.splice(k, 1); guardar(); pintarRondas(); } }, tx("quitar")))));
    const mesa = el("select", { id: "pi-inc-mesa", class: C.campoChico, "aria-label": tx("mesa") },
      el("option", { value: "", texto: tx("incSinMesa") }), R.mesas.map((m, i) => el("option", { value: String(i + 1), texto: tx("mesa") + " " + V.mesaFisica(t(), i) })));
    const tipo = el("select", { id: "pi-inc-tipo", class: C.campoChico, "aria-label": tx("incTipo") },
      Object.entries(TEXTO_INCIDENCIA).filter(([k]) => k !== "correccion" && k !== "adjunto").map(([k, c]) => el("option", { value: k, texto: tx(c) })));
    // A quién va (de los que juegan esa mesa): con él sale su marca en el pareo.
    const quien = el("select", { id: "pi-inc-jugador", class: C.campoChico, "aria-label": tx("incJugador"), disabled: true });
    const llenarQuien = () => {
      const lista = mesa.value ? jugadoresDeMesa(t(), R.mesas[Number(mesa.value) - 1]) : [];
      quien.replaceChildren(el("option", { value: "", texto: tx("incSinJugador") }), ...lista.map(([, id, etiqueta]) => el("option", { value: id, texto: etiqueta })));
      quien.disabled = !lista.length;
    };
    mesa.addEventListener("change", llenarQuien);
    llenarQuien();
    // El artículo de las Leyes del Ajedrez, para que el informe lo lleve.
    const articulo = el("select", { id: "pi-inc-articulo", class: C.campoChico, "aria-label": tx("incArticulo") },
      el("option", { value: "", texto: tx("incSinArticulo") }), Object.keys(V.ARTICULOS).map((k) => el("option", { value: k, texto: V.articuloTexto(k) })));
    // En una apelación, quién la presenta (la resolución del comité se
    // anota después, en la lista).
    const presenta = el("input", { id: "pi-inc-presenta", type: "text", maxlength: "80", class: C.campo + " mt-2", "aria-label": tx("apelacionQuien"), placeholder: tx("apelacionQuien") });
    const cajaPresenta = el("div", { hidden: true }, presenta);
    tipo.addEventListener("change", () => { cajaPresenta.hidden = tipo.value !== "apelacion"; });
    const texto = el("textarea", { id: "pi-inc-texto", class: C.campo + " mt-2", rows: "2", maxlength: "500", "aria-label": tx("incQue") });
    const anotar = el("button", { type: "button", id: "pi-inc-anotar", class: C.botonSec + " mt-2" }, tx("incAnotar"));
    anotar.addEventListener("click", () => {
      const q = texto.value.trim();
      if (!q) { Avisos.avisar(tx("incFalta"), { tipo: "error" }); texto.focus(); return; }
      const nueva = { hora: Date.now(), mesa: mesa.value ? Number(mesa.value) : null, tipo: tipo.value, texto: q.slice(0, 500) };
      if (articulo.value) nueva.articulo = articulo.value;
      if (quien.value) nueva.jugador = quien.value;
      if (tipo.value === "apelacion") {
        if (!presenta.value.trim()) { Avisos.avisar(tx("apelacionFaltaQuien"), { tipo: "error" }); presenta.focus(); return; }
        nueva.presenta = presenta.value.trim().slice(0, 80);
        nueva.resolucion = "";
      }
      R.incidencias = (R.incidencias || []).concat(nueva);
      guardar();
      pintarRondas();
      const x = $("pi-inc-texto"); if (x) x.focus();
      Avisos.avisar(tx("incAnotada"));
    });
    sec.append(lista, el("div", { class: "flex flex-wrap gap-2 mt-2" }, mesa, quien, tipo, articulo), cajaPresenta, texto, anotar);
    caja.append(sec);
  }

  // Una sanción que cambia el resultado de su mesa (una partida perdida por
  // el celular, por ejemplo): un clic, y la corrección queda anotada.
  async function aplicarSancion(R, k) {
    const x = R.incidencias[k];
    const m = R.mesas[x.mesa - 1];
    const r = await Avisos.formulario({ titulo: tx("sancionTitulo", { m: x.mesa }), texto: x.texto, aceptar: tx("sancionGuardar"), cancelar: tx("cancelar"),
      campos: [{ nombre: "r", etiqueta: tx("sancionResultado", { b: nombreDe(m.b), n: nombreDe(m.n) }), tipo: "select", valor: x.aplicada || "-+",
        opciones: RESULTADOS.filter(([val]) => val).map(([val, clave]) => [val, tx(clave)]) }] });
    if (!r || !RESULTADOS_VALIDOS.has(r.r)) return;
    const antes = m.r || null;
    m.r = r.r;
    x.aplicada = r.r;
    anotarCorreccion(R, x.mesa - 1, antes, r.r, tx("sancionMotivo"));
    guardar();
    pintarRondas();
  }

  async function resolverApelacion(R, k) {
    const x = R.incidencias[k];
    const r = await Avisos.formulario({ titulo: tx("apelacionResolver"), texto: x.texto, aceptar: tx("apelacionGuardar"), cancelar: tx("cancelar"),
      campos: [{ nombre: "resolucion", etiqueta: tx("apelacionQueResolvio"), valor: x.resolucion || "", max: 300 }] });
    if (!r) return;
    x.resolucion = String(r.resolucion || "").trim().slice(0, 300);
    guardar();
    pintarRondas();
  }

  function pintarMesasIndividuales(caja, r) {
    const v = t();
    const R = v.rondas[r];
    const num = T.numeros(v);
    const antes = (id) => T.puntosHasta(v, id, r);
    const marcas = V.marcasIncidencias(R);
    const tabla = el("table", { class: "pi-tabla" });
    tabla.append(el("thead", {}, el("tr", {},
      el("th", { class: "num", scope: "col", texto: tx("mesa") }),
      el("th", { class: "num", scope: "col", texto: tx("nro") }), el("th", { scope: "col", texto: tx("blancas") }), el("th", { class: "num", scope: "col", texto: tx("pts") }),
      el("th", { class: "text-center", scope: "col", texto: tx("resultado") }),
      el("th", { class: "num", scope: "col", texto: tx("pts") }), el("th", { scope: "col", texto: tx("negras") }), el("th", { class: "num", scope: "col", texto: tx("nro") }))));
    const cuerpo = el("tbody");
    R.mesas.forEach((m, i) => {
      if (m.n === null) {
        cuerpo.append(el("tr", {},
          el("td", { class: "num", texto: V.mesaFisica(v, i) }), el("td", { class: "num", texto: num.get(m.b) }),
          el("td", { class: "font-semibold", texto: nombreDe(m.b) }), el("td", { class: "num", texto: puntosTexto(antes(m.b)) }),
          el("td", { class: "text-center", colspan: 4, texto: tx("byePareo", { p: puntosTexto(v.puntos.bye) }) })));
        return;
      }
      const sel = el("select", { id: "pi-mesa-" + i, "data-resultado": "", class: C.campoChico, "aria-label": tx("resultadoMesa", { m: V.mesaFisica(v, i), b: nombreDe(m.b), n: nombreDe(m.n) }) });
      for (const [val, clave] of RESULTADOS) sel.append(el("option", { value: val, texto: tx(clave) }));
      sel.value = m.r || "";
      sel.addEventListener("change", async () => {
        // Corregir una ronda ya cerrada (la siguiente ya se emparejó) pide
        // el motivo, y queda en las incidencias.
        if (r < v.rondas.length - 1 && m.r && sel.value !== m.r) {
          const motivo = await pedirMotivo(r, i, m.r, sel.value || null);
          if (!motivo) { sel.value = m.r || ""; return; }
          anotarCorreccion(R, i, m.r, sel.value || null, motivo);
        } else if (m.r && sel.value !== m.r) {
          // En la ronda en juego: cambiar un resultado ya anotado (por un
          // error al tocar) pide confirmarlo, y queda la constancia.
          if (!(await confirmarCambio(r, i, m.r, sel.value || null))) { sel.value = m.r || ""; return; }
          anotarCorreccion(R, i, m.r, sel.value || null, tx("correccionPrincipal"));
        }
        m.r = sel.value || null;
        guardar();
        const quedan = R.mesas.filter((x) => x.n && !x.r).length;
        const estadoTxt = caja.querySelector('[role="status"]');
        if (estadoTxt) estadoTxt.textContent = quedan ? tx("faltanResultados", { n: quedan }) : tx("rondaCompleta");
        if (!quedan) pintarRondasNav();
      });
      // Las marcas de las incidencias de cada uno, y su detalle en una fila
      // aparte que se abre al tocar la marca.
      const filaDet = el("tr", { class: "pi-inc-fila", hidden: true });
      const verDet = () => { filaDet.hidden = ![...filaDet.querySelectorAll(".pi-inc-detalle")].some((d) => !d.hidden); };
      const [mb, db] = marcaDe(marcas, m.b, nombreDe(m.b), verDet);
      const [mn, dn] = marcaDe(marcas, m.n, nombreDe(m.n), verDet);
      filaDet.append(el("td", { colspan: 8 }, db, dn));
      cuerpo.append(el("tr", { "data-nombres": normalizarBusqueda(nombreDe(m.b) + " " + nombreDe(m.n)) },
        el("td", { class: "num", texto: V.mesaFisica(v, i) }), el("td", { class: "num", texto: num.get(m.b) }),
        el("td", { class: "font-semibold" }, nombreDe(m.b), mb ? " " : null, mb), el("td", { class: "num", texto: puntosTexto(antes(m.b)) }),
        el("td", { class: "text-center" }, sel, el("span", { class: "pi-solo-imprimir", texto: m.r ? tx("corto_" + m.r) : "" }),
          m.porAdjunto ? el("span", { class: "block text-xs " + C.nota, texto: typeof m.porAdjunto === "string" ? tx("adjuntoAnotoNombre", { n: m.porAdjunto }) : tx("adjuntoAnoto") }) : null,
          el("button", { type: "button", class: C.mini + " no-imprimir block mx-auto mt-1", "data-pgn": String(i), "aria-label": tx("pgnBotonA", { m: V.mesaFisica(v, i) }),
            onclick: (e) => editarPartida(r, i, e.currentTarget) }, (m.pgn ? "✓ " : "") + tx("pgnBoton"))),
        el("td", { class: "num", texto: puntosTexto(antes(m.n)) }), el("td", { class: "font-semibold" }, nombreDe(m.n), mn ? " " : null, mn),
        el("td", { class: "num", texto: num.get(m.n) })));
      if (mb || mn) cuerpo.append(filaDet);
    });
    tabla.append(cuerpo);
    caja.append(el("div", { class: "overflow-x-auto" }, tabla));
  }

  // Quienes no jugaron esta ronda: byes pedidos, retirados, inscritos después.
  function pintarNoJuegan(caja, r) {
    const v = t();
    const R = v.rondas[r];
    const num = T.numeros(v);
    const enMesa = new Set();
    for (const m of R.mesas) { enMesa.add(m.b); if (m.n) enMesa.add(m.n); }
    const fuera = T.ordenInicial(v).filter((id) => !enMesa.has(id));
    if (fuera.length) {
      const ul = el("ul", { class: "mt-2 space-y-1" });
      for (const id of fuera) {
        const actual = (R.ausencias || {})[id] || "Z";
        const s = el("select", { class: C.campoChico, "aria-label": tx("ausenciaDe", { n: nombreDe(id) }) },
          el("option", { value: "H", texto: tx("byeMedio", { p: puntosTexto(v.puntos.tablas) }) }),
          el("option", { value: "Z", texto: tx(T.fijo(v) ? "libre" : "byeCero") }),
          el("option", { value: "F", texto: tx("byeEntero", { p: puntosTexto(v.puntos.victoria) }) }));
        s.value = actual;
        s.addEventListener("change", () => {
          R.ausencias = R.ausencias || {};
          if (s.value === "Z") delete R.ausencias[id]; else R.ausencias[id] = s.value;
          guardar();
        });
        const papel = el("span", { class: "pi-solo-imprimir", texto: s.selectedOptions[0].textContent });
        s.addEventListener("change", () => { papel.textContent = s.selectedOptions[0].textContent; });
        ul.append(el("li", { class: "flex flex-wrap items-center gap-2" }, el("span", { class: "font-semibold", texto: num.get(id) + ". " + nombreDe(id) }), s, papel));
      }
      caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("noJuegan") }), ul);
    }
  }

  // ---------- Los encuentros de un torneo por equipos ----------
  // Cada encuentro: los dos equipos con sus puntos de encuentro antes de la
  // ronda, quiénes juegan de cada lado (los cuatro primeros del orden de
  // tableros, que el árbitro cambia si falta alguien: los de abajo suben y
  // el suplente entra al final) y el resultado de cada tablero. El del
  // encuentro sale solo de los tableros (js/pareo/equipos.js).
  function pintarEncuentros(caja, r) {
    const v = t();
    const R = v.rondas[r];
    const num = T.numeros(v);
    const marcasEq = V.marcasIncidencias(R);
    const antes = (id) => T.puntosHasta(v, id, r);
    const nombreIntegrante = (idEquipo, idJ) => {
      const e = jugador(idEquipo);
      const j = e && e.integrantes.find((x) => x.id === idJ);
      return j ? j.nombre : "—";
    };
    const lista = el("div", { class: "space-y-4" });
    R.mesas.forEach((m) => { if (m.n !== null) E.prepararMesa(v, m); });
    const avisos = E.avisosAlineacion(v, r);
    const listaAvisos = (cuales, id) => (cuales.length ? el("ul", { id, class: "mt-2 space-y-1 text-sm" }, cuales.map((a) =>
      el("li", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }), tx(TEXTO_ALINEACION[a.tipo], { e: a.nombre, n: a.presentes, k: a.pierde })))) : null);
    const generales = listaAvisos(avisos.filter((a) => a.mesa == null), "pi-alin-generales");
    if (generales) caja.append(generales);
    // Los capitanes confirman la alineación desde su celular (la última ronda).
    if (r === v.rondas.length - 1) {
      const cajaCap = el("div", { id: "pi-capitanes-caja", class: "no-imprimir mb-4" });
      const bCap = el("button", { type: "button", id: "pi-capitanes", class: C.botonSec, "aria-expanded": estado.verCapitanes ? "true" : "false" }, tx("capitanesBoton"));
      bCap.addEventListener("click", async () => {
        estado.verCapitanes = !estado.verCapitanes;
        if (estado.verCapitanes) { asegurarCapitanes(); guardar(); await conectarCapitanes(); }
        pintarRondas();
      });
      caja.append(el("div", { class: "no-imprimir mb-3" }, bCap), cajaCap);
      if ((v.capitanes && Object.keys(v.capitanes).length)) conectarCapitanes();
      if (estado.verCapitanes) mostrarCapitanes(cajaCap, R);
    }
    R.mesas.forEach((m, i) => {
      if (m.n === null) {
        lista.append(el("p", { class: "rounded-xl border border-brand-200 dark:border-brand-700 p-3 text-sm" },
          el("span", { class: "font-semibold", texto: tx("mesa") + " " + V.mesaFisica(v, i) + ": " + num.get(m.b) + ". " + nombreDe(m.b) }),
          " — " + tx("byeEquipo", { p: puntosTexto(v.puntos.bye), t: puntosTexto(E.TABLEROS / 2) })));
        return;
      }
      E.prepararMesa(v, m);
      const pe = E.puntosDelEncuentro(v, m);
      const nombresEnc = [nombreDe(m.b), nombreDe(m.n)].concat([m.b, m.n].flatMap((idE) => (jugador(idE) || { integrantes: [] }).integrantes.map((j) => j.nombre)));
      const tarjeta = el("section", { class: "rounded-xl border border-brand-200 dark:border-brand-700 p-3", "aria-labelledby": "pi-enc-" + i + "-t", "data-nombres": normalizarBusqueda(nombresEnc.join(" ")) });
      tarjeta.append(el("h3", { id: "pi-enc-" + i + "-t", class: "font-semibold" },
        tx("mesa") + " " + V.mesaFisica(v, i) + ": " + num.get(m.b) + ". " + nombreDe(m.b) + " (" + puntosTexto(antes(m.b)) + ") – " +
        num.get(m.n) + ". " + nombreDe(m.n) + " (" + puntosTexto(antes(m.n)) + ")"));
      tarjeta.append(el("p", { id: "pi-enc-" + i + "-r", class: "text-sm mt-1", role: "status" },
        m.r ? tx(pe.incomparecencia ? "encuentroIncomp" : "encuentroResultado", {
          b: puntosTexto(pe.b), n: puntosTexto(pe.n),
          g: m.r === "=" ? tx("empate") : tx("ganaEquipo", { e: nombreDe(m.r === "1-0" || m.r === "+-" ? m.b : m.n) }),
        }) : tx("encuentroFalta", { b: puntosTexto(pe.b), n: puntosTexto(pe.n) })));
      const deEsta = listaAvisos(avisos.filter((a) => a.mesa === i), "pi-enc-" + i + "-avisos");
      if (deEsta) tarjeta.append(deEsta);

      // Quiénes juegan: una casilla por integrante, hasta cuatro.
      const alineacion = el("div", { class: "grid sm:grid-cols-2 gap-3 mt-2 no-imprimir" });
      for (const lado of "bn") {
        const e = jugador(m[lado]);
        const elegidos = m.alineacion[lado];
        const lleno = elegidos.length >= E.TABLEROS;
        const fs = el("fieldset", { class: "text-sm" }, el("legend", { class: "font-semibold", texto: tx("juegan", { e: e.nombre }) }));
        const porCapitan = m.alineacionCapitan && m.alineacionCapitan[lado];
        if (porCapitan) fs.append(el("p", { class: C.nota, "data-capitan": lado, texto: tx("capitanConfirmo", { h: horaCR(porCapitan) }) }));
        e.integrantes.forEach((j, k) => {
          const id = "pi-enc-" + i + "-" + lado + "-" + k;
          const si = elegidos.includes(j.id);
          fs.append(el("label", { class: "flex items-center gap-2" },
            el("input", { type: "checkbox", id, checked: si, disabled: !si && lleno, onchange: (ev) => {
              const marcados = new Set(m.alineacion[lado]);
              if (ev.target.checked) marcados.add(j.id); else marcados.delete(j.id);
              // Siempre en el orden de tableros (sistema olímpico).
              m.alineacion[lado] = e.integrantes.map((x) => x.id).filter((x) => marcados.has(x));
              alCambiarEncuentro(m, id);
            } }),
            el("span", { texto: (k + 1) + ". " + j.nombre + (k >= E.TABLEROS ? " (" + tx("suplente") + ")" : "") })));
        });
        alineacion.append(fs);
      }
      tarjeta.append(alineacion);

      // Los tableros: con quién juega cada uno y el resultado. Una lista, no
      // una tabla: en el celular, cuatro columnas con nombres largos sacan de
      // la pantalla a las negras. El equipo de cada uno se alterna (el de la
      // izquierda con blancas en los tableros 1 y 3) y va en el título.
      const tableros = el("ol", { class: "mt-3 space-y-2" });
      for (const x of E.tablerosDe(v, m)) {
        const equipoBlancas = x.bBlancas ? m.b : m.n, equipoNegras = x.bBlancas ? m.n : m.b;
        const blancas = x.blancas ? nombreIntegrante(equipoBlancas, x.blancas) : tx("nadie");
        const negras = x.negras ? nombreIntegrante(equipoNegras, x.negras) : tx("nadie");
        let celda;
        if (x.fijo || pe.incomparecencia) celda = el("span", { class: "text-sm", texto: tx("corto_" + (pe.incomparecencia ? m.r : x.r)) + " · " + tx("incomparecencia") });
        else {
          const id = "pi-enc-" + i + "-t" + x.k;
          const sel = el("select", { id, "data-resultado": "", class: C.campoChico, "aria-label": tx("resultadoTablero", { t: x.k + 1, b: blancas, n: negras }) });
          for (const [val, clave] of RESULTADOS) sel.append(el("option", { value: val, texto: tx(clave) }));
          sel.value = x.r || "";
          sel.addEventListener("change", async () => {
            const antes = m.partidas[x.k].r;
            if (r < v.rondas.length - 1 && antes && sel.value !== antes) {
              const motivo = await pedirMotivo(r, i, antes, sel.value || null, x.k + 1);
              if (!motivo) { sel.value = antes || ""; return; }
              anotarCorreccion(R, i, antes, sel.value || null, motivo, x.k + 1);
            } else if (antes && sel.value !== antes) {
              // En la ronda en juego: cambiar uno ya anotado pide confirmarlo y queda la constancia.
              if (!(await confirmarCambio(r, i, antes, sel.value || null, x.k + 1))) { sel.value = antes || ""; return; }
              anotarCorreccion(R, i, antes, sel.value || null, tx("correccionPrincipal"), x.k + 1);
            }
            m.partidas[x.k].r = sel.value || null;
            alCambiarEncuentro(m, id);
          });
          celda = el("span", {}, sel, el("span", { class: "pi-solo-imprimir", texto: x.r ? tx("corto_" + x.r) : "" }));
        }
        const [mBl, dBl] = x.blancas ? marcaDe(marcasEq, x.blancas, blancas) : [null, null];
        const [mNe, dNe] = x.negras ? marcaDe(marcasEq, x.negras, negras) : [null, null];
        tableros.append(el("li", { class: "flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-brand-100 dark:border-brand-800 pt-2", "data-tablero": x.k + 1 },
          el("span", { class: "font-mono text-xs font-bold", texto: tx("tableroN", { t: x.k + 1 }) }),
          el("span", { class: "text-sm flex-1 min-w-[12rem]" },
            el("span", { class: "font-semibold", title: nombreDe(equipoBlancas), texto: blancas }), mBl ? " " : null, mBl, " ",
            el("span", { class: C.nota, texto: "(" + tx("blancas") + ")" }), " – ",
            el("span", { class: "font-semibold", title: nombreDe(equipoNegras), texto: negras }), mNe ? " " : null, mNe, " ",
            el("span", { class: C.nota, texto: "(" + tx("negras") + ")" })),
          celda, dBl ? el("div", { class: "basis-full" }, dBl) : null, dNe ? el("div", { class: "basis-full" }, dNe) : null));
      }
      tarjeta.append(tableros);
      lista.append(tarjeta);
    });
    caja.append(lista);
  }

  const TEXTO_ALINEACION = { menos2: "alinMenos2", incompleto: "alinIncompleto", fueraDeOrden: "alinFueraDeOrden", ajeno: "alinAjeno", ordenCambiado: "alinOrdenCambiado" };

  // La hoja de alineación de cada equipo en cada encuentro de la ronda: el
  // capitán marca a los cuatro que juegan, en el orden de tableros, y la
  // entrega firmada antes de la ronda (art. 66.2.h).
  function imprimirAlineaciones(r) {
    const v = t();
    const R = v.rondas[r];
    const num = T.numeros(v);
    const cont = $("pi-firmas");
    empezarHoja(cont);
    R.mesas.forEach((m, i) => {
      if (m.n === null) return;
      for (const [id, rival] of [[m.b, m.n], [m.n, m.b]]) {
        const e = jugador(id);
        const hoja = el("div", { class: "pi-firma-mesa" },
          el("h1", { class: "pi-firma-titulo" }, tx("alineacionTitulo", { r: r + 1, m: V.mesaFisica(v, i) }) + (v.nombre ? " — " + v.nombre : "")),
          el("p", { class: "pi-firma-jugador" }, tx("alineacionEquipos", { e: num.get(id) + ". " + e.nombre, r: num.get(rival) + ". " + nombreDe(rival) })),
          el("p", { class: "pi-firma-resultado" }, tx("alineacionInstrucciones", { t: E.TABLEROS })));
        e.integrantes.forEach((j, k) => hoja.append(el("p", { class: "pi-firma-jugador" },
          "☐  " + (k < E.TABLEROS ? tx("tableroN", { t: k + 1 }) : tx("suplente")) + ": " + j.nombre)));
        hoja.append(el("p", { class: "pi-firma-linea" }, tx("firmaCapitan", { e: e.nombre })), el("p", { class: "pi-firma-linea" }, tx("alineacionHora")));
        cont.append(hoja);
      }
    });
    if (!cont.children.length) return;
    imprimirCon("pi-imprimiendo-firmas");
  }

  // Las planillas de anotación de la ronda: una por mesa (en equipos, una
  // por tablero), con los nombres, la ronda y la mesa ya escritos y 60
  // jugadas en dos columnas, como la planilla oficial. Cada una es UNA hoja
  // sin los márgenes del navegador (@page planilla, en css/styles.css): así
  // no sale la dirección ni el número de página y las 60 jugadas caben con
  // renglones altos para escribir.
  async function imprimirPlanillasAnotacion(r, solo) {
    const v = t();
    const R = v.rondas[r];
    // Con el evento en vivo, un QR por jugador que abre «Mi jugador» en el
    // enlace del evento ya con su nombre: la familia escanea la planilla.
    let base = v.evento && estado.eventoVivo && estado.eventoVivo.id === v.evento.id
      ? location.origin + location.pathname + "#evento=" + estado.eventoVivo.codigo + "&q=" : null;
    if (base) { try { await PareoQr.cargar(); } catch (e) { base = null; } }
    const cont = $("pi-firmas");
    empezarHoja(cont);
    const lado = (color, nombre, quien) => el("div", { class: "pi-pl-lado" },
      el("span", { class: "pi-ft-color", texto: color }), el("span", { class: "pi-pl-nombre", texto: nombre }),
      base && quien ? el("span", { class: "pi-pl-qr", title: tx("anotacionQr", { n: quien }) }, PareoQr.svg(base + encodeURIComponent(quien), tx("anotacionQr", { n: quien }))) : null);
    const firma = (texto) => el("div", { class: "pi-ft-firma" }, el("span", { class: "pi-ft-raya" }), el("span", { class: "pi-ft-quien", texto }));
    const hoja = (titulo, blancas, negras, quienB, quienN) => {
      const tabla = el("table", { class: "pi-planilla-tabla" },
        el("colgroup", {}, ["pi-pl-col-n", "", "", "pi-pl-col-n pi-pl-col-mitad", "", ""].map((c) => el("col", c ? { class: c } : {}))),
        el("thead", {}, el("tr", {}, ["#", tx("blancas"), tx("negras"), "#", tx("blancas"), tx("negras")].map((x, k) => el("th", { scope: "col", class: k === 3 ? "pi-pl-mitad" : "", texto: x })))),
        el("tbody", {}, Array.from({ length: 30 }, (_, i) => el("tr", {},
          el("td", { class: "pi-planilla-n", texto: i + 1 }), el("td"), el("td"),
          el("td", { class: "pi-planilla-n pi-pl-mitad", texto: i + 31 }), el("td"), el("td")))));
      cont.append(el("div", { class: "pi-firma-mesa pi-planilla" },
        el("div", { class: "pi-pl-cabeza" },
          el("h1", { class: "pi-pl-torneo", texto: v.nombre || "" }),
          el("p", { class: "pi-pl-datos", texto: titulo + (v.fechaInicio ? " · " + v.fechaInicio : "") + (v.ritmo ? " · " + v.ritmo : "") })),
        el("div", { class: "pi-pl-jugadores" }, lado(tx("blancas"), blancas, quienB), lado(tx("negras"), negras, quienN)),
        tabla,
        el("div", { class: "pi-pl-pie" },
          el("p", { class: "pi-ft-resultado" }, el("span", { class: "pi-ft-etiqueta", texto: tx("resultado") + ":" }),
            el("span", { class: "pi-ft-casillas" }, ["1-0", "=", "0-1"].map((x) => el("span", { class: "pi-ft-casilla", texto: "☐ " + tx("corto_" + x) })))),
          el("div", { class: "pi-ft-firmas pi-pl-firmas" }, firma(tx("firmaDe", { n: blancas })), firma(tx("firmaDe", { n: negras }))))));
    };
    R.mesas.forEach((m, i) => {
      if (m.n === null || (solo != null && i !== solo)) return;
      if (E.esDeEquipos(v)) {
        const copia = m.alineacion ? m : E.prepararMesa(v, JSON.parse(JSON.stringify(m)));
        const quien = (idE, idJ) => { const e = jugador(idE); const j = e && idJ && e.integrantes.find((y) => y.id === idJ); return j ? j.nombre : null; };
        const de = (idE, idJ) => { const q = quien(idE, idJ); return q ? q + " (" + nombreDe(idE) + ")" : tx("nadie"); };
        for (const x of E.tablerosDe(v, copia)) {
          if (!x.blancas || !x.negras) continue;
          const eb = x.bBlancas ? m.b : m.n, en = x.bBlancas ? m.n : m.b;
          hoja(tx("anotacionTituloTablero", { r: r + 1, m: V.mesaFisica(v, i), t: x.k + 1 }), de(eb, x.blancas), de(en, x.negras), quien(eb, x.blancas), quien(en, x.negras));
        }
      } else hoja(tx("anotacionTitulo", { r: r + 1, m: V.mesaFisica(v, i) }), nombreDe(m.b), nombreDe(m.n), nombreDe(m.b), nombreDe(m.n));
    });
    if (!cont.children.length) return;
    imprimirCon("pi-imprimiendo-firmas");
  }

  // Cada cambio de un tablero o de una alineación vuelve a sacar el
  // resultado del encuentro, guarda y vuelve a pintar la ronda, con el foco
  // en el mismo control.
  function alCambiarEncuentro(m, idFoco) {
    const v = t();
    m.r = E.resultadoEncuentro(v, m);
    guardar();
    pintarRondas();
    const x = $(idFoco);
    if (x) x.focus();
  }

  // Imprimir varias cosas de una ronda en un solo trabajo de impresión: los
  // armadores de cada hoja, mientras `juntando` está prendido, agregan en vez
  // de vaciar su contenedor y no imprimen; «Todo para imprimir» los llama
  // uno detrás de otro e imprime una vez.
  const impresion = { juntando: false, clases: new Set() };
  function empezarHoja(cont, ...nodos) {
    if (impresion.juntando) cont.append(...nodos);
    else cont.replaceChildren(...nodos);
  }
  function imprimirCon(clase) {
    if (impresion.juntando) { impresion.clases.add(clase); return; }
    document.body.classList.add(clase);
    window.print();
  }
  async function imprimirTodoDeRonda(r) {
    $("pi-plantilla").replaceChildren();
    $("pi-firmas").replaceChildren();
    impresion.juntando = true;
    impresion.clases.clear();
    try {
      imprimirPlantillaMesas(r);
      if (E.esDeEquipos(t())) imprimirAlineaciones(r);
      imprimirPlanillasFirma(r);
      await imprimirPlanillasAnotacion(r);
    } finally {
      impresion.juntando = false;
    }
    for (const c of impresion.clases) document.body.classList.add(c);
    window.print();
  }

  // Una hoja aparte para pegar en la pared antes de la ronda: mesa, blancas,
  // negras y un espacio en blanco para anotar el resultado a mano (nunca el
  // que ya está en la base: eso es justo lo que no se quiere acá). Separada
  // de la tabla de arriba, que es la que se imprime para el archivo de la
  // ronda ya jugada.
  function imprimirPlantillaMesas(r, deOtro) {
    const v = deOtro || t();
    const R = v.rondas[r];
    const num = T.numeros(v);
    const cont = $("pi-plantilla");
    // (Con `deOtro`, la de otro torneo del evento: los nombres salen de él.)
    const nombreDe = (id) => (v.jugadores.find((j) => j.id === id) || {}).nombre || "?";
    // Una tabla de columnas fijas (mesa, blancas, negras, resultado): cada
    // fila queda alineada aunque un nombre ocupe dos líneas, y la casilla
    // del resultado nunca se sale de la hoja. Desde la ronda 2, los puntos
    // de cada uno antes de la ronda, como en las listas de pareo de FIDE.
    const jugadorCelda = (id) => el("span", { class: "pi-plantilla-jugador" },
      el("span", { class: "pi-plantilla-nro", texto: num.get(id) + "." }),
      el("span", { class: "pi-plantilla-nombre", texto: nombreDe(id) }),
      r > 0 ? el("span", { class: "pi-plantilla-pts", texto: "(" + puntosTexto(T.puntosHasta(v, id, r)) + ")" }) : null);
    // Cada plantilla es su hoja: con las de todas las categorías juntas,
    // una por hoja (css: .pi-plantilla-hoja + .pi-plantilla-hoja).
    const hoja = el("div", { class: "pi-plantilla-hoja" }, el("h1", { class: "pi-plantilla-titulo" }, tx("plantillaTitulo", { r: r + 1 })),
      v.nombre ? el("p", { class: "pi-plantilla-torneo", texto: v.nombre }) : null);
    empezarHoja(cont, hoja);
    const lista = el("div", { class: "pi-plantilla-lista" },
      el("div", { class: "pi-plantilla-cab", "aria-hidden": "true" },
        el("span", { texto: tx("mesa") }), el("span", { texto: tx("blancas") }), el("span"),
        el("span", { texto: tx("negras") }), el("span", { texto: tx("resultado") })));
    R.mesas.forEach((m, i) => {
      if (m.n === null) {
        lista.append(el("div", { class: "pi-plantilla-mesa pi-plantilla-mesa-bye" },
          el("span", { class: "pi-plantilla-num", texto: V.mesaFisica(v, i) }),
          jugadorCelda(m.b),
          el("span", { class: "pi-plantilla-bye", texto: tx("byePareo", { p: puntosTexto(v.puntos.bye) }) })));
        return;
      }
      lista.append(el("div", { class: "pi-plantilla-mesa" },
        el("span", { class: "pi-plantilla-num", texto: V.mesaFisica(v, i) }),
        jugadorCelda(m.b),
        el("span", { class: "pi-plantilla-vs" }, "–"),
        jugadorCelda(m.n),
        el("span", { class: "pi-plantilla-resultado" })));
    });
    hoja.append(lista);
    imprimirCon("pi-imprimiendo-plantilla");
  }

  // «Inscripción desde el celular»: un enlace (y su QR) para que el
  // entrenador de un centro mande a quien falta. Lo que llega queda en una
  // lista hasta que el árbitro lo acepta (entra con agregarJugadores(), que
  // ya lo anota en el acta como inscripción tardía y revisa la categoría) o
  // lo rechaza. Solo mientras esta pestaña tenga la inscripción abierta.
  const CLAVE_INSCRIBIR = "pareo_inscribir_v1_";
  const CLAVE_PENDIENTES = "pareo_inscripciones_v1_";
  function torneosParaInscribir(ev) { return torneosDelEvento(ev.id).filter((y) => !E.esDeEquipos(y)); }
  function pendientesDe(ev) { const x = leerJSON(CLAVE_PENDIENTES + ev.id, []); return Array.isArray(x) ? x : []; }
  function abrirInscripcion(ev) {
    let codigo = leer(CLAVE_INSCRIBIR + ev.id);
    if (!codigo) { codigo = nuevoCodigoVivo(); escribir(CLAVE_INSCRIBIR + ev.id, codigo); }
    const canal = window.sb.channel("pareo-inscribir-" + codigo);
    estado.inscribir = { id: ev.id, codigo, canal };
    const mandarEstado = () => canal.send({ type: "broadcast", event: "estado", payload: { evento: ev.nombre || "", torneos: torneosParaInscribir(ev).map((y) => V.nombreTorneo(y)) } });
    canal.on("broadcast", { event: "pedir" }, mandarEstado);
    canal.on("broadcast", { event: "inscripcion" }, (msg) => {
      const p = msg.payload || {};
      const texto = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
      const x = { id: "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), torneo: texto(p.torneo, 160), nombre: texto(p.nombre, 80),
        institucion: texto(p.institucion, 80), elo: Math.max(0, Math.min(3000, Math.floor(Number(p.elo) || 0))), autor: texto(p.autor, 60), hora: Date.now() };
      if (x.nombre.length < 3 || !torneosParaInscribir(ev).some((y) => V.nombreTorneo(y) === x.torneo)) return;
      const lista = pendientesDe(ev);
      if (lista.length >= 200 || lista.some((y) => y.torneo === x.torneo && y.nombre.toUpperCase() === x.nombre.toUpperCase())) return;
      escribir(CLAVE_PENDIENTES + ev.id, JSON.stringify(lista.concat(x)));
      canal.send({ type: "broadcast", event: "recibida", payload: { nombre: x.nombre } });
      Avisos.avisar(tx("inscribirLlego", { n: x.nombre, t: x.torneo }), { tipo: "info" });
      if (estado.ficha === "archivos") pintarEvento();
    });
    canal.subscribe((st) => { if (st === "SUBSCRIBED") mandarEstado(); });
  }
  function cerrarInscripcion() {
    if (!estado.inscribir) return;
    const c = estado.inscribir.canal;
    c.send({ type: "broadcast", event: "estado", payload: { cerrada: true } }).finally(() => c.unsubscribe());
    estado.inscribir = null;
  }
  function pintarInscripcionCelular(caja, ev) {
    const abierta = estado.inscribir && estado.inscribir.id === ev.id;
    const boton = el("button", { type: "button", id: "pi-inscribir", class: abierta ? C.botonSec : C.boton, "aria-pressed": abierta ? "true" : "false" }, tx(abierta ? "inscribirCerrar" : "inscribirAbrir"));
    boton.addEventListener("click", async () => {
      if (estado.inscribir && estado.inscribir.id === ev.id) cerrarInscripcion();
      else {
        try { await PareoVer.cargarSupabase(); } catch (e) { Avisos.avisar(tx("errorEnVivo", { e: e.message }), { tipo: "error" }); return; }
        abrirInscripcion(ev);
      }
      pintarEvento();
      const b = $("pi-inscribir");
      if (b) b.focus();
    });
    const qr = el("div", { id: "pi-inscribir-qr", class: "mt-2" });
    const lista = pendientesDe(ev);
    const filas = lista.map((x) => {
      const ya = torneosParaInscribir(ev).find((y) => V.nombreTorneo(y) === x.torneo);
      const repetido = ya && ya.jugadores.some((j) => j.nombre.toUpperCase() === x.nombre.toUpperCase());
      const si = el("button", { type: "button", class: C.mini, "data-aceptar-inscripcion": x.id }, tx("inscribirAceptar"));
      const no = el("button", { type: "button", class: C.miniPeligro, "data-rechazar-inscripcion": x.id }, tx("inscribirRechazar"));
      si.addEventListener("click", () => aceptarInscripcion(ev, x.id));
      no.addEventListener("click", () => { escribir(CLAVE_PENDIENTES + ev.id, JSON.stringify(pendientesDe(ev).filter((y) => y.id !== x.id))); pintarEvento(); });
      return el("li", { class: "flex flex-wrap items-center gap-2 border-t border-brand-100 dark:border-brand-800 pt-2" },
        el("span", { class: "flex-1 min-w-[14rem]" }, el("span", { class: "font-semibold", texto: x.nombre }),
          el("span", { texto: " · " + x.torneo + (x.institucion ? " · " + x.institucion : "") + (x.elo ? " · Elo " + x.elo : "") }),
          el("span", { class: C.nota, texto: " · " + horaCR(x.hora) + (x.autor ? " · " + tx("inscribirPor", { a: x.autor }) : "") }),
          repetido ? el("span", { class: "block text-sm font-semibold", texto: tx("inscribirRepetido") }) : null),
        si, no);
    });
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("inscribirTituloPanel") }),
      el("p", { class: C.nota, texto: tx("inscribirTextoPanel") }), el("div", { class: "mt-2" }, boton), qr,
      lista.length ? el("ul", { id: "pi-inscripciones", class: "mt-3 space-y-2 text-sm" }, filas) : null);
    if (abierta) {
      const url = location.origin + location.pathname + "#inscribir=" + estado.inscribir.codigo;
      PareoQr.cargar().then(() => qr.replaceChildren(el("div", { class: "w-40 bg-white p-2 rounded-lg" }, PareoQr.svg(url, tx("qrEtiqueta"))),
        el("p", { id: "pi-inscribir-url", class: "text-xs break-all mt-2 font-mono", texto: url }))).catch(() => qr.replaceChildren(el("p", { id: "pi-inscribir-url", class: "text-xs break-all font-mono", texto: url })));
    }
  }
  // Aceptar: el torneo se abre y la persona entra como cualquier otra
  // inscripción (con rondas jugadas, queda en el acta como tardía).
  function aceptarInscripcion(ev, id) {
    const x = pendientesDe(ev).find((y) => y.id === id);
    if (!x) return;
    const y = torneosParaInscribir(ev).find((z) => V.nombreTorneo(z) === x.torneo);
    escribir(CLAVE_PENDIENTES + ev.id, JSON.stringify(pendientesDe(ev).filter((z) => z.id !== id)));
    if (!y) { pintarEvento(); return; }
    if (y.__id && y.__id !== estado.id) abrir(y.__id);
    agregarJugadores([{ nombre: x.nombre, institucion: x.institucion, elo: x.elo || 0 }]);
    pintarTodo();
    Avisos.avisar(tx("inscribirAceptada", { n: x.nombre, t: x.torneo }));
  }

  // «Cuánto duró cada ronda»: de cada torneo del evento, cuándo se emparejó,
  // cuándo empezó el reloj, cuándo terminó la última mesa y cuántos minutos
  // fueron; en pantalla y en un Excel, para armar el horario del próximo
  // evento con datos de verdad.
  function pintarDuraciones(caja, ev) {
    const filas = V.duraciones(torneosDelEvento()).filter((x) => x.emparejada || x.fin);
    if (!filas.length) return;
    const hora = (ms) => (ms ? horaCR(ms) : "—");
    const enExcel = el("button", { type: "button", id: "pi-duraciones-excel", class: C.botonSec }, tx("duracionesExcel"));
    enExcel.addEventListener("click", () => {
      const tabla = [[tx("salaTorneo"), tx("duracionRonda"), tx("duracionEmparejada"), tx("duracionInicio"), tx("duracionFin"), tx("duracionMinutos")]]
        .concat(filas.map((x) => [x.torneo, x.ronda, hora(x.emparejada), hora(x.inicio), hora(x.fin), x.minutos == null ? "" : x.minutos]));
      bajar(window.PareoPDF.nombreArchivo(ev.nombre, "duracion-de-las-rondas").replace(/\.pdf$/, ".xlsx"),
        window.TablaExcel.armar([{ nombre: tx("duracionesHoja"), filas: tabla }]), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    });
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("duracionesTitulo") }),
      el("p", { class: C.nota, texto: tx("duracionesTexto") }),
      el("div", { class: "overflow-x-auto mt-2" }, el("table", { id: "pi-duraciones", class: "pi-tabla" },
        el("thead", {}, el("tr", {}, [tx("salaTorneo"), tx("duracionRonda"), tx("duracionEmparejada"), tx("duracionInicio"), tx("duracionFin"), tx("duracionMinutos")].map((x) => el("th", { scope: "col", texto: x })))),
        el("tbody", {}, filas.map((x) => el("tr", {}, el("td", { texto: x.torneo }), el("td", { class: "num", texto: x.ronda }),
          el("td", { texto: hora(x.emparejada) }), el("td", { texto: hora(x.inicio) }), el("td", { texto: hora(x.fin) }),
          el("td", { class: "num", texto: x.minutos == null ? "—" : String(x.minutos) })))))),
      el("div", { class: "mt-2" }, enExcel));
  }

  // «Las mesas de la sala»: la primera mesa de cada torneo (t.mesaInicial),
  // «Numerar seguido» (cada uno empieza donde terminó el anterior), «Volver
  // a 1, 2, 3…» y el plano para pegar en la entrada.
  function pintarMesasDeLaSala(caja, ev) {
    const lista = torneosDelEvento();
    if (lista.length < 2) return;
    const filas = lista.map((y) => {
      const desde = V.mesaFisica(y, 0);
      const campo = el("input", { type: "number", min: "1", max: "999", step: "1", value: String(desde), class: C.campoChico + " w-20",
        "data-mesa-inicial": y.__id || "", "aria-label": tx("salaPrimeraMesaDe", { t: V.nombreTorneo(y) }) });
      campo.addEventListener("change", () => {
        const n = Math.max(1, Math.min(999, Math.floor(Number(campo.value) || 1)));
        y.mesaInicial = n > 1 ? n : undefined;
        if (guardarDelEvento(y)) pintarEvento();
      });
      return el("tr", {}, el("td", { class: "font-semibold", texto: V.nombreTorneo(y) }), el("td", { class: "num", texto: V.mesasQueNecesita(y) }),
        el("td", {}, campo), el("td", { class: "num", texto: V.mesaFisica(y, V.mesasQueNecesita(y) - 1) }));
    });
    const seguido = el("button", { type: "button", id: "pi-sala-seguido", class: C.botonSec }, tx("salaSeguido"));
    seguido.addEventListener("click", () => {
      for (const x of V.numerarSala(lista)) { x.t.mesaInicial = x.desde > 1 ? x.desde : undefined; guardarDelEvento(x.t); }
      pintarEvento();
      Avisos.avisar(tx("salaNumerada"));
    });
    const reiniciar = el("button", { type: "button", class: C.botonSec }, tx("salaReiniciar"));
    reiniciar.addEventListener("click", () => {
      for (const y of lista) { y.mesaInicial = undefined; guardarDelEvento(y); }
      pintarEvento();
    });
    const plano = el("button", { type: "button", id: "pi-sala-plano", class: C.botonSec }, tx("salaPlano"));
    const rotulos = el("button", { type: "button", id: "pi-sala-rotulos", class: C.botonSec }, tx("rotulosBoton"));
    rotulos.addEventListener("click", () => imprimirRotulos(ev, lista));
    const gafetes = el("button", { type: "button", id: "pi-gafetes", class: C.botonSec }, tx("gafetesBoton"));
    gafetes.addEventListener("click", () => imprimirGafetes(ev, lista));
    plano.addEventListener("click", () => imprimirPlanoDeLaSala(ev, lista));
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("salaTitulo") }),
      el("p", { class: C.nota, texto: tx("salaTexto") }),
      el("div", { class: "overflow-x-auto mt-2" }, el("table", { id: "pi-sala-tabla", class: "pi-tabla" },
        el("thead", {}, el("tr", {}, [tx("salaTorneo"), tx("salaNecesita"), tx("salaPrimera"), tx("salaUltima")].map((x) => el("th", { scope: "col", texto: x })))),
        el("tbody", {}, filas))),
      el("div", { class: "mt-2 flex flex-wrap gap-2" }, seguido, reiniciar, plano, rotulos, gafetes));
  }
  // Los gafetes: nombre, categoría, centro educativo y un QR a «Mi jugador»
  // en el enlace del evento, ocho por hoja carta para recortar. El código
  // del evento queda guardado desde ya (el QR impreso sirve cuando el evento
  // se ponga en vivo, aunque hoy no lo esté).
  async function imprimirGafetes(ev, lista) {
    let codigo = leer(CLAVE_VIVO_EVENTO + ev.id);
    if (!codigo) { codigo = nuevoCodigoVivo(); escribir(CLAVE_VIVO_EVENTO + ev.id, codigo); }
    const base = location.origin + location.pathname + "#evento=" + codigo + "&q=";
    try { await PareoQr.cargar(); } catch (e) { Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" }); return; }
    const personas = [];
    for (const y of lista) {
      const cat = V.nombreTorneo(y);
      if (E.esDeEquipos(y)) for (const e of y.jugadores) for (const j of e.integrantes) personas.push({ n: j.nombre, c: cat, i: e.nombre });
      else for (const j of y.jugadores) personas.push({ n: j.nombre, c: cat, i: j.institucion || "" });
    }
    if (!personas.length) { Avisos.avisar(tx("sinJugadoresQueExportar"), { tipo: "error" }); return; }
    const cont = $("pi-firmas");
    cont.replaceChildren(el("div", { class: "pi-gafetes" }, personas.map((x) => el("div", { class: "pi-gafete" },
      el("div", { class: "pi-gafete-texto" },
        el("p", { class: "pi-gafete-evento", texto: ev.nombre || "" }),
        el("p", { class: "pi-gafete-nombre", texto: x.n }),
        el("p", { class: "pi-gafete-cat", texto: x.c }),
        x.i ? el("p", { class: "pi-gafete-centro", texto: x.i }) : null,
        el("p", { class: "pi-gafete-ayuda", texto: tx("gafeteAyuda") })),
      el("div", { class: "pi-gafete-qr" }, PareoQr.svg(base + encodeURIComponent(x.n), tx("anotacionQr", { n: x.n })))))));
    document.body.classList.add("pi-imprimiendo-firmas");
    window.print();
  }
  // Los rótulos de mesa: el número grande, la categoría y un QR que lleva
  // al adjunto directo a esa mesa (#mesa=12, ver irAMesa en js/pareo/ver.js),
  // seis por hoja carta para recortar y pegar. El número es el de la sala
  // (V.mesaFisica), el mismo de la plantilla y de las planillas.
  async function imprimirRotulos(ev, lista) {
    try { await PareoQr.cargar(); } catch (e) { Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" }); return; }
    const base = location.origin + location.pathname + "#mesa=";
    const mesas = [];
    for (const y of lista) for (let i = 0; i < V.mesasQueNecesita(y); i++) mesas.push({ n: V.mesaFisica(y, i), c: V.nombreTorneo(y) });
    mesas.sort((a, b) => a.n - b.n);
    const cont = $("pi-firmas");
    cont.replaceChildren(el("div", { class: "pi-rotulos" }, mesas.map((x) => el("div", { class: "pi-rotulo", "data-rotulo": String(x.n) },
      el("p", { class: "pi-rotulo-mesa", texto: tx("mesa") }),
      el("p", { class: "pi-rotulo-n", texto: String(x.n) }),
      el("p", { class: "pi-rotulo-cat", texto: x.c }),
      el("div", { class: "pi-rotulo-qr" }, PareoQr.svg(base + x.n, tx("rotuloQr", { m: x.n }))),
      el("p", { class: "pi-rotulo-ayuda", texto: tx("rotuloAyuda") })))));
    document.body.classList.add("pi-imprimiendo-firmas");
    window.print();
  }
  // El plano para la entrada: qué mesas son de cada categoría.
  function imprimirPlanoDeLaSala(ev, lista) {
    const cont = $("pi-plantilla");
    const filas = lista.map((y) => el("tr", {}, el("td", { class: "pi-plano-torneo", texto: V.nombreTorneo(y) }),
      el("td", { class: "pi-plano-mesas", texto: tx("salaDeA", { a: V.mesaFisica(y, 0), b: V.mesaFisica(y, V.mesasQueNecesita(y) - 1) }) }),
      el("td", { class: "num", texto: String(y.jugadores.length) })));
    cont.replaceChildren(el("div", { class: "pi-plantilla-hoja pi-plano" },
      el("h1", { class: "pi-plantilla-titulo", texto: tx("salaPlanoTitulo") }),
      el("p", { class: "pi-plantilla-torneo", texto: ev.nombre || "" }),
      el("table", { class: "pi-plano-tabla" },
        el("thead", {}, el("tr", {}, [tx("salaTorneo"), tx("salaMesas"), E.esDeEquipos(lista[0]) ? tx("salaEquipos") : tx("salaJugadores")].map((x) => el("th", { scope: "col", texto: x })))),
        el("tbody", {}, filas))));
    document.body.classList.add("pi-imprimiendo-plantilla");
    window.print();
  }

  // La ronda en juego de cada torneo del evento (el que ya está emparejado):
  // su plantilla, todas juntas, en el orden de la lista de torneos.
  function imprimirPlantillasDelEvento() {
    const lista = torneosDelEvento().filter((y) => y.rondas.length);
    if (!lista.length) { Avisos.avisar(tx("eventoPlantillasNada"), { tipo: "error" }); return; }
    $("pi-plantilla").replaceChildren();
    impresion.juntando = true;
    impresion.clases.clear();
    try {
      for (const y of lista) imprimirPlantillaMesas(y.rondas.length - 1, y);
    } finally {
      impresion.juntando = false;
    }
    document.body.classList.add("pi-imprimiendo-plantilla");
    window.print();
  }

  // Una hoja POR MESA (salto de página entre una y la siguiente) para que el
  // árbitro la recoja firmada: a diferencia de la plantilla de la pared, esta
  // SÍ muestra el resultado ya anotado (si lo hay) — es para confirmarlo, no
  // para ocultarlo. Un bye no tiene con quién firmar: va sin líneas de firma.
  function imprimirPlanillasFirma(r, solo) {
    const v = t();
    const R = v.rondas[r];
    const num = T.numeros(v);
    const cont = $("pi-firmas");
    empezarHoja(cont);
    // Una tarjeta por mesa, cuatro (o más) por hoja: arriba la mesa y la
    // ronda; los dos jugadores lado a lado con su color; el resultado ya
    // anotado o tres casillas para marcarlo; y una línea para cada firma,
    // debajo de su nombre. Se corta por la línea punteada.
    const cabeza = (i) => el("div", { class: "pi-ft-cabeza" },
      el("span", { class: "pi-ft-mesa", texto: tx("mesa") + " " + V.mesaFisica(v, i) }),
      el("span", { class: "pi-ft-torneo", texto: tx("rondaN", { r: r + 1 }) + (v.nombre ? " · " + v.nombre : "") }));
    const lado = (color, id) => el("div", { class: "pi-ft-lado" },
      el("span", { class: "pi-ft-color", texto: tx(color) }),
      el("span", { class: "pi-ft-nombre", texto: num.get(id) + ". " + nombreDe(id) }));
    const casillas = (rr) => (rr
      ? el("span", { class: "pi-ft-anotado", texto: tx("corto_" + rr) })
      : el("span", { class: "pi-ft-casillas" }, ["1-0", "=", "0-1"].map((x) => el("span", { class: "pi-ft-casilla", texto: "☐ " + tx("corto_" + x) }))));
    const firma = (texto) => el("div", { class: "pi-ft-firma" }, el("span", { class: "pi-ft-raya" }), el("span", { class: "pi-ft-quien", texto }));
    R.mesas.forEach((m, i) => {
      if (solo != null && i !== solo) return;
      const hoja = el("div", { class: "pi-firma-mesa pi-ft" }, cabeza(i));
      if (m.n === null) {
        hoja.append(el("div", { class: "pi-ft-jugadores" }, lado("blancas", m.b), el("div", { class: "pi-ft-lado pi-ft-bye", texto: tx("byePareo", { p: puntosTexto(v.puntos.bye) }) })));
        cont.append(hoja);
        return;
      }
      if (E.esDeEquipos(v)) {
        // Un encuentro: los cuatro tableros con quién juega con cada color y
        // su resultado (si ya está), y la firma de los dos capitanes.
        E.prepararMesa(v, m);
        const nombreDeJ = (idE, idJ) => { const j = idJ && jugador(idE).integrantes.find((x) => x.id === idJ); return j ? j.nombre : tx("nadie"); };
        hoja.append(el("div", { class: "pi-ft-jugadores" }, lado("blancas", m.b), lado("negras", m.n)));
        const tabla = el("div", { class: "pi-ft-tableros" });
        for (const x of E.tablerosDe(v, m)) {
          const eb = x.bBlancas ? m.b : m.n, en = x.bBlancas ? m.n : m.b;
          tabla.append(el("div", { class: "pi-ft-tablero" },
            el("span", { class: "pi-ft-t", texto: tx("tableroN", { t: x.k + 1 }) }),
            el("span", { texto: nombreDeJ(eb, x.blancas) + " – " + nombreDeJ(en, x.negras) }),
            casillas(x.r)));
        }
        hoja.append(tabla, el("div", { class: "pi-ft-firmas" }, firma(tx("firmaCapitan", { e: nombreDe(m.b) })), firma(tx("firmaCapitan", { e: nombreDe(m.n) }))));
        cont.append(hoja);
        return;
      }
      hoja.append(
        el("div", { class: "pi-ft-jugadores" }, lado("blancas", m.b), el("span", { class: "pi-ft-vs", texto: "–" }), lado("negras", m.n)),
        el("div", { class: "pi-ft-resultado" }, el("span", { class: "pi-ft-etiqueta", texto: tx("resultado") + ":" }), casillas(m.r)),
        el("div", { class: "pi-ft-firmas" }, firma(tx("firmaDe", { n: nombreDe(m.b) })), firma(tx("firmaDe", { n: nombreDe(m.n) }))));
      cont.append(hoja);
    });
    imprimirCon("pi-imprimiendo-firmas");
  }

  // El afterprint llega sea que se imprima o se cancele: ahí se limpia, una
  // sola vez para toda la página (no hace falta re-engancharlo).
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("pi-imprimiendo-plantilla", "pi-imprimiendo-firmas", "pi-imprimiendo-pared");
    const plantilla = $("pi-plantilla");
    if (plantilla) plantilla.replaceChildren();
    const firmas = $("pi-firmas");
    if (firmas) firmas.replaceChildren();
  });

  // La misma «foto» para los dos caminos (el enlace del momento y la
  // difusión en vivo): la ronda r y la clasificación de ahora, con los
  // mismos datos que ya pintó la pantalla (filasFiltradas(), E.clasificacion()).
  function datosLecturaActual(r) {
    const v = t();
    const R = v.rondas[r];
    const k = rondasCompletas();
    const filas = filasFiltradas(E.clasificacion(hasta(k), v.desempates));
    return {
      v: 1,
      nombre: v.nombre || "",
      ronda: { n: r + 1, mesas: R.mesas.map((m, i) => Object.assign({ m: i + 1, f: V.mesaFisica(v, i), b: nombreDe(m.b), n: m.n == null ? null : nombreDe(m.n), r: m.r || null }, V.tablerosVista(v, m))) },
      // Las rondas terminadas que cuenta la clasificación: con la ronda en
      // juego, todavía no la suma, y quien mira lo tiene que saber.
      hasta: k,
      clasificacion: filas.map((f) => Object.assign({ p: f.puesto, n: jugador(f.id).nombre, pts: f.puntos }, E.esDeEquipos(v) ? { pt: E.puntosTablero(v, f.id, k) } : {})),
      ...V.mejoresVista(v, k),
      evento: enlacesDelEvento(v),
      pub: v.publicado && v.publicado.id ? v.publicado.id : undefined,
    };
  }

  // Los otros torneos del mismo evento, para pasar a ellos desde el celular:
  // el enlace del evento en vivo (que tiene a todos) abierto en cada uno.
  // Solo si el evento está en vivo desde esta pestaña: si no, el enlace
  // llevaría a una página que espera y no le llega nada.
  function enlacesDelEvento(v) {
    if (!v.evento || !estado.eventoVivo || estado.eventoVivo.id !== v.evento.id) return undefined;
    // Va el código, no la dirección: el celular la arma él (lo que llega por
    // el canal no se pone tal cual en un enlace).
    return { nombre: v.evento.nombre || "", codigo: estado.eventoVivo.codigo, este: V.nombreTorneo(v), torneos: torneosDelEvento(v.evento.id).map((y) => V.nombreTorneo(y)) };
  }

  // Un canal de Supabase Realtime en modo Broadcast: efímero, sin tabla y sin
  // RLS (no hay fila que proteger), público por default en este proyecto —
  // la única manera de que otro aparato reciba algo sin que Pareo Integral
  // tenga cuenta ni servidor propio de datos. Ver «El canal en vivo» en
  // docs/decisiones/juegos-y-torneos.md.
  function difundirEnVivo() {
    const v = t();
    if (!estado.enVivo || !estado.canalVivo || !v.rondas.length) return;
    const canal = estado.canalVivo;
    PareoVer.paraMandar(datosLecturaActual(v.rondas.length - 1)).then((payload) => canal.send({ type: "broadcast", event: "estado", payload }));
  }

  async function activarEnVivo() {
    const v = t();
    const estadoTxt = $("pi-ver-en-vivo-estado");
    estadoTxt.hidden = false;
    estadoTxt.textContent = tx("conectandoEnVivo");
    try {
      await PareoVer.cargarSupabase();
    } catch (e) {
      estadoTxt.textContent = tx("errorEnVivo", { e: e.message });
      $("pi-ver-en-vivo").checked = false;
      return false;
    }
    if (!v.liveCodigo) { v.liveCodigo = nuevoCodigoVivo(); guardar(); }
    // Un torneo de un evento: el evento se pone en vivo también, así quien
    // mira este torneo puede pasar a los demás (enlacesDelEvento).
    if (v.evento && !estado.eventoVivo) await prenderEventoVivo(v.evento);
    estado.canalVivo = window.sb.channel("pareo-vivo-" + v.liveCodigo);
    estado.canalVivo.subscribe();
    estado.enVivo = true;
    estadoTxt.textContent = tx("enVivoActivo");
    $("pi-ver-en-vivo-nuevo-codigo").hidden = false;
    difundirEnVivo();
    return true;
  }

  function desactivarEnVivo() {
    if (estado.canalVivo) { estado.canalVivo.unsubscribe(); estado.canalVivo = null; }
    estado.enVivo = false;
    const estadoTxt = $("pi-ver-en-vivo-estado");
    if (estadoTxt) estadoTxt.hidden = true;
    const nuevoCodigo = $("pi-ver-en-vivo-nuevo-codigo");
    if (nuevoCodigo) nuevoCodigo.hidden = true;
  }

  // Una «foto» de esta ronda y la clasificación de ahora, para ver desde el
  // celular sin tocar nada (ver «El enlace y el QR de solo lectura» en
  // docs/decisiones/juegos-y-torneos.md): nada se manda a ningún servidor,
  // los datos viajan comprimidos en la URL (de la mano a la cámara que la
  // lee, nunca por internet). Con «Actualizar sola» marcado, en vez de los
  // datos el enlace lleva el código del canal en vivo (`#vivo=`), y cada
  // `guardar()` manda la foto de nuevo mientras esta pestaña quede abierta.
  async function compartirLectura(r) {
    const v = t();
    const caja = $("pi-ver-compartir");
    const qrCont = $("pi-ver-qr");
    const dirTexto = $("pi-ver-direccion");
    caja.hidden = false;
    qrCont.replaceChildren();
    dirTexto.textContent = tx("generandoQr");
    try {
      const url = estado.enVivo
        ? location.origin + location.pathname + "#vivo=" + v.liveCodigo
        : location.origin + location.pathname + "#ver=" + await PareoVer.empaquetar(datosLecturaActual(r));
      await PareoQr.cargar();
      qrCont.replaceChildren(PareoQr.svg(url, tx("qrEtiqueta")));
      dirTexto.textContent = url;
    } catch (e) {
      dirTexto.textContent = "";
      Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" });
    }
  }

  function pintarRondasNav() {
    // Repinta solo la barra de rondas (el foco queda en la mesa que se estaba llenando).
    const foco = document.activeElement;
    const r = estado.ronda;
    pintarRondas();
    estado.ronda = r;
    if (foco && foco.getAttribute && foco.getAttribute("aria-label")) {
      const igual = [...document.querySelectorAll("#pi-ronda select")].find((s) => s.getAttribute("aria-label") === foco.getAttribute("aria-label"));
      if (igual) igual.focus();
    }
  }

  function pintarRondaNueva(caja, r) {
    const v = t();
    if (r > 0 && !T.rondaCompleta(v.rondas[r - 1])) {
      caja.append(el("p", { class: C.nota, texto: tx("primeroResultados", { r }) }));
      return;
    }
    caja.append(el("h2", { class: "font-serif text-xl font-bold mb-2", texto: tx("emparejarRonda", { r: r + 1 }) }));
    if (r === 0) {
      const sinCategoria = v.jugadores.filter((j) => !j.categoria).length;
      const sinInstitucion = v.jugadores.filter((j) => !j.institucion).length;
      const sinElo = v.jugadores.filter((j) => !(Number(j.elo) > 0)).length;
      const problemas = [
        sinCategoria && [sinCategoria, "sinCategoriaResumen"],
        sinInstitucion && [sinInstitucion, "sinInstitucionResumen"],
        sinElo && [sinElo, "sinEloResumen"],
      ].filter(Boolean);
      if (problemas.length) {
        caja.append(el("div", { class: "mb-4" },
          el("p", { class: C.nota, texto: tx("antesDeEmparejar") }),
          el("ul", { class: "list-disc pl-6 text-sm text-brand-600 dark:text-brand-300" },
            problemas.map(([n, clave]) => el("li", { texto: tx(clave, { n }) })))));
      }
    }
    // Lo que quedó de la inscripción para revisar (evento de los JDE): cada
    // punto se marca como visto, y hasta marcarlos todos no se empareja.
    if (r === 0 || (v.pasarLista && !T.fijo(v))) pintarPasarLista(caja, pintarRondas);
    // En un suizo, quien no se acreditó no se empareja en ninguna ronda; en
    // todos contra todos, se decide antes de sortear la ronda 1.
    const ausentes = r === 0 || !T.fijo(v) ? noLlegaron(v) : [];
    let faltanRevisar = () => 0;
    const revisarEstado = el("p", { id: "pi-revisar-estado", class: "text-sm mt-2 font-semibold", role: "status" });
    if (r === 0) {
      const pend = V.pendientes(v);
      if (pend.length) {
        const vistos = new Set(v.revisadoAntes || []);
        const ul = el("ul", { id: "pi-revisar-lista", class: "mt-2 space-y-1 text-sm" });
        pend.forEach((x, i) => {
          const id = "pi-revisar-" + i, k = claveRevisar(x);
          ul.append(el("li", { class: "flex items-start gap-2" },
            el("input", { type: "checkbox", id, class: "mt-1", checked: vistos.has(k), onchange: (e) => {
              if (e.target.checked) vistos.add(k); else vistos.delete(k);
              v.revisadoAntes = [...vistos];
              guardar();
              actualizarRevision();
            } }),
            el("label", { for: id, texto: textoRevisar(x) })));
        });
        faltanRevisar = () => sinRevisar(v);
        caja.append(el("section", { id: "pi-revisar", class: "mb-4 rounded-xl border-2 border-accent-500 p-3", "aria-labelledby": "pi-revisar-titulo" },
          el("h3", { id: "pi-revisar-titulo", class: "font-semibold", texto: tx("revisarTitulo") }),
          el("p", { class: "text-sm mt-1", texto: tx("revisarTexto") }), ul, revisarEstado));
      }
    }
    // Quienes quedaron fuera de esta ronda por perder por incomparecencia en
    // la anterior (T.retirosPorIncomparecencia): por si alguno llegó y avisó,
    // se devuelve con un clic, antes de emparejar.
    const fueraPorIncomparecencia = r > 0 ? v.jugadores.filter((j) => j.retiroAuto === r && j.retiradoDespuesDe === r) : [];
    if (fueraPorIncomparecencia.length) {
      caja.append(el("section", { id: "pi-fuera-incomparecencia", class: "mb-4 rounded-xl border-2 border-accent-500 p-3", "aria-labelledby": "pi-fuera-titulo" },
        el("h3", { id: "pi-fuera-titulo", class: "font-semibold", texto: tx("fueraTitulo", { r: r + 1 }) }),
        el("p", { class: "text-sm mt-1", texto: tx("fueraTexto") }),
        el("ul", { class: "mt-2 space-y-1 text-sm" }, fueraPorIncomparecencia.map((j) => el("li", { class: "flex flex-wrap items-center gap-2" },
          el("span", { class: "font-semibold", texto: j.nombre + (j.institucion ? " (" + j.institucion + ")" : "") }),
          el("button", { type: "button", class: C.mini, "data-devolver": j.id, "aria-label": tx("volverA", { n: j.nombre }), onclick: () => {
            devolverAlTorneo(j);
            pintarRondas();
            const sig = document.querySelector("#pi-fuera-incomparecencia [data-devolver]") || $("pi-emparejar");
            if (sig) sig.focus();
          } }, tx("volver")))))));
    }
    // Lo que el árbitro marca antes de emparejar (byes pedidos, «no viene»)
    // se guarda con el torneo: si se cierra la página antes de emparejar, no
    // se pierde. Lo que sale de la acreditación no: se recalcula cada vez
    // (marcarlo presente después tiene que sacarlo de «no viene»).
    if (!v.pedidas || v.pedidas.r !== r) v.pedidas = { r, ausencias: {} };
    const elegidas = v.pedidas.ausencias;
    const pedidas = Object.assign({}, elegidas);
    if (v.sistema === "scheveningen") {
      caja.append(el("p", { class: C.nota + " mb-3", texto: tx("schevAyuda") }));
      if (r === 0) caja.append(equiposSchevVista(v));
    } else if (v.sistema === "todos") {
      caja.append(el("p", { class: C.nota + " mb-3", texto: tx("todosAyuda") }));
      if (r === 0) {
        const lista = el("ol", { class: "list-decimal pl-6 mb-3 text-sm" });
        for (const id of T.ordenInicial(v)) lista.append(el("li", { texto: nombreDe(id) }));
        caja.append(el("h3", { class: "font-semibold", texto: tx("numerosSorteo") }), lista,
          el("div", { class: "flex flex-wrap gap-2 mb-4" },
            el("button", { type: "button", class: C.botonSec, onclick: () => { T.sortearNumeracion(v); anotarSorteo(v, "numeros"); guardar(); pintarRondas(); Avisos.avisar(tx("sorteados")); } }, tx("sortear")),
            el("button", { type: "button", id: "pi-sortear-proyector", class: C.botonSec, onclick: () => abrirSorteo("numeros") }, tx("sorteoProyector"))));
      }
    } else {
      caja.append(el("p", { class: C.nota + " mb-3", texto: tx("byesAyuda") }));
      // El color del n.º 1 en la ronda 1, sorteado a la vista de todos.
      if (r === 0) caja.append(el("div", { class: "flex flex-wrap items-center gap-2 mb-3" },
        el("span", { class: "text-sm", texto: tx("sorteoColorActual", { c: (v.colorInicial === "b" ? tx("negras") : tx("blancas")).toLowerCase() }) }),
        el("button", { type: "button", id: "pi-sortear-color", class: C.mini, onclick: () => abrirSorteo("color") }, tx("sorteoColorBoton"))));
      const ul = el("ul", { class: "grid sm:grid-cols-2 gap-x-6 gap-y-1 mb-4" });
      const num = T.numeros(v);
      for (const id of T.ordenInicial(v)) {
        const j = jugador(id);
        if (j.retiradoDespuesDe != null && r >= j.retiradoDespuesDe) {
          ul.append(el("li", { class: "text-sm text-brand-600 dark:text-brand-300", texto: num.get(id) + ". " + j.nombre + " — " + tx("retirado") }));
          continue;
        }
        const s = el("select", { class: C.campoChico, "aria-label": tx("juegaRonda", { n: j.nombre, r: r + 1 }) },
          el("option", { value: "", texto: tx("juega") }),
          el("option", { value: "H", texto: tx("byeMedio", { p: puntosTexto(v.puntos.tablas) }) }),
          el("option", { value: "Z", texto: tx("byeCero") }),
          el("option", { value: "F", texto: tx("byeEntero", { p: puntosTexto(v.puntos.victoria) }) }));
        const noViene = el("button", { type: "button", class: C.mini });
        const actualizarNoViene = () => {
          const marcado = s.value === "Z";
          noViene.textContent = tx(marcado ? "deshacerNoViene" : "noViene");
          noViene.setAttribute("aria-label", tx(marcado ? "deshacerNoVieneA" : "noVieneA", { n: j.nombre }));
        };
        s.addEventListener("change", () => {
          if (s.value) { pedidas[id] = s.value; elegidas[id] = s.value; } else { delete pedidas[id]; delete elegidas[id]; }
          actualizarNoViene();
          guardar();
        });
        if (pedidas[id]) s.value = pedidas[id];
        // Quien no llegó al pasar lista queda de entrada como «no viene».
        if (ausentes.includes(id)) { s.value = "Z"; pedidas[id] = "Z"; }
        noViene.addEventListener("click", () => { s.value = s.value === "Z" ? "" : "Z"; s.dispatchEvent(new Event("change")); });
        actualizarNoViene();
        ul.append(el("li", { class: "flex items-center justify-between gap-2" }, el("span", { class: "text-sm", texto: num.get(id) + ". " + j.nombre }), el("div", { class: "flex items-center gap-1" }, s, noViene)));
      }
      caja.append(ul);
    }
    if (r === 0 && !v.publicado) caja.append(el("p", { id: "pi-publico-ronda1", class: C.nota + " mb-3", texto: tx("publicarSoloRonda1") }));
    const boton = el("button", { type: "button", id: "pi-emparejar", class: C.boton }, tx("emparejarRonda", { r: r + 1 }));
    const msg = el("p", { class: "mt-3 text-sm", role: "status", "aria-live": "polite" });
    function actualizarRevision() {
      const f = faltanRevisar();
      boton.disabled = f > 0;
      revisarEstado.textContent = f ? tx(f === 1 ? "revisarFaltaUno" : "revisarFaltan", { n: f }) : tx("revisarListo");
    }
    actualizarRevision();
    boton.addEventListener("click", async () => {
      if (faltanRevisar()) { Avisos.avisar(revisarEstado.textContent, { tipo: "error" }); return; }
      // El repaso de lo que conviene mirar antes de seguir: no bloquea, se
      // emparejan igual si el árbitro lo dice.
      const dudas = dudasAntesDeEmparejar(v, r);
      if (dudas.length) {
        const seguir = await Avisos.confirmar(tx("dudasTexto", { r: r + 1 }) + "\n\n• " + dudas.join("\n• "), { aceptar: tx("dudasEmparejar"), cancelar: tx("dudasRevisar") });
        if (!seguir || t() !== v || v.rondas.length !== r) return;
      }
      if (r === 0 && ausentes.length) {
        const nombres = ausentes.map(nombreDe);
        if (T.fijo(v)) {
          // En todos contra todos no hay «no viene» por ronda: o se sacan
          // del torneo antes de sortear, o juegan todos.
          const sacar = await Avisos.confirmar(tx("listaSacar", { n: ausentes.length, l: nombres.join(", ") }), { aceptar: tx("listaSacarSi"), cancelar: tx("listaConTodos") });
          if (t() !== v || v.rondas.length) return;
          if (sacar) {
            v.jugadores = v.jugadores.filter((j) => !ausentes.includes(j.id));
            v.noSePresentaron = (v.noSePresentaron || []).concat(nombres);
            guardar();
          }
        } else v.noSePresentaron = nombres.filter((n, k) => pedidas[ausentes[k]] === "Z");
      }
      boton.disabled = true;
      msg.textContent = tx("emparejando");
      // Con muchos jugadores el Sistema Holandés tarda (crece con el cubo de
      // cuántos son: 800 son unos 20 segundos): se dice y se cuenta.
      const juegan = T.fijo(v) ? v.jugadores.length : T.participantes(v, r, pedidas).length;
      const desde = Date.now();
      // (El aviso se lee una vez; la cuenta de segundos va aparte, fuera de
      // la región que lee el lector de pantalla, para no repetirlo cada segundo.)
      const lleva = el("span", { id: "pi-emparejar-lleva", class: "block" });
      if (juegan >= 250) { msg.textContent = tx("emparejandoMucho", { n: juegan, s: Math.max(5, Math.round(20 * Math.pow(juegan / 800, 3))) }); msg.after(lleva); }
      const cuenta = juegan >= 250 ? setInterval(() => { lleva.textContent = tx("emparejandoLleva", { l: Math.round((Date.now() - desde) / 1000) }); }, 1000) : null;
      try {
        await emparejar(r, pedidas);
        // Quienes quedaron fuera por no estar acreditados (van así al informe).
        const R0 = v.rondas[r];
        const sinAcreditar = R0 && R0.ausencias ? ausentes.filter((id) => R0.ausencias[id] === "Z") : [];
        if (sinAcreditar.length) { R0.sinAcreditar = sinAcreditar; guardar(); }
        estado.ronda = r;
        pintarRondas();
        Avisos.avisar(tx("rondaLista", { r: r + 1 }));
        const primero = document.querySelector("#pi-ronda select");
        if (primero) primero.focus();
      } catch (e) {
        msg.textContent = "";
        Avisos.avisar(e.codigo === 1 ? tx("sinPareoPosible") : tx("errorMotor", { e: e.message }), { tipo: "error" });
      } finally {
        if (cuenta) clearInterval(cuenta);
        lleva.remove();
        boton.disabled = faltanRevisar() > 0;
      }
    });
    caja.append(boton, msg);
  }

  // Pasar lista antes de la ronda 1: quién llegó. Se prende con la casilla;
  // apagada, no cambia nada.
  const noLlegaron = (v) => (v.pasarLista ? v.jugadores.filter((j) => !(v.asistencia || {})[j.id] && j.retiradoDespuesDe == null).map((j) => j.id) : []);
  // La acreditación (pasar lista): en la ficha Jugadores y antes de
  // emparejar cada ronda. Quien no está marcado presente no se empareja en
  // ninguna ronda (en un suizo, queda como «no viene») hasta que el árbitro
  // lo marque. `repintar`: la ficha donde está.
  function pintarPasarLista(caja, repintar, pre) {
    pre = pre || "pi";
    const v = t();
    const det = el("details", { id: pre + "-asistencia", class: "mb-4 rounded-xl border border-brand-200 dark:border-brand-700 p-3", open: !!v.pasarLista });
    det.append(el("summary", { class: "cursor-pointer font-semibold rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto: tx("listaTitulo") }),
      el("p", { class: C.nota + " mt-1", texto: tx("listaTexto") }),
      el("label", { class: "flex items-start gap-2 text-sm mt-2" },
        el("input", { type: "checkbox", id: pre + "-asistencia-activar", class: "mt-1", checked: !!v.pasarLista, onchange: (e) => {
          v.pasarLista = e.target.checked;
          if (v.pasarLista && !v.asistencia) v.asistencia = {};
          guardar(); repintar();
          const x = $(pre + "-asistencia-activar"); if (x) x.focus();
        } }),
        el("span", { class: "font-semibold", texto: tx("listaActivar") })));
    if (v.pasarLista) {
      const orden = T.ordenInicial(v);
      det.append(el("p", { id: pre + "-asistencia-cuenta", class: "text-sm mt-2", role: "status", texto: tx("listaCuenta", { n: orden.filter((id) => v.asistencia[id]).length, t: orden.length }) }),
        el("button", { type: "button", id: pre + "-asistencia-todos", class: C.mini + " mt-1", onclick: () => { for (const id of orden) v.asistencia[id] = true; guardar(); repintar(); } }, tx("listaTodos")));
      const ul = el("ul", { class: "mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm" });
      for (const id of orden) {
        const cid = pre + "-llego-" + id;
        ul.append(el("li", { class: "flex items-start gap-2" },
          el("input", { type: "checkbox", id: cid, class: "mt-1", checked: !!v.asistencia[id], onchange: (e) => {
            if (e.target.checked) v.asistencia[id] = true; else delete v.asistencia[id];
            guardar(); repintar();
            const x = $(cid); if (x) x.focus();
          } }),
          el("label", { for: cid, texto: nombreDe(id) })));
      }
      det.append(ul);
    }
    caja.append(det);
  }

  // Lo que conviene revisar antes de emparejar la ronda r+1: las sorpresas
  // de Elo y lo que un adjunto anotó distinto en la ronda anterior que nadie
  // miró (pintarConfirmar), y un nombre que está dos veces en la lista (un
  // jugador inscrito dos veces juega contra todos por partida doble).
  const claveNombre = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  function dudasAntesDeEmparejar(v, r) {
    const out = [];
    const R = r > 0 ? v.rondas[r - 1] : null;
    if (R) {
      const vistas = new Set(R.confirmadas || []);
      for (const x of V.sorpresas(v, r - 1)) if (!vistas.has(x.mesa + "|" + x.r)) out.push(tx("sorpresaTexto", { m: V.mesaFisica(v, x.mesa), g: x.gana, p: x.pierde, d: x.dif }));
      for (const x of R.discrepancias || []) if (!x.resuelta) out.push(tx(x.tablero ? "discrepanciaTablero" : "discrepanciaTexto", { m: x.mesa, t: x.tablero, r: tx("corto_" + x.r), y: tx("corto_" + x.ya) }));
    }
    const vistos = new Map();
    for (const j of v.jugadores) {
      if (j.retiradoDespuesDe != null && r >= j.retiradoDespuesDe) continue;
      const k = claveNombre(j.nombre);
      if (!k) continue;
      vistos.set(k, (vistos.get(k) || []).concat(j.nombre));
    }
    for (const nombres of vistos.values()) if (nombres.length > 1) out.push(tx("dudaRepetido", { n: nombres[0], k: nombres.length }));
    return out;
  }

  async function emparejar(r, pedidas) {
    const v = t();
    if (v.rondas.length !== r) throw new Error(tx("yaEmparejada"));
    if (r === 0 && !Array.isArray(v.numeracion)) T.fijarNumeracion(v);
    if (r === 0) E.fijarOrden(v);
    let ronda;
    if (v.sistema === "scheveningen") {
      if (E.esDeEquipos(v)) throw new Error(tx("schevSoloIndividual"));
      const eq = T.equiposScheveningen(v);
      if (eq.error) throw new Error(textoErrorSchev(eq));
    }
    if (T.fijo(v)) {
      if (v.jugadores.length < 2) throw new Error(tx("pocosJugadores"));
      ronda = T.rondaFija(v, r);
      // En todos contra todos el calendario es fijo: el retirado no se saca
      // de la ronda, pierde su partida sin jugarla (y si faltan los dos, «--»).
      const fuera = (id) => { const j = v.jugadores.find((x) => x.id === id); return !!j && j.retiradoDespuesDe != null && r >= j.retiradoDespuesDe; };
      if (!E.esDeEquipos(v)) for (const m of ronda.mesas) {
        if (m.n == null) continue;
        const fb = fuera(m.b), fn = fuera(m.n);
        if (fb || fn) m.r = fb && fn ? "--" : fb ? "-+" : "+-";
      }
    } else {
      const juegan = T.participantes(v, r, pedidas);
      if (juegan.length < 2) throw new Error(tx("pocosJugadores"));
      const trf = T.aTrf(v, { hasta: r, proxima: { ausencias: pedidas } });
      const mesas = T.leerPareo(v, await motor.emparejar(trf));
      ronda = { mesas, ausencias: Object.assign({}, pedidas) };
    }
    if (t() !== v || v.rondas.length !== r) throw new Error(tx("yaEmparejada"));
    // En un torneo por equipos, cada encuentro trae su alineación (los cuatro
    // primeros del orden de tableros) y un resultado por tablero.
    // Un equipo que ya de entrada no llega a dos (art. 66.2.f) pierde el
    // encuentro al emparejar: el resultado queda puesto, no «falta».
    if (E.esDeEquipos(v)) for (const m of ronda.mesas) {
      if (m.n === null) continue;
      E.prepararMesa(v, m);
      if (E.puntosDelEncuentro(v, m).incomparecencia) m.r = E.resultadoEncuentro(v, m);
    }
    // Quien tiene mesa fija (una silla de ruedas…) queda en su mesa.
    const movidas = V.aplicarMesasFijas(v, ronda);
    v.rondas.push(ronda);
    delete v.pedidas;
    guardar();
    if (movidas.length) Avisos.avisar(tx("mesasFijasAplicadas", { l: movidas.map((x) => x.nombre + " → " + tx("mesa") + " " + x.mesa).join(", ") }), { tipo: "info" });
  }

  async function deshacerRonda(r) {
    const v = t();
    const conResultados = v.rondas[r].mesas.some((m) => m.n && m.r);
    const ok = await Avisos.confirmar(tx(conResultados ? "confirmarDeshacerConResultados" : "confirmarDeshacer", { r: r + 1 }),
      { aceptar: tx("deshacerRonda"), peligro: true });
    if (!ok || v.rondas.length !== r + 1) return;
    v.rondas.pop();
    if (r === 0 && v.sistema !== "todos" && !v.numeracionDeArchivo) v.numeracion = null;
    // Sin la ronda 1, el orden de tableros se vuelve a poder cambiar.
    if (r === 0) delete v.ordenTableros;
    guardar();
    estado.ronda = r;
    pintarRondas();
  }

  // Las mismas filas de E.clasificacion(), acotadas a la institución elegida
  // (si hay una elegida): la usan la pantalla y el PDF por igual, para que
  // lo que se baja sea siempre lo que se está viendo.
  function filasFiltradas(todasFilas) {
    return estado.filtroInstitucion
      ? todasFilas.filter((f) => jugador(f.id).institucion === estado.filtroInstitucion) : todasFilas;
  }

  // ---------- Scheveningen ----------
  // Por qué no se puede emparejar, dicho con los nombres.
  function textoErrorSchev(e) {
    if (e.error === "sinEquipo") return tx("schevSinEquipo", { l: e.ids.map(nombreDe).join(", ") });
    if (e.error === "dosEquipos") return tx("schevDosEquipos", { n: e.cuantos, l: e.nombres.join(", ") });
    if (e.error === "mismoNumero") return tx("schevMismoNumero", { a: e.a.nombre, na: e.a.ids.length, b: e.b.nombre, nb: e.b.ids.length });
    return tx("schevMuchos", { m: e.max, n: Math.max(e.a.ids.length, e.b.ids.length) });
  }

  // Antes de la ronda 1: los dos equipos con su orden de tableros, o lo que
  // falta para poder armarlos.
  function equiposSchevVista(v) {
    const e = T.equiposScheveningen(v);
    if (e.error) return el("p", { class: "mb-4 text-sm font-semibold text-red-800 dark:text-red-200", role: "status", texto: textoErrorSchev(e) });
    const lista = (letra, eq) => el("div", {},
      el("h4", { class: "font-semibold text-sm", texto: tx("schevEquipoTitulo", { l: letra, e: eq.nombre }) }),
      el("ol", { class: "list-decimal pl-6 text-sm" }, eq.ids.map((id) => el("li", { texto: nombreDe(id) }))));
    return el("div", { class: "mb-4" },
      el("h3", { class: "font-semibold mb-1", texto: tx("schevEquipos") }),
      el("div", { class: "grid sm:grid-cols-2 gap-4" }, lista("A", e.a), lista("B", e.b)));
  }

  // El marcador del encuentro: lo que importa en un Scheveningen es qué
  // equipo suma más. Va arriba de la clasificación individual.
  function pintarMarcadorSchev(v) {
    const caja = $("pi-clas-schev");
    if (!caja) return;
    caja.replaceChildren();
    const m = v.sistema === "scheveningen" && v.rondas.length ? T.marcadorScheveningen(v) : null;
    caja.hidden = !m;
    if (!m) return;
    const total = T.rondasDelTorneo(v);
    const terminado = v.rondas.length === total && m.rondas.every((x) => !x.faltan);
    const frase = m.totalA === m.totalB ? tx(terminado ? "schevEmpateFinal" : "schevEmpate")
      : tx(terminado ? "schevGano" : "schevGana", { e: m.totalA > m.totalB ? m.a : m.b });
    const filas = m.rondas.map((x, k) => el("tr", {},
      el("th", { scope: "row", class: "num", texto: k + 1 }),
      el("td", { class: "num", texto: puntosTexto(x.a) }), el("td", { class: "num", texto: puntosTexto(x.b) }),
      el("td", { texto: x.faltan ? tx("schevFaltan", { n: x.faltan }) : "" })));
    caja.append(
      el("h3", { class: "font-semibold", texto: tx("schevMarcador") }),
      el("p", { class: "text-lg font-bold mt-1", texto: tx("schevMarcadorTotal", { a: m.a, pa: puntosTexto(m.totalA), pb: puntosTexto(m.totalB), b: m.b }) }),
      el("p", { class: "text-sm mb-2", texto: frase }),
      el("div", { class: "overflow-x-auto" }, el("table", { class: "pi-tabla" },
        el("thead", {}, el("tr", {}, el("th", { scope: "col", class: "num", texto: tx("schevRonda") }),
          el("th", { scope: "col", class: "num", texto: m.a }), el("th", { scope: "col", class: "num", texto: m.b }), el("th", { scope: "col", texto: tx("schevPendientes") }))),
        el("tbody", {}, filas))));
  }

  // ---------- Clasificación ----------
  function pintarClasificacion() {
    const v = t();
    const k = rondasCompletas();
    const tc = hasta(k);
    const todasFilas = E.clasificacion(tc, v.desempates);
    const filas = filasFiltradas(todasFilas);
    const num = T.numeros(v);
    $("pi-clas-titulo").textContent = k ? tx("clasificacionTras", { r: k }) : tx("fClasificacion");
    $("pi-clas-nota").textContent = (k < v.rondas.length ? tx("clasSoloCompletas", { r: k }) : (v.nombre || ""))
      + (estado.filtroInstitucion ? tx("clasFiltroNota", { n: filas.length, total: todasFilas.length, inst: estado.filtroInstitucion }) : "");
    pintarSelectInstitucion($("pi-clas-institucion"));
    pintarMarcadorSchev(v);
    const tabla = $("pi-tabla-clas");
    tabla.replaceChildren();
    if (!v.jugadores.length) return;
    // El Elo que gana o pierde cada uno (js/pareo/elo.js), si hay Elo.
    const elos = conElo(v) ? PareoElo.calcular(v, k) : null;
    const thElo = elos ? [["Rp", "eloRp"], ["K", "eloK"], ["±Elo", "eloCambio"]].map(([c, d]) => el("th", { class: "num", scope: "col" }, el("abbr", { title: tx(d), texto: c }))) : [];
    tabla.append(el("thead", {}, el("tr", {},
      el("th", { class: "num", scope: "col", texto: tx("puesto") }), el("th", { class: "num", scope: "col", texto: tx("nro") }),
      el("th", { scope: "col", texto: tx("nombre") }), el("th", { scope: "col", texto: tx("institucion") }),
      el("th", { scope: "col", texto: tx("fed") }), el("th", { class: "num", scope: "col", texto: "Elo" }),
      el("th", { class: "num", scope: "col", texto: tx("pts") }),
      v.desempates.map((c) => el("th", { class: "num", scope: "col" }, el("abbr", { title: (E.catalogo(v).find((x) => x.codigo === c) || {})[idioma], texto: c }))), thElo)));
    const cuerpo = el("tbody");
    for (const f of filas) {
      const j = jugador(f.id);
      const x = elos && elos.get(f.id);
      cuerpo.append(el("tr", { "data-id": f.id },
        el("td", { class: "num", texto: f.puesto }), el("td", { class: "num", texto: num.get(f.id) }),
        el("td", { class: "font-semibold", texto: j.nombre + (j.titulo ? " (" + j.titulo + ")" : "") }),
        el("td", { texto: j.institucion || "" }),
        el("td", { texto: j.fed || "" }), el("td", { class: "num", texto: Number(j.elo) > 0 ? j.elo : "" }),
        el("td", { class: "num font-bold", texto: puntosTexto(f.puntos) }),
        v.desempates.map((c) => el("td", { class: "num", texto: valorDesempate(c, f.valores[c]) })),
        elos ? celdasElo(x).map((c) => el("td", { class: "num", "data-elo": c[0], texto: c[1] })) : null));
    }
    tabla.append(cuerpo);
    const dl = $("pi-clas-leyenda");
    dl.replaceChildren();
    if (elos) {
      for (const [c, d] of [["Rp", "eloRp"], ["K", "eloK"], ["±Elo", "eloCambio"]]) dl.append(el("div", {}, el("dt", { class: "inline font-semibold", texto: c + ": " }), el("dd", { class: "inline", texto: tx(d) })));
      dl.append(el("p", { class: C.nota + " mt-1", texto: tx("eloNota") }));
    }
    for (const c of v.desempates) {
      const info = E.catalogo(v).find((x) => x.codigo === c);
      if (info) dl.append(el("div", {}, el("dt", { class: "inline font-semibold", texto: c + ": " }), el("dd", { class: "inline", texto: info[idioma] })));
    }
    pintarMejoresTableros(k);
    pintarPremios(k);
  }

  // En un torneo por equipos, el mejor de cada tablero (como en las
  // olimpiadas): js/pareo/equipos.js, mejoresTableros.
  function pintarMejoresTableros(k) {
    const v = t();
    const caja = $("pi-clas-tableros");
    caja.replaceChildren();
    if (!E.esDeEquipos(v) || !k) return;
    const tableros = E.mejoresTableros(v, k);
    caja.append(el("h3", { class: "font-serif text-lg font-bold mt-6 mb-1", texto: tx("mejorTableroTitulo") }),
      el("p", { class: C.nota + " mb-2", texto: tx("mejorTableroAyuda", { m: tableros[0].minimo }) }));
    for (const x of tableros) {
      caja.append(el("h4", { class: "font-semibold mt-3", texto: tx("tableroN", { t: x.tablero }) }));
      if (!x.filas.length) { caja.append(el("p", { class: C.nota, texto: tx("mejorTableroNadie") })); continue; }
      caja.append(el("div", { class: "overflow-x-auto" }, el("table", { class: "pi-tabla", "data-tablero": x.tablero },
        el("thead", {}, el("tr", {},
          el("th", { class: "num", scope: "col", texto: tx("puesto") }), el("th", { scope: "col", texto: tx("nombre") }),
          el("th", { scope: "col", texto: tx("equipo") }), el("th", { class: "num", scope: "col", texto: tx("pts") }),
          el("th", { class: "num", scope: "col", texto: tx("partidas") }), el("th", { class: "num", scope: "col", texto: "%" }))),
        el("tbody", {}, x.filas.slice(0, 5).map((f) => el("tr", {},
          el("td", { class: "num", texto: f.puesto }), el("td", { class: "font-semibold", texto: f.nombre }),
          el("td", { texto: f.institucion }), el("td", { class: "num", texto: puntosTexto(f.puntos) }),
          el("td", { class: "num", texto: f.jugadas }), el("td", { class: "num", texto: Math.round(f.porcentaje * 100) })))))));
    }
  }

  // ---------- Publicar en «Torneos en Pareo Integral» ----------
  // El torneo se publica sin cuenta (js/pareo/publicar.js) y queda con su
  // clave (`t.publicado`): cada vez que se guarda, a los 30 segundos, se pone
  // al día solo (con una sola llamada aunque se anoten diez resultados en ese
  // rato). «Dejar de publicar» lo quita del espacio público. Antes de tener
  // jugadores se publica como anuncio (`t.anuncio`), y se puede abrir la
  // inscripción previa (`t.inscripcion`): lo que llega se lee acá con la clave
  // y entra a la lista solo si se acepta.
  const ESPERA_PUBLICAR = 30000;
  const publicando = new Map();
  // Lo que va con el torneo y no vive en él: el código del enlace en vivo de
  // su evento (en este navegador).
  const extraPublicar = (tor) => ({ codigoEvento: tor.evento ? leer(CLAVE_VIVO_EVENTO + tor.evento.id) || "" : "", organizador: organizacion() || undefined });
  function programarPublicacion() {
    const id = estado.id;
    if (publicando.has(id)) return;
    publicando.set(id, setTimeout(() => { publicando.delete(id); actualizarPublicado(id); }, ESPERA_PUBLICAR));
  }
  async function actualizarPublicado(id, boton) {
    const tor = id === estado.id ? t() : leerJSON(PREFIJO + id, null);
    if (!tor || !tor.publicado) return;
    if (boton) boton.disabled = true;
    const r = await PareoPublicar.actualizar(tor, extraPublicar(tor));
    if (boton) boton.disabled = false;
    if (r.ok) {
      tor.publicado.hora = Date.now();
      escribir(PREFIJO + id, JSON.stringify(tor));
      if (id === estado.id && estado.ficha === "archivos") pintarPublicar();
      if (boton) Avisos.avisar(tx("publicarAlDia"));
      return;
    }
    if (r.noExiste) {
      delete tor.publicado;
      escribir(PREFIJO + id, JSON.stringify(tor));
      if (id === estado.id && estado.ficha === "archivos") pintarPublicar();
    }
    if (boton || r.noExiste) Avisos.avisar(r.error || tx("publicarSinRed"), { tipo: "error" });
  }
  // Todo torneo se publica solo al emparejar la ronda 1 (lo decidió el dueño
  // del sitio: «que se vean todos los torneos que hagan todos los
  // árbitros», sin poder apagarlo). Sin internet, se vuelve a intentar con
  // el próximo cambio, como mucho una vez por minuto. Lo dicen la ficha
  // Torneo, la ronda 1 antes de emparejar, Archivos y la política de
  // privacidad.
  const publicandoSolo = new Set();
  const reintentoSolo = new Map();
  async function publicarSolo(id, ahora) {
    if (publicandoSolo.has(id) || (!ahora && (reintentoSolo.get(id) || 0) > Date.now())) return;
    const tor = id === estado.id ? t() : leerJSON(PREFIJO + id, null);
    if (!tor || tor.publicado || !tor.rondas.length) return;
    publicandoSolo.add(id);
    const r = await PareoPublicar.crear(tor, extraPublicar(tor));
    publicandoSolo.delete(id);
    if (!r.ok) { reintentoSolo.set(id, Date.now() + 60000); if (ahora) Avisos.avisar(r.error || tx("publicarSinRed"), { tipo: "error" }); return; }
    const actual = id === estado.id ? t() : leerJSON(PREFIJO + id, null);
    if (!actual || actual.publicado) return;
    actual.publicado = { id: r.id, clave: r.clave, hora: Date.now() };
    escribir(PREFIJO + id, JSON.stringify(actual));
    if (id === estado.id && estado.ficha === "archivos") pintarPublicar();
  }

  async function publicarTorneos(lista, boton) {
    boton.disabled = true;
    let bien = 0;
    let error = null;
    for (const tor of lista) {
      if (tor.publicado) { bien++; continue; }
      const r = await PareoPublicar.crear(tor, extraPublicar(tor));
      if (!r.ok) { error = r.error || tx("publicarSinRed"); break; }
      tor.publicado = { id: r.id, clave: r.clave, hora: Date.now() };
      if (tor === t() || tor.__id === estado.id) { estado.t.publicado = tor.publicado; guardar(); }
      else guardarDelEvento(tor);
      bien++;
    }
    boton.disabled = false;
    pintarPublicar();
    if (error) Avisos.avisar(error, { tipo: "error" });
    else Avisos.avisar(lista.length > 1 ? tx("publicadosVarios", { n: bien }) : tx("publicadoUno"));
    const x = $("pi-publicar-enlace"); if (x) x.focus();
  }

  // El anuncio: la hora, el contacto de la organización y las bases. Se
  // guarda al escribir y, si ya está publicado, se pone al día solo.
  function camposAnuncio(v) {
    const an = v.anuncio || {};
    const cambio = () => {
      v.anuncio = { hora: $("pi-anuncio-hora").value, contacto: $("pi-anuncio-contacto").value.trim().slice(0, 120), texto: $("pi-anuncio-texto").value.trim().slice(0, 1500) };
      guardar();
    };
    const campo = (id, etiqueta, control, ayuda) => el("div", {},
      el("label", { for: id, class: "block text-sm font-semibold mb-1", texto: etiqueta }), control,
      ayuda ? el("p", { class: C.nota + " mt-1", texto: ayuda }) : null);
    const hora = el("input", { id: "pi-anuncio-hora", type: "time", class: C.campoChico, value: an.hora || "" });
    const contacto = el("input", { id: "pi-anuncio-contacto", type: "text", maxlength: "120", autocomplete: "off", class: C.campo, value: an.contacto || "" });
    const texto = el("textarea", { id: "pi-anuncio-texto", rows: "4", maxlength: "1500", class: C.campo });
    texto.value = an.texto || "";
    for (const x of [hora, contacto, texto]) x.addEventListener("change", cambio);
    return el("fieldset", { class: "pi-revisar mt-3" },
      el("legend", { class: "pi-revisar-titulo px-1", texto: tx("anuncioTitulo") }),
      el("p", { class: C.nota + " mb-2", texto: v.fechaInicio ? tx("anuncioFecha", { f: window.HoraCR ? HoraCR.fecha(v.fechaInicio) : v.fechaInicio }) : tx("anuncioSinFecha") }),
      el("div", { class: "grid sm:grid-cols-2 gap-3" },
        campo("pi-anuncio-hora", tx("anuncioHora"), hora),
        campo("pi-anuncio-contacto", tx("anuncioContacto"), contacto, tx("anuncioContactoAyuda"))),
      el("div", { class: "mt-3" }, campo("pi-anuncio-texto", tx("anuncioTexto"), texto)));
  }

  // La inscripción previa: abrirla o cerrarla (con fecha límite) y leer lo
  // que llegó. Aceptar uno lo agrega a la lista de jugadores como cualquier
  // otro (agregarJugadores); rechazarlo solo lo marca.
  function cajaInscripcion(v) {
    const ins = v.inscripcion || {};
    const abierta = el("input", { type: "checkbox", id: "pi-insc-abierta", class: "mt-1", checked: !!ins.abierta });
    const hasta = el("input", { id: "pi-insc-hasta", type: "date", class: C.campoChico, value: ins.hasta || "" });
    const cambio = () => {
      v.inscripcion = { abierta: abierta.checked, hasta: hasta.value || "" };
      guardar();
      actualizarPublicado(estado.id);
      Avisos.avisar(tx(abierta.checked ? "inscAbierta" : "inscCerrada"));
    };
    abierta.addEventListener("change", cambio);
    hasta.addEventListener("change", cambio);
    const ver = el("button", { type: "button", id: "pi-insc-ver", class: C.botonSec, "aria-expanded": "false", "aria-controls": "pi-insc-lista" }, tx("inscVer"));
    const lista = el("div", { id: "pi-insc-lista", hidden: true });
    ver.addEventListener("click", () => {
      if (!lista.hidden) { lista.hidden = true; ver.setAttribute("aria-expanded", "false"); return; }
      cargarInscripciones(lista, ver);
    });
    return el("fieldset", { class: "pi-revisar mt-3" },
      el("legend", { class: "pi-revisar-titulo px-1", texto: tx("inscTitulo") }),
      el("p", { class: C.nota + " mb-2", texto: tx("inscAyuda") }),
      el("div", { class: "flex items-start gap-2 text-sm" }, abierta, el("label", { for: "pi-insc-abierta", texto: tx("inscAbrir") })),
      el("div", { class: "mt-2 flex flex-wrap items-center gap-2 text-sm" }, el("label", { for: "pi-insc-hasta", class: "font-semibold", texto: tx("inscHasta") }), hasta),
      el("div", { class: "mt-3" }, ver), lista);
  }
  async function cargarInscripciones(lista, ver) {
    const v = t();
    ver.disabled = true;
    const r = await PareoPublicar.inscripciones(v.publicado);
    ver.disabled = false;
    if (!r.ok) { Avisos.avisar(r.error || tx("publicarSinRed"), { tipo: "error" }); return; }
    pintarInscripciones(lista, r.inscripciones || []);
    lista.hidden = false;
    ver.setAttribute("aria-expanded", "true");
  }
  function pintarInscripciones(lista, todas) {
    const v = t();
    const pendientes = todas.filter((x) => x.estado === "pendiente");
    const marcar = async (cuales, estadoNuevo, boton) => {
      if (boton) boton.disabled = true;
      if (estadoNuevo === "aceptada") {
        agregarJugadores(cuales.map((x) => ({ nombre: x.nombre, institucion: x.institucion || "", categoria: x.categoria || "", elo: x.elo || 0, fideId: x.fide_id || "", titulo: "", fed: "" })));
      }
      const r = await PareoPublicar.marcar(v.publicado, cuales.map((x) => x.id), estadoNuevo);
      if (!r.ok) { if (boton) boton.disabled = false; Avisos.avisar(r.error || tx("publicarSinRed"), { tipo: "error" }); return; }
      for (const x of cuales) x.estado = estadoNuevo;
      pintarInscripciones(lista, todas);
      Avisos.avisar(tx(estadoNuevo === "aceptada" ? "inscAceptadas" : "inscRechazadas", { n: cuales.length }));
      const b = $("pi-insc-ver"); if (b) b.focus();
    };
    const resumen = el("p", { id: "pi-insc-resumen", class: "text-sm font-semibold mt-3", role: "status",
      texto: todas.length ? tx("inscResumen", { n: todas.length, p: pendientes.length }) : tx("inscNinguna") });
    const filas = todas.map((x) => {
      const yaEsta = v.jugadores.some((j) => (j.nombre || "").toUpperCase() === (x.nombre || "").toUpperCase());
      const acciones = x.estado === "pendiente"
        ? [el("button", { type: "button", class: C.mini, "data-aceptar": x.id, "aria-label": tx("inscAceptarA", { n: x.nombre }), onclick: (e) => marcar([x], "aceptada", e.currentTarget) }, tx("inscAceptar")),
           el("button", { type: "button", class: C.miniPeligro, "data-rechazar": x.id, "aria-label": tx("inscRechazarA", { n: x.nombre }), onclick: (e) => marcar([x], "rechazada", e.currentTarget) }, tx("inscRechazar"))]
        : [el("span", { class: "pi-sello " + (x.estado === "aceptada" ? "pi-sello-listo" : "pi-sello-falta"), texto: (x.estado === "aceptada" ? "✓ " : "✗ ") + tx(x.estado === "aceptada" ? "inscEstadoAceptada" : "inscEstadoRechazada") })];
      return el("li", { class: "pi-dm-tarjeta", "data-insc": x.id },
        el("p", { class: "font-semibold", texto: x.nombre + (yaEsta && x.estado === "pendiente" ? " · " + tx("inscYaEsta") : "") }),
        el("p", { class: "text-xs", texto: [x.institucion, x.categoria, x.elo ? "Elo " + x.elo : "", x.fide_id ? "FIDE " + x.fide_id : ""].filter(Boolean).join(" · ") }),
        el("p", { class: "text-xs mt-1", texto: tx("inscQuien", { r: x.responsable, c: x.contacto }) }),
        x.nota ? el("p", { class: "text-xs mt-1 italic", texto: x.nota }) : null,
        el("div", { class: "mt-2 flex flex-wrap gap-2" }, acciones));
    });
    const todasB = pendientes.length > 1 ? el("button", { type: "button", id: "pi-insc-todas", class: C.boton + " mt-2", onclick: (e) => marcar(pendientes, "aceptada", e.currentTarget) }, tx("inscAceptarTodas", { n: pendientes.length })) : null;
    lista.replaceChildren(resumen, todasB, el("ul", { class: "mt-2 grid lg:grid-cols-2 gap-2" }, filas));
  }

  // ---------- Tu organización ----------
  // El nombre y el logo de quien organiza, sin cuenta: se guardan en la base
  // (pareo_organizadores, por la función pareo-publicar) con una clave que
  // queda en este navegador, y cada torneo que se publica desde acá queda a
  // su nombre. Salen en la lista pública, en su página de organizador y en
  // los PDF. El sello «Organizador verificado» lo pone solo Ajedrez
  // Integral. Ver «Torneos en Pareo Integral: el organizador y la
  // moderación» en docs/decisiones/juegos-y-torneos.md.
  const CLAVE_ORG = "pareo_organizador_v1";
  function organizacion() {
    const o = leerJSON(CLAVE_ORG, null);
    return o && typeof o.id === "string" && typeof o.clave === "string" ? o : null;
  }
  // El código para usarla en otra computadora: el id y la clave juntos.
  const codigoOrg = (o) => "org:" + o.id + ":" + o.clave;
  const LOGO_MAX = 190000;
  async function logoDeArchivo(archivo) {
    if (!/^image\/(png|jpeg|webp)$/.test(archivo.type)) throw new Error(tx("orgLogoTipo"));
    // Primero a 400 px; si aún pesa, a 200.
    for (const lado of [400, 200]) {
      const datos = await window.ImagenAchicar.comoDatos(await window.ImagenAchicar.logo(archivo, lado));
      if (datos.length <= LOGO_MAX) return datos;
    }
    throw new Error(tx("orgLogoPesado"));
  }
  function pintarOrganizacion() {
    const caja = $("pi-organizacion");
    if (!caja) return;
    const o = organizacion();
    let logoNuevo; // undefined: no se tocó; null: quitarlo; texto: el nuevo
    const nombre = el("input", { id: "pi-org-nombre", type: "text", maxlength: "120", autocomplete: "organization", class: C.campo + " w-full", value: (o && o.nombre) || "" });
    const archivo = el("input", { id: "pi-org-logo", type: "file", accept: "image/png,image/jpeg,image/webp", class: "text-sm" });
    const vista = el("img", { id: "pi-org-vista", alt: "", class: "h-16 w-auto max-w-[10rem] object-contain rounded bg-white border border-brand-200" });
    const quitar = el("button", { type: "button", id: "pi-org-quitar-logo", class: C.mini }, tx("orgQuitarLogo"));
    const estadoOrg = el("p", { id: "pi-org-estado", class: "text-sm mt-2", role: "status" });
    const ponerVista = () => {
      const src = logoNuevo === undefined ? (o && o.logo) : logoNuevo;
      vista.hidden = !src; quitar.hidden = !src;
      if (src) vista.src = src; else vista.removeAttribute("src");
    };
    archivo.addEventListener("change", async () => {
      const f = archivo.files && archivo.files[0];
      if (!f) return;
      try { logoNuevo = await logoDeArchivo(f); ponerVista(); estadoOrg.textContent = tx("orgLogoListo"); }
      catch (e) { archivo.value = ""; Avisos.avisar(e.message, { tipo: "error" }); }
    });
    quitar.addEventListener("click", () => { logoNuevo = null; archivo.value = ""; ponerVista(); estadoOrg.textContent = tx("orgLogoQuitado"); });
    const guardarB = el("button", { type: "submit", id: "pi-org-guardar", class: C.boton }, tx(o ? "orgGuardar" : "orgCrear"));
    // El correo: opcional, nunca se muestra entero (lo que hay lo dice
    // #pi-org-correo-estado); escribir uno nuevo pide el consentimiento.
    const correo = el("input", { id: "pi-org-correo", type: "email", maxlength: "200", autocomplete: "email", class: C.campo + " w-full", "aria-describedby": "pi-org-correo-ayuda" });
    const permisoCorreo = el("input", { type: "checkbox", id: "pi-org-correo-permiso", class: "mt-1" });
    const form = el("form", { id: "pi-org-form", class: "grid gap-3 sm:max-w-lg", novalidate: true },
      el("label", { for: "pi-org-nombre", class: "text-sm font-semibold" }, tx("orgNombre"), nombre),
      el("div", {}, el("label", { for: "pi-org-logo", class: "block text-sm font-semibold mb-1" }, tx("orgLogo")),
        el("div", { class: "flex flex-wrap items-center gap-3" }, vista, archivo, quitar),
        el("p", { class: C.nota + " mt-1", texto: tx("orgLogoAyuda") })),
      el("div", {}, el("label", { for: "pi-org-correo", class: "block text-sm font-semibold mb-1" }, tx("orgCorreo")), correo,
        el("p", { id: "pi-org-correo-ayuda", class: C.nota + " mt-1", texto: tx("orgCorreoAyuda") }),
        el("p", { id: "pi-org-correo-estado", class: "text-sm mt-1", role: "status" }),
        el("div", { class: "flex items-start gap-2 text-sm mt-2" }, permisoCorreo,
          el("label", { for: "pi-org-correo-permiso" }, tx("orgCorreoPermiso") + " ",
            el("a", { href: "privacidad.html#torneos", target: "_blank", rel: "noopener", class: "underline underline-offset-2 hover:no-underline", texto: tx("politicaPrivacidad") }), "."))),
      el("div", {}, guardarB), estadoOrg);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const n = nombre.value.trim();
      if (n.length < 2) { Avisos.avisar(tx("orgFaltaNombre"), { tipo: "error" }); nombre.focus(); return; }
      guardarB.disabled = true;
      estadoOrg.textContent = tx("orgGuardando");
      const pedido = { nombre: n };
      if (o) Object.assign(pedido, { id: o.id, clave: o.clave });
      if (logoNuevo !== undefined) pedido.logo = logoNuevo;
      else if (!o) pedido.logo = null;
      const nuevoCorreo = correo.value.trim();
      if (nuevoCorreo) {
        if (!permisoCorreo.checked) { guardarB.disabled = false; estadoOrg.textContent = ""; Avisos.avisar(tx("orgCorreoFaltaPermiso"), { tipo: "error" }); permisoCorreo.focus(); return; }
        Object.assign(pedido, { correo: nuevoCorreo, consentimiento: true });
      }
      const r = await PareoPublicar.guardarOrganizador(pedido);
      guardarB.disabled = false;
      if (!r.ok) { estadoOrg.textContent = ""; Avisos.avisar(r.error || tx("publicarSinRed"), { tipo: "error" }); return; }
      if (r.correoPendiente === true) Avisos.avisar(tx("orgCorreoEnviado", { c: nuevoCorreo }));
      else if (r.correoPendiente === false) Avisos.avisar(tx("orgCorreoNoSalio"), { tipo: "error" });
      const nueva = { id: r.id, clave: o ? o.clave : r.clave, nombre: n, logo: logoNuevo === undefined ? (o && o.logo) || null : logoNuevo };
      escribir(CLAVE_ORG, JSON.stringify(nueva));
      // Los torneos ya publicados desde acá pasan a su nombre (y con su
      // nombre nuevo) en la próxima puesta al día, que se pide ya.
      for (const x of estado.lista) {
        const y = x.id === estado.id ? t() : leerJSON(PREFIJO + x.id, null);
        if (y && y.publicado) actualizarPublicado(x.id);
      }
      pintarOrganizacion();
      Avisos.avisar(tx(o ? "orgGuardada" : "orgCreada", { n }));
      const sig = $("pi-org-nombre"); if (sig) sig.focus();
    });
    caja.replaceChildren(
      el("h2", { class: "font-serif text-xl font-bold mb-1", texto: tx("orgTitulo") }),
      el("p", { class: C.nota + " mb-3", texto: tx("orgAyuda") }), form);
    ponerVista();
    if (o) {
      const pagina = new URL("torneos-pareo.html#o=" + encodeURIComponent(o.id), location.href).href;
      const copiar = el("button", { type: "button", id: "pi-org-copiar", class: C.botonSec }, tx("orgCopiarCodigo"));
      copiar.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(codigoOrg(o)); Avisos.avisar(tx("orgCodigoCopiado")); }
        catch (e) { await Avisos.formulario({ titulo: tx("orgCopiarCodigo"), texto: tx("orgCodigoAMano"), aceptar: tx("cerrar"), campos: [{ nombre: "codigo", etiqueta: tx("orgCodigo"), valor: codigoOrg(o) }] }); }
      });
      caja.append(el("div", { class: "mt-4 flex flex-wrap items-center gap-3" },
        el("a", { id: "pi-org-pagina", href: pagina, target: "_blank", rel: "noopener", class: "text-sm underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" }, tx("orgVerPagina")),
        copiar),
        el("p", { class: C.nota + " mt-1", texto: tx("orgCodigoAyuda") }),
        el("div", { id: "pi-org-sello", class: "mt-4" }));
      pintarEstadoOrganizacion(o);
    } else {
      const usar = el("button", { type: "button", id: "pi-org-usar", class: C.botonSec + " mt-4" }, tx("orgUsarCodigo"));
      usar.addEventListener("click", async () => {
        const res = await Avisos.formulario({ titulo: tx("orgUsarCodigo"), texto: tx("orgUsarCodigoTexto"), aceptar: tx("orgUsar"), cancelar: tx("cancelar"),
          campos: [{ nombre: "codigo", etiqueta: tx("orgCodigo"), valor: "", max: 200 }] });
        if (!res) return;
        const m = /^org:([0-9a-f-]{36}):([0-9a-f]{20,100})$/.exec(String(res.codigo || "").trim());
        if (!m) { Avisos.avisar(tx("orgCodigoMalo"), { tipo: "error" }); return; }
        escribir(CLAVE_ORG, JSON.stringify({ id: m[1], clave: m[2], nombre: "", logo: null }));
        pintarOrganizacion();
        Avisos.avisar(tx("orgCodigoUsado"));
      });
      const recuperar = el("button", { type: "button", id: "pi-org-recuperar", class: C.botonSec + " mt-4" }, tx("orgRecuperar"));
      recuperar.addEventListener("click", async () => {
        const res = await Avisos.formulario({ titulo: tx("orgRecuperar"), texto: tx("orgRecuperarTexto"), aceptar: tx("orgRecuperarMandar"), cancelar: tx("cancelar"),
          campos: [{ nombre: "correo", etiqueta: tx("orgCorreo"), valor: "", max: 200 }] });
        if (!res || !String(res.correo || "").trim()) return;
        recuperar.disabled = true;
        const r = await PareoPublicar.recuperarOrganizador(String(res.correo).trim());
        recuperar.disabled = false;
        if (!r.ok) { Avisos.avisar(r.error || tx("publicarSinRed"), { tipo: "error" }); return; }
        Avisos.avisar(tx("orgRecuperarEnviado"));
      });
      caja.append(el("div", { class: "flex flex-wrap gap-2" }, usar, recuperar));
    }
  }

  // Lo que la organización ve de sí misma (con su clave, de la función): su
  // correo tapado y si está confirmado, y el sello o cómo pedirlo.
  async function pintarEstadoOrganizacion(o) {
    const r = await PareoPublicar.estadoOrganizador(o);
    const caja = $("pi-org-sello"), correoEstado = $("pi-org-correo-estado");
    if (!caja || !r.ok) return;
    if (correoEstado) {
      correoEstado.replaceChildren();
      if (r.correo) {
        const quitarC = el("button", { type: "button", id: "pi-org-correo-quitar", class: C.mini + " ml-2" }, tx("orgCorreoQuitar"));
        quitarC.addEventListener("click", async () => {
          const n = ($("pi-org-nombre").value || o.nombre || "").trim();
          const q = await PareoPublicar.guardarOrganizador({ id: o.id, clave: o.clave, nombre: n.length >= 2 ? n : o.nombre, correo: "" });
          if (!q.ok) { Avisos.avisar(q.error || tx("publicarSinRed"), { tipo: "error" }); return; }
          Avisos.avisar(tx("orgCorreoQuitado"));
          pintarEstadoOrganizacion(o);
        });
        correoEstado.append(tx(r.correoConfirmado ? "orgCorreoConfirmado" : "orgCorreoPendiente", { c: r.correo }), quitarC);
      }
    }
    if (r.verificado) { caja.replaceChildren(el("p", { class: "text-sm font-semibold", texto: tx("orgSelloTiene") })); return; }
    if (r.selloPendiente) { caja.replaceChildren(el("p", { class: "text-sm", texto: tx("orgSelloPendiente") })); return; }
    const abrirB = el("button", { type: "button", id: "pi-org-sello-abrir", class: C.botonSec, "aria-expanded": "false", "aria-controls": "pi-org-sello-form" }, tx("orgSello"));
    const campo = (id, etiqueta, max, tipo) => el("label", { for: id, class: "text-sm font-semibold" }, etiqueta,
      tipo === "textarea"
        ? el("textarea", { id, maxlength: String(max), rows: "3", class: C.campo + " w-full font-normal" })
        : el("input", { id, maxlength: String(max), type: "text", class: C.campo + " w-full font-normal" }));
    const permiso = el("input", { type: "checkbox", id: "pi-org-sello-permiso", class: "mt-1" });
    const mandarB = el("button", { type: "submit", id: "pi-org-sello-mandar", class: C.boton }, tx("orgSelloMandar"));
    const form = el("form", { id: "pi-org-sello-form", class: "grid gap-3 sm:max-w-lg mt-3", novalidate: true, hidden: true },
      el("p", { class: C.nota, texto: tx("orgSelloAyuda") }),
      campo("pi-org-sello-quien", tx("orgSelloQuien"), 120), campo("pi-org-sello-representa", tx("orgSelloRepresenta"), 200),
      campo("pi-org-sello-contacto", tx("orgSelloContacto"), 160), campo("pi-org-sello-nota", tx("orgSelloNota"), 800, "textarea"),
      el("div", { class: "flex items-start gap-2 text-sm" }, permiso,
        el("label", { for: "pi-org-sello-permiso" }, tx("orgSelloPermiso") + " ",
          el("a", { href: "privacidad.html#torneos", target: "_blank", rel: "noopener", class: "underline underline-offset-2 hover:no-underline", texto: tx("politicaPrivacidad") }), ".")),
      el("div", {}, mandarB));
    abrirB.addEventListener("click", () => {
      const abierto = abrirB.getAttribute("aria-expanded") === "true";
      abrirB.setAttribute("aria-expanded", abierto ? "false" : "true");
      form.hidden = abierto;
      if (!abierto) $("pi-org-sello-quien").focus();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = (id) => $(id).value.trim();
      const datos = { quien: v("pi-org-sello-quien"), representa: v("pi-org-sello-representa"), contacto: v("pi-org-sello-contacto"), nota: v("pi-org-sello-nota") };
      if (datos.quien.length < 2 || datos.representa.length < 2 || datos.contacto.length < 5) { Avisos.avisar(tx("orgSelloFalta"), { tipo: "error" }); return; }
      if (!permiso.checked) { Avisos.avisar(tx("orgSelloFaltaPermiso"), { tipo: "error" }); permiso.focus(); return; }
      mandarB.disabled = true;
      const q = await PareoPublicar.pedirSello(o, datos);
      mandarB.disabled = false;
      if (!q.ok) { Avisos.avisar(q.error || tx("publicarSinRed"), { tipo: "error" }); return; }
      Avisos.avisar(tx("orgSelloEnviado"));
      caja.replaceChildren(el("p", { class: "text-sm", tabindex: "-1", id: "pi-org-sello-listo", texto: tx("orgSelloPendiente") }));
      $("pi-org-sello-listo").focus();
    });
    caja.replaceChildren(abrirB, form);
  }

  // Los enlaces de los correos: confirmar el correo de la organización
  // (#org-correo=<id>.<token>) y recuperarla en este navegador
  // (#org-recuperar=<id>.<token>, que deja una clave nueva).
  async function enlaceOrganizacion(hash) {
    const m = /^#org-(correo|recuperar)=([0-9a-f-]{36})\.([0-9a-f]{20,100})$/.exec(hash);
    history.replaceState(null, "", location.pathname + location.search);
    if (!m) return;
    if (m[1] === "correo") {
      const r = await PareoPublicar.confirmarCorreo(m[2], m[3]);
      if (!r.ok) { Avisos.avisar(r.error || tx("publicarSinRed"), { tipo: "error", duracion: 0 }); return; }
      Avisos.avisar(tx("orgCorreoConfirmadoAviso", { n: r.nombre || "" }));
    } else {
      const r = await PareoPublicar.recuperarConfirmar(m[2], m[3]);
      if (!r.ok) { Avisos.avisar(r.error || tx("publicarSinRed"), { tipo: "error", duracion: 0 }); return; }
      escribir(CLAVE_ORG, JSON.stringify({ id: r.id, clave: r.clave, nombre: r.nombre || "", logo: r.logo || null }));
      Avisos.avisar(tx("orgRecuperada", { n: r.nombre || "" }), { duracion: 0 });
    }
    irA("archivos");
    pintarOrganizacion();
  }

  function pintarPublicar() {
    const caja = $("pi-publicar");
    if (!caja) return;
    const v = t();
    caja.replaceChildren(
      el("h2", { class: "font-serif text-xl font-bold mb-1", texto: tx("publicarTitulo") }),
      el("p", { class: C.nota + " mb-3", texto: tx("publicarAyuda") }));
    if (v.publicado) {
      const url = PareoPublicar.enlace(v.publicado.id);
      caja.append(
        el("p", { class: "text-sm font-semibold", role: "status", texto: "✓ " + tx(v.jugadores.length ? "publicadoEstado" : "publicadoAnuncio", { h: v.publicado.hora ? horaCR(v.publicado.hora) : "—" }) }),
        el("p", { class: "text-sm mt-1 break-all" }, el("a", { id: "pi-publicar-enlace", href: url, target: "_blank", rel: "noopener", class: "underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto: url })),
        el("p", { class: C.nota + " mt-1", texto: tx("publicadoAyuda") }));
      const ahora = el("button", { type: "button", id: "pi-publicar-ahora", class: C.botonSec }, tx("publicarAhora"));
      ahora.addEventListener("click", () => actualizarPublicado(estado.id, ahora));
      const quitarB = el("button", { type: "button", id: "pi-publicar-quitar", class: C.miniPeligro + " px-3 py-2" }, tx("publicarQuitar"));
      quitarB.addEventListener("click", async () => {
        if (!(await Avisos.confirmar(tx("publicarQuitarConfirma"), { aceptar: tx("publicarQuitar"), peligro: true }))) return;
        quitarB.disabled = true;
        const r = await PareoPublicar.borrar(v.publicado);
        quitarB.disabled = false;
        if (!r.ok) { Avisos.avisar(r.error || tx("publicarSinRed"), { tipo: "error" }); return; }
        delete v.publicado;
        guardar(); pintarPublicar();
        Avisos.avisar(tx("publicarQuitado"));
        const b = $("pi-publicar-permiso"); if (b) b.focus();
      });
      // Un torneo que ya empezó se publica siempre: no se quita.
      caja.append(el("div", { class: "mt-3 flex flex-wrap gap-2" }, ahora, v.rondas.length ? null : quitarB));
      if (!v.rondas.length) caja.append(camposAnuncio(v));
      caja.append(cajaInscripcion(v));
      return;
    }
    // Ya empezó y todavía no se pudo publicar (sin internet): se vuelve a
    // intentar solo; «Publicar ahora» no espera.
    if (v.rondas.length) {
      const ya = el("button", { type: "button", id: "pi-publicar-reintentar", class: C.boton }, tx("publicarAhora"));
      ya.addEventListener("click", () => publicarSolo(estado.id, true));
      caja.append(el("p", { class: "text-sm font-semibold", role: "status", texto: tx("publicarSoloPendiente") }), el("div", { class: "mt-3" }, ya));
      return;
    }
    // Sin jugadores todavía: se publica como anuncio (con la fecha de la
    // ficha Torneo), y la inscripción previa se abre después de publicarlo.
    const anuncio = !v.jugadores.length;
    if (anuncio) caja.append(el("p", { class: "text-sm mb-1", texto: tx("anuncioAyuda") }), camposAnuncio(v));
    const permiso = el("input", { type: "checkbox", id: "pi-publicar-permiso", class: "mt-1" });
    caja.append(el("div", { class: "flex items-start gap-2 text-sm mt-3" }, permiso,
      el("label", { for: "pi-publicar-permiso" }, tx("publicarPermiso") + " ",
        el("a", { href: "privacidad.html#torneos", target: "_blank", rel: "noopener", class: "underline underline-offset-2 hover:no-underline", texto: tx("politicaPrivacidad") }), ".")));
    const sinPermiso = () => { if (permiso.checked) return false; Avisos.avisar(tx("publicarFaltaPermiso"), { tipo: "error" }); permiso.focus(); return true; };
    const uno = el("button", { type: "button", id: "pi-publicar-uno", class: C.boton }, tx(anuncio ? "publicarAnuncio" : "publicarUno"));
    uno.addEventListener("click", () => {
      if (sinPermiso()) return;
      if (anuncio && !t().fechaInicio) { Avisos.avisar(tx("anuncioSinFecha"), { tipo: "error" }); return; }
      if (anuncio) t().anuncio = t().anuncio || { hora: "", contacto: "", texto: "" };
      publicarTorneos([t()], uno);
    });
    const fila = el("div", { class: "mt-3 flex flex-wrap gap-2" }, uno);
    const delEvento = v.evento ? torneosDelEvento().filter((x) => x.jugadores.length) : [];
    if (delEvento.length > 1) {
      const todos = el("button", { type: "button", id: "pi-publicar-evento", class: C.botonSec }, tx("publicarEvento", { n: delEvento.length }));
      todos.addEventListener("click", () => { if (!sinPermiso()) publicarTorneos(torneosDelEvento().filter((x) => x.jugadores.length), todos); });
      fila.append(todos);
    }
    caja.append(fila);
  }

  // ---------- Los premios especiales ----------
  // Además del podio: por franja de Elo, por categoría, la mejor mujer y el
  // mejor sin Elo (js/pareo/premios.js). Nadie se lleva dos premios: el
  // podio primero y después cada premio en el orden en que está anotado.
  // Solo en individual (en equipos ya está el mejor de cada tablero).
  function pintarPremios(k) {
    const v = t();
    const caja = $("pi-premios");
    caja.replaceChildren();
    if (E.esDeEquipos(v) || !v.jugadores.length) return;
    const lista = (v.premiosEspeciales || []).map(PareoPremios.normalizar).filter(Boolean);
    const sec = el("section", { class: "mt-6", "aria-labelledby": "pi-premios-titulo" },
      el("h3", { id: "pi-premios-titulo", class: "font-serif text-lg font-bold mb-1", texto: tx("premiosTitulo") }),
      el("p", { class: C.nota + " mb-2", texto: tx("premiosAyuda") }));
    caja.append(sec);
    if (lista.length) {
      const filas = k ? V.aplicarDesempate(v, E.clasificacion(hasta(k), v.desempates)) : [];
      const reparto = PareoPremios.asignar(Object.assign({}, v, { premiosEspeciales: lista }), filas, jugador);
      if (k && k < V.totalRondas(v)) sec.append(el("p", { class: "text-sm font-semibold mb-2", texto: tx("premiosProvisional", { r: k, t: V.totalRondas(v) }) }));
      const ul = el("ul", { id: "pi-premios-lista", class: "space-y-2" });
      reparto.especiales.forEach((x, i) => {
        const ganan = !k ? tx("premiosSinRondas")
          : x.ganadores.length ? x.ganadores.map((g) => (x.premio.cuantos > 1 ? g.lugar + ". " : "") + nombreDe(g.id) + " (" + tx("puesto").toLowerCase() + " " + g.puesto + ", " + puntosTexto(g.puntos) + " " + tx("pts").toLowerCase() + ")").join(" · ")
          : x.candidatos ? tx("premiosYaPremiados") : tx("premiosNadie");
        ul.append(el("li", { class: "pi-revisar flex flex-wrap items-start justify-between gap-2", "data-premio": String(i) },
          el("div", {},
            el("p", { class: "font-semibold", texto: PareoPremios.etiqueta(x.premio, idioma) + (x.premio.cuantos > 1 ? " · " + tx("premiosCuantos", { n: x.premio.cuantos }) : "") }),
            el("p", { class: "text-sm", "data-ganadores": "", texto: ganan })),
          el("button", { type: "button", class: C.miniPeligro, "aria-label": tx("premiosQuitarA", { p: PareoPremios.etiqueta(x.premio, idioma) }), onclick: () => {
            v.premiosEspeciales = lista.filter((_, j) => j !== i); guardar(); pintarClasificacion();
            const b = $("pi-premio-tipo"); if (b) b.focus();
          } }, tx("quitar"))));
      });
      sec.append(ul);
    }
    // Agregar uno: el tipo y lo que pide cada tipo (desde/hasta, la categoría).
    const tipo = el("select", { id: "pi-premio-tipo", class: C.campoChico },
      el("option", { value: "elo", texto: tx("premioTipoElo") }), el("option", { value: "categoria", texto: tx("premioTipoCategoria") }),
      el("option", { value: "mujer", texto: tx("premioTipoMujer") }), el("option", { value: "sinElo", texto: tx("premioTipoSinElo") }));
    const desde = el("input", { id: "pi-premio-desde", type: "number", min: "0", max: "3500", step: "1", inputmode: "numeric", class: C.campoChico + " w-24" });
    const hastaElo = el("input", { id: "pi-premio-hasta", type: "number", min: "0", max: "3500", step: "1", inputmode: "numeric", class: C.campoChico + " w-24" });
    const cats = PareoPremios.categorias(v);
    const categoria = el("select", { id: "pi-premio-categoria", class: C.campoChico }, cats.map((c) => el("option", { value: c, texto: c })));
    const cuantos = el("select", { id: "pi-premio-cuantos", class: C.campoChico }, [1, 2, 3].map((n) => el("option", { value: String(n), texto: String(n) })));
    const campo = (id, texto, control) => el("label", { for: id, class: "flex flex-col text-sm" }, el("span", { class: "font-semibold", texto }), control);
    const cElo = el("div", { class: "flex flex-wrap gap-2" }, campo("pi-premio-desde", tx("premioDesde"), desde), campo("pi-premio-hasta", tx("premioHasta"), hastaElo));
    const cCat = cats.length ? campo("pi-premio-categoria", tx("premioTipoCategoria"), categoria) : el("p", { class: C.nota, texto: tx("premiosSinCategorias") });
    const mostrar = () => { cElo.hidden = tipo.value !== "elo"; cCat.hidden = tipo.value !== "categoria"; };
    tipo.addEventListener("change", mostrar);
    const agregar = el("button", { type: "button", id: "pi-premio-agregar", class: C.botonSec }, tx("premiosAgregar"));
    agregar.addEventListener("click", () => {
      const p = PareoPremios.normalizar({ tipo: tipo.value, desde: desde.value, hasta: hastaElo.value, valor: tipo.value === "categoria" && cats.length ? categoria.value : "", cuantos: cuantos.value });
      if (!p) { Avisos.avisar(tx(tipo.value === "elo" ? "premiosEloMal" : "premiosCategoriaMal"), { tipo: "error" }); return; }
      v.premiosEspeciales = lista.concat([p]);
      guardar(); pintarClasificacion();
      Avisos.avisar(tx("premiosAgregado", { p: PareoPremios.etiqueta(p, idioma) }));
      const b = $("pi-premio-tipo"); if (b) b.focus();
    });
    sec.append(el("div", { class: "mt-3 flex flex-wrap items-end gap-3" },
      campo("pi-premio-tipo", tx("premioTipo"), tipo), cElo, cCat, campo("pi-premio-cuantos", tx("premioCuantosCampo"), cuantos), agregar));
    mostrar();
  }

  // ---------- Compartir por WhatsApp ----------
  // El texto armado (js/pareo/compartir.js) en un cuadro para revisarlo,
  // con «Abrir WhatsApp» (wa.me: quien lo manda elige a quién) y «Copiar».
  // Si el torneo está en vivo, el mensaje lleva el enlace.
  function enlaceVivoActual() {
    const v = t();
    const base = location.origin + location.pathname;
    if (estado.eventoVivo && v.evento && v.evento.id === estado.eventoVivo.id) return base + "#evento=" + estado.eventoVivo.codigo;
    if (estado.enVivo && v.liveCodigo) return base + "#vivo=" + v.liveCodigo;
    return "";
  }
  function abrirCompartir(caja, boton, texto) {
    const abierto = !caja.hidden && caja.dataset.para === boton.id;
    caja.replaceChildren();
    for (const b of document.querySelectorAll("[aria-controls='" + caja.id + "']")) b.setAttribute("aria-expanded", "false");
    if (abierto) { caja.hidden = true; return; }
    caja.dataset.para = boton.id;
    const area = el("textarea", { id: caja.id + "-texto", class: C.campo + " font-mono text-xs", rows: "10", readonly: true });
    area.value = texto;
    const copiar = el("button", { type: "button", class: C.botonSec }, tx("whatsappCopiar"));
    copiar.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(texto); Avisos.avisar(tx("whatsappCopiado")); }
      catch (e) { area.focus(); area.select(); Avisos.avisar(tx("whatsappSeleccionado"), { tipo: "info" }); }
    });
    caja.append(el("div", { class: "pi-revisar mb-4" },
      el("label", { for: area.id, class: "block text-sm font-semibold mb-1", texto: tx("whatsappTexto") }), area,
      el("div", { class: "mt-2 flex flex-wrap gap-2" },
        el("a", { href: PareoCompartir.enlaceWhatsapp(texto), target: "_blank", rel: "noopener", class: C.boton, "data-whatsapp": "" }, tx("whatsappAbrir")),
        copiar)));
    caja.hidden = false;
    boton.setAttribute("aria-expanded", "true");
    area.focus();
  }

  // ---------- La clasificación para la pared (A3) ----------
  // Una hoja A3 con letra grande, para pegarla después de cada ronda: el
  // puesto, el nombre, el centro, los puntos y los dos primeros desempates,
  // con la ronda y la hora en que se imprimió (una hoja vieja en la pared
  // engaña: la hora lo dice). @page pared en css/styles.css.
  function imprimirClasificacionPared() {
    const v = t();
    const k = rondasCompletas();
    if (!k) { Avisos.avisar(tx("paredSinRondas"), { tipo: "error" }); return; }
    const filas = V.aplicarDesempate(v, E.clasificacion(hasta(k), v.desempates));
    const des = (v.desempates || []).slice(0, 2);
    const hoja = el("div", { class: "pi-pared" },
      el("h1", { class: "pi-pared-titulo", texto: v.grupo || v.nombre || tx("fClasificacion") }),
      el("p", { class: "pi-pared-sub", texto: tx("clasificacionTras", { r: k }) + (k < V.totalRondas(v) ? " · " + tx("paredDe", { t: V.totalRondas(v) }) : "") }),
      el("p", { class: "pi-pared-hora", texto: tx("paredImpresa", { h: horaCR(Date.now()), f: window.HoraCR ? HoraCR.fecha(Date.now()) : new Date().toLocaleDateString("es-CR", { timeZone: "America/Costa_Rica" }) }) }),
      el("table", { class: "pi-pared-tabla" },
        el("thead", {}, el("tr", {},
          el("th", { class: "num", scope: "col", texto: tx("puesto") }), el("th", { scope: "col", texto: tx("nombre") }),
          el("th", { scope: "col", texto: E.esDeEquipos(v) ? tx("equipo") : tx("institucion") }), el("th", { class: "num", scope: "col", texto: tx("pts") }),
          des.map((c) => el("th", { class: "num", scope: "col", texto: c })))),
        el("tbody", {}, filas.map((f) => {
          const j = jugador(f.id) || {};
          return el("tr", {},
            el("td", { class: "num", texto: f.puesto }), el("td", { class: "pi-pared-nombre", texto: j.nombre || "?" }),
            el("td", { texto: E.esDeEquipos(v) ? "" : (j.institucion || "") }), el("td", { class: "num pi-pared-pts", texto: puntosTexto(f.puntos) }),
            des.map((c) => el("td", { class: "num", texto: valorDesempate(c, f.valores[c]) })));
        }))));
    $("pi-plantilla").replaceChildren(hoja);
    imprimirCon("pi-imprimiendo-pared");
  }

  // El Elo que gana o pierde cada uno: solo en individual y si alguien tiene Elo.
  const conElo = (v) => !E.esDeEquipos(v) && v.jugadores.some((j) => Number(j.elo) > 0);
  const celdasElo = (x) => (x && x.partidas
    ? [["rp", String(x.rp)], ["k", String(x.k)], ["cambio", PareoElo.textoCambio(x.cambio, idioma)]]
    : [["rp", ""], ["k", x && x.k ? String(x.k) : ""], ["cambio", ""]]);

  // El desempate por tableros es un número armado (E.codificarTableros): se
  // escribe tablero por tablero.
  const valorDesempate = (c, x) => (c === "TB" ? E.textoTableros(x, t().tableros) : formatoNum(x));

  // ---------- Tabla cruzada ----------
  // Cada casilla la escribe V.celdaCruzada (la misma del informe oficial).
  const letraCruzada = () => (idioma === "en" ? { w: "w", b: "b", bye: tx("cBye") } : { w: "b", b: "n", bye: tx("cBye") });
  function pintarCruzada() {
    const v = t();
    pintarSelectInstitucion($("pi-cruzada-institucion"));
    const tabla = $("pi-tabla-cruzada");
    tabla.replaceChildren();
    if (!v.jugadores.length) return;
    const k = rondasCompletas();
    const todasFilas = E.clasificacion(hasta(k), v.desempates);
    const filas = filasFiltradas(todasFilas);
    const num = T.numeros(v);
    const R = v.rondas.length;
    tabla.append(el("thead", {}, el("tr", {},
      el("th", { class: "num", scope: "col", texto: tx("puesto") }), el("th", { class: "num", scope: "col", texto: tx("nro") }),
      el("th", { scope: "col", texto: tx("nombre") }), el("th", { class: "num", scope: "col", texto: "Elo" }),
      Array.from({ length: R }, (_, r) => el("th", { class: "text-center", scope: "col", texto: tx("rCorta", { r: r + 1 }) })),
      el("th", { class: "num", scope: "col", texto: tx("pts") }))));
    const cuerpo = el("tbody");
    const letra = letraCruzada();
    for (const f of filas) {
      const j = jugador(f.id);
      const celdas = [];
      for (let r = 0; r < R; r++) celdas.push(el("td", { class: "text-center whitespace-nowrap", texto: V.celdaCruzada(v, r, f.id, num, letra, false) }));
      cuerpo.append(el("tr", {},
        el("td", { class: "num", texto: f.puesto }), el("td", { class: "num", texto: num.get(f.id) }),
        el("td", { class: "font-semibold", texto: j.nombre }), el("td", { class: "num", texto: Number(j.elo) > 0 ? j.elo : "" }),
        celdas, el("td", { class: "num font-bold", texto: puntosTexto(T.puntos(v, f.id)) })));
    }
    tabla.append(cuerpo);
  }

  // El subtítulo del PDF: nombre del torneo, la institución si hay una
  // elegida, y quién lo hizo.
  function subtituloPDF() {
    return [t().nombre, estado.filtroInstitucion, "Pareo Integral"].filter(Boolean).join(" · ");
  }

  function datosClasificacionPDF() {
    const v = t();
    const k = rondasCompletas();
    const todasFilas = E.clasificacion(hasta(k), v.desempates);
    const filas = filasFiltradas(todasFilas);
    const num = T.numeros(v);
    const elos = conElo(v) ? PareoElo.calcular(v, k) : null;
    const encabezados = [tx("puesto"), tx("nro"), tx("nombre"), tx("institucion"), tx("fed"), "Elo", tx("pts")]
      .concat(v.desempates, elos ? ["Rp", "K", "+/-Elo"] : []);
    const anchos = [1, 1, 3, 2.2, 1, 1, 1].concat(v.desempates.map(() => 1), elos ? [1, 0.7, 1] : []);
    const filasTabla = filas.map((f) => {
      const j = jugador(f.id);
      return [String(f.puesto), String(num.get(f.id)), j.nombre + (j.titulo ? " (" + j.titulo + ")" : ""),
        j.institucion || "", j.fed || "", Number(j.elo) > 0 ? String(j.elo) : "", puntosTexto(f.puntos)]
        .concat(v.desempates.map((c) => valorDesempate(c, f.valores[c])), elos ? celdasElo(elos.get(f.id)).map((c) => c[1]) : []);
    });
    const notas = v.desempates.map((c) => {
      const info = E.catalogo(v).find((x) => x.codigo === c);
      return info ? c + ": " + info[idioma] : c;
    }).concat(elos ? ["Rp: " + tx("eloRp"), "K: " + tx("eloK"), "+/-Elo: " + tx("eloCambio"), tx("eloNota")] : []);
    return {
      titulo: k ? tx("clasificacionTras", { r: k }) : tx("fClasificacion"),
      subtitulo: subtituloPDF(), encabezados, anchos, filas: filasTabla, notas,
    };
  }

  // Igual que pintarCruzada, pero en caracteres sencillos: el PDF escribe
  // Latin-1/WinAnsi a mano (js/reporte-pdf.js) y un signo menos de verdad
  // («−», U+2212) no está en esa tabla y se perdería sin avisar. Un guion
  // común sí.
  function datosCruzadaPDF() {
    const v = t();
    const k = rondasCompletas();
    const todasFilas = E.clasificacion(hasta(k), v.desempates);
    const filas = filasFiltradas(todasFilas);
    const num = T.numeros(v);
    const R = v.rondas.length;
    const letra = letraCruzada();
    const encabezados = [tx("puesto"), tx("nro"), tx("nombre"), "Elo"]
      .concat(Array.from({ length: R }, (_, r) => tx("rCorta", { r: r + 1 }))).concat([tx("pts")]);
    const anchos = [1, 1, 3, 1].concat(Array.from({ length: R }, () => 1)).concat([1]);
    const filasTabla = filas.map((f) => {
      const j = jugador(f.id);
      const celdas = [];
      for (let r = 0; r < R; r++) celdas.push(V.celdaCruzada(v, r, f.id, num, letra, true));
      return [String(f.puesto), String(num.get(f.id)), j.nombre, Number(j.elo) > 0 ? String(j.elo) : ""]
        .concat(celdas).concat([puntosTexto(T.puntos(v, f.id))]);
    });
    return { titulo: tx("fCruzada"), subtitulo: subtituloPDF(), encabezados, anchos, filas: filasTabla, notas: [tx("cruzadaAyuda")] };
  }

  async function bajarPDF(boton, datosFn, sufijo) {
    const v = t();
    if (!v.jugadores.length) { Avisos.avisar(tx("sinNadaQueExportar"), { tipo: "error" }); return; }
    boton.disabled = true;
    const original = boton.textContent;
    boton.textContent = tx("generandoPdf");
    try {
      const doc = await conOrganizacion(window.PareoPDF.documento(datosFn()));
      bajarBlob(await window.PareoPDF.generar(doc), window.PareoPDF.nombreArchivo(v.nombre, sufijo));
    } catch (e) {
      Avisos.avisar(tx("errorPdf", { e: e.message }), { tipo: "error" });
    } finally {
      boton.disabled = false;
      boton.textContent = original;
    }
  }

  // ---------- Archivos, comprobador y generador ----------
  function trfDelTorneo() {
    const k = rondasCompletas();
    if (k < t().rondas.length) Avisos.avisar(tx("trfSoloCompletas", { r: k }), { tipo: "info" });
    return T.aTrf(t(), { hasta: k });
  }

  function abrirTexto(nombre, texto) {
    let nuevo;
    if (/\.json$/i.test(nombre) || /^\s*\{/.test(texto)) {
      const datos = JSON.parse(texto);
      if (datos && datos.formato === V.FORMATO_RESPALDO) {
        if (!V.esRespaldo(datos)) throw new Error(tx("jsonNoEs"));
        abrirRespaldo(datos).catch((e) => Avisos.avisar(tx("noAbre", { e: e.message }), { tipo: "error" }));
        return;
      }
      if (!datos || datos.formato !== 1 || !Array.isArray(datos.jugadores) || !Array.isArray(datos.rondas)) throw new Error(tx("jsonNoEs"));
      nuevo = T.nuevo(datos);
    } else {
      nuevo = T.deTrf(texto);
      if (!nuevo.jugadores.length) throw new Error(tx("trfSinJugadores"));
    }
    crear(nuevo);
    pintarTodo();
    Avisos.avisar(tx("abierto", { n: nuevo.nombre || tx("sinNombre") }));
  }

  // ---------- Las firmas del acta ----------
  // Se guardan en el evento de cada torneo (todos llevan su copia).
  function guardarFirmas(idEvento, firmas) {
    for (const tor of torneosDelEvento(idEvento)) { tor.evento.firmas = firmas; guardarDelEvento(tor); }
    if (t().evento && t().evento.id === idEvento) { t().evento.firmas = firmas; guardar(); }
  }
  // Una firma válida (de esta pantalla o de un celular).
  function firmaValida(f) {
    return !!f && Object.prototype.hasOwnProperty.call(V.CARGOS_FIRMA, f.cargo) && typeof f.nombre === "string" && f.nombre.trim() &&
      typeof f.jpeg === "string" && f.jpeg.length < 300000 && /^[A-Za-z0-9+/=]+$/.test(f.jpeg) &&
      Number.isInteger(f.ancho) && Number.isInteger(f.alto) && f.ancho > 0 && f.alto > 0 && f.ancho <= 2000 && f.alto <= 2000;
  }
  const limpiaFirma = (f) => ({ cargo: f.cargo, nombre: f.nombre.trim().slice(0, 80), jpeg: f.jpeg, ancho: f.ancho, alto: f.alto, hora: Date.now() });
  // El diálogo para firmar en esta pantalla: quién firma, como qué, y el
  // recuadro para la firma (PareoVer.padFirma).
  function pedirFirma() {
    return new Promise((listo) => {
      const pad = PareoVer.padFirma(tx);
      const cargo = el("select", { id: "pi-firma-cargo", class: C.campo }, Object.entries(V.CARGOS_FIRMA).map(([k, x]) => el("option", { value: k, texto: x })));
      const nombre = el("input", { id: "pi-firma-nombre", type: "text", maxlength: "80", autocomplete: "off", class: C.campo });
      const error = el("p", { class: "text-sm text-red-700 dark:text-red-300 mt-2", role: "alert" });
      const guardarB = el("button", { type: "button", id: "pi-firma-guardar", class: C.boton }, tx("firmaGuardar"));
      const cancelarB = el("button", { type: "button", class: C.botonSec }, tx("cancelar"));
      const d = el("dialog", { id: "pi-firma-dialogo", class: "rounded-2xl p-5 max-w-lg w-full bg-white dark:bg-brand-900 text-brand-800 dark:text-white", "aria-labelledby": "pi-firma-dialogo-t" },
        el("h2", { id: "pi-firma-dialogo-t", class: "font-serif text-xl font-bold mb-3", texto: tx("firmarAqui") }),
        el("label", { for: "pi-firma-cargo", class: "block text-sm font-semibold mb-1", texto: tx("firmaCargo") }), cargo,
        el("label", { for: "pi-firma-nombre", class: "block text-sm font-semibold mb-1 mt-3", texto: tx("firmaNombre") }), nombre,
        el("p", { class: "block text-sm font-semibold mb-1 mt-3", texto: tx("firmaRecuadro") }), pad.nodo, error,
        el("div", { class: "flex flex-wrap gap-2 mt-4" }, guardarB, cancelarB));
      const cerrar = (x) => { d.close(); d.remove(); listo(x); };
      cancelarB.addEventListener("click", () => cerrar(null));
      d.addEventListener("cancel", (e) => { e.preventDefault(); cerrar(null); });
      guardarB.addEventListener("click", () => {
        if (!nombre.value.trim()) { error.textContent = tx("firmaFaltaNombre"); nombre.focus(); return; }
        if (pad.vacio()) { error.textContent = tx("firmaFaltaFirma"); return; }
        cerrar(limpiaFirma(Object.assign({ cargo: cargo.value, nombre: nombre.value }, pad.imagen())));
      });
      document.body.append(d);
      d.showModal();
      nombre.focus();
    });
  }
  // Firmar desde un celular: el mismo patrón que pasar el evento (un canal
  // con un código nuevo); lo que llega se pregunta antes de ir al acta.
  async function prenderFirmaCelular(ev) {
    try { await PareoVer.cargarSupabase(); }
    catch (e) { Avisos.avisar(tx("errorEnVivo", { e: e.message }), { tipo: "error" }); return; }
    const codigo = nuevoCodigoVivo();
    const canal = window.sb.channel("pareo-firma-" + codigo);
    estado.firmaCelular = { id: ev.id, codigo, canal };
    const contestar = (evento, payload) => canal.send({ type: "broadcast", event: evento, payload: payload || {} });
    canal.on("broadcast", { event: "pedir" }, () => contestar("estado", { evento: ev.nombre || "", cargos: V.CARGOS_FIRMA }));
    canal.on("broadcast", { event: "firma" }, async (msg) => {
      const f = msg.payload || {};
      if (!firmaValida(f)) { contestar("negada"); return; }
      const ok = await Avisos.confirmar(tx("firmaLlego", { n: f.nombre.trim().slice(0, 80), c: V.CARGOS_FIRMA[f.cargo] }), { aceptar: tx("firmaAgregar") });
      if (!ok) { contestar("negada"); return; }
      guardarFirmas(ev.id, (t().evento.firmas || []).concat(limpiaFirma(f)));
      contestar("recibida");
      if (estado.ficha === "archivos") pintarEvento();
      Avisos.avisar(tx("firmaGuardada", { n: f.nombre.trim().slice(0, 80) }));
    });
    canal.subscribe();
  }
  async function mostrarFirmaCelular(cont) {
    const url = location.origin + location.pathname + "#firma=" + estado.firmaCelular.codigo;
    try { await PareoQr.cargar(); } catch (e) { Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" }); return; }
    cont.replaceChildren(el("div", { class: "flex flex-wrap items-start gap-4" },
      el("div", { class: "w-32 bg-white p-2 rounded-lg" }, PareoQr.svg(url, tx("qrEtiqueta"))),
      el("div", { class: "text-sm" }, el("p", { id: "pi-firma-url", class: "break-all font-mono", texto: url }),
        el("p", { class: C.nota + " mt-1", texto: tx("firmarCelularAyuda") }))));
  }

  // ---------- Pasar el evento a otra computadora ----------
  // Un código nuevo cada vez y un canal de Supabase Realtime en modo
  // Broadcast (pareo-pasar-<código>). La otra computadora abre
  // pareo.html#recibir=<código> y pide; esta pregunta antes de mandar (el
  // evento trae datos de estudiantes) y lo manda comprimido, en partes.
  const PARTE = 60000;
  async function prenderPasar(ev) {
    try { await PareoVer.cargarSupabase(); }
    catch (e) { Avisos.avisar(tx("errorEnVivo", { e: e.message }), { tipo: "error" }); return; }
    const codigo = nuevoCodigoVivo();
    const canal = window.sb.channel("pareo-pasar-" + codigo);
    estado.pasar = { id: ev.id, codigo, canal, ocupado: false };
    canal.on("broadcast", { event: "pedir" }, async () => {
      const x = estado.pasar;
      if (!x || x.canal !== canal || x.ocupado) return;
      x.ocupado = true;
      try {
        const ok = await Avisos.confirmar(tx("pasarConfirmar", { e: ev.nombre || "" }), { aceptar: tx("pasarMandar") });
        if (!ok) { canal.send({ type: "broadcast", event: "negado", payload: {} }); return; }
        const texto = await PareoVer.empaquetar(V.respaldo(ev, torneosDelEvento(ev.id)));
        const n = Math.ceil(texto.length / PARTE);
        for (let i = 0; i < n; i++) await canal.send({ type: "broadcast", event: "parte", payload: { i, n, d: texto.slice(i * PARTE, (i + 1) * PARTE) } });
        Avisos.avisar(tx("pasarMandado"));
      } finally { x.ocupado = false; }
    });
    canal.subscribe();
  }
  function apagarPasar() {
    if (estado.pasar) { estado.pasar.canal.unsubscribe(); estado.pasar = null; }
  }
  async function mostrarPasar(cont) {
    const url = location.origin + location.pathname + "#recibir=" + estado.pasar.codigo;
    try { await PareoQr.cargar(); } catch (e) { Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" }); return; }
    cont.replaceChildren(el("div", { class: "flex flex-wrap items-start gap-4" },
      el("div", { class: "w-32 bg-white p-2 rounded-lg" }, PareoQr.svg(url, tx("qrEtiqueta"))),
      el("div", { class: "text-sm" }, el("p", { id: "pi-pasar-url", class: "break-all font-mono", texto: url }),
        el("p", { class: C.nota + " mt-1", texto: tx("pasarAyuda") }))));
  }
  // La que recibe: pide, junta las partes y lo abre como un respaldo.
  async function recibirEvento(codigo) {
    history.replaceState(null, "", location.pathname + location.search);
    try { await PareoVer.cargarSupabase(); }
    catch (e) { Avisos.avisar(tx("errorEnVivo", { e: e.message }), { tipo: "error" }); return; }
    const canal = window.sb.channel("pareo-pasar-" + String(codigo).replace(/[^a-z0-9]/g, ""));
    const partes = [];
    let listo = false;
    Avisos.avisar(tx("pasarEsperando"), { tipo: "info" });
    canal.on("broadcast", { event: "negado" }, () => { Avisos.avisar(tx("pasarNegado"), { tipo: "error" }); canal.unsubscribe(); });
    canal.on("broadcast", { event: "parte" }, async (msg) => {
      const p = msg.payload || {};
      if (listo || !Number.isInteger(p.i) || !Number.isInteger(p.n) || p.n < 1 || p.n > 200 || typeof p.d !== "string") return;
      partes[p.i] = p.d;
      if (partes.filter((x) => typeof x === "string").length < p.n) return;
      listo = true;
      canal.unsubscribe();
      try {
        const datos = await PareoVer.desempaquetar(partes.slice(0, p.n).join(""));
        if (!V.esRespaldo(datos)) throw new Error(tx("jsonNoEs"));
        await abrirRespaldo(datos);
      } catch (e) { Avisos.avisar(tx("noAbre", { e: e.message }), { tipo: "error" }); }
    });
    canal.subscribe((st) => { if (st === "SUBSCRIBED") canal.send({ type: "broadcast", event: "pedir", payload: {} }); });
  }

  // El respaldo de un evento: todos sus torneos de una vez. Si en este
  // navegador ya están (el mismo evento), se pregunta antes de reemplazarlos.
  async function abrirRespaldo(datos) {
    // Repetidos: del mismo evento Y con el mismo nombre que uno del archivo.
    // (Un archivo de torneos archivados trae solo algunos del evento: los que
    // siguen en este navegador no se tocan.)
    const nombres = new Set(datos.torneos.map((x) => x.nombre || ""));
    const ya = estado.lista.filter((x) => { const y = leerJSON(PREFIJO + x.id, null); return y && y.evento && y.evento.id === datos.evento.id && nombres.has(y.nombre || ""); });
    if (ya.length) {
      const ok = await Avisos.confirmar(tx("respaldoReemplazar", { n: ya.length }), { aceptar: tx("respaldoReemplazarSi"), peligro: true });
      if (!ok) return;
      for (const x of ya) quitar(PREFIJO + x.id);
      estado.lista = estado.lista.filter((x) => !ya.includes(x));
    }
    const ids = [];
    for (const x of datos.torneos) { crear(T.nuevo(x)); ids.push(estado.id); }
    const ahora = Date.now();
    ids.forEach((id, i) => { const x = estado.lista.find((y) => y.id === id); if (x) x.actualizado = ahora - i; });
    escribir(CLAVE_LISTA, JSON.stringify(estado.lista));
    abrir(ids[0]);
    pintarTodo();
    Avisos.avisar(tx("respaldoAbierto", { n: ids.length, e: datos.evento.nombre || "" }));
  }

  async function comprobarTexto(texto) {
    const caja = $("pi-fpc-resultado");
    caja.replaceChildren(el("p", { class: C.nota, texto: tx("comprobando") }));
    try {
      const r = await motor.comprobar(texto);
      const rondas = (r.salida.match(/: Round #\d+/g) || []).length;
      caja.replaceChildren(el("p", { class: "font-semibold " + (r.correcto ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-300"),
        texto: r.correcto ? tx("fpcBien", { r: rondas }) : tx("fpcMal") }));
      if (!r.correcto) caja.append(el("pre", { class: "mt-2 text-xs overflow-x-auto rounded-lg bg-brand-50 dark:bg-brand-950 p-3", texto: r.salida.trim() }));
    } catch (e) {
      caja.replaceChildren(el("p", { class: "font-semibold text-red-700 dark:text-red-300", texto: tx("fpcNoLee", { e: e.message }) }));
    }
  }

  function leerArchivo(input, hacer) {
    const f = input.files && input.files[0];
    input.value = "";
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { Avisos.avisar(tx("archivoGrande"), { tipo: "error" }); return; }
    f.text().then((texto) => hacer(f.name, texto)).catch((e) => Avisos.avisar(tx("noAbre", { e: e.message }), { tipo: "error" }));
  }

  // ---------- Arranque ----------
  function enganchar() {
    $("pi-idioma").addEventListener("click", () => {
      idioma = idioma === "es" ? "en" : "es";
      escribir(CLAVE_IDIOMA, idioma);
      pintarTodo();
    });
    $("pi-evento-filtro").addEventListener("change", (e) => cambiarFiltroEvento(e.target.value));
    $("pi-lista").addEventListener("change", (e) => { if (abrir(e.target.value)) { $("pi-otra-pestana").hidden = true; pintarTodo(); avisarPestanas(); } });
    $("pi-nuevo").addEventListener("click", () => {
      crear();
      estado.ficha = "torneo";
      pintarTodo();
      $("pi-form-torneo").elements.nombre.focus();
    });
    const fichas = $("pi-fichas");
    fichas.addEventListener("click", (e) => { const b = e.target.closest("[data-ficha]"); if (b) irA(b.dataset.ficha); });
    fichas.addEventListener("keydown", (e) => {
      const i = FICHAS.indexOf(estado.ficha);
      const k = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: FICHAS.length - 1 - i }[e.key];
      if (k == null) return;
      e.preventDefault();
      irA(FICHAS[(i + k + FICHAS.length) % FICHAS.length], true);
    });

    // «Solo lo de los JDE»: esconde el comprobador, el generador y los créditos.
    const modoJde = $("pi-modo-jde");
    modoJde.checked = leer(CLAVE_MODO_JDE) === "1";
    document.body.classList.toggle("pi-modo-jde", modoJde.checked);
    modoJde.addEventListener("change", () => { escribir(CLAVE_MODO_JDE, modoJde.checked ? "1" : "0"); document.body.classList.toggle("pi-modo-jde", modoJde.checked); });
    const sonido = $("pi-sonido-ronda");
    sonido.checked = leer(CLAVE_SONIDO) === "1";
    sonido.addEventListener("change", () => { escribir(CLAVE_SONIDO, sonido.checked ? "1" : "0"); if (sonido.checked) sonar(); });
    $("pi-form-torneo").addEventListener("change", alCambiarTorneo);
    $("pi-config-jde-aplicar").addEventListener("click", aplicarConfigJde);
    $("pi-form-torneo").addEventListener("submit", (e) => e.preventDefault());
    $("pi-desempate-agregar").addEventListener("click", () => {
      const c = $("pi-desempate-nuevo").value;
      if (!c || configFija(t())) return;
      t().desempates.push(c);
      guardar();
      pintarDesempates();
      $("pi-desempate-nuevo").focus();
    });

    $("pi-form-torneo").addEventListener("input", alEscribirTorneo);
    $("pi-form-jugador").addEventListener("input", guardarBorrador);
    $("pi-pegar").addEventListener("input", guardarBorrador);
    window.addEventListener("pagehide", guardarAlSalir);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") guardarAlSalir(); });
    $("pi-form-jugador").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      const d = datosJugador(Object.fromEntries(new FormData(f)));
      if (!d.nombre) { Avisos.avisar(tx("faltaNombre"), { tipo: "error" }); f.elements.nombre.focus(); return; }
      agregarJugadores([d]);
      f.reset();
      guardarBorrador();
      f.elements.nombre.focus();
    });
    $("pi-pegar-agregar").addEventListener("click", () => {
      const lineas = $("pi-pegar").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const lista = lineas.map((l) => {
        const [nombre, institucion, elo, titulo, fed, fideId, categoria] = l.split(/\t|;/).map((x) => x.trim());
        return datosJugador({ nombre, institucion, elo, titulo, fed, fideId, categoria });
      });
      const n = agregarJugadores(lista);
      if (n) { $("pi-pegar").value = ""; guardarBorrador(); Avisos.avisar(tx("agregados", { n })); }
      else Avisos.avisar(tx("nadaQueAgregar"), { tipo: "error" });
    });
    $("pi-ir-subir-lista").addEventListener("click", () => {
      irA("torneo");
      $("pi-caja-subir-lista").scrollIntoView({ block: "nearest" });
      $("pi-subir-lista").focus();
    });
    $("pi-subir-lista").addEventListener("change", (e) => {
      const fs = Array.from(e.target.files || []);
      e.target.value = "";
      if (fs.length) subirLista(fs);
    });
    $("pi-elo-nacional").addEventListener("click", buscarEloNacional);
    $("pi-buscar-jugador").addEventListener("input", (e) => { estado.filtroJugador = e.target.value; pintarJugadores(); });
    $("pi-ver-copiar").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText($("pi-ver-direccion").textContent); Avisos.avisar(tx("enlaceCopiado")); }
      catch (e) { Avisos.avisar(tx("noCopia"), { tipo: "error" }); }
    });
    $("pi-ver-en-vivo").addEventListener("change", async (e) => {
      if (e.target.checked) { if (!(await activarEnVivo())) return; } else desactivarEnVivo();
      if (estado.ronda != null) compartirLectura(estado.ronda);
    });
    $("pi-ver-en-vivo-nuevo-codigo").addEventListener("click", async () => {
      desactivarEnVivo();
      t().liveCodigo = nuevoCodigoVivo();
      guardar();
      $("pi-ver-en-vivo").checked = true;
      if (await activarEnVivo() && estado.ronda != null) compartirLectura(estado.ronda);
    });
    $("pi-clas-institucion").addEventListener("change", (e) => { estado.filtroInstitucion = e.target.value; pintarClasificacion(); });
    $("pi-cruzada-institucion").addEventListener("change", (e) => { estado.filtroInstitucion = e.target.value; pintarCruzada(); });
    $("pi-clas-pdf").addEventListener("click", () => bajarPDF($("pi-clas-pdf"), datosClasificacionPDF, "clasificacion"));
    $("pi-clas-pared").addEventListener("click", imprimirClasificacionPared);
    $("pi-clas-whatsapp").addEventListener("click", () => {
      const texto = PareoCompartir.textoClasificacion(t(), { idioma, enlace: enlaceVivoActual() });
      if (!texto) { Avisos.avisar(tx("paredSinRondas"), { tipo: "error" }); return; }
      abrirCompartir($("pi-clas-compartir"), $("pi-clas-whatsapp"), texto);
    });
    $("pi-cruzada-pdf").addEventListener("click", () => bajarPDF($("pi-cruzada-pdf"), datosCruzadaPDF, "cruzada"));

    document.querySelectorAll(".pi-imprimir").forEach((b) => b.addEventListener("click", () => window.print()));
    $("pi-bajar-trf").addEventListener("click", () => {
      try { bajar(nombreArchivo(".trf"), trfDelTorneo()); }
      catch (e) { Avisos.avisar(e.message, { tipo: "error" }); }
    });
    $("pi-bajar-trf-equipos").addEventListener("click", () => {
      const k = rondasCompletas();
      if (k < t().rondas.length) Avisos.avisar(tx("trfSoloCompletas", { r: k }), { tipo: "info" });
      bajar(nombreArchivo("-equipos.trf"), E.aTrfEquipos(t(), k));
    });
    $("pi-bajar-json").addEventListener("click", () => bajar(nombreArchivo(".json"), JSON.stringify(t(), null, 1), "application/json"));
    $("pi-bajar-jugadores").addEventListener("click", () => {
      const v = t();
      if (!v.jugadores.length) { Avisos.avisar(tx("sinJugadoresQueExportar"), { tipo: "error" }); return; }
      const orden = T.ordenInicial(v);
      const filas = orden.map((id) => {
        const j = jugador(id);
        return [j.nombre, j.institucion || "", Number(j.elo) > 0 ? j.elo : "", j.titulo || "", j.fed || "", j.fideId || "", j.categoria || ""];
      });
      CsvExcel.bajar(nombreArchivo("-jugadores.csv"), [tx("nombre"), tx("institucion"), "Elo", tx("titulo"), tx("fed"), tx("fideId"), tx("categoria")], filas);
    });
    $("pi-archivar").addEventListener("click", () => {
      const caja = $("pi-archivar-caja");
      caja.hidden = !caja.hidden;
      $("pi-archivar").setAttribute("aria-expanded", caja.hidden ? "false" : "true");
      pintarArchivar();
    });
    $("pi-borrar").addEventListener("click", async () => {
      const ok = await Avisos.confirmar(tx("confirmarBorrar", { n: t().nombre || tx("sinNombre") }), { aceptar: tx("borrarTorneo"), peligro: true });
      if (!ok) return;
      quitar(PREFIJO + estado.id);
      estado.lista = estado.lista.filter((x) => x.id !== estado.id);
      escribir(CLAVE_LISTA, JSON.stringify(estado.lista));
      const otro = estado.lista.slice().sort((a, b) => b.actualizado - a.actualizado)[0];
      if (!otro || !abrir(otro.id)) crear();
      pintarTodo();
      Avisos.avisar(tx("borrado"));
    });
    $("pi-abrir").addEventListener("change", (e) => leerArchivo(e.target, (nombre, texto) => {
      try { abrirTexto(nombre, texto); } catch (x) { Avisos.avisar(tx("noAbre", { e: x.message }), { tipo: "error" }); }
    }));
    $("pi-fpc").addEventListener("click", () => {
      const texto = $("pi-fpc-texto").value;
      if (!texto.trim()) { Avisos.avisar(tx("pegaTrf"), { tipo: "error" }); return; }
      comprobarTexto(texto);
    });
    $("pi-fpc-este").addEventListener("click", () => {
      if (t().sistema !== "suizo") { Avisos.avisar(tx("soloSuizo"), { tipo: "info" }); return; }
      try { const trf = trfDelTorneo(); $("pi-fpc-texto").value = trf; comprobarTexto(trf); }
      catch (e) { Avisos.avisar(e.message, { tipo: "error" }); }
    });
    $("pi-fpc-archivo").addEventListener("change", (e) => leerArchivo(e.target, (n, texto) => { $("pi-fpc-texto").value = texto; comprobarTexto(texto); }));
    const semilla = () => {
      const s = Math.round(Number($("pi-rtg-semilla").value));
      if (s >= 1) return s;
      const nueva = 1 + Math.floor(Math.random() * 999999);
      $("pi-rtg-semilla").value = nueva;
      return nueva;
    };
    $("pi-rtg").addEventListener("click", async () => {
      const s = semilla();
      try { bajar("azar-" + s + ".trf", await motor.generar(s)); }
      catch (e) { Avisos.avisar(tx("errorMotor", { e: e.message }), { tipo: "error" }); }
    });
    $("pi-rtg-abrir").addEventListener("click", async () => {
      const s = semilla();
      try {
        const nuevo = T.deTrf(await motor.generar(s));
        nuevo.nombre = tx("torneoAzar", { s });
        crear(nuevo);
        estado.ficha = "clasificacion";
        pintarTodo();
        Avisos.avisar(tx("abierto", { n: nuevo.nombre }));
      } catch (e) { Avisos.avisar(tx("errorMotor", { e: e.message }), { tipo: "error" }); }
    });
  }

  // ---------- Usarlo sin internet ----------
  // El service worker del sitio va siempre a la red primero y, sin señal,
  // sirve lo que encuentre guardado (sw.js). Pero solo guarda lo que pasó por
  // él: el motor y su .wasm se piden recién al emparejar, y en la primera
  // visita la página carga antes de que él exista. Así que la página guarda
  // por su cuenta todo lo que necesita —ella misma con y sin .html, sus
  // scripts y hojas, el motor, el QR, las letras y el manual— en la caché que
  // no se borra al cambiar de versión (la misma de «Ejercicios sin internet»),
  // y la renueva cada 6 horas con señal. Lo en vivo, el Elo Nacional y pasar
  // el evento a otra computadora necesitan conexión: lo dice.
  const CACHE_SIN_RED = "ajedrez-integral-sin-red";
  const CLAVE_SIN_RED = "pareo_sin_red_v1";
  const EXTRA_SIN_RED = ["js/pareo/motor-worker.js", "js/vendor/bbppairings/bbppairings.js", "js/vendor/bbppairings/bbppairings.wasm",
    "js/vendor/qrcode.js", "pareo-manual.html", "js/pareo/manual.js", "img/favicon.svg", "manifest.json"];
  function decirSinRed(clave, vars) {
    const p = $("pi-sin-red");
    if (!p) return;
    p.hidden = false;
    p.textContent = tx(clave, vars);
  }
  async function archivosSinRed() {
    const urls = new Set();
    document.querySelectorAll("script[src], link[rel='stylesheet'][href], img[src]").forEach((n) => {
      const u = new URL(n.getAttribute("src") || n.getAttribute("href"), location.href);
      if (u.origin === location.origin) urls.add(u.pathname);
    });
    for (const x of EXTRA_SIN_RED) urls.add(new URL(x, location.href).pathname);
    // Las letras: las que nombra css/fuentes.css.
    try {
      const css = await (await fetch("css/fuentes.css", { cache: "no-store" })).text();
      for (const m of css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) urls.add(new URL(m[1], location.origin + "/css/").pathname);
    } catch (e) { /* sin las letras, se ve con las del sistema */ }
    return [...urls];
  }
  async function prepararSinRed() {
    if (!window.caches || !("serviceWorker" in navigator)) { decirSinRed("sinRedNoSePuede"); return; }
    if (navigator.onLine === false) {
      const ya = Number(leer(CLAVE_SIN_RED)) || 0;
      decirSinRed(ya ? "sinRedAhora" : "sinRedAhoraSinGuardar");
      return;
    }
    const ultima = Number(leer(CLAVE_SIN_RED)) || 0;
    if (Date.now() - ultima < 6 * 3600 * 1000 && await caches.has(CACHE_SIN_RED)) { decirSinRed("sinRedListo"); return; }
    decirSinRed("sinRedGuardando");
    try {
      const cache = await caches.open(CACHE_SIN_RED);
      let todo = true;
      const guardar1 = async (ruta, nombres) => {
        try {
          const r = await fetch(ruta, { cache: "no-store" });
          if (!r.ok) { todo = false; return; }
          // Sin la marca de «redirigida»: una así no sirve para abrir una página.
          const cuerpo = await r.blob();
          for (const n of nombres) await cache.put(n, new Response(cuerpo, { status: 200, headers: r.headers }));
        } catch (e) { todo = false; }
      };
      const base = location.pathname.replace(/\.html$/, "");
      await guardar1(base + ".html", [base + ".html", base]);
      await Promise.all((await archivosSinRed()).map((u) => guardar1(u, [u])));
      if (todo) { escribir(CLAVE_SIN_RED, String(Date.now())); decirSinRed("sinRedListo"); }
      else decirSinRed("sinRedIncompleto");
    } catch (e) { decirSinRed("sinRedIncompleto"); }
  }

  function arrancar() {
    // El enlace de solo lectura (#ver= o #vivo=) no toca nada del torneo
    // guardado en este navegador: ni lo lee ni lo pisa. Es una página
    // distinta adentro de la misma página.
    // Cada uno con su botón de idioma, que vuelve a abrir la misma dirección.
    const modoVer = () => {
      $("pi-editor").hidden = true;
      $("pi-ver-barra").hidden = false;
      $("pi-ver-barra").prepend(PareoVer.botonIdioma(idioma, (n) => { escribir(CLAVE_IDIOMA, n); location.reload(); }));
    };
    if (location.hash.startsWith("#ver=")) {
      modoVer();
      PareoVer.iniciar(location.hash.slice(5), idioma);
      return;
    }
    if (location.hash.startsWith("#adjunto=")) {
      modoVer();
      PareoVer.iniciarAdjunto(location.hash.slice(9), idioma);
      return;
    }
    if (location.hash.startsWith("#mesa=")) {
      modoVer();
      PareoVer.irAMesa(location.hash.slice(6), idioma);
      return;
    }
    if (location.hash.startsWith("#firma=")) {
      modoVer();
      PareoVer.iniciarFirma(location.hash.slice(7), idioma);
      return;
    }
    if (location.hash.startsWith("#inscribir=")) {
      modoVer();
      PareoVer.iniciarInscribir(location.hash.slice(11), idioma);
      return;
    }
    if (location.hash.startsWith("#capitan=")) {
      modoVer();
      PareoVer.iniciarCapitan(location.hash.slice(9), idioma);
      return;
    }
    // En las páginas para ver, pasar de un torneo a otro cambia solo el «#»:
    // se vuelve a cargar para abrir lo que dice.
    if (/^#(evento|vivo|ver)=/.test(location.hash)) window.addEventListener("hashchange", () => location.reload());
    if (location.hash.startsWith("#evento=")) {
      modoVer();
      PareoVer.iniciarEvento(location.hash.slice(8), idioma);
      return;
    }
    if (location.hash.startsWith("#vivo=")) {
      modoVer();
      PareoVer.iniciarVivo(location.hash.slice(6), idioma);
      return;
    }
    if (!FICHAS.includes(estado.ficha)) estado.ficha = "jugadores";
    const ultimo = leer("pareo_abierto_v1");
    if (!(ultimo && abrir(ultimo))) {
      const otro = estado.lista.slice().sort((a, b) => b.actualizado - a.actualizado)[0];
      if (!(otro && abrir(otro.id))) crear();
    }
    enganchar();
    pintarTodo();
    restaurarBorrador();
    avisarPestanas();
    if (location.hash.startsWith("#recibir=")) recibirEvento(location.hash.slice(9));
    if (location.hash === "#desde=inscripcion-jde") recogerDeInscripcion();
    if (/^#org-(correo|recuperar)=/.test(location.hash)) enlaceOrganizacion(location.hash);
    // Después de pintar: que no compita con lo que se ve primero.
    setTimeout(() => { prepararSinRed(); }, 1500);
    window.addEventListener("offline", () => decirSinRed(leer(CLAVE_SIN_RED) ? "sinRedAhora" : "sinRedAhoraSinGuardar"));
    window.addEventListener("online", () => prepararSinRed());
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
