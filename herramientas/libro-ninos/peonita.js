/* El primer cuento de Peonita: «Peonita y el reino de las 64 casillas», de
 * Oscar Angulo Cubero. El cuento, lo que aprende el niño en cada capítulo, los
 * ejercicios de «¡A jugar!», la tapa, el final y el diploma.
 *
 * Vive aparte de la maqueta (herramientas/libro-ninos-pdf.js) porque lo leen
 * dos: el generador, que lo pone en papel, y herramientas/verificar-libro-ninos.js,
 * que comprueba con chess.js cada posición y CADA RESPUESTA escrita acá. Las
 * respuestas van escritas a mano a propósito: si el generador las calculara,
 * el verificador estaría comprobando el cálculo contra sí mismo.
 *
 * La historia es propia. Se tomó como referencia el TIPO de libro de
 * «El maravilloso mundo del ajedrez escolar» (un cuento con un personaje que
 * aprende y actividades entre capítulo y capítulo), pero ese libro tiene
 * licencia «sin obra derivada»: ningún personaje, texto ni dibujo sale de ahí.
 *
 * Tipos de ejercicio (los entiende el generador y los comprueba el verificador):
 *   contar   ¿a cuántas casillas puede ir la pieza de `casilla`?   respuesta: número
 *   comer    ¿qué pieza puede comer? (hay una sola)                respuesta: casilla
 *   color    ¿puede el alfil llegar alguna vez a la estrella?      respuesta: true/false
 *   saltos   ¿cuántos saltos necesita el caballo para la estrella? respuesta: número
 *   destinos ¿a qué casillas puede ir? (rey o peón)                respuesta: [casillas]
 *   jaque    ¿está en jaque el rey de quien mueve?                 respuesta: true/false
 *   salida   ¿cómo se salva del jaque? (sirve una sola forma)      respuesta: huir/tapar/comer
 *   mate     mate en una (hay una sola jugada que da mate)         respuesta: jugada en español
 *   final    ¿mate, ahogado o ninguno de los dos?                  respuesta: mate/ahogado/ninguno
 *   enroque  ¿puede enrocar corto el rey blanco ahora?             respuesta: true/false
 *   corona   el peón llega al final: ¿en qué se puede convertir?   respuesta: texto
 *   puntos   ¿qué grupo de piezas suma más?                        respuesta: nombre del grupo
 *   cambio   ¿es buen cambio dar `das` y recibir `recibes`?        respuesta: bueno/malo
 *   suma     ¿cuántos puntos suman estas piezas?                   respuesta: número
 *   casilla  ¿cómo se llama la casilla de la estrella?             respuesta: casilla
 *   texto    pregunta sin posición que comprobar (o con una que solo se valida)
 * `explica`, cuando está, es lo que dice la solución después de la respuesta.
 * Y los que no tienen respuesta: tableros, colorear, unir, promesas, partida.
 */
"use strict";
const D = require("./dibujos.js");

const SLUG = "peonita";                     // material/peonita/peonita.pdf
const CLAVE = "peonita-oac-2026";           // la clave de propietario del PDF
const AUTOR = "Oscar Angulo Cubero";
const TITULO = "Peonita y el reino de las 64 casillas";
const TITULO_PDF = TITULO;
const SUBTITULO = "Un cuento para aprender a jugar ajedrez";
const ASUNTO = "Cuento para que ninas y ninos aprendan a jugar ajedrez";
const TAPA = {
  arriba: "Peonita", medio: "y el reino de las", abajo: "64 casillas",
  dibujo: D.perezoso(470, 360, 0.75) +
    D.pieza("t", "b", 95, 720, 0.6) + D.pieza("c", "n", 505, 720, 0.6, { espejo: true }) +
    D.pieza("p", "n", 380, 790, 1.15, { bufanda: true, espejo: true }) +
    D.pieza("p", "b", 235, 815, 1.55, { mono: true }) +
    D.estrella(60, 470, 10) + D.estrella(560, 600, 8) + D.estrella(330, 420, 7),
};

/* Lo que vale cada pieza, en puntos. El rey no tiene precio. */
const VALOR = { P: 1, C: 3, A: 3, T: 5, D: 9 };
const NOMBRE = { P: "peón", C: "caballo", A: "alfil", T: "torre", D: "dama", R: "rey" };

/* ---------------------------------------------------------- presentación */
const PRESENTACION = {
  titulo: "Hola, soy Peonita",
  escena: {
    id: "hola", fondo: "dia",
    alt: "Peonita, un peón blanco con un moño rosado, saluda sonriente. A su lado, colgado de una rama, Don Lento el perezoso la mira con sus anteojos redondos.",
    contenido: D.guarumo(520, 250, 0.9) + D.perezoso(470, 46, 0.62) +
      D.pieza("p", "b", 210, 290, 1.45, { mono: true }) +
      D.globo(270, 60, 190, ["¡Hola! Me llamo", "Peonita"], [245, 140]),
  },
  parrafos: [
    "¡Hola! Me llamo Peonita. Soy un peón blanco, la pieza más pequeñita del ajedrez, y llevo siempre mi moño rosado.",
    "Vivo con mis amigos en una caja de madera, en el aula de una escuela de Costa Rica. De día dormimos muy tranquilos, pero cuando sale la luna… ¡la caja se abre y empieza la aventura!",
    "En este libro te voy a contar cómo aprendí a jugar ajedrez con la ayuda de mi maestro, Don Lento, un perezoso muy sabio que vive en el guarumo de la ventana. Él dice que el ajedrez se juega «con la cabeza y con el corazón».",
    "Después de cada capítulo hay una página que se llama «¡A jugar!», con retos para ti. Si te equivocas, no pasa nada: así aprendemos todos. ¿Me acompañas?",
  ],
};

const NOTA_ADULTOS = [
  "Este libro está pensado para niñas y niños de 4 a 8 años que empiezan con el ajedrez, y para leerlo acompañados: en voz alta, un capítulo por vez, con un tablero de verdad sobre la mesa.",
  "Cada capítulo tiene tres partes: el cuento, un recuadro de «Lo que aprendí» con la idea principal y una página de «¡A jugar!» con retos sencillos. Las soluciones están al final del libro.",
  "Vayan despacio, como Don Lento. Es mejor jugar mucho con la torre sola que aprender todas las piezas en una tarde. Antes de pasar al siguiente capítulo, conviene mover la pieza nueva en el tablero hasta que salga sin pensar.",
  "Feliciten el esfuerzo más que el resultado: «¡qué bien pensaste esa jugada!» enseña más que «¡ganaste!». Y cuando pierdan, que pase igual que en el cuento: se da la mano, se dice «buena partida» y se juega otra.",
];

