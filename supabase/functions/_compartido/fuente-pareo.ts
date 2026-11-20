// Los torneos de la Mesa del árbitro que salen de PAREO INTEGRAL, no de chess-results
// (ver «La Mesa del árbitro con torneos de Pareo Integral» en docs/decisiones/juegos-y-torneos.md).
//
// Un torneo con `fuente = 'pareo'` (centroamericano_torneos.pareo_id) es un torneo publicado
// (pareo_publicados.datos). Aquí se arma con él la MISMA lectura que da chess-results
// (`Lectura` de lecturas-cache.ts), así la tablet y casi todas las acciones de centroamericano-mesa no
// cambian. Lo que el árbitro anota NO se escribe aquí: va a pareo_cola y lo acepta el Pareo del
// árbitro principal con sus reglas (recibirDeAdjunto).
//
// LAS MESAS SON LAS FÍSICAS: la mesa i (desde 0) de la ronda es la mesaInicial + i, como
// `mesaFisica` de js/pareo/evento.js (en una sala con varias categorías cada torneo empieza donde
// terminó el anterior). Los rangos de los enlaces, la tablet y el registro hablan de la mesa física;
// solo al escribir en la cola se pasa al índice de Pareo (`indiceDe`), que es lo que entiende
// recibirDeAdjunto (`R.mesas[mesa - 1]`).
//
// Sin nada de Deno al cargarse: verificar-mesa-pareo-fuente.js lo prueba con node.
// Se copia a cada función al armarla (herramientas/funciones-armar.js).

import { type Lectura, type Mesa, ponerLectura } from "./lecturas-cache.ts";
import { claveNombre, conRival } from "./inscritos-fed.ts";

// Los resultados de Pareo en el código del desplegable de chess-results (el que usa la tablet), y al
// revés. Iguales a DE_PAREO de js/mesa-arbitro.js (el verificador lo comprueba).
export const DE_PAREO: Record<string, string> = { "1-0": "1", "=": "2", "0-1": "3", "+-": "4", "-+": "5", "--": "6" };
export const A_PAREO: Record<string, string> = Object.fromEntries(Object.entries(DE_PAREO).map(([k, v]) => [v, k]));
// El artículo de una irregularidad, en la clave corta de Pareo. Igual a js/mesa-arbitro-pareo.js.
export const ARTICULO_PAREO: Record<string, string> = { "4.3": "tocar", "11.3.2": "celular", "11.5": "molestar", "6.7": "tarde" };

export const esTnrPareo = (tnr: string) => /^p[0-9a-f]{32}$/.test(tnr);

type Obj = Record<string, unknown>;
type Jugador = { id?: unknown; nombre?: unknown; fed?: unknown };
type MesaPareo = { b?: unknown; n?: unknown; r?: unknown };
export type DatosPareo = { jugadores?: Jugador[]; rondas?: { mesas?: MesaPareo[] }[]; mesaInicial?: unknown; tipo?: unknown };

// La primera mesa física del torneo.
export const baseDe = (d: DatosPareo | null | undefined) => {
  const n = Number(d && d.mesaInicial);
  return n > 1 ? Math.floor(n) : 1;
};
// Mesa física → índice de Pareo (desde 1), y al revés.
export const indiceDe = (d: DatosPareo | null | undefined, fisica: number) => fisica - baseDe(d) + 1;
export const fisicaDe = (d: DatosPareo | null | undefined, indice: number) => indice + baseDe(d) - 1;

export type LecturaPareo = Lectura & {
  // El índice de Pareo de cada mesa física que se sirve (la cola lo necesita).
  indices: Record<number, number>;
  // La federación de cada jugador (por claveNombre), para las banderas.
  feds: Map<string, string>;
  // Todas las rondas, para «Mis pareos».
  rondas: Mesa[][];
};

