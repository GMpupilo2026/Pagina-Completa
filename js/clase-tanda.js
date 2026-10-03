/* El código de sesion.html.

   El calentamiento de 20 ejercicios (game_state.tanda_calentamiento). El
   profe elige el nivel y el tiempo; cada alumno recibe SUS 20 ejercicios de
   Táctica, distintos a los de los demás pero del mismo nivel, y los resuelve
   en su propio tablero. Si falla, pasa al siguiente. Al terminar (o al
   acabarse el tiempo) ve su nota. El profe ve cuántos lleva cada uno y puede
   mirar el ejercicio en que está. Ver «El calentamiento de 20 ejercicios» en
   docs/decisiones/clase-en-vivo.md.

   La competencia (modo "reto"): los MISMOS ejercicios para todos, variados y
   de más fácil a más difícil, y gana quien resuelva más en el tiempo. Ver
   «La competencia de ejercicios». En los dos modos el profe cambia el tiempo
   mientras corre (y puede dar más cuando ya se acabó).

   Como las demás partes de la clase (ver «sesion.js en partes»), es un script
   clásico cargado ANTES que sesion.js: usa lo de sesion.js (sb, profile,
   isTeacher, myGameStateId, onlineStudents, presenceChannel, setStatus…)
   solo dentro de funciones. La parte que no toca la página (TandaCalentamiento)
   es pura, para poder probarla sola. */

