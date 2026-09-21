/* Volcar un grupo entero, o un subgrupo entero, dentro de un equipo.
 * ---------------------------------------------------------------------------
 * Un equipo es la ÚNICA forma de agrupar del sitio que da permisos: cada
 * entrenador de un equipo ve y gestiona a todos sus alumnos. Llenarlo era
 * elegir de a uno en un selector de trescientos nombres, así que armar un
 * equipo de verdad costaba una tarde — y esa es la razón por la que los
 * permisos se terminaban repartiendo alumno por alumno.
 *
 * Esto vive APARTE y no dentro de admin.html porque lo usan dos pantallas —el
 * panel de administración y el de coordinación— y escrito dos veces se iría
 * separando a la primera corrección. Es la misma razón por la que
 * `js/subgrupos-marcar.js` está escrito una sola vez para Tareas y Exámenes.
 *
 * LO QUE SE MANDA ES LA LISTA COMPLETA, NUNCA SOLO EL GRUPO. Las dos puertas
 * que escriben los alumnos de un equipo —`equipo_set_alumnos` de la Edge
 * Function y `coord_equipo_set_alumnos()` en la base— dejan la lista
 * EXACTAMENTE como llega: mandar solo los del grupo **vaciaría el equipo de
 * todo lo anterior**, y eso no daría ningún error — el equipo se vería
 * perfecto con sus 23 nombres nuevos y los 40 de antes habrían perdido a sus
 * entrenadores sin que nadie lo pidiera. Por eso acá se une, nunca se
 * reemplaza, y por eso este módulo no ofrece "dejar solo estos".
 */
