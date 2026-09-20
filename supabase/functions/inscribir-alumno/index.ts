// Edge Function: inscribir-alumno
//
// Da de alta a UNA familia a partir de UNA respuesta de formulario de
// inscripción (formularios.html → "Respuestas" → botón "Crear cuenta"): crea la
// cuenta del alumno, lo asigna a quien lo invita y deja apuntada a la persona
// encargada con su correo, que es lo que después usa "📧 Informes a la casa".
//
// POR QUÉ ES UNA SOLA FUNCIÓN Y NO DOS LLAMADAS DEL NAVEGADOR
// Invitar al alumno y apuntar a su encargado son UN acto: "dar de alta a esta
// familia". Partido en dos, si la segunda mitad falla queda un alumno con
// cuenta y sin encargado — y eso no da ningún error a la vista: simplemente
// nunca le llega el informe a la casa y nadie se entera hasta que alguien
// pregunta. Acá o pasan las dos o se dice cuál falló.
//
// SE PUEDE APRETAR DOS VECES
// Ninguno de los pasos duplica nada al repetirse: si ya hay cuenta con ese
// correo se reusa (y NO se gasta otra invitación del cupo), la asignación de
// profesor y la persona encargada son upsert, y la marca se vuelve a escribir
// igual. Así un doble clic, o reintentar después de un fallo a mitad de camino,
// termina de completar el alta en vez de crear un enredo.
//
// EL PERMISO NO SE COMPRUEBA A MANO
// La fila de la respuesta se lee con un cliente que lleva el JWT de quien
// llama, o sea pasando por la RLS de formulario_respuestas. Si la RLS no se la
// devuelve, ese formulario no es suyo. Es la misma regla que ya usa
// informes-encargados, escrita una sola vez.
//
// EL CORREO ES EL MISMO QUE EL DE LA INVITACIÓN DIRECTA
// Lo arma invitacion-email.ts, compartido con create-student: pide crear la
// contraseña y explica cómo se entra. Antes esta puerta no mandaba ningún
// correo propio — el alumno del formulario recibía solo la invitación de
// Supabase, sin explicación y sin el PDF de instrucciones adaptadas que sí
// recibía el invitado por el profesor.

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

