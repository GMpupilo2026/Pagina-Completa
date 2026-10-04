/* «La partida perdida»: el banco de retos (partida-perdida.html).
   LO GENERA herramientas/partida-perdida-generar.js: no se edita a mano.
   Cada `posicion` la calculó chess.js jugando `solucion` desde la salida. */
window.PARTIDA_PERDIDA = [
 {
  "id": 1,
  "titulo": "Caballos al frente",
  "jugadas": 2,
  "posicion": "rnbqkbnr/ppp1pppp/8/3p4/8/2N5/PPPPPPPP/R1BQKBNR",
  "solucion": [
   "Cc3",
   "d5"
  ],
  "pista": "Una jugada de cada uno."
 },
 {
  "id": 2,
  "titulo": "La dama madrugadora",
  "jugadas": 3,
  "posicion": "rnbqkbnr/pppp1ppp/4p3/7Q/8/4P3/PPPP1PPP/RNB1KBNR",
  "solucion": [
   "e3",
   "e6",
   "Dh5"
  ],
  "pista": "Las blancas jugaron dos veces y las negras una."
 },
 {
  "id": 3,
  "titulo": "Ida y vuelta",
  "jugadas": 3,
  "posicion": "rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR",
  "solucion": [
   "Cf3",
   "e5",
   "Cg1"
  ],
  "pista": "Las blancas no pueden quedarse quietas: tienen que mover algo… y volver."
 },
 {
  "id": 4,
  "titulo": "Como si nada",
  "jugadas": 4,
  "posicion": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
  "solucion": [
   "Cc3",
   "Cf6",
   "Cb1",
   "Cg8"
  ],
  "pista": "Después de cuatro jugadas, todo está como al principio. Los caballos son los únicos que pueden salir y volver tan rápido."
 },
 {
  "id": 5,
  "titulo": "Los reyes de paseo",
  "jugadas": 4,
  "posicion": "rnbq1bnr/ppppkppp/8/4p3/4P3/8/PPPPKPPP/RNBQ1BNR",
  "solucion": [
   "e4",
   "e5",
   "Re2",
   "Re7"
  ],
  "pista": "Los dos reyes salieron por la puerta que les abrió su peón."
 },
 {
  "id": 6,
  "titulo": "Cambio en el centro",
  "jugadas": 4,
  "posicion": "rnb1kbnr/ppp1pppp/8/3q4/8/8/PPPP1PPP/RNBQKBNR",
  "solucion": [
   "e4",
   "d5",
   "exd5",
   "Dxd5"
  ],
  "pista": "Faltan dos peones: uno capturó al otro, y alguien recapturó."
 },
 {
  "id": 7,
  "titulo": "El mate del loco",
  "jugadas": 4,
  "posicion": "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR",
  "solucion": [
   "f3",
   "e5",
   "g4",
   "Dh4#"
  ],
  "pista": "Es el jaque mate más rápido que existe."
 },
 {
  "id": 8,
  "titulo": "Mate en el centro",
  "jugadas": 5,
  "posicion": "rnbq1bnr/ppppkppp/8/4Q3/4P3/8/PPPP1PPP/RNB1KBNR",
  "solucion": [
   "e4",
   "e5",
   "Dh5",
   "Re7",
   "Dxe5#"
  ],
  "pista": "El rey negro salió a pasear y la dama blanca no lo perdonó."
 },
 {
  "id": 9,
  "titulo": "El peón que se cuela",
  "jugadas": 5,
  "posicion": "rnbqkbnr/ppp2ppp/3P4/8/8/8/PPP1PPPP/RNBQKBNR",
  "solucion": [
   "d4",
   "e5",
   "dxe5",
   "d6",
   "exd6"
  ],
  "pista": "El peón blanco de d6 no llegó caminando derecho: capturó dos veces."
 },
 {
  "id": 10,
  "titulo": "Torres cruzadas",
  "jugadas": 6,
  "posicion": "rnbqkbn1/ppppppp1/r7/7p/P7/7R/1PPPPPPP/1NBQKBNR",
  "solucion": [
   "a4",
   "h5",
   "Ta3",
   "Th6",
   "Th3",
   "Ta6"
  ],
  "pista": "Cada torre terminó del lado contrario al que salió."
 },
 {
  "id": 11,
  "titulo": "No es el que parece",
  "jugadas": 6,
  "posicion": "rnbqkbnr/ppp3pp/4p3/8/8/8/PPPP1PPP/RNBQKBNR",
  "solucion": [
   "e4",
   "d5",
   "exd5",
   "e6",
   "dxe6",
   "fxe6"
  ],
  "pista": "El peón negro de e6 no es el que empezó en e7."
 },
 {
  "id": 12,
  "titulo": "¿Y el caballo?",
  "jugadas": 6,
  "posicion": "r2qkbnr/pppbpppp/8/3p4/8/8/PPPPPPPP/RNBQKB1R",
  "solucion": [
   "Cf3",
   "d5",
   "Ce5",
   "Cd7",
   "Cxd7",
   "Axd7"
  ],
  "pista": "Un caballo de cada bando desapareció, y los dos se perdieron en la misma casilla."
 },
 {
  "id": 13,
  "titulo": "La dama que vuelve",
  "jugadas": 6,
  "posicion": "rnbqkbnr/pppp1ppp/4p3/8/8/3P4/PPP1PPPP/RNBQKBNR",
  "solucion": [
   "d3",
   "e6",
   "Dd2",
   "Dh4",
   "Dd1",
   "Dd8"
  ],
  "pista": "Parece que solo se movieron dos peones, pero fueron seis jugadas: las damas salieron y regresaron."
 },
 {
  "id": 14,
  "titulo": "Cambio de damas",
  "jugadas": 7,
  "posicion": "rnb1kbnr/pppp1ppp/8/4p3/3P4/8/PPP1PP1P/RNQ1KBNR",
  "solucion": [
   "g4",
   "e5",
   "g5",
   "Dxg5",
   "d4",
   "Dxc1",
   "Dxc1"
  ],
  "pista": "La dama negra hizo un viaje largo y se cobró un alfil antes de caer."
 },
 {
  "id": 15,
  "titulo": "Los dos enrocados",
  "jugadas": 8,
  "posicion": "rnbq1rk1/ppppbppp/4pn2/8/8/4PN2/PPPPBPPP/RNBQ1RK1",
  "solucion": [
   "Cf3",
   "Cf6",
   "e3",
   "e6",
   "Ae2",
   "Ae7",
   "O-O",
   "O-O"
  ],
  "pista": "Para enrocar corto hay que sacar antes el caballo y el alfil."
 },
 {
  "id": 16,
  "titulo": "Coronación relámpago",
  "jugadas": 9,
  "posicion": "rnbqkbQr/ppppp3/8/8/8/8/PPPP1PPP/RNBQKBNR",
  "solucion": [
   "e4",
   "f5",
   "exf5",
   "g6",
   "fxg6",
   "Cf6",
   "gxh7",
   "Cg8",
   "hxg8=D"
  ],
  "pista": "Un peón blanco capturó cuatro veces seguidas, la última coronando."
 },
 {
  "id": 17,
  "titulo": "Peones que cambian de columna",
  "jugadas": 9,
  "posicion": "rnbqkbnr/ppPppp1p/8/8/8/8/P1PPPKPP/RNBQ1BNR",
  "solucion": [
   "b4",
   "g5",
   "b5",
   "g4",
   "b6",
   "g3",
   "bxc7",
   "gxf2+",
   "Rxf2"
  ],
  "pista": "Los dos peones corrieron y capturaron a la vez; el rey blanco tuvo que defenderse."
 },
 {
  "id": 18,
  "titulo": "Corona, pero no en dama",
  "jugadas": 9,
  "posicion": "rnbNkb2/pppp1p1p/6r1/8/8/8/PPPPPPP1/RNBQKBNR",
  "solucion": [
   "h4",
   "g5",
   "hxg5",
   "Cf6",
   "gxf6",
   "Tg8",
   "fxe7",
   "Tg6",
   "exd8=C"
  ],
  "pista": "El peón blanco coronó en d8 capturando la dama… y eligió un caballo."
 },
 {
  "id": 19,
  "titulo": "El banquete de los caballos",
  "jugadas": 12,
  "posicion": "rNbqk2r/ppp1ppp1/8/8/8/8/PPP1PPP1/RnBQK2R",
  "solucion": [
   "Cf3",
   "Cf6",
   "Cg5",
   "Cg4",
   "Cxh7",
   "Cxh2",
   "Cxf8",
   "Cxf1",
   "Cxd7",
   "Cxd2",
   "Cxb8",
   "Cxb1"
  ],
  "pista": "Un caballo de cada bando se comió todo lo que encontró en su camino."
 }
];
