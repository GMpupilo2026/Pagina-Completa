// Edge Function: explorador-maestros
//
// Las partidas de maestros de una lista de posiciones, del explorador de
// aperturas de Lichess (explorer.lichess.org/masters), para ver dónde un rival
// deja la teoría en preparacion-rivales.html. Ver «Dónde deja la teoría:
// etapa 5» en docs/decisiones/paneles.md.
//
// POR QUÉ UNA FUNCIÓN: desde 2026 el explorador exige un token de Lichess en
// cada pedido. En la página, ese token quedaría publicado; acá vive en los
// secretos del proyecto (LICHESS_TOKEN, un token personal SIN permisos: el
// explorador no pide ninguno). Sin el secreto, la función lo dice
// (motivo «sin_token») y la página explica qué falta.
//
// NO ES UN PROXY ABIERTO: solo pide /masters, solo con una posición que pasa
// la forma de un FEN, y solo para quien puede preparar rivales
// (puedo_preparar_rivales(), con la sesión de quien llama).
//
// CACHÉ: cada posición se guarda en explorador_maestros_cache (solo la ve el
// service role) y vale por FRESCO_DIAS. La base de maestros crece despacio
// —unas pocas partidas nuevas por mes en cada posición de apertura— y la
// misma apertura la consultan todos los profesores. Se pide de a una, en
// orden, y se para con el primer 429: lo que no alcanzó vuelve en `faltan`,
// y la página lo vuelve a pedir después.
//
// verify_jwt en true.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LICHESS_TOKEN = Deno.env.get("LICHESS_TOKEN") || "";
const FRESCO_DIAS = 180;
const MAX_POSICIONES = 60;       // por llamada
const MAX_PEDIDOS = 30;          // a Lichess, por llamada
const PRESUPUESTO_MS = 25_000;   // para no pasarse del tiempo de la función

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// Colocación, turno, enroques y al paso: los cuatro campos que dicen qué
// posición es. Los contadores de jugadas no cambian nada y partirían la caché.
const FEN = /^([pnbrqkPNBRQK1-8]{1,8}\/){7}[pnbrqkPNBRQK1-8]{1,8} [wb] (-|K?Q?k?q?) (-|[a-h][36])$/;
function normalizar(f: unknown): string | null {
  const s = String(f || "").trim().split(/\s+/).slice(0, 4).join(" ");
  return FEN.test(s) ? s : null;
}

interface Jugada { uci: string; san: string; white: number; draws: number; black: number; averageRating?: number; }
interface Respuesta { white: number; draws: number; black: number; moves: Jugada[]; opening: { eco: string; name: string } | null; }

// Lo que se guarda y se devuelve: solo lo que usa la página.
function compacto(r: Respuesta) {
  return {
    w: r.white, d: r.draws, b: r.black,
    jugadas: (r.moves || []).map((m) => ({ san: m.san, uci: m.uci, w: m.white, d: m.draws, b: m.black, elo: m.averageRating ?? null })),
    apertura: r.opening ? { eco: r.opening.eco, nombre: r.opening.name } : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);

  // Quién llama: con SU sesión, así la base contesta por esa cuenta.
  const usuario = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: puede, error: ePuede } = await usuario.rpc("puedo_preparar_rivales");
  if (ePuede || puede !== true) return json({ error: "La preparación de rivales no está activa para tu cuenta." }, 403);

  let pedidas: unknown[] = [];
  try { pedidas = (await req.json()).fens; } catch { /* sin cuerpo */ }
  if (!Array.isArray(pedidas) || !pedidas.length) return json({ error: "Faltan las posiciones." }, 400);
  if (pedidas.length > MAX_POSICIONES) return json({ error: "Demasiadas posiciones de una vez (" + MAX_POSICIONES + " como mucho)." }, 400);
  const fens = [...new Set(pedidas.map(normalizar))];
  if (fens.some((f) => !f)) return json({ error: "Una de las posiciones no es un FEN válido." }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const posiciones: Record<string, unknown> = {};
  const { data: guardadas } = await admin.from("explorador_maestros_cache").select("fen, datos, leido_en").in("fen", fens as string[]);
  const limite = Date.now() - FRESCO_DIAS * 86_400_000;
  for (const g of guardadas || []) {
    if (new Date(g.leido_en).getTime() >= limite) posiciones[g.fen] = g.datos;
  }

  let faltan = (fens as string[]).filter((f) => !posiciones[f]);
  let motivo: string | null = null;
  if (faltan.length && !LICHESS_TOKEN) motivo = "sin_token";

  const empezo = Date.now();
  let pedidos = 0;
  while (faltan.length && !motivo) {
    if (pedidos >= MAX_PEDIDOS || Date.now() - empezo > PRESUPUESTO_MS) { motivo = "sigue"; break; }
    const fen = faltan[0];
    const url = "https://explorer.lichess.org/masters?moves=12&topGames=0&fen=" + encodeURIComponent(fen + " 0 1");
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: "Bearer " + LICHESS_TOKEN, Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      console.error("explorador-maestros:", e);
      motivo = "error";
      break;
    }
    pedidos += 1;
    if (res.status === 429) { motivo = "limitado"; break; }
    if (res.status === 401 || res.status === 403) { motivo = "token_invalido"; break; }
    if (!res.ok) { console.error("explorador-maestros: Lichess respondió", res.status); motivo = "error"; break; }
    const datos = compacto(await res.json() as Respuesta);
    posiciones[fen] = datos;
    await admin.from("explorador_maestros_cache").upsert({ fen, datos, leido_en: new Date().toISOString() });
    faltan = faltan.slice(1);
  }

  return json({ posiciones, faltan, motivo });
});
