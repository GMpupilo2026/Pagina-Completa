/* Llevar la partida de un alumno al tablero de la clase (sesion.html, solo el
   profe). Parte de sesion.js: script clásico, comparte sus globales (sb, board,
   isTeacher, esObservador, chatStudents, onlineStudents, latestPracticeSession,
   aplicarPosicionEnClase, renderMoveList, transmitirVista…).

   Para corregir cómo juega un alumno hay que mirar SU partida con toda la
   clase: la que está jugando contra el motor en la práctica, una que jugó con
   un compañero, o cualquiera de las suyas en línea. Tres puertas, una sola
   función (llevarPartidaALaClase):
     · «📥 Llevarla a la clase» en «👁 Mirar y ayudar» (la práctica en curso);
     · «📥 A la clase» en cada renglón de «Partidas entre alumnos»;
     · «📥 La partida de un alumno»: se elige al alumno y se ve la lista de sus
       últimas partidas (prácticas contra el motor y partidas en línea).

   La partida entra ENTERA (posición de salida + jugadas) por
   aplicarPosicionEnClase(), la misma puerta de todo lo que pone algo en el
   tablero de la clase: limpia variantes, comentarios y el control del alumno.
   Y se muestra desde la PRIMERA jugada (game_state.vista), no desde el final:
   se recorre con la clase y se corrige con variantes y comentarios, que son
   los de siempre. Qué partidas puede ver el profe lo decide la RLS
   (practice_games y game_rooms ya dejan leer las de sus alumnos).
   Ver «Llevar la partida de un alumno a la clase» en
   docs/decisiones/clase-en-vivo.md. */

const POSICION_INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/* De dónde arrancó una partida en línea. game_rooms no guarda la posición de
   salida: guarda la actual (fen) y las jugadas. Las de la clase armadas «desde
   la posición del tablero» la llevan en variant_state.inicio; las demás
   arrancan de la inicial. Se comprueba reproduciendo: si las jugadas no llevan
   a la posición guardada, la historia no se conoce y se dice (null). */
function inicioDePartidaEnLinea(r) {
    const jugadas = Array.isArray(r.moves) ? r.moves : [];
    const pos = (f) => String(f).split(" ").slice(0, 4).join(" ");
    const candidatos = [r.variant_state && r.variant_state.inicio, POSICION_INICIAL].filter(Boolean);
    for (const inicio of candidatos) {
        try {
            const g = new Chess(inicio);
            if (jugadas.every((san) => g.move(san)) && (!r.fen || pos(g.fen()) === pos(r.fen))) return { inicio, jugadas };
        } catch (e) { /* posición que chess.js no lee: probar la siguiente */ }
    }
    return null;
}

// Pone la partida en el tablero de todos y la muestra desde el principio.
async function llevarPartidaALaClase(inicio, jugadas, titulo) {
    if (!isTeacher || esObservador) return false;
    // Una jugada que no es legal corta la partida ahí: mejor decirlo que cargar media.
    const g = new Chess(inicio);
    const legales = [];
    for (const san of jugadas || []) { if (!g.move(san)) break; legales.push(san); }
    if (!(await aplicarPosicionEnClase(inicio, null, legales))) return false;
    if (legales.length) {
        board.viewMainAt(0);
        renderMoveList();
        transmitirVista();
    }
    const n = legales.length === 1 ? "1 jugada" : legales.length + " jugadas";
    setStatus("Se cargó " + titulo + " en el tablero de la clase (" + n + "), desde el principio: recórrela con la clase y corrige con variantes y comentarios."
        + (legales.length < (jugadas || []).length ? " Se cortó en la jugada " + (legales.length + 1) + ", que no se pudo reproducir." : ""));
    return true;
}