window.TandaCalentamiento = (function () {
    const CANTIDAD = 20;
    // El nivel: la fuerza en puntos Elo alrededor de la cual se eligen los ejercicios.
    const NIVELES = [
        { elo: 600, nombre: "Inicial" }, { elo: 800, nombre: "Principiante" },
        { elo: 1000, nombre: "Básico" }, { elo: 1200, nombre: "Intermedio bajo" },
        { elo: 1400, nombre: "Intermedio" }, { elo: 1600, nombre: "Intermedio alto" },
        { elo: 1800, nombre: "Avanzado" }, { elo: 2000, nombre: "Fuerte" }, { elo: 2200, nombre: "Experto" },
    ];
    // El tiempo lo escribe el profe: de 1 a 60 minutos al mandarlo, y hasta 2 horas en total si lo alarga.
    const MINUTOS_MIN = 1, MINUTOS_MAX = 60, SEGUNDOS_MAX = 7200;
    // En la competencia: más de los que alguien alcanza a hacer (18 segundos cada uno en 30 minutos).
    const CANTIDAD_RETO = 100;
    // Cuántos ejercicios tiene que tener la banda del nivel para que a cada alumno le toquen otros.
    const BANDA_MINIMA = 300;

    // FNV-1a de 32 bits y mulberry32: el mismo azar en la computadora del alumno y en la del profe.
    function hash(texto) {
        let h = 0x811c9dc5;
        for (const c of String(texto)) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
        return h >>> 0;
    }
    function azarDesde(semilla) {
        let a = hash(semilla);
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* Los ejercicios del nivel: los que tienen su rating a ±100 del pedido, y
       si no alcanzan (menos de 300: 15 por tramo), se abre de 50 en 50 hasta ±300. Sin rating no hay nivel:
       esos quedan fuera. Ordenados por rating (y por id en el empate), para que
       el profe y cada alumno armen exactamente la misma lista. */
    function banda(puzzles, elo) {
        const todos = Object.keys(puzzles || {}).filter((id) => {
            const p = puzzles[id];
            return p && typeof p.rating === "number" && p.fen && Array.isArray(p.solution) && p.solution.length;
        });
        let radio = 100, lista = [];
        for (; radio <= 300; radio += 50) {
            lista = todos.filter((id) => Math.abs(puzzles[id].rating - elo) <= radio);
            if (lista.length >= BANDA_MINIMA) break;
        }
        return lista.sort((a, b) => puzzles[a].rating - puzzles[b].rating || (a < b ? -1 : a > b ? 1 : 0));
    }

    /* Un ejercicio se puede usar si su solución se reproduce entera con
       chess.js y termina con una jugada del alumno (no con una del rival). La
       solución queda en UCI, que no depende de cómo se escriba. */
    function preparar(p) {
        if (!p || typeof Chess === "undefined") return null;
        let g = null;
        try { g = new Chess(p.fen); } catch (e) { return null; }
        if (!g || g.fen().split(" ")[0] !== String(p.fen).split(" ")[0]) return null;
        const uci = [];
        for (const san of p.solution || []) {
            let m = null;
            try { m = g.move(san, { sloppy: true }); } catch (e) { m = null; }
            if (!m) return null;
            uci.push(m.from + m.to + (m.promotion || ""));
        }
        if (!uci.length || uci.length % 2 === 0) return null;
        return { fen: p.fen, uci, rating: p.rating };
    }

    /* La tanda de un alumno: la banda partida en `cantidad` tramos seguidos (de
       más fácil a más difícil), y de cada tramo uno. Así todos tienen el mismo
       nivel —uno de cada tramo— y a cada uno le toca otro: el profe manda en
       `alumnos` a los conectados, y al k-ésimo le toca el ejercicio k lugares
       después del punto de partida del tramo (que sale de la semilla). Mientras
       la clase no tenga más alumnos que ejercicios un tramo, no se repite
       ninguno. Quien entra después (no está en la lista) cae en un lugar al
       azar con su id: a él sí le puede coincidir alguno. Si el que toca no se
       reproduce, va el siguiente del mismo tramo. */
    function paraAlumno(puzzles, tanda, alumnoId) {
        if (tanda.modo === "reto") return paraTodos(puzzles, tanda);
        const lista = banda(puzzles, tanda.elo);
        const n = Math.min(tanda.cantidad || CANTIDAD, lista.length);
        const comun = azarDesde(tanda.semilla);
        const propio = azarDesde(tanda.semilla + ":" + alumnoId);
        const k = Array.isArray(tanda.alumnos) ? tanda.alumnos.indexOf(alumnoId) : -1;
        const out = [];
        const usados = new Set();
        for (let t = 0; t < n; t++) {
            const desde = Math.floor(t * lista.length / n), hasta = Math.floor((t + 1) * lista.length / n);
            const tramo = lista.slice(desde, hasta);
            const base = Math.floor(comun() * tramo.length);
            const suyo = Math.floor(propio() * tramo.length);
            const inicio = k >= 0 ? base + k : suyo;
            for (let j = 0; j < tramo.length; j++) {
                const id = tramo[(inicio + j) % tramo.length];
                const p = preparar(puzzles[id]);
                if (!p || usados.has(p.fen)) continue;
                usados.add(p.fen);
                out.push(Object.assign({ id }, p));
                break;
            }
        }
        return out;
    }

    /* La competencia: los MISMOS para todos (no depende del alumno). La banda
       se baraja con la semilla —así salen variados: de temas distintos— y de
       ahí se toman `cantidad`, ordenados de más fácil a más difícil, como en
       una carrera de ejercicios: todos empiezan por los mismos fáciles. */
    function paraTodos(puzzles, tanda) {
        const lista = banda(puzzles, tanda.elo);
        const azar = azarDesde(tanda.semilla);
        for (let i = lista.length - 1; i > 0; i--) {
            const j = Math.floor(azar() * (i + 1));
            [lista[i], lista[j]] = [lista[j], lista[i]];
        }
        const n = tanda.cantidad || CANTIDAD_RETO;
        const out = [];
        const usados = new Set();
        for (const id of lista) {
            if (out.length >= n) break;
            const p = preparar(puzzles[id]);
            if (!p || usados.has(p.fen)) continue;
            usados.add(p.fen);
            out.push(Object.assign({ id }, p));
        }
        return out.sort((a, b) => a.rating - b.rating || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }

    /* El puesto de cada uno en la competencia, por resueltos. Los empatados
       comparten puesto (como en el podio): nadie queda segundo por el orden
       alfabético. Devuelve id → puesto. */
    function puestos(filas) {
        const orden = (filas || []).slice().sort((a, b) => (b.buenas || 0) - (a.buenas || 0));
        const out = new Map();
        let puesto = 0, anterior = null;
        orden.forEach((f, i) => {
            if ((f.buenas || 0) !== anterior) { puesto = i + 1; anterior = f.buenas || 0; }
            out.set(f.id, puesto);
        });
        return out;
    }

    /* Revisa la jugada `uci` del alumno en el paso `paso` (0, 2, 4…: las suyas).
       Vale la de la solución o cualquiera que dé mate: los ejercicios de
       Lichess tienen UNA sola jugada buena en cada paso, salvo el mate final,
       que puede darse de más de una forma. */
    function revisar(ej, paso, uci) {
        const g = new Chess(ej.fen);
        for (let i = 0; i < paso; i++) {
            const u = ej.uci[i];
            g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
        }
        let m = null;
        try { m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined }); } catch (e) { m = null; }
        if (!m) return { bien: false, fin: false };
        if (g.in_checkmate()) return { bien: true, fin: true };
        if ((m.from + m.to + (m.promotion || "")) !== ej.uci[paso]) return { bien: false, fin: false };
        return { bien: true, fin: paso + 1 >= ej.uci.length };
    }

    // La nota, de 0 a 100 como en el colegio: los que no llegó a hacer cuentan como no resueltos.
    function nota(buenas, total) {
        return total ? Math.round((buenas || 0) * 100 / total) : 0;
    }

    // Segundos que quedan (con la hora del servidor si se pasa `ahora`).
    function quedan(tanda, ahora) {
        if (!tanda || !tanda.at) return 0;
        const fin = new Date(tanda.at).getTime() + (tanda.segundos || 0) * 1000;
        return Math.max(0, Math.ceil((fin - (ahora == null ? Date.now() : ahora)) / 1000));
    }

    /* El profe cambia el tiempo. Lo que se guarda es `segundos` desde el
       arranque (`at` no se mueve: lo cuida la base), así que «que queden 3
       minutos» es lo que ya pasó más 3 minutos. Al sumar con el tiempo ya
       acabado, se suma desde ahora; al restar, no se corta antes de ahora. */
    function segundosParaQueQueden(tanda, ahora, quedanSeg) {
        const pasaron = Math.max(0, Math.floor((ahora - new Date(tanda.at).getTime()) / 1000));
        return Math.max(0, Math.min(SEGUNDOS_MAX, pasaron + Math.max(0, Math.round(quedanSeg))));
    }
    function segundosSumando(tanda, ahora, delta) {
        const pasaron = Math.max(0, Math.floor((ahora - new Date(tanda.at).getTime()) / 1000));
        const s = tanda.segundos || 0;
        const nuevo = delta > 0 ? Math.max(s, pasaron) + delta : Math.max(Math.min(s, pasaron), s + delta);
        return Math.max(0, Math.min(SEGUNDOS_MAX, nuevo));
    }

    /* De qué banco salen los ejercicios (`banco` en la receta; sin él, Táctica)
       y qué parte de él (`filtro`): así la pestaña Entrenamientos manda a
       practicar un tema, una categoría de Mates, un nivel de Visualización o
       los Desafíos con el mismo calentamiento. Todo queda en la forma de
       temas.json —{id: {fen, solution (SAN), rating}}— para que banda(),
       paraAlumno() y revisar() no cambien. Los que no traen rating llevan uno
       fijo (el centro de su categoría): sin eso no entrarían en ninguna banda. */
    const BANCOS = {
        temas: { url: "entreno/data/temas.json", nombre: "Táctica" },
        mates: { url: "entreno/data/mates.json", nombre: "Mates" },
        desafios: { url: "entreno/data/desafios.json", nombre: "Desafíos" },
    };
    // Los niveles de Visualización: cuántas jugadas tiene la solución (js/entreno-visualizacion.js).
    const LARGOS = { l1: [3, 3], l2: [5, 5], l3: [7, 7], l4: [9, 9], l5: [11, 99] };
    const CENTRO_DESAFIOS = 1100;

    // Un rey de cada color: sin eso la posición no va al tablero de la clase ni la juega chess.js.
    function tieneLosDosReyes(fen) {
        const tablero = String(fen || "").split(" ")[0];
        return (tablero.match(/K/g) || []).length === 1 && (tablero.match(/k/g) || []).length === 1;
    }

    function normalizar(banco, datos, extra) {
        if (!banco || banco === "temas") return (datos && datos.puzzles) || {};
        const out = {};
        if (banco === "mates") {
            const dif = extra || {};
            (Array.isArray(datos) ? datos : []).forEach((m) => {
                const centro = dif.categorias && dif.categorias[m.category] ? dif.categorias[m.category].centro : 1200;
                out[m.id] = { fen: m.fen, solution: m.solution, rating: (dif.elo && dif.elo[m.id]) || centro, cat: m.category };
            });
        } else if (banco === "desafios") {
            ((datos && datos.challenges) || []).forEach((d) => {
                if (!tieneLosDosReyes(d.fen) || !d.solution || !Array.isArray(d.solution.san)) return;
                out["desafio-" + d.n] = { fen: d.fen, solution: d.solution.san, rating: CENTRO_DESAFIOS, cat: d.cat };
            });
        }
        return out;
    }

    /* La parte del banco: "tema:fork" (los ids de ese tema en temas.json),
       "cat:mate2" (la categoría) o "largo:l3" (el largo de la solución). */
    function filtrar(puzzles, filtro, temasIndice) {
        if (!filtro) return puzzles;
        const [tipo, valor] = String(filtro).split(":");
        const out = {};
        if (tipo === "tema") {
            ((temasIndice || {})[valor] || []).forEach((id) => { if (puzzles[id]) out[id] = puzzles[id]; });
            return out;
        }
        Object.keys(puzzles).forEach((id) => {
            const p = puzzles[id];
            if (tipo === "cat" && p.cat === valor) out[id] = p;
            if (tipo === "largo" && LARGOS[valor] && p.solution && p.solution.length >= LARGOS[valor][0] && p.solution.length <= LARGOS[valor][1]) out[id] = p;
        });
        return out;
    }

    // El nivel de una parte del banco: la mediana de sus ratings (para que la banda caiga sobre ella).
    function eloDe(puzzles) {
        const r = Object.values(puzzles || {}).map((p) => p.rating).filter((x) => typeof x === "number").sort((a, b) => a - b);
        if (!r.length) return 1200;
        return Math.max(400, Math.min(3000, Math.round(r[Math.floor(r.length / 2)])));
    }

    function nombreDeNivel(elo) {
        const n = NIVELES.find((x) => x.elo === elo);
        return (n ? n.nombre + ", " : "") + "alrededor de " + elo + " puntos Elo";
    }

    function semillaNueva() {
        const a = new Uint32Array(2);
        (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : (a[0] = Math.random() * 4294967296, a[1] = Date.now());
        return a[0].toString(36) + a[1].toString(36);
    }

    return { BANCOS, LARGOS, tieneLosDosReyes, normalizar, filtrar, eloDe, CANTIDAD, CANTIDAD_RETO, NIVELES, MINUTOS_MIN, MINUTOS_MAX, SEGUNDOS_MAX, BANDA_MINIMA, hash, azarDesde, banda, preparar, paraAlumno, paraTodos,
        puestos, revisar, nota, quedan, segundosParaQueQueden, segundosSumando, nombreDeNivel, semillaNueva };
})();

let tandaActual = null;        // la de game_state: {at, semilla, elo, cantidad, segundos, modo}
let tandaBanco = null;         // los ejercicios de la tanda en curso, ya filtrados ({id: {fen, solution, rating}})
const tandaBancos = new Map(); // "banco|filtro" → promesa de esos ejercicios
let tandaMia = null;           // alumno: {at, ejercicios, i, paso, resultados: [true|false…], fin, porTiempo}
let tandaPresencia = null;     // lo que el alumno anuncia en la presencia: {at, hechos, buenas, i, fin}
let tandaBoard = null;
let tandaAcc = null;
let tandaEsperando = null;     // el setTimeout entre un ejercicio y el siguiente
const tandaVistos = new Map(); // profe: id → {nombre, hechos, buenas, i, fin, conectado}, de esta tanda
let tandaVistosDe = null;
let tandaMirando = null;       // profe: el alumno cuyo ejercicio está mirando
let tandaProfeBoard = null;
let tandaFinDicho = null;
const tandasRehechas = new Map(); // profe: "semilla:alumno" → su tanda, ya armada

// La competencia (los mismos para todos, gana quien resuelva más) o la de siempre, con nota.
const tandaEsReto = () => !!(tandaActual && tandaActual.modo === "reto");
const resueltosEnTexto = (n) => n + (n === 1 ? " resuelto" : " resueltos");

function relojDeLaTanda() {
    return window.RelojServidor ? RelojServidor.ahora() : Date.now();
}

const bajarJson = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });

