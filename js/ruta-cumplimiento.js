/* ruta-cumplimiento.html — la revisión de cada lunes de Ruta a la Beca.
 *
 * Una fila por estudiante con lo que la plataforma mide de la semana: horas de
 * tiempo activo, días, ejercicios de Táctica y de Cálculo, finales, partidas a
 * 15 + 10 y el Meet. La cuenta la hace `public.ruta_cumplimiento()` —SECURITY
 * INVOKER, y solo devuelve a los estudiantes de quien la llama— para que esta
 * pantalla, el Excel y cualquier otro lector digan lo mismo del mismo alumno.
 *
 * Lo que la plataforma NO mide (la partida propia analizada, la lección
 * completa, el repaso en 4 días) y la semana de exámenes se dicen en la
 * página: la decisión de quién sale la firma una persona.
 *
 * Todo texto que viene de la base (el nombre) va por textContent.
 */
(function () {
    "use strict";

    const GRUPO_INICIAL = "Ruta a la Beca";
    const DIAS_MINIMOS = 4;
    const FINALES_MINUTOS = 90;
    const PARTIDAS_MINIMAS = 3;

    // Para probar con datos de hoy: ?inicio=AAAA-MM-DD (un lunes).
    const params = new URLSearchParams(location.search);
    const INICIO = /^\d{4}-\d{2}-\d{2}$/.test(params.get("inicio") || "") ? params.get("inicio") : null;

    let filasActuales = [];
    let semanaActual = "";

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }

    const hoyCR = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });

    /* Un día de calendario ('2027-03-15') se suma en UTC: leído en la hora del
       navegador, en Costa Rica caería el día anterior. */
    function sumarDias(iso, dias) {
        const d = new Date(iso + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + dias);
        return d.toISOString().slice(0, 10);
    }
    function lunesDe(iso) {
        const d = new Date(iso + "T00:00:00Z");
        const dow = (d.getUTCDay() + 6) % 7; // 0 = lunes
        return sumarDias(iso, -dow);
    }
    function dia(iso, opciones) {
        return new Date(iso + "T00:00:00Z").toLocaleDateString("es-CR", Object.assign({ timeZone: "UTC" }, opciones));
    }
    function rangoSemana(lunes) {
        const dom = sumarDias(lunes, 6);
        return "del lunes " + dia(lunes, { day: "numeric", month: "long" }) + " al domingo " +
            dia(dom, { day: "numeric", month: "long", year: "numeric" });
    }

    const horas = (min) => {
        const n = Number(min) || 0;
        const h = Math.floor(n / 60);
        const m = Math.round(n - h * 60);
        return h + " h " + (m < 10 ? "0" : "") + m + " min";
    };

    /* El color nunca va solo: cada celda dice «Cumple» o «Falta». */
    function celda(texto, cumple, detalle) {
        const td = el("td", "px-4 py-3 align-top");
        td.appendChild(el("span", "font-semibold text-brand-800 dark:text-white", texto));
        const estado = el("span", "block text-xs mt-0.5 " + (cumple
            ? "text-green-700 dark:text-green-300"
            : "text-red-700 dark:text-red-300"), (cumple ? "✔ Cumple" : "✘ Falta") + (detalle ? " · " + detalle : ""));
        td.appendChild(estado);
        return td;
    }

    function faltas(r) {
        const f = [];
        if (!r.cumple_horas) f.push("horas");
        if (!r.cumple_dias) f.push("días");
        if (!r.cumple_metas) f.push("metas de ejercicios o partidas");
        if (!r.cumple_asistencia) f.push("Meet");
        return f;
    }

    function pintarFila(r) {
        const tr = el("tr", "border-t border-brand-100 dark:border-brand-800");
        tr.appendChild(el("th", "px-4 py-3 text-left font-semibold text-brand-800 dark:text-white align-top", r.nombre || "(sin nombre)"));
        tr.appendChild(celda(horas(r.minutos), r.cumple_horas, "mínimo 10 h"));
        tr.appendChild(celda(r.dias_activos + " de 7", r.cumple_dias, "mínimo " + DIAS_MINIMOS));
        tr.appendChild(celda(r.tactica + " de " + r.tactica_meta, r.tactica >= r.tactica_meta));
        tr.appendChild(celda(r.calculo + " de " + r.calculo_meta, r.calculo >= r.calculo_meta));
        tr.appendChild(celda(r.finales + " min de " + FINALES_MINUTOS, r.finales >= FINALES_MINUTOS));
        tr.appendChild(celda(r.partidas + " de " + PARTIDAS_MINIMAS, r.partidas >= PARTIDAS_MINIMAS));
        tr.appendChild(celda(
            r.clases + (r.clases === 1 ? " clase" : " clases"),
            r.cumple_asistencia,
            !r.clases && r.justificada ? "ausencia justificada" : ""));
        const f = faltas(r);
        const td = el("td", "px-4 py-3 align-top");
        td.appendChild(el("span", "font-semibold " + (f.length ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300"),
            f.length ? "✘ No cumple" : "✔ Cumple lo que se mide"));
        td.appendChild(el("span", "block text-xs mt-0.5", f.length ? "Falta: " + f.join(", ") : "Revisa a mano lo demás"));
        tr.appendChild(td);
        return tr;
    }

    function pintar(lunes, filas) {
        filasActuales = filas;
        semanaActual = lunes;
        const cuerpo = document.getElementById("filas");
        cuerpo.replaceChildren();
        filas.forEach((r) => cuerpo.appendChild(pintarFila(r)));
        const cumplen = filas.filter((r) => !faltas(r).length).length;
        document.getElementById("tabla-caja").classList.toggle("hidden", !filas.length);
        document.getElementById("notas").classList.toggle("hidden", !filas.length);
        document.getElementById("excel").disabled = !filas.length;
        if (!filas.length) { document.getElementById("resumen").textContent = ""; return; }
        const f0 = filas[0];
        document.getElementById("estado").textContent =
            "Semana " + f0.semana + " · Fase " + f0.fase + " · " + rangoSemana(lunes);
        document.getElementById("resumen").textContent =
            filas.length + (filas.length === 1 ? " estudiante" : " estudiantes") + ": " +
            cumplen + (cumplen === 1 ? " cumple" : " cumplen") + " lo que mide la plataforma y " +
            (filas.length - cumplen) + " no.";
    }

    async function cargar() {
        const estado = document.getElementById("estado");
        const resumen = document.getElementById("resumen");
        const lunes = document.getElementById("semana").value;
        const grupo = document.getElementById("grupo").value.trim() || GRUPO_INICIAL;
        if (!lunes) { estado.textContent = "Elige una fecha."; return; }
        const lunesReal = lunesDe(lunes);
        document.getElementById("semana").value = lunesReal;
        estado.textContent = "Calculando…";
        resumen.textContent = "";
        const args = { p_lunes: lunesReal, p_grupo: grupo };
        if (INICIO) args.p_inicio = INICIO;
        const { data, error } = await sb.rpc("ruta_cumplimiento", args);
        if (error) {
            pintar(lunesReal, []);
            estado.textContent = "No se pudo calcular: " + error.message;
            return;
        }
        const filas = data || [];
        pintar(lunesReal, filas);
        if (!filas.length) {
            estado.textContent = "No hay nada que mostrar para " + rangoSemana(lunesReal) + ".";
            resumen.textContent = "Puede ser la semana de pausa de Semana Santa, una fecha fuera de las 36 semanas, o que no tengas estudiantes en el grupo «" + grupo + "».";
        }
    }

    function bajarExcel() {
        if (!filasActuales.length) return;
        const cabeceras = ["Estudiante", "Semana", "Fase", "Minutos activos", "Días activos",
            "Táctica", "Meta táctica", "Cálculo", "Meta cálculo", "Minutos de Finales", "Partidas 15+10",
            "Minutos en cursos", "Clases en vivo", "Ausencia justificada",
            "Cumple horas", "Cumple días", "Cumple metas", "Cumple Meet"];
        const si = (b) => (b ? "Sí" : "No");
        const filas = filasActuales.map((r) => [
            r.nombre || "", r.semana, r.fase, Number(r.minutos), r.dias_activos,
            r.tactica, r.tactica_meta, r.calculo, r.calculo_meta, r.finales, r.partidas,
            Number(r.minutos_cursos), r.clases, si(r.justificada),
            si(r.cumple_horas), si(r.cumple_dias), si(r.cumple_metas), si(r.cumple_asistencia),
        ]);
        CsvExcel.bajar("ruta-a-la-beca-semana-" + semanaActual + ".csv", cabeceras, filas);
        Avisos.avisar("⬇ " + (filasActuales.length === 1 ? "1 estudiante bajado." : filasActuales.length + " estudiantes bajados."));
    }

    /* ---------- La tarea de la semana ----------
       Se manda con crear_tarea(), como cualquier tarea: el alumno la ve en
       Tareas con su avance, y el profesor en la suya. Lo que una tarea SÍ
       puede contar son los minutos (desde que se manda, por eso se manda el
       lunes), así que van los cuatro trabajos que tienen herramienta propia:
       Táctica, Cálculo y visualización, Finales y Repaso y aperturas. Las
       metas de ejercicios no: una tarea de «cantidad» cuenta los ejercicios
       distintos resueltos DESDE SIEMPRE, y una meta semanal de 60 nacería
       cumplida. Las partidas, la lección y la partida analizada no tienen
       herramienta que las cuente; van escritas en las instrucciones y las
       revisa el profesor. */
    const RATO = (slug, label, href, actividades, minutos) => ({
        material_tipo: "herramienta", material_slug: slug, material_label: label, material_href: href,
        filtro_clave: "", filtro_label: "", leccion: "",
        actividades, meta_tipo: "minutos", meta_cantidad: minutos,
    });
    const RENGLONES = [
        RATO("temas", "Ejercicios por tema", "entreno/temas.html", ["temas", "tactica"], 180),
        RATO("visualizacion", "Visualización", "entreno/visualizacion.html", ["visualizacion"], 90),
        RATO("finales", "Finales contra la máquina", "entreno/finales.html", ["finales"], 90),
        RATO("aperturas", "Aperturas y celadas", "entreno/aperturas.html", ["aperturas"], 30),
    ];

    function instrucciones(f0) {
        return "Tu tarea de la semana " + f0.semana + " (fase " + f0.fase + ") de Ruta a la Beca. Son 10 horas en al menos 4 días distintos:\n" +
            "• Táctica, 3 h: " + f0.tactica_meta + " ejercicios del tema de la semana.\n" +
            "• Partidas, 2 h: 3 partidas a 15 + 10 y 1 partida tuya analizada.\n" +
            "• Cálculo y visualización, 1,5 h: " + f0.calculo_meta + " ejercicios.\n" +
            "• Finales, 1,5 h: en Finales contra la máquina o en El mapa de los finales.\n" +
            "• Lección de la fase, 1,5 h: la lección de la semana, completa.\n" +
            "• Repaso y aperturas, 0,5 h: repaso al menos 4 días.\n" +
            "En esta tarea ves el avance de los minutos de Táctica, Cálculo, Finales y Aperturas. Lo demás lo revisa tu profesor.";
    }

    async function mandarTarea() {
        const estado = document.getElementById("tarea-estado");
        const boton = document.getElementById("tarea");
        const grupo = document.getElementById("grupo").value.trim() || GRUPO_INICIAL;
        const lunes = lunesDe(hoyCR());
        const args = { p_lunes: lunes, p_grupo: grupo };
        if (INICIO) args.p_inicio = INICIO;
        boton.disabled = true;
        estado.textContent = "Buscando a tus estudiantes…";
        const { data, error } = await sb.rpc("ruta_cumplimiento", args);
        if (error) { estado.textContent = "No se pudo preparar la tarea: " + error.message; boton.disabled = false; return; }
        const filas = data || [];
        if (!filas.length) {
            estado.textContent = "Esta semana no hay tarea: es la pausa de Semana Santa, está fuera de las 36 semanas o no tienes estudiantes en el grupo «" + grupo + "».";
            boton.disabled = false;
            return;
        }
        const f0 = filas[0];
        const titulo = "Ruta a la Beca · Semana " + f0.semana;
        // Los que ya la tienen no la reciben otra vez.
        const ids = filas.map((r) => r.alumno_id);
        const { data: yaTienen, error: eYa } = await sb.from("tareas").select("alumno_id").eq("titulo", titulo).in("alumno_id", ids);
        if (eYa) { estado.textContent = "No se pudo revisar si ya la tienen: " + eYa.message; boton.disabled = false; return; }
        const tienen = new Set((yaTienen || []).map((x) => x.alumno_id));
        const faltan = ids.filter((id) => !tienen.has(id));
        if (!faltan.length) {
            estado.textContent = "La tarea de la semana " + f0.semana + " ya la tienen los " + ids.length + " estudiantes.";
            boton.disabled = false;
            return;
        }
        const ok = await Avisos.confirmar(
            "Se la manda a " + faltan.length + (faltan.length === 1 ? " estudiante" : " estudiantes") + " y vence el domingo " +
            dia(sumarDias(lunes, 6), { day: "numeric", month: "long" }) + " a las 11:59 p. m." +
            (tienen.size ? " Los otros " + tienen.size + " ya la tenían." : ""),
            { titulo: titulo, aceptar: "Mandar la tarea" });
        if (!ok) { estado.textContent = ""; boton.disabled = false; return; }
        // Costa Rica no cambia de hora: -06:00 todo el año.
        const vence = sumarDias(lunes, 6) + "T23:59:59-06:00";
        const { data: n, error: eTarea } = await sb.rpc("crear_tarea", {
            p_alumnos: faltan, p_titulo: titulo, p_instrucciones: instrucciones(f0),
            p_vence: vence, p_items: RENGLONES, p_disponible_desde: null,
        });
        boton.disabled = false;
        if (eTarea) { estado.textContent = "No se pudo mandar: " + eTarea.message; return; }
        estado.textContent = "Tarea mandada a " + n + (n === 1 ? " estudiante." : " estudiantes.") + " La ven en Tareas.";
    }

    async function init() {
        const { data } = await sb.auth.getSession();
        if (!data.session) { location.href = "login.html?next=ruta-cumplimiento.html"; return; }
        const { data: perfil } = await sb.from("profiles").select("role, is_admin").eq("id", data.session.user.id).maybeSingle();
        document.getElementById("loading").classList.add("hidden");
        if (perfil && perfil.role === "alumno" && !perfil.is_admin) {
            document.getElementById("no-acceso").classList.remove("hidden");
            return;
        }
        document.getElementById("app").classList.remove("hidden");

        // Cada lunes se revisa la semana anterior: de entrada, la que acaba de terminar.
        const pedida = params.get("semana");
        const inicial = /^\d{4}-\d{2}-\d{2}$/.test(pedida || "") ? lunesDe(pedida) : sumarDias(lunesDe(hoyCR()), -7);
        const campo = document.getElementById("semana");
        campo.value = inicial;
        document.getElementById("controles").addEventListener("submit", (e) => { e.preventDefault(); cargar(); });
        document.getElementById("ant").addEventListener("click", () => { campo.value = sumarDias(lunesDe(campo.value || inicial), -7); cargar(); });
        document.getElementById("sig").addEventListener("click", () => { campo.value = sumarDias(lunesDe(campo.value || inicial), 7); cargar(); });
        document.getElementById("excel").addEventListener("click", bajarExcel);
        document.getElementById("tarea").addEventListener("click", mandarTarea);
        await cargar();
    }

    init();
})();