/* Los secretos para Alessandro, el hijo del autor (ver «Cada cuento lleva un
   secreto para Alessandro» en docs/decisiones/cursos-y-material.md). No se
   anuncian en ningún lado del libro: se descubren.
   - La dedicatoria es un acróstico: la primera letra de cada verso, de arriba
     hacia abajo, dice ALESSANDRO.
   - El alfil se llama Don Saleras, que tiene las mismas letras que Alessandro.
   verificar-libro-ninos.js comprueba los dos: una corrección del poema o del
   nombre podría romper el secreto sin que nadie lo note. */
const SECRETO = "ALESSANDRO";
const NOMBRE_ALFIL = "Don Saleras";
const SECRETOS = [{ tipo: "acrostico-dedicatoria" }, { tipo: "anagrama", nombre: NOMBRE_ALFIL }];
const DEDICATORIA = [
  "Aprende despacito, como Don Lento,",
  "las piezas te esperan en su lugar;",
  "el tablero es un reino de cuento,",
  "sesenta y cuatro casillas para jugar.",
  "Sueña en grande, como Peonita,",
  "avanza sin miedo, paso a pasito;",
  "nunca te rindas, aunque cueste un poquito:",
  "de cada partida algo se aprende.",
  "Ríe, piensa y da la mano al final,",
  "ojalá este juego te acompañe siempre.",
];