/* Los ejercicios de una receta (su banco y su filtro), los mismos en la
   computadora del profe y en la de cada alumno. Sin `banco`, Táctica (temas.json). */
function cargarBancoDeLaTanda(t) {
    const banco = (t && t.banco) || "temas", filtro = (t && t.filtro) || "";
    const clave = banco + "|" + filtro;
    if (!tandaBancos.has(clave)) {
        let datos;
        if (banco === "temas") {
            datos = typeof tacticsData !== "undefined" && tacticsData && tacticsData.puzzles
                ? Promise.resolve([tacticsData, null]) : bajarJson(TandaCalentamiento.BANCOS.temas.url).then((d) => [d, null]);
        } else if (banco === "mates") {
            datos = Promise.all([bajarJson(TandaCalentamiento.BANCOS.mates.url), bajarJson("entreno/data/mates-dificultad.json").catch(() => null)]);
        } else if (TandaCalentamiento.BANCOS[banco]) {
            datos = bajarJson(TandaCalentamiento.BANCOS[banco].url).then((d) => [d, null]);
        } else datos = Promise.reject(new Error("Banco desconocido: " + banco));
        const p = datos.then(([d, extra]) => {
            const todos = TandaCalentamiento.normalizar(banco, d, extra);
            return TandaCalentamiento.filtrar(todos, filtro, banco === "temas" ? d.themes : null);
        });
        p.catch(() => tandaBancos.delete(clave));
        tandaBancos.set(clave, p);
    }
    return tandaBancos.get(clave).then((b) => { tandaBanco = b; return b; });
}

const claveDeLaTanda = (t) => "clase_tanda_v1:" + myGameStateId + ":" + t.at + ":" + t.semilla;

function guardarTandaMia() {
    if (!tandaMia) return;
    try { localStorage.setItem(tandaMia.clave, JSON.stringify({ i: tandaMia.i, resultados: tandaMia.resultados, fin: tandaMia.fin, porTiempo: !!tandaMia.porTiempo })); } catch (e) {}
}

/* Si terminó porque se acabó el tiempo (no porque hizo todos) y el profe
   dio más, sigue donde iba. Devuelve si volvió a abrir. */
function reabrirTandaSiHayTiempo() {
    if (!tandaMia || !tandaMia.fin || !tandaMia.porTiempo || !tandaActual) return false;
    if (tandaMia.i >= tandaMia.ejercicios.length || TandaCalentamiento.quedan(tandaActual, relojDeLaTanda()) <= 0) return false;
    tandaMia.fin = false;
    tandaMia.porTiempo = false;
    tandaFinDicho = null;
    guardarTandaMia();
    anunciarTanda();
    return true;
}

