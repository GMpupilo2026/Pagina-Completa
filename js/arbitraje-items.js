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
 *   tablas          Planilla y tablas: reclamaciones y automatismos (art. 8-9)
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
      'Cuando suelta la pieza en la casilla de destino.',
      'Cuando presiona el reloj después de haber movido.',
      'Cuando el rival levanta su propia pieza para responder.',
      'Cuando termina de anotar la jugada en la planilla.',
    ],
    correcta: 0,
    explica: 'La jugada se hace al soltar la pieza; presionar el reloj es lo que la completa a efectos del control de tiempo, pero la jugada en sí ya está hecha cuando la mano suelta la pieza.',
    fuente: 'Leyes del Ajedrez, art. 4.7 y 6.2.1',
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
    fuente: 'Leyes del Ajedrez, art. 4.2 y 4.3',
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
    fuente: 'Leyes del Ajedrez, art. 4.2.1',
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
    fuente: 'Leyes del Ajedrez, art. 4.4.b',
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
    fuente: 'Leyes del Ajedrez, art. 4.4.a',
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
    fuente: 'Leyes del Ajedrez, art. 4.6 y 3.7.5',
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
    explica: 'La partida termina ahí mismo, sin reclamación: nadie puede dar mate ni siquiera con la peor serie de jugadas legales del rival (rey contra rey, por ejemplo).',
    fuente: 'Leyes del Ajedrez, art. 5.2.2',
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
    fuente: 'Leyes del Ajedrez, art. 5.1.1 y 5.2.1',
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
    fuente: 'Leyes del Ajedrez, art. 3.7.4.1',
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
    fuente: 'Leyes del Ajedrez, art. 4.3.2 y 4.5',
  },
  {
    id: 'ley_dos_manos', area: 'leyes', peso: 4,
    enunciado: 'Un jugador enroca usando las dos manos: una para el rey y otra para la torre. ¿Qué hace el árbitro?',
    opciones: [
      'Sanciona la conducta: se juega con una sola mano.',
      'Nada, mientras las dos piezas terminen en su casilla.',
      'Declara la jugada ilegal y suma dos minutos al rival.',
      'Obliga a deshacer el enroque y a mover solo el rey.',
    ],
    correcta: 0,
    explica: 'Cada jugada se hace con una sola mano, y con esa misma mano se presiona el reloj. Usar las dos no vuelve ilegal la jugada: es una infracción de conducta y se sanciona según el artículo 12.9.',
    fuente: 'Leyes del Ajedrez, art. 4.1 y 6.2.b',
  },
  {
    id: 'ley_abandono', area: 'leyes', peso: 5,
    enunciado: 'Un jugador abandona, pero en el tablero su rival no tenía ninguna serie de jugadas legales para dar mate. ¿Cuál es el resultado?',
    opciones: [
      'Pierde el que abandonó: el abandono cierra la partida.',
      'Tablas, porque el rival no podía dar mate de ninguna forma.',
      'El árbitro anula el abandono y la partida continúa.',
      'Tablas, pero solo si el que abandonó lo reclama enseguida.',
    ],
    correcta: 0,
    explica: 'El abandono es distinto de la caída de bandera: no tiene la salvedad del material insuficiente. El que abandona pierde, aunque el rival no hubiera podido dar mate nunca.',
    fuente: 'Leyes del Ajedrez, art. 5.1.2 (comparar con 6.9)',
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
    fuente: 'Leyes del Ajedrez, art. 6.9',
  },
  {
    id: 'rel_quien_reclama', area: 'reloj', peso: 3,
    enunciado: 'En una partida de ritmo clásico con árbitro presente, cae una bandera y nadie dice nada. ¿Qué corresponde?',
    opciones: [
      'El árbitro la declara, sin esperar reclamación.',
      'Solo vale si el rival la reclama antes de mover.',
      'Se espera a que terminen la partida y se revisa.',
      'La partida sigue: sin reclamación no hay bandera.',
    ],
    correcta: 0,
    explica: 'En ritmo clásico el árbitro aplica las Leyes de oficio, y la caída de bandera es un hecho observable. En relámpago, en cambio, la bandera la reclama el jugador.',
    fuente: 'Leyes del Ajedrez, art. 6.8 y 12.2 (comparar con el apéndice B)',
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
    fuente: 'Leyes del Ajedrez, art. 6.7.1',
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
    fuente: 'Leyes del Ajedrez, art. 6.2.b',
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
    fuente: 'Leyes del Ajedrez, art. 6.10 y 6.11',
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
    fuente: 'Leyes del Ajedrez, art. 6.3.a y 8.4',
  },
  {
    id: 'rel_presionar_sin_mover', area: 'reloj', peso: 4,
    enunciado: 'Un jugador presiona el reloj sin haber hecho ninguna jugada. ¿Qué corresponde?',
    opciones: [
      'Es infracción y se sanciona según el artículo 12.9.',
      'El rival gana la partida de inmediato, sin aviso.',
      'Nada: el reloj corre y ya, es problema suyo.',
      'Se le descuentan dos minutos de forma automática.',
    ],
    correcta: 0,
    explica: 'Presionar sin mover no está previsto como jugada ilegal, sino como conducta indebida: el árbitro elige la sanción de la lista del 12.9, que empieza por la advertencia.',
    fuente: 'Leyes del Ajedrez, art. 6.2.2 y 12.9',
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
    fuente: 'Leyes del Ajedrez, art. 6.12.1',
  },
  {
    id: 'rel_ambas_banderas', area: 'reloj', peso: 4,
    enunciado: 'Se advierte que cayeron las dos banderas y no se puede saber cuál cayó primero. ¿Qué resultado corresponde en ritmo clásico?',
    opciones: [
      'La partida sigue, salvo en la última fase: ahí son tablas.',
      'Gana quien tenga mejor posición a juicio del árbitro principal.',
      'Pierden los dos y se les anota media derrota a cada uno.',
      'Gana quien lo reclame primero ante el árbitro de sala.',
    ],
    correcta: 0,
    explica: 'Si las dos banderas cayeron y no se puede determinar el orden, la partida sigue si todavía quedan controles por delante; en la última fase del control, son tablas.',
    fuente: 'Leyes del Ajedrez, art. 6.11.2',
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
    explica: 'Las Leyes le dan al árbitro la facultad de reponer los tiempos con su mejor criterio, incluidos los del reclamante. La reclamación tardía no obliga a devolver todo el tiempo perdido.',
    fuente: 'Leyes del Ajedrez, art. 6.10.2 y 6.11',
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
    fuente: 'Leyes del Ajedrez, art. 6.7.1 y 6.1',
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
    fuente: 'Leyes del Ajedrez, art. 7.5.1 y 7.5.5',
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
    fuente: 'Leyes del Ajedrez, art. 7.5.5',
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
    fuente: 'Leyes del Ajedrez, art. 7.5.1',
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
    fuente: 'Leyes del Ajedrez, art. 7.3',
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
    fuente: 'Leyes del Ajedrez, art. 7.2',
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
    fuente: 'Leyes del Ajedrez, art. 7.2 (y guía de aplicación)',
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
    fuente: 'Leyes del Ajedrez, art. 7.4',
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
    fuente: 'Leyes del Ajedrez, art. 7.1 y 7.5',
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
    fuente: 'Leyes del Ajedrez, art. 3.9.2 y 7.5',
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
    explica: 'El peón no puede quedarse en la octava: hasta que la pieza nueva no está puesta, la jugada no está hecha. Presionar el reloj así la completa como ilegal.',
    fuente: 'Leyes del Ajedrez, art. 4.6 y 7.5.1',
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
    fuente: 'Leyes del Ajedrez, art. 7.5.5',
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
    fuente: 'Leyes del Ajedrez, art. 8.1.1',
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
    fuente: 'Leyes del Ajedrez, art. 8.4',
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
    fuente: 'Leyes del Ajedrez, art. 9.2',
  },
  {
    id: 'tab_como_reclamar', area: 'tablas', peso: 3,
    enunciado: 'Un jugador quiere reclamar tablas por repetición con una jugada que todavía no hizo. ¿Cómo procede?',
    opciones: [
      'Anota la jugada sin jugarla, para el reloj y llama al árbitro.',
      'Hace la jugada, presiona el reloj y recién entonces reclama.',
      'Anuncia la reclamación en voz alta y espera sin tocar nada.',
      'Reclama al terminar la partida, mostrando su planilla firmada.',
    ],
    correcta: 0,
    explica: 'La jugada que produciría la repetición se anota pero no se juega. Si se juega, la reclamación ya es otra: la de la posición que quedó en el tablero.',
    fuente: 'Leyes del Ajedrez, art. 9.2.1',
  },
  {
    id: 'tab_reclamacion_falsa', area: 'tablas', peso: 4,
    enunciado: 'Un jugador reclama tablas por repetición en ritmo clásico y la reclamación es incorrecta. ¿Qué pasa?',
    opciones: [
      'Da dos minutos al rival y se juega la jugada anunciada.',
      'Pierde la partida por haber reclamado tablas en falso.',
      'No pasa nada: se sigue jugando, sin ninguna clase de sanción.',
      'Se le descuentan dos minutos de su propio reloj y sigue.',
    ],
    correcta: 0,
    explica: 'La reclamación errónea le cuesta dos minutos al reclamante en beneficio del rival (uno en rápidas y relámpago desde 2023), y hay que jugar la jugada anunciada.',
    fuente: 'Leyes del Ajedrez, art. 9.5.2',
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
    fuente: 'Leyes del Ajedrez, art. 9.3',
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
    fuente: 'Leyes del Ajedrez, art. 9.6',
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
    fuente: 'Leyes del Ajedrez, art. 9.1.2.1',
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
    fuente: 'Leyes del Ajedrez, art. 11.5 y 12.9',
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
    fuente: 'Leyes del Ajedrez, art. 9.1.3',
  },
  {
    id: 'tab_planilla_arbitro', area: 'tablas', peso: 5,
    enunciado: 'Un jugador con menos de cinco minutos y sin incremento dejó de anotar, y ahora quiere reclamar tablas por 50 jugadas. ¿Qué hace el árbitro?',
    opciones: [
      'Puede aceptarla si logra verificarla por otros medios.',
      'La rechaza siempre: sin planilla completa no hay reclamación.',
      'La acepta siempre: el jugador estaba autorizado a no anotar.',
      'Manda reconstruir la planilla con el rival antes de decidir.',
    ],
    correcta: 0,
    explica: 'La reclamación necesita prueba. Sin planilla, el árbitro puede apoyarse en lo que haya observado o en el registro electrónico; sin nada de eso, no hay cómo darla por buena.',
    fuente: 'Leyes del Ajedrez, art. 8.5 y 9.5',
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
    fuente: 'Leyes del Ajedrez, art. 11.3.2.1',
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
    fuente: 'Leyes del Ajedrez, art. 11.3.2.1',
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
    fuente: 'Leyes del Ajedrez, art. 12.9',
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
    fuente: 'Leyes del Ajedrez, art. 12.9',
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
    explica: 'Analizar dentro de la sala está prohibido mientras haya partidas en curso: distrae y puede dar información. Para eso están las salas de análisis.',
    fuente: 'Leyes del Ajedrez, art. 11.3.1',
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
    fuente: 'Leyes del Ajedrez, art. 11.3.1 y 12.9',
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
    fuente: 'Leyes del Ajedrez, art. 11.1 y 12.9',
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
    fuente: 'Leyes del Ajedrez, art. 11.2.3 y 11.2.4',
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
    fuente: 'Leyes del Ajedrez, art. 11.10',
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
    fuente: 'Leyes del Ajedrez, art. 11.8 y 12.8',
  },
  {
    id: 'con_no_intervenir', area: 'conducta', peso: 5,
    enunciado: 'El árbitro ve que un jugador va a dejar caer su bandera por distracción. ¿Qué debe hacer?',
    opciones: [
      'No intervenir: no avisa banderas ni reclamaciones.',
      'Avisarle, porque su deber es cuidar la deportividad.',
      'Avisar solo si el jugador es menor de edad o principiante.',
      'Detener el reloj hasta que el jugador reaccione y mire.',
    ],
    correcta: 0,
    explica: 'El árbitro no juega la partida: no señala jugadas, ni banderas a punto de caer, ni reclamaciones disponibles. Intervenir de más es de los errores más graves del oficio.',
    fuente: 'Leyes del Ajedrez, art. 12.6',
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
    fuente: 'Leyes del Ajedrez, art. 11.1, 12.2 y protocolo antitrampa de la FIDE',
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
    fuente: 'Leyes del Ajedrez, apéndice B.1',
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
    fuente: 'Leyes del Ajedrez, apéndice A.1',
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
    explica: 'Hasta 2022 eran dos minutos; desde 2023 las rápidas se igualaron al relámpago con un minuto. Lo mismo vale para la reclamación de tablas incorrecta.',
    fuente: 'Leyes del Ajedrez 2023, apéndices A.4 y B.3',
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
    explica: 'En relámpago manda el jugador: si responde con su jugada, la posición queda validada y ya no hay reclamación posible.',
    fuente: 'Leyes del Ajedrez, apéndice B.3 (y A.4 para rápidas sin supervisión)',
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
    explica: 'Sin obligación de anotar, la planilla deja de ser prueba: por eso en estos ritmos las reclamaciones dependen mucho más de lo que el árbitro observe.',
    fuente: 'Leyes del Ajedrez, apéndices A.2 y B.2',
  },
  {
    id: 'rit_arbitro_supervision', area: 'ritmos', peso: 4,
    enunciado: 'En rápidas con supervisión adecuada (un árbitro por pocas partidas), ¿cómo se tratan las jugadas ilegales?',
    opciones: [
      'Como en clásico, con el árbitro interviniendo de oficio.',
      'Igual que en relámpago, solo a reclamación del jugador.',
      'No se sancionan: en rápidas todo vale si nadie protesta.',
      'Se anota el incidente y se resuelve al final de la ronda.',
    ],
    correcta: 0,
    explica: 'El apéndice A distingue los dos escenarios: con supervisión suficiente se aplican las reglas de competición normales; sin ella, se pasa al régimen de reclamación del jugador.',
    fuente: 'Leyes del Ajedrez, apéndice A.3 y A.4',
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
    explica: 'La reclamación es del jugador, y es válida siempre que él mismo no haya excedido su tiempo. Un espectador nunca puede intervenir.',
    fuente: 'Leyes del Ajedrez, apéndice B.4 y art. 11.8',
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
    fuente: 'Leyes del Ajedrez, art. 8.1 y apéndice C',
  },
  {
    id: 'rit_quickplay', area: 'ritmos', peso: 5,
    enunciado: 'En un final sin incremento, con menos de dos minutos, un jugador reclama tablas porque su rival no hace ningún progreso. ¿Qué puede hacer el árbitro?',
    opciones: [
      'Aplicar el apéndice G si el reglamento lo adoptó.',
      'Rechazarla siempre: esa reclamación ya no existe.',
      'Aceptarla, porque hay menos de dos minutos en el reloj.',
      'Declarar tablas solo si los dos jugadores lo piden.',
    ],
    correcta: 0,
    explica: 'Es la regla del "final rápido sin incremento", que un reglamento puede adoptar. El árbitro puede posponer la decisión y quedarse mirando la partida antes de resolver.',
    fuente: 'Leyes del Ajedrez, apéndice G (finales rápidos sin incremento)',
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
    fuente: 'Leyes del Ajedrez, apéndice F (jugadores con discapacidad)',
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
    fuente: 'Reglas de emparejamiento, C.04.1',
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
    fuente: 'Reglas de emparejamiento, C.04.1',
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
    fuente: 'Reglas de emparejamiento, C.04.1 y C.04.3',
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
    fuente: 'Reglas de emparejamiento, C.04.3 (sistema holandés)',
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
    fuente: 'Reglas de desempate, C.07',
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
    fuente: 'Reglas de desempate, C.07',
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
    fuente: 'Reglas de desempate, C.07 (partidas no jugadas)',
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
    fuente: 'Reglas de desempate, C.07 y práctica de organización',
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
    fuente: 'Reglas de emparejamiento, C.04 (programas homologados por la FIDE)',
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
    fuente: 'Reglas de rating, B.02',
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
    fuente: 'Leyes del Ajedrez, art. 8.7 y reglamento del torneo',
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
    fuente: 'Leyes del Ajedrez, art. 12.2.3 y manual del árbitro',
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
    fuente: 'Leyes del Ajedrez, art. 12.1 y 12.2',
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
    fuente: 'Reglamento de títulos de árbitro, B.06.1',
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
    fuente: 'Reglamento de títulos de árbitro, B.06.1 y B.06.2',
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
    fuente: 'Reglamento de títulos de árbitro, B.06.1',
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
    fuente: 'Reglamento de clasificación de árbitros, B.06.3',
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
    fuente: 'Reglamento de títulos de árbitro, B.06.1',
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
    fuente: 'Código ético de la FIDE y deberes del árbitro (B.06, art. 12)',
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
    fuente: 'Reglamento de rating, B.02 y deberes del árbitro',
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
    fuente: 'Manual del árbitro de la FIDE (organización del equipo arbitral)',
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
    fuente: 'Leyes del Ajedrez, prefacio y art. 6.7, 11.3.2',
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
    fuente: 'Leyes del Ajedrez, prefacio',
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
    fuente: 'Leyes del Ajedrez, art. 11.10 y reglamento del torneo',
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
    fuente: 'Leyes del Ajedrez, art. 3.9 y 3.8',
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
    fuente: 'Leyes del Ajedrez, art. 7.5.1 y 4.3',
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
    fuente: 'Leyes del Ajedrez, art. 6.1 y 6.7',
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
    fuente: 'Leyes del Ajedrez, art. 5.2.1 y 9.1',
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
    fuente: 'Leyes del Ajedrez, art. 5.2.2 (comparar con 6.9)',
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
    fuente: 'Leyes del Ajedrez, art. 11.3.2',
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
    explica: 'Los apéndices no sustituyen a las Leyes: las modifican en lo que dicen expresamente (anotación, ilegales, reclamaciones) y en todo lo demás rige el texto general.',
    fuente: 'Leyes del Ajedrez, apéndices A y B',
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
    fuente: 'Reglas de emparejamiento, C.04',
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
    fuente: 'Reglamento de títulos de árbitro, B.06.1 y B.06.2',
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
    fuente: 'Leyes del Ajedrez, art. 5.2.1',
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
 *   ArbitrajePrueba.armar()       → las 40 preguntas de un examen nuevo
 *   ArbitrajePrueba.armar(ids)    → las mismas, respetando lo ya contestado
 *   ArbitrajePrueba.porIds(ids)   → recupera un examen guardado
 */
window.ArbitrajePrueba = (function () {
  "use strict";

  const FORMA = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };   // preguntas por escalón, en cada área
  const AREAS = ['leyes', 'reloj', 'irregularidades', 'tablas', 'conducta', 'ritmos', 'competicion', 'titulos'];
  const PESOS = [1, 2, 3, 4, 5];
  const BANCO = window.ARBITRAJE_ITEMS;
  const porId = {};
  BANCO.forEach((i) => { porId[i.id] = i; });

  const TOTAL = AREAS.length * PESOS.reduce((t, w) => t + FORMA[w], 0);
  const PUNTOS = AREAS.length * PESOS.reduce((t, w) => t + FORMA[w] * w, 0);

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

  function armar(fijos, semilla) {
    const rnd = azar(typeof semilla === "number" ? semilla : Math.floor(Math.random() * 2147483647));
    const yaEstan = porIds(fijos);
    const usados = {};
    yaEstan.forEach((i) => { usados[i.id] = true; });

    const elegidos = [];
    AREAS.forEach((area) => {
      const falta = {};
      PESOS.forEach((w) => { falta[w] = FORMA[w]; });
      yaEstan.filter((i) => i.area === area).forEach((i) => { if (falta[i.peso] > 0) falta[i.peso] -= 1; });
      PESOS.forEach((peso) => {
        const candidatos = barajar(BANCO.filter((i) => i.area === area && i.peso === peso && !usados[i.id]), rnd);
        while (falta[peso] > 0 && candidatos.length) {
          const item = candidatos.shift();
          usados[item.id] = true;
          elegidos.push(item);
          falta[peso] -= 1;
        }
      });
      // Si al área le faltan preguntas de algún escalón, se completa con las que
      // haya, empezando por la dificultad más parecida.
      PESOS.forEach((peso) => {
        while (falta[peso] > 0) {
          const resto = BANCO.filter((i) => i.area === area && !usados[i.id])
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

  return { FORMA, AREAS, PESOS, TOTAL, PUNTOS, armar, porIds };
})();
