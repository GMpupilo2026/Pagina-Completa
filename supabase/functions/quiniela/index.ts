// Edge Function: quiniela
//
// La quiniela de resultados de una sala de torneo (transmision.html). Ver «La
// quiniela de resultados» en docs/decisiones/juegos-y-torneos.md.
//
// Tres acciones (body.accion), todas con la CLAVE de la sala:
//   "estado"      { clave, token? } → las partidas por ronda (abiertas o
//                  cerradas), la tabla de aciertos (solo nombres: el correo
//                  no sale nunca de acá) y, con token, quién es y sus pronósticos.
//   "unirse"      { clave, nombre, correo, privacidad } → { token }
//   "pronosticar" { clave, token, partida, pronostico }
//
// POR QUÉ UNA FUNCIÓN Y NO LLAMAR A LA BASE DESDE LA PÁGINA: qué partidas hay
// y cuándo empiezan lo sabe Lichess. Antes de contestar, la función copia las
// partidas de la sala a quiniela_partidas (si la última copia tiene más de
// SINCRONIZAR_MS), así una partida que ya empezó se cierra aunque la página
// no lo sepa. Las funciones de la base (quiniela_unirse, quiniela_pronosticar,
// quiniela_yo) solo las puede llamar el service role; la regla de cuándo se
// cierra una partida vive en la base (quiniela_cerrada).
//
// verify_jwt en true: la llama la página pública con la clave anónima.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LICHESS = "https://lichess.org";
const SINCRONIZAR_MS = 45_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function pedir(url: string) {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error("Lichess respondió " + res.status + " a " + url);
  return res.json();
}

const RESULTADO: Record<string, string> = { "1-0": "1-0", "0-1": "0-1", "½-½": "½-½", "1/2-1/2": "½-½" };

// Una partida ya empezó si tiene jugadas: la FEN deja de ser la inicial.
function empezo(g: { fen?: string; status?: string }) {
  if (g.status && RESULTADO[g.status]) return true;
  if (!g.fen) return false;
  const p = g.fen.split(" ");
  return p[1] === "b" || Number(p[5]) > 1;
}

// Copia a la base las partidas de todas las rondas de la sala.
// deno-lint-ignore no-explicit-any
async function sincronizar(admin: any, sala: { id: string; lichess_id: string }) {
  const torneo = await pedir(LICHESS + "/api/broadcast/" + encodeURIComponent(sala.lichess_id));
  const rondas = Array.isArray(torneo.rounds) ? torneo.rounds : [];
  const filas: Record<string, unknown>[] = [];
  await Promise.all(rondas.map(async (r: { id: string; name?: string; url?: string; startsAt?: number }, orden: number) => {
    const url = r.url && r.url.startsWith(LICHESS + "/broadcast/")
      ? LICHESS + "/api" + r.url.slice(LICHESS.length)
      : LICHESS + "/api/broadcast/-/-/" + encodeURIComponent(r.id);
    const datos = await pedir(url);
    (Array.isArray(datos.games) ? datos.games : []).forEach((g: { id: string; fen?: string; status?: string; players?: { name?: string }[] }, i: number) => {
      if (!/^[A-Za-z0-9]{8}$/.test(g.id || "")) return;
      filas.push({
        sala_id: sala.id, partida_id: g.id, ronda_id: r.id, ronda_nombre: r.name || "", ronda_orden: orden,
        mesa: i + 1, blancas: (g.players?.[0]?.name || "").slice(0, 120), negras: (g.players?.[1]?.name || "").slice(0, 120),
        empezada: empezo(g), resultado: RESULTADO[g.status || ""] || null,
        cierra_en: typeof r.startsAt === "number" ? new Date(r.startsAt).toISOString() : null,
        actualizado_en: new Date().toISOString(),
      });
    });
  }));
  if (filas.length) {
    const { error } = await admin.from("quiniela_partidas").upsert(filas);
    if (error) throw error;
  }
  await admin.from("salas_torneo").update({ quiniela_sincronizada_en: new Date().toISOString() }).eq("id", sala.id);
}

