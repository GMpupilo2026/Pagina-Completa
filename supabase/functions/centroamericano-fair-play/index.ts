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
//   "modelo"      {forzar?} → el modelo por jugada (al estilo de Regan): ajusta, calcula el índice de cada partida y de
//                       cada jugador, y la validación (a lo sumo cada 90 s; el ajuste, cada 15 min). Ver «El modelo por
//                       jugada, al estilo de Regan».
//   "referencia_guardar" {evento, partida, elo_b, elo_n, jugadas, evals, opciones, trampa?} → una partida de otro torneo,
//                       analizada en la pantalla, para ajustar el modelo con más gente (sin nombres); con «trampa», un
//                       caso de prueba (se sabe quién usó el motor): no entra al ajuste y mide si el índice lo marca.
//   "referencia_hechas" {evento} → las partidas de ese evento ya cargadas (para seguir donde quedó una carga larga).
//   "planilla_guardar" {tnr, ronda, mesa, jugadas, dudosas} → la partida de una mesa SIN tablero electrónico, leída de la
//                       foto de sus planillas en la organización («Generar PGN»): entra a lo que se analiza como una de
//                       LiveChess (sin el tiempo ni las jugadas dudosas). Ver «Las mesas sin tablero electrónico».
//   "jugador"     {tnr, clave} → todas las partidas medidas de un jugador y su índice, para su informe en PDF.
//   "vivo_guardar" y "referencia_guardar" aceptan también «superficiales»: la mejor jugada de cada posición a poca
//                       profundidad (la mirada corta), para las trampas (ver «Las trampas de la mirada corta»).
//   "actualizar" también lee, de a poco, el ID FIDE de cada jugador (la lista inicial de chess-results) y su Elo mes a
//                       mes en FIDE, para la tendencia (ver «Cómo viene su Elo en FIDE»).
// Ver «Las partidas para Fair Play, directo de LiveChess» en docs/decisiones/juegos-y-torneos.md.

import { createClient } from "npm:@supabase/supabase-js@2";
import { Chess } from "npm:chess.js@0.10.3";
import { ajustar, atraccionDe, casosDePrueba, centroYFactor, claveDe, combinada, contextoDe, copiaDeOtra, correlacionDe, correlaciones, factorContexto, MAX_OPCIONES, PROFUNDIDAD_SUPERFICIAL, relojDe, superficialesValidas, trampas, umbralTorneo, type Correlaciones, DESDE_POSICION, detallar, dificultadEsperada, eloUsado,
  esJoven, esperado, type Esperado, esRapido, evalsValidas, fenExplorador, finDeTeoria, indice, inicioDeMedida, leerFideIds, leerHistorialFide, leerPareos,
  medir, type MesFide, mesDe, MIN_JUGADAS, mismoJugador, type MovModelo, MULTIPV, nombreLc, opcionesValidas, planillaValida, type Ply, PROFUNDIDAD,
  PROFUNDIDAD_HONDA, puntosBlancas, rachas, rendimiento, RESULTADO_LC, resultadoDe, sanDe, sDeElo, segundosDe, spearman, sSinElJugador, sumar, tablerosDe,
  tendencia, terminadaLc, validar, VERSION_ANALISIS, zCruda, zsCrudas } from "./analisis.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CADA_MS = 90_000;
