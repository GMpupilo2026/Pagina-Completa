// Lo genera herramientas/libro-profe-pame.js con las partidas de la profe Pame
// en Lichess (pame17). No se edita a mano.
//
// El Elo con que juega el bot de la profe Pame en «Difícil» (js/chess-bot.js),
// como window.OSCAR_ELO_CALIB en js/oscar-book.js: la mediana de sus últimas
// 200 partidas con puntos de cada ritmo. El libro en sí está en
// data/pame-book.json y lo baja chess-bot.js cuando al bot le toca mover.

window.PAME_ELO_CALIB = {
  "blitz": {
    "recent_median_elo": 2053,
    "n_games": 252
  },
  "bullet": {
    "recent_median_elo": 2210,
    "n_games": 2599
  },
  "rapid": {
    "recent_median_elo": 1964,
    "n_games": 68
  },
  "other": {
    "recent_median_elo": 1773,
    "n_games": 18
  },
  "hyperbullet": {
    "recent_median_elo": 1548,
    "n_games": 214
  }
};

/*! rev bfb5bbb0d2d82f9f */
