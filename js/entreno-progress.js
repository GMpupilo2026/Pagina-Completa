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

  return { init, log, hasSession: () => !!userId };
})();
