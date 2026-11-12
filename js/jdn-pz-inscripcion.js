/* La inscripción de la Eliminatoria Cantonal JDN de Pérez Zeledón 2026
 * (jdn-pz-2026.html, la ventana #inscribirme) y sus fichas de resultados.
 *
 * El torneo se dirige en Pareo Integral, sin chess-results: dos torneos, U12
 * y U20 (con la U16), publicados por la organización ADAPZ. Este módulo:
 *
 * 1. ENCUENTRA LOS DOS TORNEOS SOLO, sin tocar el código: la organización
 *    de Pareo Integral que se llama como la ADAPZ y tiene el sello
 *    «Organizador verificado» (lo pone solo administración: así nadie la
 *    suplanta creando otra con el mismo nombre), y de sus torneos, el más
 *    nuevo con «U12» en el nombre y el más nuevo con «U20» (o «U16»). Lo lee
 *    con la clave anónima: pareo_organizadores y pareo_publicados son de
 *    lectura pública (sus políticas dejan fuera lo oculto).
 * 2. LAS FICHAS «Resultados U12» y «Resultados U20» pasan de la lista de
 *    torneos de Pareo a la página de su torneo (torneos-pareo.html#t=<id>),
 *    que js/ventana-enlace.js abre encima.
 * 3. EL FORMULARIO: con la fecha de nacimiento elige la categoría (U12:
 *    2015 a 2020; U16: 2011 a 2014; U20: 2007 a 2010, como dicen las bases) y
 *    el torneo (U16 y U20 van juntos), y manda la inscripción con
 *    PareoPublicar.inscribir (js/pareo/publicar.js, la misma de
 *    torneos-pareo.html) a la función pareo-publicar. Ahí queda pendiente
 *    hasta que el árbitro la acepta en Pareo Integral: entonces entra sola a
 *    la lista del torneo, con su sexo y su fecha de nacimiento.
 *
 * Solo se manda si el torneo tiene la inscripción abierta en Pareo
 * («Recibir inscripciones desde la página pública») y antes del cierre de
 * las bases (10:00 p.m. del 21 de noviembre, hora de Costa Rica); la función
 * lo vuelve a comprobar (la fecha «hasta» de Pareo). Nada de lo escrito se
 * guarda en el navegador.
 *
 * Ver «La inscripción de la Eliminatoria Cantonal JDN de Pérez Zeledón» en
 * docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  // La organización: su nombre en Pareo, sin tildes ni mayúsculas.
  const ORGANIZACION = /\badapz\b|asociacion deportiva de ajedrez de perez zeledon/;
  // Las categorías de las bases: [nombre, año desde, año hasta, torneo].
  const CATEGORIAS = [["U12", 2015, 2020, "U12"], ["U16", 2011, 2014, "U20"], ["U20", 2007, 2010, "U20"]];
  const TORNEOS = { U12: /\b(u|sub)[\s-]?12\b/, U20: /\b(u|sub)[\s-]?(20|16)\b/ };
  // El cierre de las bases: 10:00 p.m. del 21 de noviembre de 2026 en Costa Rica (UTC−6).
  const CIERRE = new Date("2026-11-21T22:00:00-06:00");

  const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const hoyCR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
  const torneos = { U12: null, U20: null };

  function categoriaDe(fecha) {
    const anio = /^\d{4}-\d{2}-\d{2}$/.test(fecha || "") ? Number(fecha.slice(0, 4)) : 0;
    return CATEGORIAS.find(([, desde, hasta]) => anio >= desde && anio <= hasta) || null;
  }

  // ¿Recibe inscripciones hoy? Lo que Pareo publica: { abierta, hasta }.
  function abierta(t) {
    const i = t && t.inscripcion;
    return !!(i && i.abierta === true && !(typeof i.hasta === "string" && i.hasta && i.hasta < hoyCR()));
  }

  async function buscarTorneos() {
    const sb = window.sb;
    if (!sb) throw new Error("sin cliente");
    const { data: orgs, error: e1 } = await sb.from("pareo_organizadores").select("id, nombre").eq("verificado", true);
    if (e1) throw e1;
    const ids = (orgs || []).filter((o) => ORGANIZACION.test(sinTildes(o.nombre))).map((o) => o.id);
    if (!ids.length) return;
    const { data, error } = await sb.from("pareo_publicados").select("id, nombre, creado, inscripcion:datos->inscripcion")
      .in("organizador_id", ids).order("creado", { ascending: false }).range(0, 199);
    if (error) throw error;
    for (const t of data || []) {
      const n = sinTildes(t.nombre);
      for (const k of Object.keys(TORNEOS)) if (!torneos[k] && TORNEOS[k].test(n)) torneos[k] = t;
    }
  }

  function pintarFichas() {
    for (const k of Object.keys(TORNEOS)) {
      const a = $("ficha-resultados-" + k.toLowerCase());
      if (a && torneos[k]) a.setAttribute("href", "torneos-pareo.html#t=" + torneos[k].id);
    }
  }

  // Lo que dice arriba del formulario y si el botón se puede tocar.
  function pintarEstado() {
    const estado = $("insc-estado-torneos");
    const cat = categoriaDe($("insc-nacimiento").value);
    const caja = $("insc-categoria");
    const t = cat && torneos[cat[3]];
    if (!torneos.U12 && !torneos.U20) estado.textContent = "La inscripción todavía no está abierta: la organización está preparando los torneos en Pareo Integral. Vuelve a intentarlo más tarde.";
    else if (new Date() >= CIERRE) estado.textContent = "Las inscripciones cerraron a las 10:00 p.m. del 21 de noviembre.";
    else estado.textContent = "Inscripción abierta hasta las 10:00 p.m. del sábado 21 de noviembre.";
    if (!$("insc-nacimiento").value) caja.textContent = "";
    else if (!cat) caja.textContent = "Con esa fecha de nacimiento no entra en ninguna categoría: la eliminatoria es para nacidos de 2007 a 2020.";
    else if (!t) caja.textContent = "Categoría " + cat[0] + ". El torneo " + cat[3] + " todavía no está listo en Pareo Integral.";
    else if (!abierta(t)) caja.textContent = "Categoría " + cat[0] + ". El torneo " + cat[3] + " no está recibiendo inscripciones en este momento.";
    else caja.textContent = "Categoría " + cat[0] + (cat[3] !== cat[0] ? ": juega en el torneo " + cat[3] + "." : ".");
    $("insc-enviar").disabled = !(t && abierta(t) && new Date() < CIERRE);
  }

  const valor = (id) => $(id).value.trim();
  // «Apellidos, Nombre», como en las listas de FIDE y en Pareo.
  const nombreCompleto = () => valor("insc-apellidos").replace(/\s+/g, " ") + ", " + valor("insc-nombre").replace(/\s+/g, " ");

  async function mandar(e) {
    e.preventDefault();
    const est = $("insc-estado");
    const cat = categoriaDe($("insc-nacimiento").value);
    const sexo = (document.querySelector('input[name="sexo"]:checked') || {}).value || "";
    const falta = !valor("insc-apellidos") || !valor("insc-nombre") ? "Escribe los apellidos y el nombre de quien juega."
      : !cat ? "Revisa la fecha de nacimiento: la eliminatoria es para nacidos de 2007 a 2020."
      : !sexo ? "Elige la rama: Absoluto o Femenino."
      : valor("insc-fide") && !/^\d{1,12}$/.test(valor("insc-fide")) ? "El ID FIDE son solo números."
      : valor("insc-elo") && !/^\d{3,4}$/.test(valor("insc-elo")) ? "El Elo son 3 o 4 números."
      : valor("insc-responsable").length < 2 || valor("insc-contacto").length < 5 ? "Escribe quién inscribe y un correo o teléfono para contactarle."
      : !$("insc-afiliado").checked ? "Las bases piden estar afiliado a la ADAPZ y al día: marca la casilla si es así."
      : !$("insc-consentimiento").checked ? "Falta aceptar la política de privacidad." : "";
    if (falta) { est.textContent = falta; return; }
    const t = torneos[cat[3]];
    if (!t || !abierta(t) || new Date() >= CIERRE) { pintarEstado(); est.textContent = "La inscripción de este torneo no está abierta."; return; }
    const boton = $("insc-enviar");
    boton.disabled = true;
    est.textContent = "Mandando la inscripción…";
    const r = await window.PareoPublicar.inscribir(t.id, {
      nombre: nombreCompleto(), institucion: valor("insc-institucion"), categoria: cat[0] + (sexo === "F" ? " Femenino" : " Absoluto"),
      elo: valor("insc-elo") ? Number(valor("insc-elo")) : 0, fideId: valor("insc-fide"), sexo, nacimiento: $("insc-nacimiento").value,
      responsable: valor("insc-responsable"), contacto: valor("insc-contacto"),
      nota: "Declara estar afiliado a la ADAPZ y al día. Inscrito desde la página de la eliminatoria.",
    });
    if (!r || !r.ok) {
      boton.disabled = false;
      est.textContent = (r && r.error) || "No se pudo mandar: revisa la conexión e intenta de nuevo.";
      return;
    }
    est.textContent = "¡Listo! La inscripción de " + valor("insc-nombre") + " " + valor("insc-apellidos") + " llegó al torneo " + cat[3]
      + ". Queda pendiente hasta que el árbitro la apruebe; entonces aparece en «Resultados " + cat[3] + "».";
    // Para inscribir a otro: se borra lo de quien juega; quien inscribe se queda.
    ["insc-apellidos", "insc-nombre", "insc-nacimiento", "insc-institucion", "insc-fide", "insc-elo"].forEach((id) => { $(id).value = ""; });
    document.querySelectorAll('input[name="sexo"]').forEach((x) => { x.checked = false; });
    $("insc-afiliado").checked = false;
    pintarEstado();
  }

  function iniciar() {
    if (!$("insc-form")) return;
    $("insc-nacimiento").addEventListener("input", pintarEstado);
    $("insc-nacimiento").addEventListener("change", pintarEstado);
    $("insc-form").addEventListener("submit", mandar);
    buscarTorneos().then(() => { pintarFichas(); pintarEstado(); }, () => {
      $("insc-estado-torneos").textContent = "No pudimos buscar los torneos en Pareo Integral ahora mismo. Revisa la conexión y vuelve a abrir esta ventana.";
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();

  // Para las pruebas: la categoría por la fecha y si un torneo recibe inscripciones.
  window.JdnPzInscripcion = { categoriaDe, abierta, ORGANIZACION, TORNEOS };
})();

/*! rev bfb5bbb0d2d82f9f */
