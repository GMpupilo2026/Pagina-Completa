// Edge Function: informes-encargados
//
// Manda a los encargados (madre, padre, quien sea) el informe del alumno, y
// arma el mismo informe para verlo o descargarlo desde la página.
//
// Cuatro acciones:
//   "vista_previa"       { student_id, frecuencia } -> devuelve el HTML, no manda nada
//   "enviar_ahora"       { encargado_id }           -> arma y manda ese, ahora mismo
//   "invitar_practicar"  { student_id }             -> empujoncito puntual a TODOS sus
//                                                       encargados activos, fuera de la
//                                                       cadencia del informe programado
//   "tanda"              {}                         -> manda a quien le toque en esta hora
//
// QUIÉN PUEDE QUÉ. Las tres primeras las llama una persona desde informes.html
// con su sesión, y el permiso NO se comprueba aquí a mano: se lee la fila con
// un cliente que lleva su JWT, o sea pasando por la RLS. Si la RLS no se la
// devuelve, no es profesor de ese alumno y se acabó. Una regla menos escrita
// dos veces.
//
// "tanda" la dispara pg_cron una vez POR HORA (antes era una vez al día, a las
// 13:00 UTC / 7 de la mañana de Costa Rica siempre). Cada encargado elige su
// propia hora de Costa Rica (`encargados.hora_envio`) y, si su frecuencia es
// semanal, opcionalmente también el día (`encargados.dia_semana`); esta tanda
// filtra por la hora que está corriendo ahora y salta a quien no le toque
// todavía, así que sigue siendo inofensivo correrla de más — cada quien recibe
// el suyo una sola vez por periodo, nunca de más. Va con verify_jwt en false
// porque el disparador no trae sesión de persona; a cambio, esa acción exige
// un secreto que vive en la bóveda (Vault) y que esta función vuelve a leer con
// la service role para compararlo. Sin ese secreto no hace nada.
//
// El correo sale por Resend (secreto RESEND_API_KEY, ya configurado) desde el
// dominio verificado del sitio.

import { createClient } from "npm:@supabase/supabase-js@2";
import { informeHtml, invitarPracticarHtml, PERIODOS, type Frecuencia } from "./informe-html.ts";
import { contactoDeConsultas } from "./contacto-academia.ts";
import { remitenteDe, type Remitente } from "./remitente-academia.ts";
import { cabeceraCorreo, firmaDe } from "./marca-correo.ts";

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

// Costa Rica no tiene horario de verano: es UTC-6 todo el año, así que la
// hora y el día locales salen de restar 6 horas sin más vueltas.
function horaCostaRica(ahora: Date): number {
  return (ahora.getUTCHours() + 24 - 6) % 24;
}
function diaSemanaCostaRica(ahora: Date): number {
  return new Date(ahora.getTime() - 6 * 3600 * 1000).getUTCDay();
}

async function armar(studentId: string, frecuencia: Frecuencia, cliente = admin) {
  // El número al que la casa escribe sale de `ajustes_academia` y lo pone
  // quien coordina; se lee siempre con la service role, porque el informe se
  // arma igual para la tanda de pg_cron que para la vista previa.
  const contacto = await contactoDeConsultas(admin);
  const desde = desdeDe(frecuencia);
  const hasta = new Date();
  const { data, error } = await cliente.rpc("informe_de_alumno", {
    p_alumno: studentId,
    p_desde: desde.toISOString(),
    p_hasta: hasta.toISOString(),
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No se encontró ese alumno");
  // El remitente trae la marca de la academia: el correo sale con su nombre,
  // su logo y su color, y la vista previa enseña exactamente eso.
  const remite = await remitenteDe(admin, studentId, DE);
  return { datos: data, remite,
    html: informeHtml(data, frecuencia, SITE_URL, contacto, (t, c) => cabeceraCorreo(remite.marca, t, c)) };
}

async function mandar(para: string, asunto: string, html: string, remite?: Remitente) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { ok: false, error: "Falta configurar RESEND_API_KEY" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: remite?.from ?? DE, to: [para], subject: asunto, html,
      ...(remite?.replyTo.length ? { reply_to: remite.replyTo } : {}),
    }),
  });
  if (!res.ok) return { ok: false, error: `Resend respondió ${res.status}: ${await res.text()}` };
  return { ok: true };
}

