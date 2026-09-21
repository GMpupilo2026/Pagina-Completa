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
 * CUÁNDO SE MUESTRA, que es lo que más se hace mal con estos carteles:
 *
 *   - Se muestra UNA vez. Antes aparecía en cada carga de la página, porque el
 *     navegador dispara `beforeinstallprompt` cada vez: quien entraba a diario
 *     lo veía a diario, y un cartel que se repite deja de leerse y empieza a
 *     molestar.
 *   - Quien aprieta "Ahora no" no lo vuelve a ver en UNA SEMANA. Ahí sí puede
 *     salir otra vez, por si en ese momento le venía mal.
 *   - Quien lo deja pasar sin tocar nada tampoco lo vuelve a ver: no contestar
 *     también es una respuesta.
 *
 * Se apunta en localStorage y no se sincroniza con la cuenta: instalar la app
 * es de este aparato, no de la persona.
 */
(function () {
  "use strict";

  var CLAVE = "app_instalar_v2";            // { visto, rechazado } en milisegundos
  var CLAVE_VIEJA = "app_instalar_no_v1";   // solo la fecha del rechazo
  var DIAS_DE_PAZ = 7;

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

  function leer() {
    try {
      var crudo = localStorage.getItem(CLAVE);
      if (crudo) return JSON.parse(crudo) || {};
      // Quien ya había dicho "ahora no" con la versión anterior no tiene por
      // qué volver a verlo solo porque cambió la forma de guardarlo.
      var viejo = Number(localStorage.getItem(CLAVE_VIEJA) || 0);
      return viejo ? { rechazado: viejo } : {};
    } catch (e) { return {}; }
  }

  function apuntar(cambios) {
    try {
      var estado = leer();
      for (var k in cambios) estado[k] = cambios[k];
      localStorage.setItem(CLAVE, JSON.stringify(estado));
    } catch (e) { /* sin localStorage el cartel sale cada vez; no es grave */ }
  }

  /* Las tres razones para no mostrarlo, en orden. */
  function sePuedeMostrar() {
    if (yaInstalada()) return false;
    var estado = leer();
    // 1. Dijo "ahora no" hace poco: se respeta la semana.
    if (estado.rechazado && (Date.now() - estado.rechazado) < DIAS_DE_PAZ * 86400000) return false;
    // 2. Ya se mostró y no hubo un "ahora no" DESPUÉS: no se insiste. Dejarlo
    //    pasar sin tocar nada también es una respuesta.
    if (estado.visto && (!estado.rechazado || estado.visto > estado.rechazado)) return false;
    return true;
  }

  var guardado = null;
  var yaEnganchado = false;

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();          // el cartel del navegador no, el nuestro sí
    guardado = e;
    if (!sePuedeMostrar()) return;
    var caja = document.getElementById("instalar-app");
    if (!caja) return;
    caja.hidden = false;
    apuntar({ visto: Date.now() });

    // El navegador puede disparar este evento más de una vez en la misma
    // página; sin esta guardia se acumularían manejadores repetidos.
    if (yaEnganchado) return;
    yaEnganchado = true;

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
      apuntar({ rechazado: Date.now() });
    });
  });

  window.addEventListener("appinstalled", function () {
    var caja = document.getElementById("instalar-app");
    if (caja) caja.hidden = true;
    // Si algún día la desinstala, que se le pueda volver a ofrecer.
    try { localStorage.removeItem(CLAVE); localStorage.removeItem(CLAVE_VIEJA); } catch (e) {}
  });
})();
