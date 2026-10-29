/* El código de normas-titulo.html: «Normas de título».

   Lee el torneo con la Edge Function desempates-chess-results (la misma de
   Desempates y de la Variación de Elo, pidiendo la licencia de
   «normas-titulo»), arma para cada jugador sus partidas con el título, la
   federación y el Elo FIDE de cada rival, y las revisa con
   js/normas-titulo.js (NormasTitulo), artículo por artículo del Reglamento
   de Títulos de FIDE. Solo se buscan las normas de títulos que la persona
   todavía no tiene. Ver «Normas de título» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const NT = window.NormasTitulo;
    const $ = (id) => document.getElementById(id);

    let datosCR = null;
    let filas = []; // { j, evaluados: [{ titulo, nombre, norma, mejor }] }

    // Qué normas ya no le sirven a quien tiene cada título.
    const YA_TIENE = { GM: ["GM", "IM", "WGM", "WIM"], IM: ["IM", "WIM"], WGM: ["WGM", "WIM"], WIM: ["WIM"] };

    function el(tag, attrs, ...hijos) {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (v == null || v === false) continue;
            if (k === "class") n.className = v;
            else if (k === "texto") n.textContent = v;
            else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
            else n.setAttribute(k, v === true ? "" : v);
        }
        for (const h of hijos.flat()) if (h != null) n.append(h.nodeType ? h : document.createTextNode(String(h)));
        return n;
    }
    const avisar = (texto, error) => Avisos.avisar(texto, { tipo: error ? "error" : "ok" });
    const TD = "px-3 py-2 border-t border-brand-100 dark:border-brand-800";
    const fmt = (x) => String(x).replace(".5", "½").replace(/^0½$/, "½");

    async function leerTorneo(url) {
        let { data, error } = await sb.functions.invoke("desempates-chess-results", { body: { url, herramienta: "normas-titulo" } });
        if (error && error.context && typeof error.context.json === "function") {
            try { data = await error.context.json(); } catch (e) { /* sin cuerpo */ }
        }
        if (!data || data.error) throw new Error((data && data.error) || (error && error.message) || "chess-results no contestó");
        return data;
    }

    function calcular() {
        if (!datosCR) return;
        const porSnr = new Map(datosCR.jugadores.map((j) => [j.snr, j]));
        const hayMujeres = datosCR.jugadores.some((j) => j.sexo === "w");
        const rondas = datosCR.rondasJugadas || Math.max(0, ...datosCR.jugadores.flatMap((j) => j.partidas.map((p) => p.ronda)));
        const opciones = { sistema: $("c-todos").checked ? "todos" : "suizo", rondas, exentoFederaciones: $("c-exento").checked };
        filas = datosCR.jugadores.map((j) => {
            const partidas = j.partidas.map((p) => {
                const r = porSnr.get(p.rivalSnr);
                return {
                    ronda: p.ronda, puntos: p.puntos || 0,
                    jugada: !p.bye && !p.incomparecencia && p.puntos != null && !!r,
                    rival: r ? { nombre: r.nombre, fed: r.fed, titulo: r.titulo, elo: p.rivalFide || r.eloFide || 0 } : null,
                };
            });
            // El sexo solo se sabe si chess-results trae la columna: sin ella, se revisan todas.
            const sexo = j.sexo === "w" ? "w" : hayMujeres ? "m" : "";
            const fuera = YA_TIENE[j.titulo] || [];
            const e = NT.evaluar({ fed: j.fed, sexo, partidas }, opciones);
            return { j, evaluados: e.titulos.filter((t) => !fuera.includes(t.titulo)), revisar: e.revisar };
        });
        pintarAvisos();
        pintarTabla();
        $("zona-detalle").classList.add("hidden");
    }

    const fallas = (t) => (t && t.mejor ? t.mejor.chequeos.filter((c) => !c.ok) : []);

    function pintarAvisos() {
        const ul = $("avisos");
        ul.replaceChildren();
        const js = datosCR.jugadores;
        if (js.length && js.every((j) => !j.fed)) ul.append(el("li", { "data-aviso": "sin-fed", texto: "chess-results no trae la federación de los jugadores en este torneo: el requisito de federaciones (1.4.3 y 1.4.4) no se puede revisar y sale como no cumplido." }));
        if (js.length && js.every((j) => !j.titulo)) ul.append(el("li", { "data-aviso": "sin-titulos", texto: "chess-results no trae el título de nadie en este torneo: el requisito de rivales con título (1.4.5) sale como no cumplido." }));
        const faltan = datosCR.faltantes || [];
        if (faltan.length) ul.append(el("li", { texto: "No se pudo leer la ficha de " + faltan.length + (faltan.length === 1 ? " jugador" : " jugadores") + " (número inicial " + faltan.join(", ") + "): sus partidas no cuentan para nadie. Vuelve a cargar en un rato." }));
        $("zona-avisos").classList.toggle("hidden", !ul.children.length);
    }

    function textoNorma(f) {
        const hechas = f.evaluados.filter((t) => t.norma);
        if (hechas.length) {
            // 1.4.1d: con puntos de más, la norma cuenta como más partidas para las 27.
            const valen = hechas.filter((t) => t.mejor.valeComo > 9).map((t) => "la de " + t.titulo + " vale " + t.mejor.valeComo + " partidas");
            return { clase: "norma", texto: "Norma de " + hechas.map((t) => t.titulo).join(" y de ") + (valen.length ? " (" + valen.join("; ") + ")" : "") };
        }
        const cerca = f.evaluados.filter((t) => fallas(t).length === 1);
        if (cerca.length) {
            const t = cerca[0], c = fallas(t)[0];
            return { clase: "cerca", texto: "Cerca de " + t.titulo + ": le faltó " + (c.art === "1.4.8" && t.mejor.faltan ? fmt(t.mejor.faltan) + " punto" + (t.mejor.faltan > 1 ? "s" : "") : "el art. " + c.art) };
        }
        return { clase: "", texto: "—" };
    }

    function pintarTabla() {
        const tb = $("r-filas");
        tb.replaceChildren();
        const orden = (f) => (f.evaluados.some((t) => t.norma) ? 0 : f.evaluados.some((t) => fallas(t).length === 1) ? 1 : 2);
        const lista = filas.slice().sort((a, b) => orden(a) - orden(b) || (a.j.puesto || 1e9) - (b.j.puesto || 1e9));
        lista.forEach((f) => {
            const n = textoNorma(f);
            const id = "p" + f.j.snr;
            tb.append(el("tr", { "data-id": id, "data-norma": n.clase || "no" },
                el("td", { class: TD, texto: f.j.puesto || "" }),
                el("td", { class: TD + " font-semibold", texto: f.j.nombre }),
                el("td", { class: TD, texto: f.j.titulo || "" }),
                el("td", { class: TD, texto: f.j.fed || "" }),
                el("td", { class: TD + " text-right", texto: f.j.eloFide || "—" }),
                el("td", { class: TD + (n.clase === "norma" ? " font-bold text-green-800 dark:text-green-300" : ""), "data-celda": "norma", texto: n.texto }),
                el("td", { class: TD }, f.evaluados.length ? el("button", {
                    type: "button", class: "text-xs font-semibold px-2 py-1 rounded-md border border-brand-300 dark:border-brand-600 hover:bg-brand-50 dark:hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
                    "aria-label": "Por qué, de " + f.j.nombre, onclick: () => detalle(f),
                }, "Por qué") : null)));
        });
        const normas = filas.flatMap((f) => f.evaluados.filter((t) => t.norma).map((t) => f.j.nombre + " (" + t.titulo + ")"));
        $("r-resumen").textContent = normas.length ? (normas.length === 1 ? "Una norma: " : normas.length + " normas: ") + normas.join(", ") + "." : "Nadie hizo norma en este torneo.";
        $("r-titulo").textContent = (datosCR.titulo || "") + (datosCR.rondasJugadas ? " · " + datosCR.rondasJugadas + " rondas" : "");
        $("zona-resultados").classList.remove("hidden");
    }

    function detalle(f) {
        $("t-detalle").textContent = f.j.nombre + (f.j.titulo ? " (" + f.j.titulo + ")" : "") + (f.j.fed ? " · " + f.j.fed : "");
        const c = $("d-contenido");
        c.replaceChildren();
        f.evaluados.forEach((t) => {
            const m = t.mejor;
            const caja = el("div", { "data-titulo": t.titulo, class: "rounded-xl border p-4 " + (t.norma ? "border-green-700 dark:border-green-400" : "border-brand-200 dark:border-brand-700") });
            caja.append(el("h3", { class: "font-semibold text-brand-800 dark:text-white" }, t.nombre + ": ", el("span", { texto: t.norma ? "norma" + (m.valeComo ? " (vale " + m.valeComo + " partidas para las 27)" : "") : "no" })));
            if (!m) { caja.append(el("p", { class: "text-sm mt-1", texto: "Sin partidas jugadas que revisar." })); c.append(caja); return; }
            if (m.ignoradas.length) caja.append(el("p", { class: "text-sm mt-1 text-brand-600 dark:text-brand-300", texto: "Sin contar " + m.ignoradas.map((i) => "la ronda " + i.ronda + " (" + i.por + ")").join(", ") + "." }));
            const ul = el("ul", { class: "mt-2 space-y-1 text-sm" });
            m.chequeos.forEach((ch) => ul.append(el("li", { "data-ok": ch.ok ? "si" : "no", class: ch.ok ? "" : "font-semibold text-red-800 dark:text-red-300" },
                el("span", { "aria-hidden": "true", texto: ch.ok ? "✓ " : "✗ " }), el("span", { class: "sr-only", texto: ch.ok ? "Cumple: " : "No cumple: " }), "Art. " + ch.art + ": " + ch.texto)));
            caja.append(ul);
            c.append(caja);
        });
        c.append(el("div", {}, el("p", { class: "text-sm font-semibold text-brand-800 dark:text-white", texto: "Y esto no se ve desde los resultados: revísalo tú." }),
            el("ul", { class: "list-disc pl-5 text-sm text-brand-600 dark:text-brand-300 mt-1 space-y-1" }, f.revisar.map((x) => el("li", { texto: x })))));
        const zona = $("zona-detalle");
        zona.classList.remove("hidden");
        zona.focus();
        zona.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }

    async function cargarYCalcular() {
        const url = $("c-url").value.trim();
        if (!url) { avisar("Pega el enlace de un torneo de chess-results.", true); return; }
        $("b-calcular").disabled = true;
        $("estado").textContent = "Leyendo chess-results… (un torneo grande puede tardar un minuto)";
        try {
            datosCR = await leerTorneo(url);
            $("estado").textContent = datosCR.viejo ? "Leído hace un rato: chess-results no contestó ahora, se muestra lo último que se guardó." : "Leído.";
            calcular();
        } catch (e) {
            $("estado").textContent = "";
            avisar(e.message || String(e), true);
        } finally {
            $("b-calcular").disabled = false;
        }
    }

    async function init() {
        const { data: { session } } = await sb.auth.getSession();
        $("loading").classList.add("hidden");
        if (!session) { location.href = "login.html?next=normas-titulo.html"; return; }
        const { data: puede, error } = await sb.rpc("tengo_herramienta", { p_herramienta: "normas-titulo" });
        if (error || puede !== true) { $("denegado").classList.remove("hidden"); return; }
        $("b-calcular").addEventListener("click", cargarYCalcular);
        $("c-todos").addEventListener("change", calcular);
        $("c-exento").addEventListener("change", calcular);
        $("app").classList.remove("hidden");
    }
    init();
})();
