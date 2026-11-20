/* Pareo Integral: configurar el formulario de inscripción de un torneo
 * (pareo.html, ficha Archivos, «Inscripción antes del torneo»).
 *
 * Lo que se arma acá queda en `t.inscripcionEvento` —aparte de
 * `t.inscripcion`, que la casilla «Recibir inscripciones» reescribe entera—
 * y se publica con el torneo dentro de `datos.inscripcion`
 * (PareoPublicar.datosPublicos). Con eso, js/inscripcion-evento.js arma el
 * formulario de torneos-pareo.html, y la Edge Function pareo-publicar
 * vuelve a comprobar el cierre, lo obligatorio y la categoría por año
 * (supabase/functions/pareo-publicar/inscripcion.ts).
 *
 * Sin configuración (todo como viene), el torneo publica { abierta, hasta }
 * y el formulario es el de siempre: «Volver al formulario de siempre» borra
 * la configuración entera.
 *
 * La vista previa monta el formulario de verdad (InscripcionEvento.montar)
 * con un freno: el envío se ataja antes de llegar al formulario, así que
 * desde la vista previa nunca se manda una inscripción.
 *
 * Ver «La inscripción configurable por evento» en
 * docs/decisiones/cuentas-y-formularios.md.
 */
(function (raiz) {
  "use strict";

  const MAX_CATEGORIAS = 12;
  // Los campos que se configuran, en el orden del formulario. `oblig`: si
  // la función sabe exigirlo (inscripcion.ts, revisar()).
  const CAMPOS = [
    { k: "nacimiento", oblig: true },
    { k: "sexo", oblig: true },
    { k: "institucion", oblig: true },
    { k: "categoria", oblig: false },
    { k: "elo", oblig: false },
    { k: "fide", oblig: false },
    { k: "nota", oblig: true },
  ];
  // Lo que pide el formulario de siempre (CAMPOS de js/inscripcion-evento.js).
  const DE_SIEMPRE = { nacimiento: "no", sexo: "no", institucion: "si", categoria: "si", elo: "si", fide: "si", nota: "si" };

  // Al guardar, el torneo se vuelve a publicar y la ficha se redibuja
  // (pintarPublicar): sin esto la caja se cerraría y el foco se perdería
  // después de cada cambio. Se recuerda por torneo publicado.
  const memoria = {};
  const recuerdo = (v) => (memoria[(v.publicado && v.publicado.id) || "-"] = memoria[(v.publicado && v.publicado.id) || "-"] || { abierta: false, previa: false, foco: "" });

  const esObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  const anio = (v) => (Number.isInteger(Number(v)) && Number(v) >= 1900 && Number(v) <= 2100 ? Number(v) : 0);

  /* La configuración que se guarda, a partir de lo que dicen los controles.
     Solo lleva lo que se aparta de lo de siempre; sin nada, null. */
  function armar(d) {
    const c = {};
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d.cierre || "")) c.cierre = d.cierre;
    const cats = (d.categorias || [])
      .map((x) => ({ nombre: String(x.nombre || "").trim().slice(0, 30), desde: anio(x.desde), hasta: anio(x.hasta), juegaEn: String(x.juegaEn || "").trim().slice(0, 30) }))
      .filter((x) => x.nombre && x.desde && x.hasta && x.desde <= x.hasta)
      .slice(0, MAX_CATEGORIAS)
      .map((x) => (x.juegaEn ? x : { nombre: x.nombre, desde: x.desde, hasta: x.hasta }));
    if (cats.length) c.categorias = cats;
    if (d.ramaEnCategoria) c.ramaEnCategoria = true;
    const campos = {};
    for (const { k } of CAMPOS) {
      const modo = (d.campos || {})[k] || DE_SIEMPRE[k];
      const x = {};
      if (modo !== DE_SIEMPRE[k]) { x.pedir = modo !== "no"; x.obligatorio = modo === "obligatorio"; }
      if (k === "institucion" && String(d.institucionDefecto || "").trim()) x.defecto = String(d.institucionDefecto).trim().slice(0, 100);
      if (k === "fide" && d.fideBuscar) x.buscar = true;
      if (Object.keys(x).length) campos[k] = x;
    }
    if (d.nombreForma === "apellidos") campos.nombre = { forma: "apellidos" };
    if (Object.keys(campos).length) c.campos = campos;
    if (String(d.notaFija || "").trim()) c.notaFija = String(d.notaFija).trim().slice(0, 200);
    if (d.idioma === "en") c.idioma = "en";
    return Object.keys(c).length ? c : null;
  }

  /* Al revés: lo que muestran los controles para una configuración guardada. */
  function leer(cfg) {
    const c = esObj(cfg) ? cfg : {};
    const campos = esObj(c.campos) ? c.campos : {};
    const modo = (k) => {
      const x = esObj(campos[k]) ? campos[k] : {};
      if (x.obligatorio) return "obligatorio";
      if (x.pedir === true) return "si";
      if (x.pedir === false) return "no";
      return DE_SIEMPRE[k];
    };
    return {
      cierre: typeof c.cierre === "string" ? c.cierre : "",
      categorias: Array.isArray(c.categorias) ? c.categorias.filter(esObj).map((x) => ({ nombre: x.nombre || "", desde: x.desde || "", hasta: x.hasta || "", juegaEn: x.juegaEn || "" })) : [],
      ramaEnCategoria: c.ramaEnCategoria === true,
      campos: Object.fromEntries(CAMPOS.map(({ k }) => [k, modo(k)])),
      institucionDefecto: esObj(campos.institucion) && campos.institucion.defecto ? campos.institucion.defecto : "",
      fideBuscar: esObj(campos.fide) && campos.fide.buscar === true,
      nombreForma: esObj(campos.nombre) && campos.nombre.forma === "apellidos" ? "apellidos" : "uno",
      notaFija: typeof c.notaFija === "string" ? c.notaFija : "",
      idioma: c.idioma === "en" ? "en" : "es",
    };
  }

  /* La caja plegable que va dentro de «Inscripción antes del torneo».
     `o`: { v (el torneo), torneo() (el de ahora), el, tx, C, alCambiar() }. */
  function caja(o) {
    const { v, el, tx, C } = o;
    // El torneo de AHORA: la página puede cambiar el objeto entre un
    // redibujo y otro, y lo que se escribe tiene que ir al que se guarda.
    const tor = () => (typeof o.torneo === "function" && o.torneo()) || v;
    const mem = recuerdo(v);
    // El borrador de antes del redibujo, si todavía dice lo mismo que lo
    // guardado: así no se pierde una categoría a medio escribir (sin año
    // todavía no entra en la configuración).
    const igualA = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
    const volverAlFoco = () => {
      if (!mem.foco) return;
      const foco = mem.foco;
      setTimeout(() => {
        const a = document.activeElement;
        const n = document.getElementById(foco);
        if (n && (!a || a === document.body || !a.isConnected)) n.focus();
      }, 0);
    };
    // La misma caja de antes, con lo que se estaba escribiendo, si es el
    // mismo torneo y nada cambió por fuera: la ficha la vuelve a poner en su lugar.
    if (mem.nodo && mem.texto === tx("icTitulo") && mem.d && igualA(armar(mem.d), v.inscripcionEvento)) {
      volverAlFoco();
      return mem.nodo;
    }
    const d = mem.d && igualA(armar(mem.d), v.inscripcionEvento) ? mem.d : leer(v.inscripcionEvento);
    mem.d = d;
    const id = (s) => "pi-ic-" + s;

    const aviso = el("p", { id: id("estado"), class: C.nota + " mt-2", role: "status" });
    const cambio = () => {
      const cfg = armar(d);
      const x = tor();
      if (cfg) x.inscripcionEvento = cfg; else delete x.inscripcionEvento;
      pintarResumen();
      pintarNotaCategorias();
      if (!previa.hidden) pintarPrevia();
      o.alCambiar();
    };

    // El cierre con hora (la de Costa Rica: el campo no lleva zona y la
    // función lo lee como hora de Costa Rica).
    const cierre = el("input", { id: id("cierre"), type: "datetime-local", class: C.campoChico, value: d.cierre });
    cierre.addEventListener("change", () => { d.cierre = cierre.value; cambio(); });

    // Las categorías por año de nacimiento.
    const filasCat = el("div", { id: id("categorias"), class: "grid gap-2 mt-2" });
    const notaCat = el("p", { id: id("nota-categorias"), class: C.nota + " mt-2" });
    const agregarCat = el("button", { type: "button", id: id("agregar-categoria"), class: C.mini }, tx("icAgregarCategoria"));
    function pintarCategorias(foco) {
      filasCat.replaceChildren(...d.categorias.map((x, i) => {
        const campo = (clave, tipo, etiqueta, extra) => {
          const n = el("input", Object.assign({ id: id("cat-" + clave + "-" + i), type: tipo, class: C.campoChico, value: x[clave] === undefined ? "" : String(x[clave]), "data-cat": clave }, extra || {}));
          n.addEventListener("change", () => { x[clave] = tipo === "number" ? n.value : n.value; cambio(); });
          return el("label", { class: "grid gap-1 text-xs font-semibold", for: n.id }, etiqueta, n);
        };
        const quitar = el("button", { type: "button", class: C.miniPeligro, "data-quitar-categoria": String(i), "aria-label": tx("icQuitarCategoriaA", { n: x.nombre || i + 1 }) }, tx("icQuitar"));
        quitar.addEventListener("click", () => {
          d.categorias.splice(i, 1);
          pintarCategorias(Math.min(i, d.categorias.length - 1));
          cambio();
        });
        return el("div", { class: "pi-ic-categoria flex flex-wrap items-end gap-2 pb-2 border-b border-brand-100 dark:border-brand-800 last:border-b-0", "data-categoria": String(i) },
          campo("nombre", "text", tx("icCatNombre"), { maxlength: "30", placeholder: "U12" }),
          campo("desde", "number", tx("icCatDesde"), { min: "1900", max: "2100", inputmode: "numeric" }),
          campo("hasta", "number", tx("icCatHasta"), { min: "1900", max: "2100", inputmode: "numeric" }),
          campo("juegaEn", "text", tx("icCatJuegaEn"), { maxlength: "30" }),
          quitar);
      }));
      agregarCat.disabled = d.categorias.length >= MAX_CATEGORIAS;
      if (foco != null && foco >= 0) { const n = document.getElementById(id("cat-nombre-" + foco)); if (n) n.focus(); }
      else if (foco === -1) agregarCat.focus();
    }
    agregarCat.addEventListener("click", () => {
      d.categorias.push({ nombre: "", desde: "", hasta: "", juegaEn: "" });
      pintarCategorias(d.categorias.length - 1);
    });
    const rama = el("input", { type: "checkbox", id: id("rama"), class: "mt-1", checked: d.ramaEnCategoria });
    rama.addEventListener("change", () => { d.ramaEnCategoria = rama.checked; cambio(); });

    // Qué se pide y qué es obligatorio.
    const selects = {};
    const filasCampos = CAMPOS.map(({ k, oblig }) => {
      const s = el("select", { id: id("campo-" + k), class: C.campoChico, "data-campo": k },
        el("option", { value: "no", texto: tx("icNoSePide") }),
        el("option", { value: "si", texto: tx("icSePide") }),
        oblig ? el("option", { value: "obligatorio", texto: tx("icObligatorio") }) : null);
      s.value = d.campos[k];
      s.addEventListener("change", () => { d.campos[k] = s.value; cambio(); });
      selects[k] = s;
      return el("div", { class: "flex flex-wrap items-center justify-between gap-2 text-sm" },
        el("label", { for: s.id, class: "font-semibold", texto: tx("icCampo_" + k) }), s);
    });
    const nombreForma = el("select", { id: id("nombre-forma"), class: C.campoChico },
      el("option", { value: "uno", texto: tx("icNombreUno") }),
      el("option", { value: "apellidos", texto: tx("icNombreApellidos") }));
    nombreForma.value = d.nombreForma;
    nombreForma.addEventListener("change", () => { d.nombreForma = nombreForma.value; cambio(); });
    const defecto = el("input", { id: id("institucion-defecto"), type: "text", class: C.campoChico, maxlength: "100", value: d.institucionDefecto });
    defecto.addEventListener("change", () => { d.institucionDefecto = defecto.value; cambio(); });
    const fideBuscar = el("input", { type: "checkbox", id: id("fide-buscar"), class: "mt-1", checked: d.fideBuscar });
    fideBuscar.addEventListener("change", () => { d.fideBuscar = fideBuscar.checked; cambio(); });

    // Con categorías por año, la fecha de nacimiento decide: se pide sí o sí
    // y la categoría ya no se elige a mano (normalizar() de inscripcion-evento.js).
    function pintarNotaCategorias() {
      const hay = !!(tor().inscripcionEvento && tor().inscripcionEvento.categorias);
      notaCat.textContent = hay ? tx("icConCategorias") : tx("icSinCategorias");
      selects.nacimiento.disabled = hay;
      selects.categoria.disabled = hay;
      if (hay) { selects.nacimiento.value = "obligatorio"; selects.categoria.value = "no"; }
      else { selects.nacimiento.value = d.campos.nacimiento; selects.categoria.value = d.campos.categoria; }
    }

    const notaFija = el("textarea", { id: id("nota-fija"), class: C.campo + " mt-1", rows: "2", maxlength: "200" });
    notaFija.value = d.notaFija;
    notaFija.addEventListener("change", () => { d.notaFija = notaFija.value; cambio(); });
    const idioma = el("select", { id: id("idioma"), class: C.campoChico },
      el("option", { value: "es", texto: "Español" }), el("option", { value: "en", texto: "English" }));
    idioma.value = d.idioma;
    idioma.addEventListener("change", () => { d.idioma = idioma.value; cambio(); });

    // La vista previa: el formulario de verdad, sin poder mandarlo.
    const previa = el("div", { id: id("previa"), class: "pi-ic-previa mt-3", hidden: true });
    const verPrevia = el("button", { type: "button", id: id("ver-previa"), class: C.botonSec, "aria-expanded": "false", "aria-controls": previa.id }, tx("icVerPrevia"));
    previa.addEventListener("submit", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const est = previa.querySelector('[role="status"]');
      if (est) est.textContent = tx("icPreviaNoManda");
    }, true);
    function pintarPrevia() {
      previa.replaceChildren(el("p", { class: "pi-ic-previa-cinta text-xs font-semibold mb-2", texto: tx("icPreviaCinta") }));
      if (!raiz.InscripcionEvento) { previa.append(el("p", { class: C.nota, texto: tx("icPreviaNoHay") })); return; }
      // Abierta siempre en la vista previa, para ver los campos aunque el
      // torneo todavía no reciba inscripciones o ya haya cerrado.
      const cfg = Object.assign({}, tor().inscripcionEvento || {}, { abierta: true, hasta: "", cierre: "" });
      raiz.InscripcionEvento.montar(previa, raiz.InscripcionEvento.desdePublicado(cfg, { prefijo: "pi-iv", torneo: tor().publicado || "vista-previa", clase: "rounded-2xl bg-white dark:bg-brand-900 p-4" }));
    }
    verPrevia.addEventListener("click", () => {
      const abrir = previa.hidden;
      previa.hidden = !abrir;
      verPrevia.setAttribute("aria-expanded", String(abrir));
      verPrevia.textContent = tx(abrir ? "icOcultarPrevia" : "icVerPrevia");
      mem.previa = abrir;
      if (abrir) pintarPrevia();
    });

    // Volver al formulario de siempre: borra toda la configuración.
    const deSiempre = el("button", { type: "button", id: id("de-siempre"), class: C.miniPeligro }, tx("icDeSiempre"));
    deSiempre.addEventListener("click", async () => {
      if (!tor().inscripcionEvento) { aviso.textContent = tx("icYaDeSiempre"); return; }
      const ok = await Avisos.confirmar(tx("icDeSiempreTexto"), { titulo: tx("icDeSiempreTitulo"), aceptar: tx("icDeSiempreSi"), peligro: true });
      if (!ok) { deSiempre.focus(); return; }
      Object.assign(d, leer(null));
      cierre.value = ""; rama.checked = false; defecto.value = ""; fideBuscar.checked = false; notaFija.value = ""; idioma.value = "es"; nombreForma.value = "uno";
      for (const { k } of CAMPOS) selects[k].value = d.campos[k];
      pintarCategorias(null);
      cambio();
      aviso.textContent = tx("icVolvioDeSiempre");
      deSiempre.focus();
    });

    // El resumen en la línea de arriba: qué tiene de distinto este torneo.
    const resumen = el("span", { id: id("resumen"), class: "font-normal text-sm" });
    function pintarResumen() {
      const c = tor().inscripcionEvento;
      if (!c) { resumen.textContent = " · " + tx("icResumenSiempre"); return; }
      const partes = [];
      if (c.categorias) partes.push(tx("icResumenCategorias", { n: c.categorias.length }));
      if (c.cierre) partes.push(tx("icResumenCierre", { f: c.cierre.slice(8, 10) + "/" + c.cierre.slice(5, 7) + " " + c.cierre.slice(11) }));
      if (c.campos) partes.push(tx("icResumenCampos"));
      resumen.textContent = " · " + (partes.length ? partes.join(" · ") : tx("icResumenOtros"));
    }

    const grupo = (titulo, ...hijos) => el("fieldset", { class: "pi-revisar pi-ic-grupo mt-3" }, el("legend", { class: "pi-revisar-titulo px-1", texto: titulo }), ...hijos);
    const caja = el("details", { id: id("caja"), class: "pi-ic mt-3" },
      el("summary", { class: "font-semibold cursor-pointer" }, tx("icTitulo"), resumen),
      el("p", { class: C.nota + " mt-2", texto: tx("icAyuda") }),
      grupo(tx("icCierreTitulo"),
        el("div", { class: "flex flex-wrap items-center gap-2 text-sm mt-1" }, el("label", { for: cierre.id, texto: tx("icCierre") }), cierre),
        el("p", { class: C.nota + " mt-1", texto: tx("icCierreAyuda") })),
      grupo(tx("icCategoriasTitulo"), notaCat, filasCat, el("div", { class: "mt-2" }, agregarCat),
        el("div", { class: "flex items-start gap-2 text-sm mt-2" }, rama, el("label", { for: rama.id, texto: tx("icRama") }))),
      grupo(tx("icCamposTitulo"),
        el("div", { class: "max-w-xl" },
          el("div", { class: "flex flex-wrap items-center justify-between gap-2 text-sm" }, el("label", { for: nombreForma.id, class: "font-semibold", texto: tx("icCampo_nombre") }), nombreForma),
          el("div", { class: "grid gap-2 mt-2" }, filasCampos)),
        el("div", { class: "flex flex-wrap items-center gap-2 text-sm mt-3" }, el("label", { for: defecto.id, texto: tx("icInstitucionDefecto") }), defecto),
        el("div", { class: "flex items-start gap-2 text-sm mt-2" }, fideBuscar, el("label", { for: fideBuscar.id, texto: tx("icFideBuscar") }))),
      grupo(tx("icOtrosTitulo"),
        el("label", { for: notaFija.id, class: "text-sm", texto: tx("icNotaFija") }), notaFija,
        el("div", { class: "flex flex-wrap items-center gap-2 text-sm mt-2" }, el("label", { for: idioma.id, texto: tx("icIdioma") }), idioma)),
      el("div", { class: "mt-3 flex flex-wrap gap-2" }, verPrevia, deSiempre),
      aviso, previa);

    caja.addEventListener("toggle", () => { mem.abierta = caja.open; });
    // Dónde estaba quien configura, para devolverle el foco después de redibujar.
    caja.addEventListener("focusin", (e) => { if (e.target.id && e.target.id.startsWith("pi-ic-")) mem.foco = e.target.id; });
    pintarCategorias(null);
    pintarNotaCategorias();
    pintarResumen();
    if (mem.abierta) caja.open = true;
    if (mem.previa) { previa.hidden = false; verPrevia.setAttribute("aria-expanded", "true"); verPrevia.textContent = tx("icOcultarPrevia"); pintarPrevia(); }
    volverAlFoco();
    mem.nodo = caja; mem.texto = tx("icTitulo");
    return caja;
  }

  const api = { armar, leer, caja, CAMPOS, DE_SIEMPRE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.PareoInscripcionConfig = api;
})(typeof self !== "undefined" ? self : this);

/*! rev bfb5bbb0d2d82f9f */
