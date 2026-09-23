/* ===== Torneos — sincronización automática de resultados =====
 *
 * Puente entre una partida cualquiera de Juegos (game_rooms) y el torneo al
 * que pueda pertenecer (tournament_pairings.game_room_id). Cada página de
 * juego (crazyhouse.html, cartas.html, duelo.html, niebla.html) ya recibe
 * la fila actualizada de game_rooms por Realtime en su propio
 * applyRemoteRoom(row) — ahí se agrega UNA línea que llama a
 * TorneoSync.onRoomUpdate(sb, row). El resto ocurre solo, sin que esas
 * páginas necesiten saber nada de torneos:
 *
 *   1. Si la partida no está vinculada a ningún cruce de torneo (la inmensa
 *      mayoría de las partidas de Juegos), no hace nada.
 *   2. Si está vinculada y la partida terminó, escribe el resultado en
 *      tournament_pairings (traduciendo "white"/"black"/"draw" tal cual,
 *      son los mismos valores que ya usa game_rooms.result).
 *   3. Si con ese resultado la ronda queda completa, la marca "finished".
 *      — EXCEPTO en Eliminación directa si el cruce terminó en tablas: ahí
 *        se marca needs_manual_advance en vez de un resultado definitivo,
 *        porque hace falta que el profesor elija a mano quién avanza (ver
 *        la cabecera de js/torneo-engine.js) — la ronda no se da por
 *        terminada hasta que esa elección quede hecha.
 *   4. Si esa era la última ronda del torneo, calcula el/los campeón(es),
 *      cierra el torneo (status:"finished") y agrega su fila al salón de
 *      la fama público (public_tournament_champions).
 *
 * Como cualquier jugador (o espectador) puede ser quien tenga la pestaña
 * abierta cuando su propia partida termina, TODO esto se ejecuta con los
 * permisos de quien esté mirando en ese momento — por eso las políticas de
 * tournament_pairings/tournament_rounds/tournaments permiten escribir a
 * quien participa en el cruce, no solo al profesor (ver la migración).
 * Es "eventualmente automático": se sincroniza en cuanto CUALQUIERA de los
 * involucrados tenga la página abierta, no ni bien ocurre en el servidor
 * (este sitio no tiene funciones de servidor para eso, igual que el resto
 * de Juegos).
 */
window.TorneoSync = (function () {
  "use strict";

  async function standingsAndWinners(sb, tournamentId, format) {
    const { data: registros } = await sb.from("tournament_registrations").select("player_id, registered_at").eq("tournament_id", tournamentId).order("registered_at", { ascending: true });
    const players = (registros || []).map((r) => r.player_id);
    const { data: pairingsRows } = await sb.from("tournament_pairings").select("white_id, black_id, is_bye, result, advance_id").eq("tournament_id", tournamentId);
    const pairings = (pairingsRows || []).map((p) => ({ white: p.white_id, black: p.black_id, isBye: p.is_bye, result: p.result, advanceId: p.advance_id }));
    const { score } = TorneoEngine.standingsFromPairings(players, pairings);
    if (format === "elimination") {
      // El campeón único es quien ganó el último cruce jugado (el de mayor
      // board_number de la última ronda) — no hace falta comparar puntajes.
      return { score: score, winners: null }; // el llamador resuelve el campeón de eliminación con el cruce final directamente
    }
    let best = -1;
    Object.keys(score).forEach((id) => { if (score[id] > best) best = score[id]; });
    const winners = Object.keys(score).filter((id) => score[id] === best);
    return { score: score, winners: winners };
  }

  async function finishTournament(sb, tournament, winnerIds, displayNames) {
    // Condicional y pidiendo la fila de vuelta: el eco de la última partida le
    // llega a la vez a los dos jugadores y a quien esté mirando, y cada uno
    // cerraba el torneo e insertaba al campeón — que quedaba dos o tres veces
    // en el salón de la fama. Solo sigue quien de verdad lo cerró.
    const { data: cerrado } = await sb.from("tournaments").update({
      status: "finished", winner_ids: winnerIds, finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", tournament.id).neq("status", "finished").select("id");
    if (!cerrado || !cerrado.length) return;
    const rows = winnerIds.map((id) => ({
      tournament_id: tournament.id, tournament_name: tournament.name, format: tournament.format,
      variant: tournament.variant, display_name: displayNames[id] || "Alumno",
    }));
    if (rows.length) await sb.from("public_tournament_champions").insert(rows);
  }

  async function maybeFinishRound(sb, roundId) {
    const { data: pairings } = await sb.from("tournament_pairings").select("id, result, needs_manual_advance").eq("round_id", roundId);
    if (!pairings || !pairings.length) return;
    const allResolved = pairings.every((p) => p.result !== null && !p.needs_manual_advance);
    if (!allResolved) return;
    const { data: round } = await sb.from("tournament_rounds").select("*").eq("id", roundId).single();
    if (!round || round.status === "finished") return;
    // Lo mismo con la ronda: la cierra UNO solo, el que la encontró abierta.
    const { data: rondaCerrada } = await sb.from("tournament_rounds").update({ status: "finished" })
      .eq("id", roundId).neq("status", "finished").select("id");
    if (!rondaCerrada || !rondaCerrada.length) return;

    const { data: tournament } = await sb.from("tournaments").select("*").eq("id", round.tournament_id).single();
    if (!tournament || tournament.status === "finished") return;
    if (round.round_number < (tournament.total_rounds || 0)) return; // todavía no es la última ronda

    // Última ronda resuelta: cerrar el torneo y calcular campeón(es).
    let winnerIds;
    if (tournament.format === "elimination") {
      const { data: finalPairing } = await sb.from("tournament_pairings").select("*").eq("round_id", roundId).order("board_number", { ascending: true }).limit(1).maybeSingle();
      const champion = finalPairing ? TorneoEngine.resultToWinner({
        white: finalPairing.white_id, black: finalPairing.black_id, isBye: finalPairing.is_bye,
        result: finalPairing.result, advanceId: finalPairing.advance_id,
      }) : null;
      winnerIds = champion ? [champion] : [];
    } else {
      const { winners } = await standingsAndWinners(sb, tournament.id, tournament.format);
      winnerIds = winners || [];
    }
    if (!winnerIds.length) return;
    const { data: perfiles } = await sb.from("profiles").select("id, full_name, email").in("id", winnerIds);
    const displayNames = {};
    (perfiles || []).forEach((p) => { displayNames[p.id] = p.full_name || p.email; });
    await finishTournament(sb, tournament, winnerIds, displayNames);
  }

  async function onRoomUpdate(sb, room) {
    if (!room || room.status !== "finished" || !room.result) return;
    const { data: pairing } = await sb.from("tournament_pairings").select("*").eq("game_room_id", room.id).is("result", null).maybeSingle();
    if (!pairing) return; // no es una partida de torneo, o ya se sincronizó

    const { data: round } = await sb.from("tournament_rounds").select("tournament_id").eq("id", pairing.round_id).single();
    const { data: tournament } = round ? await sb.from("tournaments").select("format").eq("id", round.tournament_id).single() : { data: null };

    const patch = { result: room.result, finished_at: new Date().toISOString() };
    if (room.result === "draw" && tournament && tournament.format === "elimination") {
      // Ver cabecera: en eliminación una tabla no resuelve el cruce sola.
      patch.needs_manual_advance = true;
    }
    await sb.from("tournament_pairings").update(patch).eq("id", pairing.id);
    await maybeFinishRound(sb, pairing.round_id);
  }

  return { onRoomUpdate: onRoomUpdate, maybeFinishRound: maybeFinishRound };
})();
