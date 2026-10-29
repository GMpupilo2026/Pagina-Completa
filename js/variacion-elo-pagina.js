/* El código de variacion-elo.html: «Variación de Elo del torneo».

   Lee el torneo con la Edge Function desempates-chess-results (la misma de
   «Desempates explicados», pidiendo la licencia de «variacion-elo»), lo
   convierte con js/desempates-convertir.js y calcula el Elo que gana o
   pierde cada uno con js/pareo/elo.js, el MISMO cálculo de Pareo Integral
   (reglas de FIDE, B.02): una vez con el Elo FIDE de cada uno y otra con el
   nacional. Al lado va el «FIDE elo +/-» que trae la ficha de chess-results,
   para comparar: si no coinciden, casi siempre es el K de un jugador nuevo,
   que desde chess-results no se ve.

   EL AVISO DE PUNTAJES NUNCA SE OCULTA (igual que en Desempates): si el
   puntaje reconstruido de alguien no coincide con el oficial, falta una
   ronda y su número no es de fiar. Ver «Variación de Elo del torneo» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const Cv = window.DesempatesConvertir;
    const E = window.PareoElo;
    const $ = (id) => document.getElementById(id);

    let datosCR = null;
    let calculo = null; // { conv, fide: Map, nac: Map, porId: Map }

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
    const num = (x, d) => Number(x).toLocaleString("es-CR", { maximumFractionDigits: d == null ? 2 : d });
    const cambio = (x) => (x == null ? "—" : E.textoCambio(x, "es"));
    const TD = "px-3 py-2 border-t border-brand-100 dark:border-brand-800";
    const anioHoy = () => Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }).slice(0, 4));

    async function leerTorneo(url) {
        let { data, error } = await sb.functions.invoke("desempates-chess-results", { body: { url, herramienta: "variacion-elo" } });
        if (error && error.context && typeof error.context.json === "function") {
            try { data = await error.context.json(); } catch (e) { /* sin cuerpo */ }
        }
        if (!data || data.error) throw new Error((data && data.error) || (error && error.message) || "chess-results no contestó");
        return data;
    }

    /* El torneo de Pareo con el Elo que toque (FIDE o nacional) y el año de
       nacimiento de cada uno, para el K. */
    function conElo(conv, cual, anio) {
        const porSnr = new Map(datosCR.jugadores.map((j) => [Cv.idDe(j.snr), j]));
        const t = JSON.parse(JSON.stringify(conv.t));
        t.fechaInicio = anio + "-01-01";
        t.jugadores.forEach((j) => {
            const cr = porSnr.get(j.id) || {};
            j.elo = (cual === "fide" ? cr.eloFide : cr.eloNacional) || 0;
            j.nacimiento = cr.nacimiento ? String(cr.nacimiento) : "";
        });
        return t;
    }

    /* El K que usó chess-results, si se puede deducir: su cambio dividido
       entre (puntos − esperado). Solo si da 10, 20 o 40. */
    function kDeChessResults(x, cr) {
        if (!x || cr == null || !x.partidas) return null;
        const d = x.puntos - x.esperado;
        if (Math.abs(d) < 0.05) return null;
        const k = cr / d;
        const cerca = [10, 20, 40].find((v) => Math.abs(k - v) <= v * 0.06);
        return cerca || null;
    }

    function calcular() {
        if (!datosCR) return;
        const anio = Number($("c-anio").value) || anioHoy();
        const conv = Cv.convertir(datosCR, { todos: false });
        calculo = {
            conv,
            fide: E.calcular(conElo(conv, "fide", anio)),
            nac: E.calcular(conElo(conv, "nac", anio)),
            porId: new Map(datosCR.jugadores.map((j) => [Cv.idDe(j.snr), j])),
        };
        pintarAvisos();
        pintarTabla();
        $("zona-detalle").classList.add("hidden");
    }

    function pintarAvisos() {
        const adv = calculo.conv.advertencias || [];
        const faltan = datosCR.faltantes || [];
        const ul = $("avisos");
        ul.replaceChildren();
        adv.forEach((a) => ul.append(el("li", { texto: a.nombre + ": el puntaje oficial es " + num(a.oficial) + " y desde sus partidas salen " + num(a.calculado) + ". Falta leer alguna ronda: su variación no es de fiar." })));
        // chess-results no le da variación FIDE a nadie (vacía o 0 para todos,
        // con gente con Elo FIDE que jugó): casi seguro el torneo no es válido
        // para Elo FIDE. Se dice; los números FIDE quedan, como «si lo fuera».
        const conFide = datosCR.jugadores.filter((j) => j.eloFide && j.partidas.some((p) => p.puntos != null && !p.bye));
        if (conFide.length >= 2 && datosCR.jugadores.every((j) => j.cambioFide == null || j.cambioFide === 0)) {
            ul.append(el("li", { "data-aviso": "sin-fide", texto: "chess-results no le da variación de Elo FIDE a nadie en este torneo: lo más probable es que no sea válido para Elo FIDE (lo dice el «Cálculo de elo» de su ficha). Los números FIDE de abajo son los que tendría si lo fuera." }));
        }
        if (faltan.length) ul.append(el("li", { texto: "No se pudo leer la ficha de " + faltan.length + (faltan.length === 1 ? " jugador" : " jugadores") + " en chess-results (número inicial " + faltan.join(", ") + "): sus partidas no cuentan para nadie. Vuelve a cargar en un rato." }));
        $("zona-avisos").classList.toggle("hidden", !ul.children.length);
    }

    function pintarTabla() {
        const tb = $("r-filas");
        tb.replaceChildren();
        const lista = datosCR.jugadores.slice().sort((a, b) => (a.puesto || 1e9) - (b.puesto || 1e9));
        lista.forEach((j) => {
            const id = Cv.idDe(j.snr);
            const f = calculo.fide.get(id), n = calculo.nac.get(id);
            const kCr = kDeChessResults(f, j.cambioFide);
            const difiere = f && f.cambio != null && j.cambioFide != null && Math.abs(f.cambio - j.cambioFide) > 0.15;
            const tr = el("tr", { "data-id": id },
                el("td", { class: TD, texto: j.puesto || "" }),
                el("td", { class: TD + " font-semibold", texto: j.nombre }),
                el("td", { class: TD + " text-right", texto: j.eloFide || "—" }),
                el("td", { class: TD + " text-right", "data-elo": "k", texto: f && f.k ? f.k : "—" }),
                el("td", { class: TD + " text-right font-semibold", "data-elo": "fide", texto: f && f.partidas ? cambio(f.cambio) : "—" }),
                el("td", { class: TD + " text-right", "data-elo": "cr" },
                    j.cambioFide == null ? "—" : cambio(j.cambioFide),
                    difiere ? el("span", { class: "block text-xs text-brand-500 dark:text-brand-300", texto: kCr ? "con K " + kCr : "otro K o partidas" }) : null),
                el("td", { class: TD + " text-right", texto: j.eloNacional || "—" }),
                el("td", { class: TD + " text-right font-semibold", "data-elo": "nac", texto: n && n.partidas ? cambio(n.cambio) : "—" }),
                el("td", { class: TD + " text-right", texto: f && f.rp ? f.rp : n && n.rp ? n.rp : "—" }),
                el("td", { class: TD }, el("button", {
                    type: "button", class: "text-xs font-semibold px-2 py-1 rounded-md border border-brand-300 dark:border-brand-600 hover:bg-brand-50 dark:hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
                    "aria-label": "Partida por partida de " + j.nombre, onclick: () => detalle(id),
                }, "Partida por partida")));
            tb.append(tr);
        });
        $("r-titulo").textContent = (datosCR.titulo || "") + (datosCR.rondasJugadas ? " · " + datosCR.rondasJugadas + " rondas" : "");
        $("zona-resultados").classList.remove("hidden");
    }

    function tablaJuegos(x, cual) {
        if (!x || !x.elo) return el("p", { class: "text-sm text-brand-500 dark:text-brand-300", texto: "Sin Elo " + cual + ": no gana ni pierde puntos en este torneo (su primer Elo se calcula aparte)." });
        if (!x.partidas) return el("p", { class: "text-sm text-brand-500 dark:text-brand-300", texto: "Ninguna partida jugada contra alguien con Elo " + cual + ": no cambia." });
        const nombres = calculo.conv.nombres;
        const filas = x.juegos.map((g) => el("tr", {},
            el("td", { class: TD, texto: g.ronda }),
            el("td", { class: TD, texto: nombres[g.rival] || "" }),
            el("td", { class: TD + " text-right", texto: g.eloRival }),
            el("td", { class: TD + " text-right", texto: (g.dif > 0 ? "+" : "") + g.dif + (Math.abs(x.elo - g.eloRival) > 400 ? " (tope)" : "") }),
            el("td", { class: TD + " text-right", texto: num(g.esperado) }),
            el("td", { class: TD + " text-right", texto: g.puntos === 0.5 ? "½" : String(g.puntos) }),
            el("td", { class: TD + " text-right", texto: cambio(Math.round(x.k * (g.puntos - g.esperado) * 10) / 10) })));
        return el("div", {},
            el("div", { class: "relative overflow-x-auto" }, el("table", { class: "w-full text-sm" },
                el("caption", { class: "sr-only", texto: "Partidas que cuentan para el Elo " + cual }),
                el("thead", { class: "text-left text-xs uppercase tracking-wide text-brand-500 dark:text-brand-300" }, el("tr", {},
                    ["Ronda", "Rival", "Su Elo", "Diferencia", "Esperado", "Resultado", "±"].map((h, i) => el("th", { scope: "col", class: "px-3 py-2" + (i > 1 ? " text-right" : ""), texto: h })))),
                el("tbody", {}, filas))),
            el("p", { class: "text-sm mt-2" }, "Suma: " + num(x.puntos) + " de " + x.partidas + " contra " + num(x.esperado) + " esperado. K " + x.k + " × (" + num(x.puntos) + " − " + num(x.esperado) + ") = ",
                el("strong", { texto: cambio(x.cambio) }), x.rp ? ". Rendimiento (Rp): " + x.rp + ", con rivales de " + x.rivales + " de promedio." : "."));
    }

    function detalle(id) {
        const j = calculo.porId.get(id);
        $("t-detalle").textContent = j.nombre + (j.fideId ? " · FIDE " + j.fideId : "") + (j.nacimiento ? " · nació en " + j.nacimiento : "");
        const c = $("d-contenido");
        c.replaceChildren(
            el("div", {}, el("h3", { class: "font-semibold text-brand-800 dark:text-white", texto: "Elo FIDE" }), tablaJuegos(calculo.fide.get(id), "FIDE"),
                j.cambioFide != null ? el("p", { class: "text-xs text-brand-500 dark:text-brand-300 mt-1", texto: "En su ficha de chess-results: " + cambio(j.cambioFide) + "." }) : null),
            el("div", {}, el("h3", { class: "font-semibold text-brand-800 dark:text-white", texto: "Elo nacional" }), tablaJuegos(calculo.nac.get(id), "nacional")));
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
        if (!session) { location.href = "login.html?next=variacion-elo.html"; return; }
        const { data: puede, error } = await sb.rpc("tengo_herramienta", { p_herramienta: "variacion-elo" });
        if (error || puede !== true) { $("denegado").classList.remove("hidden"); return; }
        $("c-anio").value = String(anioHoy());
        $("b-calcular").addEventListener("click", cargarYCalcular);
        $("c-anio").addEventListener("change", calcular);
        $("app").classList.remove("hidden");
    }
    init();
})();