// Alumno, en la competencia: su puesto entre los que están conectados, por resueltos.
function puestoMioEnLaTanda() {
    if (!tandaActual || !tandaMia) return null;
    const filas = [{ id: profile.id, buenas: tandaMia.resultados.filter(Boolean).length }];
    for (const [id, s] of onlineStudents.entries()) {
        if (id !== profile.id && s.tanda && s.tanda.at === tandaActual.at) filas.push({ id, buenas: s.tanda.buenas || 0 });
    }
    return { puesto: TandaCalentamiento.puestos(filas).get(profile.id), de: filas.length };
}

/* Al empezar la tanda, al acabarse el tiempo o al quitarla el profe, los 30
   alumnos anunciarían en el MISMO segundo, y cada anuncio le llega a todos los
   conectados: unos 900 mensajes de golpe, por encima de los 500 por segundo
   que Realtime deja en el plan Pro (pasado el tope corta a todo el proyecto).
   Cada alumno espera un rato al azar (0,3-4 s) y manda lo último que tenga:
   varios cambios seguidos salen en un solo anuncio. */
let tandaAnuncioPendiente = null;
function anunciarTanda() {
    if (tandaAnuncioPendiente) return;
    tandaAnuncioPendiente = setTimeout(() => {
        tandaAnuncioPendiente = null;
        enviarAnuncioDeTanda().catch((e) => console.error(e));
    }, 300 + Math.random() * 3700);
}

async function enviarAnuncioDeTanda() {
    const buenas = tandaMia ? tandaMia.resultados.filter(Boolean).length : 0;
    const nuevo = tandaMia ? { at: tandaMia.at, hechos: tandaMia.resultados.length, buenas, i: tandaMia.i, fin: !!tandaMia.fin } : null;
    if (JSON.stringify(nuevo) === JSON.stringify(tandaPresencia)) return;
    tandaPresencia = nuevo;
    if (presenceChannel && !vistaPrevia) await presenceChannel.track(metaDePresencia());
}

/* ---------- Lo que llega de game_state ---------- */
function pintarTanda(t) {
    const antes = tandaActual;
    tandaActual = t && t.at && t.semilla ? t : null;
    const caja = document.getElementById("tanda-caja");
    if (!caja) return;
    caja.hidden = !tandaActual;
    document.getElementById("tanda-profe").hidden = !isTeacher;
    document.getElementById("tanda-alumno").hidden = isTeacher || esObservador;
    if (!tandaActual) {
        clearTimeout(tandaEsperando);
        tandaMia = null;
        tandaVistos.clear();
        tandaVistosDe = null;
        tandaMirando = null;
        if (tandaPresencia) anunciarTanda();
        pintarBotonTanda();
        return;
    }
    const misma = antes && antes.semilla === tandaActual.semilla;
    if (window.RelojServidor && !misma) RelojServidor.iniciar(sb);
    anunciarALaClase("tanda", tandaActual.at + ":" + tandaActual.semilla, tandaEsReto()
        ? "Tu profe empezó una competencia de ejercicios, con " + PreguntaClase.textoDeTiempo(tandaActual.segundos) + ": los mismos para todos, y gana quien resuelva más. Resuélvelos en tu tablero, debajo del de la clase."
        : "Tu profe mandó un calentamiento de " + tandaActual.cantidad + " ejercicios, con " + PreguntaClase.textoDeTiempo(tandaActual.segundos) + ". Resuélvelos en tu tablero, debajo del de la clase.");
    // El profe cambió el tiempo (la misma tanda, otro plazo).
    if (misma && antes.segundos !== tandaActual.segundos) {
        const q = TandaCalentamiento.quedan(tandaActual, relojDeLaTanda());
        if (q > 0) anunciarALaClase("tanda-tiempo", tandaActual.semilla + ":" + tandaActual.segundos, "Tu profe cambió el tiempo: quedan " + PreguntaClase.textoDeTiempo(q) + ".");
    }
    textoConEmojiMudo(document.getElementById("tanda-titulo"), (tandaEsReto() ? "🏁 Competencia de ejercicios" : "🔥 Calentamiento")
        + (tandaActual.titulo ? ": " + tandaActual.titulo : ""));
    pintarBotonTanda();
    if (isTeacher) {
        if (tandaVistosDe !== tandaActual.semilla) { tandaVistos.clear(); tandaVistosDe = tandaActual.semilla; tandaMirando = null; }
        anotarTandaDeLaPresencia();
        pintarTandaProfe();
        return;
    }
    if (esObservador) return;
    if (tandaMia && tandaMia.semilla === tandaActual.semilla) { pintarTandaAlumno(reabrirTandaSiHayTiempo()); return; }
    if (antes && antes.semilla === tandaActual.semilla && tandaMia) return;
    empezarTandaMia();
}

async function empezarTandaMia() {
    const t = tandaActual;
    clearTimeout(tandaEsperando);
    tandaMia = null;
    const msg = document.getElementById("tanda-msg");
    document.getElementById("tanda-estado").textContent = "Preparando tus ejercicios…";
    msg.textContent = "";
    let banco = null;
    try { banco = await cargarBancoDeLaTanda(t); } catch (e) {
        console.error(e);
        document.getElementById("tanda-estado").textContent = "No se pudieron cargar los ejercicios. Recarga la página.";
        return;
    }
    if (tandaActual !== t) return;
    const ejercicios = TandaCalentamiento.paraAlumno(banco, t, profile.id);
    tandaMia = { at: t.at, semilla: t.semilla, clave: claveDeLaTanda(t), ejercicios, i: 0, paso: 0, resultados: [], fin: false };
    // Al recargar sigue donde iba: lo hecho no se vuelve a hacer (ni se borra una que falló).
    try {
        const g = JSON.parse(localStorage.getItem(tandaMia.clave) || "null");
        if (g && Array.isArray(g.resultados)) {
            tandaMia.resultados = g.resultados.slice(0, ejercicios.length).map(Boolean);
            tandaMia.i = tandaMia.resultados.length;
            tandaMia.fin = !!g.fin;
            tandaMia.porTiempo = !!g.porTiempo;
        }
    } catch (e) {}
    if (tandaMia.i >= ejercicios.length) tandaMia.fin = true;
    reabrirTandaSiHayTiempo();
    pintarTandaAlumno(true);
    anunciarTanda();
}

