// Edge Function: recuperar-acceso
//
// "¿Olvidaste tu contraseña?" para un alumno que no tiene buzón propio.
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
// TAMPOCO DICE A QUÉ CORREO LO MANDÓ. Ese dato es de la familia: quien escribe
// el usuario de otro alumno no tiene por qué enterarse del correo de su casa.

import { createClient } from "npm:@supabase/supabase-js@2";
import { DOMINIO_ALUMNO, esCorreoInterno } from "./usuario-alumno.ts";
import { cuerpoRecuperacion } from "./recuperacion-email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";
const DESTINO = `${SITE_URL}/bienvenida.html`;

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

  // Esto es SOLO para las cuentas sin buzón. Un correo de verdad sigue por el
  // camino de siempre (`resetPasswordForEmail` desde la página), que está
  // probado y no necesita que esta función exista.
  if (!esCorreoInterno(usuario)) return json(MISMA_RESPUESTA);

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: perfil } = await adminClient
    .from("profiles").select("id, full_name").ilike("email", usuario).maybeSingle();
  if (!perfil) return json(MISMA_RESPUESTA);

  // A dónde se le puede escribir a esta familia. La regla vive en la base y la
  // comparten los informes a la casa y los avisos de cobro: si algún día hay
  // que cambiarla, se cambia ahí y se cambia sola para los tres.
  const { data: destino } = await adminClient
    .rpc("correo_de_contacto", { p_alumno: perfil.id });

  if (!destino || esCorreoInterno(destino)) {
    // No hay a quién escribirle: la familia tiene que pedírselo al profesor.
    // Se deja anotado en los registros —es lo único que puede avisar— pero la
    // respuesta sigue siendo la misma de siempre.
    console.error("recuperar-acceso: el alumno", perfil.id, "no tiene ningún correo de contacto");
    return json(MISMA_RESPUESTA);
  }

  const { data, error } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email: usuario,
    options: { redirectTo: DESTINO },
  });

  const enlace = data?.properties?.action_link;
  if (error || !enlace) {
    console.error("recuperar-acceso: no se pudo generar el enlace:", error?.message);
    return json(MISMA_RESPUESTA);
  }

  await mandar(destino, enlace, usuario, perfil.full_name);
  return json(MISMA_RESPUESTA);
});

/** Manda el correo. Nunca lanza: el enlace ya está generado y tumbar la
 *  respuesta por un fallo de correo no le arregla nada a nadie. */
async function mandar(
  destino: string, enlace: string, usuario: string, nombre?: string | null,
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
        subject: "Una contraseña nueva para entrar a Ajedrez Integral",
        html: cuerpoRecuperacion(enlace, usuario, nombre),
      }),
    });
    if (!res.ok) console.error("Resend rechazó el enlace de recuperación:", res.status, await res.text());
  } catch (err) {
    console.error("Error mandando el enlace de recuperación:", err);
  }
}
