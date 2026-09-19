/* ===== Ajedrez Integral — Racha de días y logros =====
 *
 * La cuenta la hace la base, no el navegador (mismo criterio que
 * informes.html): `public.progreso_dias_y_racha()` ya agrupa
 * `training_progress` por día de Costa Rica y calcula la racha, así que acá
 * solo se pide el resultado y se cruza con el catálogo de js/logros-catalogo.js.
 *
 * Un día cuenta para la racha si tiene 5 o más ejercicios de CUALQUIER tipo
 * (META_DIARIA). "Cualquier tipo" son las actividades que ya existían
 * (4x4, aprender, coordenadas, practicar, mates, tactica, concentracion,
 * diagnostico, temas) más las cuatro que hasta ahora solo vivían en
 * localStorage y no lo intentaban por el CHECK de training_progress
 * (aperturas, confites, ilumina, visualizacion) — sus páginas ya llaman a
 * EntrenoProgress.log() para esto.
 *
 * Uso — dos líneas, con sesión ya cargada (sb):
 *   <script src="js/logros-catalogo.js"></script>
 *   <script src="js/logros.js"></script>
 *   const { stats, logros, sesion } = await Logros.cargar();
 */
window.Logros = (function () {
  "use strict";

  const META_DIARIA = 5;

  const STATS_VACIAS = {
    dias_activos: 0,
    racha_actual: 0,
    racha_record: 0,
    total_ejercicios: 0,
    tipos_distintos: 0,
    hoy_ejercicios: 0,
    primer_dia: null,
    por_actividad: {},
  };

  function vacio(sesion, error) {
    return {
      stats: STATS_VACIAS,
      logros: window.LogrosCatalogo.conEstado(STATS_VACIAS),
      sesion: !!sesion,
      error: !!error,
    };
  }

  async function cargar() {
    if (!window.sb) return vacio(false, false);
    let sesion = null;
    try {
      const { data } = await sb.auth.getSession();
      sesion = data && data.session ? data.session : null;
    } catch (e) {
      return vacio(false, true);
    }
    if (!sesion) return vacio(false, false);
    try {
      const { data, error } = await sb.rpc("progreso_dias_y_racha");
      if (error) throw error;
      const fila = (data && data[0]) || {};
      const stats = Object.assign({}, STATS_VACIAS, fila, {
        por_actividad: fila.por_actividad || {},
      });
      return { stats: stats, logros: window.LogrosCatalogo.conEstado(stats), sesion: true, error: false };
    } catch (e) {
      console.warn("No se pudo cargar tu racha y tus logros:", e && e.message ? e.message : e);
      return vacio(true, true);
    }
  }

  return { cargar: cargar, META_DIARIA: META_DIARIA };
})();
