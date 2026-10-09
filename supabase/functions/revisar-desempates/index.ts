// Edge Function: revisar-desempates
//
// Le trae a revisar-desempates.html («Revisa los desempates», gratis y sin cuenta) una
// página de un torneo de chess-results.com: el cuadro cruzado por
// clasificación (art=4) o los emparejamientos de todas las rondas (art=2).
// La página lee el HTML y calcula los desempates con js/pareo/desempates.js (el mismo motor de desempates.html, la versión con licencia).
// Ver «Revisa los desempates» en docs/decisiones/juegos-y-torneos.md.
//
// POR QUÉ UNA FUNCIÓN: chess-results no manda CORS, así que el navegador no le
// puede pedir nada. La función solo pasa el HTML; no lo interpreta (lo hace la
// página, donde se prueba con el verificador sin desplegar nada).
//
// NO ES UN PROXY ABIERTO: solo pide páginas de chess-results.com (o de sus
// servidores s1…s99), de un número de torneo, y solo art=2 y art=4.
//
// SIN CUENTA, CON FRENO: verify_jwt en false. Antes de pedir nada pasa por
// `revisar_desempates_frenar()` (interno.frenar_envio_publico, tipo 'revisar_desempates':
// 60 por IP y 600 en total por hora; un torneo son una o dos lecturas), con la
// IP de SU pedido. Lo leído se guarda FRESCO_MS en `revisar_desempates_cache` (solo el
// service role): diez árbitros mirando el mismo torneo son una lectura a
// chess-results, no diez.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FRESCO_MS = 120_000;
const ARTS = new Set([2, 4]);
const MAX_BYTES = 3_000_000;
const CR_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function ipDe(req: Request): string | null {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ??
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0];
  return ip?.trim() || null;
}

// La dirección que pegó el árbitro → el servidor y el número de torneo.
export function direccion(url: string) {
  const u = new URL(String(url).trim());
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("no es una dirección web");
  if (!/^((s\d{1,2}|www)\.)?chess-results\.com$/i.test(u.hostname)) throw new Error("no es chess-results");
  const tnr = (u.pathname.match(/^\/tnr(\d{1,9})\.aspx$/i) || [])[1];
  if (!tnr) throw new Error("sin número de torneo");
  const servidor = /^www\./i.test(u.hostname) ? "chess-results.com" : u.hostname.toLowerCase();
  return { tnr, servidor };
}

async function pedir(url: string): Promise<string> {
  let ultimo: unknown = null;
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": CR_USER_AGENT }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error("chess-results respondió " + res.status);
      const texto = await res.text();
      if (texto.length > MAX_BYTES) throw new Error("la página es demasiado grande");
      return texto;
    } catch (e) { ultimo = e; }
  }
  throw ultimo;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);

  let dir, art;
  try {
    const cuerpo = await req.json();
    dir = direccion(String(cuerpo.url || ""));
    art = Number(cuerpo.art);
    if (!ARTS.has(art)) throw new Error("vista no permitida");
  } catch {
    return json({ error: "Pega la dirección de un torneo de chess-results (por ejemplo https://s3.chess-results.com/tnr1163393.aspx)." }, 400);
  }

  const servicio = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const clave = dir.servidor + "/" + dir.tnr + "/" + art;
  const { data: guardado } = await servicio.from("revisar_desempates_cache").select("datos, leido_en").eq("clave", clave).maybeSingle();
  if (guardado && Date.now() - new Date(guardado.leido_en).getTime() < FRESCO_MS) {
    return json({ html: guardado.datos.html, leido_en: guardado.leido_en });
  }

  // El freno, antes de salir a chess-results (lo guardado no lo gasta).
  const { data: freno, error: frenoError } = await servicio.rpc("revisar_desempates_frenar", { p_ip: ipDe(req) });
  if (frenoError) {
    console.error("revisar-desempates: freno", frenoError);
    return json({ error: "No se pudo atender el pedido. Intenta de nuevo en un rato." }, 503);
  }
  if (freno) return json({ error: freno }, 429);

  try {
    const html = await pedir(`https://${dir.servidor}/tnr${dir.tnr}.aspx?lan=2&art=${art}&turdet=YES&zeilen=99999`);
    const leido_en = new Date().toISOString();
    await servicio.from("revisar_desempates_cache").upsert({ clave, datos: { html }, leido_en });
    return json({ html, leido_en });
  } catch (e) {
    console.error("revisar-desempates:", clave, e);
    if (guardado) return json({ html: guardado.datos.html, leido_en: guardado.leido_en, viejo: true });
    return json({ error: "No se pudo leer el torneo en chess-results: " + (e instanceof Error ? e.message : String(e)) }, 502);
  }
});
