/* El código de sesion.html.

   La pestaña «🧠 Entrenamientos» del profe: todos los entrenamientos del sitio
   dentro de la clase (Mates, Aprender, Desafíos, Fichas de estudio, Aperturas
   y celadas, Visualización, Precisión posicional, Finales contra la máquina,
   Memoria, Habilidades, Coordenadas, 4×4…), para mostrar la posición y
   explicarla, preguntarla a la clase, mandarla como calentamiento y que la
   practiquen. Ver «Los entrenamientos, en la clase» en
   docs/decisiones/clase-en-vivo.md.

   - La lista de entrenamientos NO está escrita acá: sale de
     MaterialPlataforma.HERRAMIENTAS (js/material-plataforma.js), la misma de
     Tareas. Un entrenamiento nuevo que entra ahí aparece solo en la clase:
     si tiene «adaptador» (abajo) con su lista de ejercicios; si no, con
     «📲 Que lo abran todos». verificar-clase-entrenamientos.js revisa que
     cada tarjeta del hub (entreno/index.html) esté en esa lista.
   - Los datos son los de cada página, sin copiar: los JSON de entreno/data y
     los módulos de js/ (aperturas-lineas.js, fichas-estudio.js,
     precision-posicional-items.js, aprender-lecciones.js), que se cargan
     recién al abrir esa tarjeta.
   - «Que lo practiquen» con ejercicios de solución única es el calentamiento
     de js/clase-tanda.js (con nota o en competencia) sacado de ese banco; con
     una partida, la práctica contra el motor; con lo demás, el enlace.

   Como las demás partes de la clase (ver «sesion.js en partes»), es un script
   clásico cargado ANTES que sesion.js: usa lo de sesion.js solo dentro de
   funciones. La parte que no toca la página (EntrenosClase) es pura, para
   poder probarla sola. */

window.EntrenosClase = (function () {
    // Lo que no va: Táctica ya tiene su pestaña, y los diagnósticos, los
    // cuestionarios y el plan contra un rival no son algo que se da en clase.
    const QUEDA_AFUERA = new Set(["temas", "diagnostico", "arbitraje", "cuestionario", "plan-rival"]);
    const EMOJI = {
        mates: "♛", aprender: "🎓", desafios: "🏆", estudio: "📖", aperturas: "📚", "4x4": "🔲",
        visualizacion: "👁️", "precision-posicional": "🎯", finales: "🤖", memoria: "🧠", tipos: "🧩",
        coordenadas: "🧭", practicas: "✍️", sonar: "📡", "batalla-naval": "🚢", concentracion: "🃏",
        ilumina: "💡", confites: "🍬",
    };
    // Cuántos ejercicios se muestran de una vez en una lista (y «Mostrar más»).
    const POR_PAGINA = 30;

    /* Las tarjetas: las herramientas del sitio que se pueden dar en clase, en
       el orden de la lista. `conLista` dice si la clase sabe abrir sus
       ejercicios (tiene adaptador); las demás se mandan a abrir. */
    function tarjetas(herramientas, adaptadores) {
        return (herramientas || []).filter((h) => h && h.slug && !QUEDA_AFUERA.has(h.slug) && !h.noSeElige && !h.unaVez)
            .map((h) => ({ slug: h.slug, label: h.label, href: h.href, emoji: EMOJI[h.slug] || "🧩",
                conLista: !!(adaptadores && adaptadores[h.slug]) }));
    }

    /* El enlace que le llega a cada alumno al «📲 Que lo abran todos». No
       viaja una dirección: viaja el slug (y el recorte), y la dirección sale
       de la lista. Así nadie puede mandar a la clase a cualquier lado. */
    function enlaceDe(herramientas, slug, recorte) {
        const h = (herramientas || []).find((x) => x.slug === slug);
        if (!h || QUEDA_AFUERA.has(slug) || !/^[a-z0-9/._-]+\.html$/.test(h.href)) return null;
        if (recorte && typeof h.hrefRecorte === "function") return { href: h.hrefRecorte(String(recorte)), label: h.label };
        return { href: h.href, label: h.label };
    }

    // Las jugadas que le tocan al alumno en una solución que empieza con la suya.
    const pliesDe = (solucion) => Math.max(1, Math.min(6, Math.ceil(((solucion || []).length || 1) / 2)));

    /* La posición de una línea desde su FEN (o la inicial) después de `n`
       jugadas, con chess.js. null si la línea no se reproduce. */
    function posicionTras(fen, jugadas, n) {
        let g;
        try { g = fen ? new Chess(fen) : new Chess(); } catch (e) { return null; }
        for (let i = 0; i < n; i++) {
            let m = null;
            try { m = g.move(jugadas[i], { sloppy: true }); } catch (e) { m = null; }
            if (!m) return null;
        }
        return g.fen();
    }

    /* La solución {from, to, promotion} de una lección de Aprender en SAN (para
       preguntarla y para el calentamiento). No es la jugada de una persona: es
       la que espera la lección, y si corona sin decir en qué, es en dama, como
       la corrige js/entreno-aprender.js. */
    function sanDe(fen, from, to, promotion) {
        let g;
        try { g = new Chess(fen); } catch (e) { return null; }
        let m = null;
        try { m = g.move({ from, to, promotion: promotion || "q" }); } catch (e) { m = null; }
        return m ? m.san : null;
    }

    return { QUEDA_AFUERA, EMOJI, POR_PAGINA, tarjetas, enlaceDe, pliesDe, posicionTras, sanDe };
})();

