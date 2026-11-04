// centroamericano-mesas-vivo: las mesas de cada árbitro EN VIVO, sin el atraso de la transmisión pública (Centroamericano 2026).
//
// La transmisión pública de Lichess va con 15 min de atraso a propósito (juego limpio: nadie de afuera ayuda con la
// partida en vivo). Quien organiza arma en Lichess una SEGUNDA transmisión, PRIVADA y sin atraso, con la misma
// fuente (LiveChess, o «Transmitir sin LiveChess» de Pareo para DGT, que empuja a las dos), y la conecta en
// centroamericano-mesas.html con su clave de Lichess (scope study:read). Una transmisión privada solo la ve su dueño:
// esta función la lee con esa clave (de la bóveda) y a cada tablet le da SOLO sus mesas, como ya hace con todo.
// Ver «La transmisión sin atraso para los árbitros» en docs/decisiones/juegos-y-torneos.md.
//
// LIVECHESS (lo que se usa en el Centroamericano): la organización de los tableros DGT pasó un enlace del visor de
// LiveChess Cloud por categoría, SIN atraso (centroamericano_livechess, que solo lee esta función). Si la categoría
// de un enlace lo tiene, sus mesas salen de ahí (las jugadas con el reloj después de cada una); si no, de la
// transmisión privada de Lichess. Ver «Los tableros por LiveChess, sin atraso».
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
//     "livechess"  {}               → los enlaces de LiveChess guardados, por torneo (solo la organización)
//     "livechess_guardar" {texto}   → pega la tabla de la organización de tableros («SUB-18 ABS  1-5  https://view.
//                                     livechesscloud.com/#<id>», un renglón por categoría): cada una se prueba contra
//                                     LiveChess y se guarda con su torneo de chess-results
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