const FRECUENCIAS = new Set(["diario", "semanal", "mensual", "anual"]);
// La misma forma que exige el CHECK de encargados.email en la base: si acá pasa
// algo que allá se rechaza, el alta se cae a mitad de camino.
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const texto = (v: unknown, tope: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, tope) : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Falta token de autorización" }, 401);

  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser(jwt);
  if (userError || !userData?.user) return json({ error: "Token inválido" }, 401);
  const quienInvita = userData.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo JSON inválido" }, 400);
  }

  const respuestaId = texto(body.respuesta_id, 40);
  const alumnoEmail = (texto(body.alumno_email, 200) || "").toLowerCase();
  const alumnoNombre = texto(body.alumno_nombre, 120);
  const encargadoEmail = (texto(body.encargado_email, 200) || "").toLowerCase();
  const encargadoNombre = texto(body.encargado_nombre, 120);
  const grupo = texto(body.grupo, 60);
  const frecuencia = FRECUENCIAS.has(String(body.frecuencia)) ? String(body.frecuencia) : "semanal";

  if (!respuestaId) return json({ error: "Falta la respuesta del formulario" }, 400);
  if (!CORREO.test(alumnoEmail)) {
    return json({ error: "El correo del alumno no parece un correo" }, 400);
  }
  if (encargadoEmail && !CORREO.test(encargadoEmail)) {
    return json({ error: "El correo de la persona encargada no parece un correo" }, 400);
  }

  // Quien usa el armador de formularios es quien coordina o quien administra.
  const { data: coordina } = await callerClient.rpc("soy_coordinador");
  if (!coordina) {
    return json({ error: "Esto es de quien coordina o administra" }, 403);
  }

  // La RLS decide si este formulario es suyo: si no lo es, no hay fila.
  const { data: respuesta, error: respuestaError } = await callerClient
    .from("formulario_respuestas")
    .select("id, cuenta_id")
    .eq("id", respuestaId)
    .maybeSingle();

  if (respuestaError) return json({ error: "No se pudo leer la respuesta" }, 500);
  if (!respuesta) return json({ error: "Esa respuesta no es de un formulario tuyo" }, 403);

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ---- 1. La cuenta del alumno ----
  // Si ya existe con ese correo se reusa y NO se gasta cupo: apretar el botón
  // dos veces no puede costar dos invitaciones.
  const { data: yaEsta } = await adminClient
    .from("profiles").select("id").ilike("email", alumnoEmail).maybeSingle();

  let alumnoId = yaEsta?.id ?? null;
  let restantes: number | null = null;
  let ilimitado = false;
  // Quien ya tenía cuenta no recibe correo: ya tiene su contraseña puesta.
  let correoEnviado = false;
  const yaTeniaCuenta = !!alumnoId;

  if (!alumnoId) {
    const { data: cupo, error: cupoError } = await adminClient
      .rpc("consumir_invitacion", { p_profesor: quienInvita });
    if (cupoError) return json({ error: "No se pudo comprobar tu cupo de invitaciones" }, 500);
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
    restantes = cupo.ilimitado ? null : cupo.restantes;
    ilimitado = !!cupo.ilimitado;

    const invitacion = await invitarConBienvenida(adminClient, alumnoEmail, alumnoNombre);

    if (invitacion.error || !invitacion.user) {
      // No se invitó a nadie: la invitación gastada se devuelve.
      await adminClient.rpc("devolver_invitacion", { p_profesor: quienInvita });
      return json({ error: invitacion.error ?? "No se pudo invitar al alumno" }, 400);
    }
    alumnoId = invitacion.user.id;
    correoEnviado = invitacion.correoEnviado;
  }

  // ---- 2. El nombre y el equipo ----
  // Solo se escribe lo que vino: un formulario sin equipo no le borra el que ya
  // tuviera. role, email, is_admin y compañía no se tocan — el trigger de
  // identidad los revertiría igual.
  const cambios: Record<string, string> = {};
  if (alumnoNombre) cambios.full_name = alumnoNombre;
  if (grupo) cambios.grupo = grupo;
  if (Object.keys(cambios).length) {
    await adminClient.from("profiles").update(cambios).eq("id", alumnoId);
  }

  // ---- 3. Queda asignado a quien lo dio de alta ----
  // El profesor principal lo pone solo el trigger de profile_teachers.
  const { error: asignarError } = await adminClient.from("profile_teachers")
    .upsert({ student_id: alumnoId, teacher_id: quienInvita },
            { onConflict: "student_id,teacher_id" });
  if (asignarError) {
    return json({
      error: "La cuenta quedó creada, pero no se pudo asignar a tu clase: " + asignarError.message,
      alumno_id: alumnoId, ya_tenia_cuenta: yaTeniaCuenta,
    }, 500);
  }

  // ---- 4. La persona encargada, que es para lo que sirve el informe a la casa ----
  let encargadoGuardado = false;
  if (encargadoEmail) {
    const { error: encargadoError } = await adminClient.from("encargados")
      .upsert({
        student_id: alumnoId, nombre: encargadoNombre, email: encargadoEmail,
        frecuencia, activo: true, creado_por: quienInvita,
      }, { onConflict: "student_id,email" });
    if (encargadoError) {
      return json({
        error: "La cuenta quedó creada, pero no se pudo apuntar a la persona encargada: " +
          encargadoError.message,
        alumno_id: alumnoId, ya_tenia_cuenta: yaTeniaCuenta,
      }, 500);
    }
    encargadoGuardado = true;
  }

  // ---- 5. La marca, al final ----
  // Se apunta DESPUÉS de que todo lo de arriba salió bien, nunca antes: si algo
  // falló, la respuesta se queda con su botón para volver a intentarlo.
  await adminClient.from("formulario_respuestas").update({
    cuenta_id: alumnoId,
    cuenta_creada_at: new Date().toISOString(),
    cuenta_creada_por: quienInvita,
  }).eq("id", respuestaId);

  return json({
    ok: true,
    alumno_id: alumnoId,
    email: alumnoEmail,
    ya_tenia_cuenta: yaTeniaCuenta,
    encargado_guardado: encargadoGuardado,
    // La cuenta pudo quedar creada y el correo no salir: se dice, en vez de
    // dejar una cuenta muda de la que nadie se entera.
    correo_enviado: correoEnviado,
    restantes, ilimitado,
  });
});
