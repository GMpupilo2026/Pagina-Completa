// La lectura de chess-results COMPARTIDA entre los árbitros del Centroamericano.
//
// POR QUÉ: cada lectura de chess-results son unas 4 visitas (entrar, elegir el torneo, recargar). Con
// 15 a 20 tablets cada una preguntando por su cuenta, el torneo le habría pegado a chess-results
// varias veces por segundo durante horas, justo cuando más se necesita que conteste. Y si chess-results
// se pone lento o se cae, el árbitro no podía ni ver sus mesas.
//
// QUÉ HACE `leerConCache`:
//   1. Si la copia guardada del torneo es reciente (`maxEdadMs`), la usa. Cero visitas.
//   2. Si no, UNA sola función por torneo toma el «turno» (`leyendo_hasta`, un compare-and-set en la
//      base) y lee chess-results; las demás esperan unos segundos y usan lo que esa dejó.
//   3. Si leer falla (chess-results caído, lento, clave rechazada) y hay una copia de hace menos de
//      30 minutos, se sirve ESA y se marca `viejo`: el árbitro sigue trabajando y la pantalla le
//      dice de cuándo son los datos. Sin copia, el error se devuelve tal cual.
//   `fresca: true` (finalizar la ronda) se salta el paso 1 y el turno, pero también cae a la copia si
//   chess-results no contesta, y cuando lee, deja la copia al día.
//
// Guardar un resultado NO usa esto para decidir (lee en fresco en `guardarYComprobar`); después de
// guardar llama a `ponerLectura` con lo que se leyó de vuelta, para que la copia no se quede con el
// resultado de antes y la tablet no vea «sin resultado» durante un rato.
//
// Se copia a cada función al armarla (herramientas/funciones-armar.js).

import { leerRonda, type Pantalla } from "./chess-results-ingreso.ts";

export type Mesa = { mesa: number; blancas: string; negras: string; valor: string };
export type Lectura = { ronda: number; torneo: string; mesas: Mesa[] };
export type Resultado =
  | { ok: true; lectura: Lectura; desde: string; viejo: boolean; motivo?: string }
  | { ok: false; estado: number; error: string };

const TABLA = "centroamericano_lecturas";
export const TURNO_MS = 25_000;        // lo que dura el «turno» de leer si quien lo tomó se cae
export const ESPERA_MS = 9_000;        // lo que espera quien no tiene el turno, mirando si ya hay lectura nueva
export const VIEJA_MAX_MS = 30 * 60_000; // hasta cuándo una copia sirve de respaldo si chess-results no contesta

export const aLectura = (p: Pantalla): Lectura => ({
  ronda: p.ronda, torneo: p.torneo,
  mesas: p.mesas.map(({ mesa, blancas, negras, valor }) => ({ mesa, blancas, negras, valor })),
});
const edad = (iso: string | null | undefined) => (iso ? Date.now() - new Date(iso).getTime() : Infinity);
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

// deno-lint-ignore no-explicit-any
type Servicio = any;

async function fila(servicio: Servicio, tnr: string) {
  const { data } = await servicio.from(TABLA).select("tnr, ronda, torneo, mesas, leida, leyendo_hasta").eq("tnr", tnr).maybeSingle();
  return data as { tnr: string; ronda: number; torneo: string; mesas: Mesa[]; leida: string; leyendo_hasta: string | null } | null;
}
const deFila = (f: NonNullable<Awaited<ReturnType<typeof fila>>>): Lectura => ({ ronda: f.ronda, torneo: f.torneo, mesas: f.mesas });
// Una fila recién creada tiene «leida» en 1970 y ronda 0: eso no es una lectura.
const hayLectura = (f: Awaited<ReturnType<typeof fila>>) => !!f && f.ronda > 0 && new Date(f.leida).getTime() > 86_400_000;

// Deja en la copia lo que se leyó (de chess-results o de vuelta de un guardado).
export async function ponerLectura(servicio: Servicio, tnr: string, l: Lectura) {
  const { error } = await servicio.from(TABLA).upsert(
    { tnr, ronda: l.ronda, torneo: l.torneo.slice(0, 200), mesas: l.mesas.map(({ mesa, blancas, negras, valor }) => ({ mesa, blancas, negras, valor })), leida: new Date().toISOString(), leyendo_hasta: null },
    { onConflict: "tnr" });
  if (error) console.error("lecturas-cache: no se pudo guardar", tnr, error.code);
}

export async function leerConCache(
  servicio: Servicio,
  acceso: { acceso: string; sid: string },
  tnr: string,
  // `leer` solo se cambia en las pruebas (verificar-lecturas-cache.js); en la función real es leerRonda.
  opciones: { maxEdadMs: number; fresca?: boolean; leer?: typeof leerRonda },
): Promise<Resultado> {
  const inicio = Date.now();
  let f = await fila(servicio, tnr);
  if (!opciones.fresca && hayLectura(f) && edad(f!.leida) <= opciones.maxEdadMs) {
    return { ok: true, lectura: deFila(f!), desde: f!.leida, viejo: false };
  }

  // La copia vieja, si sirve de respaldo.
  const respaldo = (motivo: string): Resultado | null =>
    hayLectura(f) && edad(f!.leida) <= VIEJA_MAX_MS ? { ok: true, lectura: deFila(f!), desde: f!.leida, viejo: true, motivo } : null;

  // El «turno» de leer: uno solo por torneo a la vez.
  let lider = !!opciones.fresca;
  if (!lider) {
    if (!f) { await servicio.from(TABLA).upsert({ tnr }, { onConflict: "tnr", ignoreDuplicates: true }); }
    const ahora = new Date().toISOString();
    const { data: tomado } = await servicio.from(TABLA).update({ leyendo_hasta: new Date(Date.now() + TURNO_MS).toISOString() })
      .eq("tnr", tnr).or("leyendo_hasta.is.null,leyendo_hasta.lt." + ahora).select("tnr");
    lider = !!(tomado && tomado.length);
  }

  if (!lider) {
    // Otra función está leyendo este torneo: se espera su resultado en vez de hacer más visitas.
    while (Date.now() - inicio < ESPERA_MS) {
      await pausa(600);
      f = await fila(servicio, tnr);
      if (hayLectura(f) && new Date(f!.leida).getTime() >= inicio - 500) return { ok: true, lectura: deFila(f!), desde: f!.leida, viejo: false };
    }
    const r = respaldo("chess-results tardó en contestar");
    if (r) return r;
    lider = true; // sin nada que mostrar y sin respuesta de la otra: se lee por cuenta propia
  }

  let leida;
  try {
    leida = await (opciones.leer ?? leerRonda)(acceso.acceso, acceso.sid, tnr);
  } catch (e) {
    leida = { estado: 502, error: "No se pudo hablar con chess-results: " + (e instanceof Error ? e.message : String(e)) } as const;
  }
  if ("error" in leida) {
    await servicio.from(TABLA).update({ leyendo_hasta: null }).eq("tnr", tnr);
    const r = respaldo(leida.error);
    return r ?? { ok: false, estado: leida.estado, error: leida.error };
  }
  const lectura = aLectura(leida.pantalla);
  await ponerLectura(servicio, tnr, lectura);
  return { ok: true, lectura, desde: new Date().toISOString(), viejo: false };
}
