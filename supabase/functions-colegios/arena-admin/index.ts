/* La administración de la sala de arena (sala.html): equipos, cuentas de los
 * estudiantes y arenas. Para sala-admin.html.
 *
 * Vive en "Base de Colegios", donde están las tablas `arena_*` y las
 * inscripciones de las que salen los jugadores — pero quien la llama tiene su
 * cuenta en el OTRO proyecto, el de la Academia. Mismo arreglo, y mismas
 * razones, que `inscripciones-torneo`:
 *
 *   · EL PERMISO LO CONTESTA LA ACADEMIA. El JWT de quien llama lo firmó el
 *     proyecto de la Academia y este no lo puede validar (por eso `verify_jwt`
 *     va en false). Se lo reenviamos y le preguntamos a `soy_coordinador()`,
 *     que solo da `true` con una sesión de verdad de quien administra o
 *     coordina. Cualquier otra cosa —un token inventado, vencido, la clave
 *     anónima— es que no.
 *
 *   · NADIE ESCRIBE `arena_*` DESDE EL NAVEGADOR: las tablas no tienen
 *     políticas de escritura. Acá se escribe con la service role, que no sale
 *     de esta función.
 *
 * LAS CLAVES. Una cuenta de jugador es un usuario de Auth con un correo que
 * nunca recibe nada (el dominio de abajo no tiene MX a propósito) y una clave
 * que se genera acá. La clave sale UNA vez, en la respuesta que la crea: en la
 * base queda solo su hash y nadie la puede volver a leer. Si se pierde, se
 * genera otra con `reiniciar_clave`.
 *
 * El usuario es el que ya generó el formulario de inscripción
 * (`inscripciones.usuario`, por ejemplo «Oscar_Angulo_C»). Si dos estudiantes
 * dieran el mismo, al segundo se le agrega un número.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ACADEMIA_URL = "https://bgtijpimpcokxatxxbki.supabase.co";
const ACADEMIA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJndGlqcGltcGNva3hhdHh4YmtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5ODczMjksImV4cCI6MjEwNDU2MzMyOX0.h-AcAEQNaYMVo5UVtdWqUCTYgiSLFKDgXsn3lnbAhmQ";

/* El mismo dominio que arma sala.js al iniciar sesión. Sin MX a propósito: a
 * esa dirección nunca se le manda correo. verificar-sala.js comprueba que las
 * dos copias digan lo mismo. */
const DOMINIO = "sala.ajedrez-integral.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_POR_VEZ = 100;
const PASO = 1000;

type Json = Record<string, unknown>;
type Ctx = { url: string; key: string };

class ErrorHttp extends Error {
  estado: number;
  codigo: string;
  constructor(mensaje: string, estado = 400, codigo = "") {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/* ¿Quien llama administra o coordina en la Academia? Lo contesta la Academia. */
async function puedeAdministrar(jwt: string): Promise<boolean> {
  try {
    const res = await fetch(`${ACADEMIA_URL}/rest/v1/rpc/soy_coordinador`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ACADEMIA_ANON,
        Authorization: `Bearer ${jwt}`,
      },
      body: "{}",
    });
    if (!res.ok) return false;
    // Tiene que ser exactamente true: null, un error o un texto son que no.
    return (await res.json()) === true;
  } catch (_e) {
    return false;
  }
}

/* ------------------------------------------------------------ utilidades */

function sinTildes(t: string): string {
  return String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function soloLetras(t: string): string {
  return sinTildes(t).replace(/[^A-Za-z0-9]/g, "");
}

function texto(v: unknown, max: number, que: string): string {
  const t = String(v ?? "").trim().replace(/\s+/g, " ");
  if (!t) throw new ErrorHttp(`Falta ${que}.`);
  if (t.length > max) throw new ErrorHttp(`${que[0].toUpperCase()}${que.slice(1)} es demasiado largo (máximo ${max} letras).`);
  return t;
}

function uuid(v: unknown, que: string): string {
  const t = String(v ?? "");
  if (!UUID.test(t)) throw new ErrorHttp(`Falta ${que}.`);
  return t;
}

function entero(v: unknown, min: number, max: number, que: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ErrorHttp(`${que[0].toUpperCase()}${que.slice(1)} tiene que ser un número entero entre ${min} y ${max}.`);
  }
  return n;
}