// ---- LiveChess Cloud: público y sin atraso (por eso el id no sale nunca de esta función)
const LIVECHESS = "https://1.pool.livechesscloud.com/get/";
const INDICE_MS = 15_000, PARTIDA_MS = 3_000;
const lcCache = new Map<string, { leido: number; datos: Promise<unknown> }>();
function lcPedir(ruta: string, ms: number) {
  const c = lcCache.get(ruta);
  if (c && Date.now() - c.leido < ms) return c.datos;
  const datos = fetch(LIVECHESS + ruta, { headers: { "User-Agent": AGENTE }, signal: AbortSignal.timeout(10_000) })
    .then((r) => { if (r.status === 404) return null; if (!r.ok) throw Object.assign(new Error("LiveChess contestó " + r.status + "."), { estado: 502 }); return r.json(); });
  datos.catch(() => lcCache.delete(ruta));
  lcCache.set(ruta, { leido: Date.now(), datos });
  return datos;
}
// «Guevara Ruiz, Santiago» de chess-results contra { fname, mname, lname } de LiveChess.
// deno-lint-ignore no-explicit-any
const nombreLc = (p: any) => [p?.lname, p?.fname, p?.mname].filter(Boolean).join(" ");
const RESULTADO_LC: Record<string, string> = { WHITEWIN: "1-0", BLACKWIN: "0-1", DRAW: "½-½" };
// Los tableros que transmite: «1-5», «1-3, 7».
function tablerosDe(t: string): Set<number> {
  const out = new Set<number>();
  for (const parte of String(t || "").split(",")) {
    const m = parte.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) continue;
    for (let i = Number(m[1]); i <= Number(m[2] || m[1]) && i <= 200; i++) out.add(i);
  }
  return out;
}
// Las partidas de SUS mesas en LiveChess: la mesa de chess-results es el tablero de LiveChess, y los dos nombres
// tienen que coincidir (si no, esa mesa no se da: mejor nada que la partida de otro).
async function mesasLivechess(lc: { torneo_id: string; tableros: string }, ronda: number, suyas: { mesa: number; blancas: string; negras: string }[]) {
  // deno-lint-ignore no-explicit-any
  const indice: any = await lcPedir(lc.torneo_id + "/round-" + ronda + "/index.json", INDICE_MS);
  const pareos = (indice && indice.pairings) || [];
  const tabs = tablerosDe(lc.tableros);
  const out: Record<string, unknown>[] = [];
  const noReconoce: { mesa: number; motivo: string }[] = [];
  await Promise.all(suyas.map(async (m) => {
    if (tabs.size && !tabs.has(m.mesa)) return;   // esa mesa no tiene tablero electrónico
    const p = pareos[m.mesa - 1];
    if (!p) { noReconoce.push({ mesa: m.mesa, motivo: "La transmisión todavía no tiene el pareo de esta ronda." }); return; }
    if (!(mismoJugador(m.blancas, nombreLc(p.white)) && mismoJugador(m.negras, nombreLc(p.black)))) {
      noReconoce.push({ mesa: m.mesa, motivo: "En la transmisión, el tablero " + m.mesa + " tiene otros jugadores." });
      return;
    }
    // deno-lint-ignore no-explicit-any
    const g: any = await lcPedir(lc.torneo_id + "/round-" + ronda + "/game-" + m.mesa + ".json?poll", PARTIDA_MS);
    if (!g) { noReconoce.push({ mesa: m.mesa, motivo: "La transmisión no tiene esta partida." }); return; }
    out.push({ mesa: m.mesa, fuente: "livechess", jugadas: (Array.isArray(g.moves) ? g.moves : []).slice(0, 600).map(String),
      primera: typeof g.firstMove === "number" ? g.firstMove : null, en_vivo: !!g.live, reloj: g.clock ?? null,
      estado: RESULTADO_LC[String(g.result)] || (p.result && p.result !== "*" ? String(p.result).replace("1/2-1/2", "½-½") : "*") });
  }));
  return { mesas: out, noReconoce };
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
      const [{ data: lc }, conf] = await Promise.all([
        servicio.from("centroamericano_livechess").select("torneo_id, tableros").eq("tnr", a.tnr).maybeSingle(),
        configuracion(),
      ]);
      if (!lc && !conf) return json({ ok: true, conectada: false, mesas: [] });
      // Los jugadores de sus mesas salen de la lectura compartida de chess-results (la que ya usa centroamericano-mesa),
      // no de lo que diga la tablet: así un enlace no puede pedir las partidas de otras mesas.
      const { data: l } = await servicio.from("centroamericano_lecturas").select("ronda, mesas, leida").eq("tnr", a.tnr).maybeSingle();
      const ronda = Number(l?.ronda) || 0;
      const suyas = ((l?.mesas ?? []) as { mesa: number; blancas: string; negras: string }[]).filter((m) => m.mesa >= a.mesa_desde && m.mesa <= a.mesa_hasta && m.blancas && m.negras);
      if (!ronda || !suyas.length) return json({ ok: true, conectada: true, ronda, mesas: [] });
      if (lc) {
        const r = await mesasLivechess(lc as { torneo_id: string; tableros: string }, ronda, suyas);
        return json({ ok: true, conectada: true, fuente: "livechess", ronda, delay: 0, leida: new Date().toISOString(),
          mesas: r.mesas.sort((x, y) => Number(x.mesa) - Number(y.mesa)), no_reconoce: r.noReconoce.sort((x, y) => x.mesa - y.mesa) });
      }
      if (!conf) return json({ ok: true, conectada: false, mesas: [] });
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
    if (accion === "livechess") {
      const [{ data: filas }, { data: torneos }] = await Promise.all([
        servicio.from("centroamericano_livechess").select("tnr, tableros, actualizado, por"),
        servicio.from("centroamericano_torneos").select("tnr, nombre, prueba").order("nombre"),
      ]);
      // Sin el id: la organización ve qué categorías tienen su enlace, no el enlace.
      return json({ ok: true, torneos: (torneos ?? []).map((t: { tnr: string; nombre: string; prueba: boolean }) => {
        const f = (filas ?? []).find((x: { tnr: string }) => x.tnr === t.tnr) as { tableros: string; actualizado: string } | undefined;
        return { tnr: t.tnr, nombre: t.nombre, prueba: t.prueba, conectado: !!f, tableros: f?.tableros ?? "", actualizado: f?.actualizado ?? null };
      }) });
    }
    if (accion === "livechess_guardar") {
      // «SUB-18 ABS  1-5  https://view.livechesscloud.com/#<id>»: la categoría, la rama, los tableros y el enlace.
      const { data: torneos } = await servicio.from("centroamericano_torneos").select("tnr, categoria, rama, prueba");
      const filas: { tnr: string; torneo_id: string; tableros: string; por: string }[] = [];
      const errores: string[] = [];
      for (const renglon of String(cuerpo.texto ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 40)) {
        const id = (renglon.match(/livechesscloud\.com\/?#([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i) || [])[1];
        const cat = renglon.match(/sub\s*-?\s*0?(\d{1,2})/i);
        const rama = /\bfem/i.test(renglon) ? "Femenino" : /\babs/i.test(renglon) ? "Absoluto" : /\bmix/i.test(renglon) ? "Mixto" : "";
        const tab = (renglon.replace(/https?:\/\/\S+/g, "").replace(/sub\s*-?\s*\d+/ig, "").match(/\d+\s*-\s*\d+(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*/) || [""])[0].replace(/\s+/g, "");
        if (!id || !cat || !rama) { if (/livechess/i.test(renglon)) errores.push("No se entendió: «" + renglon.slice(0, 80) + "»"); continue; }
        const t = (torneos ?? []).find((x: { categoria: string; rama: string; prueba: boolean }) => !x.prueba && x.categoria === "Sub-" + Number(cat[1]) && x.rama === rama) as { tnr: string } | undefined;
        if (!t) { errores.push("No hay un torneo Sub-" + Number(cat[1]) + " " + rama + " en el sistema de árbitros."); continue; }
        // deno-lint-ignore no-explicit-any
        const prueba: any = await lcPedir(id + "/tournament.json", 0).catch(() => null);
        if (!prueba || !Array.isArray(prueba.rounds)) { errores.push("LiveChess no abre el enlace de Sub-" + Number(cat[1]) + " " + rama + "."); continue; }
        filas.push({ tnr: t.tnr, torneo_id: id.toLowerCase(), tableros: tab.slice(0, 40), por: "Organización (" + new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }) + ")" });
      }
      if (filas.length) {
        const { error } = await servicio.from("centroamericano_livechess").upsert(filas.map((f) => ({ ...f, actualizado: new Date().toISOString() })), { onConflict: "tnr" });
        if (error) return json({ error: error.message }, 400);
      }
      return json({ ok: true, guardados: filas.length, errores });
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
