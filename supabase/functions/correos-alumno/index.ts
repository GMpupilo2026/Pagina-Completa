// Edge Function: correos-alumno
//
// Los correos de un alumno, todos en un solo lugar y corregibles por quien
// coordina. Son TRES cosas distintas que hasta ahora se tocaban en tres
// pantallas —o no se tocaban en ninguna—:
//
//   1. con qué entra          -> profiles.email + auth.users.email
//   2. a dónde va el informe  -> encargados (uno o varios)
//   3. a dónde va el cobro    -> cobros_contacto, y si no hay, lo de arriba
//
// POR QUÉ HACE FALTA UNA FUNCIÓN Y NO ALCANZA CON LA RLS
// Cada uno está cerrado por una razón distinta, y las tres son buenas:
//   · `profiles.email` lo revierte el trigger `protect_profiles_identity_columns`
//     —el correo es la llave con la que se inicia sesión, no un campo más— y
//     además hay que cambiarlo en `auth.users`, que desde el navegador no se
//     toca. Cuidado con esto: el trigger solo revierte cuando `auth.uid()` no
//     es nulo, así que hay que escribir con la service role; hacerlo con el
//     cliente que lleva el JWT "funciona" y el valor queda como estaba, sin
//     dar ningún error. Por eso más abajo se vuelve a leer la fila.
//   · `encargados` pide `soy_profesor_de()`, así que quien coordina sin ser
//     profesor de ese alumno no podía corregir ni una letra.
//   · `cobros_contacto` sí es de coordinación, pero se maneja junto a los
//     otros dos porque la pregunta de quien está corrigiendo es una sola:
//     "¿a dónde le estamos escribiendo a esta familia?".
//
// QUIÉN PUEDE. `soy_coordinador()` primero, y después la fila del alumno se
// lee con un cliente que lleva el JWT de quien llama: si la RLS de `profiles`
// no se la devuelve, ese alumno no es suyo. Es la misma regla de
// `reenviar-acceso` y del "Enviar ahora" de Informes a la casa — una regla
// menos escrita dos veces.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { esCorreoInterno, usuarioLibre } from "./usuario-alumno.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";

// La misma forma que exige el CHECK de `encargados.email` en la base.
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const FRECUENCIAS = new Set(["diario", "semanal", "mensual", "anual"]);

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

function texto(v: unknown, tope: number) {
  const t = String(v ?? "").trim().slice(0, tope);
  return t || null;
}

