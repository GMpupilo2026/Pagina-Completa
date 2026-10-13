"""Texto común a los once programas. Lo que cambia por ciclo va en diccionarios por ciclo."""

CICLO_DE = {1: "I", 2: "I", 3: "I", 4: "II", 5: "II", 6: "II", 7: "III", 8: "III", 9: "III", 10: "D", 11: "D"}
NOMBRE_CICLO = {
    "I": "I Ciclo de la Educación General Básica",
    "II": "II Ciclo de la Educación General Básica",
    "III": "III Ciclo de la Educación General Básica",
    "D": "Educación Diversificada",
}
ORDINAL = {1: "Primer año", 2: "Segundo año", 3: "Tercer año", 4: "Cuarto año", 5: "Quinto año", 6: "Sexto año",
           7: "Sétimo año", 8: "Octavo año", 9: "Noveno año", 10: "Décimo año", 11: "Undécimo año"}
CORTO = {1: "1.er año", 2: "2.º año", 3: "3.er año", 4: "4.º año", 5: "5.º año", 6: "6.º año", 7: "7.º año",
         8: "8.º año", 9: "9.º año", 10: "10.º año", 11: "11.º año"}

PRESENTACION = [
    "Este documento es el programa de estudio de Ajedrez para {ordinal_min} {del_ciclo}. Forma parte de una "
    "serie de once programas, uno por cada año de la Educación General Básica y de la Educación Diversificada, "
    "pensados para que una escuela o un colegio pueda ofrecer el ajedrez como asignatura con la misma seriedad "
    "con que ofrece cualquier otra: con aprendizajes esperados, habilidades, contenidos, estrategias de "
    "mediación, indicadores y una evaluación que se pueda defender ante la familia y ante la dirección.",
    "La estructura sigue la de los programas de estudio del Ministerio de Educación Pública de Costa Rica "
    "elaborados a partir de la Política Curricular «Educar para una nueva ciudadanía» y de la Política Educativa "
    "«La persona: centro del proceso educativo y sujeto transformador de la sociedad». Por eso cada unidad parte "
    "de aprendizajes esperados, los vincula con una habilidad del marco curricular y con su indicador, y describe "
    "tres niveles de desempeño (inicial, intermedio y avanzado) para valorar el avance de cada estudiante.",
    "Junto a este programa va el planeamiento de las 200 lecciones del curso lectivo, una por día, cada una con "
    "sus cuatro momentos de mediación, su evaluación y sus materiales. La persona docente lo puede usar tal "
    "como está o ajustarlo a su grupo; para eso se marcaron como flexibles algunos días de refuerzo, que se "
    "pueden omitir cuando el calendario real trae menos días lectivos.",
]

FUNDAMENTACION = [
    "El ajedrez es un juego de información completa: nada está escondido y nada depende del azar. Lo que pasa "
    "en el tablero es consecuencia de las decisiones de cada jugador. Esa sola característica lo vuelve una "
    "herramienta educativa de primer orden, porque obliga a observar antes de actuar, a prever lo que hará la "
    "otra persona y a hacerse cargo del resultado.",
    "En el aula, una partida pone en juego al mismo tiempo la atención sostenida, la memoria de trabajo, la "
    "orientación espacial, el cálculo, la comparación de alternativas y el control de los impulsos. También "
    "pone en juego la convivencia: se saluda antes de empezar, se respeta el turno, se acepta la derrota y se "
    "gana sin humillar. Para la niña o el niño que apenas aprende a leer, el tablero es un mapa con "
    "coordenadas; para la persona adolescente, es un laboratorio donde formula hipótesis, las pone a prueba y "
    "revisa su razonamiento cuando se equivoca.",
    "Este programa no busca formar campeones, aunque no lo impide. Busca que cada estudiante aprenda a pensar "
    "mejor y a convivir mejor por medio de un juego que tiene quince siglos de historia y que hoy se juega en "
    "todos los países del mundo, en el parque, en el colegio y en internet. Costa Rica tiene una tradición "
    "ajedrecística viva, con torneos escolares, los Juegos Deportivos Nacionales y una federación que organiza "
    "competencias para todas las edades; la escuela es el lugar donde esa tradición se vuelve accesible para "
    "todas las personas, no solo para quien tiene un club cerca.",
    "El ajedrez dialoga además con otras asignaturas. Con Matemáticas comparte la geometría del tablero, las "
    "coordenadas, el conteo y el razonamiento lógico. Con Español, la lectura de instrucciones, la escritura de "
    "comentarios y la argumentación oral. Con Estudios Sociales, la historia de un juego que viajó desde la "
    "India hasta América. Con Educación Física, el cuidado del cuerpo y de la mente en la competencia. El "
    "programa aprovecha esos puentes cada vez que puede.",
]

