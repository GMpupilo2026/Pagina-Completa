// Edge Function: centroamericano-clave
//
// La parte de QUIEN ORGANIZA del Centroamericano 2026 (centroamericano-mesas.html):
// cargar la clave (SID) de chess-results de cada uno de los 12 torneos y probar
// que sigue sirviendo. Ver «Mesas de los árbitros del Centroamericano» en
// docs/decisiones/juegos-y-torneos.md.
//
// TORNEOS LIGADOS: cuando los torneos están ligados en un grupo de chess-results, se
// entra con el código del GRUPO y una sola clave abre todos (un desplegable cambia de
// torneo). Por eso "poner" no asume un torneo por clave: entra con el código que le
// den, lee qué torneos abre esa clave y la deja anotada para TODOS los que son del
// Centroamericano. Un torneo suelto es el caso de un grupo de uno.
//
// LA CLAVE SE VALIDA ANTES DE GUARDARSE: se entra a chess-results con el código y esa
// clave; si no abre nada del Centroamericano, no se guarda nada. Una clave mal
// copiada se descubre acá, no el lunes con el árbitro delante. Ya validada, va a la
// BÓVEDA (Vault) con `centroamericano_guardar_acceso()`: cifrada, y la única que puede
// leerla es el servicio (centroamericano_acceso(), solo service_role). Ni esta función
// devuelve nunca la clave, ni la imprime, ni la deja en una tabla común.
//
// SOLO CON LICENCIA: se pregunta a la base `tengo_herramienta('mesa-arbitro')` CON
// EL TOKEN DE QUIEN LLAMA (clave anónima + su Authorization), no con la de
// servicio, así que pasa por antes_de_cada_pedido() y la verificación en dos
// pasos la exige la base. Quien administra tiene todas las herramientas.
//
// Las acciones (body.action):
//   "poner"  { tnr, sid }  -> { ok, acceso, torneos[], ronda, mesas }   valida y guarda la clave
//                             (tnr es el código con el que se entra: el del torneo o el del grupo)
//   "probar" { tnr }       -> { ok, torneo, ronda, mesas }   prueba la clave guardada de ESE torneo
//   "resumen" {}           -> { ok, torneos, errores[] }   lee de chess-results la ronda abierta de cada torneo con
//                             enlaces activos y pone al día el avance de cada árbitro (centroamericano_progreso)
//   "drive_estado" {}      -> { ok, conectado, pendientes, ultima_copia }   sin devolver nunca la dirección ni el secreto
//   "drive_conectar" { url, secreto } -> { ok, carpeta }   prueba el Apps Script antes de guardarlo en la bóveda
//   "drive_reintentar" {}  -> { ok, enviadas, fallaron, quedan }   manda al Drive las planillas que no llegaron
//
// verify_jwt en true.

