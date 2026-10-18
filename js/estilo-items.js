/* ===== Ajedrez Integral — Banco de la prueba de estilo =====
 *
 * La prueba de estilo no mide cuánto sabe la persona (eso es el diagnóstico de
 * nivel, js/diagnostico-items.js) sino qué tipo de juego prefiere, para
 * recomendarle aperturas y defensas que le queden. Cada pregunta pone una
 * posición de una partida real y DOS jugadas que Stockfish valora casi igual
 * (a 30 centipeones o menos de la mejor, a profundidad 20) y que son de
 * carácter opuesto en uno de tres ejes:
 *
 *   ataque      atacar al rey  ↔  maniobrar
 *   estructura  abrir el juego ↔  mantenerlo cerrado
 *   cambios     cambiar piezas ↔  mantenerlas
 *
 * No hay respuesta correcta: las dos son buenas, y lo que elige dice su
 * preferencia. Cada jugada lleva su `polo` (qué representa en su eje), su
 * evaluación (`eval`, en centipeones desde el bando que mueve), la línea del
 * motor que la sigue (`linea`, UCI) y sus `medidas`, las que calcula
 * js/estilo-medidas.js y vuelve a calcular el verificador.
 *
 * El bloque ESTILO lo genera herramientas/estilo-generar.js y NO se edita a
 * mano: se vuelve a correr el script. Lo comprueba
 * herramientas/verificar-estilo.js.
 */
