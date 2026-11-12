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
 * la organización (10:00 p.m. del viernes 20 de noviembre, hora de Costa Rica); la función
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
  // El cierre: 10:00 p.m. del viernes 20 de noviembre de 2026 en Costa Rica (UTC−6). Las bases decían el
  // sábado 21; la organización lo adelantó (el dueño, el 12/11/2026).
  const CIERRE = new Date("2026-11-20T22:00:00-06:00");

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

  // La ficha «Pronto» (sin enlace) pasa a ser el enlace a SU torneo, que
  // js/ventana-enlace.js abre encima (escucha los clics de toda la página).
  // Sin el torneo se queda «Pronto»: nunca lleva a la lista de Pareo, que
  // trae los torneos de otros (lo pidió el dueño).
  function pintarFichas() {
    for (const k of Object.keys(TORNEOS)) {
      const vieja = $("ficha-resultados-" + k.toLowerCase());
      if (!vieja || !torneos[k] || vieja.tagName === "A") continue;
      const a = document.createElement("a");
      a.id = vieja.id;
      a.href = "torneos-pareo.html#t=" + torneos[k].id;
      a.dataset.ventana = "Resultados " + k;
      a.dataset.color = vieja.dataset.color;
      a.className = vieja.className.replace("bg-white/70 dark:bg-brand-900/70 border-2 border-dashed border-brand-300 dark:border-brand-700", "bg-white dark:bg-brand-900 shadow-md");
      const partes = [...vieja.children];
      const fin = document.createElement("span");
      fin.className = "mt-auto pt-3 sm:pt-4 text-xs sm:text-sm font-bold cac-accion";
      fin.textContent = "Ver el torneo " + k + " →";
      a.append(...partes.slice(0, -1), fin);
      vieja.replaceWith(a);
    }
  }

  // Lo que dice arriba del formulario y si el botón se puede tocar.
  function pintarEstado() {
    const estado = $("insc-estado-torneos");
    const cat = categoriaDe($("insc-nacimiento").value);
    const caja = $("insc-categoria");
    const t = cat && torneos[cat[3]];
    if (!torneos.U12 && !torneos.U20) estado.textContent = "La inscripción todavía no está abierta: la organización está preparando los torneos en Pareo Integral. Vuelve a intentarlo más tarde.";
    else if (new Date() >= CIERRE) estado.textContent = "Las inscripciones cerraron a las 10:00 p.m. del viernes 20 de noviembre.";
    else estado.textContent = "Inscripción abierta hasta las 10:00 p.m. del viernes 20 de noviembre.";
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

  /* ---- El ID FIDE y el Elo, solos, con el nombre ----
     Al terminar de escribir los apellidos y el nombre se busca a quien juega
     en la lista de FIDE (PareoEloNacional.buscarEnLista, js/pareo/elo-nacional.js:
     la Edge Function pareo-listas-elo, la misma de «Agregar desde una lista de
     Elo» de Pareo; ratings.fide.com no deja leerse desde el navegador). Se
     manda SOLO el nombre escrito, y nada se guarda. De lo que vuelve cuentan
     los de Costa Rica cuyo nombre trae todos los apellidos y el primer nombre
     escritos; con varios, el año de nacimiento (si ya se puso la fecha)
     desempata, y si siguen varios, se elige de una lista. El Elo es el
     ESTÁNDAR de FIDE (30 minutos + 30 segundos es ritmo clásico para FIDE):
     sin Elo estándar, el campo queda vacío; nunca se pone el de otra lista.
     Lo que la persona escriba a mano en esos campos no se pisa. */
  const palabras = (s) => sinTildes(s).replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 1);
  function coincide(fila, apellidos, nombre) {
    if (fila.fed && fila.fed !== "CRC") return false;
    const suyas = new Set(palabras(fila.nombre));
    const primero = palabras(nombre)[0];
    return palabras(apellidos).every((w) => suyas.has(w)) && (!primero || suyas.has(primero));
  }
  let buscandoFide = 0;
  const cacheFide = new Map();
  async function buscarEnFide(q) {
    if (!cacheFide.has(q)) cacheFide.set(q, window.PareoEloNacional.buscarEnLista("fide", q));
    const r = await cacheFide.get(q);
    if (!r || !r.ok) cacheFide.delete(q);
    return r;
  }
  // `manual`: la persona escribió en el campo; entonces no se toca.
  function ponerFide(fila) {
    const id = $("insc-fide"), elo = $("insc-elo");
    if (!id.dataset.manual) { id.value = fila ? fila.fideId : ""; id.dataset.auto = fila ? "si" : ""; }
    if (!elo.dataset.manual) { elo.value = fila && fila.estandar ? String(fila.estandar) : ""; elo.dataset.auto = fila ? "si" : ""; }
  }
  async function completarFide() {
    const est = $("insc-fide-estado"), lista = $("insc-fide-opciones");
    const apellidos = valor("insc-apellidos"), nombre = valor("insc-nombre");
    lista.replaceChildren();
    if (apellidos.length < 3 || !nombre || !window.PareoEloNacional) { est.textContent = ""; return; }
    const n = ++buscandoFide;
    est.textContent = "Buscando su ID FIDE y su Elo en la lista de FIDE…";
    let r = await buscarEnFide(apellidos.replace(/\s+/g, " ") + ", " + nombre.split(/\s+/)[0]);
    let filas = r && r.ok ? r.filas.filter((f) => coincide(f, apellidos, nombre)) : [];
    // «Ana Lucía»: si alguno trae TODOS los nombres escritos, cuentan solo esos (no «Ana» a secas).
    const todos = filas.filter((f) => { const suyas = new Set(palabras(f.nombre)); return palabras(nombre).every((w) => suyas.has(w)); });
    if (todos.length) filas = todos;
    if (r && r.ok && !filas.length) {
      // Sin el nombre (FIDE puede tenerlo escrito de otra forma): solo los apellidos.
      r = await buscarEnFide(apellidos);
      filas = r && r.ok ? r.filas.filter((f) => coincide(f, apellidos, "")) : [];
    }
    if (n !== buscandoFide) return; // ya escribió otro nombre
    if (!r || !r.ok) { est.textContent = "No pudimos buscar en la lista de FIDE ahora mismo" + (r && r.error ? ": " + r.error : "") + ". Si tiene ID FIDE, escríbelo a mano."; return; }
    const anio = /^\d{4}/.test($("insc-nacimiento").value) ? Number($("insc-nacimiento").value.slice(0, 4)) : 0;
    if (anio && filas.length > 1 && filas.some((f) => f.nacimiento === anio)) filas = filas.filter((f) => f.nacimiento === anio);
    const describir = (f) => f.nombre + " · ID FIDE " + f.fideId + " · " + (f.estandar ? "Elo " + f.estandar : "sin Elo estándar") + (f.nacimiento ? " · nació en " + f.nacimiento : "");
    if (!filas.length) { ponerFide(null); est.textContent = "No aparece en la lista de FIDE de Costa Rica: si no tiene ID FIDE, déjalo vacío (no hace falta para inscribirse)."; return; }
    if (filas.length === 1) {
      ponerFide(filas[0]);
      est.textContent = "Lo encontramos en FIDE: " + describir(filas[0]) + ". Si no es, corrígelo a mano.";
      return;
    }
    ponerFide(null);
    est.textContent = "Hay " + filas.length + " personas con ese nombre en la lista de FIDE: elige quién juega.";
    filas.slice(0, 8).forEach((f) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "text-left text-sm underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1d64b0]";
      b.dataset.fide = f.fideId;
      b.textContent = describir(f);
      b.addEventListener("click", () => { ponerFide(f); lista.replaceChildren(); est.textContent = "Elegido: " + describir(f) + "."; $("insc-institucion").focus(); });
      const li = document.createElement("li");
      li.append(b);
      lista.append(li);
    });
  }

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
    ["insc-apellidos", "insc-nombre", "insc-nacimiento", "insc-fide", "insc-elo"].forEach((id) => { $(id).value = ""; delete $(id).dataset.manual; delete $(id).dataset.auto; });
    // El club vuelve a la ADAPZ (lo de casi todos: el torneo es de sus afiliados).
    $("insc-institucion").value = $("insc-institucion").defaultValue;
    $("insc-fide-estado").textContent = "";
    $("insc-fide-opciones").replaceChildren();
    document.querySelectorAll('input[name="sexo"]').forEach((x) => { x.checked = false; });
    $("insc-afiliado").checked = false;
    pintarEstado();
  }

  function iniciar() {
    if (!$("insc-form")) return;
    $("insc-nacimiento").addEventListener("input", pintarEstado);
    $("insc-nacimiento").addEventListener("change", pintarEstado);
    // La búsqueda en FIDE: al salir del campo (no a cada letra: la función tiene un tope por hora).
    ["insc-apellidos", "insc-nombre"].forEach((id) => $(id).addEventListener("change", completarFide));
    // Si quedaron varios para elegir, la fecha de nacimiento puesta después desempata (sin volver a pedirle a FIDE: está en la memoria).
    $("insc-nacimiento").addEventListener("change", () => { if ($("insc-fide-opciones").children.length) completarFide(); });
    // Lo que se escribe a mano en el ID o el Elo queda; vaciarlo deja que la búsqueda lo vuelva a poner.
    ["insc-fide", "insc-elo"].forEach((id) => $(id).addEventListener("input", () => { if ($(id).value.trim()) $(id).dataset.manual = "si"; else delete $(id).dataset.manual; }));
    $("insc-form").addEventListener("submit", mandar);
    buscarTorneos().then(() => { pintarFichas(); pintarEstado(); }, () => {
      $("insc-estado-torneos").textContent = "No pudimos buscar los torneos en Pareo Integral ahora mismo. Revisa la conexión y vuelve a abrir esta ventana.";
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();

  // Para las pruebas: la categoría por la fecha y si un torneo recibe inscripciones.
  window.JdnPzInscripcion = { categoriaDe, abierta, coincide, ORGANIZACION, TORNEOS };
})();

/*! rev bfb5bbb0d2d82f9f */