ENFOQUE = [
    "El programa se apoya en una visión socioconstructivista del aprendizaje: la persona estudiante construye "
    "el conocimiento al actuar sobre el tablero, al confrontar sus ideas con las de sus compañeros y al "
    "contrastarlas con la explicación de la persona docente y con la tradición escrita del juego. Nadie aprende "
    "ajedrez solo escuchando: se aprende jugando, equivocándose y revisando por qué.",
    "La persona docente actúa como mediadora. Prepara la situación, plantea el reto, observa, pregunta y "
    "devuelve. Explica cuando hace falta, pero no le quita al estudiantado el gusto de descubrir. Las "
    "lecciones están organizadas en cuatro momentos: focalización, exploración, contrastación y aplicación.",
]

MOMENTOS = [
    ("Focalización (5 minutos)", "Se despierta el interés y se recupera lo que el grupo ya sabe: una pregunta, un "
     "reto en el tablero mural, una historia corta, una adivinanza o la revisión de la tarea."),
    ("Exploración (15 minutos)", "El estudiantado trabaja con las piezas, en parejas o en pequeños grupos: prueba, "
     "juega, cuenta, compara. La persona docente circula, observa y toma nota."),
    ("Contrastación (10 minutos)", "Se ponen en común los hallazgos y se confrontan con la regla, con la "
     "explicación de la persona docente o con la fuente. Aquí se nombra el concepto y se corrigen errores."),
    ("Aplicación (10 minutos)", "Lo aprendido se usa en una situación nueva: un minijuego, una partida con una "
     "consigna, un ejercicio o una salida rápida que permite saber quién lo logró."),
]

HABILIDADES = [
    ("Maneras de pensar", "Pensamiento sistémico", "Ver el tablero como un todo: cada pieza depende de las demás y una jugada cambia el conjunto."),
    ("Maneras de pensar", "Pensamiento crítico", "Evaluar una jugada antes de hacerla, revisar la del rival y justificar con razones por qué una es mejor que otra."),
    ("Maneras de pensar", "Aprender a aprender", "Analizar las propias partidas, reconocer los errores y planear cómo mejorar."),
    ("Maneras de pensar", "Resolución de problemas", "Encontrar la jugada que resuelve una posición, con un método: mirar, buscar candidatas, calcular y comprobar."),
    ("Maneras de pensar", "Creatividad e innovación", "Inventar planes, minijuegos, problemas y variantes; buscar la jugada que nadie espera."),
    ("Formas de vivir en el mundo", "Ciudadanía global y local", "Conocer la historia del juego y su presencia en otras culturas; participar en la vida ajedrecística de la comunidad."),
    ("Formas de vivir en el mundo", "Responsabilidad personal y social", "Cumplir el reglamento, aceptar el resultado, cuidar el material y respetar al rival."),
    ("Formas de vivir en el mundo", "Estilos de vida saludables", "Manejar la frustración, la ansiedad de la competencia y el uso del tiempo frente a pantallas."),
    ("Formas de vivir en el mundo", "Vida y carrera", "Reconocer el ajedrez como espacio de formación, arbitraje, enseñanza y organización de eventos."),
    ("Formas de relacionarse con otros", "Colaboración", "Analizar en pareja o en equipo, enseñar a quien sabe menos y jugar en equipos."),
    ("Formas de relacionarse con otros", "Comunicación", "Explicar una idea con el vocabulario del juego, anotar partidas y comentarlas por escrito u oralmente."),
    ("Herramientas para integrarse al mundo", "Apropiación de tecnologías digitales", "Usar con criterio tableros digitales, bases de datos y programas de análisis."),
    ("Herramientas para integrarse al mundo", "Manejo de la información", "Buscar, seleccionar y organizar partidas, reglamentos y datos históricos."),
]

