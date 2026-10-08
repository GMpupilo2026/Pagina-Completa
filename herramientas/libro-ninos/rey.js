/* El tercer cuento de Peonita: «Peonita y el rey escondido», de Oscar Angulo
 * Cubero. Los primeros mates: la torre en la orilla, la escalera de las dos
 * torres, la caja de la dama, el ahogado (y cómo no caer en él), el beso de la
 * dama, la torre con la ayuda del rey y los primeros mates en dos jugadas.
 * Lo cuenta la búsqueda del Rey Carbón, el rey negro, que se escondió en el
 * volcán y solo vuelve a jugar si lo encuentran… y le dan jaque mate.
 *
 * Mismo formato que peonita.js y trucos.js, más dos tipos de ejercicio que
 * comprueba verificar-libro-ninos.js con chess.js:
 *   mate2  juegan las blancas y dan mate en dos: la respuesta es la ÚNICA
 *          primera jugada que, conteste lo que conteste el negro, deja un mate
 *          en una (y no hay ningún mate en una desde el principio)
 *   elige  dos jugadas para elegir: `opciones` dice qué deja cada una (mate,
 *          ahogado…) y la respuesta es la que da mate
 * Un ejercicio puede traer `solucion`: la frase entera de las soluciones, en
 * vez de la que arma el generador (tiene que nombrar la jugada de la respuesta).
 *
 * Los secretos para Alessandro (ver «Cada cuento lleva un secreto para
 * Alessandro» en docs/decisiones/cursos-y-material.md):
 *   - Sandro, el osito panda viajero que ayuda a buscar al rey, se llama así
 *     por Alessandro (son sus últimas seis letras).
 *   - En las soluciones del capítulo 6, las tres respuestas empiezan con A, L
 *     y E: de arriba hacia abajo dicen ALE.
 *   - El sol del capítulo 5, a la mitad del libro, es Alessandro: la misma
 *     carita del sol del segundo cuento, ahora con dos dientitos y saludando
 *     con las manos. Es el único sol así de este libro.
 *
 * Y tres para Karina, la esposa del autor (los marca `para` en SECRETOS):
 *   - La dedicatoria es un acróstico: sus seis versos dicen KARINA.
 *   - En el cielo del capítulo 6, el del beso de la dama, cinco estrellitas
 *     unidas con líneas tenues forman una K.
 *   - En el capítulo 7, donde la torre y el rey caminan de la mano, una piedra
 *     tiene un corazoncito tallado con «K+O», del color de la piedra.
 */
"use strict";
const D = require("./dibujos.js");
const { VALOR, NOMBRE, AUTOR } = require("./peonita.js");

const SLUG = "peonita-rey";
const CLAVE = "peonita-rey-oac-2026";
const TITULO = "Peonita y el rey escondido";
const TITULO_PDF = TITULO;
const SUBTITULO = "Un cuento para aprender los primeros jaques mate";
const ASUNTO = "Cuento para que ninas y ninos aprendan los primeros jaques mate del ajedrez";
const SECRETO = "ALESSANDRO";
const SECRETOS = [
  { tipo: "personaje", nombre: "Sandro" },
  { tipo: "acrostico-soluciones", capitulo: 6, texto: "ALE" },
  { tipo: "sol-gatea" },
  { tipo: "acrostico-dedicatoria", para: "KARINA" },
  { tipo: "constelacion", para: "KARINA", capitulo: 6, letra: "K" },
  { tipo: "grabado", para: "KARINA", texto: "K+O" },
];

const TAPA = {
  arriba: "Peonita", medio: "y el rey", abajo: "escondido",
  dibujo: D.volcan(330, 560, 1.7) +
    D.pieza("r", "n", 470, 690, 0.55, { espejo: true, cara: "feliz" }) +
    D.panda(120, 790, 0.85) +
    D.pieza("p", "n", 400, 790, 1.15, { bufanda: true, espejo: true }) +
    D.pieza("p", "b", 255, 815, 1.55, { mono: true }) +
    D.estrella(60, 470, 10) + D.estrella(560, 470, 8) + D.estrella(500, 380, 7),
};

const PRESENTACION = {
  titulo: "¡Hola de nuevo!",
  escena: {
    id: "hola3", fondo: "dia",
    alt: "Peonita, con su moño rosado, y Tizón, con su bufanda verde, saludan al pie de un volcán con humito. A su lado, un osito panda chiquito, con mochila y un mapa, levanta la mano.",
    contenido: D.volcan(470, 250, 1.1) +
      D.pieza("p", "b", 210, 292, 1.1, { mono: true }) + D.pieza("p", "n", 340, 292, 1.1, { bufanda: true, espejo: true }) +
      D.panda(90, 292, 0.62) + D.globo(205, 24, 200, ["¡Hola de nuevo!"], [255, 118]),
  },
  parrafos: [
    "¡Hola de nuevo! Soy Peonita, y conmigo viene, como siempre, Tizón. En el primer libro aprendimos a mover las piezas y en el segundo, los trucos del bosque.",
    "Ahora nos toca lo más emocionante del ajedrez: atrapar al rey. Porque una partida se gana con un jaque mate, y para dar jaque mate hay que saber cómo encerrar a un rey que no se quiere dejar atrapar.",
    "Esta es la historia del día en que el Rey Carbón se escondió en el volcán, y de cómo lo buscamos con un nuevo amigo que llegó de muy lejos con su mochila y su mapa.",
    "Ten listo tu tablero. ¿Lista? ¿Listo? ¡Vamos al volcán!",
  ],
};

