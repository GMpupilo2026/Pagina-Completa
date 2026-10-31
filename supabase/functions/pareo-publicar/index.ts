// Edge Function: pareo-publicar (verify_jwt en false)
//
// «Torneos en Pareo Integral» (torneos-pareo.html): quien organiza un torneo
// en Pareo Integral lo publica acá SIN CUENTA —como todo Pareo Integral— para
// que cualquiera lo siga: todas las rondas, cada jugador con sus rivales y la
// tabla de posiciones. Lo pidió el dueño del sitio.
//
//   { accion: "crear", torneo }              → { ok, id, clave }
//   { accion: "actualizar", id, clave, torneo } → { ok }
//   { accion: "borrar", id, clave }           → { ok }
//   { accion: "inscribir", id, inscripcion, consentimiento } → { ok }
//   { accion: "inscripciones", id, clave }    → { ok, inscripciones }
//   { accion: "marcar", id, clave, ids, estado } → { ok }
//   { accion: "organizador", nombre, logo?, correo?, consentimiento?, id?, clave? } → { ok, id, clave?, correoPendiente? }
//   { accion: "organizador_estado", id, clave } → { ok, verificado, correo, correoConfirmado, selloPendiente }
//   { accion: "confirmar_correo", id, token } → { ok }
//   { accion: "recuperar", correo }            → { ok } (siempre: no dice si existe)
//   { accion: "recuperar_confirmar", id, token } → { ok, id, clave, nombre, logo }
//   { accion: "pedir_sello", id, clave, quien, representa, contacto, nota, consentimiento } → { ok }
//   { accion: "reportar", id, motivo, detalle } → { ok }
//   { accion: "seguir_correo", nombre, ident, correo, consentimiento } → { ok } (siempre)
//   { accion: "seguir_confirmar", id, token } → { ok, nombre }
//   { accion: "seguir_baja", id, token }       → { ok }
//
// Seguir a un jugador por correo: quien mira un torneo deja su correo y,
// después de confirmarlo, le llega un aviso cuando ese jugador queda
// emparejado en una ronda nueva y cuando termina el torneo. Los avisos salen
// de acá mismo, al crear o poner al día un torneo, comparando con la versión
// anterior (avisos.ts); pareo_avisos_enviados garantiza uno solo por ronda.
// Ver «Torneos en Pareo Integral: avisar por correo a quien sigue a un
// jugador».
//
// El ID FIDE llega con cada jugador pero NO se guarda: se cambia por una
// huella (`ident`, HMAC con el secreto pareo_identidad_secreto de la bóveda)
// que reconoce al mismo jugador en otros torneos sin decir cuál es su ID.
// Ver «Torneos en Pareo Integral: el mismo jugador en todos sus torneos».
//
// La organización (pareo_organizadores): nombre y logo de quien organiza,
// sin cuenta, con su propia clave. «crear» y «actualizar» aceptan además
// `organizador: { id, clave }`, y el torneo queda a su nombre. El sello
// «Organizador verificado» y ocultar los pone solo administración
// (public.pareo_moderar), nunca esta función. «reportar» deja un reporte que
// lee solo administración. Ver «Torneos en Pareo Integral: el organizador y
// la moderación».
//
// El correo de la organización es opcional y no se usa hasta que quien
// organiza toca el enlace que le llega (confirmar_correo). Con él se le avisa
// de cada inscripción y de cada reporte, y recupera su organización si pierde
// la clave (recuperar: un enlace de un solo uso, que deja una clave nueva).
// Cada reporte y cada pedido del sello le llega también a administración. Los
// textos están en correos.ts. Ver «Torneos en Pareo Integral: el correo del
// organizador, el sello y el historial».
//
// La inscripción antes del torneo: si quien organiza la abrió
// (`torneo.inscripcion = { abierta, hasta }`), cualquiera manda la de un
// estudiante desde torneos-pareo.html; queda en pareo_preinscripciones (que
// no se lee desde afuera) hasta que el organizador la lee con su clave y la
// acepta o la rechaza. Un torneo puede publicarse antes de tener jugadores,
// como anuncio (`torneo.anuncio`: hora, contacto, texto). Ver «Torneos en
// Pareo Integral: inscripción, anuncios, partidas y estadísticas».
//
// No hay sesión que comprobar: el candado es la clave secreta que recibe quien
// publica (la guarda su navegador, dentro del torneo). Acá se guarda solo su
// sha256, y se compara con la que llega. Antes de escribir, el freno de los
// envíos públicos (pareo_frenar): crear pesa más que actualizar. Y lo que se
// guarda del torneo se elige campo por campo (limpiar): nombres, centros,
// Elo, rondas y resultados; nunca la fecha de nacimiento, el sexo, el ID FIDE
// (solo su huella, ver abajo) ni nada que no se vea en una tabla de posiciones.
//
// Ver «Torneos en Pareo Integral: el espacio público» en
// docs/decisiones/juegos-y-torneos.md.

import { createClient } from "npm:@supabase/supabase-js@2";
import { cabeceraCorreo } from "./marca-correo.ts";
import {
  type Correo, correoAvisoFin, correoAvisoRonda, correoConfirmar, correoInscripcion, correoRecuperar, correoReporteAdmin, correoReporteOrganizador,
  correoSeguirConfirmar, correoSelloAdmin,
} from "./correos.ts";
import { esTorneoAviso, queAvisar, textoFin, textoRonda, type TorneoAviso } from "./avisos.ts";
import { type LlavesVapid, mandar as mandarPush } from "./webpush.ts";

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

function ipDe(req: Request): string | null {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ??
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0];
  return ip?.trim() || null;
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ---------- los correos ----------
const DE = "Pareo Integral <informes@ajedrez-integral.com>";
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const cabecera = (titulo: string) => cabeceraCorreo(null, titulo);
// Nunca lanza ni frena lo que se estaba haciendo: un aviso que no sale no
// deshace una inscripción ni un reporte.
async function mandar(para: string[], c: Correo): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const destino = [...new Set(para.map((x) => x.trim()).filter((x) => CORREO.test(x)))];
  if (!apiKey || !destino.length) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: DE, to: destino, subject: c.asunto, html: c.html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
