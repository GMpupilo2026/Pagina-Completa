/* En qué clase está mirando un alumno.
 *
 * Un alumno puede tener VARIOS profesores, y cada profesor tiene su propio
 * tablero, su propia clase en vivo, su propio chat y sus propias preguntas.
 * Este módulo decide cuál de esas clases está mirando: la que eligió la última
 * vez, o —si es la primera— la que tiene clase abierta ahora, o la de su
 * profesor principal.
 *
 * Cambiar de clase RECARGA la página a propósito. Todo en sesion.html y en
 * clases.html cuelga de boardOwnerId: las consultas, los canales de Realtime y
 * el canal de presencia. Cambiarlo en caliente obligaría a desmontar y volver a
 * montar cada uno de esos, y cualquiera que se quedara colgado del profesor
 * anterior seguiría recibiendo su clase — que es justo lo que este cambio viene
 * a evitar. Recargar cuesta un segundo y no deja nada a medias.
 *
 * La clase elegida NO se sincroniza entre aparatos (no está en las CLAVES de
 * js/progreso-usuario.js): es de dónde se está mirando, como el tema o el modo
 * adaptado, no de quién mira.
 */
(function () {
    const CLAVE = "clase_elegida_v1";

    function guardada() {
        try { return localStorage.getItem(CLAVE) || null; } catch (e) { return null; }
    }

    function recordar(id) {
        try {
            if (id) localStorage.setItem(CLAVE, id);
            else localStorage.removeItem(CLAVE);
        } catch (e) {}
    }

    // Devuelve { clases, elegida }. clases viene de public.mis_clases(): un
    // renglón por profesor, con si tiene clase abierta en este momento.
    async function resolver() {
        const { data, error } = await sb.rpc("mis_clases");
        if (error) return { clases: [], elegida: null, error };
        const clases = data || [];
        if (!clases.length) return { clases, elegida: null };

        const previa = guardada();
        if (previa && clases.some((c) => c.profesor_id === previa)) {
            return { clases, elegida: previa };
        }
        const abierta = clases.find((c) => c.clase_abierta);
        const principal = clases.find((c) => c.es_principal);
        return { clases, elegida: (abierta || principal || clases[0]).profesor_id };
    }

    // El selector solo aparece cuando de verdad hay algo que elegir: con un
    // solo profesor sería un control que no hace nada.
    function montarSelector(contenedor, clases, elegida) {
        if (!contenedor || !clases || clases.length < 2) return;
        contenedor.innerHTML = "";
        contenedor.classList.remove("hidden");

        const etiqueta = document.createElement("label");
        etiqueta.setAttribute("for", "selector-clase");
        etiqueta.className = "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide";
        etiqueta.textContent = "Clase";

        const sel = document.createElement("select");
        sel.id = "selector-clase";
        sel.className = "px-2 py-1.5 rounded-lg bg-white dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        clases.forEach((c) => {
            const o = document.createElement("option");
            o.value = c.profesor_id;
            o.textContent = c.profesor + (c.clase_abierta ? " · 🟢 en clase" : "");
            if (c.profesor_id === elegida) o.selected = true;
            sel.appendChild(o);
        });
        sel.addEventListener("change", () => {
            recordar(sel.value);
            location.reload();
        });

        contenedor.append(etiqueta, sel);
    }

    window.ClaseElegida = { resolver, recordar, montarSelector };
})();