// ---------- La práctica en curso, desde «Mirar y ayudar» ----------
async function llevarPracticaALaClase() {
    if (!mirar.row || !latestPracticeSession) return;
    const nombre = mirarEl("nombre").textContent || "el alumno";
    const jugadas = mirar.row.moves || [];
    if (!jugadas.length) { mirarEl("aviso").textContent = "Todavía no hizo ninguna jugada: no hay partida que llevar."; return; }
    if (await llevarPartidaALaClase(latestPracticeSession.fen, jugadas, "la partida de " + nombre + " contra el motor")) cerrarMirada();
}

// ---------- «La partida de un alumno»: elegir al alumno y una de sus partidas ----------
function alumnosParaTraer() {
    const lista = (typeof chatStudents !== "undefined" && chatStudents.length ? chatStudents : [...onlineStudents.entries()].map(([id, s]) => Object.assign({ id }, s)))
        .map((s) => ({ id: s.id, nombre: s.full_name || s.email || "Alumno", conectado: onlineStudents.has(s.id) }));
    // Primero los que están en la clase, después por nombre.
    return lista.sort((a, b) => (b.conectado - a.conectado) || a.nombre.localeCompare(b.nombre, "es"));
}

function pintarAlumnosParaTraer() {
    const sel = document.getElementById("traer-alumno");
    if (!sel) return;
    const antes = sel.value;
    sel.innerHTML = "";
    const alumnos = alumnosParaTraer();
    const vacio = document.createElement("option");
    vacio.value = "";
    vacio.textContent = alumnos.length ? "Elige a un alumno" : "Todavía no hay alumnos";
    sel.appendChild(vacio);
    alumnos.forEach((a) => {
        const o = document.createElement("option");
        o.value = a.id;
        o.textContent = a.nombre + (a.conectado ? " (en la clase)" : "");
        sel.appendChild(o);
    });
    if (alumnos.some((a) => a.id === antes)) sel.value = antes;
}

