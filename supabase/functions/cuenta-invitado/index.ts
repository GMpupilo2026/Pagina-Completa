// Edge Function: cuenta-invitado
//
// Las cuentas de invitado del Centroamericano 2026: cinco días de la Academia
// que la persona se abre SOLA desde centroamericano-2026.html, del 1 al 9 de
// noviembre, sin que intervenga quien administra (lo pidió el dueño del
// sitio). Es la prueba gratis de siempre (ver la cabecera de `prueba-gratis`)
// con otra puerta: un usuario del dominio sin buzón, nombre y contraseña, sin
// correo y sin tarjeta.
//
// VA CON `verify_jwt` EN FALSE: la llama alguien que todavía no tiene cuenta.
// Lo que la cuida, todo en la base y no en la página:
//   - `cuenta_invitado_frenar()` ANTES de crear nada: fuera del 1 al 9 de
//     noviembre (hora de Costa Rica) rechaza, y si no, pasa por el freno de
//     envíos públicos (tipo 'cuenta_evento': 20 por IP y 150 en total por
//     hora). La IP la lee esta función de SU petición y la manda: desde una
//     Edge Function, la base vería la de la función.
//   - `cuenta_invitado_activar()` DESPUÉS: vuelve a mirar las fechas, exige la
//     aceptación legal y que la cuenta sea de alumno y recién creada, y guarda
//     el vencimiento (5 días) en `pruebas_gratis` con su origen.
//   - El CORS solo deja llamarla desde el sitio.
//
// UNA CUENTA SIN SU FILA SERÍA ACCESO GRATIS PARA SIEMPRE
// Igual que la prueba: nace BLOQUEADA y solo se desbloquea después de que la
// base guardó su vencimiento. Si la activación falla, se borra; si hasta el
// borrado falla, queda bloqueada: nunca abierta.
//
// Ver «Las cuentas de invitado del Centroamericano» en
// docs/decisiones/cobros-acceso-y-tienda.md.

import { createClient } from "npm:@supabase/supabase-js@2";
import { DOMINIO_ALUMNO, problemaDeContrasena, usuarioLibre } from "./usuario-alumno.ts";

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

const FALLO = "No se pudo crear la cuenta. Intenta de nuevo en un momento.";

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
    return json({ error: "Escribe tu nombre: con él se arma tu usuario." }, 400);
  }
  // La misma regla de contraseña de las demás puertas (usuario-alumno.ts).
  const malaClave = problemaDeContrasena(contrasena);
  if (malaClave) return json({ error: malaClave + "." }, 400);
  if (!privacidad || !terminos) {
    return json({ error: "Para crear la cuenta hay que aceptar la Política de privacidad y los Términos." }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const ip = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ??
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0]).trim().slice(0, 64) || null;

  // Las fechas y el freno, antes de crear nada.
  const { data: freno, error: frenoError } = await admin.rpc("cuenta_invitado_frenar", { p_ip: ip });
  if (frenoError) return json({ error: FALLO }, 500);
  if (freno) return json({ error: String(freno) }, 429);

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
    user_metadata: { full_name: nombre, prueba_gratis: true, origen: "centroamericano-2026" },
  });
  if (crearError || !creado?.user) return json({ error: FALLO }, 500);
  const id = creado.user.id;

  const { data: vence, error: activarError } = await admin.rpc("cuenta_invitado_activar", {
    p_alumno: id, p_nombre: nombre, p_ip: ip, p_privacidad: privacidad, p_terminos: terminos,
  });
  if (activarError || !vence) {
    await admin.auth.admin.deleteUser(id);
    if (activarError?.code === "22023") {
      return json({ error: "Para crear la cuenta hay que aceptar la Política de privacidad y los Términos." }, 400);
    }
    // Fuera de fechas (42501 con su texto) o cualquier otra cosa.
    return json({ error: activarError?.code === "42501" && /noviembre/.test(activarError.message) ? activarError.message : FALLO },
      activarError?.code === "42501" ? 403 : 500);
  }

  const { error: abrirError } = await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
  if (abrirError) {
    await admin.auth.admin.deleteUser(id);
    return json({ error: FALLO }, 500);
  }

  // El usuario se enseña SIN el dominio: es lo que se escribe para entrar. El
  // correo completo va aparte para que la página inicie sesión sola.
  return json({ ok: true, usuario: usuario.slice(0, -(DOMINIO_ALUMNO.length + 1)), correo: usuario, vence });
});
