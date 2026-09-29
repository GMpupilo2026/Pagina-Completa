// Edge Function: avisar-diagnostico
//
// Le avisa por correo a un supervisor que alguien sin cuenta hizo el
// diagnóstico de nivel por SU enlace (entreno/diagnostico.html?s=<código>).
// Ver «El enlace del diagnóstico de cada supervisor» en
// docs/decisiones/informes.md.
//
// QUIÉN LA LLAMA. Solo la base: el trigger diagnosticos_publicos_avisa (AFTER
// INSERT, cuando el diagnóstico trae supervisor) la llama con pg_net. Va con
// verify_jwt en FALSE porque un trigger no trae sesión de persona; a cambio
// exige el secreto `aviso_diagnostico_secreto` de la bóveda, que vuelve a leer
// con la service role para compararlo. Igual que `notificar`.
//
// QUÉ RECIBE. Solo `{ id }` del diagnóstico. A quién se le escribe y qué dice
// el correo salen de la fila, leída con la service role: quien llama no puede
// elegir destinatario ni texto.
//
// UNA VEZ POR DIAGNÓSTICO. Antes de mandar se «toma» la fila poniendo
// `aviso_enviado_at` solo si estaba vacía; si el envío falla se vuelve a
// vaciar. Así dos llamadas seguidas no mandan dos correos, y un reintento
// después de un fallo sí manda.
//
// El nombre, el correo y el teléfono los escribió el visitante: son texto
// ajeno y van escapados. El correo del visitante va en `reply_to`, así el
// supervisor le contesta con «Responder».

import { createClient } from "npm:@supabase/supabase-js@2";
import { esCorreoInterno } from "./usuario-alumno.ts";
import { cabeceraCorreo, firmaDe, type Marca } from "./marca-correo.ts";
import { cuerpoAviso, type Diagnostico } from "./aviso-html.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DE = "Ajedrez Integral <informes@ajedrez-integral.com>";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

// Un asunto no lleva saltos de línea ni se hace eterno.
const enUnaLinea = (s: unknown, max: number) => String(s ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);

const CORREO = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

/* La marca del supervisor: la de su academia si tiene exactamente una (la
   misma regla que el nombre que ve el visitante); si no, la de siempre. */
async function marcaDelSupervisor(supervisorId: string): Promise<Marca | null> {
  try {
    const { data } = await admin.from("academias").select("nombre, color, logo_path").eq("supervisor_id", supervisorId);
    if (!data || data.length !== 1) return null;
    const a = data[0] as { nombre: string; color: string | null; logo_path: string | null };
    const logoUrl = a.logo_path
      ? `${SUPABASE_URL}/storage/v1/object/public/academia-marca/${String(a.logo_path).split("/").map(encodeURIComponent).join("/")}`
      : null;
    return { nombre: a.nombre, color: a.color ?? null, logoUrl };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: esperado } = await admin.rpc("secreto_aviso_diagnostico");
  if (!esperado || !jwt || jwt !== esperado) {
    return json({ error: "Este aviso solo lo dispara la base" }, 401);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Cuerpo JSON inválido" }, 400); }
  const id = typeof body.id === "string" ? body.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Falta el id del diagnóstico" }, 400);

  // Tomar la fila: solo si todavía no se avisó.
  const { data: tomadas, error: errTomar } = await admin.from("diagnosticos_publicos")
    .update({ aviso_enviado_at: new Date().toISOString() })
    .eq("id", id).is("aviso_enviado_at", null).not("supervisor_id", "is", null)
    .select("id, created_at, nombre, email, telefono, elo, porcentaje, nivel, supervisor_id");
  if (errTomar) return json({ error: errTomar.message }, 500);
  const d = (tomadas ?? [])[0] as Diagnostico | undefined;
  if (!d || !d.supervisor_id) return json({ ok: true, omitido: "ya avisado o sin supervisor" });

  const soltar = () => admin.from("diagnosticos_publicos").update({ aviso_enviado_at: null }).eq("id", id);

  const { data: sup } = await admin.from("profiles").select("email, full_name").eq("id", d.supervisor_id).maybeSingle();
  const para = (sup?.email ?? "").trim();
  if (!para || esCorreoInterno(para) || !CORREO.test(para)) {
    return json({ ok: true, omitido: "el supervisor no tiene un correo al que escribir" });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { await soltar(); return json({ error: "Falta configurar RESEND_API_KEY" }, 500); }

  const marca = await marcaDelSupervisor(d.supervisor_id);
  const nombreSup = (sup?.full_name ?? "").trim().split(/\s+/)[0] || "";
  const visitanteCorreo = d.email && CORREO.test(d.email.trim()) ? d.email.trim() : null;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: DE,
      to: [para],
      subject: `Nuevo diagnóstico de nivel: ${enUnaLinea(d.nombre, 80)} · ${firmaDe(marca)}`,
      html: cuerpoAviso(d, nombreSup, cabeceraCorreo(marca, "Nuevo diagnóstico por tu enlace")),
      ...(visitanteCorreo ? { reply_to: [visitanteCorreo] } : {}),
    }),
  });
  if (!res.ok) {
    await soltar();
    return json({ error: `Resend contestó ${res.status}: ${(await res.text()).slice(0, 200)}` }, 502);
  }
  return json({ ok: true, enviado: true });
});