const LIVECHESS = "https://1.pool.livechesscloud.com/get/";
const POR_VEZ = 3;                 // partidas por pedido: la pantalla las analiza y vuelve por más
const RESERVA_MS = 3 * 60_000;     // una partida dada a una pantalla no se le da a otra en ese tiempo
const MODELO_MS = 90_000, AJUSTE_MS = 15 * 60_000;   // el índice se recalcula a lo sumo cada 90 s; el ajuste, cada 15 min
const LICHESS_TOKEN = Deno.env.get("LICHESS_TOKEN") || "";   // el del explorador de maestros (sin permisos)
const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

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
    plies.push({ san: hecha.san, uci: hecha.from + hecha.to + (hecha.promotion || ""), legales, segundos, hora, reloj: relojDe(j) });
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
      const [{ data: sorteos }, { data: alertas }, acumulado, { data: indiceJ }, { data: modeloA }] = await Promise.all([
        servicio.from("centroamericano_fair_play").select("*").in("tnr", tnrs.length ? tnrs : ["-"]).order("creado", { ascending: false }).range(0, 999),
        servicio.from("centroamericano_fp_analisis").select("*").in("tnr", tnrs.length ? tnrs : ["-"]).or("nivel.neq.normal,estado.eq.seguir").order("analizada", { ascending: false }).range(0, 499),
        rpc("centroamericano_fp_acumulado", {}) as Promise<{ tnr: string; nivel: string; seguir: boolean }[]>,
        servicio.from("centroamericano_fp_indice").select("*").in("tnr", tnrs.length ? tnrs : ["-"]).order("roi", { ascending: false, nullsFirst: false }).range(0, 999),
        servicio.from("centroamericano_fp_modelo").select("*").eq("id", "actual").maybeSingle(),
      ]);
      const avisos = (sorteos ?? []).map((s: { aviso_id: string | null }) => s.aviso_id).filter(Boolean);
      const { data: leidos } = avisos.length ? await servicio.from("centroamericano_avisos").select("id, leido_en").in("id", avisos) : { data: [] };
      const { data: ultima } = await servicio.from("centroamericano_fp_partidas").select("leida").order("leida", { ascending: false }).limit(1).maybeSingle();
      // El evento que se está mirando (el de la mayoría de sus categorías): los títulos de la pantalla y de los PDF.
      const { data: deEvento } = await servicio.from("centroamericano_torneos").select("evento").in("tnr", tnrs.length ? tnrs : ["-"]).eq("prueba", false);
      const cuenta = new Map<string, number>();
      for (const t of (deEvento ?? []) as { evento: string }[]) cuenta.set(t.evento, (cuenta.get(t.evento) ?? 0) + 1);
      const evento = [...cuenta].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return json({ ok: true, nombre: quien.replace(/ \(Fair Play\)$/, ""), principal: !token, evento, rondas, sorteos: sorteos ?? [], alertas: alertas ?? [],
        acumulado: (acumulado ?? []).filter((x) => tnrs.includes(x.tnr) && (x.nivel !== "normal" || x.seguir)),
        indice: indiceJ ?? [], modelo: modeloA ?? null,
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
    if (accion === "modelo") return json(await modelo(servicio, rpc, cuerpo.forzar === true));
    if (accion === "referencia_guardar") return json(await referenciaGuardar(servicio, rpc, cuerpo, quien));
    if (accion === "planilla_guardar") return json(await planillaGuardar(servicio, cuerpo, quien));
    if (accion === "jugador") {
      // Para el informe del jugador: sus partidas medidas (por la clave de su nombre) y su fila del índice.
      const tnr = String(cuerpo.tnr ?? ""), cl = claveDe(cuerpo.clave);
      if (!cl) throw new Error("Falta el jugador.");
      const [{ data: an }, { data: ix }] = await Promise.all([
        servicio.from("centroamericano_fp_analisis").select("*").eq("tnr", tnr).order("ronda").range(0, 1999),
        servicio.from("centroamericano_fp_indice").select("*").eq("tnr", tnr).eq("clave", cl).maybeSingle(),
      ]);
      return json({ ok: true, partidas: (an ?? []).filter((a: { jugador: string }) => claveDe(a.jugador) === cl), indice: ix ?? null });
    }
    if (accion === "referencia_hechas") {
      // Las partidas de un evento que ya se cargaron: volver a subir el archivo (o la transmisión) sigue donde quedó.
      const evento = String(cuerpo.evento ?? "").trim().slice(0, 80);
      return json({ ok: true, partidas: await rpc("centroamericano_fp_referencia_partidas", { p_evento: evento }) ?? [] });
    }
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

  // 2. El ID FIDE de cada jugador y su Elo mes a mes en FIDE (para la tendencia del modelo), de a poco.
  const fide = await leerFide(servicio, rondas.filter((r) => !r.prueba).map((r) => r.tnr), errores).catch((e) => { errores.push("FIDE: " + (e as Error).message); return null; });

  return { ok: true, pareos, fide, errores, actualizado: new Date().toISOString() };
}

// La lista inicial de chess-results de cada categoría (una vez al día) da el ID FIDE de cada jugador, y la ficha de FIDE
// de cada uno, su Elo de cada mes. Las fichas se leen de a FIDE_POR_VEZ (de a 5 a la vez) en cada «actualizar» (cada
// 90 s mientras haya una pantalla de Fair Play abierta) y se vuelven a leer cada 20 días; la que no contestó, al otro
// día. Lo que no se pudo leer no se inventa: ese jugador queda sin tendencia.
const FIDE_POR_VEZ = 10, LISTA_CADA_MS = 24 * 3600_000, FICHA_CADA_MS = 20 * 24 * 3600_000, FICHA_FALLO_MS = 24 * 3600_000;
// deno-lint-ignore no-explicit-any
async function leerFide(servicio: any, tnrs: string[], errores: string[]) {
  if (!tnrs.length) return { listas: 0, fichas: 0 };
  const { data: hechos } = await servicio.from("centroamericano_fp_fide").select("tnr, leido").in("tnr", tnrs).range(0, 9999);
  const ultima = new Map<string, number>();
  for (const h of (hechos ?? []) as { tnr: string; leido: string }[]) ultima.set(h.tnr, Math.max(ultima.get(h.tnr) ?? 0, new Date(h.leido).getTime()));
  let listas = 0;
  for (const tnr of tnrs.filter((t) => Date.now() - (ultima.get(t) ?? 0) > LISTA_CADA_MS).slice(0, 3)) {
    try {
      const filas = leerFideIds(await pedir("https://s3.chess-results.com/tnr" + tnr + ".aspx?lan=2&art=0&SNode=S0") as string);
      const unicas = new Map(filas.map((f) => [claveDe(f.nombre), f]));
      if (!unicas.size) continue;   // la página cambió o no tiene ID FIDE: no se borra lo que había
      const { error } = await servicio.from("centroamericano_fp_fide").upsert([...unicas].map(([clave, f]) => ({ tnr, clave: clave.slice(0, 120), nombre: f.nombre.slice(0, 120), fide_id: f.fide, leido: new Date().toISOString() })), { onConflict: "tnr,clave" });
      if (error) errores.push("FIDE " + tnr + ": " + error.message); else listas++;
    } catch (e) { errores.push("lista inicial " + tnr + ": " + (e as Error).message); }
  }
  const ids = [...new Set(((await todas(() => servicio.from("centroamericano_fp_fide").select("fide_id").in("tnr", tnrs).order("fide_id"))) as { fide_id: string }[]).map((x) => x.fide_id))];
  const leidas = new Map<string, { leido: string; historial: unknown }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await servicio.from("centroamericano_fp_elo_fide").select("fide_id, leido, historial").in("fide_id", ids.slice(i, i + 200));
    for (const x of (data ?? []) as { fide_id: string; leido: string; historial: unknown }[]) leidas.set(x.fide_id, x);
  }
  const vencida = (id: string) => { const x = leidas.get(id); return !x || Date.now() - new Date(x.leido).getTime() > (x.historial ? FICHA_CADA_MS : FICHA_FALLO_MS); };
  const toca = ids.filter(vencida).slice(0, FIDE_POR_VEZ);
  let fichas = 0;
  for (let i = 0; i < toca.length; i += 5) {
    await Promise.all(toca.slice(i, i + 5).map(async (id) => {
      let historial: MesFide[] | null = null;
      try {
        const r = await fetch("https://ratings.fide.com/profile/" + id + "/chart", { headers: { "User-Agent": "AjedrezIntegral-FairPlay/1.0" }, signal: AbortSignal.timeout(10_000) });
        if (r.ok) { const h = leerHistorialFide(await r.text()); if (h.length) historial = h.slice(0, 60); }
      } catch { /* FIDE no contestó: se vuelve a probar al otro día */ }
      const { error } = await servicio.from("centroamericano_fp_elo_fide").upsert({ fide_id: id, historial, leido: new Date().toISOString() }, { onConflict: "fide_id" });
      if (!error && historial) fichas++;
    }));
  }
  return { listas, fichas, faltan: Math.max(0, ids.filter(vencida).length - toca.length) };
}

// ---------------------------------------------------------------- las partidas de los tableros, directo de LiveChess
// (y las de las mesas sin tablero, de la foto de sus planillas)
type Lc = { tnr: string; torneo_id: string; tableros: string };
type Fila = { tnr: string; ronda: number; mesa: number; blancas: string; negras: string; elo_b: number | null; elo_n: number | null; resultado: string | null; analizada_en: string | null; en_analisis: string | null };
const CON_FILA = "tnr, ronda, mesa, blancas, negras, elo_b, elo_n, resultado, analizada_en, en_analisis";
const A_LC: Record<string, string> = { "1-0": "WHITEWIN", "0-1": "BLACKWIN", "1/2-1/2": "DRAW" };
// La mesa es un tablero electrónico si su categoría tiene LiveChess y la mesa está entre sus tableros.
const tableroDe = (lcs: Lc[], tnr: string, mesa: number) => lcs.find((l) => l.tnr === tnr && tablerosDe(l.tableros).includes(mesa)) || null;
// La partida de una mesa, de donde salga: de LiveChess (con el reloj) o de la planilla leída (las jugadas y el
// resultado de chess-results). Con la forma de una de LiveChess: { moves, result, live }.
// deno-lint-ignore no-explicit-any
async function leerJuego(servicio: any, lc: Lc | null, f: { tnr: string; ronda: number; mesa: number; resultado?: string | null }): Promise<{ fuente: "livechess" | "planilla"; g: any; dudosas: number[] } | null> {
  if (lc) {
    const g = await livechess(lc.torneo_id + "/round-" + f.ronda + "/game-" + f.mesa + ".json");
    return g ? { fuente: "livechess", g, dudosas: [] } : null;
  }
  const { data: pl } = await servicio.from("centroamericano_fp_planillas").select("jugadas, dudosas").eq("tnr", f.tnr).eq("ronda", f.ronda).eq("mesa", f.mesa).maybeSingle();
  if (!pl) return null;
  const r = resultadoDe(f.resultado);
  return { fuente: "planilla", g: { moves: pl.jugadas || [], result: r ? A_LC[r] : null, live: false }, dudosas: pl.dudosas || [] };
}

