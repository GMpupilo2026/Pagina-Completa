/* ===== Ajedrez Integral — Registro de avances de Entrenamiento =====
 * Guarda en Supabase (tabla training_progress) cada logro de las páginas de
 * Entrenamiento (4x4, Aprender, Coordenadas...) para que aparezcan en
 * Informes y en el panel de Clases.
 *
 * Requiere que window.sb ya exista (js/supabase-client.js cargado antes que
 * este archivo). Las páginas de Entrenamiento ya exigen sesión iniciada
 * (Academia) antes de mostrar el contenido, pero por si acaso log() se queda
 * sin usuario (sesión vencida a medio uso, por ejemplo) simplemente no
 * escribe nada — la actividad sigue funcionando igual, apoyada en su
 * progreso local (localStorage), solo que no queda visible para el profesor.
 */
window.EntrenoProgress = (function () {
  let userId = null;
  let ready = false;

  async function init() {
    try {
      const { data } = await window.sb.auth.getSession();
      userId = data && data.session ? data.session.user.id : null;
    } catch (e) {
      userId = null;
    }
    ready = true;
    return userId;
  }

  /* Devuelve { ok, motivo } para que quien llame pueda decir la verdad en
     pantalla. Antes no devolvía nada y las páginas daban por guardado todo lo
     que se intentaba con sesión abierta: cuando la base rechazaba la fila (una
     actividad que faltaba en el CHECK de training_progress, por ejemplo) el
     alumno leía "guardado" y el profesor no veía nada en Informes. Los motivos
     son: "sin-sesion" (no hay quien la firme) y "error" (la base dijo que no).
     Quien no mire el resultado sigue funcionando igual que antes. */
  async function log(activity, detail) {
    if (!ready) await init();
    if (!userId) return { ok: false, motivo: "sin-sesion" };
    try {
      const { error } = await window.sb.from("training_progress").insert([
        { student_id: userId, activity, detail: detail || {} },
      ]);
      if (error) {
        console.error("No se pudo registrar el avance de Entrenamiento:", error);
        return { ok: false, motivo: "error", error };
      }
      return { ok: true };
    } catch (e) {
      console.error("No se pudo registrar el avance de Entrenamiento:", e);
      return { ok: false, motivo: "error", error: e };
    }
  }

  /* Estrellas de una posición de Practicar o de Desafíos. Cuentan las pistas Y
     las jugadas equivocadas: antes solo las pistas, y probar jugada tras jugada
     hasta acertar daba tres estrellas. Una sola cosa en falta, dos; más, una.
     "Ver solución" es la tercera pista, así que siempre deja una. */
  function estrellasDeLaRonda(pistas, errores) {
    const faltas = (pistas || 0) + (errores || 0);
    return faltas >= 2 ? 1 : faltas === 1 ? 2 : 3;
  }

  /* Cómo salió un ejercicio, para el `detail` de training_progress. Va en el
     detalle y no como actividad nueva: el CHECK de la tabla no cambia, y las
     filas viejas (sin estos campos) siguen valiendo. `limpio` es sin error y
     sin pista: lo que de verdad dice que el motivo se domina. */
  function comoSalio(conError, conPista) {
    return { limpio: !conError && !conPista, con_error: !!conError, con_pista: !!conPista };
  }

  return { init, log, estrellasDeLaRonda, comoSalio, hasSession: () => !!userId };
})();
