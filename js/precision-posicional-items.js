/* ===== Ajedrez Integral — Banco del Evaluador de precisión posicional =====
 *
 * No es un banco de táctica: en ninguna de estas posiciones hay una jugada
 * que dé jaque mate de inmediato (herramientas/verificar-precision-posicional.js
 * lo comprueba con chess.js, probando TODAS las jugadas legales de cada
 * posición). Lo que se pide es el PLAN correcto a largo plazo: mejorar la
 * peor pieza, abrir o disputar una columna o diagonal, decidir qué cambiar y
 * qué conservar, fijar y atacar una debilidad, sostener una ventaja de
 * espacio, elegir el flanco de ataque, decidir sobre la estructura de
 * peones, o transformar una ventaja rumbo al final.
 *
 * NINGUNA POSICIÓN SE PRESENTA COMO SI FUERA DE UNA PARTIDA REAL. Son
 * posiciones ilustrativas, construidas a mano para mostrar con claridad un
 * solo motivo estratégico clásico — el mismo criterio de cualquier manual de
 * estrategia (Silman, Aagaard): un diagrama instructivo no necesita salir de
 * una partida concreta. Lo que este repositorio no puede repetir es el error
 * que ya cometió una vez con una «Lucena» que no era Lucena: prometer un
 * resultado (mate, ganancia de material, tablas) que el motor no confirma.
 * Acá no se promete nada de eso — se pide un juicio posicional, que lo pone
 * quien escribió el ítem, no un motor— así que el campo `fuente` describe el
 * TIPO de estructura («peón aislado de dama», «estructura Carlsbad») y NUNCA
 * atribuye la posición a una partida ni a un jugador concreto: inventar una
 * cita sería peor que decir con todas las letras que es ilustrativa.
 *
 * Cada ítem: { id, area, dificultad (1-3), fen, turno, enunciado, opciones
 * (4), correcta (índice), explica, fuente }. Las áreas están descritas en
 * js/precision-posicional-criterio.js —ese archivo separa el CRITERIO (qué
 * mide cada área, qué estudiar) del banco, la misma separación que ya usan
 * js/arbitraje-items.js + js/arbitraje-nivel.js y js/diagnostico-items.js +
 * js/plan-entrenamiento.js—.
 *
 * NADA DE CRONÓMETRO, A PROPÓSITO. Un ejercicio de táctica se cronometra
 * porque la solución tiene que verse rápido o no vale; acá es al revés: la
 * idea completa de este entrenamiento es dar el tiempo que haga falta para
 * PENSAR el plan, no premiar a quien contesta rápido. entreno/precision-
 * posicional.html no trae ningún reloj.
 */

