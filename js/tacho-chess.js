/* La página del Torneo Intereducativo Tacho Chess 2 del Liceo Anastasio
 * Alfaro (tacho-chess-2.html). La misma que la del Centroamericano: la cuenta
 * regresiva la arma js/torneo-hoy.js. Lo propio:
 *
 * - La cara de la imagen para compartir: el azul y el rojo del afiche y Tacho.
 * - Los textos de «Hoy en el torneo» cuando el torneo ya terminó (`hoy`).
 *
 * Generado por herramientas/torneo-universitario.js desde
 * herramientas/torneos-universitarios/tacho-chess-2.js: no se edita a mano.
 * Tiene que cargar ANTES que esos módulos. Ver «Las páginas de los torneos
 * universitarios» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  // Colores medidos sobre su fondo real (ver la cabecera de css/universidades.css):
  // blanco sobre #064CA7 8,08 y sobre #042A69 13,63; blanco sobre el rojo #DC0D19 5,1; #B80F1C sobre #EEF3FB 6,1.
  window.TorneoPagina = {
    sala: "tacho-chess-2",
    guardado: "tacho",
    soloPodio: true,
    // Los datos, de Pareo Integral (js/torneo-pareo-datos.js), no de chess-results.
    fuente: "pareo", fuenteNombre: "Pareo Integral",
    pareo: { nombre: "tacho", desde: "2026-10-01" },
    ordenGrupos: ["Primer grado", "Segundo grado", "Tercer grado", "Cuarto grado", "Quinto grado", "Sexto grado", "Sétimo año", "Octavo año", "Noveno año", "Décimo año", "Undécimo año"],
    // Lo que dice «Hoy en el torneo» (js/torneo-hoy.js) cuando el torneo ya terminó.
    hoy: { termino: "Tacho Chess 2 terminó", gracias: "¡Gracias por jugar!", final: "Los mejores de cada nivel, de primer grado a undécimo año, reciben su premio." },
    url: "ajedrez-integral.com/tacho-chess-2.html",
    nombreCorto: "Tacho Chess 2",
    imgSub: "Torneo Intereducativo · Liceo Anastasio Alfaro",
    compartirTexto: (n) => n + " en el Torneo Intereducativo Tacho Chess 2:",
    imagen: {
      banda: "#042a69", tinta: "#042a69", acento: "#dc0d19", suave: "#eef3fb",
      dibujo: "img/tacho-chess-2/mascota.png", redondo: false, archivo: "tacho-chess-2",
      franjas: [["#dc0d19", 1046], ["#042a69", 1060]],
    },
  };
})();

/*! rev bfb5bbb0d2d82f9f */
