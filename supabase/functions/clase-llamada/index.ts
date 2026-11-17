// Edge Function: clase-llamada
//
// La llamada de voz de la clase en vivo (sesion.html, js/clase-llamada.js),
// por LiveKit. Ver «La llamada de voz de la clase» en
// docs/decisiones/clase-en-vivo.md.
//
// Dos cosas, las dos con { profesor } (el dueño del tablero de la clase):
//   - "pase"        → el pase (un JWT de LiveKit) para entrar a la sala de la
//                     clase abierta de ese profesor. El profe entra pudiendo
//                     hablar; el alumno, solo si TIENE EL TURNO de la clase.
//   - "sincronizar" → (solo el profe) deja la sala igual que la clase: puede
//                     hablar quien tiene el turno y nadie más, y quien el profe
//                     sacó de la clase sale de la sala. La página la llama cada
//                     vez que da o termina un turno y cuando saca a alguien.
//
// QUIÉN DECIDE ES LA BASE: public.llamada_de_la_clase(p_profesor), llamada con
// el TOKEN DE QUIEN PIDE (clave anónima + su Authorization), nunca con la clave
// de servicio. Así pasa por la RLS y por antes_de_cada_pedido(): con la
// verificación en dos pasos a medias, PostgREST corta antes. El turno es
// game_state.elegido, el mismo de «Darle la palabra» (solo un profesor lo
// cambia: protect_game_state_teacher_columns), así que un alumno no puede darse
// la palabra desde la consola: el permiso de hablar lo pone el servidor de
// LiveKit, no la página.
//
// Solo voz: el pase deja publicar únicamente el micrófono (ni cámara ni
// compartir pantalla, que a un alumno ciego no le sirven y en una clase de
// menores es un riesgo de más).
//
// LiveKit no tiene librería para Deno que haga falta acá: el pase es un JWT
// HS256 firmado con el secreto, y las dos llamadas al servidor (la lista de la
// sala y cambiar un permiso) son POST de Twirp con JSON. Se hacen a mano con
// Web Crypto y fetch: una dependencia menos que vigilar.
//
// Secretos (Supabase › Edge Functions › Secrets): LIVEKIT_URL (wss://…),
// LIVEKIT_API_KEY y LIVEKIT_API_SECRET. Sin ellos contesta 503 y la página dice
// que la llamada todavía no está disponible.
//
// verify_jwt en true: solo con sesión.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const LK_URL = Deno.env.get("LIVEKIT_URL") ?? "";
const LK_KEY = Deno.env.get("LIVEKIT_API_KEY") ?? "";
const LK_SECRETO = Deno.env.get("LIVEKIT_API_SECRET") ?? "";
const LK_HTTP = LK_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/+$/, "");
const DURA_EL_PASE_S = 4 * 60 * 60; // una clase larga; al cerrarse la clase la sala cambia igual

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// ------------------------------------------------------------- el JWT de LiveKit

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const texto64 = (s: string) => b64url(new TextEncoder().encode(s));

async function firmar(claims: Record<string, unknown>): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo = { iss: LK_KEY, nbf: ahora - 10, exp: ahora + DURA_EL_PASE_S, ...claims };
  const datos = texto64(JSON.stringify({ alg: "HS256", typ: "JWT" })) + "." + texto64(JSON.stringify(cuerpo));
  const llave = await crypto.subtle.importKey("raw", new TextEncoder().encode(LK_SECRETO), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", llave, new TextEncoder().encode(datos)));
  return datos + "." + b64url(firma);
}

// Los permisos de LiveKit se reemplazan ENTEROS: hay que mandarlos todos.
// La fuente se escribe distinto en cada lado: en el pase (JWT) en minúscula,
// «microphone»; en Twirp es el nombre del enum de protobuf, «MICROPHONE».
function permisos(hablar: boolean, fuente: "microphone" | "MICROPHONE") {
  return {
    canSubscribe: true,
    canPublish: hablar,
    canPublishData: false,       // los avisos van por la clase (Realtime), no por la sala
    canUpdateMetadata: false,    // la mano se levanta en la clase, no en la sala
    canPublishSources: [fuente],
  };
}