(function () {
  "use strict";

  const ITEMS = [

    /* ================= mejorar_pieza ================= */
    {
      id: "pp_mejorar_01", area: "mejorar_pieza", dificultad: 1, turno: "blancas",
      fen: "3r2k1/pp1b1ppp/2p1p3/3p4/4P3/1PN3P1/P4PKP/3R4 w - - 0 24",
      enunciado: "El centro está cerrado y el alfil negro de d7 no tiene ninguna diagonal: sus propios peones de c6, d5 y e6 se la tapan. ¿Cuál es el plan correcto para las blancas?",
      opciones: [
        "Cambiar el propio alfil bueno por el caballo negro, para simplificar hacia un final.",
        "Reubicar el caballo hacia c5, un puesto que el alfil negro nunca podrá disputarle.",
        "Empujar e4-e5 de inmediato, para ganar más espacio en el centro.",
        "Doblar las dos torres en la columna «d», que hoy sigue cerrada.",
      ],
      correcta: 1,
      explica: "Con el alfil de d7 encerrado por su propia cadena de peones, la pieza que manda en la posición es el caballo blanco: un puesto como c5 —al que ningún peón ni alfil negro puede llegar— lo convierte en una pieza muy superior al alfil rival. Cambiarlo (A) regala precisamente la ventaja; e4-e5 (C) cierra aún más la diagonal que ya estaba cerrada; la columna «d» (D) sigue tapada por peones, así que doblar torres ahí no logra nada todavía.",
      fuente: "Posición ilustrativa: estructura cerrada tipo francesa, con el alfil de casillas claras encerrado por sus propios peones.",
    },
    {
      id: "pp_mejorar_02", area: "mejorar_pieza", dificultad: 2, turno: "blancas",
      fen: "r2q1rk1/pppn1ppp/4p3/8/2P1P3/2N5/PP1Q1PPP/R4RK1 w - - 0 20",
      enunciado: "La torre de a1 no tiene ninguna columna abierta por delante y el resto de la posición está equilibrado. ¿Cuál es el plan correcto para mejorar la peor pieza blanca?",
      opciones: [
        "Dejarla quieta: una torre en la primera fila siempre está bien colocada.",
        "Subirla a la tercera fila y trasladarla por ahí hacia el ala de rey.",
        "Cambiarla por la torre pasiva de a8, ya que las dos están igual de mal.",
        "Avanzar el peón «a» para abrirle una columna, aunque debilite al rey propio.",
      ],
      correcta: 1,
      explica: "Cuando una torre no tiene columna que abrir pronto, el recurso clásico es el «ascensor de torre»: subirla por su propia tercera fila (libre de piezas) y trasladarla por ahí hacia donde sí hace falta, normalmente el ala de rey. Dejarla quieta (A) es resignarse a tener una pieza pasiva; cambiarla (C) regala la única pieza que se puede activar sin concesiones; abrir la columna «a» a la fuerza (D) desorganiza los propios peones del rey a cambio de activar una sola torre.",
      fuente: "Posición ilustrativa: torre trabada detrás de su propia cadena de peones, con la tercera fila libre para maniobrar.",
    },
    {
      id: "pp_mejorar_03", area: "mejorar_pieza", dificultad: 2, turno: "blancas",
      fen: "3r2k1/p3bpp1/1pp4p/3p4/4P3/P5P1/1PP1BP1P/3R2K1 w - - 0 26",
      enunciado: "El alfil blanco de e2 apenas ve el juego, encerrado detrás de sus propios peones centrales, mientras que el negro de e7 sí tiene diagonales libres. ¿Cuál es el plan correcto?",
      opciones: [
        "Cambiar los alfiles a la primera oportunidad que aparezca.",
        "Buscarle al alfil una ruta distinta, del tipo e2-d3-c4 o e2-f3-g2.",
        "Renunciar a mejorar el alfil y jugar todo el plan en el otro flanco.",
        "Cerrar aún más el centro con d3-d4, para igualar la mala suerte del alfil.",
      ],
      correcta: 1,
      explica: "Un alfil «malo» casi siempre se puede rescatar buscándole una diagonal distinta a la que sus propios peones le taparon: acá e2-d3(-c4) o e2-f3(-g2) lo sacan de detrás de la cadena de peones. Cambiar alfiles (A) es justo lo que NO conviene cuando el propio es el peor —es el rival quien gana con ese cambio—; ignorar la pieza (C) deja una pieza floja para el resto de la partida; cerrar más el centro (D) no arregla nada mientras el propio alfil siga encerrado.",
      fuente: "Posición ilustrativa: alfil de casillas oscuras tapado por su propia cadena de peones centrales, con ruta de escape disponible.",
    },

    /* ================= columnas_diagonales ================= */
    {
      id: "pp_columnas_01", area: "columnas_diagonales", dificultad: 1, turno: "blancas",
      fen: "r2r2k1/pb3ppp/2n5/8/8/1PN5/PB3PPP/R2R2K1 w - - 0 22",
      enunciado: "Los peones «d» se cambiaron hace unas jugadas y la columna «d» quedó completamente abierta. ¿Cuál es el plan correcto para las blancas?",
      opciones: [
        "No prestarle atención y avanzar los peones del ala de dama.",
        "Doblar las dos torres en la columna «d» antes de que el rival la ocupe.",
        "Cambiar las dos torres propias por las del rival, para simplificar.",
        "Llevar el caballo a d5 sin apoyo de ninguna otra pieza.",
      ],
      correcta: 1,
      explica: "Una columna abierta se ocupa, y se ocupa con las DOS torres si se puede: quien dobla primero suele terminar controlándola y usándola para penetrar en la séptima u octava fila rival. Ignorarla (A) regala el único elemento dinámico de la posición; cambiar las torres (C) tira a la basura la ventaja de ser quien llegó primero a la columna; meter el caballo sin apoyo (D) es simplemente perder una pieza.",
      fuente: "Posición ilustrativa: columna «d» abierta tras el cambio de los peones centrales, con las torres todavía en su casilla de origen.",
    },
    {
      id: "pp_columnas_02", area: "columnas_diagonales", dificultad: 2, turno: "blancas",
      fen: "r4rk1/pp1q1ppp/2pbp3/8/8/1P2P3/PBPQ1PPP/R4RK1 w - - 0 18",
      enunciado: "El alfil blanco de b2 apunta directo a g7, pero hoy tiene su propio peón de e3 tapándole a mitad de camino la diagonal larga. ¿Cuál es el plan correcto?",
      opciones: [
        "Cambiar ese alfil por el alfil negro de d6, que no hace nada especial.",
        "Preparar el cambio o el avance del peón de e3, para despejar la diagonal.",
        "Retirar el alfil a c1, ya que en b2 está mal colocado.",
        "Avanzar los peones del ala de dama, sin tocar nada en el centro.",
      ],
      correcta: 1,
      explica: "Un alfil «fianchettado» con su propio peón central tapando la diagonal es una pieza en potencia, no una pieza mala: el plan es abrir esa diagonal (empujando o cambiando el peón que la tapa), no cambiar el alfil ni retirarlo. Cambiarlo (A) o retirarlo (C) renuncia justo a la pieza que puede decidir la partida apuntando al rey rival; ignorar el centro (D) deja la diagonal cerrada para siempre.",
      fuente: "Posición ilustrativa: fianchetto de dama con la diagonal larga temporalmente tapada por el propio peón central.",
    },
    {
      id: "pp_columnas_03", area: "columnas_diagonales", dificultad: 3, turno: "blancas",
      fen: "2rq1rk1/pp3ppp/1n1bp3/8/4P3/2NB4/PP3PPP/2RQ1RK1 w - - 0 20",
      enunciado: "La columna «c» todavía está cerrada por los peones, pero un solo cambio la abriría de par en par frente al rey negro, enrocado corto con su torre ya en c8. ¿Qué plan tiene más sentido para las blancas?",
      opciones: [
        "Provocar el cambio y ocupar la columna «c» antes que el rival.",
        "Evitar cualquier cambio en el ala de dama y jugar solo en el centro.",
        "Enrocar largo, para alejar al propio rey de esa columna.",
        "Cambiar las damas de inmediato, para que la columna ya no importe.",
      ],
      correcta: 0,
      explica: "Cuando una columna que se va a abrir apunta hacia el rey rival, conviene ser quien la abre y quien la ocupa primero: la torre en c8 negra compite por esa misma columna, así que llegar antes decide quién la controla. Evitar el cambio (B) deja la iniciativa en manos del rival; enrocar largo (C) no resuelve nada de la columna «c» en sí; cambiar damas (D) apaga precisamente el ataque que la columna abierta puede producir.",
      fuente: "Posición ilustrativa: columna «c» semiabierta apuntando hacia el flanco del rey enrocado corto.",
    },

    /* ================= cambios ================= */
    {
      id: "pp_cambios_01", area: "cambios", dificultad: 1, turno: "blancas",
      fen: "2br1rk1/pp3ppp/4pn2/8/4P3/2NB4/PP3PPP/3R1RK1 w - - 0 24",
      enunciado: "El alfil blanco de d3 es claramente mejor que el alfil negro de c8, encerrado detrás de su propia cadena de peones. El caballo negro de f6, en cambio, es una pieza activa. ¿Qué cambio conviene buscar?",
      opciones: [
        "Cambiar el propio alfil bueno por el alfil malo rival.",
        "Buscar el cambio del caballo activo rival y conservar el alfil bueno.",
        "Cambiar las dos torres lo antes posible, sea como sea.",
        "Evitar cualquier cambio y mantener las cuatro piezas en el tablero.",
      ],
      correcta: 1,
      explica: "La regla es simple y se olvida seguido: se cambian las piezas MALAS propias por las piezas BUENAS rivales, y se conservan las piezas buenas propias. Acá el alfil de d3 es la mejor pieza blanca —no hay que cambiarlo (A)— y lo que conviene eliminar es el caballo activo negro, no las torres al azar (C) ni negarse a cambiar nada (D), que deja al caballo rival maniobrando libremente.",
      fuente: "Posición ilustrativa: alfil bueno blanco contra alfil malo negro, con un caballo negro activo que conviene neutralizar.",
    },
    {
      id: "pp_cambios_02", area: "cambios", dificultad: 2, turno: "blancas",
      fen: "r4rk1/1p1q1p1p/2p1p1p1/3n4/4P3/2N2N2/PPPQ1PPP/R4RK1 w - - 0 16",
      enunciado: "El caballo negro de d5 controla el centro; a cambio, las blancas tienen un peón de más espacio. ¿Cuál es el plan correcto respecto a ese caballo?",
      opciones: [
        "Cambiarlo cuanto antes con Nxd5, aunque eso sane la estructura rival.",
        "Dejarlo ahí para siempre y jugar en otro sector del tablero.",
        "Presionarlo con c2-c4 y decidir después cómo se resuelve.",
        "Avanzar e4-e5 de inmediato, sin mirar qué pasa con el propio centro.",
      ],
      correcta: 2,
      explica: "Un caballo centralizado en un puesto fuerte no siempre conviene cambiarlo de cualquier manera: c2-c4 lo presiona y obliga a que sea el rival quien decida —retirarlo, perdiendo tiempo, o dejarse cambiar en la casilla y del modo que más le convenga a las blancas—. Cambiarlo directo con Nxd5 (A) puede regalarle al rival una estructura de peones sana después de …exd5 o …cxd5; ignorarlo (B) deja esa pieza controlando el centro toda la partida; e4-e5 sin más (D) abre líneas sin haber resuelto primero qué pasa con el caballo.",
      fuente: "Posición ilustrativa: caballo centralizado que conviene presionar antes de decidir el cambio.",
    },
    {
      id: "pp_cambios_03", area: "cambios", dificultad: 2, turno: "blancas",
      fen: "r2q1rk1/pnp2ppp/4p3/5b2/4P3/2NB4/PP3PPP/RB1Q1RK1 w - - 0 18",
      enunciado: "Las blancas conservan los dos alfiles; el negro cambió uno de los suyos y le queda el alfil de f5, muy activo, contra el caballo pasivo de b7. ¿Cuál es el plan correcto para las blancas?",
      opciones: [
        "Cambiar el alfil «malo» de d3 por el activo alfil negro de f5.",
        "Cambiar el alfil bueno de b1 por el caballo pasivo negro de b7.",
        "Evitar todo cambio de piezas menores y jugar solo con las torres.",
        "Cambiar las dos torres primero y las piezas menores después.",
      ],
      correcta: 0,
      explica: "Con la pareja de alfiles ya no hace falta aferrarse a los dos si uno estorba: acá el alfil de d3 no tiene un objetivo claro, así que cambiarlo por el alfil activo de f5 deja a las blancas con alfil bueno (b1) contra caballo —la combinación de piezas menores más favorable— en vez de con dos alfiles de valor desigual. Cambiar el alfil de la pareja que SÍ funciona (B) es justo al revés de lo que conviene; no cambiar nada (C) deja al alfil de f5 dominando; las torres (D) no son el problema de esta posición.",
      fuente: "Posición ilustrativa: pareja de alfiles con uno de ellos claramente menos útil que el activo alfil rival.",
    },

    /* ================= debilidades ================= */
    {
      id: "pp_debilidades_01", area: "debilidades", dificultad: 1, turno: "blancas",
      fen: "r1br2k1/pp3ppp/3p1n2/8/2P5/2NB4/PP3PPP/R2R2K1 w - - 0 22",
      enunciado: "El peón negro de d6 quedó retrasado y sin ningún otro peón negro que lo pueda defender por delante: es una debilidad fija. ¿Cuál es el plan correcto para atacarla?",
      opciones: [
        "Ignorarlo y atacar al rey con un avance de peones en el ala de rey.",
        "Ocupar la columna «d» con las piezas y presionar el peón con calma.",
        "Cambiar todas las piezas menores para llegar a un final de torres.",
        "Avanzar el propio peón «c» hasta c5, aunque ceda la casilla d5.",
      ],
      correcta: 1,
      explica: "Un peón débil y fijo (retrasado en columna semiabierta) se ataca acumulando presión sobre él, empezando por ocupar su columna: tarde o temprano el rival tiene que dedicar piezas solo a defenderlo, lo que deja el resto de su posición floja. Atacar al rey sin preparar nada (A) ignora la ventaja ya conseguida; cambiar piezas sin más (C) no ataca la debilidad, solo simplifica; c4-c5 (D) le regala al rival la casilla d5 sin necesidad.",
      fuente: "Posición ilustrativa: peón retrasado en columna semiabierta, típico de estructuras con el peón «d» rezagado.",
    },
    {
      id: "pp_debilidades_02", area: "debilidades", dificultad: 2, turno: "blancas",
      fen: "r1b2rk1/pppq1p2/1n2p2p/8/4P3/2NB4/PPPQ1PPP/R4RK1 w - - 0 18",
      enunciado: "Un avance anterior de peones negros en el ala de rey dejó huecos permanentes alrededor del rey enrocado. ¿Cuál es el mejor plan para las blancas?",
      opciones: [
        "Cambiar todas las piezas posibles para llegar a un final tranquilo.",
        "Llevar piezas —dama y torre incluidas— hacia el ala de rey rival.",
        "Avanzar los propios peones del ala de dama, sin mirar el rey rival.",
        "Retirar la propia dama del centro, para protegerla de cualquier cambio.",
      ],
      correcta: 1,
      explica: "Cuando la debilidad no es un peón sino los huecos alrededor del rey rival, el plan es llevar piezas —sobre todo las de largo alcance— hacia ese sector: son casillas que ya no se pueden tapar con un peón. Cambiar piezas (A) reduce justamente el material con el que se ataca; jugar en el otro flanco (C) ignora la debilidad ya creada; esconder la dama (D) la aleja de donde puede hacer más daño.",
      fuente: "Posición ilustrativa: huecos permanentes alrededor del rey enrocado, típicos tras un avance de peones mal calculado.",
    },
    {
      id: "pp_debilidades_03", area: "debilidades", dificultad: 3, turno: "blancas",
      fen: "r1b2rk1/p4ppp/1n1pp3/8/1P2P3/2NB4/P1P2PPP/R4RK1 w - - 0 26",
      enunciado: "El peón negro de a7 quedó aislado en la columna «a» tras varios cambios en ese flanco. ¿Cuál es el plan correcto?",
      opciones: [
        "Atacarlo con la torre por la columna «a», sin apurarse a ganarlo.",
        "Jugar b4-b5 enseguida, aunque eso le dé al rival la casilla c5.",
        "Cambiar la propia torre de a1 por la torre rival de a8.",
        "Olvidarse del peón de a7 y buscar la partida en el centro.",
      ],
      correcta: 0,
      explica: "Un peón débil se puede ganar, pero casi nunca de una sola jugada: se acumula presión con calma —torre primero, después la pieza que haga falta— y se aprovecha que el rival tiene que quedarse defendiéndolo. Precipitarse con b4-b5 (B) regala la casilla c5 sin necesidad; cambiar la torre que ataca (C) es renunciar a la única pieza que ya está presionando la debilidad; ignorarla (D) tira la ventaja conseguida.",
      fuente: "Posición ilustrativa: peón aislado en el borde del tablero, típico de un final de torres con un flanco de peones reducido.",
    },

    /* ================= espacio_restriccion ================= */
    {
      id: "pp_espacio_01", area: "espacio_restriccion", dificultad: 1, turno: "blancas",
      fen: "r1br2k1/pp3ppp/4pn2/3P4/2P5/2NB4/PP3PPP/R2R2K1 w - - 0 20",
      enunciado: "Las blancas tienen un peón avanzado en d5 que le quita al caballo negro de f6 esa casilla y le resta espacio a toda la posición negra. ¿Cuál es el plan correcto?",
      opciones: [
        "Cambiarlo lo antes posible, porque un peón adelantado siempre es débil.",
        "Sostenerlo con piezas y usar la ventaja de espacio para maniobrar.",
        "Empujarlo a d6 de inmediato, sin ninguna pieza que lo defienda ahí.",
        "Retirar todas las piezas a la primera fila antes de decidir cualquier plan.",
      ],
      correcta: 1,
      explica: "Un peón avanzado y bien sostenido no es una debilidad: es la base de una ventaja de espacio, porque le quita al rival casillas centrales (acá, d5) y le deja a las propias piezas más sitio para maniobrar. Cambiarlo (A) regala esa ventaja sin necesidad; empujarlo sin apoyo (C) sí lo convertiría en débil; reagrupar sin plan (D) desperdicia el tiempo que la ventaja de espacio permite invertir en preparar el ataque.",
      fuente: "Posición ilustrativa: peón central avanzado y sostenido, típico de estructuras tipo Benoni o india de rey con d5.",
    },
    {
      id: "pp_espacio_02", area: "espacio_restriccion", dificultad: 2, turno: "blancas",
      fen: "rnb2rk1/pp1q1ppp/2p5/2p1P3/4P3/2N5/PPPB1PPP/R2Q1RK1 w - - 0 14",
      enunciado: "El peón blanco de e5 le quita al caballo negro de b8 su casilla natural (f6) y a todo el desarrollo negro le cuesta encontrar sitio. ¿Cuál es el plan correcto?",
      opciones: [
        "Cambiarlo cuanto antes, por miedo a que se debilite con el tiempo.",
        "Sostenerlo y aprovechar que restringe el desarrollo rival mientras dure.",
        "Avanzarlo a e6 de inmediato, sin ninguna pieza que lo apoye ahí.",
        "Cambiar las damas, para bajar la tensión de la posición.",
      ],
      correcta: 1,
      explica: "Un peón avanzado que le tapa al rival su casilla de desarrollo natural cumple su función mientras siga en el tablero: sostenerlo (reforzándolo con f4 u otras piezas) mantiene esa restricción todo el tiempo que se pueda. Cambiarlo por miedo (A) regala la ventaja sin que el rival tenga que ganársela; avanzarlo sin apoyo (C) sí lo pone en peligro real; cambiar damas (D) no tiene nada que ver con este problema concreto.",
      fuente: "Posición ilustrativa: peón de e5 restringiendo el desarrollo natural del caballo rival, estructura típica de aperturas francesas o Alekhine.",
    },
    {
      id: "pp_espacio_03", area: "espacio_restriccion", dificultad: 2, turno: "blancas",
      fen: "r1br2k1/1p3ppp/p1pp1n2/8/P1P1P3/2NB4/1P3PPP/R2R2K1 w - - 0 22",
      enunciado: "La mayoría de peones blancos en el ala de dama (a4, c4 contra a6, b7, c6) le permite a las blancas avanzar a5 y restarle espacio a las piezas negras de ese flanco. ¿Cuál es el plan correcto?",
      opciones: [
        "Abrir el centro con d4-d5, dejando de lado el ala de dama.",
        "Avanzar a4-a5, fijando los peones negros de ese flanco.",
        "Cambiar el peón «a» propio por el peón «a» rival, sin más.",
        "Retirar el peón a a3, para no arriesgarlo tan adelantado.",
      ],
      correcta: 1,
      explica: "Con una mayoría de peones en un flanco (a4, c4 contra a6, b7, c6), el avance típico es el que fija al rival y le quita espacio: a4-a5 clava el peón de a6 y reduce la movilidad de las piezas negras en ese sector, preparando además presionar con las piezas por la columna «a» o «b». Abandonar el flanco (A) desperdicia la mayoría ya conseguida; cambiar el peón (C) elimina precisamente la base de la ventaja; retirarlo (D) renuncia al espacio sin ninguna razón.",
      fuente: "Posición ilustrativa: mayoría de peones en el ala de dama, típica de la estructura Carlsbad, con el avance de minoría en marcha.",
    },

    /* ================= flanco_ataque ================= */
    {
      id: "pp_flanco_01", area: "flanco_ataque", dificultad: 2, turno: "blancas",
      fen: "rk1q1r2/pppb1pp1/2n1p3/8/4P3/2NB4/PPP2PPP/R2Q1RK1 w - - 0 16",
      enunciado: "Las blancas enrocaron corto y el rey negro enrocó largo: cada bando tiene el rey en un flanco distinto. ¿Cuál es el plan correcto para las blancas?",
      opciones: [
        "Avanzar los propios peones del ala de rey, aunque destapen al rey.",
        "Avanzar los peones del ala de dama contra el rey negro enrocado largo.",
        "Mantener intactos los peones de los dos flancos y jugar solo con piezas.",
        "Enrocar otra vez, buscando quedar en el mismo flanco que el rival.",
      ],
      correcta: 1,
      explica: "Con los reyes enrocados en flancos opuestos, la carrera de peones va HACIA el rey rival y no hacia el propio: acá conviene lanzar los peones de dama (a, b, c) contra el rey negro, porque esos peones no protegen al propio rey (que está en el otro lado) y sí pueden abrir líneas contra el rival. Avanzar los peones del propio flanco de rey (A) destapa al propio rey sin necesidad; no avanzar ningún peón (C) desperdicia la ventaja de tener el flanco libre para atacar; volver a enrocar (D) no es legal una vez que ya se enrocó.",
      fuente: "Posición ilustrativa: reyes en flancos opuestos, situación clásica para una carrera de peones mutua.",
    },
    {
      id: "pp_flanco_02", area: "flanco_ataque", dificultad: 2, turno: "blancas",
      fen: "r1bq1rk1/ppp2ppp/2n1p3/8/4P3/2NB4/PPP2PPP/R2Q1RK1 w - - 0 16",
      enunciado: "Los dos reyes están enrocados cortos, en el mismo flanco. ¿Cuál es el plan correcto para atacar al rey rival?",
      opciones: [
        "Avanzar los propios peones «f», «g» y «h» contra el rey negro.",
        "Concentrar piezas en el ala de rey y abrir líneas jugando con ellas.",
        "Cambiar todas las piezas posibles antes de decidir cualquier plan.",
        "Ignorar el ala de rey y jugar el resto de la partida en el centro.",
      ],
      correcta: 1,
      explica: "Con los reyes en el MISMO flanco, avanzar los propios peones de ese sector (A) debilita la casa del propio rey tanto como la del rival: no es un avance «gratis» como en la carrera de peones con reyes opuestos. El plan correcto es atacar con piezas, buscando aperturas de líneas o sacrificios puntuales, sin tocar la propia estructura de peones más de lo necesario. Simplificar cambiando piezas (C) le quita filo al ataque; ignorar el flanco de los reyes (D) desperdicia la zona donde de verdad se puede decidir la partida.",
      fuente: "Posición ilustrativa: reyes en el mismo flanco, situación en la que atacar con peones cuesta debilitar también al propio rey.",
    },
    {
      id: "pp_flanco_03", area: "flanco_ataque", dificultad: 3, turno: "blancas",
      fen: "rk3r2/pppq1pp1/1n1bp3/8/2P1P3/2NB2P1/PP1Q1P1P/R4RK1 w - - 0 18",
      enunciado: "El rey negro enrocó largo pero todavía tiene los peones a, b y c en su casilla de origen. El rey blanco está enrocado corto. ¿Qué plan tiene más sentido?",
      opciones: [
        "Atacar de inmediato con a2-a4-a5, sin sumar antes ninguna pieza.",
        "Preparar el avance con calma, sumando piezas antes de abrir una línea.",
        "Renunciar al ataque y jugar solo con maniobras en el centro.",
        "Cambiar la dama propia por la dama rival antes de decidir nada más.",
      ],
      correcta: 1,
      explica: "Atacar al rey enrocado significa, casi siempre, abrir una línea contra él —pero eso no se improvisa contra una estructura de peones todavía sana: primero se suman piezas hacia ese flanco y se elige bien qué peón cambiar o qué línea abrir, no simplemente lanzar peones (A) contra una defensa completa. Al mismo tiempo, renunciar al ataque (C) desperdicia que el rey rival está en el flanco donde las blancas tienen más espacio para maniobrar; cambiar damas (D) apaga precisamente el ataque que se busca.",
      fuente: "Posición ilustrativa: rey enrocado largo con su estructura de peones todavía intacta, situación que pide preparación antes de atacar.",
    },

    /* ================= estructura ================= */
    {
      id: "pp_estructura_01", area: "estructura", dificultad: 2, turno: "blancas",
      fen: "r2q1rk1/ppp2ppp/3bpn2/8/3P4/2NB4/PP3PPP/R2Q1RK1 w - - 0 16",
      enunciado: "Las blancas juegan con un peón aislado en d4 (sin peones «c» ni «e» propios que lo respalden). ¿Cuál es el plan correcto en esta clase de posiciones?",
      opciones: [
        "Buscar cambiar todas las piezas cuanto antes, rumbo a un final.",
        "Usar la mayor actividad de piezas que da el peón aislado para atacar.",
        "Avanzar el peón aislado a d5, sin apoyo de ninguna pieza.",
        "Cambiar el propio alfil de d3 por el caballo negro, sin más.",
      ],
      correcta: 1,
      explica: "El peón aislado de dama es un caso clásico de la estrategia: en el final suele ser una debilidad, pero en el medio juego regala espacio y buenas casillas (como d5) para las piezas propias. El plan típico es atacar CON piezas mientras el peón sigue en el tablero, no buscar el final donde se vuelve débil (A). Avanzarlo sin apoyo (C) lo pierde de inmediato; cambiar piezas al azar (D) no tiene relación directa con explotar la ventaja dinámica del peón aislado.",
      fuente: "Posición ilustrativa: estructura de peón aislado de dama (IQP), típica de aperturas como el gambito de dama aceptado o la Panov.",
    },
    {
      id: "pp_estructura_02", area: "estructura", dificultad: 2, turno: "blancas",
      fen: "r2r2k1/pp3ppp/2pb1n2/2p5/3P4/2NB4/PPP2PPP/R2R2K1 w - - 0 28",
      enunciado: "El peón blanco de d4 está bloqueado por el peón negro de c5, y las blancas pueden crear un peón doblado propio si cambian en c5. ¿Cuál es el plan correcto?",
      opciones: [
        "Cambiar en c5, aceptando el peón doblado, para abrir la columna «d».",
        "Empujar d4-d5 sin más, aunque el peón quede sin apoyo en ese avance.",
        "Retroceder el peón a d3, para no arriesgarlo tan adelantado.",
        "Ignorar la tensión en el centro y jugar en el ala de rey.",
      ],
      correcta: 0,
      explica: "A veces un peón doblado no es un defecto sino el precio correcto de abrir una columna útil: cambiar en c5 le da a las blancas la columna «d» abierta —muy valiosa con la torre ya colocada ahí— a cambio de un peón doblado que, en esta posición, no tiene ningún objetivo rival que lo ataque de inmediato. d4-d5 sin apoyo (B) sí crea un peón débil de verdad; retroceder (C) renuncia al centro sin necesidad; ignorar la tensión (D) deja la decisión más importante de la posición sin resolver.",
      fuente: "Posición ilustrativa: tensión central resuelta con un cambio que acepta un peón doblado a cambio de una columna abierta.",
    },
    {
      id: "pp_estructura_03", area: "estructura", dificultad: 3, turno: "blancas",
      fen: "r1br2k1/pp3ppp/1n1pp3/8/1PP1P3/2NB4/P4PPP/R2R2K1 w - - 0 24",
      enunciado: "Las blancas tienen a2, b4, c4 contra a7, b7 negros: si avanzan b4-b5 crean un peón pasado potencial pero también le abren al rival la casilla c5 para su caballo. ¿Qué plan conviene?",
      opciones: [
        "Avanzar b4-b5 de inmediato, sin ninguna preparación previa.",
        "Controlar antes la casilla c5, y recién entonces jugar b4-b5.",
        "Retirar el peón a b3, para no crear ninguna debilidad.",
        "Cambiar el propio caballo por el caballo negro, sin resolver el ala de dama.",
      ],
      correcta: 1,
      explica: "Crear un peón pasado casi siempre vale la pena, pero conviene preparar antes la casilla que ese avance le regala al rival: acá b4-b5 le abre c5 al caballo negro, así que primero se controla esa casilla (con una pieza o con a2-a4 sosteniendo después) y recién entonces se avanza. Jugarlo sin preparación (A) le entrega al caballo rival un puesto fuerte gratis; retirar el peón (C) renuncia a la mayoría de peones sin necesidad; cambiar caballos primero sin resolver la casilla c5 (D) no ataca el problema real de la posición.",
      fuente: "Posición ilustrativa: avance de minoría en el ala de dama que, sin preparación, le regala al rival una casilla fuerte para su caballo.",
    },

    /* ================= final_transformacion ================= */
    {
      id: "pp_final_01", area: "final_transformacion", dificultad: 2, turno: "blancas",
      fen: "6k1/pp3ppp/2p5/3b4/4P3/1PN3P1/P4PKP/8 w - - 0 32",
      enunciado: "Ya sin torres ni damas en el tablero, el rey blanco está en g2 y el negro en g8. ¿Cuál es el plan correcto en este final?",
      opciones: [
        "Dejar al rey donde está y jugar todo el final solo con el caballo.",
        "Activar el rey de inmediato, llevándolo hacia el centro del tablero.",
        "Avanzar todos los peones a la vez, sin acompañarlos con el rey.",
        "Cambiar el caballo por el alfil rival apenas se pueda, sin más.",
      ],
      correcta: 1,
      explica: "La regla de oro del final es que el rey deja de ser una pieza para esconder y pasa a ser una pieza para activar: llevarlo hacia el centro le suma valor a la posición en cada jugada, apoya el avance de los propios peones y puede ir a buscar los peones débiles rivales. Dejarlo pasivo (A) desperdicia esa pieza extra; avanzar peones sin acompañarlos con el rey (C) los deja sin sostén; cambiar piezas sin evaluar el final resultante (D) puede simplificar hacia una posición peor sin necesidad.",
      fuente: "Posición ilustrativa: final de caballo contra alfil, situación clásica en la que activar el rey es la prioridad.",
    },
    {
      id: "pp_final_02", area: "final_transformacion", dificultad: 2, turno: "blancas",
      fen: "3r2k1/pp3pp1/2p1p2p/8/4P3/7P/PP3PP1/3R2K1 w - - 0 30",
      enunciado: "Es un final de torres con material parejo, pero las blancas tienen una mayoría de peones en el centro y el ala de rey (4 contra 3), mientras que en el ala de dama están 2 contra 2. ¿Cuál es el plan correcto?",
      opciones: [
        "Cambiar la torre propia por la rival, para llegar a un final de peones.",
        "Avanzar la mayoría del centro y el ala de rey, con las torres en juego.",
        "Avanzar los peones del ala de dama, donde no hay ninguna mayoría.",
        "Llevar el rey al ala de dama de inmediato, dejando el centro de lado.",
      ],
      correcta: 1,
      explica: "Con una mayoría de peones en un sector, el plan de final es convertirla en un peón pasado: acá el 4 contra 3 del centro y el ala de rey es justo donde hay que avanzar, con las torres todavía en el tablero apoyando ese avance y compitiendo por la columna abierta que se genere. Cambiar torres para ir a un final de peones (A) no está mal en sí, pero renunciar a la actividad de la torre antes de tiempo simplifica la tarea del rival; jugar en el flanco donde NO hay mayoría (C) desperdicia la ventaja real; abandonar el centro (D) es lo mismo.",
      fuente: "Posición ilustrativa: final de torres con mayoría de peones 4 contra 3 en un flanco, situación clásica para crear un peón pasado.",
    },
    {
      id: "pp_final_03", area: "final_transformacion", dificultad: 3, turno: "blancas",
      fen: "8/pp3kpp/8/5p2/5P2/8/PP3KPP/8 w - - 0 40",
      enunciado: "Es un final de solo reyes y peones, simétrico salvo que los peones «f» están fijos uno frente al otro. Las blancas pueden crear un peón pasado en el ala de dama avanzando a2-a4-a5 más adelante. ¿Cuál es el plan correcto?",
      opciones: [
        "Llevar el rey hacia el ala de dama, a apoyar ese avance de peones.",
        "Llevar el rey hacia el ala de rey, donde ya están los peones trabados.",
        "Avanzar f4-f5, aunque esa casilla ya la ocupe un peón negro.",
        "Mantener el rey en el centro, sin acercarse a ningún flanco.",
      ],
      correcta: 0,
      explica: "En un final de reyes y peones, la mayoría o la posibilidad de crear un peón pasado en un flanco determinan hacia dónde tiene que ir el rey: acá el ala de dama es donde de verdad se puede avanzar (a2-a4-a5), así que el rey blanco tiene que acompañar ese plan. En el ala de rey los peones «f» ya están trabados uno frente al otro y no ofrecen ningún avance útil por sí solos (B). Empujar f4-f5 (C) directamente no es una jugada legal porque esa casilla ya la ocupa un peón negro. Esperar sin acercar el rey a ningún lado (D) desperdicia el único plan de progreso disponible.",
      fuente: "Posición ilustrativa: final de reyes y peones con una mayoría de peones en el ala de dama, situación en la que el rey debe apoyar el flanco correcto.",
    },
  ];

  /* Las áreas, en el orden en que se presentan y se sortean. */
  const AREAS = ["mejorar_pieza","columnas_diagonales","cambios","debilidades","espacio_restriccion","flanco_ataque","estructura","final_transformacion"];

  /* Arma una tanda: por omisión, el banco entero (hoy 24 ítems, 3 por área),
     barajado. Con `porArea` se puede pedir menos —por ejemplo 1 por área,
     para una tanda corta de 8— sin tocar el banco. */
  function porArea(area) { return ITEMS.filter((i) => i.area === area); }

  function barajar(lista) {
    const c = lista.slice();
    for (let i = c.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = c[i]; c[i] = c[j]; c[j] = t;
    }
    return c;
  }

  function armar(cantidadPorArea) {
    let elegidos;
    if (!cantidadPorArea) {
      elegidos = ITEMS.slice();
    } else {
      elegidos = [];
      AREAS.forEach((a) => { elegidos = elegidos.concat(barajar(porArea(a)).slice(0, cantidadPorArea)); });
    }
    return barajar(elegidos);
  }

  window.PRECISION_POSICIONAL_ITEMS = ITEMS;
  window.PrecisionPosicionalPrueba = { AREAS: AREAS, TOTAL: ITEMS.length, porArea: porArea, armar: armar };
})();
