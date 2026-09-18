/* ===== Ajedrez Integral — Banco de preguntas del examen de arbitraje =====
 *
 * Mide el conocimiento del reglamento FIDE de quien arbitra: no es un juego ni
 * un diagnóstico de jugador, es un examen. Vive en herramientas, lo ven solo
 * profesores y administración (arbitraje.html lo vuelve a comprobar).
 *
 * De dónde sale cada respuesta: del Handbook de la FIDE
 * (https://handbook.fide.com). Cada ítem lleva en `fuente` el artículo o el
 * capítulo exacto, y eso es parte del examen: un árbitro no discute de memoria,
 * cita el artículo. Al tocar un ítem hay que volver a contrastarlo con el
 * texto vigente — el reglamento cambia (en 2023, por ejemplo, la sanción por
 * jugada ilegal en rápidas bajó de dos minutos a uno).
 *
 * Áreas (las ocho que cubre un examen de árbitro):
 *   leyes           Leyes del Ajedrez: la partida y el acto de mover (art. 1-5)
 *   reloj           El reloj, el control de tiempo y la bandera (art. 6)
 *   irregularidades Jugadas ilegales y posiciones incorrectas (art. 7)
 *   tablas          Planilla y tablas: reclamos y automatismos (art. 8-9)
 *   conducta        Conducta, dispositivos y sanciones (art. 11-12)
 *   ritmos          Rápidas y relámpago (apéndices A y B)
 *   competicion     Emparejamientos, desempates y organización (C.04, C.07)
 *   titulos         Títulos, categorías y deberes del árbitro (B.06)
 *
 * Peso = escalón de dificultad, de 1 a 5, igual que en el diagnóstico de
 * jugadores: 1-2 es lo que tiene que saber quien dirige un torneo escolar; 3
 * es nivel de árbitro nacional; 4 y 5 son las preguntas que separan a un
 * árbitro FIDE de uno internacional. El nivel estimado sale de hasta qué
 * escalón llega, no del porcentaje (ver js/arbitraje-nivel.js).
 *
 * Regla al escribir opciones: las cuatro miden casi lo mismo. Si la correcta es
 * la más larga, se acierta por el largo y el examen deja de medir.
 */
