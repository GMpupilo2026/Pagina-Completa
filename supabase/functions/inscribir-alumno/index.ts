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
// SE PUEDE APRETAR DOS VECES — PERO "OTRA VEZ" NO ES "OTRO ALUMNO"
// Reintentar la MISMA respuesta no duplica nada: se reusa la cuenta que esa
// respuesta ya creó (sin gastar otra invitación), la asignación de profesor y
// la persona encargada son upsert, y la marca se vuelve a escribir igual.
//
// Lo que sí cambió: antes eso se decidía buscando el CORREO en profiles, no
// mirando esta respuesta. O sea que dar de alta a un segundo alumno con un
// correo ya usado reusaba la cuenta del primero y le escribía encima el nombre
// y el equipo — el primer hermano desaparecía con todo su progreso, sus tareas
// y su asistencia adentro de la cuenta del segundo, y la pantalla decía "listo"
// sin un solo error. Es el caso de todos los días: una familia con dos hijos
// pequeños y un solo correo.
//
// Ahora el reuso se decide por `respuesta.cuenta_id` —esta respuesta, esta
// cuenta— y un correo que ya es de otra cuenta se rechaza diciendo qué hacer:
// darle un usuario propio, que es para lo que existe `sin_correo`.
//
// EL ALUMNO QUE NO TIENE CORREO
// Con `sin_correo: true` no se le pide buzón: se le arma un usuario del dominio
// de la academia (ver `usuario-alumno.ts`) y su correo de bienvenida sale hacia
// la persona encargada. Así los dos hermanos tienen cuentas separadas y la mamá
// recibe las dos en su único correo.
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
import { esCorreoInterno, usuarioLibre } from "./usuario-alumno.ts";
import { profesorElegido } from "./profesor-elegido.ts";

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
  const sinCorreo = body.sin_correo === true;
  // El usuario se puede venir propuesto desde la pantalla (que lo enseña y deja
  // corregirlo): cuál pedazo del nombre es el apellido se adivina, y quien da
  // de alta tiene el nombre completo delante.
  const usuarioPedido = texto(body.usuario, 60);
  const frecuencia = FRECUENCIAS.has(String(body.frecuencia)) ? String(body.frecuencia) : "semanal";

  if (!respuestaId) return json({ error: "Falta la respuesta del formulario" }, 400);

  // Un alumno sin correo propio no trae buzón: entra con un usuario y su correo
  // sale hacia la casa. Entonces el de la persona encargada deja de ser
  // opcional — sin él la cuenta quedaría creada y el enlace para poner la
  // contraseña no llegaría a ninguna parte, que es una cuenta muda de las que
  // nadie se entera hasta que el alumno no aparece.
  if (sinCorreo) {
    if (!alumnoNombre) {
      return json({ error: "Para armarle un usuario hace falta el nombre del alumno" }, 400);
    }
    if (!CORREO.test(encargadoEmail)) {
      return json({
        error: "Sin correo propio, el de la persona encargada es obligatorio: " +
               "es a donde va el enlace para crear la contraseña.",
      }, 400);
    }
  } else if (!CORREO.test(alumnoEmail)) {
    return json({ error: "El correo del alumno no parece un correo" }, 400);
  } else if (esCorreoInterno(alumnoEmail)) {
    // Escribirlo a mano saltaría el desempate de usuarioLibre() y podría chocar
    // con el de otro alumno; además el alta tiene que saber que no hay buzón.
    return json({
      error: "Ese es un usuario de la academia, no un correo. " +
             "Para darle un usuario, marca «No tiene correo propio».",
    }, 400);
  }

  if (encargadoEmail && !CORREO.test(encargadoEmail)) {
    return json({ error: "El correo de la persona encargada no parece un correo" }, 400);
  }
  if (esCorreoInterno(encargadoEmail)) {
    return json({ error: "El correo de la persona encargada tiene que ser uno que reciba correo" }, 400);
  }

  // Quien usa el armador de formularios es quien coordina o quien administra,
  // y dar de alta es una función que el supervisor de su academia puede apagar.
  const { data: coordina } = await callerClient.rpc("coordinador_puede", { p_funcion: "altas" });
  if (!coordina) {
    return json({ error: "Dar de alta cuentas no está entre tus funciones de coordinación" }, 403);
  }

  // Quien administra o supervisa puede elegir de quién es alumno (se valida
  // abajo, antes de gastar el cupo). Sin elegir, queda de quien lo da de alta
  // si da clase; quien administra sin ser profesor no da clase, y entonces
  // queda sin profesor (ver profesor-elegido.ts).
  const { data: yo } = await callerClient
    .from("profiles").select("role, is_admin, es_supervisor").eq("id", quienInvita).maybeSingle();
  const profesorPedido = texto(body.profesor_id, 40);

  // La RLS decide si este formulario es suyo: si no lo es, no hay fila.
  const { data: respuesta, error: respuestaError } = await callerClient
    .from("formulario_respuestas")
    .select("id, cuenta_id")
    .eq("id", respuestaId)
    .maybeSingle();

  if (respuestaError) return json({ error: "No se pudo leer la respuesta" }, 500);
  if (!respuesta) return json({ error: "Esa respuesta no es de un formulario tuyo" }, 403);

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const elegido = await profesorElegido(callerClient, adminClient, yo, quienInvita, profesorPedido);
  if (elegido.error) return json({ error: elegido.error }, 403);
  const profesorId = elegido.id;

  // ---- 1. La cuenta del alumno ----
  // SOLO se reusa la cuenta que ESTA MISMA respuesta ya creó: eso es apretar el
  // botón dos veces, o reintentar un alta que falló a mitad de camino, y no
  // tiene por qué costar otra invitación del cupo.
  //
  // Antes esto se decidía buscando el correo en profiles, y por ahí se colaba
  // el caso de todos los días: dos hermanos pequeños con el único correo de la
  // mamá. El segundo alta encontraba la cuenta del primero, la reusaba, y más
  // abajo le escribía encima el nombre y el equipo — el primer hijo dejaba de
  // existir, con su progreso adentro de la cuenta del otro, sin un solo error
  // en pantalla.
  let alumnoId: string | null = respuesta.cuenta_id ?? null;
  let restantes: number | null = null;
  let ilimitado = false;
  // Quien ya tenía cuenta no recibe correo: ya tiene su contraseña puesta.
  let correoEnviado = false;
  let correoDestino: string | null = null;
  const yaTeniaCuenta = !!alumnoId;
  // Con qué entra: su correo, o el usuario que se le arma acá abajo.
  let usuarioFinal = alumnoEmail;

  // Al reintentar, con qué entra esa cuenta hay que ir a buscarlo: un alumno
  // sin buzón no manda ningún correo en el cuerpo, así que sin esto la pantalla
  // enseñaría un usuario vacío — y el usuario es justamente el dato que la
  // familia no puede adivinar.
  if (alumnoId) {
    const { data: yaEsta } = await adminClient
      .from("profiles").select("email").eq("id", alumnoId).maybeSingle();
    if (yaEsta?.email) usuarioFinal = yaEsta.email;
  }

  // Un correo que ya es de OTRA cuenta no se reusa ni se pisa: se dice, y se
  // dice qué hacer. `auth.users` lo rechazaría igual, pero con un mensaje en
  // inglés que no explica la salida.
  if (!alumnoId && !sinCorreo) {
    const { data: deOtro } = await adminClient
      .from("profiles").select("id, full_name").ilike("email", alumnoEmail).maybeSingle();
    if (deOtro) {
      return json({
        error: `Ese correo ya es de la cuenta de ${deOtro.full_name || alumnoEmail}. ` +
               "Si son hermanos y comparten el correo de la casa, marca " +
               "«No tiene correo propio»: se le arma un usuario aparte y el correo " +
               "le sigue llegando a la misma dirección.",
        correo_de_otra_cuenta: true,
      }, 409);
    }
  }

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
      return json({ error: "Solo quien da clase o administra puede crear cuentas de alumno" }, 403);
    }
    restantes = cupo.ilimitado ? null : cupo.restantes;
    ilimitado = !!cupo.ilimitado;

    // Sin correo propio: se le arma un usuario libre. El que venga propuesto
    // desde la pantalla se respeta, pero igual pasa por el desempate — entre
    // que se propuso y que se apretó el botón pudo entrar otro alumno con ese
    // mismo nombre, y dos cuentas con el mismo usuario es imposible.
    if (sinCorreo) {
      const tomado = async (correo: string) => {
        const { data } = await adminClient
          .from("profiles").select("id").ilike("email", correo).maybeSingle();
        return !!data;
      };
      const usuario = await usuarioLibre(usuarioPedido || alumnoNombre, tomado);
      if (!usuario) {
        await adminClient.rpc("devolver_invitacion", { p_profesor: quienInvita });
        return json({
          error: "No se pudo armar un usuario con ese nombre. Escribe uno a mano.",
        }, 400);
      }
      usuarioFinal = usuario;
    }

    const invitacion = await invitarConBienvenida(
      adminClient, usuarioFinal, alumnoNombre,
      // El alumno sin buzón recibe su bienvenida en la casa.
      sinCorreo ? { destino: encargadoEmail, nombre: encargadoNombre } : null,
    );

    if (invitacion.error || !invitacion.user) {
      // No se invitó a nadie: la invitación gastada se devuelve.
      await adminClient.rpc("devolver_invitacion", { p_profesor: quienInvita });
      return json({ error: invitacion.error ?? "No se pudo invitar al alumno" }, 400);
    }
    alumnoId = invitacion.user.id;
    correoEnviado = invitacion.correoEnviado;
    correoDestino = invitacion.destino;
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

  // ---- 3. Queda asignado al profesor elegido, o a quien lo dio de alta ----
  // El profesor principal lo pone solo el trigger de profile_teachers. Quien
  // administra sin ser profesor y sin elegir a nadie no se asigna: la
  // respuesta dice `asignado: false` y la pantalla avisa que falta ponerle
  // profesor.
  const { error: asignarError } = profesorId
    ? await adminClient.from("profile_teachers")
        .upsert({ student_id: alumnoId, teacher_id: profesorId },
                { onConflict: "student_id,teacher_id" })
    : { error: null };
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
  const { error: marcaError } = await adminClient.from("formulario_respuestas").update({
    cuenta_id: alumnoId,
    cuenta_creada_at: new Date().toISOString(),
    cuenta_creada_por: quienInvita,
  }).eq("id", respuestaId);
  // Sin la marca, volver a apretar «Crear cuenta» ya no reusaría esta cuenta:
  // armaría otra y gastaría otra invitación. Así que un fallo acá se dice.
  if (marcaError) {
    return json({
      error: "La cuenta quedó creada pero no se pudo marcar la respuesta: " + marcaError.message,
      alumno_id: alumnoId, ya_tenia_cuenta: yaTeniaCuenta,
    }, 500);
  }

  return json({
    ok: true,
    alumno_id: alumnoId,
    // Con qué entra el alumno de verdad: su correo, o el usuario que se le armó.
    // La pantalla tiene que poder enseñárselo a quien dio de alta — si no, nadie
    // sabe cuál es y la familia llama a preguntarlo.
    email: usuarioFinal,
    usuario: usuarioFinal,
    // Se deduce de la cuenta que QUEDÓ, no de lo que pidió el cliente: en un
    // reintento el cuerpo puede venir sin la marca y la cuenta ser igual de
    // interna. La verdad es el correo que tiene la cuenta.
    sin_correo: esCorreoInterno(usuarioFinal),
    // A qué bandeja salió el correo: con un alumno sin buzón no es la suya.
    correo_destino: correoDestino,
    ya_tenia_cuenta: yaTeniaCuenta,
    encargado_guardado: encargadoGuardado,
    // A quién quedó asignado; sin nadie, está sin profesor.
    asignado: !!profesorId,
    profesor_id: profesorId,
    // La cuenta pudo quedar creada y el correo no salir: se dice, en vez de
    // dejar una cuenta muda de la que nadie se entera.
    correo_enviado: correoEnviado,
    restantes, ilimitado,
  });
});
