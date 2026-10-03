// Edge Function: recuperar-acceso
//
// "¿Olvidaste tu contraseña?" de cualquier cuenta, sin sesión. Nació para el
// alumno que no tiene buzón propio (abajo), y atiende también los correos de
// verdad (ver «AHORA TAMBIÉN ATIENDE LOS CORREOS DE VERDAD»).
//
// POR QUÉ NO ALCANZA CON EL DE SIEMPRE
// `sb.auth.resetPasswordForEmail(correo)` manda el enlace a la dirección de la
// cuenta. Para un alumno con usuario de la academia esa dirección no existe: el
// correo sale, no llega a ninguna parte y la página igual dice "si esa cuenta
// existe, ya salió el correo". El niño se queda fuera para siempre y nadie se
// entera — es exactamente el fallo callado que este cambio vino a evitar, y
// dejarlo abierto habría sido cambiar un agujero por otro.
//
// Acá el enlace se genera con la service role y se manda a donde de verdad se
// le puede escribir a esa familia, que lo dice `public.correo_de_contacto()`:
// la misma regla que usan los informes a la casa y los avisos de cobro, escrita
// una sola vez.
//
// POR QUÉ ES PÚBLICA, Y QUÉ NO CUENTA
// `verify_jwt` va en false porque quien olvidó su contraseña, por definición,
// no tiene sesión. A cambio no dice NUNCA si la cuenta existe: contesta lo
// mismo en los dos casos, igual que la pantalla de siempre. Decir "ese usuario
// no está registrado" le contaría a cualquiera quién tiene cuenta acá — y son
// menores de edad.
//
// AHORA TAMBIÉN ATIENDE LOS CORREOS DE VERDAD
// Antes un correo de verdad iba por `resetPasswordForEmail`, con la plantilla
// de Supabase: en inglés, el mismo asunto siempre («Reset your password») y un
// enlace a supabase.co. El 3 de octubre una familia pidió once enlaces en una
// hora y no le sirvió ninguno: Gmail juntaba los correos iguales en una sola
// conversación, abría uno viejo —cada enlace nuevo anula el anterior—, la
// página le decía «no sirve» y pedía otro. Los registros lo dejaron claro: el
// token del último correo seguía sin usar en la base. Por acá sale en español,
// con la hora en el asunto y un enlace al sitio (ver recuperacion-email.ts).
//
// UN ENLACE POR MINUTO Y POR CUENTA
// `resetPasswordForEmail` traía ese freno de Supabase; `generateLink` no trae
// ninguno, así que va acá: si salió uno hace menos de un minuto no se crea
// otro. Sirve también a la persona: tocar el botón cinco veces seguidas (se
// vio en los registros) anulaba cuatro enlaces antes de que llegara el primero.
//
// TAMPOCO DICE A QUÉ CORREO LO MANDÓ. Ese dato es de la familia: quien escribe
// el usuario de otro alumno no tiene por qué enterarse del correo de su casa.

import { createClient } from "npm:@supabase/supabase-js@2";
import { DOMINIO_ALUMNO, esCorreoInterno } from "./usuario-alumno.ts";
import { asuntoRecuperacion, cuerpoRecuperacion, enlaceRecuperacion } from "./recuperacion-email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";
const DESTINO = `${SITE_URL}/bienvenida.html`;
const UN_MINUTO = 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Lo mismo se responde exista la cuenta o no, salga el correo o no: quien
// pregunta no puede deducir nada de la respuesta.
const MISMA_RESPUESTA = { ok: true };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: { usuario?: string };
  try {
    body = await req.json();
  } catch {
    return json(MISMA_RESPUESTA);
  }

  let usuario = String(body.usuario ?? "").trim().toLowerCase().slice(0, 200);
  if (!usuario) return json(MISMA_RESPUESTA);

  // El niño escribe "sofia.munoz", no el usuario entero: la página ya le pega el
  // dominio, pero esto lo vuelve a hacer por si llega pelado desde otro lado.
  if (!usuario.includes("@")) usuario = `${usuario}@${DOMINIO_ALUMNO}`;

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // `ilike` para no depender de mayúsculas, con sus comodines escapados: un
  // «%» escrito en el campo encontraría la cuenta de otra persona.
  const { data: perfil } = await adminClient
    .from("profiles").select("id, full_name")
    .ilike("email", usuario.replace(/[\\%_]/g, "\\$&")).maybeSingle();
  if (!perfil) return json(MISMA_RESPUESTA);

  const interno = esCorreoInterno(usuario);

  // Un correo de verdad recibe su propio enlace. Un usuario de la academia no
  // tiene buzón: a dónde se le puede escribir a esa familia lo dice
  // `correo_de_contacto()`, la regla que comparten los informes a la casa y
  // los avisos de cobro.
  let destino: string | null = usuario;
  if (interno) {
    const { data } = await adminClient.rpc("correo_de_contacto", { p_alumno: perfil.id });
    destino = data;
    if (!destino || esCorreoInterno(destino)) {
      // No hay a quién escribirle: la familia tiene que pedírselo al profesor.
      // Se deja anotado en los registros —es lo único que puede avisar— pero la
      // respuesta sigue siendo la misma de siempre.
      console.error("recuperar-acceso: el alumno", perfil.id, "no tiene ningún correo de contacto");
      return json(MISMA_RESPUESTA);
    }
  }

  // El freno: si salió uno hace menos de un minuto, ese sigue sirviendo y no
  // se anula con otro.
  const { data: cuenta } = await adminClient.auth.admin.getUserById(perfil.id);
  const ultimo = cuenta?.user?.recovery_sent_at ? Date.parse(cuenta.user.recovery_sent_at) : 0;
  if (Date.now() - ultimo < UN_MINUTO) return json(MISMA_RESPUESTA);

  const { data, error } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email: usuario,
    options: { redirectTo: DESTINO },
  });

  const token = data?.properties?.hashed_token;
  if (error || !token) {
    console.error("recuperar-acceso: no se pudo generar el enlace:", error?.message);
    return json(MISMA_RESPUESTA);
  }
  const enlace = enlaceRecuperacion(token);

  await mandar(destino, enlace, usuario, perfil.full_name, !interno);
  return json(MISMA_RESPUESTA);
});

/** Manda el correo. Nunca lanza: el enlace ya está generado y tumbar la
 *  respuesta por un fallo de correo no le arregla nada a nadie. */
async function mandar(
  destino: string, enlace: string, usuario: string, nombre: string | null | undefined,
  esCuentaPropia: boolean,
) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("recuperar-acceso: sin RESEND_API_KEY no hay forma de mandar el enlace");
    return;
  }
  try {
    const from = Deno.env.get("RESEND_FROM") || "Ajedrez Integral <informes@ajedrez-integral.com>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [destino],
        subject: asuntoRecuperacion(),
        html: cuerpoRecuperacion(enlace, usuario, nombre, esCuentaPropia),
      }),
    });
    if (!res.ok) console.error("Resend rechazó el enlace de recuperación:", res.status, await res.text());
  } catch (err) {
    console.error("Error mandando el enlace de recuperación:", err);
  }
}
