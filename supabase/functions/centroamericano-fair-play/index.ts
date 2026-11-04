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
//   "actualizar"  {}  → lee los emparejamientos de chess-results (públicos) y las partidas transmitidas a
//                       Lichess, saca la precisión de cada jugador y calibra las alertas (a lo sumo cada 90 s).

import { createClient } from "npm:@supabase/supabase-js@2";
import { categoriaDeLichess, leerPareos, leerPgn, medir, MIN_JUGADAS, rondaYMesa } from "./analisis.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SALA = "centroamericano-2026";
const LICHESS = "https://lichess.org";
const CADA_MS = 90_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

let ultimaActualizacion = 0;   // en esta instancia; la base guarda la de verdad en fp_partidas.leida

// Lichess corta (429) si se le pide muy seguido: una pausa antes de cada pedido. Si igual corta, lo que ya se
// analizó queda guardado y el resto entra en la próxima actualización.
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pedir(url: string, texto = true): Promise<string | unknown> {
  if (url.startsWith(LICHESS)) await pausa(700);
  const r = await fetch(url, { headers: { "User-Agent": "AjedrezIntegral-FairPlay/1.0" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(url + " contestó " + r.status);
  return texto ? await r.text() : await r.json();
}

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
    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 400);
  }
});

// ---------------------------------------------------------------- chess-results y Lichess
type Rpc = (f: string, args: Record<string, unknown>) => Promise<unknown>;
// deno-lint-ignore no-explicit-any
async function actualizar(servicio: any, rpc: Rpc) {
  const { data: ultima } = await servicio.from("centroamericano_fp_partidas").select("leida").order("leida", { ascending: false }).limit(1).maybeSingle();
  const hace = ultima?.leida ? Date.now() - new Date(ultima.leida).getTime() : Infinity;
  if (hace < CADA_MS || Date.now() - ultimaActualizacion < CADA_MS) return { ok: true, saltado: true, actualizado: ultima?.leida ?? null };
  ultimaActualizacion = Date.now();
  const rondas = await rpc("centroamericano_fp_rondas", {}) as { tnr: string; ronda: number; prueba: boolean }[];
  const errores: string[] = [];
  let pareos = 0, analizadas = 0;

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

  // 2. Las partidas de los tableros electrónicos: la transmisión de Lichess que dice la sala del Centroamericano.
  try {
    const { data: sala } = await servicio.from("salas_torneo").select("enlaces").eq("clave", SALA).maybeSingle();
    const url = ((sala?.enlaces ?? []) as { url: string }[]).map((x) => x.url).find((u) => /lichess\.org\/broadcast\//.test(u));
    const id = url ? (url.match(/\/([A-Za-z0-9]{8})(?:[/?#]|$)/) || [])[1] : null;
    if (id) {
      // deno-lint-ignore no-explicit-any
      const evento = await pedir(LICHESS + "/api/broadcast/" + id, false) as any;
      const tours = evento.group?.tours ?? [{ id: evento.tour.id, name: evento.tour.name }];
      const { data: torneos } = await servicio.from("centroamericano_torneos").select("tnr, categoria, rama, prueba");
      const ronda = Math.max(0, ...rondas.filter((r) => !r.prueba).map((r) => r.ronda));
      for (const t of tours) {
        const cat = categoriaDeLichess(t.name);
        const tnr = cat && (torneos ?? []).find((x: { categoria: string; rama: string; prueba: boolean }) => !x.prueba && x.categoria === cat.categoria && x.rama === cat.rama)?.tnr;
        if (!tnr) continue;
        // deno-lint-ignore no-explicit-any
        const det = await pedir(LICHESS + "/api/broadcast/" + t.id, false) as any;
        for (const rd of det.rounds ?? []) {
          const n = Number(String(rd.name).match(/\d+/)?.[0]);
          if (!n || n > ronda || !(rd.finished || rd.ongoing)) continue;
          const { count } = await servicio.from("centroamericano_fp_analisis").select("mesa", { count: "exact", head: true }).eq("tnr", tnr).eq("ronda", n);
          if (rd.finished && n < ronda && (count ?? 0) > 0) continue;   // ronda vieja ya analizada
          const pgn = await pedir(LICHESS + "/api/broadcast/round/" + rd.id + ".pgn") as string;
          const filas = [];
          for (const g of leerPgn(pgn)) {
            const rm = rondaYMesa(g.tags);
            if (!rm || !g.tags.Result || g.tags.Result === "*") continue;   // solo partidas terminadas
            const m = medir(g.evals);
            for (const [color, med, yo, rival, eloYo, eloRival] of [
              ["blancas", m.blancas, g.tags.White, g.tags.Black, g.tags.WhiteElo, g.tags.BlackElo],
              ["negras", m.negras, g.tags.Black, g.tags.White, g.tags.BlackElo, g.tags.WhiteElo]] as const) {
              if (med.jugadas < MIN_JUGADAS) continue;
              filas.push({ tnr, ronda: rm.ronda, mesa: rm.mesa, color, jugador: (yo ?? "").slice(0, 120), elo: Number(eloYo) || null,
                rival: (rival ?? "").slice(0, 120), rival_elo: Number(eloRival) || null, resultado: g.tags.Result.slice(0, 10),
                jugadas: med.jugadas, precision: med.precision, acpl: med.acpl, partida_url: (g.tags.GameURL ?? "").slice(0, 300) || null,
                analizada: new Date().toISOString() });
            }
          }
          if (filas.length) {
            // Sin «estado» ni «nota»: lo que decidió el encargado no se pisa al volver a analizar.
            const { error } = await servicio.from("centroamericano_fp_analisis").upsert(filas, { onConflict: "tnr,ronda,mesa,color" });
            if (error) errores.push("análisis " + tnr + " ronda " + n + ": " + error.message); else analizadas += filas.length;
          }
        }
      }
    }
  } catch (e) { errores.push("Lichess: " + (e as Error).message); }

  await rpc("centroamericano_fp_calibrar", {});
  return { ok: true, pareos, analizadas, errores, actualizado: new Date().toISOString() };
}