/* ---------------------------------------------------------- capítulos */
const CAPITULOS = [
  {
    n: 1,
    titulo: "La caja que se abrió de noche",
    escena: {
      id: "caja", fondo: "aula",
      alt: "De noche, en el aula, la caja de madera del ajedrez está abierta. Peonita salta afuera con los brazos al aire, y desde la rama de la ventana Don Lento la saluda.",
      contenido: D.caja(70, 190) + D.pieza("t", "b", 115, 196, 0.45, { cara: "dormida" }) + D.pieza("c", "n", 175, 196, 0.45, { cara: "dormida" }) +
        D.pieza("p", "b", 300, 268, 0.95, { mono: true, cara: "sorpresa" }) +
        D.estrella(255, 120, 9) + D.estrella(345, 105, 7) + D.estrella(300, 90, 5) +
        D.perezoso(468, 104, 0.5),
    },
    cuento: [
      "En una escuela muy cerca de las montañas había una caja de madera guardada en un estante. Adentro dormían treinta y dos piezas de ajedrez.",
      "Una noche, cuando la luna se asomó por la ventana, la tapa hizo ¡clic! y se abrió. La primera en salir fue Peonita, con su moño rosado.",
      "—¿Dónde estamos? —preguntó, frotándose los ojos.",
      "Desde la rama del guarumo, alguien bostezó muuuy despacio.",
      "—Buenas… noches… pequeña —dijo un perezoso de anteojos redondos—. Yo soy… Don Lento. Y eso que ves sobre la mesa… es el tablero.",
      "Peonita miró. Era un cuadrado lleno de cuadritos, unos claros y otros oscuros, puestos uno y uno, como el piso de baldosas de la cocina.",
      "—Cada cuadrito se llama casilla —explicó Don Lento—. Hay sesenta y cuatro: ocho filas de ocho casillas.",
      "—¿Y cómo sé si el tablero está bien puesto? —preguntó Peonita.",
      "—Fácil. Mira la esquina de abajo, a tu mano derecha. Tiene que ser una casilla clara. Repite conmigo: «Blanca a la derecha, ¡la partida está hecha!».",
      "Peonita lo repitió tres veces mientras saltaba de casilla en casilla. Así descubrió que las casillas acostadas, de lado a lado, forman las filas; las que van de pie, de abajo hacia arriba, forman las columnas; y las que van inclinadas, todas del mismo color, forman las diagonales.",
      "—Y cada casilla tiene su nombre —siguió Don Lento—: una letra y un número, como en el juego de batalla naval. Las letras van por abajo, de la a a la h, y dicen la columna; los números van por el costado, del 1 al 8, y dicen la fila. La casilla donde estás parada, Peonita, se llama e4.",
    ],
    aprendi: [
      "El tablero tiene 64 casillas, claras y oscuras.",
      "La casilla de la esquina, a tu mano derecha, es clara.",
      "Hay filas (acostadas), columnas (de pie) y diagonales (inclinadas).",
      "Cada casilla se llama con una letra y un número, como e4.",
    ],
    muestras: [],
    ejercicios: [
      { tipo: "tableros", pregunta: "¿Cuál de los dos tableros está bien puesto? Mira la esquina de abajo a la derecha.", respuesta: "A" },
      { tipo: "texto", pregunta: "¿Cuántas casillas tiene una fila? ¿Y cuántas tiene el tablero entero?", respuesta: "Una fila tiene 8 casillas. El tablero tiene 64." },
      { tipo: "casilla", fen: "8/8/8/8/8/8/8/8 w - - 0 1", estrellas: ["c6"], pregunta: "¿Cómo se llama la casilla de la estrella? Busca su letra abajo y su número al costado.", respuesta: "c6" },
      { tipo: "colorear", pregunta: "Pinta las casillas oscuras de este tablero. Ya te ayudamos con la primera: empieza por la esquina de abajo a la izquierda y salta una sí y una no." },
    ],
  },

  {
    n: 2,
    titulo: "Los vecinos del tablero",
    escena: {
      id: "vecinos", fondo: "dia",
      alt: "Las piezas blancas en fila: la torre, el caballo, el alfil, la dama y el rey. Adelante, Peonita y Tizón, un peón negro con bufanda verde, se sonríen con un corazón entre los dos.",
      contenido: ["t", "c", "a", "d", "r"].map((t, i) => D.pieza(t, "b", 70 + i * 70, 222, 0.62)).join("") +
        D.pieza("p", "b", 410, 292, 0.85, { mono: true }) + D.pieza("p", "n", 520, 292, 0.85, { bufanda: true, espejo: true }) +
        D.corazon(465, 175, 1.3),
    },
    cuento: [
      "Detrás de Peonita fueron saliendo los demás. Primero, Doña Muralla, la torre; luego Galope, el caballo; después Don Saleras, el alfil; la Dama Estrella, con su corona brillante; y el Rey Sereno, con su crucecita dorada. Al final salieron los ocho peones, en fila, como en una excursión.",
      "Entonces, del otro lado de la caja, se oyó un ruidito. ¡Eran las piezas negras! Peonita se escondió detrás de la torre.",
      "—¿Vienen a pelear? —susurró.",
      "Un peón negro con una bufanda verde se acercó y le sonrió.",
      "—Hola, me llamo Tizón. ¿Quieres jugar?",
      "—En el ajedrez nadie se lastima —dijo Don Lento—. Las blancas y las negras juegan juntas, como dos amigos que se retan a ver quién piensa mejor.",
      "Desde esa noche, Peonita y Tizón fueron los mejores amigos. Don Lento les enseñó a acomodar a todos en el tablero: las torres en las esquinas, al lado los caballos y luego los alfiles. En el centro quedan la dama y el rey: la dama siempre en su color —la dama blanca en casilla clara y la dama negra en casilla oscura— y el rey a su lado. Los ocho peones van en la fila de adelante, como un muro.",
      "—Cada bando tiene dieciséis piezas —contó Peonita con los dedos—: un rey, una dama, dos torres, dos alfiles, dos caballos… ¡y ocho peones como yo!",
    ],
    aprendi: [
      "Cada bando tiene 16 piezas: 1 rey, 1 dama, 2 torres, 2 alfiles, 2 caballos y 8 peones.",
      "Las torres van en las esquinas; luego los caballos, luego los alfiles.",
      "La dama va en su color, y el rey a su lado. Los peones, adelante.",
    ],
    muestras: [
      { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", pie: "Así empieza toda partida. Las blancas abajo y las negras arriba." },
    ],
    ejercicios: [
      { tipo: "unir", pregunta: "Une con una línea cada pieza con su nombre." },
      { tipo: "texto", pregunta: "¿Cuántas piezas hay en el tablero al empezar la partida, sumando las blancas y las negras?", respuesta: "32: 16 blancas y 16 negras." },
      { tipo: "texto", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1", estrellas: ["d1"], pregunta: "¡Se perdió la dama blanca! ¿Va en la casilla de la estrella? Pista: la dama va en su color.", respuesta: "Sí: la casilla de la estrella es clara y la dama blanca va en casilla clara, al lado de su rey." },
    ],
  },

  {
    n: 3,
    titulo: "Doña Muralla, la torre",
    escena: {
      id: "torre", fondo: "dia",
      alt: "Doña Muralla, la torre blanca, en el centro, con cuatro flechas que salen de ella: hacia arriba, hacia abajo y hacia los dos lados.",
      contenido: D.pieza("t", "b", 300, 270, 1.15) + D.flecha(370, 190, 520, 190, "#1971c2") + D.flecha(230, 190, 80, 190, "#1971c2") +
        D.flecha(300, 98, 300, 30, "#1971c2") + D.globo(380, 40, 190, ["¡Derechito,", "como un tren!"], [345, 140]),
    },
    cuento: [
      "La primera en dar clase fue Doña Muralla, la torre.",
      "—Yo camino derecho —dijo con voz firme—, como un tren por su carril. Puedo ir hacia adelante, hacia atrás, hacia un lado o hacia el otro. ¡Todas las casillas que quiera, si nadie me tapa el camino!",
      "Peonita puso a la torre en el medio del tablero y contó con el dedo: arriba, abajo, a la izquierda, a la derecha… ¡catorce casillas!",
      "—¿Y si hay una pieza en el camino? —preguntó Tizón.",
      "—Si es de mi color, me detengo antes: no puedo saltarla. Si es del otro color, puedo comérmela: me pongo en su casilla y ella se va a descansar a la caja.",
      "—En el ajedrez, ninguna pieza salta a las demás —agregó Don Lento, despacito—. Bueno… casi ninguna. Ya conocerán a una muy saltarina.",
    ],
    aprendi: [
      "La torre camina derecho: por las filas y por las columnas.",
      "Avanza todas las casillas que quiera, pero no salta.",
      "Come una pieza del otro color poniéndose en su casilla.",
    ],
    muestras: [
      { fen: "8/8/8/8/3R4/8/8/8 w - - 0 1", casilla: "d4", pie: "Los puntos verdes son las casillas adonde puede ir la torre." },
    ],
    ejercicios: [
      { tipo: "contar", fen: "8/8/3P4/8/1P1R2P1/8/8/8 w - - 0 1", casilla: "d4", respuesta: 7 },
      { tipo: "comer", fen: "8/3p4/5n2/8/1rPR4/8/8/8 w - - 0 1", casilla: "d4", respuesta: "d7" },
    ],
  },

  {
    n: 4,
    titulo: "Don Saleras y sus caminos de colores",
    escena: {
      id: "alfil", fondo: "dia",
      alt: "Don Saleras, el alfil blanco con su gorro puntiagudo, con cuatro flechas inclinadas que salen de él en diagonal.",
      contenido: D.pieza("a", "b", 300, 270, 1.15) + D.flecha(360, 150, 470, 60, "#9c36b5") + D.flecha(240, 150, 130, 60, "#9c36b5") +
        D.flecha(370, 225, 470, 245, "#9c36b5") + D.flecha(230, 225, 130, 245, "#9c36b5"),
    },
    cuento: [
      "La segunda noche le tocó a Don Saleras, el alfil, que tiene un gorro con punta y una rayita en la cabeza.",
      "—Yo camino inclinado —explicó—, por las diagonales. Igual que la torre, avanzo todas las casillas que quiera, si el camino está libre.",
      "Peonita se fijó en algo curioso: el alfil que empezó en una casilla clara siempre seguía en casillas claras. ¡Nunca pisaba una oscura!",
      "—Así es —sonrió Don Saleras—. Por eso cada bando tiene dos alfiles: uno que pasea por las casillas claras y otro por las oscuras. Somos un equipo.",
      "—Al principio de la partida estás encerrado detrás de los peones —dijo Tizón.",
      "—Por eso le pido a algún peón que se mueva —respondió el alfil—. Así se abre mi camino.",
    ],
    aprendi: [
      "El alfil camina inclinado, por las diagonales, todas las casillas que quiera.",
      "Siempre se queda en casillas de su mismo color.",
      "Cada bando tiene un alfil de casillas claras y otro de casillas oscuras.",
    ],
    muestras: [
      { fen: "8/8/8/8/3B4/8/8/8 w - - 0 1", casilla: "d4", pie: "Desde el centro, el alfil llega a 13 casillas." },
    ],
    ejercicios: [
      { tipo: "contar", fen: "8/8/8/8/8/8/3P4/2B5 w - - 0 1", casilla: "c1", respuesta: 2 },
      { tipo: "color", fen: "8/8/8/8/8/8/8/5B2 w - - 0 1", casilla: "f1", meta: "c4", respuesta: true },
      { tipo: "color", fen: "8/8/8/8/8/8/8/5B2 w - - 0 1", casilla: "f1", meta: "d4", respuesta: false },
      { tipo: "comer", fen: "8/3r4/1n3q2/2P5/3B4/8/8/8 w - - 0 1", casilla: "d4", respuesta: "f6" },
    ],
  },

  {
    n: 5,
    titulo: "La Dama Estrella",
    escena: {
      id: "dama", fondo: "noche",
      alt: "La Dama Estrella, la dama blanca con su corona de oro, brilla rodeada de estrellas y de ocho flechas que salen hacia todos los lados.",
      contenido: D.pieza("d", "b", 300, 272, 1.15) +
        [[0, -1], [1, -1], [1, 0], [1, 1], [-1, 1], [-1, 0], [-1, -1]].map(([dx, dy]) =>
          D.flecha(300 + dx * 85, 185 + dy * 70, 300 + dx * 175, 185 + dy * 130 * (dy < 0 ? 1 : 0.45), "#f59f00")).join("") +
        D.estrella(150, 60, 11) + D.estrella(460, 70, 9) + D.estrella(520, 200, 7),
    },
    cuento: [
      "La tercera noche, el tablero se iluminó: llegó la Dama Estrella.",
      "—Yo soy la pieza más poderosa del ajedrez —dijo con una sonrisa—. Puedo caminar derecho, como la torre, y también inclinado, como el alfil. ¡Hacia donde quiera y todas las casillas que quiera!",
      "Peonita la puso en el centro del tablero y empezó a contar las casillas adonde podía ir. Contó y contó… ¡veintisiete!",
      "—¡Eres la más fuerte! —aplaudió Tizón.",
      "—Por eso hay que cuidarme mucho —dijo la dama—. Si salgo muy temprano a pasear, las piezas del otro bando me persiguen y pierdo el tiempo escapando.",
      "Don Lento asintió desde su rama: —La dama es… como el postre: mejor al final… que al principio.",
    ],
    aprendi: [
      "La dama camina como la torre y como el alfil juntos.",
      "Es la pieza más poderosa del ajedrez.",
      "Hay que cuidarla: no conviene sacarla muy temprano.",
    ],
    muestras: [
      { fen: "8/8/8/8/3Q4/8/8/8 w - - 0 1", casilla: "d4", pie: "¡Desde el centro, la dama llega a 27 casillas!" },
    ],
    ejercicios: [
      { tipo: "contar", fen: "8/8/8/8/8/8/8/Q7 w - - 0 1", casilla: "a1", respuesta: 21 },
      { tipo: "comer", fen: "8/8/8/b7/8/8/3P4/3Q2n1 w - - 0 1", casilla: "d1", respuesta: "g1" },
    ],
  },

  {
    n: 6,
    titulo: "El Rey Sereno, paso a pasito",
    escena: {
      id: "rey", fondo: "dia",
      alt: "El Rey Sereno, el rey blanco con su corona y su cruz dorada, camina con pasos cortitos. Delante de él hay huellas pequeñas, una casilla a la vez.",
      contenido: D.pieza("r", "b", 220, 272, 1.15) +
        [0, 1, 2].map((i) => `<ellipse cx="${330 + i * 60}" cy="${280 - i * 4}" rx="14" ry="8" fill="#8d5524" opacity=".45"/>`).join("") +
        D.globo(300, 50, 220, ["Paso a pasito,", "¡pero con cuidado!"], [270, 130]),
    },
    cuento: [
      "La cuarta noche, todos hicieron silencio: venía el Rey Sereno.",
      "—Yo camino despacito —dijo el rey—: un solo paso, hacia el lado que quiera. Adelante, atrás, a los lados o inclinado. Pero solo una casilla a la vez.",
      "—¡Igual que Don Lento! —se rio Peonita.",
      "—El rey es la pieza más importante del juego —explicó Don Lento—. Si atrapan a tu rey, pierdes la partida. Por eso tiene una regla muy especial: nunca puede ir a una casilla donde lo puedan comer.",
      "—¿Y qué pasa si los dos reyes se encuentran? —preguntó Tizón.",
      "—Los reyes nunca se tocan —dijo el rey—. Siempre tiene que haber por lo menos una casilla entre los dos.",
    ],
    aprendi: [
      "El rey camina un solo paso, hacia cualquier lado.",
      "Nunca puede ir a una casilla donde lo puedan comer.",
      "Los dos reyes nunca pueden estar juntos.",
    ],
    muestras: [
      { fen: "8/8/8/8/3K4/8/8/8 w - - 0 1", casilla: "d4", pie: "El rey puede ir a las 8 casillas que lo rodean." },
    ],
    ejercicios: [
      { tipo: "contar", fen: "8/8/8/8/8/8/8/K7 w - - 0 1", casilla: "a1", respuesta: 3 },
      { tipo: "contar", fen: "8/8/8/3k4/8/3K4/8/8 w - - 0 1", casilla: "d3", respuesta: 5 },
      { tipo: "destinos", fen: "4r2k/8/8/8/3K4/8/8/8 w - - 0 1", casilla: "d4", respuesta: ["c3", "c4", "c5", "d3", "d5"] },
    ],
  },

  {
    n: 7,
    titulo: "Galope, el caballo saltarín",
    escena: {
      id: "caballo", fondo: "dia",
      alt: "Galope, el caballo blanco, salta por encima de un peón dibujando una L con una línea de puntos.",
      contenido: D.pieza("p", "n", 300, 272, 0.7, { bufanda: true, cara: "sorpresa" }) +
        D.pieza("c", "b", 140, 272, 1.05) +
        D.flecha(200, 120, 450, 210, "#e8590c", [330, 0]) + D.estrella(470, 236, 16),
    },
    cuento: [
      "La quinta noche se oyó un ¡tacatán, tacatán! Era Galope, el caballo, que llegó dando brincos.",
      "—¡Yo soy el único que salta! —relinchó—. Puedo pasar por encima de cualquier pieza, sea blanca o negra.",
      "—¿Y cómo caminas? —preguntó Peonita.",
      "—En forma de L: dos pasos derecho y uno de lado. ¡Tacatán, tacatán… y salto!",
      "Galope saltó por encima de Tizón, que ni se movió del susto. Peonita se dio cuenta de algo: si Galope empezaba en una casilla clara, caía siempre en una oscura, y si empezaba en una oscura, caía en una clara.",
      "—Por eso me gusta el centro del tablero —dijo Galope—. Desde allí tengo ocho casillas para saltar. Desde una esquina, solo dos. «Caballo en la orilla, caballo que se humilla».",
    ],
    aprendi: [
      "El caballo camina en L: dos pasos derecho y uno de lado.",
      "Es la única pieza que salta por encima de las demás.",
      "Siempre cambia de color de casilla, y en el centro es más fuerte.",
    ],
    muestras: [
      { fen: "8/8/8/8/3N4/8/8/8 w - - 0 1", casilla: "d4", pie: "Desde el centro, el caballo llega a 8 casillas." },
    ],
    ejercicios: [
      { tipo: "contar", fen: "8/8/8/8/8/8/8/N7 w - - 0 1", casilla: "a1", respuesta: 2 },
      { tipo: "comer", fen: "8/8/2rb4/8/3N4/2PPP3/8/8 w - - 0 1", casilla: "d4", respuesta: "c6" },
      { tipo: "saltos", fen: "8/8/8/8/8/8/8/6N1 w - - 0 1", casilla: "g1", meta: "f3", respuesta: 1 },
      { tipo: "saltos", fen: "8/8/8/8/8/8/8/N7 w - - 0 1", casilla: "a1", meta: "d4", respuesta: 2 },
    ],
  },

  {
    n: 8,
    titulo: "Peonita aprende a caminar",
    escena: {
      id: "peon", fondo: "dia",
      alt: "Peonita sube una escalera de casillas. Arriba, al final del camino, brilla una corona dorada: el sueño de Peonita de llegar al final del tablero.",
      contenido: [0, 1, 2, 3, 4].map((i) => `<rect x="${150 + i * 70}" y="${250 - i * 34}" width="70" height="${70 + i * 34}" fill="${i % 2 ? "#c79a6b" : "#f6e7c8"}" stroke="#6b4a2e" stroke-width="2"/>`).join("") +
        D.pieza("p", "b", 185, 252, 0.72, { mono: true }) + D.corona(465, 70, 1.4) +
        D.estrella(420, 40, 7) + D.estrella(520, 50, 9) + D.estrella(500, 105, 6),
    },
    cuento: [
      "La sexta noche, por fin, Don Lento le dijo a Peonita:",
      "—Hoy… te toca a ti.",
      "Peonita se puso muy nerviosa. Don Lento le explicó que los peones caminan siempre hacia adelante, una casilla a la vez, y nunca hacia atrás.",
      "—Pero en tu primera salida —agregó— puedes dar un paso largo: dos casillas de una vez, si las dos están libres.",
      "—¿Y cómo como? —preguntó Peonita.",
      "—Ahí está lo curioso: el peón camina derecho, pero come inclinado, una casilla hacia adelante en diagonal. Y si una pieza le tapa el camino de frente, se queda quieto.",
      "Peonita practicó toda la noche. Y entonces Don Lento le contó el secreto más bonito del ajedrez:",
      "—Si un peón camina, camina y llega hasta la última fila del tablero… se convierte en la pieza que quiera: dama, torre, alfil o caballo. Casi siempre elige ser dama.",
      "Esa noche, Peonita se durmió soñando con una corona.",
    ],
    aprendi: [
      "El peón camina hacia adelante, una casilla. En su primera salida puede avanzar dos.",
      "Nunca retrocede. Camina derecho, pero come en diagonal.",
      "Si llega a la última fila, se convierte en dama, torre, alfil o caballo: eso se llama coronar.",
    ],
    muestras: [
      { fen: "8/8/8/8/8/8/4P3/8 w - - 0 1", casilla: "e2", pie: "En su primera salida, el peón puede avanzar una o dos casillas." },
      { fen: "8/8/8/3pnb2/4P3/8/8/8 w - - 0 1", casilla: "e4", pie: "El caballo le tapa el camino, pero el peón puede comer en diagonal." },
    ],
    ejercicios: [
      { tipo: "destinos", fen: "8/8/8/8/8/8/3P4/8 w - - 0 1", casilla: "d2", respuesta: ["d3", "d4"] },
      { tipo: "destinos", fen: "8/8/8/8/3p4/3P4/8/8 w - - 0 1", casilla: "d3", respuesta: [] },
      { tipo: "destinos", fen: "8/8/8/2r1b3/3P4/8/8/8 w - - 0 1", casilla: "d4", respuesta: ["c5", "d5", "e5"] },
      { tipo: "corona", fen: "8/4P3/8/8/8/8/8/8 w - - 0 1", casilla: "e7", estrellas: ["e8"], respuesta: "En dama, torre, alfil o caballo. Casi siempre conviene la dama." },
    ],
  },

  {
    n: 9,
    titulo: "¿Cuánto vale cada amigo?",
    escena: {
      id: "valores", fondo: "feria",
      alt: "Una feria con un toldo rojo. Las piezas blancas en fila, cada una con una estrella encima que dice cuántos puntos vale: el peón 1, el caballo 3, el alfil 3, la torre 5 y la dama 9. Sobre la mesa hay mangos.",
      contenido: [["p", 1], ["c", 3], ["a", 3], ["t", 5], ["d", 9]].map(([t, v], i) =>
        D.pieza(t, "b", 110 + i * 95, 262, 0.62, t === "p" ? { mono: true } : {}) + D.estrella(110 + i * 95, 172, 22) +
        `<text x="${110 + i * 95}" y="${180}" text-anchor="middle" font-family="Quicksand, sans-serif" font-weight="700" font-size="20" fill="#5c3d00">${v}</text>`).join("") +
        D.mango(70, 112, 0.9) + D.mango(530, 112, 0.9) + D.mango(300, 108, 0.8),
    },
    cuento: [
      "El sábado, Don Lento llevó a todos a la feria del agricultor. Había mangos, piñas y papayas, y cada cosa tenía su precio.",
      "—En el ajedrez también —dijo Don Lento—, cada pieza vale una cantidad de puntos.",
      "Y fue señalando: el peón vale 1 punto; el caballo, 3; el alfil, 3; la torre, 5; y la dama, ¡9!",
      "—¿Y el rey? —preguntó Tizón.",
      "—El rey no tiene precio —dijo Don Lento—. Sin él, se acaba la partida.",
      "Galope, que es muy amigable, quiso cambiarse por un peón negro para jugar con él.",
      "—¡Mal negocio! —le dijo Peonita—. Tú vales 3 y el peón vale 1. Si te cambias, perdemos puntos.",
      "Desde ese día, antes de comer o de cambiar una pieza, Peonita contaba con los dedos quién ganaba más puntos.",
    ],
    aprendi: [
      "Peón 1, caballo 3, alfil 3, torre 5, dama 9.",
      "El rey no tiene precio: sin él se pierde la partida.",
      "Un cambio es bueno si recibes más puntos de los que das.",
    ],
    muestras: [],
    ejercicios: [
      { tipo: "puntos", grupos: [{ nombre: "Peonita", piezas: "TPP" }, { nombre: "Tizón", piezas: "CA" }], respuesta: "Peonita" },
      { tipo: "cambio", das: "C", recibes: "T", respuesta: "bueno" },
      { tipo: "cambio", das: "D", recibes: "T", respuesta: "malo" },
      { tipo: "suma", piezas: "PPPPPPPPCCAATTD", respuesta: 39 },
    ],
  },

  {
    n: 10,
    titulo: "¡Jaque!",
    escena: {
      id: "jaque", fondo: "dia",
      alt: "Una torre negra apunta al Rey Sereno, que pone cara de susto. Un globo dice: ¡Jaque!",
      contenido: D.pieza("t", "n", 440, 272, 0.95, { espejo: true }) + D.pieza("r", "b", 150, 272, 0.95, { cara: "sorpresa" }) +
        D.flecha(390, 200, 225, 200, "#e03131") + D.globo(330, 40, 140, "¡Jaque!", [420, 120], { color: "#c92a2a" }),
    },
    cuento: [
      "Una noche, Peonita y Tizón jugaban una partida. De pronto, la torre negra se puso en la misma columna que el Rey Sereno.",
      "—¡Jaque! —gritó Tizón.",
      "—¿Jaque? ¿Qué es eso? —preguntó Peonita.",
      "—Jaque quiere decir que el rey está amenazado —explicó Don Lento—: que una pieza del otro bando se lo podría comer. Cuando a tu rey le dan jaque, tienes que salvarlo enseguida.",
      "—¿Y cómo lo salvo?",
      "—Hay tres formas. Huir: mover el rey a una casilla segura. Tapar: poner una pieza en el medio, entre el rey y la pieza que lo ataca. Comer: comerte a la pieza que da el jaque.",
      "Peonita lo pensó despacito y movió el rey a un lado. El rey suspiró: —¡Gracias, Peonita!",
      "—Huir, tapar o comer —repitió Peonita—. ¡No se me va a olvidar!",
    ],
    aprendi: [
      "Jaque es cuando atacan al rey.",
      "Hay que salvarlo enseguida, de una de estas tres formas:",
      "huir con el rey, tapar el ataque o comer a la pieza que da jaque.",
    ],
    muestras: [],
    ejercicios: [
      { tipo: "jaque", fen: "4r1k1/8/8/8/8/8/8/4K3 w - - 0 1", respuesta: true, explica: "La torre negra está en la misma columna que el rey y no hay nada en el medio." },
      { tipo: "jaque", fen: "4r1k1/8/8/8/8/8/4P3/4K3 w - - 0 1", respuesta: false, explica: "El peón blanco tapa el camino de la torre." },
      { tipo: "jaque", fen: "6k1/8/8/8/1b6/8/8/4K3 w - - 0 1", respuesta: true, explica: "El alfil negro ataca al rey por la diagonal." },
      { tipo: "jaque", fen: "6k1/8/8/8/5n2/8/8/4K3 w - - 0 1", respuesta: false, explica: "El caballo negro salta en L, y desde f4 no llega a e1." },
      { tipo: "salida", fen: "4r1k1/8/8/8/8/8/8/4K3 w - - 0 1", respuesta: "huir", explica: "El rey se va a un lado: a d1, d2, f1 o f2. No hay nada para tapar ni para comer a la torre." },
      { tipo: "salida", fen: "4r1k1/8/8/8/8/8/3P1P2/3QKB2 w - - 0 1", respuesta: "tapar", explica: "El rey no tiene adónde ir. La dama o el alfil se ponen en e2, en el medio." },
      { tipo: "salida", fen: "6k1/8/8/8/8/3n4/3PPP2/3QKB2 w - - 0 1", respuesta: "comer", explica: "Al caballo no se le puede tapar porque salta, y el rey no tiene adónde ir. ¡El peón de e2 se come al caballo!" },
    ],
  },

  {
    n: 11,
    titulo: "Jaque mate: el final de la partida",
    escena: {
      id: "mate", fondo: "noche",
      alt: "El rey negro, rodeado por dos torres blancas, no tiene adónde ir. Peonita y Tizón miran juntos el tablero. Un globo dice: ¡Jaque mate!",
      contenido: D.pieza("r", "n", 300, 255, 0.9, { cara: "sorpresa" }) + D.pieza("t", "b", 175, 255, 0.75) + D.pieza("t", "b", 425, 255, 0.75, { espejo: true }) +
        D.pieza("p", "b", 90, 300, 0.55, { mono: true }) + D.pieza("p", "n", 510, 300, 0.55, { bufanda: true, espejo: true }) +
        D.globo(200, 30, 200, "¡Jaque mate!", [300, 110], { color: "#c92a2a" }),
    },
    cuento: [
      "Peonita y Tizón siguieron jugando. Las dos torres blancas, Doña Muralla y su hermana, empezaron a subir por el tablero, una al lado de la otra, como los escalones de una escalera.",
      "Una le daba jaque al rey negro, y el rey subía una fila. La otra le daba jaque otra vez, y el rey subía otra fila… ¡hasta que llegó a la orilla del tablero!",
      "—Jaque —dijo Peonita, con la última jugada.",
      "El rey negro miró a todos lados. No podía huir: todas las casillas estaban vigiladas. No podía tapar ni comer a la torre.",
      "—Eso es jaque mate —dijo Don Lento—. Cuando el rey está en jaque y no se puede salvar de ninguna forma, la partida se termina. Gana quien dio el mate.",
      "Tizón se quedó un ratito callado. Luego le dio la mano a Peonita.",
      "—¡Qué buena partida! —le dijo—. Pero la próxima te gano yo.",
    ],
    aprendi: [
      "Jaque mate es un jaque del que el rey no se puede salvar.",
      "Con el jaque mate se termina la partida: gana quien lo da.",
      "Las dos torres juntas, como una escalera, dan mate al rey en la orilla.",
    ],
    muestras: [
      { fen: "R6k/1R6/8/8/8/8/8/6K1 b - - 0 1", pie: "Mate de la escalera: la torre de arriba da jaque y la de abajo le tapa la salida al rey." },
    ],
    ejercicios: [
      { tipo: "mate", fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", respuesta: "Ta8" },
      { tipo: "mate", fen: "7k/R7/1R6/8/8/8/8/6K1 w - - 0 1", respuesta: "Tb8" },
      { tipo: "mate", fen: "7k/8/6K1/8/8/8/8/3Q4 w - - 0 1", respuesta: "Dd8" },
      { tipo: "mate", fen: "k7/8/K7/8/8/8/8/7R w - - 0 1", respuesta: "Th8" },
    ],
  },

  {
    n: 12,
    titulo: "Ahogado: cuando nadie gana",
    escena: {
      id: "ahogado", fondo: "dia",
      alt: "El rey negro, solito en una esquina, piensa con signos de pregunta alrededor. Un globo dice: No me puedo mover… ¡pero no estoy en jaque!",
      contenido: D.pieza("r", "n", 160, 272, 1, { cara: "pensando" }) + D.pieza("d", "b", 430, 272, 0.85, { cara: "sorpresa", espejo: true }) +
        [[95, 95], [235, 85], [175, 55]].map(([x, y]) => `<text x="${x}" y="${y}" font-family="Quicksand, sans-serif" font-weight="700" font-size="34" fill="#1971c2">?</text>`).join("") +
        D.globo(280, 34, 290, ["No me puedo mover…", "¡pero no estoy en jaque!"], [215, 140]),
    },
    cuento: [
      "En la revancha, Peonita llegó al final del tablero y se convirtió en dama. ¡Por fin tenía su corona!",
      "Con su nueva dama persiguió al rey negro hasta una esquina. Peonita estaba tan emocionada que movió muy rápido… y el rey negro se quedó sin ninguna casilla adonde ir. Pero no estaba en jaque.",
      "—Me toca mover —dijo Tizón—, y no puedo mover nada.",
      "—Eso se llama ahogado —explicó Don Lento—. Cuando al que le toca mover no tiene ninguna jugada permitida, pero su rey no está en jaque, la partida termina en tablas. Tablas quiere decir empate: nadie gana.",
      "—¡Ay, no! —dijo Peonita—. Yo tenía una dama de más.",
      "—Por eso hay que pensar despacito —dijo Don Lento—, aunque vayas ganando. Antes de cada jugada… pregúntate: ¿le dejé alguna casilla al rey?",
    ],
    aprendi: [
      "Ahogado es cuando al que le toca mover no tiene ninguna jugada, pero no está en jaque.",
      "Un ahogado es tablas: la partida termina en empate.",
      "Aunque vayas ganando, déjale siempre una casilla al rey hasta el mate.",
    ],
    muestras: [
      { fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", pie: "Le toca al rey negro y no tiene ninguna casilla adonde ir, pero no está en jaque: ¡ahogado!" },
    ],
    ejercicios: [
      { tipo: "final", fen: "k7/2Q5/1K6/8/8/8/8/8 b - - 0 1", respuesta: "ahogado", explica: "El rey negro no está en jaque, pero la dama y el rey blanco le vigilan a7, b7 y b8." },
      { tipo: "final", fen: "k7/1Q6/1K6/8/8/8/8/8 b - - 0 1", respuesta: "mate", explica: "La dama da jaque desde b7 y el rey negro no se la puede comer, porque el rey blanco la protege." },
      { tipo: "final", fen: "k7/8/1K6/8/8/8/8/2Q5 b - - 0 1", respuesta: "ninguno", explica: "El rey negro no está en jaque y todavía puede ir a b8." },
    ],
  },

  {
    n: 13,
    titulo: "Dos secretos del reino",
    escena: {
      id: "enroque", fondo: "noche",
      alt: "El rey blanco y la torre blanca cambian de lugar dando un salto, con dos flechas curvas que se cruzan: es el enroque.",
      contenido: D.pieza("r", "b", 200, 272, 0.95) + D.pieza("t", "b", 420, 272, 0.95, { espejo: true }) +
        D.flecha(230, 120, 350, 120, "#f59f00", [290, 40]) + D.flecha(400, 150, 280, 160, "#74c0fc", [340, 230]),
    },
    cuento: [
      "La última noche antes del gran torneo, Don Lento reunió a todos en voz baja.",
      "—Les voy a contar… dos secretos del reino.",
      "—El primero se llama enroque. Es la única jugada en la que se mueven dos piezas a la vez: el rey camina dos casillas hacia una de sus torres, y la torre salta por encima del rey y se pone a su lado. Así el rey queda protegido en una esquina, como en su casita.",
      "—¿Y se puede hacer siempre? —preguntó Peonita.",
      "—No. Solo si el rey y esa torre todavía no se han movido, si no hay ninguna pieza entre los dos, si el rey no está en jaque y si no tiene que pasar por una casilla atacada.",
      "—El segundo secreto es de los peones —siguió Don Lento, guiñándole un ojo a Peonita—. Se llama captura al paso. Si un peón avanza dos casillas en su primera salida y queda justo al lado de un peón del otro bando, ese peón se lo puede comer como si hubiera avanzado una sola. Pero solo en la jugada siguiente: después, ya no.",
      "Peonita y Tizón se miraron con los ojos muy abiertos. ¡Ahora sí sabían todos los secretos!",
    ],
    aprendi: [
      "En el enroque, el rey camina dos casillas hacia la torre y la torre salta a su lado.",
      "Solo se puede si el rey y la torre no se movieron, el camino está libre y el rey no pasa por jaque.",
      "La captura al paso: un peón que avanza dos casillas se puede comer como si hubiera avanzado una.",
    ],
    muestras: [
      { fen: "4k3/8/8/8/8/8/8/4K2R w K - 0 1", pie: "Antes del enroque…" },
      { fen: "4k3/8/8/8/8/8/8/5RK1 b - - 1 1", desde: { fen: "4k3/8/8/8/8/8/8/4K2R w K - 0 1", jugada: "O-O" }, pie: "…y después: el rey en g1 y la torre en f1." },
      { fen: "8/8/8/3pP3/8/8/8/8 w - d6 0 1", casilla: "e5", pie: "El peón negro acaba de avanzar dos casillas: el peón blanco lo puede comer al paso, yendo a d6." },
    ],
    ejercicios: [
      { tipo: "enroque", fen: "4k3/8/8/8/8/8/8/4K2R w K - 0 1", respuesta: true, explica: "El rey y la torre no se han movido y el camino está libre." },
      { tipo: "enroque", fen: "4k3/8/8/8/8/8/8/4KB1R w K - 0 1", respuesta: false, explica: "El alfil blanco está en el medio, entre el rey y la torre." },
      { tipo: "enroque", fen: "4k3/8/8/8/2b5/8/8/4K2R w K - 0 1", respuesta: false, explica: "El alfil negro vigila f1, y el rey no puede pasar por una casilla atacada." },
      { tipo: "enroque", fen: "4r1k1/8/8/8/8/8/8/4K2R w K - 0 1", respuesta: false, explica: "El rey está en jaque, y en jaque no se puede enrocar." },
    ],
  },

  {
    n: 14,
    titulo: "Los tres consejos de Don Lento",
    escena: {
      id: "consejos", fondo: "dia",
      alt: "Don Lento, colgado del guarumo, levanta tres dedos. A su lado hay tres carteles con los números 1, 2 y 3.",
      contenido: D.guarumo(120, 250, 0.9) + D.perezoso(150, 74, 0.7) +
        [1, 2, 3].map((n, i) => `<g transform="translate(${300 + i * 95},${170 - (i % 2) * 20})"><rect x="-34" y="-36" width="68" height="64" rx="12" fill="#fff" stroke="#5b4636" stroke-width="3"/><path d="M0,28 V90" stroke="#8d5524" stroke-width="7"/><text x="0" y="12" text-anchor="middle" font-family="Quicksand, sans-serif" font-weight="700" font-size="40" fill="${["#e03131", "#1971c2", "#2b8a3e"][i]}">${n}</text></g>`).join(""),
    },
    cuento: [
      "La mañana del torneo, Don Lento bajó un poquito de su rama —solo un poquito, porque es muy lento— y les dio tres consejos para empezar bien una partida.",
      "—Uno: mueve los peones del centro. Los peones de la mitad del tablero abren camino a las demás piezas.",
      "—Dos: saca pronto los caballos y los alfiles. Cada pieza que se queda en su casilla del principio es una amiga que no está jugando.",
      "—Tres: enroca temprano. El rey está más seguro en su casita de la esquina que en el medio del tablero.",
      "Peonita levantó la mano: —¿Y algo más?",
      "—Sí, lo más importante de todo —dijo Don Lento, muy, muy despacio—. Antes de mover… piensa: ¿qué quiere hacer mi amigo con su última jugada? A veces, el que gana no es el más rápido… sino el que piensa con calma.",
    ],
    aprendi: [
      "1. Mueve los peones del centro.",
      "2. Saca pronto los caballos y los alfiles.",
      "3. Enroca temprano. Y antes de mover, piensa: ¿qué quiere hacer el otro?",
    ],
    muestras: [
      { fen: "r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQ1RK1 w - - 1 6", desde: { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", jugadas: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O", "Nf6", "c3", "O-O"] }, pie: "Así se ve un buen comienzo: peones en el centro, caballos y alfiles afuera y los dos reyes enrocados." },
    ],
    ejercicios: [
      { tipo: "partida", pregunta: "Juega una partida con alguien de tu familia o de tu escuela. Marca cada consejo que cumpliste:" },
    ],
  },

  {
    n: 15,
    titulo: "El gran torneo de la escuela",
    escena: {
      id: "torneo", fondo: "dia",
      alt: "Peonita y Tizón, uno al lado del otro, sonríen con un trofeo dorado entre los dos. Hay confeti de colores y un corazón.",
      contenido: D.confeti(11, 46, 600, 320) + D.pieza("p", "b", 200, 285, 1.05, { mono: true }) + D.pieza("p", "n", 400, 285, 1.05, { bufanda: true, espejo: true }) +
        D.trofeo(300, 270, 1.6) + D.corazon(300, 70, 1.4),
    },
    cuento: [
      "El día del torneo, el aula se llenó de niñas y niños con sus tableros. Las piezas, desde la caja, estaban felices: por fin iban a jugar de verdad.",
      "Antes de empezar, Don Lento les recordó las reglas del buen jugador:",
      "—Al empezar y al terminar, se da la mano. Pieza que tocas, pieza que mueves: por eso se piensa antes de tocar. Durante la partida, silencio: el otro también está pensando. Y al final, ganes o pierdas, se dice «buena partida».",
      "Peonita jugó con todo su corazón. Ganó dos partidas, empató una y perdió otra. En la que perdió, se le salió una lagrimita, pero se acordó de Don Lento: le dio la mano a su rival y le dijo «buena partida». Después, juntas, buscaron en qué se había equivocado.",
      "Al final de la tarde, Tizón levantó el trofeo del primer lugar… ¡y lo compartió con Peonita!",
      "—Sin ti, no habría aprendido nada —le dijo.",
      "Esa noche, en la caja, todos dormían. Solo Peonita seguía despierta, mirando la luna por la ventana.",
      "—Don Lento —susurró—, ¿mañana jugamos otra vez?",
      "Y desde el guarumo, muy despacito, se oyó:",
      "—Mañana… y todos los días.",
    ],
    aprendi: [
      "Al empezar y al terminar la partida, se da la mano.",
      "Pieza tocada, pieza movida. Durante la partida, silencio.",
      "Se gana sin burlarse y se pierde aprendiendo: «¡buena partida!».",
    ],
    muestras: [],
    ejercicios: [
      { tipo: "promesas", pregunta: "Mis promesas de buen jugador. Léelas con alguien de tu casa y marca las que prometes cumplir." },
    ],
  },
];

const PROMESAS = [
  "Doy la mano al empezar y al terminar la partida.",
  "Pienso antes de tocar una pieza: pieza tocada, pieza movida.",
  "Hago silencio para que mi rival también pueda pensar.",
  "Si gano, no me burlo. Si pierdo, digo «buena partida».",
  "Después de jugar, busco en qué me equivoqué para aprender.",
  "Me divierto: ¡el ajedrez es un juego!",
];

const CONSEJOS_PARTIDA = [
  "Moví los peones del centro.",
  "Saqué los caballos y los alfiles.",
  "Enroqué.",
  "Antes de cada jugada, pensé qué quería hacer el otro.",
  "Al final di la mano y dije «buena partida».",
];

const FINAL_TITULO = "¡Ya sabes jugar ajedrez!";
const ESCENA_FINAL = {
  id: "final", fondo: "noche",
  alt: "Todos celebran juntos bajo la luna: Peonita, Tizón, el rey, la dama, la torre, el alfil y el caballo, con confeti de colores. Don Lento sonríe desde su rama.",
  contenido: D.confeti(5, 50, 600, 320) + D.perezoso(500, 40, 0.5) +
    [["t", "b"], ["c", "n"], ["r", "b"], ["d", "n"], ["a", "b"]].map(([t, col], i) => D.pieza(t, col, 70 + i * 82, 225, 0.55, { espejo: i > 2 })).join("") +
    D.pieza("p", "b", 230, 300, 0.8, { mono: true }) + D.pieza("p", "n", 360, 300, 0.8, { bufanda: true, espejo: true }) + D.corazon(295, 205, 1.1),
};
const ESCENA_DIPLOMA = {
  id: "diploma", fondo: "dia",
  alt: "Peonita y Don Lento felicitan a quien recibe el diploma.",
  contenido: D.perezoso(470, 40, 0.55) + D.pieza("p", "b", 150, 290, 1, { mono: true }) + D.trofeo(300, 280, 1.4) +
    D.estrella(240, 90, 12) + D.estrella(360, 70, 9) + D.estrella(300, 120, 7),
};
const DIPLOMA = {
  titulo: "Diploma de ajedrez",
  sub: "El reino de las 64 casillas reconoce a",
  firma: "Peonita y Don Lento",
  firmaMano: "Peonita ♥ Don Lento",
  texto: ["porque aprendió a mover todas las piezas, a dar jaque mate", "y a jugar con la cabeza y con el corazón."],
};

const FINAL = [
  "¡Felicidades! Llegaste al final del libro. Ahora sabes cómo se mueve cada pieza, qué es el jaque, el jaque mate y el ahogado, y conoces los secretos del enroque y de la captura al paso.",
  "Lo más importante ya lo sabes también: el ajedrez se juega con la cabeza y con el corazón. Juega mucho, piensa despacito como Don Lento y comparte con tus amigos lo que aprendiste, como Peonita y Tizón.",
];

module.exports = {
  SLUG, CLAVE, AUTOR, TITULO, TITULO_PDF, SUBTITULO, ASUNTO, TAPA, FINAL_TITULO, ESCENA_FINAL, ESCENA_DIPLOMA, DIPLOMA,
  VALOR, NOMBRE, PRESENTACION, NOTA_ADULTOS, SECRETO, SECRETOS, NOMBRE_ALFIL, DEDICATORIA, CAPITULOS, PROMESAS, CONSEJOS_PARTIDA, FINAL,
};