/* ---------- El alumno ---------- */
function tableroDeLaTanda() {
    if (tandaBoard) return tandaBoard;
    tandaBoard = new ClasesBoard(document.getElementById("tanda-tablero"), {
        interactive: true, allowArrows: false, externalCoords: true,
        onMove: () => juzgarTanda(),
    });
    tandaAcc = window.ClaseAdaptada ? ClaseAdaptada.montar(document.getElementById("tanda-cmd"), () => tandaBoard, {
        etiqueta: "Escribe tu jugada del ejercicio",
        porQueNoPuedes: () => tandaMia && tandaMia.fin ? "El calentamiento terminó." : "Espera: viene el siguiente ejercicio.",
    }) : null;
    return tandaBoard;
}

function pintarTandaAlumno(nuevo) {
    if (!tandaMia || !tandaActual) return;
    const total = tandaMia.ejercicios.length;
    const buenas = tandaMia.resultados.filter(Boolean).length;
    const juego = document.getElementById("tanda-juego");
    const final = document.getElementById("tanda-final");
    if (!tandaMia.fin && TandaCalentamiento.quedan(tandaActual, relojDeLaTanda()) <= 0) terminarTandaMia();
    pintarRelojDeLaTanda();
    if (tandaMia.fin) {
        juego.hidden = true;
        final.hidden = false;
        // Quien llega cuando ya terminó no hizo ninguno: no es un 0, es que no estuvo.
        const noEstuvo = !tandaMia.resultados.length;
        document.getElementById("tanda-nota").hidden = noEstuvo;
        document.getElementById("tanda-detalle").hidden = noEstuvo;
        const reto = tandaEsReto();
        const se = noEstuvo ? (reto ? "⏱️ Esta competencia ya terminó." : "⏱️ Este calentamiento ya terminó.")
            : tandaMia.resultados.length < total ? "⏱️ Se acabó el tiempo."
                : reto ? "🏁 ¡Hiciste todos los ejercicios!" : "🏁 ¡Terminaste el calentamiento!";
        textoConEmojiMudo(document.getElementById("tanda-final-titulo"), se);
        let resultado;
        if (reto) {
            // En la competencia no hay nota: cuenta cuántos resolvió, y su puesto.
            const p = puestoMioEnLaTanda();
            resultado = "Resolviste " + buenas + (buenas === 1 ? " ejercicio." : " ejercicios.");
            document.getElementById("tanda-nota").textContent = "Resolviste " + buenas;
            document.getElementById("tanda-detalle").textContent = p && p.de > 1 ? "Quedaste en el " + p.puesto + ".º lugar de " + p.de + "." : "";
            if (p && p.de > 1) resultado += " Quedaste en el " + p.puesto + ".º lugar de " + p.de + ".";
        } else {
            resultado = "Tu nota: " + TandaCalentamiento.nota(buenas, total) + ".";
            document.getElementById("tanda-nota").textContent = "Tu nota: " + TandaCalentamiento.nota(buenas, total);
            document.getElementById("tanda-detalle").textContent = buenas + " de " + total + " ejercicios resueltos"
                + (tandaMia.resultados.length < total ? " (" + (total - tandaMia.resultados.length) + " sin llegar a hacer)." : ".");
        }
        document.getElementById("tanda-estado").textContent = "";
        if (tandaFinDicho !== tandaMia.clave) {
            tandaFinDicho = tandaMia.clave;
            if (tandaAcc) tandaAcc.decir(se.replace(/^\S+\s/, "") + (noEstuvo ? "" : " " + resultado));
        }
        return;
    }
    juego.hidden = false;
    final.hidden = true;
    if (!total) { document.getElementById("tanda-estado").textContent = "No hay ejercicios de este nivel."; return; }
    if (tandaEsReto()) {
        const p = puestoMioEnLaTanda();
        document.getElementById("tanda-estado").textContent = "Ejercicio " + (tandaMia.i + 1) + " · llevas " + resueltosEnTexto(buenas)
            + (p && p.de > 1 ? " · vas " + p.puesto + ".º de " + p.de : "");
    } else document.getElementById("tanda-estado").textContent = "Ejercicio " + (tandaMia.i + 1) + " de " + total + " · llevas " + buenas + " bien";
    if (!nuevo) return;
    document.getElementById("tanda-pasar-btn").hidden = false;
    const ej = tandaMia.ejercicios[tandaMia.i];
    const b = tableroDeLaTanda();
    tandaMia.paso = 0;
    const color = ej.fen.split(" ")[1] === "b" ? "b" : "w";
    b.setFlipped(color === "b");
    b.loadMoves([], ej.fen);
    b.setMarks([], []);
    b.setInteractive(true);
    if (tandaAcc) tandaAcc.actualizar();
    document.getElementById("tanda-turno").replaceChildren("Juegan ", emojiMudo(color === "b" ? "⚫ " : "⚪ "), (color === "b" ? "Negras" : "Blancas") + ": encuentra la mejor jugada.");
    if (tandaAcc && CuadroComandos.activo()) enfocarCuandoSeVea(tandaAcc.cmd.input);
}

function pintarRelojDeLaTanda() {
    const el = document.getElementById("tanda-reloj");
    if (!el || !tandaActual) return;
    const q = TandaCalentamiento.quedan(tandaActual, relojDeLaTanda());
    el.replaceChildren(emojiMudo("⏱️ "), q > 0 ? "Quedan " + PreguntaClase.reloj(q) : "Se acabó el tiempo");
}

function juzgarTanda() {
    if (!tandaMia || tandaMia.fin) return;
    const ej = tandaMia.ejercicios[tandaMia.i];
    const b = tandaBoard;
    const hechas = b.moves();
    const paso = hechas.length - 1;
    const g = new Chess(ej.fen);
    let m = null;
    for (const san of hechas) m = g.move(san);
    if (!m) return;
    const r = TandaCalentamiento.revisar(ej, paso, m.from + m.to + (m.promotion || ""));
    const msg = document.getElementById("tanda-msg");
    if (!r.bien) {
        // La que era, con su flecha, un momento; y pasa al siguiente.
        const era = new Chess(ej.fen);
        for (let i = 0; i < paso; i++) { const u = ej.uci[i]; era.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined }); }
        const u = ej.uci[paso];
        const buena = era.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
        // El tablero vuelve a antes de la jugada equivocada, con la buena marcada.
        b.loadMoves(hechas.slice(0, -1), ej.fen);
        b.setInteractive(false);
        b.setMarks([{ from: u.slice(0, 2), to: u.slice(2, 4), color: "verde" }], []);
        msg.textContent = "❌ " + (window.ComandosTablero ? ComandosTablero.incorrecta(sanDelCalentamiento(m.san), "") : "Respuesta incorrecta.").trim()
            + " Era " + sanDelCalentamiento(buena.san) + ". Pasas al siguiente.";
        cerrarEjercicioDeLaTanda(false, 2200);
        return;
    }
    if (r.fin) {
        b.setInteractive(false);
        msg.textContent = "✅ ¡Bien! " + sanDelCalentamiento(m.san) + (paso ? ": ejercicio resuelto." : " es la jugada.");
        cerrarEjercicioDeLaTanda(true, 1000);
        return;
    }
    // Bien, y sigue: el rival contesta solo, con la jugada de la solución.
    b.setInteractive(false);
    msg.textContent = "✅ " + sanDelCalentamiento(m.san) + ", bien. Sigue…";
    setTimeout(() => {
        if (!tandaMia || tandaMia.fin || tandaMia.ejercicios[tandaMia.i] !== ej) return;
        const u = ej.uci[paso + 1];
        const rival = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
        b.loadMoves(hechas.concat([rival.san]), ej.fen);
        b.setInteractive(true);
        if (tandaAcc) tandaAcc.actualizar();
        msg.textContent = "Contestaron " + sanDelCalentamiento(rival.san) + ". Te toca otra vez.";
    }, 500);
}

