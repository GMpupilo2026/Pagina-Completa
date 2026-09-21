// Edge Function: informes-encargados
//
// Manda a los encargados (madre, padre, quien sea) el informe del alumno, y
// arma el mismo informe para verlo o descargarlo desde la página.
//
// Tres acciones:
//   "vista_previa" { student_id, frecuencia }  -> devuelve el HTML, no manda nada
//   "enviar_ahora" { encargado_id }            -> arma y manda ese, ahora mismo
//   "tanda"        {}                          -> manda todos los que toquen hoy
//
// QUIÉN PUEDE QUÉ. Las dos primeras las llama una persona desde informes.html
// con su sesión, y el permiso NO se comprueba aquí a mano: se lee la fila con
// un cliente que lleva su JWT, o sea pasando por la RLS. Si la RLS no se la
// devuelve, no es profesor de ese alumno y se acabó. Una regla menos escrita
// dos veces.
//
// "tanda" la dispara pg_cron una vez al día. Va con verify_jwt en false porque
// el disparador no trae sesión de persona; a cambio, esa acción exige un
// secreto que vive en la bóveda (Vault) y que esta función vuelve a leer con la
// service role para compararlo. Sin ese secreto no hace nada.
//
// El correo sale por Resend (secreto RESEND_API_KEY, ya configurado) desde el
// dominio verificado del sitio.

import { createClient } from "npm:@supabase/supabase-js@2";
import { informeHtml, PERIODOS, type Frecuencia } from "./informe-html.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";
const DE = Deno.env.get("RESEND_FROM_INFORMES") || "Ajedrez Integral <informes@ajedrez-integral.com>";
const MAX_POR_TANDA = 200;   // techo de cordura por corrida

const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Desde cuándo cuenta el informe según su frecuencia.
function desdeDe(frecuencia: Frecuencia): Date {
  const d = new Date();
  const dias = PERIODOS[frecuencia]?.dias ?? 7;
  d.setUTCDate(d.getUTCDate() - dias);
  return d;
}

async function armar(studentId: string, frecuencia: Frecuencia, cliente = admin) {
  const desde = desdeDe(frecuencia);
  const hasta = new Date();
  const { data, error } = await cliente.rpc("informe_de_alumno", {
    p_alumno: studentId,
    p_desde: desde.toISOString(),
    p_hasta: hasta.toISOString(),
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No se encontró ese alumno");
  return { datos: data, html: informeHtml(data, frecuencia, SITE_URL) };
}

async function mandar(para: string, asunto: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { ok: false, error: "Falta configurar RESEND_API_KEY" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: DE, to: [para], subject: asunto, html }),
  });
  if (!res.ok) return { ok: false, error: `Resend respondió ${res.status}: ${await res.text()}` };
  return { ok: true };
}