/* ---------- Los adaptadores: los ejercicios de cada entrenamiento ----------
   Cada uno da sus grupos: [{id, titulo, desc, items, practica}], y cada
   ejercicio {id, titulo, fen, solucion (SAN, empieza la del alumno), prompt,
   elo (su dificultad en puntos Elo: de ahí salen los puntos de la pregunta),
   opciones/correcta (de opciones), guion (lo que ve solo el profe para
   explicarlo), linea (una apertura), final (se juega contra el motor), foto
   (Memoria), practica}. `practica`: {tanda: {banco, filtro, titulo}} o
   {enlace: recorte}. */
const bajarJsonEntreno = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
const scriptsCargados = new Map();
function cargarScriptEntreno(src, global) {
    if (window[global]) return Promise.resolve(window[global]);
    if (!scriptsCargados.has(src)) {
        scriptsCargados.set(src, new Promise((ok, mal) => {
            const s = document.createElement("script");
            s.src = src;
            s.onload = () => (window[global] ? ok(window[global]) : mal(new Error("No vino " + global)));
            s.onerror = () => { scriptsCargados.delete(src); mal(new Error("No se pudo cargar " + src)); };
            document.head.appendChild(s);
        }));
    }
    return scriptsCargados.get(src);
}
function temasParaEntrenos() {
    if (typeof tacticsData !== "undefined" && tacticsData && tacticsData.puzzles) return Promise.resolve(tacticsData);
    return bajarJsonEntreno("entreno/data/temas.json");
}

