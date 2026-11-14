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
//   "leer"    {}                          -> las mesas de su rango, sus marcas, su registro y sus avisos, y la hora en que el árbitro de
//                                             su categoría marcó que empezó la ronda (`inicio_ronda`; el tiempo de espera corre desde ahí)
//   "inicio"  { ronda, inicio? | quitar? } -> «Inició la ronda»: la hora real en que empezó la ronda en SU categoría (la organización ya
//                                             no la marca; cada categoría puede empezar a una hora distinta). Con `quitar`, vuelve el calendario
//   "guardar" { ronda, cambios[] }        -> manda resultados y los anota si quedaron
//   "anotar"  { ronda, mesa, color, tipo, texto?, articulo? } -> una línea del registro (con tipo «nota» y artículo «Levantó»:
//                                             el jugador se levantó de la mesa; las marcas llevan la cuenta por jugador y partida)
//   "anular"  { id }                      -> deshace una ilegal o irregularidad
//   "lista"   { ronda, paso }             -> aprueba un paso de la lista previa de la ronda (relojes, tableros; en ese orden).
//                                             Sin los dos aprobados, "guardar" responde 409.
//   "planilla" { ronda, mesa, imagen }    -> UNA foto por mesa con las dos planillas juntas (la parte de «lado» ya no se usa):
//                                             se guarda en el bucket privado y pasa al Drive («Planillas Centroamericano»)
//   "finalizar" { ronda, revision }       -> el árbitro finaliza la ronda (todas sus mesas con resultado y
//                                             confirmó que revisó resultados y planillas ordenadas y firmadas)
//   "presencia" { ronda, mesa, color, presente, ocurrio?, inicio? } -> marca si el jugador de esa mesa llegó (la organización ve a los que faltan).
//                                             Si llega más de un minuto después de empezar la ronda, deja en la bitácora la nota «Llegó tarde» con cuánto se
//                                             tardó y cuánto le faltaba para la incomparecencia (el reloj que se apaga la usa); «no ha llegado» la anula
//   "presencia_todos" { ronda }          -> marca que llegaron TODOS los jugadores de sus mesas que todavía no están marcados «llegó» (incluye a los que
//                                             estaban «no ha llegado»): el atajo para arrancar la ronda cuando llegaron juntos
//   "presencia_ausentes" { ronda }       -> anota «no ha llegado» a los jugadores de sus mesas que no tienen ninguna marca (la tablet lo manda una vez
//                                             cuando empieza la ronda de su categoría; así la organización los ve). Nunca pisa una marca
//   "tiempo"  { ronda, mesa, t_blancas, j_blancas, t_negras, j_negras, nota?, ocurrio? } -> una lectura del control de tiempos de una partida
//                                             sin terminar: lo que marca el reloj de cada color y las jugadas que lleva. Queda en la
//                                             tabla de tiempos Y como una línea («nota») en la bitácora de la mesa. (Aún acepta la
//                                             forma vieja { jugada, turno?, t_blancas, t_negras } para una página que no se recargó.)
// y las que NO hablan con chess-results (ni necesitan la clave), para que el árbitro
// reciba lo que le manda la organización aunque chess-results esté caído:
//   "avisos"  {}                          -> mensajes sin leer de la organización y el estado de su pedido de ayuda
//   "ayuda"   { mesa?, texto? }           -> pide al árbitro principal (le llega un aviso a la cuenta principal)
//   "leido"   { id }                      -> marca un mensaje de la organización como leído («Entendido»)
//   "nombre"  { nombre }                  -> el árbitro «por definir» pone su nombre (una sola vez)
//   "concluir" {}                         -> «Ya terminé mis labores»: cierra su enlace (y los otros del mismo árbitro): ya no puede
//                                             escribir nada (409), solo leer y bajar su bitácora; la organización puede reabrirlas
//   "bitacora" {}                         -> toda su bitácora (todas las rondas y los torneos que atendió) para el PDF; solo después de concluir
//   "bitacora_correo" { correo, pdf }    -> manda la bitácora en PDF (la que armó la página) al correo que el árbitro puso; solo después de concluir,
//                                             con tope (2 por enlace, 1 por minuto). El correo no se guarda: solo se cuenta el envío
//   "emparejamientos" { tnr? }           -> «Todas las mesas» (el pizote de la página): sin `tnr`, las categorías del torneo; con `tnr`, los emparejamientos de la
//                                             ronda abierta de esa categoría (solo lee, con la lectura compartida). La organización lo habilita por enlace (403 si no)
//   "todas_mesas" {}                     -> «¿Dónde juega?» (la lupa de la página): los emparejamientos de la ronda abierta de TODAS las categorías en UNA sola respuesta, para
//                                             buscar a un atleta por su nombre sin elegir categoría. Sale de la copia compartida de chess-results (centroamericano_lecturas):
//                                             solo se vuelven a leer las categorías cuya copia tiene más de 2 minutos, hasta 6 a la vez y esperando a lo más 12 s
//   "mis_pareos" {}                      -> «Mis pareos» (el logo y la «Ronda abierta» de la página): los pareos de SUS mesas (las de este enlace y las de sus otros enlaces, nada más) de
//                                             TODAS las rondas, con el resultado. La ronda abierta sale de la copia compartida (centroamericano_lecturas); las anteriores, de lo que
//                                             guarda el sorteo de Fair Play (centroamericano_fp_partidas); lo que falta o está incompleto se completa con la
//                                             página pública de pareos de chess-results (con topes) y se deja guardado en esa tabla
//   "salida"  { fase: "sale"|"vuelve", motivo?, segundos? } -> «Modo concentración»: anota que el árbitro se salió de la pantalla de su tablet y cuándo volvió
//   "calentar" {}                         -> sin token: solo contesta ok (la base lo manda cada minuto para mantener la función arrancada)
//
// EL MISMO ÁRBITRO EN VARIOS TORNEOS: la organización junta sus enlaces con `persona`. El árbitro
// abre uno y `leer` le devuelve los otros (`hermanas`, con su token) para pasar de uno a otro;
// los avisos de la organización de cualquiera de ellos le llegan estando en cualquiera. Cada enlace
// sigue con su torneo, su rango, su avance, su lista previa y su «finalizar».
//
// LO QUE SE REINTENTA NO SE DUPLICA: la tablet puede mandar una anotación (`anotar`, `tiempo`) con un
// `id` suyo (un uuid); si la manda dos veces porque no supo si llegó la primera, la base la reconoce
// y la segunda no cuenta. `presencia`, `planilla`, `lista` y `guardar` ya son idempotentes por su forma.
//
// LA LECTURA DE CHESS-RESULTS ES COMPARTIDA (lecturas-cache.ts): con 15 a 20 tablets no se le pregunta
// a chess-results cada vez; y si no contesta, se sirve lo último que se leyó (`datos.viejo`).
//
// verify_jwt en false.

import { createClient } from "npm:@supabase/supabase-js@2";
import { guardarYComprobar, MAX_CAMBIOS, mismoNombre } from "./chess-results-ingreso.ts";
import { avance, guardarAvance } from "./avance-ronda.ts";
import { aBase64, deBase64, llamarPuente } from "./drive-puente.ts";
import { aLectura, leerConCache, ponerLectura } from "./lecturas-cache.ts";
import { pareosPublicos } from "./pareos-publicos.ts";
import { conRival, fedDe, fedsDe, sinRival } from "./inscritos-fed.ts";
import { A_PAREO, ARTICULO_PAREO, DE_PAREO, filaCola, leerPareo, type LecturaPareo } from "./fuente-pareo.ts";
import { limpiarEnvio } from "./pareo-adjuntos.ts";
import { tocar } from "./toque-vivo.ts";

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
// El correo con la bitácora del árbitro (acción «bitacora_correo»).
const DE_CORREO = "Ajedrez Integral <informes@ajedrez-integral.com>";
const RESPONDER_A = "info@ajedrez-integral.com";
const CORREO_VALIDO = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const MAX_PDF_BYTES = 3 * 1024 * 1024;   // la bitácora es solo texto y la marca de agua: sobra
const MAX_CORREOS_POR_ENLACE = 2;

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
type Marca = { ilegales: number; irregularidades: number; ultima_ilegal: string | null; ultima_irregularidad: string | null; levantadas: number; ultima_levantada: string | null };
const marcaVacia = (): Marca => ({ ilegales: 0, irregularidades: 0, ultima_ilegal: null, ultima_irregularidad: null, levantadas: 0, ultima_levantada: null });
// «Se levantó de la mesa»: una nota de la bitácora con este artículo (la restricción de `tipo` del registro no cambia). Cada vez que
// el jugador se levanta durante la partida el árbitro toca el botón y queda una línea con la hora; las marcas las cuentan.
const ARTICULO_LEVANTO = "Levantó";
// «Llegó tarde»: la nota que deja `presencia` cuando un jugador llega después de empezar la ronda (la cuenta el reloj que se apaga).
const ARTICULO_TARDE = "Llegó tarde";
const TOLERANCIA_S = 30 * 60;      // el tiempo de espera de las bases
const MAX_TARDE_S = 6 * 3600;      // más que eso no es una llegada tarde: es un dato malo

// Las marcas de cada jugador en una partida, sin lo que se anuló. Una anulación
// solo deshace la línea a la que apunta.
function marcasDe(filas: Fila[]): Record<string, Marca> {
  const anuladas = new Set(filas.filter((f) => f.tipo === "anulacion" && f.anula).map((f) => f.anula as string));
  const out: Record<string, Marca> = {};
  for (const f of filas) {
    const levanto = f.tipo === "nota" && f.articulo === ARTICULO_LEVANTO;
    if ((f.tipo !== "ilegal" && f.tipo !== "irregularidad" && !levanto) || !f.color || anuladas.has(f.id)) continue;
    const k = f.mesa + "|" + f.color;
    const m = out[k] ?? (out[k] = marcaVacia());
    if (f.tipo === "ilegal") { m.ilegales++; m.ultima_ilegal = f.id; }
    else if (levanto) { m.levantadas++; m.ultima_levantada = f.id; }
    else { m.irregularidades++; m.ultima_irregularidad = f.id; }
  }
  return out;
}

const COLUMNAS = "id, ocurrio, arbitro, mesa, color, jugador, tipo, resultado, anterior, articulo, texto, enviado, anula";

