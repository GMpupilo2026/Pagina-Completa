/* El código de temporada.html: el plan de temporada.
 *
 * Una temporada va de una fecha a una competencia, en etapas, y cada etapa
 * reparte el trabajo entre las direcciones del entrenamiento de otra manera.
 * Ver «El plan de temporada» en docs/decisiones/seguimiento-del-alumno.md.
 *
 * - Quien da clase arma las suyas: título, competencia, fechas, alumnos y
 *   etapas. Una fila por alumno en `temporadas`; los que comparten el plan
 *   llevan el mismo `lote` y se editan juntos.
 * - «Cómo va»: el tiempo de cada alumno en la etapa en curso
 *   (`tiempo_por_seccion`), repartido por dirección
 *   (js/direcciones-entrenamiento.js) y comparado con lo planeado
 *   (js/temporada.js, que es puro).
 * - El alumno ve las suyas: la etapa en la que va, en qué poner el énfasis y
 *   cómo va él.
 *
 * Quién ve y escribe qué lo decide la RLS de `temporadas`, no esta página.
 */
(function () {
    "use strict";

    const T = window.Temporada;
    const D = window.DireccionesEntrenamiento;
    const $ = (id) => document.getElementById(id);
    const NOMBRES = {};
    D.DIRECCIONES.forEach((d) => { NOMBRES[d.clave] = d.nombre; });
    const CLAVES = D.DIRECCIONES.map((d) => d.clave);

    const estado = { yo: null, alumnos: [], temporadas: [], editando: null };

    function el(tag, clases, texto) {
        const n = document.createElement(tag);
        if (clases) n.className = clases;
        if (texto != null) n.textContent = texto;
        return n;
    }
    const fecha = (d) => HoraCR.fecha(d, { day: "numeric", month: "long", year: "numeric" });
    const fechaCorta = (d) => HoraCR.fecha(d, { day: "numeric", month: "short" });
    const nombreDe = (id) => {
        const a = estado.alumnos.find((x) => x.id === id);
        return a ? (a.full_name || a.email || "Alumno") : "Alumno";
    };
    const dias = (n) => n + (n === 1 ? " día" : " días");

    // PostgREST corta a ~1000 filas sin avisar: se pide de mil en mil.
    async function traerTodo(construir) {
        const filas = [];
        for (let desde = 0; ; desde += 1000) {
            const { data, error } = await construir().range(desde, desde + 999);
            if (error) throw error;
            filas.push(...(data || []));
            if (!data || data.length < 1000) return filas;
        }
    }

    /* El tiempo de un alumno entre dos días de Costa Rica (incluidos), por
       sección. Los límites van con la hora de Costa Rica puesta: si no, el
       día se cortaría a las 6 de la tarde. */
    async function tiempoEntre(alumno, desde, hasta) {
        const { data, error } = await sb.rpc("tiempo_por_seccion", {
            p_alumno: alumno,
            p_desde: desde + "T00:00:00-06:00",
            p_hasta: HoraCR.sumarDias(hasta, 1) + "T00:00:00-06:00",
        });
        if (error) throw error;
        return D.reparto(data || []);
    }

    // ---------- Lo que se repite en las dos vistas ----------

    /* Una línea de tiempo de las etapas, en lista: la etapa en curso lleva
       aria-current y lo dice en palabras, no solo con el color. */
    function listaDeEtapas(t, hoy) {
        const s = T.situacion(t.etapas, t.fecha_competencia, hoy);
        const ol = el("ol", "grid gap-2 list-none p-0 text-sm");
        (t.etapas || []).forEach((e, i) => {
            const enCurso = s.estado === "en-curso" && s.indice === i;
            const li = el("li", "rounded-xl px-3 py-2 border " + (enCurso
                ? "border-accent-500 bg-accent-50 dark:bg-brand-800"
                : "border-brand-100 dark:border-brand-800"));
            if (enCurso) li.setAttribute("aria-current", "step");
            const cab = el("div", "flex flex-wrap items-baseline justify-between gap-2");
            const nom = el("span", "font-semibold text-brand-800 dark:text-white", (i + 1) + ". " + e.nombre);
            const cuando = el("span", "text-xs text-brand-500 dark:text-brand-300", fechaCorta(e.desde) + " al " + fechaCorta(e.hasta));
            cab.append(nom, cuando);
            if (enCurso) cab.appendChild(el("span", "text-xs font-semibold rounded-full px-2 py-0.5 bg-brand-800 text-white dark:bg-accent-500 dark:text-brand-900", "En curso"));
            li.appendChild(cab);
            const enf = Object.keys(e.enfasis || {}).filter((k) => e.enfasis[k] > 0)
                .sort((a, b) => e.enfasis[b] - e.enfasis[a])
                .map((k) => (NOMBRES[k] || k) + " " + e.enfasis[k] + " %");
            li.appendChild(el("p", "text-xs text-brand-600 dark:text-brand-200 mt-1", enf.join(" · ")));
            if (e.nota) li.appendChild(el("p", "text-xs text-brand-500 dark:text-brand-300 mt-0.5", e.nota));
            ol.appendChild(li);
        });
        return ol;
    }

    function textoSituacion(t, hoy) {
        const s = T.situacion(t.etapas, t.fecha_competencia, hoy);
        const comp = t.competencia ? "«" + t.competencia + "»" : "la competencia";
        const falta = s.faltanCompetencia > 0 ? "Faltan " + dias(s.faltanCompetencia) + " para " + comp + "."
            : s.faltanCompetencia === 0 ? "Hoy es " + comp + "." : comp.charAt(0).toUpperCase() + comp.slice(1) + " ya pasó.";
        if (s.estado === "en-curso") return falta + " Etapa en curso: " + s.etapa.nombre + " (le quedan " + dias(s.quedanEnEtapa + 1) + ").";
        if (s.estado === "por-empezar") return falta + " La primera etapa empieza el " + fecha(s.etapa.desde) + ".";
        if (s.estado === "entre-etapas" && s.etapa) return falta + " La próxima etapa, " + s.etapa.nombre + ", empieza el " + fecha(s.etapa.desde) + ".";
        return falta;
    }

    /* Planeado contra hecho, en una tabla: el veredicto va escrito. */
    function tablaComparacion(t, reparto, propio) {
        const s = T.situacion(t.etapas, t.fecha_competencia, HoraCR.hoy());
        const c = T.comparar(s.etapa.enfasis, reparto, NOMBRES);
        const caja = el("div");
        if (!c.juzgar) {
            const min = Math.round(reparto.repartido || 0);
            caja.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300",
                (propio ? "En esta etapa llevas " : "En esta etapa lleva ") + min + " min de entrenamiento que se puede repartir. "
                + "El reparto se compara desde los " + T.MINUTOS_PARA_JUZGAR + " minutos: con menos, no dice nada."));
        }
        const tabla = el("table", "w-full text-sm mt-2");
        const cap = el("caption", "sr-only", "Lo planeado y lo hecho en la etapa " + s.etapa.nombre);
        const thead = el("thead");
        const trh = el("tr", "text-left text-xs text-brand-450 dark:text-brand-350");
        ["Dirección", "Planeado", "Hecho", ""].forEach((h, i) => {
            const th = el("th", "py-2 pr-3 font-semibold", h);
            th.scope = "col";
            if (i === 3) th.appendChild(el("span", "sr-only", "Cómo va"));
            trh.appendChild(th);
        });
        thead.appendChild(trh);
        const tbody = el("tbody");
        c.filas.forEach((f) => {
            const tr = el("tr", "border-t border-brand-50 dark:border-brand-800/60");
            tr.dataset.direccion = f.clave;
            const th = el("th", "py-1.5 pr-3 text-left font-medium text-brand-700 dark:text-brand-200", f.nombre);
            th.scope = "row";
            const ver = el("td", "py-1.5 text-xs font-semibold " + (f.veredicto === "en línea"
                ? "text-emerald-800 dark:text-emerald-300"
                : f.veredicto ? "text-amber-800 dark:text-amber-300" : ""), f.veredicto);
            ver.className += " tp-veredicto";
            tr.append(th, el("td", "py-1.5 pr-3 tabular-nums", f.objetivo + " %"), el("td", "py-1.5 pr-3 tabular-nums", c.juzgar ? f.hecho + " %" : "—"), ver);
            tbody.appendChild(tr);
        });
        tabla.append(cap, thead, tbody);
        caja.appendChild(tabla);
        if (reparto.aparte && reparto.aparte.some((a) => !a.control && a.minutos >= 0.5)) {
            caja.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mt-2",
                "La clase en vivo, los cursos y el tiempo en Estudio no entran en el reparto: mezclan varias direcciones."));
        }
        return caja;
    }

    // ---------- Vista de quien da clase ----------

    function lotes() {
        const porLote = new Map();
        estado.temporadas.forEach((t) => {
            if (!porLote.has(t.lote)) porLote.set(t.lote, []);
            porLote.get(t.lote).push(t);
        });
        return [...porLote.values()].sort((a, b) => a[0].fecha_competencia < b[0].fecha_competencia ? -1 : 1);
    }

    function pintarLista() {
        const ul = $("tp-lista");
        ul.innerHTML = "";
        const ls = lotes();
        $("tp-lista-vacia").hidden = !!ls.length;
        const hoy = HoraCR.hoy();
        ls.forEach((filas) => {
            const t = filas[0];
            const li = el("li", "bg-white dark:bg-brand-900 rounded-2xl shadow-sm p-4");
            li.dataset.lote = t.lote;
            const cab = el("div", "flex flex-wrap items-baseline justify-between gap-2");
            cab.appendChild(el("h3", "font-semibold text-brand-800 dark:text-white", t.titulo));
            const abrir = el("button", "text-sm font-semibold text-accent-700 dark:text-accent-400 underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Abrir");
            abrir.type = "button";
            abrir.setAttribute("aria-label", "Abrir la temporada «" + t.titulo + "»");
            abrir.addEventListener("click", () => abrirLote(t.lote));
            cab.appendChild(abrir);
            li.appendChild(cab);
            li.appendChild(el("p", "text-xs text-brand-500 dark:text-brand-300 mt-1",
                (t.competencia ? t.competencia + " · " : "") + fecha(t.fecha_competencia) + " · "
                + filas.length + (filas.length === 1 ? " alumno: " : " alumnos: ")
                + filas.map((f) => nombreDe(f.alumno_id)).join(", ")));
            li.appendChild(el("p", "text-sm text-brand-700 dark:text-brand-200 mt-1", textoSituacion(t, hoy)));
            ul.appendChild(li);
        });
    }

    async function cargarProfe() {
        estado.temporadas = await traerTodo(() => sb.from("temporadas").select("*").eq("profesor_id", estado.yo)
            .order("fecha_competencia").order("id"));
        pintarLista();
    }

    async function cargarAlumnosDelProfe() {
        const data = await traerTodo(() => sb.from("profiles").select("id, full_name, email").eq("role", "alumno")
            .order("full_name").order("id"));
        estado.alumnos = window.AlumnosMios ? await AlumnosMios.sumarProfesores(sb, data) : data;
    }

    function pintarAlumnosElegibles(marcados) {
        const cont = $("tp-alumnos");
        cont.innerHTML = "";
        $("tp-sin-alumnos").hidden = !!estado.alumnos.length;
        estado.alumnos.forEach((a) => {
            const label = el("label", "flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-white dark:hover:bg-brand-900 cursor-pointer");
            const cb = el("input", "rounded border-brand-300 text-accent-500 focus:ring-accent-400 tp-alumno");
            cb.type = "checkbox";
            cb.value = a.id;
            cb.checked = marcados.has(a.id);
            label.append(cb, el("span", null, a.full_name || a.email || "Alumno"));
            cont.appendChild(label);
        });
    }

    // Una etapa en el armador: nombre, fechas, nota y un porcentaje por dirección.
    function campo(etiqueta, input) {
        const w = el("div");
        const l = el("label", "block text-xs font-semibold text-brand-600 dark:text-brand-300 mb-1", etiqueta);
        l.htmlFor = input.id;
        w.append(l, input);
        return w;
    }
    let etapaSeq = 0;
    function cajaEtapa(e) {
        const n = ++etapaSeq;
        const fs = el("fieldset", "tp-etapa rounded-xl border border-brand-100 dark:border-brand-800 p-3");
        const leg = el("legend", "px-1 text-sm font-semibold text-brand-800 dark:text-white");
        fs.appendChild(leg);
        const inp = (tipo, clase, valor, extra) => {
            const i = el("input", clase + " w-full bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
            i.type = tipo; i.value = valor == null ? "" : valor; i.id = clase + "-" + n;
            Object.assign(i, extra || {});
            return i;
        };
        const fila = el("div", "grid gap-3 sm:grid-cols-4 mb-3");
        const nombre = inp("text", "tp-e-nombre", e.nombre, { maxLength: 60 });
        const w1 = campo("Nombre", nombre); w1.className = "sm:col-span-2";
        fila.append(w1, campo("Desde", inp("date", "tp-e-desde", e.desde)), campo("Hasta", inp("date", "tp-e-hasta", e.hasta)));
        fs.appendChild(fila);

        const grid = el("div", "grid gap-2 grid-cols-2 sm:grid-cols-4");
        D.DIRECCIONES.forEach((d) => {
            const i = inp("number", "tp-e-pct", (e.enfasis || {})[d.clave] || 0, { min: 0, max: 100, step: 1 });
            i.id = "tp-e-pct-" + d.clave + "-" + n;
            i.dataset.direccion = d.clave;
            grid.appendChild(campo(d.nombre + " (%)", i));
        });
        fs.appendChild(grid);
        const suma = el("p", "tp-e-suma text-xs mt-2 font-semibold", "");
        suma.setAttribute("aria-live", "polite");
        fs.appendChild(suma);
        const nota = inp("text", "tp-e-nota", e.nota, { maxLength: 200 });
        const wn = campo("Nota de la etapa (opcional)", nota); wn.className = "mt-2";
        fs.appendChild(wn);
        const quitar = el("button", "mt-2 text-xs font-semibold text-red-700 dark:text-red-300 underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Quitar esta etapa");
        quitar.type = "button";
        quitar.addEventListener("click", () => { fs.remove(); numerarEtapas(); });
        fs.appendChild(quitar);
        fs.addEventListener("input", () => { sumar(fs); numerarEtapas(); });
        sumar(fs);
        return fs;
    }
    function sumar(fs) {
        const total = [...fs.querySelectorAll(".tp-e-pct")].reduce((s, i) => s + (parseInt(i.value, 10) || 0), 0);
        const p = fs.querySelector(".tp-e-suma");
        p.textContent = "Suma: " + total + " %" + (total === 100 ? " (bien)" : " (tiene que dar 100)");
        p.className = "tp-e-suma text-xs mt-2 font-semibold " + (total === 100 ? "text-emerald-800 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300");
    }
    function numerarEtapas() {
        [...document.querySelectorAll("#tp-etapas .tp-etapa")].forEach((fs, i) => {
            const nombre = fs.querySelector(".tp-e-nombre").value.trim();
            fs.querySelector("legend").textContent = "Etapa " + (i + 1) + (nombre ? ": " + nombre : "");
        });
    }
    function pintarEtapas(etapas) {
        const cont = $("tp-etapas");
        cont.innerHTML = "";
        etapas.forEach((e) => cont.appendChild(cajaEtapa(e)));
        numerarEtapas();
    }
    function leerEtapas() {
        return [...document.querySelectorAll("#tp-etapas .tp-etapa")].map((fs) => {
            const enfasis = {};
            fs.querySelectorAll(".tp-e-pct").forEach((i) => {
                const v = i.value === "" ? 0 : Number(i.value);
                if (v !== 0) enfasis[i.dataset.direccion] = v;
            });
            const nota = fs.querySelector(".tp-e-nota").value.trim();
            const e = { nombre: fs.querySelector(".tp-e-nombre").value.trim(),
                        desde: fs.querySelector(".tp-e-desde").value, hasta: fs.querySelector(".tp-e-hasta").value, enfasis };
            if (nota) e.nota = nota;
            return e;
        });
    }

    function abrirEditor(filas) {
        estado.editando = filas ? filas[0].lote : null;
        const t = filas ? filas[0] : null;
        $("tp-editor-titulo").textContent = t ? "Editar «" + t.titulo + "»" : "Nueva temporada";
        $("tp-titulo").value = t ? t.titulo : "";
        $("tp-competencia").value = t ? (t.competencia || "") : "";
        $("tp-inicio").value = t ? t.inicio : HoraCR.hoy();
        $("tp-fecha").value = t ? t.fecha_competencia : "";
        $("tp-nota").value = t ? (t.nota || "") : "";
        pintarAlumnosElegibles(new Set(filas ? filas.map((f) => f.alumno_id) : []));
        pintarEtapas(t ? t.etapas || [] : []);
        $("tp-problemas").hidden = true;
        $("tp-borrar").hidden = !t;
        $("tp-editor").hidden = false;
        $("tp-editor-titulo").focus();
    }

    async function abrirLote(lote) {
        const filas = estado.temporadas.filter((t) => t.lote === lote);
        if (!filas.length) return;
        abrirEditor(filas);
        await pintarComoVa(filas);
    }

    function proponer() {
        const inicio = $("tp-inicio").value, comp = $("tp-fecha").value;
        const propuesta = T.proponer(inicio, comp);
        if (!propuesta.length) {
            Avisos.avisar("Para proponer etapas, pon las dos fechas, con al menos " + T.MIN_DIAS + " días entre una y otra.", { tipo: "error" });
            return;
        }
        pintarEtapas(propuesta);
        Avisos.avisar("Listo: " + propuesta.length + " etapas. Revisa las fechas y los porcentajes antes de guardar.");
    }

    async function guardar(ev) {
        ev.preventDefault();
        const datos = {
            titulo: $("tp-titulo").value.trim(),
            competencia: $("tp-competencia").value.trim() || null,
            inicio: $("tp-inicio").value,
            fecha_competencia: $("tp-fecha").value,
            etapas: leerEtapas(),
            nota: $("tp-nota").value.trim() || null,
        };
        const alumnos = [...document.querySelectorAll(".tp-alumno:checked")].map((c) => c.value);
        const p = [];
        if (!datos.titulo) p.push("Ponle un título.");
        if (!datos.inicio || !datos.fecha_competencia) p.push("Faltan las fechas de inicio y de la competencia.");
        else if (datos.fecha_competencia < datos.inicio) p.push("La competencia es antes del inicio.");
        if (!alumnos.length) p.push("Marca al menos un alumno.");
        p.push(...T.problemas(datos.etapas, datos.fecha_competencia, CLAVES));
        if (datos.etapas.length && datos.inicio && T.numeroDeDia(datos.etapas[0].desde) < T.numeroDeDia(datos.inicio)) {
            p.push("La primera etapa empieza antes del inicio de la temporada.");
        }
        const caja = $("tp-problemas");
        if (p.length) {
            caja.innerHTML = "";
            caja.appendChild(el("p", "font-semibold mb-1", "Antes de guardar, falta arreglar:"));
            const ul = el("ul", "list-disc pl-5");
            p.forEach((x) => ul.appendChild(el("li", null, x)));
            caja.appendChild(ul);
            caja.hidden = false;
            caja.scrollIntoView({ block: "nearest" });
            return;
        }
        caja.hidden = true;
        const boton = $("tp-guardar");
        boton.disabled = true;
        try {
            if (!estado.editando) {
                const lote = crypto.randomUUID();
                const { error } = await sb.from("temporadas").insert(alumnos.map((a) => Object.assign({ lote, alumno_id: a, profesor_id: estado.yo }, datos)));
                if (error) throw error;
                estado.editando = lote;
            } else {
                const lote = estado.editando;
                const antes = estado.temporadas.filter((t) => t.lote === lote).map((t) => t.alumno_id);
                const quitar = antes.filter((a) => !alumnos.includes(a));
                const sumar = alumnos.filter((a) => !antes.includes(a));
                if (quitar.length && !(await Avisos.confirmar("Vas a sacar de esta temporada a " + quitar.map(nombreDe).join(", ") + ". Su plan se borra.",
                    { titulo: "Sacar alumnos", aceptar: "Sí, sacarlos", peligro: true }))) return;
                const { error } = await sb.from("temporadas").update(datos).eq("lote", lote).eq("profesor_id", estado.yo);
                if (error) throw error;
                if (quitar.length) {
                    const r = await sb.from("temporadas").delete().eq("lote", lote).in("alumno_id", quitar);
                    if (r.error) throw r.error;
                }
                if (sumar.length) {
                    const r = await sb.from("temporadas").insert(sumar.map((a) => Object.assign({ lote, alumno_id: a, profesor_id: estado.yo }, datos)));
                    if (r.error) throw r.error;
                }
            }
            // Se vuelve a LEER: lo que se pinta es lo que quedó en la base.
            await cargarProfe();
            Avisos.avisar("Temporada guardada.");
            await abrirLote(estado.editando);
        } catch (e) {
            console.error(e);
            Avisos.avisar("No se pudo guardar la temporada. Revisa tu conexión y vuelve a intentarlo.", { tipo: "error" });
        } finally {
            boton.disabled = false;
        }
    }

    async function borrar() {
        const lote = estado.editando;
        if (!lote) return;
        const filas = estado.temporadas.filter((t) => t.lote === lote);
        if (!(await Avisos.confirmar("Se borra «" + filas[0].titulo + "» para " + filas.length + (filas.length === 1 ? " alumno" : " alumnos") + ". No se puede deshacer.",
            { titulo: "Borrar la temporada", aceptar: "Sí, borrarla", peligro: true }))) return;
        const { error } = await sb.from("temporadas").delete().eq("lote", lote).eq("profesor_id", estado.yo);
        if (error) { Avisos.avisar("No se pudo borrar. Vuelve a intentarlo.", { tipo: "error" }); return; }
        cerrarEditor();
        await cargarProfe();
        Avisos.avisar("Temporada borrada.");
    }

    function cerrarEditor() {
        estado.editando = null;
        $("tp-editor").hidden = true;
        $("tp-como-va").hidden = true;
    }

    async function pintarComoVa(filas) {
        const t = filas[0];
        const hoy = HoraCR.hoy();
        const s = T.situacion(t.etapas, t.fecha_competencia, hoy);
        const sec = $("tp-como-va");
        const cuerpo = $("tp-como-va-cuerpo");
        cuerpo.innerHTML = "";
        sec.hidden = false;
        if (s.estado !== "en-curso") {
            $("tp-como-va-sub").textContent = textoSituacion(t, hoy) + " Cuando haya una etapa en curso, acá se compara lo planeado con lo que hizo cada alumno.";
            return;
        }
        $("tp-como-va-sub").textContent = "Etapa en curso: " + s.etapa.nombre + ", del " + fecha(s.etapa.desde) + " al " + fecha(s.etapa.hasta)
            + ". Se compara lo planeado con su tiempo en la plataforma desde que empezó la etapa (con " + T.TOLERANCIA + " puntos de margen).";
        for (const f of filas) {
            const caja = el("div", "tp-alumno-como-va");
            caja.dataset.alumno = f.alumno_id;
            caja.appendChild(el("h3", "font-semibold text-brand-800 dark:text-white", nombreDe(f.alumno_id)));
            cuerpo.appendChild(caja);
            try {
                const rep = await tiempoEntre(f.alumno_id, s.etapa.desde, hoy < s.etapa.hasta ? hoy : s.etapa.hasta);
                caja.appendChild(tablaComparacion(f, rep, false));
            } catch (e) {
                caja.appendChild(el("p", "text-sm text-red-700 dark:text-red-300", "No se pudo leer su tiempo. Vuelve a intentarlo en un rato."));
            }
        }
    }

    // ---------- Vista del alumno ----------

    async function cargarAlumno() {
        const mias = await traerTodo(() => sb.from("temporadas").select("*").eq("alumno_id", estado.yo)
            .order("fecha_competencia").order("id"));
        const cont = $("tp-mias");
        cont.innerHTML = "";
        const hoy = HoraCR.hoy();
        // Las que ya pasaron hace más de un mes no se muestran: ya no guían nada.
        const vigentes = mias.filter((t) => T.numeroDeDia(t.fecha_competencia) >= T.numeroDeDia(hoy) - 30);
        if (!vigentes.length) {
            $("tp-estado").textContent = "Tu profe todavía no te armó un plan de temporada. Cuando lo haga, aquí vas a ver en qué etapa vas y en qué poner el énfasis.";
            $("tp-estado").hidden = false;
            return;
        }
        for (const t of vigentes) {
            const sec = el("section", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5");
            sec.dataset.temporada = t.id;
            sec.appendChild(el("h2", "font-serif text-xl font-bold text-brand-800 dark:text-white", t.titulo));
            sec.appendChild(el("p", "text-sm text-brand-700 dark:text-brand-200 mt-1 mb-3", textoSituacion(t, hoy)));
            if (t.nota) sec.appendChild(el("p", "text-sm rounded-xl px-3 py-2 mb-3 bg-brand-50 dark:bg-brand-800 text-brand-800 dark:text-white", t.nota));
            sec.appendChild(listaDeEtapas(t, hoy));
            const s = T.situacion(t.etapas, t.fecha_competencia, hoy);
            if (s.estado === "en-curso") {
                sec.appendChild(el("h3", "font-semibold text-brand-800 dark:text-white mt-4", "Cómo vas en esta etapa"));
                try {
                    const rep = await tiempoEntre(estado.yo, s.etapa.desde, hoy < s.etapa.hasta ? hoy : s.etapa.hasta);
                    sec.appendChild(tablaComparacion(t, rep, true));
                } catch (e) {
                    sec.appendChild(el("p", "text-sm text-red-700 dark:text-red-300", "No se pudo leer tu tiempo. Vuelve a intentarlo en un rato."));
                }
            }
            cont.appendChild(sec);
        }
        $("tp-estado").hidden = true;
    }

    // ---------- Arranque ----------

    async function unlock() {
        $("gate").classList.add("hidden");
        $("app").classList.remove("hidden");
        if (document.readyState === "loading") await new Promise((r) => document.addEventListener("DOMContentLoaded", r, { once: true }));
        let p = null;
        try {
            const { data } = await sb.from("profiles").select("id, role, is_admin").eq("id", estado.yo).maybeSingle();
            p = data;
        } catch (e) { p = null; }
        p = p || { id: estado.yo, role: "alumno" };
        const MV = window.ModoVista;
        const visto = MV && MV.perfilVisto ? MV.perfilVisto(p) : p;
        const profe = visto.role === "profesor";
        const persona = MV && MV.persona ? MV.persona() : null;
        if (persona) {
            $("tp-nota-vista").textContent = "Estás mirando como " + (persona.nombre || "otra persona") + ", pero esta página es la de tu propia cuenta: las temporadas las da la base solo de quien pregunta.";
            $("tp-nota-vista").hidden = false;
        }
        try {
            if (profe) {
                $("tp-intro").textContent = "Arma el camino hasta una competencia, por etapas: cada etapa reparte el trabajo entre aperturas, medio juego, finales, ejercicios y lo demás de otra manera, y aquí ves si cada alumno va en línea con lo planeado.";
                $("tp-profe").hidden = false;
                $("tp-nueva").addEventListener("click", () => { abrirEditor(null); $("tp-como-va").hidden = true; });
                $("tp-proponer").addEventListener("click", proponer);
                $("tp-agregar-etapa").addEventListener("click", () => {
                    const ult = leerEtapas().pop();
                    const desde = ult && ult.hasta ? HoraCR.sumarDias(ult.hasta, 1) : $("tp-inicio").value;
                    $("tp-etapas").appendChild(cajaEtapa({ nombre: "", desde, hasta: "", enfasis: {} }));
                    numerarEtapas();
                });
                $("tp-form").addEventListener("submit", guardar);
                $("tp-cancelar").addEventListener("click", cerrarEditor);
                $("tp-borrar").addEventListener("click", borrar);
                await cargarAlumnosDelProfe();
                await cargarProfe();
                $("tp-estado").hidden = true;
            } else {
                $("tp-intro").textContent = "El plan que te armó tu profe hasta la competencia: en qué etapa vas, en qué poner el énfasis y cómo vas.";
                $("tp-alumno").hidden = false;
                await cargarAlumno();
            }
        } catch (e) {
            console.error(e);
            $("tp-estado").textContent = "No se pudo leer el plan de temporada. Revisa tu conexión y vuelve a intentarlo.";
            $("tp-estado").hidden = false;
        }
    }

    async function requireLoginThenGate() {
        let sesion = null;
        try { const { data } = await sb.auth.getSession(); sesion = data && data.session; } catch (e) { sesion = null; }
        if (!sesion) {
            $("gate-checking").textContent = "Necesitas iniciar sesión para ver el plan de temporada. Redirigiendo a iniciar sesión…";
            location.href = "login.html?next=" + encodeURIComponent("temporada.html");
            return;
        }
        estado.yo = sesion.user.id;
        $("gate-checking").classList.add("hidden");
        unlock();
    }

    requireLoginThenGate();
})();

/*! rev bfb5bbb0d2d82f9f */
