/* ===== Tiempo activo en la plataforma =====
 *
 * Mismo mecanismo que class_presence_log en sesion.html (una fila por
 * ventana de conexión, con un heartbeat cada 20s que "toca" left_at en vez
 * de esperar a que el navegador avise al cerrarse) pero para ejercicios y
 * entrenamiento en vez de una clase en vivo — con una diferencia a
 * propósito: acá SÍ hace falta detectar inactividad. Estar conectado a una
 * clase con el profesor cuenta como "presente" aunque no se toque nada
 * (uno puede estar mirando y escuchando); tener la pestaña de ejercicios
 * abierta sin tocar nada, no.
 *
 * En cuanto pasan 60 segundos sin ningún clic, tecla, toque o scroll (o la
 * pestaña deja de estar visible), se deja de tocar la fila abierta — queda
 * con su último left_at real, sin seguir creciendo — y, si la actividad
 * vuelve, se abre una fila NUEVA en vez de estirar la vieja. Así el rato
 * inactivo nunca cuenta, y sumar filas con informes.html (misma fórmula
 * minutesFromPresenceRows que ya usa para class_presence_log, reutilizada
 * tal cual porque las columnas se llaman igual a propósito) da el tiempo
 * activo real, no "desde que abrió hasta que cerró".
 *
 * Uso — una sola línea, en cualquier página de ejercicios, después de que
 * ya exista `sb` (ver js/supabase-client.js):
 *   <script src="js/tiempo-plataforma.js" data-activity="mates"></script>
 * No hace falta ninguna otra línea: se anota solo con la sesión ya
 * iniciada, si la hay (sin sesión, no hace nada). Si falla la red en algún
 * tramo, ese tramo simplemente no queda anotado — nunca rompe la página.
 */
(function () {
  "use strict";

  const IDLE_MS = 60000; // sin interacción por más de esto = inactivo
  const HEARTBEAT_MS = 20000; // igual que class_presence_log en sesion.html

  const scriptTag = document.currentScript;
  const activity = (scriptTag && scriptTag.getAttribute("data-activity")) || "otro";

  let studentId = null;
  let rowId = null;
  let lastActivityAt = Date.now();

  function marcarActividad() { lastActivityAt = Date.now(); }
  ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"].forEach((evt) => {
    document.addEventListener(evt, marcarActividad, { passive: true });
  });

  function activoAhora() {
    return document.visibilityState === "visible" && (Date.now() - lastActivityAt) < IDLE_MS;
  }

  async function abrirFila() {
    if (rowId || !studentId) return;
    try {
      const { data, error } = await sb.from("platform_activity_log")
        .insert({ student_id: studentId, activity: activity, pagina: window.location.pathname })
        .select().single();
      if (!error && data) rowId = data.id;
    } catch (e) { /* sin red: este tramo no queda anotado, no rompe la página */ }
  }

  async function tocarFila() {
    if (!rowId) return;
    try { await sb.from("platform_activity_log").update({ left_at: new Date().toISOString() }).eq("id", rowId); }
    catch (e) {}
  }

  async function latido() {
    if (!studentId) return;
    if (activoAhora()) {
      if (!rowId) await abrirFila();
      else await tocarFila();
    } else if (rowId) {
      // Se acaba de detectar inactividad: se deja de tocar esta fila (su
      // último left_at real ya quedó marcado en el latido anterior, o en
      // joined_at si nunca llegó a tocarse) — NO se toca ahora, porque eso
      // metería el propio rato inactivo dentro de la ventana contada.
      rowId = null;
    }
  }

  async function init() {
    try {
      const { data } = await sb.auth.getSession();
      if (!data || !data.session) return;
      studentId = data.session.user.id;
    } catch (e) { return; }
    setInterval(latido, HEARTBEAT_MS);
    latido();
    document.addEventListener("visibilitychange", latido);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
