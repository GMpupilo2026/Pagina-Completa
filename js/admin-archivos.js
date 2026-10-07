/* La sección «Archivos» de admin.html: todos los PDF, Word, Excel y
 * presentaciones del sitio, una ficha por tipo. Cada ficha es un explorador:
 * a la izquierda las carpetas (los libros, los cursos por nivel, lo suelto) y a
 * la derecha lo que hay en la elegida, lección por lección. El buscador busca
 * en toda la ficha. Cada archivo se puede ver sin bajarlo (👁 Vista previa,
 * js/vista-previa.js), abrir en otra pestaña si es PDF, o bajar; cada carpeta,
 * bajar entera.
 *
 * La lista sale de data/archivos.json, que arma herramientas/archivos-catalogo.js
 * leyendo el disco: un archivo nuevo aparece acá al volver a correrlo, y si
 * nadie lo corre verificar-archivos-catalogo.js falla en el CI. Esta pantalla
 * no lleva ninguna lista escrita.
 *
 * Bajar no pasa por acá: los de cursos/recursos/ y material/ los sirve el
 * worker, que deja pasar a quien administra (puede_bajar()). Esta pantalla
 * solo pinta enlaces. Ver «La sección Archivos» en
 * docs/decisiones/cursos-y-material.md.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const TIPO = {
    material: "Material de estudio",
    ejercicios: "Ejercicios",
    presentacion: "Presentación",
    accesible: "Versión accesible",
    otro: "Otro",
  };
  const FICHAS = ["pdf", "word", "excel", "presentaciones", "accesibles", "imagenes"];
  // Cómo se nombra cada ficha dentro de una frase («Buscar en …», «Carpetas de …»).
  const EN_FRASE = { pdf: "los PDF", word: "los Word", excel: "los Excel", presentaciones: "las presentaciones", accesibles: "las versiones accesibles", imagenes: "las imágenes" };
  const VACIO = {
    pdf: "Todavía no hay ningún PDF en la plataforma.",
    word: "Todavía no hay ningún documento de Word en la plataforma.",
    excel: "Todavía no hay ningún Excel guardado en la plataforma. Los que se bajan desde las páginas (por ejemplo, el mes de cada profesor en Supervisión o los reportes) se arman en el momento con los datos de ese día, así que no viven acá. Cuando se suba uno, aparece en esta ficha.",
    presentaciones: "Todavía no hay ninguna presentación en la plataforma.",
    accesibles: "Todavía no hay ninguna versión accesible en la plataforma.",
    imagenes: "Todavía no hay ninguna imagen en la plataforma.",
  };

  const BOTON = "inline-flex items-center gap-1 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60";
  const ENLACE = "inline-flex items-center gap-1 rounded-lg border border-brand-200 dark:border-brand-700 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:text-brand-100 hover:border-accent-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
  const CAMPO = "w-full px-3 py-2 rounded-lg bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
  const ETIQUETA = "block text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1";

  let todo = null;          // data/archivos.json entero
  let pedido = null;
  let bajando = null;       // { cancelar: bool } mientras se baja un grupo
  const carpetas = {};      // por ficha: [{ id, grupo, titulo, bloques: [{ titulo, archivos }] }]
  const estado = {};        // por ficha: { carpeta, q, filtro }

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function sinTildes(t) {
    return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  function tamano(kb) {
    if (kb < 1024) return kb + " KB";
    return (kb / 1024).toLocaleString("es-CR", { maximumFractionDigits: 1 }) + " MB";
  }

  const sumaKb = (lista) => lista.reduce((s, a) => s + a.kb, 0);
  const plural = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);
  const nombreArchivo = (ruta) => ruta.split("/").pop();
  const esPresentacion = (a) => /\.(pptx?|odp)$/i.test(a.ruta);
  const esAccesible = (a) => /-accesible\.html$/i.test(a.ruta);
  // Lo que el navegador abre solo (y por eso lleva «Abrir»): un PDF o una página.
  const esImagen = (a) => /\.(png|jpe?g|gif|webp|avif|svg|ico)$/i.test(a.ruta);
  const seAbre = (a) => /\.(pdf|html)$/i.test(a.ruta) || esImagen(a);

  /* «3 PDF», «3 presentaciones» o «3 archivos», según lo que haya en la lista. */
  function cuantos(lista) {
    const n = lista.length;
    if (lista.every((a) => /\.pdf$/i.test(a.ruta))) return n + " PDF";
    if (lista.every(esPresentacion)) return n + (n === 1 ? " presentación" : " presentaciones");
    if (lista.every(esAccesible)) return n + (n === 1 ? " versión accesible" : " versiones accesibles");
    if (lista.every(esImagen)) return n + (n === 1 ? " imagen" : " imágenes");
    return n + (n === 1 ? " archivo" : " archivos");
  }

  /* «Bajar los 9», «Bajar las 12», «Bajar el PDF». */
  function textoBajar(lista) {
    const n = lista.length;
    const fem = lista.every(esPresentacion) || lista.every(esAccesible) || lista.every(esImagen);
    const art = n === 1 ? (fem ? "la" : "el") : (fem ? "las" : "los");
    return "📥 Bajar " + art + " " + (n === 1 ? cuantos(lista).replace(/^1 /, "") : String(n));
  }

  /* ================= Las carpetas de cada ficha =================
     Cada archivo lleva `nombre` (lo que se lee en la fila) y `camino` (dónde
     está: curso y lección), para buscar y para el lector de pantalla. */
  function conNombre(a, nombre, camino) {
    return Object.assign({}, a, { nombre, camino });
  }

  function carpetasOrdenadas(f) {
    const salida = [];
    // Libros y material: una carpeta por libro.
    [...new Set(f.material.map((a) => a.libro))].forEach((libro, i) => {
      const delLibro = f.material.filter((a) => a.libro === libro);
      salida.push({ id: "libro-" + i, grupo: "Libros y material", titulo: libro,
        bloques: [{ titulo: null, archivos: delLibro.map((a) => conNombre(a, a.titulo, libro)) }] });
    });
    // Cursos: por nivel, en el orden del catálogo; adentro, por lección.
    const niveles = f.niveles.concat([{ id: null, nombre: "Otros cursos" }]);
    niveles.forEach((n) => {
      f.cursos.filter((c) => (c.nivel || null) === n.id || (n.id === null && !f.niveles.some((x) => x.id === c.nivel)))
        .forEach((c) => {
          const bloques = c.lecciones.map((l) => {
            const titulo = (l.numero != null ? l.numero + ". " : "") + l.titulo;
            return { titulo, archivos: l.archivos.map((a) => conNombre(a, a.titulo, c.titulo + " › " + titulo)) };
          });
          if (c.otros.length) {
            bloques.push({ titulo: "Otros archivos del curso", archivos: c.otros.map((a) => conNombre(a, a.titulo, c.titulo)) });
          }
          salida.push({ id: "curso-" + c.slug, grupo: n.id === null ? n.nombre : "Cursos · " + n.nombre, titulo: c.titulo,
            lecciones: c.lecciones.length, bloques });
        });
    });
    if (f.sueltos.length) {
      salida.push({ id: "sueltos", grupo: "Otros", titulo: "Fuera de los cursos y del material",
        bloques: [{ titulo: null, archivos: f.sueltos.map((a) => conNombre(a, a.titulo, "Otros")) }] });
    }
    return salida;
  }

  function carpetasPorCarpeta(f) {
    return f.grupos.map((g, i) => ({ id: "carpeta-" + i, grupo: g.grupo || "Carpetas", titulo: g.titulo, ruta: g.carpeta,
      bloques: [{ titulo: null, archivos: g.archivos.map((a) => conNombre(a, a.titulo, g.titulo)) }] }));
  }

  const archivosDe = (c) => c.bloques.flatMap((b) => b.archivos);

  /* ================= Bajar de a uno o de a grupo ================= */

  /* «Bajar los N»: uno detrás de otro, con un respiro entre cada uno. El
     navegador pregunta la primera vez si deja bajar varios archivos. */
  async function bajarGrupo(lista, boton, aviso) {
    if (bajando) { bajando.cancelar = true; return; }
    if (lista.length > 40) {
      const ok = await Avisos.confirmar("Son " + cuantos(lista) + " (" + tamano(sumaKb(lista)) +
        "). El navegador puede preguntarte si dejas que la página baje varios archivos: dile que sí.",
        { titulo: "Bajar " + cuantos(lista), aceptar: textoBajar(lista).replace("📥 ", ""), cancelar: "No, todavía no" });
      if (!ok) return;
    }
    const yo = { cancelar: false };
    bajando = yo;
    const textoBoton = boton.textContent;
    boton.textContent = "Detener";
    try {
      for (let i = 0; i < lista.length; i++) {
        if (yo.cancelar) break;
        aviso.textContent = "Bajando " + (i + 1) + " de " + lista.length + "…";
        const a = document.createElement("a");
        a.href = lista[i].ruta;
        a.setAttribute("download", nombreArchivo(lista[i].ruta));
        a.hidden = true;
        document.body.append(a);
        a.click();
        a.remove();
        await new Promise((r) => setTimeout(r, 700));
      }
      aviso.textContent = yo.cancelar ? "Se detuvo la descarga." : "Listo: " + cuantos(lista) + " pedidos al navegador.";
    } finally {
      bajando = null;
      boton.textContent = textoBoton;
    }
  }

  function botonGrupo(lista) {
    const caja = el("div", "flex flex-wrap items-center gap-3");
    const b = el("button", BOTON, textoBajar(lista));
    b.type = "button";
    b.dataset.bajarGrupo = "";
    const aviso = el("p", "text-xs text-brand-500 dark:text-brand-300");
    aviso.setAttribute("role", "status");
    b.addEventListener("click", () => bajarGrupo(lista, b, aviso));
    caja.append(b, aviso);
    return caja;
  }

  /* Una fila: el nombre, de qué tipo es, cuánto pesa, y sus botones. */
  function fila(a, lista, i, conCamino) {
    const li = el("li", "arch-fila flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 py-2");
    li.dataset.ruta = a.ruta;
    li.dataset.tipo = a.tipo;
    const izq = el("div", "min-w-0 flex-1");
    izq.append(el("p", "text-sm font-semibold text-brand-800 dark:text-white", a.nombre));
    // El tipo solo si agrega algo: en un curso la fila ya se llama así, y
    // «Otro» no le dice nada a nadie.
    const tipo = a.tipo !== "otro" && TIPO[a.tipo] !== a.nombre ? TIPO[a.tipo] : null;
    const meta = izq.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 truncate",
      [conCamino ? a.camino : null, tipo, tamano(a.kb), nombreArchivo(a.ruta)].filter(Boolean).join(" · ")));
    meta.title = meta.textContent;
    const etiqueta = a.nombre + " — " + a.camino;

    const botones = el("span", "inline-flex shrink-0 items-center gap-1.5");
    const ver = el("button", ENLACE);
    ver.type = "button";
    ver.dataset.vista = "";
    ver.append(el("span", null, "👁 Vista previa"), el("span", "sr-only", " de " + etiqueta));
    ver.addEventListener("click", () => VistaPrevia.abrir(lista.map((x) => ({ ruta: x.ruta, titulo: x.nombre + " — " + x.camino })), i));
    botones.append(ver);
    // Un Word, un Excel o una presentación no se abren en el navegador: se bajan.
    if (seAbre(a)) {
      const abrir = el("a", ENLACE);
      abrir.href = a.ruta;
      abrir.target = "_blank";
      abrir.rel = "noopener";
      abrir.append(el("span", null, "Abrir"), el("span", "sr-only", " " + etiqueta + " (se abre en otra pestaña)"));
      botones.append(abrir);
    }
    const bajar = el("a", ENLACE);
    bajar.href = a.ruta;
    bajar.setAttribute("download", nombreArchivo(a.ruta));
    bajar.append(el("span", null, "📥 Bajar"), el("span", "sr-only", " " + etiqueta));
    botones.append(bajar);
    if (esImagen(a)) {
      // La miniatura: se pide recién cuando la fila se ve (loading=lazy). El
      // nombre ya dice qué es, así que el lector de pantalla no la repite.
      const mini = el("img", "arch-mini w-14 h-14 shrink-0 rounded-md border border-brand-200 dark:border-brand-700 object-contain bg-brand-100 dark:bg-brand-800");
      mini.src = a.ruta;
      mini.alt = "";
      mini.loading = "lazy";
      mini.decoding = "async";
      li.append(mini);
    }
    li.append(izq, botones);
    return li;
  }

  /* ================= El explorador de una ficha ================= */

  function armarFicha(tipo) {
    const caja = $("arch-lista-" + tipo);
    caja.replaceChildren();
    const f = todo[tipo];
    if (!f || !f.total) {
      caja.append(el("p", "text-sm text-brand-500 dark:text-brand-300", VACIO[tipo]));
      return;
    }
    carpetas[tipo] = f.cursos ? carpetasOrdenadas(f) : carpetasPorCarpeta(f);
    estado[tipo] = { carpeta: carpetas[tipo][0].id, q: "", filtro: "todos" };
    const todos = carpetas[tipo].flatMap(archivosDe);

    caja.append(el("p", "text-sm font-semibold text-brand-600 dark:text-brand-200 mb-4",
      cuantos(todos) + " en total · " + tamano(sumaKb(todos)) + " · " + plural(carpetas[tipo].length, "carpeta", "carpetas") + "."
      + (tipo === "presentaciones" ? " Se ven acá mismo; para editarlas, bájalas y ábrelas en PowerPoint, Keynote o Google Presentaciones." : "")
      + (tipo === "accesibles" ? " Son el mismo material en una página sin imágenes, para leer con lector de pantalla o con letra grande." : "")));

    // Buscar en toda la ficha (y, en PDF, mostrar solo un tipo).
    const barra = el("div", "flex flex-wrap items-end gap-3 mb-5");
    const cajaBuscar = el("div", "w-full sm:w-80");
    const lb = el("label", ETIQUETA, "Buscar en " + EN_FRASE[tipo]);
    lb.htmlFor = "arch-buscar-" + tipo;
    const buscar = el("input", CAMPO);
    buscar.type = "search";
    buscar.id = "arch-buscar-" + tipo;
    buscar.placeholder = "Curso, lección o nombre";
    buscar.addEventListener("input", () => { estado[tipo].q = buscar.value; pintarContenido(tipo); });
    cajaBuscar.append(lb, buscar);
    barra.append(cajaBuscar);
    if (tipo === "pdf") {
      const cajaFiltro = el("div");
      const lf = el("label", ETIQUETA, "Mostrar");
      lf.htmlFor = "arch-filtro-pdf";
      const sel = el("select", CAMPO.replace("w-full ", ""));
      sel.id = "arch-filtro-pdf";
      [["todos", "Todos"], ["material", "Solo material de estudio"], ["ejercicios", "Solo ejercicios"], ["otro", "Solo libros y otros"]]
        .forEach(([v, t]) => { const o = el("option", null, t); o.value = v; sel.append(o); });
      sel.addEventListener("change", () => { estado.pdf.filtro = sel.value; pintarContenido("pdf"); });
      cajaFiltro.append(lf, sel);
      barra.append(cajaFiltro);
    }
    caja.append(barra);

    const rejilla = el("div", "lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-6 items-start");
    // En la computadora, la lista de carpetas; en el celular, un selector.
    const lado = el("nav", "hidden lg:block bg-white dark:bg-brand-900 rounded-2xl shadow-md p-3 lg:sticky lg:top-28 max-h-[calc(100vh-8rem)] overflow-y-auto");
    lado.setAttribute("aria-label", "Carpetas de " + EN_FRASE[tipo]);
    lado.id = "arch-carpetas-" + tipo;
    const cajaSel = el("div", "lg:hidden mb-4");
    const ls = el("label", ETIQUETA, "Carpeta");
    ls.htmlFor = "arch-carpeta-" + tipo;
    const selCarpeta = el("select", CAMPO);
    selCarpeta.id = "arch-carpeta-" + tipo;
    selCarpeta.addEventListener("change", () => elegirCarpeta(tipo, selCarpeta.value));
    cajaSel.append(ls, selCarpeta);

    let grupoActual = null, ul = null, optgroup = null;
    carpetas[tipo].forEach((c, i) => {
      if (c.grupo !== grupoActual) {
        grupoActual = c.grupo;
        const idGrupo = "arch-grupo-" + tipo + "-" + i;
        const p = el("p", "px-2 pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-brand-450 dark:text-brand-350", c.grupo);
        p.id = idGrupo;
        ul = el("ul", "space-y-0.5");
        ul.setAttribute("aria-labelledby", idGrupo);
        lado.append(p, ul);
        optgroup = el("optgroup");
        optgroup.label = c.grupo;
        selCarpeta.append(optgroup);
      }
      const n = archivosDe(c).length;
      const b = el("button", "arch-carpeta w-full flex items-center justify-between gap-2 text-left rounded-lg px-2 py-1.5 text-sm text-brand-700 dark:text-brand-100 hover:bg-brand-50 dark:hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
      b.type = "button";
      b.dataset.carpeta = c.id;
      b.append(el("span", "min-w-0", c.titulo), el("span", "shrink-0 text-xs font-semibold text-brand-450 dark:text-brand-350", String(n)));
      b.addEventListener("click", () => elegirCarpeta(tipo, c.id, true));
      const li = el("li");
      li.append(b);
      ul.append(li);
      const o = el("option", null, c.titulo + " (" + n + ")");
      o.value = c.id;
      optgroup.append(o);
    });

    const principal = el("div", "min-w-0");
    principal.append(cajaSel);
    const contenido = el("section", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 md:p-6");
    contenido.id = "arch-contenido-" + tipo;
    principal.append(contenido);
    // Lo que cambió, dicho en una línea (repintar la lista entera en voz alta sería ruido).
    const anuncio = el("p", "sr-only");
    anuncio.id = "arch-anuncio-" + tipo;
    anuncio.setAttribute("role", "status");
    principal.append(anuncio);
    rejilla.append(lado, principal);
    caja.append(rejilla);
    pintarContenido(tipo);
  }

  function elegirCarpeta(tipo, id, foco) {
    estado[tipo].carpeta = id;
    if (estado[tipo].q) {
      // Elegir una carpeta deja la búsqueda: se quiere ver esa carpeta.
      estado[tipo].q = "";
      $("arch-buscar-" + tipo).value = "";
    }
    pintarContenido(tipo);
    if (foco) $("arch-contenido-" + tipo).querySelector("h3").focus();
  }

  function pintarContenido(tipo) {
    const st = estado[tipo];
    const caja = $("arch-contenido-" + tipo);
    caja.replaceChildren();
    const pasa = (a) => st.filtro === "todos" || a.tipo === st.filtro;
    const q = sinTildes(st.q.trim());

    // La carpeta elegida se marca en la lista y en el selector, y se dice.
    document.querySelectorAll("#arch-carpetas-" + tipo + " .arch-carpeta").forEach((b) => {
      const es = b.dataset.carpeta === st.carpeta && !q;
      if (es) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
      b.classList.toggle("bg-accent-500", es);
      b.classList.toggle("text-brand-900", es);
      b.classList.toggle("font-semibold", es);
      b.classList.toggle("text-brand-700", !es);
      b.classList.toggle("dark:text-brand-100", !es);
      b.classList.toggle("hover:bg-brand-50", !es);
      b.classList.toggle("dark:hover:bg-brand-800", !es);
    });
    $("arch-carpeta-" + tipo).value = st.carpeta;

    let titulo, subtitulo, bloques;
    if (q) {
      // Buscando: lo que coincide en toda la ficha, carpeta por carpeta.
      bloques = carpetas[tipo].map((c) => ({
        titulo: c.titulo,
        archivos: archivosDe(c).filter((a) => pasa(a) && sinTildes([a.nombre, a.camino, a.ruta, TIPO[a.tipo]].join(" ")).includes(q)),
      })).filter((b) => b.archivos.length);
      const n = bloques.reduce((s, b) => s + b.archivos.length, 0);
      titulo = "Buscando «" + st.q.trim() + "»";
      subtitulo = n ? plural(n, "archivo coincide", "archivos coinciden") + " en " + plural(bloques.length, "carpeta", "carpetas") + "." : "";
    } else {
      const c = carpetas[tipo].find((x) => x.id === st.carpeta) || carpetas[tipo][0];
      bloques = c.bloques.map((b) => ({ titulo: b.titulo, archivos: b.archivos.filter(pasa) })).filter((b) => b.archivos.length);
      const lista = bloques.flatMap((b) => b.archivos);
      titulo = c.titulo;
      subtitulo = [c.grupo, c.lecciones ? plural(c.lecciones, "lección", "lecciones") : null,
        lista.length ? cuantos(lista) + " · " + tamano(sumaKb(lista)) : null, c.ruta ? "carpeta " + c.ruta : null].filter(Boolean).join(" · ");
    }
    const lista = bloques.flatMap((b) => b.archivos);
    $("arch-anuncio-" + tipo).textContent = titulo + ". " + (lista.length ? (subtitulo || cuantos(lista)) : "Sin archivos.");

    const cab = el("div", "flex flex-wrap items-start justify-between gap-3 mb-3");
    const izq = el("div", "min-w-0");
    const h = el("h3", "font-serif text-xl font-bold text-brand-800 dark:text-white rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", titulo);
    h.tabIndex = -1;
    izq.append(h);
    if (subtitulo) izq.append(el("p", "text-sm text-brand-500 dark:text-brand-300 mt-1", subtitulo));
    cab.append(izq);
    if (lista.length > 1) cab.append(botonGrupo(lista));
    caja.append(cab);

    if (!lista.length) {
      caja.append(el("p", "arch-vacio text-sm text-brand-500 dark:text-brand-300", q ? "Ningún archivo coincide con lo que buscas." : "En esta carpeta no hay archivos de ese tipo."));
      return;
    }
    const ol = el("ol", "divide-y divide-brand-100 dark:divide-brand-800");
    let i = 0;
    bloques.forEach((b) => {
      const li = el("li", "arch-bloque py-3");
      if (b.titulo) li.append(el("h4", "text-sm font-bold text-brand-800 dark:text-white mb-1", b.titulo));
      const ul = el("ul", b.titulo ? "pl-0 md:pl-4" : "");
      b.archivos.forEach((a) => {
        const f = fila(a, lista, i++, Boolean(q) && !b.titulo);
        if (b.titulo) { f.classList.remove("py-2"); f.classList.add("py-1"); }
        ul.append(f);
      });
      li.append(ul);
      ol.append(li);
    });
    caja.append(ol);
  }

  /* ================= Las fichas (PDF, Word, Excel, presentaciones) =================
     Una a la vista, con las flechas del teclado para pasar de una a otra, como
     pide el patrón de pestañas. */
  function elegirFicha(tipo, foco) {
    document.querySelectorAll("#arch-fichas [role=tab]").forEach((b) => {
      const es = b.dataset.ficha === tipo;
      b.setAttribute("aria-selected", es ? "true" : "false");
      b.tabIndex = es ? 0 : -1;
      b.classList.toggle("bg-accent-500", es);
      b.classList.toggle("text-brand-900", es);
      b.classList.toggle("bg-white", !es);
      b.classList.toggle("dark:bg-brand-900", !es);
      b.classList.toggle("text-brand-700", !es);
      b.classList.toggle("dark:text-brand-100", !es);
      if (es && foco) b.focus();
    });
    document.querySelectorAll("[data-ficha-panel]").forEach((p) => { p.hidden = p.dataset.fichaPanel !== tipo; });
  }

  async function abrir() {
    if (todo || pedido) return pedido;
    pedido = (async () => {
      try {
        const r = await fetch("data/archivos.json", { cache: "no-cache" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        todo = await r.json();
        $("arch-cargando").hidden = true;
        $("arch-fichas").hidden = false;
        FICHAS.forEach((t) => {
          $("arch-cuenta-" + t).textContent = String((todo[t] || {}).total || 0);
          armarFicha(t);
        });
      } catch (e) {
        pedido = null;
        $("arch-cargando").hidden = true;
        const err = $("arch-error");
        err.hidden = false;
        err.textContent = "No se pudo cargar la lista de archivos (" + (e.message || e) + "). Recarga la página para intentarlo otra vez.";
      }
    })();
    return pedido;
  }

  function iniciar() {
    const fichas = Array.from(document.querySelectorAll("#arch-fichas [role=tab]"));
    fichas.forEach((b, i) => {
      b.addEventListener("click", () => elegirFicha(b.dataset.ficha));
      b.addEventListener("keydown", (e) => {
        const paso = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        let j = null;
        if (paso) j = (i + paso + fichas.length) % fichas.length;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = fichas.length - 1;
        if (j === null) return;
        e.preventDefault();
        elegirFicha(fichas[j].dataset.ficha, true);
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();

  window.AdminArchivos = { abrir };
})();
