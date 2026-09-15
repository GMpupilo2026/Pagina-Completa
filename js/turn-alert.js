/**
 * Aviso de "te toca mover" — un pitido corto (sin archivo de audio, generado
 * con WebAudio) más, si la pestaña no está a la vista, un parpadeo del
 * título de la página y una notificación del sistema (si el navegador dio
 * permiso). Se usa en todas las partidas en tiempo real: crazyhouse.html,
 * cartas.html, duelo.html, niebla.html, estandar.html, cuatro-jugadores.html.
 *
 * Uso — una sola línea en el <head>, antes del <script> inline de la página:
 *   <script src="js/turn-alert.js"></script>
 * y, dentro de updateStatusText() (o equivalente), al final:
 *   TurnAlert.check(esMiTurnoAhoraMismo);
 *
 * Solo avisa en la TRANSICIÓN de "no es mi turno" a "sí es mi turno" — no en
 * cada repintado — para no sonar en cada actualización mientras se sigue
 * esperando. El parpadeo del título se apaga solo en cuanto la pestaña
 * vuelve a estar a la vista.
 */
(function () {
  "use strict";

  let wasMyTurn = false;
  let flashTimer = null;
  let audioCtx = null;
  const originalTitle = document.title;

  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.18;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) { /* sin audio (autoplay bloqueado, etc.): no rompe la página */ }
  }

  function startTitleFlash() {
    if (flashTimer) return;
    let on = false;
    flashTimer = setInterval(() => {
      document.title = on ? originalTitle : "🔔 ¡Tu turno! — Ajedrez Integral";
      on = !on;
    }, 1000);
  }

  function stopTitleFlash() {
    if (!flashTimer) return;
    clearInterval(flashTimer);
    flashTimer = null;
    document.title = originalTitle;
  }

  function maybeSystemNotification() {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      try { new Notification("♟️ Es tu turno", { body: originalTitle, tag: "turno-ajedrez-integral" }); } catch (e) {}
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().catch(() => {});
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) stopTitleFlash();
  });

  window.TurnAlert = {
    // Llamar en cada repintado del estado con el booleano "¿me toca mover
    // ahora mismo?" — internamente detecta la transición y decide si avisar.
    check(isMyTurnNow) {
      if (isMyTurnNow && !wasMyTurn) {
        beep();
        if (document.hidden) {
          startTitleFlash();
          maybeSystemNotification();
        }
      } else if (!isMyTurnNow) {
        stopTitleFlash();
      }
      wasMyTurn = !!isMyTurnNow;
    },
  };
})();
