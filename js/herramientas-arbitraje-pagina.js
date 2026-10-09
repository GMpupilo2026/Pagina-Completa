/* El código de herramientas-arbitraje.html: la vitrina pública de las
   herramientas de arbitraje.

   Sin sesión, todas salen con el candado cerrado y su descripción. Con
   sesión, se pregunta a la base cuáles abre la cuenta (tengo_herramienta(),
   que a quien administra le dice que sí a todas) y se puede activar un código
   (canjear_licencia()). El candado de verdad está en la base y en la Edge
   Function seleccion-chess-results: esto solo decide qué se pinta. Ver
   «Herramientas de arbitraje» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const H = window.HerramientasArbitraje;
    const $ = (id) => document.getElementById(id);
    const abiertas = new Set();
    let conSesion = false;

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }

    function pintarLista() {
        const ul = $("lista");
        ul.textContent = "";
        H.LISTA.forEach((h) => {
            const abierta = abiertas.has(h.id);
            const li = el("li", "rounded-2xl bg-white dark:bg-brand-900 shadow-md p-6");
            li.dataset.herramienta = h.id;
            const fila = el("div", "flex flex-wrap items-start justify-between gap-3");
            const titulo = el("h3", "font-serif text-xl font-bold text-brand-800 dark:text-white");
            const emoji = el("span", "", h.emoji + " ");
            emoji.setAttribute("aria-hidden", "true");
            titulo.append(emoji, h.nombre);
            const estado = el("p", "text-sm font-semibold px-3 py-1 rounded-full " + (abierta
                ? "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100"
                : h.disponible ? "bg-brand-100 text-brand-800 dark:bg-brand-800 dark:text-brand-100"
                    : "bg-accent-100 text-brand-900"));
            estado.textContent = abierta ? "🔓 Abierta para tu cuenta" : h.disponible ? "🔒 Con licencia" : "🔒 Próximamente";
            fila.append(titulo, estado);
            li.appendChild(fila);
            li.appendChild(el("p", "mt-2 text-brand-600 dark:text-brand-300", h.resumen));
            if (h.puntos.length) {
                const ul2 = el("ul", "mt-3 space-y-1 text-sm text-brand-600 dark:text-brand-300 list-disc pl-5");
                h.puntos.forEach((p) => ul2.appendChild(el("li", "", p)));
                li.appendChild(ul2);
            }
            const acciones = el("div", "mt-4 flex flex-wrap gap-3");
            if (h.disponible && abierta) {
                const a = el("a", "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors", "Abrir la herramienta");
                a.href = h.href;
                acciones.appendChild(a);
            } else if (h.disponible) {
                const a = el("a", "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors", "Pedir una licencia");
                a.href = "https://wa.me/50683092291?text=" + encodeURIComponent("Hola, quiero una licencia de «" + h.nombre + "».");
                a.target = "_blank";
                a.rel = "noopener";
                const b = el("a", "font-semibold px-5 py-2.5 rounded-lg text-sm bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700", "Ya tengo un código");
                b.href = "#activar";
                acciones.append(a, b);
            } else {
                acciones.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", "Todavía no se puede usar. Si te interesa, pregúntanos: las licencias de «Todas las herramientas» la incluyen cuando salga."));
            }
            li.appendChild(acciones);
            ul.appendChild(li);
        });
    }

    async function pintarMisLicencias() {
        const ul = $("mis-licencias");
        const { data, error } = await sb.from("licencias_herramientas").select("codigo, herramienta, vence, revocada, activada_en").order("activada_en", { ascending: false });
        ul.textContent = "";
        if (error) { ul.appendChild(el("li", "text-red-700 dark:text-red-300", "No se pudieron leer tus licencias: " + error.message)); return; }
        if (!data || !data.length) { ul.appendChild(el("li", "text-brand-500 dark:text-brand-300", "Todavía no tienes ninguna licencia activada.")); return; }
        const ahora = Date.now();
        data.forEach((l) => {
            const vencida = l.vence && Date.parse(l.vence) <= ahora;
            const estado = l.revocada ? "anulada" : vencida ? "venció el " + HoraCR.fecha(l.vence)
                : l.vence ? "vigente hasta el " + HoraCR.fecha(l.vence) : "vigente, sin vencimiento";
            const li = el("li", "flex flex-wrap gap-x-3");
            li.append(el("span", "font-mono", l.codigo), el("span", "font-semibold", H.nombre(l.herramienta)), el("span", "text-brand-500 dark:text-brand-300", estado));
            ul.appendChild(li);
        });
    }

    async function revisarAbiertas() {
        abiertas.clear();
        const respuestas = await Promise.all(H.LISTA.map((h) => sb.rpc("tengo_herramienta", { p_herramienta: h.id })));
        respuestas.forEach((r, i) => { if (r.data === true) abiertas.add(H.LISTA[i].id); });
    }

    async function activar(e) {
        e.preventDefault();
        const msg = $("msg-activar");
        const codigo = $("codigo").value.trim();
        msg.className = "text-sm mt-3";
        if (!codigo) { msg.textContent = "Escribe el código que te dieron."; return; }
        $("btn-activar").disabled = true;
        msg.textContent = "Activando…";
        const { data, error } = await sb.rpc("canjear_licencia", { p_codigo: codigo });
        $("btn-activar").disabled = false;
        if (error) {
            msg.className = "text-sm mt-3 text-red-700 dark:text-red-300";
            msg.textContent = error.message;
            return;
        }
        msg.className = "text-sm mt-3 text-green-800 dark:text-green-300";
        msg.textContent = "Listo: «" + H.nombre(data.herramienta) + "» quedó abierta para tu cuenta" +
            (data.vence ? " hasta el " + HoraCR.fecha(data.vence) + "." : ", sin vencimiento.");
        $("codigo").value = "";
        Avisos.avisar("Licencia activada.");
        await revisarAbiertas();
        pintarLista();
        await pintarMisLicencias();
    }

    async function init() {
        pintarLista();
        $("form-activar").addEventListener("submit", activar);
        let sesion = null;
        try { sesion = (await sb.auth.getSession()).data.session; } catch (e) { sesion = null; }
        conSesion = !!sesion;
        if (!conSesion) return;
        $("activar-sin-sesion").classList.add("hidden");
        $("activar-con-sesion").classList.remove("hidden");
        await revisarAbiertas();
        pintarLista();
        await pintarMisLicencias();
    }
    init();
})();
