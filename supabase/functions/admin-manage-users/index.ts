// Edge Function: admin-manage-users
// Todas las acciones del panel de administración (crear, editar, borrar
// usuarios, asignar alumnos a profesores, fijar su cupo de invitaciones y
// transferir el rol de administrador) pasan por aquí. El panel nunca escribe
// directo a "profiles" para estos cambios: aquí se verifica con la sesión
// real de quien llama (no solo confiar en el navegador) que sea la persona
// administradora antes de usar la service role key.
//
// Acciones (body.action):
//   "create"          { email, full_name, role, grupo?, teacher_ids?[], invitaciones_max?,
//                       usuario?, contrasena?, valida_hasta?, detalle? }
//   "update"          { target_id, full_name?, role?, is_admin?, grupo?,
//                       invitaciones_max?, reset_invitaciones? }
//   "set_teachers"    { target_id, teacher_ids: [] }  -> deja EXACTAMENTE esos
//   "assign_bulk"     { target_ids: [], teacher_id, modo }  -> agregar|reemplazar|quitar
//   "delete"          { target_id }
//   "reset_password"  { target_id }
//   "approve_request" { solicitud_id, teacher_id?, grupo? }  -> is_admin O coordinador
//   "reject_request"  { solicitud_id }                       -> is_admin O coordinador
//   "equipo_create"        { nombre }
//   "equipo_rename"        { equipo_id, nombre }
//   "equipo_delete"        { equipo_id }
//   "equipo_set_alumnos"      { equipo_id, alumno_ids: [] }   -> deja EXACTAMENTE esos
//   "equipo_set_entrenadores" { equipo_id, teacher_ids: [] }  -> deja EXACTAMENTE esos
//
// UN ALUMNO PUEDE TENER VARIOS PROFESORES. La relación vive en la tabla
// profile_teachers, que es la que hace cumplir la RLS; profiles.teacher_id se
// quedó solo con el papel de "profesor principal" (el que viene preseleccionado
// cuando el alumno entra a clase) y lo mantiene solo un trigger de esa tabla,
// así que aquí NO se escribe a mano: se escribe en profile_teachers y listo.
//
// "grupo" es un texto libre (equipo/subgrupo) puramente organizativo, sin
// efecto en permisos — solo para ordenar la lista en el panel. "assign_bulk"
// existe para poder mover un grupo entero sin tocar fila por fila, que es como
// se reparten los alumnos en la práctica; su "modo" decide si se suma un
// profesor a los que ya tienen, si se reemplazan todos, o si se le quita.
//
// UN ALUMNO PUEDE ESTAR EN VARIOS EQUIPOS Y UN EQUIPO PUEDE TENER CUALQUIER
// CANTIDAD DE ENTRENADORES. "equipos" es un sistema aparte de "grupo": no es
// texto libre, es una entidad real (tablas equipos/equipo_alumnos/
// equipo_entrenadores) y SÍ tiene efecto en permisos — estar en un equipo con
// un entrenador le da a ese entrenador los mismos permisos que ya le da
// profile_teachers (lo resuelven profesores_de()/alumnos_de() en la base, no
// esta función). Igual que profile_teachers, esas tres tablas no tienen
// política de insert/update/delete: solo se escriben aquí, con la service
// role, y solo quien administra puede hacerlo — mismo nivel que "assign_bulk".
//
// "invitaciones_max" es cuántos alumnos nuevos puede invitar ese profesor por
// su cuenta desde la Academia. Lo gasta create-student con
// consumir_invitacion(); acá solo se fija el techo. Quien administra no tiene
// tope. "reset_invitaciones" pone el contador de usadas de vuelta en cero.
//
// "create" y "approve_request" mandan EL MISMO correo de bienvenida que
// create-student e inscribir-alumno (`invitarConBienvenida()` de
// invitacion-email.ts): la cuenta se crea confirmada con una contraseña
// provisional y el correo trae el usuario, esa contraseña y el PDF de
// instrucciones adaptadas. Hasta el 4 de octubre esto seguía con
// `inviteUserByEmail` —el enlace de Supabase, sin contraseña— y quien creaba
// una cuenta desde administración no recibía la contraseña provisional que ya
// les llegaba a las otras dos puertas. Si el correo no sale, la cuenta no se
// deshace: `correo_enviado: false` sube a la pantalla.
//
// "create" CON `contrasena` NO MANDA NINGÚN CORREO: quien administra crea la
// cuenta con un usuario de la Academia (`usuario`, o armado con el nombre) y
// la contraseña que eligió, y se los da él a la persona. Solo para alumnos: el
// usuario es del dominio sin buzón y esa contraseña no es provisional (se la
// dio en la mano). Es la misma salida que ya tienen las dos puertas de alta de
// create-student (ver «La contraseña se puede poner al crear la cuenta»).
//
// "create" CON `valida_hasta` (el último día que entra, «AAAA-MM-DD» de Costa
// Rica) deja la cuenta TEMPORAL en la misma llamada: `cuentas_temporales_fijar`
// con la sesión de quien llama, para que la anote como suya y la bitácora la
// registre. `detalle` es lo que la persona lee cuando se cierra. Partido en dos
// llamadas del navegador, una cuenta que debía cerrarse podía quedar abierta
// para siempre sin que nadie lo notara. Si fijar la fecha falla y no salió
// ningún correo, la cuenta se borra (se puede volver a crear igual); si ya
// salió la invitación, se dice en `temporal_error` y la cuenta queda.
//
// "approve_request"/"reject_request" atienden la bandeja de
// solicitudes_academia (alguien se anotó solo desde unirse.html). A
// diferencia de TODAS las demás acciones de aquí (solo is_admin), estas dos
// también las puede hacer quien coordina (es_coordinador) — mismo criterio
// que ya usan "Formularios de inscripción" y "Cobros de la Academia" en
// clases.html. Aprobar reutiliza el mismo invitarYCompletarPerfil() que usa
// "create"; rechazar no borra la fila (queda como historial, con quién la
// revisó y qué plan eligió después) y manda un correo aparte invitando a
// elegir un plan pago en elegir-plan.html.
//
// LO DEMÁS QUE HACE QUIEN COORDINA NO PASA POR ACÁ, a propósito: corregirle
// el nombre o el grupo a una de sus cuentas y repartir sus alumnos entre sus
// profesores van por `coord_guardar_cuenta()` y `coord_set_profesores()`, dos
// funciones de la base. Es el mismo camino que ya tomaron `cambiar_rol()` y
// `set_profesores_del_coordinador()`: el alcance de la coordinación vive en
// SQL, junto a las políticas que lo definen, y no repartido entre la base y
// una Edge Function que tendría que volver a preguntar lo mismo.

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendInvitacionPlan } from "./instrucciones-email.ts";
import { invitarConBienvenida } from "./invitacion-email.ts";
import { crearConContrasena, esCorreoInterno, problemaDeContrasena, usuarioLibre } from "./usuario-alumno.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";
const ROLES_VALIDOS = ["profesor", "alumno"];
const MAX_INVITACIONES = 1000;   // techo de cordura, no una regla de negocio
const MAX_EN_LOTE = 300;
const MAX_PROFESORES = 10;       // por alumno; más que eso es un error de dedo
const MAX_ENTRENADORES_POR_EQUIPO = 30; // techo de cordura, no un límite real
const MAX_ALUMNOS_POR_EQUIPO = 300;
const MAX_NOMBRE_EQUIPO = 120;
const MAX_ANIOS_TEMPORAL = 5;    // una cuenta "temporal" de más es un error de dedo

