// Edge Function: create-student
// Permite que un usuario con rol "profesor" invite alumnos por correo. El
// alumno queda asignado automáticamente a ESE profesor — cada profesor ve y
// gestiona a los alumnos que él mismo invitó, o que la persona administradora
// le haya asignado desde el panel de Administración.
//
// La asignación se escribe en profile_teachers, que es la tabla que hace
// cumplir la RLS: UN ALUMNO PUEDE TENER VARIOS PROFESORES. profiles.teacher_id
// se quedó solo con el papel de "profesor principal" y lo pone solo el trigger
// de esa tabla, así que aquí no se escribe a mano.
//
// **Cada invitación gasta una del cupo** que le fijó quien administra
// (profiles.invitaciones_max). El cupo se gasta ANTES de invitar, con
// consumir_invitacion(), que hace la comprobación y el descuento en una sola
// operación: si el profesor abre dos pestañas y manda dos invitaciones a la
// vez, no puede pasarse. Si la invitación falla después, se devuelve con
// devolver_invitacion(). Quien administra no tiene tope.
//
// EL CORREO PIDE LA CONTRASEÑA Y EXPLICA CÓMO SE ENTRA
// Antes el alumno recibía la invitación que arma Supabase, entraba ya
// autenticado y su contraseña quedaba sin poner: para volver al día siguiente
// tenía que adivinar. Ahora el enlace lleva a /bienvenida.html, que lo primero
// que hace es pedirle crear su contraseña y explicarle el modo de ingreso.
// Ese correo lo arma invitacion-email.ts, compartido con inscribir-alumno.

import { createClient } from "npm:@supabase/supabase-js@2";
import { invitarConBienvenida } from "./invitacion-email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Método no permitido" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return json({ error: "Falta token de autorización" }, 401);
  }

  // Cliente con la sesión del caller, para verificar quién es y respetar RLS.
  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return json({ error: "Token inválido" }, 401);
  }

  const { data: profile, error: profileError } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profileError || profile?.role !== "profesor") {
    return json({ error: "Solo el profesor puede invitar alumnos" }, 403);
  }

  let body: { email?: string; full_name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo JSON inválido" }, 400);
  }

  const { email, full_name } = body;
  if (!email) {
    return json({ error: "email es requerido" }, 400);
  }

  // Cliente admin (service role) para gastar el cupo e invitar al usuario.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // El cupo se gasta primero: así dos invitaciones simultáneas no pueden
  // pasarse del límite. La función es SECURITY DEFINER y solo la puede llamar
  // la service role.
  const { data: cupo, error: cupoError } = await adminClient
    .rpc("consumir_invitacion", { p_profesor: userData.user.id });

  if (cupoError) {
    return json({ error: "No se pudo comprobar tu cupo de invitaciones" }, 500);
  }
  if (!cupo?.ok) {
    if (cupo?.motivo === "sin_cupo") {
      const max = cupo.max ?? 0;
      return json({
        error: max === 0
          ? "Todavía no tienes invitaciones asignadas. Pídeselas a la persona administradora."
          : `Ya usaste tus ${max} invitaciones. Pídele más a la persona administradora.`,
        sin_cupo: true, max, usadas: cupo.usadas ?? 0,
      }, 403);
    }
    return json({ error: "Solo el profesor puede invitar alumnos" }, 403);
  }

  const invitacion = await invitarConBienvenida(adminClient, email, full_name);

  if (invitacion.error || !invitacion.user) {
    // No se llegó a invitar a nadie: se devuelve la invitación gastada.
    await adminClient.rpc("devolver_invitacion", { p_profesor: userData.user.id });
    return json({ error: invitacion.error ?? "No se pudo invitar al alumno" }, 400);
  }

  if (full_name) {
    await adminClient.from("profiles").update({ full_name }).eq("id", invitacion.user.id);
  }
  // Queda asignado a quien lo invitó. El profesor principal lo pone solo el
  // trigger de profile_teachers.
  await adminClient.from("profile_teachers")
    .upsert({ student_id: invitacion.user.id, teacher_id: userData.user.id },
            { onConflict: "student_id,teacher_id" });

  return json({
    ok: true,
    user_id: invitacion.user.id,
    email: invitacion.user.email,
    // La cuenta pudo quedar creada y el correo no salir: quien invitó tiene que
    // poder enterarse en el momento, no cuando el alumno no aparezca.
    correo_enviado: invitacion.correoEnviado,
    restantes: cupo.ilimitado ? null : cupo.restantes,
    ilimitado: !!cupo.ilimitado,
  });
});
