// centroamericano-fair-play: lo que hace el encargado de Fair Play del Centroamericano 2026 desde su pantalla
// (centroamericano-fair-play.html), sin cuenta, con el QR que le da el árbitro principal; y lo mismo el árbitro
// principal en su pestaña «Fair Play», con su sesión y la herramienta «mesa-arbitro». La tablet de cada árbitro de
// mesa le pide sus mesas elegidas («mesas_arbitro»). Ver «El sorteo de Fair Play» en docs/decisiones/juegos-y-torneos.md.
//
// verify_jwt en FALSE (como centroamericano-mesa): el encargado no trae JWT. La función decide sola:
//   - con {token}: un enlace de centroamericano_fp_enlaces que no se apagó ni venció; o
//   - sin token: el JWT de quien llama, y la base le pregunta tengo_herramienta('mesa-arbitro') a ESE usuario
//     (el pedido pasa por antes_de_cada_pedido(), así que exige los dos pasos como todo lo demás). Así trabaja
//     también la pestaña «Fair Play» de centroamericano-mesas.html: una sola copia de todo.
// Todo lo que decide va en la base (las funciones centroamericano_fp_* y centroamericano_fair_play_*), que la
// función llama con la clave de servicio diciendo QUIÉN es (p_quien): el acta lleva el nombre del encargado.
//
//   "leer"        {}                                   → quién es, las categorías con su ronda, los sorteos, las alertas
//   "candidatas"  {tnr, ronda}                         → las mesas con su peso, sus motivos y quién no aplica
//   "sortear"     {ronda, tnrs, cantidad}
//   "aprobar"     {id}            "descartar" {id, motivo}
//   "revisar"     {id, resultado, color?, jugador?, nota?}
//   "alerta"      {tnr, ronda, mesa, color, estado: vista|seguir, nota?}
//   "pareo"       {tnr, ronda, mesa}                   → los dos jugadores de esa mesa (para anotar a mano)
//   "manual"      {tnr, ronda, mesa, color, resultado, jugador?, nota?} → una revisión ya hecha, anotada a mano
//   "acumulado"   {tnr, clave, estado: vista|seguir, nota?} → todas las partidas medidas de ese jugador en la categoría
//   "mesas_arbitro" {arbitro_token, ronda} → para la tablet de un árbitro de mesa: sus mesas elegidas (borde dorado)
//   "retener"     {arbitro_token, ronda, mesa} → el árbitro de mesa confirma que retuvo a quien se revisa
//   "actualizar"  {}  → lee los emparejamientos de chess-results (públicos), a lo sumo cada 90 s.
//   "vivo_pendientes" {} → hasta 3 partidas TERMINADAS de los tableros electrónicos que faltan por analizar, directo
//                       de LiveChess (sin atraso; el enlace nunca sale de acá), con sus posiciones ya armadas
//   "vivo_guardar" {tnr, ronda, mesa, evals, opciones} → la evaluación de Stockfish de cada posición y sus 3 mejores
//                       jugadas, hechas en la pantalla de Fair Play: se vuelve a leer la partida, se mide la precisión
//                       y, jugada por jugada, la primera del motor, lo difícil y el tiempo (centroamericano_fp_jugadas),
//                       y se calibran las alertas. Ver «El detector de Fair Play, jugada por jugada».
// Ver «Las partidas para Fair Play, directo de LiveChess» en docs/decisiones/juegos-y-torneos.md.

import { createClient } from "npm:@supabase/supabase-js@2";
import { Chess } from "npm:chess.js@0.10.3";
import { copiaDeOtra, DESDE_POSICION, detallar, evalsValidas, leerPareos, medir, MIN_JUGADAS, mismoJugador, nombreLc, opcionesValidas, type Ply, RESULTADO_LC, sanDe,
  segundosDe, tablerosDe, terminadaLc, VERSION_ANALISIS } from "./analisis.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CADA_MS = 90_000;
const LIVECHESS = "https://1.pool.livechesscloud.com/get/";
const POR_VEZ = 3;                 // partidas por pedido: la pantalla las analiza y vuelve por más
const RESERVA_MS = 3 * 60_000;     // una partida dada a una pantalla no se le da a otra en ese tiempo

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

let ultimaActualizacion = 0;   // en esta instancia; la base guarda la de verdad en fp_partidas.leida

