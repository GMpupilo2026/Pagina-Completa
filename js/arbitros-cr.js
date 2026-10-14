/* El código de arbitros-cr.html: los árbitros de Costa Rica en FIDE.

   - Los datos están en tres tablas de la base que solo lee quien tiene la
     herramienta (RLS: tengo_herramienta('arbitros-cr')): arbitros_cr (cada
     árbitro), arbitros_cr_torneos (cada torneo, con la norma de AF y de AI
     ya evaluada por herramientas/normas_arbitro.py) y arbitros_cr_cargos
     (quién fue qué en cada torneo). Se llenan desde la base con lo leído de
     ratings.fide.com (herramientas/arbitros-cr.py).
   - La norma de un torneo vale para quien fue principal, adjunto o árbitro;
     el asistente no cuenta (B.06.1, 2.4.4) y el de pareos queda para revisar
     (el reglamento no lo nombra): eso se aplica acá, por cargo, en normaDe().
   - Los años y el título filtran la lista; el árbitro elegido va en la
     dirección (#ID) para compartirlo.

   Ver «Árbitros de Costa Rica en FIDE» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const numero = new Intl.NumberFormat("es-CR");
    const miles = (n) => numero.format(n);
    const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

    const CARGOS = { "Chief": "Árbitro principal", "Dep. Chief": "Árbitro adjunto principal", "Arbiter": "Árbitro", "Pairings": "Árbitro de pareos", "Assistant": "Árbitro asistente" };
    const CUENTAN = ["Chief", "Dep. Chief", "Arbiter"];
    const TITULOS = { IA: "Árbitro Internacional (IA)", FA: "Árbitro FIDE (FA)", AN: "Árbitro Nacional (AN)" };
    const SISTEMAS = { s: "Suizo", r: "Todos contra todos", d: "Doble todos contra todos", t: "Por equipos", k: "Eliminación directa" };
    const RITMOS = { Standard: "Clásico", Rapid: "Rápido", Blitz: "Blitz" };
    const ESTADOS = { si: "Vale", una: "Vale (una así)", opcion: "Vale una vez", revisar: "Revisar", no: "No" };
    const VALE = ["si", "una", "opcion"];
    const ORDEN = { si: 0, una: 1, opcion: 2, revisar: 3, no: 4 };

    let arbitros = [], torneos = new Map(), PRIMER = 0, ULTIMO = 0;
    const estado = { q: "", titulo: "", desde: 0, hasta: 0, orden: { col: "torneos", dir: -1 }, normaAf: "", normaAi: "", elegido: null };

    // «AAAA-MM-DD» a «DD/MM/AAAA» sin pasar por Date.
    function fecha(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
        return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
    }

    function el(tag, attrs, ...hijos) {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (k === "class") n.className = v; else n.setAttribute(k, v);
        }
        for (const h of hijos) if (h != null) n.append(h instanceof Node ? h : String(h));
        return n;
    }

    /* La norma de un torneo para alguien según su(s) cargo(s) en él. */
    function normaDe(t, cargos, cual) {
        const n = { estado: t[cual + "_estado"], detalle: t[cual + "_detalle"] };
        if (cargos.some((c) => CUENTAN.includes(c))) return n;
        if (cargos.includes("Pairings")) {
            return n.estado === "no" ? n : { estado: "revisar", detalle: "Figura como árbitro de pareos, que el reglamento no nombra: revisar. Si contara: " + n.detalle };
        }
        return { estado: "no", detalle: "Figura como árbitro asistente, que no cuenta para una norma (2.4.4)." };
    }

    async function leerTodo(tabla, columnas, orden) {
        const filas = [];
        for (let desde = 0; ; desde += 1000) {
            const { data, error } = await sb.from(tabla).select(columnas).order(orden).range(desde, desde + 999);
            if (error) throw error;
            filas.push(...data);
            if (data.length < 1000) return filas;
        }
    }

    function preparar(filasArb, filasTor, filasCar) {
        for (const t of filasTor) { t.anio = parseInt(t.inicio.slice(0, 4), 10); torneos.set(t.id, t); }
        const porArbitro = new Map();
        for (const c of filasCar) {
            const m = porArbitro.get(c.fide_id) || new Map();
            m.set(c.torneo_id, (m.get(c.torneo_id) || []).concat(c.cargo));
            porArbitro.set(c.fide_id, m);
        }
        arbitros = filasArb.map((a) => ({ ...a, busca: sinTildes(a.nombre) + " " + a.fide_id, torneos: porArbitro.get(a.fide_id) || new Map() }));
        const anios = filasTor.map((t) => t.anio);
        PRIMER = Math.min(...anios); ULTIMO = Math.max(...anios);
    }

    // Los torneos de un árbitro dentro de los años elegidos, con su norma por cargo.
    function torneosDe(a) {
        const lista = [];
        for (const [id, cargos] of a.torneos) {
            const t = torneos.get(id);
            if (!t || t.anio < estado.desde || t.anio > estado.hasta) continue;
            lista.push({ t, cargos, af: normaDe(t, cargos, "af"), ai: normaDe(t, cargos, "ai") });
        }
        return lista.sort((x, y) => (y.t.inicio + y.t.id).localeCompare(x.t.inicio + x.t.id));
    }

    function resumen(a) {
        const l = torneosDe(a);
        const cuenta = (f) => l.filter(f).length;
        return {
            a, torneos: l.length,
            principal: cuenta((x) => x.cargos.includes("Chief")),
            adjunto: cuenta((x) => x.cargos.includes("Dep. Chief")),
            arbitro: cuenta((x) => x.cargos.includes("Arbiter")),
            af: cuenta((x) => x.af.estado !== "no"), afRevisar: cuenta((x) => x.af.estado === "revisar"),
            ai: cuenta((x) => x.ai.estado !== "no"), aiRevisar: cuenta((x) => x.ai.estado === "revisar"),
            ultimo: l.length ? l[0].t.inicio : "",
        };
    }

    function pintarGeneral() {
        const q = sinTildes(estado.q.trim());
        const filas = arbitros
            .filter((a) => (!q || a.busca.includes(q)) && (!estado.titulo || (estado.titulo === "-" ? !a.titulo : a.titulo === estado.titulo)))
            .map(resumen).filter((r) => r.torneos > 0);
        const { col, dir } = estado.orden;
        const valor = (r) => col === "nombre" ? r.a.nombre : col === "titulo" ? (r.a.titulo || "~") : r[col];
        filas.sort((x, y) => {
            const a = valor(x), b = valor(y);
            const c = typeof a === "number" ? a - b : String(a).localeCompare(String(b), "es");
            return c * dir || x.a.nombre.localeCompare(y.a.nombre, "es");
        });
        const conRev = (n, r) => miles(n) + (r ? " (" + miles(r) + ")" : "");
        $("tabla-arbitros").tBodies[0].replaceChildren(...filas.map((r) => {
            const boton = el("button", { type: "button", class: "font-semibold underline underline-offset-2 hover:no-underline text-left" }, r.a.nombre);
            boton.addEventListener("click", () => elegir(r.a.fide_id));
            const td = (v, der) => el("td", { class: "px-3 py-2" + (der ? " text-right tabular-nums" : "") }, v);
            return el("tr", { class: "border-t border-brand-100 dark:border-brand-800" },
                el("th", { scope: "row", class: "px-3 py-2 font-normal" }, boton),
                td(r.a.titulo || "—"), td(miles(r.torneos), true), td(miles(r.principal), true), td(miles(r.adjunto), true), td(miles(r.arbitro), true),
                td(conRev(r.af, r.afRevisar), true), td(conRev(r.ai, r.aiRevisar), true), td(fecha(r.ultimo)));
        }));
        for (const th of $("tabla-arbitros").tHead.rows[0].cells) {
            const c = th.querySelector("button").dataset.col;
            th.setAttribute("aria-sort", c === col ? (dir < 0 ? "descending" : "ascending") : "none");
        }
        const torneosVistos = new Set(filas.flatMap((r) => torneosDe(r.a).map((x) => x.t.id)));
        $("cuenta").textContent = filas.length
            ? `${miles(filas.length)} árbitros con ${miles(torneosVistos.size)} torneos en FIDE de ${estado.desde} a ${estado.hasta}.`
            : "Ningún árbitro cumple con estos filtros.";
    }

    const FILTRO_NORMA = { vale: VALE, revisar: ["revisar"], no: ["no"] };

    function norma(n) {
        return el("div", {}, el("strong", { class: "of-estado", "data-estado": n.estado }, ESTADOS[n.estado]), el("span", { class: "of-detalle" }, n.detalle));
    }

    function filasFicha(a) {
        return torneosDe(a).filter((x) => (!estado.normaAf || FILTRO_NORMA[estado.normaAf].includes(x.af.estado))
            && (!estado.normaAi || FILTRO_NORMA[estado.normaAi].includes(x.ai.estado)));
    }

    function pintarFicha() {
        const a = arbitros.find((x) => x.fide_id === estado.elegido);
        if (!a) { elegir(null); return; }
        const r = resumen(a);
        $("ficha-titulo").textContent = a.nombre;
        $("ficha-sub").replaceChildren(
            (a.titulo ? TITULOS[a.titulo] + (a.titulo_detalle ? " (" + a.titulo_detalle + ")" : "") + " · " : ""),
            "ID FIDE ",
            el("a", { href: "https://ratings.fide.com/profile/" + a.fide_id, target: "_blank", rel: "noopener", class: "underline underline-offset-2 hover:no-underline" }, String(a.fide_id)),
            ` · ${miles(r.torneos)} torneos de ${estado.desde} a ${estado.hasta}: valen para AF ${miles(r.af)}, para AI ${miles(r.ai)}.`);
        const lista = filasFicha(a);
        $("tabla-torneos").tBodies[0].replaceChildren(...lista.map((x) => {
            const t = x.t;
            const nombre = el("div", {},
                el("a", { href: "https://ratings.fide.com/tournament_information.phtml?event=" + t.id, target: "_blank", rel: "noopener", class: "underline underline-offset-2 hover:no-underline" }, t.nombre),
                el("span", { class: "of-detalle" }, [t.ciudad, t.pais].filter(Boolean).join(", ") + (t.valorado ? " · valorado en " + t.valorado : "")));
            const td = (v, der) => el("td", { class: "px-3 py-2 align-top" + (der ? " text-right tabular-nums" : "") }, v);
            return el("tr", { class: "border-t border-brand-100 dark:border-brand-800" },
                td(fecha(t.inicio)), el("th", { scope: "row", class: "px-3 py-2 align-top font-normal" }, nombre),
                td(x.cargos.map((c) => CARGOS[c] || c).join(", ")),
                td((RITMOS[t.ritmo] || "—") + " · " + (SISTEMAS[t.sistema] || "—")),
                td(miles(t.contados) + (t.contados !== t.con_elo ? " de " + miles(t.con_elo) : ""), true),
                td(t.rondas ? miles(t.rondas) : "—", true), td(miles(t.federaciones), true),
                td(norma(x.af)), td(norma(x.ai)));
        }));
        $("ficha-cuenta").textContent = lista.length ? miles(lista.length) + (lista.length === 1 ? " torneo." : " torneos.") + " «Con Elo» cuenta a quien no faltó a más de una ronda." : "Ningún torneo cumple con estos filtros.";
    }

    function excel() {
        const a = arbitros.find((x) => x.fide_id === estado.elegido);
        if (!a) return;
        const filas = [["Inicio", "Torneo", "Ciudad", "País", "Cargo", "Ritmo", "Sistema", "Jugadores", "Con Elo que cuentan", "Rondas", "Federaciones", "Norma de AF", "Por qué (AF)", "Norma de AI", "Por qué (AI)", "FIDE"]]
            .concat(filasFicha(a).map((x) => [x.t.inicio, x.t.nombre, x.t.ciudad, x.t.pais, x.cargos.map((c) => CARGOS[c] || c).join(", "),
                RITMOS[x.t.ritmo] || "", SISTEMAS[x.t.sistema] || "", x.t.jugadores, x.t.contados, x.t.rondas || "", x.t.federaciones,
                ESTADOS[x.af.estado], x.af.detalle, ESTADOS[x.ai.estado], x.ai.detalle, "https://ratings.fide.com/tournament_information.phtml?event=" + x.t.id]));
        window.TablaExcel.bajar("arbitro-" + a.fide_id + "-fide.xlsx", [{ nombre: "Torneos FIDE", filas }]);
    }

    function elegir(id) {
        estado.elegido = id;
        history.replaceState(null, "", location.pathname + location.search + (id ? "#" + id : ""));
        $("general").classList.toggle("hidden", !!id);
        $("ficha").classList.toggle("hidden", !id);
        $("volver").classList.toggle("hidden", !id);
        if (id) { pintarFicha(); $("ficha-titulo").setAttribute("tabindex", "-1"); $("ficha-titulo").focus(); } else pintarGeneral();
    }

    function pintar() { if (estado.elegido) pintarFicha(); else pintarGeneral(); }

    function armarControles() {
        const anios = []; for (let y = PRIMER; y <= ULTIMO; y++) anios.push(el("option", { value: String(y) }, String(y)));
        $("desde").replaceChildren(...anios.map((o) => o.cloneNode(true)));
        $("hasta").replaceChildren(...anios);
        $("desde").value = String(estado.desde); $("hasta").value = String(estado.hasta);
        let espera = null;
        $("buscar").addEventListener("input", (e) => { clearTimeout(espera); espera = setTimeout(() => { estado.q = e.target.value; if (estado.elegido) elegir(null); else pintar(); }, 200); });
        $("titulo").addEventListener("change", (e) => { estado.titulo = e.target.value; pintar(); });
        $("desde").addEventListener("change", (e) => { estado.desde = +e.target.value; if (estado.hasta < estado.desde) { estado.hasta = estado.desde; $("hasta").value = e.target.value; } pintar(); });
        $("hasta").addEventListener("change", (e) => { estado.hasta = +e.target.value; if (estado.desde > estado.hasta) { estado.desde = estado.hasta; $("desde").value = e.target.value; } pintar(); });
        $("norma-af").addEventListener("change", (e) => { estado.normaAf = e.target.value; pintarFicha(); });
        $("norma-ai").addEventListener("change", (e) => { estado.normaAi = e.target.value; pintarFicha(); });
        $("volver").addEventListener("click", () => elegir(null));
        $("excel").addEventListener("click", excel);
        for (const b of $("tabla-arbitros").tHead.querySelectorAll("button")) {
            b.addEventListener("click", () => {
                const col = b.dataset.col;
                estado.orden = { col, dir: estado.orden.col === col ? -estado.orden.dir : (col === "nombre" || col === "titulo" ? 1 : -1) };
                pintarGeneral();
            });
        }
    }

    async function init() {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { location.href = "login.html?next=arbitros-cr.html"; return; }
        const { data: puede, error } = await sb.rpc("tengo_herramienta", { p_herramienta: "arbitros-cr" });
        if (error || puede !== true) { $("loading").classList.add("hidden"); $("denegado").classList.remove("hidden"); return; }
        try {
            const [a, t, c] = await Promise.all([
                leerTodo("arbitros_cr", "fide_id,nombre,titulo,titulo_detalle", "fide_id"),
                leerTodo("arbitros_cr_torneos", "id,nombre,ciudad,pais,inicio,fin,sistema,ritmo,jugadores,con_elo,contados,rondas,federaciones,valorado,af_estado,af_detalle,ai_estado,ai_detalle", "id"),
                leerTodo("arbitros_cr_cargos", "torneo_id,fide_id,cargo", "torneo_id"),
            ]);
            preparar(a, t, c);
        } catch (e) {
            $("loading").classList.add("hidden"); $("app").classList.remove("hidden");
            $("error").textContent = "No se pudieron leer los datos: " + (e.message || e) + ". Vuelve a cargar la página en un rato.";
            $("error").classList.remove("hidden");
            return;
        }
        estado.desde = PRIMER; estado.hasta = ULTIMO;
        armarControles();
        $("loading").classList.add("hidden"); $("app").classList.remove("hidden");
        const h = parseInt(decodeURIComponent((location.hash || "").slice(1)), 10);
        if (h && arbitros.some((a) => a.fide_id === h)) elegir(h); else pintarGeneral();
    }

    init();
})();
