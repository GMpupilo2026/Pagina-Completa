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
    // Los premios de la clase en vivo (public.premios_de_alumno, ver
    // js/trofeos.js): los trofeos se suman de clase en clase y el profesor
    // los ajusta; las insignias las da él a mano.
    trofeos: 0,
    insignias: 0,
    // Lo que no es «cuántos» (public.logros_hitos): duelos de Batalla naval
    // ganados, tandas de Precisión con 70 % o más, tesoros del Sonar con tres
    // estrellas.
    hitos: {},
    // Cuántos Tipos de entrenamiento completó (todos sus ejercicios con una
    // estrella o más). Lo anota entreno/tipos.html en la cuenta
    // (training_state, 'tipos_completos_v1'): es la única que tiene los
    // ejercicios de verdad.
    tipos_completos: 0,
  };

  function vacio(sesion, error) {
    return {
      stats: STATS_VACIAS,
      logros: window.LogrosCatalogo.conEstado(STATS_VACIAS),
      sesion: !!sesion,
      error: !!error,
    };
  }

  /* `alumnoId`: los de OTRA persona —el panel de un estudiante que mira quien
     administra—. Sin él, los de la cuenta con sesión. */
  async function cargar(alumnoId) {
    if (!window.sb) return vacio(false, false);
    let sesion = null;
    try {
      const { data } = await sb.auth.getSession();
      sesion = data && data.session ? data.session : null;
    } catch (e) {
      return vacio(false, true);
    }
    if (!sesion) return vacio(false, false);
    const alumno = alumnoId || sesion.user.id;
    try {
      // Los premios van aparte y no tumban la racha si fallan: se piden a la
      // par y, sin respuesta, cuentan cero.
      const premiosP = Promise.resolve(sb.rpc("premios_de_alumno", { p_alumno: alumno }))
        .then((r) => (r && !r.error && r.data && r.data.premios ? r.data.premios : {}))
        .catch(() => ({}));
      const hitosP = Promise.resolve(alumnoId ? sb.rpc("logros_hitos", { alumno }) : sb.rpc("logros_hitos"))
        .then((r) => (r && !r.error && r.data && typeof r.data === "object" && !Array.isArray(r.data) ? r.data : {}))
        .catch(() => ({}));
      // Dentro de .then: si esta consulta tropieza, cuenta cero y no tumba la racha.
      const completosP = Promise.resolve()
        .then(() => sb.from("training_state").select("value")
          .eq("student_id", alumno).eq("key", "tipos_completos_v1").maybeSingle())
        .then((r) => {
          const raw = r && !r.error && r.data && r.data.value && r.data.value.raw;
          const o = typeof raw === "string" ? JSON.parse(raw) : null;
          return o && typeof o === "object" ? Object.keys(o).filter((k) => o[k]).length : 0;
        })
        .catch(() => 0);
      const { data, error } = await (alumnoId ? sb.rpc("progreso_dias_y_racha", { alumno }) : sb.rpc("progreso_dias_y_racha"));
      if (error) throw error;
      const fila = (data && data[0]) || {};
      const stats = Object.assign({}, STATS_VACIAS, fila, {
        por_actividad: fila.por_actividad || {},
      });
      const premios = await premiosP;
      stats.trofeos = Number(premios.trofeos_total) || 0;
      stats.insignias = Number(premios.insignias_total) || 0;
      stats.hitos = await hitosP;
      stats.tipos_completos = await completosP;
      return { stats: stats, logros: window.LogrosCatalogo.conEstado(stats), sesion: true, error: false };
    } catch (e) {
      console.warn("No se pudo cargar tu racha y tus logros:", e && e.message ? e.message : e);
      return vacio(true, true);
    }
  }

  return { cargar: cargar, META_DIARIA: META_DIARIA };
})();
