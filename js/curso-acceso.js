/**
 * Ajedrez Integral — carga del contenido completo de un curso.
 *
 * Los cursos son abiertos: no hay inscripción, clave ni inicio de sesión. Cada página
 * cursos/<curso>.html trae el temario y este script le agrega el contenido completo
 * (cursos/protegido/<curso>.html: lecciones, recursos y, en "Los 100 finales", los
 * tableros interactivos). La carpeta se sigue llamando "protegido" por historia; el
 * Worker ya no la bloquea.
 *
 * Requiere <div id="course-content-body" data-course="slug">. Tras inyectar el
 * fragmento avisa a los visores que lo necesiten (window.Finales100) y abre la
 * lección indicada en el #hash (#lec-...).
 */
(function () {
  "use strict";

  var contentBody = document.getElementById("course-content-body");
  if (!contentBody) return;
  var courseSlug = contentBody.dataset.course;

  fetch("protegido/" + courseSlug + ".html", { credentials: "same-origin" })
    .then(function (r) {
      if (!r.ok) throw new Error("no_content");
      return r.text();
    })
    .then(function (html) {
      contentBody.innerHTML = html;
      if (window.Finales100) window.Finales100.init(contentBody);
      document.dispatchEvent(new CustomEvent("curso:contenido", { detail: { body: contentBody, curso: courseSlug } }));
      if (location.hash && location.hash.indexOf("#lec-") === 0) {
        var d = document.getElementById(location.hash.slice(1));
        if (d && d.tagName === "DETAILS") { d.open = true; d.scrollIntoView(); }
      }
    })
    .catch(function () {
      contentBody.innerHTML = '<p class="text-sm text-red-500">No se pudo cargar el contenido de las lecciones. Recarga la página.</p>';
    });
})();
