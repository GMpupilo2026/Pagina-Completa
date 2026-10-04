/* El código de reto-ejercicios.html: mandar un reto a un compañero y ver los
 * tuyos. Los ejercicios se juegan en Ejercicios por tema
 * (entreno/temas.html?reto=<id>). Ver js/reto-ejercicios.js y «Retos de
 * ejercicios entre compañeros» en docs/decisiones/juegos-y-torneos.md.
 *
 * Quiénes son compañeros lo decide la base: la RLS de profiles ya le deja ver
 * al alumno solo a los alumnos de sus profesores en sus academias, y el insert
 * del reto exige es_companero(). Acá solo se pinta.
 */
(function () {
    "use strict";

    const $ = (id) => document.getElementById(id);
    let yo = null;

    function el(tag, clases, texto) {
        const n = document.createElement(tag);
        if (clases) n.className = clases;
        if (texto != null) n.textContent = texto;
        return n;
    }
    const fecha = (iso) => (window.HoraCR ? HoraCR.fecha(iso, { day: "numeric", month: "short" }) : "");

    async function cargarCompaneros() {
        const { data, error } = await sb.from("profiles").select("id, full_name, role").eq("role", "alumno").neq("id", yo).order("full_name");
        const sel = $("retar-rival");
        sel.replaceChildren();
        const lista = error ? [] : (data || []).filter((p) => p.id !== yo);
        lista.forEach((p) => {
            const o = el("option", null, p.full_name || "Sin nombre");
            o.value = p.id;
            sel.appendChild(o);
        });
        $("retar-sin-companeros").hidden = !!lista.length;
        $("retar-form").hidden = !lista.length;
    }

    let banco = null;
    async function bancoDeEjercicios() {
        if (banco) return banco;
        const r = await fetch("entreno/data/temas.json");
        if (!r.ok) throw new Error("temas.json: " + r.status);
        banco = (await r.json()).puzzles;
        return banco;
    }

    async function mandar(ev) {
        ev.preventDefault();
        const rival = $("retar-rival").value, nivel = $("retar-nivel").value;
        const estado = $("retar-estado"), boton = $("retar-boton");
        if (!rival) return;
        boton.disabled = true;
        estado.textContent = "Eligiendo los ejercicios…";
        try {
            const ids = RetoEjercicios.elegir(await bancoDeEjercicios(), nivel);
            if (ids.length !== RetoEjercicios.CUANTOS) throw new Error("sin ejercicios");
            const { data, error } = await sb.from("retos_ejercicios").insert({ rival_id: rival, nivel, ejercicios: ids }).select("id").maybeSingle();
            if (error) throw error;
            const nombre = $("retar-rival").selectedOptions[0].textContent;
            estado.replaceChildren(document.createTextNode("Listo: le mandaste el reto a " + nombre + ". "));
            const a = el("a", "font-semibold text-accent-700 dark:text-accent-400 underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Juega tus 5 ahora →");
            a.href = "entreno/temas.html?reto=" + encodeURIComponent(data.id);
            estado.appendChild(a);
            cargarRetos();
        } catch (e) {
            estado.textContent = "";
            Avisos.avisar(/10 retos/.test(String(e && e.message)) ? e.message : "No se pudo mandar el reto. Vuelve a intentarlo.", { tipo: "error" });
        } finally {
            boton.disabled = false;
        }
    }

    const TONO = {
        jugar: "border-accent-500",
        esperando: "border-brand-300 dark:border-brand-600",
        ganaste: "border-green-600",
        perdiste: "border-brand-300 dark:border-brand-600",
        empate: "border-brand-300 dark:border-brand-600",
    };
    const ICONO = { jugar: "♟️", esperando: "⏳", ganaste: "🏆", perdiste: "🤝", empate: "🤝" };

    async function cargarRetos() {
        const { data, error } = await sb.rpc("mis_retos_de_ejercicios");
        const lista = $("mis-retos");
        lista.replaceChildren();
        if (error) { $("mis-retos-estado").textContent = "No se pudieron leer tus retos. Revisa tu conexión."; return; }
        const filas = data || [];
        $("mis-retos-estado").textContent = filas.length ? "" : "Todavía no tienes retos. Manda el primero arriba.";
        $("mis-retos-estado").hidden = !!filas.length;
        const ahora = new Date();
        filas.forEach((f) => {
            const soyRetador = f.retador_id === yo;
            f.otro_nombre = (soyRetador ? f.rival : f.retador) || "tu compañero";
            const est = RetoEjercicios.estado(f, ahora);
            const li = el("li", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4 border-l-4 " + (TONO[est.tipo] || ""));
            li.dataset.reto = f.id;
            li.dataset.estado = est.tipo;
            const arriba = el("p", "font-semibold text-brand-800 dark:text-white");
            const ic = el("span", null, (ICONO[est.tipo] || "♟️") + " ");
            ic.setAttribute("aria-hidden", "true");
            arriba.append(ic, document.createTextNode((soyRetador ? "Retaste a " : "Te retó ") + f.otro_nombre));
            const nivel = (RetoEjercicios.NIVELES[f.nivel] || {}).nombre || "";
            const vencido = new Date(f.vence_at) <= ahora;
            const datos = el("p", "text-xs text-brand-500 dark:text-brand-300", "Dificultad " + nivel.toLowerCase() + " · " + (vencido ? "venció el " : "vence el ") + fecha(f.vence_at));
            const texto = el("p", "text-sm text-brand-700 dark:text-brand-200 mt-1", est.texto);
            li.append(arriba, datos, texto);
            if (est.tipo === "jugar") {
                const a = el("a", "inline-block mt-2 rounded-xl px-4 py-2 text-sm font-semibold bg-accent-500 text-brand-900 hover:bg-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2", f.mias ? "Seguir el reto" : "Jugar el reto");
                a.href = "entreno/temas.html?reto=" + encodeURIComponent(f.id);
                a.setAttribute("aria-label", (f.mias ? "Seguir el reto con " : "Jugar el reto con ") + f.otro_nombre);
                li.appendChild(a);
            }
            lista.appendChild(li);
        });
    }

    async function unlock() {
        $("gate").classList.add("hidden");
        $("app").classList.remove("hidden");
        $("retar-form").addEventListener("submit", mandar);
        await Promise.all([cargarCompaneros(), cargarRetos()]);
    }

    async function requireLoginThenGate() {
        let sesion = null;
        try { const { data } = await sb.auth.getSession(); sesion = data && data.session; } catch (e) { sesion = null; }
        if (!sesion) {
            $("gate-checking").textContent = "Necesitas iniciar sesión para ver tus retos. Redirigiendo a iniciar sesión…";
            location.href = "login.html?next=" + encodeURIComponent("reto-ejercicios.html");
            return;
        }
        yo = sesion.user.id;
        $("gate-checking").classList.add("hidden");
        unlock();
    }

    requireLoginThenGate();
})();
