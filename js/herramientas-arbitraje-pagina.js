/* El código de herramientas-arbitraje.html: la vitrina pública de las
   herramientas de arbitraje.

   Sin sesión, todas salen con el candado cerrado y su descripción, menos las
   gratis (`gratis: true`, Pareo Integral), que salen abiertas para todos. Con
   sesión, se pregunta a la base cuáles abre la cuenta (tengo_herramienta(),
   que a quien administra le dice que sí a todas) y se puede activar un código
   (canjear_licencia()). El candado de verdad está en la base y en la Edge
   Function seleccion-chess-results: esto solo decide qué se pinta.

   Las herramientas van en fichas por tema (H.TEMAS: arbitraje, JDE, JDN,
   universitarios): arriba, una tarjeta grande por tema, y debajo las
   herramientas de ese tema en tarjetas compactas. Todas se pintan en #lista y las de las otras fichas
   quedan con `hidden`; la ficha elegida va en la dirección (#jde) para
   mandar el enlace ya abierto en ella. Ver «Herramientas de arbitraje» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const H = window.HerramientasArbitraje;
    const $ = (id) => document.getElementById(id);
    const abiertas = new Set();
    let conSesion = false;
    let temaActivo = H.TEMAS[0].id;

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
            const abierta = abiertas.has(h.id) || !!h.gratis;
            const li = el("li", "rounded-2xl bg-white dark:bg-brand-900 shadow-md p-5 flex flex-col");
            li.dataset.herramienta = h.id;
            li.dataset.tema = h.tema;
            li.hidden = h.tema !== temaActivo;
            const fila = el("div", "flex flex-wrap items-start justify-between gap-3");
            const titulo = el("h3", "font-serif text-lg font-bold text-brand-800 dark:text-white");
            const emoji = el("span", "", h.emoji + " ");
            emoji.setAttribute("aria-hidden", "true");
            titulo.append(emoji, h.corto || h.nombre);
            if (h.corto) titulo.title = h.nombre;
            const estado = el("p", "text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap " + (abierta
                ? "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100"
                : h.disponible ? "bg-brand-100 text-brand-800 dark:bg-brand-800 dark:text-brand-100"
                    : "bg-accent-100 text-brand-900"));
            estado.textContent = h.gratis ? "🆓 Gratis" : abierta ? "🔓 Abierta para tu cuenta" : h.disponible ? "🔒 Con licencia" : "🔒 Próximamente";
            fila.append(titulo, estado);
            li.appendChild(fila);
            li.appendChild(el("p", "mt-2 text-sm text-brand-600 dark:text-brand-300 grow", h.resumen));
            // Lo que hace, detrás de un desplegable: la tarjeta queda corta y se compara de un vistazo.
            if (h.puntos.length) {
                const det = el("details", "mt-2 text-sm");
                det.appendChild(el("summary", "cursor-pointer font-semibold text-accent-700 dark:text-accent-400 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Qué hace (" + h.puntos.length + ")"));
                const ul2 = el("ul", "mt-2 space-y-1 text-brand-600 dark:text-brand-300 list-disc pl-5");
                h.puntos.forEach((p) => ul2.appendChild(el("li", "", p)));
                det.appendChild(ul2);
                li.appendChild(det);
            }
            const acciones = el("div", "mt-4 flex flex-wrap gap-2");
            if (h.disponible && abierta) {
                const a = el("a", "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors", "Abrir la herramienta");
                a.href = h.href;
                acciones.appendChild(a);
                if (h.manual) {
                    const m = el("a", "font-semibold px-4 py-2 rounded-lg text-sm bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700", "Manual de uso");
                    m.href = h.manual;
                    acciones.appendChild(m);
                }
            } else if (h.disponible) {
                const a = el("a", "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors", "Pedir una licencia");
                a.href = "https://wa.me/50683092291?text=" + encodeURIComponent("Hola, quiero una licencia de «" + h.nombre + "».");
                a.target = "_blank";
                a.rel = "noopener";
                const b = el("a", "font-semibold px-4 py-2 rounded-lg text-sm bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700", "Ya tengo un código");
                b.href = "#activar";
                acciones.append(a, b);
            } else {
                acciones.appendChild(el("p", "text-xs text-brand-500 dark:text-brand-300", "Todavía no se puede usar. La licencia de «Todas las herramientas» la incluye cuando salga."));
            }
            li.appendChild(acciones);
            ul.appendChild(li);
        });
    }

    /* La portada de temas: una tarjeta grande por tema (es la pestaña), con
       de qué se trata y cuántas herramientas trae. En el celular, de dos en
       dos y sin el resumen, que se lee arriba de la lista. */
    function pintarTemas() {
        const cont = $("temas");
        cont.textContent = "";
        H.TEMAS.forEach((t) => {
            const activa = t.id === temaActivo;
            const b = el("button", "flex flex-col justify-start text-left rounded-2xl p-4 sm:p-5 shadow-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 " + (activa
                ? "bg-accent-500 text-brand-900"
                : "bg-white dark:bg-brand-900 text-brand-800 dark:text-white hover:bg-brand-100 dark:hover:bg-brand-800"));
            b.type = "button";
            b.id = "tab-" + t.id;
            b.dataset.tema = t.id;
            b.setAttribute("role", "tab");
            b.setAttribute("aria-selected", activa ? "true" : "false");
            b.setAttribute("aria-controls", "panel-tema");
            b.tabIndex = activa ? 0 : -1;
            const emoji = el("span", "block text-3xl sm:text-4xl", t.emoji);
            emoji.setAttribute("aria-hidden", "true");
            const cuantas = H.LISTA.filter((h) => h.tema === t.id).length;
            b.append(emoji,
                el("span", "block font-serif text-lg sm:text-xl font-bold mt-1 leading-tight", t.largo || t.nombre),
                el("span", "hidden sm:block text-sm mt-2 " + (activa ? "" : "text-brand-600 dark:text-brand-300"), t.resumen),
                el("span", "block text-sm font-semibold mt-2", cuantas + (cuantas === 1 ? " herramienta" : " herramientas") + " →"));
            b.addEventListener("click", () => elegirTema(t.id, true, true));
            cont.appendChild(b);
        });
        const t = H.TEMAS.find((x) => x.id === temaActivo);
        $("panel-tema").setAttribute("aria-labelledby", "tab-" + t.id);
        const titulo = $("tema-titulo");
        titulo.textContent = "";
        const emoji = el("span", "", t.emoji + " ");
        emoji.setAttribute("aria-hidden", "true");
        titulo.append(emoji, t.largo || t.nombre);
        $("tema-resumen").textContent = t.resumen;
    }

    function elegirTema(id, guardar, llevar) {
        if (!H.TEMAS.some((t) => t.id === id)) return;
        temaActivo = id;
        pintarTemas();
        $("lista").querySelectorAll(":scope > li").forEach((li) => { li.hidden = li.dataset.tema !== id; });
        if (guardar) {
            try { history.replaceState(null, "", "#" + id); } catch (e) { /* sin historial: queda la ficha igual */ }
        }
        // En el celular las tarjetas de tema ocupan la pantalla: al tocar una, se baja a sus herramientas.
        if (llevar && $("panel-tema").getBoundingClientRect().top > window.innerHeight * 0.7) {
            $("panel-tema").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
        }
    }

    // Flechas, Inicio y Fin entre las fichas, como pide el patrón de pestañas.
    function teclasTemas(e) {
        const ids = H.TEMAS.map((t) => t.id);
        let i = ids.indexOf(temaActivo);
        if (e.key === "ArrowRight") i = (i + 1) % ids.length;
        else if (e.key === "ArrowLeft") i = (i - 1 + ids.length) % ids.length;
        else if (e.key === "Home") i = 0;
        else if (e.key === "End") i = ids.length - 1;
        else return;
        e.preventDefault();
        elegirTema(ids[i], true);
        $("tab-" + ids[i]).focus();
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
        // Las gratis no se le preguntan a la base: no tienen licencia.
        const conLicencia = H.LISTA.filter((h) => !h.gratis);
        const respuestas = await Promise.all(conLicencia.map((h) => sb.rpc("tengo_herramienta", { p_herramienta: h.id })));
        respuestas.forEach((r, i) => { if (r.data === true) abiertas.add(conLicencia[i].id); });
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
        const deLaDireccion = location.hash.slice(1);
        if (H.TEMAS.some((t) => t.id === deLaDireccion)) temaActivo = deLaDireccion;
        pintarTemas();
        $("temas").addEventListener("keydown", teclasTemas);
        window.addEventListener("hashchange", () => elegirTema(location.hash.slice(1), false));
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
