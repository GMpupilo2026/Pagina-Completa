/**
 * Ajedrez Integral — banco de líneas de apertura y celadas.
 *
 * Cada línea es una secuencia de jugadas que el alumno memoriza jugándola en el
 * tablero: el entrenador mueve por el rival y el alumno tiene que dar TODAS las
 * jugadas de su color, de memoria.
 *
 * Las jugadas van en notación inglesa (SAN de chess.js) porque es la que el
 * motor entiende. La página las traduce a la notación de acá (C, A, T, D, R)
 * antes de enseñarlas: nadie tiene que leer "Nf3" en pantalla.
 *
 * Campos de cada línea:
 *   id        identificador estable. NO se cambia nunca: es la clave con la que
 *             queda guardado el avance de cada alumno en su cuenta.
 *   nombre    cómo se llama, en español de acá.
 *   apertura  a qué apertura pertenece (para agrupar).
 *   tipo      "celada" (gana material o da mate si el rival se equivoca) o
 *             "apertura" (línea principal que conviene saber).
 *   color     "w" o "b": de qué lado juega el alumno.
 *   nivel     1 principiante, 2 intermedio, 3 avanzado.
 *   jugadas   la línea entera, empezando siempre por la jugada 1 de las blancas.
 *   idea      para qué sirve, en una frase.
 *   clave     qué es lo que hay que recordar de verdad.
 *
 * AL TOCAR ESTE ARCHIVO, CORRER herramientas/verificar-aperturas.js: comprueba
 * con chess.js que cada jugada exista de verdad en su posición, que el jaque
 * mate prometido sea mate, que los ids no se repitan y que el alumno tenga al
 * menos tres jugadas que dar. Una línea con una jugada mal escrita no da error
 * en pantalla: simplemente el alumno no puede terminarla nunca.
 */
