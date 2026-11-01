// Edge Function: centroamericano-mesa
//
// La parte del ÁRBITRO del Centroamericano 2026 (centroamericano-arbitro.html):
// entra con el enlace (QR) que le dio la organización, sin cuenta, y desde ahí lee
// SUS mesas de la ronda abierta, manda resultados a chess-results y anota jugadas
// ilegales e irregularidades. Ver «Mesas de los árbitros del Centroamericano» en
// docs/decisiones/juegos-y-torneos.md.
//
// SIN CUENTA, ASÍ QUE LA FUNCIÓN DECIDE SOLA (verify_jwt en false): el árbitro no
// trae un JWT de persona. A cambio, TODO se valida acá y nada de lo que diga la
// pantalla se toma por cierto:
//   - el token (64 caracteres al azar) tiene que ser de una asignación que no se
//     apagó y no venció; si no, no se hace nada;
//   - el RANGO DE MESAS lo hace cumplir esta función: pedir o guardar una mesa que
//     no es del árbitro se rechaza con 403, aunque la pantalla se haya manipulado;
//   - la clave (SID) del torneo sale de la bóveda con `centroamericano_acceso()` (solo
//     service_role) y nunca viaja al navegador ni se escribe en el registro; si los
//     torneos están ligados en un grupo de chess-results, se entra con el código del
//     grupo y se elige el torneo (ver `entrar()` en chess-results-ingreso.ts);
//   - el REGISTRO lo escribe esta función con lo que comprobó: un resultado solo
//     queda «enviado» si volvió a LEER chess-results y estaba ahí; el jugador de una
//     ilegal sale de la pantalla de chess-results y no de lo que mande el navegador.
//
// LAS ILEGALES SE CUENTAN POR PARTIDA (ronda + mesa + color), como las marcas de
// Pareo Integral: la primera ilegal le da 2 minutos más al rival y la segunda hace
// perder la partida (art. 7.5.5), salvo que el rival no pueda dar mate con ninguna
// serie de jugadas legales (tablas). Esta función solo cuenta y avisa: el resultado
// lo decide y lo guarda el árbitro. Un toque por error se deshace con «anular»
// (otra línea que apunta a la anulada: el registro no se edita ni se borra).
//
// NO ES UN PROXY ABIERTO: solo habla con chess-results.com (Results.aspx), solo de
// los torneos de la tabla centroamericano_torneos y solo con un token válido.
//
// Las acciones (body.action), todas con { token }:
//   "leer"    {}                          -> las mesas de su rango, sus marcas, su registro y sus avisos
//   "guardar" { ronda, cambios[] }        -> manda resultados y los anota si quedaron
//   "anotar"  { ronda, mesa, color, tipo, texto?, articulo? } -> una línea del registro
//   "anular"  { id }                      -> deshace una ilegal o irregularidad
// y las que NO hablan con chess-results (ni necesitan la clave), para que el árbitro
// reciba lo que le manda la organización aunque chess-results esté caído:
//   "avisos"  {}                          -> mensajes sin leer de la organización y el estado de su pedido de ayuda
//   "ayuda"   { mesa?, texto? }           -> pide al árbitro principal (le llega un aviso a la cuenta principal)
//   "leido"   { id }                      -> marca un mensaje de la organización como leído («Entendido»)
//   "nombre"  { nombre }                  -> el árbitro «por definir» pone su nombre (una sola vez)
//
// verify_jwt en false.

import { createClient } from "npm:@supabase/supabase-js@2";
import { guardarYComprobar, leerRonda, MAX_CAMBIOS } from "./chess-results-ingreso.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// El valor del desplegable de chess-results → cómo se llama en el registro.
const NOMBRE_RESULTADO: Record<string, string> = { "0": "sin resultado", "1": "1-0", "2": "1/2", "3": "0-1", "4": "1f-0f", "5": "0f-1f", "6": "0f-0f", D: "borrado" };
const TIPOS_ANOTABLES = ["ilegal", "irregularidad", "incidencia", "nota"];

type Fila = {
  id: string; ocurrio: string; arbitro: string; mesa: number; color: string | null; jugador: string; tipo: string;
  resultado: string | null; anterior: string | null; articulo: string; texto: string; enviado: boolean; anula: string | null;
};
type Marca = { ilegales: number; irregularidades: number; ultima_ilegal: string | null; ultima_irregularidad: string | null };

