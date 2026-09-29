/* El código de sesion.html.

   La clase juega votando (sesion.html): contra el motor o contra el profe.
   Ver «La clase juega votando» en docs/decisiones/clase-en-vivo.md.

   Es una parte de js/sesion.js que se mudó a su archivo tal cual: un script
   clásico, cargado ANTES que sesion.js. Usa lo de sesion.js (board, sb,
   profile, isTeacher, myGameStateId, setStatus…) solo dentro de funciones,
   que corren cuando sesion.js ya cargó; y sesion.js llama a las de acá del
   mismo modo. Las `let`/`const` de arriba de un script clásico son globales
   para todos los scripts de la página: por eso se ven de un lado al otro. Ver
   «sesion.js en partes» en docs/decisiones/clase-en-vivo.md. */

/* ---------- La clase juega votando ----------
   La clase juega una partida contra el motor o contra el profe desde la
   posición del tablero. Cada turno de la clase es una pregunta de
   jugada con tiempo (la de siempre: cuenta para los puntos y se ve en
   «Respuestas en el tablero»); al cerrarse se juega la más votada, con
   empate se sortea entre las empatadas y se dice. El motor contesta
   desde la computadora del profe. El estado vive en esta página
   (sessionStorage): al recargar, la partida queda en pausa. */
const PARTIDA_CLAVE = "sesion_partida_clase_v1";
let partidaClase = null;          // {rival, color, nivel, segundos}
let votacion = null;              // {id, fen, cierre}
let motorPensandoPartida = false;
const colorEscrito = (c) => (c === "w" ? "blancas" : "negras");
const clavePosicion = (f) => String(f || "").split(" ").slice(0, 4).join(" ");

function guardarPartidaClase() {
    try {
        if (partidaClase) sessionStorage.setItem(PARTIDA_CLAVE, JSON.stringify(partidaClase));
        else sessionStorage.removeItem(PARTIDA_CLAVE);
    } catch (e) {}
}

function pintarPartidaClase(estado) {
    const enCurso = document.getElementById("partida-en-curso");
    if (!enCurso) return;
    enCurso.hidden = !partidaClase;
    document.getElementById("partida-config").classList.toggle("hidden", !!partidaClase);
    document.getElementById("partida-empezar-btn").hidden = !!partidaClase;
    document.getElementById("partida-jugar-ya-btn").hidden = !votacion;
    if (estado !== undefined) document.getElementById("partida-estado").textContent = estado;
    if (!partidaClase) document.getElementById("partida-ultima").textContent = "";
}

// Juega en el tablero de la clase por la misma puerta que el clic (board.jugar).
function jugarEnElTablero(jugada) {
    board.viewLive();
    let m = null;
    try {
        m = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(jugada)
            ? new Chess(board.fen()).move({ from: jugada.slice(0, 2), to: jugada.slice(2, 4), promotion: jugada[4] || "q" })
            : new Chess(board.fen()).move(jugada, { sloppy: true });
    } catch (e) { m = null; }
    if (!m) return null;
    return board.jugar({ from: m.from, to: m.to, promotion: m.promotion });
}

function finalDeLaPartida(g) {
    if (g.in_checkmate()) {
        const gana = g.turn() === "w" ? "b" : "w";
        return "¡Jaque mate! Ganaron las " + colorEscrito(gana) + (gana === partidaClase.color ? ": ganó la clase. 🎉" : ".");
    }
    if (g.in_stalemate()) return "Tablas por ahogado.";
    if (g.in_threefold_repetition()) return "Tablas por triple repetición.";
    if (g.insufficient_material()) return "Tablas: no queda material para dar mate.";
    return "Tablas.";
}

async function empezarPartidaClase() {
    if (board.freeMode) { setStatus("Aplica o cancela la posición que estás armando antes de empezar."); return; }
    board.viewLive();
    renderMoveList();
    transmitirVista();
    const fen = board.fen();
    const motivo = motivoPosicionInvalida(fen);
    if (motivo) { setStatus(motivo); return; }
    if (new Chess(fen).game_over()) { setStatus("En esta posición la partida ya terminó."); return; }
    partidaClase = {
        rival: document.getElementById("partida-rival").value === "profe" ? "profe" : "motor",
        color: document.getElementById("partida-color").value === "b" ? "b" : "w",
        nivel: document.getElementById("partida-nivel").value || "1500",
        segundos: parseInt(document.getElementById("partida-segundos").value, 10) || 30,
    };
    guardarPartidaClase();
    document.getElementById("partida-ultima").textContent = "";
    if (partidaClase.rival === "motor" && typeof PracticeEngine !== "undefined") PracticeEngine.preload();
    pintarPartidaClase();
    await seguirPartidaClase();
}

