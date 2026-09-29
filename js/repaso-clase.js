/* El repaso personal de una clase: las preguntas de jugada que a UN alumno
 * no le salieron (las falló, no las contestó, o contestó otra cosa que el
 * motor sin que el profe la calificara).
 *
 * La regla está una sola vez porque la usan dos pantallas: el cierre de la
 * clase en sesion.html decide a quién mandarle la tarea, y
 * repasar-clases.html?repaso= le muestra a cada alumno las suyas. Si cada una
 * tuviera su copia, a alguien le llegaría una tarea vacía.
 *
 * Solo entran las que tienen respuesta del motor (sin ella no hay contra qué
 * comparar) y las que ya se cerraron (la base no le da la respuesta del motor
 * al alumno mientras la pregunta está abierta). Las de opciones no: el
 * termómetro no tiene respuesta correcta. Van como mucho MAXIMO, en el orden
 * de la clase: una partida votada entera daría una tarea de treinta.
 */
window.RepasoClase = (function () {
    const MAXIMO = 10;

    function jugadaDe(fen, texto) {
        if (!texto || typeof Chess === "undefined") return null;
        try {
            const g = new Chess(fen);
            return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(texto)
                ? g.move({ from: texto.slice(0, 2), to: texto.slice(2, 4), promotion: texto[4] || undefined })
                : g.move(texto, { sloppy: true });
        } catch (e) { return null; }
    }

    function igualJugada(fen, a, b) {
        const ma = jugadaDe(fen, a), mb = jugadaDe(fen, b);
        return !!(ma && mb && ma.from === mb.from && ma.to === mb.to && (ma.promotion || "") === (mb.promotion || ""));
    }

    /* preguntas: [{id, fen, tipo, para_alumno, closed_at, created_at}]
       respuestas: [{question_id, student_id, moves, is_correct}]
       motor: [{question_id, answer: {moves}}]
       Devuelve [{pregunta, jugada}] (jugada: la del motor, en SAN). */
    function pendientes(preguntas, respuestas, motor, alumnoId) {
        return (preguntas || [])
            .filter((q) => q.fen && q.tipo !== "opciones" && q.closed_at && (!q.para_alumno || q.para_alumno === alumnoId))
            .slice()
            .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
            .map((q) => {
                const m = (motor || []).find((x) => x.question_id === q.id);
                const clave = m && m.answer && Array.isArray(m.answer.moves) ? m.answer.moves[0] : null;
                return { pregunta: q, jugada: clave };
            })
            .filter((x) => {
                if (!x.jugada || !jugadaDe(x.pregunta.fen, x.jugada)) return false;
                const r = (respuestas || []).find((a) => a.question_id === x.pregunta.id && a.student_id === alumnoId);
                if (!r) return true;
                if (r.is_correct === false) return true;
                if (r.is_correct === true) return false;
                return !igualJugada(x.pregunta.fen, (r.moves || [])[0], x.jugada);
            })
            .slice(0, MAXIMO);
    }

    function href(claseId) { return "repasar-clases.html?repaso=" + encodeURIComponent(claseId); }

    return { MAXIMO, pendientes, igualJugada, jugadaDe, href };
})();
