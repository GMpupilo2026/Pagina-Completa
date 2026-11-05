// Edge Function: metropolitano-correo
//
// El correo de confirmación de cada inscripción al Metropolitano 2026: al
// correo del envío (la persona sola o el delegado, con toda la delegación) y,
// aparte, a cada integrante que dejó un correo suyo. Qué dice y a quién lo
// arma correo.ts. Ver «Los correos de confirmación» en
// docs/decisiones/cuentas-y-formularios.md.
//
// QUIÉN LA LLAMA (verify_jwt en false)
// - La base, apenas se guarda una inscripción (el trigger
//   metropolitano_correo_avisa, por pg_net, que sale cuando la transacción
//   termina bien) y cada 10 minutos para reintentar (pg_cron
//   metropolitano-correo). No trae sesión de persona: trae en `x-aviso` el
//   secreto `metropolitano_correo_aviso` de la bóveda y con él solo puede
//   «enviar» lo pendiente.
// - Quien administra, con su sesión (aal2 e is_admin), para «reenviar» el
//   correo de una inscripción (y de su delegación) desde la lista de inscritos.
//
// LO PENDIENTE
// Una inscripción activa sin `confirmacion_en`, con menos de 3 intentos. Antes
// de mandar, la función la «toma» (confirmacion_tomado, en un solo update): si
// otra llamada corre a la vez, ya no la ve, y nadie recibe el correo dos veces.
// Una tomada hace más de 5 minutos (la llamada se cayó) se puede volver a tomar. Si el
// correo del envío sale, se marca toda la delegación; si no, se anota el error
// y el intento, y se reintenta en la vuelta siguiente. Lo que Resend descarta
// (una dirección que rebotó antes) se pregunta con envioFallido y cuenta como
// error, con su motivo.
//
// LOS AVISOS (en la misma vuelta)
// Después de las confirmaciones, la base le da lo pendiente con
// metropolitano_avisos_tomar(): los pagos que administración verificó o
// rechazó (un correo por estado, a quien mandó el envío, con el motivo y el
// enlace para subir otro comprobante) y los enlaces para corregir pedidos
// otra vez con el código y el correo. El enlace secreto lo lee de
// metropolitano_enlaces, que nadie más lee. Ver «Los correos del pago».

import { createClient } from "npm:@supabase/supabase-js@2";
import { envioFallido, motivoNoLlego } from "./envio-resend.ts";
import { CONTACTO, correoEnlace, correoPago, correosDeEnvio, porEnvio, type Correo, type Fila } from "./correo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DE = "Metropolitano 2026 <informes@ajedrez-integral.com>";
const MAX_INTENTOS = 3;
const POR_VUELTA = 15;   // cada correo espera unos segundos a saber si Resend lo descartó

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function sesionAMedias(factores: { status: string }[] | undefined, jwt: string): boolean {
  if (!(factores ?? []).some((f) => f.status === "verified")) return false;
  try {
    const b = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b + "=".repeat((4 - (b.length % 4)) % 4))).aal !== "aal2";
  } catch {
    return true;
  }
}
function mismoSecreto(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const COLUMNAS = "id, numero, grupo, delegacion, es_delegado, rol, sexo, nombre, apellidos, correo, fide_id, nombre_fide, titulo, torneos, monto_usd, iva_usd, pago_estado, pago_metodo, hospedaje, hospedaje_desde, hospedaje_hasta, acepta_hospedaje, parqueo, placa, comidas, viaje, confirmacion_intentos, nota_organizacion, pago_aviso_intentos";

// Manda un correo; null si salió, o por qué no.
async function mandar(apiKey: string, c: Correo): Promise<string | null> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: DE, to: [c.para], reply_to: CONTACTO, subject: c.asunto, html: c.html, text: c.texto }),
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) return "Resend no lo aceptó (" + res.status + "): " + String(r?.message ?? "").slice(0, 160);
    const fallo = await envioFallido(apiKey, r?.id);
    return fallo ? motivoNoLlego(fallo, c.para) : null;
  } catch (e) {
    return "No se pudo conectar con el servicio de correo: " + String((e as Error)?.message ?? e).slice(0, 120);
  }
}

