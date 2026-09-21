/* Marcar de una vez a todos los alumnos de un subgrupo.
 *
 * Lo usan las dos pantallas donde se elige a quién se le manda algo —Tareas y
 * Exámenes—, que tienen la misma lista de casillas. Escrito dos veces se
 * separaría a la primera corrección, y son justo las dos pantallas donde
 * equivocarse cuesta caro: una tarea mandada a toda la Academia en vez de a
 * los seis del martes no da ningún error.
 *
 * QUÉ HACE AL ELEGIR: marca a los del subgrupo y DESMARCA al resto. Es lo que
 * quiere decir "mándasela a los del martes", y deja la lista en un estado que
 * se puede leer de un vistazo. Sumar sobre lo que ya estaba marcado sería más
 * flexible y mucho menos predecible: nadie revisa sesenta casillas antes de
 * apretar el botón.
 *
 * El selector NO aparece si no hay ningún subgrupo con alumnos: un control que
 * no hace nada es peor que ninguno.
 */
(function () {
    const SubgruposMarcar = {
        /**
         * @param {object} o
         * @param {object} o.sb        cliente de Supabase
         * @param {Element} o.antesDe  el control se inserta justo encima de esto
         * @param {string} o.casillas  selector de las casillas de alumno
         * @param {function} [o.alMarcar] se llama con cuántos quedaron marcados
         */
        async montar(o) {
            const { data, error } = await o.sb.rpc("mis_subgrupos");
            if (error) return;                       // sin subgrupos se sigue como siempre
            const subgrupos = (data || []).filter((s) => s.cuantos > 0);
            if (!subgrupos.length) return;

            const caja = document.createElement("div");
            caja.className = "flex flex-wrap items-center gap-2 mb-2";

            const etiqueta = document.createElement("label");
            etiqueta.className = "text-xs font-semibold text-brand-500 dark:text-brand-300";
            etiqueta.textContent = "Marcar solo a los de";
            etiqueta.htmlFor = "subgrupo-marcar";
            caja.appendChild(etiqueta);

            const select = document.createElement("select");
            select.id = "subgrupo-marcar";
            select.className = "bg-white dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            const vacia = document.createElement("option");
            vacia.value = "";
            vacia.textContent = "— un subgrupo —";
            select.appendChild(vacia);
            subgrupos.forEach((s) => {
                const opt = document.createElement("option");
                opt.value = s.id;
                // El nombre lo escribió una persona: textContent, nunca innerHTML.
                opt.textContent = s.nombre + " (" + s.cuantos + ")";
                select.appendChild(opt);
            });
            caja.appendChild(select);

            const dicho = document.createElement("span");
            dicho.className = "text-xs text-brand-450 dark:text-brand-350";
            dicho.setAttribute("aria-live", "polite");
            caja.appendChild(dicho);

            select.addEventListener("change", () => {
                const sub = subgrupos.find((s) => s.id === select.value);
                const dentro = new Set(sub ? sub.alumnos : []);
                let marcados = 0;
                document.querySelectorAll(o.casillas).forEach((c) => {
                    c.checked = sub ? dentro.has(c.value) : false;
                    if (c.checked) marcados += 1;
                });
                /* Cuántos quedaron marcados PUEDE NO SER cuántos tiene el
                   subgrupo: si a uno de sus alumnos lo reasignaron, ya no está
                   en la lista de esta pantalla. Se dice el número de verdad, el
                   de las casillas, y se avisa de la diferencia — dar por bueno
                   el del subgrupo dejaría una tarea con un alumno menos sin que
                   nada fallara. */
                if (!sub) { dicho.textContent = ""; return; }
                dicho.textContent = marcados === sub.cuantos
                    ? (marcados === 1 ? "1 marcado" : marcados + " marcados")
                    : marcados + " de " + sub.cuantos + " — a los demás ya no los tienes asignados";
                if (o.alMarcar) o.alMarcar(marcados);
            });

            o.antesDe.parentNode.insertBefore(caja, o.antesDe);
        },
    };
    window.SubgruposMarcar = SubgruposMarcar;
})();
