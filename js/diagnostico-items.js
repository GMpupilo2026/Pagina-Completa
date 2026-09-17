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

  /* ================== Las 183 preguntas del banco de Oscar ==================
   *
   * Vienen del documento con las 225 preguntas del diagnóstico. De esas, 42 ya
   * estaban en este archivo preguntadas de otra forma —a veces al revés: «¿qué
   * piezas dan el mate de Boden?» contra «¿cómo se llama el mate de los dos
   * alfiles cruzados?»— y no se repiten: dos preguntas hermanas en la misma
   * prueba se regalan la respuesta entre ellas.
   *
   * QUÉ SE CAMBIÓ AL TRAERLAS, y por qué: en el documento la respuesta correcta
   * era la más larga en 193 de las 225 (86 %), con 28 caracteres de ventaja de
   * mediana, porque llevaba la explicación metida dentro de la opción. Quien no
   * supiera nada de ajedrez aprobaba marcando siempre la más larga. La
   * explicación se pasó a `explica`, que es donde vive, y las cuatro opciones
   * quedaron del mismo largo. Es exactamente la corrección que ya se le había
   * hecho al resto del banco (ver más arriba).
   *
   * El documento no traía los pesos, así que están puestos uno por uno según
   * cuánto exige la pregunta, en la escala de 1 a 5 que usa el resto del banco.
   */

  /* ---------------- Reglas y movimientos ---------------- */
  {
    id: 'reg_forma_l', area: 'reglas', peso: 1, tipo: 'opcion',
    enunciado: '¿Qué pieza se mueve siempre en forma de «L»?',
    opciones: [
      'El caballo',
      'El alfil',
      'La torre',
      'La dama',
    ],
    correcta: 0,
    explica: 'El caballo es la única que se mueve en «L» —dos casillas en una dirección y una perpendicular— y la única que salta por encima de las demás.',
  },
  {
    id: 'reg_h1_clara', area: 'reglas', peso: 1, tipo: 'opcion',
    enunciado: 'En la posición inicial, ¿de qué color es la casilla h1 y qué regla lo resume?',
    opciones: [
      'Clara: «casilla clara a la derecha»',
      'Oscura: «casilla oscura a la derecha»',
      'Clara: «la dama se viste de su color»',
      'Oscura: «el rey siempre en casilla clara»',
    ],
    correcta: 0,
    explica: '«Casilla clara a la derecha»: vista desde las blancas, la esquina de abajo a la derecha del tablero siempre es clara. Si sale oscura, el tablero está mal puesto.',
  },
  {
    id: 'reg_notacion_enroque', area: 'reglas', peso: 1, tipo: 'opcion',
    enunciado: '¿Cómo se anota en notación algebraica el enroque corto?',
    opciones: [
      'O-O',
      '0-0',
      'E.C.',
      'O-O-O',
    ],
    correcta: 0,
    explica: 'El enroque corto se anota O-O, con la letra O; el largo, O-O-O. Se escriben con letra, no con el número cero.',
  },
  {
    id: 'reg_al_paso_cuando', area: 'reglas', peso: 2, tipo: 'opcion',
    enunciado: 'Un peón blanco en e5 puede capturar «al paso» a un peón negro que…',
    opciones: [
      'Acaba de avanzar dos casillas, de d7 a d5',
      'Acaba de avanzar una casilla, de d6 a d5',
      'Lleva varias jugadas quieto, parado en d5',
      'Avanzó una sola casilla, de d7 hasta d6',
    ],
    correcta: 0,
    explica: 'La captura al paso solo es legal en la jugada inmediatamente siguiente al avance doble del peón rival. Si se deja pasar un turno, el derecho se pierde.',
  },
  {
    id: 'reg_ahogado_resultado', area: 'reglas', peso: 2, tipo: 'opcion',
    enunciado: 'Si el jugador en turno no tiene el rey en jaque, pero no le queda ninguna jugada legal, la partida es…',
    opciones: [
      'Tablas por ahogado',
      'Derrota inmediata',
      'Repetición de turno',
      'Jaque mate',
    ],
    correcta: 0,
    explica: 'Esa situación se llama ahogado (stalemate) y el resultado son tablas, no una derrota. Con ventaja aplastante hay que vigilarla: es la forma más común de dejar escapar una partida ganada.',
  },
  {
    id: 'reg_enroque_condicion_falsa', area: 'reglas', peso: 3, tipo: 'opcion',
    enunciado: '¿Cuál de estas condiciones NO hace falta para poder enrocar?',
    opciones: [
      'Que al rival le queden menos de cinco minutos',
      'Que el rey y esa torre no se hayan movido nunca',
      'Que no quede ninguna pieza entre el rey y la torre',
      'Que el rey no esté en jaque ni pase por uno',
    ],
    correcta: 0,
    explica: 'El reloj del rival no tiene nada que ver con la legalidad del enroque. Las tres condiciones reales son las otras: que ni el rey ni esa torre se hayan movido, que no haya piezas entre medio, y que el rey no esté en jaque ni pase ni termine en casilla atacada.',
  },
  {
    id: 'reg_enroque_largo_torre', area: 'reglas', peso: 2, tipo: 'opcion',
    enunciado: '¿Qué torre participa en el enroque largo?',
    opciones: [
      'La torre de la columna «a»',
      'La torre de la columna «h»',
      'Cualquiera de las dos torres',
      'Ninguna: solo se mueve el rey',
    ],
    correcta: 0,
    explica: 'El enroque largo (O-O-O) lleva el rey hacia el flanco de dama y usa la torre de la columna «a»; el corto (O-O) usa la de la columna «h». Se llama largo porque la torre recorre una casilla más.',
  },
  {
    id: 'reg_triple_repeticion', area: 'reglas', peso: 2, tipo: 'opcion',
    enunciado: 'Si la misma posición se repite tres veces, con el mismo jugador en turno y los mismos derechos (enroque, al paso), ¿qué puede reclamar un jugador?',
    opciones: [
      'Tablas por triple repetición',
      'Una jugada extra de regalo',
      'La victoria automática',
      'Nada: la partida sigue igual',
    ],
    correcta: 0,
    explica: 'La repetición no tiene que ser en jugadas seguidas, y da derecho a reclamar tablas sin importar quién esté mejor en el tablero. Ojo: se reclama, no se declara sola.',
  },
  {
    id: 'reg_50_jugadas', area: 'reglas', peso: 3, tipo: 'opcion',
    enunciado: '¿Qué dice la «regla de las 50 jugadas»?',
    opciones: [
      'Sin captura ni jugada de peón en 50, hay tablas',
      'Una partida no puede pasar de 50 jugadas en total',
      'Cada jugador tiene 50 segundos para cada jugada',
      'Después de la jugada 50 la dama pierde valor',
    ],
    correcta: 0,
    explica: 'Si pasan 50 jugadas seguidas de cada bando sin ninguna captura y sin mover ningún peón, cualquiera de los dos puede reclamar tablas. Existe para que una posición sin progreso no se estire para siempre.',
  },
  {
    id: 'reg_material_insuficiente', area: 'reglas', peso: 3, tipo: 'opcion',
    enunciado: '¿Cuál de estos finales es tablas automáticas por material insuficiente para dar mate?',
    opciones: [
      'Rey y alfil contra rey solo',
      'Rey y dos torres contra rey',
      'Rey y dama contra rey solo',
      'Rey y dos alfiles contra rey',
    ],
    correcta: 0,
    explica: 'Con rey y un alfil —o rey y un caballo— no existe ninguna red de mate posible contra el rey solo, así que la partida es tablas de inmediato. Con dos torres, con dama o con dos alfiles sí se da mate.',
  },
  {
    id: 'reg_pieza_tocada', area: 'reglas', peso: 2, tipo: 'opcion',
    enunciado: 'En una partida con la regla de «pieza tocada, pieza jugada», si tocas una pieza propia con intención de moverla…',
    opciones: [
      'Tienes que moverla si tiene alguna jugada legal',
      'Puedes cambiar de idea sin ninguna consecuencia',
      'Pierdes la partida en ese mismo momento',
      'Debes capturarla tú mismo con otra pieza',
    ],
    correcta: 0,
    explica: 'La regla de torneo obliga a mover la pieza que se tocó, siempre que tenga alguna jugada legal. Por eso, para acomodar una pieza torcida sin comprometerse, primero hay que avisar «compongo».',
  },
  {
    id: 'reg_compongo', area: 'reglas', peso: 2, tipo: 'opcion',
    enunciado: '¿Para qué sirve decir «compongo» (j\'adoube) antes de tocar una pieza?',
    opciones: [
      'Para acomodarla sin quedar obligado a moverla',
      'Para ofrecerle tablas al rival en ese momento',
      'Para anunciar que la jugada siguiente da mate',
      'Para pedir unos minutos más en el reloj',
    ],
    correcta: 0,
    explica: 'Avisa al rival de que vas a enderezar una pieza mal colocada en su casilla, y que eso no cuenta como haberla tocado para moverla. Hay que decirlo ANTES de tocarla, nunca después.',
  },
  {
    id: 'reg_cuantas_piezas', area: 'reglas', peso: 1, tipo: 'opcion',
    enunciado: '¿Cuántas piezas tiene cada jugador al empezar la partida, contando los peones?',
    opciones: [
      '16',
      '12',
      '20',
      '24',
    ],
    correcta: 0,
    explica: 'Cada bando empieza con 16: un rey, una dama, dos torres, dos alfiles, dos caballos y ocho peones. Entre los dos, 32 piezas en 64 casillas: justo la mitad del tablero ocupada.',
  },
  {
    id: 'reg_peon_captura', area: 'reglas', peso: 1, tipo: 'opcion',
    enunciado: '¿Cómo captura un peón a una pieza rival?',
    opciones: [
      'En diagonal, una casilla hacia adelante',
      'En línea recta, igual que cuando avanza',
      'Hacia atrás y en diagonal, una casilla',
      'No captura: el peón solamente avanza',
    ],
    correcta: 0,
    explica: 'El peón avanza recto pero captura en diagonal, y esa diferencia explica media estrategia de peones: una pieza justo enfrente lo bloquea sin estar en peligro, y en cambio no está a salvo en las dos diagonales.',
  },
  {
    id: 'reg_peon_primer_salto', area: 'reglas', peso: 1, tipo: 'opcion',
    enunciado: 'Un peón que todavía no se ha movido, ¿cuántas casillas puede avanzar en su primera jugada?',
    opciones: [
      'Una o dos, a elección',
      'Solo una, nunca dos',
      'Siempre dos casillas',
      'Hasta tres casillas',
    ],
    correcta: 0,
    explica: 'Solo en su primer movimiento el peón puede elegir entre una casilla y dos; de ahí en adelante avanza de una en una. Y ese avance doble es justamente el que habilita la captura al paso del rival.',
  },
  {
    id: 'reg_caida_bandera', area: 'reglas', peso: 4, tipo: 'opcion',
    enunciado: 'Si a un jugador se le acaba el tiempo en el reloj, ¿qué pasa normalmente?',
    opciones: [
      'Pierde, salvo que el rival no pueda dar mate nunca',
      'Son tablas siempre, sin ninguna excepción',
      'El reloj se reinicia y la partida continúa igual',
      'Gana de inmediato quien se quedó sin tiempo',
    ],
    correcta: 0,
    explica: 'Quedarse sin tiempo pierde la partida, con una excepción: si al rival no le queda material con el que dar mate en ninguna secuencia posible —por ejemplo, si solo le queda el rey—, el resultado son tablas.',
  },
  {
    id: 'reg_jaque_perpetuo', area: 'reglas', peso: 3, tipo: 'opcion',
    enunciado: '¿Qué es el «jaque perpetuo» como recurso defensivo?',
    opciones: [
      'Jaques seguidos que el rival no puede evitar',
      'Un jaque que gana la partida en el acto mismo',
      'Un mate especial que solo se da con la dama',
      'Un tipo de enroque que se hace estando en jaque',
    ],
    correcta: 0,
    explica: 'Cuando un bando está perdido, a veces puede salvarse dando jaques sin parar: si el rey rival no tiene forma de escapar de esa cadena, la posición se repite y la partida termina en tablas.',
  },
  {
    id: 'reg_columnas_filas', area: 'reglas', peso: 1, tipo: 'opcion',
    enunciado: 'En la notación algebraica, ¿cómo se nombran las columnas y las filas del tablero?',
    opciones: [
      'Columnas con letras y filas con números',
      'Columnas con números y filas con letras',
      'Las dos con números, del 1 hasta el 8',
      'Las dos con letras, de la «a» a la «h»',
    ],
    correcta: 0,
    explica: 'Cada casilla se nombra por su columna (letra, de la «a» a la «h») y su fila (número, del 1 al 8): e4 es la columna «e», fila 4. Siempre en ese orden, primero la letra.',
  },
  {
    id: 'reg_dama_su_color', area: 'reglas', peso: 2, tipo: 'opcion',
    enunciado: 'Regla mnemotécnica clásica sobre dónde empieza cada dama: «la dama se coloca…»',
    opciones: [
      '…en su color: la blanca en clara, la negra en oscura',
      '…siempre en una casilla oscura, sea del color que sea',
      '…siempre en la columna «e», justo al lado del rey',
      '…enfrente de la dama rival, siempre en diagonal',
    ],
    correcta: 0,
    explica: '«La dama se viste de su color»: la blanca empieza en d1, que es casilla clara, y la negra en d8, que es oscura. Es la forma más rápida de comprobar que el tablero y las piezas están bien puestos.',
  },
  {
    id: 'reg_notacion_captura', area: 'reglas', peso: 1, tipo: 'opcion',
    enunciado: 'En notación algebraica, ¿qué indica la letra «x» dentro de una jugada, por ejemplo «Axf6»?',
    opciones: [
      'Que esa jugada es una captura',
      'Que el peón corona en dama',
      'Que la jugada da jaque',
      'Que se trata de un enroque corto',
    ],
    correcta: 0,
    explica: 'La «x» marca siempre una captura: «Axf6» quiere decir que el alfil capturó una pieza rival en f6. El jaque se anota con «+» y la coronación con «=», que son otros signos.',
  },
  {
    id: 'reg_varias_damas', area: 'reglas', peso: 3, tipo: 'opcion',
    enunciado: '¿Puede un jugador llegar a tener más de una dama al mismo tiempo en el tablero?',
    opciones: [
      'Sí: coronando un peón mientras conserva la suya',
      'No: cada bando tiene una sola dama en la partida',
      'Solo si la dama original ya fue capturada antes',
      'Solo en partidas de ajedrez rápido y relámpago',
    ],
    correcta: 0,
    explica: 'Coronar no reemplaza a la dama original: si todavía la tienes en el tablero y coronas otro peón, terminas con dos damas, y coronando más, con tres o cuatro. No hay ningún tope en el reglamento.',
  },
  {
    id: 'reg_tablas_acuerdo', area: 'reglas', peso: 2, tipo: 'opcion',
    enunciado: '¿Cómo se pueden acordar tablas entre los dos jugadores, sin que se dé ninguna de las otras reglas de tablas?',
    opciones: [
      'Uno las ofrece y el otro las acepta',
      'Solo el árbitro puede decretarlas',
      'No existen: solo hay tablas por regla',
      'Los dos se quedan sin tiempo a la vez',
    ],
    correcta: 0,
    explica: 'En cualquier momento un jugador puede ofrecer tablas —lo correcto es hacerlo después de mover y antes de apretar el reloj— y, si el rival acepta, la partida termina ahí por acuerdo mutuo.',
  },
  {
    id: 'reg_alfil_diagonal', area: 'reglas', peso: 1, tipo: 'opcion',
    enunciado: 'Un alfil se mueve siempre…',
    opciones: [
      'En diagonal, tantas casillas como estén libres',
      'En línea recta, igual que se mueve la torre',
      'Formando una «L», como hace el caballo',
      'Una sola casilla por turno, en cualquier lado',
    ],
    correcta: 0,
    explica: 'Va en diagonal todo lo que quiera mientras el camino esté libre, y por eso nunca cambia de color de casilla: el alfil que empieza en casilla clara se queda en las claras toda la partida.',
  },

  /* ---------------- Valor del material ---------------- */
  {
    id: 'mat_valor_peon', area: 'material', peso: 1, tipo: 'opcion',
    enunciado: '¿Cuál es el valor aproximado de un peón?',
    opciones: [
      '1',
      '3',
      '5',
      '9',
    ],
    correcta: 0,
    explica: 'El peón es la unidad con la que se mide todo lo demás: vale 1 punto.',
  },
  {
    id: 'mat_valor_caballo', area: 'material', peso: 1, tipo: 'opcion',
    enunciado: '¿Cuál es el valor aproximado de un caballo?',
    opciones: [
      '1',
      '3',
      '5',
      '9',
    ],
    correcta: 1,
    explica: 'Caballo y alfil valen unos 3 peones cada uno. Son las llamadas piezas menores.',
  },
  {
    id: 'mat_valor_torre', area: 'material', peso: 1, tipo: 'opcion',
    enunciado: '¿Cuál es el valor aproximado de una torre?',
    opciones: [
      '1',
      '3',
      '5',
      '9',
    ],
    correcta: 2,
    explica: 'La torre vale unos 5 peones: dos peones más que una pieza menor, y esa diferencia es lo que se llama «la calidad».',
  },
  {
    id: 'mat_valor_alfil', area: 'material', peso: 1, tipo: 'opcion',
    enunciado: '¿Cuál es el valor aproximado de un alfil?',
    opciones: [
      '1',
      '3',
      '5',
      '9',
    ],
    correcta: 1,
    explica: 'El alfil vale unos 3 peones, igual que el caballo, aunque su fuerza real depende mucho de si la posición está abierta o cerrada.',
  },
  {
    id: 'mat_calidad_cambio', area: 'material', peso: 2, tipo: 'opcion',
    enunciado: 'Si cambias tu torre (5 puntos) por el alfil (3 puntos) del rival, ¿qué acabas de hacer?',
    opciones: [
      'Un mal cambio: perdiste la calidad',
      'Un buen cambio, que te deja mejor',
      'Un cambio exactamente igualado',
      'Una jugada que gana la partida ya',
    ],
    correcta: 0,
    explica: 'Cambiar una torre por una pieza menor se llama «perder la calidad»: cediste unos 2 puntos de material. A veces compensa —si a cambio consigues una posición mucho mejor—, pero por sí solo es una pérdida.',
  },
  {
    id: 'mat_valor_rey', area: 'material', peso: 2, tipo: 'opcion',
    enunciado: '¿Qué valor en puntos se le asigna al rey en las tablas de valores de material?',
    opciones: [
      'Ninguno: no se puede capturar ni cambiar',
      'El mismo que la dama, que son 9 puntos',
      'El mismo que la torre, que son 5 puntos',
      'Cero puntos, porque no sirve para atacar',
    ],
    correcta: 0,
    explica: 'Al rey no se le da valor de cambio porque nunca puede capturarse ni entregarse: la partida termina antes. Eso no quiere decir que sea débil — en los finales es una pieza atacante de primera.',
  },
  {
    id: 'mat_piezas_menores', area: 'material', peso: 1, tipo: 'opcion',
    enunciado: '¿Cómo se llama, en conjunto, a los alfiles y los caballos?',
    opciones: [
      'Piezas menores',
      'Piezas mayores',
      'Piezas pesadas',
      'Piezas centrales',
    ],
    correcta: 0,
    explica: 'Se agrupan como piezas menores por su valor parecido, unos 3 puntos. Torres y dama son las piezas mayores o pesadas.',
  },
  {
    id: 'mat_piezas_mayores', area: 'material', peso: 1, tipo: 'opcion',
    enunciado: '¿Cómo se llama, en conjunto, a las torres y la dama?',
    opciones: [
      'Piezas mayores, o pesadas',
      'Piezas menores del tablero',
      'Piezas centrales del tablero',
      'Piezas pasivas de la partida',
    ],
    correcta: 0,
    explica: 'Torres y dama son las piezas mayores —también llamadas pesadas—: tienen más valor y mucho más alcance que alfiles y caballos.',
  },
  {
    id: 'mat_sacrificio', area: 'material', peso: 2, tipo: 'opcion',
    enunciado: '¿Qué es un «sacrificio» en ajedrez?',
    opciones: [
      'Entregar material a cambio de otra ventaja',
      'Perder una pieza por un descuido al calcular',
      'Cambiar dos piezas que valen exactamente igual',
      'Abandonar la partida antes de que termine',
    ],
    correcta: 0,
    explica: 'Lo que define al sacrificio es que es deliberado: se entrega material porque lo que se recibe a cambio —un ataque, la iniciativa, un mate forzado— vale más que los puntos cedidos. Perder una pieza por descuido no es sacrificar.',
  },
  {
    id: 'mat_calidad_definicion', area: 'material', peso: 3, tipo: 'opcion',
    enunciado: 'En ajedrez, ¿a qué se le llama exactamente «la calidad»?',
    opciones: [
      'A la diferencia entre torre y pieza menor',
      'Al valor de todas las piezas que quedan',
      'A lo bien que juega alguien, sin el material',
      'Al número de peones que le queda a cada uno',
    ],
    correcta: 0,
    explica: '«La calidad» es concretamente la diferencia de valor entre una torre (5) y una pieza menor (3). Ganar la calidad es cambiar tu pieza menor por una torre rival; perderla es lo contrario.',
  },
  {
    id: 'mat_peon_de_mas', area: 'material', peso: 2, tipo: 'opcion',
    enunciado: 'En un final con el resto del material igualado, ¿qué suele significar tener un peón de más?',
    opciones: [
      'Una ventaja real, pero hay que saber jugarla',
      'Nada: un peón suelto no cambia el resultado',
      'La derrota segura del que tiene menos peones',
      'Que la partida se declara tablas de inmediato',
    ],
    correcta: 0,
    explica: 'Un peón de más es una ventaja genuina, sobre todo en finales, pero no gana sola: convertirla en punto entero exige técnica. Por eso los finales se estudian.',
  },
  {
    id: 'mat_ganando_cambiar', area: 'material', peso: 3, tipo: 'opcion',
    enunciado: 'Si vas ganando en material, ¿qué principio práctico suele convenir?',
    opciones: [
      'Cambiar piezas para simplificar hacia el final',
      'Evitar todo cambio de piezas a cualquier precio',
      'Cambiar cuanto antes todos los peones que haya',
      'Entregar la ventaja para complicar la posición',
    ],
    correcta: 0,
    explica: 'Con material de más conviene cambiar piezas y conservar peones: menos piezas rivales significan menos contrajuego, y los peones son los que coronan. La regla corta es «cambia piezas, no peones».',
  },
  {
    id: 'mat_perdiendo_complicar', area: 'material', peso: 3, tipo: 'opcion',
    enunciado: 'Si vas perdiendo en material, ¿qué principio práctico suele convenir?',
    opciones: [
      'Evitar los cambios y buscar complicaciones',
      'Cambiar cuanto antes todas las piezas que haya',
      'Abandonar apenas se pierde el primer peón',
      'Ofrecer tablas en todas y cada una de las jugadas',
    ],
    correcta: 0,
    explica: 'Con material de menos, simplificar es entregarse: cuantas más piezas queden, más posibilidades hay de que el rival se equivoque. Es el reverso exacto del principio anterior.',
  },
  {
    id: 'mat_caballo_cerrada', area: 'material', peso: 3, tipo: 'opcion',
    enunciado: '¿En qué tipo de posición suelen rendir mejor los caballos que los alfiles?',
    opciones: [
      'En posiciones cerradas, con los peones trabados',
      'En posiciones abiertas, sin ningún peón en medio',
      'En ninguna: el caballo nunca supera al alfil',
      'Solo en el momento justo de enrocar',
    ],
    correcta: 0,
    explica: 'El caballo salta por encima de los peones, así que una posición trabada no lo estorba. El alfil necesita diagonales despejadas: encerrado detrás de sus propios peones vale mucho menos de lo que dice la tabla.',
  },
  {
    id: 'mat_tres_menores', area: 'material', peso: 4, tipo: 'opcion',
    enunciado: 'En valor aproximado, ¿a qué suelen equivaler tres piezas menores?',
    opciones: [
      'A una dama, más o menos: 3+3+3 son 9',
      'A bastante menos que media dama',
      'A todavía menos que una sola torre',
      'Al doble exacto de lo que vale la dama',
    ],
    correcta: 0,
    explica: 'Tres menores suman unos 9 puntos, el valor de una dama. En la práctica suelen ser mejores que la dama si tienen casillas donde apoyarse: tres piezas coordinadas atacan más cosas a la vez que una sola.',
  },
  {
    id: 'mat_torre_y_peon', area: 'material', peso: 4, tipo: 'opcion',
    enunciado: 'En puntos, ¿a qué equivale aproximadamente una torre junto con un peón?',
    opciones: [
      'A dos piezas menores: 5+1 contra 3+3',
      'A una dama entera, con sus 9 puntos',
      'A un solo caballo, ni más ni menos',
      'A nada: el peón no suma al lado de una torre',
    ],
    correcta: 0,
    explica: 'Torre más peón son 6 puntos, y dos piezas menores también. Es un desequilibrio clásico y ninguno de los dos lados está objetivamente mejor: depende de si la posición es abierta (mejor la torre) o cerrada (mejores las menores).',
  },
  {
    id: 'mat_un_peon_decide', area: 'material', peso: 4, tipo: 'opcion',
    enunciado: 'Entre jugadores de nivel parecido, ¿qué ventaja de material suele bastar para ganar con buena técnica?',
    opciones: [
      'Un solo peón, bien jugado, ya puede decidir',
      'Hace falta ganar una torre entera, como mínimo',
      'El material nunca decide: solo el ataque directo',
      'Hace falta capturar la dama del rival',
    ],
    correcta: 0,
    explica: 'Entre jugadores fuertes, un peón de ventaja bien manejado suele alcanzar. Por eso en el ajedrez de alto nivel se pelea cada peón como si fuera una pieza.',
  },
  {
    id: 'mat_pieza_atrapada', area: 'material', peso: 2, tipo: 'opcion',
    enunciado: '¿Qué significa que una pieza esté «atrapada»?',
    opciones: [
      'Que no tiene casilla segura y va a caer',
      'Que está clavada contra su propio rey',
      'Que acaba de coronar en la última fila',
      'Que se quedó encerrada por el enroque',
    ],
    correcta: 0,
    explica: 'Una pieza atrapada todavía se puede mover, pero todas sus casillas de salida están controladas: se pierde igual. Cazar una pieza atrapada es una de las formas más limpias de ganar material.',
  },
  {
    id: 'mat_pieza_colgada', area: 'material', peso: 2, tipo: 'opcion',
    enunciado: '¿A qué se le llama que una pieza esté «colgada»?',
    opciones: [
      'A que está sin defensa y se puede tomar',
      'A que está a punto de coronar en dama',
      'A que se quedó sola en la última fila',
      'A que acaba de enrocar junto a su rey',
    ],
    correcta: 0,
    explica: 'Una pieza colgada está desprotegida: si el rival la toma, no hay recaptura y el material se pierde gratis. Revisar las piezas colgadas —las propias y las del rival— antes de cada jugada evita la mitad de las derrotas.',
  },
  {
    id: 'mat_contar_material', area: 'material', peso: 1, tipo: 'opcion',
    enunciado: 'Para saber rápido quién va ganando en material durante una partida, ¿qué conviene hacer?',
    opciones: [
      'Sumar los valores de cada bando y comparar',
      'Contar las piezas, sin mirar de cuáles son',
      'Dejar los peones fuera de la cuenta',
      'Mirar solo el tiempo que queda en el reloj',
    ],
    correcta: 0,
    explica: 'Sumar los valores aproximados de cada bando —peón 1, menor 3, torre 5, dama 9— y comparar los dos totales da una idea rápida y confiable de quién está mejor.',
  },
  {
    id: 'mat_caballo_vs_peon', area: 'material', peso: 1, tipo: 'opcion',
    enunciado: 'En la inmensa mayoría de posiciones, ¿qué vale más: un caballo o un peón?',
    opciones: [
      'El caballo, con claridad: 3 contra 1',
      'El peón, siempre y en toda posición',
      'Los dos valen exactamente lo mismo',
      'Depende solo del color de las piezas',
    ],
    correcta: 0,
    explica: 'El caballo vale unos 3 puntos y el peón 1. Por eso entregar un caballo para ganar «solo» un peón casi nunca compensa, salvo que a cambio se consiga algo grande.',
  },
  {
    id: 'mat_alcance_mayores', area: 'material', peso: 3, tipo: 'opcion',
    enunciado: '¿Por qué torres y dama se consideran especialmente peligrosas al atacar al rey rival?',
    opciones: [
      'Por su alcance: atacan desde lejos',
      'Porque solo ellas pueden dar jaque mate',
      'Porque valen menos que las piezas menores',
      'Porque no se las puede capturar nunca',
    ],
    correcta: 0,
    explica: 'Las piezas mayores atacan filas y columnas enteras —y la dama además las diagonales—, así que amenazan al rey desde el otro lado del tablero, sin tener que acercarse casilla a casilla como el caballo.',
  },

  /* ---------------- Principios de apertura ---------------- */
  {
    id: 'ap_principios', area: 'apertura', peso: 1, tipo: 'opcion',
    enunciado: 'En la apertura, ¿cuál de estos es un principio básico recomendado?',
    opciones: [
      'Controlar el centro y desarrollar las menores',
      'Sacar la dama lo antes posible al tablero',
      'Mover primero los peones de las dos torres',
      'Enrocar en la primera jugada, sin excepción',
    ],
    correcta: 0,
    explica: 'Los tres principios clásicos son: controlar el centro, desarrollar rápido las piezas menores y poner el rey a salvo con el enroque. Casi todo lo demás de la apertura sale de ahí.',
  },
  {
    id: 'ap_gambito_dama', area: 'apertura', peso: 1, tipo: 'opcion',
    enunciado: '1.d4 d5 2.c4 es el…',
    opciones: [
      'Gambito de Dama',
      'Gambito de Rey',
      'Ataque Colle',
      'Sistema Londres',
    ],
    correcta: 0,
    explica: 'Las blancas ofrecen el peón de c4 para desviar el peón de d5 y quedarse con el centro. Se llama gambito aunque el peón casi siempre se recupera.',
  },
  {
    id: 'ap_francesa', area: 'apertura', peso: 1, tipo: 'opcion',
    enunciado: '1.e4 e6 corresponde a la Defensa…',
    opciones: [
      'Francesa',
      'Siciliana',
      'Escandinava',
      'Alekhine',
    ],
    correcta: 0,
    explica: 'Prepara …d5 con una estructura sólida y contrajuego típico en el flanco de dama. Su punto flojo conocido es el alfil de casillas claras, que queda encerrado detrás de los peones.',
  },
  {
    id: 'ap_italiana', area: 'apertura', peso: 2, tipo: 'opcion',
    enunciado: '1.e4 e5 2.Cf3 Cc6 3.Ac4 corresponde a la apertura…',
    opciones: [
      'Italiana (Giuoco Piano)',
      'Española (la Ruy López)',
      'Escocesa abierta',
      'Siciliana cerrada',
    ],
    correcta: 0,
    explica: 'Cuando el alfil va a c4 en vez de b5, es la Italiana: el alfil apunta directo a f7, que es la casilla más débil del bando negro al empezar la partida.',
  },
  {
    id: 'ap_escocesa', area: 'apertura', peso: 2, tipo: 'opcion',
    enunciado: '1.e4 e5 2.Cf3 Cc6 3.d4 corresponde a la apertura…',
    opciones: [
      'Escocesa',
      'Italiana',
      'Española',
      'Francesa',
    ],
    correcta: 0,
    explica: 'Abrir el centro con d4 en la tercera jugada es la seña de la Escocesa: cambia el centro enseguida y lleva a posiciones abiertas, con menos teoría que la Española.',
  },
  {
    id: 'ap_caro_kann', area: 'apertura', peso: 2, tipo: 'opcion',
    enunciado: '1.e4 c6 corresponde a la Defensa…',
    opciones: [
      'Caro-Kann',
      'Siciliana',
      'Francesa',
      'Pirc',
    ],
    correcta: 0,
    explica: 'Prepara …d5 igual que la Francesa, pero sin encerrar el alfil de casillas claras: por eso tiene fama de sólida. Ese alfil suele salir a f5 antes de cerrar la cadena de peones.',
  },
  {
    id: 'ap_pirc', area: 'apertura', peso: 3, tipo: 'opcion',
    enunciado: '1.e4 d6, seguido normalmente de …Cf6, …g6 y …Ag7, corresponde a la Defensa…',
    opciones: [
      'Pirc',
      'Caro-Kann',
      'Escandinava',
      'Nimzoindia',
    ],
    correcta: 0,
    explica: 'Es una defensa hipermoderna: deja que las blancas ocupen el centro con peones y lo contraataca después con las piezas, apoyándose en el alfil fianchettado en g7.',
  },
  {
    id: 'ap_escandinava', area: 'apertura', peso: 2, tipo: 'opcion',
    enunciado: '1.e4 d5 corresponde a la Defensa…',
    opciones: [
      'Escandinava',
      'Francesa',
      'Caro-Kann',
      'Alekhine',
    ],
    correcta: 0,
    explica: 'Las negras cambian el peón central de inmediato y suelen recapturar con la dama. El precio es que esa dama queda expuesta a Cc3, que gana un tiempo.',
  },
  {
    id: 'ap_alekhine', area: 'apertura', peso: 3, tipo: 'opcion',
    enunciado: '1.e4 Cf6 corresponde a la Defensa…',
    opciones: [
      'Alekhine',
      'Escandinava',
      'Pirc',
      'India de Rey',
    ],
    correcta: 0,
    explica: 'El caballo se ofrece de blanco a propósito: provoca que los peones blancos avancen y después ataca esa cadena adelantada. Es la defensa hipermoderna más provocadora.',
  },
  {
    id: 'ap_reti', area: 'apertura', peso: 4, tipo: 'opcion',
    enunciado: '1.Cf3, sin definir todavía el destino de los peones centrales, suele llamarse Apertura…',
    opciones: [
      'Réti',
      'Inglesa',
      'Española',
      'Escocesa',
    ],
    correcta: 0,
    explica: 'Deja para más adelante qué van a hacer los peones centrales y a menudo fianchetta un alfil. Es de las que más transponen: puede terminar en una Inglesa, en un Gambito de Dama o en un sistema propio.',
  },
  {
    id: 'ap_inglesa', area: 'apertura', peso: 2, tipo: 'opcion',
    enunciado: '1.c4 corresponde a la Apertura…',
    opciones: [
      'Inglesa',
      'Holandesa',
      'India de Rey',
      'Nimzoindia',
    ],
    correcta: 0,
    explica: 'Ataca el centro desde el flanco de dama sin ocuparlo con un peón central. Es la tercera primera jugada más jugada, detrás de 1.e4 y 1.d4.',
  },
  {
    id: 'ap_india_rey', area: 'apertura', peso: 3, tipo: 'opcion',
    enunciado: '1.d4 Cf6 2.c4 g6, con la idea de seguir …Ag7, corresponde a la Defensa…',
    opciones: [
      'India de Rey',
      'Nimzoindia',
      'Holandesa',
      'Escandinava',
    ],
    correcta: 0,
    explica: 'Deja que las blancas ocupen el centro y lo contraataca después con …e5 o …c5, con el alfil de g7 apuntando a la diagonal larga. Es una defensa de contraataque, no de igualar rápido.',
  },
  {
    id: 'ap_nimzoindia', area: 'apertura', peso: 4, tipo: 'opcion',
    enunciado: '1.d4 Cf6 2.c4 e6 3.Cc3 Ab4 corresponde a la Defensa…',
    opciones: [
      'Nimzoindia',
      'India de Rey',
      'Holandesa',
      'Gambito de Dama',
    ],
    correcta: 0,
    explica: 'Clavar el caballo de c3 con el alfil en b4, en vez de jugar …d5, es su seña de identidad. La idea es cambiar ese alfil por el caballo y dejarle a las blancas los peones doblados.',
  },
  {
    id: 'ap_holandesa', area: 'apertura', peso: 3, tipo: 'opcion',
    enunciado: '1.d4 f5 corresponde a la Defensa…',
    opciones: [
      'Holandesa',
      'India de Rey',
      'Nimzoindia',
      'Benoni',
    ],
    correcta: 0,
    explica: 'Las negras pelean por e4 desde el flanco de rey. El costo está a la vista: el peón de f ya no cubre al rey, así que es una defensa de doble filo.',
  },
  {
    id: 'ap_sistema_londres', area: 'apertura', peso: 3, tipo: 'opcion',
    enunciado: 'El «Sistema Londres» se caracteriza porque las blancas…',
    opciones: [
      'Arman siempre la misma estructura, juegue lo que juegue el rival',
      'Solo lo pueden jugar contra la Defensa Siciliana, y no contra otra',
      'Tienen que memorizar decenas de variantes forzadas de memoria',
      'Entregan un peón en la primera jugada para abrir líneas',
    ],
    correcta: 0,
    explica: 'Es un «sistema» y no una apertura teórica: el peón a d4, el alfil a f4 y el resto casi siempre en las mismas casillas. Por eso es tan popular entre quienes no quieren estudiar teoría, aunque a cambio pide menos ventaja.',
  },
  {
    id: 'ap_fianchetto', area: 'apertura', peso: 2, tipo: 'opcion',
    enunciado: '¿Qué es un «fianchetto»?',
    opciones: [
      'Poner el alfil en la diagonal larga, tras su peón',
      'Un tipo especial de enroque que se hace con el alfil',
      'Entregar un peón a cambio de tomar la iniciativa',
      'Otro nombre que se le da a la clavada de una pieza',
    ],
    correcta: 0,
    explica: 'Se avanza el peón de b o de g una casilla y el alfil se pone detrás, en b2/g2 o en b7/g7, mirando toda la diagonal larga. Es la jugada típica de las defensas hipermodernas.',
  },
  {
    id: 'ap_gambito_rey', area: 'apertura', peso: 2, tipo: 'opcion',
    enunciado: '1.e4 e5 2.f4 es el…',
    opciones: [
      'Gambito de Rey',
      'Gambito de Dama',
      'Ataque Colle',
      'Sistema Londres',
    ],
    correcta: 0,
    explica: 'Las blancas ofrecen el peón de f para abrir esa columna y atacar rápido. Fue la apertura de moda del siglo XIX y hoy casi no se ve en alto nivel: debilita demasiado al propio rey.',
  },
  {
    id: 'ap_enrocar_antes', area: 'apertura', peso: 2, tipo: 'opcion',
    enunciado: '¿Por qué suele convenir enrocar antes de abrir demasiado el centro?',
    opciones: [
      'Para sacar al rey antes de que se abran líneas',
      'Porque el enroque suma puntos de material',
      'Porque el reglamento lo exige antes de la jugada 10',
      'Porque así el rival no puede desarrollar sus piezas',
    ],
    correcta: 0,
    explica: 'Un centro abierto son columnas y diagonales por las que llegan las piezas rivales, y el rey en el centro está justo en medio de todas. Enrocar primero lo pone fuera de esa zona.',
  },
  {
    id: 'ap_dos_veces_misma', area: 'apertura', peso: 2, tipo: 'opcion',
    enunciado: 'En la apertura, ¿por qué se recomienda no mover dos veces la misma pieza sin una buena razón?',
    opciones: [
      'Porque cada jugada repetida es un tiempo regalado',
      'Porque las reglas del ajedrez no lo permiten',
      'Porque esa pieza queda inmóvil el resto de la partida',
      'Porque al hacerlo se pierde el derecho al enroque',
    ],
    correcta: 0,
    explica: 'Cada jugada de apertura que no saca una pieza nueva es un «tiempo» que el rival usa para adelantarse en desarrollo. Con dos o tres tiempos de ventaja ya se puede empezar un ataque.',
  },
  {
    id: 'ap_ideas_vs_memoria', area: 'apertura', peso: 3, tipo: 'opcion',
    enunciado: 'Para un jugador principiante o intermedio, ¿qué suele ser más útil que memorizar largas variantes de apertura?',
    opciones: [
      'Entender las ideas y los planes de su apertura',
      'Memorizar veinte jugadas exactas sin entenderlas',
      'Cambiar de apertura en cada partida que juega',
      'No estudiar aperturas en absoluto, nunca',
    ],
    correcta: 0,
    explica: 'Entender qué casillas hay que controlar y qué plan sigue la apertura sirve también cuando el rival se sale de la teoría — que en estos niveles pasa en la jugada 4. La memoria pura se cae ahí mismo.',
  },
  {
    id: 'ap_transposicion', area: 'apertura', peso: 4, tipo: 'opcion',
    enunciado: '¿Qué es una «transposición» de aperturas?',
    opciones: [
      'Llegar a la misma posición por otro orden de jugadas',
      'Cambiarse de bando cuando la partida va por la mitad',
      'Repetir tres veces seguidas la misma jugada exacta',
      'Un tipo de gambito que casi nadie juega hoy',
    ],
    correcta: 0,
    explica: 'Dos partidas que empezaron distinto pueden terminar en la misma posición. Por eso el orden de jugadas importa: se usa para entrar a una apertura evitando la variante que el rival prefiere.',
  },

  /* ---------------- Táctica ---------------- */
  {
    id: 'tac_horquilla_nombre', area: 'tactica', peso: 1, tipo: 'opcion',
    enunciado: '¿Cómo se llama la táctica en la que una pieza ataca a dos piezas rivales a la vez?',
    opciones: [
      'Horquilla (o tenedor)',
      'Clavada de una pieza',
      'Rayos X sobre la fila',
      'Enroque por el centro',
    ],
    correcta: 0,
    explica: 'Es un ataque doble hecho por una sola pieza. El caballo es el rey de la horquilla porque ataca casillas que ninguna otra pieza defiende de la misma forma.',
  },
  {
    id: 'tac_clavada_nombre', area: 'tactica', peso: 1, tipo: 'opcion',
    enunciado: '¿Cómo se llama la táctica en la que una pieza no puede moverse porque detrás de ella, en la misma línea, está su rey u otra pieza más valiosa?',
    opciones: [
      'Clavada',
      'Horquilla',
      'Descubierta',
      'Ahogado',
    ],
    correcta: 0,
    explica: 'La pieza clavada queda inmovilizada —o castigada si se mueve— porque al apartarse deja expuesto lo que tenía detrás. Solo clavan las piezas de línea: alfil, torre y dama.',
  },
  {
    id: 'tac_descubierto_que_es', area: 'tactica', peso: 2, tipo: 'opcion',
    enunciado: 'En un «ataque descubierto», ¿qué ocurre?',
    opciones: [
      'Una pieza se aparta y descubre el ataque de otra',
      'Dos piezas propias se mueven en la misma jugada',
      'El rey queda expuesto y pierde el enroque',
      'Aparece un peón pasado que estaba escondido',
    ],
    correcta: 0,
    explica: 'La pieza que se mueve abre la línea de otra que estaba detrás, y esa segunda ataca sin haberse movido. Es doblemente peligroso porque la pieza que se aparta puede ir a hacer daño por su cuenta.',
  },
  {
    id: 'tac_horquilla_familiar', area: 'tactica', peso: 2, tipo: 'opcion_tablero',
    enunciado: 'Juegan las blancas. ¿Cuál de estas jugadas del caballo gana material con una horquilla?',
    fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1',
    opciones: [
      'Cc7+',
      'Cd6+',
      'Ca7',
      'Cc3',
    ],
    correcta: 0,
    explica: 'Cc7+ da jaque al rey de e8 y ataca la torre de a8 al mismo tiempo: la clásica «horquilla familiar». Las negras tienen que atender el jaque y las blancas se llevan la torre. Cd6+ también da jaque, pero no amenaza nada; Ca7 y Cc3 ni siquiera dan jaque.',
    prueba: 'Cc7 es legal, da jaque y desde c7 el caballo ataca a8',
  },
  {
    id: 'tac_pasillo_tablero', area: 'tactica', peso: 2, tipo: 'opcion_tablero',
    enunciado: 'Juegan las blancas. ¿Cuál de estas jugadas de la torre da jaque mate?',
    fen: '6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1',
    opciones: [
      'Te8#',
      'Te7',
      'Td1',
      'Rg2',
    ],
    correcta: 0,
    explica: 'Te8 es mate del pasillo: el rey negro está encerrado por sus propios peones de f7, g7 y h7, y nadie puede capturar la torre ni meterse en la fila 8. Es la razón por la que conviene hacerle un respiradero al rey.',
    prueba: 'Te8 es legal y es jaque mate',
  },
  {
    id: 'tac_ataque_doble', area: 'tactica', peso: 2, tipo: 'opcion',
    enunciado: '¿Cómo se le llama, en general, a cualquier jugada que amenaza dos objetivos rivales al mismo tiempo?',
    opciones: [
      'Ataque doble',
      'Enroque doble',
      'Jaque perpetuo',
      'Zugzwang mutuo',
    ],
    correcta: 0,
    explica: 'La horquilla es el caso más conocido, pero el término general abarca cualquier jugada que cree dos amenazas a la vez, sea con una sola pieza o mediante una descubierta. El rival solo puede parar una.',
  },
  {
    id: 'tac_clavada_absoluta', area: 'tactica', peso: 2, tipo: 'opcion',
    enunciado: '¿Cómo se llama la clavada en la que la pieza clavada NO se puede mover de ninguna manera, porque detrás está el propio rey?',
    opciones: [
      'Clavada absoluta',
      'Clavada relativa',
      'Horquilla de rey',
      'Rayos X directo',
    ],
    correcta: 0,
    explica: 'Mover esa pieza dejaría al rey en jaque, y eso es ilegal: la pieza queda completamente quieta. Una pieza en clavada absoluta tampoco defiende de verdad, aunque parezca que sí.',
  },
  {
    id: 'tac_clavada_relativa', area: 'tactica', peso: 3, tipo: 'opcion',
    enunciado: '¿Cómo se llama la clavada en la que sí es legal mover la pieza clavada, pero conviene no hacerlo porque detrás hay algo más valioso que no es el rey?',
    opciones: [
      'Clavada relativa',
      'Clavada absoluta',
      'Ataque descubierto',
      'Desviación forzada',
    ],
    correcta: 0,
    explica: 'Acá mover es legal, solo que sale caro: se expone la pieza de atrás. A veces vale la pena romper la clavada igual, si lo que se gana supera lo que se entrega.',
  },
  {
    id: 'tac_jaque_descubierto', area: 'tactica', peso: 2, tipo: 'opcion',
    enunciado: 'Cuando un ataque descubierto además da jaque al rey rival, ¿cómo se llama esa jugada?',
    opciones: [
      'Jaque descubierto',
      'Jaque intermedio',
      'Jaque perpetuo',
      'Jaque de molino',
    ],
    correcta: 0,
    explica: 'Es el caso particular en que la pieza de atrás apunta al rey. Lo temible es que la pieza que se aparta puede irse a capturar donde quiera: el rival está obligado a atender el jaque.',
  },
  {
    id: 'tac_zwischenzug', area: 'tactica', peso: 4, tipo: 'opcion',
    enunciado: '¿Qué es una «jugada intermedia» (zwischenzug)?',
    opciones: [
      'Una jugada fuerte metida antes de la esperada',
      'La primera jugada de cualquier apertura conocida',
      'Una jugada que no cambia nada de la posición',
      'Una jugada ilegal que hay que volver atrás',
    ],
    correcta: 0,
    explica: 'En vez de recapturar en el acto, como el rival da por hecho, se intercala otra jugada más fuerte —normalmente un jaque o una amenaza mayor— y recién después se completa el cambio. Es de lo que más se pasa por alto al calcular.',
  },
  {
    id: 'tac_combinacion', area: 'tactica', peso: 2, tipo: 'opcion',
    enunciado: 'En ajedrez, ¿qué es una «combinación»?',
    opciones: [
      'Una serie forzada de jugadas con un fin concreto',
      'Cualquier jugada que desarrolla una pieza nueva',
      'Un tipo de apertura que casi nadie juega hoy',
      'Exactamente lo mismo que se llama estrategia',
    ],
    correcta: 0,
    explica: 'Lo que la define es que es forzada: el rival casi no tiene alternativas. Suele incluir un sacrificio y termina en ganancia clara de material o en mate.',
  },
  {
    id: 'tac_f7_debil', area: 'tactica', peso: 2, tipo: 'opcion',
    enunciado: 'En las primeras jugadas, ¿por qué la casilla f7 (f2 para las blancas) suele ser objetivo de ataques tempranos?',
    opciones: [
      'Porque al empezar solo la defiende el rey',
      'Porque ahí siempre aparece un peón pasado',
      'Porque es la única casilla de enroque',
      'Porque ningún alfil puede llegar ahí',
    ],
    correcta: 0,
    explica: 'Antes de enrocar, f7 tiene un solo defensor: el propio rey. Por eso tantas combinaciones de apertura apuntan ahí, desde el mate pastor hasta el sacrificio de caballo en f7.',
  },
  {
    id: 'tac_mate_pastor', area: 'tactica', peso: 1, tipo: 'opcion',
    enunciado: '¿Cómo se llama el intento de mate rápido que ataca f7 combinando la dama y el alfil desde la apertura?',
    opciones: [
      'Mate pastor',
      'Mate sofocado',
      'Mate de escalera',
      'Mate del pasillo',
    ],
    correcta: 0,
    explica: 'Aprovecha que f7 está poco defendida al principio. Se para fácil —basta con defender f7 y desarrollar—, y quien lo intenta y falla queda con la dama fuera de juego.',
  },
  {
    id: 'tac_trampa_apertura', area: 'tactica', peso: 2, tipo: 'opcion',
    enunciado: '¿Qué es una «trampa de apertura»?',
    opciones: [
      'Jugadas que castigan una respuesta natural pero mala',
      'Una jugada ilegal disfrazada de jugada normal',
      'Un gambito que nunca se puede aceptar sin perder material',
      'Una regla especial que solo se aplica en torneos',
    ],
    correcta: 0,
    explica: 'Aprovechan que ciertas jugadas parecen lógicas y esconden un error táctico. Sirven para ganar rápido, pero apoyarse solo en ellas no enseña a jugar: el rival que no cae deja una posición normal.',
  },
  {
    id: 'tac_sacrificio_griego', area: 'tactica', peso: 4, tipo: 'opcion',
    enunciado: '¿Cómo se conoce el clásico sacrificio de alfil en h7 (o h2), capturando el peón que cubre al rey enrocado?',
    opciones: [
      'El sacrificio griego',
      'El mate de la coz',
      'El gambito de rey',
      'La regla de Tarrasch',
    ],
    correcta: 0,
    explica: 'El alfil se entrega en h7 para sacar al rey de su refugio; después suele venir Cg5+ y la dama entra al ataque. No siempre funciona: hay que comprobar antes que las piezas del ataque lleguen a tiempo.',
  },
  {
    id: 'tac_atacar_clavada', area: 'tactica', peso: 3, tipo: 'opcion',
    enunciado: 'Si el rival tiene una pieza clavada que no es el rey, ¿qué principio táctico conviene seguir?',
    opciones: [
      'Atacarla más veces de las que la puede defender',
      'Ignorarla: una pieza clavada no se gana nunca',
      'Cambiarla de inmediato, pieza por pieza',
      'Retirar las piezas propias de esa zona',
    ],
    correcta: 0,
    explica: 'La pieza clavada no puede huir sin exponer lo que tiene detrás, así que es un blanco quieto: se le suman atacantes hasta que el defensor no da abasto. Un peón que la ataque suele ser lo más eficaz.',
  },
  {
    id: 'tac_ahogado_recurso', area: 'tactica', peso: 3, tipo: 'opcion',
    enunciado: 'Si vas claramente perdiendo, ¿qué recurso táctico defensivo puede salvar la partida?',
    opciones: [
      'Buscar el ahogado del rey rival, que da tablas',
      'Ofrecer tablas una y otra vez hasta que acepte',
      'Capturar la dama rival al precio que sea',
      'Enrocar en el último momento posible',
    ],
    correcta: 0,
    explica: 'Aun en posiciones perdidas se puede maniobrar hacia una trampa de ahogado: dejar al rey rival sin ninguna jugada legal y sin estar en jaque. Medio punto de la nada.',
  },
  {
    id: 'tac_tactica_vs_estrategia', area: 'tactica', peso: 2, tipo: 'opcion',
    enunciado: '¿Qué es una «táctica» en ajedrez, a diferencia de la «estrategia»?',
    opciones: [
      'Jugadas forzadas y cortas para ganar algo concreto',
      'Un plan de largo plazo, sin ninguna jugada forzada',
      'Otro nombre con el que se llama a la apertura',
      'Un tipo particular de final de peones',
    ],
    correcta: 0,
    explica: 'La táctica es corto plazo y forzada: capturas, jaques, amenazas que el rival tiene que atender. La estrategia es el plan de fondo — qué casillas ocupar, qué estructura buscar. Las dos hacen falta, pero en estos niveles la táctica decide casi todas las partidas.',
  },

  /* ---------------- Mates y seguridad del rey ---------------- */
  {
    id: 'mate_rey_captura_defendida', area: 'mate', peso: 1, tipo: 'opcion',
    enunciado: '¿Puede un rey capturar una pieza rival que está defendida por otra pieza?',
    opciones: [
      'No: quedaría en jaque tras la captura',
      'Sí, mientras la defendida no sea la dama',
      'Sí, sin ninguna excepción posible',
      'Solo en la primera jugada de la partida',
    ],
    correcta: 0,
    explica: 'El rey nunca puede ir a una casilla atacada, así que capturar una pieza defendida sería ilegal. De ahí sale media técnica de mate: basta con que la pieza que da jaque esté defendida.',
  },
  {
    id: 'mate_pasillo_cuando', area: 'mate', peso: 2, tipo: 'opcion',
    enunciado: 'El «mate del pasillo» ocurre típicamente cuando…',
    opciones: [
      'Sus propios peones encierran al rey en la última fila',
      'El rey está en el centro del tablero, sin peones cerca',
      'Se acaba de hacer el enroque largo por el flanco',
      'Al rival no le queda ningún peón en el tablero',
    ],
    correcta: 0,
    explica: 'El rey enrocado queda atrapado detrás de sus tres peones, y una torre o la dama entran a la última fila con jaque. No hay dónde ir, ni quién capture o bloquee.',
  },
  {
    id: 'mate_pasillo_torre_a', area: 'mate', peso: 2, tipo: 'opcion_tablero',
    enunciado: 'Juegan las blancas. ¿Cuál de estas jugadas de la torre da jaque mate?',
    fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
    opciones: [
      'Ta8#',
      'Ta7',
      'Tf1',
      'Rg2',
    ],
    correcta: 0,
    explica: 'Ta8 es mate: el rey negro, encerrado por sus peones de f7, g7 y h7, no tiene casilla libre y nadie puede capturar la torre ni meterse en medio.',
    prueba: 'Ta8 es legal y es jaque mate',
  },
  {
    id: 'mate_coz_cuando', area: 'mate', peso: 3, tipo: 'opcion',
    enunciado: 'El «mate de la coz» suele darse cuando…',
    opciones: [
      'Un caballo da jaque de cerca y nadie puede huir',
      'Intervienen solamente los dos alfiles del bando',
      'Un peón corona a dama y da mate de inmediato',
      'El rey rival se quedó totalmente solo en el tablero',
    ],
    correcta: 0,
    explica: 'El caballo da el jaque final desde muy cerca, y el rey no lo puede capturar porque está defendido o porque sus propias piezas le tapan todas las salidas. Es el mate más vistoso del ajedrez.',
  },
  {
    id: 'mate_tecnica_torre_franja', area: 'mate', peso: 3, tipo: 'opcion',
    enunciado: 'En el final de rey y torre contra rey solo, ¿cuál es la técnica básica para forzar el mate?',
    opciones: [
      'Encerrarlo en una franja cada vez más chica',
      'Dar jaques sin parar hasta que salga el mate solo',
      'Cambiar la torre por el rey rival y después coronar',
      'Avanzar los peones propios lo más rápido posible',
    ],
    correcta: 0,
    explica: 'La torre le corta una fila o una columna y el propio rey se acerca a empujarlo; la franja se achica hasta el borde. Sin el rey propio, la torre sola no da mate nunca.',
  },
  {
    id: 'mate_dama_ahogado', area: 'mate', peso: 3, tipo: 'opcion',
    enunciado: 'En el final de rey y dama contra rey solo, ¿qué error hay que evitar con más cuidado?',
    opciones: [
      'Ahogar al rey rival sin querer, y dar tablas',
      'Alejar demasiado la dama del propio rey negro',
      'Enrocar antes de haber dado el mate final',
      'Capturar el rey rival en vez de dar mate',
    ],
    correcta: 0,
    explica: 'Con dama de sobra, el único peligro real es apretar tanto que el rey rival quede sin jaque y sin jugada legal. La regla práctica: antes de cada jugada, comprobar que le queda al menos una casilla.',
  },
  {
    id: 'mate_legal', area: 'mate', peso: 4, tipo: 'opcion',
    enunciado: 'El «mate de Légal» es una trampa clásica de apertura en la que las blancas…',
    opciones: [
      'Entregan la dama porque ya tienen el mate listo',
      'Ganan la dama rival sin dar nada a cambio',
      'Obligan al rival a enrocar cuando no le conviene',
      'Evitan cualquier sacrificio durante la apertura',
    ],
    correcta: 0,
    explica: 'Se entrega la dama a propósito porque unas jugadas después hay mate forzado con caballo y alfil. Es la trampa que enseña que el material no manda cuando hay mate.',
  },
  {
    id: 'mate_opera', area: 'mate', peso: 4, tipo: 'opcion',
    enunciado: 'El «mate de la Ópera», famoso por una partida de Paul Morphy, combina típicamente…',
    opciones: [
      'Dama y otra pieza rematando por la última fila',
      'Solamente los dos caballos del bando atacante',
      'Un final de peones puros, sin ninguna pieza',
      'Un sacrificio de calidad en el flanco de dama',
    ],
    correcta: 0,
    explica: 'Morphy remató con dama y torre mientras el rival tenía las piezas sin desarrollar, estorbando su propia defensa. Es la partida que mejor enseña para qué sirve desarrollar.',
  },
  {
    id: 'mate_objetivo_final', area: 'mate', peso: 1, tipo: 'opcion',
    enunciado: '¿Cuál es el objetivo final de cualquier partida de ajedrez?',
    opciones: [
      'Dar jaque mate al rey rival',
      'Capturar todas las piezas del rival',
      'Coronar la mayor cantidad de peones',
      'Terminar con más tiempo en el reloj',
    ],
    correcta: 0,
    explica: 'Muchas partidas terminan por abandono, por tablas o por tiempo, pero el objetivo formal sigue siendo uno solo: el jaque mate. Todo lo demás son caminos hacia eso.',
  },
  {
    id: 'mate_patrones_memoria', area: 'mate', peso: 2, tipo: 'opcion',
    enunciado: '¿Por qué conviene memorizar los patrones de mate típicos?',
    opciones: [
      'Para reconocerlos rápido en vez de calcular de cero',
      'Porque son las únicas formas legales de dar un mate',
      'Porque el reglamento exige saberlos de memoria',
      'Porque sin conocerlos no se puede enrocar',
    ],
    correcta: 0,
    explica: 'Quien ya vio el patrón no calcula: lo reconoce y va directo a la jugada que lo completa. Es la diferencia entre encontrar el mate en dos segundos o no encontrarlo.',
  },
  {
    id: 'mate_rey_al_borde', area: 'mate', peso: 2, tipo: 'opcion',
    enunciado: 'En casi todos los mates con poco material, ¿dónde suele terminar acorralado el rey rival?',
    opciones: [
      'En el borde o una esquina del tablero',
      'Justo en el centro exacto del tablero',
      'Siempre de vuelta en su casilla inicial',
      'En cualquier lado: da igual dónde esté',
    ],
    correcta: 0,
    explica: 'En el centro el rey tiene ocho casillas; en el borde, cinco; en una esquina, tres. Por eso toda la técnica de mate consiste en empujarlo hacia afuera.',
  },
  {
    id: 'mate_evitar_ahogado', area: 'mate', peso: 2, tipo: 'opcion',
    enunciado: 'Al dar mate con mucho material de ventaja, ¿qué error común hay que evitar con cuidado?',
    opciones: [
      'Dejarlo sin jaque y sin jugadas: es ahogado',
      'Dar demasiados jaques seguidos, uno tras otro',
      'Mover el propio rey con demasiada frecuencia',
      'Coronar un peón más de los que hacen falta',
    ],
    correcta: 0,
    explica: 'Con ventaja aplastante es fácil encerrar al rey rival por descuido, y el ahogado convierte una victoria segura en medio punto. Es la forma más dolorosa de no ganar una partida ganada.',
  },
  {
    id: 'mate_dos_torres_cuidado', area: 'mate', peso: 3, tipo: 'opcion',
    enunciado: 'Al dar mate con dos torres contra el rey solo, ¿qué cuidado hay que tener con la torre que da el jaque final?',
    opciones: [
      'Que quede fuera del alcance del rey rival',
      'Ponerla siempre en la primera fila del tablero',
      'Entregarla justo antes de dar el mate final',
      'Tenerla lo más lejos posible del rey propio',
    ],
    correcta: 0,
    explica: 'Si la torre que da jaque queda pegada al rey y sin defensa, el rey la captura y no hay mate. Con dos torres alcanza con darle jaque desde lejos, alternando filas.',
  },
  {
    id: 'mate_rey_participa', area: 'mate', peso: 2, tipo: 'opcion',
    enunciado: 'En los finales de mate con poco material, ¿qué pieza propia hay que acercar para completar el mate?',
    opciones: [
      'El propio rey, que tiene que participar',
      'La dama, que siempre alcanza ella sola',
      'Los peones que queden en el tablero',
      'Ninguna: las piezas mayores alcanzan',
    ],
    correcta: 0,
    explica: 'Salvo con dama o con dos torres, casi todos los mates básicos necesitan al rey propio empujando. Es el cambio de mentalidad del final: el rey deja de esconderse y sale a trabajar.',
  },
  {
    id: 'mate_antes_que_material', area: 'mate', peso: 2, tipo: 'opcion',
    enunciado: '¿Por qué dar jaque mate es preferible a seguir ganando material, cuando las dos cosas están disponibles?',
    opciones: [
      'Porque el mate termina la partida ahí mismo',
      'Porque ganar más material está prohibido',
      'Porque el material no vale nada en ajedrez',
      'Porque dar mate suma puntos extra al resultado',
    ],
    correcta: 0,
    explica: 'El resultado no depende de cuánto material se junte sino de si hay mate. Quedarse acumulando piezas con el mate a la vista es la forma más común de dejar escapar una partida ganada.',
  },
  {
    id: 'mate_luft', area: 'mate', peso: 2, tipo: 'opcion',
    enunciado: '¿Cómo se puede prevenir un futuro mate del pasillo antes de que sea un problema?',
    opciones: [
      'Haciendo un respiradero: adelantar un peón del rey',
      'Cambiando todas las piezas mayores que uno tiene',
      'Evitando enrocar durante toda la partida entera',
      'Retrasando el desarrollo de todas las piezas',
    ],
    correcta: 0,
    explica: 'Se llama «luft» —aire, en alemán—: se adelanta h3 o g3 para que el rey tenga por dónde salir. Cuesta un tiempo y evita perder la partida de un jaque.',
  },
  {
    id: 'mate_dos_alfiles_esquina', area: 'mate', peso: 4, tipo: 'opcion',
    enunciado: 'Al forzar mate con rey y dos alfiles contra rey solo, ¿en qué esquina se puede completar el mate?',
    opciones: [
      'En cualquiera: cubren casillas de los dos colores',
      'Solo en la del color de uno de los dos alfiles',
      'En ninguna: ese final siempre termina en tablas',
      'Solo si además queda algún peón en el tablero',
    ],
    correcta: 0,
    explica: 'Entre los dos alfiles controlan casillas claras y oscuras, así que ninguna esquina es segura para el rey. Es más fácil de lo que parece: hay que llevarlo al borde con el rey propio y cerrar las diagonales.',
  },
  {
    id: 'mate_alfil_caballo_esquina', area: 'mate', peso: 5, tipo: 'opcion',
    enunciado: 'El final de rey, alfil y caballo contra rey solo tiene una particularidad conocida: el mate solo se puede forzar…',
    opciones: [
      'En la esquina del color de casillas del alfil',
      'En cualquier esquina, sin ninguna restricción',
      'Únicamente en el centro mismo del tablero',
      'Solo si el rival comete algún error grave',
    ],
    correcta: 0,
    explica: 'El alfil solo controla un color, así que en la esquina del color contrario el rey defensor se escapa. Hay que empujarlo hasta la esquina correcta, y eso puede llevar más de treinta jugadas: es el mate básico más difícil.',
  },
  {
    id: 'mate_basicos_cuales', area: 'mate', peso: 3, tipo: 'opcion',
    enunciado: '¿Cuáles son los finales de mate «básicos» que conviene dominar de memoria desde el principio?',
    opciones: [
      'Dama contra rey, torre contra rey y dos alfiles',
      'Solamente el final de rey y peón contra el rey',
      'Únicamente los finales con más de dos torres',
      'Ninguno: todos los mates se improvisan jugando',
    ],
    correcta: 0,
    explica: 'Son los tres que aparecen de verdad y que se pueden forzar siempre. Saberlos de memoria ahorra tiempo de reloj y, sobre todo, evita el ahogado por nervios.',
  },

  /* ---------------- Finales ---------------- */
  {
    id: 'fin_oposicion_concepto', area: 'finales', peso: 2, tipo: 'opcion',
    enunciado: 'En un final de rey y peón contra rey, el concepto de «oposición» significa que…',
    opciones: [
      'Con una casilla de por medio, gana quien NO mueve',
      'El rey puede atacar al rey rival, solo en finales',
      'Los peones se oponen en una misma columna',
      'Es otro nombre para la regla del cuadrado',
    ],
    correcta: 0,
    explica: 'Cuando los reyes quedan frente a frente con una casilla vacía en medio, el que tiene que mover es el que pierde terreno: está obligado a apartarse. Por eso en los finales de peones vale más el turno que la posición.',
  },
  {
    id: 'fin_oposicion_tablero', area: 'finales', peso: 3, tipo: 'opcion_tablero',
    enunciado: 'Juegan las blancas, con los reyes enfrentados y una casilla de por medio. ¿Quién tiene la oposición?',
    fen: '4k3/8/4K3/8/8/8/8/8 w - - 0 1',
    opciones: [
      'Las negras: las blancas tienen que ceder',
      'Las blancas, que llevan la iniciativa',
      'Nadie: acá el concepto no se aplica',
      'Depende de qué peón quede en el tablero',
    ],
    correcta: 0,
    explica: 'Tiene la oposición quien NO está obligado a mover. Como juegan las blancas, cualquier jugada de su rey le cede terreno al negro.',
    prueba: 'posición legal, reyes en e6 y e8 con turno de las blancas',
  },
  {
    id: 'fin_cuadrado_para_que', area: 'finales', peso: 2, tipo: 'opcion',
    enunciado: 'La «regla del cuadrado» sirve para saber rápidamente si…',
    opciones: [
      'El rey alcanza a tiempo a un peón pasado',
      'Un caballo llega a una casilla concreta',
      'Una posición es tablas por repetición',
      'Un enroque todavía es legal o ya no',
    ],
    correcta: 0,
    explica: 'Se dibuja mentalmente el cuadrado que va del peón a su casilla de coronación: si el rey defensor puede entrar en él, lo alcanza. Ahorra calcular la carrera jugada por jugada.',
  },
  {
    id: 'fin_zugzwang', area: 'finales', peso: 3, tipo: 'opcion',
    enunciado: '¿Qué es el «zugzwang» en ajedrez?',
    opciones: [
      'Estar obligado a mover y que toda jugada empeore',
      'Una apertura poco frecuente del flanco de dama',
      'Un tipo de sacrificio de dama en el medio juego',
      'Otra forma de nombrar al jaque mate forzado',
    ],
    correcta: 0,
    explica: 'Lo ideal sería pasar el turno, pero las reglas obligan a jugar y cualquier jugada estropea la posición. Es la idea que sostiene casi todos los finales de peones.',
  },
  {
    id: 'fin_casillas_correspondientes', area: 'finales', peso: 5, tipo: 'opcion',
    enunciado: 'En finales de rey y peones más complejos, ¿qué son las «casillas correspondientes»?',
    opciones: [
      'Pares de casillas que los reyes deben ocuparse mutuamente',
      'Las casillas en las que un peón puede llegar a coronar',
      'Las casillas del mismo color a lo largo del tablero',
      'Las casillas desde las que el rey todavía puede enrocar',
    ],
    correcta: 0,
    explica: 'Es la oposición llevada más lejos: a cada casilla del rey atacante le corresponde una del defensor, y quien no llega a la suya cae en zugzwang. Se usa cuando la oposición directa no alcanza para decidir.',
  },
  {
    id: 'fin_pasado_protegido', area: 'finales', peso: 3, tipo: 'opcion',
    enunciado: '¿Por qué un «peón pasado protegido», defendido por otro peón propio, es especialmente fuerte?',
    opciones: [
      'Porque el rey no lo puede tomar, y avanza apoyado',
      'Porque corona solo, sin necesidad de más jugadas',
      'Porque no existe forma alguna de bloquearlo',
      'Porque pasa a valer el doble que un peón normal',
    ],
    correcta: 0,
    explica: 'El rey rival no puede capturarlo sin perder algo a cambio, así que queda clavado vigilándolo. En un final de peones, un pasado protegido suele valer la partida.',
  },
  {
    id: 'fin_pasados_conectados', area: 'finales', peso: 3, tipo: 'opcion',
    enunciado: '¿Por qué dos peones pasados y conectados son especialmente peligrosos en un final?',
    opciones: [
      'Porque se cubren entre ellos y no se frena a los dos',
      'Porque pasan a valer el doble que un peón normal suelto',
      'Porque no se los puede capturar de ninguna manera',
      'Porque obligan al rival a enrocar de inmediato',
    ],
    correcta: 0,
    explica: 'Uno defiende al otro mientras avanzan, así que el rey rival no puede pararlos solo: si se ocupa de uno, el otro sigue. Dos peones conectados en la sexta fila valen más que una torre.',
  },
  {
    id: 'fin_peon_torre_alfil_malo', area: 'finales', peso: 5, tipo: 'opcion',
    enunciado: 'Con un peón de la columna «a» o «h» y un alfil del color contrario a la casilla de coronación, ¿qué suele pasar?',
    opciones: [
      'Tablas si el rey defensor llega a esa esquina',
      'Gana siempre quien tiene el peón, sin excepción',
      'El alfil frena el peón sin ayuda de su rey',
      'Tablas solo si quedan menos de tres peones',
    ],
    correcta: 0,
    explica: 'El alfil no controla la casilla de coronación y el rey defensor se mete en la esquina: no hay forma de sacarlo. Es tablas aunque el atacante tenga varios peones de más, y por eso conviene saberlo antes de cambiar hacia ese final.',
  },
  {
    id: 'fin_rey_delante_peon', area: 'finales', peso: 3, tipo: 'opcion',
    enunciado: 'Como principio general en finales de rey y peón, ¿dónde conviene tener al propio rey respecto a su peón pasado?',
    opciones: [
      'Delante, abriéndole el camino a la coronación',
      'Detrás del peón, empujándolo siempre desde atrás',
      'Siempre en el flanco contrario del tablero',
      'Da igual: el rey no influye en este final',
    ],
    correcta: 0,
    explica: 'El rey va adelante despejando el camino y ganando la oposición; el peón lo sigue. Un peón que avanza solo, con el rey detrás, casi siempre se frena.',
  },
  {
    id: 'fin_teoricos_por_que', area: 'finales', peso: 3, tipo: 'opcion',
    enunciado: '¿Por qué conviene estudiar los «finales teóricos», las posiciones ya analizadas al detalle?',
    opciones: [
      'Porque tienen técnica exacta y resultado conocido',
      'Porque son las únicas posiciones legales del juego',
      'Porque solo aparecen en partidas de altísimo nivel',
      'Porque estudiarlos reemplaza aprender táctica',
    ],
    correcta: 0,
    explica: 'Su resultado ya está establecido y la técnica es conocida: se reconocen y se ejecutan, sin calcular bajo presión. Son pocas posiciones y aparecen una y otra vez.',
  },
  {
    id: 'fin_pasado_alejado', area: 'finales', peso: 4, tipo: 'opcion',
    enunciado: '¿Por qué un «peón pasado alejado» suele ser una ventaja decisiva en finales de peones?',
    opciones: [
      'Porque distrae al rey rival lejos de lo importante',
      'Porque corona más rápido que cualquier otro peón',
      'Porque la regla del cuadrado no se le aplica',
      'Porque siempre está protegido por otro peón',
    ],
    correcta: 0,
    explica: 'El rey defensor tiene que ir a buscarlo, y mientras tanto el otro flanco queda solo: el rey atacante se come todo lo que quedó sin defensa. Se gana ahí, no con el peón alejado.',
  },
  {
    id: 'fin_cuadrado_excepcion', area: 'finales', peso: 4, tipo: 'opcion',
    enunciado: 'La «regla del cuadrado» tiene una excepción importante: hay que agrandar el cuadrado si…',
    opciones: [
      'El peón no se movió y puede avanzar dos casillas',
      'El rey defensor conserva más de un peón propio',
      'Le toca mover al bando de las piezas blancas',
      'El peón está en una de las columnas centrales',
    ],
    correcta: 0,
    explica: 'Un peón en su casilla inicial recorre dos casillas de un salto, así que el cuadrado se cuenta desde la casilla a la que puede llegar, no desde donde está. Olvidarlo hace perder carreras que parecían ganadas.',
  },
  {
    id: 'fin_alfiles_mismo_color', area: 'finales', peso: 4, tipo: 'opcion',
    enunciado: 'A diferencia del final de alfiles de distinto color, en un final de alfiles del MISMO color con un peón de ventaja…',
    opciones: [
      'Suele ser bastante más fácil convertir la ventaja',
      'También suelen terminar en tablas casi siempre igual',
      'Los alfiles no se pueden capturar entre ellos',
      'Es tablas si quedan menos de cuatro peones',
    ],
    correcta: 0,
    explica: 'Los dos alfiles controlan las mismas casillas, así que no existe el bloqueo permanente que salva los finales de distinto color. Un peón de más suele alcanzar para ganar.',
  },
  {
    id: 'fin_torres_frecuentes', area: 'finales', peso: 3, tipo: 'opcion',
    enunciado: '¿Por qué se dice que los finales de torres son los más frecuentes en la práctica?',
    opciones: [
      'Porque las torres suelen ser las últimas en cambiarse',
      'Porque el reglamento obliga a conservarlas al final',
      'Porque alfiles y caballos se cambian por obligación',
      'Porque las torres no coronan y por eso sobreviven',
    ],
    correcta: 0,
    explica: 'Las torres entran en juego más tarde y se cambian después que las piezas menores, así que una parte enorme de las partidas llega a un final con torres. Es el final que más rinde estudiar.',
  },
  {
    id: 'fin_rey_lejos', area: 'finales', peso: 2, tipo: 'opcion',
    enunciado: 'Si el rey defensor queda muy lejos del flanco donde el rival tiene un peón pasado, ¿qué puede pasar?',
    opciones: [
      'Que el peón corone sin que el rey llegue a tiempo',
      'Que el peón deje de ser peligroso automáticamente',
      'Que solo el alfil pueda frenarlo, nunca el rey',
      'Que se declaren tablas por fortaleza posicional',
    ],
    correcta: 0,
    explica: 'Si el rey no entra en el cuadrado del peón, no lo alcanza y no hay nada que hacer. Por eso en los finales la posición del rey importa más que casi cualquier otra cosa.',
  },
  {
    id: 'fin_tiempo_vale_mas', area: 'finales', peso: 3, tipo: 'opcion',
    enunciado: 'En un final ajustado, ¿por qué cada jugada suele valer mucho más que en la apertura?',
    opciones: [
      'Porque hay menos piezas y casi ningún margen de error',
      'Porque en los finales el reloj corre más rápido por regla',
      'Porque las piezas valen menos puntos en esta fase',
      'Porque a esa altura ya no importa el orden de jugadas',
    ],
    correcta: 0,
    explica: 'Con pocas piezas no hay con qué compensar una jugada perdida: un solo tiempo decide entre ganar, empatar o perder. En la apertura un tiempo se recupera; en el final, no.',
  },
  {
    id: 'fin_rey_pasivo_error', area: 'finales', peso: 2, tipo: 'opcion',
    enunciado: '¿Cuál es un error común de jugadores principiantes en los finales?',
    opciones: [
      'Dejar el rey escondido en vez de activarlo',
      'Activar demasiado pronto al propio rey',
      'Cambiar demasiadas piezas antes de tiempo',
      'Avanzar los peones con excesiva rapidez',
    ],
    correcta: 0,
    explica: 'Después de toda una partida cuidando al rey, cuesta cambiar el chip: en el final ya casi no hay con qué atacarlo y tiene que salir a pelear como una pieza más. Un rey pasivo en un final es como jugar con una pieza menos.',
  },
  {
    id: 'fin_convertir_ventaja', area: 'finales', peso: 3, tipo: 'opcion',
    enunciado: '¿Qué significa «convertir una ventaja» en un final?',
    opciones: [
      'Llevar esa ventaja hasta la victoria, con técnica',
      'Cambiar un tipo de ventaja por otra distinta',
      'Entregar la ventaja para complicar la posición',
      'Ofrecer tablas apenas se consigue alguna ventaja',
    ],
    correcta: 0,
    explica: 'Tener ventaja no gana solo: hay que jugar el final con la técnica correcta para que el rival no se escape a tablas. La mayoría de los puntos que se pierden con ventaja se pierden acá.',
  },

  /* ---------------- Estrategia y planes ---------------- */
  {
    id: 'est_controlar_centro', area: 'estrategia', peso: 1, tipo: 'opcion',
    enunciado: '¿Qué significa «controlar el centro» en ajedrez?',
    opciones: [
      'Dominar d4, d5, e4 y e5 con piezas y peones',
      'Poner el propio rey en el centro del tablero',
      'Mover primero los peones de las dos torres',
      'Cambiar todas las piezas lo antes posible',
    ],
    correcta: 0,
    explica: 'Desde el centro las piezas llegan a los dos flancos, así que quien lo domina mueve sus piezas de un lado al otro más rápido que el rival. Controlar no siempre es ocupar: también se controla a distancia.',
  },
  {
    id: 'est_columna_abierta', area: 'estrategia', peso: 1, tipo: 'opcion',
    enunciado: 'Una «columna abierta» es una columna…',
    opciones: [
      'Sin peones de ningún color, ideal para las torres',
      'Con peones de los dos colores trabados entre sí',
      'Aquella en la que está enrocado el propio rey',
      'Que en realidad no existe en el reglamento',
    ],
    correcta: 0,
    explica: 'Sin peones que la tapen, la torre ve la columna entera y se vuelve una pieza de verdad. Pelear por la columna abierta —y doblar torres en ella— es uno de los planes más comunes del medio juego.',
  },
  {
    id: 'est_desequilibrio_material', area: 'estrategia', peso: 4, tipo: 'opcion',
    enunciado: '¿A qué se llama «desequilibrio material» cuando se busca a propósito?',
    opciones: [
      'Cambiar piezas de distinto tipo pero valor parecido',
      'Perder material sin ninguna razón que lo justifique',
      'Jugar toda la partida entera sin usar la dama',
      'Evitar por completo cualquier cambio de piezas',
    ],
    correcta: 0,
    explica: 'Por ejemplo, dos piezas menores contra torre y peón: los puntos dan casi igual, pero la posición que sale favorece a un estilo de juego o al otro. Se busca a propósito para llevar la partida al terreno que uno conoce.',
  },
  {
    id: 'est_peones_doblados', area: 'estrategia', peso: 2, tipo: 'opcion',
    enunciado: '¿Qué son los «peones doblados»?',
    opciones: [
      'Dos peones propios en la misma columna',
      'Dos peones que avanzaron dos casillas a la vez',
      'Dos peones que están en casillas del mismo color',
      'Dos peones rivales capturados en una jugada',
    ],
    correcta: 0,
    explica: 'Quedan uno delante del otro y no se pueden defender entre ellos, además de controlar menos casillas que si estuvieran separados. No siempre son malos: a cambio suelen abrir una columna para la torre.',
  },
  {
    id: 'est_peon_retrasado', area: 'estrategia', peso: 3, tipo: 'opcion',
    enunciado: '¿Qué es un «peón retrasado»?',
    opciones: [
      'Uno que quedó atrás y no puede avanzar seguro',
      'Uno que todavía no se movió en toda la partida',
      'Uno que va a coronar en la jugada siguiente',
      'Uno que acaba de ser capturado al paso',
    ],
    correcta: 0,
    explica: 'Sus vecinos ya avanzaron y no lo pueden proteger, y la casilla de adelante la controla el rival: queda clavado y es un blanco fijo, sobre todo si está en una columna abierta.',
  },
  {
    id: 'est_base_cadena', area: 'estrategia', peso: 3, tipo: 'opcion',
    enunciado: 'En una cadena de peones, ¿cuál es el punto más débil para atacar?',
    opciones: [
      'La base: el de más atrás, que nadie defiende',
      'La punta de la cadena, que es la más avanzada',
      'Siempre el peón que esté en una columna central',
      'El peón que está en la columna del propio rey',
    ],
    correcta: 0,
    explica: 'Todos los peones de la cadena están defendidos por el de atrás, menos el último: ese es el único que hay que atacar con piezas. Es el principio que ordena media estrategia de la Defensa Francesa.',
  },
  {
    id: 'est_ventaja_espacio', area: 'estrategia', peso: 2, tipo: 'opcion',
    enunciado: '¿Qué significa tener «ventaja de espacio» en una posición?',
    opciones: [
      'Controlar más casillas y dejar al rival apretado',
      'Tener más piezas en el tablero que el rival',
      'Haber jugado más rápido que el rival hasta ahí',
      'Tener el propio rey más cerca del centro',
    ],
    correcta: 0,
    explica: 'Más casillas controladas es más lugar donde poner las piezas propias, y menos para las del rival, que empiezan a estorbarse entre ellas. Quien tiene menos espacio busca cambios; quien tiene más, los evita.',
  },
  {
    id: 'est_jugar_con_plan', area: 'estrategia', peso: 2, tipo: 'opcion',
    enunciado: '¿Por qué se dice que hay que «jugar con un plan», en vez de mover pieza por pieza sin conexión?',
    opciones: [
      'Porque la posición misma sugiere qué hacer',
      'Porque el reglamento obliga a anunciar un plan',
      'Porque tener un plan garantiza ganar la partida',
      'Porque sin un plan no se puede mover legalmente',
    ],
    correcta: 0,
    explica: 'La estructura de peones, el espacio y las piezas que quedan dicen qué se puede intentar. Un plan conecta varias jugadas hacia lo mismo; sin él, cada jugada deshace lo que hizo la anterior.',
  },
  {
    id: 'est_peones_alma', area: 'estrategia', peso: 3, tipo: 'opcion',
    enunciado: 'La frase clásica «los peones son el alma del ajedrez», de Philidor, quiere decir que…',
    opciones: [
      'La estructura de peones decide qué planes hay',
      'Los peones son las piezas más valiosas que hay',
      'Sin peones en el tablero no se puede enrocar',
      'Los peones deciden quién mueve primero',
    ],
    correcta: 0,
    explica: 'Los peones casi no retroceden, así que la forma que toman es casi permanente y define el resto de la partida: dónde atacar, qué pieza sirve y cuál estorba. Por eso un avance de peón se piensa dos veces.',
  },
  {
    id: 'est_cambiar_alfil_malo', area: 'estrategia', peso: 3, tipo: 'opcion',
    enunciado: 'Si tienes un «alfil malo», encerrado por tus propios peones, ¿qué suele convenir?',
    opciones: [
      'Cambiarlo por una pieza rival en cuanto se pueda',
      'No cambiarlo nunca, bajo ninguna circunstancia',
      'Entregarlo de inmediato, sin pedir nada a cambio',
      'Convertirlo en el centro del propio ataque',
    ],
    correcta: 0,
    explica: 'Un alfil encerrado aporta poco y ocupa espacio propio. Cambiarlo por una pieza activa del rival —aunque sea «alfil por caballo»— suele mejorar la posición más que cualquier maniobra.',
  },
  {
    id: 'est_torre_septima', area: 'estrategia', peso: 3, tipo: 'opcion',
    enunciado: '¿Por qué una torre en la séptima fila suele ser muy fuerte?',
    opciones: [
      'Porque ataca los peones que aún no avanzaron',
      'Porque en esa fila está a salvo de todo ataque',
      'Porque le da jaque mate automático al rey',
      'Porque estando ahí la torre pasa a valer el doble',
    ],
    correcta: 0,
    explica: 'Los peones del rival siguen en su fila inicial, así que la torre los ataca todos de un tirón y de paso encierra al rey contra el borde. Dos torres en la séptima suelen valer más que una pieza de ventaja.',
  },
  {
    id: 'est_peones_colgantes', area: 'estrategia', peso: 4, tipo: 'opcion',
    enunciado: '¿Qué son los «peones colgantes»?',
    opciones: [
      'Dos peones propios juntos, sin otros que los apoyen',
      'Peones que están por coronar en la jugada siguiente',
      'Peones que fueron capturados al paso por el rival',
      'Peones del jugador que se quedó sin tiempo',
    ],
    correcta: 0,
    explica: 'Son fuerza y debilidad a la vez: dan espacio y movilidad mientras avanzan juntos, pero como ningún peón los defiende, son blanco fijo si se los logra frenar. Todo depende de si pueden avanzar o no.',
  },
  {
    id: 'est_iniciativa', area: 'estrategia', peso: 2, tipo: 'opcion',
    enunciado: '¿Qué significa tener la «iniciativa» en una partida?',
    opciones: [
      'Amenazar sin parar y obligar al rival a responder',
      'Haber hecho la primera jugada de toda la partida',
      'Tener más piezas en el tablero que las del rival',
      'Haber enrocado antes de que enrocara el rival',
    ],
    correcta: 0,
    explica: 'Quien la tiene marca el ritmo: el rival gasta todas sus jugadas defendiéndose y nunca llega a su propio plan. La iniciativa se puede perder en una jugada, y por eso a veces se paga material por conservarla.',
  },
  {
    id: 'est_tempo', area: 'estrategia', peso: 2, tipo: 'opcion',
    enunciado: 'En términos de apertura y estrategia, ¿qué es un «tiempo» (tempo)?',
    opciones: [
      'Cada jugada aprovechada para mejorar algo',
      'El tiempo total que dura la partida en el reloj',
      'Un tipo de sacrificio que se hace en la apertura',
      'Otra forma de nombrar el jaque al rey',
    ],
    correcta: 0,
    explica: 'Cada jugada cuesta un tiempo: si desarrolla o mejora la posición, está bien gastada; si repite o deshace, se perdió. Ganar tiempos atacando algo mientras uno se desarrolla es la forma más barata de sacar ventaja.',
  },
  {
    id: 'est_ataque_minoria', area: 'estrategia', peso: 5, tipo: 'opcion',
    enunciado: '¿En qué consiste el «ataque de minoría»?',
    opciones: [
      'Avanzar los pocos peones de un flanco para dejarle una debilidad',
      'Atacar únicamente con las piezas menores, jamás con las mayores',
      'Entregar de una sola vez todos los peones de un mismo flanco',
      'Jugar siempre con menos piezas en el tablero que el rival',
    ],
    correcta: 0,
    explica: 'Se avanzan dos peones contra tres, no para coronar sino para cambiarlos y que al rival le quede un peón aislado o retrasado en esa zona. Es el plan típico del Gambito de Dama con estructura Carlsbad.',
  },
  {
    id: 'est_casillas_debiles', area: 'estrategia', peso: 4, tipo: 'opcion',
    enunciado: '¿A qué se le llama un «complejo de casillas débiles»?',
    opciones: [
      'A un grupo de casillas de un color que ya nadie cubre',
      'A las casillas donde nunca puede haber ninguna pieza',
      'A las cuatro casillas centrales del tablero de ajedrez',
      'A las casillas donde un peón puede llegar a coronar',
    ],
    correcta: 0,
    explica: 'Al cambiarse, por ejemplo, el alfil de casillas claras, todas las claras cerca del rey quedan sin quien las controle, y ahí se instalan las piezas rivales. Un alfil que se cambia no se recupera: esa debilidad es para toda la partida.',
  },
  {
    id: 'est_pareja_alfiles_abierta', area: 'estrategia', peso: 3, tipo: 'opcion',
    enunciado: 'Si tienes la pareja de alfiles contra alfil y caballo, ¿qué tipo de posición te conviene buscar?',
    opciones: [
      'Abierta, con las diagonales largas despejadas',
      'Cerrada del todo, con los peones bien trabados',
      'Una en la que puedas cambiar tus alfiles rápido',
      'Una donde no se abra ninguna línea nunca',
    ],
    correcta: 0,
    explica: 'Los dos alfiles cubren casillas de los dos colores y barren el tablero cuando hay diagonales libres. Con la posición cerrada, en cambio, el caballo salta y ellos miran una pared de peones.',
  },
  {
    id: 'est_enroques_opuestos', area: 'estrategia', peso: 4, tipo: 'opcion',
    enunciado: 'Si las blancas enrocan corto y las negras largo, ¿qué estrategia se vuelve muy fuerte para los dos bandos?',
    opciones: [
      'Avanzar los peones contra el rey del rival',
      'No mover ningún peón por el resto de la partida',
      'Cambiar todas las piezas para llegar a un final',
      'Volver a enrocar hacia el flanco contrario',
    ],
    correcta: 0,
    explica: 'Como el propio rey está en el otro flanco, avanzar esos peones no lo debilita: es ataque puro y sin costo. Se convierte en una carrera, y ahí cada tiempo vale una pieza.',
  },
  {
    id: 'est_cambiar_bajo_presion', area: 'estrategia', peso: 3, tipo: 'opcion',
    enunciado: 'Si tu posición está bajo mucha presión, aunque el material siga igualado, ¿qué recurso suele aliviar la defensa?',
    opciones: [
      'Cambiar piezas para simplificar y bajar el peligro',
      'Evitar cualquier cambio de piezas a toda costa posible',
      'Avanzar los peones que cubren al propio rey ya',
      'Sacar la dama a atacar ella sola por su cuenta',
    ],
    correcta: 0,
    explica: 'Un ataque necesita piezas: cada una que se cambia le quita fuerza, aunque no se gane material. Por eso quien defiende busca cambios y quien ataca los evita.',
  },
  {
    id: 'est_evaluar_posicion', area: 'estrategia', peso: 2, tipo: 'opcion',
    enunciado: 'Al evaluar una posición en el medio juego, ¿qué conviene mirar además del material?',
    opciones: [
      'Rey, actividad de las piezas, peones y espacio',
      'Únicamente cuántas piezas quedan en el tablero',
      'Solamente el tiempo que queda en el reloj',
      'Nada más: solo si ya se enrocó o todavía no',
    ],
    correcta: 0,
    explica: 'El material es un factor entre varios. Un peón de menos con las piezas activas y el rey rival expuesto suele ser mejor negocio que un peón de más con todo dormido.',
  },

  /* ---------------- Cálculo y visualización ---------------- */
  {
    id: 'cal_que_es_calcular', area: 'calculo', peso: 1, tipo: 'opcion',
    enunciado: 'En ajedrez, ¿qué significa exactamente «calcular»?',
    opciones: [
      'Ver en la cabeza jugadas futuras y sus consecuencias',
      'Contar cuántas piezas quedan sobre el tablero de juego',
      'Sumar el tiempo que queda en el propio reloj',
      'Aprenderse de memoria variantes de apertura',
    ],
    correcta: 0,
    explica: 'Es seguir una secuencia concreta —mi jugada, su respuesta, mi jugada— sin tocar las piezas, y saber cómo queda el tablero al final. No es adivinar: es verificar.',
  },
  {
    id: 'cal_cambio_igual', area: 'calculo', peso: 1, tipo: 'opcion',
    enunciado: 'Si cambias tu alfil por el caballo del rival, y no hay ninguna otra captura, ¿qué pasó con el material?',
    opciones: [
      'Sigue igualado: los dos perdieron una menor',
      'Quedaste tú con una pieza de ventaja clara',
      'Quedó el rival con una pieza de ventaja clara',
      'Se declaran tablas de manera automática',
    ],
    correcta: 0,
    explica: 'Alfil y caballo valen lo mismo en la tabla, así que el balance no se mueve. Lo que sí cambia es el tipo de posición que queda, y eso puede favorecer a uno de los dos.',
  },
  {
    id: 'cal_contar_atacantes', area: 'calculo', peso: 2, tipo: 'opcion',
    enunciado: 'Antes de lanzar una serie de capturas en una casilla, ¿qué es fundamental contar primero?',
    opciones: [
      'Cuántos atacan, cuántos defienden y qué vale cada uno',
      'Solo cuántas piezas propias quedan todavía en el tablero',
      'El tiempo que a cada uno le queda en el reloj',
      'El color de la casilla donde se cruzan las piezas',
    ],
    correcta: 0,
    explica: 'No alcanza con contar cabezas: importa el orden de valor. Tres atacantes contra dos defensores puede ser mal negocio si los atacantes son la dama y las torres.',
  },
  {
    id: 'cal_arbol_variantes', area: 'calculo', peso: 3, tipo: 'opcion',
    enunciado: '¿Qué es un «árbol de variantes» al calcular una posición?',
    opciones: [
      'Las líneas que se abren según responda el rival',
      'Un dibujo que se hace en papel antes de jugar',
      'Una apertura con muchísima teoría acumulada',
      'La planilla escrita de una partida ya terminada',
    ],
    correcta: 0,
    explica: 'Cada jugada candidata abre ramas según lo que conteste el rival, y cada rama abre otras. Calcular bien es podar ese árbol: mirar pocas ramas, pero las que importan.',
  },
  {
    id: 'cal_precision_vs_profundidad', area: 'calculo', peso: 4, tipo: 'opcion',
    enunciado: 'Sobre «cuántas jugadas hay que calcular por delante», ¿qué es más importante que ver muy lejos?',
    opciones: [
      'Ver con precisión hasta donde haga falta',
      'Calcular siempre al menos diez jugadas exactas',
      'No calcular nunca más de una sola jugada',
      'Nada: la cantidad de jugadas no importa',
    ],
    correcta: 0,
    explica: 'Tres jugadas bien calculadas valen más que ocho a medias: un error a la segunda jugada invalida todo lo que viene después. Se calcula hasta que la posición se aquieta, no hasta un número fijo.',
  },
  {
    id: 'cal_a_ciegas', area: 'calculo', peso: 3, tipo: 'opcion',
    enunciado: '¿Para qué sirve practicar cálculo «a ciegas», visualizando sin mover las piezas?',
    opciones: [
      'Para entrenar a ver el tablero futuro en la cabeza',
      'Para poder jugar torneos sin tablero delante de uno',
      'Para memorizar aperturas mucho más rápido',
      'Para no tener que aprender la regla del enroque',
    ],
    correcta: 0,
    explica: 'Obliga a construir la imagen de la posición futura sin apoyarse en lo que se ve. Es exactamente la habilidad que falla cuando una combinación «se veía bien» y no funcionaba.',
  },
  {
    id: 'cal_amenaza_rival', area: 'calculo', peso: 2, tipo: 'opcion',
    enunciado: 'Antes de decidir una jugada, ¿qué conviene revisar además de las propias ideas?',
    opciones: [
      'Qué amenaza el rival con lo que acaba de jugar',
      'Solo cuántas piezas propias quedan en el tablero',
      'Cómo terminó la última partida que se jugó',
      'De qué color es la casilla del propio rey',
    ],
    correcta: 0,
    explica: 'La pregunta que más partidas salva es «¿para qué jugó eso?». Ejecutar el propio plan sin mirar la amenaza del rival es la causa número uno de las derrotas por descuido.',
  },
  {
    id: 'cal_recaptura_cual', area: 'calculo', peso: 3, tipo: 'opcion',
    enunciado: 'Después de una captura, ¿qué conviene comprobar antes de dar por obvia la recaptura?',
    opciones: [
      'Todas las piezas que pueden recapturar ahí',
      'Solamente si el rey sigue estando en jaque',
      'Si el enroque ya se hizo o todavía no',
      'El valor total de las piezas que quedan',
    ],
    correcta: 0,
    explica: 'Muchas veces hay dos o tres piezas que pueden recapturar, y la elección cambia todo: con cuál se recaptura decide si la columna queda abierta, si el peón queda doblado o si la pieza queda mal puesta.',
  },
  {
    id: 'cal_legalidad', area: 'calculo', peso: 3, tipo: 'opcion',
    enunciado: 'Después de calcular una combinación prometedora, ¿qué último paso no hay que saltarse?',
    opciones: [
      'Comprobar que cada jugada de la línea es legal',
      'Anunciar la combinación al rival en voz alta',
      'Ofrecerle tablas al rival antes de empezarla',
      'Anotarla en la planilla antes de jugar nada',
    ],
    correcta: 0,
    explica: 'Es facilísimo calcular moviendo una pieza que en realidad está clavada, o dejando al propio rey en jaque. Antes de confiar en la combinación, se repasa que cada jugada exista de verdad.',
  },
  {
    id: 'cal_espejismo', area: 'calculo', peso: 4, tipo: 'opcion',
    enunciado: '¿Qué es un «espejismo táctico» al calcular una combinación?',
    opciones: [
      'Una línea que parece ganar hasta que aparece la defensa',
      'Una jugada que en realidad es ilegal pero parece legal',
      'Un patrón de mate que no llega a funcionar jamás',
      'Un tipo de sacrificio que siempre resulta correcto',
    ],
    correcta: 0,
    explica: 'La combinación se ve preciosa y falla por una jugada que está una más adelante. Por eso hay que buscar activamente la mejor defensa del rival, no la que uno espera que juegue.',
  },
  {
    id: 'cal_forzadas_faciles', area: 'calculo', peso: 3, tipo: 'opcion',
    enunciado: '¿Por qué las líneas «forzadas» son más fáciles de calcular que las libres?',
    opciones: [
      'Porque hay menos ramas que revisar',
      'Porque las forzadas siempre terminan en mate',
      'Porque en ellas no hace falta pensar nada',
      'Porque las líneas libres son siempre ilegales',
    ],
    correcta: 0,
    explica: 'Si el rival tiene una sola respuesta razonable, el árbol es una línea recta y se puede calcular muy profundo. Por eso conviene empezar mirando jaques y capturas: son lo más forzado que hay.',
  },
  {
    id: 'cal_evaluar_final', area: 'calculo', peso: 4, tipo: 'opcion',
    enunciado: 'Al terminar de calcular una secuencia larga, ¿qué es tan importante como ver las jugadas?',
    opciones: [
      'Ver cómo queda la posición final y si conviene',
      'Anotar cada jugada en la planilla antes de jugar',
      'Contar cuántos minutos se gastaron pensándola',
      'Preguntarle al árbitro si la secuencia está bien',
    ],
    correcta: 0,
    explica: 'Se puede calcular ocho jugadas sin un error y equivocarse igual, si la posición del final no era tan buena como parecía. Calcular y evaluar son dos habilidades distintas y las dos hacen falta.',
  },
  {
    id: 'cal_amenaza_de_mate', area: 'calculo', peso: 2, tipo: 'opcion',
    enunciado: 'Si el rival amenaza dar mate en su jugada siguiente, ¿qué prioridad tiene atender esa amenaza?',
    opciones: [
      'Máxima: antes que cualquier plan propio',
      'Ninguna: se puede ignorar si uno gana material',
      'Solo importa si al rival le queda la dama',
      'Solo en los finales, nunca en la apertura',
    ],
    correcta: 0,
    explica: 'El mate termina la partida, así que anula cualquier otra cuenta. Aunque estés ganando una torre del otro lado del tablero, primero se para el mate — aunque cueste material.',
  },
  {
    id: 'cal_poco_tiempo', area: 'calculo', peso: 3, tipo: 'opcion',
    enunciado: 'Con poco tiempo en el reloj, ¿qué conviene priorizar al calcular?',
    opciones: [
      'Las líneas forzadas y seguras, que se verifican',
      'Calcular la partida entera hasta el final',
      'No calcular nada y jugar lo primero que salga',
      'Ofrecer tablas de inmediato, sin mirar nada',
    ],
    correcta: 0,
    explica: 'Una combinación especulativa necesita tiempo para comprobarse, y con la bandera cerca no lo hay. Con apuro se juega lo que se puede verificar rápido, aunque sea menos ambicioso.',
  },
  {
    id: 'cal_ver_vs_calcular', area: 'calculo', peso: 3, tipo: 'opcion',
    enunciado: '¿Cuál es la diferencia entre «ver» una idea táctica y «calcularla»?',
    opciones: [
      'Verla es notarla; calcularla es comprobar que sirve',
      'Son exactamente lo mismo, no hay ninguna diferencia',
      'Calcular es más lento y además menos preciso',
      'No se puede ver una idea sin calcularla antes',
    ],
    correcta: 0,
    explica: 'Reconocer el patrón es el chispazo; calcular es el trabajo de confirmar que en esta posición concreta funciona. Muchos errores vienen de jugar el chispazo sin hacer el trabajo.',
  },
  {
    id: 'cal_precision_finales', area: 'calculo', peso: 4, tipo: 'opcion',
    enunciado: '¿Por qué el cálculo en los finales suele pedir más precisión que en el medio juego?',
    opciones: [
      'Porque un solo tiempo cambia el resultado',
      'Porque en los finales las piezas se mueven distinto',
      'Porque en los finales no hay nada que calcular',
      'Porque el reloj corre más rápido en los finales',
    ],
    correcta: 0,
    explica: 'Con pocas piezas no hay con qué compensar un error: la diferencia entre ganar y empatar suele ser una casilla o un turno. En el medio juego un error se disimula; en el final, no.',
  },
  {
    id: 'cal_entrenar_puzles', area: 'calculo', peso: 1, tipo: 'opcion',
    enunciado: '¿Cuál es una de las formas más efectivas de entrenar la capacidad de cálculo?',
    opciones: [
      'Resolver ejercicios tácticos con regularidad',
      'Memorizar únicamente variantes de apertura',
      'Jugar solo partidas rapidísimas, sin pensar',
      'No analizar nunca las propias partidas',
    ],
    correcta: 0,
    explica: 'Los puzles entrenan las dos mitades: reconocer el patrón y calcular hasta confirmarlo. Y conviene resolverlos sin mover las piezas, que es como hay que hacerlo en la partida.',
  },

  /* ---------------- Maestría ---------------- */
  {
    id: 'mae_titulos_fide', area: 'maestria', peso: 1, tipo: 'opcion',
    enunciado: 'Entre los títulos oficiales de la FIDE, ¿cuál es el de mayor jerarquía?',
    opciones: [
      'Gran Maestro (GM)',
      'Maestro Internacional',
      'Maestro FIDE (FM)',
      'Candidato a Maestro',
    ],
    correcta: 0,
    explica: 'De mayor a menor: Gran Maestro, Maestro Internacional, Maestro FIDE y Candidato a Maestro. Se consiguen con normas en torneos y un Elo mínimo, y una vez otorgados no se pierden.',
  },
  {
    id: 'mae_pgn', area: 'maestria', peso: 1, tipo: 'opcion',
    enunciado: '¿Qué es el formato PGN, usado para guardar partidas de ajedrez?',
    opciones: [
      'Un archivo de texto con las jugadas y los datos',
      'Un tipo particular de reloj digital de torneo',
      'El nombre de uno de los motores más conocidos',
      'Un formato solo para imágenes de tableros',
    ],
    correcta: 0,
    explica: 'PGN quiere decir Portable Game Notation: texto plano con las jugadas más los datos de la partida (jugadores, fecha, resultado). Lo abre cualquier programa, y por eso es el formato en que se comparten partidas.',
  },
  {
    id: 'mae_round_robin', area: 'maestria', peso: 1, tipo: 'opcion',
    enunciado: '¿Cómo se llama el formato de torneo en el que cada jugador enfrenta a todos los demás?',
    opciones: [
      'Todos contra todos (round robin)',
      'Sistema suizo de emparejamiento',
      'Eliminación directa por rondas',
      'Sistema Scheveningen por equipos',
    ],
    correcta: 0,
    explica: 'Cada participante juega contra cada uno de los demás, una o dos veces. Es el formato más justo, pero solo sirve para grupos chicos: con 30 jugadores harían falta 29 rondas.',
  },
  {
    id: 'mae_capablanca', area: 'maestria', peso: 1, tipo: 'opcion',
    enunciado: 'El excampeón mundial cubano José Raúl Capablanca es especialmente recordado por…',
    opciones: [
      'Su técnica clarísima y precisa en los finales',
      'Ser el primero en usar relojes en el ajedrez',
      'Haber inventado la regla del enroque largo',
      'No haber perdido jamás ni una sola partida',
    ],
    correcta: 0,
    explica: 'Su juego parecía fácil: cambiaba a finales que sabía ganar y los ganaba sin aspavientos. Sus finales se siguen usando como material de enseñanza casi un siglo después.',
  },
  {
    id: 'mae_deep_blue', area: 'maestria', peso: 1, tipo: 'opcion',
    enunciado: '¿Qué ocurrió en el famoso enfrentamiento entre Garry Kaspárov y la computadora Deep Blue en 1997?',
    opciones: [
      'Ganó Deep Blue, y fue un hito histórico',
      'Kaspárov ganó sin perder ninguna partida',
      'El match se suspendió sin ningún resultado',
      'Fue la primera vez que se usó reloj digital',
    ],
    correcta: 0,
    explica: 'La máquina de IBM venció al campeón del mundo en un match a seis partidas. Fue la primera vez que una computadora le ganaba un match al mejor jugador humano del momento.',
  },
  {
    id: 'mae_incremento', area: 'maestria', peso: 2, tipo: 'opcion',
    enunciado: 'En un reloj con «incremento» —por ejemplo 90 minutos + 30 segundos—, ¿qué significa ese segundo número?',
    opciones: [
      'Se suman esos segundos después de cada jugada',
      'El reloj sube esa cantidad una sola vez, al inicio',
      'El rival pierde ese tiempo en cada jugada suya',
      'La partida dura como mucho esos segundos extra',
    ],
    correcta: 0,
    explica: 'Cada vez que el jugador completa una jugada, el reloj le devuelve esos segundos. Existe para que nadie pierda una posición ganada por no tener tiempo material de mover las piezas.',
  },
  {
    id: 'mae_suizo', area: 'maestria', peso: 2, tipo: 'opcion',
    enunciado: '¿Cómo funciona el «sistema suizo» en un torneo?',
    opciones: [
      'Empareja por puntaje parecido, sin eliminar a nadie',
      'Los que pierden quedan eliminados del torneo',
      'Todos enfrentan a todos los demás, una sola vez',
      'Se juega una única partida eliminatoria por ronda',
    ],
    correcta: 0,
    explica: 'En cada ronda se enfrentan los que llevan puntaje parecido, y nadie queda fuera: todos juegan todas las rondas. Es lo que permite correr un torneo de 200 personas en nueve rondas.',
  },
  {
    id: 'mae_evaluacion_motor', area: 'maestria', peso: 2, tipo: 'opcion',
    enunciado: 'Cuando un motor de ajedrez muestra «+1.5» para las blancas, ¿qué quiere decir?',
    opciones: [
      'Que llevan ventaja de algo más de un peón',
      'Que están a 1.5 jugadas de dar jaque mate',
      'Que a la partida le quedan 1.5 horas de juego',
      'Que hay 1.5 piezas atacadas en el tablero',
    ],
    correcta: 0,
    explica: 'Los motores miden en «peones»: +1.5 es una ventaja de peón y medio. No garantiza ganar — con +1.5 se pierden partidas todos los días —, es una estimación de cuánto mejor está una posición.',
  },
  {
    id: 'mae_partida_del_siglo', area: 'maestria', peso: 2, tipo: 'opcion',
    enunciado: '¿Por qué se conoce como «la Partida del Siglo» a Donald Byrne contra Bobby Fischer, de 1956?',
    opciones: [
      'Porque Fischer, con 13 años, sacrificó la dama',
      'Porque fue la partida más larga que se registró',
      'Porque terminó en tablas por ahogado del rey',
      'Porque se jugó entera sin reloj de ajedrez',
    ],
    correcta: 0,
    explica: 'Fischer tenía trece años y entregó la dama contra un maestro adulto, con una combinación que se veía muchas jugadas más adelante. Es la partida con la que se le presentó al mundo.',
  },
  {
    id: 'mae_ajedrez960', area: 'maestria', peso: 2, tipo: 'opcion',
    enunciado: '¿En qué consiste el «Ajedrez960» (Fischer Random), inventado por Bobby Fischer?',
    opciones: [
      'La fila de piezas se sortea antes de empezar',
      'Se juega con 960 peones extra sobre el tablero',
      'El tablero tiene 960 casillas en lugar de 64',
      'Cada jugador tiene 9 minutos con 60 de incremento',
    ],
    correcta: 0,
    explica: 'Las piezas de la primera fila se ordenan al azar entre 960 posiciones válidas —los peones no se mueven de sitio—, así que la teoría memorizada no sirve y hay que pensar desde la jugada 1. Era justo lo que a Fischer le molestaba del ajedrez de su época.',
  },
  {
    id: 'mae_elo_que_mide', area: 'maestria', peso: 3, tipo: 'opcion',
    enunciado: '¿Qué mide, en términos generales, el sistema de puntuación Elo?',
    opciones: [
      'La fuerza estimada a partir de los resultados',
      'Cuántas partidas lleva jugadas alguien en su vida',
      'El tiempo total que dedicó una persona al ajedrez',
      'La edad mínima para poder competir en torneos',
    ],
    correcta: 0,
    explica: 'Es un número que sale de contra quién se jugó y cómo terminó. Ganarle a alguien mucho más fuerte suma bastante; ganarle a alguien mucho más débil, casi nada.',
  },
  {
    id: 'mae_libro_aperturas', area: 'maestria', peso: 3, tipo: 'opcion',
    enunciado: '¿Qué es el «libro de aperturas» que usan los motores y las bases de datos?',
    opciones: [
      'Jugadas de apertura ya conocidas, guardadas aparte',
      'Un libro de papel obligatorio en los torneos',
      'La lista de jugadas prohibidas por el reglamento',
      'El manual de instrucciones del programa',
    ],
    correcta: 0,
    explica: 'Son líneas ya analizadas que el motor consulta en vez de calcular: al principio de la partida hay demasiadas opciones y poco que decidir. Cuando se sale del libro, empieza a pensar.',
  },
  {
    id: 'mae_partida_inmortal', area: 'maestria', peso: 3, tipo: 'opcion',
    enunciado: '¿Por qué se conoce como «la Partida Inmortal» a Anderssen contra Kieseritzky, de 1851?',
    opciones: [
      'Porque Anderssen dio mate tras entregar casi todo',
      'Porque la partida pasó de las doscientas jugadas',
      'Porque terminó en tablas por triple repetición',
      'Porque fue la primera partida jugada con reloj',
    ],
    correcta: 0,
    explica: 'Anderssen sacrificó las dos torres, un alfil y la dama, y dio mate con las tres piezas menores que le quedaban. Es la partida romántica por excelencia: hoy se sabe que la defensa negra no fue la mejor, y no le quita nada.',
  },
  {
    id: 'mae_valores_relativos', area: 'maestria', peso: 3, tipo: 'opcion',
    enunciado: 'Los valores de las piezas (peón 1, menor 3, torre 5, dama 9) son útiles, pero ¿qué hay que recordar en niveles avanzados?',
    opciones: [
      'Que son una guía: la posición puede cambiarlo todo',
      'Que son exactos y no cambian nunca con la posición',
      'Que solo valen en el medio juego, nunca en finales',
      'Que el valor de una pieza depende de su color',
    ],
    correcta: 0,
    explica: 'Un caballo instalado en una casilla fuerte puede valer más que una torre pasiva. Los números sirven para decidir rápido en un cambio, no para evaluar una posición.',
  },
  {
    id: 'mae_jugada_ilegal', area: 'maestria', peso: 3, tipo: 'opcion',
    enunciado: 'Según las reglas actuales de la FIDE, si alguien hace una jugada ilegal por primera vez en una partida con árbitro, ¿qué suele pasar?',
    opciones: [
      'Se corrige la posición y el rival gana tiempo',
      'Pierde la partida de inmediato, sin excepción',
      'No pasa nada: la jugada se da por válida',
      'Se vuelve a empezar la partida desde cero',
    ],
    correcta: 0,
    explica: 'Se restablece la posición y se le añade tiempo al rival. La derrota directa queda para la reincidencia, y en partidas rápidas la sanción es más dura: conviene leer el reglamento del torneo antes de jugarlo.',
  },
  {
    id: 'mae_fortaleza', area: 'maestria', peso: 4, tipo: 'opcion',
    enunciado: 'En finales con mucha diferencia de material, ¿qué es una «fortaleza»?',
    opciones: [
      'Una defensa que da tablas porque no hay cómo abrirla',
      'Una apertura especialmente sólida contra cualquier cosa',
      'Un patrón de mate que se da con la torre y el alfil',
      'Una regla que prohíbe sacrificar la dama en el final',
    ],
    correcta: 0,
    explica: 'El bando con menos material se encierra en una estructura que el rival no puede abrir, y por mucho que tenga de más no progresa. Es tablas con una pieza de menos, y por eso hay que reconocerla antes de entrar en ella — o antes de dejar que el rival la arme.',
  },
  {
    id: 'mae_buchholz', area: 'maestria', peso: 4, tipo: 'opcion',
    enunciado: 'En un torneo suizo, si dos jugadores empatan en puntos, ¿qué se suele usar para desempatarlos?',
    opciones: [
      'Un desempate como el Buchholz, por los rivales',
      'Siempre se juega una partida de desempate',
      'Queda primero el jugador de mayor edad',
      'Se reparte el primer lugar sin ningún criterio',
    ],
    correcta: 0,
    explica: 'El Buchholz suma los puntos que hicieron los rivales que uno enfrentó: premia a quien sacó los mismos puntos contra gente más fuerte. Se conocen antes de empezar y están en el reglamento del torneo.',
  },
  {
    id: 'mae_gambito_evans', area: 'maestria', peso: 4, tipo: 'opcion',
    enunciado: '1.e4 e5 2.Cf3 Cc6 3.Ac4 Ac5 4.b4 es el…',
    opciones: [
      'Gambito Evans',
      'Gambito de Rey',
      'Gambito de Dama',
      'Gambito Letón',
    ],
    correcta: 0,
    explica: 'Dentro de la Italiana, las blancas ofrecen el peón de b para desviar al alfil y ganar tiempo para armar el centro con c3 y d4. Es una de las aperturas más agresivas del repertorio clásico.',
  },
  {
    id: 'mae_tablebases', area: 'maestria', peso: 4, tipo: 'opcion',
    enunciado: '¿Qué son las «tablas de finales» (endgame tablebases) generadas por computadora?',
    opciones: [
      'El resultado exacto de cada posición con pocas piezas',
      'Un tipo de reloj especial que se usa en los finales',
      'Un tope de jugadas tras el cual la partida es tablas',
      'Un manual impreso con los finales clásicos',
    ],
    correcta: 0,
    explica: 'Para posiciones de hasta siete piezas, están todas calculadas: se sabe el resultado con juego perfecto y la mejor jugada. Descubrieron mates forzados de más de quinientas jugadas que ningún humano habría encontrado.',
  },
  {
    id: 'mae_finales_torre_precision', area: 'maestria', peso: 4, tipo: 'opcion',
    enunciado: '¿Por qué hasta los grandes maestros cometen errores en finales de torre que parecen sencillos?',
    opciones: [
      'Porque piden una precisión extrema: un tiempo decide',
      'Porque en esos finales rigen reglas distintas',
      'Porque los finales de torre no se estudian nunca',
      'Porque en ellos el reloj se detiene automáticamente',
    ],
    correcta: 0,
    explica: 'Son los finales más frecuentes y de los más difíciles: una casilla de diferencia en la torre convierte una victoria en tablas. De ahí el dicho de que todos los finales de torre son tablas — que tampoco es cierto, pero explica la fama.',
  },
  {
    id: 'mae_zugzwang_reciproco', area: 'maestria', peso: 5, tipo: 'opcion',
    enunciado: '¿Qué es un «zugzwang recíproco» o mutuo?',
    opciones: [
      'Una posición donde pierde el que tenga que mover',
      'Un zugzwang que solo puede afectar a las blancas',
      'Una posición en la que nadie puede caer en zugzwang',
      'Un tipo de tablas que se declaran de forma automática',
    ],
    correcta: 0,
    explica: 'Está tan ajustada que el turno es una desgracia para quien lo tenga, sea quien sea. Es la base de las casillas correspondientes y de casi todos los estudios finos de finales de peones.',
  },
  {
    id: 'mae_elo_200', area: 'maestria', peso: 5, tipo: 'opcion',
    enunciado: 'En el sistema Elo, si alguien tiene unos 200 puntos más que su rival, ¿qué porcentaje de los puntos en juego suele sacarle a la larga?',
    opciones: [
      'Alrededor del 75% de los puntos',
      'El 100%: gana siempre, sin excepción',
      'Cerca del 50%: es prácticamente igual',
      'Menos del 25% de los puntos en juego',
    ],
    correcta: 0,
    explica: 'La fórmula predice un 75% con 200 puntos de diferencia: de cuatro partidas, tres. Cualquier partida suelta puede terminar como sea, y ahí está la gracia de jugar contra alguien más fuerte.',
  },
  {
    id: 'mae_berlinesa', area: 'maestria', peso: 5, tipo: 'opcion',
    enunciado: '1.e4 e5 2.Cf3 Cc6 3.Ab5 Cf6, dentro de la Española, corresponde a la Defensa…',
    opciones: [
      'Berlinesa',
      'Marshall',
      'Arkhangelsk',
      'Schliemann',
    ],
    correcta: 0,
    explica: 'Tiene fama de sólida hasta el aburrimiento. Kramnik la usó para sacarle el título a Kaspárov en 2000 sin perder una partida, y desde entonces no se fue más de la élite.',
  },
  {
    id: 'mae_teoria_juegos', area: 'maestria', peso: 5, tipo: 'opcion',
    enunciado: 'Desde la teoría de juegos, ¿qué se sabe sobre el resultado del ajedrez jugado a la perfección por los dos bandos?',
    opciones: [
      'Que tiene un resultado fijo, pero no se sabe cuál',
      'Que ganan las blancas, y ya está bien demostrado',
      'Que son tablas, y eso ya está también demostrado',
      'Que no hay resultado teórico: todo depende del azar',
    ],
    correcta: 0,
    explica: 'Es un juego finito, sin azar y con información perfecta, así que el teorema de Zermelo garantiza que el resultado existe. Pero hay más posiciones que átomos en el universo observable, y por eso nadie sabe cuál es.',
  },
  {
    id: 'mae_motores_preparacion', area: 'maestria', peso: 5, tipo: 'opcion',
    enunciado: 'En el ajedrez de élite actual, ¿qué papel cumplen los motores en la preparación de aperturas?',
    opciones: [
      'Sirven para analizar líneas larguísimas de antemano',
      'Están prohibidos en cualquier fase de preparación',
      'Solo se pueden usar durante la partida, nunca antes',
      'No influyen en cómo se prepara un profesional',
    ],
    correcta: 0,
    explica: 'Se preparan variantes concretas hasta la jugada veinte o más, en casa y con el motor. Por eso en la élite hay partidas donde la primera jugada pensada de verdad llega pasada la jugada 20.',
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

  /* Cuántos ítems de cada peso lleva cada área. Es igual en las nueve, y esa es
     la clave de la medición: como cada área aporta un ítem de peso 4 y uno de
     peso 5, la prueba entera tiene nueve preguntas de cada escalón difícil, que
     es lo que permite decir "hasta dónde llega" en vez de "cuántas acertó".
     Antes el techo era el peso 3 —contenido de club— y por eso un jugador de
     1400 y uno de 2300 sacaban los dos la misma nota. */
  const FORMA = { 1: 1, 2: 2, 3: 2, 4: 1, 5: 1 };
  /* Las áreas salen de js/plan-entrenamiento.js y no de una lista escrita acá:
     al sumar la novena (Maestría) esta lista se habría quedado en ocho sin que
     nada fallara — la prueba simplemente no habría preguntado nada de esa área
     y el informe la habría pintado en cero. */
  const AREAS = (window.PlanEntrenamiento && window.PlanEntrenamiento.AREAS.map((a) => a.id))
    || ['reglas', 'material', 'apertura', 'tactica', 'mate', 'finales', 'estrategia', 'calculo', 'maestria'];
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
