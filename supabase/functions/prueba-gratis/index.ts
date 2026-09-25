// Edge Function: prueba-gratis
//
// Tres días de la Academia sin dar un correo. Quien quiere probar escribe su
// nombre y una contraseña en prueba-gratis.html; esta función le arma una
// cuenta de alumno con un USUARIO del dominio sin buzón (el mismo de los
// alumnos sin correo, ver usuario-alumno.ts) y la marca como prueba. La
// página inicia la sesión con ese usuario y esa contraseña, y le enseña el
// usuario para que pueda volver a entrar.
//
// EL CORTE LO HACE LA BASE, NO ESTA FUNCIÓN
// `prueba_gratis_activar()` guarda la fila de `pruebas_gratis` con su
// vencimiento (72 horas), y `acceso_vigente()` —la misma pregunta de las
// políticas restrictivas, los triggers y el candado de los cursos— le contesta
// false desde ese momento, esté encendido o no el interruptor del acceso. Nada
// tiene que correr el tercer día: la cuenta se cierra sola.
//
// UNA CUENTA SIN SU FILA DE PRUEBA SERÍA ACCESO GRATIS PARA SIEMPRE
// Mientras `acceso_config.exigido` esté apagado, un alumno sin paquete entra
// sin límite. Por eso la cuenta nace BLOQUEADA (ban) y solo se desbloquea
// después de que la base guardó su vencimiento. Si la activación falla, la
// cuenta se borra; y si hasta el borrado falla, queda bloqueada: nunca abierta.
//
// ES PÚBLICA (`verify_jwt` en false), CON FRENO
// Quien prueba no tiene cuenta todavía. Cada llamada es una cuenta nueva, así
// que pasa primero por `interno.frenar_envio_publico('prueba', …)` con la IP
// de la petición (3 por hora por IP, 40 por hora en total).

import { createClient } from "npm:@supabase/supabase-js@2";
import { DOMINIO_ALUMNO, usuarioLibre } from "./usuario-alumno.ts";

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

// La IP de quien pide, no la de la función: es la que cuenta el freno.
function ipDe(req: Request): string | null {
  const ip = req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0];
  return (ip || "").trim().slice(0, 64) || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: { nombre?: string; contrasena?: string; privacidad_version?: string; terminos_version?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo JSON inválido" }, 400);
  }

  const nombre = String(body.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const contrasena = String(body.contrasena ?? "");
  const privacidad = String(body.privacidad_version ?? "");
  const terminos = String(body.terminos_version ?? "");

  if ((nombre.match(/\p{L}/gu) || []).length < 2) {
    return json({ error: "Escribe tu nombre (con eso armamos tu usuario)." }, 400);
  }
  if (contrasena.length < 8 || contrasena.length > 72) {
    return json({ error: "La contraseña tiene que tener entre 8 y 72 caracteres." }, 400);
  }
  if (!privacidad || !terminos) {
    return json({ error: "Para empezar la prueba hace falta aceptar la Política de privacidad y los Términos." }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const ip = ipDe(req);

  // El freno va ANTES de crear nada: una prueba frenada no deja rastro.
  const { data: freno, error: frenoError } = await admin.rpc("prueba_gratis_frenar", { p_ip: ip });
  if (frenoError) return json({ error: "No se pudo empezar la prueba. Intenta de nuevo en un momento." }, 500);
  if (freno) return json({ error: freno }, 429);

  const tomado = async (correo: string) => {
    const { data } = await admin.from("profiles").select("id").ilike("email", correo).maybeSingle();
    return !!data;
  };
  const usuario = await usuarioLibre(nombre, tomado);
  if (!usuario) return json({ error: "No se pudo armar un usuario con ese nombre. Escríbelo con letras." }, 400);

  // Nace bloqueada: ver arriba.
  const { data: creado, error: crearError } = await admin.auth.admin.createUser({
    email: usuario,
    password: contrasena,
    email_confirm: true,
    ban_duration: "876000h",
    user_metadata: { full_name: nombre, prueba_gratis: true },
  });
  if (crearError || !creado?.user) {
    return json({ error: "No se pudo crear la cuenta de prueba. Intenta de nuevo en un momento." }, 500);
  }
  const id = creado.user.id;

  const { data: vence, error: activarError } = await admin.rpc("prueba_gratis_activar", {
    p_alumno: id, p_nombre: nombre, p_ip: ip, p_privacidad: privacidad, p_terminos: terminos,
  });
  if (activarError || !vence) {
    await admin.auth.admin.deleteUser(id);
    const legal = activarError?.code === "22023";
    return json({
      error: legal
        ? "Para empezar la prueba hace falta aceptar la Política de privacidad y los Términos."
        : "No se pudo empezar la prueba. Intenta de nuevo en un momento.",
    }, legal ? 400 : 500);
  }

  const { error: abrirError } = await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
  if (abrirError) {
    await admin.auth.admin.deleteUser(id);
    return json({ error: "No se pudo empezar la prueba. Intenta de nuevo en un momento." }, 500);
  }

  // El usuario se enseña SIN el dominio: es lo que se escribe para entrar.
  return json({ ok: true, usuario: usuario.slice(0, -(DOMINIO_ALUMNO.length + 1)), correo: usuario, vence });
});
