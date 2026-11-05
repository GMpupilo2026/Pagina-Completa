// centroamericano-transmision: la pantalla del ENCARGADO DE TRANSMISIÓN del Centroamericano 2026.
//
// Todos los tableros electrónicos de todas las categorías, en vivo y sin atraso (LiveChess Cloud), en una sola
// pantalla, con lo que hace falta para avisar cuando un tablero tiene un problema: si transmite, el reloj (con su
// hora, si corre o está detenido), las jugadas con el reloj después de cada una, los jugadores que dice LiveChess y
// los de chess-results en esa mesa, y el resultado que anotó el árbitro. Los avisos los calcula la pantalla
// (js/centroamericano-transmision.js, con chess.js): acá solo se juntan los datos.
// Ver «El encargado de transmisión (Centroamericano)» en docs/decisiones/juegos-y-torneos.md.
//
// verify_jwt en FALSE (como centroamericano-fair-play): el encargado no trae JWT. La función decide sola:
//   - con {token}: un enlace de centroamericano_tx_enlaces que no se apagó ni venció; o
//   - sin token: el JWT de quien llama y tengo_herramienta('mesa-arbitro') (la pestaña «Transmisión» del principal).
//
//   "leer"       {}                                         → todas las categorías con sus tableros
//   "reasignar"  {tnr, ronda, tablero, mesa|null, intercambiar?} → «en este tablero se juega la mesa M de
//                                                               chess-results»; los nombres salen de los emparejamientos
//                                                               ya leídos. mesa null: vuelve a lo de siempre.
//   "atender"    {clave, nota?}                             → «Ya lo revisé», con quién y cuándo
//   "registrar"  {avisos: [{clave, tnr, ronda, tablero, mesa, tipo, nivel, titulo, texto}]} → la primera vez que una
//                                                               pantalla ve un aviso (para el historial de la ronda)
//   "avisar"     {clave, tnr, ronda, mesa, texto}           → se lo manda al árbitro de esa mesa: el mismo aviso de la
//                                                               organización (centroamericano_avisos), con «Entendido»
//   "historial"  {}                                         → todo lo registrado, con quién lo revisó y si el árbitro
//                                                               leyó el aviso: el informe de la ronda en PDF
//
// El reloj de LiveChess: `run` es true cuando corre el de las blancas, false cuando corre el de las negras y null
// cuando está detenido (comprobado el 4/11 con la ronda 5: tras cada jugada de las blancas, false). Se pasa como
// `corre`: "blancas", "negras" o null.
//
// Nunca devuelve el id de LiveChess (sin atraso: no se publica) ni el token de nadie.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AGENTE = "AjedrezIntegral-Transmision/1.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ---- los nombres: la MISMA regla que js/centroamericano-transmision-reloj.js y centroamericano-mesas-vivo
// (verificar-centroamericano-mesas-vivo.js comprueba que las copias dicen lo mismo, letra por letra).
const palabras = (s: unknown) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-zñ0-9\s]/g, " ").split(/\s+/).filter((x) => x.length > 1);
function mismoJugador(a: unknown, b: unknown) {
  const pa = new Set(palabras(a)), pb = palabras(b);
  if (!pa.size || !pb.length) return false;
  const comunes = pb.filter((x) => pa.has(x)).length;
  return comunes >= 2 || (comunes >= 1 && Math.min(pa.size, pb.length) === 1);
}

// ---- LiveChess Cloud: público y sin atraso (por eso el id no sale nunca de esta función)
const LIVECHESS = "https://1.pool.livechesscloud.com/get/";
const TORNEO_MS = 60_000, INDICE_MS = 8_000, PARTIDA_MS = 3_000;
const lcCache = new Map<string, { leido: number; datos: Promise<unknown> }>();
function lcPedir(ruta: string, ms: number) {
  const c = lcCache.get(ruta);
  if (c && Date.now() - c.leido < ms) return c.datos;
  const datos = fetch(LIVECHESS + ruta, { headers: { "User-Agent": AGENTE }, signal: AbortSignal.timeout(9_000) })
    .then((r) => { if (r.status === 404) return null; if (!r.ok) throw new Error("LiveChess contestó " + r.status + "."); return r.json(); });
  datos.catch(() => lcCache.delete(ruta));
  lcCache.set(ruta, { leido: Date.now(), datos });
  if (lcCache.size > 600) for (const [k, v] of lcCache) if (Date.now() - v.leido > TORNEO_MS) lcCache.delete(k);
  return datos;
}
// deno-lint-ignore no-explicit-any
const nombreLc = (p: any) => [p?.lname, p?.fname, p?.mname].filter(Boolean).join(" ");
function tablerosDe(t: string): number[] {
  const out = new Set<number>();
  for (const parte of String(t || "").split(",")) {
    const m = parte.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) continue;
    for (let i = Number(m[1]); i <= Number(m[2] || m[1]) && i <= 200; i++) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}
