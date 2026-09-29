/**
 * Ajedrez Integral — los errores de la gente llegan a Sentry.
 *
 * Hasta acá, cuando algo se caía en la computadora o el celular de un alumno
 * (un tablero que no carga en un Android viejo, un panel que revienta en
 * Safari), nadie se enteraba salvo que la persona escribiera. Los
 * verificadores prueban con un navegador y datos de mentira; esto ve lo que
 * pasa con aparatos, cuentas y datos de verdad.
 *
 * Lo que NO ve, y conviene no olvidarlo: la mayoría de lo que se rompe en este
 * sitio no da ningún error (la página se ve bien y hace otra cosa). Eso lo
 * siguen cuidando los verificadores.
 *
 * Cómo está hecho, y por qué:
 *
 *   - Este archivo es chico y va SÍNCRONO al final del <head> de todas las
 *     páginas (lo pone herramientas/pwa-cabecera.py). Tiene que estar
 *     escuchando antes de que corran los scripts del final del <body>; con
 *     `defer` correría después de ellos y sus errores no los vería nadie.
 *   - La librería de Sentry (js/vendor/sentry.js, 92 KB) NO se baja al
 *     entrar: se pide recién cuando hay un error que mandar. Quien no tiene
 *     ningún error —casi todos— no la descarga nunca (ver «Lo pesado se baja
 *     cuando se usa, no al entrar»).
 *   - Solo en el sitio publicado: en la computadora de quien programa, o en
 *     los verificadores, no manda nada.
 *   - Sin datos personales: ni el correo ni el nombre de la cuenta, ni la IP
 *     (`sendDefaultPii: false`), y la dirección va SIN lo que sigue al `?` ni
 *     al `#` — el enlace de un correo de Supabase trae el token de la sesión
 *     en el `#`.
 *   - Tope por página: un error que se repite en un bucle no se come la cuota
 *     del mes (el plan gratis de Sentry trae unos 5000 errores).
 *   - Lo que viene de una extensión del navegador o de un script de otro
 *     dominio («Script error.», sin nada adentro) no se manda: no es nuestro
 *     y no se puede arreglar.
 *
 * Para activarlo basta con el DSN de abajo, y su dirección
 * (oNNN.ingest.us.sentry.io) va en el connect-src de _headers: sin eso la CSP
 * corta el envío sin dar ningún error. verificar-errores.js revisa las dos
 * cosas juntas.
 */
(function () {
  "use strict";
  if (window.ErroresSitio) return;

  // El DSN no es secreto: es la dirección a la que el navegador manda los
  // errores, y cualquiera la ve en la pestaña Red. Vacío = apagado.
  var DSN = "";
  var SITIO = /^(www\.)?ajedrez-integral\.com$/;
  var TOPE = 10;

  // Los verificadores lo prenden con su propio DSN (addInitScript), porque en
  // localhost está apagado. Desde la consola esto no abre nada: quien tiene la
  // consola ya puede mandar lo que quiera a donde quiera la CSP.
  var prueba = window.__erroresPrueba || null;
  var dsn = prueba ? prueba.dsn : DSN;
  if (!dsn || (!prueba && !SITIO.test(location.hostname))) {
    window.ErroresSitio = { activo: false };
    return;
  }

  // La librería se pide relativa a este archivo: sirve igual desde la raíz y
  // desde entreno/ o cursos/academia/.
  var yo = document.currentScript && document.currentScript.src;
  var LIBRERIA = yo ? yo.replace(/errores\.js(\?.*)?$/, "vendor/sentry.js") : "/js/vendor/sentry.js";

  var mandados = 0;
  var vistos = {};
  var cola = [];
  var estado = "sin-cargar"; // sin-cargar · cargando · listo · falló

  function sinDatos(url) {
    if (!/^[a-z-]+:/i.test(url || "")) return url; // «<anonymous>», «native»
    try {
      var u = new URL(url, location.href);
      return u.origin + u.pathname;
    } catch (e) {
      return String(url || "").split(/[?#]/)[0];
    }
  }

  function deAfuera(pila, archivo) {
    var texto = (pila || "") + " " + (archivo || "");
    return /(chrome|moz|safari(-web)?)-extension:\/\//.test(texto);
  }

  function arrancar() {
    window.Sentry.init({
      dsn: dsn,
      sendDefaultPii: false,
      // Ni los manejadores globales (los pone este archivo, que ya estaba
      // escuchando desde antes), ni las migas de pan de clics, consola y
      // pedidos: guardan textos y direcciones con datos de la gente.
      defaultIntegrations: false,
      integrations: [window.Sentry.dedupeIntegration(), window.Sentry.linkedErrorsIntegration()],
      environment: prueba ? "prueba" : "produccion",
      beforeSend: function (evento) {
        evento.request = {
          url: sinDatos(location.href),
          headers: { "User-Agent": navigator.userAgent },
        };
        delete evento.user;
        // Un error de un script escrito en la página trae de archivo la
        // dirección de la página, con su `?` y su `#`.
        var valores = (evento.exception && evento.exception.values) || [];
        valores.forEach(function (v) {
          var cuadros = (v.stacktrace && v.stacktrace.frames) || [];
          cuadros.forEach(function (c) {
            if (c.filename) c.filename = sinDatos(c.filename);
            if (c.abs_path) c.abs_path = sinDatos(c.abs_path);
          });
        });
        return evento;
      },
    });
  }

  function cargar() {
    if (estado !== "sin-cargar") return;
    estado = "cargando";
    var s = document.createElement("script");
    s.src = LIBRERIA;
    s.async = true;
    s.onload = function () {
      if (!window.Sentry || !window.Sentry.init) { estado = "falló"; return; }
      try { arrancar(); } catch (e) { estado = "falló"; return; }
      estado = "listo";
      var pendientes = cola;
      cola = [];
      pendientes.forEach(mandar);
    };
    // Si no llega (sin red, bloqueada), no se reintenta: los errores de esta
    // página se pierden, y la página sigue como si nada.
    s.onerror = function () { estado = "falló"; cola = []; };
    (document.head || document.documentElement).appendChild(s);
  }

  function mandar(item) {
    if (estado === "listo") {
      window.Sentry.captureException(item.error, {
        mechanism: { type: item.tipo, handled: false },
      });
    } else if (estado !== "falló") {
      cola.push(item);
      cargar();
    }
  }

  function anotar(error, tipo, archivo) {
    if (error == null) return;
    var pila = error && error.stack;
    if (deAfuera(pila, archivo)) return;
    var clave = tipo + "|" + (error && error.message !== undefined ? error.message : String(error));
    if (vistos[clave]) return;
    vistos[clave] = true;
    if (mandados >= TOPE) return;
    mandados += 1;
    mandar({ error: error, tipo: tipo });
  }

  window.addEventListener("error", function (e) {
    // Un error de carga de un recurso (una imagen que no está) llega acá
    // también, sin `error` ni mensaje: no es un error de código.
    // «Script error.» sin `error` es un script de otro dominio: el navegador
    // no deja ver nada de adentro.
    if (!e || !e.error) return;
    anotar(e.error, "onerror", e.filename);
  });

  window.addEventListener("unhandledrejection", function (e) {
    anotar(e && e.reason, "onunhandledrejection");
  });

  window.ErroresSitio = { activo: true };
})();
