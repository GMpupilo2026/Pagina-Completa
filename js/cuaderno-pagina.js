/* El código de cuaderno.html: «Mi cuaderno».
 *
 * Las posiciones que el alumno guardó (public.cuaderno), con su nota. Lo que
 * se ve lo decide la RLS: el alumno, todo lo suyo; su profe (con
 * ?alumno=<id>), solo lo que el alumno marcó para él. La vista del profe es
 * de solo lectura. Ver «Mi cuaderno» en
 * docs/decisiones/seguimiento-del-alumno.md.
 *
 * La lista se pide de a 30 (`range`), y la búsqueda la hace la base (`ilike`):
 * con 500 posiciones, bajarlas todas para filtrar acá sería la piedra de
 * siempre de las mil filas.
 */
(function () {
    "use strict";

    const POR_PAGINA = 30;
    const $ = (id) => document.getElementById(id);
    const params = new URLSearchParams(location.search);
    let yo = null, alumno = null, propio = true, cargadas = 0, total = 0, busqueda = "";

    function el(tag, clases, texto) {
        const n = document.createElement(tag);
        if (clases) n.className = clases;
        if (texto != null) n.textContent = texto;
        return n;
    }
    const fecha = (iso) => (window.HoraCR ? HoraCR.fecha(iso, { day: "numeric", month: "short", year: "numeric" }) : "");

    // Lo que se escribe en el buscador va dentro de un filtro de PostgREST:
    // la coma, los paréntesis y los comodines lo romperían o lo ensancharían.
    const limpiar = (q) => String(q || "").replace(/[,()%*\\]/g, " ").trim().slice(0, 60);

    function consulta() {
        let q = sb.from("cuaderno")
            .select("id, fen, titulo, nota, origen, enlace, jugadas, compartida, created_at, updated_at", { count: "exact" })
            .eq("alumno_id", alumno);
        if (busqueda) q = q.or(`titulo.ilike.%${busqueda}%,nota.ilike.%${busqueda}%,origen.ilike.%${busqueda}%`);
        return q.order("updated_at", { ascending: false });
    }

    async function cargar(desdeCero) {
        const lista = $("cuaderno-lista");
        if (desdeCero) { lista.replaceChildren(); cargadas = 0; }
        $("cuaderno-estado").textContent = "Cargando tu cuaderno…";
        const { data, error, count } = await consulta().range(cargadas, cargadas + POR_PAGINA - 1);
        if (error) {
            $("cuaderno-estado").textContent = "No se pudo leer el cuaderno. Revisa tu conexión y vuelve a intentarlo.";
            return;
        }
        total = count || 0;
        (data || []).forEach((f) => lista.appendChild(tarjeta(f)));
        cargadas += (data || []).length;
        $("cuaderno-mas").hidden = cargadas >= total;
        $("cuaderno-cuenta").textContent = total ? (total === 1 ? "1 posición" : total + " posiciones") : "";
        $("cuaderno-estado").textContent = total ? ""
            : busqueda ? "No hay nada con «" + busqueda + "» en " + (propio ? "tu cuaderno." : "lo que te compartió.")
            : propio ? "Todavía no guardaste ninguna posición. Al terminar un ejercicio de Mates o de Ejercicios por tema, toca «📓 Guardar en mi cuaderno»."
            : "Todavía no te compartió ninguna posición de su cuaderno.";
        $("cuaderno-estado").hidden = !!total;
    }

    function tarjeta(f) {
        const li = el("li", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4 flex flex-col gap-2");
        li.dataset.id = f.id;
        const tablero = el("div", "example-board w-full max-w-[16rem] self-center");
        let juego = null;
        try { juego = new Chess(f.fen); } catch (e) { juego = null; }
        if (juego && window.ExampleBoard) {
            ExampleBoard.render(tablero, juego);
            ExampleBoard.sizePieces(tablero);
        }
        const juega = String(f.fen).split(" ")[1] === "b" ? "negras" : "blancas";
        tablero.setAttribute("aria-label", "Posición guardada (juegan las " + juega + ")");
        tablero.setAttribute("role", "group");
        const titulo = el("h2", "font-serif font-bold text-brand-800 dark:text-white", f.titulo || f.origen || "Sin título");
        const datos = el("p", "text-xs text-brand-500 dark:text-brand-300",
            "Juegan las " + juega + " · " + (f.updated_at && f.updated_at !== f.created_at ? "cambiada el " + fecha(f.updated_at) : "guardada el " + fecha(f.created_at))
            + (f.origen && f.titulo && f.titulo !== f.origen ? " · " + f.origen : "")
            + (propio ? (f.compartida ? " · la ve tu profe" : " · solo tú") : ""));
        li.append(tablero, titulo, datos);
        if (f.nota) li.appendChild(el("p", "text-sm text-brand-700 dark:text-brand-200 whitespace-pre-line break-words", f.nota));
        if (Array.isArray(f.jugadas) && f.jugadas.length) {
            li.appendChild(el("p", "text-xs text-brand-500 dark:text-brand-300 break-words", "La línea: " + f.jugadas.join(" ")));
        }
        const acciones = el("div", "pt-2 flex flex-wrap gap-2");
        if (f.enlace && /^[a-z0-9][a-z0-9/_.-]*\.html([?#][^\s<>"']*)?$/.test(f.enlace)) {
            const a = el("a", "text-sm font-semibold text-accent-700 dark:text-accent-400 underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Volver a donde la guardaste →");
            a.href = "/" + f.enlace;
            const p = el("p", "mt-auto pt-1");
            p.appendChild(a);
            li.appendChild(p);
        }
        if (propio) {
            const BTN = "rounded-lg px-3 py-1.5 text-sm font-semibold border border-brand-200 dark:border-brand-700 hover:bg-brand-50 dark:hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            const editar = el("button", BTN, "Editar");
            editar.type = "button";
            editar.setAttribute("aria-label", "Editar «" + (f.titulo || "Sin título") + "»");
            editar.addEventListener("click", async () => {
                const r = await Cuaderno.guardar({ fen: f.fen, enlace: null });
                if (r) cargar(true);
            });
            const borrar = el("button", BTN + " text-red-700 dark:text-red-300", "Borrar");
            borrar.type = "button";
            borrar.setAttribute("aria-label", "Borrar «" + (f.titulo || "Sin título") + "»");
            borrar.addEventListener("click", async () => {
                const ok = await Avisos.confirmar("La posición y tu nota se van de tu cuaderno.", { titulo: "¿Borrar esta posición?", aceptar: "Borrar", peligro: true });
                if (!ok) return;
                const { error } = await sb.from("cuaderno").delete().eq("id", f.id);
                if (error) { Avisos.avisar("No se pudo borrar. Vuelve a intentarlo.", { tipo: "error" }); return; }
                Avisos.avisar("Listo: la posición se fue de tu cuaderno.");
                cargar(true);
            });
            acciones.append(editar, borrar);
        }
        if (acciones.childElementCount) li.appendChild(acciones);
        return li;
    }

    async function agregar(ev) {
        ev.preventDefault();
        const fen = $("cuaderno-fen").value.trim().replace(/\s+/g, " ");
        const error = $("cuaderno-fen-error");
        error.textContent = "";
        let motivo = null;
        try {
            const v = new Chess().validate_fen(fen);
            if (!v.valid) motivo = "Esa posición no se pudo leer. Revisa que esté completa (las seis partes del FEN).";
        } catch (e) { motivo = "Esa posición no se pudo leer."; }
        if (!motivo && window.PosicionValida) motivo = PosicionValida.motivo(fen);
        if (motivo) { error.textContent = motivo; $("cuaderno-fen").focus(); return; }
        const r = await Cuaderno.guardar({ fen, origen: "Agregada a mano", enlace: null });
        if (r) { $("cuaderno-fen").value = ""; cargar(true); }
    }

    async function nombreDe(id) {
        try {
            const { data } = await sb.from("profiles").select("full_name").eq("id", id).maybeSingle();
            return (data && data.full_name) || "tu alumno";
        } catch (e) { return "tu alumno"; }
    }

    async function unlock() {
        $("gate").classList.add("hidden");
        $("app").classList.remove("hidden");
        const pedido = params.get("alumno");
        alumno = pedido && /^[0-9a-f-]{36}$/i.test(pedido) ? pedido : yo;
        propio = alumno === yo;
        if (!propio) {
            const nombre = await nombreDe(alumno);
            $("cuaderno-titulo").replaceChildren(document.createTextNode("El cuaderno de " + nombre + " "));
            const ic = el("span", null, "📓");
            ic.setAttribute("aria-hidden", "true");
            $("cuaderno-titulo").appendChild(ic);
            document.title = "El cuaderno de " + nombre + " — Ajedrez Integral";
            $("cuaderno-intro").textContent = "Las posiciones que " + nombre + " guardó y decidió compartir contigo, con sus notas. Las que no compartió no se ven acá.";
            $("cuaderno-agregar").hidden = true;
        } else {
            $("cuaderno-form").addEventListener("submit", agregar);
        }
        let espera = null;
        $("cuaderno-buscar").addEventListener("input", () => {
            clearTimeout(espera);
            espera = setTimeout(() => { busqueda = limpiar($("cuaderno-buscar").value); cargar(true); }, 300);
        });
        $("cuaderno-mas").addEventListener("click", () => cargar(false));
        await cargar(true);
    }

    async function requireLoginThenGate() {
        let sesion = null;
        try { const { data } = await sb.auth.getSession(); sesion = data && data.session; } catch (e) { sesion = null; }
        if (!sesion) {
            $("gate-checking").textContent = "Necesitas iniciar sesión para ver tu cuaderno. Redirigiendo a iniciar sesión…";
            location.href = "login.html?next=" + encodeURIComponent("cuaderno.html" + location.search);
            return;
        }
        yo = sesion.user.id;
        $("gate-checking").classList.add("hidden");
        unlock();
    }

    requireLoginThenGate();
})();