EJES = [
    ("Cultura ambiental para el desarrollo sostenible", "Cuidado del material común (tableros, piezas, relojes), uso de materiales reciclados para fabricar tableros y piezas, y reflexión sobre el uso responsable de los recursos."),
    ("Educación integral de la sexualidad", "Participación equitativa de niñas, niños y adolescentes en todas las actividades, sin estereotipos sobre quién «sirve» para el ajedrez, y reconocimiento de grandes jugadoras."),
    ("Educación para la salud", "Manejo de las emociones al ganar y al perder, pausas activas, postura, descanso antes de competir y uso equilibrado de las pantallas."),
    ("Vivencia de los derechos humanos para la democracia y la paz", "Respeto a las reglas acordadas, al turno y a la persona rival; solución pacífica de los conflictos en la partida y juego limpio."),
]

ORIENT_METOD = {
    "comun": [
        "**Organización del aula.** Las lecciones funcionan mejor con el grupo en parejas, un tablero por pareja y el "
        "tablero mural al frente. Cuando no hay tableros suficientes, se juega en equipos de dos contra dos, que "
        "además obliga a conversar la jugada antes de hacerla.",
        "**Material mínimo.** Un tablero y un juego de piezas por pareja, un tablero mural magnético o de tela, "
        "hojas de trabajo y planillas. Desde el II Ciclo, al menos un reloj de ajedrez por cada cuatro "
        "estudiantes. Para algunas lecciones de III Ciclo y Diversificada, el laboratorio de informática o "
        "un proyector.",
        "**Diversidad en el aula.** Cada lección admite tres entradas: quien va empezando trabaja con menos "
        "piezas o con ayuda de una compañera o compañero; quien avanza recibe el mismo reto con una condición "
        "más; quien ya domina el tema hace de monitor. Para estudiantes con discapacidad visual se usan tableros "
        "con relieve y piezas con espiga, y las jugadas se dicen en voz alta con la notación; para quien necesita "
        "más tiempo, se reducen los ejercicios sin bajar la exigencia de razonar.",
        "**Juego y competencia.** La competencia es un recurso, no el centro. Se juegan partidas y torneos, pero "
        "se valora tanto el modo de jugar (anotar, pensar el tiempo necesario, saludar, analizar después) como "
        "el resultado.",
        "**Relación con la familia.** Varias tareas invitan a jugar en casa con alguien de la familia. Así el "
        "aprendizaje sale del aula y la familia conoce lo que se trabaja.",
    ],
    "I": ["En el I Ciclo el aprendizaje entra por el cuerpo y por el cuento: tablero gigante en el piso, piezas "
          "que se presentan como personajes, canciones y desplazamientos. Las fichas de colorear y recortar "
          "acompañan, no sustituyen, al tablero. La notación aparece de forma gradual, primero nombrando "
          "columnas y filas."],
    "II": ["En el II Ciclo el grupo ya juega partidas completas. Se introduce la planilla y el reloj, y se pasa de "
           "conocer reglas a resolver problemas: la táctica se trabaja con hojas de ejercicios graduadas, siempre "
           "comprobando en el tablero."],
    "III": ["En el III Ciclo se combinan tres formatos: la clase de análisis (una partida o posición proyectada y "
            "discutida), el taller de ejercicios por niveles y la partida con reloj anotada. La persona "
            "adolescente necesita argumentar; por eso se pide siempre que explique por qué eligió una jugada."],
    "D": ["En la Educación Diversificada el estudiantado asume tareas de mayor autonomía: prepara análisis, "
          "presenta partidas al grupo, usa programas de análisis con criterio, organiza eventos y enseña a "
          "estudiantes más pequeños. Se cuida que el uso del motor de análisis no reemplace el pensamiento "
          "propio: primero se analiza sin ayuda y luego se contrasta."],
}

