/* El código de jdn-comites.html: los resultados JDN por comité.

   - Los datos están en jdn_resultados: cada puesto de cada torneo JDN de
     chess-results, con el comité como lo escribió chess-results. Solo los lee
     quien tiene la herramienta (la RLS pregunta tengo_herramienta()); la tabla
     se llena desde la base con herramientas/jdn-comites/cargar.sql.
   - Son más de mil filas: se piden de mil en mil, porque PostgREST corta sin
     avisar.
   - Acá se juntan las variantes de un mismo comité («Goico», «CCDR
     Goicochea»…), se le deduce el comité a quien no lo trae (el mismo jugador
     en la misma edición, en la eliminatoria de su ciclo o en otra) y se arman
     el medallero y la ficha de cada comité.

   Ver «Resultados JDN por comité» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const $ = (id) => document.getElementById(id);

    /* Cada final cierra un ciclo: la eliminatoria de su ciclo es la que la
       clasificó («Jugó la final» y el comité deducido salen de ahí). */
    const EDICIONES = [
        { id: "2026-F", fase: "final", titulo: "Final 2026", detalle: "San José, enero de 2026", ciclo: "2026-F" },
        { id: "2025-E", fase: "elim", titulo: "Eliminatoria 2025", detalle: "Heredia, agosto y septiembre de 2025", ciclo: "2026-F" },
        { id: "2024-F", fase: "final", titulo: "Final 2024", detalle: "Filadelfia, julio de 2024", ciclo: "2024-F" },
        { id: "2024-E", fase: "elim", titulo: "Eliminatoria 2024", detalle: "Cartago, mayo de 2024", ciclo: "2024-F" },
        { id: "2023-F", fase: "final", titulo: "Final 2022-2023", detalle: "enero de 2023", ciclo: "2023-F" },
        { id: "2022-E", fase: "elim", titulo: "Eliminatoria 2022", detalle: "Alajuela, septiembre y octubre de 2022", ciclo: "2023-F" },
        { id: "2021-E", fase: "elim", titulo: "Eliminatoria 2021", detalle: "octubre de 2021", ciclo: "" },
        { id: "2019-F", fase: "final", titulo: "Final 2019", detalle: "Ciudad Colón, junio y julio de 2019", ciclo: "2019-F" },
        { id: "2018-E", fase: "elim", titulo: "Eliminatoria 2018", detalle: "abril de 2018", ciclo: "" },
    ];
    const ED = Object.fromEntries(EDICIONES.map((e) => [e.id, e]));
    /* Una edición que se cargue después y no esté arriba igual se ve. */
    function edicion(id) {
        if (!ED[id]) {
            const final = id.endsWith("F");
            ED[id] = { id, fase: final ? "final" : "elim", titulo: (final ? "Final " : "Eliminatoria ") + id.slice(0, 4), detalle: "", ciclo: final ? id : "" };
            EDICIONES.push(ED[id]);
            EDICIONES.sort((a, b) => b.id.localeCompare(a.id));
        }
        return ED[id];
    }

    const sinTilde = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const NOMBRES = {
        "belen": "Belén", "san jose": "San José", "pococi": "Pococí", "perez zeledon": "Pérez Zeledón", "limon": "Limón",
        "escazu": "Escazú", "san ramon": "San Ramón", "paraiso": "Paraíso", "poas": "Poás", "la union": "La Unión",
        "rio cuarto": "Río Cuarto", "puerto jimenez": "Puerto Jiménez", "sarapiqui": "Sarapiquí", "canas": "Cañas", "tibas": "Tibás",
        "montes de oca": "Montes de Oca", "monres de oca": "Montes de Oca", "goicochea": "Goicoechea", "goicoechea": "Goicoechea", "goico": "Goicoechea",
        "asociacion goicoechea": "Goicoechea", "codea": "CODEA (Alajuela)", "alajuela": "CODEA (Alajuela)", "turri": "Turrialba", "crecia": "Grecia",
        "san joe": "San José", "lepanto": "Lepanto (distrital)", "lepantp": "Lepanto (distrital)", "paquera": "Paquera (distrital)", "el guarco": "El Guarco", "los chiles": "Los Chiles",
    };
    const titulo = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()).replace(/\bDe\b/g, "de");
    /* El comité tal como lo escribe chess-results → un solo nombre. A un equipo
       se le quita además la letra o el número del final («Escazú A»). */
    function comite(nombre, esEquipo) {
        let s = sinTilde(String(nombre || "")).trim().replace(/^C+DR\s*/i, "").replace(/^CC Distrit(o|al) (de )?/i, "").trim();
        if (!s) return "";
        if (/^codea\b/i.test(s)) return NOMBRES.codea;
        if (esEquipo) { let a; do { a = s; s = s.replace(/\s+(\d{1,2}|[A-Za-z]|SNF)$/, ""); } while (s !== a); }
        return NOMBRES[s.toLowerCase()] || titulo(s);
    }
    const RITMO = { C: "Clásico", R: "Rápido", B: "Blitz" };
    function fmt(n) { if (isNaN(n)) return ""; const e = Math.floor(n); return (n - e) ? (e ? e + "½" : "½") : String(e); }
    function categoria(cod) {
        const [a, cat, mod] = cod.split("-");
        return { ritmo: RITMO[a] || "", zona: RITMO[a] ? "" : (a || "Única"), cat, modo: mod[0] === "I" ? "Individual" : "Equipos", rama: mod[1] === "F" ? "Femenino" : "Absoluto" };
    }
    const clave = (n) => sinTilde(n).toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
    /* chess-results corta algunos nombres largos: «Diaz Charpentier Kristel Meli». */
    const mismo = (a, b) => a === b || (a.length > 12 && b.startsWith(a)) || (b.length > 12 && a.startsWith(b));

    let ind = [], eq = [], tam = {}, todos = [], finalistasDe = {};

    async function leerTodo() {
        const filas = [];
        for (let desde = 0; ; desde += 1000) {
            const { data, error } = await sb.from("jdn_resultados")
                .select("edicion,codigo,orden,puesto,nombre,comite,record,puntos")
                .order("edicion").order("codigo").order("orden")
                .range(desde, desde + 999);
            if (error) throw error;
            filas.push(...data);
            if (data.length < 1000) return filas;
        }
    }

    function preparar(filas) {
        const previo = {};
        for (const f of filas) {
            const k = f.edicion + f.codigo;
            // Un puesto vacío es un empate con el de arriba.
            const rk = f.puesto || previo[k] || 0; previo[k] = rk;
            const esEquipo = f.codigo.split("-")[2][0] === "E";
            const r = { ed: f.edicion, cod: f.codigo, ...categoria(f.codigo), rk, pts: Number(f.puntos), fase: edicion(f.edicion).fase };
            if (esEquipo) eq.push(Object.assign(r, { equipo: f.nombre.replace(/^C+DR\s+/i, ""), comite: comite(f.comite || f.nombre, true), record: f.record || "" }));
            else ind.push(Object.assign(r, { nombre: f.nombre, clave: clave(f.nombre), comite: comite(f.comite, false), deducido: false }));
            tam[k] = (tam[k] || 0) + 1;
        }
        // El comité que falta: el del mismo jugador en la misma edición, si no
        // en la eliminatoria de su ciclo, si no en cualquier otra.
        for (const r of ind) {
            if (r.comite) continue;
            const orden = [r.ed, ...EDICIONES.filter((e) => e.ciclo && e.ciclo === ED[r.ed].ciclo && e.id !== r.ed).map((e) => e.id), ...EDICIONES.map((e) => e.id)];
            for (const ed of orden) {
                const o = ind.find((x) => x.ed === ed && x.comite && mismo(x.clave, r.clave));
                if (o) { r.comite = o.comite; r.deducido = true; break; }
            }
            if (!r.comite) r.comite = "Sin comité";
        }
        for (const r of ind) if (r.fase === "final") (finalistasDe[r.ed] = finalistasDe[r.ed] || []).push(r.clave);
        todos = resumen(() => true);
    }
    const jugoFinal = (r) => { const c = ED[r.ed].ciclo; return !!c && c !== r.ed && (finalistasDe[c] || []).some((k) => mismo(k, r.clave)); };

    const MED = ["", "oro", "plata", "bronce"];
    const slug = (n) => sinTilde(n).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    function resumen(filtro) {
        const C = {};
        const c = (n) => C[n] || (C[n] = { nombre: n, zonas: new Set(), oro: 0, plata: 0, bronce: 0, ind: 0, eqm: 0, fin: new Set(), insc: 0, eqElim: 0 });
        for (const r of ind.filter(filtro)) {
            const x = c(r.comite);
            if (r.fase === "elim") { x.insc++; if (r.zona === "Z1" || r.zona === "Z2") x.zonas.add(r.zona); }
            else { x.fin.add(r.ed + r.clave); if (r.rk >= 1 && r.rk <= 3) { x[MED[r.rk]]++; x.ind++; } }
        }
        for (const r of eq.filter(filtro)) {
            const x = c(r.comite);
            if (r.fase === "elim") { x.eqElim++; if (r.zona === "Z1" || r.zona === "Z2") x.zonas.add(r.zona); }
            else if (r.rk >= 1 && r.rk <= 3) { x[MED[r.rk]]++; x.eqm++; }
        }
        delete C["Sin comité"];
        return Object.values(C).sort((a, b) => b.oro - a.oro || b.plata - a.plata || b.bronce - a.bronce
            || b.fin.size - a.fin.size || b.insc - a.insc || a.nombre.localeCompare(b.nombre, "es"));
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
    /* La medalla va con su emoji y escrita: el color nunca va solo. */
    function medalla(rk) {
        if (!(rk >= 1 && rk <= 3)) return null;
        return el("span", { class: "font-semibold" }, el("span", { "aria-hidden": "true" }, ["", "🥇", "🥈", "🥉"][rk] + " "), ["", "Oro", "Plata", "Bronce"][rk]);
    }
    const etiqueta = (t) => el("span", { class: "inline-block rounded-full bg-accent-100 text-brand-900 text-xs font-semibold px-2 py-0.5" }, t);
    const zonaTxt = (z) => [...z].sort().join(" y ") || "—";

    function tabla(caption, cabeza, filas) {
        const t = el("table", { class: "w-full text-sm" }, el("caption", { class: "sr-only" }, caption),
            el("thead", { class: "text-left text-xs uppercase tracking-wide text-brand-500 dark:text-brand-300" },
                el("tr", {}, ...cabeza.map((h) => el("th", { scope: "col", class: "px-3 py-2" + (h.num ? " text-right" : "") }, h.t || h)))));
        const b = el("tbody"); for (const f of filas) b.append(f); t.append(b);
        return el("div", { class: "overflow-x-auto mt-2 bg-white dark:bg-brand-900 rounded-2xl shadow-md" }, t);
    }
    const ORD_R = { "Clásico": 0, "Rápido": 1, "Blitz": 2 };
    const ordCat = (a, b) => a.cat.localeCompare(b.cat) || a.rama.localeCompare(b.rama) || (ORD_R[a.ritmo] || 0) - (ORD_R[b.ritmo] || 0) || a.zona.localeCompare(b.zona) || a.rk - b.rk;

    function pintarGeneral(edSel) {
        const lista = resumen((r) => !edSel || r.ed === edSel);
        const e = ED[edSel];
        const finales = EDICIONES.filter((x) => x.fase === "final").map((x) => x.titulo.replace(/^Final /, ""));
        $("general-titulo").textContent = !e ? "Medallero de las finales" : e.fase === "final" ? "Medallero · " + e.titulo : "Participación · " + e.titulo;
        $("general-texto").textContent = !e
            ? "Medallas de las finales (" + finales.join(", ") + "), sumando individual y equipos, e inscritos de las eliminatorias. Elige un comité para ver su ficha. El orden es por oros, después platas y bronces."
            : e.fase === "final" ? "Medallas de " + e.titulo + (e.detalle ? " (" + e.detalle + ")" : "") + ", sumando individual y equipos. Elige un comité para ver su ficha."
                : "En una eliminatoria no hay medallas: la tabla dice cuántos jugadores y equipos inscribió cada comité. Elige un comité para ver su ficha.";
        const tb = document.querySelector("#medallero tbody"); tb.replaceChildren();
        for (const x of lista) {
            const b = el("button", { type: "button", "data-c": slug(x.nombre), class: "font-semibold text-left underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" }, x.nombre);
            b.addEventListener("click", () => elegir(b.dataset.c, $("edicion").value));
            tb.append(el("tr", {}, el("td", { class: TD }, b), td(zonaTxt(x.zonas)),
                td(x.oro || "", 1), td(x.plata || "", 1), td(x.bronce || "", 1), td(x.ind || "", 1), td(x.eqm || "", 1),
                td(x.fin.size || "", 1), td(x.insc || "", 1), td(x.eqElim || "", 1)));
        }
        if (!lista.length) tb.append(el("tr", {}, el("td", { class: TD, colspan: "10" }, "No hay resultados de esta edición.")));
    }

    function cifra(n, texto) {
        return el("div", { class: "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4" },
            el("p", { class: "font-serif text-3xl font-bold text-brand-800 dark:text-white" }, n),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300" }, texto));
    }

    function pintar(s, edSel) {
        const x = todos.find((y) => slug(y.nombre) === s);
        const ficha = $("ficha");
        $("edicion").value = ED[edSel] ? edSel : "";
        if (!x) {
            ficha.classList.add("hidden"); $("general").classList.remove("hidden"); $("volver").classList.add("hidden");
            $("comite").value = ""; pintarGeneral($("edicion").value); return;
        }
        const edVal = $("edicion").value;
        $("comite").value = s; $("general").classList.add("hidden"); ficha.classList.remove("hidden"); $("volver").classList.remove("hidden");
        ficha.replaceChildren();
        const pos = todos.indexOf(x) + 1;
        ficha.append(el("div", { class: "flex flex-wrap items-baseline justify-between gap-2" },
            el("h2", { id: "ficha-titulo", class: "font-serif text-2xl font-bold text-brand-800 dark:text-white" }, x.nombre),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300" }, "Zona " + zonaTxt(x.zonas) + " · puesto " + pos + " de " + todos.length + " en el medallero de todas las finales")));
        ficha.append(el("div", { class: "grid grid-cols-2 md:grid-cols-4 gap-3 mt-4" },
            cifra(x.oro + x.plata + x.bronce, `medallas en las finales (${x.oro} de oro, ${x.plata} de plata, ${x.bronce} de bronce)`),
            cifra(x.fin.size, "participaciones en finales individuales"),
            cifra(x.insc, "inscripciones en eliminatorias individuales"),
            cifra(x.eqElim, "equipos en eliminatorias")));

        const filasEd = [];
        for (const e of EDICIONES) {
            const ri = ind.filter((r) => r.ed === e.id && r.comite === x.nombre), re = eq.filter((r) => r.ed === e.id && r.comite === x.nombre);
            if (!ri.length && !re.length) continue;
            const n = (k) => e.fase === "final" ? [...ri, ...re].filter((r) => r.rk === k).length : "—";
            filasEd.push(el("tr", {}, td(e.titulo), td(ri.length, 1), td(re.length, 1), td(n(1), 1), td(n(2), 1), td(n(3), 1)));
        }
        ficha.append(el("h3", { class: "font-serif text-lg font-bold text-brand-800 dark:text-white mt-6" }, "Edición por edición"));
        ficha.append(tabla("Jugadores, equipos y medallas de " + x.nombre + " en cada edición",
            ["Edición", { t: "Jugadores ind.", num: 1 }, { t: "Equipos", num: 1 }, { t: "Oro", num: 1 }, { t: "Plata", num: 1 }, { t: "Bronce", num: 1 }], filasEd));

        for (const e of EDICIONES.filter((y) => !edVal || y.id === edVal)) {
            const ri = ind.filter((r) => r.ed === e.id && r.comite === x.nombre).sort(ordCat);
            const re = eq.filter((r) => r.ed === e.id && r.comite === x.nombre).sort(ordCat);
            if (!ri.length && !re.length) {
                if (edVal) ficha.append(el("p", { class: "mt-6 text-brand-500 dark:text-brand-300 italic" }, x.nombre + " no tuvo jugadores ni equipos en " + e.titulo + "."));
                continue;
            }
            const final = e.fase === "final";
            const sec = el("section", { class: "mt-8 pt-4 border-t-2 border-brand-100 dark:border-brand-800", "data-edicion": e.id },
                el("h3", { class: "font-serif text-xl font-bold text-brand-800 dark:text-white" }, e.titulo),
                el("p", { class: "text-sm text-brand-500 dark:text-brand-300" }, e.detalle));
            if (ri.length) {
                sec.append(el("h4", { class: "font-semibold text-brand-800 dark:text-white mt-4" }, "Individual"));
                const cab = ["Categoría", final ? "Ritmo" : "Zona", "Jugador", { t: "Puesto", num: 1 }, { t: "Puntos", num: 1 }, final ? "Medalla" : "Final"];
                sec.append(tabla("Jugadores de " + x.nombre + " en " + e.titulo, cab, ri.map((r) => el("tr", { "data-jugador": r.nombre },
                    td(r.cat + " " + r.rama), td(final ? r.ritmo : r.zona),
                    el("td", { class: TD.replace("whitespace-nowrap", "min-w-[12rem]") }, r.nombre,
                        r.deducido ? el("span", { class: "block text-xs text-brand-500 dark:text-brand-300" }, "comité deducido") : null),
                    td(r.rk + " de " + tam[r.ed + r.cod], 1), td(fmt(r.pts), 1),
                    el("td", { class: TD }, final ? medalla(r.rk) : (jugoFinal(r) ? etiqueta("Jugó la final") : null))))));
            }
            if (re.length) {
                sec.append(el("h4", { class: "font-semibold text-brand-800 dark:text-white mt-4" }, "Equipos"));
                const cab = ["Categoría", final ? "Ritmo" : "Zona", "Equipo", { t: "Puesto", num: 1 }, { t: "Matches G-E-P", num: 1 }, { t: "Puntos de partida", num: 1 }];
                if (final) cab.push("Medalla");
                sec.append(tabla("Equipos de " + x.nombre + " en " + e.titulo, cab, re.map((r) => el("tr", {},
                    td(r.cat + " " + r.rama), td(final ? r.ritmo : r.zona), td(r.equipo),
                    td(r.rk + " de " + tam[r.ed + r.cod], 1), td(r.record || "—", 1), td(fmt(r.pts), 1),
                    final ? el("td", { class: TD }, medalla(r.rk)) : null))));
            }
            ficha.append(sec);
        }
    }

    function elegir(s, ed) {
        const h = [s, ed].filter(Boolean).join("~");
        try { history.replaceState(null, "", h ? "#" + h : location.pathname); } catch (e) { /* sin historial */ }
        pintar(s, ed);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function armarControles() {
        const selC = $("comite"), selE = $("edicion");
        selC.append(el("option", { value: "" }, "Todos los comités (medallero)"));
        for (const x of [...todos].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))) selC.append(el("option", { value: slug(x.nombre) }, x.nombre));
        selE.append(el("option", { value: "" }, "Todas las ediciones"));
        for (const e of EDICIONES) if (tam && Object.keys(tam).some((k) => k.startsWith(e.id))) selE.append(el("option", { value: e.id }, e.titulo + (e.detalle ? " · " + e.detalle : "")));
        selC.addEventListener("change", () => elegir(selC.value, selE.value));
        selE.addEventListener("change", () => elegir(selC.value, selE.value));
        $("volver").addEventListener("click", () => elegir("", selE.value));
    }

    async function init() {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { location.href = "login.html?next=jdn-comites.html"; return; }
        const { data: puede, error } = await sb.rpc("tengo_herramienta", { p_herramienta: "jdn-comites" });
        if (error || puede !== true) { $("loading").classList.add("hidden"); $("denegado").classList.remove("hidden"); return; }
        let filas;
        try { filas = await leerTodo(); } catch (e) {
            $("loading").classList.add("hidden"); $("app").classList.remove("hidden");
            $("error").textContent = "No se pudieron leer los resultados: " + (e.message || e) + ". Vuelve a cargar la página en un rato.";
            $("error").classList.remove("hidden");
            return;
        }
        preparar(filas);
        const torneos = Object.keys(tam).length;
        const nE = EDICIONES.filter((e) => e.fase === "elim" && Object.keys(tam).some((k) => k.startsWith(e.id))).length;
        const nF = EDICIONES.filter((e) => e.fase === "final" && Object.keys(tam).some((k) => k.startsWith(e.id))).length;
        $("intro").textContent = `Los resultados de cada comité de deportes en los ${torneos} torneos de ajedrez de los Juegos Deportivos Nacionales que están en chess-results: ${nE} eliminatorias y ${nF} finales. Elige un comité para ver a todos sus jugadores y equipos, edición por edición.`;
        armarControles();
        $("loading").classList.add("hidden"); $("app").classList.remove("hidden");
        const [h1, h2] = decodeURIComponent((location.hash || "").slice(1)).split("~");
        if (ED[h1]) pintar("", h1); else pintar(h1 || "", h2 || "");
    }

    init();
})();
