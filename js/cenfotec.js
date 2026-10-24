/* La página del Desafío Mentes Maestras CENFOTEC 2026 (cenfotec-2026.html).
 *
 * Usa las mismas piezas que la del Centroamericano: el buscador, «Mis
 * jugadores», el podio, la clasificación, el proyector y la imagen para
 * compartir salen de js/centroamericano-vivo.js y js/centroamericano-tablas.js
 * (y «El podio» de arriba, de js/torneo-podio.js), con los datos de
 * chess-results que lee la Edge Function sala-jugadores para la sala
 * «cenfotec» de Torneos. Lo único propio es window.TorneoPagina: la sala, el
 * prefijo de lo guardado en el aparato y la cara de la imagen para compartir
 * (el azul y el logo de CENFOTEC). Tiene que cargar ANTES que esos módulos.
 *
 * Ver «Las páginas de los torneos universitarios» en
 * docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  // Colores medidos sobre su fondo real (ver la cabecera de css/universidades.css):
  // blanco sobre #233065 12,48; #233065 sobre blanco 12,48 y sobre #EEF6FD 11,44.
  window.TorneoPagina = {
    sala: "cenfotec",
    guardado: "cft",
    soloPodio: true,
    url: "ajedrez-integral.com/cenfotec-2026.html",
    nombreCorto: "Mentes Maestras",
    imgSub: "Desafío Mentes Maestras 2026 · Universidad CENFOTEC",
    compartirTexto: (n) => n + " en el Desafío Mentes Maestras CENFOTEC 2026:",
    imagen: {
      banda: "#233065", tinta: "#233065", acento: "#233065", suave: "#eef6fd",
      dibujo: "img/cenfotec/logo.png", redondo: false, archivo: "mentes-maestras-2026",
      franjas: [["#23acf4", 1046], ["#233065", 1060]],
    },
  };
})();
