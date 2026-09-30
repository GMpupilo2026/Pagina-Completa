/* El código de sesion.html.

   La posición de calentamiento (game_state.calentamiento). Ver «El mapa de
   jugadas, el calentamiento y el podio» en docs/decisiones/clase-en-vivo.md.

   Es una parte de js/sesion.js que se mudó a su archivo tal cual: un script
   clásico, cargado ANTES que sesion.js. Usa lo de sesion.js (board, sb,
   profile, isTeacher, myGameStateId, setStatus…) solo dentro de funciones,
   que corren cuando sesion.js ya cargó; y sesion.js llama a las de acá del
   mismo modo. Las `let`/`const` de arriba de un script clásico son globales
   para todos los scripts de la página: por eso se ven de un lado al otro. Ver
   «sesion.js en partes» en docs/decisiones/clase-en-vivo.md. */

/* ---------- Posición de calentamiento (game_state.calentamiento) ----------
   Una posición para resolver mientras empieza la clase: cada alumno la
   juega en su propio tablero, sin que cuente como pregunta. La primera
   jugada se compara con la solución (la del ejercicio de Táctica, o la
   que calcula el motor en la computadora del profe al mandarla). Quién
   la resolvió va en la presencia: es de ese rato, no se guarda. */
let calentamientoActual = null;
let calentamientoBoard = null;
let calentamientoPintadoPara = null;
let calentamientoAcc = null;

const aUci = (m) => m.from + m.to + (m.promotion || "");
/* En Modo Adaptado la jugada se escribe en palabras («caballo felix 3»): la
   notación inglesa de chess.js («Nf3») el lector de pantalla la deletrea, y
   quien no ve el tablero no sabe qué le están diciendo que jugó. */
const sanDelCalentamiento = (san) => (window.ClaseAdaptada && window.CuadroComandos && CuadroComandos.activo()
    ? ClaseAdaptada.hablarJugada(san) : san);
function solucionEnUci(fen, jugadas) {
    const g = new Chess(fen);
    const out = [];
    for (const j of jugadas || []) {
        let m = null;
        try { m = g.move(j, { sloppy: true }); } catch (e) { m = null; }
        if (!m) break;
        out.push(aUci(m));
    }
    return out;
}

async function mandarCalentamiento(fen, solucion, titulo) {
    const motivo = motivoPosicionInvalida(fen);
    if (motivo) { setStatus(motivo); return false; }
    let uci = solucionEnUci(fen, solucion);
    if (!uci.length && typeof PracticeEngine !== "undefined") {
        setStatus("🔥 Buscando con el motor la mejor jugada del calentamiento…");
        const mejor = await PracticeEngine.getMove(fen, "max");
        uci = solucionEnUci(fen, mejor ? [mejor] : []);
    }
    const calentamiento = { at: new Date().toISOString(), fen, solucion: uci.length ? uci : null, titulo: (titulo || "").slice(0, 140) || null };
    const { error } = await sb.from("game_state").update({ calentamiento }).eq("id", myGameStateId);
    if (error) { console.error(error); setStatus("No se pudo mandar el calentamiento: " + error.message); return false; }
    pintarCalentamiento(calentamiento);
    setStatus("🔥 Calentamiento enviado: cada alumno lo resuelve en su propio tablero. Debajo del tablero ves cuántos ya lo resolvieron.");
    return true;
}

function pintarCalentamiento(cal) {
    calentamientoActual = cal && cal.fen ? cal : null;
    anunciarALaClase("calentamiento", calentamientoActual ? calentamientoActual.at : null,
        "Tu profe puso una posición de calentamiento" + (calentamientoActual && calentamientoActual.titulo ? ": " + calentamientoActual.titulo : "")
        + ". Resuélvela en tu tablero, debajo del de la clase.");
    const caja = document.getElementById("calentamiento-caja");
    if (!caja) return;
    caja.hidden = !calentamientoActual;
    document.getElementById("calentamiento-titulo").textContent = calentamientoActual && calentamientoActual.titulo ? ": " + calentamientoActual.titulo : "";
    document.getElementById("calentamiento-profe").hidden = !isTeacher;
    document.getElementById("calentamiento-alumno").hidden = isTeacher || esObservador;
    if (!calentamientoActual) { calentamientoPintadoPara = null; return; }
    if (isTeacher) { pintarCuentaCalentamiento(); return; }
    if (esObservador || calentamientoPintadoPara === calentamientoActual.at) return;
    calentamientoPintadoPara = calentamientoActual.at;
    empezarCalentamiento();
}

