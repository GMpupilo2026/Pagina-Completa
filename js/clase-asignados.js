/* ¿Quién entra a esta clase? La lista de la clase en vivo.
 *
 * Con la clase abierta entraba CUALQUIER alumno del profe: el de otra sede se
 * metía a la clase que no era, quedaba con asistencia en ella y, en el
 * informe, todos tenían «faltas» en las clases de los otros grupos. Ahora cada
 * clase tiene su lista (`clase_asignados`) y la base deja entrar solo a los de
 * la lista (ver «A la clase entran solo los asignados» en
 * docs/decisiones/clase-en-vivo.md).
 *
 * Esta pieza es el selector, una sola copia: lo usa sesion.js al ABRIR la
 * clase (nadie entra hasta que el profe confirma la lista) y para CAMBIARLA
 * con la clase en curso (el que llegó y no estaba, el que se coló).
 *
 * Al abrir, la lista ya viene marcada, porque pasar lista de doce es
 * desmarcar a los dos que no son: con la clase de su horario que toca ahora
 * (grupo o subgrupo) y, si no hay, con los de su última clase. Lo dice escrito,
 * para que no se confirme sin mirar.
 */
(function () {
    const MARGEN_ANTES_MS = 30 * 60000;   // la clase de las 4:00 ya «toca» a las 3:30

    function nombreDe(a) { return (a.full_name && a.full_name.trim()) || a.email || "Alumno"; }
    const normal = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

    /* La clase del horario que toca ahora (o en la próxima media hora). Costa
       Rica no tiene horario de verano: siempre es UTC−6. */
    function claseDelHorarioAhora(filas, ahora) {
        const hoy = ahora.toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
        const dow = new Date(hoy + "T12:00:00Z").getUTCDay();
        let mejor = null;
        (filas || []).forEach((h) => {
            if (h.dia_semana !== dow || (h.desde && h.desde > hoy) || (h.hasta && h.hasta < hoy)) return;
            const inicio = new Date(hoy + "T" + String(h.hora).slice(0, 5) + ":00-06:00");
            const fin = new Date(inicio.getTime() + (h.duracion_min || 60) * 60000);
            if (ahora.getTime() < inicio.getTime() - MARGEN_ANTES_MS || ahora >= fin) return;
            if (!mejor || inicio < mejor.inicio) mejor = { h, inicio };
        });
        return mejor && mejor.h;
    }

    const BOTON = "text-xs font-semibold px-3 py-2 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    const PRINCIPAL = "font-semibold px-4 py-2 rounded-lg text-sm bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60 disabled:cursor-not-allowed";

    /**
     * @param {object} o
     * @param {object}  o.sb          cliente de Supabase
     * @param {Element} o.caja        donde se pinta el selector (arranca oculto)
     * @param {string}  o.profesorId  quien da la clase
     * @param {function} o.alConfirmar (ids, modo) → Promise<string|null>: el error, o null si pasó
     * @param {function} [o.alCerrar]  cuando se cierra sin confirmar
     */
    function montar(o) {
        let alumnos = null, subgrupos = [], horario = [];
        let modo = "abrir";

        async function cargar() {
            if (alumnos) return true;
            const [a, s, h] = await Promise.all([
                o.sb.rpc("alumnos_del_profesor", { p_profesor: o.profesorId }),
                o.sb.rpc("mis_subgrupos").then((r) => r, () => ({ data: [] })),
                o.sb.from("horario_clases").select("dia_semana, hora, duracion_min, grupo, subgrupo_id, titulo, modalidad, desde, hasta")
                    .eq("profesor_id", o.profesorId).then((r) => r, () => ({ data: [] })),
            ]);
            if (a.error) return false;
            alumnos = (a.data || []).slice().sort((x, y) => nombreDe(x).localeCompare(nombreDe(y), "es"));
            subgrupos = ((s && s.data) || []).filter((x) => x.cuantos > 0);
            horario = (h && h.data) || [];
            return true;
        }

        /* Los de su última clase con lista (la cerrada más reciente). */
        async function deLaUltimaClase() {
            const { data } = await o.sb.from("class_sessions").select("id")
                .eq("created_by", o.profesorId).eq("solo_asignados", true)
                .not("ended_at", "is", null).order("started_at", { ascending: false }).limit(1);
            const id = data && data[0] && data[0].id;
            if (!id) return null;
            const { data: filas } = await o.sb.from("clase_asignados").select("student_id").eq("class_session_id", id);
            return new Set((filas || []).map((f) => f.student_id));
        }

        /* Lo que viene marcado al abrir, y de dónde salió (se dice escrito). */
        async function propuesta() {
            const h = claseDelHorarioAhora(horario, new Date());
            if (h && h.subgrupo_id) {
                const sg = subgrupos.find((x) => x.id === h.subgrupo_id);
                if (sg) return { ids: new Set(sg.alumnos || []), de: "Vienen marcados los de tu horario de ahora: " + (h.titulo || sg.nombre) + "." };
            }
            if (h && h.grupo) {
                const ids = new Set(alumnos.filter((a) => normal(a.grupo) === normal(h.grupo)).map((a) => a.id));
                if (ids.size) return { ids, de: "Vienen marcados los de tu horario de ahora: " + (h.titulo || "grupo " + h.grupo) + "." };
            }
            const ultima = await deLaUltimaClase();
            if (ultima && ultima.size) return { ids: ultima, de: "Vienen marcados los mismos de tu última clase." };
            return { ids: new Set(), de: "" };
        }

        function casillas() { return Array.from(o.caja.querySelectorAll("input[data-alumno]")); }

        function contar() {
            const n = casillas().filter((c) => c.checked).length;
            const btn = o.caja.querySelector("[data-confirmar]");
            btn.disabled = n === 0;
            const quien = n === 1 ? "1 alumno" : n + " alumnos";
            btn.textContent = n === 0 ? "Marca al menos un alumno"
                : modo === "abrir" ? "Abrir la clase para " + quien
                : "Guardar: entran " + quien;
            o.caja.querySelector("[data-cuenta]").textContent = n + " de " + alumnos.length + " marcados";
        }

        function marcarSolo(ids) {
            casillas().forEach((c) => { c.checked = ids.has(c.value); });
            contar();
        }

        function pintar(marcados, de) {
            o.caja.replaceChildren();
            const fs = document.createElement("fieldset");
            fs.className = "rounded-lg border border-accent-400/60 bg-white dark:bg-brand-950 px-3 py-2";
            const lg = document.createElement("legend");
            lg.className = "px-1 text-sm font-semibold text-brand-800 dark:text-white";
            lg.textContent = modo === "abrir" ? "¿Quién entra a esta clase?" : "Quién entra a esta clase";
            fs.appendChild(lg);

            const ayuda = document.createElement("p");
            ayuda.className = "text-xs text-brand-600 dark:text-brand-300 mb-2";
            ayuda.textContent = (modo === "abrir"
                ? "Solo los que marques pueden entrar, quedan en la asistencia y les llega el aviso. A los demás esta clase no les cuenta como falta."
                : "Al que quites ya no le llega el tablero; al que agregues le llega el aviso y entra solo.")
                + (de ? " " + de : "");
            fs.appendChild(ayuda);

            const rapidos = document.createElement("div");
            rapidos.className = "flex flex-wrap items-center gap-2 mb-2";
            const boton = (texto, alTocar) => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = BOTON;
                b.textContent = texto;
                b.addEventListener("click", alTocar);
                rapidos.appendChild(b);
                return b;
            };
            boton("Todos (" + alumnos.length + ")", () => marcarSolo(new Set(alumnos.map((a) => a.id))));
            boton("Ninguno", () => marcarSolo(new Set()));
            // Un botón por grupo (profiles.grupo): «Grupo SJ (8)». Marca a esos y
            // desmarca al resto, como el selector de subgrupos.
            const grupos = new Map();
            alumnos.forEach((a) => {
                const g = (a.grupo || "").trim();
                if (!g) return;
                const k = normal(g);
                if (!grupos.has(k)) grupos.set(k, { nombre: g, ids: new Set() });
                grupos.get(k).ids.add(a.id);
            });
            if (grupos.size > 1) {
                [...grupos.values()].sort((x, y) => x.nombre.localeCompare(y.nombre, "es"))
                    .forEach((g) => boton("Grupo " + g.nombre + " (" + g.ids.size + ")", () => marcarSolo(g.ids)));
            }
            if (subgrupos.length) {
                const etiqueta = document.createElement("label");
                etiqueta.className = "text-xs font-semibold text-brand-500 dark:text-brand-300";
                etiqueta.textContent = "Solo los de";
                const sel = document.createElement("select");
                sel.id = "clase-asignar-subgrupo";
                etiqueta.htmlFor = sel.id;
                sel.className = "bg-white dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
                const vacia = document.createElement("option");
                vacia.value = "";
                vacia.textContent = "— un subgrupo —";
                sel.appendChild(vacia);
                subgrupos.forEach((s) => {
                    const op = document.createElement("option");
                    op.value = s.id;
                    op.textContent = s.nombre + " (" + s.cuantos + ")";   // nombre escrito por una persona: textContent
                    sel.appendChild(op);
                });
                sel.addEventListener("change", () => {
                    const s = subgrupos.find((x) => x.id === sel.value);
                    if (s) marcarSolo(new Set(s.alumnos || []));
                });
                rapidos.append(etiqueta, sel);
            }
            fs.appendChild(rapidos);

            const lista = document.createElement("div");
            lista.className = "grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 max-h-64 overflow-y-auto py-1";
            alumnos.forEach((a) => {
                const l = document.createElement("label");
                l.className = "flex items-center gap-2 text-sm text-brand-800 dark:text-brand-100";
                const c = document.createElement("input");
                c.type = "checkbox";
                c.value = a.id;
                c.dataset.alumno = "1";
                c.checked = marcados.has(a.id);
                c.addEventListener("change", contar);
                const n = document.createElement("span");
                n.textContent = nombreDe(a) + (a.grupo ? " · " + a.grupo : "");
                l.append(c, n);
                lista.appendChild(l);
            });
            fs.appendChild(lista);

            const pie = document.createElement("div");
            pie.className = "flex flex-wrap items-center gap-2 mt-2";
            const ok = document.createElement("button");
            ok.type = "button";
            ok.className = PRINCIPAL;
            ok.dataset.confirmar = "1";
            ok.addEventListener("click", confirmar);
            const cancelar = document.createElement("button");
            cancelar.type = "button";
            cancelar.className = BOTON;
            cancelar.textContent = "Cancelar";
            cancelar.addEventListener("click", () => { cerrar(); if (o.alCerrar) o.alCerrar(); });
            const cuenta = document.createElement("span");
            cuenta.dataset.cuenta = "1";
            cuenta.className = "text-xs text-brand-600 dark:text-brand-300";
            cuenta.setAttribute("aria-live", "polite");
            const error = document.createElement("p");
            error.dataset.error = "1";
            error.className = "w-full text-sm font-semibold text-red-700 dark:text-red-400";
            error.setAttribute("role", "alert");
            pie.append(ok, cancelar, cuenta, error);
            fs.appendChild(pie);
            o.caja.appendChild(fs);
            contar();
        }

        async function confirmar() {
            const ids = casillas().filter((c) => c.checked).map((c) => c.value);
            if (!ids.length) return;
            const btn = o.caja.querySelector("[data-confirmar]");
            btn.disabled = true;
            const error = await o.alConfirmar(ids, modo);
            if (error) {
                o.caja.querySelector("[data-error]").textContent = error;
                contar();
                return;
            }
            cerrar();
        }

        function cerrar() {
            o.caja.hidden = true;
            o.caja.replaceChildren();
        }

        return {
            abierto: () => !o.caja.hidden,
            cerrar,
            /** modo "abrir" (propone la lista) o "cambiar" (con `marcados`, la de la clase en curso). */
            async abrir(m, marcados) {
                modo = m;
                o.caja.hidden = false;
                o.caja.textContent = "Cargando tus alumnos…";
                if (!(await cargar())) { o.caja.textContent = "No se pudo cargar la lista de tus alumnos. Recarga la página."; return; }
                if (!alumnos.length) { o.caja.textContent = "Todavía no tienes alumnos asignados: no hay a quién dejar entrar."; return; }
                let ids = marcados, de = "";
                if (m === "abrir") ({ ids, de } = await propuesta());
                pintar(ids || new Set(), de);
                const primera = o.caja.querySelector("[data-confirmar]:not([disabled])") || o.caja.querySelector("input[data-alumno]");
                if (primera) primera.focus();
            },
        };
    }

    window.ClaseAsignados = { montar, claseDelHorarioAhora };
})();

/*! rev bfb5bbb0d2d82f9f */
