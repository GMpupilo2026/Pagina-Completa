/* La página del II Torneo Universitario de Ajedrez UTN-CONARE 2026
 * (utn-2026.html). La misma que la de CENFOTEC (ver js/cenfotec.js): todo lo
 * arman js/centroamericano-vivo.js, js/centroamericano-tablas.js y
 * js/torneo-podio.js con la sala «utn» de Torneos. Lo propio:
 *
 * - Dos torneos en chess-results, uno por rama, sin la columna «Gr»: cada
 *   uno es un grupo (`grupos`, por su número de torneo), para que el puesto,
 *   el podio, la clasificación y el proyector vayan por rama y no mezclados.
 * - La cara de la imagen para compartir: el azul y el logo de la UTN.
 *
 * Tiene que cargar ANTES que esos módulos. Ver «Las páginas de los torneos
 * universitarios» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  // Colores medidos sobre su fondo real (ver la cabecera de css/universidades.css):
  // blanco sobre #193A70 11,17; #193A70 sobre blanco 11,17 y sobre #F0F4FB 10,12.
  window.TorneoPagina = {
    sala: "utn",
    guardado: "utn",
    soloPodio: true,
    grupos: { 1498221: "Femenino", 1498218: "Masculino" },
    url: "ajedrez-integral.com/utn-2026.html",
    nombreCorto: "UTN-CONARE 2026",
    imgSub: "II Torneo Universitario de Ajedrez · Universidad Técnica Nacional",
    compartirTexto: (n) => n + " en el II Torneo Universitario de Ajedrez UTN-CONARE 2026:",
    imagen: {
      banda: "#193a70", tinta: "#193a70", acento: "#193a70", suave: "#f0f4fb",
      dibujo: "img/utn/logo.png", redondo: false, archivo: "utn-conare-2026",
      franjas: [["#bfcfe8", 1046], ["#193a70", 1060]],
    },
  };
})();
