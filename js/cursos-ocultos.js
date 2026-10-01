/**
 * Ajedrez Integral — los cursos que alumnos y profesores no ven.
 *
 * Estos cursos siguen en el repositorio y quien administra los sigue abriendo
 * (para revisarlos o terminarlos), pero dentro de la Academia no aparecen: ni
 * en «Mis cursos», ni en el material de la clase, ni en tareas o exámenes, ni
 * en «Sigue con tu curso». Ver «Los cursos escondidos» en
 * docs/decisiones/cursos-y-material.md.
 *
 * Esto decide qué se PINTA. Lo que no deja bajar el contenido es worker.js
 * (OCULTOS, la misma lista: verificar-worker.js comprueba que no se separen),
 * que para estos cursos pregunta puede_bajar() sin que el acceso baste: solo
 * pasan administración y quien compró ese material en la tienda.
 *
 *     CursosOcultos.es(slug)        // ¿está en la lista?
 *     CursosOcultos.visible(slug)   // ¿lo ve quien mira? (pide AccesoAdmin.init() antes)
 */
(function () {
  "use strict";

  var SLUGS = [
    "fundamentos-del-ajedrez",
    "aperturas-y-defensas",
    "calculo-y-visualizacion",
    "finales-practicos",
    "estrategia-y-tactica",
    "preparacion-para-torneos",
  ];

  function es(slug) { return SLUGS.indexOf(String(slug || "")) !== -1; }

  window.CursosOcultos = {
    SLUGS: SLUGS.slice(),
    es: es,
    // Sin AccesoAdmin cargado responde que no: el peor caso es que quien
    // administra no lo vea, nunca que lo vea un alumno. esAdmin() ya respeta
    // «Ver como»: con «Ver como: profesor» queda escondido, como lo ve un profe.
    visible: function (slug) {
      if (!es(slug)) return true;
      return !!(window.AccesoAdmin && window.AccesoAdmin.esAdmin());
    },
  };
})();
