/**
 * Ajedrez Integral — "¿quien está mirando administra el sitio?".
 *
 * Varias páginas abren su contenido de a poco: la lección siguiente se abre
 * cuando la anterior queda estudiada, el nivel siguiente cuando el anterior
 * queda resuelto. Eso es a propósito para el alumno —marca el camino— pero le
 * estorba a quien administra, que necesita ver TODO el material de una vez
 * para revisarlo, prepararlo o enseñarlo sin tener que resolverlo antes.
 *
 * Este módulo responde esa única pregunta, una sola vez por carga de página:
 *
 *     await AccesoAdmin.init();          // una consulta, y queda en memoria
 *     if (AccesoAdmin.esAdmin()) { … }   // ya sin esperar, donde haga falta
 *
 * Es SOLO para administración (profiles.is_admin), no para profesores: al
 * profesor el sitio le abre el contenido de sus alumnos desde Informes
 * ("Desbloquear hasta el tema"), que es otra cosa y deja rastro.
 *
 * Como todo filtro del navegador, esto decide qué se PINTA, no qué se puede
 * leer: el contenido de los cursos ya viaja a cualquiera con sesión iniciada
 * (ver CLAUDE.md). O sea que abrirlo acá no destapa nada que estuviera
 * guardado bajo llave; solo deja de esconderlo.
 *
 * Requiere window.sb (js/supabase-client.js). Sin sesión, sin red o si la
 * consulta falla responde que no: el peor caso es que quien administra vea la
 * página como la ve un alumno, nunca al revés.
 */
(function () {
  "use strict";

  var admin = false;
  var promesa = null;

  async function consultar() {
    try {
      var sb = window.sb;
      if (!sb) return false;
      var s = await sb.auth.getSession();
      var uid = s && s.data && s.data.session ? s.data.session.user.id : null;
      if (!uid) return false;
      var r = await sb.from("profiles").select("is_admin").eq("id", uid).maybeSingle();
      return !!(r && r.data && r.data.is_admin);
    } catch (e) {
      return false;
    }
  }

  window.AccesoAdmin = {
    // Se puede llamar desde varios lados: la consulta se hace una sola vez.
    init: function () {
      if (!promesa) {
        promesa = consultar().then(function (v) { admin = v; return v; });
      }
      return promesa;
    },
    // Respuesta ya resuelta, para usar dentro de las funciones que pintan.
    // En un modo de vista (js/modo-vista.js: "como estudiante", "como
    // profesor"…) quien administra quiere ver el contenido CERRADO, como lo ve
    // ese rol: si no, el modo estudiante le enseñaría todo abierto y no serviría
    // para revisar el camino que recorre un alumno.
    esAdmin: function () {
      if (!admin) return false;
      try {
        var modo = localStorage.getItem("modo_vista_admin_v1");
        if (modo && modo !== "admin") return false;
      } catch (e) {}
      return true;
    },
  };
})();
