/* satisfaccion.html — lo que opina el alumnado de cada profesor.
 *
 * La base hace las cuentas (resumen_satisfaccion(), SECURITY INVOKER) y decide
 * qué se ve: quien administra, todo; quien supervisa, sus profesores; el
 * profesor calificado, nada (política de encuestas_profesor). La pantalla solo
 * pinta. Las preguntas salen de js/encuesta-preguntas.js, la misma copia que
 * lee el alumno al contestar.
 */
(function () {
    const P = window.EncuestaPreguntas;
    let resumen = [];
    let rango = null;            // { desde, hasta } como "AAAA-MM-01"

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }

    /* "AAAA-MM-01" corrido `n` meses (negativo = hacia atrás). */
    function correrMes(valor, n) {
        const [a, m] = valor.split("-").map(Number);
        const d = new Date(Date.UTC(a, m - 1 + n, 1));
        return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-01";
    }

    function rangoDe(opcion) {
        const hoy = P.mesActual();
        const n = Number(opcion);
        if (n === -1) { const m = correrMes(hoy, -1); return { desde: m, hasta: m }; }
        return { desde: correrMes(hoy, -(n - 1)), hasta: hoy };
    }

    function textoMes(valor) {
        const [a, m] = String(valor).split("-").map(Number);
        return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("es-CR", { timeZone: "UTC", month: "long", year: "numeric" });
    }

    function pct(n, total) { return total ? Math.round((100 * n) / total) + " %" : "—"; }

    function aRevisar(r) { return r.seguir_no > 0 || Number(r.promedio) < 3; }

    function estado(r) {
        if (aRevisar(r)) return "⚠️ A revisar";
        return Number(r.promedio) >= 4 ? "👍 " + P.lectura(r.promedio) : "➖ Regular";
    }

    /* ---- las cifras de arriba ---- */
    function pintarCifras() {
        const total = resumen.reduce((s, r) => s + r.respuestas, 0);
        const suma = resumen.reduce((s, r) => s + Number(r.promedio) * r.respuestas, 0);
        const si = resumen.reduce((s, r) => s + r.seguir_si, 0);
        const duda = resumen.reduce((s, r) => s + r.seguir_no_se, 0);
        const no = resumen.reduce((s, r) => s + r.seguir_no, 0);
        const prom = total ? suma / total : null;
        const cifras = [
            ["Respuestas", String(total), resumen.length === 1 ? "sobre 1 profesor" : "sobre " + resumen.length + " profesores"],
            ["Promedio general", total ? P.nota(prom) + " de 5" : "—", total ? P.lectura(prom) : "Sin respuestas"],
            ["Piensan seguir", String(si), pct(si, total) + " de las respuestas"],
            ["Todavía no saben", String(duda), pct(duda, total) + " de las respuestas"],
            ["Dicen que se van", String(no), pct(no, total) + " de las respuestas"],
        ];
        const caja = document.getElementById("cifras");
        caja.replaceChildren();
        cifras.forEach(([titulo, valor, detalle]) => {
            const t = el("div", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4");
            t.append(
                el("p", "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide", titulo),
                el("p", "font-serif text-2xl font-bold text-brand-800 dark:text-white mt-1", valor),
                el("p", "text-xs text-brand-450 dark:text-brand-350 mt-0.5", detalle));
            caja.appendChild(t);
        });
    }

    /* ---- la tabla, un profesor por fila ---- */
    const COLUMNAS = 1 + 1 + P.PREGUNTAS.length + 1 + 1 + 1 + 1;

    function pintarCabecera() {
        const tr = document.getElementById("cabecera");
        tr.replaceChildren();
        const th = (texto, extra, titulo) => {
            const c = el("th", "py-2 pr-3 font-semibold " + (extra || ""), texto);
            c.scope = "col";
            if (titulo) c.title = titulo;
            tr.appendChild(c);
        };
        th("Profesor");
        th("Respuestas", "text-right");
        P.PREGUNTAS.forEach((q) => th(q.corto, "text-right", q.texto));
        th("Promedio", "text-right");
        th("Siguen · dudan · se van");
        th("Cómo va");
        th("", "", null);
        tr.lastChild.appendChild(el("span", "sr-only", "Detalle"));
    }

    function pintarTabla() {
        const tbody = document.getElementById("filas");
        tbody.replaceChildren();
        document.getElementById("vacio").hidden = resumen.length > 0;
        resumen.forEach((r) => {
            const tr = el("tr", "border-b border-brand-50 dark:border-brand-800 align-top");
            const nom = el("th", "py-2 pr-3 font-medium text-left text-brand-800 dark:text-white", r.nombre);
            nom.scope = "row";
            tr.appendChild(nom);
            tr.appendChild(el("td", "py-2 pr-3 text-right tabular-nums", String(r.respuestas)));
            P.PREGUNTAS.forEach((q) => {
                const td = el("td", "py-2 pr-3 text-right tabular-nums" + (Number(r[q.clave]) < 3 ? " font-bold" : ""), P.nota(r[q.clave]));
                td.title = q.texto + " — " + P.lectura(r[q.clave]);
                tr.appendChild(td);
            });
            tr.appendChild(el("td", "py-2 pr-3 text-right tabular-nums font-semibold", P.nota(r.promedio)));
            tr.appendChild(el("td", "py-2 pr-3 whitespace-nowrap", r.seguir_si + " · " + r.seguir_no_se + " · " + r.seguir_no));
            tr.appendChild(el("td", "py-2 pr-3 whitespace-nowrap font-semibold", estado(r)));
            const tdBtn = el("td", "py-2 text-right");
            const b = el("button", "text-xs font-semibold text-accent-700 dark:text-accent-400 hover:underline whitespace-nowrap rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Ver respuestas");
            b.type = "button";
            b.setAttribute("aria-expanded", "false");
            b.addEventListener("click", () => alternarDetalle(b, tr, r));
            tdBtn.appendChild(b);
            tr.appendChild(tdBtn);
            tbody.appendChild(tr);
        });
    }

    /* Una respuesta, en una tarjeta: quién, cuándo, las seis notas escritas y
       el comentario. Todo lo que escribió una persona va por textContent. */
    function tarjetaRespuesta(x, conProfesor) {
        const li = el("li", "rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-100 dark:border-brand-800 px-3 py-2.5");
        const cab = el("p", "text-sm");
        cab.appendChild(el("span", "font-semibold text-brand-800 dark:text-white", x.alumno));
        cab.appendChild(el("span", "text-brand-500 dark:text-brand-300",
            (conProfesor ? " sobre " + x.profesor : "") + " · " + textoMes(x.periodo) + " · " + P.textoSeguir(x.seguir)));
        li.appendChild(cab);
        const notas = el("p", "text-xs text-brand-600 dark:text-brand-300 mt-1");
        notas.textContent = P.PREGUNTAS.map((q) => q.corto + ": " + x[q.clave] + " (" + q.opciones[x[q.clave] - 1] + ")").join(" · ");
        li.appendChild(notas);
        if (x.comentario) li.appendChild(el("p", "text-sm text-brand-700 dark:text-brand-200 mt-1.5 whitespace-pre-wrap break-words", "«" + x.comentario + "»"));
        return li;
    }

    async function alternarDetalle(boton, fila, r) {
        const abierta = fila.nextElementSibling && fila.nextElementSibling.dataset.detalleDe === r.profesor_id;
        if (abierta) {
            fila.nextElementSibling.remove();
            boton.setAttribute("aria-expanded", "false");
            boton.textContent = "Ver respuestas";
            return;
        }
        const tr = el("tr");
        tr.dataset.detalleDe = r.profesor_id;
        const td = el("td", "pb-4 pt-1");
        td.colSpan = COLUMNAS;
        const ul = el("ul", "space-y-2");
        td.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350", "Cargando las respuestas…"));
        tr.appendChild(td);
        fila.after(tr);
        boton.setAttribute("aria-expanded", "true");
        boton.textContent = "Ocultar respuestas";
        const { data, error } = await sb.rpc("respuestas_satisfaccion", {
            p_desde: rango.desde, p_hasta: rango.hasta, p_profesor: r.profesor_id, p_solo_se_van: false,
        }).range(0, 999);
        td.replaceChildren();
        if (error) { td.appendChild(el("p", "text-sm text-red-700 dark:text-red-300", "No se pudieron cargar las respuestas: " + error.message)); return; }
        (data || []).forEach((x) => ul.appendChild(tarjetaRespuesta(x, false)));
        td.appendChild(ul);
    }

    async function pintarSeVan() {
        const ul = document.getElementById("sevan");
        ul.replaceChildren();
        const { data, error } = await sb.rpc("respuestas_satisfaccion", {
            p_desde: rango.desde, p_hasta: rango.hasta, p_profesor: null, p_solo_se_van: true,
        }).range(0, 999);
        if (error) { ul.appendChild(el("li", "text-sm text-red-700 dark:text-red-300", "No se pudo cargar la lista: " + error.message)); return; }
        if (!data || !data.length) {
            ul.appendChild(el("li", "text-sm text-brand-450 dark:text-brand-350", "Nadie dijo que piensa dejar las clases en este periodo."));
            return;
        }
        data.forEach((x) => ul.appendChild(tarjetaRespuesta(x, true)));
    }

    async function cargar() {
        rango = rangoDe(document.getElementById("periodo").value);
        const { data, error } = await sb.rpc("resumen_satisfaccion", { p_desde: rango.desde, p_hasta: rango.hasta });
        if (error) { Avisos.avisar("No se pudo cargar el resumen: " + error.message, { tipo: "error" }); return; }
        resumen = data || [];
        pintarCifras();
        pintarTabla();
        await pintarSeVan();
    }

    /* Todas las respuestas del periodo, de mil en mil: PostgREST corta ahí
       sin avisar. */
    async function descargarCsv() {
        const filas = [];
        for (let desde = 0; ; desde += 1000) {
            const { data, error } = await sb.rpc("respuestas_satisfaccion", {
                p_desde: rango.desde, p_hasta: rango.hasta, p_profesor: null, p_solo_se_van: false,
            }).range(desde, desde + 999);
            if (error) { Avisos.avisar("No se pudo armar el archivo: " + error.message, { tipo: "error" }); return; }
            (data || []).forEach((x) => filas.push([
                textoMes(x.periodo), x.profesor, x.alumno,
                ...P.PREGUNTAS.map((q) => x[q.clave]),
                P.textoSeguir(x.seguir), x.comentario,
            ]));
            if (!data || data.length < 1000) break;
        }
        if (!filas.length) { Avisos.avisar("No hay respuestas en este periodo.", { tipo: "error" }); return; }
        DetalleMensual.csv("satisfaccion-" + rango.desde.slice(0, 7) + "-a-" + rango.hasta.slice(0, 7) + ".csv",
            ["Mes", "Profesor", "Alumno", ...P.PREGUNTAS.map((q) => q.corto + " (1-5)"), "¿Sigue?", "Comentario"], filas);
    }

    async function init() {
        const { data } = await sb.auth.getSession();
        const session = data.session;
        if (!session) { location.href = "login.html?next=satisfaccion.html"; return; }
        const { data: perfil } = await sb.from("profiles").select("is_admin, es_supervisor").eq("id", session.user.id).maybeSingle();
        document.getElementById("loading").classList.add("hidden");
        // La pantalla lo comprueba para no enseñar una tabla vacía; quien de
        // verdad decide qué filas salen es la RLS de encuestas_profesor.
        if (!perfil || !(perfil.is_admin || perfil.es_supervisor)) {
            document.getElementById("denegado").classList.remove("hidden");
            return;
        }
        document.getElementById("app").classList.remove("hidden");
        // El enlace se arma desde la carpeta de la página, no cortando el
        // .html: Cloudflare sirve la página con extensión y sin ella.
        const enlace = new URL("encuesta-profesor.html", location.href).href;
        document.getElementById("enlace").textContent = enlace;
        document.getElementById("copiar").addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(enlace);
                Avisos.avisar("Enlace copiado: pégalo en el grupo de WhatsApp de tus estudiantes.", { tipo: "ok" });
            } catch (e) {
                Avisos.avisar("No se pudo copiar solo: selecciona el enlace y cópialo a mano.", { tipo: "error" });
            }
        });
        document.getElementById("csv").addEventListener("click", descargarCsv);
        document.getElementById("periodo").addEventListener("change", cargar);
        pintarCabecera();
        await cargar();
    }

    init();
})();
