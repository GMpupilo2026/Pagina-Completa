// Edge Function: alerta-base
//
// Le avisa por correo a quien administra que la base de datos se está
// quedando sin aire. El 29/9, en la hora pico de clases, la base (plan
// gratuito) cortó consultas por statement timeout y tres grupos no pudieron
// dar clase; nos enteramos cuando ya no entraba nadie. Ver «El aviso de base
// saturada» en docs/decisiones/sitio-e-infraestructura.md.
//
// QUIÉN LA LLAMA. Solo la base: public.vigilar_base(), que corre cada cinco
// minutos con pg_cron y la llama con pg_net cuando ve una señal (una consulta
// de prueba lenta, consultas de la web de más de 3 s, o tareas programadas que
// no arrancaron), como mucho una vez cada dos horas. Va con verify_jwt en
// FALSE porque la base no trae sesión de persona; a cambio exige el secreto
// `alerta_base_secreto` de la bóveda, que vuelve a leer con la service role
// para compararlo. Igual que avisar-diagnostico.
//
// A QUIÉN. A cada cuenta con is_admin, leída con la service role. Quien llama
// no elige destinatario: el cuerpo solo trae los números medidos.

import { createClient } from "npm:@supabase/supabase-js@2";
import { cabeceraCorreo } from "./marca-correo.ts";
import { cuerpoAlerta, type Pulso } from "./alerta-html.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DE = "Ajedrez Integral <informes@ajedrez-integral.com>";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

const CORREO = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: esperado } = await admin.rpc("secreto_alerta_base");
  if (!esperado || !jwt || jwt !== esperado) {
    return json({ error: "Este aviso solo lo dispara la base" }, 401);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Cuerpo JSON inválido" }, 400); }
  const pulso: Pulso = {
    pulso_ms: numero(body.pulso_ms),
    lentas: numero(body.lentas),
    cron_fallidos: numero(body.cron_fallidos),
    medido_at: typeof body.medido_at === "string" ? body.medido_at : new Date().toISOString(),
  };

  const { data: admins, error } = await admin.from("profiles").select("email").eq("is_admin", true);
  if (error) return json({ error: error.message }, 500);
  const para = [...new Set((admins ?? []).map((a: { email: string | null }) => (a.email ?? "").trim()).filter((e) => CORREO.test(e)))];
  if (!para.length) return json({ ok: true, omitido: "no hay a quién escribir" });

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ error: "Falta configurar RESEND_API_KEY" }, 500);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: DE,
      to: para,
      subject: "⚠️ La plataforma está lenta: la base de datos está al límite",
      html: cuerpoAlerta(pulso, cabeceraCorreo(null, "La base de datos está al límite")),
    }),
  });
  if (!res.ok) return json({ error: `Resend contestó ${res.status}: ${(await res.text()).slice(0, 200)}` }, 502);
  return json({ ok: true, enviado: para.length });
});
