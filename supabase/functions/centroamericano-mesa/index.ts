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
//   "lista"   { ronda, paso }             -> aprueba un paso de la lista previa de la ronda (relojes, tableros; en ese orden).
//                                             Sin los dos aprobados, "guardar" responde 409.
//   "planilla" { ronda, mesa, imagen }    -> UNA foto por mesa con las dos planillas juntas (la parte de «lado» ya no se usa):
//                                             se guarda en el bucket privado y pasa al Drive («Planillas Centroamericano»)
//   "finalizar" { ronda, revision }       -> el árbitro finaliza la ronda (todas sus mesas con resultado y
//                                             confirmó que revisó resultados y planillas ordenadas y firmadas)
//   "presencia" { ronda, mesa, color, presente } -> marca si el jugador de esa mesa llegó (la organización ve a los que faltan)
//   "tiempo"  { ronda, mesa, t_blancas, j_blancas, t_negras, j_negras, nota? } -> una lectura del control de tiempos de una partida
//                                             sin terminar: lo que marca el reloj de cada color y las jugadas que lleva. Queda en la
//                                             tabla de tiempos Y como una línea («nota») en la bitácora de la mesa. (Aún acepta la
//                                             forma vieja { jugada, turno?, t_blancas, t_negras } para una página que no se recargó.)
// y las que NO hablan con chess-results (ni necesitan la clave), para que el árbitro
// reciba lo que le manda la organización aunque chess-results esté caído:
//   "avisos"  {}                          -> mensajes sin leer de la organización y el estado de su pedido de ayuda
//   "ayuda"   { mesa?, texto? }           -> pide al árbitro principal (le llega un aviso a la cuenta principal)
//   "leido"   { id }                      -> marca un mensaje de la organización como leído («Entendido»)
//   "nombre"  { nombre }                  -> el árbitro «por definir» pone su nombre (una sola vez)
//
// EL MISMO ÁRBITRO EN VARIOS TORNEOS: la organización junta sus enlaces con `persona`. El árbitro
// abre uno y `leer` le devuelve los otros (`hermanas`, con su token) para pasar de uno a otro;
// los avisos de la organización de cualquiera de ellos le llegan estando en cualquiera. Cada enlace
// sigue con su torneo, su rango, su avance, su lista previa y su «finalizar».
//
// verify_jwt en false.

import { createClient } from "npm:@supabase/supabase-js@2";
import { guardarYComprobar, leerRonda, MAX_CAMBIOS } from "./chess-results-ingreso.ts";
import { avance, guardarAvance } from "./avance-ronda.ts";
import { aBase64, deBase64, llamarPuente } from "./drive-puente.ts";

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
const BUCKET = "centroamericano-planillas";
// La lista previa de cada ronda, en este orden (paso a paso): ver la migración centroamericano_lista_previa.
const PASOS = ["relojes", "tableros"];
const MAX_IMAGEN = 6 * 1024 * 1024; // lo mismo que el bucket

