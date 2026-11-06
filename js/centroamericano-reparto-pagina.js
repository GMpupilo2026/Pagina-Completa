/* «Los árbitros en la sala», debajo del plano en centroamericano-mesas.html.
 *
 * Lee el plano que se está editando (js/centroamericano-plano-editor.js), los
 * enlaces vigentes de los árbitros, las incidencias de cada torneo
 * (centroamericano_reparto_tasas()) y los tableros en juego (sala-jugadores);
 * con eso analiza cómo está cubierta la sala hoy, sugiere zonas
 * (js/centroamericano-reparto.js) y, al aprobar, cambia las mesas de todos en
 * una sola transacción (centroamericano_reparto_aplicar()). La tablet de cada
 * árbitro lee su rango de la base en cada pedido, así que lo ve en segundos.
 * Ver «El reparto de los árbitros desde el plano» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const SALA = "centroamericano-2026";
  const $ = (id) => document.getElementById(id);
  const R = () => window.CentroamericanoReparto;
  const avisar = (texto, error) => (window.Avisos ? window.Avisos.avisar(texto, { tipo: error ? "error" : "ok" }) : null);
  const num = (v, d = 1) => (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString("es-CR");

  let vigentes = [];      // asignaciones activas (también las que terminaron la ronda)
  let arbitros = [];      // uno por persona (o por enlace suelto)
  let elegidos = null;    // Set de claves que entran al reparto
  const conocidos = new Set();
  let nombreTorneo = new Map();
  let propuesta = null;   // zonas con su árbitro
  let ctx = null;         // { tnrDe, enJuego, tasas }
  let plano = null;

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

  /* ---------------- lo que se lee ---------------- */

  async function cargarArbitros() {
    const [{ data, error }, { data: ts }] = await Promise.all([
      window.sb.from("centroamericano_asignaciones")
        .select("id, tnr, arbitro, nombrado, persona, mesa_desde, mesa_hasta, vence, revocada, concluyo_en, experiencia")
        .eq("revocada", false).gt("vence", new Date().toISOString()).range(0, 499),
      window.sb.from("centroamericano_torneos").select("tnr, nombre").range(0, 199),
    ]);
    if (error) throw error;
    nombreTorneo = new Map((ts || []).map((t) => [t.tnr, t.nombre]));
    // Quien tocó «Ya terminé mis labores» sigue en la sala: eso vale por ronda y se reabre solo con la siguiente.
    vigentes = (data || []).map((a) => Object.assign({}, a, { torneo: nombreDe(a.tnr) }));
    arbitros = R().arbitrosDe(vigentes).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }

  async function cargarContexto() {
    const editor = window.CentroamericanoPlanoEditor;
    const est = editor && editor.estado();
    plano = est && est.plano ? window.CentroamericanoPlano.limpiar(est.plano) : null;
    const [{ data: sala }, { data: filas, error: e2 }] = await Promise.all([
      window.sb.from("salas_torneo").select("enlaces, plano").eq("clave", SALA).maybeSingle(),
      window.sb.rpc("centroamericano_reparto_tasas"),
    ]);
    if (!plano && sala) plano = window.CentroamericanoPlano.limpiar(sala.plano);
    if (e2) throw e2;
    const tnrDe = R().tnrPorTexto(sala && sala.enlaces);
    let enJuego = null;
    try {
      const porTexto = await editor.tablerosPorTorneo();
      enJuego = new Map();
      porTexto.forEach((n, texto) => { const tnr = tnrDe.get(texto); if (tnr && n > 0) enJuego.set(tnr, n); });
    } catch (e) { enJuego = null; /* sin chess-results: cuentan todas las mesas del plano */ }
    ctx = { tnrDe, enJuego, tasas: R().tasas(filas || []) };
  }

  // El nombre de un torneo: el de la base, o el del plano si la base no lo tiene.
  const nombreDe = (tnr) => {
    if (nombreTorneo.has(tnr)) return nombreTorneo.get(tnr);
    if (ctx) for (const [texto, t] of ctx.tnrDe) if (t === tnr) return texto;
    return tnr;
  };

  const tnrsDelPlano = () => {
    const s = new Set();
    (plano ? plano.filas : []).forEach((f) => f.grupos.forEach((g) => { const t = ctx && ctx.tnrDe.get(g.torneo); if (t) s.add(t); }));
    return s;
  };

  /* ---------------- los árbitros ---------------- */

  function pintarArbitros() {
    const caja = $("rs-arbitros");
    if (!arbitros.length) { caja.replaceChildren(el("p", { class: "cam-nota-vacia" }, "No hay enlaces de árbitros vigentes. Créalos en la pestaña de los árbitros.")); return; }
    const delPlano = ctx ? tnrsDelPlano() : null;
    // Por omisión entran los que tienen mesas en algún torneo del plano; lo que se tocó a mano se respeta,
    // y un árbitro que aparece después (un enlace nuevo) recibe la misma regla.
    if (!elegidos) elegidos = new Set();
    // Sin plano todavía, la marca es provisional (todos) y se decide cuando lo haya.
    const hayPlano = delPlano && delPlano.size;
    arbitros.forEach((a) => {
      if (conocidos.has(a.clave)) return;
      if (!hayPlano) { elegidos.add(a.clave); return; }
      conocidos.add(a.clave);
      if (a.tramos.some((t) => delPlano.has(t.tnr))) elegidos.add(a.clave); else elegidos.delete(a.clave);
    });
    const filas = arbitros.map((a) => {
      const id = "rs-a-" + a.clave;
      return el("tr", {},
        el("td", {}, el("label", { class: "flex items-center gap-2 font-semibold" },
          el("input", { type: "checkbox", id, checked: elegidos.has(a.clave), onchange: (ev) => { conocidos.add(a.clave); if (ev.target.checked) elegidos.add(a.clave); else elegidos.delete(a.clave); limpiarPropuesta(); } }),
          a.nombre)),
        el("td", {}, el("select", { class: "cam-select", "aria-label": "Experiencia de " + a.nombre, onchange: (ev) => ponerExperiencia(a, ev.target.value) },
          el("option", { value: "", selected: a.experiencia == null }, "Sin dato"),
          R().NIVELES.map((n) => el("option", { value: String(n.v), selected: a.experiencia === n.v }, n.texto)))),
        el("td", {}, a.tramos.map((t) => nombreDe(t.tnr) + " " + t.desde + "–" + t.hasta).join(" · ")));
    });
    caja.replaceChildren(el("div", { class: "cam-tabla-envoltura" }, el("table", { class: "cam-tabla" },
      el("caption", { class: "text-left font-bold" }, "Quiénes entran al reparto y su experiencia"),
      el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Árbitro"), el("th", { scope: "col" }, "Experiencia"), el("th", { scope: "col" }, "Mesas que tiene hoy"))),
      el("tbody", {}, filas))));
  }

  async function ponerExperiencia(a, valor) {
    const v = valor === "" ? null : parseInt(valor, 10);
    const ids = vigentes.filter((x) => (x.persona || x.id) === a.clave).map((x) => x.id);
    const { error } = await window.sb.from("centroamericano_asignaciones").update({ experiencia: v }).in("id", ids);
    if (error) { avisar("No se guardó la experiencia: " + error.message, true); return; }
    a.experiencia = v;
    vigentes.forEach((x) => { if (ids.indexOf(x.id) !== -1) x.experiencia = v; });
    limpiarPropuesta();
  }

  function limpiarPropuesta() {
    propuesta = null;
    $("rs-aprobar").disabled = true;
    $("rs-zonas").replaceChildren();
    $("rs-dibujo").replaceChildren();
    $("rs-estado").textContent = "Cambió algo: vuelve a pedir la sugerencia.";
  }

  /* ---------------- el análisis de hoy ---------------- */

  // Cómo está cubierta la sala con los enlaces de hoy: mesas sin árbitro, con dos, y la carga de cada uno.
  function analisisDeHoy(items, lista) {
    const delPlano = tnrsDelPlano();
    let sin = 0, dobles = 0, enJuego = 0;
    const carga = new Map(lista.map((a) => [a.clave, 0]));
    items.forEach((x) => x.tableros.forEach((t) => {
      if (!x.tnr) return;
      const tope = ctx.enJuego && ctx.enJuego.has(x.tnr) ? ctx.enJuego.get(x.tnr) : Infinity;
      if (t > tope) return;
      enJuego++;
      const quienes = lista.filter((a) => a.tramos.some((r) => r.tnr === x.tnr && t >= r.desde && t <= r.hasta));
      if (!quienes.length) sin++;
      if (quienes.length > 1) dobles++;
      quienes.forEach((a) => carga.set(a.clave, carga.get(a.clave) + (1 + R().PESO_INCIDENCIA * x.tasa) / quienes.length));
    }));
    const cargas = [...carga.values()];
    return { sin, dobles, enJuego, max: Math.max(0, ...cargas), min: cargas.length ? Math.min(...cargas) : 0, delPlano };
  }

  function pintarAnalisis(items, lista, zs) {
    const hoy = analisisDeHoy(items, lista);
    const cargas = zs.map((z) => z.carga);
    const max = Math.max(...cargas), min = Math.min(...cargas);
    const porTasa = [...ctx.tasas.por.entries()].filter(([tnr, t]) => hoy.delPlano.has(tnr) && t.partidas > 0).sort((a, b) => b[1].tasa - a[1].tasa);
    const tasaTexto = ([tnr, t]) => nombreDe(tnr) + ": " + t.incidencias + " en " + t.partidas + " partidas";
    const puntos = [
      "En juego: " + hoy.enJuego + " tableros en " + items.filter((x) => x.jugando).length + " mesas del plano, para " + lista.length + (lista.length === 1 ? " árbitro" : " árbitros") + " (unas " + num(hoy.enJuego / Math.max(1, lista.length), 0) + " partidas por cabeza).",
      hoy.sin || hoy.dobles
        ? "Con los enlaces de hoy: " + (hoy.sin ? hoy.sin + (hoy.sin === 1 ? " tablero en juego sin árbitro" : " tableros en juego sin árbitro") : "ningún tablero sin árbitro") + " y " + (hoy.dobles ? hoy.dobles + (hoy.dobles === 1 ? " con dos árbitros" : " con dos árbitros") : "ninguno con dos") + "."
        : "Con los enlaces de hoy, cada tablero en juego tiene un árbitro.",
      "Carga de trabajo por árbitro (partidas pesadas por incidencias): hoy va de " + num(hoy.min) + " a " + num(hoy.max) + "; con la sugerencia, de " + num(min) + " a " + num(max) + ".",
      porTasa.length ? "Más incidencias por partida: " + porTasa.slice(0, 3).map(tasaTexto).join(" · ") + "." + (porTasa.length > 4 ? " Menos: " + porTasa.slice(-2).map(tasaTexto).join(" · ") + "." : "") : "Todavía no hay incidencias anotadas: todas las mesas pesan lo mismo.",
    ];
    if (!ctx.enJuego) puntos.push("No se pudo leer la ronda en chess-results: se cuentan todas las mesas del plano como en juego.");
    $("rs-analisis").replaceChildren(el("h4", { class: "font-bold text-lg" }, "Cómo está la sala"), el("ul", { class: "list-disc pl-6" }, puntos.map((p) => el("li", {}, p))));
  }

  /* ---------------- la sugerencia ---------------- */

  async function sugerir() {
    const boton = $("rs-sugerir");
    boton.disabled = true;
    $("rs-estado").textContent = "Leyendo los árbitros, las incidencias y la ronda…";
    try {
      await Promise.all([cargarArbitros(), cargarContexto()]);
    } catch (e) {
      boton.disabled = false;
      $("rs-estado").textContent = "No se pudo leer lo necesario (" + (e.message || "sin conexión") + "). Inténtalo otra vez.";
      return;
    }
    boton.disabled = false;
    pintarArbitros();
    if (!plano || !plano.filas.length) { $("rs-estado").textContent = "Primero arma y guarda el plano de arriba: el reparto sale de él."; return; }
    const malos = window.CentroamericanoPlano.problemas(plano);
    if (malos.length) { $("rs-estado").textContent = "El plano tiene un problema: " + malos[0]; return; }
    const lista = arbitros.filter((a) => elegidos.has(a.clave));
    if (!lista.length) { $("rs-estado").textContent = "Marca al menos un árbitro."; return; }
    const items = R().recorrido(plano, ctx);
    const zs = R().zonas(plano, ctx, lista.length);
    propuesta = R().asignar(zs, lista, { seguir: $("rs-seguir").checked ? R().SEGUIR : 0 });
    pintarAnalisis(items, lista, zs);
    pintarPropuesta();
    const d = window.CentroamericanoPlano.dudas(plano);
    $("rs-estado").textContent = (zs.length < lista.length ? "Hay más árbitros que mesas en juego: " + (lista.length - zs.length) + " quedan sin zona. " : "")
      + (d ? "Ojo: el plano tiene " + d + " mesas sin revisar; el reparto usa los números que tiene ahora. " : "")
      + "Revisa la sugerencia y apruébala cuando estés de acuerdo.";
  }

  function pintarPropuesta() {
    const zonas = new Map();
    propuesta.forEach((z) => z.mesas.forEach((x) => zonas.set(x.fi + "-" + x.gi + "-" + x.mi, z.n)));
    const svg = window.CentroamericanoPlano.dibujar(plano, { zonas });
    if (svg) svg.setAttribute("aria-label", "Plano de la sala con las " + propuesta.length + " zonas de los árbitros. La lista de abajo dice lo mismo.");
    $("rs-dibujo").replaceChildren(svg || "");
    const opciones = (z) => arbitros.filter((a) => elegidos.has(a.clave)).map((a) => el("option", { value: a.clave, selected: z.arbitro && z.arbitro.clave === a.clave }, a.nombre + " · " + R().textoNivel(a.experiencia)));
    const filas = propuesta.map((z) => el("tr", {},
      el("th", { scope: "row" }, "Z" + z.n),
      el("td", {}, el("select", { class: "cam-select", "aria-label": "Árbitro de la zona " + z.n, onchange: (ev) => cambiarArbitro(z, ev.target.value) }, opciones(z))),
      el("td", {}, "Fila " + z.filas.join(", ") + ": " + z.tramos.map((t) => t.torneo + " " + t.desde + "–" + t.hasta).join(" · ")),
      el("td", {}, z.partidas + " partidas · ≈ " + num(z.esperadas) + " incidencias por ronda · carga " + num(z.carga)),
      el("td", {}, z.porque)));
    $("rs-zonas").replaceChildren(el("div", { class: "cam-tabla-envoltura" }, el("table", { class: "cam-tabla" },
      el("caption", { class: "text-left font-bold" }, "La sugerencia, zona por zona"),
      el("thead", {}, el("tr", {}, ["Zona", "Árbitro", "Mesas", "Trabajo", "Por qué"].map((t) => el("th", { scope: "col" }, t)))),
      el("tbody", {}, filas))));
    $("rs-aprobar").disabled = !propuesta.some((z) => z.arbitro);
  }

  // Cambiar a mano el árbitro de una zona: se intercambia con la zona que lo tenía.
  function cambiarArbitro(z, clave) {
    const nuevo = arbitros.find((a) => a.clave === clave);
    const otra = propuesta.find((y) => y !== z && y.arbitro && y.arbitro.clave === clave);
    if (otra) otra.arbitro = z.arbitro;
    z.arbitro = nuevo;
    [z, otra].forEach((y) => { if (y) y.porque = "Elegido a mano" + (y.arbitro ? ": " + y.arbitro.nombre + " (" + R().textoNivel(y.arbitro.experiencia) + ")." : "."); });
    pintarPropuesta();
  }

  /* ---------------- aprobar ---------------- */

  async function aprobar() {
    if (!propuesta) return;
    const { acciones, resumen, fuera } = R().cambios(propuesta, vigentes, tnrsDelPlano());
    if (!acciones.length) { avisar("La sugerencia es igual a lo que ya tienen: no hay nada que cambiar."); return; }
    const lineas = resumen.filter((r) => r.lineas.some((l) => !/\(igual\)$/.test(l))).map((r) => "Z" + r.zona + " · " + r.arbitro + ": " + r.lineas.join("; ") + ".");
    const texto = lineas.concat(fuera.map((f) => f + " (no entra al reparto).")).join("\n")
      + "\n\nCada árbitro ve sus mesas nuevas en su tablet en unos segundos; si tenía abierto un torneo que ya no le toca, la tablet lo pasa sola al nuevo. Conviene hacerlo entre rondas.";
    const sigue = await window.Avisos.confirmar(texto, { titulo: "Aprobar el reparto (" + acciones.length + (acciones.length === 1 ? " cambio)" : " cambios)"), aceptar: "Sí, cambiar las mesas" });
    if (!sigue) return;
    const boton = $("rs-aprobar");
    boton.disabled = true;
    const { data, error } = await window.sb.rpc("centroamericano_reparto_aplicar", { p_acciones: acciones });
    if (error) { boton.disabled = false; avisar("No se cambió nada: " + (error.message || "inténtalo de nuevo."), true); return; }
    await avisarALosArbitros(resumen);
    avisar("Listo: " + data.actualizados + " tramos cambiados, " + data.creados + " nuevos y " + data.apagados + " apagados.");
    propuesta = null;
    await sugerir();
    document.dispatchEvent(new CustomEvent("cac-reparto-aplicado"));
  }

  // A cada árbitro que le cambió algo, un aviso en su tablet con sus mesas nuevas.
  async function avisarALosArbitros(resumen) {
    try { await cargarArbitros(); } catch (e) { return; }
    const filas = [];
    resumen.forEach((r) => {
      if (!r.lineas.some((l) => !/\(igual\)$/.test(l))) return;
      const fila = vigentes.find((x) => x.id === r.queda) || (r.persona ? vigentes.find((x) => x.persona === r.persona) : null);
      if (!fila) return;
      filas.push({ de: "organizacion", asignacion_id: fila.id, texto: "Tus mesas cambiaron (zona " + r.zona + " del plano): " + r.lineas.filter((l) => !/^se apaga/.test(l)).map((l) => l.replace(/ \(.*\)$/, "")).join("; ") + "." });
    });
    if (filas.length) await window.sb.from("centroamericano_avisos").insert(filas);
  }

  // Al abrir la pestaña: la lista de árbitros, marcados los que tienen mesas en algún torneo del plano.
  let abierta = false;
  async function abrir() {
    if (abierta) return;
    abierta = true;
    try {
      const [, { data: sala }] = await Promise.all([cargarArbitros(), window.sb.from("salas_torneo").select("enlaces, plano").eq("clave", SALA).maybeSingle()]);
      const est = window.CentroamericanoPlanoEditor && window.CentroamericanoPlanoEditor.estado();
      plano = window.CentroamericanoPlano.limpiar((est && est.plano) || (sala && sala.plano));
      ctx = ctx || { tnrDe: R().tnrPorTexto(sala && sala.enlaces), enJuego: null, tasas: R().tasas([]) };
      pintarArbitros();
    } catch (e) { abierta = false; }
  }

  function iniciar() {
    if (!$("rs-sala")) return;
    const panel = $("panel-plano");
    if (panel) new MutationObserver(() => { if (!panel.hidden) abrir(); }).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    if (panel && !panel.hidden) abrir();
    $("rs-sugerir").addEventListener("click", sugerir);
    $("rs-aprobar").addEventListener("click", aprobar);
    $("rs-seguir").addEventListener("change", () => { if (propuesta) sugerir(); });
  }
  iniciar();
  window.CentroamericanoRepartoPagina = { sugerir, aprobar, estado: () => ({ propuesta, arbitros, elegidos, ctx }) };
})();

/*! rev bfb5bbb0d2d82f9f */