import { createClient } from "npm:@supabase/supabase-js@2";
import { entrar, leerRonda } from "./chess-results-ingreso.ts";
import { avance, guardarAvance } from "./avance-ronda.ts";
import { aBase64, llamarPuente } from "./drive-puente.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HERRAMIENTA = "mesa-arbitro";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);

  const autorizacion = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(autorizacion)) return json({ error: "Inicia sesión para usar la herramienta." }, 401);

  const comoQuienLlama = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: autorizacion } },
  });
  const { data: puede, error: errPermiso } = await comoQuienLlama.rpc("tengo_herramienta", { p_herramienta: HERRAMIENTA });
  if (errPermiso) return json({ error: "No se pudo comprobar tu licencia: " + errPermiso.message }, 403);
  if (puede !== true) return json({ error: "Tu cuenta no tiene una licencia vigente de esta herramienta." }, 403);
  // Con el cliente armado solo con la cabecera no hay sesión guardada: el token se pasa a mano.
  const { data: quien } = await comoQuienLlama.auth.getUser(autorizacion.replace(/^Bearer\s+/i, "").trim());
  const persona = quien?.user?.id ?? null;

  let cuerpo: { action?: unknown; tnr?: unknown; sid?: unknown; url?: unknown; secreto?: unknown } = {};
  try { cuerpo = await req.json(); } catch { cuerpo = {}; }

  const servicio = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Lo que no es de un solo torneo.
  const accion = String(cuerpo.action ?? "");
  if (accion === "resumen" || accion.startsWith("drive_")) {
    try {
      return await accionesGenerales(accion, cuerpo, servicio);
    } catch (e) {
      console.error("centroamericano-clave:", accion, e instanceof Error ? e.message : String(e));
      return json({ error: "No se pudo completar: " + (e instanceof Error ? e.message : String(e)) }, 502);
    }
  }

  const tnr = String(cuerpo.tnr ?? "").trim();
  if (!/^\d{1,7}$/.test(tnr)) return json({ error: "El código del torneo no es válido." }, 400);

  try {
    if (cuerpo.action === "poner") {
      const sid = String(cuerpo.sid ?? "").trim();
      if (!/^[A-Za-z0-9]{8,32}$/.test(sid)) return json({ error: "La clave (SID) son hasta 32 letras y números." }, 400);
      // Se entra con el código que dieron y se mira qué torneos abre esa clave.
      const { pantalla } = await entrar(tnr, sid);
      if (!pantalla.entro) return json({ error: "chess-results no aceptó el código o la clave. Revísalos en Swiss-Manager. No se guardó la clave." }, 401);
      const abre = pantalla.torneos.length ? pantalla.torneos : [{ tnr: pantalla.tnr, nombre: pantalla.torneo, elegido: true }];
      const { data: nuestros } = await servicio.from("centroamericano_torneos").select("tnr, nombre").in("tnr", abre.map((t) => t.tnr));
      if (!nuestros || !nuestros.length) {
        return json({ error: "Esa clave abre " + abre.map((t) => t.tnr + " (" + t.nombre + ")").join(", ") + ", y ninguno es del Centroamericano. No se guardó la clave." }, 404);
      }
      const { error } = await servicio.rpc("centroamericano_guardar_acceso", { p_acceso: tnr, p_sid: sid, p_tnrs: nuestros.map((t) => t.tnr), p_persona: persona });
      if (error) {
        console.error("centroamericano-clave: no se pudo guardar", tnr, error.code);
        return json({ error: "La clave abrió los torneos, pero no se pudo guardar en la bóveda." }, 500);
      }
      return json({
        ok: true, acceso: tnr, torneos: nuestros, ronda: pantalla.ronda, mesas: pantalla.mesas.length,
        otros: abre.filter((t) => !nuestros.some((n) => n.tnr === t.tnr)).map((t) => t.tnr + " (" + t.nombre + ")"),
      });
    }

    if (cuerpo.action === "probar") {
      // Solo los 12 torneos del Centroamericano.
      const { data: torneo } = await servicio.from("centroamericano_torneos").select("tnr, nombre").eq("tnr", tnr).maybeSingle();
      if (!torneo) return json({ error: "Ese torneo no es del Centroamericano." }, 404);
      const { data: acc, error } = await servicio.rpc("centroamericano_acceso", { p_tnr: tnr });
      if (error) return json({ error: "No se pudo leer la bóveda." }, 500);
      const a = Array.isArray(acc) ? acc[0] : acc;
      if (!a) return json({ error: "Este torneo todavía no tiene clave cargada." }, 409);
      const leida = await leerRonda(a.acceso as string, a.sid as string, tnr);
      if ("error" in leida) return json({ error: "La clave guardada ya no sirve: " + leida.error }, leida.estado);
      return json({ ok: true, torneo: leida.pantalla.torneo || torneo.nombre, ronda: leida.pantalla.ronda, mesas: leida.pantalla.mesas.length });
    }

    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    // Nunca se imprime el pedido: lleva la clave.
    console.error("centroamericano-clave:", tnr, e instanceof Error ? e.message : String(e));
    return json({ error: "No se pudo hablar con chess-results: " + (e instanceof Error ? e.message : String(e)) }, 502);
  }
});

const BUCKET = "centroamericano-planillas";

