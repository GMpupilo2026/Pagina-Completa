/* El código de arbitros-cr.html: los árbitros de Costa Rica, en FIDE y en
   chess-results.

   - Los datos están en tablas de la base que solo lee quien tiene la
     herramienta (RLS: tengo_herramienta('arbitros-cr')): arbitros_cr (cada
     árbitro), arbitros_cr_torneos (cada torneo de FIDE, con la norma de AF y
     de AI ya evaluada por herramientas/normas_arbitro.py), arbitros_cr_cargos
     (quién fue qué en cada uno), arbitros_cr_cr (los torneos de la
     federación en chess-results; fide_torneo dice cuál de FIDE es el mismo)
     y arbitros_cr_cr_cargos (principal, adjunto, árbitro, director,
     organizador). Las llena herramientas/arbitros-cr.py.
   - Cada torneo sale UNA vez: el de chess-results que es el mismo que uno
     de FIDE se junta con él (los dos enlaces, los cargos de los dos lados).
     «FIDE» es todo torneo que FIDE valoró; «No FIDE», los que solo están en
     chess-results. Los de prueba o sin rondas o jugadores no se muestran.
   - La norma de un torneo vale para quien fue principal, adjunto o árbitro
     en la ficha de FIDE; el asistente no cuenta (B.06.1, 2.4.4), el de
     pareos queda para revisar (el reglamento no lo nombra) y quien figura
     solo en chess-results, también para revisar: eso se aplica acá, en
     normaDe().
   - Los años, el título y el tipo filtran la lista; el árbitro elegido va
     en la dirección (#ID) para compartirlo.

   Ver «Árbitros de Costa Rica en FIDE», «Árbitros de Costa Rica en
   chess-results» y «El mismo torneo en FIDE y en chess-results» en
   docs/decisiones/juegos-y-torneos.md. */
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
    const ROLES_CR = { ap: "Árbitro principal", adj: "Árbitro adjunto principal", arb: "Árbitro", dir: "Director del torneo", org: "Organizador" };
    // El rol de chess-results que es el mismo cargo de FIDE.
    const ROL_A_CARGO = { ap: "Chief", adj: "Dep. Chief", arb: "Arbiter" };
    const SIN_NORMA = { estado: "", detalle: "" };

    let arbitros = [], torneos = new Map(), torneosCr = new Map(), crDeFide = new Map(), PRIMER = 0, ULTIMO = 0;
    const estado = { q: "", titulo: "", tipo: "", desde: 0, hasta: 0, orden: { col: "torneos", dir: -1 }, normaAf: "", normaAi: "", elegido: null };

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

    // Un torneo de chess-results de prueba o que no se jugó (la base ya no
    // los guarda; esto es por si queda alguno).
    const esBasura = (t) => !t.rondas || !t.jugadores || /\b(prueba|pruebas|test|testing)\b/.test(sinTildes(t.nombre));

    /* La norma de un torneo de FIDE para alguien según su cargo en la ficha
       de FIDE y su rol en chess-results. */
    function normaDe(t, cargos, roles, cual) {
        const n = { estado: t[cual + "_estado"], detalle: t[cual + "_detalle"] };
        if (cargos.some((c) => CUENTAN.includes(c))) return n;
        if (cargos.includes("Pairings")) {
            return n.estado === "no" ? n : { estado: "revisar", detalle: "Figura como árbitro de pareos, que el reglamento no nombra: revisar. Si contara: " + n.detalle };
        }
        if (cargos.includes("Assistant")) return { estado: "no", detalle: "Figura como árbitro asistente, que no cuenta para una norma (2.4.4)." };
        if (roles.some((r) => ROL_A_CARGO[r])) {
            return n.estado === "no" ? n : { estado: "revisar", detalle: "En la ficha de FIDE no figura como árbitro; sí en chess-results: revisar. Si contara: " + n.detalle };
        }
        return { estado: "no", detalle: "Figura como director u organizador, no como árbitro." };
    }

    // De mil en mil, ordenado por la clave completa: con un orden que se
    // repite, una fila puede caer en dos páginas o en ninguna.
    async function leerTodo(tabla, columnas, orden) {
        const filas = [];
        for (let desde = 0; ; desde += 1000) {
            let q = sb.from(tabla).select(columnas);
            for (const c of orden.split(",")) q = q.order(c);
            const { data, error } = await q.range(desde, desde + 999);
            if (error) throw error;
            filas.push(...data);
            if (data.length < 1000) return filas;
        }
    }

    // De cada árbitro, un Map torneo → sus cargos (o roles) en él.
    function porArbitro(filas, clave, valor) {
        const m = new Map();
        for (const c of filas) {
            const d = m.get(c.fide_id) || new Map();
            d.set(c[clave], (d.get(c[clave]) || []).concat(c[valor]));
            m.set(c.fide_id, d);
        }
        return m;
    }

    /* Los torneos de un árbitro, cada uno una vez: los de FIDE (con el de
       chess-results que es el mismo, si hay) y los que solo están en
       chess-results. */
    function torneosDelArbitro(cargosFide, rolesCr) {
        const lista = new Map();   // "f<id>" o "c<clave>" → entrada
        const entrada = (t) => ({ t, cargos: [], roles: [], cr: null });
        for (const [id, cargos] of cargosFide) {
            const t = torneos.get(id);
            if (!t) continue;
            const e = lista.get("f" + id) || entrada(t);
            e.cargos = cargos;
            lista.set("f" + id, e);
        }
        for (const [clave, roles] of rolesCr) {
            const c = torneosCr.get(clave);
            if (!c || esBasura(c)) continue;
            const f = c.fide_torneo ? torneos.get(c.fide_torneo) : null;
            const k = f ? "f" + f.id : "c" + clave;
            const e = lista.get(k) || (f ? entrada(f) : { t: null, cargos: [], roles: [], cr: null });
            e.cr = c; e.roles = roles;
            lista.set(k, e);
        }
        // El torneo de FIDE lleva su enlace a chess-results aunque la
        // persona no figure ahí: es el mismo torneo.
        for (const e of lista.values()) if (e.t && !e.cr) e.cr = crDeFide.get(e.t.id) || null;
        return [...lista.values()].map((e) => {
            const fide = !!e.t;
            const inicio = fide ? e.t.inicio : e.cr.inicio;
            return { ...e, fide, inicio, anio: parseInt(inicio.slice(0, 4), 10), clave: fide ? "f" + e.t.id : "c" + e.cr.clave,
                af: fide ? normaDe(e.t, e.cargos, e.roles, "af") : SIN_NORMA, ai: fide ? normaDe(e.t, e.cargos, e.roles, "ai") : SIN_NORMA };
        });
    }

    function preparar(filasArb, filasTor, filasCar, filasCr, filasCrCar) {
        for (const t of filasTor) torneos.set(t.id, t);
        for (const t of filasCr) {
            torneosCr.set(t.clave, t);
            if (t.fide_torneo && !esBasura(t)) crDeFide.set(t.fide_torneo, t);
        }
        const fide = porArbitro(filasCar, "torneo_id", "cargo"), cr = porArbitro(filasCrCar, "clave", "rol");
        arbitros = filasArb.map((a) => ({ ...a, busca: sinTildes(a.nombre) + " " + a.fide_id,
            todos: torneosDelArbitro(fide.get(a.fide_id) || new Map(), cr.get(a.fide_id) || new Map()) }));
        const anios = arbitros.flatMap((a) => a.todos.map((x) => x.anio));
        PRIMER = Math.min(...anios); ULTIMO = Math.max(...anios);
    }

    // Sus torneos dentro de los años y del tipo elegidos, el más nuevo primero.
    function torneosDe(a) {
        return a.todos.filter((x) => x.anio >= estado.desde && x.anio <= estado.hasta
            && (!estado.tipo || (estado.tipo === "fide") === x.fide))
            .sort((x, y) => (y.inicio + y.clave).localeCompare(x.inicio + x.clave));
    }

    // Lo que hizo en un torneo, en palabras: el cargo de FIDE y, si no lo
    // dice ya, su rol en chess-results.
    function cargoEscrito(x) {
        const dichos = new Set(x.cargos.map((c) => CARGOS[c] || c));
        for (const r of x.roles) if (!(ROL_A_CARGO[r] && x.cargos.length)) dichos.add(ROLES_CR[r] || r);
        return [...dichos].join(", ");
    }
    const fue = (x, cargo, rol) => x.cargos.includes(cargo) || x.roles.includes(rol);

    function resumen(a) {
        const l = torneosDe(a);
        const cuenta = (f) => l.filter(f).length;
        return {
            a, torneos: l.length, fide: cuenta((x) => x.fide), nofide: cuenta((x) => !x.fide),
            principal: cuenta((x) => fue(x, "Chief", "ap")),
            adjunto: cuenta((x) => fue(x, "Dep. Chief", "adj")),
            arbitro: cuenta((x) => fue(x, "Arbiter", "arb")),
            af: cuenta((x) => x.fide && x.af.estado !== "no"), afRevisar: cuenta((x) => x.af.estado === "revisar"),
            ai: cuenta((x) => x.fide && x.ai.estado !== "no"), aiRevisar: cuenta((x) => x.ai.estado === "revisar"),
            ultimo: l.length ? l[0].inicio : "",
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
                td(r.a.titulo || "—"), td(miles(r.torneos), true), td(miles(r.fide), true), td(miles(r.nofide), true),
                td(miles(r.principal), true), td(miles(r.adjunto), true), td(miles(r.arbitro), true),
                td(conRev(r.af, r.afRevisar), true), td(conRev(r.ai, r.aiRevisar), true), td(fecha(r.ultimo)));
        }));
        for (const th of $("tabla-arbitros").tHead.rows[0].cells) {
            const c = th.querySelector("button").dataset.col;
            th.setAttribute("aria-sort", c === col ? (dir < 0 ? "descending" : "ascending") : "none");
        }
        const vistos = new Set(filas.flatMap((r) => torneosDe(r.a).map((x) => x.clave)));
        const fideVistos = [...vistos].filter((k) => k[0] === "f").length;
        $("cuenta").textContent = filas.length
            ? `${miles(filas.length)} árbitros con ${miles(vistos.size)} torneos (${miles(fideVistos)} de FIDE y ${miles(vistos.size - fideVistos)} que no) de ${estado.desde} a ${estado.hasta}.`
            : "Ningún árbitro cumple con estos filtros.";
    }

    const FILTRO_NORMA = { vale: VALE, revisar: ["revisar"], no: ["no"] };

    function norma(n) {
        if (!n.estado) return "—";
        return el("div", {}, el("strong", { class: "of-estado", "data-estado": n.estado }, ESTADOS[n.estado]), el("span", { class: "of-detalle" }, n.detalle));
    }

    // Con un filtro de norma puesto, solo quedan torneos de FIDE (los otros no tienen norma).
    function filasFicha(a) {
        return torneosDe(a).filter((x) => (!estado.normaAf || (x.fide && FILTRO_NORMA[estado.normaAf].includes(x.af.estado)))
            && (!estado.normaAi || (x.fide && FILTRO_NORMA[estado.normaAi].includes(x.ai.estado))));
    }

    const urlFide = (t) => "https://ratings.fide.com/tournament_information.phtml?event=" + t.id;
    const urlCr = (c) => "https://chess-results.com/tnr" + c.clave + ".aspx?lan=2";
    const enlace = (href, texto) => el("a", { href, target: "_blank", rel: "noopener", class: "underline underline-offset-2 hover:no-underline" }, texto);

    function pintarFicha() {
        const a = arbitros.find((x) => x.fide_id === estado.elegido);
        if (!a) { elegir(null); return; }
        const r = resumen(a);
        $("ficha-titulo").textContent = a.nombre;
        $("ficha-sub").replaceChildren(
            (a.titulo ? TITULOS[a.titulo] + (a.titulo_detalle ? " (" + a.titulo_detalle + ")" : "") + " · " : ""),
            "ID FIDE ",
            enlace("https://ratings.fide.com/profile/" + a.fide_id, String(a.fide_id)),
            ` · ${miles(r.torneos)} torneos de ${estado.desde} a ${estado.hasta} (${miles(r.fide)} de FIDE, ${miles(r.nofide)} que no)`
            + (a.solo_chess_results ? ". No figura como árbitro en ninguna ficha de FIDE." : `: valen para AF ${miles(r.af)}, para AI ${miles(r.ai)}.`));
        const lista = filasFicha(a);
        $("tabla-torneos").tBodies[0].replaceChildren(...lista.map((x) => {
            const t = x.t, c = x.cr;
            const lugar = t ? [t.ciudad, t.pais].filter(Boolean).join(", ") + (t.valorado ? " · valorado en " + t.valorado : "") : c.lugar;
            const nombre = el("div", {},
                el("span", { class: "font-semibold" }, t ? t.nombre : c.nombre),
                lugar ? el("span", { class: "of-detalle" }, lugar) : null,
                el("span", { class: "of-detalle" }, t ? enlace(urlFide(t), "FIDE") : null, t && c ? " · " : null, c ? enlace(urlCr(c), "chess-results") : null));
            const td = (v, der) => el("td", { class: "px-3 py-2 align-top" + (der ? " text-right tabular-nums" : "") }, v);
            return el("tr", { class: "border-t border-brand-100 dark:border-brand-800" },
                td(fecha(x.inicio)), el("th", { scope: "row", class: "px-3 py-2 align-top font-normal" }, nombre),
                td(x.fide ? "Sí" : "No"), td(cargoEscrito(x)),
                td(t ? (RITMOS[t.ritmo] || "—") + " · " + (SISTEMAS[t.sistema] || "—") : (c.control || "—")),
                td(t ? miles(t.contados) + (t.contados !== t.con_elo ? " de " + miles(t.con_elo) : "") : "—", true),
                td(t ? (t.rondas ? miles(t.rondas) : "—") : miles(c.rondas), true),
                td(miles(t ? t.jugadores : c.jugadores), true),
                td(norma(x.af)), td(norma(x.ai)));
        }));
        $("ficha-cuenta").textContent = lista.length
            ? miles(lista.length) + (lista.length === 1 ? " torneo." : " torneos.") + " «Con Elo» cuenta a quien no faltó a más de una ronda; los torneos que no son de FIDE no tienen norma."
            : "Ningún torneo cumple con estos filtros.";
    }

    function excel() {
        const a = arbitros.find((x) => x.fide_id === estado.elegido);
        if (!a) return;
        const filas = [["Inicio", "Torneo", "FIDE", "Lugar", "Cargo", "Ritmo o control", "Sistema", "Jugadores", "Con Elo que cuentan", "Rondas", "Federaciones",
            "Norma de AF", "Por qué (AF)", "Norma de AI", "Por qué (AI)", "En FIDE", "En chess-results"]]
            .concat(filasFicha(a).map((x) => {
                const t = x.t, c = x.cr;
                return [x.inicio, t ? t.nombre : c.nombre, x.fide ? "Sí" : "No", t ? [t.ciudad, t.pais].filter(Boolean).join(", ") : c.lugar, cargoEscrito(x),
                    t ? RITMOS[t.ritmo] || "" : c.control, t ? SISTEMAS[t.sistema] || "" : "", t ? t.jugadores : c.jugadores, t ? t.contados : "",
                    t ? t.rondas || "" : c.rondas, t ? t.federaciones : "", ESTADOS[x.af.estado] || "", x.af.detalle, ESTADOS[x.ai.estado] || "", x.ai.detalle,
                    t ? urlFide(t) : "", c ? urlCr(c) : ""];
            }));
        window.TablaExcel.bajar("arbitro-" + a.fide_id + ".xlsx", [{ nombre: "Torneos", filas }]);
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
        $("tipo").addEventListener("change", (e) => { estado.tipo = e.target.value; pintar(); });
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
            const [a, t, c, cr, crc] = await Promise.all([
                leerTodo("arbitros_cr", "fide_id,nombre,titulo,titulo_detalle,solo_chess_results", "fide_id"),
                leerTodo("arbitros_cr_torneos", "id,nombre,ciudad,pais,inicio,fin,sistema,ritmo,jugadores,con_elo,contados,rondas,federaciones,valorado,af_estado,af_detalle,ai_estado,ai_detalle", "id"),
                leerTodo("arbitros_cr_cargos", "torneo_id,fide_id,cargo", "torneo_id,fide_id,cargo"),
                leerTodo("arbitros_cr_cr", "clave,nombre,inicio,fin,lugar,control,rondas,jugadores,fide_torneo", "clave"),
                leerTodo("arbitros_cr_cr_cargos", "clave,fide_id,rol", "clave,fide_id,rol"),
            ]);
            preparar(a, t, c, cr, crc);
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
