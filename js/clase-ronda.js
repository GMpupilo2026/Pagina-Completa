/* El código de sesion.html.

   La ronda rápida: varias posiciones de Táctica seguidas, cada una una
   pregunta con tiempo (la de siempre), que se califica sola con la solución
   del ejercicio. Al final, el resultado de la ronda y su podio. Ver «La ronda
   rápida» en docs/decisiones/clase-en-vivo.md.

   Como las demás partes de la clase (ver «sesion.js en partes»), es un script
   clásico cargado ANTES que sesion.js: usa lo de sesion.js (board, sb,
   crearPregunta, aplicarPosicionEnClase, setStatus…) solo dentro de
   funciones. La parte que no toca la página (RondaRapida) es pura, para
   poder probarla sola. */

window.RondaRapida = (function () {
    const TAMANO = 5;

    // Cinco al azar de los que se ven (sin repetir). `azar` para las pruebas.
    function elegir(ids, cuantos, azar) {
        const r = azar || Math.random;
        const copia = (ids || []).slice();
        for (let i = copia.length - 1; i > 0; i--) {
            const j = Math.floor(r() * (i + 1));
            [copia[i], copia[j]] = [copia[j], copia[i]];
        }
        return copia.slice(0, cuantos || TAMANO);
    }

    /* Buena: la primera jugada de la solución, o cualquier mate (los bancos
       guardan UNA solución y a veces hay más de un mate). */
    function esBuena(fen, moves, solucion) {
        const primera = (moves || [])[0];
        if (!primera || typeof Chess === "undefined") return false;
        let m = null, g = null;
        try { g = new Chess(fen); m = g.move(primera, { sloppy: true }); } catch (e) { m = null; }
        if (!m) return false;
        if (g.in_checkmate()) return true;
        return !!(solucion && solucion[0] && window.RepasoClase && window.RepasoClase.igualJugada(fen, primera, solucion[0]));
    }

    /* El resultado: cuántas buenas tuvo cada uno, ordenado, con puesto
       compartido en el empate (como el podio de la clase). `nombres` es
       {id: nombre}. Van también los que contestaron y no acertaron ninguna. */
    function resultado(respuestas, nombres) {
        const por = {};
        (respuestas || []).forEach((a) => {
            const x = por[a.student_id] = por[a.student_id] || { id: a.student_id, nombre: (nombres || {})[a.student_id] || "Alumno", buenas: 0, contestadas: 0 };
            x.contestadas += 1;
            if (a.is_correct === true) x.buenas += 1;
        });
        const lista = Object.values(por).sort((a, b) => b.buenas - a.buenas || String(a.nombre).localeCompare(String(b.nombre)));
        let puesto = 0, anterior = null;
        lista.forEach((x, i) => { if (x.buenas !== anterior) { puesto = i + 1; anterior = x.buenas; } x.puesto = puesto; });
        return lista;
    }

    return { TAMANO, elegir, esBuena, resultado };
})();

let ronda = null;          // {ejercicios, i, segundos, preguntas: [{id, fen, solucion}], cierre}
let ultimaRonda = null;    // el resultado de la última, para el podio

function pintarRonda(estado) {
    const enCurso = document.getElementById("ronda-en-curso");
    if (!enCurso) return;
    enCurso.hidden = !ronda;
    if (estado !== undefined) document.getElementById("ronda-estado").textContent = estado;
}

async function empezarRonda(ejercicios) {
    if (ronda) { setStatus("Ya hay una ronda en curso: termínala antes de empezar otra."); return; }
    if (partidaClase) { setStatus("Hay una partida de la clase en curso: termínala antes de empezar una ronda."); return; }
    if (cuestionarioEnJuego) { setStatus("Hay un cuestionario en juego: termínalo antes de empezar una ronda."); return; }
    if (!ejercicios.length) return;
    const sel = document.getElementById("ronda-segundos");
    ronda = { ejercicios, i: -1, segundos: (sel && parseInt(sel.value, 10)) || 30, preguntas: [], cierre: null };
    document.getElementById("ronda-resultado").hidden = true;
    activateTeacherTab("preguntar");
    document.getElementById("ronda-caja").open = true;
    pintarRonda();
    await siguienteDeLaRonda();
}

async function siguienteDeLaRonda() {
    if (!ronda) return;
    ronda.i += 1;
    if (ronda.i >= ronda.ejercicios.length) { await terminarRonda(); return; }
    const ex = ronda.ejercicios[ronda.i];
    const n = ronda.ejercicios.length;
    if (!(await aplicarPosicionEnClase(ex.fen))) { await terminarRonda("La posición " + (ronda.i + 1) + " no se pudo mandar: la ronda terminó."); return; }
    const { data, error } = await crearPregunta(ex.fen, 1, null, false, { prompt: "⚡ Ronda rápida: " + (ronda.i + 1) + " de " + n, tiempo: ronda.segundos, dificultad: ex.rating });
    if (error || !data) { console.error(error); await terminarRonda("No se pudo abrir la pregunta: la ronda terminó."); return; }
    ronda.preguntas.push({ id: data.id, fen: ex.fen, solucion: ex.solucion || null });
    // La base acepta respuestas hasta 5 segundos después del plazo: se cierra un poco después.
    ronda.cierre = setTimeout(cerrarDeLaRonda, (ronda.segundos + 6) * 1000);
    pintarRonda("⚡ Posición " + (ronda.i + 1) + " de " + n + ": la clase está contestando (" + PreguntaClase.textoDeTiempo(ronda.segundos) + ").");
    computeEngineAnswer(data.id, ex.fen, 1);
}

