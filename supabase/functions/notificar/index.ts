// Edge Function: notificar
//
// Manda avisos push a los aparatos donde la gente instaló la Academia.
//
// Acciones:
//   "llave_publica" {}                       -> la llave VAPID que el navegador
//                                               necesita para suscribirse
//   "probar"        {}                       -> un aviso a MIS propios aparatos
//   "avisar"        { a, titulo, cuerpo, url } -> a otras personas
//   "tanda"         { avisos: [...] }        -> lo que disparan los triggers
//
// QUIÉN PUEDE QUÉ. "avisar" es la delicada: mandar una notificación a alguien
// es meterle algo en la pantalla del teléfono. El permiso NO se comprueba a
// mano acá — se leen los perfiles de destino con un cliente que lleva el JWT de
// quien llama, o sea pasando por la RLS de `profiles`. Si la RLS no se los
// devuelve, no son sus alumnos y no se manda nada. Es la misma regla que ya
// usan informes-encargados y cobros-recordatorios: una regla menos escrita dos
// veces.
//
// "tanda" la disparan los triggers de la base (clase abierta, reto nuevo).
// verify_jwt va en false porque un trigger no trae sesión de persona; a cambio
// esa acción exige el secreto que vive en la bóveda.
//
// Las llaves VAPID se generan SOLAS la primera vez y se guardan en la bóveda.
// La privada no está en ningún archivo del repositorio ni en el historial de
// migraciones: nunca se imprime.

import { createClient } from "npm:@supabase/supabase-js@2";
import { generarLlaves, mandar, type LlavesVapid, type Suscripcion } from "./webpush.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITIO = "https://ajedrez-integral.com";
const CONTACTO = "mailto:info@ajedrezintegral.com";
const MAX_APARATOS = 500;