const ADAPTADORES_ENTRENO = {
    mates: {
        corto: "En 1, en 2 y en 3",
        desc: "Mate en 1, en 2 y en 3: posiciones de partidas reales con una sola forma de dar mate.",
        async cargar() {
            const [mates, dif] = await Promise.all([bajarJsonEntreno("entreno/data/mates.json"), bajarJsonEntreno("entreno/data/mates-dificultad.json").catch(() => null)]);
            const cats = ["mate1", "mate2", "mate3"];
            return cats.map((c, k) => {
                const centro = dif && dif.categorias && dif.categorias[c] ? dif.categorias[c].centro : null;
                const items = mates.filter((m) => m.category === c).map((m, i) => ({
                    id: m.id, titulo: (i + 1) + ". Juegan " + (m.fen.split(" ")[1] === "w" ? "blancas" : "negras"),
                    fen: m.fen, solucion: m.solution, elo: (dif && dif.elo && dif.elo[m.id]) || centro || 1200, guion: ["La solución: " + m.solution.join(" ") + "."],
                }));
                return { id: c, titulo: "Mate en " + (k + 1), desc: (centro ? "Alrededor de " + centro + " puntos Elo · " : "") + items.length + " ejercicios",
                    items, practica: { tanda: { banco: "mates", filtro: "cat:" + c, titulo: "Mate en " + (k + 1) } } };
            });
        },
    },
    desafios: {
        corto: "Con enunciado y explicación",
        desc: "Problemas pensados para enseñar: carreras de peones, ganar material, defender. Con su enunciado y su explicación.",
        async cargar() {
            const d = await bajarJsonEntreno("entreno/data/desafios.json");
            return (d.categories || []).map((c) => {
                const todos = (d.challenges || []).filter((x) => x.cat === c.id);
                // Los que no tienen los dos reyes no van al tablero de la clase (ni los juega chess.js).
                const items = todos.filter((x) => TandaCalentamiento.tieneLosDosReyes(x.fen)).map((x) => ({
                    id: "desafio-" + x.n, titulo: x.n + ". " + x.text, fen: x.fen, solucion: x.solution.san, prompt: x.text, elo: 1100,
                    guion: [x.text, "La solución: " + x.solution.san.join(" ") + ".", x.solution.explain].filter(Boolean),
                }));
                const fuera = todos.length - items.length;
                return { id: c.id, emoji: c.emoji, titulo: c.title, desc: c.desc + " · " + items.length + " para la clase"
                    + (fuera ? " (" + fuera + " sin los dos reyes se hacen en la página)" : ""),
                    items, practica: items.length >= 5 ? { tanda: { banco: "desafios", filtro: "cat:" + c.id, titulo: "Desafíos: " + c.title } } : { enlace: null } };
            });
        },
    },
    visualizacion: {
        corto: "La línea de memoria",
        desc: "Ejercicios de Táctica según cuántas jugadas hay que ver de memoria. En la clase: la posición, y que digan la línea entera.",
        async cargar() {
            const d = await temasParaEntrenos();
            const niveles = [["l1", "Visualiza 1 jugada por delante"], ["l2", "Visualiza 2 jugadas"], ["l3", "Visualiza 3 jugadas"], ["l4", "Visualiza 4 jugadas"], ["l5", "Visualiza 5 jugadas o más"]];
            return niveles.map(([id, titulo], k) => {
                const sub = TandaCalentamiento.filtrar(d.puzzles, "largo:" + id);
                const items = Object.keys(sub).sort((a, b) => sub[a].rating - sub[b].rating).map((pid, i) => ({
                    id: pid, titulo: (i + 1) + ". ELO " + sub[pid].rating + " · " + Math.ceil(sub[pid].solution.length / 2) + " jugadas tuyas",
                    fen: sub[pid].fen, solucion: sub[pid].solution, elo: sub[pid].rating, guion: ["La línea: " + sub[pid].solution.join(" ") + "."],
                }));
                return { id, titulo: "Nivel " + (k + 1) + ": " + titulo, desc: items.length + " ejercicios", items,
                    practica: { tanda: { banco: "temas", filtro: "largo:" + id, titulo: "Visualización, nivel " + (k + 1) } } };
            });
        },
    },
    "precision-posicional": {
        corto: "¿Cuál es el plan?",
        desc: "¿Cuál es el plan? Cuatro opciones, una correcta y su explicación. Se preguntan a la clase como pregunta de opciones.",
        async cargar() {
            const [items, criterio] = await Promise.all([
                cargarScriptEntreno("js/precision-posicional-items.js", "PRECISION_POSICIONAL_ITEMS"),
                cargarScriptEntreno("js/precision-posicional-criterio.js", "PrecisionPosicionalCriterio").catch(() => null),
            ]);
            const areas = criterio && criterio.AREAS ? criterio.AREAS : [...new Set(items.map((i) => i.area))].map((id) => ({ id, nombre: id }));
            return areas.map((a) => {
                const suyos = items.filter((i) => i.area === a.id).map((i, k) => ({
                    id: i.id, titulo: (k + 1) + ". Dificultad " + i.dificultad + " · " + i.enunciado, fen: i.fen,
                    prompt: i.enunciado, opciones: i.opciones, correcta: i.correcta, elo: 700 + 400 * (i.dificultad || 2),
                    guion: ["La correcta: " + i.opciones[i.correcta], i.explica].filter(Boolean),
                }));
                return { id: a.id, emoji: a.emoji, titulo: a.nombre, desc: suyos.length + " posiciones", items: suyos, practica: { enlace: null } };
            });
        },
    },
    aperturas: {
        corto: "Líneas y trampas",
        desc: "Las líneas de apertura y las celadas: la idea, la jugada clave y la línea entera para jugarla con la clase.",
        async cargar() {
            const A = await cargarScriptEntreno("js/aperturas-lineas.js", "AperturasLineas");
            return [["apertura", "Aperturas"], ["celada", "Celadas"]].map(([tipo, titulo]) => {
                const items = A.LINEAS.filter((l) => l.tipo === tipo).map((l) => {
                    const n = l.jugadas.length;
                    return { id: l.id, titulo: l.nombre + " (" + (l.color === "w" ? "blancas" : "negras") + ", nivel " + l.nivel + ")",
                        fen: EntrenosClase.posicionTras(null, l.jugadas, 0), linea: l.jugadas,
                        // La pregunta: la posición antes de la última jugada de la línea.
                        fenClave: EntrenosClase.posicionTras(null, l.jugadas, n - 1), solucion: [l.jugadas[n - 1]], elo: 700 + 300 * (l.nivel || 1),
                        prompt: "¿Cuál es la jugada que sigue en «" + l.nombre + "»?",
                        guion: ["La línea: " + l.jugadas.join(" ") + ".", l.idea, l.clave].filter(Boolean),
                        practica: { enlace: l.id } };
                });
                return { id: tipo, titulo, desc: items.length + " líneas", items, practica: { enlace: null } };
            });
        },
    },
    estudio: {
        corto: "Fichas para explicar",
        desc: "Las fichas de estudio: el guion para explicarla en clase y, después, su práctica.",
        async cargar() {
            const [F, A] = await Promise.all([cargarScriptEntreno("js/fichas-estudio.js", "FichasEstudio"), cargarScriptEntreno("js/aperturas-lineas.js", "AperturasLineas")]);
            return (F.CATEGORIAS || []).map((c) => {
                const items = F.FICHAS.filter((f) => f.categoria === c.id).map((f) => {
                    const linea = f.lineaId ? A.LINEAS.find((l) => l.id === f.lineaId) : null;
                    const fen = f.fen || (linea ? EntrenosClase.posicionTras(null, linea.jugadas, linea.jugadas.length)
                        : f.jugadas ? EntrenosClase.posicionTras(null, f.jugadas, f.jugadas.length) : null);
                    const solucion = f.fen && Array.isArray(f.linea) && f.linea.length ? f.linea : null;
                    return { id: "ficha-" + f.id, titulo: f.titulo + " — " + f.subtitulo, fen, solucion, elo: 700 + 300 * (f.nivel || 1),
                        guion: [f.resumen, f.diagrama].concat(Array.isArray(f.centro) ? f.centro : []).filter(Boolean),
                        practica: f.temaPractica ? { tanda: { banco: "temas", filtro: "tema:" + f.temaPractica, titulo: f.titulo } }
                            : linea ? { enlaceDe: "aperturas", recorte: linea.id } : { enlace: f.id } };
                });
                return { id: c.id, titulo: c.etiqueta + " (" + c.sub + ")", desc: items.length + " fichas", items, practica: { enlace: null } };
            });
        },
    },
    finales: {
        corto: "Contra la máquina",
        desc: "Los finales que hay que saber ganar o hacer tablas. En la clase: explicarlo y que cada uno lo juegue contra la máquina.",
        async cargar() {
            const d = await bajarJsonEntreno("entreno/data/finales.json");
            const items = (d.finales || []).map((f, i) => ({
                id: f.id, titulo: (i + 1) + ". " + f.titulo + " (" + (f.meta === "tablas" ? "hacer tablas" : "ganar") + " con " + (f.alumno === "w" ? "blancas" : "negras") + ")",
                fen: f.fen, final: true, guion: [f.idea, f.pista ? "Pista: " + f.pista : null].filter(Boolean),
            }));
            return [{ id: "finales", titulo: "Finales contra la máquina", desc: items.length + " finales", items, practica: { enlace: null } }];
        },
    },
    memoria: {
        corto: "La Fotografía",
        desc: "Ver la posición unos segundos y reconstruirla. En la clase: la Fotografía (se ve y las piezas desaparecen de todos los tableros).",
        async cargar() {
            const d = await bajarJsonEntreno("entreno/data/memoria.json");
            const tramos = [[3, 6, 8], [7, 10, 12], [11, 16, 15], [17, 24, 20], [25, 32, 30]];
            return tramos.map(([a, b, seg]) => {
                const items = [];
                for (let n = a; n <= b; n++) ((d.porPiezas || {})[n] || []).slice(0, 8).forEach((p) => items.push({
                    id: p.id, titulo: n + " piezas", fen: p.fen, foto: seg, guion: ["Pídeles que la reconstruyan en su tablero o que la dicten pieza por pieza."],
                }));
                return { id: a + "-" + b, titulo: "De " + a + " a " + b + " piezas", desc: seg + " segundos para mirarla · " + items.length + " posiciones", items, practica: { enlace: null } };
            });
        },
    },
    aprender: {
        corto: "Las piezas y las reglas",
        desc: "Las lecciones de Aprender: cómo mueve cada pieza, las reglas especiales y las tácticas básicas.",
        async cargar() {
            await cargarScriptEntreno("js/aprender-lecciones.js", "AprenderLecciones");
            const L = window.AprenderLecciones;
            return L.CATEGORY_ORDER.filter((c) => L.LESSONS.some((l) => l.cat === c)).map((c) => {
                const items = L.LESSONS.filter((l) => l.cat === c).map((l) => {
                    const fen = l.fen || (l.rounds && l.rounds[0] && l.rounds[0].fen) || null;
                    const san = l.type === "move" && l.solution ? EntrenosClase.sanDe(l.fen, l.solution.from, l.solution.to, l.solution.promotion) : null;
                    return { id: l.id, titulo: l.title, fen, solucion: san ? [san] : null, prompt: l.type === "move" ? l.text : null, elo: 600,
                        guion: [l.text].concat(san ? ["La jugada: " + san + "."] : []).concat(l.targets ? ["Las casillas: " + l.targets.join(", ") + "."] : []) };
                });
                return { id: c, titulo: L.CATEGORY_LABEL[c], desc: items.length + " lecciones", items, practica: { enlace: null } };
            });
        },
    },
};

