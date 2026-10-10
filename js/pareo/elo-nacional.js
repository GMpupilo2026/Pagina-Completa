/* ===== Pareo Integral — buscar el Elo Nacional =====
 *
 * La ÚNICA llamada de Pareo Integral a un servidor (ver «Buscar Elo
 * Nacional» en docs/decisiones/juegos-y-torneos.md): manda los NOMBRES de
 * los jugadores, nada más, a la Edge Function `pareo-elo-nacional`, que los
 * busca en ajedrezcostarica.com porque esa página no manda CORS y el
 * navegador no la puede leer directo.
 *
 * No carga js/supabase-client.js: no hace falta el cliente entero de
 * Supabase (ni su sesión, ni Realtime) para un solo POST sin cuenta. Es un
 * fetch liviano, con la misma URL y la misma clave anónima que ya están en
 * el repositorio en js/supabase-client.js —la clave es pública por diseño,
 * lo que decide qué se puede hacer con ella es la base—.
 */
window.PareoEloNacional = (function () {
  "use strict";
  const URL_FUNCION = "https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/pareo-elo-nacional";
  const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJndGlqcGltcGNva3hhdHh4YmtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5ODczMjksImV4cCI6MjEwNDU2MzMyOX0.h-AcAEQNaYMVo5UVtdWqUCTYgiSLFKDgXsn3lnbAhmQ";

  /* { nombres: string[] } -> { ok: true, resultados: [{nombre, estado,
     nacional, fideEstandar, fideId}] } o { ok: false, error }. Nunca lanza:
     un problema de red o de la función vuelve como { ok: false }. */
  async function buscar(nombres) {
    let res;
    try {
      res = await fetch(URL_FUNCION, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + ANON, apikey: ANON },
        body: JSON.stringify({ nombres: nombres }),
      });
    } catch {
      return { ok: false, error: null };
    }
    let datos;
    try { datos = await res.json(); } catch { return { ok: false, error: null }; }
    return datos && typeof datos === "object" ? datos : { ok: false, error: null };
  }

  return { buscar: buscar };
})();