function mesasDe(d: DatosPareo, mesas: MesaPareo[]): { mesas: Mesa[]; indices: Record<number, number> } {
  const porId = new Map<string, Jugador>();
  for (const j of d.jugadores || []) porId.set(String(j.id), j);
  const nombre = (id: unknown) => {
    const j = id == null ? null : porId.get(String(id));
    return j && typeof j.nombre === "string" ? j.nombre.trim().slice(0, 120) : "";
  };
  const base = baseDe(d), indices: Record<number, number> = {};
  const todas = mesas.map((m, i) => {
    indices[base + i] = i + 1;
    return { mesa: base + i, blancas: nombre(m.b), negras: m.n == null ? "" : nombre(m.n), valor: (typeof m.r === "string" && DE_PAREO[m.r]) || "0" };
  });
  // Un bye (n vacío) no es una partida: no se sirve, como en chess-results.
  return { mesas: conRival(todas.filter((m) => m.blancas && m.negras)), indices };
}

// La ronda en juego del torneo publicado (la última). Sin ronda emparejada: ronda 0 y sin mesas
// (la tablet dice «todavía no hay ronda emparejada»).
export function lecturaDePareo(datos: unknown, nombreTorneo: string): LecturaPareo | null {
  if (typeof datos !== "object" || datos === null) return null;
  const d = datos as DatosPareo;
  if (d.tipo === "equipos") return null;
  const rondas = Array.isArray(d.rondas) ? d.rondas : [];
  const feds = new Map<string, string>();
  for (const j of d.jugadores || []) {
    if (typeof j.nombre === "string" && typeof j.fed === "string" && /^[A-Z]{3}$/.test(j.fed)) feds.set(claveNombre(j.nombre), j.fed);
  }
  const todas = rondas.map((R) => mesasDe(d, Array.isArray(R && R.mesas) ? R.mesas! : []));
  const ultima = todas[todas.length - 1];
  return {
    ronda: ultima && ultima.mesas.length ? rondas.length : 0,
    torneo: String(nombreTorneo || "").slice(0, 200),
    mesas: ultima ? ultima.mesas : [],
    indices: ultima ? ultima.indices : {},
    feds,
    rondas: todas.map((x) => x.mesas),
  };
}

// Los resultados de Pareo como los escribe chess-results en sus emparejamientos (lo que lee Fair Play:
// resultadoDe de centroamericano-fair-play/analisis.ts y las cuentas de centroamericano_fp_candidatas).
export const TEXTO_PAREO: Record<string, string> = { "1-0": "1 - 0", "=": "½ - ½", "0-1": "0 - 1", "+-": "+ - -", "-+": "- - +", "--": "- - -" };

export type PartidaPareo = { ronda: number; mesa: number; snr_b: number | null; snr_n: number | null; blancas: string; negras: string;
  elo_b: number | null; elo_n: number | null; resultado: string };

