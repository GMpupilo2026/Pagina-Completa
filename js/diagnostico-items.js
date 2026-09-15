/* ===== Ajedrez Integral — Banco de ítems del diagnóstico de nivel =====
 *
 * Banco de ítems repartidos en las 8 áreas de js/plan-entrenamiento.js, con
 * tres niveles de dificultad (peso 1, 2 y 3). Hay más ítems de los que se
 * preguntan: cada prueba sortea 7 por área (56 en total, 109 puntos) con
 * DiagnosticoPrueba.armar(), al final de este archivo. Se mezclan dos formas
 * de preguntar, porque miden cosas distintas:
 *   - "opcion": lo que el alumno SABE (conceptos, reglas, criterios), a veces
 *     con una posición al lado para que el concepto no sea abstracto.
 *   - "jugada" y "casilla": lo que el alumno SABE HACER sobre el tablero.
 *
 * Todas las posiciones y soluciones están verificadas con chess.js: la FEN es
 * legal, la jugada solución es legal y, además, cumple de verdad lo que el
 * enunciado promete (el mate en 1 es el ÚNICO mate en 1; la horquilla ataca a
 * la vez al rey y a la dama; la captura no tiene recaptura posible; el jaque
 * descubierto es jaque y ataca la dama; la columna es realmente abierta…).
 * El script que lo comprueba está descrito en `prueba` de cada ítem: si se
 * toca una posición, hay que volver a pasarlo.
 *
 * En todas las posiciones juegan las blancas: el alumno siempre mira el
 * tablero desde el mismo lado, que es una cosa menos que descifrar mientras se
 * le mide otra.
 *
 * Ítems de tipo "jugada"/"casilla" con más de una respuesta válida: además de
 * `solucion` (la que se muestra en la corrección) pueden traer `alternas`, un
 * arreglo con las demás jugadas/casillas que también cumplen el enunciado tal
 * cual está escrito. `esCorrecta()` en entreno/diagnostico.html y
 * `respuestaCorrecta()` en herramientas/diagnostico-pdf.js aceptan cualquiera
 * de las dos. Antes de asumir que una jugada es la ÚNICA que sirve, hay que
 * comprobarlo contra TODAS las jugadas legales de la posición (no solo las
 * de la misma pieza): así se encontró y se corrigió el caso de `tac_descubierto`.
 */