async function seguirPartidaClase() {
    if (!partidaClase || votacion || motorPensandoPartida) return;
    document.getElementById("partida-reabrir-btn").hidden = true;
    const g = new Chess(board.fen());
    if (g.game_over()) { terminarPartidaClase(finalDeLaPartida(g)); return; }
    if (g.turn() === partidaClase.color) { await abrirVotacion(); return; }
    if (partidaClase.rival === "motor") { await jugarMotorEnLaPartida(); return; }
    pintarPartidaClase("Te toca a ti con las " + colorEscrito(g.turn()) + ": juega en el tablero de la clase.");
}

async function abrirVotacion() {
    const fen = board.fen();
    const contra = partidaClase.rival === "motor" ? "el motor" : "tu profe";
    votacion = { id: null, fen, cierre: null };
    const { data, error } = await crearPregunta(fen, 1, null, false, {
        prompt: "La clase contra " + contra + ": ¿qué jugamos con las " + colorEscrito(partidaClase.color) + "?",
        tiempo: partidaClase.segundos,
    });
    if (error || !data) {
        votacion = null;
        console.error(error);
        pintarPartidaClase("No se pudo abrir la votación" + (error ? ": " + error.message : "."));
        document.getElementById("partida-reabrir-btn").hidden = false;
        return;
    }
    votacion.id = data.id;
    // La base acepta votos hasta 5 segundos después del plazo: se cierra un poco después.
    votacion.cierre = setTimeout(() => cerrarVotacion(), (partidaClase.segundos + 6) * 1000);
    pintarPartidaClase("🗳️ La clase está votando (" + PreguntaClase.textoDeTiempo(partidaClase.segundos) + ").");
    computeEngineAnswer(data.id, fen, 1);
}

async function cerrarVotacion() {
    if (!votacion || !votacion.id) return;
    const v = votacion;
    clearTimeout(v.cierre);
    const filas = (await cargarResultados({ id: v.id })) || [];
    await sb.from("questions").update({ closed_at: new Date().toISOString() }).eq("id", v.id);
    votacion = null;
    if (!partidaClase) return;
    /* Los votos se juntan por la JUGADA, no por cómo se escribió: «e7e5» y
       «e5» son el mismo voto. Contarlos aparte partía los votos y podía
       inventar un empate. Lo que no es legal en la posición no cuenta. */
    const porJugada = new Map();
    filas.filter((f) => f.cuantos > 0).forEach((f) => {
        let m = null;
        try {
            m = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(f.respuesta)
                ? new Chess(v.fen).move({ from: f.respuesta.slice(0, 2), to: f.respuesta.slice(2, 4), promotion: f.respuesta[4] || "q" })
                : new Chess(v.fen).move(f.respuesta, { sloppy: true });
        } catch (e) { m = null; }
        if (!m) return;
        const x = porJugada.get(m.san) || { respuesta: m.san, cuantos: 0 };
        x.cuantos += f.cuantos;
        porJugada.set(m.san, x);
    });
    const conVotos = [...porJugada.values()].sort((a, b) => b.cuantos - a.cuantos || a.respuesta.localeCompare(b.respuesta));
    if (!conVotos.length) {
        pintarPartidaClase("Nadie votó. Sigue la partida cuando estén listos: se abre otra votación.");
        document.getElementById("partida-reabrir-btn").hidden = false;
        return;
    }
    if (clavePosicion(board.fen()) !== clavePosicion(v.fen)) {
        pintarPartidaClase("El tablero cambió durante la votación, así que no se jugó nada.");
        document.getElementById("partida-reabrir-btn").hidden = false;
        return;
    }
    const total = conVotos.reduce((a, f) => a + f.cuantos, 0);
    const max = Math.max(...conVotos.map((f) => f.cuantos));
    const empatadas = conVotos.filter((f) => f.cuantos === max);
    const elegida = empatadas[Math.floor(Math.random() * empatadas.length)];
    const sanDe = (r) => { try { const m = new Chess(v.fen).move(r, { sloppy: true }); return m ? m.san : r; } catch (e) { return r; } };
    const jugada = jugarEnElTablero(elegida.respuesta);
    if (!jugada) {
        pintarPartidaClase("La jugada más votada no se pudo jugar. Vuelve a abrir la votación.");
        document.getElementById("partida-reabrir-btn").hidden = false;
        return;
    }
    // Los votos quedan como comentario de la jugada: van con la partida de la clase al PGN y a «Repasar mis clases».
    anotarVotos(board.moves(), conVotos.map((f) => ({ san: sanDe(f.respuesta), cuantos: f.cuantos })), total, empatadas.length > 1);
    document.getElementById("partida-ultima").textContent = "La clase jugó " + jugada.san + " (" + max + " de " + total + (total === 1 ? " voto" : " votos")
        + (empatadas.length > 1 ? "; hubo empate entre " + empatadas.map((f) => sanDe(f.respuesta)).join(", ") + " y se sorteó" : "") + ").";
    // board.jugar avisa a onMove, que sigue la partida (ver despuesDeJugarEnLaPartida).
}

