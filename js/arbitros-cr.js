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
   - Una norma de AI cuenta solo si el torneo es posterior al título de AF
     (antesDelAf), y desde el AF sus torneos ya no cuentan para AF
     (despuesDelAf). La fecha OFICIAL es la de su perfil de FIDE (af_perfil):
     FIDE rechaza como «before FA» una norma posterior al Consejo pero
     anterior a esa fecha. Sin ella, la del Consejo (af_fecha) con 60 días
     para revisar; sin ninguna, el año de su perfil (el mismo año, a
     revisar). Ver «La fecha oficial del título: la del perfil de FIDE».
   - «En FIDE»: activo, inactivo o que no figura en la lista oficial de
     árbitros de FIDE (arbitros_cr_fide), que también da el título de
     Árbitro Nacional que el perfil no dice.
   - Los años, el título, el tipo y el lugar (Costa Rica o el extranjero)
     filtran la lista; el árbitro elegido va en la dirección (#ID) para
     compartirlo.
   - Los torneos en el extranjero salen de chess-results (arbitros_cr_cr
     con pais distinto de CRC): no se cruzan con FIDE, así que en la columna
     FIDE dicen «No consta» y no tienen norma.
   - El resumen de normas de la ficha (resumenNormas): cuántas normas de
     torneo podría juntar hoy para AF (pide 3, de dos sistemas) y para AI
     (pide 4, después del AF), con los topes de B.06.1 que se ven desde
     afuera: los últimos seis años, una por grupo de fechas que se tocan
     (un festival es eso), una sola de pocas rondas («una») y una sola de
     las que valen una vez («opcion»). Lo que no se ve (firmas, seminario,
     certificados) lo dice escrito.
   - En la lista, «Hoy para AF/AI» es ese mismo resumen, para ordenar y ver
     quién está más cerca del título; en la ficha, cada norma dice hasta
     cuándo cuenta (seis años desde que empezó el torneo).
   - «Torneos por año»: una tabla con barra (el total) y los números escritos,
     en la lista (torneos distintos de los árbitros que se ven) y en la ficha.
   - En la ficha, cada torneo trae su «Equipo de Costa Rica»: quiénes de la
     lista lo arbitraron, dirigieron u organizaron, con su cargo.
   - «Ranking del año»: en la lista, los árbitros por lo que hicieron en un
     año (con los filtros de arriba menos los años), con el puesto (los
     empates comparten puesto: 1, 1, 3) y cómo les fue el año anterior.
   - «Comparar con otro árbitro»: en la ficha, los números de los dos lado a
     lado, año por año y los torneos que hicieron juntos; la dirección lleva
     los dos (#ID,ID) para compartirla.
   - «Para pedir el título» (rutaTitulo): lo que pide B.06.1 para la
     solicitud, punto por punto, con lo que se sabe de cada uno (las
     normas, el seminario de los últimos cuatro años, el tiempo con el AF o
     los torneos de más, y la fecha límite para mandarla). En la lista,
     «Quiénes pueden pedir el título» junta a los que ya tienen alguna
     norma; en la ficha, el Excel con los torneos en el orden del
     formulario de FIDE.
   - El historial en FIDE (de los informes de la Comisión de Árbitros desde
     2023): sus solicitudes de título con el veredicto y los seminarios.
   - La actividad (B.06.3, 2): un IA o FA queda inactivo si en cuatro años
     no hace un curso de actualización; con su AF o su seminario de AI se
     sabe hasta cuándo sigue activo por lo menos.
   - «Por identificar»: los de la lista que no figuran en FIDE y los
     nombres de chess-results que no se reconocen (arbitros_cr_sin_id).
   - «Contar: festivales como uno»: los torneos de un árbitro que empiezan
     el mismo día son un festival y cuentan como uno; su norma es la mejor
     de sus torneos (FIDE da una norma por festival).

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
    const TITULOS_CORTOS = { IA: "AI", FA: "AF", AN: "AN" };
    // El título con la categoría nacional de un AN: «AN-A» en una celda y
    // «Árbitro Nacional (AN), categoría A» en palabras.
    const tituloCorto = (a) => a.titulo ? a.titulo + (a.catNacional ? "-" + a.catNacional : "") : "";
    const tituloLargo = (a) => a.titulo ? TITULOS[a.titulo] + (a.catNacional ? ", categoría " + a.catNacional : "") : "";
    const SISTEMAS = { s: "Suizo", r: "Todos contra todos", d: "Doble todos contra todos", t: "Por equipos", k: "Eliminación directa" };
    const RITMOS = { Standard: "Clásico", Rapid: "Rápido", Blitz: "Blitz" };
    const ESTADOS = { si: "Vale", una: "Vale (una así)", opcion: "Vale una vez", revisar: "Revisar", no: "No" };
    const VALE = ["si", "una", "opcion"];
    const ROLES_CR = { ap: "Árbitro principal", adj: "Árbitro adjunto principal", arb: "Árbitro", dir: "Director del torneo", org: "Organizador" };
    // El rol de chess-results que es el mismo cargo de FIDE.
    const ROL_A_CARGO = { ap: "Chief", adj: "Dep. Chief", arb: "Arbiter" };
    const SIN_NORMA = { estado: "", detalle: "" };
    const PESO = { si: 0, una: 1, opcion: 2, revisar: 3, no: 4 };
    // La federación del torneo en chess-results, en palabras (la que no está
    // acá se muestra con su código).
    const PAISES = { ARG: "Argentina", BOL: "Bolivia", BRA: "Brasil", CAN: "Canadá", CHI: "Chile", COL: "Colombia", CUB: "Cuba", DOM: "República Dominicana",
        ECU: "Ecuador", ESA: "El Salvador", ESP: "España", GUA: "Guatemala", HON: "Honduras", MEX: "México", NCA: "Nicaragua", PAN: "Panamá", PAR: "Paraguay",
        PER: "Perú", PUR: "Puerto Rico", URU: "Uruguay", USA: "Estados Unidos", VEN: "Venezuela", ITA: "Italia", RUS: "Rusia", KSA: "Arabia Saudita",
        GRE: "Grecia", TUR: "Turquía", HUN: "Hungría", GER: "Alemania", FRA: "Francia", AND: "Andorra", JAM: "Jamaica", TTO: "Trinidad y Tobago",
        // No son países: el buscador pone FID a los eventos de FIDE y CCA a los de la Confederación de Ajedrez de América.
        FID: "evento de FIDE", CCA: "evento de la Confederación de Ajedrez de América", XXX: "sin federación" };
    const pais = (codigo) => PAISES[codigo] || codigo;

    let eloCr = new Map(), LISTA = "", sinId = [], equipos = new Map(), arbitros = [], torneos = new Map(), torneosCr = new Map(), crDeFide = new Map(), PRIMER = 0, ULTIMO = 0;
    const estado = { q: "", titulo: "", tipo: "", donde: "", contar: "", desde: 0, hasta: 0, orden: { col: "torneos", dir: -1 }, normaAf: "", normaAi: "", elegido: null, otro: null, enFide: "",
        rankAnio: 0, rankPor: "torneos", federacion: "" };
    // La categoría y los cursos de cada árbitro (arbitros_cr_formacion): fide_id → filas.
    let formacion = new Map();

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

    /* Con qué Elo se evaluó un torneo de chess-results, como lo dice su página
       («Cálculo de elo»): nacional, internacional, ambos o ninguno; sin dato si
       no se leyó. «Solo con Elo nacional»: los de Costa Rica que no son de
       FIDE, que chess-results evaluó solo con el nacional y no son rápidos ni
       blitz: el Elo nacional solo se calcula para el clásico (los 25 rápidos o
       blitz marcados así están mal marcados). El ritmo es el que dice la
       ficha; si no lo dice (los viejos), el que sale del texto de su control
       de tiempo (js/ritmo-control.js: «30 min + 30 seg» es clásico, «3 + 2»
       blitz), y si tampoco se puede leer, cuenta. */
    const calculoDe = (x) => { const e = x.cr ? eloCr.get(x.cr.clave) : null; return e ? e.calculo : undefined; };
    const ritmoCr = (x) => eloCr.get(x.cr.clave).ritmo || RitmoControl.deducir(x.cr.control, x.cr.nombre);
    const soloNacional = (x) => !x.fide && !x.fuera && calculoDe(x) === "nacional" && !["rapido", "blitz"].includes(ritmoCr(x));

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

    // «AAAA-MM-DD» más n días de calendario: Date.UTC solo hace la cuenta
    // del calendario (meses y bisiestos); no es una hora.
    const masDias = (iso, n) => {
        const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n));
        const dos = (x) => String(x).padStart(2, "0");
        return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
    };
    // Después del Consejo, FIDE anota el título en su base de 2 a 5 semanas
    // más tarde: hasta 60 días, lo que empezó en el medio queda para revisar.
    const VENTANA = 60;
    // La fecha del AF: la del perfil (oficial) o la del Consejo.
    const fechaAf = (a) => ({ perfil: (a.fide && a.fide.af_perfil) || "", consejo: (a.fide && a.fide.af_fecha) || "" });

    /* La norma de AI de un torneo según cuándo sacó el AF: cuenta solo si el
       torneo es posterior al título. Su perfil de FIDE da el año («Árbitro
       FIDE (2019)»), no el día: el mismo año queda para revisar. Un AI sin
       ese año (los títulos viejos) queda como estaba: ya tiene el título. */
    function antesDelAf(n, inicio, a) {
        if (!n.estado || n.estado === "no") return n;
        const tiene = ["FA", "IA"].includes(a.titulo);
        if (!tiene) return { estado: "no", detalle: "No tiene el título de AF, y una norma de AI cuenta solo si el torneo es posterior al AF: esta no le servirá aunque lo saque. El torneo: " + n.detalle };
        const { perfil, consejo } = fechaAf(a);
        if (perfil) {
            if (inicio > perfil) return n;
            if (inicio < perfil) return { estado: "no", detalle: `Es de antes de su título de AF (${fecha(perfil)} en su perfil de FIDE, la fecha oficial), y una norma de AI cuenta solo si el torneo es posterior al AF. El torneo: ` + n.detalle };
            return { estado: "revisar", detalle: `Empezó el mismo día de su título de AF en el perfil de FIDE (${fecha(perfil)}): cuenta solo si es posterior. Si contara: ` + n.detalle };
        }
        if (consejo) {
            if (inicio <= consejo) return { estado: "no", detalle: `Es de antes de su título de AF (aprobado por el Consejo el ${fecha(consejo)}), y una norma de AI cuenta solo si el torneo es posterior al AF. El torneo: ` + n.detalle };
            if (inicio <= masDias(consejo, VENTANA)) return { estado: "revisar", detalle: `Empezó después del Consejo que le aprobó el AF (${fecha(consejo)}), pero la fecha oficial es la que FIDE anota en su perfil, de seis días a seis semanas después: FIDE rechazó así una norma 22 días después del Consejo. Mirar su perfil. Si contara: ` + n.detalle };
            return n;
        }
        const m = /Árbitro FIDE \((\d{4})\)/.exec(a.titulo_detalle || "");
        if (!m) return n;
        const af = parseInt(m[1], 10), anio = parseInt(inicio.slice(0, 4), 10);
        if (anio > af) return n;
        if (anio < af) return { estado: "no", detalle: `Es de antes de su título de AF (${af}), y una norma de AI cuenta solo si el torneo es posterior al AF. El torneo: ` + n.detalle };
        return { estado: "revisar", detalle: `Es del mismo año de su título de AF (${af}): cuenta solo si el torneo empezó después de que se lo dieran. Si contara: ` + n.detalle };
    }

    /* Desde que tiene el AF, sus torneos cuentan para AI y ya no para AF.
       Con la fecha exacta, desde el día siguiente; con solo el año, desde el
       año siguiente (el mismo año queda como estaba: no le cambia nada, ya
       tiene el título). */
    function despuesDelAf(n, inicio, a) {
        if (!n.estado || n.estado === "no" || !["FA", "IA"].includes(a.titulo)) return n;
        const { perfil, consejo } = fechaAf(a);
        const m = /Árbitro FIDE \((\d{4})\)/.exec(a.titulo_detalle || "");
        const despues = perfil ? inicio > perfil : consejo ? inicio > masDias(consejo, VENTANA) : m ? parseInt(inicio.slice(0, 4), 10) > parseInt(m[1], 10) : false;
        if (!despues) return n;
        return { estado: "no", detalle: `Ya tenía el título de AF (${perfil ? fecha(perfil) + " en su perfil de FIDE" : consejo ? "aprobado el " + fecha(consejo) : "de " + m[1]}): desde entonces sus torneos cuentan para AI, no para AF. El torneo: ` + n.detalle };
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
    function torneosDelArbitro(a, cargosFide, rolesCr) {
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
            // FIDE escribe el país («Costa Rica»); chess-results da el código.
            const fuera = fide ? e.t.pais !== "Costa Rica" : (e.cr.pais || "CRC") !== "CRC";
            return { ...e, fide, fuera, inicio, anio: parseInt(inicio.slice(0, 4), 10), clave: fide ? "f" + e.t.id : "c" + e.cr.clave,
                af: fide ? despuesDelAf(normaDe(e.t, e.cargos, e.roles, "af"), inicio, a) : SIN_NORMA, ai: fide ? antesDelAf(normaDe(e.t, e.cargos, e.roles, "ai"), inicio, a) : SIN_NORMA };
        });
    }

    // La lista oficial de FIDE dice el título con otras letras: NA es AN.
    const TITULO_LISTA = { IA: "IA", FA: "FA", NA: "AN" };
    const ESTADO_FIDE = { activo: "Activo", inactivo: "Inactivo", no: "No figura" };

    function preparar(filasArb, filasTor, filasCar, filasCr, filasCrCar, filasFide) {
        const deFide = new Map(filasFide.map((f) => [f.fide_id, f]));
        for (const t of filasTor) torneos.set(t.id, t);
        for (const t of filasCr) {
            torneosCr.set(t.clave, t);
            if (t.fide_torneo && !esBasura(t)) crDeFide.set(t.fide_torneo, t);
        }
        const fide = porArbitro(filasCar, "torneo_id", "cargo"), cr = porArbitro(filasCrCar, "clave", "rol");
        arbitros = filasArb.map((fila) => {
            const f = deFide.get(fila.fide_id) || null;
            const a = { ...fila, fide: f, titulo: fila.titulo || (f ? TITULO_LISTA[f.titulo] : ""), enFide: f ? (f.inactivo ? "inactivo" : "activo") : "no",
                busca: sinTildes(fila.nombre) + " " + fila.fide_id };
            // La categoría nacional (A, B o C) de un AN, de la lista de la
            // Federación: la de FIDE no la trae.
            a.catNacional = a.titulo === "AN" && f && f.categoria_nacional ? f.categoria_nacional : "";
            a.todos = torneosDelArbitro(a, fide.get(a.fide_id) || new Map(), cr.get(a.fide_id) || new Map());
            return a;
        });
        LISTA = filasFide.length ? filasFide[0].lista : "";
        FCA = filasFide.reduce((m, f) => (f.fca_leida && f.fca_leida > m ? f.fca_leida : m), "");
        // Los de la lista de la Federación que nunca arbitraron: no están en la
        // lista de la herramienta (no tienen torneos), pero sí en la comparación.
        const conTorneos = new Set(arbitros.map((a) => a.fide_id));
        sinArbitrar = filasFide.filter((f) => FCA && f.fca_leida === FCA && !conTorneos.has(f.fide_id))
            .map((f) => ({ fide_id: f.fide_id, nombre: f.nombre || String(f.fide_id), titulo: TITULO_LISTA[f.titulo] || "", fide: f, todos: [],
                catNacional: f.titulo === "NA" && f.categoria_nacional ? f.categoria_nacional : "" }));
        for (const a of arbitros) a.normas = { af: cuentaNormas(a, "af").usadas.length, ai: cuentaNormas(a, "ai").usadas.length };
        // El equipo de Costa Rica de cada torneo: quién de la lista estuvo y en qué.
        equipos = new Map();
        for (const a of arbitros) for (const x of a.todos) equipos.set(x.clave, (equipos.get(x.clave) || []).concat({ a, x }));
        const anios = arbitros.flatMap((a) => a.todos.map((x) => x.anio));
        PRIMER = Math.min(...anios); ULTIMO = Math.max(...anios);
    }

    // Sus torneos dentro de los años y del tipo elegidos, el más nuevo
    // primero; con «festivales como uno», los del mismo día juntos.
    function torneosDe(a, desde = estado.desde, hasta = estado.hasta) {
        const l = a.todos.filter((x) => x.anio >= desde && x.anio <= hasta
            && (!estado.tipo || (estado.tipo === "nacional" ? soloNacional(x) : (estado.tipo === "fide") === x.fide))
            && (!estado.donde || (estado.donde === "fuera") === x.fuera));
        return (estado.contar === "festival" ? enFestivales(l) : l)
            .sort((x, y) => (y.inicio + y.clave).localeCompare(x.inicio + x.clave));
    }

    // La mejor norma de los torneos de un festival (FIDE da una por festival).
    function mejorNorma(items, cual) {
        const conNorma = items.filter((x) => x.fide).map((x) => x[cual]);
        if (!conNorma.length) return SIN_NORMA;
        const n = conNorma.reduce((m, x) => (PESO[x.estado] < PESO[m.estado] ? x : m));
        return { estado: n.estado, detalle: `Festival de ${items.length} torneos (cuenta una vez); el mejor: ${n.detalle}` };
    }

    // Los torneos que empiezan el mismo día, juntos en un festival.
    function enFestivales(lista) {
        const porDia = new Map();
        for (const x of lista) porDia.set(x.inicio, (porDia.get(x.inicio) || []).concat(x));
        return [...porDia.values()].map((items) => {
            if (items.length === 1) return items[0];
            items.sort((x, y) => (y.fide - x.fide) || (x.t || x.cr).nombre.localeCompare((y.t || y.cr).nombre, "es"));
            return {
                festival: true, items, t: null, cr: null, inicio: items[0].inicio, anio: items[0].anio, clave: "d" + items[0].inicio,
                fide: items.some((x) => x.fide), fuera: items.some((x) => x.fuera), cargos: [...new Set(items.flatMap((x) => x.cargos))], roles: [...new Set(items.flatMap((x) => x.roles))],
                af: mejorNorma(items, "af"), ai: mejorNorma(items, "ai"),
            };
        });
    }

    // Lo que hizo en un torneo, en palabras: el cargo de FIDE y, si no lo
    // dice ya, su rol en chess-results.
    function cargoEscrito(x) {
        if (x.festival) return [...new Set(x.items.flatMap((y) => cargoEscrito(y).split(", ")))].join(", ");
        const dichos = new Set(x.cargos.map((c) => CARGOS[c] || c));
        for (const r of x.roles) if (!(ROL_A_CARGO[r] && x.cargos.length)) dichos.add(ROLES_CR[r] || r);
        return [...dichos].join(", ");
    }
    const fue = (x, cargo, rol) => x.cargos.includes(cargo) || x.roles.includes(rol);

    function resumen(a, desde, hasta) {
        const l = torneosDe(a, desde, hasta);
        const cuenta = (f) => l.filter(f).length;
        return {
            a, torneos: l.length, fide: cuenta((x) => x.fide), nofide: cuenta((x) => !x.fide), fuera: cuenta((x) => x.fuera),
            // Un festival cuenta si alguno de sus torneos fue solo con Elo nacional.
            nacional: cuenta((x) => x.festival ? x.items.some(soloNacional) : soloNacional(x)),
            principal: cuenta((x) => fue(x, "Chief", "ap")),
            adjunto: cuenta((x) => fue(x, "Dep. Chief", "adj")),
            arbitro: cuenta((x) => fue(x, "Arbiter", "arb")),
            af: cuenta((x) => x.fide && x.af.estado !== "no"), afRevisar: cuenta((x) => x.af.estado === "revisar"),
            ai: cuenta((x) => x.fide && x.ai.estado !== "no"), aiRevisar: cuenta((x) => x.ai.estado === "revisar"),
            ultimo: l.length ? l[0].inicio : "", primero: l.length ? l[l.length - 1].inicio : "",
            // «Hoy para AF/AI»: no depende de los filtros (es lo que junta hoy).
            enFide: ESTADO_FIDE[a.enFide],
            cercaAf: ["FA", "IA"].includes(a.titulo) ? 100 : a.normas.af, cercaAi: a.titulo === "IA" ? 100 : a.normas.ai,
            anioAf: anioTitulo(a, "af"), anioAi: anioTitulo(a, "ai"),
        };
    }

    // El año en que consiguió cada título, el que dice su perfil de FIDE
    // («Árbitro FIDE (2009), Árbitro Internacional (2015)»). 0 si no lo tiene.
    function anioTitulo(a, cual) {
        const m = (cual === "af" ? /Árbitro FIDE \((\d{4})\)/ : /Árbitro Internacional \((\d{4})\)/).exec(a.titulo_detalle || "");
        return m ? parseInt(m[1], 10) : 0;
    }

    // El buscador y el título: los usan la lista y el ranking.
    function enLista() {
        const q = sinTildes(estado.q.trim());
        return arbitros.filter((a) => (!q || a.busca.includes(q)) && (!estado.titulo || (estado.titulo === "-" ? !a.titulo : estado.titulo.startsWith("AN-") ? tituloCorto(a) === estado.titulo : a.titulo === estado.titulo))
            && (!estado.enFide || a.enFide === estado.enFide)
            && (!estado.federacion || (estado.federacion === "mas" ? subirCategoria(a).fueraDeCategoria.length > 0
                : (actividadFca(a).estado === "inactivo") === (estado.federacion === "inactivo"))));
    }

    // La lista con los filtros y el orden elegidos: la pinta pintarGeneral y la baja excelLista.
    function filasLista() {
        const filas = enLista().map((a) => resumen(a)).filter((r) => r.torneos > 0);
        const { col, dir } = estado.orden;
        // Sin el título, al final en los dos sentidos.
        const valor = (r) => col === "nombre" ? r.a.nombre : col === "titulo" ? (tituloCorto(r.a) || "~")
            : col.startsWith("anio") && !r[col] ? (dir > 0 ? 9999 : 0) : r[col];
        filas.sort((x, y) => {
            const a = valor(x), b = valor(y);
            const c = typeof a === "number" ? a - b : String(a).localeCompare(String(b), "es");
            return c * dir || x.a.nombre.localeCompare(y.a.nombre, "es");
        });
        return filas;
    }

    function pintarGeneral() {
        const filas = filasLista();
        const { col, dir } = estado.orden;
        const conRev = (n, r) => miles(n) + (r ? " (" + miles(r) + ")" : "");
        $("tabla-arbitros").tBodies[0].replaceChildren(...filas.map((r) => {
            const boton = el("button", { type: "button", class: "font-semibold underline underline-offset-2 hover:no-underline text-left" }, r.a.nombre);
            boton.addEventListener("click", () => elegir(r.a.fide_id));
            // px-1.5 y sin cortar los números: con sus 19 columnas, la tabla cabe
            // en una portátil (1280 px) sin barra de lado.
            const td = (v, der) => el("td", { class: "px-1.5 py-2 whitespace-nowrap" + (der ? " text-right tabular-nums" : "") }, v);
            return el("tr", { class: "border-t border-brand-100 dark:border-brand-800" },
                el("th", { scope: "row", class: "px-1.5 py-2 font-normal text-left" }, boton),
                td(tituloCorto(r.a) || "—"), td(r.anioAf ? String(r.anioAf) : "—", true), td(r.anioAi ? String(r.anioAi) : "—", true), td(r.enFide), td(miles(r.torneos), true), td(miles(r.fide), true), td(miles(r.nofide), true), td(miles(r.nacional), true), td(miles(r.fuera), true),
                td(miles(r.principal), true), td(miles(r.adjunto), true), td(miles(r.arbitro), true),
                td(conRev(r.af, r.afRevisar), true), td(conRev(r.ai, r.aiRevisar), true),
                td(r.cercaAf === 100 ? "Ya es AF" : `${miles(r.cercaAf)} de 3`, true), td(r.cercaAi === 100 ? "Ya es AI" : `${miles(r.cercaAi)} de 4`, true),
                td(fecha(r.primero)), td(fecha(r.ultimo)));
        }));
        for (const th of $("tabla-arbitros").tHead.rows[0].cells) {
            const c = th.querySelector("button").dataset.col;
            th.setAttribute("aria-sort", c === col ? (dir < 0 ? "descending" : "ascending") : "none");
        }
        // Con «festivales como uno», todo lo que empieza el mismo día es uno
        // solo, aunque cada árbitro haya estado en una parte distinta.
        const vistos = new Map(), clave = (x) => estado.contar === "festival" ? x.inicio : x.clave;
        for (const r of filas) for (const x of torneosDe(r.a)) {
            const v = vistos.get(clave(x)) || { fide: false, fuera: false };
            vistos.set(clave(x), { fide: v.fide || x.fide, fuera: v.fuera || x.fuera });
        }
        // Para la tabla por año: cada torneo una vez (el primero que aparece).
        const unicos = new Map();
        for (const r of filas) for (const x of torneosDe(r.a)) if (!unicos.has(clave(x))) unicos.set(clave(x), x);
        pintarActividad("actividad", [...unicos.values()]);
        const fideVistos = [...vistos.values()].filter((v) => v.fide).length, fueraVistos = [...vistos.values()].filter((v) => v.fuera).length;
        $("cuenta").textContent = filas.length
            ? `${miles(filas.length)} árbitros con ${miles(vistos.size)} ${estado.contar === "festival" ? "torneos o festivales" : "torneos"} (${miles(fideVistos)} de FIDE y ${miles(vistos.size - fideVistos)} que no; ${miles(fueraVistos)} en el extranjero) de ${estado.desde} a ${estado.hasta}.`
            : "Ningún árbitro cumple con estos filtros.";
        pintarRanking();
        pintarSolicitudes();
        pintarPorVencer();
        pintarActividadFide();
        pintarListaFca();
        pintarSubir();
        pintarSugerida();
        pintarPorIdentificar();
    }

    const VEREDICTO = { aprobada: "Aprobada", rechazada: "Rechazada", pospuesta: "Pospuesta" };

    /* «Historial en FIDE» de la ficha: sus solicitudes de título y sus
       seminarios según los informes de la Comisión de Árbitros (desde 2023). */
    function pintarHistorial(a) {
        const f = a.fide, sols = (f && f.solicitudes) || [], sems = (f && f.seminarios) || [];
        const caja = $("ficha-historial");
        if (!sols.length && !sems.length) {
            caja.replaceChildren(el("p", { class: "text-sm text-brand-500 dark:text-brand-300" }, "No figura en los informes de la Comisión de Árbitros al Consejo de FIDE desde 2023: ni solicitudes de título ni seminarios."));
            return;
        }
        const lista = el("ul", { class: "space-y-2 text-sm" });
        for (const x of sols.slice().sort((p, q) => q.fecha.localeCompare(p.fecha))) {
            const det = el("details", { class: "of-detalle mt-1" }, el("summary", { class: "cursor-pointer underline underline-offset-2" }, `Lo que mandó (${miles(x.torneos.length)})`),
                el("ul", { class: "mt-1 space-y-0.5" }, ...x.torneos.map((t) => el("li", {}, t))));
            lista.append(el("li", { "data-solicitud": x.fecha },
                el("strong", {}, `${fecha(x.fecha)} · Solicitud de ${x.titulo === "FA" ? "AF" : "AI"}: ${VEREDICTO[x.veredicto] || x.veredicto}`),
                x.motivo ? el("span", {}, ` — «${x.motivo}» (así lo escribe FIDE, en inglés)`) : null,
                el("span", { class: "of-detalle" }, x.consejo, " · ", enlace(x.fuente, "informe de la Comisión")), det));
        }
        for (const x of sems.slice().sort((p, q) => (q.fecha || q.mes).localeCompare(p.fecha || p.mes))) {
            const vence = masAnios(x.fecha || x.mes, 4), vigente = hoyCr().slice(0, vence.length) <= vence;
            lista.append(el("li", { "data-seminario": x.tipo },
                el("strong", {}, `${x.fecha ? fecha(x.fecha) : cuando(x.mes)} · Seminario de ${x.tipo === "FA" ? "AF" : "AI"}: ${x.seminario}`),
                el("span", { class: "of-detalle" }, (vigente ? "Vale para pedir el título hasta " : "Ya no vale para pedir el título: venció ") + (vence.length === 7 ? cuando(vence) : "el " + fecha(vence)) + " (cuatro años, B.06.1 5.3.2). · ",
                    enlace(x.fuente, "informe de la Comisión"))));
        }
        caja.replaceChildren(lista);
    }

    /* «Quiénes pueden pedir el título»: cada uno con el título que le sigue
       (AF si no lo tiene, AI si es FA) y al menos una norma para él, el más
       listo primero. */
    function pintarSolicitudes() {
        const filas = [];
        for (const a of enLista()) {
            const cual = ["FA", "IA"].includes(a.titulo) ? (a.titulo === "FA" ? "ai" : null) : "af";
            if (!cual) continue;
            const ruta = rutaTitulo(a, cual), n = cuentaNormas(a, cual).usadas.length;
            if (!n) continue;
            const faltan = ruta.filter((r) => r.estado === "Falta");
            const limite = (ruta.find((r) => /^Fecha límite/.test(r.texto)) || {}).texto;
            filas.push({ a, cual, n, faltan, limite: limite ? /el (\d{2}\/\d{2}\/\d{4})/.exec(limite)[1] : "" });
        }
        filas.sort((x, y) => x.faltan.length - y.faltan.length || y.n / PIDE[y.cual] - x.n / PIDE[x.cual] || x.a.nombre.localeCompare(y.a.nombre, "es"));
        const td = (v, der) => el("td", { class: "px-3 py-2 align-top" + (der ? " text-right tabular-nums" : "") }, v);
        $("tabla-solicitudes").tBodies[0].replaceChildren(...filas.map((r) => {
            const boton = el("button", { type: "button", class: "font-semibold underline underline-offset-2 hover:no-underline text-left" }, r.a.nombre);
            boton.addEventListener("click", () => elegir(r.a.fide_id));
            const sem = seminarioDe(r.a, r.cual === "af" ? "FA" : "IA");
            return el("tr", { class: "border-t border-brand-100 dark:border-brand-800" },
                el("th", { scope: "row", class: "px-3 py-2 align-top font-normal text-left" }, boton),
                td(r.cual === "af" ? "AF" : "AI"), td(`${miles(r.n)} de ${PIDE[r.cual]}`, true),
                td(sem ? (sem.vigente ? "Vigente hasta " + (sem.vence.length === 7 ? cuando(sem.vence) : fecha(sem.vence)) : "Vencido") : "No consta"),
                td(r.faltan.length ? "Le falta: " + r.faltan.map((f) => f.texto.split(":")[0].toLowerCase()).join(", ") : "Lista para mandar" + (r.limite ? " antes del " + r.limite : "")));
        }));
        $("solicitudes-cuenta").textContent = filas.length
            ? `${miles(filas.length)} con alguna norma para su siguiente título; ${miles(filas.filter((r) => !r.faltan.length).length)} con todo lo que se ve desde afuera.`
            : "Nadie con normas para su siguiente título con estos filtros.";
    }

    /* «Por vencer»: lo que alguien junta para su siguiente título y deja de
       servir en los próximos doce meses, lo que vence antes primero. Una
       norma cuenta seis años desde que empezó el torneo (B.06.1 5.3.1) y un
       seminario vale cuatro (5.3.2). Dice con cuántas normas queda si la que
       vence se pierde, para saber si urge mandar la solicitud. */
    const MESES_AVISO = 12;
    function porVencer(a) {
        const cual = ["FA", "IA"].includes(a.titulo) ? (a.titulo === "FA" ? "ai" : null) : "af";
        if (!cual) return [];
        const hoy = hoyCr(), tope = masAnios(hoy, MESES_AVISO / 12);
        const usadas = cuentaNormas(a, cual).usadas, lista = [];
        for (const x of usadas) {
            const vence = masAnios(x.inicio, 6);
            if (vence >= hoy && vence <= tope) lista.push({ a, cual, vence, dice: fecha(vence), que: "norma", texto: `Norma de ${cual === "af" ? "AF" : "AI"}: ${x.t.nombre} (${fecha(x.inicio)})`,
                quedan: usadas.filter((y) => masAnios(y.inicio, 6) > vence).length });
        }
        const sem = seminarioDe(a, cual === "af" ? "FA" : "IA");
        if (usadas.length && sem && sem.vigente) {
            // Con solo el mes («junio de 2029»), vale hasta que se termina ese mes.
            const vence = sem.vence.length === 7 ? sem.vence + "-31" : sem.vence;
            if (sem.vence <= tope.slice(0, sem.vence.length)) lista.push({ a, cual, vence, dice: cuando(sem.vence), que: "seminario", texto: `Seminario de ${cual === "af" ? "AF" : "AI"}: ${sem.seminario}`, quedan: usadas.length });
        }
        return lista;
    }

    function pintarPorVencer() {
        const filas = enLista().flatMap(porVencer)
            .sort((x, y) => x.vence.localeCompare(y.vence) || x.a.nombre.localeCompare(y.a.nombre, "es"));
        const td = (v, der) => el("td", { class: "px-3 py-2 align-top" + (der ? " text-right tabular-nums" : "") }, v);
        $("tabla-por-vencer").tBodies[0].replaceChildren(...filas.map((r) => {
            const boton = el("button", { type: "button", class: "font-semibold underline underline-offset-2 hover:no-underline text-left" }, r.a.nombre);
            boton.addEventListener("click", () => elegir(r.a.fide_id));
            const pide = PIDE[r.cual];
            return el("tr", { class: "border-t border-brand-100 dark:border-brand-800", "data-que": r.que },
                el("th", { scope: "row", class: "px-3 py-2 align-top font-normal text-left" }, boton),
                td(r.texto), td(r.dice),
                td(r.que === "seminario" ? "Sin seminario vigente no puede mandar la solicitud"
                    : `Queda con ${miles(r.quedan)} de ${pide}` + (r.quedan + 1 >= pide ? ": si la va a mandar, que sea antes" : "")));
        }));
        $("por-vencer-cuenta").textContent = filas.length
            ? `${miles(filas.length)} ${filas.length === 1 ? "cosa vence" : "cosas vencen"} en los próximos ${MESES_AVISO} meses, de ${miles(new Set(filas.map((r) => r.a.fide_id)).size)} ${new Set(filas.map((r) => r.a.fide_id)).size === 1 ? "árbitro" : "árbitros"}.`
            : `Nada de lo que alguien junta para su siguiente título vence en los próximos ${MESES_AVISO} meses.`;
    }

    // «La actividad en FIDE»: los IA y FA, inactivos primero y después el que vence antes.
    function pintarActividadFide() {
        const filas = enLista().map((a) => ({ a, act: actividad(a) })).filter((r) => r.act)
            .sort((x, y) => (x.act.estado === "inactivo" ? 0 : 1) - (y.act.estado === "inactivo" ? 0 : 1) || (x.act.hasta || "9").localeCompare(y.act.hasta || "9") || x.a.nombre.localeCompare(y.a.nombre, "es"));
        const td = (v) => el("td", { class: "px-3 py-2 align-top" }, v);
        $("tabla-actividad-fide").tBodies[0].replaceChildren(...filas.map((r) => {
            const boton = el("button", { type: "button", class: "font-semibold underline underline-offset-2 hover:no-underline text-left" }, r.a.nombre);
            boton.addEventListener("click", () => elegir(r.a.fide_id));
            return el("tr", { class: "border-t border-brand-100 dark:border-brand-800" },
                el("th", { scope: "row", class: "px-3 py-2 align-top font-normal text-left" }, boton), td(r.a.titulo),
                td(r.act.estado === "inactivo" ? "Inactivo" : "Activo"),
                td(r.act.estado === "inactivo" ? "—" : r.act.hasta ? fecha(r.act.hasta) + (r.act.pronto ? " (en menos de un año)" : "") : "Sin datos"));
        }));
    }

    /* «La lista de la Federación»: comparar quién está en la lista de árbitros
       de la Federación Costarricense de Ajedrez con quién arbitra de verdad. Cuenta
       los torneos en Costa Rica como árbitro (principal, adjunto o árbitro, en
       la ficha de FIDE o en chess-results), sin los filtros de arriba. Están en
       la lista quienes tienen la fecha de la lista más nueva (fca_leida). */
    const ANIOS_SIN = 3, ANIOS_SEGUIDO = 2, SEGUIDO = 3;
    const plural = (n, uno, varios) => `${miles(n)} ${n === 1 ? uno : varios}`;
    let FCA = "", sinArbitrar = [];
    const enListaFca = (a) => !!(FCA && a.fide && a.fide.fca_leida === FCA);
    const arbitrando = (a, desde) => a.todos.filter((x) => !x.fuera && x.anio >= desde
        && (fue(x, "Chief", "ap") || fue(x, "Dep. Chief", "adj") || fue(x, "Arbiter", "arb")))
        .sort((x, y) => y.inicio.localeCompare(x.inicio));
    // Los de la lista que no arbitraron en tres años y los que arbitran seguido sin estar en ella.
    function listaFca() {
        const anio = parseInt(hoyCr().slice(0, 4), 10);
        const quietos = arbitros.concat(sinArbitrar).filter((a) => enListaFca(a) && !arbitrando(a, anio - ANIOS_SIN + 1).length)
            .sort((x, y) => (arbitrando(y, 0)[0] || { inicio: "" }).inicio.localeCompare((arbitrando(x, 0)[0] || { inicio: "" }).inicio) || x.nombre.localeCompare(y.nombre, "es"));
        const fuera = arbitros.filter((a) => !enListaFca(a)).map((a) => ({ a, l: arbitrando(a, anio - ANIOS_SEGUIDO + 1) }))
            .filter((r) => r.l.length >= SEGUIDO).sort((x, y) => y.l.length - x.l.length || x.a.nombre.localeCompare(y.a.nombre, "es"));
        return { quietos, fuera };
    }

    function pintarListaFca() {
        const anio = parseInt(hoyCr().slice(0, 4), 10);
        const td = (v, der) => el("td", { class: "px-3 py-2 align-top" + (der ? " text-right tabular-nums" : "") }, v);
        const boton = (a) => {
            if (!a.todos.length) return el("th", { scope: "row", class: "px-3 py-2 align-top font-normal text-left" }, a.nombre);
            const b = el("button", { type: "button", class: "font-semibold underline underline-offset-2 hover:no-underline text-left" }, a.nombre);
            b.addEventListener("click", () => elegir(a.fide_id));
            return el("th", { scope: "row", class: "px-3 py-2 align-top font-normal text-left" }, b);
        };
        const ultimoComo = (a) => { const l = arbitrando(a, 0); return l.length ? fecha(l[0].inicio) : "Ninguno"; };
        const { quietos, fuera } = listaFca();
        const vacia = (cols, texto) => [el("tr", {}, el("td", { colspan: String(cols), class: "px-3 py-2 text-brand-500 dark:text-brand-300" }, texto))];
        $("tabla-fca-quietos").tBodies[0].replaceChildren(...(quietos.length ? quietos.map((a) => el("tr", { class: "border-t border-brand-100 dark:border-brand-800" },
            boton(a), td(tituloCorto(a) || "—"), td(ultimoComo(a)))) : vacia(3, "Todos los de la lista arbitraron en estos años.")));
        $("tabla-fca-fuera").tBodies[0].replaceChildren(...(fuera.length ? fuera.map(({ a, l }) => el("tr", { class: "border-t border-brand-100 dark:border-brand-800" },
            boton(a), td(tituloCorto(a) || "—"), td(ESTADO_FIDE[a.enFide]), td(miles(l.length), true), td(fecha(l[0].inicio)))) : vacia(5, "Nadie arbitra seguido sin estar en la lista.")));
        $("fca-cuenta").textContent = FCA
            ? `Lista de la Federación leída el ${fecha(FCA)}: ${plural(arbitros.concat(sinArbitrar).filter(enListaFca).length, "árbitro", "árbitros")}. ${plural(quietos.length, "no arbitró", "no arbitraron")} en Costa Rica desde ${anio - ANIOS_SIN + 1}; ${plural(fuera.length, "arbitró", "arbitraron")} ${SEGUIDO} o más torneos desde ${anio - ANIOS_SEGUIDO + 1} sin estar en ella.`
            : "Todavía no se leyó la lista de la Federación.";
    }

    /* «Quiénes pueden subir de categoría»: los AN de categoría C o B con algún
       torneo que podría ser norma (subirCategoria), el más listo primero, y
       cuántas veces fueron principal o adjunto en más de lo que deja su
       categoría. */
    const estadoSubir = (s) => s.listo ? "Puede pedirla" : s.estado;
    function filasSubir() {
        const ORDEN = { "Puede pedirla": 0, "Le alcanzaría": 1, "Le falta otro tipo": 2, "Le falta una": 3, "Le faltan dos": 4 };
        return arbitros.filter((a) => a.titulo === "AN" && (a.catNacional === "C" || a.catNacional === "B")).map((a) => ({ a, s: subirCategoria(a) }))
            .filter(({ s }) => s.firmes.length || s.revisar.length || s.fueraDeCategoria.length)
            .sort((x, y) => ORDEN[estadoSubir(x.s)] - ORDEN[estadoSubir(y.s)] || y.s.firmes.length - x.s.firmes.length || x.a.nombre.localeCompare(y.a.nombre, "es"));
    }
    function excelSubir() {
        window.TablaExcel.bajar("subir-de-categoria.xlsx", [{ nombre: "Subir de categoría", filas: [["Árbitro", "ID FIDE", "Categoría", "Pasa a", "Categoría desde", "Normas",
            "Podrían ser norma", "Para revisar", "Más de lo que deja su categoría", "Lo que pide"]].concat(filasSubir().map(({ a, s }) => [a.nombre, a.fide_id, s.cat, s.sigue,
            s.desdeCat ? fecha(s.desdeCat) : "", estadoSubir(s), s.firmes.length, s.revisar.length, s.fueraDeCategoria.length, s.pide.map(([e, t]) => e + ": " + t).join(" | ")])) }]);
    }

    function pintarSubir() {
        const filas = filasSubir();
        const td = (v, der) => el("td", { class: "px-3 py-2 align-top" + (der ? " text-right tabular-nums" : "") }, v);
        $("tabla-subir").tBodies[0].replaceChildren(...(filas.length ? filas.map(({ a, s }) => {
            const b = el("button", { type: "button", class: "font-semibold underline underline-offset-2 hover:no-underline text-left" }, a.nombre);
            b.addEventListener("click", () => elegir(a.fide_id));
            return el("tr", { class: "border-t border-brand-100 dark:border-brand-800" },
                el("th", { scope: "row", class: "px-3 py-2 align-top font-normal text-left" }, b),
                td(`${s.cat} a ${s.sigue}`), td(estadoSubir(s)), td(miles(s.firmes.length), true), td(miles(s.revisar.length), true), td(miles(s.fueraDeCategoria.length), true));
        }) : [el("tr", {}, el("td", { colspan: "6", class: "px-3 py-2 text-brand-500 dark:text-brand-300" }, "Ningún AN de categoría C o B tiene torneos que puedan ser norma."))]));
        const listos = filas.filter((f) => f.s.par).length;
        $("subir-cuenta").textContent = `${plural(filas.length, "Árbitro Nacional de categoría C o B tiene", "Árbitros Nacionales de categoría C o B tienen")} algo para mirar; a ${plural(listos, "le alcanzarían", "les alcanzarían")} las normas para subir (lo demás —el año con la categoría y los cursos— no se ve desde acá).`;
    }

    /* «Por identificar»: los de la lista que no figuran en FIDE y las celdas
       de chess-results en que no se reconoce a nadie. */
    function pintarPorIdentificar() {
        const td = (v, der) => el("td", { class: "px-3 py-2 align-top" + (der ? " text-right tabular-nums" : "") }, v);
        const fuera = arbitros.filter((a) => a.enFide === "no").map((a) => ({ a, r: resumen(a, PRIMER, ULTIMO) })).sort((x, y) => y.r.torneos - x.r.torneos || x.a.nombre.localeCompare(y.a.nombre, "es"));
        $("tabla-no-fide").tBodies[0].replaceChildren(...fuera.map(({ a, r }) => {
            const boton = el("button", { type: "button", class: "font-semibold underline underline-offset-2 hover:no-underline text-left" }, a.nombre);
            boton.addEventListener("click", () => elegir(a.fide_id));
            return el("tr", { class: "border-t border-brand-100 dark:border-brand-800" },
                el("th", { scope: "row", class: "px-3 py-2 align-top font-normal text-left" }, boton), td(String(a.fide_id)),
                td(a.solo_chess_results ? "Solo en chess-results" : "En fichas de FIDE"), td(miles(r.torneos), true), td(fecha(r.ultimo)));
        }));
        const ROL = { ap: "principal", adj: "adjunto", arb: "árbitro" };
        $("tabla-sin-id").tBodies[0].replaceChildren(...sinId.slice().sort((x, y) => y.torneos - x.torneos || x.texto.localeCompare(y.texto, "es")).map((x) =>
            el("tr", { class: "border-t border-brand-100 dark:border-brand-800" },
                el("th", { scope: "row", class: "px-3 py-2 align-top font-normal text-left" }, x.texto),
                td(x.roles.map((r) => ROL[r] || r).join(", ")), td(miles(x.torneos), true), td(`${fecha(x.primero)} al ${fecha(x.ultimo)}`),
                td(x.ids.length ? x.ids.join(", ") : "—"),
                el("td", { class: "px-3 py-2 align-top" }, ...x.claves.flatMap((k, i) => [i ? " · " : null, enlace(urlCr({ clave: k }), String(k))]))))); 
        $("por-identificar-cuenta").textContent = `${miles(fuera.length)} de la lista no figuran en la lista de árbitros de FIDE; ${miles(sinId.length)} nombres de chess-results no se reconocen (${miles(sinId.reduce((s, x) => s + x.torneos, 0))} torneos).`;
    }

    /* «Ranking del año»: los de la lista (buscador, título, tipo, dónde y
       contar; los años no) por lo elegido en «Ordenar por», con el puesto
       (los empates lo comparten: 1, 1, 3). */
    const ORDINAL = (n) => miles(n) + ".º";
    function ranking(anio) {
        const por = estado.rankPor;
        const filas = enLista().map((a) => resumen(a, anio, anio)).filter((r) => r[por] > 0)
            .sort((x, y) => y[por] - x[por] || x.a.nombre.localeCompare(y.a.nombre, "es"));
        filas.forEach((r, i) => { r.puesto = i && r[por] === filas[i - 1][por] ? filas[i - 1].puesto : i + 1; });
        return filas;
    }

    // Cómo le fue el año anterior, en palabras (el color no va solo: no hay color).
    function antes(r, previo, anio) {
        if (anio - 1 < PRIMER) return "—";
        const p = previo.get(r.a.fide_id);
        if (!p) return `No figuraba en ${anio - 1}`;
        if (p === r.puesto) return `Igual (${ORDINAL(p)})`;
        return `${p > r.puesto ? "Sube" : "Baja"} ${miles(Math.abs(p - r.puesto))} (era ${ORDINAL(p)})`;
    }

    function pintarRanking() {
        const anio = estado.rankAnio, filas = ranking(anio);
        const previo = new Map(anio - 1 >= PRIMER ? ranking(anio - 1).map((r) => [r.a.fide_id, r.puesto]) : []);
        const td = (v, der) => el("td", { class: "px-3 py-2" + (der ? " text-right tabular-nums" : "") }, v);
        $("tabla-ranking").tBodies[0].replaceChildren(...filas.map((r) => {
            const boton = el("button", { type: "button", class: "font-semibold underline underline-offset-2 hover:no-underline text-left" }, r.a.nombre);
            boton.addEventListener("click", () => elegir(r.a.fide_id));
            return el("tr", { class: "border-t border-brand-100 dark:border-brand-800" },
                td(ORDINAL(r.puesto), true), el("th", { scope: "row", class: "px-3 py-2 font-normal text-left" }, boton),
                td(miles(r.torneos), true), td(miles(r.principal), true), td(miles(r.fide), true), td(miles(r.nacional), true), td(miles(r.fuera), true), td(miles(r.af), true),
                td(antes(r, previo, anio)));
        }));
        for (const th of $("tabla-ranking").tHead.rows[0].cells) {
            if (th.dataset.col) th.setAttribute("aria-sort", th.dataset.col === estado.rankPor ? "descending" : "none");
        }
        $("ranking-cuenta").textContent = filas.length
            ? `${miles(filas.length)} ${filas.length === 1 ? "árbitro" : "árbitros"} con ${$("ranking-por").selectedOptions[0].textContent.toLowerCase()} en ${anio}.`
            : `Nadie con ${$("ranking-por").selectedOptions[0].textContent.toLowerCase()} en ${anio} con estos filtros.`;
    }

    /* «Descargar la lista en Excel»: las mismas filas y columnas que se ven, con
       los filtros y el orden elegidos, y una hoja con los filtros. */
    function excelLista() {
        const filas = filasLista();
        const elegidos = [["Años", `${estado.desde} a ${estado.hasta}`]];
        for (const id of ["titulo", "tipo", "donde", "contar", "en-fide", "federacion"]) {
            const s = $(id);
            if (s && s.value) elegidos.push([s.labels && s.labels[0] ? s.labels[0].textContent.trim() : id, s.selectedOptions[0].textContent]);
        }
        if (estado.q.trim()) elegidos.push(["Buscar", estado.q.trim()]);
        elegidos.push(["Bajado el", window.HoraCR.fecha(new Date())]);
        window.TablaExcel.bajar("arbitros-cr.xlsx", [
            { nombre: "Árbitros", filas: [["Árbitro", "ID FIDE", "Título", "AF desde", "AI desde", "En FIDE", "Torneos", "FIDE", "No FIDE", "Solo Elo nacional",
                "En el extranjero", "Principal", "Adjunto", "Árbitro", "Valen para AF", "AF por revisar", "Valen para AI", "AI por revisar", "Hoy para AF", "Hoy para AI",
                "Primer torneo", "Último torneo", "Actividad en la Federación (art. 19)", "Más de lo que deja su categoría"]].concat(filas.map((r) => [r.a.nombre, r.a.fide_id, tituloCorto(r.a) || "", r.anioAf || "", r.anioAi || "", r.enFide,
                r.torneos, r.fide, r.nofide, r.nacional, r.fuera, r.principal, r.adjunto, r.arbitro, r.af, r.afRevisar, r.ai, r.aiRevisar,
                r.cercaAf === 100 ? "Ya es AF" : `${r.cercaAf} de 3`, r.cercaAi === 100 ? "Ya es AI" : `${r.cercaAi} de 4`,
                r.primero ? fecha(r.primero) : "", r.ultimo ? fecha(r.ultimo) : "", ESTADO_ACTIVIDAD[actividadFca(r.a).estado], subirCategoria(r.a).fueraDeCategoria.length])) },
            { nombre: "Filtros", filas: [["Filtro", "Elegido"]].concat(elegidos) },
        ]);
    }

    function excelRanking() {
        const anio = estado.rankAnio, filas = ranking(anio);
        const previo = new Map(anio - 1 >= PRIMER ? ranking(anio - 1).map((r) => [r.a.fide_id, r.puesto]) : []);
        window.TablaExcel.bajar("ranking-arbitros-" + anio + ".xlsx", [{ nombre: "Ranking " + anio, filas: [["Puesto", "Árbitro", "ID FIDE", "Título", "Torneos", "Principal", "FIDE",
            "Solo Elo nacional", "En el extranjero", "Valen para AF", "El año anterior"]].concat(filas.map((r) => [r.puesto, r.a.nombre, r.a.fide_id, tituloCorto(r.a), r.torneos, r.principal, r.fide,
            r.nacional, r.fuera, r.af, antes(r, previo, anio)])) }]);
    }

    /* «Torneos por año»: una fila por año con una barra del total (el número
       va escrito al lado) y cuántos de FIDE, no FIDE y en el extranjero. */
    function pintarActividad(tabla, lista) {
        const por = new Map();
        for (const x of lista) {
            const v = por.get(x.anio) || { total: 0, fide: 0, nofide: 0, fuera: 0 };
            v.total++; if (x.fide) v.fide++; else v.nofide++; if (x.fuera) v.fuera++;
            por.set(x.anio, v);
        }
        const max = Math.max(1, ...[...por.values()].map((v) => v.total));
        const td = (v, der) => el("td", { class: "px-3 py-1.5" + (der ? " text-right tabular-nums" : "") }, v);
        $(tabla).tBodies[0].replaceChildren(...[...por.entries()].sort((a, b) => b[0] - a[0]).map(([anio, v]) => {
            const barra = el("span", { class: "inline-block h-3 rounded-full bg-brand-500 dark:bg-brand-300 align-middle", "aria-hidden": "true" });
            barra.style.width = Math.max(4, Math.round(160 * v.total / max)) + "px";
            return el("tr", { class: "border-t border-brand-100 dark:border-brand-800" },
                el("th", { scope: "row", class: "px-3 py-1.5 font-normal tabular-nums" }, String(anio)),
                el("td", { class: "px-3 py-1.5 whitespace-nowrap" }, barra, " ", el("span", { class: "tabular-nums" }, miles(v.total))),
                td(miles(v.fide), true), td(miles(v.nofide), true), td(miles(v.fuera), true));
        }));
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
            (a.titulo ? tituloLargo(a) + (a.titulo_detalle ? " (" + a.titulo_detalle + ")" : "") + " · " : ""),
            "ID FIDE ",
            enlace("https://ratings.fide.com/profile/" + a.fide_id, String(a.fide_id)),
            ` · ${miles(r.torneos)} ${r.torneos === 1 ? "torneo" : "torneos"} de ${estado.desde} a ${estado.hasta} (${miles(r.fide)} de FIDE, ${miles(r.nofide)} que no${r.nacional ? ", " + miles(r.nacional) + " de ellos con solo Elo nacional" : ""}; ${miles(r.fuera)} en el extranjero)`
            + (r.torneos ? `, del ${fecha(r.primero)} al ${fecha(r.ultimo)}` : "")
            + (a.solo_chess_results ? ". No figura como árbitro en ninguna ficha de FIDE." : `: valen para AF ${miles(r.af)}, para AI ${miles(r.ai)}.`));
        $("ficha-fide").textContent = textoFide(a);
        pintarHistorial(a);
        $("ficha-normas").replaceChildren(tarjetaNorma(a, "af"), tarjetaNorma(a, "ai"));
        $("ficha-categoria").replaceChildren(...(a.titulo === "AN" ? [tarjetaCategoria(a)] : []));
        pintarFormacion(a);
        pintarRevision(a);
        pintarComparacion(a);
        pintarActividad("ficha-actividad", torneosDe(a));
        const lista = filasFicha(a);
        $("tabla-torneos").tBodies[0].replaceChildren(...lista.map((x) => {
            if (x.festival) return filaFestival(x);
            const t = x.t, c = x.cr;
            const lugar = t ? [t.ciudad, t.pais].filter(Boolean).join(", ") + (t.valorado ? " · valorado en " + t.valorado : "") : lugarCr(c);
            const nombre = el("div", {},
                el("span", { class: "font-semibold" }, t ? t.nombre : c.nombre),
                lugar ? el("span", { class: "of-detalle" }, lugar) : null,
                el("span", { class: "of-detalle" }, t ? enlace(urlFide(t), "FIDE") : null, t && c ? " · " : null, c ? enlace(urlCr(c), "chess-results") : null),
                equipoDe(x, a));
            const td = (v, der) => el("td", { class: "px-3 py-2 align-top" + (der ? " text-right tabular-nums" : "") }, v);
            return el("tr", { class: "border-t border-brand-100 dark:border-brand-800" },
                td(fecha(x.inicio)), el("th", { scope: "row", class: "px-3 py-2 align-top font-normal" }, nombre),
                td(siFide(x)), td(cargoEscrito(x)),
                td(t ? (RITMOS[t.ritmo] || "—") + " · " + (SISTEMAS[t.sistema] || "—") : (c.control || "—")),
                td(t ? miles(t.contados) + (t.contados !== t.con_elo ? " de " + miles(t.con_elo) : "") : "—", true),
                td(t ? (t.rondas ? miles(t.rondas) : "—") : miles(c.rondas), true),
                td(miles(t ? t.jugadores : c.jugadores), true),
                td(norma(x.af)), td(norma(x.ai)));
        }));
        $("ficha-cuenta").textContent = lista.length
            ? miles(lista.length) + (estado.contar === "festival" ? (lista.length === 1 ? " torneo o festival." : " torneos o festivales.") : (lista.length === 1 ? " torneo." : " torneos.")) + " «Con Elo» cuenta a quien no faltó a más de una ronda; los torneos que no son de FIDE no tienen norma, ni los del extranjero, que salen solo de chess-results («No consta» si FIDE los valoró)."
            : "Ningún torneo cumple con estos filtros.";
    }

    /* Cuántas normas de torneo podría juntar hoy para AF o AI: sus torneos
       de FIDE de los últimos seis años, uno por grupo de fechas que se tocan
       (el mejor de cada grupo), con todas las «si», una sola «una» y una
       sola «opcion». */
    const PIDE = { af: 3, ai: 4 };
    function cuentaNormas(a, cual) {
        const hoy = window.HoraCR ? HoraCR.hoy() : "";
        const desde = hoy ? (parseInt(hoy.slice(0, 4), 10) - 6) + hoy.slice(4) : "";
        const fide = a.todos.filter((x) => x.fide);
        const viejas = fide.filter((x) => x.inicio < desde && VALE.includes(x[cual].estado)).length;
        const grupos = [];
        for (const x of fide.filter((y) => y.inicio >= desde).sort((y, z) => y.inicio.localeCompare(z.inicio))) {
            const fin = x.t.fin && x.t.fin > x.inicio ? x.t.fin : x.inicio, g = grupos[grupos.length - 1];
            if (g && x.inicio <= g.fin) { g.items.push(x); if (fin > g.fin) g.fin = fin; } else grupos.push({ fin, items: [x] });
        }
        const mejores = grupos.map((g) => g.items.reduce((m, x) => (PESO[x[cual].estado] < PESO[m[cual].estado] ? x : m)));
        const de = (e) => mejores.filter((x) => x[cual].estado === e);
        const usadas = de("si").concat(de("una").slice(0, 1), de("opcion").slice(0, 1))
            .sort((x, y) => y.inicio.localeCompare(x.inicio));
        return { usadas, sistemas: [...new Set(usadas.map((x) => x.t.sistema))], revisar: de("revisar").length,
            sobran: de("una").length - Math.min(1, de("una").length) + de("opcion").length - Math.min(1, de("opcion").length), viejas, desde };
    }

    const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const masAnios = (iso, n) => (parseInt(iso.slice(0, 4), 10) + n) + iso.slice(4);
    const hoyCr = () => (window.HoraCR ? HoraCR.hoy() : new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }));
    // «AAAA-MM» o «AAAA-MM-DD» en palabras: «junio de 2029» o «29/06/2029».
    const cuando = (iso) => iso.length === 7 ? `${MESES[parseInt(iso.slice(5), 10) - 1]} de ${iso.slice(0, 4)}` : fecha(iso);

    /* El último seminario de AF («FA») o de AI («IA») que aprobó, según los
       informes de la Comisión, y hasta cuándo vale para pedir el título
       (cuatro años, B.06.1 5.3.2). */
    function seminarioDe(a, tipo) {
        const s = ((a.fide && a.fide.seminarios) || []).filter((x) => x.tipo === tipo)
            .sort((x, y) => (y.fecha || y.mes).localeCompare(x.fecha || x.mes))[0];
        if (!s) return null;
        const vence = masAnios(s.fecha || s.mes, 4);
        return { ...s, vence, vigente: hoyCr().slice(0, vence.length) <= vence };
    }

    /* «Para pedir el título»: lo que pide B.06.1 (artículos 3, 4 y 5) para
       la solicitud de AF o de AI, punto por punto. Cada punto dice «Listo»,
       «Falta» o «Revisar» (nunca solo un color). Vacía si ya tiene el
       título o si para el AI le falta el AF. Con `propias` (las normas que
       se subieron en «Revisar normas antes de mandarlas», cada una con
       quién firma su certificado en `firmante`) revisa esas en lugar de las
       que la página elige sola. */
    function rutaTitulo(a, cual, propias) {
        const tiene = cual === "af" ? ["FA", "IA"].includes(a.titulo) : a.titulo === "IA";
        if (tiene || (cual === "ai" && a.titulo !== "FA")) return [];
        const c = propias ? { usadas: propias, sistemas: [...new Set(propias.map((x) => x.t.sistema))] } : cuentaNormas(a, cual);
        const firmaDe = propias ? (x) => x.firmante : principalDe;
        const n = c.usadas.length, pide = PIDE[cual], hoy = hoyCr();
        const ruta = [];
        const punto = (estado, texto) => ruta.push({ estado, texto });
        if (n >= pide) punto("Listo", `Normas de torneo: junta ${miles(n)} de las ${pide}.`);
        else punto("Falta", `Normas de torneo: junta ${miles(n)} de las ${pide}; le ${pide - n === 1 ? "falta 1" : "faltan " + miles(pide - n)}.`);
        if (cual === "af") {
            const sis = c.sistemas.length;
            if (n >= pide && sis < 2) punto("Falta", "Sistemas: todas sus normas son del mismo sistema y la solicitud pide al menos dos distintos.");
            else if (sis >= 2) punto("Listo", `Sistemas: ${miles(sis)} distintos.`);
        }
        const tipo = cual === "af" ? "FA" : "IA", nombre = cual === "af" ? "de AF" : "de AI";
        const sem = seminarioDe(a, tipo);
        if (sem && sem.vigente) punto("Listo", `Seminario ${nombre}: ${sem.seminario} (${cuando(sem.fecha || sem.mes)}); vale para la solicitud hasta ${sem.vence.length === 7 ? cuando(sem.vence) : "el " + fecha(sem.vence)}.`);
        else if (sem) punto("Falta", `Seminario ${nombre}: el último que consta (${sem.seminario}, ${cuando(sem.fecha || sem.mes)}) ya pasó de los cuatro años (5.3.2); hace falta otro.`);
        else punto("Falta", `Seminario ${nombre}: no consta en los informes de la Comisión desde 2023. La solicitud lleva uno de los últimos cuatro años (5.3.2).`);
        // Torneos de FIDE fuera de la solicitud (5.4.3 y 5.5.3).
        const deFide = a.todos.filter((x) => x.fide).length - n;
        if (cual === "af") {
            punto(deFide >= 1 ? "Listo" : "Revisar", deFide >= 1 ? `Tiene ${miles(deFide)} ${deFide === 1 ? "torneo" : "torneos"} de FIDE más, fuera de la solicitud (5.4.3).`
                : "Necesita un año con la licencia de Árbitro Nacional o un torneo de FIDE más que no vaya en la solicitud (5.4.3).");
        } else {
            const af = fechaAf(a).perfil || fechaAf(a).consejo, m = /Árbitro FIDE \((\d{4})\)/.exec(a.titulo_detalle || "");
            const dos = af ? masAnios(af, 2) : null;
            if (dos && dos <= hoy) punto("Listo", `Tiene el AF desde el ${fecha(af)}: más de dos años (5.5.3).`);
            else if (deFide >= 3) punto("Listo", `Tiene ${miles(deFide)} torneos de FIDE más, fuera de la solicitud (5.5.3).`);
            else if (dos) punto("Falta", `Cumple dos años con el AF el ${fecha(dos)}, o antes si junta ${miles(3 - deFide)} ${3 - deFide === 1 ? "torneo" : "torneos"} de FIDE más fuera de la solicitud (5.5.3).`);
            else punto("Revisar", `Pide dos años con el AF${m ? " (es de " + m[1] + ")" : ""} o tres torneos de FIDE más fuera de la solicitud (5.5.3).`);
        }
        // Quién firma: el certificado lo firma el árbitro principal, que no
        // puede ser el solicitante (2.8), tiene que tener título (FA o IA para
        // una norma de AF, IA para una de AI: FIDE rechazó «Chief Arbiter was
        // NA» y, para AI, «Chief Arbiter was FA») y, para AI, no todas del
        // mismo (4.13.1). Solo se ve si el principal es de Costa Rica.
        const principales = c.usadas.map((x) => ({ x, p: firmaDe(x) }));
        const propios = principales.filter((y) => y.p === a);
        if (propios.length) punto("Revisar", `Firmas: en ${propios.map((y) => "«" + y.x.t.nombre + "»").join(", ")} fue él el árbitro principal; ese certificado no lo puede firmar él (2.8): lo firma otro con título.`);
        const pide2 = cual === "af" ? ["FA", "IA"] : ["IA"];
        const sinTitulo = principales.filter((y) => y.p && y.p !== a && !pide2.includes(tituloEn(y.p, y.x.inicio)));
        if (sinTitulo.length) punto("Falta", `Firmas: ${sinTitulo.map((y) => `«${y.x.t.nombre}» la firma ${y.p.nombre}, que entonces no era ${cual === "af" ? "FA ni IA" : "IA"}`).join("; ")}: FIDE la rechaza (2.8).`);
        const ajenos = principales.filter((y) => y.p && y.p !== a);
        if (cual === "ai" && n >= 2 && ajenos.length === n && new Set(ajenos.map((y) => y.p)).size === 1)
            punto("Falta", `Firmas: todas las firma ${ajenos[0].p.nombre}, y no pueden ser todas de la misma persona (4.13.1).`);
        // Las fechas: la norma más vieja vence a los seis años (5.3.1) y la
        // solicitud va a más tardar un año después del último evento (5.3.3).
        if (n) {
            const vieja = c.usadas.reduce((m, x) => (x.inicio < m ? x.inicio : m), c.usadas[0].inicio);
            const ultimo = [...c.usadas.map((x) => (x.t.fin && x.t.fin > x.inicio ? x.t.fin : x.inicio)), sem ? (sem.fecha || sem.mes + "-28") : ""].sort().pop();
            const limite = [masAnios(vieja, 6), masAnios(ultimo, 1)].sort()[0];
            if (n >= pide) punto(limite >= hoy ? "Listo" : "Falta", limite >= hoy ? `Fecha límite para mandarla: el ${fecha(limite)} (la norma más vieja vence a los seis años y la solicitud va a más tardar un año después del último evento, 5.3).`
                : `Con estas normas ya no se puede mandar: venció el ${fecha(limite)} (5.3). Hace falta un evento más nuevo.`);
            else punto("Revisar", `La norma más vieja que junta vence el ${fecha(masAnios(vieja, 6))} (seis años, 5.3.1).`);
        }
        punto("Revisar", cual === "af" ? "Lo que no se ve desde afuera: los certificados y quién los firmó, y tener 19 años (5.4.2)."
            : "Lo que no se ve desde afuera: que no estén todas firmadas por la misma persona (4.13.1), a lo sumo dos finales nacionales, y tener 21 años (5.5.2).");
        return ruta;
    }

    // El árbitro principal de un torneo, si es de la lista (por su cargo en FIDE o en chess-results).
    function principalDe(x) {
        const y = (equipos.get(x.clave) || []).find((e) => e.x.cargos.includes("Chief") || e.x.roles.includes("ap"));
        return y ? y.a : null;
    }

    /* «Para subir de categoría»: lo que le pide el Reglamento para Árbitros
       de la Federación Costarricense de Ajedrez (inscrito en junio de 2025) a
       un AN para pasar de C a B (art. 12) o de B a A (art. 14): un año con la
       categoría, un curso intermedio de 20 horas (y para la A, uno de un
       programa de pareo de 10) y DOS NORMAS posteriores a la categoría,
       firmadas por un árbitro con licencia FIDE, en torneos de al menos 7
       rondas, válidos para Elo nacional o internacional y de modalidad o
       sistema distintos. Las normas valen tres años (art. 18). Desde afuera
       se ven solo los torneos: cuáles podrían ser esas normas (fue adjunto o
       árbitro, no el principal; el principal es de la lista y tiene licencia
       FIDE). La fecha de su categoría y los cursos no se saben: se dicen. La
       A ya puede pedir el AF por la Federación (art. 7). Además, lo que su
       categoría no le deja hacer (arts. 11 y 13): ser principal o adjunto en
       un torneo de FIDE o con más de 30 jugadores (C) o de 50 (B), desde que
       se inscribió el reglamento. Ver «Para subir de categoría» en
       docs/decisiones/juegos-y-torneos.md. */
    const REGLAMENTO_FCA = "2025-06-17", NORMA_FCA_ANIOS = 3, RONDAS_FCA = 7;
    const TOPE_JUGADORES = { C: 30, B: 50 };
    const MODALIDAD = { Standard: "clasico", Rapid: "rapido", Blitz: "blitz" };
    const MODALIDAD_ESCRITA = { clasico: "clásico", rapido: "rápido", blitz: "blitz" };
    const valeParaElo = (x) => x.fide || (!!calculoDe(x) && calculoDe(x) !== "ninguno");
    const modalidadDe = (x) => (x.t ? MODALIDAD[x.t.ritmo] : ritmoCr(x)) || "";
    const sistemaDe = (x) => (x.t ? x.t.sistema : "") || "";
    const rondasDe = (x) => Number(x.t ? x.t.rondas : x.cr.rondas) || 0;
    const jugadoresDe = (x) => Number(x.t ? x.t.jugadores : x.cr.jugadores) || 0;
    const nombreDe = (x) => (x.t || x.cr).nombre;
    // Dos normas sirven juntas si la modalidad o el sistema (los que se sepan) son distintos.
    const distintas = (p, q) => (modalidadDe(p) && modalidadDe(q) && modalidadDe(p) !== modalidadDe(q))
        || (sistemaDe(p) && sistemaDe(q) && sistemaDe(p) !== sistemaDe(q));
    const tipoEscrito = (x) => [MODALIDAD_ESCRITA[modalidadDe(x)] || "ritmo sin saber", sistemaDe(x) ? (SISTEMAS[sistemaDe(x)] || sistemaDe(x)).toLowerCase() : ""].filter(Boolean).join(", ");

    /* La categoría y los cursos que registró administración (arbitros_cr_formacion). */
    const TIPOS_FORMACION = { categoria: "Categoría", basico: "Curso básico", intermedio: "Curso intermedio", pareo: "Curso de programa de pareo", actualizacion: "Curso de actualización" };
    const formacionDe = (a) => formacion.get(a.fide_id) || [];
    const categoriaDesde = (a, cat) => (formacionDe(a).find((f) => f.tipo === "categoria" && f.categoria === cat) || {}).fecha || "";
    // Las horas de los cursos de un tipo terminados desde una fecha y aprobados
    // con 80 % o más; los que no tienen la nota anotada cuentan, pero quedan para revisar.
    function horasCursos(a, tipo, desde) {
        const l = formacionDe(a).filter((f) => f.tipo === tipo && f.fecha >= desde && (f.nota == null || Number(f.nota) >= 80));
        return { horas: l.reduce((s, f) => s + Number(f.horas || 0), 0), sinNota: l.some((f) => f.nota == null), cursos: l };
    }
    const horasEscritas = (h) => miles(Math.round(h * 10) / 10) + (h === 1 ? " hora" : " horas");

    // El último torneo en Costa Rica válido para Elo en que arbitró (principal, adjunto o árbitro).
    const ultimoValidoElo = (a) => a.todos.filter((x) => !x.fuera && valeParaElo(x) && (fue(x, "Chief", "ap") || fue(x, "Dep. Chief", "adj") || fue(x, "Arbiter", "arb")))
        .sort((u, v) => v.inicio.localeCompare(u.inicio))[0] || null;

    /* La actividad según el art. 19: queda inactivo quien pasa dos años sin un
       curso de actualización de 20 horas, y vuelve a estar activo al arbitrar un
       torneo válido para Elo o al llevar el curso. */
    const ESTADO_ACTIVIDAD = { curso: "Activo (curso)", torneo: "Activo (torneo)", inactivo: "Sin actividad" };
    function actividadFca(a) {
        const desde = masAnios(hoyCr(), -2), c = horasCursos(a, "actualizacion", desde), u = ultimoValidoElo(a);
        if (c.horas >= 20) return { estado: "curso", texto: `${horasEscritas(c.horas)} de cursos de actualización desde el ${fecha(desde)}` + (c.sinNota ? " (alguno sin la nota anotada)" : "") };
        if (u && u.inicio >= desde) return { estado: "torneo", texto: `arbitró un torneo válido para Elo el ${fecha(u.inicio)} (${nombreDe(u)})` };
        return { estado: "inactivo", texto: `ni un curso de actualización de 20 horas ni un torneo válido para Elo desde el ${fecha(desde)}` + (u ? ` (el último torneo, el ${fecha(u.inicio)})` : "") };
    }

    function subirCategoria(a) {
        const cat = a.catNacional, sigue = { C: "B", B: "A" }[cat];
        if (a.titulo !== "AN" || !sigue) return { cat, sigue, fueraDeCategoria: [] };
        const desde = masAnios(hoyCr(), -NORMA_FCA_ANIOS), desdeCat = categoriaDesde(a, cat);
        const candidatas = a.todos.filter((x) => x.inicio >= desde && (!desdeCat || x.inicio > desdeCat) && rondasDe(x) >= RONDAS_FCA && valeParaElo(x)
            && (x.cargos.some((c) => c !== "Chief") || x.roles.some((r) => r === "adj" || r === "arb")))
            .map((x) => {
                const p = principalDe(x);
                // Firma un árbitro con licencia FIDE: el principal, si es de la lista y FIDE lo tiene activo.
                const firma = p && p !== a && p.fide && !p.fide.inactivo ? p : null;
                return { x, p, firma };
            })
            .sort((u, v) => v.x.inicio.localeCompare(u.x.inicio));
        const firmes = candidatas.filter((c) => c.firma), revisar = candidatas.filter((c) => !c.firma);
        let par = null;
        for (let i = 0; i < firmes.length && !par; i++) for (let j = i + 1; j < firmes.length && !par; j++) if (distintas(firmes[i].x, firmes[j].x)) par = [firmes[i], firmes[j]];
        let estado, dicho;
        if (par) { estado = "Le alcanzaría"; dicho = `Tiene ${plural(firmes.length, "torneo que podría ser norma", "torneos que podrían ser normas")}, con dos de modalidad o sistema distintos.`; }
        else if (firmes.length >= 2) { estado = "Le falta otro tipo"; dicho = `Tiene ${plural(firmes.length, "torneo que podría ser norma", "torneos que podrían ser normas")}, pero todos ${tipoEscrito(firmes[0].x)}: las dos normas tienen que ser de modalidad o sistema distintos.`; }
        else { estado = firmes.length ? "Le falta una" : "Le faltan dos"; dicho = firmes.length ? "Tiene un torneo que podría ser norma; le falta otro de modalidad o sistema distintos." : "No tiene torneos que puedan ser norma en los últimos tres años."; }
        // Lo que su categoría no le deja hacer, desde que se inscribió el reglamento.
        const tope = TOPE_JUGADORES[cat];
        const fueraDeCategoria = a.todos.filter((x) => !x.fuera && x.inicio >= REGLAMENTO_FCA && (fue(x, "Chief", "ap") || fue(x, "Dep. Chief", "adj"))
            && (x.fide || calculoDe(x) === "internacional" || calculoDe(x) === "ambos" || jugadoresDe(x) > tope))
            .sort((u, v) => v.inicio.localeCompare(u.inicio));
        // Lo que pide además, con lo que registró administración (si no hay nada, para revisar).
        const hoy = hoyCr(), registrado = formacionDe(a).length > 0, art = sigue === "B" ? "12" : "14";
        const pide = [["Normas", `${estado}. ${dicho}`]];
        pide.push(desdeCat ? ["Revisar", `Que el principal le haya dado cada norma por escrito (art. 18). Cuentan solo los torneos posteriores al ${fecha(desdeCat)}, cuando le dieron la categoría ${cat}.`, true]
            : ["Revisar", `Que sean posteriores a la fecha en que le dieron la categoría ${cat} (no está registrada) y que el principal le haya dado la norma por escrito (art. 18).`]);
        if (!desdeCat) pide.push(["Revisar", `Tener la categoría ${cat} desde hace al menos un año (art. ${art}, a).`]);
        else if (masAnios(desdeCat, 1) <= hoy) pide.push(["Cumple", `Tiene la categoría ${cat} desde el ${fecha(desdeCat)}: más de un año (art. ${art}, a).`]);
        else pide.push(["Falta", `Tiene la categoría ${cat} desde el ${fecha(desdeCat)}: cumple el año el ${fecha(masAnios(desdeCat, 1))} (art. ${art}, a).`]);
        const curso = (tipo, horas, texto, inciso, desdeCurso) => {
            const c = horasCursos(a, tipo, desdeCurso);
            if (!registrado) return ["Revisar", texto + ` (art. ${art}, ${inciso}).`];
            if (c.horas >= horas) return [c.sinNota ? "Revisar" : "Cumple", `${texto}: ${horasEscritas(c.horas)} (${c.cursos.map((f) => (f.detalle || TIPOS_FORMACION[f.tipo]) + ", " + fecha(f.fecha)).join("; ")})` + (c.sinNota ? ", falta anotar la nota de alguno" : "") + ` (art. ${art}, ${inciso}).`];
            return ["Falta", `${texto}: ${c.horas ? "lleva " + horasEscritas(c.horas) : "no tiene ninguno registrado"} (art. ${art}, ${inciso}).`];
        };
        const haceUnAnio = masAnios(hoy, -1);
        pide.push(curso("intermedio", 20, sigue === "B" ? "Un curso de arbitraje intermedio de al menos 20 horas, aprobado con 80 % o más y de menos de un año"
            : "Un curso de arbitraje intermedio de al menos 20 horas, distinto del de la B, aprobado con 80 % o más y de menos de un año", "b",
            sigue === "A" && desdeCat > haceUnAnio ? desdeCat : haceUnAnio));
        if (sigue === "A") pide.push(curso("pareo", 10, "Uno de un programa de pareo avalado por FIDE de al menos 10 horas y de menos de un año", "e", haceUnAnio));
        // Lo marcado con true (el informe escrito de cada norma) no se puede ver: no frena el «Puede pedirla».
        const listo = pide.every(([e, , aparte]) => aparte || e === "Cumple" || (e === "Normas" && par));
        return { cat, sigue, desde, desdeCat, estado, dicho, firmes, revisar, par, tope, fueraDeCategoria, ultimoElo: ultimoValidoElo(a), pide, listo };
    }

    /* «Categoría sugerida»: la que respaldan sus torneos con las reglas del
       reglamento, para comparar con la que le da la lista de la Federación.
       - Por sus normas (arts. 12 y 14): un par de torneos que podrían ser
         norma, de modalidad o sistema distintos, respalda la B; otro par, que
         empieza al menos un año después de completar el primero, la A. Cuenta
         toda su historia en Costa Rica (no solo los tres años que dura una
         norma: se mide lo que ya hizo, no lo que puede presentar hoy).
       - Por lo que ya hace (arts. 11, 13 y 15): ser principal o adjunto en un
         torneo de FIDE, con Elo internacional o de más de 50 jugadores es
         trabajo de A; en uno solo de Elo nacional de 31 a 50, de B.
       - Nunca baja: el reglamento no quita categorías. Un AF o un AI va en la
         A (solo a la A le tramita la Federación el AF, art. 7).
       Los cursos no se ven: la sugerencia los supone y lo dice. */
    const ORDEN_CAT = { C: 0, B: 1, A: 2 };
    const mayorCat = (...l) => l.filter(Boolean).reduce((m, c) => (ORDEN_CAT[c] > ORDEN_CAT[m] ? c : m), "C");
    // El primer momento en que una lista (en orden de fecha) completa un par de tipos distintos.
    function primerPar(lista) {
        for (let j = 1; j < lista.length; j++) for (let i = 0; i < j; i++) if (distintas(lista[i].x, lista[j].x)) return { par: [lista[i], lista[j]], fecha: lista[j].x.inicio };
        return null;
    }
    function categoriaSugerida(a) {
        const fca = a.fide && a.fide.categoria_nacional ? a.fide.categoria_nacional : "";
        const actual = a.titulo === "AN" ? a.catNacional : fca;
        if (a.titulo === "FA" || a.titulo === "IA") {
            return { actual, sugerida: "A", porNormas: "", porTrabajo: "", difiere: !!actual && actual !== "A",
                porque: `Es ${TITULOS_CORTOS[a.titulo]}: va en la A, la única a la que la Federación le tramita el AF (art. 7)` + (actual && actual !== "A" ? `; la lista de la Federación todavía le da la ${actual}.` : ".") };
        }
        if (a.titulo !== "AN") return null;
        const normas = a.todos.filter((x) => !x.fuera && rondasDe(x) >= RONDAS_FCA && valeParaElo(x)
            && (x.cargos.some((c) => c !== "Chief") || x.roles.some((r) => r === "adj" || r === "arb")))
            .map((x) => { const p = principalDe(x); return { x, firma: p && p !== a && p.fide && !p.fide.inactivo ? p : null }; })
            .filter((c) => c.firma).sort((u, v) => u.x.inicio.localeCompare(v.x.inicio));
        const p1 = primerPar(normas), p2 = p1 ? primerPar(normas.filter((c) => c.x.inicio >= masAnios(p1.fecha, 1))) : null;
        const porNormas = p2 ? "A" : p1 ? "B" : "C";
        const jefe = a.todos.filter((x) => !x.fuera && (fue(x, "Chief", "ap") || fue(x, "Dep. Chief", "adj")));
        const deA = jefe.filter((x) => x.fide || calculoDe(x) === "internacional" || calculoDe(x) === "ambos" || (valeParaElo(x) && jugadoresDe(x) > 50));
        const deB = jefe.filter((x) => valeParaElo(x) && jugadoresDe(x) > 30 && jugadoresDe(x) <= 50);
        const porTrabajo = deA.length ? "A" : deB.length ? "B" : "C";
        const sugerida = mayorCat(actual, porNormas);
        const par = (p) => `${nombreDe(p.par[0].x)} (${fecha(p.par[0].x.inicio)}, ${tipoEscrito(p.par[0].x)}) y ${nombreDe(p.par[1].x)} (${fecha(p.par[1].x.inicio)}, ${tipoEscrito(p.par[1].x)})`;
        const partes = [];
        if (p1) partes.push(`Para la B: ${par(p1)}`);
        if (p2) partes.push(`para la A, un año después: ${par(p2)}`);
        if (!p1) partes.push(normas.length ? `Tiene ${plural(normas.length, "torneo que podría ser norma", "torneos que podrían ser normas")}, pero ningún par de tipos distintos` : "No tiene torneos que puedan ser norma");
        const deMas = porTrabajo === "A" ? deA : deB;
        if (ORDEN_CAT[porTrabajo] > ORDEN_CAT[sugerida]) partes.push(`ya fue principal o adjunto en ${plural(deMas.length, "torneo", "torneos")} de ${porTrabajo} (el último, ${nombreDe(deMas.slice().sort((u, v) => v.inicio.localeCompare(u.inicio))[0])}), pero eso no da la categoría: le faltan las normas`);
        if (actual && ORDEN_CAT[porNormas] < ORDEN_CAT[actual]) partes.push(`la ${actual} que tiene no la respaldan sus torneos, pero el reglamento no quita categorías`);
        if (!actual) partes.push("no figura con categoría en la lista de la Federación");
        return { actual, sugerida, porNormas, porTrabajo, p1, p2, difiere: sugerida !== actual || ORDEN_CAT[porTrabajo] > ORDEN_CAT[sugerida],
            porque: partes.join("; ") + "." };
    }
    function filasSugerida() {
        const ORDEN = (r) => (r.s.sugerida !== r.s.actual ? 0 : 1);
        return arbitros.map((a) => ({ a, s: categoriaSugerida(a) })).filter((r) => r.s && r.s.difiere)
            .sort((x, y) => ORDEN(x) - ORDEN(y) || ORDEN_CAT[y.s.sugerida] - ORDEN_CAT[x.s.sugerida] || x.a.nombre.localeCompare(y.a.nombre, "es"));
    }
    function pintarSugerida() {
        const filas = filasSugerida();
        const td = (v) => el("td", { class: "px-3 py-2 align-top" }, v);
        $("tabla-sugerida").tBodies[0].replaceChildren(...(filas.length ? filas.map(({ a, s }) => {
            const b = el("button", { type: "button", class: "font-semibold underline underline-offset-2 hover:no-underline text-left" }, a.nombre);
            b.addEventListener("click", () => elegir(a.fide_id));
            return el("tr", { class: "border-t border-brand-100 dark:border-brand-800" },
                el("th", { scope: "row", class: "px-3 py-2 align-top font-normal text-left" }, b),
                td(TITULOS_CORTOS[a.titulo] || a.titulo), td(s.actual || "—"), td(s.sugerida === s.actual ? s.sugerida + " (se queda)" : s.sugerida),
                td(s.porNormas || "—"), td(s.porTrabajo || "—"), td(s.porque));
        }) : [el("tr", {}, el("td", { colspan: "7", class: "px-3 py-2 text-brand-500 dark:text-brand-300" }, "La categoría de todos coincide con lo que respaldan sus torneos."))]));
        const suben = filas.filter((r) => r.s.sugerida !== r.s.actual).length;
        $("sugerida-cuenta").textContent = `${plural(suben, "árbitro debería", "árbitros deberían")} tener otra categoría según sus torneos; ${plural(filas.length - suben, "más arbitra", "más arbitran")} como una categoría mayor sin las normas para tenerla.`;
    }
    function excelSugerida() {
        window.TablaExcel.bajar("categoria-sugerida.xlsx", [{ nombre: "Categoría sugerida", filas: [["Árbitro", "ID FIDE", "Título", "Categoría hoy", "Sugerida", "Por sus normas",
            "Por lo que ya hace", "Por qué"]].concat(arbitros.map((a) => ({ a, s: categoriaSugerida(a) })).filter((r) => r.s)
            .sort((x, y) => x.a.nombre.localeCompare(y.a.nombre, "es"))
            .map(({ a, s }) => [a.nombre, a.fide_id, TITULOS_CORTOS[a.titulo] || a.titulo, s.actual || "", s.sugerida, s.porNormas, s.porTrabajo, s.porque])) }]);
    }

    function tarjetaCategoria(a) {
        const s = subirCategoria(a);
        const caja = el("div", { class: "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4", "data-categoria": s.cat || "" },
            el("h3", { class: "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide" }, "Para subir de categoría (reglamento de la Federación)"));
        const sug = categoriaSugerida(a);
        const lineaSug = sug ? el("p", { class: "mt-2 text-sm", "data-sugerida": sug.sugerida }, el("strong", {}, `Categoría sugerida: ${sug.sugerida}${sug.sugerida === sug.actual ? " (la que tiene)" : ""}. `), sug.porque) : null;
        if (!s.cat) {
            caja.append(...[el("p", { class: "mt-1" }, "No figura con categoría en la lista de la Federación, así que no se sabe qué le pide para subir."), lineaSug].filter(Boolean));
            return caja;
        }
        if (s.cat === "A") {
            caja.append(el("p", { class: "mt-1" }, el("strong", { class: "of-estado" }, "Ya es categoría A"), " ",
                "la más alta de las nacionales: la Federación ya puede tramitarle el título de AF ante FIDE (art. 7). Lo que le pide FIDE está en «Para pedir el título», arriba."), ...(lineaSug ? [lineaSug] : []));
            return caja;
        }
        const linea = (c) => el("li", { class: "of-detalle" }, botonNorma(a, s, c), " ", `${fecha(c.x.inicio)} · ${nombreDe(c.x)} (${tipoEscrito(c.x)}, ${miles(rondasDe(c.x))} rondas) · ${cargoEscrito(c.x)}`
            + (c.firma ? ` · firmaría ${c.firma.nombre} (${tituloCorto(c.firma)})` : c.p === a ? " · el principal era él" : c.p ? ` · principal: ${c.p.nombre}, sin licencia FIDE activa` : " · no se sabe quién fue el principal")
            + ` · cuenta hasta el ${fecha(masAnios(c.x.inicio, NORMA_FCA_ANIOS))}`);
        caja.append(...[
            el("p", { class: "mt-1" }, el("strong", { class: "of-estado" }, `De ${s.cat} a ${s.sigue}: ${s.listo ? "Puede pedirla" : s.estado}`)),
            lineaSug,
            el("ul", { class: "mt-1 space-y-1 text-sm" }, ...s.pide.map(([e, t]) => el("li", { "data-estado": e }, el("strong", {}, e + ": "), t))),
            s.firmes.length ? el("div", { class: "mt-2" }, el("h4", { class: "text-sm font-semibold" }, "Torneos que podrían ser norma"),
                el("ul", { class: "mt-1 space-y-0.5", "data-subir": "firmes" }, ...s.firmes.map(linea))) : null,
            s.revisar.length ? el("details", { class: "of-detalle mt-2" }, el("summary", { class: "cursor-pointer underline underline-offset-2" }, `Para revisar: no se sabe si el principal tenía licencia FIDE (${miles(s.revisar.length)})`),
                el("ul", { class: "mt-1 space-y-0.5", "data-subir": "revisar" }, ...s.revisar.map(linea))) : null,
            s.fueraDeCategoria.length ? el("div", { class: "mt-2" }, el("h4", { class: "text-sm font-semibold" }, "Más de lo que deja su categoría"),
                el("p", { class: "of-detalle" }, `Una categoría ${s.cat} solo puede ser principal o adjunta en torneos válidos solo para Elo nacional y de hasta ${s.tope} jugadores (art. ${s.cat === "C" ? "11" : "13"}). Desde junio de 2025 fue principal o adjunto en:`),
                el("ul", { class: "mt-1 space-y-0.5", "data-subir": "fuera" }, ...s.fueraDeCategoria.map((x) => el("li", { class: "of-detalle" },
                    `${fecha(x.inicio)} · ${nombreDe(x)} · ${cargoEscrito(x)} · ${x.fide ? "de FIDE" : calculoDe(x) === "nacional" ? "solo Elo nacional" : "Elo internacional"}, ${miles(jugadoresDe(x))} jugadores`)))) : null,
            el("p", { class: "of-detalle mt-2" }, (s.ultimoElo ? `Su último torneo válido para Elo como árbitro: ${fecha(s.ultimoElo.inicio)}. ` : "")
                + "Cuentan los torneos de los últimos tres años (lo que dura una norma) de 7 rondas o más, válidos para Elo nacional o internacional, en que fue adjunto o árbitro; firma el principal si es de la lista y FIDE lo tiene activo. La modalidad es el ritmo (clásico, rápido o blitz) y el sistema, el de la ficha de FIDE (los de chess-results no lo dicen).")].filter(Boolean));
        return caja;
    }

    /* La norma para firmar (art. 18), en PDF y con los datos del torneo ya
       puestos. El Apéndice A del reglamento, que debía traer el formato, está
       en blanco: este es uno propuesto con lo que dice el art. 18 (el
       principal confirma que el aspirante intervino y lo hizo bien) y lo que
       piden los arts. 12 y 14 del torneo. */
    function botonNorma(a, s, c) {
        const b = el("button", { type: "button", class: "text-xs font-semibold px-2 py-0.5 rounded bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700", "data-norma-fca": c.x.clave },
            "Norma (PDF)");
        b.setAttribute("aria-label", "Bajar la norma para firmar de " + nombreDe(c.x));
        b.addEventListener("click", () => bajarPdf(normaFca(a, s, c), `norma-${a.fide_id}-${c.x.clave}.pdf`));
        return b;
    }
    function normaFca(a, s, c) {
        const x = c.x, t = x.t, cr = x.cr, fin = (t ? t.fin : cr && cr.fin) || x.inicio;
        const lugar = t ? [t.ciudad, t.pais].filter(Boolean).join(", ") : (cr && cr.lugar) || "Costa Rica";
        const elo = x.fide ? "Internacional (FIDE)" + (calculoDe(x) === "ambos" || calculoDe(x) === "nacional" ? " y nacional" : "") : { nacional: "Nacional", internacional: "Internacional", ambos: "Nacional e internacional" }[calculoDe(x)] || "—";
        const p = c.firma || c.p;
        const fila = (k, v) => [k, v || "________________________"];
        return {
            titulo: "Informe escrito favorable («norma»)",
            subtitulo: `Federación Costarricense de Ajedrez · Reglamento para Árbitros, art. 18 · para pasar de la categoría ${s.cat} a la ${s.sigue}`,
            pie: "Árbitros de Costa Rica · Ajedrez Integral", autor: "Ajedrez Integral", fotos: [],
            bloques: [
                { tipo: "titulo", texto: "El aspirante" },
                { tipo: "tabla", encabezados: ["Dato", "Detalle"], anchos: [35, 65], filas: [fila("Nombre", a.nombre), fila("ID FIDE", String(a.fide_id)),
                    fila("Categoría que tiene", "Árbitro Nacional " + s.cat + (s.desdeCat ? ", desde el " + fecha(s.desdeCat) : "")), fila("Categoría a la que aspira", "Árbitro Nacional " + s.sigue),
                    fila("Cargo en el torneo", cargoEscrito(x))] },
                { tipo: "titulo", texto: "El torneo" },
                { tipo: "tabla", encabezados: ["Dato", "Detalle"], anchos: [35, 65], filas: [fila("Nombre", nombreDe(x)), fila("Fechas", `${fecha(x.inicio)} al ${fecha(fin)}`), fila("Lugar", lugar),
                    fila("Modalidad (ritmo)", MODALIDAD_ESCRITA[modalidadDe(x)] || ""), fila("Sistema", sistemaDe(x) ? SISTEMAS[sistemaDe(x)] : ""), fila("Rondas", miles(rondasDe(x))),
                    fila("Jugadores", miles(jugadoresDe(x))), fila("Válido para Elo", elo), fila("Enlace", t ? urlFide(t) : cr ? urlCr(cr) : "")] },
                { tipo: "titulo", texto: "Lo que confirma el árbitro principal" },
                { tipo: "parrafo", texto: `Yo, el árbitro principal del torneo, confirmo que ${a.nombre} intervino en él como ${cargoEscrito(x).toLowerCase()} y que su desempeño fue satisfactorio.` },
                { tipo: "parrafo", texto: "Desempeño satisfactorio:   Sí ____   No ____" },
                { tipo: "parrafo", texto: "Observaciones: ______________________________________________________________" },
                { tipo: "parrafo", texto: "_____________________________________________________________________________" },
                { tipo: "titulo", texto: "El árbitro principal" },
                { tipo: "tabla", encabezados: ["Dato", "Detalle"], anchos: [35, 65], filas: [fila("Nombre", p ? p.nombre : ""), fila("ID FIDE", p ? String(p.fide_id) : ""),
                    fila("Título y licencia FIDE", p ? tituloLargo(p) || "" : ""), fila("Firma", ""), fila("Fecha", "")] },
                { tipo: "separador" },
                { tipo: "nota", texto: `Para que cuente (arts. 12, d, y 14, d): un torneo de al menos 7 rondas, válido para Elo nacional o internacional, posterior a la categoría ${s.cat}, firmado por un árbitro con licencia FIDE. Hacen falta dos, de modalidades o sistemas distintos, y cada una vale tres años (art. 18): esta, hasta el ${fecha(masAnios(x.inicio, NORMA_FCA_ANIOS))}. El Apéndice A del reglamento, que debía traer el formato, está en blanco: este es uno propuesto con lo que piden esos artículos.` },
            ],
        };
    }

    /* «Categoría y cursos en la Federación» de la ficha: lo registrado y, para
       quien administra, el formulario para registrar o quitar. */
    function pintarFormacion(a) {
        const act = actividadFca(a);
        $("ficha-actividad-fca").textContent = `Actividad según el art. 19 del reglamento: ${ESTADO_ACTIVIDAD[act.estado]}, ${act.texto}.`;
        const filas = formacionDe(a).slice().sort((x, y) => y.fecha.localeCompare(x.fecha));
        const td = (v, der) => el("td", { class: "px-3 py-2 align-top" + (der ? " text-right tabular-nums" : "") }, v);
        $("tabla-formacion").tBodies[0].replaceChildren(...(filas.length ? filas.map((f) => {
            let quitar = null;
            if (soyAdmin) {
                quitar = el("button", { type: "button", class: "text-xs font-semibold underline underline-offset-2 hover:no-underline" }, "Quitar");
                quitar.addEventListener("click", () => quitarFormacion(a, f));
            }
            return el("tr", { class: "border-t border-brand-100 dark:border-brand-800", "data-tipo": f.tipo },
                td(fecha(f.fecha)), td(f.tipo === "categoria" ? "Categoría " + f.categoria : TIPOS_FORMACION[f.tipo]),
                td(f.horas != null ? miles(Number(f.horas)) : "—", true), td(f.nota != null ? miles(Number(f.nota)) + " %" : "—", true), td(f.detalle || "—"), td(quitar));
        }) : [el("tr", {}, el("td", { colspan: "6", class: "px-3 py-2 text-brand-500 dark:text-brand-300" }, "No hay nada registrado. La categoría y los cursos los registra administración: con ellos, «Para subir de categoría» deja de pedir revisarlos."))]));
        $("formacion-form").classList.toggle("hidden", !soyAdmin);
    }
    async function recargarFormacion(a) {
        const { data, error } = await sb.from("arbitros_cr_formacion").select("id,fide_id,tipo,categoria,fecha,horas,nota,detalle").eq("fide_id", a.fide_id).order("fecha").range(0, 999);
        if (error) throw error;
        formacion.set(a.fide_id, data);
    }
    function ajustarFormularioFormacion() {
        const cat = $("formacion-tipo").value === "categoria";
        $("formacion-categoria-caja").classList.toggle("hidden", !cat);
        $("formacion-horas-caja").classList.toggle("hidden", cat);
        $("formacion-nota-caja").classList.toggle("hidden", cat);
        $("formacion-horas").required = !cat;
    }
    async function guardarFormacion(e) {
        e.preventDefault();
        const a = arbitros.find((x) => x.fide_id === estado.elegido);
        if (!a || !soyAdmin) return;
        const tipo = $("formacion-tipo").value, cat = tipo === "categoria", num = (id) => ($(id).value === "" ? null : Number($(id).value));
        const fila = { fide_id: a.fide_id, tipo, categoria: cat ? $("formacion-categoria").value : null, fecha: $("formacion-fecha").value,
            horas: cat ? null : num("formacion-horas"), nota: cat ? null : num("formacion-nota"), detalle: $("formacion-detalle").value.trim().slice(0, 200) };
        if (!fila.fecha) { $("formacion-estado").textContent = "Falta la fecha."; return; }
        if (!cat && !fila.horas) { $("formacion-estado").textContent = "Faltan las horas del curso."; return; }
        $("formacion-guardar").disabled = true;
        try {
            const { error } = await sb.from("arbitros_cr_formacion").insert(fila);
            if (error) throw error;
            await recargarFormacion(a);
            $("formacion-form").reset(); ajustarFormularioFormacion();
            pintarFicha();
            $("formacion-estado").textContent = "Listo: quedó registrado.";
        } catch (err) {
            $("formacion-estado").textContent = /duplicate|unique/i.test(err.message || "") ? "Esa categoría ya está registrada: quita la que está para cambiarle la fecha."
                : "No se pudo registrar: " + (err.message || err);
        } finally { $("formacion-guardar").disabled = false; }
    }
    async function quitarFormacion(a, f) {
        const que = f.tipo === "categoria" ? "la categoría " + f.categoria : (TIPOS_FORMACION[f.tipo] || "").toLowerCase();
        const si = await Avisos.confirmar(`¿Quitar ${que} del ${fecha(f.fecha)}?`, { aceptar: "Quitarlo", cancelar: "Dejarlo", peligro: true });
        if (!si) return;
        try {
            const { error } = await sb.from("arbitros_cr_formacion").delete().eq("id", f.id);
            if (error) throw error;
            await recargarFormacion(a);
            pintarFicha();
            $("formacion-estado").textContent = "Listo: quedó quitado.";
        } catch (err) { $("formacion-estado").textContent = "No se pudo quitar: " + (err.message || err); }
    }

    /* El informe cuatrimestral para la Junta Directiva (art. 3): de enero a
       abril (se entrega el 15 de mayo), de mayo a agosto (15 de setiembre) y
       de setiembre a diciembre (15 de enero). */
    const CUATRIMESTRES = [{ desde: "01-01", hasta: "04-30", nombre: "enero a abril", entrega: (y) => `15/05/${y}` },
        { desde: "05-01", hasta: "08-31", nombre: "mayo a agosto", entrega: (y) => `15/09/${y}` },
        { desde: "09-01", hasta: "12-31", nombre: "setiembre a diciembre", entrega: (y) => `15/01/${y + 1}` }];
    function cuatrimestres() {
        const hoy = hoyCr(), lista = [];
        for (let y = 2025; y <= parseInt(hoy.slice(0, 4), 10); y++) {
            CUATRIMESTRES.forEach((c, i) => {
                const desde = `${y}-${c.desde}`, hasta = `${y}-${c.hasta}`;
                if (desde <= hoy) lista.push({ valor: `${y}-${i}`, desde, hasta, texto: `De ${c.nombre} de ${y}` + (hasta >= hoy ? " (en curso)" : ""), entrega: c.entrega(y), enCurso: hasta >= hoy });
            });
        }
        return lista.reverse();
    }
    function informeJunta(c) {
        const enRango = (x) => !x.fuera && x.inicio >= c.desde && x.inicio <= c.hasta;
        const ELO = { nacional: "Elo nacional", internacional: "Elo internacional", ambos: "Nacional e internacional", ninguno: "Sin Elo" };
        // Cada torneo una vez, con la gente de la lista que lo arbitró.
        const torneosC = new Map(), porArb = [];
        for (const a of arbitros) {
            const l = a.todos.filter((x) => enRango(x) && (fue(x, "Chief", "ap") || fue(x, "Dep. Chief", "adj") || fue(x, "Arbiter", "arb")));
            if (l.length) porArb.push({ a, n: l.length, principal: l.filter((x) => fue(x, "Chief", "ap")).length });
            for (const x of a.todos.filter(enRango)) if (!torneosC.has(x.clave)) torneosC.set(x.clave, x);
        }
        const lista = [...torneosC.values()].sort((x, y) => x.inicio.localeCompare(y.inicio) || nombreDe(x).localeCompare(nombreDe(y), "es"));
        const nFide = lista.filter((x) => x.fide).length, nNac = lista.filter(soloNacional).length;
        porArb.sort((x, y) => y.n - x.n || x.a.nombre.localeCompare(y.a.nombre, "es"));
        const enLaLista = arbitros.concat(sinArbitrar).filter(enListaFca).map((a) => ({ a, act: actividadFca(a) }));
        const cuenta = (e) => enLaLista.filter((r) => r.act.estado === e);
        const subir = filasSubir(), sugeridas = filasSugerida().filter((r) => r.s.sugerida !== r.s.actual);
        const fuera = arbitros.flatMap((a) => subirCategoria(a).fueraDeCategoria.filter((x) => x.inicio >= c.desde && x.inicio <= c.hasta).map((x) => ({ a, x })));
        const { quietos, fuera: sinLista } = listaFca();
        const vence = arbitros.flatMap(porVencer).sort((x, y) => x.vence.localeCompare(y.vence));
        const b = [
            { tipo: "titulo", texto: "Los torneos del cuatrimestre" },
            { tipo: "parrafo", texto: lista.length ? `${plural(lista.length, "torneo", "torneos")} en Costa Rica con algún árbitro de la lista: ${miles(nFide)} de FIDE y ${miles(lista.length - nFide)} solo en chess-results (${miles(nNac)} con solo Elo nacional, clásicos).` : "Ningún torneo en Costa Rica con árbitros de la lista en este cuatrimestre." },
        ];
        if (lista.length) b.push({ tipo: "tabla", encabezados: ["Empezó", "Torneo", "Elo", "Rondas", "Árbitro principal"], anchos: [12, 40, 16, 10, 22],
            filas: lista.map((x) => { const p = principalDe(x); return [fecha(x.inicio), nombreDe(x), x.fide ? "FIDE" : ELO[calculoDe(x)] || "Sin dato", miles(rondasDe(x)), p ? p.nombre : "No consta"]; }) });
        b.push({ tipo: "titulo", texto: "Quién arbitró" },
            porArb.length ? { tipo: "tabla", encabezados: ["Árbitro", "Título", "Torneos", "De principal"], anchos: [50, 16, 17, 17],
                filas: porArb.map((r) => [r.a.nombre, tituloCorto(r.a) || "—", miles(r.n), miles(r.principal)]) } : { tipo: "parrafo", texto: "Nadie de la lista." },
            { tipo: "titulo", texto: "La actividad de los árbitros (art. 19)" },
            { tipo: "parrafo", texto: `De los ${miles(enLaLista.length)} de la lista de la Federación, hoy: ${plural(cuenta("curso").length, "activo", "activos")} por un curso de actualización, ${plural(cuenta("torneo").length, "activo", "activos")} por haber arbitrado un torneo válido para Elo y ${miles(cuenta("inactivo").length)} sin actividad en dos años.` });
        if (cuenta("inactivo").length) b.push({ tipo: "lista", items: cuenta("inactivo").map((r) => `${r.a.nombre} (${tituloCorto(r.a) || "—"}): ${r.act.texto}`) });
        b.push({ tipo: "titulo", texto: "Quiénes pueden subir de categoría" },
            subir.length ? { tipo: "tabla", encabezados: ["Árbitro", "Pasa", "Normas", "Posibles", "A revisar"], anchos: [38, 10, 24, 14, 14],
                filas: subir.map(({ a, s }) => [a.nombre, `${s.cat} a ${s.sigue}`, estadoSubir(s), miles(s.firmes.length), miles(s.revisar.length)]) } : { tipo: "parrafo", texto: "Ningún AN de categoría C o B tiene torneos que puedan ser norma." },
            { tipo: "titulo", texto: "Categoría sugerida" },
            sugeridas.length ? { tipo: "tabla", encabezados: ["Árbitro", "Hoy", "Sugerida", "Por qué"], anchos: [26, 8, 10, 56],
                filas: sugeridas.map(({ a, s }) => [a.nombre, s.actual || "—", s.sugerida, s.porque]) } : { tipo: "parrafo", texto: "La categoría de todos coincide con lo que respaldan sus torneos." },
            { tipo: "titulo", texto: "Más de lo que deja su categoría (arts. 11 y 13)" },
            fuera.length ? { tipo: "lista", items: fuera.map(({ a, x }) => `${a.nombre} (${tituloCorto(a)}): ${cargoEscrito(x)} en ${nombreDe(x)} (${fecha(x.inicio)}), ${x.fide ? "de FIDE" : calculoDe(x) === "nacional" ? "solo Elo nacional" : "Elo internacional"}, ${miles(jugadoresDe(x))} jugadores.`) }
                : { tipo: "parrafo", texto: "Nadie, en este cuatrimestre." },
            { tipo: "titulo", texto: "La lista de la Federación contra quién arbitra" },
            { tipo: "parrafo", texto: FCA ? `Lista leída el ${fecha(FCA)}. ${plural(quietos.length, "árbitro de la lista no arbitró", "árbitros de la lista no arbitraron")} en Costa Rica en los últimos ${ANIOS_SIN} años; ${plural(sinLista.length, "arbitró", "arbitraron")} ${SEGUIDO} o más torneos en dos años sin estar en ella.` : "Todavía no se leyó la lista de la Federación." });
        if (sinLista.length) b.push({ tipo: "lista", items: sinLista.map(({ a, l }) => `${a.nombre} (${tituloCorto(a) || "sin título"}): ${plural(l.length, "torneo", "torneos")}, el último el ${fecha(l[0].inicio)}.`) });
        b.push({ tipo: "titulo", texto: "Lo que vence en los próximos 12 meses" },
            vence.length ? { tipo: "lista", items: vence.map((r) => `${r.a.nombre}: ${r.texto}, vence ${r.dice}.`) } : { tipo: "parrafo", texto: "Nada." },
            { tipo: "separador" },
            { tipo: "nota", texto: "Armado con los torneos de FIDE (ratings.fide.com) y de chess-results, la lista de árbitros de FIDE y la de la Federación, y el Reglamento para Árbitros de la Federación Costarricense de Ajedrez (2025). Que alguien no figure como árbitro en chess-results no prueba que no haya arbitrado: el organizador puede no haberlo anotado. Los cursos y las fechas de categoría son los que registró administración." });
        return {
            titulo: "Informe de la Comisión Técnica de Arbitraje",
            subtitulo: [`Cuatrimestre ${c.texto.replace(/^De /, "de ").replace(" (en curso)", "")}`, `Se entrega a la Junta Directiva a más tardar el ${c.entrega} (art. 3)`, "al " + window.HoraCR.fecha(new Date())].join(" · "),
            pie: "Árbitros de Costa Rica · Ajedrez Integral", autor: "Ajedrez Integral", fotos: [], bloques: b,
        };
    }

    // El título que tenía alguien en una fecha: con las fechas que se sepan
    // (el perfil, el Consejo o el año del perfil); si no se sabe, el de hoy.
    function tituloEn(p, dia) {
        const anio = (re) => { const m = re.exec(p.titulo_detalle || ""); return m ? m[1] + "-12-31" : ""; };
        const iaDia = (p.fide && (p.fide.ia_perfil || p.fide.ia_fecha)) || anio(/Árbitro Internacional \((\d{4})\)/);
        const afDia = fechaAf(p).perfil || fechaAf(p).consejo || anio(/Árbitro FIDE \((\d{4})\)/);
        if (p.titulo === "IA" && (!iaDia || iaDia <= dia)) return "IA";
        if (["FA", "IA"].includes(p.titulo) && (!afDia || afDia <= dia)) return "FA";
        return p.titulo === "AN" ? "AN" : "";
    }

    // Lo que dice el cuadro de una norma: lo usan la pantalla y el PDF.
    function textoNorma(a, cual) {
        const titulo = cual === "af" ? "Árbitro FIDE (AF)" : "Árbitro Internacional (AI)";
        const tiene = cual === "af" ? ["FA", "IA"].includes(a.titulo) : a.titulo === "IA";
        const c = cuentaNormas(a, cual), n = c.usadas.length, pide = PIDE[cual];
        const sistemas = c.sistemas.map((s) => (SISTEMAS[s] || s).toLowerCase());
        let estado, dicho;
        if (tiene) {
            estado = "Ya tiene el título"; dicho = "Según su perfil de FIDE. Igual se ven abajo los torneos que hoy le darían norma.";
        } else if (cual === "ai" && a.titulo !== "FA") {
            estado = "Primero el AF"; dicho = "El AI se pide después del título de AF, y una norma de AI cuenta solo si el torneo es posterior al AF: hoy no junta ninguna.";
        } else if (n >= pide && (cual === "ai" || sistemas.length >= 2)) {
            estado = "Le alcanzaría"; dicho = `Junta ${miles(n)} normas de las ${pide} que pide la solicitud` + (cual === "af" ? `, de ${sistemas.length} sistemas (${sistemas.join(", ")}).` : ".");
        } else if (n >= pide) {
            estado = "Le falta otro sistema"; dicho = `Junta ${miles(n)} normas, pero todas de ${sistemas.join(", ")}: la solicitud pide al menos dos sistemas distintos.`;
        } else {
            estado = `Le faltan ${miles(pide - n)}`; dicho = `Junta ${miles(n)} de las ${pide} normas que pide la solicitud` + (sistemas.length ? ` (${sistemas.join(", ")}).` : ".");
        }
        const extra = [];
        if (c.revisar) extra.push(`${miles(c.revisar)} ${c.revisar === 1 ? "torneo queda" : "torneos quedan"} para revisar y no se cuentan.`);
        if (c.sobran) extra.push(`${miles(c.sobran)} más de los que valen una sola vez por solicitud.`);
        if (c.viejas) extra.push(`${miles(c.viejas)} ${c.viejas === 1 ? "torneo que valía es" : "torneos que valían son"} de antes de los últimos seis años.`);
        if (cual === "ai" && !tiene) {
            const m = /Árbitro FIDE \((\d{4})\)/.exec(a.titulo_detalle || "");
            const fa = fechaAf(a);
            if (fa.perfil) extra.push(`Solo cuentan los torneos que empezaron después del ${fecha(fa.perfil)}, la fecha de su AF en el perfil de FIDE.`);
            else if (fa.consejo) extra.push(`Solo cuentan los torneos que empezaron después de su AF: el Consejo lo aprobó el ${fecha(fa.consejo)}, y lo de los ${VENTANA} días siguientes queda para revisar hasta tener la fecha de su perfil de FIDE.`);
            else if (m) extra.push(`Solo cuentan los torneos posteriores a su AF (${m[1]}); los del mismo año quedan para revisar.`);
            else if (a.titulo === "FA") extra.push("Solo cuentan los torneos posteriores a su AF; su perfil no dice de qué año es: revisar.");
        }
        // Hasta cuándo cuenta cada una: seis años desde que empezó el torneo.
        const hoy = window.HoraCR ? HoraCR.hoy() : "";
        const enUnAnio = hoy ? (parseInt(hoy.slice(0, 4), 10) + 1) + hoy.slice(4) : "";
        const hasta = (x) => (parseInt(x.inicio.slice(0, 4), 10) + 6) + x.inicio.slice(4);
        const vencen = c.usadas.filter((x) => hasta(x) <= enUnAnio);
        if (vencen.length && !tiene) extra.unshift(`${miles(vencen.length)} ${vencen.length === 1 ? "deja" : "dejan"} de contar en menos de un año.`);
        return { titulo: "Norma de " + titulo, estado, dicho, torneos: c.usadas.map((x) => `${fecha(x.inicio)} · ${x.t.nombre} (${ESTADOS[x[cual].estado]}) · cuenta hasta el ${fecha(hasta(x))}`
            + (hasta(x) <= enUnAnio ? " (vence pronto)" : "")),
            nota: `Cuenta desde el ${fecha(c.desde)}, una por festival o fechas que se tocan. ` + extra.join(" "), ruta: rutaTitulo(a, cual) };
    }

    function tarjetaNorma(a, cual) {
        const n = textoNorma(a, cual);
        return el("div", { class: "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4", "data-norma": cual },
            el("h3", { class: "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide" }, n.titulo),
            el("p", { class: "mt-1" }, el("strong", { class: "of-estado" }, n.estado), " ", el("span", {}, n.dicho)),
            n.torneos.length ? el("ul", { class: "mt-2 space-y-0.5" }, ...n.torneos.map((t) => el("li", { class: "of-detalle" }, t))) : null,
            n.ruta.length ? el("div", { class: "mt-3", "data-ruta": cual },
                el("h4", { class: "text-sm font-semibold" }, "Para pedir el título"),
                el("ul", { class: "mt-1 space-y-1 text-sm" }, ...n.ruta.map((r) => el("li", { "data-estado": r.estado }, el("strong", {}, r.estado + ": "), r.texto))),
                el("div", { class: "flex flex-wrap gap-2" }, botonSolicitud(a, cual), botonInforme(a, cual))) : null,
            el("p", { class: "of-detalle mt-2" }, n.nota));
    }

    /* Los torneos de la solicitud en el orden de las columnas del formulario
       de FIDE (los del informe de la Comisión): Start-Close, City, Fed,
       Tournament, TS, Rtd, Total, Rds, Feds, FRL. */
    const TS = { s: "SS", r: "RR", d: "DRR", t: "TM", k: "KO" };
    const dm = (iso) => iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) : "";
    function botonSolicitud(a, cual) {
        const c = cuentaNormas(a, cual);
        if (!c.usadas.length) return null;
        const b = el("button", { type: "button", class: "mt-2 text-sm font-semibold px-3 py-1.5 rounded-lg bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700" },
            "Descargar los torneos para la solicitud");
        b.addEventListener("click", () => {
            const sem = seminarioDe(a, cual === "af" ? "FA" : "IA");
            const filas = [["Start-Close", "City", "Fed", "Tournament", "TS", "Rtd", "Total", "Rds", "Feds", "FRL", "Norma", "En FIDE"]]
                .concat(c.usadas.slice().sort((x, y) => y.inicio.localeCompare(x.inicio)).map((x) => {
                    const t = x.t, fin = t.fin && t.fin > x.inicio ? t.fin : x.inicio;
                    return [`${dm(x.inicio)}-${dm(fin)}.${fin.slice(2, 4)}`, t.ciudad, t.pais === "Costa Rica" ? "CRC" : t.pais, t.nombre, TS[t.sistema] || t.sistema,
                        t.con_elo, t.jugadores, t.rondas || "", t.federaciones, t.valorado, ESTADOS[x[cual].estado], urlFide(t)];
                }));
            if (sem) filas.push([sem.fecha ? fecha(sem.fecha) : cuando(sem.mes), "", "", sem.seminario, "", "", "", "", "", "", "Seminario", ""]);
            window.TablaExcel.bajar(`solicitud-${cual}-${a.fide_id}.xlsx`, [{ nombre: "Solicitud " + (cual === "af" ? "AF" : "AI"), filas }]);
        });
        return b;
    }

    /* El informe para la comisión, en PDF: lo que pide FIDE punto por punto,
       las normas con quién firma cada una y hasta cuándo cuenta, y los
       riesgos de esta solicitud según lo que FIDE rechaza en sus informes
       (ver «Por qué rechaza FIDE» en la página). Lo usa quien va a armar la
       solicitud antes de mandarla. */
    function botonInforme(a, cual) {
        const b = el("button", { type: "button", class: "mt-2 text-sm font-semibold px-3 py-1.5 rounded-lg bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700" },
            "Informe para la comisión (PDF)");
        b.addEventListener("click", () => bajarPdf(informeSolicitud(a, cual), `informe-${cual}-${a.fide_id}.pdf`));
        return b;
    }

    function riesgosSolicitud(a, cual, c) {
        const riesgos = [];
        const finDe = (x) => (x.t.fin && x.t.fin > x.inicio ? x.t.fin : x.inicio);
        // Fechas que se tocan (2.10): de cada grupo solo se cuenta el mejor.
        for (const x of c.usadas) {
            const otros = a.todos.filter((y) => y.fide && y !== x && y.inicio <= finDe(x) && finDe(y) >= x.inicio);
            if (otros.length) riesgos.push(`«${x.t.nombre}» se jugó en fechas que se tocan con ${otros.map((y) => "«" + y.t.nombre + "»").join(", ")}: en la solicitud va uno solo (2.10). Se contó el mejor.`);
        }
        for (const x of c.usadas.filter((y) => y[cual].estado === "una" || y[cual].estado === "opcion"))
            riesgos.push(`«${x.t.nombre}» vale una sola vez por solicitud (4.9.1): no se puede sumar otro del mismo tipo.`);
        if (cual === "ai") {
            const fa = fechaAf(a), af = fa.perfil || fa.consejo;
            for (const x of c.usadas.filter((y) => af && masDias(af, VENTANA) >= y.inicio)) {
                riesgos.push(`«${x.t.nombre}» empezó el ${fecha(x.inicio)}, cerca de su AF (${fa.perfil ? "el " + fecha(fa.perfil) + " en su perfil de FIDE" : "aprobado por el Consejo el " + fecha(fa.consejo)}). `
                    + "FIDE cuenta desde la fecha del título, no desde el pago de la licencia: conviene adjuntar la captura del perfil y tener una norma de reserva.");
            }
        }
        const hoy = hoyCr(), enUnAnio = masAnios(hoy, 1);
        for (const x of c.usadas.filter((y) => masAnios(y.inicio, 6) <= enUnAnio))
            riesgos.push(`«${x.t.nombre}» deja de contar el ${fecha(masAnios(x.inicio, 6))} (seis años, 5.3.1): la solicitud tiene que llegar antes.`);
        if (c.revisar) riesgos.push(`${miles(c.revisar)} ${c.revisar === 1 ? "torneo queda" : "torneos quedan"} para revisar y no se ${c.revisar === 1 ? "contó" : "contaron"}: si alguno vale, mejor confirmarlo con su informe antes de usarlo.`);
        return riesgos;
    }

    function informeSolicitud(a, cual) {
        const n = textoNorma(a, cual), c = cuentaNormas(a, cual);
        const titulo = cual === "af" ? "Árbitro FIDE (AF)" : "Árbitro Internacional (AI)";
        const finDe = (x) => (x.t.fin && x.t.fin > x.inicio ? x.t.fin : x.inicio);
        const firma = (x) => {
            const p = principalDe(x);
            if (!p) return "No consta";
            if (p === a) return "Él mismo: firma otro (2.8)";
            return `${p.nombre} (${TITULOS_CORTOS[tituloEn(p, x.inicio)] || "sin título"})`;
        };
        const riesgos = riesgosSolicitud(a, cual, c);
        const bloques = [
            { tipo: "titulo", texto: "En resumen" },
            { tipo: "parrafo", texto: `${n.estado}. ${n.dicho}` },
            { tipo: "nota", texto: n.nota },
            { tipo: "titulo", texto: "Lo que pide FIDE, punto por punto" },
            { tipo: "lista", items: n.ruta.map((r) => `${r.estado}: ${r.texto}`) },
            { tipo: "titulo", texto: `Las normas que junta (${miles(c.usadas.length)} de ${PIDE[cual]})` },
        ];
        if (c.usadas.length) {
            bloques.push({ tipo: "tabla", encabezados: ["Empezó", "Torneo", "Firma el certificado", "Cuenta hasta"], anchos: [13, 40, 32, 15],
                filas: c.usadas.map((x) => [fecha(x.inicio), x.t.nombre, firma(x), fecha(masAnios(x.inicio, 6))]) },
                { tipo: "nota", texto: "Firma el certificado el árbitro principal del torneo, con el título que tenía entonces. «No consta» quiere decir que el principal no es de la lista de árbitros de Costa Rica: hay que ver el certificado." },
                { tipo: "subtitulo", texto: "Por qué cuenta cada una" },
                { tipo: "lista", items: c.usadas.map((x) => `${x.t.nombre} (${fecha(x.inicio)} al ${fecha(finDe(x))}, ${[x.t.ciudad, x.t.pais].filter(Boolean).join(", ")}): `
                    + `${x[cual].detalle}. ${miles(x.t.con_elo)} jugadores con Elo de ${miles(x.t.federaciones)} ${x.t.federaciones === 1 ? "federación" : "federaciones"}, ${miles(x.t.rondas)} rondas. ${urlFide(x.t)}`) });
        } else bloques.push({ tipo: "parrafo", texto: "Todavía no junta ninguna." });
        bloques.push({ tipo: "titulo", texto: "Riesgos de esta solicitud" },
            riesgos.length ? { tipo: "lista", items: riesgos } : { tipo: "parrafo", texto: "Con lo que se ve desde afuera, ninguno en particular." },
            { tipo: "nota", texto: "Por qué rechaza FIDE, en los 343 rechazos de 2023 a 2026 de los informes de la Comisión de Árbitros: un torneo sin el nivel (jugadores con Elo, tipo de torneo); documentos incompletos o formularios viejos; el seminario de más de cuatro años; el mismo tipo de torneo usado de más; pocas rondas; un certificado firmado por quien no tenía el título que hace falta o por el mismo solicitante; dos torneos en fechas que se tocan; una norma de antes del NA o del AF; todas firmadas por la misma persona; la solicitud más de un año después del último torneo, y la edad." },
            { tipo: "separador" },
            { tipo: "nota", texto: "Armado con FIDE B.06.1 (vigente desde el 1 de marzo de 2026), los torneos de ratings.fide.com y los informes de la Comisión de Árbitros de FIDE. Lo que no se ve desde afuera (los certificados emitidos, quién los firmó si el principal no es de Costa Rica, la edad, el inglés para el AI) lo revisa quien arma la solicitud." });
        return {
            titulo: a.nombre,
            subtitulo: [`Informe para la solicitud de ${titulo}`, "ID FIDE " + a.fide_id, a.titulo ? tituloLargo(a) + (a.titulo_detalle ? " (" + a.titulo_detalle + ")" : "") : "Sin título de árbitro en FIDE",
                textoFide(a), "al " + window.HoraCR.fecha(new Date())].join(" · "),
            pie: "Árbitros de Costa Rica · Ajedrez Integral", autor: "Ajedrez Integral", bloques, fotos: [],
        };
    }

    /* ---- Revisar normas antes de mandarlas ----
       Quien tiene la licencia sube el certificado de cada norma (PDF o
       foto) de este árbitro, elige el torneo de FIDE, el cargo que dice el
       certificado y quién lo firmó, y la página dice, norma por norma y la
       solicitud entera, si FIDE la aceptaría y qué le falta: con las mismas
       reglas de «Para pedir el título» (rutaTitulo con las normas subidas).
       Las filas van en arbitros_cr_normas_revision y los archivos en el
       bucket privado normas-arbitros: cada quien ve lo suyo y quien
       administra, todo (la RLS, no la pantalla). */
    const TIPOS_ARCHIVO = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    const MAX_ARCHIVO = 10 * 1024 * 1024;
    let subidas = [], enviadas = [], miId = null, soyAdmin = false;
    const PREDICCION = { "Lista para mandar": "lista", "Casi: revisar lo marcado": "casi", "Todavía no: FIDE la rechazaría": "todavia" };
    const PREDICCION_TEXTO = { lista: "Lista para mandar", casi: "Casi: revisar lo marcado", todavia: "Todavía no: FIDE la rechazaría" };
    const RESULTADOS = { pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada" };

    async function leerSubidas(a) {
        const { data, error } = await sb.from("arbitros_cr_normas_revision")
            .select("id,creada_por,creada,fide_id,cual,torneo_id,cargo,firmante_fide_id,firmante_nombre,archivo,nombre_archivo")
            .eq("fide_id", a.fide_id).order("creada").range(0, 999);
        if (error) throw error;
        return data || [];
    }

    // Una norma subida: lo que diría FIDE y por qué, punto por punto.
    function revisarNorma(a, cual, s) {
        const motivos = [], di = (estado, texto) => motivos.push({ estado, texto });
        const t = torneos.get(s.torneo_id);
        if (!t) {
            di("Revisar", `El torneo ${s.torneo_id} ya no está entre los torneos de FIDE de Costa Rica que tiene la herramienta: revisarlo en su ficha de FIDE.`);
            return { veredicto: "Revisar", motivos, x: null };
        }
        const x = a.todos.find((y) => y.t === t), enFide = x ? x.cargos : [];
        if (!enFide.length) di("Revisar", "En la ficha de FIDE de ese torneo no figura como árbitro, y FIDE lo comprueba ahí: pedir que lo agreguen antes de mandarla.");
        else if (!enFide.includes(s.cargo)) di("Revisar", `El certificado dice «${CARGOS[s.cargo]}» y la ficha de FIDE, «${enFide.map((c) => CARGOS[c] || c).join(", ")}»: tienen que coincidir.`);
        let n = normaDe(t, [s.cargo], [], cual);
        n = cual === "ai" ? antesDelAf(n, t.inicio, a) : despuesDelAf(n, t.inicio, a);
        di(n.estado === "no" ? "No vale" : n.estado === "revisar" ? "Revisar" : "Listo", `El torneo: ${ESTADOS[n.estado]}. ${n.detalle}`);
        const vence = masAnios(t.inicio, 6);
        if (vence < hoyCr()) di("No vale", `Venció el ${fecha(vence)}: una norma cuenta seis años (5.3.1).`);
        const pide = cual === "af" ? ["FA", "IA"] : ["IA"], quien = cual === "af" ? "AF ni AI" : "AI";
        const p = s.firmante_fide_id ? arbitros.find((z) => z.fide_id === s.firmante_fide_id) || null : null;
        if (s.firmante_fide_id === a.fide_id) di("No vale", "Lo firma él mismo: el certificado lo firma otro con título (2.8).");
        else if (p) {
            const tit = tituloEn(p, t.inicio);
            if (pide.includes(tit)) di("Listo", `Lo firma ${p.nombre}, ${TITULOS_CORTOS[tit]} en esa fecha.`);
            else di("No vale", `Lo firma ${p.nombre}, que en esa fecha no era ${quien}: FIDE la rechaza (2.8).`);
        } else if (s.firmante_nombre) di("Revisar", `Lo firma ${s.firmante_nombre}, que no está en la lista: confirmar que en esa fecha era ${cual === "af" ? "AF o AI" : "AI"}.`);
        else di("Falta", "Falta decir quién firma el certificado.");
        const principal = x ? principalDe(x) : null;
        if (principal && p && principal !== p) di("Revisar", `En FIDE el árbitro principal de ese torneo fue ${principal.nombre}: el certificado lo firma el principal.`);
        if (!s.archivo) di("Falta", "Falta subir el certificado.");
        const hay = (e) => motivos.some((m) => m.estado === e);
        const veredicto = hay("No vale") ? "No vale" : hay("Falta") ? "Falta algo" : hay("Revisar") ? "Revisar" : "La aceptaría";
        return { veredicto, motivos, x: { t, inicio: t.inicio, clave: "f" + t.id, cargos: [s.cargo], roles: [], [cual]: n,
            firmante: s.firmante_fide_id === a.fide_id ? a : p, subida: s } };
    }

    // La solicitud entera con las normas subidas que no se caen solas.
    function revisarSolicitud(a, cual, revisadas) {
        const sirven = revisadas.filter((r) => r.x && r.veredicto !== "No vale").map((r) => r.x);
        const extra = [];
        const finDe = (x) => (x.t.fin && x.t.fin > x.inicio ? x.t.fin : x.inicio);
        for (let i = 0; i < sirven.length; i++) for (let j = i + 1; j < sirven.length; j++) {
            const [x, y] = [sirven[i], sirven[j]];
            if (x.inicio <= finDe(y) && y.inicio <= finDe(x)) extra.push({ estado: "Falta", texto: `«${x.t.nombre}» y «${y.t.nombre}» se jugaron en fechas que se tocan: va una sola (2.10).` });
        }
        for (const e of ["una", "opcion"]) {
            const de = sirven.filter((x) => x[cual].estado === e);
            if (de.length > 1) extra.push({ estado: "Falta", texto: `${de.map((x) => "«" + x.t.nombre + "»").join(" y ")} valen una sola vez por solicitud (4.9.1): va una sola.` });
        }
        const ruta = extra.concat(rutaTitulo(a, cual, sirven));
        const caen = revisadas.filter((r) => r.veredicto === "No vale").length;
        // El último punto («lo que no se ve desde afuera») siempre queda para revisar.
        const dudas = ruta.slice(0, -1).some((r) => r.estado === "Revisar") || revisadas.some((r) => r.veredicto === "Revisar");
        const veredicto = caen || ruta.some((r) => r.estado === "Falta") || revisadas.some((r) => r.veredicto === "Falta algo")
            ? "Todavía no: FIDE la rechazaría" : dudas ? "Casi: revisar lo marcado" : "Lista para mandar";
        return { veredicto, ruta, caen };
    }

    /* Las normas que podría sumar o usar de reserva: sus torneos de FIDE de
       los últimos seis años que valen (con su cargo en FIDE y la fecha contra
       el AF), que no están subidos, que no se tocan en fechas con las subidas
       que sirven (2.10) y, si ya hay una que vale una sola vez, ninguna otra
       de ese tipo (4.9.1). Primero las que firmaría alguien con el título que
       hace falta; después las que valen siempre; después las más nuevas. */
    function candidatas(a, cual, revisadas) {
        const desde = masAnios(hoyCr(), -6), pide = cual === "af" ? ["FA", "IA"] : ["IA"];
        const finDe = (x) => (x.t.fin && x.t.fin > x.inicio ? x.t.fin : x.inicio);
        const subidos = new Set(revisadas.map((r) => r.s.torneo_id));
        const sirven = revisadas.filter((r) => r.x && r.veredicto !== "No vale").map((r) => r.x);
        const unaVez = new Set(sirven.map((x) => x[cual].estado).filter((e) => e !== "si"));
        return a.todos.filter((x) => x.fide && !subidos.has(x.t.id) && x.inicio >= desde && VALE.includes(x[cual].estado)
                && !unaVez.has(x[cual].estado) && !sirven.some((y) => x.inicio <= finDe(y) && y.inicio <= finDe(x)))
            .map((x) => {
                const p = principalDe(x), tit = p && p !== a ? tituloEn(p, x.inicio) : "";
                const firmaBien = !!p && p !== a && pide.includes(tit);
                const firma = !p ? "no consta quién fue el principal: ver el certificado"
                    : p === a ? "fue él el principal: el certificado lo firma otro con título (2.8)"
                    : firmaBien ? `lo firmaría ${p.nombre} (${TITULOS_CORTOS[tit]})`
                    : `el principal, ${p.nombre}, no tenía el título que hace falta: la rechazarían (2.8)`;
                return { x, firma, firmaBien };
            })
            .sort((m, n) => (n.firmaBien - m.firmaBien) || (PESO[m.x[cual].estado] - PESO[n.x[cual].estado]) || n.x.inicio.localeCompare(m.x.inicio));
    }

    /* El seguimiento: al mandarla se marca «enviada» con la foto de lo que
       dijo la revisión, y cuando el Consejo resuelve se anota el resultado.
       La revisión acertó si dijo «Lista» y FIDE la aprobó, o «Todavía no» y
       la rechazó; «Casi» no cuenta. */
    function acerto(e) {
        if (e.resultado === "pendiente" || e.prediccion === "casi") return null;
        return (e.prediccion === "lista") === (e.resultado === "aprobada");
    }

    async function leerEnviadas() {
        const { data, error } = await sb.from("arbitros_cr_solicitudes_enviadas")
            .select("id,creada_por,fide_id,cual,enviada,prediccion,normas,resultado,consejo,motivo").order("enviada").range(0, 999);
        if (error) throw error;
        return data || [];
    }

    async function marcarEnviada(a, cual, revisadas, veredicto) {
        const dia = await Avisos.pedir("¿Qué día se mandó la solicitud a FIDE?", { titulo: "Marcar como enviada", etiqueta: "Fecha (AAAA-MM-DD)", valor: hoyCr(), aceptar: "Marcar como enviada" });
        if (dia === null) return;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dia.trim()) || dia.trim() > hoyCr()) { Avisos.avisar("Escribe la fecha como AAAA-MM-DD, y que no sea del futuro.", { tipo: "error" }); return; }
        const fila = { fide_id: a.fide_id, cual, enviada: dia.trim(), prediccion: PREDICCION[veredicto],
            normas: revisadas.map((r) => ({ torneo_id: r.s.torneo_id, nombre: r.x ? r.x.t.nombre : "", inicio: r.x ? r.x.inicio : "", cargo: r.s.cargo, veredicto: r.veredicto })) };
        const { data, error } = await sb.from("arbitros_cr_solicitudes_enviadas").insert(fila).select().single();
        if (error) { Avisos.avisar(error.code === "23505" ? "Esa solicitud ya está marcada como enviada ese día." : "No se pudo marcar: " + error.message, { tipo: "error" }); return; }
        enviadas.push(data);
        $("revision-estado").textContent = "La solicitud quedó marcada como enviada. Cuando FIDE resuelva, anota el resultado abajo.";
        pintarRevision(a);
    }

    async function guardarResultado(a, e, caja) {
        const cambio = { resultado: caja.querySelector("select").value, consejo: caja.querySelector("input").value.trim().slice(0, 120),
            motivo: caja.querySelector("textarea").value.trim().slice(0, 1000) };
        const { error } = await sb.from("arbitros_cr_solicitudes_enviadas").update(cambio).eq("id", e.id);
        if (error) { Avisos.avisar("No se pudo guardar el resultado: " + error.message, { tipo: "error" }); return; }
        Object.assign(e, cambio);
        Avisos.avisar("Resultado guardado.");
        pintarRevision(a);
    }

    function pintarEnviadas(a) {
        const suyas = enviadas.filter((e) => e.fide_id === a.fide_id).sort((x, y) => y.enviada.localeCompare(x.enviada));
        const resueltas = enviadas.map(acerto).filter((v) => v !== null);
        $("revision-acierto").textContent = resueltas.length
            ? `La revisión acertó en ${miles(resueltas.filter(Boolean).length)} de ${miles(resueltas.length)} ${resueltas.length === 1 ? "solicitud resuelta" : "solicitudes resueltas"} (de todos los árbitros; las «Casi» no cuentan).`
            : "";
        $("revision-enviadas").replaceChildren(...suyas.map((e) => {
            const id = "sol-" + e.id, ac = acerto(e);
            const sel = el("select", { id: id + "-resultado", class: "w-full px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm" },
                ...Object.entries(RESULTADOS).map(([k, v]) => el("option", { value: k }, v)));
            sel.value = e.resultado;
            const consejo = el("input", { id: id + "-consejo", type: "text", maxlength: "120", class: "w-full px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm" });
            consejo.value = e.consejo;
            const motivo = el("textarea", { id: id + "-motivo", rows: "2", maxlength: "1000", class: "w-full px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm" });
            motivo.value = e.motivo;
            const etiqueta = (para, texto) => el("label", { for: para, class: "block text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1" }, texto);
            const caja = el("div", { class: "grid gap-2 md:grid-cols-2 mt-2" },
                el("div", {}, etiqueta(id + "-resultado", "Lo que resolvió FIDE"), sel),
                el("div", {}, etiqueta(id + "-consejo", "Consejo o informe"), consejo),
                el("div", { class: "md:col-span-2" }, etiqueta(id + "-motivo", "Por qué (lo que dice el informe de la Comisión)"), motivo));
            const guardar = el("button", { type: "button", class: "mt-2 text-sm font-semibold px-3 py-1.5 rounded-lg bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700" }, "Guardar el resultado");
            guardar.addEventListener("click", () => guardarResultado(a, e, caja));
            const propia = e.creada_por === miId;
            return el("li", { class: "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4", "data-resultado": e.resultado },
                el("p", { class: "font-semibold" }, `Enviada el ${fecha(e.enviada)} · solicitud de ${e.cual === "af" ? "AF" : "AI"}`),
                el("p", { class: "text-sm mt-1" }, `La revisión dijo: ${PREDICCION_TEXTO[e.prediccion]}. FIDE: ${RESULTADOS[e.resultado]}` + (e.consejo ? ` (${e.consejo})` : "") + "."),
                ac === null ? null : el("p", { class: "text-sm mt-1" }, el("strong", {}, ac ? "La revisión acertó." : "La revisión no acertó: ver qué regla faltó o sobró.")),
                e.motivo ? el("p", { class: "of-detalle" }, e.motivo) : null,
                el("p", { class: "of-detalle" }, "Normas: " + (e.normas || []).map((n) => `${n.nombre || n.torneo_id} (${n.veredicto})`).join("; ")),
                propia ? caja : null, propia ? guardar : null);
        }));
        $("revision-enviadas-titulo").classList.toggle("hidden", !suyas.length);
    }

    function pintarRevision(a) {
        const cual = $("revision-cual").value;
        const tiene = cual === "af" ? ["FA", "IA"].includes(a.titulo) : a.titulo === "IA";
        $("revision-aviso").textContent = tiene ? `Ya tiene el título de ${cual === "af" ? "AF" : "AI"}: no hace falta revisar normas para él.`
            : cual === "ai" && a.titulo !== "FA" ? "El AI se pide después del AF: sus normas de AI todavía no cuentan." : "";
        // Los torneos de FIDE en que figura, el más nuevo primero.
        const sel = $("revision-torneo"), antes = sel.value;
        sel.replaceChildren(el("option", { value: "" }, "Elegir el torneo"),
            ...a.todos.filter((x) => x.fide).sort((x, y) => y.inicio.localeCompare(x.inicio))
                .map((x) => el("option", { value: String(x.t.id) }, `${fecha(x.inicio)} · ${x.t.nombre}`)));
        sel.value = antes && sel.querySelector(`option[value="${antes}"]`) ? antes : "";
        const firm = $("revision-firmante"), antesF = firm.value;
        firm.replaceChildren(el("option", { value: "" }, "Elegir quién firma"),
            ...arbitros.slice().sort((x, y) => x.nombre.localeCompare(y.nombre, "es")).map((z) => el("option", { value: String(z.fide_id) }, z.nombre)),
            el("option", { value: "otro" }, "Otra persona (no está en la lista)"));
        firm.value = antesF && firm.querySelector(`option[value="${antesF}"]`) ? antesF : "";
        $("revision-otro-caja").classList.toggle("hidden", firm.value !== "otro");

        const mias = subidas.filter((s) => s.cual === cual);
        const revisadas = mias.map((s) => ({ s, ...revisarNorma(a, cual, s) }));
        const reserva = tiene ? [] : candidatas(a, cual, revisadas);
        pintarEnviadas(a);
        const lista = $("revision-lista");
        lista.replaceChildren(...revisadas.map((r) => {
            const t = torneos.get(r.s.torneo_id);
            const ver = el("button", { type: "button", class: "text-sm font-semibold underline underline-offset-2 hover:no-underline" }, "Ver el certificado");
            ver.addEventListener("click", () => verCertificado(r.s));
            const quitar = el("button", { type: "button", class: "text-sm font-semibold underline underline-offset-2 hover:no-underline" }, "Quitar esta norma");
            quitar.addEventListener("click", () => quitarSubida(a, r.s));
            return el("li", { class: "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4", "data-veredicto": r.veredicto },
                el("p", { class: "font-semibold" }, t ? `${fecha(t.inicio)} · ${t.nombre}` : `Torneo ${r.s.torneo_id}`),
                el("p", { class: "mt-1" }, el("strong", { class: "of-estado" }, r.veredicto)),
                el("p", { class: "of-detalle" }, CARGOS[r.s.cargo] + (r.s.nombre_archivo ? " · " + r.s.nombre_archivo : "")),
                el("ul", { class: "mt-2 space-y-1 text-sm" }, ...r.motivos.map((m) => el("li", { "data-estado": m.estado }, el("strong", {}, m.estado + ": "), m.texto))),
                (r.veredicto === "No vale" || r.veredicto === "Revisar") && reserva.length
                    ? el("p", { class: "text-sm mt-2", "data-reserva": "" }, el("strong", {}, "Para reemplazarla: "), `«${reserva[0].x.t.nombre}» (${fecha(reserva[0].x.inicio)}); ${reserva[0].firma}.`) : null,
                el("div", { class: "flex flex-wrap gap-4 mt-2" }, r.s.archivo ? ver : null,
                    r.s.creada_por === miId || soyAdmin ? quitar : null));
        }));
        const sol = $("revision-solicitud");
        if (!revisadas.length || tiene) { sol.replaceChildren(); sol.classList.add("hidden"); return; }
        const v = revisarSolicitud(a, cual, revisadas);
        const enviar = el("button", { type: "button", id: "revision-enviada", class: "mt-3 text-sm font-semibold px-3 py-1.5 rounded-lg bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700" }, "Marcar como enviada a FIDE");
        enviar.addEventListener("click", () => marcarEnviada(a, cual, revisadas, v.veredicto));
        const faltan = Math.max(0, PIDE[cual] - revisadas.filter((r) => r.veredicto !== "No vale").length);
        sol.classList.remove("hidden");
        sol.replaceChildren(
            el("h4", { class: "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide" }, `La solicitud de ${cual === "af" ? "AF" : "AI"} con estas normas`),
            el("p", { class: "mt-1" }, el("strong", { class: "of-estado" }, v.veredicto)),
            el("p", { class: "of-detalle" }, `${miles(revisadas.length)} ${revisadas.length === 1 ? "norma subida" : "normas subidas"}` + (v.caen ? `, ${miles(v.caen)} no ${v.caen === 1 ? "vale" : "valen"}` : "") + "."),
            el("ul", { class: "mt-2 space-y-1 text-sm" }, ...v.ruta.map((r) => el("li", { "data-estado": r.estado }, el("strong", {}, r.estado + ": "), r.texto))),
            reserva.length ? el("div", { class: "mt-3", "data-candidatas": "" },
                el("h5", { class: "text-sm font-semibold" }, faltan ? `Para completarla (le ${faltan === 1 ? "falta 1 norma" : "faltan " + miles(faltan)}) o tener de reserva` : "Normas de reserva"),
                el("ul", { class: "mt-1 space-y-1 text-sm" }, ...reserva.slice(0, 5).map((c) => el("li", {},
                    el("strong", {}, `${fecha(c.x.inicio)} · ${c.x.t.nombre}`), ` (${ESTADOS[c.x[cual].estado]}): ${c.firma}.`))))
                : el("p", { class: "text-sm mt-3", "data-candidatas": "" }, "No tiene otros torneos de FIDE de los últimos seis años que sirvan de reserva."),
            enviar);
    }

    async function subirNorma(a, ev) {
        ev.preventDefault();
        const cual = $("revision-cual").value, torneo = parseInt($("revision-torneo").value, 10), cargo = $("revision-cargo").value;
        const firm = $("revision-firmante").value, otro = $("revision-otro").value.trim(), archivo = $("revision-archivo").files[0];
        if (!torneo) { Avisos.avisar("Elige el torneo de la norma.", { tipo: "error" }); return; }
        if (!archivo) { Avisos.avisar("Sube el certificado de la norma (PDF o foto).", { tipo: "error" }); return; }
        const ext = TIPOS_ARCHIVO[archivo.type];
        if (!ext) { Avisos.avisar("El certificado tiene que ser un PDF o una foto (JPG, PNG o WebP).", { tipo: "error" }); return; }
        if (archivo.size > MAX_ARCHIVO) { Avisos.avisar("El certificado pesa más de 10 MB: súbelo más liviano.", { tipo: "error" }); return; }
        // La casilla se mira ANTES de subir el archivo: subirlo ya es tratar el dato.
        if (!$("revision-acepto").checked) { Avisos.avisar("Para subir el certificado hay que marcar la casilla de la Política de privacidad.", { tipo: "error" }); $("revision-acepto").focus(); return; }
        if (subidas.some((s) => s.cual === cual && s.torneo_id === torneo && s.creada_por === miId)) { Avisos.avisar("Esa norma ya está subida para esta solicitud.", { tipo: "error" }); return; }
        const boton = $("revision-subir");
        boton.disabled = true; $("revision-estado").textContent = "Subiendo el certificado…";
        const ruta = `${miId}/${crypto.randomUUID()}.${ext}`;
        try {
            const up = await sb.storage.from("normas-arbitros").upload(ruta, archivo, { contentType: archivo.type, upsert: false });
            if (up.error) throw up.error;
            const fila = { fide_id: a.fide_id, cual, torneo_id: torneo, cargo, archivo: ruta, nombre_archivo: archivo.name.slice(0, 200),
                firmante_fide_id: firm && firm !== "otro" ? parseInt(firm, 10) : null, firmante_nombre: firm === "otro" ? otro.slice(0, 120) : "",
                privacidad_version: window.LegalVersion.PRIVACIDAD };
            const { data, error } = await sb.from("arbitros_cr_normas_revision").insert(fila).select().single();
            if (error) { await sb.storage.from("normas-arbitros").remove([ruta]); throw error; }
            subidas.push(data);
            $("revision-form").reset(); $("revision-cual").value = cual;
            $("revision-estado").textContent = "Listo: la norma quedó subida y revisada.";
            pintarRevision(a);
        } catch (e) {
            $("revision-estado").textContent = "";
            Avisos.avisar("No se pudo subir la norma: " + (e.message || e), { tipo: "error" });
        } finally { boton.disabled = false; }
    }

    async function verCertificado(s) {
        const { data, error } = await sb.storage.from("normas-arbitros").createSignedUrl(s.archivo, 3600);
        if (error || !data) { Avisos.avisar("No se pudo abrir el certificado.", { tipo: "error" }); return; }
        const a = el("a", { href: data.signedUrl, target: "_blank", rel: "noopener" });
        document.body.append(a); a.click(); a.remove();
    }

    async function quitarSubida(a, s) {
        const t = torneos.get(s.torneo_id);
        const si = await Avisos.confirmar(`¿Quitar la norma de «${t ? t.nombre : s.torneo_id}» y su certificado?`, { aceptar: "Quitar la norma", cancelar: "Dejarla", peligro: true });
        if (!si) return;
        const { error } = await sb.from("arbitros_cr_normas_revision").delete().eq("id", s.id);
        if (error) { Avisos.avisar("No se pudo quitar: " + error.message, { tipo: "error" }); return; }
        if (s.archivo) await sb.storage.from("normas-arbitros").remove([s.archivo]);
        subidas = subidas.filter((x) => x.id !== s.id);
        $("revision-estado").textContent = "La norma se quitó.";
        pintarRevision(a);
    }

    async function abrirRevision(a) {
        subidas = [];
        pintarRevision(a);
        try { [subidas, enviadas] = await Promise.all([leerSubidas(a), leerEnviadas()]); } catch (e) { $("revision-estado").textContent = "No se pudieron leer las normas subidas: " + (e.message || e); return; }
        if (estado.elegido === a.fide_id) pintarRevision(a);
    }

    /* Lo que dice FIDE de él: si está activo en la lista oficial de
       árbitros, su licencia y cuándo se le aprobó el AF (y el AI). */
    function textoFide(a) {
        const f = a.fide;
        if (!f) return `No figura en la lista de árbitros de FIDE${LISTA ? " del " + fecha(LISTA) : ""}.`;
        const partes = [`${f.inactivo ? "Inactivo" : "Activo"} en la lista de árbitros de FIDE del ${fecha(f.lista)}`
            + (f.licencia && f.licencia !== "NA" ? (f.licencia === "No" ? ", sin licencia" : `, licencia ${f.licencia}`) : "") + "."];
        if (f.af_perfil) partes.push(`AF desde el ${fecha(f.af_perfil)} según su perfil de FIDE (la fecha oficial)` + (f.af_fecha ? `; el Consejo lo aprobó el ${fecha(f.af_fecha)} (${f.af_consejo})` : "") + ": desde entonces sus torneos cuentan para AI y ya no para AF.");
        else if (f.af_fecha) partes.push(`AF aprobado por el Consejo el ${fecha(f.af_fecha)} (${f.af_consejo}). La fecha oficial es la que FIDE anota en su perfil, de seis días a seis semanas después: hasta tenerla, lo que empezó en los ${VENTANA} días siguientes queda para revisar.`);
        else if (["FA", "IA"].includes(a.titulo)) partes.push("De su AF solo se sabe el año (el de su perfil).");
        if (f.ia_fecha) partes.push(`AI aprobado el ${fecha(f.ia_fecha)} (${f.ia_consejo}).`);
        if (a.catNacional) partes.push(`Árbitro Nacional categoría ${a.catNacional} según la lista de la Federación Costarricense de Ajedrez (leída el ${fecha(f.fca_leida)}).`);
        const act = actividad(a);
        if (act) partes.push(act.texto);
        return partes.join(" ");
    }

    /* Hasta cuándo sigue activo por lo menos (B.06.3, 2): un IA o FA queda
       inactivo si en cuatro años no aprueba un curso de actualización; los
       cuatro años se cuentan desde el AF (si es nuevo) o desde el último
       curso o seminario de AI. Los cursos no salen en los informes, así que
       es un piso: con un curso después, sigue más. */
    function actividad(a) {
        const f = a.fide;
        if (!f || !["FA", "IA"].includes(a.titulo)) return null;
        if (f.inactivo) return { estado: "inactivo", hasta: "", texto: "Para volver a estar activo tiene que aprobar un curso de actualización (B.06.3, 2.5); mientras tanto no puede ser árbitro principal de un torneo de FIDE donde haya normas para los jugadores (2.1.1)." };
        const ia = seminarioDe(a, "IA");
        const af = f.af_perfil || f.af_fecha;
        const base = [af, ia && ia.fecha].filter(Boolean).sort().pop();
        if (!base) return { estado: "activo", hasta: "", texto: "Sigue activo mientras haga un curso de actualización cada cuatro años (B.06.3, 2): de cuándo fue el último no hay datos." };
        const hasta = masAnios(base, 4), pronto = hasta <= masAnios(hoyCr(), 1);
        return { estado: "activo", hasta, pronto, texto: `Sigue activo por lo menos hasta el ${fecha(hasta)}: cuatro años desde ${base === af ? "su AF" : "su seminario de AI"} (B.06.3, 2). Un curso de actualización después lo corre${pronto ? "; si no ha hecho ninguno, le toca en menos de un año" : ""}.` };
    }

    /* «Comparar con otro árbitro»: los números de los dos con los filtros
       puestos, año por año y los torneos que hicieron juntos. */
    function pintarComparacion(a) {
        const sel = $("comparar");
        sel.replaceChildren(el("option", { value: "" }, "Elegir un árbitro"),
            ...arbitros.filter((x) => x !== a).sort((x, y) => x.nombre.localeCompare(y.nombre, "es")).map((x) => el("option", { value: String(x.fide_id) }, x.nombre)));
        const b = arbitros.find((x) => x.fide_id === estado.otro && x !== a);
        sel.value = b ? String(b.fide_id) : "";
        $("comparacion").classList.toggle("hidden", !b);
        $("quitar-comparar").classList.toggle("hidden", !b);
        if (!b) return;
        const ra = resumen(a), rb = resumen(b);
        const hoy = (r, cual) => cual === "af" ? (r.cercaAf === 100 ? "Ya es AF" : `${miles(r.cercaAf)} de 3`) : (r.cercaAi === 100 ? "Ya es AI" : `${miles(r.cercaAi)} de 4`);
        const DATOS = [
            ["Título", (r) => r.a.titulo ? tituloLargo(r.a) : "Sin título en FIDE"],
            ["AF desde", (r) => r.anioAf ? String(r.anioAf) : "—"], ["AI desde", (r) => r.anioAi ? String(r.anioAi) : "—"],
            ["En FIDE", (r) => r.enFide], ["AF aprobado", (r) => r.a.fide && r.a.fide.af_fecha ? fecha(r.a.fide.af_fecha) : "—"],
            ["Torneos", (r) => miles(r.torneos)], ["De FIDE", (r) => miles(r.fide)], ["No FIDE", (r) => miles(r.nofide)], ["En el extranjero", (r) => miles(r.fuera)],
            ["Como principal", (r) => miles(r.principal)], ["Como adjunto", (r) => miles(r.adjunto)], ["Como árbitro", (r) => miles(r.arbitro)],
            ["Valen para AF", (r) => miles(r.af)], ["Valen para AI", (r) => miles(r.ai)], ["Hoy para AF", (r) => hoy(r, "af")], ["Hoy para AI", (r) => hoy(r, "ai")],
            ["Primer torneo", (r) => fecha(r.primero)], ["Último torneo", (r) => fecha(r.ultimo)],
        ];
        const td = (v, der) => el("td", { class: "px-3 py-1.5" + (der ? " text-right tabular-nums" : "") }, v);
        const fila = (...celdas) => el("tr", { class: "border-t border-brand-100 dark:border-brand-800" }, ...celdas);
        const th = (v) => el("th", { scope: "row", class: "px-3 py-1.5 font-normal text-left" }, v);
        // Las columnas de números van a la derecha; las de texto, a la izquierda.
        const cabeza = (tabla, numeros, ...cols) => $(tabla).tHead.rows[0].replaceChildren(...cols.map((c, i) => el("th", { scope: "col", class: "px-3 py-2" + (i && numeros ? " text-right" : "") }, c)));
        cabeza("tabla-comparar", true, "Dato", a.nombre, b.nombre);
        $("tabla-comparar").tBodies[0].replaceChildren(...DATOS.map(([n, f]) => fila(th(n), td(f(ra), true), td(f(rb), true))));
        // Juntos: el mismo torneo (o festival, con «festivales como uno») en los dos.
        const la = torneosDe(a), lb = new Map(torneosDe(b).map((x) => [x.clave, x]));
        const juntos = la.filter((x) => lb.has(x.clave));
        const anios = new Map();
        const suma = (anio, k) => { const v = anios.get(anio) || { a: 0, b: 0, juntos: 0 }; v[k]++; anios.set(anio, v); };
        for (const x of la) suma(x.anio, "a");
        for (const x of lb.values()) suma(x.anio, "b");
        for (const x of juntos) suma(x.anio, "juntos");
        cabeza("comparar-anios", true, "Año", a.nombre, b.nombre, "Juntos");
        $("comparar-anios").tBodies[0].replaceChildren(...[...anios.entries()].sort((p, q) => q[0] - p[0])
            .map(([anio, v]) => fila(th(String(anio)), td(miles(v.a), true), td(miles(v.b), true), td(miles(v.juntos), true))));
        $("comparar-juntos-texto").textContent = juntos.length
            ? `${miles(juntos.length)} ${juntos.length === 1 ? "torneo hicieron juntos" : "torneos hicieron juntos"} de ${estado.desde} a ${estado.hasta}:`
            : `Ningún torneo juntos de ${estado.desde} a ${estado.hasta}.`;
        const nombre = (x) => x.festival ? `Festival de ${x.items.length} torneos` : (x.t || x.cr).nombre;
        $("comparar-juntos").classList.toggle("hidden", !juntos.length);
        cabeza("comparar-juntos", false, "Fecha", "Torneo", a.nombre, b.nombre);
        $("comparar-juntos").tBodies[0].replaceChildren(...juntos.map((x) => fila(td(fecha(x.inicio)), th(nombre(x)),
            el("td", { class: "px-3 py-1.5" }, cargoEscrito(x)), el("td", { class: "px-3 py-1.5" }, cargoEscrito(lb.get(x.clave))))));
    }

    // «Equipo de Costa Rica»: quiénes de la lista estuvieron en el torneo y en
    // qué; cada nombre abre su ficha.
    function equipoDe(x, a) {
        const gente = (equipos.get(x.clave) || []).slice().sort((p, q) => (p.a === a ? -1 : q.a === a ? 1 : p.a.nombre.localeCompare(q.a.nombre, "es")));
        if (gente.length < 2) return null;
        const det = el("details", { class: "of-detalle mt-1" }, el("summary", { class: "cursor-pointer underline underline-offset-2" }, `Equipo de Costa Rica (${miles(gente.length)})`));
        det.append(el("ul", { class: "mt-1 space-y-0.5" }, ...gente.map(({ a: p, x: y }) => {
            const quien = p === a ? el("span", { class: "font-semibold" }, p.nombre)
                : el("button", { type: "button", class: "underline underline-offset-2 hover:no-underline text-left", "data-fide": String(p.fide_id) }, p.nombre);
            if (p !== a) quien.addEventListener("click", () => elegir(p.fide_id));
            return el("li", {}, quien, ": " + cargoEscrito(y));
        })));
        return det;
    }

    // Afuera no se cruzó con FIDE: no se sabe si lo valoró.
    // «No» dice además con qué Elo se evaluó, si se sabe: solo el nacional, o ninguno.
    const siFide = (x) => x.fide ? "Sí" : x.fuera ? "No consta"
        : x.festival ? "No" : soloNacional(x) ? "No (Elo nacional)" : calculoDe(x) === "ninguno" ? "No (sin Elo)" : "No";
    const lugarCr = (c) => [c.lugar, (c.pais || "CRC") !== "CRC" ? pais(c.pais) : ""].filter(Boolean).join(", ");

    // Un festival en la ficha: sus torneos uno debajo del otro, con sus enlaces.
    function filaFestival(x) {
        const td = (v, der) => el("td", { class: "px-3 py-2 align-top" + (der ? " text-right tabular-nums" : "") }, v);
        const nombre = el("div", {}, el("span", { class: "font-semibold" }, `Festival de ${x.items.length} torneos`),
            ...x.items.map((y) => el("span", { class: "of-detalle" }, (y.t || y.cr).nombre, " (",
                y.t ? enlace(urlFide(y.t), "FIDE") : null, y.t && y.cr ? " · " : null, y.cr ? enlace(urlCr(y.cr), "chess-results") : null, ")")));
        const jugadores = x.items.reduce((s, y) => s + ((y.t || y.cr).jugadores || 0), 0);
        return el("tr", { class: "border-t border-brand-100 dark:border-brand-800" },
            td(fecha(x.inicio)), el("th", { scope: "row", class: "px-3 py-2 align-top font-normal" }, nombre),
            td(siFide(x)), td(cargoEscrito(x)), td("—"), td("—", true), td("—", true), td(miles(jugadores), true),
            td(norma(x.af)), td(norma(x.ai)));
    }

    function excel() {
        const a = arbitros.find((x) => x.fide_id === estado.elegido);
        if (!a) return;
        const filas = [["Inicio", "Torneo", "FIDE", "Lugar", "Cargo", "Ritmo o control", "Sistema", "Jugadores", "Con Elo que cuentan", "Rondas", "Federaciones",
            "Norma de AF", "Por qué (AF)", "Norma de AI", "Por qué (AI)", "En FIDE", "En chess-results"]]
            .concat(filasFicha(a).map((x) => {
                if (x.festival) {
                    const n = (y) => (y.t || y.cr);
                    return [x.inicio, "Festival: " + x.items.map((y) => n(y).nombre).join(" / "), siFide(x), "", cargoEscrito(x), "", "",
                        x.items.reduce((s, y) => s + (n(y).jugadores || 0), 0), "", "", "", ESTADOS[x.af.estado] || "", x.af.detalle, ESTADOS[x.ai.estado] || "", x.ai.detalle,
                        x.items.filter((y) => y.t).map((y) => urlFide(y.t)).join(" "), x.items.filter((y) => y.cr).map((y) => urlCr(y.cr)).join(" ")];
                }
                const t = x.t, c = x.cr;
                return [x.inicio, t ? t.nombre : c.nombre, siFide(x), t ? [t.ciudad, t.pais].filter(Boolean).join(", ") : lugarCr(c), cargoEscrito(x),
                    t ? RITMOS[t.ritmo] || "" : c.control, t ? SISTEMAS[t.sistema] || "" : "", t ? t.jugadores : c.jugadores, t ? t.contados : "",
                    t ? t.rondas || "" : c.rondas, t ? t.federaciones : "", ESTADOS[x.af.estado] || "", x.af.detalle, ESTADOS[x.ai.estado] || "", x.ai.detalle,
                    t ? urlFide(t) : "", c ? urlCr(c) : ""];
            }));
        window.TablaExcel.bajar("arbitro-" + a.fide_id + ".xlsx", [{ nombre: "Torneos", filas }]);
    }

    /* La ficha en PDF, con js/reporte-pdf.js (sin librería): el encabezado,
       los dos cuadros de normas y la tabla de torneos con los filtros que
       estén puestos. Se arma con los datos, no con la pantalla. */
    function documentoPdf(a) {
        const r = resumen(a);
        const filtros = [`de ${estado.desde} a ${estado.hasta}`];
        if (estado.tipo) filtros.push({ fide: "solo FIDE", nofide: "no FIDE", nacional: "solo con Elo nacional" }[estado.tipo]);
        if (estado.donde) filtros.push(estado.donde === "fuera" ? "en el extranjero" : "en Costa Rica");
        if (estado.contar === "festival") filtros.push("festivales como uno");
        if (estado.normaAf) filtros.push("norma de AF: " + $("norma-af").selectedOptions[0].textContent.toLowerCase());
        if (estado.normaAi) filtros.push("norma de AI: " + $("norma-ai").selectedOptions[0].textContent.toLowerCase());
        const bloques = [];
        for (const cual of ["af", "ai"]) {
            const n = textoNorma(a, cual);
            bloques.push({ tipo: "titulo", texto: n.titulo }, { tipo: "parrafo", texto: n.estado + ". " + n.dicho });
            if (n.torneos.length) bloques.push({ tipo: "lista", items: n.torneos });
            if (n.ruta.length) bloques.push({ tipo: "parrafo", texto: "Para pedir el título:" }, { tipo: "lista", items: n.ruta.map((r) => r.estado + ": " + r.texto) });
            bloques.push({ tipo: "nota", texto: n.nota });
        }
        const lista = filasFicha(a);
        const nombre = (x) => x.festival ? "Festival: " + x.items.map((y) => (y.t || y.cr).nombre).join(" / ")
            : (x.t ? x.t.nombre : x.cr.nombre) + (x.fuera && !x.t ? " (" + pais(x.cr.pais) + ")" : "");
        const rondas = (x) => x.festival ? "" : x.t ? (x.t.rondas || "") : x.cr.rondas;
        const jugadores = (x) => x.festival ? x.items.reduce((s, y) => s + ((y.t || y.cr).jugadores || 0), 0) : (x.t ? x.t.jugadores : x.cr.jugadores);
        // La tabla del PDF recorta las celdas (no parte renglones): el cargo, corto.
        const CORTO = { "Árbitro principal": "Principal", "Árbitro adjunto principal": "Adjunto", "Árbitro de pareos": "Pareos",
            "Árbitro asistente": "Asistente", "Director del torneo": "Director" };
        const cargoCorto = (x) => cargoEscrito(x).split(", ").map((c) => CORTO[c] || c).join(", ");
        bloques.push({ tipo: "titulo", texto: `Torneos (${miles(lista.length)})` },
            { tipo: "nota", texto: "Cargo: «Principal» es árbitro principal y «Adjunto», árbitro adjunto principal. Rds.: rondas; Jug.: jugadores." },
            { tipo: "tabla", encabezados: ["Fecha", "Torneo", "FIDE", "Cargo", "Rds.", "Jug.", "AF", "AI"], anchos: [12, 34, 9, 17, 6, 6, 8, 8],
              filas: lista.map((x) => [fecha(x.inicio), nombre(x), siFide(x), cargoCorto(x), String(rondas(x)), String(jugadores(x)),
                  ESTADOS[x.af.estado] || "—", ESTADOS[x.ai.estado] || "—"]) },
            { tipo: "separador" },
            { tipo: "nota", texto: "Las normas son las condiciones de un torneo según FIDE B.06.1 (vigente desde el 1 de marzo de 2026), con los títulos de los rivales de hoy; el porqué de cada una está en la ficha en línea y en el Excel. Los torneos salen de ratings.fide.com y de chess-results.com; los del extranjero, solo de chess-results, y no se sabe si FIDE los valoró («No consta»). Lo que no se ve desde afuera (seminario, certificados, firmas) lo revisa quien arma la solicitud." });
        return {
            titulo: a.nombre,
            subtitulo: [a.titulo ? tituloLargo(a) + (a.titulo_detalle ? " (" + a.titulo_detalle + ")" : "") : "Sin título de árbitro en FIDE",
                "ID FIDE " + a.fide_id, ESTADO_FIDE[a.enFide] + " en FIDE" + (a.fide && a.fide.af_fecha ? ", AF aprobado el " + fecha(a.fide.af_fecha) : ""), `${miles(r.torneos)} torneos (${miles(r.fide)} de FIDE, ${miles(r.nofide)} que no${r.nacional ? ", " + miles(r.nacional) + " de ellos con solo Elo nacional" : ""}; ${miles(r.fuera)} en el extranjero)`,
                filtros.join(", "), "al " + window.HoraCR.fecha(new Date())].join(" · "),
            pie: "Árbitros de Costa Rica · Ajedrez Integral", autor: "Ajedrez Integral", bloques, fotos: [],
        };
    }

    async function pdf() {
        const a = arbitros.find((x) => x.fide_id === estado.elegido);
        if (a) bajarPdf(documentoPdf(a), "arbitro-" + a.fide_id + ".pdf");
    }

    async function bajarPdf(documento, nombre) {
        try {
            const blob = await window.ReportePDF.generar(documento);
            const url = URL.createObjectURL(blob);
            const enlace = el("a", { href: url, download: nombre });
            document.body.append(enlace); enlace.click(); enlace.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (e) {
            window.Avisos.avisar("No se pudo armar el PDF: " + (e.message || e), { tipo: "error" });
        }
    }

    // La dirección lleva el árbitro elegido y, si hay, con quién se compara.
    function ponerDireccion() {
        const id = estado.elegido;
        history.replaceState(null, "", location.pathname + location.search + (id ? "#" + id + (estado.otro ? "," + estado.otro : "") : ""));
    }

    function elegir(id, otro) {
        estado.elegido = id; estado.otro = otro || null;
        ponerDireccion();
        $("general").classList.toggle("hidden", !!id);
        $("ficha").classList.toggle("hidden", !id);
        $("volver").classList.toggle("hidden", !id);
        if (id) {
            const a = arbitros.find((x) => x.fide_id === id);
            // La revisión arranca en el título que le toca pedir.
            if (a) $("revision-cual").value = ["FA", "IA"].includes(a.titulo) ? "ai" : "af";
            pintarFicha(); $("ficha-titulo").setAttribute("tabindex", "-1"); $("ficha-titulo").focus();
            if (a) abrirRevision(a);
        } else pintarGeneral();
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
        $("en-fide").addEventListener("change", (e) => { estado.enFide = e.target.value; pintar(); });
        // «Torneos» arriba y en la ficha son el mismo filtro: cambiar uno cambia el otro.
        for (const id of ["tipo", "ficha-tipo"]) $(id).addEventListener("change", (e) => {
            estado.tipo = e.target.value; $("tipo").value = $("ficha-tipo").value = estado.tipo; pintar();
        });
        $("donde").addEventListener("change", (e) => { estado.donde = e.target.value; pintar(); });
        $("contar").addEventListener("change", (e) => { estado.contar = e.target.value; pintar(); });
        $("desde").addEventListener("change", (e) => { estado.desde = +e.target.value; if (estado.hasta < estado.desde) { estado.hasta = estado.desde; $("hasta").value = e.target.value; } pintar(); });
        $("hasta").addEventListener("change", (e) => { estado.hasta = +e.target.value; if (estado.desde > estado.hasta) { estado.desde = estado.hasta; $("desde").value = e.target.value; } pintar(); });
        $("norma-af").addEventListener("change", (e) => { estado.normaAf = e.target.value; pintarFicha(); });
        $("norma-ai").addEventListener("change", (e) => { estado.normaAi = e.target.value; pintarFicha(); });
        $("volver").addEventListener("click", () => elegir(null));
        const elegido = () => arbitros.find((x) => x.fide_id === estado.elegido);
        $("revision-cual").addEventListener("change", () => { const a = elegido(); if (a) pintarRevision(a); });
        $("revision-firmante").addEventListener("change", (e) => $("revision-otro-caja").classList.toggle("hidden", e.target.value !== "otro"));
        $("revision-form").addEventListener("submit", (e) => { const a = elegido(); if (a) subirNorma(a, e); else e.preventDefault(); });
        $("excel").addEventListener("click", excel);
        $("comparar").addEventListener("change", (e) => { estado.otro = +e.target.value || null; ponerDireccion(); pintarFicha(); });
        $("quitar-comparar").addEventListener("click", () => { estado.otro = null; ponerDireccion(); pintarFicha(); $("comparar").focus(); });
        $("ranking-anio").replaceChildren(...anios.map((o) => o.cloneNode(true)).reverse());
        $("ranking-anio").value = String(estado.rankAnio);
        $("ranking-anio").addEventListener("change", (e) => { estado.rankAnio = +e.target.value; pintarRanking(); });
        $("ranking-por").addEventListener("change", (e) => { estado.rankPor = e.target.value; pintarRanking(); });
        $("ranking-excel").addEventListener("click", excelRanking);
        $("lista-excel").addEventListener("click", excelLista);
        $("subir-excel").addEventListener("click", excelSubir);
        $("sugerida-excel").addEventListener("click", excelSugerida);
        $("federacion").addEventListener("change", (e) => { estado.federacion = e.target.value; pintarGeneral(); });
        const cuatris = cuatrimestres();
        $("informe-cuatrimestre").replaceChildren(...cuatris.map((c) => el("option", { value: c.valor }, c.texto)));
        // Arranca en el último que ya terminó: el que toca entregar.
        const terminado = cuatris.find((c) => !c.enCurso);
        if (terminado) $("informe-cuatrimestre").value = terminado.valor;
        $("informe-junta").addEventListener("click", () => {
            const c = cuatris.find((x) => x.valor === $("informe-cuatrimestre").value);
            if (c) bajarPdf(informeJunta(c), `informe-arbitraje-${c.desde.slice(0, 7)}.pdf`);
        });
        $("formacion-tipo").addEventListener("change", ajustarFormularioFormacion);
        $("formacion-form").addEventListener("submit", guardarFormacion);
        ajustarFormularioFormacion();
        $("pdf").addEventListener("click", pdf);
        for (const b of $("tabla-arbitros").tHead.querySelectorAll("button")) {
            b.addEventListener("click", () => {
                const col = b.dataset.col;
                estado.orden = { col, dir: estado.orden.col === col ? -estado.orden.dir : (["nombre", "titulo", "enFide", "primero", "anioAf", "anioAi"].includes(col) ? 1 : -1) };
                pintarGeneral();
            });
        }
    }

    async function init() {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { location.href = "login.html?next=arbitros-cr.html"; return; }
        const { data: puede, error } = await sb.rpc("tengo_herramienta", { p_herramienta: "arbitros-cr" });
        if (error || puede !== true) { $("loading").classList.add("hidden"); $("denegado").classList.remove("hidden"); return; }
        miId = session.user.id;
        const { data: adm } = await sb.rpc("soy_admin");
        soyAdmin = adm === true;
        try {
            const [a, t, c, cr, crc, f, s, ce, fo] = await Promise.all([
                leerTodo("arbitros_cr", "fide_id,nombre,titulo,titulo_detalle,solo_chess_results", "fide_id"),
                leerTodo("arbitros_cr_torneos", "id,nombre,ciudad,pais,inicio,fin,sistema,ritmo,jugadores,con_elo,contados,rondas,federaciones,valorado,af_estado,af_detalle,ai_estado,ai_detalle", "id"),
                leerTodo("arbitros_cr_cargos", "torneo_id,fide_id,cargo", "torneo_id,fide_id,cargo"),
                leerTodo("arbitros_cr_cr", "clave,nombre,inicio,fin,lugar,control,rondas,jugadores,fide_torneo,pais", "clave"),
                leerTodo("arbitros_cr_cr_cargos", "clave,fide_id,rol", "clave,fide_id,rol"),
                leerTodo("arbitros_cr_fide", "fide_id,nombre,titulo,inactivo,categoria,licencia,af_fecha,af_consejo,ia_fecha,ia_consejo,lista,solicitudes,seminarios,af_perfil,ia_perfil,categoria_nacional,fca_leida", "fide_id"),
                leerTodo("arbitros_cr_sin_id", "texto,roles,torneos,primero,ultimo,claves,ids", "texto"),
                leerTodo("arbitros_cr_cr_elo", "clave,calculo,ritmo", "clave"),
                leerTodo("arbitros_cr_formacion", "id,fide_id,tipo,categoria,fecha,horas,nota,detalle", "fecha,id"),
            ]);
            sinId = s;
            eloCr = new Map(ce.map((e) => [e.clave, e]));
            formacion = new Map();
            for (const x of fo) formacion.set(x.fide_id, (formacion.get(x.fide_id) || []).concat(x));
            preparar(a, t, c, cr, crc, f);
        } catch (e) {
            $("loading").classList.add("hidden"); $("app").classList.remove("hidden");
            $("error").textContent = "No se pudieron leer los datos: " + (e.message || e) + ". Vuelve a cargar la página en un rato.";
            $("error").classList.remove("hidden");
            return;
        }
        estado.desde = PRIMER; estado.hasta = ULTIMO;
        // El ranking arranca en el año en curso (o el último con torneos).
        const este = window.HoraCR ? parseInt(HoraCR.hoy().slice(0, 4), 10) : ULTIMO;
        estado.rankAnio = Math.min(Math.max(este, PRIMER), ULTIMO);
        armarControles();
        $("loading").classList.add("hidden"); $("app").classList.remove("hidden");
        const [h, o] = decodeURIComponent((location.hash || "").slice(1)).split(",").map((x) => parseInt(x, 10));
        const existe = (id) => id && arbitros.some((a) => a.fide_id === id);
        if (existe(h)) elegir(h, existe(o) && o !== h ? o : null); else pintarGeneral();
    }

    init();
})();
