/* «Unas palabras para la casa»: el mensaje del profe que sale en el próximo
 * informe a la casa, armado con frases listas según cómo viene el alumno.
 *
 * Va en Informes, dentro de «📧 Informes a la casa» de un alumno. Cómo viene
 * NO se calcula acá: lo contesta la Edge Function informes-encargados (acción
 * "situacion") con la MISMA regla que pinta la franja de arriba del correo.
 * Si las frases salieran de otra cuenta, el profe le escribiría «¡qué buena
 * semana!» a la casa justo encima de una franja que dice «Practicó poco».
 *
 * - Las frases del sitio están acá abajo; las del profe, en `plantillas_casa`
 *   (solo las ve él). Al guardar una, el nombre del alumno se cambia por
 *   {nombre}: así le sirve para el siguiente.
 * - Una frase que necesita un dato (los ejercicios contra la semana anterior,
 *   el área del plan) solo se ofrece si el dato existe. Ninguna adivina el
 *   género del alumno.
 * - El mensaje se guarda en `mensajes_casa`, y lo pone en el correo
 *   public.mensajes_casa_de(): sale en el informe de cada encargado cuyo
 *   periodo lo incluya. Todo texto escrito por una persona va por textContent.
 * Ver «Unas palabras de su profe» en docs/decisiones/informes.md.
 *
 *   PlantillasCasa.rellenar(texto, situacion) → la frase con sus datos
 *   PlantillasCasa.sugerencias(situacion, propias) → [{ texto, propia, id }]
 *   PlantillasCasa.aPlantilla(texto, situacion) → el texto con {nombre}
 *   PlantillasCasa.montar(contenedor, { sb, alumno: { id, nombre }, yo, llamar, soloLectura })
 */
