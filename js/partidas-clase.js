/* Las partidas entre alumnos de la clase en vivo, y el reloj de la práctica
 * contra el motor: lo que no depende de la página.
 *
 * Las partidas son las de siempre (`game_rooms`, variante estándar, en
 * estandar.html): mismo reloj que valida el servidor y mismo aviso de pareo
 * que llega a cualquier página (js/juego-aviso.js). Lo nuevo es armarlas de a
 * muchas con un clic, desde la posición de la clase si se quiere, y que queden
 * ligadas a la clase (game_rooms.class_session_id, lo pone un trigger).
 *
 * El reloj de la práctica es otra cosa: es contra una máquina, lo lleva el
 * navegador del alumno y solo sirve para entrenar el manejo del tiempo.
 */
window.PartidasClase = (function () {
    const RITMOS = [
        { inicial: 180, incremento: 2, texto: "3 + 2" },
        { inicial: 300, incremento: 3, texto: "5 + 3" },
        { inicial: 600, incremento: 5, texto: "10 + 5" },
        { inicial: 900, incremento: 10, texto: "15 + 10" },
    ];

    const RELOJES_PRACTICA = [
        { segundos: null, texto: "Sin reloj" },
        { segundos: 60, texto: "1 minuto" },
        { segundos: 180, texto: "3 minutos" },
        { segundos: 300, texto: "5 minutos" },
        { segundos: 600, texto: "10 minutos" },
    ];

    /* Parejas al azar, con el color también al azar. Con un número impar,
       uno queda sin pareja y se dice quién: no se lo deja fuera callado.
       `azar` es inyectable para que la prueba sea repetible. */
    function emparejar(ids, azar) {
        const r = azar || Math.random;
        const lista = ids.slice();
        for (let i = lista.length - 1; i > 0; i--) {
            const j = Math.floor(r() * (i + 1));
            [lista[i], lista[j]] = [lista[j], lista[i]];
        }
        const parejas = [];
        for (let i = 0; i + 1 < lista.length; i += 2) {
            const a = lista[i], b = lista[i + 1];
            parejas.push(r() < 0.5 ? { blancas: a, negras: b } : { blancas: b, negras: a });
        }
        return { parejas, sobra: lista.length % 2 ? lista[lista.length - 1] : null };
    }

    // Ventaja en material de una posición (positivo = blancas arriba), leída
    // directo de la FEN: para decir quién va ganando mientras la partida está
    // en juego no hace falta un motor, solo contar piezas.
    const VALOR_MATERIAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    function ventajaDeMaterial(fen) {
        const tablero = (fen || "").split(" ")[0] || "";
        let dif = 0;
        for (const c of tablero) {
            const v = VALOR_MATERIAL[c.toLowerCase()];
            if (!v) continue;
            dif += c === c.toUpperCase() ? v : -v;
        }
        return dif;
    }

    // Cómo va una partida, dicho con los nombres. Mientras está en juego, el
    // color nunca va solo (ver «Ningún color se elige a ojo» en CLAUDE.md): se
    // escribe quién tiene la ventaja y cuánta.
    function estado(room, nombre) {
        const b = nombre(room.white_id), n = nombre(room.black_id);
        if (room.status === "finished" || room.result) {
            if (room.result === "draw") return "Tablas";
            if (room.result === "white") return "Ganó " + b + " (blancas)";
            if (room.result === "black") return "Ganó " + n + " (negras)";
            return "Terminada";
        }
        const jugadas = (room.moves || []).length;
        if (!jugadas) return "Por empezar";
        const dif = ventajaDeMaterial(room.fen);
        const ventaja = dif > 0 ? " · " + b + " +" + dif : dif < 0 ? " · " + n + " +" + (-dif) : "";
        return "En juego · " + jugadas + " jugadas" + ventaja;
    }

    function reloj(ms) {
        const s = Math.max(0, Math.ceil(ms / 1000));
        return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    }

    /* A quién le toca responder: al azar, pero entre los conectados que llevan
       MENOS turnos en esta clase. Con el azar puro el mismo alumno sale tres
       veces seguidas y otro nunca; así nadie repite hasta que les toque a
       todos, y quien se conecta tarde (con cero) entra primero. `cuentas` es
       un Map id → veces, armado de clase_elegidos: sobrevive a recargar la
       página. Devuelve null si no hay nadie conectado. */
    function elegirConMenos(conectados, cuentas, azar) {
        if (!conectados.length) return null;
        const veces = (id) => (cuentas && cuentas.get(id)) || 0;
        const minimo = Math.min(...conectados.map(veces));
        const pendientes = conectados.filter((id) => veces(id) === minimo);
        const r = azar || Math.random;
        return pendientes[Math.floor(r() * pendientes.length)];
    }

    return { RITMOS, RELOJES_PRACTICA, emparejar, estado, reloj, elegirConMenos, ventajaDeMaterial };
})();