const cors = {
  "Access-Control-Allow-Origin": SITIO,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

/* Las llaves VAPID, de la bóveda. Si no están, se generan y se guardan — una
   sola vez: cambiarlas dejaría inservibles todas las suscripciones que ya hay,
   y por eso push_llaves_guardar() no pisa las que existan. */
let enMemoria: LlavesVapid | null = null;
async function llaves(): Promise<LlavesVapid> {
  if (enMemoria) return enMemoria;
  const { data } = await admin.rpc("push_llaves_leer");
  const fila = Array.isArray(data) ? data[0] : data;
  if (fila?.publica && fila?.privada) {
    enMemoria = { publica: fila.publica, privada: fila.privada };
    return enMemoria;
  }
  const nuevas = await generarLlaves();
  await admin.rpc("push_llaves_guardar", { p_publica: nuevas.publica, p_privada: nuevas.privada });
  // Se vuelve a leer: si otra invocación ganó la carrera, valen las suyas.
  const { data: otra } = await admin.rpc("push_llaves_leer");
  const f2 = Array.isArray(otra) ? otra[0] : otra;
  enMemoria = f2?.publica ? { publica: f2.publica, privada: f2.privada } : nuevas;
  return enMemoria;
}

type Aviso = { titulo: string; cuerpo: string; url?: string; etiqueta?: string };

/* Manda un aviso a todos los aparatos de una lista de personas. */
async function avisarA(ids: string[], aviso: Aviso) {
  if (!ids.length) return { mandados: 0, apagados: 0, fallos: [] as string[] };
  const { data: aparatos, error } = await admin
    .from("push_suscripciones")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", ids).eq("activa", true).limit(MAX_APARATOS);
  if (error) throw new Error(error.message);

  const k = await llaves();
  let mandados = 0, apagados = 0;
  const fallos: string[] = [];
  for (const a of aparatos ?? []) {
    const r = await mandar(a as Suscripcion, aviso, k, CONTACTO);
    if (r.ok) {
      mandados += 1;
      await admin.from("push_suscripciones").update({ usada_at: new Date().toISOString() }).eq("id", a.id);
    } else if (r.caduca) {
      // El aparato ya no existe: se apaga en vez de borrarse, para que se vea
      // que dejó de recibir en vez de desaparecer sin rastro.
      apagados += 1;
      await admin.from("push_suscripciones")
        .update({ activa: false, ultimo_error: `${r.estado}: ya no existe` }).eq("id", a.id);
    } else {
      fallos.push(`${r.estado ?? "?"}: ${r.error ?? ""}`.slice(0, 120));
      await admin.from("push_suscripciones")
        .update({ ultimo_error: `${r.estado ?? "?"}` }).eq("id", a.id);
    }
  }
  return { mandados, apagados, fallos };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Cuerpo JSON inválido" }, 400); }

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const accion = body.action;

  // ------------------------------------------------------- lo que dispara la base
  if (accion === "tanda") {
    const { data: esperado } = await admin.rpc("secreto_tanda_push");
    if (!esperado || !jwt || jwt !== esperado) {
      return json({ error: "Esta acción solo la disparan los avisos de la base" }, 401);
    }
    const ids = Array.isArray(body.a) ? (body.a as string[]).filter((x) => typeof x === "string") : [];
    const aviso: Aviso = {
      titulo: String(body.titulo ?? "Ajedrez Integral").slice(0, 80),
      cuerpo: String(body.cuerpo ?? "").slice(0, 200),
      url: typeof body.url === "string" ? body.url : "/clases.html",
      etiqueta: typeof body.etiqueta === "string" ? body.etiqueta : undefined,
    };
    try { return json({ ok: true, ...(await avisarA(ids, aviso)) }); }
    catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 500); }
  }

  // --------------------------------------------------- lo que pide una persona
  if (!jwt) return json({ error: "Falta token de autorización" }, 401);
  const comoQuienLlama = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userError } = await comoQuienLlama.auth.getUser(jwt);
  if (userError || !userData?.user) return json({ error: "Token inválido" }, 401);
  const quien = userData.user.id;

  if (accion === "llave_publica") {
    return json({ ok: true, llave: (await llaves()).publica });
  }

  if (accion === "probar") {
    try {
      const r = await avisarA([quien], {
        titulo: "Así se ven los avisos",
        cuerpo: "Listo: este aparato va a recibir los avisos de la Academia.",
        url: "/configuracion.html",
        etiqueta: "prueba",
      });
      if (!r.mandados) {
        return json({ error: "Este aparato no tiene los avisos encendidos, o el navegador los rechazó." }, 400);
      }
      return json({ ok: true, ...r });
    } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 500); }
  }

  if (accion === "avisar") {
    const pedidos = Array.isArray(body.a) ? (body.a as string[]).filter((x) => typeof x === "string") : [];
    if (!pedidos.length) return json({ error: "No se dijo a quién avisarle" }, 400);
    const titulo = String(body.titulo ?? "").trim();
    const cuerpo = String(body.cuerpo ?? "").trim();
    if (!titulo || !cuerpo) return json({ error: "El aviso necesita título y texto" }, 400);

    // El permiso: se leen los perfiles con el JWT de quien llama. Los que la
    // RLS no devuelva, no son suyos, y a esos no se les manda nada.
    const { data: puede } = await comoQuienLlama
      .from("profiles").select("id").in("id", pedidos);
    const permitidos = (puede ?? []).map((p: { id: string }) => p.id);
    if (!permitidos.length) return json({ error: "Ninguna de esas personas es alumno tuyo" }, 403);

    try {
      const r = await avisarA(permitidos, {
        titulo: titulo.slice(0, 80),
        cuerpo: cuerpo.slice(0, 200),
        url: typeof body.url === "string" ? body.url : "/clases.html",
      });
      return json({ ok: true, ...r, saltados: pedidos.length - permitidos.length });
    } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 500); }
  }

  return json({ error: "Acción desconocida" }, 400);
});