// «AAAA-MM-DD» + n días, pura cuenta de calendario.
function sumarDias(dia: string, n: number) {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);   // calendario en UTC
}
const hoyCR = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });

// El último día que entra → el instante en que se cierra: la medianoche de
// Costa Rica (UTC-6, sin horario de verano) del día siguiente. Es la forma en
// que ya se guardan las cuentas temporales: «se cierra el 20 de diciembre» es
// 2026-12-20 00:00 de Costa Rica.
function validarValidez(valor: unknown) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || sumarDias(valor, 0) !== valor) {
    return { ok: false as const, error: "La fecha hasta la que vale la cuenta no es una fecha" };
  }
  const hoy = hoyCR();
  if (valor < hoy) return { ok: false as const, error: "La fecha hasta la que vale la cuenta ya pasó" };
  if (valor > sumarDias(hoy, 366 * MAX_ANIOS_TEMPORAL)) {
    return { ok: false as const, error: `Una cuenta temporal vale como mucho ${MAX_ANIOS_TEMPORAL} años` };
  }
  return { ok: true as const, vence: `${sumarDias(valor, 1)}T00:00:00-06:00` };
}

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

type Cliente = ReturnType<typeof createClient>;

// Confirma que cada id apunta a una cuenta que existe y tiene el rol pedido —
// así el panel no puede dejar a alguien "asignado" a una cuenta que en
// realidad es de otro rol o que no existe. Devuelve la lista sin repetidos.
async function validarCuentas(adminClient: Cliente, valor: unknown, rol: "profesor" | "alumno", tope: number, etiqueta: string) {
  const bruta = Array.isArray(valor) ? valor : (valor === null || valor === undefined || valor === "" ? [] : [valor]);
  const ids = [...new Set(bruta.filter((x) => typeof x === "string" && x))] as string[];
  if (!ids.length) return { ok: true as const, value: [] as string[] };
  if (ids.length > tope) return { ok: false as const, error: `Demasiados ${etiqueta} de una vez (máximo ${tope})` };
  const { data, error } = await adminClient.from("profiles").select("id, role").in("id", ids);
  if (error) return { ok: false as const, error: error.message };
  const encontrados = new Map((data ?? []).map((p) => [p.id as string, p.role as string]));
  for (const id of ids) {
    if (!encontrados.has(id)) return { ok: false as const, error: "No se encontró esa cuenta" };
    if (encontrados.get(id) !== rol) return { ok: false as const, error: `Solo se puede asignar a cuentas con rol de ${rol}` };
  }
  return { ok: true as const, value: ids };
}

