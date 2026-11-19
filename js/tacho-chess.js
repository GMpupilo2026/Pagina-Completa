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
    // Cada mesa sobre la foto de la sala (js/torneo-sala-foto.js): [número, x, y] en los píxeles de la foto.
    mesasSala: {
      foto: [1200, 675],
      torneos: [
        {
          nombre: "1er Ciclo", color: "morada", fondo: "#6b21a8",
          niveles: ["Primer grado", "Segundo grado", "Tercer grado"],
          mesas: [[1, 775, 329], [2, 786, 342], [3, 801, 345], [4, 808, 354], [5, 830, 362], [6, 848, 378], [7, 858, 328], [8, 870, 337], [9, 886, 345], [10, 902, 357]],
        },
        {
          nombre: "2do Ciclo", color: "azul", fondo: "#1d4ed8",
          niveles: ["Cuarto grado", "Quinto grado", "Sexto grado"],
          mesas: [[1, 631, 329], [2, 635, 339], [3, 626, 349], [4, 643, 354], [5, 636, 366], [6, 652, 377], [7, 641, 384], [8, 656, 399], [9, 703, 329], [10, 715, 338], [11, 722, 346], [12, 717, 359]],
        },
        {
          nombre: "Tercer Ciclo", color: "naranja", fondo: "#a84a00",
          niveles: ["Sétimo año", "Octavo año"],
          mesas: [[1, 490, 324], [2, 485, 340], [3, 468, 346], [4, 475, 359], [5, 449, 364], [6, 438, 376], [7, 431, 389], [8, 558, 333], [9, 550, 344], [10, 541, 353], [11, 539, 366], [12, 533, 378]],
        },
        {
          nombre: "Diversificada", color: "turquesa", fondo: "#0b6e66",
          niveles: ["Noveno año", "Décimo año", "Undécimo año"],
          mesas: [[1, 337, 335], [2, 324, 340], [3, 312, 346], [4, 297, 352], [5, 257, 364], [6, 243, 372], [7, 220, 382], [8, 195, 394], [9, 408, 333], [10, 396, 342], [11, 381, 353], [12, 359, 366], [13, 341, 375], [14, 327, 385], [15, 305, 400]],
        },
      ],
    },
    // Lo que dice «Hoy en el torneo» (js/torneo-hoy.js) cuando el torneo ya terminó.
    hoy: { termino: "Tacho Chess 2 terminó", gracias: "¡Gracias por jugar!", final: "Los mejores de cada nivel, de primer grado a undécimo año, reciben su premio." },
    url: "ajedrez-integral.com/tacho-chess-2.html",
    nombreCorto: "Tacho Chess 2",
    imgSub: "Torneo Intereducativo · Liceo Anastasio Alfaro",
    compartirTexto: (n) => n + " en el Torneo Intereducativo Tacho Chess 2:",
    // Los textos propios, en lugar de los del Centroamericano (el certificado, «Así terminó mi torneo», «¡Hoy juega!», el calendario).
    textos: {
      finTexto: (n) => "Así terminó el Tacho Chess 2 para " + n + ":",
      dipPodio: (p, cat) => "por obtener el " + (p === 1 ? "1.er" : p === 3 ? "3.er" : p + ".º") + " lugar en " + cat,
      dipParticipa: (cat) => "por su participación en " + cat,
      hjLugar: "Gimnasio del Centro, Liceo Anastasio Alfaro",
      hjMensaje: (n, r, m, cuando, dias) => "📣 ¡" + (dias === 0 ? "Hoy juega " : dias === 1 ? "Mañana juega " : "Juega ") + n + "! Ronda " + r + ", mesa " + m + (cuando ? ", " + cuando.charAt(0).toLowerCase() + cuando.slice(1) : "") + ", en el Tacho Chess 2.",
      imgAntes: "El torneo es el sábado 14 de noviembre",
      diaTexto: (titulo) => titulo + " en el Tacho Chess 2:",
      numTitulo: "El torneo en números",
      numTexto: "El Tacho Chess 2 en números:",
      imgResumenSub: "Tacho Chess 2 · Liceo Anastasio Alfaro",
      invictos: "Invictos de cada nivel",
      podios: "Los podios de cada nivel",
      puestosTitulo: "Su puesto en su nivel después de cada ronda:",
      calRonda: (r, nombre) => "Ronda " + r + " · " + nombre + " — Tacho Chess 2",
      calCategoria: (cat) => "Nivel: " + cat + ".",
      calLugar: "Gimnasio del Centro, Liceo Anastasio Alfaro, San José, Costa Rica",
      calNombre: (nombre) => "Rondas de " + nombre + " · Tacho Chess 2",
    },
    // La cara del certificado: el evento, la sede, los colores, la mascota, el marco y el escudo.
    diploma: {
      evento: "Torneo Intereducativo Tacho Chess 2",
      lugar: "Gimnasio del Centro, Liceo Anastasio Alfaro · San José · 14 de noviembre de 2026",
      fondo: ["#064ca7","#042a69"],
      pildora: "#dc0d19",
      sombra: "rgba(2, 18, 48, 0.5)",
      dibujo: "img/tacho-chess-2/mascota.png",
      hojas: null,
      escudo: "img/tacho-chess-2/logo-liceo.png",
      marco: [["#dc0d19",22,44],["#ffffff",6,74]],
    },
    imagen: {
      banda: "#042a69", tinta: "#042a69", acento: "#dc0d19", suave: "#eef3fb",
      dibujo: "img/tacho-chess-2/mascota.png", redondo: false, archivo: "tacho-chess-2",
      franjas: [["#dc0d19", 1046], ["#042a69", 1060]],
    },
  };
})();

/*! rev bfb5bbb0d2d82f9f */
