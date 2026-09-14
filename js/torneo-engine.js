/* ===== Torneos — motor de emparejamientos y posiciones =====
 *
 * Lógica pura (sin Supabase, sin DOM) para las 3 modalidades de torneo:
 * Suizo, Eliminación directa y Todos contra todos (round robin). Cada
 * función de emparejamiento recibe la lista de inscritos y (si aplica) el
 * historial de rondas ya jugadas, y devuelve los cruces de la ronda
 * siguiente — nunca decide CUÁNDO generar la ronda ni escribe nada; eso lo
 * hace la página que use este motor.
 *
 * Formato de un cruce (pairing): { white, black, isBye }. `black` es null
 * cuando isBye es true (el jugador de `white` pasa de ronda automáticamente,
 * sin partida). Los jugadores se identifican por su id (string) tal cual
 * vienen de la inscripción — este motor no sabe nada de nombres ni de la
 * base de datos.
 *
 * ---------- Suizo (versión simplificada, documentado a propósito) ----------
 * Un emparejamiento suizo "de manual" (FIDE Dutch System) resuelve casos
 * límite con un algoritmo de flotación y backtracking bastante elaborado.
 * Esta versión es una variante voraz simplificada, pensada para grupos
 * chicos de una academia, no para torneos federados:
 *   1. Se ordena a los inscritos por puntaje (de más a menos) y, en caso de
 *      empate, por el orden en que se inscribieron (primero inscrito
 *      primero) — un desempate estable y predecible, sin florituras.
 *   2. Se recorre la lista de arriba hacia abajo: al primer jugador sin
 *      pareja todavía se le busca, MÁS ABAJO en la lista, el primero con
 *      quien no haya jugado antes en este torneo.
 *   3. Si nadie más abajo cumple (ya jugó contra todos los que quedan sin
 *      pareja), se empareja con el primero disponible aunque signifique
 *      repetir rival — es el mismo último recurso que usa el software de
 *      emparejamiento "de verdad" cuando no hay alternativa.
 * Empate de número de jugadores (bye): si hay un número impar de inscritos,
 * recibe el bye el jugador sin pareja de MENOR puntaje que todavía no haya
 * tenido un bye en este torneo (o, si ya todos tuvieron uno, el de menor
 * puntaje a secas) — así nadie recibe dos byes mientras haya alternativa.
 *
 * ---------- Eliminación directa ----------
 * Ronda 1: se ordena aleatoriamente (torneo casual, no hay ranking previo
 * que sirva de semilla) y se completa hasta la siguiente potencia de 2 con
 * "byes" para los primeros de la lista mezclada. Rondas siguientes: se
 * empareja a los ganadores de la ronda anterior en el mismo orden en que
 * quedaron sus cruces (cruce 1 con cruce 2, cruce 3 con cruce 4, etc.).
 * Un cruce que termina en tablas NO tiene ganador automático (ver
 * `resultToWinner`) — hace falta que el profesor elija manualmente quién
 * avanza antes de poder generar la ronda siguiente; es una decisión de
 * arbitraje real, no algo que este motor deba inventar por su cuenta.
 *
 * ---------- Todos contra todos (round robin, método del círculo) ----------
 * El método del círculo de toda la vida: se fija un jugador y se rota el
 * resto una posición por ronda. Con número impar de inscritos se agrega un
 * jugador fantasma (bye) para completar un número par — cada inscrito
 * termina jugando contra todos los demás exactamente una vez y con como
 * mucho un bye en total.
 */