// El enlace secreto para corregir el envío (en la fila de quien lo mandó).
async function tokenDe(admin: ReturnType<typeof createClient>, filas: Fila[]) {
  const ids = filas.map((x) => x.id);
  const { data } = await admin.from("metropolitano_enlaces").select("token").in("inscripcion", ids).limit(1);
  return (data && data[0] && data[0].token) || null;
}

// Las filas de un envío, a partir de la de quien lo mandó.
async function filasDelEnvio(admin: ReturnType<typeof createClient>, id: string) {
  const { data: una } = await admin.from("metropolitano_inscripciones").select(COLUMNAS).eq("id", id).maybeSingle();
  if (!una) return [];
  if (!una.grupo) return [una as Fila];
  const { data } = await admin.from("metropolitano_inscripciones").select(COLUMNAS).eq("grupo", una.grupo).eq("estado", "activa").order("numero");
  return (data ?? [una]) as Fila[];
}

// Los avisos pendientes: los del pago y los enlaces pedidos otra vez.
async function mandarAvisos(admin: ReturnType<typeof createClient>, apiKey: string) {
  const { data: pend, error } = await admin.rpc("metropolitano_avisos_tomar");
  if (error || !pend) return { pagos: 0, enlaces: 0, errores: 0 };
  let pagos = 0, enlaces = 0, errores = 0;
  for (const a of (pend.pagos ?? []) as { id: string; estado: "verificado" | "rechazado" }[]) {
    const filas = await filasDelEnvio(admin, a.id);
    const nota = (filas.find((x) => x.pago_estado === "rechazado") as Fila & { nota_organizacion?: string | null })?.nota_organizacion ?? null;
    const c = filas.length ? correoPago(filas, a.estado, nota, await tokenDe(admin, filas)) : null;
    const err = c ? await mandar(apiKey, c) : "Sin un correo válido al que escribir.";
    const fila = filas.find((x) => x.id === a.id);
    if (err) {
      errores++;
      await admin.from("metropolitano_inscripciones").update({ pago_aviso_error: err, pago_aviso_intentos: (Number((fila as { pago_aviso_intentos?: number })?.pago_aviso_intentos) || 0) + 1, pago_aviso_tomado: null }).eq("id", a.id);
    } else {
      pagos++;
      await admin.from("metropolitano_inscripciones").update({ pago_aviso_estado: a.estado, pago_aviso_en: new Date().toISOString(), pago_aviso_error: null, pago_aviso_tomado: null }).eq("id", a.id);
    }
  }
  for (const id of (pend.enlaces ?? []) as string[]) {
    const filas = await filasDelEnvio(admin, id);
    const token = filas.length ? await tokenDe(admin, filas) : null;
    const c = token ? correoEnlace(filas, token) : null;
    const err = c ? await mandar(apiKey, c) : "Sin enlace o sin correo.";
    if (err) errores++; else enlaces++;
    // Se marca enviado también si falló: no se reintenta solo (se puede volver a pedir).
    await admin.from("metropolitano_inscripciones").update({ enlace_enviado_en: new Date().toISOString(), enlace_error: err, enlace_tomado: null }).eq("id", id);
  }
  return { pagos, enlaces, errores };
}

