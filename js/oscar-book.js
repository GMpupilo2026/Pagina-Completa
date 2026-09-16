// Libro de aperturas/posiciones de Oscar, generado a partir de ~32,405 partidas propias
// (30,890 de lichess.org + 1,515 de chess.com).
// Clave = hash FNV-1a-64 (hex) de "colocacion_piezas turno enroques al_paso" (FEN sin relojes).
// IMPORTANTE: la casilla "al paso" se genera con la MISMA convencion que chess.js en el
// navegador (se indica siempre que un peon avanzo dos casillas, sin comprobar si la captura al
// paso es realmente legal). Si se regenera este archivo, el script de construccion debe usar
// board.fen(en_passant="fen") en python-chess (NO el board.fen() por defecto), o las claves no
// coincidiran con las que calcula el navegador y el libro dejara de encontrar posiciones justo
// despues de cualquier jugada de peon de dos casillas (el caso mas comun de todos).
// Valor = [uci1, peso1, uci2, peso2, ...] ordenado por peso descendente (peso = frecuencia*resultado*10, redondeado).
//
// EL LIBRO EN SI YA NO VIVE ACA: son 2,9 MB y esta en data/oscar-book.json, que
// js/chess-bot.js baja SOLO cuando al bot le toca mover por primera vez. Antes
// estaba escrito aca adentro como window.OSCAR_BOOK y lo bajaba toda visita a
// la portada, jugara o no: 2,9 MB de los 7,9 MB que pesaba index.html. Quien
// solo viene a leer que hay clases en vivo no tiene por que descargarse las
// 94.106 posiciones de las partidas de Oscar.
//
// Lo que si se queda aca es esto de abajo, que pesa menos de medio kilobyte y
// hace falta enseguida: chess-bot.js lo lee al definirse para saber con que
// Elo juega el bot en "Dificil".

window.OSCAR_ELO_CALIB = {
  "bullet": {
    "recent_median_elo": 2420,
    "n_games": 26956
  },
  "blitz": {
    "recent_median_elo": 2327,
    "n_games": 4097
  },
  "rapid": {
    "recent_median_elo": 2193,
    "n_games": 99
  },
  "other": {
    "recent_median_elo": 1766,
    "n_games": 182
  },
  "hyperbullet": {
    "recent_median_elo": 2023,
    "n_games": 544
  }
};
