// Edge Function: reenviar-acceso
//
// Le vuelve a mandar a UN alumno el enlace para crear o cambiar su
// contraseña, a pedido de quien coordina o administra. Es la otra mitad de
// `recuperar-acceso`: aquella es el "olvidé mi contraseña" del propio alumno,
// sin sesión y sin decir nunca nada; esta es la misma necesidad vista desde
// quien coordina, cuando una familia dice que el correo de bienvenida nunca
// llegó o que ya no encuentra la contraseña.
//
// POR QUÉ ES OTRA FUNCIÓN Y NO LA MISMA
// Acá quien pregunta SÍ tiene sesión y SÍ tiene permiso sobre ese alumno —ya
// lo gestiona, ya ve el correo de su casa en "Informes a la casa"—, así que
// decirle a dónde salió el correo no es una fuga: es al revés, es lo que
// necesita para poder avisarle a la familia. Repetir a ciegas la discreción
// de `recuperar-acceso` le escondería a quien coordina el único dato que le
// hace falta para hacer su trabajo.
//
// EL PERMISO NO SE COMPRUEBA A MANO
// `soy_coordinador()` decide quién puede llamar esto, y la fila del alumno se
// lee con un cliente que lleva el JWT de quien llama: si la RLS de `profiles`
// no se la devuelve, ese alumno no es suyo. Es la misma regla que ya usa el
// "Enviar ahora" de Informes a la casa.
//
// A DÓNDE SALE
// `correo_de_contacto()` es la misma función que usan los informes a la casa
// y los avisos de cobro: al correo propio si el alumno tiene uno de verdad, o
// al de quien lo tenga encargado si entra con un usuario de la academia. Si
// no hay ninguno de los dos, se dice — mandarlo a una dirección inventada no
// da ningún error, el correo simplemente se pierde.

import { createClient } from "npm:@supabase/supabase-js@2";
import { esCorreoInterno } from "./usuario-alumno.ts";
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Falta token de autorización" }, 401);

  // Cliente con la sesión de quien llama, para que la RLS decida qué puede
  // leer y qué no — la misma idea que create-student e inscribir-alumno.
  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser(jwt);
  if (userError || !userData?.user) return json({ error: "Token inválido" }, 401);

  const { data: coordina } = await callerClient.rpc("soy_coordinador");
  if (!coordina) {
    return json({ error: "Esto es de quien coordina o administra" }, 403);
  }

  let body: { alumno_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo JSON inválido" }, 400);
  }

  const alumnoId = String(body.alumno_id || "").trim();
  if (!alumnoId) return json({ error: "Falta el alumno" }, 400);

  // La RLS de `profiles` decide si este alumno es suyo: quien administra ve a
  // cualquiera, quien coordina solo a los que tiene asignados. Sin fila no hay
  // permiso, y no hace falta preguntarlo aparte.
  const { data: alumno, error: alumnoError } = await callerClient
    .from("profiles").select("id, email, full_name, role, is_admin").eq("id", alumnoId).maybeSingle();
  if (alumnoError) return json({ error: "No se pudo leer ese alumno" }, 500);
  if (!alumno) return json({ error: "Ese alumno no es tuyo" }, 403);
  /* Vale también para un PROFESOR bajo coordinación: quien coordina es quien
     da de alta al equipo, así que es quien recibe el "no me llegó nada". Lo
     que no se toca desde acá es la cuenta master — para eso está el "olvidé mi
     contraseña" de siempre, y no hay nadie por encima a quien pedírselo. */
  if (alumno.is_admin) {
    return json({ error: "La cuenta que administra no se restablece desde acá" }, 400);
  }

  // SECURITY INVOKER: corre con el permiso de quien llama, ya comprobado
  // arriba con la fila de `profiles`.
  const { data: destino, error: destinoError } = await callerClient
    .rpc("correo_de_contacto", { p_alumno: alumnoId });
  if (destinoError) return json({ error: "No se pudo averiguar a dónde mandarlo" }, 500);
  if (!destino) {
    return json({
      error: "No hay ningún correo al que mandárselo. Agrega uno en «Informes a la casa» y vuelve a intentar.",
    }, 400);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email: alumno.email,
    options: { redirectTo: DESTINO },
  });

  const enlace = link?.properties?.action_link;
  if (linkError || !enlace) {
    return json({ error: "No se pudo generar el enlace: " + (linkError?.message ?? "") }, 500);
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ error: "Falta configurar el correo (RESEND_API_KEY)" }, 500);

  try {
    const from = Deno.env.get("RESEND_FROM") || "Ajedrez Integral <informes@ajedrez-integral.com>";
    // Si el correo con el que entra NO es un usuario de la academia,
    // `correo_de_contacto()` devolvió ese mismo correo: le está llegando a la
    // propia cuenta, y el correo se lo dice así en vez de hablarle de "tu hijo
    // o hija".
    const esCuentaPropia = !esCorreoInterno(alumno.email);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [destino],
        subject: "Una contraseña nueva para entrar a Ajedrez Integral",
        html: cuerpoRecuperacion(enlace, alumno.email, alumno.full_name, esCuentaPropia),
      }),
    });
    if (!res.ok) {
      const detalle = await res.text();
      console.error("reenviar-acceso: Resend rechazó el correo:", res.status, detalle);
      return json({ error: "El correo no se pudo mandar" }, 502);
    }
  } catch (err) {
    console.error("reenviar-acceso: error mandando el correo:", err);
    return json({ error: "El correo no se pudo mandar" }, 502);
  }

  return json({ ok: true, correo_destino: destino, usuario: alumno.email });
});
