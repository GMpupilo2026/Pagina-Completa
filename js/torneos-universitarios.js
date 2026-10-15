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
   - La ficha de un jugador (#j=clave) junta sus filas de uni_resultados (los
     individuales entre universidades), uni_jugadores (sus equipos) y
     uni_clasificacion (los torneos de cada universidad). Se leen la primera
     vez que hacen falta, de mil en mil. Ver «La ficha del jugador
     universitario».

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
    let TODOS = [], POR_TNR = new Map();
    const UN = window.UniversidadesNombres;
    let JUG = "";

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
            top.map((x) => el("tr", { "data-campeon": x.n }, el("td", { class: TD }, botonJugador(x.n)), td([...x.u].join(", ") || "—"), td(x.med[1], 1), td(x.med[2], 1), td(x.med[3], 1), td(x.ultimo.slice(0, 4), 1))))
            : el("p", { class: "mt-2 italic text-brand-500 dark:text-brand-300" }, "Ningún podio individual con estos filtros."));
    }

    /* ---- La ficha del jugador ----
       Cada fila es una participación: individual entre universidades
       (uni_resultados, con su Elo de uni_jugadores), con su equipo
       (uni_jugadores con equipo) o en un torneo de una universidad
       (uni_clasificacion). Las de una universidad o un país de afuera no
       entran: las páginas muestran solo las de Costa Rica. */
    async function todas(tabla, campos, orden, filtro) {
        const filas = [];
        for (let desde = 0; ; desde += 1000) {
            let q = sb.from(tabla).select(campos);
            if (filtro) q = filtro(q);
            for (const o of orden) q = q.order(o);
            const { data, error } = await q.range(desde, desde + 999);
            if (error) throw error;
            filas.push(...data);
            if (data.length < 1000) return filas;
        }
    }
    let PART = null, cargando = null;
    function cargarJugadores() {
        if (!cargando) cargando = (async () => {
            const [res, jug, cla] = await Promise.all([
                todas("uni_resultados", "tnr,orden,puesto,nombre,comite,puntos", ["tnr", "orden"], (q) => q.like("codigo", "%-I%")),
                todas("uni_jugadores", "tnr,orden,equipo,equipo_orden,tablero,nombre,elo,partidas,puntos", ["tnr", "orden"]),
                todas("uni_clasificacion", "tnr,orden,puesto,nombre,titulo,elo,club,puntos", ["tnr", "orden"])]);
            const eloInd = new Map(jug.filter((j) => !j.equipo).map((j) => [j.tnr + "-" + j.orden, j]));
            const filas = [];
            // Un puesto vacío es un empate con el de arriba.
            let prev = { tnr: 0, rk: 0 };
            for (const r of res) {
                const rk = r.puesto || (prev.tnr === r.tnr ? prev.rk : 0); prev = { tnr: r.tnr, rk };
                if (UN.extranjera(r.comite)) continue;
                const j = eloInd.get(r.tnr + "-" + r.orden);
                filas.push({ tnr: r.tnr, nombre: r.nombre, que: "Individual", puesto: rk, puntos: Number(r.puntos), elo: j ? j.elo || 0 : 0,
                    partidas: j ? j.partidas : null, uni: universidad(r.comite, false), medalla: true });
            }
            for (const j of jug) {
                if (!j.equipo || !j.partidas || UN.extranjera(j.equipo)) continue;
                filas.push({ tnr: j.tnr, nombre: j.nombre, que: "Con su equipo " + j.equipo + (j.tablero ? ", tablero " + j.tablero : ""), puesto: j.equipo_orden || 0,
                    puntos: Number(j.puntos), elo: j.elo || 0, partidas: j.partidas, uni: universidad(j.equipo, true), medalla: false, equipo: true });
            }
            for (const c of cla) filas.push({ tnr: c.tnr, nombre: c.nombre, que: "Individual", puesto: c.puesto, puntos: c.puntos == null ? null : Number(c.puntos),
                elo: c.elo || 0, partidas: null, uni: c.club ? universidad(c.club, false) : "", titulo: c.titulo, medalla: true });
            for (const f of filas) { f.k = UN.clave(f.nombre); f.t = POR_TNR.get(f.tnr); }
            PART = filas.filter((f) => f.t && f.k);
            // Una persona: las claves que empiezan otra más larga (nombres
            // cortados por chess-results) van con la larga.
            const claves = [...new Set(PART.map((f) => f.k))].sort((a, b) => b.length - a.length);
            const de = new Map();
            for (const k of claves) {
                const larga = k.length > 12 ? claves.find((o) => o.length > k.length && o.startsWith(k)) : null;
                de.set(k, larga ? de.get(larga) : k);
            }
            for (const f of PART) f.p = de.get(f.k);
        })();
        return cargando;
    }
    const filasDe = (k) => (PART || []).filter((f) => f.p === k)
        .sort((a, b) => b.t.inicio.localeCompare(a.t.inicio) || a.tnr - b.tnr);
    const nombreDe = (filas) => filas.map((f) => f.nombre).sort((a, b) => b.length - a.length || a.localeCompare(b, "es"))[0];
    const universidadesDe = (filas) => [...new Set(filas.map((f) => f.uni).filter((u) => u && UN.conocida(u)))];
    const fmt = (n) => n == null ? "—" : Number(n).toLocaleString("es-CR", { maximumFractionDigits: 1 });
    const anioDe = (f) => f.t.inicio.slice(0, 4);

    async function buscarJugador() {
        const q = UN.clave($("buscar-jugador").value);
        const lista = $("jugadores-lista"), estado = $("jugadores-estado");
        lista.replaceChildren();
        if (q.length < 3) { estado.textContent = q ? "Escribe al menos tres letras." : ""; return; }
        estado.textContent = "Buscando…";
        try { await cargarJugadores(); } catch (e) { estado.textContent = "No se pudieron leer los jugadores: " + (e.message || e) + "."; return; }
        if (UN.clave($("buscar-jugador").value) !== q) return;
        const partes = q.split(" ");
        const P = new Map();
        for (const f of PART) if (partes.every((x) => f.p.includes(x))) (P.get(f.p) || P.set(f.p, []).get(f.p)).push(f);
        const hallados = [...P.entries()].map(([k, fs]) => ({ k, n: nombreDe(fs), c: new Set(fs.map((f) => f.tnr)).size }))
            .sort((a, b) => b.c - a.c || a.n.localeCompare(b.n, "es"));
        estado.textContent = !hallados.length ? "Nadie con ese nombre en los torneos universitarios."
            : hallados.length > 30 ? `${hallados.length} jugadores; se muestran los 30 con más torneos. Escribe más para afinar.`
            : `${hallados.length} jugador${hallados.length === 1 ? "" : "es"}. Toca uno para ver su ficha.`;
        for (const h of hallados.slice(0, 30)) {
            const b = el("button", { type: "button", "data-jugador": h.k, class: "px-3 py-1.5 rounded-lg bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700 text-sm text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" },
                h.n, el("span", { class: "text-brand-500 dark:text-brand-300" }, " · " + h.c + " torneo" + (h.c === 1 ? "" : "s")));
            b.addEventListener("click", () => abrirJugador(h.k));
            lista.append(el("li", {}, b));
        }
    }
    const botonJugador = (nombre) => {
        const b = el("button", { type: "button", class: BOTON + " text-left", "aria-label": "Ver la ficha de " + nombre }, nombre);
        b.addEventListener("click", () => abrirJugador(UN.clave(nombre)));
        return b;
    };
    async function abrirJugador(k) {
        const caja = $("jugador");
        caja.classList.remove("hidden");
        caja.replaceChildren(el("p", { class: "text-sm text-brand-500 dark:text-brand-300" }, "Cargando la ficha…"));
        try { await cargarJugadores(); } catch (e) { caja.replaceChildren(el("p", { class: "text-sm", role: "alert" }, "No se pudieron leer los jugadores: " + (e.message || e) + ".")); return; }
        // La clave del enlace puede ser la de un nombre cortado.
        const p = (PART.find((f) => f.k === k) || PART.find((f) => UN.mismo(f.k, k)) || {}).p || k;
        JUG = p; enlace(); pintarJugador();
        caja.scrollIntoView({ behavior: "smooth", block: "start" });
        caja.focus({ preventScroll: true });
    }
    function cerrarJugador() {
        JUG = ""; enlace();
        const caja = $("jugador"); caja.classList.add("hidden"); caja.replaceChildren();
        $("buscar-jugador").focus();
    }
    function pintarJugador() {
        const caja = $("jugador");
        const filas = filasDe(JUG);
        const cerrar = el("button", { type: "button", id: "jugador-cerrar", class: "text-sm font-semibold px-3 py-1.5 rounded-lg bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" }, "Cerrar la ficha");
        cerrar.addEventListener("click", cerrarJugador);
        if (!filas.length) { caja.replaceChildren(el("p", { class: "text-sm" }, "No hay torneos de este jugador."), cerrar); return; }
        const nombre = nombreDe(filas);
        const unis = universidadesDe(filas);
        const titulo = filas.map((f) => f.titulo).find(Boolean);
        const hechos = filas.filter((f) => !f.t.en_curso);
        const med = [1, 2, 3].map((n) => hechos.filter((f) => f.medalla && f.puesto === n).length);
        const medEq = [1, 2, 3].map((n) => hechos.filter((f) => f.equipo && f.puesto === n).length);
        const anios = [...new Set(filas.map(anioDe))].sort();
        const torneos = new Set(filas.map((f) => f.tnr));
        const entre = new Set(filas.filter((f) => f.t.tipo === "entre universidades").map((f) => f.tnr)).size;
        const conElo = filas.filter((f) => f.elo);
        const mejorElo = conElo.length ? conElo.reduce((a, f) => f.elo > a.elo ? f : a) : null;

        caja.replaceChildren(el("div", { class: "flex flex-wrap items-start justify-between gap-3" },
            el("div", {}, el("h3", { id: "jugador-titulo", class: "font-serif text-2xl font-bold text-brand-800 dark:text-white" }, nombre, titulo ? " " : null, titulo ? el("span", { class: "ml-2 text-base font-semibold text-brand-500 dark:text-brand-300" }, titulo) : null),
                el("p", { class: "text-sm text-brand-500 dark:text-brand-300", id: "jugador-universidades" }, unis.length ? (unis.length > 1 ? "Universidades: " : "Universidad: ") + unis.join(", ") : "Sin universidad en chess-results")),
            cerrar));
        caja.append(el("div", { class: "grid grid-cols-2 md:grid-cols-4 gap-3 mt-4", id: "jugador-cifras" },
            cifra(torneos.size, `torneos universitarios: ${entre} entre universidades y ${torneos.size - entre} de una universidad`),
            cifra(med[0] + med[1] + med[2], `podios individuales (${med[0]} primeros, ${med[1]} segundos y ${med[2]} terceros)` + (medEq[0] + medEq[1] + medEq[2] ? `; con su equipo, ${medEq[0] + medEq[1] + medEq[2]} más` : "")),
            cifra(anios.length === 1 ? anios[0] : anios[0] + "–" + anios[anios.length - 1], anios.length === 1 ? "el año en que jugó" : `años en que jugó (${anios.length} de ellos)`),
            cifra(mejorElo ? mejorElo.elo : "—", mejorElo ? `su Elo más alto en un torneo universitario (${anioDe(mejorElo)})` : "sin Elo en sus torneos")));

        // Año a año: cuántos torneos, podios, el mejor puesto y el Elo más alto.
        const porAnio = anios.map((a) => {
            const fs = filas.filter((f) => anioDe(f) === a), hs = fs.filter((f) => !f.t.en_curso);
            const elos = fs.filter((f) => f.elo).map((f) => f.elo);
            const ind = hs.filter((f) => f.medalla && f.puesto);
            return { a, torneos: new Set(fs.map((f) => f.tnr)).size, podios: ind.filter((f) => f.puesto <= 3).length,
                mejor: ind.length ? Math.min(...ind.map((f) => f.puesto)) : null, elo: elos.length ? Math.max(...elos) : null };
        });
        const conE = porAnio.filter((x) => x.elo);
        caja.append(el("h4", { class: "font-serif text-lg font-bold text-brand-800 dark:text-white mt-6" }, "Año a año"),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1", id: "jugador-crece" }, conE.length >= 2
                ? `Su Elo pasó de ${conE[0].elo} en ${conE[0].a} a ${conE[conE.length - 1].elo} en ${conE[conE.length - 1].a} (${conE[conE.length - 1].elo - conE[0].elo >= 0 ? "+" : "−"}${Math.abs(conE[conE.length - 1].elo - conE[0].elo)}). El Elo de cada año es el más alto con que jugó un torneo universitario.`
                : "Todavía no hay dos años con Elo para ver cómo crece."),
            tabla("El año a año de " + nombre, ["Año", { t: "Torneos", num: 1 }, { t: "Podios individuales", num: 1 }, { t: "Mejor puesto individual", num: 1 }, { t: "Elo más alto", num: 1 }],
                porAnio.map((x) => el("tr", { "data-anio": x.a }, td(x.a), td(x.torneos, 1), td(x.podios || "", 1), td(x.mejor ? x.mejor + ".º" : "—", 1), td(x.elo || "—", 1)))));

        caja.append(el("h4", { class: "font-serif text-lg font-bold text-brand-800 dark:text-white mt-6" }, "Todos sus torneos"),
            tabla("Todos los torneos universitarios de " + nombre, ["Fecha", "Torneo", "Cómo jugó", "Universidad", { t: "Puesto", num: 1 }, { t: "Puntos", num: 1 }, { t: "Elo", num: 1 }, "Comprobar"],
                filas.map((f) => el("tr", { "data-tnr": f.tnr }, td(window.HoraCR.fecha(f.t.inicio, { day: "numeric", month: "short", year: "numeric" })),
                    el("td", { class: TD + " min-w-[14rem]" }, el("span", { class: "font-semibold" }, f.t.nombre),
                        el("span", { class: "block text-xs text-brand-500 dark:text-brand-300" }, TIPO[f.t.tipo] + " · " + RITMO[f.t.ritmo])),
                    td(f.que), td(f.uni && UN.conocida(f.uni) ? f.uni : "—"),
                    el("td", { class: TD + " text-right tabular-nums whitespace-nowrap" }, f.medalla && !f.t.en_curso && f.puesto >= 1 && f.puesto <= 3 ? el("span", { "aria-hidden": "true" }, MED[f.puesto] + " ") : null,
                        f.t.en_curso ? "en curso" : !f.puesto ? "—" : f.puesto + (f.equipo ? ".º (equipo)" : " de " + f.t.jugadores)),
                    td(fmt(f.puntos) + (f.partidas ? " de " + f.partidas : ""), 1), td(f.elo || "—", 1),
                    el("td", { class: TD }, el("a", { href: "https://chess-results.com/tnr" + f.tnr + ".aspx?lan=2&art=" + (f.equipo ? 20 : 1), target: "_blank", rel: "noopener",
                        "aria-label": "Ver " + f.t.nombre + " en chess-results (se abre en otra pestaña)", class: BOTON }, "chess-results"))))));
        if (entre) caja.append(el("p", { class: "text-sm mt-4" }, el("a", { id: "jugador-elo", href: "universidades.html#~~j=" + encodeURIComponent(JUG), class: BOTON + " font-semibold text-brand-700 dark:text-brand-200" },
            "Ver sus partidas contra el Elo en los torneos entre universidades")));
    }

    function enlace() {
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(FILTRO)) if (v) p.set(k, v);
        if (JUG) p.set("j", JUG);
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
        POR_TNR = new Map(TODOS.map((t) => [t.tnr, t]));
        armarControles();
        const bj = $("buscar-jugador");
        bj.addEventListener("focus", () => { cargarJugadores().catch(() => {}); }, { once: true });
        bj.addEventListener("input", buscarJugador);
        $("loading").classList.add("hidden"); $("app").classList.remove("hidden");
        cambio();
        if (p.get("j")) abrirJugador(p.get("j"));
    }

    init();
})();
