// Edge Function: partida-fin
//
// Dos cosas al terminar una partida de ajedrez estándar:
//
// 1. La revisión (revision.ts): rehace las jugadas con chess.js desde la
// posición con que nació la sala (game_rooms.fen_inicial, que fija la base)
// y anota en partidas_revision la que no cuadra —una jugada ilegal, jugadas
// que no llevan a la posición final o un resultado que contradice el mate o
// el ahogado del tablero—, para que la mire su profe. Corre también con
// tablas. Ver «La partida terminada se revisa con chess.js» en
// docs/decisiones/juegos-y-torneos.md.
//
// 2. El robo de puntos, solo si la partida cuadró: cuando una partida de ajedrez estándar entre dos
// alumnos termina con un ganador, reproduce las jugadas con chess.js y
// busca el peor momento de quien ganó (la mayor ventaja en material que
// tuvo el perdedor). Si la hubo, le roba esos puntos —ventaja × 100— a
// quien la dejó ir y se los da a quien ganó. Ver «El robo de puntos» en
// docs/decisiones/puntos-y-premios.md.
//
// QUIÉN LA LLAMA. Solo la base: public.disparar_fin_de_partida(), el
// trigger de game_rooms que dispara cuando una fila pasa a "finished", con
// pg_net. Va con verify_jwt en FALSE porque el disparador no trae sesión de
// persona; a cambio exige el secreto `partida_robo_secreto` de la bóveda,
// que esta función vuelve a leer con la service role para compararlo. Mismo
// patrón que alerta-base e informes-encargados.
//
// Por qué se vuelve a leer la sala en vez de confiar en el cuerpo del aviso:
// el disparador solo manda el id, y acá se comprueba de nuevo el estado real
// (status, result, variant) antes de reproducir nada — así un aviso tardío o
// repetido nunca cobra ni paga de más (y registrar_robo_de_puntos es
// idempotente por sala, por si acaso).

import { createClient } from "npm:@supabase/supabase-js@2";
import { Chess } from "npm:chess.js@0.10.3";
import { peorMomentoDelGanador, puntosDelRobo } from "./calculo.ts";
import { revisarPartida } from "./revision.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: esperado } = await admin.rpc("secreto_partida_robo");
  if (!esperado || !jwt || jwt !== esperado) {
    return json({ error: "Esta acción solo la dispara el fin de una partida" }, 401);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Cuerpo JSON inválido" }, 400); }
  const roomId = body.room_id;
  if (typeof roomId !== "string" || !roomId) return json({ error: "Falta room_id" }, 400);

  const { data: room, error } = await admin
    .from("game_rooms")
    .select("id, white_id, black_id, status, result, moves, variant, fen, fen_inicial")
    .eq("id", roomId)
    .maybeSingle();
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!room) return json({ ok: false, motivo: "la sala ya no existe" });
  if (room.status !== "finished" || !["white", "black", "draw"].includes(room.result)) {
    return json({ ok: false, motivo: "sin resultado" });
  }
  if (room.variant !== "estandar") return json({ ok: false, motivo: "variante que chess.js no sabe jugar" });

  const revision = revisarPartida(Chess, {
    fenInicial: room.fen_inicial,
    jugadas: room.moves ?? [],
    fenFinal: room.fen,
    resultado: room.result,
  });
  if (revision) {
    const { error: errorRevision } = await admin.from("partidas_revision").upsert({
      room_id: room.id,
      motivo: revision.motivo,
      jugada: revision.jugada,
      detalle: revision.detalle,
    }, { onConflict: "room_id", ignoreDuplicates: true });
    if (errorRevision) return json({ ok: false, error: errorRevision.message }, 500);
    // Una partida que no cuadra no paga ni cobra puntos.
    return json({ ok: true, revision });
  }
  if (room.result === "draw") return json({ ok: true, motivo: "tablas: sin robo" });

  // Solo entre dos alumnos: si juega un profesor (el profe también se
  // sienta a jugar) no hay robo.
  const { data: perfiles } = await admin
    .from("profiles")
    .select("id, role")
    .in("id", [room.white_id, room.black_id]);
  const roles = new Map((perfiles ?? []).map((p: { id: string; role: string }) => [p.id, p.role]));
  if (roles.get(room.white_id) !== "alumno" || roles.get(room.black_id) !== "alumno") {
    return json({ ok: false, motivo: "no son dos alumnos" });
  }

  const colorGanador = room.result as "white" | "black";
  const ganadorId = colorGanador === "white" ? room.white_id : room.black_id;
  const perdedorId = colorGanador === "white" ? room.black_id : room.white_id;

  const chess = new Chess();
  const peorMomento = peorMomentoDelGanador(chess, (room.moves ?? []) as string[], colorGanador);
  const puntos = puntosDelRobo(peorMomento);
  if (puntos <= 0) return json({ ok: false, motivo: "el ganador nunca estuvo abajo" });

  const { error: errorRobo } = await admin.rpc("registrar_robo_de_puntos", {
    p_room_id: room.id,
    p_ganador: ganadorId,
    p_perdedor: perdedorId,
    p_puntos: puntos,
  });
  if (errorRobo) return json({ ok: false, error: errorRobo.message }, 500);

  return json({ ok: true, puntos, peor_momento: peorMomento });
});