function asuntoDe(nombre: string, frecuencia: Frecuencia, remite: Remitente) {
  return `${PERIODOS[frecuencia]?.asunto ?? "Informe"} de ${nombre} — ${firmaDe(remite.marca)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Cuerpo JSON inválido" }, 400); }

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const accion = body.action;

  // ------------------------------------------------------------- la tanda
  //
  // El cron dispara esto cada hora, no una vez al día: cada encargado elige su
  // propia hora (`hora_envio`, en tiempo de Costa Rica) y esta tanda solo mira
  // a quienes les toca en la hora que está corriendo ahora mismo. Para la
  // frecuencia semanal hay además un día opcional (`dia_semana`): si lo puso,
  // se respeta; si lo dejó en NULL, se manda el día que caiga, como antes de
  // que existiera esta columna.
  if (accion === "tanda") {
    const { data: esperado } = await admin.rpc("secreto_tanda_informes");
    if (!esperado || !jwt || jwt !== esperado) {
      return json({ error: "Esta acción solo la dispara el programador de tareas" }, 401);
    }
    const ahora = new Date();
    const horaCR = horaCostaRica(ahora);
    const diaCR = diaSemanaCostaRica(ahora);
    const { data: encargados, error } = await admin
      .from("encargados")
      .select("id, student_id, nombre, email, frecuencia, ultimo_envio_at, dia_semana")
      .eq("activo", true)
      .eq("hora_envio", horaCR)
      .limit(MAX_POR_TANDA);
    if (error) return json({ error: error.message }, 500);

    let mandados = 0, saltados = 0;
    const fallos: string[] = [];
    for (const e of encargados ?? []) {
      if (e.frecuencia === "semanal" && e.dia_semana !== null && e.dia_semana !== diaCR) {
        saltados += 1;
        continue;
      }
      const cada = PERIODOS[e.frecuencia as Frecuencia]?.dias ?? 7;
      if (e.ultimo_envio_at) {
        const dias = (ahora.getTime() - new Date(e.ultimo_envio_at).getTime()) / 86400000;
        // Un margen de medio día: si la tanda corre unos minutos antes que la
        // vez pasada, el informe no se salta una vuelta entera por eso.
        if (dias < cada - 0.5) { saltados += 1; continue; }
      }
      try {
        const { datos, html, remite } = await armar(e.student_id, e.frecuencia as Frecuencia);
        const r = await mandar(e.email, asuntoDe(datos.alumno ?? "tu hijo o hija", e.frecuencia as Frecuencia, remite), html, remite);
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
      const { datos, html, remite } = await armar(enc.student_id, enc.frecuencia as Frecuencia);
      const r = await mandar(enc.email, asuntoDe(datos.alumno ?? "tu hijo o hija", enc.frecuencia as Frecuencia, remite), html, remite);
      if (!r.ok) return json({ error: r.error }, 502);
      await admin.from("encargados").update({ ultimo_envio_at: new Date().toISOString() }).eq("id", enc.id);
      return json({ ok: true, email: enc.email });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }

  // ------------------------------------------- invitar_practicar
  //
  // Botón de un clic desde la lista de "sin entrenar" en informes.html: no es
  // el informe programado ni cuenta para su cadencia (por eso NO toca
  // `ultimo_envio_at`, que es solo del envío periódico), es un empujón puntual
  // a TODOS los encargados activos de ese alumno, con cuánto tiempo lleva sin
  // entrar.
  if (accion === "invitar_practicar") {
    const studentId = typeof body.student_id === "string" ? body.student_id : "";
    if (!studentId) return json({ error: "student_id es requerido" }, 400);

    // El permiso lo decide la RLS: si esta consulta no devuelve la fila, quien
    // llama no es profesor de ese alumno.
    const { data: alumno, error: alumnoError } = await comoQuienLlama
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", studentId)
      .maybeSingle();
    if (alumnoError) return json({ error: alumnoError.message }, 400);
    if (!alumno) return json({ error: "No se encontró ese alumno, o no es tuyo" }, 403);

    const { data: encargados, error: encError } = await comoQuienLlama
      .from("encargados")
      .select("id, nombre, email")
      .eq("student_id", studentId)
      .eq("activo", true);
    if (encError) return json({ error: encError.message }, 400);
    if (!encargados || !encargados.length) {
      return json({ error: "Este alumno todavía no tiene ningún encargado registrado" }, 404);
    }

    const { data: ultima } = await comoQuienLlama
      .from("training_progress")
      .select("created_at")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const dias = ultima?.created_at
      ? Math.max(1, Math.round((Date.now() - new Date(ultima.created_at).getTime()) / 86400000))
      : null;

    const nombre = alumno.full_name || alumno.email || "tu hijo o hija";
    const contacto = await contactoDeConsultas(admin);
    const remite = await remitenteDe(admin, studentId, DE);
    const html = invitarPracticarHtml(nombre, dias, SITE_URL, contacto, (t, c) => cabeceraCorreo(remite.marca, t, c));
    const asunto = `Un empujoncito para ${String(nombre).split(" ")[0]} — ${firmaDe(remite.marca)}`;

    let mandados = 0;
    const fallos: string[] = [];
    for (const e of encargados) {
      const r = await mandar(e.email, asunto, html, remite);
      if (r.ok) mandados += 1; else fallos.push(`${e.email}: ${r.error}`);
    }
    if (!mandados) return json({ error: fallos.join("; ") || "No se pudo mandar" }, 502);
    return json({ ok: true, mandados, fallos });
  }

  return json({ error: "Acción desconocida" }, 400);
});