/* Cada ejercicio terminado queda en la base (tanda_resultados): de ahí salen
   sus puntos de la clase. La base pone la hora, el plazo y el orden, así que
   van de a uno, en fila: si el 3 llegara antes que el 2, lo rechazaría. Si
   uno no se pudo guardar (sin conexión), el calentamiento sigue igual. */
let tandaGuardando = Promise.resolve();
function guardarResultadoDeLaTanda(semilla, indice, bien) {
    if (isTeacher || esObservador || vistaPrevia || !semilla) return;
    tandaGuardando = tandaGuardando.then(async () => {
        const { error } = await sb.from("tanda_resultados").insert({ semilla, indice, bien: !!bien });
        // El mismo dos veces (al recargar) no es un error: ya estaba.
        if (error && error.code !== "23505") console.error(error);
    }).catch((e) => console.error(e));
}

function cerrarEjercicioDeLaTanda(bien, espera) {
    // Mientras se ve cómo terminó este, no hay nada que pasar.
    document.getElementById("tanda-pasar-btn").hidden = true;
    guardarResultadoDeLaTanda(tandaMia.semilla, tandaMia.i, bien);
    tandaMia.resultados.push(!!bien);
    tandaMia.i += 1;
    if (tandaMia.i >= tandaMia.ejercicios.length) tandaMia.fin = true;
    guardarTandaMia();
    anunciarTanda();
    clearTimeout(tandaEsperando);
    const mia = tandaMia;
    tandaEsperando = setTimeout(() => {
        if (tandaMia !== mia) return;
        document.getElementById("tanda-msg").textContent = "";
        pintarTandaAlumno(true);
    }, espera);
}

function terminarTandaMia() {
    if (!tandaMia || tandaMia.fin) return;
    tandaMia.fin = true;
    // Por el tiempo: si el profe da más, sigue donde iba.
    tandaMia.porTiempo = true;
    clearTimeout(tandaEsperando);
    if (tandaBoard) tandaBoard.setInteractive(false);
    guardarTandaMia();
    anunciarTanda();
}

/* ---------- El profe ---------- */
function anotarTandaDeLaPresencia() {
    if (!isTeacher || !tandaActual) return;
    for (const v of tandaVistos.values()) v.conectado = false;
    for (const [id, s] of onlineStudents.entries()) {
        const t = s.tanda && s.tanda.at === tandaActual.at ? s.tanda : null;
        const antes = tandaVistos.get(id);
        tandaVistos.set(id, Object.assign({ hechos: 0, buenas: 0, i: 0, fin: false }, antes || {}, t || {},
            { nombre: s.full_name || s.email || "Alumno", conectado: true }));
    }
}

function pintarTandaProfe() {
    if (!isTeacher || !tandaActual) return;
    const total = tandaActual.cantidad;
    const reto = tandaEsReto();
    const q = TandaCalentamiento.quedan(tandaActual, relojDeLaTanda());
    document.getElementById("tanda-profe-nivel").textContent = (reto ? "Competencia: los mismos ejercicios para todos (hasta " + total + "), gana quien resuelva más · "
        : total + " ejercicios por alumno · ") + (tandaActual.titulo ? "«" + tandaActual.titulo + "»" : TandaCalentamiento.nombreDeNivel(tandaActual.elo));
    pintarRelojDeLaTanda();
    const filas = [...tandaVistos.entries()].map(([id, v]) => Object.assign({ id }, v));
    const terminaron = filas.filter((v) => v.fin || v.hechos >= total).length;
    const conectados = filas.filter((v) => v.conectado).length;
    const enConectados = conectados + (conectados === 1 ? " conectado." : " conectados.");
    document.getElementById("tanda-cuenta").textContent = !filas.length ? "Todavía no hay alumnos conectados."
        : reto ? (q > 0 ? "Competencia en curso · " + enConectados : "Se acabó el tiempo: así quedó la competencia.")
            : q > 0 ? terminaron + " de " + filas.length + (filas.length === 1 ? " ya terminó" : " ya terminaron") + " · " + enConectados
                : "Se acabó el tiempo: estas son las notas.";
    // En la competencia, la tabla va siempre por resueltos: es una carrera.
    if (reto || q <= 0) filas.sort((a, b) => b.buenas - a.buenas || String(a.nombre).localeCompare(String(b.nombre)));
    else filas.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
    const puestos = reto ? TandaCalentamiento.puestos(filas) : null;
    const ul = document.getElementById("tanda-lista");
    ul.replaceChildren();
    for (const v of filas) {
        const li = document.createElement("li");
        li.className = "flex flex-wrap items-center gap-2 py-1 border-b border-brand-100 dark:border-brand-800 last:border-0";
        const nombre = document.createElement("span");
        nombre.className = "font-semibold flex-1 min-w-0";
        // El nombre lo escribió una persona: textContent.
        nombre.textContent = (puestos ? puestos.get(v.id) + ".º · " : "") + v.nombre + (v.conectado ? "" : " (se desconectó)");
        const cuenta = document.createElement("span");
        const termino = v.fin || v.hechos >= total || q <= 0;
        if (reto) {
            cuenta.textContent = resueltosEnTexto(v.buenas) + (v.hechos >= total ? " · hizo todos" : "");
            li.append(nombre, cuenta);
        } else {
            cuenta.textContent = termino
                ? "Nota " + TandaCalentamiento.nota(v.buenas, total) + " · " + v.buenas + " de " + total + " bien"
                : v.hechos + " de " + total + " hechos · " + v.buenas + " bien";
            const barra = document.createElement("progress");
            barra.max = total;
            barra.value = Math.min(total, v.hechos);
            barra.className = "w-20 h-2";
            barra.setAttribute("aria-hidden", "true");
            li.append(nombre, barra, cuenta);
        }
        if (!termino && v.conectado) {
            const ver = document.createElement("button");
            ver.type = "button";
            ver.className = "text-xs font-semibold px-2 py-1 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            ver.textContent = tandaMirando === v.id ? "Dejar de ver" : "Ver su ejercicio";
            ver.setAttribute("aria-pressed", tandaMirando === v.id ? "true" : "false");
            ver.addEventListener("click", () => { tandaMirando = tandaMirando === v.id ? null : v.id; pintarTandaProfe(); });
            li.appendChild(ver);
        }
        ul.appendChild(li);
    }
    const terminar = document.getElementById("tanda-terminar-btn");
    terminar.hidden = q <= 0;
    terminar.textContent = reto ? "Terminar ya" : "Terminar ya y dar las notas";
    // Cambiar el tiempo: con el tiempo acabado solo se puede dar más.
    document.getElementById("tanda-menos-btn").hidden = q <= 0;
    document.getElementById("tanda-mas-btn").textContent = q > 0 ? "Sumar 1 minuto" : "Dar 1 minuto más";
    pintarEjercicioQueMiro();
}