const NOTA_ADULTOS = [
  "Este tercer libro es para quienes ya saben mover las piezas y conocen el jaque, el jaque mate y el ahogado (lo que enseña «Peonita y el reino de las 64 casillas»). No hace falta haber leído el segundo, aunque ayuda. Sigue pensado para leer acompañado, un capítulo por vez, con un tablero de verdad sobre la mesa.",
  "Cada capítulo enseña un mate: la torre en la orilla, la escalera de las dos torres, la caja de la dama, el beso de la dama y la torre con la ayuda de su rey. El capítulo 5 está dedicado al ahogado, el error más común cuando se tiene mucha ventaja, y el 8 a los primeros mates en dos jugadas. El 9 repasa todo.",
  "En «¡A jugar!», cada respuesta es la única jugada que da el mate (o, en los mates en dos, la única primera jugada que lo consigue). Conviene armar la posición en el tablero y jugarla: que la niña o el niño pruebe las otras jugadas y vea por qué el rey se escapa.",
  "Lo mejor para practicar estos mates es jugarlos de verdad: pongan un rey solo contra rey y torre, o rey y dama, y túrnense para dar el mate. Con unas cuantas partidas, sale sin pensar.",
];

const DEDICATORIA = [
  "Kilómetros de casillas te esperan:",
  "a buscar al rey, paso a pasito,",
  "rodeándolo despacio, con calma,",
  "igual que un abrazo que no aprieta,",
  "nunca dejándolo sin salida,",
  "atento siempre a no ahogarlo.",
];

/* La K del cielo del capítulo 6 (un secreto para Karina). */
const CONSTELACION_K = `<g data-constelacion="K"><g stroke="#fff3bf" stroke-width="1.2" opacity=".45" fill="none"><path d="M150,32 L150,132 M150,84 L214,34 M150,84 L210,130"/></g>` +
  [[150, 32], [150, 132], [150, 84], [214, 34], [210, 130]].map(([x, y]) => D.estrella(x, y, 4.5, "#fff3bf")).join("") + "</g>";