/* Sin 0/O, 1/l/i: la clave la lee un niño en una hoja o en un chat. */
const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";
function claveNueva(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

function correoDe(usuario: string): string {
  return `${usuario.toLowerCase()}@${DOMINIO}`;
}

/* El usuario del formulario si sirve; si no, Nombre_Apellido_InicialDelSegundo. */
function usuarioBase(i: Json): string {
  const dado = sinTildes(String(i.usuario ?? "").trim());
  if (/^[A-Za-z0-9_.-]{3,60}$/.test(dado)) return dado;
  const primerNombre = String(i.nombre ?? "").trim().split(/\s+/)[0] ?? "";
  const partes = [
    soloLetras(primerNombre),
    soloLetras(String(i.apellido1 ?? "")),
    soloLetras(String(i.apellido2 ?? "")).slice(0, 1),
  ].filter(Boolean);
  const armado = partes.join("_");
  return armado.length >= 3 ? armado : "jugador";
}

function usuarioLibre(base: string, usados: Set<string>): string {
  let candidato = base;
  for (let n = 2; usados.has(candidato.toLowerCase()); n++) candidato = `${base}${n}`;
  usados.add(candidato.toLowerCase());
  return candidato;
}

/* Lo que se muestra de cada jugador: nombre y primer apellido. */
function nombreVisible(i: Json): string {
  const t = [String(i.nombre ?? "").trim(), String(i.apellido1 ?? "").trim()].filter(Boolean).join(" ");
  return t.slice(0, 80) || "Jugador";
}

/* --------------------------------------------------------- la base y Auth */

async function leer(res: Response): Promise<{ datos: any; texto: string }> {
  const t = await res.text();
  let datos: any = null;
  try {
    datos = t ? JSON.parse(t) : null;
  } catch (_e) { /* no era JSON */ }
  return { datos, texto: t };
}

function mensajeDe(datos: any, t: string): string {
  return String((datos && (datos.message || datos.msg || datos.error_description || datos.error)) || t || "Error desconocido");
}

async function rest(c: Ctx, metodo: string, ruta: string, cuerpo?: unknown): Promise<any> {
  const res = await fetch(`${c.url}/rest/v1/${ruta}`, {
    method: metodo,
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${c.key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const { datos, texto: t } = await leer(res);
  if (!res.ok) {
    throw new ErrorHttp(mensajeDe(datos, t), res.status >= 500 ? 502 : 400, String(datos?.code ?? ""));
  }
  return datos;
}

/* PostgREST corta la respuesta a ~1000 filas sin avisar: se pide de mil en mil. */
async function todas(c: Ctx, ruta: string): Promise<Json[]> {
  const filas: Json[] = [];
  for (let desde = 0; ; desde += PASO) {
    const res = await fetch(`${c.url}/rest/v1/${ruta}`, {
      headers: {
        apikey: c.key,
        Authorization: `Bearer ${c.key}`,
        Range: `${desde}-${desde + PASO - 1}`,
        "Range-Unit": "items",
      },
    });
    const { datos, texto: t } = await leer(res);
    if (!res.ok) throw new ErrorHttp(mensajeDe(datos, t), 502);
    const pagina = Array.isArray(datos) ? datos : [];
    filas.push(...pagina);
    if (pagina.length < PASO) break;
  }
  return filas;
}

async function auth(c: Ctx, metodo: string, ruta: string, cuerpo?: unknown): Promise<any> {
  const res = await fetch(`${c.url}/auth/v1/admin/${ruta}`, {
    method: metodo,
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${c.key}`,
      "Content-Type": "application/json",
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const { datos, texto: t } = await leer(res);
  if (!res.ok) throw new ErrorHttp(mensajeDe(datos, t), res.status >= 500 ? 502 : 400);
  return datos;
}

/* ----------------------------------------------------------------- acciones */

async function estado(c: Ctx): Promise<Json> {
  const [equipos, jugadores, torneos, inscripciones] = await Promise.all([
    todas(c, "arena_equipos?select=id,nombre&order=nombre"),
    todas(c, "arena_jugadores?select=id,usuario,nombre,equipo_id,inscripcion_id&order=nombre"),
    todas(c, "arena_torneos?select=*&order=inicia.desc"),
    // Solo lo que hace falta para armar equipos: nada de cédulas ni contactos.
    todas(c, "inscripciones?select=id,nombre,apellido1,apellido2,centro,grado,usuario,creado_en&order=creado_en.desc"),
  ]);
  return { equipos, jugadores, torneos, inscripciones, dominio: DOMINIO };
}

async function crearEquipo(c: Ctx, p: Json): Promise<Json> {
  const nombre = texto(p.nombre, 60, "el nombre del equipo");
  try {
    const filas = await rest(c, "POST", "arena_equipos", { nombre });
    return { equipo: filas[0] };
  } catch (e) {
    if (e instanceof ErrorHttp && e.codigo === "23505") throw new ErrorHttp("Ya hay un equipo con ese nombre.");
    throw e;
  }
}

async function renombrarEquipo(c: Ctx, p: Json): Promise<Json> {
  const id = uuid(p.id, "el equipo");
  const nombre = texto(p.nombre, 60, "el nombre del equipo");
  try {
    const filas = await rest(c, "PATCH", `arena_equipos?id=eq.${id}`, { nombre });
    if (!filas.length) throw new ErrorHttp("Ese equipo no existe.", 404);
    return { equipo: filas[0] };
  } catch (e) {
    if (e instanceof ErrorHttp && e.codigo === "23505") throw new ErrorHttp("Ya hay un equipo con ese nombre.");
    throw e;
  }
}

async function borrarEquipo(c: Ctx, p: Json): Promise<Json> {
  const id = uuid(p.id, "el equipo");
  // Sus jugadores no se borran: quedan sin equipo (on delete set null).
  await rest(c, "DELETE", `arena_equipos?id=eq.${id}`);
  return {};
}

async function agregarJugadores(c: Ctx, p: Json): Promise<Json> {
  const equipoId = p.equipo_id == null ? null : uuid(p.equipo_id, "el equipo");
  const ids = Array.isArray(p.inscripciones) ? [...new Set(p.inscripciones.map((v) => String(v)))] : [];
  if (!ids.length) throw new ErrorHttp("Elige al menos una inscripción.");
  if (ids.length > MAX_POR_VEZ) throw new ErrorHttp(`Se pueden agregar ${MAX_POR_VEZ} a la vez como máximo.`);
  ids.forEach((id) => uuid(id, "una de las inscripciones"));

  const lista = ids.join(",");
  const inscritos = await todas(c, `inscripciones?select=id,nombre,apellido1,apellido2,usuario&id=in.(${lista})`);
  const porId = new Map(inscritos.map((i) => [String(i.id), i]));
  const yaTienen = await todas(c, `arena_jugadores?select=id,inscripcion_id&inscripcion_id=in.(${lista})`);
  const jugadorDe = new Map(yaTienen.map((j) => [String(j.inscripcion_id), String(j.id)]));
  const usados = new Set((await todas(c, "arena_jugadores?select=usuario")).map((j) => String(j.usuario).toLowerCase()));

  const cuentas: Json[] = [];
  const movidos: string[] = [];
  const fallos: Json[] = [];

  for (const id of ids) {
    const i = porId.get(id);
    if (!i) {
      fallos.push({ inscripcion_id: id, error: "Esa inscripción no existe." });
      continue;
    }
    // Si ya tiene cuenta, solo se mueve de equipo: su clave no cambia.
    const existente = jugadorDe.get(id);
    if (existente) {
      await rest(c, "PATCH", `arena_jugadores?id=eq.${existente}`, { equipo_id: equipoId });
      movidos.push(existente);
      continue;
    }
    const usuario = usuarioLibre(usuarioBase(i), usados);
    const clave = claveNueva();
    let cuentaId = "";
    try {
      const u = await auth(c, "POST", "users", {
        email: correoDe(usuario),
        password: clave,
        email_confirm: true,
        user_metadata: { sala: true },
      });
      cuentaId = String(u.id);
      await rest(c, "POST", "arena_jugadores", {
        id: cuentaId,
        usuario,
        nombre: nombreVisible(i),
        equipo_id: equipoId,
        inscripcion_id: id,
      });
      cuentas.push({ inscripcion_id: id, jugador_id: cuentaId, nombre: nombreVisible(i), usuario, clave });
    } catch (e) {
      // Que no quede una cuenta de Auth sin jugador: sería una clave suelta.
      if (cuentaId) {
        try { await auth(c, "DELETE", `users/${cuentaId}`); } catch (_e) { /* ya se dirá abajo */ }
      }
      fallos.push({ inscripcion_id: id, error: e instanceof Error ? e.message : "No se pudo crear la cuenta." });
    }
  }
  return { cuentas, movidos, fallos };
}

async function moverJugador(c: Ctx, p: Json): Promise<Json> {
  const id = uuid(p.jugador_id, "el jugador");
  const equipoId = p.equipo_id == null ? null : uuid(p.equipo_id, "el equipo");
  const filas = await rest(c, "PATCH", `arena_jugadores?id=eq.${id}`, { equipo_id: equipoId });
  if (!filas.length) throw new ErrorHttp("Ese jugador no existe.", 404);
  return {};
}

async function quitarJugador(c: Ctx, p: Json): Promise<Json> {
  const id = uuid(p.jugador_id, "el jugador");
  // Borrar la cuenta borra al jugador y sus partidas (on delete cascade).
  await auth(c, "DELETE", `users/${id}`);
  return {};
}

async function reiniciarClave(c: Ctx, p: Json): Promise<Json> {
  const id = uuid(p.jugador_id, "el jugador");
  const filas = await rest(c, "GET", `arena_jugadores?select=usuario&id=eq.${id}`);
  if (!filas.length) throw new ErrorHttp("Ese jugador no existe.", 404);
  const clave = claveNueva();
  await auth(c, "PUT", `users/${id}`, { password: clave });
  return { usuario: filas[0].usuario, clave };
}

async function crearTorneo(c: Ctx, p: Json): Promise<Json> {
  const nombre = texto(p.nombre, 100, "el nombre de la arena");
  const inicia = new Date(String(p.inicia ?? ""));
  if (isNaN(inicia.getTime())) throw new ErrorHttp("Falta la fecha y la hora de inicio.");
  const fila = {
    nombre,
    inicia: inicia.toISOString(),
    minutos: entero(p.minutos, 10, 240, "la duración en minutos"),
    inicial_seg: entero(p.inicial_seg, 30, 1800, "el tiempo inicial en segundos"),
    incremento_seg: entero(p.incremento_seg ?? 0, 0, 30, "el incremento en segundos"),
    por_equipos: p.por_equipos !== false,
    mejores: entero(p.mejores ?? 5, 1, 20, "la cantidad de mejores por equipo"),
  };
  const filas = await rest(c, "POST", "arena_torneos", fila);
  return { torneo: filas[0] };
}

async function borrarTorneo(c: Ctx, p: Json): Promise<Json> {
  const id = uuid(p.id, "la arena");
  await rest(c, "DELETE", `arena_torneos?id=eq.${id}`);
  return {};
}

const ACCIONES: Record<string, (c: Ctx, p: Json) => Promise<Json>> = {
  estado: (c) => estado(c),
  crear_equipo: crearEquipo,
  renombrar_equipo: renombrarEquipo,
  borrar_equipo: borrarEquipo,
  agregar_jugadores: agregarJugadores,
  mover_jugador: moverJugador,
  quitar_jugador: quitarJugador,
  reiniciar_clave: reiniciarClave,
  crear_torneo: crearTorneo,
  borrar_torneo: borrarTorneo,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Solo se acepta POST." }, 405);

  const cabecera = req.headers.get("Authorization") || "";
  const jwt = cabecera.startsWith("Bearer ") ? cabecera.slice(7).trim() : "";
  if (!jwt) return json({ error: "Falta la sesión." }, 401);
  if (!(await puedeAdministrar(jwt))) {
    return json({ error: "La sala de arena es solo para quien administra o coordina." }, 403);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Falta la configuración del proyecto." }, 500);

  let cuerpo: Json = {};
  try {
    cuerpo = (await req.json()) as Json;
  } catch (_e) {
    return json({ error: "El pedido no es un JSON válido." }, 400);
  }
  const accion = String(cuerpo?.accion ?? "estado");
  const hacer = ACCIONES[accion];
  if (!hacer) return json({ error: "Esa acción no existe." }, 400);

  try {
    return json({ ok: true, ...(await hacer({ url, key }, cuerpo)) });
  } catch (e) {
    if (e instanceof ErrorHttp) return json({ error: e.message }, e.estado);
    return json({ error: "No se pudo completar la acción." }, 500);
  }
});