window.DIAGNOSTICO_ITEMS = [
  /* ---------------- Reglas y movimientos ---------------- */
  {
    id: 'reg_caballo', area: 'reglas', peso: 1, tipo: 'opcion',
    enunciado: '¿Cómo se mueve el caballo?',
    opciones: [
      'En forma de L: dos casillas en una dirección y una perpendicular.',
      'En diagonal, tan lejos como quiera si el camino está libre.',
      'Una sola casilla por turno, en cualquiera de las ocho direcciones.',
      'En línea recta por su fila o su columna, sin límite de casillas.',
    ],
    correcta: 0,
    explica: 'El caballo es la única pieza que salta: por eso es tan útil en posiciones cerradas.',
  },
  {
    id: 'reg_ahogado', area: 'reglas', peso: 2, tipo: 'opcion_tablero',
    enunciado: 'Juegan las negras y no tienen ninguna jugada legal, pero su rey NO está en jaque. ¿Qué pasa?',
    fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1',
    opciones: ['Es tablas por ahogado (rey ahogado).', 'Es jaque mate y ganan las blancas.', 'Las negras pierden por no poder mover.', 'Se repite la jugada anterior.'],
    correcta: 0,
    explica: 'Sin jaque y sin jugada legal, la partida es tablas. Con dama y rey hay que vigilar siempre el ahogado.',
    prueba: 'in_stalemate() === true',
  },
  {
    id: 'reg_enroque', area: 'reglas', peso: 2, tipo: 'jugada',
    enunciado: 'Enroca corto con las blancas.',
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5',
    solucion: { from: 'e1', to: 'g1' },
    explica: 'El enroque pone al rey a salvo y conecta las torres: en igualdad de condiciones, cuanto antes mejor.',
    prueba: 'la jugada es legal y su bandera incluye el enroque corto (k)',
  },
  {
    id: 'reg_al_paso', area: 'reglas', peso: 3, tipo: 'jugada',
    enunciado: 'Las negras acaban de jugar …d7-d5. Captura al paso.',
    fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2',
    solucion: { from: 'e5', to: 'd6' },
    explica: 'La captura al paso solo se puede hacer inmediatamente después del avance doble del peón rival.',
    prueba: 'la jugada es legal y su bandera incluye la captura al paso (e)',
  },
  {
    id: 'reg_casillas', area: 'reglas', peso: 1, tipo: 'opcion',
    enunciado: '¿Cuántas casillas tiene un tablero de ajedrez?',
    opciones: ['60', '64', '72', '81'],
    correcta: 1,
    explica: 'El tablero es una cuadrícula de 8×8 = 64 casillas: 32 claras y 32 oscuras.',
  },
  {
    id: 'reg_torre_recorrido', area: 'reglas', peso: 1, tipo: 'opcion',
    enunciado: '¿Cómo se mueve la torre?',
    opciones: [
      'En línea recta por su fila o su columna, sin límite de casillas.',
      'En diagonal, tan lejos como quiera si el camino está libre.',
      'En forma de L, como el caballo, saltando por encima de todo.',
      'Una sola casilla por turno, en cualquiera de las ocho direcciones.',
    ],
    correcta: 0,
    explica: 'La torre se detiene en la primera pieza que encuentra en su camino: no puede saltar, a diferencia del caballo.',
  },
  {
    id: 'reg_promocion', area: 'reglas', peso: 2, tipo: 'opcion',
    enunciado: 'Un peón que llega a la última fila puede coronar en…',
    opciones: [
      'En dama, torre, alfil o caballo: nunca en rey ni en peón.',
      'Solo en dama, que es la pieza más fuerte que hay en el juego.',
      'En dama o en caballo, que son las dos que dan mate.',
      'En cualquier pieza, incluido un segundo rey propio.',
    ],
    correcta: 0,
    explica: 'Coronar en dama es lo más frecuente, pero elegir torre, alfil o caballo a veces evita un ahogado o da un mate más rápido.',
  },

  /* ---------------- Valor del material ---------------- */
  {
    id: 'mat_valores', area: 'material', peso: 1, tipo: 'opcion',
    enunciado: 'Sin contar al rey, ¿cuál es el orden correcto de menor a mayor valor?',
    opciones: [
      'Peón, caballo y alfil, torre, dama.',
      'Peón, torre, caballo y alfil, dama.',
      'Peón, alfil, dama, torre y caballo.',
      'Caballo, peón, torre, alfil, dama.',
    ],
    correcta: 0,
    explica: 'La escala de siempre: peón 1, caballo y alfil 3, torre 5, dama 9. Son guías, no leyes: la posición manda.',
  },
  {
    id: 'mat_dama_gratis', area: 'material', peso: 1, tipo: 'jugada',
    enunciado: 'Las negras dejaron algo sin defender. Cóbralo.',
    fen: '6k1/8/8/3q4/8/3R4/6PP/6K1 w - - 0 1',
    solucion: { from: 'd3', to: 'd5' },
    explica: 'Antes de cada jugada, mira qué piezas rivales están sin defensa: es el error más común y el más barato de castigar.',
    prueba: 'captura una pieza de 3 puntos o más y después no existe ninguna recaptura legal',
  },
  {
    id: 'mat_torre_gratis', area: 'material', peso: 2, tipo: 'jugada',
    enunciado: 'Gana material con una sola jugada.',
    fen: 'r5k1/5ppp/8/8/4B3/8/5PPP/6K1 w - - 0 1',
    solucion: { from: 'e4', to: 'a8' },
    explica: 'Un alfil en una diagonal larga y abierta vigila el tablero de esquina a esquina.',
    prueba: 'captura una pieza de 3 puntos o más y después no existe ninguna recaptura legal',
  },
  {
    id: 'mat_cambio', area: 'material', peso: 2, tipo: 'opcion',
    enunciado: 'Puedes cambiar tu alfil por una torre rival. ¿Qué es eso y conviene?',
    opciones: [
      'Es ganar la calidad, dos puntos de ventaja: suele convenir.',
      'Es un cambio parejo en valor: da exactamente igual hacerlo.',
      'Es perder la calidad, así que conviene evitarlo.',
      'Es un cambio que el reglamento no permite hacer.',
    ],
    correcta: 0,
    explica: 'Torre (5) por alfil o caballo (3) se llama "ganar la calidad". Conviene salvo que la posición diga lo contrario.',
  },
  {
    id: 'mat_dama_valor', area: 'material', peso: 1, tipo: 'opcion',
    enunciado: '¿Cuál es el valor aproximado de la dama?',
    opciones: ['5', '7', '9', '13'],
    correcta: 2,
    explica: 'La dama vale aproximadamente 9 peones: es la pieza más poderosa del tablero.',
  },
  {
    id: 'mat_dos_torres_vs_dama', area: 'material', peso: 2, tipo: 'opcion',
    enunciado: '¿Qué suele valer más: dos torres o una dama?',
    opciones: [
      'Dos torres, diez puntos contra nueve, según la posición.',
      'La dama, siempre y en cualquier posición que se presente.',
      'Da igual: diez y nueve puntos son casi lo mismo.',
      'Dos torres nunca le ganan a una dama bien colocada.',
    ],
    correcta: 0,
    explica: 'Como referencia de valores, dos torres superan ligeramente a una dama, pero la coordinación de las piezas pesa tanto como la suma de puntos.',
  },
  {
    id: 'mat_pareja_alfiles', area: 'material', peso: 3, tipo: 'opcion',
    enunciado: '¿Por qué se considera valiosa la "pareja de alfiles" en posiciones abiertas?',
    opciones: [
      'Porque entre los dos cubren casillas de los dos colores.',
      'Porque un alfil vale más que un caballo en cualquier posición.',
      'Porque los alfiles no se pueden cambiar por piezas menores.',
      'Porque son las únicas piezas que atacan al rey de lejos.',
    ],
    correcta: 0,
    explica: 'Un solo alfil solo controla casillas de un color; con los dos, un jugador puede dominar todo el tablero, sobre todo con pocos peones que bloqueen las diagonales.',
  },

  /* ---------------- Principios de apertura ---------------- */
  {
    id: 'ap_prioridad', area: 'apertura', peso: 1, tipo: 'opcion',
    enunciado: 'En las primeras jugadas, ¿cuál es el orden de prioridades?',
    opciones: [
      'Ocupar el centro, desarrollar las piezas menores y enrocar.',
      'Sacar la dama temprano para atacar lo antes posible.',
      'Avanzar los peones de las columnas de las torres.',
      'Cambiar todas las piezas que se pueda, para ir simplificando.',
    ],
    correcta: 0,
    explica: 'Centro, desarrollo y rey seguro: con eso solo, una apertura ya está bien jugada.',
  },
  {
    id: 'ap_dama_temprano', area: 'apertura', peso: 2, tipo: 'opcion',
    enunciado: '¿Por qué no conviene sacar la dama en las primeras jugadas?',
    opciones: [
      'Porque el rival gana tiempo atacándola mientras desarrolla.',
      'Porque el reglamento no permite moverla antes de la jugada 10.',
      'Porque en la apertura la dama vale menos que en el final.',
      'Porque una vez que sale ya no puede volver a su casilla.',
    ],
    correcta: 0,
    explica: 'Cada jaque o ataque a tu dama es una jugada de desarrollo gratis para el rival.',
  },
  {
    id: 'ap_pieza_repetida', area: 'apertura', peso: 2, tipo: 'opcion',
    enunciado: 'En la apertura, mover varias veces la misma pieza sin necesidad…',
    opciones: [
      'Pierde tiempo: el rival saca piezas nuevas mientras repites.',
      'Es bueno, porque esa pieza termina muy bien colocada.',
      'Da igual: en la apertura lo que importa es el material.',
      'Solo es un problema si la pieza que se repite es un peón suelto.',
    ],
    correcta: 0,
    explica: 'La apertura es una carrera por sacar piezas: cada repetición te deja una pieza menos en juego.',
  },
  {
    id: 'ap_desarrollo', area: 'apertura', peso: 3, tipo: 'jugada',
    enunciado: 'Tu rey sigue en el centro con la posición abierta. Pon el rey a salvo.',
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    solucion: { from: 'e1', to: 'g1' },
    explica: 'Con las piezas menores del flanco de rey ya fuera, enrocar es casi siempre la mejor jugada disponible.',
    prueba: 'la jugada es legal y su bandera incluye el enroque corto (k)',
  },
  {
    id: 'ap_espanola', area: 'apertura', peso: 1, tipo: 'opcion',
    enunciado: '1.e4 e5 2.Cf3 Cc6 3.Ab5 corresponde a la apertura…',
    opciones: [
      'Española',
      'Siciliana',
      'Francesa',
      'Escocesa',
    ],
    correcta: 0,
    explica: 'Esa secuencia es la Apertura Española o Ruy López, una de las más antiguas y estudiadas del ajedrez.',
  },
  {
    id: 'ap_siciliana', area: 'apertura', peso: 2, tipo: 'opcion',
    enunciado: '1.e4 c5 corresponde a la Defensa…',
    opciones: ['Siciliana', 'Caro-Kann', 'Francesa', 'Pirc'],
    correcta: 0,
    explica: '1.e4 c5 es la Defensa Siciliana: la respuesta más popular y combativa contra 1.e4.',
  },
  {
    id: 'ap_gambito', area: 'apertura', peso: 3, tipo: 'opcion',
    enunciado: '¿Cuál es la idea principal detrás de un gambito?',
    opciones: [
      'Sacrificar material a cambio de desarrollo o de iniciativa.',
      'Ganar una pieza gratis, sin dar absolutamente nada a cambio.',
      'Evitar el desarrollo de piezas hasta llegar al final.',
      'Forzar las tablas lo antes posible a fuerza de jaques.',
    ],
    correcta: 0,
    explica: 'En un gambito se entrega material (normalmente un peón) a cambio de más desarrollo, control del centro o iniciativa.',
  },

  /* ---------------- Táctica ---------------- */
  {
    id: 'tac_horquilla', area: 'tactica', peso: 1, tipo: 'jugada',
    enunciado: 'Encuentra la horquilla de caballo que ataca al rey y a la dama a la vez.',
    fen: '7k/8/3q4/6N1/8/8/8/K7 w - - 0 1',
    solucion: { from: 'g5', to: 'f7' },
    explica: 'La horquilla de caballo es el recurso táctico que más partidas decide entre principiantes: revisa siempre los saltos con jaque.',
    prueba: 'tras la jugada el caballo ataca a la vez al rey y a la dama negros',
  },
  {
    id: 'tac_clavada', area: 'tactica', peso: 2, tipo: 'opcion',
    enunciado: '¿Qué es una clavada?',
    opciones: [
      'Una pieza no se puede mover sin dejar expuesta a otra mejor.',
      'Una pieza queda encerrada por sus propios peones y no sale.',
      'Dos piezas rivales quedan atacadas a la vez por una sola.',
      'Un peón llega a la última fila y se convierte en dama.',
    ],
    correcta: 0,
    explica: 'Contra una pieza clavada, la receta es atacarla otra vez: no se puede mover para escapar.',
  },
  {
    id: 'tac_descubierto', area: 'tactica', peso: 3, tipo: 'jugada',
    enunciado: 'Mueve el caballo de manera que descubras jaque y de paso ataques la dama negra.',
    fen: '4k3/1q6/8/8/4N3/8/8/4R1K1 w - - 0 1',
    solucion: { from: 'e4', to: 'c5' },
    alternas: [{ from: 'e4', to: 'd6' }],
    explica: 'En el ataque descubierto la pieza que se aparta puede ir a robar donde quiera: el rival está obligado a atender el jaque. Aquí el caballo tiene dos saltos que sirven: Cc5+ y Cd6+ atacan la dama por igual (los otros seis saltos también dan jaque, pero no amenazan la dama).',
    prueba: 'las 8 jugadas legales del caballo descubren jaque de la torre (cualquier salto lo hace); de esas 8, se comprobó cuáles además atacan la casilla b7: solo Cc5+ y Cd6+ lo hacen (las otras seis — Cc3+, Cd2+, Cf2+, Cg3+, Cg5+, Cf6+ — dan jaque pero no atacan la dama). Verificado contra las 19 jugadas legales totales de la posición (también las de la torre y el rey), no solo las del caballo.',
  },
  {
    id: 'tac_revisar', area: 'tactica', peso: 2, tipo: 'opcion',
    enunciado: 'Tu rival acaba de mover. ¿Qué es lo primero que hay que mirar?',
    opciones: [
      'Qué amenaza esa jugada: jaques, capturas y ataques dobles.',
      'Cuál es tu plan a largo plazo, aunque él amenace algo.',
      'Cuánto tiempo te queda a ti y cuánto le queda a él.',
      'Si puedes cambiar alguna pieza para simplificar la posición.',
    ],
    correcta: 0,
    explica: 'Jaques, capturas y amenazas — en ese orden, primero las del rival y luego las tuyas. Es la rutina que evita casi todos los descuidos.',
  },
  {
    id: 'tac_horquilla2', area: 'tactica', peso: 2, tipo: 'jugada',
    enunciado: 'Da jaque con el caballo de manera que además ataques la torre negra.',
    fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1',
    solucion: { from: 'b5', to: 'c7' },
    explica: 'Cc7+ es una horquilla familiar clásica: jaque al rey y ataque simultáneo a la torre de a8. Las negras tienen que atender el jaque moviendo el rey, y las blancas cobran la torre en la jugada siguiente.',
    prueba: 'de las 11 jugadas legales de la posición (6 del caballo — Ca7, Cc7, Cd6, Cd4, Cc3, Ca3 — y 5 del rey), solo Cc7 y Cd6 dan jaque; de esas dos, solo Cc7 ataca además la torre de a8.',
  },
  {
    id: 'tac_rayosx', area: 'tactica', peso: 3, tipo: 'opcion',
    enunciado: '¿Qué es un "rayo X" (o clavada relativa) en ajedrez?',
    opciones: [
      'Cuando una pieza ataca a través de otra a lo que hay detrás.',
      'Cuando dos alfiles propios se cruzan en el centro.',
      'Cuando un peón defiende a otro peón en la misma diagonal larga.',
      'Cuando la dama y la torre atacan la misma casilla.',
    ],
    correcta: 0,
    explica: 'El rayo X es una línea de ataque que atraviesa una pieza para llegar a otra detrás, parecido a la clavada pero visto desde el otro lado.',
  },
  {
    id: 'tac_desviacion', area: 'tactica', peso: 2, tipo: 'opcion',
    enunciado: '¿Cómo se llama la táctica que obliga a una pieza defensora a abandonar la casilla que protegía?',
    opciones: [
      'Desviación, o eliminación del defensor.',
      'Clavada sobre la pieza defensora.',
      'Promoción de un peón al llegar a la octava.',
      'Ahogado del rey en la esquina.',
    ],
    correcta: 0,
    explica: 'La desviación ataca o atrae a la pieza que defiende algo importante para forzarla a moverse, dejando esa casilla o pieza sin protección.',
  },

  /* ---------------- Mates y seguridad del rey ---------------- */
  {
    id: 'mate_pasillo', area: 'mate', peso: 1, tipo: 'jugada',
    enunciado: 'Da jaque mate en una jugada.',
    fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
    solucion: { from: 'a1', to: 'a8' },
    explica: 'El mate del pasillo: el rey se ahoga detrás de sus propios peones. Por eso conviene abrir una ventanita a tiempo.',
    prueba: 'es mate y es el único mate en 1 de la posición',
  },
  {
    id: 'mate_dama', area: 'mate', peso: 2, tipo: 'jugada',
    enunciado: 'Da jaque mate en una jugada con la dama.',
    fen: '6k1/8/6K1/8/8/8/8/7Q w - - 0 1',
    solucion: { from: 'h1', to: 'a8' },
    explica: 'Con dama y rey, el mate llega cuando el rey propio le quita al rival las casillas de escape. La dama sola no mata.',
    prueba: 'es mate y es el único mate en 1 de la posición',
  },
  {
    id: 'mate_caballo', area: 'mate', peso: 3, tipo: 'jugada',
    enunciado: 'Da jaque mate en una jugada.',
    fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1',
    solucion: { from: 'g5', to: 'f7' },
    explica: 'El rey encerrado por sus propias piezas cae ante un solo caballo: es el patrón del "mate de la coz".',
    prueba: 'es mate y es el único mate en 1 de la posición',
  },
  {
    id: 'mate_ventana', area: 'mate', peso: 2, tipo: 'opcion',
    enunciado: 'Tu rey está enrocado corto y tus peones f, g y h siguen en su casilla. ¿Qué medida de seguridad conviene tomar con tiempo?',
    opciones: [
      'Hacer una ventanita, por ejemplo h2-h3, contra el pasillo.',
      'Avanzar los tres peones del enroque para atacar de una vez.',
      'Sacar el rey hacia el centro lo antes posible.',
      'Cambiar la dama en cuanto haya oportunidad de hacerlo.',
    ],
    correcta: 0,
    explica: 'Una casilla de escape cuesta un tiempo y evita el mate del pasillo, que es de los finales más frecuentes en torneos escolares.',
  },
  {
    id: 'mate_definicion', area: 'mate', peso: 1, tipo: 'opcion',
    enunciado: '¿Qué significa exactamente "jaque mate"?',
    opciones: [
      'El rey está en jaque y no hay jugada legal que lo libre.',
      'El rey está en jaque pero todavía puede llegar a escapar.',
      'Se acabó el tiempo en el reloj y se pierde la partida.',
      'El rey fue capturado y sacado físicamente del tablero.',
    ],
    correcta: 0,
    explica: 'El rey nunca llega a ser capturado: la partida termina en el instante en que un jaque no tiene ninguna respuesta legal.',
  },
  {
    id: 'mate_sofocado', area: 'mate', peso: 3, tipo: 'opcion',
    enunciado: '¿Cómo se llama el mate en el que el rey está completamente rodeado por sus propias piezas y un caballo da el jaque final?',
    opciones: [
      'Mate de la coz (smothered mate).',
      'Mate ahogado en la esquina.',
      'Mate del pasillo o última fila.',
      'Mate de la escalera con dos torres.',
    ],
    correcta: 0,
    explica: 'En el mate de la coz el rey queda bloqueado por sus propias piezas y un caballo rival —que no se puede capturar ni bloquear— le da el jaque final.',
  },
  {
    id: 'mate_escalera', area: 'mate', peso: 2, tipo: 'opcion',
    enunciado: '¿Cómo se llama la técnica de dar jaque mate con dos torres (o dama y torre), empujando al rey rival fila a fila hacia el borde del tablero?',
    opciones: [
      'Mate de la escalera.',
      'Mate de la coz.',
      'Mate del pasillo largo.',
      'Mate de Boden.',
    ],
    correcta: 0,
    explica: 'Dos piezas de largo alcance se turnan para dar jaque, empujando al rey fila a fila hasta acorralarlo en el borde.',
  },

  /* ---------------- Finales ---------------- */
  {
    id: 'fin_cuadrado', area: 'finales', peso: 1, tipo: 'opcion_tablero',
    enunciado: 'Juegan las negras. Según la regla del cuadrado, ¿alcanza el rey negro al peón blanco?',
    fen: '8/8/8/2P5/8/8/8/5k1K b - - 0 1',
    opciones: ['No: el peón corona antes.', 'Sí: lo alcanza justo a tiempo.', 'Depende de dónde esté el rey blanco.', 'Solo si el peón avanza de a una casilla.'],
    correcta: 0,
    explica: 'Dibuja el cuadrado desde el peón hasta la casilla de coronación: si el rey no entra en él jugando, no llega.',
    prueba: 'regla del cuadrado calculada sobre la FEN (distancia del rey a la casilla de coronación contra la del peón)',
  },
  {
    id: 'fin_oposicion', area: 'finales', peso: 2, tipo: 'casilla',
    enunciado: 'Haz clic en la casilla a la que debe ir el rey blanco para tomar la oposición.',
    fen: '8/8/4k3/8/8/4K3/8/8 w - - 0 1',
    solucion: 'e4',
    explica: 'Oposición: los reyes enfrentados con una casilla de por medio y el turno del rival. Es la llave de los finales de peones.',
    prueba: 'la jugada Re4 es legal y deja los reyes enfrentados a dos casillas en la misma columna, con las negras en turno',
  },
  {
    id: 'fin_promocion', area: 'finales', peso: 2, tipo: 'jugada',
    enunciado: 'Corona el peón.',
    fen: '8/1P6/8/8/8/5k2/8/7K w - - 0 1',
    solucion: { from: 'b7', to: 'b8', promotion: 'q' },
    explica: 'Coronar en dama es lo normal; solo se elige otra pieza para evitar un ahogado o para dar un mate de caballo.',
    prueba: 'la jugada es legal, corona (bandera p) y la pieza nueva es dama',
  },
  {
    id: 'fin_torre_peon', area: 'finales', peso: 3, tipo: 'opcion',
    enunciado: 'En un final de torre y peón contra torre, ¿qué es la posición de Philidor?',
    opciones: [
      'La defensa: torre en la tercera fila y jaques por detrás.',
      'El ataque: el rey se tapa de los jaques con su torre.',
      'Una posición en la que siempre gana el bando que tiene el peón.',
      'La regla que dice que dos torres le ganan a una sola.',
    ],
    correcta: 0,
    explica: 'Philidor defiende (tablas) y Lucena gana (el puente). Saber cuál es cuál salva y gana muchos medios puntos.',
  },
  {
    id: 'fin_rey_activo', area: 'finales', peso: 1, tipo: 'opcion',
    enunciado: 'En los finales, ¿qué suele ser más importante que en la apertura?',
    opciones: [
      'La actividad del rey, que ya puede salir al centro.',
      'Enrocar lo antes posible para ponerlo a salvo.',
      'Sacar la dama cuanto antes para dar jaques.',
      'Adelantar cuanto antes los peones de las dos torres.',
    ],
    correcta: 0,
    explica: 'Con menos piezas en el tablero, el rey deja de estar en peligro constante y se convierte en pieza activa clave, sobre todo en finales de peones.',
  },
  {
    id: 'fin_peon_pasado', area: 'finales', peso: 1, tipo: 'opcion',
    enunciado: 'Un "peón pasado" es aquel que…',
    opciones: [
      'El que no tiene peones rivales delante ni al lado.',
      'El que ya cruzó la mitad del tablero en su avance.',
      'El que avanzó dos casillas en su primer movimiento.',
      'El que quedó clavado por un alfil enemigo.',
    ],
    correcta: 0,
    explica: 'Un peón pasado no puede ser detenido por ningún peón rival en su camino a coronar, lo que lo hace muy valioso en los finales.',
  },
  {
    id: 'fin_alfiles_distinto_color', area: 'finales', peso: 3, tipo: 'opcion',
    enunciado: '¿Qué hace especialmente difícil de ganar un final de alfiles de distinto color, incluso con material de más?',
    opciones: [
      'Que el alfil rival bloquea las casillas clave y nadie lo echa.',
      'Que en ese final los alfiles valen menos que un peón suelto.',
      'Que los alfiles no pueden defender peones de otro color.',
      'Que con material de más las tablas son imposibles.',
    ],
    correcta: 0,
    explica: 'Estos finales son famosos por sus tablas "de manual": el alfil defensor puede bloquear para siempre las casillas de su color, aunque el rival tenga varios peones de más.',
  },

  /* ---------------- Estrategia y planes ---------------- */
  {
    id: 'est_columna', area: 'estrategia', peso: 2, tipo: 'jugada',
    enunciado: 'Coloca la torre en la única columna abierta del tablero.',
    fen: '6k1/ppp1pppp/8/8/8/8/PPP1PPPP/R5K1 w - - 0 1',
    solucion: { from: 'a1', to: 'd1' },
    explica: 'Las torres quieren columnas abiertas: es la puerta por donde entran al campo rival.',
    prueba: 'tras la jugada la torre está en una columna sin ningún peón de ninguno de los dos bandos',
  },
  {
    id: 'est_centro', area: 'estrategia', peso: 1, tipo: 'opcion',
    enunciado: '¿Por qué importa tanto el centro del tablero?',
    opciones: [
      'Porque desde ahí las piezas llegan a muchas más casillas.',
      'Porque el reglamento da puntos extra por ocuparlo.',
      'Porque el rey debe quedarse siempre en el centro.',
      'Porque en el centro del tablero las piezas no se capturan.',
    ],
    correcta: 0,
    explica: 'Un caballo en el centro domina 8 casillas; en una esquina, solo 2.',
  },
  {
    id: 'est_pasado', area: 'estrategia', peso: 3, tipo: 'opcion',
    enunciado: '¿Qué es un peón pasado y por qué es fuerte?',
    opciones: [
      'Uno sin peones rivales delante ni al lado: cuesta frenarlo.',
      'Uno que ya cruzó la mitad del tablero y sigue avanzando solo.',
      'Uno que capturó al paso y quedó en columna abierta.',
      'Uno doblado en la misma columna que otro peón propio.',
    ],
    correcta: 0,
    explica: 'En los finales, un peón pasado y lejano suele valer más que un peón de más en el mismo flanco.',
  },
  {
    id: 'est_caballo_puesto', area: 'estrategia', peso: 2, tipo: 'opcion',
    enunciado: 'Un caballo llega a una casilla avanzada donde ningún peón rival puede echarlo. ¿Qué has conseguido?',
    opciones: [
      'Un puesto avanzado: pieza fuerte y estable en campo rival.',
      'Un caballo en peligro que conviene retirar enseguida.',
      'Una clavada sobre el rey rival que gana material.',
      'Nada especial: el caballo vale igual en cualquier casilla.',
    ],
    correcta: 0,
    explica: 'Un caballo bien puesto en la quinta o sexta fila, apoyado por un peón, puede valer más que una torre.',
  },
  {
    id: 'est_peon_aislado', area: 'estrategia', peso: 2, tipo: 'opcion',
    enunciado: '¿Qué es un "peón aislado"?',
    opciones: [
      'Un peón sin peones propios en las columnas vecinas.',
      'Un peón que quedó solo porque capturaron a los demás.',
      'Un peón que ya está a punto de coronar en la octava.',
      'Un peón que avanzó dos casillas en su primer salto.',
    ],
    correcta: 0,
    explica: 'Al no tener peones vecinos que lo respalden, el peón aislado suele necesitar protección constante de las piezas, aunque también da movilidad a cambio.',
  },
  {
    id: 'est_alfil_malo', area: 'estrategia', peso: 2, tipo: 'opcion',
    enunciado: '¿Por qué se dice que un alfil es "malo" en ciertas estructuras de peones?',
    opciones: [
      'Porque sus propios peones le tapan las diagonales.',
      'Porque el alfil no puede capturar piezas rivales.',
      'Porque en esa estructura vale menos que un peón.',
      'Porque no puede salir de su casilla de origen.',
    ],
    correcta: 0,
    explica: 'Un "alfil malo" queda encerrado por sus propios peones, colocados en casillas del mismo color que el alfil, lo que reduce mucho su actividad.',
  },
  {
    id: 'est_mayoria_flanco', area: 'estrategia', peso: 3, tipo: 'opcion',
    enunciado: 'En estructuras de peones, ¿qué es una "mayoría de peones" en un flanco?',
    opciones: [
      'Tener más peones que el rival en ese sector.',
      'Tener todos los peones propios en una sola fila.',
      'Tener menos peones que el rival en ese sector.',
      'Tener dos peones doblados en la misma columna.',
    ],
    correcta: 0,
    explica: 'Una mayoría de peones en un flanco es una ventaja a largo plazo: bien manejada, puede convertirse en un peón pasado que decida el final.',
  },

  /* ---------------- Cálculo y visualización ---------------- */
  {
    id: 'cal_casilla_color', area: 'calculo', peso: 1, tipo: 'opcion',
    enunciado: 'Sin mirar el tablero: ¿de qué color es la casilla f5?',
    opciones: [
      'Es blanca.',
      'Es negra.',
      'Depende del lado.',
      'No existe f5.',
    ],
    correcta: 0,
    explica: 'Truco: si la letra y el número son "uno par y otro impar", la casilla es blanca. Saberlo ayuda en los finales de alfiles.',
    prueba: 'color de casilla calculado con la fórmula habitual (columna + fila)',
  },
  {
    id: 'cal_conteo', area: 'calculo', peso: 2, tipo: 'opcion',
    enunciado: 'Una casilla está defendida dos veces y atacada dos veces por ti. ¿Qué hay que contar antes de capturar ahí?',
    opciones: [
      'El valor de las piezas que entran, en orden.',
      'Solo cuántos atacantes hay: si son dos, se gana.',
      'Si el rey rival está cerca de esa casilla o no.',
      'Nada en especial: capturar siempre conviene.',
    ],
    correcta: 0,
    explica: 'Capturar de a poco y en orden equivocado regala material. Cuenta la secuencia completa antes de la primera captura.',
  },
  {
    id: 'cal_jaque_doble', area: 'calculo', peso: 2, tipo: 'casilla',
    enunciado: 'Haz clic en la casilla desde la que tu caballo daría jaque al rey negro y atacaría la torre a la vez.',
    fen: '3k4/6r1/8/8/3N4/8/8/7K w - - 0 1',
    solucion: 'e6',
    explica: 'Antes de mover un caballo, mira sus 8 saltos: la horquilla casi siempre está en uno que no miraste.',
    prueba: 'el salto es legal y desde esa casilla el caballo ataca al rey y a la torre negros',
  },
  {
    id: 'cal_intermedia', area: 'calculo', peso: 3, tipo: 'opcion',
    enunciado: '¿Qué es una jugada intermedia (zwischenzug)?',
    opciones: [
      'Meter un jaque o una amenaza antes de recapturar.',
      'Una jugada de peón a mitad de la partida.',
      'La jugada número 20, cuando acaba la apertura.',
      'Repetir la posición dos veces para hacer tablas.',
    ],
    correcta: 0,
    explica: 'Al calcular, pregúntate siempre: "¿puedo meter un jaque útil antes de recapturar?". Ahí aparecen medio punto y muchas piezas.',
  },
  {
    id: 'cal_torre_bloqueo', area: 'calculo', peso: 1, tipo: 'opcion',
    enunciado: '¿Puede una torre saltar por encima de otras piezas?',
    opciones: [
      'No: se detiene en la primera pieza del camino.',
      'Sí, siempre y por encima de cualquier pieza.',
      'Sí, pero solo por encima de los peones.',
      'Solo en su primera jugada de la partida.',
    ],
    correcta: 0,
    explica: 'Salvo el caballo, ninguna pieza salta por encima de otra: la torre se detiene en la primera pieza que encuentra en su línea de movimiento.',
  },
  {
    id: 'cal_orden_capturas', area: 'calculo', peso: 2, tipo: 'opcion',
    enunciado: 'Al calcular una serie de capturas en una misma casilla, ¿qué principio general conviene seguir?',
    opciones: [
      'Capturar primero con la pieza de menor valor.',
      'Capturar siempre primero con la dama, que manda.',
      'No capturar nunca con peones en esa casilla.',
      'Capturar siempre con la pieza más valiosa.',
    ],
    correcta: 0,
    explica: 'La regla práctica es "capturar de menor a mayor valor": si la secuencia de cambios se corta a mitad de camino, no arriesgaste tu pieza más valiosa de entrada.',
  },
  {
    id: 'cal_jaques_primero', area: 'calculo', peso: 3, tipo: 'opcion',
    enunciado: 'En el cálculo de variantes forzadas (jaques, capturas, amenazas), ¿por qué conviene analizar primero los jaques?',
    opciones: [
      'Porque limitan mucho las respuestas del rival.',
      'Porque un jaque casi siempre gana la partida.',
      'Porque no se puede capturar estando en jaque.',
      'Porque el jaque solo obliga en los finales.',
    ],
    correcta: 0,
    explica: 'Los jaques son la jugada más forzada posible: reducen mucho las respuestas legales del rival, lo que hace más fácil calcular esa rama con precisión.',
  },

  /* ================== Ampliación del banco ==================
   * Los ítems de arriba son la prueba original. A partir de aquí el banco
   * crece con más temas, sobre todo tácticos: cada prueba sortea 7 ítems por
   * área (ver DIAGNOSTICO_PRUEBA al final del archivo), así que dos alumnos
   * —o el mismo alumno en dos fechas— no reciben exactamente las mismas
   * preguntas, pero sí la misma cantidad, el mismo reparto por áreas y el
   * mismo total de puntos.
   *
   * Los temas tácticos siguen la lista clásica de motivos: ataque doble,
   * clavada, enfilada, descubierta, jaque doble, desviación, atracción,
   * eliminación del defensor, sobrecarga, interferencia, despeje, jugada
   * intermedia, pieza desesperada, pieza atrapada, socavado, molino y jaque
   * perpetuo. Los nombres van en el español que se usa acá (horquilla,
   * enfilada, mate de la coz) y el término en inglés queda entre paréntesis
   * solo cuando es el que se va a encontrar buscando en internet.
   */

  /* ---------------- Táctica (ampliación) ---------------- */
  {
    id: 'tac_doble_ataque', area: 'tactica', peso: 1, tipo: 'opcion',
    enunciado: '¿Cómo se llama la jugada que ataca dos piezas rivales al mismo tiempo?',
    opciones: [
      'Ataque doble, u horquilla si es de caballo.',
      'Clavada, que deja inmóvil a una pieza.',
      'Enroque largo por el flanco de dama.',
      'Jugada de espera, para ganar un tiempo entero.',
    ],
    correcta: 0,
    explica: 'El ataque doble gana material porque el rival alcanza a salvar una sola de las dos piezas. Es la táctica más común de todas: vale la pena buscarla en cada jugada.',
  },
  {
    id: 'tac_descubierta', area: 'tactica', peso: 1, tipo: 'opcion',
    enunciado: 'Mueves una pieza y, al quitarse de en medio, la que estaba detrás ataca algo importante. ¿Cómo se llama eso?',
    opciones: [
      'Ataque a la descubierta: atacan dos piezas.',
      'Clavada, porque la pieza de atrás queda fija.',
      'Captura al paso con el peón que pasa.',
      'Ahogado del rey que no puede mover.',
    ],
    correcta: 0,
    explica: 'En la descubierta la pieza que se mueve queda libre para hacer cualquier cosa (incluso ponerse donde la pueden capturar), porque el rival tiene que atender el ataque de la pieza de atrás.',
  },
  {
    id: 'tac_colgada', area: 'tactica', peso: 1, tipo: 'opcion',
    enunciado: 'En el ajedrez de club se dice que una pieza está "colgada". ¿Qué quiere decir?',
    opciones: [
      'Que está sin defensa: nadie la recaptura.',
      'Que está en la última fila del tablero.',
      'Que no se ha movido en toda la partida.',
      'Que está clavada contra su propio rey.',
    ],
    correcta: 0,
    explica: 'Antes de cada jugada conviene revisar las piezas colgadas —las tuyas y las del rival—: la mitad de las tácticas de una partida de club salen de ahí.',
  },
  {
    id: 'tac_clavada_tablero', area: 'tactica', peso: 1, tipo: 'jugada',
    enunciado: 'Clava el caballo negro contra su rey: juega la jugada de alfil tras la cual ese caballo no se puede mover.',
    fen: '4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1',
    solucion: { from: 'f1', to: 'b5' },
    explica: 'Con el alfil en b5 el caballo de c6 queda entre el alfil y su propio rey: moverlo sería dejar al rey en jaque, así que no puede. Una pieza clavada contra el rey no defiende nada.',
    prueba: 'tras Ab5 el caballo negro no tiene ninguna jugada legal (clavada absoluta) y es la única jugada del alfil que lo consigue',
  },
  {
    id: 'tac_enfilada', area: 'tactica', peso: 2, tipo: 'opcion',
    enunciado: '¿Qué es una enfilada (en inglés, skewer)?',
    opciones: [
      'Como una clavada al revés: la valiosa está adelante.',
      'Dos peones propios que se defienden en la misma diagonal.',
      'Un jaque que se repite tres veces y hace tablas.',
      'Una torre que llega a la séptima y come peones.',
    ],
    correcta: 0,
    explica: 'Clavada y enfilada son la misma línea de ataque, cambiando el orden: en la clavada la pieza valiosa está atrás; en la enfilada, adelante, y se gana lo que queda detrás.',
  },
  {
    id: 'tac_enfilada_tablero', area: 'tactica', peso: 2, tipo: 'jugada',
    enunciado: 'Gana la dama negra con una enfilada: da jaque de manera que, al moverse el rey, la torre se coma la dama.',
    fen: '8/8/8/2k4q/8/8/8/R5K1 w - - 0 1',
    solucion: { from: 'a1', to: 'a5' },
    explica: 'Con Ta5+ el rey y la dama quedan en la misma fila: el rey tapa la única casilla por donde la dama podría interponerse, así que tiene que salirse de la fila 5 y ahí cae la dama.',
    prueba: 'Ta5+ da jaque, las negras solo tienen jugadas de rey (la dama no puede interponerse) y tras cualquiera de ellas Txh5 es legal y la torre no queda al alcance del rey',
  },
  {
    id: 'tac_jaque_doble', area: 'tactica', peso: 2, tipo: 'opcion',
    enunciado: 'El rey recibe jaque de dos piezas a la vez (jaque doble). ¿Qué puede hacer el rival?',
    opciones: [
      'Solo mover el rey: no hay forma de tapar los dos.',
      'Capturar una de las dos piezas que dan jaque.',
      'Interponer una pieza en las dos líneas a la vez.',
      'Nada: el jaque doble siempre termina en mate.',
    ],
    correcta: 0,
    explica: 'Por eso el jaque doble es tan fuerte: como el rey está obligado a moverse, la pieza que lo da puede quedar atacada sin que importe.',
  },
  {
    id: 'tac_doble_jaque_tablero', area: 'tactica', peso: 3, tipo: 'jugada',
    enunciado: 'Da jaque doble: mueve el caballo de modo que el rey negro quede en jaque del caballo y de la torre al mismo tiempo.',
    fen: '2k5/8/8/8/2N5/8/8/2R3K1 w - - 0 1',
    solucion: { from: 'c4', to: 'b6' },
    alternas: [{ from: 'c4', to: 'd6' }],
    explica: 'El caballo se corre de la columna c (con lo que la torre da jaque) y desde b6 o d6 ataca él mismo al rey. Dos jaques a la vez: el rey no tiene más remedio que moverse.',
    prueba: 'tras Cb6+ y tras Cd6+ el rey negro queda atacado por dos piezas (caballo y torre); las demás jugadas del caballo dan un solo jaque',
  },
  {
    id: 'tac_atraccion', area: 'tactica', peso: 2, tipo: 'opcion',
    enunciado: '¿En qué consiste la táctica de atracción (o señuelo)?',
    opciones: [
      'Sacrificar algo para atraer una pieza a una casilla mala.',
      'Retirar las piezas propias a la primera fila y esperar.',
      'Cambiar todas las piezas para llegar rápido al final.',
      'Mover el mismo caballo varias veces para ganar tiempo.',
    ],
    correcta: 0,
    explica: 'Atracción y desviación son primas: una arrastra a la pieza adonde te conviene, la otra la saca de donde estorbaba. En las dos, el sacrificio se paga con la táctica que viene después.',
  },
  {
    id: 'tac_pieza_atrapada', area: 'tactica', peso: 2, tipo: 'opcion',
    enunciado: 'Tu rival metió la dama a comer un peón lejos de sus piezas. ¿Qué idea vale la pena buscar?',
    opciones: [
      'Atraparla: quitarle una por una las casillas de salida.',
      'Cambiar damas cuanto antes, antes de que ella vuelva.',
      'Dar jaques hasta que regrese sola a su campo.',
      'Avanzar todos los peones del flanco de rey.',
    ],
    correcta: 0,
    explica: 'Una pieza atrapada es material ganado aunque la captura llegue tres jugadas después: primero se le cierran las salidas y al final se cobra.',
  },
  {
    id: 'tac_perpetuo', area: 'tactica', peso: 2, tipo: 'opcion',
    enunciado: 'Vas perdiendo por una pieza, pero puedes dar jaque una y otra vez sin que el rey rival se escape. ¿Qué resultado buscas?',
    opciones: [
      'Tablas por jaque perpetuo.',
      'Ganar por tiempo en el reloj.',
      'Mate en tres jugadas.',
      'Que el rival quede ahogado.',
    ],
    correcta: 0,
    explica: 'El jaque perpetuo es el salvavidas de las posiciones perdidas: si el rey rival no puede salir de la red de jaques, la partida termina en tablas por repetición.',
  },
  {
    id: 'tac_sobrecarga', area: 'tactica', peso: 3, tipo: 'opcion',
    enunciado: 'Una torre rival es la única que defiende dos cosas a la vez. ¿Cómo se llama esa debilidad y cómo se aprovecha?',
    opciones: [
      'Sobrecarga: se ataca una cosa y suelta la otra.',
      'Clavada: la torre no se puede mover de esa casilla.',
      'Zugzwang: la torre está obligada a mover.',
      'Enfilada: la torre cae por estar en línea.',
    ],
    correcta: 0,
    explica: 'La pregunta que la descubre es siempre la misma: "¿qué defiende esta pieza?". Si la respuesta son dos cosas, hay táctica.',
  },
  {
    id: 'tac_interferencia', area: 'tactica', peso: 3, tipo: 'opcion',
    enunciado: '¿Qué es una interferencia (obstrucción)?',
    opciones: [
      'Cortar con una pieza la línea por la que el rival defiende.',
      'Poner dos peones en la misma columna, uno delante del otro.',
      'Bloquear un peón pasado poniendo el caballo delante.',
      'Cambiar la dama por las dos torres del rival.',
    ],
    correcta: 0,
    explica: 'La defensa no siempre se puede mover ni desviar: a veces basta con cortarle la línea. Por eso la interferencia suele venir con un sacrificio en la casilla justa.',
  },
  {
    id: 'tac_despeje', area: 'tactica', peso: 3, tipo: 'opcion',
    enunciado: 'Tu propia pieza está tapando la línea por la que tu dama daría mate. ¿Cuál es la idea?',
    opciones: [
      'Despejar la línea: mover esa pieza con amenaza.',
      'Cambiarla por la pieza rival que tenga más cerca.',
      'Retirarla a la primera fila y volver a empezar.',
      'Dejarla ahí: nunca conviene abrir líneas propias.',
    ],
    correcta: 0,
    explica: 'El despeje de línea (o de casilla) gana tiempo: la pieza que estorba se va haciendo daño, y detrás de ella ya viene la amenaza de verdad.',
  },
  {
    id: 'tac_molino', area: 'tactica', peso: 3, tipo: 'opcion',
    enunciado: '¿Qué es el "molino", una de las tácticas más vistosas del ajedrez?',
    opciones: [
      'Jaques a la descubierta con torre y alfil, uno tras otro.',
      'Girar el tablero para ver la posición del otro lado.',
      'Mover el caballo en círculo alrededor del rey rival.',
      'Repetir la misma jugada tres veces seguidas, y quedan tablas.',
    ],
    correcta: 0,
    explica: 'Funciona porque el rival nunca puede hacer nada: entre jaque y jaque descubierto solo alcanza a mover el rey, mientras la torre cobra todo lo que hay en su camino.',
  },
  {
    id: 'tac_socavar', area: 'tactica', peso: 3, tipo: 'opcion',
    enunciado: 'Una pieza rival bien puesta está sostenida por un peón. ¿Qué significa "socavar" esa posición?',
    opciones: [
      'Atacar o cambiar el peón que la sostiene.',
      'Atacar la pieza con otra de más valor.',
      'Cambiar las damas para llegar al final.',
      'Poner un peón propio justo delante de ella.',
    ],
    correcta: 0,
    explica: 'Contra una pieza bien plantada casi nunca sirve atacarla de frente: se le quita el piso, que suele ser un peón.',
  },
  {
    id: 'tac_desesperada', area: 'tactica', peso: 3, tipo: 'opcion',
    enunciado: 'Tu alfil está perdido, no hay forma de salvarlo. ¿Qué conviene hacer con él?',
    opciones: [
      'Venderlo caro: que se lleve algo antes de caer.',
      'Retirarlo a la primera fila y dejarlo ahí.',
      'Dejarlo donde está y jugar con las demás.',
      'Cambiarlo por un peón cualquiera, el que sea.',
    ],
    correcta: 0,
    explica: 'Una pieza que igual se va a perder no tiene nada que cuidar: que capture lo más caro que alcance, o que se meta donde obligue al rival a gastar una jugada.',
  },

  /* ---------------- Jaque mate (ampliación) ---------------- */
  {
    id: 'mate_jaque_no_es_mate', area: 'mate', peso: 1, tipo: 'opcion',
    enunciado: 'Le das jaque al rey rival. ¿Qué tres formas tiene de salir del jaque?',
    opciones: [
      'Mover el rey, capturar a quien da jaque o tapar.',
      'Solo mover el rey: no hay ninguna otra salida.',
      'Enrocar, capturar la pieza o pedir tablas.',
      'Ninguna: el jaque siempre termina en mate.',
    ],
    correcta: 0,
    explica: 'Mate es justo cuando ninguna de esas tres salidas existe. Repasarlas en orden —mover, capturar, tapar— es la forma de no cantar mate donde no lo hay.',
  },
  {
    id: 'mate_escalera_tablero', area: 'mate', peso: 2, tipo: 'jugada',
    enunciado: 'Da jaque mate en una jugada con las dos torres.',
    fen: '7k/1R6/R7/8/8/8/8/6K1 w - - 0 1',
    solucion: { from: 'a6', to: 'a8' },
    explica: 'Es el mate de la escalera: una torre le quita la fila 7 al rey y la otra da el jaque en la fila 8. Sin la torre de b7 el rey se escaparía a h7.',
    prueba: 'Ta8 es mate y es el único mate en 1 de la posición',
  },
  {
    id: 'mate_tecnica_torre', area: 'mate', peso: 2, tipo: 'opcion',
    enunciado: 'Te queda rey y torre contra rey solo. ¿Cuál es el plan para dar mate?',
    opciones: [
      'Empujar al rey al borde con la torre y acercar el propio.',
      'Dar jaques con la torre lo más rápido que se pueda, sin parar.',
      'Dejar la torre en el centro y esperar al rey rival.',
      'Cambiar la torre por el peón rival más avanzado.',
    ],
    correcta: 0,
    explica: 'La torre sola no da mate: hace falta el rey propio para quitarle las casillas de escape. Sin plan, la partida se va a tablas por las 50 jugadas.',
  },
  {
    id: 'mate_ahogado_cuidado', area: 'mate', peso: 2, tipo: 'opcion',
    enunciado: 'Vas ganando con dama de más contra rey solo. ¿Cuál es el descuido más común?',
    opciones: [
      'Dejarlo sin jaque y sin jugada legal: es ahogado.',
      'Dar tantos jaques que se acaba el tiempo propio.',
      'Coronar otra dama más sin ninguna necesidad.',
      'Acercar demasiado el propio rey al del rival.',
    ],
    correcta: 0,
    explica: 'Con dama de ventaja, antes de cada jugada hay que preguntarse: "¿le queda alguna jugada legal?". Si no le queda y no está en jaque, la partida se acabó en tablas.',
  },
  {
    id: 'mate_arabe', area: 'mate', peso: 3, tipo: 'opcion',
    enunciado: '¿Qué piezas trabajan juntas en el llamado mate árabe?',
    opciones: [
      'Torre y caballo, contra el rey en la esquina.',
      'Los dos alfiles, en diagonales que se cruzan.',
      'Dama y peón, con el peón dando apoyo.',
      'Dos peones ligados que llegan juntos.',
    ],
    correcta: 0,
    explica: 'Torre y caballo se entienden muy bien alrededor del rey enrocado: vale la pena reconocer el patrón, porque aparece en cientos de finales de ataque.',
  },
  {
    id: 'mate_anastasia', area: 'mate', peso: 3, tipo: 'opcion',
    enunciado: 'En el mate de Anastasia, ¿qué hace el caballo?',
    opciones: [
      'Se planta en e7 y le quita al rey las casillas de g.',
      'Da él mismo el jaque final desde f7, como en la coz.',
      'Se cambia por el alfil que defiende al rey.',
      'Bloquea el peón pasado que corre del otro lado.',
    ],
    correcta: 0,
    explica: 'Es un patrón de ataque al enroque: caballo en e7, sacrificio de dama en h7 si hace falta y torre a la columna h. Conocerlo hace que la combinación aparezca sola.',
  },

  /* ---------------- Cálculo y visualización (ampliación) ---------------- */
  {
    id: 'cal_diagonal', area: 'calculo', peso: 1, tipo: 'opcion',
    enunciado: 'Sin mirar el tablero: ¿un alfil que está en e4 puede llegar en una jugada a a8 (si el camino está libre)?',
    opciones: [
      'Sí: e4, d5, c6, b7 y a8 van en diagonal.',
      'No: e4 y a8 son de colores distintos.',
      'No: un alfil no cruza tantas casillas.',
      'Solo si es el alfil de casillas negras.',
    ],
    correcta: 0,
    explica: 'Ver las diagonales sin mover las piezas es media batalla del cálculo. El truco: de e4 hacia arriba y a la izquierda, letra que baja y número que sube.',
    prueba: 'e4 y a8 están en la misma diagonal (misma suma de columna y fila)',
  },
  {
    id: 'cal_candidatas', area: 'calculo', peso: 2, tipo: 'opcion',
    enunciado: 'Antes de calcular a fondo, ¿qué conviene hacer primero?',
    opciones: [
      'Elegir dos o tres jugadas candidatas y calcularlas.',
      'Calcular hasta el final la primera que se ocurra.',
      'Mirar cuánto tiempo le queda al rival en el reloj.',
      'Cambiar piezas para simplificar la posición.',
    ],
    correcta: 0,
    explica: 'Sin lista de candidatas se calcula mucho y se elige mal: casi siempre la buena era la que nunca se miró.',
  },
  {
    id: 'cal_respuesta_rival', area: 'calculo', peso: 2, tipo: 'opcion',
    enunciado: '¿Cuál es el error más caro al calcular una variante?',
    opciones: [
      'Darle al rival la respuesta que a uno le conviene.',
      'Calcular sin tocar las piezas del tablero.',
      'Empezar el cálculo por los jaques posibles.',
      'Contar el valor de las piezas antes de entrar en ella.',
    ],
    correcta: 0,
    explica: 'En cada jugada del rival hay que buscar su mejor defensa, no la que deja lucir la combinación. Si la variante aguanta eso, sirve.',
  },
  {
    id: 'cal_posicion_tranquila', area: 'calculo', peso: 3, tipo: 'opcion',
    enunciado: '¿Hasta dónde hay que calcular una variante de capturas?',
    opciones: [
      'Hasta una posición tranquila, sin capturas pendientes.',
      'Exactamente tres jugadas, siempre, en cualquier caso.',
      'Hasta que se acabe el tiempo de pensar la jugada.',
      'Hasta la primera captura, y ahí ya se decide.',
    ],
    correcta: 0,
    explica: 'Cortar el cálculo a mitad de una serie de cambios es la trampa clásica: la posición parecía buena justo antes de la recaptura que lo cambiaba todo.',
  },

  /* Tres ítems que le faltaban al banco para que el sorteo pueda cumplir la
     cuota de todas las áreas (reglas y material necesitaban un segundo ítem de
     peso 3; estrategia, un segundo de peso 1). */
  {
    id: 'reg_jaque_obligado', area: 'reglas', peso: 3, tipo: 'opcion',
    enunciado: 'Tu rey está en jaque y tienes una jugada que gana la dama rival, pero no te saca del jaque. ¿Qué puedes hacer?',
    opciones: [
      'Nada: en jaque solo valen las jugadas que lo resuelven.',
      'Ganar la dama: con material de más se gana igual de fácil.',
      'Cualquiera de las dos, a elección del jugador.',
      'Ganar la dama, si después puedes tapar el jaque.',
    ],
    correcta: 0,
    explica: 'El jaque es obligatorio de atender: mover el rey, capturar a quien lo da o interponer algo. Cualquier otra jugada, por buena que sea, no existe.',
  },
  {
    id: 'mat_cambiar_ganando', area: 'material', peso: 3, tipo: 'opcion',
    enunciado: 'Vas ganando una pieza. ¿Qué criterio de cambios te conviene?',
    opciones: [
      'Cambiar piezas, no peones: la ventaja pesa más.',
      'Cambiar peones, no piezas: así se abren líneas.',
      'No cambiar nada: cada cambio le da una chance.',
      'Cambiar damas solo si el rival lo propone.',
    ],
    correcta: 0,
    explica: 'Es la regla práctica que convierte ventajas en puntos: con pieza de más, cada cambio de piezas acerca el final ganado; los peones, en cambio, hacen falta para coronar.',
  },
  {
    id: 'est_rey_final', area: 'estrategia', peso: 1, tipo: 'opcion',
    enunciado: 'En el final, ¿qué pasa con el rey?',
    opciones: [
      'Se vuelve una pieza fuerte: hay que activarlo.',
      'Sigue escondido en el enroque hasta el final.',
      'Solo sirve para dar el mate, nada más.',
      'Conviene dejarlo atrás para que no lo ataquen.',
    ],
    correcta: 0,
    explica: 'Con pocas piezas ya no hay quien lo ataque: el rey pasa de ser el que se esconde a ser la pieza que decide, y quien lo activa primero suele ganar el final.',
  },

  /* ================== Escalones 4 y 5: el techo de la prueba ==================
   * Sin preguntas difíciles de verdad la prueba no distingue: un jugador de
   * 1400 y uno de 2300 contestaban bien casi todo y salían los dos "Experto".
   * Estos ítems son el techo — peso 4 (fuerte de club) y peso 5 (competencia)
   * — y son los que deciden el nivel estimado: se mide hasta qué escalón de
   * dificultad llega el alumno, no cuántas preguntas fáciles acertó.
   *
   * La regla al escribirlos: ninguna opción falsa puede ser absurda. Si una se
   * descarta de un vistazo, el ítem deja de medir y vuelve a regalar puntos.
   */

  /* ---------------- Reglas (escalones 4 y 5) ---------------- */
  {
    id: 'reg_enroque_torre_atacada', area: 'reglas', peso: 4, tipo: 'opcion',
    enunciado: 'Enroque largo: la casilla b1, por la que pasa la torre, está atacada por un alfil negro. Las casillas del rey (e1, d1, c1) están todas libres de ataque. ¿Se puede enrocar?',
    opciones: [
      'Sí: la regla mira solo las casillas del rey.',
      'No: tampoco puede estar atacada la casilla de la torre.',
      'Sí, si después del enroque el alfil deja de atacar b1.',
      'No, salvo que la torre esté defendida por otra pieza.',
    ],
    correcta: 0,
    explica: 'El reglamento habla del rey: no puede estar en jaque, ni pasar ni terminar en casilla atacada. La torre puede cruzar b1 atacada sin problema — es la diferencia que más se discute en torneos escolares.',
  },
  {
    id: 'reg_repeticion', area: 'reglas', peso: 4, tipo: 'opcion',
    enunciado: 'Para reclamar tablas por repetición, ¿qué es exactamente lo que tiene que repetirse tres veces?',
    opciones: [
      'La posición, con el mismo turno y los mismos derechos.',
      'Las mismas tres jugadas de cada bando, en el mismo orden.',
      'La posición, sin importar a quién le toque mover.',
      'El mismo jaque, tres veces seguidas en la partida.',
    ],
    correcta: 0,
    explica: 'Son posiciones, no jugadas, y tienen que ser idénticas en todo: mismo turno, mismos enroques posibles y misma posibilidad de captura al paso. Por eso a veces "la misma posición" no cuenta.',
  },
  {
    id: 'reg_tiempo_sin_material', area: 'reglas', peso: 5, tipo: 'opcion',
    enunciado: 'A tu rival se le cae la bandera (se le acaba el tiempo). A ti te queda solo el rey. ¿Cuál es el resultado?',
    opciones: [
      'Tablas: sin material para dar mate no se gana por tiempo.',
      'Ganas tú: quien se queda sin tiempo pierde siempre.',
      'Gana tu rival, porque tiene más material que tú.',
      'Se sigue jugando: la caída de bandera no cuenta en este caso.',
    ],
    correcta: 0,
    explica: 'Es el artículo del reglamento que más partidas de torneo decide mal cuando no se conoce: sin material para dar mate ni siquiera con la peor defensa posible, la caída de bandera es empate.',
  },
  {
    id: 'reg_enroque_toque', area: 'reglas', peso: 5, tipo: 'opcion',
    enunciado: 'En torneo, con pieza tocada: quieres enrocar y tocas primero la torre. ¿Qué pasa?',
    opciones: [
      'Solo puedes mover la torre: el enroque se toca del rey.',
      'Igual puedes enrocar: se ve que la intención era esa.',
      'Pierdes el derecho al enroque para toda la partida.',
      'Nada: la regla de pieza tocada no aplica al enroque.',
    ],
    correcta: 0,
    explica: 'El enroque es una jugada de rey. Tocar la torre primero obliga a jugarla sola, y si estaba mal ubicada se pierde el enroque de esa jugada — un detalle que solo aparece cuando se juega con árbitro.',
  },

  /* ---------------- Valor del material (escalones 4 y 5) ---------------- */
  {
    id: 'mat_calidad_sacrificio', area: 'material', peso: 4, tipo: 'opcion',
    enunciado: 'Sacrificar la calidad (dar torre por alfil o caballo). ¿Cuándo suele valer la pena?',
    opciones: [
      'Cuando a cambio queda algo permanente: casillas o estructura.',
      'Nunca: cinco puntos contra tres siempre es perder material.',
      'Siempre que se recupere al menos un peón en el camino.',
      'Solo en los finales de torres, donde no se aprovecha.',
    ],
    correcta: 0,
    explica: 'La calidad se entrega por ventajas que no se van: casillas, estructura, seguridad del rey. Si lo que se obtiene se puede deshacer en tres jugadas, el sacrificio no era.',
  },
  {
    id: 'mat_dos_menores_vs_torre', area: 'material', peso: 4, tipo: 'opcion',
    enunciado: 'Dos piezas menores contra torre y peón, con damas y varias piezas todavía en el tablero. ¿Qué prefieres?',
    opciones: [
      'Las dos menores: con el tablero lleno coordinan mejor.',
      'La torre y el peón: seis puntos contra seis, y es mayor.',
      'Da exactamente lo mismo: el conteo no engaña.',
      'La torre, salvo que una menor sea un alfil malo.',
    ],
    correcta: 0,
    explica: 'La tabla de valores es una guía de principiante: en el medio juego dos menores activas valen más que torre y peón, y la relación se da vuelta cuando se cambian piezas y se abren columnas.',
  },
  {
    id: 'mat_pareja_alfiles_contra', area: 'material', peso: 5, tipo: 'opcion',
    enunciado: 'Tu rival tiene la pareja de alfiles y tú alfil y caballo. ¿Cuál es el plan correcto?',
    opciones: [
      'Cerrar la posición y cambiar uno de los dos alfiles.',
      'Abrir la posición para que el caballo tenga casillas.',
      'Cambiar damas: sin damas la pareja ya no cuenta.',
      'Avanzar los peones donde él tiene el alfil bueno.',
    ],
    correcta: 0,
    explica: 'La pareja vale por el trabajo conjunto en posiciones abiertas. Trabar los peones y cambiar uno de los dos la desarma: es la receta de Steinitz para el lado que no la tiene.',
  },
  {
    id: 'mat_dos_torres_vs_dama_fuerte', area: 'material', peso: 5, tipo: 'opcion',
    enunciado: 'Dos torres contra dama, con peones en los dos flancos. ¿Cuándo pelea mejor la dama?',
    opciones: [
      'Cuando hay peones sueltos que cobrar y el rey al aire.',
      'Siempre: se mueve mucho más que las dos torres juntas.',
      'Nunca: dos torres coordinadas ganan en toda posición.',
      'Solo si quedan menos de cuatro peones en el tablero.',
    ],
    correcta: 0,
    explica: 'Es la relación de material que menos se decide por la tabla: dos torres bien puestas y con el rey seguro valen más, pero la dama se come las posiciones con debilidades sueltas y reyes al aire.',
  },

  /* ---------------- Apertura (escalones 4 y 5) ---------------- */
  {
    id: 'ap_carlsbad', area: 'apertura', peso: 4, tipo: 'opcion',
    enunciado: 'Estructura Carlsbad (peones blancos en c3, d4, e3 y negros en c6, d5, e6, con el cambio ya hecho en d5). ¿Cuál es el plan clásico de las blancas?',
    opciones: [
      'El ataque de minorías: b4-b5 y cambio en c6.',
      'Avanzar e3-e4 ya mismo, aunque quede un aislado.',
      'Enrocar largo y tirar los peones del flanco de rey.',
      'Cambiar todo para llegar a un final de peones.',
    ],
    correcta: 0,
    explica: 'Dos peones atacando a tres: el cambio en c6 deja un peón atrasado en columna semiabierta. Es el plan más enseñado del Gambito de Dama y se juega igual en 1900 y hoy.',
  },
  {
    id: 'ap_peon_aislado', area: 'apertura', peso: 4, tipo: 'opcion',
    enunciado: 'Juegas contra un peón dama aislado del rival (su peón en d4, sin peones en c ni e). ¿Cuál es la estrategia correcta?',
    opciones: [
      'Cambiar piezas y bloquear la casilla de adelante.',
      'Cambiar peones y dejar las piezas para atacarlo.',
      'Capturarlo cuanto antes, cueste lo que cueste.',
      'Evitar los cambios y jugar en el flanco de dama.',
    ],
    correcta: 0,
    explica: 'El peón aislado da actividad en el medio juego y es una debilidad en el final: quien lo sufre cambia piezas y bloquea; quien lo tiene evita los cambios y busca la ruptura d4-d5.',
  },
  {
    id: 'ap_orden_jugadas', area: 'apertura', peso: 5, tipo: 'opcion',
    enunciado: '¿Por qué los jugadores fuertes cuidan tanto el orden de jugadas en la apertura?',
    opciones: [
      'Porque transponiendo se elige a qué variante entrar.',
      'Porque el reglamento obliga a sacar primero los caballos.',
      'Porque cambiar el orden hace perder el enroque.',
      'Porque así se gana tiempo en el reloj del rival.',
    ],
    correcta: 0,
    explica: 'La misma posición se llega por caminos distintos, y en el camino cada bando tiene desvíos. Elegir el orden es elegir qué desvíos le dejas al rival.',
  },
  {
    id: 'ap_najdorf_a6', area: 'apertura', peso: 5, tipo: 'opcion',
    enunciado: 'Siciliana Najdorf (1.e4 c5 2.Cf3 d6 3.d4 cxd4 4.Cxd4 Cf6 5.Cc3 a6). ¿Para qué juegan las negras ...a6?',
    opciones: [
      'Le quita b5 a las blancas y prepara ...e5.',
      'Prepara el enroque largo de las negras.',
      'Ataca el peón de b2 con la torre de a8.',
      'Evita que las blancas jueguen el gambito.',
    ],
    correcta: 0,
    explica: 'Es una jugada de profilaxis pura: no desarrolla nada, pero le quita una casilla clave al rival y habilita el plan que las negras quieren (...e5 y ...b5).',
  },

  /* ---------------- Táctica (escalones 4 y 5) ---------------- */
  {
    id: 'tac_sacrificio_f7', area: 'tactica', peso: 4, tipo: 'jugada',
    enunciado: 'Encuentra el golpe que fuerza el mate en dos. Juega solo ese golpe.',
    fen: '6k1/5ppp/6Q1/5R2/8/8/8/6K1 w - - 0 1',
    solucion: { from: 'g6', to: 'f7' },
    explica: 'Dxf7+ arrastra al rey (o tapa con la torre) y el mate llega en la siguiente. El sacrificio en f7 es el punto flojo del enroque corto desde la primera partida que uno juega.',
    prueba: 'Dxf7+ fuerza mate en 2 y es la única jugada que lo hace (búsqueda exhaustiva sobre todas las respuestas negras)',
  },
  {
    id: 'tac_orden_amenazas', area: 'tactica', peso: 4, tipo: 'opcion',
    enunciado: 'Tu rival amenaza mate en una jugada y tú puedes ganar una torre. ¿Qué manda?',
    opciones: [
      'Parar el mate, salvo que ganar la torre lo pare también.',
      'Ganar la torre: con material de más se defiende mejor.',
      'Cambiar damas para simplificar la posición y respirar.',
      'Dar jaque con cualquier pieza para ganar un tiempo.',
    ],
    correcta: 0,
    explica: 'Lo forzado va antes que lo bueno. La excepción vale la pena buscarla siempre: una jugada que gana material Y para el mate es la que hay que encontrar.',
  },
  {
    id: 'tac_senales_combinacion', area: 'tactica', peso: 5, tipo: 'opcion',
    enunciado: '¿Qué señales avisan de que en una posición probablemente HAY una combinación?',
    opciones: [
      'Rey con pocas casillas, piezas sin defensa o clavadas.',
      'Tener más material que el rival en ese momento justo.',
      'Que el rival haya movido dos veces la misma pieza.',
      'Que queden menos de veinte piezas en el tablero.',
    ],
    correcta: 0,
    explica: 'Las combinaciones no aparecen de la nada: viven de elementos concretos. Cuando hay dos o tres de esos elementos juntos, vale la pena gastar tiempo buscando; cuando no hay ninguno, casi nunca hay nada.',
  },
  {
    id: 'tac_defensa_activa', area: 'tactica', peso: 5, tipo: 'opcion',
    enunciado: 'Estás bajo ataque y aguantando. ¿Cuál es el criterio de defensa que más partidas salva?',
    opciones: [
      'Buscar el contragolpe o cambiar la pieza atacante.',
      'Retirar todas las piezas a la primera fila y esperar.',
      'Devolver material de inmediato para calmar el juego.',
      'Dar jaques hasta que el rival se equivoque solo.',
    ],
    correcta: 0,
    explica: 'Defender sumando piezas pasivas pierde por acumulación: el atacante sigue trayendo gente. Cambiar a la pieza atacante clave o abrir un frente propio da vuelta muchas más partidas.',
  },

  /* ---------------- Jaque mate (escalones 4 y 5) ---------------- */
  {
    id: 'mate_dos_jugadas', area: 'mate', peso: 4, tipo: 'jugada',
    enunciado: 'Mate en dos jugadas: juega solo la primera, la que lo fuerza. Aviso: no es jaque.',
    fen: '6k1/5ppp/8/5N1Q/8/8/8/6K1 w - - 0 1',
    solucion: { from: 'h5', to: 'g5' },
    explica: 'Dg5 es una jugada callada: amenaza Dxg7 mate y las negras no tienen forma de cubrirlo todo, porque el caballo de f5 controla las casillas de escape.',
    prueba: 'Dg5 fuerza mate en 2, no hay mate en 1 en la posición y ninguna otra jugada fuerza mate en 2',
  },
  {
    id: 'mate_tres_jugadas', area: 'mate', peso: 5, tipo: 'jugada',
    enunciado: 'Mate en tres jugadas: juega solo la primera. Tampoco es jaque.',
    fen: '6k1/5p1p/6p1/8/8/7Q/8/4R1K1 w - - 0 1',
    solucion: { from: 'h3', to: 'h6' },
    explica: 'Dh6 mete la dama en la casilla desde donde amenaza mate y le quita al rey la salida por g7. Contra cualquier defensa, la torre entra por la columna e y el mate llega en tres.',
    prueba: 'Dh6 fuerza mate en 3, no hay mate en 1 ni en 2 en la posición y ninguna otra jugada fuerza mate en 3',
  },
  {
    id: 'mate_enroques_opuestos', area: 'mate', peso: 4, tipo: 'opcion',
    enunciado: 'Partida con enroques opuestos (uno enrocó corto y el otro largo). ¿Qué decide el ataque?',
    opciones: [
      'La velocidad: gana quien abre una línea primero.',
      'Quién tiene más piezas menores en el ataque.',
      'Quién consigue cambiar las damas antes que el otro.',
      'Quién deja su estructura de peones intacta.',
    ],
    correcta: 0,
    explica: 'Con enroques opuestos los peones propios ya no defienden al rey: son la artillería. Contar tiempos —cuántas jugadas me faltan a mí y cuántas a él— es literalmente la evaluación de la posición.',
  },
  {
    id: 'mate_boden', area: 'mate', peso: 5, tipo: 'opcion',
    enunciado: '¿Qué piezas dan el mate de Boden y contra qué rey?',
    opciones: [
      'Dos alfiles cruzados, contra un rey que enrocó largo.',
      'Dama y caballo, contra un rey que quedó en el centro.',
      'Dos torres en columnas contiguas, contra el rey al borde.',
      'Torre y peón, contra un rey tapado por sus piezas.',
    ],
    correcta: 0,
    explica: 'Aparece después de sacrificar en c3/c6 o a6/a3 para abrir las diagonales. Reconocer el patrón es lo que permite ver el sacrificio tres jugadas antes.',
  },

  /* ---------------- Finales (escalones 4 y 5) ---------------- */
  {
    id: 'fin_lucena', area: 'finales', peso: 4, tipo: 'opcion',
    enunciado: 'Posición de Lucena: tienes rey, torre y un peón en séptima; tu rey está delante del peón y el rey rival está cortado a dos columnas. ¿Cómo se gana?',
    opciones: [
      'Construyendo el puente: la torre a la cuarta fila.',
      'Dando jaques con la torre hasta que el rey se aleje.',
      'Adelantando el rey por la columna del peón, sin más.',
      'Cambiando las torres y ganando el final de peones.',
    ],
    correcta: 0,
    explica: 'Es la técnica de torres que más puntos vale: sin el puente, el mismo final es tablas. La torre en cuarta fila es la jugada que se aprende y ya no se olvida.',
  },
  {
    id: 'fin_torre_detras_pasado', area: 'finales', peso: 4, tipo: 'opcion',
    enunciado: 'Final de torres con un peón pasado. ¿Dónde va la torre, según la regla de Tarrasch?',
    opciones: [
      'Detrás del peón pasado, la del que empuja y la que frena.',
      'Delante del peón pasado, para bloquearlo con la propia torre.',
      'Al costado del peón, en su misma fila, vigilándolo.',
      'En la columna del rey rival, sin importar el peón.',
    ],
    correcta: 0,
    explica: 'Detrás, la torre que apoya gana casillas a medida que el peón avanza, y la que frena no pierde ninguna. Delante, el bloqueo condena a la torre a mirar la partida desde ahí.',
  },
  {
    id: 'fin_philidor', area: 'finales', peso: 5, tipo: 'opcion',
    enunciado: 'Defiendes con rey y torre contra rey, torre y un peón que todavía no llegó a tu tercera fila. ¿Cuál es la defensa de Philidor?',
    opciones: [
      'Torre en la tercera fila y después jaques por detrás.',
      'Cambiar las torres a la primera oportunidad que haya.',
      'Dar jaques desde el costado sin parar, desde el principio.',
      'Poner la torre delante del peón y dejarla quieta.',
    ],
    correcta: 0,
    explica: 'Son dos etapas y en ese orden: la tercera fila frena al rey, y cuando el peón avanza pierde el escudo, por eso los jaques desde atrás ya no se pueden tapar. Es la defensa que salva medio punto en cada torneo.',
  },
  {
    id: 'fin_triangulacion', area: 'finales', peso: 5, tipo: 'opcion',
    enunciado: 'En un final de reyes y peones, ¿para qué sirve triangular con el rey?',
    opciones: [
      'Para perder un tiempo y devolverle el turno al rival.',
      'Para llegar antes a la casilla de coronación del peón.',
      'Para atacar el peón rival desde el otro lado.',
      'Para evitar el ahogado del rey contrario.',
    ],
    correcta: 0,
    explica: 'Es zugzwang fabricado: la posición no cambia, cambia de quién es el turno. Solo funciona si tu rey tiene tres casillas útiles y el del rival no.',
  },

  /* ---------------- Estrategia (escalones 4 y 5) ---------------- */
  {
    id: 'est_profilaxis', area: 'estrategia', peso: 4, tipo: 'opcion',
    enunciado: '¿En qué consiste jugar con profilaxis?',
    opciones: [
      'Preguntarse qué quiere el rival y quitárselo.',
      'Cambiar piezas para no correr ningún riesgo.',
      'Defender el rey antes de empezar cualquier plan.',
      'Repetir jugadas hasta que el rival se decida.',
    ],
    correcta: 0,
    explica: 'La pregunta de Petrosian: "si me tocara mover a mí dos veces, ¿qué haría él?". Quitarle esa jugada suele valer más que adelantar el propio plan una casilla.',
  },
  {
    id: 'est_dos_debilidades', area: 'estrategia', peso: 4, tipo: 'opcion',
    enunciado: '¿Qué dice el principio de las dos debilidades?',
    opciones: [
      'Que hace falta una segunda debilidad, en el otro flanco.',
      'Que nunca hay que dejarse dos peones débiles en el tablero.',
      'Que dos piezas mal puestas equivalen a un peón menos.',
      'Que hay que atacar primero la debilidad más grande.',
    ],
    correcta: 0,
    explica: 'Es cómo se convierte una ventaja chica en punto entero: se fija la primera debilidad, se lleva el juego al otro flanco y la defensa se parte. Sin la segunda, casi todo se aguanta.',
  },
  {
    id: 'est_espacio_cambios', area: 'estrategia', peso: 5, tipo: 'opcion',
    enunciado: 'Tienes menos espacio que tu rival. ¿Qué conviene hacer?',
    opciones: [
      'Cambiar piezas: las que quedan tienen más aire.',
      'Evitar todos los cambios para no simplificar.',
      'Avanzar los peones donde tienes menos espacio.',
      'Enrocar al lado contrario y salir a atacar.',
    ],
    correcta: 0,
    explica: 'Con poco espacio el problema no son las piezas del rival: son las propias, que se estorban. El que tiene más espacio evita los cambios por la misma razón.',
  },
  {
    id: 'est_plan_desde_estructura', area: 'estrategia', peso: 5, tipo: 'opcion',
    enunciado: 'Llegas a una posición que no conoces y no sabes qué hacer. ¿De dónde sale el plan?',
    opciones: [
      'De la estructura de peones: rupturas y casillas débiles.',
      'De la apertura jugada, aunque la estructura haya cambiado.',
      'De contar el material y elegir el flanco con más piezas.',
      'De dar jaque para ver cómo responde el rival y decidir.',
    ],
    correcta: 0,
    explica: 'Los peones son lo único que casi no vuelve atrás: definen el terreno. Leer la estructura antes de mover piezas es la diferencia entre tener un plan y hacer jugadas.',
  },

  /* ---------------- Cálculo (escalones 4 y 5) ---------------- */
  {
    id: 'cal_posicion_critica', area: 'calculo', peso: 4, tipo: 'opcion',
    enunciado: 'En una partida lenta, ¿dónde hay que gastar el tiempo de reflexión?',
    opciones: [
      'En las posiciones críticas, donde la partida se define.',
      'Repartido parejo entre todas las jugadas de la partida.',
      'En la apertura, para salir bien de las primeras quince.',
      'En el final, que es cuando se puede calcular todo.',
    ],
    correcta: 0,
    explica: 'Reconocer la posición crítica —una ruptura, un cambio que no vuelve atrás, el momento de atacar— y ahí pensar veinte minutos es lo que separa a quien administra bien el reloj.',
  },
  {
    id: 'cal_comparar_finales', area: 'calculo', peso: 4, tipo: 'opcion',
    enunciado: 'Dos jugadas te parecen buenas y no llegas a calcularlas hasta el final. ¿Cómo decides?',
    opciones: [
      'Comparando las posiciones a las que llevan las dos.',
      'Eligiendo la que da jaque, que siempre es más fuerte.',
      'Eligiendo la que gana más material en la primera jugada.',
      'Repitiendo la posición para decidir con más tiempo.',
    ],
    correcta: 0,
    explica: 'El cálculo termina en una evaluación, no en un número: cuando no se ve el final de la variante, se compara la posición que queda. Calcular sin evaluar no sirve de nada.',
  },
  {
    id: 'cal_jugadas_silenciosas', area: 'calculo', peso: 5, tipo: 'opcion',
    enunciado: '¿Qué tipo de jugada es la que más se escapa cuando uno calcula?',
    opciones: [
      'Las silenciosas: ni jaque ni captura, y las del rival.',
      'Los jaques, porque en cada posición hay muchos.',
      'Las capturas de peón, que parecen todas iguales entre sí.',
      'Las jugadas de enroque, que cambian dos piezas.',
    ],
    correcta: 0,
    explica: 'El cálculo se apoya en lo forzado, y ahí la vista funciona sola. Las combinaciones que uno no ve casi siempre terminan en una jugada callada — propia o del rival.',
  },
  {
    id: 'cal_orden_del_arbol', area: 'calculo', peso: 5, tipo: 'opcion',
    enunciado: 'Al calcular una variante larga, ¿qué hace un jugador fuerte para no perderse?',
    opciones: [
      'Recorre una rama entera y vuelve a la posición inicial.',
      'Calcula todas las variantes a la vez para no olvidar ninguna.',
      'Mira la primera jugada de cada variante y elige por intuición.',
      'Avanza siempre hacia adelante y nunca vuelve atrás.',
    ],
    correcta: 0,
    explica: 'Saltar de rama en rama es lo que produce esas alucinaciones donde una pieza queda en dos lados. Una rama, evaluación, vuelta al inicio: es lento al principio y después es la única forma de calcular limpio.',
  },
];

