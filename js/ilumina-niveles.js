/**
 * Niveles de "Ilumina el Tablero" (Juegos) — datos separados del motor
 * (js/ilumina-engine.js), igual que puzzle-rush-data.js o
 * diagnostico-items.js separan contenido de lógica en el resto del sitio.
 *
 * Cada nivel: una figura (arte ASCII, ver ilumina-engine.js), las piezas
 * blancas a colocar (sin posición inicial: se colocan en cualquier casilla
 * vacía de la figura), las piezas negras fijas (si el nivel tiene alguna) y
 * la solución (para pistas y para la comprobación de este mismo archivo).
 *
 * 4 grupos de 6, de más fácil a más difícil:
 *   Grupo 1 — una sola pieza, sin amenazas: aprende cómo "ilumina" cada una.
 *   Grupo 2 — dos piezas distintas, cada una con su propia zona.
 *   Grupo 3 — aparece una pieza negra: hay que esquivar su ataque o
 *             bloquearlo con otra pieza (a una torre, alfil o dama sí se le
 *             puede bloquear el ataque; a un caballo, un rey o un peón no).
 *   Grupo 4 — niveles más grandes, combinando varias de las ideas de arriba.
 */
window.ILUMINA_NIVELES = [
  // ===================== GRUPO 1: aprende cada pieza =====================
  {
    id: "g1-1", grupo: 1, titulo: "La torre",
    descripcion: "La torre ilumina toda su fila y su columna, hasta el borde de la figura.",
    arte: [".X.", "XXX", ".X."],
    piezas: [{ id: "a", type: "r" }], negras: [],
    solucion: { a: [1, 1] },
  },
  {
    id: "g1-2", grupo: 1, titulo: "El alfil",
    descripcion: "El alfil ilumina sus dos diagonales completas.",
    arte: ["X.X", ".X.", "X.X"],
    piezas: [{ id: "a", type: "b" }], negras: [],
    solucion: { a: [1, 1] },
  },
  {
    id: "g1-3", grupo: 1, titulo: "La dama",
    descripcion: "La dama junta el alcance de la torre y el alfil: filas, columnas y diagonales.",
    arte: ["XXX", "XXX", "XXX"],
    piezas: [{ id: "a", type: "q" }], negras: [],
    solucion: { a: [1, 1] },
  },
  {
    id: "g1-4", grupo: 1, titulo: "El caballo",
    descripcion: "El caballo ilumina en salto de \"L\" — y puede saltar sobre cualquier pieza.",
    arte: [".X.X.", "X...X", "..X..", "X...X", ".X.X."],
    piezas: [{ id: "a", type: "n" }], negras: [],
    solucion: { a: [2, 2] },
  },
  {
    id: "g1-5", grupo: 1, titulo: "El rey",
    descripcion: "El rey ilumina solo las 8 casillas vecinas, un paso en cada dirección.",
    arte: ["XXX", "XXX", "XXX"],
    piezas: [{ id: "a", type: "k" }], negras: [],
    solucion: { a: [1, 1] },
  },
  {
    id: "g1-6", grupo: 1, titulo: "El peón",
    descripcion: "El peón blanco ilumina solo en diagonal hacia adelante — nunca de frente.",
    arte: ["X.X", ".X."],
    piezas: [{ id: "a", type: "p" }], negras: [],
    solucion: { a: [1, 1] },
  },

  // ===================== GRUPO 2: dos piezas, dos zonas =====================
  {
    id: "g2-1", grupo: 2, titulo: "Torre y alfil",
    descripcion: "Cada pieza tiene su propia figura que iluminar — colócalas en el centro de la suya.",
    arte: [".X..X.X", "XXX..X.", ".X..X.X"],
    piezas: [{ id: "a", type: "r" }, { id: "b", type: "b" }], negras: [],
    solucion: { a: [1, 1], b: [5, 1] },
  },
  {
    id: "g2-2", grupo: 2, titulo: "Dos caballos",
    descripcion: "Dos figuras idénticas, un caballo en cada una.",
    arte: [".X.X...X.X.", "X...X.X...X", "..X.....X..", "X...X.X...X", ".X.X...X.X."],
    piezas: [{ id: "a", type: "n" }, { id: "b", type: "n" }], negras: [],
    solucion: { a: [2, 2], b: [8, 2] },
  },
  {
    id: "g2-3", grupo: 2, titulo: "Dama y caballo",
    descripcion: "La dama cubre el cuadrado sólido; el caballo, el anillo salteado.",
    arte: [".....X.X.", "XXX.X...X", "XXX...X..", "XXX.X...X", ".....X.X."],
    piezas: [{ id: "a", type: "q" }, { id: "b", type: "n" }], negras: [],
    solucion: { a: [1, 2], b: [6, 2] },
  },
  {
    id: "g2-4", grupo: 2, titulo: "Rey y torre",
    descripcion: "El rey en el cuadrado chico, la torre en la cruz.",
    arte: ["XXX..X.", "XXX.XXX", "XXX..X."],
    piezas: [{ id: "a", type: "k" }, { id: "b", type: "r" }], negras: [],
    solucion: { a: [1, 1], b: [5, 1] },
  },
  {
    id: "g2-5", grupo: 2, titulo: "Alfil y peón",
    descripcion: "El peón solo necesita dos casillas — encuéntralas.",
    arte: ["X.X.X.X", ".X...X.", "X.X...."],
    piezas: [{ id: "a", type: "b" }, { id: "b", type: "p" }], negras: [],
    solucion: { a: [1, 1], b: [5, 1] },
  },
  {
    id: "g2-6", grupo: 2, titulo: "Torre y caballo",
    descripcion: "Ya conoces las dos figuras — ahora combínalas de memoria.",
    arte: [".....X.X.", ".X..X...X", "XXX...X..", ".X..X...X", ".....X.X."],
    piezas: [{ id: "a", type: "r" }, { id: "b", type: "n" }], negras: [],
    solucion: { a: [1, 2], b: [6, 2] },
  },

  // ===================== GRUPO 3: cuidado con las negras =====================
  {
    id: "g3-1", grupo: 3, titulo: "Bloquea el ataque",
    descripcion: "La torre negra ataca toda la fila. Pon el peón justo delante para bloquearla, y la torre blanca podrá iluminar el resto sin peligro.",
    arte: ["XXXX", "..X."],
    piezas: [{ id: "peon", type: "p" }, { id: "torre", type: "r" }],
    negras: [{ type: "r", c: 0, r: 0 }],
    solucion: { peon: [1, 0], torre: [2, 0] },
  },
  {
    id: "g3-2", grupo: 3, titulo: "La diagonal peligrosa",
    descripcion: "El alfil negro vigila toda la diagonal. Bloquéala con el peón para que la dama pueda instalarse a salvo.",
    arte: ["X...", ".XXX", ".XXX", ".XXX"],
    piezas: [{ id: "peon", type: "p" }, { id: "dama", type: "q" }],
    negras: [{ type: "b", c: 0, r: 0 }],
    solucion: { peon: [1, 1], dama: [2, 2] },
  },
  {
    id: "g3-3", grupo: 3, titulo: "Entre dos caballos",
    descripcion: "Dos caballos negros vigilan dos casillas cada uno — ninguna se puede bloquear. Busca la única casilla de la fila que ninguno alcanza.",
    arte: ["XXXXXXX", "..X.X.."],
    piezas: [{ id: "torre", type: "r" }],
    negras: [{ type: "n", c: 2, r: 1 }, { type: "n", c: 4, r: 1 }],
    solucion: { torre: [3, 0] },
  },
  {
    id: "g3-4", grupo: 3, titulo: "El caballo no se bloquea",
    descripcion: "Contra un caballo no sirve bloquear — salta por encima de cualquier cosa. Solo queda evitar las dos casillas que amenaza.",
    arte: ["XXXXX", "..X.."],
    piezas: [{ id: "torre", type: "r" }],
    negras: [{ type: "n", c: 2, r: 1 }],
    solucion: { torre: [2, 0] },
  },
  {
    id: "g3-5", grupo: 3, titulo: "Tres piezas, un equipo",
    descripcion: "Bloquea a la torre negra con el peón; la dama cubre casi todo desde el centro, y un caballo remata las esquinas que a la dama se le escapan.",
    arte: ["XXXX", ".XXX", ".XXX", ".XXX"],
    piezas: [{ id: "peon", type: "p" }, { id: "dama", type: "q" }, { id: "caballo", type: "n" }],
    negras: [{ type: "r", c: 0, r: 0 }],
    solucion: { peon: [1, 0], dama: [2, 2], caballo: [1, 1] },
  },
  {
    id: "g3-6", grupo: 3, titulo: "Doble cuidado",
    descripcion: "Torre negra a un lado, rey negro al otro. Bloquea la torre con el peón y encuentra la casilla que el rey tampoco alcanza.",
    arte: ["XXXXXXX"],
    piezas: [{ id: "peon", type: "p" }, { id: "torre", type: "r" }],
    negras: [{ type: "r", c: 0, r: 0 }, { type: "k", c: 6, r: 0 }],
    solucion: { peon: [1, 0], torre: [4, 0] },
  },

  // ===================== GRUPO 4: el reto final =====================
  {
    id: "g4-1", grupo: 4, titulo: "Doble bloqueo",
    descripcion: "Dos amenazas por separado: una torre negra que se bloquea, un caballo negro que solo se evita.",
    arte: ["XXXX.XXXXX", "..X....X.."],
    piezas: [{ id: "a_peon", type: "p" }, { id: "a_torre", type: "r" }, { id: "b_torre", type: "r" }],
    negras: [{ type: "r", c: 0, r: 0 }, { type: "n", c: 7, r: 1 }],
    solucion: { a_peon: [1, 0], a_torre: [2, 0], b_torre: [7, 0] },
  },
  {
    id: "g4-2", grupo: 4, titulo: "Dos peligros distintos",
    descripcion: "Un alfil negro que se bloquea, y dos caballos negros que solo se evitan.",
    arte: ["X...........", ".XXX.XXXXXXX", ".XXX...X.X..", ".XXX........"],
    piezas: [{ id: "a_peon", type: "p" }, { id: "a_dama", type: "q" }, { id: "b_torre", type: "r" }],
    negras: [{ type: "b", c: 0, r: 0 }, { type: "n", c: 7, r: 2 }, { type: "n", c: 9, r: 2 }],
    solucion: { a_peon: [1, 1], a_dama: [2, 2], b_torre: [8, 1] },
  },
  {
    id: "g4-3", grupo: 4, titulo: "Dama, torre y dos caballos",
    descripcion: "La dama, sin ninguna amenaza cerca, más la torre esquivando a los dos caballos.",
    arte: ["XXX.XXXXXXX", "XXX...X.X..", "XXX........"],
    piezas: [{ id: "a_a", type: "q" }, { id: "b_torre", type: "r" }],
    negras: [{ type: "n", c: 6, r: 1 }, { type: "n", c: 8, r: 1 }],
    solucion: { a_a: [1, 1], b_torre: [7, 0] },
  },
  {
    id: "g4-4", grupo: 4, titulo: "Repite la jugada",
    descripcion: "El mismo acertijo, dos veces seguidas — para comprobar que ya te sale de memoria.",
    arte: ["XXXXXXX.XXXXXXX"],
    piezas: [{ id: "a_peon", type: "p" }, { id: "a_torre", type: "r" }, { id: "b_peon", type: "p" }, { id: "b_torre", type: "r" }],
    negras: [{ type: "r", c: 0, r: 0 }, { type: "k", c: 6, r: 0 }, { type: "r", c: 8, r: 0 }, { type: "k", c: 14, r: 0 }],
    solucion: { a_peon: [1, 0], a_torre: [4, 0], b_peon: [9, 0], b_torre: [12, 0] },
  },
  {
    id: "g4-5", grupo: 4, titulo: "Todo junto",
    descripcion: "Una torre negra que se bloquea y un alfil negro que también — con una dama y una torre propias trabajando codo a codo.",
    arte: [".....X...", "XXXX..XXX", "..X...XXX", "......XXX"],
    piezas: [{ id: "a_peon", type: "p" }, { id: "a_torre", type: "r" }, { id: "b_peon", type: "p" }, { id: "b_dama", type: "q" }],
    negras: [{ type: "r", c: 0, r: 1 }, { type: "b", c: 5, r: 0 }],
    solucion: { a_peon: [1, 1], a_torre: [2, 1], b_peon: [6, 1], b_dama: [7, 2] },
  },
  {
    id: "g4-6", grupo: 4, titulo: "El reto final",
    descripcion: "Un caballo, dos torres y un peón, contra un caballo, una torre y un rey negros — todo lo que aprendiste, junto en un solo tablero.",
    arte: [".X.X...............", "X...X.XXXXX........", "..X.....X...XXXXXXX", "X...X..............", ".X.X..............."],
    piezas: [{ id: "caballo1", type: "n" }, { id: "torre1", type: "r" }, { id: "peon2", type: "p" }, { id: "torre2", type: "r" }],
    negras: [{ type: "n", c: 8, r: 2 }, { type: "r", c: 12, r: 2 }, { type: "k", c: 18, r: 2 }],
    solucion: { caballo1: [2, 2], torre1: [8, 1], peon2: [13, 2], torre2: [16, 2] },
  },
];