async function pedir(url: string, texto = true): Promise<string | unknown> {
  const r = await fetch(url, { headers: { "User-Agent": "AjedrezIntegral-FairPlay/1.0" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(url + " contestó " + r.status);
  return texto ? await r.text() : await r.json();
}

// LiveChess: un índice o una partida que no existe (todavía) es un 404.
// deno-lint-ignore no-explicit-any
async function livechess(ruta: string): Promise<any> {
  const r = await fetch(LIVECHESS + ruta, { headers: { "User-Agent": "AjedrezIntegral-FairPlay/1.0" }, signal: AbortSignal.timeout(10_000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("LiveChess contestó " + r.status);
  return r.json();
}

// Las posiciones (FEN) después de cada jugada de una partida de LiveChess, armadas con chess.js, y cada jugada con lo
// que había para jugar (si era captura o jaque), lo que pensó y a qué hora se hizo (la primera jugada, más lo que
// pensaron los dos después). Una jugada que no entiende corta la partida ahí: lo de después no se mide.
// deno-lint-ignore no-explicit-any
function partidaDe(g: any): { posiciones: string[]; plies: Ply[] } {
  const jugadas: unknown[] = Array.isArray(g?.moves) ? g.moves : [];
  const juego = new Chess();
  const posiciones: string[] = [], plies: Ply[] = [];
  let hora = typeof g?.firstMove === "number" ? g.firstMove : null;
  for (const [i, j] of jugadas.slice(0, 600).entries()) {
    const legales: Ply["legales"] = {};
    for (const m of juego.moves({ verbose: true })) {
      legales[m.from + m.to + (m.promotion || "")] = { captura: /[ce]/.test(m.flags), jaque: /[+#]/.test(m.san) };
    }
    const hecha = juego.move(sanDe(j), { sloppy: true });
    if (!hecha) break;
    const segundos = segundosDe(j);
    if (hora != null && i > 0) hora += (segundos ?? 0) * 1000;
    posiciones.push(juego.fen());
    plies.push({ san: hecha.san, uci: hecha.from + hecha.to + (hecha.promotion || ""), legales, segundos, hora });
  }
  return { posiciones, plies };
}
const posicionesDe = (g: unknown) => partidaDe(g).posiciones;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);
  let cuerpo: Record<string, unknown> = {};
  try { cuerpo = await req.json(); } catch { cuerpo = {}; }
  const servicio = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // ---------------------------------------------------------------- la tablet de un árbitro de mesa
  // Con SU token (el de centroamericano_asignaciones), solo sus mesas elegidas para Fair Play en esa ronda, ya aprobadas:
  // la tablet les pone el borde dorado y dice a quién retener. Nada más del sorteo (ni las descartadas, ni los pesos, ni
  // las alertas). Va acá y no en centroamericano-mesa para no volver a desplegar esa función en medio del torneo.
  if (cuerpo.action === "mesas_arbitro" || cuerpo.action === "retener") {
    const t = String(cuerpo.arbitro_token ?? "").trim();
    if (!/^[0-9a-f]{64}$/.test(t)) return json({ error: "Enlace inválido." }, 404);
    const { data: a } = await servicio.from("centroamericano_asignaciones").select("tnr, arbitro, mesa_desde, mesa_hasta, vence, revocada").eq("token", t).maybeSingle();
    if (!a || a.revocada || new Date(a.vence).getTime() <= Date.now()) return json({ error: "Enlace inválido." }, 404);
    if (cuerpo.action === "retener") {
      // Solo una mesa de SU rango; que haya a quién retener lo decide la base.
      const mesa = Number(cuerpo.mesa);
      if (!Number.isInteger(mesa) || mesa < a.mesa_desde || mesa > a.mesa_hasta) return json({ error: "Esa mesa no es de tus mesas." }, 403);
      const { data: f, error } = await servicio.rpc("centroamericano_fair_play_retener", { p_tnr: a.tnr, p_ronda: Number(cuerpo.ronda) || 0, p_mesa: mesa, p_quien: a.arbitro + " (árbitro de mesa)" });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, mesa: { mesa: f.mesa, retenido_en: f.retenido_en, retenido_por: f.retenido_por } });
    }
    const { data } = await servicio.from("centroamericano_fair_play")
      .select("mesa, estado, color_si_tablas, aplica_blancas, aplica_negras, no_aplica, revisar_color, retenido_en")
      .eq("tnr", a.tnr).eq("ronda", Number(cuerpo.ronda) || 0).gte("mesa", a.mesa_desde).lte("mesa", a.mesa_hasta)
      .in("estado", ["aprobada", "sin_efecto", "revisada"]);
    return json({ ok: true, mesas: data ?? [] });
  }

  // ---------------------------------------------------------------- quién llama
  let quien = "", enlace: string | null = null;
  const token = String(cuerpo.token ?? "").trim();
  if (token) {
    if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: "Este enlace no es válido. Pídele al árbitro principal que te mande el QR de nuevo." }, 404);
    const { data: e } = await servicio.from("centroamericano_fp_enlaces").select("id, nombre, vence, revocada, ultimo_uso").eq("token", token).maybeSingle();
    if (!e) return json({ error: "Este enlace no es válido. Pídele al árbitro principal que te mande el QR de nuevo." }, 404);
    if (e.revocada) return json({ error: "El árbitro principal apagó este enlace." }, 410);
    if (new Date(e.vence).getTime() <= Date.now()) return json({ error: "Este enlace venció. Pídele uno nuevo al árbitro principal." }, 410);
    quien = e.nombre + " (Fair Play)";
    enlace = e.id;
    if (!e.ultimo_uso || Date.now() - new Date(e.ultimo_uso).getTime() > 30_000) {
      servicio.from("centroamericano_fp_enlaces").update({ ultimo_uso: new Date().toISOString() }).eq("id", e.id).then(() => {});
    }
  } else {
    const autorizacion = req.headers.get("Authorization") ?? "";
    if (!/^Bearer\s+\S+/i.test(autorizacion)) return json({ error: "Falta el enlace de Fair Play." }, 401);
    const comoQuienLlama = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: autorizacion } } });
    const { data: puede, error } = await comoQuienLlama.rpc("tengo_herramienta", { p_herramienta: "mesa-arbitro" });
    if (error || puede !== true) return json({ error: "Solo el árbitro principal o un encargado de Fair Play." }, 403);
    // Con la clave de servicio la base no sabe quién es: el nombre de su perfil va al acta.
    const { data: u } = await comoQuienLlama.auth.getUser(autorizacion.replace(/^Bearer\s+/i, "").trim());
    const { data: perfil } = u?.user ? await servicio.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle() : { data: null };
    quien = String(perfil?.full_name ?? "").trim() || "Árbitro principal";
  }
  const rpc = async (f: string, args: Record<string, unknown>) => {
    const { data, error } = await servicio.rpc(f, args);
    if (error) throw new Error(error.message);
    return data;
  };
  const conQuien = (args: Record<string, unknown>) => (quien ? { ...args, p_quien: quien } : args);

  try {
    const accion = String(cuerpo.action ?? "");
    if (accion === "leer") {
      const rondas = (await rpc("centroamericano_fp_rondas", {}) as { tnr: string; nombre: string; prueba: boolean; ronda: number }[])
        .filter((r) => (token ? !r.prueba : true));
      const tnrs = rondas.map((r) => r.tnr);
      const [{ data: sorteos }, { data: alertas }, acumulado] = await Promise.all([
        servicio.from("centroamericano_fair_play").select("*").in("tnr", tnrs.length ? tnrs : ["-"]).order("creado", { ascending: false }).range(0, 999),
        servicio.from("centroamericano_fp_analisis").select("*").in("tnr", tnrs.length ? tnrs : ["-"]).or("nivel.neq.normal,estado.eq.seguir").order("analizada", { ascending: false }).range(0, 499),
        rpc("centroamericano_fp_acumulado", {}) as Promise<{ tnr: string; nivel: string; seguir: boolean }[]>,
      ]);
      const avisos = (sorteos ?? []).map((s: { aviso_id: string | null }) => s.aviso_id).filter(Boolean);
      const { data: leidos } = avisos.length ? await servicio.from("centroamericano_avisos").select("id, leido_en").in("id", avisos) : { data: [] };
      const { data: ultima } = await servicio.from("centroamericano_fp_partidas").select("leida").order("leida", { ascending: false }).limit(1).maybeSingle();
      return json({ ok: true, nombre: quien.replace(/ \(Fair Play\)$/, ""), principal: !token, rondas, sorteos: sorteos ?? [], alertas: alertas ?? [],
        acumulado: (acumulado ?? []).filter((x) => tnrs.includes(x.tnr) && (x.nivel !== "normal" || x.seguir)),
        leidos: Object.fromEntries((leidos ?? []).map((x: { id: string; leido_en: string | null }) => [x.id, x.leido_en])), actualizado: ultima?.leida ?? null });
    }
    if (accion === "candidatas") return json({ ok: true, mesas: await rpc("centroamericano_fp_candidatas", { p_tnr: String(cuerpo.tnr), p_ronda: Number(cuerpo.ronda) }) });
    if (accion === "sortear") {
      return json({ ok: true, sorteos: await rpc("centroamericano_fair_play_sortear", conQuien({ p_ronda: Number(cuerpo.ronda), p_tnrs: (cuerpo.tnrs as string[]) ?? [], p_cantidad: Number(cuerpo.cantidad) || 1, p_enlace: enlace })) });
    }
    if (accion === "aprobar") return json({ ok: true, sorteo: await rpc("centroamericano_fair_play_aprobar", conQuien({ p_id: String(cuerpo.id) })) });
    if (accion === "descartar") return json({ ok: true, sorteo: await rpc("centroamericano_fair_play_descartar", conQuien({ p_id: String(cuerpo.id), p_motivo: String(cuerpo.motivo ?? "") })) });
    if (accion === "revisar") {
      return json({ ok: true, sorteo: await rpc("centroamericano_fair_play_revisar", conQuien({ p_id: String(cuerpo.id), p_resultado: String(cuerpo.resultado), p_color: cuerpo.color ?? null, p_jugador: cuerpo.jugador ?? null, p_nota: cuerpo.nota ?? null })) });
    }
    if (accion === "alerta") {
      return json({ ok: true, alerta: await rpc("centroamericano_fp_alerta", conQuien({ p_tnr: String(cuerpo.tnr), p_ronda: Number(cuerpo.ronda), p_mesa: Number(cuerpo.mesa), p_color: String(cuerpo.color), p_estado: String(cuerpo.estado), p_nota: cuerpo.nota ?? null })) });
    }
    if (accion === "acumulado") {
      return json({ ok: true, marcadas: await rpc("centroamericano_fp_acumulado_marcar", conQuien({ p_tnr: String(cuerpo.tnr), p_clave: String(cuerpo.clave ?? ""), p_estado: String(cuerpo.estado), p_nota: cuerpo.nota ?? null })) });
    }
    if (accion === "pareo") {
      // Los dos jugadores de una mesa en una ronda (para anotar a mano una revisión ya hecha): de los emparejamientos leídos.
      const { data } = await servicio.from("centroamericano_fp_partidas").select("blancas, negras, elo_b, elo_n, resultado")
        .eq("tnr", String(cuerpo.tnr)).eq("ronda", Number(cuerpo.ronda)).eq("mesa", Number(cuerpo.mesa)).maybeSingle();
      return json({ ok: true, pareo: data ?? null });
    }
    if (accion === "manual") {
      return json({ ok: true, sorteo: await rpc("centroamericano_fair_play_manual", conQuien({ p_tnr: String(cuerpo.tnr), p_ronda: Number(cuerpo.ronda), p_mesa: Number(cuerpo.mesa),
        p_color: cuerpo.color ?? null, p_resultado: String(cuerpo.resultado), p_jugador: cuerpo.jugador ?? null, p_nota: cuerpo.nota ?? null, p_enlace: enlace })) });
    }
    if (accion === "actualizar") return json(await actualizar(servicio, rpc));
    if (accion === "vivo_pendientes") return json(await vivoPendientes(servicio, rpc));
    if (accion === "vivo_guardar") return json(await vivoGuardar(servicio, rpc, cuerpo));
    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 400);
  }
});

