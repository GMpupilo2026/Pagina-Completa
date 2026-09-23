/**
 * Triple repetición en las partidas en línea.
 *
 * El tablero de una partida en línea se vuelve a cargar desde la FEN cada vez
 * que llega la jugada del rival (`loadFen`), y eso le borra a chess.js el
 * historial: su `in_threefold_repetition()` no ve nunca una posición repetida,
 * así que dos jugadores podían repetir la misma posición veinte veces y la
 * partida no terminaba. No daba ningún error.
 *
 * Lo que sí está guardado entero es la lista de jugadas (`game_rooms.moves`).
 * Esto la reproduce desde la posición de salida y cuenta cuántas veces
 * aparece la posición final. Una posición es la misma si coinciden las piezas,
 * a quién le toca, los enroques y la captura al paso — pero la captura al paso
 * solo cuenta si de verdad se puede capturar (la regla de la FIDE, art. 9.2):
 * chess.js anota la casilla después de cualquier avance de dos, y sin ese
 * recorte se escaparían repeticiones de verdad.
 *
 * Si la reproducción no llega a la FEN que está guardada (una partida que
 * arrancó de otra posición, una jugada que este motor no entiende), no se
 * declara nada: equivocarse hacia "no hay repetición" deja la partida como
 * estaba; hacia el otro lado le robaría la partida a alguien.
 *
 * `crear(fen)` devuelve un motor con `move(san)`, `fen()` y `moves({verbose})`
 * — chess.js o CrazyhouseEngine, que además tiene `drop()` para "N@f3".
 */
(function () {
  "use strict";

  function hayAlPaso(motor) {
    try {
      const ms = motor.moves({ verbose: true }) || [];
      return ms.some((m) => m && m.flags && m.flags.indexOf("e") !== -1);
    } catch (e) { return true; }
  }

  function clave(motor) {
    const p = motor.fen().split(" ");
    let alPaso = p[3];
    if (alPaso && alPaso !== "-" && !hayAlPaso(motor)) alPaso = "-";
    return [p[0], p[1], p[2], alPaso].join(" ");
  }

  function aplicar(motor, san) {
    const drop = /^([QRBN]?)@([a-h][1-8])/.exec(san);
    if (drop && typeof motor.drop === "function") return motor.drop((drop[1] || "p").toLowerCase(), drop[2]);
    return motor.move(san);
  }

  function mismaPosicion(a, b) {
    return a.split(" ").slice(0, 3).join(" ") === b.split(" ").slice(0, 3).join(" ");
  }

  // Cuántas veces apareció la posición final (1 = solo ahora). 0 si no se pudo saber.
  function veces(fenInicial, jugadas, crear, fenFinal) {
    let motor;
    try { motor = crear(fenInicial); } catch (e) { return 0; }
    const cuenta = new Map();
    let k = clave(motor);
    cuenta.set(k, 1);
    for (const san of jugadas || []) {
      let hecha;
      try { hecha = aplicar(motor, san); } catch (e) { hecha = null; }
      if (!hecha) return 0;
      k = clave(motor);
      cuenta.set(k, (cuenta.get(k) || 0) + 1);
    }
    if (fenFinal && !mismaPosicion(motor.fen(), fenFinal)) return 0;
    return cuenta.get(k);
  }

  window.Repeticion = {
    veces: veces,
    esTriple: (fenInicial, jugadas, crear, fenFinal) => veces(fenInicial, jugadas, crear, fenFinal) >= 3,
  };
})();