// deno-lint-ignore no-explicit-any
async function accionesGenerales(accion: string, cuerpo: Record<string, unknown>, servicio: any): Promise<Response> {
  if (accion === "resumen") {
    // Los torneos que tienen enlaces activos: cada uno se lee una vez, en paralelo (de a 4).
    const { data: asig } = await servicio.from("centroamericano_asignaciones").select("id, tnr, mesa_desde, mesa_hasta, vence, revocada").eq("revocada", false).gt("vence", new Date().toISOString());
    const porTorneo = new Map<string, { id: string; mesa_desde: number; mesa_hasta: number }[]>();
    for (const a of asig ?? []) porTorneo.set(a.tnr, [...(porTorneo.get(a.tnr) ?? []), a]);
    const errores: { tnr: string; error: string }[] = [];
    let leidos = 0;
    const cola = [...porTorneo.entries()];
    const trabajar = async () => {
      for (let par = cola.shift(); par; par = cola.shift()) {
        const [t, lista] = par;
        const { data: acc } = await servicio.rpc("centroamericano_acceso", { p_tnr: t });
        const a = Array.isArray(acc) ? acc[0] : acc;
        if (!a) { errores.push({ tnr: t, error: "sin clave cargada" }); continue; }
        const leida = await leerRonda(a.acceso as string, a.sid as string, t);
        if ("error" in leida) { errores.push({ tnr: t, error: leida.error }); continue; }
        leidos++;
        for (const x of lista) await guardarAvance(servicio, x.id, leida.pantalla.ronda, avance(leida.pantalla.mesas, x.mesa_desde, x.mesa_hasta));
      }
    };
    await Promise.all([trabajar(), trabajar(), trabajar(), trabajar()]);
    return json({ ok: true, torneos: leidos, errores });
  }

  const { data: dr } = await servicio.rpc("centroamericano_drive_leer");
  const puente = (Array.isArray(dr) ? dr[0] : dr) as { url: string | null; secreto: string | null } | null;
  const conectado = !!(puente?.url && puente?.secreto);

  if (accion === "drive_estado") {
    const { count } = await servicio.from("centroamericano_planillas").select("id", { count: "exact", head: true }).eq("drive_ok", false);
    const { data: c } = await servicio.from("centroamericano_copias").select("creada").eq("anillo", "d").eq("ranura", 0).maybeSingle();
    return json({ ok: true, conectado, pendientes: count ?? 0, ultima_copia: c?.creada ?? null });
  }

  if (accion === "drive_conectar") {
    const url = String(cuerpo.url ?? "").trim();
    const secreto = String(cuerpo.secreto ?? "").trim();
    // Se prueba ANTES de guardar: una dirección o un secreto mal copiados se descubren acá.
    const r = await llamarPuente(url, secreto, { accion: "probar" }, 30000);
    if (!r.ok) return json({ error: "No se pudo conectar: " + (r.error ?? "el Drive no aceptó el secreto.") + " No se guardó nada." }, 400);
    const { error } = await servicio.rpc("centroamericano_drive_guardar", { p_url: url, p_secreto: secreto });
    if (error) return json({ error: "El Drive contestó bien, pero no se pudo guardar la conexión." }, 500);
    return json({ ok: true, carpeta: String(r.carpeta ?? "Planillas Centroamericano") });
  }

  if (accion === "drive_reintentar") {
    if (!conectado) return json({ error: "El Drive todavía no está conectado." }, 409);
    const { data: lista } = await servicio.from("centroamericano_planillas").select("id, tnr, ronda, mesa, lado, jugador, rival, ruta").eq("drive_ok", false).order("subida", { ascending: true }).limit(12);
    let enviadas = 0, fallaron = 0;
    for (const f of lista ?? []) {
      const { data: blob } = await servicio.storage.from(BUCKET).download(f.ruta);
      if (!blob) { fallaron++; continue; }
      const { data: t } = await servicio.from("centroamericano_torneos").select("nombre").eq("tnr", f.tnr).maybeSingle();
      // Desde el 1 de noviembre la foto es una por mesa con las dos planillas (ruta «…-planillas.jpg», lado «blancas»);
      // las fotos viejas por lado se siguen mandando como eran.
      const ambas = /-planillas\.jpg$/.test(f.ruta);
      const blancas = f.lado === "blancas" ? f.jugador : f.rival, negras = f.lado === "blancas" ? f.rival : f.jugador;
      const r = await llamarPuente(puente!.url!, puente!.secreto!, {
        accion: "planilla", torneo: t?.nombre ?? f.tnr, ronda: f.ronda, mesa: f.mesa, lado: ambas ? "ambas" : f.lado, blancas, negras, jugador: f.jugador, imagen: aBase64(new Uint8Array(await blob.arrayBuffer())),
      });
      await servicio.from("centroamericano_planillas").update(r.ok ? { drive_ok: true, drive_en: new Date().toISOString(), drive_error: "" } : { drive_error: String(r.error ?? "").slice(0, 300) }).eq("id", f.id);
      if (r.ok) enviadas++; else fallaron++;
    }
    const { count } = await servicio.from("centroamericano_planillas").select("id", { count: "exact", head: true }).eq("drive_ok", false);
    return json({ ok: true, enviadas, fallaron, quedan: count ?? 0 });
  }

  return json({ error: "Acción desconocida." }, 400);
}