// ---------------------------------------------------------------- chess-results
type Rpc = (f: string, args: Record<string, unknown>) => Promise<unknown>;
// deno-lint-ignore no-explicit-any
async function actualizar(servicio: any, rpc: Rpc) {
  const { data: ultima } = await servicio.from("centroamericano_fp_partidas").select("leida").order("leida", { ascending: false }).limit(1).maybeSingle();
  const hace = ultima?.leida ? Date.now() - new Date(ultima.leida).getTime() : Infinity;
  if (hace < CADA_MS || Date.now() - ultimaActualizacion < CADA_MS) return { ok: true, saltado: true, actualizado: ultima?.leida ?? null };
  ultimaActualizacion = Date.now();
  const rondas = await rpc("centroamericano_fp_rondas", {}) as { tnr: string; ronda: number; prueba: boolean }[];
  const errores: string[] = [];
  let pareos = 0;

  // 1. Los emparejamientos de chess-results, ronda por ronda. Una ronda pasada que ya tiene todos sus resultados
  //    no se vuelve a pedir.
  for (const r of rondas) {
    const { data: hechas } = await servicio.from("centroamericano_fp_partidas").select("ronda, resultado").eq("tnr", r.tnr);
    for (let n = 1; n <= r.ronda; n++) {
      const deEsa = (hechas ?? []).filter((h: { ronda: number }) => h.ronda === n);
      if (n < r.ronda && deEsa.length && deEsa.every((h: { resultado: string }) => h.resultado)) continue;
      try {
        const html = await pedir("https://s3.chess-results.com/tnr" + r.tnr + ".aspx?lan=2&art=2&rd=" + n + "&SNode=S0") as string;
        const filas = leerPareos(html).map((p) => ({ tnr: r.tnr, ronda: n, ...p, leida: new Date().toISOString() }));
        if (filas.length) {
          const { error } = await servicio.from("centroamericano_fp_partidas").upsert(filas, { onConflict: "tnr,ronda,mesa" });
          if (error) errores.push(r.tnr + " ronda " + n + ": " + error.message); else pareos += filas.length;
        }
      } catch (e) { errores.push("chess-results " + r.tnr + " ronda " + n + ": " + (e as Error).message); }
    }
  }

  return { ok: true, pareos, errores, actualizado: new Date().toISOString() };
}

