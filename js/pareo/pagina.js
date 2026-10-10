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
  const X = window.PareoTextos;
  const motor = window.PareoMotor.enNavegador("js/pareo/motor-worker.js");

  const CLAVE_LISTA = "pareo_lista_v1";
  const CLAVE_IDIOMA = "pareo_idioma_v1";
  const CLAVE_FICHA = "pareo_ficha_v1";
  const PREFIJO = "pareo_torneo_v1_";

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

  const estado = { lista: leerJSON(CLAVE_LISTA, []), id: null, t: null, ficha: leer(CLAVE_FICHA) || "jugadores", ronda: null, filtroInstitucion: "", eloPendientes: [] };

  function nuevoId() { return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function idJugador() { return "j" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function guardar() {
    if (!estado.t) return;
    if (!escribir(PREFIJO + estado.id, JSON.stringify(estado.t))) {
      Avisos.avisar(tx("noGuarda"), { tipo: "error" });
    }
    const item = estado.lista.find((x) => x.id === estado.id);
    const nombre = estado.t.nombre || "";
    if (item) { item.nombre = nombre; item.actualizado = Date.now(); }
    else estado.lista.push({ id: estado.id, nombre, actualizado: Date.now() });
    escribir(CLAVE_LISTA, JSON.stringify(estado.lista));
    escribir("pareo_abierto_v1", estado.id);
  }

  function abrir(id) {
    const t = leerJSON(PREFIJO + id, null);
    if (!t) return false;
    estado.id = id;
    estado.t = T.nuevo(t);
    estado.ronda = null;
    estado.filtroInstitucion = "";
    estado.eloPendientes = [];
    escribir("pareo_abierto_v1", id);
    return true;
  }

  function crear(t) {
    estado.id = nuevoId();
    estado.t = t || T.nuevo({ fechaInicio: window.HoraCR ? HoraCR.hoy() : "" });
    estado.ronda = null;
    estado.filtroInstitucion = "";
    estado.eloPendientes = [];
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

  function pintarLista() {
    const s = $("pi-lista");
    s.replaceChildren();
    const lista = estado.lista.slice().sort((a, b) => b.actualizado - a.actualizado);
    for (const x of lista) s.append(el("option", { value: x.id, texto: x.nombre || tx("sinNombre") }));
    s.value = estado.id;
  }

  function pintarPanel() {
    ({ torneo: pintarTorneo, jugadores: pintarJugadores, rondas: pintarRondas,
      clasificacion: pintarClasificacion, cruzada: pintarCruzada, archivos: () => {} })[estado.ficha]();
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
    pintarDesempates();
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
      const info = D.CATALOGO.find((x) => x.codigo === c);
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
    for (const x of D.CATALOGO) if (!lista.includes(x.codigo)) s.append(el("option", { value: x.codigo, texto: x[idioma] + " (" + x.codigo + ")" }));
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
    $("pi-cuenta").textContent = v.jugadores.length;
    $("pi-sin-jugadores").hidden = v.jugadores.length > 0;
    $("pi-orden-ayuda").textContent = tx(Array.isArray(v.numeracion) ? "ordenFijo" : "ordenAyuda");
    pintarEloPendientes();
    if (!v.jugadores.length) return;
    tabla.append(el("thead", {}, el("tr", {},
      el("th", { class: "num", scope: "col", texto: tx("nro") }), el("th", { scope: "col", texto: tx("nombre") }),
      el("th", { scope: "col", texto: tx("institucion") }), el("th", { scope: "col", texto: tx("categoria") }),
      el("th", { scope: "col", texto: tx("titulo") }), el("th", { class: "num", scope: "col", texto: "Elo" }),
      el("th", { scope: "col", texto: tx("fed") }), el("th", { scope: "col", texto: tx("fideId") }),
      el("th", { class: "num", scope: "col", texto: tx("pts") }), el("th", { scope: "col", texto: tx("estado") }),
      el("th", { scope: "col", texto: tx("acciones") }))));
    const cuerpo = el("tbody");
    const enUnaMesa = new Set();
    for (const R of v.rondas) for (const m of R.mesas) { enUnaMesa.add(m.b); if (m.n) enUnaMesa.add(m.n); }
    for (const id of orden) {
      const j = jugador(id);
      const retirado = j.retiradoDespuesDe != null;
      cuerpo.append(el("tr", {},
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
          enUnaMesa.has(id) || v.rondas.length
            ? el("button", { type: "button", class: C.mini, "aria-label": tx(retirado ? "volverA" : "retirarA", { n: j.nombre }), onclick: () => retirar(id) }, tx(retirado ? "volver" : "retirar"))
            : el("button", { type: "button", class: C.miniPeligro, "aria-label": tx("eliminarA", { n: j.nombre }), onclick: () => eliminar(id) }, tx("eliminar"))
        )));
    }
    tabla.append(cuerpo);
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
    institucion: "institucion", colegio: "institucion", escuela: "institucion",
    club: "institucion", institution: "institucion", school: "institucion",
    elo: "elo", rating: "elo",
    titulo: "titulo", title: "titulo",
    fed: "fed", federacion: "fed", pais: "fed", country: "fed", federation: "fed",
    fideid: "fideId", "fide id": "fideId", "id fide": "fideId",
    "codigo fide": "fideId", "fide code": "fideId",
    categoria: "categoria", category: "categoria", nivel: "categoria", division: "categoria",
  };
  const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  // La primera fila es cabecera si reconoce al menos la columna "nombre"
  // (con cualquiera de sus etiquetas); si no, se lee en ORDEN_LISTA y la
  // primera fila es ya un jugador. Nunca se adivina a medias: o se reconoce
  // el nombre, o se cae al orden fijo entero.
  function columnasDeLista(primeraFila) {
    const mapa = {};
    (primeraFila || []).forEach((celda, i) => {
      const campo = SINONIMOS_COLUMNA[sinTildes(celda)];
      if (campo && mapa[campo] == null) mapa[campo] = i;
    });
    return mapa.nombre != null ? mapa : null;
  }

  function filasAJugadores(filas) {
    if (!filas || !filas.length) return [];
    const conCabecera = columnasDeLista(filas[0]);
    const mapa = conCabecera || Object.fromEntries(ORDEN_LISTA.map((campo, i) => [campo, i]));
    const datos = conCabecera ? filas.slice(1) : filas;
    return datos.map((fila) => datosJugador({
      nombre: mapa.nombre != null ? fila[mapa.nombre] : "",
      institucion: mapa.institucion != null ? fila[mapa.institucion] : "",
      elo: mapa.elo != null ? fila[mapa.elo] : "",
      titulo: mapa.titulo != null ? fila[mapa.titulo] : "",
      fed: mapa.fed != null ? fila[mapa.fed] : "",
      fideId: mapa.fideId != null ? fila[mapa.fideId] : "",
      categoria: mapa.categoria != null ? fila[mapa.categoria] : "",
    })).filter((d) => d.nombre);
  }

  async function subirLista(archivo) {
    const estadoEl = $("pi-subir-lista-estado");
    if (archivo.size > 5 * 1024 * 1024) { Avisos.avisar(tx("archivoGrande"), { tipo: "error" }); return; }
    const nombreArch = (archivo.name || "").toLowerCase();
    estadoEl.textContent = tx("leyendoArchivo");
    try {
      let filas;
      if (nombreArch.endsWith(".docx")) filas = await window.ReporteTextos.filasDeDocx(archivo);
      else if (nombreArch.endsWith(".doc")) { estadoEl.textContent = ""; Avisos.avisar(tx("archivoDocAntiguo"), { tipo: "error" }); return; }
      else filas = (await window.ReporteExcel.leer(archivo)).filas;
      estadoEl.textContent = "";
      const lista = filasAJugadores(filas);
      if (!lista.length) { Avisos.avisar(tx("archivoSinJugadores"), { tipo: "error" }); return; }
      const n = agregarJugadores(lista);
      if (n) Avisos.avisar(tx("agregados", { n }));
      else Avisos.avisar(tx("nadaQueAgregar"), { tipo: "error" });
    } catch (err) {
      estadoEl.textContent = "";
      Avisos.avisar(tx("noAbre", { e: err.message }), { tipo: "error" });
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
    boton.disabled = true;
    estadoEl.textContent = tx("buscandoElo");
    const r = await window.PareoEloNacional.buscar(faltantes.map((j) => j.nombre));
    boton.disabled = false;
    estadoEl.textContent = "";
    if (!r || r.ok === false) { Avisos.avisar((r && r.error) || tx("eloNacionalError"), { tipo: "error" }); return; }
    // Por índice, no por nombre: dos jugadores con el mismo nombre piden la
    // misma búsqueda pero son personas distintas, y el bolsillo de palabras
    // los mezclaría. La función contesta en el mismo orden en que se le manda.
    const resultados = r.resultados || [];
    let n = 0;
    const pendientes = [];
    faltantes.forEach((j, i) => {
      const res = resultados[i];
      if (res && res.estado === "encontrado" && Number(res.nacional) > 0) { j.elo = res.nacional; n++; }
      else pendientes.push({ id: j.id, nombre: j.nombre, estado: (res && res.estado) || "no_encontrado" });
    });
    if (n) guardar();
    estado.eloPendientes = pendientes;
    pintarJugadores();
    Avisos.avisar(tx("eloNacionalResultado", { n: n, total: faltantes.length }));
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
    const num = T.numeros(v);
    const antes = (id) => T.puntosHasta(v, id, r);
    const pendientes = R.mesas.filter((m) => m.n && !m.r).length;
    const ultima = r === v.rondas.length - 1;
    caja.append(el("div", { class: "flex flex-wrap items-baseline justify-between gap-3 mb-3" },
      el("h2", { class: "font-serif text-xl font-bold", texto: tx("emparejamientosRonda", { r: r + 1 }) + (v.nombre ? " — " + v.nombre : "") }),
      el("div", { class: "flex flex-wrap gap-2 no-imprimir" },
        el("button", { type: "button", class: C.botonSec, onclick: () => window.print() }, tx("imprimir")),
        el("button", { type: "button", class: C.botonSec, onclick: () => imprimirPlantillaMesas(r) }, tx("plantillaMesas")),
        ultima ? el("button", { type: "button", class: C.miniPeligro + " px-3 py-2", onclick: () => deshacerRonda(r) }, tx("deshacerRonda")) : null)));
    caja.append(el("p", { class: C.nota + " mb-3 no-imprimir", role: "status", texto: pendientes ? tx("faltanResultados", { n: pendientes }) : tx("rondaCompleta") }));
    if (!ultima) caja.append(el("p", { class: C.nota + " mb-3 no-imprimir", texto: tx("avisoCorregir") }));

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
      const sel = el("select", { class: C.campoChico, "aria-label": tx("resultadoMesa", { m: i + 1, b: nombreDe(m.b), n: nombreDe(m.n) }) });
      for (const [val, clave] of RESULTADOS) sel.append(el("option", { value: val, texto: tx(clave) }));
      sel.value = m.r || "";
      sel.addEventListener("change", () => {
        m.r = sel.value || null;
        guardar();
        const quedan = R.mesas.filter((x) => x.n && !x.r).length;
        const estadoTxt = caja.querySelector('[role="status"]');
        if (estadoTxt) estadoTxt.textContent = quedan ? tx("faltanResultados", { n: quedan }) : tx("rondaCompleta");
        if (!quedan) pintarRondasNav();
      });
      cuerpo.append(el("tr", {},
        el("td", { class: "num", texto: i + 1 }), el("td", { class: "num", texto: num.get(m.b) }),
        el("td", { class: "font-semibold", texto: nombreDe(m.b) }), el("td", { class: "num", texto: puntosTexto(antes(m.b)) }),
        el("td", { class: "text-center" }, sel, el("span", { class: "pi-solo-imprimir", texto: m.r ? tx("corto_" + m.r) : "" })),
        el("td", { class: "num", texto: puntosTexto(antes(m.n)) }), el("td", { class: "font-semibold", texto: nombreDe(m.n) }),
        el("td", { class: "num", texto: num.get(m.n) })));
    });
    tabla.append(cuerpo);
    caja.append(el("div", { class: "overflow-x-auto" }, tabla));

    // Quienes no jugaron esta ronda: byes pedidos, retirados, inscritos después.
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
    cont.replaceChildren(el("h1", { class: "pi-plantilla-titulo" },
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
    document.body.classList.add("pi-imprimiendo-plantilla");
    window.print();
  }

  // El afterprint llega sea que se imprima o se cancele: ahí se limpia, una
  // sola vez para toda la página (no hace falta re-engancharlo).
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("pi-imprimiendo-plantilla");
    const cont = $("pi-plantilla");
    if (cont) cont.replaceChildren();
  });

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
        noViene.addEventListener("click", () => { s.value = s.value === "Z" ? "" : "Z"; s.dispatchEvent(new Event("change")); });
        actualizarNoViene();
        ul.append(el("li", { class: "flex items-center justify-between gap-2" }, el("span", { class: "text-sm", texto: num.get(id) + ". " + j.nombre }), el("div", { class: "flex items-center gap-1" }, s, noViene)));
      }
      caja.append(ul);
    }
    const boton = el("button", { type: "button", class: C.boton }, tx("emparejarRonda", { r: r + 1 }));
    const msg = el("p", { class: "mt-3 text-sm", role: "status", "aria-live": "polite" });
    boton.addEventListener("click", async () => {
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
        boton.disabled = false;
      }
    });
    caja.append(boton, msg);
  }

  async function emparejar(r, pedidas) {
    const v = t();
    if (v.rondas.length !== r) throw new Error(tx("yaEmparejada"));
    if (r === 0 && !Array.isArray(v.numeracion)) T.fijarNumeracion(v);
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
    guardar();
    estado.ronda = r;
    pintarRondas();
  }

  // Las mismas filas de D.clasificacion(), acotadas a la institución elegida
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
    const todasFilas = D.clasificacion(tc, v.desempates);
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
      v.desempates.map((c) => el("th", { class: "num", scope: "col" }, el("abbr", { title: (D.CATALOGO.find((x) => x.codigo === c) || {})[idioma], texto: c }))))));
    const cuerpo = el("tbody");
    for (const f of filas) {
      const j = jugador(f.id);
      cuerpo.append(el("tr", {},
        el("td", { class: "num", texto: f.puesto }), el("td", { class: "num", texto: num.get(f.id) }),
        el("td", { class: "font-semibold", texto: j.nombre + (j.titulo ? " (" + j.titulo + ")" : "") }),
        el("td", { texto: j.institucion || "" }),
        el("td", { texto: j.fed || "" }), el("td", { class: "num", texto: Number(j.elo) > 0 ? j.elo : "" }),
        el("td", { class: "num font-bold", texto: puntosTexto(f.puntos) }),
        v.desempates.map((c) => el("td", { class: "num", texto: formatoNum(f.valores[c]) }))));
    }
    tabla.append(cuerpo);
    const dl = $("pi-clas-leyenda");
    dl.replaceChildren();
    for (const c of v.desempates) {
      const info = D.CATALOGO.find((x) => x.codigo === c);
      if (info) dl.append(el("div", {}, el("dt", { class: "inline font-semibold", texto: c + ": " }), el("dd", { class: "inline", texto: info[idioma] })));
    }
  }

  // ---------- Tabla cruzada ----------
  function pintarCruzada() {
    const v = t();
    pintarSelectInstitucion($("pi-cruzada-institucion"));
    const tabla = $("pi-tabla-cruzada");
    tabla.replaceChildren();
    if (!v.jugadores.length) return;
    const k = rondasCompletas();
    const todasFilas = D.clasificacion(hasta(k), v.desempates);
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
    const todasFilas = D.clasificacion(hasta(k), v.desempates);
    const filas = filasFiltradas(todasFilas);
    const num = T.numeros(v);
    const encabezados = [tx("puesto"), tx("nro"), tx("nombre"), tx("institucion"), tx("fed"), "Elo", tx("pts")]
      .concat(v.desempates);
    const anchos = [1, 1, 3, 2.2, 1, 1, 1].concat(v.desempates.map(() => 1));
    const filasTabla = filas.map((f) => {
      const j = jugador(f.id);
      return [String(f.puesto), String(num.get(f.id)), j.nombre + (j.titulo ? " (" + j.titulo + ")" : ""),
        j.institucion || "", j.fed || "", Number(j.elo) > 0 ? String(j.elo) : "", puntosTexto(f.puntos)]
        .concat(v.desempates.map((c) => formatoNum(f.valores[c])));
    });
    const notas = v.desempates.map((c) => {
      const info = D.CATALOGO.find((x) => x.codigo === c);
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
    const todasFilas = D.clasificacion(hasta(k), v.desempates);
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
    $("pi-lista").addEventListener("change", (e) => { if (abrir(e.target.value)) pintarTodo(); });
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

    $("pi-form-torneo").addEventListener("change", alCambiarTorneo);
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
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (f) subirLista(f);
    });
    $("pi-elo-nacional").addEventListener("click", buscarEloNacional);
    $("pi-clas-institucion").addEventListener("change", (e) => { estado.filtroInstitucion = e.target.value; pintarClasificacion(); });
    $("pi-cruzada-institucion").addEventListener("change", (e) => { estado.filtroInstitucion = e.target.value; pintarCruzada(); });
    $("pi-clas-pdf").addEventListener("click", () => bajarPDF($("pi-clas-pdf"), datosClasificacionPDF, "clasificacion"));
    $("pi-cruzada-pdf").addEventListener("click", () => bajarPDF($("pi-cruzada-pdf"), datosCruzadaPDF, "cruzada"));

    document.querySelectorAll(".pi-imprimir").forEach((b) => b.addEventListener("click", () => window.print()));
    $("pi-bajar-trf").addEventListener("click", () => {
      try { bajar(nombreArchivo(".trf"), trfDelTorneo()); }
      catch (e) { Avisos.avisar(e.message, { tipo: "error" }); }
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
    if (!FICHAS.includes(estado.ficha)) estado.ficha = "jugadores";
    const ultimo = leer("pareo_abierto_v1");
    if (!(ultimo && abrir(ultimo))) {
      const otro = estado.lista.slice().sort((a, b) => b.actualizado - a.actualizado)[0];
      if (!(otro && abrir(otro.id))) crear();
    }
    enganchar();
    pintarTodo();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
