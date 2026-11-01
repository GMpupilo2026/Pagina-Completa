// El avance de un árbitro en la ronda abierta del Centroamericano: cuántas mesas de su
// rango ya tienen resultado y cuáles faltan. Lo comparten centroamericano-mesa (cada vez que
// el árbitro lee o guarda) y centroamericano-clave (el resumen que pide la organización).
// Se copia a cada función al armarla (herramientas/funciones-armar.js).
//
// Cuando el árbitro llega a TODAS sus mesas, le avisa a la cuenta principal UNA sola vez por
// ronda (centroamericano_avisos, tipo «termino»; el índice único lo garantiza) para que
// decida a dónde puede ir a ayudar. La sugerencia la arma la página de la organización con
// el avance de todos (js/centroamericano-mesas.js, sugerirAyuda).

export type Mesa = { mesa: number; valor: string };
export type Avance = { total: number; con_resultado: number; pendientes: number[] };

// «0» es «sin resultado» en el desplegable de chess-results.
export function avance(mesas: Mesa[], desde: number, hasta: number): Avance {
  const dentro = mesas.filter((m) => m.mesa >= desde && m.mesa <= hasta);
  const pendientes = dentro.filter((m) => m.valor === "0").map((m) => m.mesa).sort((a, b) => a - b);
  return { total: dentro.length, con_resultado: dentro.length - pendientes.length, pendientes };
}

// deno-lint-ignore no-explicit-any
export async function guardarAvance(servicio: any, asignacionId: string, ronda: number, a: Avance): Promise<{ termino: boolean }> {
  const { error } = await servicio.from("centroamericano_progreso").upsert(
    { asignacion_id: asignacionId, ronda, total: a.total, con_resultado: a.con_resultado, pendientes: a.pendientes, actualizado: new Date().toISOString() },
    { onConflict: "asignacion_id,ronda" },
  );
  if (error) console.error("avance-ronda: progreso", error.code);
  const termino = a.total > 0 && a.con_resultado === a.total;
  if (termino) {
    // Ya avisado en esta ronda: el índice único responde 23505 y no hay nada más que hacer.
    const { error: e2 } = await servicio.from("centroamericano_avisos").insert({
      de: "arbitro", asignacion_id: asignacionId, tipo: "termino", ronda,
      texto: "Terminó sus " + a.total + (a.total === 1 ? " mesa" : " mesas") + " de la ronda " + ronda + ".",
    });
    if (e2 && e2.code !== "23505") console.error("avance-ronda: termino", e2.code);
  }
  return { termino };
}