async function validarProfesores(adminClient: Cliente, valor: unknown) {
  return validarCuentas(adminClient, valor, "profesor", MAX_PROFESORES, "profesores");
}

// Deja al alumno con EXACTAMENTE esos profesores: quita los que sobran y suma
// los que faltan. El trigger de profile_teachers se encarga del principal.
async function ponerProfesores(adminClient: Cliente, alumnoId: string, profesores: string[]) {
  if (profesores.includes(alumnoId)) return { error: "Un alumno no puede ser su propio profesor" };
  const { error: borrar } = profesores.length
    ? await adminClient.from("profile_teachers").delete()
        .eq("student_id", alumnoId).not("teacher_id", "in", `(${profesores.join(",")})`)
    : await adminClient.from("profile_teachers").delete().eq("student_id", alumnoId);
  if (borrar) return { error: borrar.message };
  if (profesores.length) {
    const { error } = await adminClient.from("profile_teachers")
      .upsert(profesores.map((t) => ({ student_id: alumnoId, teacher_id: t })), { onConflict: "student_id,teacher_id" });
    if (error) return { error: error.message };
  }
  return {};
}

// Deja una fila de un equipo (equipo_alumnos o equipo_entrenadores) con
// EXACTAMENTE los ids que se mandan: mismo patrón que ponerProfesores, para
// no repetir la lógica de "borrar lo que sobra, upsert lo que falta" una
// tercera vez.
async function ponerEnEquipo(
  adminClient: Cliente,
  tabla: "equipo_alumnos" | "equipo_entrenadores",
  columna: "alumno_id" | "teacher_id",
  equipoId: string,
  ids: string[],
) {
  const { error: borrar } = ids.length
    ? await adminClient.from(tabla).delete()
        .eq("equipo_id", equipoId).not(columna, "in", `(${ids.join(",")})`)
    : await adminClient.from(tabla).delete().eq("equipo_id", equipoId);
  if (borrar) return { error: borrar.message };
  if (ids.length) {
    const { error } = await adminClient.from(tabla)
      .upsert(ids.map((id) => ({ equipo_id: equipoId, [columna]: id })), { onConflict: `equipo_id,${columna}` });
    if (error) return { error: error.message };
  }
  return {};
}

// El cupo es un entero entre 0 y MAX_INVITACIONES. 0 = no puede invitar.
function validarCupo(valor: unknown) {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, error: "El cupo de invitaciones debe ser un número entero" };
  if (n < 0 || n > MAX_INVITACIONES) return { ok: false, error: `El cupo debe estar entre 0 y ${MAX_INVITACIONES}` };
  return { ok: true, value: n };
}

