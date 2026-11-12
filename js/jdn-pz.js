/* La página de la Eliminatoria Cantonal JDN CCDRPZ – ADAPZ 2026
 * (jdn-pz-2026.html). La misma que la del Centroamericano: todo lo arman
 * js/centroamericano-vivo.js, js/centroamericano-tablas.js y
 * js/torneo-hoy.js con la sala «jdn-pz-2026» de Torneos. Lo propio:
 *
 * - La cara de la imagen para compartir: el azul y el logo de la ADAPZ,
 *   redondo (el logo es un JPG con su fondo blanco).
 * - Los textos de «Hoy en el torneo» cuando el torneo ya terminó (`hoy`).
 *
 * Generado por herramientas/torneo-universitario.js desde
 * herramientas/torneos-universitarios/jdn-pz-2026.js: no se edita a mano.
 * Tiene que cargar ANTES que esos módulos. Ver «Las páginas de los torneos
 * universitarios» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  // Colores medidos sobre su fondo real (ver la cabecera de css/universidades.css):
  // blanco sobre #1F3A7A 10,80; #1F3A7A sobre blanco 10,80 y sobre #EEF6FD 9,89.
  window.TorneoPagina = {
    sala: "jdn-pz-2026",
    guardado: "jdnpz",
    soloPodio: true,
    // Lo que dice «Hoy en el torneo» (js/torneo-hoy.js) cuando el torneo ya terminó.
    hoy: { termino: "La eliminatoria terminó", gracias: "¡Gracias por jugar!", final: "La clasificación final de cada categoría está en «Clasificación» y «El podio»." },
    url: "ajedrez-integral.com/jdn-pz-2026.html",
    nombreCorto: "Eliminatoria JDN Pérez Zeledón 2026",
    imgSub: "Eliminatoria Cantonal JDN · CCDR Pérez Zeledón · ADAPZ",
    compartirTexto: (n) => n + " en la Eliminatoria Cantonal JDN de Pérez Zeledón 2026:",
    imagen: {
      banda: "#1f3a7a", tinta: "#1f3a7a", acento: "#1f3a7a", suave: "#eef6fd",
      dibujo: "img/adapz/logo.jpg", redondo: true, archivo: "eliminatoria-jdn-pz-2026",
      franjas: [["#4aa3e3", 1046], ["#1f3a7a", 1060]],
    },
  };
})();

/*! rev bfb5bbb0d2d82f9f */
