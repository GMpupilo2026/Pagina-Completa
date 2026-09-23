/* La bitácora del profesor: lo que observa de un alumno, cuando lo observa.
 *
 * Hasta ahora lo único que el profesor podía escribir era `class_sessions.notes`
 * —UNA línea por clase entera, sin alumno—, así que no había dónde poner "a
 * Sofía le cuesta el final de torre, revisarlo en dos semanas", que es la
 * materia prima del seguimiento.
 *
 * Este archivo existe porque la bitácora se usa desde DOS lugares y no puede
 * estar escrita dos veces:
 *
 *  - `sesion.html`, en la clase en vivo, que es CUANDO se ve el error. Ahí va
 *    en modo compacto, colgando del alumno conectado.
 *  - `informes.html`, en el informe individual, que es cuando se repasa.
 *
 * Y una tercera, de solo lectura: el propio alumno, que ve únicamente las que
 * su profesor decidió compartirle.
 *
 * ---- Lo que decide la base, no esta página ----
 *
 * La tabla está aislada por profesor (un profesor ve las suyas, no las de un
 * colega que comparte el mismo alumno; quien administra ve todas), el insert
 * exige `profesor_id = auth.uid()` SIEMPRE y el alumno no tiene política de
 * insert, update ni delete. Nada de eso se comprueba acá: si un día esta
 * página se equivoca, la fila se rechaza igual. Lo que hace este archivo es
 * no ofrecer botones que van a fallar.
 *
 * ---- Nunca innerHTML con lo que escribió una persona ----
 *
 * El texto de una nota y el nombre de un alumno los escribe alguien, así que
 * van siempre por `textContent`. Es la misma regla que ya sigue
 * `renderStudentsList()` en la clase en vivo.
 */
