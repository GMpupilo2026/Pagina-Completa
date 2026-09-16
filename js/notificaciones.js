/**
 * Ajedrez Integral — avisos push en el celular.
 *
 * Enciende y apaga los avisos de ESTE aparato. Una persona puede tener varios
 * (la compu y el celular) y cada uno se enciende por separado: la fila de
 * `push_suscripciones` es por aparato, no por persona.
 *
 * CÓMO SE PIDE EL PERMISO, que es lo que más se hace mal. El navegador solo
 * deja pedirlo una vez por aparato: si el usuario dice que no, no se puede
 * volver a preguntar nunca — hay que ir a la configuración del navegador. Por
 * eso acá NO se pide al cargar la página: se pide solo cuando la persona
 * aprieta el interruptor, que es cuando ya sabe para qué es.
 *
 * Lo que el sitio guarda de cada aparato es lo que el propio navegador le da:
 * el `endpoint` (a dónde mandar) y dos llaves con las que se cifra el mensaje.
 * El texto de cada aviso se cifra PARA ese aparato, así que ni el servidor de
 * push ni el sitio lo pueden leer por el camino.
 *
 * Va SIN `defer` en las páginas que lo cargan, a propósito: los scripts con
 * `defer` corren después de parsear el HTML, o sea después del script del
 * cuerpo que llama a `Notificaciones`. Con `defer` la tarjeta de avisos salía
 * vacía cuando la sesión resolvía rápido —sin dar ningún error, solo un botón
 * en blanco—, que es la misma carrera que tiene `js/adaptive-mode.js`.
 */
window.Notificaciones = (function () {
  "use strict";

  const FUNCION = () => `${window.SUPABASE_URL}/functions/v1/notificar`;

  function hayCómo() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  async function llamar(cuerpo, sesion) {
    const res = await fetch(FUNCION(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sesion.access_token}`,
        "apikey": window.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(cuerpo),
    });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok || datos.error) throw new Error(datos.error || `El servidor respondió ${res.status}`);
    return datos;
  }

  const b64urlAOctetos = (s) => {
    const base = (s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(base);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  const octetosAB64url = (buf) => {
    const u = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  /* En qué está este aparato, sin pedirle nada a nadie:
       "no-se-puede"  el navegador no sabe de esto (iPhone sin instalar, etc.)
       "bloqueado"    ya dijeron que no; solo se arregla desde el navegador
       "apagado"      se puede encender
       "encendido"    está recibiendo                                        */
  async function estado() {
    if (!hayCómo()) return "no-se-puede";
    if (Notification.permission === "denied") return "bloqueado";
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return "apagado";
    const sus = await reg.pushManager.getSubscription();
    return sus ? "encendido" : "apagado";
  }

  async function encender(sesion) {
    if (!hayCómo()) throw new Error("Este navegador no puede mandar avisos. En iPhone hay que instalar la app primero.");
    if (Notification.permission === "denied") {
      throw new Error("Los avisos están bloqueados para el sitio. Se vuelven a permitir desde la configuración del navegador.");
    }
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") throw new Error("Sin permiso no se pueden mandar avisos.");

    const reg = await navigator.serviceWorker.ready;
    const { llave } = await llamar({ action: "llave_publica" }, sesion);

    let sus = await reg.pushManager.getSubscription();
    // Si la suscripción de antes se hizo con otra llave, no sirve: se tira.
    if (sus) {
      const suya = octetosAB64url(sus.options.applicationServerKey || new ArrayBuffer(0));
      if (suya !== llave) { await sus.unsubscribe(); sus = null; }
    }
    if (!sus) {
      sus = await reg.pushManager.subscribe({
        userVisibleOnly: true,           // obligatorio: todo push muestra algo
        applicationServerKey: b64urlAOctetos(llave),
      });
    }
    await guardar(sus, sesion);
    return sus;
  }

  async function guardar(sus, sesion) {
    const j = sus.toJSON();
    // upsert por endpoint: si el mismo aparato se vuelve a suscribir, se
    // actualiza en vez de dejar dos filas que apuntan al mismo lugar.
    const { error } = await window.sb.from("push_suscripciones").upsert({
      user_id: sesion.user.id,
      endpoint: sus.endpoint,
      p256dh: j.keys.p256dh,
      auth: j.keys.auth,
      agente: (navigator.userAgent || "").slice(0, 200),
      activa: true,
      ultimo_error: null,
    }, { onConflict: "endpoint" });
    if (error) throw new Error(error.message);
  }

  async function apagar() {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    const sus = await reg.pushManager.getSubscription();
    if (!sus) return;
    // Primero la fila y después la suscripción: al revés, si falla el borrado
    // de la fila queda un endpoint muerto al que el sitio le sigue mandando.
    await window.sb.from("push_suscripciones").delete().eq("endpoint", sus.endpoint);
    await sus.unsubscribe();
  }

  async function probar(sesion) {
    return await llamar({ action: "probar" }, sesion);
  }

  /* El navegador renueva la suscripción por su cuenta cada tanto y avisa al
     service worker; si no se vuelve a guardar, el aparato deja de recibir en
     SILENCIO — nadie se entera hasta que alguien pregunta por qué no le llegan
     los avisos. Esto la vuelve a guardar sin molestar a nadie.

     Busca la sesión por su cuenta a propósito: así cualquier página que cargue
     este archivo atiende la renovación, sin tener que pasarle nada. */
  function atenderRenovaciones() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.addEventListener("message", async (e) => {
      if (!e.data || e.data.tipo !== "push-renovar") return;
      try {
        const { data } = await window.sb.auth.getSession();
        if (!data || !data.session) return;
        const reg = await navigator.serviceWorker.ready;
        const sus = await reg.pushManager.getSubscription();
        if (sus) await guardar(sus, data.session);
      } catch (err) { /* sin red se reintenta la próxima vez */ }
    });
  }

  return { hayCómo, estado, encender, apagar, probar, atenderRenovaciones };
})();
