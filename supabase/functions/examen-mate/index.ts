// examen-mate: los mates básicos del examen de rango (Caballo), jugados contra el servidor.
//
// Una pregunta de mate («da mate con la dama y el rey en menos de 2 minutos»)
// no se contesta con una jugada: se juega una partida contra el rey solo. Si
// la partida la arbitrara el navegador, bastaría con avisar «di mate» desde la
// consola. Por eso pasa por acá:
//   - recibe cada jugada del alumno y la valida con chess.js (la misma 0.10.3
//     del sitio);
//   - contesta con la defensa del rey: para la dama, la distancia EXACTA al
//     mate (FinalesDTM, se calcula en 0,3 s) y el rey elige la que más tarda;
//     para las dos torres, la heurística de «Con lo justo»
//     (TiposReglas.defensaRey), porque esa tabla tarda 19 s. Las dos vienen de
//     _compartido/defensa-mate.js, que arma herramientas/defensa-mate-armar.js
//     desde las fuentes del sitio (una sola copia);
//   - decide si hubo mate o tablas (ahogado, material insuficiente, triple
//     repetición, 50 jugadas).
// El reloj de 2 minutos y el estado viven en la base (examen_mate_partidas):
// mate_estado() y mate_registrar() solo las llama esta función, con la clave
// de servicio, y la base rechaza la jugada que llega tarde o que no sigue a la
// posición anterior. El resultado entra a examen_respuestas como cualquier
// respuesta. Ver «Los mates del examen de Caballo» en
// docs/decisiones/puntos-y-premios.md.
//
// POST { accion: "estado", item }              → la partida (la empieza la primera vez)
// POST { accion: "jugar", item, jugada: {from, to, promotion?} }
// Exige sesión (verify_jwt) y el segundo paso si la cuenta lo tiene.

import { createClient } from "npm:@supabase/supabase-js@2";
import { Chess } from "npm:chess.js@0.10.3";
import { FinalesDTM, TiposReglas } from "./defensa-mate.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";
const UUID = /^[0-9a-f-]{36}$/i;
const CASILLA = /^[a-h][1-8]$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Tiene la verificación en dos pasos y el token todavía no la pasó (aal1).
function sesionAMedias(factores: { status: string }[] | undefined, jwt: string): boolean {
  if (!(factores ?? []).some((f) => f.status === "verified")) return false;
  try {
    const b = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b + "=".repeat((4 - (b.length % 4)) % 4))).aal !== "aal2";
  } catch {
    return true;
  }
}

// La posición sin los contadores, para contar repeticiones.
const clave = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

let tablaDama: { dtm(fen: string): number | null } | null = null;

// La jugada del rey negro.
// deno-lint-ignore no-explicit-any
function defensa(fen: string, final: string): any {
  if (final === "q") {
    tablaDama = tablaDama || FinalesDTM.resolver("q");
    const g = new Chess(fen);
    // deno-lint-ignore no-explicit-any
    let mejor: any = null, mejorV = -Infinity;
    for (const m of g.moves({ verbose: true })) {
      g.move(m);
      // Comerse la dama o ahogarse son tablas: lo mejor para el negro.
      // Si no, la que deja el mate más lejos (dtm 0 = ya no se gana).
      const d = g.insufficient_material() || g.in_stalemate() ? 0 : tablaDama.dtm(g.fen());
      const v = d === 0 ? 1e6 : (d ?? 0);
      g.undo();
      if (v > mejorV) { mejorV = v; mejor = m; }
    }
    return mejor;
  }
  return TiposReglas.defensaRey(Chess, fen);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Cuerpo JSON inválido" }, 400); }
  const item = String(body?.item ?? "");
  if (!UUID.test(item)) return json({ error: "Falta la pregunta." }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Falta la sesión." }, 401);
  const { data: usuario, error: quienError } = await admin.auth.getUser(jwt);
  if (quienError || !usuario?.user) return json({ error: "La sesión no es válida." }, 401);
  if (sesionAMedias(usuario.user.factors, jwt)) {
    return json({ error: "Falta el segundo paso de la verificación: vuelve a entrar y escribe el código de tu app." }, 401);
  }
  const alumno = usuario.user.id;

  const { data: estado, error: e1 } = await admin.rpc("mate_estado", { p_item: item, p_alumno: alumno });
  if (e1) return json({ error: "No se pudo leer la partida." }, 500);
  if (estado?.error) return json(estado, 400);
  if (body.accion === "estado" || estado.terminado) return json(estado);
  if (body.accion !== "jugar") return json({ error: "Acción desconocida." }, 400);

  const from = String(body?.jugada?.from ?? ""), to = String(body?.jugada?.to ?? "");
  const promotion = /^[qrbn]$/.test(String(body?.jugada?.promotion ?? "")) ? body.jugada.promotion : "q";
  if (!CASILLA.test(from) || !CASILLA.test(to)) return json({ ...estado, error: "Esa jugada no se entiende." }, 400);

  const g = new Chess(estado.fen);
  if (g.turn() !== "w") return json({ ...estado, error: "No es tu turno." }, 400);
  const mia = g.move({ from, to, promotion });
  if (!mia) return json({ ...estado, error: "Esa jugada no es legal." }, 400);

  const posiciones: string[] = Array.isArray(estado.posiciones) ? estado.posiciones.slice() : [];
  let resultado: string | null = null;
  // deno-lint-ignore no-explicit-any
  let rival: any = null;
  if (g.in_checkmate()) resultado = "mate";
  else if (g.in_draw()) resultado = "tablas";   // ahogado, material insuficiente o 50 jugadas
  else {
    rival = defensa(g.fen(), estado.final);
    if (rival) g.move(rival);
    if (g.in_draw()) resultado = "tablas";      // se comió una pieza, o 50 jugadas
  }
  const fen = g.fen();
  const k = clave(fen);
  if (!resultado && posiciones.filter((p) => p === k).length >= 2) resultado = "tablas";   // triple repetición

  const { data: nuevo, error: e2 } = await admin.rpc("mate_registrar", {
    p_item: item, p_alumno: alumno, p_fen_antes: estado.fen, p_fen_despues: fen,
    p_jugada: { blancas: mia.san, negras: rival ? rival.san : null }, p_posicion: k, p_resultado: resultado,
  });
  if (e2) return json({ error: "No se pudo guardar la jugada." }, 500);
  if (nuevo?.error) return json(nuevo, 409);
  return json({ ...nuevo, mia: { from: mia.from, to: mia.to, san: mia.san },
    rival: rival ? { from: rival.from, to: rival.to, san: rival.san } : null });
});