// Las partidas terminadas que faltan: de cada categoría con tableros, cada ronda hasta la de ahora; la mesa de
// chess-results es el tablero de LiveChess y los DOS nombres tienen que coincidir (si no, esa mesa no se toma: mejor
// nada que medir la partida de otro). Se leen solo los índices (uno por ronda) y las partidas que se van a dar. Y las
// mesas sin tablero cuya planilla ya se leyó en la organización, con su resultado en chess-results.
// deno-lint-ignore no-explicit-any
async function vivoPendientes(servicio: any, rpc: Rpc) {
  const rondas = (await rpc("centroamericano_fp_rondas", {}) as { tnr: string; ronda: number; prueba: boolean }[]).filter((r) => !r.prueba);
  const activos = rondas.map((r) => r.tnr);
  const [{ data: lcs }, { data: plans }] = await Promise.all([
    servicio.from("centroamericano_livechess").select("tnr, torneo_id, tableros"),
    servicio.from("centroamericano_fp_planillas").select("tnr, ronda, mesa").in("tnr", activos.length ? activos : ["-"]).range(0, 4999),
  ]);
  const conTableros = ((lcs ?? []) as Lc[]).filter((l) => activos.includes(l.tnr));
  const planillas = ((plans ?? []) as { tnr: string; ronda: number; mesa: number }[]).filter((p) => !tableroDe(conTableros, p.tnr, p.mesa));
  if (!conTableros.length && !planillas.length) return { ok: true, partidas: [], quedan: 0, conectada: false };
  const mirar = [...new Set([...conTableros.map((l) => l.tnr), ...planillas.map((p) => p.tnr)])];
  const { data: filas } = await servicio.from("centroamericano_fp_partidas").select(CON_FILA)
    .in("tnr", mirar).or("analizada_en.is.null,analisis_version.lt." + VERSION_ANALISIS).range(0, 4999);
  const reservada = (f: Fila) => f.en_analisis && Date.now() - new Date(f.en_analisis).getTime() < RESERVA_MS;
  const candidatas: { lc: Lc | null; f: Fila }[] = [];
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
  // Las de las planillas: con su resultado ya en chess-results (la partida terminó).
  for (const p of planillas) {
    const f = ((filas ?? []) as Fila[]).find((x) => x.tnr === p.tnr && x.ronda === p.ronda && x.mesa === p.mesa);
    if (f && !reservada(f) && resultadoDe(f.resultado)) candidatas.push({ lc: null, f });
  }
  // Primero lo más nuevo (la ronda de hoy), después lo de atrás.
  candidatas.sort((a, b) => (b.f.ronda - a.f.ronda) || a.f.tnr.localeCompare(b.f.tnr) || (a.f.mesa - b.f.mesa));
  // Después, las que salieron con alerta y todavía no se confirmaron con el análisis hondo (la segunda pasada).
  const hondas: { lc: Lc | null; f: Fila; honda: boolean }[] = [];
  if (candidatas.length < POR_VEZ) {
    const { data: marcadas } = await servicio.from("centroamericano_fp_analisis").select("tnr, ronda, mesa").neq("nivel", "normal").in("fuente", ["livechess", "planilla"])
      .in("tnr", mirar).range(0, 999);
    if (marcadas?.length) {
      const { data: sinHonda } = await servicio.from("centroamericano_fp_partidas").select(CON_FILA)
        .in("tnr", [...new Set(marcadas.map((m: { tnr: string }) => m.tnr))]).eq("profunda", false).eq("analisis_version", VERSION_ANALISIS).range(0, 4999);
      for (const f of (sinHonda ?? []) as Fila[]) {
        if (reservada(f) || !marcadas.some((m: { tnr: string; ronda: number; mesa: number }) => m.tnr === f.tnr && m.ronda === f.ronda && m.mesa === f.mesa)) continue;
        const lc = tableroDe(conTableros, f.tnr, f.mesa);
        if (!lc && !planillas.some((p) => p.tnr === f.tnr && p.ronda === f.ronda && p.mesa === f.mesa)) continue;
        if (hondas.length < POR_VEZ) hondas.push({ lc, f, honda: true });
      }
    }
  }
  const partidas = [];
  const presupuesto = { pedidos: 20 };
  for (const { lc, f, honda } of [...candidatas.map((x) => ({ ...x, honda: false })), ...hondas].slice(0, POR_VEZ)) {
    try {
      const j = await leerJuego(servicio, lc, f);
      const g = j?.g;
      const posiciones = posicionesDe(g);
      // El tablero sin limpiar: la partida de la ronda anterior en el mismo tablero no es de estos jugadores.
      const antes = lc && f.ronda > 1 && g ? await livechess(lc.torneo_id + "/round-" + (f.ronda - 1) + "/game-" + f.mesa + ".json") : null;
      const copia = !!antes && copiaDeOtra(g.moves || [], antes.moves || []);
      if (copia) errores.push(f.tnr + " ronda " + f.ronda + " mesa " + f.mesa + ": LiveChess trae la partida de la ronda anterior en ese tablero; no se mide.");
      if (!g || g.live || copia || !RESULTADO_LC[String(g.result)] || posiciones.length < (DESDE_POSICION + 2)) {
        // Sin jugadas que medir (muy corta, la partida no está o es la de la ronda anterior): queda como vista para no
        // volver a pedirla.
        if (g && !g.live) await sinMedir(servicio, f.tnr, f.ronda, f.mesa, j!.fuente);
        continue;
      }
      // La teoría: hasta dónde siguió las partidas de maestros (con el caché del explorador; si no se sabe, la regla fija).
      const teoria = await teoriaDe(servicio, partidaDe(g).plies, posiciones, presupuesto);
      const inicio = inicioDeMedida(teoria);
      await servicio.from("centroamericano_fp_partidas").update({ en_analisis: new Date().toISOString(), teoria_hasta: teoria.fin, teoria_segura: teoria.seguro })
        .eq("tnr", f.tnr).eq("ronda", f.ronda).eq("mesa", f.mesa);
      partidas.push({ tnr: f.tnr, ronda: f.ronda, mesa: f.mesa, blancas: f.blancas, negras: f.negras, resultado: RESULTADO_LC[String(g.result)], posiciones,
        desde: Math.min(DESDE_POSICION, inicio - 1), honda, profundidad: honda ? PROFUNDIDAD_HONDA : PROFUNDIDAD, multipv: MULTIPV, superficial: PROFUNDIDAD_SUPERFICIAL, fuente: j!.fuente });
    } catch (e) { errores.push(f.tnr + " ronda " + f.ronda + " mesa " + f.mesa + ": " + (e as Error).message); }
  }
  return { ok: true, conectada: true, partidas, quedan: Math.max(0, candidatas.length + hondas.length - partidas.length), errores, multipv: MULTIPV };
}

