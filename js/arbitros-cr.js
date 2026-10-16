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

    let LISTA = "", sinId = [], equipos = new Map(), arbitros = [], torneos = new Map(), torneosCr = new Map(), crDeFide = new Map(), PRIMER = 0, ULTIMO = 0;
    const estado = { q: "", titulo: "", tipo: "", donde: "", contar: "", desde: 0, hasta: 0, orden: { col: "torneos", dir: -1 }, normaAf: "", normaAi: "", elegido: null, otro: null, enFide: "",
        rankAnio: 0, rankPor: "torneos" };

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
            if (inicio <= masDias(consejo, VENTANA)) return { estado: "revisar", detalle: `Empezó después del Consejo que le aprobó el AF (${fecha(consejo)}), pero la fecha oficial es la que FIDE anota en su perfil, de dos a cinco semanas después: FIDE rechazó así una norma 22 días después del Consejo. Mirar su perfil. Si contara: ` + n.detalle };
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
            a.todos = torneosDelArbitro(a, fide.get(a.fide_id) || new Map(), cr.get(a.fide_id) || new Map());
            return a;
        });
        LISTA = filasFide.length ? filasFide[0].lista : "";
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
            && (!estado.tipo || (estado.tipo === "fide") === x.fide)
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
        return arbitros.filter((a) => (!q || a.busca.includes(q)) && (!estado.titulo || (estado.titulo === "-" ? !a.titulo : a.titulo === estado.titulo))
            && (!estado.enFide || a.enFide === estado.enFide));
    }

    function pintarGeneral() {
        const filas = enLista().map((a) => resumen(a)).filter((r) => r.torneos > 0);
        const { col, dir } = estado.orden;
        // Sin el título, al final en los dos sentidos.
        const valor = (r) => col === "nombre" ? r.a.nombre : col === "titulo" ? (r.a.titulo || "~")
            : col.startsWith("anio") && !r[col] ? (dir > 0 ? 9999 : 0) : r[col];
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
                td(r.a.titulo || "—"), td(r.anioAf ? String(r.anioAf) : "—", true), td(r.anioAi ? String(r.anioAi) : "—", true), td(r.enFide), td(miles(r.torneos), true), td(miles(r.fide), true), td(miles(r.nofide), true), td(miles(r.fuera), true),
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
        pintarActividadFide();
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
                td(miles(r.torneos), true), td(miles(r.principal), true), td(miles(r.fide), true), td(miles(r.fuera), true), td(miles(r.af), true),
                td(antes(r, previo, anio)));
        }));
        for (const th of $("tabla-ranking").tHead.rows[0].cells) {
            if (th.dataset.col) th.setAttribute("aria-sort", th.dataset.col === estado.rankPor ? "descending" : "none");
        }
        $("ranking-cuenta").textContent = filas.length
            ? `${miles(filas.length)} ${filas.length === 1 ? "árbitro" : "árbitros"} con ${$("ranking-por").selectedOptions[0].textContent.toLowerCase()} en ${anio}.`
            : `Nadie con ${$("ranking-por").selectedOptions[0].textContent.toLowerCase()} en ${anio} con estos filtros.`;
    }

    function excelRanking() {
        const anio = estado.rankAnio, filas = ranking(anio);
        const previo = new Map(anio - 1 >= PRIMER ? ranking(anio - 1).map((r) => [r.a.fide_id, r.puesto]) : []);
        window.TablaExcel.bajar("ranking-arbitros-" + anio + ".xlsx", [{ nombre: "Ranking " + anio, filas: [["Puesto", "Árbitro", "ID FIDE", "Título", "Torneos", "Principal", "FIDE",
            "En el extranjero", "Valen para AF", "El año anterior"]].concat(filas.map((r) => [r.puesto, r.a.nombre, r.a.fide_id, r.a.titulo || "", r.torneos, r.principal, r.fide,
            r.fuera, r.af, antes(r, previo, anio)])) }]);
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
            (a.titulo ? TITULOS[a.titulo] + (a.titulo_detalle ? " (" + a.titulo_detalle + ")" : "") + " · " : ""),
            "ID FIDE ",
            enlace("https://ratings.fide.com/profile/" + a.fide_id, String(a.fide_id)),
            ` · ${miles(r.torneos)} ${r.torneos === 1 ? "torneo" : "torneos"} de ${estado.desde} a ${estado.hasta} (${miles(r.fide)} de FIDE, ${miles(r.nofide)} que no; ${miles(r.fuera)} en el extranjero)`
            + (r.torneos ? `, del ${fecha(r.primero)} al ${fecha(r.ultimo)}` : "")
            + (a.solo_chess_results ? ". No figura como árbitro en ninguna ficha de FIDE." : `: valen para AF ${miles(r.af)}, para AI ${miles(r.ai)}.`));
        $("ficha-fide").textContent = textoFide(a);
        pintarHistorial(a);
        $("ficha-normas").replaceChildren(tarjetaNorma(a, "af"), tarjetaNorma(a, "ai"));
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
       título o si para el AI le falta el AF. */
    function rutaTitulo(a, cual) {
        const tiene = cual === "af" ? ["FA", "IA"].includes(a.titulo) : a.titulo === "IA";
        if (tiene || (cual === "ai" && a.titulo !== "FA")) return [];
        const c = cuentaNormas(a, cual), n = c.usadas.length, pide = PIDE[cual], hoy = hoyCr();
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
        const principales = c.usadas.map((x) => ({ x, p: principalDe(x) }));
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
                botonSolicitud(a, cual)) : null,
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

    /* Lo que dice FIDE de él: si está activo en la lista oficial de
       árbitros, su licencia y cuándo se le aprobó el AF (y el AI). */
    function textoFide(a) {
        const f = a.fide;
        if (!f) return `No figura en la lista de árbitros de FIDE${LISTA ? " del " + fecha(LISTA) : ""}.`;
        const partes = [`${f.inactivo ? "Inactivo" : "Activo"} en la lista de árbitros de FIDE del ${fecha(f.lista)}`
            + (f.licencia && f.licencia !== "NA" ? (f.licencia === "No" ? ", sin licencia" : `, licencia ${f.licencia}`) : "") + "."];
        if (f.af_perfil) partes.push(`AF desde el ${fecha(f.af_perfil)} según su perfil de FIDE (la fecha oficial)` + (f.af_fecha ? `; el Consejo lo aprobó el ${fecha(f.af_fecha)} (${f.af_consejo})` : "") + ": desde entonces sus torneos cuentan para AI y ya no para AF.");
        else if (f.af_fecha) partes.push(`AF aprobado por el Consejo el ${fecha(f.af_fecha)} (${f.af_consejo}). La fecha oficial es la que FIDE anota en su perfil, de dos a cinco semanas después: hasta tenerla, lo que empezó en los ${VENTANA} días siguientes queda para revisar.`);
        else if (["FA", "IA"].includes(a.titulo)) partes.push("De su AF solo se sabe el año (el de su perfil).");
        if (f.ia_fecha) partes.push(`AI aprobado el ${fecha(f.ia_fecha)} (${f.ia_consejo}).`);
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
            ["Título", (r) => r.a.titulo ? TITULOS[r.a.titulo] : "Sin título en FIDE"],
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
    const siFide = (x) => x.fide ? "Sí" : x.fuera ? "No consta" : "No";
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
        if (estado.tipo) filtros.push(estado.tipo === "fide" ? "solo FIDE" : "no FIDE");
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
            subtitulo: [a.titulo ? TITULOS[a.titulo] + (a.titulo_detalle ? " (" + a.titulo_detalle + ")" : "") : "Sin título de árbitro en FIDE",
                "ID FIDE " + a.fide_id, ESTADO_FIDE[a.enFide] + " en FIDE" + (a.fide && a.fide.af_fecha ? ", AF aprobado el " + fecha(a.fide.af_fecha) : ""), `${miles(r.torneos)} torneos (${miles(r.fide)} de FIDE, ${miles(r.nofide)} que no; ${miles(r.fuera)} en el extranjero)`,
                filtros.join(", "), "al " + window.HoraCR.fecha(new Date())].join(" · "),
            pie: "Árbitros de Costa Rica · Ajedrez Integral", autor: "Ajedrez Integral", bloques, fotos: [],
        };
    }

    async function pdf() {
        const a = arbitros.find((x) => x.fide_id === estado.elegido);
        if (!a) return;
        try {
            const blob = await window.ReportePDF.generar(documentoPdf(a));
            const url = URL.createObjectURL(blob);
            const enlace = el("a", { href: url, download: "arbitro-" + a.fide_id + ".pdf" });
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
        $("en-fide").addEventListener("change", (e) => { estado.enFide = e.target.value; pintar(); });
        $("tipo").addEventListener("change", (e) => { estado.tipo = e.target.value; pintar(); });
        $("donde").addEventListener("change", (e) => { estado.donde = e.target.value; pintar(); });
        $("contar").addEventListener("change", (e) => { estado.contar = e.target.value; pintar(); });
        $("desde").addEventListener("change", (e) => { estado.desde = +e.target.value; if (estado.hasta < estado.desde) { estado.hasta = estado.desde; $("hasta").value = e.target.value; } pintar(); });
        $("hasta").addEventListener("change", (e) => { estado.hasta = +e.target.value; if (estado.desde > estado.hasta) { estado.desde = estado.hasta; $("desde").value = e.target.value; } pintar(); });
        $("norma-af").addEventListener("change", (e) => { estado.normaAf = e.target.value; pintarFicha(); });
        $("norma-ai").addEventListener("change", (e) => { estado.normaAi = e.target.value; pintarFicha(); });
        $("volver").addEventListener("click", () => elegir(null));
        $("excel").addEventListener("click", excel);
        $("comparar").addEventListener("change", (e) => { estado.otro = +e.target.value || null; ponerDireccion(); pintarFicha(); });
        $("quitar-comparar").addEventListener("click", () => { estado.otro = null; ponerDireccion(); pintarFicha(); $("comparar").focus(); });
        $("ranking-anio").replaceChildren(...anios.map((o) => o.cloneNode(true)).reverse());
        $("ranking-anio").value = String(estado.rankAnio);
        $("ranking-anio").addEventListener("change", (e) => { estado.rankAnio = +e.target.value; pintarRanking(); });
        $("ranking-por").addEventListener("change", (e) => { estado.rankPor = e.target.value; pintarRanking(); });
        $("ranking-excel").addEventListener("click", excelRanking);
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
        try {
            const [a, t, c, cr, crc, f, s] = await Promise.all([
                leerTodo("arbitros_cr", "fide_id,nombre,titulo,titulo_detalle,solo_chess_results", "fide_id"),
                leerTodo("arbitros_cr_torneos", "id,nombre,ciudad,pais,inicio,fin,sistema,ritmo,jugadores,con_elo,contados,rondas,federaciones,valorado,af_estado,af_detalle,ai_estado,ai_detalle", "id"),
                leerTodo("arbitros_cr_cargos", "torneo_id,fide_id,cargo", "torneo_id,fide_id,cargo"),
                leerTodo("arbitros_cr_cr", "clave,nombre,inicio,fin,lugar,control,rondas,jugadores,fide_torneo,pais", "clave"),
                leerTodo("arbitros_cr_cr_cargos", "clave,fide_id,rol", "clave,fide_id,rol"),
                leerTodo("arbitros_cr_fide", "fide_id,titulo,inactivo,categoria,licencia,af_fecha,af_consejo,ia_fecha,ia_consejo,lista,solicitudes,seminarios,af_perfil,ia_perfil", "fide_id"),
                leerTodo("arbitros_cr_sin_id", "texto,roles,torneos,primero,ultimo,claves,ids", "texto"),
            ]);
            sinId = s;
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