(function (raiz) {
  "use strict";

  /* ESTILO-INICIO: generado por herramientas/estilo-generar.js — no se edita a mano. */
  const ITEMS = [
   {
    "id": "es01",
    "eje": "ataque",
    "fen": "2rr2k1/p4ppp/4p3/1bb5/2p1B3/2B1P1P1/PP3P1P/3RK2R w K - 3 18",
    "a": {
     "san": "Rxd8+",
     "uci": "d1d8",
     "polo": "atacar",
     "eval": 45,
     "linea": [
      "d1d8",
      "c8d8",
      "g3g4",
      "c5e7"
     ],
     "medidas": {
      "ataque": 2,
      "estructura": 0,
      "cambios": 10,
      "propone": 1,
      "material": 0
     }
    },
    "b": {
     "san": "Bf3",
     "uci": "e4f3",
     "polo": "maniobrar",
     "eval": 37,
     "linea": [
      "e4f3",
      "d8d1",
      "e1d1",
      "f7f5"
     ],
     "medidas": {
      "ataque": -2,
      "estructura": 0,
      "cambios": 10,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 45,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml320-1",
     "blancas": "V. Ivanchuk",
     "negras": "M. Illescas",
     "evento": "Barcelona, 2005",
     "ply": 34,
     "enLaPartida": "Ke2"
    }
   },
   {
    "id": "es02",
    "eje": "ataque",
    "fen": "8/2n1k1p1/ppr2p1p/2p2P2/5P2/1B2P3/PP2K2P/2R5 w - - 1 36",
    "a": {
     "san": "Bc2",
     "uci": "b3c2",
     "polo": "maniobrar",
     "eval": 35,
     "linea": [
      "b3c2",
      "c6d6",
      "a2a4",
      "d6d7"
     ],
     "medidas": {
      "ataque": -2,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "e4",
     "uci": "e3e4",
     "polo": "atacar",
     "eval": 57,
     "linea": [
      "e3e4",
      "c6d6",
      "e2e3",
      "d6d7"
     ],
     "medidas": {
      "ataque": 2,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 57,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml146-4",
     "blancas": "M. Najdorf",
     "negras": "G. Stahlberg",
     "evento": "Zurich, 1953",
     "ply": 70,
     "enLaPartida": "a4"
    }
   },
   {
    "id": "es03",
    "eje": "ataque",
    "fen": "r2q1rk1/pbpnbppp/1p2pn2/3p4/5P2/1PNBPN2/PBPP2PP/R2Q1RK1 w - - 6 9",
    "a": {
     "san": "Ne5",
     "uci": "f3e5",
     "polo": "atacar",
     "eval": 3,
     "linea": [
      "f3e5",
      "g7g6",
      "d1e1",
      "c7c5"
     ],
     "medidas": {
      "ataque": 2,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Be2",
     "uci": "d3e2",
     "polo": "maniobrar",
     "eval": -19,
     "linea": [
      "d3e2",
      "f6e8",
      "d1e1",
      "c7c5"
     ],
     "medidas": {
      "ataque": -2,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 3,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml075-1",
     "blancas": "Blancas",
     "negras": "Negras",
     "evento": "",
     "ply": 16,
     "enLaPartida": "Ne2"
    }
   },
   {
    "id": "es04",
    "eje": "ataque",
    "fen": "r3rbk1/1q3p1p/p5p1/3bBP2/8/3B3Q/1PP3P1/4RR1K w - - 1 27",
    "a": {
     "san": "c4",
     "uci": "c2c4",
     "polo": "maniobrar",
     "eval": 107,
     "linea": [
      "c2c4",
      "d5c6",
      "f5g6",
      "f7g6"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "fxg6",
     "uci": "f5g6",
     "polo": "atacar",
     "eval": 95,
     "linea": [
      "f5g6",
      "f7g6",
      "c2c4",
      "d5c6"
     ],
     "medidas": {
      "ataque": 4,
      "estructura": 1,
      "cambios": 0,
      "propone": 1,
      "material": 0
     }
    },
    "mejor": 117,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml120-3",
     "blancas": "G. Canfell",
     "negras": "D. Johansen",
     "evento": "Sydney, 1995",
     "ply": 52,
     "enLaPartida": "Re2"
    }
   },
   {
    "id": "es05",
    "eje": "ataque",
    "fen": "2rn3r/p2kn3/1p2p1pp/3pPp2/3P3P/P2P1N2/2RBKPP1/2R5 w - - 6 22",
    "a": {
     "san": "Rxc8",
     "uci": "c2c8",
     "polo": "atacar",
     "eval": 0,
     "linea": [
      "c2c8",
      "e7c8",
      "c1a1",
      "d8c6"
     ],
     "medidas": {
      "ataque": 4,
      "estructura": 0,
      "cambios": 10,
      "propone": 1,
      "material": 0
     }
    },
    "b": {
     "san": "a4",
     "uci": "a3a4",
     "polo": "maniobrar",
     "eval": -23,
     "linea": [
      "a3a4",
      "c8c2",
      "c1c2",
      "d8f7"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 10,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 0,
    "fuente": {
     "de": "cambiar-o-no-cambiar",
     "partida": "polgar-morovic-1992",
     "blancas": "Judit Polgár",
     "negras": "Iván Morovic Fernández",
     "evento": "Buenos Aires, 1992",
     "ply": 42,
     "enLaPartida": "Rxc8"
    }
   },
   {
    "id": "es06",
    "eje": "ataque",
    "fen": "4r1k1/p5bp/1pn1p1p1/2p5/4N3/4P3/PP2KPPP/1RB5 b - - 1 18",
    "a": {
     "san": "Ne7",
     "uci": "c6e7",
     "polo": "maniobrar",
     "eval": -41,
     "linea": [
      "c6e7",
      "c1d2",
      "e7d5",
      "a2a4"
     ],
     "medidas": {
      "ataque": -1,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Rd8",
     "uci": "e8d8",
     "polo": "atacar",
     "eval": -40,
     "linea": [
      "e8d8",
      "c1d2",
      "g8f7",
      "a2a3"
     ],
     "medidas": {
      "ataque": 4,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -40,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml231-2",
     "blancas": "T. Petrosian",
     "negras": "M. Botvinnik",
     "evento": "Cto Mundial. Moscú (5), 1963",
     "ply": 35,
     "enLaPartida": "Nb4"
    }
   },
   {
    "id": "es07",
    "eje": "ataque",
    "fen": "6k1/1p3pnp/p2p1qp1/2pP4/P1Pb4/3B2PP/1PQ2PK1/2B5 b - - 1 25",
    "a": {
     "san": "Nh5",
     "uci": "g7h5",
     "polo": "atacar",
     "eval": -10,
     "linea": [
      "g7h5",
      "c2e2",
      "f6d8",
      "d3c2"
     ],
     "medidas": {
      "ataque": 2,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Qd8",
     "uci": "f6d8",
     "polo": "maniobrar",
     "eval": -17,
     "linea": [
      "f6d8",
      "c2e2",
      "g7e8",
      "b2b3"
     ],
     "medidas": {
      "ataque": -3,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -10,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml247-2",
     "blancas": "Y. Averbakh",
     "negras": "I. Boleslavsky",
     "evento": "URSS, 1953",
     "ply": 49,
     "enLaPartida": "Qe7"
    }
   },
   {
    "id": "es08",
    "eje": "ataque",
    "fen": "3rrnk1/pp2qppp/2p5/3p4/3P2b1/P1NBP3/1PQ2PPP/R3R1K1 b - - 2 15",
    "a": {
     "san": "Bc8",
     "uci": "g4c8",
     "polo": "maniobrar",
     "eval": -26,
     "linea": [
      "g4c8",
      "b2b4",
      "a7a6",
      "a1b1"
     ],
     "medidas": {
      "ataque": -1,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Qh4",
     "uci": "e7h4",
     "polo": "atacar",
     "eval": -21,
     "linea": [
      "e7h4",
      "f2f3",
      "g4c8",
      "b2b4"
     ],
     "medidas": {
      "ataque": 4,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -17,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml192-1",
     "blancas": "Blancas",
     "negras": "Negras",
     "evento": "",
     "ply": 29,
     "enLaPartida": "Rd6"
    }
   },
   {
    "id": "es09",
    "eje": "ataque",
    "fen": "6r1/2p5/3bk3/1p2pp2/p7/1PP2PP1/P2R1BK1/8 b - - 1 31",
    "a": {
     "san": "Rh8",
     "uci": "g8h8",
     "polo": "atacar",
     "eval": 50,
     "linea": [
      "g8h8",
      "d2e2",
      "h8b8",
      "f2e3"
     ],
     "medidas": {
      "ataque": 2,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Rd8",
     "uci": "g8d8",
     "polo": "maniobrar",
     "eval": 60,
     "linea": [
      "g8d8",
      "d2e2",
      "d8a8",
      "f2d4"
     ],
     "medidas": {
      "ataque": -2,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 60,
    "fuente": {
     "de": "cambiar-o-no-cambiar",
     "partida": "znosko-alekhine-1933",
     "blancas": "Eugene Znosko Borovsky",
     "negras": "Alexander Alekhine",
     "evento": "París, 1933",
     "ply": 30,
     "enLaPartida": "axb3"
    }
   },
   {
    "id": "es10",
    "eje": "ataque",
    "fen": "r2qr1k1/1p3p1p/p1pn2p1/3pN3/PP1P4/1Q2P3/5PPP/R3R1K1 b - - 3 20",
    "a": {
     "san": "h5",
     "uci": "h7h5",
     "polo": "maniobrar",
     "eval": 26,
     "linea": [
      "h7h5",
      "e3e4",
      "e8e7",
      "e4d5"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Qh4",
     "uci": "d8h4",
     "polo": "atacar",
     "eval": 25,
     "linea": [
      "d8h4",
      "b3d1",
      "g8g7",
      "d1f3"
     ],
     "medidas": {
      "ataque": 4,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 35,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml099-1",
     "blancas": "L. Portisch",
     "negras": "G. Kasparov",
     "evento": "Skelleftea, 1989",
     "ply": 39,
     "enLaPartida": "Qg5"
    }
   },
   {
    "id": "es11",
    "eje": "ataque",
    "fen": "6k1/1p4pp/2p2b2/2PbN2q/rP3PP1/3Q4/rB3R1P/5RK1 b - - 0 26",
    "a": {
     "san": "Qh4",
     "uci": "h5h4",
     "polo": "atacar",
     "eval": 6,
     "linea": [
      "h5h4",
      "d3f5",
      "a4a8",
      "e5f3"
     ],
     "medidas": {
      "ataque": 2,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Qe8",
     "uci": "h5e8",
     "polo": "maniobrar",
     "eval": 7,
     "linea": [
      "h5e8",
      "d3c3",
      "e8e6",
      "h2h3"
     ],
     "medidas": {
      "ataque": -2,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 14,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml240-4",
     "blancas": "Blancas",
     "negras": "Negras",
     "evento": "1949 Defensa Holandesa",
     "ply": 51,
     "enLaPartida": "Qh4"
    }
   },
   {
    "id": "es12",
    "eje": "ataque",
    "fen": "4r3/1p1n2p1/1b1Pkp2/p3p3/P3N1P1/BP6/2R2PK1/8 b - - 1 34",
    "a": {
     "san": "g6",
     "uci": "g7g6",
     "polo": "maniobrar",
     "eval": 8,
     "linea": [
      "g7g6",
      "e4d2",
      "e8b8",
      "d2c4"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Rh8",
     "uci": "e8h8",
     "polo": "atacar",
     "eval": 26,
     "linea": [
      "e8h8",
      "e4d2",
      "h8b8",
      "d2c4"
     ],
     "medidas": {
      "ataque": 4,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 26,
    "fuente": {
     "de": "cambiar-o-no-cambiar",
     "partida": "spassky-karpov-1974",
     "blancas": "Boris Spassky",
     "negras": "Anatoly Karpov",
     "evento": "Leningrado (semifinal de Candidatos), 1974",
     "ply": 32,
     "enLaPartida": "Rb8"
    }
   },
   {
    "id": "es13",
    "eje": "ataque",
    "fen": "8/2p2qk1/1p1p1bp1/3P4/1PPpQ3/3B2P1/5PK1/8 b - - 1 33",
    "a": {
     "san": "Bg5",
     "uci": "f6g5",
     "polo": "atacar",
     "eval": -29,
     "linea": [
      "f6g5",
      "e4g4",
      "g5f6",
      "g2f3"
     ],
     "medidas": {
      "ataque": 4,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Kh6",
     "uci": "g7h6",
     "polo": "maniobrar",
     "eval": -25,
     "linea": [
      "g7h6",
      "e4e6",
      "h6g7",
      "e6g4"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -25,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml289-3",
     "blancas": "B. Gelfand",
     "negras": "Ye Jiangchuan",
     "evento": "FIDE World Cup Shenyang, 2000",
     "ply": 65,
     "enLaPartida": "Kh6"
    }
   },
   {
    "id": "es14",
    "eje": "ataque",
    "fen": "r2q1rk1/5pbp/p1npb3/1p1Np3/8/2P1N3/PP3PPP/R2QKB1R w KQ - 4 15",
    "a": {
     "san": "g4",
     "uci": "g2g4",
     "polo": "maniobrar",
     "eval": -10,
     "linea": [
      "g2g4",
      "b5b4",
      "f1g2",
      "a8c8"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Qh5",
     "uci": "d1h5",
     "polo": "atacar",
     "eval": -4,
     "linea": [
      "d1h5",
      "f7f5",
      "f1d3",
      "e5e4"
     ],
     "medidas": {
      "ataque": 4,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 13,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml062-4",
     "blancas": "M. Adams",
     "negras": "V. Salov",
     "evento": "Dortmund, 1992",
     "ply": 28,
     "enLaPartida": "g3"
    }
   },
   {
    "id": "es15",
    "eje": "ataque",
    "fen": "r1r3k1/5ppp/p2qp3/1p1n4/8/3N1QP1/PP2PPKP/2R2R2 b - - 3 21",
    "a": {
     "san": "Rc4",
     "uci": "c8c4",
     "polo": "atacar",
     "eval": -8,
     "linea": [
      "c8c4",
      "e2e4",
      "d5e7",
      "b2b3"
     ],
     "medidas": {
      "ataque": 3,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Qe7",
     "uci": "d6e7",
     "polo": "maniobrar",
     "eval": -16,
     "linea": [
      "d6e7",
      "f1d1",
      "h7h6",
      "h2h4"
     ],
     "medidas": {
      "ataque": -1,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -8,
    "fuente": {
     "de": "ganar-con-poco",
     "partida": "gcp-1",
     "blancas": "Ulf Andersson",
     "negras": "Vladimir Potkin",
     "evento": "Istanbul, 2003",
     "ply": 41,
     "enLaPartida": "h6"
    }
   },
   {
    "id": "es16",
    "eje": "estructura",
    "fen": "5R2/6pk/pp2qn1p/5p2/PP6/1r2BQP1/5PKP/8 w - - 1 34",
    "a": {
     "san": "b5",
     "uci": "b4b5",
     "polo": "abrir",
     "eval": -39,
     "linea": [
      "b4b5",
      "a6b5",
      "a4b5",
      "b3b5"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 1,
      "cambios": 0,
      "propone": 1,
      "material": null
     }
    },
    "b": {
     "san": "a5",
     "uci": "a4a5",
     "polo": "cerrar",
     "eval": -63,
     "linea": [
      "a4a5",
      "b6b5",
      "f3f4",
      "f6d5"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": -2,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -39,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml273-1",
     "blancas": "V. Hort",
     "negras": "M. Tal",
     "evento": "Olimpiada. La Habana, 1966",
     "ply": 66,
     "enLaPartida": "a5"
    }
   },
   {
    "id": "es17",
    "eje": "estructura",
    "fen": "r2q1rk1/3bbppp/p2p1n2/np2p3/P1p1P3/N1PP1N2/BP3PPP/R1BQR1K1 w - - 3 13",
    "a": {
     "san": "Bg5",
     "uci": "c1g5",
     "polo": "cerrar",
     "eval": 32,
     "linea": [
      "c1g5",
      "d8c7",
      "a4b5",
      "a6b5"
     ],
     "medidas": {
      "ataque": 1,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "dxc4",
     "uci": "d3c4",
     "polo": "abrir",
     "eval": 18,
     "linea": [
      "d3c4",
      "b5a4",
      "c4c5",
      "d8c7"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 3,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 32,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml062-3",
     "blancas": "Y. Balashov",
     "negras": "E. Torre",
     "evento": "Lone Pine, 1980",
     "ply": 24,
     "enLaPartida": "Bg5"
    }
   },
   {
    "id": "es18",
    "eje": "estructura",
    "fen": "r1b1k2r/pp2qppp/2n1p3/2ppP3/3P4/2PB1N2/P1P2PPP/R2QK2R w KQkq - 2 10",
    "a": {
     "san": "dxc5",
     "uci": "d4c5",
     "polo": "abrir",
     "eval": -16,
     "linea": [
      "d4c5",
      "e7c5",
      "d1d2",
      "h7h6"
     ],
     "medidas": {
      "ataque": 1,
      "estructura": 2,
      "cambios": 0,
      "propone": 1,
      "material": 0
     }
    },
    "b": {
     "san": "a4",
     "uci": "a2a4",
     "polo": "cerrar",
     "eval": -43,
     "linea": [
      "a2a4",
      "c5c4",
      "d3e2",
      "c8d7"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": -1,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -16,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml157-2",
     "blancas": "A. Burn",
     "negras": "A. Alekhine",
     "evento": "Carlsbad, 1911",
     "ply": 18,
     "enLaPartida": "O-O"
    }
   },
   {
    "id": "es19",
    "eje": "estructura",
    "fen": "rn1qkb1r/pb3ppp/4pn2/2ppN3/1pPP4/6P1/PP2PPBP/RNBQK2R w KQkq - 1 9",
    "a": {
     "san": "Be3",
     "uci": "c1e3",
     "polo": "cerrar",
     "eval": 48,
     "linea": [
      "c1e3",
      "b8d7",
      "e1g1",
      "f8e7"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "a3",
     "uci": "a2a3",
     "polo": "abrir",
     "eval": 57,
     "linea": [
      "a2a3",
      "c5d4",
      "e1g1",
      "a7a5"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 3,
      "cambios": 0,
      "propone": 0,
      "material": -1
     }
    },
    "mejor": 57,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml322-4",
     "blancas": "J. Dorfman",
     "negras": "R. Skrobek",
     "evento": "Warsaw, 1983",
     "ply": 16,
     "enLaPartida": "Qa4+"
    }
   },
   {
    "id": "es20",
    "eje": "estructura",
    "fen": "r2q1rk1/1p1n1ppp/n1pb4/3pp1P1/pPPP3P/P3PQ2/1B1N1P2/R3KB1R w KQ - 0 16",
    "a": {
     "san": "cxd5",
     "uci": "c4d5",
     "polo": "abrir",
     "eval": 145,
     "linea": [
      "c4d5",
      "e5d4",
      "d5c6",
      "b7c6"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 2,
      "cambios": 0,
      "propone": 0,
      "material": null
     }
    },
    "b": {
     "san": "c5",
     "uci": "c4c5",
     "polo": "cerrar",
     "eval": 131,
     "linea": [
      "c4c5",
      "d6c7",
      "f3f5",
      "d8e7"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": -1,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 145,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml075-3",
     "blancas": "M. Taimanov",
     "negras": "A. Shashin",
     "evento": "USSR, 1978",
     "ply": 30,
     "enLaPartida": "cxd5"
    }
   },
   {
    "id": "es21",
    "eje": "estructura",
    "fen": "2rq1rk1/p2nbppp/bpp1p3/3p4/2PP4/1PB3P1/P2NPPBP/R2QR1K1 b - - 5 13",
    "a": {
     "san": "b5",
     "uci": "b6b5",
     "polo": "cerrar",
     "eval": -21,
     "linea": [
      "b6b5",
      "c4c5",
      "e6e5",
      "e2e3"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": -1,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "c5",
     "uci": "c6c5",
     "polo": "abrir",
     "eval": -4,
     "linea": [
      "c6c5",
      "c4d5",
      "e6d5",
      "h2h4"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 2,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -4,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml181-3",
     "blancas": "A. Vyzmanavin",
     "negras": "L. Psakhis",
     "evento": "Novosibirsk, 1993",
     "ply": 25,
     "enLaPartida": "f5"
    }
   },
   {
    "id": "es22",
    "eje": "estructura",
    "fen": "1b1n4/p4pkp/bp2p1p1/2p1P3/2P2P2/1P2B1P1/P3N2P/5BK1 b - - 0 25",
    "a": {
     "san": "f6",
     "uci": "f7f6",
     "polo": "abrir",
     "eval": 0,
     "linea": [
      "f7f6",
      "e5f6",
      "g7f6",
      "e3d2"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 2,
      "cambios": 0,
      "propone": 1,
      "material": 0
     }
    },
    "b": {
     "san": "f5",
     "uci": "f7f5",
     "polo": "cerrar",
     "eval": -19,
     "linea": [
      "f7f5",
      "g1f2",
      "g6g5",
      "a2a3"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": -1,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 0,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml025-2",
     "blancas": "Vassili Smyslov",
     "negras": "Harry Golombek",
     "evento": "Londres, 1947",
     "ply": 49,
     "enLaPartida": "f6"
    }
   },
   {
    "id": "es23",
    "eje": "estructura",
    "fen": "r1bq1rk1/pp1nbppp/2pp1n2/4p3/P2PP3/2N2N2/BPP2PPP/R1BQ1RK1 b - - 1 8",
    "a": {
     "san": "a5",
     "uci": "a7a5",
     "polo": "cerrar",
     "eval": -45,
     "linea": [
      "a7a5",
      "f1e1",
      "e5d4",
      "f3d4"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": -1,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "exd4",
     "uci": "e5d4",
     "polo": "abrir",
     "eval": -46,
     "linea": [
      "e5d4",
      "f3d4",
      "f8e8",
      "f1e1"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 2,
      "cambios": 0,
      "propone": 1,
      "material": 0
     }
    },
    "mejor": -41,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml091-2",
     "blancas": "P. Motwani",
     "negras": "J. Rowson",
     "evento": "Dundee, 1995",
     "ply": 15,
     "enLaPartida": "b6"
    }
   },
   {
    "id": "es24",
    "eje": "estructura",
    "fen": "r1bq1rk1/3nbppp/2n1p3/1p1pP3/p1pP3P/P4NP1/1PP2PB1/R1BQRNK1 b - - 0 13",
    "a": {
     "san": "b4",
     "uci": "b5b4",
     "polo": "abrir",
     "eval": -105,
     "linea": [
      "b5b4",
      "a3b4",
      "c6b4",
      "f1e3"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 2,
      "cambios": 0,
      "propone": 1,
      "material": 0
     }
    },
    "b": {
     "san": "h6",
     "uci": "h7h6",
     "polo": "cerrar",
     "eval": -114,
     "linea": [
      "h7h6",
      "c2c3",
      "f7f6",
      "e5f6"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": -1,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -104,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml131-5",
     "blancas": "J. Tompa",
     "negras": "Y. Anikaev",
     "evento": "URSS, 1967",
     "ply": 25,
     "enLaPartida": "b4"
    }
   },
   {
    "id": "es25",
    "eje": "estructura",
    "fen": "rn1q1rk1/pbp1bpp1/1p2pn1p/3p4/2PP3B/2NBPN2/PP3PPP/2RQK2R b K - 3 9",
    "a": {
     "san": "c5",
     "uci": "c7c5",
     "polo": "cerrar",
     "eval": 0,
     "linea": [
      "c7c5",
      "e1g1",
      "d5c4",
      "d3c4"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": -1,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "dxc4",
     "uci": "d5c4",
     "polo": "abrir",
     "eval": -2,
     "linea": [
      "d5c4",
      "d3c4",
      "c7c5",
      "e1g1"
     ],
     "medidas": {
      "ataque": 2,
      "estructura": 2,
      "cambios": 0,
      "propone": 1,
      "material": 0
     }
    },
    "mejor": 0,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml189-3",
     "blancas": "V. Akopian",
     "negras": "G. Giorgadze",
     "evento": "Lvov, 1990",
     "ply": 17,
     "enLaPartida": "Nbd7"
    }
   },
   {
    "id": "es26",
    "eje": "estructura",
    "fen": "rnbq1rk1/pp2bpp1/2p2n1p/3pN3/2PP4/1Q1B1N2/PP3PPP/R1B1R1K1 b - - 3 11",
    "a": {
     "san": "dxc4",
     "uci": "d5c4",
     "polo": "abrir",
     "eval": -96,
     "linea": [
      "d5c4",
      "e5c4",
      "b7b5",
      "c4e5"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 2,
      "cambios": 0,
      "propone": 1,
      "material": 0
     }
    },
    "b": {
     "san": "a5",
     "uci": "a7a5",
     "polo": "cerrar",
     "eval": -101,
     "linea": [
      "a7a5",
      "c4c5",
      "f6e4",
      "c1f4"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": -1,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -91,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml076-5",
     "blancas": "J. Richardson",
     "negras": "Marsh",
     "evento": "España, 1969",
     "ply": 21,
     "enLaPartida": "Nbd7"
    }
   },
   {
    "id": "es27",
    "eje": "estructura",
    "fen": "1r6/2p1kpp1/2p1p2p/p2rP3/7P/2P5/PP2RPP1/1K5R b - - 0 26",
    "a": {
     "san": "h5",
     "uci": "h6h5",
     "polo": "cerrar",
     "eval": -19,
     "linea": [
      "h6h5",
      "b1c1",
      "f7f5",
      "e5f6"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": -1,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "f6",
     "uci": "f7f6",
     "polo": "abrir",
     "eval": -31,
     "linea": [
      "f7f6",
      "e5f6",
      "g7f6",
      "b1c2"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 2,
      "cambios": 0,
      "propone": 1,
      "material": 0
     }
    },
    "mejor": -19,
    "fuente": {
     "de": "cambiar-o-no-cambiar",
     "partida": "kasparov-bareev-2000",
     "blancas": "Garry Kasparov",
     "negras": "Evgeny Bareev",
     "evento": "Sarajevo, 2000",
     "ply": 51,
     "enLaPartida": "f6"
    }
   },
   {
    "id": "es28",
    "eje": "estructura",
    "fen": "r2q1rk1/1bp1bppp/p2p1n2/np2p3/3PP3/2P2N1P/PPB2PP1/RNBQR1K1 b - - 2 11",
    "a": {
     "san": "exd4",
     "uci": "e5d4",
     "polo": "abrir",
     "eval": -76,
     "linea": [
      "e5d4",
      "c3d4",
      "f8e8",
      "b1d2"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 2,
      "cambios": 0,
      "propone": 1,
      "material": 0
     }
    },
    "b": {
     "san": "c5",
     "uci": "c7c5",
     "polo": "cerrar",
     "eval": -83,
     "linea": [
      "c7c5",
      "d4d5",
      "a5c4",
      "b2b3"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": -1,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -76,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml239-3",
     "blancas": "R. Bellin",
     "negras": "A. Petrosian",
     "evento": "USSR, 1973",
     "ply": 21,
     "enLaPartida": "Nc4"
    }
   },
   {
    "id": "es29",
    "eje": "estructura",
    "fen": "r1bq1rk1/pp1nbppp/4pn2/2pp2B1/2PP4/2NBPN2/PP3PPP/R2Q1RK1 b - - 1 8",
    "a": {
     "san": "h6",
     "uci": "h7h6",
     "polo": "cerrar",
     "eval": -7,
     "linea": [
      "h7h6",
      "g5h4",
      "b7b6",
      "c4d5"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "dxc4",
     "uci": "d5c4",
     "polo": "abrir",
     "eval": -13,
     "linea": [
      "d5c4",
      "d3c4",
      "c5d4",
      "e3d4"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 3,
      "cambios": 0,
      "propone": 1,
      "material": null
     }
    },
    "mejor": -7,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml036-5",
     "blancas": "I. Bondarevsky",
     "negras": "G. Ravinsky",
     "evento": "Moscu, 1940",
     "ply": 15,
     "enLaPartida": "dxc4"
    }
   },
   {
    "id": "es30",
    "eje": "estructura",
    "fen": "rn1q1rk1/pb2bppp/1p2pn2/2pp4/2PP4/PP1BPN2/1B1N1PPP/R2Q1RK1 b - - 1 10",
    "a": {
     "san": "dxc4",
     "uci": "d5c4",
     "polo": "abrir",
     "eval": -16,
     "linea": [
      "d5c4",
      "d2c4",
      "c5d4",
      "f3d4"
     ],
     "medidas": {
      "ataque": 1,
      "estructura": 3,
      "cambios": 0,
      "propone": 1,
      "material": null
     }
    },
    "b": {
     "san": "Nbd7",
     "uci": "b8d7",
     "polo": "cerrar",
     "eval": -17,
     "linea": [
      "b8d7",
      "d1e2",
      "a8c8",
      "f1d1"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -16,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml117-5",
     "blancas": "B. Ivkov",
     "negras": "V. Korchnoi",
     "evento": "Interzonal. Sousse, 1967",
     "ply": 19,
     "enLaPartida": "cxd4"
    }
   },
   {
    "id": "es31",
    "eje": "cambios",
    "fen": "rn1qk2r/p4pbp/1pb1p1p1/2pn4/7Q/2NP1NP1/PP1BPPBP/R3K2R w KQkq - 0 11",
    "a": {
     "san": "Qxd8+",
     "uci": "h4d8",
     "polo": "cambiar",
     "eval": 22,
     "linea": [
      "h4d8",
      "e8d8",
      "c3d5",
      "e6d5"
     ],
     "medidas": {
      "ataque": 2,
      "estructura": 0,
      "cambios": 24,
      "propone": 1,
      "material": null
     }
    },
    "b": {
     "san": "Bg5",
     "uci": "d2g5",
     "polo": "mantener",
     "eval": 0,
     "linea": [
      "d2g5",
      "d8d7",
      "g5h6",
      "g7f6"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 27,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml337-2",
     "blancas": "R. Huebner",
     "negras": "A. Karpov",
     "evento": "Tilburg, 1977",
     "ply": 20,
     "enLaPartida": "Qxd8+"
    }
   },
   {
    "id": "es32",
    "eje": "cambios",
    "fen": "3r2k1/p1r2ppp/1q6/3n4/3N4/2p1P3/P1R1QPPP/2R3K1 w - - 6 26",
    "a": {
     "san": "g3",
     "uci": "g2g3",
     "polo": "mantener",
     "eval": 7,
     "linea": [
      "g2g3",
      "b6f6",
      "e2f3",
      "f6e5"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Qb5",
     "uci": "e2b5",
     "polo": "cambiar",
     "eval": -9,
     "linea": [
      "e2b5",
      "b6b5",
      "d4b5",
      "c7d7"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 18,
      "propone": 1,
      "material": 0
     }
    },
    "mejor": 7,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml118-1",
     "blancas": "O. Bernstein",
     "negras": "JR. Capablanca",
     "evento": "Moscú, 1914",
     "ply": 50,
     "enLaPartida": "Nb5"
    }
   },
   {
    "id": "es33",
    "eje": "cambios",
    "fen": "3r2k1/4qp1p/6p1/2pQ4/p6P/P5P1/1P3P2/2R3K1 w - - 4 27",
    "a": {
     "san": "Qg5",
     "uci": "d5g5",
     "polo": "cambiar",
     "eval": 17,
     "linea": [
      "d5g5",
      "e7g5",
      "h4g5",
      "d8d5"
     ],
     "medidas": {
      "ataque": 2,
      "estructura": 0,
      "cambios": 18,
      "propone": 1,
      "material": 0
     }
    },
    "b": {
     "san": "Qf3",
     "uci": "d5f3",
     "polo": "mantener",
     "eval": 1,
     "linea": [
      "d5f3",
      "h7h5",
      "f3c6",
      "d8d2"
     ],
     "medidas": {
      "ataque": 1,
      "estructura": -1,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 20,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml135-1",
     "blancas": "V. Akopian",
     "negras": "K. Georgiev",
     "evento": "Las Vegas 1999",
     "ply": 52,
     "enLaPartida": "Qxc5"
    }
   },
   {
    "id": "es34",
    "eje": "cambios",
    "fen": "3q4/p4pk1/2p2bp1/2p1p3/2B1P3/2P3P1/PP2Q2P/5K2 w - - 1 26",
    "a": {
     "san": "h4",
     "uci": "h2h4",
     "polo": "mantener",
     "eval": 50,
     "linea": [
      "h2h4",
      "d8c8",
      "f1g2",
      "c8b7"
     ],
     "medidas": {
      "ataque": 1,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Qd3",
     "uci": "e2d3",
     "polo": "cambiar",
     "eval": 26,
     "linea": [
      "e2d3",
      "d8d3",
      "c4d3",
      "f6g5"
     ],
     "medidas": {
      "ataque": -1,
      "estructura": 0,
      "cambios": 18,
      "propone": 1,
      "material": 0
     }
    },
    "mejor": 50,
    "fuente": {
     "de": "ganar-con-poco",
     "partida": "gcp-14",
     "blancas": "Akiba Rubinstein",
     "negras": "Ernst Grünfeld",
     "evento": "Karlsbad, 1929",
     "ply": 50,
     "enLaPartida": "h4"
    }
   },
   {
    "id": "es35",
    "eje": "cambios",
    "fen": "5qk1/p6p/2p3pQ/2p2P2/4P1p1/1P1p3b/PBP4P/6K1 w - - 2 32",
    "a": {
     "san": "Qxf8+",
     "uci": "h6f8",
     "polo": "cambiar",
     "eval": 4,
     "linea": [
      "h6f8",
      "g8f8",
      "c2d3",
      "g6f5"
     ],
     "medidas": {
      "ataque": 1,
      "estructura": 0,
      "cambios": 18,
      "propone": 1,
      "material": null
     }
    },
    "b": {
     "san": "Qg5",
     "uci": "h6g5",
     "polo": "mantener",
     "eval": 0,
     "linea": [
      "h6g5",
      "d3c2",
      "g5d2",
      "g6f5"
     ],
     "medidas": {
      "ataque": -1,
      "estructura": 1,
      "cambios": 0,
      "propone": 0,
      "material": -1
     }
    },
    "mejor": 6,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml079-1",
     "blancas": "J. Bellon",
     "negras": "H. Pfleger",
     "evento": "Olot, 1972",
     "ply": 62,
     "enLaPartida": "Qxf8+"
    }
   },
   {
    "id": "es36",
    "eje": "cambios",
    "fen": "3rr1k1/p4pp1/1p5p/3p1nq1/P2Bb3/1PR4P/2PQ1PP1/3R1BK1 b - - 3 25",
    "a": {
     "san": "Qg6",
     "uci": "g5g6",
     "polo": "mantener",
     "eval": -5,
     "linea": [
      "g5g6",
      "d1e1",
      "d8c8",
      "f2f3"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Qxd2",
     "uci": "g5d2",
     "polo": "cambiar",
     "eval": -15,
     "linea": [
      "g5d2",
      "d1d2",
      "f5d4",
      "d2d4"
     ],
     "medidas": {
      "ataque": -1,
      "estructura": 0,
      "cambios": 24,
      "propone": 1,
      "material": null
     }
    },
    "mejor": -5,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml100-4",
     "blancas": "A. Gipslis",
     "negras": "V. Korchnoi",
     "evento": "Riga, 1970",
     "ply": 49,
     "enLaPartida": "Rc8"
    }
   },
   {
    "id": "es37",
    "eje": "cambios",
    "fen": "r4rk1/ppp2pbp/6p1/3q4/6b1/1N2B3/PPPQ1PPP/R4RK1 b - - 1 14",
    "a": {
     "san": "Qxd2",
     "uci": "d5d2",
     "polo": "cambiar",
     "eval": 71,
     "linea": [
      "d5d2",
      "b3d2",
      "a7a5",
      "h2h3"
     ],
     "medidas": {
      "ataque": -1,
      "estructura": 0,
      "cambios": 18,
      "propone": 1,
      "material": 0
     }
    },
    "b": {
     "san": "Qc4",
     "uci": "d5c4",
     "polo": "mantener",
     "eval": 48,
     "linea": [
      "d5c4",
      "h2h3",
      "a8d8",
      "d2c1"
     ],
     "medidas": {
      "ataque": -1,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 71,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml067-2",
     "blancas": "Blancas",
     "negras": "Negras",
     "evento": "",
     "ply": 27,
     "enLaPartida": "Qxd2"
    }
   },
   {
    "id": "es38",
    "eje": "cambios",
    "fen": "2rr2k1/p7/bp2p1p1/n1p1Pp1p/q1P2P2/P1P1N1P1/Q3B1P1/3RR1K1 b - - 1 26",
    "a": {
     "san": "Kf7",
     "uci": "g8f7",
     "polo": "mantener",
     "eval": 55,
     "linea": [
      "g8f7",
      "e2d3",
      "a4e8",
      "a2c2"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Qb3",
     "uci": "a4b3",
     "polo": "cambiar",
     "eval": 71,
     "linea": [
      "a4b3",
      "a2b3",
      "a5b3",
      "e3f1"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 18,
      "propone": 1,
      "material": 0
     }
    },
    "mejor": 81,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml048-2",
     "blancas": "M. Botvinnik",
     "negras": "S. Reshevsky",
     "evento": "Cto Mundial, 1948",
     "ply": 51,
     "enLaPartida": "Kf7"
    }
   },
   {
    "id": "es39",
    "eje": "cambios",
    "fen": "2brk2r/1p2qnpp/p1p2p2/2N5/PP6/R3Q1P1/4PPBP/5RK1 b k - 2 22",
    "a": {
     "san": "Qxe3",
     "uci": "e7e3",
     "polo": "cambiar",
     "eval": -58,
     "linea": [
      "e7e3",
      "a3e3",
      "e8f8",
      "f1b1"
     ],
     "medidas": {
      "ataque": 3,
      "estructura": 0,
      "cambios": 18,
      "propone": 1,
      "material": 0
     }
    },
    "b": {
     "san": "Ne5",
     "uci": "f7e5",
     "polo": "mantener",
     "eval": -65,
     "linea": [
      "f7e5",
      "f1c1",
      "e8g8",
      "f2f4"
     ],
     "medidas": {
      "ataque": 1,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -57,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml090-1",
     "blancas": "G. Levenfish",
     "negras": "S. Flohr",
     "evento": "Moscú, 1936",
     "ply": 43,
     "enLaPartida": "Nd6"
    }
   },
   {
    "id": "es40",
    "eje": "cambios",
    "fen": "1R6/3brk1p/2p1n1p1/3p4/3P3q/3B1P2/4NQPP/6K1 b - - 2 28",
    "a": {
     "san": "Qh5",
     "uci": "h4h5",
     "polo": "mantener",
     "eval": -20,
     "linea": [
      "h4h5",
      "h2h3",
      "e6g7",
      "f3f4"
     ],
     "medidas": {
      "ataque": -1,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Qxf2+",
     "uci": "h4f2",
     "polo": "cambiar",
     "eval": -1,
     "linea": [
      "h4f2",
      "g1f2",
      "f7f6",
      "h2h4"
     ],
     "medidas": {
      "ataque": 1,
      "estructura": 0,
      "cambios": 18,
      "propone": 1,
      "material": 0
     }
    },
    "mejor": 0,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml192-4",
     "blancas": "H. Bouwmeester",
     "negras": "M. Euwe",
     "evento": "Amsterdam, 1950",
     "ply": 55,
     "enLaPartida": "Qh6"
    }
   },
   {
    "id": "es41",
    "eje": "cambios",
    "fen": "r6k/pp2r2p/2p3p1/4qn2/1PB5/3R1P2/P2Q2PP/R5K1 w - - 6 28",
    "a": {
     "san": "Qc3",
     "uci": "d2c3",
     "polo": "cambiar",
     "eval": 0,
     "linea": [
      "d2c3",
      "e5c3",
      "d3c3",
      "a8d8"
     ],
     "medidas": {
      "ataque": -1,
      "estructura": 0,
      "cambios": 18,
      "propone": 1,
      "material": 0
     }
    },
    "b": {
     "san": "Rf1",
     "uci": "a1f1",
     "polo": "mantener",
     "eval": 0,
     "linea": [
      "a1f1",
      "a8e8",
      "c4b3",
      "h7h5"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 13,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml360-4",
     "blancas": "L. Van Wely",
     "negras": "T. Radjabov",
     "evento": "Monte Carlo (a ciegas), 2007",
     "ply": 54,
     "enLaPartida": "Rd1"
    }
   },
   {
    "id": "es42",
    "eje": "cambios",
    "fen": "r4rk1/pp2ppbp/6p1/2P1q3/1PQ5/2N1P2P/P5P1/2R2RK1 w - - 1 20",
    "a": {
     "san": "Rf3",
     "uci": "f1f3",
     "polo": "mantener",
     "eval": -25,
     "linea": [
      "f1f3",
      "a8d8",
      "g1h1",
      "a7a6"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Qf4",
     "uci": "c4f4",
     "polo": "cambiar",
     "eval": -30,
     "linea": [
      "c4f4",
      "e5f4",
      "f1f4",
      "f8d8"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 18,
      "propone": 1,
      "material": 0
     }
    },
    "mejor": -12,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml328-5",
     "blancas": "M. Pandurevic",
     "negras": "V. Kovacevic",
     "evento": "CRO-chT Tucepi, 1996",
     "ply": 38,
     "enLaPartida": "Qe4"
    }
   },
   {
    "id": "es43",
    "eje": "cambios",
    "fen": "rnb2rk1/1p3pnp/pq2p1p1/1N1p4/7P/1N2P3/PPP2PP1/R2QKB1R w KQ - 0 14",
    "a": {
     "san": "Qd4",
     "uci": "d1d4",
     "polo": "cambiar",
     "eval": 9,
     "linea": [
      "d1d4",
      "b6d4",
      "b5d4",
      "b8d7"
     ],
     "medidas": {
      "ataque": 2,
      "estructura": 0,
      "cambios": 18,
      "propone": 1,
      "material": 0
     }
    },
    "b": {
     "san": "Nc3",
     "uci": "b5c3",
     "polo": "mantener",
     "eval": 27,
     "linea": [
      "b5c3",
      "c8d7",
      "d1d2",
      "a6a5"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 27,
    "fuente": {
     "de": "ganar-con-poco",
     "partida": "gcp-15",
     "blancas": "José Raúl Capablanca",
     "negras": "Frederick Yates",
     "evento": "New York, 1924",
     "ply": 26,
     "enLaPartida": "Nc3"
    }
   },
   {
    "id": "es44",
    "eje": "cambios",
    "fen": "4bb1k/p5q1/2p2pp1/7p/1pB1QPnP/1P5N/PNP3P1/2K5 b - - 1 29",
    "a": {
     "san": "Bd7",
     "uci": "e8d7",
     "polo": "mantener",
     "eval": 46,
     "linea": [
      "e8d7",
      "b2d3",
      "d7f5",
      "e4e8"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Qe7",
     "uci": "g7e7",
     "polo": "cambiar",
     "eval": 46,
     "linea": [
      "g7e7",
      "e4e7",
      "f8e7",
      "c1d2"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 18,
      "propone": 1,
      "material": 0
     }
    },
    "mejor": 58,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml339-1",
     "blancas": "I. Nepomniachtchi",
     "negras": "G. Sargissian",
     "evento": "Aeroflot Open. Moscú, 2007",
     "ply": 57,
     "enLaPartida": "Qe7"
    }
   },
   {
    "id": "es45",
    "eje": "cambios",
    "fen": "rnb2rk1/b1pq1ppp/p3p3/3pP1B1/2P5/1N3N2/PP3PPP/2RQ1RK1 b - - 5 15",
    "a": {
     "san": "dxc4",
     "uci": "d5c4",
     "polo": "cambiar",
     "eval": -63,
     "linea": [
      "d5c4",
      "c1c4",
      "d7d1",
      "f1d1"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 1,
      "cambios": 18,
      "propone": 1,
      "material": null
     }
    },
    "b": {
     "san": "h6",
     "uci": "h7h6",
     "polo": "mantener",
     "eval": -66,
     "linea": [
      "h7h6",
      "g5d2",
      "b8c6",
      "c4c5"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -54,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml253-4",
     "blancas": "G. Estevez",
     "negras": "R. Huebner",
     "evento": "Interzonal Leningrado, 1973",
     "ply": 29,
     "enLaPartida": "Bb7"
    }
   },
   {
    "id": "es46",
    "eje": "material",
    "fen": "4rk2/p1pq1r1p/1p1pp1p1/n7/P1PPQP2/2PB2P1/6KP/R3R3 w - - 3 23",
    "a": {
     "san": "Re2",
     "uci": "e1e2",
     "polo": "material",
     "eval": 42,
     "linea": [
      "e1e2",
      "a5c4",
      "d3c4",
      "d6d5",
      "e4e5",
      "d5c4"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 3,
      "propone": 0,
      "material": 2
     }
    },
    "b": {
     "san": "h4",
     "uci": "h2h4",
     "polo": "iniciativa",
     "eval": 33,
     "linea": [
      "h2h4",
      "a5c4",
      "h4h5",
      "g6h5",
      "e4e2",
      "d7c6"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": -2
     }
    },
    "mejor": 43,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml167-6",
     "blancas": "J. Capablanca",
     "negras": "S. Tartakower",
     "evento": "Nueva York, 1924",
     "ply": 44,
     "enLaPartida": "h4"
    }
   },
   {
    "id": "es47",
    "eje": "material",
    "fen": "rnb2rk1/p1q1n1pp/1p2p3/3pPp2/3P4/P2B2Q1/2PB1PPP/R3K1NR w KQ - 0 12",
    "a": {
     "san": "h4",
     "uci": "h2h4",
     "polo": "iniciativa",
     "eval": 95,
     "linea": [
      "h2h4",
      "c8a6",
      "h4h5",
      "a6d3",
      "h5h6",
      "g7g6"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 3,
      "propone": 0,
      "material": -3
     }
    },
    "b": {
     "san": "c3",
     "uci": "c2c3",
     "polo": "material",
     "eval": 111,
     "linea": [
      "c2c3",
      "c8a6",
      "d3a6",
      "b8a6",
      "h2h4",
      "c7c4"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 6,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 111,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml356-7",
     "blancas": "D. Sebastian",
     "negras": "H. Lahlum",
     "evento": "Hamburg, 2001",
     "ply": 22,
     "enLaPartida": "Ne2"
    }
   },
   {
    "id": "es48",
    "eje": "material",
    "fen": "r2q1rk1/p1pnppbp/1p1p2p1/8/2PPbB2/5NP1/PP1QPPBP/R4RK1 w - - 2 11",
    "a": {
     "san": "Rfd1",
     "uci": "f1d1",
     "polo": "material",
     "eval": 23,
     "linea": [
      "f1d1",
      "d7f6",
      "f4h6",
      "c7c6",
      "b2b3",
      "f8e8"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "d5",
     "uci": "d4d5",
     "polo": "iniciativa",
     "eval": 11,
     "linea": [
      "d4d5",
      "d7f6",
      "f3d4",
      "e4g2",
      "d4c6",
      "d8e8"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": -1,
      "cambios": 3,
      "propone": 0,
      "material": -3
     }
    },
    "mejor": 25,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml156-1",
     "blancas": "C. Guimard",
     "negras": "M. Euwe",
     "evento": "Groningen, 1946",
     "ply": 20,
     "enLaPartida": "Bh6"
    }
   },
   {
    "id": "es49",
    "eje": "material",
    "fen": "r1bqkb1r/pp3pp1/1np1pn1p/6N1/3P4/3B4/PPP1QPPP/R1B1K1NR w KQkq - 0 9",
    "a": {
     "san": "Ne4",
     "uci": "g5e4",
     "polo": "iniciativa",
     "eval": 10,
     "linea": [
      "g5e4",
      "d8d4",
      "g1f3",
      "d4d8",
      "e1g1",
      "f6e4"
     ],
     "medidas": {
      "ataque": -1,
      "estructura": 0.5,
      "cambios": 0,
      "propone": 0,
      "material": -1
     }
    },
    "b": {
     "san": "N5f3",
     "uci": "g5f3",
     "polo": "material",
     "eval": 17,
     "linea": [
      "g5f3",
      "c6c5",
      "d4c5",
      "b6d7",
      "c1f4",
      "f8c5"
     ],
     "medidas": {
      "ataque": -2,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 1
     }
    },
    "mejor": 23,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml336-3",
     "blancas": "J. Timman",
     "negras": "A. Karpov",
     "evento": "FIDE-Wch, 1993",
     "ply": 16,
     "enLaPartida": "N5f3"
    }
   },
   {
    "id": "es50",
    "eje": "material",
    "fen": "1k1r3r/ppqn1p2/3bpp2/2p2b1N/3P3P/1B4P1/PPPBQP2/2KR3R w - - 0 19",
    "a": {
     "san": "g4",
     "uci": "g3g4",
     "polo": "material",
     "eval": 109,
     "linea": [
      "g3g4",
      "f5g6",
      "d2c3",
      "g6h5",
      "g4h5",
      "d8c8"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 3,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Bc3",
     "uci": "d2c3",
     "polo": "iniciativa",
     "eval": 132,
     "linea": [
      "d2c3",
      "c5c4",
      "b3c4",
      "h8h5",
      "g3g4",
      "f5g4"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 3,
      "propone": 0,
      "material": -2
     }
    },
    "mejor": 132,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml280-4",
     "blancas": "R. Ponomariov",
     "negras": "I. Papaioannou",
     "evento": "Plovdiv, 2003",
     "ply": 36,
     "enLaPartida": "g4"
    }
   },
   {
    "id": "es51",
    "eje": "material",
    "fen": "r2q1rk1/1pp3pp/1pn1pn2/4p3/4P3/P2P1N2/1PP3PP/R1BQ1RK1 b - - 0 12",
    "a": {
     "san": "Nd4",
     "uci": "c6d4",
     "polo": "iniciativa",
     "eval": -44,
     "linea": [
      "c6d4",
      "f3e5",
      "d4b3",
      "c2b3",
      "d8d4",
      "g1h1"
     ],
     "medidas": {
      "ataque": 1,
      "estructura": 1,
      "cambios": 3,
      "propone": 0,
      "material": -4
     }
    },
    "b": {
     "san": "Qd6",
     "uci": "d8d6",
     "polo": "material",
     "eval": -48,
     "linea": [
      "d8d6",
      "h2h3",
      "d6c5",
      "g1h2",
      "h7h6",
      "c1d2"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -44,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml146-5",
     "blancas": "F. Marshall",
     "negras": "S. Tarrasch",
     "evento": "Nuremberg, 1905",
     "ply": 23,
     "enLaPartida": "Qd6"
    }
   },
   {
    "id": "es52",
    "eje": "material",
    "fen": "r1bqk2r/p1p1bppp/1p2pn2/4N1B1/3P4/3B4/PPP2PPP/R2QK2R b KQkq - 1 9",
    "a": {
     "san": "Bb7",
     "uci": "c8b7",
     "polo": "material",
     "eval": -14,
     "linea": [
      "c8b7",
      "c2c3",
      "e8g8",
      "d1e2",
      "f6d7",
      "g5f4"
     ],
     "medidas": {
      "ataque": 1,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Qd5",
     "uci": "d8d5",
     "polo": "iniciativa",
     "eval": -9,
     "linea": [
      "d8d5",
      "f2f3",
      "c8a6",
      "d3a6",
      "d5a5",
      "c2c3"
     ],
     "medidas": {
      "ataque": 1,
      "estructura": 0,
      "cambios": 3,
      "propone": 0,
      "material": -3
     }
    },
    "mejor": -9,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml027-2",
     "blancas": "C. Schlechter",
     "negras": "A. Rubinstein",
     "evento": "San Sebastian, 1912",
     "ply": 17,
     "enLaPartida": "Bb7"
    }
   },
   {
    "id": "es53",
    "eje": "material",
    "fen": "r3kb1r/pp1q1ppp/4pn2/6B1/3p4/5N2/PPP1QPPP/2KR3R b kq - 1 11",
    "a": {
     "san": "a6",
     "uci": "a7a6",
     "polo": "iniciativa",
     "eval": -47,
     "linea": [
      "a7a6",
      "f3d4",
      "d7c7",
      "g5f6",
      "g7f6",
      "c1b1"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0.5,
      "cambios": 3,
      "propone": 0,
      "material": -1
     }
    },
    "b": {
     "san": "Bc5",
     "uci": "f8c5",
     "polo": "material",
     "eval": -28,
     "linea": [
      "f8c5",
      "f3d4",
      "c5d4",
      "g5f6",
      "g7f6",
      "c2c3"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0.5,
      "cambios": 6,
      "propone": 0,
      "material": 2
     }
    },
    "mejor": -21,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml191-2",
     "blancas": "A. Mikhalchishin",
     "negras": "A. Chernin",
     "evento": "Cienfuegos, 1981",
     "ply": 21,
     "enLaPartida": "Be7"
    }
   },
   {
    "id": "es54",
    "eje": "material",
    "fen": "2r1r1k1/3b1pbp/5np1/q1pPB3/1pP3P1/p2N1P2/P1Q3BP/4RRK1 b - - 1 25",
    "a": {
     "san": "Qb6",
     "uci": "a5b6",
     "polo": "material",
     "eval": 85,
     "linea": [
      "a5b6",
      "c2d2",
      "b4b3",
      "a2b3",
      "b6b3",
      "d2c3"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Qa6",
     "uci": "a5a6",
     "polo": "iniciativa",
     "eval": 86,
     "linea": [
      "a5a6",
      "g4g5",
      "f6d5",
      "e5g7",
      "d5e3",
      "c2f2"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": -1,
      "cambios": 3,
      "propone": 0,
      "material": -2
     }
    },
    "mejor": 114,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml210-1",
     "blancas": "T. Balogh",
     "negras": "A. Istratescu",
     "evento": "Zonal Krynica, 1998",
     "ply": 49,
     "enLaPartida": "Ba4"
    }
   },
   {
    "id": "es55",
    "eje": "material",
    "fen": "r2q1rk1/2p2ppp/2n3b1/1p1pP3/p2Pn3/4B3/PPBN1PPP/R2Q1RK1 b - - 1 16",
    "a": {
     "san": "a3",
     "uci": "a4a3",
     "polo": "iniciativa",
     "eval": -39,
     "linea": [
      "a4a3",
      "d2e4",
      "a3b2",
      "a1b1",
      "g6e4",
      "b1b2"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": -1,
      "cambios": 3,
      "propone": 0,
      "material": -2
     }
    },
    "b": {
     "san": "Qd7",
     "uci": "d8d7",
     "polo": "material",
     "eval": -41,
     "linea": [
      "d8d7",
      "f2f3",
      "e4d2",
      "d1d2",
      "c6a5",
      "b2b3"
     ],
     "medidas": {
      "ataque": 1,
      "estructura": 0,
      "cambios": 6,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -27,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml045-5",
     "blancas": "A. Karpov",
     "negras": "A. Yusupov",
     "evento": "URS-ch50 Moscú, 1983",
     "ply": 31,
     "enLaPartida": "a3"
    }
   },
   {
    "id": "es56",
    "eje": "material",
    "fen": "8/2rk1pp1/3p1n1p/4pPbP/4P3/1N1K4/2P3R1/R7 w - - 10 33",
    "a": {
     "san": "Rh2",
     "uci": "g2h2",
     "polo": "material",
     "eval": 0,
     "linea": [
      "g2h2",
      "d6d5",
      "e4d5",
      "e5e4",
      "d3d4",
      "f6g4"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 1
     }
    },
    "b": {
     "san": "c4",
     "uci": "c2c4",
     "polo": "iniciativa",
     "eval": 4,
     "linea": [
      "c2c4",
      "f6h5",
      "g2a2",
      "h5f4",
      "d3c3",
      "h6h5"
     ],
     "medidas": {
      "ataque": 1,
      "estructura": 1.5,
      "cambios": 0,
      "propone": 0,
      "material": -1
     }
    },
    "mejor": 4,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml344-4",
     "blancas": "D. Andreikin",
     "negras": "A. Areshchenko",
     "evento": "8th ch-Euro Dresden, 2007",
     "ply": 64,
     "enLaPartida": "Rh2"
    }
   },
   {
    "id": "es57",
    "eje": "material",
    "fen": "2rq1rk1/pp2npp1/2b1p2p/4N3/3PQ3/1B6/PP3PPP/2R2RK1 w - - 1 18",
    "a": {
     "san": "Qe2",
     "uci": "e4e2",
     "polo": "iniciativa",
     "eval": -47,
     "linea": [
      "e4e2",
      "d8d4",
      "e5f7",
      "f8f7",
      "e2e6",
      "d4f6"
     ],
     "medidas": {
      "ataque": -2,
      "estructura": 0.5,
      "cambios": 3,
      "propone": 0,
      "material": -2
     }
    },
    "b": {
     "san": "Qd3",
     "uci": "e4d3",
     "polo": "material",
     "eval": -47,
     "linea": [
      "e4d3",
      "d8b6",
      "c1c5",
      "f8d8",
      "f1c1",
      "b6b4"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -20,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml035-2",
     "blancas": "V. Korchnoi",
     "negras": "A. Karpov",
     "evento": "Cto Mundial. Merano (9), 1981",
     "ply": 34,
     "enLaPartida": "Nxc6"
    }
   },
   {
    "id": "es58",
    "eje": "material",
    "fen": "r1b1r1k1/pp3pp1/2p2n2/7p/6PP/5P2/PPPB4/2KR1B1R w - h6 0 18",
    "a": {
     "san": "gxh5",
     "uci": "g4h5",
     "polo": "material",
     "eval": 60,
     "linea": [
      "g4h5",
      "f6h5",
      "h1g1",
      "c8f5",
      "g1g5",
      "g7g6"
     ],
     "medidas": {
      "ataque": 1,
      "estructura": 2,
      "cambios": 0,
      "propone": 1,
      "material": 0
     }
    },
    "b": {
     "san": "Bd3",
     "uci": "f1d3",
     "polo": "iniciativa",
     "eval": 36,
     "linea": [
      "f1d3",
      "h5g4",
      "h1g1",
      "g4f3",
      "d1f1",
      "f6e4"
     ],
     "medidas": {
      "ataque": 2,
      "estructura": 2,
      "cambios": 0,
      "propone": 0,
      "material": -2
     }
    },
    "mejor": 60,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml203-4",
     "blancas": "V. Bologan",
     "negras": "O. Romanishin",
     "evento": "Nikolaev, 1995",
     "ply": 34,
     "enLaPartida": "g5"
    }
   },
   {
    "id": "es59",
    "eje": "material",
    "fen": "1r4k1/3qpp2/3p1bp1/3P4/2B3P1/pP3P2/P1PQ4/1K5R b - - 0 26",
    "a": {
     "san": "Rc8",
     "uci": "b8c8",
     "polo": "iniciativa",
     "eval": -100,
     "linea": [
      "b8c8",
      "c2c3",
      "c8c4",
      "b3c4",
      "d7c8",
      "h1e1"
     ],
     "medidas": {
      "ataque": -1,
      "estructura": 0,
      "cambios": 8,
      "propone": 0,
      "material": -2
     }
    },
    "b": {
     "san": "Kg7",
     "uci": "g8g7",
     "polo": "material",
     "eval": -71,
     "linea": [
      "g8g7",
      "c2c3",
      "b8h8",
      "h1h8",
      "g7h8",
      "d2e3"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 5,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -71,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml198-1",
     "blancas": "E. Geller",
     "negras": "I. Horowitz",
     "evento": "USA-URS New York, 1954",
     "ply": 51,
     "enLaPartida": "Qc7"
    }
   },
   {
    "id": "es60",
    "eje": "material",
    "fen": "r3r1k1/pp2qppp/2p2n2/8/P2Pp1b1/2P1P3/2QN1PPP/RR3BK1 b - - 5 16",
    "a": {
     "san": "Rac8",
     "uci": "a8c8",
     "polo": "material",
     "eval": -77,
     "linea": [
      "a8c8",
      "h2h3",
      "g4f5",
      "c2b3",
      "c8c7",
      "b3b4"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Rad8",
     "uci": "a8d8",
     "polo": "iniciativa",
     "eval": -67,
     "linea": [
      "a8d8",
      "c3c4",
      "c6c5",
      "d4c5",
      "g4c8",
      "d2b3"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": -1
     }
    },
    "mejor": -67,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml276-3",
     "blancas": "S. Volkov",
     "negras": "V. Zvjaginsev",
     "evento": "ch-RUS Moscú, 2005",
     "ply": 31,
     "enLaPartida": "Rad8"
    }
   },
   {
    "id": "es61",
    "eje": "material",
    "fen": "1r3rk1/4ppbp/pp1q2p1/2pn4/P7/1QPP2P1/1P3PBP/R1B2RK1 b - - 4 17",
    "a": {
     "san": "Rbd8",
     "uci": "b8d8",
     "polo": "iniciativa",
     "eval": -21,
     "linea": [
      "b8d8",
      "g2d5",
      "d6d5",
      "b3b6",
      "d8d6",
      "b6c7"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 6,
      "propone": 0,
      "material": -1
     }
    },
    "b": {
     "san": "e6",
     "uci": "e7e6",
     "polo": "material",
     "eval": 2,
     "linea": [
      "e7e6",
      "h2h4",
      "h7h5",
      "g2d5",
      "e6d5",
      "c1f4"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 3,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 2,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml026-5",
     "blancas": "Miroslav Filip",
     "negras": "Ludek Pachman",
     "evento": "Praga, 1953",
     "ply": 33,
     "enLaPartida": "e6"
    }
   },
   {
    "id": "es62",
    "eje": "material",
    "fen": "rn3rk1/pb1q1pbp/1pp3p1/3P2B1/4B3/1Q3N2/PP3PPP/R4RK1 w - - 3 16",
    "a": {
     "san": "Rad1",
     "uci": "a1d1",
     "polo": "material",
     "eval": 11,
     "linea": [
      "a1d1",
      "c6d5",
      "e4d5",
      "b8a6",
      "g5e3",
      "b7d5"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0.5,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Rac1",
     "uci": "a1c1",
     "polo": "iniciativa",
     "eval": -1,
     "linea": [
      "a1c1",
      "c6d5",
      "f1d1",
      "h7h6",
      "g5f4",
      "d7e6"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0.5,
      "cambios": 0,
      "propone": 0,
      "material": -1
     }
    },
    "mejor": 18,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml296-2",
     "blancas": "Kramer",
     "negras": "Busek",
     "evento": "Vienna, 1955 Desfensa Eslava",
     "ply": 30,
     "enLaPartida": "dxc6"
    }
   },
   {
    "id": "es63",
    "eje": "material",
    "fen": "r2q1rk1/pb1nbppp/1p3n2/2pp2B1/3P3P/2NBPN2/PPQ2PP1/2KR3R b - h3 0 11",
    "a": {
     "san": "b5",
     "uci": "b6b5",
     "polo": "iniciativa",
     "eval": -56,
     "linea": [
      "b6b5",
      "d3b5",
      "a8c8",
      "b5d3",
      "f8e8",
      "c1b1"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0.5,
      "cambios": 0,
      "propone": 1,
      "material": -1
     }
    },
    "b": {
     "san": "a6",
     "uci": "a7a6",
     "polo": "material",
     "eval": -68,
     "linea": [
      "a7a6",
      "f3e5",
      "c5d4",
      "e3d4",
      "f6e4",
      "g5e7"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -43,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml197-5",
     "blancas": "A. Rubinstein",
     "negras": "R. Teichmann",
     "evento": "Viena, 1908",
     "ply": 21,
     "enLaPartida": "c4"
    }
   },
   {
    "id": "es64",
    "eje": "material",
    "fen": "bq1rrbk1/3n1pp1/pp1ppn1p/8/2P1P3/P1N1BP2/1P1NBQPP/2RR3K b - - 0 24",
    "a": {
     "san": "Bc6",
     "uci": "a8c6",
     "polo": "material",
     "eval": -72,
     "linea": [
      "a8c6",
      "b2b4",
      "a6a5",
      "d2f1",
      "a5b4",
      "a3b4"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "d5",
     "uci": "d6d5",
     "polo": "iniciativa",
     "eval": -78,
     "linea": [
      "d6d5",
      "c4d5",
      "e6d5",
      "e4d5",
      "b6b5",
      "d2e4"
     ],
     "medidas": {
      "ataque": 2,
      "estructura": 0.5,
      "cambios": 0,
      "propone": 1,
      "material": -1
     }
    },
    "mejor": -64,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml053-4",
     "blancas": "A. Karpov",
     "negras": "U. Andersson",
     "evento": "Milano, 1975",
     "ply": 47,
     "enLaPartida": "d5"
    }
   },
   {
    "id": "es65",
    "eje": "material",
    "fen": "r4rk1/pp4b1/2bpp2p/4qpp1/2P5/1PNQP1P1/P4PP1/1BR2RK1 w - f6 0 22",
    "a": {
     "san": "g4",
     "uci": "g3g4",
     "polo": "iniciativa",
     "eval": 24,
     "linea": [
      "g3g4",
      "f5g4",
      "b3b4",
      "a8d8",
      "c3b5",
      "e5f5"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0.5,
      "cambios": 0,
      "propone": 1,
      "material": -1
     }
    },
    "b": {
     "san": "b4",
     "uci": "b3b4",
     "polo": "material",
     "eval": 35,
     "linea": [
      "b3b4",
      "h6h5",
      "f2f4",
      "e5f6",
      "b4b5",
      "c6e8"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 35,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml236-6",
     "blancas": "Ravinsky",
     "negras": "A. Kotov",
     "evento": "Leningrad, 1949",
     "ply": 42,
     "enLaPartida": "g4"
    }
   },
   {
    "id": "es66",
    "eje": "material",
    "fen": "rn1q1rk1/pbp1bpp1/1p2pn1p/3p4/2PP3B/2N1PN2/PP2BPPP/R2QK2R w KQ - 2 9",
    "a": {
     "san": "Rc1",
     "uci": "a1c1",
     "polo": "material",
     "eval": 11,
     "linea": [
      "a1c1",
      "d5c4",
      "e1g1",
      "b8d7",
      "e2c4",
      "a7a6"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 2,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Bg3",
     "uci": "h4g3",
     "polo": "iniciativa",
     "eval": 7,
     "linea": [
      "h4g3",
      "d5c4",
      "e1g1",
      "b8d7",
      "f3d2",
      "f6d5"
     ],
     "medidas": {
      "ataque": -1,
      "estructura": 2,
      "cambios": 0,
      "propone": 0,
      "material": -1
     }
    },
    "mejor": 17,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml117-2",
     "blancas": "V. Korchnoi",
     "negras": "E. Geller",
     "evento": "Moscú. Match Candidatos 1971",
     "ply": 16,
     "enLaPartida": "Bxf6"
    }
   },
   {
    "id": "es67",
    "eje": "material",
    "fen": "r1bqkb1r/p1n1pppp/2p5/2p5/Q7/2NP2P1/PP2PP1P/R1B1K1NR b KQkq - 1 8",
    "a": {
     "san": "e5",
     "uci": "e7e5",
     "polo": "iniciativa",
     "eval": -45,
     "linea": [
      "e7e5",
      "c1e3",
      "c7e6",
      "a4c6",
      "c8d7",
      "c6d5"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": -1
     }
    },
    "b": {
     "san": "Ne6",
     "uci": "c7e6",
     "polo": "material",
     "eval": -63,
     "linea": [
      "c7e6",
      "g1f3",
      "g7g6",
      "f3g5",
      "e6d4",
      "e2e3"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": -45,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml010-1",
     "blancas": "Mark Taimanov",
     "negras": "Alexei Suetin",
     "evento": "URSS-ch21 Kiev, 1954",
     "ply": 15,
     "enLaPartida": "Qd7"
    }
   },
   {
    "id": "es68",
    "eje": "material",
    "fen": "1r1r2k1/1b1n1pbp/pp4p1/1q6/3pPQ2/1B6/PB1N1PPP/2R2RK1 b - - 3 22",
    "a": {
     "san": "Rf8",
     "uci": "d8f8",
     "polo": "material",
     "eval": 8,
     "linea": [
      "d8f8",
      "d2f3",
      "d7c5",
      "b2d4",
      "c5b3",
      "a2b3"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "Nc5",
     "uci": "d7c5",
     "polo": "iniciativa",
     "eval": -3,
     "linea": [
      "d7c5",
      "f4f7",
      "g8h8",
      "b2a3",
      "d4d3",
      "f1d1"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0.5,
      "cambios": 0,
      "propone": 0,
      "material": -1
     }
    },
    "mejor": 8,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml161-3",
     "blancas": "L. Shamkovich",
     "negras": "A. Karpov",
     "evento": "Cto URSS. Leningrado, 1971",
     "ply": 43,
     "enLaPartida": "Rf8"
    }
   },
   {
    "id": "es69",
    "eje": "material",
    "fen": "r1b1k2r/pp2nppp/1n2p3/q2pP3/P1pP4/2P2N2/2PBBPPP/R2QK2R w KQkq - 3 11",
    "a": {
     "san": "g4",
     "uci": "g2g4",
     "polo": "iniciativa",
     "eval": 39,
     "linea": [
      "g2g4",
      "b6a4",
      "f3h4",
      "c8d7",
      "f2f4",
      "a5b6"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0.5,
      "cambios": 0,
      "propone": 0,
      "material": -1
     }
    },
    "b": {
     "san": "Ng5",
     "uci": "f3g5",
     "polo": "material",
     "eval": 11,
     "linea": [
      "f3g5",
      "h7h6",
      "g5h3",
      "c8d7",
      "h3f4",
      "b6a4"
     ],
     "medidas": {
      "ataque": 2,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "mejor": 39,
    "fuente": {
     "de": "una-clase-al-dia",
     "partida": "ml050-4",
     "blancas": "A. Tolush",
     "negras": "M. Botvinnik",
     "evento": "URS-ch Moscú, 1945",
     "ply": 20,
     "enLaPartida": "O-O"
    }
   },
   {
    "id": "es70",
    "eje": "material",
    "fen": "4r3/1p2rk1n/2p1p3/p1Pp1n1p/3P1Pp1/1P4P1/P1N1RNKP/3R4 w - - 4 31",
    "a": {
     "san": "Rb1",
     "uci": "d1b1",
     "polo": "material",
     "eval": 0,
     "linea": [
      "d1b1",
      "h7f6",
      "b3b4",
      "h5h4",
      "a2a4",
      "a5b4"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": 0,
      "cambios": 0,
      "propone": 0,
      "material": 0
     }
    },
    "b": {
     "san": "a4",
     "uci": "a2a4",
     "polo": "iniciativa",
     "eval": 0,
     "linea": [
      "a2a4",
      "h7f6",
      "b3b4",
      "a5b4",
      "d1b1",
      "h5h4"
     ],
     "medidas": {
      "ataque": 0,
      "estructura": -1,
      "cambios": 0,
      "propone": 0,
      "material": -1
     }
    },
    "mejor": 0,
    "fuente": {
     "de": "ganar-con-poco",
     "partida": "gcp-5",
     "blancas": "Valeri Sálov",
     "negras": "Nigel Short",
     "evento": "Barcelona, 1989",
     "ply": 60,
     "enLaPartida": "Ne3"
    }
   }
  ];
  /* ESTILO-FIN */

  /* Los ejes, con sus dos polos en el orden de POLOS de estilo-medidas.js. */
  const EJES = {
    ataque: { nombre: "Atacar o maniobrar", polos: { atacar: "Atacar al rey", maniobrar: "Maniobrar" } },
    estructura: { nombre: "Abrir o cerrar", polos: { abrir: "Abrir el juego", cerrar: "Mantenerlo cerrado" } },
    cambios: { nombre: "Cambiar o mantener piezas", polos: { cambiar: "Cambiar piezas", mantener: "Mantener las piezas" } },
    material: { nombre: "Material o iniciativa", polos: { material: "Quedarse con el material", iniciativa: "Dar material por la iniciativa" } },
  };

  /* La forma de cada versión: qué ejes mide, cuántas preguntas por eje lleva,
   * hasta cuántas más agrega en un eje que quedó dudoso y si lleva las dos
   * posiciones de control (ver js/estilo-perfil.js). Cambiar la forma sube
   * VERSION, y una prueba vieja se sigue leyendo con la forma de la suya:
   * una de la versión 1 no tiene el cuarto eje, no un cuarto eje «sin
   * definir».
   *   1  tres ejes, 10 por eje y hasta 5 más (32 a 47 preguntas).
   *   2  el cuarto eje, «material o iniciativa». 8 por eje y hasta 6 más:
   *      con 10 serían 42 preguntas de entrada; con 8, quien tiene un estilo
   *      claro termina en 34 y la prueba agrega donde hace falta. Nadie pasa
   *      de 58 (la base acepta hasta 60 respuestas), y lo que sobra de cada eje
   *      queda para quien repite la prueba. «Material o iniciativa» tiene 25
   *      posiciones (es61 a es70 entraron después, sin cambiar la forma: la
   *      prueba elige al azar entre las del eje).
   *   3  la versión corta, para quien empieza: los cuatro ejes, pero solo con
   *      las 8 posiciones más simples de cada uno (`posiciones`: las de menos
   *      piezas y menos jugadas posibles, EstiloMedidas.complejidad; las
   *      elige esa regla y verificar-estilo.js lo comprueba), 6 por eje y
   *      hasta 2 más: 26 preguntas con un estilo claro, nunca más de 34 (con
   *      5 por eje, un estilo claro siempre pedía una más en cada eje: con 5
   *      respuestas iguales el margen todavía cruza el medio). La
   *      recomendación, con teoría de nivel 1 (`inicial`). */
  const FORMAS = {
    1: { ejes: ["ataque", "estructura", "cambios"], porEje: 10, extraPorEje: 5, controles: true },
    2: { ejes: ["ataque", "estructura", "cambios", "material"], porEje: 8, extraPorEje: 6, controles: true },
    3: { ejes: ["ataque", "estructura", "cambios", "material"], porEje: 6, extraPorEje: 2, controles: true, inicial: true,
      posiciones: ["es02","es06","es07","es09","es10","es11","es12","es13","es16","es18","es21","es22","es23","es27","es29","es30",
        "es32","es33","es34","es35","es39","es40","es44","es45","es46","es51","es52","es53","es54","es56","es58","es59"] },
  };
  // La que hace quien empieza. VERSION es la de la prueba completa.
  const VERSION_INICIAL = 3;
  const VERSION = 2;
  const FORMA = FORMAS[VERSION];

  /* Cuánto distingue (`a`) y cuánto tira hacia el primer polo (`b`) cada
   * posición, calculado con las respuestas reales: lo escribe
   * herramientas/estilo-calibrar.js y no se edita a mano. Una posición que no
   * está acá pesa a = 1, b = 0. */
  /* CALIBRADO-INICIO: generado por herramientas/estilo-calibrar.js — no se edita a mano. */
  const CALIBRADO = {};
  /* CALIBRADO-FIN */

  const api = { VERSION, VERSION_INICIAL, ITEMS, EJES, FORMA, FORMAS, CALIBRADO };
  raiz.EstiloItems = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