/* ---------- La pestaña ---------- */
let entrenosView = { slug: null, grupo: null, mostrar: EntrenosClase.POR_PAGINA };
const entrenosDatos = new Map();     // slug → promesa de sus grupos
let entrenoEnCurso = null;           // profe: {slug, recorte, at} — lo que pidió que abran todos (va en la presencia)
let entrenoVisto = null;             // alumno: el último pedido que cerró
let vistaPreviaEntrenos = null;

const herramientasDelSitio = () => (window.MaterialPlataforma && MaterialPlataforma.HERRAMIENTAS) || [];

function entrenoBoton(texto, fn, principal, titulo) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = principal
        ? "text-xs font-semibold px-2 py-1 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        : "text-xs font-semibold px-2 py-1 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-700 dark:hover:bg-brand-600 text-brand-700 dark:text-brand-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    textoConEmojiMudo(b, texto);
    if (titulo) b.title = titulo;
    b.addEventListener("click", fn);
    return b;
}

// Las migas de la pestaña: «‹ Entrenamientos · ‹ Mates», en una sola fila.
function entrenoMigas(body) {
    let nav = body.querySelector(":scope > .entreno-migas");
    if (!nav) {
        nav = document.createElement("div");
        nav.className = "entreno-migas flex flex-wrap items-center gap-x-3 gap-y-1 mb-2";
        body.prepend(nav);
    }
    return nav;
}
function entrenoVolver(body, texto, fn) {
    entrenoMigas(body).appendChild(tacticsBackBtn(texto, fn));
}