/* ===== Cómo se arma cada prueba =====
 *
 * El banco tiene más ítems de los que se preguntan: cada diagnóstico sortea
 * los suyos. Así el alumno que lo repite a las cuatro semanas no se encuentra
 * con las mismas preguntas de memoria (mediríamos memoria, no ajedrez) y dos
 * alumnos sentados juntos tampoco resuelven exactamente lo mismo.
 *
 * Lo que NO cambia es la forma de la prueba: 7 ítems por área, con el mismo
 * reparto de dificultad (peso 1, 2 y 3) de siempre — 56 preguntas y 109
 * puntos. Por eso dos diagnósticos se pueden comparar entre sí aunque las
 * preguntas hayan sido otras: valen lo mismo y miden lo mismo.
 *
 *   DiagnosticoPrueba.armar()            → los 56 ítems de una prueba nueva
 *   DiagnosticoPrueba.armar(ids)         → los mismos, respetando ítems ya contestados
 *   DiagnosticoPrueba.porIds(ids)        → recupera una prueba guardada
 */
window.DiagnosticoPrueba = (function () {
  "use strict";

  /* Cuántos ítems de cada peso lleva cada área. Es igual en las ocho, y esa es
     la clave de la medición: como cada área aporta un ítem de peso 4 y uno de
     peso 5, la prueba entera tiene ocho preguntas de cada escalón difícil, que
     es lo que permite decir "hasta dónde llega" en vez de "cuántas acertó".
     Antes el techo era el peso 3 —contenido de club— y por eso un jugador de
     1400 y uno de 2300 sacaban los dos la misma nota. */
  const FORMA = { 1: 1, 2: 2, 3: 2, 4: 1, 5: 1 };
  const AREAS = ['reglas', 'material', 'apertura', 'tactica', 'mate', 'finales', 'estrategia', 'calculo'];
  const PESOS = [1, 2, 3, 4, 5];
  const BANCO = window.DIAGNOSTICO_ITEMS;
  const porId = {};
  BANCO.forEach((i) => { porId[i.id] = i; });

  const TOTAL = AREAS.length * PESOS.reduce((t, w) => t + FORMA[w], 0);
  const PUNTOS = AREAS.length * PESOS.reduce((t, w) => t + FORMA[w] * w, 0);

  /* Azar con semilla: la misma semilla arma siempre la misma prueba, que es lo
     que permite regenerar el cuadernillo imprimible igual una y otra vez. */
  function azar(semilla) {
    let x = (semilla >>> 0) || 1;
    return function () {
      x += 0x6D2B79F5;
      let t = x;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function barajar(lista, rnd) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = copia[i]; copia[i] = copia[j]; copia[j] = tmp;
    }
    return copia;
  }

  function porIds(ids) {
    return (ids || []).map((id) => porId[id]).filter(Boolean);
  }

  /* `fijos` son ítems que ya están contestados (una prueba a medias que se
     retoma, o que se armó con un banco anterior): se conservan tal cual, van
     primero y descuentan cuota, y el sorteo solo completa lo que falta. */
  function armar(fijos, semilla) {
    const rnd = azar(typeof semilla === "number" ? semilla : Math.floor(Math.random() * 2147483647));
    const yaEstan = porIds(fijos);
    const usados = {};
    yaEstan.forEach((i) => { usados[i.id] = true; });

    const elegidos = [];
    AREAS.forEach((area) => {
      const delArea = BANCO.filter((i) => i.area === area && !usados[i.id]);
      const falta = {};
      PESOS.forEach((w) => { falta[w] = FORMA[w]; });
      yaEstan.filter((i) => i.area === area).forEach((i) => {
        if (falta[i.peso] > 0) falta[i.peso] -= 1;
      });
      PESOS.forEach((peso) => {
        const candidatos = barajar(delArea.filter((i) => i.peso === peso && !usados[i.id]), rnd);
        while (falta[peso] > 0 && candidatos.length) {
          const item = candidatos.shift();
          usados[item.id] = true;
          elegidos.push(item);
          falta[peso] -= 1;
        }
      });
      // Si al área le faltan ítems de algún peso (banco corto), se completa con
      // los que haya, empezando por la dificultad más parecida.
      PESOS.forEach((peso) => {
        while (falta[peso] > 0) {
          const resto = delArea.filter((i) => !usados[i.id]).sort((a, b) => Math.abs(a.peso - peso) - Math.abs(b.peso - peso));
          if (!resto.length) break;
          usados[resto[0].id] = true;
          elegidos.push(resto[0]);
          falta[peso] -= 1;
        }
      });
    });

    // Orden de la prueba: área por área y, dentro de cada área, de menos a más
    // difícil — se entra en calor antes de las preguntas que cuestan.
    elegidos.sort((a, b) => (AREAS.indexOf(a.area) - AREAS.indexOf(b.area)) || (a.peso - b.peso));
    return yaEstan.concat(elegidos);
  }

  return { FORMA, AREAS, TOTAL, PUNTOS, armar, porIds };
})();