async function correosAdmin(): Promise<string[]> {
  const { data } = await admin.from("profiles").select("email").eq("is_admin", true);
  return (data ?? []).map((a: { email: string | null }) => a.email ?? "");
}
// El correo confirmado de una organización (o null).
async function correoDe(oid: string | null | undefined): Promise<string | null> {
  if (!oid) return null;
  const { data } = await admin.from("pareo_organizadores").select("correo, correo_confirmado").eq("id", oid).maybeSingle();
  return data && data.correo && data.correo_confirmado ? data.correo : null;
}
// «o•••@gmail.com»: para que quien organiza reconozca cuál puso, sin mostrarlo entero.
const tapado = (c: string | null) => (c ? c.replace(/^(.)[^@]*(@.*)$/, "$1•••$2") : null);
const vence = (horas: number) => new Date(Date.now() + horas * 3600 * 1000).toISOString();

// ---------- lo que se guarda del torneo ----------
type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const numero = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
};
const ID = /^[A-Za-z0-9_.:-]{1,40}$/;
const id = (v: unknown) => (typeof v === "string" && ID.test(v) ? v : null);
const RESULTADOS = new Set(["1-0", "=", "0-1", "+-", "-+", "--", "bye"]);
const resultado = (v: unknown) => (typeof v === "string" && RESULTADOS.has(v) ? v : null);
const AUSENCIAS = new Set(["H", "Z", "F"]);
const fecha = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const lista = <T>(v: unknown, max: number, f: (x: unknown) => T | null): T[] =>
  (Array.isArray(v) ? v.slice(0, max).map(f).filter((x): x is T => x !== null) : []);
const ids = (v: unknown, max: number) => lista(v, max, id);
const codigo = (v: unknown) => (typeof v === "string" && /^[a-z0-9]{6,12}$/.test(v) ? v : undefined);
const hora = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : undefined);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// El logo, como lo achica el navegador: una imagen chica en base64. Lo mismo
// que pide la tabla (que lo vuelve a revisar).
const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const MOTIVOS = new Set(["inapropiado", "datos_personales", "falso", "error", "otro"]);

// La organización que manda el torneo, si su clave es la de ella: su id; si
// no, null (el torneo se publica igual, sin organización).
async function organizadorDe(v: unknown): Promise<string | null> {
  if (!esObj(v)) return null;
  const oid = texto(v.id, 40), clave = texto(v.clave, 100);
  if (!UUID.test(oid) || !clave) return null;
  const { data } = await admin.from("pareo_organizadores").select("clave_hash").eq("id", oid).maybeSingle();
  return data && data.clave_hash === await sha256(clave) ? oid : null;
}

type Persona = { id: string; nombre: string; fideId?: string; ident?: string; integrantes?: Persona[] } & Obj;
function persona(v: unknown): Persona | null {
  if (!esObj(v) || !id(v.id)) return null;
  const nombre = texto(v.nombre, 100);
  if (!nombre) return null;
  return {
    id: v.id as string, nombre,
    institucion: texto(v.institucion, 100), elo: Math.round(numero(v.elo, 0, 3500)),
    titulo: texto(v.titulo, 4), fed: texto(v.fed, 4), categoria: texto(v.categoria, 30),
    retiradoDespuesDe: v.retiradoDespuesDe == null ? null : Math.round(numero(v.retiradoDespuesDe, 0, 99)),
    ...(Array.isArray(v.integrantes) ? { integrantes: lista(v.integrantes, 12, persona) } : {}),
    // De paso: ponerIdentidad() lo cambia por la huella y lo borra.
    ...(/^[0-9]{1,12}$/.test(texto(v.fideId, 12)) ? { fideId: texto(v.fideId, 12) } : {}),
  };
}

// El resumen de cada jugador que calcula quien publica (js/pareo/publicar.js).
function filaResumen(v: unknown) {
  if (!esObj(v) || !id(v.id)) return null;
  const opcional = (x: unknown, min: number, max: number) => (x == null || x === "" ? null : Math.round(numero(x, min, max) * 10) / 10);
  return {
    id: v.id as string, puesto: Math.round(numero(v.puesto, 1, 2000)), puntos: numero(v.puntos, 0, 99), rondas: Math.round(numero(v.rondas, 0, 99)),
    g: Math.round(numero(v.g, 0, 99)), e: Math.round(numero(v.e, 0, 99)), p: Math.round(numero(v.p, 0, 99)), pe: Math.round(numero(v.pe, 0, 99)),
    rp: v.rp == null ? null : Math.round(numero(v.rp, 0, 4000)), cambio: opcional(v.cambio, -999, 999),
  };
}
const PROVINCIAS = new Set(["San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón"]);

