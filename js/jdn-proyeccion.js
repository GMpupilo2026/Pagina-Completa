/* El código de jdn-proyeccion.html: la proyección JDN por comité.

   - Los datos están en jdn_inscripciones: cada persona inscrita en la próxima
     eliminatoria de los JDN(P), tal como la exporta el sistema del ICODER (no
     chess-results), con su cédula y su fecha de nacimiento. Es una
     herramienta de arbitraje con licencia (RLS: tengo_herramienta
     ('jdn-proyeccion')), igual que jdn-comites; la tabla se llena a mano con
     cada export nuevo.
   - «Activos 2026» cruza el nombre de cada atleta con los mismos datos de
     «Ajedrez estudiantil» que usa historial-jugador.html (js/jde-datos.js):
     si alguien con ese nombre jugó un torneo estudiantil en 2026, se marca
     como activo. Es el mismo criterio de esa herramienta (una persona es su
     nombre), con la misma limitación: dos personas con el mismo nombre
     quedan juntas.

   Ver «Proyección JDN por comité» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const $ = (id) => document.getElementById(id);

    // Los comités del dueño del sitio: van primero, marcados con ⭐.
    const MIS_COMITES = ["San José", "Pérez Zeledón"];

    const ESTADOS = {
        "REGISTRADO": { texto: "Registrado", emoji: "✅", grupo: "registrado" },
        "APROBADO ICODER": { texto: "Aprobado por ICODER", emoji: "🟦", grupo: "tramite" },
        "PASE CANTONAL": { texto: "Pase cantonal", emoji: "🟨", grupo: "tramite" },
        "DEBEN CORREGIR LO SOLICITADO": { texto: "Debe corregir", emoji: "🟧", grupo: "tramite" },
        "NO CONVOCATORIA": { texto: "No convocado", emoji: "⬛", grupo: "fuera" },
    };
    function estadoInfo(estado) { return ESTADOS[estado] || { texto: estado, emoji: "", grupo: "tramite" }; }
    function grupoEdad(categoria) {
        if (categoria.startsWith("U-12")) return "u12";
        if (categoria.startsWith("U-16")) return "u16";
        if (categoria.startsWith("U-20")) return "u20";
        return null; // CUERPO TÉCNICO
    }

    const slug = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    // «AAAA-MM-DD» a «DD/MM/AAAA» sin pasar por Date (nunca se lee un día de
    // calendario con new Date("AAAA-MM-DD"): corre el riesgo de leerlo en UTC).
    function fechaCorta(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
        return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
    }

    async function leerInscripciones() {
        const filas = [];
        for (let desde = 0; ; desde += 1000) {
            const { data, error } = await sb.from("jdn_inscripciones")
                .select("comite,tipo,nombre,categoria,estado,identificacion,nacimiento")
                .order("comite").order("nombre")
                .range(desde, desde + 999);
            if (error) throw error;
            filas.push(...data);
            if (data.length < 1000) return filas;
        }
    }

    // Busca a la misma persona en los datos de Ajedrez estudiantil (JDE) por
    // nombre, igual que historial-jugador.html: cada palabra del nombre debe
    // aparecer en la clave normalizada del jugador.
    function activoEn2026(nombre, datosJde) {
        if (!datosJde) return null;
        const partes = JdeDatos.normalizar(nombre).split(" ").filter(Boolean);
        if (!partes.length) return { activo: false, clave: null };
        const candidatos = datosJde.jugadores.filter((j) => j.part.length && partes.every((p) => j.clave.includes(p)));
        const conTorneo2026 = candidatos.find((j) => j.part.some((p) => p.torneo.anio === 2026));
        return { activo: !!conTorneo2026, clave: (conTorneo2026 || candidatos[0] || {}).clave || null };
    }

    function el(tag, attrs, ...hijos) {
        const e = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) { if (k === "class") e.className = v; else e.setAttribute(k, v); }
        for (const h of hijos) if (h != null && h !== "") e.append(h instanceof Node ? h : document.createTextNode(String(h)));
        return e;
    }
    const TD = "px-3 py-2 border-t border-brand-100 dark:border-brand-800 whitespace-nowrap";
    const TDN = TD + " text-right tabular-nums";
    const td = (v, num) => el("td", { class: num ? TDN : TD }, v);
    function tabla(caption, cabeza, filas) {
        const t = el("table", { class: "w-full text-sm" }, el("caption", { class: "sr-only" }, caption),
            el("thead", { class: "text-left text-xs uppercase tracking-wide text-brand-500 dark:text-brand-300" },
                el("tr", {}, ...cabeza.map((h) => el("th", { scope: "col", class: "px-3 py-2" + (h.num ? " text-right" : "") }, h.t || h)))));
        const b = el("tbody"); for (const f of filas) b.append(f); t.append(b);
        return el("div", { class: "overflow-x-auto mt-2 bg-white dark:bg-brand-900 rounded-2xl shadow-md" }, t);
    }

    let comites = []; // [{nombre, mio, atletas:[{nombre,categoria,estado,activo2026,clave}], tecnico, u12, u16, u20, registrado, tramite, fuera, activos}]

    function preparar(filas, datosJde) {
        const C = {};
        const c = (n) => C[n] || (C[n] = {
            nombre: n, mio: MIS_COMITES.includes(n), atletas: [], tecnico: 0,
            u12: 0, u16: 0, u20: 0, registrado: 0, tramite: 0, fuera: 0, activos: 0, conDato: 0,
        });
        for (const f of filas) {
            const x = c(f.comite);
            if (f.tipo !== "Atleta") { x.tecnico++; continue; }
            const eg = grupoEdad(f.categoria);
            if (eg) x[eg]++;
            const ei = estadoInfo(f.estado);
            x[ei.grupo]++;
            const act = activoEn2026(f.nombre, datosJde);
            if (act && act.clave) { x.conDato++; if (act.activo) x.activos++; }
            x.atletas.push({
                nombre: f.nombre, categoria: f.categoria, estado: f.estado,
                identificacion: f.identificacion || "", nacimiento: f.nacimiento,
                activo: act && act.activo, clave: act && act.clave,
            });
        }
        return Object.values(C).sort((a, b) => (b.mio - a.mio) || a.nombre.localeCompare(b.nombre, "es"));
    }

    function cifraActivos(x) {
        if (!x.conDato) return "—";
        return x.activos + " de " + x.conDato;
    }

    function pintarGeneral() {
        $("mis-comites-nombres").textContent = MIS_COMITES.join(" y ");
        const tb = document.querySelector("#tabla-comites tbody"); tb.replaceChildren();
        for (const x of comites) {
            const totalAtletas = x.u12 + x.u16 + x.u20;
            const b = el("button", { type: "button", "data-c": slug(x.nombre), class: "font-semibold text-left underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" },
                (x.mio ? "⭐ " : "") + x.nombre);
            b.addEventListener("click", () => elegir(b.dataset.c));
            tb.append(el("tr", {}, el("td", { class: TD }, b),
                td(x.u12, 1), td(x.u16, 1), td(x.u20, 1), td(totalAtletas, 1),
                td(x.registrado, 1), td(x.tramite, 1), td(x.fuera, 1), td(cifraActivos(x), 1)));
        }
        if (!comites.length) tb.append(el("tr", {}, el("td", { class: TD, colspan: "9" }, "Todavía no hay ningún export cargado.")));
    }

    function cifra(n, texto) {
        return el("div", { class: "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4" },
            el("p", { class: "font-serif text-3xl font-bold text-brand-800 dark:text-white" }, n),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300" }, texto));
    }

    function pintarFicha(s) {
        const x = comites.find((y) => slug(y.nombre) === s);
        const ficha = $("ficha");
        if (!x) {
            ficha.classList.add("hidden"); $("general").classList.remove("hidden"); $("volver").classList.add("hidden");
            $("comite").value = ""; return;
        }
        $("comite").value = s; $("general").classList.add("hidden"); ficha.classList.remove("hidden"); $("volver").classList.remove("hidden");
        ficha.replaceChildren();
        ficha.append(el("div", { class: "flex flex-wrap items-baseline justify-between gap-2" },
            el("h2", { id: "ficha-titulo", class: "font-serif text-2xl font-bold text-brand-800 dark:text-white" }, (x.mio ? "⭐ " : "") + x.nombre),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300" }, x.tecnico + " en el cuerpo técnico (entrenadores, asistentes y chaperonas)")));
        ficha.append(el("div", { class: "grid grid-cols-2 md:grid-cols-4 gap-3 mt-4" },
            cifra(x.u12 + x.u16 + x.u20, "atletas inscritos (" + x.u12 + " U-12, " + x.u16 + " U-16, " + x.u20 + " U-20)"),
            cifra(x.registrado, "con el trámite registrado"),
            cifra(x.tramite, "todavía en trámite (aprobado por ICODER, pase cantonal o debe corregir)"),
            cifra(cifraActivos(x), "activos en 2026 (de quienes se pudo buscar)")));
        const filas = [...x.atletas].sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre, "es"));
        ficha.append(el("h3", { class: "font-serif text-lg font-bold text-brand-800 dark:text-white mt-6" }, "Atletas"));
        ficha.append(tabla("Atletas de " + x.nombre, ["Nombre", "Cédula", "Nacimiento", "Categoría", "Estado del trámite", "Activo 2026"], filas.map((a) => {
            const ei = estadoInfo(a.estado);
            const activoCel = a.clave
                ? el("a", { href: "historial-jugador.html?j=" + encodeURIComponent(a.clave), class: "underline underline-offset-2 hover:no-underline" }, a.activo ? "Sí, ver historial" : "No en 2026, ver historial")
                : "Sin dato";
            return el("tr", {}, td(a.nombre), td(a.identificacion || "—"), td(fechaCorta(a.nacimiento)), td(a.categoria),
                el("td", { class: TD }, el("span", { "aria-hidden": "true" }, ei.emoji + " "), ei.texto),
                el("td", { class: TD }, activoCel));
        })));
    }

    function elegir(s) {
        try { history.replaceState(null, "", s ? "#" + s : location.pathname); } catch (e) { /* sin historial */ }
        pintarFicha(s);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function armarControles() {
        const sel = $("comite");
        sel.append(el("option", { value: "" }, "Todos los comités"));
        for (const x of comites) sel.append(el("option", { value: slug(x.nombre) }, (x.mio ? "⭐ " : "") + x.nombre));
        sel.addEventListener("change", () => elegir(sel.value));
        $("volver").addEventListener("click", () => elegir(""));
    }

    async function init() {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { location.href = "login.html?next=jdn-proyeccion.html"; return; }
        const { data: puede, error } = await sb.rpc("tengo_herramienta", { p_herramienta: "jdn-proyeccion" });
        if (error || puede !== true) { $("loading").classList.add("hidden"); $("denegado").classList.remove("hidden"); return; }

        let filas;
        try { filas = await leerInscripciones(); } catch (e) {
            $("loading").classList.add("hidden"); $("app").classList.remove("hidden");
            $("error").textContent = "No se pudieron leer los inscritos: " + (e.message || e) + ". Vuelve a cargar la página en un rato.";
            $("error").classList.remove("hidden");
            return;
        }
        let datosJde = null;
        try { datosJde = await JdeDatos.cargar(); } catch (e) {
            $("error").textContent = "No se pudo cruzar con la actividad de chess-results en 2026: " + (e.message || e) + ". La tabla se ve igual, sin la columna de activos.";
            $("error").classList.remove("hidden");
        }
        comites = preparar(filas, datosJde);
        const totalAtletas = comites.reduce((s, x) => s + x.u12 + x.u16 + x.u20, 0);
        $("intro").textContent = `${filas.length ? comites.length : 0} comités, ${totalAtletas} atletas inscritos en la próxima eliminatoria de los JDN(P). Elige un comité para ver a todos sus atletas, su categoría y en qué paso del trámite van.`;
        armarControles();
        pintarGeneral();
        $("loading").classList.add("hidden"); $("app").classList.remove("hidden");
        const h = decodeURIComponent((location.hash || "").slice(1));
        if (h) pintarFicha(h);
    }

    init();
})();