// El ejercicio en que está el alumno elegido: el profe rehace su tanda con la semilla y su id.
async function pintarEjercicioQueMiro() {
    const caja = document.getElementById("tanda-mirando");
    const v = tandaMirando && tandaVistos.get(tandaMirando);
    const total = tandaActual ? tandaActual.cantidad : 0;
    if (!v || !tandaActual || v.fin || v.hechos >= total || TandaCalentamiento.quedan(tandaActual, relojDeLaTanda()) <= 0) { caja.hidden = true; return; }
    let banco = null;
    try { banco = await cargarBancoDeLaTanda(tandaActual); } catch (e) { caja.hidden = true; return; }
    // Se arma una vez por alumno y tanda: esto corre con cada eco de la presencia.
    const clave = tandaActual.semilla + ":" + tandaMirando;
    if (!tandasRehechas.has(clave)) tandasRehechas.set(clave, TandaCalentamiento.paraAlumno(banco, tandaActual, tandaMirando));
    const ej = tandasRehechas.get(clave)[v.i];
    if (!ej) { caja.hidden = true; return; }
    caja.hidden = false;
    document.getElementById("tanda-mirando-titulo").textContent = v.nombre + ": ejercicio " + (v.i + 1) + " de " + total
        + " (rating " + ej.rating + ", juegan " + (ej.fen.split(" ")[1] === "b" ? "negras" : "blancas") + ")";
    if (!tandaProfeBoard) tandaProfeBoard = new ClasesBoard(document.getElementById("tanda-mirando-tablero"), { interactive: false, allowArrows: false, externalCoords: true });
    tandaProfeBoard.setFlipped(ej.fen.split(" ")[1] === "b");
    tandaProfeBoard.loadFen(ej.fen);
}

function pintarBotonTanda() {
    const btn = document.getElementById("tanda-mandar-btn");
    const modo = document.getElementById("tanda-modo");
    const reto = modo && modo.value === "reto";
    if (btn) textoConEmojiMudo(btn, (reto ? "🏁 " : "🔥 ") + (tandaActual ? (reto ? "Empezar otra competencia" : "Mandar otro calentamiento") + " (reemplaza el de ahora)"
        : reto ? "Empezar la competencia" : "Mandar el calentamiento"));
}

// Desde la pestaña Preguntar: el nivel, el modo y el tiempo de su recuadro (ejercicios de Táctica).
async function mandarTanda() {
    const minutos = Number(document.getElementById("tanda-minutos").value);
    if (!minutosValidos(minutos)) { document.getElementById("tanda-minutos").focus(); return; }
    await mandarTandaCon({ elo: parseInt(document.getElementById("tanda-nivel").value, 10) || 1200,
        reto: document.getElementById("tanda-modo").value === "reto", minutos });
}

function minutosValidos(minutos) {
    if (Number.isInteger(minutos) && minutos >= TandaCalentamiento.MINUTOS_MIN && minutos <= TandaCalentamiento.MINUTOS_MAX) return true;
    setStatus("Escribe el tiempo en minutos: de " + TandaCalentamiento.MINUTOS_MIN + " a " + TandaCalentamiento.MINUTOS_MAX + ".");
    return false;
}

/* Manda la receta. `o`: {reto, minutos} y, o el nivel (`elo`, de Táctica), o
   una parte de un banco ({banco, filtro, titulo}: lo que manda la pestaña
   Entrenamientos), cuyo nivel es el de sus propios ejercicios. Devuelve si salió. */
async function mandarTandaCon(o) {
    const reto = !!o.reto;
    if (tandaActual && TandaCalentamiento.quedan(tandaActual, relojDeLaTanda()) > 0) {
        const si = await Avisos.confirmar("Ya hay un calentamiento en curso. Si mandas otro, tus alumnos empiezan de cero con ejercicios nuevos.",
            { aceptar: "Mandar otro", cancelar: "Seguir con el de ahora" });
        if (!si) return false;
    }
    const receta = { banco: o.banco && o.banco !== "temas" ? o.banco : undefined, filtro: o.filtro || undefined };
    let banco = null;
    try { banco = await cargarBancoDeLaTanda(receta); } catch (e) { console.error(e); setStatus("No se pudo cargar la base de ejercicios. Recarga la página e inténtalo de nuevo."); return false; }
    const elo = o.elo || TandaCalentamiento.eloDe(banco);
    const n = TandaCalentamiento.banda(banco, elo).length;
    // De una parte chica del banco (un tema, los Desafíos) van los que haya, si llegan a cinco.
    const minimo = o.elo ? TandaCalentamiento.CANTIDAD : 5;
    if (n < minimo) { setStatus("No hay suficientes ejercicios de ese nivel."); return false; }
    // Los conectados, en orden: a cada uno le toca otro ejercicio de cada tramo (ver paraAlumno).
    // En la competencia todos tienen los mismos: la lista no hace falta.
    const alumnos = reto ? [] : [...onlineStudents.keys()].sort().slice(0, 60);
    const cantidad = Math.min(reto ? TandaCalentamiento.CANTIDAD_RETO : TandaCalentamiento.CANTIDAD, n);
    const tanda = { at: new Date().toISOString(), semilla: TandaCalentamiento.semillaNueva(), elo, cantidad, segundos: o.minutos * 60, alumnos };
    if (reto) tanda.modo = "reto";
    if (receta.banco) tanda.banco = receta.banco;
    if (receta.filtro) tanda.filtro = String(receta.filtro).slice(0, 60);
    if (o.titulo) tanda.titulo = String(o.titulo).slice(0, 80);
    const { data, error } = await sb.from("game_state").update({ tanda_calentamiento: tanda }).eq("id", myGameStateId).select("tanda_calentamiento").single();
    if (error) { console.error(error); setStatus("No se pudo mandar el calentamiento: " + error.message); return false; }
    pintarTanda(data && data.tanda_calentamiento ? data.tanda_calentamiento : tanda);
    const de = tanda.titulo ? " de «" + tanda.titulo + "»" : "";
    setStatus(reto
        ? "🏁 Competencia" + de + " en marcha: los mismos ejercicios para todos, con " + PreguntaClase.textoDeTiempo(tanda.segundos) + ". Debajo del tablero ves cuántos resolvió cada uno."
        : "🔥 Calentamiento" + de + " enviado: " + cantidad + " ejercicios distintos para cada alumno, con " + PreguntaClase.textoDeTiempo(tanda.segundos) + ". Debajo del tablero ves cuántos lleva cada uno.");
    return true;
}

