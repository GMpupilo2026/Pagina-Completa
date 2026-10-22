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

  const estado = { lista: leerJSON(CLAVE_LISTA, []), id: null, t: null, ficha: leer(CLAVE_FICHA) || "jugadores", ronda: null, filtroInstitucion: "", filtroJugador: "", eloPendientes: [], enVivo: false, canalVivo: null, sugerencia: null, eventoVivo: null, adjuntos: null, capitanes: null, verCapitanes: false, marcados: new Set(),
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
  }
  const TOPE_HISTORIAL = 40;

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
  function totalRondas() { return t().sistema === "todos" ? T.rondasTodos(t()) : Number(t().rondasTotales) || 0; }
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
      const opciones = xs.map((x) => el("option", { value: x.id, texto: x.nombre || tx("sinNombre") }));
      if (eventos.size) s.append(el("optgroup", { label: k ? eventos.get(k) || tx("sinNombre") : tx("filtroSueltos") }, opciones));
      else s.append(...opciones);
    }
    s.value = estado.id;
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

  // ---------- Torneo ----------
  function pintarTorneo() {
    const f = $("pi-form-torneo");
    const v = t();
    for (const k of ["nombre", "ciudad", "federacion", "fechaInicio", "fechaFin", "arbitro", "arbitroAdjunto", "ritmo", "rondasTotales", "colorInicial"]) {
      f.elements[k].value = v[k] == null ? "" : v[k];
    }
    f.elements.baku.checked = !!v.baku;
    f.elements.dobleVuelta.checked = !!v.dobleVuelta;
    for (const r of f.querySelectorAll('input[name="sistema"]')) {
      r.checked = r.value === v.sistema;
      r.disabled = v.rondas.length > 0;
    }
    $("pi-sistema-fijo").hidden = v.rondas.length === 0;
    $("pi-campo-rondas").hidden = v.sistema === "todos";
    $("pi-campo-baku").hidden = v.sistema === "todos";
    $("pi-campo-doble").hidden = v.sistema !== "todos";
    f.elements.dobleVuelta.disabled = v.rondas.length > 0;
    f.elements.colorInicial.disabled = v.rondas.length > 0;
    f.elements.baku.disabled = v.rondas.length > 0;
    for (const k of ["victoria", "tablas", "derrota", "bye"]) {
      f.elements["p_" + k].value = v.puntos[k];
      f.elements["p_" + k].disabled = v.rondas.length > 0;
    }
    f.elements.rondasTotales.min = Math.max(1, v.rondas.length);
    $("pi-config-jde-aplicar").disabled = v.rondas.length > 0;
    pintarDesempates();
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
    guardar();
    pintarTorneo();
    pintarLista();
    Avisos.avisar(tx("configJdeAplicada", { s: tx(v.sistema === "todos" ? "todos" : "suizo") }));
  }

  function alCambiarTorneo(e) {
    const v = t();
    const n = e.target.name;
    if (!n) return;
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
    else v[n] = e.target.value;
    guardar();
    if (n === "nombre") pintarLista();
    if (n === "sistema") pintarTorneo();
  }

  function pintarDesempates() {
    const ol = $("pi-desempates");
    ol.replaceChildren();
    const lista = t().desempates;
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
        el("button", { type: "button", class: C.mini + " pi-sube", disabled: i === 0, "aria-label": tx("subir", { n: info[idioma] }), onclick: mover(-1) }, "↑"),
        el("button", { type: "button", class: C.mini + " pi-baja", disabled: i === lista.length - 1, "aria-label": tx("bajar", { n: info[idioma] }), onclick: mover(1) }, "↓"),
        el("button", { type: "button", class: C.miniPeligro, "aria-label": tx("quitarDesempate", { n: info[idioma] }), onclick: () => { lista.splice(i, 1); guardar(); pintarDesempates(); $("pi-desempate-nuevo").focus(); } }, tx("quitar"))
      ));
    });
    if (!lista.length) ol.append(el("li", { class: C.nota + " italic", texto: tx("sinDesempates") }));
    const s = $("pi-desempate-nuevo");
    s.replaceChildren();
    for (const x of E.catalogo(t())) if (!lista.includes(x.codigo)) s.append(el("option", { value: x.codigo, texto: x[idioma] + " (" + x.codigo + ")" }));
    $("pi-desempate-agregar").disabled = !s.options.length;
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
        el("td", { class: "font-semibold", texto: j.nombre }),
        el("td", { texto: j.institucion || "" }),
        el("td", { texto: j.categoria || "" }),
        el("td", { texto: j.titulo || "" }),
        el("td", { class: "num", texto: Number(j.elo) > 0 ? j.elo : "" }),
        el("td", { texto: j.fed || "" }),
        el("td", { texto: j.fideId || "" }),
        el("td", { class: "num", texto: puntosTexto(T.puntos(v, id)) }),
        el("td", { texto: retirado ? tx("retiradoDesde", { r: j.retiradoDespuesDe + 1 }) : tx("activo") }),
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
          fijo ? null : el("button", { type: "button", id: "pi-reemplazar-" + id + "-" + k, class: C.mini, "aria-label": tx("reemplazarA", { n: j.nombre }), onclick: () => reemplazarIntegrante(id, k) }, tx("reemplazar"))));
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
        if (nombreArch.endsWith(".docx")) filas = await window.ReporteTextos.filasDeDocx(archivo);
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

  function agregarTodos(lista) {
    const n = agregarJugadores(lista.map(soloJugador));
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
    estado.sugerencia = { lista, base, anio, region: regiones, siguiente, comparacion: extra ? extra.comparacion : null, pasarMujeres: true, grupos: [], elegidos: new Map(), abiertos: new Set(), limpia, dondeQueda: new Map(), configJde: true };
    calcularSugerencia();
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
    return el("div", { id: "pi-hombres-mujeres", class: "mt-4 pt-3 border-t border-brand-100 dark:border-brand-800" },
      el("h4", { class: "font-semibold text-sm", texto: tx("hombresTitulo") }),
      el("p", { class: "text-sm mt-1", texto: tx("hombresTexto", { n: s.hombresEnMujeres.length }) }),
      el("ul", { id: "pi-hombres-lista", class: "mt-1 space-y-1 text-sm list-disc pl-5" }, s.hombresEnMujeres.map((j) =>
        el("li", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }),
          tx("hombresCaso", { n: j.nombre, i: j.institucion || "—", m: modo(j), c: String(j.categoria || "").trim() })))));
  }

  function pintarEquiposCortos(s) {
    if (!s.cortos || !s.cortos.length) return null;
    return el("div", { id: "pi-equipos-cortos", class: "mt-4 pt-3 border-t border-brand-100 dark:border-brand-800" },
      el("h4", { class: "font-semibold text-sm", texto: tx("cortosTitulo", { m: G.JDE_MIN_EQUIPO }) }),
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
    const caja = el("div", { id: "pi-repetidos", class: "mt-4 pt-3 border-t border-brand-100 dark:border-brand-800" });
    caja.append(el("h4", { class: "font-semibold text-sm", texto: tx("repetidosTitulo") }));
    if (repetidos.length) {
      const sobran = repetidos.reduce((a, r) => a + r.veces - 1, 0);
      caja.append(el("p", { class: "text-sm mt-1", texto: tx("repetidosTexto", { p: repetidos.length, n: sobran }) }),
        el("details", { class: "mt-1" },
          el("summary", { class: "cursor-pointer text-sm rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto: tx("repetidosVer") }),
          el("ul", { id: "pi-repetidos-lista", class: "mt-1 space-y-1 text-sm list-disc pl-5" }, repetidos.map((r) =>
            el("li", { texto: tx("repetidosCaso", { n: r.jugador.nombre, i: r.jugador.institucion || "—", v: r.veces }) })))));
    }
    if (dosModalidades.length) {
      // Una pregunta por persona: en cuál de sus inscripciones queda, o
      // «todavía no decido» (queda en las dos), que es como viene.
      const modo = (x) => tx(x.modalidad === "equipo" ? "grupoEquipos" : "grupoIndividual") + " " + x.categoria;
      const sinDecidir = dosModalidades.filter((d, k) => !s.dondeQueda.has(k)).length;
      caja.append(el("p", { class: "text-sm mt-2", texto: tx("dosModalidadesTexto", { n: sinDecidir }) }));
      const lista = el("div", { id: "pi-dos-modalidades", class: "mt-1 grid lg:grid-cols-2 gap-2" });
      dosModalidades.forEach((d, k) => {
        const nombre = "pi-dm-" + k;
        const elegida = s.dondeQueda.has(k) ? s.dondeQueda.get(k) : -1;
        const opcion = (valor, texto) => {
          const id = nombre + "-" + (valor < 0 ? "x" : valor);
          return el("label", { class: "inline-flex items-start gap-2 text-sm" },
            el("input", { type: "radio", name: nombre, id, value: String(valor), class: "mt-1", checked: valor === elegida, onchange: () => {
              if (valor < 0) s.dondeQueda.delete(k); else s.dondeQueda.set(k, valor);
              calcularSugerencia(); pintarSugerencia(); $(id).focus();
            } }),
            el("span", { texto }));
        };
        lista.append(el("fieldset", { class: "border border-brand-100 dark:border-brand-800 rounded-lg px-3 py-2" },
          el("legend", { class: "text-sm font-semibold px-1", texto: tx("dosModalidadesCaso", { n: d.jugador.nombre, i: d.jugador.institucion || "—", m: d.inscripciones.map(modo).join(" y ") }) }),
          el("div", { class: "flex flex-wrap gap-x-4 gap-y-1" },
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
    return el("div", { id: "pi-varios-origenes", class: "mt-4 pt-3 border-t border-brand-100 dark:border-brand-800" },
      el("h4", { class: "font-semibold text-sm", texto: tx("origenesTitulo") }),
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
    const caja = el("div", { id: "pi-comparacion", class: "mt-4 pt-3 border-t border-brand-100 dark:border-brand-800" },
      el("h4", { class: "font-semibold text-sm", texto: tx("compTitulo") }));
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
    const caja = el("div", { id: o.id, class: "mt-4 pt-3 border-t border-brand-100 dark:border-brand-800" });
    const fuera = cuales.reduce((a, e) => a + e.integrantes.length - s.elegidos.get(e.eleccion).size, 0);
    caja.append(
      el("h4", { class: "font-semibold text-sm", texto: tx(o.titulo, { m: o.maximo }) }),
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
    const caja = el("div", { id: "pi-pase-abierto", class: "mt-4 pt-3 border-t border-brand-100 dark:border-brand-800" });
    caja.append(el("h4", { class: "font-semibold text-sm", texto: tx("paseTitulo") }));
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
    const lista = el("ul", { class: "mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm" });
    s.grupos.forEach((g, i) => {
      // En equipos se empareja por equipos: el sistema sale de cuántos hay.
      const nEquipos = g.modalidad === "equipo" ? equiposDelGrupo(g) : 0;
      const n = g.jugadores.length;
      const sistema = G.sistemaSugerido(nEquipos || n);
      const id = "pi-sugerencia-g" + i;
      lista.append(el("li", { class: "flex items-start gap-2" },
        el("input", { type: "checkbox", id, class: "mt-1", checked: g.marcado, onchange: (e) => { g.marcado = e.target.checked; pintarSugerencia(); $(id).focus(); } }),
        el("label", { for: id },
          el("span", { class: "font-semibold", texto: etiquetaGrupo(g) }),
          " — " + tx(n === 1 ? "grupoUnJugador" : "grupoJugadores", { n }) + (nEquipos ? " " + tx(nEquipos === 1 ? "grupoUnEquipo" : "grupoEnEquipos", { e: nEquipos }) : ""),
          el("span", { class: C.nota, texto: " · " + (sistema ? tx(sistema === "todos" ? "sugeridoTodos" : "sugeridoSuizo", { r: G.JDE_RONDAS_SUIZO }) : tx("grupoNoAlcanza")) }))));
    });
    const hayEquipos = s.grupos.some((g) => g.modalidad === "equipo");
    const porSexo = s.dimensiones.includes("sexo");
    // Lo que hay que revisar, abajo: un índice arriba para ir directo a
    // cada parte (con una inscripción grande la propuesta es larga).
    const partes = [pintarRepetidos(s), pintarVariosOrigenes(s), pintarComparacion(s), pintarPaseAbierto(s), pintarEquiposDeMas(s),
      pintarIndividualesDeMas(s), pintarHombresEnMujeres(s), pintarEquiposCortos(s), pintarRevisionCategorias(s.revision)].filter(Boolean);
    const indice = partes.length ? el("nav", { id: "pi-sugerencia-indice", class: "mt-2 text-sm", "aria-label": tx("sugerenciaIndice") },
      el("span", { class: "font-semibold", texto: tx("sugerenciaIndice") + ": " }),
      partes.map((x) => {
        const h = x.querySelector("h4");
        x.tabIndex = -1;
        return el("button", { type: "button", class: C.mini + " mr-1 mb-1", "data-ir": x.id, onclick: () => { x.scrollIntoView({ block: "start" }); x.focus({ preventScroll: true }); } }, h ? h.textContent : x.id);
      })) : null;
    caja.append(...[
      el("h3", { id: "pi-sugerencia-titulo", class: "font-serif text-lg font-bold", texto: tx("sugerenciaTitulo", { n: s.grupos.length }) }),
      el("p", { class: "text-sm mt-1", texto: tx("sugerenciaTexto", { total: s.juegan.length, d: unidas }) }),
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
    const caja = el("div", { id: "pi-revision-categorias", class: "mt-4 pt-3 border-t border-brand-100 dark:border-brand-800" });
    const enSuCategoria = r.revisados - r.permitidos.length - r.noPermitidos.length;
    caja.append(
      el("h4", { class: "font-semibold text-sm", texto: tx("catTitulo") }),
      el("p", { class: "text-sm mt-1", texto: tx("catResumen", { n: r.revisados, ok: enSuCategoria, p: r.permitidos.length, x: r.noPermitidos.length }) }));
    if (r.anio !== r.normativa) caja.append(el("p", { class: C.nota + " mt-1", texto: tx("catOtroAnio", { a: r.anio, b: r.normativa }) }));
    const caso = (c) => {
      const j = c.jugador;
      const v = { n: j.nombre, i: j.institucion || "—", a: c.nace, p: c.propia, c: c.categoria, d: c.desde, k: c.cuantos, m: G.JDE_MAX_ASCENSOS };
      const clave = c.motivo ? { mayor: "catMayor", individual: "catIndividual", salto: "catSalto", tope: "catTope" }[c.motivo] : "catPermitido";
      return el("li", {}, el("span", { class: "font-semibold", texto: tx(c.motivo ? "catNoPermitido" : "catSiPermitido") + " " }), tx(clave, v));
    };
    if (r.noPermitidos.length) caja.append(el("ul", { id: "pi-cat-no", class: "mt-2 space-y-1 text-sm list-disc pl-5" }, r.noPermitidos.map(caso)));
    if (r.permitidos.length) caja.append(el("ul", { id: "pi-cat-si", class: "mt-2 space-y-1 text-sm list-disc pl-5" }, r.permitidos.map(caso)));
    if (r.sinFecha.length) caja.append(el("p", { class: C.nota + " mt-2", texto: tx("catSinFecha", { n: r.sinFecha.length }) }));
    return caja;
  }

  // Un torneo por cada grupo marcado, con los datos del que está abierto
  // (ciudad, fechas, árbitros, ritmo, puntos, desempates) y el sistema
  // sugerido por la normativa de los JDE: el suizo con al menos 5 rondas y,
  // si el abierto no tiene ritmo, el mínimo que pide. Si el abierto está vacío —sin jugadores ni rondas— se usa para
  // el primer grupo, en vez de dejar un torneo «(sin nombre)» de más.
  async function crearTorneosDeGrupos() {
    const s = estado.sugerencia;
    const elegidos = s.grupos.filter((g) => g.marcado);
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
      ciudad: actual.ciudad, federacion: actual.federacion, fechaInicio: actual.fechaInicio, fechaFin: actual.fechaFin,
      arbitro: actual.arbitro, arbitroAdjunto: actual.arbitroAdjunto, ritmo: actual.ritmo,
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
      const grupo = etiquetaGrupo(g);
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
  function guardarDelEvento(tor) {
    if (tor === t() || tor.__id === estado.id) { guardar(); return true; }
    const ok = escribir(PREFIJO + tor.__id, JSON.stringify(tor));
    if (!ok) Avisos.avisar(tx("noGuarda"), { tipo: "error" });
    return ok;
  }

  async function bajarDocumento(doc, sufijo, boton) {
    if (boton) boton.disabled = true;
    try {
      const blob = await window.ReportePDF.generar(doc);
      const url = URL.createObjectURL(blob);
      const a = el("a", { href: url, download: window.PareoPDF.nombreArchivo(doc.subtitulo, sufijo) });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
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
      } catch (e) { return; }
    } else {
      const lista = torneosDelEvento(ev.id);
      estado.respaldoArchivo = { id: ev.id, archivo: null, ultimaClave: lista.map((x) => x.rondas.filter((R) => T.rondaCompleta(R)).length).join(",") };
    }
    await escribirRespaldo();
    pintarEvento();
  }

  function pintarEvento() {
    pintarHistorial();
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
    acciones.append(bActa, bInforme, bPremiacion, bDiplomas, bConstancias, bEstadisticas);
    caja.append(acciones, el("p", { class: C.nota + " mt-2", texto: tx("eventoPapelesAyuda") }),
      el("p", { class: C.nota + " mt-1", texto: tx("eventoPremiacionAyuda") }));

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
      if (estado.respaldoArchivo && estado.respaldoArchivo.id === ev.id) { estado.respaldoArchivo = null; pintarEvento(); }
      else prenderRespaldo(ev);
    });
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
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("eventoRespaldoTitulo") }),
      el("p", { class: C.nota, texto: tx("eventoRespaldoTexto") }), el("div", { class: "mt-2 flex flex-wrap gap-2" }, bRespaldo, bAuto),
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
      const pdf = async (doc) => new Uint8Array(await (await window.ReportePDF.generar(doc)).arrayBuffer());
      const partes = [
        { nombre: "acta-congresillo.pdf", bytes: await pdf(V.acta(ev, lista)) },
        { nombre: "informe-oficial.pdf", bytes: await pdf(V.informe(ev, lista)) },
        { nombre: "premiacion.pdf", bytes: await pdf(V.premiacion(ev, lista)) },
        { nombre: "estadisticas.xlsx", bytes: window.TablaExcel.armar(V.estadisticas(ev, lista)) },
        { nombre: "respaldo.json", texto: JSON.stringify(V.respaldo(ev, lista), null, 1) },
      ];
      const filas = V.filasClasificados(ev, lista);
      if (filas.length) partes.splice(3, 0, { nombre: "clasificados.xlsx", bytes: window.TablaExcel.armar([{ nombre: "Clasificados", filas: [V.ENCABEZADOS].concat(filas) }]) });
      bajar(window.PareoPDF.nombreArchivo(ev.nombre, "paquete-final").replace(/\.pdf$/, ".zip"), window.TablaExcel.zip(partes), "application/zip");
      Avisos.avisar(tx("cierreBajado", { n: partes.length }));
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
    x.canal.send({ type: "broadcast", event: "estado", payload: V.vistaEvento(lista[0].evento, lista, horario) });
  }
  async function mostrarQrEvento(cont) {
    const url = location.origin + location.pathname + "#evento=" + estado.eventoVivo.codigo;
    try {
      await PareoQr.cargar();
      const copiar = el("button", { type: "button", class: C.mini }, tx("copiarEnlace"));
      copiar.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(url); Avisos.avisar(tx("enlaceCopiado")); }
        catch (e) { Avisos.avisar(tx("noCopia"), { tipo: "error" }); }
      });
      cont.replaceChildren(el("div", { class: "w-48 bg-white p-2 rounded-lg" }, PareoQr.svg(url, tx("qrEtiqueta"))),
        el("p", { id: "pi-evento-url", class: "text-xs break-all mt-2 font-mono", texto: url }), el("div", { class: "mt-1 flex flex-wrap gap-2" }, copiar,
          el("a", { id: "pi-evento-proyectar", href: url + "&proyectar", target: "_blank", rel: "noopener", class: C.mini }, tx("eventoProyectar"))),
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
      ],
    });
    if (!r) return;
    const d = datosJugador(r);
    if (!d.nombre) { Avisos.avisar(tx("faltaNombre"), { tipo: "error" }); return; }
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
  async function moverDeTorneo(id) {
    const v = t();
    const j = jugador(id);
    const destinos = estado.lista.filter((x) => x.id !== estado.id).map((x) => [x.id, leerJSON(PREFIJO + x.id, null)])
      .filter(([, y]) => y && y.evento && v.evento && y.evento.id === v.evento.id && !E.esDeEquipos(y) && !y.rondas.length);
    if (!destinos.length) { Avisos.avisar(tx("moverSinDestino"), { tipo: "error" }); return; }
    const r = await Avisos.formulario({
      titulo: tx("moverA", { n: j.nombre }), texto: tx("moverTexto"), aceptar: tx("moverSi"), cancelar: tx("cancelar"),
      campos: [{ nombre: "destino", etiqueta: tx("moverDestino"), tipo: "select", valor: destinos[0][0], opciones: destinos.map(([idT, y]) => [idT, y.grupo || y.nombre]) }],
    });
    if (!r || t() !== v || v.rondas.length) return;
    const destino = leerJSON(PREFIJO + r.destino, null);
    if (!destino || destino.rondas.length) { Avisos.avisar(tx("moverSinDestino"), { tipo: "error" }); return; }
    v.jugadores = v.jugadores.filter((x) => x.id !== id);
    destino.jugadores.push(j);
    destino.movimientos = (destino.movimientos || []).concat({ nombre: j.nombre, institucion: j.institucion || "", desde: v.grupo || v.nombre });
    if (!escribir(PREFIJO + r.destino, JSON.stringify(destino))) { Avisos.avisar(tx("noGuarda"), { tipo: "error" }); return; }
    guardar();
    pintarJugadores();
    Avisos.avisar(tx("movido", { n: j.nombre, t: destino.grupo || destino.nombre }));
  }

  async function retirar(id) {
    const j = jugador(id);
    const v = t();
    if (j.retiradoDespuesDe != null) {
      j.retiradoDespuesDe = null;
      guardar();
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
        el("button", { type: "button", class: C.botonSec, onclick: () => imprimirPlanillasFirma(r) }, tx("planillasFirma")),
        E.esDeEquipos(v) ? el("button", { type: "button", id: "pi-alineaciones", class: C.botonSec, onclick: () => imprimirAlineaciones(r) }, tx("alineacionesImprimir")) : null,
        el("button", { type: "button", class: C.botonSec, onclick: () => compartirLectura(r) }, tx("verDesdeElCelular")),
        ultima ? el("button", { type: "button", id: "pi-adjunto", class: C.botonSec, onclick: () => enlaceAdjunto(r) }, tx("adjuntoBoton")) : null,
        el("button", { type: "button", id: "pi-planillas-anotacion", class: C.botonSec, onclick: () => imprimirPlanillasAnotacion(r) }, tx("anotacionBoton")),
        el("button", { type: "button", id: "pi-imprimir-todo", class: C.botonSec, onclick: () => imprimirTodoDeRonda(r) }, tx("imprimirTodo")),
        ultima ? el("button", { type: "button", class: C.miniPeligro + " px-3 py-2", onclick: () => deshacerRonda(r) }, tx("deshacerRonda")) : null)));
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
    caja.append(cajaAdjunto);
    if (ultima && (v.adjuntos || []).some((a) => a.activo)) { conectarAdjuntos(); mostrarAdjuntos(cajaAdjunto); }
    if (E.esDeEquipos(v)) pintarEncuentros(caja, r);
    else pintarMesasIndividuales(caja, r);
    pintarNoJuegan(caja, r);
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
      campos: [{ nombre: "desde", etiqueta: tx("adjuntoDesde"), valor: "1", inputmode: "numeric" }, { nombre: "hasta", etiqueta: tx("adjuntoHasta"), valor: String(total), inputmode: "numeric" }] });
    if (!res || t() !== v) return;
    const desde = Math.max(1, Math.round(Number(res.desde)) || 1), hasta = Math.min(total, Math.round(Number(res.hasta)) || total);
    if (desde > hasta) { Avisos.avisar(tx("adjuntoRango"), { tipo: "error" }); return; }
    v.adjuntos = (v.adjuntos || []).concat({ codigo: nuevoCodigoVivo(), rango: desde + "-" + hasta, activo: true });
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
    canal.send({ type: "broadcast", event: "estado", payload: {
      nombre: v.nombre || "", ronda: v.rondas.length,
      mesas: R.mesas.map((m, i) => {
        const x = { m: i + 1, b: nombre(m.b), n: m.n == null ? null : nombre(m.n), r: m.r || null };
        if (deEquipos && m.n != null) {
          // Sin tocar lo guardado: una copia con la alineación de entrada.
          const copia = m.alineacion ? m : E.prepararMesa(v, JSON.parse(JSON.stringify(m)));
          x.tableros = E.tablerosDe(v, copia).map((k) => ({ t: k.k + 1, b: integrante(k.bBlancas ? m.b : m.n, k.blancas), n: integrante(k.bBlancas ? m.n : m.b, k.negras), r: k.r || null, fijo: k.fijo }));
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
      if (m.r && m.r !== p.r) anotarDiscrepancia(v, R, { mesa, r: p.r, ya: m.r });
      if (m.r) return rechazar();
      m.r = p.r;
      texto = tx("adjuntoLlego", { m: mesa, r: tx("corto_" + p.r) });
    }
    m.porAdjunto = true;
    if (v === t()) { guardar(); if (estado.ficha === "rondas" && estado.ronda === v.rondas.length - 1) pintarRondas(); }
    else escribir(PREFIJO + estado.adjuntos.idTorneo, JSON.stringify(v));
    Avisos.avisar(texto, { tipo: "info" });
    enviarAdjunto(codigo);
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

  // ---------- Los resultados para confirmar ----------
  // Las sorpresas de Elo (V.sorpresas) y lo que un adjunto anotó distinto.
  // No bloquea nada: cada uno se confirma con un botón, o se cambia.
  function pintarConfirmar(caja, r) {
    const v = t();
    const R = v.rondas[r];
    const vistas = new Set(R.confirmadas || []);
    const sorpresas = V.sorpresas(v, r).filter((x) => !vistas.has(x.mesa + "|" + x.r));
    const discrepancias = (R.discrepancias || []).map((x, k) => Object.assign({ k }, x)).filter((x) => !x.resuelta);
    if (!sorpresas.length && !discrepancias.length) return;
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
        el("h4", { class: "font-semibold", texto: tx("adjuntoListo", { r: a.rango }) }),
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
    x.canal.send({ type: "broadcast", event: "estado", payload: {
      nombre: v.nombre || "", equipo: e.nombre, ronda: v.rondas.length, rival,
      integrantes: e.integrantes.map((j) => ({ id: j.id, nombre: j.nombre })), alineacion,
      bloqueada: !m || m.n == null || (m.partidas || []).some((p) => p.r),
      confirmada: (m && m.alineacionCapitan && m.alineacionCapitan[enc.lado]) || null,
    } });
  }
  function recibirDeCapitan(codigo, p) {
    const v = torneoDeCapitanes();
    const x = estado.capitanes && estado.capitanes.canales.get(codigo);
    if (!v || !x || Number(p.ronda) !== v.rondas.length) return enviarCapitan(codigo);
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
      lista.append(el("div", { class: "rounded-xl border border-brand-200 dark:border-brand-700 p-3", "data-capitan-equipo": idE },
        el("h4", { class: "font-semibold", texto: e.nombre }),
        el("div", { class: "w-28 bg-white p-2 rounded-lg mt-2" }, PareoQr.svg(url, tx("qrEtiqueta"))),
        el("p", { class: "pi-capitan-url text-xs break-all mt-2 font-mono", texto: url })));
    }
    cont.replaceChildren(el("p", { class: C.nota, texto: tx("capitanesAyuda") }), lista);
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
      enMesa.filter(([id]) => !R.tarde[id]).map(([id, i]) => el("option", { value: id, texto: tx("mesa") + " " + (i + 1) + ": " + nombreDe(id) })));
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
      const jugando = R.mesas.map((m, i) => (m.n !== null && !m.r ? i + 1 : 0)).filter(Boolean);
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

  // El motivo de una corrección (null si se cancela).
  async function pedirMotivo(r, i, antes, despues, tablero) {
    const corto = (x) => (x ? tx("corto_" + x) : tx("resSin"));
    const res = await Avisos.formulario({
      titulo: tx("correccionTitulo", { r: r + 1, m: i + 1 }) + (tablero ? " · " + tx("tableroN", { t: tablero }) : ""),
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
  const TEXTO_INCIDENCIA = { reclamo: "incReclamo", sancion: "incSancion", decision: "incDecision", apelacion: "incApelacion", correccion: "incCorreccion", otra: "incOtra" };
  function pintarIncidencias(caja, r) {
    const R = t().rondas[r];
    const sec = el("section", { id: "pi-incidencias", class: "no-imprimir mt-6", "aria-labelledby": "pi-inc-titulo" },
      el("h3", { id: "pi-inc-titulo", class: "font-semibold", texto: tx("incTitulo") }),
      el("p", { class: C.nota, texto: tx("incTexto") }));
    const lista = el("ul", { id: "pi-inc-lista", class: "mt-2 space-y-1 text-sm" });
    (R.incidencias || []).forEach((x, k) => lista.append(el("li", { class: "flex flex-wrap items-start gap-2" },
      el("span", { texto: horaCR(x.hora) + (x.mesa ? " · " + tx("mesa") + " " + x.mesa : "") + " · " + tx(TEXTO_INCIDENCIA[x.tipo] || TEXTO_INCIDENCIA.otra) + ": " + x.texto +
        (x.presenta ? " " + tx("apelacionPresenta", { p: x.presenta }) : "") + (x.tipo === "apelacion" ? " " + tx("apelacionResolucion", { r: x.resolucion || tx("apelacionPendiente") }) : "") }),
      x.tipo === "apelacion" ? el("button", { type: "button", class: C.mini, onclick: () => resolverApelacion(R, k) }, tx(x.resolucion ? "apelacionCambiar" : "apelacionResolver")) : null,
      x.tipo === "sancion" && x.mesa && !E.esDeEquipos(t()) && R.mesas[x.mesa - 1] && R.mesas[x.mesa - 1].n
        ? el("button", { type: "button", class: C.mini, "data-sancion": k, onclick: () => aplicarSancion(R, k) }, tx(x.aplicada ? "sancionCambiar" : "sancionAplicar")) : null,
      el("button", { type: "button", class: C.mini, onclick: () => { R.incidencias.splice(k, 1); guardar(); pintarRondas(); } }, tx("quitar")))));
    const mesa = el("select", { id: "pi-inc-mesa", class: C.campoChico, "aria-label": tx("mesa") },
      el("option", { value: "", texto: tx("incSinMesa") }), R.mesas.map((m, i) => el("option", { value: String(i + 1), texto: tx("mesa") + " " + (i + 1) })));
    const tipo = el("select", { id: "pi-inc-tipo", class: C.campoChico, "aria-label": tx("incTipo") },
      Object.entries(TEXTO_INCIDENCIA).filter(([k]) => k !== "correccion").map(([k, c]) => el("option", { value: k, texto: tx(c) })));
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
    sec.append(lista, el("div", { class: "flex flex-wrap gap-2 mt-2" }, mesa, tipo), cajaPresenta, texto, anotar);
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
          el("td", { class: "num", texto: i + 1 }), el("td", { class: "num", texto: num.get(m.b) }),
          el("td", { class: "font-semibold", texto: nombreDe(m.b) }), el("td", { class: "num", texto: puntosTexto(antes(m.b)) }),
          el("td", { class: "text-center", colspan: 4, texto: tx("byePareo", { p: puntosTexto(v.puntos.bye) }) })));
        return;
      }
      const sel = el("select", { id: "pi-mesa-" + i, "data-resultado": "", class: C.campoChico, "aria-label": tx("resultadoMesa", { m: i + 1, b: nombreDe(m.b), n: nombreDe(m.n) }) });
      for (const [val, clave] of RESULTADOS) sel.append(el("option", { value: val, texto: tx(clave) }));
      sel.value = m.r || "";
      sel.addEventListener("change", async () => {
        // Corregir una ronda ya cerrada (la siguiente ya se emparejó) pide
        // el motivo, y queda en las incidencias.
        if (r < v.rondas.length - 1 && m.r && sel.value !== m.r) {
          const motivo = await pedirMotivo(r, i, m.r, sel.value || null);
          if (!motivo) { sel.value = m.r || ""; return; }
          anotarCorreccion(R, i, m.r, sel.value || null, motivo);
        }
        m.r = sel.value || null;
        guardar();
        const quedan = R.mesas.filter((x) => x.n && !x.r).length;
        const estadoTxt = caja.querySelector('[role="status"]');
        if (estadoTxt) estadoTxt.textContent = quedan ? tx("faltanResultados", { n: quedan }) : tx("rondaCompleta");
        if (!quedan) pintarRondasNav();
      });
      cuerpo.append(el("tr", { "data-nombres": normalizarBusqueda(nombreDe(m.b) + " " + nombreDe(m.n)) },
        el("td", { class: "num", texto: i + 1 }), el("td", { class: "num", texto: num.get(m.b) }),
        el("td", { class: "font-semibold", texto: nombreDe(m.b) }), el("td", { class: "num", texto: puntosTexto(antes(m.b)) }),
        el("td", { class: "text-center" }, sel, el("span", { class: "pi-solo-imprimir", texto: m.r ? tx("corto_" + m.r) : "" }),
          m.porAdjunto ? el("span", { class: "block text-xs " + C.nota, texto: tx("adjuntoAnoto") }) : null),
        el("td", { class: "num", texto: puntosTexto(antes(m.n)) }), el("td", { class: "font-semibold", texto: nombreDe(m.n) }),
        el("td", { class: "num", texto: num.get(m.n) })));
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
          el("option", { value: "Z", texto: tx(v.sistema === "todos" ? "libre" : "byeCero") }),
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
          el("span", { class: "font-semibold", texto: tx("mesa") + " " + (i + 1) + ": " + num.get(m.b) + ". " + nombreDe(m.b) }),
          " — " + tx("byeEquipo", { p: puntosTexto(v.puntos.bye), t: puntosTexto(E.TABLEROS / 2) })));
        return;
      }
      E.prepararMesa(v, m);
      const pe = E.puntosDelEncuentro(v, m);
      const nombresEnc = [nombreDe(m.b), nombreDe(m.n)].concat([m.b, m.n].flatMap((idE) => (jugador(idE) || { integrantes: [] }).integrantes.map((j) => j.nombre)));
      const tarjeta = el("section", { class: "rounded-xl border border-brand-200 dark:border-brand-700 p-3", "aria-labelledby": "pi-enc-" + i + "-t", "data-nombres": normalizarBusqueda(nombresEnc.join(" ")) });
      tarjeta.append(el("h3", { id: "pi-enc-" + i + "-t", class: "font-semibold" },
        tx("mesa") + " " + (i + 1) + ": " + num.get(m.b) + ". " + nombreDe(m.b) + " (" + puntosTexto(antes(m.b)) + ") – " +
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
            }
            m.partidas[x.k].r = sel.value || null;
            alCambiarEncuentro(m, id);
          });
          celda = el("span", {}, sel, el("span", { class: "pi-solo-imprimir", texto: x.r ? tx("corto_" + x.r) : "" }));
        }
        tableros.append(el("li", { class: "flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-brand-100 dark:border-brand-800 pt-2", "data-tablero": x.k + 1 },
          el("span", { class: "font-mono text-xs font-bold", texto: tx("tableroN", { t: x.k + 1 }) }),
          el("span", { class: "text-sm flex-1 min-w-[12rem]" },
            el("span", { class: "font-semibold", title: nombreDe(equipoBlancas), texto: blancas }), " ",
            el("span", { class: C.nota, texto: "(" + tx("blancas") + ")" }), " – ",
            el("span", { class: "font-semibold", title: nombreDe(equipoNegras), texto: negras }), " ",
            el("span", { class: C.nota, texto: "(" + tx("negras") + ")" })),
          celda));
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
          el("h1", { class: "pi-firma-titulo" }, tx("alineacionTitulo", { r: r + 1, m: i + 1 }) + (v.nombre ? " — " + v.nombre : "")),
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
  // jugadas en dos columnas, como la planilla oficial.
  function imprimirPlanillasAnotacion(r) {
    const v = t();
    const R = v.rondas[r];
    const cont = $("pi-firmas");
    empezarHoja(cont);
    const hoja = (titulo, blancas, negras) => {
      const tabla = el("table", { class: "pi-planilla-tabla" },
        el("thead", {}, el("tr", {}, ["#", tx("blancas"), tx("negras"), "#", tx("blancas"), tx("negras")].map((x) => el("th", { scope: "col", texto: x })))),
        el("tbody", {}, Array.from({ length: 30 }, (_, i) => el("tr", {},
          el("td", { class: "pi-planilla-n", texto: i + 1 }), el("td"), el("td"),
          el("td", { class: "pi-planilla-n", texto: i + 31 }), el("td"), el("td")))));
      cont.append(el("div", { class: "pi-firma-mesa pi-planilla" },
        el("h1", { class: "pi-firma-titulo", texto: (v.nombre || "") }),
        el("p", { class: "pi-planilla-datos", texto: titulo + (v.fechaInicio ? " · " + v.fechaInicio : "") + (v.ritmo ? " · " + v.ritmo : "") }),
        el("p", { class: "pi-planilla-datos" }, el("strong", { texto: tx("blancas") + ": " }), blancas),
        el("p", { class: "pi-planilla-datos" }, el("strong", { texto: tx("negras") + ": " }), negras),
        tabla,
        el("p", { class: "pi-firma-resultado" }, tx("resultado") + ": ", el("span", { class: "pi-firma-blanco" })),
        el("div", { class: "pi-diploma-firmas" },
          el("p", { class: "pi-firma-linea", texto: tx("firmaDe", { n: blancas }) }),
          el("p", { class: "pi-firma-linea", texto: tx("firmaDe", { n: negras }) }))));
    };
    R.mesas.forEach((m, i) => {
      if (m.n === null) return;
      if (E.esDeEquipos(v)) {
        const copia = m.alineacion ? m : E.prepararMesa(v, JSON.parse(JSON.stringify(m)));
        const de = (idE, idJ) => { const e = jugador(idE); const j = e && idJ && e.integrantes.find((y) => y.id === idJ); return j ? j.nombre + " (" + e.nombre + ")" : tx("nadie"); };
        for (const x of E.tablerosDe(v, copia)) {
          if (!x.blancas || !x.negras) continue;
          hoja(tx("anotacionTituloTablero", { r: r + 1, m: i + 1, t: x.k + 1 }), de(x.bBlancas ? m.b : m.n, x.blancas), de(x.bBlancas ? m.n : m.b, x.negras));
        }
      } else hoja(tx("anotacionTitulo", { r: r + 1, m: i + 1 }), nombreDe(m.b), nombreDe(m.n));
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
  function imprimirTodoDeRonda(r) {
    $("pi-plantilla").replaceChildren();
    $("pi-firmas").replaceChildren();
    impresion.juntando = true;
    impresion.clases.clear();
    try {
      imprimirPlantillaMesas(r);
      if (E.esDeEquipos(t())) imprimirAlineaciones(r);
      imprimirPlanillasFirma(r);
      imprimirPlanillasAnotacion(r);
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
  function imprimirPlantillaMesas(r) {
    const v = t();
    const R = v.rondas[r];
    const num = T.numeros(v);
    const cont = $("pi-plantilla");
    empezarHoja(cont, el("h1", { class: "pi-plantilla-titulo" },
      tx("plantillaTitulo", { r: r + 1 }) + (v.nombre ? " — " + v.nombre : "")));
    const lista = el("div", { class: "pi-plantilla-lista" });
    R.mesas.forEach((m, i) => {
      if (m.n === null) {
        lista.append(el("div", { class: "pi-plantilla-mesa" },
          el("span", { class: "pi-plantilla-num", texto: i + 1 }),
          el("span", { class: "pi-plantilla-jugador", texto: num.get(m.b) + ". " + nombreDe(m.b) }),
          el("span", { class: "pi-plantilla-bye", texto: tx("byePareo", { p: puntosTexto(v.puntos.bye) }) })));
        return;
      }
      lista.append(el("div", { class: "pi-plantilla-mesa" },
        el("span", { class: "pi-plantilla-num", texto: i + 1 }),
        el("span", { class: "pi-plantilla-jugador", texto: num.get(m.b) + ". " + nombreDe(m.b) }),
        el("span", { class: "pi-plantilla-vs" }, "–"),
        el("span", { class: "pi-plantilla-jugador", texto: num.get(m.n) + ". " + nombreDe(m.n) }),
        el("span", { class: "pi-plantilla-resultado" })));
    });
    cont.append(lista);
    imprimirCon("pi-imprimiendo-plantilla");
  }

  // Una hoja POR MESA (salto de página entre una y la siguiente) para que el
  // árbitro la recoja firmada: a diferencia de la plantilla de la pared, esta
  // SÍ muestra el resultado ya anotado (si lo hay) — es para confirmarlo, no
  // para ocultarlo. Un bye no tiene con quién firmar: va sin líneas de firma.
  function imprimirPlanillasFirma(r) {
    const v = t();
    const R = v.rondas[r];
    const num = T.numeros(v);
    const cont = $("pi-firmas");
    empezarHoja(cont);
    R.mesas.forEach((m, i) => {
      const hoja = el("div", { class: "pi-firma-mesa" },
        el("h1", { class: "pi-firma-titulo" }, tx("planillaFirmaTitulo", { r: r + 1, m: i + 1 }) + (v.nombre ? " — " + v.nombre : "")));
      if (m.n === null) {
        hoja.append(el("p", { class: "pi-firma-jugador" }, num.get(m.b) + ". " + nombreDe(m.b)),
          el("p", { class: "pi-firma-bye", texto: tx("byePareo", { p: puntosTexto(v.puntos.bye) }) }));
        cont.append(hoja);
        return;
      }
      if (E.esDeEquipos(v)) {
        // Un encuentro: los cuatro tableros con quién juega con cada color y
        // su resultado (si ya está), y la firma de los dos capitanes.
        E.prepararMesa(v, m);
        const nombreDeJ = (idE, idJ) => { const j = idJ && jugador(idE).integrantes.find((x) => x.id === idJ); return j ? j.nombre : tx("nadie"); };
        hoja.append(el("p", { class: "pi-firma-jugador" }, num.get(m.b) + ". " + nombreDe(m.b) + " – " + num.get(m.n) + ". " + nombreDe(m.n)));
        for (const x of E.tablerosDe(v, m)) {
          const eb = x.bBlancas ? m.b : m.n, en = x.bBlancas ? m.n : m.b;
          hoja.append(el("p", { class: "pi-firma-resultado" },
            tx("tableroN", { t: x.k + 1 }) + ": " + nombreDeJ(eb, x.blancas) + " – " + nombreDeJ(en, x.negras) + "   ",
            x.r ? el("span", { class: "font-semibold" }, tx("corto_" + x.r)) : el("span", { class: "pi-firma-blanco" })));
        }
        hoja.append(el("p", { class: "pi-firma-linea" }, tx("firmaCapitan", { e: nombreDe(m.b) })),
          el("p", { class: "pi-firma-linea" }, tx("firmaCapitan", { e: nombreDe(m.n) })));
        cont.append(hoja);
        return;
      }
      hoja.append(
        el("p", { class: "pi-firma-jugador" }, num.get(m.b) + ". " + nombreDe(m.b)),
        el("p", { class: "pi-firma-jugador" }, num.get(m.n) + ". " + nombreDe(m.n)),
        el("p", { class: "pi-firma-resultado" },
          tx("resultado") + ": ",
          m.r ? el("span", { class: "font-semibold" }, tx("corto_" + m.r)) : el("span", { class: "pi-firma-blanco" })),
        el("p", { class: "pi-firma-linea" }, tx("firmaDe", { n: nombreDe(m.b) })),
        el("p", { class: "pi-firma-linea" }, tx("firmaDe", { n: nombreDe(m.n) })));
      cont.append(hoja);
    });
    imprimirCon("pi-imprimiendo-firmas");
  }

  // El afterprint llega sea que se imprima o se cancele: ahí se limpia, una
  // sola vez para toda la página (no hace falta re-engancharlo).
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("pi-imprimiendo-plantilla", "pi-imprimiendo-firmas");
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
      ronda: { n: r + 1, mesas: R.mesas.map((m, i) => ({ m: i + 1, b: nombreDe(m.b), n: m.n == null ? null : nombreDe(m.n), r: m.r || null })) },
      clasificacion: filas.map((f) => ({ p: f.puesto, n: jugador(f.id).nombre, pts: f.puntos })),
    };
  }

  // Un canal de Supabase Realtime en modo Broadcast: efímero, sin tabla y sin
  // RLS (no hay fila que proteger), público por default en este proyecto —
  // la única manera de que otro aparato reciba algo sin que Pareo Integral
  // tenga cuenta ni servidor propio de datos. Ver «El canal en vivo» en
  // docs/decisiones/juegos-y-torneos.md.
  function difundirEnVivo() {
    const v = t();
    if (!estado.enVivo || !estado.canalVivo || !v.rondas.length) return;
    estado.canalVivo.send({ type: "broadcast", event: "estado", payload: datosLecturaActual(v.rondas.length - 1) });
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
    if (r === 0) pintarPasarLista(caja);
    const ausentes = r === 0 ? noLlegaron(v) : [];
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
    const pedidas = {};
    if (v.sistema === "todos") {
      caja.append(el("p", { class: C.nota + " mb-3", texto: tx("todosAyuda") }));
      if (r === 0) {
        const lista = el("ol", { class: "list-decimal pl-6 mb-3 text-sm" });
        for (const id of T.ordenInicial(v)) lista.append(el("li", { texto: nombreDe(id) }));
        caja.append(el("h3", { class: "font-semibold", texto: tx("numerosSorteo") }), lista,
          el("button", { type: "button", class: C.botonSec + " mb-4", onclick: () => { T.sortearNumeracion(v); guardar(); pintarRondas(); Avisos.avisar(tx("sorteados")); } }, tx("sortear")));
      }
    } else {
      caja.append(el("p", { class: C.nota + " mb-3", texto: tx("byesAyuda") }));
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
        s.addEventListener("change", () => { if (s.value) pedidas[id] = s.value; else delete pedidas[id]; actualizarNoViene(); });
        // Quien no llegó al pasar lista queda de entrada como «no viene».
        if (ausentes.includes(id)) { s.value = "Z"; pedidas[id] = "Z"; }
        noViene.addEventListener("click", () => { s.value = s.value === "Z" ? "" : "Z"; s.dispatchEvent(new Event("change")); });
        actualizarNoViene();
        ul.append(el("li", { class: "flex items-center justify-between gap-2" }, el("span", { class: "text-sm", texto: num.get(id) + ". " + j.nombre }), el("div", { class: "flex items-center gap-1" }, s, noViene)));
      }
      caja.append(ul);
    }
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
      if (r === 0 && ausentes.length) {
        const nombres = ausentes.map(nombreDe);
        if (v.sistema === "todos") {
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
      try {
        await emparejar(r, pedidas);
        estado.ronda = r;
        pintarRondas();
        Avisos.avisar(tx("rondaLista", { r: r + 1 }));
        const primero = document.querySelector("#pi-ronda select");
        if (primero) primero.focus();
      } catch (e) {
        msg.textContent = "";
        Avisos.avisar(e.codigo === 1 ? tx("sinPareoPosible") : tx("errorMotor", { e: e.message }), { tipo: "error" });
      } finally {
        boton.disabled = faltanRevisar() > 0;
      }
    });
    caja.append(boton, msg);
  }

  // Pasar lista antes de la ronda 1: quién llegó. Se prende con la casilla;
  // apagada, no cambia nada.
  const noLlegaron = (v) => (v.pasarLista ? v.jugadores.filter((j) => !(v.asistencia || {})[j.id] && j.retiradoDespuesDe == null).map((j) => j.id) : []);
  function pintarPasarLista(caja) {
    const v = t();
    const det = el("details", { id: "pi-asistencia", class: "mb-4 rounded-xl border border-brand-200 dark:border-brand-700 p-3", open: !!v.pasarLista });
    det.append(el("summary", { class: "cursor-pointer font-semibold rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto: tx("listaTitulo") }),
      el("p", { class: C.nota + " mt-1", texto: tx("listaTexto") }),
      el("label", { class: "flex items-start gap-2 text-sm mt-2" },
        el("input", { type: "checkbox", id: "pi-asistencia-activar", class: "mt-1", checked: !!v.pasarLista, onchange: (e) => {
          v.pasarLista = e.target.checked;
          if (v.pasarLista && !v.asistencia) v.asistencia = {};
          guardar(); pintarRondas();
          const x = $("pi-asistencia-activar"); if (x) x.focus();
        } }),
        el("span", { class: "font-semibold", texto: tx("listaActivar") })));
    if (v.pasarLista) {
      const orden = T.ordenInicial(v);
      det.append(el("p", { id: "pi-asistencia-cuenta", class: "text-sm mt-2", role: "status", texto: tx("listaCuenta", { n: orden.filter((id) => v.asistencia[id]).length, t: orden.length }) }),
        el("button", { type: "button", id: "pi-asistencia-todos", class: C.mini + " mt-1", onclick: () => { for (const id of orden) v.asistencia[id] = true; guardar(); pintarRondas(); } }, tx("listaTodos")));
      const ul = el("ul", { class: "mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm" });
      for (const id of orden) {
        const cid = "pi-llego-" + id;
        ul.append(el("li", { class: "flex items-start gap-2" },
          el("input", { type: "checkbox", id: cid, class: "mt-1", checked: !!v.asistencia[id], onchange: (e) => {
            if (e.target.checked) v.asistencia[id] = true; else delete v.asistencia[id];
            guardar(); pintarRondas();
            const x = $(cid); if (x) x.focus();
          } }),
          el("label", { for: cid, texto: nombreDe(id) })));
      }
      det.append(ul);
    }
    caja.append(det);
  }

  async function emparejar(r, pedidas) {
    const v = t();
    if (v.rondas.length !== r) throw new Error(tx("yaEmparejada"));
    if (r === 0 && !Array.isArray(v.numeracion)) T.fijarNumeracion(v);
    if (r === 0) E.fijarOrden(v);
    let ronda;
    if (v.sistema === "todos") {
      if (v.jugadores.length < 2) throw new Error(tx("pocosJugadores"));
      ronda = T.rondaTodos(v, r);
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
    v.rondas.push(ronda);
    guardar();
  }

  async function deshacerRonda(r) {
    const v = t();
    const conResultados = v.rondas[r].mesas.some((m) => m.n && m.r);
    const ok = await Avisos.confirmar(tx(conResultados ? "confirmarDeshacerConResultados" : "confirmarDeshacer", { r: r + 1 }),
      { aceptar: tx("deshacerRonda"), peligro: true });
    if (!ok || v.rondas.length !== r + 1) return;
    v.rondas.pop();
    if (r === 0 && v.sistema === "suizo" && !v.numeracionDeArchivo) v.numeracion = null;
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
    const tabla = $("pi-tabla-clas");
    tabla.replaceChildren();
    if (!v.jugadores.length) return;
    tabla.append(el("thead", {}, el("tr", {},
      el("th", { class: "num", scope: "col", texto: tx("puesto") }), el("th", { class: "num", scope: "col", texto: tx("nro") }),
      el("th", { scope: "col", texto: tx("nombre") }), el("th", { scope: "col", texto: tx("institucion") }),
      el("th", { scope: "col", texto: tx("fed") }), el("th", { class: "num", scope: "col", texto: "Elo" }),
      el("th", { class: "num", scope: "col", texto: tx("pts") }),
      v.desempates.map((c) => el("th", { class: "num", scope: "col" }, el("abbr", { title: (E.catalogo(v).find((x) => x.codigo === c) || {})[idioma], texto: c }))))));
    const cuerpo = el("tbody");
    for (const f of filas) {
      const j = jugador(f.id);
      cuerpo.append(el("tr", {},
        el("td", { class: "num", texto: f.puesto }), el("td", { class: "num", texto: num.get(f.id) }),
        el("td", { class: "font-semibold", texto: j.nombre + (j.titulo ? " (" + j.titulo + ")" : "") }),
        el("td", { texto: j.institucion || "" }),
        el("td", { texto: j.fed || "" }), el("td", { class: "num", texto: Number(j.elo) > 0 ? j.elo : "" }),
        el("td", { class: "num font-bold", texto: puntosTexto(f.puntos) }),
        v.desempates.map((c) => el("td", { class: "num", texto: valorDesempate(c, f.valores[c]) }))));
    }
    tabla.append(cuerpo);
    const dl = $("pi-clas-leyenda");
    dl.replaceChildren();
    for (const c of v.desempates) {
      const info = E.catalogo(v).find((x) => x.codigo === c);
      if (info) dl.append(el("div", {}, el("dt", { class: "inline font-semibold", texto: c + ": " }), el("dd", { class: "inline", texto: info[idioma] })));
    }
    pintarMejoresTableros(k);
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

  // El desempate por tableros es un número armado (E.codificarTableros): se
  // escribe tablero por tablero.
  const valorDesempate = (c, x) => (c === "TB" ? E.textoTableros(x, t().tableros) : formatoNum(x));

  // ---------- Tabla cruzada ----------
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
    const letra = idioma === "en" ? { w: "w", b: "b" } : { w: "b", b: "n" };
    for (const f of filas) {
      const j = jugador(f.id);
      const celdas = [];
      for (let r = 0; r < R; r++) {
        const s = T.situacion(v, r, f.id);
        let texto;
        if (s.tipo === "bye") texto = tx("cBye") + " " + puntosTexto(s.puntos);
        else if (s.tipo === "ausente") texto = (s.codigo === "Z" ? "—" : tx("cBye")) + (s.puntos ? " " + puntosTexto(s.puntos) : "");
        else if (s.tipo === "pendiente") texto = num.get(s.rival) + letra[s.color] + " *";
        else {
          const sim = s.codigo === "=" ? "½" : s.codigo === "-" ? "−" : s.codigo;
          texto = num.get(s.rival) + letra[s.color] + " " + sim;
        }
        celdas.push(el("td", { class: "text-center whitespace-nowrap", texto }));
      }
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
    const encabezados = [tx("puesto"), tx("nro"), tx("nombre"), tx("institucion"), tx("fed"), "Elo", tx("pts")]
      .concat(v.desempates);
    const anchos = [1, 1, 3, 2.2, 1, 1, 1].concat(v.desempates.map(() => 1));
    const filasTabla = filas.map((f) => {
      const j = jugador(f.id);
      return [String(f.puesto), String(num.get(f.id)), j.nombre + (j.titulo ? " (" + j.titulo + ")" : ""),
        j.institucion || "", j.fed || "", Number(j.elo) > 0 ? String(j.elo) : "", puntosTexto(f.puntos)]
        .concat(v.desempates.map((c) => valorDesempate(c, f.valores[c])));
    });
    const notas = v.desempates.map((c) => {
      const info = E.catalogo(v).find((x) => x.codigo === c);
      return info ? c + ": " + info[idioma] : c;
    });
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
    const letra = idioma === "en" ? { w: "w", b: "b" } : { w: "b", b: "n" };
    const encabezados = [tx("puesto"), tx("nro"), tx("nombre"), "Elo"]
      .concat(Array.from({ length: R }, (_, r) => tx("rCorta", { r: r + 1 }))).concat([tx("pts")]);
    const anchos = [1, 1, 3, 1].concat(Array.from({ length: R }, () => 1)).concat([1]);
    const filasTabla = filas.map((f) => {
      const j = jugador(f.id);
      const celdas = [];
      for (let r = 0; r < R; r++) {
        const s = T.situacion(v, r, f.id);
        let texto;
        if (s.tipo === "bye") texto = tx("cBye") + " " + puntosTexto(s.puntos);
        else if (s.tipo === "ausente") texto = (s.codigo === "Z" ? "-" : tx("cBye")) + (s.puntos ? " " + puntosTexto(s.puntos) : "");
        else if (s.tipo === "pendiente") texto = num.get(s.rival) + letra[s.color] + " *";
        else texto = num.get(s.rival) + letra[s.color] + " " + (s.codigo === "=" ? "1/2" : s.codigo);
        celdas.push(texto);
      }
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
      await window.PareoPDF.bajar(datosFn(), window.PareoPDF.nombreArchivo(v.nombre, sufijo));
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
    const ya = estado.lista.filter((x) => { const y = leerJSON(PREFIJO + x.id, null); return y && y.evento && y.evento.id === datos.evento.id; });
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
    $("pi-form-torneo").addEventListener("change", alCambiarTorneo);
    $("pi-config-jde-aplicar").addEventListener("click", aplicarConfigJde);
    $("pi-form-torneo").addEventListener("submit", (e) => e.preventDefault());
    $("pi-desempate-agregar").addEventListener("click", () => {
      const c = $("pi-desempate-nuevo").value;
      if (!c) return;
      t().desempates.push(c);
      guardar();
      pintarDesempates();
      $("pi-desempate-nuevo").focus();
    });

    $("pi-form-jugador").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      const d = datosJugador(Object.fromEntries(new FormData(f)));
      if (!d.nombre) { Avisos.avisar(tx("faltaNombre"), { tipo: "error" }); f.elements.nombre.focus(); return; }
      agregarJugadores([d]);
      f.reset();
      f.elements.nombre.focus();
    });
    $("pi-pegar-agregar").addEventListener("click", () => {
      const lineas = $("pi-pegar").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const lista = lineas.map((l) => {
        const [nombre, institucion, elo, titulo, fed, fideId, categoria] = l.split(/\t|;/).map((x) => x.trim());
        return datosJugador({ nombre, institucion, elo, titulo, fed, fideId, categoria });
      });
      const n = agregarJugadores(lista);
      if (n) { $("pi-pegar").value = ""; Avisos.avisar(tx("agregados", { n })); }
      else Avisos.avisar(tx("nadaQueAgregar"), { tipo: "error" });
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
    if (location.hash.startsWith("#capitan=")) {
      modoVer();
      PareoVer.iniciarCapitan(location.hash.slice(9), idioma);
      return;
    }
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
    avisarPestanas();
    if (location.hash.startsWith("#recibir=")) recibirEvento(location.hash.slice(9));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
