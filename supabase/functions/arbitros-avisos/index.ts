// Edge Function: arbitros-avisos
//
// Le escribe a cada árbitro de Costa Rica lo que se le vence en los próximos
// 90 días: una norma de FIDE que deja de contar, el seminario que deja de
// valer o su actividad en la Federación (art. 19). Ver «El aviso por correo
// de lo que se vence» en docs/decisiones/juegos-y-torneos.md.
//
// QUIÉN LA LLAMA. Solo la base: public.disparar_avisos_arbitros(), que corre
// el día 1 de cada mes con pg_cron (avisos-arbitros). Va con verify_jwt en
// FALSE porque la base no trae sesión de persona; a cambio exige el secreto
// `tanda_arbitros_secreto` de la bóveda, que vuelve a leer con la service role
// para compararlo, igual que alerta-base.
//
// A QUIÉN. A quien tiene correo en arbitros_cr_contacto con avisos encendidos,
// leído con la service role por public.arbitros_cr_por_vencer(). Quien llama no
// elige destinatario. Cada cosa se avisa UNA vez: lo enviado queda en
// arbitros_cr_avisos_enviados y no vuelve a salir.

import { createClient } from "npm:@supabase/supabase-js@2";
import { cabeceraCorreo } from "./marca-correo.ts";
import { asunto, cuerpoAvisos, type Aviso } from "./avisos-html.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DE = "Ajedrez Integral <informes@ajedrez-integral.com>";
const RESPONDER_A = "info@ajedrez-integral.com";
const DIAS = 90;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

const CORREO = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

type Fila = { fide_id: number; nombre: string; correo: string | null; avisos: boolean; clave: string; que: string; vence: string; avisado: string | null };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: esperado } = await admin.rpc("secreto_tanda_arbitros");
  if (!esperado || !jwt || jwt !== esperado) {
    return json({ error: "Estos avisos solo los dispara la base" }, 401);
  }

  const { data, error } = await admin.rpc("arbitros_cr_por_vencer", { p_dias: DIAS });
  if (error) return json({ error: error.message }, 500);
  // Lo que todavía no se avisó, de quien tiene correo y quiere los avisos.
  const porArbitro = new Map<number, { nombre: string; correo: string; filas: Fila[] }>();
  for (const f of (data ?? []) as Fila[]) {
    const correo = (f.correo ?? "").trim();
    if (!f.avisos || f.avisado || !CORREO.test(correo)) continue;
    const a = porArbitro.get(f.fide_id) ?? { nombre: f.nombre, correo, filas: [] };
    a.filas.push(f);
    porArbitro.set(f.fide_id, a);
  }
  if (!porArbitro.size) return json({ ok: true, enviados: 0 });

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ error: "Falta configurar RESEND_API_KEY" }, 500);

  let enviados = 0;
  const fallidos: number[] = [];
  for (const [fideId, a] of porArbitro) {
    const avisos: Aviso[] = a.filas.map((f) => ({ que: f.que, vence: f.vence }));
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: DE,
        to: [a.correo],
        reply_to: RESPONDER_A,
        subject: asunto(avisos),
        html: cuerpoAvisos(a.nombre, avisos, cabeceraCorreo(null, "Lo que se te vence como árbitro")),
      }),
    });
    if (!res.ok) { fallidos.push(fideId); continue; }
    // Lo avisado no vuelve a salir.
    const { error: e } = await admin.from("arbitros_cr_avisos_enviados")
      .upsert(a.filas.map((f) => ({ fide_id: fideId, clave: f.clave, vence: f.vence })), { onConflict: "fide_id,clave", ignoreDuplicates: true });
    if (e) fallidos.push(fideId); else enviados++;
  }
  return json({ ok: fallidos.length === 0, enviados, fallidos });
});