// Cierra la pregunta de ahora, la califica y pasa a la siguiente.
async function cerrarDeLaRonda() {
    if (!ronda || !ronda.preguntas.length) return;
    clearTimeout(ronda.cierre);
    ronda.cierre = null;
    const p = ronda.preguntas[ronda.preguntas.length - 1];
    await sb.from("questions").update({ closed_at: new Date().toISOString() }).eq("id", p.id);
    await calificarDeLaRonda(p);
    if (!ronda) return;
    pintarRonda("Listo la " + (ronda.i + 1) + ". Viene la siguiente…");
    setTimeout(siguienteDeLaRonda, 1500);
}

/* Se califica sola: la solución del ejercicio es conocida. Así cuenta para
   los puntos y los trofeos como si el profe la hubiera marcado. Van dos
   pedidos como mucho (las buenas y las malas), no uno por alumno: con la
   clase entera eran veinte viajes en fila antes de la siguiente pregunta. */
async function calificarDeLaRonda(p) {
    const { data } = await sb.from("question_answers").select("id, student_id, moves, is_correct").eq("question_id", p.id);
    const cambian = { true: [], false: [] };
    for (const a of data || []) {
        const bien = RondaRapida.esBuena(p.fen, a.moves, p.solucion);
        if (a.is_correct !== bien) cambian[bien].push(a.id);
    }
    await Promise.all([true, false].filter((bien) => cambian[bien].length).map((bien) =>
        sb.from("question_answers").update({ is_correct: bien }).in("id", cambian[bien])));
}

async function terminarRonda(mensaje) {
    if (!ronda) return;
    const r = ronda;
    clearTimeout(r.cierre);
    ronda = null;
    pintarRonda("");
    // La que estaba abierta se cierra y se califica igual: lo contestado cuenta.
    const abierta = r.preguntas[r.preguntas.length - 1];
    if (abierta && r.cierre !== null) {
        await sb.from("questions").update({ closed_at: new Date().toISOString() }).eq("id", abierta.id);
        await calificarDeLaRonda(abierta);
    }
    const ids = r.preguntas.map((p) => p.id);
    const { data: resp } = ids.length ? await sb.from("question_answers").select("student_id, is_correct, question_id").in("question_id", ids) : { data: [] };
    const alumnos = [...new Set((resp || []).map((a) => a.student_id))];
    const { data: perfiles } = alumnos.length ? await sb.from("profiles").select("id, full_name, email").in("id", alumnos) : { data: [] };
    const nombres = {};
    (perfiles || []).forEach((p) => { nombres[p.id] = p.full_name || p.email; });
    ultimaRonda = { total: r.preguntas.length, lista: RondaRapida.resultado(resp, nombres) };
    pintarResultadoDeLaRonda();
    setStatus(mensaje || "⚡ Terminó la ronda rápida: " + r.preguntas.length + (r.preguntas.length === 1 ? " posición." : " posiciones."));
}

function pintarResultadoDeLaRonda() {
    const caja = document.getElementById("ronda-resultado");
    const lista = document.getElementById("ronda-resultado-lista");
    lista.innerHTML = "";
    caja.hidden = !ultimaRonda;
    if (!ultimaRonda) return;
    const t = document.createElement("p");
    t.className = "font-semibold text-brand-800 dark:text-brand-100";
    t.textContent = "Resultado de la ronda (" + ultimaRonda.total + (ultimaRonda.total === 1 ? " posición)" : " posiciones)");
    lista.appendChild(t);
    if (!ultimaRonda.lista.length) {
        const p = document.createElement("p");
        p.textContent = "Nadie contestó.";
        lista.appendChild(p);
        document.getElementById("ronda-podio-btn").hidden = true;
        return;
    }
    const ol = document.createElement("ol");
    ol.className = "mt-1 space-y-0.5";
    ultimaRonda.lista.forEach((x) => {
        const li = document.createElement("li");
        // El nombre lo escribió una persona: textContent.
        li.textContent = (PuntosClase.medalla(x.puesto) ? PuntosClase.medalla(x.puesto) + " " : "") + x.puesto + ".º " + x.nombre
            + " — " + x.buenas + " de " + ultimaRonda.total + (x.buenas === 1 ? " buena" : " buenas");
        ol.appendChild(li);
    });
    lista.appendChild(ol);
    document.getElementById("ronda-podio-btn").hidden = !ultimaRonda.lista.some((x) => x.buenas > 0);
}

// El podio de la ronda, en el mismo game_state.podio que el de la clase, con su título.
async function mostrarPodioDeLaRonda() {
    if (!ultimaRonda) return;
    const cb = document.getElementById("podio-con-nombres");
    const conNombres = cb ? cb.checked : true;
    const podio = {
        at: new Date().toISOString(), con_nombres: conNombres, titulo: "Podio de la ronda rápida",
        lineas: ultimaRonda.lista.filter((x) => x.buenas > 0).slice(0, 100)
            .map((x) => ({ id: x.id, nombre: conNombres ? x.nombre : null, puntos: x.buenas, puesto: x.puesto })),
    };
    const { error } = await sb.from("game_state").update({ podio }).eq("id", myGameStateId);
    if (error) { console.error(error); setStatus("No se pudo mostrar el podio: " + error.message); return; }
    pintarPodio(podio);
    setStatus("🏆 La clase ve el podio de la ronda rápida" + (conNombres ? ", con los nombres." : ", sin nombres."));
}

if (document.getElementById("ronda-siguiente-btn")) {
    document.getElementById("ronda-siguiente-btn").addEventListener("click", cerrarDeLaRonda);
    document.getElementById("ronda-terminar-btn").addEventListener("click", () => terminarRonda());
    document.getElementById("ronda-podio-btn").addEventListener("click", mostrarPodioDeLaRonda);
}