EVAL_COMUN = [
    "La evaluación se ajusta al Reglamento de Evaluación de los Aprendizajes vigente. Tiene tres funciones que "
    "se complementan: **diagnóstica**, al inicio del curso y de cada unidad, para conocer lo que el grupo trae; "
    "**formativa**, casi todos los días, para que cada estudiante sepa cómo va y la persona docente ajuste lo "
    "que hace; y **sumativa**, para certificar el logro de los aprendizajes esperados.",
    "En ajedrez, la evidencia más valiosa es lo que la persona estudiante hace frente al tablero. Por eso "
    "predominan la observación con escalas de desempeño y listas de cotejo, la prueba de ejecución (resolver "
    "posiciones, jugar con una consigna, demostrar un mate o un final), el análisis escrito de partidas propias y "
    "el portafolio. Las pruebas escritas se usan poco y siempre con tablero a la vista.",
    "Cada indicador tiene tres niveles de desempeño: **inicial** (reconoce, menciona, identifica con ayuda), "
    "**intermedio** (describe, ejecuta, aplica en situaciones conocidas) y **avanzado** (aplica en situaciones "
    "nuevas, justifica, crea). La calificación del trabajo cotidiano sale de esos niveles registrados a lo "
    "largo de la unidad, no de una sola observación.",
    "Se practican la autoevaluación (la persona estudiante revisa su partida y marca qué hizo bien) y la "
    "coevaluación (la pareja comenta la partida con una guía corta). Las adecuaciones curriculares y los "
    "apoyos educativos se aplican según lo que establezca el expediente de cada estudiante.",
]

COMPONENTES = {
    "I": [("Trabajo cotidiano", "50 %"), ("Tareas", "10 %"), ("Prueba de ejecución", "30 %"), ("Asistencia", "10 %")],
    "II": [("Trabajo cotidiano", "45 %"), ("Tareas", "10 %"), ("Prueba de ejecución", "35 %"), ("Asistencia", "10 %")],
    "III": [("Trabajo cotidiano", "35 %"), ("Tareas", "10 %"), ("Prueba de ejecución", "25 %"), ("Proyecto", "20 %"), ("Asistencia", "10 %")],
    "D": [("Trabajo cotidiano", "30 %"), ("Tareas", "10 %"), ("Prueba de ejecución", "25 %"), ("Proyecto", "25 %"), ("Asistencia", "10 %")],
}
NOTA_COMPONENTES = ("Distribución propuesta para una asignatura de este tipo. La institución la ajusta a lo que "
                    "disponga el Reglamento de Evaluación de los Aprendizajes vigente y la normativa del nivel.")