// Manda los correos de un envío; true si salió el principal (el primero).
async function mandarEnvio(admin: ReturnType<typeof createClient>, apiKey: string, filas: Fila[]) {
  const correos = correosDeEnvio(filas, await tokenDe(admin, filas));
  const todos = filas.map((x) => x.id);
  if (!correos.length) {
    await admin.from("metropolitano_inscripciones").update({ confirmacion_en: new Date().toISOString(), confirmacion_error: "Sin un correo válido al que escribir." }).in("id", todos);
    return false;
  }
  let principalOk = false;
  for (let i = 0; i < correos.length; i++) {
    const c = correos[i];
    const error = await mandar(apiKey, c);
    if (i === 0) {
      principalOk = !error;
      if (error) {
        const intentos = Math.max(...filas.map((x) => Number(x.confirmacion_intentos) || 0)) + 1;
        await admin.from("metropolitano_inscripciones").update({ confirmacion_error: error, confirmacion_intentos: intentos }).in("id", todos);
        return false;
      }
      await admin.from("metropolitano_inscripciones").update({ confirmacion_en: new Date().toISOString(), confirmacion_error: null }).in("id", todos);
    } else if (error) {
      // El correo propio de un integrante: el del envío ya salió; se anota y no se reintenta.
      await admin.from("metropolitano_inscripciones").update({ confirmacion_error: "Su correo propio: " + error }).in("id", c.ids);
    }
  }
  return principalOk;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: "Cuerpo JSON inválido" }, 400); }
  const accion = String(body.accion ?? "");
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!apiKey) return json({ error: "Falta configurar RESEND_API_KEY" }, 500);

  const aviso = req.headers.get("x-aviso") ?? "";
  const { data: guardado } = await admin.rpc("metropolitano_correo_aviso");
  const esLaBase = !!aviso && mismoSecreto(aviso, String(guardado ?? ""));
  if (!esLaBase) {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Falta la sesión." }, 401);
    const { data: usuario, error } = await admin.auth.getUser(jwt);
    if (error || !usuario?.user) return json({ error: "La sesión no es válida." }, 401);
    if (sesionAMedias(usuario.user.factors, jwt)) return json({ error: "Falta el segundo paso de la verificación: vuelve a entrar y escribe el código de tu app." }, 401);
    const { data: perfil } = await admin.from("profiles").select("is_admin").eq("id", usuario.user.id).maybeSingle();
    if (!perfil?.is_admin) return json({ error: "Solo quien administra reenvía los correos de confirmación." }, 403);
    if (accion !== "reenviar") return json({ error: "Acción desconocida." }, 400);
    const id = String(body.id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "Falta la inscripción." }, 400);
    const { data: una } = await admin.from("metropolitano_inscripciones").select(COLUMNAS).eq("id", id).maybeSingle();
    if (!una) return json({ error: "Esa inscripción no existe." }, 404);
    const { data: filas } = una.grupo
      ? await admin.from("metropolitano_inscripciones").select(COLUMNAS).eq("grupo", una.grupo).eq("estado", "activa").order("numero")
      : { data: [una] };
    const ok = await mandarEnvio(admin, apiKey, (filas ?? [una]) as Fila[]);
    if (!ok) {
      const { data: x } = await admin.from("metropolitano_inscripciones").select("confirmacion_error").eq("id", id).maybeSingle();
      return json({ ok: false, error: x?.confirmacion_error || "No se pudo mandar." }, 502);
    }
    return json({ ok: true, para: correosDeEnvio((filas ?? [una]) as Fila[]).map((c) => c.para) });
  }

  if (accion !== "enviar") return json({ error: "La base solo puede mandar lo pendiente." }, 403);
  // Tomar lo pendiente en un solo update: dos llamadas a la vez no se reparten la misma fila.
  const ahora = new Date();
  const { data: tomadas, error } = await admin.from("metropolitano_inscripciones")
    .update({ confirmacion_tomado: ahora.toISOString() })
    .is("confirmacion_en", null).eq("estado", "activa").lt("confirmacion_intentos", MAX_INTENTOS)
    .or("confirmacion_tomado.is.null,confirmacion_tomado.lt." + new Date(ahora.getTime() - 5 * 60000).toISOString())
    .select(COLUMNAS);
  if (error) return json({ error: "No se pudieron leer las inscripciones." }, 500);
  const envios = porEnvio(((tomadas ?? []) as Fila[]).sort((a, b) => a.numero - b.numero)).slice(0, POR_VUELTA);
  let enviados = 0, errores = 0;
  for (const filas of envios) {
    if (await mandarEnvio(admin, apiKey, filas)) enviados++; else errores++;
  }
  const avisos = await mandarAvisos(admin, apiKey);
  return json({ ok: true, enviados, errores, avisos });
});
