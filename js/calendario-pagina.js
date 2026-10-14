/* El código de calendario.html: «Mi calendario».
 *
 * Las clases, las tareas y los exámenes en un mes (o en una agenda), con lo
 * que conviene saber y un plan día por día. La cuenta la hace
 * js/calendario-inteligente.js, que es puro; acá solo se piden los datos y se
 * pinta. Ver «Mi calendario: clases, tareas y exámenes, con un plan» en
 * docs/decisiones/paneles.md.
 *
 * - Al ALUMNO: sus clases (mis_clases_proximas, la misma regla de «Tu próxima
 *   clase» y del .ics), sus tareas pendientes (tareas_con_avance) y sus
 *   exámenes (examenes_con_nota). El plan le reparte lo pendiente en sus días
 *   más libres antes de cada entrega.
 * - A QUIEN DA CLASE: su horario (horario_clases, que lee él mismo por la RLS)
 *   y las entregas de sus alumnos agrupadas (una tarea a doce alumnos es UNA
 *   cosa en su calendario), con en qué clase recordarla y revisarla.
 * - Lo que se ve lo decide la base: estas funciones contestan solo sobre
 *   quien pregunta. Mirando como otra persona («Ver como») el calendario sigue
 *   siendo el de la propia cuenta, y lo dice.
 */
