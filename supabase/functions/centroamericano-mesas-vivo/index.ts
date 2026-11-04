// centroamericano-mesas-vivo: las mesas de cada árbitro EN VIVO, sin el atraso de la transmisión pública (Centroamericano 2026).
//
// La transmisión pública de Lichess va con 15 min de atraso a propósito (juego limpio: nadie de afuera ayuda con la
// partida en vivo). Quien organiza arma en Lichess una SEGUNDA transmisión, PRIVADA y sin atraso, con la misma
// fuente (LiveChess, o «Transmitir sin LiveChess» de Pareo para DGT, que empuja a las dos), y la conecta en
// centroamericano-mesas.html con su clave de Lichess (scope study:read). Una transmisión privada solo la ve su dueño:
// esta función la lee con esa clave (de la bóveda) y a cada tablet le da SOLO sus mesas, como ya hace con todo.
// Ver «La transmisión sin atraso para los árbitros» en docs/decisiones/juegos-y-torneos.md.
//
// Va aparte de centroamericano-mesa para no volver a desplegar esa función en medio del torneo (lo mismo que
// centroamericano-fair-play). verify_jwt en FALSE: la tablet no trae JWT; la función decide sola:
//   - "mesas"      {arbitro_token}  → la tablet: sus mesas de la ronda abierta, con la posición y los relojes en vivo
//   - con el JWT de quien llama y tengo_herramienta('mesa-arbitro') (la organización):
//     "estado"     {}               → si está conectada, desde cuándo, y qué torneos y rondas ve (nunca la clave)
//     "conectar"   {enlace, token}  → prueba la clave y la transmisión contra Lichess y solo entonces las guarda.
//                                     `enlace` puede traer varios (uno por renglón o separados por espacios): un grupo de
//                                     LiveChess es UN enlace; Pareo para DGT crea un torneo por categoría.
//     "quitar"     {}
//
// Nunca devuelve la clave ni el enlace de la transmisión privada (la tablet no tiene cómo abrirla en Lichess: no es
// suya). Lo que devuelve de cada mesa es lo que el árbitro ya ve en el tablero: la posición, la última jugada y los
// relojes.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LICHESS = "https://lichess.org";
const AGENTE = "AjedrezIntegral-MesasEnVivo/1.0";
const TORNEOS_MS = 60_000;    // la lista de torneos y rondas de la transmisión privada
const RONDA_MS = 4_000;       // las partidas de una ronda: 15 tablets cada 10 s piden lo mismo, Lichess lo ve UNA vez

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ---- los nombres: la MISMA regla que js/centroamericano-transmision-reloj.js (verificar-centroamericano-mesas-vivo.js
// comprueba que las dos copias dicen lo mismo, letra por letra).
const palabras = (s: unknown) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-zñ0-9\s]/g, " ").split(/\s+/).filter((x) => x.length > 1);
function mismoJugador(a: unknown, b: unknown) {
  const pa = new Set(palabras(a)), pb = palabras(b);
  if (!pa.size || !pb.length) return false;
  const comunes = pb.filter((x) => pa.has(x)).length;
  return comunes >= 2 || (comunes >= 1 && Math.min(pa.size, pb.length) === 1);
}

// ---- Lichess, con la clave de quien organiza
async function lichess(ruta: string, token: string) {
  const r = await fetch(LICHESS + ruta, { headers: { Authorization: "Bearer " + token, Accept: "application/json", "User-Agent": AGENTE }, signal: AbortSignal.timeout(12_000) });
  if (r.status === 401) throw Object.assign(new Error("Lichess no aceptó la clave (venció o la borraron): hay que volver a conectarla."), { estado: 424 });
  if (r.status === 404) throw Object.assign(new Error("Lichess no encuentra esa transmisión con esa clave (¿es de otra cuenta?)."), { estado: 424 });
  if (r.status === 429) throw Object.assign(new Error("Lichess pide esperar un momento."), { estado: 503 });
  if (!r.ok) throw Object.assign(new Error("Lichess contestó " + r.status + "."), { estado: 502 });
  return await r.json();
}

type Ronda = { id: string; numero: number; delay: number };
type Torneo = { id: string; nombre: string; rondas: Ronda[] };
let torneosCache: { clave: string; leido: number; lista: Torneo[] } | null = null;
const rondasCache = new Map<string, { leido: number; datos: Promise<{ delay: number; games: unknown[] }> }>();

const numeroDe = (nombre: unknown, i: number) => Number((String(nombre || "").match(/(\d+)/) || [])[1]) || i + 1;

