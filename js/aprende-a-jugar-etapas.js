/* Ajedrez Integral — Aprende a jugar: las 18 etapas y 110 niveles.

   Son las lecciones de lichess.org/learn: las mismas etapas en el mismo
   orden, cada nivel con su misma posición, sus mismas estrellas, sus mismas
   jugadas para tres estrellas y sus mismas condiciones de éxito y de fallo.
   Lichess es software libre (lila, licencia AGPL; las posiciones salen de
   ui/learn/src/stage/*.ts). Los textos están escritos de nuevo, en español
   de acá y con tuteo.

   Ninguna posición se inventó, y tampoco se dan por buenas porque vienen de
   Lichess: herramientas/verificar-aprende-a-jugar.js juega cada nivel con el
   motor de la página (js/aprende-a-jugar-motor.js) y comprueba que se gana
   con las jugadas que pide para tres estrellas.

   Cada nivel:
     fen        la posición (el bando que mueve es el del alumno, salvo que
                el nivel diga `color`);
     estrellas  las casillas con estrella;
     jugadas    cuántas jugadas hacen falta para tres estrellas;
     meta       lo que se le pide;
     flechas    "e2e7" (verde), "e5a1:rojo", "c7f7:amarillo", "e3a7:azul";
                una casilla sola ("e1") es un círculo;
     exito / fallo  condiciones (AprendeMotor.C); sin `exito`, se gana al
                juntar todas las estrellas (o con cualquier jugada que no
                pierda nada, si no hay estrellas);
     guion      jugadas en UCI: las del alumno y las del rival, alternadas.
   Es un script clásico: deja `APRENDE_ETAPAS` y `APRENDE_CATEGORIAS`
   globales. En node se exporta. */