function pintarEntrenos() {
    const body = document.getElementById("entrenos-body");
    const tipos = document.getElementById("tipos-body");
    if (!body) return;
    if (!vistaPreviaEntrenos) vistaPreviaEntrenos = crearVistaPreviaLote("sesion_vista_previa_entrenos_v1");
    vistaPreviaEntrenos.reiniciar();
    body.replaceChildren();
    tipos.hidden = entrenosView.slug !== "tipos";
    const tarjetas = EntrenosClase.tarjetas(herramientasDelSitio(), ADAPTADORES_ENTRENO);
    if (!entrenosView.slug) { pintarCatalogoEntrenos(body, tarjetas); return; }
    const t = tarjetas.find((x) => x.slug === entrenosView.slug);
    if (!t) { entrenosView = { slug: null, grupo: null, mostrar: EntrenosClase.POR_PAGINA }; pintarCatalogoEntrenos(body, tarjetas); return; }
    entrenoVolver(body, "‹ Entrenamientos", () => { entrenosView = { slug: null, grupo: null, mostrar: EntrenosClase.POR_PAGINA }; pintarEntrenos(); });
    // Habilidades: la cascada de siempre (renderTiposView, en sesion.js), debajo.
    if (t.slug === "tipos") { ensureTiposLoaded(); return; }
    const tit = document.createElement("h3");
    tit.className = "font-semibold text-brand-800 dark:text-white text-sm";
    textoConEmojiMudo(tit, t.emoji + " " + t.label);
    const ad = ADAPTADORES_ENTRENO[t.slug];
    // Dentro de un grupo no se repite lo de arriba: el título del grupo basta.
    if (!entrenosView.grupo) {
        body.appendChild(tit);
        body.appendChild(cajaQueLoAbran(t, null));
    }
    if (!ad) {
        const p = document.createElement("p");
        p.className = "text-xs text-brand-450 dark:text-brand-350 mt-2";
        p.textContent = "Este entrenamiento se hace en su propia página (no usa el tablero de la clase): con «Que lo abran todos» a cada alumno le aparece el botón para abrirlo.";
        body.appendChild(p);
        return;
    }
    if (!entrenosView.grupo) {
        const desc = document.createElement("p");
        desc.className = "text-xs text-brand-450 dark:text-brand-350 mt-2";
        desc.textContent = ad.desc;
        body.appendChild(desc);
    }
    if (!entrenosDatos.has(t.slug)) {
        const p = ad.cargar();
        p.catch(() => entrenosDatos.delete(t.slug));
        entrenosDatos.set(t.slug, p);
    }
    const cargando = document.createElement("p");
    cargando.className = "text-sm text-brand-450 dark:text-brand-350 mt-2";
    cargando.textContent = "Cargando…";
    body.appendChild(cargando);
    const slug = t.slug, grupo = entrenosView.grupo;
    entrenosDatos.get(t.slug).then((grupos) => {
        if (entrenosView.slug !== slug || entrenosView.grupo !== grupo) return;
        cargando.remove();
        if (!grupo) pintarGruposEntreno(body, t, grupos);
        else pintarEjerciciosEntreno(body, t, grupos.find((g) => g.id === grupo));
    }).catch((e) => {
        console.error(e);
        cargando.textContent = "No se pudo cargar «" + t.label + "». Recarga la página e inténtalo de nuevo.";
    });
}

/* El catálogo, en dos partes para que no sea una sola lista larga: los que
   se dan con el tablero de la clase (tienen ejercicios) y los que se hacen en
   su propia página. */
function pintarCatalogoEntrenos(body, tarjetas) {
    const p = document.createElement("p");
    p.className = "text-xs text-brand-450 dark:text-brand-350 mb-2";
    p.textContent = "Elige uno: muestra la posición para explicarla, pregúntala a la clase y después que lo practiquen.";
    body.appendChild(p);
    const partes = [
        ["Con el tablero de la clase", tarjetas.filter((t) => t.conLista || t.slug === "tipos")],
        ["Se hacen en su página: que lo abran", tarjetas.filter((t) => !t.conLista && t.slug !== "tipos")],
    ];
    partes.forEach(([titulo, lista]) => {
        if (!lista.length) return;
        const h = document.createElement("h3");
        h.className = "text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300 mt-3 mb-1.5";
        h.textContent = titulo;
        body.appendChild(h);
        const grid = document.createElement("ul");
        grid.className = "grid grid-cols-2 gap-2";
        lista.forEach((t) => {
            const li = document.createElement("li");
            const b = document.createElement("button");
            b.type = "button";
            b.dataset.entreno = t.slug;
            b.className = "w-full h-full text-left px-3 py-2.5 rounded-lg bg-brand-50 hover:bg-brand-100 dark:bg-brand-800 dark:hover:bg-brand-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            const a = document.createElement("span");
            a.className = "block text-sm font-semibold text-brand-800 dark:text-white";
            textoConEmojiMudo(a, t.emoji + " " + t.label);
            b.appendChild(a);
            const d = ADAPTADORES_ENTRENO[t.slug];
            if (t.slug === "tipos" || d) {
                const c = document.createElement("span");
                c.className = "block text-xs text-brand-450 dark:text-brand-350 mt-0.5";
                c.textContent = t.slug === "tipos" ? "El Detective, el Barrido y 17 más" : d.corto || "";
                if (c.textContent) b.appendChild(c);
            }
            b.addEventListener("click", () => { entrenosView = { slug: t.slug, grupo: null, mostrar: EntrenosClase.POR_PAGINA }; pintarEntrenos(); });
            li.appendChild(b);
            grid.appendChild(li);
        });
        body.appendChild(grid);
    });
}