(function () {
  "use strict";

  var LINEAS = [
    // ===================== CELADAS =====================
    {
      id: "pastor-mate",
      nombre: "Mate del pastor",
      apertura: "Apertura italiana",
      tipo: "celada", color: "w", nivel: 1,
      jugadas: ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"],
      idea: "La dama y el alfil apuntan juntos a f7, la casilla más débil del negro al empezar.",
      clave: "Son dos piezas contra una casilla: el alfil en c4 sostiene a la dama cuando come en f7.",
    },
    {
      id: "pastor-refutacion",
      nombre: "Cómo parar el mate del pastor",
      apertura: "Apertura italiana",
      tipo: "celada", color: "b", nivel: 1,
      jugadas: ["e4", "e5", "Bc4", "Nc6", "Qh5", "g6", "Qf3", "Nf6"],
      idea: "Con g6 se gana un tiempo echando a la dama, y con Cf6 se tapa f7 y se ataca.",
      clave: "No defiendas f7 con la dama: échale la dama al rival y desarrolla con ataque.",
    },
    {
      id: "damiano",
      nombre: "El castigo de la defensa Damiano",
      apertura: "Defensa Damiano",
      tipo: "celada", color: "w", nivel: 1,
      jugadas: ["e4", "e5", "Nf3", "f6", "Nxe5", "fxe5", "Qh5+", "Ke7", "Qxe5+", "Kf7", "Bc4+", "Kg6", "Qf5+", "Kh6", "d4+", "g5", "h4"],
      idea: "Defender el peón de e5 con f6 es el error más caro que hay: cuesta la partida de una.",
      clave: "El caballo se entrega en e5 porque el peón de f6 ya no defiende nada: se llevó consigo la casa del rey.",
    },
    {
      id: "celada-legal",
      nombre: "Celada de Légal",
      apertura: "Defensa Philidor",
      tipo: "celada", color: "w", nivel: 2,
      jugadas: ["e4", "e5", "Bc4", "d6", "Nf3", "Bg4", "Nc3", "g6", "Nxe5", "Bxd1", "Bxf7+", "Ke7", "Nd5#"],
      idea: "Se entrega la dama para dar mate con tres piezas menores.",
      clave: "El caballo de f3 estaba clavado… pero la clavada no valía nada, porque tomar la dama pierde.",
    },
    {
      id: "blackburne",
      nombre: "Celada Blackburne",
      apertura: "Apertura italiana",
      tipo: "celada", color: "b", nivel: 2,
      jugadas: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nd4", "Nxe5", "Qg5", "Nxf7", "Qxg2", "Rf1", "Qxe4+", "Be2", "Nf3#"],
      idea: "El negro regala el peón de e5 y a cambio le cae encima al rey blanco.",
      clave: "Después de Cd4, comer en e5 es el error: la dama sale a g5 con dos amenazas a la vez.",
    },
    {
      id: "arca-de-noe",
      nombre: "Trampa del Arca de Noé",
      apertura: "Apertura española",
      tipo: "celada", color: "b", nivel: 3,
      jugadas: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "d6", "d4", "b5", "Bb3", "Nxd4", "Nxd4", "exd4", "Qxd4", "c5", "Qd5", "Be6", "Qc6+", "Bd7", "Qd5", "c4"],
      idea: "Los peones negros van cerrando la jaula hasta que el alfil blanco se queda sin casillas.",
      clave: "Tres peones —a6, b5 y c4— le quitan al alfil todas las diagonales. Se llama arca porque no se escapa.",
    },
    {
      id: "fegatello",
      nombre: "Ataque Fegatello (hígado frito)",
      apertura: "Defensa de los dos caballos",
      tipo: "celada", color: "w", nivel: 2,
      jugadas: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "Ng5", "d5", "exd5", "Nxd5", "Nxf7", "Kxf7", "Qf3+", "Ke6", "Nc3"],
      idea: "Se entrega un caballo para sacar al rey negro a pasear a la mitad del tablero.",
      clave: "No es mate forzado: es un rey en e6 sin poder enrocar. Hay que seguir jugando con ideas, no de memoria.",
    },
    {
      id: "dos-caballos-bien",
      nombre: "Contra el hígado frito: la jugada de Polerio",
      apertura: "Defensa de los dos caballos",
      tipo: "celada", color: "b", nivel: 2,
      jugadas: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "Ng5", "d5", "exd5", "Na5"],
      idea: "En vez de comer en d5 con el caballo, se ataca el alfil de c4 y se sale del problema.",
      clave: "Ca5 entrega un peón pero salva la partida. Cxd5 es justo lo que el blanco quiere.",
    },
    {
      id: "cambridge-springs",
      nombre: "Trampa de Cambridge Springs",
      apertura: "Gambito de dama declinado",
      tipo: "celada", color: "b", nivel: 3,
      jugadas: ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Nbd7", "cxd5", "exd5", "Nxd5", "Nxd5", "Bxd8", "Bb4+", "Qd2", "Bxd2+", "Kxd2", "Kxd8"],
      idea: "El caballo de d7 parece colgado, pero comerlo cuesta una pieza.",
      clave: "Tomar la dama no importa si el jaque intermedio recupera todo: Ab4+ es la jugada.",
    },
    {
      id: "albin-lasker",
      nombre: "Trampa de Lasker en la Albin",
      apertura: "Contragambito Albin",
      tipo: "celada", color: "b", nivel: 3,
      jugadas: ["d4", "d5", "c4", "e5", "dxe5", "d4", "e3", "Bb4+", "Bd2", "dxe3", "Bxb4", "exf2+", "Ke2", "fxg1=N+"],
      idea: "Termina con una coronación a caballo, no a dama, y por eso gana.",
      clave: "Coronar dama sería peor: el caballo da jaque y salva la torre. Coronar a algo que no es dama tiene nombre y sirve.",
    },
    {
      id: "gambito-dama-b5",
      nombre: "Aferrarse al peón del gambito",
      apertura: "Gambito de dama aceptado",
      tipo: "celada", color: "w", nivel: 2,
      jugadas: ["d4", "d5", "c4", "dxc4", "e3", "b5", "a4", "c6", "axb5", "cxb5", "Qf3"],
      idea: "El negro intenta guardarse el peón de c4 y pierde una torre por el camino.",
      clave: "La dama en f3 mira a la vez a a8 y a b7: el peón que defendía b5 ya no está.",
    },
    {
      id: "englund",
      nombre: "Trampa del gambito Englund",
      apertura: "Gambito Englund",
      tipo: "celada", color: "b", nivel: 2,
      jugadas: ["d4", "e5", "dxe5", "Nc6", "Nf3", "Qe7", "Bf4", "Qb4+", "Bd2", "Qxb2", "Bc3", "Bb4"],
      idea: "La dama negra se mete por la puerta de atrás a cazar peones y clava lo que encuentra.",
      clave: "Ab4 clava el alfil de c3 contra el caballo de b1: no hay cómo salvar las dos cosas.",
    },

    // ===================== APERTURAS ABIERTAS (1.e4 e5) =====================
    {
      id: "espanola-cerrada",
      nombre: "Española, variante cerrada",
      apertura: "Apertura española",
      tipo: "apertura", color: "w", nivel: 2,
      jugadas: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1", "b5", "Bb3", "d6", "c3", "O-O"],
      idea: "La apertura más jugada de la historia a alto nivel: presión lenta sobre e5 y el centro.",
      clave: "c3 no es una jugada perdida: prepara d4 y le da al alfil la casilla c2 para siempre.",
    },
    {
      id: "espanola-cambio",
      nombre: "Española, variante del cambio",
      apertura: "Apertura española",
      tipo: "apertura", color: "w", nivel: 1,
      jugadas: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Bxc6", "dxc6", "O-O"],
      idea: "Se cambia alfil por caballo y se juega a ganar el final con la mayoría de peones sana.",
      clave: "El negro queda con los dos alfiles; el blanco, con mejor estructura. Es un cambio de virtudes.",
    },
    {
      id: "italiana-giuoco",
      nombre: "Italiana, Giuoco Piano",
      apertura: "Apertura italiana",
      tipo: "apertura", color: "w", nivel: 1,
      jugadas: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d4", "exd4", "cxd4", "Bb4+"],
      idea: "La apertura de toda la vida: salen las piezas hacia el centro y después se empuja d4.",
      clave: "Después de d4, el jaque en b4 es la respuesta correcta: sin él, el blanco arma un centro enorme.",
    },
    {
      id: "escocesa",
      nombre: "Apertura escocesa",
      apertura: "Apertura escocesa",
      tipo: "apertura", color: "w", nivel: 1,
      jugadas: ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Nxd4", "Bc5", "Be3", "Qf6", "c3", "Nge7"],
      idea: "Se abre el centro de una vez, sin la maniobra lenta de la española.",
      clave: "El alfil en c5 ataca el caballo de d4: por eso Ae3 lo sostiene antes de que sea tarde.",
    },
    {
      id: "petrov",
      nombre: "Defensa rusa (Petrov)",
      apertura: "Defensa Petrov",
      tipo: "apertura", color: "b", nivel: 2,
      jugadas: ["e4", "e5", "Nf3", "Nf6", "Nxe5", "d6", "Nf3", "Nxe4", "d4", "d5"],
      idea: "En vez de defender e5, el negro copia: si me comes un peón, te como el tuyo.",
      clave: "d6 antes de comer en e4 es obligatorio. Comer de una da Dе2 y el caballo negro está perdido.",
    },
    {
      id: "gambito-de-rey",
      nombre: "Gambito de rey aceptado",
      apertura: "Gambito de rey",
      tipo: "apertura", color: "w", nivel: 3,
      jugadas: ["e4", "e5", "f4", "exf4", "Nf3", "g5", "h4", "g4", "Ne5"],
      idea: "Se entrega un peón por el centro y por la columna f abierta contra el rey negro.",
      clave: "h4 no es un ataque: es romper la cadena de peones g5-f4 antes de que se haga fuerte.",
    },

    // ===================== SICILIANA =====================
    {
      id: "siciliana-najdorf",
      nombre: "Siciliana Najdorf",
      apertura: "Defensa siciliana",
      tipo: "apertura", color: "b", nivel: 3,
      jugadas: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"],
      idea: "La defensa favorita de Fischer y de Kaspárov: peón menos en el centro, iniciativa a cambio.",
      clave: "a6 parece una jugada de peón tonta y es la clave: le quita b5 al caballo y al alfil blancos.",
    },
    {
      id: "siciliana-dragon",
      nombre: "Siciliana, variante del dragón",
      apertura: "Defensa siciliana",
      tipo: "apertura", color: "b", nivel: 3,
      jugadas: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "g6", "Be3", "Bg7"],
      idea: "El alfil de g7 apunta a toda la diagonal larga y es la pieza de la que sale todo.",
      clave: "El nombre viene de la forma de los peones. Ese alfil no se cambia por nada.",
    },
    {
      id: "siciliana-cerrada",
      nombre: "Siciliana cerrada",
      apertura: "Defensa siciliana",
      tipo: "apertura", color: "w", nivel: 1,
      jugadas: ["e4", "c5", "Nc3", "Nc6", "g3", "g6", "Bg2", "Bg7", "d3", "d6"],
      idea: "Para quien no quiere estudiar la teoría enorme de la siciliana abierta: se juega con plan, no de memoria.",
      clave: "Sin d4 no hay cambio en el centro: la partida se decide en las alas y con maniobras.",
    },

    // ===================== FRANCESA Y CARO-KANN =====================
    {
      id: "francesa-avance",
      nombre: "Francesa, variante del avance",
      apertura: "Defensa francesa",
      tipo: "apertura", color: "b", nivel: 2,
      jugadas: ["e4", "e6", "d4", "d5", "e5", "c5", "c3", "Nc6", "Nf3", "Qb6"],
      idea: "El blanco cierra el centro y el negro le pega a la base de la cadena, que es d4.",
      clave: "Se ataca la base, no la punta: d4 está sostenido por c3, así que hay que sumar piezas a d4.",
    },
    {
      id: "francesa-tarrasch",
      nombre: "Francesa, variante Tarrasch",
      apertura: "Defensa francesa",
      tipo: "apertura", color: "w", nivel: 2,
      jugadas: ["e4", "e6", "d4", "d5", "Nd2", "c5", "exd5", "exd5", "Ngf3", "Nc6"],
      idea: "El caballo va a d2 y no a c3 para no comerse la clavada con Ab4.",
      clave: "Cd2 tapa al alfil de c1 un rato: es el precio de evitar la clavada, y se resuelve con Cgf3 y Ad3.",
    },
    {
      id: "caro-kann-clasica",
      nombre: "Caro-Kann clásica",
      apertura: "Defensa Caro-Kann",
      tipo: "apertura", color: "b", nivel: 2,
      jugadas: ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bf5", "Ng3", "Bg6", "h4", "h6"],
      idea: "Se juega c6 antes que d5 justamente para poder sacar el alfil de c8, que en la francesa queda encerrado.",
      clave: "h6 hay que jugarlo: sin eso viene h5 y el alfil de g6 se queda sin casillas.",
    },
    {
      id: "caro-kann-avance",
      nombre: "Caro-Kann, avance",
      apertura: "Defensa Caro-Kann",
      tipo: "apertura", color: "b", nivel: 1,
      jugadas: ["e4", "c6", "d4", "d5", "e5", "Bf5", "Nf3", "e6", "Be2", "c5"],
      idea: "El alfil sale ANTES de cerrar con e6: esa es toda la gracia de la Caro-Kann.",
      clave: "Primero Af5, después e6. Al revés, el alfil queda enterrado como en la francesa.",
    },
    {
      id: "escandinava",
      nombre: "Defensa escandinava",
      apertura: "Defensa escandinava",
      tipo: "apertura", color: "b", nivel: 1,
      jugadas: ["e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5", "d4", "Nf6", "Nf3", "Bf5"],
      idea: "Se cambia el peón central de una vez; la dama sale temprano pero a una casilla donde no la echan.",
      clave: "Da5 y no Dd8: desde a5 la dama clava el caballo de c3 y el negro gana tiempo de desarrollo.",
    },
    {
      id: "pirc",
      nombre: "Defensa Pirc",
      apertura: "Defensa Pirc",
      tipo: "apertura", color: "b", nivel: 2,
      jugadas: ["e4", "d6", "d4", "Nf6", "Nc3", "g6", "Nf3", "Bg7", "Be2", "O-O"],
      idea: "Se le deja el centro al blanco a propósito, para atacarlo después con piezas.",
      clave: "Es una apertura hipermoderna: el centro se controla desde lejos, no se ocupa.",
    },
    {
      id: "alekhine",
      nombre: "Defensa Alekhine",
      apertura: "Defensa Alekhine",
      tipo: "apertura", color: "b", nivel: 3,
      jugadas: ["e4", "Nf6", "e5", "Nd5", "d4", "d6", "Nf3", "dxe5", "Nxe5", "c6"],
      idea: "El caballo se deja perseguir para que los peones blancos avancen demasiado y queden débiles.",
      clave: "Cada jugada de peón que hace el blanco persiguiendo el caballo es una debilidad para el final.",
    },

    // ===================== APERTURAS DE 1.d4 =====================
    {
      id: "gambito-dama-declinado",
      nombre: "Gambito de dama declinado",
      apertura: "Gambito de dama",
      tipo: "apertura", color: "b", nivel: 2,
      jugadas: ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7", "e3", "O-O", "Nf3", "h6"],
      idea: "La forma más sólida de contestar al gambito de dama: no se toma el peón y se arma una fortaleza.",
      clave: "El problema del negro es siempre el alfil de c8. Todos los planes pasan por sacarlo.",
    },
    {
      id: "eslava",
      nombre: "Defensa eslava",
      apertura: "Defensa eslava",
      tipo: "apertura", color: "b", nivel: 2,
      jugadas: ["d4", "d5", "c4", "c6", "Nf3", "Nf6", "Nc3", "dxc4", "a4", "Bf5"],
      idea: "Se sostiene d5 con c6 en vez de con e6, y así el alfil de c8 sí puede salir.",
      clave: "a4 frena b5: sin ese peón, el negro no puede quedarse con el de c4.",
    },
    {
      id: "nimzoindia",
      nombre: "Defensa Nimzoindia",
      apertura: "Defensa india",
      tipo: "apertura", color: "b", nivel: 3,
      jugadas: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4", "e3", "O-O", "Bd3", "d5"],
      idea: "El alfil clava el caballo de c3 y con eso le quita al blanco el control de e4.",
      clave: "Cambiar alfil por caballo no es malo acá: a cambio, el blanco queda con peones doblados en c.",
    },
    {
      id: "india-de-rey",
      nombre: "India de rey",
      apertura: "Defensa india",
      tipo: "apertura", color: "b", nivel: 3,
      jugadas: ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6", "Nf3", "O-O", "Be2", "e5"],
      idea: "Se deja que el blanco arme un centro enorme para romperlo después con e5 o c5.",
      clave: "e5 es la jugada de toda la apertura: sin esa ruptura, el negro se queda sin espacio y sin juego.",
    },
    {
      id: "grunfeld",
      nombre: "Defensa Grünfeld",
      apertura: "Defensa india",
      tipo: "apertura", color: "b", nivel: 3,
      jugadas: ["d4", "Nf6", "c4", "g6", "Nc3", "d5", "cxd5", "Nxd5", "e4", "Nxc3", "bxc3", "Bg7"],
      idea: "Es la india de rey al revés: el negro cambia en el centro en vez de cerrarlo.",
      clave: "El centro blanco se ve imponente y es justo el objetivo: el alfil de g7 y c5 lo van a atacar.",
    },
    {
      id: "india-de-dama",
      nombre: "India de dama",
      apertura: "Defensa india",
      tipo: "apertura", color: "b", nivel: 2,
      jugadas: ["d4", "Nf6", "c4", "e6", "Nf3", "b6", "g3", "Bb7", "Bg2", "Be7"],
      idea: "Los dos bandos ponen su alfil en la diagonal larga y pelean por la casilla e4.",
      clave: "Toda la apertura es una pelea por e4. El alfil de b7 es quien la pelea.",
    },
    {
      id: "sistema-londres",
      nombre: "Sistema Londres",
      apertura: "Sistema Londres",
      tipo: "apertura", color: "w", nivel: 1,
      jugadas: ["d4", "d5", "Nf3", "Nf6", "Bf4", "e6", "e3", "c5", "c3", "Nc6", "Nbd2", "Bd6"],
      idea: "El mismo armado contra casi todo lo que juegue el negro: ideal para empezar sin estudiar teoría.",
      clave: "El alfil sale a f4 ANTES de jugar e3. Al revés se queda encerrado detrás de sus peones.",
    },
    {
      id: "holandesa",
      nombre: "Defensa holandesa",
      apertura: "Defensa holandesa",
      tipo: "apertura", color: "b", nivel: 2,
      jugadas: ["d4", "f5", "g3", "Nf6", "Bg2", "e6", "Nf3", "Be7", "O-O", "O-O"],
      idea: "Se pelea por e4 desde la primera jugada y se juega a atacar el enroque blanco.",
      clave: "f5 debilita la diagonal a2-g8 y el rey propio. Es una apertura de doble filo, no para jugar distraído.",
    },
    {
      id: "inglesa",
      nombre: "Apertura inglesa",
      apertura: "Apertura inglesa",
      tipo: "apertura", color: "w", nivel: 2,
      jugadas: ["c4", "e5", "Nc3", "Nf6", "Nf3", "Nc6", "g3", "d5", "cxd5", "Nxd5"],
      idea: "Es una siciliana con los colores cambiados, y con un tiempo de más.",
      clave: "Se juega el centro desde los flancos: el alfil de g2 va a mirar toda la diagonal larga.",
    },
  ];

  // Cuántas jugadas tiene que dar el alumno en una línea.
  function jugadasDelAlumno(linea) {
    var mias = 0;
    for (var i = 0; i < linea.jugadas.length; i++) {
      var deBlancas = i % 2 === 0;
      if ((linea.color === "w") === deBlancas) mias += 1;
    }
    return mias;
  }

  var api = { LINEAS: LINEAS, jugadasDelAlumno: jugadasDelAlumno };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.AperturasLineas = api;
})();