// Los torneos de la transmisión privada con sus rondas: `ids` son los guardados, separados por comas; si uno es de
// un grupo, entran todos los del grupo.
async function torneos(ids: string, token: string): Promise<Torneo[]> {
  const clave = ids + "|" + token.slice(-6);
  if (torneosCache && torneosCache.clave === clave && Date.now() - torneosCache.leido < TORNEOS_MS) return torneosCache.lista;
  const lista: Torneo[] = [];
  for (const id of ids.split(",").filter(Boolean)) {
    if (lista.some((t) => t.id === id)) continue;
    // deno-lint-ignore no-explicit-any
    const d: any = await lichess("/api/broadcast/" + id, token);
    const delGrupo: { id: string; name: string }[] = d.group?.tours?.length ? d.group.tours : [{ id: d.tour.id, name: d.tour.name }];
    for (const t of delGrupo) {
      if (lista.some((x) => x.id === t.id)) continue;
      // deno-lint-ignore no-explicit-any
      const det: any = t.id === d.tour?.id ? d : await lichess("/api/broadcast/" + t.id, token);
      // deno-lint-ignore no-explicit-any
      lista.push({ id: t.id, nombre: String(t.name || ""), rondas: (det.rounds || []).map((r: any, i: number) => ({ id: r.id, numero: numeroDe(r.name, i), delay: Number(r.delay) || 0 })) });
    }
  }
  torneosCache = { clave, leido: Date.now(), lista };
  return lista;
}

function partidasDe(idRonda: string, token: string) {
  const c = rondasCache.get(idRonda);
  if (c && Date.now() - c.leido < RONDA_MS) return c.datos;
  // deno-lint-ignore no-explicit-any
  const datos = lichess("/api/broadcast/-/-/" + idRonda, token).then((d: any) => ({ delay: Number(d.round?.delay) || 0, games: d.games || [] }));
  datos.catch(() => rondasCache.delete(idRonda));
  rondasCache.set(idRonda, { leido: Date.now(), datos });
  return datos;
}

