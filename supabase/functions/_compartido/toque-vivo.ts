// Un «toque» por Realtime Broadcast, desde una Edge Function: avisa a quien
// escucha un canal que algo cambió, SIN mandar el dato (el que escucha lo
// vuelve a leer por su vía de siempre, con sus permisos de siempre).
//
// Lo usan:
//  - centroamericano-mesa: al dejar un resultado de la Mesa del árbitro en
//    pareo_cola, toca `pareo-cola-<id del torneo publicado>` y el Pareo del
//    árbitro principal lee la cola en el momento (sin esperar su vuelta de
//    15 segundos).
//  - pareo-publicar: al poner al día un torneo publicado, toca
//    `pareo-publico-<id>` y torneos-pareo.html lo vuelve a leer en el momento
//    (sin esperar su vuelta de cada minuto).
//
// Broadcast y no postgres_changes: Realtime no revisa la RLS de cada cambio
// una vez por cada persona que escucha (ver «Realtime escucha solo lo que la
// pantalla muestra»). Los canales son públicos: cualquiera podría mandar un
// toque falso, y lo único que lograría es una relectura; por eso quien
// escucha junta los toques (como mucho una relectura cada pocos segundos) y
// el toque no lleva nada que se crea.
//
// Usa la API REST de Realtime (no hace falta suscribirse para mandar). Si
// falla, no pasa nada: las vueltas de siempre siguen leyendo. Nunca tira.
// Ver «El resultado de la mesa, al público al instante» en
// docs/decisiones/juegos-y-torneos.md.

export async function tocar(url: string, claveServicio: string, canal: string, evento: string): Promise<boolean> {
  try {
    const r = await fetch(url.replace(/\/+$/, "") + "/realtime/v1/api/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: claveServicio, Authorization: "Bearer " + claveServicio },
      body: JSON.stringify({ messages: [{ topic: canal, event: evento, payload: {} }] }),
      signal: AbortSignal.timeout(4000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
