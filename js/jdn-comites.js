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
        { id: "2021-F", fase: "final", titulo: "Final 2020-2021", detalle: "noviembre de 2021", ciclo: "2021-F" },
        { id: "2021-E", fase: "elim", titulo: "Eliminatoria 2021", detalle: "octubre de 2021", ciclo: "2021-F" },
        { id: "2019-F", fase: "final", titulo: "Final 2019", detalle: "Ciudad Colón, junio y julio de 2019", ciclo: "2019-F" },
        { id: "2019-E", fase: "elim", titulo: "Eliminatoria 2019", detalle: "abril de 2019", ciclo: "2019-F" },
        { id: "2018-F", fase: "final", titulo: "Final 2018", detalle: "Ciudad Colón, julio de 2018", ciclo: "2018-F" },
        { id: "2018-E", fase: "elim", titulo: "Eliminatoria 2018", detalle: "Alajuela, abril de 2018", ciclo: "2018-F" },
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
        "asociacion goicoechea": "Goicoechea", "asociacion naranjo": "Naranjo", "codea": "CODEA (Alajuela)", "alajuela": "CODEA (Alajuela)", "turri": "Turrialba", "crecia": "Grecia",
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
    /* La letra o el número que distingue a los equipos de un mismo comité
       («A», «J», «2»); «01» y «1» son el mismo. */
    function sufijo(nombre) {
        let s = sinTilde(String(nombre || "")).trim().replace(/^C+DR\s*/i, "").replace(/^CC Distrit(o|al) (de )?/i, "").trim(), m;
        const suf = [];
        while ((m = s.match(/\s+(\d{1,2}|[A-Za-z]|SNF)$/))) { const t = m[1].toUpperCase(); suf.unshift(/^\d+$/.test(t) ? String(+t) : t); s = s.slice(0, m.index); }
        return suf.join(" ");
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
    /* Los mejores tableros de las finales por equipos (jdn_tableros): el orden
       de la «Clasificación por tableros» de chess-results, tal cual. */
    let tabs = [], tamT = {};
    /* Los filtros: los datos completos quedan en TODO y ind/eq/tabs son lo que
       pasa los filtros; todo lo que se pinta lee ind/eq/tabs. La deducción del
       comité, «Jugó la final» y el «puesto de N» salen siempre de lo completo. */
    let TODO = null, comitesTodos = [];
    const FILTRO = { fase: "", cat: "", rama: "", modo: "", ritmo: "", zona: "", q: "" };
    const CLAVES_FILTRO = ["fase", "cat", "rama", "modo", "ritmo", "zona", "q"];

    async function leerTodo() {
        const filas = [];
        for (let desde = 0; ; desde += 1000) {
            const { data, error } = await sb.from("jdn_resultados")
                .select("edicion,codigo,tnr,orden,puesto,nombre,comite,record,puntos")
                .order("edicion").order("codigo").order("orden")
                .range(desde, desde + 999);
            if (error) throw error;
            filas.push(...data);
            if (data.length < 1000) return filas;
        }
    }

    /* Los tableros son un extra: si no se pueden leer, la página sigue sin ellos. */
    async function leerTableros() {
        const filas = [];
        for (let desde = 0; ; desde += 1000) {
            const { data, error } = await sb.from("jdn_tableros")
                .select("edicion,codigo,tnr,tablero,orden,puesto,nombre,equipo,porcentaje,puntos")
                .order("edicion").order("codigo").order("tablero").order("orden")
                .range(desde, desde + 999);
            if (error) return [];
            filas.push(...data);
            if (data.length < 1000) return filas;
        }
    }
    function prepararTableros(filas) {
        const previo = {};
        for (const f of filas) {
            const k = f.edicion + f.codigo + "-" + f.tablero;
            const rk = f.puesto || previo[k] || 0; previo[k] = rk;
            tabs.push({ ed: f.edicion, cod: f.codigo, tnr: f.tnr, ...categoria(f.codigo), tablero: f.tablero, rk, nombre: f.nombre,
                equipo: f.equipo.replace(/^C+DR\s+/i, ""), comite: comite(f.equipo, true), pct: Number(f.porcentaje), pts: Number(f.puntos), fase: "final" });
            tamT[k] = (tamT[k] || 0) + 1;
        }
    }
    const nomTablero = (t) => t === 5 ? "Reserva" : "Tablero " + t;
    const pctTxt = (n) => n.toLocaleString("es-CR", { maximumFractionDigits: 1 }) + "\u00a0%";

    function preparar(filas) {
        const previo = {};
        for (const f of filas) {
            const k = f.edicion + f.codigo;
            // Un puesto vacío es un empate con el de arriba.
            const rk = f.puesto || previo[k] || 0; previo[k] = rk;
            const esEquipo = f.codigo.split("-")[2][0] === "E";
            const r = { ed: f.edicion, cod: f.codigo, tnr: f.tnr, ...categoria(f.codigo), rk, pts: Number(f.puntos), fase: edicion(f.edicion).fase };
            if (esEquipo) eq.push(Object.assign(r, { equipo: f.nombre.replace(/^C+DR\s+/i, ""), comite: comite(f.comite || f.nombre, true), sufijo: sufijo(f.nombre), record: f.record || "" }));
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
    const vacio = (n) => ({ nombre: n, zonas: new Set(), oro: 0, plata: 0, bronce: 0, ind: 0, eqm: 0, tab: 0, fin: new Set(), insc: 0, eqElim: 0 });
    function resumen(filtro) {
        const C = {};
        const c = (n) => C[n] || (C[n] = vacio(n));
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
        // Los tres primeros de cada tablero también son medallas oficiales.
        for (const r of tabs.filter(filtro)) if (r.rk >= 1 && r.rk <= 3) { const x = c(r.comite); x[MED[r.rk]]++; x.tab++; }
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
    /* Cada dato lleva su enlace a chess-results para comprobarlo: art=1 la
       clasificación, art=46 la tabla final de equipos, art=81 la clasificación
       por tableros. */
    function fuente(tnr, art, que) {
        if (!tnr) return el("td", { class: TD });
        return el("td", { class: TD }, el("a", {
            href: "https://chess-results.com/tnr" + tnr + ".aspx?lan=2&art=" + art + (art === 81 ? "&turdet=YES&flag=30" : ""),
            target: "_blank", rel: "noopener", "aria-label": "Ver " + que + " en chess-results (se abre en otra pestaña)",
            class: "underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500",
        }, "chess-results"));
    }

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
            ? "Medallas de las finales (" + finales.join(", ") + "), sumando individual, equipos y tableros, e inscritos de las eliminatorias. Elige un comité para ver su ficha, o una final en «Edición» para ver también sus mejores tableros. El orden es por oros, después platas y bronces."
            : e.fase === "final" ? "Medallas de " + e.titulo + (e.detalle ? " (" + e.detalle + ")" : "") + ", sumando individual, equipos y tableros. Debajo están sus mejores tableros. Elige un comité para ver su ficha."
                : "En una eliminatoria no hay medallas: la tabla dice cuántos jugadores y equipos inscribió cada comité. Elige un comité para ver su ficha.";
        const tb = document.querySelector("#medallero tbody"); tb.replaceChildren();
        for (const x of lista) {
            const b = el("button", { type: "button", "data-c": slug(x.nombre), class: "font-semibold text-left underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" }, x.nombre);
            b.addEventListener("click", () => elegir(b.dataset.c, $("edicion").value));
            tb.append(el("tr", {}, el("td", { class: TD }, b), td(zonaTxt(x.zonas)),
                td(x.oro || "", 1), td(x.plata || "", 1), td(x.bronce || "", 1), td(x.ind || "", 1), td(x.eqm || "", 1), td(x.tab || "", 1),
                td(x.fin.size || "", 1), td(x.insc || "", 1), td(x.eqElim || "", 1)));
        }
        if (!lista.length) tb.append(el("tr", {}, el("td", { class: TD, colspan: "11" }, "No hay resultados de esta edición.")));
        pintarTableros(e && e.fase === "final" ? e : null);
        pintarPorFinal(!e);
        pintarParticipacion(e);
    }

    /* Participantes de cada comité: jugadores de los torneos individuales y
       equipos, por categoría y rama. Un jugador o un equipo que jugó varios
       ritmos cuenta una vez; un mismo equipo escrito distinto por
       chess-results («Goicochea», «CODEA 01») también. */
    const CATS = ["U12-A", "U12-F", "U16-A", "U16-F", "U20-A", "U20-F"];
    const catNom = (k) => k.replace("-A", " Abs.").replace("-F", " Fem.");
    const catDe = (r) => r.cat + "-" + r.rama[0];
    function distintos(claves) {
        const out = [];
        for (const k of [...claves].sort((a, b) => b.length - a.length)) if (!out.some((o) => mismo(o, k))) out.push(k);
        return out.length;
    }
    function participantes(ed) {
        const J = {}, E = {};
        for (const r of ind) if (r.ed === ed) ((J[r.comite] = J[r.comite] || {})[catDe(r)] = J[r.comite][catDe(r)] || []).push(r.clave);
        for (const r of eq) if (r.ed === ed) ((E[r.comite] = E[r.comite] || {})[catDe(r)] = E[r.comite][catDe(r)] || new Set()).add(r.sufijo);
        const P = {};
        for (const c of new Set([...Object.keys(J), ...Object.keys(E)])) {
            const x = P[c] = { nombre: c, j: 0, e: 0 };
            for (const k of catsVisibles()) {
                const v = [J[c] && J[c][k] ? distintos(J[c][k]) : 0, E[c] && E[c][k] ? E[c][k].size : 0];
                x[k] = v; x.j += v[0]; x.e += v[1];
            }
        }
        return P;
    }
    const cuantos = (j, e) => [j ? j + " jugador" + (j === 1 ? "" : "es") : "", e ? e + " equipo" + (e === 1 ? "" : "s") : ""].filter(Boolean).join(" y ");
    function cifraParticipantes(c, ed, j, e, donde) {
        if (!j && !e) return td("—", 1);
        const txt = [j ? String(j) : "", e ? e + "E" : ""].filter(Boolean).join(" · ");
        if (c === "Sin comité") return td(txt, 1);
        const b = el("button", { type: "button", class: "underline underline-offset-2 hover:no-underline rounded tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500",
            "aria-label": `${c}${donde}: ${cuantos(j, e)}. Ver su ficha` }, txt);
        b.addEventListener("click", () => elegir(slug(c), ed));
        return el("td", { class: TDN, "data-edicion": ed }, b);
    }
    const catsVisibles = () => CATS.filter((k) => (!FILTRO.cat || k.startsWith(FILTRO.cat)) && (!FILTRO.rama || k.endsWith(FILTRO.rama)));
    function pintarParticipacion(e) {
        const CATS = catsVisibles();
        const caja = $("participacion");
        caja.replaceChildren();
        const eds = EDICIONES.filter((x) => Object.keys(tam).some((k) => k.startsWith(x.id)));
        if (e) {
            const P = participantes(e.id);
            const filas = Object.values(P).sort((a, b) => (b.j + b.e) - (a.j + a.e) || b.e - a.e || a.nombre.localeCompare(b.nombre, "es"));
            caja.append(el("h2", { id: "participacion-titulo", class: "font-serif text-xl font-bold text-brand-800 dark:text-white" }, "Participantes por comité · " + e.titulo),
                el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1" },
                    "Jugadores de los torneos individuales y equipos (E) de cada comité, por categoría y rama. Quien jugó varios ritmos cuenta una vez. Cada cifra abre la ficha del comité, con cada jugador y equipo y su enlace a chess-results."));
            const tot = CATS.map((k) => [0, 1].map((i) => filas.reduce((a, x) => a + x[k][i], 0)));
            const tr = filas.map((x) => el("tr", { "data-comite": x.nombre }, td(x.nombre),
                ...CATS.map((k) => cifraParticipantes(x.nombre, e.id, x[k][0], x[k][1], " en " + catNom(k) + " de " + e.titulo)), td(x.j, 1), td(x.e, 1)));
            tr.push(el("tr", { class: "font-semibold" }, td("Total"), ...tot.map((v) => td([v[0] ? String(v[0]) : "", v[1] ? v[1] + "E" : ""].filter(Boolean).join(" · ") || "—", 1)),
                td(filas.reduce((a, x) => a + x.j, 0), 1), td(filas.reduce((a, x) => a + x.e, 0), 1)));
            caja.append(tabla("Participantes de cada comité en " + e.titulo + " por categoría y rama",
                ["Comité", ...CATS.map((k) => ({ t: catNom(k), num: 1 })), { t: "Jugadores", num: 1 }, { t: "Equipos", num: 1 }], tr));
            // Los torneos de la edición, para comprobar cada dato en chess-results.
            const torneos = new Map();
            for (const r of [...ind, ...eq]) if (r.ed === e.id && r.tnr && !torneos.has(r.cod)) torneos.set(r.cod, r);
            const lista = [...torneos.values()].sort(ordCat);
            const det = el("details", { class: "mt-3 text-sm" }, el("summary", { class: "cursor-pointer font-semibold text-brand-700 dark:text-brand-200" },
                "Los " + lista.length + " torneos de " + e.titulo + " en chess-results"));
            const ul = el("ul", { class: "mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1" });
            for (const r of lista) {
                const que = r.cat + " " + r.rama + " · " + (r.ritmo || (r.zona === "Única" ? "Zona única" : "Zona " + r.zona.slice(1))) + " · " + r.modo;
                ul.append(el("li", {}, el("a", { href: "https://chess-results.com/tnr" + r.tnr + ".aspx?lan=2&art=1", target: "_blank", rel: "noopener",
                    "aria-label": que + " en chess-results (se abre en otra pestaña)",
                    class: "underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" }, que)));
            }
            det.append(ul); caja.append(det);
            caja.classList.remove("hidden");
            return;
        }
        // Todas las ediciones: comité por eliminatoria y comité por final.
        caja.append(el("h2", { id: "participacion-titulo", class: "font-serif text-xl font-bold text-brand-800 dark:text-white" }, "Participantes por edición"),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1" },
                "Jugadores de los torneos individuales y equipos (E) de cada comité en cada eliminatoria y cada final. Elige una edición para verlos por categoría y rama; cada cifra abre la ficha del comité en esa edición."));
        for (const [fase, titulo] of [["elim", "Eliminatorias"], ["final", "Finales (clasificados)"]].filter(([f]) => faseVisible(f))) {
            const lista = eds.filter((x) => x.fase === fase).reverse();
            const P = lista.map((x) => participantes(x.id));
            const nombres = [...new Set(P.flatMap((p) => Object.keys(p)))];
            const sum = (c) => [0, 1].map((i) => P.reduce((a, p) => a + (p[c] ? [p[c].j, p[c].e][i] : 0), 0));
            nombres.sort((a, b) => { const x = sum(a), y = sum(b); return (y[0] + y[1]) - (x[0] + x[1]) || y[1] - x[1] || a.localeCompare(b, "es"); });
            const tr = nombres.map((c) => el("tr", { "data-comite": c }, td(c),
                ...lista.map((x, i) => cifraParticipantes(c, x.id, P[i][c] ? P[i][c].j : 0, P[i][c] ? P[i][c].e : 0, " en " + x.titulo)),
                td(sum(c)[0], 1), td(sum(c)[1], 1)));
            const tj = P.map((p) => [0, 1].map((i) => Object.values(p).reduce((a, x) => a + [x.j, x.e][i], 0)));
            tr.push(el("tr", { class: "font-semibold" }, td("Total"), ...tj.map((v) => td(v[0] + " · " + v[1] + "E", 1)),
                td(tj.reduce((a, v) => a + v[0], 0), 1), td(tj.reduce((a, v) => a + v[1], 0), 1)));
            caja.append(el("h3", { class: "font-serif text-lg font-bold text-brand-800 dark:text-white mt-5" }, titulo));
            caja.append(tabla(titulo + ": participantes de cada comité", ["Comité", ...lista.map((x) => ({ t: x.titulo.replace(/^(Final|Eliminatoria) /, ""), num: 1 })),
                { t: "Jugadores", num: 1 }, { t: "Equipos", num: 1 }], tr));
        }
        caja.classList.remove("hidden");
    }

    /* Con todas las ediciones: cuántas medallas de cada tipo hubo y cuántas
       ganó cada comité en cada final. Cada celda abre la ficha del comité en
       esa final, donde cada medalla tiene su enlace a chess-results. */
    function pintarPorFinal(ver) {
        const caja = $("por-final");
        caja.replaceChildren();
        caja.classList.toggle("hidden", !ver);
        if (!ver) return;
        const finales = EDICIONES.filter((x) => x.fase === "final" && Object.keys(tam).some((k) => k.startsWith(x.id))).reverse();
        const cuenta = (lista) => [1, 2, 3].map((k) => lista.filter((r) => r.fase !== "elim" && r.rk === k).length);
        const tipos = [["Individuales", cuenta(ind)], ["Por equipos", cuenta(eq)], ["Tableros", cuenta(tabs)]];
        const suma = [0, 1, 2].map((j) => tipos.reduce((a, t) => a + t[1][j], 0));
        tipos.push(["Total", suma]);
        caja.append(el("h2", { id: "por-final-titulo", class: "font-serif text-xl font-bold text-brand-800 dark:text-white" }, "Medallas por final"),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1" },
                "Oros · platas · bronces de cada comité en cada final. Cada cifra abre la ficha del comité en esa final, donde cada medalla tiene su enlace a chess-results para comprobarla."));
        caja.append(el("div", { class: "grid grid-cols-2 md:grid-cols-4 gap-3 mt-3" }, ...tipos.map(([n, m]) =>
            cifra(m[0] + m[1] + m[2], n + ": " + m[0] + " de oro, " + m[1] + " de plata, " + m[2] + " de bronce"))));
        const por = finales.map((f) => Object.fromEntries(resumen((r) => r.ed === f.id).map((x) => [x.nombre, x])));
        const lista = todos.filter((x) => x.oro + x.plata + x.bronce);
        const celda = (x, f, i) => {
            const y = por[i][x.nombre];
            if (!y || !(y.oro + y.plata + y.bronce)) return td("—", 1);
            const b = el("button", { type: "button", class: "underline underline-offset-2 hover:no-underline rounded tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500",
                "aria-label": `${x.nombre} en ${f.titulo}: ${y.oro} de oro, ${y.plata} de plata, ${y.bronce} de bronce. Ver su ficha` }, y.oro + "·" + y.plata + "·" + y.bronce);
            b.addEventListener("click", () => elegir(slug(x.nombre), f.id));
            return el("td", { class: TDN, "data-final": f.id }, b);
        };
        const filas = lista.map((x) => el("tr", { "data-comite": x.nombre }, td(x.nombre), ...finales.map((f, i) => celda(x, f, i)),
            td(x.oro + "·" + x.plata + "·" + x.bronce, 1), td(x.oro + x.plata + x.bronce, 1)));
        const tot = finales.map((f, i) => { const v = Object.values(por[i]); return [0, 1, 2].map((j) => v.reduce((a, y) => a + y[MED[j + 1]], 0)).join("·"); });
        filas.push(el("tr", { class: "font-semibold" }, td("Total"), ...tot.map((t) => td(t, 1)), td(suma.join("·"), 1), td(suma[0] + suma[1] + suma[2], 1)));
        caja.append(tabla("Medallas de cada comité en cada final", ["Comité", ...finales.map((f) => ({ t: f.titulo.replace(/^Final /, ""), num: 1 })),
            { t: "Oro·Plata·Bronce", num: 1 }, { t: "Medallas", num: 1 }], filas));
    }

    /* En el medallero de una final: el primero de cada tablero de cada torneo
       por equipos (si empataron sin desempate, todos los primeros). */
    function pintarTableros(e) {
        const caja = $("tableros");
        const de = e ? tabs.filter((r) => r.ed === e.id) : [];
        caja.replaceChildren();
        caja.classList.toggle("hidden", !de.length);
        if (!de.length) return;
        const nums = [...new Set(de.map((r) => r.tablero))].sort((a, b) => a - b);
        const torneos = [...new Map(de.map((r) => [r.cod, r])).values()].sort(ordCat);
        caja.append(el("h2", { id: "tableros-titulo", class: "font-serif text-xl font-bold text-brand-800 dark:text-white" }, "Mejores tableros · " + e.titulo),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1" },
                "El primero de cada tablero en cada torneo por equipos, según la clasificación por tableros de chess-results (porcentaje de puntos, con los desempates y el mínimo de partidas que fijó el árbitro de cada torneo)."
                + (nums.includes(5) ? " En esta final los equipos tenían una reserva." : "")));
        caja.append(tabla("Mejores tableros de " + e.titulo, ["Categoría", "Ritmo", ...nums.map(nomTablero), "Comprobar"], torneos.map((t) =>
            el("tr", { "data-torneo": t.cod }, td(t.cat + " " + t.rama), td(t.ritmo), ...nums.map((n) => {
                const mejores = de.filter((r) => r.cod === t.cod && r.tablero === n && r.rk === 1);
                return el("td", { class: TD.replace("whitespace-nowrap", "min-w-[10rem] align-top"), "data-tablero": n }, ...(mejores.length ? mejores.map((r) =>
                    el("span", { class: "block" }, el("span", { class: "font-semibold" }, r.nombre),
                        el("span", { class: "block text-xs text-brand-500 dark:text-brand-300" }, r.comite + " · " + pctTxt(r.pct)))) : ["—"]));
            }), fuente(t.tnr, 81, "la clasificación por tableros de " + t.cat + " " + t.rama + " " + t.ritmo + " de " + e.titulo)))));
    }

    function cifra(n, texto) {
        return el("div", { class: "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4" },
            el("p", { class: "font-serif text-3xl font-bold text-brand-800 dark:text-white" }, n),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300" }, texto));
    }

    function pintar(s, edSel) {
        const enTodos = comitesTodos.find((y) => slug(y.nombre) === s);
        const x = enTodos && (todos.find((y) => y.nombre === enTodos.nombre) || vacio(enTodos.nombre));
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
        const lugar = pos ? "puesto " + pos + " de " + todos.length + " en el medallero" + (hayFiltros() ? " con estos filtros" : " de todas las finales") : "sin resultados con estos filtros";
        ficha.append(el("div", { class: "flex flex-wrap items-baseline justify-between gap-2" },
            el("h2", { id: "ficha-titulo", class: "font-serif text-2xl font-bold text-brand-800 dark:text-white" }, x.nombre),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300" }, "Zona " + zonaTxt(x.zonas) + " · " + lugar)));
        ficha.append(el("div", { class: "grid grid-cols-2 md:grid-cols-4 gap-3 mt-4" },
            cifra(x.oro + x.plata + x.bronce, `medallas en las finales (${x.oro} de oro, ${x.plata} de plata, ${x.bronce} de bronce)`),
            cifra(x.fin.size, "participaciones en finales individuales"),
            cifra(x.insc, "inscripciones en eliminatorias individuales"),
            cifra(x.eqElim, "equipos en eliminatorias")));

        const filasEd = [];
        for (const e of EDICIONES) {
            const ri = ind.filter((r) => r.ed === e.id && r.comite === x.nombre), re = eq.filter((r) => r.ed === e.id && r.comite === x.nombre);
            const rt = tabs.filter((r) => r.ed === e.id && r.comite === x.nombre);
            if (!ri.length && !re.length) continue;
            const n = (k) => e.fase === "final" ? [...ri, ...re, ...rt].filter((r) => r.rk === k).length : "—";
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
                const cab = ["Categoría", final ? "Ritmo" : "Zona", "Jugador", { t: "Puesto", num: 1 }, { t: "Puntos", num: 1 }, final ? "Medalla" : "Final", "Comprobar"];
                sec.append(tabla("Jugadores de " + x.nombre + " en " + e.titulo, cab, ri.map((r) => el("tr", { "data-jugador": r.nombre },
                    td(r.cat + " " + r.rama), td(final ? r.ritmo : r.zona),
                    el("td", { class: TD.replace("whitespace-nowrap", "min-w-[12rem]") }, r.nombre,
                        r.deducido ? el("span", { class: "block text-xs text-brand-500 dark:text-brand-300" }, "comité deducido") : null),
                    td(r.rk + " de " + tam[r.ed + r.cod], 1), td(fmt(r.pts), 1),
                    el("td", { class: TD }, final ? medalla(r.rk) : (jugoFinal(r) ? etiqueta("Jugó la final") : null)),
                    fuente(r.tnr, 1, "la clasificación de " + r.cat + " " + r.rama + " de " + e.titulo)))));
            }
            if (re.length) {
                sec.append(el("h4", { class: "font-semibold text-brand-800 dark:text-white mt-4" }, "Equipos"));
                const cab = ["Categoría", final ? "Ritmo" : "Zona", "Equipo", { t: "Puesto", num: 1 }, { t: "Matches G-E-P", num: 1 }, { t: "Puntos de partida", num: 1 }];
                if (final) cab.push("Medalla");
                cab.push("Comprobar");
                sec.append(tabla("Equipos de " + x.nombre + " en " + e.titulo, cab, re.map((r) => el("tr", {},
                    td(r.cat + " " + r.rama), td(final ? r.ritmo : r.zona), td(r.equipo),
                    td(r.rk + " de " + tam[r.ed + r.cod], 1), td(r.record || "—", 1), td(fmt(r.pts), 1),
                    final ? el("td", { class: TD }, medalla(r.rk)) : null,
                    fuente(r.tnr, r.record ? 46 : 1, "la clasificación de equipos de " + r.cat + " " + r.rama + " de " + e.titulo)))));
            }
            const rt = tabs.filter((r) => r.ed === e.id && r.comite === x.nombre).sort((a, b) => a.cat.localeCompare(b.cat) || a.rama.localeCompare(b.rama)
                || (ORD_R[a.ritmo] || 0) - (ORD_R[b.ritmo] || 0) || a.equipo.localeCompare(b.equipo) || a.tablero - b.tablero);
            if (rt.length) {
                sec.append(el("h4", { class: "font-semibold text-brand-800 dark:text-white mt-4" }, "Tableros de sus equipos"));
                const cab = ["Categoría", "Ritmo", "Equipo", "Tablero", "Jugador", { t: "Puesto en el tablero", num: 1 }, { t: "Porcentaje", num: 1 }, { t: "Puntos", num: 1 }, "Medalla", "Comprobar"];
                sec.append(tabla("Tableros de los equipos de " + x.nombre + " en " + e.titulo, cab, rt.map((r) => el("tr", { "data-tablero-de": r.nombre },
                    td(r.cat + " " + r.rama), td(r.ritmo), td(r.equipo), td(nomTablero(r.tablero)), td(r.nombre),
                    td(r.rk + " de " + tamT[r.ed + r.cod + "-" + r.tablero], 1), td(pctTxt(r.pct), 1), td(fmt(r.pts), 1),
                    el("td", { class: TD }, medalla(r.rk)),
                    fuente(r.tnr, 81, "la clasificación por tableros de " + r.cat + " " + r.rama + " " + r.ritmo + " de " + e.titulo)))));
            }
            ficha.append(sec);
        }
    }

    /* ---- Filtros y búsqueda de jugador ---- */
    const RITMO_DE = { C: "Clásico", R: "Rápido", B: "Blitz" };
    function pasa(r, esTablero) {
        const F = FILTRO;
        if (F.fase && r.fase !== F.fase) return false;
        if (F.cat && r.cat !== F.cat) return false;
        if (F.rama && r.rama[0] !== F.rama) return false;
        if (F.modo === "I" && (esTablero || r.modo !== "Individual")) return false;
        if (F.modo === "E" && !esTablero && r.modo !== "Equipos") return false;
        if (F.ritmo && r.ritmo !== RITMO_DE[F.ritmo]) return false;
        if (F.zona && r.zona !== F.zona) return false;
        return true;
    }
    // El ritmo solo existe en las finales y la zona solo en las eliminatorias.
    const faseVisible = (f) => (!FILTRO.fase || f === FILTRO.fase) && !(FILTRO.ritmo && f === "elim") && !(FILTRO.zona && f === "final");
    const hayFiltros = () => ["fase", "cat", "rama", "modo", "ritmo", "zona"].some((k) => FILTRO[k]);
    function aplicarFiltros() {
        ind = TODO.ind.filter((r) => pasa(r, false));
        eq = TODO.eq.filter((r) => pasa(r, false));
        tabs = TODO.tabs.filter((r) => pasa(r, true));
        todos = resumen(() => true);
        const txt = [];
        const nom = { fase: { elim: "Eliminatorias", final: "Finales" }, cat: { U12: "U12", U16: "U16", U20: "U20" }, rama: { A: "Absoluto", F: "Femenino" },
            modo: { I: "Individual", E: "Equipos y tableros" }, ritmo: RITMO_DE, zona: { Z1: "Zona 1", Z2: "Zona 2" } };
        for (const k of Object.keys(nom)) if (FILTRO[k]) txt.push(nom[k][FILTRO[k]]);
        $("filtros-activos").textContent = txt.length ? "Filtros: " + txt.join(" · ") + ". Todo lo de abajo cuenta solo eso." : "";
        $("quitar-filtros").classList.toggle("hidden", !txt.length && !FILTRO.q);
    }

    /* Un jugador en todos los JDN: sus torneos individuales y sus tableros,
       con los filtros puestos. */
    function pintarBusqueda() {
        const caja = $("busqueda");
        caja.replaceChildren();
        const q = clave(FILTRO.q || "");
        caja.classList.toggle("hidden", q.length < 3);
        if (q.length < 3) return;
        const filas = [
            ...ind.filter((r) => r.clave.includes(q)).map((r) => ({ r, nombre: r.nombre, que: "Individual", n: tam[r.ed + r.cod], tnr: r.tnr, art: 1 })),
            ...tabs.filter((r) => clave(r.nombre).includes(q)).map((r) => ({ r, nombre: r.nombre, que: nomTablero(r.tablero) + " · " + r.equipo, n: tamT[r.ed + r.cod + "-" + r.tablero], tnr: r.tnr, art: 81 })),
        ].sort((a, b) => b.r.ed.localeCompare(a.r.ed) || a.nombre.localeCompare(b.nombre, "es") || ordCat(a.r, b.r));
        const personas = new Set(filas.map((f) => clave(f.nombre))).size;
        caja.append(el("h2", { id: "busqueda-titulo", class: "font-serif text-xl font-bold text-brand-800 dark:text-white" }, "Jugadores que coinciden con «" + FILTRO.q + "»"),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1", role: "status" }, filas.length
                ? `${filas.length} resultado${filas.length === 1 ? "" : "s"} de ${personas} jugador${personas === 1 ? "" : "es"}` + (filas.length > 300 ? "; se muestran los 300 más recientes" : "") + "."
                : "Ningún jugador coincide" + (hayFiltros() ? " con estos filtros." : ".")));
        if (!filas.length) return;
        const cab = ["Jugador", "Comité", "Edición", "Categoría", "Ritmo o zona", "Modalidad", { t: "Puesto", num: 1 }, "Medalla", "Comprobar"];
        caja.append(tabla("Resultados de la búsqueda de jugador", cab, filas.slice(0, 300).map((f) => {
            const r = f.r, final = r.fase === "final";
            const b = el("button", { type: "button", class: "underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" }, r.comite);
            b.addEventListener("click", () => elegir(slug(r.comite), r.ed));
            return el("tr", { "data-jugador": f.nombre }, td(f.nombre), r.comite === "Sin comité" ? td(r.comite) : el("td", { class: TD }, b), td(ED[r.ed].titulo),
                td(r.cat + " " + r.rama), td(r.ritmo || (r.zona === "Única" ? "Zona única" : "Zona " + r.zona.slice(1))), td(f.que), td(r.rk + " de " + f.n, 1),
                el("td", { class: TD }, final ? medalla(r.rk) : null), fuente(f.tnr, f.art, "el torneo de " + f.nombre + " en " + ED[r.ed].titulo));
        })));
    }

    function enlace(s, ed) {
        const p = new URLSearchParams();
        for (const k of CLAVES_FILTRO) if (FILTRO[k]) p.set(k, FILTRO[k]);
        const f = p.toString();
        const h = [s || "", ed || "", f].join("~").replace(/~+$/, "");
        try { history.replaceState(null, "", h ? "#" + h : location.pathname); } catch (e) { /* sin historial */ }
    }

    function elegir(s, ed) {
        enlace(s, ed);
        pintar(s, ed);
        pintarBusqueda();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function armarControles() {
        const selC = $("comite"), selE = $("edicion");
        selC.append(el("option", { value: "" }, "Todos los comités (medallero)"));
        for (const x of [...comitesTodos].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))) selC.append(el("option", { value: slug(x.nombre) }, x.nombre));
        selE.append(el("option", { value: "" }, "Todas las ediciones"));
        for (const e of EDICIONES) if (tam && Object.keys(tam).some((k) => k.startsWith(e.id))) selE.append(el("option", { value: e.id }, e.titulo + (e.detalle ? " · " + e.detalle : "")));
        selC.addEventListener("change", () => elegir(selC.value, selE.value));
        selE.addEventListener("change", () => elegir(selC.value, selE.value));
        $("volver").addEventListener("click", () => elegir("", selE.value));
        for (const k of ["fase", "cat", "rama", "modo", "ritmo", "zona"]) {
            const sel = $("f-" + k);
            sel.value = FILTRO[k];
            sel.addEventListener("change", () => {
                FILTRO[k] = sel.value;
                // Una edición que no es de la fase elegida deja de tener sentido.
                if (k === "fase" && FILTRO.fase && ED[selE.value] && ED[selE.value].fase !== FILTRO.fase) selE.value = "";
                aplicarFiltros(); elegir(selC.value, selE.value);
            });
        }
        const bus = $("buscar");
        bus.value = FILTRO.q;
        bus.addEventListener("input", () => { FILTRO.q = bus.value.trim(); aplicarFiltros(); enlace(selC.value, selE.value); pintarBusqueda(); });
        $("quitar-filtros").addEventListener("click", () => {
            for (const k of CLAVES_FILTRO) { FILTRO[k] = ""; if (k !== "q") $("f-" + k).value = ""; }
            bus.value = "";
            aplicarFiltros(); elegir(selC.value, selE.value);
        });
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
        prepararTableros(await leerTableros());
        TODO = { ind, eq, tabs };
        comitesTodos = resumen(() => true); // con las medallas de tablero
        const [h1, h2, h3] = decodeURIComponent((location.hash || "").slice(1)).split("~");
        const pf = new URLSearchParams(h3 || "");
        for (const k of CLAVES_FILTRO) FILTRO[k] = pf.get(k) || "";
        aplicarFiltros();
        const torneos = Object.keys(tam).length;
        const nE = EDICIONES.filter((e) => e.fase === "elim" && Object.keys(tam).some((k) => k.startsWith(e.id))).length;
        const nF = EDICIONES.filter((e) => e.fase === "final" && Object.keys(tam).some((k) => k.startsWith(e.id))).length;
        $("intro").textContent = `Los resultados de cada comité de deportes en los ${torneos} torneos de ajedrez de los Juegos Deportivos Nacionales que están en chess-results: ${nE} eliminatorias y ${nF} finales. Elige un comité para ver a todos sus jugadores y equipos, edición por edición.`;
        armarControles();
        $("loading").classList.add("hidden"); $("app").classList.remove("hidden");
        if (ED[h1]) pintar("", h1); else pintar(h1 || "", h2 || "");
        pintarBusqueda();
    }

    init();
})();
