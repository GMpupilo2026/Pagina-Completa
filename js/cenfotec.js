/* La página del Desafío Mentes Maestras CENFOTEC 2026 (cenfotec-2026.html).
 *
 * Usa las mismas piezas que la del Centroamericano: el buscador, «Mis
 * jugadores», el podio, la clasificación, el proyector y la imagen para
 * compartir salen de js/centroamericano-vivo.js y js/centroamericano-tablas.js
 * («El podio» de arriba, de js/torneo-podio.js, y «Ediciones anteriores», de
 * js/torneo-ediciones.js), con los datos de chess-results que lee la Edge
 * Function sala-jugadores para la sala «cenfotec» de Torneos. Lo único propio
 * es window.TorneoPagina: la sala, el prefijo de lo guardado en el aparato, la
 * cara de la imagen para compartir (el azul y el logo de CENFOTEC) y la
 * edición 2025.
 *
 * Generado por herramientas/torneo-universitario.js desde
 * herramientas/torneos-universitarios/cenfotec-2026.js: no se edita a mano.
 * Tiene que cargar ANTES que esos módulos. Ver «Las páginas de los torneos
 * universitarios» en docs/decisiones/juegos-y-torneos.md.
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
    // Esta edición, como se llama en «Ediciones anteriores».
    edicion: "2026",
    // El mismo jugador escrito distinto en chess-results de un año a otro,
    // revisado a mano: el nombre viejo → el de esta edición.
    mismaPersona: { "Ocontrillo Rodriguez, Gerald": "Oconitrillo Rodriguez, Gerald" },
    // Las ediciones anteriores, de la más vieja a la más nueva, con la
    // clasificación final de chess-results de cada grupo: [puesto, nombre, puntos].
    ediciones: [
      {
        nombre: "2025", fecha: "2025-09-28",
        grupos: {
          "—": {
            tnr: 1259931,
            jugadores: [
              [1, "Ulloa Jimenez, Santiago", 6],
              [2, "Barrantes Granados, Ian Daniel", 5.5],
              [3, "Gutierrez Chavarria, Joseph", 5.5],
              [4, "Ramos Rodriguez, Daniel", 5],
              [5, "Miranda Flores, Samy Manuel", 5],
              [6, "Brizuela Hidalgo, Sebastian", 5],
              [7, "Aguirre Moya, David Andres", 5],
              [8, "Rojas Ordonez, Christian Gabriel", 4.5],
              [9, "Salazar Delgado, Aylin Naomi", 4.5],
              [10, "Hernandez Brenes, Keicy", 4.5],
              [11, "Gonzalez Barrantes, Aaron Yoreth", 4.5],
              [12, "Valverde Vega, Santiago", 4],
              [13, "Hincapie Salazar, Daniel", 4],
              [14, "Soto Sandi, Fabian", 4],
              [15, "Velasquez Mora, Steven Daniel", 4],
              [16, "Esquivel Elizondo, Jeremy", 4],
              [17, "Reyes Sarmiento, Aaron", 4],
              [18, "Castro Meza, Jose Alfredo", 4],
              [19, "Herrera Bonilla, Keison Jesus", 3.5],
              [20, "Dodaro Gamez, Alessandro", 3.5],
              [21, "Yep Chaves, Jesus Allen", 3.5],
              [22, "Malavasi Castro, Stefano", 3],
              [23, "Valverde Cordero, Juan Pablo", 3],
              [24, "Morales Monge, Andrey", 3],
              [25, "Leiton Rivas, Mariana", 3],
              [26, "Hernandez Zuniga, Mathias Alberto", 3],
              [27, "Vindas Gomez, Ashlie Valeria", 3],
              [28, "Ocontrillo Rodriguez, Gerald", 3],
              [29, "Miranda Fonseca, Gian Francisco", 3],
              [30, "Lopez Perez, Heddly Jefte", 2.5],
              [31, "Pictan, Esteban Guillermo", 2.5],
              [32, "Perez Franco, Andrew De Dojshua", 2],
              [33, "Munoz Araya, Dereck Daniel", 2],
              [34, "Jaubert Escudero, Mariam", 2],
              [35, "Jimenez Pacheco, Luis Esteban", 2],
              [36, "Mora Vasquez, Gabriel", 1.5],
              [37, "Murillo Lara, Kheysi Camila", 1],
              [38, "Calderon Brenes, Tiffany", 0],
              [39, "Ardon Porras, Andres", 0],
              [40, "Ortiz Montenegro, Yoycel", 0],
              [41, "Marin Gonzalez, Roncey", 0],
              [42, "Serrano Ruiz, Felipe", 0],
            ],
          },
        },
      },
    ],
  };
})();
