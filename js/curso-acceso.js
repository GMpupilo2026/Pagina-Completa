/**
 * Ajedrez Integral — carga del contenido de un curso.
 *
 * Los cursos son públicos: no hay contraseña, ni inicio de sesión, ni ninguna
 * otra restricción para ver las lecciones completas ni para descargar sus
 * presentaciones y PDF de ejercicios. Este script solo trae el fragmento con
 * las lecciones (cursos/protegido/<curso>.html — el nombre de la carpeta es
 * histórico) y lo inyecta en la página.
 *
 * Tras inyectarlo avisa a los visores que lo necesiten (window.Finales100 en
 * "Los 100 finales", y el evento "curso:contenido" para cualquier otro) y abre
 * la lección a la que apunte el #hash.
 *
 * Requiere: <div id="course-content-body" data-course="slug">.
 */
(function () {
  "use strict";

  var contentBody = document.getElementById("course-content-body");
  if (!contentBody) return;
  var courseSlug = contentBody.dataset.course;

  function inject(html) {
    contentBody.innerHTML = html;
    if (window.Finales100) window.Finales100.init(contentBody);
    document.dispatchEvent(new CustomEvent("curso:contenido", { detail: { body: contentBody, curso: courseSlug } }));
    if (location.hash && location.hash.indexOf("#lec-") === 0) {
      var d = document.getElementById(location.hash.slice(1));
      if (d && d.tagName === "DETAILS") { d.open = true; d.scrollIntoView(); }
    }
  }

  fetch("protegido/" + courseSlug + ".html", { credentials: "same-origin" })
    .then(function (r) {
      if (!r.ok) throw new Error("no_content");
      return r.text();
    })
    .then(inject)
    .catch(function () {
      contentBody.innerHTML = '<p class="text-sm text-red-500">No se pudo cargar el contenido de las lecciones. Recarga la página.</p>';
    });
})();
