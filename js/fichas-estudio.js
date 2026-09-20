/**
 * Ajedrez Integral — banco de FICHAS de estudio.
 *
 * Una ficha es un mapa de una sola pantalla: la idea principal arriba, cuatro
 * bloques alrededor y, abajo, la posición que la explica. Sirve para repasar
 * antes de jugar y para imprimir y pegarla en el cuaderno — no es un ejercicio
 * con solución (eso es entreno/temas.html) ni una línea para memorizar jugando
 * (eso es entreno/aperturas.html).
 *
 * Campos de cada ficha:
 *   id         identificador estable. NO se cambia: es lo que viaja en la
 *              dirección (fichas.html?ficha=<id>) y lo que se comparte.
 *   categoria  "apertura", "defensa", "tactica" o "concepto". Decide en qué
 *              pestaña sale y con qué títulos se pintan los cinco bloques
 *              (ver TITULOS más abajo).
 *   titulo     cómo se llama, en español de acá.
 *   subtitulo  el otro nombre con el que se la va a encontrar, o de qué va.
 *   nivel      1 principiante, 2 intermedio, 3 avanzado.
 *   pieza      la pieza del nodo del centro: "p","n","b","r","q","k".
 *   resumen    una frase, la que se lee en la lista.
 *   centro     los renglones del bloque "Idea principal".
 *   bloques    EXACTAMENTE cuatro listas de renglones, en el orden en que se
 *              pintan alrededor: izquierda arriba, derecha arriba, izquierda
 *              abajo, derecha abajo.
 *   comprueba  qué tiene que cumplirse en el tablero para que la ficha diga la
 *              verdad (jaque, mate, que la pieza clavada no se pueda mover, que
 *              el peón esté pasado…). Lo corre herramientas/verificar-fichas.js
 *              con chess.js: el motivo se comprueba, no se declara.
 *   diagrama   qué se ve en la posición, en una frase. Va como pie del
 *              diagrama: el tablero es decorativo, así que esto es lo que oye
 *              quien no lo puede ver (además de la posición pieza por pieza,
 *              que la cuenta BlindNotation).
 *
 * De dónde sale la posición — una de estas tres, nunca dos a la vez:
 *   lineaId    el id de una línea de js/aperturas-lineas.js. Las jugadas NO se
 *              copian acá: se leen de ese banco, que es el único lugar donde
 *              viven. Corregir una jugada allá corrige la ficha sola.
 *   jugadas    la línea propia, desde la posición inicial, en notación inglesa
 *              (SAN de chess.js). La página la traduce a C, A, T, D, R.
 *   fen        una posición de estudio, para lo que no sale de una apertura
 *              (un final, un motivo táctico). Puede traer `linea`: las jugadas
 *              que siguen desde ahí.
 *
 * LAS POSICIONES NO SE INVENTAN: las de apertura salen de jugar la línea desde
 * el principio, y las de estudio están comprobadas con chess.js —que la FEN
 * cargue, que la posición sea legal, que cada jugada exista y que el mate
 * prometido sea mate—. Una FEN mal escrita no da ningún error en pantalla:
 * dibuja un tablero cualquiera y la ficha sigue viéndose bien.
 *
 * Cuando una ficha dice «el tema X», ese X va escrito tal como está en
 * entreno/data/temas.json y el verificador comprueba que exista: mandar a un
 * alumno a buscar un tema que no está no da ningún error —lo busca, no lo
 * encuentra y se queda pensando que se equivocó él—.
 *
 * AL TOCAR ESTE ARCHIVO, CORRER herramientas/verificar-fichas.js.
 */
