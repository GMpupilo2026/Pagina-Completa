// Edge Function: create-student
// Permite que un usuario con rol "profesor" —o quien administra, aunque su rol
// no sea ese— invite alumnos por correo. El alumno queda asignado
// automáticamente a ESE profesor — cada profesor ve y gestiona a los alumnos
// que él mismo invitó, o que la persona administradora le haya asignado desde
// el panel de Administración. Quien administra o supervisa puede elegir el
// profesor (`profesor_id`, ver profesor-elegido.ts); quien administra sin ser
// profesor y sin elegir no da clase, y el alumno queda sin profesor
// (`asignado: false`).
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
//
// EL ALUMNO QUE NO TIENE CORREO
// Un niño pequeño no tiene buzón, y una familia con dos hijos tiene UNO solo
// para los dos — que no se puede repetir, porque el correo es la llave con la
// que se inicia sesión. Con `sin_correo: true` no se le pide: se le arma un
// usuario del dominio de la academia (ver `usuario-alumno.ts`) y el enlace para
// crear la contraseña sale hacia el correo de la casa. Así los dos hermanos
// tienen cuentas separadas y todo le llega a la misma bandeja.
//
// CON LA CONTRASEÑA YA PUESTA
// Hay familias sin ningún correo, y otras que lo tienen y no abren el enlace:
// el niño llega a la clase sin poder entrar. Con `sin_correo` y `contrasena`,
// la cuenta se crea con la contraseña puesta (`crearConContrasena()`) y no
// sale ningún correo: quien le da clase le da el usuario y la contraseña en
// la mano. Por eso ahí el correo de la casa deja de ser obligatorio —ya no
// hay enlace que mandar—, aunque si viene se guarda igual para los informes.