// segundos -> «1:23:45» o «45:10» (igual que formatoTiempo de js/centroamericano-mesas.js)
function formatoTiempo(seg: number): string {
  seg = Math.max(0, Math.round(Number(seg) || 0));
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  const dos = (n: number) => (n < 10 ? "0" : "") + n;
  return h ? h + ":" + dos(m) + ":" + dos(s) : m + ":" + dos(s);
}

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
    .select("id, tnr, arbitro, nombrado, persona, mesa_desde, mesa_hasta, vence, revocada, ultimo_uso, centroamericano_torneos(nombre, categoria, rama)")
    .eq("token", token)
    .maybeSingle();
  if (!a) return json({ error: "Este enlace no es válido. Pídele a la organización que te mande el QR de nuevo." }, 404);
  if (a.revocada) return json({ error: "La organización apagó este enlace. Pídele uno nuevo." }, 410);
  if (new Date(a.vence).getTime() <= Date.now()) return json({ error: "Este enlace venció. Pídele uno nuevo a la organización." }, 410);

  const enRango = (mesa: number) => Number.isInteger(mesa) && mesa >= a.mesa_desde && mesa <= a.mesa_hasta;
  const torneoInfo = (Array.isArray(a.centroamericano_torneos) ? a.centroamericano_torneos[0] : a.centroamericano_torneos) as { nombre: string; categoria: string; rama: string } | null;

  // Los avisos van por la base, sin chess-results: no necesitan la clave ni se caen con ella.
  const DE_AVISOS = ["avisos", "ayuda", "leido", "nombre", "lista"];
  const { data: acc } = DE_AVISOS.includes(String(cuerpo.action)) ? { data: null } : await servicio.rpc("centroamericano_acceso", { p_tnr: a.tnr });
  const acceso = (Array.isArray(acc) ? acc[0] : acc) as { acceso: string; sid: string } | null;
  if (!acceso && !DE_AVISOS.includes(String(cuerpo.action))) return json({ error: "La organización todavía no cargó la clave de este torneo. Avísale." }, 409);

  // Los otros enlaces del MISMO árbitro (otros torneos u otros tramos), si la organización los juntó.
  type Hermana = { id: string; token: string; tnr: string; arbitro: string; mesa_desde: number; mesa_hasta: number };
  let hermanasFilas: Hermana[] = [];
  if (a.persona) {
    const { data: h } = await servicio.from("centroamericano_asignaciones").select("id, token, tnr, arbitro, mesa_desde, mesa_hasta")
      .eq("persona", a.persona).neq("id", a.id).eq("revocada", false).gt("vence", new Date().toISOString());
    hermanasFilas = (h ?? []) as Hermana[];
  }
  const idsDe = [a.id, ...hermanasFilas.map((x) => x.id)];

  // Lo que la organización le mandó (sin leer, de cualquiera de sus enlaces) y cómo va su último pedido de ayuda.
  const avisosDe = async () => {
    const { data } = await servicio.from("centroamericano_avisos").select("id, creado, de, mesa, texto, estado, atendido_en, leido_en, tipo, control_tiempos, asignacion_id").in("asignacion_id", idsDe).eq("tipo", "ayuda").order("creado", { ascending: true }).range(0, 199);
    const filas = (data ?? []) as { id: string; creado: string; de: string; mesa: number | null; texto: string; estado: string; atendido_en: string | null; leido_en: string | null; control_tiempos: boolean; asignacion_id: string }[];
    const pedidos = filas.filter((f) => f.de === "arbitro" && f.asignacion_id === a.id);
    const reciente = [...pedidos].reverse().find((f) => f.estado === "abierto" || (f.atendido_en && Date.now() - new Date(f.atendido_en).getTime() < 15 * 60_000)) ?? null;
    return {
      nombrado: a.nombrado, arbitro: a.arbitro,
      mensajes: filas.filter((f) => f.de === "organizacion" && !f.leido_en).map((f) => ({ id: f.id, creado: f.creado, texto: f.texto, control_tiempos: f.control_tiempos === true })),
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
      await guardarAvance(servicio, a.id, p.ronda, avance(p.mesas, a.mesa_desde, a.mesa_hasta));
      const { data: fin } = await servicio.from("centroamericano_finales").select("finalizada_en").eq("asignacion_id", a.id).eq("ronda", p.ronda).eq("reabierta", false).maybeSingle();
      const { data: pasosOk } = await servicio.from("centroamericano_listas").select("paso").eq("asignacion_id", a.id).eq("ronda", p.ronda);
      const { data: plan } = await servicio.from("centroamericano_planillas").select("mesa, lado, subida, drive_ok").eq("tnr", a.tnr).eq("ronda", p.ronda).gte("mesa", a.mesa_desde).lte("mesa", a.mesa_hasta);
      const { data: pres } = await servicio.from("centroamericano_presencia").select("mesa, color, presente, marcada").eq("tnr", a.tnr).eq("ronda", p.ronda).gte("mesa", a.mesa_desde).lte("mesa", a.mesa_hasta);
      const { data: tiem } = await servicio.from("centroamericano_tiempos").select("id, ocurrio, mesa, jugada, j_blancas, j_negras, turno, t_blancas, t_negras, nota").eq("tnr", a.tnr).eq("ronda", p.ronda).gte("mesa", a.mesa_desde).lte("mesa", a.mesa_hasta).order("ocurrio", { ascending: false }).limit(150);
      let hermanas: { token: string; tnr: string; torneo: string; arbitro: string; mesa_desde: number; mesa_hasta: number }[] = [];
      if (hermanasFilas.length) {
        const { data: nombres } = await servicio.from("centroamericano_torneos").select("tnr, nombre").in("tnr", hermanasFilas.map((x) => x.tnr));
        hermanas = hermanasFilas.map((x) => ({ token: x.token, tnr: x.tnr, torneo: (nombres ?? []).find((n: { tnr: string }) => n.tnr === x.tnr)?.nombre ?? x.tnr, arbitro: x.arbitro, mesa_desde: x.mesa_desde, mesa_hasta: x.mesa_hasta }));
      }
      return json({
        ...(await avisosDe()),
        hermanas,
        presencia: pres ?? [],
        tiempos: tiem ?? [],
        finalizada: fin ? fin.finalizada_en : null,
        lista: PASOS.filter((x) => (pasosOk ?? []).some((f: { paso: string }) => f.paso === x)),
        planillas: plan ?? [],
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

      // Antes de guardar resultados de la ronda, la lista previa completa (relojes y tableros).
      const { data: aprobados } = await servicio.from("centroamericano_listas").select("paso").eq("asignacion_id", a.id).eq("ronda", ronda);
      const faltan = PASOS.filter((x) => !(aprobados ?? []).some((f: { paso: string }) => f.paso === x));
      if (faltan.length) return json({ error: "Antes de guardar resultados tienes que aprobar la revisión previa de la ronda " + ronda + " (relojes y tableros). No se guardó nada." }, 409);

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
      // El avance con lo que quedó: lo de la pantalla de antes, con lo confirmado encima.
      const quedo = new Map(res.cuerpo.resultados.filter((r) => r.ok).map((r) => [r.mesa, r.pedido === "D" ? "0" : r.pedido]));
      await guardarAvance(servicio, a.id, res.cuerpo.ronda, avance(res.antes.mesas.map((m) => ({ mesa: m.mesa, valor: quedo.get(m.mesa) ?? m.valor })), a.mesa_desde, a.mesa_hasta));
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

    if (cuerpo.action === "presencia") {
      const ronda = Number(cuerpo.ronda);
      const mesa = Number(cuerpo.mesa);
      const color = cuerpo.color === "blancas" || cuerpo.color === "negras" ? cuerpo.color : null;
      if (!color) return json({ error: "Falta el jugador (blancas o negras)." }, 400);
      if (typeof cuerpo.presente !== "boolean") return json({ error: "Falta decir si llegó o no." }, 400);
      if (!enRango(mesa)) return json({ error: "La mesa " + mesa + " no es de tu rango (" + a.mesa_desde + " a " + a.mesa_hasta + ")." }, 403);
      // El jugador sale de chess-results, no de lo que mande la pantalla.
      const leida = await leerRonda(acceso!.acceso, acceso!.sid, a.tnr);
      if ("error" in leida) return json({ error: leida.error }, leida.estado);
      const p = leida.pantalla;
      if (!Number.isInteger(ronda) || p.ronda !== ronda) return json({ error: "La ronda abierta en chess-results es la " + p.ronda + ", no la " + cuerpo.ronda + ". Actualiza la página." }, 409);
      const m = p.mesas.find((x) => x.mesa === mesa);
      if (!m) return json({ error: "La mesa " + mesa + " no está en la ronda " + p.ronda + "." }, 404);
      const jugador = color === "blancas" ? m.blancas : m.negras;
      const { error } = await servicio.from("centroamericano_presencia").upsert({
        asignacion_id: a.id, arbitro: a.arbitro, tnr: a.tnr, ronda: p.ronda, mesa, color, jugador: jugador.slice(0, 120), presente: cuerpo.presente, marcada: new Date().toISOString(),
      }, { onConflict: "tnr,ronda,mesa,color" });
      if (error) { console.error("centroamericano-mesa: presencia", a.tnr, error.code); return json({ error: "No se pudo anotar. Intenta de nuevo." }, 500); }
      return json({ ok: true, mesa, color, presente: cuerpo.presente, jugador });
    }

    if (cuerpo.action === "tiempo") {
      const ronda = Number(cuerpo.ronda);
      const mesa = Number(cuerpo.mesa);
      const tB = Number(cuerpo.t_blancas), tN = Number(cuerpo.t_negras);
      const turno = cuerpo.turno === "blancas" || cuerpo.turno === "negras" ? cuerpo.turno : null;
      const nota = String(cuerpo.nota ?? "").trim().slice(0, 500);
      // La forma nueva trae las jugadas de cada color; la vieja, una sola «jugada en que va».
      const porColor = cuerpo.j_blancas !== undefined || cuerpo.j_negras !== undefined;
      const jB = porColor ? Number(cuerpo.j_blancas) : null, jN = porColor ? Number(cuerpo.j_negras) : null;
      const jugada = porColor ? Math.max(1, jB!, jN!) : Number(cuerpo.jugada);
      if (!enRango(mesa)) return json({ error: "La mesa " + mesa + " no es de tu rango (" + a.mesa_desde + " a " + a.mesa_hasta + ")." }, 403);
      if (porColor && ![jB!, jN!].every((j) => Number.isInteger(j) && j >= 0 && j <= 400)) return json({ error: "Las jugadas de cada color van de 0 a 400." }, 400);
      if (!Number.isInteger(jugada) || jugada < 1 || jugada > 400) return json({ error: "La jugada va de 1 a 400." }, 400);
      if (![tB, tN].every((t) => Number.isInteger(t) && t >= 0 && t <= 36000)) return json({ error: "Los tiempos de los relojes no son válidos." }, 400);
      const leida = await leerRonda(acceso!.acceso, acceso!.sid, a.tnr);
      if ("error" in leida) return json({ error: leida.error }, leida.estado);
      const p = leida.pantalla;
      if (!Number.isInteger(ronda) || p.ronda !== ronda) return json({ error: "La ronda abierta en chess-results es la " + p.ronda + ", no la " + cuerpo.ronda + ". Actualiza la página." }, 409);
      const m = p.mesas.find((x) => x.mesa === mesa);
      if (!m) return json({ error: "La mesa " + mesa + " no está en la ronda " + p.ronda + "." }, 404);
      // Es para una partida SIN terminar: si ya tiene resultado, no hay nada que corregir.
      if (m.valor !== "0") return json({ error: "La mesa " + mesa + " ya tiene resultado en chess-results." }, 409);
      const { data: nueva, error } = await servicio.from("centroamericano_tiempos").insert({
        asignacion_id: a.id, arbitro: a.arbitro, tnr: a.tnr, ronda: p.ronda, mesa, blancas: m.blancas.slice(0, 120), negras: m.negras.slice(0, 120),
        jugada, j_blancas: jB, j_negras: jN, turno, t_blancas: tB, t_negras: tN, nota,
      }).select("id, ocurrio").single();
      if (error || !nueva) { console.error("centroamericano-mesa: tiempo", a.tnr, error?.code); return json({ error: "No se pudo anotar. Intenta de nuevo." }, 500); }
      // También queda en la bitácora de la mesa: que se hizo este control y qué marcaban los relojes.
      const texto = "Control de tiempos de la mesa " + mesa + " · Blancas (" + m.blancas + "): " + formatoTiempo(tB) + (jB != null ? ", " + jB + (jB === 1 ? " jugada" : " jugadas") : "")
        + " · Negras (" + m.negras + "): " + formatoTiempo(tN) + (jN != null ? ", " + jN + (jN === 1 ? " jugada" : " jugadas") : "") + (nota ? " · " + nota : "");
      const { error: eReg } = await servicio.from("centroamericano_registro").insert({
        asignacion_id: a.id, arbitro: a.arbitro, tnr: a.tnr, ronda: p.ronda, mesa, color: null, jugador: (m.blancas + " – " + m.negras).slice(0, 120),
        tipo: "nota", articulo: "Control de tiempos", texto: texto.slice(0, 2000),
      });
      if (eReg) console.error("centroamericano-mesa: tiempo registro", a.tnr, eReg.code);
      return json({ ok: true, id: nueva.id, ocurrio: nueva.ocurrio, jugada, registro_error: !!eReg });
    }

    if (cuerpo.action === "lista") {
      const ronda = Number(cuerpo.ronda);
      const paso = String(cuerpo.paso ?? "");
      const i = PASOS.indexOf(paso);
      if (i < 0) return json({ error: "Paso no válido." }, 400);
      if (!Number.isInteger(ronda) || ronda < 1 || ronda > 99) return json({ error: "Falta la ronda." }, 400);
      // Paso a paso: el siguiente no se aprueba sin el anterior.
      const { data: hechos } = await servicio.from("centroamericano_listas").select("paso").eq("asignacion_id", a.id).eq("ronda", ronda);
      const ok = (hechos ?? []).map((f: { paso: string }) => f.paso);
      if (PASOS.slice(0, i).some((x) => !ok.includes(x))) return json({ error: "Antes tienes que aprobar el paso anterior de la lista." }, 409);
      if (!ok.includes(paso)) {
        const { error } = await servicio.from("centroamericano_listas").insert({ asignacion_id: a.id, ronda, paso });
        if (error && error.code !== "23505") { console.error("centroamericano-mesa: lista", a.tnr, error.code); return json({ error: "No se pudo anotar. Intenta de nuevo." }, 500); }
      }
      return json({ ok: true, lista: PASOS.filter((x) => x === paso || ok.includes(x)) });
    }

    if (cuerpo.action === "planilla") {
      const ronda = Number(cuerpo.ronda);
      const mesa = Number(cuerpo.mesa);
      // UNA foto por mesa, con las dos planillas juntas: el árbitro cuida que salgan las dos.
      // Se guarda con lado = «blancas» (la fila de siempre; la base solo admite blancas o negras).
      const imagen = String(cuerpo.imagen ?? "");
      if (!enRango(mesa)) return json({ error: "La mesa " + mesa + " no es de tu rango (" + a.mesa_desde + " a " + a.mesa_hasta + ")." }, 403);
      const m64 = imagen.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
      if (!m64) return json({ error: "La foto tiene que ser una imagen JPG." }, 400);
      if (m64[1].length > MAX_IMAGEN * 1.4) return json({ error: "La foto es demasiado grande. Toma otra más cerca o con menos resolución." }, 413);
      const bytes = deBase64(m64[1]);
      if (bytes.length > MAX_IMAGEN || bytes.length < 2000) return json({ error: "La foto no es válida o es demasiado grande." }, 400);
      // El nombre del enfrentamiento sale de chess-results, no de lo que mande la pantalla.
      const leida = await leerRonda(acceso!.acceso, acceso!.sid, a.tnr);
      if ("error" in leida) return json({ error: leida.error }, leida.estado);
      const p = leida.pantalla;
      if (!Number.isInteger(ronda) || p.ronda !== ronda) return json({ error: "La ronda abierta en chess-results es la " + p.ronda + ", no la " + cuerpo.ronda + ". Actualiza la página." }, 409);
      const m = p.mesas.find((x) => x.mesa === mesa);
      if (!m) return json({ error: "La mesa " + mesa + " no está en la ronda " + p.ronda + "." }, 404);
      const jugador = m.blancas, rival = m.negras;
      const ruta = a.tnr + "/ronda-" + p.ronda + "/mesa-" + mesa + "-planillas.jpg";
      const { error: eSubida } = await servicio.storage.from(BUCKET).upload(ruta, bytes, { contentType: "image/jpeg", upsert: true });
      if (eSubida) { console.error("centroamericano-mesa: planilla", a.tnr, eSubida.message); return json({ error: "No se pudo guardar la foto. Intenta de nuevo." }, 500); }
      const { data: fila, error: eFila } = await servicio.from("centroamericano_planillas").upsert({
        asignacion_id: a.id, arbitro: a.arbitro, tnr: a.tnr, ronda: p.ronda, mesa, lado: "blancas", jugador: jugador.slice(0, 120), rival: rival.slice(0, 120),
        ruta, subida: new Date().toISOString(), bytes: bytes.length, drive_ok: false, drive_en: null, drive_error: "",
      }, { onConflict: "tnr,ronda,mesa,lado" }).select("id").single();
      if (eFila || !fila) { console.error("centroamericano-mesa: planilla fila", a.tnr, eFila?.code); return json({ error: "La foto se guardó pero no se pudo anotar. Intenta de nuevo." }, 500); }
      // Al Drive, si está conectado. Si falla, la foto ya está a salvo y se reintenta desde la organización.
      let drive = "sin_conectar";
      const { data: dr } = await servicio.rpc("centroamericano_drive_leer");
      const puente = (Array.isArray(dr) ? dr[0] : dr) as { url: string; secreto: string } | null;
      if (puente?.url && puente?.secreto) {
        const r = await llamarPuente(puente.url, puente.secreto, {
          accion: "planilla", torneo: torneoInfo?.nombre ?? p.torneo, ronda: p.ronda, mesa, lado: "ambas", blancas: m.blancas, negras: m.negras, jugador, imagen: aBase64(bytes),
        });
        drive = r.ok ? "enviada" : "pendiente";
        await servicio.from("centroamericano_planillas").update(r.ok ? { drive_ok: true, drive_en: new Date().toISOString(), drive_error: "" } : { drive_error: String(r.error ?? "").slice(0, 300) }).eq("id", fila.id);
      }
      return json({ ok: true, mesa, lado: "ambas", drive, subida: new Date().toISOString() });
    }

    if (cuerpo.action === "finalizar") {
      const ronda = Number(cuerpo.ronda);
      const rev = (cuerpo.revision ?? {}) as Record<string, unknown>;
      const revision = { resultados: rev.resultados === true, planillas: rev.planillas === true, firmadas: rev.firmadas === true };
      if (!revision.resultados || !revision.planillas || !revision.firmadas) return json({ error: "Para finalizar tienes que confirmar las tres revisiones." }, 400);
      const leida = await leerRonda(acceso!.acceso, acceso!.sid, a.tnr);
      if ("error" in leida) return json({ error: leida.error }, leida.estado);
      const p = leida.pantalla;
      if (!Number.isInteger(ronda) || p.ronda !== ronda) return json({ error: "La ronda abierta en chess-results es la " + p.ronda + ", no la " + cuerpo.ronda + ". Actualiza la página." }, 409);
      const av = avance(p.mesas, a.mesa_desde, a.mesa_hasta);
      await guardarAvance(servicio, a.id, p.ronda, av);
      if (av.total === 0) return json({ error: "Tus mesas todavía no aparecen en la ronda " + p.ronda + "." }, 409);
      if (av.pendientes.length) return json({ error: "Todavía faltan resultados en las mesas " + av.pendientes.join(", ") + "." }, 409);
      const { data: previa } = await servicio.from("centroamericano_finales").select("id, reabierta, finalizada_en").eq("asignacion_id", a.id).eq("ronda", p.ronda).maybeSingle();
      if (previa && !previa.reabierta) return json({ ok: true, ya: true, finalizada_en: previa.finalizada_en });
      const ahora = new Date().toISOString();
      const { error } = previa
        ? await servicio.from("centroamericano_finales").update({ reabierta: false, finalizada_en: ahora, revision }).eq("id", previa.id)
        : await servicio.from("centroamericano_finales").insert({ asignacion_id: a.id, ronda: p.ronda, finalizada_en: ahora, revision });
      if (error) { console.error("centroamericano-mesa: finalizar", a.tnr, error.code); return json({ error: "No se pudo finalizar. Intenta de nuevo." }, 500); }
      await servicio.from("centroamericano_avisos").insert({
        de: "arbitro", asignacion_id: a.id, tipo: "finalizo", ronda: p.ronda,
        texto: "Finalizó la ronda " + p.ronda + " (" + av.total + (av.total === 1 ? " mesa" : " mesas") + "): revisó resultados y confirmó planillas ordenadas y firmadas.",
      });
      return json({ ok: true, finalizada_en: ahora });
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
      const { data: abiertos } = await servicio.from("centroamericano_avisos").select("id, mesa, creado").eq("asignacion_id", a.id).eq("de", "arbitro").eq("tipo", "ayuda").eq("estado", "abierto");
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
      const { data, error } = await servicio.from("centroamericano_avisos").update({ leido_en: new Date().toISOString() }).eq("id", id).in("asignacion_id", idsDe).eq("de", "organizacion").is("leido_en", null).select("id");
      if (error) { console.error("centroamericano-mesa: leido", a.tnr, error.code); return json({ error: "No se pudo marcar. Intenta de nuevo." }, 500); }
      return json({ ok: true, marcados: (data ?? []).length });
    }

    if (cuerpo.action === "nombre") {
      const nombre = String(cuerpo.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (!nombre) return json({ error: "Escribe tu nombre." }, 400);
      // Solo se pone una vez: después, cambiarlo es cosa de la organización (el nombre sale en el registro).
      if (a.nombrado) return json({ error: "Este enlace ya tiene nombre. Si hay que cambiarlo, díselo a la organización." }, 409);
      // Si tiene varios enlaces (varios torneos), el nombre vale para todos.
      let q = servicio.from("centroamericano_asignaciones").update({ arbitro: nombre, nombrado: true }).eq("nombrado", false);
      q = a.persona ? q.eq("persona", a.persona) : q.eq("id", a.id);
      const { error } = await q;
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
