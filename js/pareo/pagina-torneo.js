/* ===== Pareo Integral — la página (pareo.html): la ficha «Torneo» =====
 *
 * Los datos y el ritmo del torneo, su enlace en vivo, el plazo de la alineación, la configuración fija
 * de los JDE (etapa, grupo) y los desempates.
 *
 * Es una parte de la página de Pareo Integral, que se partió por zonas el
 * 20/11/2026 (ver «Pareo Integral: la página partida por zonas» en
 * docs/decisiones/juegos-y-torneos.md). Lo de las otras partes llega por
 * window.PareoPagina: arriba, lo de las que ya cargaron; como Pagina.<nombre>,
 * lo de las que cargan después.
 */
(function () {
  "use strict";

  const Pagina = window.PareoPagina;
  const { T, G, E, V, C, $, el, tx, estado, guardar, t, pintarLista, VALIDO_ELO, PROVINCIAS, horaCR } = Pagina;

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
    $("pi-campo-baku").hidden = T.fijo(v) || v.sistema === "keizer";
    $("pi-campo-doble").hidden = !T.fijo(v) || v.sistema === "eliminacion";
    // La doble eliminación y el tercer puesto son de la eliminación directa;
    // con doble eliminación el tercero sale solo de la llave de perdedores.
    f.elements.dobleEliminacion.checked = !!v.dobleEliminacion;
    f.elements.tercerPuesto.checked = !!v.tercerPuesto;
    $("pi-campo-doble-elim").hidden = v.sistema !== "eliminacion";
    $("pi-campo-tercer").hidden = v.sistema !== "eliminacion" || !!v.dobleEliminacion;
    f.elements.dobleEliminacion.disabled = f.elements.tercerPuesto.disabled = v.rondas.length > 0;
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
    Pagina.pintarSugerencia();
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
        if (vivo) Pagina.apagarEventoVivo(); else if (!(await Pagina.prenderEventoVivo(ev))) return;
      } else if (vivo) { $("pi-ver-en-vivo").checked = false; Pagina.desactivarEnVivo(); }
      else { $("pi-ver-en-vivo").checked = true; if (!(await Pagina.activarEnVivo())) return; }
      pintarVivoTorneo();
      $("pi-tv-boton").focus();
    });
    caja.append(el("h3", { class: "font-semibold", texto: tx(ev ? "eventoVivoTitulo" : "vivoTorneoTitulo") }),
      el("p", { class: C.nota + " mt-1", texto: tx(ev ? "eventoVivoTexto" : "vivoTorneoTexto") }), el("div", { class: "mt-2" }, b), qr);
    if (!vivo) return;
    if (ev) { Pagina.mostrarQrEvento(qr, "pi-tv"); return; }
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
    const limite = Pagina.limiteAlineacion(v);
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
    if (n === "sistema") {
      if (v.rondas.length === 0) {
        v.sistema = e.target.value;
        // En un Keizer la lista se ordena por sus puntos: van primero, con lo
        // que vale cada uno. Al salir del Keizer, se van.
        const sin = (v.desempates || []).filter((c) => c !== "KZ" && c !== "KV");
        v.desempates = v.sistema === "keizer" ? "KZ,KV".split(",").concat(sin) : sin;
      }
    }
    else if (n === "dobleEliminacion" || n === "tercerPuesto") { if (v.rondas.length === 0) v[n] = e.target.checked; }
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
    if (n === "sistema" || n === "dobleEliminacion") pintarTorneo();
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
        el("span", { class: "flex-1 min-w-[10rem]" }, el("span", { class: "font-semibold", texto: info[Pagina.idioma] }), " ",
          el("span", { class: "text-xs text-brand-600 dark:text-brand-300", texto: "(" + c + ")" })),
        el("button", { type: "button", class: C.mini + " pi-sube", disabled: fija || i === 0, "aria-label": tx("subir", { n: info[Pagina.idioma] }), onclick: mover(-1) }, "↑"),
        el("button", { type: "button", class: C.mini + " pi-baja", disabled: fija || i === lista.length - 1, "aria-label": tx("bajar", { n: info[Pagina.idioma] }), onclick: mover(1) }, "↓"),
        el("button", { type: "button", class: C.miniPeligro, disabled: fija, "aria-label": tx("quitarDesempate", { n: info[Pagina.idioma] }), onclick: () => { lista.splice(i, 1); guardar(); pintarDesempates(); $("pi-desempate-nuevo").focus(); } }, tx("quitar"))
      ));
    });
    if (!lista.length) ol.append(el("li", { class: C.nota + " italic", texto: tx("sinDesempates") }));
    const s = $("pi-desempate-nuevo");
    s.replaceChildren();
    for (const x of E.catalogo(t())) if (!lista.includes(x.codigo)) s.append(el("option", { value: x.codigo, texto: x[Pagina.idioma] + " (" + x.codigo + ")" }));
    s.disabled = fija;
    $("pi-desempate-agregar").disabled = fija || !s.options.length;
  }

  Object.assign(Pagina, { pintarTorneo, configFija, configuracionPara, TEXTO_ETAPA, pedirEtapaJde,
    nombreConGrupo, aplicarConfigJde, alCambiarTorneo, pintarDesempates });
})();

/*! rev bfb5bbb0d2d82f9f */
