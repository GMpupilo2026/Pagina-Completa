/* «Lo que más le costó a tu clase», en el panel del profe (clases.html).

   Las preguntas de jugada de los últimos 30 días que más falló su clase: la
   cuenta la hace la base (preguntas_que_costaron, con la misma regla de fallo
   que el repaso personal de js/repaso-clase.js). Esto las pinta, con su
   posición, y arma con ellas un plan de repaso (js/plan-clase.js): así lo que
   no quedó se repite en la clase siguiente, sin buscarlo a mano. Ver «Lo que
   más le costó a tu clase» en docs/decisiones/clase-en-vivo.md.
*/
window.LoQueCosto = (function () {
    const DIAS = 30;

    function el(tag, cls, texto) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (texto != null) e.textContent = texto;   // el enunciado y el título los escribió una persona
        return e;
    }
    const fecha = (iso) => {
        try { return new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", day: "numeric", month: "long" }).format(new Date(iso)); }
        catch (e) { return ""; }
    };
    const cuantasFallaron = (f) => f.fallaron + " de " + f.respondieron + (f.fallaron === 1 ? " la falló" : " la fallaron")
        + " (" + Math.round((100 * f.fallaron) / f.respondieron) + " %)";

    async function cargar(sb) {
        const { data, error } = await sb.rpc("preguntas_que_costaron", { p_dias: DIAS });
        return { filas: data || [], error };
    }

    /* Un plan de repaso con esas posiciones, en el mismo orden (js/plan-clase.js).
       `opciones` cambia el título y cómo se nombra cada renglón: el de la
       clase entera dice cuántos la fallaron; el de un alumno, qué jugó. */
    async function armarPlan(sb, profesorId, filas, opciones) {
        const o = opciones || {};
        const hoy = fecha(new Date().toISOString());
        const plan = await PlanClase.crearPlan(sb, profesorId, (o.titulo || "Repaso: lo que más costó") + " (al " + hoy + ")",
            o.notas || "Las preguntas de los últimos " + DIAS + " días que más falló la clase.");
        for (let i = 0; i < filas.length; i += 1) {
            const f = filas[i];
            await PlanClase.agregarItem(sb, plan.id, {
                orden: i, tipo: "posicion", fen: f.fen,
                titulo: ("Clase del " + fecha(f.created_at) + ": " + (o.renglon ? o.renglon(f) : cuantasFallaron(f))).slice(0, 200),
                pregunta: f.prompt || null,
            });
        }
        return plan;
    }

    const enEspanol = (san) => (window.EjercicioTablero && EjercicioTablero.jugadaEs ? EjercicioTablero.jugadaEs(san)
        : String(san || "").replace(/[NBRQK]/g, (l) => ({ N: "C", B: "A", R: "T", Q: "D", K: "R" })[l]));
    const queJugo = (f) => "jugó " + (f.su_jugada ? enEspanol(f.su_jugada) : "—") + (f.jugada_buena ? "; la buena era " + enEspanol(f.jugada_buena) : "");

    // El botón que arma el plan y deja el enlace. Lo usan las dos tarjetas.
    function botonDePlan(texto, armar) {
        const btn = el("button", "mt-4 text-sm font-semibold px-4 py-2 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
        btn.type = "button";
        const icb = el("span", "", "📋 ");
        icb.setAttribute("aria-hidden", "true");
        btn.append(icb, document.createTextNode(texto));
        const res = el("p", "mt-2 text-sm text-brand-700 dark:text-brand-200");
        res.setAttribute("role", "status");
        btn.addEventListener("click", async () => {
            btn.disabled = true;
            res.textContent = "Armando el plan…";
            try {
                const plan = await armar();
                res.textContent = "";
                const a = el("a", "font-semibold underline", "Listo: abre el plan «" + plan.titulo + "» →");
                a.href = "planes.html?plan=" + encodeURIComponent(plan.id);
                res.appendChild(a);
            } catch (e) {
                console.error(e);
                btn.disabled = false;
                res.textContent = "No se pudo armar el plan: " + e.message;
            }
        });
        return [btn, res];
    }

    function renglon(f, lineas) {
        const li = el("li", "flex gap-3 items-start");
        const d = window.NotasAlumno && NotasAlumno.diagrama ? NotasAlumno.diagrama(f.fen) : null;
        if (d) {
            d.setAttribute("aria-label", "La posición de la pregunta (le toca a las " + (String(f.fen).split(" ")[1] === "b" ? "negras" : "blancas") + ")");
            d.classList.remove("w-40", "mt-1.5");
            d.classList.add("w-28", "shrink-0");
            li.appendChild(d);
        }
        const t = el("div", "text-sm");
        lineas.forEach(([cls, texto]) => t.appendChild(el("p", cls, texto)));
        li.appendChild(t);
        return li;
    }

    /* Lo que le costó a UN alumno, en su informe (informes.html?alumno=): las
       preguntas de clase que contestó mal (preguntas_que_le_costaron, con la
       misma regla), qué jugó y cuál era la buena. `puedeArmar` es false
       mirando a otra persona («Ver como»): el plan sería de quien mira. */
    async function pintarDelAlumno(sb, caja, alumnoId, nombre, profesorId, puedeArmar) {
        if (!caja) return;
        const { data, error } = await sb.rpc("preguntas_que_le_costaron", { p_alumno: alumnoId, p_dias: DIAS });
        const filas = data || [];
        if (error) console.error(error);
        if (error || !filas.length) { caja.hidden = true; return; }
        caja.innerHTML = "";
        const h2 = el("h2", "font-serif text-lg font-bold text-brand-800 dark:text-white");
        h2.id = "le-costo-titulo";
        const ic = el("span", "", "🧩 ");
        ic.setAttribute("aria-hidden", "true");
        h2.append(ic, document.createTextNode("Lo que le costó a " + nombre));
        const total = filas[0].contestadas || filas.length;
        caja.append(h2, el("p", "text-sm text-brand-500 dark:text-brand-300 mt-1",
            "Falló " + filas.length + " de " + total + (total === 1 ? " pregunta" : " preguntas") + " de clase que contestó en los últimos " + DIAS + " días"
            + (filas.length >= 12 ? " (se muestran las 12 más recientes)." : ".")));
        const ol = el("ol", "mt-3 grid sm:grid-cols-2 gap-4");
        filas.forEach((f) => ol.appendChild(renglon(f, [
            ["font-semibold text-brand-800 dark:text-brand-100", "J" + queJugo(f).slice(1)],
            ["text-brand-700 dark:text-brand-200", f.prompt || "¿Qué jugarías?"],
            ["text-xs text-brand-500 dark:text-brand-300", (f.clase_titulo ? "«" + f.clase_titulo + "», " : "Clase del ") + fecha(f.created_at)],
        ])));
        caja.appendChild(ol);
        if (puedeArmar) {
            caja.append(...botonDePlan("Armar un plan de repaso para " + nombre, () => armarPlan(sb, profesorId, filas, {
                titulo: "Repaso de " + nombre, notas: "Las preguntas de clase de los últimos " + DIAS + " días que falló " + nombre + ".", renglon: queJugo,
            })));
        }
        caja.hidden = false;
    }

    async function pintar(sb, caja, profesorId) {
        if (!caja) return;
        const { filas, error } = await cargar(sb);
        if (error) { console.error(error); caja.hidden = true; return; }
        if (!filas.length) { caja.hidden = true; return; }
        caja.innerHTML = "";
        const h2 = el("h2", "font-serif text-lg font-bold text-brand-800 dark:text-white");
        h2.id = "lo-que-costo-titulo";
        const ic = el("span", "", "🧩 ");
        ic.setAttribute("aria-hidden", "true");
        h2.append(ic, document.createTextNode("Lo que más le costó a tu clase"));
        caja.append(h2, el("p", "text-sm text-brand-500 dark:text-brand-300 mt-1",
            "Las preguntas de los últimos " + DIAS + " días que más fallaron tus alumnos. Conviene volver a ellas."));
        const ol = el("ol", "mt-3 grid sm:grid-cols-2 gap-4");
        filas.forEach((f) => ol.appendChild(renglon(f, [
            ["font-semibold text-brand-800 dark:text-brand-100", cuantasFallaron(f)],
            ["text-brand-700 dark:text-brand-200", f.prompt || "¿Qué jugarías?"],
            ["text-xs text-brand-500 dark:text-brand-300", (f.clase_titulo ? "«" + f.clase_titulo + "», " : "Clase del ") + fecha(f.created_at)],
        ])));
        caja.append(ol, ...botonDePlan(filas.length === 1 ? "Armar un plan de repaso con esta" : "Armar un plan de repaso con estas " + filas.length,
            () => armarPlan(sb, profesorId, filas)));
        caja.hidden = false;
    }

    return { DIAS, cargar, armarPlan, pintar, pintarDelAlumno };
})();