// Todas las partidas de todas las rondas de un torneo publicado, con la forma de las filas de
// centroamericano_fp_partidas (lo que Fair Play lee de chess-results en un torneo de chess-results).
// La mesa es la FÍSICA (la de los enlaces de los árbitros). El número inicial (snr) es el puesto en
// `numeracion`, que Pareo deja fijo al emparejar la ronda 1; sin él no se inventa (null: Fair Play
// junta por el nombre). El Elo 0 es «sin Elo». Un bye no es una partida.
export function partidasDePareo(datos: unknown): PartidaPareo[] {
  if (typeof datos !== "object" || datos === null) return [];
  const d = datos as DatosPareo & { numeracion?: unknown; jugadores?: (Jugador & { elo?: unknown })[] };
  if (d.tipo === "equipos") return [];
  const porId = new Map<string, Jugador & { elo?: unknown }>();
  for (const j of d.jugadores || []) porId.set(String(j.id), j);
  const snr = new Map<string, number>();
  if (Array.isArray(d.numeracion)) d.numeracion.forEach((id, i) => { if (!snr.has(String(id))) snr.set(String(id), i + 1); });
  const nombre = (id: unknown) => {
    const j = id == null ? null : porId.get(String(id));
    return j && typeof j.nombre === "string" ? j.nombre.trim().slice(0, 120) : "";
  };
  const elo = (id: unknown) => {
    const n = Number(id == null ? 0 : porId.get(String(id))?.elo);
    return Number.isFinite(n) && n >= 100 && n <= 3500 ? Math.round(n) : null;
  };
  const base = baseDe(d), out: PartidaPareo[] = [];
  (Array.isArray(d.rondas) ? d.rondas : []).forEach((R, k) => {
    (Array.isArray(R && R.mesas) ? R.mesas! : []).forEach((m, i) => {
      const blancas = nombre(m.b), negras = m.n == null ? "" : nombre(m.n);
      if (!blancas || !negras) return;
      out.push({
        ronda: k + 1, mesa: base + i,
        snr_b: snr.get(String(m.b)) ?? null, snr_n: snr.get(String(m.n)) ?? null,
        blancas, negras, elo_b: elo(m.b), elo_n: elo(m.n),
        resultado: (typeof m.r === "string" && TEXTO_PAREO[m.r]) || "",
      });
    });
  });
  return out;
}

// deno-lint-ignore no-explicit-any
type Servicio = any;
export type ResultadoPareo =
  | { ok: true; lectura: LecturaPareo; datos: DatosPareo; desde: string; viejo: false }
  | { ok: false; estado: number; error: string };

// Lo que se dejó en centroamericano_lecturas en esta instancia (por tnr): la copia se escribe solo
// cuando el torneo publicado cambió, no en cada lectura de cada tablet.
const copiado = new Map<string, string>();

// Leer la base es barato (no hay que entrar a ninguna página): se lee cada vez. La copia en
// centroamericano_lecturas existe para lo que ya la leía (todas_mesas, hojas, seguir).
export async function leerPareo(servicio: Servicio, pareoId: string | null | undefined, tnr: string, nombreTorneo: string): Promise<ResultadoPareo> {
  if (!pareoId) return { ok: false, estado: 409, error: "El torneo de Pareo Integral ya no está publicado. Avísale al árbitro principal." };
  const { data, error } = await servicio.from("pareo_publicados").select("datos, actualizado").eq("id", pareoId).maybeSingle();
  if (error) return { ok: false, estado: 502, error: "No se pudo leer el torneo de Pareo Integral." };
  if (!data) return { ok: false, estado: 409, error: "El torneo de Pareo Integral ya no está publicado. Avísale al árbitro principal." };
  const lectura = lecturaDePareo(data.datos, nombreTorneo);
  if (!lectura) return { ok: false, estado: 409, error: "Los torneos por equipos todavía no van en la Mesa del árbitro." };
  const actualizado = String(data.actualizado || "");
  if (copiado.get(tnr) !== actualizado && lectura.ronda > 0) {
    copiado.set(tnr, actualizado);
    await ponerLectura(servicio, tnr, lectura);
  }
  return { ok: true, lectura, datos: data.datos as DatosPareo, desde: actualizado || new Date().toISOString(), viejo: false };
}

// Una fila para pareo_cola por la vía de la Mesa: con el enlace, el nombre del árbitro y su rango en
// índices de Pareo. `datos` ya viene limpio (limpiarEnvio de pareo-adjuntos.ts).
export function filaCola(
  a: { id: string; arbitro: string; mesa_desde: number; mesa_hasta: number },
  pareoId: string, d: DatosPareo, evento: "resultado" | "nota", ronda: number, datos: Obj,
) {
  const desde = Math.max(1, indiceDe(d, a.mesa_desde)), hasta = Math.min(999, Math.max(desde, indiceDe(d, a.mesa_hasta)));
  return { publicado_id: pareoId, codigo: null, asignacion_id: a.id, nombre: String(a.arbitro || "").slice(0, 80), desde, hasta, evento, ronda, datos };
}
