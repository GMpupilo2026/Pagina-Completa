/* El código de sesion.html.

   El calentamiento de 20 ejercicios (game_state.tanda_calentamiento). El
   profe elige el nivel y el tiempo; cada alumno recibe SUS 20 ejercicios de
   Táctica, distintos a los de los demás pero del mismo nivel, y los resuelve
   en su propio tablero. Si falla, pasa al siguiente. Al terminar (o al
   acabarse el tiempo) ve su nota. El profe ve cuántos lleva cada uno y puede
   mirar el ejercicio en que está. Ver «El calentamiento de 20 ejercicios» en
   docs/decisiones/clase-en-vivo.md.

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
    const MINUTOS = [5, 8, 10, 12, 15, 20, 25, 30];
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

    function nombreDeNivel(elo) {
        const n = NIVELES.find((x) => x.elo === elo);
        return (n ? n.nombre + ", " : "") + "alrededor de " + elo + " puntos Elo";
    }

    function semillaNueva() {
        const a = new Uint32Array(2);
        (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : (a[0] = Math.random() * 4294967296, a[1] = Date.now());
        return a[0].toString(36) + a[1].toString(36);
    }

    return { CANTIDAD, NIVELES, MINUTOS, BANDA_MINIMA, hash, azarDesde, banda, preparar, paraAlumno, revisar, nota, quedan, nombreDeNivel, semillaNueva };
})();

let tandaActual = null;        // la de game_state: {at, semilla, elo, cantidad, segundos}
let tandaBanco = null;         // los ejercicios de Táctica (entreno/data/temas.json)
let tandaBancoPromesa = null;
let tandaMia = null;           // alumno: {at, ejercicios, i, paso, resultados: [true|false…], fin}
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

function relojDeLaTanda() {
    return window.RelojServidor ? RelojServidor.ahora() : Date.now();
}

function cargarBancoDeLaTanda() {
    if (tandaBanco) return Promise.resolve(tandaBanco);
    if (typeof tacticsData !== "undefined" && tacticsData && tacticsData.puzzles) { tandaBanco = tacticsData.puzzles; return Promise.resolve(tandaBanco); }
    if (!tandaBancoPromesa) {
        tandaBancoPromesa = fetch("entreno/data/temas.json")
            .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
            .then((d) => { tandaBanco = d.puzzles || {}; return tandaBanco; })
            .catch((e) => { tandaBancoPromesa = null; throw e; });
    }
    return tandaBancoPromesa;
}

const claveDeLaTanda = (t) => "clase_tanda_v1:" + myGameStateId + ":" + t.at + ":" + t.semilla;

function guardarTandaMia() {
    if (!tandaMia) return;
    try { localStorage.setItem(tandaMia.clave, JSON.stringify({ i: tandaMia.i, resultados: tandaMia.resultados, fin: tandaMia.fin })); } catch (e) {}
}

async function anunciarTanda() {
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
    if (window.RelojServidor && (!antes || antes.semilla !== tandaActual.semilla)) RelojServidor.iniciar(sb);
    anunciarALaClase("tanda", tandaActual.at + ":" + tandaActual.semilla,
        "Tu profe mandó un calentamiento de " + tandaActual.cantidad + " ejercicios, con " + PreguntaClase.textoDeTiempo(tandaActual.segundos) + ". Resuélvelos en tu tablero, debajo del de la clase.");
    pintarBotonTanda();
    if (isTeacher) {
        if (tandaVistosDe !== tandaActual.semilla) { tandaVistos.clear(); tandaVistosDe = tandaActual.semilla; tandaMirando = null; }
        anotarTandaDeLaPresencia();
        pintarTandaProfe();
        return;
    }
    if (esObservador) return;
    if (tandaMia && tandaMia.semilla === tandaActual.semilla) { pintarTandaAlumno(); return; }
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
    try { banco = await cargarBancoDeLaTanda(); } catch (e) {
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
        }
    } catch (e) {}
    if (tandaMia.i >= ejercicios.length) tandaMia.fin = true;
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
        const se = noEstuvo ? "⏱️ Este calentamiento ya terminó." : tandaMia.resultados.length < total ? "⏱️ Se acabó el tiempo." : "🏁 ¡Terminaste el calentamiento!";
        textoConEmojiMudo(document.getElementById("tanda-final-titulo"), se);
        document.getElementById("tanda-nota").textContent = "Tu nota: " + TandaCalentamiento.nota(buenas, total);
        document.getElementById("tanda-detalle").textContent = buenas + " de " + total + " ejercicios resueltos"
            + (tandaMia.resultados.length < total ? " (" + (total - tandaMia.resultados.length) + " sin llegar a hacer)." : ".");
        document.getElementById("tanda-estado").textContent = "";
        if (tandaFinDicho !== tandaMia.clave) {
            tandaFinDicho = tandaMia.clave;
            if (tandaAcc) tandaAcc.decir(se.replace(/^\S+\s/, "") + (noEstuvo ? "" : " Tu nota: " + TandaCalentamiento.nota(buenas, total) + "."));
        }
        return;
    }
    juego.hidden = false;
    final.hidden = true;
    if (!total) { document.getElementById("tanda-estado").textContent = "No hay ejercicios de este nivel."; return; }
    document.getElementById("tanda-estado").textContent = "Ejercicio " + (tandaMia.i + 1) + " de " + total + " · llevas " + buenas + " bien";
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

function cerrarEjercicioDeLaTanda(bien, espera) {
    // Mientras se ve cómo terminó este, no hay nada que pasar.
    document.getElementById("tanda-pasar-btn").hidden = true;
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
    const q = TandaCalentamiento.quedan(tandaActual, relojDeLaTanda());
    document.getElementById("tanda-profe-nivel").textContent = total + " ejercicios por alumno · " + TandaCalentamiento.nombreDeNivel(tandaActual.elo);
    pintarRelojDeLaTanda();
    const filas = [...tandaVistos.entries()].map(([id, v]) => Object.assign({ id }, v));
    const terminaron = filas.filter((v) => v.fin || v.hechos >= total).length;
    const conectados = filas.filter((v) => v.conectado).length;
    document.getElementById("tanda-cuenta").textContent = !filas.length ? "Todavía no hay alumnos conectados."
        : q > 0 ? terminaron + " de " + filas.length + (filas.length === 1 ? " ya terminó" : " ya terminaron") + " · " + conectados + (conectados === 1 ? " conectado." : " conectados.")
            : "Se acabó el tiempo: estas son las notas.";
    if (q <= 0) filas.sort((a, b) => b.buenas - a.buenas || String(a.nombre).localeCompare(String(b.nombre)));
    else filas.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
    const ul = document.getElementById("tanda-lista");
    ul.replaceChildren();
    for (const v of filas) {
        const li = document.createElement("li");
        li.className = "flex flex-wrap items-center gap-2 py-1 border-b border-brand-100 dark:border-brand-800 last:border-0";
        const nombre = document.createElement("span");
        nombre.className = "font-semibold flex-1 min-w-0";
        // El nombre lo escribió una persona: textContent.
        nombre.textContent = v.nombre + (v.conectado ? "" : " (se desconectó)");
        const cuenta = document.createElement("span");
        const termino = v.fin || v.hechos >= total || q <= 0;
        cuenta.textContent = termino
            ? "Nota " + TandaCalentamiento.nota(v.buenas, total) + " · " + v.buenas + " de " + total + " bien"
            : v.hechos + " de " + total + " hechos · " + v.buenas + " bien";
        const barra = document.createElement("progress");
        barra.max = total;
        barra.value = Math.min(total, v.hechos);
        barra.className = "w-20 h-2";
        barra.setAttribute("aria-hidden", "true");
        li.append(nombre, barra, cuenta);
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
    document.getElementById("tanda-terminar-btn").hidden = q <= 0;
    pintarEjercicioQueMiro();
}

// El ejercicio en que está el alumno elegido: el profe rehace su tanda con la semilla y su id.
async function pintarEjercicioQueMiro() {
    const caja = document.getElementById("tanda-mirando");
    const v = tandaMirando && tandaVistos.get(tandaMirando);
    const total = tandaActual ? tandaActual.cantidad : 0;
    if (!v || !tandaActual || v.fin || v.hechos >= total || TandaCalentamiento.quedan(tandaActual, relojDeLaTanda()) <= 0) { caja.hidden = true; return; }
    let banco = null;
    try { banco = await cargarBancoDeLaTanda(); } catch (e) { caja.hidden = true; return; }
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
    if (btn) textoConEmojiMudo(btn, tandaActual ? "🔥 Mandar otro calentamiento (reemplaza el de ahora)" : "🔥 Mandar el calentamiento");
}

async function mandarTanda() {
    const elo = parseInt(document.getElementById("tanda-nivel").value, 10) || 1200;
    const minutos = parseInt(document.getElementById("tanda-minutos").value, 10) || 10;
    if (tandaActual && TandaCalentamiento.quedan(tandaActual, relojDeLaTanda()) > 0) {
        const si = await Avisos.confirmar("Ya hay un calentamiento en curso. Si mandas otro, tus alumnos empiezan de cero con ejercicios nuevos.",
            { aceptar: "Mandar otro", cancelar: "Seguir con el de ahora" });
        if (!si) return;
    }
    let banco = null;
    try { banco = await cargarBancoDeLaTanda(); } catch (e) { setStatus("No se pudo cargar la base de ejercicios. Recarga la página e inténtalo de nuevo."); return; }
    const n = TandaCalentamiento.banda(banco, elo).length;
    if (n < TandaCalentamiento.CANTIDAD) { setStatus("No hay suficientes ejercicios de ese nivel."); return; }
    // Los conectados, en orden: a cada uno le toca otro ejercicio de cada tramo (ver paraAlumno).
    const alumnos = [...onlineStudents.keys()].sort().slice(0, 60);
    const tanda = { at: new Date().toISOString(), semilla: TandaCalentamiento.semillaNueva(), elo, cantidad: TandaCalentamiento.CANTIDAD, segundos: minutos * 60, alumnos };
    const { data, error } = await sb.from("game_state").update({ tanda_calentamiento: tanda }).eq("id", myGameStateId).select("tanda_calentamiento").single();
    if (error) { console.error(error); setStatus("No se pudo mandar el calentamiento: " + error.message); return; }
    pintarTanda(data && data.tanda_calentamiento ? data.tanda_calentamiento : tanda);
    setStatus("🔥 Calentamiento enviado: " + TandaCalentamiento.CANTIDAD + " ejercicios distintos para cada alumno, con " + PreguntaClase.textoDeTiempo(tanda.segundos) + ". Debajo del tablero ves cuántos lleva cada uno.");
}

// «Terminar ya»: el plazo se acorta EN LA BASE hasta ahora, y cada alumno ve su nota.
async function terminarTandaYa() {
    if (!tandaActual) return;
    const pasaron = Math.max(0, Math.floor((relojDeLaTanda() - new Date(tandaActual.at).getTime()) / 1000));
    const tanda = Object.assign({}, tandaActual, { segundos: Math.min(tandaActual.segundos, pasaron) });
    const { data, error } = await sb.from("game_state").update({ tanda_calentamiento: tanda }).eq("id", myGameStateId).select("tanda_calentamiento").single();
    if (error) { console.error(error); setStatus("No se pudo terminar: " + error.message); return; }
    pintarTanda(data && data.tanda_calentamiento ? data.tanda_calentamiento : tanda);
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
    const min = document.getElementById("tanda-minutos");
    TandaCalentamiento.MINUTOS.forEach((m) => {
        const o = document.createElement("option");
        o.value = m;
        o.textContent = m + " minutos";
        if (m === 10) o.selected = true;
        min.appendChild(o);
    });
    document.getElementById("tanda-mandar-btn").addEventListener("click", mandarTanda);
    document.getElementById("tanda-terminar-btn").addEventListener("click", terminarTandaYa);
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