// La teoría de una partida: el caché del explorador de maestros (explorador_maestros_cache, el mismo de
// explorador-maestros) y, lo que falte, al explorador de Lichess con su token, de a uno y con un presupuesto por pedido.
// La decisión la toma finDeTeoria() (analisis.ts).
// deno-lint-ignore no-explicit-any
async function teoriaDe(servicio: any, plies: Ply[], posiciones: string[], presupuesto: { pedidos: number }) {
  const fens = [INICIAL, ...posiciones.slice(0, 40).map(fenExplorador)];
  const { data: guardadas } = await servicio.from("explorador_maestros_cache").select("fen, datos").in("fen", [...new Set(fens)]);
  const cache = new Map<string, { jugadas?: { uci: string; w: number; d: number; b: number }[] }>((guardadas ?? []).map((x: { fen: string; datos: never }) => [x.fen, x.datos]));
  const castillo: Record<string, string> = { e1h1: "e1g1", e1a1: "e1c1", e8h8: "e8g8", e8a8: "e8c8" };
  for (let j = 0; j < Math.min(plies.length, 40); j++) {
    let datos = cache.get(fens[j]);
    if (!datos) {
      if (!LICHESS_TOKEN || presupuesto.pedidos <= 0) break;
      presupuesto.pedidos--;
      try {
        const r = await fetch("https://explorer.lichess.org/masters?moves=30&topGames=0&fen=" + encodeURIComponent(fens[j] + " 0 1"),
          { headers: { Authorization: "Bearer " + LICHESS_TOKEN, Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
        if (!r.ok) break;
        // deno-lint-ignore no-explicit-any
        const x: any = await r.json();
        datos = { jugadas: (x.moves || []).map((m: { uci: string; san: string; white: number; draws: number; black: number; averageRating?: number }) =>
          ({ san: m.san, uci: castillo[m.uci] || m.uci, w: m.white, d: m.draws, b: m.black, elo: m.averageRating ?? null })) } as never;
        cache.set(fens[j], datos!);
        await servicio.from("explorador_maestros_cache").upsert({ fen: fens[j], datos: { w: x.white, d: x.draws, b: x.black, ...datos, apertura: x.opening ? { eco: x.opening.eco, nombre: x.opening.name } : null }, leido_en: new Date().toISOString() });
      } catch { break; }
    }
    const m = (datos!.jugadas || []).find((x) => (castillo[x.uci] || x.uci) === plies[j].uci);
    if (!m || m.w + m.d + m.b < 5) break;
  }
  return finDeTeoria(plies, fens, (fen) => { const d = cache.get(fen); return d ? { jugadas: (d.jugadas || []).map((x) => ({ ...x, uci: castillo[x.uci] || x.uci })) } : null; });
}

// La evaluación que hizo la pantalla: se vuelve a leer la partida de LiveChess (la evaluación tiene que ser de ESA
// partida, una por posición), se mide con la misma fórmula de siempre y se guarda con los nombres y el Elo de
// chess-results. Lo que decidió el encargado sobre una alerta (estado, nota) no se pisa.
// deno-lint-ignore no-explicit-any
async function vivoGuardar(servicio: any, rpc: Rpc, cuerpo: Record<string, unknown>) {
  const tnr = String(cuerpo.tnr ?? ""), ronda = Number(cuerpo.ronda), mesa = Number(cuerpo.mesa);
  const [{ data: lcs }, { data: f }] = await Promise.all([
    servicio.from("centroamericano_livechess").select("tnr, torneo_id, tableros").eq("tnr", tnr),
    servicio.from("centroamericano_fp_partidas").select("tnr, ronda, mesa, blancas, negras, elo_b, elo_n, resultado, teoria_hasta, teoria_segura").eq("tnr", tnr).eq("ronda", ronda).eq("mesa", mesa).maybeSingle(),
  ]);
  if (!f) throw new Error("Esa partida no está entre las de los tableros electrónicos ni entre las planillas leídas.");
  // De un tablero electrónico (LiveChess) o, si la mesa no tiene, de la planilla leída.
  const lc = tableroDe((lcs ?? []) as Lc[], tnr, mesa);
  const j = await leerJuego(servicio, lc, f);
  if (!j) throw new Error("Esa partida no está entre las de los tableros electrónicos ni entre las planillas leídas.");
  const g = j.g;
  const { posiciones, plies } = partidaDe(g);
  const evals = evalsValidas(cuerpo.evals, posiciones.length);
  const opciones = opcionesValidas(cuerpo.opciones, posiciones.length);
  const superficiales = superficialesValidas(cuerpo.superficiales, posiciones.length);
  if (!evals || !opciones || !superficiales) throw new Error("La evaluación no corresponde a esa partida (¿cambió mientras se analizaba?). Se vuelve a pedir.");
  const antes = lc && ronda > 1 ? await livechess(lc.torneo_id + "/round-" + (ronda - 1) + "/game-" + mesa + ".json") : null;
  if (antes && copiaDeOtra(g.moves || [], antes.moves || [])) {
    await sinMedir(servicio, tnr, ronda, mesa, "livechess");
    return { ok: true, medidas: [], copia: true };
  }
  // Cuándo anotó el árbitro que se levantó cada uno (sin lo anulado), para las jugadas de los 5 minutos siguientes.
  const { data: notas } = await servicio.from("centroamericano_registro").select("id, color, ocurrio, tipo, articulo, anula")
    .eq("tnr", tnr).eq("ronda", ronda).eq("mesa", mesa).in("tipo", ["nota", "anulacion"]);
  const anuladas = new Set((notas ?? []).filter((n: { tipo: string }) => n.tipo === "anulacion").map((n: { anula: string }) => n.anula));
  const levantadas = (notas ?? []).filter((n: { id: string; tipo: string; articulo: string; color: string | null }) => n.tipo === "nota" && n.articulo === "Levantó" && n.color && !anuladas.has(n.id))
    .map((n: { color: string; ocurrio: string }) => ({ color: n.color, hora: new Date(n.ocurrio).getTime() }));
  const inicio = inicioDeMedida(f.teoria_hasta != null ? { fin: f.teoria_hasta, seguro: !!f.teoria_segura } : null);
  const detalle = detallar(plies, evals, opciones, levantadas, inicio, new Set(j.dudosas), superficiales);
  const honda = cuerpo.honda === true;
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
      fuente: j.fuente, analizada: new Date().toISOString(),
      consideradas: r.consideradas, t1: r.t1, top3: r.top3, dificiles: r.dificiles, dificiles_ok: r.dificiles_ok, seg_dificil: r.seg_dificil,
      seg_resto: r.seg_resto, tras_levantarse: r.tras_levantarse, tras_levantarse_t1: r.tras_levantarse_t1, momentos: r.momentos,
      desde_jugada: Math.floor(inicio / 2) + 1, profunda: honda });
  }
  if (filas.length) {
    const { error } = await servicio.from("centroamericano_fp_analisis").upsert(filas, { onConflict: "tnr,ronda,mesa,color" });
    if (error) throw new Error(error.message);
  }
  if (detalle.jugadas.length) {
    const { error } = await servicio.from("centroamericano_fp_jugadas").upsert(detalle.jugadas.map((d) => ({ tnr, ronda, mesa, ply: d.ply, color: d.color,
      san: d.san.slice(0, 12), uci: d.uci, mejor: d.mejor, rango: d.rango, perdida: d.perdida, forzada: d.forzada, dificil: d.dificil, segundos: d.segundos,
      antes: d.antes, despues: d.despues, tras_levantarse: d.tras_levantarse, deltas: d.deltas, n_legales: d.n_legales, delta_jugada: d.delta_jugada,
      reloj: d.reloj, sup_rango: d.sup_rango, cayo: d.cayo })),
      { onConflict: "tnr,ronda,mesa,ply" });
    if (error) throw new Error(error.message);
  }
  await servicio.from("centroamericano_fp_partidas").update({ analizada_en: new Date().toISOString(), en_analisis: null, analisis_version: VERSION_ANALISIS, ...(honda ? { profunda: true } : {}) })
    .eq("tnr", tnr).eq("ronda", ronda).eq("mesa", mesa);
  await rpc("centroamericano_fp_calibrar", {});
  const mod = await modelo(servicio, rpc, false).catch((e) => ({ ok: false, error: (e as Error).message }));
  return { ok: true, medidas: filas.map((x) => ({ color: x.color, jugadas: x.jugadas, precision: x.precision })), modelo: (mod as { saltado?: boolean }).saltado ? "al día" : "recalculado" };
}

