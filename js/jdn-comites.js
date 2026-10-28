/* El código de jdn-comites.html (los resultados JDN por comité) y de
   universidades.html (los resultados universitarios por universidad).

   La misma página sirve a las dos herramientas: universidades.html lleva
   <body data-evento="universidades"> y acá cambian las tablas (uni_* en vez
   de jdn_*), la licencia, las ediciones, cómo se junta el nombre de una
   universidad y las palabras («universidad» por «comité»). Lo demás —el
   medallero, la ficha, la copa, el Elo, los enfrentamientos, la calidad— es
   el mismo código. Ver «Resultados universitarios por universidad» en
   docs/decisiones/juegos-y-torneos.md.

   Lo que sigue habla de los JDN; con las universidades vale igual.

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
    const UNI = document.body.dataset.evento === "universidades";

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
        /* 2011-2017: los mejores tableros de estas finales no son los de
           chess-results, que no publicó la clasificación por tableros: los
           calcula la base con la regla de 2018 (ver «Las finales y
           eliminatorias de 2011 a 2017»). La final 2013 se jugó en 2014. */
        { id: "2017-F", fase: "final", titulo: "Final 2017", detalle: "julio de 2017", ciclo: "2017-F" },
        { id: "2017-E", fase: "elim", titulo: "Eliminatoria 2017", detalle: "abril de 2017", ciclo: "2017-F" },
        { id: "2016-F", fase: "final", titulo: "Final 2016", detalle: "julio de 2016", ciclo: "2016-F" },
        { id: "2016-E", fase: "elim", titulo: "Eliminatoria 2016", detalle: "abril de 2016", ciclo: "2016-F" },
        { id: "2015-F", fase: "final", titulo: "Final 2015", detalle: "julio de 2015", ciclo: "2015-F" },
        { id: "2015-E", fase: "elim", titulo: "Eliminatoria 2015", detalle: "abril de 2015", ciclo: "2015-F" },
        { id: "2013-F", fase: "final", titulo: "Final 2013", detalle: "marzo de 2014", ciclo: "2013-F" },
        { id: "2013-E", fase: "elim", titulo: "Eliminatoria 2013", detalle: "octubre de 2013", ciclo: "2013-F" },
        { id: "2012-F", fase: "final", titulo: "Final 2012", detalle: "Desamparados, diciembre de 2012", ciclo: "2012-F" },
        { id: "2012-E", fase: "elim", titulo: "Eliminatoria 2012", detalle: "noviembre de 2012", ciclo: "2012-F" },
        { id: "2011-F", fase: "final", titulo: "Final 2011", detalle: "julio de 2011", ciclo: "2011-F" },
        { id: "2011-E", fase: "elim", titulo: "Eliminatoria 2011", detalle: "junio de 2011", ciclo: "2011-F" },
    ];
    /* Las universitarias: cada una es un evento (JUNCOS, CONARE, FEDEU…),
       todas con medallas, sin eliminatoria ni ciclo. Van en el orden del
       tiempo, de la más nueva a la más vieja. */
    const EDICIONES_UNI = [
        ["2026-CONARE2", "CONARE", "II Torneo CONARE 2026", "UTN, Alajuela, septiembre de 2026"],
        ["2026-CONARE", "CONARE", "Torneo CONARE 2026", "UTN, Alajuela, agosto de 2026"],
        ["2026-FEDEU", "FEDEU", "FEDEU 2026", "CENFOTEC, San José, mayo de 2026"],
        ["2025-CONARE", "CONARE", "Torneo CONARE 2025", "UNA, Heredia, septiembre de 2025"],
        ["2025-JUDUCA", "JUDUCA", "JUDUCA 2025", "Tegucigalpa, Honduras, julio de 2025"],
        ["2025-FEDEU", "FEDEU", "FEDEU 2025", "CENFOTEC, San José, mayo de 2025"],
        ["2024-CONARE", "CONARE", "Torneo CONARE 2024", "UCR, Sabanilla, octubre de 2024"],
        ["2024-FEDEU", "FEDEU", "FEDEU 2024", "CENFOTEC, San José, mayo de 2024"],
        ["2023-CONARE", "CONARE", "Torneo CONARE 2023", "UNA, Heredia, octubre de 2023"],
        ["2023-FEDEU", "FEDEU", "FEDEU 2023", "UNED, Sabanilla, septiembre de 2023"],
        ["2023-JUDUCA", "JUDUCA", "JUDUCA 2023", "El Salvador, julio de 2023"],
        ["2023-JUNCOS", "JUNCOS", "XXIV JUNCOS 2023", "UNA, Heredia, mayo de 2023"],
        ["2022-FEDEU", "FEDEU", "FEDEU 2022", "UCR, San Pedro, agosto de 2022"],
        ["2022-CONARE", "CONARE", "Torneo CONARE 2022", "TEC, junio de 2022"],
        ["2020-FECUNDE", "FECUNDE", "FECUNDE 2020 (en línea)", "chess.com, octubre de 2020"],
        ["2020-CENTRO", "OTROS", "Centroamericano universitario 2020 (en línea)", "Lichess, agosto y septiembre de 2020"],
        ["2019-BLITZ", "OTROS", "Blitz universitario 2019", "TEC, Barrio Amón, agosto de 2019"],
        ["2019-JUNCOS", "JUNCOS", "JUNCOS 2019", "TEC, Cartago, marzo de 2019"],
        ["2018-CONARE", "CONARE", "Torneo CONARE 2018", "UNED, Sabanilla, noviembre de 2018"],
        ["2018-JUDUCA", "JUDUCA", "JUDUCA 2018", "Panamá, abril de 2018"],
        ["2017-JUNCOS", "JUNCOS", "JUNCOS 2017", "UCR, San Pedro, marzo y abril de 2017"],
        ["2016-GP3", "GP", "Grand Prix universitario 2016, tercera etapa", "UCR, octubre de 2016"],
        ["2016-GP2", "GP", "Grand Prix universitario 2016, segunda etapa", "UTN, 2016"],
        ["2016-GP1", "GP", "Grand Prix universitario 2016, primera etapa", "TEC, agosto de 2016"],
        ["2016-JUDUCA", "JUDUCA", "JUDUCA 2016", "Honduras, abril de 2016"],
        ["2015-JUNCOS", "JUNCOS", "JUNCOS 2015", "UNED, San José, septiembre de 2015"],
        ["2014-LIGA", "OTROS", "Liga Universitaria 2014", "UNA, Heredia, septiembre de 2014"],
        ["2014-JUDUCA", "JUDUCA", "JUDUCA 2014", "Nicaragua, abril de 2014"],
        ["2014-FECUNDE", "FECUNDE", "FECUNDE 2014", "TEC, San José, marzo de 2014"],
        ["2013-JUNCOS", "JUNCOS", "JUNCOS 2013", "UNA, Heredia, abril de 2013"],
        ["2011-INTER", "OTROS", "Interuniversitario UNA 2011", "UNA, Heredia, octubre de 2011"],
        ["2011-JUNCOS", "JUNCOS", "JUNCOS 2011", "TEC, mayo de 2011"],
        ["2010-JUDUCA", "JUDUCA", "JUDUCA 2010", "Honduras, abril de 2010"],
    ].map(([id, serie, titulo, detalle]) => ({ id, serie, fase: "final", titulo, detalle, ciclo: id }));
    if (UNI) EDICIONES.splice(0, EDICIONES.length, ...EDICIONES_UNI);
    const ED = Object.fromEntries(EDICIONES.map((e) => [e.id, e]));
    /* Una edición que se cargue después y no esté arriba igual se ve. */
    function edicion(id) {
        if (!ED[id] && UNI) {
            ED[id] = { id, serie: "OTROS", fase: "final", titulo: id.slice(5) + " " + id.slice(0, 4), detalle: "", ciclo: id };
            EDICIONES.push(ED[id]);
            EDICIONES.sort((a, b) => b.id.slice(0, 4).localeCompare(a.id.slice(0, 4)));
        }
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
        /* Los de 2011 a 2017 (ver «Las finales y eliminatorias de 2011 a
           2017»): Aguirre es el nombre viejo del cantón de Quepos y Alfaro
           Ruiz el de Zarcero; la Asociación Fischer jugaba por CODEA; «CCDRC»
           (eliminatoria 2015) es Cartago. */
        "aguirre": "Quepos", "alfaro ruiz": "Zarcero", "nandyure": "Nandayure", "fischer": "CODEA (Alajuela)", "c": "Cartago",
    };
    /* «CCDR», y en los torneos viejos «CDDR» y «CDR». */
    const PREFIJO = /^C+D+R\s*/i;
    const titulo = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()).replace(/\bDe\b/g, "de");
    /* El comité tal como lo escribe chess-results → un solo nombre. A un equipo
       se le quita además la letra o el número del final («Escazú A»). */
    function comite(nombre, esEquipo) {
        if (UNI) return universidad(nombre, esEquipo);
        let s = sinTilde(String(nombre || "")).trim().replace(PREFIJO, "").replace(/^CC Distrit(o|al) (de )?/i, "").replace(/^(Asociacion|CD)\s+/i, "").trim();
        if (!s) return "";
        if (/^codea\b/i.test(s)) return NOMBRES.codea;
        /* Los equipos viejos llevan además la categoría («Goico Juvenil
           Masculino», «Escazu Sub 16») o «SFN»/«SNF». */
        if (esEquipo) { let a; do { a = s; s = s.replace(/\s+(\d{1,2}|[A-Za-z]|SNF|SFN|Sub|Infantil|Juvenil|Masculino|Femenino)$/i, ""); } while (s !== a); }
        return NOMBRES[s.toLowerCase()] || titulo(s);
    }
    /* La letra o el número que distingue a los equipos de un mismo comité
       («A», «J», «2»); «01» y «1» son el mismo. */
    function sufijo(nombre) {
        let s = sinTilde(String(nombre || "")).trim().replace(PREFIJO, "").replace(/^CC Distrit(o|al) (de )?/i, "").trim(), m;
        const suf = [];
        while ((m = s.match(/\s+(\d{1,2}|[A-Za-z]|SNF)$/))) { const t = m[1].toUpperCase(); suf.unshift(/^\d+$/.test(t) ? String(+t) : t); s = s.slice(0, m.index); }
        return suf.join(" ");
    }
    /* El nombre de una universidad sale de js/universidades-nombres.js (lo
       comparte con torneos-universitarios.html). */
    const universidad = (nombre, esEquipo) => window.UniversidadesNombres.universidad(nombre, esEquipo);

    const RITMO = { C: "Clásico", R: "Rápido", B: "Blitz" };
    /* La categoría como se lee: en los JDN el código (U12), en las
       universidades lo que quiere decir. */
    const CATEGORIA = UNI ? { U: "Universitario", UB: "División B", FUN: "Funcionarios" } : {};
    function fmt(n) { if (isNaN(n)) return ""; const e = Math.floor(n); return (n - e) ? (e ? e + "½" : "½") : String(e); }
    function categoria(cod) {
        const [a, cat, mod] = cod.split("-");
        return { ritmo: RITMO[a] || "", zona: RITMO[a] ? "" : (a || "Única"), cat: CATEGORIA[cat] || cat, modo: mod[0] === "I" ? "Individual" : "Equipos", rama: mod[1] === "F" ? "Femenino" : "Absoluto" };
    }
    const clave = (n) => sinTilde(n).toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
    /* chess-results corta algunos nombres largos: «Diaz Charpentier Kristel Meli».
       Iguales a UniversidadesNombres.clave/mismo (js/universidades-nombres.js):
       torneos-universitarios.html abre la ficha de aquí con «#~~j=clave». */
    const mismo = (a, b) => a === b || (a.length > 12 && b.startsWith(a)) || (b.length > 12 && a.startsWith(b));

    let ind = [], eq = [], tam = {}, todos = [], finalistasDe = {};
    /* Los mejores tableros de las finales por equipos (jdn_tableros): el orden
       de la «Clasificación por tableros» de chess-results, tal cual. */
    let tabs = [], tamT = {};
    /* Los filtros: los datos completos quedan en TODO y ind/eq/tabs son lo que
       pasa los filtros; todo lo que se pinta lee ind/eq/tabs. La deducción del
       comité, «Jugó la final» y el «puesto de N» salen siempre de lo completo. */
    /* Cada jugador de cada torneo con sus partidas (jdn_jugadores): quiénes
       jugaron en cada equipo y el rendimiento contra el Elo. */
    let jugs = [];
    let TODO = null, comitesTodos = [];
    /* El comité de un jugador corregido a mano por administración
       (jdn_correcciones), y si quien mira administra: solo así ve los
       botones para corregir (la base es la que no deja escribir a nadie más). */
    let CORR = [], ADMIN = false;
    /* En las universidades no hay fases ni zonas: el filtro es el evento
       (JUNCOS, CONARE, FEDEU…), que cada edición trae en «serie». */
    const FILTROS = UNI ? ["serie", "cat", "rama", "modo", "ritmo"] : ["fase", "cat", "rama", "modo", "ritmo", "zona"];
    const FILTRO = { fase: "", serie: "", cat: "", rama: "", modo: "", ritmo: "", zona: "", q: "" };
    const CLAVES_FILTRO = [...FILTROS, "q"];
    const SERIES = { JUNCOS: "JUNCOS", CONARE: "Torneo CONARE", FEDEU: "FEDEU", FECUNDE: "FECUNDE", JUDUCA: "JUDUCA (Centroamérica)", GP: "Grand Prix universitario", OTROS: "Otros torneos" };

    const TABLA = UNI ? "uni_" : "jdn_";
    async function leerTodo() {
        const filas = [];
        for (let desde = 0; ; desde += 1000) {
            const { data, error } = await sb.from(TABLA + "resultados")
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
        if (UNI) return [];
        const filas = [];
        for (let desde = 0; ; desde += 1000) {
            const { data, error } = await sb.from(TABLA + "tableros")
                .select("edicion,codigo,tnr,tablero,orden,puesto,nombre,equipo,porcentaje,puntos,calculado")
                .order("edicion").order("codigo").order("tablero").order("orden")
                .range(desde, desde + 999);
            if (error) return [];
            filas.push(...data);
            if (data.length < 1000) return filas;
        }
    }
    async function leerCorrecciones() {
        const { data, error } = await sb.from(TABLA + "correcciones").select("id,nombre,edicion,comite,nota,creado").order("nombre");
        return error ? [] : data || [];
    }
    async function soyAdmin(uid) {
        const { data, error } = await sb.from("profiles").select("is_admin").eq("id", uid).maybeSingle();
        return !error && !!(data && data.is_admin);
    }
    /* La corrección de esa edición manda sobre la de todas. */
    const correccionDe = (k, ed) => CORR.find((c) => c.edicion === ed && mismo(c.nombre, k)) || CORR.find((c) => !c.edicion && mismo(c.nombre, k));

    /* Los jugadores también son un extra: sin ellos no salen los integrantes
       ni el rendimiento contra el Elo, y lo demás sigue igual. */
    async function leerJugadores() {
        const filas = [];
        for (let desde = 0; ; desde += 1000) {
            const { data, error } = await sb.from(TABLA + "jugadores")
                .select("edicion,codigo,tnr,orden,equipo,equipo_orden,tablero,nombre,elo,partidas,puntos,con_elo,puntos_elo,elo_rivales,esperado")
                .order("edicion").order("codigo").order("orden")
                .range(desde, desde + 999);
            if (error) return [];
            filas.push(...data);
            if (data.length < 1000) return filas;
        }
    }
    /* Un jugador individual toma el comité de su fila de jdn_resultados (el
       mismo torneo y el mismo orden), con lo deducido; un integrante de equipo,
       el de su equipo. */
    function prepararJugadores(filas) {
        const deInd = new Map(ind.map((r) => [r.tnr + "-" + r.orden, r]));
        for (const f of filas) {
            const enEquipo = !!f.equipo, r = deInd.get(f.tnr + "-" + f.orden);
            if (!enEquipo && !r) continue;
            if (UNI && enEquipo && window.UniversidadesNombres.extranjera(f.equipo)) continue;
            jugs.push({ ed: f.edicion, cod: f.codigo, tnr: f.tnr, ...categoria(f.codigo), fase: edicion(f.edicion).fase, orden: f.orden,
                nombre: enEquipo ? f.nombre : r.nombre, clave: clave(f.nombre), comite: enEquipo ? comite(f.equipo, true) : r.comite,
                equipo: enEquipo ? f.equipo.replace(/^C+D+R\s+/i, "") : "", sufijo: enEquipo ? sufijo(f.equipo) : "", eqRk: f.equipo_orden || 0, tablero: f.tablero || 0,
                elo: f.elo || 0, partidas: f.partidas, pts: Number(f.puntos), conElo: f.con_elo, ptsElo: Number(f.puntos_elo),
                eloRiv: f.elo_rivales || 0, esperado: f.esperado == null ? null : Number(f.esperado) });
        }
    }
    function prepararTableros(filas) {
        const previo = {};
        for (const f of filas) {
            const k = f.edicion + f.codigo + "-" + f.tablero;
            const rk = f.puesto || previo[k] || 0; previo[k] = rk;
            tabs.push({ ed: f.edicion, cod: f.codigo, tnr: f.tnr, ...categoria(f.codigo), tablero: f.tablero, rk, nombre: f.nombre,
                equipo: f.equipo.replace(/^C+D+R\s+/i, ""), comite: comite(f.equipo, true), pct: Number(f.porcentaje), pts: Number(f.puntos), fase: "final",
                calc: !!f.calculado });
            tamT[k] = (tamT[k] || 0) + 1;
        }
    }
    const nomTablero = (t) => t === 5 ? "Reserva" : "Tablero " + t;
    const pctTxt = (n) => n.toLocaleString("es-CR", { maximumFractionDigits: 1 }) + "\u00a0%";

    function preparar(filas, filasJ) {
        const previo = {};
        for (const f of filas) {
            const k = f.edicion + f.codigo;
            // Un puesto vacío es un empate con el de arriba.
            const rk = f.puesto || previo[k] || 0; previo[k] = rk;
            const esEquipo = f.codigo.split("-")[2][0] === "E";
            const r = { ed: f.edicion, cod: f.codigo, tnr: f.tnr, orden: f.orden, ...categoria(f.codigo), rk, pts: Number(f.puntos), fase: edicion(f.edicion).fase };
            if (esEquipo) eq.push(Object.assign(r, { equipo: f.nombre.replace(/^C+D+R\s+/i, ""), comite: comite(f.comite || f.nombre, true), crudo: f.comite || f.nombre, sufijo: sufijo(f.nombre), record: f.record || "" }));
            else ind.push(Object.assign(r, { nombre: f.nombre, clave: clave(f.nombre), comite: comite(f.comite, false), crudo: f.comite, deducido: false }));
            tam[k] = (tam[k] || 0) + 1;
        }
        // Lo que administración corrigió a mano manda sobre chess-results.
        for (const r of ind) {
            const c = correccionDe(r.clave, r.ed);
            if (c) { r.comiteOriginal = r.comite; r.comite = c.comite; r.corregido = true; }
        }
        // El comité que falta: el del mismo jugador en la misma edición, si no
        // en la eliminatoria de su ciclo, si no en cualquier otra.
        for (const r of ind) {
            if (r.comite) continue;
            const orden = [r.ed, ...EDICIONES.filter((e) => e.ciclo && e.ciclo === ED[r.ed].ciclo && e.id !== r.ed).map((e) => e.id), ...EDICIONES.map((e) => e.id)];
            for (const ed of orden) {
                const o = ind.find((x) => x.ed === ed && x.comite && mismo(x.clave, r.clave));
                if (o) { r.comite = o.comite; r.deducido = true; break; }
                // En las universidades, también el equipo en que jugó esa
                // edición: los JUDUCA individuales traen solo el país.
                const q = UNI && (filasJ || []).find((x) => x.edicion === ed && x.equipo && mismo(clave(x.nombre), r.clave));
                if (q && comite(q.equipo, true)) { r.comite = comite(q.equipo, true); r.deducido = true; break; }
            }
            if (!r.comite) r.comite = "Sin comité";
        }
        /* Solo las universidades de Costa Rica: las de afuera (las de los
           JUDUCA) no salen en ninguna lista, y con ellas sus jugadores y sus
           partidas. Se quitan después de deducir, para que un JUDUCA
           individual que trae solo el país tome antes la de su equipo. El
           puesto y el «de N» siguen siendo los del torneo completo. */
        if (UNI) {
            const afuera = (r) => window.UniversidadesNombres.extranjera(r.crudo) || window.UniversidadesNombres.extranjera(r.comite);
            ind = ind.filter((r) => !afuera(r));
            eq = eq.filter((r) => !afuera(r));
        }
        for (const r of ind) if (r.fase === "final") (finalistasDe[r.ed] = finalistasDe[r.ed] || []).push(r.clave);
        todos = resumen(() => true);
    }
    const jugoFinal = (r) => { const c = ED[r.ed].ciclo; return !!c && c !== r.ed && (finalistasDe[c] || []).some((k) => mismo(k, r.clave)); };

    const MED = ["", "oro", "plata", "bronce"];
    const slug = (n) => sinTilde(n).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const vacio = (n) => ({ nombre: n, zonas: new Set(), oro: 0, plata: 0, bronce: 0, ind: 0, eqm: 0, tab: 0, fin: new Set(), insc: 0, eqElim: 0, eqFin: 0 });
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
            else { x.eqFin++; if (r.rk >= 1 && r.rk <= 3) { x[MED[r.rk]]++; x.eqm++; } }
        }
        // Los tres primeros de cada tablero también son medallas oficiales.
        for (const r of tabs.filter(filtro)) if (r.rk >= 1 && r.rk <= 3) { const x = c(r.comite); x[MED[r.rk]]++; x.tab++; }
        delete C["Sin comité"];
        return Object.values(C).sort((a, b) => b.oro - a.oro || b.plata - a.plata || b.bronce - a.bronce
            || b.fin.size - a.fin.size || b.insc - a.insc || a.nombre.localeCompare(b.nombre, "es"));
    }

    /* Las palabras de las universidades: todo texto que se pinta pasa por T()
       (el(), sv() y los textContent de abajo), que en universidades.html
       cambia «comité» por «universidad» con su artículo, «JDN» por «torneos
       universitarios» y «final» por «edición» (cada torneo universitario da
       medallas: no hay eliminatoria). En jdn-comites.html no cambia nada.
       Los nombres de jugadores, equipos y universidades nunca traen estas
       palabras. */
    const PALABRAS = !UNI ? [] : [
        [/Resultados JDN por comit\u00e9/g, "Resultados universitarios por universidad"],
        [/\b(c|C)omit\u00e9s? de deportes\b/g, (m, c) => (c === "C" ? "U" : "u") + (m.includes("comit\u00e9s") ? "niversidades" : "niversidad")],
        [/\b(el|El|un|Un|este|Este|ese|del|al|mismo|otro|ningún|Ningún) comit\u00e9(?![\wáéíóúñ])/g, (m, a) => ({ el: "la", El: "La", un: "una", Un: "Una", este: "esta", Este: "Esta", ese: "esa", del: "de la", al: "a la", mismo: "misma", otro: "otra", "ningún": "ninguna", "Ningún": "Ninguna" })[a] + " universidad"],
        [/\b(los|Los|otros|todos los|Todos los|varios|sus|tres) comit\u00e9s\b/g, (m, a) => ({ los: "las", Los: "Las", otros: "otras", "todos los": "todas las", "Todos los": "Todas las", varios: "varias", sus: "sus", tres: "tres" })[a] + " universidades"],
        [/\bcomit\u00e9s\b/g, "universidades"], [/\bComit\u00e9s\b/g, "Universidades"],
        [/\bcomit\u00e9(?![\wáéíóúñ])/g, "universidad"], [/\bComit\u00e9(?![\wáéíóúñ])/g, "Universidad"],
        [/\b(universidad(?:es)?) (deducid|corregid|comparad|elegid)o(s?)\b/g, "$1 $2a$3"],
        [/\b(todos|Todos) los JDN\b/g, "$1 los torneos universitarios"],
        [/\botro JDN\b/g, "otro torneo universitario"], [/\blos JDN\b/g, "los torneos universitarios"], [/\bJDN\b/g, "torneos universitarios"],
        [/\bFinales \(clasificados\)/g, "Todas las ediciones"],
        [/\bcada eliminatoria y cada final\b/g, "cada edición"], [/\bcada eliminatoria\b/g, "cada edición"],
        [/\bfinal por final\b/g, "edición por edición"],
        [/\bfinales individuales\b/g, "torneos individuales"],
        [/\b(de|en) (todas )?las finales\b/g, (m, a) => a + " todas las ediciones"],
        [/\b(cada|una|esta|esa|la|Cada|Una|Esta|La) final\b/g, "$1 edición"], [/\bpor final\b/g, "por edición"],
        [/\bfinales\b/g, "ediciones"], [/\bFinales\b/g, "Ediciones"],
        [/\buniversidad tal como lo trae\b/g, "universidad tal como la trae"], [/\bno lo trae y no se pudo deducir\b/g, "no la trae y no se pudo deducir"],
        [/\(del mismo jugador en otra edición\)/g, "(del mismo jugador en otro torneo de esa edición, en su equipo o en otra edición)"],
    ];
    const T = (t) => { if (!UNI || typeof t !== "string") return t; for (const [a, b] of PALABRAS) t = t.replace(a, b); return t; };
    function el(tag, attrs, ...hijos) {
        const e = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) { if (k === "class") e.className = v; else e.setAttribute(k, k === "aria-label" || k === "placeholder" ? T(v) : v); }
        for (const h of hijos) if (h != null && h !== "") e.append(h instanceof Node ? h : document.createTextNode(T(String(h))));
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
       por tableros, art=20 la composición de los equipos con cada partida y
       art=4 la tabla cruzada. */
    function fuente(tnr, art, que) {
        if (!tnr) return el("td", { class: TD });
        return el("td", { class: TD }, el("a", {
            href: "https://chess-results.com/tnr" + tnr + ".aspx?lan=2&art=" + art + (art === 81 ? "&turdet=YES&flag=30" : art === 20 ? "&turdet=YES" : ""),
            target: "_blank", rel: "noopener", "aria-label": "Ver " + que + " en chess-results (se abre en otra pestaña)",
            class: "underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500",
        }, "chess-results"));
    }

    function tabla(caption, cabeza, filas) {
        const t = el("table", { class: "w-full text-sm" }, el("caption", { class: "sr-only" }, caption),
            el("thead", { class: "text-left text-xs uppercase tracking-wide text-brand-500 dark:text-brand-300" },
                el("tr", {}, ...cabeza.map((h) => el("th", { scope: "col", class: "px-3 py-2" + (h.num ? " text-right" : "") }, h.t || h)))));
        const b = el("tbody"); for (const f of filas) b.append(f); t.append(b);
        return el("div", { "data-tabla": "" }, menuBajar(t), el("div", { class: "overflow-x-auto mt-1 bg-white dark:bg-brand-900 rounded-2xl shadow-md" }, t));
    }

    /* ---- Bajar cada tabla: en Excel, como imagen y como imagen para el
       celular. Se lee lo que la tabla muestra (con los filtros puestos): una
       sola fuente para la pantalla, el Excel y la imagen. En el Excel, el
       enlace a chess-results va escrito; en la imagen, la columna «Comprobar»
       no va (un enlace en una imagen no se puede tocar). ---- */
    function datosTabla(t) {
        const ths = [...t.querySelectorAll("thead th")];
        return {
            titulo: (t.querySelector("caption") || {}).textContent || "Tabla",
            encabezados: ths.map((h) => h.textContent.trim()),
            derecha: ths.map((h) => h.classList.contains("text-right")),
            filas: [...t.querySelectorAll("tbody tr")].map((tr) => [...tr.cells].map((c) => {
                const a = c.querySelector("a[href*='chess-results']");
                return a ? a.href : c.textContent.replace(/\s+/g, " ").trim();
            })),
        };
    }
    function contexto() {
        const e = ED[$("edicion").value];
        return [e ? e.titulo + (e.detalle ? " (" + e.detalle + ")" : "") : "Todas las ediciones", $("filtros-activos").textContent.replace(/ Todo lo de abajo cuenta solo eso\.$/, "")].filter(Boolean).join(" · ");
    }
    const PIE = "Datos de chess-results.com, juntados por Ajedrez Integral · ajedrez-integral.com";
    function menuBajar(t) {
        const d = el("details", { class: "relative text-sm", "data-bajar": "" },
            el("summary", { class: "cursor-pointer select-none font-semibold text-brand-700 dark:text-brand-200 rounded-lg px-2 py-1 hover:bg-brand-100 dark:hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" }, "Bajar"));
        const caja = el("div", { class: "absolute right-0 z-10 mt-1 flex flex-col bg-white dark:bg-brand-900 rounded-xl shadow-lg p-1 min-w-[13rem]" });
        for (const [como, txt] of [["excel", "En Excel"], ["imagen", "Como imagen"], ["celular", "Imagen para celular"]]) {
            const b = el("button", { type: "button", "data-bajar-como": como, class: "text-left px-3 py-2 rounded-lg hover:bg-brand-100 dark:hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" }, txt);
            b.addEventListener("click", () => { d.open = false; bajarTabla(t, como); });
            caja.append(b);
        }
        d.append(caja);
        return el("div", { class: "flex justify-end mt-2" }, d);
    }
    async function bajarTabla(t, como) {
        const d = datosTabla(t), ctx = contexto();
        const nombre = (slug(d.titulo).slice(0, 70) || "tabla") + (como === "celular" ? "-celular" : "");
        try {
            if (como === "excel") {
                window.TablaExcel.bajar(nombre + ".xlsx", [{ nombre: d.titulo, filas: [d.encabezados, ...d.filas, [], [ctx], [PIE]] }]);
                return;
            }
            const sin = d.encabezados.indexOf("Comprobar");
            const quitar = (f) => sin < 0 ? f : f.filter((_, i) => i !== sin);
            await window.TablaImagen.bajar({ titulo: d.titulo, subtitulo: ctx, pie: PIE, encabezados: quitar(d.encabezados), derecha: quitar(d.derecha),
                filas: d.filas.map(quitar), celular: como === "celular" }, nombre + ".png");
        } catch (e) {
            window.Avisos.avisar("No se pudo bajar la tabla: " + (e.message || e), { tipo: "error" });
        }
    }

    /* ---- El informe de un comité en PDF: lo que muestra su ficha, en orden,
       con js/reporte-pdf.js (sin librería). Las gráficas van como texto (su
       descripción) y la columna «Comprobar» no va: en papel no se toca. ---- */
    function documentoFicha(caja) {
        const bloques = [];
        let titulo = "", subtitulo = "";
        const recorrer = (n) => {
            for (const h of n.children) {
                const tag = h.tagName;
                if (h.matches("[data-bajar], [data-no-pdf]")) continue;
                if (tag === "H2" && !titulo) titulo = h.textContent.trim();
                else if (tag === "H3") bloques.push({ tipo: "titulo", texto: h.textContent.trim() });
                else if (tag === "H4") bloques.push({ tipo: "subtitulo", texto: h.textContent.trim() });
                else if (tag === "P") { const t = h.textContent.trim(); if (t) { if (!subtitulo && !bloques.length) subtitulo = t; else bloques.push({ tipo: "parrafo", texto: t }); } }
                else if (tag === "TABLE") {
                    const d = datosTabla(h), sin = d.encabezados.indexOf("Comprobar");
                    const q = (f) => sin < 0 ? f : f.filter((_, i) => i !== sin);
                    const enc = q(d.encabezados), filas = d.filas.map(q);
                    const anchos = enc.map((x, i) => Math.max(5, Math.min(28, Math.max(x.length, ...filas.map((f) => String(f[i] || "").length)))));
                    bloques.push({ tipo: "tabla", encabezados: enc, anchos, filas });
                } else if (tag === "FIGURE") {
                    const svg = h.querySelector("svg[aria-label]");
                    if (svg) bloques.push({ tipo: "nota", texto: svg.getAttribute("aria-label") });
                } else if (h.classList.contains("grid") && h.querySelector("p")) {
                    bloques.push({ tipo: "lista", items: [...h.children].map((c) => [...c.querySelectorAll("p")].map((p) => p.textContent.trim()).join(" ")) });
                } else recorrer(h);
            }
        };
        recorrer(caja);
        bloques.push({ tipo: "separador" }, { tipo: "nota", texto: T("Cada dato se puede comprobar en chess-results.com: la ficha de este comité en ajedrez-integral.com/") + (UNI ? "universidades.html" : "jdn-comites.html") + " lleva el enlace de cada torneo. " + contexto() + "." });
        return { titulo: titulo || T("Informe del comité"), subtitulo: (subtitulo ? subtitulo + " · " : "") + T("Resultados JDN por comité") + " · " + window.HoraCR.fecha(new Date()),
            pie: T("Resultados JDN por comité") + " · Ajedrez Integral", autor: "Ajedrez Integral", bloques, fotos: [] };
    }
    async function bajarFicha(nombre) {
        try {
            const blob = await window.ReportePDF.generar(documentoFicha($("ficha")));
            const url = URL.createObjectURL(blob);
            const a = el("a", { href: url, download: (UNI ? "informe-universitario-" : "informe-jdn-") + slug(nombre) + ".pdf" });
            document.body.append(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (e) {
            window.Avisos.avisar("No se pudo armar el PDF: " + (e.message || e), { tipo: "error" });
        }
    }
    const ORD_R = { "Clásico": 0, "Rápido": 1, "Blitz": 2 };
    const ordCat = (a, b) => a.cat.localeCompare(b.cat) || a.rama.localeCompare(b.rama) || (ORD_R[a.ritmo] || 0) - (ORD_R[b.ritmo] || 0) || a.zona.localeCompare(b.zona) || a.rk - b.rk;

    function pintarGeneral(edSel) {
        const lista = resumen((r) => !edSel || r.ed === edSel);
        const e = ED[edSel];
        const finales = EDICIONES.filter((x) => x.fase === "final").map((x) => x.titulo.replace(/^Final /, ""));
        $("general-titulo").textContent = !e ? (UNI ? "Medallero de todos los torneos" : "Medallero de las finales") : e.fase === "final" ? "Medallero · " + e.titulo : "Participación · " + e.titulo;
        $("general-texto").textContent = UNI ? (!e
            ? "Medallas de las universidades de Costa Rica en los torneos universitarios de chess-results, de " + EDICIONES[EDICIONES.length - 1].id.slice(0, 4) + " a " + EDICIONES[0].id.slice(0, 4) + " (JUNCOS, CONARE, FEDEU, FECUNDE, los JUDUCA centroamericanos y otros), sumando individual y equipos. Elige una universidad para ver su ficha, o un torneo en «Edición» para ver solo ese. El orden es por oros, después platas y bronces."
            : "Medallas de " + e.titulo + (e.detalle ? " (" + e.detalle + ")" : "") + ", sumando individual y equipos. Elige una universidad para ver su ficha.")
            : !e
            ? "Medallas de las finales (" + finales.join(", ") + "), sumando individual, equipos y tableros, e inscritos de las eliminatorias. Elige un comité para ver su ficha, o una final en «Edición» para ver también sus mejores tableros. El orden es por oros, después platas y bronces."
            : e.fase === "final" ? "Medallas de " + e.titulo + (e.detalle ? " (" + e.detalle + ")" : "") + ", sumando individual, equipos y tableros. Debajo están sus mejores tableros. Elige un comité para ver su ficha."
                : "En una eliminatoria no hay medallas: la tabla dice cuántos jugadores y equipos inscribió cada comité. Elige un comité para ver su ficha.";
        const tb = document.querySelector("#medallero tbody"); tb.replaceChildren();
        for (const x of lista) {
            const b = el("button", { type: "button", "data-c": slug(x.nombre), class: "font-semibold text-left underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" }, x.nombre);
            b.addEventListener("click", () => elegir(b.dataset.c, $("edicion").value));
            // En las universidades no hay zonas, tableros ni eliminatorias: las
            // columnas son las de universidades.html.
            tb.append(UNI ? el("tr", {}, el("td", { class: TD }, b),
                td(x.oro || "", 1), td(x.plata || "", 1), td(x.bronce || "", 1), td(x.ind || "", 1), td(x.eqm || "", 1),
                td(x.fin.size || "", 1), td(x.eqFin || "", 1))
                : el("tr", {}, el("td", { class: TD }, b), td(zonaTxt(x.zonas)),
                td(x.oro || "", 1), td(x.plata || "", 1), td(x.bronce || "", 1), td(x.ind || "", 1), td(x.eqm || "", 1), td(x.tab || "", 1),
                td(x.fin.size || "", 1), td(x.insc || "", 1), td(x.eqElim || "", 1)));
        }
        if (!lista.length) tb.append(el("tr", {}, el("td", { class: TD, colspan: UNI ? "8" : "11" }, "No hay resultados de esta edición.")));
        pintarTableros(e && e.fase === "final" ? e : null);
        pintarPorFinal(!e);
        pintarParticipacion(e);
        pintarEfectividad(e);
        pintarCopa(e);
        pintarRendimiento(e);
        pintarEnfrentamientos(e);
        pintarComparar(!e);
        pintarCalidad(!e);
    }

    /* Participantes de cada comité: jugadores de los torneos individuales y
       equipos, por categoría y rama. Un jugador o un equipo que jugó varios
       ritmos cuenta una vez; un mismo equipo escrito distinto por
       chess-results («Goicochea», «CODEA 01») también. */
    const CATS = UNI ? ["Universitario-A", "Universitario-F", "División B-A", "Funcionarios-A"] : ["U12-A", "U12-F", "U16-A", "U16-F", "U20-A", "U20-F"];
    const catNom = (k) => k.replace("-A", " Abs.").replace("-F", " Fem.");
    const catDe = (r) => r.cat + "-" + r.rama[0];
    function distintos(claves) {
        const out = [];
        for (const k of [...claves].sort((a, b) => b.length - a.length)) if (!out.some((o) => mismo(o, k))) out.push(k);
        return out.length;
    }
    function participantes(ed) {
        const J = {}, E = {}, I = {}, vis = catsVisibles();
        for (const r of ind) if (r.ed === ed) ((J[r.comite] = J[r.comite] || {})[catDe(r)] = J[r.comite][catDe(r)] || []).push(r.clave);
        for (const r of eq) if (r.ed === ed) ((E[r.comite] = E[r.comite] || {})[catDe(r)] = E[r.comite][catDe(r)] || new Set()).add(r.sufijo);
        // Las personas que jugaron en sus equipos (al menos una partida).
        for (const r of jugs) if (r.ed === ed && r.equipo && r.partidas > 0 && vis.includes(catDe(r))) (I[r.comite] = I[r.comite] || []).push(r.clave);
        const P = {};
        for (const c of new Set([...Object.keys(J), ...Object.keys(E)])) {
            const x = P[c] = { nombre: c, j: 0, e: 0 };
            for (const k of vis) {
                const v = [J[c] && J[c][k] ? distintos(J[c][k]) : 0, E[c] && E[c][k] ? E[c][k].size : 0];
                x[k] = v; x.j += v[0]; x.e += v[1];
            }
            // pe: integrantes de sus equipos; pt: personas distintas, sumando
            // los torneos individuales (quien jugó los dos cuenta una vez).
            const enEq = I[c] || [];
            x.pe = distintos(enEq);
            x.pt = distintos([...vis.flatMap((k) => (J[c] && J[c][k]) || []), ...enEq]);
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
            const conInt = jugs.some((r) => r.ed === e.id && r.equipo);
            const tr = filas.map((x) => el("tr", { "data-comite": x.nombre }, td(x.nombre),
                ...CATS.map((k) => cifraParticipantes(x.nombre, e.id, x[k][0], x[k][1], " en " + catNom(k) + " de " + e.titulo)), td(x.j, 1), td(x.e, 1),
                conInt ? td(x.pe, 1) : null, conInt ? td(x.pt, 1) : null));
            tr.push(el("tr", { class: "font-semibold" }, td("Total"), ...tot.map((v) => td([v[0] ? String(v[0]) : "", v[1] ? v[1] + "E" : ""].filter(Boolean).join(" · ") || "—", 1)),
                td(filas.reduce((a, x) => a + x.j, 0), 1), td(filas.reduce((a, x) => a + x.e, 0), 1),
                conInt ? td(filas.reduce((a, x) => a + x.pe, 0), 1) : null, conInt ? td(filas.reduce((a, x) => a + x.pt, 0), 1) : null));
            caja.append(tabla("Participantes de cada comité en " + e.titulo + " por categoría y rama",
                ["Comité", ...CATS.map((k) => ({ t: catNom(k), num: 1 })), { t: "Jugadores", num: 1 }, { t: "Equipos", num: 1 },
                    ...(conInt ? [{ t: "Integrantes de equipos", num: 1 }, { t: "Personas", num: 1 }] : [])], tr));
            if (conInt) caja.append(el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-2" },
                "«Integrantes de equipos» son las personas que jugaron al menos una partida en los equipos del comité, según la composición de cada equipo en chess-results; «Personas» las suma a los jugadores individuales, y quien jugó los dos cuenta una vez."));
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
        const tipos = [["Individuales", cuenta(ind)], ["Por equipos", cuenta(eq)], ...(UNI ? [] : [["Tableros", cuenta(tabs)]])];
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
        const calc = de.some((r) => r.calc);
        caja.append(el("h2", { id: "tableros-titulo", class: "font-serif text-xl font-bold text-brand-800 dark:text-white" }, "Mejores tableros · " + e.titulo),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1" },
                (calc
                    ? "El primero de cada tablero en cada torneo por equipos. chess-results no publica la clasificación por tableros de esta final: está calculada acá con la regla de las finales 2018 (porcentaje, después puntos y rendimiento; al menos el 57 % de las rondas, el 42 % en la reserva), con los puntos y las partidas de la composición de cada equipo. No es el orden oficial."
                    : "El primero de cada tablero en cada torneo por equipos, según la clasificación por tableros de chess-results (porcentaje de puntos, con los desempates y el mínimo de partidas que fijó el árbitro de cada torneo).")
                + (nums.includes(5) ? " En esta final los equipos tenían una reserva." : "")));
        caja.append(tabla("Mejores tableros de " + e.titulo, ["Categoría", "Ritmo", ...nums.map(nomTablero), "Comprobar"], torneos.map((t) =>
            el("tr", { "data-torneo": t.cod }, td(t.cat + " " + t.rama), td(t.ritmo), ...nums.map((n) => {
                const mejores = de.filter((r) => r.cod === t.cod && r.tablero === n && r.rk === 1);
                return el("td", { class: TD.replace("whitespace-nowrap", "min-w-[10rem] align-top"), "data-tablero": n }, ...(mejores.length ? mejores.map((r) =>
                    el("span", { class: "block" }, el("span", { class: "font-semibold" }, r.nombre),
                        el("span", { class: "block text-xs text-brand-500 dark:text-brand-300" }, r.comite + " · " + pctTxt(r.pct)))) : ["—"]));
            }), fuenteTablero(t, e)))));
    }
    /* Un tablero calculado (2011-2017) no tiene clasificación por tableros en
       chess-results: se comprueba en la composición de los equipos, de donde
       salen sus puntos y sus partidas. */
    function fuenteTablero(r, e) {
        const de = r.cat + " " + r.rama + " " + r.ritmo + " de " + e.titulo;
        return r.calc ? fuente(r.tnr, 20, "la composición de los equipos de " + de) : fuente(r.tnr, 81, "la clasificación por tableros de " + de);
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
        const botonPdf = el("button", { type: "button", id: "ficha-pdf", "data-no-pdf": "", class: "text-sm font-semibold px-4 py-2 rounded-lg bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" }, "Informe del comité en PDF");
        botonPdf.addEventListener("click", () => bajarFicha(x.nombre));
        ficha.append(el("div", { class: "flex flex-wrap items-baseline justify-between gap-2" },
            el("h2", { id: "ficha-titulo", class: "font-serif text-2xl font-bold text-brand-800 dark:text-white" }, x.nombre),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300" }, (UNI ? "" : "Zona " + zonaTxt(x.zonas) + " · ") + lugar), botonPdf));
        ficha.append(UNI ? el("div", { class: "grid grid-cols-2 md:grid-cols-4 gap-3 mt-4" },
            cifra(x.oro + x.plata + x.bronce, `medallas (${x.oro} de oro, ${x.plata} de plata, ${x.bronce} de bronce)`),
            cifra(x.fin.size, "participaciones en torneos individuales"),
            cifra(x.eqFin, "equipos en torneos por equipos"),
            cifra(new Set([...ind, ...eq].filter((r) => r.comite === x.nombre).map((r) => r.ed)).size, "torneos universitarios en que participó"))
            : el("div", { class: "grid grid-cols-2 md:grid-cols-4 gap-3 mt-4" },
            cifra(x.oro + x.plata + x.bronce, `medallas en las finales (${x.oro} de oro, ${x.plata} de plata, ${x.bronce} de bronce)`),
            cifra(x.fin.size, "participaciones en finales individuales"),
            cifra(x.insc, "inscripciones en eliminatorias individuales"),
            cifra(x.eqElim, "equipos en eliminatorias")));
        ficha.append(el("h3", { class: "font-serif text-lg font-bold text-brand-800 dark:text-white mt-6" }, "Cómo viene"), evolucion(x.nombre));

        const filasEd = [], hayElo = jugs.some((r) => r.comite === x.nombre && r.esperado != null);
        for (const e of EDICIONES) {
            const ri = ind.filter((r) => r.ed === e.id && r.comite === x.nombre), re = eq.filter((r) => r.ed === e.id && r.comite === x.nombre);
            const rt = tabs.filter((r) => r.ed === e.id && r.comite === x.nombre);
            if (!ri.length && !re.length) continue;
            const n = (k) => e.fase === "final" ? [...ri, ...re, ...rt].filter((r) => r.rk === k).length : "—";
            const ce = contraElo(jugs.filter((r) => r.ed === e.id && r.comite === x.nombre));
            filasEd.push(el("tr", { "data-edicion": e.id }, td(e.titulo), td(ri.length, 1), td(re.length, 1), td(n(1), 1), td(n(2), 1), td(n(3), 1),
                hayElo ? td(ce.partidas ? signo(ce.dif) + " en " + ce.partidas : "—", 1) : null));
        }
        ficha.append(el("h3", { class: "font-serif text-lg font-bold text-brand-800 dark:text-white mt-6" }, "Edición por edición"));
        ficha.append(tabla("Jugadores, equipos y medallas de " + x.nombre + " en cada edición",
            ["Edición", { t: "Jugadores ind.", num: 1 }, { t: "Equipos", num: 1 }, { t: "Oro", num: 1 }, { t: "Plata", num: 1 }, { t: "Bronce", num: 1 },
                ...(hayElo ? [{ t: "Contra el Elo (puntos en partidas)", num: 1 }] : [])], filasEd));
        if (hayElo) {
            const ce = contraElo(jugs.filter((r) => r.comite === x.nombre && (!edVal || r.ed === edVal)));
            ficha.append(el("p", { class: "text-sm text-brand-600 dark:text-brand-300 mt-2", "data-contra-elo": x.nombre }, ce.partidas
                ? `Contra el Elo${edVal ? " en " + ED[edVal].titulo : ""}: sus jugadores sacaron ${fmt1(ce.puntos)} puntos en ${ce.partidas} partidas contra rivales con Elo, y por el Elo se esperaban ${fmt1(ce.esperado)}: ${ce.dif >= 0 ? fmt1(ce.dif) + " por encima" : fmt1(-ce.dif) + " por debajo"} de lo esperado. Ver «Rendimiento contra el Elo» en el medallero.`
                : "Sin partidas entre jugadores con Elo" + (edVal ? " en " + ED[edVal].titulo : "") + "."));
        }

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
                        r.deducido ? el("span", { class: "block text-xs text-brand-500 dark:text-brand-300" }, "comité deducido") : null,
                        r.corregido ? el("span", { class: "block text-xs text-brand-500 dark:text-brand-300" }, "comité corregido a mano") : null),
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
            const ri2 = jugs.filter((r) => r.ed === e.id && r.equipo && r.comite === x.nombre).sort((a, b) => a.cat.localeCompare(b.cat) || a.rama.localeCompare(b.rama)
                || (ORD_R[a.ritmo] || 0) - (ORD_R[b.ritmo] || 0) || a.equipo.localeCompare(b.equipo) || a.tablero - b.tablero);
            if (ri2.length) {
                sec.append(el("h4", { class: "font-semibold text-brand-800 dark:text-white mt-4" }, "Integrantes de sus equipos"));
                const cab = ["Categoría", final ? "Ritmo" : "Zona", "Equipo", { t: "Tablero", num: 1 }, "Jugador", { t: "Elo", num: 1 }, { t: "Partidas", num: 1 }, { t: "Puntos", num: 1 }, "Comprobar"];
                sec.append(tabla("Integrantes de los equipos de " + x.nombre + " en " + e.titulo, cab, ri2.map((r) => el("tr", { "data-integrante": r.nombre },
                    td(r.cat + " " + r.rama), td(final ? r.ritmo : r.zona), td(r.equipo), td(r.tablero || "—", 1),
                    el("td", { class: TD }, botonJugador(r.nombre, r.clave)), td(r.elo || "—", 1), td(r.partidas, 1), td(fmt(r.pts), 1),
                    fuente(r.tnr, 20, "la composición de los equipos de " + r.cat + " " + r.rama + " de " + e.titulo)))));
            }
            const rt = tabs.filter((r) => r.ed === e.id && r.comite === x.nombre).sort((a, b) => a.cat.localeCompare(b.cat) || a.rama.localeCompare(b.rama)
                || (ORD_R[a.ritmo] || 0) - (ORD_R[b.ritmo] || 0) || a.equipo.localeCompare(b.equipo) || a.tablero - b.tablero);
            if (rt.length) {
                sec.append(el("h4", { class: "font-semibold text-brand-800 dark:text-white mt-4" }, "Tableros de sus equipos"));
                if (rt.some((r) => r.calc)) sec.append(el("p", { class: "text-sm text-brand-500 dark:text-brand-300" },
                    "Calculados con la regla de las finales 2018: chess-results no publica la clasificación por tableros de esta final."));
                const cab = ["Categoría", "Ritmo", "Equipo", "Tablero", "Jugador", { t: "Puesto en el tablero", num: 1 }, { t: "Porcentaje", num: 1 }, { t: "Puntos", num: 1 }, "Medalla", "Comprobar"];
                sec.append(tabla("Tableros de los equipos de " + x.nombre + " en " + e.titulo, cab, rt.map((r) => el("tr", { "data-tablero-de": r.nombre },
                    td(r.cat + " " + r.rama), td(r.ritmo), td(r.equipo), td(nomTablero(r.tablero)), td(r.nombre),
                    td(r.rk + " de " + tamT[r.ed + r.cod + "-" + r.tablero], 1), td(pctTxt(r.pct), 1), td(fmt(r.pts), 1),
                    el("td", { class: TD }, medalla(r.rk)),
                    fuenteTablero(r, e)))));
            }
            ficha.append(sec);
        }
        ficha.append(rankingDe(x.nombre));
        ficha.append(contraComites(x.nombre, edVal));
        ficha.append(susJugadores(x.nombre));
    }

    /* ---- Filtros y búsqueda de jugador ---- */
    const RITMO_DE = { C: "Clásico", R: "Rápido", B: "Blitz" };
    function pasa(r, esTablero) {
        const F = FILTRO;
        if (F.fase && r.fase !== F.fase) return false;
        if (F.serie && (ED[r.ed] || {}).serie !== F.serie) return false;
        if (F.cat && r.cat !== F.cat) return false;
        if (F.rama && r.rama[0] !== F.rama) return false;
        if (F.modo === "I" && (esTablero || r.modo !== "Individual")) return false;
        if (F.modo === "E" && !esTablero && r.modo !== "Equipos") return false;
        if (F.ritmo && r.ritmo !== RITMO_DE[F.ritmo]) return false;
        if (F.zona && r.zona !== F.zona) return false;
        return true;
    }
    // El ritmo solo existe en las finales y la zona solo en las eliminatorias.
    const faseVisible = (f) => !(UNI && f === "elim") && (!FILTRO.fase || f === FILTRO.fase) && !(FILTRO.ritmo && f === "elim") && !(FILTRO.zona && f === "final");
    const hayFiltros = () => FILTROS.some((k) => FILTRO[k]);
    function aplicarFiltros() {
        ind = TODO.ind.filter((r) => pasa(r, false));
        eq = TODO.eq.filter((r) => pasa(r, false));
        tabs = TODO.tabs.filter((r) => pasa(r, true));
        jugs = TODO.jugs.filter((r) => pasa(r, !!r.equipo));
        todos = resumen(() => true);
        const txt = [];
        const nom = { fase: { elim: "Eliminatorias", final: "Finales" }, serie: SERIES, cat: UNI ? Object.fromEntries(Object.values(CATEGORIA).map((c) => [c, c])) : { U12: "U12", U16: "U16", U20: "U20" }, rama: { A: "Absoluto", F: "Femenino" },
            modo: { I: "Individual", E: "Equipos y tableros" }, ritmo: RITMO_DE, zona: { Z1: "Zona 1", Z2: "Zona 2" } };
        for (const k of Object.keys(nom)) if (FILTRO[k]) txt.push(nom[k][FILTRO[k]]);
        $("filtros-activos").textContent = !txt.length ? "" : T ("Filtros: " + txt.join(" · ") + ". Todo lo de abajo cuenta solo eso.");
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
        const filas = torneosDe((c) => c.includes(q))
            .sort((a, b) => b.r.ed.localeCompare(a.r.ed) || a.nombre.localeCompare(b.nombre, "es") || ordCat(a.r, b.r));
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
            return el("tr", { "data-jugador": f.nombre }, el("td", { class: TD }, botonJugador(f.nombre, clave(f.nombre))), r.comite === "Sin comité" ? td(r.comite) : el("td", { class: TD }, b), td(ED[r.ed].titulo),
                td(r.cat + " " + r.rama), td(r.ritmo || (r.zona === "Única" ? "Zona única" : "Zona " + r.zona.slice(1))), td(f.que), td(puestoDe(f), 1),
                el("td", { class: TD }, final && !f.sinMedalla ? medalla(r.rk) : null), fuente(f.tnr, f.art, "el torneo de " + f.nombre + " en " + ED[r.ed].titulo));
        })));
    }

    /* ---- Efectividad por ciclo: de la eliminatoria a la final ----
       Cada final cierra un ciclo con su eliminatoria (EDICIONES[].ciclo). Por
       comité: cuántos jugadores inscribió en la eliminatoria y cuántos de ellos
       jugaron la final, cuántos equipos llevó a cada una, y cuántas medallas
       sacó en la final por cada clasificado (jugador o equipo). */
    function ciclos() {
        return EDICIONES.filter((e) => e.fase === "elim" && e.ciclo && ED[e.ciclo] && Object.keys(tam).some((k) => k.startsWith(e.id)))
            .map((e) => ({ elim: e.id, final: e.ciclo, titulo: e.titulo.replace(/^Eliminatoria /, "") + " → " + ED[e.ciclo].titulo.replace(/^Final /, "") }));
    }
    function efectividad(lista) {
        const C = {};
        const c = (n) => C[n] || (C[n] = { nombre: n, jugE: 0, pasaron: 0, eqE: 0, eqF: 0, jugF: 0, med: 0 });
        for (const ci of lista) {
            // Los finalistas de cada comité: quien cambió de comité entre la
            // eliminatoria y la final no cuenta como «pasó» para ninguno.
            const finalistas = {};
            for (const r of ind) if (r.ed === ci.final) (finalistas[r.comite] = finalistas[r.comite] || new Set()).add(r.clave);
            const PE = participantes(ci.elim), PF = participantes(ci.final);
            for (const x of Object.values(PE)) { const y = c(x.nombre); y.jugE += x.j; y.eqE += x.e; }
            for (const x of Object.values(PF)) { const y = c(x.nombre); y.jugF += x.j; y.eqF += x.e; }
            // Quién de la eliminatoria jugó la final (con los nombres cortados juntos).
            const vistos = {};
            for (const r of ind) if (r.ed === ci.elim) (vistos[r.comite] = vistos[r.comite] || new Set()).add(r.clave);
            for (const [n, claves] of Object.entries(vistos)) {
                const unicos = []; for (const k of [...claves].sort((a, b) => b.length - a.length)) if (!unicos.some((o) => mismo(o, k))) unicos.push(k);
                const fin = [...(finalistas[n] || [])];
                c(n).pasaron += unicos.filter((k) => fin.some((f) => mismo(f, k))).length;
            }
            for (const x of resumen((r) => r.ed === ci.final)) c(x.nombre).med += x.oro + x.plata + x.bronce;
        }
        delete C["Sin comité"];
        return Object.values(C);
    }
    const pct = (a, b) => b ? Math.round(100 * a / b) + " %" : "—";
    function pintarEfectividad(e) {
        const caja = $("efectividad");
        caja.replaceChildren();
        const todosCiclos = ciclos();
        const lista = e ? todosCiclos.filter((ci) => ci.elim === e.id || ci.final === e.id) : todosCiclos;
        if (!lista.length || FILTRO.ritmo || FILTRO.zona || FILTRO.fase) { caja.classList.add("hidden"); return; }
        caja.classList.remove("hidden");
        const filas = efectividad(lista).filter((x) => x.jugE + x.eqE + x.jugF + x.eqF)
            .sort((a, b) => b.pasaron - a.pasaron || b.med - a.med || a.nombre.localeCompare(b.nombre, "es"));
        caja.append(el("h2", { id: "efectividad-titulo", class: "font-serif text-xl font-bold text-brand-800 dark:text-white" },
            "De la eliminatoria a la final · " + (lista.length === 1 ? "ciclo " + lista[0].titulo : "todos los ciclos")),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1" },
                "Cuántos de los jugadores que inscribió cada comité en la eliminatoria jugaron la final del mismo ciclo, cuántos equipos llevó a cada una, y cuántas medallas sacó en la final por cada clasificado (jugador o equipo). " +
                (lista.length > 1 ? "Suma los ciclos " + lista.map((ci) => ci.titulo).join(", ") + "." : "")));
        const tr = filas.map((x) => {
            const clas = x.jugF + x.eqF;
            const b = el("button", { type: "button", class: "font-semibold text-left underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" }, x.nombre);
            b.addEventListener("click", () => elegir(slug(x.nombre), e ? e.id : ""));
            return el("tr", { "data-comite": x.nombre }, el("td", { class: TD }, b), td(x.jugE, 1), td(x.pasaron, 1), td(pct(x.pasaron, x.jugE), 1),
                td(x.eqE, 1), td(x.eqF, 1), td(x.jugF, 1), td(x.med, 1), td(clas ? (x.med / clas).toLocaleString("es-CR", { maximumFractionDigits: 1 }) : "—", 1));
        });
        const s = (k) => filas.reduce((a, x) => a + x[k], 0);
        tr.push(el("tr", { class: "font-semibold" }, td("Total"), td(s("jugE"), 1), td(s("pasaron"), 1), td(pct(s("pasaron"), s("jugE")), 1),
            td(s("eqE"), 1), td(s("eqF"), 1), td(s("jugF"), 1), td(s("med"), 1),
            td((s("jugF") + s("eqF")) ? (s("med") / (s("jugF") + s("eqF"))).toLocaleString("es-CR", { maximumFractionDigits: 1 }) : "—", 1)));
        caja.append(tabla("De la eliminatoria a la final, por comité", ["Comité", { t: "Jugadores en la eliminatoria", num: 1 }, { t: "Jugaron la final", num: 1 }, { t: "Pasaron", num: 1 },
            { t: "Equipos en la eliminatoria", num: 1 }, { t: "Equipos en la final", num: 1 }, { t: "Jugadores en la final", num: 1 }, { t: "Medallas en la final", num: 1 }, { t: "Medallas por clasificado", num: 1 }], tr));
    }

    /* ---- La copa: puntos por puesto en las finales ----
       Como la tabla de unos juegos: cada jugador individual, cada equipo y
       (si se marca) cada tablero suma por su puesto, con la escala elegida.
       Así cuentan también el 4.º, el 5.º… La escala no es oficial: la elige
       quien mira (ver «La copa de puntos por puesto»). Un empate sin
       desempatar comparte el puesto, y los dos suman sus puntos. */
    const ESCALAS = [
        { id: "8", nombre: "Los ocho primeros: 10, 8, 6, 5, 4, 3, 2, 1", puntos: [10, 8, 6, 5, 4, 3, 2, 1] },
        { id: "6", nombre: "Los seis primeros: 7, 5, 4, 3, 2, 1", puntos: [7, 5, 4, 3, 2, 1] },
        { id: "3", nombre: "Solo el podio: 3, 2, 1", puntos: [3, 2, 1] },
        { id: "x", nombre: "Otra escala (escríbela)", puntos: null },
    ];
    // En las universidades no hay clasificación por tableros: la copa no los suma.
    const COPA = { escala: "8", propia: "", tableros: !UNI };
    // Cualquier cosa que no sea un número separa: «10, 8, 6», «10-8-6» o «10 8 6».
    const leerEscala = (t) => String(t || "").split(/[^0-9.]+/).filter(Boolean).map(Number).filter((n) => isFinite(n) && n >= 0 && n <= 1000).slice(0, 40);
    function escalaCopa() {
        const e = ESCALAS.find((x) => x.id === COPA.escala);
        if (e && e.puntos) return e.puntos;
        const v = leerEscala(COPA.propia);
        return v.length ? v : [3, 2, 1];
    }
    function copa(filtro) {
        const P = escalaCopa(), C = {};
        const sumar = (r, k) => {
            const v = r.rk >= 1 && r.rk <= P.length ? P[r.rk - 1] : 0;
            if (!v) return;
            const x = C[r.comite] || (C[r.comite] = { nombre: r.comite, total: 0, ind: 0, eq: 0, tab: 0, puestos: 0 });
            x[k] += v; x.total += v; x.puestos++;
        };
        for (const r of ind) if (r.fase === "final" && filtro(r)) sumar(r, "ind");
        for (const r of eq) if (r.fase === "final" && filtro(r)) sumar(r, "eq");
        if (COPA.tableros) for (const r of tabs) if (filtro(r)) sumar(r, "tab");
        delete C["Sin comité"];
        return Object.values(C).sort((a, b) => b.total - a.total || b.puestos - a.puestos || a.nombre.localeCompare(b.nombre, "es"));
    }
    const num1 = (n) => n.toLocaleString("es-CR", { maximumFractionDigits: 1 });
    const SEL = "w-full px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm focus:ring-2 focus:ring-accent-500 outline-none";
    const ETQ = "block text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1";
    let copaEd = null;
    function pintarCopa(e) {
        const caja = $("copa");
        copaEd = e;
        const ver = (!e || e.fase === "final") && FILTRO.fase !== "elim" && !FILTRO.zona;
        caja.classList.toggle("hidden", !ver);
        if (!ver) return;
        if (!caja.dataset.armado) {
            caja.dataset.armado = "1";
            const sel = el("select", { id: "copa-escala", class: SEL }, ...ESCALAS.map((x) => el("option", { value: x.id }, x.nombre)));
            const propia = el("input", { id: "copa-propia", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "Por ejemplo: 9, 7, 6, 5, 4, 3, 2, 1", class: SEL });
            const tab = el("input", { id: "copa-tableros", type: "checkbox", class: "w-4 h-4 rounded focus:ring-2 focus:ring-accent-500" });
            const cajaPropia = el("div", {}, el("label", { for: "copa-propia", class: ETQ }, "Puntos del 1.º, del 2.º…"), propia);
            caja.append(el("h2", { id: "copa-titulo", class: "font-serif text-xl font-bold text-brand-800 dark:text-white" }, "La copa: puntos por puesto"),
                el("p", { id: "copa-texto", class: "text-sm text-brand-500 dark:text-brand-300 mt-1" }),
                el("div", { class: "grid sm:grid-cols-3 gap-3 mt-3 items-end" },
                    el("div", {}, el("label", { for: "copa-escala", class: ETQ }, "Puntos por puesto"), sel), cajaPropia,
                    UNI ? null : el("label", { for: "copa-tableros", class: "flex items-center gap-2 text-sm text-brand-700 dark:text-brand-200 py-2" }, tab, "Sumar también los puestos de cada tablero")),
                el("div", { id: "copa-tabla" }));
            sel.value = COPA.escala; propia.value = COPA.propia; tab.checked = COPA.tableros;
            const cambio = () => {
                COPA.escala = sel.value; COPA.propia = propia.value.trim(); COPA.tableros = tab.checked;
                enlace($("comite").value, $("edicion").value);
                dibujarCopa();
            };
            sel.addEventListener("change", cambio); propia.addEventListener("input", cambio); tab.addEventListener("change", cambio);
        }
        dibujarCopa();
    }
    function dibujarCopa() {
        const e = copaEd, P = escalaCopa();
        $("copa-propia").parentElement.classList.toggle("hidden", COPA.escala !== "x");
        $("copa-texto").textContent = T("Una tabla de puntos por puesto en " + (e ? e.titulo : "las finales") + ", como la copa de unos juegos: el 1.º suma " + num1(P[0])
            + (P.length > 1 ? ", el 2.º " + num1(P[1]) : "") + (P.length > 2 ? ", el 3.º " + num1(P[2]) : "") + (P.length > 3 ? " y así hasta el " + P.length + ".º" : "")
            + ". Así cuentan también los puestos sin medalla. Suma cada jugador individual" + (UNI ? " y cada equipo" : ", cada equipo y, si se marca, cada tablero") + "; un empate sin desempatar comparte el puesto y sus puntos. "
            + (UNI ? "La escala no es oficial: elige la del reglamento de cada torneo, o escribe otra." : "La escala no es oficial: elige la del reglamento de los JDN, o escribe otra.") + " La última columna trae las medallas, para comparar.");
        const lista = copa((r) => !e || r.ed === e.id);
        const med = Object.fromEntries(resumen((r) => !e || r.ed === e.id).map((x) => [x.nombre, x]));
        const caja = $("copa-tabla");
        caja.replaceChildren();
        if (!lista.length) { caja.append(el("p", { class: "mt-2 text-brand-500 dark:text-brand-300 italic" }, "Ningún comité suma puntos con estos filtros.")); return; }
        let pos = 0, antes = null;
        const filas = lista.map((x, i) => {
            if (x.total !== antes) { pos = i + 1; antes = x.total; }
            const m = med[x.nombre] || vacio(x.nombre);
            const b = el("button", { type: "button", class: "font-semibold text-left underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" }, x.nombre);
            b.addEventListener("click", () => elegir(slug(x.nombre), e ? e.id : ""));
            return el("tr", { "data-comite": x.nombre }, td(pos, 1), el("td", { class: TD }, b), el("td", { class: TDN + " font-semibold" }, num1(x.total)),
                td(num1(x.ind), 1), td(num1(x.eq), 1), COPA.tableros ? td(num1(x.tab), 1) : null, td(x.puestos, 1), td(m.oro + "·" + m.plata + "·" + m.bronce, 1));
        });
        caja.append(tabla("La copa: puntos de cada comité por sus puestos en " + (e ? e.titulo : "las finales"),
            [{ t: "Puesto", num: 1 }, "Comité", { t: "Puntos", num: 1 }, { t: "Individual", num: 1 }, { t: "Equipos", num: 1 },
                ...(COPA.tableros ? [{ t: "Tableros", num: 1 }] : []), { t: "Puestos que suman", num: 1 }, { t: "Oro·Plata·Bronce", num: 1 }], filas));
    }

    /* ---- El rendimiento contra el Elo ----
       De jdn_jugadores: partida por partida entre dos jugadores con Elo, los
       puntos que se esperaban por la fórmula de FIDE (diferencia topada en
       400) contra los que sacó. Ver «El rendimiento contra el Elo». */
    function contraElo(lista) {
        const r = { partidas: 0, puntos: 0, esperado: 0, dif: 0, jugadores: 0 };
        for (const x of lista) if (x.esperado != null && x.conElo) { r.partidas += x.conElo; r.puntos += x.ptsElo; r.esperado += x.esperado; r.jugadores++; }
        r.dif = r.puntos - r.esperado;
        return r;
    }
    const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString("es-CR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    // El signo va escrito: el dato nunca depende de un color.
    const signo = (n) => (Math.round(n * 10) === 0 ? "" : n > 0 ? "+" : "−") + fmt1(Math.abs(n));
    /* El Elo de su actuación: el Elo medio de sus rivales más la diferencia
       que da su porcentaje (la curva de la fórmula de FIDE, con 0 % y 100 %
       a 800 puntos). Es aproximado: los rivales sin Elo no cuentan. */
    function actuacion(x) {
        if (!x.conElo || !x.eloRiv) return null;
        const p = x.ptsElo / x.conElo;
        const d = p <= 0 ? -800 : p >= 1 ? 800 : Math.max(-800, Math.min(800, -400 * Math.log10(1 / p - 1)));
        return Math.round(x.eloRiv + d);
    }
    const modalidad = (r) => r.equipo ? r.equipo + " · tablero " + (r.tablero || "—") : "Individual";
    function pintarRendimiento(e) {
        const caja = $("rendimiento");
        caja.replaceChildren();
        const de = jugs.filter((r) => !e || r.ed === e.id);
        const C = {};
        for (const r of de) if (r.comite !== "Sin comité") (C[r.comite] = C[r.comite] || []).push(r);
        const lista = Object.entries(C).map(([n, rs]) => ({ nombre: n, ...contraElo(rs), elo: (() => { const v = rs.filter((x) => x.elo); return v.length ? Math.round(v.reduce((a, x) => a + x.elo, 0) / v.length) : 0; })() }))
            .filter((x) => x.partidas).sort((a, b) => b.dif - a.dif || a.nombre.localeCompare(b.nombre, "es"));
        caja.classList.toggle("hidden", !lista.length);
        if (!lista.length) return;
        caja.append(el("h2", { id: "rendimiento-titulo", class: "font-serif text-xl font-bold text-brand-800 dark:text-white" }, "Rendimiento contra el Elo · " + (e ? e.titulo : "todas las ediciones")),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1" },
                "Cuántos puntos sacaron los jugadores de cada comité frente a los que se esperaban por su Elo y el de sus rivales, partida por partida, con la fórmula de FIDE. Un número positivo es que rindieron por encima de su Elo: el comité que más sorprende, no solo el que más gana. "
                + "Cuentan las partidas jugadas (sin forfeits ni byes) entre dos jugadores con Elo, individuales y de equipo; el Elo es el nacional si lo hay. Muchos jugadores aparecen con 1400 justo: si es el Elo con que se entra a la lista, quien recién empieza puede rendir por encima sin que sea sorpresa."));
        const filas = lista.map((x) => {
            const b = el("button", { type: "button", class: "font-semibold text-left underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" }, x.nombre);
            b.addEventListener("click", () => elegir(slug(x.nombre), e ? e.id : ""));
            return el("tr", { "data-comite": x.nombre }, el("td", { class: TD }, b), td(x.jugadores, 1), td(x.elo || "—", 1), td(x.partidas, 1), td(fmt1(x.puntos), 1), td(fmt1(x.esperado), 1),
                el("td", { class: TDN + " font-semibold" }, signo(x.dif)), td(signo(100 * x.dif / x.partidas), 1));
        });
        const t = contraElo(de.filter((r) => r.comite !== "Sin comité"));
        filas.push(el("tr", { class: "font-semibold" }, td("Total"), td(t.jugadores, 1), td("", 1), td(t.partidas, 1), td(fmt1(t.puntos), 1), td(fmt1(t.esperado), 1), td(signo(t.dif), 1), td("", 1)));
        caja.append(tabla("Rendimiento de cada comité contra el Elo", ["Comité", { t: "Jugadores (torneos)", num: 1 }, { t: "Elo medio", num: 1 }, { t: "Partidas con Elo", num: 1 },
            { t: "Puntos", num: 1 }, { t: "Esperados", num: 1 }, { t: "Diferencia", num: 1 }, { t: "Por cada 100 partidas", num: 1 }], filas));
        // Los que más sorprendieron: torneo por torneo, con al menos 3 partidas con Elo.
        const top = de.filter((r) => r.esperado != null && r.conElo >= 3 && r.comite !== "Sin comité")
            .map((r) => ({ r, dif: r.ptsElo - r.esperado })).sort((a, b) => b.dif - a.dif || a.r.nombre.localeCompare(b.r.nombre, "es")).slice(0, 20);
        if (!top.length) return;
        caja.append(el("h3", { class: "font-serif text-lg font-bold text-brand-800 dark:text-white mt-5" }, "Quiénes más sorprendieron"),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1" }, "Los " + top.length + " torneos en que un jugador sacó más puntos por encima de lo esperado (al menos 3 partidas contra rivales con Elo). «Actuación» es el Elo que corresponde a su resultado contra esos rivales."));
        caja.append(tabla("Los jugadores que más rindieron por encima de su Elo", ["Jugador", "Comité", "Edición", "Categoría", "Modalidad", { t: "Elo", num: 1 }, { t: "Elo medio de sus rivales", num: 1 },
            { t: "Partidas", num: 1 }, { t: "Puntos", num: 1 }, { t: "Esperados", num: 1 }, { t: "Diferencia", num: 1 }, { t: "Actuación", num: 1 }, "Comprobar"],
            top.map(({ r, dif }) => el("tr", { "data-sorpresa": r.nombre }, el("td", { class: TD }, botonJugador(r.nombre, r.clave)), td(r.comite), td(ED[r.ed].titulo),
                td(r.cat + " " + r.rama + " · " + (r.ritmo || (r.zona === "Única" ? "Zona única" : "Zona " + r.zona.slice(1)))), td(modalidad(r)), td(r.elo, 1), td(r.eloRiv || "—", 1),
                td(r.conElo, 1), td(fmt1(r.ptsElo), 1), td(fmt1(r.esperado), 1), el("td", { class: TDN + " font-semibold" }, signo(dif)), td(actuacion(r) || "—", 1),
                fuente(r.tnr, r.equipo ? 20 : 4, (r.equipo ? "la composición de los equipos" : "la tabla cruzada") + " de " + r.cat + " " + r.rama + " de " + ED[r.ed].titulo)))));
    }

    /* ---- Los enfrentamientos entre comités ----
       De jdn_partidas: cada partida jugada, una vez, con los dos jugadores
       (su orden en jdn_jugadores). Son unas 18 000: se leen DESPUÉS de pintar
       la página, de mil en mil, y las secciones que las usan dicen «Cargando»
       mientras tanto. Un comité contra sí mismo (dos equipos del mismo comité)
       no cuenta. Los encuentros de equipos salen de sumar los tableros de cada
       ronda entre los mismos dos equipos. Ver «Los enfrentamientos entre
       comités». */
    let PARTIDAS = null, cargando = null;
    function cargarPartidas() {
        if (!cargando) cargando = (async () => {
            const filas = [];
            for (let desde = 0; ; desde += 1000) {
                const { data, error } = await sb.from(TABLA + "partidas").select("tnr,ronda,orden,rival,puntos")
                    .order("tnr").order("ronda").order("orden").order("rival").order("vez").range(desde, desde + 999);
                if (error) { PARTIDAS = []; return; }
                filas.push(...data);
                if (data.length < 1000) break;
            }
            const de = new Map(TODO.jugs.map((r) => [r.tnr + "-" + r.orden, r]));
            PARTIDAS = filas.map((f) => ({ tnr: f.tnr, ronda: f.ronda, a: de.get(f.tnr + "-" + f.orden), b: de.get(f.tnr + "-" + f.rival), pa: Number(f.puntos) }))
                .filter((x) => x.a && x.b);
        })();
        return cargando;
    }
    /* Las partidas que pasan los filtros y la edición elegida. */
    function partidasVisibles(ed) {
        const vale = new Set(jugs.map((r) => r.tnr));
        return (PARTIDAS || []).filter((x) => vale.has(x.tnr) && (!ed || x.a.ed === ed));
    }
    /* Lo de un comité contra cada otro: partidas G-E-P desde su lado y los
       encuentros de equipos. */
    function contra(nombre, lista) {
        const R = {};
        const de = (n) => R[n] || (R[n] = { nombre: n, g: 0, e: 0, p: 0, pts: 0, n: 0, eg: 0, ee: 0, ep: 0 });
        const encuentros = {};
        for (const x of lista) {
            const ca = x.a.comite, cb = x.b.comite;
            if (ca === cb || (ca !== nombre && cb !== nombre)) continue;
            const yo = ca === nombre ? x.pa : 1 - x.pa, otro = ca === nombre ? cb : ca;
            const r = de(otro);
            r.n++; r.pts += yo;
            if (yo === 1) r.g++; else if (yo === 0) r.p++; else r.e++;
            if (x.a.equipo) {
                const mio = ca === nombre ? x.a : x.b, suyo = ca === nombre ? x.b : x.a;
                const k = x.tnr + "|" + x.ronda + "|" + mio.eqRk + "|" + suyo.eqRk;
                (encuentros[k] = encuentros[k] || { otro, yo: 0, el: 0 });
                encuentros[k].yo += yo; encuentros[k].el += 1 - yo;
            }
        }
        for (const m of Object.values(encuentros)) { const r = de(m.otro); if (m.yo > m.el) r.eg++; else if (m.yo < m.el) r.ep++; else r.ee++; }
        delete R["Sin comité"];
        return Object.values(R).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, "es"));
    }
    const resultado = (pa) => pa === 1 ? "1–0" : pa === 0 ? "0–1" : "½–½";
    const pctTxt0 = (a, b) => b ? Math.round(100 * a / b) + " %" : "—";

    /* En la ficha del comité: contra quién gana y pierde. */
    function contraComites(nombre, ed) {
        const caja = el("section", { class: "mt-6", id: "contra-comites", "data-contra": nombre },
            el("h3", { class: "font-serif text-lg font-bold text-brand-800 dark:text-white" }, "Contra qué comités"));
        if (!PARTIDAS) { caja.append(el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1", role: "status" }, "Cargando las partidas…")); return caja; }
        const lista = contra(nombre, partidasVisibles(ed));
        caja.append(el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1" }, lista.length
            ? "Las partidas jugadas de verdad de sus jugadores (individuales y de equipo) contra cada comité, desde su lado: ganadas, tablas y perdidas; y los encuentros de equipo contra equipos de ese comité. Toca un comité para ver el historial completo, partida por partida."
            : "Sin partidas con estos filtros."));
        if (!lista.length) return caja;
        caja.append(tabla("Partidas de " + nombre + " contra cada comité", ["Contra", { t: "Partidas", num: 1 }, { t: "Ganadas", num: 1 }, { t: "Tablas", num: 1 }, { t: "Perdidas", num: 1 },
            { t: "Puntos", num: 1 }, { t: "Porcentaje", num: 1 }, { t: "Encuentros de equipo G-E-P", num: 1 }],
            lista.map((r) => {
                const b = el("button", { type: "button", class: "font-semibold text-left underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" }, r.nombre);
                b.addEventListener("click", () => abrirDuelo(nombre, r.nombre));
                return el("tr", { "data-rival": r.nombre }, el("td", { class: TD }, b), td(r.n, 1), td(r.g, 1), td(r.e, 1), td(r.p, 1), td(fmt(r.pts), 1), td(pctTxt0(r.pts, r.n), 1),
                    td(r.eg + r.ee + r.ep ? r.eg + "-" + r.ee + "-" + r.ep : "—", 1));
            })));
        return caja;
    }

    /* En el medallero: dos comités frente a frente, o los más jugados. */
    const DUELO = { a: "", b: "" };
    function abrirDuelo(a, b) {
        DUELO.a = a; DUELO.b = b;
        elegir("", $("edicion").value);
        const s = $("enfrentamientos");
        if (s) s.scrollIntoView({ behavior: "smooth" });
    }
    function pintarEnfrentamientos(e) {
        const caja = $("enfrentamientos");
        caja.classList.remove("hidden");
        if (!caja.dataset.armado) {
            caja.dataset.armado = "1";
            caja.append(el("h2", { id: "enfrentamientos-titulo", class: "font-serif text-xl font-bold text-brand-800 dark:text-white" }, "Enfrentamientos entre comités"),
                el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1" }, "Elige dos comités para ver su historial: cada partida entre jugadores de uno y otro, en torneos individuales y por equipos, y los encuentros entre sus equipos. Sin elegir, salen los enfrentamientos más jugados."));
            const fila = el("div", { class: "grid sm:grid-cols-2 gap-3 mt-3" });
            for (const k of ["a", "b"]) {
                const id = "duelo-" + k;
                const sel = el("select", { id, class: SEL }, el("option", { value: "" }, "—"),
                    ...[...comitesTodos].sort((x, y) => x.nombre.localeCompare(y.nombre, "es")).map((x) => el("option", { value: x.nombre }, x.nombre)));
                sel.addEventListener("change", () => { DUELO[k] = sel.value; dibujarDuelo(); });
                fila.append(el("div", {}, el("label", { for: id, class: ETQ }, k === "a" ? "Comité" : "Contra"), sel));
            }
            caja.append(fila, el("div", { id: "duelo-resultado" }));
        }
        $("duelo-a").value = DUELO.a; $("duelo-b").value = DUELO.b;
        dibujarDuelo();
    }
    function dibujarDuelo() {
        const g = $("duelo-resultado");
        if (!g) return;
        g.replaceChildren();
        if (!PARTIDAS) { g.append(el("p", { class: "mt-3 text-sm text-brand-500 dark:text-brand-300", role: "status" }, "Cargando las partidas…")); return; }
        const ed = $("edicion").value, lista = partidasVisibles(ed);
        const { a, b } = DUELO;
        if (!a || !b || a === b) {
            // Los más jugados: cada par de comités una vez.
            const P = {};
            for (const x of lista) {
                const ca = x.a.comite, cb = x.b.comite;
                if (ca === cb || ca === "Sin comité" || cb === "Sin comité") continue;
                const [u, v] = [ca, cb].sort((p, q) => p.localeCompare(q, "es")), k = u + "|" + v;
                const r = P[k] || (P[k] = { u, v, n: 0, pu: 0 });
                r.n++; r.pu += ca === u ? x.pa : 1 - x.pa;
            }
            const top = Object.values(P).sort((p, q) => q.n - p.n || p.u.localeCompare(q.u, "es") || p.v.localeCompare(q.v, "es")).slice(0, 15);
            if (!top.length) { g.append(el("p", { class: "mt-3 text-sm text-brand-500 dark:text-brand-300 italic" }, "Sin partidas con estos filtros.")); return; }
            g.append(el("h3", { class: "font-serif text-lg font-bold text-brand-800 dark:text-white mt-5" }, "Los enfrentamientos más jugados"));
            g.append(tabla("Los enfrentamientos entre comités con más partidas", ["Comités", { t: "Partidas", num: 1 }, { t: "Puntos", num: 1 }],
                top.map((r) => {
                    const bt = el("button", { type: "button", class: "font-semibold text-left underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" }, r.u + " contra " + r.v);
                    bt.addEventListener("click", () => abrirDuelo(r.u, r.v));
                    return el("tr", { "data-par": r.u + "|" + r.v }, el("td", { class: TD }, bt), td(r.n, 1), td(fmt(r.pu) + " – " + fmt(r.n - r.pu), 1));
                })));
            return;
        }
        const pp = lista.filter((x) => (x.a.comite === a && x.b.comite === b) || (x.a.comite === b && x.b.comite === a))
            .map((x) => x.a.comite === a ? { x, ja: x.a, jb: x.b, pa: x.pa } : { x, ja: x.b, jb: x.a, pa: 1 - x.pa })
            .sort((p, q) => q.ja.ed.localeCompare(p.ja.ed) || ordCat(p.ja, q.ja) || p.x.ronda - q.x.ronda);
        const r = contra(a, lista).find((y) => y.nombre === b) || { n: 0, g: 0, e: 0, p: 0, pts: 0, eg: 0, ee: 0, ep: 0 };
        g.append(el("p", { class: "mt-4 font-semibold text-brand-800 dark:text-white", "data-duelo-resumen": "" }, r.n
            ? `${a} y ${b} jugaron ${r.n} partida${r.n === 1 ? "" : "s"}${ed ? " en " + ED[ed].titulo : ""}: ${a} ganó ${r.g}, ${r.e} terminaron en tablas y ${b} ganó ${r.p} (${fmt(r.pts)} a ${fmt(r.n - r.pts)}).`
              + (r.eg + r.ee + r.ep ? ` En encuentros de equipos: ${a} ganó ${r.eg}, empataron ${r.ee} y ${b} ganó ${r.ep}.` : "")
            : `${a} y ${b} no jugaron entre sí` + (ed ? " en " + ED[ed].titulo : "") + (hayFiltros() ? " con estos filtros." : ".")));
        if (!pp.length) return;
        g.append(tabla("Partidas entre " + a + " y " + b, ["Edición", "Categoría", { t: "Ronda", num: 1 }, "Jugador de " + a, "Resultado", "Jugador de " + b, "Comprobar"],
            pp.slice(0, 300).map(({ x, ja, jb, pa }) => el("tr", { "data-partida": "" }, td(ED[ja.ed].titulo),
                td(ja.cat + " " + ja.rama + " · " + (ja.ritmo || (ja.zona === "Única" ? "Zona única" : "Zona " + ja.zona.slice(1)))),
                td(x.ronda || "—", 1), td(ja.nombre + (ja.equipo ? " (" + ja.equipo + ")" : "")), td(resultado(pa)), td(jb.nombre + (jb.equipo ? " (" + jb.equipo + ")" : "")),
                fuente(x.tnr, ja.equipo ? 20 : 4, (ja.equipo ? "la composición de los equipos" : "la tabla cruzada") + " de " + ja.cat + " " + ja.rama + " de " + ED[ja.ed].titulo)))));
        if (pp.length > 300) g.append(el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-2" }, "Se muestran las 300 más recientes."));
    }
    /* Cuando terminan de llegar las partidas, se pinta lo que estaba esperando. */
    function refrescarEnfrentamientos() {
        if ($("duelo-resultado") && !$("general").classList.contains("hidden")) dibujarDuelo();
        const vieja = $("contra-comites");
        if (vieja) vieja.replaceWith(contraComites(vieja.dataset.contra, $("edicion").value));
    }

    /* ---- La calidad de los datos ----
       Qué se dedujo, qué falta y qué se corrigió a mano. Mira TODO (sin los
       filtros): la calidad de los datos no cambia con lo que se esté mirando.
       Quien administra puede corregir el comité de un jugador
       (jdn_correcciones; la RLS no deja escribir a nadie más) y la página
       vuelve a cargar con la corrección. Ver «La calidad de los datos y la
       corrección del comité». */
    const nomEd = (ed) => ED[ed] ? ED[ed].titulo : ed;
    async function corregir(nombre, k, ed) {
        const actual = correccionDe(k, ed);
        const v = await window.Avisos.formulario({
            titulo: T("Corregir el comité de ") + nombre,
            texto: UNI ? "La universidad que se le pone a este jugador manda sobre la de chess-results y sobre la deducida." : "El comité que se le pone a este jugador manda sobre el de chess-results y sobre el deducido.",
            campos: [
                { nombre: "comite", etiqueta: T("Comité"), tipo: "select", valor: actual ? actual.comite : "",
                  opciones: [...comitesTodos].map((x) => x.nombre).sort((a, b) => a.localeCompare(b, "es")).map((n) => [n, n]) },
                { nombre: "edicion", etiqueta: "En qué edición", tipo: "select", valor: actual ? actual.edicion || "" : ed || "",
                  opciones: [["", "En todas"], ...EDICIONES.filter((e) => Object.keys(tam).some((t) => t.startsWith(e.id))).map((e) => [e.id, e.titulo])] },
                { nombre: "nota", etiqueta: "Por qué (opcional)", tipo: "textarea", valor: actual ? actual.nota || "" : "", max: 300 },
            ],
            aceptar: "Guardar la corrección",
        });
        if (!v || !v.comite) return;
        const fila = { nombre: k, edicion: v.edicion || null, comite: v.comite, nota: (v.nota || "").trim() || null };
        const ya = CORR.find((c) => c.nombre === k && (c.edicion || "") === (v.edicion || ""));
        const { error } = ya ? await sb.from(TABLA + "correcciones").update(fila).eq("id", ya.id) : await sb.from(TABLA + "correcciones").insert(fila);
        if (error) { window.Avisos.avisar("No se pudo guardar la corrección: " + error.message, { tipo: "error" }); return; }
        location.reload();
    }
    async function quitarCorreccion(c) {
        if (!(await window.Avisos.confirmar("¿Quitar la corrección de " + c.nombre + (UNI ? "? Vuelve a valer la universidad de chess-results (o la deducida)." : "? Vuelve a valer el comité de chess-results (o el deducido)."), { aceptar: "Quitar la corrección", peligro: true }))) return;
        const { error } = await sb.from(TABLA + "correcciones").delete().eq("id", c.id);
        if (error) { window.Avisos.avisar("No se pudo quitar: " + error.message, { tipo: "error" }); return; }
        location.reload();
    }
    const botonCorregir = (nombre, k, ed) => {
        const b = el("button", { type: "button", "data-corregir": k, class: "text-sm font-semibold underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" }, "Corregir");
        b.addEventListener("click", () => corregir(nombre, k, ed));
        return el("td", { class: TD }, b);
    };
    function pintarCalidad(ver) {
        const caja = $("calidad");
        caja.replaceChildren();
        caja.classList.toggle("hidden", !ver);
        if (!ver) return;
        const I = TODO.ind;
        const deducidos = I.filter((r) => r.deducido), sin = I.filter((r) => r.comite === "Sin comité"), corregidos = I.filter((r) => r.corregido);
        const sinTabla = TODO.eq.filter((r) => r.fase === "elim" && !r.record);
        const torneosSinTabla = new Set(sinTabla.map((r) => r.tnr)).size;
        caja.append(el("h2", { id: "calidad-titulo", class: "font-serif text-xl font-bold text-brand-800 dark:text-white" }, "La calidad de los datos"),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1" },
                "Qué se dedujo y qué falta, para saber cuánto confiar en cada cifra. Mira todos los datos, sin los filtros."
                + (ADMIN ? " Como administras, puedes corregir el comité de un jugador: la corrección manda sobre chess-results y sobre lo deducido." : "")));
        caja.append(el("div", { class: "grid grid-cols-2 md:grid-cols-4 gap-3 mt-3" },
            cifra(I.length - deducidos.length - sin.length - corregidos.length, "jugadores individuales con el comité tal como lo trae chess-results"),
            cifra(deducidos.length, "con el comité deducido (del mismo jugador en otra edición)"),
            cifra(sin.length, "sin comité: chess-results no lo trae y no se pudo deducir"),
            cifra(corregidos.length, "corregidos a mano por administración")));
        const lista = (titulo, filas, id) => {
            const d = el("details", { class: "mt-4", "data-calidad": id }, el("summary", { class: "cursor-pointer font-semibold text-brand-700 dark:text-brand-200" }, titulo));
            if (filas) d.append(filas);
            return d;
        };
        const tablaJug = (cap, rs, conCom) => tabla(cap, ["Jugador", "Edición", "Categoría", ...(conCom ? ["Comité"] : []), "Comprobar", ...(ADMIN ? [""] : [])],
            rs.slice(0, 300).map((r) => el("tr", { "data-jugador": r.nombre }, el("td", { class: TD }, botonJugador(r.nombre, r.clave)), td(nomEd(r.ed)),
                td(r.cat + " " + r.rama + " · " + (r.ritmo || (r.zona === "Única" ? "Zona única" : "Zona " + r.zona.slice(1)))), conCom ? td(r.comite) : null,
                fuente(r.tnr, 1, "la clasificación de " + r.cat + " " + r.rama + " de " + nomEd(r.ed)), ADMIN ? botonCorregir(r.nombre, r.clave, r.ed) : null)));
        caja.append(lista(`Jugadores con el comité deducido (${deducidos.length})`, deducidos.length ? tablaJug("Jugadores con el comité deducido", deducidos, true) : null, "deducidos"));
        caja.append(lista(`Jugadores sin comité (${sin.length})`, sin.length ? tablaJug("Jugadores sin comité", sin, false) : null, "sin-comite"));
        if (CORR.length) caja.append(lista(`Corregidos a mano (${CORR.length})`, tabla("Correcciones de comité hechas por administración", ["Jugador", "Edición", "Comité", "Por qué", "Desde", ...(ADMIN ? [""] : [])],
            CORR.map((c) => {
                let quitar = null;
                if (ADMIN) { const b = el("button", { type: "button", class: "text-sm font-semibold underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" }, "Quitar"); b.addEventListener("click", () => quitarCorreccion(c)); quitar = el("td", { class: TD }, b); }
                return el("tr", { "data-correccion": c.nombre }, td(titulo(c.nombre)), td(c.edicion ? nomEd(c.edicion) : "Todas"), td(c.comite), td(c.nota || "—"), td(c.creado ? window.HoraCR.fecha(c.creado) : ""), quitar);
            })), "corregidos"));
        caja.append(lista("Lo que falta en chess-results", UNI ? el("ul", { class: "mt-2 list-disc pl-6 text-sm text-brand-600 dark:text-brand-300 space-y-1" },
            el("li", {}, `${new Set(TODO.eq.filter((r) => !r.record).map((r) => r.tnr)).size} torneos por equipos no traen la tabla final: ahí el puesto es el orden de la página de resultados, sin el récord de matches.`),
            el("li", {}, "Los JUDUCA individuales traen el país y no la universidad: sale del mismo jugador en los equipos de esa edición («universidad deducida»)."),
            el("li", {}, "Están los torneos publicados en chess-results: los JUNCOS desde 2011 y los JUDUCA desde 2010. Los de antes no se publicaron ahí."),
            el("li", {}, "Del Interuniversitario UNA 2011 no está la final del femenino individual: solo los grupos de la primera fase, que no se cuentan."),
            el("li", {}, "El XXV JUNCOS 2026 (octubre) se carga cuando termine."),
            el("li", {}, "Algunas partidas de equipos no se pudieron ubicar porque chess-results escribe distinto el nombre del rival: cuentan en el jugador, no en los enfrentamientos."))
            : el("ul", { class: "mt-2 list-disc pl-6 text-sm text-brand-600 dark:text-brand-300 space-y-1" },
            el("li", {}, `${torneosSinTabla} eliminatorias por equipos no traen la tabla final: ahí el puesto es el orden por puntos de partida, sin el récord de matches.`),
            el("li", {}, "De la eliminatoria 2018 están solo U16 y U20, y el U20 Femenino por equipos de la Zona 1 está vacío en chess-results."),
            el("li", {}, "De 2011 a 2017 faltan doce eliminatorias por equipos (seis de 2012, cuatro de 2013 y dos de 2016), que están en chess-results sin jugadores, y no hubo JDN en 2014 (la final 2013 se jugó en marzo de 2014). De la eliminatoria 2017 U20 Femenino por equipos de la Zona 2 chess-results no trae a San José."),
            el("li", {}, "chess-results no publica la clasificación por tableros de las finales 2011 a 2017: sus mejores tableros están calculados con la regla de las finales 2018. Tampoco dice el ritmo de la final 2011: los cuatro torneos individuales que se jugaron en un día van como Rápido."),
            el("li", {}, "De la eliminatoria 2024 faltan dos torneos por equipos (Z1 y Z2 U12 Femenino)."),
            el("li", {}, "La final 2022-2023 no trae el comité de cada jugador: sale del mismo jugador en la eliminatoria 2022 («comité deducido»)."),
            el("li", {}, "Dos equipos de las clasificaciones no tienen integrantes: el «Descanso» de la eliminatoria 2018 (el bye) y San José B en el Blitz U20 Femenino de la final 2020-2021, que perdió todo sin jugar.")), "falta"));
    }

    /* ---- Gráficas (SVG propio, sin librerías) ----
       Las barras son una sola serie (sin leyenda: el título la nombra) y cada
       una lleva su número escrito; las líneas para comparar comités usan los
       tres primeros colores de la paleta validada (ver «La evolución en el
       tiempo») y van con su nombre al final de la línea y una tabla debajo. */
    const SVG = "http://www.w3.org/2000/svg";
    function sv(tag, attrs, ...hijos) {
        const e = document.createElementNS(SVG, tag);
        for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, k === "aria-label" ? T(v) : v);
        for (const h of hijos) if (h != null) e.append(h instanceof Node ? h : document.createTextNode(T(String(h))));
        return e;
    }
    const SERIE = ["fill-[#2a78d6] dark:fill-[#3987e5]", "fill-[#eb6834] dark:fill-[#d95926]", "fill-[#1baf7a] dark:fill-[#199e70]"];
    const TRAZO = ["stroke-[#2a78d6] dark:stroke-[#3987e5]", "stroke-[#eb6834] dark:stroke-[#d95926]", "stroke-[#1baf7a] dark:stroke-[#199e70]"];
    const TINTA = "fill-brand-800 dark:fill-brand-100", TINTA2 = "fill-brand-500 dark:fill-brand-300";
    const EJE = "stroke-brand-200 dark:stroke-brand-700";
    function barras(titulo, datos, resumenTxt) {
        const W = 640, H = 230, M = { a: 28, b: 44, i: 12, d: 12 };
        const max = Math.max(1, ...datos.map((d) => d.valor));
        const paso = (W - M.i - M.d) / Math.max(1, datos.length), ancho = Math.min(56, paso * 0.6);
        const y = (v) => H - M.b - (H - M.a - M.b) * v / max;
        const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, class: "w-full h-auto", role: "img", "aria-label": titulo + ": " + resumenTxt });
        svg.append(sv("line", { x1: M.i, x2: W - M.d, y1: H - M.b, y2: H - M.b, class: EJE, "stroke-width": 1 }));
        datos.forEach((d, i) => {
            const cx = M.i + paso * i + paso / 2, x = cx - ancho / 2, top = y(d.valor), base = H - M.b, r = Math.min(4, (base - top) / 2);
            const g = sv("g", {}, sv("title", {}, d.info));
            if (d.valor > 0) g.append(sv("path", { d: `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + ancho - r}Q${x + ancho},${top} ${x + ancho},${top + r}V${base}Z`, class: SERIE[0] }));
            g.append(sv("text", { x: cx, y: (d.valor > 0 ? top : base) - 6, "text-anchor": "middle", class: TINTA + " text-[13px] font-semibold" }, d.texto));
            g.append(sv("text", { x: cx, y: H - M.b + 18, "text-anchor": "middle", class: TINTA2 + " text-[12px]" }, d.etq));
            // Zona de toque más grande que la barra.
            g.append(sv("rect", { x: cx - paso / 2, y: M.a, width: paso, height: H - M.a - M.b + 24, fill: "transparent" }));
            svg.append(g);
        });
        return el("figure", { class: "mt-3 bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4" },
            el("figcaption", { class: "text-sm font-semibold text-brand-800 dark:text-white" }, titulo), svg);
    }
    /* opc.unidad: lo que mide (para el título de cada punto); opc.desde: el
       piso del eje (0 si no se dice; con Elo, un piso redondo debajo del
       mínimo, para que la línea no quede aplastada arriba). Un valor null es
       una edición sin dato: no lleva punto y corta la línea. */
    function lineas(titulo, etiquetas, series, opc) {
        const o = opc || {}, unidad = o.unidad == null ? "medallas" : o.unidad;
        const W = 860, H = 300, M = { a: 24, b: 40, i: 44, d: 170 };
        const vals = series.flatMap((x) => x.valores).filter((v) => v != null);
        const max = Math.max(1, ...vals);
        const min = o.desde === "auto" ? Math.max(0, Math.floor((Math.min(...vals) - 50) / 100) * 100) : 0;
        const tope = o.desde === "auto" ? Math.ceil((max + 50) / 100) * 100 : max;
        const X = (i) => M.i + (W - M.i - M.d) * (etiquetas.length > 1 ? i / (etiquetas.length - 1) : 0.5);
        const Y = (v) => H - M.b - (H - M.a - M.b) * (v - min) / Math.max(1, tope - min);
        const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, class: "w-full h-auto", role: "img",
            "aria-label": titulo + ". " + series.map((x) => x.nombre + ": " + x.valores.map((v, i) => etiquetas[i] + " " + (v == null ? "sin dato" : v)).join(", ")).join(". ") });
        for (const t of [min, Math.round((min + tope) / 2), tope]) {
            svg.append(sv("line", { x1: M.i, x2: W - M.d, y1: Y(t), y2: Y(t), class: EJE, "stroke-width": 1 }));
            svg.append(sv("text", { x: M.i - 6, y: Y(t) + 4, "text-anchor": "end", class: TINTA2 + " text-[11px]" }, t));
        }
        etiquetas.forEach((t, i) => svg.append(sv("text", { x: X(i), y: H - M.b + 18, "text-anchor": "middle", class: TINTA2 + " text-[12px]" }, t)));
        // Los nombres al final de cada línea (en su último dato), sin encimarse.
        const ultimo = (x) => { for (let i = x.valores.length - 1; i >= 0; i--) if (x.valores[i] != null) return x.valores[i]; return min; };
        const fin = series.map((x, k) => ({ k, y: Y(ultimo(x)) })).sort((a, b) => a.y - b.y);
        for (let i = 1; i < fin.length; i++) if (fin[i].y - fin[i - 1].y < 16) fin[i].y = fin[i - 1].y + 16;
        series.forEach((x, k) => {
            // Un tramo por cada racha de ediciones con dato.
            let tramo = [];
            const cerrar = () => { if (tramo.length) svg.append(sv("polyline", { points: tramo.join(" "), fill: "none", class: TRAZO[k], "stroke-width": 2, "stroke-linejoin": "round" })); tramo = []; };
            x.valores.forEach((v, i) => { if (v == null) cerrar(); else tramo.push(X(i) + "," + Y(v)); });
            cerrar();
            x.valores.forEach((v, i) => { if (v != null) svg.append(sv("g", {}, sv("title", {}, `${x.nombre} · ${etiquetas[i]}: ${v}${unidad ? " " + unidad : ""}`),
                sv("circle", { cx: X(i), cy: Y(v), r: 5, class: SERIE[k] + " stroke-white dark:stroke-brand-900", "stroke-width": 2 }))); });
            svg.append(sv("text", { x: W - M.d + 8, y: fin.find((f) => f.k === k).y + 4, class: TINTA + " text-[12px] font-semibold" }, x.nombre));
        });
        return el("figure", { class: "mt-3 bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4" },
            el("figcaption", { class: "text-sm font-semibold text-brand-800 dark:text-white" }, titulo), svg);
    }

    /* La evolución de un comité: medallas en cada final y participantes en
       cada eliminatoria, en el orden del tiempo. */
    function evolucion(nombre) {
        const fin = EDICIONES.filter((e) => e.fase === "final" && Object.keys(tam).some((k) => k.startsWith(e.id))).reverse();
        // En las universidades no hay eliminatorias: los participantes van torneo por torneo.
        const eli = UNI ? fin : EDICIONES.filter((e) => e.fase === "elim" && Object.keys(tam).some((k) => k.startsWith(e.id))).reverse();
        const med = fin.map((e) => { const x = resumen((r) => r.ed === e.id).find((y) => y.nombre === nombre) || vacio(nombre); return { e, x }; });
        const par = eli.map((e) => { const x = participantes(e.id)[nombre] || { j: 0, e: 0 }; return { e, x }; });
        const corta = (e) => e.titulo.replace(/^(Final|Eliminatoria) /, "");
        const caja = el("div", { class: "grid md:grid-cols-2 gap-3", "data-evolucion": nombre });
        caja.append(barras("Medallas en cada final", med.map(({ e, x }) => ({ etq: corta(e), valor: x.oro + x.plata + x.bronce,
            texto: x.oro + x.plata + x.bronce ? x.oro + "·" + x.plata + "·" + x.bronce : "0", info: `${e.titulo}: ${x.oro} de oro, ${x.plata} de plata, ${x.bronce} de bronce` })),
            med.map(({ e, x }) => corta(e) + " " + (x.oro + x.plata + x.bronce)).join(", ")));
        caja.append(barras("Participantes en cada eliminatoria", par.map(({ e, x }) => ({ etq: corta(e), valor: x.j + x.e,
            texto: x.j + x.e ? [x.j ? String(x.j) : "", x.e ? x.e + "E" : ""].filter(Boolean).join(" · ") : "0", info: `${e.titulo}: ${cuantos(x.j, x.e) || "nadie"}` })),
            par.map(({ e, x }) => corta(e) + " " + (x.j + x.e)).join(", ")));
        return caja;
    }

    /* Comparar hasta tres comités: medallas en cada final. */
    const comparados = ["", "", ""];
    function pintarComparar(ver) {
        const caja = $("comparar");
        caja.classList.toggle("hidden", !ver);
        if (!ver) return;
        if (!caja.dataset.armado) {
            caja.dataset.armado = "1";
            caja.append(el("h2", { id: "comparar-titulo", class: "font-serif text-xl font-bold text-brand-800 dark:text-white" }, "Comparar comités"),
                el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1" }, "Elige hasta tres comités para ver sus medallas final por final, con los filtros que estén puestos."));
            const fila = el("div", { class: "grid sm:grid-cols-3 gap-3 mt-3" });
            for (let i = 0; i < 3; i++) {
                const id = "comparar-" + (i + 1);
                const sel = el("select", { id, class: "w-full px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm focus:ring-2 focus:ring-accent-500 outline-none" },
                    el("option", { value: "" }, "—"), ...[...comitesTodos].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((x) => el("option", { value: x.nombre }, x.nombre)));
                sel.value = comparados[i] = (comitesTodos[i] || {}).nombre || "";
                sel.addEventListener("change", () => { comparados[i] = sel.value; dibujar(); });
                fila.append(el("div", {}, el("label", { for: id, class: "block text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1" }, "Comité " + (i + 1)), sel));
            }
            caja.append(fila, el("div", { id: "comparar-grafica" }));
        }
        const dibujar = () => {
            const g = $("comparar-grafica"); g.replaceChildren();
            const fin = EDICIONES.filter((e) => e.fase === "final" && Object.keys(tam).some((k) => k.startsWith(e.id))).reverse();
            const R = fin.map((e) => Object.fromEntries(resumen((r) => r.ed === e.id).map((x) => [x.nombre, x])));
            const series = comparados.filter(Boolean).filter((n, i, a) => a.indexOf(n) === i)
                .map((n) => ({ nombre: n, valores: R.map((m) => m[n] ? m[n].oro + m[n].plata + m[n].bronce : 0), det: R.map((m) => m[n] ? m[n].oro + "·" + m[n].plata + "·" + m[n].bronce : "—") }));
            if (!series.length) return;
            const etq = fin.map((e) => e.titulo.replace(/^Final /, ""));
            g.append(lineas("Medallas en cada final (oro, plata y bronce sumados)", etq, series));
            g.append(tabla("Medallas de los comités comparados en cada final", ["Comité", ...etq.map((t) => ({ t, num: 1 }))],
                series.map((x) => el("tr", { "data-comite": x.nombre }, td(x.nombre), ...x.det.map((d) => td(d, 1))))));
        };
        dibujar();
    }

    /* ---- La ficha del jugador ----
       Una persona es su nombre sin tildes ni números, con los nombres cortados
       de chess-results juntos (mismo()). Junta sus torneos individuales y sus
       tableros en todos los JDN, con los filtros puestos. */
    let JUG = "";
    /* Los torneos de quien cumple «es(clave)»: individuales, tableros de las
       finales y, de jdn_jugadores, los equipos en que jugó y que no salen en
       los tableros (las eliminatorias, o quien no llegó al mínimo de partidas
       de la clasificación por tableros). Esos van con el puesto del equipo y
       sin medalla: la medalla de un integrante es la de su tablero. */
    function torneosDe(es) {
        const tb = tabs.filter((r) => es(clave(r.nombre)));
        return [
            ...ind.filter((r) => es(r.clave)).map((r) => ({ r, nombre: r.nombre, que: "Individual", n: tam[r.ed + r.cod], tnr: r.tnr, art: 1, tablero: false })),
            ...tb.map((r) => ({ r, nombre: r.nombre, que: nomTablero(r.tablero) + " · " + r.equipo, n: tamT[r.ed + r.cod + "-" + r.tablero], tnr: r.tnr, art: r.calc ? 20 : 81, tablero: true })),
            ...jugs.filter((r) => r.equipo && es(r.clave) && !tb.some((t) => t.tnr === r.tnr && mismo(clave(t.nombre), r.clave)))
                .map((r) => ({ r: { ...r, rk: r.eqRk }, nombre: r.nombre, que: "Equipo " + r.equipo + " · tablero " + (r.tablero || "—"), n: tam[r.ed + r.cod], tnr: r.tnr, art: 20, tablero: true, sinMedalla: true })),
        ];
    }
    const puestoDe = (f) => (f.sinMedalla ? "equipo " : "") + f.r.rk + " de " + f.n;
    function filasDe(k) {
        return torneosDe((c) => mismo(c, k)).sort((a, b) => a.r.ed.localeCompare(b.r.ed) || ordCat(a.r, b.r));
    }
    function abrirJugador(k) { JUG = k; enlace("", ""); pintarJugador(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    function pintarJugador() {
        const caja = $("jugador");
        caja.replaceChildren();
        caja.classList.toggle("hidden", !JUG);
        if (!JUG) return;
        $("general").classList.add("hidden"); $("ficha").classList.add("hidden"); $("volver").classList.remove("hidden");
        const filas = filasDe(JUG);
        const nombre = filas.length ? [...filas.map((f) => f.nombre)].sort((a, b) => b.length - a.length)[0] : JUG;
        caja.append(el("h2", { id: "jugador-titulo", class: "font-serif text-2xl font-bold text-brand-800 dark:text-white" }, nombre));
        if (!filas.length) { caja.append(el("p", { class: "mt-2 text-brand-500 dark:text-brand-300" }, "No hay torneos de este jugador" + (hayFiltros() ? " con estos filtros." : "."))); return; }
        const comites = [...new Set(filas.map((f) => f.r.comite))];
        const eds = [...new Set(filas.map((f) => f.r.ed))];
        const med = [1, 2, 3].map((k) => filas.filter((f) => f.r.fase === "final" && !f.sinMedalla && f.r.rk === k).length);
        // El camino por categorías: la primera edición en cada una.
        const camino = [];
        for (const f of filas) if (!camino.some((c) => c.cat === f.r.cat)) camino.push({ cat: f.r.cat, ed: f.r.ed });
        const lineaComite = el("p", { class: "text-sm text-brand-500 dark:text-brand-300" }, "Comité" + (comites.length > 1 ? "s" : "") + ": " + comites.join(", "));
        if (ADMIN) {
            const b = el("button", { type: "button", id: "jugador-corregir", class: "ml-3 font-semibold underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" }, "Corregir su comité");
            b.addEventListener("click", () => corregir(nombre, JUG, ""));
            lineaComite.append(b);
        }
        caja.append(lineaComite);
        caja.append(el("div", { class: "grid grid-cols-2 md:grid-cols-4 gap-3 mt-4" },
            cifra(eds.filter((e) => ED[e].fase === "elim").length, "eliminatorias jugadas"),
            cifra(eds.filter((e) => ED[e].fase === "final").length, "finales jugadas"),
            cifra(med[0] + med[1] + med[2], `medallas (${med[0]} de oro, ${med[1]} de plata, ${med[2]} de bronce), individuales y de tablero`),
            cifra(camino.map((c) => c.cat).join(" → "), "categorías, en el orden en que las jugó: " + camino.map((c) => c.cat + " desde " + ED[c.ed].titulo).join(", "))));
        caja.append(el("h3", { class: "font-serif text-lg font-bold text-brand-800 dark:text-white mt-6" }, "Su trayectoria"));
        caja.append(tabla("Todos los torneos de " + nombre, ["Edición", "Categoría", "Ritmo o zona", "Modalidad", "Comité", { t: "Puesto", num: 1 }, "Medalla", "Comprobar"],
            filas.map((f) => {
                const r = f.r;
                return el("tr", { "data-edicion": r.ed }, td(ED[r.ed].titulo), td(r.cat + " " + r.rama), td(r.ritmo || (r.zona === "Única" ? "Zona única" : "Zona " + r.zona.slice(1))),
                    td(f.que), td(r.comite), td(puestoDe(f), 1), el("td", { class: TD }, r.fase === "final" && !f.sinMedalla ? medalla(r.rk) : null),
                    fuente(f.tnr, f.art, "el torneo de " + f.nombre + " en " + ED[r.ed].titulo));
            })));
        // Contra el Elo: cada torneo en que jugó al menos una partida.
        const pj = jugs.filter((r) => mismo(r.clave, JUG) && r.partidas > 0).sort((a, b) => a.ed.localeCompare(b.ed) || ordCat(a, b));
        if (pj.length) {
            const ce = contraElo(pj);
            caja.append(el("h3", { class: "font-serif text-lg font-bold text-brand-800 dark:text-white mt-6" }, "Sus partidas contra el Elo"),
                el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1", "data-contra-elo": nombre }, ce.partidas
                    ? `En ${ce.partidas} partidas contra rivales con Elo sacó ${fmt1(ce.puntos)} puntos; por el Elo se esperaban ${fmt1(ce.esperado)}: ${ce.dif >= 0 ? fmt1(ce.dif) + " por encima" : fmt1(-ce.dif) + " por debajo"} de lo esperado.`
                    : "Ninguna de sus partidas fue entre dos jugadores con Elo: no hay con qué compararlas."));
            caja.append(tabla("Partidas de " + nombre + " contra el Elo, torneo por torneo", ["Edición", "Categoría", "Modalidad", { t: "Elo", num: 1 }, { t: "Partidas", num: 1 }, { t: "Puntos", num: 1 },
                { t: "Elo medio de sus rivales", num: 1 }, { t: "Esperados", num: 1 }, { t: "Diferencia", num: 1 }, { t: "Actuación", num: 1 }, "Comprobar"],
                pj.map((r) => el("tr", { "data-elo-edicion": r.ed }, td(ED[r.ed].titulo), td(r.cat + " " + r.rama + " · " + (r.ritmo || (r.zona === "Única" ? "Zona única" : "Zona " + r.zona.slice(1)))),
                    td(modalidad(r)), td(r.elo || "—", 1), td(r.partidas, 1), td(fmt(r.pts), 1), td(r.eloRiv || "—", 1),
                    td(r.esperado != null ? fmt1(r.esperado) : "—", 1), td(r.esperado != null ? signo(r.ptsElo - r.esperado) : "—", 1), td(r.esperado != null ? actuacion(r) || "—" : "—", 1),
                    fuente(r.tnr, r.equipo ? 20 : 4, (r.equipo ? "la composición de los equipos" : "la tabla cruzada") + " de " + r.cat + " " + r.rama + " de " + ED[r.ed].titulo)))));
            caja.append(crecimiento(pj));
        }
    }
    const botonJugador = (nombre, k) => {
        const b = el("button", { type: "button", class: "underline underline-offset-2 hover:no-underline rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500", "aria-label": "Ver la ficha de " + nombre }, nombre);
        b.addEventListener("click", () => abrirJugador(k));
        return b;
    };

    /* Cómo crece un jugador: su Elo y su actuación edición por edición. El
       Elo de una edición es el más alto con que jugó en ella; la actuación,
       la de todas sus partidas con Elo de esa edición juntas. */
    function crecimiento(pj) {
        const eds = EDICIONES.filter((e) => pj.some((r) => r.ed === e.id)).reverse();
        if (eds.length < 2) return el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-3", "data-crecimiento": "" }, "Con una sola edición todavía no hay cómo ver si crece.");
        const elo = eds.map((e) => { const v = pj.filter((r) => r.ed === e.id && r.elo).map((r) => r.elo); return v.length ? Math.max(...v) : null; });
        const act = eds.map((e) => actuacion(juntar(pj.filter((r) => r.ed === e.id && r.esperado != null))));
        const caja = el("div", { "data-crecimiento": "" }, el("h3", { class: "font-serif text-lg font-bold text-brand-800 dark:text-white mt-6" }, "Cómo crece"),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1" }, "Su Elo en cada edición (el más alto con que jugó) y su actuación: el Elo que corresponde a lo que sacó contra rivales con Elo. Si la actuación queda por encima de su Elo, jugó mejor que su Elo."));
        caja.append(lineas("Su Elo y su actuación, edición por edición", eds.map((e) => e.titulo.replace(/^(Final|Eliminatoria) /, (m) => m[0] + ". ")),
            [{ nombre: "Elo", valores: elo }, { nombre: "Actuación", valores: act }], { unidad: "", desde: "auto" }));
        return caja;
    }
    /* Varias filas de jdn_jugadores juntas, para una actuación de conjunto: el
       Elo medio de los rivales se pondera por las partidas. */
    function juntar(rs) {
        const c = rs.reduce((a, r) => a + r.conElo, 0);
        return { conElo: c, ptsElo: rs.reduce((a, r) => a + r.ptsElo, 0), eloRiv: c ? Math.round(rs.reduce((a, r) => a + r.eloRiv * r.conElo, 0) / c) : 0 };
    }

    /* El ranking de los jugadores de un comité por su actuación en todos los
       JDN (con los filtros), con al menos 5 partidas contra rivales con Elo.
       Una persona son todas sus filas, con los nombres cortados juntos. */
    function rankingDe(nombre) {
        const P = [];
        for (const r of jugs) {
            if (r.comite !== nombre || r.esperado == null || !r.conElo) continue;
            let p = P.find((x) => mismo(x.k, r.clave));
            if (!p) P.push(p = { k: r.clave, nombres: [], filas: [] });
            p.nombres.push(r.nombre); p.filas.push(r);
        }
        const lista = P.map((p) => {
            const j = juntar(p.filas), ult = [...p.filas].sort((a, b) => b.ed.localeCompare(a.ed))[0];
            return { k: p.k, nombre: p.nombres.sort((a, b) => b.length - a.length)[0], elo: ult.elo, torneos: p.filas.length, ...j,
                esperado: p.filas.reduce((a, r) => a + r.esperado, 0), act: actuacion(j) };
        }).filter((x) => x.conElo >= 5).sort((a, b) => b.act - a.act || b.conElo - a.conElo);
        const caja = el("section", { class: "mt-6", "data-ranking": nombre },
            el("h3", { class: "font-serif text-lg font-bold text-brand-800 dark:text-white" }, "Ranking de sus jugadores"),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1" }, lista.length
                ? "Sus jugadores ordenados por su actuación en todos los JDN" + (hayFiltros() ? " (con estos filtros)" : "") + ": el Elo que corresponde a lo que sacaron contra rivales con Elo, juntando todas sus partidas. Solo los que tienen al menos 5 partidas contra rivales con Elo. Sirve para ver quién rinde más, no solo quién tiene más Elo."
                : "Ninguno de sus jugadores tiene 5 partidas contra rivales con Elo" + (hayFiltros() ? " con estos filtros." : ".")));
        if (lista.length) caja.append(tabla("Ranking de los jugadores de " + nombre + " por su actuación", [{ t: "Puesto", num: 1 }, "Jugador", { t: "Último Elo", num: 1 }, { t: "Torneos", num: 1 },
            { t: "Partidas con Elo", num: 1 }, { t: "Puntos", num: 1 }, { t: "Esperados", num: 1 }, { t: "Diferencia", num: 1 }, { t: "Actuación", num: 1 }],
            lista.slice(0, 25).map((x, i) => el("tr", { "data-jugador": x.nombre }, td(i + 1, 1), el("td", { class: TD }, botonJugador(x.nombre, x.k)), td(x.elo || "—", 1), td(x.torneos, 1),
                td(x.conElo, 1), td(fmt1(x.ptsElo), 1), td(fmt1(x.esperado), 1), td(signo(x.ptsElo - x.esperado), 1), el("td", { class: TDN + " font-semibold" }, x.act || "—")))));
        return caja;
    }

    /* Los jugadores de un comité: cuántos volvieron a otro JDN (la retención)
       y la lista, de los que más jugaron a los que menos. */
    function susJugadores(nombre) {
        const P = new Map();
        const tocar = (k, n, r, tablero) => {
            let llave = [...P.keys()].find((o) => mismo(o, k));
            if (!llave) { llave = k; P.set(k, { k, nombres: [], eds: new Set(), anios: new Set(), med: 0 }); }
            const p = P.get(llave);
            p.nombres.push(n); p.eds.add(r.ed); p.anios.add(r.ed.slice(0, 4));
            if (r.fase === "final" && r.rk >= 1 && r.rk <= 3) p.med++;
        };
        for (const r of ind) if (r.comite === nombre) tocar(r.clave, r.nombre, r, false);
        for (const r of tabs) if (r.comite === nombre) tocar(clave(r.nombre), r.nombre, r, true);
        // Quien jugó en sus equipos (también en las eliminatorias): sin medalla aparte.
        for (const r of jugs) if (r.equipo && r.partidas > 0 && r.comite === nombre) tocar(r.clave, r.nombre, { ed: r.ed, fase: r.fase, rk: 0 }, true);
        const lista = [...P.values()].map((p) => ({ ...p, nombre: p.nombres.sort((a, b) => b.length - a.length)[0], eds: [...p.eds].sort() }))
            .sort((a, b) => b.eds.length - a.eds.length || b.med - a.med || a.nombre.localeCompare(b.nombre, "es"));
        const volvieron = lista.filter((p) => p.anios.size > 1).length;
        const caja = el("section", { class: "mt-6", "data-jugadores": nombre },
            el("h3", { class: "font-serif text-lg font-bold text-brand-800 dark:text-white" }, "Sus jugadores"),
            el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-1" },
                lista.length ? `${lista.length} jugador${lista.length === 1 ? "" : "es"} en torneos individuales y en sus equipos; ${volvieron} (${pct(volvieron, lista.length)}) jugaron los JDN en más de un año. Toca un nombre para ver su trayectoria.`
                    : "Sin jugadores con estos filtros."));
        if (lista.length) caja.append(tabla("Jugadores de " + nombre, ["Jugador", "Primera edición", "Última edición", { t: "Ediciones", num: 1 }, { t: "Medallas", num: 1 }],
            lista.slice(0, 60).map((p) => el("tr", { "data-jugador": p.nombre }, el("td", { class: TD }, botonJugador(p.nombre, p.k)),
                td(ED[p.eds[0]].titulo), td(ED[p.eds[p.eds.length - 1]].titulo), td(p.eds.length, 1), td(p.med || "", 1)))));
        if (lista.length > 60) caja.append(el("p", { class: "text-sm text-brand-500 dark:text-brand-300 mt-2" }, `Se muestran los 60 que más jugaron; los demás salen en «Buscar jugador».`));
        return caja;
    }

    function enlace(s, ed) {
        const p = new URLSearchParams();
        for (const k of CLAVES_FILTRO) if (FILTRO[k]) p.set(k, FILTRO[k]);
        if (JUG) p.set("j", JUG);
        // La escala de la copa, si no es la de siempre.
        if (COPA.escala !== "8") p.set("copa", COPA.escala === "x" ? leerEscala(COPA.propia).join("-") || "x" : COPA.escala);
        if (!UNI && !COPA.tableros) p.set("ct", "0");
        const f = p.toString();
        const h = [s || "", ed || "", f].join("~").replace(/~+$/, "");
        try { history.replaceState(null, "", h ? "#" + h : location.pathname); } catch (e) { /* sin historial */ }
    }

    function elegir(s, ed) {
        JUG = "";
        $("jugador").classList.add("hidden");
        enlace(s, ed);
        pintar(s, ed);
        pintarBusqueda();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function refrescar() {
        const selC = $("comite"), selE = $("edicion");
        if (JUG) { enlace("", ""); pintarJugador(); pintarBusqueda(); } else elegir(selC.value, selE.value);
    }

    function armarControles() {
        const selC = $("comite"), selE = $("edicion");
        // El medallero está escrito en el HTML: su menú «Bajar» se le pone acá.
        const med = $("medallero");
        med.parentElement.before(menuBajar(med));
        selC.append(el("option", { value: "" }, "Todos los comités (medallero)"));
        for (const x of [...comitesTodos].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))) selC.append(el("option", { value: slug(x.nombre) }, x.nombre));
        selE.append(el("option", { value: "" }, "Todas las ediciones"));
        for (const e of EDICIONES) if (tam && Object.keys(tam).some((k) => k.startsWith(e.id))) selE.append(el("option", { value: e.id }, e.titulo + (e.detalle ? " · " + e.detalle : "")));
        selC.addEventListener("change", () => elegir(selC.value, selE.value));
        selE.addEventListener("change", () => elegir(selC.value, selE.value));
        $("volver").addEventListener("click", () => elegir("", selE.value));
        for (const k of FILTROS) {
            const sel = $("f-" + k);
            sel.value = FILTRO[k];
            sel.addEventListener("change", () => {
                FILTRO[k] = sel.value;
                // Una edición que no es de la fase elegida deja de tener sentido.
                if (k === "fase" && FILTRO.fase && ED[selE.value] && ED[selE.value].fase !== FILTRO.fase) selE.value = "";
                aplicarFiltros(); refrescar();
            });
        }
        const bus = $("buscar");
        bus.value = FILTRO.q;
        bus.addEventListener("input", () => { FILTRO.q = bus.value.trim(); aplicarFiltros(); enlace(selC.value, selE.value); pintarBusqueda(); });
        $("quitar-filtros").addEventListener("click", () => {
            for (const k of CLAVES_FILTRO) { FILTRO[k] = ""; if (k !== "q") $("f-" + k).value = ""; }
            bus.value = "";
            aplicarFiltros(); refrescar();
        });
    }

    async function init() {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { location.href = "login.html?next=" + (UNI ? "universidades.html" : "jdn-comites.html"); return; }
        const { data: puede, error } = await sb.rpc("tengo_herramienta", { p_herramienta: UNI ? "universidades" : "jdn-comites" });
        if (error || puede !== true) { $("loading").classList.add("hidden"); $("denegado").classList.remove("hidden"); return; }
        let filas;
        try { [filas, CORR, ADMIN] = await Promise.all([leerTodo(), leerCorrecciones(), soyAdmin(session.user.id)]); } catch (e) {
            $("loading").classList.add("hidden"); $("app").classList.remove("hidden");
            $("error").textContent = "No se pudieron leer los resultados: " + (e.message || e) + ". Vuelve a cargar la página en un rato.";
            $("error").classList.remove("hidden");
            return;
        }
        const [filasT, filasJ] = await Promise.all([leerTableros(), leerJugadores()]);
        preparar(filas, filasJ);
        prepararTableros(filasT);
        prepararJugadores(filasJ);
        TODO = { ind, eq, tabs, jugs };
        comitesTodos = resumen(() => true); // con las medallas de tablero
        const [h1, h2, h3] = decodeURIComponent((location.hash || "").slice(1)).split("~");
        const pf = new URLSearchParams(h3 || "");
        for (const k of CLAVES_FILTRO) FILTRO[k] = pf.get(k) || "";
        JUG = pf.get("j") || "";
        const cp = pf.get("copa") || "";
        if (cp && ESCALAS.some((x) => x.id === cp && x.puntos)) COPA.escala = cp;
        else if (cp) { COPA.escala = "x"; COPA.propia = leerEscala(cp.replace(/-/g, " ")).join(", "); }
        COPA.tableros = !UNI && pf.get("ct") !== "0";
        aplicarFiltros();
        const torneos = Object.keys(tam).length;
        const nE = EDICIONES.filter((e) => e.fase === "elim" && Object.keys(tam).some((k) => k.startsWith(e.id))).length;
        const nF = EDICIONES.filter((e) => e.fase === "final" && Object.keys(tam).some((k) => k.startsWith(e.id))).length;
        $("intro").textContent = UNI
            ? `Los resultados de cada universidad de Costa Rica en los ${torneos} torneos universitarios de ajedrez que están en chess-results, de ${nF} ediciones: los JUNCOS, el torneo CONARE, la FEDEU, la FECUNDE y otros de Costa Rica, y lo que hicieron en los JUDUCA centroamericanos. Las universidades de afuera no salen. Elige una universidad para ver a todos sus jugadores y equipos, edición por edición.`
            : `Los resultados de cada comité de deportes en los ${torneos} torneos de ajedrez de los Juegos Deportivos Nacionales que están en chess-results: ${nE} eliminatorias y ${nF} finales. Elige un comité para ver a todos sus jugadores y equipos, edición por edición.`;
        armarControles();
        $("loading").classList.add("hidden"); $("app").classList.remove("hidden");
        if (ED[h1]) pintar("", h1); else pintar(h1 || "", h2 || "");
        pintarBusqueda();
        pintarJugador();
        // Las partidas (para los enfrentamientos) son muchas: se leen después
        // de pintar, sin hacer esperar a nadie.
        cargarPartidas().then(refrescarEnfrentamientos);
    }

    init();
})();