(function () {
    "use strict";

    function norm(t) {
        return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    }

    /* Los grupos salen de los alumnos que la pantalla ya tiene cargados, no de
       una consulta aparte: `profiles.grupo` es texto libre, así que la lista de
       grupos no existe en ninguna tabla — es lo que haya escrito en las fichas. */
    function gruposDe(alumnos) {
        const porNombre = new Map();
        (alumnos || []).forEach((a) => {
            const g = String(a.grupo || "").trim();
            if (!g) return;
            if (!porNombre.has(g)) porNombre.set(g, []);
            porNombre.get(g).push(a.id);
        });
        return Array.from(porNombre.entries())
            .sort((a, b) => a[0].localeCompare(b[0], "es"))
            .map(([nombre, ids]) => ({ nombre: nombre, ids: ids }));
    }

    /* Qué pasa al elegir una fuente. Se devuelve el plan en vez de mandarlo,
       para poder decir qué va a pasar ANTES y para que la prueba pueda mirarlo
       sin navegador. */
    function planear(yaEstan, pedidos, conocidos, tope) {
        const dentro = new Set(yaEstan || []);
        const existe = new Set(conocidos || []);
        const desconocidos = [];
        const nuevos = [];
        let repetidos = 0;
        (pedidos || []).forEach((id) => {
            if (!existe.has(id)) { desconocidos.push(id); return; }
            if (dentro.has(id)) { repetidos += 1; return; }
            if (nuevos.indexOf(id) === -1) nuevos.push(id);
        });
        const lista = (yaEstan || []).concat(nuevos);
        return {
            nuevos: nuevos,
            repetidos: repetidos,
            descartados: desconocidos.length,
            lista: lista,
            // El tope es de cordura y lo hace cumplir el servidor; acá se mira
            // antes para no mandar algo que va a volver con un error, que es
            // justo cuando quien lo aprieta ya no sabe qué arreglar.
            pasaElTope: !tope || lista.length <= tope,
            tope: tope || 0,
        };
    }

    function frase(plan) {
        if (!plan.pasaElTope) {
            return "Quedarían " + plan.lista.length + " alumnos y el tope de un equipo es "
                + plan.tope + ". Arma dos equipos, o quítale algunos primero.";
        }
        if (!plan.nuevos.length) {
            return plan.repetidos ? "Ya estaban todos en el equipo." : "Ahí no hay ningún alumno que sumar.";
        }
        let t = "Entraron " + plan.nuevos.length
            + (plan.nuevos.length === 1 ? " alumno" : " alumnos");
        if (plan.repetidos) t += " · " + plan.repetidos + " ya " + (plan.repetidos === 1 ? "estaba" : "estaban");
        // Un id que la pantalla no reconoce es un alumno que se fue de su
        // alcance (lo reasignaron, o el subgrupo es de otro profesor). Se dice:
        // dar por bueno el número del grupo dejaría el equipo con menos gente
        // de la que se pidió sin que nada fallara. Misma regla que el selector
        // de subgrupos de Tareas.
        if (plan.descartados) t += " · " + plan.descartados + " no " + (plan.descartados === 1 ? "está" : "están") + " en tu lista";
        return t + ".";
    }

    /* El control: un selector con sus dos grupos de opciones y el renglón que
       dice qué pasó. `guardar` recibe la lista COMPLETA y devuelve una promesa. */
    function montar(opciones) {
        const o = opciones || {};
        const alumnos = o.alumnos || [];
        const conocidos = alumnos.map((a) => a.id);
        const porId = new Map(alumnos.map((a) => [a.id, a]));
        const grupos = gruposDe(alumnos);
        const subgrupos = (o.subgrupos || []).filter((s) => (s.alumnos || []).length);

        const caja = document.createElement("div");
        caja.className = "mt-2 flex flex-wrap items-center gap-2";

        if (!grupos.length && !subgrupos.length) {
            const nada = document.createElement("span");
            nada.className = "text-xs text-brand-450 dark:text-brand-350";
            nada.textContent = "Todavía no hay ningún grupo ni subgrupo que volcar acá.";
            caja.appendChild(nada);
            return caja;
        }

        const etiqueta = document.createElement("span");
        etiqueta.className = "text-xs text-brand-500 dark:text-brand-300";
        etiqueta.textContent = "O de una vez:";

        const sel = document.createElement("select");
        sel.className = "px-2 py-1 rounded bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-xs max-w-[16rem]";
        sel.setAttribute("aria-label", "Sumar un grupo o un subgrupo entero a " + (o.nombre || "este equipo"));

        const vacia = document.createElement("option");
        vacia.value = "";
        vacia.textContent = "＋ sumar un grupo entero…";
        sel.appendChild(vacia);

        function opcion(valor, texto) {
            const op = document.createElement("option");
            op.value = valor;
            op.textContent = texto;   // nombres que escribe una persona: textContent
            return op;
        }

        if (grupos.length) {
            const g = document.createElement("optgroup");
            g.label = "Grupos";
            grupos.forEach((x, i) => {
                g.appendChild(opcion("g" + i, x.nombre + " (" + x.ids.length + ")"));
            });
            sel.appendChild(g);
        }
        if (subgrupos.length) {
            const g = document.createElement("optgroup");
            g.label = "Subgrupos";
            subgrupos.forEach((s, i) => {
                // De quién es el subgrupo va SIEMPRE: dos profesores pueden
                // tener cada uno su «Los del martes», y son listas distintas.
                const duenno = s.profesor ? " — " + s.profesor : " — otro profesor";
                g.appendChild(opcion("s" + i, s.nombre + duenno + " (" + (s.alumnos || []).length + ")"));
            });
            sel.appendChild(g);
        }

        const msg = document.createElement("span");
        msg.className = "text-xs text-brand-450 dark:text-brand-350";
        msg.setAttribute("role", "status");
        /* Guardar repinta la tarjeta entera —es la única forma de que las
           etiquetas y el selector de "sumar otro" queden al día sin olvidos—,
           así que este renglón se muere en el acto y «Entraron 23» no lo lee
           nadie. Por eso `guardar` recibe la frase: quien repinta la conserva y
           se la devuelve al control nuevo en `mensaje`. */
        if (o.mensaje) msg.textContent = o.mensaje;

        sel.addEventListener("change", async () => {
            const valor = sel.value;
            sel.value = "";
            if (!valor) return;
            const fuente = valor.charAt(0) === "g"
                ? grupos[Number(valor.slice(1))]
                : subgrupos[Number(valor.slice(1))];
            if (!fuente) return;
            const pedidos = fuente.ids || fuente.alumnos || [];
            const plan = planear(o.yaEstan || [], pedidos, conocidos, o.tope);

            if (!plan.pasaElTope || !plan.nuevos.length) {
                msg.textContent = frase(plan);
                msg.className = "text-xs " + (plan.pasaElTope
                    ? "text-brand-450 dark:text-brand-350"
                    : "text-red-600 dark:text-red-400");
                return;
            }

            sel.disabled = true;
            msg.className = "text-xs text-brand-450 dark:text-brand-350";
            msg.textContent = "Sumando…";
            try {
                await o.guardar(plan.lista, frase(plan));
                msg.textContent = frase(plan);
            } catch (err) {
                msg.className = "text-xs text-red-600 dark:text-red-400";
                msg.textContent = "No se pudo: " + (err && err.message ? err.message : err);
            }
            sel.disabled = false;
        });

        caja.append(etiqueta, sel, msg);
        caja.dataset.alumnosConocidos = String(porId.size);
        return caja;
    }

    window.EquipoVolcar = { montar: montar, planear: planear, gruposDe: gruposDe, frase: frase, norm: norm };
})();