window.ARBITRAJE_ITEMS = [

  /* ================= Leyes del Ajedrez: la partida ================= */
  {
    id: 'ley_jugada_completada', area: 'leyes', peso: 1,
    enunciado: '¿Cuándo está completada la jugada de un jugador?',
    opciones: [
      'Cuando presiona el reloj después de haber movido.',
      'Cuando suelta la pieza en la casilla de destino.',
      'Cuando el rival levanta su propia pieza para responder.',
      'Cuando termina de anotar la jugada en la planilla.',
    ],
    correcta: 0,
    explica: '"Hecha" y "completada" son dos momentos distintos: la jugada está HECHA al soltar la pieza (art. 4.7), pero queda COMPLETADA recién al presionar el reloj (art. 6.2.1). Antes de presionarlo, todavía se pueden corregir otras irregularidades de esa jugada.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.2.1 (y art. 4.7 para cuándo queda "hecha")',
  },
  {
    id: 'ley_pieza_tocada', area: 'leyes', peso: 1,
    enunciado: 'Un jugador toca una pieza propia que tiene jugada legal. ¿Qué está obligado a hacer?',
    opciones: [
      'A mover esa pieza, si tiene alguna jugada legal.',
      'A mover esa pieza solo si el rival lo reclama.',
      'Nada: la obligación empieza al soltarla.',
      'A mover esa pieza o cualquier otra de igual valor.',
    ],
    correcta: 0,
    explica: 'Pieza tocada, pieza jugada, salvo que el jugador haya avisado "compongo" (j\'adoube) antes de tocarla. Si no tiene jugada legal, la obligación no se aplica.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 4.2 y 4.3',
  },
  {
    id: 'ley_jadoube', area: 'leyes', peso: 1,
    enunciado: '¿Cuándo puede un jugador acomodar sus piezas diciendo "compongo" (j\'adoube)?',
    opciones: [
      'Solo en su turno y antes de tocar la pieza.',
      'En cualquier momento, sea o no su turno.',
      'Solo con permiso del árbitro en cada ocasión.',
      'En su turno, incluso después de tocarla.',
    ],
    correcta: 0,
    explica: 'El aviso va antes de tocar la pieza y solo vale en el propio turno. Dicho después de tocarla, no sirve de nada: la pieza ya está tocada.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 4.2.1',
  },
  {
    id: 'ley_enroque_torre', area: 'leyes', peso: 2,
    enunciado: 'Con intención de enrocar, un jugador toca deliberadamente primero la torre. ¿Qué se aplica?',
    opciones: [
      'No puede enrocar con esa torre: debe mover la torre.',
      'Puede enrocar igual, porque la intención era clara.',
      'Pierde el derecho a enrocar por el resto de la partida.',
      'Debe mover el rey, que es la pieza del enroque.',
    ],
    correcta: 0,
    explica: 'El enroque es una jugada de rey y se toca primero el rey. Tocada la torre, se aplica la regla de pieza tocada y esa torre tiene que moverse.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 4.4.2',
  },
  {
    id: 'ley_enroque_ilegal', area: 'leyes', peso: 3,
    enunciado: 'Un jugador toca el rey con intención de enrocar, pero ese enroque es ilegal. ¿Qué debe hacer?',
    opciones: [
      'Otra jugada de rey, incluso enrocar del otro lado.',
      'Cualquier jugada legal, sin obligación con el rey.',
      'El enroque del otro lado, obligatoriamente.',
      'Nada: la jugada se anula y se vuelve a pensar.',
    ],
    correcta: 0,
    explica: 'Tocó el rey, así que debe mover el rey si tiene jugada legal — y enrocar por el otro lado cuenta como jugada de rey. Solo si el rey no tiene ninguna jugada legal queda libre de elegir otra.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 4.4.3',
  },
  {
    id: 'ley_promocion', area: 'leyes', peso: 2,
    enunciado: 'Un peón llega a la última fila y el jugador suelta ahí un caballo. ¿Cuándo queda completada la promoción?',
    opciones: [
      'Al soltar la pieza nueva en la casilla de coronación.',
      'Al retirar el peón del tablero, antes de poner la pieza.',
      'Cuando el árbitro valida el cambio de pieza.',
      'Cuando el rival acepta la pieza elegida.',
    ],
    correcta: 0,
    explica: 'El peón se cambia como parte de la misma jugada y la promoción queda hecha al soltar la pieza nueva. Elegida y soltada, ya no se cambia.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 4.7.3 y 3.7.5',
  },
  {
    id: 'ley_dead_position', area: 'leyes', peso: 3,
    enunciado: '¿Qué es una "posición muerta" y qué efecto tiene?',
    opciones: [
      'Aquella en la que ningún bando puede dar mate: son tablas.',
      'Aquella en la que los dos reyes quedaron sin peones que coronar.',
      'Aquella en la que se repitió tres veces la misma posición.',
      'Aquella en la que ninguno de los dos quiere seguir jugando.',
    ],
    correcta: 0,
    explica: 'La partida termina ahí mismo, sin reclamo: nadie puede dar mate ni siquiera con la peor serie de jugadas legales del rival (rey contra rey, por ejemplo).',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 5.2.2',
  },
  {
    id: 'ley_rey_en_jaque_final', area: 'leyes', peso: 4,
    enunciado: 'Un jugador da mate con una jugada que además era la única legal, pero no presionó el reloj. ¿Qué pasa?',
    opciones: [
      'La partida terminó al darse el mate: el reloj ya no cuenta.',
      'No vale hasta presionar el reloj; si cae la bandera, pierde.',
      'El árbitro debe presionar el reloj por él para validarla.',
      'El rival puede reclamar que la jugada no fue completada.',
    ],
    correcta: 0,
    explica: 'El mate termina la partida de inmediato, siempre que la jugada que lo produce sea legal. Lo mismo vale para el ahogado: presionar el reloj ya no juega ningún papel.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 5.1.1 y 5.2.1',
  },
  {
    id: 'ley_al_paso', area: 'leyes', peso: 2,
    enunciado: '¿Cuándo se puede capturar al paso?',
    opciones: [
      'Solo en la jugada inmediatamente siguiente al avance doble.',
      'En cualquier momento mientras el peón siga en esa casilla.',
      'Solo si el peón que avanzó dos casillas ya dio jaque.',
      'Mientras no se haya movido ninguna otra pieza propia.',
    ],
    correcta: 0,
    explica: 'El derecho dura una sola jugada: si no se ejerce ahí, se pierde. Es uno de los tres datos que la posición necesita además de las piezas, junto con el turno y los enroques posibles.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 3.7.4.1 y 3.7.4.2',
  },
  {
    id: 'ley_jugada_rival', area: 'leyes', peso: 3,
    enunciado: 'Un jugador toca deliberadamente una pieza del rival que no puede capturar legalmente. ¿Qué corresponde?',
    opciones: [
      'No está obligado a capturarla; la conducta sí se sanciona.',
      'Pierde la partida por tocar piezas del rival sin permiso.',
      'Debe capturarla igual, aunque la jugada resulte ilegal.',
      'No pasa nada de nada: tocar no obliga absolutamente a nada.',
    ],
    correcta: 0,
    explica: 'La obligación de capturar existe solo si la captura es legal. Si no lo es, la jugada sigue normal, pero tocar piezas del rival sin necesidad es conducta que el árbitro puede sancionar.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 4.3.2 y 4.5',
  },
  {
    id: 'ley_dos_manos', area: 'leyes', peso: 4,
    enunciado: 'Un jugador enroca usando las dos manos —una para el rey y otra para la torre— y presiona el reloj. ¿Qué hace el árbitro?',
    opciones: [
      'Declara la jugada ilegal y suma dos minutos al rival.',
      'Nada, mientras las dos piezas terminen en su casilla.',
      'Sanciona la conducta, pero deja la jugada tal como está.',
      'Obliga a deshacer el enroque y a mover solo el rey.',
    ],
    correcta: 0,
    explica: 'Cada jugada se hace con una sola mano (art. 4.1). Usarlas las dos y ya haber presionado el reloj se trata y se sanciona exactamente como una jugada ilegal, con el mismo procedimiento del art. 7.5.5: se repone la posición y, la primera vez, se dan dos minutos extra al rival.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.5.4 y 7.5.5',
  },
  {
    id: 'ley_abandono', area: 'leyes', peso: 5,
    enunciado: 'Un jugador abandona, pero en el tablero su rival no tenía ninguna serie de jugadas legales para dar mate. ¿Cuál es el resultado?',
    opciones: [
      'Tablas, porque el rival no podía dar mate de ninguna forma.',
      'Pierde el que abandonó: el abandono cierra la partida.',
      'El árbitro anula el abandono y la partida continúa.',
      'Tablas, pero solo si el que abandonó lo reclama enseguida.',
    ],
    correcta: 0,
    explica: 'El abandono trae la misma salvedad que la caída de bandera: el propio artículo lo dice de corrido —"unless the position is such that the opponent cannot checkmate the player\'s king by any possible series of legal moves. In this case the result of the game is a draw"—. Quien abandona no elige el resultado por su cuenta: si el rival no podía dar mate de ninguna forma, son tablas igual.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 5.1.2',
  },

  /* ================= El reloj y el tiempo ================= */
  {
    id: 'rel_bandera_sin_material', area: 'reloj', peso: 2,
    enunciado: 'Cae la bandera de un jugador. Su rival no tiene material para dar mate por ninguna serie de jugadas legales. ¿Resultado?',
    opciones: [
      'Tablas.',
      'Gana el que tiene tiempo.',
      'Gana quien tenga más material en el tablero.',
      'La partida sigue hasta el mate.',
    ],
    correcta: 0,
    explica: 'La caída de bandera hace perder salvo que el rival no pudiera dar mate ni con la peor defensa posible. La prueba es "cualquier serie de jugadas legales", no "con juego razonable".',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.9',
  },
  {
    id: 'rel_quien_reclama', area: 'reloj', peso: 3,
    enunciado: 'En una partida de ritmo clásico con árbitro presente, cae una bandera y nadie dice nada. ¿Qué corresponde?',
    opciones: [
      'El árbitro la declara, sin esperar un reclamo.',
      'Solo vale si el rival la reclama antes de mover.',
      'Se espera a que terminen la partida y se revisa.',
      'La partida sigue: sin reclamo no hay bandera.',
    ],
    correcta: 0,
    explica: 'En ritmo clásico el árbitro aplica las Leyes de oficio, y la caída de bandera es un hecho observable. En relámpago, en cambio, la bandera la reclama el jugador.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.8 y 12.2 (comparar con el apéndice B)',
  },
  {
    id: 'rel_default', area: 'reloj', peso: 2,
    enunciado: 'El reglamento del torneo no dice nada sobre el tiempo de incomparecencia. ¿Cuál es entonces?',
    opciones: [
      'Cero: quien llega tarde pierde, salvo decisión del árbitro.',
      'Una hora, que era el valor por defecto de las Leyes viejas.',
      'Treinta minutos contados desde el inicio de la ronda.',
      'La mitad del tiempo de reflexión de cada jugador.',
    ],
    correcta: 0,
    explica: 'Si el reglamento no fija otro, el tiempo de incomparecencia es cero — la llamada "tolerancia cero". El árbitro conserva la facultad de decidir otra cosa en un caso puntual.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.7',
  },
  {
    id: 'rel_reloj_mano', area: 'reloj', peso: 1,
    enunciado: '¿Con qué mano debe presionar el reloj un jugador?',
    opciones: [
      'Con la misma mano con la que hizo la jugada.',
      'Con cualquiera de las dos, según prefiera.',
      'Con la mano que tenga libre en ese momento.',
      'Con la izquierda, para no tapar la planilla.',
    ],
    correcta: 0,
    explica: 'Una sola mano para mover y para presionar. Es lo que evita las maniobras de presionar antes de soltar la pieza y las discusiones sobre quién movió primero.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.2.3',
  },
  {
    id: 'rel_defectuoso', area: 'reloj', peso: 3,
    enunciado: 'A mitad de partida se descubre que el reloj estaba mal configurado. ¿Qué hace el árbitro?',
    opciones: [
      'Corrige el reloj y ajusta los tiempos con su criterio.',
      'Anula la partida y la manda a jugar de nuevo desde cero.',
      'Deja el reloj como está: la partida ya había empezado.',
      'Declara perdedor a quien puso el reloj en marcha.',
    ],
    correcta: 0,
    explica: 'El árbitro repone el reloj y fija los tiempos usando su mejor criterio, que es exactamente lo que las Leyes le piden en las situaciones que el texto no cubre al detalle.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.10 y 6.11',
  },
  {
    id: 'rel_incremento', area: 'reloj', peso: 2,
    enunciado: 'El control es 90 minutos con incremento de 30 segundos desde la jugada 1. ¿Cuándo se acredita el incremento?',
    opciones: [
      'Al completar cada jugada, incluida la primera.',
      'Solo a partir de la jugada 40, con el segundo control.',
      'Al comenzar la partida, todo junto y por adelantado.',
      'Únicamente cuando quedan menos de cinco minutos.',
    ],
    correcta: 0,
    explica: 'El incremento se suma jugada a jugada desde la primera, y por eso un control con incremento de 30 segundos obliga a anotar toda la partida: nunca se entra en el supuesto de dejar de anotar.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.3.1',
  },
  {
    id: 'rel_presionar_sin_mover', area: 'reloj', peso: 4,
    enunciado: 'Un jugador presiona el reloj sin haber hecho ninguna jugada. ¿Qué corresponde?',
    opciones: [
      'Se trata y se sanciona igual que una jugada ilegal.',
      'El rival gana la partida de inmediato, sin aviso.',
      'Nada: el reloj corre y ya, es problema suyo.',
      'Se le descuentan dos minutos de forma automática.',
    ],
    correcta: 0,
    explica: 'El propio artículo lo dice sin rodeos: presionar el reloj sin mover "shall be considered and penalised as if an illegal move". Se aplica el procedimiento del 7.5.5: se repone la posición y, la primera vez, se dan dos minutos extra al rival.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.5.3 y 7.5.5',
  },
  {
    id: 'rel_parar_reloj', area: 'reloj', peso: 3,
    enunciado: '¿En qué caso puede un jugador detener ambos relojes?',
    opciones: [
      'Para llamar al árbitro, o cuando las Leyes lo permiten.',
      'Cada vez que quiera pensar con un poco más de calma.',
      'Nunca: solo el árbitro puede tocar los relojes de la sala.',
      'Cuando su rival se levanta y deja la mesa sola un rato.',
    ],
    correcta: 0,
    explica: 'Parar el reloj es el gesto para reclamar la presencia del árbitro; por ejemplo al reclamar tablas por repetición. Fuera de esos casos, detenerlo es una infracción.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.11 y 12.9',
  },
  {
    id: 'rel_ambas_banderas', area: 'reloj', peso: 4,
    enunciado: 'En una partida sin incremento, con las Guías de "Quickplay Finish" anunciadas de antemano, se advierte que cayeron las dos banderas y no se puede saber cuál cayó primero. ¿Qué resultado corresponde?',
    opciones: [
      'La partida sigue, salvo en la última fase: ahí son tablas.',
      'Gana quien tenga mejor posición a juicio del árbitro principal.',
      'Pierden los dos y se les anota media derrota a cada uno.',
      'Gana quien lo reclame primero ante el árbitro de sala.',
    ],
    correcta: 0,
    explica: 'Si las dos banderas cayeron y no se puede determinar el orden, la partida sigue si todavía quedan controles por delante; en la última fase del control, son tablas. Ojo: esto no es del cuerpo de las Leyes, sino de sus Guías (que no aplican solas: hay que haberlas anunciado antes del torneo) y solo valen para partidas SIN incremento.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), Guidelines III.4 (Quickplay Finish)',
  },
  {
    id: 'rel_ajuste_tiempo', area: 'reloj', peso: 5,
    enunciado: 'Un jugador reclama, con razón, que su reloj marcaba mal desde hace varias jugadas. ¿Qué puede hacer el árbitro con los tiempos?',
    opciones: [
      'Corregirlos con su criterio, ajustando los dos relojes.',
      'Solo puede sumar tiempo, nunca restarle tiempo a nadie.',
      'Debe dejarlos como están y anotar el incidente en el acta.',
      'Debe repetir la partida entera desde la posición inicial.',
    ],
    correcta: 0,
    explica: 'Las Leyes le dan al árbitro la facultad de reponer los tiempos con su mejor criterio, incluidos los de quien reclama. El reclamo tardío no obliga a devolver todo el tiempo perdido.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.10.2 y 6.11',
  },
  {
    id: 'rel_llegada_tarde', area: 'reloj', peso: 5,
    enunciado: 'Un jugador llega después del inicio, pero antes del tiempo de incomparecencia fijado. ¿Qué pasa con su reloj?',
    opciones: [
      'Su reloj corrió desde el inicio y no se le repone.',
      'Se le repone el tiempo perdido si avisó del retraso.',
      'El árbitro reinicia los dos relojes cuando llega.',
      'Se le descuenta además una sanción fija de diez minutos.',
    ],
    correcta: 0,
    explica: 'El reloj del ausente arranca a la hora de inicio: el tiempo consumido es suyo. El tiempo de incomparecencia solo marca el límite a partir del cual pierde la partida.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.7',
  },

  /* ================= Irregularidades: jugadas ilegales ================= */
  {
    id: 'irr_primera_ilegal', area: 'irregularidades', peso: 2,
    enunciado: 'Ritmo clásico: un jugador completa su primera jugada ilegal. ¿Qué hace el árbitro?',
    opciones: [
      'Repone la posición, da dos minutos al rival y sigue.',
      'Declara perdida la partida del infractor de inmediato.',
      'Repone la posición y no toca ninguno de los relojes.',
      'Da dos minutos al rival solo si este lo reclama.',
    ],
    correcta: 0,
    explica: 'Primera ilegal completada en clásico: se repone la posición anterior y el rival recibe dos minutos. La jugada queda completada cuando se puso en marcha el reloj del rival.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.5.1 y 7.5.5',
  },
  {
    id: 'irr_segunda_ilegal', area: 'irregularidades', peso: 2,
    enunciado: 'El mismo jugador completa una segunda jugada ilegal en la misma partida. ¿Qué corresponde?',
    opciones: [
      'Pierde, salvo que el rival no pueda dar mate: tablas.',
      'Pierde la partida siempre, sin ninguna excepción.',
      'Otros dos minutos para el rival y la partida sigue.',
      'Pierde solo si el rival lo reclama antes de mover.',
    ],
    correcta: 0,
    explica: 'La segunda ilegal del mismo jugador pierde la partida, con la misma salvedad de siempre: si el rival no puede dar mate por ninguna serie de jugadas legales, son tablas.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.5.5',
  },
  {
    id: 'irr_cuando_completada', area: 'irregularidades', peso: 3,
    enunciado: '¿En qué momento una jugada ilegal queda "completada" a efectos de sanción?',
    opciones: [
      'Cuando puso en marcha el reloj del rival.',
      'Cuando soltó la pieza en la casilla ilegal.',
      'Cuando el rival la advierte y llama al árbitro.',
      'Cuando el rival responde con su propia jugada.',
    ],
    correcta: 0,
    explica: 'Es la diferencia entre corregir sin sanción y sancionar: mientras no presionó el reloj, el jugador todavía puede arreglar su jugada.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.5.1',
  },
  {
    id: 'irr_colores_cambiados', area: 'irregularidades', peso: 4,
    enunciado: 'Se descubre que la partida empezó con los colores cambiados. ¿Qué se hace?',
    opciones: [
      'Con menos de diez jugadas de cada bando, se repite.',
      'Se repite siempre, sin importar cuántas jugadas lleven.',
      'Sigue siempre: los colores ya no se pueden cambiar.',
      'Lo decide el árbitro caso por caso, sin regla fija.',
    ],
    correcta: 0,
    explica: 'El límite son diez jugadas de cada bando. Pasado ese punto, cambiar los colores haría más daño que dejar la partida como está.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.3',
  },
  {
    id: 'irr_posicion_inicial', area: 'irregularidades', peso: 4,
    enunciado: 'A mitad de partida se descubre que la posición inicial de las piezas era incorrecta. ¿Qué corresponde?',
    opciones: [
      'Se anula la partida y se juega una nueva.',
      'Se corrige la posición y la partida sigue desde ahí.',
      'Sigue si ya pasaron diez jugadas de cada bando.',
      'Pierde el jugador que armó mal el tablero.',
    ],
    correcta: 0,
    explica: 'Una posición inicial incorrecta no se arregla a mitad de camino: la partida se cancela y se juega otra. Es distinto del tablero mal orientado o de los colores cambiados.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.2.1',
  },
  {
    id: 'irr_tablero_orientacion', area: 'irregularidades', peso: 3,
    enunciado: 'Ya empezada la partida se ve que el tablero está mal orientado (h1 oscura). ¿Qué se hace?',
    opciones: [
      'Se pasa la posición a un tablero bien puesto y sigue.',
      'Se anula la partida y se juega una nueva desde cero.',
      'Se deja así: cambiarlo ahora alteraría la posición.',
      'Se sanciona con dos minutos a quien armó el tablero.',
    ],
    correcta: 0,
    explica: 'La posición es la misma; lo que está mal es el soporte. Se pasa a un tablero correcto y se sigue jugando, sin anular nada.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.2.2',
  },
  {
    id: 'irr_piezas_desplazadas', area: 'irregularidades', peso: 2,
    enunciado: 'Un jugador vuelca varias piezas al mover. ¿Con qué tiempo las repone?',
    opciones: [
      'Con su propio tiempo.',
      'Con el tiempo del rival, que es quien espera.',
      'Con el reloj parado por el árbitro.',
      'Con tiempo añadido por el árbitro al final.',
    ],
    correcta: 0,
    explica: 'Quien desordena, ordena, y lo hace con su reloj corriendo. Si además lo hace de forma repetida, el árbitro puede sancionarlo por conducta.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.4',
  },
  {
    id: 'irr_ilegal_no_advertida', area: 'irregularidades', peso: 5,
    enunciado: 'Se descubre una jugada ilegal recién varias jugadas después, en ritmo clásico con árbitro. ¿Qué corresponde?',
    opciones: [
      'Se repone la posición anterior y se sanciona lo que corresponda.',
      'La partida sigue sin más: pasó demasiado tiempo desde la irregularidad.',
      'Se anula la partida y los dos jugadores vuelven a jugarla entera.',
      'Pierde la partida el jugador que hizo la jugada ilegal, sin importar cuándo.',
    ],
    correcta: 0,
    explica: 'La regla general de las irregularidades es reponer la posición anterior; cuando reconstruirla es imposible, se parte de la última posición que sí se puede determinar y la partida continúa.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.1 y 7.5',
  },
  {
    id: 'irr_rey_en_jaque', area: 'irregularidades', peso: 3,
    enunciado: 'Un jugador deja su propio rey en jaque y presiona el reloj. ¿Cómo se trata?',
    opciones: [
      'Como jugada ilegal completada, con su sanción.',
      'Como conducta indebida, con advertencia del árbitro.',
      'Como jugada nula que se repite sin ninguna sanción.',
      'Como derrota inmediata por dejar el rey en jaque.',
    ],
    correcta: 0,
    explica: 'Dejar el propio rey atacado es una jugada ilegal como cualquier otra: reposición, y el conteo de primera o segunda ilegal según corresponda.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 3.9.2 y 7.5',
  },
  {
    id: 'irr_promocion_sin_pieza', area: 'irregularidades', peso: 5,
    enunciado: 'Un jugador corona, no tiene dama a mano y presiona el reloj con el peón todavía en la octava. ¿Qué es?',
    opciones: [
      'Ilegal: la promoción no se completó al presionar.',
      'Válida: el peón coronado se considera dama por defecto.',
      'Válida, pero el rival puede exigir que sea caballo.',
      'Conducta sancionable, aunque la jugada sea legal.',
    ],
    correcta: 0,
    explica: 'El peón no puede quedarse en la octava: hasta que la pieza nueva no está puesta, la jugada no está hecha. Presionar el reloj así la vuelve ilegal, y el propio artículo da la solución: el peón se cambia por dama de forma automática.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 4.7 y 7.5.2',
  },
  {
    id: 'irr_ilegal_ambos', area: 'irregularidades', peso: 4,
    enunciado: 'Cada jugador completó una jugada ilegal a lo largo de la partida. ¿Cómo se cuentan?',
    opciones: [
      'Por separado: el conteo es de cada jugador, no de la partida.',
      'Se compensan entre sí y ninguna de las dos llega a sancionarse.',
      'La segunda de la partida pierde, sea del jugador que sea.',
      'Se suman: con dos ilegales en la partida, se acuerdan tablas.',
    ],
    correcta: 0,
    explica: 'La cuenta es individual. Solo la segunda ilegal del MISMO jugador pierde la partida.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.5.5',
  },

  /* ================= Planilla y tablas ================= */
  {
    id: 'tab_anotar_obligacion', area: 'tablas', peso: 1,
    enunciado: '¿Qué está obligado a anotar cada jugador en su planilla?',
    opciones: [
      'Sus jugadas y las del rival, legibles y jugada a jugada.',
      'Solo sus propias jugadas, en la notación que prefiera.',
      'Solo las jugadas hasta el primer control de tiempo.',
      'Las jugadas y el tiempo del reloj después de cada una.',
    ],
    correcta: 0,
    explica: 'Las dos columnas, jugada a jugada, en la notación algebraica del apéndice C y de forma legible. La planilla es documento del torneo, no una nota personal.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 8.1.1',
  },
  {
    id: 'tab_dejar_de_anotar', area: 'tablas', peso: 3,
    enunciado: '¿Cuándo puede un jugador dejar de anotar?',
    opciones: [
      'Con menos de cinco minutos y sin incremento de 30 segundos o más.',
      'Con menos de cinco minutos, siempre, haya o no incremento.',
      'Cuando el árbitro lo autorice expresamente, en cualquier momento.',
      'A partir de la jugada 40, superado el primer control.',
    ],
    correcta: 0,
    explica: 'Las dos condiciones a la vez. Con incremento de 30 segundos por jugada no hay excusa: se anota toda la partida.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 8.4',
  },
  {
    id: 'tab_triple_repeticion', area: 'tablas', peso: 2,
    enunciado: 'Para reclamar tablas por triple repetición, ¿qué debe repetirse?',
    opciones: [
      'La posición, con el mismo turno y los mismos derechos.',
      'Las mismas tres jugadas seguidas de cada uno de los bandos.',
      'La misma posición tres veces, sin importar a quién le toque.',
      'El mismo jaque, repetido tres veces por el mismo bando.',
    ],
    correcta: 0,
    explica: 'Tres veces la misma posición, entendida como piezas, turno, enroques posibles y posibilidad de capturar al paso. No son jugadas repetidas: son posiciones.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 9.2',
  },
  {
    id: 'tab_como_reclamar', area: 'tablas', peso: 3,
    enunciado: 'Un jugador quiere reclamar tablas por repetición con una jugada que todavía no hizo. ¿Cómo procede?',
    opciones: [
      'Anota la jugada sin jugarla, para el reloj y llama al árbitro.',
      'Hace la jugada, presiona el reloj y recién entonces reclama.',
      'Anuncia el reclamo en voz alta y espera sin tocar nada.',
      'Reclama al terminar la partida, mostrando su planilla firmada.',
    ],
    correcta: 0,
    explica: 'La jugada que produciría la repetición se anota pero no se juega. Si se juega, el reclamo ya es otro: el de la posición que quedó en el tablero.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 9.2.1',
  },
  {
    id: 'tab_reclamacion_falsa', area: 'tablas', peso: 4,
    enunciado: 'Un jugador reclama tablas por repetición en ritmo clásico y el reclamo es incorrecto. ¿Qué pasa?',
    opciones: [
      'Da dos minutos al rival y se juega la jugada anunciada.',
      'Pierde la partida por haber reclamado tablas en falso.',
      'No pasa nada: se sigue jugando, sin ninguna clase de sanción.',
      'Se le descuentan dos minutos de su propio reloj y sigue.',
    ],
    correcta: 0,
    explica: 'El reclamo equivocado le cuesta dos minutos a quien reclama en beneficio del rival (uno en rápidas y relámpago desde 2023), y hay que jugar la jugada anunciada.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 9.5.3',
  },
  {
    id: 'tab_cincuenta', area: 'tablas', peso: 2,
    enunciado: 'La regla de las 50 jugadas permite reclamar tablas cuando…',
    opciones: [
      '50 jugadas de cada bando sin mover peón ni capturar.',
      '50 jugadas en total entre los dos bandos, sin capturas.',
      'Pasaron 50 minutos sin que ninguno capture nada.',
      'Se repitió 50 veces cualquier posición de la partida.',
    ],
    correcta: 0,
    explica: 'Cincuenta de cada bando, y la cuenta se reinicia con cada avance de peón o cada captura.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 9.3',
  },
  {
    id: 'tab_automaticas', area: 'tablas', peso: 4,
    enunciado: '¿Qué situaciones obligan al árbitro a declarar tablas sin que nadie las reclame?',
    opciones: [
      'Cinco repeticiones, o 75 jugadas sin peón ni captura.',
      'Tres repeticiones, o 50 jugadas sin peón ni captura.',
      'Ninguna: las tablas siempre hay que reclamarlas al árbitro.',
      'Cuatro repeticiones, o 60 jugadas sin peón ni captura.',
    ],
    correcta: 0,
    explica: 'Tres repeticiones y 50 jugadas dan derecho a reclamar; cinco repeticiones y 75 jugadas son automáticas y el árbitro interviene de oficio.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 9.6',
  },
  {
    id: 'tab_oferta', area: 'tablas', peso: 3,
    enunciado: '¿Cuál es la forma correcta de ofrecer tablas?',
    opciones: [
      'Hacer la jugada, ofrecer y recién entonces presionar el reloj.',
      'Ofrecer antes de mover, con el reloj propio corriendo.',
      'Ofrecer después de presionar el reloj del rival.',
      'Ofrecer en cualquier momento, incluso en el turno del rival.',
    ],
    correcta: 0,
    explica: 'Jugada, oferta, reloj: así el rival decide con la jugada ya sobre el tablero. Una oferta hecha en el turno del rival es una molestia sancionable.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 9.1.2.1',
  },
  {
    id: 'tab_oferta_repetida', area: 'tablas', peso: 3,
    enunciado: 'Un jugador ofrece tablas tres veces en diez jugadas, pese a las negativas. ¿Qué corresponde?',
    opciones: [
      'Es una molestia al rival y el árbitro puede sancionarla.',
      'Nada: ofrecer tablas nunca está limitado.',
      'Pierde la partida al tercer ofrecimiento.',
      'Debe esperar diez jugadas entre oferta y oferta, por regla fija.',
    ],
    correcta: 0,
    explica: 'No hay un número exacto en las Leyes, pero repetir la oferta para incomodar entra en la prohibición de distraer o molestar, con las sanciones del 12.9.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.5 y 12.9',
  },
  {
    id: 'tab_oferta_retirada', area: 'tablas', peso: 4,
    enunciado: 'Un jugador ofrece tablas y el rival todavía no contesta. ¿Puede retirar la oferta?',
    opciones: [
      'No: vale hasta que el rival acepte, rechace o mueva.',
      'Sí, mientras el rival todavía no haya dicho nada.',
      'Sí, en cualquier momento antes de firmar las planillas.',
      'No, y además queda obligado a aceptar si se las ofrecen.',
    ],
    correcta: 0,
    explica: 'Una vez hecha, la oferta no se retira. Se extingue cuando el rival la acepta, la rechaza de palabra, toca una pieza para mover, o la partida termina de otro modo.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 9.1.3',
  },
  {
    id: 'tab_planilla_arbitro', area: 'tablas', peso: 5,
    enunciado: 'Un jugador con menos de cinco minutos y sin incremento dejó de anotar, y ahora quiere reclamar tablas por 50 jugadas. ¿Qué hace el árbitro?',
    opciones: [
      'Puede aceptarla si logra verificarla por otros medios.',
      'Lo rechaza siempre: sin planilla completa no hay reclamo.',
      'La acepta siempre: el jugador estaba autorizado a no anotar.',
      'Manda reconstruir la planilla con el rival antes de decidir.',
    ],
    correcta: 0,
    explica: 'El reclamo necesita prueba. Sin planilla, el árbitro puede apoyarse en lo que haya observado o en el registro electrónico; sin nada de eso, no hay cómo darla por buena.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 8.5 y 9.5',
  },

  /* ================= Conducta, dispositivos y sanciones ================= */
  {
    id: 'con_telefono_suena', area: 'conducta', peso: 1,
    enunciado: 'Durante la partida suena el celular de un jugador dentro de la sala de juego. ¿Qué corresponde por regla general?',
    opciones: [
      'Pierde la partida; el reglamento puede prever menos.',
      'Advertencia del árbitro la primera vez y derrota la segunda.',
      'Dos minutos para el rival y la partida sigue normalmente.',
      'Nada, si el jugador lo apaga de inmediato y se disculpa.',
    ],
    correcta: 0,
    explica: 'La regla es dura a propósito. El reglamento del evento puede fijar una sanción menos severa, pero si no dice nada, la consecuencia es la derrota.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.3.2',
  },
  {
    id: 'con_dispositivo_encima', area: 'conducta', peso: 3,
    enunciado: 'El árbitro comprueba que un jugador lleva encima un dispositivo electrónico no autorizado, apagado y silencioso. ¿Qué corresponde?',
    opciones: [
      'Pierde, salvo que el reglamento prevea algo más suave.',
      'Nada, porque estaba apagado y no molestó a nadie en la sala.',
      'Advertencia y obligación de dejarlo fuera de la sala de juego.',
      'Dos minutos para el rival y la partida sigue su curso.',
    ],
    correcta: 0,
    explica: 'Lo que prohíbe la regla es tener el dispositivo, no que suene: apagado cuenta igual. Por eso los torneos habilitan un lugar para dejar los teléfonos.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.3.2',
  },
  {
    id: 'con_lista_sanciones', area: 'conducta', peso: 2,
    enunciado: '¿Cuál de estas NO es una sanción prevista para el árbitro en las Leyes?',
    opciones: [
      'Obligar al jugador a cambiar de tablero en plena partida.',
      'Aumentar el tiempo que le queda al rival en el reloj de juego.',
      'Declarar la partida perdida para el jugador infractor.',
      'Expulsar al jugador de la competición por completo.',
    ],
    correcta: 0,
    explica: 'La lista va de la advertencia a la expulsión, pasando por ajustar tiempos, dar o quitar puntos y excluir de rondas. Cambiar de tablero no está entre ellas.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 12.9',
  },
  {
    id: 'con_advertencia_primero', area: 'conducta', peso: 2,
    enunciado: 'Ante una infracción leve y aislada, ¿qué criterio siguen las Leyes con las sanciones?',
    opciones: [
      'Van de menor a mayor: la advertencia es la primera de la lista.',
      'Se aplica directamente la pérdida de la partida.',
      'El árbitro debe elegir siempre la sanción más severa posible.',
      'No hay criterio: cualquier sanción vale para cualquier caso.',
    ],
    correcta: 0,
    explica: 'La lista del 12.9 está ordenada de la más suave a la más dura, y el árbitro elige la proporcionada. Aplicar la más severa a una infracción menor es tan mal arbitraje como no sancionar.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 12.9',
  },
  {
    id: 'con_analizar_sala', area: 'conducta', peso: 3,
    enunciado: 'Dos jugadores que ya terminaron analizan su partida en un tablero de la sala mientras otros siguen jugando. ¿Qué corresponde?',
    opciones: [
      'Está prohibido analizar en la sala y el árbitro interviene.',
      'Se permite, siempre que hablen en voz baja y no molesten.',
      'Se permite mientras el árbitro no reciba ninguna queja.',
      'Se permite solo entre jugadores que ya terminaron su ronda.',
    ],
    correcta: 0,
    explica: 'Quien terminó su partida pasa a ser espectador, y a los espectadores no se les permite interferir con las partidas que siguen. Para eso están las salas de análisis.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.4 y 12.7',
  },
  {
    id: 'con_ayuda_externa', area: 'conducta', peso: 3,
    enunciado: 'Un jugador consulta notas manuscritas sobre la apertura durante la partida. ¿Qué corresponde?',
    opciones: [
      'Prohibido: ninguna fuente de información ni consejo.',
      'Está permitido si son notas propias y no de un libro impreso.',
      'Está permitido antes de la jugada 10, que es teoría conocida.',
      'Solo se sanciona si el rival se da cuenta y lo reclama.',
    ],
    correcta: 0,
    explica: 'Ninguna fuente de información, consejo o análisis externo: ni notas, ni libros, ni consultas. La sanción sale de la lista del 12.9 y puede llegar a la derrota.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.3.1 y 12.9',
  },
  {
    id: 'con_dar_mano', area: 'conducta', peso: 4,
    enunciado: 'Un jugador se niega a dar la mano al rival antes de empezar y lo hace de forma ostensible. ¿Qué puede hacer el árbitro?',
    opciones: [
      'Tratarlo como conducta indebida y sancionarlo según el 12.9.',
      'Declarar la partida perdida de inmediato y sin aviso.',
      'Nada: dar la mano no es obligatorio en ninguna circunstancia.',
      'Suspender la partida hasta que se den la mano.',
    ],
    correcta: 0,
    explica: 'No hay una sanción específica escrita para esto, pero sí la prohibición general de conducta que desprestigie el juego, con la escala del 12.9 detrás. El árbitro debe avisar antes de castigar.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.1 y 12.9',
  },
  {
    id: 'con_salir_sala', area: 'conducta', peso: 3,
    enunciado: '¿Puede un jugador salir de la sala de juego mientras es su turno?',
    opciones: [
      'Solo con permiso del árbitro, y sin dejar la zona de juego.',
      'Sí, cuando quiera: el tiempo que gaste corre por su cuenta.',
      'No, bajo ninguna circunstancia mientras tenga el turno.',
      'Sí, pero debe dejar su planilla a la vista sobre la mesa.',
    ],
    correcta: 0,
    explica: 'La sala de juego se abandona solo con permiso del árbitro, y la zona de juego (sala, baños, refrigerio) no se abandona sin autorización — es la regla que sostiene los controles antitrampa.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.2.3 y 11.2.4',
  },
  {
    id: 'con_reclamacion_arbitro', area: 'conducta', peso: 4,
    enunciado: 'Un jugador no está de acuerdo con una decisión del árbitro principal. ¿Qué vía tiene?',
    opciones: [
      'Apelar ante el comité previsto en el reglamento y en plazo.',
      'Ninguna: la decisión del árbitro principal es inapelable.',
      'Detener la partida hasta que otro árbitro la revise.',
      'Reclamar directamente a la FIDE por correo electrónico.',
    ],
    correcta: 0,
    explica: 'El derecho a apelar existe siempre, pero por el canal y en el plazo que fije el reglamento del torneo. Por eso todo reglamento debe decir cómo se compone el comité de apelación.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.10',
  },
  {
    id: 'con_espectador', area: 'conducta', peso: 4,
    enunciado: 'Un espectador le señala a un jugador que a su rival le cayó la bandera. ¿Qué hace el árbitro?',
    opciones: [
      'Puede expulsarlo de la sala: no debe interferir.',
      'Nada: el espectador solo dijo algo que era evidente.',
      'Declara la partida perdida para el jugador beneficiado.',
      'Anula la partida y la manda a jugar de nuevo desde cero.',
    ],
    correcta: 0,
    explica: 'Los espectadores y los jugadores de otras partidas no comentan ni interfieren; el árbitro puede expulsar a quien lo haga. La decisión sobre la bandera la toma el árbitro, no el público.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 12.7',
  },
  {
    id: 'con_no_intervenir', area: 'conducta', peso: 5,
    enunciado: 'El árbitro ve que un jugador va a dejar caer su bandera por distracción. ¿Qué debe hacer?',
    opciones: [
      'No intervenir: no avisa banderas ni reclamos.',
      'Avisarle, porque su deber es cuidar la deportividad.',
      'Avisar solo si el jugador es menor de edad o principiante.',
      'Detener el reloj hasta que el jugador reaccione y mire.',
    ],
    correcta: 0,
    explica: 'El árbitro no juega la partida: no señala jugadas, ni banderas a punto de caer, ni reclamos disponibles. Intervenir de más es de los errores más graves del oficio.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 12.6',
  },
  {
    id: 'con_reclamo_trampa', area: 'conducta', peso: 5,
    enunciado: 'Un jugador acusa a su rival de recibir ayuda externa, sin prueba alguna. ¿Qué hace el árbitro?',
    opciones: [
      'Registra, observa y aplica el protocolo antitrampa.',
      'Declara la partida perdida para el jugador acusado.',
      'Ignora la queja: sin una prueba no hay nada que hacer.',
      'Suspende la partida hasta que aparezca alguna prueba.',
    ],
    correcta: 0,
    explica: 'Se toma nota y se aplican los procedimientos previstos (observación, controles, informe), sin decidir la partida por una sospecha. Acusar sin fundamento es a su vez conducta sancionable.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.1 y 12.2, y Reglamento antitrampa de la FIDE (ACC)',
  },

  /* ================= Rápidas y relámpago ================= */
  {
    id: 'rit_definicion_blitz', area: 'ritmos', peso: 2,
    enunciado: '¿Qué ritmo es "relámpago" (blitz) según las Leyes?',
    opciones: [
      '10 minutos o menos, contando 60 veces el incremento.',
      '5 minutos o menos por jugador, sin contar los incrementos.',
      'Menos de quince minutos por jugador, con o sin incremento.',
      'Cualquier partida jugada sin incremento, dure lo que dure.',
    ],
    correcta: 0,
    explica: 'La cuenta oficial suma el tiempo base más 60 veces el incremento: 3+2 son 3 + 120 segundos, o sea 5 minutos, y entra en relámpago.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndice B.1',
  },
  {
    id: 'rit_definicion_rapida', area: 'ritmos', peso: 2,
    enunciado: '¿Y cuál es el rango de las partidas rápidas?',
    opciones: [
      'Más de 10 y menos de 60, con 60 veces el incremento.',
      'Entre 15 y 90 minutos por jugador, con o sin incremento.',
      'Más de 10 minutos por jugador, sin ningún límite superior.',
      'Entre 5 y 30 minutos por jugador, contando el incremento.',
    ],
    correcta: 0,
    explica: 'Por debajo del rango es relámpago; a partir de 60 minutos (con la misma cuenta) es ritmo clásico, con todo lo que eso implica para la validez del rating.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndice A.1',
  },
  {
    id: 'rit_ilegal_rapidas', area: 'ritmos', peso: 4,
    enunciado: 'Desde 2023, en rápidas, ¿cuánto tiempo recibe el rival por la primera jugada ilegal completada?',
    opciones: [
      'Un minuto.',
      'Dos minutos, igual que en clásico.',
      'Nada: la primera ilegal en rápidas pierde la partida.',
      'Treinta segundos.',
    ],
    correcta: 0,
    explica: 'Hasta 2022 eran dos minutos; desde 2023 las rápidas se igualaron al relámpago con un minuto. Lo mismo vale para el reclamo de tablas incorrecta.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndice A.3',
  },
  {
    id: 'rit_ilegal_blitz_reclamo', area: 'ritmos', peso: 5,
    enunciado: 'En relámpago, ¿qué debe hacer el rival para que una jugada ilegal tenga consecuencias?',
    opciones: [
      'Reclamar antes de hacer su propia jugada.',
      'Nada: el árbitro interviene siempre de oficio.',
      'Reclamar en cualquier momento antes de que termine la partida.',
      'Detener el reloj y esperar a que el árbitro lo vea.',
    ],
    correcta: 0,
    explica: 'En relámpago manda el jugador: si responde con su jugada, la posición queda validada y ya no hay reclamo posible.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndice B.3 (y A.5 para rápidas sin supervisión)',
  },
  {
    id: 'rit_anotar_rapidas', area: 'ritmos', peso: 3,
    enunciado: '¿Hay obligación de anotar las jugadas en rápidas y relámpago?',
    opciones: [
      'No, salvo que el reglamento del evento lo exija.',
      'Sí, siempre y en los dos ritmos, como en clásico.',
      'Sí en rápidas, pero no en las partidas de relámpago.',
      'Solo a partir de la jugada 20 en los dos ritmos.',
    ],
    correcta: 0,
    explica: 'Sin obligación de anotar, la planilla deja de ser prueba: por eso en estos ritmos los reclamos dependen mucho más de lo que el árbitro observe.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndices A.2 y B.3',
  },
  {
    id: 'rit_arbitro_supervision', area: 'ritmos', peso: 4,
    enunciado: 'En rápidas con supervisión adecuada (un árbitro por pocas partidas), ¿cómo se tratan las jugadas ilegales?',
    opciones: [
      'Como en clásico, con el árbitro interviniendo de oficio.',
      'Igual que en relámpago, solo a reclamo del jugador.',
      'No se sancionan: en rápidas todo vale si nadie protesta.',
      'Se anota el incidente y se resuelve al final de la ronda.',
    ],
    correcta: 0,
    explica: 'El apéndice A distingue los dos escenarios: con supervisión suficiente se aplican las reglas de competición normales; sin ella, se pasa al régimen de reclamo del jugador.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndice A.3 y A.4',
  },
  {
    id: 'rit_bandera_blitz', area: 'ritmos', peso: 3,
    enunciado: 'En relámpago sin supervisión, ¿quién puede reclamar la caída de bandera?',
    opciones: [
      'Cualquiera de los dos, deteniendo el reloj.',
      'Solo el árbitro, que la declara de oficio.',
      'Cualquier espectador que la advierta.',
      'Nadie: en relámpago no cuenta.',
    ],
    correcta: 0,
    explica: 'El reclamo es del jugador, y vale siempre que él mismo no haya excedido su tiempo. Un espectador nunca puede intervenir.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndice B.3',
  },
  {
    id: 'rit_apendice_c', area: 'ritmos', peso: 1,
    enunciado: '¿Qué notación es obligatoria en las competiciones FIDE?',
    opciones: [
      'La algebraica, descrita en el apéndice C.',
      'La descriptiva, por ser la tradicional.',
      'Cualquiera, mientras el jugador la entienda.',
      'La que fije la federación de cada jugador.',
    ],
    correcta: 0,
    explica: 'Solo la algebraica. Las iniciales de las piezas pueden ser las del idioma del jugador, pero la estructura de la notación es la misma en todo el mundo.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 8.1 y apéndice C',
  },
  {
    id: 'rit_quickplay', area: 'ritmos', peso: 5,
    enunciado: 'En un final sin incremento, con menos de dos minutos, un jugador reclama tablas porque su rival no hace ningún progreso. ¿Qué puede hacer el árbitro?',
    opciones: [
      'Aplicar la directriz III si el reglamento la adoptó.',
      'Rechazarlo siempre: ese reclamo ya no existe.',
      'Aceptarla, porque hay menos de dos minutos en el reloj.',
      'Declarar tablas solo si los dos jugadores lo piden.',
    ],
    correcta: 0,
    explica: 'Es la regla del "final rápido sin incremento", que un reglamento puede adoptar. El árbitro puede posponer la decisión y quedarse mirando la partida antes de resolver.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), directriz III (partidas sin incremento y finales rápidos)',
  },
  {
    id: 'rit_adaptado_ciegos', area: 'ritmos', peso: 5,
    enunciado: 'En una partida con un jugador con discapacidad visual, ¿qué prevén las Leyes?',
    opciones: [
      'Dos tableros y reglas propias para anunciar las jugadas.',
      'Que el árbitro juegue las jugadas por el jugador con discapacidad.',
      'Nada especial: se aplican las Leyes generales sin cambios.',
      'Que la partida no puede ser válida para el rating FIDE.',
    ],
    correcta: 0,
    explica: 'El apéndice sobre partidas adaptadas prevé el tablero con piezas asegurables, el anuncio en voz alta de las jugadas y la ayuda de un asistente cuando corresponde.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndice D (jugadores ciegos y con discapacidad visual)',
  },

  /* ================= Competición: emparejamientos y desempates ================= */
  {
    id: 'com_suizo_no_repetir', area: 'competicion', peso: 1,
    enunciado: 'Regla básica de todo sistema suizo:',
    opciones: [
      'Dos jugadores no pueden enfrentarse más de una vez.',
      'Nadie puede llevar dos veces seguidas el mismo color.',
      'El primer tablero siempre juega con blancas.',
      'Todos deben jugar contra rivales de su misma puntuación.',
    ],
    correcta: 0,
    explica: 'Es la regla absoluta del suizo, por encima de puntuaciones y colores: si respetarla obliga a romper un grupo de puntuación, se rompe.',
    fuente: 'Reglas básicas del sistema suizo (Handbook C.04.1)',
  },
  {
    id: 'com_bye', area: 'competicion', peso: 2,
    enunciado: 'En un suizo con número impar de jugadores, quien queda libre por emparejamiento recibe…',
    opciones: [
      'Un punto, sin color asignado.',
      'Medio punto, como unas tablas.',
      'Un punto y se le cuenta como blancas.',
      'Cero puntos, pero mantiene su lugar.',
    ],
    correcta: 0,
    explica: 'El bye por emparejamiento vale un punto entero y no cuenta como partida jugada ni asigna color. Es distinto del medio punto que un reglamento puede dar a quien pide no jugar una ronda.',
    fuente: 'Reglas básicas del sistema suizo (Handbook C.04.1)',
  },
  {
    id: 'com_color_absoluta', area: 'competicion', peso: 3,
    enunciado: '¿Cuándo una preferencia de color es "absoluta"?',
    opciones: [
      'Cuando la diferencia es ±2, o hubo dos del mismo color.',
      'Cuando el jugador la pide expresamente al árbitro de sala.',
      'Cuando el jugador es cabeza de serie del torneo.',
      'Cuando la diferencia entre colores es de apenas ±1.',
    ],
    correcta: 0,
    explica: 'La absoluta hay que respetarla salvo imposibilidad; la de ±1 es fuerte y la de igualdad (por alternancia) es leve. El orden entre ellas es lo que decide muchos emparejamientos.',
    fuente: 'Sistema suizo de la FIDE (Handbook C.04.1 y C.04.3)',
  },
  {
    id: 'com_grupos', area: 'competicion', peso: 3,
    enunciado: 'Dentro de un grupo de puntuación del sistema holandés, ¿cómo se emparejan los jugadores?',
    opciones: [
      'Se parte el grupo en dos mitades y se cruzan entre sí.',
      'Se emparejan por sorteo puro dentro de cada grupo.',
      'Se emparejan vecinos: primero con segundo, tercero con cuarto.',
      'Se emparejan por edad o por federación, según el reglamento.',
    ],
    correcta: 0,
    explica: 'Mitad superior contra mitad inferior, respetando colores y la prohibición de repetir rival. Los que sobran bajan al grupo siguiente como flotantes.',
    fuente: 'Sistema holandés de la FIDE (Handbook C.04.3)',
  },
  {
    id: 'com_buchholz', area: 'competicion', peso: 2,
    enunciado: '¿Qué mide el desempate Buchholz?',
    opciones: [
      'La suma de los puntos de los rivales que enfrentó el jugador.',
      'La cantidad de partidas que el jugador ganó con negras.',
      'El promedio de rating de los rivales del jugador.',
      'La suma de los puntos que el jugador logró contra rivales titulados.',
    ],
    correcta: 0,
    explica: 'Mide la dureza del recorrido. Sus variantes (cortando el peor resultado, o el peor y el mejor) buscan reducir el peso de un rival que se hundió o que arrasó.',
    fuente: 'Reglas de desempate (Handbook C.07)',
  },
  {
    id: 'com_sonneborn', area: 'competicion', peso: 3,
    enunciado: '¿En qué tipo de torneo es habitual el desempate Sonneborn-Berger?',
    opciones: [
      'En los round robin (todos contra todos).',
      'En los suizos de muchas rondas.',
      'En los torneos por sistema eliminatorio.',
      'En los torneos por equipos, exclusivamente.',
    ],
    correcta: 0,
    explica: 'En un round robin todos enfrentan a todos, así que el Buchholz no distingue nada: el Sonneborn-Berger sí, porque pondera contra quién se ganó.',
    fuente: 'Reglas de desempate (Handbook C.07)',
  },
  {
    id: 'com_incomparecencia_desempate', area: 'competicion', peso: 5,
    enunciado: 'Para calcular el Buchholz, ¿cómo se cuentan las rondas que un rival no jugó?',
    opciones: [
      'Con el criterio del "rival virtual" que fija la FIDE.',
      'Como cero puntos, sin ninguna corrección posterior.',
      'Se excluye a ese rival del cálculo del desempate.',
      'Como medio punto en todos los casos, siempre.',
    ],
    correcta: 0,
    explica: 'Contar las no jugadas como ceros castigaba al que había enfrentado a alguien que después se retiró. El rival virtual reconstruye lo que ese rival "habría" hecho.',
    fuente: 'Reglas de desempate (Handbook C.07), partidas no jugadas',
  },
  {
    id: 'com_orden_desempates', area: 'competicion', peso: 4,
    enunciado: '¿Cuándo debe quedar definido el orden de los desempates de un torneo?',
    opciones: [
      'Antes de empezar, publicado en el reglamento del torneo.',
      'Al terminar la última ronda, según cómo quede la tabla.',
      'Lo decide el árbitro principal cuando hace falta.',
      'Lo decide la federación después de recibir los resultados.',
    ],
    correcta: 0,
    explica: 'Elegir el desempate una vez conocidos los resultados es la forma más rápida de perder la confianza de la sala: va anunciado de antemano y no se toca.',
    fuente: 'Reglas de desempate (Handbook C.07)',
  },
  {
    id: 'com_programa_emparejar', area: 'competicion', peso: 4,
    enunciado: 'El programa de emparejamientos entrega una ronda que al árbitro le parece rara. ¿Qué corresponde?',
    opciones: [
      'Revisar los datos: si el sistema se aplicó bien, se publica.',
      'Corregirlo a mano según el criterio del árbitro principal.',
      'Repetir el sorteo hasta que salga algo más razonable.',
      'Consultar a los jugadores afectados antes de publicarlo.',
    ],
    correcta: 0,
    explica: 'El sistema es determinista: con los mismos datos, el resultado es el mismo. Si el emparejamiento sorprende, casi siempre el error está en los datos (un resultado mal cargado, un ausente sin marcar), no en el programa homologado.',
    fuente: 'Reglas de emparejamiento suizo (Handbook C.04), apéndice de programas homologados',
  },
  {
    id: 'com_incomparecencia_rating', area: 'competicion', peso: 5,
    enunciado: 'Una partida que se pierde por incomparecencia (sin jugarse), ¿cuenta para el rating?',
    opciones: [
      'No: las partidas no jugadas no van al cálculo de rating.',
      'Sí, como una derrota normal contra el rival asignado.',
      'Sí, pero solo para el jugador que sí se presentó a jugar.',
      'Depende de lo que decida el árbitro principal del torneo.',
    ],
    correcta: 0,
    explica: 'Puntúa en la tabla, pero no existe como partida: no hay jugadas. Para el rating y para el informe del torneo se marca como no jugada.',
    fuente: 'Reglamento de rating de la FIDE (Handbook B.02)',
  },
  {
    id: 'com_resultado_firmado', area: 'competicion', peso: 3,
    enunciado: 'Terminada la partida, ¿quién responde por que el resultado quede bien anotado?',
    opciones: [
      'Los dos jugadores, que verifican y firman el resultado.',
      'Solo el ganador, que es a quien le interesa que quede bien.',
      'Solo el árbitro, sin ninguna participación de los jugadores.',
      'El jugador que llevó las blancas, en todos los casos.',
    ],
    correcta: 0,
    explica: 'Los dos firman o confirman el resultado, según el procedimiento del torneo. Un resultado mal anotado y firmado es de las cosas más difíciles de revertir después.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 8.7',
  },
  {
    id: 'com_sala_condiciones', area: 'competicion', peso: 4,
    enunciado: 'Antes de empezar una ronda, ¿qué le corresponde comprobar al árbitro en la sala?',
    opciones: [
      'Relojes, tableros, luz, planillas y señalización.',
      'Solo que los relojes tengan pilas nuevas cargadas.',
      'Nada: la sala es responsabilidad exclusiva del organizador.',
      'Únicamente que estén publicados los emparejamientos.',
    ],
    correcta: 0,
    explica: 'El árbitro comparte con el organizador la responsabilidad de que las condiciones de juego sean las debidas, y esa revisión se hace antes de que entre el primer jugador.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 12.2.3, y Manual del árbitro (ARB)',
  },

  /* ================= El árbitro: títulos, categorías y deberes ================= */
  {
    id: 'tit_deber_principal', area: 'titulos', peso: 1,
    enunciado: '¿Cuál es el deber central del árbitro según las Leyes?',
    opciones: [
      'Que se cumplan las Leyes y cuidar la competición.',
      'Asegurar que gane el jugador mejor clasificado del torneo.',
      'Resolver todas las partidas que se demoren demasiado tiempo.',
      'Enseñarles las reglas a los jugadores durante la partida.',
    ],
    correcta: 0,
    explica: 'Las dos cosas a la vez, y en ese orden. El resto de los deberes —supervisar, sancionar, cuidar las condiciones de juego— salen de ahí.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 12.1 y 12.2',
  },
  {
    id: 'tit_titulos_orden', area: 'titulos', peso: 2,
    enunciado: 'Ordena de menor a mayor los títulos de árbitro de la FIDE:',
    opciones: [
      'Árbitro Nacional, Árbitro FIDE, Árbitro Internacional.',
      'Árbitro FIDE, Árbitro Nacional, Árbitro Internacional.',
      'Árbitro Internacional, Árbitro FIDE, Árbitro Nacional.',
      'Árbitro Nacional, Árbitro Internacional, Árbitro FIDE.',
    ],
    correcta: 0,
    explica: 'El Nacional lo otorga la federación; el FIDE (FA) es el primer título internacional y el Internacional (IA) es el siguiente escalón.',
    fuente: 'Reglamento de títulos de árbitro (Handbook B.06.1)',
  },
  {
    id: 'tit_fa_requisito', area: 'titulos', peso: 3,
    enunciado: '¿Qué hace falta para el título de Árbitro FIDE (FA)?',
    opciones: [
      'Ser Árbitro Nacional, aprobar el seminario y las normas.',
      'Solo aprobar un examen en línea sobre las Leyes del Ajedrez.',
      'Haber arbitrado un torneo internacional, sin ningún otro requisito.',
      'Ser propuesto por la federación, sin examen y sin normas.',
    ],
    correcta: 0,
    explica: 'El camino es: registro nacional, seminario con examen (que otorga una de las normas) y experiencia acreditada en torneos válidos. La edad mínima es 19 años.',
    fuente: 'Reglamento de títulos de árbitro (Handbook B.06.1 y B.06.2)',
  },
  {
    id: 'tit_ia_norma', area: 'titulos', peso: 4,
    enunciado: 'Sobre las normas para el título de Árbitro Internacional (IA):',
    opciones: [
      'Varias normas de torneos distintos, y ya tener el FA.',
      'Basta con una sola norma en un torneo internacional grande.',
      'Se obtienen todas en el mismo torneo si es bastante grande.',
      'No hacen falta normas: alcanza con aprobar el seminario.',
    ],
    correcta: 0,
    explica: 'El IA se construye sobre el FA y exige varias normas obtenidas en torneos distintos (una de ellas del seminario), además de la edad mínima de 21 años. La cifra exacta la fija el reglamento vigente.',
    fuente: 'Reglamento de títulos de árbitro (Handbook B.06.1)',
  },
  {
    id: 'tit_categorias', area: 'titulos', peso: 4,
    enunciado: '¿Para qué sirven las categorías de árbitros (A, B, C, D)?',
    opciones: [
      'Para clasificarlos por experiencia y decidir designaciones.',
      'Para ordenar a los árbitros por antigüedad dentro de la federación.',
      'Para separarlos por ritmo de juego: clásico, rápido y relámpago.',
      'Para fijar cuánto puede cobrar cada árbitro por cada torneo.',
    ],
    correcta: 0,
    explica: 'La clasificación es distinta del título: el título se tiene de por vida, la categoría depende de la experiencia reciente y es la que abre la puerta a los eventos mundiales y continentales.',
    fuente: 'Reglamento de clasificación de árbitros (Handbook B.06.3)',
  },
  {
    id: 'tit_licencia', area: 'titulos', peso: 3,
    enunciado: 'Para actuar como árbitro en torneos válidos para rating FIDE, además del título hace falta…',
    opciones: [
      'Tener la licencia vigente y estar registrado en la FIDE.',
      'Nada más: el título de árbitro alcanza y dura de por vida.',
      'Una autorización por escrito para cada torneo que dirige.',
      'Pertenecer al comité de arbitraje de su propia federación.',
    ],
    correcta: 0,
    explica: 'El título es permanente, la licencia no: se paga y se mantiene. Un árbitro sin licencia vigente no puede firmar un informe de torneo válido para rating.',
    fuente: 'Reglamento de títulos de árbitro (Handbook B.06.1)',
  },
  {
    id: 'tit_conflicto_interes', area: 'titulos', peso: 4,
    enunciado: 'Un árbitro tiene a un familiar directo jugando el torneo que dirige. ¿Qué corresponde?',
    opciones: [
      'Declararlo y apartarse de las decisiones que le afecten.',
      'Nada, mientras se sienta capaz de ser imparcial.',
      'Renunciar al torneo completo, siempre y sin excepción.',
      'Pedirle al familiar que abandone la competición.',
    ],
    correcta: 0,
    explica: 'La imparcialidad no es solo un estado de ánimo: también tiene que verse. Lo que corresponde es declarar el vínculo y que otro árbitro resuelva lo que toque a esa partida.',
    fuente: 'Reglamento de árbitros de la FIDE (Handbook B.06), deberes del árbitro, y Leyes del Ajedrez 2023 (Handbook E.I.01), art. 12',
  },
  {
    id: 'tit_informe', area: 'titulos', peso: 3,
    enunciado: 'Terminado un torneo válido para rating, ¿qué debe enviar el árbitro?',
    opciones: [
      'El informe con resultados, emparejamientos y jugadores.',
      'Solo la tabla final de posiciones del torneo, con los puntos.',
      'Nada: el informe le corresponde al organizador del torneo.',
      'Únicamente las planillas de las partidas que más duraron.',
    ],
    correcta: 0,
    explica: 'El informe es lo que convierte al torneo en válido para rating y en base de normas. Va completo y a tiempo: un informe tardío o incompleto puede dejar sin efecto el trabajo de todo el torneo.',
    fuente: 'Reglamento de rating de la FIDE (Handbook B.02)',
  },
  {
    id: 'tit_arbitro_adjunto', area: 'titulos', peso: 2,
    enunciado: '¿Qué diferencia hay entre el árbitro principal y los árbitros adjuntos?',
    opciones: [
      'El principal decide; los adjuntos supervisan y aplican.',
      'Ninguna: todos tienen exactamente la misma autoridad en la sala.',
      'Los adjuntos solo pueden actuar en las partidas de menores.',
      'El principal solo interviene cuando hay una apelación.',
    ],
    correcta: 0,
    explica: 'Una sola voz decide, para que la sala no reciba dos criterios distintos. Los adjuntos observan, informan y aplican lo acordado; las decisiones difíciles suben al principal.',
    fuente: 'Manual del árbitro de la Comisión de Árbitros (ARB), que no forma parte del Handbook',
  },
  {
    id: 'tit_reglamento_torneo', area: 'titulos', peso: 5,
    enunciado: 'El reglamento de un torneo contradice en un punto las Leyes del Ajedrez. ¿Qué manda?',
    opciones: [
      'Las Leyes, salvo donde ellas dejan decidir al reglamento.',
      'Siempre el reglamento del torneo, que es la norma más específica.',
      'Siempre las Leyes, sin ninguna excepción posible en ningún caso.',
      'Lo que decida el árbitro principal en ese momento y sin apelación.',
    ],
    correcta: 0,
    explica: 'Las Leyes dejan huecos a propósito —tiempo de incomparecencia, sanción por dispositivos, finales rápidos— y ahí el reglamento manda. Fuera de esos huecos, no puede contradecirlas.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), prefacio y art. 6.7, 11.3.2',
  },
  {
    id: 'tit_caso_dudoso', area: 'titulos', peso: 5,
    enunciado: 'Se presenta un caso que las Leyes no contemplan con exactitud. ¿Qué criterio da el propio texto?',
    opciones: [
      'Resolver por analogía con casos parecidos de las Leyes.',
      'Declarar tablas, que es siempre la solución más neutra de todas.',
      'Consultar por escrito a la FIDE antes de decidir cualquier cosa.',
      'Dejar que los dos jugadores acuerden entre ellos qué hacer.',
    ],
    correcta: 0,
    explica: 'El prefacio lo dice: las Leyes no pueden cubrir todas las situaciones, y donde no hay regla exacta se decide por analogía, con criterio y explicándolo. De ahí sale la autoridad del árbitro.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), prefacio',
  },
  {
    id: 'tit_apelacion_composicion', area: 'titulos', peso: 4,
    enunciado: '¿Quién resuelve una apelación contra una decisión del árbitro principal?',
    opciones: [
      'El comité de apelación formado antes del torneo.',
      'El propio árbitro principal, revisando su propia decisión.',
      'La asamblea de jugadores inscritos en la competición.',
      'El organizador, que es quien contrata al árbitro principal.',
    ],
    correcta: 0,
    explica: 'El comité se nombra al empezar, no cuando aparece el problema, y es independiente del árbitro. Su composición y los plazos van en el reglamento publicado.',
    fuente: 'Reglamento general de competiciones (Handbook C.05), procedimiento de apelaciones',
  },

  /* ===== Ítems de base, para que el sorteo tenga de dónde elegir en todos
     los escalones de todas las áreas (ver FORMA en ArbitrajePrueba). ===== */
  {
    id: 'irr_que_es_ilegal', area: 'irregularidades', peso: 1,
    enunciado: '¿Cuál de estas es una jugada ilegal?',
    opciones: [
      'Mover el rey a una casilla atacada por una pieza rival.',
      'Mover el rey dos casillas al enrocar.',
      'Capturar al paso un peón que acaba de avanzar dos casillas.',
      'Coronar un peón en caballo teniendo la dama en el tablero.',
    ],
    correcta: 0,
    explica: 'Las otras tres son jugadas legales que suelen confundirse con irregularidades. Un rey nunca puede quedar ni ponerse en una casilla atacada.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 3.9 y 3.8',
  },
  {
    id: 'irr_corregir_a_tiempo', area: 'irregularidades', peso: 1,
    enunciado: 'Un jugador hace una jugada ilegal pero todavía no presionó el reloj. ¿Qué corresponde?',
    opciones: [
      'Puede corregirla sin sanción: la jugada no está completada.',
      'Ya es jugada ilegal completada y el rival recibe dos minutos.',
      'Pierde el derecho a mover esa pieza en esa jugada.',
      'El árbitro debe anotar la incidencia aunque la corrija.',
    ],
    correcta: 0,
    explica: 'El reloj es la frontera: mientras no lo presione, la jugada se puede arreglar. Eso sí, la pieza tocada sigue obligando.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.5.1 y 4.3',
  },
  {
    id: 'rel_quien_pone_marcha', area: 'reloj', peso: 1,
    enunciado: 'Al empezar la ronda, ¿qué reloj se pone en marcha?',
    opciones: [
      'El de las blancas, que son las que mueven primero.',
      'El de quien esté sentado al llegar la hora.',
      'Los dos a la vez, hasta la primera jugada.',
      'El de las negras, para compensar la ventaja de salida.',
    ],
    correcta: 0,
    explica: 'El reloj de las blancas arranca a la hora de inicio, esté o no el jugador en la mesa: el tiempo que tarde en llegar corre de su cuenta.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.6',
  },
  {
    id: 'tab_que_es_tablas_acuerdo', area: 'tablas', peso: 1,
    enunciado: '¿Cuándo quedan pactadas unas tablas por acuerdo?',
    opciones: [
      'Cuando el rival acepta la oferta: ahí termina la partida.',
      'Cuando los dos firman la planilla al final.',
      'Cuando el árbitro autoriza el acuerdo.',
      'Cuando se estrechan la mano, aunque nadie haya ofrecido.',
    ],
    correcta: 0,
    explica: 'La aceptación termina la partida de inmediato. Darse la mano sin oferta previa no es un acuerdo de tablas: cada tanto hay que aclararlo en la sala.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 5.2.3 y 9.1',
  },
  {
    id: 'tab_material_insuficiente', area: 'tablas', peso: 5,
    enunciado: 'Rey y alfil contra rey y alfil del mismo color, sin peones. ¿Es "posición muerta"?',
    opciones: [
      'Sí: con alfiles del mismo color no hay mate posible.',
      'No: siempre queda la posibilidad de un mate por error del rival.',
      'Solo si los dos jugadores lo reclaman juntos ante el árbitro.',
      'Solo si ya pasaron 50 jugadas sin ninguna captura ni peón.',
    ],
    correcta: 0,
    explica: 'La prueba no es "con juego razonable" sino "por cualquier serie de jugadas legales". Con alfiles del mismo color no hay mate posible ni ayudando el rival, así que la partida está terminada.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 5.2.2 (comparar con 6.9)',
  },
  {
    id: 'con_movil_apagado_bolso', area: 'conducta', peso: 1,
    enunciado: '¿Dónde puede dejar un jugador su celular durante la partida?',
    opciones: [
      'Donde indique el reglamento, fuera de su alcance.',
      'En el bolsillo, mientras esté en silencio y no suene.',
      'Sobre la mesa de juego, boca abajo y completamente apagado.',
      'En su bolso, debajo de la mesa donde está jugando.',
    ],
    correcta: 0,
    explica: 'La regla prohíbe tenerlo encima en la sala; dónde se deja lo resuelve el organizador (casilleros, una mesa vigilada, fuera de la sala) y se anuncia antes de empezar.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.3.2',
  },
  {
    id: 'rit_donde_se_aplican', area: 'ritmos', peso: 1,
    enunciado: 'En rápidas y relámpago, ¿qué reglas se aplican?',
    opciones: [
      'Las Leyes, con los cambios que fijan sus apéndices.',
      'Solo los apéndices: las Leyes generales no rigen en esos ritmos.',
      'Las que decida el organizador de cada torneo en su reglamento.',
      'Las Leyes sin cambios: los apéndices son solo orientativos.',
    ],
    correcta: 0,
    explica: 'Los apéndices no sustituyen a las Leyes: las modifican en lo que dicen expresamente (anotación, ilegales, reclamos) y en todo lo demás rige el texto general.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndices A y B',
  },
  {
    id: 'com_que_es_suizo', area: 'competicion', peso: 1,
    enunciado: '¿En qué se diferencia un suizo de un round robin?',
    opciones: [
      'En el suizo se empareja por puntuación ronda a ronda.',
      'En el suizo se juega a dos vueltas y en el round robin a una.',
      'En el suizo no se usan desempates y en el round robin sí.',
      'En el suizo los colores son fijos para cada jugador.',
    ],
    correcta: 0,
    explica: 'De ahí sale todo lo demás: el suizo permite torneos grandes en pocas rondas, pero obliga a cuidar los colores y a no repetir rivales.',
    fuente: 'Reglas de emparejamiento suizo (Handbook C.04)',
  },
  {
    id: 'tit_quien_nombra', area: 'titulos', peso: 1,
    enunciado: '¿Quién otorga el título de Árbitro Nacional?',
    opciones: [
      'La federación nacional de cada país.',
      'La FIDE, a propuesta del árbitro.',
      'El organizador del primer torneo que dirige.',
      'La confederación continental correspondiente.',
    ],
    correcta: 0,
    explica: 'El Nacional es de la federación y es el punto de partida: sin estar registrado como tal no se entra al seminario de Árbitro FIDE.',
    fuente: 'Reglamento de títulos de árbitro (Handbook B.06.1 y B.06.2)',
  },
  {
    id: 'ley_mate_ahogado_diferencia', area: 'leyes', peso: 5,
    enunciado: 'El jugador en turno no tiene ninguna jugada legal y su rey NO está atacado. ¿Qué resultado y desde cuándo?',
    opciones: [
      'Tablas por ahogado, desde la jugada que lo provocó.',
      'Tablas, pero solo si el ahogado se le reclama al árbitro.',
      'Pierde quien está ahogado, justamente por no poder mover.',
      'La partida sigue: el jugador ahogado le pasa el turno al rival.',
    ],
    correcta: 0,
    explica: 'El ahogado termina la partida en el acto, igual que el mate, siempre que la jugada que lo produjo fuera legal. No se reclama ni se puede seguir jugando.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 5.2.1',
  },
  /* ===== Ampliación del banco: más preguntas por área y por escalón, para
     que dos exámenes seguidos casi no compartan preguntas. ===== */

  /* ---------- Leyes del Ajedrez ---------- */
  {
    id: 'ley_tablero_h1', area: 'leyes', peso: 1,
    enunciado: '¿Cómo tiene que quedar colocado el tablero frente a los jugadores?',
    opciones: [
      'Con una casilla clara en la esquina derecha de cada jugador.',
      'Con una casilla oscura en la esquina derecha de cada jugador.',
      'Con la primera columna clara a la izquierda de las blancas.',
      'Da igual: lo que importa es dónde queda cada rey y su dama.',
    ],
    correcta: 0,
    explica: 'La regla de bolsillo es "clara a la derecha": h1 y a8 son casillas claras. De ahí sale también que la dama va en su color.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 2.1',
  },
  {
    id: 'ley_quien_empieza', area: 'leyes', peso: 1,
    enunciado: '¿Quién hace la primera jugada y cómo sigue la partida?',
    opciones: [
      'Empiezan las blancas y desde ahí se mueve alternadamente.',
      'Empieza quien gane el sorteo de la mesa, con cualquier color.',
      'Empiezan las blancas y pueden mover dos veces al principio.',
      'Empieza quien llegue primero al tablero de esa mesa.',
    ],
    correcta: 0,
    explica: 'Las Leyes abren con esto: dos rivales que mueven por turno, y siempre arrancan las blancas. El sorteo decide los colores, no quién empieza.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 1.1',
  },
  {
    id: 'ley_derecho_enroque_perdido', area: 'leyes', peso: 2,
    enunciado: '¿Cuándo se pierde para siempre el derecho a enrocar de un lado?',
    opciones: [
      'Cuando ya se movió el rey, o esa torre, aunque hayan vuelto.',
      'Cuando el rey estuvo en jaque aunque sea una sola vez.',
      'Cuando alguna casilla entre el rey y la torre estuvo ocupada.',
      'Cuando la torre de ese lado fue atacada por una pieza rival.',
    ],
    correcta: 0,
    explica: 'Mover el rey mata los dos enroques; mover una torre mata solo el de ese lado, y volverla a su casilla no lo devuelve. Lo demás son estorbos pasajeros.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 3.8.2.1',
  },
  {
    id: 'ley_salir_del_jaque', area: 'leyes', peso: 2,
    enunciado: 'Con el rey en jaque, ¿cuál de estos recursos NO sirve nunca?',
    opciones: [
      'Enrocar para llevarse el rey a una casilla segura.',
      'Capturar la pieza que está dando el jaque.',
      'Interponer una pieza propia entre el rey y quien lo ataca.',
      'Mover el rey a una casilla que nadie esté atacando.',
    ],
    correcta: 0,
    explica: 'Nunca se enroca estando en jaque. Los otros tres son justamente las tres formas de salir: capturar, tapar o mover el rey.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 3.8.2.2 y 3.9',
  },
  {
    id: 'ley_enroque_casilla_atacada', area: 'leyes', peso: 3,
    enunciado: 'Al enrocar largo, la casilla b1 está atacada por un alfil negro. ¿El enroque es legal?',
    opciones: [
      'Sí: quien no puede cruzar una casilla atacada es el rey.',
      'No: ninguna casilla del recorrido puede estar atacada.',
      'No, salvo que el jugador se lo avise antes al árbitro de sala.',
      'Sí, pero solo si ese alfil está clavado en ese momento.',
    ],
    correcta: 0,
    explica: 'El rey no puede salir de jaque, pasar por casilla atacada ni llegar a casilla atacada. La torre sí puede cruzar una casilla atacada: por eso b1 no estorba.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 3.8.2.2',
  },
  {
    id: 'ley_soltar_en_casilla_ilegal', area: 'leyes', peso: 3,
    enunciado: 'Un jugador suelta su alfil en una casilla a la que no puede llegar, y no ha presionado el reloj. ¿Qué corresponde?',
    opciones: [
      'Debe hacer con ese alfil otra jugada legal, si la tiene.',
      'Ya es jugada ilegal completada: el rival gana dos minutos.',
      'Puede mover cualquier pieza: el alfil ya perdió su turno.',
      'Debe dejar el alfil donde lo soltó y presionar el reloj.',
    ],
    correcta: 0,
    explica: 'La pieza tocada obliga aunque la jugada elegida no valga. La ilegal se completa al presionar el reloj: hasta ahí, se arregla sin sanción.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 4.3, 4.7 y 7.5.1',
  },
  {
    id: 'ley_mate_termina_todo', area: 'leyes', peso: 4,
    enunciado: 'Un jugador da mate y acto seguido cae su propia bandera, antes de que nadie diga nada. ¿Resultado?',
    opciones: [
      'Gana quien dio mate: la partida terminó con el mate.',
      'Gana el rival: la bandera cayó y eso manda siempre.',
      'Tablas, porque las dos cosas pasaron casi a la vez.',
      'Decide el árbitro según lo que alcanzara a ver en la mesa.',
    ],
    correcta: 0,
    explica: 'El mate termina la partida en el acto, siempre que la jugada fuera legal. Lo que pase después con el reloj ya no cambia nada.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 5.1.1 y 6.9',
  },
  {
    id: 'ley_tocada_sin_jugada_legal', area: 'leyes', peso: 4,
    enunciado: 'Un jugador toca una pieza propia que no tiene ninguna jugada legal. ¿Qué corresponde?',
    opciones: [
      'Puede hacer cualquier otra jugada legal, sin sanción.',
      'Pierde el turno y le toca mover otra vez al rival.',
      'Debe mover el rey, que es la pieza que siempre puede mover.',
      'El árbitro le descuenta dos minutos por tocar esa pieza.',
    ],
    correcta: 0,
    explica: 'La obligación de la pieza tocada solo existe si esa pieza puede moverse o ser capturada legalmente. Si no, la regla simplemente no se aplica.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 4.5',
  },
  {
    id: 'ley_toca_rey_y_torre', area: 'leyes', peso: 4,
    enunciado: 'Un jugador toca a la vez, y a propósito, su rey y una torre. ¿Qué está obligado a hacer?',
    opciones: [
      'A enrocar de ese lado, si ese enroque es legal.',
      'A mover la torre, porque es la pieza de destino del enroque.',
      'A mover el rey, y puede elegir cualquier casilla legal.',
      'A nada: tocar dos piezas juntas anula la obligación.',
    ],
    correcta: 0,
    explica: 'Tocar rey y torre juntos es declarar el enroque de ese lado. Si ese enroque no es legal, se aplica lo previsto para el rey o para la torre, según el caso.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 4.4.1',
  },
  {
    id: 'ley_posicion_muerta_momento', area: 'leyes', peso: 5,
    enunciado: 'Se llega a rey contra rey y los dos jugadores siguen moviendo un rato más. ¿Desde cuándo son tablas?',
    opciones: [
      'Desde la jugada legal que dejó esa posición en el tablero.',
      'Desde que uno de los dos jugadores reclame las tablas.',
      'Desde que el árbitro se acerque a la mesa y las declare.',
      'Desde que caiga la primera bandera de cualquiera de los dos.',
    ],
    correcta: 0,
    explica: 'La posición muerta termina la partida en el acto, como el mate. Lo que se "jugó" después no existe: el árbitro anota tablas desde esa jugada.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 5.2.2',
  },
  {
    id: 'ley_rey_capturado', area: 'leyes', peso: 5,
    enunciado: 'En un apuro de tiempo, un jugador captura el rey rival y presiona el reloj. ¿Qué hace el árbitro?',
    opciones: [
      'Repone la posición y lo trata como jugada ilegal completada.',
      'Da la partida por ganada: capturar el rey es ganar la partida.',
      'Deja seguir la partida sin rey, que es una pieza más.',
      'Declara tablas, porque la posición ya no se puede jugar.',
    ],
    correcta: 0,
    explica: 'El rey nunca se captura: llegar a esa posición significa que la jugada anterior dejó el rey en jaque, y eso es una ilegal con todo su procedimiento.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 3.9 y 7.5',
  },
  {
    id: 'ley_duda_pieza_tocada', area: 'leyes', peso: 5,
    enunciado: 'No se puede saber si el jugador tocó primero su pieza o la del rival. ¿Qué dicen las Leyes?',
    opciones: [
      'Se considera tocada primero la pieza del propio jugador.',
      'Se considera tocada primero la pieza del rival.',
      'Se anula la obligación y el jugador mueve lo que quiera.',
      'Decide el árbitro caso por caso, según lo que le parezca.',
    ],
    correcta: 0,
    explica: 'Las Leyes traen la regla escrita para este empate de versiones, y se resuelve en contra de quien tocó: primero la propia. Así el árbitro no improvisa.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 4.3.3',
  },

  /* ---------- El reloj y el tiempo ---------- */
  {
    id: 'rel_quien_coloca', area: 'reloj', peso: 1,
    enunciado: 'Antes de empezar la ronda, ¿quién decide de qué lado del tablero va el reloj?',
    opciones: [
      'El árbitro, y esa decisión no la discuten los jugadores.',
      'El jugador de piezas blancas, que es el que empieza.',
      'El jugador de piezas negras, a modo de compensación.',
      'Los dos jugadores, y si no se ponen de acuerdo se sortea.',
    ],
    correcta: 0,
    explica: 'Es una de las cosas que el árbitro deja resueltas antes de la ronda. Se suele poner del lado de las negras, pero la decisión es del árbitro.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.5',
  },
  {
    id: 'rel_que_es_bandera', area: 'reloj', peso: 1,
    enunciado: 'En el lenguaje de las Leyes, ¿qué significa "caída de bandera"?',
    opciones: [
      'Que a ese jugador se le agotó el tiempo de ese período.',
      'Que el reloj llegó al final del último período del control.',
      'Que el jugador se pasó del número de jugadas previsto.',
      'Que el reloj se apagó o dejó de funcionar durante la partida.',
    ],
    correcta: 0,
    explica: 'Viene de los relojes analógicos, que tenían una banderita. Hoy es simplemente que el tiempo de ese jugador llegó a cero en ese período.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.1 y glosario',
  },
  {
    id: 'rel_orden_mover_presionar', area: 'reloj', peso: 1,
    enunciado: '¿En qué orden se hacen las dos cosas, la jugada y el reloj?',
    opciones: [
      'Primero la jugada en el tablero y después presionar el reloj.',
      'Primero presionar el reloj y después la jugada en el tablero.',
      'Las dos a la vez, con las dos manos, para no perder tiempo.',
      'Da lo mismo, mientras la jugada quede hecha antes de la caída.',
    ],
    correcta: 0,
    explica: 'Presionar el reloj es lo que cierra la jugada: hacerlo antes de mover es una infracción, y en apuro de tiempo es de las que más se ven.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.2.1',
  },
  {
    id: 'rel_periodo_siguiente', area: 'reloj', peso: 2,
    enunciado: 'El control es 40 jugadas en 90 minutos y luego 30 minutos más. ¿Cuándo se suma ese tiempo?',
    opciones: [
      'Al completar la jugada 40, aunque sobre tiempo del período.',
      'Solo si el jugador llega a la jugada 40 con bastante tiempo de sobra.',
      'Al empezar la partida: los dos períodos se suman de una vez.',
      'Cuando el árbitro lo autoriza al ver la planilla del jugador.',
    ],
    correcta: 0,
    explica: 'El reloj lo hace solo: el tiempo del período siguiente se suma al completar las jugadas prescritas, y lo que sobró del anterior no se pierde.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.3.1',
  },
  {
    id: 'rel_blancas_no_llegaron', area: 'reloj', peso: 2,
    enunciado: 'Llega la hora de inicio y el jugador de blancas todavía no está en la mesa. ¿Qué se hace con el reloj?',
    opciones: [
      'Se pone en marcha igual y su tiempo empieza a correr.',
      'Se espera a que llegue para ponerlo en marcha con él.',
      'Se pone en marcha el reloj de las negras, por ser quien está.',
      'Se ponen en marcha los dos hasta que aparezca el ausente.',
    ],
    correcta: 0,
    explica: 'La hora de inicio no se mueve: el reloj de las blancas arranca y el tiempo del ausente corre hasta que llegue, o hasta el tiempo de incomparecencia.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.6 y 6.7',
  },
  {
    id: 'rel_contador_jugadas', area: 'reloj', peso: 3,
    enunciado: 'El contador de jugadas del reloj marca 39 y el jugador dice que hizo 41. ¿Qué vale?',
    opciones: [
      'Las planillas: el contador es una ayuda, no una prueba.',
      'El contador del reloj, que es un aparato y no se equivoca.',
      'Lo que diga el jugador que va peor de tiempo en esa mesa.',
      'Nada: al haber discrepancia, la partida se declara tablas.',
    ],
    correcta: 0,
    explica: 'El contador se desajusta con cualquier incidencia. Para contar jugadas, el árbitro va a las planillas y, si hace falta, reconstruye la partida.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.10 y 8.5',
  },
  {
    id: 'rel_tiempos_tras_reponer', area: 'reloj', peso: 3,
    enunciado: 'Hay que reponer una posición anterior por una irregularidad. ¿Qué pasa con los tiempos del reloj?',
    opciones: [
      'Los fija el árbitro con su criterio, y puede dejarlos igual.',
      'Se devuelven exactamente a los que había en esa posición.',
      'Se reparte el tiempo restante en partes iguales entre los dos.',
      'Se dejan siempre como están: el reloj nunca se retoca.',
    ],
    correcta: 0,
    explica: 'Las Leyes le dan el criterio al árbitro justamente porque no siempre se sabe qué había. Puede además ajustar el contador de jugadas.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.1',
  },
  {
    id: 'rel_pantalla_no_pierde', area: 'reloj', peso: 4,
    enunciado: 'Una pantalla de la sala muestra la posición, las jugadas hechas y los tiempos. ¿Qué límite le ponen las Leyes?',
    opciones: [
      'Que no se puede reclamar apoyándose solo en lo que ahí se ve.',
      'Que la pantalla sustituye al reloj para reclamar la bandera.',
      'Que las pantallas están prohibidas dentro de la sala de juego.',
      'Que la pantalla manda si discrepa con lo anotado en la planilla.',
    ],
    correcta: 0,
    explica: 'Las pantallas y los tableros murales están permitidos, pero van retrasados y fallan. Un reclamo se apoya en el tablero, el reloj y las planillas.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.12.2',
  },
  {
    id: 'rel_indicacion_concluyente', area: 'reloj', peso: 4,
    enunciado: 'Un jugador dice que el reloj le comió tiempo, pero el aparato funciona bien y no se ve ninguna falla. ¿Qué vale?',
    opciones: [
      'Lo que marca el reloj: sin defecto evidente, es concluyente.',
      'Lo que diga el jugador, si su planilla está bien anotada.',
      'El promedio entre lo que marca el reloj y lo que él reclama.',
      'Nada: ante la duda el árbitro cambia el reloj y reparte tiempo.',
    ],
    correcta: 0,
    explica: 'La palabra de las Leyes es "defecto evidente". Sin eso, la indicación del reloj se toma como buena: si no, cualquier apuro de tiempo sería discutible.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.10.1',
  },
  {
    id: 'rel_demora_vs_incremento', area: 'reloj', peso: 4,
    enunciado: '¿En qué se diferencia el incremento del modo "demora" (delay)?',
    opciones: [
      'El incremento se acumula; la demora solo retrasa el descuento.',
      'La demora se acumula; el incremento solo retrasa el descuento.',
      'En nada: son dos nombres para el mismo modo del reloj.',
      'El incremento solo existe en rápidas; la demora, en clásico.',
    ],
    correcta: 0,
    explica: 'Con incremento, los segundos que no usas se te quedan y el tiempo puede subir. Con demora, el reloj espera unos segundos y recién después descuenta.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), glosario, y normas de material (Handbook C.02)',
  },
  {
    id: 'rel_jugada_sin_presionar', area: 'reloj', peso: 5,
    enunciado: 'Un jugador hace su jugada 40 en el tablero, pero la bandera le cae antes de presionar el reloj. ¿Qué pasa?',
    opciones: [
      'No completó la jugada 40: pierde por tiempo, salvo que fuera mate.',
      'Completó la jugada al soltar la pieza: se salvó del control.',
      'Se le concede igual, porque la jugada está en el tablero.',
      'El árbitro le da la jugada por buena si su planilla lo respalda.',
    ],
    correcta: 0,
    explica: 'La jugada no está completada hasta que el jugador detiene su reloj, con una sola excepción: la jugada que termina la partida, como el mate.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.2.1 y 6.2.2',
  },
  {
    id: 'rel_dos_caballos_bandera', area: 'reloj', peso: 5,
    enunciado: 'Cae la bandera de un jugador. Su rival tiene rey y dos caballos contra rey solo. ¿Resultado?',
    opciones: [
      'Gana quien tiene los dos caballos: el mate es posible.',
      'Tablas: con dos caballos no se puede forzar el mate.',
      'Tablas, porque no hay peones en el tablero de esa partida.',
      'Gana solo si demuestra la secuencia de mate al árbitro.',
    ],
    correcta: 0,
    explica: 'La prueba no es "¿se puede forzar?", sino "¿existe alguna serie de jugadas legales que dé mate?". Con dos caballos existe, jugando el rival lo peor posible.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.9',
  },
  {
    id: 'rel_dos_banderas_periodo', area: 'reloj', peso: 5,
    enunciado: 'En una partida sin incremento con las Guías de "Quickplay Finish" anunciadas, caen las dos banderas en el primer período de un control de varios períodos y no se sabe cuál cayó antes. ¿Qué corresponde?',
    opciones: [
      'La partida continúa: no es tablas si no es el último período.',
      'Tablas: siempre que caen las dos, la partida queda empatada.',
      'Pierde quien mueve, porque es quien tenía el reloj corriendo.',
      'Se repite la partida desde el principio en otro horario.',
    ],
    correcta: 0,
    explica: 'Esas Guías separan los casos: en un período intermedio la partida sigue; solo en el último período son tablas. No es una regla del cuerpo de las Leyes, y solo aplica a controles sin incremento con esas Guías anunciadas de antemano.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), Guidelines III.4 (Quickplay Finish)',
  },

  /* ---------- Irregularidades ---------- */
  {
    id: 'irr_reponer_posicion', area: 'irregularidades', peso: 1,
    enunciado: 'Se detecta una jugada ilegal ya completada. ¿Qué pasa con la posición del tablero?',
    opciones: [
      'Se repone la posición inmediatamente anterior a la ilegal.',
      'Se deja como está y se sigue jugando desde ahí.',
      'Se vuelve al principio de la partida y se juega de nuevo.',
      'Se repone solo si el jugador que la hizo está de acuerdo.',
    ],
    correcta: 0,
    explica: 'Primero la posición, después la sanción. La partida no puede seguir desde una posición a la que se llegó por una jugada que no existía.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.5.1',
  },
  {
    id: 'irr_peon_octava_sin_coronar', area: 'irregularidades', peso: 1,
    enunciado: 'Un peón llega a la octava fila y el jugador lo deja ahí, como peón, y presiona el reloj.',
    opciones: [
      'Es jugada ilegal: el cambio va en esa misma jugada.',
      'Es legal: el peón puede coronar en la jugada que sigue.',
      'Es legal, y el peón queda bloqueado hasta que lo cambien.',
      'Es legal si el jugador avisó antes en qué pieza va a coronar.',
    ],
    correcta: 0,
    explica: 'El cambio de peón por dama, torre, alfil o caballo del mismo color es parte de la misma jugada. Un peón no puede quedarse en la última fila.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 3.7.5 y 7.5',
  },
  {
    id: 'irr_torre_salta', area: 'irregularidades', peso: 1,
    enunciado: 'Un jugador mueve su torre saltando por encima de un peón propio. ¿Qué es eso?',
    opciones: [
      'Una jugada ilegal, con todo el procedimiento del artículo 7.',
      'Una jugada legal, porque la torre no capturó ninguna pieza.',
      'Una jugada legal solo si el peón saltado estaba clavado.',
      'Un simple descuido: se corrige y no pasa nada, en cualquier momento.',
    ],
    correcta: 0,
    explica: 'Solo el caballo salta. Que una ilegal sea evidente no la hace menos ilegal: si el reloj ya se presionó, corresponde reponer y sancionar.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 3.5 y 7.5',
  },
  {
    id: 'irr_dos_jugadas_seguidas', area: 'irregularidades', peso: 2,
    enunciado: 'Un jugador mueve dos veces seguidas porque el rival se distrajo y no movió. ¿Cómo se trata?',
    opciones: [
      'Como jugada ilegal: se repone y se aplica el artículo 7.5.',
      'Como jugada válida: el rival se durmió y perdió su turno.',
      'Como falta de conducta, sin tocar la posición del tablero.',
      'Como empate técnico, porque se rompió el orden de las jugadas.',
    ],
    correcta: 0,
    explica: 'Mover fuera de turno es de las ilegales más discutidas y es una ilegal como cualquier otra: se repone la posición anterior y cuenta para el conteo.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 1.1 y 7.5',
  },
  {
    id: 'irr_tocada_tras_corregir', area: 'irregularidades', peso: 2,
    enunciado: 'Se repone la posición tras una jugada ilegal. ¿Qué reglas rigen la jugada que la reemplaza?',
    opciones: [
      'Las mismas de siempre: pieza tocada y pieza soltada obligan.',
      'Ninguna: el jugador puede mover libremente lo que quiera.',
      'Solo la de pieza soltada; la pieza tocada ya no obliga.',
      'Las elige el árbitro según cómo se haya producido la ilegal.',
    ],
    correcta: 0,
    explica: 'Si tocó una pieza que sí tiene jugada legal, con esa tiene que jugar. No se puede usar una ilegal para deshacer una pieza tocada incómoda.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 4.3, 4.7 y 7.5.1',
  },
  {
    id: 'irr_posicion_no_identificable', area: 'irregularidades', peso: 3,
    enunciado: 'Hay que reponer, pero nadie logra reconstruir la posición justo anterior a la irregularidad. ¿Qué se hace?',
    opciones: [
      'Se sigue desde la última posición que sí se pueda identificar.',
      'Se declaran tablas, porque la partida ya no se puede seguir.',
      'Se sigue desde la posición que hay ahora en el tablero.',
      'Se repite la partida entera con los mismos colores.',
    ],
    correcta: 0,
    explica: 'Las Leyes prevén el caso: se retrocede hasta donde las planillas y los dos jugadores permitan reconstruir, y desde ahí sigue la partida.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.5.1',
  },
  {
    id: 'irr_al_paso_tardia', area: 'irregularidades', peso: 3,
    enunciado: 'Un jugador captura al paso un peón que avanzó dos casillas hace dos jugadas. ¿Qué corresponde?',
    opciones: [
      'Es jugada ilegal: al paso se captura en la respuesta.',
      'Es legal mientras ese peón no se mueva de su casilla.',
      'Es legal si el rival no reclama antes de mover su pieza.',
      'Es legal solo en el final, cuando quedan pocos peones.',
    ],
    correcta: 0,
    explica: 'La captura al paso caduca de inmediato: si no se hace en la respuesta al avance de dos casillas, se pierde el derecho para siempre.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 3.7.4.1 y 7.5',
  },
  {
    id: 'irr_mate_con_jugada_ilegal', area: 'irregularidades', peso: 4,
    enunciado: 'Un jugador anuncia mate, pero la jugada que lo da resulta ser ilegal. ¿Qué hace el árbitro?',
    opciones: [
      'No hay mate: repone la posición y aplica el artículo 7.5.',
      'Da el mate por bueno: la partida ya terminó al anunciarlo.',
      'Declara tablas, porque la posición final quedó viciada.',
      'Deja que los jugadores decidan si aceptan ese mate.',
    ],
    correcta: 0,
    explica: 'El mate termina la partida solo si la jugada que lo produce es legal. Si no lo es, es una ilegal más: se repone y se cuenta para la sanción.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 5.1.1 y 7.5',
  },
  {
    id: 'irr_presiona_con_piezas_caidas', area: 'irregularidades', peso: 4,
    enunciado: 'Un jugador vuelca varias piezas, no las levanta y presiona el reloj dejándoselas al rival. ¿Qué corresponde?',
    opciones: [
      'Reponerlas era cosa suya y en su tiempo: puede sancionarse.',
      'Nada: quien tenga el reloj corriendo se encarga de acomodarlas todas.',
      'Se le descuenta al rival el tiempo que tarde en acomodarlas.',
      'Se anula la jugada y se repone la posición anterior al vuelco.',
    ],
    correcta: 0,
    explica: 'Las Leyes son claras en que repone quien desplazó, y en su propio tiempo. Cargárselo al rival entra además en molestar al adversario.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.4, 11.5 y 12.9',
  },
  {
    id: 'irr_resultado_firmado', area: 'irregularidades', peso: 5,
    enunciado: 'Analizando después de firmar las planillas, los jugadores descubren que hubo una jugada ilegal. ¿Qué corresponde?',
    opciones: [
      'El resultado se mantiene: la partida ya estaba terminada.',
      'Se reanuda la partida desde la posición anterior a la ilegal.',
      'Se anula la partida y se juega de nuevo en otro horario.',
      'Se le da la partida por ganada al jugador perjudicado.',
    ],
    correcta: 0,
    explica: 'El artículo 7 se aplica durante la partida. Terminada y firmada, lo que queda es la vía de la apelación contra decisiones del árbitro, no reabrir el tablero.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.5, 8.7 y 11.10',
  },
  {
    id: 'irr_ambos_reyes_en_jaque', area: 'irregularidades', peso: 5,
    enunciado: 'Se llega a una posición en la que los dos reyes están en jaque a la vez. ¿Qué significa eso?',
    opciones: [
      'Que hubo una jugada ilegal antes: hay que reponer y corregir.',
      'Que la partida es tablas por posición doblemente irregular.',
      'Que gana quien tenga el turno, por dar jaque primero.',
      'Que se juega igual: cada uno se ocupa de su propio jaque.',
    ],
    correcta: 0,
    explica: 'Es una posición imposible de alcanzar legalmente: alguien dejó su rey en jaque y nadie lo notó. El árbitro retrocede hasta la última posición legal.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 3.9 y 7.5.1',
  },
  {
    id: 'irr_reconstruir_entre_todos', area: 'irregularidades', peso: 5,
    enunciado: 'Hay que reconstruir la partida y uno de los jugadores se niega a colaborar. ¿Qué dicen las Leyes?',
    opciones: [
      'Los dos están obligados a ayudar; negarse se sanciona.',
      'Solo ayuda quien reclamó: el reclamo es suyo y la carga también.',
      'Reconstruye el árbitro solo, sin hablar con los jugadores.',
      'Si uno se niega, la reconstrucción se cancela sin más.',
    ],
    correcta: 0,
    explica: 'Las Leyes obligan a los dos jugadores a asistir al árbitro en cualquier situación que exija reconstruir la partida, incluidos los reclamos de tablas.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.11 y 12.9',
  },

  /* ---------- Planilla y tablas ---------- */
  {
    id: 'tab_planilla_visible', area: 'tablas', peso: 1,
    enunciado: 'Durante la partida, ¿dónde tiene que estar la planilla de cada jugador?',
    opciones: [
      'A la vista del árbitro durante toda la partida.',
      'Boca abajo, para que el rival no la pueda leer.',
      'En el bolsillo del jugador, y se saca para anotar.',
      'En la mesa del árbitro, que la devuelve al terminar.',
    ],
    correcta: 0,
    explica: 'La planilla es el documento de la partida y el árbitro tiene que poder verla en cualquier momento, sobre todo al acercarse el control de tiempo.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 8.1',
  },
  {
    id: 'tab_firmar_planillas', area: 'tablas', peso: 1,
    enunciado: 'Terminada la partida, ¿qué hacen los dos jugadores con las planillas?',
    opciones: [
      'Firman las dos, la propia y la del rival, con el resultado.',
      'Firma solo quien ganó, que es quien reporta el resultado.',
      'Las entregan sin firmar: la firma la pone el árbitro.',
      'Firma cada uno la suya y la del rival queda sin firmar.',
    ],
    correcta: 0,
    explica: 'Firmar las dos es la forma de que los dos estén de acuerdo con el resultado. Aun así, firmar no impide apelar después una decisión del árbitro.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 8.7',
  },
  {
    id: 'tab_planilla_de_quien', area: 'tablas', peso: 1,
    enunciado: 'Al terminar el torneo, ¿de quién son las planillas de las partidas?',
    opciones: [
      'Del organizador de la competición, que las conserva.',
      'De cada jugador, que se las lleva si quiere.',
      'Del árbitro principal, a título personal.',
      'De la federación del país donde se juega el torneo.',
    ],
    correcta: 0,
    explica: 'Por eso el organizador puede publicar las partidas y por eso el árbitro puede exigirlas al final de la ronda: no son papel privado del jugador.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 8.3',
  },
  {
    id: 'tab_escribir_antes', area: 'tablas', peso: 2,
    enunciado: '¿Puede un jugador anotar su jugada en la planilla antes de hacerla en el tablero?',
    opciones: [
      'No, salvo cuando está reclamando tablas o al aplazar.',
      'Sí, siempre: es una costumbre permitida para no olvidarla.',
      'Sí, si el rival hace lo mismo y ninguno de los dos protesta.',
      'No, en ningún caso, ni siquiera reclamando tablas.',
    ],
    correcta: 0,
    explica: 'Escribir primero y mirar después es una ayuda que las Leyes prohíben. La excepción es el reclamo de tablas, donde la jugada se escribe y no se juega.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 8.1',
  },
  {
    id: 'tab_rey_contra_rey', area: 'tablas', peso: 2,
    enunciado: 'Queda rey contra rey en el tablero. ¿Qué corresponde?',
    opciones: [
      'Tablas de inmediato: es posición muerta, sin reclamo.',
      'Tablas solo cuando uno de los dos jugadores las reclame.',
      'Se sigue jugando hasta que caiga una de las dos banderas.',
      'Tablas solo si se completan además cincuenta jugadas.',
    ],
    correcta: 0,
    explica: 'Ninguna serie de jugadas legales puede dar mate, así que la partida está terminada. El árbitro lo declara aunque los jugadores quieran seguir.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 5.2.2',
  },
  {
    id: 'tab_repeticion_no_seguida', area: 'tablas', peso: 2,
    enunciado: 'Las tres veces que se repite la posición, ¿tienen que ser seguidas?',
    opciones: [
      'No: pueden estar separadas por muchas otras jugadas.',
      'Sí: tienen que darse en jugadas consecutivas.',
      'Sí, salvo que el árbitro autorice contarlas salteadas.',
      'No, pero deben caer todas dentro de las últimas diez jugadas.',
    ],
    correcta: 0,
    explica: 'La regla habla de la posición, no de los movimientos: puede aparecer en la jugada 12, en la 30 y en la 58, y la tercera vez ya permite reclamar.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 9.2',
  },
  {
    id: 'tab_toco_pierde_reclamo', area: 'tablas', peso: 3,
    enunciado: 'Un jugador quiere reclamar tablas por repetición, pero antes tocó una pieza. ¿Qué pasa?',
    opciones: [
      'Perdió el derecho a reclamar con esa jugada.',
      'Puede reclamar igual: haber tocado una pieza no cambia nada.',
      'Puede reclamar si devuelve la pieza a su casilla original.',
      'Puede reclamar, pero el árbitro le descuenta dos minutos.',
    ],
    correcta: 0,
    explica: 'El reclamo se hace antes de tocar nada: se escribe la jugada, se paran los relojes y se llama al árbitro. Tocar una pieza ya es empezar a jugar.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 9.4',
  },
  {
    id: 'tab_oferta_fuera_de_turno', area: 'tablas', peso: 4,
    enunciado: 'Un jugador ofrece tablas con el reloj del rival corriendo, antes de haber movido. ¿Vale esa oferta?',
    opciones: [
      'Vale, pero puede sancionarse si molesta al rival.',
      'No vale: una oferta fuera de tiempo no existe.',
      'Vale y obliga al rival a contestar antes de mover.',
      'No vale, y además el rival gana dos minutos de reloj.',
    ],
    correcta: 0,
    explica: 'La forma correcta es ofrecer después de mover y antes de presionar. Fuera de ahí la oferta sigue siendo válida, pero entra en el terreno de molestar.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 9.1.2 y 11.5',
  },
  {
    id: 'tab_reclamo_rechazado_jugada', area: 'tablas', peso: 4,
    enunciado: 'Un jugador escribió su jugada para reclamar tablas y el árbitro rechaza el reclamo. ¿Qué pasa con esa jugada?',
    opciones: [
      'Está obligado a jugarla: la escribió y reclamó con ella.',
      'Puede jugar cualquier otra: el reclamo quedó sin efecto.',
      'Debe jugar cualquier jugada, menos la que había escrito.',
      'Decide el árbitro cuál de las dos jugadas se juega.',
    ],
    correcta: 0,
    explica: 'Es el precio de reclamar: además de los dos minutos que gana el rival, quien reclamó queda atado a la jugada que escribió.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 9.5',
  },
  {
    id: 'tab_75_jugadas_mate', area: 'tablas', peso: 5,
    enunciado: 'La jugada número 75 sin capturas ni movimientos de peón resulta ser mate. ¿Qué vale?',
    opciones: [
      'El mate: la partida terminó ganada, no en tablas.',
      'Las tablas: al llegar a 75 la partida se acaba igualada.',
      'Lo que reclame primero cualquiera de los dos jugadores.',
      'Tablas, salvo que el jugador reclame el mate al árbitro.',
    ],
    correcta: 0,
    explica: 'Las Leyes resuelven el choque a favor del mate. Es el mismo criterio de siempre: la jugada que da mate termina la partida en el acto.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 9.6',
  },
  {
    id: 'tab_misma_posicion_derechos', area: 'tablas', peso: 5,
    enunciado: 'Para la repetición, dos posiciones con las mismas piezas en las mismas casillas, ¿son siempre la misma?',
    opciones: [
      'No: cambian si cambiaron los derechos de enroque o al paso.',
      'Sí: lo único que se mira es dónde está cada pieza.',
      'Sí, siempre que además le toque mover al mismo jugador.',
      'No: además tienen que darse con el mismo tiempo en el reloj.',
    ],
    correcta: 0,
    explica: 'Es el detalle que más reclamos tumba. Mismo turno, mismas piezas, mismas casillas y además las mismas jugadas posibles, enroque y al paso incluidos.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 9.2.2',
  },
  {
    id: 'tab_alfil_y_caballo', area: 'tablas', peso: 5,
    enunciado: 'Cae la bandera de un jugador y su rival tiene rey, alfil y caballo contra rey solo. ¿Resultado?',
    opciones: [
      'Gana el rival: con alfil y caballo el mate es posible.',
      'Tablas: alfil y caballo no bastan para dar mate.',
      'Tablas, porque ese mate exige demasiadas jugadas.',
      'Gana solo si el rival muestra la técnica al árbitro.',
    ],
    correcta: 0,
    explica: 'Alfil y caballo dan mate forzado, aunque cueste. La pregunta del artículo 6.9 no es si es fácil: es si existe alguna serie de jugadas legales que lo dé.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.9 y 5.2.2',
  },

  /* ---------- Conducta, dispositivos y sanciones ---------- */
  {
    id: 'con_hablar_partida_en_curso', area: 'conducta', peso: 1,
    enunciado: 'Dos personas comentan en voz baja una partida que todavía se está jugando. ¿Qué dicen las Leyes?',
    opciones: [
      'Está prohibido comentar una partida que está en curso.',
      'Se puede, mientras los jugadores de esa mesa no escuchen.',
      'Se puede si ninguno de los dos es jugador del torneo.',
      'Se puede solo en la zona de descanso, nunca en la sala.',
    ],
    correcta: 0,
    explica: 'La prohibición alcanza a todo el mundo, jugadores y público: un comentario suelto cerca de una mesa puede valer tanto como una ayuda directa.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 12.7',
  },
  {
    id: 'con_pedir_explicacion', area: 'conducta', peso: 1,
    enunciado: 'Un jugador no entiende cómo se aplica una regla en su partida. ¿Qué puede hacer?',
    opciones: [
      'Pedirle al árbitro que le explique ese punto de las Leyes.',
      'Nada: al árbitro solo se le habla para reclamar algo.',
      'Consultarlo con otro jugador que ya haya terminado.',
      'Buscarlo en el reglamento impreso durante su propio tiempo.',
    ],
    correcta: 0,
    explica: 'Está escrito como un derecho del jugador. El árbitro explica la regla; lo que no hace es aconsejar sobre la posición ni sobre qué conviene jugar.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.9',
  },
  {
    id: 'con_fumar', area: 'conducta', peso: 1,
    enunciado: '¿Dónde se puede fumar durante una competición?',
    opciones: [
      'Solo en la zona que el árbitro haya señalado para eso.',
      'En cualquier lugar del recinto que no sea la sala de juego.',
      'En ningún lugar del recinto, sin ninguna excepción posible.',
      'Donde lo permita la ley del país, sin intervención del árbitro.',
    ],
    correcta: 0,
    explica: 'El recinto de juego incluye la sala, los baños, la zona de descanso y la de fumar, y quien define cada una es el árbitro.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.3.4 y 11.2',
  },
  {
    id: 'con_terminaron_espectadores', area: 'conducta', peso: 2,
    enunciado: 'Dos jugadores terminaron su partida y se quedan mirando otras mesas. ¿Qué son ahora?',
    opciones: [
      'Espectadores, con las mismas obligaciones que el público.',
      'Jugadores todavía, hasta que termine la ronda completa.',
      'Auxiliares del árbitro para las mesas que siguen jugando.',
      'Personas ajenas al torneo, que deben abandonar el recinto.',
    ],
    correcta: 0,
    explica: 'Es la base para poder sancionar al que ya jugó y anda dando vueltas: terminada su partida, pasa a ser público y no puede interferir en nada.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.4 y 12.7',
  },
  {
    id: 'con_apelar_tras_firmar', area: 'conducta', peso: 2,
    enunciado: 'Un jugador firmó la planilla con el resultado y después quiere apelar una decisión del árbitro. ¿Puede?',
    opciones: [
      'Sí: firmar la planilla no le quita el derecho a apelar.',
      'No: al firmar aceptó el resultado y la decisión.',
      'Solo si el rival también firma el escrito de apelación.',
      'Solo si todavía no se publicó el emparejamiento siguiente.',
    ],
    correcta: 0,
    explica: 'Las Leyes lo dicen expresamente, porque firmar es dejar constancia del resultado, no renunciar a nada. El reglamento del torneo fija plazos y forma.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.10 y 8.7',
  },
  {
    id: 'con_desprestigio', area: 'conducta', peso: 2,
    enunciado: 'Las Leyes abren el capítulo de conducta con una obligación general para los jugadores. ¿Cuál es?',
    opciones: [
      'No desprestigiar el juego con su comportamiento.',
      'Vestir de forma adecuada durante todas las rondas.',
      'Saludar al rival antes y después de cada partida.',
      'Estar en la sala diez minutos antes de cada ronda.',
    ],
    correcta: 0,
    explica: 'Es la cláusula que le permite al árbitro actuar ante conductas que ningún artículo previó, sin tener que inventarse una regla nueva.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.1',
  },
  {
    id: 'con_inspeccion_privada', area: 'conducta', peso: 3,
    enunciado: 'El árbitro sospecha que un jugador lleva un dispositivo encima. ¿Qué puede hacer?',
    opciones: [
      'Pedirle revisar ropa, bolsos y persona, siempre en privado.',
      'Revisarlo en la sala, delante de todos, para que se vea.',
      'Nada: solo puede actuar la policía o la organización.',
      'Expulsarlo directamente, sin revisar nada de lo que lleva.',
    ],
    correcta: 0,
    explica: 'La revisión se hace en privado y acompañada, no en medio de la sala. Negarse a la inspección tiene sus propias consecuencias.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.3.3',
  },
  {
    id: 'con_negativa_persistente', area: 'conducta', peso: 4,
    enunciado: 'Un jugador se niega una y otra vez a cumplir las Leyes pese a las advertencias. ¿Qué prevén las Leyes?',
    opciones: [
      'Perder la partida; el árbitro decide el puntaje del rival.',
      'Una advertencia más y, si insiste, la expulsión del torneo.',
      'Restarle tiempo de reloj hasta que decida cumplir.',
      'Suspender la partida y reanudarla en otro horario.',
    ],
    correcta: 0,
    explica: 'Que el árbitro decida el puntaje del rival importa: si el rival no tenía cómo dar mate, no se le regala el punto entero.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.7',
  },
  {
    id: 'con_maximo_puntaje', area: 'conducta', peso: 4,
    enunciado: '¿Cuál de estas medidas puede tomar el árbitro como sanción?',
    opciones: [
      'Subir el puntaje del rival al máximo posible de esa partida.',
      'Cambiarle el color al infractor en la ronda siguiente.',
      'Obligarlo a jugar la próxima ronda con menos tiempo de reflexión.',
      'Anular las partidas que ese jugador ya ganó en el torneo.',
    ],
    correcta: 0,
    explica: 'La escala del artículo 12.9 va de la advertencia a la expulsión, y en el medio están los ajustes de tiempo y de puntaje de esa partida.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 12.9',
  },
  {
    id: 'con_ambos_culpables', area: 'conducta', peso: 5,
    enunciado: 'Los dos jugadores de una mesa incurren en negativa persistente a cumplir las Leyes. ¿Qué corresponde?',
    opciones: [
      'La partida se declara perdida por los dos jugadores.',
      'La partida se declara tablas, porque los dos incumplieron.',
      'Se anula la partida y se juega de nuevo con otro árbitro.',
      'Pierde solo el que empezó, si se puede determinar quién fue.',
    ],
    correcta: 0,
    explica: 'Las Leyes lo dicen con todas las letras, y es la única situación en la que una partida termina 0-0. Suele ir acompañada de sanciones del artículo 12.9.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.8',
  },
  {
    id: 'con_cuantas_jugadas', area: 'conducta', peso: 5,
    enunciado: 'Un jugador en apuro de tiempo le pregunta al árbitro cuántas jugadas lleva hechas. ¿Qué corresponde?',
    opciones: [
      'No decírselo, salvo al aplicar el 8.5 con una bandera caída.',
      'Decírselo: es información del reloj y está a la vista.',
      'Decírselo solo si el rival está de acuerdo en ese momento.',
      'Decírselo y descontarle dos minutos por haber preguntado.',
    ],
    correcta: 0,
    explica: 'El árbitro no juega. Tampoco avisa de que el rival ya movió ni de que a alguien se le olvidó presionar el reloj: solo interviene donde las Leyes lo mandan.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 12.6 y 8.5',
  },
  {
    id: 'con_dispositivo_sancion_menor', area: 'conducta', peso: 5,
    enunciado: 'En un torneo escolar, ¿puede el reglamento prever algo más suave que la pérdida por llevar un celular encima?',
    opciones: [
      'Sí: el reglamento puede fijar una sanción menos severa.',
      'No: la pérdida de la partida es obligatoria en todos los casos.',
      'Sí, pero solo si la federación nacional lo autoriza por escrito.',
      'No, aunque el árbitro puede perdonar la primera vez.',
    ],
    correcta: 0,
    explica: 'Las propias Leyes dejan esa puerta abierta, pensando justamente en el ajedrez de base. Eso sí, la regla más suave debe estar escrita y anunciada antes.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 11.3.2',
  },

  /* ---------- Rápidas y relámpago ---------- */
  {
    id: 'rit_ejemplo_rapida', area: 'ritmos', peso: 1,
    enunciado: 'Un torneo se juega a 15 minutos más 10 segundos por jugada. ¿Qué ritmo es?',
    opciones: [
      'Rápidas (rapid), por el total que da la cuenta del apéndice.',
      'Relámpago (blitz), porque el reloj arranca con 15 minutos.',
      'Clásico (standard), porque lleva incremento desde la jugada 1.',
      'Depende de cuántas jugadas dure cada partida del torneo.',
    ],
    correcta: 0,
    explica: 'La cuenta es tiempo base más 60 veces el incremento: 15 + 10 = 25 minutos. Entre 10 y 60 minutos es rápidas.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndice A.1',
  },
  {
    id: 'rit_ejemplo_blitz', area: 'ritmos', peso: 1,
    enunciado: 'Un torneo se juega a 3 minutos más 2 segundos por jugada. ¿Qué ritmo es?',
    opciones: [
      'Relámpago (blitz): la cuenta da 5 minutos por jugador.',
      'Rápidas (rapid): el incremento lo saca de relámpago.',
      'Relámpago solo si además no hay árbitro en la sala.',
      'Un ritmo sin nombre: los incrementos chicos no se clasifican.',
    ],
    correcta: 0,
    explica: '3 + 60 × 2 segundos = 3 + 2 = 5 minutos. Diez minutos o menos es relámpago, con incremento o sin él.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndice B.1',
  },
  {
    id: 'rit_ejemplo_clasico', area: 'ritmos', peso: 1,
    enunciado: 'Un torneo se juega a 90 minutos más 30 segundos por jugada. ¿Qué ritmo es?',
    opciones: [
      'Clásico (standard): la cuenta pasa de los 60 minutos.',
      'Rápidas (rapid): el incremento de 30 segundos lo define.',
      'Clásico solo si además hay un control de 40 jugadas.',
      'Rápidas, porque el tiempo base es menor a dos horas.',
    ],
    correcta: 0,
    explica: '90 + 30 = 120 minutos. De 60 minutos para arriba es clásico, que es el ritmo que las Leyes tratan como el normal.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndices A.1 y B.1',
  },
  {
    id: 'rit_formula_incremento', area: 'ritmos', peso: 2,
    enunciado: '¿Cómo se clasifica un ritmo que tiene incremento?',
    opciones: [
      'Con el tiempo base más 60 veces el incremento por jugada.',
      'Con el tiempo base solamente: el incremento no se cuenta.',
      'Con el tiempo base más 40 veces el incremento por jugada.',
      'Con el tiempo que de verdad duran las partidas del torneo.',
    ],
    correcta: 0,
    explica: 'Se supone una partida de 60 jugadas. Por eso 3+2 es relámpago y 15+10 es rápidas, aunque los tiempos base digan otra cosa a primera vista.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndices A.1 y B.1',
  },
  {
    id: 'rit_supervision_adecuada', area: 'ritmos', peso: 2,
    enunciado: '¿Qué se entiende por "supervisión adecuada" en rápidas?',
    opciones: [
      'Un árbitro para pocas partidas, que puede ver cada mesa.',
      'Un árbitro por sala, sin importar cuántas mesas haya.',
      'Un árbitro principal más un adjunto en todo el torneo.',
      'Cámaras que graben todas las partidas de la ronda.',
    ],
    correcta: 0,
    explica: 'La diferencia es grande: con supervisión adecuada rigen casi las mismas reglas del clásico; sin ella, se pasa al régimen de reclamos del apéndice.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndice A.4',
  },
  {
    id: 'rit_un_minuto_general', area: 'ritmos', peso: 2,
    enunciado: 'En relámpago, las sanciones de tiempo de los artículos 7 y 9 se aplican…',
    opciones: [
      'Con un minuto en lugar de los dos minutos del clásico.',
      'Con los mismos dos minutos que en el ritmo clásico.',
      'Con treinta segundos, la mitad de medio minuto por falta.',
      'Sin tiempo extra: en relámpago solo se advierte o se pierde.',
    ],
    correcta: 0,
    explica: 'Dos minutos en una partida de cinco sería la partida entera. Desde 2023 el minuto también se aplica en rápidas.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndice A.3 (aplicado a relámpago vía B.3)',
  },
  {
    id: 'rit_planilla_derechos', area: 'ritmos', peso: 3,
    enunciado: 'En rápidas nadie está obligado a anotar. ¿Eso le quita derechos al jugador?',
    opciones: [
      'No: conserva los reclamos y puede pedir una planilla.',
      'Sí: sin planilla no puede reclamar repetición ni 50 jugadas.',
      'Sí: solo puede reclamar si el árbitro estaba mirando la mesa.',
      'No, pero debe avisar al árbitro antes de empezar a jugar.',
    ],
    correcta: 0,
    explica: 'El apéndice lo dice expresamente: no anotar no hace perder los reclamos que normalmente se apoyan en la planilla, y se puede pedir una para empezar a anotar.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndice A.2',
  },
  {
    id: 'rit_segunda_ilegal_rapidas', area: 'ritmos', peso: 3,
    enunciado: 'En rápidas, un jugador completa su segunda jugada ilegal en la misma partida. ¿Qué corresponde?',
    opciones: [
      'Pierde la partida, salvo que el rival no pueda dar mate.',
      'Otro minuto para el rival y la partida sigue igual.',
      'Advertencia: en rápidas la segunda ilegal no se sanciona.',
      'Pierde siempre, sin mirar el material que tenga el rival.',
    ],
    correcta: 0,
    explica: 'El criterio es el mismo del clásico, con la sanción de tiempo reducida a un minuto: la primera cuesta tiempo, la segunda cuesta la partida.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.5.5 y apéndice A.3',
  },
  {
    id: 'rit_mate_y_bandera_blitz', area: 'ritmos', peso: 3,
    enunciado: 'En relámpago, un jugador da mate y un instante después le cae su bandera. ¿Resultado?',
    opciones: [
      'Gana quien dio mate: el mate termina la partida al instante.',
      'Gana el rival: en relámpago la bandera manda sobre todo.',
      'Tablas: las dos cosas ocurrieron prácticamente a la vez.',
      'Decide el árbitro según lo que alcanzara a ver en la mesa.',
    ],
    correcta: 0,
    explica: 'El apéndice cambia sanciones y reclamos, no las reglas básicas: mate, ahogado y posición muerta terminan la partida igual que en clásico.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 5.1.1 y apéndice B.3',
  },
  {
    id: 'rit_ilegal_blitz_minuto', area: 'ritmos', peso: 4,
    enunciado: 'En relámpago con supervisión adecuada, ¿qué recibe el rival por la primera jugada ilegal completada?',
    opciones: [
      'Un minuto extra de tiempo, y la partida sigue.',
      'Dos minutos extra de tiempo, igual que en clásico.',
      'La partida ganada de inmediato, sin más trámite.',
      'Nada: en relámpago la primera ilegal solo se advierte.',
    ],
    correcta: 0,
    explica: 'Un minuto en la primera, la partida en la segunda. Lo que cambia sin supervisión es quién lo hace valer: ahí depende de que el rival lo reclame.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndice B.2',
  },
  {
    id: 'rit_reclamo_antes_de_mover', area: 'ritmos', peso: 4,
    enunciado: 'En relámpago sin supervisión, el rival ve una jugada ilegal pero contesta con su jugada. ¿Qué pasa?',
    opciones: [
      'Perdió el reclamo: ya no se corrige sin acuerdo mutuo.',
      'Puede reclamar igual hasta que termine la partida entera.',
      'Puede reclamar mientras no hayan pasado tres jugadas.',
      'El árbitro debe intervenir de oficio cuando se entere.',
    ],
    correcta: 0,
    explica: 'Sin árbitro mirando, el reclamo es del rival y hay que hacerlo antes de mover. Es la diferencia más grande con el ritmo clásico.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndice B.3',
  },
  {
    id: 'rit_bandera_sin_mate_blitz', area: 'ritmos', peso: 4,
    enunciado: 'En relámpago, un jugador reclama la caída de bandera del rival, pero él solo tiene el rey. ¿Resultado?',
    opciones: [
      'Tablas: sin posibilidad de mate no se gana por tiempo.',
      'Gana quien reclamó: la bandera cayó y la reclamó a tiempo.',
      'Se sigue jugando hasta que caiga la otra bandera también.',
      'Gana quien reclamó solo si el árbitro vio caer la bandera.',
    ],
    correcta: 0,
    explica: 'La regla del material vale en todos los ritmos: si ninguna serie de jugadas legales da mate, la caída de bandera es tablas y no victoria.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 6.9 y apéndice B.3',
  },
  {
    id: 'rit_arbitro_observa_ilegal', area: 'ritmos', peso: 5,
    enunciado: 'En rápidas con supervisión adecuada, el árbitro ve una jugada ilegal y nadie reclama. ¿Qué hace?',
    opciones: [
      'Interviene: con supervisión adecuada actúa sin reclamo.',
      'Espera: en rápidas solo se actúa si el rival reclama.',
      'Anota la incidencia y la resuelve al terminar la partida.',
      'Advierte a los dos jugadores sin tocar los relojes.',
    ],
    correcta: 0,
    explica: 'Esa es la razón de ser de la supervisión adecuada: con un árbitro por pocas mesas, las rápidas se arbitran casi como el clásico.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), apéndice A.4',
  },
  {
    id: 'rit_dos_banderas_un_periodo', area: 'ritmos', peso: 5,
    enunciado: 'En una partida de rápidas SIN incremento, de un solo período, con las Guías de "Quickplay Finish" anunciadas, caen las dos banderas y no se sabe cuál cayó primero. ¿Resultado?',
    opciones: [
      'Tablas: con un solo período, siempre es el período final.',
      'La partida continúa hasta que alguien dé mate.',
      'Pierde quien tenía el turno cuando se advirtió la caída.',
      'Se repite la partida completa con los colores cambiados.',
    ],
    correcta: 0,
    explica: 'La regla general distingue período intermedio de período final; con un solo período, siempre se cae en el caso de tablas. Ojo: esa regla es de las Guías, no del cuerpo de las Leyes, y ellas mismas dicen con todas las letras que NO aplican al relámpago — solo a partidas clásicas y rápidas sin incremento, y con las Guías anunciadas de antemano.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), Guidelines III.4 (Quickplay Finish)',
  },

  /* ---------- Competición: emparejamientos y desempates ---------- */
  {
    id: 'com_puntos_partida', area: 'competicion', peso: 1,
    enunciado: 'Salvo que el reglamento anuncie otra cosa, ¿cuánto vale cada resultado?',
    opciones: [
      'Ganar 1, empatar medio punto y perder cero.',
      'Ganar 3, empatar 1 y perder cero, como en el fútbol.',
      'Ganar 2, empatar 1 y perder cero puntos.',
      'Lo que decida el árbitro principal antes de cada ronda.',
    ],
    correcta: 0,
    explica: 'Es el único artículo de las Leyes dedicado al puntaje. Un torneo puede usar otro sistema, pero tiene que estar anunciado de antemano.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 10',
  },
  {
    id: 'com_lista_inicial', area: 'competicion', peso: 1,
    enunciado: 'Antes de emparejar la primera ronda de un suizo, ¿cómo se ordena la lista de jugadores?',
    opciones: [
      'Por rating, de mayor a menor, con criterios para los empates.',
      'Por orden alfabético del apellido de cada jugador inscrito.',
      'Por orden de inscripción en el torneo, del primero al último.',
      'Por sorteo público delante de todos los jugadores inscritos.',
    ],
    correcta: 0,
    explica: 'Ese orden inicial es el número de cada jugador y se usa toda la competición: los emparejamientos y los desempates se apoyan en él.',
    fuente: 'Reglas generales de manejo del sistema suizo, orden inicial (Handbook C.04.2)',
  },
  {
    id: 'com_rondas_anunciadas', area: 'competicion', peso: 1,
    enunciado: '¿Cuándo se define el número de rondas de un torneo suizo?',
    opciones: [
      'Antes de empezar, y se anuncia en las bases del torneo.',
      'Al terminar la mitad del torneo, según cuántos vayan invictos.',
      'Cuando quede un solo jugador con puntaje perfecto.',
      'Lo decide el árbitro ronda a ronda, según el tiempo disponible.',
    ],
    correcta: 0,
    explica: 'De ahí sale todo lo demás: el número de rondas condiciona los emparejamientos, los desempates y hasta si el torneo sirve para normas.',
    fuente: 'Reglas básicas del sistema suizo (Handbook C.04.1)',
  },
  {
    id: 'com_alternancia_color', area: 'competicion', peso: 2,
    enunciado: 'En un suizo, ¿qué se busca con los colores a lo largo del torneo?',
    opciones: [
      'Que se alternen y que la diferencia entre colores sea mínima.',
      'Que cada jugador lleve siempre el mismo color que en la ronda inicial.',
      'Que el color lo elija el jugador mejor clasificado de la mesa.',
      'Que los colores se sorteen de nuevo en cada ronda del torneo.',
    ],
    correcta: 0,
    explica: 'El sistema mira dos cosas: la diferencia acumulada de colores y el color de la última ronda. De ahí salen las preferencias fuerte, suave y absoluta.',
    fuente: 'Sistema suizo de la FIDE (Handbook C.04.1 y C.04.3)',
  },
  {
    id: 'com_bye_solicitado', area: 'competicion', peso: 2,
    enunciado: 'Un jugador avisa antes que no puede jugar una ronda y el reglamento lo permite. ¿Qué recibe?',
    opciones: [
      'Medio punto, si el reglamento del torneo lo prevé así.',
      'Un punto entero, igual que quien queda libre por emparejamiento.',
      'Cero puntos y además queda fuera del torneo.',
      'El promedio de los puntos que lleve hasta esa ronda.',
    ],
    correcta: 0,
    explica: 'Conviene no confundirlos: el descanso por emparejamiento (número impar) suele valer un punto, y el solicitado, medio. Lo fija el reglamento y no cuenta para rating.',
    fuente: 'Reglas básicas del sistema suizo (Handbook C.04.1)',
  },
  {
    id: 'com_encuentro_directo', area: 'competicion', peso: 2,
    enunciado: '¿Cuándo se puede usar el encuentro directo como desempate?',
    opciones: [
      'Si algunos o todos los empatados se enfrentaron entre sí.',
      'Siempre: es el primer desempate en cualquier torneo suizo.',
      'Solo cuando los empatados son exactamente dos jugadores.',
      'Solo en torneos de todos contra todos, nunca en un suizo.',
    ],
    correcta: 0,
    explica: 'No hace falta que se hayan enfrentado TODOS: si alguno queda claramente arriba de los demás pase lo que pase con las partidas que faltan, ya se lo puede ordenar primero. Si nada queda definido, se pasa al siguiente desempate de la lista anunciada.',
    fuente: 'Reglas de desempate (Handbook C.07), encuentro directo',
  },
  {
    id: 'com_sonneborn_calculo', area: 'competicion', peso: 3,
    enunciado: '¿Cómo se calcula el Sonneborn-Berger de un jugador?',
    opciones: [
      'Sumando el puntaje de los vencidos y la mitad del de los empatados.',
      'Sumando el puntaje de todos sus rivales, les ganara o no les ganara.',
      'Restando al propio puntaje el de los rivales que le ganaron.',
      'Multiplicando su puntaje por el promedio de rating de sus rivales.',
    ],
    correcta: 0,
    explica: 'Premia haberles ganado a los que terminaron arriba. Por eso encaja bien en torneos de todos contra todos, donde todos juegan contra todos.',
    fuente: 'Reglas de desempate (Handbook C.07)',
  },
  {
    id: 'com_buchholz_cut1', area: 'competicion', peso: 4,
    enunciado: '¿Qué le hace al Buchholz el recorte conocido como "Cut-1"?',
    opciones: [
      'Le quita el puntaje del rival que terminó más abajo.',
      'Le quita el puntaje del rival que terminó más arriba.',
      'Le quita la primera ronda, que empareja por rating.',
      'Le quita al total un punto fijo por cada ronda no jugada.',
    ],
    correcta: 0,
    explica: 'Un solo rival que se retiró y perdió todo puede hundir un Buchholz sin culpa del jugador. Por eso la FIDE recomienda el Cut-1 como primer desempate.',
    fuente: 'Reglas de desempate (Handbook C.07)',
  },
  {
    id: 'com_flotante', area: 'competicion', peso: 4,
    enunciado: 'En el sistema holandés, ¿qué es un jugador "flotante" (floater)?',
    opciones: [
      'El que juega contra alguien de otro grupo de puntuación.',
      'El que queda libre porque el número de jugadores es impar.',
      'El que cambió de grupo por un error del programa.',
      'El que pidió no jugar esa ronda y recibió medio punto.',
    ],
    correcta: 0,
    explica: 'Cuando un grupo tiene un número impar, alguien tiene que bajar o subir. El sistema procura que no le toque siempre a los mismos.',
    fuente: 'Sistema holandés de la FIDE (Handbook C.04.3)',
  },
  {
    id: 'com_progresivo', area: 'competicion', peso: 5,
    enunciado: '¿Qué mide el desempate progresivo (acumulativo)?',
    opciones: [
      'La suma de los puntajes que el jugador tenía tras cada ronda.',
      'La suma de los ratings de los rivales, ronda por ronda.',
      'La cantidad de partidas ganadas con piezas negras.',
      'La diferencia de puntos entre la primera y la última ronda.',
    ],
    correcta: 0,
    explica: 'Favorece a quien arrancó fuerte, porque esos puntos se suman en todas las rondas siguientes. Es un criterio discutido y por eso casi nunca va primero.',
    fuente: 'Reglas de desempate (Handbook C.07)',
  },
  {
    id: 'com_promedio_rivales', area: 'competicion', peso: 5,
    enunciado: '¿Qué mide el desempate por promedio de rating de los rivales?',
    opciones: [
      'La fuerza media de los rivales que ese jugador enfrentó.',
      'El rating que el jugador tendrá en la lista siguiente.',
      'El promedio de rating de todo el torneo, como referencia.',
      'La diferencia entre el rating del jugador y el de sus rivales.',
    ],
    correcta: 0,
    explica: 'Sirve para distinguir a quien anduvo por las mesas de arriba. Como los rivales no jugados distorsionan el promedio, el reglamento dice cómo tratarlos.',
    fuente: 'Reglas de desempate (Handbook C.07)',
  },
  {
    id: 'com_equipos_puntos', area: 'competicion', peso: 5,
    enunciado: 'En un torneo por equipos, ¿qué decide si manda el puntaje de encuentro o el de tableros?',
    opciones: [
      'El reglamento del torneo, anunciado antes de empezar.',
      'Siempre los puntos de tablero, que son los que se juegan.',
      'Siempre los puntos de encuentro, como en las olimpiadas.',
      'El árbitro principal, al terminar la última ronda.',
    ],
    correcta: 0,
    explica: 'Las dos formas son válidas y cambian por completo la tabla final. Por eso tiene que estar escrito antes, junto con el orden de los desempates.',
    fuente: 'Sistema de emparejamiento por equipos (Handbook B.06 Anexo 1) y reglas de desempate (Handbook C.07)',
  },

  /* ---------- El árbitro: títulos, categorías y deberes ---------- */
  {
    id: 'tit_titulo_permanente', area: 'titulos', peso: 1,
    enunciado: 'Una vez otorgado, ¿cuánto dura un título de árbitro de la FIDE?',
    opciones: [
      'Es permanente, aunque la licencia haya que mantenerla.',
      'Dura cuatro años y hay que volver a rendir el examen.',
      'Dura mientras el árbitro dirija al menos un torneo al año.',
      'Dura hasta que la federación nacional decida retirarlo.',
    ],
    correcta: 0,
    explica: 'Conviene separar tres cosas: el título es de por vida, la licencia se renueva y se paga, y la categoría depende de la actividad reciente.',
    fuente: 'Reglamento de títulos de árbitro (Handbook B.06.1)',
  },
  {
    id: 'tit_que_es_seminario', area: 'titulos', peso: 1,
    enunciado: '¿Qué es un "seminario de árbitros" de la FIDE?',
    opciones: [
      'Un curso aprobado por la FIDE que termina con un examen.',
      'Una reunión anual de los árbitros de cada federación.',
      'El torneo de práctica que un candidato debe dirigir.',
      'La entrevista final antes de recibir el título de árbitro.',
    ],
    correcta: 0,
    explica: 'Lo dicta un formador habilitado y con programa aprobado. Aprobar el examen del seminario es uno de los pasos del camino al título.',
    fuente: 'Reglamento de formación de árbitros (Handbook B.06.2)',
  },
  {
    id: 'tit_edad_minima', area: 'titulos', peso: 1,
    enunciado: '¿Hay una edad mínima para los títulos de árbitro de la FIDE?',
    opciones: [
      'Sí: el reglamento fija una edad mínima para cada título.',
      'No: cualquier persona puede pedir el título a cualquier edad.',
      'Sí, pero solo para el título de Árbitro Internacional.',
      'No, aunque hace falta el permiso de la federación si es menor.',
    ],
    correcta: 0,
    explica: 'Se pide edad mínima y también experiencia real dirigiendo torneos. La cifra exacta la fija el reglamento vigente y conviene consultarla cada año.',
    fuente: 'Reglamento de títulos de árbitro (Handbook B.06.1)',
  },
  {
    id: 'tit_arbitro_no_juega', area: 'titulos', peso: 2,
    enunciado: '¿Puede un árbitro jugar el torneo que está dirigiendo?',
    opciones: [
      'No: no se puede arbitrar y competir en el mismo torneo.',
      'Sí, si no es el árbitro principal sino un adjunto.',
      'Sí, si lo autoriza por escrito la federación nacional.',
      'Sí, siempre que no juegue en las mesas que le tocan arbitrar.',
    ],
    correcta: 0,
    explica: 'Es lo más básico de la imparcialidad: quien tiene algo en juego en la tabla no puede decidir sobre las partidas que la arman.',
    fuente: 'Reglamento de árbitros de la FIDE (Handbook B.06), deberes y ética del árbitro',
  },
  {
    id: 'tit_torneo_valido_norma', area: 'titulos', peso: 2,
    enunciado: '¿En qué torneos se puede obtener una norma de árbitro?',
    opciones: [
      'En los que cumplen requisitos de nivel y organización.',
      'En cualquier torneo, con tal de que sea válido para rating.',
      'Solo en los campeonatos nacionales de cada federación.',
      'Solo en torneos organizados directamente por la FIDE.',
    ],
    correcta: 0,
    explica: 'El reglamento fija cantidad de jugadores, federaciones representadas, rondas y composición del equipo arbitral. Sin eso, el trabajo no vale como norma.',
    fuente: 'Reglamento de títulos de árbitro (Handbook B.06.1)',
  },
  {
    id: 'tit_fide_id', area: 'titulos', peso: 2,
    enunciado: '¿Qué identifica a un árbitro en los registros de la FIDE?',
    opciones: [
      'Un número de identificación propio, con su ficha pública.',
      'El número de licencia de su federación, distinto en cada país.',
      'Su nombre completo, que es único en la base de datos.',
      'El número del primer torneo internacional que dirigió.',
    ],
    correcta: 0,
    explica: 'Con ese número se cargan las normas, la licencia y la categoría, y es lo que se pone en el informe de cada torneo válido para rating.',
    fuente: 'Reglamento de títulos de árbitro (Handbook B.06.1)',
  },
  {
    id: 'tit_comision_arbitros', area: 'titulos', peso: 3,
    enunciado: '¿Qué organismo de la FIDE se ocupa de los títulos y las licencias de árbitro?',
    opciones: [
      'La Comisión de Árbitros, que estudia cada solicitud.',
      'La Comisión de Reglas, que además redacta las Leyes del juego.',
      'La Comisión Técnica de cada continente por separado.',
      'La Junta Directiva de la federación nacional del candidato.',
    ],
    correcta: 0,
    explica: 'Conviene no confundirla con la Comisión de Reglas: una escribe e interpreta las Leyes, la otra forma, titula, clasifica y sanciona a quienes arbitran.',
    fuente: 'Reglamento de árbitros de la FIDE (Handbook B.06)',
  },
  {
    id: 'tit_norma_del_seminario', area: 'titulos', peso: 3,
    enunciado: 'Aprobar el examen del seminario de árbitros, ¿qué aporta al candidato?',
    opciones: [
      'Cuenta como una de las normas exigidas para el título.',
      'Le da el título de inmediato, sin necesidad de normas.',
      'Solo le permite inscribirse: no cuenta para nada más.',
      'Le renueva la licencia por los cuatro años siguientes.',
    ],
    correcta: 0,
    explica: 'Es la puerta de entrada: una norma sale del seminario y las demás, de dirigir torneos que cumplan los requisitos.',
    fuente: 'Reglamento de títulos de árbitro (Handbook B.06.1 y B.06.2)',
  },
  {
    id: 'tit_disciplinario', area: 'titulos', peso: 4,
    enunciado: 'Un árbitro comete una falta grave dirigiendo un torneo. ¿Qué puede pasarle?',
    opciones: [
      'Ser sancionado, hasta quedar descalificado por un tiempo.',
      'Nada: el título es permanente y no se puede tocar.',
      'Solo que no lo vuelvan a invitar a ese mismo torneo.',
      'Una multa, que es la única sanción que existe para árbitros.',
    ],
    correcta: 0,
    explica: 'Hay un reglamento disciplinario propio, con su procedimiento y su derecho de defensa. La sanción más dura es la descalificación (hasta 18 meses la primera vez, hasta 24 si reincide): mientras dura, no se lo puede designar ni oficiar en ningún torneo válido para rating de la FIDE. El título en sí no se pierde, aunque quede inutilizable mientras la sanción esté vigente.',
    fuente: 'Reglamento disciplinario de árbitros (Handbook B.06.5), art. 4',
  },
  {
    id: 'tit_apelacion_deposito', area: 'titulos', peso: 5,
    enunciado: '¿Qué suele exigir el reglamento de un torneo para presentar una apelación?',
    opciones: [
      'Un escrito dentro de un plazo, y a veces un depósito.',
      'Solo decírselo de palabra al árbitro principal en la sala.',
      'La firma de los dos jugadores de la partida que se discute.',
      'Esperar a que termine el torneo para no interrumpir las rondas.',
    ],
    correcta: 0,
    explica: 'El plazo corto evita que una ronda quede en el aire y el depósito filtra las apelaciones de trámite: se devuelve si la apelación prospera (y puede devolverse igual, en parte, si no prospera pero el comité la considera razonable). El Handbook exige las dos cosas en general; el monto exacto del depósito y el plazo en horas o días los fija el reglamento de cada torneo.',
    fuente: 'Reglamento general de competiciones (Handbook C.05), procedimiento de apelaciones',
  },
  {
    id: 'tit_decision_se_aplica_ya', area: 'titulos', peso: 5,
    enunciado: 'Un jugador anuncia que va a apelar una decisión del árbitro. ¿Qué pasa mientras tanto con la partida?',
    opciones: [
      'Sigue con la decisión del árbitro ya aplicada.',
      'Se detiene hasta que el comité de apelación resuelva el caso.',
      'Se declara tablas provisionales hasta la resolución.',
      'Se reanuda desde la posición anterior a la decisión.',
    ],
    correcta: 0,
    explica: 'Si cada apelación congelara la ronda, el torneo se detendría. El árbitro decide, la partida sigue y el comité repara después si corresponde — es lo que hace posible el propio artículo 12, que le pide al árbitro hacer cumplir sus decisiones ("enforce decisions he/she has made") mientras supervisa el resto de la competición.',
    fuente: 'Leyes del Ajedrez 2023 (Handbook E.I.01), art. 12.2, y Manual del árbitro (ARB)',
  },
  {
    id: 'tit_categoria_a_eventos', area: 'titulos', peso: 5,
    enunciado: '¿Para qué sirve, en la práctica, estar en la categoría A de la clasificación de árbitros?',
    opciones: [
      'Para ser designado en los eventos mundiales de más nivel.',
      'Para cobrar honorarios más altos en cualquier tipo de torneo.',
      'Para no tener que renovar nunca más la licencia anual.',
      'Para poder dictar seminarios de formación de árbitros.',
    ],
    correcta: 0,
    explica: 'La categoría se revisa según la experiencia reciente, así que un árbitro puede subir y bajar. El título no cambia; lo que cambia es a qué eventos puede aspirar.',
    fuente: 'Reglamento de clasificación de árbitros (Handbook B.06.3)',
  },
];