(function () {
    "use strict";

    const MAXIMO = 800;
    const NOMBRES = {
        bien: "Va bien",
        poco: "Practicó poco",
        no_entro: "No entró a practicar",
        vencido: "Tiene entregas vencidas",
    };

    /* {dias} es «3 días de 7»; {ejercicios} y {ejercicios_antes}, números;
       {area}, el área en la que trabaja su plan. Una frase con un dato que no
       hay no se ofrece (ver `cabe`). */
    const FRASES = {
        bien: [
            "¡Qué buena semana! {nombre} practicó {dias}: así es como se avanza.",
            "Esta semana hizo {ejercicios} ejercicios, más que la anterior ({ejercicios_antes}). ¡Se nota el avance!",
            "En las próximas semanas nos enfocamos en {area}, que es lo que sigue en su plan.",
            "Gracias por el apoyo desde la casa: la constancia de {nombre} se nota en clase.",
        ],
        poco: [
            "Esta semana {nombre} practicó {dias}. Con diez minutos casi todos los días se nota mucho la diferencia.",
            "Les propongo buscar un momento fijo para practicar en la casa, aunque sea corto: ayuda a crear el hábito.",
            "Lo que más le conviene practicar ahora es {area}: lo tiene en su plan, dentro de la plataforma.",
        ],
        no_entro: [
            "Esta semana {nombre} no entró a practicar. ¿Pasó algo? Si necesitan ayuda para retomar, con gusto lo vemos.",
            "Con unos minutos al día se retoma rápido. En la próxima clase le ayudo a arrancar de nuevo.",
        ],
        vencido: [
            "{nombre} tiene entregas que ya vencieron. Si me escriben, buscamos juntos cómo ponerse al día.",
            "Las tareas se hacen desde su cuenta en la plataforma; si tiene dudas, me puede preguntar en clase.",
        ],
        todas: [
            "Cualquier consulta, me pueden escribir.",
        ],
    };

    function diasTexto(s) {
        if (!s) return "";
        return (s.dias === 1 ? "1 día" : `${s.dias} días`) + ` de ${s.dias_periodo}`;
    }

    // Una frase solo se ofrece si tiene todos sus datos.
    function cabe(texto, s) {
        if (/\{ejercicios(_antes)?\}/.test(texto) && !(s && s.ejercicios != null && s.ejercicios > (s.ejercicios_antes || 0) && s.ejercicios_antes > 0)) return false;
        if (/\{area\}/.test(texto) && !(s && s.area)) return false;
        if (/\{nombre\}/.test(texto) && !(s && s.nombre)) return false;
        return true;
    }

    function rellenar(texto, s) {
        const area = s && s.area ? String(s.area).toLowerCase() : "";
        return String(texto)
            .replace(/\{nombre\}/g, (s && s.nombre) || "")
            .replace(/\{dias\}/g, diasTexto(s))
            .replace(/\{ejercicios\}/g, s && s.ejercicios != null ? String(s.ejercicios) : "")
            .replace(/\{ejercicios_antes\}/g, s && s.ejercicios_antes != null ? String(s.ejercicios_antes) : "")
            .replace(/\{area\}/g, area);
    }

    function sugerencias(s, propias) {
        const clave = s && FRASES[s.clave] ? s.clave : null;
        const delSitio = (clave ? FRASES[clave] : []).concat(FRASES.todas)
            .filter((t) => cabe(t, s))
            .map((t) => ({ texto: rellenar(t, s), propia: false, id: null }));
        const suyas = (propias || [])
            .filter((p) => p.situacion === "todas" || p.situacion === clave)
            .filter((p) => cabe(p.texto, s))
            .map((p) => ({ texto: rellenar(p.texto, s), propia: true, id: p.id, situacion: p.situacion }));
        return suyas.concat(delSitio);
    }

    // Para guardar una frase como plantilla: el nombre del alumno pasa a ser
    // {nombre}, así sirve para el siguiente.
    function aPlantilla(texto, s) {
        let t = String(texto || "").trim();
        if (s && s.nombre) {
            const n = s.nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            t = t.replace(new RegExp("(^|[^\\p{L}])" + n + "(?![\\p{L}])", "gu"), "$1{nombre}");
        }
        return t;
    }

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }
    const BOTON = "border border-brand-200 dark:border-brand-700 text-brand-700 dark:text-brand-200 font-semibold px-3 py-1.5 rounded-lg text-sm hover:border-accent-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    const BOTON_FUERTE = "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60";

    function fechaCorta(iso) {
        try {
            return window.HoraCR ? HoraCR.fecha(iso, { day: "numeric", month: "short" })
                : new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" });
        } catch (e) { return ""; }
    }

    function avisar(texto, tipo) {
        if (window.Avisos) window.Avisos.avisar(texto, { tipo: tipo || "ok" });
    }

    async function montar(contenedor, o) {
        if (!contenedor || !o || !o.sb || !o.alumno) return;
        const sb = o.sb, alumno = o.alumno;
        const turno = String(Date.now()) + Math.random();
        contenedor.dataset.turno = turno;
        const vigente = () => contenedor.dataset.turno === turno;
        contenedor.innerHTML = "";

        const titulo = el("h3", "text-sm font-semibold text-brand-800 dark:text-white");
        titulo.innerHTML = '<span aria-hidden="true">✍️</span> ';
        titulo.append("Unas palabras para la casa");
        const ayuda = el("p", "text-xs text-brand-450 dark:text-brand-350 mt-1",
            "Sale arriba del próximo informe de cada persona apuntada, firmado con tu nombre. Empieza con una frase lista y ajústala.");
        const estado = el("p", "text-sm text-brand-700 dark:text-brand-200 mt-3");
        estado.setAttribute("data-casa-situacion", "");
        estado.textContent = "Mirando cómo viene esta semana…";
        const frases = el("div", "flex flex-col items-start gap-2 mt-2");
        frases.setAttribute("data-casa-frases", "");

        const idCampo = "mensaje-casa-texto";
        const etiqueta = el("label", "block text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mt-4 mb-1", "Tu mensaje");
        etiqueta.htmlFor = idCampo;
        const campo = el("textarea", "w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
        campo.id = idCampo;
        campo.rows = 3;
        campo.maxLength = MAXIMO;
        const cuenta = el("p", "text-xs text-brand-450 dark:text-brand-350 mt-1");
        cuenta.id = idCampo + "-cuenta";
        campo.setAttribute("aria-describedby", cuenta.id);
        const contar = () => { cuenta.textContent = `${campo.value.length} de ${MAXIMO} letras`; };
        campo.addEventListener("input", contar);
        contar();

        const acciones = el("div", "flex flex-wrap items-center gap-2 mt-2");
        const mandar = el("button", BOTON_FUERTE, "Mandar con el próximo informe");
        mandar.type = "button";
        mandar.setAttribute("data-casa-mandar", "");
        const guardar = el("button", BOTON, "Guardar como mi plantilla");
        guardar.type = "button";
        guardar.setAttribute("data-casa-guardar", "");
        const todasLbl = el("label", "inline-flex items-center gap-2 text-xs text-brand-600 dark:text-brand-300 cursor-pointer");
        const todas = el("input", "w-4 h-4 rounded border-brand-300 focus:ring-2 focus:ring-accent-400");
        todas.type = "checkbox";
        todas.setAttribute("data-casa-todas", "");
        todasLbl.append(todas, "Sirve para cualquier situación");
        acciones.append(mandar, guardar, todasLbl);

        const nadie = el("p", "text-xs text-amber-800 dark:text-amber-300 mt-2");
        nadie.setAttribute("data-casa-nadie", "");
        nadie.hidden = true;
        nadie.textContent = "Todavía no hay nadie apuntado para este alumno: el mensaje no le llega a nadie hasta que agregues un correo arriba.";

        const recientesTit = el("h4", "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mt-5 mb-2", "Mensajes de las últimas semanas");
        const recientes = el("ul", "space-y-2 list-none p-0");
        recientes.setAttribute("data-casa-recientes", "");

        contenedor.append(titulo, ayuda, estado, frases);
        if (!o.soloLectura) contenedor.append(etiqueta, campo, cuenta, acciones, nadie);
        contenedor.append(recientesTit, recientes);

        let situacion = null;
        let propias = [];

        function pintarFrases() {
            frases.innerHTML = "";
            if (o.soloLectura) return;
            const lista = sugerencias(situacion, propias);
            lista.forEach((f) => {
                const fila = el("div", "flex items-start gap-2 w-full");
                const b = el("button", "flex-1 text-left text-sm text-brand-700 dark:text-brand-200 bg-brand-50 dark:bg-brand-950 border border-brand-100 dark:border-brand-800 rounded-lg px-3 py-2 hover:border-accent-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
                b.type = "button";
                b.setAttribute("data-casa-frase", f.propia ? "propia" : "sitio");
                const mas = el("span", "font-bold text-accent-700 dark:text-accent-400 mr-1", "+");
                mas.setAttribute("aria-hidden", "true");
                b.append(mas, f.texto);
                if (f.propia) b.append(el("span", "ml-2 text-xs text-brand-450 dark:text-brand-350", "(tuya)"));
                b.setAttribute("aria-label", "Agregar al mensaje: " + f.texto);
                b.addEventListener("click", () => {
                    const actual = campo.value.trim();
                    campo.value = (actual ? actual + " " : "") + f.texto;
                    if (campo.value.length > MAXIMO) campo.value = campo.value.slice(0, MAXIMO);
                    contar();
                    campo.focus();
                });
                fila.appendChild(b);
                if (f.propia) {
                    const borrar = el("button", "shrink-0 text-xs text-brand-500 dark:text-brand-300 underline underline-offset-2 px-1 py-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Borrar");
                    borrar.type = "button";
                    borrar.setAttribute("aria-label", "Borrar tu plantilla: " + f.texto);
                    borrar.addEventListener("click", async () => {
                        const { error } = await sb.from("plantillas_casa").delete().eq("id", f.id);
                        if (error) { avisar("No se pudo borrar: " + error.message, "error"); return; }
                        propias = propias.filter((p) => p.id !== f.id);
                        pintarFrases();
                        avisar("Se borró tu plantilla.");
                    });
                    fila.appendChild(borrar);
                }
                frases.appendChild(fila);
            });
        }

        async function cargarRecientes() {
            const { data, error } = await sb.from("mensajes_casa")
                .select("id, texto, created_at, autor_id")
                .eq("alumno_id", alumno.id)
                .order("created_at", { ascending: false })
                .limit(5);
            if (!vigente()) return;
            recientes.innerHTML = "";
            if (error) { recientes.appendChild(el("li", "text-sm text-red-600 dark:text-red-400", "No se pudieron cargar: " + error.message)); return; }
            if (!(data || []).length) {
                recientes.appendChild(el("li", "text-sm text-brand-450 dark:text-brand-350", "Todavía no le has mandado ninguno."));
                return;
            }
            data.forEach((m) => {
                const li = el("li", "flex items-start gap-2 border-b border-brand-50 dark:border-brand-800/60 last:border-0 pb-2");
                const cuerpo = el("div", "flex-1 min-w-0");
                cuerpo.appendChild(el("p", "text-sm text-brand-700 dark:text-brand-200 whitespace-pre-line break-words", m.texto));
                cuerpo.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350", "Escrito el " + fechaCorta(m.created_at)));
                li.appendChild(cuerpo);
                if (!o.soloLectura && m.autor_id === o.yo) {
                    const quitar = el("button", "shrink-0 text-xs text-brand-500 dark:text-brand-300 underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Quitar");
                    quitar.type = "button";
                    quitar.setAttribute("aria-label", "Quitar el mensaje del " + fechaCorta(m.created_at));
                    quitar.addEventListener("click", async () => {
                        const ok = await window.Avisos.confirmar(
                            "Se saca de los informes que todavía no salieron. Los que ya llegaron a la casa no se pueden recoger.",
                            { titulo: "¿Quitar este mensaje?", aceptar: "Quitar el mensaje", peligro: true });
                        if (!ok) return;
                        const { error: e } = await sb.from("mensajes_casa").delete().eq("id", m.id);
                        if (e) { avisar("No se pudo quitar: " + e.message, "error"); return; }
                        avisar("Se quitó el mensaje.");
                        cargarRecientes();
                    });
                    li.appendChild(quitar);
                }
                recientes.appendChild(li);
            });
        }

        mandar.addEventListener("click", async () => {
            const texto = campo.value.trim();
            if (!texto) { avisar("Escribe el mensaje, o elige una frase de arriba.", "error"); campo.focus(); return; }
            mandar.disabled = true;
            const { error } = await sb.from("mensajes_casa").insert({ alumno_id: alumno.id, texto });
            mandar.disabled = false;
            if (error) { avisar("No se pudo guardar: " + error.message, "error"); return; }
            campo.value = "";
            contar();
            avisar("Listo: sale en el próximo informe a la casa de " + (alumno.nombre || "este alumno") + ".");
            cargarRecientes();
        });

        guardar.addEventListener("click", async () => {
            const texto = aPlantilla(campo.value, situacion);
            if (!texto) { avisar("Escribe primero la frase que quieres guardar.", "error"); campo.focus(); return; }
            const sit = todas.checked || !situacion || !NOMBRES[situacion.clave] ? "todas" : situacion.clave;
            const { data, error } = await sb.from("plantillas_casa").insert({ situacion: sit, texto }).select("id, situacion, texto").single();
            if (error) {
                avisar(/duplicate|unique|23505/i.test(String(error.message || error.code)) ? "Esa plantilla ya la tenías guardada." : "No se pudo guardar: " + error.message, "error");
                return;
            }
            propias = [data].concat(propias);
            pintarFrases();
            avisar(sit === "todas"
                ? "Se guardó tu plantilla. Va a salir con cualquier alumno."
                : "Se guardó tu plantilla. Va a salir cuando un alumno esté en «" + NOMBRES[sit] + "»."
                  + (texto.includes("{nombre}") ? " El nombre se cambia por el de cada alumno." : ""));
        });

        // Lo que tarda en llegar se pide a la vez.
        const pedidos = [
            (async () => {
                try {
                    const r = await o.llamar({ action: "situacion", student_id: alumno.id, frecuencia: "semanal" });
                    situacion = r && r.situacion ? r.situacion : null;
                } catch (e) { situacion = null; }
            })(),
            (async () => {
                if (o.soloLectura) return;
                const { data } = await sb.from("plantillas_casa").select("id, situacion, texto").order("created_at", { ascending: false });
                propias = data || [];
            })(),
            (async () => {
                if (o.soloLectura) return;
                const { data } = await sb.from("encargados").select("id").eq("student_id", alumno.id).limit(1);
                nadie.hidden = !!(data && data.length);
            })(),
        ];
        cargarRecientes();
        await Promise.all(pedidos);
        if (!vigente()) return;
        estado.textContent = situacion && NOMBRES[situacion.clave]
            ? `Esta semana: ${situacion.titulo}${situacion.clave === "no_entro" ? "" : " (" + diasTexto(situacion) + ")"}.`
            : "No se pudo saber cómo viene esta semana: te mostramos las frases generales.";
        pintarFrases();
    }

    const api = { FRASES, NOMBRES, MAXIMO, rellenar, sugerencias, aPlantilla, cabe, montar };
    if (typeof window !== "undefined") window.PlantillasCasa = api;
    if (typeof module !== "undefined") module.exports = api;
})();