async function servidor(metodo: string, sala: string, cuerpo: Record<string, unknown>) {
  const token = await firmar({ sub: "clase-llamada", video: { roomAdmin: true, room: sala } });
  const r = await fetch(`${LK_HTTP}/twirp/livekit.RoomService/${metodo}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ room: sala, ...cuerpo }),
  });
  const datos = await r.json().catch(() => ({}));
  return { ok: r.ok, datos };
}

// ------------------------------------------------------------- la función

type Llamada = { yo: string; rol: "profe" | "alumno"; sala: string; nombre: string; elegido: string | null; sacados: string[] | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);
  if (!LK_URL || !LK_KEY || !LK_SECRETO) {
    return json({ error: "La llamada de la clase todavía no está disponible.", sin_configurar: true }, 503);
  }

  const autorizacion = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(autorizacion)) return json({ error: "Inicia sesión para entrar a la llamada." }, 401);

  let accion = "", profesor = "";
  try {
    const cuerpo = await req.json();
    accion = String(cuerpo.accion || "");
    profesor = String(cuerpo.profesor || "");
  } catch { /* abajo se rechaza */ }
  if (!UUID.test(profesor) || !["pase", "sincronizar"].includes(accion)) {
    return json({ error: "Pedido incompleto." }, 400);
  }

  // El permiso, con el token de quien llama (ver la cabecera).
  const comoQuienLlama = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: autorizacion } },
  });
  const { data, error } = await comoQuienLlama.rpc("llamada_de_la_clase", { p_profesor: profesor });
  if (error) return json({ error: "No se pudo comprobar tu clase: " + error.message }, 403);
  const ll = data as Llamada | null;
  if (!ll) return json({ error: "No hay una clase abierta a la que puedas entrar." }, 403);

  if (accion === "pase") {
    const hablar = ll.rol === "profe" || ll.elegido === ll.yo;
    const token = await firmar({
      sub: ll.yo,
      name: ll.nombre,
      attributes: { rol: ll.rol },
      video: { room: ll.sala, roomJoin: true, ...permisos(hablar, "microphone") },
    });
    return json({ url: LK_URL, token, sala: ll.sala, rol: ll.rol, yo: ll.yo, puede_hablar: hablar });
  }

  // "sincronizar": solo el profe de la clase.
  if (ll.rol !== "profe") return json({ error: "Solo quien da la clase reparte la palabra." }, 403);
  const lista = await servidor("ListParticipants", ll.sala, {});
  // Una sala vacía todavía no existe en LiveKit: no hay nada que acomodar.
  if (!lista.ok) return json({ listo: true, cambiados: 0, sacados: 0 });
  const sacados = new Set(ll.sacados || []);
  let cambiados = 0, fuera = 0;
  // LiveKit CONTESTA con los nombres de protobuf (`can_publish`) aunque acepte
  // `canPublish` al pedir: leyendo solo uno, cada pasada volvía a «cambiar» a
  // todos (comprobado contra el servidor de verdad).
  type Permiso = { can_publish?: boolean; canPublish?: boolean };
  for (const p of (lista.datos.participants || []) as Array<{ identity: string; permission?: Permiso }>) {
    if (p.identity === ll.yo) continue;
    if (sacados.has(p.identity)) {
      const r = await servidor("RemoveParticipant", ll.sala, { identity: p.identity });
      if (r.ok) fuera++;
      continue;
    }
    const hablar = p.identity === ll.elegido;
    if (Boolean(p.permission?.can_publish ?? p.permission?.canPublish) === hablar) continue;
    const r = await servidor("UpdateParticipant", ll.sala, { identity: p.identity, permission: permisos(hablar, "MICROPHONE") });
    if (r.ok) cambiados++;
  }
  return json({ listo: true, cambiados, sacados: fuera });
});
