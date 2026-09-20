/* Las tres posiciones que chess.js carga sin quejarse y que NO se pueden poner
 * en un tablero en vivo.
 *
 * Vivía dentro de `sesion.html`, donde nació: es la validación por la que pasan
 * las puertas que ponen una posición en la clase (el editor, el diagrama del
 * curso, Táctica, los archivos PGN). Se sacó acá cuando el armador de planes
 * (`planes.html`) necesitó la misma pregunta — y la necesita ANTES, que es
 * cuando conviene enterarse: una posición rota guardada en el plan no da ningún
 * error hasta que el profesor la manda al tablero, en medio de la clase.
 *
 * Una segunda copia se habría separado de la primera a la primera corrección,
 * y las dos hablan del mismo motor.
 *
 * Necesita chess.js cargado (window.Chess).
 */
window.PosicionValida = (function () {
    /* Devuelve el motivo por el que esta posición no sirve, o null si sirve.
       El texto es el que se le enseña a quien la escribió, así que dice qué
       hacer y no solo qué está mal. */
    function motivo(fen) {
        const parts = String(fen || "").split(" ");
        const filas = (parts[0] || "").split("/");
        if (filas.length !== 8) return "Esa posición no se pudo leer.";
        // chess.js no exige reyes al cargar un FEN (los acepta igual, sin avisar).
        if ((parts[0].match(/K/g) || []).length !== 1 || (parts[0].match(/k/g) || []).length !== 1) {
            return "Debe haber exactamente un rey blanco y un rey negro en el tablero.";
        }
        // Un peón en la primera o en la última fila ya habría coronado: imposible en una
        // partida real, y es justo la posición con la que Stockfish falla con un error de
        // memoria del que no se recupera solo — a partir de ahí Analizar, Preguntar y
        // Practicar dejan de responder hasta recargar la página.
        if (/[pP]/.test(filas[0]) || /[pP]/.test(filas[7])) {
            return "Posición inválida: no puede haber peones en la primera ni en la última fila.";
        }
        // El rey del bando que NO le toca mover no puede estar en jaque (ese bando ya
        // habría tenido que responder): para el motor esa posición no significa nada, y
        // analizarla da evaluaciones y jugadas sin sentido.
        const turnoContrario = parts[1] === "b" ? "w" : "b";
        const prueba = new Chess(filas.join("/") + " " + turnoContrario + " " + (parts[2] || "-") + " - 0 1");
        if (prueba.in_check && prueba.in_check()) {
            return "Posición inválida: el rey que NO le toca mover está en jaque (revisa el turno o quita la pieza que lo ataca).";
        }
        return null;
    }

    return { motivo };
})();
