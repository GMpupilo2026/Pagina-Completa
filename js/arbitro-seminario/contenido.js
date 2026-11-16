/* El contenido de la sala de seminario de arbitraje (arbitro.html).

   Son las lecciones del seminario de Árbitro FIDE (AF) de IA Oscar Angulo
   Cubero: tres días (viernes, sábado y domingo), cinco temas por día, cada
   uno con sus diapositivas y sus preguntas, y el banco del examen de
   práctica. Revisado contra la normativa vigente en noviembre de 2026 (Leyes
   del Ajedrez 2023, C.04 desde el 1/2/2026, C.07, B.01, B.02 y B.06.1).

   - `correcta` es el índice de la opción buena tal como está escrita: la
     página baraja las opciones al mostrarlas, así que el orden de acá no se
     ve.
   - Cada `fen` es una posición legal: lo comprueba
     herramientas/verificar-seminario-arbitraje.js con chess.js.
   - El id de cada tema es el que se guarda en la sala
     (`seminario_salas.tema`): no se cambia sin cuidar las salas abiertas.

   Ver «La sala de seminario de arbitraje» en
   docs/decisiones/permisos-y-roles.md. */
window.SEMINARIO_CONTENIDO = {
 "modulos": [
  {
   "id": "viernes",
   "nombre": "Viernes · Leyes del Ajedrez",
   "temas": [
    {
     "id": "tocada",
     "titulo": "Pieza tocada",
     "diapositivas": [
      {
       "titulo": "Si tocas, juegas",
       "parrafos": [
        "El jugador con el turno que toca deliberadamente una pieza propia debe moverla; si toca una rival, debe capturarla.",
        "Si toca una propia y una rival: captura con la propia; si no se puede, mueve o captura la primera tocada que se pueda."
       ],
       "articulo": "Art. 4.3",
       "icono": "✋"
      },
      {
       "titulo": "“Compongo” antes, no después",
       "parrafos": [
        "Para acomodar una pieza sin obligación hay que decir “compongo” antes de tocarla, y solo con el turno."
       ],
       "articulo": "Art. 4.2",
       "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
       "pie": "Si toca la torre de h1 antes que el rey, no puede enrocar corto en esta jugada"
      },
      {
       "titulo": "Enroque",
       "parrafos": [
        "Rey y torre tocados: debe enrocar a ese lado si es legal.",
        "Si toca primero la torre, no puede enrocar con ella en esa jugada.",
        "Si el enroque es ilegal, debe hacer otra jugada de rey (puede ser el otro enroque)."
       ],
       "articulo": "Art. 4.4",
       "fen": "r3k2r/ppp2ppp/2n5/3q4/8/8/PPP2PPP/R3K2R w KQkq - 0 1",
       "pie": "0-0-0 es ilegal: la dama negra controla d1"
      },
      {
       "titulo": "¿Hasta cuándo se puede reclamar?",
       "parrafos": [
        "El rival pierde el derecho a reclamar pieza tocada en cuanto toca una pieza con intención de moverla.",
        "El árbitro no interviene de oficio en pieza tocada."
       ],
       "articulo": "Art. 4.8",
       "icono": "⚠️"
      }
     ],
     "preguntas": [
      {
       "texto": "Con el turno, el blanco toca primero la torre de h1 y luego el rey, queriendo enrocar corto (diagrama). ¿Qué debe hacer?",
       "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
       "opciones": [
        "Mover la torre: Tf1 o Tg1",
        "Enrocar corto, porque tocó rey y torre",
        "Mover el rey a f1",
        "Jugar lo que quiera, sin obligación"
       ],
       "correcta": 0,
       "explicacion": "Al tocar primero la torre pierde el enroque con ella en esta jugada y rige la pieza tocada sobre la torre (Art. 4.4.2)."
      },
      {
       "texto": "El blanco toca rey y torre de a1 para enrocar largo, pero d1 está atacada (diagrama). ¿Qué debe jugar?",
       "fen": "r3k2r/ppp2ppp/2n5/3q4/8/8/PPP2PPP/R3K2R w KQkq - 0 1",
       "opciones": [
        "Otra jugada de rey legal: Re2, Rf1 o 0-0",
        "Mover la torre de a1",
        "Cualquier jugada",
        "Debe enrocar largo igualmente"
       ],
       "correcta": 0,
       "explicacion": "Art. 4.4.3: si el enroque es ilegal, debe hacer otra jugada legal con el rey, incluido el enroque con la otra torre."
      },
      {
       "texto": "El negro suelta la torre en f1, la vuelve a tomar y juega …Tf2+. El blanco, sin reclamar, toca su rey y juega. El árbitro lo vio. ¿Qué hace?",
       "opciones": [
        "Nada: el blanco perdió el derecho a reclamar y la partida sigue",
        "Obliga a jugar …Tf1",
        "Da 2 minutos al blanco",
        "Declara la jugada ilegal"
       ],
       "correcta": 0,
       "explicacion": "La jugada era …Tf1 (Art. 4.7), pero el rival perdió el derecho al tocar su rey sin reclamar (Art. 4.8)."
      },
      {
       "texto": "¿Cuándo es definitiva la pieza elegida al coronar?",
       "opciones": [
        "Cuando toca la casilla de promoción",
        "Cuando el jugador la toca fuera del tablero",
        "Cuando pulsa el reloj",
        "Cuando el rival la acepta"
       ],
       "correcta": 0,
       "explicacion": "Art. 4.6.3 (pieza de promoción): la elección es definitiva cuando la pieza toca la casilla de coronación."
      }
     ]
    },
    {
     "id": "ilegal",
     "titulo": "Jugadas ilegales",
     "diapositivas": [
      {
       "titulo": "Hecha no es completada",
       "parrafos": [
        "Una jugada se completa al pulsar el reloj.",
        "Antes de pulsar se puede corregir una ilegal sin sanción, pero sigue la pieza tocada."
       ],
       "articulo": "Art. 4.6, 6.2, 7.5.1",
       "icono": "⏱️"
      },
      {
       "titulo": "Qué se sanciona como ilegal",
       "parrafos": [
        "Cualquier jugada contra el Art. 3, y además:"
       ],
       "lista": [
        "Peón en 8.ª sin cambiar: se pone una dama",
        "Pulsar el reloj sin mover",
        "Usar las dos manos para una jugada",
        "Mover dos veces seguidas"
       ],
       "articulo": "Art. 7.5.2–7.5.4",
       "icono": "⚠️"
      },
      {
       "titulo": "La sanción",
       "parrafos": [
        "Restablecer la posición anterior; aplicar pieza tocada.",
        "1.ª ilegal: +2 min al rival (rápidas y blitz: +1 min).",
        "2.ª ilegal: pierde, salvo que el rival no pueda dar mate."
       ],
       "articulo": "Art. 7.5.5",
       "icono": "➡️"
      },
      {
       "titulo": "El caballo clavado",
       "parrafos": [
        "Cg2xe3 es ilegal: el caballo está clavado por el alfil de b7.",
        "Tocó caballo y torre: debe capturar la torre con otra pieza (Dxe3 o fxe3)."
       ],
       "articulo": "Art. 4.3.3",
       "fen": "6k1/1b3ppp/8/8/8/4r3/3Q1PNP/7K w - - 0 1"
      }
     ],
     "preguntas": [
      {
       "texto": "El blanco juega 6.Cc3, no pulsa, sale de la sala; al volver juega 7.Ae3 y pulsa. ¿Qué decide el árbitro?",
       "opciones": [
        "Jugada ilegal (dos seguidas): posición tras 6.Cc3, +2 min al negro",
        "No es ilegal; solo advertencia",
        "Pierde el blanco",
        "La partida sigue con 7.Ae3"
       ],
       "correcta": 0,
       "explicacion": "Los jugadores mueven alternativamente (Art. 1.1). Mover dos veces seguidas es jugada ilegal."
      },
      {
       "texto": "Rápidas 15+10. El negro corona capturando con dos manos y deja el peón en d1. ¿Sanción?",
       "opciones": [
        "Una jugada ilegal: dama negra y +1 min al blanco",
        "Dos jugadas ilegales: pierde el negro",
        "+2 min al blanco",
        "Ninguna, porque no hubo jaque"
       ],
       "correcta": 0,
       "explicacion": "Varias infracciones en una acción cuentan como una ilegal. En rápidas y blitz son 1 minuto."
      },
      {
       "texto": "Ese mismo negro, después, pulsa el reloj sin mover. El blanco tiene material de sobra. ¿Resultado?",
       "opciones": [
        "Pierde el negro (segunda ilegal)",
        "+1 min al blanco",
        "Tablas",
        "Advertencia"
       ],
       "correcta": 0,
       "explicacion": "Pulsar sin mover se sanciona como ilegal (7.5.3). Es la segunda: pierde."
      },
      {
       "texto": "En blitz, el blanco hace una ilegal y pulsa; el negro no reclama y responde. Luego reclama. ¿Qué pasa?",
       "opciones": [
        "La ilegal ya no se corrige",
        "Se corrige y +1 min",
        "Pierde el blanco",
        "Se juega de nuevo la partida"
       ],
       "correcta": 0,
       "explicacion": "En rápidas/blitz, una vez hecha la jugada siguiente del rival, la ilegal queda (salvo acuerdo de los jugadores sin el árbitro)."
      },
      {
       "texto": "El blanco mueve el alfil como caballo, lo devuelve antes de pulsar y juega otra pieza. ¿Qué decide el árbitro?",
       "opciones": [
        "Sin sanción, pero debe mover el alfil",
        "+2 min al negro",
        "Pierde",
        "Nada: puede jugar otra pieza"
       ],
       "correcta": 0,
       "explicacion": "No se completó la ilegal (no pulsó), pero tocó el alfil: debe moverlo si tiene jugada legal."
      }
     ]
    },
    {
     "id": "reloj",
     "titulo": "Reloj y bandera",
     "diapositivas": [
      {
       "titulo": "Bandera caída",
       "parrafos": [
        "Pierde quien no completa sus jugadas a tiempo…",
        "…salvo que el rival no pueda dar mate con ninguna serie de jugadas legales: tablas."
       ],
       "articulo": "Art. 6.9",
       "icono": "⏱️"
      },
      {
       "titulo": "“Jugadas legales”, no pieza tocada",
       "parrafos": [
        "La obligación de pieza tocada no cuenta al evaluar el 6.9.",
        "Si el jugador tiene otras jugadas, el rival podría dar mate: gana.",
        "Solo si la única jugada legal da mate, es tablas."
       ],
       "articulo": "Art. 6.9",
       "fen": "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
       "pie": "Toca la torre y cae la bandera: gana el negro"
      },
      {
       "titulo": "Lo que termina la partida en el acto",
       "parrafos": [
        "Mate, ahogado, posición muerta, 75 jugadas y quíntuple repetición.",
        "Lo que pasa después no cuenta."
       ],
       "articulo": "Art. 5, 9.6",
       "fen": "7k/5Q2/6K1/8/8/8/8/8 b - - 0 60",
       "pie": "Ahogado: tablas, aunque luego caiga una bandera"
      },
      {
       "titulo": "Reloj mal configurado",
       "parrafos": [
        "Pausar, anotar tiempos, configurar bien y ajustar con el mejor criterio (por ejemplo, sumar incrementos que faltaron)."
       ],
       "articulo": "Art. 6.10.2",
       "icono": "⏱️"
      }
     ],
     "preguntas": [
      {
       "texto": "El blanco jugó 1.Dc7 y pulsó; luego se ve su bandera caída. ¿Resultado?",
       "fen": "k7/2Q5/1K6/8/8/8/8/8 b - - 0 1",
       "opciones": [
        "½–½",
        "1–0",
        "0–1",
        "Se sigue jugando"
       ],
       "correcta": 0,
       "explicacion": "1.Dc7 ahoga al negro: la partida terminó antes que la bandera."
      },
      {
       "texto": "El blanco jugó 1.Dc7 y pulsó; luego se ve su bandera caída. ¿Resultado?",
       "fen": "k7/2Q5/1K6/7p/8/8/8/8 b - - 0 1",
       "opciones": [
        "0–1",
        "½–½",
        "1–0",
        "Pierden los dos"
       ],
       "correcta": 0,
       "explicacion": "El negro puede jugar …h4: no hay ahogado. Con rey y peón podría dar mate con alguna serie de jugadas legales."
      },
      {
       "texto": "Cae la bandera del blanco. El negro tiene rey y caballo; el blanco, rey y torre. ¿Resultado?",
       "opciones": [
        "0–1 (existe mate de ayuda)",
        "½–½",
        "1–0",
        "Depende del árbitro"
       ],
       "correcta": 0,
       "explicacion": "Con rey y torre blancos existe una serie de jugadas legales que termina en mate del caballo."
      },
      {
       "texto": "Tras 11 jugadas, ninguno recibe los 30 s de incremento. ¿Qué hace el árbitro?",
       "opciones": [
        "Corrige y suma 11 × 30 s a cada uno",
        "Sanciona a quien avisó",
        "Nada, la partida sigue",
        "Repite la partida"
       ],
       "correcta": 0,
       "explicacion": "Art. 6.10.2: reloj mal configurado; se corrige con el mejor criterio."
      }
     ]
    },
    {
     "id": "tablas",
     "titulo": "Tablas",
     "diapositivas": [
      {
       "titulo": "Ofrecer tablas",
       "parrafos": [
        "Se ofrece tras mover y antes de pulsar.",
        "No se puede retirar: vale hasta que el rival la acepte, la rechace o toque una pieza."
       ],
       "articulo": "Art. 9.1.2",
       "icono": "🤝"
      },
      {
       "titulo": "Triple repetición",
       "parrafos": [
        "Reclama quien tiene el turno: escribiendo la jugada sin hacerla, o justo cuando aparece la posición.",
        "Misma posición = mismo turno, mismas piezas y mismas jugadas posibles (enroque y al paso incluidos)."
       ],
       "articulo": "Art. 9.2",
       "icono": "✍️"
      },
      {
       "titulo": "Si la reclamación falla",
       "parrafos": [
        "+2 minutos al rival y la partida sigue.",
        "Si escribió la jugada, debe jugarla.",
        "La reclamación es también un ofrecimiento de tablas."
       ],
       "articulo": "Art. 9.5",
       "icono": "⏱️"
      },
      {
       "titulo": "Al paso y posición muerta",
       "parrafos": [
        "Tras …h7-h5, gxh6 a.p. todavía es posible: no es posición muerta.",
        "Si el blanco juega otra cosa, se pierde ese derecho: tablas por posición muerta."
       ],
       "articulo": "Art. 9.6.2",
       "fen": "2b5/6k1/4p1p1/1p1pP1Pp/1P1P3P/4K3/1P6/8 w - h6 0 1"
      }
     ],
     "preguntas": [
      {
       "texto": "El negro ofrece tablas antes de mover; el blanco pide que mueva primero y acepta 5 minutos después. El negro dice que ya no vale.",
       "opciones": [
        "Tablas: la oferta seguía vigente",
        "La oferta caducó al mover",
        "El árbitro decide la sanción",
        "Gana el blanco"
       ],
       "correcta": 0,
       "explicacion": "La oferta no se puede retirar y no fue rechazada (Art. 9.1.2)."
      },
      {
       "texto": "Reclamación de triple repetición con la jugada escrita, y resulta incorrecta. ¿Consecuencia?",
       "opciones": [
        "+2 min al rival y debe jugar la jugada escrita",
        "Pierde la partida",
        "Puede jugar otra jugada",
        "+1 min al rival"
       ],
       "correcta": 0,
       "explicacion": "Art. 9.5."
      },
      {
       "texto": "La primera aparición de la posición fue cuando el rey negro aún podía enrocar; las otras dos no. ¿Hay triple repetición?",
       "opciones": [
        "No: con distinto derecho a enrocar no es la misma posición",
        "Sí: las piezas están en las mismas casillas",
        "Sí, si el árbitro lo considera",
        "Solo en blitz"
       ],
       "correcta": 0,
       "explicacion": "Art. 9.2.3: las jugadas posibles deben ser las mismas."
      },
      {
       "texto": "Se cumplen 75 jugadas sin captura ni movimiento de peón.",
       "opciones": [
        "Tablas automáticas, aunque nadie reclame",
        "Tablas solo si un jugador reclama",
        "La partida sigue",
        "Gana quien tiene más material"
       ],
       "correcta": 0,
       "explicacion": "Art. 9.6.2. Con 50 jugadas solo hay derecho a reclamar."
      }
     ]
    },
    {
     "id": "conducta",
     "titulo": "Anotación, conducta y rápidas",
     "diapositivas": [
      {
       "titulo": "La planilla",
       "parrafos": [
        "Cada jugador anota sus jugadas y las del rival.",
        "Puede responder antes de anotar la jugada del rival, pero debe anotar la suya antes de mover otra vez."
       ],
       "articulo": "Art. 8.1",
       "icono": "✍️"
      },
      {
       "titulo": "¿Cuándo se puede dejar de anotar?",
       "parrafos": [
        "Con menos de 5 minutos y sin incremento de 30 s o más.",
        "Con 90 + 30 s nunca se deja de anotar."
       ],
       "articulo": "Art. 8.4",
       "icono": "⏱️"
      },
      {
       "titulo": "Teléfonos",
       "parrafos": [
        "Si es evidente que un jugador trajo un dispositivo a la zona de juego: pierde y el rival gana.",
        "Aunque el rival no tenga material para dar mate."
       ],
       "articulo": "Art. 11.3",
       "icono": "📵"
      },
      {
       "titulo": "Sanciones posibles",
       "parrafos": [],
       "lista": [
        "Advertencia",
        "Más tiempo al rival / menos al infractor",
        "Más puntos al rival o menos al infractor",
        "Partida perdida",
        "Expulsión"
       ],
       "articulo": "Art. 12.9",
       "icono": "🛡️"
      }
     ],
     "preguntas": [
      {
       "texto": "40/90 + 30 min + 30 s. Al blanco le quedan 3 minutos y deja de anotar.",
       "opciones": [
        "Debe anotar: hay incremento de 30 s",
        "Puede dejar de anotar",
        "Solo anota el rival",
        "El árbitro anota por él"
       ],
       "correcta": 0,
       "explicacion": "Art. 8.4 solo exime sin un incremento de 30 s o más."
      },
      {
       "texto": "Suena un teléfono en el bolsillo de un jugador; el rival tiene solo el rey.",
       "opciones": [
        "Pierde el del teléfono y el rival gana",
        "Tablas",
        "Advertencia",
        "Se descuentan 2 min"
       ],
       "correcta": 0,
       "explicacion": "Art. 11.3.2: pierde la partida y el rival gana."
      },
      {
       "texto": "Un jugador mueve con una mano y pulsa con la otra.",
       "opciones": [
        "Infracción sancionable (12.9), no jugada ilegal",
        "Jugada ilegal",
        "Pierde",
        "Nada"
       ],
       "correcta": 0,
       "explicacion": "Art. 6.2.3 y 12.9."
      },
      {
       "texto": "Con 4 segundos, el negro tira varias piezas y pulsa sin colocarlas.",
       "opciones": [
        "Debe reponerlas con su propio tiempo; puede ser sancionado",
        "El blanco las repone con su tiempo",
        "Pierde automáticamente",
        "Se para el reloj sin más"
       ],
       "correcta": 0,
       "explicacion": "Art. 7.4."
      }
     ]
    }
   ]
  },
  {
   "id": "sabado",
   "nombre": "Sábado · Reglamentos",
   "temas": [
    {
     "id": "regla",
     "titulo": "Reglas de competición",
     "diapositivas": [
      {
       "titulo": "Las bases mandan",
       "parrafos": [
        "Sistema, ritmo, tiempo de incomparecencia (0 si no se dice otra cosa), desempates y apelaciones se fijan antes del torneo."
       ],
       "articulo": "Regulaciones generales",
       "icono": "✍️"
      },
      {
       "titulo": "Apelación válida",
       "parrafos": [],
       "lista": [
        "Por escrito",
        "Dentro del plazo de las bases",
        "Con la cuota pagada a tiempo",
        "La resuelve el Comité de Apelaciones"
       ],
       "articulo": "Regulaciones generales",
       "icono": "🛡️"
      },
      {
       "titulo": "Equipamiento",
       "parrafos": [
        "Tablero, piezas, relojes y sala siguen los estándares de equipamiento de la FIDE (C.02). Revísalos antes de la ronda 1."
       ],
       "articulo": "C.02",
       "icono": "📋"
      }
     ],
     "preguntas": [
      {
       "texto": "¿Qué apelación es válida?",
       "opciones": [
        "Por escrito, en plazo y con cuota",
        "Verbal al árbitro principal",
        "Por escrito, sin importar el plazo",
        "Sin cuota si la decisión fue polémica"
       ],
       "correcta": 0,
       "explicacion": "Requisitos de las Regulaciones generales."
      },
      {
       "texto": "Las bases no fijan tiempo de incomparecencia. ¿Cuál rige?",
       "opciones": [
        "Cero",
        "15 minutos",
        "30 minutos",
        "Una hora"
       ],
       "correcta": 0,
       "explicacion": "Si no se especifica, es 0."
      },
      {
       "texto": "Un capitán insulta a un jugador rival antes de la ronda.",
       "opciones": [
        "Retirarlo de la sala, informar al principal y al informe",
        "Dar la partida por perdida al equipo",
        "Ignorarlo",
        "Expulsar al jugador insultado"
       ],
       "correcta": 0,
       "explicacion": "Conducta del capitán: retirarlo, informar y registrar."
      }
     ]
    },
    {
     "id": "sistemas",
     "titulo": "Sistemas de juego",
     "diapositivas": [
      {
       "titulo": "Todos contra todos",
       "parrafos": [
        "Tablas Berger. Con número impar, se usa la tabla par siguiente: el rival del número fantasma descansa."
       ],
       "articulo": "Sistemas de juego",
       "icono": "📋"
      },
      {
       "titulo": "Misma federación",
       "parrafos": [
        "Las tablas Varma (9 a 24 jugadores) hacen que los jugadores de una federación se enfrenten pronto.",
        "Con 8 jugadores: números Berger 4, 5 y 6 se cruzan en las rondas 1 a 3."
       ],
       "articulo": "Anexo Varma",
       "icono": "🌐"
      },
      {
       "titulo": "Suizo, Scheveningen y KO",
       "parrafos": [
        "Suizo: rivales de igual puntuación, sin repetir.",
        "Scheveningen: cada jugador de un equipo contra todos los del otro.",
        "KO: minimatches con desempates rápidos."
       ],
       "articulo": "Sistemas de juego",
       "icono": "👥"
      }
     ],
     "preguntas": [
      {
       "texto": "Todos contra todos de 9 jugadores: ¿cómo se asigna el descanso?",
       "opciones": [
        "Tabla de 10: descansa el rival del número 10",
        "Descansa el de menor rating",
        "Por sorteo cada ronda",
        "No hay descanso"
       ],
       "correcta": 0,
       "explicacion": "El número 10 es fantasma."
      },
      {
       "texto": "Tabla Berger de 6: ¿en qué ronda juegan 2 y 3?",
       "opciones": [
        "Ronda 4",
        "Ronda 1",
        "Ronda 3",
        "Ronda 5"
       ],
       "correcta": 0,
       "explicacion": "R4: 6–5, 1–4, 2–3. Compruébalo en la herramienta Berger."
      },
      {
       "texto": "¿Para cuántos jugadores sirven las tablas Varma?",
       "opciones": [
        "De 9 a 24",
        "De 4 a 8",
        "Cualquier número",
        "Solo 10"
       ],
       "correcta": 0,
       "explicacion": "Anexo de las Regulaciones generales."
      }
     ]
    },
    {
     "id": "desempates",
     "titulo": "Desempates",
     "diapositivas": [
      {
       "titulo": "Se anuncian antes",
       "parrafos": [
        "Los desempates se fijan y publican antes del torneo y no se cambian."
       ],
       "articulo": "C.07",
       "icono": "🏆"
      },
      {
       "titulo": "Cuál usar",
       "parrafos": [],
       "lista": [
        "Suizo: Buchholz corte 1, Buchholz, encuentro directo",
        "Todos contra todos: encuentro directo, Sonneborn-Berger, victorias",
        "Equipos por puntos de match: puntos de tablero"
       ],
       "articulo": "C.07",
       "icono": "📋"
      },
      {
       "titulo": "Cómo se calculan",
       "parrafos": [
        "Buchholz: suma de puntos de los rivales. Corte 1: quita el peor.",
        "Sonneborn-Berger: puntos de los rivales vencidos + mitad de los empatados."
       ],
       "articulo": "C.07",
       "icono": "📈"
      },
      {
       "titulo": "Partidas no jugadas",
       "parrafos": [
        "Tienen reglas especiales y cambiaron en 2026: revisa la versión vigente antes de calcular."
       ],
       "articulo": "C.07 Art. 16",
       "icono": "⚠️"
      }
     ],
     "preguntas": [
      {
       "texto": "Rivales con 4, 5,5, 6, 3, 5, 4,5, 7 puntos. ¿Buchholz corte 1?",
       "opciones": [
        "32",
        "35",
        "31",
        "29"
       ],
       "correcta": 0,
       "explicacion": "35 − 3 = 32."
      },
      {
       "texto": "Liga de equipos todos contra todos por puntos de match: ¿mejor primer desempate?",
       "opciones": [
        "Puntos de tablero",
        "Puntos de match",
        "Buchholz",
        "Número de victorias individuales"
       ],
       "correcta": 0,
       "explicacion": "Los puntos de match son el criterio principal."
      },
      {
       "texto": "¿Se pueden cambiar los desempates a mitad de torneo si todos aceptan?",
       "opciones": [
        "No",
        "Sí",
        "Solo el árbitro principal",
        "Solo en la última ronda"
       ],
       "correcta": 0,
       "explicacion": "Se fijan antes y no se modifican."
      }
     ]
    },
    {
     "id": "fairplay",
     "titulo": "Juego limpio",
     "diapositivas": [
      {
       "titulo": "Prevenir",
       "parrafos": [
        "Control de dispositivos, detector manual, zona de juego delimitada, vigilancia discreta de ausencias."
       ],
       "articulo": "Antitrampas",
       "icono": "🛡️"
      },
      {
       "titulo": "Documentar",
       "parrafos": [
        "La denuncia va por escrito con el formulario. Las verbales no se tramitan.",
        "“Juega más fuerte que su Elo” no es fundamento."
       ],
       "articulo": "Antitrampas",
       "icono": "✍️"
      },
      {
       "titulo": "Informar",
       "parrafos": [
        "En sala se aplica el Art. 11.3.",
        "La investigación y las sanciones posteriores son de los órganos de la FIDE.",
        "Nunca acusar en público."
       ],
       "articulo": "Antitrampas",
       "icono": "⚠️"
      }
     ],
     "preguntas": [
      {
       "texto": "Un jugador te dice en voz baja que sospecha de su rival. ¿Qué haces?",
       "opciones": [
        "Pedir denuncia escrita con formulario y vigilar discretamente",
        "Revisar al rival delante de todos",
        "Detener la partida",
        "Ignorarlo"
       ],
       "correcta": 0,
       "explicacion": "Formulario, observación discreta, registro de ausencias."
      },
      {
       "texto": "¿Basta “juega demasiado bien para su Elo” para una denuncia?",
       "opciones": [
        "No, es manifiestamente infundada",
        "Sí",
        "Solo si es GM",
        "Solo en blitz"
       ],
       "correcta": 0,
       "explicacion": "Reglamento antitrampas."
      },
      {
       "texto": "El intento de hacer trampa, ¿cómo se trata?",
       "opciones": [
        "Como trampa",
        "No se sanciona",
        "Solo advertencia",
        "Depende del resultado"
       ],
       "correcta": 0,
       "explicacion": "El intento cuenta como trampa."
      }
     ]
    },
    {
     "id": "relojes",
     "titulo": "Uso del reloj",
     "diapositivas": [
      {
       "titulo": "Modos",
       "parrafos": [],
       "lista": [
        "Fischer: incremento fijo por jugada",
        "Bronstein: devuelve lo usado hasta un máximo",
        "Retardo: unos segundos de gracia",
        "Por periodos: 90/40 + 30"
       ],
       "articulo": "H1",
       "icono": "⏱️"
      },
      {
       "titulo": "Antes de la ronda",
       "parrafos": [
        "Prueba tiempo, incremento y segundo periodo en cada reloj."
       ],
       "articulo": "H1",
       "icono": "🛡️"
      },
      {
       "titulo": "Sin contador de jugadas",
       "parrafos": [
        "Si cae la bandera del primer periodo, verifica en las planillas si se completaron las 40 jugadas."
       ],
       "articulo": "Art. 6.9",
       "icono": "✍️"
      }
     ],
     "preguntas": [
      {
       "texto": "¿Qué modo suma una cantidad fija tras cada jugada?",
       "opciones": [
        "Fischer",
        "Bronstein",
        "Retardo",
        "Por periodos"
       ],
       "correcta": 0,
       "explicacion": "Incremento Fischer."
      },
      {
       "texto": "El reloj deja de funcionar a mitad de partida.",
       "opciones": [
        "Se cambia y el árbitro fija tiempos con su mejor criterio",
        "Se repite la partida",
        "Tablas",
        "Se juega sin reloj"
       ],
       "correcta": 0,
       "explicacion": "Art. 6.10.1. Una planilla de control de tiempos ayuda."
      },
      {
       "texto": "Clasifica 30 min + 30 s por jugada.",
       "opciones": [
        "Estándar (30 + 30 = 60)",
        "Rápida",
        "Blitz",
        "No válido"
       ],
       "correcta": 0,
       "explicacion": "60 minutos ya es estándar."
      }
     ]
    }
   ]
  },
  {
   "id": "domingo",
   "nombre": "Domingo · Suizo, rating y títulos",
   "temas": [
    {
     "id": "suizo",
     "titulo": "Sistema suizo (holandés 2026)",
     "diapositivas": [
      {
       "titulo": "Ranking inicial",
       "parrafos": [
        "Rating → título (GM, IM, WGM, FM, WIM, CM, WFM, WCM) → orden alfabético.",
        "Los números (TPN) no cambian después de emparejar la 4.ª ronda."
       ],
       "articulo": "C.04.2",
       "icono": "📋"
      },
      {
       "titulo": "Ronda 1",
       "parrafos": [
        "Mitad superior contra mitad inferior. Impar: el último recibe el bye asignado.",
        "Color inicial por sorteo; alterna en cada mesa."
       ],
       "articulo": "C.04.3",
       "icono": "👥"
      },
      {
       "titulo": "Criterios absolutos",
       "parrafos": [],
       "lista": [
        "C1: no repetir rival",
        "C2: no dar el bye a quien ya lo tuvo o ya sumó sin jugar los puntos de una victoria",
        "C3: no emparejar a dos con la misma preferencia absoluta (salvo topscorers)"
       ],
       "articulo": "C.04.3 Art. 2.1",
       "icono": "⚠️"
      },
      {
       "titulo": "Colores",
       "parrafos": [],
       "lista": [
        "Absoluta: diferencia mayor que ±1 o mismo color dos veces seguidas",
        "Fuerte: diferencia ±1",
        "Leve: diferencia 0",
        "Reglas 5.2.1–5.2.5: ambas, la más fuerte, alternar, mejor clasificado, TPN impar"
       ],
       "articulo": "C.04.3 Art. 5",
       "icono": "📈"
      },
      {
       "titulo": "Novedades 2026",
       "parrafos": [],
       "lista": [
        "Criterios de calidad C5–C21; C5 minimiza la puntuación de quien recibe el bye",
        "Flotación solo por bye asignado o puntos sin jugar mayores que una derrota",
        "Sin PSD, PPB ni grupo colapsado; criterio de completitud C4"
       ],
       "articulo": "Vigente desde 1/2/2026",
       "icono": "➡️"
      }
     ],
     "preguntas": [
      {
       "texto": "Dos jugadoras con 2267 y título IM: Cori y Krush. ¿Cómo se ordenan?",
       "opciones": [
        "Cori antes que Krush (alfabético)",
        "Krush antes que Cori",
        "Por sorteo",
        "Por edad"
       ],
       "correcta": 0,
       "explicacion": "Mismo rating y título: orden alfabético."
      },
      {
       "texto": "11 jugadoras, la n.º 1 juega con negras en la ronda 1. ¿Primera mesa?",
       "opciones": [
        "6–1",
        "1–6",
        "1–7",
        "7–1"
       ],
       "correcta": 0,
       "explicacion": "S1 1–5, S2 6–10, la 11 descansa: 6–1, 2–7, 8–3, 4–9, 10–5."
      },
      {
       "texto": "Historial B N B: ¿qué preferencia tiene?",
       "opciones": [
        "Fuerte por negras (diferencia +1)",
        "Absoluta por negras",
        "Leve",
        "Ninguna"
       ],
       "correcta": 0,
       "explicacion": "2 blancas − 1 negra = +1."
      },
      {
       "texto": "En la versión 2026, ¿un bye de 0 puntos cuenta como flotación descendente?",
       "opciones": [
        "No",
        "Sí",
        "Solo en la última ronda",
        "Solo con rating"
       ],
       "correcta": 0,
       "explicacion": "Art. 1.4.3: solo el bye asignado o puntos sin jugar mayores que una derrota."
      }
     ]
    },
    {
     "id": "arbitros",
     "titulo": "Títulos de árbitros",
     "diapositivas": [
      {
       "titulo": "Árbitro FIDE (FA)",
       "parrafos": [
        "Árbitro Nacional, seminario FA aprobado con 80 % o más y 3 normas en eventos válidos (4 normas en total con el seminario)."
       ],
       "articulo": "B.06.1 (vigente desde 1/3/2026)",
       "icono": "🛡️"
      },
      {
       "titulo": "Normas por evento",
       "parrafos": [],
       "lista": [
        "Suizo: 1 por cada 25 jugadores o fracción",
        "Todos contra todos: máximo 2",
        "Al menos 2 sistemas distintos, salvo suizo de 100+ jugadores, 30 % con rating y 7 rondas"
       ],
       "articulo": "B.06.1",
       "icono": "📋"
      },
      {
       "titulo": "Árbitro Internacional (IA)",
       "parrafos": [
        "Ser FA y reunir 5 normas (una del seminario IA), posteriores al título FA."
       ],
       "articulo": "B.06.1",
       "icono": "🏆"
      }
     ],
     "preguntas": [
      {
       "texto": "Suizo de 60 jugadores: ¿cuántos certificados de norma como máximo?",
       "opciones": [
        "3",
        "2",
        "4",
        "1"
       ],
       "correcta": 0,
       "explicacion": "60 ÷ 25 = 2,4 → 3."
      },
      {
       "texto": "Todos contra todos de 10: ¿cuántos certificados?",
       "opciones": [
        "Máximo 2",
        "10",
        "5",
        "1"
       ],
       "correcta": 0,
       "explicacion": "Límite para todos contra todos."
      },
      {
       "texto": "Con dos normas de suizos normales, la siguiente debe ser…",
       "opciones": [
        "De otro sistema, o un suizo de 100+ jugadores",
        "Otro suizo cualquiera",
        "Un torneo de blitz",
        "No necesita más"
       ],
       "correcta": 0,
       "explicacion": "Dos sistemas distintos, salvo la excepción de 100+."
      }
     ]
    },
    {
     "id": "rating",
     "titulo": "Rating FIDE",
     "diapositivas": [
      {
       "titulo": "La fórmula",
       "parrafos": [
        "Por partida: diferencia D (máx. 400) → probabilidad PD.",
        "Cambio = K × (puntos − suma de PD)."
       ],
       "articulo": "B.02",
       "icono": "📈"
      },
      {
       "titulo": "Factor K",
       "parrafos": [],
       "lista": [
        "40: nuevos hasta 30 partidas, y menores (hasta fin del año en que cumplen 18) con menos de 2300",
        "20: siempre por debajo de 2400",
        "10: alcanzó 2400 alguna vez",
        "Si K × partidas > 700, K = 700 ÷ partidas"
       ],
       "articulo": "B.02",
       "icono": "📋"
      },
      {
       "titulo": "Practica en la herramienta",
       "parrafos": [
        "La calculadora de Elo de esta plataforma usa la tabla FIDE de probabilidades. Prueba con el ejemplo: 2377 contra 2428, 10 partidas, 6 puntos."
       ],
       "articulo": "Herramientas",
       "icono": "📈"
      }
     ],
     "preguntas": [
      {
       "texto": "2377 (K 20) contra 2428, match a 10 partidas, gana 6–4. ¿Nuevo rating?",
       "opciones": [
        "2411",
        "2397",
        "2421",
        "2377"
       ],
       "correcta": 0,
       "explicacion": "PD 0,43 × 10 = 4,3; 6 − 4,3 = 1,7 × 20 = +34."
      },
      {
       "texto": "K = 40 y 20 partidas en el periodo. ¿Qué K se usa?",
       "opciones": [
        "35",
        "40",
        "20",
        "30"
       ],
       "correcta": 0,
       "explicacion": "40 × 20 = 800 > 700 → 700 ÷ 20 = 35."
      },
      {
       "texto": "2000 (K 20) le gana a 2300. ¿Cuánto sube?",
       "opciones": [
        "+17",
        "+15",
        "+20",
        "+3"
       ],
       "correcta": 0,
       "explicacion": "PD del más bajo 0,15 → 0,85 × 20."
      }
     ]
    },
    {
     "id": "normas",
     "titulo": "Normas de jugadores",
     "diapositivas": [
      {
       "titulo": "Requisitos",
       "parrafos": [],
       "lista": [
        "9 partidas mínimo",
        "La mitad de rivales con título; 1/3 GM para norma de GM (mínimo 3)",
        "2 federaciones extranjeras; máx. 3/5 de la propia"
       ],
       "articulo": "B.01",
       "icono": "🏆"
      },
      {
       "titulo": "Piso de rating",
       "parrafos": [
        "Al rival de menor rating se le sube: GM 2200, IM 2050, WGM 2000, WIM 1850 (solo a uno).",
        "ARO redondeado; performance = ARO + dp."
       ],
       "articulo": "B.01",
       "icono": "📈"
      },
      {
       "titulo": "Practica en la herramienta",
       "parrafos": [
        "La calculadora de normas aplica el piso, redondea el ARO y te dice si alcanza."
       ],
       "articulo": "Herramientas",
       "icono": "📋"
      }
     ],
     "preguntas": [
      {
       "texto": "Aspirante a GM, 5,5/9. Promedio de 8 rivales 2523. ¿Rating mínimo del rival 9?",
       "opciones": [
        "2492",
        "2496",
        "2520",
        "2475"
       ],
       "correcta": 0,
       "explicacion": "ARO necesario 2520; suma mínima 22676 por redondeo; 22676 − 20184."
      },
      {
       "texto": "6/9 con ARO 2510: ¿performance?",
       "opciones": [
        "2635",
        "2600",
        "2585",
        "2660"
       ],
       "correcta": 0,
       "explicacion": "0,67 → dp 125."
      },
      {
       "texto": "¿A cuántos rivales se aplica el piso de rating?",
       "opciones": [
        "Solo a uno",
        "A todos los que estén por debajo",
        "A dos",
        "A ninguno"
       ],
       "correcta": 0,
       "explicacion": "Solo al de menor rating."
      }
     ]
    },
    {
     "id": "ingles",
     "titulo": "Términos en inglés",
     "diapositivas": [
      {
       "titulo": "El idioma del reglamento",
       "parrafos": [
        "El Handbook está en inglés: conocer los términos clave evita errores en informes y normas.",
        "Practica con las tarjetas de abajo y el glosario de Herramientas."
       ],
       "articulo": "I1.1",
       "icono": "🌐"
      }
     ],
     "preguntas": [
      {
       "texto": "“Flag fall” significa…",
       "opciones": [
        "Caída de bandera",
        "Bandera nacional",
        "Partida aplazada",
        "Reloj roto"
       ],
       "correcta": 0,
       "explicacion": ""
      },
      {
       "texto": "“Default time” es…",
       "opciones": [
        "Tiempo de incomparecencia",
        "Tiempo por defecto del reloj",
        "Tiempo de reflexión",
        "Prórroga"
       ],
       "correcta": 0,
       "explicacion": ""
      },
      {
       "texto": "“Touch-move” es…",
       "opciones": [
        "Pieza tocada",
        "Movimiento rápido",
        "Compongo",
        "Captura al paso"
       ],
       "correcta": 0,
       "explicacion": ""
      }
     ]
    }
   ]
  }
 ],
 "examen": [
  {
   "texto": "En estándar, primera jugada ilegal completada: ¿cuánto tiempo recibe el rival?",
   "opciones": [
    "2 minutos",
    "1 minuto",
    "5 minutos",
    "Nada"
   ],
   "correcta": 0
  },
  {
   "texto": "En rápidas y blitz, primera jugada ilegal completada: ¿cuánto tiempo recibe el rival?",
   "opciones": [
    "1 minuto",
    "2 minutos",
    "30 segundos",
    "Nada"
   ],
   "correcta": 0
  },
  {
   "texto": "Mover dos veces seguidas es…",
   "opciones": [
    "Jugada ilegal",
    "Solo una distracción",
    "Permitido si el rival no reclama",
    "Infracción de pieza tocada"
   ],
   "correcta": 0
  },
  {
   "texto": "Mover con una mano y pulsar con la otra es…",
   "opciones": [
    "Infracción sancionable, no ilegal",
    "Jugada ilegal",
    "Pérdida de la partida",
    "Permitido"
   ],
   "correcta": 0
  },
  {
   "texto": "Dos manos y peón sin coronar en la misma jugada cuentan como…",
   "opciones": [
    "Una jugada ilegal",
    "Dos jugadas ilegales",
    "Ninguna",
    "Pérdida inmediata"
   ],
   "correcta": 0
  },
  {
   "texto": "Una jugada se completa cuando…",
   "opciones": [
    "El jugador pulsa el reloj",
    "Suelta la pieza",
    "El rival la anota",
    "El árbitro la ve"
   ],
   "correcta": 0
  },
  {
   "texto": "La pieza de promoción queda elegida cuando…",
   "opciones": [
    "Toca la casilla de promoción",
    "El jugador la toma fuera del tablero",
    "Se pulsa el reloj",
    "Se anuncia en voz alta"
   ],
   "correcta": 0
  },
  {
   "texto": "El blanco toca primero la torre y luego el rey. ¿Puede enrocar con esa torre en esta jugada?",
   "opciones": [
    "No",
    "Sí",
    "Solo si es enroque corto",
    "Solo con permiso del árbitro"
   ],
   "correcta": 0
  },
  {
   "texto": "El rival pierde el derecho a reclamar pieza tocada cuando…",
   "opciones": [
    "Toca una pieza con intención de moverla",
    "Pulsa el reloj",
    "Pasan 10 jugadas",
    "El árbitro se va"
   ],
   "correcta": 0
  },
  {
   "texto": "Ahogado y, después, caída de bandera en blitz. Resultado:",
   "opciones": [
    "Tablas",
    "Gana quien no perdió por tiempo",
    "Gana quien ahogó",
    "Se repite"
   ],
   "correcta": 0
  },
  {
   "texto": "Cae la bandera del blanco; el negro tiene solo rey y caballo contra rey solo.",
   "opciones": [
    "Tablas",
    "0–1",
    "1–0",
    "Depende del árbitro"
   ],
   "correcta": 0
  },
  {
   "texto": "Cae la bandera del blanco; el negro tiene rey y caballo, el blanco rey y torre.",
   "opciones": [
    "0–1",
    "Tablas",
    "1–0",
    "Pierden los dos"
   ],
   "correcta": 0
  },
  {
   "texto": "El blanco toca una pieza cuya única jugada daría mate, pero tiene muchas otras jugadas legales, y cae su bandera.",
   "opciones": [
    "Gana el negro si tiene material",
    "Tablas siempre",
    "Gana el blanco",
    "Se juega la jugada"
   ],
   "correcta": 0
  },
  {
   "texto": "Al jugador le quedan 3 minutos con 30 s de incremento. ¿Debe anotar?",
   "opciones": [
    "Sí",
    "No",
    "Solo sus jugadas",
    "Solo las del rival"
   ],
   "correcta": 0
  },
  {
   "texto": "Una oferta de tablas puede retirarse…",
   "opciones": [
    "Nunca, hasta que sea aceptada o rechazada",
    "Antes de que el rival conteste",
    "Durante un minuto",
    "Si el árbitro lo permite"
   ],
   "correcta": 0
  },
  {
   "texto": "Reclamación incorrecta de triple repetición:",
   "opciones": [
    "+2 min al rival y la partida sigue",
    "Pierde la partida",
    "Advertencia y nada más",
    "Tablas"
   ],
   "correcta": 0
  },
  {
   "texto": "75 jugadas sin captura ni movimiento de peón:",
   "opciones": [
    "Tablas automáticas",
    "Reclamables",
    "No pasa nada",
    "Gana quien tenga más tiempo"
   ],
   "correcta": 0
  },
  {
   "texto": "Un teléfono suena en el bolsillo de un jugador en la zona de juego (bases sin reglas especiales).",
   "opciones": [
    "Pierde y el rival gana",
    "Advertencia",
    "Tablas",
    "−2 minutos"
   ],
   "correcta": 0
  },
  {
   "texto": "30 min + 30 s por jugada es:",
   "opciones": [
    "Estándar",
    "Rápida",
    "Blitz",
    "No clasificable"
   ],
   "correcta": 0
  },
  {
   "texto": "3 min + 2 s por jugada es:",
   "opciones": [
    "Blitz",
    "Rápida",
    "Estándar",
    "No clasificable"
   ],
   "correcta": 0
  },
  {
   "texto": "40 min + 10 s por jugada es:",
   "opciones": [
    "Rápida",
    "Estándar",
    "Blitz",
    "No clasificable"
   ],
   "correcta": 0
  },
  {
   "texto": "Una apelación válida debe ser:",
   "opciones": [
    "Escrita, en plazo y con cuota",
    "Verbal y en plazo",
    "Escrita sin plazo",
    "Gratis siempre"
   ],
   "correcta": 0
  },
  {
   "texto": "Tiempo de incomparecencia si las bases no dicen nada:",
   "opciones": [
    "0",
    "15 minutos",
    "30 minutos",
    "1 hora"
   ],
   "correcta": 0
  },
  {
   "texto": "Las tablas Varma sirven para:",
   "opciones": [
    "9 a 24 jugadores",
    "Cualquier suizo",
    "4 a 8 jugadores",
    "Solo equipos"
   ],
   "correcta": 0
  },
  {
   "texto": "Todos contra todos de 9: ¿quién descansa?",
   "opciones": [
    "El rival del número 10",
    "El de menor rating",
    "Por sorteo",
    "Nadie"
   ],
   "correcta": 0
  },
  {
   "texto": "Rivales: 5,5 / 6,5 / 9,5 / 7 / 8 / 10 / 8,5 / 10 / 8. Buchholz corte 1:",
   "opciones": [
    "67,5",
    "73",
    "62",
    "70"
   ],
   "correcta": 0
  },
  {
   "texto": "Mejor desempate para un todos contra todos individual:",
   "opciones": [
    "Encuentro directo o Sonneborn-Berger",
    "Buchholz",
    "Buchholz corte 1",
    "Puntos de match"
   ],
   "correcta": 0
  },
  {
   "texto": "Los desempates de un torneo se pueden cambiar…",
   "opciones": [
    "Nunca una vez anunciados",
    "Si todos aceptan",
    "Antes de la última ronda",
    "A criterio del árbitro"
   ],
   "correcta": 0
  },
  {
   "texto": "Ranking inicial con mismo rating y mismo título:",
   "opciones": [
    "Orden alfabético",
    "Por edad",
    "Por sorteo",
    "Por federación"
   ],
   "correcta": 0
  },
  {
   "texto": "¿Hasta qué ronda se pueden corregir los números de emparejamiento (TPN)?",
   "opciones": [
    "Hasta emparejar la 4.ª ronda",
    "Hasta la última",
    "Nunca",
    "Hasta la 2.ª"
   ],
   "correcta": 0
  },
  {
   "texto": "Historial B B (dos blancas seguidas): preferencia…",
   "opciones": [
    "Absoluta por negras",
    "Fuerte por negras",
    "Leve",
    "Absoluta por blancas"
   ],
   "correcta": 0
  },
  {
   "texto": "Suizo holandés 2026: ¿qué minimiza el nuevo criterio C5?",
   "opciones": [
    "La puntuación de quien recibe el bye",
    "Las diferencias de color",
    "Los flotantes ascendentes",
    "El número de rondas"
   ],
   "correcta": 0
  },
  {
   "texto": "2377 (K 20) gana 6–4 un match contra 2428. Nuevo rating:",
   "opciones": [
    "2411",
    "2400",
    "2417",
    "2395"
   ],
   "correcta": 0
  },
  {
   "texto": "Jugador que alcanzó 2400 hace un año y hoy tiene 2350. Su K es:",
   "opciones": [
    "10",
    "20",
    "40",
    "15"
   ],
   "correcta": 0
  },
  {
   "texto": "K = 40 con 20 partidas en el mismo periodo. K efectivo:",
   "opciones": [
    "35",
    "40",
    "20",
    "30"
   ],
   "correcta": 0
  },
  {
   "texto": "Norma de GM: piso de rating para el rival más bajo:",
   "opciones": [
    "2200",
    "2050",
    "2000",
    "2300"
   ],
   "correcta": 0
  },
  {
   "texto": "6/9 con ARO 2510: ¿norma de GM?",
   "opciones": [
    "Sí (performance 2635)",
    "No",
    "Solo con 9 GM",
    "Faltan datos"
   ],
   "correcta": 0
  },
  {
   "texto": "Suizo de 35 jugadores: ¿cuántos certificados de norma FA como máximo?",
   "opciones": [
    "2",
    "1",
    "3",
    "4"
   ],
   "correcta": 0
  },
  {
   "texto": "Para el título FA, además del seminario aprobado, se necesitan:",
   "opciones": [
    "3 normas en eventos válidos",
    "5 normas",
    "1 norma",
    "10 torneos"
   ],
   "correcta": 0
  },
  {
   "texto": "“Default time” significa:",
   "opciones": [
    "Tiempo de incomparecencia",
    "Tiempo extra",
    "Retardo",
    "Tiempo de reflexión"
   ],
   "correcta": 0
  }
 ]
};

/*! rev bfb5bbb0d2d82f9f */
