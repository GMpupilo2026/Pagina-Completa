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
 *              dirección (estudio.html?ficha=<id>) y lo que se comparte.
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
 * AL TOCAR ESTE ARCHIVO, CORRER herramientas/verificar-fichas.js (el banco) y
 * herramientas/verificar-estudio.js (la página que las muestra).
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

    {
      id: "gambito-de-rey",
      categoria: "apertura",
      titulo: "Gambito de rey",
      subtitulo: "Aceptado, e4 e5 f4",
      nivel: 3,
      pieza: "p",
      lineaId: "gambito-de-rey",
      resumen: "Se regala un peón en la segunda jugada para quedarse con todo el centro y la iniciativa.",
      diagrama: "El negro se quedó con el peón de f y lo sostuvo con g5 y g4; el caballo blanco saltó a e5 y el peón de h4 rompe la cadena negra.",
      centro: [
        "Un peón por el centro y por la columna f abierta, desde la jugada dos",
        "Es la apertura más vieja que se sigue jugando: velocidad contra material",
        "Quien acepta tiene que devolverlo en el momento justo, no aferrarse",
      ],
      bloques: [
        [
          "Cf3 enseguida, para que no llegue Dh4 con jaque",
          "d4 armando el centro grande mientras el rival sostiene su peón",
          "Enroque corto y torre a f1, que es la columna del gambito",
          "Axf4 recuperando el peón cuando ya todo está sacado",
        ],
        [
          "El sacrificio en f7 con la columna f abierta",
          "Ce5 y Axf7+ contra un rey que se quedó en el centro",
          "La cadena g5-g4 del negro se rompe con h4",
        ],
        [
          "El rey blanco está más aireado: hay que enrocar antes de abrir",
          "Si el negro devuelve el peón, el juego se calma y el centro decide",
          "Cada jugada cuenta: acá no hay tiempo para maniobrar",
        ],
        [
          "Con un peón de menos y sin ataque, el final está perdido",
          "La columna f abierta sigue valiendo en el final de torres",
          "Mayoría en el ala de dama para el negro si devolvió a tiempo",
        ],
      ],
    },
    {
      id: "vienesa",
      categoria: "apertura",
      titulo: "Apertura vienesa",
      subtitulo: "Con el gambito f4",
      nivel: 2,
      pieza: "n",
      lineaId: "vienesa",
      resumen: "Es el gambito de rey con el caballo ya puesto en c3: el mismo ataque, con una pieza más lista.",
      diagrama: "El centro quedó abierto: el peón blanco llegó a e5, el caballo negro se metió en e4 y el blanco lo va a echar con d3.",
      centro: [
        "Cc3 antes de f4: la pieza sale primero y el gambito llega después",
        "Sostiene e4 y pelea d5, que es la ruptura con la que el negro se libera",
        "Menos teoría que el gambito de rey y casi el mismo juego",
      ],
      bloques: [
        [
          "f4 abriendo la columna, con el caballo ya afuera",
          "d3 echando el caballo negro de e4",
          "Enroque corto y torre a f1",
          "Ae3 y Dd2 con enroque largo en las líneas agudas",
        ],
        [
          "Cxe4 y d4 ganando la pieza del centro cuando el negro se descuida",
          "El clavado Ab5 sobre el caballo de c6",
          "Dh5 apuntando a f7 con la columna abierta",
        ],
        [
          "Centro abierto y reyes en alas distintas: se juega a toda velocidad",
          "El caballo negro de e4 es la pieza a discutir todo el medio juego",
          "El peón de e5 blanco corta el tablero en dos",
        ],
        [
          "El peón de e5 sin piezas que lo sostengan se cae",
          "Estructura de mayorías cruzadas, cada uno con su peón pasado",
          "El par de alfiles vale mucho: la posición queda abierta",
        ],
      ],
    },
    {
      id: "gambito-evans",
      categoria: "apertura",
      titulo: "Gambito Evans",
      subtitulo: "La italiana con b4",
      nivel: 3,
      pieza: "b",
      lineaId: "gambito-evans",
      resumen: "Un peón de flanco para ganar dos tiempos y armar el centro grande de una.",
      diagrama: "El alfil negro se comió el peón de b4 y, echado con c3, se retiró a a5; las blancas ya montaron el centro con d4 y e4.",
      centro: [
        "El peón de b4 se entrega para echar al alfil y ganar tiempo con c3 y d4",
        "No se juega por el material: se juega por el desarrollo",
        "Es la apertura favorita de los románticos, y Kaspárov la revivió",
      ],
      bloques: [
        [
          "c3 y d4 de inmediato, sin dejar respirar",
          "Enroque corto y Aa3 cortando el enroque del rival",
          "Db3 apuntando a f7 junto con el alfil",
          "Torre a d1 sosteniendo el centro",
        ],
        [
          "La batería dama y alfil contra f7",
          "d5 echando al caballo de c6 y abriendo la diagonal",
          "Axf7+ cuando el rey negro sigue en el centro",
        ],
        [
          "Si el negro devuelve el peón y cambia damas, el ataque se apaga",
          "El alfil de a5 tiene que volver al juego o queda fuera de la partida",
          "Con reyes enrocados, la columna b del blanco es su carta",
        ],
        [
          "Un peón de menos sin ataque es un final perdido: hay que apurar",
          "El centro de peones vale más que el peón de flanco entregado",
          "Los alfiles activos sostienen el final en posiciones abiertas",
        ],
      ],
    },
    {
      id: "siciliana-cerrada",
      categoria: "apertura",
      titulo: "Siciliana cerrada",
      subtitulo: "Contra la siciliana, sin teoría",
      nivel: 2,
      pieza: "b",
      lineaId: "siciliana-cerrada",
      resumen: "Contra la siciliana, no abrir el centro: fianchetto, ataque al rey y cero variantes que memorizar.",
      diagrama: "Los dos alfiles salieron a la diagonal larga, el centro quedó trabado con e4 contra c5 y nadie cambió nada todavía.",
      centro: [
        "El blanco ELIGE no entrar en la teoría abierta de la siciliana",
        "Se juega con piezas y con el avance f4-f5, no con líneas memorizadas",
        "Es la ficha de una apertura que el ALUMNO juega con blancas, aunque la familia se llame Defensa siciliana",
      ],
      bloques: [
        [
          "g3, Ag2 y d3: la estructura siempre es la misma",
          "f4 y f5 marchando contra el rey rival",
          "Ce2 y c3 para sostener d4 si hace falta",
          "Dd2, Ah6 cambiando el alfil que defiende al rey negro",
        ],
        [
          "El alfil de g2 pega en la diagonal larga apenas se abre",
          "f5 con sacrificio de peón para destapar la columna",
          "Ch4 y f5 con el caballo entrando por g6",
        ],
        [
          "Ataques en alas opuestas: el blanco al rey, el negro por la columna c",
          "Centro cerrado: quien llegue primero con sus peones gana",
          "Cambiar el alfil de g7 negro vale más que ganar un peón",
        ],
        [
          "El negro tiene mejor estructura: sus peones de dama están sanos",
          "El blanco tiene espacio en el ala de rey para su mayoría",
          "Final de alfiles del mismo color, decidido por quién tiene mejores peones",
        ],
      ],
    },
    {
      id: "francesa-tarrasch",
      categoria: "apertura",
      titulo: "Francesa Tarrasch",
      subtitulo: "Contra la francesa, con Cd2",
      nivel: 3,
      pieza: "n",
      lineaId: "francesa-tarrasch",
      resumen: "El caballo va a d2 y no a c3: no se deja clavar, y a cambio el blanco juega un poco más lento.",
      diagrama: "El centro se cambió: los dos peones de e desaparecieron, el negro quedó con un peón aislado en d5 y el juego está abierto.",
      centro: [
        "Cd2 en vez de Cc3 para que el alfil negro no pueda clavar en b4",
        "El precio es tapar al alfil de c1 por unas jugadas",
        "Casi siempre termina en la posición del peón dama aislado del negro",
      ],
      bloques: [
        [
          "exd5 dejándole al negro un peón aislado en d5",
          "Ab5 clavando el caballo de c6 y cambiándolo",
          "Bloquear el peón aislado con una pieza en d4",
          "Enroque corto y torres a las columnas c y e",
        ],
        [
          "La presión sobre el peón de d5, que no lo defiende ningún peón",
          "Cb3 y Ce5 ocupando la casilla que el aislado deja",
          "El clavado de la columna e contra el rey que no enrocó",
        ],
        [
          "El negro juega con piezas activas; el blanco, contra su peón débil",
          "Cada cambio de piezas favorece al blanco: el aislado se siente en el final",
          "La casilla de delante del peón aislado es la mejor del tablero",
        ],
        [
          "El peón aislado en el final es una debilidad fija que no se mueve",
          "Bloquear y comer: primero se para, después se ataca",
          "Si el negro logra avanzarlo con d4, el aislado deja de ser débil",
        ],
      ],
    },
    {
      id: "ataque-indio-de-rey",
      categoria: "apertura",
      titulo: "Ataque indio de rey",
      subtitulo: "Cf3, g3 y siempre lo mismo",
      nivel: 2,
      pieza: "k",
      lineaId: "ataque-indio-de-rey",
      resumen: "Es la India de rey con los colores cambiados: la misma formación contra casi todo, y un tiempo de más.",
      diagrama: "El blanco armó su formación completa —alfil en g2, peones en d3 y e4, caballos en f3 y d2— y ya enrocó; el negro montó su centro con d5 y c5.",
      centro: [
        "Una sola formación que se repite: Cf3, g3, Ag2, enroque, d3, Cbd2 y e4",
        "El plan es siempre el mismo: e4-e5 y todas las piezas al rey",
        "Se puede jugar contra cualquier respuesta, así que casi no hay teoría",
      ],
      bloques: [
        [
          "e4 y después e5, ganando espacio y cortando el tablero",
          "Cf1-h2 o Ch4, para dejar pasar el peón de f",
          "Torre a e1 y dama a e2 detrás del avance",
          "h4 y h5 cuando el rey rival ya enrocó corto",
        ],
        [
          "El alfil de g2 pega de lejos cuando el centro se abre",
          "El sacrificio en h6 o en g5 con el ataque armado",
          "Ce5 apoyado por el peón de d, incómodo de echar",
        ],
        [
          "Ataques en alas opuestas: el blanco al rey, el negro por el ala de dama",
          "El centro se cierra a propósito: la carrera es de peones",
          "Es una apertura lenta: no hay que apurar el ataque antes de tiempo",
        ],
        [
          "Mayoría del negro en el ala de dama, que pesa en el final",
          "El alfil de g2 sigue siendo buena pieza con pocas piezas",
          "Sin ataque, la estructura del blanco es la más pasiva de las dos",
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

    {
      id: "nimzoindia",
      categoria: "defensa",
      titulo: "Defensa Nimzoindia",
      subtitulo: "d4 Cf6 c4 e6 Cc3 Ab4",
      nivel: 3,
      pieza: "b",
      lineaId: "nimzoindia",
      resumen: "El alfil clava el caballo de c3 y con eso el negro discute e4 sin poner un solo peón ahí.",
      diagrama: "El alfil negro está en b4 clavando el caballo de c3; el negro ya enrocó y sostuvo el centro con d5, y el blanco sacó su alfil a d3.",
      centro: [
        "El alfil de b4 clava el caballo que defiende e4: se controla el centro con piezas",
        "Cambiar ese alfil por el caballo le deja al blanco peones doblados",
        "Es la defensa más sólida contra 1.d4, y la que más eligen los campeones",
      ],
      bloques: [
        [
          "Axc3 en el momento justo, cuando los peones doblados sean permanentes",
          "d5 y c5 golpeando el centro por los dos lados",
          "b6 y Ab7 para sumar presión sobre e4",
          "Cc6-a5 y el caballo a c4, clavado en el peón débil",
        ],
        [
          "Cxe4 aprovechando que el caballo de c3 está clavado",
          "Da5 sumando al clavado: dos piezas contra una",
          "c5 rompiendo el centro cuando el rey blanco sigue sin enrocar",
        ],
        [
          "El trato de siempre: el par de alfiles para el blanco, la estructura para el negro",
          "Si el centro se abre, los dos alfiles mandan; si se cierra, mandan los peones",
          "El caballo negro busca c4 o d5, que son las casillas que los doblados dejan",
        ],
        [
          "Los peones doblados en c son el objetivo de todo el final",
          "Un caballo bien puesto vale más que un alfil malo en posición cerrada",
          "Final de peones ganado para quien tenga la mayoría sana",
        ],
      ],
    },
    {
      id: "grunfeld",
      categoria: "defensa",
      titulo: "Defensa Grünfeld",
      subtitulo: "El centro se le regala para atacarlo",
      nivel: 3,
      pieza: "b",
      lineaId: "grunfeld",
      resumen: "El negro cambia en el centro y deja que el blanco arme un centro enorme, para después demolerlo.",
      diagrama: "El blanco recuperó con el peón y quedó con un centro grande de c3, d4 y e4; el alfil negro de g7 ya mira esa cadena por la diagonal larga.",
      centro: [
        "El negro cambia en d5 y le deja al blanco el centro entero, a propósito",
        "El alfil de g7 y los golpes c5 y e5 existen para demolerlo",
        "Un centro grande que no avanza se convierte en un objetivo, no en una ventaja",
      ],
      bloques: [
        [
          "c5 pegándole a d4, casi siempre antes que cualquier otra cosa",
          "Cc6 y Ag4 sumando presión sobre el mismo peón",
          "Da5 atacando c3 y el centro por el costado",
          "Torre a d8 o a c8, según qué columna se abra",
        ],
        [
          "Axd4 y Cxd4 cuando el peón se queda sin defensores",
          "El alfil de g7 apuntando a b2 apenas se abre la diagonal",
          "El golpe e5 cuando el rey blanco todavía está en el centro",
        ],
        [
          "El blanco avanza el centro y busca al rey; el negro come por debajo",
          "Cambiar piezas favorece al negro: el centro grande necesita apoyo",
          "El alfil de g7 no se cambia por nada",
        ],
        [
          "Si el centro aguanta hasta el final, el blanco gana; si cae, gana el negro",
          "Los peones doblados en c del blanco son el objetivo del final",
          "Mayoría del negro en el ala de dama, lista para marchar",
        ],
      ],
    },
    {
      id: "india-de-dama",
      categoria: "defensa",
      titulo: "India de dama",
      subtitulo: "b6 y el alfil a la diagonal larga",
      nivel: 2,
      pieza: "b",
      lineaId: "india-de-dama",
      resumen: "El alfil sale a b7 y desde ahí discute e4 de lejos: es la defensa más sólida y más tranquila.",
      diagrama: "Los dos bandos pusieron su alfil en la diagonal larga —b7 el negro, g2 el blanco— y ninguno cedió el centro todavía.",
      centro: [
        "b6 y Ab7: el alfil pelea e4 desde el otro lado del tablero",
        "Los dos alfiles de casillas claras se miran de frente en la diagonal larga",
        "Es la defensa de quien quiere igualar sin riesgo y jugar el medio juego",
      ],
      bloques: [
        [
          "Ae7 y enroque corto, con todo sacado antes de romper",
          "d5 o c5, la ruptura según lo que haga el blanco",
          "Ce4 apoyado por el alfil de b7",
          "Cambiar el alfil de g2 blanco, que es su mejor pieza",
        ],
        [
          "El alfil de b7 y el caballo de e4 apuntando a la misma diagonal",
          "Ab4+ ganando un tiempo antes de acomodarse",
          "d5 abriendo la diagonal del alfil de un golpe",
        ],
        [
          "Es una partida de maniobras: no hay ruptura temprana",
          "Quien consiga jugar e4 (el blanco) o e5 (el negro) manda en el centro",
          "La diagonal larga es la línea que se pelea toda la partida",
        ],
        [
          "Estructuras simétricas: decide un peón débil o un alfil mejor",
          "Muchas tablas, y es parte de por qué se elige",
          "El alfil de b7 sigue siendo buena pieza con el tablero abierto",
        ],
      ],
    },
    {
      id: "petrov",
      categoria: "defensa",
      titulo: "Defensa rusa",
      subtitulo: "Petrov: e4 e5 Cf3 Cf6",
      nivel: 2,
      pieza: "n",
      lineaId: "petrov",
      resumen: "En vez de defender el peón, el negro copia y ataca el de enfrente: simetría y calma.",
      diagrama: "Los dos caballos se cambiaron de posición: el negro está en e4 y el blanco volvió a f3, con los peones de d enfrentados en d4 y d5.",
      centro: [
        "No se defiende e5: se ataca e4. Un peón por un peón",
        "La simetría no es pasividad: es negarse a que el blanco elija el terreno",
        "Su fama de aburrida es su mejor arma contra quien viene a atacar",
      ],
      bloques: [
        [
          "d6 echando el caballo ANTES de comer en e4: comer de una pierde",
          "d5 sosteniendo el caballo de e4, que es la pieza de la defensa",
          "Ad6, enroque corto y torre a e8",
          "Cambiar piezas por la columna e abierta",
        ],
        [
          "El truco de siempre: Cxe4 de entrada pierde por De2",
          "El clavado por la columna e contra el rey sin enrocar",
          "Ag4 clavando el caballo de f3 cuando defiende d4",
        ],
        [
          "Estructuras simétricas y columna e abierta: se cambian piezas",
          "El caballo de e4 negro es su pieza fuerte: sostenerlo con d5 y f5",
          "El blanco busca un mínimo de espacio; el negro, igualar del todo",
        ],
        [
          "Finales parejos y muchas tablas: eso es lo que la defensa promete",
          "Cualquier peón débil decide, porque no hay nada más en el tablero",
          "El alfil bueno y el rey activo son la única ventaja posible",
        ],
      ],
    },
    {
      id: "pirc",
      categoria: "defensa",
      titulo: "Defensa Pirc",
      subtitulo: "d6, Cf6, g6 y el alfil a g7",
      nivel: 2,
      pieza: "b",
      lineaId: "pirc",
      resumen: "Se le cede el centro al blanco y se lo ataca después desde atrás, con el alfil de g7 apuntando.",
      diagrama: "El negro ya enrocó detrás de su alfil de g7; el blanco montó el centro con d4 y e4 y sacó sus dos caballos y su alfil.",
      centro: [
        "El negro no ocupa el centro: lo deja crecer para golpearlo con c5 o e5",
        "Es la India de rey contra 1.e4, con la misma estructura y el mismo alfil",
        "Se juega con pocas jugadas memorizadas y mucho plan",
      ],
      bloques: [
        [
          "c6 y b5 ganando espacio en el ala de dama",
          "e5 o c5, la ruptura de siempre, cuando todo está sacado",
          "Cbd7 y el caballo a c5, apuntando a e4",
          "Torre a e8 detrás de la ruptura",
        ],
        [
          "El alfil de g7 apuntando a b2 y a d4 apenas se abre",
          "Cxe4 cuando el centro blanco se queda sin defensores",
          "Ag4 clavando el caballo que sostiene d4",
        ],
        [
          "El blanco tiene más espacio y suele atacar con h4-h5",
          "El negro aguanta y contraataca: no hay que apurar la ruptura",
          "Si el centro blanco avanza demasiado, se desarma solo",
        ],
        [
          "Estructura sana del negro: su final es cómodo si sobrevive al ataque",
          "El alfil de g7 con el tablero abierto es una pieza enorme",
          "Peones de más en el ala de dama tras el avance b5-b4",
        ],
      ],
    },
    {
      id: "siciliana-dragon",
      categoria: "defensa",
      titulo: "Siciliana dragón",
      subtitulo: "La variante más aguda que hay",
      nivel: 3,
      pieza: "b",
      lineaId: "siciliana-dragon",
      resumen: "Alfil en g7, columna c abierta y ataques en alas opuestas: gana quien llega un tiempo antes.",
      diagrama: "El negro fianchettó su alfil en g7 y el blanco ya puso su alfil en e3, listo para enrocar largo y marchar con los peones de h y g.",
      centro: [
        "El alfil de g7 mira la diagonal larga hasta el rey blanco, que enrocará largo",
        "Los dos atacan a la vez, en alas opuestas: es una carrera, no una discusión",
        "Se llama dragón por la forma que dibujan los peones negros de d6, e7, f7, g6 y h7",
      ],
      bloques: [
        [
          "Torre a c8 y Cc4 pegándole al enroque largo del blanco",
          "El sacrificio Txc3 rompiendo la estructura del rey rival",
          "a5-a4 y b5 abriendo columnas en el ala de dama",
          "Da5 sumando a la presión sobre c3",
        ],
        [
          "Txc3 es un sacrificio temático, no una excepción: casi siempre está",
          "El alfil de g7 pega a b2 apenas se va el caballo de c3",
          "Cxe4 aprovechando el clavado sobre c3",
        ],
        [
          "El blanco marcha con h4-h5 y cambia el alfil de g7 con Ah6",
          "Cuenta los tiempos, no las piezas: un tiempo decide la carrera",
          "Cambiar el alfil de g7 es la mitad del plan del blanco, y evitarlo, del negro",
        ],
        [
          "Si las damas se cambian, el ataque se apaga y la estructura decide",
          "La mayoría negra en el ala de dama es su carta para el final",
          "El peón de d6 atrasado es su debilidad cuando el juego se calma",
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

    {
      id: "sobrecarga",
      categoria: "tactica",
      titulo: "La sobrecarga",
      subtitulo: "El defensor que no da abasto",
      nivel: 3,
      pieza: "r",
      fen: "6k1/b2r1ppp/8/3n4/2P5/8/5PPP/Q5K1 w - - 0 1",
      linea: ["cxd5", "Rxd5", "Qxa7"],
      comprueba: { defiendeDos: { pieza: "d7", casillas: ["d5", "a7"] }, materialGanado: { color: "w", al_menos: 4 } },
      resumen: "Una pieza está defendiendo dos cosas a la vez: se le come una y la otra queda sola.",
      diagrama: "La torre negra de d7 defiende su caballo de d5 y su alfil de a7 al mismo tiempo; el peón de c4 come en d5 y, cuando la torre recupera, la dama se lleva el alfil.",
      centro: [
        "Una pieza no puede hacer dos trabajos a la vez",
        "No se la desvía: se le da a elegir cuál de las dos abandona",
        "Se come primero lo que está defendido, no lo que está suelto",
      ],
      bloques: [
        [
          "Una pieza del rival que defiende dos piezas distintas",
          "Un defensor que además cuida una casilla de mate",
          "Dos piezas del rival en la misma fila o columna que su defensor",
        ],
        [
          "El peón, que come al defendido sin arriesgar nada",
          "La dama, que ataca las dos piezas desde una casilla",
          "La torre, cuando las dos están en la misma columna",
        ],
        [
          "Comer lo suelto y no lo defendido: es el orden al revés",
          "No contar qué pasa DESPUÉS de la recaptura",
          "Dejar una pieza propia defendiendo dos cosas sin darse cuenta",
        ],
        [
          "Antes de mover, preguntarse qué defiende cada pieza del rival",
          "Contar los defensores de cada pieza, no solo los atacantes",
          "En Entrenamiento, el tema «Capturar al defensor» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "atraccion",
      categoria: "tactica",
      titulo: "La atracción",
      subtitulo: "Sacrificar para traer al rey",
      nivel: 3,
      pieza: "q",
      fen: "3q2kr/5p1p/8/6N1/3Q4/8/5PPP/6K1 w - - 0 1",
      linea: ["Qxh8+", "Kxh8", "Nxf7+", "Kg8", "Nxd8"],
      comprueba: { jaque: true, materialGanado: { color: "w", al_menos: 5 } },
      resumen: "Se entrega material para obligar al rey a pararse justo en la casilla donde lo espera una horquilla.",
      diagrama: "La dama blanca se entrega en h8: el rey negro está obligado a comerla, y desde f7 el caballo lo horquilla junto con la dama de d8.",
      centro: [
        "No se ataca al rey donde está: se lo trae a donde conviene",
        "Se paga con material porque lo que se gana vale más",
        "Casi siempre termina en una horquilla de caballo o en mate",
      ],
      bloques: [
        [
          "Un rey con una sola casilla libre y una captura obligada",
          "Un caballo a un salto de una casilla que horquillaría rey y dama",
          "Piezas del rival alineadas con la casilla a la que iría el rey",
        ],
        [
          "La dama, que es la que se puede entregar en cualquier casilla",
          "La torre, entregada en la última fila para atraer al rey",
          "El caballo, que es quien cobra después de la atracción",
        ],
        [
          "Entregar la dama sin haber calculado hasta el final",
          "Atraer al rey a una casilla donde en realidad está cómodo",
          "Olvidar que la captura tiene que ser OBLIGADA, no opcional",
        ],
        [
          "Calcular jugada por jugada, hasta ver el material de vuelta",
          "Buscar primero la horquilla y después la casilla que la habilita",
          "En Entrenamiento, el tema «Atracción» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "jaque-doble",
      categoria: "tactica",
      titulo: "El jaque doble",
      subtitulo: "Dos piezas dando jaque a la vez",
      nivel: 2,
      pieza: "n",
      fen: "r5k1/5p1p/6N1/8/8/8/8/1K4R1 w - - 0 1",
      linea: ["Ne7+"],
      comprueba: { jaque: true, dobleJaque: true },
      resumen: "Contra dos jaques al mismo tiempo no sirve tapar ni comer: el rey tiene que moverse sí o sí.",
      diagrama: "El caballo salta de g6 a e7 y da jaque; al correrse destapa la torre de g1 por la columna, así que el rey negro recibe dos jaques de una.",
      centro: [
        "Dos piezas dan jaque a la vez, y no se pueden parar las dos",
        "Tapar no sirve —hay dos líneas— y comer tampoco: solo se para una",
        "El rey está OBLIGADO a moverse: es la jugada más forzada del ajedrez",
      ],
      bloques: [
        [
          "Una pieza propia tapando la línea de otra hacia el rey rival",
          "Que esa pieza pueda dar jaque ella misma al correrse",
          "El rey rival con pocas casillas de escape",
        ],
        [
          "El caballo, que da jaque desde donde nadie lo alcanza",
          "El alfil, cuando destapa la torre de la columna",
          "El peón, que al comer descubre la diagonal y encima da jaque",
        ],
        [
          "Buscar solo el descubierto y no ver que la pieza también puede dar jaque",
          "Correr la pieza a una casilla donde no aporta nada",
          "No mirar las casillas de escape del rey antes de calcular el mate",
        ],
        [
          "Los mates más bonitos empiezan con un doble jaque",
          "Cuando el rey tiene que moverse, el resto del tablero no cuenta",
          "En Entrenamiento, el tema «Jaque doble» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "bateria",
      categoria: "tactica",
      titulo: "La batería",
      subtitulo: "Dos piezas en la misma línea",
      nivel: 2,
      pieza: "q",
      fen: "6k1/5ppp/8/8/8/3Q4/6PP/1B4K1 w - - 0 1",
      comprueba: { bateria: { atras: "b1", adelante: "d3", objetivo: "h7" } },
      resumen: "Dos piezas alineadas suman su fuerza sobre la misma casilla: una empuja y la otra sostiene.",
      diagrama: "El alfil de b1 y la dama de d3 están en la misma diagonal apuntando a h7: la dama entra y el alfil la sostiene.",
      centro: [
        "Dos piezas que se mueven igual, una detrás de la otra, atacan como una sola más fuerte",
        "La de adelante entra, la de atrás la defiende: ninguna de las dos sirve sola",
        "Dama y alfil, dama y torre, o dos torres dobladas: siempre la misma idea",
      ],
      bloques: [
        [
          "Una casilla débil del enroque rival (h7 y h2 son las de siempre)",
          "Una columna abierta donde caben dos torres",
          "Una diagonal larga sin peones propios que la tapen",
        ],
        [
          "Dama y alfil contra h7, que es la batería más clásica que hay",
          "Dos torres dobladas para entrar en la séptima fila",
          "Dama y torre en la columna, con la torre adelante",
        ],
        [
          "Poner la dama adelante en la columna: la comen y no pasa nada más",
          "Armar la batería contra una casilla que el rival ya defendió dos veces",
          "Tapar la propia batería con un peón sin darse cuenta",
        ],
        [
          "El orden importa: la pieza más barata va adelante",
          "Armarla ANTES de que el rival haga el hueco a su rey",
          "En Entrenamiento, el tema «Ataque por columnas y diagonales» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "mate-anastasia",
      categoria: "tactica",
      titulo: "El mate de Anastasia",
      subtitulo: "Caballo en e7 y torre por la columna h",
      nivel: 3,
      pieza: "r",
      fen: "7r/4N1pk/8/3R4/8/8/8/6K1 w - - 0 1",
      linea: ["Rh5#"],
      comprueba: { mateFinal: true },
      resumen: "El caballo le tapa al rey las dos casillas de escape y la torre entra por la columna abierta.",
      diagrama: "El caballo blanco de e7 controla g8 y g6, el peón negro de g7 tapa la última salida, y la torre llega a h5 para dar mate por la columna.",
      centro: [
        "El caballo de e7 le quita al rey de h7 sus dos casillas: g8 y g6",
        "El propio peón de g7 del rival tapa la tercera",
        "La torre solo tiene que llegar a la columna h con jaque",
      ],
      bloques: [
        [
          "Rey rival en h7 o h2 con su peón de g todavía en casa",
          "Un caballo propio que pueda llegar a e7 (o a e2, con los colores dados vuelta)",
          "La columna h libre para que entre la torre o la dama",
        ],
        [
          "El caballo, que es el que cierra las dos salidas",
          "La torre, que entra por la columna y da el mate",
          "La dama, cuando hay que sacrificarla en h7 para atraer al rey",
        ],
        [
          "Meter la torre antes de poner el caballo en e7",
          "No mirar si el rey tiene una casilla más por la que escapar",
          "Olvidar que el rival puede tapar la columna h con una pieza",
        ],
        [
          "Aprenderse el dibujo: siempre es el mismo, cambian las casillas",
          "La versión completa empieza con Ce7+ y sigue con Txh7+",
          "En Entrenamiento, el tema «Mate de Anastasia» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "pieza-atrapada",
      categoria: "tactica",
      titulo: "La pieza atrapada",
      subtitulo: "Sin casillas a donde ir",
      nivel: 2,
      pieza: "b",
      fen: "6k1/8/8/8/8/8/5PPb/5K2 w - - 0 1",
      linea: ["g3"],
      comprueba: { atrapada: "h2" },
      resumen: "Una pieza se mete a comer un peón, se le cierran las salidas y se pierde sola.",
      diagrama: "El alfil negro se comió el peón de h2; con g3 se le tapan las salidas: g3 lo defiende el peón de f2 y g1 lo cuida el rey.",
      centro: [
        "No hace falta comerla: alcanza con que no tenga a dónde ir",
        "Casi siempre es una pieza que se fue sola a comer un peón de flanco",
        "Un peón que avanza vale más que una jugada de ataque si encierra un alfil",
      ],
      bloques: [
        [
          "Un alfil que se metió en h2, a2, h7 o a7 a comer un peón",
          "Una dama que entró a comer en b2 o en g2 y quedó lejos de casa",
          "Un caballo en el borde con tres casillas y dos ya cubiertas",
        ],
        [
          "Los peones, que cierran diagonales sin gastar una pieza",
          "El rey, que en el final le quita la última casilla",
          "El alfil o el caballo, cubriendo las salidas que quedan",
        ],
        [
          "Comer el peón envenenado y no contar las casillas de vuelta",
          "Atacar la pieza en vez de quitarle las salidas: se escapa",
          "Dejarle una casilla libre que parecía imposible",
        ],
        [
          "Antes de comer un peón lejos, contar por dónde se vuelve",
          "Cuando una pieza rival entra en tu campo, pensar en encerrarla, no en echarla",
          "En Entrenamiento, el tema «Pieza atrapada» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "jaque-perpetuo",
      categoria: "tactica",
      titulo: "El jaque perpetuo",
      subtitulo: "Tablas cuando se va perdiendo",
      nivel: 2,
      pieza: "q",
      fen: "6k1/5pp1/8/8/n7/8/1q4PP/3Q3K w - - 0 1",
      linea: ["Qd8+", "Kh7", "Qd3+", "Kg8", "Qd8+", "Kh7", "Qd3+", "Kg8", "Qd8+", "Kh7", "Qd3+", "Kg8"],
      comprueba: { jaque: true, repeticion: true },
      resumen: "Con una pieza de menos y el rey rival al descubierto, una cadena de jaques que no se puede parar salva medio punto.",
      diagrama: "El negro tiene un caballo de más y amenaza mate, pero la dama blanca va y viene entre d8 y d3 dando jaques que el rey no puede esquivar.",
      centro: [
        "Medio punto vale muchísimo cuando la otra opción es perder",
        "Los jaques tienen que ser forzados y repetirse: si el rey se escapa una vez, se acabó",
        "Tres veces la misma posición son tablas, y las puede reclamar cualquiera",
      ],
      bloques: [
        [
          "Estar perdiendo material y tener la dama cerca del rey rival",
          "Un rey con dos casillas y nada que pueda tapar los jaques",
          "Que ninguna pieza del rival llegue a interponerse en las dos líneas",
        ],
        [
          "La dama, que es la que casi siempre lo hace sola",
          "Dos torres, dando jaques alternados en filas distintas",
          "El caballo, en los ahogados y perpetuos de final",
        ],
        [
          "Dar el primer jaque sin comprobar que hay un segundo",
          "Buscar el perpetuo cuando todavía se podía defender y jugar",
          "Dejar que el rival tape con una pieza que sí llegaba",
        ],
        [
          "Antes de rendirse, buscar jaques: siempre, todos",
          "Contar la secuencia entera y ver que vuelve a la misma posición",
          "En Entrenamiento, el tema «Movimiento defensivo» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "subpromocion",
      categoria: "tactica",
      titulo: "Coronar caballo",
      subtitulo: "Cuando la dama no sirve",
      nivel: 3,
      pieza: "n",
      fen: "8/k1P1q3/8/8/8/8/8/6K1 w - - 0 1",
      linea: ["c8=N+"],
      comprueba: { jaque: true, ganaSiempre: "e7" },
      resumen: "Casi siempre se corona dama, pero a veces el caballo es la única pieza que da jaque.",
      diagrama: "El peón blanco corona en c8, y solo como caballo da jaque al rey de a7 y ataca la dama negra de e7 al mismo tiempo.",
      centro: [
        "Coronar dama es lo normal, pero no es una regla: se elige la pieza",
        "El caballo hace lo único que la dama no sabe: saltar y horquillar",
        "También se corona caballo o torre para NO ahogar al rival",
      ],
      bloques: [
        [
          "Un peón que corona a salto de caballo del rey rival",
          "El rey y una pieza grande a distancia de horquilla desde la casilla de coronación",
          "Una posición donde coronar dama sería ahogado y tablas",
        ],
        [
          "El caballo, siempre: es la coronación menor que gana partidas",
          "La torre, para coronar sin ahogar cuando la dama daría tablas",
          "El alfil, casi nunca: en la práctica no aparece",
        ],
        [
          "Coronar dama de memoria, sin mirar si el caballo daba jaque",
          "Coronar dama y ahogar al rival cuando se estaba ganando",
          "Olvidar que el caballo recién coronado también hay que sostenerlo",
        ],
        [
          "Al coronar, mirar SIEMPRE si el caballo da jaque",
          "Contar las jugadas del rival: si no tiene ninguna, ojo con el ahogado",
          "En Entrenamiento, el tema «Subpromoción» de Ejercicios por tema",
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
    {
      id: "zugzwang",
      categoria: "concepto",
      titulo: "El zugzwang",
      subtitulo: "Estar obligado a jugar",
      nivel: 3,
      pieza: "k",
      fen: "8/8/8/2p5/8/pP6/P7/K1k5 w - - 0 1",
      comprueba: { zugzwang: true },
      resumen: "Hay posiciones en las que mover es el problema: cualquier jugada empeora las cosas.",
      diagrama: "El rey blanco no tiene ni una casilla —su peón le tapa a2 y el rey negro le cubre b1 y b2— y su peón de a2 está trabado: la única jugada que le queda, b4, regala el peón.",
      centro: [
        "En ajedrez hay que mover: pasar no se puede",
        "A veces la posición se sostiene sola y lo que la rompe es tener el turno",
        "Es lo que decide casi todos los finales de peones",
      ],
      bloques: [
        [
          "En los finales, cuando quedan pocas piezas y pocas jugadas de espera",
          "Con los reyes enfrentados y los peones trabados",
          "Cuando al rival solo le quedan jugadas de peón, que no vuelven atrás",
        ],
        [
          "Gastar jugadas de espera con el rey para devolverle el turno al rival",
          "Guardarse un peón sin mover, que es una jugada de espera en la mano",
          "Contar los tiempos antes de entrar al final, no después",
        ],
        [
          "Avanzar los peones temprano y quedarse sin jugadas de espera",
          "Tratar de ganar tiempo con el rey y perder la oposición",
          "Creer que estar mejor alcanza: con el turno en contra no alcanza",
        ],
        [
          "Es donde vive: casi no aparece con las damas en el tablero",
          "La oposición es zugzwang puro, con otro nombre",
          "En Entrenamiento, el tema «Zugzwang» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "oposicion",
      categoria: "concepto",
      titulo: "La oposición",
      subtitulo: "Los reyes frente a frente",
      nivel: 2,
      pieza: "k",
      fen: "8/8/8/3k4/8/3K4/8/8 w - - 0 1",
      comprueba: { oposicion: "b" },
      resumen: "Dos reyes enfrentados con una casilla en medio: pierde terreno el que tiene que mover.",
      diagrama: "Los reyes están en la misma columna con una casilla vacía en medio, y le toca mover al blanco: la oposición es del negro.",
      centro: [
        "Reyes en la misma columna o fila, con una casilla de por medio",
        "Quien tiene que mover se corre y le deja pasar al otro",
        "No es una curiosidad: es cómo se ganan y se salvan los finales de peones",
      ],
      bloques: [
        [
          "En cuanto queden solo reyes y peones",
          "Al empujar un peón pasado con el rey delante",
          "Al defender: tomar la oposición es la forma de parar al rey rival",
        ],
        [
          "Contar las casillas: entre los dos reyes tiene que quedar un número impar",
          "Tomarla cuando le toca mover al rival, nunca cuando toca a uno",
          "Usar la oposición lejana (tres o cinco casillas) para acercarse ganando",
        ],
        [
          "Avanzar el peón antes que el rey: el rey va primero",
          "Ponerse frente al rey rival cuando es el turno propio: la oposición se regala",
          "Contar las casillas mal por una: todo el final depende de eso",
        ],
        [
          "Es el final entero: rey y peón contra rey se gana o se salva por esto",
          "Con peones en los dos flancos manda la oposición lejana",
          "En Entrenamiento, el tema «Final de peones» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "torre-detras-del-peon",
      categoria: "concepto",
      titulo: "La torre va detrás del peón",
      subtitulo: "La regla de Tarrasch",
      nivel: 3,
      pieza: "r",
      fen: "r5k1/8/8/8/P7/8/6PP/R5K1 w - - 0 1",
      comprueba: { torreDetras: { torre: "a1", peon: "a4" } },
      resumen: "En los finales de torres, la torre se pone detrás del peón pasado: el propio y también el del rival.",
      diagrama: "El peón blanco de a4 tiene su torre detrás, en a1, y la torre negra lo espera de frente en a8.",
      centro: [
        "Detrás del peón propio, la torre gana libertad a cada paso que él avanza",
        "Detrás del peón rival, la torre lo frena y va perdiendo menos casillas",
        "Delante del peón, la torre queda encerrada y no hace nada más en toda la partida",
      ],
      bloques: [
        [
          "En cuanto aparece un peón pasado y quedan torres",
          "Al elegir con qué torre parar un peón que corre",
          "En los finales de torres, que son la mitad de los finales que se juegan",
        ],
        [
          "Poner la torre detrás ANTES de empujar el peón",
          "Cortar al rey rival por una columna o una fila mientras el peón avanza",
          "Llevar el rey propio delante del peón para darle lugar",
        ],
        [
          "Empujar el peón con la torre adelante y quedarse sin jugadas",
          "Defender el peón de costado cuando se podía defender desde atrás",
          "Cambiar torres con un peón de menos: el final de peones suele estar perdido",
        ],
        [
          "Es donde vive: el final de torres es su casa",
          "Una torre activa vale más que un peón: primero actividad, después material",
          "En Entrenamiento, el tema «Final de torres» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "regla-del-cuadrado",
      categoria: "concepto",
      titulo: "La regla del cuadrado",
      subtitulo: "¿Llega el rey o corona el peón?",
      nivel: 1,
      pieza: "p",
      fen: "8/8/8/2k4P/8/8/8/K7 w - - 0 1",
      comprueba: { cuadrado: { peon: "h5", rey: "c5", dentro: false } },
      resumen: "Se dibuja con la vista el cuadrado que va del peón a la casilla de coronar: si el rey no entra, no llega.",
      diagrama: "El peón blanco de h5 tiene por delante un cuadrado de cuatro casillas de lado, y el rey negro de c5 se quedó afuera: el peón corona.",
      centro: [
        "Se cuenta cuántas casillas le faltan al peón y se dibuja ese cuadrado hacia el rey",
        "Si el rey rival está dentro del cuadrado (o entra al mover), lo agarra",
        "Es una cuenta de dos segundos que evita calcular seis jugadas",
      ],
      bloques: [
        [
          "En cada final de peones, apenas uno queda pasado",
          "Al decidir si se cambia a un final de peones o no",
          "Cuando hay que elegir entre parar el peón o correr con el propio",
        ],
        [
          "Dibujar el cuadrado desde la casilla del peón, no desde la de al lado",
          "Acordarse de que el peón en su casilla de salida puede avanzar dos",
          "Meter el rey dentro del cuadrado antes de hacer cualquier otra cosa",
        ],
        [
          "Contar desde la fila equivocada y creer que se llega",
          "Olvidar el salto doble del peón desde su casilla inicial",
          "Aplicarla cuando hay más piezas: solo vale con reyes y peones",
        ],
        [
          "Es una regla de final puro: con piezas en el tablero hay que calcular",
          "Dos peones pasados unidos rompen la regla: uno de los dos pasa siempre",
          "En Entrenamiento, el tema «Final de peones» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "alfil-malo",
      categoria: "concepto",
      titulo: "El alfil malo",
      subtitulo: "Trabado detrás de sus peones",
      nivel: 2,
      pieza: "b",
      fen: "6k1/5ppp/8/3P4/4P3/5P2/2B5/6K1 w - - 0 1",
      comprueba: { alfilMalo: "w" },
      resumen: "Un alfil con todos sus peones en el mismo color de casilla mira una pared: hay que cambiarlo o mover los peones.",
      diagrama: "El alfil blanco es de casillas claras y sus tres peones —d5, e4 y f3— están todos en casillas claras: le tapan cada diagonal.",
      centro: [
        "Un alfil solo puede pisar la mitad del tablero: la de su color",
        "Si los peones propios están en ese mismo color, lo encierran",
        "El mismo alfil es bueno o malo según dónde estén los peones, no según la pieza",
      ],
      bloques: [
        [
          "En estructuras cerradas, donde los peones no se pueden mover",
          "En la francesa y en la Caro-Kann, con el alfil de casillas claras",
          "Cada vez que se avanza un peón: ahí se decide de qué color queda",
        ],
        [
          "Poner los peones propios en el color CONTRARIO al del alfil",
          "Cambiar el alfil malo antes de encerrarlo del todo",
          "Sacarlo fuera de la cadena, aunque cueste tres jugadas",
        ],
        [
          "Cambiar el alfil bueno y quedarse con el malo",
          "Avanzar peones al color del propio alfil sin pensarlo",
          "Cambiar peones en el color equivocado y no destrabarlo",
        ],
        [
          "En el final se siente el doble: no hay piezas que tapen el problema",
          "Alfil malo contra caballo suele ser final perdido",
          "En Entrenamiento, el tema «Final de alfiles» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "peon-dama-aislado",
      categoria: "concepto",
      titulo: "El peón dama aislado",
      subtitulo: "Fuerte en el medio juego, débil en el final",
      nivel: 3,
      pieza: "p",
      fen: "r1bq1rk1/pp3ppp/2n2n2/8/2BP4/5N2/PP3PPP/R1BQ1RK1 w - - 0 1",
      comprueba: { aislado: { color: "w", casilla: "d4" } },
      resumen: "Un peón sin vecinos que lo defiendan: da espacio y casillas mientras hay piezas, y se cae cuando no quedan.",
      diagrama: "El peón blanco de d4 no tiene peones en c ni en e: está aislado, pero le da a sus piezas las casillas e5 y c5 y dos columnas abiertas.",
      centro: [
        "No tiene peones vecinos, así que solo lo pueden defender piezas",
        "A cambio da espacio, dos columnas semiabiertas y la casilla de e5",
        "Es la posición donde más claro se ve que una debilidad puede ser una ventaja",
      ],
      bloques: [
        [
          "Sale del gambito de dama, de la Tarrasch y de media siciliana",
          "Cada vez que se recaptura en d4 o d5 con un peón de c o de e",
          "En la francesa Tarrasch, casi siempre",
        ],
        [
          "Quien lo tiene: atacar, cambiar pocas piezas y buscar el golpe d5",
          "Quien lo enfrenta: bloquearlo con una pieza en d5 y cambiar todo",
          "La casilla de delante del peón es la mejor del tablero: hay que ocuparla",
        ],
        [
          "Cambiar piezas teniéndolo: cada cambio lo deja más solo",
          "Atacarlo con peones en vez de bloquearlo con piezas",
          "Avanzarlo sin preparación y perderlo por nada",
        ],
        [
          "En el final es una debilidad fija: no se mueve y hay que defenderla",
          "Bloquear primero, comer después: el orden no cambia",
          "En Entrenamiento, el tema «Medio juego» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "rey-ahogado",
      categoria: "concepto",
      titulo: "El rey ahogado",
      subtitulo: "Medio punto de la nada",
      nivel: 1,
      pieza: "k",
      fen: "7k/8/6Q1/8/8/8/8/6K1 b - - 0 1",
      comprueba: { ahogado: true },
      resumen: "Sin jaque y sin ninguna jugada legal, la partida es tablas aunque falte una dama entera.",
      diagrama: "El rey negro está en h8, no está en jaque y la dama blanca de g6 le tapa g7, g8 y h7: no tiene ni una jugada, así que son tablas.",
      centro: [
        "Ahogado NO es mate: el rey no está en jaque, simplemente no tiene jugadas",
        "Son tablas, con dama de más o con una torre de más: da igual",
        "Es la forma más dolorosa de perder medio punto, y la más fácil de evitar",
      ],
      bloques: [
        [
          "Al final, cuando al rival le queda solo el rey",
          "Cuando se da jaque sin mirar si al rival le queda alguna jugada",
          "En posiciones perdidas, como último recurso del que va perdiendo",
        ],
        [
          "Antes de cada jugada, contar cuántas jugadas le quedan al rival",
          "Dejarle siempre una casilla libre mientras se acerca el rey propio",
          "Coronar torre en vez de dama cuando la dama ahogaría",
        ],
        [
          "Acorralar al rey con la dama sin acercar el rey propio",
          "Comerle la última pieza al rival sin mirar si le quedan jugadas",
          "Buscar el mate rápido en vez del mate seguro",
        ],
        [
          "El ahogado es cosa del final: casi no existe con piezas en el tablero",
          "Quien va perdiendo lo busca a propósito: entregar todo y quedar sin jugadas",
          "En Entrenamiento, el tema «Final de peones» de Ejercicios por tema",
        ],
      ],
    },
    {
      id: "cadena-de-peones",
      categoria: "concepto",
      titulo: "La cadena de peones",
      subtitulo: "Se ataca por la base",
      nivel: 2,
      pieza: "p",
      jugadas: ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6", "Nf3", "O-O", "Be2", "e5", "d5"],
      comprueba: { peonesEn: { color: "w", casillas: ["c4", "d5", "e4"] } },
      resumen: "Peones en diagonal que se defienden entre sí: el de adelante es fuerte y el de atrás es el blando.",
      diagrama: "El centro se trabó: los peones blancos quedaron en c4, d5 y e4, y los negros en d6 y e5, cada cadena mirando hacia un flanco distinto.",
      centro: [
        "Cada peón defiende al de adelante: el de la base no lo defiende nadie",
        "Por eso la cadena se ataca por la base, nunca por la punta",
        "La cadena también dice hacia dónde se juega: cada bando ataca del lado al que apunta",
      ],
      bloques: [
        [
          "En cuanto el centro se traba: francesa, india de rey, Benoni",
          "Después de un avance como e5 o d5 que cierra la posición",
          "Cuando ya no hay capturas posibles en el centro",
        ],
        [
          "Pegarle a la base con un peón, no con piezas",
          "Preparar la ruptura con todas las piezas puestas: la cadena no se va a ir",
          "Jugar del lado al que apunta la propia cadena, y no del otro",
        ],
        [
          "Atacar la punta de la cadena, que es justo la parte defendida",
          "Abrir el juego del lado donde el rival tiene más espacio",
          "Cambiar el peón de la base del rival y hacerle un favor",
        ],
        [
          "La cadena se congela: sus debilidades siguen ahí con menos piezas",
          "El peón de la base es el objetivo del final igual que del medio juego",
          "En Entrenamiento, el tema «Medio juego» de Ejercicios por tema",
        ],
      ],
    },
  ];

  var API = { FICHAS: FICHAS, TITULOS: TITULOS, CATEGORIAS: CATEGORIAS };
  if (typeof window !== "undefined") window.FichasEstudio = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