// «90 min + 30 seg add» → { base: 5400, inc: 30 }
function ritmoDe(texto: unknown) {
  const t = String(texto || "");
  // También «Noventa (90) minutos, con un incremento de treinta (30) segundos» (así lo escribió una categoría).
  const b = t.match(/(\d+)\)?\s*(?:min|')/i), i = t.match(/(\d+)\)?\s*(?:s\b|seg|sec|")/i);
  return { texto: t, base: b ? Number(b[1]) * 60 : null, inc: i ? Number(i[1]) : (b ? 0 : null) };
}

type MesaCr = { mesa: number; blancas: string; negras: string };
// Una mesa sin rival (retirado, bye): chess-results pone una palabra donde iría el rival. No es una partida.
const SIN_RIVAL = /^(ausgeschieden|bye|spielfrei|freilos|libre|exento|exenta|descansa|retirad[oa]|withdrawn|sin emparejar|not paired|unpaired)$/i;
const conRival = (m: MesaCr) => [m.blancas, m.negras].every((x) => /\p{L}/u.test(String(x || "")) && !SIN_RIVAL.test(String(x).trim()));
type Cambio = { tnr: string; ronda: number; tablero: number; mesa: number; blancas: string; negras: string; por: string; actualizado: string };

// Los emparejamientos de la ronda: la lectura compartida de chess-results (centroamericano_lecturas) trae solo las
// mesas que todavía no tienen resultado; las demás salen de los emparejamientos completos que lee Fair Play
// (centroamericano_fp_partidas). Con las dos, están todas.
// deno-lint-ignore no-explicit-any
function unirMesas(lectura: MesaCr[], completas: any[]): MesaCr[] {
  const out = new Map<number, MesaCr>();
  for (const m of completas || []) out.set(Number(m.mesa), { mesa: Number(m.mesa), blancas: String(m.blancas || ""), negras: String(m.negras || "") });
  for (const m of lectura || []) out.set(Number(m.mesa), { mesa: Number(m.mesa), blancas: String(m.blancas || ""), negras: String(m.negras || "") });
  return [...out.values()].filter(conRival).sort((a, b) => a.mesa - b.mesa);
}

// Qué mesa de chess-results se juega en cada tablero: la que dijo el encargado, o la del mismo número si nadie la
// movió a otro tablero.
function mesaDelTablero(tablero: number, cambios: Cambio[], mesas: MesaCr[]): { mesa: MesaCr | null; cambio: Cambio | null } {
  const c = cambios.find((x) => x.tablero === tablero);
  if (c) return { mesa: { mesa: c.mesa, blancas: c.blancas, negras: c.negras }, cambio: c };
  if (cambios.some((x) => x.mesa === tablero)) return { mesa: null, cambio: null };   // su mesa se fue a otro tablero
  return { mesa: mesas.find((m) => m.mesa === tablero) || null, cambio: null };
}

// El último resultado que anotó el árbitro de cada mesa (sin los anulados).
type Reg = { id: string; tnr: string; ronda: number; mesa: number; tipo: string; resultado: string | null; anula: string | null; ocurrio: string };
function resultadosDe(filas: Reg[]) {
  const anulados = new Set(filas.filter((f) => f.tipo === "anulacion" && f.anula).map((f) => f.anula));
  const out = new Map<string, string | null>();
  for (const f of filas.filter((x) => (x.tipo === "resultado" || x.tipo === "correccion") && !anulados.has(x.id)).sort((a, b) => a.ocurrio.localeCompare(b.ocurrio))) {
    out.set(f.tnr + "|" + f.ronda + "|" + f.mesa, f.resultado === "borrado" ? null : f.resultado);
  }
  return out;
}

type Asig = { id: string; tnr: string; arbitro: string; mesa_desde: number; mesa_hasta: number; persona: string | null; todas_las_mesas: boolean | null };
// Los árbitros con enlace vigente que tienen esa mesa (uno por persona: el mismo árbitro con dos enlaces, una vez).
function arbitrosDe(asigs: Asig[], tnr: string, mesa: number) {
  const vistos = new Set<string>();
  return asigs.filter((a) => a.tnr === tnr && (a.todas_las_mesas || (mesa >= a.mesa_desde && mesa <= a.mesa_hasta)))
    .filter((a) => { const k = a.persona || a.id; if (vistos.has(k)) return false; vistos.add(k); return true; });
}
const asignacionesVigentes = async (servicio: ReturnType<typeof createClient>, tnrs: string[]) => {
  const { data } = await servicio.from("centroamericano_asignaciones").select("id, tnr, arbitro, mesa_desde, mesa_hasta, persona, todas_las_mesas")
    .in("tnr", tnrs.length ? tnrs : ["-"]).eq("revocada", false).gt("vence", new Date().toISOString()).range(0, 999);
  return (data ?? []) as Asig[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);
  let cuerpo: Record<string, unknown> = {};
  try { cuerpo = await req.json(); } catch { cuerpo = {}; }
  const servicio = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // ---------------------------------------------------------------- quién llama
  let quien = "";
  const token = String(cuerpo.token ?? "").trim();
  if (token) {
    const malo = "Este enlace no es válido. Pídele al árbitro principal que te mande el QR de nuevo.";
    if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: malo }, 404);
    const { data: e } = await servicio.from("centroamericano_tx_enlaces").select("id, nombre, vence, revocada, ultimo_uso").eq("token", token).maybeSingle();
    if (!e) return json({ error: malo }, 404);
    if (e.revocada) return json({ error: "El árbitro principal apagó este enlace." }, 410);
    if (new Date(e.vence).getTime() <= Date.now()) return json({ error: "Este enlace venció. Pídele uno nuevo al árbitro principal." }, 410);
    quien = e.nombre + " (transmisión)";
    if (!e.ultimo_uso || Date.now() - new Date(e.ultimo_uso).getTime() > 30_000) {
      servicio.from("centroamericano_tx_enlaces").update({ ultimo_uso: new Date().toISOString() }).eq("id", e.id).then(() => {});
    }
  } else {
    const autorizacion = req.headers.get("Authorization") ?? "";
    if (!/^Bearer\s+\S+/i.test(autorizacion)) return json({ error: "Falta el enlace del encargado de transmisión." }, 401);
    const comoQuienLlama = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: autorizacion } } });
    const { data: puede, error } = await comoQuienLlama.rpc("tengo_herramienta", { p_herramienta: "mesa-arbitro" });
    if (error || puede !== true) return json({ error: "Solo el árbitro principal o un encargado de transmisión." }, 403);
    const { data: u } = await comoQuienLlama.auth.getUser(autorizacion.replace(/^Bearer\s+/i, "").trim());
    const { data: perfil } = u?.user ? await servicio.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle() : { data: null };
    quien = String(perfil?.full_name ?? "").trim() || "Árbitro principal";
  }

  try {
    const accion = String(cuerpo.action ?? "");

    if (accion === "leer") {
      const [{ data: lcs }, { data: torneos }, { data: lecturas }] = await Promise.all([
        servicio.from("centroamericano_livechess").select("tnr, torneo_id, tableros"),
        servicio.from("centroamericano_torneos").select("tnr, nombre, orden, prueba").order("orden"),
        servicio.from("centroamericano_lecturas").select("tnr, ronda, mesas, leida"),
      ]);
      const conLc = (torneos ?? []).filter((t: { tnr: string; prueba: boolean }) => !t.prueba && (lcs ?? []).some((l: { tnr: string }) => l.tnr === t.tnr));
      const tnrs = conLc.map((t: { tnr: string }) => t.tnr);
      const rondas = [...new Set((lecturas ?? []).filter((l: { tnr: string }) => tnrs.includes(l.tnr)).map((l: { ronda: number }) => Number(l.ronda) || 0))];
      const [{ data: cambios }, { data: registro }, { data: atendidas }, { data: completas }, asigs, { data: historial }] = await Promise.all([
        servicio.from("centroamericano_tx_tableros").select("*").in("tnr", tnrs.length ? tnrs : ["-"]).in("ronda", rondas.length ? rondas : [0]),
        servicio.from("centroamericano_registro").select("id, tnr, ronda, mesa, tipo, resultado, anula, ocurrio")
          .in("tnr", tnrs.length ? tnrs : ["-"]).in("ronda", rondas.length ? rondas : [0]).in("tipo", ["resultado", "correccion", "anulacion"]).range(0, 4999),
        servicio.from("centroamericano_tx_atendidas").select("clave, quien, en").gte("en", new Date(Date.now() - 36 * 3600_000).toISOString()).range(0, 4999),
        servicio.from("centroamericano_fp_partidas").select("tnr, ronda, mesa, blancas, negras").in("tnr", tnrs.length ? tnrs : ["-"]).in("ronda", rondas.length ? rondas : [0]).range(0, 4999),
        asignacionesVigentes(servicio, tnrs),
        servicio.from("centroamericano_tx_historial").select("clave, avisado_en, avisado_por, avisado_a, avisos").in("tnr", tnrs.length ? tnrs : ["-"]).in("ronda", rondas.length ? rondas : [0]).not("avisado_en", "is", null).range(0, 1999),
      ]);
      // Si el árbitro ya tocó «Entendido» en cada aviso que se le mandó.
      const idsAvisos = (historial ?? []).flatMap((h: { avisos: string[] }) => h.avisos || []);
      const { data: leidos } = idsAvisos.length ? await servicio.from("centroamericano_avisos").select("id, leido_en").in("id", idsAvisos) : { data: [] };
      const leidoDe = new Map((leidos ?? []).map((x: { id: string; leido_en: string | null }) => [x.id, x.leido_en]));
      const resultados = resultadosDe((registro ?? []) as Reg[]);

      const categorias = await Promise.all(conLc.map(async (t: { tnr: string; nombre: string }) => {
        const lc = (lcs ?? []).find((x: { tnr: string }) => x.tnr === t.tnr) as { torneo_id: string; tableros: string };
        const l = (lecturas ?? []).find((x: { tnr: string }) => x.tnr === t.tnr) as { ronda: number; mesas: MesaCr[]; leida: string } | undefined;
        const ronda = Number(l?.ronda) || 0;
        const mesasCr = unirMesas((l?.mesas ?? []) as MesaCr[], (completas ?? []).filter((x: { tnr: string; ronda: number }) => x.tnr === t.tnr && x.ronda === ronda));
        const susCambios = ((cambios ?? []) as Cambio[]).filter((c) => c.tnr === t.tnr && c.ronda === ronda);
        const base = { tnr: t.tnr, nombre: t.nombre, ronda, leida_cr: l?.leida ?? null, mesas_cr: mesasCr };
        if (!ronda) return { ...base, error: "Todavía no se ha leído la ronda de chess-results.", tableros: [] };
        try {
          // deno-lint-ignore no-explicit-any
          const [tor, indice]: any = await Promise.all([lcPedir(lc.torneo_id + "/tournament.json", TORNEO_MS), lcPedir(lc.torneo_id + "/round-" + ronda + "/index.json", INDICE_MS)]);
          if (!tor) return { ...base, error: "LiveChess no abre esta categoría: ¿la computadora de los tableros dejó de transmitir?", tableros: [] };
          const ritmo = ritmoDe(tor.timecontrol);
          const pareos = (indice && Array.isArray(indice.pairings)) ? indice.pairings : [];
          const nums = tablerosDe(lc.tableros);
          const lista = nums.length ? nums : pareos.map((_: unknown, i: number) => i + 1);
          const enRonda = Array.isArray(tor.rounds) ? tor.rounds[ronda - 1] : null;
          const tableros = await Promise.all(lista.map(async (n: number) => {
            const { mesa, cambio } = mesaDelTablero(n, susCambios, mesasCr);
            const p = pareos[n - 1];
            const cr = mesa ? { ...mesa, resultado: resultados.get(t.tnr + "|" + ronda + "|" + mesa.mesa) ?? null,
              arbitros: arbitrosDe(asigs, t.tnr, mesa.mesa).map((a) => a.arbitro) } : null;
            // ¿Los de LiveChess están en otra mesa de chess-results? (alguien se cambió de tablero)
            const otra = p ? mesasCr.find((m) => mismoJugador(m.blancas, nombreLc(p.white)) && mismoJugador(m.negras, nombreLc(p.black))) : null;
            const fila: Record<string, unknown> = { tablero: n, cr, cambio: cambio ? { por: cambio.por, actualizado: cambio.actualizado } : null,
              lc: p ? { blancas: nombreLc(p.white), negras: nombreLc(p.black), resultado: p.result ?? null, live: !!p.live } : null,
              coincide: !!(p && cr && mismoJugador(cr.blancas, nombreLc(p.white)) && mismoJugador(cr.negras, nombreLc(p.black))),
              al_reves: !!(p && cr && mismoJugador(cr.blancas, nombreLc(p.black)) && mismoJugador(cr.negras, nombreLc(p.white))),
              en_otra_mesa: otra && (!cr || otra.mesa !== cr.mesa) ? otra.mesa : null };
            if (!p) return { ...fila, partida: null };
            // deno-lint-ignore no-explicit-any
            const g: any = await lcPedir(lc.torneo_id + "/round-" + ronda + "/game-" + n + ".json?poll", PARTIDA_MS).catch(() => undefined);
            if (g === undefined) return { ...fila, partida: null, error: "No se pudo leer este tablero en LiveChess." };
            if (!g) return { ...fila, partida: null };
            return { ...fila, partida: { live: !!g.live, serial: String(g.serialNr ?? ""), resultado: g.result ?? null, primera: typeof g.firstMove === "number" ? g.firstMove : null,
              reloj: g.clock && typeof g.clock === "object" ? { blancas: Number(g.clock.white), negras: Number(g.clock.black), corre: g.clock.run === true ? "blancas" : g.clock.run === false ? "negras" : null, hora: Number(g.clock.time) || null } : null,
              jugadas: (Array.isArray(g.moves) ? g.moves : []).slice(0, 700).map(String) } };
          }));
          return { ...base, ritmo, ronda_lc: enRonda ? { partidas: Number(enRonda.count) || 0, en_vivo: Number(enRonda.live) || 0 } : null,
            sin_pareo: !pareos.length, tableros };
        } catch (e) {
          return { ...base, error: "No se pudo leer LiveChess: " + ((e as Error).message || e), tableros: [] };
        }
      }));
      return json({ ok: true, nombre: quien.replace(/ \(transmisión\)$/, ""), principal: !token, leida: Date.now(), categorias,
        atendidas: (atendidas ?? []).map((a: { clave: string; quien: string; en: string }) => a),
        avisados: (historial ?? []).map((h: { clave: string; avisado_en: string; avisado_por: string; avisado_a: string; avisos: string[] }) => ({
          clave: h.clave, en: h.avisado_en, por: h.avisado_por, a: h.avisado_a,
          leido: (h.avisos || []).map((id) => leidoDe.get(id)).filter(Boolean).sort()[0] ?? null })) });
    }

    if (accion === "reasignar") {
      const tnr = String(cuerpo.tnr ?? ""), ronda = Number(cuerpo.ronda), tablero = Number(cuerpo.tablero);
      const mesa = cuerpo.mesa == null || cuerpo.mesa === "" ? null : Number(cuerpo.mesa);
      const [{ data: lc }, { data: l }] = await Promise.all([
        servicio.from("centroamericano_livechess").select("tableros").eq("tnr", tnr).maybeSingle(),
        servicio.from("centroamericano_lecturas").select("ronda, mesas").eq("tnr", tnr).maybeSingle(),
      ]);
      if (!lc) return json({ error: "Esa categoría no tiene tableros electrónicos." }, 400);
      const nums = tablerosDe(lc.tableros);
      if (!Number.isInteger(tablero) || (nums.length && !nums.includes(tablero))) return json({ error: "Ese tablero no se transmite." }, 400);
      if (!l || Number(l.ronda) !== ronda) return json({ error: "La ronda cambió: vuelve a leer y prueba otra vez." }, 409);
      const { data: completas } = await servicio.from("centroamericano_fp_partidas").select("mesa, blancas, negras").eq("tnr", tnr).eq("ronda", ronda).range(0, 999);
      const mesas = unirMesas((l.mesas ?? []) as MesaCr[], completas ?? []);
      const { data: actuales } = await servicio.from("centroamericano_tx_tableros").select("*").eq("tnr", tnr).eq("ronda", ronda);
      const cambios = (actuales ?? []) as Cambio[];
      const antes = mesaDelTablero(tablero, cambios, mesas).mesa;
      const por = quien.slice(0, 120);
      if (mesa == null) {
        await servicio.from("centroamericano_tx_tableros").delete().eq("tnr", tnr).eq("ronda", ronda).eq("tablero", tablero);
        return json({ ok: true, texto: "El tablero " + tablero + " vuelve a la mesa " + tablero + " de chess-results." });
      }
      const m = mesas.find((x) => Number(x.mesa) === mesa);
      if (!m) return json({ error: "La mesa " + mesa + " no está en los emparejamientos de la ronda " + ronda + "." }, 400);
      // ¿Dónde estaba esa mesa? Si estaba en otro tablero electrónico, se saca de ahí (y, si se pidió, ese tablero se
      // queda con la mesa que tenía este: un intercambio).
      const donde = nums.find((n) => n !== tablero && mesaDelTablero(n, cambios, mesas).mesa?.mesa === mesa) ?? null;
      const filas: Record<string, unknown>[] = [{ tnr, ronda, tablero, mesa, blancas: m.blancas, negras: m.negras, por, actualizado: new Date().toISOString() }];
      await servicio.from("centroamericano_tx_tableros").delete().eq("tnr", tnr).eq("ronda", ronda).eq("mesa", mesa);
      if (donde != null && cuerpo.intercambiar && antes) {
        await servicio.from("centroamericano_tx_tableros").delete().eq("tnr", tnr).eq("ronda", ronda).eq("mesa", antes.mesa);
        filas.push({ tnr, ronda, tablero: donde, mesa: antes.mesa, blancas: antes.blancas, negras: antes.negras, por, actualizado: new Date().toISOString() });
      }
      const { error } = await servicio.from("centroamericano_tx_tableros").upsert(filas, { onConflict: "tnr,ronda,tablero" });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, donde, texto: "Listo: en el tablero " + tablero + " se juega la mesa " + mesa + " (" + m.blancas + " – " + m.negras + ")" +
        (donde != null ? (cuerpo.intercambiar && antes ? "; en el tablero " + donde + ", la mesa " + antes.mesa + "." : "; el tablero " + donde + " queda sin mesa.") : ".") });
    }

    if (accion === "atender") {
      const clave = String(cuerpo.clave ?? "").slice(0, 200);
      if (clave.length < 3) return json({ error: "Falta el aviso." }, 400);
      const { error } = await servicio.from("centroamericano_tx_atendidas").upsert({ clave, quien: quien.slice(0, 120), nota: String(cuerpo.nota ?? "").slice(0, 300), en: new Date().toISOString() }, { onConflict: "clave" });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }
    if (accion === "registrar") {
      // La primera vez que una pantalla ve cada aviso. Si ya estaba, no se toca (la hora es la primera).
      const lista = (Array.isArray(cuerpo.avisos) ? cuerpo.avisos : []).slice(0, 200) as Record<string, unknown>[];
      const { data: torneos } = await servicio.from("centroamericano_torneos").select("tnr");
      const validos = new Set((torneos ?? []).map((t: { tnr: string }) => t.tnr));
      const filas = lista.map((a) => ({
        clave: String(a.clave ?? "").slice(0, 200), tnr: String(a.tnr ?? ""), ronda: Number(a.ronda) || 0, tablero: Number(a.tablero) || 0,
        mesa: Number.isInteger(Number(a.mesa)) && Number(a.mesa) > 0 ? Number(a.mesa) : null,
        tipo: String(a.tipo ?? "").slice(0, 40), nivel: a.nivel === "urgente" ? "urgente" : "revisar",
        titulo: String(a.titulo ?? "").slice(0, 120), texto: String(a.texto ?? "").slice(0, 800), visto_por: quien.slice(0, 120),
      })).filter((f) => f.clave.length >= 3 && validos.has(f.tnr) && /^[a-z_0-9]{2,40}$/.test(f.tipo) && f.ronda >= 0 && f.ronda <= 99 && f.tablero >= 0 && f.tablero <= 200);
      if (filas.length) {
        const { error } = await servicio.from("centroamericano_tx_historial").upsert(filas, { onConflict: "clave", ignoreDuplicates: true });
        if (error) return json({ error: error.message }, 400);
      }
      return json({ ok: true, registrados: filas.length });
    }

    if (accion === "avisar") {
      // Al árbitro (o árbitros) con enlace vigente que tienen esa mesa, como un aviso de la organización.
      const tnr = String(cuerpo.tnr ?? ""), ronda = Number(cuerpo.ronda) || null, mesa = Number(cuerpo.mesa);
      const clave = String(cuerpo.clave ?? "").slice(0, 200);
      const texto = String(cuerpo.texto ?? "").replace(/\s+/g, " ").trim().slice(0, 480);
      if (!Number.isInteger(mesa) || mesa < 1) return json({ error: "Ese tablero no tiene mesa: asígnale una primero con «Cambiar jugadores»." }, 400);
      if (!texto) return json({ error: "Falta el texto del aviso." }, 400);
      const destino = arbitrosDe(await asignacionesVigentes(servicio, [tnr]), tnr, mesa);
      if (!destino.length) return json({ error: "La mesa " + mesa + " no tiene un árbitro con su enlace encendido: avísale en persona." }, 404);
      const { data: creados, error } = await servicio.from("centroamericano_avisos")
        .insert(destino.map((a) => ({ de: "organizacion", asignacion_id: a.id, mesa, ronda, texto: "📡 Transmisión, mesa " + mesa + ": " + texto }))).select("id");
      if (error) return json({ error: error.message }, 400);
      const a = destino.map((x) => x.arbitro).join(", ").slice(0, 300);
      if (clave.length >= 3) {
        const { data: h } = await servicio.from("centroamericano_tx_historial").select("avisos").eq("clave", clave).maybeSingle();
        const ids = [...((h?.avisos as string[] | undefined) ?? []), ...(creados ?? []).map((c: { id: string }) => c.id)];
        await servicio.from("centroamericano_tx_historial").update({ avisado_en: new Date().toISOString(), avisado_por: quien.slice(0, 120), avisado_a: a, avisos: ids }).eq("clave", clave);
      }
      return json({ ok: true, a, texto: "Listo: el aviso le llegó a " + a + " (lo ve en su tablet, con «Entendido»)." });
    }

    if (accion === "historial") {
      const [{ data: filas }, { data: atendidas }, { data: torneos }] = await Promise.all([
        servicio.from("centroamericano_tx_historial").select("*").order("visto", { ascending: true }).range(0, 4999),
        servicio.from("centroamericano_tx_atendidas").select("clave, quien, en, nota").range(0, 4999),
        servicio.from("centroamericano_torneos").select("tnr, nombre, orden").order("orden"),
      ]);
      const ids = (filas ?? []).flatMap((h: { avisos: string[] }) => h.avisos || []);
      const { data: leidos } = ids.length ? await servicio.from("centroamericano_avisos").select("id, leido_en").in("id", ids) : { data: [] };
      const leidoDe = new Map((leidos ?? []).map((x: { id: string; leido_en: string | null }) => [x.id, x.leido_en]));
      const at = new Map((atendidas ?? []).map((x: { clave: string }) => [x.clave, x]));
      return json({ ok: true, torneos: torneos ?? [], avisos: (filas ?? []).map((h: Record<string, unknown>) => ({ ...h, atendida: at.get(String(h.clave)) ?? null,
        leido: ((h.avisos as string[]) || []).map((id) => leidoDe.get(id)).filter(Boolean).sort()[0] ?? null, avisos: undefined })) });
    }

    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 400);
  }
});