/* ===== Cómo se arma cada examen =====
 *
 * El banco es más grande que el examen: cada intento sortea sus preguntas, así
 * que repetirlo no es repetir de memoria. Lo que no cambia es la forma —5
 * preguntas por área, una de cada escalón de dificultad, 40 en total y 120
 * puntos—, para que dos exámenes del mismo árbitro (o de dos árbitros
 * distintos) se puedan comparar.
 *
 *   ArbitrajePrueba.armar()          → las 40 preguntas de un examen nuevo (todos los escalones)
 *   ArbitrajePrueba.armar(ids)       → las mismas, respetando lo ya contestado
 *   ArbitrajePrueba.armar(ids,sem,3) → un examen con TECHO: solo escalones 1 a 3
 *   ArbitrajePrueba.porIds(ids)      → recupera un examen guardado
 *
 * El techo es lo que arma los "tres exámenes más" (Nacional, FIDE,
 * Internacional): no son tres bancos separados, son el mismo banco cortado en
 * el escalón que a cada título le toca — exactamente el mismo mapeo peso↔nivel
 * que ya usa js/arbitraje-nivel.js (3=nacional, 4=FIDE, 5=internacional). Un
 * examen con techo 3 nunca puede alcanzar el escalón 4, así que el cálculo de
 * nivel de ArbitrajeNivel.resumir() no necesita ningún cambio: se limita solo
 * porque no hay preguntas más difíciles para ofrecerle.
 */