/** Los tres correos de un alumno, tal como están ahora. */
async function retrato(admin: SupabaseClient, alumnoId: string, perfil: Record<string, unknown>) {
  const [{ data: encargados }, { data: cobro }] = await Promise.all([
    admin.from("encargados")
      .select("id, nombre, email, frecuencia, activo, ultimo_envio_at")
      .eq("student_id", alumnoId).order("created_at"),
    admin.from("cobros_contacto")
      .select("email, nombre, nota, actualizado_at").eq("student_id", alumnoId).maybeSingle(),
  ]);
  const { data: correoCobro } = await admin.rpc("correo_cobro", { p_alumno: alumnoId });
  return {
    alumno: { id: alumnoId, nombre: perfil.full_name ?? null },
    cuenta: {
      email: perfil.email,
      // Con un usuario de la academia no hay buzón: lo que el sitio le escribe
      // a esa familia va al correo de quien la tenga encargada.
      es_usuario: esCorreoInterno(String(perfil.email ?? "")),
    },
    encargados: encargados ?? [],
    // El correo fijado a mano, si lo hay, y el que de verdad va a recibir el
    // aviso de cobro — que puede ser otro. Enseñar solo el primero dejaría a
    // quien corrige adivinando qué pasa cuando no hay ninguno.
    cobro: cobro ?? null,
    correo_cobro_efectivo: correoCobro ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Falta token de autorización" }, 401);

  const comoQuienLlama = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userError } = await comoQuienLlama.auth.getUser(jwt);
  if (userError || !userData?.user) return json({ error: "Token inválido" }, 401);

  // Corregir los correos lo hace quien tiene la función de cuentas o la de
  // cobros: la ficha de contacto de Cobros pasa por aquí también.
  const [{ data: cuentas }, { data: cobros }] = await Promise.all([
    comoQuienLlama.rpc("coordinador_puede", { p_funcion: "cuentas" }),
    comoQuienLlama.rpc("coordinador_puede", { p_funcion: "cobros" }),
  ]);
  if (!cuentas && !cobros) {
    return json({ error: "Corregir correos no está entre tus funciones de coordinación" }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Cuerpo JSON inválido" }, 400); }

  const accion = String(body.action ?? "");
  const alumnoId = String(body.alumno_id ?? "").trim();
  if (!alumnoId) return json({ error: "Falta el alumno" }, 400);

  // La RLS decide si este alumno es suyo: quien administra ve a cualquiera,
  // quien coordina solo a los que tiene asignados. Sin fila no hay permiso.
  const { data: alumno, error: alumnoError } = await comoQuienLlama
    .from("profiles").select("id, email, full_name, role").eq("id", alumnoId).maybeSingle();
  if (alumnoError) return json({ error: "No se pudo leer ese alumno" }, 500);
  if (!alumno) return json({ error: "Ese alumno no es tuyo" }, 403);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ------------------------------------------------------------------ ver
  if (accion === "ver") {
    return json({ ok: true, ...(await retrato(admin, alumnoId, alumno)) });
  }

  // ------------------------------------------- con qué entra a la Academia
  if (accion === "cuenta") {
    if (alumno.role !== "alumno") {
      return json({ error: "Esto es para corregir el correo de un alumno, no el de una cuenta del equipo docente" }, 400);
    }
    const sinCorreo = body.sin_correo === true;
    let nuevo = String(body.email ?? "").trim().toLowerCase();

    if (sinCorreo) {
      // Pasarlo a usuario de la academia. El desempate lo hace SIEMPRE el
      // servidor, aunque venga propuesto desde la pantalla: entre que se
      // propuso y que se apretó el botón pudo entrar otro alumno con el
      // mismo nombre, y entonces lo que se enseñó no sería lo guardado.
      const tomado = async (correo: string) => {
        const { data } = await admin.from("profiles").select("id").ilike("email", correo)
          .neq("id", alumnoId).maybeSingle();
        return !!data;
      };
      const usuario = await usuarioLibre(String(body.usuario ?? "") || alumno.full_name, tomado);
      if (!usuario) return json({ error: "No se pudo armar un usuario con ese nombre. Escribe uno a mano." }, 400);
      nuevo = usuario;
      // Sin buzón propio, si no hay a quién escribirle la cuenta queda muda:
      // ningún informe, ningún aviso de cobro y ninguna forma de recuperar la
      // contraseña. Eso no da ningún error y no se entera nadie.
      // Solo cuentan los encargados: correo_de_contacto() devolvería el correo
      // que la cuenta tiene AHORA —justo el que se le está quitando—, y con eso
      // la comprobación pasaba siempre en el caso de todos los días.
      const { data: yaHay } = await admin.from("encargados").select("id")
        .eq("student_id", alumnoId).eq("activo", true).limit(1);
      if (!yaHay?.length) {
        return json({
          error: "Sin correo propio hace falta el de la casa: apunta primero a la persona encargada, " +
                 "o esta cuenta se queda sin ninguna forma de recibir nada.",
        }, 400);
      }
    } else {
      if (!CORREO.test(nuevo)) return json({ error: "Eso no parece un correo" }, 400);
      if (esCorreoInterno(nuevo)) {
        return json({
          error: "Ese es un usuario de la Academia, no un correo. Para darle un usuario, " +
                 "marca «No tiene correo propio».",
        }, 400);
      }
      const { data: otro } = await admin.from("profiles").select("id, full_name")
        .ilike("email", nuevo).neq("id", alumnoId).maybeSingle();
      if (otro) {
        return json({
          error: `Ese correo ya es de otra cuenta (${otro.full_name || "sin nombre"}). ` +
                 "Dos cuentas no pueden compartir correo: si son hermanos, usa «No tiene correo propio».",
        }, 409);
      }
    }

    if (nuevo === String(alumno.email ?? "").toLowerCase()) {
      return json({ ok: true, sin_cambios: true, ...(await retrato(admin, alumnoId, alumno)) });
    }

    const { error: authError } = await admin.auth.admin.updateUserById(alumnoId, {
      email: nuevo, email_confirm: true,
    });
    if (authError) return json({ error: "No se pudo cambiar el correo de la cuenta: " + authError.message }, 400);

    const { error: perfilError } = await admin.from("profiles").update({ email: nuevo }).eq("id", alumnoId);
    if (perfilError) return json({ error: "El correo cambió en la cuenta pero no en el perfil: " + perfilError.message }, 500);

    // Se vuelve a leer, y no por gusto: el trigger de identidad revierte esta
    // columna sin decir nada cuando quien escribe lleva sesión de persona. Si
    // algún día esta función dejara de usar la service role, el cambio se
    // desharía y la pantalla diría "listo" igual.
    const { data: quedo } = await admin.from("profiles").select("id, email, full_name, role")
      .eq("id", alumnoId).maybeSingle();
    if (!quedo || String(quedo.email).toLowerCase() !== nuevo) {
      return json({ error: "El correo no quedó guardado en el perfil. No se cambió nada." }, 500);
    }
    return json({ ok: true, cambiado: nuevo, ...(await retrato(admin, alumnoId, quedo)) });
  }

  // ------------------------------------------ a dónde va el informe a casa
  if (accion === "encargado_guardar") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!CORREO.test(email)) return json({ error: "Eso no parece un correo" }, 400);
    if (esCorreoInterno(email)) {
      return json({ error: "El correo de la casa tiene que ser uno que reciba correo de verdad" }, 400);
    }
    const fila = {
      student_id: alumnoId,
      nombre: texto(body.nombre, 120),
      email,
      frecuencia: FRECUENCIAS.has(String(body.frecuencia)) ? String(body.frecuencia) : "semanal",
      activo: body.activo === false ? false : true,
    };
    const id = String(body.encargado_id ?? "").trim();
    // Corregir el correo de quien ya estaba apuntado es un UPDATE sobre su
    // fila, no un alta: de otra forma quedarían los dos, el bueno y el que
    // tenía la letra mal, y a ese le seguirían saliendo los informes.
    const { error } = id
      ? await admin.from("encargados").update(fila).eq("id", id).eq("student_id", alumnoId)
      : await admin.from("encargados").upsert({ ...fila, creado_por: userData.user.id },
                                              { onConflict: "student_id,email" });
    if (error) return json({ error: "No se pudo guardar: " + error.message }, 400);
    return json({ ok: true, ...(await retrato(admin, alumnoId, alumno)) });
  }

  if (accion === "encargado_quitar") {
    const id = String(body.encargado_id ?? "").trim();
    if (!id) return json({ error: "Falta cuál" }, 400);
    const { error } = await admin.from("encargados").delete().eq("id", id).eq("student_id", alumnoId);
    if (error) return json({ error: "No se pudo quitar: " + error.message }, 400);
    return json({ ok: true, ...(await retrato(admin, alumnoId, alumno)) });
  }

  // ------------------------------------------------ a dónde va el cobro
  if (accion === "cobro_guardar") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!CORREO.test(email)) return json({ error: "Eso no parece un correo" }, 400);
    if (esCorreoInterno(email)) {
      return json({ error: "Ese es un usuario de la Academia: ahí no llega ningún correo" }, 400);
    }
    const { error } = await admin.from("cobros_contacto").upsert({
      student_id: alumnoId, email, nombre: texto(body.nombre, 120), nota: texto(body.nota, 300),
      actualizado_por: userData.user.id,
    }, { onConflict: "student_id" });
    if (error) return json({ error: "No se pudo guardar: " + error.message }, 400);
    return json({ ok: true, ...(await retrato(admin, alumnoId, alumno)) });
  }

  if (accion === "cobro_quitar") {
    const { error } = await admin.from("cobros_contacto").delete().eq("student_id", alumnoId);
    if (error) return json({ error: "No se pudo quitar: " + error.message }, 400);
    return json({ ok: true, ...(await retrato(admin, alumnoId, alumno)) });
  }

  return json({ error: "Acción desconocida" }, 400);
});
