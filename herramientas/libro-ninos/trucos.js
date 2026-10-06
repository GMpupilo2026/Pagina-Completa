/* El segundo cuento de Peonita: «Peonita, Tizón y los trucos del bosque», de
 * Oscar Angulo Cubero. Los primeros trucos de la táctica (la pieza sin cuidar,
 * la horquilla, el ataque doble, la clavada, la enfilada, el mate del pasillo,
 * el ataque a la descubierta y mirar qué quiere el otro), contados con la
 * historia de Don Pillo, un mapache que se lleva las piezas que nadie cuida.
 *
 * Mismo formato que peonita.js (ver la lista de tipos de ejercicio ahí), más
 * dos tipos de táctica que el verificador comprueba con el buscador de
 * herramientas/lib/tactica.js:
 *   gana     juegan las blancas: la jugada de la respuesta es la ÚNICA que gana
 *            al menos `minimo` puntos de material (o da mate)
 *   amenaza  le toca a Peonita, pero se pregunta qué quiere hacer Tizón: si
 *            jugaran las negras, la respuesta sería su ÚNICA jugada que gana
 *            al menos `minimo`
 *   defensa  cada una de las `jugadas` que propone la solución deja a las
 *            negras sin ninguna jugada que gane `minimo` o más
 * Y los diagramas pueden llevar `flechas`: [[desde, hasta], …].
 *
 * El secreto para Alessandro (ver «Cada cuento lleva un secreto para
 * Alessandro» en docs/decisiones/cursos-y-material.md): las iniciales de los
 * diez títulos, de arriba hacia abajo en el índice, dicen ALESSANDRO.
 */
"use strict";
const D = require("./dibujos.js");
const { VALOR, NOMBRE, AUTOR } = require("./peonita.js");

const SLUG = "peonita-trucos";
const CLAVE = "peonita-trucos-oac-2026";
const TITULO = "Peonita, Tizón y los trucos del bosque";
const TITULO_PDF = "Peonita, Tizon y los trucos del bosque";
const SUBTITULO = "Un cuento para aprender los primeros trucos del ajedrez";
const ASUNTO = "Cuento para que ninas y ninos aprendan los primeros trucos tacticos del ajedrez";
const SECRETO = "ALESSANDRO";
const SECRETOS = [{ tipo: "acrostico-titulos" }];

const TAPA = {
  arriba: "Peonita, Tizón", medio: "y los trucos del", abajo: "bosque",
  dibujo: D.guarumo(520, 560, 0.95) + D.perezoso(300, 380, 0.6) +
    D.mapache(520, 735, 0.8, { espejo: true }) +
    D.pieza("p", "n", 380, 790, 1.15, { bufanda: true, espejo: true }) +
    D.pieza("p", "b", 200, 815, 1.55, { mono: true }) + D.lupa(300, 700, 1.3, -25) +
    D.estrella(60, 470, 10) + D.estrella(560, 470, 8) + D.estrella(420, 420, 7),
};

const PRESENTACION = {
  titulo: "¡Hola otra vez!",
  escena: {
    id: "hola2", fondo: "dia",
    alt: "Peonita, con su moño rosado, y Tizón, con su bufanda verde, saludan en el bosque. Peonita sostiene una lupa grande para buscar trucos.",
    contenido: D.guarumo(90, 250, 0.9) + D.guarumo(530, 250, 0.8) +
      D.pieza("p", "b", 240, 292, 1.15, { mono: true }) + D.pieza("p", "n", 380, 292, 1.15, { bufanda: true, espejo: true }) +
      D.lupa(165, 200, 1.1, -35) + D.globo(250, 30, 210, ["¡Hola otra vez!"], [300, 120]),
  },
  parrafos: [
    "¡Hola otra vez! Soy Peonita, y este es mi mejor amigo, Tizón. Si leíste nuestro primer libro, ya sabes cómo se mueve cada pieza, qué es el jaque, el jaque mate y el ahogado.",
    "Pero el ajedrez tiene mucho más: tiene trucos. Jugadas sorpresa que te hacen ganar una pieza, o hasta la partida entera, cuando el otro no se da cuenta.",
    "En este libro te vamos a contar la aventura que vivimos en el bosque, cuando un mapache muy travieso empezó a llevarse nuestras piezas. Para detenerlo tuvimos que aprender todos los trucos… y ahora te los enseñamos a ti.",
    "Ten a mano tu lupa de detective (o un tablero de verdad). ¿Lista? ¿Listo? ¡Vamos al bosque!",
  ],
};

const NOTA_ADULTOS = [
  "Este segundo libro es para quienes ya saben mover las piezas y conocen el jaque y el jaque mate (lo que enseña «Peonita y el reino de las 64 casillas»). Sigue pensado para leer acompañado, un capítulo por vez, con un tablero de verdad sobre la mesa.",
  "Cada capítulo presenta un truco: la pieza sin cuidar, la horquilla del caballo, el ataque doble de la dama, la horquilla del peón, la clavada, la enfilada, el mate del pasillo y el ataque a la descubierta. El capítulo 9 enseña lo más importante de todo: antes de mover, mirar qué quiere hacer el otro. El 10 repasa todo.",
  "En «¡A jugar!», cada respuesta es la única jugada que hace el truco. Conviene armar la posición en el tablero y dejar que la niña o el niño pruebe con las piezas: el truco se entiende mucho mejor cuando se ve qué pasa después.",
  "Si se equivoca, no le digan la respuesta enseguida: pregúntenle qué piezas ataca su jugada. Encontrar el truco solo, aunque tarde, enseña más que leerlo.",
];

