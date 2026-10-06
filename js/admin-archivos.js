/* La sección «PDF, Word y Excel» de admin.html: todos esos archivos del sitio,
 * una ficha por tipo, ordenados, para abrirlos o bajarlos de a uno o de a grupo.
 *
 * La lista sale de data/archivos.json, que arma herramientas/archivos-catalogo.js
 * leyendo el disco: un archivo nuevo aparece acá al volver a correrlo, y si
 * nadie lo corre verificar-archivos-catalogo.js falla en el CI. Esta pantalla
 * no lleva ninguna lista escrita.
 *
 * Bajar no pasa por acá: los de cursos/recursos/ y material/ los sirve el
 * worker, que deja pasar a quien administra (puede_bajar()). Esta pantalla
 * solo pinta enlaces. Ver «La sección PDF, Word y Excel» en
 * docs/decisiones/cursos-y-material.md.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const TIPO = {
    material: { emoji: "📚", nombre: "Material de estudio" },
    ejercicios: { emoji: "📄", nombre: "Ejercicios" },
    otro: { emoji: "📎", nombre: "Otro" },
  };

  const BOTON = "inline-flex items-center gap-1 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60";
  const ENLACE = "inline-flex items-center gap-1 rounded-lg border border-brand-200 dark:border-brand-700 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:text-brand-100 hover:border-accent-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

  let todo = null;      // data/archivos.json entero
  let datos = null;     // su parte de PDF
  let pedido = null;
  let bajando = null;   // { cancelar: bool } mientras se baja un grupo

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

  function archivosDeCurso(c) {
    return c.lecciones.flatMap((l) => l.archivos).concat(c.otros);
  }

  /* Un PDF: «Abrir» en otra pestaña y «Bajar» (con download). */
  function botonesDe(a, etiqueta) {
    const caja = el("span", "inline-flex flex-wrap items-center gap-1.5");
    // Un Word o un Excel no se abre en el navegador: solo se baja.
    const esPdf = /\.pdf$/i.test(a.ruta);
    const abrir = el("a", ENLACE);
    abrir.href = a.ruta;
    abrir.target = "_blank";
    abrir.rel = "noopener";
    abrir.append(el("span", null, "Abrir"));
    const sr = el("span", "sr-only", " " + etiqueta + " (se abre en otra pestaña)");
    abrir.append(sr);
    const bajar = el("a", ENLACE);
    bajar.href = a.ruta;
    bajar.setAttribute("download", nombreArchivo(a.ruta));
    bajar.append(el("span", null, "📥 Bajar"));
    bajar.append(el("span", "sr-only", " " + etiqueta));
    if (esPdf) caja.append(abrir);
    caja.append(bajar);
    return caja;
  }

  /* Una fila: el nombre, de qué tipo es, cuánto pesa y sus botones. `donde`
     es para buscar y para el lector de pantalla («Ejercicios de la lección 3
     de Finales prácticos»). */
  function fila(a, nombre, donde) {
    const li = el("li", "pdf-fila flex flex-wrap items-center justify-between gap-2 py-2");
    li.dataset.buscar = sinTildes([nombre, donde, a.ruta, TIPO[a.tipo].nombre].join(" "));
    li.dataset.tipo = a.tipo;
    const izq = el("div", "min-w-0");
    const t = el("p", "text-sm font-semibold text-brand-800 dark:text-white");
    t.append(el("span", null, nombre));
    izq.append(t);
    const meta = el("p", "text-xs text-brand-450 dark:text-brand-350");
    // El tipo solo si agrega algo: en un curso la fila ya se llama así, y
    // «Otro» no le dice nada a nadie.
    const tipo = a.tipo !== "otro" && TIPO[a.tipo].nombre !== nombre ? TIPO[a.tipo].nombre : null;
    meta.textContent = [tipo, tamano(a.kb), nombreArchivo(a.ruta)].filter(Boolean).join(" · ");
    izq.append(meta);
    li.append(izq, botonesDe(a, nombre + (donde ? " — " + donde : "")));
    return li;
  }

  /* «Bajar los N»: uno detrás de otro, con un respiro entre cada uno. El
     navegador pregunta la primera vez si deja bajar varios archivos. */
  async function bajarGrupo(lista, boton, estado) {
    if (bajando) { bajando.cancelar = true; return; }
    if (lista.length > 40) {
      const ok = await Avisos.confirmar("Son " + lista.length + " archivos (" + tamano(sumaKb(lista)) +
        "). El navegador puede preguntarte si dejas que la página baje varios archivos: dile que sí.",
        { titulo: "Bajar " + lista.length + " PDF", aceptar: "Bajar los " + lista.length, cancelar: "No, todavía no" });
      if (!ok) return;
    }
    const yo = { cancelar: false };
    bajando = yo;
    const textoBoton = boton.textContent;
    boton.textContent = "Detener";
    try {
      for (let i = 0; i < lista.length; i++) {
        if (yo.cancelar) break;
        estado.textContent = "Bajando " + (i + 1) + " de " + lista.length + "…";
        const a = document.createElement("a");
        a.href = lista[i].ruta;
        a.setAttribute("download", nombreArchivo(lista[i].ruta));
        a.hidden = true;
        document.body.append(a);
        a.click();
        a.remove();
        await new Promise((r) => setTimeout(r, 700));
      }
      estado.textContent = yo.cancelar ? "Se detuvo la descarga." : "Listo: " + plural(lista.length, "PDF pedido", "PDF pedidos") + " al navegador.";
    } finally {
      bajando = null;
      boton.textContent = textoBoton;
    }
  }

  function botonGrupo(lista, texto) {
    const caja = el("div", "flex flex-wrap items-center gap-3");
    const b = el("button", BOTON, texto);
    b.type = "button";
    const estado = el("p", "text-xs text-brand-500 dark:text-brand-300");
    estado.setAttribute("role", "status");
    b.addEventListener("click", () => bajarGrupo(lista, b, estado));
    caja.append(b, estado);
    return caja;
  }

  /* Una tarjeta de grupo (Libros y material, Sueltos). */
  function tarjeta(id, emoji, titulo, descripcion, lista, nombreDe) {
    const sec = el("section", "pdf-grupo bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 md:p-6");
    sec.setAttribute("aria-labelledby", id);
    const cab = el("div", "flex flex-wrap items-start justify-between gap-3 mb-3");
    const izq = el("div");
    const h = el("h3", "font-serif text-xl font-bold text-brand-800 dark:text-white");
    h.id = id;
    const e = el("span", null, emoji + " ");
    e.setAttribute("aria-hidden", "true");
    h.append(e, document.createTextNode(titulo));
    izq.append(h);
    izq.append(el("p", "text-sm text-brand-500 dark:text-brand-300 mt-1",
      descripcion + " " + (lista.every((x) => /\.pdf$/i.test(x.ruta)) ? plural(lista.length, "PDF", "PDF")
        : plural(lista.length, "archivo", "archivos")) + " · " + tamano(sumaKb(lista)) + "."));
    cab.append(izq, botonGrupo(lista, "📥 Bajar los " + lista.length));
    sec.append(cab);
    const ul = el("ul", "divide-y divide-brand-100 dark:divide-brand-800");
    lista.forEach((a) => ul.append(fila(a, nombreDe(a), titulo)));
    sec.append(ul);
    return sec;
  }

  /* Un curso: plegado, con sus lecciones en orden y los dos PDF de cada una. */
  function curso(c) {
    const todos = archivosDeCurso(c);
    const det = el("details", "pdf-grupo pdf-curso bg-white dark:bg-brand-900 rounded-2xl shadow-md");
    const sum = el("summary", "cursor-pointer list-none p-4 md:p-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
    const t = el("span", "font-serif text-lg font-bold text-brand-800 dark:text-white");
    const flecha = el("span", "pdf-flecha inline-block mr-2 text-accent-600 dark:text-accent-400 transition-transform motion-reduce:transition-none", "▸");
    flecha.setAttribute("aria-hidden", "true");
    t.append(flecha, document.createTextNode(c.titulo));
    const cuenta = el("span", "text-xs font-semibold text-brand-500 dark:text-brand-300",
      plural(c.lecciones.length, "lección", "lecciones") + " · " + plural(todos.length, "PDF", "PDF") + " · " + tamano(sumaKb(todos)));
    sum.append(t, cuenta);
    det.append(sum);

    const cuerpo = el("div", "px-4 md:px-5 pb-5");
    cuerpo.append(botonGrupo(todos, "📥 Bajar los " + todos.length + " PDF del curso"));
    const ol = el("ol", "mt-3 divide-y divide-brand-100 dark:divide-brand-800");
    c.lecciones.forEach((l) => {
      const li = el("li", "pdf-leccion py-3");
      const nombre = (l.numero != null ? l.numero + ". " : "") + l.titulo;
      li.append(el("p", "text-sm font-semibold text-brand-800 dark:text-white mb-1", nombre));
      const ul = el("ul", "pl-0 md:pl-4");
      l.archivos.forEach((a) => {
        const f = fila(a, a.titulo, nombre + " — " + c.titulo);
        f.classList.remove("py-2");
        f.classList.add("py-1");
        ul.append(f);
      });
      li.append(ul);
      ol.append(li);
    });
    if (c.otros.length) {
      const li = el("li", "pdf-leccion py-3");
      li.append(el("p", "text-sm font-semibold text-brand-800 dark:text-white mb-1", "Otros archivos del curso"));
      const ul = el("ul", "pl-0 md:pl-4");
      c.otros.forEach((a) => ul.append(fila(a, a.titulo, c.titulo)));
      li.append(ul);
      ol.append(li);
    }
    cuerpo.append(ol);
    det.append(cuerpo);
    det.addEventListener("toggle", () => { flecha.style.transform = det.open ? "rotate(90deg)" : ""; });
    return det;
  }

  function pintar() {
    const lista = $("pdf-lista");
    lista.replaceChildren();
    const todosCursos = datos.cursos.flatMap(archivosDeCurso);
    const total = datos.material.length + datos.sueltos.length + todosCursos.length;
    $("pdf-resumen").textContent = plural(total, "PDF", "PDF") + " en total · " +
      tamano(sumaKb(datos.material) + sumaKb(datos.sueltos) + sumaKb(todosCursos)) + ".";

    if (datos.material.length) {
      lista.append(tarjeta("pdf-titulo-material", "📕", "Libros y material",
        "Los libros, bancos de preguntas y guías para dar clase.", datos.material, (a) => a.titulo));
    }

    // Los cursos, por nivel (el orden del catálogo).
    const cajaCursos = el("section", "space-y-3");
    cajaCursos.setAttribute("aria-labelledby", "pdf-titulo-cursos");
    const cab = el("div", "flex flex-wrap items-start justify-between gap-3");
    const izq = el("div");
    const h = el("h3", "font-serif text-xl font-bold text-brand-800 dark:text-white");
    h.id = "pdf-titulo-cursos";
    const e = el("span", null, "🎓 ");
    e.setAttribute("aria-hidden", "true");
    h.append(e, document.createTextNode("Cursos"));
    izq.append(h, el("p", "text-sm text-brand-500 dark:text-brand-300 mt-1",
      "El material de estudio y los ejercicios de cada lección. " + plural(datos.cursos.length, "curso", "cursos") +
      " · " + plural(todosCursos.length, "PDF", "PDF") + " · " + tamano(sumaKb(todosCursos)) + ". Abre un curso para ver sus lecciones."));
    cab.append(izq, botonGrupo(todosCursos, "📥 Bajar los " + todosCursos.length));
    cajaCursos.append(cab);
    const niveles = datos.niveles.concat([{ id: null, nombre: "Otros cursos" }]);
    niveles.forEach((n) => {
      const delNivel = datos.cursos.filter((c) => (c.nivel || null) === n.id ||
        (n.id === null && !datos.niveles.some((x) => x.id === c.nivel)));
      if (!delNivel.length) return;
      const bloque = el("div", "pdf-nivel space-y-3");
      bloque.append(el("h4", "pt-2 text-xs font-bold uppercase tracking-wide text-brand-450 dark:text-brand-350", n.nombre));
      delNivel.forEach((c) => bloque.append(curso(c)));
      cajaCursos.append(bloque);
    });
    lista.append(cajaCursos);

    if (datos.sueltos.length) {
      lista.append(tarjeta("pdf-titulo-sueltos", "📄", "Otros PDF del sitio",
        "Los que están fuera de los cursos y del material (por ejemplo, los públicos).", datos.sueltos, (a) => a.titulo));
    }
    filtrar();
  }

  /* Una ficha de Word o de Excel: pocos archivos, por carpeta. */
  const FICHA = {
    word: { emoji: "📝", nombre: "Word", vacio: "Todavía no hay ningún documento de Word en la plataforma." },
    excel: { emoji: "📊", nombre: "Excel", vacio: "Todavía no hay ningún Excel guardado en la plataforma. Los que se bajan desde las páginas (por ejemplo, el mes de cada profesor en Supervisión o los reportes) se arman en el momento con los datos de ese día, así que no viven acá. Cuando se suba uno, aparece en esta ficha." },
  };

  function pintarPorCarpeta(tipo) {
    const caja = $("arch-lista-" + tipo);
    caja.replaceChildren();
    const f = todo[tipo] || { total: 0, grupos: [] };
    if (!f.total) {
      caja.append(el("p", "text-sm text-brand-500 dark:text-brand-300", FICHA[tipo].vacio));
      return;
    }
    const todos = f.grupos.flatMap((g) => g.archivos);
    caja.append(el("p", "text-sm font-semibold text-brand-600 dark:text-brand-200",
      plural(f.total, "archivo", "archivos") + " de " + FICHA[tipo].nombre + " · " + tamano(sumaKb(todos)) + "."));
    f.grupos.forEach((g, i) => {
      caja.append(tarjeta("arch-titulo-" + tipo + "-" + i, "📁", g.titulo,
        "Carpeta " + g.carpeta + ".", g.archivos, (a) => a.titulo));
    });
  }

  /* Las fichas (PDF, Word, Excel): una a la vista, con las flechas del
     teclado para pasar de una a otra, como pide el patrón de pestañas. */
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

  /* Buscar y filtrar por tipo: esconde filas, lecciones, cursos y niveles que
     se quedan vacíos, y abre los cursos que tienen algo cuando se busca. */
  function filtrar() {
    if (!datos) return;
    const q = sinTildes($("pdf-buscar").value.trim());
    const tipo = $("pdf-tipo").value;
    const activo = Boolean(q) || tipo !== "todos";
    let visibles = 0;
    document.querySelectorAll("#pdf-lista .pdf-fila").forEach((f) => {
      const ve = (!q || f.dataset.buscar.includes(q)) && (tipo === "todos" || f.dataset.tipo === tipo);
      f.hidden = !ve;
      if (ve) visibles++;
    });
    document.querySelectorAll("#pdf-lista .pdf-leccion").forEach((l) => {
      l.hidden = !l.querySelector(".pdf-fila:not([hidden])");
    });
    document.querySelectorAll("#pdf-lista .pdf-grupo").forEach((g) => {
      const algo = Boolean(g.querySelector(".pdf-fila:not([hidden])"));
      g.hidden = !algo;
      if (g.tagName === "DETAILS" && activo && algo) g.open = true;
    });
    document.querySelectorAll("#pdf-lista .pdf-nivel").forEach((n) => {
      n.hidden = !n.querySelector(".pdf-grupo:not([hidden])");
    });
    $("pdf-vacio").hidden = visibles > 0;
    $("pdf-encontrados").textContent = activo ? plural(visibles, "PDF coincide", "PDF coinciden") + "." : "";
  }

  async function abrir() {
    if (datos || pedido) return pedido;
    pedido = (async () => {
      try {
        const r = await fetch("data/archivos.json", { cache: "no-cache" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        todo = await r.json();
        datos = todo.pdf;
        $("pdf-cargando").hidden = true;
        $("arch-fichas").hidden = false;
        $("pdf-controles").hidden = false;
        pintar();
        pintarPorCarpeta("word");
        pintarPorCarpeta("excel");
        ["pdf", "word", "excel"].forEach((t) => { $("arch-cuenta-" + t).textContent = String((todo[t] || {}).total || 0); });
      } catch (e) {
        pedido = null;
        $("pdf-cargando").hidden = true;
        const err = $("pdf-error");
        err.hidden = false;
        err.textContent = "No se pudo cargar la lista de archivos (" + (e.message || e) + "). Recarga la página para intentarlo otra vez.";
      }
    })();
    return pedido;
  }

  function iniciar() {
    $("pdf-buscar").addEventListener("input", filtrar);
    $("pdf-tipo").addEventListener("change", filtrar);
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
