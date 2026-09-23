/**
 * La hora del SERVIDOR, para los relojes de las partidas.
 *
 * El reloj de una partida guarda desde cuándo corre (`clock_updated_at`) con
 * la hora de la base, y cada navegador calcula cuánto le queda restando esa
 * hora de la suya. Con la hora de la computadora a secas, una que ande cinco
 * segundos adelantada le quita cinco segundos a cada jugada y canta la bandera
 * antes de tiempo; una atrasada le regala esos segundos. No da ningún error:
 * el reloj simplemente miente, y distinto en cada pantalla.
 *
 * Esto mide el desfase una vez (tres muestras, se queda con la de menor ida y
 * vuelta y la parte a la mitad) y cada página cuenta con `RelojServidor.ahora()`
 * en vez de `Date.now()`. Es el mismo arreglo que ya tenía examen.html con su
 * `desfase`. Se vuelve a medir cada cinco minutos y al volver a la pestaña:
 * un celular que se durmió puede haber corregido su hora mientras tanto.
 *
 * Si la medición falla (sin red, una versión vieja de la base), el desfase se
 * queda en cero, que es exactamente lo que hacía el sitio antes.
 */
(function () {
  "use strict";

  let desfase = 0;
  let enCurso = null;
  let cliente = null;

  async function medir(sb) {
    const t0 = Date.now();
    const { data, error } = await sb.rpc("hora_servidor_ms");
    const t1 = Date.now();
    const srv = Number(data);
    if (error || !isFinite(srv) || srv <= 0) return null;
    return { rtt: t1 - t0, desfase: srv - (t0 + t1) / 2 };
  }

  function sincronizar(sb) {
    sb = sb || cliente;
    if (!sb || typeof sb.rpc !== "function") return Promise.resolve(false);
    if (enCurso) return enCurso;
    enCurso = (async () => {
      let mejor = null;
      for (let i = 0; i < 3; i++) {
        try {
          const m = await medir(sb);
          if (m && (!mejor || m.rtt < mejor.rtt)) mejor = m;
          if (!m) break;
        } catch (e) { break; }
      }
      if (mejor) desfase = mejor.desfase;
      enCurso = null;
      return !!mejor;
    })();
    return enCurso;
  }

  function iniciar(sb) {
    if (cliente) return sincronizar(sb);
    cliente = sb;
    setInterval(() => sincronizar(), 5 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") sincronizar();
    });
    return sincronizar(sb);
  }

  window.RelojServidor = {
    ahora: () => Date.now() + desfase,
    // Segundos que pasaron desde una marca de la base (un ISO), con la hora del servidor.
    desde: (iso) => (Date.now() + desfase - new Date(iso).getTime()) / 1000,
    desfase: () => desfase,
    iniciar: iniciar,
    sincronizar: sincronizar,
  };
})();