/* Los votos de una jugada, como comentario de esa jugada (game_state.comentarios,
   el mismo de «📝 Comentar»): así la partida votada se repasa sabiendo qué
   pensaba la clase, sin guardar nada aparte. */
async function anotarVotos(camino, filas, total, sorteo) {
    if (!camino.length) return;
    const k = PgnClase.clave(camino);
    const texto = ("Votos de la clase: " + filas.map((f) => f.san + " " + f.cuantos).join(", ")
        + " (" + total + (total === 1 ? " voto" : " votos") + (sorteo ? "; hubo empate y se sorteó" : "") + ").").slice(0, 300);
    const nuevos = Object.assign({}, comentariosClase, { [k]: { nag: null, texto } });
    const { error } = await sb.from("game_state").update({ comentarios: nuevos }).eq("id", myGameStateId);
    if (error) { console.error(error); return; }
    comentariosClase = nuevos;
    renderMoveList();
}

// «🗳️ Jugar votando» de una posición del plan: la manda al tablero y empieza desde ella, con la clase del lado que mueve.
async function jugarVotandoDesde(fen) {
    if (partidaClase) { setStatus("Ya hay una partida de la clase en curso: termínala antes de empezar otra."); return; }
    if (!(await aplicarPosicionEnClase(fen))) return;
    document.getElementById("partida-color").value = new Chess(fen).turn() === "b" ? "b" : "w";
    activateTeacherTab("preguntar");
    document.getElementById("partida-clase").open = true;
    await empezarPartidaClase();
}

async function jugarMotorEnLaPartida() {
    motorPensandoPartida = true;
    pintarPartidaClase("🤖 El motor está pensando…");
    const fen = board.fen();
    let uci = null;
    try { uci = typeof PracticeEngine !== "undefined" ? await PracticeEngine.getMove(fen, partidaClase ? partidaClase.nivel : "1500") : null; } catch (e) { uci = null; }
    if (!uci && typeof PracticeEngine !== "undefined") uci = PracticeEngine.jugadaDeRespaldo(fen);
    motorPensandoPartida = false;
    if (!partidaClase) return;
    if (clavePosicion(board.fen()) !== clavePosicion(fen)) { seguirPartidaClase(); return; }
    const jugada = uci ? jugarEnElTablero(uci) : null;
    if (!jugada) {
        pintarPartidaClase("El motor no pudo jugar. Juega tú su jugada en el tablero y la partida sigue.");
        return;
    }
    const ultima = document.getElementById("partida-ultima");
    ultima.textContent = (ultima.textContent ? ultima.textContent + " " : "") + "El motor contestó " + jugada.san + ".";
}

// Después de cada jugada en el tablero del profe (la de la clase, la del motor o la suya).
function despuesDeJugarEnLaPartida() {
    if (!partidaClase || votacion || motorPensandoPartida) return;
    setTimeout(seguirPartidaClase, 300);
}

async function terminarPartidaClase(mensaje) {
    if (votacion) {
        clearTimeout(votacion.cierre);
        if (votacion.id) await sb.from("questions").update({ closed_at: new Date().toISOString() }).eq("id", votacion.id);
        votacion = null;
    }
    partidaClase = null;
    guardarPartidaClase();
    pintarPartidaClase("");
    setStatus(mensaje || "Terminaste la partida de la clase.");
}

if (document.getElementById("partida-empezar-btn")) {
    const niveles = document.getElementById("partida-nivel");
    const LEVELS = typeof PracticeEngine !== "undefined" ? PracticeEngine.LEVELS : { "1500": { label: "1500 de fuerza" } };
    Object.keys(LEVELS).forEach((k) => {
        const o = document.createElement("option");
        o.value = k;
        o.textContent = LEVELS[k].label;
        niveles.appendChild(o);
    });
    document.getElementById("partida-rival").addEventListener("change", (e) => {
        niveles.disabled = e.target.value !== "motor";
    });
    document.getElementById("partida-empezar-btn").addEventListener("click", empezarPartidaClase);
    document.getElementById("partida-jugar-ya-btn").addEventListener("click", cerrarVotacion);
    document.getElementById("partida-reabrir-btn").addEventListener("click", seguirPartidaClase);
    document.getElementById("partida-terminar-btn").addEventListener("click", () => terminarPartidaClase());
    // Al recargar, la partida queda en pausa: se sigue con un botón, no sola.
    try { partidaClase = JSON.parse(sessionStorage.getItem(PARTIDA_CLAVE) || "null"); } catch (e) { partidaClase = null; }
    if (partidaClase) {
        pintarPartidaClase("La partida de la clase quedó en pausa al recargar la página.");
        const b = document.getElementById("partida-reabrir-btn");
        b.hidden = false;
    }
}