GLOSARIO = [
    ("Ahogado", "Situación en la que el bando que debe mover no tiene jugadas legales y su rey no está en jaque. La partida termina en tablas."),
    ("Apertura", "Primera fase de la partida, en la que se desarrollan las piezas, se lucha por el centro y se pone el rey a salvo."),
    ("Ataque doble", "Jugada que amenaza dos objetivos a la vez. Cuando lo hace un caballo se le llama también horquilla."),
    ("Atracción", "Sacrificio que obliga a una pieza rival, muchas veces el rey, a ir a una casilla donde queda expuesta."),
    ("Captura al paso", "Captura especial de un peón que avanzó dos casillas y quedó al lado de un peón rival; solo se puede hacer en la jugada inmediata."),
    ("Celada", "Trampa preparada para que el rival cometa un error que parece natural."),
    ("Clavada", "Situación en la que una pieza no se puede mover, o no conviene moverla, porque dejaría expuesta una pieza de más valor detrás."),
    ("Columna", "Cada una de las ocho líneas verticales del tablero, nombradas con letras de la a a la h."),
    ("Combinación", "Serie de jugadas forzadas, casi siempre con sacrificio, que persigue un objetivo concreto."),
    ("Coronación", "Transformación de un peón que llega a la última fila en dama, torre, alfil o caballo."),
    ("Desviación", "Maniobra que aparta a una pieza rival de una casilla o línea que estaba defendiendo."),
    ("Diagonal", "Línea de casillas del mismo color unidas por sus esquinas."),
    ("Enroque", "Jugada especial del rey y una torre que pone al rey a salvo y conecta la torre con el juego."),
    ("Enfilada", "Ataque a una pieza valiosa que, al apartarse, deja expuesta otra que estaba detrás en la misma línea."),
    ("Fila", "Cada una de las ocho líneas horizontales del tablero, numeradas del 1 al 8."),
    ("Final", "Última fase de la partida, con poco material, en la que el rey se vuelve una pieza activa."),
    ("Jaque", "Ataque directo al rey. Hay que responderlo de inmediato."),
    ("Jaque mate", "Jaque del que el rey no se puede librar. Termina la partida."),
    ("Jaque perpetuo", "Serie de jaques que el rival no puede evitar; suele llevar a las tablas por repetición."),
    ("Medio juego", "Fase central de la partida, en la que se elaboran planes, se ataca y se defiende."),
    ("Notación algebraica", "Sistema para escribir las jugadas con la inicial de la pieza y la casilla de llegada."),
    ("Oposición", "Situación en la que los dos reyes están enfrentados con una casilla de por medio; tiene la oposición quien no está obligado a mover."),
    ("Peón pasado", "Peón que no tiene peones rivales delante ni en las columnas vecinas que le impidan avanzar."),
    ("Planilla", "Hoja en la que cada jugador anota las jugadas de su partida."),
    ("Regla del cuadrado", "Método para saber si un rey alcanza a un peón que corre a coronar."),
    ("Sacrificio", "Entrega voluntaria de material a cambio de una ventaja de otro tipo."),
    ("Tablas", "Empate. Puede darse por acuerdo, ahogado, repetición, material insuficiente o la regla de las cincuenta jugadas."),
    ("Zugzwang", "Situación en la que cualquier jugada empeora la posición de quien debe mover."),
]

REFERENCIAS = [
    "Anguix, J., Ballester, H., Bueno, P. y Gascó, J. A. Ajedrez en el aula 1. Valencia: Evajedrez.",
    "Anguix, J., Ballester, H., Bueno, P. y Gascó, J. A. Ajedrez en el aula 2 (2.ª ed.). Valencia: Nuevo Jaque, 2003.",
    "Anguix, J., Ballester, H., Bueno, P. y Gascó, J. A. Ajedrez en el aula 3 (2.ª ed.). Valencia: Nuevo Jaque, 2003.",
    "Consejo Superior de Educación (2015). Educar para una nueva ciudadanía. Fundamentación pedagógica de la Transformación Curricular. San José: MEP.",
    "Consejo Superior de Educación (2017). Política Educativa: La persona, centro del proceso educativo y sujeto transformador de la sociedad. San José: MEP.",
    "FIDE. Leyes del Ajedrez de la FIDE. Federación Internacional de Ajedrez, versión vigente.",
    "Ministerio de Educación Pública. Reglamento de Evaluación de los Aprendizajes, versión vigente.",
    "Russek, G. Manual 1: Las reglas del juego. Nivel 1.",
    "Russek, G. Manual 2: Principios básicos. Nivel 2.",
    "Russek, G. Manual 3: Elementos técnicos. Nivel 3.",
    "Russek, G. Manual 4: Partidas selectas. Nivel 4.",
    "Russek, G. Manual 5: Ejercicios tácticos. Nivel 5.",
]
