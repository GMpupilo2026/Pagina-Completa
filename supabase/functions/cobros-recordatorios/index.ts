// Edge Function: cobros-recordatorios
//
// Avisa por correo cuando una mensualidad está por vencer, cuando se venció y
// cuando lleva rato sin pagarse.
//
// Cuatro acciones:
//   "vista_previa"      { student_id }  -> devuelve el HTML del estado de cuenta
//   "recordar_ahora"    { student_id }  -> lo manda en el momento a quien corresponda
//   "tanda"             {}              -> la corrida diaria
//   "tanda_programados" {}              -> los recordatorios de cobros_recordatorios_programados
//                                          que ya llegaron a su día y hora
//
// QUIÉN PUEDE QUÉ. Las dos primeras las llama una persona desde cobros.html con
// su sesión, y el permiso NO se comprueba aquí a mano: se leen las filas con un
// cliente que lleva su JWT, o sea pasando por la RLS. Si la RLS no le devuelve
// los cobros de ese alumno, no coordina ni administra y se acabó.
//
// "tanda" y "tanda_programados" las dispara pg_cron. Van con verify_jwt en false
// porque el disparador no trae sesión de persona; a cambio exigen el secreto que
// vive en el Vault, que esta función vuelve a leer con la service role para
// compararlo — el mismo secreto para las dos, `tanda_cobros_secreto`.
//
// "tanda_programados" NO repite el permiso de quien programó el recordatorio:
// eso ya lo hizo la RLS de `cobros_recordatorios_programados` en el momento de
// guardarlo (WITH CHECK bajo_mi_coordinacion), así que para cuando esta acción
// lo procesa, ya está autorizado. Manda con la service role, igual que "tanda".
//
// UN CORREO POR ALUMNO, NO UNO POR COBRO: a nadie le sirve recibir tres correos
// el mismo día. Se manda el estado de cuenta completo, con el tono del aviso más
// urgente que tenga.

import { createClient } from "npm:@supabase/supabase-js@2";
import { avisoHtml, type Tipo, ASUNTOS } from "./aviso-html.ts";
import { esCorreoInterno } from "./usuario-alumno.ts";
import { contactoDeConsultas } from "./contacto-academia.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";
const DE = Deno.env.get("RESEND_FROM_COBROS") || "Ajedrez Integral <informes@ajedrez-integral.com>";
const MAX_POR_TANDA = 300;

// Cuándo avisa cada tipo, contado en días respecto del vencimiento.
const DIAS_ANTES_DE_VENCER = 3;
const DIAS_PARA_MOROSO = 15;

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

type Cobro = {
  id: string; student_id: string; consecutivo: string; concepto: string;
  monto: number; pagado: number; saldo: number; moneda: string;
  vence: string; situacion: string; dias_atraso: number;
};

// Qué aviso le toca a un cobro, o null si todavía no le toca ninguno.
function tipoDe(c: Cobro, hoy: Date): Tipo | null {
  if (Number(c.saldo) <= 0) return null;
  if (c.dias_atraso >= DIAS_PARA_MOROSO) return "moroso";
  if (c.dias_atraso >= 1) return "vencido";
  const faltan = Math.ceil((new Date(c.vence + "T00:00:00Z").getTime() - hoy.getTime()) / 86400000);
  if (faltan >= 0 && faltan <= DIAS_ANTES_DE_VENCER) return "proximo";
  return null;
}

const URGENCIA: Record<Tipo, number> = { proximo: 1, vencido: 2, moroso: 3 };

