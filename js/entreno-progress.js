/* ===== Ajedrez Integral — Registro de avances de Entrenamiento =====
 * Guarda en Supabase (tabla training_progress) cada logro de las páginas de
 * Entrenamiento (4x4, Aprender, Coordenadas...) para que aparezcan en
 * Informes y en el panel de Clases.
 *
 * Requiere que window.sb ya exista (js/supabase-client.js cargado antes que
 * este archivo). Si quien juega entró solo con la contraseña de Entrenamiento
 * y no tiene una sesión del sitio iniciada, log() simplemente no escribe nada
 * — la actividad sigue funcionando igual, apoyada en su progreso local
 * (localStorage), solo que no queda visible para el profesor.
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

  async function log(activity, detail) {
    if (!ready) await init();
    if (!userId) return;
    try {
      const { error } = await window.sb.from("training_progress").insert([
        { student_id: userId, activity, detail: detail || {} },
      ]);
      if (error) console.error("No se pudo registrar el avance de Entrenamiento:", error);
    } catch (e) {
      console.error("No se pudo registrar el avance de Entrenamiento:", e);
    }
  }

  return { init, log, hasSession: () => !!userId };
})();
