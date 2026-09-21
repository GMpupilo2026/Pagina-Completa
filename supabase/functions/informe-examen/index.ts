// Edge Function: informe-examen
//
// Manda a la casa el informe de UN examen: la nota, cómo le fue por área y
// qué contestó en cada pregunta.
//
// Es una función APARTE de `informes-encargados` a propósito, aunque las dos
// manden correo a los mismos encargados y por el mismo Resend. Esa otra
// función es la que lleva los informes periódicos a todas las familias y la
// dispara pg_cron todos los días: meterle una acción más para esto habría
// puesto en riesgo, por un botón nuevo, el camino que ya funciona — y si se
// rompiera no daría ningún error, simplemente dejarían de llegar los informes
// y nadie se enteraría hasta que alguien preguntara.
//
// QUIÉN PUEDE MANDARLO no se comprueba acá a mano: el informe se lee con un
// cliente que lleva el JWT de quien llama, o sea pasando por la RLS. Si esa
// persona no es el profesor de ese alumno, `examen_informe()` no le devuelve
// nada y la función corta. Es la misma regla que ya usan `informes-encargados`
// e `inscribir-alumno`, escrita una sola vez.
//
// El correo sale por Resend desde el dominio verificado, igual que el resto.

import { createClient } from "npm:@supabase/supabase-js@2";
import { informeExamenHtml } from "./examen-html.ts";
import { contactoDeConsultas } from "./contacto-academia.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";
const DE = Deno.env.get("RESEND_FROM_INFORMES") || "Ajedrez Integral <informes@ajedrez-integral.com>";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Cuerpo JSON inválido" }, 400); }

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Falta token de autorización" }, 401);

  const examenId = typeof body.examen_id === "string" ? body.examen_id : "";
  if (!examenId) return json({ error: "examen_id es requerido" }, 400);

  // Con el JWT de quien llama: la RLS decide si puede ver ese examen. No se
  // valida el token contra GoTrue a propósito — ver el comentario largo de
  // informes-encargados: ese chequeo rechazaba tokens perfectamente buenos.
  const comoQuienLlama = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: inf, error } = await comoQuienLlama.rpc("examen_informe", { p_examen: examenId });
  if (error || !inf) {
    return json({ error: "No se pudo leer ese examen, o no es de un alumno tuyo" }, 403);
  }
  // El informe del alumno viene sin claves; el de un profesor, con ellas. Si
  // quien llama fuera el propio alumno no habría a quién mandárselo igual,
  // pero se corta explícito: esto es un botón del profesor.
  if (!inf.preguntas || !Array.isArray(inf.preguntas)) {
    return json({ error: "Ese examen todavía no tiene informe" }, 400);
  }

  // Los encargados, también por la RLS.
  const { data: encargados, error: errEnc } = await comoQuienLlama
    .from("encargados")
    .select("id, nombre, email, activo")
    .eq("student_id", inf.alumno_id)
    .eq("activo", true);
  if (errEnc) return json({ error: errEnc.message }, 400);
  if (!encargados || !encargados.length) {
    return json({ error: "Ese alumno no tiene ninguna persona encargada apuntada" }, 400);
  }

  const html = informeExamenHtml(inf, SITE_URL, await contactoDeConsultas(admin));
  const asunto = `Resultado del examen de ${inf.alumno ?? "tu hijo o hija"} — Ajedrez Integral`;

  let enviados = 0;
  const fallos: string[] = [];
  for (const e of encargados) {
    const r = await mandar(e.email, asunto, html);
    if (r.ok) enviados += 1; else fallos.push(`${e.email}: ${r.error}`);
  }

  // Se marca DESPUÉS de que Resend acepte, nunca antes: si falló, que se
  // pueda volver a intentar en vez de darlo por mandado.
  if (enviados > 0) {
    await admin.from("examenes").update({ informe_enviado_at: new Date().toISOString() }).eq("id", examenId);
  }
  if (!enviados) return json({ error: fallos.join(" · ") || "No se pudo mandar" }, 502);
  return json({ ok: true, enviados, fallos });
});