// Una partida que no se mide (muy corta, no está, o es la de la ronda anterior en el tablero sin limpiar): queda como vista
// para no volver a pedirla, y si se había medido antes (con otra versión, o antes de detectar la copia), se borra lo medido
// desde esa fuente (LiveChess o la planilla): era de otra partida.
// deno-lint-ignore no-explicit-any
async function sinMedir(servicio: any, tnr: string, ronda: number, mesa: number, fuente: string) {
  await Promise.all([
    servicio.from("centroamericano_fp_analisis").delete().eq("tnr", tnr).eq("ronda", ronda).eq("mesa", mesa).eq("fuente", fuente),
    servicio.from("centroamericano_fp_jugadas").delete().eq("tnr", tnr).eq("ronda", ronda).eq("mesa", mesa),
  ]);
  await servicio.from("centroamericano_fp_partidas").update({ analizada_en: new Date().toISOString(), en_analisis: null, analisis_version: VERSION_ANALISIS }).eq("tnr", tnr).eq("ronda", ronda).eq("mesa", mesa);
}

// ---------------------------------------------------------------- las mesas sin tablero electrónico
// La partida de una mesa leída de la foto de sus planillas (en la organización, «Generar PGN»): se comprueba entera con
// chess.js (si una jugada no es legal, no se guarda nada), se guarda y la mesa vuelve a quedar por analizar. Una mesa
// que es tablero electrónico no la necesita: sale de LiveChess, con el reloj.
// deno-lint-ignore no-explicit-any
async function planillaGuardar(servicio: any, cuerpo: Record<string, unknown>, quien: string) {
  const tnr = String(cuerpo.tnr ?? ""), ronda = Number(cuerpo.ronda), mesa = Number(cuerpo.mesa);
  const v = planillaValida(cuerpo.jugadas, cuerpo.dudosas);
  if (!v) throw new Error("La partida de la planilla es muy corta o no se entiende: hacen falta 20 medias jugadas legibles.");
  const [{ data: f }, { data: lcs }] = await Promise.all([
    servicio.from("centroamericano_fp_partidas").select("tnr").eq("tnr", tnr).eq("ronda", ronda).eq("mesa", mesa).maybeSingle(),
    servicio.from("centroamericano_livechess").select("tnr, torneo_id, tableros").eq("tnr", tnr),
  ]);
  if (!f) throw new Error("Esa mesa todavía no está en los emparejamientos leídos de chess-results (se leen cada 90 s con la pantalla de Fair Play abierta).");
  if (tableroDe((lcs ?? []) as Lc[], tnr, mesa)) return { ok: true, tablero: true };
  const { plies } = partidaDe({ moves: v.jugadas });
  if (plies.length !== v.jugadas.length) throw new Error("La jugada " + (Math.floor(plies.length / 2) + 1) + (plies.length % 2 ? " de las negras" : " de las blancas") + " de la planilla no es legal: no se guardó.");
  const { error } = await servicio.from("centroamericano_fp_planillas").upsert({ tnr, ronda, mesa, jugadas: v.jugadas, dudosas: v.dudosas, cargado_por: quien.slice(0, 120), cargado: new Date().toISOString() }, { onConflict: "tnr,ronda,mesa" });
  if (error) throw new Error(error.message);
  await servicio.from("centroamericano_fp_partidas").update({ analizada_en: null, en_analisis: null, profunda: false }).eq("tnr", tnr).eq("ronda", ronda).eq("mesa", mesa);
  return { ok: true, jugadas: v.jugadas.length, dudosas: v.dudosas.length };
}