import { createClient } from "npm:@supabase/supabase-js@2";
import { invitarConBienvenida } from "./invitacion-email.ts";
import { crearConContrasena, esCorreoInterno, problemaDeContrasena, usuarioLibre } from "./usuario-alumno.ts";
import { profesorElegido } from "./profesor-elegido.ts";

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
    .select("role, is_admin, es_supervisor")
    .eq("id", userData.user.id)
    .single();

  // Lo de profesores vale igual para quien administra, que además no tiene tope
  // y no necesita el rol de profesor (su rol puede ser 'admin').
  if (profileError || !(profile?.role === "profesor" || profile?.is_admin)) {
    return json({ error: "Solo quien da clase o administra puede crear cuentas de alumno" }, 403);
  }

  let body: {
    email?: string; full_name?: string;
    sin_correo?: boolean; encargado_email?: string; encargado_nombre?: string;
    usuario?: string; grupo?: string; frecuencia?: string; profesor_id?: string;
    contrasena?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo JSON inválido" }, 400);
  }

  const { email, full_name, usuario: usuarioPedido } = body;
  const sinCorreo = body.sin_correo === true;
  const encargadoEmail = (body.encargado_email || "").trim().toLowerCase();
  const encargadoNombre = (body.encargado_nombre || "").trim() || null;
  const grupo = (body.grupo || "").trim().slice(0, 60) || null;
  // La misma forma que exige el CHECK de encargados.email en la base.
  const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const FRECUENCIAS = new Set(["diario", "semanal", "mensual", "anual"]);
  const frecuencia = FRECUENCIAS.has(String(body.frecuencia)) ? String(body.frecuencia) : "semanal";
  // Vacía es lo mismo que no mandarla: se invita por correo como siempre.
  const clave = typeof body.contrasena === "string" && body.contrasena !== "" ? body.contrasena : null;

  if (clave !== null) {
    // La contraseña de quien tiene correo propio es de esa persona: la crea
    // con su enlace. Esto es solo para el usuario de la academia.
    if (!sinCorreo) {
      return json({
        error: "La contraseña se pone solo con un usuario de la Academia. " +
               "Con correo propio, el alumno la crea con el enlace que le llega.",
      }, 400);
    }
    const problema = problemaDeContrasena(clave);
    if (problema) return json({ error: problema }, 400);
  }

  if (sinCorreo) {
    // Sin buzón propio y sin contraseña, el de la casa NO es opcional: es a
    // donde va el enlace para crear la contraseña. Sin él la cuenta quedaría
    // creada y muda, y de eso nadie se entera hasta que el alumno nunca
    // aparece. Con la contraseña puesta ya entra: la casa es opcional.
    if (!full_name) {
      return json({ error: "Para armarle un usuario hace falta el nombre del alumno" }, 400);
    }
    if (clave === null && !CORREO.test(encargadoEmail)) {
      return json({
        error: "Sin correo propio, hace falta el correo de la casa: " +
               "es a donde llega el enlace para crear la contraseña.",
      }, 400);
    }
  } else {
    if (!email) {
      return json({ error: "email es requerido" }, 400);
    }
    if (esCorreoInterno(email)) {
      // A mano se saltaría el desempate de usuarioLibre() y podría chocar con
      // el usuario de otro alumno.
      return json({
        error: "Ese es un usuario de la academia, no un correo. " +
               "Para darle un usuario, marca «No tiene correo propio».",
      }, 400);
    }
  }

  // El correo de la persona encargada, cuando viene, tiene que servir para
  // avisarle de verdad — sin correo propio ya se validó arriba como
  // obligatorio; acá se valida el mismo formato para cuando viene puesto
  // aparte, igual que ya hace inscribir-alumno.
  if (encargadoEmail && !CORREO.test(encargadoEmail)) {
    return json({ error: "El correo de la persona encargada no parece un correo" }, 400);
  }
  if (encargadoEmail && esCorreoInterno(encargadoEmail)) {
    return json({ error: "El correo de la persona encargada tiene que ser uno que reciba correo" }, 400);
  }

  // Cliente admin (service role) para gastar el cupo e invitar al usuario.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Quien administra o supervisa puede elegir de quién es alumno. Se valida
  // antes de gastar el cupo.
  const elegido = await profesorElegido(
    callerClient, adminClient, profile, userData.user.id,
    typeof body.profesor_id === "string" ? body.profesor_id.trim().slice(0, 40) : null,
  );
  if (elegido.error) return json({ error: elegido.error }, 403);
  const profesorId = elegido.id;

  // Un correo que ya es de una cuenta no se vuelve a invitar. GoTrue solo
  // rechaza a un usuario YA CONFIRMADO: con uno invitado que todavía no abrió
  // su correo, devuelve ese mismo usuario, y más abajo quedaría asignado a quien
  // llama —o sea, un profesor se quedaba con el alumno que acababa de invitar
  // otra profesora—. Misma regla que inscribir-alumno.
  if (!sinCorreo) {
    const { data: yaExiste } = await adminClient
      .from("profiles").select("id").ilike("email", email!.trim()).maybeSingle();
    if (yaExiste) {
      return json({
        error: "Ese correo ya es de una cuenta de la Academia. Si es un hermano, " +
               "marca «No tiene correo propio»; si es el mismo alumno, pídele a " +
               "coordinación que te lo asigne.",
      }, 409);
    }
  }

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
    return json({ error: "Solo quien da clase o administra puede crear cuentas de alumno" }, 403);
  }

  // Sin correo propio se le arma un usuario libre. El propuesto desde la
  // pantalla se respeta, pero igual pasa por el desempate: entre que se propuso
  // y que se apretó el botón pudo entrar otro alumno con el mismo nombre.
  let usuarioFinal = (email || "").trim().toLowerCase();
  if (sinCorreo) {
    const tomado = async (correo: string) => {
      const { data } = await adminClient
        .from("profiles").select("id").ilike("email", correo).maybeSingle();
      return !!data;
    };
    const usuario = await usuarioLibre(usuarioPedido || full_name, tomado);
    if (!usuario) {
      await adminClient.rpc("devolver_invitacion", { p_profesor: userData.user.id });
      return json({ error: "No se pudo armar un usuario con ese nombre. Escribe uno a mano." }, 400);
    }
    usuarioFinal = usuario;
  }

  // Con la contraseña puesta no sale ningún correo: el enlace para crearla
  // sobra, y a la casa le llegaría uno que pide hacer algo ya hecho.
  const invitacion = clave !== null
    ? { ...(await crearConContrasena(adminClient, usuarioFinal, clave, full_name)),
        correoEnviado: null, destino: null }
    : await invitarConBienvenida(
        adminClient, usuarioFinal, full_name,
        sinCorreo ? { destino: encargadoEmail, nombre: encargadoNombre } : null,
      );

  if (invitacion.error || !invitacion.user) {
    // No se llegó a invitar a nadie: se devuelve la invitación gastada.
    await adminClient.rpc("devolver_invitacion", { p_profesor: userData.user.id });
    return json({ error: invitacion.error ?? "No se pudo invitar al alumno" }, 400);
  }

  // Solo se escribe lo que vino: no invitar con un grupo no le borra el que ya
  // tuviera. role, email, is_admin y compañía no se tocan acá.
  const cambiosPerfil: Record<string, string> = {};
  if (full_name) cambiosPerfil.full_name = full_name;
  if (grupo) cambiosPerfil.grupo = grupo;
  if (Object.keys(cambiosPerfil).length) {
    await adminClient.from("profiles").update(cambiosPerfil).eq("id", invitacion.user.id);
  }
  // Queda asignado al profesor elegido, o a quien lo invitó si da clase. El
  // profesor principal lo pone solo el trigger de profile_teachers.
  if (profesorId) {
    await adminClient.from("profile_teachers")
      .upsert({ student_id: invitacion.user.id, teacher_id: profesorId },
              { onConflict: "student_id,teacher_id" });
  }

  // Con un alumno sin buzón, la persona encargada no es un extra: es la ÚNICA
  // forma de escribirle a esa familia, y ya se validó arriba como obligatoria.
  // Con un alumno que sí tiene correo propio, apuntar a la persona encargada
  // es opcional, pero si se manda queda guardada de una vez — es la misma
  // función que después usa "Informes a la casa", así que no hace falta una
  // segunda vuelta a esa pantalla solo para dejarla apuntada. Es la misma
  // decisión que ya toma inscribir-alumno.
  let encargadoGuardado = false;
  if (encargadoEmail) {
    const { error: encargadoError } = await adminClient.from("encargados")
      .upsert({
        student_id: invitacion.user.id, nombre: encargadoNombre, email: encargadoEmail,
        frecuencia, activo: true, creado_por: userData.user.id,
      }, { onConflict: "student_id,email" });
    if (encargadoError) {
      return json({
        error: "La cuenta quedó creada, pero no se pudo apuntar el correo de la casa: " +
          encargadoError.message +
          (sinCorreo ? " — sin eso no hay forma de escribirle a esta familia." : ""),
        user_id: invitacion.user.id, usuario: usuarioFinal,
      }, 500);
    }
    encargadoGuardado = true;
  }

  return json({
    ok: true,
    user_id: invitacion.user.id,
    // Con qué entra de verdad: su correo, o el usuario que se le armó. La
    // pantalla tiene que poder enseñárselo a quien invitó.
    email: usuarioFinal,
    usuario: usuarioFinal,
    sin_correo: sinCorreo,
    // Si ya entra con la contraseña que se le puso: entonces no salió correo
    // y la pantalla tiene que decir que se la den en la mano.
    con_contrasena: clave !== null,
    // A qué bandeja salió el correo: con un alumno sin buzón no es la suya.
    correo_destino: invitacion.destino,
    encargado_guardado: encargadoGuardado,
    // A quién quedó asignado; sin nadie, está sin profesor.
    asignado: !!profesorId,
    profesor_id: profesorId,
    // La cuenta pudo quedar creada y el correo no salir: quien invitó tiene que
    // poder enterarse en el momento, no cuando el alumno no aparezca. Con la
    // contraseña puesta es null: no había correo que mandar.
    correo_enviado: invitacion.correoEnviado,
    restantes: cupo.ilimitado ? null : cupo.restantes,
    ilimitado: !!cupo.ilimitado,
  });
});
