// Edge Function: centroamericano-codigo (verify_jwt en false)
//
// El CÓDIGO CORTO del árbitro del Centroamericano 2026. Una tablet sin cámara y sin WhatsApp no puede abrir el enlace largo (ni su QR):
// el árbitro escribe en ajedrez-integral.com/m el código de 8 caracteres que le dio la organización (K7M2-9QXA), esta función lo
// canjea por el token de su enlace y la página (centroamericano-arbitro.html) sigue como si hubiera abierto el enlace.
//
// SIN CUENTA, ASÍ QUE LA BASE DECIDE (centroamericano_codigo_canjear, solo con la clave de servicio):
//   - el código tiene 8 símbolos de un alfabeto de 31 (sin 0, 1, O, I ni L): 31^8 ≈ 8,5 × 10^11 y solo unas decenas vivas;
//   - el enlace tiene que estar encendido y vigente (se mira en cada canje, igual que el token);
//   - FRENO: 40 fallos cada 10 minutos por dirección y 400 en total (centroamericano_codigo_intentos). De la dirección solo se guarda
//     una huella (sha-256 con la clave de servicio de sal): nunca la IP ni el código que se probó;
//   - los mensajes de error no dicen nada que ayude a adivinar: «no existe», «se apagó» y «venció» solo salen con un código completo.
// Esta función solo normaliza lo que llega, saca la huella de la dirección y traduce la respuesta de la base. No imprime códigos ni tokens.
//
// Acción única: { codigo } → { ok: true, token } o { ok: false, motivo: "formato"|"no"|"apagado"|"vencido"|"demasiados", error }.
// Ver «El código corto del árbitro» en docs/decisiones/juegos-y-torneos.md.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

const MENSAJES: Record<string, { estado: number; error: string }> = {
  formato: { estado: 400, error: "El código lleva 8 letras y números (no tiene 0, 1, O, I ni L). Revisa lo que escribiste." },
  no: { estado: 404, error: "Ese código no es de ningún árbitro. Revísalo o pídele a la organización que te lo confirme." },
  apagado: { estado: 410, error: "Ese código ya no sirve: la organización apagó tu enlace. Pídele uno nuevo." },
  vencido: { estado: 410, error: "Ese código venció. Pídele a la organización que te dé uno nuevo." },
  demasiados: { estado: 429, error: "Se probaron demasiados códigos desde esta conexión. Espera unos minutos y vuelve a intentar, o usa el QR o el enlace." },
};

async function huellaDeLaDireccion(req: Request): Promise<string> {
  const ip = (req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0] || "sin-ip").trim();
  const datos = new TextEncoder().encode(ip + ":" + SERVICE_ROLE_KEY);
  const hash = await crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);

  let cuerpo: Record<string, unknown> = {};
  try { cuerpo = await req.json(); } catch { cuerpo = {}; }
  // Mayúsculas y sin espacios ni guiones: «k7m2 9qxa», «K7M2-9QXA» y «K7M29QXA» son el mismo código.
  const codigo = String(cuerpo.codigo ?? "").slice(0, 40).toUpperCase().replace(/[^A-Z0-9]/g, "");

  const servicio = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await servicio.rpc("centroamericano_codigo_canjear", { p_codigo: codigo, p_ip_huella: await huellaDeLaDireccion(req) });
  if (error || !data) {
    console.error("centroamericano-codigo: la base no contestó", error?.code ?? "");
    return json({ ok: false, motivo: "error", error: "No se pudo comprobar el código ahora. Intenta de nuevo en un momento." }, 503);
  }
  if (data.ok === true && typeof data.token === "string") return json({ ok: true, token: data.token });
  const m = MENSAJES[String(data.motivo)] ?? MENSAJES.no;
  return json({ ok: false, motivo: String(data.motivo), error: m.error }, m.estado);
});
