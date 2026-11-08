/* El código de arbitro.html: el panel de una cuenta de árbitro.

   Una cuenta de árbitro (la crea un organizador o administración en
   mis-arbitros.html) no es de la Academia: no tiene clases ni entrenamiento,
   y js/acceso-vigente.js la trae acá desde cualquier otra página. Acá ve solo
   las herramientas que le dieron, con su enlace, y lo que hace cada una.

   Qué herramientas tiene lo dice la base, en una sola pregunta:
   `mis_herramientas()` (las licencias de su cuenta que siguen valiendo, ver
   «Las cuentas de árbitro» en docs/decisiones/permisos-y-roles.md). La
   página de cada herramienta vuelve a preguntar por la suya: esto solo pinta. */
(function () {
    "use strict";
    const H = window.HerramientasArbitraje;
    const $ = (id) => document.getElementById(id);

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }

    function tarjeta(h) {
        const li = el("li");
        const a = el("a", "block h-full bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 border-2 border-transparent hover:border-accent-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
        a.href = h.href;
        const titulo = el("h3", "font-serif text-lg font-bold text-brand-800 dark:text-white");
        const emoji = el("span", null, (h.emoji || "♟️") + " ");
        emoji.setAttribute("aria-hidden", "true");
        titulo.append(emoji, document.createTextNode(h.corto || h.nombre));
        a.append(titulo, el("p", "text-sm text-brand-600 dark:text-brand-300 mt-2", h.resumen || ""));
        li.appendChild(a);
        if (h.manual) {
            const m = el("a", "inline-block mt-2 ml-1 text-sm font-semibold underline text-accent-700 dark:text-accent-400", "Ver su manual");
            m.href = h.manual;
            li.appendChild(m);
        }
        return li;
    }

    async function iniciar() {
        try {
            const { data: { session } } = await sb.auth.getSession();
            if (!session) { location.replace("login.html?next=arbitro.html"); return; }
            const [mias, perfil] = await Promise.all([
                sb.rpc("mis_herramientas"),
                sb.from("profiles").select("full_name, role").eq("id", session.user.id).maybeSingle(),
            ]);
            if (mias.error) throw mias.error;
            const nombre = perfil.data && perfil.data.full_name ? perfil.data.full_name.split(" ")[0] : "";
            $("saludo").textContent = nombre ? "Hola, " + nombre : "Tus herramientas";
            // Una cuenta que no es de árbitro tiene su panel en otro lado.
            $("no-arbitro").hidden = !(perfil.data && perfil.data.role !== "arbitro");

            const lista = H.conLicenciaPropia().filter((h) => H.abre(mias.data, h));
            const ul = $("lista");
            ul.textContent = "";
            lista.forEach((h) => ul.appendChild(tarjeta(h)));
            $("vacio").hidden = lista.length > 0;
            $("cuantas").textContent = lista.length === 1
                ? "Tienes 1 herramienta."
                : lista.length ? "Tienes " + lista.length + " herramientas." : "";
            $("loading").hidden = true;
            $("app").hidden = false;
        } catch (err) {
            $("loading").hidden = true;
            $("error").hidden = false;
            $("error-texto").textContent = "No se pudieron cargar tus herramientas: " + (err.message || err);
        }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();
})();

/*! rev bfb5bbb0d2d82f9f */
