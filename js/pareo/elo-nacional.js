/* ===== Pareo Integral — buscar en las listas de Elo =====
 *
 * Las dos búsquedas de Pareo Integral en las listas de Elo, que pasan por
 * nuestro servidor porque ni ajedrezcostarica.com ni ratings.fide.com mandan
 * CORS y el navegador no las puede leer directo:
 *   - buscar(nombres): el Elo Nacional de quien no tiene (ver «Buscar Elo
 *     Nacional» en docs/decisiones/juegos-y-torneos.md). Manda los NOMBRES
 *     de los jugadores, nada más, a la Edge Function `pareo-elo-nacional`.
 *   - buscarEnLista(lista, q): «Agregar desde una lista de Elo» (ver
 *     «Pareo Integral: agregar jugadores desde las listas de Elo»). Manda la
 *     lista («fide» o «nacional») y lo escrito en el buscador, nada más, a
 *     `pareo-listas-elo`.
 *
 * No carga js/supabase-client.js: no hace falta el cliente entero de
 * Supabase (ni su sesión, ni Realtime) para un solo POST sin cuenta. Es un
 * fetch liviano, con la misma URL y la misma clave anónima que ya están en
 * el repositorio en js/supabase-client.js —la clave es pública por diseño,
 * lo que decide qué se puede hacer con ella es la base—.
 */
window.PareoEloNacional = (function () {
  "use strict";
  const FUNCIONES = "https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/";
  const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJndGlqcGltcGNva3hhdHh4YmtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5ODczMjksImV4cCI6MjEwNDU2MzMyOX0.h-AcAEQNaYMVo5UVtdWqUCTYgiSLFKDgXsn3lnbAhmQ";

  /* { nombres: string[] } -> { ok: true, resultados: [{nombre, estado,
     nacional, fideEstandar, fideId}] } o { ok: false, error }. Nunca lanza:
     un problema de red o de la función vuelve como { ok: false }. */
  async function buscar(nombres) {
    return pedir("pareo-elo-nacional", { nombres: nombres });
  }

  /* ("fide" | "nacional", texto) -> { ok: true, filas: [{ fideId, nombre,
     titulo, fed, sexo, nacimiento, club, nacional, estandar, rapido, blitz }],
     total, hayMas, periodo } o { ok: false, error }. Las tres listas de FIDE
     vienen en la misma fila: quien llama elige cuál usa. Nunca lanza. */
  async function buscarEnLista(lista, q) {
    return pedir("pareo-listas-elo", { lista: lista, q: q });
  }

  async function pedir(funcion, cuerpo) {
    let res;
    try {
      res = await fetch(FUNCIONES + funcion, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + ANON, apikey: ANON },
        body: JSON.stringify(cuerpo),
      });
    } catch {
      return { ok: false, error: null };
    }
    let datos;
    try { datos = await res.json(); } catch { return { ok: false, error: null }; }
    return datos && typeof datos === "object" ? datos : { ok: false, error: null };
  }

  return { buscar: buscar, buscarEnLista: buscarEnLista };
})();
