/* El código de proyecto.html: el plan completo de un grupo de un proyecto
 * (Campeones Colegiales 2026…), para el profesor al que se le asignó y para
 * quien administra.
 *
 * Qué se ve lo decide la RLS: el profesor lee solo su grupo, su proyecto, sus
 * sesiones y sus tareas; quien administra, todo. Los planes de las sesiones se
 * le COMPARTEN al profesor al asignarlo (asignar_grupo_proyecto), así que
 * «Ver el plan» y «Dar esta clase» abren el mismo plan en planes.html y en la
 * clase en vivo sin copiarlo.
 *
 * Las tareas semanales se mandan con crear_tarea(), tal cual las sembró
 * herramientas/proyecto-semilla.js: cada renglón tiene la misma forma que arma
 * tareas.html, así que se llena solo con lo que el alumno entrena y se sigue en
 * Tareas. Quien administra no da clase: ve el plan, pero ni «Dar esta clase»
 * ni «Mandar» (lo revisa con «Ver como: profesor»).
 *
 * Todo lo que viene de la base se pinta con textContent: la guía la escribió
 * una persona. Ver «Los proyectos» en docs/decisiones/paneles.md.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  let session = null, perfil = null, daClase = false;
  let alumnos = null;              // se cargan la primera vez que se manda una tarea
  let tareaAbierta = null, botonAbierto = null;

  const NIVEL = { inicial: "Nivel inicial", intermedio: "Nivel intermedio", avanzado: "Nivel avanzado" };
  const TIPO = { clase: null, especial: "Clase especial", evaluacion: "Evaluación" };
  const BTN = "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }
  // Un emoji delante de un texto: el emoji es adorno y el lector de pantalla lee solo el texto.
  function conEmoji(tag, clase, emoji, texto) {
    const e = el(tag, clase);
    const s = el("span", null, emoji);
    s.setAttribute("aria-hidden", "true");
    e.append(s, " " + texto);
    return e;
  }
  const diaLargo = (iso) => HoraCR.fecha(iso, { weekday: "long", day: "numeric", month: "long" });

  function mostrar(id) {
    ["sin-permiso", "vista-lista", "vista-grupo"].forEach((x) => { $(x).hidden = x !== id; });
  }

  async function init() {
    const { data } = await sb.auth.getSession();
    session = data.session;
    if (!session) { location.href = "login.html"; return; }
    const { data: p } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
    if (!p) { $("loading").textContent = "No se pudo cargar tu perfil."; return; }
    // Con «Ver como», el perfil con el rol del modo puesto: así quien
    // administra revisa la página como la ve el profesor.
    perfil = window.ModoVista ? ModoVista.perfilVisto(p) : p;
    daClase = perfil.role === "profesor" && perfil.is_admin !== true;

    $("loading").classList.add("hidden");
    $("app").classList.remove("hidden");
    if (!(perfil.role === "profesor" || perfil.is_admin === true)) { mostrar("sin-permiso"); return; }

    const grupo = new URLSearchParams(location.search).get("grupo");
    if (grupo) await abrirGrupo(grupo);
    else await listar();
  }

  // ------------------------------------------------------------- la lista
  async function listar() {
    mostrar("vista-lista");
    const { data, error } = await sb.from("proyecto_grupos")
      .select("id, nombre, nivel, horario, orden, proyectos(nombre, periodo)")
      .order("orden").range(0, 999);
    const cont = $("lista-grupos");
    cont.textContent = "";
    if (error) {
      $("lista-vacia").textContent = "No se pudieron cargar los grupos: " + error.message;
      $("lista-vacia").hidden = false;
      return;
    }
    const grupos = data || [];
    $("lista-vacia").hidden = grupos.length > 0;
    // Un profesor con un solo grupo va directo a él: la lista no le aporta nada.
    if (daClase && grupos.length === 1) {
      history.replaceState(null, "", "proyecto.html?grupo=" + encodeURIComponent(grupos[0].id));
      await abrirGrupo(grupos[0].id);
      return;
    }
    for (const g of grupos) {
      const a = el("a", "block bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 hover:shadow-lg transition-shadow " + BTN);
      a.href = "proyecto.html?grupo=" + encodeURIComponent(g.id);
      if (g.proyectos) a.appendChild(el("p", "text-xs font-semibold uppercase tracking-wide text-brand-450 dark:text-brand-350", g.proyectos.nombre));
      a.appendChild(el("h2", "font-serif text-xl font-bold text-brand-800 dark:text-white", g.nombre));
      a.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", [NIVEL[g.nivel], g.horario].filter(Boolean).join(" · ")));
      cont.appendChild(a);
    }
  }

  // ------------------------------------------------------------- un grupo
  async function abrirGrupo(id) {
    const [g, s, t] = await Promise.all([
      sb.from("proyecto_grupos").select("id, nombre, nivel, horario, guia, profesor_id, proyectos(nombre, periodo, descripcion)").eq("id", id).maybeSingle(),
      sb.from("proyecto_sesiones").select("id, numero, fecha, titulo, tipo, detalle, plan_id").eq("grupo_id", id).order("numero").range(0, 999),
      sb.from("proyecto_tareas").select("id, semana, desde, vence, titulo, instrucciones, items").eq("grupo_id", id).order("semana").range(0, 999),
    ]);
    if (g.error || !g.data) {
      mostrar("vista-lista");
      $("lista-vacia").textContent = g.error
        ? "No se pudo cargar el grupo: " + g.error.message
        : "No encontramos ese grupo, o no está asignado a tu cuenta.";
      $("lista-vacia").hidden = false;
      return;
    }
    mostrar("vista-grupo");
    const grupo = g.data;
    const guia = grupo.guia || {};
    const proyecto = grupo.proyectos || {};
    document.title = grupo.nombre + " · " + (proyecto.nombre || "Proyecto") + " — Ajedrez Integral";
    $("g-proyecto").textContent = [proyecto.nombre, proyecto.periodo].filter(Boolean).join(" · ");
    $("g-titulo").textContent = "Grupo «" + grupo.nombre + "»";
    $("g-horario").textContent = [NIVEL[grupo.nivel], grupo.horario].filter(Boolean).join(" · ");
    $("g-intro").textContent = guia.intro || proyecto.descripcion || "";
    const obj = $("g-objetivos");
    obj.textContent = "";
    (guia.objetivos || []).forEach((o) => obj.appendChild(el("li", null, o)));

    const sesiones = s.data || [];
    /* El paso a paso de cada clase es su plan: los mismos renglones que se dan
       en la clase en vivo, en el orden de las cinco partes. Se leen de ahí y no
       de una copia en la sesión (al profesor se le comparten al asignarlo). */
    const ids = sesiones.map((x) => x.plan_id).filter(Boolean);
    const renglones = {};
    if (ids.length) {
      // De mil en mil y en un orden fijo: PostgREST corta en mil aunque se
      // pidan 5000, sin avisar, y los últimos pasos quedaban fuera.
      const filas = [];
      for (let i = 0; ; i += 1000) {
        const r = await sb.from("plan_items").select("plan_id, orden, tipo, titulo, pregunta, curso, leccion, nota")
          .in("plan_id", ids).order("plan_id").order("orden").range(i, i + 999);
        filas.push(...(r.data || []));
        if (r.error || !r.data || r.data.length < 1000) break;
      }
      for (const it of filas) (renglones[it.plan_id] = renglones[it.plan_id] || []).push(it);
      Object.values(renglones).forEach((xs) => xs.sort((a, b2) => a.orden - b2.orden));
    }
    pintarProxima(sesiones);
    pintarSesiones(sesiones, s.error, renglones);
    pintarTareas(t.data || [], t.error);
    pintarEvaluacion(guia, sesiones);
    pintarGuia(guia);
    if (location.hash) {
      const destino = document.getElementById(location.hash.slice(1));
      if (destino) destino.scrollIntoView();
    }
  }

  function botonesDeClase(s) {
    const fila = el("div", "flex flex-wrap gap-2");
    if (!s.plan_id) return fila;
    const ver = conEmoji("a", "text-sm font-semibold px-3 py-1.5 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-100 " + BTN, "📋", "Ver el plan");
    ver.href = "planes.html?plan=" + encodeURIComponent(s.plan_id);
    fila.appendChild(ver);
    if (daClase) {
      const dar = conEmoji("a", "text-sm font-semibold px-3 py-1.5 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 " + BTN, "▶️", "Dar esta clase");
      dar.href = "sesion.html?plan=" + encodeURIComponent(s.plan_id);
      fila.appendChild(dar);
    }
    return fila;
  }

  function pintarProxima(sesiones) {
    const hoy = HoraCR.hoy();
    const s = sesiones.find((x) => x.fecha >= hoy);
    const sec = $("proxima");
    sec.textContent = "";
    sec.hidden = !s;
    if (!s) return;
    const d = s.detalle || {};
    sec.appendChild(el("p", "text-xs font-bold uppercase tracking-wide text-brand-600 dark:text-accent-400",
      s.fecha === hoy ? "Hoy hay clase" : "Próxima clase"));
    const h = el("h2", "font-serif text-xl font-bold text-brand-800 dark:text-white mb-1",
      "Clase " + s.numero + " · " + s.titulo);
    h.id = "proxima-titulo";
    sec.appendChild(h);
    sec.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200 mb-2", diaLargo(s.fecha) + (d.minutos ? " · " + resumenMinutos(d.minutos) : "")));
    if (d.objetivo) sec.appendChild(el("p", "text-sm text-brand-700 dark:text-brand-100 mb-2", d.objetivo));
    if (d.divertido) sec.appendChild(conEmoji("p", "text-sm text-brand-700 dark:text-brand-100 mb-3", "🎉", "Momento divertido: " + d.divertido));
    sec.appendChild(botonesDeClase(s));
  }

  // «2 horas: calentamiento 15, contenido 55, …»
  const PARTES = [["calentamiento", "calentamiento"], ["contenido", "contenido"], ["recreativa", "actividad recreativa"], ["cierre", "cierre"], ["tarea", "tarea"]];
  function resumenMinutos(m) {
    const total = PARTES.reduce((t, [k]) => t + (m[k] || 0), 0);
    return (total === 120 ? "2 horas" : total + " min") + ": " + PARTES.filter(([k]) => m[k]).map(([k, n]) => n + " " + m[k]).join(", ");
  }

  /* Un renglón del plan, como se lee en la página: las notas son las partes
     de la clase (con su paso a paso), las posiciones son los ejercicios (con
     qué preguntar, el tiempo, la respuesta y el porqué) y las lecciones, el
     curso que se abre. */
  function renglon(it) {
    if (it.tipo === "nota") {
      const parte = /^(🔥|📘|🎉|✅|📨) /.test(it.titulo);
      const caja = el("section", parte ? "pt-3 mt-1 border-t border-brand-100 dark:border-brand-800" : "");
      const i = it.titulo.indexOf(" ");
      caja.appendChild(parte
        ? conEmoji("h4", "font-serif text-base font-bold text-brand-800 dark:text-white mb-1", it.titulo.slice(0, i), it.titulo.slice(i + 1))
        : el("h5", "font-semibold text-brand-800 dark:text-white", it.titulo));
      if (it.nota) caja.appendChild(el("p", "whitespace-pre-wrap", it.nota));
      return caja;
    }
    if (it.tipo === "posicion") {
      const caja = el("div", "bg-brand-50 dark:bg-brand-950 rounded-lg p-3");
      caja.appendChild(conEmoji("p", "font-semibold text-brand-800 dark:text-white", "♟️", it.titulo));
      if (it.pregunta) caja.appendChild(el("p", "mt-1 whitespace-pre-wrap", it.pregunta));
      return caja;
    }
    const a = conEmoji("a", "self-start font-semibold text-accent-700 dark:text-accent-400 underline underline-offset-2 hover:no-underline rounded " + BTN, "📖", "Lección: " + it.titulo);
    a.href = "cursos/academia/" + encodeURIComponent(it.curso) + ".html";
    return a;
  }

  function pintarSesiones(sesiones, error, renglones) {
    const cont = $("g-sesiones");
    cont.textContent = "";
    if (error) { cont.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", "No se pudieron cargar las clases: " + error.message)); return; }
    const hoy = HoraCR.hoy();
    const proxima = sesiones.find((x) => x.fecha >= hoy);
    for (const s of sesiones) {
      const d = s.detalle || {};
      const det = el("details", "bg-white dark:bg-brand-900 rounded-2xl shadow-md group");
      if (proxima && proxima.id === s.id) det.open = true;
      const sum = el("summary", "cursor-pointer list-none p-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-2xl " + BTN);
      sum.appendChild(el("span", "font-semibold text-brand-800 dark:text-white", "Clase " + s.numero + " · " + s.titulo));
      sum.appendChild(el("span", "text-sm text-brand-500 dark:text-brand-300", diaLargo(s.fecha)));
      if (TIPO[s.tipo]) sum.appendChild(el("span", "text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-800 text-brand-700 dark:text-brand-200", TIPO[s.tipo]));
      if (proxima && proxima.id === s.id) sum.appendChild(el("span", "text-xs font-semibold px-2 py-0.5 rounded-full bg-accent-500 text-brand-900", "Próxima"));
      det.appendChild(sum);

      const cuerpo = el("div", "px-4 pb-4 grid gap-3 text-sm text-brand-600 dark:text-brand-200");
      if (d.objetivo) {
        const p = el("p");
        p.append(el("span", "font-semibold text-brand-800 dark:text-white", "Objetivo: "), d.objetivo);
        cuerpo.appendChild(p);
      }
      if (d.minutos) cuerpo.appendChild(conEmoji("p", "font-semibold text-brand-700 dark:text-brand-100", "⏱️", resumenMinutos(d.minutos)));
      cuerpo.appendChild(botonesDeClase(s));
      const lista = (renglones || {})[s.plan_id] || [];
      if (lista.length) lista.forEach((it) => cuerpo.appendChild(renglon(it)));
      else if (d.divertido) cuerpo.appendChild(conEmoji("p", null, "🎉", "Momento divertido: " + d.divertido));
      det.appendChild(cuerpo);
      cont.appendChild(det);
    }
  }

  // ------------------------------------------------------------- las tareas
  function pintarTareas(tareas, error) {
    const cont = $("g-tareas");
    cont.textContent = "";
    if (!daClase) $("tareas-ayuda").textContent = "Una por semana, de lunes a lunes. Las manda el profesor del grupo desde esta misma página; cada renglón se llena solo con lo que el alumno entrena en la plataforma.";
    if (error) { cont.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", "No se pudieron cargar las tareas: " + error.message)); return; }
    const hoy = HoraCR.hoy();
    for (const t of tareas) {
      const art = el("article", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4 flex flex-col gap-2");
      const esta = t.desde <= hoy && hoy < t.vence;
      const cab = el("div", "flex flex-wrap items-baseline gap-2");
      cab.appendChild(el("h3", "font-semibold text-brand-800 dark:text-white", t.titulo));
      if (esta) cab.appendChild(el("span", "text-xs font-semibold px-2 py-0.5 rounded-full bg-accent-500 text-brand-900", "Esta semana"));
      art.appendChild(cab);
      art.appendChild(el("p", "text-xs text-brand-500 dark:text-brand-300", "Del " + diaLargo(t.desde) + " al " + diaLargo(t.vence)));
      if (t.instrucciones) art.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200", t.instrucciones));
      const ul = el("ul", "list-disc pl-5 text-sm text-brand-600 dark:text-brand-200 grid gap-1");
      for (const r of (t.items || [])) ul.appendChild(el("li", null, MaterialPlataforma.frase(r)));
      art.appendChild(ul);
      if (daClase) {
        const b = conEmoji("button", "self-start mt-1 text-sm font-semibold px-3 py-1.5 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 " + BTN, "📨", "Mandar a mis alumnos");
        b.type = "button";
        b.setAttribute("aria-expanded", "false");
        b.setAttribute("aria-controls", "form-mandar");
        b.addEventListener("click", () => abrirMandar(t, art, b));
        art.appendChild(b);
      }
      cont.appendChild(art);
    }
  }

  async function traerAlumnos() {
    // De mil en mil: PostgREST corta a ~1000 sin avisar. La RLS deja ver solo
    // los alumnos de quien manda; crear_tarea lo vuelve a comprobar.
    const todos = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await sb.from("profiles").select("id, full_name, email")
        .eq("role", "alumno").order("full_name").order("id").range(desde, desde + 999);
      if (error) throw error;
      todos.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return todos;
  }

  async function pintarAlumnos() {
    const cont = $("m-alumnos");
    if (alumnos === null) {
      cont.textContent = "Cargando tus alumnos…";
      try { alumnos = await traerAlumnos(); }
      catch (e) { cont.textContent = "No se pudieron cargar tus alumnos: " + e.message; alumnos = null; return; }
      cont.textContent = "";
      $("m-sin-alumnos").hidden = alumnos.length > 0;
      for (const a of alumnos) {
        const lab = el("label", "flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-white dark:hover:bg-brand-900 cursor-pointer");
        const c = el("input", "rounded border-brand-300 text-accent-500 focus:ring-accent-400 m-alumno");
        c.type = "checkbox";
        c.value = a.id;
        lab.append(c, el("span", null, a.full_name || a.email || "Sin nombre"));
        cont.appendChild(lab);
      }
      // El mismo selector de subgrupos que Tareas y Exámenes: marcar «los del martes» de una vez.
      if (window.SubgruposMarcar) SubgruposMarcar.montar({ sb, antesDe: cont, casillas: ".m-alumno" });
    }
  }

  function cerrarMandar() {
    $("form-mandar").hidden = true;
    if (botonAbierto) botonAbierto.setAttribute("aria-expanded", "false");
    const b = botonAbierto;
    tareaAbierta = null; botonAbierto = null;
    if (b) b.focus();
  }

  async function abrirMandar(t, art, boton) {
    if (botonAbierto === boton) { cerrarMandar(); return; }
    if (botonAbierto) botonAbierto.setAttribute("aria-expanded", "false");
    tareaAbierta = t; botonAbierto = boton;
    boton.setAttribute("aria-expanded", "true");
    const f = $("form-mandar");
    art.after(f);
    f.hidden = false;
    $("m-titulo-form").textContent = "Mandar «" + t.titulo + "»";
    $("m-titulo").value = t.titulo;
    $("m-instrucciones").value = t.instrucciones || "";
    // Lo propuesto: disponible el lunes en la mañana (si todavía no llegó) y
    // vence el lunes siguiente en la noche. Todo en hora de Costa Rica.
    const hoy = HoraCR.hoy();
    $("m-desde").value = t.desde > hoy ? t.desde + "T07:00" : "";
    $("m-vence").value = t.vence + "T20:00";
    $("m-estado").textContent = "";
    await pintarAlumnos();
    $("m-titulo").focus();
  }

  async function mandar(ev) {
    ev.preventDefault();
    const t = tareaAbierta;
    if (!t) return;
    const estado = $("m-estado");
    const elegidos = [...document.querySelectorAll(".m-alumno:checked")].map((c) => c.value);
    if (!elegidos.length) { estado.textContent = "Marca al menos un alumno."; return; }
    const titulo = $("m-titulo").value.trim();
    if (!titulo) { estado.textContent = "Falta el título."; return; }
    const venceVal = $("m-vence").value;
    if (!venceVal) { estado.textContent = "Ponle una fecha límite."; return; }
    const desdeVal = $("m-desde").value;
    if (desdeVal && HoraCR.desdeCampo(desdeVal) >= HoraCR.desdeCampo(venceVal)) {
      estado.textContent = "La tarea tiene que empezar antes de vencer.";
      return;
    }
    const boton = $("m-enviar");
    boton.disabled = true;
    estado.textContent = "Mandando…";
    const { data, error } = await sb.rpc("crear_tarea", {
      p_alumnos: elegidos,
      p_titulo: titulo,
      p_instrucciones: $("m-instrucciones").value.trim(),
      p_vence: HoraCR.desdeCampo(venceVal).toISOString(),   // lo escrito es hora de Costa Rica
      p_items: t.items,
      p_disponible_desde: desdeVal ? HoraCR.desdeCampo(desdeVal).toISOString() : null,
    });
    boton.disabled = false;
    if (error) { estado.textContent = ""; Avisos.avisar("No se pudo mandar: " + error.message, { tipo: "error" }); return; }
    const n = typeof data === "number" ? data : elegidos.length;
    Avisos.avisar("«" + titulo + "» quedó mandada a " + n + (n === 1 ? " alumno" : " alumnos") + ". La sigues en Tareas.");
    document.querySelectorAll(".m-alumno").forEach((c) => { c.checked = false; });
    cerrarMandar();
  }

  // ------------------------------------------------------------- evaluación y guía
  function tabla(titulo, cabeceras, filas) {
    const sec = el("div", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 overflow-x-auto");
    sec.appendChild(el("h3", "font-serif text-lg font-bold text-brand-800 dark:text-white mb-3", titulo));
    const tb = el("table", "w-full text-sm text-left");
    if (cabeceras) {
      const tr = el("tr");
      cabeceras.forEach((c) => { const th = el("th", "py-2 pr-3 font-semibold text-brand-800 dark:text-white border-b border-brand-200 dark:border-brand-700", c); th.scope = "col"; tr.appendChild(th); });
      const th = el("thead"); th.appendChild(tr); tb.appendChild(th);
    }
    const body = el("tbody");
    for (const f of filas) {
      const tr = el("tr", "border-b border-brand-100 dark:border-brand-800 align-top");
      f.forEach((c, i) => {
        const td = el(i === 0 ? "th" : "td", "py-2 pr-3 " + (i === 0 ? "font-semibold text-brand-800 dark:text-white" : "text-brand-600 dark:text-brand-200"), c);
        if (i === 0) td.scope = "row";
        tr.appendChild(td);
      });
      body.appendChild(tr);
    }
    tb.appendChild(body);
    sec.appendChild(tb);
    return sec;
  }

  function lista(titulo, items) {
    const sec = el("div", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5");
    sec.appendChild(el("h3", "font-serif text-lg font-bold text-brand-800 dark:text-white mb-3", titulo));
    const ul = el("ul", "list-disc pl-5 text-sm text-brand-600 dark:text-brand-200 grid gap-1");
    items.forEach((i) => ul.appendChild(el("li", null, i)));
    sec.appendChild(ul);
    return sec;
  }

  function pintarEvaluacion(guia, sesiones) {
    const cont = $("g-evaluacion");
    cont.textContent = "";
    if (Array.isArray(guia.evaluacion) && guia.evaluacion.length) cont.appendChild(tabla("Qué se evalúa", ["Evaluación", "Fecha", "Peso"], guia.evaluacion));
    const ev = sesiones.filter((s) => s.tipo === "evaluacion");
    if (ev.length) cont.appendChild(tabla("Las clases de evaluación", ["Clase", "Día"], ev.map((s) => ["Clase " + s.numero + " · " + s.titulo, diaLargo(s.fecha)])));
    if (Array.isArray(guia.rubrica) && guia.rubrica.length) {
      // Los mismos niveles que el anexo B del plan en Word.
      const r = tabla("Anexo B · Rúbrica de la minilección y la microenseñanza", ["Criterio", "4 · Logrado", "3 · Casi logrado", "2 · En proceso", "1 · Inicial"], guia.rubrica);
      r.appendChild(el("p", "text-xs text-brand-500 dark:text-brand-300 mt-3", "Cada criterio vale de 1 a 4 puntos; el total (máximo 20) se multiplica por 5 para llevarlo a 100. En las partes orales de las evaluaciones se usan solo los criterios 2 y 3. Primero un compañero dice qué funcionó y da una sugerencia; después el profesor completa con la pauta."));
      cont.appendChild(r);
    }
    if (Array.isArray(guia.portafolio) && guia.portafolio.length) cont.appendChild(tabla("Portafolio del instructor", ["Parte", "Qué lleva", "Puntos"], guia.portafolio));
  }

  function pintarGuia(guia) {
    const cont = $("g-guia");
    cont.textContent = "";
    if (Array.isArray(guia.partida) && guia.partida.length) cont.appendChild(tabla("Punto de partida del grupo", null, guia.partida));
    if (Array.isArray(guia.unidades) && guia.unidades.length) cont.appendChild(tabla("Las unidades", ["Unidad", "Fechas", "Clases"], guia.unidades));
    if (Array.isArray(guia.estructura) && guia.estructura.length) cont.appendChild(tabla("Cómo va cada clase de 2 horas", ["Minutos", "Parte", "Qué se hace"], guia.estructura));
    if (Array.isArray(guia.reglas) && guia.reglas.length) cont.appendChild(lista("Acuerdos del grupo", guia.reglas));
    const anexos = guia.anexos || {};
    for (const k of Object.keys(anexos).sort()) {
      const [titulo, filas] = anexos[k] || [];
      if (titulo && Array.isArray(filas)) cont.appendChild(tabla("Anexo " + k + " · " + titulo, null, filas));
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("form-mandar").addEventListener("submit", mandar);
    $("m-cancelar").addEventListener("click", cerrarMandar);
    $("m-todos").addEventListener("click", () => document.querySelectorAll(".m-alumno").forEach((c) => { c.checked = true; }));
    $("m-ninguno").addEventListener("click", () => document.querySelectorAll(".m-alumno").forEach((c) => { c.checked = false; }));
    init();
  });
})();
