/**
 * Ajedrez Integral — acceso al contenido completo de un curso.
 *
 * Regla vigente: el temario (arriba, en la propia página) es público para
 * cualquier visitante. El contenido completo de las lecciones
 * (cursos/protegido/<curso>.html: texto, video, presentación y PDF) solo se
 * carga cuando el navegador tiene una sesión de Academia iniciada — sin
 * sesión, se muestra un aviso invitando a iniciar sesión en vez del
 * contenido.
 *
 * Es un control puramente informativo del lado del cliente, no un bloqueo de
 * servidor: hubo un intento de exigir una cookie firmada por el Worker
 * (canjeada por la sesión vía /api/curso-auth-session) y se abandonó porque
 * dependía de una variable de entorno fácil de perder en Cloudflare, y
 * cuando falta, deja fuera también a cuentas válidas. Esta versión es más
 * simple: como cualquier alumno o profesor que entra a esta misma página ya
 * con sesión iniciada ve el contenido de una vez, "la de cursos dentro del
 * panel" no necesita ser una página aparte — es esta misma página, vista con
 * sesión.
 *
 * Requiere: <div id="course-content-body" data-course="slug">, y
 * opcionalmente #course-access-cta y #course-login-cta (se muestran solo sin
 * sesión). Usa window.sb si js/supabase-client.js está cargado; sin él, se
 * comporta como sin sesión.
 */
(function () {
  "use strict";

  var contentBody = document.getElementById("course-content-body");
  if (!contentBody) return;
  var courseSlug = contentBody.dataset.course;
  var contentUrl = "protegido/" + courseSlug + ".html";
  var nextParam = encodeURIComponent("cursos/" + courseSlug + ".html");

  function showInformative() {
    contentBody.innerHTML =
      '<div class="bg-brand-50 dark:bg-brand-800 rounded-xl p-5">' +
      '<p class="text-sm text-brand-600 dark:text-brand-300 mb-3">Este contenido es para alumnos de Academia. Inicia sesión con tu cuenta para ver las lecciones completas de este curso.</p>' +
      '<a href="../login.html?next=' + nextParam + '" class="inline-block bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-5 py-2 rounded-lg transition-colors">Iniciar sesión →</a>' +
      "</div>";
    // Se destapan los botones de "Iniciar sesión" (la clase "hidden" de Tailwind manda
    // sobre el atributo cuando el elemento también lleva "flex").
    var access = document.getElementById("course-access-cta");
    if (access) { access.hidden = false; access.classList.remove("hidden"); access.classList.add("flex"); }
    var cta = document.getElementById("course-login-cta");
    if (cta) { cta.hidden = false; cta.classList.remove("hidden"); }
  }

  function showError() {
    contentBody.innerHTML = '<p class="text-sm text-red-500">No se pudo cargar el contenido de las lecciones. Recarga la página.</p>';
  }

  function inject(html) {
    contentBody.innerHTML = html;
    ["course-access-cta", "course-login-cta"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.hidden = true; el.classList.add("hidden"); el.classList.remove("flex"); }
    });
    if (window.Finales100) window.Finales100.init(contentBody);
    document.dispatchEvent(new CustomEvent("curso:contenido", { detail: { body: contentBody, curso: courseSlug } }));
    if (location.hash && location.hash.indexOf("#lec-") === 0) {
      var d = document.getElementById(location.hash.slice(1));
      if (d && d.tagName === "DETAILS") { d.open = true; d.scrollIntoView(); }
    }
  }

  function fetchAndInject() {
    fetch(contentUrl, { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("no_content");
        return r.text();
      })
      .then(inject)
      .catch(showError);
  }

  function hasSession() {
    if (!window.sb || !window.sb.auth) return Promise.resolve(false);
    return window.sb.auth
      .getSession()
      .then(function (res) {
        var session = res && res.data && res.data.session;
        return !!session;
      })
      .catch(function () { return false; });
  }

  hasSession().then(function (logged) {
    if (logged) fetchAndInject(); else showInformative();
  });
})();
