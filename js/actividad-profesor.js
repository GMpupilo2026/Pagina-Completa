/* La actividad de un profesor en un mes, puesta en palabras.
 *
 * La usan las dos puntas del informe mensual: informe-mensual.html (quien da
 * clase lo arma y lo manda) y supervision.html (quien supervisa lo lee). Los
 * números los cuenta la base, en `public.actividad_profesor()`; acá solo se
 * dice qué es cada uno. Escrito dos veces, el profesor mandaría «Tareas
 * puestas: 19» y su supervisora leería «Tareas: 19» en otro orden, y a la
 * primera corrección uno de los dos se quedaría viejo.
 *
 * El mes se cuenta en hora de Costa Rica, igual que en la base: el 1.° de
 * octubre a las 7 de la noche en Costa Rica todavía es septiembre para nadie
 * más que para el servidor, que vive en UTC.
 */
window.ActividadProfesor = (function () {
    const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
                   "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

    /* En el orden en que se pregunta por el trabajo de un profesor: a quién
       tiene, qué clases dio, qué les puso y qué dejó anotado. */
    const CAMPOS = [
        { clave: "alumnos",             etiqueta: "Alumnos a cargo" },
        { clave: "alumnos_activos",     etiqueta: "Alumnos que entrenaron" },
        { clave: "ejercicios_alumnos",  etiqueta: "Ejercicios de sus alumnos" },
        { clave: "clases_en_linea",     etiqueta: "Clases en línea" },
        { clave: "clases_presenciales", etiqueta: "Clases presenciales" },
        /* «7 de 8»: de las clases de su horario que ya pasaron, cuántas tienen
           una clase registrada ese día. Sin horario puesto dice «Sin horario»
           y no «0 de 0», que se lee como un mes sin trabajo. Una foto enviada
           antes de existir el horario no trae estos números: «—». */
        { clave: "clases_programadas_dadas", etiqueta: "Clases de su horario dadas", formato: "horario", alerta: "horario" },
        { clave: "minutos_clase",       etiqueta: "Tiempo de clase", formato: "horas" },
        { clave: "asistencias",         etiqueta: "Asistencias a sus clases" },
        { clave: "tareas_puestas",      etiqueta: "Tareas puestas" },
        { clave: "tareas_completadas",  etiqueta: "Tareas terminadas" },
        { clave: "tareas_vencidas",     etiqueta: "Tareas vencidas sin hacer", alerta: true },
        { clave: "examenes_puestos",    etiqueta: "Exámenes puestos" },
        { clave: "examenes_rendidos",   etiqueta: "Exámenes rendidos" },
        { clave: "nota_promedio",       etiqueta: "Nota promedio", formato: "nota" },
        { clave: "notas_bitacora",      etiqueta: "Notas en la bitácora" },
        { clave: "planes_nuevos",       etiqueta: "Planes de clase nuevos" },
    ];

    /* Hoy, en Costa Rica, como "AAAA-MM-DD". */
    function hoyCR() {
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date());
    }

    /* "2026-09-01" → "septiembre de 2026". */
    function textoMes(valor) {
        const [a, m] = String(valor || "").split("-").map(Number);
        if (!a || !m) return "";
        return MESES[m - 1] + " de " + a;
    }

    /* Los últimos `n` meses, del actual hacia atrás, como "AAAA-MM-01". */
    function meses(n) {
        const [a, m] = hoyCR().split("-").map(Number);
        const lista = [];
        for (let i = 0; i < n; i++) {
            const d = new Date(Date.UTC(a, m - 1 - i, 1));
            const v = d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-01";
            lista.push({ valor: v, texto: textoMes(v) });
        }
        return lista;
    }

    /* El mes del que toca informar: en los primeros diez días todavía se está
       cerrando el anterior, que es el que la supervisión espera. */
    function mesPorOmision() {
        const lista = meses(2);
        return Number(hoyCR().slice(8, 10)) <= 10 ? lista[1].valor : lista[0].valor;
    }

    function horas(min) {
        const n = Math.max(0, Math.round(Number(min) || 0));
        const h = Math.floor(n / 60), r = n % 60;
        if (!h) return r + " min";
        return r ? h + " h " + r + " min" : h + " h";
    }

    function valor(campo, datos) {
        const v = datos ? datos[campo.clave] : null;
        if (campo.formato === "horario") {
            const prog = datos ? datos.clases_programadas : null;
            if (prog == null || v == null) return "—";
            if (!Number(prog)) return "Sin horario";
            return v + " de " + prog;
        }
        if (campo.formato === "horas") return horas(v);
        if (campo.formato === "nota") {
            return v == null ? "—" : Number(v).toLocaleString("es-CR", { maximumFractionDigits: 2 });
        }
        return v == null ? "—" : String(v);
    }

    /* Una rejilla de tarjetas, como lista de definiciones: quien usa lector de
       pantalla oye «Clases en línea, 5» y no dos números sueltos. */
    function tarjetas(datos) {
        const dl = document.createElement("dl");
        dl.className = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3";
        CAMPOS.forEach((c) => {
            const caja = document.createElement("div");
            caja.className = "bg-brand-50 dark:bg-brand-950 rounded-xl p-3";
            caja.dataset.campo = c.clave;
            const dt = document.createElement("dt");
            dt.className = "text-xs text-brand-500 dark:text-brand-300";
            dt.textContent = c.etiqueta;
            const dd = document.createElement("dd");
            const n = datos ? Number(datos[c.clave]) : 0;
            // En el horario la alerta es que falte alguna, no que haya alguna.
            const alerta = c.alerta === "horario"
                ? !!datos && Number(datos.clases_programadas) > n
                : c.alerta && n > 0;
            dd.className = "text-xl font-bold " + (alerta
                ? "text-red-600 dark:text-red-400"
                : "text-brand-800 dark:text-white");
            dd.textContent = valor(c, datos);
            caja.append(dt, dd);
            dl.appendChild(caja);
        });
        return dl;
    }

    function fecha(iso) {
        if (!iso) return "";
        return new Date(iso).toLocaleDateString("es-CR", {
            timeZone: "America/Costa_Rica", day: "numeric", month: "long",
        });
    }

    return { CAMPOS, hoyCR, textoMes, meses, mesPorOmision, horas, valor, tarjetas, fecha };
})();
