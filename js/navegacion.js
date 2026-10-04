/**
 * Ajedrez Integral — la barra de «cargando la página siguiente».
 *
 * Al tocar un enlace del sitio, la página vieja se queda quieta hasta que llega
 * la nueva. En el navegador eso se nota por la ruedita de la pestaña; en la app
 * instalada (PWA) no hay pestaña ni barra de direcciones, así que durante ese
 * medio segundo no pasa NADA en la pantalla y la persona vuelve a tocar, o
 * cree que el botón no sirve. Esta barra fina arriba dice «ya va».
 *
 * - Sale después de 100 ms: si la página llega antes (la adelantó
 *   anticipar.json), no parpadea nada.
 * - Solo para páginas de este mismo sitio. Un enlace a WhatsApp en el celular
 *   abre la app y la página se queda donde estaba: ahí la barra se quedaría
 *   pegada.
 * - Se apaga sola a los 10 s, por si la navegación no llegó a pasar (una
 *   descarga, un «¿Salir de la página?» que la persona canceló), y al volver
 *   con «Atrás» a una página guardada entera (bfcache), que vuelve tal como
 *   quedó, barra incluida.
 * - Es adorno para la vista: `aria-hidden`. Quien usa lector de pantalla ya
 *   oye el cambio de página.
 *
 * Usa la Navigation API (el evento `navigate`), que ve también las
 * navegaciones que hace el código (`location.href = …`), no solo los clics.
 * Donde no existe, escucha los clics en los enlaces.
 *
 * Ver «La navegación se siente inmediata» en
 * docs/decisiones/sitio-e-infraestructura.md. Lo revisa
 * herramientas/verificar-navegacion.js.
 */
(function () {
  "use strict";

  var ESPERA_MS = 100;
  var TOPE_MS = 10000;
  var barra = null;
  var tEspera = 0;
  var tTope = 0;

  function asegurarBarra() {
    if (barra && barra.isConnected) return barra;
    barra = document.createElement("div");
    barra.id = "barra-navegacion";
    barra.setAttribute("aria-hidden", "true");
    document.body.appendChild(barra);
    return barra;
  }

  function apagar() {
    clearTimeout(tEspera);
    clearTimeout(tTope);
    var b = barra || document.getElementById("barra-navegacion");
    if (b) b.className = "";
  }

  function encender() {
    clearTimeout(tEspera);
    clearTimeout(tTope);
    tEspera = setTimeout(function () {
      if (!document.body) return;
      var b = asegurarBarra();
      b.className = "arranca";
      void b.offsetWidth;            // que el navegador vea el punto de partida
      b.className = "activa";
    }, ESPERA_MS);
    tTope = setTimeout(apagar, TOPE_MS);
  }

  /* ¿Va a otra página de este sitio? Un ancla de la misma página no carga
     nada. */
  function esOtraPaginaDelSitio(url) {
    var destino;
    try { destino = new URL(url, location.href); } catch (e) { return false; }
    if (destino.origin !== location.origin) return false;
    if (destino.protocol !== "http:" && destino.protocol !== "https:") return false;
    var aqui = new URL(location.href);
    if (destino.pathname === aqui.pathname && destino.search === aqui.search && destino.hash !== aqui.hash) return false;
    return true;
  }

  if (window.navigation && typeof window.navigation.addEventListener === "function") {
    window.navigation.addEventListener("navigate", function (e) {
      if (e.hashChange || e.downloadRequest) return;
      if (e.destination && e.destination.sameDocument) return;
      if (!esOtraPaginaDelSitio(e.destination && e.destination.url)) return;
      encender();
    });
  } else {
    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   // pestaña nueva
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a || a.hasAttribute("download")) return;
      if (a.target && a.target !== "_self") return;
      if (!esOtraPaginaDelSitio(a.href)) return;
      encender();
    });
  }

  window.addEventListener("pageshow", apagar);

  /* La transición entre páginas (@view-transition en css/styles.css) la
     cancela el navegador cuando la página de llegada no la pide —
     inscripcion.html, offline.html, un PDF— o cuando no le da tiempo. Eso
     rechaza sus promesas, y un rechazo que nadie atrapa sale como error de la
     página: le llegaba a Sentry y hacía fallar a los verificadores que miran
     los errores. No es un error: la página cambia igual, sin fundido. */
  function sinRechazos(e) {
    var vt = e && e.viewTransition;
    if (!vt) return;
    ["ready", "finished", "updateCallbackDone"].forEach(function (k) {
      if (vt[k] && typeof vt[k].catch === "function") vt[k].catch(function () {});
    });
  }
  window.addEventListener("pageswap", sinRechazos);
  window.addEventListener("pagereveal", sinRechazos);
})();
