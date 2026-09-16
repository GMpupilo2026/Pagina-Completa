/**
 * Ajedrez Integral — registro del service worker e instalación de la app.
 *
 * Dos cosas:
 *
 *  1. Registra sw.js, que es lo que hace que el sitio se pueda instalar y que
 *     diga algo con sentido cuando no hay red (ver el comentario de sw.js: es
 *     deliberadamente tonto, la red va siempre primero).
 *
 *  2. Ofrece instalar la app. Android avisa por su cuenta con un cartelito que
 *     casi nadie ve, así que el sitio pone su propio botón — pero SOLO cuando
 *     el navegador dice que se puede instalar (`beforeinstallprompt`) y solo si
 *     la página tiene dónde ponerlo (`#instalar-app`). Si ya está instalada, o
 *     si el navegador no lo permite, no aparece nada: un botón que no hace nada
 *     es peor que ningún botón.
 *
 * Quien dice que no, no lo vuelve a ver por 30 días (se apunta en
 * localStorage). No se sincroniza con la cuenta: es de este aparato.
 */
(function () {
  "use strict";

  var CLAVE_RECHAZO = "app_instalar_no_v1";
  var DIAS_DE_PAZ = 30;

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {
        // Sin service worker el sitio funciona igual: solo no se instala ni
        // aguanta quedarse sin red. No hay nada que avisarle a nadie.
      });
    });
  }

  function yaInstalada() {
    try {
      return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    } catch (e) { return false; }
  }

  function dijoQueNo() {
    try {
      var cuando = Number(localStorage.getItem(CLAVE_RECHAZO) || 0);
      return cuando && (Date.now() - cuando) < DIAS_DE_PAZ * 86400000;
    } catch (e) { return false; }
  }

  var guardado = null;

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();          // el cartel del navegador no, el nuestro sí
    guardado = e;
    if (yaInstalada() || dijoQueNo()) return;
    var caja = document.getElementById("instalar-app");
    if (!caja) return;
    caja.hidden = false;
    var boton = caja.querySelector("[data-instalar]");
    var cerrar = caja.querySelector("[data-instalar-no]");
    if (boton) boton.addEventListener("click", async function () {
      if (!guardado) return;
      caja.hidden = true;
      guardado.prompt();
      try { await guardado.userChoice; } catch (err) {}
      guardado = null;
    });
    if (cerrar) cerrar.addEventListener("click", function () {
      caja.hidden = true;
      try { localStorage.setItem(CLAVE_RECHAZO, String(Date.now())); } catch (err) {}
    });
  });

  window.addEventListener("appinstalled", function () {
    var caja = document.getElementById("instalar-app");
    if (caja) caja.hidden = true;
    try { localStorage.removeItem(CLAVE_RECHAZO); } catch (e) {}
  });
})();
