/* ===== Ajedrez Integral — Banco de ítems del diagnóstico de nivel =====
 *
 * 56 ítems repartidos en las 8 áreas de js/plan-entrenamiento.js (7 por área),
 * con tres niveles de dificultad (peso 1, 2 y 3). Se mezclan dos formas de
 * preguntar, porque miden cosas distintas:
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
      'En forma de L: dos casillas en una dirección y una perpendicular, y puede saltar piezas.',
      'En diagonal, tan lejos como quiera, sin saltar piezas.',
      'Una casilla en cualquier dirección.',
      'En línea recta por su fila o su columna.',
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
      'En línea recta por su fila o su columna, tantas casillas como quiera mientras estén libres.',
      'En diagonal, sin límite de casillas.',
      'En forma de L, como el caballo.',
      'Una sola casilla por turno, en cualquier dirección.',
    ],
    correcta: 0,
    explica: 'La torre se detiene en la primera pieza que encuentra en su camino: no puede saltar, a diferencia del caballo.',
  },
  {
    id: 'reg_promocion', area: 'reglas', peso: 2, tipo: 'opcion',
    enunciado: 'Un peón que llega a la última fila puede coronar en…',
    opciones: [
      'Dama, torre, alfil o caballo (nunca rey ni peón).',
      'Solo dama.',
      'Solo dama o caballo.',
      'Cualquier pieza, incluido el rey.',
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
      'Es ganar la calidad (2 puntos de ventaja): normalmente conviene.',
      'Es un cambio parejo: da igual hacerlo que no.',
      'Es perder la calidad: conviene evitarlo.',
      'Es un cambio prohibido por las reglas.',
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
      'Dos torres (10 puntos) suelen ser algo más fuertes que una dama (9), aunque depende de la posición.',
      'Una dama siempre gana a dos torres, sin excepción.',
      'Da exactamente igual en cualquier posición.',
      'Dos torres nunca pueden ganarle a una dama.',
    ],
    correcta: 0,
    explica: 'Como referencia de valores, dos torres superan ligeramente a una dama, pero la coordinación de las piezas pesa tanto como la suma de puntos.',
  },
  {
    id: 'mat_pareja_alfiles', area: 'material', peso: 3, tipo: 'opcion',
    enunciado: '¿Por qué se considera valiosa la "pareja de alfiles" en posiciones abiertas?',
    opciones: [
      'Porque juntos controlan casillas de ambos colores y se complementan; uno solo únicamente domina las de su color.',
      'Porque un alfil vale más que un caballo en cualquier posición.',
      'Porque los alfiles no se pueden cambiar por otras piezas.',
      'Porque solo pueden atacar al rey rival.',
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
      'Sacar la dama para atacar cuanto antes.',
      'Avanzar los peones de las columnas de las torres.',
      'Cambiar todas las piezas que se pueda.',
    ],
    correcta: 0,
    explica: 'Centro, desarrollo y rey seguro: con eso solo, una apertura ya está bien jugada.',
  },
  {
    id: 'ap_dama_temprano', area: 'apertura', peso: 2, tipo: 'opcion',
    enunciado: '¿Por qué no conviene sacar la dama en las primeras jugadas?',
    opciones: [
      'Porque el rival la ataca desarrollando sus piezas y gana tiempo mientras ella huye.',
      'Porque las reglas no permiten mover la dama antes de la jugada 10.',
      'Porque la dama vale menos en la apertura que en el final.',
      'Porque la dama no puede volver a su casilla.',
    ],
    correcta: 0,
    explica: 'Cada jaque o ataque a tu dama es una jugada de desarrollo gratis para el rival.',
  },
  {
    id: 'ap_pieza_repetida', area: 'apertura', peso: 2, tipo: 'opcion',
    enunciado: 'En la apertura, mover varias veces la misma pieza sin necesidad…',
    opciones: [
      'Pierde tiempo: el rival desarrolla piezas nuevas mientras tú repites.',
      'Es bueno, porque esa pieza queda muy bien colocada.',
      'Da igual: lo que importa es el material.',
      'Solo es malo si la pieza es un peón.',
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
    opciones: ['Española (Ruy López)', 'Siciliana', 'Francesa', 'Escocesa'],
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
      'Sacrificar material temporalmente a cambio de ventaja de desarrollo o iniciativa.',
      'Ganar una pieza gratis sin ninguna compensación.',
      'Evitar por completo el desarrollo de piezas.',
      'Forzar tablas lo antes posible.',
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
      'Una pieza no puede moverse porque dejaría expuesta a otra más valiosa detrás de ella.',
      'Una pieza queda encerrada por sus propios peones.',
      'Dos piezas rivales son atacadas a la vez por una sola.',
      'Un peón llega a la última fila y corona.',
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
      'Qué amenaza esa jugada: jaques, capturas y ataques dobles suyos.',
      'Cuál es tu plan a largo plazo.',
      'Cuánto tiempo te queda en el reloj.',
      'Si puedes cambiar alguna pieza.',
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
      'Cuando una pieza ataca a través de otra hasta un objetivo más valioso (o igual de valioso) detrás.',
      'Cuando dos alfiles se cruzan en el centro del tablero.',
      'Un tipo especial de enroque.',
      'Una apertura poco frecuente.',
    ],
    correcta: 0,
    explica: 'El rayo X es una línea de ataque que atraviesa una pieza para llegar a otra detrás, parecido a la clavada pero visto desde el otro lado.',
  },
  {
    id: 'tac_desviacion', area: 'tactica', peso: 2, tipo: 'opcion',
    enunciado: '¿Cómo se llama la táctica que obliga a una pieza defensora a abandonar la casilla que protegía?',
    opciones: ['Desviación (eliminación del defensor)', 'Enroque', 'Promoción', 'Ahogado'],
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
      'Hacer una ventanita (por ejemplo h2-h3) para que el rey no muera en el pasillo.',
      'Avanzar los tres peones para atacar.',
      'Sacar el rey al centro cuanto antes.',
      'Cambiar la dama siempre que se pueda.',
    ],
    correcta: 0,
    explica: 'Una casilla de escape cuesta un tiempo y evita el mate del pasillo, que es de los finales más frecuentes en torneos escolares.',
  },
  {
    id: 'mate_definicion', area: 'mate', peso: 1, tipo: 'opcion',
    enunciado: '¿Qué significa exactamente "jaque mate"?',
    opciones: [
      'El rey está en jaque y no existe ninguna jugada legal para librarlo.',
      'El rey está en jaque pero todavía puede escapar.',
      'Se acabó el tiempo en el reloj.',
      'El rey fue capturado físicamente del tablero.',
    ],
    correcta: 0,
    explica: 'El rey nunca llega a ser capturado: la partida termina en el instante en que un jaque no tiene ninguna respuesta legal.',
  },
  {
    id: 'mate_sofocado', area: 'mate', peso: 3, tipo: 'opcion',
    enunciado: '¿Cómo se llama el mate en el que el rey está completamente rodeado por sus propias piezas y un caballo da el jaque final?',
    opciones: ['Mate ahogado', 'Mate sofocado (smothered mate)', 'Mate del pasillo', 'Mate de la escalera'],
    correcta: 1,
    explica: 'En el mate sofocado, el rey queda bloqueado por sus propias piezas y un caballo rival —imposible de capturar ni bloquear— le da jaque.',
  },
  {
    id: 'mate_escalera', area: 'mate', peso: 2, tipo: 'opcion',
    enunciado: '¿Cómo se llama la técnica de dar jaque mate con dos torres (o dama y torre), empujando al rey rival fila a fila hacia el borde del tablero?',
    opciones: ['Mate de la escalera (staircase mate)', 'Mate ahogado', 'Enroque largo', 'Gambito de dama'],
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
      'La defensa: la torre va a la tercera fila y baja a dar jaques por detrás cuando el peón avanza.',
      'El ataque: el rey se esconde de los jaques usando su propia torre como puente.',
      'Una posición en la que siempre gana el bando del peón.',
      'La regla que dice que dos torres ganan a una.',
    ],
    correcta: 0,
    explica: 'Philidor defiende (tablas) y Lucena gana (el puente). Saber cuál es cuál salva y gana muchos medios puntos.',
  },
  {
    id: 'fin_rey_activo', area: 'finales', peso: 1, tipo: 'opcion',
    enunciado: 'En los finales, ¿qué suele ser más importante que en la apertura?',
    opciones: [
      'La actividad del rey, que ahora puede acercarse al centro con seguridad.',
      'Enrocar lo antes posible.',
      'Sacar la dama cuanto antes.',
      'Mover los peones de torre.',
    ],
    correcta: 0,
    explica: 'Con menos piezas en el tablero, el rey deja de estar en peligro constante y se convierte en pieza activa clave, sobre todo en finales de peones.',
  },
  {
    id: 'fin_peon_pasado', area: 'finales', peso: 1, tipo: 'opcion',
    enunciado: 'Un "peón pasado" es aquel que…',
    opciones: [
      'No tiene peones rivales que puedan detenerlo en su columna ni en las columnas vecinas.',
      'Ya fue capturado por el rival.',
      'Está clavado por un alfil.',
      'Se movió dos casillas en su primer avance.',
    ],
    correcta: 0,
    explica: 'Un peón pasado no puede ser detenido por ningún peón rival en su camino a coronar, lo que lo hace muy valioso en los finales.',
  },
  {
    id: 'fin_alfiles_distinto_color', area: 'finales', peso: 3, tipo: 'opcion',
    enunciado: '¿Qué hace especialmente difícil de ganar un final de alfiles de distinto color, incluso con material de más?',
    opciones: [
      'Que el bando con más material a veces no puede ganar porque el alfil rival controla las casillas clave de bloqueo.',
      'Que los alfiles no pueden moverse en diagonal en los finales.',
      'Que en ese final los alfiles valen menos que los peones.',
      'Que en ese final las tablas son imposibles.',
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
      'Porque desde el centro las piezas alcanzan más casillas y se mueven de un flanco a otro más rápido.',
      'Porque las reglas dan puntos extra por ocuparlo.',
      'Porque el rey debe quedarse siempre en el centro.',
      'Porque en el centro las piezas no pueden ser capturadas.',
    ],
    correcta: 0,
    explica: 'Un caballo en el centro domina 8 casillas; en una esquina, solo 2.',
  },
  {
    id: 'est_pasado', area: 'estrategia', peso: 3, tipo: 'opcion',
    enunciado: '¿Qué es un peón pasado y por qué es fuerte?',
    opciones: [
      'Un peón sin peones rivales delante ni en las columnas vecinas: nadie puede frenarlo salvo las piezas.',
      'Un peón que ya cruzó la mitad del tablero.',
      'Un peón que capturó al paso.',
      'Un peón doblado en una columna.',
    ],
    correcta: 0,
    explica: 'En los finales, un peón pasado y lejano suele valer más que un peón de más en el mismo flanco.',
  },
  {
    id: 'est_caballo_puesto', area: 'estrategia', peso: 2, tipo: 'opcion',
    enunciado: 'Un caballo llega a una casilla avanzada donde ningún peón rival puede echarlo. ¿Qué has conseguido?',
    opciones: [
      'Un puesto avanzado: una pieza fuerte y estable en campo rival.',
      'Un caballo en peligro que hay que retirar.',
      'Una clavada sobre el rey rival.',
      'Nada en particular: los caballos valen igual en cualquier casilla.',
    ],
    correcta: 0,
    explica: 'Un caballo bien puesto en la quinta o sexta fila, apoyado por un peón, puede valer más que una torre.',
  },
  {
    id: 'est_peon_aislado', area: 'estrategia', peso: 2, tipo: 'opcion',
    enunciado: '¿Qué es un "peón aislado"?',
    opciones: [
      'Un peón sin peones propios en las columnas vecinas que puedan defenderlo.',
      'Un peón que quedó solo en el tablero porque los demás fueron capturados.',
      'Un peón a punto de coronar.',
      'Un peón que se movió dos casillas en su primer avance.',
    ],
    correcta: 0,
    explica: 'Al no tener peones vecinos que lo respalden, el peón aislado suele necesitar protección constante de las piezas, aunque también da movilidad a cambio.',
  },
  {
    id: 'est_alfil_malo', area: 'estrategia', peso: 2, tipo: 'opcion',
    enunciado: '¿Por qué se dice que un alfil es "malo" en ciertas estructuras de peones?',
    opciones: [
      'Porque sus propios peones ocupan casillas del mismo color, bloqueándole las diagonales.',
      'Porque el alfil no puede capturar piezas rivales.',
      'Porque en esa estructura el alfil vale menos que un peón.',
      'Porque no puede moverse en absoluto.',
    ],
    correcta: 0,
    explica: 'Un "alfil malo" queda encerrado por sus propios peones, colocados en casillas del mismo color que el alfil, lo que reduce mucho su actividad.',
  },
  {
    id: 'est_mayoria_flanco', area: 'estrategia', peso: 3, tipo: 'opcion',
    enunciado: 'En estructuras de peones, ¿qué es una "mayoría de peones" en un flanco?',
    opciones: [
      'Tener más peones que el rival en ese sector del tablero, lo que permite crear allí un peón pasado.',
      'Tener todos los peones propios en la última fila.',
      'Tener menos peones que el rival en ese sector.',
      'Un tipo especial de enroque.',
    ],
    correcta: 0,
    explica: 'Una mayoría de peones en un flanco es una ventaja a largo plazo: bien manejada, puede convertirse en un peón pasado que decida el final.',
  },

  /* ---------------- Cálculo y visualización ---------------- */
  {
    id: 'cal_casilla_color', area: 'calculo', peso: 1, tipo: 'opcion',
    enunciado: 'Sin mirar el tablero: ¿de qué color es la casilla f5?',
    opciones: ['Blanca.', 'Negra.', 'Depende del lado desde el que se mire.', 'Ninguna de las dos: f5 no existe.'],
    correcta: 0,
    explica: 'Truco: si la letra y el número son "uno par y otro impar", la casilla es blanca. Saberlo ayuda en los finales de alfiles.',
    prueba: 'color de casilla calculado con la fórmula habitual (columna + fila)',
  },
  {
    id: 'cal_conteo', area: 'calculo', peso: 2, tipo: 'opcion',
    enunciado: 'Una casilla está defendida dos veces y atacada dos veces por ti. ¿Qué hay que contar antes de capturar ahí?',
    opciones: [
      'El valor de las piezas que entran en cada captura, en orden: quién queda ganando al final del cambio.',
      'Solo el número de atacantes: si son dos, siempre se gana.',
      'Solo si el rey rival está cerca.',
      'Nada: capturar siempre conviene.',
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
      'Meter un jaque o una amenaza mayor antes de hacer la recaptura que todos esperan.',
      'Una jugada de peón a mitad de la partida.',
      'La jugada número 20 de la partida.',
      'Repetir la posición para hacer tablas.',
    ],
    correcta: 0,
    explica: 'Al calcular, pregúntate siempre: "¿puedo meter un jaque útil antes de recapturar?". Ahí aparecen medio punto y muchas piezas.',
  },
  {
    id: 'cal_torre_bloqueo', area: 'calculo', peso: 1, tipo: 'opcion',
    enunciado: '¿Puede una torre saltar por encima de otras piezas?',
    opciones: ['No: se detiene en la primera pieza que encuentra en su camino.', 'Sí, siempre.', 'Solo al enrocar.', 'Solo en su primera jugada.'],
    correcta: 0,
    explica: 'Salvo el caballo, ninguna pieza salta por encima de otra: la torre se detiene en la primera pieza que encuentra en su línea de movimiento.',
  },
  {
    id: 'cal_orden_capturas', area: 'calculo', peso: 2, tipo: 'opcion',
    enunciado: 'Al calcular una serie de capturas en una misma casilla, ¿qué principio general conviene seguir?',
    opciones: [
      'Capturar primero con la pieza de menor valor, para no arriesgar piezas valiosas si vienen más cambios.',
      'Capturar siempre primero con la dama.',
      'Nunca capturar con peones.',
      'Capturar siempre con la pieza más valiosa, sin excepción.',
    ],
    correcta: 0,
    explica: 'La regla práctica es "capturar de menor a mayor valor": si la secuencia de cambios se corta a mitad de camino, no arriesgaste tu pieza más valiosa de entrada.',
  },
  {
    id: 'cal_jaques_primero', area: 'calculo', peso: 3, tipo: 'opcion',
    enunciado: 'En el cálculo de variantes forzadas (jaques, capturas, amenazas), ¿por qué conviene analizar primero los jaques?',
    opciones: [
      'Porque limitan mucho las respuestas legales del rival, haciendo el árbol de variantes más manejable.',
      'Porque el jaque siempre gana la partida.',
      'Porque no se puede capturar mientras el propio rey está en jaque.',
      'Porque el jaque solo es obligatorio en los finales.',
    ],
    correcta: 0,
    explica: 'Los jaques son la jugada más forzada posible: reducen mucho las respuestas legales del rival, lo que hace más fácil calcular esa rama con precisión.',
  },
];