window.ArbitrajePrueba = (function () {
  "use strict";

  const FORMA = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };   // preguntas por escalón, en cada área
  const AREAS = ['leyes', 'reloj', 'irregularidades', 'tablas', 'conducta', 'ritmos', 'competicion', 'titulos'];
  const PESOS = [1, 2, 3, 4, 5];
  const BANCO = window.ARBITRAJE_ITEMS;
  const porId = {};
  BANCO.forEach((i) => { porId[i.id] = i; });

  const pesosHasta = (techo) => (techo ? PESOS.filter((p) => p <= techo) : PESOS);
  const totalPara = (techo) => AREAS.length * pesosHasta(techo).reduce((t, w) => t + FORMA[w], 0);
  const puntosPara = (techo) => AREAS.length * pesosHasta(techo).reduce((t, w) => t + FORMA[w] * w, 0);

  const TOTAL = totalPara(null);
  const PUNTOS = puntosPara(null);

  /* Los "tres exámenes más": mismo banco, con techo de escalón y su propio
     tiempo (menos preguntas, menos minutos). `etiqueta` es la misma que ya usa
     ArbitrajeNivel.NIVELES para ese escalón, para no inventar una segunda. */
  const NIVELES_EXAMEN = [
    { clave: 'nacional', techo: 3, etiqueta: 'Árbitro Nacional', minutos: 30 },
    { clave: 'fide', techo: 4, etiqueta: 'Árbitro FIDE', minutos: 40 },
    { clave: 'internacional', techo: 5, etiqueta: 'Árbitro Internacional', minutos: 50 },
  ];
  const NIVEL_EXAMEN_POR_CLAVE = {};
  NIVELES_EXAMEN.forEach((n) => { NIVEL_EXAMEN_POR_CLAVE[n.clave] = n; });

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

  function armar(fijos, semilla, techo) {
    const rnd = azar(typeof semilla === "number" ? semilla : Math.floor(Math.random() * 2147483647));
    const pesos = pesosHasta(techo);
    const yaEstan = porIds(fijos).filter((i) => pesos.indexOf(i.peso) !== -1);
    const usados = {};
    yaEstan.forEach((i) => { usados[i.id] = true; });

    const elegidos = [];
    AREAS.forEach((area) => {
      const falta = {};
      pesos.forEach((w) => { falta[w] = FORMA[w]; });
      yaEstan.filter((i) => i.area === area).forEach((i) => { if (falta[i.peso] > 0) falta[i.peso] -= 1; });
      pesos.forEach((peso) => {
        const candidatos = barajar(BANCO.filter((i) => i.area === area && i.peso === peso && !usados[i.id]), rnd);
        while (falta[peso] > 0 && candidatos.length) {
          const item = candidatos.shift();
          usados[item.id] = true;
          elegidos.push(item);
          falta[peso] -= 1;
        }
      });
      // Si al área le faltan preguntas de algún escalón, se completa con las que
      // haya (sin pasarse del techo), empezando por la dificultad más parecida.
      pesos.forEach((peso) => {
        while (falta[peso] > 0) {
          const resto = BANCO.filter((i) => i.area === area && !usados[i.id] && pesos.indexOf(i.peso) !== -1)
            .sort((a, b) => Math.abs(a.peso - peso) - Math.abs(b.peso - peso));
          if (!resto.length) break;
          usados[resto[0].id] = true;
          elegidos.push(resto[0]);
          falta[peso] -= 1;
        }
      });
    });

    // El examen va área por área y, dentro de cada una, de menos a más difícil.
    elegidos.sort((a, b) => (AREAS.indexOf(a.area) - AREAS.indexOf(b.area)) || (a.peso - b.peso));
    return yaEstan.concat(elegidos);
  }

  return {
    FORMA, AREAS, PESOS, TOTAL, PUNTOS, armar, porIds,
    NIVELES_EXAMEN, NIVEL_EXAMEN_POR_CLAVE, totalPara, puntosPara,
  };
})();
