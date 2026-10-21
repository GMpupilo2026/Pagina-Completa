/* La ficha «Asesores» en admin.html#asesores: todo lo del curso «Formación
 * Ajedrez» (el taller para asesores regionales del MEP), sesión por sesión,
 * para irlo preparando de a una:
 *
 *   - con quién se comparte (el mismo bloque de «Materiales de clases»,
 *     AdminMateriales.montarCompartir): a quien se le comparte le aparecen las
 *     presentaciones del curso en la clase en vivo y sus cuestionarios;
 *   - cada sesión, en orden, con su estado de preparación («En preparación» o
 *     «Lista») y una nota, que guarda preparacion_sesiones (solo la lee y la
 *     escribe administración: lo dice la RLS, no esta pantalla);
 *   - sus archivos, su presentación (se mira acá mismo con VistaPrevia) y su
 *     cuestionario al estilo Kahoot, si ya está cargado;
 *   - el grupo: una tabla con cada asesor (las cuentas temporales abiertas
 *     del taller), la última vez que entró, sus clases en la plataforma, la
 *     nota de la primera vez en el cuestionario de cada sesión y cuánto vio
 *     de cada grabación. La arma la base, asesores_tablero() y
 *     asesores_grabaciones(): acá solo se pinta;
 *   - «Mandarlo como tarea a los asesores»: abre Tareas con ese cuestionario
 *     en el renglón y marcadas las cuentas temporales abiertas del taller
 *     (tareas.html?temporales=<detalle>), para que lo practiquen en su casa
 *     entre una sesión y otra.
 *
 * Las sesiones salen de cursos/recursos/formacion-ajedrez/sesiones.json, que
 * arma herramientas/curso-generar-formacion.py junto con el curso; los
 * cuestionarios, de herramientas/formacion-cuestionarios.js. Ver «La ficha
 * Asesores» en docs/decisiones/cursos-y-material.md.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const CURSO = "formacion-ajedrez";
  const CARPETA = "cursos/recursos/" + CURSO + "/";
  const ESTADOS = [["preparacion", "🛠️ En preparación"], ["lista", "✅ Lista"]];

  const CAMPO = "w-full px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
  const ETIQUETA = "block text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1";
  const BOTON = "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60 disabled:cursor-wait";
  const ENLACE = "inline-flex items-center gap-1 rounded-lg border border-brand-200 dark:border-brand-700 px-3 py-1.5 text-sm font-semibold text-brand-700 dark:text-brand-100 hover:border-accent-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

  let datos = null;          // sesiones.json
  let estados = [];          // filas de preparacion_sesiones
  let cuestionarios = [];    // { id, titulo, preguntas }
  let talleres = [];         // [detalle, cuántas cuentas temporales abiertas]
  let grupos = [];           // [detalle, filas de asesores_tablero(), filas de asesores_grabaciones()]
  let pedido = null;

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  /* ---------------------------------------------------------- leer */
  async function cargar() {
    const r = await fetch(CARPETA + "sesiones.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("No se pudo leer la lista de sesiones del curso.");
    datos = await r.json();
    const [e, c, t] = await Promise.all([
      sb.from("preparacion_sesiones").select("sesion, estado, nota, actualizado_en").eq("curso", CURSO),
      sb.from("cuestionarios").select("id, titulo, preguntas").eq("material", CURSO).eq("listo", true),
      // Los asesores son las cuentas temporales del taller que siguen abiertas.
      sb.from("cuentas_temporales").select("detalle").gt("vence", new Date().toISOString()).range(0, 999),
    ]);
    if (e.error) {
      throw new Error(/preparacion_sesiones|does not exist|schema cache/i.test(e.error.message || "")
        ? "Falta aplicar en la base la migración de la preparación (supabase/migraciones/…_preparacion_sesiones.sql)."
        : (e.error.message || "No se pudo leer cómo va la preparación."));
    }
    estados = e.data || [];
    cuestionarios = (c && !c.error && c.data) || [];
    const cuenta = new Map();
    ((t && !t.error && t.data) || []).forEach((f) => cuenta.set(f.detalle, (cuenta.get(f.detalle) || 0) + 1));
    talleres = [...cuenta.entries()];
    grupos = await Promise.all(talleres.map(async ([detalle]) => {
      // Lo de las grabaciones va aparte: si falla, la tabla sale sin esas columnas.
      const [t, g] = await Promise.all([
        sb.rpc("asesores_tablero", { p_detalle: detalle }),
        sb.rpc("asesores_grabaciones", { p_detalle: detalle }).then((r) => r, (e) => ({ error: e })),
      ]);
      if (t.error) console.error(t.error);
      if (g.error) console.error(g.error);
      return [detalle, t.error ? null : (t.data || []), g.error ? null : (g.data || [])];
    }));
  }

  function abrir() {
    if (pedido) return pedido;
    pedido = (async () => {
      try {
        await cargar();
        $("ase-error").hidden = true;
      } catch (err) {
        console.error(err);
        $("ase-error").textContent = err.message || String(err);
        $("ase-error").hidden = false;
        pedido = null;
      } finally {
        $("ase-cargando").hidden = true;
        pintar();
      }
    })();
    if (window.AdminMateriales) AdminMateriales.montarCompartir(CURSO, $("ase-compartir"));
    return pedido;
  }

  const estadoDe = (n) => estados.find((f) => f.sesion === n) || { sesion: n, estado: "preparacion", nota: "" };

  // El cuestionario de la sesión N se llama «Formación Ajedrez · Sesión N: …».
  function cuestionarioDe(n) {
    return cuestionarios.find((c) => new RegExp("· Sesión " + n + ":").test(c.titulo));
  }

  // La tarea de nivel inicial, si la sesión la tiene: «Formación Ajedrez ·
  // Tarea inicial de la Sesión N: …» (no la confunde con el Kahoot: allá va «· Sesión»).
  function tareaInicialDe(n) {
    return cuestionarios.find((c) => new RegExp("· Tarea inicial de la Sesión " + n + ":").test(c.titulo));
  }

  // Abrir un cuestionario y mandarlo como tarea: con más de un taller abierto,
  // un enlace por taller, que dice a cuál va.
  function enlacesDe(cosas, q, nombre, cual) {
    const a = el("a", ENLACE, nombre + " (" + (q.preguntas || []).length + " preguntas)");
    a.href = "cuestionarios.html?id=" + encodeURIComponent(q.id);
    cosas.appendChild(a);
    talleres.forEach(([detalle, n]) => {
      const m = el("a", ENLACE, "📨 Mandarlo como tarea a "
        + (n === 1 ? "la persona" : "las " + n + " personas")
        + (talleres.length > 1 ? " de «" + detalle + "»" : " del taller"));
      m.href = "tareas.html?material=cuestionario&recorte=" + encodeURIComponent(q.id)
        + "&temporales=" + encodeURIComponent(detalle);
      m.setAttribute("aria-label", m.textContent + ": " + cual);
      cosas.appendChild(m);
    });
  }


  /* ---------------------------------------------------------- escribir */
  async function guardar(n, cambios, boton) {
    if (boton) boton.disabled = true;
    try {
      const fila = Object.assign({ curso: CURSO, sesion: n, estado: estadoDe(n).estado, nota: estadoDe(n).nota || "" }, cambios);
      const { data, error } = await sb.from("preparacion_sesiones").upsert(fila).select("sesion, estado, nota, actualizado_en");
      if (error) throw error;
      // Se pinta lo que quedó en la base, no lo que se pidió.
      estados = estados.filter((f) => f.sesion !== n).concat(data || []);
      pintar();
      Avisos.avisar("Sesión " + n + ": " + (estadoDe(n).estado === "lista" ? "lista." : "en preparación."));
    } catch (err) {
      console.error(err);
      Avisos.avisar("No se pudo guardar: " + (err.message || err), { tipo: "error" });
      pintar();
    } finally {
      if (boton) boton.disabled = false;
    }
  }

  /* ---------------------------------------------------------- pintar */
  async function verPresentacion(deck, titulo, boton) {
    boton.disabled = true;
    try {
      const carpeta = "cursos/recursos/" + deck.split("/")[0] + "/presentaciones/" + deck.split("/")[1] + "/";
      const r = await fetch(carpeta + "diapositivas.json", { cache: "no-cache" });
      if (!r.ok) throw new Error("no se encontró la presentación");
      const d = await r.json();
      VistaPrevia.abrir(d.diapositivas.map((x, i) => ({
        ruta: carpeta + x.imagen, ext: "webp",
        titulo: titulo + " · " + (i + 1) + " de " + d.diapositivas.length + ": " + x.titulo,
      })), 0);
    } catch (err) {
      console.error(err);
      Avisos.avisar("No se pudo abrir la presentación: " + (err.message || err), { tipo: "error" });
    } finally {
      boton.disabled = false;
    }
  }

  function pintarSesion(s) {
    const st = estadoDe(s.n);
    const id = "ase-" + s.n;
    const art = el("article", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 md:p-6 border-l-4 "
      + (st.estado === "lista" ? "border-green-500" : "border-accent-400"));
    art.setAttribute("aria-labelledby", id + "-titulo");
    const cab = el("div", "flex flex-wrap items-start justify-between gap-3 mb-2");
    const t = el("div", "min-w-0");
    t.appendChild(el("p", "text-xs font-bold uppercase tracking-wide text-brand-500 dark:text-brand-300",
      "Sesión " + s.n + (s.presencial ? " · presencial" : "")));
    const h = el("h3", "font-serif text-xl font-bold text-brand-800 dark:text-white break-words", s.titulo);
    h.id = id + "-titulo";
    t.appendChild(h);
    cab.appendChild(t);
    cab.appendChild(el("span", "shrink-0 text-sm font-semibold " + (st.estado === "lista"
      ? "text-green-700 dark:text-green-300" : "text-brand-600 dark:text-brand-200"),
      ESTADOS.find((e) => e[0] === st.estado)[1]));
    art.appendChild(cab);
    art.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200 mb-4", s.resumen));

    // Lo que hay para esta sesión.
    const cosas = el("div", "flex flex-wrap gap-2 mb-4");
    if (s.presentacion) {
      const b = el("button", ENLACE, "📊 Ver la presentación");
      b.type = "button";
      b.setAttribute("aria-label", "Ver la presentación de la sesión " + s.n);
      b.addEventListener("click", () => verPresentacion(s.presentacion, "Sesión " + s.n, b));
      cosas.appendChild(b);
    }
    const q = cuestionarioDe(s.n);
    if (q) {
      enlacesDe(cosas, q, "🎯 Cuestionario Kahoot", "el cuestionario de la sesión " + s.n);
    } else {
      cosas.appendChild(el("span", "inline-flex items-center rounded-lg border border-dashed border-brand-300 dark:border-brand-600 px-3 py-1.5 text-sm text-brand-500 dark:text-brand-300",
        "🎯 Kahoot: por preparar"));
    }
    const inicial = tareaInicialDe(s.n);
    if (inicial) enlacesDe(cosas, inicial, "📝 Tarea de nivel inicial", "la tarea de nivel inicial de la sesión " + s.n);
    s.archivos.forEach((f) => {
      const a = el("a", ENLACE, f.texto);
      a.href = CARPETA + f.archivo;
      cosas.appendChild(a);
    });
    art.appendChild(cosas);

    // El estado y la nota.
    const form = el("div", "grid gap-3 sm:grid-cols-3 items-end");
    const wE = el("div");
    const lE = el("label", ETIQUETA, "Estado");
    lE.setAttribute("for", id + "-estado");
    const sel = el("select", CAMPO);
    sel.id = id + "-estado";
    ESTADOS.forEach(([v, txt]) => { const o = el("option", null, txt); o.value = v; o.selected = v === st.estado; sel.appendChild(o); });
    sel.addEventListener("change", () => guardar(s.n, { estado: sel.value }, sel));
    wE.append(lE, sel);
    const wN = el("div", "sm:col-span-2");
    const lN = el("label", ETIQUETA, "Nota (qué falta, qué cambiar)");
    lN.setAttribute("for", id + "-nota");
    const fila = el("div", "flex gap-2");
    const nota = el("input", CAMPO);
    nota.id = id + "-nota";
    nota.maxLength = 500;
    nota.value = st.nota || "";
    const b = el("button", BOTON + " shrink-0", "Guardar");
    b.type = "button";
    b.setAttribute("aria-label", "Guardar la nota de la sesión " + s.n);
    b.addEventListener("click", () => guardar(s.n, { nota: nota.value.trim() }, b));
    fila.append(nota, b);
    wN.append(lN, fila);
    form.append(wE, wN);
    art.appendChild(form);
    return art;
  }

  /* ---------------------------------------------------------- el grupo */
  // «13/22»: la nota de la primera vez. Si lo repitió, se dice cuántas veces.
  function celdaNota(td, nota) {
    if (!nota) {
      td.appendChild(el("span", null, "—")).setAttribute("aria-hidden", "true");
      td.appendChild(el("span", "sr-only", "No lo contestó"));
      return;
    }
    td.textContent = nota.aciertos + "/" + nota.total;
    if (nota.veces > 1) td.appendChild(el("span", "block text-xs text-brand-500 dark:text-brand-300", nota.veces + " veces"));
  }

  /* Las grabaciones del taller, en orden, de las filas de asesores_grabaciones()
     (una por persona y grabación): cada una con su título y su duración, y
     cuánto vio cada persona. */
  function grabacionesDe(filas) {
    const porVideo = new Map();
    (filas || []).forEach((f) => {
      const clave = f.horario_id + "|" + f.fecha;
      if (!porVideo.has(clave)) porVideo.set(clave, { clave, titulo: f.titulo || "Clase", inicio: f.inicio, duracion: Number(f.duracion_seg) || 0, vio: new Map() });
      porVideo.get(clave).vio.set(f.persona_id, Number(f.visto_seg) || 0);
    });
    return [...porVideo.values()].sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  }

  // «50 %» y debajo «1 h 36 min»: lo que vio, sin contar lo repetido.
  function celdaVisto(td, visto, duracion) {
    if (!visto) {
      td.appendChild(el("span", null, "—")).setAttribute("aria-hidden", "true");
      td.appendChild(el("span", "sr-only", "No la vio"));
      return;
    }
    if (duracion) {
      const pct = Math.min(100, Math.round((100 * visto) / duracion));
      td.textContent = (pct < 1 ? "<1" : pct) + " %";
      td.appendChild(el("span", "block text-xs text-brand-500 dark:text-brand-300", HoraCR.duracion(visto)));
    } else {
      td.textContent = HoraCR.duracion(visto);
    }
  }

  function tablaDelGrupo(filas, sesiones, videos) {
    const envoltura = el("div", "overflow-x-auto");
    const t = el("table", "min-w-full text-sm");
    const cap = el("caption", "sr-only", "Cada asesor: la última vez que entró, sus clases, la nota de la primera vez en el cuestionario de cada sesión"
      + (videos.length ? " y cuánto vio de cada grabación" : ""));
    t.appendChild(cap);
    const th = (texto, clase) => { const c = el("th", "px-2 py-2 font-semibold text-left " + (clase || ""), texto); c.scope = "col"; return c; };
    const cab = el("tr", "border-b border-brand-200 dark:border-brand-700 text-brand-600 dark:text-brand-200");
    cab.append(th("Asesor"), th("Última vez que entró"), th("Clases", "text-right"));
    sesiones.forEach((s) => {
      const c = th("S" + s.n, "text-center");
      c.setAttribute("aria-label", "Cuestionario de la sesión " + s.n);
      cab.appendChild(c);
    });
    videos.forEach((v, i) => {
      const n = /(?:^|\s)([IVXLC]+|\d+)\s*$/.exec(v.titulo);
      const c = th("▶ " + (n ? n[1] : i + 1), "text-center whitespace-nowrap");
      c.setAttribute("aria-label", "Grabación de la " + v.titulo + ": cuánto la vio");
      cab.appendChild(c);
    });
    t.appendChild(el("thead")).appendChild(cab);
    const cuerpo = t.appendChild(el("tbody"));
    filas.forEach((f) => {
      const tr = el("tr", "border-b border-brand-100 dark:border-brand-800");
      const nombre = el("th", "px-2 py-2 text-left font-medium text-brand-800 dark:text-white", f.nombre || "");
      nombre.scope = "row";
      tr.appendChild(nombre);
      tr.appendChild(el("td", "px-2 py-2 whitespace-nowrap " + (f.ultima_vez ? "" : "font-semibold text-red-700 dark:text-red-300"),
        f.ultima_vez ? HoraCR.fecha(f.ultima_vez, { day: "numeric", month: "short" }) + ", " + HoraCR.hora(f.ultima_vez) : "Nunca entró"));
      tr.appendChild(el("td", "px-2 py-2 text-right tabular-nums", String(f.clases || 0)));
      sesiones.forEach((s) => {
        const td = el("td", "px-2 py-2 text-center tabular-nums");
        celdaNota(td, s.q && (f.cuestionarios || {})[s.q.id]);
        tr.appendChild(td);
      });
      videos.forEach((v) => {
        const td = el("td", "px-2 py-2 text-center tabular-nums");
        celdaVisto(td, v.vio.get(f.persona_id), v.duracion);
        tr.appendChild(td);
      });
      cuerpo.appendChild(tr);
    });
    envoltura.appendChild(t);
    return envoltura;
  }

  function pintarGrupo() {
    const cont = $("ase-grupo");
    if (!cont || !datos) return;
    cont.textContent = "";
    if (!grupos.length) {
      cont.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300",
        "No hay ninguna cuenta temporal abierta: cuando le pongas una a los asesores del taller, aparecen acá."));
      return;
    }
    const sesiones = datos.sesiones.map((s) => ({ n: s.n, q: cuestionarioDe(s.n) }));
    grupos.forEach(([detalle, filas, vistas]) => {
      if (grupos.length > 1) cont.appendChild(el("h4", "font-semibold text-brand-800 dark:text-white mt-4 mb-1", detalle));
      if (!filas) {
        cont.appendChild(el("p", "text-sm font-semibold text-red-700 dark:text-red-300",
          "No se pudo leer cómo va el grupo. ¿Falta aplicar en la base la migración asesores_tablero?"));
        return;
      }
      const entraron = filas.filter((f) => f.ultima_vez).length;
      const nunca = filas.length - entraron;
      cont.appendChild(el("p", "text-sm text-brand-700 dark:text-brand-200 mb-3",
        entraron + " de " + filas.length + (filas.length === 1 ? " persona ya entró" : " personas ya entraron") + " a la plataforma"
        + (nunca ? "; " + nunca + (nunca === 1 ? " nunca ha entrado." : " nunca han entrado.") : ".")
        + " La nota es la de la primera vez que contestó el cuestionario de cada sesión."));
      const videos = grabacionesDe(vistas);
      if (videos.length) {
        cont.appendChild(el("p", "text-sm text-brand-700 dark:text-brand-200 mb-3",
          "En las grabaciones (▶), cuánto vio cada uno aquí en la plataforma, sin contar lo que repitió ni lo que adelantó. "
          + videos.map((v, i) => {
            const n = [...v.vio.values()].filter((x) => x > 0).length;
            return v.titulo + ": " + n + " de " + filas.length + (i ? "" : (n === 1 ? " empezó a verla" : " empezaron a verla"));
          }).join("; ") + "."));
      }
      cont.appendChild(tablaDelGrupo(filas, sesiones, videos));
    });
  }

  function pintar() {
    pintarGrupo();
    const lista = $("ase-lista");
    if (!lista || !datos) return;
    lista.textContent = "";
    const listas = datos.sesiones.filter((s) => estadoDe(s.n).estado === "lista").length;
    $("ase-resumen").textContent = listas + " de " + datos.sesiones.length + " sesiones listas"
      + (listas < datos.sesiones.length
        ? ". La que sigue: Sesión " + datos.sesiones.find((s) => estadoDe(s.n).estado !== "lista").n + "."
        : ". ¡Todo el curso está listo!");
    datos.sesiones.forEach((s) => lista.appendChild(pintarSesion(s)));
  }

  window.AdminAsesores = { abrir, pintar, CURSO };
})();
