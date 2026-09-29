/* El código de sesion.html.

   El mapa de jugadas de una pregunta en el tablero de la clase
   (game_state.encuesta). Ver «El mapa de jugadas, el calentamiento y el
   podio» en docs/decisiones/clase-en-vivo.md.

   Es una parte de js/sesion.js que se mudó a su archivo tal cual: un script
   clásico, cargado ANTES que sesion.js. Usa lo de sesion.js (board, sb,
   profile, isTeacher, myGameStateId, setStatus…) solo dentro de funciones,
   que corren cuando sesion.js ya cargó; y sesion.js llama a las de acá del
   mismo modo. Las `let`/`const` de arriba de un script clásico son globales
   para todos los scripts de la página: por eso se ven de un lado al otro. Ver
   «sesion.js en partes» en docs/decisiones/clase-en-vivo.md. */

/* ---------- El mapa de jugadas (game_state.encuesta) ----------
   Lo que contestó la clase en una pregunta de jugada, pasado al tablero
   de todos: las cinco jugadas más elegidas como flechas, y debajo,
   escrito, qué jugada es cada color y cuántos la eligieron. Sin
   nombres: los números salen de resultados_de_la_pregunta(), como los
   resultados que ya se le muestran a la clase. */
const COLORES_ENCUESTA = ["verde", "azul", "naranja", "rojo", "negro"];
const NOMBRE_COLOR = { verde: "Verde", azul: "Azul", naranja: "Naranja", rojo: "Rojo", negro: "Negro" };
let encuestaActual = null;

async function pasarEncuestaAlTablero() {
    const q = currentQuestion;
    if (!q || PreguntaClase.esDeOpciones(q)) return;
    const filas = await cargarResultados(q);
    if (!filas) { setStatus("No se pudo contar lo que contestó la clase."); return; }
    const arrows = [], lineas = [];
    filas.filter((f) => f.cuantos > 0).forEach((f) => {
        if (arrows.length >= COLORES_ENCUESTA.length) return;
        let m = null;
        try { m = new Chess(q.fen).move(f.respuesta, { sloppy: true }); } catch (e) { m = null; }
        if (!m) return;
        const color = COLORES_ENCUESTA[arrows.length];
        arrows.push({ from: m.from, to: m.to, color });
        lineas.push({ jugada: m.san, cuantos: f.cuantos, color });
    });
    if (!lineas.length) { setStatus("Todavía nadie contestó con una jugada: no hay mapa que pasar."); return; }
    // Las flechas van en el tablero de la clase, así que tiene que tener la posición de la pregunta.
    let k = jugadaDeLaPosicion(q.fen);
    if (k === -1) {
        const seguir = await Avisos.confirmar("El tablero de la clase ya no tiene la posición de la pregunta. Para pasar el mapa hay que volver a mandarla, y la partida que está ahora se reemplaza.",
            { titulo: "¿Volver a la posición de la pregunta?", aceptar: "Mandar la posición y el mapa" });
        if (!seguir || !(await aplicarPosicionEnClase(q.fen))) return;
        k = 0;
    }
    if (k !== board.moves().length || board.isViewingHistory()) {
        if (k === board.moves().length) board.viewLive(); else board.viewMainAt(k);
        renderMoveList();
        await transmitirVista();
    }
    board.setMarks(arrows, []);
    const encuesta = { question_id: q.id, lineas };
    const { error } = await sb.from("game_state").update({ arrows, circles: [], encuesta }).eq("id", myGameStateId);
    if (error) { console.error(error); setStatus("No se pudo pasar el mapa: " + error.message); return; }
    pintarEncuesta(encuesta);
    setStatus("🗺️ La clase ve en el tablero lo que jugó: " + lineas.map((l) => l.jugada + " (" + l.cuantos + ")").join(", ") + ".");
}

function pintarEncuesta(encuesta) {
    encuestaActual = encuesta && Array.isArray(encuesta.lineas) && encuesta.lineas.length ? encuesta : null;
    const dicha = (san) => (window.BlindNotation && BlindNotation.sanSpoken ? BlindNotation.sanSpoken(san) : san);
    anunciarALaClase("encuesta", encuestaActual ? encuestaActual.question_id + ":" + encuestaActual.lineas.map((l) => l.jugada + l.cuantos).join(",") : null,
        "Tu profe pasó al tablero lo que jugó la clase: " + (encuestaActual ? encuestaActual.lineas.map((l) => {
            const n = Number(l.cuantos) || 0;
            return dicha(String(l.jugada || "")) + ", " + n + (n === 1 ? " alumno" : " alumnos") + " (flecha " + String(NOMBRE_COLOR[l.color] || "").toLowerCase() + ")";
        }).join("; ") : "") + ".");
    const caja = document.getElementById("encuesta-caja");
    if (!caja) return;
    caja.hidden = !encuestaActual;
    const ul = document.getElementById("encuesta-lineas");
    ul.innerHTML = "";
    if (!encuestaActual) return;
    encuestaActual.lineas.forEach((l) => {
        const li = document.createElement("li");
        li.className = "flex items-center gap-2";
        const color = ClasesBoard.MARK_COLORS[l.color] ? l.color : "naranja";
        const muestra = document.createElement("span");
        muestra.setAttribute("aria-hidden", "true");
        muestra.className = "inline-block w-3 h-3 rounded-full shrink-0";
        muestra.style.background = ClasesBoard.MARK_COLORS[color];
        const t = document.createElement("span");
        const n = Number(l.cuantos) || 0;
        // El color va escrito: la flecha sola no dice cuál es cuál.
        t.textContent = NOMBRE_COLOR[color] + ": " + String(l.jugada || "") + " — " + n + (n === 1 ? " alumno" : " alumnos");
        li.append(muestra, t);
        ul.appendChild(li);
    });
    document.getElementById("encuesta-quitar-btn").hidden = !isTeacher;
}

async function quitarEncuesta() {
    board.setMarks([], []);
    const { error } = await sb.from("game_state").update({ arrows: [], circles: [], encuesta: null }).eq("id", myGameStateId);
    if (error) { console.error(error); setStatus("No se pudo quitar el mapa: " + error.message); return; }
    pintarEncuesta(null);
}

if (document.getElementById("encuesta-btn")) {
    document.getElementById("encuesta-btn").addEventListener("click", pasarEncuestaAlTablero);
}
document.getElementById("encuesta-quitar-btn").addEventListener("click", quitarEncuesta);