window.NotasAlumno = (function () {
    const CAMPOS = "id, alumno_id, profesor_id, texto, etiqueta, compartida, created_at, updated_at";

    /* Cuántas se pintan en la clase en vivo. Ahí el profesor está dando clase:
       lo que necesita es lo último que anotó, no el historial entero. */
    const TOPE_COMPACTO = 5;

    async function listar(sb, alumnoId, limite) {
        let q = sb.from("notas_alumno").select(CAMPOS)
            .eq("alumno_id", alumnoId)
            .order("created_at", { ascending: false });
        if (limite) q = q.limit(limite);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
    }

    async function crear(sb, nota) {
        const fila = {
            alumno_id: nota.alumnoId,
            profesor_id: nota.profesorId,
            texto: nota.texto,
            etiqueta: nota.etiqueta || null,
            compartida: !!nota.compartida,
        };
        const { data, error } = await sb.from("notas_alumno").insert(fila).select(CAMPOS).single();
        if (error) throw error;
        return data;
    }

    async function actualizar(sb, id, campos) {
        const { data, error } = await sb.from("notas_alumno").update(campos).eq("id", id).select(CAMPOS).single();
        if (error) throw error;
        return data;
    }

    async function borrar(sb, id) {
        const { error } = await sb.from("notas_alumno").delete().eq("id", id);
        if (error) throw error;
    }

    function fechaCorta(iso) {
        return new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" });
    }

    /* El enlace que convierte la nota en tarea. Lleva el id de la nota y no su
       texto: el texto puede ser largo, y una dirección con lo que el profesor
       escribió de un alumno queda en el historial del navegador. `tareas.html`
       la lee de la base, que ya se la deja leer. */
    function enlaceTarea(nota) {
        return "tareas.html?alumno=" + encodeURIComponent(nota.alumno_id) +
               "&nota=" + encodeURIComponent(nota.id);
    }

    /* Las clases van escritas enteras y nunca armadas con una expresión
       regular sobre className: el CSS se compila leyendo el código, así que una
       clase que solo existe a medias no se escribe en la hoja y no pinta nada
       — sin dar ningún error. */
    const CLASES_BOTON = "text-xs font-semibold px-2 py-1 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    const CLASES_BOTON_NEUTRO = "bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200";

    function boton(texto, titulo, clases) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = texto;
        if (titulo) b.title = titulo;
        b.className = CLASES_BOTON + " " + (clases || CLASES_BOTON_NEUTRO);
        return b;
    }

    /* Una nota pintada. `acciones` es false en la vista del alumno: ahí solo se
       lee. */
    function pintarNota(nota, opciones, alCambiar) {
        const li = document.createElement("li");
        li.className = "border-b border-brand-50 dark:border-brand-800/60 last:border-0 py-2";
        li.dataset.notaId = nota.id;

        const cabecera = document.createElement("div");
        cabecera.className = "flex items-center gap-2 flex-wrap mb-1";

        const fecha = document.createElement("span");
        fecha.className = "text-xs text-brand-450 dark:text-brand-350";
        fecha.textContent = fechaCorta(nota.created_at);
        cabecera.appendChild(fecha);

        /* Quién la escribió: solo viene en la vista de quien supervisa, que
           junta la bitácora de TODOS los profesores del alumno. */
        if (nota.autor) {
            const autor = document.createElement("span");
            autor.className = "text-xs font-semibold text-brand-600 dark:text-brand-300";
            autor.textContent = "De " + nota.autor;
            cabecera.appendChild(autor);
        }

        if (nota.etiqueta) {
            const chip = document.createElement("span");
            chip.className = "text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-800 text-brand-600 dark:text-brand-300";
            chip.textContent = nota.etiqueta;
            cabecera.appendChild(chip);
        }

        /* Que esté compartida va ESCRITO, no solo con un color: es la misma
           regla de los gráficos de Informes y de las barras del diagnóstico. */
        if (nota.compartida) {
            const vista = document.createElement("span");
            vista.className = "text-xs font-semibold text-accent-700 dark:text-accent-400";
            vista.textContent = "👁️ La ve el alumno";
            cabecera.appendChild(vista);
        }
        li.appendChild(cabecera);

        const texto = document.createElement("p");
        texto.className = "text-sm text-brand-700 dark:text-brand-200 whitespace-pre-wrap break-words";
        texto.textContent = nota.texto;
        li.appendChild(texto);

        if (!opciones.acciones) return li;

        const acciones = document.createElement("div");
        acciones.className = "flex items-center gap-1.5 flex-wrap mt-1.5";

        const compartir = boton(
            nota.compartida ? "Dejar de compartir" : "Compartir",
            nota.compartida
                ? "Volverla privada: el alumno deja de verla"
                : "Que el alumno la vea en su página de Informes");
        compartir.addEventListener("click", async () => {
            compartir.disabled = true;
            try {
                const nueva = await actualizar(opciones.sb, nota.id, { compartida: !nota.compartida });
                alCambiar(nueva);
            } catch (e) {
                opciones.avisar("No se pudo cambiar: " + e.message);
                compartir.disabled = false;
            }
        });
        acciones.appendChild(compartir);

        const tarea = document.createElement("a");
        tarea.href = enlaceTarea(nota);
        tarea.textContent = "📋 Convertir en tarea";
        tarea.title = "Abrir Tareas con este alumno elegido y la nota puesta";
        tarea.className = "text-xs font-semibold px-2 py-1 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        acciones.appendChild(tarea);

        const borrarBtn = boton("Borrar", "Borrar esta nota");
        borrarBtn.addEventListener("click", async () => {
            /* Una nota se escribe en medio de una clase y se borra de un dedazo:
               el paso de confirmación va escrito en el propio botón, sin
               diálogo del navegador, que en el celular tapa la pantalla. */
            if (borrarBtn.dataset.confirmando !== "1") {
                borrarBtn.dataset.confirmando = "1";
                borrarBtn.textContent = "¿Seguro? Borrar";
                borrarBtn.className = CLASES_BOTON + " bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300";
                setTimeout(() => {
                    if (borrarBtn.dataset.confirmando === "1") {
                        borrarBtn.dataset.confirmando = "";
                        borrarBtn.textContent = "Borrar";
                        borrarBtn.className = CLASES_BOTON + " " + CLASES_BOTON_NEUTRO;
                    }
                }, 4000);
                return;
            }
            borrarBtn.disabled = true;
            try {
                await borrar(opciones.sb, nota.id);
                alCambiar(null);
            } catch (e) {
                opciones.avisar("No se pudo borrar: " + e.message);
                borrarBtn.disabled = false;
            }
        });
        acciones.appendChild(borrarBtn);

        li.appendChild(acciones);
        return li;
    }

    /* El panel del profesor: escribir arriba, lo anotado abajo.
     *
     * Escribir va PRIMERO a propósito. En la clase en vivo el profesor abre
     * esto porque acaba de ver algo, no para leer; y en el informe, el
     * historial se lee de corrido debajo. */
    function montarPanel(contenedor, opciones) {
        const sb = opciones.sb;
        contenedor.innerHTML = "";

        const form = document.createElement("form");
        form.className = "grid gap-2 mb-3";

        const textoId = "nota-texto-" + opciones.alumnoId;
        const etiquetaId = "nota-etiqueta-" + opciones.alumnoId;
        const compartirId = "nota-compartir-" + opciones.alumnoId;

        const etiquetaTexto = document.createElement("label");
        etiquetaTexto.className = "sr-only";
        etiquetaTexto.htmlFor = textoId;
        etiquetaTexto.textContent = "Qué observaste";
        const texto = document.createElement("textarea");
        texto.id = textoId;
        texto.rows = opciones.compacto ? 2 : 3;
        texto.maxLength = 4000;
        texto.required = true;
        texto.placeholder = "Ej. Le cuesta el final de torre; repasarlo en dos semanas.";
        texto.className = "w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

        const fila = document.createElement("div");
        fila.className = "flex items-end gap-2 flex-wrap";

        const etiquetaLabel = document.createElement("label");
        etiquetaLabel.className = "sr-only";
        etiquetaLabel.htmlFor = etiquetaId;
        etiquetaLabel.textContent = "Etiqueta (opcional)";
        const etiqueta = document.createElement("input");
        etiqueta.id = etiquetaId;
        etiqueta.type = "text";
        etiqueta.maxLength = 60;
        etiqueta.placeholder = "Etiqueta (opcional)";
        etiqueta.className = "flex-1 min-w-[8rem] bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

        const compartirLabel = document.createElement("label");
        compartirLabel.className = "flex items-center gap-1.5 text-xs text-brand-600 dark:text-brand-300 cursor-pointer";
        compartirLabel.htmlFor = compartirId;
        const compartir = document.createElement("input");
        compartir.id = compartirId;
        compartir.type = "checkbox";
        compartir.className = "rounded border-brand-300 text-accent-500 focus:ring-accent-400";
        compartirLabel.appendChild(compartir);
        const compartirSpan = document.createElement("span");
        compartirSpan.textContent = "Que la vea el alumno";
        compartirLabel.appendChild(compartirSpan);

        const guardar = document.createElement("button");
        guardar.type = "submit";
        guardar.textContent = "Guardar";
        guardar.className = "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

        fila.append(etiqueta, compartirLabel, guardar);
        form.append(etiquetaTexto, texto, etiquetaLabel, fila);

        const aviso = document.createElement("p");
        aviso.className = "text-xs text-brand-500 dark:text-brand-300 mt-1";
        aviso.setAttribute("aria-live", "polite");
        form.appendChild(aviso);

        const lista = document.createElement("ul");
        lista.className = "text-sm";

        contenedor.append(form, lista);

        function avisar(mensaje) { aviso.textContent = mensaje; }
        const opcionesNota = { sb, acciones: true, avisar };

        let notas = [];

        function repintar() {
            lista.innerHTML = "";
            if (!notas.length) {
                const vacio = document.createElement("li");
                vacio.className = "text-brand-450 dark:text-brand-350 text-sm py-2";
                vacio.textContent = "Todavía no has anotado nada de este alumno.";
                lista.appendChild(vacio);
                return;
            }
            notas.forEach((n) => {
                lista.appendChild(pintarNota(n, opcionesNota, (nueva) => {
                    if (nueva) notas = notas.map((x) => (x.id === nueva.id ? nueva : x));
                    else notas = notas.filter((x) => x.id !== n.id);
                    repintar();
                }));
            });
        }

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const valor = texto.value.trim();
            if (!valor) { avisar("Escribe la nota antes de guardarla."); return; }
            guardar.disabled = true;
            avisar("Guardando…");
            try {
                const nueva = await crear(sb, {
                    alumnoId: opciones.alumnoId,
                    profesorId: opciones.profesorId,
                    texto: valor,
                    etiqueta: etiqueta.value.trim() || null,
                    compartida: compartir.checked,
                });
                notas.unshift(nueva);
                if (opciones.compacto) notas = notas.slice(0, TOPE_COMPACTO);
                texto.value = "";
                etiqueta.value = "";
                compartir.checked = false;
                repintar();
                avisar("Guardada.");
            } catch (err) {
                avisar("No se pudo guardar: " + err.message);
            }
            guardar.disabled = false;
        });

        (async () => {
            try {
                notas = await listar(sb, opciones.alumnoId, opciones.compacto ? TOPE_COMPACTO : null);
                repintar();
            } catch (err) {
                /* Si la consulta falla se DICE, en vez de dejar la lista vacía:
                   una bitácora que se ve sin notas y una que no se pudo leer se
                   ven igual, y son cosas muy distintas. */
                avisar("No se pudieron cargar las notas: " + err.message);
            }
        })();
    }

    /* La vista del alumno: solo lo que le compartieron, y solo de lectura.
       Devuelve cuántas pintó, para que la página pueda esconder el bloque
       entero cuando no hay ninguna — un bloque que dice "tu profesor no te ha
       escrito nada" es ruido en todas las visitas menos una. */
    async function montarLectura(contenedor, opciones) {
        contenedor.innerHTML = "";
        let notas = [];
        try {
            if (opciones.supervisor) {
                /* Quien supervisa no escribe notas: lee las de todos los
                   profesores del alumno, con su autor. Lo sirve una función
                   de la base que comprueba que ese alumno esté a su cargo. */
                const { data, error } = await opciones.sb.rpc("bitacora_supervisada", { p_alumno: opciones.alumnoId });
                if (error) throw error;
                notas = data || [];
            } else {
                notas = await listar(opciones.sb, opciones.alumnoId);
            }
        } catch (e) {
            const p = document.createElement("p");
            p.className = "text-sm text-brand-450 dark:text-brand-350";
            p.textContent = "No se pudieron cargar las notas: " + e.message;
            contenedor.appendChild(p);
            return 0;
        }
        if (!notas.length) {
            // Quien supervisa vino a mirar: "no hay nada" también es respuesta.
            if (opciones.supervisor) {
                const p = document.createElement("p");
                p.className = "text-sm text-brand-450 dark:text-brand-350";
                p.textContent = "Sus profesores todavía no le han escrito ninguna nota.";
                contenedor.appendChild(p);
            }
            return 0;
        }
        const lista = document.createElement("ul");
        lista.className = "text-sm";
        notas.forEach((n) => lista.appendChild(pintarNota(n, { acciones: false }, () => {})));
        contenedor.appendChild(lista);
        return notas.length;
    }

    return { listar, crear, actualizar, borrar, fechaCorta, enlaceTarea, montarPanel, montarLectura, TOPE_COMPACTO };
})();