/* El profe cambia el plazo de la tanda que corre: la misma semilla (la base
   no mueve `at`), otros `segundos`. Si ya se había acabado y da más, cada
   alumno sigue donde iba. */
async function cambiarTiempoDeLaTanda(segundos, queHizo) {
    if (!tandaActual) return;
    const tanda = Object.assign({}, tandaActual, { segundos });
    const { data, error } = await sb.from("game_state").update({ tanda_calentamiento: tanda }).eq("id", myGameStateId).select("tanda_calentamiento").single();
    if (error) { console.error(error); setStatus("No se pudo cambiar el tiempo: " + error.message); return; }
    pintarTanda(data && data.tanda_calentamiento ? data.tanda_calentamiento : tanda);
    if (queHizo) {
        const q = TandaCalentamiento.quedan(tandaActual, relojDeLaTanda());
        setStatus(q > 0 ? "⏱️ " + queHizo + ": quedan " + PreguntaClase.textoDeTiempo(q) + "." : "⏱️ Se acabó el tiempo.");
    }
}

// «Terminar ya»: el plazo se acorta EN LA BASE hasta ahora, y cada alumno ve su nota.
async function terminarTandaYa() {
    if (!tandaActual) return;
    const pasaron = Math.max(0, Math.floor((relojDeLaTanda() - new Date(tandaActual.at).getTime()) / 1000));
    await cambiarTiempoDeLaTanda(Math.min(tandaActual.segundos, pasaron), null);
}

async function sumarTiempoALaTanda(delta) {
    if (!tandaActual) return;
    await cambiarTiempoDeLaTanda(TandaCalentamiento.segundosSumando(tandaActual, relojDeLaTanda(), delta), delta > 0 ? "Tiempo sumado" : "Tiempo quitado");
}

async function ponerTiempoQueQueda() {
    if (!tandaActual) return;
    const input = document.getElementById("tanda-quedan");
    const minutos = Number(input.value);
    if (!Number.isInteger(minutos) || minutos < 0 || minutos > TandaCalentamiento.SEGUNDOS_MAX / 60) {
        setStatus("Escribe cuántos minutos quedan: de 0 a " + TandaCalentamiento.SEGUNDOS_MAX / 60 + ".");
        input.focus();
        return;
    }
    await cambiarTiempoDeLaTanda(TandaCalentamiento.segundosParaQueQueden(tandaActual, relojDeLaTanda(), minutos * 60), "Tiempo cambiado");
}

async function quitarTanda() {
    const { error } = await sb.from("game_state").update({ tanda_calentamiento: null }).eq("id", myGameStateId);
    if (error) { console.error(error); setStatus("No se pudo quitar: " + error.message); return; }
    pintarTanda(null);
}

// El reloj corre solo; al llegar a cero, el alumno termina y ve su nota.
setInterval(() => {
    if (!tandaActual) return;
    if (isTeacher) { pintarRelojDeLaTanda(); if (TandaCalentamiento.quedan(tandaActual, relojDeLaTanda()) <= 0 && !document.getElementById("tanda-terminar-btn").hidden) pintarTandaProfe(); return; }
    if (tandaMia && !tandaMia.fin) {
        if (TandaCalentamiento.quedan(tandaActual, relojDeLaTanda()) <= 0) { terminarTandaMia(); pintarTandaAlumno(); }
        else pintarRelojDeLaTanda();
    }
}, 1000);

if (document.getElementById("tanda-mandar-btn")) {
    const nivel = document.getElementById("tanda-nivel");
    TandaCalentamiento.NIVELES.forEach((n) => {
        const o = document.createElement("option");
        o.value = n.elo;
        o.textContent = n.nombre + " (≈ " + n.elo + ")";
        if (n.elo === 1200) o.selected = true;
        nivel.appendChild(o);
    });
    // Cada modo con su explicación, y el botón dice cuál manda.
    const modo = document.getElementById("tanda-modo");
    const pintarModo = () => {
        document.getElementById("tanda-explica-nota").hidden = modo.value === "reto";
        document.getElementById("tanda-explica-reto").hidden = modo.value !== "reto";
        pintarBotonTanda();
    };
    modo.addEventListener("change", pintarModo);
    pintarModo();
    document.getElementById("tanda-mandar-btn").addEventListener("click", mandarTanda);
    document.getElementById("tanda-terminar-btn").addEventListener("click", terminarTandaYa);
    document.getElementById("tanda-menos-btn").addEventListener("click", () => sumarTiempoALaTanda(-60));
    document.getElementById("tanda-mas-btn").addEventListener("click", () => sumarTiempoALaTanda(60));
    document.getElementById("tanda-quedan-btn").addEventListener("click", ponerTiempoQueQueda);
    document.getElementById("tanda-quitar-btn").addEventListener("click", quitarTanda);
}
if (document.getElementById("tanda-pasar-btn")) {
    // «No sé»: pasa al siguiente, y ese cuenta como no resuelto.
    document.getElementById("tanda-pasar-btn").addEventListener("click", () => {
        if (!tandaMia || tandaMia.fin || !tandaBoard || !tandaBoard.interactive) return;
        tandaBoard.setInteractive(false);
        document.getElementById("tanda-msg").textContent = "Pasas al siguiente.";
        cerrarEjercicioDeLaTanda(false, 600);
    });
}