(function () {
  "use strict";

  // Los cinco bloques siempre están, y en el mismo lugar de la pantalla: así
  // dos fichas distintas se leen igual y el ojo ya sabe dónde buscar cada cosa.
  var TITULOS = {
    apertura: ["Idea principal", "Planes", "Ideas tácticas", "Medio juego", "Final"],
    defensa: ["Idea principal", "Planes", "Ideas tácticas", "Medio juego", "Final"],
    tactica: ["Idea principal", "Cómo se reconoce", "Quién la hace", "Errores frecuentes", "Cómo practicarla"],
    concepto: ["Idea principal", "Cuándo aparece", "Qué hacer", "Errores frecuentes", "En el final"],
  };

  var CATEGORIAS = [
    { id: "apertura", etiqueta: "Aperturas", sub: "juegas con blancas" },
    { id: "defensa", etiqueta: "Defensas", sub: "juegas con negras" },
    { id: "tactica", etiqueta: "Táctica", sub: "los motivos que se repiten" },
    { id: "concepto", etiqueta: "Conceptos", sub: "lo que decide la partida" },
  ];

  var FICHAS = [
    // ============================ APERTURAS ============================
    {
      id: "italiana",
      categoria: "apertura",
      titulo: "Apertura italiana",
      subtitulo: "Juego piano",
      nivel: 1,
      pieza: "b",
      lineaId: "italiana-giuoco",
      resumen: "Las dos piezas menores salen apuntando a f7 y el rey se pone a salvo temprano.",
      diagrama: "Las blancas armaron el centro grande con peones en d4 y e4, y el alfil negro contesta desde b4 dando jaque.",
      centro: [
        "Desarrollo rápido: caballo, alfil y enroque en las primeras cinco jugadas",
        "El alfil de c4 apunta a f7, la casilla más débil del rival",
        "Se pelea el centro con piezas antes que con peones",
      ],
      bloques: [
        [
          "Caballo a f3 y alfil a c4, en ese orden",
          "Enroque corto antes de abrir nada",
          "c3 y d4 para armar el centro grande",
          "Conectar las torres por la primera fila",
        ],
        [
          "Mate del pastor si el rival se descuida con f7",
          "El clavado Ag5 sobre el caballo de f6",
          "Cg5 saltando sobre f7 cuando queda flojo",
          "Golpe d5 abriendo la diagonal del alfil",
        ],
        [
          "Si el centro se cierra, el juego se va al flanco de rey",
          "La torre de f1 apoya el avance f4 en los planes de ataque",
          "Cambiar el alfil malo antes de encerrarlo detrás de sus peones",
        ],
        [
          "Estructura pareja: suele decidir quién tiene el mejor alfil",
          "Con peones en los dos flancos, el par de alfiles vale más",
          "Rey al centro apenas se cambian las damas",
        ],
      ],
    },
    {
      id: "espanola",
      categoria: "apertura",
      titulo: "Apertura española",
      subtitulo: "Ruy López",
      nivel: 2,
      pieza: "b",
      lineaId: "espanola-cerrada",
      resumen: "Se presiona el caballo que defiende e5 y se arma un centro grande sin apuro.",
      diagrama: "Los dos bandos ya enrocaron: el alfil blanco terminó en b3 después de a6 y b5, y el negro sostiene su peón de e5 con d6.",
      centro: [
        "El alfil de b5 pelea contra el defensor de e5, que es el caballo de c6",
        "No se gana un peón: se gana presión, que dura toda la partida",
        "Es la apertura más jugada de la historia justamente porque no se resuelve rápido",
      ],
      bloques: [
        [
          "Aa4, c3 y d4 para montar el centro con calma",
          "Torre a e1 sosteniendo el peón de e4",
          "h3 antes de d4, para que el alfil negro no clave en g4",
          "Maniobra Cb1-d2-f1-g3, el caballo que viaja al flanco de rey",
        ],
        [
          "Golpe Axc6 cuando el peón de e5 queda sin defensa suficiente",
          "La horquilla d5 contra un alfil y un caballo mal puestos",
          "Presión en la columna e, que se abre tarde pero se abre",
        ],
        [
          "El negro cierra con d6 y c5, y el juego se decide en el flanco de rey",
          "Las piezas blancas van todas hacia el rey; las negras contragolpean en el ala de dama",
          "Paciencia: acá se maniobra más de lo que se ataca",
        ],
        [
          "El cambio en c6 deja peones doblados: mejor estructura para el blanco",
          "Mayoría de peones en el ala de rey contra el par de alfiles",
          "Final de torres, el más común de todos los que salen de acá",
        ],
      ],
    },
    {
      id: "gambito-de-dama",
      categoria: "apertura",
      titulo: "Gambito de dama",
      subtitulo: "Declinado, d4 d5 c4",
      nivel: 2,
      pieza: "q",
      lineaId: "gambito-dama-declinado",
      resumen: "Se ofrece un peón de flanco para conseguir a cambio todo el centro.",
      diagrama: "Peones enfrentados en d4 y d5 con el de c4 ofreciéndose; el alfil blanco de g5 presiona el caballo de f6, al que el negro acaba de preguntarle con h6.",
      centro: [
        "No es un gambito de verdad: el peón de c4 se recupera casi siempre",
        "Se cambia un peón de flanco por un peón de centro, que vale más",
        "Quien controla d5 dirige la partida",
      ],
      bloques: [
        [
          "Cc3 y Ag5 presionando el caballo que defiende d5",
          "e3 para sacar el alfil de f1 sin encerrar nada",
          "La minoría de peones: a4 y b4-b5 rompiendo en el ala de dama",
          "Torre a c1, que es la columna que se va a abrir",
        ],
        [
          "El clavado Ag5 sobre f6, que deja d5 sin uno de sus defensores",
          "Cxd5 aprovechando ese clavado",
          "El alfil de d3 apuntando a h7 cuando el negro enroca",
        ],
        [
          "Estructura Carlsbad: peones blancos en el ala de dama contra peones negros en el ala de rey",
          "El blanco rompe con b4-b5, el negro con e5 o f5",
          "El alfil de c8 del negro es su pieza problema: hay que sacarlo",
        ],
        [
          "El peón de c6 debilitado por el avance de la minoría es el objetivo de siempre",
          "Final de torres en la columna c abierta",
          "Una mayoría central sana gana la carrera de peones",
        ],
      ],
    },
    {
      id: "inglesa",
      categoria: "apertura",
      titulo: "Apertura inglesa",
      subtitulo: "1.c4",
      nivel: 2,
      pieza: "p",
      lineaId: "inglesa",
      resumen: "Se ataca el centro desde el costado y se decide la estructura después, viendo qué hace el rival.",
      diagrama: "El peón de c4 ya se cambió por el de d5 y el caballo negro ocupó esa casilla; el blanco jugó g3 para sacar su alfil a la diagonal larga.",
      centro: [
        "El centro se controla a distancia, con piezas y con el peón de c4",
        "Es la siciliana con un tiempo de más y los colores cambiados",
        "Se elige la estructura tarde: la apertura se adapta a lo que arma el rival",
      ],
      bloques: [
        [
          "g3 y Ag2: el alfil en la diagonal larga es el alma de la apertura",
          "Cc3 y Cf3 peleando d5 y e5",
          "Enroque corto y después d3 o d4, según haga falta",
          "Torre a c1 y presión en la columna semiabierta",
        ],
        [
          "Golpe cxd5 abriendo la columna c",
          "Cxd5 aprovechando que el caballo de c3 y el alfil de g2 miran la misma casilla",
          "El alfil de g2 pega de lejos: las combinaciones salen en la diagonal larga",
        ],
        [
          "Si transpone a estructuras de gambito de dama, se juega con esas ideas",
          "Con peones en c4 y e4 el juego se parece a una siciliana al revés",
          "El caballo de c3 se cambia seguido: cuidado con los peones doblados",
        ],
        [
          "El alfil de g2 sigue siendo la mejor pieza cuando quedan pocas",
          "Mayoría en el ala de dama, que es donde este peón de c4 quiere llegar",
          "Finales tranquilos: es una apertura de quien juega a ganar sin arriesgar",
        ],
      ],
    },
    {
      id: "londres",
      categoria: "apertura",
      titulo: "Sistema Londres",
      subtitulo: "d4 y Af4, casi contra todo",
      nivel: 1,
      pieza: "b",
      lineaId: "sistema-londres",
      resumen: "Las mismas cinco jugadas contra casi cualquier respuesta: se aprende una vez y se usa siempre.",
      diagrama: "El alfil blanco salió a f4 antes de cerrar con e3, y el negro ya lo enfrentó con su alfil en d6 y el golpe c5.",
      centro: [
        "El alfil sale a f4 ANTES de jugar e3: si no, queda encerrado atrás",
        "Es un sistema, no una línea: casi no hay que memorizar variantes",
        "Poca teoría y posiciones sanas, para concentrarse en el medio juego",
      ],
      bloques: [
        [
          "Af4, e3, Cf3, Ad3 y c3: siempre en ese orden",
          "Cbd2 y después Ce5, el caballo fuerte del sistema",
          "Enroque corto y torre a e1",
          "El avance h4 cuando el rival enroca corto",
        ],
        [
          "La batería dama y alfil contra h7",
          "Ce5 apoyado por f4, que muerde en la casilla f7",
          "Axc7 robando un peón cuando la dama negra se aleja",
        ],
        [
          "Ataque lento al rey enrocado, con las piezas ya puestas",
          "Si el negro juega c5, hay que decidir: cambiar, avanzar o sostener con c3",
          "El alfil de f4 no se cambia por nada: es la pieza del sistema",
        ],
        [
          "Estructura simétrica: decide quién tiene el alfil bueno",
          "Mayoría en el ala de dama después de cambiar en c5",
          "Final de alfiles de distinto color, que salva muchas partidas peores",
        ],
      ],
    },
    {
      id: "escocesa",
      categoria: "apertura",
      titulo: "Apertura escocesa",
      subtitulo: "e4 e5 Cf3 Cc6 d4",
      nivel: 1,
      pieza: "n",
      lineaId: "escocesa",
      resumen: "Se abre el centro de una, en la jugada tres, y las piezas salen todas a jugar.",
      diagrama: "El centro ya se abrió: el caballo blanco recuperó en d4, el alfil negro se plantó en c5 y su dama salió a f6 a pelear la casilla.",
      centro: [
        "d4 en la tercera jugada: el centro se abre antes de que nadie se acomode",
        "Piezas activas desde el principio, sin maniobras largas",
        "Menos teoría que la española y el mismo tipo de posición abierta",
      ],
      bloques: [
        [
          "Recuperar en d4 con el caballo y sostenerlo con Ae3 o c3",
          "Enroque corto rápido",
          "Cxc6 cambiando para darle al negro peones doblados",
          "Presión en la columna d, que quedó semiabierta",
        ],
        [
          "El golpe Cd5 contra un alfil clavado",
          "La horquilla Cb5 contra c7",
          "Jaques de la dama por la diagonal que abre e5",
        ],
        [
          "Centro abierto: gana quien tiene más piezas listas, no quien tiene más peones",
          "El rey se pone a salvo temprano o no llega al medio juego",
          "El alfil de c5 negro es una pieza incómoda: hay que echarlo con c3 y d4",
        ],
        [
          "Peones doblados en c6 contra el par de alfiles: un trato clásico",
          "Mayorías separadas, cada uno con su peón pasado",
          "Finales de piezas menores, donde la estructura pesa más que la actividad",
        ],
      ],
    },

    // ============================ DEFENSAS ============================
    {
      id: "siciliana",
      categoria: "defensa",
      titulo: "Defensa siciliana",
      subtitulo: "Najdorf",
      nivel: 3,
      pieza: "p",
      lineaId: "siciliana-najdorf",
      resumen: "El negro no copia: cambia un peón de flanco por uno de centro y juega por ganar.",
      diagrama: "El negro cambió su peón de c por el de d del blanco; con a6 le quita b5 a las piezas blancas y su caballo de f6 le pega a e4.",
      centro: [
        "Se cambia el peón de c por el de d: peón de flanco por peón de centro",
        "La columna c semiabierta es del negro, y por ahí entra su contrajuego",
        "No busca igualar: busca desequilibrio para jugar a ganar con negras",
      ],
      bloques: [
        [
          "a6 quitándole b5 al caballo y al alfil blancos",
          "Torre a c8 y presión contra el caballo de c3",
          "e5 o e6, que es la decisión que define toda la partida",
          "Contragolpe b5-b4 en el ala de dama",
        ],
        [
          "El sacrificio Txc3 rompiendo la estructura del rival",
          "Cxe4 aprovechando el clavado sobre c3",
          "d5 de un golpe, liberando todo el centro",
        ],
        [
          "Ataques en alas opuestas: el blanco al rey, el negro al ala de dama",
          "Cuenta los tiempos, no las piezas: gana quien llega un movimiento antes",
          "El caballo de d7 quiere ir a c5 o e5, no quedarse mirando",
        ],
        [
          "La mayoría del negro en el ala de dama es su carta para el final",
          "El peón de d6 atrasado es su debilidad si el juego se calma",
          "Final de torres en la columna c, el más frecuente",
        ],
      ],
    },
    {
      id: "francesa",
      categoria: "defensa",
      titulo: "Defensa francesa",
      subtitulo: "Variante del avance",
      nivel: 2,
      pieza: "p",
      lineaId: "francesa-avance",
      resumen: "Un centro sólido desde la jugada uno, a cambio de encerrar un alfil y tener que liberarlo.",
      diagrama: "La cadena blanca va de d4 a e5 y el negro ya le está pegando a la base con c5, el caballo en c6 y la dama en b6.",
      centro: [
        "e6 y d5 arman un muro de peones que no se rompe fácil",
        "El precio es el alfil de c8, encerrado detrás de sus propios peones",
        "La cadena de peones se ataca por la base: por eso c5, siempre",
      ],
      bloques: [
        [
          "c5 y Cc6 golpeando d4, que es la base de la cadena",
          "Db6 sumando presión sobre el mismo peón",
          "f6 abriendo la segunda brecha cuando el centro ya cruje",
          "Sacar el alfil malo por d7-b5 o por a6",
        ],
        [
          "El golpe cxd4 en el momento justo, no antes",
          "La horquilla Cb4 contra c2 cuando la casilla queda floja",
          "Presión de la dama y el caballo contra d4 y b2 al mismo tiempo",
        ],
        [
          "El blanco ataca al rey; el negro come en el centro y en el ala de dama",
          "El espacio es del blanco: el negro necesita cambios para respirar",
          "Cambiar el alfil bueno del rival, no el propio alfil malo",
        ],
        [
          "El peón de e5 blanco, sin piezas que lo sostengan, se cae",
          "Finales buenos para el negro: su estructura es más sana",
          "El alfil malo del negro se vuelve bueno apenas se abre el centro",
        ],
      ],
    },
    {
      id: "caro-kann",
      categoria: "defensa",
      titulo: "Defensa Caro-Kann",
      subtitulo: "Variante clásica",
      nivel: 2,
      pieza: "b",
      lineaId: "caro-kann-clasica",
      resumen: "La solidez de la francesa, pero sacando el alfil de casillas claras antes de encerrarlo.",
      diagrama: "El negro sacó su alfil de casillas claras antes de cerrar con e6; echado por Cg3 y h4, el alfil se acomodó en g6 y el negro le hizo aire con h6.",
      centro: [
        "c6 sostiene d5 sin encerrar a nadie",
        "El alfil de c8 sale a f5 PRIMERO, y recién después se juega e6",
        "Es la defensa de quien quiere una estructura sana y un final cómodo",
      ],
      bloques: [
        [
          "dxe4 y Af5 en ese orden: el orden es la defensa entera",
          "e6, Cd7 y Cgf6 completando el desarrollo",
          "Enroque corto o largo, según dónde ataque el blanco",
          "c5 rompiendo el centro cuando todo está sacado",
        ],
        [
          "Db6 y Da5 pegándole a b2 y a d2 desde lejos",
          "El caballo de d7 saltando a c5 o e5 con tiempo",
          "Cambios en e4 que dejan al blanco con un peón de h débil",
        ],
        [
          "El blanco tiene más espacio y va con h4-h5 contra el alfil de f5",
          "El negro aguanta, cambia piezas y espera el final",
          "Nunca dejar el alfil de f5 sin casilla de retirada",
        ],
        [
          "Estructura sana contra estructura sana: decide la actividad del rey",
          "El peón de más en el ala de dama del negro, cuando el blanco dobla en h",
          "Finales de torres tablas con buena técnica, que es justo lo que busca esta defensa",
        ],
      ],
    },
    {
      id: "india-de-rey",
      categoria: "defensa",
      titulo: "Defensa india de rey",
      subtitulo: "El fianchetto y el contragolpe",
      nivel: 3,
      pieza: "b",
      lineaId: "india-de-rey",
      resumen: "Se le regala el centro al rival para después atacarlo entero, y de paso ir por su rey.",
      diagrama: "El blanco armó el centro grande con c4, d4 y e4; el negro enrocó detrás de su alfil de g7 y ya golpeó con e5.",
      centro: [
        "Se deja que el blanco arme el centro grande, a propósito",
        "El alfil de g7 es la pieza de la defensa: no se cambia nunca",
        "El contragolpe llega con e5 o con c5, no antes de enrocar",
      ],
      bloques: [
        [
          "Cf6, g6, Ag7 y enroque: el orden no cambia",
          "d6 y después e5, la ruptura clásica",
          "f5 y f4 marchando contra el rey blanco",
          "Caballo a f6-e8-d6 o a h5, para dejar pasar el peón de f",
        ],
        [
          "El alfil de g7 apuntando a b2 apenas se abre la diagonal",
          "El sacrificio en f4 o en h3 cuando el ataque llega",
          "Cxe4 cuando el centro blanco se queda sin defensores",
        ],
        [
          "Ataques en alas opuestas: el negro va al rey, el blanco al ala de dama",
          "Si el centro se cierra, el juego es una carrera de peones y gana el más rápido",
          "Cambiar piezas favorece al blanco: el negro necesita las suyas para atacar",
        ],
        [
          "El centro de peones blanco vale mucho en el final: el negro no quiere llegar ahí",
          "El alfil de g7 sin peones que lo tapen es una pieza enorme",
          "Peón pasado en el ala de dama para el blanco: hay que pararlo antes",
        ],
      ],
    },
    {
      id: "escandinava",
      categoria: "defensa",
      titulo: "Defensa escandinava",
      subtitulo: "e4 d5",
      nivel: 1,
      pieza: "q",
      lineaId: "escandinava",
      resumen: "Se cambia el centro en la jugada uno: no hay teoría larga que aprender.",
      diagrama: "El negro recuperó con la dama y, echado por el caballo de c3, la puso en a5; su alfil ya salió a f5 y su caballo a f6.",
      centro: [
        "El peón de e4 se cambia de una: el centro queda resuelto en dos jugadas",
        "La dama sale temprano, pero a una casilla donde no la echan con tiempo",
        "Poquísima teoría: perfecta para quien empieza a jugar con negras",
      ],
      bloques: [
        [
          "Dama a a5 o a d6, nunca de vuelta a d8",
          "Cf6, Af5 o Ag4 y e6, con el alfil fuera antes de cerrar",
          "Enroque largo en las líneas agudas, corto en las tranquilas",
          "c6 dándole casa a la dama y sosteniendo d5",
        ],
        [
          "Ce4 con la dama en a5, atacando dos cosas a la vez",
          "El clavado Ab4 sobre el caballo de c3",
          "Axf3 rompiendo la estructura del rey blanco",
        ],
        [
          "El blanco tiene un tiempo de más y desarrollo; el negro, una estructura sanísima",
          "No perder tiempo moviendo la dama dos veces más",
          "Cambios: cada cambio le quita valor al tiempo de más del rival",
        ],
        [
          "Estructura pareja, tres peones contra tres en cada ala",
          "Sin debilidades no hay a qué pegarle: muchos finales tablas",
          "El alfil de casillas claras del negro decide, porque salió antes de e6",
        ],
      ],
    },
    {
      id: "eslava",
      categoria: "defensa",
      titulo: "Defensa eslava",
      subtitulo: "d4 d5 c4 c6",
      nivel: 2,
      pieza: "p",
      lineaId: "eslava",
      resumen: "Sostiene d5 con c6 en vez de e6, así que el alfil de c8 no queda encerrado.",
      diagrama: "El negro sostuvo d5 con c6, tomó en c4 y sacó su alfil a f5, que es todo el punto de esta defensa; el blanco contestó a4.",
      centro: [
        "c6 hace el mismo trabajo que e6 y deja libre al alfil de c8",
        "Tomar en c4 no es robar un peón: es ganar tiempo para sacar el alfil",
        "Es la defensa más sólida contra 1.d4, y también la más difícil de romper",
      ],
      bloques: [
        [
          "dxc4 y Af5 o Ag4, con el alfil afuera antes de e6",
          "e6 recién después, cerrando el triángulo",
          "b5 sosteniendo el peón de c4 si se puede",
          "Ruptura c5 o e5 cuando todo está desarrollado",
        ],
        [
          "Db6 pegándole a b2 con la diagonal abierta",
          "Cb4 apuntando a c2 cuando la casilla queda sin defensa",
          "El golpe e5 abriendo el centro con el rey blanco todavía adentro",
        ],
        [
          "Estructura sólida: el negro aguanta y espera su ruptura",
          "El alfil de f5 es la mejor pieza; no dejarlo sin casillas",
          "El blanco tiene más espacio: cada cambio ayuda al negro",
        ],
        [
          "Peones sanos de los dos lados: decide quién tiene mejor pieza menor",
          "Mayoría del blanco en el ala de dama; del negro, en el ala de rey",
          "Finales de torres con peones en los dos flancos, casi siempre parejos",
        ],
      ],
    },

    // ============================ TÁCTICA ============================
    {
      id: "horquilla",
      categoria: "tactica",
      titulo: "La horquilla",
      subtitulo: "Una pieza, dos amenazas",
      nivel: 1,
      pieza: "n",
      fen: "3q3k/6pp/8/4N3/8/8/5PPP/6K1 w - - 0 1",
      linea: ["Nf7+"],
      comprueba: { jaque: true, ganaSiempre: "d8" },
      resumen: "Una sola pieza ataca dos cosas a la vez: el rival salva una y pierde la otra.",
      diagrama: "El caballo blanco de e5 salta a f7 y desde ahí ataca al rey de h8 y a la dama de d8 al mismo tiempo.",
      centro: [
        "Una pieza ataca dos cosas: solo se puede salvar una",
        "Si una de las dos es el rey, la otra se cae segura",
        "El caballo es el rey de la horquilla: ataca desde donde nadie lo ve venir",
      ],
      bloques: [
        [
          "Dos piezas del rival a distancia de salto de caballo una de otra",
          "El rey y la dama en casillas del mismo color, con el caballo cerca",
          "Piezas sin defender: son la mitad de las horquillas que existen",
        ],
        [
          "El caballo, la más peligrosa: ningún otro puede atacarlo de vuelta a distancia",
          "El peón, la más barata: dos piezas grandes por un peón",
          "La dama, que ataca en ocho direcciones y siempre encuentra dos",
        ],
        [
          "Mirar solo la jugada propia y no ver la horquilla del rival",
          "Dejar el rey y la dama en la misma diagonal o en el mismo color",
          "Buscar la horquilla y olvidarse de que la casilla está defendida",
        ],
        [
          "Antes de mover, pregúntate: ¿qué ataca ahora esta pieza?",
          "En Entrenamiento, el tema «Pincho» de Ejercicios por tema: así se llama ahí la horquilla",
          "Repasar las partidas propias buscando las horquillas que no se vieron",
        ],
      ],
    },
    {
      id: "clavada",
      categoria: "tactica",
      titulo: "La clavada",
      subtitulo: "La pieza que no se puede mover",
      nivel: 1,
      pieza: "b",
      jugadas: ["e4", "e5", "Nf3", "Nc6", "Bb5", "d6"],
      comprueba: { clavadaEn: "c6" },
      resumen: "Una pieza queda pegada delante de algo más valioso y deja de defender lo que defendía.",
      diagrama: "El alfil blanco está en b5 y el negro acaba de jugar d6: recién ahora la diagonal b5-e8 quedó libre, así que el caballo de c6 no se puede mover.",
      centro: [
        "Una pieza no se puede mover porque detrás hay algo más valioso",
        "Si detrás está el rey, la pieza clavada NO se puede mover: es ilegal",
        "Una pieza clavada deja de defender: por eso la clavada gana material",
      ],
      bloques: [
        [
          "Alfil, torre o dama en línea recta con una pieza y algo grande detrás",
          "El rey sin enrocar en la columna e, que es donde se clava de verdad",
          "Un caballo delante de su dama: la clavada más común de todas",
        ],
        [
          "El alfil clava en diagonal, sobre todo en b5, g5, b4 y g4",
          "La torre clava en columnas y filas abiertas",
          "La dama clava en las dos, pero se arriesga a que la echen",
        ],
        [
          "Contar como defensor a una pieza clavada, que no defiende nada",
          "Dejar el caballo clavado sin romper la clavada durante diez jugadas",
          "Creer que en la española el caballo de c6 ya está clavado: mientras el peón siga en d7, no lo está",
          "Clavar con la dama y que la echen con tiempo",
        ],
        [
          "Amontonar piezas contra la pieza clavada, que no se puede escapar",
          "Romper la clavada propia con h6, a6 o moviendo el rey",
          "En Entrenamiento, el tema «Clavada» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "enfilada",
      categoria: "tactica",
      titulo: "La enfilada",
      subtitulo: "La clavada al revés",
      nivel: 2,
      pieza: "b",
      fen: "7q/6k1/8/8/8/8/8/2B3K1 w - - 0 1",
      linea: ["Bb2+"],
      comprueba: { jaque: true, ganaSiempre: "h8" },
      resumen: "La pieza grande está adelante: se mueve obligada y detrás queda la que se cae.",
      diagrama: "El alfil blanco entra a b2 y da jaque en la diagonal larga; cuando el rey negro se mueve, detrás queda la dama de h8.",
      centro: [
        "Es la clavada dada vuelta: adelante va lo grande y atrás lo chico",
        "La pieza de adelante está obligada a moverse, y al moverse destapa la de atrás",
        "Con jaque no hay elección: por eso la enfilada casi siempre gana material",
      ],
      bloques: [
        [
          "Rey y dama en la misma línea, sin nada en medio",
          "Dos torres alineadas en una columna abierta",
          "El rey en la diagonal larga después de un fianchetto sin su alfil",
        ],
        [
          "El alfil, en diagonales largas y despejadas",
          "La torre, en columnas y filas abiertas",
          "La dama, que puede enfilar en cualquier dirección",
        ],
        [
          "Confundirla con la clavada y calcular al revés",
          "Enfilar con jaque a una casilla defendida y perder la pieza",
          "Dejar el rey propio alineado con la dama «por un rato»",
        ],
        [
          "Después de cada cambio, mirar qué quedó alineado",
          "En los finales de torres es donde más aparece",
          "En Entrenamiento, el tema «Ataque por rayos X» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "descubierto",
      categoria: "tactica",
      titulo: "El ataque descubierto",
      subtitulo: "La pieza que se corre y destapa a otra",
      nivel: 2,
      pieza: "n",
      fen: "4k2r/8/8/4N3/8/8/8/4R1K1 w - - 0 1",
      linea: ["Ng6+"],
      comprueba: { jaque: true, ganaSiempre: "h8" },
      resumen: "Una pieza se corre y destapa el ataque de otra: se mueve una y atacan dos.",
      diagrama: "El caballo blanco de e5 salta a g6: al correrse destapa el jaque de la torre de e1 y de paso ataca la torre de h8.",
      centro: [
        "Se mueve una pieza y ataca la que estaba tapada detrás",
        "La que se corre puede ir a comer lo que quiera: nadie la puede parar",
        "Con jaque descubierto, el rival está obligado a atender el jaque",
      ],
      bloques: [
        [
          "Una pieza propia justo entre una línea abierta y el rey rival",
          "Torre o alfil apuntando a algo con una pieza propia en medio",
          "La pieza de adelante con una casilla buena donde caer con tiempo",
        ],
        [
          "El caballo, porque se corre a cualquier lado y encima ataca",
          "El alfil, cuando destapa una torre en la columna",
          "El peón, que al comer destapa la diagonal del alfil",
        ],
        [
          "Correr la pieza a una casilla donde la comen gratis",
          "No ver el descubierto del rival, que es siempre el mismo dibujo",
          "Usar el descubierto para comer un peón cuando había algo mejor",
        ],
        [
          "El doble jaque es su hermano mayor: ahí el rey tiene que moverse sí o sí",
          "Revisar en cada posición qué pasaría si se corre cada pieza propia",
          "En Entrenamiento, el tema «Ataque a la descubierta» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "desviacion",
      categoria: "tactica",
      titulo: "La desviación",
      subtitulo: "Sacarle al rival su defensor",
      nivel: 3,
      pieza: "q",
      fen: "3rr1k1/5ppp/2Q5/8/8/8/5PPP/4R1K1 w - - 0 1",
      linea: ["Qxe8+", "Rxe8", "Rxe8#"],
      comprueba: { mateFinal: true },
      resumen: "La pieza que defiende se saca del medio, aunque cueste material: lo que defendía se cae.",
      diagrama: "La dama blanca come en e8 aunque la torre de d8 pueda recuperar: al hacerlo, esa torre deja de cuidar la última fila y la torre de e1 da mate.",
      centro: [
        "Una pieza del rival está haciendo un trabajo: hay que sacarla de ahí",
        "Si el defensor no se va por su cuenta, se lo saca comiendo, aunque cueste",
        "Lo que vale es lo que quedaba detrás, no la pieza que se entrega",
      ],
      bloques: [
        [
          "Una pieza del rival defendiendo dos cosas a la vez",
          "Una sola pieza cuidando la última fila",
          "Un defensor que además está clavado, o sea que casi no defiende",
        ],
        [
          "La dama, porque se puede entregar en cualquier casilla",
          "La torre, entrando en la última fila",
          "El peón, que echa al defensor sin gastar nada",
        ],
        [
          "Contar el material y no ver que después viene mate",
          "Desviar al defensor equivocado: hay que mirar qué defiende cada uno",
          "Entregar la dama sin haber calculado la jugada siguiente hasta el final",
        ],
        [
          "Preguntarse siempre: ¿qué está defendiendo esta pieza?",
          "Calcular el final de la línea, no solo el primer golpe",
          "En Entrenamiento, el tema «Desviación» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "mate-pasillo",
      categoria: "tactica",
      titulo: "El mate del pasillo",
      subtitulo: "La última fila",
      nivel: 1,
      pieza: "r",
      fen: "6k1/5ppp/8/8/8/8/r4PPP/4R1K1 w - - 0 1",
      linea: ["Re8#"],
      comprueba: { mateFinal: true },
      resumen: "El rey enrocado queda encerrado por sus propios peones y la torre entra por detrás.",
      diagrama: "El rey negro está tapado por sus peones de f7, g7 y h7; la torre blanca entra a e8 y no tiene por dónde escaparse.",
      centro: [
        "Los peones que protegen al rey también lo encierran",
        "Una torre o una dama en la última fila da mate si no hay salida",
        "Es el mate más frecuente entre principiantes, y también entre quienes no lo son",
      ],
      bloques: [
        [
          "Rey enrocado con sus tres peones sin mover",
          "La última fila con una sola torre defendiéndola, o con ninguna",
          "Torres del rival apuntando a una columna abierta",
        ],
        [
          "La torre, que entra por la columna abierta",
          "La dama, si la casilla está defendida y ella llega con apoyo",
          "Dos torres dobladas, cuando hay un defensor que sacar",
        ],
        [
          "Dejar la última fila con un solo defensor y cambiarlo sin pensar",
          "Comer un peón en el otro lado del tablero con el mate esperando",
          "Hacer el hueco con h3 o g3 recién cuando ya es tarde",
        ],
        [
          "Hacerle la ventana al rey (h3 o h6) en un momento tranquilo",
          "Antes de cada cambio de torres, contar los defensores de la última fila",
          "En Entrenamiento, el tema «Mate del pasillo» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "mate-coz",
      categoria: "tactica",
      titulo: "El mate de la coz",
      subtitulo: "Smothered mate",
      nivel: 2,
      pieza: "n",
      fen: "6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1",
      linea: ["Nf7#"],
      comprueba: { mateFinal: true },
      resumen: "El rey se ahoga entre sus propias piezas y el caballo, que salta por encima, lo remata.",
      diagrama: "El rey negro de h8 está rodeado por su torre de g8 y sus peones de g7 y h7; el caballo blanco entra a f7 y no hay salida.",
      centro: [
        "El rey queda encerrado por SUS propias piezas, no por las del rival",
        "Solo el caballo puede dar este mate: es el único que salta",
        "Contra un caballo no sirve tapar la línea, porque no hay línea que tapar",
      ],
      bloques: [
        [
          "Rey en la esquina con la torre al lado y los peones sin mover",
          "Un caballo del rival a dos saltos de f7 o de h7",
          "La secuencia clásica Dg8+ seguida de Cf7 mate",
        ],
        [
          "El caballo, siempre: ninguna otra pieza da este mate",
          "La dama, que se entrega en g8 para llenar la última casilla libre",
          "El alfil, que suele clavar la salida antes del golpe",
        ],
        [
          "Enrocar y dejar las tres piezas pegadas al rey sin darle aire",
          "No ver el caballo porque «está lejos»: salta dos veces y llega",
          "Buscar el mate sin comprobar que la casilla de escape está tapada",
        ],
        [
          "Aprender la secuencia entera de memoria: es siempre la misma",
          "Hacerle la ventana al rey cuando hay caballos en el tablero",
          "En Entrenamiento, el tema «Mate de la coz» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "ataque-doble",
      categoria: "tactica",
      titulo: "El ataque doble de la dama",
      subtitulo: "Jaque y algo más",
      nivel: 2,
      pieza: "q",
      fen: "k7/8/8/8/8/8/5K2/3Q3r w - - 0 1",
      linea: ["Qd5+"],
      comprueba: { jaque: true, ganaSiempre: "h1" },
      resumen: "La dama da jaque desde una casilla donde además ataca una pieza sin defender.",
      diagrama: "La dama blanca entra a d5: da jaque al rey de a8 por la diagonal y al mismo tiempo apunta a la torre de h1 por la otra.",
      centro: [
        "La dama ataca en ocho direcciones: casi siempre hay una casilla que sirve para dos cosas",
        "Con jaque, el rival tiene que atender el jaque y no puede salvar lo otro",
        "Lo que se come suele ser una pieza sin defender, no una defendida",
      ],
      bloques: [
        [
          "Piezas del rival sin defender, en cualquier parte del tablero",
          "El rey y una pieza en dos líneas que se cruzan en una casilla libre",
          "Una casilla desde la que la dama ve al rey y a algo más",
        ],
        [
          "La dama, la reina de esta táctica por su alcance",
          "La torre, en filas y columnas abiertas",
          "El caballo, cuando el jaque y la captura salen del mismo salto",
        ],
        [
          "Dar el jaque desde una casilla donde la dama se cae",
          "Dejar piezas sin defender: son el imán de todos los ataques dobles",
          "Buscar el jaque antes de mirar qué piezas del rival están sueltas",
        ],
        [
          "Antes de mover, hacer la lista de piezas sin defender de los dos lados",
          "Buscar primero jaques, después capturas y después amenazas",
          "En Entrenamiento, el tema «Ataque doble» de Ejercicios por tema",
        ],
      ],
    },

    // ============================ CONCEPTOS ============================
    {
      id: "el-centro",
      categoria: "concepto",
      titulo: "El centro",
      subtitulo: "Las cuatro casillas que mandan",
      nivel: 1,
      pieza: "p",
      jugadas: ["d4", "d5", "c4", "e6", "Nc3", "Nf6"],
      resumen: "Desde el centro las piezas llegan a todas partes; desde el borde, a la mitad.",
      diagrama: "Los cuatro peones centrales enfrentados en d4, d5, c4 y e6, con los caballos peleando por las mismas casillas.",
      centro: [
        "Un caballo en el centro llega a ocho casillas; en la esquina, a dos",
        "Quien controla el centro decide en qué ala se juega",
        "Controlar no es ocupar: se puede mandar en el centro desde lejos",
      ],
      bloques: [
        [
          "Desde la primera jugada: casi todas las aperturas hablan del centro",
          "Cuando el rival avanza sus peones de centro sin piezas que los sostengan",
          "Cada vez que hay que elegir entre comer hacia el centro o hacia el borde",
        ],
        [
          "Sacar caballos y alfiles apuntando al centro, no a los bordes",
          "Comer hacia el centro cuando se puede elegir",
          "Golpear el centro del rival con c5, e5, d5 o f5",
        ],
        [
          "Mover peones de flanco en la apertura y dejar el centro al rival",
          "Sacar la dama temprano para atacar un peón del centro y perder tiempos",
          "Ocupar el centro con peones sin piezas que los defiendan",
        ],
        [
          "El rey también quiere el centro: en el final va para allá, no se esconde",
          "Un peón pasado en el centro es más fuerte que uno en el borde",
          "Los caballos siguen necesitando casillas centrales hasta la última jugada",
        ],
      ],
    },
    {
      id: "desarrollo",
      categoria: "concepto",
      titulo: "Desarrollo y seguridad del rey",
      subtitulo: "Las primeras diez jugadas",
      nivel: 1,
      pieza: "k",
      jugadas: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O", "Nf6", "d3", "d6", "Nc3", "O-O"],
      comprueba: { enrocados: true },
      resumen: "Sacar todas las piezas y guardar al rey antes de empezar a atacar: en ese orden.",
      diagrama: "Cada bando con sus dos caballos y su alfil de casillas claras afuera, y los dos reyes ya enrocados detrás de sus tres peones.",
      centro: [
        "Una pieza por jugada, y ninguna dos veces en la apertura",
        "El rey se guarda antes de abrir el juego, no después",
        "Atacar con dos piezas mientras el rival tiene seis afuera no funciona nunca",
      ],
      bloques: [
        [
          "En todas las partidas, en las primeras diez jugadas",
          "Cada vez que aparece la tentación de comer un peón temprano",
          "Cuando el rival deja su rey en el centro más de la cuenta",
        ],
        [
          "Caballos antes que alfiles, y alfiles a casillas activas",
          "Enroque corto en cuanto esté libre el camino",
          "Conectar las torres: es la señal de que la apertura terminó",
        ],
        [
          "Sacar la dama primero y que la echen con tiempo",
          "Mover el mismo caballo tres veces para ganar un peón",
          "Dejar el rey en el centro cuando la columna e se está abriendo",
        ],
        [
          "En el final se invierte todo: el rey sale al centro y es una pieza más",
          "Las piezas que nunca se desarrollaron son las que faltan cuando hay que defender",
          "Un alfil que quedó encerrado en la apertura sigue encerrado en el final",
        ],
      ],
    },
    {
      id: "peones-doblados",
      categoria: "concepto",
      titulo: "Estructura de peones",
      subtitulo: "Peones doblados, aislados y atrasados",
      nivel: 2,
      pieza: "p",
      lineaId: "espanola-cambio",
      comprueba: { doblados: { color: "b", columna: "c" } },
      resumen: "Los peones no vuelven atrás: cada avance es una decisión para el resto de la partida.",
      diagrama: "Después del cambio en c6, el negro quedó con dos peones doblados en la columna c y con el par de alfiles como compensación.",
      centro: [
        "El peón es la única pieza que no vuelve: lo que se avanza no se deshace",
        "Peones doblados, aislados o atrasados son objetivos fijos: no se pueden mover para escapar",
        "A cambio siempre dan algo —columnas abiertas, el par de alfiles, actividad—: el trato se piensa",
      ],
      bloques: [
        [
          "Cada vez que hay que elegir con qué pieza recuperar",
          "Cuando el rival ofrece cambiar en una casilla donde recuperar dobla un peón",
          "Al abrir una columna: la estructura de después es la que va a durar",
        ],
        [
          "Mirar la posición de dentro de veinte jugadas antes de comer",
          "Aceptar la debilidad si a cambio se consiguen líneas abiertas o el par de alfiles",
          "Atacar el peón débil del rival con piezas, no con peones",
        ],
        [
          "Recuperar siempre «hacia el centro» sin mirar qué estructura queda",
          "Avanzar peones delante del propio rey sin necesidad",
          "Cambiar piezas teniendo un peón débil: en el final se nota el doble",
        ],
        [
          "Una debilidad que en el medio juego no se siente, en el final decide",
          "El peón aislado es débil en el final y fuerte en el medio juego, por las casillas que da",
          "Peones doblados casi nunca ganan una carrera de peones",
        ],
      ],
    },
    {
      id: "peon-pasado",
      categoria: "concepto",
      titulo: "El peón pasado",
      subtitulo: "El que nadie puede parar con peones",
      nivel: 2,
      pieza: "p",
      fen: "6k1/5ppp/8/1P6/8/8/5PPP/6K1 w - - 0 1",
      comprueba: { pasado: "b5" },
      resumen: "Un peón sin peones rivales por delante ni al costado: hay que empujarlo o bloquearlo.",
      diagrama: "El peón blanco de b5 no tiene ningún peón negro por delante ni en las columnas de al lado: tiene el camino libre a coronar.",
      centro: [
        "Es un peón al que ningún peón rival puede parar en su camino",
        "Vale más cuanto más avanza y cuanto menos piezas quedan",
        "Un peón pasado hay que empujarlo; si es del rival, hay que bloquearlo",
      ],
      bloques: [
        [
          "Cuando una mayoría de peones se pone en marcha",
          "Después de cada cambio de peones: fijarse si quedó uno pasado",
          "En los finales de torres, donde un peón pasado vale media partida",
        ],
        [
          "Empujarlo con el apoyo del rey, no solo",
          "Bloquear el del rival con un caballo, que es la mejor pieza para bloquear",
          "Crear el propio con la mayoría: el peón «candidato» se empuja primero",
        ],
        [
          "Empujarlo demasiado temprano y que lo coman",
          "Bloquear con la torre, que ahí no hace nada más",
          "Cambiar piezas sin darse cuenta de que el peón pasado del rival crece con cada cambio",
        ],
        [
          "El peón pasado lejano gana finales: se lleva al rey rival y el otro rey come todo",
          "Dos peones pasados unidos y apoyados por el rey son imparables",
          "En los finales de torres, la torre va DETRÁS del peón pasado, el propio y el ajeno",
        ],
      ],
    },
    {
      id: "columna-abierta",
      categoria: "concepto",
      titulo: "La columna abierta",
      subtitulo: "La autopista de las torres",
      nivel: 2,
      pieza: "r",
      fen: "3r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
      comprueba: { columnaAbierta: "d" },
      resumen: "Una torre sin columna es una pieza que mira una pared: la columna abierta es su trabajo.",
      diagrama: "Las dos torres enfrentadas en la columna d, que no tiene ningún peón: la única línea abierta de la posición.",
      centro: [
        "Una columna sin peones es por donde entran las torres",
        "Quien la ocupa primero y la sostiene es quien entra a la séptima fila",
        "No alcanza con ocupar: hay que poder quedarse",
      ],
      bloques: [
        [
          "Cada vez que se cambia un par de peones en una columna",
          "Cuando el rival tiene un peón atrasado: esa columna semiabierta es el camino",
          "En el final de torres, que es casi siempre una pelea por una columna",
        ],
        [
          "Doblar las torres antes de entrar",
          "Buscar la séptima fila: dos torres ahí valen más que una dama",
          "Cambiar la torre del rival para quedarse con la columna",
        ],
        [
          "Entrar con una torre sola y que la echen con tiempo",
          "Abrir una columna que aprovecha el rival, no uno mismo",
          "Dejar la torre en la primera fila «por si acaso» toda la partida",
        ],
        [
          "En el final, la torre activa vale más que un peón de ventaja",
          "La torre va detrás del peón pasado, no delante",
          "Una torre en la séptima corta al rey rival y gana tiempo",
        ],
      ],
    },
    {
      id: "par-de-alfiles",
      categoria: "concepto",
      titulo: "El par de alfiles",
      subtitulo: "Dos alfiles contra alfil y caballo",
      nivel: 3,
      pieza: "b",
      fen: "5nk1/5ppp/8/8/2B5/4B3/5PPP/6K1 w - - 0 1",
      comprueba: { parDeAlfiles: "w" },
      resumen: "Dos alfiles cubren los dos colores: en posiciones abiertas son una ventaja de verdad.",
      diagrama: "Las blancas tienen sus dos alfiles, en c4 y en e3 —uno de cada color de casilla—, contra un caballo negro solo.",
      centro: [
        "Dos alfiles juntos cubren los dos colores de casilla: ya no hay casillas seguras para el rival",
        "Valen en posiciones abiertas, con peones en los dos flancos",
        "En posiciones cerradas, el caballo es mejor: el par de alfiles no es una regla, es una condición",
      ],
      bloques: [
        [
          "Cuando el rival cambia un alfil por un caballo sin razón",
          "Después de un clavado Ag5 seguido de Axf6",
          "En los finales con peones en los dos lados del tablero",
        ],
        [
          "Abrir la posición: los alfiles necesitan diagonales",
          "Sacar los peones propios de las casillas del alfil bueno",
          "Quitarle al caballo rival todas sus casillas de apoyo",
        ],
        [
          "Cambiar uno de los dos alfiles sin necesidad",
          "Dejar la posición cerrada teniendo el par: ahí no vale nada",
          "Sobrevalorarlo: dos alfiles con la estructura mala no ganan nada",
        ],
        [
          "En el final abierto es una ventaja que gana partidas parejas",
          "Los alfiles paran peones pasados en los dos flancos a la vez",
          "Contra alfil y caballo, hay que llevar el juego a los dos flancos",
        ],
      ],
    },
    {
      id: "rey-activo",
      categoria: "concepto",
      titulo: "El rey activo",
      subtitulo: "En el final el rey es una pieza",
      nivel: 2,
      pieza: "k",
      fen: "6k1/5ppp/8/4K3/8/8/5PPP/8 w - - 0 1",
      comprueba: { reyCentral: "w" },
      resumen: "Se pasó toda la partida escondido y en el final tiene que salir: quien lo saca primero gana.",
      diagrama: "El rey blanco ya cruzó el tablero y está en e5, en el centro; el negro sigue en su esquina, detrás de sus peones.",
      centro: [
        "En el final ya no hay damas: el rey deja de ser un problema y pasa a ser una pieza",
        "Un rey en el centro vale casi lo mismo que una pieza menor",
        "Quien lo saca primero llega primero a los peones del rival",
      ],
      bloques: [
        [
          "Apenas se cambian las damas: ahí empieza el final, aunque queden piezas",
          "En los finales de peones, donde el rey es LA pieza",
          "Cuando hay peones débiles en los dos flancos",
        ],
        [
          "Sacar el rey al centro apenas se pueda, sin esperar",
          "Llevarlo hacia los peones del rival o hacia el propio peón pasado",
          "Usarlo para bloquear peones: nada bloquea mejor y más barato",
        ],
        [
          "Dejar el rey en el rincón donde enrocó, «por seguridad»",
          "Hacer jugadas de espera con los peones en vez de caminar con el rey",
          "Sacarlo demasiado pronto, cuando todavía quedan damas",
        ],
        [
          "La oposición decide los finales de peones, y la oposición es cosa del rey",
          "El rey que llega a la casilla de coronación para el peón solo",
          "En finales de torres, el rey activo vale más que un peón",
        ],
      ],
    },
    {
      id: "casilla-fuerte",
      categoria: "concepto",
      titulo: "La casilla fuerte",
      subtitulo: "El caballo puesto donde no lo echan",
      nivel: 3,
      pieza: "n",
      fen: "r4rk1/pp3ppp/8/3N4/8/8/PP3PPP/R4RK1 w - - 0 1",
      comprueba: { casillaFuerte: "d5" },
      resumen: "Una casilla que ningún peón rival puede atacar: ahí un caballo vale una pieza y media.",
      diagrama: "El caballo blanco está en d5 y ningún peón negro lo puede echar: no quedan peones ni en la columna c ni en la e.",
      centro: [
        "Es una casilla a la que ningún peón del rival llega nunca",
        "Un caballo ahí no se mueve en toda la partida y molesta en toda la partida",
        "La casilla fuerte casi siempre la crea un avance de peón del rival, no un plan propio",
      ],
      bloques: [
        [
          "Cuando el rival avanza un peón y deja un hueco detrás",
          "En estructuras con peones doblados, que dejan columnas sin defensa de peón",
          "En las sicilianas, con la casilla d5 para el blanco",
        ],
        [
          "Llevar el caballo ahí, aunque tome tres jugadas",
          "Cambiar las piezas que podrían echarlo, sobre todo el alfil de ese color",
          "Sostener la casilla con un peón propio para que nadie la discuta",
        ],
        [
          "Poner una torre o la dama donde iba el caballo",
          "Cambiar el caballo bien puesto por una pieza pasiva del rival",
          "Avanzar peones sin mirar qué hueco queda detrás",
        ],
        [
          "En el final, el caballo en casilla fuerte sostiene un peón pasado y bloquea el del rival",
          "La casilla fuerte en la sexta fila suele ganar la partida sola",
          "Sin piezas, la casilla fuerte deja de importar: importa quién llega antes con el rey",
        ],
      ],
    },
  ];

  var API = { FICHAS: FICHAS, TITULOS: TITULOS, CATEGORIAS: CATEGORIAS };
  if (typeof window !== "undefined") window.FichasEstudio = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