// ---------------------------------------------------------------- el modelo por jugada (al estilo de Regan)
// Lee todas las jugadas medidas (con sus deltas) de los torneos de verdad y las de referencia, ajusta el modelo con las
// de jugadores con Elo (cada 15 min), le da a cada uno su sensibilidad (por su Elo o, sin Elo, la de su categoría sin
// él) y calcula el índice de cada partida y de cada jugador, y la validación. El cálculo está en analisis.ts.
// deno-lint-ignore no-explicit-any
async function todas(armar: (desde: number) => any) {
  const out: unknown[] = [];
  for (let desde = 0; desde < 100_000; desde += 1000) {
    const { data, error } = await armar(desde).range(desde, desde + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
type FilaJugada = { tnr: string; ronda: number; mesa: number; color: string; deltas: number[]; n_legales: number; rango: number; delta_jugada: number; dificil: boolean; segundos?: number | null;
  antes?: number | null; reloj?: number | null; sup_rango?: number | null; cayo?: boolean | null };
type FilaRef = FilaJugada & { evento: string; partida: string; elo: number; trampa: string | null; trampa_pct?: number | null };
type Parametros = { a: number; b: number; c: number; kv?: number; kr?: number; movimientos: number };
// deno-lint-ignore no-explicit-any
async function modelo(servicio: any, rpc: Rpc, forzar: boolean) {
  const { data: m0 } = await servicio.from("centroamericano_fp_modelo").select("*").eq("id", "actual").maybeSingle();
  if (!forzar && m0?.calculado && Date.now() - new Date(m0.calculado).getTime() < MODELO_MS) return { ok: true, saltado: true, modelo: m0 };
  const { data: torneos } = await servicio.from("centroamericano_torneos").select("tnr, nombre, categoria, prueba, ritmo, menores");
  const reales = ((torneos ?? []) as { tnr: string; nombre: string; categoria: string | null; prueba: boolean; ritmo: string | null; menores: boolean | null }[]).filter((t) => !t.prueba);
  if (!reales.length) return { ok: true, insuficiente: true };
  // El ritmo de cada categoría (en una rápida todos juegan peor para su Elo: se ajusta aparte; el blitz va con las
  // rápidas) y si es de menores: lo que dice el torneo (lo pone quien lo agrega) o, si no lo dice, su nombre.
  const ritmoDe = new Map(reales.map((t) => [t.tnr, t.ritmo ? (t.ritmo === "clasico" ? "clasico" : "rapido") : esRapido(t.nombre) ? "rapido" : "clasico"]));
  const jovenDe = new Map(reales.map((t) => [t.tnr, t.menores ?? (esJoven(t.nombre) || esJoven(t.categoria))]));
  const tnrs = reales.map((t) => t.tnr);
  const [jugs, parts, refs, fides] = await Promise.all([
    todas(() => servicio.from("centroamericano_fp_jugadas").select("tnr, ronda, mesa, color, deltas, n_legales, rango, delta_jugada, dificil, segundos, antes, reloj, sup_rango, cayo").in("tnr", tnrs).not("deltas", "is", null).order("tnr").order("ronda").order("mesa").order("ply")),
    todas(() => servicio.from("centroamericano_fp_partidas").select("tnr, ronda, mesa, blancas, negras, elo_b, elo_n, resultado").in("tnr", tnrs).order("tnr").order("ronda").order("mesa")),
    todas(() => servicio.from("centroamericano_fp_referencia").select("evento, partida, color, elo, deltas, n_legales, rango, delta_jugada, dificil, trampa, trampa_pct, antes, reloj, sup_rango, cayo").order("evento").order("partida").order("ply")),
    todas(() => servicio.from("centroamericano_fp_fide").select("tnr, clave, fide_id").in("tnr", tnrs).order("tnr").order("clave")),
  ]) as [FilaJugada[], { tnr: string; ronda: number; mesa: number; blancas: string; negras: string; elo_b: number | null; elo_n: number | null; resultado: string | null }[], FilaRef[], { tnr: string; clave: string; fide_id: string }[]];
  // Cómo viene el Elo de cada uno en FIDE (lo que leyó «actualizar»).
  const fideDe = new Map(fides.map((x) => [x.tnr + "|" + x.clave, x.fide_id]));
  const historial = new Map<string, MesFide[]>();
  const ids = [...new Set(fides.map((x) => x.fide_id))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await servicio.from("centroamericano_fp_elo_fide").select("fide_id, historial").in("fide_id", ids.slice(i, i + 200)).not("historial", "is", null);
    for (const x of (data ?? []) as { fide_id: string; historial: MesFide[] }[]) historial.set(x.fide_id, x.historial);
  }
  const ahora = mesDe(new Date());
  const mov = (j: FilaJugada): MovModelo => ({ deltas: j.deltas, n: j.n_legales, rango: j.rango, dj: j.delta_jugada, dificil: j.dificil, seg: j.segundos ?? null,
    ...contextoDe(j.antes, j.reloj), sup: j.sup_rango ?? null, cayo: j.cayo ?? null });
  const partidaDeJugada = new Map(parts.map((p) => [p.tnr + "|" + p.ronda + "|" + p.mesa, p]));
  // Lo que rindió cada uno en su categoría (todas sus partidas jugadas, no solo las de los tableros electrónicos).
  const resultados = new Map<string, { eloRival: number | null; puntos: number }[]>();
  const anotar = (k: string, x: { eloRival: number | null; puntos: number }) => { if (!resultados.has(k)) resultados.set(k, []); resultados.get(k)!.push(x); };
  for (const p of parts) {
    const pb = puntosBlancas(p.resultado);
    if (pb == null || !p.negras) continue;
    anotar(p.tnr + "|" + claveDe(p.blancas), { eloRival: p.elo_n, puntos: pb });
    anotar(p.tnr + "|" + claveDe(p.negras), { eloRival: p.elo_b, puntos: 1 - pb });
  }
  // Por partida y color: quién es, su Elo y sus jugadas.
  const juegos = new Map<string, { tnr: string; ronda: number; mesa: number; color: string; jugador: string; clave: string; elo: number | null; movs: MovModelo[] }>();
  for (const j of jugs) {
    const p = partidaDeJugada.get(j.tnr + "|" + j.ronda + "|" + j.mesa);
    if (!p) continue;
    const k = j.tnr + "|" + j.ronda + "|" + j.mesa + "|" + j.color;
    if (!juegos.has(k)) {
      const jugador = j.color === "blancas" ? p.blancas : p.negras, elo = j.color === "blancas" ? p.elo_b : p.elo_n;
      juegos.set(k, { tnr: j.tnr, ronda: j.ronda, mesa: j.mesa, color: j.color, jugador, clave: claveDe(jugador), elo: elo && elo > 0 ? elo : null, movs: [] });
    }
    juegos.get(k)!.movs.push(mov(j));
  }
  // Cada jugador: todas sus partidas del torneo, su Elo y el que se le reconoce.
  type Jugador = { tnr: string; ritmo: string; clave: string; jugador: string; elo: number | null; eloUsado: number | null; rend: { rp: number; n: number } | null;
    tend: { puntos: number; pendiente: number; meses: number } | null; juegos: { ronda: number; mesa: number; color: string; movs: MovModelo[] }[]; movs: MovModelo[]; s?: number };
  const jugadores = new Map<string, Jugador>();
  for (const g of juegos.values()) {
    const k = g.tnr + "|" + g.clave;
    if (!jugadores.has(k)) jugadores.set(k, { tnr: g.tnr, ritmo: ritmoDe.get(g.tnr) || "clasico", clave: g.clave, jugador: g.jugador, elo: g.elo, eloUsado: null, rend: null, tend: null, juegos: [], movs: [] });
    const j = jugadores.get(k)!;
    j.juegos.push(g); j.movs.push(...g.movs);
    if (!j.elo && g.elo) j.elo = g.elo;
  }
  for (const j of jugadores.values()) {
    if (!j.elo) continue;
    j.rend = rendimiento(resultados.get(j.tnr + "|" + j.clave) || []);
    const id = fideDe.get(j.tnr + "|" + j.clave);
    j.tend = id ? tendencia(historial.get(id), j.ritmo, ahora, !!jovenDe.get(j.tnr)) : null;
    j.eloUsado = eloUsado(j.elo, j.rend, !!jovenDe.get(j.tnr), j.tend ? j.tend.puntos : 0);
  }
  // Las jugadas para ajustar, por ritmo: las de quien tiene Elo (con el que se le reconoce) y, en las clásicas, las de
  // referencia (sin el lado que hizo trampa en las de prueba).
  const conElo: Record<string, (MovModelo & { elo: number })[]> = { clasico: [], rapido: [] };
  for (const j of jugadores.values()) if (j.eloUsado) conElo[j.ritmo].push(...j.movs.map((m) => ({ ...m, elo: j.eloUsado! })));
  const limpias = refs.filter((r) => !r.trampa || r.trampa !== r.color);
  conElo.clasico.push(...limpias.map((r) => ({ ...mov(r), elo: r.elo })));
  if (conElo.clasico.length < 600 && conElo.rapido.length < 600) return { ok: true, insuficiente: true, movimientos: conElo.clasico.length + conElo.rapido.length };
  // El ajuste de cada ritmo: cada 15 min (o la primera vez); un ritmo con menos de 600 jugadas usa los del otro.
  const guardados = (m0?.validacion?.parametros || {}) as Record<string, Parametros>;
  const fresco = m0?.ajustado && Date.now() - new Date(m0.ajustado).getTime() < AJUSTE_MS && !forzar;
  const redondear = (p: Parametros): Parametros => ({ a: Math.round(p.a * 1000) / 1000, b: Math.round(p.b * 1000) / 1000, c: Math.round(p.c * 1000) / 1000,
    kv: Math.round((p.kv ?? 0) * 1000) / 1000, kr: Math.round((p.kr ?? 0) * 1000) / 1000, movimientos: p.movimientos });
  const par: Record<string, Parametros> = {};
  for (const r of ["clasico", "rapido"]) if (conElo[r].length >= 600) par[r] = fresco && guardados[r] ? guardados[r] : redondear(ajustar(conElo[r]));
  par.clasico = par.clasico || par.rapido; par.rapido = par.rapido || par.clasico;
  const ajustado = fresco ? m0.ajustado : new Date().toISOString();
  // El contexto de cada jugada (lo desigual de la posición y el reloj) corre su sensibilidad, con lo que ajustó cada ritmo.
  for (const j of jugadores.values()) { const p = par[j.ritmo]; for (const m of j.movs) m.f = factorContexto(m, p.kv ?? 0, p.kr ?? 0); }
  // La sensibilidad de cada uno: por su Elo reconocido o, sin Elo, la de su categoría sin él.
  for (const tnr of new Set([...jugadores.values()].map((j) => j.tnr))) {
    const c = par[ritmoDe.get(tnr) || "clasico"].c;
    const sinElo = new Map([...jugadores.values()].filter((j) => j.tnr === tnr && !j.eloUsado).map((j) => [j.tnr + "|" + j.clave, j.movs]));
    for (const [k, s] of sSinElJugador(sinElo, c)) jugadores.get(k)!.s = s;
  }
  for (const j of jugadores.values()) if (j.eloUsado) { const p = par[j.ritmo]; j.s = sDeElo(p.a, p.b, j.eloUsado); }
  // Por ritmo: cómo se parecen las tres señales, dónde queda la mitad de la gente y cuánto más varía que el modelo
  // (jugadores con 30 jugadas o más).
  const grupo: Record<string, { R: Correlaciones; centro: number; factor: number; jugadores?: number; umbral?: number; M?: number[][] }> = {};
  for (const r of ["clasico", "rapido"]) {
    const medidos = [...jugadores.values()].filter((j) => j.ritmo === r && j.movs.length >= 30);
    const R = correlaciones(medidos.map((j) => zsCrudas(esperado(j.movs, j.s!, par[r].c))));
    const crudas = medidos.map((j) => zCruda(esperado(j.movs, j.s!, par[r].c), R)).filter((z): z is number => z != null);
    // La vara según cuántos se miden: lo que por azar pasaría uno de cada 20 torneos de este tamaño.
    grupo[r] = { R, ...centroYFactor(crudas), jugadores: medidos.length, umbral: umbralTorneo(medidos.length) };
  }
  // El tiempo: la correlación de cada uno entre lo que pensó y lo difícil de la posición, y cómo es en su ritmo.
  const rho = new Map<string, { rho: number | null; n: number }>();
  for (const [k, j] of jugadores) {
    const pares = j.movs.filter((m) => m.seg != null && m.n > 1).map((m) => [m.seg as number, dificultadEsperada(m, j.s!, par[j.ritmo].c)] as [number, number]);
    rho.set(k, { rho: spearman(pares), n: pares.length });
  }
  const tiempoDe: Record<string, { media: number; desv: number } | null> = {};
  for (const r of ["clasico", "rapido"]) {
    const v = [...jugadores.entries()].filter(([, j]) => j.ritmo === r).map(([k]) => rho.get(k)!.rho).filter((x): x is number => x != null);
    if (v.length < 8) { tiempoDe[r] = null; continue; }
    const media = v.reduce((t, x) => t + x, 0) / v.length, desv = Math.sqrt(v.reduce((t, x) => t + (x - media) ** 2, 0) / v.length);
    tiempoDe[r] = desv > 0 ? { media, desv } : null;
  }
  // Las trampas: cuánto atraen de verdad, medido en la gente de cada ritmo (con 30 jugadas o más).
  const atraccion: Record<string, number> = {};
  for (const r of ["clasico", "rapido"]) atraccion[r] = atraccionDe([...jugadores.values()].filter((j) => j.ritmo === r && j.movs.length >= 30).map((j) => trampas(j.movs, j.s!, par[r].c)));
  // Su historia: el mismo jugador (por su nombre) en otras categorías o eventos ya medidos.
  const porClave = new Map<string, Jugador[]>();
  for (const j of jugadores.values()) { if (!porClave.has(j.clave)) porClave.set(j.clave, []); porClave.get(j.clave)!.push(j); }
  const r2 = (x: number) => Math.round(x * 100) / 100, r1 = (x: number) => Math.round(x * 10) / 10;
  const pJuegos = [], pIndice = [];
  for (const [k, j] of jugadores) {
    const p = par[j.ritmo], g = grupo[j.ritmo];
    for (const juego of j.juegos) {
      const e = esperado(juego.movs, j.s!, p.c), ix = indice(e, g.factor, g.centro, g.R);
      if (!e.n) continue;
      pJuegos.push({ tnr: j.tnr, ronda: juego.ronda, mesa: juego.mesa, color: juego.color, m_jugadas: e.n, m_t1: e.t1, m_e_t1: r2(e.eT1), m_dj: r1(e.dj), m_e_dj: r1(e.eDj),
        m_z_t1: ix.zT1, m_z_dj: ix.zDj, m_z_dif: ix.zDif, z_modelo: ix.z, roi: ix.roi });
    }
    const e = esperado(j.movs, j.s!, p.c), ix = indice(e, g.factor, g.centro, g.R);
    if (!e.n) continue;
    const otros = (porClave.get(j.clave) || []).filter((o) => o.tnr !== j.tnr);
    const eHist = otros.reduce<Esperado | null>((t, o) => { const eo = esperado(o.movs, o.s!, par[o.ritmo].c); return t ? sumar(t, eo) : eo; }, null);
    const hist = eHist && eHist.n ? indice(eHist, g.factor, g.centro, g.R) : null;
    const t = rho.get(k)!, td = tiempoDe[j.ritmo];
    const ra = rachas(j.juegos.map((x) => x.movs), j.s!, p.c, g.factor, g.R);
    const tr = trampas(j.movs, j.s!, p.c, atraccion[j.ritmo]);
    pIndice.push({ tnr: j.tnr, clave: j.clave, jugador: j.jugador, elo: j.elo, comparado: j.elo ? "elo" : "categoria", partidas: j.juegos.length, jugadas: e.n,
      t1: e.t1, e_t1: r2(e.eT1), dj: r1(e.dj), e_dj: r1(e.eDj), dificiles: e.dificiles, t1_dif: e.t1Dif, e_t1_dif: r2(e.eT1Dif),
      z_t1: ix.zT1, z_dj: ix.zDj, z_dif: ix.zDif, z: ix.z, roi: ix.roi, rondas: [...new Set(j.juegos.map((x) => x.ronda))].sort((a, b) => a - b).join(", "),
      ritmo: j.ritmo, elo_usado: j.eloUsado, rendimiento: j.rend ? j.rend.rp : null, rendimiento_partidas: j.rend ? j.rend.n : null,
      hist_partidas: otros.reduce((n, o) => n + o.juegos.length, 0) || null, hist_roi: hist ? hist.roi : null,
      tiempo_rho: t.rho, tiempo_z: t.rho != null && td ? r2((td.media - t.rho) / td.desv) : null, tiempo_jugadas: t.n || null,
      elo_tendencia: j.tend ? j.tend.puntos : null, tendencia_mes: j.tend ? j.tend.pendiente : null,
      racha_largo: ra.largo || null, racha_log10: ra.log10, crit_z: ra.zCrit, facil_z: ra.zFacil, contraste_z: ra.contraste,
      trampas_n: tr.n || null, trampas_cayo: tr.n ? tr.cayo : null, trampas_e: tr.n ? tr.esperado : null, trampas_z: tr.z,
      umbral_z: g.umbral ?? null, z_combinada: null as number | null, roi_combinado: null as number | null, _ritmo: j.ritmo, _movs: j.movs.length });
  }
  // Todas las señales en una cuenta: la correlación entre ellas, medida en los de cada ritmo con 30 jugadas o más.
  const senales = (x: (typeof pIndice)[number]) => [x.z, x.tiempo_z, x.contraste_z, x.trampas_z] as (number | null)[];
  for (const r of ["clasico", "rapido"]) {
    const M = correlacionDe(pIndice.filter((x) => x._ritmo === r && x._movs >= 30).map(senales));
    grupo[r].M = M;
    for (const x of pIndice.filter((y) => y._ritmo === r)) {
      x.z_combinada = combinada(senales(x), M);
      x.roi_combinado = x.z_combinada == null ? null : Math.round((50 + 5 * x.z_combinada) * 10) / 10;
    }
  }
  for (const x of pIndice) { delete (x as Record<string, unknown>)._ritmo; delete (x as Record<string, unknown>)._movs; }
  // Qué tan confiable es: con la gente de verdad de cada ritmo y, si hay, con los casos de prueba.
  const lista = (r: string) => [...jugadores.values()].filter((j) => j.ritmo === r).map((j) => ({ movs: j.movs, s: j.s! }));
  const validacion: Record<string, unknown> = validar(lista("clasico"), par.clasico.c, grupo.clasico.factor, grupo.clasico.centro, undefined, grupo.clasico.R);
  if (lista("rapido").length) validacion.rapido = validar(lista("rapido"), par.rapido.c, grupo.rapido.factor, grupo.rapido.centro, undefined, grupo.rapido.R);
  const casos = new Map<string, { movs: MovModelo[]; elo: number; trampa: boolean; pct: number | null }>();
  for (const r of refs.filter((x) => x.trampa)) {
    const k = r.evento + "|" + r.partida + "|" + r.color;
    if (!casos.has(k)) casos.set(k, { movs: [], elo: r.elo, trampa: r.trampa === r.color, pct: r.trampa === r.color ? r.trampa_pct ?? null : null });
    const m = mov(r); m.f = factorContexto(m, par.clasico.kv ?? 0, par.clasico.kr ?? 0);
    casos.get(k)!.movs.push(m);
  }
  if (casos.size) validacion.casos = casosDePrueba([...casos.values()].map((x) => ({ movs: x.movs, s: sDeElo(par.clasico.a, par.clasico.b, x.elo), trampa: x.trampa, pct: x.pct })), par.clasico.c, grupo.clasico.factor, grupo.clasico.centro, grupo.clasico.R);
  validacion.parametros = par;
  validacion.grupos = grupo;
  validacion.atraccion = atraccion;
  const pModelo = { a: par.clasico.a, b: par.clasico.b, c: par.clasico.c, centro: grupo.clasico.centro, factor: grupo.clasico.factor,
    movimientos: conElo.clasico.length + conElo.rapido.length, jugadores: jugadores.size, referencia: refs.length, validacion, ajustado };
  await rpc("centroamericano_fp_modelo_guardar", { p_juegos: pJuegos, p_indice: pIndice, p_modelo: pModelo });
  return { ok: true, modelo: pModelo, partidas: pJuegos.length, jugadores: pIndice.length };
}

// Una partida de otro torneo (de un PGN que cargó el equipo de Fair Play), analizada en la pantalla con el mismo motor:
// se arma con chess.js, se comprueba la evaluación como la de LiveChess y se guardan sus jugadas con el Elo de cada uno
// (sin nombres), para ajustar el modelo con más gente que la del torneo.
// deno-lint-ignore no-explicit-any
async function referenciaGuardar(servicio: any, rpc: Rpc, cuerpo: Record<string, unknown>, quien: string) {
  const evento = String(cuerpo.evento ?? "").trim().slice(0, 80), partida = String(cuerpo.partida ?? "").trim().slice(0, 80);
  if (!evento || !partida) throw new Error("Falta el nombre del evento o de la partida.");
  const jugadas = Array.isArray(cuerpo.jugadas) ? (cuerpo.jugadas as unknown[]).slice(0, 600).map(String) : [];
  const { posiciones, plies } = partidaDe({ moves: jugadas });
  if (posiciones.length !== jugadas.length || posiciones.length < DESDE_POSICION + 2) throw new Error("La partida no se pudo leer entera, o es muy corta.");
  const evals = evalsValidas(cuerpo.evals, posiciones.length), opciones = opcionesValidas(cuerpo.opciones, posiciones.length);
  const superficiales = superficialesValidas(cuerpo.superficiales, posiciones.length);
  if (!evals || !opciones || !superficiales) throw new Error("La evaluación no corresponde a esa partida.");
  const elo = { blancas: Number(cuerpo.elo_b) || null, negras: Number(cuerpo.elo_n) || null };
  // De prueba: quién usó el motor (se sabe la respuesta). No entra al ajuste; mide si el índice lo marca.
  const trampa = cuerpo.trampa === "blancas" || cuerpo.trampa === "negras" ? cuerpo.trampa : null;
  // En qué proporción usó el motor (de 1 a 100, si se sabe): para medir cuánto marca en cada proporción.
  const pct = Number(cuerpo.trampa_pct);
  const trampaPct = trampa && Number.isInteger(pct) && pct >= 1 && pct <= 100 ? pct : null;
  const detalle = detallar(plies, evals, opciones, [], undefined, undefined, superficiales);
  const filas = detalle.jugadas.filter((d) => { const e = elo[d.color]; return e && e >= 100 && e <= 3500; })
    .map((d) => ({ evento, partida, ply: d.ply, color: d.color, elo: elo[d.color], deltas: d.deltas, n_legales: d.n_legales, rango: Math.min(MAX_OPCIONES, d.rango),
      delta_jugada: d.delta_jugada, dificil: d.dificil, trampa, trampa_pct: trampaPct, antes: d.antes, sup_rango: d.sup_rango, cayo: d.cayo, cargado_por: quien.slice(0, 120) }));
  if (filas.length) {
    const { error } = await servicio.from("centroamericano_fp_referencia").upsert(filas, { onConflict: "evento,partida,ply" });
    if (error) throw new Error(error.message);
  }
  return { ok: true, jugadas: filas.length };
}