function empezarCalentamiento() {
    const cal = calentamientoActual;
    if (!cal) return;
    if (!calentamientoBoard) {
        calentamientoBoard = new ClasesBoard(document.getElementById("calentamiento-tablero"), {
            interactive: true, allowArrows: false, externalCoords: true,
            onMove: () => juzgarCalentamiento(),
        });
        calentamientoAcc = window.ClaseAdaptada ? ClaseAdaptada.montar(document.getElementById("calentamiento-cmd"), () => calentamientoBoard, {
            etiqueta: "Escribe tu jugada del calentamiento",
            porQueNoPuedes: () => calentamientoResuelto === (calentamientoActual && calentamientoActual.at)
                ? "Ya lo resolviste." : "Toca «Intentarlo otra vez» para volver a jugar.",
        }) : null;
    }
    const color = cal.fen.split(" ")[1] === "b" ? "b" : "w";
    calentamientoBoard.setFlipped(color === "b");
    calentamientoBoard.loadFen(cal.fen);
    calentamientoBoard.setInteractive(calentamientoResuelto !== cal.at);
    if (calentamientoAcc) calentamientoAcc.actualizar();
    document.getElementById("calentamiento-turno").textContent = (color === "b" ? "Juegan ⚫ Negras" : "Juegan ⚪ Blancas") + ": encuentra la mejor jugada.";
    document.getElementById("calentamiento-msg").textContent = calentamientoResuelto === cal.at ? "✅ ¡Ya lo resolviste!" : "";
    document.getElementById("calentamiento-otra-btn").hidden = true;
    document.getElementById("calentamiento-solucion-btn").hidden = !cal.solucion || calentamientoResuelto === cal.at;
    /* En Modo Adaptado el foco va a su recuadro: la caja aparece debajo del
       tablero de la clase, y el aviso de #clase-voz dice que está pero no lleva
       a ella. Sin esto, quien no ve la pantalla tenía que salir a buscarla
       tabulando por toda la página. Solo con un calentamiento NUEVO (esto no
       corre con «Intentarlo otra vez»), y solo si falta resolverlo. */
    if (calentamientoAcc && CuadroComandos.activo() && calentamientoResuelto !== cal.at) {
        enfocarCuandoSeVea(calentamientoAcc.cmd.input);
    }
}

async function juzgarCalentamiento() {
    const cal = calentamientoActual;
    if (!cal) return;
    calentamientoBoard.setInteractive(false);
    const g = new Chess(cal.fen);
    const jugada = calentamientoBoard.moves()[0];
    const m = jugada ? g.move(jugada) : null;
    const msg = document.getElementById("calentamiento-msg");
    const bien = !!(m && cal.solucion && cal.solucion[0] === aUci(m));
    if (bien) {
        msg.textContent = "✅ ¡Bien! " + sanDelCalentamiento(m.san) + " es la jugada.";
        document.getElementById("calentamiento-solucion-btn").hidden = true;
        document.getElementById("calentamiento-otra-btn").hidden = true;
        calentamientoResuelto = cal.at;
        if (presenceChannel) await presenceChannel.track(metaDePresencia());
    } else {
        msg.textContent = cal.solucion ? "❌ " + (m ? sanDelCalentamiento(m.san) : "Esa") + " no es la mejor. Inténtalo otra vez." : "Tu profe no dejó la solución de esta posición: coméntala en la clase.";
        document.getElementById("calentamiento-otra-btn").hidden = false;
    }
}

document.getElementById("calentamiento-otra-btn").addEventListener("click", () => {
    if (!calentamientoActual) return;
    calentamientoBoard.loadFen(calentamientoActual.fen);
    calentamientoBoard.setInteractive(true);
    if (calentamientoAcc) calentamientoAcc.actualizar();
    document.getElementById("calentamiento-msg").textContent = "";
    document.getElementById("calentamiento-otra-btn").hidden = true;
});
document.getElementById("calentamiento-solucion-btn").addEventListener("click", () => {
    const cal = calentamientoActual;
    if (!cal || !cal.solucion) return;
    const g = new Chess(cal.fen);
    const sans = [];
    for (const u of cal.solucion) {
        const m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
        if (!m) break;
        sans.push(m.san);
    }
    calentamientoBoard.loadFen(cal.fen);
    calentamientoBoard.setInteractive(false);
    calentamientoBoard.setMarks([{ from: cal.solucion[0].slice(0, 2), to: cal.solucion[0].slice(2, 4), color: "verde" }], []);
    document.getElementById("calentamiento-msg").textContent = "La solución: "
        + (CuadroComandos.activo() ? sans.map(sanDelCalentamiento).join(", ") : sans.join(" ")) + ".";
    document.getElementById("calentamiento-otra-btn").hidden = true;
    document.getElementById("calentamiento-solucion-btn").hidden = true;
});

// Cuántos de los conectados ya lo resolvieron (lo dice la presencia de cada uno).
function pintarCuentaCalentamiento() {
    const el = document.getElementById("calentamiento-cuenta");
    if (!el || !isTeacher || !calentamientoActual) return;
    const conectados = [...onlineStudents.values()];
    const listos = conectados.filter((s) => s.calentamiento === calentamientoActual.at).length;
    el.textContent = conectados.length
        ? listos + " de " + conectados.length + (conectados.length === 1 ? " conectado ya lo resolvió." : " conectados ya lo resolvieron.")
        : "Todavía no hay alumnos conectados.";
}

if (document.getElementById("calentamiento-terminar-btn")) {
    document.getElementById("calentamiento-terminar-btn").addEventListener("click", async () => {
        const { error } = await sb.from("game_state").update({ calentamiento: null }).eq("id", myGameStateId);
        if (error) { console.error(error); setStatus("No se pudo terminar: " + error.message); return; }
        pintarCalentamiento(null);
    });
}
