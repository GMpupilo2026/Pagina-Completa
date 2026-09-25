/* encuesta-profesor.html — el alumno cuenta cómo le van las clases.
 *
 * Nada se escribe directo en la tabla: `encuestas_profesor` no tiene política
 * de escritura. Guarda responder_encuesta_profesor(), que comprueba que el
 * profesor sea DE VERDAD de quien contesta (es_mi_profesor()), que las seis
 * notas vayan del 1 al 5, y pone ella el mes (hora de Costa Rica). Una por
 * alumno, profesor y mes: lo garantiza el índice único, y contestar otra vez
 * en el mismo mes la corrige.
 *
 * Las preguntas salen de js/encuesta-preguntas.js, la misma copia que lee
 * satisfaccion.html.
 */
(function () {
    const P = window.EncuestaPreguntas;
    let session = null;
    let profesores = [];      // [{ id, nombre, respondida }]
    let elegido = null;       // id del profesor

    const CLASE_OPCION = "flex items-center gap-2 rounded-lg border border-brand-200 dark:border-brand-700 bg-brand-50 dark:bg-brand-950 px-3 py-2 text-sm cursor-pointer hover:border-accent-500 has-[:checked]:border-accent-500 has-[:checked]:bg-accent-50 dark:has-[:checked]:bg-brand-800 has-[:checked]:font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-400";

    function opcion(nombre, valor, texto) {
        const label = document.createElement("label");
        label.className = CLASE_OPCION;
        const input = document.createElement("input");
        input.type = "radio";
        input.name = nombre;
        input.value = valor;
        input.className = "w-4 h-4 shrink-0 accent-accent-500";
        const span = document.createElement("span");
        span.textContent = texto;
        label.append(input, span);
        return label;
    }

    function pintarPreguntas() {
        const caja = document.getElementById("preguntas");
        caja.replaceChildren();
        P.PREGUNTAS.forEach((q, i) => {
            const fs = document.createElement("fieldset");
            fs.className = "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5";
            const lg = document.createElement("legend");
            lg.className = "font-semibold text-brand-800 dark:text-white mb-3 float-left w-full";
            lg.textContent = (i + 1) + ". " + q.texto;
            const grid = document.createElement("div");
            grid.className = "clear-both grid grid-cols-1 sm:grid-cols-5 gap-2";
            // El número va escrito junto a la palabra: «1 · Nada». La
            // posición en la fila no puede ser lo único que diga cuánto es.
            q.opciones.forEach((t, j) => grid.appendChild(opcion(q.clave, String(j + 1), (j + 1) + " · " + t)));
            fs.append(lg, grid);
            caja.appendChild(fs);
        });
        const seguir = document.getElementById("seguir");
        seguir.replaceChildren();
        P.SEGUIR.forEach((s) => seguir.appendChild(opcion("seguir", s.valor, s.texto)));
    }

    function pintarProfesores() {
        const caja = document.getElementById("profesores");
        caja.replaceChildren();
        profesores.forEach((p) => {
            const l = opcion("profesor", p.id, "");
            const txt = l.querySelector("span");
            txt.className = "min-w-0";
            const nom = document.createElement("span");
            nom.className = "block";
            nom.textContent = p.nombre;
            const est = document.createElement("span");
            est.className = "block text-xs font-normal text-brand-500 dark:text-brand-300";
            est.textContent = p.respondida ? "✅ Ya contestaste este mes" : "Te falta contestar este mes";
            txt.append(nom, est);
            const input = l.querySelector("input");
            input.checked = p.id === elegido;
            input.addEventListener("change", () => { if (input.checked) elegir(p.id); });
            caja.appendChild(l);
        });
    }

    function marcar(nombre, valor) {
        document.querySelectorAll(`input[name="${nombre}"]`).forEach((i) => { i.checked = i.value === String(valor); });
    }

    async function elegir(id) {
        elegido = id;
        const prof = profesores.find((p) => p.id === id);
        const form = document.getElementById("form");
        form.hidden = false;
        document.getElementById("form-titulo").textContent = "Tus clases con " + prof.nombre;
        form.reset();
        const estado = document.getElementById("form-estado");
        estado.textContent = "";
        // Si ya contestó este mes, se le enseña lo que mandó para corregirlo.
        const { data, error } = await sb.from("encuestas_profesor")
            .select("explica, aprende, claridad, creatividad, resuelve, contento, seguir, comentario, periodo")
            .eq("alumno_id", session.user.id).eq("profesor_id", id).eq("periodo", P.mesActual())
            .maybeSingle();
        if (error) { estado.textContent = "No se pudo revisar si ya habías contestado: " + error.message; return; }
        if (data) {
            P.PREGUNTAS.forEach((q) => marcar(q.clave, data[q.clave]));
            marcar("seguir", data.seguir);
            document.getElementById("comentario").value = data.comentario || "";
            estado.textContent = "Ya contestaste este mes. Si cambias algo y vuelves a enviar, se corrige.";
            document.getElementById("enviar").textContent = "Guardar los cambios";
        } else {
            document.getElementById("enviar").textContent = "Enviar mi opinión";
        }
    }

    function valorDe(nombre) {
        const i = document.querySelector(`input[name="${nombre}"]:checked`);
        return i ? i.value : null;
    }

    async function enviar(ev) {
        ev.preventDefault();
        if (!elegido) { Avisos.avisar("Elige primero sobre cuál profesor vas a contestar.", { tipo: "error" }); return; }
        const faltan = P.PREGUNTAS.map((q, i) => (valorDe(q.clave) ? null : i + 1)).filter(Boolean);
        if (!valorDe("seguir")) faltan.push(7);
        if (faltan.length) {
            Avisos.avisar((faltan.length === 1 ? "Te falta la pregunta " : "Te faltan las preguntas ") + faltan.join(", ") + ".", { tipo: "error" });
            const primera = faltan[0] === 7 ? "seguir" : P.PREGUNTAS[faltan[0] - 1].clave;
            const input = document.querySelector(`input[name="${primera}"]`);
            if (input) input.focus();
            return;
        }
        const boton = document.getElementById("enviar");
        boton.disabled = true;
        const args = { p_profesor: elegido, p_seguir: valorDe("seguir"), p_comentario: document.getElementById("comentario").value.trim() };
        P.PREGUNTAS.forEach((q) => { args["p_" + q.clave] = Number(valorDe(q.clave)); });
        const { error } = await sb.rpc("responder_encuesta_profesor", args);
        boton.disabled = false;
        // El mensaje de la base dice qué arreglar: se enseña tal cual.
        if (error) { Avisos.avisar("No se pudo guardar: " + error.message, { tipo: "error" }); return; }
        const prof = profesores.find((p) => p.id === elegido);
        prof.respondida = true;
        pintarProfesores();
        document.getElementById("form-estado").textContent = "✅ Guardado. Si cambias algo y vuelves a enviar, se corrige.";
        boton.textContent = "Guardar los cambios";
        Avisos.avisar("✅ ¡Gracias! Tu opinión sobre las clases con " + prof.nombre + " quedó guardada.", { tipo: "ok" });
    }

    async function init() {
        const { data } = await sb.auth.getSession();
        session = data.session;
        if (!session) { location.href = "login.html?next=encuesta-profesor.html"; return; }
        const { data: perfil } = await sb.from("profiles").select("role, is_admin").eq("id", session.user.id).maybeSingle();
        document.getElementById("loading").classList.add("hidden");
        if (!perfil || perfil.role !== "alumno") {
            document.getElementById("denegado").classList.remove("hidden");
            return;
        }
        document.getElementById("app").classList.remove("hidden");
        const { data: lista, error } = await sb.rpc("encuesta_mis_profesores");
        if (error) {
            const p = document.getElementById("sin-profesor");
            p.textContent = "No se pudo cargar la lista de tus profesores: " + error.message;
            p.hidden = false;
            return;
        }
        profesores = lista || [];
        if (!profesores.length) { document.getElementById("sin-profesor").hidden = false; return; }
        pintarPreguntas();
        document.getElementById("form").addEventListener("submit", enviar);
        // Con un solo profesor no hay nada que elegir; con varios, se
        // empieza por el primero al que le falta la encuesta de este mes.
        const pedido = new URLSearchParams(location.search).get("profesor");
        const inicial = profesores.find((p) => p.id === pedido)
            || profesores.find((p) => !p.respondida) || profesores[0];
        elegido = inicial.id;
        if (profesores.length > 1) {
            document.getElementById("elegir-profesor-caja").hidden = false;
        }
        pintarProfesores();
        await elegir(inicial.id);
    }

    init();
})();