// La lectura compartida de «leer» por torneo (ver leerCompartidaBreve): vive lo que viva esta instancia de la función.
const MEMO_LEER_MS = 5_000;
const memoLeer = new Map<string, { al: number; p: Promise<Awaited<ReturnType<typeof leerConCache>>> }>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);

  let cuerpo: Record<string, unknown> = {};
  try { cuerpo = await req.json(); } catch { cuerpo = {}; }
  // «calentar»: lo manda la base cada minuto durante el torneo para tener la función arrancada (ver la migración
  // centroamericano_calentar). No pide token, no toca la base y no habla con chess-results: solo contesta.
  if (cuerpo.action === "calentar") return json({ ok: true });
  const token = String(cuerpo.token ?? "").trim();
  if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: "Este enlace no es válido. Pídele a la organización que te mande el QR de nuevo." }, 404);

  const servicio = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // La asignación: de quién es el token, qué torneo y qué mesas.
  const { data: a } = await servicio
    .from("centroamericano_asignaciones")
    .select("id, tnr, arbitro, nombrado, persona, mesa_desde, mesa_hasta, vence, revocada, ultimo_uso, concluyo_en, concentracion, todas_las_mesas, centroamericano_torneos(nombre, categoria, rama, prueba, evento, fuente, pareo_id, centroamericano_eventos(marca))")
    .eq("token", token)
    .maybeSingle();
  if (!a) return json({ error: "Este enlace no es válido. Pídele a la organización que te mande el QR de nuevo." }, 404);
  if (a.revocada) return json({ error: "La organización apagó este enlace. Pídele uno nuevo." }, 410);
  if (new Date(a.vence).getTime() <= Date.now()) return json({ error: "Este enlace venció. Pídele uno nuevo a la organización." }, 410);

  // «Ya terminé mis labores»: con el enlace concluido el árbitro solo lee y baja su bitácora. Escribir (resultados, anotaciones,
  // presencia, tiempos, fotos, la lista previa, finalizar, pedir ayuda, el nombre) se rechaza AQUÍ, no en la pantalla.
  const ESCRIBE = ["guardar", "anotar", "anular", "lista", "planilla", "finalizar", "presencia", "tiempo", "ayuda", "nombre", "inicio", "presencia_todos", "presencia_ausentes"];
  if (a.concluyo_en && ESCRIBE.includes(String(cuerpo.action))) {
    return json({ error: "Ya concluiste tus labores: ya no puedes anotar ni guardar. Puedes bajar tu bitácora. Si necesitas seguir, pide a la organización que las reabra.", concluido: true }, 409);
  }

  const enRango = (mesa: number) => Number.isInteger(mesa) && mesa >= a.mesa_desde && mesa <= a.mesa_hasta;
  const torneoInfo = (Array.isArray(a.centroamericano_torneos) ? a.centroamericano_torneos[0] : a.centroamericano_torneos) as
    { nombre: string; categoria: string; rama: string; prueba: boolean; evento?: string; fuente?: string; pareo_id?: string | null; centroamericano_eventos?: { marca?: string } | { marca?: string }[] | null } | null;
  // La FUENTE del torneo (ver fuente-pareo.ts): con Pareo Integral las mesas salen del torneo publicado, no se pide la clave de
  // chess-results y lo anotado va a pareo_cola (lo acepta el Pareo del árbitro principal). Todo lo demás es igual.
  const esPareo = torneoInfo?.fuente === "pareo";
  const DONDE = esPareo ? "en Pareo Integral" : "en chess-results";
  // «Todas las mesas» y «¿Dónde juega?» muestran solo las categorías del evento de este enlace (antes, todas las de la tabla).
  // deno-lint-ignore no-explicit-any
  const delMismoEvento = (q: any) => (torneoInfo?.evento ? q.eq("evento", torneoInfo.evento) : q);
  const eventoInfo = torneoInfo?.centroamericano_eventos;
  const marca = (Array.isArray(eventoInfo) ? eventoInfo[0]?.marca : eventoInfo?.marca) || "centroamericano";

  // Los avisos van por la base, sin chess-results: no necesitan la clave ni se caen con ella.
  const DE_AVISOS = ["avisos", "ayuda", "leido", "nombre", "lista", "concluir", "bitacora", "bitacora_correo", "emparejamientos", "todas_mesas", "mis_pareos", "salida"];
  type Hermana = { id: string; token: string; tnr: string; arbitro: string; mesa_desde: number; mesa_hasta: number };
  // Las dos preguntas no dependen una de otra: se hacen a la vez (cada ida y vuelta a la base cuenta,
  // con 15 tablets pidiendo `leer` cada pocos segundos).
  const [{ data: acc }, { data: hermanasData }] = await Promise.all([
    DE_AVISOS.includes(String(cuerpo.action)) || esPareo ? Promise.resolve({ data: null }) : servicio.rpc("centroamericano_acceso", { p_tnr: a.tnr }),
    // Los otros enlaces del MISMO árbitro (otros torneos u otros tramos), si la organización los juntó.
    a.persona
      ? servicio.from("centroamericano_asignaciones").select("id, token, tnr, arbitro, mesa_desde, mesa_hasta")
          .eq("persona", a.persona).neq("id", a.id).eq("revocada", false).gt("vence", new Date().toISOString())
      : Promise.resolve({ data: null }),
  ]);
  const acceso = (Array.isArray(acc) ? acc[0] : acc) as { acceso: string; sid: string } | null;
  if (!acceso && !esPareo && !DE_AVISOS.includes(String(cuerpo.action))) return json({ error: "La organización todavía no cargó la clave de este torneo. Avísale." }, 409);
  const hermanasFilas = (hermanasData ?? []) as Hermana[];
  const idsDe = [a.id, ...hermanasFilas.map((x) => x.id)];

  // Lo que la organización le mandó (sin leer, de cualquiera de sus enlaces) y cómo va su último pedido de ayuda.
  const avisosDe = async () => {
    const { data } = await servicio.from("centroamericano_avisos").select("id, creado, de, mesa, texto, estado, atendido_en, leido_en, tipo, control_tiempos, asignacion_id").in("asignacion_id", idsDe).eq("tipo", "ayuda").order("creado", { ascending: true }).range(0, 199);
    const filas = (data ?? []) as { id: string; creado: string; de: string; mesa: number | null; texto: string; estado: string; atendido_en: string | null; leido_en: string | null; control_tiempos: boolean; asignacion_id: string }[];
    const pedidos = filas.filter((f) => f.de === "arbitro" && f.asignacion_id === a.id);
    const reciente = [...pedidos].reverse().find((f) => f.estado === "abierto" || (f.atendido_en && Date.now() - new Date(f.atendido_en).getTime() < 15 * 60_000)) ?? null;
    return {
      nombrado: a.nombrado, arbitro: a.arbitro,
      // «Modo concentración»: lo enciende la organización; la tablet lo lee aquí (cada pocos segundos) para taparse o destaparse.
      concentracion: a.concentracion === true && !a.concluyo_en,
      // «Todas las mesas» (el pizote): la organización lo habilita o deshabilita por enlace; la tablet esconde el botón, y la acción lo hace cumplir.
      todas_las_mesas: a.todas_las_mesas !== false,
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

  // ---------- Pareo Integral (ver fuente-pareo.ts) ----------
  // Lo que se anota NO se guarda en el torneo: va a pareo_cola por la vía de la Mesa (asignacion_id, con el nombre y el rango en
  // índices de Pareo) y lo acepta el Pareo del árbitro principal con sus reglas. Por eso un resultado queda «enviado» después,
  // cuando aparece en el torneo publicado (`mandadosPareo`), y no en el momento.
  const aCola = async (p: LecturaPareo, datosTorneo: Parameters<typeof filaCola>[2], evento: "resultado" | "nota", datos: Record<string, unknown> | null) => {
    if (!datos || !torneoInfo?.pareo_id) return false;
    const { error } = await servicio.from("pareo_cola").insert(filaCola(a, torneoInfo.pareo_id, datosTorneo, evento, p.ronda, datos));
    if (error) console.error("centroamericano-mesa: pareo_cola", a.tnr, error.code);
    // El toque: el Pareo del principal lee la cola en el momento (ver toque-vivo.ts). Si no llega, la lee en su vuelta.
    else await tocar(SUPABASE_URL, SERVICE_ROLE_KEY, "pareo-cola-" + torneoInfo.pareo_id, "cola");
    return !error;
  };
  const leerPareoFresco = () => leerPareo(servicio, torneoInfo?.pareo_id, a.tnr, torneoInfo?.nombre ?? "");
  const ladoPareo = (color: string | null) => (color === "blancas" ? "b" : color === "negras" ? "n" : undefined);

  // Lo que este árbitro mandó y sigue en la cola (el principal todavía no lo tomó), en mesas físicas; y el registro al día.
  async function mandadosPareo(p: LecturaPareo, filas: Fila[]) {
    const fisica: Record<number, number> = {};
    for (const [f, i] of Object.entries(p.indices)) fisica[i] = Number(f);
    const { data } = await servicio.from("pareo_cola").select("datos, creado").eq("asignacion_id", a.id).eq("evento", "resultado").eq("ronda", p.ronda).order("id").range(0, 199);
    const mandados = ((data ?? []) as { datos: { mesa?: number; r?: string }; creado: string }[])
      .map((x) => ({ mesa: fisica[Number(x.datos.mesa)] ?? 0, valor: DE_PAREO[String(x.datos.r)] ?? "0", creado: x.creado }))
      .filter((x) => x.mesa && x.valor !== "0");
    // «Enviado»: el resultado que se mandó ya está en el torneo publicado. Es la única vez que esta función cambia una línea
    // del registro (solo `enviado`, de false a true): con Pareo la confirmación llega después (ver la cabecera de fuente-pareo.ts).
    const porConfirmar = filas.filter((f) => !f.enviado && (f.tipo === "resultado" || f.tipo === "correccion"));
    for (const f of porConfirmar) {
      const m = p.mesas.find((x) => x.mesa === f.mesa);
      if (!m || m.valor === "0" || NOMBRE_RESULTADO[m.valor] !== f.resultado) continue;
      await servicio.from("centroamericano_registro").update({ enviado: true }).eq("id", f.id).eq("asignacion_id", a.id).eq("enviado", false);
      f.enviado = true;
    }
    return mandados;
  }

  // «Guardar» con Pareo: comprueba la ronda y los jugadores de cada mesa contra lo publicado y lo deja en la cola.
  async function guardarPareo(ronda: number, cambios: { mesa: number; blancas: string; negras: string; valor: string }[]) {
    const l = await leerPareoFresco();
    if (!l.ok) return json({ error: l.error }, l.estado);
    const p = l.lectura;
    if (p.ronda !== ronda) return json({ error: "La ronda abierta " + DONDE + " es la " + p.ronda + ", no la " + ronda + ". Actualiza la página." }, 409);
    if (cambios.some((c) => c.valor === "D")) return json({ error: "Para borrar un resultado, pídeselo al árbitro principal: en Pareo Integral lo borra él. No se mandó nada." }, 400);
    const resultados: { mesa: number; pedido: string; quedo: string | null; ok: boolean; pendiente?: boolean; error?: string }[] = [];
    const registro: Record<string, unknown>[] = [];
    for (const c of cambios) {
      const m = p.mesas.find((x) => x.mesa === c.mesa);
      const r = A_PAREO[c.valor];
      if (!m || !r) { resultados.push({ mesa: c.mesa, pedido: c.valor, quedo: m ? m.valor : null, ok: false, error: !m ? "Esa mesa no está en la ronda." : "Resultado no válido." }); continue; }
      if (!mismoNombre(m.blancas, c.blancas) || !mismoNombre(m.negras, c.negras)) {
        resultados.push({ mesa: c.mesa, pedido: c.valor, quedo: m.valor, ok: false, error: "En esa mesa ahora juegan otros: actualiza la página." });
        continue;
      }
      if (m.valor === c.valor) { resultados.push({ mesa: c.mesa, pedido: c.valor, quedo: m.valor, ok: true }); continue; }
      const indice = p.indices[c.mesa];
      // Si ya había uno de este árbitro esperando para esa mesa, el nuevo lo reemplaza (el principal ve uno solo).
      await servicio.from("pareo_cola").delete().eq("asignacion_id", a.id).eq("evento", "resultado").eq("ronda", ronda).eq("datos->>mesa", String(indice));
      const ok = await aCola(p, l.datos, "resultado", limpiarEnvio("resultado", { mesa: indice, r, corrige: m.valor !== "0" }));
      resultados.push({ mesa: c.mesa, pedido: c.valor, quedo: m.valor, ok, pendiente: ok });
      if (ok) {
        registro.push({
          asignacion_id: a.id, arbitro: a.arbitro, tnr: a.tnr, ronda, mesa: c.mesa, jugador: (m.blancas + " – " + m.negras).slice(0, 120),
          tipo: m.valor !== "0" ? "correccion" : "resultado", resultado: NOMBRE_RESULTADO[c.valor], anterior: m.valor !== "0" ? NOMBRE_RESULTADO[m.valor] : null, enviado: false,
        });
      }
    }
    let registroError = false;
    if (registro.length) {
      const { error } = await servicio.from("centroamericano_registro").insert(registro);
      if (error) { registroError = true; console.error("centroamericano-mesa: registro (pareo)", a.tnr, error.code); }
    }
    return json({ ok: resultados.every((r) => r.ok), ronda, resultados, diferencias: [], leido_en: new Date().toISOString(), pendiente: true, registro_error: registroError });
  }

  // La lectura de chess-results es COMPARTIDA entre los árbitros (ver lecturas-cache.ts): la copia
  // reciente se reutiliza, y si chess-results no contesta se sirve la última que hubo.
  const MAX_LEER_MS = 40_000;   // «ver mis mesas»: hasta 40 s de antigüedad
  const MAX_COMUN_MS = 120_000; // presencia, tiempo, anotar, planilla: solo comprueban ronda, mesa y jugadores
  // Con Pareo Integral se lee el torneo publicado (leer la base es barato: no hay copia que esperar).
  const leerCompartida = (maxEdadMs: number, fresca = false): Promise<Awaited<ReturnType<typeof leerConCache>>> =>
    esPareo ? leerPareo(servicio, torneoInfo?.pareo_id, a.tnr, torneoInfo?.nombre ?? "") : leerConCache(servicio, acceso!, a.tnr, { maxEdadMs, fresca });
  // «Ver mis mesas» de VARIAS tablets de la misma categoría a la vez (el arranque de una ronda, o muchas abiertas): se comparte la misma lectura
  // durante unos segundos en esta instancia de la función, también mientras todavía se está leyendo (si no, cada pedido consultaba la copia por su
  // cuenta y todos esperaban en fila). La copia compartida ya tiene hasta 40 s de antigüedad, así que 5 s más no cambian nada. Solo «leer»; una
  // lectura que falla no se guarda. Las demás acciones (anotar, guardar…) siguen leyendo lo suyo.
  const leerCompartidaBreve = (tnr: string) => {
    const ahora = Date.now();
    const previa = memoLeer.get(tnr);
    if (previa && ahora - previa.al < MEMO_LEER_MS) return previa.p;
    const p = leerCompartida(MAX_LEER_MS);
    memoLeer.set(tnr, { al: ahora, p });
    p.then((l) => { if (!l.ok) memoLeer.delete(tnr); }, () => memoLeer.delete(tnr));
    return p;
  };

  try {
    if (cuerpo.action === "leer") {
      const lectura = await leerCompartidaBreve(a.tnr);
      if (!lectura.ok) return json({ error: lectura.error }, lectura.estado);
      const p = lectura.lectura;
      visto();
      // Todo lo que sigue es independiente entre sí: una sola tanda en paralelo.
      const [filas, { data: fin }, { data: pasosOk }, { data: plan }, { data: pres }, { data: tiem }, avisos, hermanas, _avance, { data: inicioRonda }, feds] = await Promise.all([
        registroDe(p.ronda),
        servicio.from("centroamericano_finales").select("finalizada_en").eq("asignacion_id", a.id).eq("ronda", p.ronda).eq("reabierta", false).maybeSingle(),
        servicio.from("centroamericano_listas").select("paso").eq("asignacion_id", a.id).eq("ronda", p.ronda),
        servicio.from("centroamericano_planillas").select("mesa, lado, subida, drive_ok").eq("tnr", a.tnr).eq("ronda", p.ronda).gte("mesa", a.mesa_desde).lte("mesa", a.mesa_hasta),
        servicio.from("centroamericano_presencia").select("mesa, color, presente, marcada").eq("tnr", a.tnr).eq("ronda", p.ronda).gte("mesa", a.mesa_desde).lte("mesa", a.mesa_hasta),
        servicio.from("centroamericano_tiempos").select("id, ocurrio, mesa, jugada, j_blancas, j_negras, turno, t_blancas, t_negras, nota").eq("tnr", a.tnr).eq("ronda", p.ronda).gte("mesa", a.mesa_desde).lte("mesa", a.mesa_hasta).order("ocurrio", { ascending: false }).limit(150),
        avisosDe(),
        (async () => {
          if (!hermanasFilas.length) return [] as { token: string; tnr: string; torneo: string; arbitro: string; mesa_desde: number; mesa_hasta: number }[];
          const { data: nombres } = await servicio.from("centroamericano_torneos").select("tnr, nombre").in("tnr", hermanasFilas.map((x) => x.tnr));
          return hermanasFilas.map((x) => ({ token: x.token, tnr: x.tnr, torneo: (nombres ?? []).find((n: { tnr: string }) => n.tnr === x.tnr)?.nombre ?? x.tnr, arbitro: x.arbitro, mesa_desde: x.mesa_desde, mesa_hasta: x.mesa_hasta }));
        })(),
        // El avance de la ronda (lo ve la organización) no espera a nadie ni retrasa la respuesta.
        // (Con Pareo, antes de emparejar la ronda 1 la ronda es 0: no hay avance que guardar.)
        p.ronda > 0 ? guardarAvance(servicio, a.id, p.ronda, avance(p.mesas, a.mesa_desde, a.mesa_hasta)).catch(() => ({ termino: false })) : Promise.resolve({ termino: false }),
        // La hora real en que el árbitro de esta categoría marcó que empezó la ronda (la tolerancia corre desde ahí); sin marca, null.
        servicio.from("centroamericano_inicios_torneo").select("ronda, inicio, arbitro").eq("tnr", a.tnr).eq("ronda", p.ronda).maybeSingle(),
        // La federación de cada jugador, para su banderita (de la lista de inscritos, guardada en memoria; sin ella no hay banderas y nada más cambia).
        // (Con Pareo, la federación viene en el torneo publicado.)
        esPareo ? Promise.resolve((p as LecturaPareo).feds ?? new Map<string, string>()) : fedsDe(a.tnr, 3000).catch(() => new Map<string, string>()),
      ]);
      // Con Pareo, lo que este árbitro mandó y el principal todavía no tiene (sigue en la cola), y el registro al día:
      // un resultado mandado queda «enviado» cuando ya aparece en el torneo publicado.
      const mandados = esPareo && p.ronda > 0 ? await mandadosPareo(p as LecturaPareo, filas) : [];
      return json({
        ...avisos,
        hermanas,
        concluyo: a.concluyo_en ?? null,
        inicio_ronda: inicioRonda ?? null,
        presencia: pres ?? [],
        tiempos: tiem ?? [],
        finalizada: fin ? fin.finalizada_en : null,
        lista: PASOS.filter((x) => (pasosOk ?? []).some((f: { paso: string }) => f.paso === x)),
        planillas: plan ?? [],
        arbitro: a.arbitro, tnr: a.tnr, torneo: torneoInfo?.nombre ?? p.torneo, categoria: torneoInfo?.categoria ?? "", rama: torneoInfo?.rama ?? "",
        ronda: p.ronda, desde: a.mesa_desde, hasta: a.mesa_hasta, vence: a.vence,
        mesas: p.mesas.filter((m) => enRango(m.mesa)).map(({ mesa, blancas, negras, valor }) => ({ mesa, blancas, negras, valor, fed_b: fedDe(feds, blancas), fed_n: fedDe(feds, negras) })),
        marcas: marcasDe(filas),
        // Las últimas 60 (lo que se ve en «Lo anotado») MÁS todas las ilegales e irregularidades de la ronda: el reloj que se
        // apaga cuenta los 2 min de cada ilegal y las sanciones de tiempo, y una vieja que quedara fuera de las 60 faltaría
        // en la cuenta sin que nada lo diga. Van en el orden en que pasaron.
        anotaciones: ((sin) => { const ult = sin.slice(-60), ya = new Set(ult.map((f) => f.id));
          return sin.filter((f) => !ya.has(f.id) && (f.tipo === "ilegal" || f.tipo === "irregularidad")).concat(ult); })(filas.filter((f) => f.tipo !== "anulacion")),
        anuladas: filas.filter((f) => f.tipo === "anulacion" && f.anula).map((f) => f.anula),
        leido_en: new Date().toISOString(),
        // De cuándo son las mesas: si chess-results no contestó, son las últimas que se leyeron (`viejo`).
        datos: { desde: lectura.desde, viejo: lectura.viejo, motivo: lectura.motivo ?? null },
        // De dónde salen las mesas y la cara de la tablet (ver fuente-pareo.ts).
        fuente: esPareo ? "pareo" : "chess-results", marca,
        mandados,
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

      // Con Pareo Integral no se escribe en ningún torneo: va a la cola y lo acepta el principal (nunca guardarYComprobar).
      if (esPareo) return await guardarPareo(ronda, cambios);

      const res = await guardarYComprobar(acceso!.acceso, acceso!.sid, a.tnr, ronda, cambios);
      if (res.estado !== 200 || !("cuerpo" in res)) return json({ error: (res as { error: string }).error }, res.estado);

      // Al registro entra solo lo que chess-results confirmó al volver a leerlo.
      // (Un reenvío del mismo resultado —la tablet no supo si el primero llegó— no deja una «corrección»
      // de más: si la mesa ya tenía ese valor, no hay nada nuevo que anotar.)
      const filas = res.cuerpo.resultados.filter((r) => r.ok && (res.antes.mesas.find((m) => m.mesa === r.mesa)?.valor ?? "0") !== (r.pedido === "D" ? "0" : r.pedido)).map((r) => {
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
      // (Sin las mesas sin rival: igual que en «leer», para que el avance no salte de un número a otro al guardar.)
      await guardarAvance(servicio, a.id, res.cuerpo.ronda, avance(conRival(res.antes.mesas.map((m) => ({ mesa: m.mesa, blancas: m.blancas, negras: m.negras, valor: quedo.get(m.mesa) ?? m.valor }))), a.mesa_desde, a.mesa_hasta));
      await ponerLectura(servicio, a.tnr, aLectura(res.despues));
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
      const lectura = await leerCompartida(MAX_COMUN_MS);
      if (!lectura.ok) return json({ error: lectura.error }, lectura.estado);
      const p = lectura.lectura;
      if (!Number.isInteger(ronda) || p.ronda !== ronda) return json({ error: "La ronda abierta " + DONDE + " es la " + p.ronda + ", no la " + cuerpo.ronda + ". Actualiza la página." }, 409);
      const m = p.mesas.find((x) => x.mesa === mesa);
      if (!m) return json({ error: "La mesa " + mesa + " no está en la ronda " + p.ronda + "." }, 404);
      const jugador = color === "blancas" ? m.blancas : color === "negras" ? m.negras : "";
      // «Se levantó»: la bitácora dice QUIÉN fue (el nombre sale de chess-results, no de lo que mande la pantalla).
      const levanto = tipo === "nota" && articulo === ARTICULO_LEVANTO;
      const textoFinal = levanto ? (jugador + " (" + color + ") se levantó de la mesa").slice(0, 2000) : texto;

      // `id` lo pone la tablet: si reenvía la misma anotación (no supo si llegó), la base la reconoce y
      // NO la cuenta dos veces (una ilegal de más cambiaría el resultado de la partida).
      const idCliente = typeof cuerpo.id === "string" && /^[0-9a-f-]{36}$/.test(cuerpo.id) ? cuerpo.id : null;
      let reintento = false;
      let { data: nueva, error } = await servicio.from("centroamericano_registro").insert({
        ...(idCliente ? { id: idCliente } : {}),
        asignacion_id: a.id, arbitro: a.arbitro, tnr: a.tnr, ronda: p.ronda, mesa, color, jugador: jugador.slice(0, 120), tipo,
        articulo: articulo || (tipo === "ilegal" ? "7.5.5" : ""), texto: textoFinal,
      }).select("id").single();
      if (error && error.code === "23505" && idCliente) {
        const { data: ya } = await servicio.from("centroamericano_registro").select("id").eq("id", idCliente).eq("asignacion_id", a.id).maybeSingle();
        if (ya) { nueva = ya; error = null; reintento = true; }
      }
      if (error || !nueva) { console.error("centroamericano-mesa: anotar", a.tnr, error?.code); return json({ error: "No se pudo anotar. Intenta de nuevo." }, 500); }
      // Con Pareo, también le llega al principal (a sus incidencias de la ronda), una sola vez aunque la tablet la reenvíe.
      if (esPareo && !reintento && "datos" in lectura) {
        const lp = p as LecturaPareo;
        const textoPareo = tipo === "ilegal" ? "Jugada ilegal: " + (texto || "sin detalle") : tipo === "irregularidad" ? "Irregularidad: " + (texto || articulo || "sin detalle") : textoFinal;
        await aCola(lp, lectura.datos as Parameters<typeof filaCola>[2], "nota", limpiarEnvio("nota", {
          texto: textoPareo, autor: a.arbitro, mesa: lp.indices[mesa], lado: ladoPareo(color),
          tipo: tipo === "ilegal" || tipo === "irregularidad" ? "sancion" : "otra",
          articulo: tipo === "ilegal" ? "ilegal" : tipo === "irregularidad" ? (ARTICULO_PAREO[articulo] ?? "") : "",
        }));
      }

      const marca = marcasDe(await registroDe(p.ronda, mesa))[mesa + "|" + color] ?? marcaVacia();
      const aviso = tipo === "ilegal" ? (marca.ilegales >= 2 ? "segunda" : "primera") : null;
      return json({ ok: true, id: nueva.id, jugador, color, marca, aviso });
    }

    if (cuerpo.action === "anular") {
      const id = String(cuerpo.id ?? "");
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "Anotación no válida." }, 400);
      const { data: f } = await servicio.from("centroamericano_registro").select("id, tnr, ronda, mesa, color, jugador, tipo, articulo").eq("id", id).maybeSingle();
      if (!f || f.tnr !== a.tnr || !enRango(f.mesa)) return json({ error: "Esa anotación no es de tus mesas." }, 403);
      if (f.tipo !== "ilegal" && f.tipo !== "irregularidad" && !(f.tipo === "nota" && f.articulo === ARTICULO_LEVANTO)) return json({ error: "Solo se anulan jugadas ilegales, irregularidades y las veces que se levantó un jugador." }, 400);
      const { data: ya } = await servicio.from("centroamericano_registro").select("id").eq("anula", id).limit(1);
      if (ya && ya.length) return json({ error: "Esa anotación ya estaba anulada." }, 409);
      const { error } = await servicio.from("centroamericano_registro").insert({
        asignacion_id: a.id, arbitro: a.arbitro, tnr: a.tnr, ronda: f.ronda, mesa: f.mesa, color: f.color, jugador: f.jugador, tipo: "anulacion", anula: id,
      });
      if (error) { console.error("centroamericano-mesa: anular", a.tnr, error.code); return json({ error: "No se pudo anular. Intenta de nuevo." }, 500); }
      // Con Pareo, el principal se entera: la incidencia que llegó la quita él (Pareo no la borra solo).
      if (esPareo) {
        const l = await leerPareoFresco();
        if (l.ok && l.lectura.ronda === f.ronda) {
          await aCola(l.lectura, l.datos, "nota", limpiarEnvio("nota", {
            texto: "Anulada por error: " + (f.tipo === "ilegal" ? "la jugada ilegal" : f.tipo === "irregularidad" ? "la irregularidad" : "«se levantó»") + " de " + (f.jugador || "—") + ". Quítala de las incidencias.",
            autor: a.arbitro, mesa: l.lectura.indices[f.mesa], tipo: "otra",
          }));
        }
      }
      const marca = marcasDe(await registroDe(f.ronda, f.mesa))[f.mesa + "|" + f.color] ?? marcaVacia();
      return json({ ok: true, color: f.color, mesa: f.mesa, marca });
    }

    // «Inició la ronda»: el árbitro dice a qué hora empezó la ronda en SU categoría (cada categoría puede empezar a una hora
    // distinta). Desde esa hora corre el tiempo de espera de los que no han llegado, en su tablet y en la página de la
    // organización. La hora la manda la tablet (así vale también sin señal, desde la cola): no puede ser del futuro ni de hace
    // más de un día; si el reloj de la tablet va un poco adelantado (hasta 5 min) se toma «ahora». Con `quitar: true` vuelve
    // a valer la hora del calendario. Una fila por categoría y ronda: la última marca es la que vale.
    if (cuerpo.action === "inicio") {
      const ronda = Number(cuerpo.ronda);
      const lectura = await leerCompartida(MAX_COMUN_MS);
      if (!lectura.ok) return json({ error: lectura.error }, lectura.estado);
      const p = lectura.lectura;
      if (!Number.isInteger(ronda) || p.ronda !== ronda) return json({ error: "La ronda abierta " + DONDE + " es la " + p.ronda + ", no la " + cuerpo.ronda + ". Actualiza la página." }, 409);
      if (cuerpo.quitar === true) {
        const { error } = await servicio.from("centroamericano_inicios_torneo").delete().eq("tnr", a.tnr).eq("ronda", ronda);
        if (error) { console.error("centroamericano-mesa: inicio (quitar)", a.tnr, error.code); return json({ error: "No se pudo quitar la hora. Intenta de nuevo." }, 500); }
        return json({ ok: true, ronda, inicio: null });
      }
      const ahora = Date.now();
      let cuando = Date.parse(String(cuerpo.inicio ?? ""));
      if (!Number.isFinite(cuando)) return json({ error: "Falta la hora a la que empezó la ronda." }, 400);
      if (cuando > ahora + 5 * 60_000) return json({ error: "Esa hora todavía no llega: pon la hora a la que empezó la ronda." }, 400);
      if (cuando > ahora) cuando = ahora;
      if (cuando < ahora - 24 * 3_600_000) return json({ error: "La hora de inicio tiene que ser de las últimas 24 horas." }, 400);
      const inicio = new Date(cuando).toISOString();
      const { error } = await servicio.from("centroamericano_inicios_torneo").upsert(
        { tnr: a.tnr, ronda, inicio, asignacion_id: a.id, arbitro: a.arbitro, puesto_en: new Date().toISOString() },
        { onConflict: "tnr,ronda" });
      if (error) { console.error("centroamericano-mesa: inicio", a.tnr, error.code); return json({ error: "No se pudo guardar la hora. Intenta de nuevo." }, 500); }
      return json({ ok: true, ronda, inicio, arbitro: a.arbitro });
    }

    if (cuerpo.action === "presencia") {
      const ronda = Number(cuerpo.ronda);
      const mesa = Number(cuerpo.mesa);
      const color = cuerpo.color === "blancas" || cuerpo.color === "negras" ? cuerpo.color : null;
      if (!color) return json({ error: "Falta el jugador (blancas o negras)." }, 400);
      if (typeof cuerpo.presente !== "boolean") return json({ error: "Falta decir si llegó o no." }, 400);
      if (!enRango(mesa)) return json({ error: "La mesa " + mesa + " no es de tu rango (" + a.mesa_desde + " a " + a.mesa_hasta + ")." }, 403);
      // El jugador sale de chess-results, no de lo que mande la pantalla.
      const lectura = await leerCompartida(MAX_COMUN_MS);
      if (!lectura.ok) return json({ error: lectura.error }, lectura.estado);
      const p = lectura.lectura;
      if (!Number.isInteger(ronda) || p.ronda !== ronda) return json({ error: "La ronda abierta " + DONDE + " es la " + p.ronda + ", no la " + cuerpo.ronda + ". Actualiza la página." }, 409);
      const m = p.mesas.find((x) => x.mesa === mesa);
      if (!m) return json({ error: "La mesa " + mesa + " no está en la ronda " + p.ronda + "." }, 404);
      const jugador = color === "blancas" ? m.blancas : m.negras;
      // La hora de la llegada: la que manda la tablet (vale también si el toque salió de la cola, ya con señal), si es de hace poco
      // y no del futuro; si no, la de ahora.
      const ahoraMs = Date.now(), delCliente = typeof cuerpo.ocurrio === "string" ? Date.parse(cuerpo.ocurrio) : NaN;
      const llegoMs = Number.isFinite(delCliente) && delCliente <= ahoraMs + 60_000 && delCliente >= ahoraMs - 6 * 3600_000 ? Math.min(delCliente, ahoraMs) : ahoraMs;
      const { error } = await servicio.from("centroamericano_presencia").upsert({
        asignacion_id: a.id, arbitro: a.arbitro, tnr: a.tnr, ronda: p.ronda, mesa, color, jugador: jugador.slice(0, 120), presente: cuerpo.presente, marcada: new Date(llegoMs).toISOString(),
      }, { onConflict: "tnr,ronda,mesa,color" });
      if (error) { console.error("centroamericano-mesa: presencia", a.tnr, error.code); return json({ error: "No se pudo anotar. Intenta de nuevo." }, 500); }

      // «Llegó tarde»: si el jugador llega DESPUÉS de empezar la ronda (más de un minuto), queda una nota en la bitácora con cuánto se
      // tardó y cuánto le faltaba para la incomparecencia (el reloj apagado la usa: su reloj corría mientras no estaba). Si el toque
      // era equivocado y el árbitro lo corrige («no ha llegado»), la nota se anula. Una sola nota viva por jugador y partida.
      const filas = await registroDe(p.ronda, mesa);
      const anuladas = new Set(filas.filter((f) => f.tipo === "anulacion" && f.anula).map((f) => f.anula as string));
      const vivas = filas.filter((f) => f.tipo === "nota" && f.articulo === ARTICULO_TARDE && f.color === color && !anuladas.has(f.id));
      let tarde: Fila | null = null;
      const anuladasAhora: string[] = [];
      if (cuerpo.presente === false) {
        for (const v of vivas) {
          const { error: eAn } = await servicio.from("centroamericano_registro").insert({ asignacion_id: a.id, arbitro: a.arbitro, tnr: a.tnr, ronda: p.ronda, mesa, color, jugador: jugador.slice(0, 120), tipo: "anulacion", anula: v.id });
          if (eAn) console.error("centroamericano-mesa: presencia (anular llegada tarde)", a.tnr, eAn.code); else anuladasAhora.push(v.id);
        }
      } else if (!vivas.length) {
        // El inicio de la ronda: el que marcó el árbitro de la categoría (manda); si no hay, el que usó la tablet para su cuenta (el del horario).
        const { data: ini } = await servicio.from("centroamericano_inicios_torneo").select("inicio").eq("tnr", a.tnr).eq("ronda", p.ronda).maybeSingle();
        let inicioMs = ini ? Date.parse(ini.inicio) : NaN;
        if (!Number.isFinite(inicioMs)) {
          const c = typeof cuerpo.inicio === "string" ? Date.parse(cuerpo.inicio) : NaN;
          if (Number.isFinite(c) && c <= llegoMs && c >= llegoMs - 12 * 3600_000) inicioMs = c;
        }
        const segundos = Number.isFinite(inicioMs) ? Math.round((llegoMs - inicioMs) / 1000) : 0;
        if (segundos >= 60 && segundos <= MAX_TARDE_S) {
          const mmss = (x: number) => Math.floor(x / 60) + " min " + (x % 60) + " s";
          const falta = TOLERANCIA_S - segundos;
          const cuando = new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", hour: "numeric", minute: "2-digit" }).format(new Date(llegoMs));
          const texto = (jugador + " (" + color + ") llegó tarde: " + mmss(segundos) + " después del inicio de la ronda (a las " + cuando + "; "
            + (falta > 0 ? "le faltaban " + mmss(falta) + " para la incomparecencia" : "ya había pasado el tiempo de espera de " + TOLERANCIA_S / 60 + " min") + ").").slice(0, 2000);
          const { data: nueva, error: eNota } = await servicio.from("centroamericano_registro").insert({
            asignacion_id: a.id, arbitro: a.arbitro, tnr: a.tnr, ronda: p.ronda, mesa, color, jugador: jugador.slice(0, 120), tipo: "nota", articulo: ARTICULO_TARDE, texto, ocurrio: new Date(llegoMs).toISOString(),
          }).select(COLUMNAS).single();
          if (eNota || !nueva) console.error("centroamericano-mesa: presencia (llegó tarde)", a.tnr, eNota?.code); else tarde = nueva as Fila;
        }
      }
      return json({ ok: true, mesa, color, presente: cuerpo.presente, jugador, tarde, anuladas: anuladasAhora });
    }

    // Las dos acciones de abajo marcan a TODOS los de sus mesas de una vez. Los nombres salen de chess-results y solo se toca SU rango.
    //   presencia_todos    -> «llegó» a todos los que no estén ya marcados «llegó» (los «no ha llegado» pasan a «llegó»).
    //   presencia_ausentes -> «no ha llegado» a los que no tienen ninguna marca (no pisa ni «llegó» ni «no ha llegado»).
    if (cuerpo.action === "presencia_todos" || cuerpo.action === "presencia_ausentes") {
      const todos = cuerpo.action !== "presencia_ausentes";
      const ronda = Number(cuerpo.ronda);
      const lectura = await leerCompartida(MAX_COMUN_MS);
      if (!lectura.ok) return json({ error: lectura.error }, lectura.estado);
      const p = lectura.lectura;
      if (!Number.isInteger(ronda) || p.ronda !== ronda) return json({ error: "La ronda abierta " + DONDE + " es la " + p.ronda + ", no la " + cuerpo.ronda + ". Actualiza la página." }, 409);
      const ahora = new Date().toISOString();
      const mesasMias = p.mesas.filter((m) => enRango(m.mesa));
      if (!mesasMias.length) return json({ error: "Tus mesas todavía no aparecen en la ronda " + p.ronda + "." }, 409);
      const { data: previas } = await servicio.from("centroamericano_presencia").select("mesa, color, presente").eq("tnr", a.tnr).eq("ronda", p.ronda).gte("mesa", a.mesa_desde).lte("mesa", a.mesa_hasta);
      const marcada = new Map((previas ?? []).map((x: { mesa: number; color: string; presente: boolean }) => [x.mesa + "|" + x.color, x.presente]));
      const filas = mesasMias.flatMap((m) => (["blancas", "negras"] as const).map((color) => ({ m, color })))
        .filter(({ m, color }) => (todos ? marcada.get(m.mesa + "|" + color) !== true : !marcada.has(m.mesa + "|" + color)))
        .map(({ m, color }) => ({ asignacion_id: a.id, arbitro: a.arbitro, tnr: a.tnr, ronda: p.ronda, mesa: m.mesa, color, jugador: (color === "blancas" ? m.blancas : m.negras).slice(0, 120), presente: todos, marcada: ahora }));
      if (filas.length) {
        const { error } = await servicio.from("centroamericano_presencia").upsert(filas, { onConflict: "tnr,ronda,mesa,color", ignoreDuplicates: !todos });   // «ausentes» nunca pisa una marca (ni la que llegue mientras tanto)
        if (error) { console.error("centroamericano-mesa: presencia (varios jugadores)", a.tnr, error.code); return json({ error: "No se pudo anotar. Intenta de nuevo." }, 500); }
      }
      return json({ ok: true, marcados: filas.length });
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
      const lectura = await leerCompartida(MAX_COMUN_MS);
      if (!lectura.ok) return json({ error: lectura.error }, lectura.estado);
      const p = lectura.lectura;
      if (!Number.isInteger(ronda) || p.ronda !== ronda) return json({ error: "La ronda abierta " + DONDE + " es la " + p.ronda + ", no la " + cuerpo.ronda + ". Actualiza la página." }, 409);
      const m = p.mesas.find((x) => x.mesa === mesa);
      if (!m) return json({ error: "La mesa " + mesa + " no está en la ronda " + p.ronda + "." }, 404);
      // Es para una partida SIN terminar: si ya tiene resultado, no hay nada que corregir.
      if (m.valor !== "0") return json({ error: "La mesa " + mesa + " ya tiene resultado " + DONDE + "." }, 409);
      const idCliente = typeof cuerpo.id === "string" && /^[0-9a-f-]{36}$/.test(cuerpo.id) ? cuerpo.id : null;
      // La hora que el árbitro marcó al leer los relojes (botón «Marcar la hora ahora»): se acepta si es de hace poco
      // (hasta 6 h: una tablet sin señal la manda cuando vuelve) y no es del futuro (con 1 min de margen por el reloj
      // del aparato). Si no cuadra, se anota la hora de la base, como siempre.
      const marcada = typeof cuerpo.ocurrio === "string" ? Date.parse(cuerpo.ocurrio) : NaN;
      const ocurrioMarcada = Number.isFinite(marcada) && marcada <= Date.now() + 60_000 && marcada >= Date.now() - 6 * 3600_000 ? new Date(Math.min(marcada, Date.now())).toISOString() : null;
      let { data: nueva, error } = await servicio.from("centroamericano_tiempos").insert({
        ...(idCliente ? { id: idCliente } : {}),
        ...(ocurrioMarcada ? { ocurrio: ocurrioMarcada } : {}),
        asignacion_id: a.id, arbitro: a.arbitro, tnr: a.tnr, ronda: p.ronda, mesa, blancas: m.blancas.slice(0, 120), negras: m.negras.slice(0, 120),
        jugada, j_blancas: jB, j_negras: jN, turno, t_blancas: tB, t_negras: tN, nota,
      }).select("id, ocurrio").single();
      // Un reenvío de la misma lectura (la tablet no supo si llegó): ya está, no se anota otra vez.
      if (error && error.code === "23505" && idCliente) {
        const { data: ya } = await servicio.from("centroamericano_tiempos").select("id, ocurrio").eq("id", idCliente).eq("asignacion_id", a.id).maybeSingle();
        if (ya) return json({ ok: true, id: ya.id, ocurrio: ya.ocurrio, jugada, registro_error: false, repetido: true });
      }
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
      const lectura = await leerCompartida(MAX_COMUN_MS);
      if (!lectura.ok) return json({ error: lectura.error }, lectura.estado);
      const p = lectura.lectura;
      if (!Number.isInteger(ronda) || p.ronda !== ronda) return json({ error: "La ronda abierta " + DONDE + " es la " + p.ronda + ", no la " + cuerpo.ronda + ". Actualiza la página." }, 409);
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
      const lectura = await leerCompartida(0, true);
      if (!lectura.ok) return json({ error: lectura.error }, lectura.estado);
      const p = lectura.lectura;
      if (!Number.isInteger(ronda) || p.ronda !== ronda) return json({ error: "La ronda abierta " + DONDE + " es la " + p.ronda + ", no la " + cuerpo.ronda + ". Actualiza la página." }, 409);
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

    // «Todas las mesas»: el árbitro toca el pizote y ve los emparejamientos de la ronda abierta de CADA categoría del torneo
    // (los de prueba solo ven los de prueba), para decirle a un atleta dónde sentarse. Solo lee: es lo mismo que publica
    // chess-results, no trae resultados y no deja escribir nada. Sin `tnr` contesta la lista de categorías; con `tnr`, las mesas
    // de esa categoría, por la misma lectura compartida (no hace una visita más a chess-results si la copia es reciente).
    if (cuerpo.action === "emparejamientos") {
      visto();
      if (a.todas_las_mesas === false) return json({ error: "La organización no habilitó «Todas las mesas» en tu enlace." }, 403);
      const { data: ts } = await delMismoEvento(servicio.from("centroamericano_torneos").select("tnr, nombre, categoria, rama, orden, fuente, pareo_id"))
        .eq("prueba", torneoInfo?.prueba === true).order("orden", { ascending: true }).range(0, 99);
      const categorias = (ts ?? []).map((t: { tnr: string; nombre: string; categoria: string; rama: string; fuente?: string; pareo_id?: string | null }) => ({ tnr: t.tnr, nombre: t.nombre, categoria: t.categoria, rama: t.rama, fuente: t.fuente, pareo_id: t.pareo_id }));
      const pedido = cuerpo.tnr == null || cuerpo.tnr === "" ? "" : String(cuerpo.tnr);
      if (!pedido) return json({ ok: true, actual: a.tnr, categorias });
      const cat = categorias.find((c) => c.tnr === pedido);
      if (!cat) return json({ error: "Esa categoría no es de este torneo." }, 404);
      if (cat.fuente === "pareo") {
        const lp = await leerPareo(servicio, cat.pareo_id, cat.tnr, cat.nombre);
        if (!lp.ok) return json({ error: lp.error }, lp.estado);
        return json({ ok: true, tnr: pedido, nombre: cat.nombre, categoria: cat.categoria, rama: cat.rama, ronda: lp.lectura.ronda,
          mesas: lp.lectura.mesas.map(({ mesa, blancas, negras }) => ({ mesa, blancas, negras })), datos: { desde: lp.desde, viejo: false } });
      }
      const { data: acc2 } = await servicio.rpc("centroamericano_acceso", { p_tnr: pedido });
      const acceso2 = (Array.isArray(acc2) ? acc2[0] : acc2) as { acceso: string; sid: string } | null;
      if (!acceso2) return json({ error: "La organización todavía no cargó la clave de " + cat.nombre + ". Avísale." }, 409);
      const lect = await leerConCache(servicio, acceso2, pedido, { maxEdadMs: MAX_LEER_MS });
      if (!lect.ok) return json({ error: lect.error }, lect.estado);
      return json({
        ok: true, tnr: pedido, nombre: cat.nombre, categoria: cat.categoria, rama: cat.rama, ronda: lect.lectura.ronda,
        mesas: lect.lectura.mesas.map(({ mesa, blancas, negras }) => ({ mesa, blancas, negras })),
        datos: { desde: lect.desde, viejo: lect.viejo },
      });
    }

    // «¿Dónde juega?» (la lupa de la página del árbitro): TODAS las categorías del torneo en una sola respuesta, para que el árbitro busque a
    // un atleta por el nombre sin elegir categoría y le diga dónde sentarse. Solo lee y no trae resultados. Es rápido porque sale de la copia
    // compartida (centroamericano_lecturas, que las propias tablets mantienen al día): una sola consulta a la base. Solo las categorías cuya copia
    // tiene más de 2 minutos (o no tienen) se vuelven a leer de chess-results, hasta 6 a la vez y esperando a lo más 12 s; si una no contesta
    // se manda la última copia con `viejo: true`, y si no hay nada, con su `error`. Los de prueba solo ven los de prueba.
    if (cuerpo.action === "todas_mesas") {
      visto();
      if (a.todas_las_mesas === false) return json({ error: "La organización no habilitó «¿Dónde juega?» en tu enlace." }, 403);
      const MAX_TODAS_MS = 120_000;
      const { data: ts } = await delMismoEvento(servicio.from("centroamericano_torneos").select("tnr, nombre, categoria, rama, orden, fuente, pareo_id"))
        .eq("prueba", torneoInfo?.prueba === true).order("orden", { ascending: true }).range(0, 99);
      const cats = (ts ?? []) as { tnr: string; nombre: string; categoria: string; rama: string; fuente?: string; pareo_id?: string | null }[];
      const { data: filasCopia } = await servicio.from("centroamericano_lecturas").select("tnr, ronda, torneo, mesas, leida").in("tnr", cats.map((c) => c.tnr));
      type Copia = { ronda: number; mesas: { mesa: number; blancas: string; negras: string }[]; desde: string; viejo: boolean; error?: string };
      const copias = new Map<string, Copia>();
      for (const f of (filasCopia ?? []) as { tnr: string; ronda: number; mesas: { mesa: number; blancas: string; negras: string }[]; leida: string }[]) {
        if (f.ronda > 0 && new Date(f.leida).getTime() > 86_400_000) copias.set(f.tnr, { ronda: f.ronda, mesas: conRival(f.mesas), desde: f.leida, viejo: Date.now() - new Date(f.leida).getTime() > MAX_TODAS_MS });
      }
      const porLeer = cats.filter((c) => !copias.has(c.tnr) || copias.get(c.tnr)!.viejo);
      const leer1 = async (c: { tnr: string; nombre: string; fuente?: string; pareo_id?: string | null }) => {
        if (c.fuente === "pareo") {
          const lp = await leerPareo(servicio, c.pareo_id, c.tnr, c.nombre);
          if (lp.ok) copias.set(c.tnr, { ronda: lp.lectura.ronda, mesas: lp.lectura.mesas, desde: lp.desde, viejo: false });
          else if (!copias.has(c.tnr)) copias.set(c.tnr, { ronda: 0, mesas: [], desde: "", viejo: true, error: lp.error });
          return;
        }
        const { data: acc2 } = await servicio.rpc("centroamericano_acceso", { p_tnr: c.tnr });
        const acceso2 = (Array.isArray(acc2) ? acc2[0] : acc2) as { acceso: string; sid: string } | null;
        if (!acceso2) { if (!copias.has(c.tnr)) copias.set(c.tnr, { ronda: 0, mesas: [], desde: "", viejo: true, error: "Todavía no tiene la clave cargada." }); return; }
        const r = await leerConCache(servicio, acceso2, c.tnr, { maxEdadMs: MAX_TODAS_MS });
        if (r.ok) copias.set(c.tnr, { ronda: r.lectura.ronda, mesas: r.lectura.mesas, desde: r.desde, viejo: r.viejo });
        else if (!copias.has(c.tnr)) copias.set(c.tnr, { ronda: 0, mesas: [], desde: "", viejo: true, error: "chess-results no contestó." });
      };
      const refrescar = (async () => {
        for (let i = 0; i < porLeer.length; i += 6) await Promise.all(porLeer.slice(i, i + 6).map((c) => leer1(c).catch(() => {})));
      })();
      await Promise.race([refrescar, new Promise((ok) => setTimeout(ok, 12_000))]);
      // Las banderitas: la lista de inscritos de cada categoría (en memoria; la que no alcance a leerse en 3 s sale sin banderas).
      const fedsPor = new Map<string, Map<string, string>>();
      await Promise.race([Promise.all(cats.map(async (c) => { fedsPor.set(c.tnr, await fedsDe(c.tnr, 3000).catch(() => new Map<string, string>())); })), new Promise((ok) => setTimeout(ok, 3_000))]);
      return json({
        ok: true, actual: a.tnr, generado: new Date().toISOString(),
        categorias: cats.map((c) => {
          const k = copias.get(c.tnr);
          const fd = fedsPor.get(c.tnr);
          return { tnr: c.tnr, nombre: c.nombre, categoria: c.categoria, rama: c.rama, ronda: k?.ronda ?? 0, desde: k?.desde || null, viejo: k?.viejo ?? true, error: k?.error ?? (k ? null : "Todavía sin lectura."),
            mesas: (k?.mesas ?? []).map(({ mesa, blancas, negras }) => ({ mesa, blancas, negras, fed_b: fedDe(fd, blancas), fed_n: fedDe(fd, negras) })) };
        }),
      });
    }

    // «Mis pareos» (el logo y la «Ronda abierta» de la página del árbitro): los pareos de SUS mesas —las de este enlace y las de sus otros
    // enlaces, dentro del rango de cada uno; nada de las demás mesas ni categorías— de todas las rondas, con el resultado COMPLETO.
    // La ronda abierta sale de la copia compartida de chess-results (centroamericano_lecturas: la que sus propios guardados ponen al día);
    // las anteriores, de lo que guarda el sorteo de Fair Play (centroamericano_fp_partidas). Esa copia solo se pone al día cuando alguien
    // abre Fair Play, así que se queda corta (resultados en blanco, rondas que faltan): lo que falta o está incompleto se pide a la página
    // PÚBLICA de pareos de chess-results (sin clave, solo de los torneos de este árbitro) y se deja guardado en fp_partidas para el
    // próximo pedido. Hay topes: a lo más 12 páginas por pedido (4 a la vez, esperando 11 s) y una ronda no se vuelve a pedir antes de 2 min.
    // Una ronda que no se pudo leer sale con lo último que había. No escribe nada más. El enlace concluido también puede verlo.
    if (cuerpo.action === "mis_pareos") {
      visto();
      // Con Pareo Integral: todas las rondas del torneo publicado, sin chess-results.
      if (esPareo) {
      const l = await leerPareoFresco();
      if (!l.ok) return json({ error: l.error }, l.estado);
      const RES: Record<string, string> = { "0": "", "1": "1-0", "2": "½-½", "3": "0-1", "4": "1-0 (inc.)", "5": "0-1 (inc.)", "6": "0-0 (inc.)" };
      const dentro = (m: number) => m >= a.mesa_desde && m <= a.mesa_hasta;
      const abierta = l.lectura.rondas.length;
      return json({
        ok: true, generado: new Date().toISOString(),
        torneos: [{
          tnr: a.tnr, nombre: torneoInfo?.nombre ?? "", categoria: torneoInfo?.categoria ?? "", rama: torneoInfo?.rama ?? "", desde: a.mesa_desde, hasta: a.mesa_hasta,
          abierta, leida: l.desde,
          rondas: l.lectura.rondas.map((mesas, i) => ({ ronda: i + 1, vivo: i + 1 === abierta, mesas: mesas.filter((m) => dentro(m.mesa)).map((m) => ({
            mesa: m.mesa, blancas: m.blancas, negras: m.negras, resultado: RES[m.valor] ?? "", fed_b: fedDe(l.lectura.feds, m.blancas), fed_n: fedDe(l.lectura.feds, m.negras) })) })).filter((r) => r.mesas.length),
        }],
      });
      }
      const MAX_PAGINAS = 12, REVISAR_MS = 120_000, COPIA_VIEJA_MS = 180_000;
      const enlaces = [{ tnr: a.tnr, desde: a.mesa_desde, hasta: a.mesa_hasta }, ...hermanasFilas.map((x) => ({ tnr: x.tnr, desde: x.mesa_desde, hasta: x.mesa_hasta }))];
      const tnrs = [...new Set(enlaces.map((e) => e.tnr))];
      const fedsPor = new Map<string, Map<string, string>>();
      const lasFeds = Promise.race([Promise.all(tnrs.map(async (t) => { fedsPor.set(t, await fedsDe(t, 3000).catch(() => new Map<string, string>())); })), new Promise((ok) => setTimeout(ok, 3_000))]);
      const [{ data: ts }, { data: copias }, { data: guardados }] = await Promise.all([
        servicio.from("centroamericano_torneos").select("tnr, nombre, categoria, rama").in("tnr", tnrs),
        servicio.from("centroamericano_lecturas").select("tnr, ronda, mesas, leida").in("tnr", tnrs),
        servicio.from("centroamericano_fp_partidas").select("tnr, ronda, mesa, snr_b, snr_n, blancas, negras, elo_b, elo_n, resultado, leida").in("tnr", tnrs).range(0, 4999),
      ]);
      type Guardada = { tnr: string; ronda: number; mesa: number; snr_b?: number | null; snr_n?: number | null; blancas: string; negras: string; elo_b?: number | null; elo_n?: number | null; resultado: string; leida?: string };
      type Copia = { tnr: string; ronda: number; mesas: { mesa: number; blancas: string; negras: string; valor: string }[]; leida: string };
      const filas = new Map<string, Guardada>();
      for (const g of (guardados ?? []) as Guardada[]) filas.set(g.tnr + "|" + g.ronda + "|" + g.mesa, g);
      const copiaDe = (tnr: string) => ((copias ?? []) as Copia[]).find((x) => x.tnr === tnr && x.ronda > 0);
      const enMisMesas = (tnr: string, mesa: number) => enlaces.some((e) => e.tnr === tnr && mesa >= e.desde && mesa <= e.hasta);
      const ahora = Date.now();

      // Qué rondas hay que pedirle a chess-results: las que no están, las que tienen una partida sin resultado y la abierta si su copia es vieja.
      const pedidos: { tnr: string; ronda: number; abierta: boolean }[] = [];
      for (const tnr of tnrs) {
        const copia = copiaDe(tnr);
        const deTnr = [...filas.values()].filter((f) => f.tnr === tnr);
        const abierta = copia?.ronda ?? Math.max(0, ...deTnr.map((f) => f.ronda));
        for (let n = 1; n <= abierta; n++) {
          const deEsa = deTnr.filter((f) => f.ronda === n);
          const hace = deEsa.length ? ahora - Math.max(...deEsa.map((f) => Date.parse(f.leida ?? "") || 0)) : Infinity;
          const esAbierta = n === abierta && !!copia;
          const falta = esAbierta ? ahora - Date.parse(copia!.leida) > COPIA_VIEJA_MS : !deEsa.length || deEsa.some((f) => enMisMesas(tnr, f.mesa) && f.negras && !f.resultado);
          if (falta && hace > REVISAR_MS) pedidos.push({ tnr, ronda: n, abierta: esAbierta });
        }
      }
      pedidos.sort((x, y) => Number(y.abierta) - Number(x.abierta) || y.ronda - x.ronda);
      const cola = pedidos.slice(0, MAX_PAGINAS);
      const frescas = new Set<string>();   // «tnr|ronda» leídas ahora de chess-results
      let sig = 0;
      const traer = async () => {
        while (sig < cola.length) {
          const p = cola[sig++];
          try {
            const leida = new Date().toISOString();
            const nuevas = (await pareosPublicos(p.tnr, p.ronda, 8000)).map((x) => ({ tnr: p.tnr, ronda: p.ronda, mesa: x.mesa, snr_b: x.snr_b, snr_n: x.snr_n, blancas: x.blancas, negras: x.negras, elo_b: x.elo_b, elo_n: x.elo_n, resultado: x.resultado, leida }));
            if (!nuevas.length) continue;
            const { error } = await servicio.from("centroamericano_fp_partidas").upsert(nuevas, { onConflict: "tnr,ronda,mesa" });
            if (error) { console.error("centroamericano-mesa: mis_pareos guardar", p.tnr, p.ronda, error.code); continue; }
            for (const f of nuevas) filas.set(f.tnr + "|" + f.ronda + "|" + f.mesa, f);
            frescas.add(p.tnr + "|" + p.ronda);
          } catch (e) { console.error("centroamericano-mesa: mis_pareos leer", p.tnr, p.ronda, e instanceof Error ? e.message : String(e)); }
        }
      };
      if (cola.length) await Promise.race([Promise.all([traer(), traer(), traer(), traer()]), new Promise((ok) => setTimeout(ok, 11_000))]);

      // El valor del desplegable de chess-results, dicho como en el pareo publicado.
      const RESULTADO_VIVO: Record<string, string> = { "0": "", "1": "1-0", "2": "½-½", "3": "0-1", "4": "1-0 (inc.)", "5": "0-1 (inc.)", "6": "0-0 (inc.)" };
      const limpio = (r: string) => String(r ?? "").replace(/\s*-\s*/g, "-").trim();
      await lasFeds;   // las banderitas ya iban leyéndose mientras se pedían las rondas
      return json({
        ok: true, generado: new Date().toISOString(),
        torneos: enlaces.map((e) => {
          const t = ((ts ?? []) as { tnr: string; nombre: string; categoria: string; rama: string }[]).find((x) => x.tnr === e.tnr);
          const copia = copiaDe(e.tnr);
          const dentro = (m: number) => m >= e.desde && m <= e.hasta;
          const porRonda = new Map<number, { mesa: number; blancas: string; negras: string; resultado: string }[]>();
          for (const g of filas.values()) {
            if (g.tnr !== e.tnr || !dentro(g.mesa)) continue;
            if (sinRival(g.blancas) || sinRival(g.negras)) continue;   // sin rival (retirado, bye…) no es una partida
            if (!porRonda.has(g.ronda)) porRonda.set(g.ronda, []);
            porRonda.get(g.ronda)!.push({ mesa: g.mesa, blancas: g.blancas, negras: g.negras, resultado: limpio(g.resultado) });
          }
          // La ronda abierta, de la copia compartida (más fresca que lo guardado por Fair Play), salvo que ya se haya leído de chess-results ahora.
          // Una ronda ya terminada (la última) no trae mesas en la copia compartida: ahí manda lo leído de chess-results.
          const delCopia = copia ? conRival(copia.mesas).filter((m) => dentro(m.mesa)) : [];
          if (copia && delCopia.length && !frescas.has(e.tnr + "|" + copia.ronda)) porRonda.set(copia.ronda, delCopia.map((m) => ({ mesa: m.mesa, blancas: m.blancas, negras: m.negras, resultado: RESULTADO_VIVO[m.valor] ?? "" })));
          const abierta = copia?.ronda ?? Math.max(0, ...porRonda.keys());
          return {
            tnr: e.tnr, nombre: t?.nombre ?? e.tnr, categoria: t?.categoria ?? "", rama: t?.rama ?? "", desde: e.desde, hasta: e.hasta,
            abierta, leida: copia?.leida ?? null,
            rondas: [...porRonda.entries()].sort((x, y) => x[0] - y[0]).map(([ronda, mesas]) => ({ ronda, vivo: ronda === abierta, mesas: mesas.sort((x, y) => x.mesa - y.mesa).map((m) => ({ ...m, fed_b: fedDe(fedsPor.get(e.tnr), m.blancas), fed_n: fedDe(fedsPor.get(e.tnr), m.negras) })) })),
          };
        }),
      });
    }

    // «Modo concentración»: la tablet avisa cuándo el árbitro se sale de la pantalla (fase «sale») y cuándo vuelve (fase «vuelve»). Solo
    // se anota (la organización lo ve): lo que tapa la pantalla es la página. La hora y la duración las pone ESTA función con su reloj, no
    // la tablet. Si el aviso de «sale» no llegó (sin señal), «vuelve» anota la salida con los segundos que midió la tablet.
    if (cuerpo.action === "salida") {
      visto();
      if (a.concluyo_en) return json({ ok: true });
      const fase = String(cuerpo.fase ?? "");
      const motivo = ["oculta", "pantalla_completa", "sin_foco"].includes(String(cuerpo.motivo)) ? String(cuerpo.motivo) : "oculta";
      const ahora = Date.now();
      const { data: abierta } = await servicio.from("centroamericano_salidas").select("id, salio").eq("asignacion_id", a.id).is("volvio", null)
        .gt("salio", new Date(ahora - 6 * 3600_000).toISOString()).order("salio", { ascending: false }).limit(1);
      if (fase === "sale") {
        if (abierta && abierta.length) return json({ ok: true, ya: true });
        // Un tope por si una tablet se sale sin parar: pasadas 400 en el día, ya no se anotan más.
        const { count } = await servicio.from("centroamericano_salidas").select("id", { count: "exact", head: true }).eq("asignacion_id", a.id).gt("salio", new Date(ahora - 24 * 3600_000).toISOString());
        if ((count ?? 0) >= 400) return json({ ok: true, tope: true });
        const { error } = await servicio.from("centroamericano_salidas").insert({ asignacion_id: a.id, tnr: a.tnr, arbitro: a.arbitro, motivo });
        if (error) { console.error("centroamericano-mesa: salida", a.tnr, error.code); return json({ error: "No se pudo anotar. Intenta de nuevo." }, 500); }
        return json({ ok: true });
      }
      if (fase === "vuelve") {
        if (abierta && abierta.length) {
          const seg = Math.min(86400, Math.max(0, Math.round((ahora - new Date(abierta[0].salio).getTime()) / 1000)));
          const { error } = await servicio.from("centroamericano_salidas").update({ volvio: new Date(ahora).toISOString(), segundos: seg }).eq("id", abierta[0].id).is("volvio", null);
          if (error) { console.error("centroamericano-mesa: salida vuelve", a.tnr, error.code); return json({ error: "No se pudo anotar. Intenta de nuevo." }, 500); }
          return json({ ok: true, segundos: seg });
        }
        const seg = Math.min(86400, Math.max(0, Math.round(Number(cuerpo.segundos) || 0)));
        if (seg < 1) return json({ ok: true });
        const { error } = await servicio.from("centroamericano_salidas").insert({ asignacion_id: a.id, tnr: a.tnr, arbitro: a.arbitro, motivo, salio: new Date(ahora - seg * 1000).toISOString(), volvio: new Date(ahora).toISOString(), segundos: seg });
        if (error) { console.error("centroamericano-mesa: salida tarde", a.tnr, error.code); return json({ error: "No se pudo anotar. Intenta de nuevo." }, 500); }
        return json({ ok: true, segundos: seg });
      }
      return json({ error: "Fase no válida." }, 400);
    }

    if (cuerpo.action === "avisos") {
      visto();
      return json({ ok: true, concluyo: a.concluyo_en ?? null, ...(await avisosDe()) });
    }

    // «Ya terminé mis labores»: cierra el enlace (y los otros del mismo árbitro). Es idempotente: tocarlo otra vez no cambia la hora.
    if (cuerpo.action === "concluir") {
      if (a.concluyo_en) return json({ ok: true, ya: true, concluyo: a.concluyo_en });
      const ahora = new Date().toISOString();
      let q = servicio.from("centroamericano_asignaciones").update({ concluyo_en: ahora }).is("concluyo_en", null);
      q = a.persona ? q.eq("persona", a.persona) : q.eq("id", a.id);
      const { error } = await q;
      if (error) { console.error("centroamericano-mesa: concluir", a.tnr, error.code); return json({ error: "No se pudo concluir. Intenta de nuevo." }, 500); }
      return json({ ok: true, concluyo: ahora });
    }

    // Toda su bitácora, para el PDF (solo después de concluir): lo de SUS enlaces, de todas las rondas y de todos los torneos que atendió.
    if (cuerpo.action === "bitacora") {
      if (!a.concluyo_en) return json({ error: "La bitácora se baja cuando concluyes tus labores («Ya terminé mis labores»)." }, 409);
      let qa = servicio.from("centroamericano_asignaciones").select("id, tnr, arbitro, mesa_desde, mesa_hasta, creada, vence, concluyo_en");
      qa = a.persona ? qa.eq("persona", a.persona) : qa.eq("id", a.id);
      const { data: asigs } = await qa;
      const ids = (asigs ?? []).map((x: { id: string }) => x.id);
      // PostgREST corta a ~1000 filas: se pide de mil en mil.
      // deno-lint-ignore no-explicit-any
      const todo = async (tabla: string, columnas: string, orden: string): Promise<any[]> => {
        // deno-lint-ignore no-explicit-any
        const out: any[] = [];
        for (let i = 0; i < 5000; i += 1000) {
          const { data } = await servicio.from(tabla).select(columnas).in("asignacion_id", ids).order(orden, { ascending: true }).range(i, i + 999);
          out.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
        return out;
      };
      const [registro, tiempos, presencia, planillas, finales, listas, avisos, salidas] = await Promise.all([
        todo("centroamericano_registro", COLUMNAS + ", tnr, ronda, asignacion_id", "ocurrio"),
        todo("centroamericano_tiempos", "id, ocurrio, tnr, ronda, mesa, blancas, negras, j_blancas, j_negras, t_blancas, t_negras, asignacion_id", "ocurrio"),
        todo("centroamericano_presencia", "tnr, ronda, mesa, color, jugador, presente, marcada, asignacion_id", "marcada"),
        todo("centroamericano_planillas", "tnr, ronda, mesa, jugador, rival, subida, drive_ok, asignacion_id", "subida"),
        todo("centroamericano_finales", "ronda, finalizada_en, reabierta, asignacion_id", "finalizada_en"),
        todo("centroamericano_listas", "ronda, paso, aprobada_en, asignacion_id", "aprobada_en"),
        todo("centroamericano_avisos", "de, tipo, mesa, texto, estado, creado, atendido_en, leido_en, ronda, asignacion_id", "creado"),
        todo("centroamericano_salidas", "tnr, salio, volvio, segundos, motivo, asignacion_id", "salio"),
      ]);
      const tnrs = [...new Set((asigs ?? []).map((x: { tnr: string }) => x.tnr))];
      const { data: torneos } = await servicio.from("centroamericano_torneos").select("tnr, nombre, categoria, rama").in("tnr", tnrs);
      // La hora a la que empezó cada ronda en sus categorías (la marcó el árbitro de la categoría, que puede ser otro).
      const { data: inicios } = await servicio.from("centroamericano_inicios_torneo").select("tnr, ronda, inicio, arbitro").in("tnr", tnrs).order("inicio", { ascending: true });
      return json({
        ok: true, arbitro: a.arbitro, concluyo: a.concluyo_en, generado: new Date().toISOString(),
        asignaciones: asigs ?? [], torneos: torneos ?? [], inicios: inicios ?? [], registro, tiempos, presencia, planillas, finales, listas, salidas,
        avisos: avisos.filter((x) => x.tipo === "ayuda" || x.tipo === "termino" || x.tipo === "finalizo" || x.leido_en),
      });
    }

    // «Mandarme la bitácora por correo»: solo después de concluir. El PDF lo armó la página (con la marca de agua); acá se comprueba que
    // sea un PDF de tamaño razonable y se manda con un texto fijo A LA DIRECCIÓN QUE EL ÁRBITRO PUSO (no se guarda). Tope por enlace.
    if (cuerpo.action === "bitacora_correo") {
      if (!a.concluyo_en) return json({ error: "La bitácora se manda cuando concluyes tus labores («Ya terminé mis labores»)." }, 409);
      const correo = String(cuerpo.correo ?? "").trim().toLowerCase();
      if (correo.length > 120 || !CORREO_VALIDO.test(correo)) return json({ error: "Escribe un correo válido." }, 400);
      const b64 = String(cuerpo.pdf ?? "");
      if (!/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length > MAX_PDF_BYTES * 1.4) return json({ error: "El documento no es válido o es demasiado grande." }, 413);
      const bytes = deBase64(b64);
      const cabeza = String.fromCharCode(...bytes.subarray(0, 5));
      if (bytes.length < 500 || bytes.length > MAX_PDF_BYTES || cabeza !== "%PDF-") return json({ error: "El documento no es un PDF válido." }, 400);
      // Topes: 2 envíos por enlace y uno por minuto (contados en la base; el correo no se guarda).
      const { data: previos } = await servicio.from("centroamericano_correos_bitacora").select("enviado_en").eq("asignacion_id", a.id).order("enviado_en", { ascending: false }).limit(10);
      if ((previos ?? []).length >= MAX_CORREOS_POR_ENLACE) return json({ error: "Ya mandaste tu bitácora dos veces. Si necesitas otra copia, descárgala desde aquí o pídesela a la organización." }, 429);
      if (previos && previos[0] && Date.now() - new Date(previos[0].enviado_en).getTime() < 60_000) return json({ error: "Espera un minuto antes de pedirla otra vez." }, 429);
      const apiKey = Deno.env.get("RESEND_API_KEY");
      if (!apiKey) { console.error("centroamericano-mesa: falta RESEND_API_KEY"); return json({ error: "El correo no está configurado. Descarga tu bitácora desde aquí." }, 503); }
      const nombre = String(a.arbitro).replace(/[<>&"]/g, "").slice(0, 80);
      const nombreArchivo = "bitacora-arbitro-centroamericano-2026.pdf";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: DE_CORREO, to: [correo], reply_to: RESPONDER_A,
          subject: "Tu bitácora del Centroamericano 2026",
          html: "<p>Hola, " + nombre + ".</p><p>Te mandamos adjunta tu bitácora como árbitro del Centroamericano 2026: los torneos que atendiste, ronda por ronda, con todo lo que anotaste. Es el mismo documento que puedes descargar desde tu enlace.</p><p>Si no la pediste, puedes ignorar este correo.</p><p>Ajedrez Integral</p>",
          attachments: [{ filename: nombreArchivo, content: b64 }],
        }),
      });
      if (!res.ok) { console.error("centroamericano-mesa: correo", a.tnr, res.status); return json({ error: "No se pudo mandar el correo. Descarga tu bitácora desde aquí." }, 502); }
      // Solo se cuenta el envío (sin el correo ni el documento).
      await servicio.from("centroamericano_correos_bitacora").insert({ asignacion_id: a.id });
      return json({ ok: true });
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