function pintarGruposEntreno(body, t, grupos) {
    const lista = document.createElement("div");
    lista.className = "space-y-1.5 mt-2";
    grupos.forEach((g) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.grupo = g.id;
        b.className = "w-full text-left text-sm px-3 py-2.5 rounded-lg bg-brand-50 hover:bg-brand-100 dark:bg-brand-800 dark:hover:bg-brand-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        const a = document.createElement("span");
        a.className = "font-semibold text-brand-800 dark:text-white";
        textoConEmojiMudo(a, (g.emoji ? g.emoji + " " : "") + g.titulo);
        const d = document.createElement("span");
        d.className = "block text-xs text-brand-450 dark:text-brand-350 mt-0.5";
        d.textContent = g.desc + " ›";
        b.append(a, d);
        b.addEventListener("click", () => { entrenosView = { slug: t.slug, grupo: g.id, mostrar: EntrenosClase.POR_PAGINA }; pintarEntrenos(); });
        lista.appendChild(b);
    });
    body.appendChild(lista);
}

function pintarEjerciciosEntreno(body, t, g) {
    if (!g) { entrenosView.grupo = null; pintarEntrenos(); return; }
    entrenoVolver(body, "‹ " + t.label, () => { entrenosView = { slug: t.slug, grupo: null, mostrar: EntrenosClase.POR_PAGINA }; pintarEntrenos(); });
    const tit = document.createElement("p");
    tit.className = "font-semibold text-brand-800 dark:text-white text-sm mt-2";
    textoConEmojiMudo(tit, t.emoji + " " + t.label + ": " + (g.emoji ? g.emoji + " " : "") + g.titulo);
    body.appendChild(tit);
    if (g.practica && g.practica.tanda) body.appendChild(cajaQueLoPractiquen(g.practica.tanda));
    const barra = document.createElement("div");
    barra.className = "flex items-center justify-between gap-2 mt-2";
    const cuenta = document.createElement("p");
    cuenta.className = "text-xs text-brand-450 dark:text-brand-350 min-w-0 truncate";
    cuenta.textContent = g.desc;
    barra.append(cuenta, vistaPreviaEntrenos.control());
    body.appendChild(barra);
    const ul = document.createElement("ul");
    ul.className = "space-y-2 mt-2 max-h-[28rem] overflow-y-auto pr-1";
    g.items.slice(0, entrenosView.mostrar).forEach((item) => ul.appendChild(filaDeEntreno(t, item)));
    body.appendChild(ul);
    if (g.items.length > entrenosView.mostrar) {
        const mas = entrenoBoton("Mostrar " + Math.min(EntrenosClase.POR_PAGINA, g.items.length - entrenosView.mostrar) + " más (de " + g.items.length + ")", () => {
            entrenosView.mostrar += EntrenosClase.POR_PAGINA;
            pintarEntrenos();
        });
        mas.classList.add("mt-2");
        body.appendChild(mas);
    }
}

/* Un ejercicio: su rótulo, la vista previa, y lo que se puede hacer con él. */
function filaDeEntreno(t, item) {
    const li = document.createElement("li");
    li.className = "bg-brand-50 dark:bg-brand-800 rounded-lg p-2.5";
    li.dataset.entrenoItem = item.id;
    const label = document.createElement("p");
    label.className = "text-sm font-semibold text-brand-700 dark:text-brand-200";
    label.textContent = item.titulo;
    li.appendChild(label);
    const acciones = document.createElement("div");
    acciones.className = "flex items-center flex-wrap gap-1.5 mt-2";
    const previa = entrenoBoton("👁 Vista previa", () => {});
    if (item.fen) acciones.appendChild(previa);
    if (item.foto) {
        const fb = entrenoBoton("📸 Mostrar " + item.foto + " s y ocultar", () => tiposFotografia({ fen: item.fen }, item.foto, fb), true,
            "La clase ve la posición y después las piezas desaparecen de todos los tableros");
        acciones.appendChild(fb);
    } else if (item.fen) {
        acciones.appendChild(entrenoBoton("📥 Al tablero", () => aplicarPosicionEnClase(item.fen,
            item.linea ? "Posición inicial en el tablero: juega la línea con la clase (la tienes en «Guion»)." : "Posición en el tablero de la clase: explícala."),
        true, "La posición le llega a todos, para explicarla"));
    }
    const fenPregunta = item.fenClave || item.fen;
    if (item.opciones && fenPregunta) {
        acciones.appendChild(entrenoBoton("❓ Preguntar", () => preguntarDeOpcionesEntreno(item), false, "Una pregunta de opciones: la base la califica sola"));
    } else if (item.solucion && fenPregunta) {
        acciones.appendChild(entrenoBoton("❓ Preguntar", () => preguntarEntreno(fenPregunta, item.solucion, item.prompt, item.elo), false, "Se transmite a todos como una pregunta nueva"));
        acciones.appendChild(entrenoBoton("🔥 Calentamiento", () => mandarCalentamiento(fenPregunta, item.solucion, (t.label + ": " + item.titulo).slice(0, 140)), false,
            "Cada alumno la juega en su propio tablero"));
    }
    if (item.final) {
        acciones.appendChild(entrenoBoton("🤖 Que lo jueguen contra la máquina", () => practicarFinalEntreno(item), false, "Cada alumno juega el final contra el motor"));
    }
    if (item.practica && item.practica.tanda) {
        acciones.appendChild(entrenoBoton("🎯 Practicar el tema", () => abrirPracticaDeFila(li, item.practica.tanda), false, "Un calentamiento con ejercicios de este tema"));
    } else if (item.practica && (item.practica.enlace || item.practica.enlaceDe)) {
        const slug = item.practica.enlaceDe || t.slug;
        const recorte = item.practica.enlaceDe ? item.practica.recorte : item.practica.enlace;
        acciones.appendChild(entrenoBoton("📲 Que la practiquen", () => pedirQueLoAbran(slug, recorte), false, "A cada alumno le aparece el botón para abrirla"));
    }
    if (item.guion && item.guion.length) {
        const g = entrenoBoton("🔎 Guion", () => {
            const abierta = caja.hidden;
            caja.hidden = !abierta;
            g.setAttribute("aria-expanded", String(abierta));
        }, false, "Solo lo ves tú: la respuesta y cómo explicarlo");
        g.setAttribute("aria-expanded", "false");
        acciones.appendChild(g);
    }
    li.appendChild(acciones);
    const caja = document.createElement("div");
    caja.hidden = true;
    caja.className = "text-xs text-brand-700 dark:text-brand-200 bg-white dark:bg-brand-900 rounded-lg p-2 mt-2 space-y-1";
    (item.guion || []).forEach((x) => { const p = document.createElement("p"); p.textContent = x; caja.appendChild(p); });
    li.appendChild(caja);
    if (item.fen) {
        const wrap = document.createElement("div");
        wrap.className = "hidden mt-2";
        li.appendChild(wrap);
        vistaPreviaEntrenos.registrar(wrap, previa, (w) => renderTacticsPreviewBoard(w, item.fen));
    }
    return li;
}

