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
// ni nada que no se vea en una tabla de posiciones.
//
// Ver «Torneos en Pareo Integral: el espacio público» en
// docs/decisiones/juegos-y-torneos.md.

import { createClient } from "npm:@supabase/supabase-js@2";

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

function persona(v: unknown) {
  if (!esObj(v) || !id(v.id)) return null;
  const nombre = texto(v.nombre, 100);
  if (!nombre) return null;
  return {
    id: v.id as string, nombre,
    institucion: texto(v.institucion, 100), elo: Math.round(numero(v.elo, 0, 3500)),
    titulo: texto(v.titulo, 4), fed: texto(v.fed, 4), categoria: texto(v.categoria, 30),
    retiradoDespuesDe: v.retiradoDespuesDe == null ? null : Math.round(numero(v.retiradoDespuesDe, 0, 99)),
    ...(Array.isArray(v.integrantes) ? { integrantes: lista(v.integrantes, 12, persona) } : {}),
  };
}

function mesa(v: unknown) {
  if (!esObj(v) || !id(v.b)) return null;
  const m: Obj = { b: v.b, n: v.n == null ? null : id(v.n), r: resultado(v.r) };
  if (v.n != null && m.n === null) return null;
  if (Array.isArray(v.partidas)) m.partidas = lista(v.partidas, 12, (p) => (esObj(p) ? { r: resultado(p.r) } : null));
  if (esObj(v.alineacion)) m.alineacion = { b: ids(v.alineacion.b, 12), n: ids(v.alineacion.n, 12) };
  // La partida en PGN (la valida el navegador con chess.js al anotarla y al
  // mostrarla): acá solo se acota el tamaño y se quitan los caracteres de control.
  const pgn = typeof v.pgn === "string" ? v.pgn.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, 12000).trim() : "";
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
    federacion: texto(v.federacion, 4), fechaInicio: fecha(v.fechaInicio), fechaFin: fecha(v.fechaFin),
    arbitro: texto(v.arbitro, 100), arbitroAdjunto: texto(v.arbitroAdjunto, 100), ritmo: texto(v.ritmo, 80),
    // Si el torneo cambia el Elo de quien juega (lo dice la lista pública).
    validoElo: ["fide", "nacional", "no"].includes(v.validoElo as string) ? v.validoElo as string : "",
    sistema: v.sistema === "todos" ? "todos" : "suizo", dobleVuelta: v.dobleVuelta === true,
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
  };
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);
  const crudo = await req.text();
  if (crudo.length > 3_000_000) return json({ ok: false, error: "El torneo es demasiado grande para publicarlo." }, 413);
  let body: Obj;
  try { body = JSON.parse(crudo); } catch { return json({ ok: false, error: "Cuerpo JSON inválido" }, 400); }
  const accion = texto(body.accion, 20);

  if (accion === "crear" || accion === "actualizar") {
    const t = limpiar(body.torneo);
    if (!t) return json({ ok: false, error: "El torneo llegó sin nombre o con una forma inválida." }, 400);
    if (!t.jugadores.length && !t.anuncio) return json({ ok: false, error: "El torneo todavía no tiene jugadores." }, 400);

    if (accion === "actualizar") {
      const pid = texto(body.id, 40);
      const clave = texto(body.clave, 100);
      if (!/^[0-9a-f-]{36}$/.test(pid) || !clave) return json({ ok: false, error: "Falta la clave de este torneo." }, 400);
      const { data: fila } = await admin.from("pareo_publicados").select("clave_hash, actualizado").eq("id", pid).maybeSingle();
      if (!fila) return json({ ok: false, error: "Ese torneo ya no está publicado.", noExiste: true }, 404);
      if (fila.clave_hash !== await sha256(clave)) return json({ ok: false, error: "La clave no es la de este torneo." }, 403);
      const { data: freno, error: frenoError } = await admin.rpc("pareo_frenar", { p_ip: ipDe(req), p_crear: false });
      if (frenoError) return json({ ok: false, error: "No se pudo actualizar. Intenta de nuevo." }, 502);
      if (freno) return json({ ok: false, error: freno }, 429);
      const { error } = await admin.from("pareo_publicados").update({ ...columnas(t), datos: t, actualizado: new Date().toISOString() }).eq("id", pid);
      if (error) return json({ ok: false, error: "No se pudo actualizar. Intenta de nuevo." }, 502);
      return json({ ok: true, id: pid });
    }

    const { data: freno, error: frenoError } = await admin.rpc("pareo_frenar", { p_ip: ipDe(req), p_crear: true });
    if (frenoError) return json({ ok: false, error: "No se pudo publicar. Intenta de nuevo." }, 502);
    if (freno) return json({ ok: false, error: freno }, 429);
    const clave = claveNueva();
    const { data, error } = await admin.from("pareo_publicados").insert({ ...columnas(t), datos: t, clave_hash: await sha256(clave) }).select("id").single();
    if (error || !data) return json({ ok: false, error: "No se pudo publicar. Intenta de nuevo." }, 502);
    return json({ ok: true, id: data.id, clave });
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
    const { data: pub } = await admin.from("pareo_publicados").select("datos").eq("id", pid).maybeSingle();
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

  return json({ ok: false, error: "Acción desconocida." }, 400);
});
