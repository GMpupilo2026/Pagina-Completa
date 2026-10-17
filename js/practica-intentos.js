/*
 * Los intentos de Practicar contra el motor, dichos con palabras.
 *
 * Una sola copia para las dos pantallas que los muestran: la clase en vivo
 * (sesion.html, la grilla del profe y «Revisar los intentos») y el informe
 * del alumno (informes.html, «Practicar en clase»).
 *
 *   - estado(): cómo terminó un intento. `propio` es para el informe que lee
 *     el mismo alumno («Te rendiste», no «Se rindió»).
 *   - numerar(): las jugadas numeradas desde la posición de salida de la
 *     ronda («12… Cc6 13. Ab5»). Sin la posición, sin números: inventarlos
 *     diría «1.» de una ronda que empezó en la jugada 30, o con las negras.
 *   - juntar(): los intentos de cada partida, del primero al último. Los
 *     terminados los guarda la base al reintentar (practice_intentos); el
 *     último sigue en practice_games.
 *
 * Ver «Practicar: las jugadas de cada intento» en docs/decisiones/clase-en-vivo.md
 * y «Las partidas de práctica en el informe» en docs/decisiones/informes.md.
 */
(function (raiz) {
  "use strict";

  const ESTADOS = {
    checkmate_win: ["🏆 Ganó por jaque mate", "🏆 Ganaste por jaque mate"],
    checkmate_loss: ["💀 Perdió por jaque mate", "💀 Perdiste por jaque mate"],
    draw: ["🤝 Tablas", "🤝 Tablas"],
    resigned: ["🏳️ Se rindió", "🏳️ Te rendiste"],
    timeout: ["⏱️ Se quedó sin tiempo", "⏱️ Te quedaste sin tiempo"],
  };

  function estado(status, propio) {
    const e = ESTADOS[status];
    return e ? e[propio ? 1 : 0] : "Jugando…";
  }

  // `mostrar` pasa cada jugada (como la guarda chess.js, en inglés) a como se lee.
  function numerar(fen, jugadas, mostrar) {
    const ver = mostrar || String;
    const lista = Array.isArray(jugadas) ? jugadas.filter((j) => typeof j === "string") : [];
    const partes = typeof fen === "string" ? fen.trim().split(/\s+/) : [];
    if (partes.length < 2) return lista.map(ver).join(" ");
    let turno = partes[1] === "b" ? "b" : "w";
    let numero = parseInt(partes[5], 10) > 0 ? parseInt(partes[5], 10) : 1;
    const textos = [];
    lista.forEach((san, i) => {
      if (turno === "w") textos.push(numero + ". " + ver(san));
      else textos.push(i === 0 ? numero + "… " + ver(san) : ver(san));
      if (turno === "b") numero += 1;
      turno = turno === "w" ? "b" : "w";
    });
    return textos.join(" ");
  }

  // juegos: filas de practice_games (id, attempts, status, moves);
  // guardados: filas de practice_intentos (game_id, intento, status, moves).
  // Devuelve un Map id de la partida -> [{intento, status, moves, ultimo}], en orden.
  function juntar(juegos, guardados) {
    const porJuego = new Map();
    (juegos || []).forEach((g) => {
      porJuego.set(g.id, [{ intento: g.attempts || 1, status: g.status, moves: g.moves || [], ultimo: true }]);
    });
    (guardados || []).forEach((i) => {
      const l = porJuego.get(i.game_id);
      if (l) l.push({ intento: i.intento, status: i.status, moves: i.moves || [], ultimo: false });
    });
    porJuego.forEach((l) => l.sort((a, b) => a.intento - b.intento));
    return porJuego;
  }

  const PracticaIntentos = { estado, numerar, juntar };
  if (typeof module !== "undefined" && module.exports) module.exports = PracticaIntentos;
  else raiz.PracticaIntentos = PracticaIntentos;
})(typeof window !== "undefined" ? window : globalThis);