/* ---------------------------------------------------------- capítulos */
const CAPITULOS = [
  {
    n: 1,
    titulo: "El rey que no quería jugar",
    escena: {
      id: "carbon", fondo: "dia",
      alt: "Al pie de un volcán con humito, el Rey Carbón, el rey negro, se aleja con su corona, saludando con la mano. Peonita y Tizón lo miran sorprendidos, y a un lado se asoma un osito panda chiquito con una mochila.",
      contenido: D.volcan(470, 250, 1.1) + D.pieza("r", "n", 430, 292, 0.7, { cara: "feliz", espejo: true }) +
        D.pieza("p", "b", 150, 292, 0.85, { mono: true, cara: "sorpresa" }) + D.pieza("p", "n", 255, 292, 0.85, { bufanda: true, cara: "sorpresa" }) +
        D.panda(560, 300, 0.42, { espejo: true }) + D.globo(330, 20, 200, ["¡Atrápenme si pueden!"], [410, 150]),
    },
    cuento: [
      "Un domingo, la maestra llevó a la clase de paseo a las faldas de un volcán. La caja de ajedrez fue con ellos, como siempre, y en la tarde, mientras los niños comían, las piezas salieron a jugar sobre una piedra plana.",
      "Pero el Rey Carbón, el rey de las piezas negras, no quería jugar.",
      "—Siempre es lo mismo —protestó—. Todos me persiguen, me dan jaque y yo tengo que andar escapándome. ¡Hoy me voy a esconder!",
      "Y antes de que nadie pudiera decir nada, se fue caminando, paso a pasito, hacia el volcán.",
      "—¡Sin rey no hay partida! —dijo Tizón, preocupado.",
      "Entonces, detrás de una piedra, se asomó un osito panda chiquito, con una mochila naranja y un mapa doblado bajo el brazo.",
      "—Hola —dijo con una vocecita—. Me llamo Sandro. Vengo de muy lejos, de las montañas donde crece el bambú, y viajo por el mundo con mi mapa. ¿Están buscando a alguien? ¡A mí me encanta jugar a las escondidas!",
      "Don Lento bajó despacito de su rama y les recordó lo más importante: «Al rey nunca se lo come. Se lo encierra hasta que no tenga adónde ir. Eso es el jaque mate: el rey está en jaque y no tiene ninguna casilla para escaparse».",
      "—Entonces, para que el Rey Carbón vuelva, ¡vamos a tener que aprender a darle jaque mate! —dijo Peonita. Y Sandro abrió su mapa.",
    ],
    aprendi: [
      "Jaque es cuando atacan al rey. El rey tiene que salvarse enseguida.",
      "Jaque mate es cuando el rey está en jaque y no tiene ninguna forma de salvarse. Ahí se acaba la partida.",
      "Al rey nunca se lo come: se lo encierra.",
    ],
    muestras: [
      { fen: "R3k3/8/4K3/8/8/8/8/8 b - - 0 1", desde: { fen: "4k3/8/4K3/8/8/8/8/R7 w - - 0 1", jugada: "Ra8#" }, flechas: [["a8", "e8"]], pie: "Jaque mate: la torre ataca al rey negro, y el rey no tiene ninguna casilla adonde escaparse." },
    ],
    ejercicios: [
      { tipo: "jaque", fen: "k3r3/8/8/8/8/8/8/4K3 w - - 0 1", respuesta: true, explica: "La torre negra lo ataca por la columna e." },
      { tipo: "final", fen: "R6k/8/7K/8/8/8/8/8 b - - 0 1", respuesta: "mate", explica: "La torre ataca al rey por la fila 8, y las casillas g7 y h7 las cuida el rey blanco." },
      { tipo: "final", fen: "R6k/8/8/6K1/8/8/8/8 b - - 0 1", respuesta: "ninguno", explica: "El rey negro está en jaque, pero se puede escapar a g7 o a h7." },
      { tipo: "mate", fen: "7k/8/6K1/8/8/8/8/R7 w - - 0 1", respuesta: "Ta8" },
    ],
  },

  {
    n: 2,
    titulo: "La orilla del tablero",
    escena: {
      id: "orilla", fondo: "dia",
      alt: "Sandro, el osito panda, extiende su mapa en el suelo: el mapa es un tablero de ajedrez. Peonita señala la orilla del tablero y Doña Muralla, la torre, sonríe a su lado.",
      contenido: D.panda(150, 292, 0.6) + D.pieza("t", "b", 450, 292, 0.8, { espejo: true }) + D.pieza("p", "b", 330, 292, 0.85, { mono: true }) +
        `<g transform="translate(200,232) skewX(-20)">${Array.from({ length: 16 }, (_, i) => `<rect x="${(i % 4) * 22}" y="${Math.floor(i / 4) * 12}" width="22" height="12" fill="${(i + Math.floor(i / 4)) % 2 ? "#8a6a43" : "#f3e3c3"}"/>`).join("")}</g>`,
    },
    cuento: [
      "Sandro desdobló su mapa sobre la piedra. ¡Tenía cuadritos claros y oscuros, como un tablero!",
      "—Mi mapa dice que el volcán tiene orillas —explicó—. Y cuando yo juego a las escondidas, ¡siempre me encuentran cuando me arrinconan contra la pared!",
      "—¡Igual pasa con el rey! —dijo Don Lento—. En el centro del tablero, el rey tiene muchas casillas para escaparse. En la orilla, tiene pocas. Por eso, para darle mate, primero hay que llevarlo a la orilla.",
      "Doña Muralla, la torre, dio un paso adelante.",
      "—Yo sé un mate muy bonito en la orilla —dijo—. Cuando los dos reyes quedan frente a frente, con una sola casilla en medio, el rey blanco le tapa al negro las casillas de adelante. Y yo llego por la orilla y le doy jaque. ¡No tiene adónde ir!",
      "Peonita lo probó en el mapa de Sandro: rey frente a rey, la torre en la orilla… ¡jaque mate!",
      "—Pero ojo —dijo Don Lento—: si los reyes no están frente a frente, el rey negro se escapa por un costado.",
    ],
    aprendi: [
      "En la orilla del tablero, el rey tiene pocas casillas para escaparse.",
      "El mate de la torre en la orilla: los reyes frente a frente, con una casilla en medio, y la torre da jaque por la orilla.",
      "Si los reyes no están frente a frente, el rey negro se escapa.",
    ],
    muestras: [
      { fen: "4k3/8/4K3/8/8/8/8/R7 w - - 0 1", flechas: [["a1", "a8"]], pie: "Los reyes, frente a frente. La torre sube a la orilla: Ta8 es jaque mate." },
    ],
    ejercicios: [
      { tipo: "mate", fen: "2k5/8/2K5/8/8/8/8/7R w - - 0 1", respuesta: "Th8" },
      { tipo: "mate", fen: "6k1/8/6K1/8/8/8/8/R7 w - - 0 1", respuesta: "Ta8" },
      { tipo: "mate", fen: "8/8/8/8/8/k1K5/8/7R w - - 0 1", respuesta: "Ta1", explica: "La orilla también puede ser una columna: el rey negro está en la columna a." },
      { tipo: "final", fen: "R3k3/8/3K4/8/8/8/8/8 b - - 0 1", respuesta: "ninguno", explica: "Es jaque, pero los reyes no están frente a frente: el rey negro se escapa a f7 o a f8." },
    ],
  },

  {
    n: 3,
    titulo: "La escalera de las dos torres",
    escena: {
      id: "escalera", fondo: "dia",
      alt: "Doña Muralla y su hermana, las dos torres blancas, suben por una escalera de piedra en la ladera del volcán, una detrás de la otra. Sandro, el osito panda, aplaude desde abajo.",
      contenido: D.volcan(450, 300, 1.25) +
        `<path d="M300,292 h50 v-30 h50 v-30 h50 v-30 h50" fill="none" stroke="#5d4037" stroke-width="6" stroke-linejoin="round"/>` +
        D.pieza("t", "b", 375, 262, 0.5) + D.pieza("t", "b", 475, 202, 0.5, { espejo: true }) +
        D.panda(170, 292, 0.55) + D.estrella(560, 120, 9),
    },
    cuento: [
      "Siguiendo el mapa, llegaron a una ladera con escalones de piedra. Arriba, muy arriba, se veía la punta de una corona negra.",
      "—¡Es el Rey Carbón! —gritó Tizón.",
      "Pero el rey subió un escalón más y se escondió detrás de una roca.",
      "—Con una torre sola necesitamos la ayuda del rey —dijo Doña Muralla—. Pero si somos dos torres, ¡podemos solas! Mira: yo le cierro una fila, y mi hermana le da jaque en la de arriba. Después, ella le cierra esa fila, y yo subo a darle jaque en la siguiente.",
      "—¡Como una escalera! —dijo Sandro, y se puso a saltar de un escalón a otro—. ¡Un escalón, otro escalón!",
      "Las dos torres subieron así, una y otra, una y otra, y el Rey Carbón tuvo que retroceder hasta la orilla de arriba. Cuando ya no había más escalones… ¡jaque mate!",
      "—Bien jugado —se rio el rey negro—. Pero esa era solo una partida de práctica. ¡A que no me encuentran otra vez!",
      "Y se escabulló por un caminito, más arriba, hacia el cráter del volcán.",
    ],
    aprendi: [
      "Con dos torres se da mate sin ayuda del rey: es la escalera.",
      "Una torre cierra una fila y la otra da jaque en la de al lado. Luego cambian.",
      "El mate llega cuando el rey negro está en la orilla y no le quedan escalones.",
    ],
    muestras: [
      { fen: "6k1/R7/8/8/8/8/8/1R4K1 w - - 0 1", flechas: [["b1", "b8"]], pie: "La torre de a7 cierra la fila 7. La otra sube a la fila 8: Tb8 es jaque mate." },
    ],
    ejercicios: [
      { tipo: "mate", fen: "3k4/1R6/8/R7/8/8/8/6K1 w - - 0 1", respuesta: "Ta8" },
      { tipo: "mate", fen: "k7/8/5R2/8/8/8/1R2K3/8 w - - 0 1", respuesta: "Ta6", explica: "La escalera también va de lado: la torre de b2 cierra la columna b." },
      { tipo: "mate", fen: "8/K6k/8/8/6R1/4R3/8/8 w - - 0 1", respuesta: "Th3" },
      { tipo: "mate2", fen: "1R6/7k/2R5/8/8/8/K7/8 w - - 0 1", respuesta: "Tb7+", explica: "La torre de b8 baja a b7 y da jaque: el rey negro tiene que subir a g8 o a h8. Entonces la otra torre sube: Tc8 es jaque mate." },
    ],
  },

  {
    n: 4,
    titulo: "La caja de la Dama Estrella",
    escena: {
      id: "caja-dama", fondo: "dia",
      alt: "La Dama Estrella, la dama blanca con su corona, dibuja con sus líneas un cuadrado brillante en el suelo. Adentro del cuadrado, el Rey Carbón mira para todos lados. Sandro, el osito panda, sostiene su mapa.",
      contenido: `<rect x="300" y="190" width="150" height="100" rx="6" fill="#fff3bf" stroke="#f59f00" stroke-width="5" stroke-dasharray="14 8"/>` +
        D.pieza("d", "b", 210, 292, 0.85) + D.pieza("r", "n", 375, 285, 0.55, { cara: "sorpresa" }) +
        D.panda(530, 292, 0.5, { espejo: true }) + D.estrella(150, 120, 9) + D.estrella(260, 90, 7),
    },
    cuento: [
      "Cerca del cráter, el camino se abría en una explanada grande, sin escalones ni rocas.",
      "—¡Aquí no hay orilla! —dijo Tizón—. ¿Cómo lo vamos a encerrar?",
      "Entonces brilló una luz: llegó la Dama Estrella.",
      "—Yo me encargo —dijo—. Soy la pieza más poderosa: me muevo como la torre y como el alfil juntos. Yo le hago al rey una caja.",
      "Se paró a la distancia de un salto de caballo del Rey Carbón y, ¡zas!, todas sus líneas formaron un cuadrado alrededor del rey. El rey negro no podía salir de la caja.",
      "—Y cada vez que él se mueve —siguió la dama—, yo hago la caja más chiquita. Más chiquita, más chiquita… hasta que queda contra la orilla.",
      "—¿Y ahí le das mate? —preguntó Sandro.",
      "—Sola no puedo —dijo la Dama Estrella—. Ahí llamo a mi rey, el Rey Sereno, para que se acerque y me ayude. ¡Un rey solo nunca le gana a una dama con su rey!",
    ],
    aprendi: [
      "La dama encierra al rey en una caja, y la hace más chiquita cada vez que el rey se mueve.",
      "Cuando el rey negro llega a la orilla, el rey blanco se acerca a ayudar.",
      "La dama da mate en la orilla, igual que la torre, con los reyes frente a frente.",
    ],
    muestras: [
      { fen: "5k2/8/5K2/8/8/8/8/2Q5 w - - 0 1", flechas: [["c1", "c8"]], pie: "El rey negro ya está en la orilla. La Dama Estrella sube a c8 y su rey le cuida las casillas de adelante: jaque mate." },
    ],
    ejercicios: [
      { tipo: "mate", fen: "1k6/8/1K6/8/8/8/8/4Q3 w - - 0 1", respuesta: "De8" },
      { tipo: "mate", fen: "3k4/8/2K4Q/8/8/8/8/8 w - - 0 1", respuesta: "Df8", explica: "La dama da jaque por la fila 8, y el rey blanco cuida c7, d7 y e7." },
      { tipo: "mate", fen: "8/8/2Q5/8/8/5K2/8/5k2 w - - 0 1", respuesta: "Dc1" },
    ],
  },

  {
    n: 5,
    titulo: "¡Cuidado, no lo ahogues!",
    escena: {
      id: "ahogado3", fondo: "dia", sol: "gatea",
      alt: "Junto a una laguna verde, el Rey Carbón está sentado en una esquina, rodeado, sin poder moverse, con cara de alivio. La Dama Estrella se tapa la boca: se equivocó. Sandro, el osito panda, se rasca la cabeza.",
      contenido: `<ellipse cx="460" cy="285" rx="120" ry="22" fill="#63e6be" stroke="#20c997" stroke-width="3"/>` +
        D.pieza("r", "n", 110, 292, 0.6, { cara: "feliz" }) + D.pieza("d", "b", 270, 292, 0.75, { cara: "sorpresa", espejo: true }) +
        D.panda(400, 292, 0.5, { espejo: true }),
    },
    cuento: [
      "Era un día de sol bonito, y el sol de ese día parecía estar saludando a todo el mundo.",
      "Junto a una laguna verde, en el borde del cráter, por fin acorralaron al Rey Carbón. Estaba en una esquina, y la Dama Estrella estaba muy cerca de él.",
      "—¡Ya casi! —dijo Sandro—. Haz la caja más chiquita, ¡más chiquita!",
      "La Dama Estrella se acercó un paso más… y de pronto, el Rey Carbón se sentó tranquilo en su esquina.",
      "—No estoy en jaque —dijo, sonriendo—. Pero me toca mover y no tengo ninguna casilla adonde ir. ¡Estoy ahogado! La partida termina en tablas: nadie gana.",
      "—¡Ay, no! —dijo la Dama Estrella—. Lo encerré tanto que lo dejé sin jugadas.",
      "Don Lento, desde un árbol, les recordó algo muy importante: «Cuando el rey negro tiene muy poquitas casillas… antes de cada jugada, pregúntense: ¿le dejo alguna casilla? ¿O le doy jaque? Si no tiene jugadas y no está en jaque… es ahogado».",
      "—Entonces la caja no puede quedar tan chiquita que el rey no se pueda mover, a menos que sea con jaque —dijo Peonita—. ¡La próxima vez no se nos escapa!",
    ],
    aprendi: [
      "Ahogado es cuando al rey le toca mover, no está en jaque y no tiene ninguna jugada.",
      "El ahogado es tablas: nadie gana, ¡aunque tengas mucha ventaja!",
      "Antes de encerrar al rey, revisa: ¿le dejo una casilla o le doy jaque?",
    ],
    muestras: [
      { fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", pie: "Le toca al rey negro. No está en jaque, pero g8, g7 y h7 están atacadas: no tiene ninguna jugada. ¡Ahogado!" },
    ],
    ejercicios: [
      { tipo: "final", fen: "k7/2Q5/1K6/8/8/8/8/8 b - - 0 1", respuesta: "ahogado", explica: "El rey negro no está en jaque, pero a7, b7 y b8 están atacadas." },
      { tipo: "final", fen: "k7/1Q6/1K6/8/8/8/8/8 b - - 0 1", respuesta: "mate", explica: "La dama da jaque desde b7, y el rey blanco la cuida." },
      { tipo: "elige", fen: "7k/5K2/8/8/8/8/8/6Q1 w - - 0 1", opciones: { Dg6: "ahogado", Dg7: "mate" }, respuesta: "Dg7", explica: "Dg6 deja al rey negro sin jugadas pero sin jaque: sería ahogado." },
      { tipo: "elige", fen: "k7/8/1K6/8/8/8/8/2Q5 w - - 0 1", opciones: { Dc7: "ahogado", Dc8: "mate" }, respuesta: "Dc8", explica: "Dc7 no da jaque y el rey negro se queda sin jugadas: sería ahogado." },
    ],
  },

  {
    n: 6,
    titulo: "El beso de la dama",
    escena: {
      id: "beso", fondo: "noche",
      alt: "De noche, la Dama Estrella se acerca pegadita al Rey Carbón y le da un besito en la mejilla. Detrás de ella, el Rey Sereno, el rey blanco, la cuida. Un corazón flota en el aire. A un lado, Sandro, el osito panda, duerme abrazado a su mapa.",
      contenido: D.pieza("r", "n", 380, 292, 0.75, { cara: "sorpresa", espejo: true }) + D.pieza("d", "b", 290, 292, 0.75) +
        D.pieza("r", "b", 175, 292, 0.75) + D.panda(520, 300, 0.38, { cara: "dormida", espejo: true }) + `<text x="548" y="226" font-family="Quicksand, sans-serif" font-weight="700" font-size="16" fill="#fff3bf">z<tspan font-size="12" dy="-8">z</tspan></text>` + D.corazon(335, 150, 1) + D.estrella(80, 70, 8) + D.estrella(430, 50, 7) + CONSTELACION_K,
    },
    cuento: [
      "Esa noche acamparon cerca del cráter. Sandro se quedó dormido abrazado a su mapa, y la Dama Estrella se sentó a pensar.",
      "—Hoy lo dejé ahogado —suspiró—. Tengo que aprender un mate que no falle.",
      "El Rey Sereno, el rey blanco, se sentó a su lado.",
      "—Yo te enseño uno —dijo—. Se llama el beso de la dama. Tú te pones pegadita al rey negro, en la casilla de al lado, y le das jaque. Como estás tan cerca, él te quisiera comer… pero no puede, porque yo te estoy cuidando.",
      "—¿Y no se puede escapar? —preguntó la dama.",
      "—Desde tan cerquita, tú le atacas casi todas las casillas, y yo le tapo las que faltan. ¡Es jaque mate!",
      "La Dama Estrella practicó toda la noche en el mapa de Sandro. Pegadita al rey, con su rey detrás cuidándola. Beso… ¡y mate!",
    ],
    aprendi: [
      "El beso de la dama: la dama da jaque pegadita al rey negro.",
      "La dama tiene que estar cuidada por su rey, para que no se la coman.",
      "Si la dama está sola, el rey negro se la come: ¡revisa siempre quién la cuida!",
    ],
    muestras: [
      { fen: "k7/1Q6/1K6/8/8/8/8/8 b - - 0 1", flechas: [["b6", "b7"]], pie: "El beso de la dama: la dama de b7 da jaque pegadita al rey negro, y el rey blanco la cuida. Jaque mate." },
    ],
    ejercicios: [
      { tipo: "mate", fen: "k7/7Q/2K5/8/8/8/8/8 w - - 0 1", respuesta: "Db7", solucion: "Al lado del rey negro: Db7 es jaque mate. La dama le da un beso y el rey de c6 la cuida." },
      { tipo: "mate", fen: "7k/8/7K/8/8/8/8/6Q1 w - - 0 1", respuesta: "Dg7", solucion: "La dama se pega al rey en g7: Dg7 es jaque mate, porque el rey de h6 la cuida." },
      { tipo: "mate", fen: "4k3/8/5K2/8/1Q6/8/8/8 w - - 0 1", respuesta: "De7", solucion: "En e7 está el beso: De7 es jaque mate, con el rey de f6 cuidando a la dama." },
    ],
  },

  {
    n: 7,
    titulo: "Doña Muralla y su rey",
    escena: {
      id: "muralla-rey", fondo: "dia",
      alt: "Doña Muralla, la torre blanca, y el Rey Sereno caminan juntos de la mano por el borde del cráter. Sandro, el osito panda, va adelante mirando su mapa.",
      contenido: D.volcan(470, 300, 1.2) + D.pieza("t", "b", 200, 292, 0.75) + D.pieza("r", "b", 300, 292, 0.75, { espejo: true }) +
        D.panda(90, 292, 0.5) + D.corazon(250, 170, 0.6) + D.piedra(385, 300, 0.9, { grabado: "K+O" }),
    },
    cuento: [
      "A la mañana siguiente, Doña Muralla estaba un poco triste.",
      "—La Dama Estrella puede hacer cajas y besos —dijo—. Y yo, si mi hermana no está, ¿no puedo dar mate?",
      "—¡Claro que puedes! —dijo el Rey Sereno—. Solo necesitas que yo te acompañe. Tú cierras el camino y yo me acerco.",
      "Así que la torre y el rey caminaron juntos. Doña Muralla le cerraba al Rey Carbón una fila, para que no pudiera salir, y el Rey Sereno se iba acercando, paso a pasito.",
      "—Ahora el secreto —dijo el Rey Sereno—: cuando llego frente al rey negro, a veces el mate no está listo todavía. Entonces me pongo frente a él, y él tiene que moverse a una casilla donde la torre le da el mate.",
      "—¡Es como un baile! —dijo Sandro—. Uno da un paso, el otro da un paso…",
      "—Exacto —dijo Don Lento—. Y no hay que apurarse. Una jugada tranquila del rey a veces vale más que un jaque.",
    ],
    aprendi: [
      "La torre sola no da mate: necesita la ayuda de su rey.",
      "La torre cierra el camino y el rey se acerca, paso a pasito.",
      "A veces la mejor jugada no es un jaque, sino acercar al rey.",
    ],
    muestras: [
      { fen: "1k6/8/1K6/8/8/8/8/7R w - - 0 1", flechas: [["h1", "h8"]], pie: "La torre con su rey: los reyes frente a frente, y la torre va a la orilla. Th8 es jaque mate." },
    ],
    ejercicios: [
      { tipo: "mate", fen: "k1K5/8/8/8/1R6/8/8/8 w - - 0 1", respuesta: "Ta4", explica: "La torre de b4 ya le cerraba la columna b; ahora da jaque por la columna a, y el rey blanco cuida b7 y b8." },
      { tipo: "mate", fen: "8/8/8/8/8/2K4R/8/2k5 w - - 0 1", respuesta: "Th1" },
      { tipo: "mate2", fen: "7k/8/8/6K1/8/8/8/R7 w - - 0 1", respuesta: "Rg6", explica: "El rey se pone frente al rey negro. El negro solo puede ir a g8, y entonces la torre sube: Ta8 es jaque mate." },
      { tipo: "mate2", fen: "k7/8/2K5/8/8/8/8/1R6 w - - 0 1", respuesta: "Rc7", explica: "El rey blanco le quita b7 y b8. El negro solo puede ir a a7, y entonces Ta1 es jaque mate." },
    ],
  },

  {
    n: 8,
    titulo: "Mates en dos",
    escena: {
      id: "mates-dos", fondo: "dia",
      alt: "Peonita y Tizón miran el mapa de Sandro con mucha atención. Encima de sus cabezas flotan dos globitos con los números 1 y 2. Sandro, el osito panda, señala con el dedo un camino en el mapa.",
      contenido: D.pieza("p", "b", 210, 292, 0.9, { mono: true, cara: "pensando" }) + D.pieza("p", "n", 330, 292, 0.9, { bufanda: true, cara: "pensando", espejo: true }) +
        D.panda(460, 292, 0.55, { espejo: true }) +
        `<g font-family="Quicksand, sans-serif" font-weight="700" font-size="34" text-anchor="middle"><circle cx="210" cy="90" r="28" fill="#fff" stroke="#123e7c" stroke-width="3"/><text x="210" y="102" fill="#123e7c">1</text>` +
        `<circle cx="330" cy="90" r="28" fill="#fff" stroke="#123e7c" stroke-width="3"/><text x="330" y="102" fill="#123e7c">2</text></g>`,
    },
    cuento: [
      "Ya muy cerca de la cima, el mapa de Sandro mostraba dos caminos.",
      "—Si vamos por aquí —dijo Sandro, señalando—, el rey se escapa por allá. Pero si primero vamos por aquí, y después por allá… ¡lo atrapamos!",
      "—Eso es pensar dos jugadas adelante —dijo Don Lento, orgulloso—. A veces no hay mate en una jugada, pero sí en dos.",
      "—¿Cómo se encuentra? —preguntó Tizón.",
      "—Primero buscas una jugada que le deje al rey negro muy poquitas salidas: un jaque, o una jugada tranquila que le quite casillas. Después miras todo lo que puede contestar el negro… y para cada respuesta, buscas el mate.",
      "Peonita se quedó mirando el tablero un buen rato, con la boca apretada, y de repente gritó: —¡Ya lo vi! Primero esta, después esta… ¡y mate!",
      "Y así, paso a paso, llegaron a la cima del volcán.",
    ],
    aprendi: [
      "Un mate en dos: una primera jugada, la respuesta del negro, y el mate.",
      "La primera jugada le quita casillas al rey negro: puede ser un jaque o una jugada tranquila.",
      "Revisa TODAS las respuestas del negro: el mate tiene que estar listo para cada una.",
    ],
    muestras: [
      { fen: "8/8/6Q1/8/8/2K5/8/4k3 w - - 0 1", flechas: [["g6", "g2"]], pie: "Primero, Dg2: no es jaque, pero al rey negro solo le queda d1. Después, la dama da mate en f1 o en d2." },
    ],
    ejercicios: [
      { tipo: "mate2", fen: "k7/8/3K4/4Q3/8/8/8/8 w - - 0 1", respuesta: "Rc7", explica: "El rey se acerca y le quita b8 y b7. El negro solo puede ir a a7, y la dama da mate en a5 o en a1." },
      { tipo: "mate2", fen: "1k6/6K1/8/7R/8/8/8/2R5 w - - 0 1", respuesta: "Tb5+", explica: "Jaque: el rey negro va a a7 o a a8, y la otra torre baja a la orilla: Ta1 es jaque mate." },
      { tipo: "mate2", fen: "5Q2/8/8/8/2K5/8/8/k7 w - - 0 1", respuesta: "Rb3", explica: "El rey se acerca y le quita a2 y b2. El negro solo puede ir a b1, y Df1 es jaque mate." },
    ],
  },

  {
    n: 9,
    titulo: "El regreso del rey",
    escena: {
      id: "regreso", fondo: "dia",
      alt: "En la cima del volcán, el Rey Carbón se ríe y le da la mano a Peonita. Tizón y Sandro, el osito panda, celebran con confeti de colores.",
      contenido: D.confeti(31, 40, 600, 320) + D.pieza("r", "n", 380, 292, 0.75, { espejo: true }) + D.pieza("p", "b", 270, 292, 0.85, { mono: true }) +
        D.pieza("p", "n", 160, 292, 0.85, { bufanda: true }) + D.panda(500, 292, 0.5, { espejo: true }) + D.corazon(325, 150, 0.8),
    },
    cuento: [
      "En la cima del volcán, sentado en una piedra, estaba el Rey Carbón mirando el paisaje.",
      "—¡Te encontramos! —gritaron todos.",
      "—Me encontraron —dijo el rey negro—, pero todavía no me atrapan. Juguemos una partida de verdad: si me dan jaque mate, vuelvo con ustedes.",
      "Peonita jugó con cuidado. Primero llevó al rey negro a la orilla. Después encerró con la escalera y con la caja. Revisó que no quedara ahogado. Y al final, con su rey frente al Rey Carbón… ¡jaque mate!",
      "El Rey Carbón se quedó callado un momento… y se echó a reír.",
      "—¡Qué divertido! —dijo—. Ahora entiendo: el jaque mate no es para hacerme sentir mal. Es el final de una aventura. Y en la siguiente partida, ¡yo trato de escaparme mejor!",
      "Esa tarde, todos volvieron juntos a la caja de ajedrez. Sandro les regaló una esquinita de su mapa, para que no se olvidaran del volcán.",
      "—¿Te vas a ir? —le preguntó Peonita.",
      "—Un viajero siempre vuelve —dijo Sandro, guiñando un ojo—. ¡Nos vemos en la próxima aventura!",
    ],
    aprendi: [
      "Los mates de este libro: la torre en la orilla, la escalera, la caja y el beso de la dama, y la torre con su rey.",
      "Primero lleva al rey a la orilla, después encierra… ¡y cuidado con el ahogado!",
      "Si no hay mate en una, busca un mate en dos.",
    ],
    muestras: [],
    ejercicios: [
      { tipo: "mate", fen: "6k1/5ppp/8/8/8/8/5PPP/1Q4K1 w - - 0 1", respuesta: "Db8", explica: "Los peones del rey negro le tapan la salida." },
      { tipo: "mate", fen: "k7/2R5/8/8/3K3R/8/8/8 w - - 0 1", respuesta: "Th8" },
      { tipo: "final", fen: "k7/2Q5/2K5/8/8/8/8/8 b - - 0 1", respuesta: "ahogado", explica: "El rey negro no está en jaque, pero no tiene ninguna casilla libre." },
      { tipo: "mate2", fen: "8/8/3K4/8/k7/7Q/8/8 w - - 0 1", respuesta: "Rc5", explica: "El rey se acerca y le quita b4, b5 y b6. El negro solo puede ir a a5, y Da3 es jaque mate." },
    ],
  },
];

const FINAL_TITULO = "¡Ya sabes atrapar al rey!";
const ESCENA_FINAL = {
  id: "final3", fondo: "noche",
  alt: "Bajo la luna, con el volcán a lo lejos, todos celebran: Peonita, Tizón, el Rey Carbón, la Dama Estrella, Doña Muralla y Sandro, el osito panda, con su mapa. Don Lento sonríe desde su rama.",
  contenido: D.confeti(13, 50, 600, 320) + D.volcan(540, 255, 0.55) + D.perezoso(80, 40, 0.5) +
    [["r", "n"], ["d", "b"], ["t", "b"]].map(([t, col], i) => D.pieza(t, col, 120 + i * 75, 228, 0.5)).join("") +
    D.pieza("p", "b", 260, 300, 0.8, { mono: true }) + D.pieza("p", "n", 360, 300, 0.8, { bufanda: true, espejo: true }) +
    D.panda(150, 300, 0.45) + D.corazon(310, 205, 1),
};
const ESCENA_DIPLOMA = {
  id: "diploma3", fondo: "dia",
  alt: "Peonita y Sandro, el osito panda, felicitan a quien recibe el diploma. Entre los dos hay una corona dorada.",
  contenido: D.panda(470, 290, 0.55, { espejo: true }) + D.pieza("p", "b", 150, 290, 1, { mono: true }) +
    D.corona(310, 200, 1.6) + D.estrella(250, 80, 12) + D.estrella(380, 60, 9),
};
const DIPLOMA = {
  numero: 3,
  nombre: "Cazador de reyes",
  medalla: "corona",
  sub: "Peonita, Tizón y Sandro reconocen a",
  firma: "Peonita, Tizón y Sandro",
  firmaMano: "Peonita ♥ Tizón ♥ Sandro",
  texto: ["porque aprendió a encerrar al rey y a darle jaque mate,", "y a cuidarse siempre del ahogado."],
};

const FINAL = [
  "¡Lo lograste! Ahora sabes dar los primeros jaques mate: la torre en la orilla, la escalera de las dos torres, la caja y el beso de la dama, y la torre con la ayuda de su rey. Y sabes lo más importante: cuidarte del ahogado.",
  "La próxima vez que juegues y te quede un rey solo del otro lado, acuérdate del Rey Carbón: llévalo a la orilla, enciérralo con calma… ¡y dale jaque mate! Y si ves un osito panda con una mochila naranja, salúdalo: quizás sea Sandro, que vuelve para otra aventura.",
];

module.exports = {
  SLUG, CLAVE, AUTOR, TITULO, TITULO_PDF, SUBTITULO, ASUNTO, TAPA, FINAL_TITULO, ESCENA_FINAL, ESCENA_DIPLOMA, DIPLOMA,
  VALOR, NOMBRE, PRESENTACION, NOTA_ADULTOS, SECRETO, SECRETOS, DEDICATORIA, CAPITULOS, PROMESAS: [], CONSEJOS_PARTIDA: [], FINAL,
};
