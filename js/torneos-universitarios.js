/* El código de torneos-universitarios.html: todos los torneos universitarios
   de Costa Rica que están en chess-results, uno por fila.

   - Los datos están en uni_torneos (los llena
     herramientas/universidades/catalogo.sql): fecha, quién organiza, si es
     entre universidades o de una universidad, ritmo, jugadores y podio. Solo
     los lee quien tiene la herramienta «universidades» (la RLS pregunta
     tengo_herramienta()).
   - Se piden de mil en mil, aunque hoy sean menos: PostgREST corta sin avisar.
   - El nombre de la universidad de cada medallista sale de
     js/universidades-nombres.js, la misma lista de variantes que usa
     universidades.html.
   - Los filtros (año, quién organiza, tipo, ritmo y la búsqueda) van en el
     enlace (#anio=…&org=…), para mandar la vista.

   Ver «Torneos universitarios de Costa Rica» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const sinTilde = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
    const clave = (n) => sinTilde(n).toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
    const universidad = (n, e) => window.UniversidadesNombres.universidad(n, e);
    const RITMO = { C: "Clásico", R: "Rápido", B: "Blitz" };
    const TIPO = { "entre universidades": "Entre universidades", "de una universidad": "De una universidad" };
    const FILTRO = { anio: "", org: "", tipo: "", ritmo: "", q: "" };
    let TODOS = [];

    function el(tag, attrs, ...hijos) {
        const e = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) { if (k === "class") e.className = v; else e.setAttribute(k, v); }
        for (const h of hijos) if (h != null && h !== "") e.append(h instanceof Node ? h : document.createTextNode(String(h)));
        return e;
    }
    const TD = "px-3 py-2 border-t border-brand-100 dark:border-brand-800 align-top";
    const td = (v, num) => el("td", { class: TD + (num ? " text-right tabular-nums whitespace-nowrap" : "") }, v);
    const BOTON = "underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500";

    function tabla(caption, cabeza, filas) {
        const t = el("table", { class: "w-full text-sm" }, el("caption", { class: "sr-only" }, caption),
            el("thead", { class: "text-left text-xs uppercase tracking-wide text-brand-500 dark:text-brand-300" },
                el("tr", {}, ...cabeza.map((h) => el("th", { scope: "col", class: "px-3 py-2" + (h.num ? " text-right" : "") }, h.t || h)))));
        const b = el("tbody"); for (const f of filas) b.append(f); t.append(b);
        return el("div", { class: "overflow-x-auto mt-3 bg-white dark:bg-brand-900 rounded-2xl shadow-md" }, t);
    }
    function cifra(n, texto) {
        return el("div", { class: "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4" },
            el("p", { class: "font-serif text-3xl font-bold text-brand-800 dark:text-white" }, n),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300" }, texto));
    }

    async function leer() {
        const filas = [];
        for (let desde = 0; ; desde += 1000) {
            const { data, error } = await sb.from("uni_torneos")
                .select("tnr,nombre,inicio,lugar,organiza,tipo,edicion,ritmo,modalidad,jugadores,en_curso,podio")
                .order("inicio", { ascending: false }).order("tnr")
                .range(desde, desde + 999);
            if (error) throw error;
            filas.push(...data);
            if (data.length < 1000) return filas;
        }
    }

    /* Cada medallista con su universidad: la que trae chess-results o, en un
       torneo por equipos, la del equipo. Un club que no es una universidad (los
       Blitz de la UCR traen el comité cantonal) no se muestra. Los de una
       universidad de afuera (o de un país que no es Costa Rica, en los JUDUCA
       individuales) no salen: el podio muestra solo a los de Costa Rica, con
       su puesto de verdad. */
    function medallistas(t) {
        const afuera = window.UniversidadesNombres.extranjera;
        return (t.podio || []).filter((m) => !afuera(t.modalidad === "E" ? m.n : m.u)).map((m) => {
            const u = t.modalidad === "E" ? universidad(m.n, true) : universidad(m.u, false);
            const esUni = !!u && window.UniversidadesNombres.conocida(u);
            return { p: m.p, n: m.n, u: esUni ? u : "" };
        });
    }

    const pasa = (t) => (!FILTRO.anio || t.inicio.slice(0, 4) === FILTRO.anio) && (!FILTRO.org || t.organiza === FILTRO.org)
        && (!FILTRO.tipo || t.tipo === FILTRO.tipo) && (!FILTRO.ritmo || t.ritmo === FILTRO.ritmo)
        && (!FILTRO.q || clave(t.nombre + " " + (t.podio || []).map((m) => m.n).join(" ")).includes(clave(FILTRO.q)));

    function pintarCifras(lista) {
        const orgs = new Set(lista.map((t) => t.organiza));
        const anios = lista.map((t) => t.inicio.slice(0, 4)).sort();
        $("cifras").replaceChildren(
            cifra(lista.length, "torneos" + (lista.filter((t) => t.en_curso).length ? `, ${lista.filter((t) => t.en_curso).length} en curso` : "")),
            cifra(lista.filter((t) => t.tipo === "entre universidades").length, "entre universidades"),
            cifra(orgs.size, "organizadores (universidades y los JUDUCA)"),
            cifra(lista.reduce((a, t) => a + t.jugadores, 0).toLocaleString("es-CR"), anios.length ? `participaciones, de ${anios[0]} a ${anios[anios.length - 1]}` : "participaciones"));
    }

    function pintarPorUni(lista) {
        const U = {};
        for (const t of lista) {
            const x = U[t.organiza] || (U[t.organiza] = { n: t.organiza, total: 0, entre: 0, propios: 0, jug: 0, desde: "9999", hasta: "0000" });
            x.total++; x[t.tipo === "entre universidades" ? "entre" : "propios"]++; x.jug += t.jugadores;
            const a = t.inicio.slice(0, 4); if (a < x.desde) x.desde = a; if (a > x.hasta) x.hasta = a;
        }
        const filas = Object.values(U).sort((a, b) => b.total - a.total || a.n.localeCompare(b.n, "es")).map((x) => {
            const b = el("button", { type: "button", "data-org": x.n, class: "font-semibold text-left " + BOTON }, x.n);
            b.addEventListener("click", () => { FILTRO.org = x.n; $("f-organiza").value = x.n; cambio(); });
            return el("tr", { "data-organiza": x.n }, el("td", { class: TD }, b), td(x.total, 1), td(x.entre || "—", 1), td(x.propios || "—", 1),
                td(x.jug.toLocaleString("es-CR"), 1), td(x.desde === x.hasta ? x.desde : x.desde + "–" + x.hasta, 1));
        });
        $("por-uni").replaceChildren(filas.length ? tabla("Torneos por universidad que organiza",
            ["Organiza", { t: "Torneos", num: 1 }, { t: "Entre universidades", num: 1 }, { t: "Propios", num: 1 }, { t: "Participaciones", num: 1 }, { t: "Años", num: 1 }], filas)
            : el("p", { class: "mt-2 italic text-brand-500 dark:text-brand-300" }, "Ningún torneo con estos filtros."));
    }

    const MED = ["", "🥇", "🥈", "🥉"];
    function celdaPuesto(ms, p) {
        const de = ms.filter((m) => m.p === p);
        if (!de.length) return td("—");
        return el("td", { class: TD + " min-w-[11rem]" }, ...de.map((m) => el("span", { class: "block" },
            el("span", { "aria-hidden": "true" }, MED[p] + " "), m.n,
            m.u ? el("span", { class: "block text-xs text-brand-500 dark:text-brand-300" }, m.u) : null)));
    }
    function filaTorneo(t) {
        const ms = medallistas(t);
        const nombre = el("td", { class: TD + " min-w-[14rem]" }, el("span", { class: "font-semibold" }, t.nombre),
            t.en_curso ? " " : null, t.en_curso ? el("span", { class: "ml-1 inline-block rounded-full bg-accent-100 text-brand-900 text-xs font-semibold px-2 py-0.5" }, "En curso") : null,
            t.lugar ? el("span", { class: "block text-xs text-brand-500 dark:text-brand-300" }, t.lugar) : null);
        const enlace = el("td", { class: TD }, el("a", { href: "https://chess-results.com/tnr" + t.tnr + ".aspx?lan=2&art=1", target: "_blank", rel: "noopener",
            "aria-label": "Ver " + t.nombre + " en chess-results (se abre en otra pestaña)", class: BOTON }, "chess-results"));
        return el("tr", { "data-tnr": t.tnr }, td(window.HoraCR.fecha(t.inicio, { day: "numeric", month: "short", year: "numeric" })), nombre, td(t.organiza),
            td(TIPO[t.tipo]), td(RITMO[t.ritmo] + (t.modalidad === "E" ? " · equipos" : "")), td(t.jugadores, 1),
            ...(t.en_curso ? [el("td", { class: TD + " italic text-brand-500 dark:text-brand-300", colspan: "3" }, "Se está jugando: el podio sale cuando termine.")]
                : [celdaPuesto(ms, 1), celdaPuesto(ms, 2), celdaPuesto(ms, 3)]), enlace);
    }
    function pintarLista(lista) {
        $("lista-texto").textContent = lista.length
            ? `${lista.length} torneo${lista.length === 1 ? "" : "s"}, del más nuevo al más viejo. Cada uno lleva su enlace a chess-results para comprobarlo.`
            : "Ningún torneo con estos filtros.";
        const caja = $("lista");
        caja.replaceChildren();
        if (!lista.length) return;
        const bajar = el("button", { type: "button", id: "bajar-excel", class: "text-sm font-semibold px-4 py-2 rounded-lg bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" }, "Bajar en Excel");
        bajar.addEventListener("click", () => bajarExcel(lista));
        caja.append(el("div", { class: "flex justify-end mt-2" }, bajar),
            tabla("Torneos universitarios de Costa Rica", ["Fecha", "Torneo", "Organiza", "Tipo", "Ritmo", { t: "Jugadores", num: 1 }, "1.º", "2.º", "3.º", "Comprobar"], lista.map(filaTorneo)));
    }
    function bajarExcel(lista) {
        const nom = (ms, p) => ms.filter((m) => m.p === p).map((m) => m.n + (m.u ? " (" + m.u + ")" : "")).join(" / ");
        const filas = [["Fecha", "Torneo", "Lugar", "Organiza", "Tipo", "Ritmo", "Modalidad", "Jugadores", "1.º", "2.º", "3.º", "chess-results"],
            ...lista.map((t) => { const ms = medallistas(t); return [t.inicio, t.nombre + (t.en_curso ? " (en curso)" : ""), t.lugar, t.organiza, TIPO[t.tipo], RITMO[t.ritmo],
                t.modalidad === "E" ? "Por equipos" : "Individual", t.jugadores, nom(ms, 1), nom(ms, 2), nom(ms, 3), "https://chess-results.com/tnr" + t.tnr + ".aspx?lan=2&art=1"]; }),
            [], ["Datos de chess-results.com, juntados por Ajedrez Integral · " + window.HoraCR.fecha(new Date())]];
        try { window.TablaExcel.bajar("torneos-universitarios.xlsx", [{ nombre: "Torneos universitarios", filas }]); }
        catch (e) { window.Avisos.avisar("No se pudo bajar la tabla: " + (e.message || e), { tipo: "error" }); }
    }

    /* Quién más ganó: los podios de los torneos individuales, juntando el
       mismo nombre escrito con o sin coma, con tildes o sin ellas. */
    function pintarCampeones(lista) {
        const P = {};
        for (const t of lista) {
            if (t.modalidad !== "I" || t.en_curso) continue;
            for (const m of medallistas(t)) {
                const k = clave(m.n);
                if (!k || !(m.p >= 1 && m.p <= 3)) continue;
                const x = P[k] || (P[k] = { n: m.n, med: [0, 0, 0, 0], u: new Set(), ultimo: "" });
                x.med[m.p]++; if (m.u) x.u.add(m.u); if (t.inicio > x.ultimo) x.ultimo = t.inicio;
            }
        }
        // chess-results corta algunos nombres largos («Diaz Charpentier Kristel
        // Meliss»): un nombre que empieza otro más largo es la misma persona.
        const claves = Object.keys(P).sort((a, b) => b.length - a.length);
        for (const k of claves) {
            const largo = claves.find((o) => o !== k && o.length > k.length && k.length > 12 && o.startsWith(k) && P[o]);
            if (!largo || !P[k]) continue;
            const x = P[largo], y = P[k];
            for (let i = 1; i <= 3; i++) x.med[i] += y.med[i];
            for (const u of y.u) x.u.add(u);
            if (y.ultimo > x.ultimo) x.ultimo = y.ultimo;
            delete P[k];
        }
        const top = Object.values(P).sort((a, b) => b.med[1] - a.med[1] || b.med[2] - a.med[2] || b.med[3] - a.med[3] || a.n.localeCompare(b.n, "es")).slice(0, 30);
        $("campeones").replaceChildren(top.length ? tabla("Los jugadores con más primeros lugares", ["Jugador", "Universidad", { t: "1.º", num: 1 }, { t: "2.º", num: 1 }, { t: "3.º", num: 1 }, { t: "Último podio", num: 1 }],
            top.map((x) => el("tr", { "data-campeon": x.n }, td(x.n), td([...x.u].join(", ") || "—"), td(x.med[1], 1), td(x.med[2], 1), td(x.med[3], 1), td(x.ultimo.slice(0, 4), 1))))
            : el("p", { class: "mt-2 italic text-brand-500 dark:text-brand-300" }, "Ningún podio individual con estos filtros."));
    }

    function enlace() {
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(FILTRO)) if (v) p.set(k, v);
        const h = p.toString();
        try { history.replaceState(null, "", h ? "#" + h : location.pathname); } catch (e) { /* sin historial */ }
    }
    function cambio() {
        const lista = TODOS.filter(pasa);
        const txt = [FILTRO.anio, FILTRO.org, FILTRO.tipo && TIPO[FILTRO.tipo], FILTRO.ritmo && RITMO[FILTRO.ritmo], FILTRO.q && "«" + FILTRO.q + "»"].filter(Boolean);
        $("filtros-activos").textContent = txt.length ? "Filtros: " + txt.join(" · ") + "." : "";
        pintarCifras(lista); pintarPorUni(lista); pintarLista(lista); pintarCampeones(lista);
        enlace();
    }

    function armarControles() {
        const anios = [...new Set(TODOS.map((t) => t.inicio.slice(0, 4)))].sort().reverse();
        for (const a of anios) $("f-anio").append(el("option", { value: a }, a));
        for (const o of [...new Set(TODOS.map((t) => t.organiza))].sort((a, b) => a.localeCompare(b, "es"))) $("f-organiza").append(el("option", { value: o }, o));
        const sel = { anio: "f-anio", org: "f-organiza", tipo: "f-tipo", ritmo: "f-ritmo" };
        for (const [k, id] of Object.entries(sel)) {
            const s = $(id);
            if ([...s.options].some((o) => o.value === FILTRO[k])) s.value = FILTRO[k]; else FILTRO[k] = "";
            s.addEventListener("change", () => { FILTRO[k] = s.value; cambio(); });
        }
        const q = $("buscar");
        q.value = FILTRO.q;
        q.addEventListener("input", () => { FILTRO.q = q.value.trim(); cambio(); });
    }

    async function init() {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { location.href = "login.html?next=torneos-universitarios.html"; return; }
        const { data: puede, error } = await sb.rpc("tengo_herramienta", { p_herramienta: "universidades" });
        if (error || puede !== true) { $("loading").classList.add("hidden"); $("denegado").classList.remove("hidden"); return; }
        try { TODOS = await leer(); } catch (e) {
            $("loading").classList.add("hidden"); $("app").classList.remove("hidden");
            $("error").textContent = "No se pudieron leer los torneos: " + (e.message || e) + ". Vuelve a cargar la página en un rato.";
            $("error").classList.remove("hidden");
            return;
        }
        const p = new URLSearchParams(decodeURIComponent((location.hash || "").slice(1)));
        for (const k of Object.keys(FILTRO)) FILTRO[k] = p.get(k) || "";
        armarControles();
        $("loading").classList.add("hidden"); $("app").classList.remove("hidden");
        cambio();
    }

    init();
})();