(function () {
    "use strict";

    const C = window.CalendarioInteligente;
    const $ = (id) => document.getElementById(id);
    const DIAS_CLASES = 90;
    const EMOJI = { clase: "🎓", tarea: "📋", examen: "📝", plan: "🧭" };
    const NOMBRE_TIPO = { clase: ["clase", "clases"], tarea: ["tarea", "tareas"], examen: ["examen", "exámenes"], plan: ["sugerencia", "sugerencias"] };
    const SEMANA = [["lun", "lunes"], ["mar", "martes"], ["mié", "miércoles"], ["jue", "jueves"], ["vie", "viernes"], ["sáb", "sábado"], ["dom", "domingo"]];

    const estado = {
        yo: null, modo: "alumno", hoy: "", mes: "", elegido: "", vista: "mes",
        eventos: [], plan: [], porDia: {}, planPorDia: {}, minMes: "", maxMes: "", horizonte: "",
        datosIcs: null,
        filtros: { clase: true, tarea: true, examen: true, plan: true },
    };

    function el(tag, clases, texto) {
        const n = document.createElement(tag);
        if (clases) n.className = clases;
        if (texto != null) n.textContent = texto;
        return n;
    }
    function icono(e) {
        const s = el("span", null, e + " ");
        s.setAttribute("aria-hidden", "true");
        return s;
    }
    const plural = (n, tipo) => n + " " + NOMBRE_TIPO[tipo][n === 1 ? 0 : 1];

    /* El estado de un evento va ESCRITO, no solo en el color. Contraste medido
       contra el fondo de la etiqueta (ver docs). */
    const COLOR_ESTADO = {
        "Ahora": "bg-emerald-700 text-white",
        "Vence hoy": "bg-red-700 text-white",
        "Vencida": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
        "Empezado": "bg-red-700 text-white",
        "Hecha": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100",
        "Todos listos": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100",
        "Programada": "bg-brand-100 text-brand-800 dark:bg-brand-700 dark:text-white",
        "Terminó": "bg-brand-100 text-brand-800 dark:bg-brand-700 dark:text-white",
    };
    function etiqueta(texto) {
        return el("span", "inline-block text-xs font-semibold rounded-full px-2 py-0.5 " + (COLOR_ESTADO[texto] || "bg-brand-100 text-brand-800"), texto);
    }

    const visible = (e) => estado.filtros[e.tipo] !== false;

    // ---------- Un renglón: un evento o una sugerencia del plan ----------
    function renglonEvento(e) {
        const li = el("li", "flex gap-3 items-start");
        li.dataset.tipo = e.tipo;
        li.appendChild(el("span", "text-xl leading-none mt-0.5", EMOJI[e.tipo])).setAttribute("aria-hidden", "true");
        const cuerpo = el("div", "min-w-0 flex-1");
        const titulo = el("a", "font-semibold text-brand-800 dark:text-white underline underline-offset-2 hover:text-accent-700 dark:hover:text-accent-400 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", e.titulo);
        titulo.href = e.href;
        cuerpo.appendChild(titulo);
        if (e.estado) { cuerpo.appendChild(document.createTextNode(" ")); cuerpo.appendChild(etiqueta(e.estado)); }
        cuerpo.appendChild(el("p", "text-xs text-brand-500 dark:text-brand-300 mt-0.5", e.detalle));
        li.appendChild(cuerpo);
        return li;
    }
    function renglonPlan(p) {
        const li = el("li", "flex gap-3 items-start");
        li.dataset.tipo = "plan";
        li.appendChild(el("span", "text-xl leading-none mt-0.5", EMOJI.plan)).setAttribute("aria-hidden", "true");
        const cuerpo = el("div", "min-w-0 flex-1");
        cuerpo.appendChild(el("span", "text-xs font-semibold text-accent-700 dark:text-accent-400", p.urgente ? "Primero que todo · " : "Sugerido · "));
        const a = el("a", "font-semibold text-brand-800 dark:text-white underline underline-offset-2 hover:text-accent-700 dark:hover:text-accent-400 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", p.texto);
        a.href = p.href;
        cuerpo.appendChild(a);
        cuerpo.appendChild(el("p", "text-xs text-brand-500 dark:text-brand-300 mt-0.5", p.motivo));
        li.appendChild(cuerpo);
        return li;
    }

    // ---------- Lo que conviene saber y el plan ----------
    const COLOR_AVISO = {
        alto: "border-l-4 border-red-700 bg-red-50 dark:bg-red-950 text-brand-800 dark:text-white",
        medio: "border-l-4 border-accent-500 bg-accent-50 dark:bg-brand-800 text-brand-800 dark:text-white",
        info: "border-l-4 border-brand-300 bg-brand-50 dark:bg-brand-800 text-brand-800 dark:text-white",
    };
    const PALABRA_AVISO = { alto: "Urgente: ", medio: "Ojo: ", info: "" };
    function pintarAvisos(avisos) {
        const ul = $("cal-avisos");
        ul.replaceChildren();
        if (!avisos.length) {
            ul.appendChild(el("li", "text-brand-500 dark:text-brand-300", "Nada urgente: no hay entregas encima ni días cargados."));
            return;
        }
        for (const a of avisos) {
            const li = el("li", "rounded-lg px-3 py-2 " + COLOR_AVISO[a.nivel]);
            li.dataset.nivel = a.nivel;
            if (PALABRA_AVISO[a.nivel]) li.appendChild(el("strong", null, PALABRA_AVISO[a.nivel]));
            li.appendChild(document.createTextNode(a.texto));
            ul.appendChild(li);
        }
    }

    function pintarPlan() {
        const ol = $("cal-plan");
        ol.replaceChildren();
        if (!estado.plan.length) {
            ol.appendChild(el("li", "text-brand-500 dark:text-brand-300", estado.modo === "alumno"
                ? "No tienes nada pendiente con fecha en las próximas dos semanas. Buen momento para entrenar lo que quieras."
                : "No hay entregas de tus alumnos en las próximas dos semanas que revisar en clase."));
            return;
        }
        let diaActual = null, lista = null;
        for (const p of estado.plan) {
            if (p.dia !== diaActual) {
                diaActual = p.dia;
                const li = el("li");
                const c = C.cuando(p.dia, estado.hoy);
                li.appendChild(el("h3", "font-semibold text-brand-700 dark:text-brand-200 mb-1", C.mayuscula(c === "hoy" || c === "mañana" ? c : C.nombreDia(p.dia))));
                lista = el("ul", "space-y-2 list-none p-0");
                li.appendChild(lista);
                ol.appendChild(li);
            }
            lista.appendChild(renglonPlan(p));
        }
    }

    // ---------- El mes ----------
    function cosasDelDia(d) {
        const ev = (estado.porDia[d] || []).filter(visible);
        const pl = estado.filtros.plan ? (estado.planPorDia[d] || []) : [];
        return { ev, pl };
    }
    function resumenDelDia(d) {
        const { ev, pl } = cosasDelDia(d);
        const partes = [];
        ["clase", "tarea", "examen"].forEach((t) => {
            const n = ev.filter((e) => e.tipo === t).length;
            if (n) partes.push(plural(n, t));
        });
        if (pl.length) partes.push(plural(pl.length, "plan"));
        return partes.length ? partes.join(", ") : "nada";
    }

    function pintarMes() {
        const caja = $("cal-vista-mes");
        caja.replaceChildren();
        $("cal-mes-titulo").textContent = C.mayuscula(C.nombreMes(estado.mes));
        $("cal-anterior").disabled = estado.mes <= estado.minMes;
        $("cal-siguiente").disabled = estado.mes >= estado.maxMes;

        const tabla = el("table", "w-full table-fixed border-collapse text-sm");
        tabla.setAttribute("role", "grid");
        tabla.setAttribute("aria-labelledby", "cal-mes-titulo");
        const thead = el("thead");
        const trh = el("tr");
        for (const [corto, largo] of SEMANA) {
            const th = el("th", "py-2 text-xs font-semibold uppercase text-brand-500 dark:text-brand-300", corto);
            th.setAttribute("abbr", largo);
            th.setAttribute("scope", "col");
            trh.appendChild(th);
        }
        thead.appendChild(trh);
        tabla.appendChild(thead);
        const tbody = el("tbody");
        for (const semana of C.semanasDelMes(estado.mes)) {
            const tr = el("tr");
            for (const d of semana) {
                const td = el("td", "align-top p-0.5 md:p-1");
                td.setAttribute("role", "gridcell");
                td.appendChild(botonDia(d));
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        tabla.appendChild(tbody);
        caja.appendChild(tabla);
    }

    function botonDia(d) {
        const deOtroMes = d.slice(0, 7) !== estado.mes;
        const esHoy = d === estado.hoy, elegido = d === estado.elegido;
        const b = el("button", "w-full min-h-[3.25rem] md:min-h-[6.5rem] flex flex-col items-stretch text-left rounded-lg border p-1 md:p-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 "
            + (elegido ? "border-accent-500 bg-accent-50 dark:bg-brand-800 " : "border-brand-100 dark:border-brand-800 hover:bg-brand-50 dark:hover:bg-brand-800 ")
            + (deOtroMes ? "text-brand-400 dark:text-brand-400" : "text-brand-800 dark:text-white"));
        b.type = "button";
        b.dataset.dia = d;
        b.tabIndex = elegido ? 0 : -1;
        b.setAttribute("aria-pressed", elegido ? "true" : "false");
        if (esHoy) b.setAttribute("aria-current", "date");
        b.setAttribute("aria-label", C.mayuscula(C.nombreDia(d)) + (esHoy ? " (hoy)" : "") + ": " + resumenDelDia(d));

        const num = el("span", "text-xs md:text-sm font-semibold " + (esHoy ? "inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-800 text-white dark:bg-accent-500 dark:text-brand-900" : ""), String(Number(d.slice(8))));
        b.appendChild(num);

        const { ev, pl } = cosasDelDia(d);
        // En el celular, solo los dibujitos (con el número si hay más de uno).
        const compacto = el("span", "md:hidden mt-0.5 flex flex-wrap gap-0.5 text-xs leading-none");
        compacto.setAttribute("aria-hidden", "true");
        ["clase", "tarea", "examen"].forEach((t) => {
            const n = ev.filter((e) => e.tipo === t).length;
            if (n) compacto.appendChild(el("span", null, EMOJI[t] + (n > 1 ? n : "")));
        });
        if (pl.length) compacto.appendChild(el("span", null, EMOJI.plan));
        b.appendChild(compacto);

        // En la computadora, hasta tres renglones y «y N más».
        const lista = el("span", "hidden md:flex flex-col gap-0.5 mt-1 text-xs leading-tight");
        lista.setAttribute("aria-hidden", "true");
        const filas = ev.map((e) => EMOJI[e.tipo] + " " + (e.tipo === "clase" ? C.hora(e.inicio) + " " : "") + e.titulo.replace(/^(Clase|Tarea|Examen): /, ""))
            .concat(pl.map((p) => EMOJI.plan + " " + p.texto));
        filas.slice(0, 3).forEach((t) => lista.appendChild(el("span", "truncate", t)));
        if (filas.length > 3) lista.appendChild(el("span", "font-semibold", "y " + (filas.length - 3) + " más"));
        b.appendChild(lista);

        b.addEventListener("click", () => elegir(d, false));
        b.addEventListener("keydown", teclaDia);
        return b;
    }

    /* Las flechas mueven el día elegido (un día o una semana), Inicio y Fin
       van al principio o al final de la semana, y Re Pág / Av Pág cambian de
       mes. Un solo día del mes es una parada de tabulador. */
    function teclaDia(ev) {
        const d = ev.currentTarget.dataset.dia;
        const dow = (C.diaSemana(d) + 6) % 7;
        const salto = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -dow, End: 6 - dow }[ev.key];
        let nuevo = null;
        if (salto != null) nuevo = C.sumarDias(d, salto);
        else if (ev.key === "PageUp" || ev.key === "PageDown") {
            const mes = C.mesVecino(d.slice(0, 7), ev.key === "PageUp" ? -1 : 1);
            const ultimo = C.sumarDias(C.mesVecino(mes, 1) + "-01", -1);
            nuevo = mes + "-" + String(Math.min(Number(d.slice(8)), Number(ultimo.slice(8)))).padStart(2, "0");
        }
        if (!nuevo) return;
        ev.preventDefault();
        if (nuevo.slice(0, 7) < estado.minMes || nuevo.slice(0, 7) > estado.maxMes) return;
        elegir(nuevo, true);
    }

    function elegir(d, conFoco) {
        estado.elegido = d;
        if (d.slice(0, 7) !== estado.mes) estado.mes = d.slice(0, 7);
        pintarMes();
        pintarDia();
        if (conFoco) {
            const b = $("cal-vista-mes").querySelector('button[data-dia="' + d + '"]');
            if (b) b.focus();
        }
    }

    function pintarDia() {
        const d = estado.elegido;
        $("cal-dia-titulo").textContent = C.mayuscula(C.nombreDia(d)) + (d === estado.hoy ? " (hoy)" : "");
        const ul = $("cal-dia-lista");
        ul.replaceChildren();
        const { ev, pl } = cosasDelDia(d);
        pl.forEach((p) => ul.appendChild(renglonPlan(p)));
        ev.forEach((e) => ul.appendChild(renglonEvento(e)));
        if (!ev.length && !pl.length) ul.appendChild(el("li", "text-brand-500 dark:text-brand-300", d < estado.hoy ? "Nada anotado ese día." : "Día libre: no hay clase ni entregas."));
    }

    // ---------- La agenda: lo que viene, día por día ----------
    function pintarAgenda() {
        const caja = $("cal-vista-agenda");
        caja.replaceChildren();
        const dias = [];
        for (let i = 0; i < 28; i++) dias.push(C.sumarDias(estado.hoy, i));
        let alguno = false;
        for (const d of dias) {
            const { ev, pl } = cosasDelDia(d);
            if (!ev.length && !pl.length) continue;
            alguno = true;
            const sec = el("section", "mb-5");
            sec.dataset.dia = d;
            sec.appendChild(el("h3", "font-serif font-bold text-brand-800 dark:text-white border-b border-brand-100 dark:border-brand-800 pb-1 mb-2",
                C.mayuscula(C.nombreDia(d)) + (d === estado.hoy ? " (hoy)" : d === C.sumarDias(estado.hoy, 1) ? " (mañana)" : "")));
            const ul = el("ul", "space-y-3 list-none p-0 text-sm");
            pl.forEach((p) => ul.appendChild(renglonPlan(p)));
            ev.forEach((e) => ul.appendChild(renglonEvento(e)));
            sec.appendChild(ul);
            caja.appendChild(sec);
        }
        if (!alguno) caja.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", "No hay nada en las próximas cuatro semanas."));
    }

    function pintarTodo() {
        pintarMes();
        pintarDia();
        pintarAgenda();
    }

    function ponerVista(v) {
        estado.vista = v;
        $("cal-vista-mes").hidden = v !== "mes";
        $("cal-dia").hidden = v !== "mes";
        $("cal-vista-agenda").hidden = v !== "agenda";
        $("cal-ver-mes").setAttribute("aria-pressed", v === "mes" ? "true" : "false");
        $("cal-ver-agenda").setAttribute("aria-pressed", v === "agenda" ? "true" : "false");
        ["cal-anterior", "cal-hoy", "cal-siguiente"].forEach((id) => { $(id).hidden = v !== "mes"; });
        $("cal-mes-titulo").textContent = v === "mes" ? C.mayuscula(C.nombreMes(estado.mes)) : "Las próximas cuatro semanas";
        try { localStorage.setItem("calendario_vista_v1", v); } catch (e) { /* sin almacenamiento, se queda el mes */ }
    }

    // ---------- Los datos ----------
    async function cargarAlumno() {
        const [c, t, x] = await Promise.all([
            sb.rpc("mis_clases_proximas", { p_dias: DIAS_CLASES }),
            sb.rpc("tareas_con_avance", { p_alumno: estado.yo, p_pendientes: true, p_limite: 200 }),
            sb.rpc("examenes_con_nota", { p_alumno: estado.yo, p_limite: 100 }),
        ]);
        if (c.error && t.error && x.error) throw c.error;
        const clases = c.error ? [] : c.data || [];
        const tareas = t.error ? [] : t.data || [];
        const examenes = x.error ? [] : x.data || [];
        const ahora = new Date();
        estado.eventos = C.eventosAlumno({ clases, tareas, examenes, ahora });
        estado.plan = C.planAlumno({ eventos: estado.eventos, tareas, examenes, ahora });
        pintarAvisos(C.avisosAlumno({ eventos: estado.eventos, tareas, examenes, ahora }));
        estado.datosIcs = { clases, tareas, examenes };
        return clases.length + tareas.length + examenes.length;
    }

    async function cargarProfe() {
        const desde = C.semanasDelMes(estado.hoy.slice(0, 7))[0][0];
        const [h, t, x] = await Promise.all([
            sb.from("horario_clases")
                .select("id, dia_semana, hora, duracion_min, grupo, subgrupo_id, titulo, modalidad, desde, hasta")
                .eq("profesor_id", estado.yo),
            sb.rpc("tareas_con_avance", { p_profesor: estado.yo, p_pendientes: true, p_limite: 1000 }),
            sb.rpc("examenes_con_nota", { p_profesor: estado.yo, p_limite: 300 }),
        ]);
        if (h.error && t.error && x.error) throw h.error;
        const filas = h.error ? [] : h.data || [];
        const nombres = {};
        if (filas.some((f) => f.subgrupo_id && !f.titulo)) {
            try {
                const { data } = await sb.rpc("mis_subgrupos");
                (data || []).forEach((s) => { nombres[s.id] = s.nombre; });
            } catch (e) { /* sin nombres, «Grupo …» */ }
        }
        const clases = C.clasesDelHorario(filas, { desde, dias: C.diasEntre(desde, estado.hoy) + DIAS_CLASES, nombres });
        const tareas = t.error ? [] : t.data || [];
        const examenes = (x.error ? [] : x.data || []).filter((e) => e.estado === "asignado" || e.estado === "en_curso");
        const ahora = new Date();
        estado.eventos = C.eventosProfe({ clases, tareas, examenes, ahora });
        estado.plan = C.planProfe({ eventos: estado.eventos, ahora });
        const avisos = C.avisosProfe({ eventos: estado.eventos, tareas, hayHorario: filas.length > 0, ahora });
        /* PostgREST corta a mil filas: si llegaron mil, se dice. */
        if (tareas.length >= 1000) avisos.push({ nivel: "info", texto: "Tienes más de mil tareas sin terminar entre todos tus alumnos: el calendario muestra las que vencen primero. «Tareas» las tiene todas." });
        pintarAvisos(avisos);
        estado.datosIcs = { clases: clases.filter((c) => new Date(c.fin) > ahora) };
        return filas.length + tareas.length + examenes.length;
    }

    async function bajarIcs() {
        const boton = $("cal-bajar"), aviso = $("cal-bajar-estado");
        if (!estado.datosIcs || !window.CalendarioIcs) return;
        const { texto, eventos } = CalendarioIcs.armar(estado.datosIcs);
        if (!eventos) {
            aviso.textContent = estado.modo === "alumno"
                ? "Todavía no hay clases en el horario de tu profe ni tareas o exámenes con fecha. Cuando los haya, vuelve a tocar el botón."
                : "Tu horario no tiene clases por delante. Ponlas en «Asistencia presencial» y vuelve a tocar el botón.";
            return;
        }
        boton.disabled = true;
        CalendarioIcs.bajar(texto, "ajedrez-integral.ics");
        aviso.textContent = "Listo: se bajó «ajedrez-integral.ics» con " + eventos + (eventos === 1 ? " fecha" : " fechas")
            + ". Ábrelo para agregarlas a tu calendario. Si algo cambia, vuelve a bajarlo: se actualiza, no se duplica.";
        boton.disabled = false;
    }

    function prepararModo() {
        if (estado.modo === "profe") {
            $("cal-intro").textContent = "Tus clases del horario y las entregas de tus alumnos en un solo lugar, con qué recordarles antes y qué revisar después de cada entrega.";
            $("cal-plan-titulo").replaceChildren(icono("🧭"), document.createTextNode("Para tus clases"));
            $("cal-plan-intro").textContent = "Cada entrega, en la clase de antes (para recordarla) y en la de después (para revisarla).";
            $("cal-bajar-texto").textContent = "Baja las clases de tu horario para abrirlas en Google Calendar, Outlook o el calendario del celular. Te avisa 30 minutos antes de cada clase.";
            $("cal-filtro-plan").parentElement.lastChild.textContent = " Para tus clases";
        }
    }

    function conectar() {
        $("cal-anterior").addEventListener("click", () => irMes(-1));
        $("cal-siguiente").addEventListener("click", () => irMes(1));
        $("cal-hoy").addEventListener("click", () => elegir(estado.hoy, true));
        $("cal-ver-mes").addEventListener("click", () => ponerVista("mes"));
        $("cal-ver-agenda").addEventListener("click", () => ponerVista("agenda"));
        ["clase", "tarea", "examen", "plan"].forEach((t) => {
            $("cal-filtro-" + t).addEventListener("change", (ev) => { estado.filtros[t] = ev.target.checked; pintarTodo(); });
        });
        $("cal-bajar").addEventListener("click", bajarIcs);
    }
    function irMes(n) {
        const mes = C.mesVecino(estado.mes, n);
        if (mes < estado.minMes || mes > estado.maxMes) return;
        estado.mes = mes;
        estado.elegido = mes === estado.hoy.slice(0, 7) ? estado.hoy : mes + "-01";
        pintarMes();
        pintarDia();
    }

    async function perfil() {
        try {
            const { data } = await sb.from("profiles").select("id, full_name, role, is_admin").eq("id", estado.yo).maybeSingle();
            return data || { id: estado.yo, role: "alumno" };
        } catch (e) { return { id: estado.yo, role: "alumno" }; }
    }

    async function unlock() {
        $("gate").classList.add("hidden");
        $("app").classList.remove("hidden");
        // modo-vista.js se carga con defer: ya está cuando llega DOMContentLoaded.
        if (document.readyState === "loading") await new Promise((r) => document.addEventListener("DOMContentLoaded", r, { once: true }));
        const p = await perfil();
        const MV = window.ModoVista;
        const visto = MV && MV.perfilVisto ? MV.perfilVisto(p) : p;
        estado.modo = visto && visto.role === "alumno" ? "alumno" : "profe";
        const persona = MV && MV.persona ? MV.persona() : null;
        if (persona) {
            $("cal-nota-vista").textContent = "Estás mirando como " + (persona.nombre || "otra persona") + ", pero este calendario es el de tu propia cuenta: las clases y las entregas las da la base solo de quien pregunta.";
            $("cal-nota-vista").hidden = false;
        }

        estado.hoy = C.dia(new Date());
        estado.mes = estado.hoy.slice(0, 7);
        estado.elegido = estado.hoy;
        estado.minMes = C.mesVecino(estado.mes, -1);
        estado.horizonte = C.sumarDias(estado.hoy, DIAS_CLASES - 1);
        estado.maxMes = estado.horizonte.slice(0, 7);
        prepararModo();
        conectar();

        let cuantos = 0;
        try {
            cuantos = estado.modo === "alumno" ? await cargarAlumno() : await cargarProfe();
        } catch (e) {
            $("cal-estado").textContent = "No se pudo leer tu calendario. Revisa tu conexión y vuelve a intentarlo.";
            return;
        }
        estado.porDia = C.porDia(estado.eventos);
        estado.planPorDia = C.porDia(estado.plan);
        $("cal-horizonte").textContent = "Las clases se ven hasta el " + C.nombreDia(estado.horizonte) + "; las tareas y los exámenes, con su fecha.";
        const futuras = estado.eventos.filter((e) => e.dia >= estado.hoy);
        $("cal-cuenta").textContent = futuras.length ? plural(futuras.filter((e) => e.tipo === "clase").length, "clase") + " · "
            + (futuras.length - futuras.filter((e) => e.tipo === "clase").length) + " por entregar" : "";
        $("cal-estado").textContent = cuantos ? "" : estado.modo === "alumno"
            ? "Todavía no tienes clases en el horario de tu profe ni tareas o exámenes con fecha. Cuando los haya, aparecen acá."
            : "Todavía no tienes clases en tu horario ni entregas de tus alumnos.";
        $("cal-estado").hidden = !!cuantos;
        $("cal-contenido").hidden = false;
        pintarPlan();
        pintarTodo();
        let vista = "mes";
        try { if (localStorage.getItem("calendario_vista_v1") === "agenda") vista = "agenda"; } catch (e) { /* el mes */ }
        ponerVista(vista);
    }

    async function requireLoginThenGate() {
        let sesion = null;
        try { const { data } = await sb.auth.getSession(); sesion = data && data.session; } catch (e) { sesion = null; }
        if (!sesion) {
            $("gate-checking").textContent = "Necesitas iniciar sesión para ver tu calendario. Redirigiendo a iniciar sesión…";
            location.href = "login.html?next=" + encodeURIComponent("calendario.html");
            return;
        }
        estado.yo = sesion.user.id;
        $("gate-checking").classList.add("hidden");
        unlock();
    }

    requireLoginThenGate();
})();