const DEDICATORIA = [
  "Para quien ya sabe mover las piezas",
  "y ahora quiere descubrir sus trucos.",
  "Mira despacio, piensa con calma",
  "y que el bosque te guarde sus secretos.",
];

/* ---------------------------------------------------------- capítulos */
const CAPITULOS = [
  {
    n: 1,
    titulo: "Atención: piezas sin cuidar",
    escena: {
      id: "pillo", fondo: "noche",
      alt: "De noche, en el bosque, un mapache con antifaz se lleva una torre blanca bajo el brazo. Peonita lo ve desde atrás de un árbol, con cara de sorpresa.",
      contenido: D.guarumo(90, 250, 0.85) + D.mapache(380, 292, 0.95) + D.pieza("t", "b", 450, 245, 0.45, { cara: "sorpresa" }) +
        D.pieza("p", "b", 175, 292, 0.8, { mono: true, cara: "sorpresa" }) + D.estrella(250, 60, 8) + D.estrella(330, 40, 6),
    },
    cuento: [
      "Un viernes, la maestra llevó a toda la clase de excursión al bosque, y la caja de ajedrez fue con ellos. En la noche, mientras los niños dormían en las tiendas de campaña, la caja se abrió y las piezas salieron a jugar sobre una piedra plana.",
      "Pero a la mañana siguiente, ¡faltaba una torre!",
      "—¿Dónde está Doña Muralla? —preguntó Tizón, preocupado.",
      "La noche siguiente, Peonita se quedó despierta, escondida detrás de un árbol. Entonces lo vio: un mapache con antifaz negro se acercó de puntillas y se llevó un caballo que había quedado solito en una esquina.",
      "—¡Es Don Pillo! —susurró Don Lento desde su rama—. El mapache más travieso del bosque. Se lleva las piezas que nadie cuida.",
      "—¿Y cómo sabe cuáles nadie cuida?",
      "—Se fija en las que están sin cuidar: piezas que nadie defiende. En el ajedrez pasa igual. Si dejas una pieza donde el otro la puede comer y ninguna pieza tuya la defiende… te la come gratis.",
      "Desde esa noche, antes de dejar una pieza en su casilla, Peonita se preguntaba: «¿Quién la cuida?». Y cuando veía una pieza de Tizón sin cuidar… ¡se la comía!",
    ],
    aprendi: [
      "Una pieza sin cuidar es una pieza que ninguna otra defiende.",
      "Si el otro deja una pieza sin cuidar y la puedes comer, ¡cómetela!",
      "Antes de dejar una pieza tuya, pregúntate: ¿quién la cuida?",
    ],
    muestras: [
      { fen: "6k1/5pp1/7p/8/2b5/8/5PPP/2R3K1 w - - 0 1", flechas: [["c1", "c4"]], pie: "El alfil negro de c4 está sin cuidar: nadie lo defiende, y la torre se lo puede comer." },
    ],
    ejercicios: [
      { tipo: "gana", fen: "6k1/5pp1/7p/3n4/8/8/5PPP/3R2K1 w - - 0 1", minimo: 3, respuesta: "Txd5", pregunta: "Juegan las blancas. ¿Qué pieza negra está sin cuidar? ¿Con qué jugada te la comes?", explica: " El caballo negro estaba sin cuidar: la torre se lo come gratis." },
      { tipo: "gana", fen: "6k1/5ppp/5n2/8/1b6/8/3Q1PPP/6K1 w - - 0 1", minimo: 3, respuesta: "Dxb4", pregunta: "Juegan las blancas. El alfil negro ataca a tu dama. ¿Qué haces?", explica: " ¡El alfil está sin cuidar! La dama no tiene que escaparse: se lo come." },
      { tipo: "amenaza", fen: "4r1k1/5ppp/8/8/8/8/4BPPP/6K1 w - - 0 1", minimo: 3, respuesta: "Txe2", pregunta: "Le toca a Peonita. ¿Qué pieza blanca está sin cuidar? ¿Qué jugada quiere hacer Tizón?", explica: " El alfil blanco de e2 está sin cuidar y la torre negra lo ataca. Peonita tiene que moverlo o defenderlo." },
    ],
  },

  {
    n: 2,
    titulo: "La horquilla de Galope",
    escena: {
      id: "horquilla", fondo: "dia",
      alt: "Galope, el caballo blanco, salta hacia el centro. De él salen dos flechas: una hacia el rey negro y otra hacia la torre negra.",
      contenido: D.pieza("c", "b", 300, 280, 1) + D.pieza("r", "n", 110, 292, 0.7, { cara: "sorpresa" }) + D.pieza("t", "n", 495, 292, 0.7, { cara: "sorpresa", espejo: true }) +
        D.flecha(240, 190, 150, 175, "#123e7c") + D.flecha(360, 190, 450, 175, "#123e7c") +
        D.globo(200, 24, 200, "¡Tacatán, tacatán!", [290, 118]),
    },
    cuento: [
      "Al día siguiente, Galope reunió a todos junto al río.",
      "—Si queremos ganarle a Don Pillo, tenemos que aprender sus trucos —relinchó—. Y el primero es mío: la horquilla.",
      "—¿Una horquilla? ¿Como la de comer? —preguntó Peonita.",
      "—¡Exacto! Un tenedor tiene varias puntas y pincha dos pedazos de comida a la vez. Yo hago lo mismo: con un solo salto ataco dos piezas al mismo tiempo.",
      "Galope saltó al centro del tablero, justo a una casilla desde donde atacaba al rey negro y a la torre negra.",
      "—¡Jaque! —dijo—. El rey tiene que escaparse… y la torre se queda sola. ¡Tacatán, me la como!",
      "—Por eso hay que tener cuidado con los caballos —dijo Don Lento—. Como saltan en L, sus ataques se ven poco. Antes de cada jugada… busquen adónde puede saltar el caballo del otro.",
      "Esa noche, Don Pillo intentó llevarse otra pieza, pero Galope lo estaba esperando con una horquilla preparada. El mapache salió corriendo con las manos vacías.",
    ],
    aprendi: [
      "Una horquilla es un ataque a dos piezas al mismo tiempo.",
      "El caballo es el rey de las horquillas: con un salto ataca a dos.",
      "Si una de las piezas atacadas es el rey, el otro tiene que salvarlo y pierde la otra.",
    ],
    muestras: [
      { fen: "r3k3/2N5/8/8/8/8/8/4K3 b - - 1 1", desde: { fen: "r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1", jugada: "Nc7+" }, flechas: [["c7", "e8"], ["c7", "a8"]], pie: "Galope saltó a c7: da jaque al rey y ataca a la torre. ¡Una horquilla!" },
    ],
    ejercicios: [
      { tipo: "gana", fen: "2q3k1/5ppp/8/5N2/8/8/5PPP/6K1 w - - 0 1", minimo: 9, respuesta: "Ce7+", pregunta: "Juegan las blancas. ¿Adónde salta Galope para atacar a dos piezas?", explica: " Desde e7, Galope da jaque al rey y ataca a la dama. El rey se escapa y Galope se come a la dama." },
      { tipo: "gana", fen: "8/5k2/8/1r6/4N3/8/8/4K3 w - - 0 1", minimo: 5, respuesta: "Cd6+", pregunta: "Juegan las blancas. Busca la horquilla.", explica: " Desde d6, Galope ataca al rey de f7 y a la torre de b5." },
    ],
  },

  {
    n: 3,
    titulo: "El ataque doble de la Dama Estrella",
    escena: {
      id: "dobledama", fondo: "noche",
      alt: "La Dama Estrella brilla en el centro, con dos flechas que salen de ella: una hacia el rey negro y otra hacia un alfil negro.",
      contenido: D.pieza("d", "b", 300, 280, 1.05) + D.pieza("r", "n", 110, 292, 0.7, { cara: "sorpresa" }) + D.pieza("a", "n", 495, 292, 0.7, { cara: "sorpresa", espejo: true }) +
        D.flecha(240, 180, 150, 170, "#f59f00") + D.flecha(360, 180, 450, 170, "#f59f00") +
        D.estrella(150, 60, 10) + D.estrella(460, 60, 8),
    },
    cuento: [
      "—Galope no es el único que sabe atacar a dos piezas a la vez —dijo la Dama Estrella, con su corona brillando bajo la luna.",
      "—¡Claro! —dijo Tizón—. Tú caminas para todos lados.",
      "—Por eso soy la mejor para los ataques dobles. Miren: si me pongo donde le doy jaque al rey y, por otro camino, ataco a una pieza sin cuidar… el rey tiene que salvarse primero, y la pieza se queda sola.",
      "La dama se movió y, con un solo paso, dio jaque al rey negro por una diagonal y atacó a un alfil por la fila.",
      "—¡Es como una horquilla, pero de dama! —gritó Peonita.",
      "—Así es —sonrió la Dama Estrella—. Y el jaque es lo mejor: obliga al otro a contestar. Cuando busquen un ataque doble, empiecen por los jaques.",
      "Don Lento asintió desde su rama: —Los jaques… son jugadas que obligan. Revísenlos siempre primero.",
    ],
    aprendi: [
      "La dama ataca en ocho direcciones: es ideal para los ataques dobles.",
      "El ataque doble más fuerte es el que da jaque y además ataca a otra pieza.",
      "Para buscar trucos, empieza por revisar los jaques.",
    ],
    muestras: [
      { fen: "r3k3/8/8/8/Q7/8/8/4K3 b - - 1 1", desde: { fen: "r3k3/8/8/8/8/8/8/3QK3 w - - 0 1", jugada: "Qa4+" }, flechas: [["a4", "e8"], ["a4", "a8"]], pie: "La dama da jaque desde a4 y, por la columna, ataca a la torre de a8." },
    ],
    ejercicios: [
      { tipo: "gana", fen: "4k3/5ppp/8/8/7b/8/5PPP/3Q2K1 w - - 0 1", minimo: 3, respuesta: "Da4+", pregunta: "Juegan las blancas. Busca un jaque de la dama que ataque también a otra pieza.", explica: " La dama da jaque desde a4 y, por la misma fila, ataca al alfil de h4. El rey se salva y la dama se come al alfil." },
      { tipo: "gana", fen: "1r5k/7p/6p1/8/8/8/6PP/4Q1K1 w - - 0 1", minimo: 5, respuesta: "De5+", pregunta: "Juegan las blancas. ¿Qué jaque de la dama gana la torre?", explica: " Desde e5, la dama da jaque al rey por la diagonal y ataca a la torre de b8 por la otra diagonal." },
    ],
  },

  {
    n: 4,
    titulo: "Sorpresa: el peón también ataca doble",
    escena: {
      id: "horquillapeon", fondo: "dia",
      alt: "Peonita, en el centro, da un paso adelante. De ella salen dos flechas cortas hacia dos caballos negros, uno a cada lado, que la miran asombrados.",
      contenido: D.pieza("p", "b", 300, 282, 1, { mono: true }) + D.pieza("c", "n", 140, 270, 0.7, { cara: "sorpresa" }) + D.pieza("c", "n", 460, 270, 0.7, { cara: "sorpresa", espejo: true }) +
        D.flecha(255, 200, 190, 170, "#123e7c") + D.flecha(345, 200, 410, 170, "#123e7c") +
        D.globo(360, 24, 200, ["¡Yo también", "puedo!"], [330, 130]),
    },
    cuento: [
      "Peonita estaba un poco triste.",
      "—Galope hace horquillas, la Dama Estrella hace ataques dobles… y yo soy solo un peón —suspiró.",
      "Don Lento bajó un poquito de su rama.",
      "—Peonita… ¿cómo come un peón?",
      "—En diagonal, hacia adelante: una casilla a la izquierda o una a la derecha.",
      "—Entonces… un peón ataca dos casillas a la vez. Si tú avanzas y quedas justo en medio de dos piezas del otro…",
      "Peonita abrió los ojos muy grandes. Avanzó una casilla y quedó entre los dos caballos de Tizón: ¡los atacaba a los dos! Tizón solo pudo salvar a uno.",
      "—¡Una horquilla de peón! —celebró Tizón, aunque había perdido el caballo—. Y lo mejor es que un peón vale poco: aunque te coman después, ya ganaste.",
      "Desde ese día, Peonita no volvió a sentirse pequeña. En el ajedrez, hasta el peón más chiquito puede hacer el truco más grande.",
    ],
    aprendi: [
      "El peón ataca las dos casillas de adelante en diagonal.",
      "Si avanza y queda entre dos piezas, ¡las ataca a las dos!",
      "Vale poco, así que aunque se lo coman, la horquilla de peón casi siempre gana.",
    ],
    muestras: [
      { fen: "6k1/5ppp/2n1n3/3P4/8/8/6PP/6K1 b - - 0 1", desde: { fen: "6k1/5ppp/2n1n3/8/3P4/8/6PP/6K1 w - - 0 1", jugada: "d5" }, flechas: [["d5", "c6"], ["d5", "e6"]], pie: "El peón avanzó a d5 y ataca a los dos caballos. Uno se va a escapar… y el otro, se lo come." },
    ],
    ejercicios: [
      { tipo: "gana", fen: "6k1/5ppp/8/2b1n3/8/2PP4/5PPP/6K1 w - - 0 1", minimo: 2, respuesta: "d4", pregunta: "Juegan las blancas. ¿Qué peón hace la horquilla?", explica: " El peón avanza a d4 y ataca al alfil y al caballo. Si el alfil se lo come, el peón de c3 se come al alfil, y el caballo sigue atacado." },
      { tipo: "gana", fen: "6k1/5ppp/8/3n1n2/8/8/4PPPP/6K1 w - - 0 1", minimo: 2, respuesta: "e4", pregunta: "Juegan las blancas. ¿Qué peón ataca a los dos caballos? Pista: acuérdate de su primera salida.", explica: " En su primera salida, el peón avanza dos casillas, hasta e4, y ataca a los dos caballos." },
    ],
  },

  {
    n: 5,
    titulo: "Sujeta y no la sueltes: la clavada",
    escena: {
      id: "clavada", fondo: "dia",
      alt: "Don Saleras, el alfil blanco, apunta con una flecha larga e inclinada que atraviesa a un caballo negro y llega hasta el rey negro, que está detrás.",
      contenido: D.pieza("a", "b", 110, 292, 0.95) + D.pieza("c", "n", 320, 232, 0.6, { cara: "pensando" }) + D.pieza("r", "n", 500, 182, 0.6, { cara: "sorpresa", espejo: true }) +
        D.flecha(170, 230, 470, 90, "#9c36b5"),
    },
    cuento: [
      "La cuarta noche apareció un viejo amigo: Don Saleras, el alfil, con su gorro de punta.",
      "—Les voy a enseñar mi truco favorito —dijo—. Se llama la clavada.",
      "Don Saleras se puso en una diagonal donde había un caballo negro, y detrás del caballo, en la misma línea, el rey negro.",
      "—Ahora el caballo no se puede mover —explicó—. Si se quita, el rey queda en jaque, y eso no está permitido. Es como si el caballo estuviera pegado al tablero con goma.",
      "—¡Pobrecito! —dijo Tizón.",
      "—Y lo mejor viene ahora: como no se puede mover, lo podemos atacar con otra pieza… y no se va a poder escapar.",
      "Peonita avanzó y atacó al caballo clavado. El caballo quiso huir, pero no podía.",
      "—Una pieza clavada no se puede mover —repitió Don Saleras—. Así que hay que atacarla otra vez, y más fuerte.",
    ],
    aprendi: [
      "En una clavada, una pieza no se puede mover porque detrás está su rey.",
      "Las clavadas las hacen el alfil, la torre y la dama: las piezas que caminan en línea.",
      "A una pieza clavada, ¡atácala otra vez!: no se puede escapar.",
    ],
    muestras: [
      { fen: "r3k3/8/2n5/1B6/8/8/8/4K3 w - - 0 1", flechas: [["b5", "e8"]], pie: "El alfil clava al caballo: si el caballo se mueve, el rey queda en jaque, y eso no se puede." },
    ],
    ejercicios: [
      { tipo: "gana", fen: "4k3/5p2/4n3/8/3P4/8/8/4R1K1 w - - 0 1", minimo: 2, respuesta: "d5", pregunta: "Juegan las blancas. La torre clava al caballo negro. ¿Cómo lo atacas otra vez?", explica: " El peón avanza a d5 y ataca al caballo clavado, que no puede escapar." },
      { tipo: "gana", fen: "6k1/8/8/3q4/8/1P6/8/5BK1 w - - 0 1", minimo: 6, respuesta: "Ac4", pregunta: "Juegan las blancas. ¿Cómo clava Don Saleras a la dama negra?", explica: " En c4, el alfil ataca a la dama y detrás de ella está el rey: la dama está clavada. Aunque se coma al alfil, el peón de b3 se come a la dama." },
    ],
  },

  {
    n: 6,
    titulo: "Al revés de la clavada: la enfilada",
    escena: {
      id: "enfilada", fondo: "dia",
      alt: "Doña Muralla, la torre blanca, apunta con una flecha recta al rey negro, que se aparta asustado. Detrás del rey, en la misma fila, espera una torre negra.",
      contenido: D.pieza("t", "b", 520, 292, 0.9, { espejo: true }) + D.pieza("r", "n", 320, 292, 0.75, { cara: "sorpresa" }) + D.pieza("t", "n", 110, 292, 0.7) +
        D.flecha(460, 200, 160, 200, "#123e7c") + D.globo(220, 24, 200, "¡Jaque!", [300, 100]),
    },
    cuento: [
      "—Yo sé un truco que es la clavada al revés —dijo Doña Muralla, la torre.",
      "—¿Al revés? —preguntaron Peonita y Tizón.",
      "—En la clavada, la pieza de adelante es la chiquita y la de atrás, la importante. En la enfilada es al revés: ataco primero a la pieza importante, y cuando se quita… me como a la que estaba detrás.",
      "Doña Muralla se puso en la misma fila que el rey negro y le dio jaque. Detrás del rey, en esa misma fila, había una torre negra.",
      "El rey tuvo que apartarse… ¡y Doña Muralla se comió a la torre!",
      "—Es como en la fila de la soda de la escuela —se rió Tizón—: si el primero se quita, el de atrás queda de frente.",
      "—Exactamente —dijo Don Lento—. Cuando vean dos piezas del otro en la misma línea… piensen en una clavada o en una enfilada.",
    ],
    aprendi: [
      "En la enfilada se ataca a la pieza importante, que tiene otra detrás.",
      "Cuando la de adelante se aparta, se come a la de atrás.",
      "Dos piezas del otro en la misma línea: ¡busca la clavada o la enfilada!",
    ],
    muestras: [
      { fen: "8/8/8/8/r3k2R/8/8/6K1 b - - 1 1", desde: { fen: "8/8/8/8/r3k3/8/8/6KR w - - 0 1", jugada: "Rh4+" }, flechas: [["h4", "a4"]], pie: "La torre da jaque por la fila. Cuando el rey se aparte, se come a la torre de a4." },
    ],
    ejercicios: [
      { tipo: "gana", fen: "R7/8/3k4/8/8/7K/8/3r4 w - - 0 1", minimo: 5, respuesta: "Td8+", pregunta: "Juegan las blancas. El rey y la torre negros están en la misma columna. ¿Cómo haces la enfilada?", explica: " La torre da jaque desde d8. El rey se aparta y la torre se come a la torre de d1." },
      { tipo: "gana", fen: "6q1/8/8/3k4/8/8/8/3B3K w - - 0 1", minimo: 9, respuesta: "Ab3+", pregunta: "Juegan las blancas. El rey y la dama negros están en la misma diagonal. ¿Qué jugada hace Don Saleras?", explica: " El alfil da jaque desde b3. El rey se aparta y el alfil se come a la dama de g8." },
    ],
  },

  {
    n: 7,
    titulo: "Nunca dejes al rey sin aire: el mate del pasillo",
    escena: {
      id: "pasillo", fondo: "noche",
      alt: "El Rey Sereno, detrás de tres peones que no lo dejan salir, mira asustado a una torre negra que le apunta desde el otro lado. Arriba del rey brilla una ventanita.",
      contenido: D.pieza("r", "b", 300, 270, 0.85, { cara: "sorpresa" }) +
        [0, 1, 2].map((i) => D.pieza("p", "b", 210 + i * 90, 300, 0.5, { cara: "pensando" })).join("") +
        D.pieza("t", "n", 520, 270, 0.8, { espejo: true }) + D.flecha(470, 200, 360, 200, "#e03131") +
        `<rect x="250" y="40" width="100" height="70" rx="6" fill="#fff3bf" stroke="#c08552" stroke-width="7"/><path d="M300,40 V110 M250,75 H350" stroke="#c08552" stroke-width="5"/>`,
    },
    cuento: [
      "Una mañana, el Rey Sereno estaba muy tranquilo en su esquina, protegido por tres peones que tenía adelante.",
      "—Aquí nadie me puede molestar —dijo, satisfecho.",
      "Pero entonces, la torre de Tizón llegó por la última fila y le dio jaque. El Rey Sereno quiso escaparse… ¡y no pudo! Sus propios peones le tapaban la salida.",
      "—¡Jaque mate! —dijo Tizón.",
      "—Ese es el mate del pasillo —explicó Don Lento—. El rey se queda encerrado en la última fila, como en un pasillo, y una torre o una dama le da mate desde un lado.",
      "—¿Y cómo se evita? —preguntó Peonita.",
      "—Con una ventanita. Cuando ya no haya peligro en el centro… mueve uno de los peones que están frente a tu rey. Así, si un día le dan jaque por la última fila, el rey tiene una casilla para escaparse.",
      "Desde entonces, el Rey Sereno siempre tuvo su ventanita abierta. Y cuando el rey de Tizón se olvidaba de la suya… ¡Peonita le daba el mate del pasillo!",
    ],
    aprendi: [
      "El mate del pasillo: el rey queda encerrado por sus propios peones en la última fila.",
      "Una torre o una dama le da mate desde un lado.",
      "Para evitarlo, mueve a tiempo un peón y ábrele una ventanita a tu rey.",
    ],
    muestras: [
      { fen: "3R2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 1", desde: { fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", jugada: "Rd8#" }, flechas: [["d8", "g8"]], pie: "Jaque mate del pasillo: el rey negro no puede salir, porque sus peones le tapan el camino." },
    ],
    ejercicios: [
      { tipo: "mate", fen: "6k1/5ppp/8/8/8/8/1Q3PPP/6K1 w - - 0 1", respuesta: "Db8" },
      { tipo: "mate", fen: "6k1/4Rppp/8/8/8/8/5PPP/6K1 w - - 0 1", respuesta: "Te8" },
      { tipo: "amenaza", fen: "3r2k1/6pp/7p/8/8/8/5PPP/6K1 w - - 0 1", minimo: 1000, respuesta: "Td1", pregunta: "Le toca a Peonita. ¿Qué jugada quiere hacer Tizón? ¿Qué peón mueves para evitarla?", explica: " Td1 sería mate del pasillo. Para evitarlo, Peonita mueve un peón (h3, g3 o f3) y su rey tiene una ventanita para escapar." },
    ],
  },

  {
    n: 8,
    titulo: "Descubre el truco: el ataque a la descubierta",
    escena: {
      id: "descubierta", fondo: "dia",
      alt: "Galope se aparta de un salto y deja ver a Doña Muralla, que estaba escondida detrás de él. Una flecha sale de la torre hacia el rey negro y otra sale del caballo.",
      contenido: D.pieza("t", "b", 90, 292, 0.8) + D.pieza("c", "b", 300, 230, 0.75) + D.pieza("r", "n", 520, 292, 0.75, { cara: "sorpresa", espejo: true }) +
        D.flecha(150, 230, 465, 230, "#123e7c") + D.flecha(330, 130, 470, 70, "#e8590c", [420, 60]) +
        D.globo(140, 24, 160, "¡Sorpresa!", [250, 110]),
    },
    cuento: [
      "La última lección antes del torneo la dieron dos amigos juntos: Galope y Doña Muralla.",
      "Galope se puso delante de la torre, en la misma columna que el rey negro. Desde atrás, Doña Muralla no podía ver nada.",
      "—Ahora miren —dijo Galope, y dio un salto hacia un lado.",
      "¡Sorpresa! Al apartarse, Galope destapó a Doña Muralla, que de pronto le daba jaque al rey negro. Y además, desde su nueva casilla, Galope atacaba a la dama negra.",
      "—Tizón tiene que salvar a su rey —explicó Doña Muralla—, y no le queda tiempo para salvar a la dama.",
      "—¡Es como abrir una cortina! —dijo Peonita.",
      "—Eso se llama ataque a la descubierta —dijo Don Lento—. Una pieza se mueve y destapa el ataque de otra que estaba detrás. Son dos ataques en una sola jugada… y casi nadie los ve venir.",
    ],
    aprendi: [
      "En el ataque a la descubierta, una pieza se aparta y destapa el ataque de otra.",
      "La pieza que se mueve puede atacar a otra cosa: ¡son dos ataques a la vez!",
      "Si la pieza destapada da jaque, el otro tiene que salvar a su rey primero.",
    ],
    muestras: [
      { fen: "4k3/7q/5N2/8/8/8/8/4R1K1 b - - 1 1", desde: { fen: "4k3/7q/8/8/4N3/8/8/4R1K1 w - - 0 1", jugada: "Nf6+" }, flechas: [["e1", "e8"], ["f6", "h7"]], pie: "Galope se apartó y destapó a la torre: ¡jaque! Y además, Galope ataca a la dama de h7." },
    ],
    ejercicios: [
      { tipo: "gana", fen: "4k3/8/8/1p6/q3B3/8/8/4R1K1 w - - 0 1", minimo: 6, respuesta: "Ac2+", pregunta: "Juegan las blancas. ¿Adónde se aparta el alfil para destapar a la torre y atacar a la dama?", explica: " El alfil va a c2: destapa el jaque de la torre y ataca a la dama por la diagonal. El rey se salva y el alfil se come a la dama." },
      { tipo: "gana", fen: "4k3/8/q1p5/8/4B3/8/8/4R1K1 w - - 0 1", minimo: 6, respuesta: "Ad3+", pregunta: "Juegan las blancas. Busca el ataque a la descubierta.", explica: " El alfil va a d3: destapa el jaque de la torre y ataca a la dama de a6." },
    ],
  },

  {
    n: 9,
    titulo: "Revisa qué quiere tu amigo",
    escena: {
      id: "revisa", fondo: "dia",
      alt: "Peonita mira con su lupa a Don Pillo, el mapache, que sonríe con picardía detrás de un tablero. Alrededor de Peonita hay signos de pregunta.",
      contenido: D.mapache(440, 292, 0.85) + D.pieza("p", "b", 170, 292, 0.95, { mono: true, cara: "pensando" }) + D.lupa(270, 190, 1, -50) +
        [[90, 90], [235, 70]].map(([x, y]) => `<text x="${x}" y="${y}" font-family="Quicksand, sans-serif" font-weight="700" font-size="34" fill="#1971c2">?</text>`).join(""),
    },
    cuento: [
      "La noche antes del torneo, Don Pillo apareció de nuevo… ¡pero esta vez no venía a robar! Traía un tablero bajo el brazo.",
      "—Ya sé que aprendieron trucos —dijo con una sonrisa pícara—. Juguemos mañana un torneo. Si ganan, les devuelvo todas las piezas. Si gano yo… me quedo con la caja entera.",
      "Peonita tragó saliva. Esa noche no podía dormir, y fue a buscar a Don Lento.",
      "—Don Pillo sabe muchos trucos —le dijo—. ¿Cómo hago para que no me los haga a mí?",
      "Don Lento la miró con calma, muuuy despacio, y le dijo lo más importante de todo:",
      "—Antes de cada jugada… mira la última jugada del otro y pregúntate: ¿qué quiere hacer? ¿Qué pieza mía ataca? ¿Me prepara una horquilla, una clavada, un mate del pasillo? Si descubres su truco a tiempo… lo puedes evitar.",
      "Peonita practicó toda la noche con Tizón. Cada vez que él movía, ella se detenía, miraba con su lupa y preguntaba: «¿Qué quieres hacer?». ¡Y casi siempre lo descubría!",
    ],
    aprendi: [
      "Antes de jugar, mira la última jugada del otro.",
      "Pregúntate: ¿qué quiere hacer? ¿Qué ataca? ¿Qué truco me prepara?",
      "Un truco que descubres a tiempo, lo puedes evitar.",
    ],
    muestras: [
      { fen: "3r2k1/5ppp/8/8/8/1R6/5PPP/6K1 w - - 0 1", flechas: [["d8", "d1"]], pie: "Antes de jugar, Peonita revisa: la torre de Tizón quiere ir a d1 y dar mate del pasillo." },
    ],
    ejercicios: [
      { tipo: "amenaza", fen: "6k1/5ppp/8/8/1n6/8/5PPP/R3K3 w - - 0 1", minimo: 4, respuesta: "Cc2+", explica: " El caballo negro quiere saltar a c2: jaque al rey y ataque a la torre, ¡una horquilla! Peonita tiene que mover la torre o el rey antes." },
      { tipo: "defensa", fen: "6k1/5ppp/8/8/1n6/8/5PPP/R3K3 w - - 0 1", minimo: 3, jugadas: ["Tb1", "Tc1", "Td1", "Rd2"], pregunta: "En la misma posición, ¿qué jugada harías para que Tizón no pueda hacer su truco?", respuesta: "Por ejemplo, mover la torre a b1, c1 o d1, o el rey a d2: así el caballo ya no puede atacar a los dos a la vez." },
    ],
  },

  {
    n: 10,
    titulo: "Ojo de águila: el torneo de los trucos",
    escena: {
      id: "torneo2", fondo: "dia",
      alt: "Peonita y Tizón celebran con un trofeo dorado. A su lado, Don Pillo, el mapache, sonríe y les devuelve una torre blanca. Hay confeti de colores.",
      contenido: D.confeti(23, 44, 600, 320) + D.pieza("p", "b", 150, 292, 0.95, { mono: true }) + D.pieza("p", "n", 270, 292, 0.95, { bufanda: true }) +
        D.trofeo(210, 200, 1.1) + D.mapache(450, 292, 0.85, { espejo: true }) + D.pieza("t", "b", 380, 250, 0.4),
    },
    cuento: [
      "El día del torneo, todo el bosque vino a mirar. Los tucanes se sentaron en las ramas, las ardillas en las piedras y hasta un perezoso muy lento llegó, justo a tiempo, a su rama favorita.",
      "Peonita y Tizón jugaron contra Don Pillo, uno por uno. El mapache era muy astuto: preparaba horquillas, clavadas y mates del pasillo. Pero antes de cada jugada, Peonita se preguntaba: «¿Qué quiere hacer?», y descubría el truco a tiempo.",
      "En la última partida, Don Pillo se descuidó. Peonita vio con ojo de águila que el rey y la dama del mapache estaban donde Galope los podía atacar a los dos a la vez.",
      "—¡Jaque! —dijo, con una horquilla perfecta.",
      "Don Pillo se rascó la cabeza, miró el tablero un buen rato… y se rió.",
      "—¡Me ganaste con mi propio truco! —dijo, y le dio la mano—. Buena partida.",
      "Esa misma tarde, el mapache devolvió todas las piezas que se había llevado: Doña Muralla, el caballo y hasta un peón que nadie había echado de menos.",
      "—Ya no necesito robar piezas —dijo Don Pillo—. Es mucho más divertido ganarlas jugando. ¿Me enseñan a jugar mejor?",
      "Y así, el mapache más travieso del bosque se volvió el amigo más nuevo de Peonita y Tizón.",
    ],
    aprendi: [
      "Los trucos de este libro: pieza sin cuidar, horquilla, ataque doble, clavada, enfilada, mate del pasillo y ataque a la descubierta.",
      "Antes de cada jugada, mira qué quiere hacer el otro.",
      "Los trucos se ganan jugando limpio, ¡y se aprenden jugando mucho!",
    ],
    muestras: [],
    ejercicios: [
      { tipo: "gana", fen: "3r3k/6pp/8/6N1/8/8/5PPP/6K1 w - - 0 1", minimo: 5, respuesta: "Cf7+", pregunta: "Juegan las blancas. ¿Qué truco hay? ¿Qué jugada lo hace?", explica: " Horquilla: Galope salta a f7, da jaque al rey de h8 y ataca a la torre de d8." },
      { tipo: "gana", fen: "4k3/8/4q3/8/8/8/5PPP/R4K2 w - - 0 1", minimo: 4, respuesta: "Te1", pregunta: "Juegan las blancas. ¿Qué truco hay? ¿Qué jugada lo hace?", explica: " Clavada: la torre va a e1 y la dama negra queda clavada delante de su rey. Si se come a la torre, el rey blanco se come a la dama." },
      { tipo: "gana", fen: "1r5k/7p/6p1/8/8/8/6PP/4Q1K1 w - - 0 1", minimo: 5, respuesta: "De5+", pregunta: "Juegan las blancas. ¿Qué truco hay? ¿Qué jugada lo hace?", explica: " Ataque doble: la dama da jaque desde e5 y ataca a la torre de b8." },
      { tipo: "mate", fen: "6k1/5ppp/8/8/8/8/5PPP/4Q1K1 w - - 0 1", respuesta: "De8" },
    ],
  },
];

const FINAL_TITULO = "¡Ya conoces los trucos del bosque!";
const ESCENA_FINAL = {
  id: "final2", fondo: "noche",
  alt: "Bajo la luna, todos celebran juntos: Peonita, Tizón, Don Pillo el mapache, Galope, la Dama Estrella y Doña Muralla, con confeti de colores. Don Lento sonríe desde su rama.",
  contenido: D.confeti(9, 50, 600, 320) + D.perezoso(500, 40, 0.5) +
    [["c", "b"], ["d", "b"], ["t", "b"]].map(([t, col], i) => D.pieza(t, col, 80 + i * 80, 228, 0.55)).join("") +
    D.mapache(450, 300, 0.7, { espejo: true }) +
    D.pieza("p", "b", 230, 300, 0.8, { mono: true }) + D.pieza("p", "n", 340, 300, 0.8, { bufanda: true, espejo: true }) + D.corazon(285, 205, 1.1),
};
const ESCENA_DIPLOMA = {
  id: "diploma2", fondo: "dia",
  alt: "Peonita, con su lupa, y Don Pillo felicitan a quien recibe el diploma.",
  contenido: D.mapache(470, 290, 0.75, { espejo: true }) + D.pieza("p", "b", 150, 290, 1, { mono: true }) + D.lupa(225, 200, 0.9, -30) +
    D.trofeo(320, 280, 1.3) + D.estrella(250, 80, 12) + D.estrella(380, 60, 9),
};
const DIPLOMA = {
  titulo: "Diploma de detective de trucos",
  sub: "Peonita, Tizón y Don Pillo reconocen a",
  firma: "Peonita, Tizón y Don Pillo",
  texto: ["porque aprendió a encontrar horquillas, clavadas, enfiladas y descubiertas,", "y a mirar siempre qué quiere hacer su amigo antes de jugar."],
};

const FINAL = [
  "¡Lo lograste! Ahora conoces los primeros trucos del ajedrez: la pieza sin cuidar, la horquilla, el ataque doble, la horquilla de peón, la clavada, la enfilada, el mate del pasillo y el ataque a la descubierta.",
  "Pero el truco más importante es el de Don Lento: antes de cada jugada, mira qué quiere hacer el otro. Juega mucho, busca los trucos con tu lupa de detective y, sobre todo, ¡diviértete como Peonita, Tizón y su nuevo amigo, Don Pillo!",
];

module.exports = {
  SLUG, CLAVE, AUTOR, TITULO, TITULO_PDF, SUBTITULO, ASUNTO, TAPA, FINAL_TITULO, ESCENA_FINAL, ESCENA_DIPLOMA, DIPLOMA,
  VALOR, NOMBRE, PRESENTACION, NOTA_ADULTOS, SECRETO, SECRETOS, DEDICATORIA, CAPITULOS, PROMESAS: [], CONSEJOS_PARTIDA: [], FINAL,
};
