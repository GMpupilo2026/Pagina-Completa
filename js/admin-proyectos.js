/* Los proyectos en admin.html#proyectos: una ficha por grupo de cada proyecto
 * (Campeones Colegiales 2026…), con lo que trae y a qué profesor se le asigna.
 *
 * El contenido (las clases con su plan, la guía y las tareas semanales) lo
 * siembra herramientas/proyecto-semilla.js: acá no se edita. Lo único que se
 * escribe es la asignación, y la hace asignar_grupo_proyecto() en la base, que
 * valida que quien llama administre y que la cuenta sea de un profesor, y le
 * comparte los planes de las sesiones (al anterior se los deja de compartir).
 * La ficha se pinta con lo que devuelve la base, no con lo que se pidió.
 * Ver «Los proyectos» en docs/decisiones/paneles.md.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let cuentas = () => [];
  let proyectos = [], grupos = [], sesiones = [], tareas = [];
  let cargado = false;

  const NIVEL = { inicial: "Nivel inicial", intermedio: "Nivel intermedio", avanzado: "Nivel avanzado" };

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function profesores() {
    return cuentas().filter((u) => u.role === "profesor")
      .sort((a, b) => String(a.full_name || a.email || "").localeCompare(String(b.full_name || b.email || ""), "es"));
  }
  const nombreDe = (id) => {
    const u = cuentas().find((x) => x.id === id);
    return u ? (u.full_name || u.email || "Sin nombre") : "una cuenta que ya no es de profesor";
  };

  // «martes 13 de octubre»: un día de calendario, en hora de Costa Rica.
  const diaLargo = (iso) => HoraCR.fecha(iso, { weekday: "long", day: "numeric", month: "long" });

  async function asignar(g, select, boton, estado) {
    const quiere = select.value || null;
    boton.disabled = true;
    estado.textContent = "Guardando…";
    try {
      const { data, error } = await sb.rpc("asignar_grupo_proyecto", { p_grupo: g.id, p_profesor: quiere });
      if (error) throw error;
      g.profesor_id = data || null;   // lo que quedó en la base
      select.value = g.profesor_id || "";
      pintarAsignado(g, estado);
      Avisos.avisar(g.profesor_id
        ? "«" + g.nombre + "» quedó asignado a " + nombreDe(g.profesor_id) + ". Ya le aparecen los planes en su panel."
        : "«" + g.nombre + "» quedó sin profesor.");
    } catch (e) {
      console.error(e);
      estado.textContent = "";
      Avisos.avisar("No se pudo asignar: " + (e.message || e), { tipo: "error" });
    } finally {
      boton.disabled = false;
    }
  }

  function pintarAsignado(g, estado) {
    estado.textContent = g.profesor_id ? "Asignado a " + nombreDe(g.profesor_id) : "Sin profesor asignado";
  }

  function ficha(g) {
    const art = el("article", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 flex flex-col gap-3");
    art.setAttribute("aria-labelledby", "proy-g-" + g.id);
    const cab = el("div", "flex flex-wrap items-baseline justify-between gap-2");
    const h = el("h4", "font-serif text-xl font-bold text-brand-800 dark:text-white", g.nombre);
    h.id = "proy-g-" + g.id;
    cab.appendChild(h);
    cab.appendChild(el("span", "text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-800 text-brand-700 dark:text-brand-200", NIVEL[g.nivel] || g.nivel));
    art.appendChild(cab);
    if (g.horario) art.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", g.horario));

    const susSesiones = sesiones.filter((s) => s.grupo_id === g.id).sort((a, b) => a.numero - b.numero);
    const susTareas = tareas.filter((t) => t.grupo_id === g.id);
    const evaluaciones = susSesiones.filter((s) => s.tipo === "evaluacion").length;
    const resumen = el("ul", "text-sm text-brand-600 dark:text-brand-200 grid gap-1");
    resumen.appendChild(el("li", null, "📚 " + susSesiones.length + " clases de 2 horas, con su paso a paso y los ejercicios en orden"));
    resumen.appendChild(el("li", null, "🎉 Un momento divertido en cada clase"));
    resumen.appendChild(el("li", null, "📨 " + susTareas.length + " tareas semanales listas para mandar"));
    if (evaluaciones) resumen.appendChild(el("li", null, "📝 " + evaluaciones + (evaluaciones === 1 ? " clase de evaluación" : " clases de evaluación")));
    resumen.querySelectorAll("li").forEach((li) => {
      // El emoji es adorno: el lector de pantalla lee solo el texto.
      const t = li.textContent, i = t.indexOf(" ");
      li.textContent = "";
      const e = el("span", null, t.slice(0, i)); e.setAttribute("aria-hidden", "true");
      li.append(e, " " + t.slice(i + 1));
    });
    art.appendChild(resumen);

    if (susSesiones.length) {
      const hoy = HoraCR.hoy();
      const proxima = susSesiones.find((s) => s.fecha >= hoy);
      const p = el("p", "text-sm text-brand-600 dark:text-brand-200");
      if (proxima) {
        p.appendChild(el("span", "font-semibold", "Próxima clase: "));
        p.appendChild(document.createTextNode(diaLargo(proxima.fecha) + " · " + proxima.titulo));
      } else {
        p.textContent = "Ya se dieron las " + susSesiones.length + " clases.";
      }
      art.appendChild(p);
    }

    // La asignación
    const fila = el("div", "flex flex-wrap items-end gap-2 pt-2 border-t border-brand-100 dark:border-brand-800");
    const caja = el("div", "flex-1 min-w-[12rem]");
    const idSel = "proy-sel-" + g.id;
    const lab = el("label", "block text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1", "Profesor del grupo");
    lab.htmlFor = idSel;
    const sel = el("select", "w-full px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
    sel.id = idSel;
    sel.appendChild(new Option("Sin asignar", ""));
    for (const u of profesores()) sel.appendChild(new Option(u.full_name || u.email || "Sin nombre", u.id));
    if (g.profesor_id && ![...sel.options].some((o) => o.value === g.profesor_id)) {
      sel.appendChild(new Option(nombreDe(g.profesor_id), g.profesor_id));
    }
    sel.value = g.profesor_id || "";
    caja.append(lab, sel);
    const b = el("button", "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60 disabled:cursor-wait", "Asignar");
    b.type = "button";
    const estado = el("p", "w-full text-xs text-brand-500 dark:text-brand-300");
    estado.setAttribute("role", "status");
    pintarAsignado(g, estado);
    b.addEventListener("click", () => asignar(g, sel, b, estado));
    fila.append(caja, b, estado);
    art.appendChild(fila);

    const abrir = el("a", "self-start text-sm font-semibold text-accent-700 dark:text-accent-400 underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Abrir el grupo: plan, clases y tareas");
    abrir.href = "proyecto.html?grupo=" + encodeURIComponent(g.id);
    art.appendChild(abrir);
    return art;
  }

  function pintar() {
    if (!cargado) return;
    const cont = $("proy-lista");
    cont.textContent = "";
    $("proy-vacio").hidden = proyectos.length > 0;
    for (const p of proyectos) {
      const sec = el("section", "");
      sec.setAttribute("aria-labelledby", "proy-p-" + p.id);
      const h = el("h3", "font-serif text-xl font-bold text-brand-800 dark:text-white", p.nombre);
      h.id = "proy-p-" + p.id;
      sec.appendChild(h);
      if (p.periodo) sec.appendChild(el("p", "text-xs font-semibold uppercase tracking-wide text-brand-450 dark:text-brand-350 mb-1", p.periodo));
      if (p.descripcion) sec.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300 mb-4", p.descripcion));
      const rejilla = el("div", "grid gap-4 md:grid-cols-2 xl:grid-cols-3");
      grupos.filter((g) => g.proyecto_id === p.id).sort((a, b) => a.orden - b.orden).forEach((g) => rejilla.appendChild(ficha(g)));
      sec.appendChild(rejilla);
      cont.appendChild(sec);
    }
  }

  async function cargar() {
    try {
      // Tablas chicas (un proyecto trae unas decenas de sesiones), pero
      // PostgREST corta a ~1000 sin avisar aunque se pida más: las que crecen
      // con cada grupo se piden de mil en mil, en un orden fijo.
      const deMilEnMil = async (pedir) => {
        const filas = [];
        for (let i = 0; ; i += 1000) {
          const r = await pedir().range(i, i + 999);
          if (r.error) return r;
          filas.push(...(r.data || []));
          if (!r.data || r.data.length < 1000) return { data: filas, error: null };
        }
      };
      const [p, g, s, t] = await Promise.all([
        sb.from("proyectos").select("id, slug, nombre, descripcion, periodo").order("created_at").range(0, 999),
        sb.from("proyecto_grupos").select("id, proyecto_id, slug, nombre, nivel, horario, orden, profesor_id").range(0, 999),
        deMilEnMil(() => sb.from("proyecto_sesiones").select("grupo_id, numero, fecha, titulo, tipo").order("grupo_id").order("numero")),
        deMilEnMil(() => sb.from("proyecto_tareas").select("grupo_id, semana").order("grupo_id").order("semana")),
      ]);
      for (const r of [p, g, s, t]) if (r.error) throw r.error;
      proyectos = p.data || []; grupos = g.data || []; sesiones = s.data || []; tareas = t.data || [];
    } catch (e) {
      console.error(e);
      $("proy-cargando").textContent = "No se pudieron cargar los proyectos. Vuelve a intentarlo recargando la página.";
      return;
    }
    cargado = true;
    $("proy-cargando").hidden = true;
    pintar();
  }

  function iniciar(obtenerCuentas) {
    cuentas = obtenerCuentas;
    cargar();
  }

  window.AdminProyectos = { iniciar, pintar };
})();