// A qué correos se le avisa por un alumno.
//
// 1. EL QUE SE FIJÓ A MANO MANDA SOBRE TODO, y es el único: quien coordina lo
//    puso justamente porque los otros no servían —una letra mal escrita en el
//    correo de la mamá, un papá que es quien paga pero no recibe el informe—.
//    Si se sumara a los demás, corregir un correo equivocado seguiría
//    mandándole el aviso al equivocado.
// 2. Si no hay, sus encargados activos.
// 3. Y SOLO SI no tiene ninguno, su propia cuenta (si el correo es de verdad y
//    no un usuario interno). Antes se avisaba siempre a los dos: quien paga es
//    la persona encargada cuando la hay, y el alumno terminaba recibiendo el
//    estado de cuenta de su familia aunque no le tocara a él resolverlo.
async function destinatariosDe(studentId: string) {
  const { data: aMano } = await admin
    .from("cobros_contacto").select("nombre, email").eq("student_id", studentId).maybeSingle();
  if (aMano?.email) {
    return [{ nombre: (aMano.nombre as string) || "", email: String(aMano.email).toLowerCase() }];
  }

  const { data: encargados } = await admin
    .from("encargados").select("nombre, email").eq("student_id", studentId).eq("activo", true);
  const lista = (encargados ?? []).map((e) => ({ nombre: e.nombre as string, email: String(e.email).toLowerCase() }));
  if (lista.length) return lista;

  const { data: perfil } = await admin
    .from("profiles").select("full_name, email").eq("id", studentId).maybeSingle();
  if (perfil?.email && !esCorreoInterno(perfil.email as string)) {
    lista.push({ nombre: (perfil.full_name as string) || "", email: String(perfil.email).toLowerCase() });
  }
  return lista;
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

// Los cobros con saldo de un alumno (o de todos), ya ordenados.
async function cobrosPendientes(cliente = admin, studentId?: string) {
  let q = cliente.from("cobros_vista")
    .select("id, student_id, consecutivo, concepto, monto, pagado, saldo, moneda, vence, situacion, dias_atraso")
    .in("situacion", ["pendiente", "vencido"])
    .order("vence", { ascending: true })
    .limit(2000);
  if (studentId) q = q.eq("student_id", studentId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Cobro[];
}

async function nombreDe(studentId: string, cliente = admin) {
  const { data } = await cliente.from("profiles").select("full_name, email").eq("id", studentId).maybeSingle();
  return (data?.full_name as string) || (data?.email as string) || "el alumno";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Cuerpo JSON inválido" }, 400); }

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const accion = body.action;

  // El número al que se le pide a la familia que mande el comprobante sale de
  // `ajustes_academia`, no de una constante: lo pone quien coordina.
  const contacto = await contactoDeConsultas(admin);

  // -------------------------------------------------------------- la tanda
  if (accion === "tanda") {
    const { data: esperado } = await admin.rpc("secreto_tanda_cobros");
    if (!esperado || !jwt || jwt !== esperado) {
      return json({ error: "Esta acción solo la dispara el programador de tareas" }, 401);
    }
    const hoy = new Date();
    let cobros: Cobro[];
    try { cobros = await cobrosPendientes(); }
    catch (err) { return json({ error: err instanceof Error ? err.message : String(err) }, 500); }

    // Se agrupa por alumno y se queda con el aviso más urgente que tenga.
    const porAlumno = new Map<string, { tipo: Tipo; disparador: Cobro; cobros: Cobro[] }>();
    for (const c of cobros) {
      const t = tipoDe(c, hoy);
      const g = porAlumno.get(c.student_id) ?? { tipo: null as unknown as Tipo, disparador: c, cobros: [] };
      g.cobros.push(c);
      if (t && (!g.tipo || URGENCIA[t] > URGENCIA[g.tipo])) { g.tipo = t; g.disparador = c; }
      porAlumno.set(c.student_id, g);
    }

    let mandados = 0, saltados = 0;
    const fallos: string[] = [];
    let hechos = 0;
    for (const [studentId, g] of porAlumno) {
      if (!g.tipo) { saltados += 1; continue; }
      if (hechos >= MAX_POR_TANDA) break;
      const nombre = await nombreDe(studentId);
      const destinos = await destinatariosDe(studentId);
      for (const d of destinos) {
        if (hechos >= MAX_POR_TANDA) break;
        // ¿Ya se le mandó este aviso por este cobro? El índice único de
        // avisos_cobro es lo que de verdad lo impide; esto solo evita el envío.
        const { data: yaFue } = await admin.from("avisos_cobro").select("id")
          .eq("cobro_id", g.disparador.id).eq("tipo", g.tipo).eq("correo", d.email).maybeSingle();
        if (yaFue) { saltados += 1; continue; }

        const html = avisoHtml({ tipo: g.tipo, alumno: nombre, destinatario: d.nombre, cobros: g.cobros, sitio: SITE_URL, contacto });
        const r = await mandar(d.email, ASUNTOS[g.tipo](nombre), html);
        hechos += 1;
        if (!r.ok) { fallos.push(`${d.email}: ${r.error}`); continue; }
        // Se apunta DESPUÉS de que Resend lo aceptó: si falla, mañana se
        // reintenta en vez de darlo por mandado.
        await admin.from("avisos_cobro").insert({ cobro_id: g.disparador.id, tipo: g.tipo, correo: d.email });
        mandados += 1;
      }
    }
    return json({ ok: true, mandados, saltados, fallos });
  }

  // ------------------------------------------- los recordatorios programados
  // Es "recordar_ahora", pero para más tarde en vez de en el momento: por eso
  // cada uno lleva SU propio tipo (calculado de los cobros pendientes de ESE
  // alumno a ESTA hora, no al programarlo) y respeta `correos` si quien lo
  // programó eligió a mano a quién avisarle.
  if (accion === "tanda_programados") {
    const { data: esperado } = await admin.rpc("secreto_tanda_cobros");
    if (!esperado || !jwt || jwt !== esperado) {
      return json({ error: "Esta acción solo la dispara el programador de tareas" }, 401);
    }

    const { data: pendientes, error: errP } = await admin
      .from("cobros_recordatorios_programados")
      .select("id, student_id, correos")
      .eq("estado", "pendiente")
      .lte("programado_para", new Date().toISOString())
      .order("programado_para", { ascending: true })
      .limit(MAX_POR_TANDA);
    if (errP) return json({ error: errP.message }, 500);

    const hoy = new Date();
    let mandados = 0, sinNada = 0;
    const fallos: string[] = [];

    for (const rec of pendientes ?? []) {
      const marcar = (nota: string) => admin.from("cobros_recordatorios_programados")
        .update({ estado: "enviado", enviado_at: new Date().toISOString(), nota }).eq("id", rec.id);

      let cobrosDelAlumno: Cobro[];
      try { cobrosDelAlumno = await cobrosPendientes(admin, rec.student_id as string); }
      catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        fallos.push(`${rec.id}: ${msg}`);
        await marcar(`No se pudo mandar: ${msg}`);
        continue;
      }

      // Puede que para cuando le toca ya no haya nada pendiente (se pagó
      // antes, o se anuló): no es un fallo, es que ya no hacía falta.
      const tipos = cobrosDelAlumno.map((c) => tipoDe(c, hoy)).filter((t): t is Tipo => t !== null);
      if (!tipos.length) {
        await marcar("No se mandó nada: ese alumno ya no tenía ningún cobro pendiente a esta hora.");
        sinNada += 1;
        continue;
      }
      let tipo: Tipo = tipos[0];
      for (const t of tipos) if (URGENCIA[t] > URGENCIA[tipo]) tipo = t;
      const disparador = cobrosDelAlumno.find((c) => tipoDe(c, hoy) === tipo) ?? cobrosDelAlumno[0];

      // `correos` es lo que eligió a mano quien lo programó; sin eso, los
      // mismos destinos de siempre (el fijado a mano, si hay; si no sus
      // encargados; si no, su propia cuenta).
      const correosAMano = Array.isArray(rec.correos) ? (rec.correos as string[]).filter(Boolean) : [];
      const destinos = correosAMano.length
        ? correosAMano.map((email) => ({ nombre: "", email: String(email).toLowerCase() }))
        : await destinatariosDe(rec.student_id as string);
      if (!destinos.length) {
        await marcar("No se mandó nada: ese alumno no tiene ningún correo al que avisarle.");
        sinNada += 1;
        continue;
      }

      const nombre = await nombreDe(rec.student_id as string);
      const enviadosA: string[] = [];
      for (const d of destinos) {
        const html = avisoHtml({ tipo, alumno: nombre, destinatario: d.nombre, cobros: cobrosDelAlumno, sitio: SITE_URL, contacto });
        const r = await mandar(d.email, ASUNTOS[tipo](nombre), html);
        if (!r.ok) { fallos.push(`${rec.id} -> ${d.email}: ${r.error}`); continue; }
        // upsert a mano: si ya había un aviso de este tipo (por la tanda diaria
        // o por «Recordar ahora»), no se manda dos veces el mismo día por dos
        // caminos distintos.
        await admin.from("avisos_cobro")
          .upsert({ cobro_id: disparador.id, tipo, correo: d.email }, { onConflict: "cobro_id,tipo,correo" });
        enviadosA.push(d.email);
      }

      if (enviadosA.length) {
        await marcar(`Mandado a: ${enviadosA.join(", ")}`);
        mandados += 1;
      } else {
        await marcar(`No se pudo mandar: ${fallos[fallos.length - 1] || "error desconocido"}`);
      }
    }
    return json({ ok: true, mandados, sinNada, fallos });
  }

  // --------------------------------------------- lo que pide una persona
  if (!jwt) return json({ error: "Falta token de autorización" }, 401);
  // Este cliente lleva el JWT de quien llama: TODO lo que lea pasa por la RLS.
  const comoQuienLlama = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userError } = await comoQuienLlama.auth.getUser(jwt);
  if (userError || !userData?.user) return json({ error: "Token inválido" }, 401);

  const studentId = typeof body.student_id === "string" ? body.student_id : "";
  if (!studentId) return json({ error: "student_id es requerido" }, 400);

  let cobros: Cobro[];
  try { cobros = await cobrosPendientes(comoQuienLlama, studentId); }
  catch { return json({ error: "No se pudieron leer los cobros de ese alumno" }, 403); }
  if (!cobros.length) return json({ error: "Ese alumno no tiene nada pendiente" }, 400);

  const hoy = new Date();
  let tipo: Tipo = "proximo";
  for (const c of cobros) {
    const t = tipoDe(c, hoy);
    if (t && URGENCIA[t] > URGENCIA[tipo]) tipo = t;
  }
  const nombre = await nombreDe(studentId, comoQuienLlama);

  if (accion === "vista_previa") {
    // A dónde SALDRÍA, para que quien lo está por mandar lo vea antes y no
    // después: es el mismo dato que hace falta para corregirlo si está mal.
    const destinos = await destinatariosDe(studentId);
    return json({
      ok: true, alumno: nombre,
      correos: destinos.map((d) => d.email),
      html: avisoHtml({ tipo, alumno: nombre, destinatario: "", cobros, sitio: SITE_URL, contacto }),
    });
  }

  if (accion === "recordar_ahora") {
    const destinos = await destinatariosDe(studentId);
    if (!destinos.length) return json({ error: "Ese alumno no tiene ningún correo al que avisarle" }, 400);
    const disparador = cobros.find((c) => tipoDe(c, hoy) === tipo) ?? cobros[0];
    let mandados = 0;
    const fallos: string[] = [];
    for (const d of destinos) {
      const html = avisoHtml({ tipo, alumno: nombre, destinatario: d.nombre, cobros, sitio: SITE_URL, contacto });
      const r = await mandar(d.email, ASUNTOS[tipo](nombre), html);
      if (!r.ok) { fallos.push(`${d.email}: ${r.error}`); continue; }
      // upsert a mano: si ya había un aviso de este tipo, no se duplica la fila.
      await admin.from("avisos_cobro")
        .upsert({ cobro_id: disparador.id, tipo, correo: d.email }, { onConflict: "cobro_id,tipo,correo" });
      mandados += 1;
    }
    if (!mandados) return json({ error: fallos.join(" | ") || "No se pudo mandar" }, 502);
    return json({ ok: true, mandados, correos: destinos.map((d) => d.email), fallos });
  }

  return json({ error: "Acción desconocida" }, 400);
});