// El id de 8 letras de un enlace de transmisión de Lichess (de un torneo o de una ronda).
function idDeEnlace(texto: unknown): { id: string; es: "torneo" | "ronda" } | null {
  const t = String(texto ?? "").trim();
  if (/^[A-Za-z0-9]{8}$/.test(t)) return { id: t, es: "torneo" };
  let u: URL;
  try { u = new URL(t); } catch { return null; }
  if (!/(^|\.)lichess\.org$/.test(u.hostname)) return null;
  const p = u.pathname.split("/").filter(Boolean);
  if (p[0] !== "broadcast") return null;
  const ok = (s?: string) => /^[A-Za-z0-9]{8}$/.test(s || "");
  if (p.length === 3 && ok(p[2])) return { id: p[2], es: "torneo" };
  if ((p.length === 4 || p.length === 5) && ok(p[3])) return { id: p[3], es: "ronda" };
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);
  let cuerpo: Record<string, unknown> = {};
  try { cuerpo = await req.json(); } catch { cuerpo = {}; }
  const servicio = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const accion = String(cuerpo.action ?? "");

  const configuracion = async () => {
    const { data } = await servicio.rpc("centroamericano_vivo_leer");
    const f = (Array.isArray(data) ? data[0] : data) as { enlace: string | null; token: string | null; actualizado: string | null } | null;
    return f && f.enlace && f.token ? { enlace: f.enlace, token: f.token, actualizado: f.actualizado } : null;
  };

  try {
    // ------------------------------------------------------------ la tablet del árbitro: SUS mesas, en vivo
    if (accion === "mesas") {
      const t = String(cuerpo.arbitro_token ?? "").trim();
      if (!/^[0-9a-f]{64}$/.test(t)) return json({ error: "Enlace inválido." }, 404);
      const { data: a } = await servicio.from("centroamericano_asignaciones").select("tnr, mesa_desde, mesa_hasta, vence, revocada").eq("token", t).maybeSingle();
      if (!a || a.revocada || new Date(a.vence).getTime() <= Date.now()) return json({ error: "Enlace inválido." }, 404);
      const conf = await configuracion();
      if (!conf) return json({ ok: true, conectada: false, mesas: [] });
      // Los jugadores de sus mesas salen de la lectura compartida de chess-results (la que ya usa centroamericano-mesa),
      // no de lo que diga la tablet: así un enlace no puede pedir las partidas de otras mesas.
      const { data: l } = await servicio.from("centroamericano_lecturas").select("ronda, mesas, leida").eq("tnr", a.tnr).maybeSingle();
      const ronda = Number(l?.ronda) || 0;
      const suyas = ((l?.mesas ?? []) as { mesa: number; blancas: string; negras: string }[]).filter((m) => m.mesa >= a.mesa_desde && m.mesa <= a.mesa_hasta && m.blancas && m.negras);
      if (!ronda || !suyas.length) return json({ ok: true, conectada: true, ronda, mesas: [] });
      const lista = await torneos(conf.enlace, conf.token);
      const out: Record<string, unknown>[] = [];
      let delay = 0;
      for (const tor of lista) {
        const r = tor.rondas.find((x) => x.numero === ronda);
        if (!r) continue;
        const d = await partidasDe(r.id, conf.token);
        for (const g of d.games as { fen?: string; lastMove?: string; status?: string; thinkTime?: number; players?: { name?: string; clock?: number }[] }[]) {
          const pl = g.players || [];
          const m = suyas.find((x) => !out.some((o) => o.mesa === x.mesa) && mismoJugador(x.blancas, pl[0]?.name) && mismoJugador(x.negras, pl[1]?.name));
          if (!m) continue;
          delay = Math.max(delay, d.delay);
          out.push({ mesa: m.mesa, fen: String(g.fen || ""), ultima: String(g.lastMove || ""), estado: String(g.status || "*"),
            reloj_b: typeof pl[0]?.clock === "number" ? pl[0].clock : null, reloj_n: typeof pl[1]?.clock === "number" ? pl[1].clock : null,
            piensa: typeof g.thinkTime === "number" ? g.thinkTime : null });
        }
        if (out.length === suyas.length) break;
      }
      return json({ ok: true, conectada: true, ronda, delay, leida: new Date().toISOString(), mesas: out.sort((x, y) => Number(x.mesa) - Number(y.mesa)) });
    }

    // ------------------------------------------------------------ la organización
    const autorizacion = req.headers.get("Authorization") ?? "";
    if (!/^Bearer\s+\S+/i.test(autorizacion)) return json({ error: "Falta la sesión." }, 401);
    const comoQuienLlama = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: autorizacion } } });
    const { data: puede, error: ePuede } = await comoQuienLlama.rpc("tengo_herramienta", { p_herramienta: "mesa-arbitro" });
    if (ePuede || puede !== true) return json({ error: "Solo la organización (herramienta «Mesa del árbitro»)." }, 403);

    if (accion === "estado") {
      const conf = await configuracion();
      if (!conf) return json({ ok: true, conectada: false });
      try {
        const lista = await torneos(conf.enlace, conf.token);
        return json({ ok: true, conectada: true, actualizado: conf.actualizado,
          torneos: lista.map((t) => ({ nombre: t.nombre, rondas: t.rondas.length, conAtraso: t.rondas.filter((r) => r.delay > 0).map((r) => r.numero) })) });
      } catch (e) {
        return json({ ok: true, conectada: true, actualizado: conf.actualizado, error: (e as Error).message });
      }
    }
    if (accion === "conectar") {
      const token = String(cuerpo.token ?? "").trim();
      const textos = String(cuerpo.enlace ?? "").split(/[\s,]+/).filter(Boolean);
      const enlaces = textos.map(idDeEnlace);
      if (!textos.length || enlaces.some((x) => !x)) return json({ error: "Pega el enlace de la transmisión privada (lichess.org/broadcast/…); si son varios torneos, uno por renglón." }, 400);
      if (enlaces.length > 30) return json({ error: "Son demasiados enlaces (hasta 30)." }, 400);
      if (!/^lip_[A-Za-z0-9]{16,64}$/.test(token)) return json({ error: "La clave de Lichess empieza con «lip_»: créala en lichess.org/account/oauth/token con el permiso «Leer estudios y transmisiones privados»." }, 400);
      // La clave: que exista y tenga el permiso de leer transmisiones privadas (study:read).
      const prueba = await fetch(LICHESS + "/api/token/test", { method: "POST", body: token, headers: { "User-Agent": AGENTE }, signal: AbortSignal.timeout(12_000) });
      const info = prueba.ok ? (await prueba.json())[token] : null;
      if (!info) return json({ error: "Lichess no reconoce esa clave." }, 400);
      if (!String(info.scopes || "").split(",").includes("study:read")) return json({ error: "A la clave le falta el permiso «Leer estudios y transmisiones privados» (study:read)." }, 400);
      // La transmisión: que esa clave la abra. Con el enlace de una ronda, se busca su torneo.
      const ids: string[] = [];
      for (const enl of enlaces as { id: string; es: string }[]) {
        // deno-lint-ignore no-explicit-any
        const id = enl.es === "ronda" ? ((await lichess("/api/broadcast/-/-/" + enl.id, token)) as any).tour.id : enl.id;
        if (!ids.includes(id)) ids.push(id);
      }
      torneosCache = null;
      const lista = await torneos(ids.join(","), token);
      if (!lista.length) return json({ error: "Esa transmisión no tiene torneos." }, 400);
      const { error } = await servicio.rpc("centroamericano_vivo_guardar", { p_enlace: ids.join(","), p_token: token });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, conectada: true, torneos: lista.map((t) => ({ nombre: t.nombre, rondas: t.rondas.length, conAtraso: t.rondas.filter((r) => r.delay > 0).map((r) => r.numero) })) });
    }
    if (accion === "quitar") {
      const { error } = await servicio.rpc("centroamericano_vivo_quitar");
      if (error) return json({ error: error.message }, 400);
      torneosCache = null; rondasCache.clear();
      return json({ ok: true, conectada: false });
    }
    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    const err = e as Error & { estado?: number };
    return json({ error: err.message || String(err) }, err.estado || 400);
  }
});