function cuandoFue(x) {
    return HoraCR.fechaHora(x, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

async function buscarPartidasDelAlumno() {
    const sel = document.getElementById("traer-alumno");
    const msg = document.getElementById("traer-msg");
    const lista = document.getElementById("traer-lista");
    lista.innerHTML = "";
    const id = sel.value;
    if (!id) { msg.textContent = "Elige primero a un alumno."; sel.focus(); return; }
    const nombre = sel.options[sel.selectedIndex].textContent.replace(/ \(en la clase\)$/, "");
    msg.textContent = "Buscando las partidas de " + nombre + "…";
    // Las últimas de cada tipo, de a pocas: es una lista para elegir, no un historial.
    const [practicas, enLinea] = await Promise.all([
        sb.from("practice_games")
            .select("id, student_color, moves, status, attempts, created_at, practice_sessions!inner(fen, level)")
            .eq("student_id", id).order("created_at", { ascending: false }).limit(10),
        sb.from("game_rooms")
            .select("id, white_id, black_id, status, result, moves, fen, variant_state, created_at")
            .eq("variant", "estandar").or("white_id.eq." + id + ",black_id.eq." + id)
            .order("created_at", { ascending: false }).limit(10),
    ]);
    if (practicas.error || enLinea.error) {
        console.error(practicas.error || enLinea.error);
        msg.textContent = "No se pudieron traer sus partidas: " + (practicas.error || enLinea.error).message;
        return;
    }
    const rivales = [...new Set((enLinea.data || []).map((r) => (r.white_id === id ? r.black_id : r.white_id)))];
    const { data: nombres } = rivales.length ? await sb.rpc("nombres_de_jugadores", { p_ids: rivales }) : { data: [] };
    const mapa = new Map((nombres || []).map((n) => [n.id, n.nombre || n.full_name]));
    const nombreDe = (x) => (x === id ? nombre : mapa.get(x) || "su rival");

    const filas = [];
    (practicas.data || []).forEach((p) => {
        const jugadas = p.moves || [];
        if (!jugadas.length) return;
        filas.push({
            fecha: p.created_at,
            texto: "🎯 Contra el motor (nivel " + practiceLevelLabel(p.practice_sessions.level) + ", con "
                + (p.student_color === "w" ? "blancas" : "negras") + ") · " + practiceStatusLabel(p.status).replace(/^\S+\s/, ""),
            inicio: p.practice_sessions.fen, jugadas,
            titulo: "la partida de " + nombre + " contra el motor",
        });
    });
    (enLinea.data || []).forEach((r) => {
        const h = inicioDePartidaEnLinea(r);
        const conBlancas = r.white_id === id;
        const rival = nombreDe(conBlancas ? r.black_id : r.white_id);
        const fila = {
            fecha: r.created_at,
            texto: "♟️ Contra " + rival + " (con " + (conBlancas ? "blancas" : "negras") + ") · "
                + (r.status === "finished" || r.result ? PartidasClase.estado(r, nombreDe) : "En juego"),
            titulo: "la partida de " + nombre + " contra " + rival,
        };
        if (h && h.jugadas.length) Object.assign(fila, h);
        else if (!h) fila.sinHistoria = true;
        else return;   // sin jugadas: no hay nada que corregir
        filas.push(fila);
    });
    filas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    msg.textContent = filas.length
        ? (filas.length === 1 ? "1 partida" : filas.length + " partidas") + " de " + nombre + ", de la más nueva a la más vieja."
        : nombre + " todavía no tiene partidas con jugadas que puedas ver.";
    filas.forEach((f) => {
        const li = document.createElement("li");
        li.className = "flex items-center justify-between gap-2 border-b border-brand-50 dark:border-brand-800/60 pb-1.5";
        const t = document.createElement("span");
        t.className = "min-w-0 text-brand-700 dark:text-brand-200";
        const n = f.jugadas ? (f.jugadas.length === 1 ? "1 jugada" : f.jugadas.length + " jugadas") : "no se sabe desde dónde empezó";
        t.textContent = f.texto + " · " + n + " · " + cuandoFue(f.fecha);
        li.appendChild(t);
        if (!f.sinHistoria) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "shrink-0 font-semibold px-2 py-1 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            b.textContent = "📥 A la clase";
            b.setAttribute("aria-label", "Llevar a la clase " + f.titulo + " (" + cuandoFue(f.fecha) + ")");
            b.addEventListener("click", () => llevarPartidaALaClase(f.inicio, f.jugadas, f.titulo));
            li.appendChild(b);
        }
        lista.appendChild(li);
    });
}

// El botón de cada renglón de «Partidas entre alumnos» (lo pinta cargarPartidasDeLaClase).
function botonPartidaEnLineaALaClase(r, titulo) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "shrink-0 font-semibold text-accent-700 dark:text-accent-400 hover:underline";
    b.textContent = "📥 A la clase";
    b.setAttribute("aria-label", "Llevar a la clase " + titulo);
    b.addEventListener("click", () => {
        const h = inicioDePartidaEnLinea(r);
        if (!h) { setStatus("No se puede reproducir " + titulo + ": sus jugadas no llevan a la posición guardada."); return; }
        if (!h.jugadas.length) { setStatus("En " + titulo + " todavía no hay jugadas."); return; }
        llevarPartidaALaClase(h.inicio, h.jugadas, titulo);
    });
    return b;
}

function montarTraerPartida() {
    if (!isTeacher || esObservador) return;
    const llevar = document.getElementById("practica-mirar-llevar");
    if (llevar) { llevar.hidden = false; llevar.addEventListener("click", llevarPracticaALaClase); }
    const caja = document.getElementById("traer-partida");
    if (!caja) return;
    caja.hidden = false;
    document.getElementById("traer-buscar").addEventListener("click", buscarPartidasDelAlumno);
    // La lista de alumnos se arma al abrir el selector: así trae a los que se conectaron después.
    const sel = document.getElementById("traer-alumno");
    sel.addEventListener("focus", pintarAlumnosParaTraer);
    sel.addEventListener("change", () => { document.getElementById("traer-lista").innerHTML = ""; document.getElementById("traer-msg").textContent = ""; });
    pintarAlumnosParaTraer();
}
