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

    let equipos = new Map(), arbitros = [], torneos = new Map(), torneosCr = new Map(), crDeFide = new Map(), PRIMER = 0, ULTIMO = 0;
    const estado = { q: "", titulo: "", tipo: "", donde: "", contar: "", desde: 0, hasta: 0, orden: { col: "torneos", dir: -1 }, normaAf: "", normaAi: "", elegido: null };

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
            // FIDE escribe el país («Costa Rica»); chess-results da el código.
            const fuera = fide ? e.t.pais !== "Costa Rica" : (e.cr.pais || "CRC") !== "CRC";
            return { ...e, fide, fuera, inicio, anio: parseInt(inicio.slice(0, 4), 10), clave: fide ? "f" + e.t.id : "c" + e.cr.clave,
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
        for (const a of arbitros) a.normas = { af: cuentaNormas(a, "af").usadas.length, ai: cuentaNormas(a, "ai").usadas.length };
        // El equipo de Costa Rica de cada torneo: quién de la lista estuvo y en qué.
        equipos = new Map();
        for (const a of arbitros) for (const x of a.todos) equipos.set(x.clave, (equipos.get(x.clave) || []).concat({ a, x }));
        const anios = arbitros.flatMap((a) => a.todos.map((x) => x.anio));
        PRIMER = Math.min(...anios); ULTIMO = Math.max(...anios);
    }

    // Sus torneos dentro de los años y del tipo elegidos, el más nuevo
    // primero; con «festivales como uno», los del mismo día juntos.
    function torneosDe(a) {
        const l = a.todos.filter((x) => x.anio >= estado.desde && x.anio <= estado.hasta
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

    function resumen(a) {
        const l = torneosDe(a);
        const cuenta = (f) => l.filter(f).length;
        return {
            a, torneos: l.length, fide: cuenta((x) => x.fide), nofide: cuenta((x) => !x.fide), fuera: cuenta((x) => x.fuera),
            principal: cuenta((x) => fue(x, "Chief", "ap")),
            adjunto: cuenta((x) => fue(x, "Dep. Chief", "adj")),
            arbitro: cuenta((x) => fue(x, "Arbiter", "arb")),
            af: cuenta((x) => x.fide && x.af.estado !== "no"), afRevisar: cuenta((x) => x.af.estado === "revisar"),
            ai: cuenta((x) => x.fide && x.ai.estado !== "no"), aiRevisar: cuenta((x) => x.ai.estado === "revisar"),
            ultimo: l.length ? l[0].inicio : "",
            // «Hoy para AF/AI»: no depende de los filtros (es lo que junta hoy).
            cercaAf: ["FA", "IA"].includes(a.titulo) ? 100 : a.normas.af, cercaAi: a.titulo === "IA" ? 100 : a.normas.ai,
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
                td(r.a.titulo || "—"), td(miles(r.torneos), true), td(miles(r.fide), true), td(miles(r.nofide), true), td(miles(r.fuera), true),
                td(miles(r.principal), true), td(miles(r.adjunto), true), td(miles(r.arbitro), true),
                td(conRev(r.af, r.afRevisar), true), td(conRev(r.ai, r.aiRevisar), true),
                td(r.cercaAf === 100 ? "Ya es AF" : `${miles(r.cercaAf)} de 3`, true), td(r.cercaAi === 100 ? "Ya es AI" : `${miles(r.cercaAi)} de 4`, true),
                td(fecha(r.ultimo)));
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
            ` · ${miles(r.torneos)} torneos de ${estado.desde} a ${estado.hasta} (${miles(r.fide)} de FIDE, ${miles(r.nofide)} que no; ${miles(r.fuera)} en el extranjero)`
            + (a.solo_chess_results ? ". No figura como árbitro en ninguna ficha de FIDE." : `: valen para AF ${miles(r.af)}, para AI ${miles(r.ai)}.`));
        $("ficha-normas").replaceChildren(tarjetaNorma(a, "af"), tarjetaNorma(a, "ai"));
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
            estado = "Primero el AF"; dicho = `El AI se pide después del título de AF. Con lo de hoy juntaría ${miles(n)} de las ${pide} normas de AI.`;
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
        extra.push(cual === "af" ? "Además del seminario. No se ve desde afuera si los certificados se emitieron y quién los firmó."
            : "Además del seminario, no todas firmadas por la misma persona y a lo sumo dos finales nacionales: eso no se ve desde afuera.");
        // Hasta cuándo cuenta cada una: seis años desde que empezó el torneo.
        const hoy = window.HoraCR ? HoraCR.hoy() : "";
        const enUnAnio = hoy ? (parseInt(hoy.slice(0, 4), 10) + 1) + hoy.slice(4) : "";
        const hasta = (x) => (parseInt(x.inicio.slice(0, 4), 10) + 6) + x.inicio.slice(4);
        const vencen = c.usadas.filter((x) => hasta(x) <= enUnAnio);
        if (vencen.length && !tiene) extra.unshift(`${miles(vencen.length)} ${vencen.length === 1 ? "deja" : "dejan"} de contar en menos de un año.`);
        return { titulo: "Norma de " + titulo, estado, dicho, torneos: c.usadas.map((x) => `${fecha(x.inicio)} · ${x.t.nombre} (${ESTADOS[x[cual].estado]}) · cuenta hasta el ${fecha(hasta(x))}`
            + (hasta(x) <= enUnAnio ? " (vence pronto)" : "")),
            nota: `Cuenta desde el ${fecha(c.desde)}, una por festival o fechas que se tocan. ` + extra.join(" ") };
    }

    function tarjetaNorma(a, cual) {
        const n = textoNorma(a, cual);
        return el("div", { class: "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4", "data-norma": cual },
            el("h3", { class: "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide" }, n.titulo),
            el("p", { class: "mt-1" }, el("strong", { class: "of-estado" }, n.estado), " ", el("span", {}, n.dicho)),
            n.torneos.length ? el("ul", { class: "mt-2 space-y-0.5" }, ...n.torneos.map((t) => el("li", { class: "of-detalle" }, t))) : null,
            el("p", { class: "of-detalle mt-2" }, n.nota));
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
                "ID FIDE " + a.fide_id, `${miles(r.torneos)} torneos (${miles(r.fide)} de FIDE, ${miles(r.nofide)} que no; ${miles(r.fuera)} en el extranjero)`,
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
        $("donde").addEventListener("change", (e) => { estado.donde = e.target.value; pintar(); });
        $("contar").addEventListener("change", (e) => { estado.contar = e.target.value; pintar(); });
        $("desde").addEventListener("change", (e) => { estado.desde = +e.target.value; if (estado.hasta < estado.desde) { estado.hasta = estado.desde; $("hasta").value = e.target.value; } pintar(); });
        $("hasta").addEventListener("change", (e) => { estado.hasta = +e.target.value; if (estado.desde > estado.hasta) { estado.desde = estado.hasta; $("desde").value = e.target.value; } pintar(); });
        $("norma-af").addEventListener("change", (e) => { estado.normaAf = e.target.value; pintarFicha(); });
        $("norma-ai").addEventListener("change", (e) => { estado.normaAi = e.target.value; pintarFicha(); });
        $("volver").addEventListener("click", () => elegir(null));
        $("excel").addEventListener("click", excel);
        $("pdf").addEventListener("click", pdf);
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
                leerTodo("arbitros_cr_cr", "clave,nombre,inicio,fin,lugar,control,rondas,jugadores,fide_torneo,pais", "clave"),
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