// ---------- la huella del ID FIDE ----------
let secretoIdentidad: string | null = null;
async function hmac(mensaje: string): Promise<string> {
  if (!secretoIdentidad) {
    const { data } = await admin.rpc("secreto_pareo_identidad");
    if (!data) throw new Error("sin secreto de identidad");
    secretoIdentidad = data as string;
  }
  const llave = await crypto.subtle.importKey("raw", new TextEncoder().encode(secretoIdentidad), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("HMAC", llave, new TextEncoder().encode(mensaje));
  return [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// Cada fideId se cambia por `ident` y se borra: el ID FIDE no se guarda nunca.
// Sin el secreto, se borra igual y el jugador queda sin huella.
async function ponerIdentidad(jugadores: Persona[]) {
  for (const j of jugadores) {
    const f = j.fideId;
    delete j.fideId;
    if (f) { try { j.ident = (await hmac("fide:" + f)).slice(0, 24); } catch { /* queda sin huella */ } }
    if (Array.isArray(j.integrantes)) await ponerIdentidad(j.integrantes);
  }
}

// La partida en PGN (la valida el navegador con chess.js al anotarla y al
// mostrarla): acá solo se acota el tamaño y se quitan los caracteres de control.
const pgnLimpio = (x: unknown) => (typeof x === "string" ? x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, 12000).trim() : "");

function mesa(v: unknown) {
  if (!esObj(v) || !id(v.b)) return null;
  const m: Obj = { b: v.b, n: v.n == null ? null : id(v.n), r: resultado(v.r) };
  if (v.n != null && m.n === null) return null;
  // En un encuentro por equipos, cada tablero con su resultado y, si la hay
  // (la cámara de ese tablero o el árbitro), su partida.
  if (Array.isArray(v.partidas)) {
    m.partidas = lista(v.partidas, 12, (p) => {
      if (!esObj(p)) return null;
      const x: Obj = { r: resultado(p.r) };
      const pgn = pgnLimpio(p.pgn);
      if (pgn) x.pgn = pgn;
      return x;
    });
  }
  if (esObj(v.alineacion)) m.alineacion = { b: ids(v.alineacion.b, 12), n: ids(v.alineacion.n, 12) };
  // La eliminación directa: el lugar en el cuadro y, si fue tablas, quién
  // pasó (uno de los dos de la mesa) y cómo. Sin eso, la clasificación
  // pública no sabe quién siguió.
  if (v.ko === true) {
    m.ko = true;
    m.slot = Math.round(numero(v.slot, 0, 999));
    if (v.pasa != null && (v.pasa === v.b || v.pasa === v.n)) { m.pasa = v.pasa; m.desempate = texto(v.desempate, 30); }
  }
  const pgn = pgnLimpio(v.pgn);
  if (pgn) m.pgn = pgn;
  return m;
}

function ronda(v: unknown) {
  if (!esObj(v)) return null;
  const ausencias: Obj = {};
  if (esObj(v.ausencias)) {
    for (const [k, a] of Object.entries(v.ausencias).slice(0, 2000)) if (id(k) && typeof a === "string" && AUSENCIAS.has(a)) ausencias[k] = a;
  }
  return { mesas: lista(v.mesas, 1000, mesa), ausencias, inicio: hora(v.inicio), fin: hora(v.fin), emparejada: hora(v.emparejada) };
}

function limpiar(v: unknown) {
  if (!esObj(v)) return null;
  const puntos = esObj(v.puntos) ? v.puntos : {};
  const evento = esObj(v.evento) ? { nombre: texto(v.evento.nombre, 160) } : null;
  const t = {
    formato: 1,
    nombre: texto(v.nombre, 160), grupo: texto(v.grupo, 160), ciudad: texto(v.ciudad, 120),
    provincia: PROVINCIAS.has(v.provincia as string) ? v.provincia as string : "",
    federacion: texto(v.federacion, 4), fechaInicio: fecha(v.fechaInicio), fechaFin: fecha(v.fechaFin),
    arbitro: texto(v.arbitro, 100), arbitroAdjunto: texto(v.arbitroAdjunto, 100), ritmo: texto(v.ritmo, 80),
    // Si el torneo cambia el Elo de quien juega (lo dice la lista pública).
    validoElo: ["fide", "nacional", "no"].includes(v.validoElo as string) ? v.validoElo as string : "",
    ritmoTipo: ["clasico", "rapido", "blitz"].includes(v.ritmoTipo as string) ? v.ritmoTipo as string : "",
    // Los sistemas que sabe pintar la página pública; cualquier otra cosa, suizo.
    sistema: ["todos", "scheveningen", "eliminacion"].includes(v.sistema as string) ? v.sistema as string : "suizo", dobleVuelta: v.dobleVuelta === true,
    rondasTotales: Math.round(numero(v.rondasTotales, 0, 99)),
    tipo: v.tipo === "equipos" ? "equipos" : undefined, tableros: v.tipo === "equipos" ? Math.round(numero(v.tableros, 1, 12)) : undefined,
    puntos: { victoria: numero(puntos.victoria, 0, 10), tablas: numero(puntos.tablas, 0, 10), derrota: numero(puntos.derrota, 0, 10), bye: numero(puntos.bye, 0, 10) },
    desempates: lista(v.desempates, 12, (x) => (typeof x === "string" && /^[A-Z0-9-]{1,12}$/.test(x) ? x : null)),
    mesaInicial: v.mesaInicial == null ? undefined : Math.round(numero(v.mesaInicial, 1, 999)),
    evento,
    jugadores: lista(v.jugadores, 1000, persona),
    numeracion: Array.isArray(v.numeracion) ? ids(v.numeracion, 1000) : null,
    rondas: lista(v.rondas, 40, ronda),
    desempateCorte: esObj(v.desempateCorte) ? { formato: texto(v.desempateCorte.formato, 40), orden: ids(v.desempateCorte.orden, 100) } : undefined,
    // El anuncio de un torneo que todavía no empieza (lo que se publica a
    // propósito: la hora, el contacto de la organización y las bases).
    anuncio: esObj(v.anuncio) ? { hora: /^\d{2}:\d{2}$/.test(String(v.anuncio.hora)) ? v.anuncio.hora : "", contacto: texto(v.anuncio.contacto, 120), texto: texto(v.anuncio.texto, 1500) } : undefined,
    inscripcion: esObj(v.inscripcion) ? { abierta: v.inscripcion.abierta === true, hasta: fecha(v.inscripcion.hasta) } : undefined,
    // Los códigos de los enlaces en vivo (ya van en sus QR): con ellos, un
    // enlace en vivo que ya nadie transmite lleva al torneo publicado.
    vivo: codigo(v.vivo), codigoEvento: codigo(v.codigoEvento),
    // El resumen de cada jugador (puesto, puntos, rendimiento), de jugadores que existen.
    resumen: lista(v.resumen, 1000, filaResumen),
  };
  const deVerdad = new Set(t.jugadores.map((j) => j.id));
  t.resumen = t.resumen.filter((x) => deVerdad.has(x.id));
  return t.nombre || t.grupo ? t : null;
}

async function sha256(s: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const claveNueva = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");

// Las columnas que se leen sin abrir el JSON (la lista del espacio público).
function columnas(t: NonNullable<ReturnType<typeof limpiar>>) {
  const completas = t.rondas.filter((R) => R.mesas.length && R.mesas.every((m) => m.r || m.n === null)).length;
  return {
    nombre: (t.grupo || t.nombre).slice(0, 160), evento: (t.evento && t.evento.nombre) || "",
    lugar: t.ciudad, fecha: t.fechaInicio || null,
    rondas: Math.min(99, completas), rondas_total: Math.min(99, t.rondasTotales), jugadores: Math.min(2000, t.jugadores.length),
  };
}

// ---------- avisar a quien sigue a un jugador ----------
// Corre después de contestar (EdgeRuntime.waitUntil): un aviso lento no
// demora la publicación. Cada (suscripción, torneo, ronda) se anota ANTES de
// mandar, con su clave única: el mismo aviso no sale dos veces aunque el
// torneo se ponga al día muchas veces seguidas.
const TOPE_AVISOS = 300;
async function avisarSeguidores(pid: string, antes: unknown, ahora: TorneoAviso) {
  const que = queAvisar(esTorneoAviso(antes) ? antes : null, ahora);
  if (!que.ronda && !que.fin) return;
  // Los del celular, aparte: si uno falla, el otro sale igual.
  enSegundoPlano(avisarPush(pid, que, ahora));
  const { data: subs } = await admin.rpc("pareo_suscriptores_de", { p_torneo: pid });
  let mandados = 0;
  for (const s of (subs ?? []) as { suscripcion: string; correo: string; jugador: string; nombre: string }[]) {
    const eventos: ["ronda" | "fin", string][] = [];
    if (que.ronda) eventos.push(["ronda", "r" + que.ronda]);
    if (que.fin) eventos.push(["fin", "fin"]);
    for (const [tipo, clave] of eventos) {
      if (mandados >= TOPE_AVISOS) return;
      const texto = tipo === "ronda" ? textoRonda(ahora, s.jugador, s.nombre, (que.ronda as number) - 1) : textoFin(ahora, s.jugador, s.nombre);
      if (!texto) continue;
      const { error } = await admin.from("pareo_avisos_enviados").insert({ suscripcion_id: s.suscripcion, torneo_id: pid, que: clave });
      if (error) continue; // ya salió (23505) o no se pudo anotar: no se manda
      const baja = `${SITE_URL}/torneos-pareo.html#seguir-baja=${s.suscripcion}.${(await hmac("baja:" + s.suscripcion)).slice(0, 32)}`;
      const url = `${SITE_URL}/torneos-pareo.html#t=${pid}`;
      const c = tipo === "ronda"
        ? correoAvisoRonda(cabecera("Ronda " + que.ronda), s.nombre, texto, url, baja)
        : correoAvisoFin(cabecera("Terminó el torneo"), s.nombre, texto, url + "&v=clasificacion", baja);
      await mandar([s.correo], c);
      mandados++;
    }
  }
}
// ---------- los mismos avisos, en el celular (push) ----------
// Las llaves VAPID son las de la Academia (las genera y guarda notificar: el
// mismo par para todo el sitio). Sin llaves, no hay push: el correo sigue.
// Un aparato que el servicio ya no reconoce (404, 410) se borra.
const CONTACTO_PUSH = "mailto:info@ajedrezintegral.com";
// Solo los servicios de avisos de los navegadores: la función no le manda
// nada a otra dirección que alguien escriba.
const SERVICIO_PUSH = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com|android\.googleapis\.com)\//;
let llavesEnMemoria: LlavesVapid | null = null;
async function llavesPush(): Promise<LlavesVapid | null> {
  if (llavesEnMemoria) return llavesEnMemoria;
  const { data } = await admin.rpc("push_llaves_leer");
  const fila = Array.isArray(data) ? data[0] : data;
  if (fila?.publica && fila?.privada) llavesEnMemoria = { publica: fila.publica, privada: fila.privada };
  return llavesEnMemoria;
}
type SusPush = { suscripcion: string; endpoint: string; p256dh: string; auth: string; jugador: string; nombre: string };
async function avisarPush(pid: string, que: { ronda: number | null; fin: boolean }, ahora: TorneoAviso) {
  const llaves = await llavesPush();
  if (!llaves) return;
  const { data: subs } = await admin.rpc("pareo_suscriptores_push_de", { p_torneo: pid });
  let mandados = 0;
  for (const s of (subs ?? []) as SusPush[]) {
    const eventos: ["ronda" | "fin", string][] = [];
    if (que.ronda) eventos.push(["ronda", "r" + que.ronda]);
    if (que.fin) eventos.push(["fin", "fin"]);
    for (const [tipo, clave] of eventos) {
      if (mandados >= TOPE_AVISOS) return;
      const texto = tipo === "ronda" ? textoRonda(ahora, s.jugador, s.nombre, (que.ronda as number) - 1) : textoFin(ahora, s.jugador, s.nombre);
      if (!texto) continue;
      const { error } = await admin.from("pareo_avisos_push_enviados").insert({ suscripcion_id: s.suscripcion, torneo_id: pid, que: clave });
      if (error) continue; // ya salió (23505) o no se pudo anotar: no se manda
      const r = await mandarPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, {
        titulo: tipo === "ronda" ? "Ronda " + que.ronda + ": " + s.nombre : "Terminó el torneo de " + s.nombre,
        cuerpo: texto,
        url: "/torneos-pareo.html#t=" + pid + (tipo === "ronda" ? "&v=jugadores&j=" + encodeURIComponent(s.jugador) : "&v=clasificacion"),
        // Una por jugador y torneo: la ronda nueva reemplaza a la anterior.
        etiqueta: "pareo-" + pid + "-" + s.jugador,
      }, llaves, CONTACTO_PUSH);
      if (!r.ok && r.caduca) await admin.from("pareo_suscripciones_push").delete().eq("endpoint", s.endpoint);
      mandados++;
    }
  }
}

function enSegundoPlano(p: Promise<unknown>) {
  const seguro = p.catch((e) => console.error("avisos:", String(e)));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") rt.waitUntil(seguro);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);
  // Solo desde el sitio. Las pruebas del CI abren Pareo Integral en
  // localhost y, con la publicación automática, cada corrida dejaba decenas
  // de torneos de prueba en la lista pública (el 23/10 hubo que borrar 169).
  // El navegador siempre manda Origin en un POST a otro dominio; Node y curl
  // no lo mandan. Ver «Las pruebas no publican» en
  // docs/decisiones/juegos-y-torneos.md.
  if (req.headers.get("origin") !== SITE_URL) return json({ ok: false, error: "Solo se publica desde ajedrez-integral.com." }, 403);
  const crudo = await req.text();
  if (crudo.length > 3_000_000) return json({ ok: false, error: "El torneo es demasiado grande para publicarlo." }, 413);
  let body: Obj;
  try { body = JSON.parse(crudo); } catch { return json({ ok: false, error: "Cuerpo JSON inválido" }, 400); }
  const accion = texto(body.accion, 20);

  if (accion === "crear" || accion === "actualizar") {
    const t = limpiar(body.torneo);
    if (!t) return json({ ok: false, error: "El torneo llegó sin nombre o con una forma inválida." }, 400);
    if (!t.jugadores.length && !t.anuncio) return json({ ok: false, error: "El torneo todavía no tiene jugadores." }, 400);
    await ponerIdentidad(t.jugadores);

    if (accion === "actualizar") {
      const pid = texto(body.id, 40);
      const clave = texto(body.clave, 100);
      if (!/^[0-9a-f-]{36}$/.test(pid) || !clave) return json({ ok: false, error: "Falta la clave de este torneo." }, 400);
      const { data: fila } = await admin.from("pareo_publicados").select("clave_hash, actualizado, datos").eq("id", pid).maybeSingle();
      if (!fila) return json({ ok: false, error: "Ese torneo ya no está publicado.", noExiste: true }, 404);
      if (fila.clave_hash !== await sha256(clave)) return json({ ok: false, error: "La clave no es la de este torneo." }, 403);
      const { data: freno, error: frenoError } = await admin.rpc("pareo_frenar", { p_ip: ipDe(req), p_crear: false });
      if (frenoError) return json({ ok: false, error: "No se pudo actualizar. Intenta de nuevo." }, 502);
      if (freno) return json({ ok: false, error: freno }, 429);
      const cambio: Obj = { ...columnas(t), datos: t, actualizado: new Date().toISOString() };
      // Sin organización en el pedido, se queda la que tenía.
      if (esObj(body.organizador)) { const oid = await organizadorDe(body.organizador); if (oid) cambio.organizador_id = oid; }
      const { error } = await admin.from("pareo_publicados").update(cambio).eq("id", pid);
      if (error) return json({ ok: false, error: "No se pudo actualizar. Intenta de nuevo." }, 502);
      enSegundoPlano(avisarSeguidores(pid, fila.datos, t as unknown as TorneoAviso));
      return json({ ok: true, id: pid });
    }

    const { data: freno, error: frenoError } = await admin.rpc("pareo_frenar", { p_ip: ipDe(req), p_crear: true });
    if (frenoError) return json({ ok: false, error: "No se pudo publicar. Intenta de nuevo." }, 502);
    if (freno) return json({ ok: false, error: freno }, 429);
    const clave = claveNueva();
    const organizador_id = await organizadorDe(body.organizador);
    const { data, error } = await admin.from("pareo_publicados").insert({ ...columnas(t), datos: t, clave_hash: await sha256(clave), organizador_id }).select("id").single();
    if (error || !data) return json({ ok: false, error: "No se pudo publicar. Intenta de nuevo." }, 502);
    enSegundoPlano(avisarSeguidores(data.id, null, t as unknown as TorneoAviso));
    return json({ ok: true, id: data.id, clave });
  }

  // ---------- La organización ----------
  if (accion === "organizador") {
    const nombre = texto(body.nombre, 120);
    if (nombre.length < 2) return json({ ok: false, error: "Escribe el nombre de la organización." }, 400);
    // logo: un texto (la imagen nueva), null (quitarla) o sin mandar (dejarla).
    const cambiaLogo = Object.prototype.hasOwnProperty.call(body, "logo");
    const logo = typeof body.logo === "string" ? body.logo : null;
    if (logo && (!LOGO.test(logo) || logo.length > 200000)) return json({ ok: false, error: "El logo tiene que ser una imagen PNG, JPG o WebP chica." }, 400);
    // correo: un texto (el nuevo, con su consentimiento), "" (quitarlo) o sin
    // mandar (dejarlo). El nuevo no se usa hasta confirmarlo.
    const cambiaCorreo = typeof body.correo === "string";
    const correo = cambiaCorreo ? texto(body.correo, 200).toLowerCase() : "";
    if (correo && !CORREO.test(correo)) return json({ ok: false, error: "Ese correo no parece bien escrito." }, 400);
    if (correo && body.consentimiento !== true) return json({ ok: false, error: "Falta aceptar la política de privacidad para guardar el correo." }, 400);
    const oid = texto(body.id, 40);
    // Lo que se escribe del correo y el que hay que confirmar (si cambió).
    const conCorreo = async (cambio: Obj, anterior: { correo: string | null; correo_confirmado: string | null } | null) => {
      if (!cambiaCorreo) return null;
      if (!correo) { Object.assign(cambio, { correo: null, correo_confirmado: null, correo_token_hash: null, correo_token_vence: null }); return null; }
      if (anterior && anterior.correo === correo && anterior.correo_confirmado) return null;
      const token = claveNueva();
      Object.assign(cambio, { correo, correo_confirmado: null, correo_consentimiento: new Date().toISOString(), correo_token_hash: await sha256(token), correo_token_vence: vence(48) });
      return token;
    };
    // null: no había nada que confirmar; true/false: si el correo salió.
    const confirmar = async (id: string, nombreOrg: string, token: string | null) => {
      if (!token) return null;
      const { data: f } = await admin.rpc("pareo_correo_frenar", { p_ip: ipDe(req), p_ambito: "confirmar" });
      if (f) return false;
      return await mandar([correo], correoConfirmar(cabecera("Confirma tu correo"), nombreOrg, `${SITE_URL}/pareo.html#org-correo=${id}.${token}`));
    };
    if (oid) {
      const clave = texto(body.clave, 100);
      if (!UUID.test(oid) || !clave) return json({ ok: false, error: "Falta la clave de la organización." }, 400);
      const { data: fila } = await admin.from("pareo_organizadores").select("clave_hash, correo, correo_confirmado").eq("id", oid).maybeSingle();
      if (!fila) return json({ ok: false, error: "Esa organización ya no existe.", noExiste: true }, 404);
      if (fila.clave_hash !== await sha256(clave)) return json({ ok: false, error: "La clave no es la de esta organización." }, 403);
      const { data: freno, error: frenoError } = await admin.rpc("pareo_frenar", { p_ip: ipDe(req), p_crear: false });
      if (frenoError) return json({ ok: false, error: "No se pudo guardar. Intenta de nuevo." }, 502);
      if (freno) return json({ ok: false, error: freno }, 429);
      const cambio: Obj = { nombre, actualizado: new Date().toISOString() };
      if (cambiaLogo) cambio.logo = logo;
      const token = await conCorreo(cambio, fila);
      const { error } = await admin.from("pareo_organizadores").update(cambio).eq("id", oid);
      if (error) return json({ ok: false, error: "No se pudo guardar. Intenta de nuevo." }, 502);
      return json({ ok: true, id: oid, correoPendiente: await confirmar(oid, nombre, token) });
    }
    const { data: freno, error: frenoError } = await admin.rpc("pareo_frenar", { p_ip: ipDe(req), p_crear: true });
    if (frenoError) return json({ ok: false, error: "No se pudo guardar. Intenta de nuevo." }, 502);
    if (freno) return json({ ok: false, error: freno }, 429);
    const clave = claveNueva();
    const nueva: Obj = { nombre, logo, clave_hash: await sha256(clave) };
    const token = await conCorreo(nueva, null);
    const { data, error } = await admin.from("pareo_organizadores").insert(nueva).select("id").single();
    if (error || !data) return json({ ok: false, error: "No se pudo guardar. Intenta de nuevo." }, 502);
    return json({ ok: true, id: data.id, clave, correoPendiente: await confirmar(data.id, nombre, token) });
  }

  // ---------- Lo que la organización ve de sí misma (con su clave) ----------
  if (accion === "organizador_estado" || accion === "pedir_sello") {
    const oid = texto(body.id, 40), clave = texto(body.clave, 100);
    if (!UUID.test(oid) || !clave) return json({ ok: false, error: "Falta la clave de la organización." }, 400);
    const { data: o } = await admin.from("pareo_organizadores").select("nombre, clave_hash, verificado, correo, correo_confirmado").eq("id", oid).maybeSingle();
    if (!o) return json({ ok: false, error: "Esa organización ya no existe.", noExiste: true }, 404);
    if (o.clave_hash !== await sha256(clave)) return json({ ok: false, error: "La clave no es la de esta organización." }, 403);
    const { data: pend } = await admin.from("pareo_solicitudes_sello").select("id").eq("organizador_id", oid).eq("estado", "nueva").maybeSingle();
    if (accion === "organizador_estado") {
      return json({ ok: true, verificado: o.verificado, correo: tapado(o.correo), correoConfirmado: !!o.correo_confirmado, selloPendiente: !!pend });
    }
    if (o.verificado) return json({ ok: false, error: "Tu organización ya tiene el sello." }, 409);
    if (pend) return json({ ok: false, error: "Ya pediste el sello: Ajedrez Integral lo está revisando." }, 409);
    if (body.consentimiento !== true) return json({ ok: false, error: "Falta aceptar la política de privacidad." }, 400);
    const s = { quien: texto(body.quien, 120), representa: texto(body.representa, 200), contacto: texto(body.contacto, 160), nota: texto(body.nota, 800) };
    if (s.quien.length < 2 || s.representa.length < 2 || s.contacto.length < 5) {
      return json({ ok: false, error: "Escribe quién lo pide, a quién representa y cómo contactarte." }, 400);
    }
    const { data: freno, error: frenoError } = await admin.rpc("pareo_correo_frenar", { p_ip: ipDe(req), p_ambito: "sello" });
    if (frenoError) return json({ ok: false, error: "No se pudo mandar. Intenta de nuevo." }, 502);
    if (freno) return json({ ok: false, error: freno }, 429);
    const { error } = await admin.from("pareo_solicitudes_sello").insert({ organizador_id: oid, ...s, consentimiento: new Date().toISOString() });
    if (error) return json({ ok: false, error: error.code === "23505" ? "Ya pediste el sello: Ajedrez Integral lo está revisando." : "No se pudo mandar. Intenta de nuevo." }, error.code === "23505" ? 409 : 502);
    await mandar(await correosAdmin(), correoSelloAdmin(cabecera("Piden el sello «Verificado»"), { organizacion: o.nombre, ...s }, `${SITE_URL}/admin-pareo.html`));
    return json({ ok: true });
  }

  // ---------- Confirmar el correo y recuperar la organización ----------
  if (accion === "confirmar_correo" || accion === "recuperar_confirmar") {
    const oid = texto(body.id, 40), token = texto(body.token, 100);
    if (!UUID.test(oid) || !/^[0-9a-f]{20,100}$/.test(token)) return json({ ok: false, error: "El enlace no está completo. Ábrelo otra vez desde el correo." }, 400);
    const { data: o } = await admin.from("pareo_organizadores")
      .select("nombre, logo, correo_token_hash, correo_token_vence, recuperar_token_hash, recuperar_token_vence").eq("id", oid).maybeSingle();
    const h = await sha256(token);
    const ahora = new Date().toISOString();
    if (accion === "confirmar_correo") {
      if (!o || o.correo_token_hash !== h || !o.correo_token_vence || o.correo_token_vence < ahora) {
        return json({ ok: false, error: "Este enlace ya no sirve: venció o ya se usó. Vuelve a guardar tu correo en Pareo Integral para que te llegue otro." }, 410);
      }
      const { error } = await admin.from("pareo_organizadores").update({ correo_confirmado: ahora, correo_token_hash: null, correo_token_vence: null }).eq("id", oid);
      if (error) return json({ ok: false, error: "No se pudo confirmar. Intenta de nuevo." }, 502);
      return json({ ok: true, nombre: o.nombre });
    }
    if (!o || o.recuperar_token_hash !== h || !o.recuperar_token_vence || o.recuperar_token_vence < ahora) {
      return json({ ok: false, error: "Este enlace ya no sirve: venció o ya se usó. Pide otro desde Pareo Integral." }, 410);
    }
    const clave = claveNueva();
    const { error } = await admin.from("pareo_organizadores")
      .update({ clave_hash: await sha256(clave), recuperar_token_hash: null, recuperar_token_vence: null, actualizado: ahora }).eq("id", oid);
    if (error) return json({ ok: false, error: "No se pudo recuperar. Intenta de nuevo." }, 502);
    return json({ ok: true, id: oid, clave, nombre: o.nombre, logo: o.logo });
  }

  if (accion === "recuperar") {
    const correo = texto(body.correo, 200).toLowerCase();
    if (!CORREO.test(correo)) return json({ ok: false, error: "Ese correo no parece bien escrito." }, 400);
    const { data: freno, error: frenoError } = await admin.rpc("pareo_correo_frenar", { p_ip: ipDe(req), p_ambito: "recuperar" });
    if (frenoError) return json({ ok: false, error: "No se pudo mandar. Intenta de nuevo." }, 502);
    if (freno) return json({ ok: false, error: freno }, 429);
    // Siempre la misma respuesta: no se le dice a nadie si un correo está registrado.
    const { data: orgs } = await admin.from("pareo_organizadores").select("id, nombre").eq("correo", correo).not("correo_confirmado", "is", null).limit(5);
    const cuales: { nombre: string; url: string }[] = [];
    for (const o of orgs ?? []) {
      const token = claveNueva();
      const { error } = await admin.from("pareo_organizadores").update({ recuperar_token_hash: await sha256(token), recuperar_token_vence: vence(1) }).eq("id", o.id);
      if (!error) cuales.push({ nombre: o.nombre, url: `${SITE_URL}/pareo.html#org-recuperar=${o.id}.${token}` });
    }
    if (cuales.length) await mandar([correo], correoRecuperar(cabecera("Recupera tu organización"), cuales));
    return json({ ok: true });
  }

  // ---------- Reportar un torneo ----------
  if (accion === "reportar") {
    const pid = texto(body.id, 40);
    const motivo = texto(body.motivo, 30);
    if (!UUID.test(pid)) return json({ ok: false, error: "Ese torneo no existe." }, 400);
    if (!MOTIVOS.has(motivo)) return json({ ok: false, error: "Elige por qué lo reportas." }, 400);
    const { data: pub } = await admin.from("pareo_publicados").select("id").eq("id", pid).maybeSingle();
    if (!pub) return json({ ok: false, error: "Ese torneo ya no está publicado." }, 404);
    const { data: freno, error: frenoError } = await admin.rpc("pareo_reportar_frenar", { p_ip: ipDe(req) });
    if (frenoError) return json({ ok: false, error: "No se pudo mandar. Intenta de nuevo." }, 502);
    if (freno) return json({ ok: false, error: freno }, 429);
    const detalle = texto(body.detalle, 500);
    const { error } = await admin.from("pareo_reportes").insert({ publicado_id: pid, motivo, detalle });
    if (error) return json({ ok: false, error: "No se pudo mandar. Intenta de nuevo." }, 502);
    // El aviso a administración y a quien organiza (si confirmó su correo).
    const { data: t } = await admin.from("pareo_publicados").select("nombre, organizador_id").eq("id", pid).maybeSingle();
    const nombreT = (t && t.nombre) || "un torneo";
    await mandar(await correosAdmin(), correoReporteAdmin(cabecera("Reportaron un torneo"), nombreT, motivo, detalle, `${SITE_URL}/admin-pareo.html`));
    const suyo = await correoDe(t && t.organizador_id);
    if (suyo) await mandar([suyo], correoReporteOrganizador(cabecera("Reportaron tu torneo"), nombreT, motivo, `${SITE_URL}/torneos-pareo.html#t=${pid}`));
    return json({ ok: true });
  }

  if (accion === "borrar") {
    const pid = texto(body.id, 40);
    const clave = texto(body.clave, 100);
    if (!/^[0-9a-f-]{36}$/.test(pid) || !clave) return json({ ok: false, error: "Falta la clave de este torneo." }, 400);
    const { data: fila } = await admin.from("pareo_publicados").select("clave_hash").eq("id", pid).maybeSingle();
    if (!fila) return json({ ok: true, id: pid });
    if (fila.clave_hash !== await sha256(clave)) return json({ ok: false, error: "La clave no es la de este torneo." }, 403);
    const { error } = await admin.from("pareo_publicados").delete().eq("id", pid);
    if (error) return json({ ok: false, error: "No se pudo quitar. Intenta de nuevo." }, 502);
    return json({ ok: true, id: pid });
  }

  // ---------- La inscripción antes del torneo ----------
  if (accion === "inscribir") {
    const pid = texto(body.id, 40);
    if (!/^[0-9a-f-]{36}$/.test(pid)) return json({ ok: false, error: "Ese torneo no existe." }, 400);
    if (body.consentimiento !== true) return json({ ok: false, error: "Falta aceptar la política de privacidad." }, 400);
    const x = esObj(body.inscripcion) ? body.inscripcion : {};
    const fila = {
      publicado_id: pid, nombre: texto(x.nombre, 100), institucion: texto(x.institucion, 100), categoria: texto(x.categoria, 30),
      elo: Number(x.elo) > 0 ? Math.min(3500, Math.round(Number(x.elo))) : null,
      fide_id: /^[0-9]{1,12}$/.test(texto(x.fideId, 12)) ? texto(x.fideId, 12) : "",
      responsable: texto(x.responsable, 100), contacto: texto(x.contacto, 120), nota: texto(x.nota, 300),
      consentimiento: new Date().toISOString(),
    };
    if (fila.nombre.length < 2) return json({ ok: false, error: "Escribe el nombre de quien juega." }, 400);
    if (fila.responsable.length < 2 || fila.contacto.length < 5) return json({ ok: false, error: "Escribe quién inscribe y cómo contactarle (correo o teléfono)." }, 400);
    const { data: pub } = await admin.from("pareo_publicados").select("datos, nombre, organizador_id").eq("id", pid).maybeSingle();
    if (!pub) return json({ ok: false, error: "Ese torneo ya no está publicado." }, 404);
    const ins = esObj(pub.datos) && esObj(pub.datos.inscripcion) ? pub.datos.inscripcion : null;
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
    if (!ins || ins.abierta !== true || (typeof ins.hasta === "string" && ins.hasta && ins.hasta < hoy)) {
      return json({ ok: false, error: "La inscripción de este torneo está cerrada." }, 409);
    }
    const { data: freno, error: frenoError } = await admin.rpc("pareo_inscribir_frenar", { p_ip: ipDe(req), p_publicado: pid });
    if (frenoError) return json({ ok: false, error: "No se pudo inscribir. Intenta de nuevo." }, 502);
    if (freno) return json({ ok: false, error: freno }, 429);
    const { error } = await admin.from("pareo_preinscripciones").insert(fila);
    if (error) return json({ ok: false, error: "No se pudo inscribir. Revisa los datos e intenta de nuevo." }, 502);
    const suyo = await correoDe(pub.organizador_id);
    if (suyo) await mandar([suyo], correoInscripcion(cabecera("Nueva inscripción"), pub.nombre, fila));
    return json({ ok: true });
  }

  if (accion === "inscripciones" || accion === "marcar") {
    const pid = texto(body.id, 40);
    const clave = texto(body.clave, 100);
    if (!/^[0-9a-f-]{36}$/.test(pid) || !clave) return json({ ok: false, error: "Falta la clave de este torneo." }, 400);
    const { data: fila } = await admin.from("pareo_publicados").select("clave_hash").eq("id", pid).maybeSingle();
    if (!fila) return json({ ok: false, error: "Ese torneo ya no está publicado.", noExiste: true }, 404);
    if (fila.clave_hash !== await sha256(clave)) return json({ ok: false, error: "La clave no es la de este torneo." }, 403);
    if (accion === "inscripciones") {
      const { data, error } = await admin.from("pareo_preinscripciones")
        .select("id, nombre, institucion, categoria, elo, fide_id, responsable, contacto, nota, estado, creado")
        .eq("publicado_id", pid).order("creado").range(0, 999);
      if (error) return json({ ok: false, error: "No se pudieron leer las inscripciones." }, 502);
      return json({ ok: true, inscripciones: data || [] });
    }
    const estado = texto(body.estado, 20);
    if (!["aceptada", "rechazada", "pendiente"].includes(estado)) return json({ ok: false, error: "Estado inválido." }, 400);
    const cuales = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/.test(x)).slice(0, 400) : [];
    if (!cuales.length) return json({ ok: true });
    const { error } = await admin.from("pareo_preinscripciones").update({ estado }).eq("publicado_id", pid).in("id", cuales);
    if (error) return json({ ok: false, error: "No se pudo guardar. Intenta de nuevo." }, 502);
    return json({ ok: true });
  }

  // ---------- Seguir a un jugador por correo ----------
  if (accion === "seguir_correo") {
    const nombre = texto(body.nombre, 100), ident = texto(body.ident, 40);
    const correo = texto(body.correo, 200).toLowerCase();
    if (nombre.length < 2) return json({ ok: false, error: "Falta el nombre del jugador." }, 400);
    if (ident && !/^[0-9a-f]{24}$/.test(ident)) return json({ ok: false, error: "Ese jugador no se reconoce." }, 400);
    if (!CORREO.test(correo)) return json({ ok: false, error: "Ese correo no parece bien escrito." }, 400);
    if (body.consentimiento !== true) return json({ ok: false, error: "Falta aceptar la política de privacidad." }, 400);
    const { data: freno, error: frenoError } = await admin.rpc("pareo_correo_frenar", { p_ip: ipDe(req), p_ambito: "seguir" });
    if (frenoError) return json({ ok: false, error: "No se pudo mandar. Intenta de nuevo." }, 502);
    if (freno) return json({ ok: false, error: freno }, 429);
    const token = claveNueva();
    // La misma respuesta pase lo que pase: no dice qué correos siguen a quién.
    const { data: fila, error } = await admin.rpc("pareo_suscribir", {
      p_correo: correo, p_nombre: nombre, p_ident: ident, p_token_hash: await sha256(token), p_vence: vence(48),
    });
    if (!error && fila) await mandar([correo], correoSeguirConfirmar(cabecera("Confirma los avisos"), nombre, `${SITE_URL}/torneos-pareo.html#seguir-ok=${fila}.${token}`));
    return json({ ok: true });
  }
  if (accion === "seguir_confirmar" || accion === "seguir_baja") {
    const sid = texto(body.id, 40), token = texto(body.token, 100);
    if (!UUID.test(sid) || !/^[0-9a-f]{20,100}$/.test(token)) return json({ ok: false, error: "El enlace no está completo. Ábrelo otra vez desde el correo." }, 400);
    if (accion === "seguir_baja") {
      if (token !== (await hmac("baja:" + sid)).slice(0, 32)) return json({ ok: false, error: "Este enlace no es válido." }, 403);
      await admin.from("pareo_suscripciones").delete().eq("id", sid);
      return json({ ok: true });
    }
    const { data: s } = await admin.from("pareo_suscripciones").select("nombre, token_hash, token_vence").eq("id", sid).maybeSingle();
    if (!s || s.token_hash !== await sha256(token) || !s.token_vence || s.token_vence < new Date().toISOString()) {
      return json({ ok: false, error: "Este enlace ya no sirve: venció o ya se usó. Vuelve a pedir los avisos desde la ficha del jugador." }, 410);
    }
    const { error } = await admin.from("pareo_suscripciones").update({ confirmada: true, token_hash: null, token_vence: null }).eq("id", sid);
    if (error) return json({ ok: false, error: "No se pudo confirmar. Intenta de nuevo." }, 502);
    return json({ ok: true, nombre: s.nombre });
  }

  // ---------- Seguir a un jugador en este aparato (push) ----------
  // Sin confirmación por correo: el permiso lo da la persona en su
  // navegador. El primer aviso, «Listo», comprueba que llega.
  if (accion === "push_llave") {
    const llaves = await llavesPush();
    return llaves ? json({ ok: true, llave: llaves.publica }) : json({ ok: false, error: "Los avisos en el celular no están listos todavía." }, 503);
  }
  if (accion === "seguir_push") {
    const nombre = texto(body.nombre, 100), ident = texto(body.ident, 40);
    const sus = (body.suscripcion ?? {}) as Obj, claves = (sus.keys ?? {}) as Obj;
    const endpoint = texto(sus.endpoint, 1000), p256dh = texto(claves.p256dh, 200), auth = texto(claves.auth, 100);
    if (nombre.length < 2) return json({ ok: false, error: "Falta el nombre del jugador." }, 400);
    if (ident && !/^[0-9a-f]{24}$/.test(ident)) return json({ ok: false, error: "Ese jugador no se reconoce." }, 400);
    if (!SERVICIO_PUSH.test(endpoint) || !/^[A-Za-z0-9_-]{20,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,100}$/.test(auth)) {
      return json({ ok: false, error: "Este navegador no dio una dirección de avisos válida." }, 400);
    }
    const llaves = await llavesPush();
    if (!llaves) return json({ ok: false, error: "Los avisos en el celular no están listos todavía." }, 503);
    const { data: freno, error: frenoError } = await admin.rpc("pareo_correo_frenar", { p_ip: ipDe(req), p_ambito: "seguir" });
    if (frenoError) return json({ ok: false, error: "No se pudo guardar. Intenta de nuevo." }, 502);
    if (freno) return json({ ok: false, error: freno }, 429);
    const { data: r, error } = await admin.rpc("pareo_suscribir_push", { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_nombre: nombre, p_ident: ident });
    if (error || r === "invalido") return json({ ok: false, error: "No se pudo guardar. Intenta de nuevo." }, 502);
    if (r === "tope") return json({ ok: false, error: "En este aparato ya sigues a 20 jugadores: deja de seguir a alguno para agregar otro." }, 409);
    const prueba = await mandarPush({ endpoint, p256dh, auth }, {
      titulo: "Listo: sigues a " + nombre,
      cuerpo: "Te vamos a avisar acá su mesa en cada ronda y cómo terminó cada torneo publicado en Pareo Integral.",
      url: "/torneos-pareo.html#" + new URLSearchParams(ident ? { p: nombre, i: ident } : { p: nombre }).toString(),
      etiqueta: "pareo-seguir",
    }, llaves, CONTACTO_PUSH);
    if (!prueba.ok && prueba.caduca) {
      await admin.rpc("pareo_baja_push", { p_endpoint: endpoint, p_nombre: "", p_ident: "" });
      return json({ ok: false, error: "Este navegador no aceptó el aviso de prueba. Revisa el permiso de notificaciones e intenta de nuevo." }, 400);
    }
    return json({ ok: true });
  }
  if (accion === "seguir_push_baja") {
    const sus = (body.suscripcion ?? {}) as Obj;
    const endpoint = texto(sus.endpoint ?? body.endpoint, 1000);
    if (!SERVICIO_PUSH.test(endpoint)) return json({ ok: false, error: "Falta la dirección de este aparato." }, 400);
    // Con nombre, deja de seguir a ese; sin nombre, a todos en este aparato.
    await admin.rpc("pareo_baja_push", { p_endpoint: endpoint, p_nombre: texto(body.nombre, 100), p_ident: texto(body.ident, 40) });
    return json({ ok: true });
  }

  return json({ ok: false, error: "Acción desconocida." }, 400);
});