window.TorneoEngine = (function () {
  "use strict";

  function shuffle(arr, rng) {
    const random = rng || Math.random;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function nextPowerOfTwo(n) {
    let p = 1;
    while (p < n) p *= 2;
    return p;
  }

  // Cuántas rondas hacen falta según el formato y la cantidad de inscritos
  // (Suizo no tiene un número "correcto" único: se sugiere un valor
  // razonable, pero lo decide el profesor al cerrar inscripciones).
  function suggestedTotalRounds(format, playerCount) {
    if (playerCount < 2) return 0;
    if (format === "elimination") return Math.ceil(Math.log2(playerCount));
    if (format === "round_robin") {
      const padded = playerCount + (playerCount % 2);
      return padded - 1;
    }
    // swiss: sugerencia típica de la práctica del ajedrez amateur
    return Math.max(3, Math.ceil(Math.log2(playerCount)) + 1);
  }

  // ---------- Puntaje de un jugador según los cruces YA resueltos ----------
  // result: "white" | "black" | "draw" | null (todavía sin jugar). Un bye
  // (isBye:true) siempre cuenta como resultado "white" (el propio inscrito
  // está en el campo `white`) apenas se genera, sin esperar ninguna partida.
  function standingsFromPairings(playerIds, allPairings) {
    const score = {}, byes = {}, opponents = {}; // opponents[id] = Set de rivales ya enfrentados
    playerIds.forEach((id) => { score[id] = 0; byes[id] = 0; opponents[id] = new Set(); });
    allPairings.forEach((p) => {
      if (p.isBye) {
        if (score[p.white] !== undefined) { score[p.white] += 1; byes[p.white] += 1; }
        return;
      }
      if (p.result === "white") { score[p.white] += 1; }
      else if (p.result === "black") { score[p.black] += 1; }
      else if (p.result === "draw") { score[p.white] += 0.5; score[p.black] += 0.5; }
      if (opponents[p.white]) opponents[p.white].add(p.black);
      if (opponents[p.black]) opponents[p.black].add(p.white);
    });
    return { score: score, byes: byes, opponents: opponents };
  }

  // ---------- Suizo ----------
  function swissRound(playerIds, allPreviousPairings, registrationOrder) {
    const { score, byes, opponents } = standingsFromPairings(playerIds, allPreviousPairings);
    const orderIndex = {};
    (registrationOrder || playerIds).forEach((id, i) => { orderIndex[id] = i; });

    let pool = playerIds.slice().sort((a, b) => {
      if (score[b] !== score[a]) return score[b] - score[a];
      return (orderIndex[a] || 0) - (orderIndex[b] || 0);
    });

    const pairings = [];
    let byePlayer = null;
    if (pool.length % 2 === 1) {
      // De menor puntaje hacia arriba, el primero sin bye todavía.
      for (let i = pool.length - 1; i >= 0; i--) {
        if (!byes[pool[i]]) { byePlayer = pool[i]; break; }
      }
      if (!byePlayer) byePlayer = pool[pool.length - 1]; // ya todos tuvieron bye alguna vez
      pool = pool.filter((id) => id !== byePlayer);
      pairings.push({ white: byePlayer, black: null, isBye: true });
    }

    const used = new Set();
    for (let i = 0; i < pool.length; i++) {
      const a = pool[i];
      if (used.has(a)) continue;
      let partner = null;
      for (let j = i + 1; j < pool.length; j++) {
        const b = pool[j];
        if (used.has(b)) continue;
        if (!opponents[a] || !opponents[a].has(b)) { partner = b; break; }
      }
      if (!partner) {
        // Último recurso: el primero disponible, aunque repita rival.
        for (let j = i + 1; j < pool.length; j++) {
          if (!used.has(pool[j])) { partner = pool[j]; break; }
        }
      }
      if (partner) {
        used.add(a); used.add(partner);
        pairings.push({ white: a, black: partner, isBye: false });
      }
    }
    return pairings;
  }

  // ---------- Eliminación directa ----------
  function eliminationFirstRound(playerIds, rng) {
    const shuffled = shuffle(playerIds, rng);
    const size = nextPowerOfTwo(shuffled.length);
    const byesNeeded = size - shuffled.length;
    const pairings = [];
    for (let i = 0; i < byesNeeded; i++) {
      pairings.push({ white: shuffled[i], black: null, isBye: true });
    }
    const rest = shuffled.slice(byesNeeded);
    for (let i = 0; i < rest.length; i += 2) {
      pairings.push({ white: rest[i], black: rest[i + 1], isBye: false });
    }
    return pairings;
  }

  // `previousRoundPairings` debe venir en el mismo orden en que se jugaron
  // (board_number ascendente) y cada una debe traer ya su ganador resuelto
  // (ver resultToWinner) — nunca se llama con cruces todavía pendientes.
  function eliminationNextRound(previousRoundPairings) {
    const winners = previousRoundPairings.map((p) => (p.isBye ? p.white : resultToWinner(p)));
    const pairings = [];
    for (let i = 0; i < winners.length; i += 2) {
      if (i + 1 < winners.length) pairings.push({ white: winners[i], black: winners[i + 1], isBye: false });
      else pairings.push({ white: winners[i], black: null, isBye: true }); // impar residual (no debería pasar con potencias de 2, por las dudas)
    }
    return pairings;
  }

  // Devuelve el id del jugador que avanza de un cruce, o null si hace falta
  // una decisión manual (tablas en eliminación, ver cabecera del archivo).
  function resultToWinner(pairing) {
    if (pairing.isBye) return pairing.white;
    if (pairing.advanceId) return pairing.advanceId; // elegido a mano por el profesor tras un empate
    if (pairing.result === "white") return pairing.white;
    if (pairing.result === "black") return pairing.black;
    return null; // "draw" sin advanceId todavía, o sin jugar
  }

  // ---------- Todos contra todos (método del círculo) ----------
  function roundRobinRound(playerIds, roundNumber) {
    const list = playerIds.slice();
    if (list.length % 2 === 1) list.push(null); // null = posición fantasma (bye)
    const n = list.length;
    const totalRounds = n - 1;
    const r = (roundNumber - 1) % totalRounds;
    const fixed = list[0];
    const rotating = list.slice(1);
    const rotated = rotating.slice(r).concat(rotating.slice(0, r));
    const arranged = [fixed].concat(rotated);
    const pairings = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arranged[i], b = arranged[n - 1 - i];
      if (a === null || b === null) {
        pairings.push({ white: a === null ? b : a, black: null, isBye: true });
      } else {
        // Se alternan colores según ronda y posición para repartir blancas
        // parejo — no hay ranking previo que priorizar, así que alcanza con
        // una regla simple y determinista.
        const swap = (roundNumber + i) % 2 === 1;
        pairings.push(swap ? { white: b, black: a, isBye: false } : { white: a, black: b, isBye: false });
      }
    }
    return pairings;
  }

  return {
    suggestedTotalRounds: suggestedTotalRounds,
    standingsFromPairings: standingsFromPairings,
    swissRound: swissRound,
    eliminationFirstRound: eliminationFirstRound,
    eliminationNextRound: eliminationNextRound,
    resultToWinner: resultToWinner,
    roundRobinRound: roundRobinRound,
  };
})();