async function preguntarEntreno(fen, solucion, prompt, dificultad) {
    if (!(await aplicarPosicionEnClase(fen))) return;
    const plies = EntrenosClase.pliesDe(solucion);
    document.getElementById("question-plies-input").value = plies;
    const { data, error } = await crearPregunta(fen, plies, null, false, { prompt: prompt ? String(prompt).slice(0, 500) : undefined, dificultad });
    if (error) { console.error(error); setStatus("No se pudo crear la pregunta: " + error.message); return; }
    activateTeacherTab("preguntar");
    setStatus("Ejercicio enviado a la clase como pregunta.");
    computeEngineAnswer(data.id, fen, plies);
}

async function preguntarDeOpcionesEntreno(item) {
    if (!(await aplicarPosicionEnClase(item.fen))) return;
    const q = await crearPreguntaDeOpciones(item.prompt, item.opciones, item.correcta, item.elo);
    if (q) activateTeacherTab("preguntar");
}

async function practicarFinalEntreno(item) {
    if (!(await aplicarPosicionEnClase(item.fen))) return;
    if (typeof PracticeEngine !== "undefined") PracticeEngine.preload();
    // Nivel máximo: el motor defiende (o ataca) lo mejor posible, como en Finales contra la máquina.
    const { error } = await crearPractica(item.fen, "max");
    if (error) { console.error(error); setStatus("No se pudo iniciar la práctica: " + error.message); return; }
    activateTeacherTab("practicar");
    setStatus("🤖 Cada alumno juega «" + item.titulo + "» contra la máquina.");
}

/* «Que lo practiquen»: el calentamiento de js/clase-tanda.js con los
   ejercicios de este grupo, con nota o en competencia. */
function cajaQueLoPractiquen(tanda) {
    const caja = document.createElement("div");
    caja.className = "mt-2 rounded-lg border border-accent-500 bg-accent-50 dark:bg-brand-800 p-2.5";
    const p = document.createElement("p");
    p.className = "text-xs font-semibold text-brand-800 dark:text-white";
    textoConEmojiMudo(p, "🎯 Que lo practiquen: «" + tanda.titulo + "»");
    caja.appendChild(p);
    const fila = document.createElement("div");
    fila.className = "flex flex-wrap items-center gap-2 mt-1.5";
    const id = "entreno-practica-" + Math.random().toString(36).slice(2, 8);
    const modo = document.createElement("select");
    modo.id = id + "-modo";
    modo.className = "text-xs bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1.5 text-brand-700 dark:text-brand-200";
    [["nota", "Con nota: distintos para cada uno"], ["reto", "Competencia: los mismos para todos"]].forEach(([v, txt]) => {
        const o = document.createElement("option"); o.value = v; o.textContent = txt; modo.appendChild(o);
    });
    const lm = document.createElement("label"); lm.htmlFor = modo.id; lm.className = "text-xs text-brand-700 dark:text-brand-200"; lm.textContent = "Modo";
    const min = document.createElement("input");
    min.id = id + "-min"; min.type = "number"; min.min = "1"; min.max = "60"; min.step = "1"; min.value = "5"; min.inputMode = "numeric";
    min.className = "w-16 text-xs bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1 text-brand-700 dark:text-brand-200 focus:outline-none focus:ring-2 focus:ring-accent-500";
    const lmin = document.createElement("label"); lmin.htmlFor = min.id; lmin.className = "text-xs text-brand-700 dark:text-brand-200"; lmin.textContent = "Tiempo (minutos)";
    const ir = entrenoBoton("🔥 Mandar", async () => {
        const minutos = Number(min.value);
        if (!minutosValidos(minutos)) { min.focus(); return; }
        await mandarTandaCon({ banco: tanda.banco, filtro: tanda.filtro, titulo: tanda.titulo, reto: modo.value === "reto", minutos });
    }, true, "Cada alumno los resuelve en su tablero, debajo del de la clase");
    ir.dataset.practicar = "1";
    fila.append(lm, modo, lmin, min, ir);
    caja.appendChild(fila);
    return caja;
}