// ---------------------------------------------------------------- las partidas de los tableros, directo de LiveChess
type Lc = { tnr: string; torneo_id: string; tableros: string };
type Fila = { tnr: string; ronda: number; mesa: number; blancas: string; negras: string; elo_b: number | null; elo_n: number | null; analizada_en: string | null; en_analisis: string | null };

// Las partidas terminadas que faltan: de cada categoría con tableros, cada ronda hasta la de ahora; la mesa de
// chess-results es el tablero de LiveChess y los DOS nombres tienen que coincidir (si no, esa mesa no se toma: mejor
// nada que medir la partida de otro). Se leen solo los índices (uno por ronda) y las partidas que se van a dar.
// deno-lint-ignore no-explicit-any
async function vivoPendientes(servicio: any, rpc: Rpc) {
  const rondas = (await rpc("centroamericano_fp_rondas", {}) as { tnr: string; ronda: number; prueba: boolean }[]).filter((r) => !r.prueba);
  const { data: lcs } = await servicio.from("centroamericano_livechess").select("tnr, torneo_id, tableros");
  const conTableros = ((lcs ?? []) as Lc[]).filter((l) => rondas.some((r) => r.tnr === l.tnr));
  if (!conTableros.length) return { ok: true, partidas: [], quedan: 0, conectada: false };
  const { data: filas } = await servicio.from("centroamericano_fp_partidas")
    .select("tnr, ronda, mesa, blancas, negras, elo_b, elo_n, analizada_en, en_analisis")
    .in("tnr", conTableros.map((l) => l.tnr)).or("analizada_en.is.null,analisis_version.lt." + VERSION_ANALISIS).range(0, 4999);
  const reservada = (f: Fila) => f.en_analisis && Date.now() - new Date(f.en_analisis).getTime() < RESERVA_MS;
  const candidatas: { lc: Lc; f: Fila }[] = [];
  const errores: string[] = [];
  await Promise.all(conTableros.map(async (lc) => {
    const ronda = rondas.find((r) => r.tnr === lc.tnr)!.ronda;
    const tabs = tablerosDe(lc.tableros);
    for (let n = 1; n <= ronda; n++) {
      const faltan = ((filas ?? []) as Fila[]).filter((f) => f.tnr === lc.tnr && f.ronda === n && tabs.includes(f.mesa) && !reservada(f));
      if (!faltan.length) continue;
      try {
        const indice = await livechess(lc.torneo_id + "/round-" + n + "/index.json");
        const pareos = (indice && indice.pairings) || [];
        for (const f of faltan) {
          const p = pareos[f.mesa - 1];
          if (terminadaLc(p) && mismoJugador(f.blancas, nombreLc(p.white)) && mismoJugador(f.negras, nombreLc(p.black))) candidatas.push({ lc, f });
        }
      } catch (e) { errores.push(lc.tnr + " ronda " + n + ": " + (e as Error).message); }
    }
  }));
  // Primero lo más nuevo (la ronda de hoy), después lo de atrás.
  candidatas.sort((a, b) => (b.f.ronda - a.f.ronda) || a.f.tnr.localeCompare(b.f.tnr) || (a.f.mesa - b.f.mesa));
  const partidas = [];
  for (const { lc, f } of candidatas.slice(0, POR_VEZ)) {
    try {
      const g = await livechess(lc.torneo_id + "/round-" + f.ronda + "/game-" + f.mesa + ".json");
      const posiciones = posicionesDe(g);
      // El tablero sin limpiar: la partida de la ronda anterior en el mismo tablero no es de estos jugadores.
      const antes = f.ronda > 1 && g ? await livechess(lc.torneo_id + "/round-" + (f.ronda - 1) + "/game-" + f.mesa + ".json") : null;
      const copia = !!antes && copiaDeOtra(g.moves || [], antes.moves || []);
      if (copia) errores.push(f.tnr + " ronda " + f.ronda + " mesa " + f.mesa + ": LiveChess trae la partida de la ronda anterior en ese tablero; no se mide.");
      if (!g || g.live || copia || !RESULTADO_LC[String(g.result)] || posiciones.length < (DESDE_POSICION + 2)) {
        // Sin jugadas que medir (muy corta, la partida no está o es la de la ronda anterior): queda como vista para no
        // volver a pedirla.
        if (g && !g.live) await sinMedir(servicio, f.tnr, f.ronda, f.mesa);
        continue;
      }
      await servicio.from("centroamericano_fp_partidas").update({ en_analisis: new Date().toISOString() }).eq("tnr", f.tnr).eq("ronda", f.ronda).eq("mesa", f.mesa);
      partidas.push({ tnr: f.tnr, ronda: f.ronda, mesa: f.mesa, blancas: f.blancas, negras: f.negras, resultado: RESULTADO_LC[String(g.result)], posiciones, desde: DESDE_POSICION });
    } catch (e) { errores.push(f.tnr + " ronda " + f.ronda + " mesa " + f.mesa + ": " + (e as Error).message); }
  }
  return { ok: true, conectada: true, partidas, quedan: Math.max(0, candidatas.length - partidas.length), errores };
}

