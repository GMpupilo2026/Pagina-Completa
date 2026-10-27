/* La página del II Torneo Universitario de Ajedrez UTN-CONARE 2026
 * (utn-2026.html). La misma que la de CENFOTEC (ver js/cenfotec.js): todo lo
 * arman js/centroamericano-vivo.js, js/centroamericano-tablas.js,
 * js/torneo-podio.js y js/torneo-ediciones.js con la sala «utn» de Torneos.
 * Lo propio:
 *
 * - Dos torneos en chess-results, uno por rama, sin la columna «Gr»: cada
 *   uno es un grupo (`grupos`, por su número de torneo), para que el puesto,
 *   el podio, la clasificación y el proyector vayan por rama y no mezclados.
 * - La cara de la imagen para compartir: el azul y el logo de la UTN.
 * - La primera edición (16 de agosto de 2026), rama por rama.
 *
 * Generado por herramientas/torneo-universitario.js desde
 * herramientas/torneos-universitarios/utn-2026.js: no se edita a mano.
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
    grupos: { 1498218: "Masculino", 1498221: "Femenino" },
    url: "ajedrez-integral.com/utn-2026.html",
    nombreCorto: "UTN-CONARE 2026",
    imgSub: "II Torneo Universitario de Ajedrez · Universidad Técnica Nacional",
    compartirTexto: (n) => n + " en el II Torneo Universitario de Ajedrez UTN-CONARE 2026:",
    imagen: {
      banda: "#193a70", tinta: "#193a70", acento: "#193a70", suave: "#f0f4fb",
      dibujo: "img/utn/logo.png", redondo: false, archivo: "utn-conare-2026",
      franjas: [["#bfcfe8", 1046], ["#193a70", 1060]],
    },
    // Esta edición, como se llama en «Ediciones anteriores».
    edicion: "II (setiembre 2026)",
    // Las ediciones anteriores, de la más vieja a la más nueva, con la
    // clasificación final de chess-results de cada grupo: [puesto, nombre, puntos].
    ediciones: [
      {
        nombre: "I (agosto 2026)", fecha: "2026-08-16",
        grupos: {
          "Femenino": {
            tnr: 1473963,
            jugadores: [
              [1, "Diaz Charpentier, Kristel Melissa", 5.5],
              [2, "Munoz Ramirez, Kyara Vanessa", 5],
              [3, "Canales Chinchilla, Victoria", 4],
              [4, "Salazar Gould, Kristy Valeria", 3.5],
              [5, "Salazar Delgado, Aylin Naomy", 3],
              [6, "Sanchez Sanchez, Karen Eliza", 3],
              [7, "Lobo Meneses, Andrea Alejandra", 2.5],
              [8, "Araya Mera, Marisa Raquel", 2.5],
              [9, "Bermudez Hernandez, Amanda", 2.5],
              [10, "Villalta Leiton, Nicole Tamara", 2],
              [11, "Arguedas Bolanos, Sharline", 2],
              [12, "Rodriguez Pena, Ashley Soad", 1.5],
              [13, "Castillo Morales, Thais", 0],
              [14, "Campos Astorga, Priscila", 0],
              [15, "Mendez Arguedas, Deilyn", 0],
            ],
          },
          "Masculino": {
            tnr: 1473962,
            jugadores: [
              [1, "Cabezas Solano, David Alejandro", 5.5],
              [2, "Ramirez Madrid, Gerardo Alfonso", 5],
              [3, "Cartin Aguilar, Luis Javier", 4],
              [4, "Vargas Arguedas, Caleb", 4],
              [5, "Mora Chavarria, Sebastian Noel", 4],
              [6, "Montero Romero, Dany Jose", 4],
              [7, "Barboza Viquez, Martin Eduardo", 3.5],
              [8, "Coto Calderon, Juan Diego", 3.5],
              [9, "Lopez Bustos, David", 3.5],
              [10, "Ulloa Jimenez, Santiago", 3],
              [11, "Quesada Fallas, Esteban", 3],
              [12, "Aguero Espinoza, Sebasthian", 3],
              [13, "Rojas Ordonez, Christian Gabriel", 3],
              [14, "Chaves Olazo, Axel Andrey", 2.5],
              [15, "Pomares Mendez, Noel David", 2.5],
              [16, "Leon Cubero, Anthony", 2.5],
              [17, "Castillo Aragon, Jeremy Joshua", 2.5],
              [18, "Rojas Anchia, Miguel Andres", 2],
              [19, "Gutierrez Ceciliano, Carlos Roberto", 2],
              [20, "Peralta Marin, Isaac Emanuel", 1.5],
              [21, "Rodriguez Gonzalez, Santiago", 1.5],
              [22, "Cordoba Sevilla, Justin", 0],
              [23, "Mayorga Villegas, Jordy Josue", 0],
            ],
          },
        },
      },
    ],
  };
})();
