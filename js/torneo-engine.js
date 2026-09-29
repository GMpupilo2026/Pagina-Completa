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
 *   2. Se empareja de arriba hacia abajo: al primer jugador sin pareja se
 *      le busca, MÁS ABAJO en la lista, el primero con quien no haya jugado
 *      antes, siempre que a los de abajo les quede forma de emparejarse
 *      todos sin repetir. Eso lo decide el algoritmo de Edmonds (ver
 *      perfectPairs), sin probar a ciegas. Antes era voraz: con 7 rondas y
 *      16 jugadores repetía casi dos rivales evitables por torneo; y la
 *      búsqueda con retroceso que lo reemplazó no daba abasto con 20 rondas
 *      y 30 a 64 jugadores.
 *   3. Solo si NINGÚN emparejamiento evita repetir (más rondas que rivales
 *      posibles, o un grupo muy chico) se admite repetir, y los menos cruces
 *      repetidos posibles, buscando con retroceso (pairPool) — el mismo
 *      último recurso que usa el software de emparejamiento "de verdad"
 *      cuando no hay alternativa.
 *   4. Colores: nadie lleva más de 2 blancas de diferencia con sus negras
 *      (ni al revés) ni juega tres seguidas con el mismo color, mientras se
 *      pueda sin repetir rival (no repetir va primero). Entre los dos,
 *      lleva blancas el que tiene menos blancas que negras; si van parejos,
 *      el que jugó con negras la última vez; si también, el de más arriba.
 *      Antes siempre llevaba blancas el de arriba: en 7 rondas, el puntero
 *      podía jugarlas todas con blancas.
 * Empate de número de jugadores (bye): si hay un número impar de inscritos,
 * recibe el bye el jugador sin pareja de MENOR puntaje que todavía no haya
 * tenido un bye en este torneo (o, si ya todos tuvieron uno, el de menor
 * puntaje a secas) — así nadie recibe dos byes mientras haya alternativa.
 * Si con ese bye los demás no se pueden emparejar sin repetir, se prueba
 * con el siguiente candidato de abajo hacia arriba.
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
 * ---------- Todos contra todos (round robin, tablas de Berger) ----------
 * Las tablas de Berger, las mismas de los reglamentos FIDE (ver
 * roundRobinRound): cada ronda, cada uno contra otro distinto, y los
 * colores repartidos parejo. Con número impar de inscritos se agrega un
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

  // Los colores que jugó cada uno, en orden (1 blancas, -1 negras). Un bye
  // no cuenta: no se jugó.
  function colorHistory(playerIds, allPairings) {
    const colors = {};
    playerIds.forEach((id) => { colors[id] = []; });
    allPairings.forEach((p) => {
      if (p.isBye) return;
      if (colors[p.white]) colors[p.white].push(1);
      if (colors[p.black]) colors[p.black].push(-1);
    });
    return colors;
  }

  // ¿Puede jugar con este color (1 o -1) sin pasarse de 2 de diferencia
  // entre blancas y negras ni jugar tres seguidas con el mismo?
  function colorFits(history, c) {
    const diff = history.reduce((s, x) => s + x, 0) + c;
    const n = history.length;
    return Math.abs(diff) <= 2 && !(n >= 2 && history[n - 1] === c && history[n - 2] === c);
  }

  // true si `a` (el de más arriba) lleva blancas contra `b`.
  function aTakesWhite(ha, hb) {
    const okA = colorFits(ha, 1) && colorFits(hb, -1);
    const okB = colorFits(ha, -1) && colorFits(hb, 1);
    if (okA !== okB) return okA;
    const da = ha.reduce((s, x) => s + x, 0), db = hb.reduce((s, x) => s + x, 0);
    if (da !== db) return da < db;
    const la = ha[ha.length - 1] || 0, lb = hb[hb.length - 1] || 0;
    if (la !== lb) return la < lb;
    return true;
  }

  function colorsClash(ha, hb) {
    return !(colorFits(ha, 1) && colorFits(hb, -1)) && !(colorFits(ha, -1) && colorFits(hb, 1));
  }

  // ---------- Emparejamiento perfecto (Edmonds, con flores) ----------
  // Decide si un grupo se puede emparejar ENTERO usando solo los cruces que
  // `ok` permite, y en ese caso arma las parejas de arriba hacia abajo: al
  // primero sin pareja, el más cercano de abajo con quien todavía quede un
  // emparejamiento completo para el resto. Es lo mismo que buscaba la
  // búsqueda con retroceso, pero sin probar caminos a ciegas: con 20 rondas
  // y 30 a 64 jugadores, el retroceso se quedaba sin pasos y repetía rivales
  // que se podían evitar. Cada comprobación es un camino de aumento, así que
  // alcanza con cientos de jugadores.
  function perfectPairs(pool, ok) {
    const n = pool.length;
    if (n % 2 === 1) return null;
    const adj = pool.map((a, i) => {
      const out = [];
      for (let j = 0; j < n; j++) if (j !== i && ok(a, pool[j])) out.push(j);
      return out;
    });
    const removed = new Array(n).fill(false);
    let match = new Array(n).fill(-1);
    const p = new Array(n), base = new Array(n), used = new Array(n), blossom = new Array(n);

    function lca(a, b) {
      const seen = new Array(n).fill(false);
      for (;;) { a = base[a]; seen[a] = true; if (match[a] === -1) break; a = p[match[a]]; }
      for (;;) { b = base[b]; if (seen[b]) return b; b = p[match[b]]; }
    }
    function markPath(v, b, child) {
      while (base[v] !== b) {
        blossom[base[v]] = blossom[base[match[v]]] = true;
        p[v] = child; child = match[v]; v = p[match[v]];
      }
    }
    function findPath(root) {
      used.fill(false); p.fill(-1);
      for (let i = 0; i < n; i++) base[i] = i;
      used[root] = true;
      const q = [root];
      for (let qi = 0; qi < q.length; qi++) {
        const v = q[qi];
        for (const to of adj[v]) {
          if (removed[to] || base[v] === base[to] || match[v] === to) continue;
          if (to === root || (match[to] !== -1 && p[match[to]] !== -1)) {
            const cur = lca(v, to);
            blossom.fill(false);
            markPath(v, cur, to); markPath(to, cur, v);
            for (let i = 0; i < n; i++) {
              if (!removed[i] && blossom[base[i]]) {
                base[i] = cur;
                if (!used[i]) { used[i] = true; q.push(i); }
              }
            }
          } else if (p[to] === -1) {
            p[to] = v;
            if (match[to] === -1) return to;
            used[match[to]] = true; q.push(match[to]);
          }
        }
      }
      return -1;
    }
    function augment(root) {
      let v = findPath(root);
      if (v === -1) return false;
      while (v !== -1) { const pv = p[v], ppv = match[pv]; match[v] = pv; match[pv] = v; v = ppv; }
      return true;
    }

    // Un emparejamiento completo cualquiera, para empezar.
    for (let i = 0; i < n; i++) {
      if (match[i] !== -1) continue;
      for (const j of adj[i]) if (match[j] === -1) { match[i] = j; match[j] = i; break; }
    }
    for (let i = 0; i < n; i++) if (match[i] === -1 && !augment(i)) return null;

    // De arriba hacia abajo, el más cercano que deje completo al resto.
    const pairs = [];
    for (let a = 0; a < n; a++) {
      if (removed[a]) continue;
      for (const b of adj[a]) {
        if (b < a || removed[b]) continue;
        if (match[a] === b) { removed[a] = removed[b] = true; pairs.push([pool[a], pool[b]]); break; }
        const saved = match.slice();
        const ma = match[a], mb = match[b];
        removed[a] = removed[b] = true;
        match[a] = match[b] = -1; match[ma] = -1; match[mb] = -1;
        if (augment(ma)) { pairs.push([pool[a], pool[b]]); break; }
        removed[a] = removed[b] = false;
        match = saved;
      }
    }
    return pairs;
  }

  // Empareja `pool` (ya ordenado de más a menos) con como mucho `maxRepeats`
  // cruces repetidos y `maxClashes` cruces en los que a alguno le toca un
  // color que no le corresponde. Devuelve la lista de parejas o null si no
  // se puede (o si la búsqueda se pasa del tope de pasos, que la corta a
  // tiempo con grupos grandes).
  function pairPool(pool, opponents, colors, maxRepeats, maxClashes, budget) {
    const allowed = (a, b, repeatsLeft, clashesLeft) =>
      (repeatsLeft > 0 || !(opponents[a] && opponents[a].has(b))) &&
      (clashesLeft > 0 || !colorsClash(colors[a], colors[b]));
    function search(rest, repeatsLeft, clashesLeft) {
      if (!rest.length) return [];
      if (--budget.steps < 0) return null;
      // Poda: si alguien ya no tiene con quién, este camino no sirve; si
      // alguien tiene uno solo, se le empareja primero. Sin esto, con 20
      // rondas y 30 o 40 jugadores la búsqueda tardaba tanto en descubrir
      // los callejones sin salida que se quedaba sin pasos.
      let a = rest[0];
      if (repeatsLeft === 0 || clashesLeft === 0) {
        for (let i = 0; i < rest.length; i++) {
          let options = 0;
          for (let j = 0; j < rest.length && options < 2; j++) {
            if (i !== j && allowed(rest[i], rest[j], repeatsLeft, clashesLeft)) options++;
          }
          if (options === 0) return null;
          if (options === 1) { a = rest[i]; break; }
        }
      }
      if (a !== rest[0]) rest = [a].concat(rest.filter((id) => id !== a));
      for (let j = 1; j < rest.length; j++) {
        const b = rest[j];
        const repeat = !!(opponents[a] && opponents[a].has(b));
        if (repeat && repeatsLeft === 0) continue;
        const clash = colorsClash(colors[a], colors[b]);
        if (clash && clashesLeft === 0) continue;
        const sub = search(rest.slice(1, j).concat(rest.slice(j + 1)), repeatsLeft - (repeat ? 1 : 0), clashesLeft - (clash ? 1 : 0));
        if (sub) return [[a, b]].concat(sub);
        if (budget.steps < 0) return null;
      }
      return null;
    }
    return search(pool, maxRepeats, maxClashes);
  }

  // El voraz de antes: solo si la búsqueda se pasa del tope de pasos.
  function pairGreedy(pool, opponents) {
    const used = new Set(), pairs = [];
    for (let i = 0; i < pool.length; i++) {
      const a = pool[i];
      if (used.has(a)) continue;
      let partner = null;
      for (let j = i + 1; j < pool.length; j++) {
        const b = pool[j];
        if (!used.has(b) && !(opponents[a] && opponents[a].has(b))) { partner = b; break; }
      }
      if (!partner) {
        for (let j = i + 1; j < pool.length; j++) {
          if (!used.has(pool[j])) { partner = pool[j]; break; }
        }
      }
      if (partner) { used.add(a); used.add(partner); pairs.push([a, partner]); }
    }
    return pairs;
  }

  function swissRound(playerIds, allPreviousPairings, registrationOrder) {
    const { score, byes, opponents } = standingsFromPairings(playerIds, allPreviousPairings);
    const colors = colorHistory(playerIds, allPreviousPairings);
    const orderIndex = {};
    (registrationOrder || playerIds).forEach((id, i) => { orderIndex[id] = i; });

    const ranked = playerIds.slice().sort((a, b) => {
      if (score[b] !== score[a]) return score[b] - score[a];
      return (orderIndex[a] || 0) - (orderIndex[b] || 0);
    });

    // Candidatos al bye, en orden de preferencia: de menor puntaje hacia
    // arriba los que no tuvieron bye; después, si hiciera falta, el resto.
    let byeCandidates = [null];
    if (ranked.length % 2 === 1) {
      const fromBottom = ranked.slice().reverse();
      byeCandidates = fromBottom.filter((id) => !byes[id]).concat(fromBottom.filter((id) => byes[id]));
    }
    const withoutBye = byeCandidates.filter((id) => id === null || !byes[id]);
    const groups = withoutBye.length ? [withoutBye, byeCandidates] : [byeCandidates];

    const half = Math.floor(ranked.length / 2);
    const fresh = (a, b) => !(opponents[a] && opponents[a].has(b));
    const levels = [
      (a, b) => fresh(a, b) && !colorsClash(colors[a], colors[b]),  // sin repetir, colores bien
      fresh,                                                        // sin repetir, colores libres
    ];
    // Nadie recibe dos byes mientras haya otra salida: eso va antes que todo.
    // Dentro de cada grupo de candidatos al bye, primero no repetir rival y
    // recién después los colores (aTakesWhite igual elige el mejor color
    // posible para cada pareja). Si no hay forma de no repetir (más rondas
    // que rivales posibles), los menos cruces repetidos posibles, buscando
    // con retroceso: pasa solo con grupos chicos, donde la búsqueda es corta,
    // y el tope de pasos la corta a tiempo si no.
    let chosen = null;
    const budget = { steps: 200000 };
    for (let g = 0; g < groups.length && !chosen; g++) {
      for (const ok of levels) {
        for (const byePlayer of groups[g]) {
          const pairs = perfectPairs(ranked.filter((id) => id !== byePlayer), ok);
          if (pairs) { chosen = { byePlayer: byePlayer, pairs: pairs }; break; }
        }
        if (chosen) break;
      }
      for (let k = 1; k <= half && !chosen && budget.steps >= 0; k++) {
        for (const byePlayer of groups[g]) {
          const pairs = pairPool(ranked.filter((id) => id !== byePlayer), opponents, colors, k, half, budget);
          if (pairs) { chosen = { byePlayer: byePlayer, pairs: pairs }; break; }
          if (budget.steps < 0) break;
        }
      }
    }
    if (!chosen) {
      const byePlayer = byeCandidates[0];
      chosen = { byePlayer: byePlayer, pairs: pairGreedy(ranked.filter((id) => id !== byePlayer), opponents) };
    }

    const pairings = [];
    if (chosen.byePlayer !== null) pairings.push({ white: chosen.byePlayer, black: null, isBye: true });
    chosen.pairs.forEach(([a, b]) => {
      // `a` siempre va más arriba en la lista que `b`.
      pairings.push(aTakesWhite(colors[a], colors[b]) ? { white: a, black: b, isBye: false } : { white: b, black: a, isBye: false });
    });
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

  // ---------- Todos contra todos (tablas de Berger) ----------
  // Los jugadores se numeran 1..n por orden de inscripción (con uno fantasma
  // si son impares: quien le toca, tiene bye). Con i, j < n, i y j se
  // enfrentan en la ronda (i + j - 2) mod (n - 1) + 1, y quien no tiene
  // pareja esa ronda juega contra n. Colores: entre i y j lleva blancas el
  // menor si i + j es impar, el mayor si es par; contra n, las lleva i si
  // está en la mitad de arriba. Así nadie termina con más de una blanca de
  // diferencia con sus negras ni juega tres seguidas con el mismo color.
  // Antes era el método del círculo con una regla de colores que parecía
  // pareja y no lo era: con 8 jugadores, uno jugaba las 7 con blancas y
  // otro 6 de 7 con negras.
  function roundRobinRound(playerIds, roundNumber) {
    const list = playerIds.slice();
    if (list.length % 2 === 1) list.push(null); // null = posición fantasma (bye)
    const n = list.length;
    const r = (roundNumber - 1) % (n - 1);
    const player = (k) => list[k - 1];
    const pairs = [];
    for (let i = 1; i < n; i++) {
      let j = ((r + 2 - i) % (n - 1) + (n - 1)) % (n - 1);
      if (j === 0) j = n - 1;
      if (j === i) pairs.unshift(i > n / 2 ? [i, n] : [n, i]); // el que juega contra n va primero
      else if (j > i) pairs.push((i + j) % 2 === 1 ? [i, j] : [j, i]);
    }
    return pairs.map(([w, b]) => {
      const white = player(w), black = player(b);
      if (white === null || black === null) return { white: white === null ? black : white, black: null, isBye: true };
      return { white: white, black: black, isBye: false };
    });
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