(function (raiz) {
  "use strict";
  const M = raiz.AprendeMotor || (typeof require === "function" ? require("./aprende-a-jugar-motor.js") : null);
  const C = M.C;

  const MENOS = "Cuantas menos jugadas hagas, más puntos ganas.";
  const COME_SIN_PERDER = "Come las piezas negras sin perder ninguna de las tuyas.";

  const etapa = (e, comun) => Object.assign(e, {
    niveles: e.niveles.map((n, i) => M.prepararNivel(Object.assign({}, typeof comun === "function" ? comun() : comun, n), i)),
  });

  /* ---------------- Las piezas de ajedrez ---------------- */
  const torre = etapa({
    clave: "torre", pieza: "r", titulo: "La torre", subtitulo: "Se mueve en línea recta",
    intro: "La torre es una pieza poderosa: recorre su fila y su columna de punta a punta. ¿Te animas a manejarla?",
    final: "¡Ya sabes mover la torre!",
    niveles: [
      { meta: "Haz clic en la torre y llévala hasta la estrella.", fen: "8/8/8/8/8/8/4R3/8 w - -", estrellas: "e7", jugadas: 1, flechas: ["e2e7"] },
      { meta: "Junta todas las estrellas.", fen: "8/2R5/8/8/8/8/8/8 w - -", estrellas: "c5 g5", jugadas: 2, flechas: ["c7c5", "c5g5"] },
      { meta: MENOS, fen: "8/8/8/8/3R4/8/8/8 w - -", estrellas: "a4 g3 g4", jugadas: 3 },
      { meta: MENOS, fen: "7R/8/8/8/8/8/8/8 w - -", estrellas: "f8 g1 g7 g8 h7", jugadas: 5 },
      { meta: "Usa las dos torres para llegar antes.", fen: "8/1R6/8/8/3R4/8/8/8 w - -", estrellas: "a4 g3 g7 h4", jugadas: 4 },
      { meta: "Usa las dos torres para llegar antes.", fen: "8/8/8/8/8/5R2/8/R7 w - -", estrellas: "b7 d1 d5 f2 f7 g4 g7", jugadas: 7 },
    ],
  }, {});

  const alfil = etapa({
    clave: "alfil", pieza: "b", titulo: "El alfil", subtitulo: "Se mueve en diagonal",
    intro: "El alfil se mueve en diagonal, tan lejos como quiera. Por eso nunca cambia el color de su casilla.",
    final: "¡Ya sabes mover el alfil!",
    niveles: [
      { meta: "Junta las estrellas con el alfil: se mueve en diagonal.", fen: "8/8/8/8/8/5B2/8/8 w - -", estrellas: "d5 g8", jugadas: 2, flechas: ["f3d5", "d5g8"] },
      { meta: MENOS, fen: "8/8/8/8/8/1B6/8/8 w - -", estrellas: "a2 b1 b5 d1 d3 e2", jugadas: 6 },
      { meta: MENOS, fen: "8/8/8/8/3B4/8/8/8 w - -", estrellas: "a1 b6 c1 e3 g7 h6", jugadas: 6 },
      { meta: MENOS, fen: "8/8/8/8/2B5/8/8/8 w - -", estrellas: "a4 b1 b3 c2 d3 e2", jugadas: 6 },
      { meta: "Un alfil va por las casillas claras y el otro por las oscuras: necesitas los dos.", fen: "8/8/8/8/8/8/8/2B2B2 w - -", estrellas: "d3 d4 d5 e3 e4 e5", jugadas: 6 },
      { meta: "Un alfil va por las casillas claras y el otro por las oscuras: necesitas los dos.", fen: "8/3B4/8/8/8/2B5/8/8 w - -", estrellas: "a3 c2 e7 f5 f6 g8 h4 h7", jugadas: 11 },
    ],
  }, {});

  const dama = etapa({
    clave: "dama", pieza: "q", titulo: "La dama", subtitulo: "La torre y el alfil juntos",
    intro: "La dama es la pieza más fuerte: se mueve como una torre y como un alfil a la vez.",
    final: "¡Ya sabes mover la dama!",
    niveles: [
      { meta: "Junta las estrellas: la dama va en línea recta y en diagonal.", fen: "8/8/8/8/8/8/4Q3/8 w - -", estrellas: "e5 b8", jugadas: 2, flechas: ["e2e5", "e5b8"] },
      { meta: MENOS, fen: "8/8/8/8/3Q4/8/8/8 w - -", estrellas: "a3 f2 f8 h3", jugadas: 4 },
      { meta: MENOS, fen: "8/8/8/8/2Q5/8/8/8 w - -", estrellas: "a3 d6 f1 f8 g3 h6", jugadas: 6 },
      { meta: MENOS, fen: "8/6Q1/8/8/8/8/8/8 w - -", estrellas: "a2 b5 d3 g1 g8 h2 h5", jugadas: 7 },
      { meta: MENOS, fen: "8/8/8/8/8/8/8/4Q3 w - -", estrellas: "a6 d1 f2 f6 g6 g8 h1 h4", jugadas: 9 },
    ],
  }, {});

  const rey = etapa({
    clave: "rey", pieza: "k", titulo: "El rey", subtitulo: "La pieza más importante",
    intro: "El rey es la pieza más importante: si lo atrapan, se pierde la partida. Es lento: avanza una sola casilla, hacia cualquier lado.",
    final: "¡Ya sabes mover al rey!",
    niveles: [
      { meta: "El rey se mueve una casilla en cualquier dirección. Llévalo a la estrella.", fen: "8/8/8/8/8/3K4/8/8 w - -", estrellas: "e6", jugadas: 3, flechas: ["d3d4", "d4d5", "d5e6"] },
      { meta: "Junta todas las estrellas.", fen: "8/8/8/8/8/8/8/4K3 w - -", estrellas: "c2 d3 e2 e3", jugadas: 4 },
      { meta: "El rey también puede ir hacia atrás. Junta todas las estrellas.", fen: "8/8/8/4K3/8/8/8/8 w - -", estrellas: "b5 c5 d6 e3 f3 g4", jugadas: 8 },
    ],
  }, { estrellasVacias: true });

  const caballo = etapa({
    clave: "caballo", pieza: "n", titulo: "El caballo", subtitulo: "Se mueve en L",
    intro: "El caballo es la pieza más rara: salta en forma de L, dos casillas derecho y una de lado. Y es la única que puede saltar por encima de las demás.",
    final: "¡Ya sabes mover el caballo!",
    niveles: [
      { meta: "El caballo salta en forma de L. Junta las estrellas.", fen: "8/8/8/8/4N3/8/8/8 w - -", estrellas: "c5 d7", jugadas: 2, flechas: ["e4c5", "c5d7"] },
      { meta: "El caballo cae siempre en una casilla del otro color. Junta todas las estrellas.", fen: "8/8/8/8/8/8/8/1N6 w - -", estrellas: "c3 d4 e2 f3 f7 g5 h8", jugadas: 8 },
      { meta: MENOS, fen: "8/2N5/8/8/8/8/8/8 w - -", estrellas: "b6 d5 d7 e6 f4", jugadas: 5 },
      { meta: "Las casillas de al lado son las más difíciles de alcanzar para el caballo.", fen: "8/8/8/8/5N2/8/8/8 w - -", estrellas: "e3 e4 e5 f3 f5 g3 g4 g5", jugadas: 9 },
      { meta: MENOS, fen: "8/8/8/8/8/3N4/8/8 w - -", estrellas: "c3 e2 e4 f2 f4 g6", jugadas: 6 },
      { meta: MENOS, fen: "8/2N5/8/8/8/8/8/8 w - -", estrellas: "b4 b5 c6 c8 d4 d5 e3 e7 f5", jugadas: 9 },
    ],
  }, {});

  const peon = etapa({
    clave: "peon", pieza: "p", titulo: "El peón", subtitulo: "Solo avanza",
    intro: "Los peones son los más débiles, pero los más valientes: nunca retroceden. Y si uno llega al final del tablero, se convierte en la pieza que quieras.",
    final: "¡Ya sabes mover los peones!",
    niveles: [
      { meta: "El peón avanza una casilla a la vez. Al llegar al final se corona: elige dama y ve por la estrella.", fen: "8/8/8/P7/8/8/8/8 w - -", estrellas: "f3", jugadas: 4, flechas: ["a5a6", "a6a7", "a7a8", "a8f3"] },
      { meta: "Casi siempre conviene coronar dama. Junta todas las estrellas.", fen: "8/8/8/5P2/8/8/8/8 w - -", estrellas: "b6 c4 d7 e5 a8", jugadas: 8 },
      { meta: "El peón avanza derecho, pero come en diagonal. Junta las estrellas comiendo.", fen: "8/8/8/8/8/4P3/8/8 w - -", estrellas: "c6 d5 d7", jugadas: 4, flechas: ["e3e4", "e4d5", "d5c6", "c6d7"], fallo: C.algoFueraDe("e3 e4 c6 d5 d7") },
      { meta: "Come las estrellas y después corona.", fen: "8/8/8/8/8/1P6/8/8 w - -", estrellas: "b4 b6 c4 c6 c7 d6", jugadas: 8 },
      { meta: "Come las estrellas y después corona.", fen: "8/8/8/8/8/3P4/8/8 w - -", estrellas: "c4 b5 b6 d5 d7 e6 c8", jugadas: 8, fallo: C.peonBlancoEnAlguna("b5 d4 d6 c7") },
      { meta: "Usa todos los peones. No hace falta coronar.", fen: "8/8/8/8/8/P1PP3P/8/8 w - -", estrellas: "b5 c5 d4 e5 g4", jugadas: 7 },
      { meta: "Desde su casilla de salida, el peón puede avanzar dos casillas de una vez.", fen: "8/8/8/8/8/8/4P3/8 w - -", estrellas: "d6", jugadas: 3, flechas: ["e2e4"], fallo: C.peonBlancoEnAlguna("e3"), resaltarFila: 2 },
      { meta: "Junta todas las estrellas. No hace falta coronar.", fen: "8/8/8/8/8/8/2PPPP2/8 w - -", estrellas: "c5 d5 e5 f5 d3 e4", jugadas: 9 },
    ],
  }, {});

  /* ---------------- Básico ---------------- */
  const capturar = etapa({
    clave: "capturar", icono: "⚔️", titulo: "Capturar", subtitulo: "Come las piezas del rival",
    intro: "Para comer una pieza del rival, lleva tu pieza a su casilla: la del rival sale del tablero.",
    final: "¡Ya sabes comer piezas!",
    niveles: [
      { meta: "Come las piezas negras.", fen: "8/2p2p2/8/8/8/2R5/8/8 w - -", jugadas: 2, capturas: 2, flechas: ["c3c7", "c7f7"] },
      { meta: COME_SIN_PERDER, fen: "8/2r2p2/8/8/5Q2/8/8/8 w - -", jugadas: 2, capturas: 2, flechas: ["f4c7", "f4f7:rojo", "c7f7:amarillo"] },
      { meta: COME_SIN_PERDER, fen: "8/5r2/8/1r3p2/8/3B4/8/8 w - -", jugadas: 5, capturas: 3 },
      { meta: COME_SIN_PERDER, fen: "8/5b2/5p2/3n2p1/8/6Q1/8/8 w - -", jugadas: 7, capturas: 4 },
      { meta: COME_SIN_PERDER, fen: "8/3b4/2p2q2/8/3p1N2/8/8/8 w - -", jugadas: 6, capturas: 4 },
    ],
  }, { puntosPorCaptura: true, exito: C.sinPiezas("b") });

  const proteger = etapa({
    clave: "proteger", icono: "🛡️", titulo: "Proteger", subtitulo: "Cuida tus piezas",
    intro: "Ya sabes comer piezas. Ahora toca lo contrario: que el rival no te coma las tuyas.",
    final: "¡Ya sabes proteger tus piezas!",
    niveles: [
      { meta: "Te atacan una pieza: ¡sácala de ahí!", fen: "8/8/8/4bb2/8/8/P2P4/R2K4 w - -", flechas: ["e5a1:rojo", "a1c1"] },
      { meta: "Te atacan una pieza: ¡sácala de ahí!", fen: "8/8/2q2N2/8/8/8/8/8 w - -" },
      { meta: "Si no puede escapar, protégela con otra pieza.", fen: "8/N2q4/8/8/8/8/6R1/8 w - -", guion: [{ jugada: "g2a2", flechas: ["a2a7"] }] },
      { meta: "Si no puede escapar, protégela con otra pieza.", fen: "8/8/1Bq5/8/2P5/8/8/8 w - -" },
      { meta: "Si no puede escapar, protégela con otra pieza.", fen: "1r6/8/5b2/8/8/5N2/P2P4/R1B5 w - -", flechas: ["f6a1:rojo", "d2d4"] },
      { meta: "No dejes que te coman ninguna pieza sin protección.", fen: "8/1b6/8/8/8/3P2P1/5NRP/r7 w - -" },
      { meta: "No dejes que te coman ninguna pieza sin protección.", fen: "rr6/3q4/4n3/4P1B1/7P/P7/1B1N1PP1/R5K1 w - -" },
      { meta: "No dejes que te coman ninguna pieza sin protección.", fen: "8/3q4/8/1N3R2/8/2PB4/8/8 w - -" },
    ],
  }, { jugadas: 1 });

  const combate = etapa({
    clave: "combate", icono: "🤺", titulo: "Combate", subtitulo: "Ataca y defiende",
    intro: "Junta lo que aprendiste: come las piezas del rival y cuida las tuyas.",
    final: "¡Sabes atacar y defenderte al mismo tiempo!",
    niveles: [
      { meta: COME_SIN_PERDER, fen: "8/8/8/8/P2r4/6B1/8/8 w - -", jugadas: 3, capturas: 1, flechas: ["a4a5", "g3f2", "f2d4", "d4a4:amarillo"] },
      { meta: COME_SIN_PERDER, fen: "2r5/8/3b4/2P5/8/1P6/2B5/8 w - -", jugadas: 4, capturas: 2 },
      { meta: COME_SIN_PERDER, fen: "1r6/8/5n2/3P4/4P1P1/1Q6/8/8 w - -", jugadas: 4, capturas: 2 },
      { meta: COME_SIN_PERDER, fen: "2r5/8/3N4/5b2/8/8/PPP5/8 w - -", jugadas: 4, capturas: 2 },
      { meta: COME_SIN_PERDER, fen: "8/6q1/8/4P1P1/8/4B3/r2P2N1/8 w - -", jugadas: 8, capturas: 2 },
    ],
  }, { puntosPorCaptura: true, exito: C.sinPiezas("b") });

  const jaqueEnUna = etapa({
    clave: "jaque-en-una", icono: "♚", titulo: "Jaque en una", subtitulo: "Ataca al rey rival",
    intro: "Dar jaque es atacar al rey. El rival está obligado a salir del jaque en su jugada.",
    final: "¡Ya sabes dar jaque!",
    niveles: [
      { fen: "4k3/8/2b5/8/8/8/8/R7 w - -", flechas: ["a1e1"] },
      { fen: "8/8/4k3/3n4/8/1Q6/8/8 w - -" },
      { fen: "3qk3/1pp5/3p4/4p3/8/3B4/6r1/8 w - -" },
      { fen: "2r2q2/2n5/8/4k3/8/2N1P3/3P2B1/8 w - -" },
      { fen: "8/2b1q2n/1ppk4/2N5/8/8/8/8 w - -" },
      { fen: "6R1/1k3r2/8/4Q3/8/2n5/8/8 w - -" },
      { fen: "7r/4k3/8/3n4/4N3/8/2R5/4Q3 w - -" },
    ],
  }, { meta: "Da jaque al rey negro en una jugada.", jugadas: 1, fallo: C.no(C.jaque), exito: C.jaque });

  const salirDelJaque = etapa({
    clave: "salir-del-jaque", icono: "🆘", titulo: "Salir del jaque", subtitulo: "Defiende a tu rey",
    intro: "Si tu rey está en jaque, tienes que salvarlo ya: moviéndolo, tapando el ataque o comiendo la pieza que lo ataca.",
    final: "¡Ya sabes salir del jaque!",
    niveles: [
      { meta: "Estás en jaque: escapa con el rey.", fen: "8/8/8/4q3/8/8/8/4K3 w - -", flechas: ["e5e1:rojo", "e1f1"] },
      { meta: "Estás en jaque: escapa con el rey.", fen: "8/2n5/5b2/8/2K5/8/2q5/8 w - -" },
      { meta: "El rey no puede escapar, pero puedes tapar el ataque.", fen: "8/7r/6r1/8/R7/7K/8/8 w - -" },
      { meta: "También sales del jaque comiendo la pieza que lo da.", fen: "8/8/8/3b4/8/4N3/KBn5/1R6 w - -" },
      { meta: "Ese caballo da jaque saltando por encima de tus piezas: ¡cómelo!", fen: "4q3/8/8/8/8/5nb1/3PPP2/3QKBNr w - -" },
      { meta: "Escapa con el rey o tapa el ataque.", fen: "8/8/7p/2q5/5n2/1N1KP2r/3R4/8 w - -" },
      { meta: "Escapa con el rey o tapa el ataque.", fen: "8/6b1/8/8/q4P2/2KN4/3P4/8 w - -" },
    ],
  }, { detectarCaptura: false, ofrecerIlegales: true, jugadas: 1 });

  const mateEnUna = etapa({
    clave: "mate-en-una", icono: "🏆", titulo: "Mate en una", subtitulo: "Gana la partida",
    intro: "Ganas la partida cuando le das jaque al rey rival y no tiene cómo salir: eso es el jaque mate.",
    final: "¡Ya sabes dar jaque mate!",
    niveles: [
      { fen: "3qk3/3ppp2/8/8/2B5/5Q2/8/8 w - -", flechas: ["f3f7"] },
      { fen: "6rk/6pp/7P/6N1/8/8/8/8 w - -" },
      { fen: "R7/8/7k/2r5/5n2/8/6Q1/8 w - -" },
      { fen: "2rb4/2k5/5N2/1Q6/8/8/8/8 w - -" },
      { fen: "1r2kb2/ppB1p3/2P2p2/2p1N3/B7/8/8/3R4 w - -" },
      { fen: "8/pk1N4/n7/b7/6B1/1r3b2/8/1RR5 w - -", guion: [{ jugada: "g4f3", flechas: ["b1b7:amarillo", "f3b7:amarillo"] }] },
      { fen: "r1b5/ppp5/2N2kpN/5q2/8/Q7/8/4B3 w - -" },
    ],
  }, { meta: "Da jaque mate en una jugada: ataca al rey de forma que no tenga escapatoria.", jugadas: 1, fallo: C.no(C.mate), exito: C.mate, seguirTrasFallo: true });

  /* ---------------- Intermedio ---------------- */
  const tablero = etapa({
    clave: "tablero", icono: "♟️", titulo: "El tablero", subtitulo: "Cómo empieza la partida",
    intro: "Antes de jugar hay que saber acomodar las piezas. Las dos partes lo hacen igual, una frente a la otra.",
    final: "¡Ya sabes acomodar las piezas!",
    niveles: [
      { meta: "Esta es la posición con la que empieza toda partida. Haz cualquier jugada para seguir.", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - -", jugadas: 1 },
      { meta: "Primero las torres: van en las esquinas.", fen: "r6r/pppppppp/8/8/8/8/8/2RR4 w - -", estrellas: "a1 h1", jugadas: 2, flechas: ["c1a1", "d1h1"], exito: C.y(C.piezaEn("R", "a1"), C.piezaEn("R", "h1")) },
      { meta: "Después los caballos, al lado de las torres.", fen: "rn4nr/pppppppp/8/8/8/8/2NN4/R6R w - -", estrellas: "b1 g1", jugadas: 4, exito: C.y(C.piezaEn("N", "b1"), C.piezaEn("N", "g1")) },
      { meta: "Los alfiles, al lado de los caballos.", fen: "rnb2bnr/pppppppp/8/8/4BB2/8/8/RN4NR w - -", estrellas: "c1 f1", jugadas: 4, exito: C.y(C.piezaEn("B", "c1"), C.piezaEn("B", "f1")) },
      { meta: "La dama va en la casilla de su color: la dama blanca, en la casilla blanca.", fen: "rnbq1bnr/pppppppp/8/8/5Q2/8/8/RNB2BNR w - -", estrellas: "d1", jugadas: 2, exito: C.piezaEn("Q", "d1") },
      { meta: "El rey va en la última casilla libre, al lado de su dama.", fen: "rnbqkbnr/pppppppp/8/8/5K2/8/8/RNBQ1BNR w - -", estrellas: "e1", jugadas: 3, exito: C.piezaEn("K", "e1") },
      { meta: "Los peones forman la fila de adelante. Haz cualquier jugada para seguir.", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - -", jugadas: 1, resaltarFila: 2 },
    ],
  }, {});

  const corto = C.ultimaJugada("O-O"), largo = C.ultimaJugada("O-O-O");
  const sinCorto = (k) => C.y(C.no(corto), C.o(C.piezaNoEn("K", "e1"), C.piezaNoEn("R", "h1"), C.mate, C.piezaNoEn("k", k)));
  const sinLargo = (k) => C.y(C.no(largo), C.o(C.piezaNoEn("K", "e1"), C.piezaNoEn("R", "a1"), C.mate, C.piezaNoEn("k", k)));
  const enroque = etapa({
    clave: "enroque", icono: "🏰", titulo: "El enroque", subtitulo: "La jugada especial del rey",
    intro: "Con el enroque mueves dos piezas a la vez: el rey va dos casillas hacia una torre y la torre salta al otro lado del rey. Pone al rey a salvo y saca la torre.",
    final: "¡Ya sabes enrocar!",
    niveles: [
      { meta: "Enroca corto: mueve el rey dos casillas hacia la derecha.", fen: "rnbqkbnr/pppppppp/8/8/2B5/4PN2/PPPP1PPP/RNBQK2R w KQkq -", jugadas: 1, flechas: ["e1g1"], exito: corto, fallo: sinCorto("e8") },
      { meta: "Enroca largo: mueve el rey dos casillas hacia la izquierda.", fen: "rnbqkbnr/pppppppp/8/8/4P3/1PN5/PBPPQPPP/R3KBNR w KQkq -", jugadas: 1, flechas: ["e1c1"], exito: largo, fallo: sinLargo("e8") },
      { meta: "Hay un caballo en el camino. Sácalo y enroca corto.", fen: "rnbqkbnr/pppppppp/8/8/8/4P3/PPPPBPPP/RNBQK1NR w KQkq -", jugadas: 2, flechas: ["e1g1", "g1f3"], exito: corto, fallo: sinCorto("e8") },
      { meta: "Enroca corto. Antes tienes que despejar el camino.", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -", jugadas: 4, flechas: ["e1g1"], exito: corto, fallo: sinCorto("e8") },
      { meta: "Enroca largo. Antes tienes que despejar el camino.", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -", jugadas: 6, flechas: ["e1c1"], exito: largo, fallo: sinLargo("e8") },
      { meta: "Esta torre ya se movió: con ella ya no puedes enrocar. Enroca largo.", fen: "rnbqkbnr/pppppppp/8/8/3P4/1PN1PN2/PBPQBPPP/R3K1R1 w Qkq -", jugadas: 1, flechas: ["e1g1:rojo", "e1c1"], exito: largo, fallo: sinLargo("e8") },
      { meta: "No puedes enrocar si el rey está en jaque o pasa por una casilla atacada. Tapa el ataque y enroca corto.", fen: "rn1qkbnr/ppp1pppp/3p4/8/2b5/4PN2/PPPP1PPP/RNBQK2R w KQkq -", jugadas: 2, flechas: ["c4f1:rojo", "e1", "f1", "g1"], exito: corto, fallo: sinCorto("e8"), detectarCaptura: false },
      { meta: "Busca la forma de enrocar corto.", fen: "rnb2rk1/pppppppp/8/8/8/4Nb1n/PPPP1P1P/RNB1KB1R w KQkq -", jugadas: 2, flechas: ["e1g1"], exito: corto, fallo: sinCorto("g8"), detectarCaptura: false },
      { meta: "Busca la forma de enrocar largo.", fen: "1r1k2nr/p2ppppp/7b/7b/4P3/2nP4/P1P2P2/RN2K3 w Q -", jugadas: 4, flechas: ["e1c1"], exito: largo, fallo: sinLargo("d8"), detectarCaptura: false },
    ],
  }, {});

  const alPaso = etapa({
    clave: "al-paso", icono: "♙", titulo: "Captura al paso", subtitulo: "La jugada especial del peón",
    intro: "Si un peón rival avanza dos casillas y queda justo al lado de tu peón, puedes comerlo como si hubiera avanzado una sola. Pero solo en la jugada siguiente.",
    final: "¡Ya sabes comer al paso!",
    niveles: [
      { meta: "Las negras acaban de avanzar su peón dos casillas. ¡Cómelo al paso!", fen: "rnbqkbnr/pppppppp/8/2P5/8/8/PP1PPPPP/RNBQKBNR b KQkq -", jugadas: 1, capturas: 1, guion: [{ jugada: "d7d5", flechas: ["c5d6"] }, "c5d6"] },
      { meta: "Comer al paso solo vale en la jugada inmediata: después ya no se puede.", fen: "rnbqkbnr/ppp1pppp/8/2Pp3P/8/8/PP1PPPP1/RNBQKBNR b KQkq -", jugadas: 1, capturas: 1, guion: [{ jugada: "g7g5", flechas: ["h5g6", "c5d6:rojo"] }, "h5g6"] },
      { meta: "Para comer al paso, tu peón tiene que estar en la quinta fila.", fen: "rnbqkbnr/pppppppp/P7/2P5/8/8/PP1PPPP1/RNBQKBNR b KQkq -", jugadas: 1, capturas: 1, guion: [{ jugada: "b7b5", flechas: ["c5b6", "a6b7:rojo"] }, "c5b6"], resaltarFila: 5 },
      { meta: "Come al paso todos los peones.", fen: "rnbqkbnr/pppppppp/8/2PPP2P/8/8/PP1P1PP1/RNBQKBNR b KQkq -", jugadas: 4, capturas: 4, guion: ["b7b5", "c5b6", "f7f5", "e5f6", "c7c5", "d5c6", "g7g5", "h5g6"] },
    ],
  }, { color: "w", detectarCaptura: false, exito: C.guionCompleto, fallo: C.guionFallado });

  const ahogado = etapa({
    clave: "ahogado", icono: "🤝", titulo: "El ahogado", subtitulo: "La partida es tablas",
    intro: "Si al rival le toca jugar, no está en jaque y no tiene ninguna jugada legal, está ahogado: la partida termina en tablas. Aquí vas a ahogar al rey negro para aprender a reconocerlo… y a evitarlo cuando vas ganando.",
    final: "¡Ya sabes qué es el ahogado! Cuando vas ganando, cuídate de no ahogar al rival.",
    niveles: [
      { fen: "k7/8/8/6B1/8/1R6/8/8 w - -", flechas: ["g5e3"], guion: [{ jugada: "g5e3", flechas: ["e3a7:azul", "b3b7:azul", "b3b8:azul", "a7", "b7", "b8"] }] },
      { fen: "8/7p/4N2k/8/8/3N4/8/1K6 w - -", guion: [{ jugada: "d3f4", flechas: ["e6g7:azul", "e6g5:azul", "f4g6:azul", "f4h5:azul", "g7", "g5", "g6", "h5"] }] },
      { fen: "4k3/6p1/5p2/p4P2/PpB2N2/1K6/8/3R4 w - -", guion: [{ jugada: "f4g6", flechas: ["c4f7:azul", "d1d8:azul", "g6e7:azul", "g6f8:azul"] }] },
      { fen: "8/6pk/6np/7K/8/3B4/8/1R6 w - -", guion: [{ jugada: "b1b8", flechas: ["b8g8:azul", "b8h8:azul", "d3h7:rojo", "g6e7:rojo"] }] },
      { fen: "7R/pk6/p1pP4/K7/3BB2p/7p/1r5P/8 w - -", guion: [{ jugada: "d4b2", flechas: ["h8a8:azul", "a5b6:azul", "d6c7:azul", "e4b7:rojo", "c6c5:rojo"] }] },
    ],
  }, { meta: "Ahoga al rey negro: déjalo sin ninguna jugada legal, pero sin darle jaque.", detectarCaptura: false, jugadas: 1, botonSiguiente: true, seguirTrasFallo: true, exito: C.guionCompleto, fallo: C.guionFallado });

  /* ---------------- Avanzado ---------------- */
  const valor = etapa({
    clave: "valor", icono: "⚖️", titulo: "El valor de las piezas", subtitulo: "Cuánto vale cada una",
    intro: "Las piezas que más se mueven valen más. Dama = 9, torre = 5, alfil = 3, caballo = 3, peón = 1. El rey no tiene precio: perderlo es perder la partida.",
    final: "¡Ya sabes cuánto vale cada pieza!",
    niveles: [
      { meta: "Come la pieza que más vale. La dama (9) vale más que el alfil (3).", fen: "8/8/2qrbnp1/3P4/8/8/8/8 w - -", guion: ["d5c6"], flechas: ["d5c6"], detectarCaptura: false },
      { meta: "Come la pieza que más vale, sin cambiar tu dama por una pieza que vale menos.", fen: "8/8/4b3/1p6/6r1/8/4Q3/8 w - -", guion: ["e2e6"], detectarCaptura: true },
      { meta: "Come la pieza que más vale… con una jugada legal.", fen: "5b2/8/6N1/2q5/3Kn3/2rp4/3B4/8 w - -", guion: ["d4e4"], ofrecerIlegales: true },
      { meta: "Come la pieza que más vale.", fen: "1k4q1/pp6/8/3B4/2P5/1P1p2P1/P3Kr1P/3n4 w - -", guion: ["e2d1"], ofrecerIlegales: true, detectarCaptura: false },
      { meta: "Come la pieza que más vale.", fen: "7k/3bqp1p/7r/5N2/6K1/6n1/PPP5/R1B5 w - -", guion: ["c1h6"], ofrecerIlegales: true },
    ],
  }, { jugadas: 1, capturas: 1, puntosPorCaptura: true, mostrarValores: true, exito: C.guionCompleto, fallo: C.guionFallado });

  const jaqueEnDos = etapa({
    clave: "jaque-en-dos", icono: "🎯", titulo: "Jaque en dos", subtitulo: "Dos jugadas para dar jaque",
    intro: "Ahora, dos jugadas para llegar al rey: la primera prepara el jaque (sin dejar ninguna pieza que te puedan comer) y la segunda lo da.",
    final: "¡Ya sabes preparar un jaque!",
    niveles: [
      { fen: "2k5/2pb4/8/2R5/8/8/8/8 w - -", flechas: ["c5a5", "a5a8"] },
      { fen: "8/8/5k2/8/8/1N6/5b2/8 w - -" },
      { fen: "6k1/2r3pp/8/1N6/8/8/4B3/8 w - -" },
      { fen: "r3k3/7b/8/4B3/8/8/4N3/4R3 w - -" },
      { fen: "r1bqkb1r/pppp1p1p/2n2np1/4p3/2B5/4PN2/PPPP1PPP/RNBQK2R w KQkq -" },
      { fen: "8/8/8/2k5/q7/4N3/3B4/8 w - -" },
      { fen: "r6r/1Q2nk2/1B3p2/8/8/8/8/8 w - -" },
    ],
  }, () => ({ meta: "Busca la forma de dar jaque en dos jugadas.", jugadas: 2, fallo: C.sinJaqueEn(2), exito: C.jaqueEn(2) }));

  const CATEGORIAS = [
    { clave: "piezas", nombre: "Las piezas de ajedrez", etapas: [torre, alfil, dama, rey, caballo, peon] },
    { clave: "basico", nombre: "Básico", etapas: [capturar, proteger, combate, jaqueEnUna, salirDelJaque, mateEnUna] },
    { clave: "intermedio", nombre: "Intermedio", etapas: [tablero, enroque, alPaso, ahogado] },
    { clave: "avanzado", nombre: "Avanzado", etapas: [valor, jaqueEnDos] },
  ];
  const ETAPAS = CATEGORIAS.reduce((a, c) => a.concat(c.etapas.map((e) => Object.assign(e, { categoria: c.clave }))), []);
  ETAPAS.forEach((e, i) => { e.numero = i + 1; });

  raiz.APRENDE_ETAPAS = ETAPAS;
  raiz.APRENDE_CATEGORIAS = CATEGORIAS;
  if (typeof module !== "undefined" && module.exports) module.exports = { ETAPAS, CATEGORIAS };
})(typeof window !== "undefined" ? window : globalThis);
