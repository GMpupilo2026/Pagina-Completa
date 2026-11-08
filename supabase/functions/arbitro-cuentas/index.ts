// Edge Function: arbitro-cuentas
//
// Las cuentas de árbitro: una cuenta que solo usa herramientas de arbitraje,
// con usuario y contraseña (sin correo), que crea administración o un
// organizador (quien tiene una licencia propia) y a la que se le eligen las
// herramientas. Ver «Las cuentas de árbitro» en docs/decisiones/permisos-y-roles.md
// y la migración cuentas_arbitro.
//
// Acciones (POST, JSON):
//   "crear"      { nombre, usuario?, contrasena, herramientas[] }
//                → { arbitro_id, usuario, herramientas[] }
//   "contrasena" { arbitro_id, contrasena }   → { ok: true }
//
// QUIÉN DECIDE ES LA BASE. Todo permiso se le pregunta con el token de quien
// llama (así pasa por antes_de_cada_pedido(), la verificación en dos pasos):
//   - `arbitros_puedo_dar()`: vacío = no puede crear árbitros;
//   - `arbitro_herramientas_fijar()`: qué herramientas puede dar y a quién;
//   - `arbitros_mis()`: si el árbitro de «contrasena» es suyo.
// La clave de servicio se usa SOLO para lo que la base no deja hacer desde
// afuera: crear la cuenta en Auth, ponerle el rol 'arbitro' (el trigger de
// identidad no deja que nadie se cambie el rol) y anotarla en
// arbitros_cuentas (que no tiene política de escritura).
//
// LA CUENTA NACE ENTERA O NO NACE. Si después de crearla en Auth falla el
// perfil, la fila de arbitros_cuentas o las herramientas, se borra: una
// cuenta de árbitro sin dueño o con el rol de alumno sería una cuenta de
// alumno más, suelta en la Academia.
//
// verify_jwt en true.

import { createClient } from "npm:@supabase/supabase-js@2";
import { crearConContrasena, DOMINIO_ALUMNO, problemaDeContrasena, usuarioLibre } from "./usuario-alumno.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";

// Un organizador no arma un ejército: más de esto es un error o un abuso.
const TOPE_POR_ORGANIZADOR = 200;

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

function herramientasValidas(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > 60) return null;
  const ids = v.map((x) => String(x ?? "").trim());
  if (ids.some((x) => !/^[a-z0-9-]{2,40}$/.test(x))) return null;
  return [...new Set(ids)];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Falta token de autorización" }, 401);

  // Con el token de quien llama: la base lo ve a él (auth.uid()) y le exige
  // la verificación en dos pasos si la tiene.
  const comoQuienLlama = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: userData, error: userError } = await comoQuienLlama.auth.getUser(jwt);
  if (userError || !userData?.user) return json({ error: "Token inválido" }, 401);
  const yo = userData.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo JSON inválido" }, 400);
  }
  const accion = String(body.accion ?? "");

  const { data: puedoDar, error: errDar } = await comoQuienLlama.rpc("arbitros_puedo_dar");
  if (errDar) return json({ error: errDar.message }, 403);
  if (!Array.isArray(puedoDar) || puedoDar.length === 0) {
    return json({ error: "Para crear árbitros hace falta tener la licencia de alguna herramienta." }, 403);
  }

  if (accion === "crear") {
    const nombre = String(body.nombre ?? "").trim().replace(/\s+/g, " ");
    const usuarioPedido = String(body.usuario ?? "").trim().toLowerCase();
    const clave = typeof body.contrasena === "string" ? body.contrasena : "";
    const herramientas = herramientasValidas(body.herramientas ?? []);

    if (nombre.length < 3 || nombre.length > 80) return json({ error: "Escribe el nombre del árbitro (de 3 a 80 letras)." }, 400);
    if (usuarioPedido.includes("@")) return json({ error: "El usuario va sin «@»: el dominio lo pone el sitio." }, 400);
    const problema = problemaDeContrasena(clave);
    if (problema) return json({ error: problema }, 400);
    if (!herramientas) return json({ error: "La lista de herramientas no se entiende." }, 400);
    if (!herramientas.length) return json({ error: "Marca al menos una herramienta: sin ninguna, la cuenta no serviría de nada." }, 400);

    const { count } = await adminClient.from("arbitros_cuentas")
      .select("arbitro_id", { count: "exact", head: true }).eq("organizador_id", yo);
    if ((count ?? 0) >= TOPE_POR_ORGANIZADOR) {
      return json({ error: `Ya tienes ${TOPE_POR_ORGANIZADOR} árbitros. Escríbele a administración si necesitas más.` }, 409);
    }

    const tomado = async (correo: string) => {
      const { data } = await adminClient.from("profiles").select("id").ilike("email", correo).maybeSingle();
      return !!data;
    };
    const usuario = await usuarioLibre(usuarioPedido || nombre, tomado);
    if (!usuario) return json({ error: "No se pudo armar un usuario con ese nombre. Escribe uno a mano." }, 400);

    const creada = await crearConContrasena(adminClient, usuario, clave, nombre);
    if (creada.error || !creada.user) return json({ error: creada.error ?? "No se pudo crear la cuenta" }, 400);
    const id = creada.user.id;

    const deshacer = async (motivo: string, status = 400) => {
      await adminClient.auth.admin.deleteUser(id);
      return json({ error: motivo }, status);
    };

    const { error: errPerfil } = await adminClient.from("profiles")
      .update({ role: "arbitro", full_name: nombre }).eq("id", id);
    if (errPerfil) return await deshacer("No se pudo preparar la cuenta: " + errPerfil.message, 500);

    const { error: errFila } = await adminClient.from("arbitros_cuentas")
      .insert({ arbitro_id: id, organizador_id: yo });
    if (errFila) return await deshacer("No se pudo anotar el árbitro: " + errFila.message, 500);

    // Las herramientas las decide la base, con la identidad de quien llama.
    const { data: quedaron, error: errHerr } = await comoQuienLlama
      .rpc("arbitro_herramientas_fijar", { p_arbitro: id, p_herramientas: herramientas });
    if (errHerr) return await deshacer(errHerr.message, 403);

    return json({
      arbitro_id: id,
      // Lo que se enseña es lo que quedó, sin el dominio: es lo que se escribe al entrar.
      usuario: (creada.user.email ?? usuario).replace("@" + DOMINIO_ALUMNO, ""),
      herramientas: quedaron ?? [],
    });
  }

  if (accion === "contrasena") {
    const arbitroId = String(body.arbitro_id ?? "");
    const clave = typeof body.contrasena === "string" ? body.contrasena : "";
    const problema = problemaDeContrasena(clave);
    if (problema) return json({ error: problema }, 400);

    // ¿Es suyo? Se le pregunta a la base con su token (administración: todos).
    const { data: mios, error: errMios } = await comoQuienLlama.rpc("arbitros_mis");
    if (errMios) return json({ error: errMios.message }, 403);
    if (!(mios ?? []).some((a: { arbitro_id: string }) => a.arbitro_id === arbitroId)) {
      return json({ error: "Esa cuenta no es de uno de tus árbitros." }, 403);
    }
    // Y que de verdad sea una cuenta de árbitro: a una de alumno o de profesor
    // no se le cambia la contraseña por acá.
    const { data: perfil } = await adminClient.from("profiles").select("role").eq("id", arbitroId).maybeSingle();
    if (perfil?.role !== "arbitro") return json({ error: "Esa no es una cuenta de árbitro." }, 403);

    const { error } = await adminClient.auth.admin.updateUserById(arbitroId, { password: clave });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "Acción desconocida" }, 400);
});
