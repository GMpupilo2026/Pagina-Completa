/* La configuración de utn-2026.html, la página del II Torneo Universitario
 * de Ajedrez UTN-CONARE 2026. De aquí salen la página y js/utn.js con
 * herramientas/torneo-universitario.js (ver su cabecera).
 *
 * Son dos torneos en chess-results, uno por rama, sin la columna «Gr»: cada
 * uno es un grupo (`grupos`, por su número de torneo), para que el puesto,
 * el podio, la clasificación y el proyector vayan por rama y no mezclados.
 * Los datos (fecha, sala, ritmo, rondas, árbitros) son los de sus fichas.
 *
 * La edición anterior es la primera: el Torneo CONARE 2026 del 16 de agosto,
 * también de la UTN y en la misma sede (tnr1473963 el femenino, tnr1473962
 * el absoluto, que aquí es la rama masculina, como en esta edición). Su
 * clasificación final de chess-results, como la guarda uni_resultados
 * (herramientas/universidades/cargar.sql), copiada el 25/10/2026.
 */
module.exports = {
  pagina: "utn-2026.html",
  config: "js/utn.js",
  clase: "utn",
  foco: "#2c5aa0",
  titulo: "Torneo Universitario UTN-CONARE 2026 — resultados y clasificación",
  descripcion: "El II Torneo Universitario de Ajedrez UTN-CONARE 2026, femenino y masculino: el podio de cada rama, la clasificación final, las rondas y el rendimiento de cada jugador, las partidas y la comparación con la primera edición.",
  nombrePie: "Torneo UTN-CONARE 2026",
  grupoNombre: "Rama",
  comentario: `La página del II Torneo Universitario de Ajedrez UTN-CONARE 2026: la
misma que la de CENFOTEC (css/centroamericano.css y
css/universidades.css; js/centroamericano-vivo.js, -tablas.js y
js/torneo-podio.js, configurados por js/utn.js), con la cara de la
Universidad Técnica Nacional. Son dos torneos en chess-results, uno
por rama (tnr1498221 el femenino, tnr1498218 el masculino); sus datos
(fecha, sala, ritmo, rondas, árbitros) salen de sus fichas. Ver «Las
páginas de los torneos universitarios» en
docs/decisiones/juegos-y-torneos.md.`,
  logo: { src: "img/utn/logo.png", ancho: 410, alto: 313, alt: "Universidad Técnica Nacional" },
  portada: {
    pildora: "Universidad Técnica Nacional · CONARE",
    titulo: "II Torneo Universitario de Ajedrez",
    subtitulo: "UTN-CONARE 2026",
    caja: ["Femenino", "Masculino"],
    datos: [
      ["📅", "Fecha", "Domingo 27 de setiembre de 2026"],
      ["📍", "Sede", "CFPTE de la Universidad Técnica Nacional, Desamparados de Alajuela"],
      ["♟️", "Ritmo", "6 rondas, 15 minutos + 10 segundos por jugada"],
    ],
  },
  organiza: "Universidad Técnica Nacional y CONARE",
  equipo: [
    ["Dirección del torneo", "Marlin Porras Cubero"],
    ["Árbitra principal", "Kristel Jimenez Salas"],
    ["Árbitros", "Pamela Maria Porras Chavarria y Jose Alexis Rivera Gonzalez"],
  ],
  buscador: {
    texto: "Escribe su nombre o su apellido: te decimos en qué puesto quedó en su rama, sus puntos, contra quién jugó cada ronda, su rendimiento y cómo le fue en la primera edición.",
    ejemplo: "Salazar",
  },
  fichas: [
    { href: "https://s1.chess-results.com/tnr1498221.aspx?lan=2", id: "ficha-femenino", externo: true, ventana: "Femenino en chess-results", color: "morado", icono: "♛", titulo: "Femenino en chess-results", texto: "La ficha oficial de la rama femenina: inscritas, pareos, resultados y clasificación.", accion: "Abrir chess-results" },
    { href: "https://s3.chess-results.com/tnr1498218.aspx?lan=2", id: "ficha-masculino", externo: true, ventana: "Masculino en chess-results", color: "azul", icono: "♚", titulo: "Masculino en chess-results", texto: "La ficha oficial de la rama masculina: inscritos, pareos, resultados y clasificación.", accion: "Abrir chess-results" },
    { href: "transmision.html?torneo=utn", id: "ficha-partidas", ventana: "Las partidas", color: "rojo", icono: "♟️", titulo: "Las partidas", texto: "La sala de la transmisión de Lichess: cada tablero, jugada a jugada, con las posiciones de las dos ramas al lado.", accion: "Entrar a la sala" },
    { href: "#clasificacion", color: "morado", icono: "🏆", titulo: "Clasificación final", texto: "Las 10 jugadoras y los 26 jugadores en su puesto, con los puntos y el rendimiento de cada uno.", accion: "Ver la clasificación" },
    { href: "#medallero", color: "naranja", icono: "🥇", titulo: "El podio", texto: "Los tres primeros lugares de cada rama, con sus puntos.", accion: "Ver el podio" },
    { href: "#proyector", color: "azul", icono: "📺", titulo: "Para proyectar", texto: "La clasificación final de cada rama en letra grande, para una pantalla o una premiación.", accion: "Abrir en grande" },
  ],
  colorEdiciones: "verde",
  textoEdiciones: "Los campeones de cada edición y quién volvió de la primera, con su puesto en cada una.",
  despedida: { href: "torneos-en-vivo.html", ventana: "Más torneos", texto: "¿Quieres ver más? Aquí están los demás torneos que se transmiten en Ajedrez Integral.", accion: "Ver los torneos" },
  dialogos: {
    podio: "Los tres primeros lugares de cada rama, según la clasificación final de chess-results.",
    clasificacion: "Cada rama entera, en el orden de chess-results, con los puntos y el rendimiento de cada uno.",
    ediciones: "Los campeones de cada edición y los jugadores que volvieron, rama por rama, con su puesto en cada una, según las clasificaciones finales de chess-results.",
  },
  pie: [
    { href: "#clasificacion", texto: "Clasificación final" },
    { href: "#ediciones", texto: "Ediciones anteriores" },
    { href: "transmision.html?torneo=utn", ventana: "Las partidas", texto: "Las partidas" },
    { href: "https://s1.chess-results.com/tnr1498221.aspx?lan=2", externo: true, ventana: "Femenino en chess-results", texto: "Femenino en chess-results" },
    { href: "https://s3.chess-results.com/tnr1498218.aspx?lan=2", externo: true, ventana: "Masculino en chess-results", texto: "Masculino en chess-results" },
  ],
  cabeceraJs: `La página del II Torneo Universitario de Ajedrez UTN-CONARE 2026
(utn-2026.html). La misma que la de CENFOTEC (ver js/cenfotec.js): todo lo
arman js/centroamericano-vivo.js, js/centroamericano-tablas.js,
js/torneo-podio.js y js/torneo-ediciones.js con la sala «utn» de Torneos.
Lo propio:

- Dos torneos en chess-results, uno por rama, sin la columna «Gr»: cada
  uno es un grupo (\`grupos\`, por su número de torneo), para que el puesto,
  el podio, la clasificación y el proyector vayan por rama y no mezclados.
- La cara de la imagen para compartir: el azul y el logo de la UTN.
- La primera edición (16 de agosto de 2026), rama por rama.`,
  contraste: "blanco sobre #193A70 11,17; #193A70 sobre blanco 11,17 y sobre #F0F4FB 10,12.",
  torneoPagina: {
    sala: "utn",
    guardado: "utn",
    grupos: { 1498221: "Femenino", 1498218: "Masculino" },
    nombreCorto: "UTN-CONARE 2026",
    imgSub: "II Torneo Universitario de Ajedrez · Universidad Técnica Nacional",
    compartir: "en el II Torneo Universitario de Ajedrez UTN-CONARE 2026:",
    imagen: { banda: "#193a70", tinta: "#193a70", acento: "#193a70", suave: "#f0f4fb", archivo: "utn-conare-2026", franjas: [["#bfcfe8", 1046], ["#193a70", 1060]] },
  },
  edicion: "II (setiembre 2026)",
  ediciones: [
    {
      nombre: "I (agosto 2026)", fecha: "2026-08-16",
      grupos: {
        Femenino: {
          tnr: 1473963,
          jugadores: [
            [1, "Diaz Charpentier, Kristel Melissa", 5.5], [2, "Munoz Ramirez, Kyara Vanessa", 5], [3, "Canales Chinchilla, Victoria", 4],
            [4, "Salazar Gould, Kristy Valeria", 3.5], [5, "Salazar Delgado, Aylin Naomy", 3], [6, "Sanchez Sanchez, Karen Eliza", 3],
            [7, "Lobo Meneses, Andrea Alejandra", 2.5], [8, "Araya Mera, Marisa Raquel", 2.5], [9, "Bermudez Hernandez, Amanda", 2.5],
            [10, "Villalta Leiton, Nicole Tamara", 2], [11, "Arguedas Bolanos, Sharline", 2], [12, "Rodriguez Pena, Ashley Soad", 1.5],
            [13, "Castillo Morales, Thais", 0], [14, "Campos Astorga, Priscila", 0], [15, "Mendez Arguedas, Deilyn", 0],
          ],
        },
        Masculino: {
          tnr: 1473962,
          jugadores: [
            [1, "Cabezas Solano, David Alejandro", 5.5], [2, "Ramirez Madrid, Gerardo Alfonso", 5], [3, "Cartin Aguilar, Luis Javier", 4],
            [4, "Vargas Arguedas, Caleb", 4], [5, "Mora Chavarria, Sebastian Noel", 4], [6, "Montero Romero, Dany Jose", 4],
            [7, "Barboza Viquez, Martin Eduardo", 3.5], [8, "Coto Calderon, Juan Diego", 3.5], [9, "Lopez Bustos, David", 3.5],
            [10, "Ulloa Jimenez, Santiago", 3], [11, "Quesada Fallas, Esteban", 3], [12, "Aguero Espinoza, Sebasthian", 3],
            [13, "Rojas Ordonez, Christian Gabriel", 3], [14, "Chaves Olazo, Axel Andrey", 2.5], [15, "Pomares Mendez, Noel David", 2.5],
            [16, "Leon Cubero, Anthony", 2.5], [17, "Castillo Aragon, Jeremy Joshua", 2.5], [18, "Rojas Anchia, Miguel Andres", 2],
            [19, "Gutierrez Ceciliano, Carlos Roberto", 2], [20, "Peralta Marin, Isaac Emanuel", 1.5], [21, "Rodriguez Gonzalez, Santiago", 1.5],
            [22, "Cordoba Sevilla, Justin", 0], [23, "Mayorga Villegas, Jordy Josue", 0],
          ],
        },
      },
    },
  ],
};
