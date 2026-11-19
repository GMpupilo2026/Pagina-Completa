/* «Inscritos» en jdn-pz-2026.html: quiénes están aprobados y listos para la
 * eliminatoria, con su foto. Lo pidió el dueño el 18/11/2026: «crear una
 * ficha de lista de inscritos y que se pueda ver quienes están aprobados y
 * listos para la competencia, agrega la foto de cada participante».
 *
 * - APROBADO es estar en la lista del torneo en Pareo Integral: el formulario
 *   «Inscribirme» deja la inscripción pendiente, y entra a la lista solo
 *   cuando el árbitro la acepta (js/jdn-pz-inscripcion.js). Las pendientes NO
 *   se muestran: son datos de menores que nadie aprobó todavía, y su tabla no
 *   es de lectura pública. La ventana lo dice, para quien mandó una y no se ve.
 * - LOS DATOS son los que ya leyó js/centroamericano-vivo.js de Pareo
 *   (js/torneo-pareo-datos.js): los dos torneos, U12 y U20 (con la U16).
 * - LA FOTO es img/jdn-pz-2026/jugadores/<nombre de Pareo sin tildes>.jpg, que
 *   arma herramientas/jdn-pz-fotos.py (ahí el mapa de cada archivo de Drive y
 *   por qué los nombres repetidos se quedan sin foto), con la lista de las
 *   que hay en lista.json: se pide solo una foto que existe. Sin foto, sus
 *   iniciales en un círculo.
 * - Se filtra por categoría, se ordena por nombre o por Elo y se busca por
 *   nombre. Tocar a alguien lo busca en «Busca a tu jugador».
 *
 * Todo lo que viene de afuera (los nombres) va por textContent.
 * Ver «Los inscritos de la Eliminatoria JDN de PZ, con su foto» en
 * docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const V = window.CentroamericanoVivo;
  const dialogo = document.getElementById("inscritos");
  const caja = document.getElementById("inscritos-contenido");
  if (!V || !dialogo || !caja) return;
  const el = V.el;
  const CARPETA = "img/jdn-pz-2026/jugadores/";
  const PEQUENAS = new Set(["de", "del", "la", "las", "los", "y"]);
  const estado = { grupo: "", orden: "nombre", texto: "" };
  // Las fotos que hay (lista.json): sin la lista, nadie lleva foto.
  let fotos = new Set();
  const lista = fetch(CARPETA + "lista.json").then((r) => (r.ok ? r.json() : [])).then((xs) => { fotos = new Set(xs); }, () => {});

  // El mismo nombre de archivo que arma herramientas/jdn-pz-fotos.py.
  const archivoDe = (nombre) => String(nombre || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") + ".jpg";

  // «VALVERDE ALVARADO, LEONARDO» → «Leonardo Valverde Alvarado»: primero el
  // nombre, y la palabra escrita toda en mayúscula o toda en minúscula, con
  // su mayúscula inicial (así la escribieron algunos en el formulario).
  function legible(nombre) {
    const arreglar = (s) => s.trim().split(/\s+/).map((w, i) => {
      if (w !== w.toUpperCase() && w !== w.toLowerCase()) return w;
      const m = w.toLowerCase();
      return i && PEQUENAS.has(m) ? m : m.charAt(0).toUpperCase() + m.slice(1);
    }).join(" ");
    const [apellidos, nombres] = String(nombre || "").split(/,\s*/);
    return nombres ? arreglar(nombres) + " " + arreglar(apellidos) : arreglar(apellidos);
  }
  const iniciales = (n) => n.split(" ").filter(Boolean).slice(0, 2).map((w) => w.charAt(0)).join("").toUpperCase();

  function todos() {
    const out = [];
    (((V.datos() || {}).torneos) || []).forEach((t) => {
      const k = /\b(u|sub)[\s-]?12\b/i.test(t.texto.normalize("NFD")) ? "U12" : "U20";
      (t.jugadores || []).forEach((j) => out.push({ j, torneo: k, legible: legible(j.nombre) }));
    });
    return out;
  }

  function foto(x) {
    const marco = el("span", "jdn-inscrito-foto");
    const sinFoto = () => {
      marco.classList.add("jdn-inscrito-sin-foto");
      marco.replaceChildren(el("span", "", iniciales(x.legible)));
      marco.setAttribute("aria-hidden", "true");
    };
    if (!fotos.has(archivoDe(x.j.nombre))) { sinFoto(); return marco; }
    const img = el("img");
    img.alt = "";
    img.width = 96; img.height = 96;
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", sinFoto, { once: true });
    img.src = CARPETA + archivoDe(x.j.nombre);
    marco.appendChild(img);
    return marco;
  }

  function tarjeta(x) {
    const li = el("li");
    const b = el("button", "jdn-inscrito");
    b.type = "button";
    b.setAttribute("aria-label", x.legible + ", " + x.j.grupo + (x.j.elo ? ", Elo " + x.j.elo : ", sin Elo FIDE") + ". Aprobado y listo para jugar. Buscarlo en «Busca a tu jugador».");
    b.appendChild(foto(x));
    const datos = el("span", "jdn-inscrito-datos");
    datos.appendChild(el("span", "jdn-inscrito-nombre", x.legible));
    datos.appendChild(el("span", "jdn-inscrito-sub", x.j.grupo + " · " + (x.j.elo ? "Elo " + x.j.elo : "Sin Elo FIDE")));
    datos.appendChild(el("span", "jdn-inscrito-listo", "✓ Aprobado · listo para jugar"));
    b.appendChild(datos);
    b.addEventListener("click", () => {
      const campo = document.getElementById("buscador-nombre");
      if (!campo) return;
      dialogo.close();
      campo.value = x.j.nombre;
      campo.dispatchEvent(new Event("input", { bubbles: true }));
      campo.scrollIntoView({ behavior: "smooth", block: "center" });
      campo.focus({ preventScroll: true });
    });
    li.appendChild(b);
    return li;
  }

  let partes = null;
  function armar(grupos) {
    const resumen = el("p", "font-bold");
    resumen.setAttribute("role", "status");
    const filtro = el("div", "cac-modalidad mt-3 flex-wrap");
    filtro.setAttribute("role", "group");
    filtro.setAttribute("aria-label", "Ver una categoría");
    const controles = el("div", "mt-3 grid gap-3 sm:grid-cols-2");
    const lb = el("label", "block text-sm font-bold", "Buscar un jugador");
    const q = el("input", "cac-buscador-campo !mt-1");
    q.type = "search"; q.autocomplete = "off"; q.spellcheck = false;
    q.addEventListener("input", () => { estado.texto = q.value; pintar(); });
    lb.appendChild(q);
    const lo = el("label", "block text-sm font-bold", "Ordenar");
    const sel = el("select", "cac-buscador-campo !mt-1");
    [["nombre", "Por nombre"], ["elo", "Por Elo, de mayor a menor"]].forEach(([v, t]) => { const o = el("option", "", t); o.value = v; sel.appendChild(o); });
    sel.addEventListener("change", () => { estado.orden = sel.value; pintar(); });
    lo.appendChild(sel);
    controles.append(lb, lo);
    const lista = el("ul", "jdn-inscritos mt-4");
    const nota = el("p", "mt-4 text-sm text-brand-600 dark:text-brand-300",
      "Aquí aparece cada jugador cuando el árbitro aprueba su inscripción en Pareo Integral. Si mandaste una inscripción y no la ves, todavía está pendiente de revisión. Las inscripciones cierran a las 10:00 p.m. del viernes 20 de noviembre.");
    caja.replaceChildren(resumen, filtro, controles, lista, nota);
    partes = { resumen, filtro, lista, firma: "" };
  }

  function pintarFiltro(grupos, gente) {
    const firma = grupos.join("|") + ":" + gente.length;
    if (partes.firma === firma) return;
    partes.firma = firma;
    const opciones = [["", "Todos", gente.length]].concat(grupos.map((g) => [g, g, gente.filter((x) => x.j.grupo === g).length]));
    partes.filtro.replaceChildren(...opciones.map(([v, texto, n]) => {
      const b = el("button", "cac-modalidad-boton", texto + " (" + n + ")");
      b.type = "button";
      b.dataset.grupo = v;
      b.addEventListener("click", () => { estado.grupo = v; pintar(); b.focus(); });
      return b;
    }));
  }

  function pintar() {
    if (!dialogo.open) return;
    const gente = todos();
    if (!gente.length) {
      partes = null;
      caja.replaceChildren(el("p", "font-semibold", V.datos()
        ? "Todavía no hay inscritos aprobados: aparecen aquí cuando el árbitro los aprueba en Pareo Integral."
        : "Cargando…"));
      return;
    }
    const grupos = [...new Set(gente.map((x) => x.j.grupo))].sort((a, b) => V.ordenGrupo(a) - V.ordenGrupo(b) || a.localeCompare(b));
    if (!partes || !partes.lista.isConnected) armar(grupos);
    if (estado.grupo && !grupos.includes(estado.grupo)) estado.grupo = "";
    pintarFiltro(grupos, gente);
    partes.filtro.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.grupo === estado.grupo)));

    const u12 = gente.filter((x) => x.torneo === "U12").length;
    partes.resumen.textContent = gente.length + " jugadores aprobados y listos para jugar: " + u12 + " en el torneo U12 y " + (gente.length - u12) + " en el U20 (con la U16).";

    const palabras = V.plano(estado.texto).split(" ").filter(Boolean);
    const lista = gente
      .filter((x) => !estado.grupo || x.j.grupo === estado.grupo)
      .filter((x) => palabras.every((p) => V.plano(x.j.nombre).includes(p)))
      .sort(estado.orden === "elo"
        ? (a, b) => (b.j.elo || 0) - (a.j.elo || 0) || a.legible.localeCompare(b.legible, "es")
        : (a, b) => a.legible.localeCompare(b.legible, "es"));
    if (!lista.length) { partes.lista.replaceChildren(el("li", "font-semibold", "Nadie con ese nombre en la lista.")); return; }
    partes.lista.replaceChildren(...lista.map(tarjeta));
  }

  const alAbrirse = () => {
    if (!dialogo.open) return;
    partes = null;
    pintar();
    Promise.all([V.pedir(), lista]).then(pintar, () => { if (!V.datos()) caja.replaceChildren(el("p", "font-semibold", "No pudimos leer Pareo Integral ahora mismo. Revisa la conexión y vuelve a abrir esta ventana.")); });
  };
  new MutationObserver(alAbrirse).observe(dialogo, { attributes: true, attributeFilter: ["open"] });
  document.addEventListener("cac-datos", pintar);
  // Abierta antes de cargar este módulo (con la dirección #inscritos).
  if (dialogo.open) alAbrirse();
})();

/*! rev bfb5bbb0d2d82f9f */