// Las marcas de cada jugador en una partida, sin lo que se anuló. Una anulación
// solo deshace la línea a la que apunta.
function marcasDe(filas: Fila[]): Record<string, Marca> {
  const anuladas = new Set(filas.filter((f) => f.tipo === "anulacion" && f.anula).map((f) => f.anula as string));
  const out: Record<string, Marca> = {};
  for (const f of filas) {
    if ((f.tipo !== "ilegal" && f.tipo !== "irregularidad") || !f.color || anuladas.has(f.id)) continue;
    const k = f.mesa + "|" + f.color;
    const m = out[k] ?? (out[k] = { ilegales: 0, irregularidades: 0, ultima_ilegal: null, ultima_irregularidad: null });
    if (f.tipo === "ilegal") { m.ilegales++; m.ultima_ilegal = f.id; } else { m.irregularidades++; m.ultima_irregularidad = f.id; }
  }
  return out;
}

const COLUMNAS = "id, ocurrio, arbitro, mesa, color, jugador, tipo, resultado, anterior, articulo, texto, enviado, anula";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);

  let cuerpo: Record<string, unknown> = {};
  try { cuerpo = await req.json(); } catch { cuerpo = {}; }
  const token = String(cuerpo.token ?? "").trim();
  if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: "Este enlace no es válido. Pídele a la organización que te mande el QR de nuevo." }, 404);

  const servicio = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // La asignación: de quién es el token, qué torneo y qué mesas.
  const { data: a } = await servicio
    .from("centroamericano_asignaciones")
    .select("id, tnr, arbitro, nombrado, mesa_desde, mesa_hasta, vence, revocada, ultimo_uso, centroamericano_torneos(nombre, categoria, rama)")
    .eq("token", token)
    .maybeSingle();
  if (!a) return json({ error: "Este enlace no es válido. Pídele a la organización que te mande el QR de nuevo." }, 404);
  if (a.revocada) return json({ error: "La organización apagó este enlace. Pídele uno nuevo." }, 410);
  if (new Date(a.vence).getTime() <= Date.now()) return json({ error: "Este enlace venció. Pídele uno nuevo a la organización." }, 410);

  const enRango = (mesa: number) => Number.isInteger(mesa) && mesa >= a.mesa_desde && mesa <= a.mesa_hasta;
  const torneoInfo = (Array.isArray(a.centroamericano_torneos) ? a.centroamericano_torneos[0] : a.centroamericano_torneos) as { nombre: string; categoria: string; rama: string } | null;

  // Los avisos van por la base, sin chess-results: no necesitan la clave ni se caen con ella.
  const DE_AVISOS = ["avisos", "ayuda", "leido", "nombre"];
  const { data: acc } = DE_AVISOS.includes(String(cuerpo.action)) ? { data: null } : await servicio.rpc("centroamericano_acceso", { p_tnr: a.tnr });
  const acceso = (Array.isArray(acc) ? acc[0] : acc) as { acceso: string; sid: string } | null;
  if (!acceso && !DE_AVISOS.includes(String(cuerpo.action))) return json({ error: "La organización todavía no cargó la clave de este torneo. Avísale." }, 409);

  // Lo que la organización le mandó (sin leer) y cómo va su último pedido de ayuda.
  const avisosDe = async () => {
    const { data } = await servicio.from("centroamericano_avisos").select("id, creado, de, mesa, texto, estado, atendido_en, leido_en").eq("asignacion_id", a.id).order("creado", { ascending: true }).range(0, 199);
    const filas = (data ?? []) as { id: string; creado: string; de: string; mesa: number | null; texto: string; estado: string; atendido_en: string | null; leido_en: string | null }[];
    const pedidos = filas.filter((f) => f.de === "arbitro");
    const reciente = [...pedidos].reverse().find((f) => f.estado === "abierto" || (f.atendido_en && Date.now() - new Date(f.atendido_en).getTime() < 15 * 60_000)) ?? null;
    return {
      nombrado: a.nombrado, arbitro: a.arbitro,
      mensajes: filas.filter((f) => f.de === "organizacion" && !f.leido_en).map((f) => ({ id: f.id, creado: f.creado, texto: f.texto })),
      ayuda: reciente ? { id: reciente.id, creado: reciente.creado, mesa: reciente.mesa, texto: reciente.texto, estado: reciente.estado, atendido_en: reciente.atendido_en } : null,
      abiertas: pedidos.filter((f) => f.estado === "abierto").map((f) => f.mesa),
    };
  };
  // Cuándo se usó por última vez (para que la organización vea quién está conectado).
  const visto = () => {
    if (!a.ultimo_uso || Date.now() - new Date(a.ultimo_uso).getTime() > 20_000) {
      servicio.from("centroamericano_asignaciones").update({ ultimo_uso: new Date().toISOString() }).eq("id", a.id).then(() => {});
    }
  };

  // Las líneas del registro de una partida o de toda la ronda dentro del rango.
  const registroDe = async (ronda: number, mesa?: number): Promise<Fila[]> => {
    let q = servicio.from("centroamericano_registro").select(COLUMNAS).eq("tnr", a.tnr).eq("ronda", ronda).gte("mesa", a.mesa_desde).lte("mesa", a.mesa_hasta);
    if (mesa != null) q = q.eq("mesa", mesa);
    const { data } = await q.order("ocurrio", { ascending: true }).range(0, 999);
    return (data ?? []) as Fila[];
  };

  try {
    if (cuerpo.action === "leer") {
      const leida = await leerRonda(acceso!.acceso, acceso!.sid, a.tnr);
      if ("error" in leida) return json({ error: leida.error }, leida.estado);
      const p = leida.pantalla;
      const filas = await registroDe(p.ronda);
      visto();
      return json({
        ...(await avisosDe()),
        arbitro: a.arbitro, tnr: a.tnr, torneo: torneoInfo?.nombre ?? p.torneo, categoria: torneoInfo?.categoria ?? "", rama: torneoInfo?.rama ?? "",
        ronda: p.ronda, desde: a.mesa_desde, hasta: a.mesa_hasta, vence: a.vence,
        mesas: p.mesas.filter((m) => enRango(m.mesa)).map(({ mesa, blancas, negras, valor }) => ({ mesa, blancas, negras, valor })),
        marcas: marcasDe(filas),
        anotaciones: filas.filter((f) => f.tipo !== "anulacion").slice(-60),
        anuladas: filas.filter((f) => f.tipo === "anulacion" && f.anula).map((f) => f.anula),
        leido_en: new Date().toISOString(),
      });
    }

    if (cuerpo.action === "guardar") {
      const ronda = Number(cuerpo.ronda);
      const lista = Array.isArray(cuerpo.cambios) ? cuerpo.cambios : [];
      if (!Number.isInteger(ronda) || ronda < 1) return json({ error: "Falta la ronda." }, 400);
      if (lista.length === 0 || lista.length > MAX_CAMBIOS) return json({ error: "Los cambios son de 1 a " + MAX_CAMBIOS + " mesas." }, 400);
      const cambios = lista.map((c: Record<string, unknown>) => ({
        mesa: Number(c?.mesa), blancas: String(c?.blancas ?? ""), negras: String(c?.negras ?? ""), valor: String(c?.valor ?? ""),
      }));
      const fuera = cambios.find((c) => !enRango(c.mesa));
      if (fuera) return json({ error: "La mesa " + fuera.mesa + " no es de tu rango (" + a.mesa_desde + " a " + a.mesa_hasta + "). No se guardó nada." }, 403);

      const res = await guardarYComprobar(acceso!.acceso, acceso!.sid, a.tnr, ronda, cambios);
      if (res.estado !== 200 || !("cuerpo" in res)) return json({ error: (res as { error: string }).error }, res.estado);

      // Al registro entra solo lo que chess-results confirmó al volver a leerlo.
      const filas = res.cuerpo.resultados.filter((r) => r.ok).map((r) => {
        const c = cambios.find((x) => x.mesa === r.mesa)!;
        const antes = res.antes.mesas.find((m) => m.mesa === r.mesa)?.valor ?? "0";
        return {
          asignacion_id: a.id, arbitro: a.arbitro, tnr: a.tnr, ronda: res.cuerpo.ronda, mesa: r.mesa,
          jugador: (c.blancas + " – " + c.negras).slice(0, 120),
          tipo: antes !== "0" ? "correccion" : "resultado",
          resultado: NOMBRE_RESULTADO[c.valor], anterior: antes !== "0" ? NOMBRE_RESULTADO[antes] : null, enviado: true,
        };
      });
      let registroError = false;
      if (filas.length) {
        const { error } = await servicio.from("centroamericano_registro").insert(filas);
        if (error) { registroError = true; console.error("centroamericano-mesa: registro", a.tnr, error.code); }
      }
      return json({ ...res.cuerpo, registro_error: registroError });
    }

    if (cuerpo.action === "anotar") {
      const ronda = Number(cuerpo.ronda);
      const mesa = Number(cuerpo.mesa);
      const tipo = String(cuerpo.tipo ?? "");
      const color = cuerpo.color === "blancas" || cuerpo.color === "negras" ? cuerpo.color : null;
      const texto = String(cuerpo.texto ?? "").trim().slice(0, 2000);
      const articulo = String(cuerpo.articulo ?? "").trim().slice(0, 60);
      if (!TIPOS_ANOTABLES.includes(tipo)) return json({ error: "Tipo de anotación no válido." }, 400);
      if (!enRango(mesa)) return json({ error: "La mesa " + mesa + " no es de tu rango (" + a.mesa_desde + " a " + a.mesa_hasta + ")." }, 403);
      if ((tipo === "ilegal" || tipo === "irregularidad") && !color) return json({ error: "Falta el jugador (blancas o negras)." }, 400);
      if ((tipo === "incidencia" || tipo === "nota") && !texto) return json({ error: "Cuenta qué pasó." }, 400);

      // La ronda y el jugador salen de chess-results, no de lo que mande la pantalla.
      const leida = await leerRonda(acceso!.acceso, acceso!.sid, a.tnr);
      if ("error" in leida) return json({ error: leida.error }, leida.estado);
      const p = leida.pantalla;
      if (!Number.isInteger(ronda) || p.ronda !== ronda) return json({ error: "La ronda abierta en chess-results es la " + p.ronda + ", no la " + cuerpo.ronda + ". Actualiza la página." }, 409);
      const m = p.mesas.find((x) => x.mesa === mesa);
      if (!m) return json({ error: "La mesa " + mesa + " no está en la ronda " + p.ronda + "." }, 404);
      const jugador = color === "blancas" ? m.blancas : color === "negras" ? m.negras : "";

      const { data: nueva, error } = await servicio.from("centroamericano_registro").insert({
        asignacion_id: a.id, arbitro: a.arbitro, tnr: a.tnr, ronda: p.ronda, mesa, color, jugador: jugador.slice(0, 120), tipo,
        articulo: articulo || (tipo === "ilegal" ? "7.5.5" : ""), texto,
      }).select("id").single();
      if (error || !nueva) { console.error("centroamericano-mesa: anotar", a.tnr, error?.code); return json({ error: "No se pudo anotar. Intenta de nuevo." }, 500); }

      const marca = marcasDe(await registroDe(p.ronda, mesa))[mesa + "|" + color] ?? { ilegales: 0, irregularidades: 0, ultima_ilegal: null, ultima_irregularidad: null };
      const aviso = tipo === "ilegal" ? (marca.ilegales >= 2 ? "segunda" : "primera") : null;
      return json({ ok: true, id: nueva.id, jugador, color, marca, aviso });
    }

    if (cuerpo.action === "anular") {
      const id = String(cuerpo.id ?? "");
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "Anotación no válida." }, 400);
      const { data: f } = await servicio.from("centroamericano_registro").select("id, tnr, ronda, mesa, color, jugador, tipo").eq("id", id).maybeSingle();
      if (!f || f.tnr !== a.tnr || !enRango(f.mesa)) return json({ error: "Esa anotación no es de tus mesas." }, 403);
      if (f.tipo !== "ilegal" && f.tipo !== "irregularidad") return json({ error: "Solo se anulan jugadas ilegales e irregularidades." }, 400);
      const { data: ya } = await servicio.from("centroamericano_registro").select("id").eq("anula", id).limit(1);
      if (ya && ya.length) return json({ error: "Esa anotación ya estaba anulada." }, 409);
      const { error } = await servicio.from("centroamericano_registro").insert({
        asignacion_id: a.id, arbitro: a.arbitro, tnr: a.tnr, ronda: f.ronda, mesa: f.mesa, color: f.color, jugador: f.jugador, tipo: "anulacion", anula: id,
      });
      if (error) { console.error("centroamericano-mesa: anular", a.tnr, error.code); return json({ error: "No se pudo anular. Intenta de nuevo." }, 500); }
      const marca = marcasDe(await registroDe(f.ronda, f.mesa))[f.mesa + "|" + f.color] ?? { ilegales: 0, irregularidades: 0, ultima_ilegal: null, ultima_irregularidad: null };
      return json({ ok: true, color: f.color, mesa: f.mesa, marca });
    }

    if (cuerpo.action === "avisos") {
      visto();
      return json({ ok: true, ...(await avisosDe()) });
    }

    if (cuerpo.action === "ayuda") {
      const mesa = cuerpo.mesa == null || cuerpo.mesa === "" ? null : Number(cuerpo.mesa);
      const texto = String(cuerpo.texto ?? "").trim().slice(0, 500);
      if (mesa != null && !enRango(mesa)) return json({ error: "La mesa " + mesa + " no es de tu rango (" + a.mesa_desde + " a " + a.mesa_hasta + ")." }, 403);
      // Un pedido por mesa a la vez: si ya hay uno abierto para esa mesa, no se repite (ni se llena de avisos la cuenta principal).
      const { data: abiertos } = await servicio.from("centroamericano_avisos").select("id, mesa, creado").eq("asignacion_id", a.id).eq("de", "arbitro").eq("estado", "abierto");
      const igual = (abiertos ?? []).find((f) => (f.mesa ?? null) === mesa);
      if (igual) return json({ ok: true, ya: true, id: igual.id, creado: igual.creado });
      if ((abiertos ?? []).length >= 5) return json({ error: "Ya tienes 5 pedidos abiertos: la organización los está atendiendo." }, 429);
      const { data: nuevo, error } = await servicio.from("centroamericano_avisos").insert({ de: "arbitro", asignacion_id: a.id, mesa, texto }).select("id, creado").single();
      if (error || !nuevo) { console.error("centroamericano-mesa: ayuda", a.tnr, error?.code); return json({ error: "No se pudo avisar. Intenta de nuevo." }, 500); }
      return json({ ok: true, id: nuevo.id, creado: nuevo.creado });
    }

    if (cuerpo.action === "leido") {
      const id = String(cuerpo.id ?? "");
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "Aviso no válido." }, 400);
      const { data, error } = await servicio.from("centroamericano_avisos").update({ leido_en: new Date().toISOString() }).eq("id", id).eq("asignacion_id", a.id).eq("de", "organizacion").is("leido_en", null).select("id");
      if (error) { console.error("centroamericano-mesa: leido", a.tnr, error.code); return json({ error: "No se pudo marcar. Intenta de nuevo." }, 500); }
      return json({ ok: true, marcados: (data ?? []).length });
    }

    if (cuerpo.action === "nombre") {
      const nombre = String(cuerpo.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (!nombre) return json({ error: "Escribe tu nombre." }, 400);
      // Solo se pone una vez: después, cambiarlo es cosa de la organización (el nombre sale en el registro).
      if (a.nombrado) return json({ error: "Este enlace ya tiene nombre. Si hay que cambiarlo, díselo a la organización." }, 409);
      const { error } = await servicio.from("centroamericano_asignaciones").update({ arbitro: nombre, nombrado: true }).eq("id", a.id).eq("nombrado", false);
      if (error) { console.error("centroamericano-mesa: nombre", a.tnr, error.code); return json({ error: "No se pudo guardar tu nombre. Intenta de nuevo." }, 500); }
      return json({ ok: true, arbitro: nombre });
    }

    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    // Nunca se imprime el pedido: lleva el token.
    console.error("centroamericano-mesa:", a.tnr, e instanceof Error ? e.message : String(e));
    return json({ error: "No se pudo hablar con chess-results: " + (e instanceof Error ? e.message : String(e)) }, 502);
  }
});