// deno-lint-ignore no-explicit-any
async function estado(admin: any, sala: { id: string }, token: string) {
  const [{ data: partidas }, { data: tabla }] = await Promise.all([
    admin.from("quiniela_partidas").select("*").eq("sala_id", sala.id).order("ronda_orden").order("mesa"),
    admin.rpc("quiniela_tabla", { p_sala: sala.id }),
  ]);
  const ahora = Date.now();
  const rondas: { id: string; nombre: string; cierra_en: string | null; partidas: unknown[] }[] = [];
  for (const p of partidas || []) {
    let r = rondas.find((x) => x.id === p.ronda_id);
    if (!r) { r = { id: p.ronda_id, nombre: p.ronda_nombre, cierra_en: p.cierra_en, partidas: [] }; rondas.push(r); }
    // Lo mismo que public.quiniela_cerrada(): la base es la que decide al pronosticar.
    const cerrada = p.empezada || p.resultado != null || (p.cierra_en != null && ahora >= new Date(p.cierra_en).getTime());
    r.partidas.push({ id: p.partida_id, mesa: p.mesa, blancas: p.blancas, negras: p.negras, resultado: p.resultado, cerrada });
  }
  let yo = null;
  if (token) {
    const { data } = await admin.rpc("quiniela_yo", { p_sala: sala.id, p_token: token });
    yo = data || null;
  }
  return {
    rondas,
    // El correo NO sale de acá: la tabla pública es nombre y aciertos.
    tabla: (tabla || []).map((t: { puesto: number; nombre: string; aciertos: number; resueltos: number; pronosticos: number }) =>
      ({ puesto: t.puesto, nombre: t.nombre, aciertos: t.aciertos, resueltos: t.resueltos, pronosticos: t.pronosticos })),
    yo,
  };
}

function ipDe(req: Request) {
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);
  // deno-lint-ignore no-explicit-any
  let b: any = {};
  try { b = await req.json(); } catch { /* sin cuerpo */ }
  const clave = String(b.clave || "");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(clave) || clave.length > 40) return json({ error: "Falta la clave de la sala." }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: sala } = await admin.from("salas_torneo")
    .select("id, lichess_id, quiniela, quiniela_sincronizada_en").eq("clave", clave).eq("visible", true).maybeSingle();
  if (!sala || !sala.quiniela || !sala.lichess_id) return json({ error: "La quiniela de esta sala no está abierta." }, 404);

  const accion = String(b.accion || "estado");
  const vieja = !sala.quiniela_sincronizada_en || Date.now() - new Date(sala.quiniela_sincronizada_en).getTime() > SINCRONIZAR_MS;
  if (vieja && accion !== "unirse") {
    try { await sincronizar(admin, sala); } catch (e) { console.error("quiniela: no se pudo copiar de Lichess", e); }
  }

  if (accion === "estado") return json(await estado(admin, sala, String(b.token || "")));

  if (accion === "unirse") {
    const { data, error } = await admin.rpc("quiniela_unirse", {
      p_sala: sala.id, p_nombre: String(b.nombre || ""), p_correo: String(b.correo || ""),
      p_privacidad: String(b.privacidad || ""), p_ip: ipDe(req),
    });
    if (error) { console.error(error); return json({ error: "No se pudo anotar ahora mismo. Intenta de nuevo." }, 500); }
    return json(data);
  }

  if (accion === "pronosticar") {
    const { data, error } = await admin.rpc("quiniela_pronosticar", {
      p_sala: sala.id, p_token: String(b.token || ""), p_partida: String(b.partida || ""), p_pronostico: String(b.pronostico || ""),
    });
    if (error) { console.error(error); return json({ error: "No se pudo guardar ahora mismo. Intenta de nuevo." }, 500); }
    return json(data);
  }

  return json({ error: "Acción desconocida." }, 400);
});
