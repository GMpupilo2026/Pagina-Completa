/* Service worker de Ajedrez Integral.
 *
 * Está para dos cosas y para nada más: que el sitio se pueda instalar como app
 * y que, sin red, diga algo con sentido en vez de la pantalla de dinosaurio.
 *
 * ES DELIBERADAMENTE TONTO, y esa es la decisión de fondo. Un service worker
 * que sirve de la caché primero hace que el sitio arranque más rápido, pero
 * abre la puerta a la peor falla que tiene este sitio: HTML nuevo con CSS
 * viejo. Como el CSS se compila y los archivos no llevan huella en el nombre
 * (ver "El CSS va compilado" en CLAUDE.md), una hoja vieja en caché deja la
 * página sin la mitad de sus clases — y eso NO da error: simplemente se ve
 * mal. Así que acá la red va SIEMPRE primero y la caché es solo la red de
 * seguridad para cuando no hay señal.
 *
 * Lo que nunca toca:
 *   - nada que no sea de este dominio (Supabase, los CDN): ni se mira;
 *   - nada que no sea GET;
 *   - cursos/protegido/ y cursos/recursos/, que son el contenido de la
 *     Academia y el material de uso docente. Guardarlos en la caché del
 *     teléfono sería dejarlos ahí después de cerrar sesión;
 *   - las respuestas que no vengan bien (un 404 o un 500 no se guardan).
 */
const VERSION = "ai-2026-09-1";
const CACHE = "ajedrez-integral-" + VERSION;

/* El mínimo para que la app abra sin red y explique qué pasa. */
const CASCARON = [
  "/offline.html",
  "/css/tailwind.css",
  "/css/styles.css",
  "/js/main.js",
  "/manifest.json",
  "/img/app/icon-192.png",
  "/img/favicon.svg",
];

/* Lo que jamás se guarda, ni aunque venga bien. */
const NUNCA = [
  /^\/cursos\/protegido\//,
  /^\/cursos\/recursos\//,
  /^\/api\//,
  /^\/\.well-known\//,
];

self.addEventListener("install", (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Uno por uno: si un archivo falla, no tumba la instalación entera.
    await Promise.all(CASCARON.map((u) => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

function seGuarda(url) {
  return !NUNCA.some((re) => re.test(url.pathname));
}

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;

  const url = new URL(pedido.url);
  // Supabase, los CDN y cualquier otro dominio: que pasen de largo. El service
  // worker no tiene nada que hacer con datos de sesión ni con la base.
  if (url.origin !== self.location.origin) return;
  if (!seGuarda(url)) return;

  evento.respondWith((async () => {
    try {
      const respuesta = await fetch(pedido);
      // Solo se guardan respuestas propias y buenas.
      if (respuesta && respuesta.ok && respuesta.type === "basic") {
        const cache = await caches.open(CACHE);
        cache.put(pedido, respuesta.clone());
      }
      return respuesta;
    } catch (e) {
      const guardada = await caches.match(pedido);
      if (guardada) return guardada;
      // Sin red y sin copia: si iba a una página, se explica; si era un
      // archivo suelto, se deja fallar, que es lo honesto.
      if (pedido.mode === "navigate") {
        const aviso = await caches.match("/offline.html");
        if (aviso) return aviso;
      }
      throw e;
    }
  })());
});

/* ---------------------------------------------------------------------------
 * Los avisos push.
 *
 * El texto llega YA CIFRADO para este aparato: ni el servidor de push de Google
 * ni nadie más lo puede leer por el camino. Acá se descifra solo y se enseña.
 *
 * Si el mensaje viniera roto o vacío, igual hay que enseñar ALGO: los
 * navegadores castigan al sitio que recibe un push y no muestra nada — pueden
 * llegar a quitarle el permiso. Por eso el catch no se queda callado.
 * ------------------------------------------------------------------------- */
self.addEventListener("push", (evento) => {
  let aviso = {};
  try { aviso = evento.data ? evento.data.json() : {}; } catch (e) { aviso = {}; }
  const titulo = aviso.titulo || "Ajedrez Integral";
  evento.waitUntil(self.registration.showNotification(titulo, {
    body: aviso.cuerpo || "Tienes algo nuevo en la Academia.",
    icon: "/img/app/icon-192.png",
    badge: "/img/app/icon-192.png",
    lang: "es",
    // La etiqueta hace que un aviso del mismo tipo REEMPLACE al anterior en vez
    // de amontonarse: tres "te retaron" seguidos son una sola notificación.
    tag: aviso.etiqueta || "ajedrez-integral",
    renotify: !!aviso.etiqueta,
    data: { url: aviso.url || "/clases.html" },
  }));
});

/* Al tocar el aviso: si la Academia ya está abierta en alguna ventana, se usa
   esa y se la lleva a donde toca. Abrir una segunda copia de la app sería la
   forma más rápida de perder lo que el alumno tenía a medias. */
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || "/clases.html";
  evento.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const ventana of abiertas) {
      if (new URL(ventana.url).origin === self.location.origin) {
        await ventana.focus();
        if ("navigate" in ventana) { try { await ventana.navigate(destino); } catch (e) {} }
        return;
      }
    }
    await self.clients.openWindow(destino);
  })());
});

/* El navegador puede renovar la suscripción por su cuenta (pasa cada tanto).
   Si no se vuelve a guardar la nueva, el aparato deja de recibir en silencio:
   nadie se entera hasta que alguien pregunta por qué no le llegan los avisos. */
self.addEventListener("pushsubscriptionchange", (evento) => {
  evento.waitUntil((async () => {
    const clientes = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    clientes.forEach((c) => c.postMessage({ tipo: "push-renovar" }));
  })());
});
