/* La página de la Eliminatoria Cantonal JDN CCDRPZ – ADAPZ 2026
 * (jdn-pz-2026.html). La misma que la del Centroamericano: todo lo arman
 * js/centroamericano-vivo.js, js/centroamericano-tablas.js y
 * js/torneo-hoy.js; los resultados, Pareo Integral. Lo propio:
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
    // Los datos, de Pareo Integral (js/torneo-pareo-datos.js), no de chess-results.
    fuente: "pareo", fuenteNombre: "Pareo Integral",
    pareo: { nombre: "JDN CCDRPZ", desde: "2026-11-01" },
    ordenGrupos: ["U12 Absoluto", "U12 Femenino", "U16 Absoluto", "U16 Femenino", "U20 Absoluto", "U20 Femenino"],
    // La clase del botón «Ver la partida en vivo» (js/torneo-en-vivo.js).
    botonVivo: "pz-boton",
    // Lo que dice «Hoy en el torneo» (js/torneo-hoy.js) cuando el torneo ya terminó.
    hoy: { termino: "La eliminatoria terminó", gracias: "¡Gracias por jugar!", final: "La clasificación final de cada categoría está en «Resultados U12» y «Resultados U20»." },
    url: "ajedrez-integral.com/jdn-pz-2026.html",
    nombreCorto: "Eliminatoria JDN Pérez Zeledón 2026",
    imgSub: "Eliminatoria Cantonal JDN · CCDR Pérez Zeledón · ADAPZ",
    compartirTexto: (n) => n + " en la Eliminatoria Cantonal JDN de Pérez Zeledón 2026:",
    // Los textos propios, en lugar de los del Centroamericano (el certificado, «Así terminó mi torneo», «¡Hoy juega!», el calendario).
    textos: {
      finTexto: (n) => "Así terminó la Eliminatoria JDN de Pérez Zeledón para " + n + ":",
      dipPodio: (p, cat) => "por obtener el " + (p === 1 ? "1.er" : p === 3 ? "3.er" : p + ".º") + " lugar en la categoría " + cat,
      hjLugar: "Hotel del Sur, Pérez Zeledón",
      hjMensaje: (n, r, m, cuando, dias) => "📣 ¡" + (dias === 0 ? "Hoy juega " : dias === 1 ? "Mañana juega " : "Juega ") + n + "! Ronda " + r + ", mesa " + m + (cuando ? ", " + cuando.charAt(0).toLowerCase() + cuando.slice(1) : "") + ", en la Eliminatoria JDN de Pérez Zeledón.",
      imgAntes: "La eliminatoria es el domingo 22 de noviembre",
      diaTexto: (titulo) => titulo + " en la Eliminatoria JDN de Pérez Zeledón:",
      numTitulo: "La eliminatoria en números",
      numTexto: "La Eliminatoria JDN de Pérez Zeledón en números:",
      imgResumenSub: "Eliminatoria JDN · Pérez Zeledón 2026",
      whatsappTitulo: (pais, r) => pais + " — Ronda " + r + ", Eliminatoria JDN Pérez Zeledón",
      calRonda: (r, nombre) => "Ronda " + r + " · " + nombre + " — Eliminatoria JDN Pérez Zeledón",
      calLugar: "Hotel del Sur, Pérez Zeledón, Costa Rica",
      calNombre: (nombre) => "Rondas de " + nombre + " · Eliminatoria JDN Pérez Zeledón",
    },
    // La cara del certificado: el evento, la sede, los colores, la mascota, el marco y el escudo.
    diploma: {
      evento: "Eliminatoria Cantonal JDN · Pérez Zeledón 2026",
      lugar: "Hotel del Sur · Pérez Zeledón · domingo 22 de noviembre de 2026",
      fondo: ["#1f3a7a","#142a5c"],
      pildora: "#1d64b0",
      sombra: "rgba(10, 20, 48, 0.5)",
      dibujo: null,
      hojas: null,
      escudo: "img/adapz/logo.jpg",
      escudoDerecha: "img/adapz/ccdr-pz.jpg",
      marco: [["#4aa3e3",22,44],["#ffffff",6,74]],
    },
    imagen: {
      banda: "#1f3a7a", tinta: "#1f3a7a", acento: "#1f3a7a", suave: "#eef6fd",
      dibujo: "img/adapz/logo.jpg", redondo: true, archivo: "eliminatoria-jdn-pz-2026",
      franjas: [["#4aa3e3", 1046], ["#1f3a7a", 1060]],
    },
  };
})();

/*! rev bfb5bbb0d2d82f9f */
