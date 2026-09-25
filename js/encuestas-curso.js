/* encuestas-curso.html — quien administra arma la encuesta anónima de cada
 * curso, comparte su enlace y lee los resultados.
 *
 * Todo lo decide la base: `encuestas_curso` y sus respuestas solo las ve y las
 * escribe quien administra (soy_admin()), y las cuentas las hace
 * resumen_encuesta_curso() (INVOKER, con la RLS). Las respuestas no dicen de
 * quién son: ni cuenta, ni IP, ni hora (solo el día).
 *
 * Las preguntas salen de js/encuesta-curso-preguntas.js, la misma copia que lee
 * el público en encuesta-curso.html; los promedios se escriben con
 * EncuestaPreguntas.nota()/lectura() (js/encuesta-preguntas.js).
 */
(function () {
    const P = window.EncuestaCursoPreguntas;
    const N = window.EncuestaPreguntas;
    let encuestas = [];

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }
    function boton(texto, clase) {
        const b = el("button", clase || "text-sm font-semibold text-accent-700 dark:text-accent-400 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto);
        b.type = "button";
        return b;
    }

    /* El enlace que se comparte NO lleva la marca del sitio: va por la
       dirección de Cloudflare del mismo worker (orange-water-b162), que sirve
       exactamente los mismos archivos que ajedrez-integral.com. Se pidió así:
       la encuesta se manda fuera de la Academia. Si algún día se apaga el
       subdominio workers.dev en Cloudflare, estos enlaces dejan de abrir:
       ver «La encuesta anónima de un curso». */
    const DIRECCION_SIN_MARCA = "https://orange-water-b162.gmpupilo.workers.dev/";
    function enlace(slug) { return DIRECCION_SIN_MARCA + "encuesta-curso.html?e=" + encodeURIComponent(slug); }

    function slugDe(curso) {
        const base = curso.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
            .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "curso";
        const azar = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
        return (base + "-" + azar).replace(/^-/, "");
    }

    function pct(n, total) { return total ? Math.round((100 * n) / total) + " %" : "—"; }

    /* Una lista de «opción: cuántos (porcentaje)», en el orden de las opciones. */
    function reparto(titulo, opciones, cuentas, total) {
        const caja = el("div", "");
        caja.appendChild(el("h4", "font-semibold text-brand-800 dark:text-white mb-1", titulo));
        const ul = el("ul", "text-sm space-y-0.5");
        opciones.forEach((o) => {
            const n = (cuentas || {})[o.valor] || 0;
            ul.appendChild(el("li", "", o.texto + ": " + n + " (" + pct(n, total) + ")"));
        });
        caja.appendChild(ul);
        return caja;
    }

    async function pintarResultados(caja, e) {
        caja.replaceChildren(el("p", "text-sm text-brand-450 dark:text-brand-350", "Cargando los resultados…"));
        const { data: res, error } = await sb.rpc("resumen_encuesta_curso", { p_encuesta: e.id });
        if (error) { caja.replaceChildren(el("p", "text-sm text-red-700 dark:text-red-300", "No se pudieron cargar los resultados: " + error.message)); return; }
        caja.replaceChildren();
        const total = res.respuestas || 0;
        if (!total) { caja.appendChild(el("p", "text-sm text-brand-450 dark:text-brand-350", "Todavía nadie contestó esta encuesta. Comparte el enlace con las personas del curso.")); return; }

        // La deserción, lo primero y escrito: es la pregunta que motivó la encuesta.
        const a = res.asistencia || {};
        const dejo = a.dejo || 0, aVeces = a.a_veces || 0;
        const des = el("div", "rounded-xl bg-brand-50 dark:bg-brand-950 border border-brand-100 dark:border-brand-800 p-4");
        des.appendChild(el("h4", "font-semibold text-brand-800 dark:text-white", "Deserción"));
        des.appendChild(el("p", "text-sm mt-1",
            total + (total === 1 ? " respuesta. " : " respuestas. ") +
            (dejo === 1 ? "1 persona dice que dejó el curso" : dejo + " personas dicen que dejaron el curso") + " (" + pct(dejo, total) + ")" +
            " y " + aVeces + " va" + (aVeces === 1 ? "" : "n") + " solo a veces (" + pct(aVeces, total) + ")."));
        const motivos = Object.entries(res.motivos || {}).sort((x, y) => y[1] - x[1]);
        if (motivos.length) {
            des.appendChild(el("p", "text-sm font-semibold mt-2", "Por qué, de lo más dicho a lo menos:"));
            const ul = el("ul", "text-sm list-disc pl-5");
            motivos.forEach(([m, n]) => ul.appendChild(el("li", "", P.texto(P.MOTIVOS, m) + ": " + n)));
            des.appendChild(ul);
        }
        caja.appendChild(des);

        // La forma de enseñar: el promedio escrito, con su lectura en palabras.
        const met = el("div", "mt-4 overflow-x-auto");
        met.appendChild(el("h4", "font-semibold text-brand-800 dark:text-white mb-1", "La forma de enseñar (del 1 al 5)"));
        const t = el("table", "w-full text-sm");
        t.appendChild(el("caption", "sr-only", "Promedio de cada frase sobre la forma de enseñar, del 1 al 5"));
        const th = el("tr", "text-left text-brand-450 dark:text-brand-350 border-b border-brand-100 dark:border-brand-800");
        ["Frase", "Promedio", "Cómo va", "Contestaron"].forEach((x, i) => { const c = el("th", "py-1.5 pr-3 font-semibold" + (i ? " whitespace-nowrap" : ""), x); c.scope = "col"; th.appendChild(c); });
        const thead = el("thead"); thead.appendChild(th); t.appendChild(thead);
        const tb = el("tbody");
        P.METODOLOGIA.forEach((m) => {
            const x = (res.notas || {})[m.clave] || {};
            const tr = el("tr", "border-b border-brand-50 dark:border-brand-800 align-top");
            const c0 = el("th", "py-1.5 pr-3 font-normal text-left", m.texto); c0.scope = "row";
            tr.append(c0,
                el("td", "py-1.5 pr-3 tabular-nums font-semibold whitespace-nowrap", x.promedio == null ? "—" : N.nota(x.promedio) + " de 5"),
                el("td", "py-1.5 pr-3 whitespace-nowrap", x.promedio == null ? "Sin datos" : (Number(x.promedio) < 3 ? "⚠️ " : "") + N.lectura(x.promedio)),
                el("td", "py-1.5 tabular-nums whitespace-nowrap", (x.n || 0) + " de " + total));
            tb.appendChild(tr);
        });
        t.appendChild(tb);
        met.appendChild(t);
        caja.appendChild(met);

        const g = el("div", "mt-4 grid sm:grid-cols-3 gap-4");
        g.append(
            reparto("Hasta dónde aprendieron", P.APRENDIZAJE, res.aprendizaje, total),
            reparto("¿Fue lo bastante básico?", P.SUFICIENTE, res.suficiente, total),
            reparto("¿Lo recomendarían?", P.RECOMENDARIA, res.recomendaria, total));
        caja.appendChild(g);

        // Expectativas frente a realidad, respuesta por respuesta.
        const { data: filas, error: e2 } = await sb.from("encuesta_curso_respuestas")
            .select("fecha, asistencia, motivo_otro, expectativas, realidad, comentario")
            .eq("encuesta_id", e.id).order("fecha", { ascending: false }).range(0, 999);
        const txt = el("div", "mt-4");
        txt.appendChild(el("h4", "font-semibold text-brand-800 dark:text-white mb-1", "Lo que esperaban y lo que encontraron"));
        if (e2) { txt.appendChild(el("p", "text-sm text-red-700 dark:text-red-300", "No se pudieron cargar los comentarios: " + e2.message)); caja.appendChild(txt); return; }
        const conTexto = (filas || []).filter((f) => f.expectativas || f.realidad || f.comentario || f.motivo_otro);
        if (!conTexto.length) txt.appendChild(el("p", "text-sm text-brand-450 dark:text-brand-350", "Nadie escribió comentarios todavía."));
        const ul = el("ul", "space-y-2");
        conTexto.forEach((f) => {
            const li = el("li", "rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-100 dark:border-brand-800 px-3 py-2.5 text-sm");
            li.appendChild(el("p", "text-xs text-brand-500 dark:text-brand-300", "Respuesta anónima · " + P.texto(P.ASISTENCIA, f.asistencia)));
            [["Esperaba", f.expectativas], ["Encontró", f.realidad], ["Otro motivo para faltar", f.motivo_otro], ["Además", f.comentario]].forEach(([r, v]) => {
                if (!v) return;
                const p = el("p", "mt-1 whitespace-pre-wrap break-words");
                p.append(el("strong", "", r + ": "), document.createTextNode(v));
                li.appendChild(p);
            });
            ul.appendChild(li);
        });
        txt.appendChild(ul);
        caja.appendChild(txt);
    }

    /* Todas las respuestas, de mil en mil: PostgREST corta ahí sin avisar. */
    async function descargarCsv(e) {
        const filas = [];
        for (let desde = 0; ; desde += 1000) {
            const { data, error } = await sb.from("encuesta_curso_respuestas")
                .select("fecha, asistencia, motivos, motivo_otro, desde_cero, describe, ritmo, dudas, guia, accesible, aprendizaje, suficiente, recomendaria, expectativas, realidad, comentario")
                .eq("encuesta_id", e.id).order("fecha", { ascending: true }).range(desde, desde + 999);
            if (error) { Avisos.avisar("No se pudo armar el archivo: " + error.message, { tipo: "error" }); return; }
            (data || []).forEach((f) => filas.push([
                f.fecha, P.texto(P.ASISTENCIA, f.asistencia),
                (f.motivos || []).map((m) => P.texto(P.MOTIVOS, m)).join(" | "), f.motivo_otro,
                ...P.METODOLOGIA.map((m) => (f[m.clave] == null ? "No sé" : f[m.clave])),
                P.texto(P.APRENDIZAJE, f.aprendizaje), P.texto(P.SUFICIENTE, f.suficiente), P.texto(P.RECOMENDARIA, f.recomendaria),
                f.expectativas, f.realidad, f.comentario,
            ]));
            if (!data || data.length < 1000) break;
        }
        if (!filas.length) { Avisos.avisar("Esta encuesta todavía no tiene respuestas.", { tipo: "error" }); return; }
        DetalleMensual.csv("encuesta-" + e.slug + ".csv",
            ["Día", "Asistencia", "Motivos", "Otro motivo", ...P.METODOLOGIA.map((m) => m.corto + " (1-5)"),
             "Hasta dónde aprendió", "¿Fue lo bastante básico?", "¿Lo recomendaría?", "Esperaba", "Encontró", "Comentario"], filas);
    }

    function pintarLista() {
        const lista = document.getElementById("lista");
        lista.replaceChildren();
        document.getElementById("vacio").hidden = encuestas.length > 0;
        encuestas.forEach((e) => {
            const card = el("article", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5");
            card.setAttribute("aria-label", e.curso);
            const cab = el("div", "flex flex-wrap items-baseline justify-between gap-2");
            const tit = el("h3", "font-serif text-lg font-bold text-brand-800 dark:text-white", e.curso);
            const est = el("span", "text-sm font-semibold " + (e.abierta ? "text-brand-700 dark:text-brand-200" : "text-brand-500 dark:text-brand-300"),
                e.abierta ? "🟢 Abierta: recibe respuestas" : "⏸️ Cerrada: no recibe respuestas");
            cab.append(tit, est);
            card.appendChild(cab);
            card.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", e.profesor ? "Profesor: " + e.profesor : "Sin profesor nombrado"));

            const link = el("code", "block mt-2 text-xs bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1.5 break-all", enlace(e.slug));
            card.appendChild(link);

            const acc = el("div", "mt-3 flex flex-wrap items-center gap-x-4 gap-y-2");
            const copiar = boton("Copiar el enlace", "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-3 py-1.5 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
            copiar.addEventListener("click", async () => {
                try {
                    await navigator.clipboard.writeText(enlace(e.slug));
                    Avisos.avisar("Enlace copiado: pégalo en el grupo del curso.", { tipo: "ok" });
                } catch (x) {
                    Avisos.avisar("No se pudo copiar solo: selecciona el enlace y cópialo a mano.", { tipo: "error" });
                }
            });
            const ver = boton("Ver resultados");
            const panel = el("div", "mt-4");
            panel.id = "resultados-" + e.id;
            panel.hidden = true;
            ver.setAttribute("aria-expanded", "false");
            ver.setAttribute("aria-controls", panel.id);
            ver.addEventListener("click", async () => {
                const abrir = panel.hidden;
                panel.hidden = !abrir;
                ver.setAttribute("aria-expanded", String(abrir));
                ver.textContent = abrir ? "Ocultar resultados" : "Ver resultados";
                if (abrir) await pintarResultados(panel, e);
            });
            const csv = boton("⬇ Descargar CSV");
            csv.addEventListener("click", () => descargarCsv(e));
            const alternar = boton(e.abierta ? "Cerrar la encuesta" : "Abrirla de nuevo");
            alternar.addEventListener("click", async () => {
                const { error } = await sb.from("encuestas_curso").update({ abierta: !e.abierta }).eq("id", e.id);
                if (error) { Avisos.avisar("No se pudo cambiar: " + error.message, { tipo: "error" }); return; }
                Avisos.avisar(e.abierta ? "Encuesta cerrada: ya no recibe respuestas." : "Encuesta abierta otra vez.", { tipo: "ok" });
                await cargar();
            });
            const borrar = boton("Borrar", "text-sm font-semibold text-red-700 dark:text-red-300 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
            borrar.addEventListener("click", async () => {
                if (!(await Avisos.confirmar("Se borran también todas sus respuestas, y el enlace deja de funcionar. No se puede deshacer.", { titulo: "¿Borrar la encuesta «" + e.curso + "»?", aceptar: "Borrar la encuesta y sus respuestas", peligro: true }))) return;
                const { error } = await sb.from("encuestas_curso").delete().eq("id", e.id);
                if (error) { Avisos.avisar("No se pudo borrar: " + error.message, { tipo: "error" }); return; }
                await cargar();
            });
            acc.append(copiar, ver, csv, alternar, borrar);
            card.append(acc, panel);
            lista.appendChild(card);
        });
    }

    let profesores = new Map();

    async function cargar() {
        const { data, error } = await sb.from("encuestas_curso")
            .select("id, slug, curso, profesor_id, abierta, created_at")
            .order("created_at", { ascending: false }).range(0, 999);
        if (error) { Avisos.avisar("No se pudieron cargar las encuestas: " + error.message, { tipo: "error" }); return; }
        encuestas = (data || []).map((e) => Object.assign({}, e, { profesor: profesores.get(e.profesor_id) || null }));
        pintarLista();
    }

    async function cargarProfesores() {
        const { data } = await sb.from("profiles").select("id, full_name, email")
            .eq("role", "profesor").order("full_name", { ascending: true }).range(0, 999);
        const sel = document.getElementById("profesor");
        (data || []).forEach((p) => {
            const nombre = (p.full_name || "").trim() || String(p.email || "").split("@")[0];
            profesores.set(p.id, nombre);
            const o = el("option", "", nombre);
            o.value = p.id;
            sel.appendChild(o);
        });
    }

    async function crear(ev) {
        ev.preventDefault();
        const curso = document.getElementById("curso").value.trim();
        if (curso.length < 3) { Avisos.avisar("Escribe el nombre del curso (al menos 3 letras).", { tipo: "error" }); document.getElementById("curso").focus(); return; }
        const profesor_id = document.getElementById("profesor").value || null;
        const { error } = await sb.from("encuestas_curso").insert({ slug: slugDe(curso), curso, profesor_id });
        if (error) { Avisos.avisar("No se pudo crear: " + error.message, { tipo: "error" }); return; }
        document.getElementById("crear").reset();
        Avisos.avisar("Encuesta creada. Copia su enlace y compártelo con el curso.", { tipo: "ok" });
        await cargar();
    }

    async function init() {
        const { data } = await sb.auth.getSession();
        const session = data.session;
        if (!session) { location.href = "login.html?next=encuestas-curso.html"; return; }
        const { data: perfil } = await sb.from("profiles").select("is_admin").eq("id", session.user.id).maybeSingle();
        document.getElementById("loading").classList.add("hidden");
        // La pantalla lo comprueba para no enseñar una lista vacía; quien de
        // verdad decide es la RLS (soy_admin()).
        if (!perfil || !perfil.is_admin) {
            document.getElementById("denegado").classList.remove("hidden");
            return;
        }
        document.getElementById("app").classList.remove("hidden");
        document.getElementById("crear").addEventListener("submit", crear);
        await cargarProfesores();
        await cargar();
    }

    init();
})();