// La evaluación que hizo la pantalla: se vuelve a leer la partida de LiveChess (la evaluación tiene que ser de ESA
// partida, una por posición), se mide con la misma fórmula de siempre y se guarda con los nombres y el Elo de
// chess-results. Lo que decidió el encargado sobre una alerta (estado, nota) no se pisa.
// deno-lint-ignore no-explicit-any
async function vivoGuardar(servicio: any, rpc: Rpc, cuerpo: Record<string, unknown>) {
  const tnr = String(cuerpo.tnr ?? ""), ronda = Number(cuerpo.ronda), mesa = Number(cuerpo.mesa);
  const [{ data: lc }, { data: f }] = await Promise.all([
    servicio.from("centroamericano_livechess").select("tnr, torneo_id, tableros").eq("tnr", tnr).maybeSingle(),
    servicio.from("centroamericano_fp_partidas").select("tnr, ronda, mesa, blancas, negras, elo_b, elo_n").eq("tnr", tnr).eq("ronda", ronda).eq("mesa", mesa).maybeSingle(),
  ]);
  if (!lc || !f) throw new Error("Esa partida no está entre las de los tableros electrónicos.");
  const g = await livechess(lc.torneo_id + "/round-" + ronda + "/game-" + mesa + ".json");
  const { posiciones, plies } = partidaDe(g);
  const evals = evalsValidas(cuerpo.evals, posiciones.length);
  const opciones = opcionesValidas(cuerpo.opciones, posiciones.length);
  if (!g || !evals || !opciones) throw new Error("La evaluación no corresponde a esa partida (¿cambió mientras se analizaba?). Se vuelve a pedir.");
  const antes = ronda > 1 ? await livechess(lc.torneo_id + "/round-" + (ronda - 1) + "/game-" + mesa + ".json") : null;
  if (antes && copiaDeOtra(g.moves || [], antes.moves || [])) {
    await sinMedir(servicio, tnr, ronda, mesa);
    return { ok: true, medidas: [], copia: true };
  }
  // Cuándo anotó el árbitro que se levantó cada uno (sin lo anulado), para las jugadas de los 5 minutos siguientes.
  const { data: notas } = await servicio.from("centroamericano_registro").select("id, color, ocurrio, tipo, articulo, anula")
    .eq("tnr", tnr).eq("ronda", ronda).eq("mesa", mesa).in("tipo", ["nota", "anulacion"]);
  const anuladas = new Set((notas ?? []).filter((n: { tipo: string }) => n.tipo === "anulacion").map((n: { anula: string }) => n.anula));
  const levantadas = (notas ?? []).filter((n: { id: string; tipo: string; articulo: string; color: string | null }) => n.tipo === "nota" && n.articulo === "Levantó" && n.color && !anuladas.has(n.id))
    .map((n: { color: string; ocurrio: string }) => ({ color: n.color, hora: new Date(n.ocurrio).getTime() }));
  const detalle = detallar(plies, evals, opciones, levantadas);
  const m = medir(evals);
  const resultado = RESULTADO_LC[String(g.result)] ?? "";
  const filas = [];
  for (const [color, med, yo, rival, eloYo, eloRival] of [
    ["blancas", m.blancas, f.blancas, f.negras, f.elo_b, f.elo_n],
    ["negras", m.negras, f.negras, f.blancas, f.elo_n, f.elo_b]] as const) {
    if (med.jugadas < MIN_JUGADAS) continue;
    const r = detalle.resumen[color];
    filas.push({ tnr, ronda, mesa, color, jugador: String(yo ?? "").slice(0, 120), elo: eloYo || null, rival: String(rival ?? "").slice(0, 120),
      rival_elo: eloRival || null, resultado, jugadas: med.jugadas, precision: med.precision, acpl: med.acpl, partida_url: null,
      fuente: "livechess", analizada: new Date().toISOString(),
      consideradas: r.consideradas, t1: r.t1, top3: r.top3, dificiles: r.dificiles, dificiles_ok: r.dificiles_ok, seg_dificil: r.seg_dificil,
      seg_resto: r.seg_resto, tras_levantarse: r.tras_levantarse, tras_levantarse_t1: r.tras_levantarse_t1, momentos: r.momentos });
  }
  if (filas.length) {
    const { error } = await servicio.from("centroamericano_fp_analisis").upsert(filas, { onConflict: "tnr,ronda,mesa,color" });
    if (error) throw new Error(error.message);
  }
  if (detalle.jugadas.length) {
    const { error } = await servicio.from("centroamericano_fp_jugadas").upsert(detalle.jugadas.map((d) => ({ tnr, ronda, mesa, ply: d.ply, color: d.color,
      san: d.san.slice(0, 12), uci: d.uci, mejor: d.mejor, rango: d.rango, perdida: d.perdida, forzada: d.forzada, dificil: d.dificil, segundos: d.segundos,
      antes: d.antes, despues: d.despues, tras_levantarse: d.tras_levantarse })), { onConflict: "tnr,ronda,mesa,ply" });
    if (error) throw new Error(error.message);
  }
  await servicio.from("centroamericano_fp_partidas").update({ analizada_en: new Date().toISOString(), en_analisis: null, analisis_version: VERSION_ANALISIS }).eq("tnr", tnr).eq("ronda", ronda).eq("mesa", mesa);
  await rpc("centroamericano_fp_calibrar", {});
  return { ok: true, medidas: filas.map((x) => ({ color: x.color, jugadas: x.jugadas, precision: x.precision })) };
}

// Una partida que no se mide (muy corta, no está, o es la de la ronda anterior en el tablero sin limpiar): queda como vista
// para no volver a pedirla, y si se había medido antes (con otra versión, o antes de detectar la copia), se borra lo medido
// desde LiveChess: era de otra partida.
// deno-lint-ignore no-explicit-any
async function sinMedir(servicio: any, tnr: string, ronda: number, mesa: number) {
  await Promise.all([
    servicio.from("centroamericano_fp_analisis").delete().eq("tnr", tnr).eq("ronda", ronda).eq("mesa", mesa).eq("fuente", "livechess"),
    servicio.from("centroamericano_fp_jugadas").delete().eq("tnr", tnr).eq("ronda", ronda).eq("mesa", mesa),
  ]);
  await servicio.from("centroamericano_fp_partidas").update({ analizada_en: new Date().toISOString(), en_analisis: null, analisis_version: VERSION_ANALISIS }).eq("tnr", tnr).eq("ronda", ronda).eq("mesa", mesa);
}
