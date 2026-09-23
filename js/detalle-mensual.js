/* El detalle del informe mensual: cada clase y cada estudiante del mes, con
 * las clases en línea y las presenciales juntas.
 *
 * Lo cuenta la base —public.detalle_mensual_profesor() para el mes de hoy y
 * public.detalle_informe_mensual() para la foto que viajó con un informe
 * enviado— y acá solo se pinta. Lo usan las dos puntas: informe-mensual.html
 * (quien da clase ve lo que va a mandar) y supervision.html (quien supervisa lo
 * lee). Escrito dos veces, uno diría «Presencial» y el otro «En el aula».
 *
 * A quien supervisa la base ya le quitó los estudiantes que no están a su cargo
 * (un profesor puede estar en dos academias) y dice cuántos son: eso se dice con
 * todas las letras, o la tabla parecería incompleta sin razón.
 *
 * Todo lo que escribe una persona —el título, las notas, el nombre de un
 * alumno— va por textContent.
 */
window.DetalleMensual = (function () {
    const DONDE = { presencial: "Presencial", en_linea: "En línea" };

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }
    const dondeDe = (m) => DONDE[m] || "En línea";

    function duracion(min) {
        const m = Math.round(Number(min) || 0);
        const h = Math.floor(m / 60), r = m % 60;
        return h ? h + " h" + (r ? " " + r + " min" : "") : m + " min";
    }

    function fecha(iso) {
        return new Date(iso).toLocaleString("es-CR", {
            timeZone: "America/Costa_Rica", weekday: "short", day: "numeric", month: "short",
            hour: "numeric", minute: "2-digit",
        });
    }

    function tabla(caption, cabeceras, filas) {
        const envol = el("div", "overflow-x-auto");
        const t = el("table", "min-w-full text-sm");
        const cap = el("caption", "sr-only", caption);
        const thead = el("thead");
        const tr = el("tr", "text-left text-xs text-brand-500 dark:text-brand-300 border-b border-brand-100 dark:border-brand-800");
        cabeceras.forEach((c) => { const th = el("th", "py-2 pr-3 font-semibold", c); th.scope = "col"; tr.appendChild(th); });
        thead.appendChild(tr);
        const tbody = el("tbody");
        filas.forEach((f) => {
            const r = el("tr", "border-b border-brand-50 dark:border-brand-800 align-top");
            f.forEach((v, i) => {
                const c = el(i === 0 ? "th" : "td", "py-2 pr-3" + (i === 0 ? " font-medium text-left" : ""));
                if (i === 0) c.scope = "row";
                if (v instanceof Node) c.appendChild(v); else c.textContent = v;
                r.appendChild(c);
            });
            tbody.appendChild(r);
        });
        t.append(cap, thead, tbody);
        envol.appendChild(t);
        return envol;
    }

    /* El CSV con punto y coma y BOM, que es lo que Excel en español abre de un
       doble clic (la misma decisión de Formularios y Cobros). */
    function csv(nombre, cabeceras, filas) {
        const q = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
        const texto = "﻿" + [cabeceras].concat(filas).map((f) => f.map(q).join(";")).join("\r\n");
        const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
        const a = el("a");
        a.href = url; a.download = nombre;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function boton(texto, alClic) {
        const b = el("button", "bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-800 dark:text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto);
        b.type = "button";
        b.addEventListener("click", alClic);
        return b;
    }

    /* Pinta el detalle en `caja`. `quien` es el nombre del profesor (para los
       archivos); `mes` el texto del mes. */
    function pintar(caja, d, opts) {
        opts = opts || {};
        caja.replaceChildren();
        if (!d) {
            caja.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", opts.sinDetalle ||
                "Este informe se envió antes de que existiera el detalle por clase y por estudiante."));
            return;
        }
        const clases = Array.isArray(d.clases) ? d.clases : [];
        const alumnos = Array.isArray(d.alumnos) ? d.alumnos : [];
        const base = (opts.archivo || "informe") + "-" + String(d.periodo || "").slice(0, 7);

        const enLinea = clases.filter((c) => c.modalidad !== "presencial");
        const pres = clases.filter((c) => c.modalidad === "presencial");
        const total = clases.reduce((s, c) => s + (Number(c.minutos) || 0), 0);
        const resumen = el("p", "text-sm text-brand-700 dark:text-brand-200 mb-3",
            clases.length === 0 ? "No dio ninguna clase este mes." :
            clases.length + (clases.length === 1 ? " clase" : " clases") + " en total, " + duracion(total) + ": " +
            enLinea.length + " en línea (" + duracion(enLinea.reduce((s, c) => s + (Number(c.minutos) || 0), 0)) + ") y " +
            pres.length + " presencial" + (pres.length === 1 ? "" : "es") + " (" + duracion(pres.reduce((s, c) => s + (Number(c.minutos) || 0), 0)) + ").");
        resumen.dataset.detalle = "resumen";
        caja.appendChild(resumen);

        // ── Las clases ──
        const hC = el("h3", "font-semibold text-brand-800 dark:text-white mt-2 mb-2", "Clase por clase");
        caja.appendChild(hC);
        if (clases.length) {
            const filasC = clases.map((c) => {
                const notas = c.notas ? el("span", "whitespace-pre-wrap break-words text-brand-600 dark:text-brand-300", c.notas) : "—";
                return [fecha(c.inicio), dondeDe(c.modalidad), c.titulo || "Sin título", duracion(c.minutos),
                        String(c.asistentes || 0) + (c.tarde ? " (" + c.tarde + " tarde)" : ""), notas];
            });
            const tc = tabla("Las clases del mes, una por renglón", ["Cuándo", "Dónde", "Clase", "Duración", "Asistentes", "Qué se hizo"], filasC);
            tc.dataset.detalle = "clases";
            caja.appendChild(tc);
            caja.appendChild(boton("⬇ Descargar las clases (Excel)", () => csv(base + "-clases.csv",
                ["Cuándo", "Dónde", "Clase", "Minutos", "Asistentes", "Llegaron tarde", "Qué se hizo"],
                clases.map((c) => [fecha(c.inicio), dondeDe(c.modalidad), c.titulo || "", Math.round(Number(c.minutos) || 0),
                                   c.asistentes || 0, c.tarde || 0, c.notas || ""]))));
        }

        // ── Los estudiantes ──
        caja.appendChild(el("h3", "font-semibold text-brand-800 dark:text-white mt-5 mb-2", "Estudiante por estudiante"));
        if (Number(d.alumnos_fuera) > 0) {
            const n = Number(d.alumnos_fuera);
            const aviso = el("p", "text-xs text-brand-450 dark:text-brand-350 mb-2",
                (n === 1 ? "1 estudiante de este profesor no está" : n + " estudiantes de este profesor no están") +
                " a tu cargo y no se muestran: son de otra academia. Las clases de arriba sí los cuentan.");
            aviso.dataset.detalle = "fuera";
            caja.appendChild(aviso);
        }
        if (!alumnos.length) {
            caja.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", "No hay estudiantes que mostrar."));
            return;
        }
        const filasA = alumnos.map((a) => [a.nombre || "Sin nombre", a.grupo || "—",
            String(a.clases_en_linea || 0), String(a.clases_presenciales || 0), duracion(a.minutos_clase),
            a.veces_tarde ? a.veces_tarde + (a.veces_tarde === 1 ? " vez" : " veces") + " · " + a.minutos_tarde + " min" : "—",
            String(a.ejercicios || 0)]);
        const ta = tabla("Los estudiantes, con sus clases del mes", ["Estudiante", "Grupo", "En línea", "Presenciales", "Tiempo en clase", "Llegó tarde", "Ejercicios"], filasA);
        ta.dataset.detalle = "alumnos";
        caja.appendChild(ta);
        caja.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mt-1",
            "El tiempo en clase de las presenciales es la duración que anotó quien dio la clase, ya descontada la llegada tarde. Los ejercicios son todos los que hizo en la plataforma ese mes."));
        caja.appendChild(boton("⬇ Descargar los estudiantes (Excel)", () => csv(base + "-estudiantes.csv",
            ["Estudiante", "Grupo", "Clases en línea", "Clases presenciales", "Minutos en clase", "Veces tarde", "Minutos tarde", "Ejercicios"],
            alumnos.map((a) => [a.nombre || "", a.grupo || "", a.clases_en_linea || 0, a.clases_presenciales || 0,
                                a.minutos_clase || 0, a.veces_tarde || 0, a.minutos_tarde || 0, a.ejercicios || 0]))));
    }

    return { pintar, duracion, dondeDe };
})();