function asuntoDe(nombre: string, frecuencia: Frecuencia) {
  return `${PERIODOS[frecuencia]?.asunto ?? "Informe"} de ${nombre} — Ajedrez Integral`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Cuerpo JSON inválido" }, 400); }

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const accion = body.action;

  // ------------------------------------------------------------- la tanda
  if (accion === "tanda") {
    const { data: esperado } = await admin.rpc("secreto_tanda_informes");
    if (!esperado || !jwt || jwt !== esperado) {
      return json({ error: "Esta acción solo la dispara el programador de tareas" }, 401);
    }
    const ahora = new Date();
    const { data: encargados, error } = await admin
      .from("encargados")
      .select("id, student_id, nombre, email, frecuencia, ultimo_envio_at")
      .eq("activo", true)
      .limit(MAX_POR_TANDA);
    if (error) return json({ error: error.message }, 500);

    let mandados = 0, saltados = 0;
    const fallos: string[] = [];
    for (const e of encargados ?? []) {
      const cada = PERIODOS[e.frecuencia as Frecuencia]?.dias ?? 7;
      if (e.ultimo_envio_at) {
        const dias = (ahora.getTime() - new Date(e.ultimo_envio_at).getTime()) / 86400000;
        // Un margen de medio día: si la tanda corre unos minutos antes que ayer,
        // el informe no se salta una vuelta entera por eso.
        if (dias < cada - 0.5) { saltados += 1; continue; }
      }
      try {
        const { datos, html } = await armar(e.student_id, e.frecuencia as Frecuencia);
        const r = await mandar(e.email, asuntoDe(datos.alumno ?? "tu hijo o hija", e.frecuencia as Frecuencia), html);
        if (!r.ok) { fallos.push(`${e.email}: ${r.error}`); continue; }
        // Solo se marca después de que Resend lo aceptó: si falló, la próxima
        // tanda lo vuelve a intentar en vez de darlo por mandado.
        await admin.from("encargados").update({ ultimo_envio_at: ahora.toISOString() }).eq("id", e.id);
        mandados += 1;
      } catch (err) {
        fallos.push(`${e.email}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return json({ ok: true, mandados, saltados, fallos });
  }

  // ------------------------------------------- lo que pide una persona
  if (!jwt) return json({ error: "Falta token de autorización" }, 401);
  // Este cliente lleva el JWT de quien llama: TODO lo que lea pasa por la RLS,
  // igual que en el resto del sitio. NO se valida el token llamando antes a
  // `auth.getUser()` (GoTrue): ese endpoint exige además que la SESIÓN siga
  // viva en `auth.sessions`, un requisito más estricto que el que usa
  // PostgREST (que solo comprueba la firma y el vencimiento del JWT). Con dos
  // pestañas abiertas de la misma cuenta, o al rotarse el refresh token,
  // GoTrue puede dar esa sesión por muerta aunque el access_token siga siendo
  // válido para todo lo demás -y entonces esta función respondía "Token
  // inválido" con un token perfectamente bueno, mientras el resto de la
  // página seguía funcionando porque nunca pasa por ese chequeo. El permiso
  // de verdad lo sigue dando la RLS de cada consulta de abajo: si el token es
  // de verdad inválido, esas consultas fallan igual y el error se cuenta desde
  // ahí, no antes.
  const comoQuienLlama = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  if (accion === "vista_previa") {
    const studentId = typeof body.student_id === "string" ? body.student_id : "";
    const frecuencia = (typeof body.frecuencia === "string" ? body.frecuencia : "semanal") as Frecuencia;
    if (!studentId) return json({ error: "student_id es requerido" }, 400);
    if (!PERIODOS[frecuencia]) return json({ error: "Frecuencia inválida" }, 400);
    try {
      // Con el cliente de quien llama: si no es profesor de ese alumno, la RLS
      // no le devuelve nada y la función falla sola.
      const { html, datos } = await armar(studentId, frecuencia, comoQuienLlama);
      return json({ ok: true, html, alumno: datos.alumno });
    } catch (err) {
      return json({ error: "No se pudo armar el informe de ese alumno" }, 403);
    }
  }

  if (accion === "enviar_ahora") {
    const encargadoId = typeof body.encargado_id === "string" ? body.encargado_id : "";
    if (!encargadoId) return json({ error: "encargado_id es requerido" }, 400);

    // El permiso lo decide la RLS: si esta consulta no devuelve la fila, quien
    // llama no es profesor de ese alumno.
    const { data: enc, error: encError } = await comoQuienLlama
      .from("encargados")
      .select("id, student_id, nombre, email, frecuencia")
      .eq("id", encargadoId)
      .maybeSingle();
    if (encError) return json({ error: encError.message }, 400);
    if (!enc) return json({ error: "No se encontró ese encargado, o no es de un alumno tuyo" }, 403);

    try {
      const { datos, html } = await armar(enc.student_id, enc.frecuencia as Frecuencia);
      const r = await mandar(enc.email, asuntoDe(datos.alumno ?? "tu hijo o hija", enc.frecuencia as Frecuencia), html);
      if (!r.ok) return json({ error: r.error }, 502);
      await admin.from("encargados").update({ ultimo_envio_at: new Date().toISOString() }).eq("id", enc.id);
      return json({ ok: true, email: enc.email });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }

  return json({ error: "Acción desconocida" }, 400);
});