// Crea la cuenta con su correo de bienvenida (usuario y contraseña
// provisional, ver la cabecera) y completa el perfil que deja el trigger
// on_auth_user_created (rol "alumno" por defecto). Lo usan "create" y
// "approve_request". Devuelve { userId, email, correoEnviado } o { error }.
async function invitarYCompletarPerfil(adminClient: Cliente, opts: {
  email: string; full_name: string; role: string; grupo: string;
  cupo: number | null; teacherIds: string[];
}) {
  const { email, full_name, role, grupo, cupo, teacherIds } = opts;
  // deno-lint-ignore no-explicit-any
  const invitacion = await invitarConBienvenida(adminClient as any, email, full_name || null);
  const user = invitacion.user;
  if (invitacion.error || !user) {
    return { error: invitacion.error ?? "No se pudo invitar a la persona" };
  }

  // El registro en "profiles" lo crea el trigger on_auth_user_created con
  // rol "alumno" por defecto; se completa aquí con la service role (el
  // trigger de protección de columnas no aplica: auth.uid() es null aquí).
  const updates: Record<string, unknown> = {};
  if (full_name) updates.full_name = full_name;
  if (role !== "alumno") updates.role = role;
  if (grupo) updates.grupo = grupo;
  if (cupo !== null) updates.invitaciones_max = cupo;
  if (Object.keys(updates).length) {
    await adminClient.from("profiles").update(updates).eq("id", user.id);
  }
  if (teacherIds.length && role === "alumno") {
    const r = await ponerProfesores(adminClient, user.id, teacherIds);
    if (r.error) return { error: r.error };
  }

  return {
    userId: user.id as string,
    email: (user.email ?? email) as string,
    correoEnviado: invitacion.correoEnviado,
  };
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

  // Cliente con la sesión de quien llama: para saber quién es de verdad.
  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return json({ error: "Token inválido" }, 401);
  }
  const callerId = userData.user.id;

  const { data: callerProfile, error: callerProfileError } = await callerClient
    .from("profiles")
    .select("is_admin, es_coordinador")
    .eq("id", callerId)
    .single();

  if (callerProfileError || !callerProfile) {
    return json({ error: "No se encontró tu perfil" }, 403);
  }
  const esAdmin = !!callerProfile.is_admin;
  const esCoordinador = !!callerProfile.es_coordinador || esAdmin;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo JSON inválido" }, 400);
  }

  const action = body.action;
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Solo estas dos acciones las puede hacer quien coordina; todo lo demás
  // (crear cuentas sueltas, borrar, transferir admin, equipos, etc.) sigue
  // siendo exclusivo de is_admin, como siempre.
  const ACCIONES_COORDINADOR = ["approve_request", "reject_request"];
  const permitido = ACCIONES_COORDINADOR.includes(String(action)) ? esCoordinador : esAdmin;
  if (!permitido) {
    return json({ error: "Solo la persona administradora puede hacer esto" }, 403);
  }

  if (action === "create") {
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const full_name = typeof body.full_name === "string" ? body.full_name.trim() : "";
    const role = typeof body.role === "string" ? body.role : "alumno";
    const grupo = typeof body.grupo === "string" ? body.grupo.trim() : "";
    // Vacía es lo mismo que no mandarla: se invita por correo como siempre.
    const clave = typeof body.contrasena === "string" && body.contrasena !== "" ? body.contrasena : null;
    const usuarioPedido = typeof body.usuario === "string" ? body.usuario.trim() : "";
    const conFecha = typeof body.valida_hasta === "string" && body.valida_hasta !== "";
    const detalle = typeof body.detalle === "string" ? body.detalle.trim() : "";
    if (!ROLES_VALIDOS.includes(role)) return json({ error: "Rol inválido" }, 400);

    if (clave !== null) {
      // El usuario de la Academia es de alumno (el dominio sin buzón, y todo
      // lo que se le escribe va a la casa), y una contraseña con correo propio
      // es de esa persona: la recibe provisional por correo.
      if (role !== "alumno") return json({ error: "Usuario y contraseña es solo para una cuenta de estudiante" }, 400);
      if (email) return json({ error: "Con usuario y contraseña no se pone correo: la persona entra con su usuario" }, 400);
      const problema = problemaDeContrasena(clave);
      if (problema) return json({ error: problema }, 400);
      if (!usuarioPedido && !full_name) return json({ error: "Para armarle un usuario hace falta su nombre, o escribe el usuario" }, 400);
    } else {
      if (!email) return json({ error: "email es requerido" }, 400);
      if (esCorreoInterno(email)) {
        return json({ error: "Ese es un usuario de la Academia, no un correo. Para darle un usuario, elige «Usuario y contraseña»." }, 400);
      }
    }

    let vence: string | null = null;
    if (conFecha) {
      // El corte de acceso_vigente() solo alcanza a los alumnos: una fecha a
      // un profesor sería una promesa falsa.
      if (role !== "alumno") return json({ error: "Solo una cuenta de estudiante puede tener fecha de cierre" }, 400);
      const v = validarValidez(body.valida_hasta);
      if (!v.ok) return json({ error: v.error }, 400);
      if (detalle.length < 2 || detalle.length > 120) {
        return json({ error: "Di para qué es la cuenta (por ejemplo, el taller): es lo que la persona lee cuando se cierra" }, 400);
      }
      vence = v.vence;
    }

    // Se sigue aceptando teacher_id suelto por comodidad; internamente es una
    // lista de uno.
    const profes = await validarProfesores(adminClient, "teacher_ids" in body ? body.teacher_ids : body.teacher_id);
    if (!profes.ok) return json({ error: profes.error }, 400);

    let cupo: number | null = null;
    if ("invitaciones_max" in body && body.invitaciones_max !== null && body.invitaciones_max !== "") {
      if (role !== "profesor") return json({ error: "El cupo de invitaciones solo aplica a un profesor" }, 400);
      const c = validarCupo(body.invitaciones_max);
      if (!c.ok) return json({ error: c.error }, 400);
      cupo = c.value as number;
    }

    let r: { userId?: string; email?: string; correoEnviado?: boolean | null; error?: string };
    if (clave !== null) {
      // El desempate lo hace siempre el servidor, aunque el usuario venga
      // escrito: dos «José Rodríguez» no son ninguna rareza. Lo que la pantalla
      // enseña al final es el que devuelve esto.
      const tomado = async (correo: string) => {
        const { data } = await adminClient.from("profiles").select("id").ilike("email", correo).maybeSingle();
        return !!data;
      };
      const usuario = await usuarioLibre(usuarioPedido || full_name, tomado);
      if (!usuario) return json({ error: "No se pudo armar un usuario con eso. Escribe otro." }, 400);
      // deno-lint-ignore no-explicit-any
      const creada = await crearConContrasena(adminClient as any, usuario, clave, full_name || null);
      if (creada.error || !creada.user) return json({ error: creada.error ?? "No se pudo crear la cuenta" }, 400);
      const updates: Record<string, unknown> = {};
      if (full_name) updates.full_name = full_name;
      if (grupo) updates.grupo = grupo;
      if (Object.keys(updates).length) await adminClient.from("profiles").update(updates).eq("id", creada.user.id);
      if (profes.value.length) {
        const p = await ponerProfesores(adminClient, creada.user.id, profes.value);
        if (p.error) {
          await adminClient.auth.admin.deleteUser(creada.user.id);
          return json({ error: p.error }, 400);
        }
      }
      r = { userId: creada.user.id, email: usuario, correoEnviado: null };
    } else {
      r = await invitarYCompletarPerfil(adminClient, { email, full_name, role, grupo, cupo, teacherIds: profes.value });
      if (r.error) return json({ error: r.error }, 400);
    }

    let temporalError: string | null = null;
    if (vence) {
      // Con la sesión de quien llama: la función exige que administre y anota
      // quién la fijó.
      const { error: tErr } = await callerClient.rpc("cuentas_temporales_fijar", {
        p_personas: [r.userId], p_vence: vence, p_detalle: detalle,
      });
      if (tErr) {
        if (clave !== null) {
          // No salió ningún correo: nadie conoce todavía esta cuenta, así que
          // se deshace en vez de dejarla abierta para siempre.
          await adminClient.auth.admin.deleteUser(r.userId!);
          return json({ error: "No se pudo poner la fecha de cierre, así que la cuenta no se creó: " + tErr.message }, 400);
        }
        temporalError = tErr.message;
      }
    }

    return json({
      ok: true, user_id: r.userId, email: r.email, correo_enviado: r.correoEnviado,
      // Con la contraseña puesta: no salió correo y la pantalla enseña el
      // usuario y la contraseña para dárselos a la persona.
      con_contrasena: clave !== null,
      usuario: clave !== null ? r.email : null,
      vence: vence && !temporalError ? vence : null,
      temporal_error: temporalError,
    });
  }

  if (action === "update") {
    const targetId = typeof body.target_id === "string" ? body.target_id : "";
    if (!targetId) return json({ error: "target_id es requerido" }, 400);

    const updates: Record<string, unknown> = {};
    if (typeof body.full_name === "string") updates.full_name = body.full_name.trim();
    if (typeof body.role === "string") {
      if (!ROLES_VALIDOS.includes(body.role)) return json({ error: "Rol inválido" }, 400);
      updates.role = body.role;
    }
    if (typeof body.grupo === "string") updates.grupo = body.grupo.trim() || null;
    if ("invitaciones_max" in body) {
      const c = validarCupo(body.invitaciones_max);
      if (!c.ok) return json({ error: c.error }, 400);
      updates.invitaciones_max = c.value;
    }
    // Volver a poner el contador en cero: sirve para "renovarle" el cupo a un
    // profesor sin tener que subirle el techo cada vez.
    if (body.reset_invitaciones === true) updates.invitaciones_usadas = 0;

    // Bajar a alumno a quien todavía tiene alumnos se rechaza, CON EL NÚMERO,
    // como en cambiar_rol(): sus filas de profile_teachers y de
    // equipo_entrenadores seguirían dándole acceso a esos alumnos —informes,
    // notas, tareas— aunque ya no tenga rol de profesor.
    if (updates.role === "alumno") {
      const [{ count: directos }, { count: equipos }] = await Promise.all([
        adminClient.from("profile_teachers").select("student_id", { count: "exact", head: true }).eq("teacher_id", targetId),
        adminClient.from("equipo_entrenadores").select("equipo_id", { count: "exact", head: true }).eq("teacher_id", targetId),
      ]);
      if ((directos ?? 0) > 0 || (equipos ?? 0) > 0) {
        return json({
          error: `Todavía tiene ${directos ?? 0} alumno(s) asignado(s) y es entrenador en ${equipos ?? 0} equipo(s). ` +
                 "Reasígnalos antes de pasarlo a alumno.",
        }, 400);
      }
    }

    if (Object.keys(updates).length) {
      const { error } = await adminClient.from("profiles").update(updates).eq("id", targetId);
      if (error) return json({ error: error.message }, 400);
    }

    // Al dejar de ser alumno, deja de tener profesores: si no, la fila
    // quedaría colgada dándole permisos a alguien sobre una cuenta que ya no
    // es su alumna.
    if (updates.role === "profesor") {
      await adminClient.from("profile_teachers").delete().eq("student_id", targetId);
    }

    // Transferir el rol de administrador es aparte y solo hacia OTRA cuenta:
    // nunca se acepta este cambio sobre la propia fila de quien llama, para
    // que nadie se quite el acceso al panel sin querer y se quede afuera.
    if (typeof body.is_admin === "boolean") {
      if (targetId === callerId) {
        return json({ error: "No puedes cambiar tu propio estado de administrador desde aquí — transfiérelo a otra cuenta." }, 400);
      }
      if (body.is_admin === true) {
        // Solo puede haber una persona administradora: primero se le quita a
        // quien la tenga, después se le da a la nueva (en ese orden, para no
        // chocar nunca con la restricción de unicidad de la base de datos).
        const { error: demoteError } = await adminClient.from("profiles").update({ is_admin: false }).eq("is_admin", true);
        if (demoteError) return json({ error: demoteError.message }, 400);
        const { error: promoteError } = await adminClient.from("profiles").update({ is_admin: true }).eq("id", targetId);
        if (promoteError) return json({ error: promoteError.message }, 400);
      } else {
        const { error } = await adminClient.from("profiles").update({ is_admin: false }).eq("id", targetId);
        if (error) return json({ error: error.message }, 400);
      }
    }

    return json({ ok: true });
  }

  // Los profesores de UN alumno, tal cual quedaron en la lista que manda el
  // panel: lo que no esté, se quita.
  if (action === "set_teachers") {
    const targetId = typeof body.target_id === "string" ? body.target_id : "";
    if (!targetId) return json({ error: "target_id es requerido" }, 400);

    const { data: alumno, error: leerError } = await adminClient
      .from("profiles").select("role").eq("id", targetId).single();
    if (leerError || !alumno) return json({ error: "No se encontró esa cuenta" }, 404);
    if (alumno.role !== "alumno") return json({ error: "Solo los alumnos tienen profesores asignados" }, 400);

    const profes = await validarProfesores(adminClient, body.teacher_ids);
    if (!profes.ok) return json({ error: profes.error }, 400);

    const r = await ponerProfesores(adminClient, targetId, profes.value);
    if (r.error) return json({ error: r.error }, 400);
    return json({ ok: true, profesores: profes.value });
  }

  // Varios alumnos de una sola vez (un grupo entero, o los que se marquen).
  // "agregar" suma ese profesor a los que ya tengan, "reemplazar" lo deja como
  // único, y "quitar" lo saca.
  if (action === "assign_bulk") {
    const ids = Array.isArray(body.target_ids) ? body.target_ids.filter((x) => typeof x === "string") as string[] : [];
    if (!ids.length) return json({ error: "No se marcó ningún alumno" }, 400);
    if (ids.length > MAX_EN_LOTE) return json({ error: `Demasiados de una vez (máximo ${MAX_EN_LOTE})` }, 400);

    const modo = typeof body.modo === "string" ? body.modo : "agregar";
    if (!["agregar", "reemplazar", "quitar"].includes(modo)) return json({ error: "Modo inválido" }, 400);

    const sinProfesor = body.teacher_id === null || body.teacher_id === undefined || body.teacher_id === "";
    if (sinProfesor && modo !== "reemplazar") {
      return json({ error: "Elige un profesor, o usa «reemplazar» para dejarlos sin ninguno" }, 400);
    }
    const profes = await validarProfesores(adminClient, body.teacher_id);
    if (!profes.ok) return json({ error: profes.error }, 400);
    const profesorId = profes.value[0] ?? null;
    if (profesorId && ids.includes(profesorId)) {
      return json({ error: "Un profesor no puede ser su propio profesor" }, 400);
    }

    // Solo alumnos: asignarle un "profesor" a otro profesor no significa nada
    // y rompería la lectura de la lista.
    const { data: objetivos, error: leerError } = await adminClient
      .from("profiles").select("id, role").in("id", ids);
    if (leerError) return json({ error: leerError.message }, 400);
    const alumnos = (objetivos ?? []).filter((p) => p.role === "alumno").map((p) => p.id as string);
    const saltados = ids.length - alumnos.length;
    if (!alumnos.length) return json({ error: "Ninguno de los marcados es alumno" }, 400);

    if (modo === "reemplazar") {
      const { error } = await adminClient.from("profile_teachers").delete().in("student_id", alumnos);
      if (error) return json({ error: error.message }, 400);
    }
    if (modo === "quitar") {
      const { error } = await adminClient.from("profile_teachers").delete()
        .in("student_id", alumnos).eq("teacher_id", profesorId);
      if (error) return json({ error: error.message }, 400);
    } else if (profesorId) {
      const { error } = await adminClient.from("profile_teachers")
        .upsert(alumnos.map((a) => ({ student_id: a, teacher_id: profesorId })), { onConflict: "student_id,teacher_id" });
      if (error) return json({ error: error.message }, 400);
    }

    return json({ ok: true, asignados: alumnos.length, saltados, modo });
  }

  if (action === "delete") {
    const targetId = typeof body.target_id === "string" ? body.target_id : "";
    if (!targetId) return json({ error: "target_id es requerido" }, 400);
    if (targetId === callerId) {
      return json({ error: "No puedes eliminar tu propia cuenta desde aquí." }, 400);
    }
    const { error } = await adminClient.auth.admin.deleteUser(targetId);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (action === "reset_password") {
    const targetId = typeof body.target_id === "string" ? body.target_id : "";
    if (!targetId) return json({ error: "target_id es requerido" }, 400);
    const { data: targetUser, error: getUserError } = await adminClient.auth.admin.getUserById(targetId);
    if (getUserError || !targetUser?.user?.email) {
      return json({ error: "No se encontró esa cuenta" }, 404);
    }
    // Un usuario de la academia no tiene buzón: el enlace saldría a la nada y
    // esto diría «enviado». Ese caso lo atiende `reenviar-acceso`, que lo
    // manda al correo de la casa.
    if (esCorreoInterno(targetUser.user.email)) {
      return json({ error: "Esa cuenta entra con usuario de la Academia: el enlace va al correo de su casa, por «reenviar-acceso»." }, 400);
    }
    const { error } = await adminClient.auth.resetPasswordForEmail(targetUser.user.email, {
      redirectTo: `${SITE_URL}/clases.html`,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, email: targetUser.user.email });
  }

  if (action === "approve_request") {
    const solicitudId = typeof body.solicitud_id === "string" ? body.solicitud_id : "";
    if (!solicitudId) return json({ error: "solicitud_id es requerido" }, 400);

    const { data: solicitud, error: leerError } = await adminClient
      .from("solicitudes_academia").select("*").eq("id", solicitudId).single();
    if (leerError || !solicitud) return json({ error: "No se encontró esa solicitud" }, 404);
    if (solicitud.estado !== "pendiente") return json({ error: "Esta solicitud ya fue revisada" }, 400);

    const grupo = typeof body.grupo === "string" ? body.grupo.trim() : (solicitud.edad_nivel ?? "");
    const profes = await validarProfesores(adminClient, body.teacher_id);
    if (!profes.ok) return json({ error: profes.error }, 400);

    const r = await invitarYCompletarPerfil(adminClient, {
      email: solicitud.email as string,
      full_name: solicitud.nombre as string,
      role: "alumno",
      grupo,
      cupo: null,
      teacherIds: profes.value,
    });
    if (r.error) return json({ error: r.error }, 400);

    const { error: updError } = await adminClient.from("solicitudes_academia")
      .update({ estado: "aprobada", revisado_por: callerId, revisado_en: new Date().toISOString() })
      .eq("id", solicitudId);
    if (updError) return json({ error: updError.message }, 400);

    return json({ ok: true, user_id: r.userId, email: r.email, correo_enviado: r.correoEnviado });
  }

  if (action === "reject_request") {
    const solicitudId = typeof body.solicitud_id === "string" ? body.solicitud_id : "";
    if (!solicitudId) return json({ error: "solicitud_id es requerido" }, 400);

    const { data: solicitud, error: leerError } = await adminClient
      .from("solicitudes_academia").select("*").eq("id", solicitudId).single();
    if (leerError || !solicitud) return json({ error: "No se encontró esa solicitud" }, 404);
    if (solicitud.estado !== "pendiente") return json({ error: "Esta solicitud ya fue revisada" }, 400);

    const { error: updError } = await adminClient.from("solicitudes_academia")
      .update({ estado: "rechazada", revisado_por: callerId, revisado_en: new Date().toISOString() })
      .eq("id", solicitudId);
    if (updError) return json({ error: updError.message }, 400);

    // No se deshace el rechazo si el correo falla: lo importante es que la
    // solicitud haya quedado marcada. Igual que el resto del archivo, se
    // avisa por consola y se sigue.
    await sendInvitacionPlan(solicitud.email as string, solicitud.nombre as string, solicitudId);

    return json({ ok: true });
  }

  if (action === "equipo_create") {
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) return json({ error: "El nombre del equipo es requerido" }, 400);
    if (nombre.length > MAX_NOMBRE_EQUIPO) return json({ error: `El nombre no puede pasar de ${MAX_NOMBRE_EQUIPO} caracteres` }, 400);
    const { data, error } = await adminClient.from("equipos")
      .insert({ nombre, created_by: callerId }).select("id, nombre").single();
    if (error) {
      if ((error as { code?: string }).code === "23505") return json({ error: "Ya existe un equipo con ese nombre" }, 400);
      return json({ error: error.message }, 400);
    }
    return json({ ok: true, equipo: data });
  }

  if (action === "equipo_rename") {
    const equipoId = typeof body.equipo_id === "string" ? body.equipo_id : "";
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    if (!equipoId) return json({ error: "equipo_id es requerido" }, 400);
    if (!nombre) return json({ error: "El nombre del equipo es requerido" }, 400);
    if (nombre.length > MAX_NOMBRE_EQUIPO) return json({ error: `El nombre no puede pasar de ${MAX_NOMBRE_EQUIPO} caracteres` }, 400);
    const { error } = await adminClient.from("equipos").update({ nombre }).eq("id", equipoId);
    if (error) {
      if ((error as { code?: string }).code === "23505") return json({ error: "Ya existe un equipo con ese nombre" }, 400);
      return json({ error: error.message }, 400);
    }
    return json({ ok: true });
  }

  if (action === "equipo_delete") {
    const equipoId = typeof body.equipo_id === "string" ? body.equipo_id : "";
    if (!equipoId) return json({ error: "equipo_id es requerido" }, 400);
    // Las dos tablas puente se borran solas (ON DELETE CASCADE).
    const { error } = await adminClient.from("equipos").delete().eq("id", equipoId);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  // Los alumnos de UN equipo, tal cual quedaron en la lista que manda el
  // panel: lo que no esté, se quita. Un alumno puede estar en varios equipos
  // a la vez — esto no toca sus OTROS equipos, solo este.
  if (action === "equipo_set_alumnos") {
    const equipoId = typeof body.equipo_id === "string" ? body.equipo_id : "";
    if (!equipoId) return json({ error: "equipo_id es requerido" }, 400);
    const alumnos = await validarCuentas(adminClient, body.alumno_ids, "alumno", MAX_ALUMNOS_POR_EQUIPO, "alumnos");
    if (!alumnos.ok) return json({ error: alumnos.error }, 400);
    const r = await ponerEnEquipo(adminClient, "equipo_alumnos", "alumno_id", equipoId, alumnos.value);
    if (r.error) return json({ error: r.error }, 400);
    return json({ ok: true, alumnos: alumnos.value });
  }

  // Los entrenadores de UN equipo: SIN límite de dos, ni de ningún número
  // chico — el único techo es MAX_ENTRENADORES_POR_EQUIPO, que es cordura
  // (evitar un error de dedo pegando una lista enorme), no una regla.
  if (action === "equipo_set_entrenadores") {
    const equipoId = typeof body.equipo_id === "string" ? body.equipo_id : "";
    if (!equipoId) return json({ error: "equipo_id es requerido" }, 400);
    const entrenadores = await validarCuentas(adminClient, body.teacher_ids, "profesor", MAX_ENTRENADORES_POR_EQUIPO, "entrenadores");
    if (!entrenadores.ok) return json({ error: entrenadores.error }, 400);
    const r = await ponerEnEquipo(adminClient, "equipo_entrenadores", "teacher_id", equipoId, entrenadores.value);
    if (r.error) return json({ error: r.error }, 400);
    return json({ ok: true, entrenadores: entrenadores.value });
  }

  return json({ error: "Acción desconocida" }, 400);
});
