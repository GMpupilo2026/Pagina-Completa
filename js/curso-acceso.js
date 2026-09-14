/**
 * Ajedrez Integral — acceso al contenido completo de un curso.
 *
 * Regla: cualquier cuenta de Academia con sesión iniciada ve el curso entero.
 * No hay inscripción aparte ni botón de WhatsApp en las páginas de cursos.
 *
 * Qué hace en cada página cursos/<curso>.html:
 *   1. Pide el fragmento protegido (cursos/protegido/<curso>.html).
 *   2. Si el Worker responde 403 (falta la cookie `curso_ok`), mira si el navegador
 *      tiene una sesión de Academia (Supabase). Si la tiene, la canjea por la cookie
 *      en /api/curso-auth-session y vuelve a pedir el fragmento: el alumno entra sin
 *      hacer nada más. Si no la tiene, muestra el aviso de iniciar sesión (con "next"
 *      para volver a este curso) y destapa los botones de "Iniciar sesión" de la página.
 *   3. Tras inyectar el fragmento avisa a los visores que lo necesiten
 *      (window.Finales100 en "Los 100 finales") y abre la lección del #hash.
 *
 * Requiere: <div id="course-content-body" data-course="slug">, y opcionalmente
 * #course-access-cta y #course-login-cta (se muestran solo sin sesión). Usa
 * window.sb si js/supabase-client.js está cargado; sin él, se comporta como antes
 * (pide iniciar sesión).
 */
(function () {
  "use strict";

  var contentBody = document.getElementById("course-content-body");
  if (!contentBody) return;
  var courseSlug = contentBody.dataset.course;
  var contentUrl = "protegido/" + courseSlug + ".html";
  var nextParam = encodeURIComponent("cursos/" + courseSlug + ".html");

  function fetchContent() {
    return fetch(contentUrl, { credentials: "same-origin" }).then(function (r) {
      if (r.status === 403) throw new Error("no_session");
      if (!r.ok) throw new Error("no_content");
      return r.text();
    });
  }

  // Canjea la sesión de Academia por la cookie del Worker. Devuelve true si lo logró.
  function exchangeSession() {
    if (!window.sb || !window.sb.auth) return Promise.resolve(false);
    return window.sb.auth
      .getSession()
      .then(function (res) {
        var session = res && res.data && res.data.session;
        if (!session || !session.access_token) return false;
        return fetch("/api/curso-auth-session", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: session.access_token }),
        }).then(function (r) { return r.ok; });
      })
      .catch(function () { return false; });
  }

  function showLogin() {
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

  fetchContent()
    .then(inject)
    .catch(function (err) {
      if (!(err && err.message === "no_session")) { showError(); return; }
      exchangeSession().then(function (ok) {
        if (!ok) { showLogin(); return; }
        fetchContent().then(inject).catch(function (e2) {
          if (e2 && e2.message === "no_session") showLogin(); else showError();
        });
      });
    });
})();