function abrirPracticaDeFila(li, tanda) {
    const ya = li.querySelector(".entreno-practica-fila");
    if (ya) { ya.remove(); return; }
    const caja = cajaQueLoPractiquen(tanda);
    caja.classList.add("entreno-practica-fila");
    li.appendChild(caja);
    const sel = caja.querySelector("select");
    if (sel) sel.focus();
}

/* «📲 Que lo abran todos»: a cada alumno le aparece el botón para abrir ese
   entrenamiento (en otra pestaña: la clase sigue abierta). Va en la presencia
   del profe, como la Fotografía: quien entra o recarga lo ve igual. */
function cajaQueLoAbran(t, recorte) {
    const fila = document.createElement("div");
    fila.className = "flex flex-wrap items-center gap-1.5 mt-2";
    fila.appendChild(entrenoBoton("📲 Que lo abran todos", () => pedirQueLoAbran(t.slug, recorte), !ADAPTADORES_ENTRENO[t.slug],
        "A cada alumno le aparece el botón para abrir «" + t.label + "»"));
    const a = document.createElement("a");
    a.href = t.href;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "text-xs font-semibold text-accent-700 dark:text-accent-400 underline";
    a.textContent = "Abrirlo tú (otra pestaña)";
    fila.appendChild(a);
    return fila;
}

function pedirQueLoAbran(slug, recorte) {
    const e = EntrenosClase.enlaceDe(herramientasDelSitio(), slug, recorte);
    if (!e) return;
    entrenoEnCurso = { slug, recorte: recorte || null, at: new Date().toISOString() };
    if (presenceChannel && presenceChannel.track) presenceChannel.track(metaDePresencia()).catch((err) => console.error(err));
    pintarEntrenoPedido();
    setStatus("📲 A tus alumnos les aparece el botón para abrir «" + e.label + "».");
}

function dejarDePedirloAbrir() {
    entrenoEnCurso = null;
    if (presenceChannel && presenceChannel.track) presenceChannel.track(metaDePresencia()).catch((err) => console.error(err));
    pintarEntrenoPedido();
}

// Profe: lo que está pidiendo, con su botón para dejar de pedirlo.
function pintarEntrenoPedido() {
    const caja = document.getElementById("entreno-pedido");
    if (!caja) return;
    const e = entrenoEnCurso && EntrenosClase.enlaceDe(herramientasDelSitio(), entrenoEnCurso.slug, entrenoEnCurso.recorte);
    caja.hidden = !e;
    if (e) document.getElementById("entreno-pedido-texto").textContent = "Tus alumnos ven el botón para abrir «" + e.label + "».";
}

/* Alumno: lo que pidió el profe, sacado de su presencia. El enlace sale de la
   lista del sitio (EntrenosClase.enlaceDe), nunca de lo que viene escrito. */
function pintarEntrenoDelProfe(state) {
    const caja = document.getElementById("entreno-aviso");
    if (!caja || isTeacher) return;
    // Solo lo que anuncia el dueño del tablero (el profe de esta clase).
    const pedido = ((state || {})[boardOwnerId] || []).map((x) => x && x.entreno).find((x) => x && x.slug && x.at) || null;
    const e = pedido && EntrenosClase.enlaceDe(herramientasDelSitio(), pedido.slug, pedido.recorte);
    const nuevo = e && entrenoVisto !== pedido.at;
    caja.hidden = !nuevo;
    if (!nuevo) return;
    caja.dataset.at = pedido.at;
    document.getElementById("entreno-aviso-texto").textContent = "Tu profe te pide abrir «" + e.label + "».";
    const a = document.getElementById("entreno-aviso-abrir");
    a.href = e.href;
    a.textContent = "Abrir «" + e.label + "» (otra pestaña)";
    anunciarALaClase("entreno", pedido.at, "Tu profe te pide abrir " + e.label + ". El botón está debajo del tablero.");
}

if (document.getElementById("entreno-aviso-cerrar")) {
    document.getElementById("entreno-aviso-cerrar").addEventListener("click", () => {
        const caja = document.getElementById("entreno-aviso");
        entrenoVisto = caja.dataset.at || null;
        caja.hidden = true;
    });
}
if (document.getElementById("entreno-pedido-quitar")) {
    document.getElementById("entreno-pedido-quitar").addEventListener("click", dejarDePedirloAbrir);
}
