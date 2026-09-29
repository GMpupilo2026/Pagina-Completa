/* Las preguntas de la clase en vivo, lo que no depende de la página:
 * el tiempo para contestar, las preguntas de opciones (con el termómetro «¿lo
 * entendiste?») y cómo se dice lo que contestó el grupo.
 *
 * Lo que manda está en la base (migración
 * preguntas_con_tiempo_opciones_y_resultados): el plazo lo cobra un trigger,
 * la opción correcta vive en preguntas_clave —que los alumnos no leen— y el
 * conteo sin nombres lo da resultados_de_la_pregunta(). Esto solo arma los
 * textos y las flechas, y lo usa sesion.js.
 *
 * Necesita chess.js (window.Chess) para las flechas.
 */
window.PreguntaClase = (function () {
    // Lo que se puede elegir para contestar (segundos; null = sin límite).
    const TIEMPOS = [
        { segundos: null, texto: "Sin límite" },
        { segundos: 30, texto: "30 segundos" },
        { segundos: 60, texto: "1 minuto" },
        { segundos: 120, texto: "2 minutos" },
        { segundos: 300, texto: "5 minutos" },
    ];

    const QUIEN_ESTA_MEJOR = {
        prompt: "¿Quién está mejor en esta posición?",
        opciones: ["Mejor las blancas", "Están iguales", "Mejor las negras"],
    };

    // El termómetro no tiene respuesta correcta: es para que el profe sepa si
    // seguir o repetir. Los emojis van dentro del texto de la opción, que se lee
    // completo («Lo entendí»), así que no dejan al lector de pantalla sin nada.
    const TERMOMETRO = {
        prompt: "¿Entendiste lo que acabamos de ver?",
        opciones: ["👍 Lo entendí", "🤔 Más o menos", "🙋 No lo entendí"],
    };

    // Segundos que le quedan, contando desde que la base creó la pregunta.
    // null si no tiene límite; nunca negativo.
    function segundosRestantes(pregunta, ahora) {
        if (!pregunta || !pregunta.tiempo_limite) return null;
        const inicio = new Date(pregunta.created_at).getTime();
        if (!isFinite(inicio)) return null;
        const fin = inicio + pregunta.tiempo_limite * 1000;
        return Math.max(0, Math.ceil((fin - (ahora == null ? Date.now() : ahora)) / 1000));
    }

    function reloj(segundos) {
        const m = Math.floor(segundos / 60), s = segundos % 60;
        return m + ":" + String(s).padStart(2, "0");
    }

    function textoRestante(segundos) {
        if (segundos === null) return "";
        if (segundos <= 0) return "⏱️ Se acabó el tiempo.";
        return "⏱️ Quedan " + reloj(segundos);
    }

    function esDeOpciones(pregunta) {
        return !!(pregunta && pregunta.tipo === "opciones" && Array.isArray(pregunta.opciones));
    }

    function textoDeOpcion(pregunta, i) {
        return esDeOpciones(pregunta) && pregunta.opciones[i] != null ? String(pregunta.opciones[i]) : "";
    }

    function plural(n, uno, varios) { return n + " " + (n === 1 ? uno : varios); }

    /* Las filas de resultados_de_la_pregunta, dichas: una por respuesta, con
       cuántos la eligieron y —en una de opciones con clave— cuál era. */
    function lineasDeResultados(pregunta, filas) {
        const total = (filas || []).reduce((a, f) => a + f.cuantos, 0);
        return (filas || []).map((f) => {
            const texto = esDeOpciones(pregunta) ? textoDeOpcion(pregunta, Number(f.respuesta)) : f.respuesta;
            const pct = total ? Math.round((f.cuantos * 100) / total) : 0;
            return {
                texto,
                cuantos: f.cuantos,
                porcentaje: pct,
                correcta: f.es_correcta === true,
                dicho: texto + ": " + plural(f.cuantos, "alumno", "alumnos") + (total ? " (" + pct + " %)" : "")
                    + (f.es_correcta === true ? ", la correcta" : ""),
            };
        });
    }

    function titularDeResultados(filas) {
        const total = (filas || []).reduce((a, f) => a + f.cuantos, 0);
        return total ? "Lo que contestó la clase (" + plural(total, "respuesta", "respuestas") + "):" : "Todavía nadie contestó.";
    }

    /* Una flecha por jugada contestada, desde la posición de la pregunta. La
       más elegida va en el primer color; las demás, en el segundo. Una jugada
       que chess.js no reconoce se salta: no se inventa una flecha. */
    function flechasDeResultados(fen, filas, colores) {
        if (typeof Chess === "undefined") return [];
        const out = [];
        (filas || []).forEach((f, i) => {
            const g = new Chess(fen);
            const m = g.move(f.respuesta, { sloppy: true });
            if (!m) return;
            out.push({ from: m.from, to: m.to, color: i === 0 ? colores[0] : colores[1] });
        });
        return out;
    }

    /* ---------- Tiempo para pensar (game_state.pensar) ----------
       Una cuenta regresiva para toda la clase, sin pregunta. La hora de
       arranque la pone la base (protect_game_state_teacher_columns); lo que
       falta se calcula acá. Al terminar, el aviso queda unos segundos más
       diciendo que se acabó, y después se va solo. */
    const TIEMPOS_PENSAR = [
        { segundos: 30, texto: "30 segundos" },
        { segundos: 60, texto: "1 minuto" },
        { segundos: 120, texto: "2 minutos" },
        { segundos: 180, texto: "3 minutos" },
        { segundos: 300, texto: "5 minutos" },
    ];
    const PENSAR_SUMA = 30;          // «+30 s»
    const PENSAR_QUEDA_AL_TERMINAR = 8;

    // null si no hay (o ya pasó); si no, {quedan, termino}.
    function estadoPensar(pensar, ahora) {
        if (!pensar || !pensar.at || !pensar.segundos) return null;
        const inicio = new Date(pensar.at).getTime();
        if (!isFinite(inicio)) return null;
        const t = ahora == null ? Date.now() : ahora;
        const fin = inicio + pensar.segundos * 1000;
        if (t > fin + PENSAR_QUEDA_AL_TERMINAR * 1000) return null;
        const quedan = Math.max(0, Math.ceil((fin - t) / 1000));
        return { quedan, termino: quedan <= 0 };
    }

    function textoDeTiempo(segundos) {
        const t = TIEMPOS_PENSAR.find((x) => x.segundos === segundos);
        if (t) return t.texto;
        const m = Math.floor(segundos / 60), s = segundos % 60;
        return (m ? plural(m, "minuto", "minutos") : "") + (m && s ? " y " : "") + (s ? plural(s, "segundo", "segundos") : "");
    }

    return {
        TIEMPOS_PENSAR, PENSAR_SUMA, estadoPensar, textoDeTiempo,
        TIEMPOS, QUIEN_ESTA_MEJOR, TERMOMETRO,
        segundosRestantes, textoRestante, reloj, esDeOpciones, textoDeOpcion,
        lineasDeResultados, titularDeResultados, flechasDeResultados,
    };
})();
