/* El texto de «Coachess en resumen»: lo leen el PDF y la versión accesible
 * (herramientas/coachess-resumen-pdf.js) y lo revisa
 * herramientas/verificar-coachess-resumen.py.
 *
 * Es un resumen de «Coachess: inteligencia del ajedrez para tu desarrollo
 * personal y profesional», de Daniel Muñoz Sánchez (2022). Las ideas, los
 * ejemplos y los estudios citados son los que trae ese libro; el texto es
 * propio, en tuteo, y no copia párrafos del original (que prohíbe
 * reproducirlo). Los datos de los estudios van como el autor los cuenta: el
 * resumen no los vuelve a comprobar, y lo dice en «Antes de empezar».
 *
 * Marcas que entiende el generador: *cursiva* y **negrita**. Nada más.
 */
"use strict";

module.exports = {
  TITULO: "Coachess en resumen",
  SUBTITULO: "Lo más importante de un libro que usa el ajedrez para decidir mejor, manejar el tiempo, trabajar con más sentido y aprender de las derrotas.",
  OBRA: "Coachess: inteligencia del ajedrez para tu desarrollo personal y profesional",
  AUTOR_ORIGINAL: "Daniel Muñoz Sánchez",
  ANIO_ORIGINAL: 2022,
  RESUMIDO_POR: "Oscar Angulo Cubero",

  presentacion: [
    "*Coachess* es un libro de Daniel Muñoz, maestro y entrenador de ajedrez, que pasó casi cuarenta años jugando y otros tantos trabajando en empresas, sobre todo en selección de personal. Su tesis es sencilla: lo que el ajedrez enseña para jugar mejor —decidir con poco tiempo, valorar el material y el tiempo, detectar la pieza que lo estropea todo, sacar provecho de una derrota— sirve también fuera del tablero.",
    "No hace falta saber jugar para leerlo. Los ejemplos de ajedrez son la puerta de entrada a ideas que vienen de la psicología, la neurociencia y la gestión de empresas, y el autor se apoya en muchos estudios para defenderlas. Tampoco es un libro de técnica: es un libro de cómo pensar.",
    "Este resumen sigue el orden del original: una **primera parte** sobre cómo decidimos y cómo vivimos el tiempo, y una **segunda parte** sobre el trabajo y la productividad. Cada capítulo trae la idea central, cómo se ve en el tablero, los estudios que el autor cita y unos consejos para llevarla a la práctica. Al final están los veinte consejos con los que cierra el libro y una página para armar tu propio plan.",
  ],

  aviso: [
    "**Un resumen, no el libro.** Las ideas son de Daniel Muñoz; este texto las cuenta con otras palabras y no reproduce el original. Si alguna te sirve, vale la pena leerlo completo: trae más ejemplos, más partidas y más matices.",
    "**Los estudios van como el autor los cuenta.** El libro cita muchas investigaciones; aquí se resumen tal como él las presenta, sin volver a comprobarlas. Donde el autor da su opinión o una hipótesis, el resumen lo dice.",
  ],

  ideasClave: [
    "**Los expertos no piensan más: piensan menos.** Reconocen la situación, descartan sin darse cuenta lo que no sirve y solo analizan lo que importa. Esa intuición no es magia: es experiencia guardada, sobre todo la de los errores.",
    "**La razón es lenta y la emoción es rápida.** Al final decide la emoción; la inteligencia emocional es darle tiempo a la razón para que cambie una emoción por otra. Con prisa y con miedo, decidimos peor.",
    "**Lo «suficientemente bueno» suele ganarle a lo óptimo.** Buscar la decisión perfecta paraliza y deja insatisfecho. En la vida, como en una partida contra el reloj, el pragmatismo rinde más.",
    "**El tiempo no es uno solo.** Está el del reloj, el ritmo interno de lo que haces y el que sientes. La motivación lo acorta, el miedo y el aburrimiento lo estiran, y saltar de una tarea a otra lo despedaza.",
    "**El silencio es tiempo útil.** El ruido, y sobre todo las conversaciones ajenas, cansan y estresan. Alejarte un rato de un problema sin cambiar de tema ayuda a resolverlo.",
    "**Busca tu pieza sobrecargada.** Cuando un solo factor sostiene demasiado, todo se cae al presionarlo. Si no sabes qué hacer, mejora tu peor pieza.",
    "**La amenaza pesa más que la ejecución.** Vivir pendiente de lo que podría pasar consume más energía que el problema mismo.",
    "**Desconfía de los atajos y de las celadas.** La gratificación inmediata es de principiantes; los resultados que se sostienen salen de un sistema que se usa todos los días.",
    "**Busca las restricciones invisibles.** Un proceso va a la velocidad de su paso más lento, y lo que más frena casi nunca se ve a simple vista. Quitarlo tiene un efecto palanca.",
    "**Mejorar no es una línea recta.** Se avanza a saltos, con mesetas y retrocesos. Ponte metas de actividad, no solo de resultado.",
    "**La concreción ahorra tiempo.** Pocas ideas claras rinden más que muchas ideas vagas; la falta de concreción es el gran ladrón del tiempo en el trabajo.",
    "**Las derrotas son la mejor escuela.** Siente el fracaso poco tiempo y piénsalo mucho. Un error que no se analiza no enseña nada.",
  ],

  partes: [
    {
      rotulo: "Primera parte",
      titulo: "Decidir mejor y vivir mejor el tiempo",
      intro: "Cómo decidimos de verdad —con intuición, emoción y algo de razón—, cómo el tiempo y el ruido cambian la calidad de nuestras decisiones, y qué podemos aprender del tablero para equivocarnos menos y vivir con más equilibrio.",
      capitulos: [
        {
          titulo: "Cómo deciden los expertos",
          cita: { texto: "El ajedrez es una versión en miniatura de la vida.", autor: "Susan Polgar" },
          idea: "Un experto no compara todas las opciones: reconoce la situación, se le ocurre una respuesta razonable, la simula en la cabeza y, si funciona, actúa. Solo cuando falla mira las demás ramas.",
          parrafos: [
            "Tomamos cientos de decisiones al día, casi todas en piloto automático. Las que pesan son pocas, y son justamente las que el ajedrecista enfrenta en cada partida: el autor calcula que cerca de un tercio de las jugadas de una partida son de verdad difíciles, aunque cuanto más fuerte es el jugador, menos jugadas le parecen complicadas.",
            "Los modelos clásicos enseñan a decidir paso a paso: definir el problema, listar opciones, compararlas y elegir. Sirven para explicar, pero no describen lo que hace la gente con experiencia cuando tiene poco tiempo y mucha incertidumbre. Para eso el autor recurre al psicólogo Gary Klein, que estudió a bomberos y militares.",
            "Los bomberos veteranos le decían a Klein que ellos «no tomaban decisiones»: miraban el incendio y actuaban. Uno contó que sacó a su equipo de una casa por un «sexto sentido» segundos antes de que el piso se hundiera. En realidad, el fuego no se comportaba como debía: hacía demasiado calor para un fuego tan pequeño y era demasiado silencioso. Ardía debajo del piso. Su experiencia detectó la anomalía antes que su razonamiento.",
            "De ahí sale el modelo de decisión basado en el reconocimiento: primero una intuición de qué hacer, después una simulación mental para ver si funciona. Es una forma **sustractiva** de decidir: en lugar de sumar opciones, se descartan casi todas sin pensarlo y se pone a prueba la que queda.",
            "El autor añade una imagen que le gusta: el experto entiende la situación como quien escucha una historia. Va uniendo los hechos y les da sentido, igual que el ajedrecista fuerte ve un patrón de ataque completo donde el principiante ve piezas sueltas. Entender algo también es saber a qué no prestarle atención.",
          ],
          tablero: [
            "Un gran maestro duda de verdad en muy pocas jugadas por partida; un aficionado de club, en muchas. En partidas relámpago, los mejores mueven casi sin pensar y aciertan jugadas que a una computadora le toman unos segundos.",
          ],
          estudios: [
            "**Kundel y Nodine (1975):** radiólogos que vieron radiografías durante apenas 0,2 segundos acertaron cerca del 70 % de los casos anormales. La mirada experta empieza con una impresión global y después verifica.",
            "**Charness:** al medir el movimiento de los ojos, los ajedrecistas expertos fijaron menos la vista y percibieron configuraciones completas de piezas, no piezas sueltas.",
            "**Sheridan y Reingold (2014):** confirmaron que los expertos usan su memoria de patrones para guiar la búsqueda, en vez de revisar todas las jugadas posibles.",
            "**Adrian de Groot** ya había comparado, décadas antes, cómo buscan jugadas los principiantes y los maestros.",
          ],
          consejos: [
            "En lo que dominas, confía en tu primera lectura, pero ponla a prueba: imagina cómo saldría antes de actuar.",
            "Cuando algo «no cuadra» con lo que esperabas, detente: esa anomalía suele ser la información más valiosa.",
            "Para decidir más rápido no sumes opciones: aprende a descartar las que no importan.",
          ],
        },
        {
          titulo: "La intuición: experiencia que se siente",
          cita: { texto: "Probamos por medio de la lógica, pero descubrimos por medio de la intuición.", autor: "Henri Poincaré" },
          idea: "La intuición es el almacén inconsciente de la experiencia. Se alimenta, sobre todo, de los errores y de las emociones que dejaron; por eso se construye despacio y con aprendizaje activo.",
          parrafos: [
            "A diferencia de las computadoras y de los principiantes, los buenos jugadores descartan las malas jugadas de forma automática. El ajedrez de alto nivel es más un juego de ideas que de jugadas. Susan Polgar contaba que resolvió en un segundo un mate en dos porque tiene en la memoria decenas de miles de patrones.",
            "En ajedrez **los errores pesan más que los aciertos**: se puede llegar muy lejos sin jugadas brillantes, solo evitando errores. Y aprendemos más de una derrota que duele que de una victoria regalada por el rival. Las emociones son el pegamento del recuerdo: lo que nos hizo sentir algo se graba mejor.",
            "Por eso el autor insiste en el **aprendizaje activo**. Estudiar sin involucrarse produce esa frustración tan común en los alumnos: hacer algo bien con la mano un día y no poder repetirlo al siguiente. Aprender algo para enseñárselo a otros, en cambio, lo fija mucho mejor.",
            "Con práctica, el principiante pasa de «sé eso» a «sé cómo»: siente la posición, encuentra una jugada candidata por intuición y luego la calcula. Pero el camino no se puede invertir. Si a un principiante se le pide que juegue partidas rápidas para mejorar, juega con recursos pobres que se refuerzan a sí mismos y entra en un círculo de jugar mucho sin progresar.",
            "Los expertos también se diferencian en dónde ponen la energía: dedican casi todo el esfuerzo a entender la situación, mientras que el inexperto lo gasta en convencerse de que su opción es buena. Bajo presión de tiempo, el experto casi no empeora; el inexperto, mucho.",
          ],
          tablero: [
            "Magnus Carlsen explica a menudo una jugada diciendo que «le hace sentir bien»; Anand decía que la intuición es la primera jugada que ve; Kramnik, que rechaza ciertas variantes sin calcularlas porque siente que son incorrectas. Carlsen añade que en el ajedrez clásico la intuición propone y el cálculo verifica, y que un poco de partidas rápidas ayuda a un jugador joven a afinar el instinto, pero no solo eso.",
          ],
          estudios: [
            "**Universidad de Nueva York (Lila Davachi):** las emociones dejan un estado interno que dura después del hecho y hace que recordemos mejor lo que viene después; una especie de «resaca emocional».",
          ],
          consejos: [
            "Piensa en el largo plazo y prioriza el aprendizaje en el que te involucras de verdad.",
            "Evita los atajos, aunque rindan hoy: a mediano plazo debilitan tu intuición.",
            "Explicar a otros lo que haces es una de las mejores formas de aprenderlo.",
            "Fíjate en lo que reconoce un experto: no pierde tiempo en lo que no es pertinente.",
          ],
        },
        {
          titulo: "El cuerpo piensa primero",
          cita: { texto: "La intuición es la primera jugada que veo.", autor: "Viswanathan Anand" },
          idea: "En cada decisión intervienen el instinto, la emoción y la razón. La razón proyecta las consecuencias, pero la que elige es la emoción; y como la razón es lenta, sin tiempo se impone lo automático.",
          parrafos: [
            "El autor usa la imagen de los tres cerebros superpuestos por la evolución: el instintivo, que nos mantiene vivos; el emocional, que nos adapta al medio; y el racional, el más reciente. El racional es el más potente, pero tiene un defecto grave: **es lento**. Ante lo urgente, la emoción llega primero.",
            "La **inteligencia emocional** es usar la razón para manejar esas emociones. Una emoción no desaparece porque uno quiera: se reemplaza por otra cuando se entiende por qué conviene cambiarla. Con tiempo, la razón casi siempre gana; sin tiempo, casi nunca.",
            "El ajedrez entrena justo eso: a frenar la impulsividad. No hay buen jugador sin control emocional, porque lo que «pide el cuerpo» rara vez es la mejor jugada. En apuros de tiempo, la razón no alcanza a conectarse y se juega con sensaciones de un segundo: el paraíso de los errores.",
            "La intuición tiene base en el cuerpo. Según la hipótesis del marcador somático de Antonio Damasio, a menudo «sentimos» lo que sabemos —en el pulso, en la piel— antes de ser conscientes de ello. El autor lo relaciona con las posiciones dinámicas, donde todo cambia rápido y el jugador experto siente qué hacer como el bombero del capítulo anterior.",
            "Pero la intuición no es universal. Hay que ponerla en duda cuando predice el éxito de algo muy improbable, cuando estamos en un terreno que no conocemos o cuando la emoción nos tiene secuestrados: el aficionado que, ganando y sin tiempo, se deja llevar por una «corazonada» sin fundamento.",
          ],
          estudios: [
            "**Universidad de Iowa, juego de cartas:** con dos mazos trampa, el cuerpo de los participantes (el sudor de las manos) reaccionaba al peligro hacia la décima carta, mucho antes de que pudieran explicar, hacia la quincuagésima, cuál mazo convenía.",
            "**Joy Hirsch (Yale):** el cerebro reacciona con ansiedad a rostros de miedo mostrados tan rápido (33 milisegundos) que no llegamos a verlos.",
            "**Linquist y Bartol (2008)** discuten si los marcadores somáticos son necesarios para decidir o solo aceleran la decisión.",
          ],
          consejos: [
            "Sé consciente de que tu cerebro racional puede ser secuestrado por una emoción.",
            "Distingue cuándo tus emociones confirman un razonamiento y cuándo intentan dominar la decisión.",
            "Escucha a tu cuerpo: muchas veces sabe antes que tú que algo no va bien.",
            "Desconfía de la intuición cuando juegas en un terreno que no conoces.",
          ],
        },
        {
          titulo: "Cuando hay demasiadas opciones",
          cita: { texto: "Cuando las cosas no quieren conformarse con nosotros, nosotros debemos conformarnos con ellas.", autor: "Fontenelle" },
          idea: "Tener más opciones no siempre nos hace más felices. Quien busca lo óptimo sufre más que quien se conforma con lo suficientemente bueno, y la eficiencia de nuestras decisiones está muy ligada al bienestar.",
          parrafos: [
            "El autor parte de la **paradoja de la elección** de Barry Schwartz: los «maximizadores», que buscan la decisión perfecta, tardan más, deciden peor y quedan menos satisfechos que los «satisfactores», que eligen algo bueno y siguen adelante. Es el terreno de la parálisis por análisis, y además del arrepentimiento: después de decidir, seguimos rumiando si acertamos.",
            "El ajedrez es el paraíso de esa parálisis. Según Claude Shannon, el número de partidas posibles ronda 10 elevado a 120, más que los átomos del universo conocido. Nadie puede revisarlas todas.",
            "En 2017 AlphaZero aprendió a jugar en horas y venció al mejor motor de entonces, Stockfish, revisando muchísimas menos posiciones por segundo pero eligiendo mejor cuáles mirar. Sus jugadas óptimas eran a veces tan raras que un gran maestro las habría tomado por errores. Lo óptimo de una máquina puede ser inhumano.",
            "La hipótesis del autor es que el bienestar está del lado del equilibrio: decidir con sentido práctico, sin pelear por lo perfecto. Y que una buena decisión, para una persona, no es solo la que acierta como una máquina: es la que tiene en cuenta todo lo relevante y es coherente con sus valores. Los mejores jugadores son humildes y muy críticos con su propia opinión: no defienden una jugada porque sea suya.",
          ],
          consejos: [
            "Antes de decidir, define qué es «suficientemente bueno» y elige la primera opción que lo cumpla.",
            "Reduce las opciones a pocas: más alternativas no garantizan una elección mejor.",
            "Una vez decidido, no rumies: el arrepentimiento largo no mejora la próxima decisión.",
          ],
        },
        {
          titulo: "Los distintos tiempos",
          cita: { texto: "Solo cuando el reloj se detiene el tiempo viene a la vida.", autor: "William Faulkner" },
          idea: "No vivimos un solo tiempo, sino muchos. Lo que sentimos, lo que nos motiva, la edad y el entorno estiran o encogen el tiempo, y saltar de una tarea a otra nos hace menos eficientes, no más.",
          parrafos: [
            "En una partida conviven tres tiempos: el **del reloj**, que si se acaba hace perder aunque se vaya ganando; el **tiempo interno**, que es la velocidad con que las piezas cumplen su objetivo y que se puede cambiar por material; y el **tiempo vivido**, el que el jugador siente según lo que se cuenta a sí mismo. El tercero, dice el autor, lo manejamos con nuestras emociones.",
            "Cuatro cosas cambian cómo percibimos el tiempo: **los estímulos** (lo nuevo parece durar más, como cuando una apertura conocida se sale del libro); **los motivos** (cuando deseamos algo y sabemos que lo podemos lograr, el tiempo pasa rápido); **el entorno** (en la naturaleza el tiempo se siente más largo y más tranquilo que en la ciudad); y **las emociones**, sobre todo el miedo, que estira los segundos.",
            "La esperanza también cuenta, pero la que se apoya en posibilidades reales, no en deseos. El autor recuerda que el jugador que resuelve un ejercicio sabe que hay solución y la busca hasta encontrarla; en una partida real, sin esa certeza, más de uno abandona posiciones que no estaban perdidas.",
            "Calcular es lo que más energía gasta: cuando entendemos una posición difícil el tiempo «vuela» y el cansancio sube de verdad. Por eso los peores errores aparecen con la fatiga.",
            "Y el ser humano **no es multitarea**. Pasar de una actividad a otra con ritmos distintos desordena la atención y la energía. En el tablero se ve en el jugador que solo mira la última jugada del rival en vez de la posición entera; en el trabajo, en quien interrumpe a otro para imponerle su ritmo.",
          ],
          estudios: [
            "**Tse (Dartmouth, 2004):** una imagen distinta en medio de otras repetidas parece durar más.",
            "**Gable y Poole (2012):** las imágenes de postres apetecibles parecían durar menos que las neutras, sobre todo para quien tenía hambre.",
            "**Ogden (Liverpool):** durante el confinamiento de 2020, más del 80 % sintió el tiempo distorsionado; se hizo más lento con la edad, el estrés y la soledad.",
            "**Universidad de Carleton:** caminar por la naturaleza hace sentir el paseo más largo y más relajado que caminar por la ciudad.",
            "**Droit-Volet (2011):** después de ver escenas de miedo, las duraciones se sienten más largas.",
            "**Curt Richter (años cincuenta):** el experimento, cruel, que el autor usa para hablar de la esperanza: los animales que habían sido rescatados antes aguantaron muchísimo más que los que no.",
            "**Stanford:** quienes se creían buenos para hacer varias cosas a la vez cometían más errores y tardaban más.",
          ],
          consejos: [
            "No existe un tiempo único: fíjate en cuál de tus tiempos te está afectando.",
            "No te limites a desear: busca con razones. Una experiencia de calidad da una esperanza de calidad.",
            "El miedo y la ansiedad derriten tu tiempo; nombrarlos ayuda a manejarlos.",
            "Evita alternar tareas con ritmos distintos, y detecta a quienes te desordenan el ritmo.",
            "Desconfía de las frases milagro: los cambios verdaderos son lentos e interiores.",
          ],
        },
        {
          titulo: "Cuándo decidir, y en silencio",
          cita: { texto: "El silencio es el elemento en el que se forman todas las cosas grandes.", autor: "Thomas Carlyle" },
          idea: "La calidad de una decisión depende del momento del día, de lo que alcanzamos a percibir y del silencio que tenemos para pensarla. El experto detecta antes que nadie el punto de no retorno.",
          parrafos: [
            "Un equipo argentino analizó miles de partidas en línea y encontró que por la mañana se juega más lento y con más precisión, y que a medida que avanza el día se juega más rápido y peor, sin importar si la persona es madrugadora o noctámbula. No hay una hora mágica, pero sí políticas distintas: prudentes por la mañana, arriesgadas por la noche.",
            "La ley de Weber dice que notamos un cambio en proporción a lo que ya hay: una pieza de más se siente en la mano vacía, no sobre cincuenta cajas. En ajedrez, el experto es mucho más sensible a las pequeñas desviaciones del equilibrio: percibe antes el **punto de no retorno** de una partida, ese momento a partir del cual la ventaja crece sin freno. El principiante regala material diciendo «no pasa nada»; el maestro juega jugadas profilácticas para que el mal no llegue.",
            "Para el autor, el experto es más sensible a la desventaja que a la ventaja. Petrosian decía que intentaba evitar el azar, y Karpov que mantener la igualdad con piezas pasivas es un riesgo.",
            "El silencio es sagrado en un torneo, y con razón: cuesta mucho más recuperar la concentración que perderla. Pero apartarse un momento del problema sin cambiar de tema, como Carlsen cuando pasea por la sala, puede ayudar: es la **incubación**. Lo dañino es cambiar de foco por completo.",
            "Lo que más estresa no es el ruido en general, sino escuchar conversaciones ajenas mientras se trabaja. Y el ajedrez, a la vez, mejora la concentración: el silencio ayuda al ajedrez y el ajedrez ayuda al silencio.",
          ],
          estudios: [
            "**Leone, Golombek, Sigman y Fernández Slezak:** la hora del día cambia la velocidad y la precisión de las jugadas en línea; el cronotipo no.",
            "**Gloria Mark (Universidad de California):** quien espera ser interrumpido trabaja más rápido para compensar, pero con más estrés.",
            "**Turku, Finlandia (2020):** trabajar oyendo conversaciones produjo más estrés físico que el silencio o el ruido del mismo volumen.",
            "**Beirut:** estudiantes con TDAH que recibieron clases de ajedrez dos veces por semana sostuvieron más la atención en la tarea.",
            "**Friburgo (2018):** un rato de silencio aumenta la atención al presente y reduce la rumiación sobre el pasado y el futuro.",
          ],
          consejos: [
            "Deja las decisiones importantes para cuando estás más fresco, en general por la mañana.",
            "Busca silencio para lo que exige concentración; las conversaciones ajenas son el peor ruido.",
            "Si te trabas, aléjate un momento del problema sin cambiar de tema.",
            "Entrena tu sensibilidad a los pequeños desvíos: es más barato corregir antes del punto de no retorno.",
          ],
        },
        {
          titulo: "Kotov y el árbol de opciones",
          cita: { texto: "Los apuros de tiempo son tiempos de errores.", autor: "Alexander Kotov" },
          idea: "El método de Kotov —listar todas las opciones y analizar cada una una sola vez— no es como pensamos en la práctica, pero es una herramienta excelente para revisar decisiones pasadas y entrenar la intuición.",
          parrafos: [
            "En *Piense como un gran maestro*, Kotov enseñó a calcular **variantes**, que en la vida son opciones con sus propias subopciones. Señaló los vicios del mal análisis: pensar en círculos, volver una y otra vez a la misma línea o «visualizar por visualizar» sin evaluar nada. Su receta: definir las opciones, analizar cada una sin volver atrás y decidir.",
            "El autor le encuentra tres problemas. Los saltos entre ramas a veces sirven, porque una línea ilumina otra. Muchas veces no vemos las opciones buenas hasta entender el problema en conjunto. Y el método no dice por cuál empezar, de modo que se puede gastar todo el esfuerzo en una opción mala.",
            "Aun así, Kotov sirve para **decidir sobre lo que ya se decidió**: volver a una partida o a una decisión, diseccionarla con calma y sacar reglas que alimenten la intuición. Los expertos no calculan más profundo ni más opciones; calculan menos, porque solo miran las buenas.",
            "En la vida diaria pasa lo mismo que en una reunión mal llevada: se discute una opción sin haber aclarado cuál es el objetivo ni cuáles son las ideas candidatas. El buen jugador primero entiende la situación en abstracto, después reúne ideas sin profundizar, luego poda las ramas mirando la superficie y al final invierte todo su análisis en la que promete.",
            "Cuando dos opciones empatan, sirve **agregar variables** que no se estaban mirando. A veces eso cambia la pregunta misma y el problema resulta ser síntoma de otro. Como dice una frase atribuida a Benedetti, cuando creíamos tener todas las respuestas, cambiaron todas las preguntas.",
          ],
          consejos: [
            "Antes de discutir una opción, pregunta cuál es el objetivo y cuáles son las ideas candidatas.",
            "No confundas ideas con acciones: una idea se cumple con una o varias acciones.",
            "No ofrezcas opciones sin evaluarlas; a veces no ofrecer ciertas alternativas ayuda a centrarse.",
            "Revisa paso a paso las decisiones que salieron mal: así se construyen las decisiones expertas.",
          ],
        },
        {
          titulo: "Teoría, práctica y presión del grupo",
          cita: { texto: "Reza, pero no dejes de remar hacia la orilla.", autor: "Proverbio ruso" },
          idea: "Un problema teórico termina cuando se resuelve; uno práctico, no: hay que vivir con las consecuencias de la solución. La verdad no es lo mismo que la solución, y el grupo pesa sobre lo que decidimos.",
          parrafos: [
            "En las Termópilas, unos pocos griegos frenaron a un ejército enorme porque el paso estrecho anulaba la superioridad persa. Lo que se impone en el papel no siempre se impone en la práctica.",
            "Las máquinas juegan de forma casi perfecta, pero a veces eligen líneas que exigirían a una persona no equivocarse nunca. El jugador **pragmático** prefiere una línea segura y simple que le alcance para ganar. En la vida pasa lo mismo: una dieta drástica que funciona en el papel frena el metabolismo, y quien toma un medicamento para el colesterol a veces se descuida y come peor. «¿Prefieres tener razón o ser feliz?», preguntaba un amigo del autor.",
            "Además decidimos en grupo. En el experimento de Solomon Asch, personas que veían claramente cuál línea era la más larga terminaban dando la respuesta equivocada que daba el resto. Nos importa más no ser distintos que tener razón. Galileo tuvo que retractarse ante la mayoría, aunque la Tierra siguiera moviéndose.",
          ],
          estudios: [
            "**Solomon Asch (1951):** la presión de un grupo de actores llevó a los participantes a dar respuestas que sabían falsas.",
            "**William James** y el pragmatismo: una idea es verdadera en la medida en que sirve para orientarse en la realidad.",
          ],
          consejos: [
            "Entre una solución perfecta y difícil y una suficiente y segura, la segunda suele ganar.",
            "Antes de aplicar una solución, imagina cómo reaccionará el sistema (el cuerpo, la gente, el mercado).",
            "Cuando todos opinan igual, revisa si estás de acuerdo o solo acompañando.",
          ],
        },
        {
          titulo: "Redes de salvación y el lugar de la suerte",
          cita: { texto: "La suerte favorece solo a la mente preparada.", autor: "Isaac Asimov" },
          idea: "Antes de arriesgar, conviene tener una red de salvación: una salida suficientemente buena por si las cosas salen mal. Y la suerte se parece mucho a la experiencia: cuanto más sabes, menos depende de ella el resultado.",
          parrafos: [
            "Una **red de salvación** es una decisión consciente, con consecuencias claras, que permite asumir un riesgo grande. En ajedrez suele ser unas tablas aseguradas o una posición tan complicada que el rival tenga que encontrar jugadas muy difíciles. Necesita mucha comprensión e intuición, por eso la usan sobre todo jugadores fuertes. Mijaíl Tal era un maestro: muchos de sus sacrificios no eran del todo correctos, pero sus rivales tenían que refutarlos contra el reloj.",
            "La red solo tiene sentido cuando lo que se arriesga es **grave y probable**. Fuera de eso, solo agrega incertidumbre.",
            "Sobre la suerte, el autor observa algo curioso: un jugador acepta la primera jugada que le propone su cerebro en unos cinco segundos y rara vez cambia de idea. El principiante ni la cuestiona; el intermedio se convence de que es buena; el experto intenta refutarla aunque confíe en ella. Cuanto peor se juega, más se culpa a la suerte.",
            "Para él, la falta de suerte es casi siempre falta de experiencia. Cuenta que, en sus años de selección de personal, quienes reconocían haber tenido suerte en la vida solían rendir mejor después: quizá habían provocado su suerte, o veían como suerte lo que era fruto de su trabajo.",
            "Kasparov lo resumía así: hay que aprender de los errores, pero arrepentirse poco, analizar, entender y seguir adelante.",
          ],
          tablero: [
            "Ivanchuk contra Shirov, Wijk aan Zee, 1996: Ivanchuk entregó su dama por un alfil con 21.Dg7!!, uno de los sacrificios de dama más sorprendentes de la historia, encontrado en el tablero y no en casa. A cambio obtuvo un contrajuego de piezas menores tan fuerte que el problema pasó a ser del rival, y ganó la partida. La coordinación de sus piezas fue su red de salvación.",
          ],
          consejos: [
            "«Grave» y «probable» son las dos palabras que te dicen cuándo necesitas una red de salvación.",
            "Una red no es un plan B improvisado: es una salida pensada antes, con consecuencias reales.",
            "No ganar no siempre es perder.",
            "Tu cerebro te da respuestas inmediatas, pero no estás obligado a creerlas: intenta refutarlas.",
            "Arrepiéntete, pero poco tiempo. Exponerte a ambientes críticos —no destructivos— te trae suerte.",
          ],
        },
        {
          titulo: "La intuición moral y la pieza sobrecargada",
          cita: { texto: "La verdad es una y el error, múltiple.", autor: "Simone de Beauvoir" },
          idea: "Los valores también entran en las decisiones, y las mejoran. En la vida, como en el tablero, no conviene que un solo factor cargue con todo: la pieza sobrecargada es la que hace caer la posición.",
          parrafos: [
            "Los juicios morales también son rápidos e intuitivos: decidimos en segundos si ceder el asiento o intervenir en una pelea, y después buscamos razones. En el dilema del tranvía, la mayoría acepta mover una palanca para salvar a cinco personas a costa de una; casi nadie acepta empujar a alguien desde un puente para lograr lo mismo. Las opciones son iguales; lo que cambia es cuánto nos involucramos.",
            "Los mejores jugadores dedican más tiempo a refutar su primera idea que a buscar otras. Para el autor, esa disposición a dudar nace de un conjunto de virtudes —paciencia, honestidad, humildad, prudencia— y, sobre todo, de la **humildad**, que dice que ninguna idea es mejor por ser nuestra.",
            "En ajedrez, una pieza está **sobrecargada** cuando defiende dos cosas a la vez: basta con atacar una para que la otra caiga. Con frecuencia es la dama. En la vida pasa igual cuando ponemos todo nuestro bienestar en una sola persona, un trabajo o una cosa.",
            "Tarrasch decía que si una pieza está mal, toda la posición está mal. Al revés, cuando no sabes qué hacer: **mejora tu peor pieza**. Y Nimzowitsch, en una anécdota con el habano apagado de Lasker, dejó la frase de que **la amenaza es más fuerte que la ejecución**: lo que nos obliga a estar pendientes de algo que podría pasar nos tiene en un «modo de alerta» que gasta energía. Por eso hay jugadores que prefieren perder un peón a vivir amenazados.",
            "Hay dos formas de lograr un objetivo: perseguirlo de frente o crear el contexto para que llegue solo, como la escuela de ajedrez que crece porque cuida lo pequeño. El autor cree que los valores funcionan como un pegamento invisible: dan confianza, ordenan el trabajo y ahorran energía. Mentir, por ejemplo, cansa.",
          ],
          tablero: [
            "Van Wely contra Kamsky, 1996: la dama negra defendía a la vez una torre y la casilla por donde entraba la dama blanca con mate. Las blancas la tentaron con 32.Ta6! y, al tener que atender las dos cosas, la defensa se derrumbó.",
          ],
          estudios: [
            "**Philippa Foot (1967) y Judith Thomson (1976):** las dos versiones del dilema del tranvía.",
            "**Aaron Eakman (2016):** la vida se desequilibra cuando las ocupaciones diarias frustran nuestras necesidades básicas.",
            "**Uppsala, Suecia:** contar cuentos a niños hospitalizados subió la oxitocina y bajó el cortisol y el dolor. El autor plantea, como hipótesis, que el ajedrez compartido podría hacer algo parecido.",
            "**Anita Kelly (Notre Dame):** quienes mintieron menos durante unas semanas dijeron sentirse mejor de salud y en sus relaciones.",
          ],
          consejos: [
            "No pongas tu bienestar en un solo factor.",
            "Busca tu pieza sobrecargada: el factor que, si falla, empeora todo lo demás.",
            "Fíjate en qué te obliga a estar en alerta: donde pones la atención pones la energía, y la energía es limitada.",
            "Si no sabes qué hacer, mejora tu peor pieza.",
            "Entiende el contexto que produce un objetivo antes de perseguirlo de frente.",
          ],
        },
        {
          titulo: "¿Soy mayor? El cerebro que sigue aprendiendo",
          cita: { texto: "El cerebro no se gasta con el uso.", autor: "Estanislao Bachrach (idea)" },
          idea: "Se puede seguir mejorando —en ajedrez y en todo— a cualquier edad. El cerebro cambia con lo que aprende, siempre que lo aprendido importe, y el ajedrez es una de las mejores formas de mantenerlo activo.",
          parrafos: [
            "Gracias a la **plasticidad cerebral**, el cerebro sigue cambiando durante toda la vida: al entrenar el cálculo, por ejemplo, se forman conexiones que antes no existían. La vejez no es sinónimo de enfermedad, y las personas mayores se parecen cada vez menos entre sí, como las partidas, que empiezan iguales y terminan muy distintas.",
            "Con la edad se pierden unas habilidades y se ganan otras. El punto débil del jugador mayor es la velocidad: el reloj y las posiciones de cálculo concreto. Su fuerte, el conocimiento y los principios. Lo que más pesa no es la edad, sino seguir resolviendo problemas.",
            "Para que el aprendizaje cambie el cerebro, **tiene que importarte**: memorizar cosas sin sentido no deja huella. Y hay que exponerse al cambio a propósito, porque las rutinas —las mismas aperturas, las mismas estructuras— sellan el cerebro.",
            "El autor cierra con recomendaciones de estilo de vida: jugar ajedrez dos o tres veces por semana, moverse entre 15 y 30 minutos al día, aprender cosas nuevas, dormir bien, no sobrecargar el cuerpo, manejar el estrés, mantenerse fuerte y participar en la comunidad. También repasa las reglas antidopaje del ajedrez y los suplementos que él usa; ese es terreno de cada persona con su médico.",
          ],
          estudios: [
            "**Michael Merzenich:** personas mayores que entrenaron 40 horas con ejercicios por computadora rindieron como si fueran unos once años más jóvenes.",
            "**Scientific Reports (2020):** el ajedrez produce cambios en la estructura de todo el cerebro, no solo en las zonas de atención.",
            "**Revisiones sobre demencia (Alicante, 2019; un gran análisis de 2020):** mantener el cerebro activo —con ajedrez, lectura o rompecabezas— se asocia a menos riesgo de demencia; falta evidencia en quienes ya tienen el diagnóstico.",
            "**El estrés y el envejecimiento:** el estrés sostenido se asocia a un envejecimiento celular más rápido; las personas curiosas se deterioran más despacio.",
          ],
          consejos: [
            "Juega y aprende siempre algo que de verdad te importe.",
            "Rompe tus rutinas de vez en cuando: prueba una apertura nueva, un camino distinto.",
            "Cuida el cuerpo para cuidar la mente: movimiento, sueño y menos estrés.",
            "Antes de tomar cualquier suplemento, consulta a tu médico.",
          ],
        },
      ],
    },
    {
      rotulo: "Segunda parte",
      titulo: "El ajedrez en el trabajo",
      intro: "Las mismas ideas del tablero llevadas a la productividad y al bienestar en el trabajo: las trampas de lo inmediato, los motivos, el juego concreto, las restricciones que frenan un sistema, la mejora a saltos, la concreción al comunicarse y cómo sacar provecho de las derrotas.",
      capitulos: [
        {
          titulo: "Las celadas y los atajos",
          idea: "Una celada es una trampa que promete un premio rápido y deja peor si el rival no cae. Buscar la gratificación inmediata es de principiantes; los resultados que duran salen de un sistema que se usa todos los días.",
          parrafos: [
            "Las celadas son como la manzana de Blancanieves: brillantes y envenenadas. Hay que conocerlas para no caer en ellas, no para jugar en función de ellas. Atraen sobre todo a los principiantes, deslumbrados por ganar rápido; quien las tiende acepta quedar peor si el rival juega bien, y si funciona se lo atribuye al talento y no al error ajeno. Grandes jugadores como Anderssen, Lasker o Najdorf cayeron alguna vez en una.",
            "Jugar a base de trampas es confundir objetivos con deseos, saltarse los principios y no hacerse cargo del resultado. Hay organizaciones que funcionan así: tapan cada parche con otro más grande.",
            "AlphaZero aprendió jugando contra sí misma, con la victoria como única recompensa. Ese **aprendizaje por refuerzo** necesita un premio claro, y la vida casi nunca lo tiene. Además, las máquinas a veces aprenden a «hacerle trampa» al sistema en vez de resolver el problema. Ahí aporta el humano: el pragmatismo y la capacidad de ver lo que está más allá del horizonte.",
            "El **efecto horizonte** es el error del motor que corta su búsqueda justo antes de un cambio importante: cree evitar un mal que solo está aplazando. Las personas caemos en lo mismo cuando miramos solo el corto plazo.",
            "El autor propone equipos de varias generaciones: los jóvenes ven la montaña desde abajo, con energía y conocimiento al día; los mayores la ven desde arriba, con experiencia y un mapa rápido del terreno. Y concluye que un sistema de productividad solo funciona si se usa a diario, como rutina.",
          ],
          estudios: [
            "**Princeton (2004):** al cerebro emocional le cuesta imaginar el futuro; al racional, no.",
          ],
          consejos: [
            "Buscar la gratificación inmediata es propio de quien tiene poca experiencia.",
            "Lo que separa un objetivo de un deseo es el compromiso con la meta.",
            "Hacerlo todo fácil te invita a decidir por el gusto del momento.",
            "Logra que tu cerebro coopere con tus objetivos: así esquivas las tentaciones inmediatas.",
          ],
        },
        {
          titulo: "Motivos y hábitos: el papel de tu vida",
          cita: { texto: "No hay papeles pequeños, solo actores pequeños.", autor: "Konstantín Stanislavski" },
          idea: "Un sistema que rinde puede detenerse entero por un solo factor: quedarse sin motivos. El éxito no es repetir frases de motivación, sino convertirse en otra persona, y eso pide un propósito que una todas las acciones.",
          parrafos: [
            "En ajedrez, la productividad se mide en piezas activas y coordinadas contra un objetivo, y el tiempo es la unidad: la misma buena decisión vale más si se toma antes. Pero un sistema muy productivo puede pararse si le falta lo esencial: **los motivos**.",
            "El autor desconfía de los «gurús» de la motivación y de sus frases hechas («querer es poder», «sal de tu zona de confort»). Buscamos la dopamina fácil y, en las redes, gana parecer sobre ser. En ajedrez se nota: los libros que más se venden son de aperturas y los videos más vistos son de trampas para ganar rápido.",
            "Del método de Stanislavski toma la idea del **superobjetivo**: la columna que une todas las acciones de un personaje. El buen actor no imita, encarna; no empieza de cero en cada escena, sino que continúa una historia. Actores como Daniel Day-Lewis llevaron eso al extremo. Para el autor, el éxito es engranar un sistema así, y suele ser duro y poco agradable.",
          ],
          tablero: [
            "En julio de 2022 Magnus Carlsen renunció a defender su título mundial: dijo que no tenía motivación para otro match. Kasparov explicó que mantenerse en la cima es más difícil que llegar, porque se compite contra la sensación de haber cumplido la meta de la vida. Carlsen había perdido su superobjetivo.",
            "Stanislavski, según uno de sus alumnos, admiraba los torneos de ajedrez: gente sentada moviendo piezas y, aun así, tensión todo el tiempo.",
          ],
          consejos: [
            "Define tu superobjetivo: qué une todo lo que haces.",
            "Desconfía de las fórmulas rápidas de motivación; cambiar de verdad cuesta.",
            "Hay muchas formas de éxito, y no hace falta ganar siempre.",
          ],
        },
        {
          titulo: "Leer el momento: el riesgo antes del riesgo",
          cita: { texto: "La incertidumbre es incómoda, pero la certeza es absurda.", autor: "Voltaire" },
          idea: "Un motivo pequeño puede tumbar un sistema grande. Hay que notar las primeras vibraciones, cuidar el tiempo y, cuando conviene, jugar a dos resultados: arriesgar sabiendo que, en el peor caso, no se pierde.",
          parrafos: [
            "Cuanto más complejo y conectado es un sistema, más frágil es: resolver las causas directas puede aumentar las indirectas. En ajedrez, los errores aparecen cuando hay mucho contacto entre piezas y los patrones se vuelven difíciles de reconocer.",
            "Entre aficionados, el primer error casi nunca decide la partida: la catástrofe llega con el segundo. En el trabajo pasa igual. Hay que percibir **el riesgo que precede al riesgo** y no dejar que la prisa lo multiplique.",
            "**Jugar a dos resultados** es buscar situaciones en las que uno decide si arriesga para ganar o se queda con las tablas, pero no pierde. No perder pesa casi tanto como ganar, y unas tablas pueden preparar la próxima victoria.",
            "Las rutinas son nuestros pequeños sistemas. Cuanto más nos alejamos de lo que da sentido a la vida, más esfuerzo hay que poner para sostenerlos, hasta llegar a lo obsesivo. Y la mala suerte, insiste el autor, suele ser falta de experiencia.",
          ],
          estudios: [
            "**68 millones de partidas relámpago de Lichess:** con 20 segundos o menos en el reloj, la probabilidad de un error grave se multiplica hasta por tres, más aún en los niveles bajos.",
          ],
          consejos: [
            "Presta atención a las primeras señales de que algo se desajusta.",
            "Después de un error, cuida el siguiente: el segundo es el que hunde.",
            "Cuando puedas, busca posiciones en las que no puedas perder.",
            "Suma siempre un margen para los imprevistos.",
          ],
        },
        {
          titulo: "Juego concreto y conocimiento muerto",
          cita: { texto: "Lo que no comprendemos no lo poseemos.", autor: "Goethe" },
          idea: "El juego concreto busca la jugada objetivamente mejor aunque rompa los principios; exige una precisión casi infalible y mucho estrés. Con poca experiencia, conviene aferrarse a los principios y no a las excepciones.",
          parrafos: [
            "Se aprende primero táctica y después estrategia, y casi siempre lo estratégicamente correcto también lo es en lo táctico. Los motores mostraron excepciones: posiciones que los principios daban por malas se salvan con una cadena de jugadas muy precisas. Eso es el **juego concreto**.",
            "El **juego pragmático** se apoya en reglas generales y ahorra tiempo y energía, porque calcular es lo que más cansa. El jugador fuerte decide cuánto concretar en cada momento. El autor lo compara con un GPS: lo humano es tomar la autopista conocida; el «súper GPS» de la máquina te manda por una calle que parece ir al revés y que a la larga es mejor.",
            "Por eso no recomienda aprender jugando contra la computadora: sus jugadas funcionan por una forma de pensar que no es humana, y quien empieza no sabe cuánto lo está influyendo. Mejor usarla con alguien que explique.",
            "En las empresas, el juego concreto son los procedimientos rígidos: mucho trabajo repetitivo y gente capaz cuyo saber no se usa, el **conocimiento muerto**. También nace de jefes que no saben manejar a quien piensa. El valor de una persona, como el de una pieza, tiene una parte fija y otra que depende del lugar, del momento y de sus relaciones: un caballo no siempre vale tres peones.",
          ],
          estudios: [
            "**Maia (Universidad de Toronto, 2020):** una red entrenada con partidas humanas que predice qué jugaría una persona de cada nivel, incluso sus errores.",
          ],
          consejos: [
            "Cuanta menos experiencia tengas en algo, más debes aferrarte a los principios y menos a las excepciones.",
            "Diseñar una idea que rompe las reglas estimula; ejecutarla exige precisión y genera estrés.",
            "Si diriges un equipo, mide cuánta rigidez tiene su trabajo y cuánto saber se está desperdiciando.",
            "Usa la ayuda de las máquinas con alguien que te la explique.",
          ],
        },
        {
          titulo: "Las posiciones secas: la oportunidad de la nada",
          cita: { texto: "El cambio es la única cosa inmutable.", autor: "Schopenhauer" },
          idea: "Una posición seca es estable, sin riesgo y aparentemente sin vida; muchos no saben qué hacer en ella. En el trabajo son los valles de poca actividad, y son el mejor momento para pensar a largo plazo.",
          parrafos: [
            "Las posiciones secas no tienen elementos dinámicos ni contacto entre piezas; piden pensamiento abstracto y planes de pasos pequeños, más que cálculo. Suelen aparecer en los finales y después de partidas sin grandes errores. Parecen aburridas, pero un cambio mínimo altera la valoración: hay que no dormirse.",
            "Hay jugadores que sufren justamente porque no tienen por qué sufrir: no saben pasar de «hacer» a «hacer crecer una idea». Les pasa lo mismo a quienes echan de menos la acción al jubilarse.",
            "En el trabajo, los valles no son crisis: muchas veces se llega a ellos por haber hecho bien las cosas. Son buen momento para revisar costumbres heredadas, para ver más allá del propio puesto y para hacer lo que de verdad cambiaría algo, en vez de llenar el tiempo con tareas sin sustancia.",
            "El autor añade una observación de su experiencia: las dos primeras semanas de alguien que llega a una organización son las más valiosas, porque todavía ve lo que los demás ya no cuestionan.",
          ],
          tablero: [
            "Capablanca, Petrosian, Smyslov, Botvinnik, Karpov, Kramnik y Carlsen son grandes maestros de las posiciones secas. Carlsen, además, con una táctica impresionante.",
          ],
          consejos: [
            "En una etapa tranquila, identifica sus rasgos antes de actuar y arma un plan de pasos pequeños.",
            "Usa los valles para revisar lo que se hace «porque siempre se hizo así».",
            "Escucha a quien acaba de llegar: todavía ve lo que tú ya no.",
          ],
        },
        {
          titulo: "Las restricciones que frenan un sistema",
          cita: { texto: "El significado de rápido es ir lento, pero sin pausa.", autor: "Proverbio japonés" },
          idea: "Un proceso va a la velocidad de su paso más lento. Hay restricciones que se ven y otras invisibles, que dañan por desgaste; encontrarlas cuesta, pero quitarlas tiene un efecto palanca en los resultados y en el bienestar.",
          parrafos: [
            "Aprender a jugar es fácil; jugar bien es difícil, porque cada regla tiene excepciones y muchas veces solo se sabe qué era lo correcto mirando hacia atrás. Esa mirada hacia atrás revela los **embudos** del juego. El autor lo ordena en tres capas: las reglas, que sacan de la ignorancia; las excepciones, que dan competencia; y las restricciones invisibles, de una importancia enorme.",
            "Las **restricciones tangibles** se encuentran razonando causa y efecto. En una cadena, una sola jugada mala arruina las cuarenta buenas. El **principio de las dos debilidades** dice que con una debilidad del rival no basta para ganar: hay que crearle una segunda en otro sector. En una organización, una debilidad leve se convive bien… hasta que se presiona otro punto.",
            "Las **restricciones intangibles** no se deducen fácilmente: dependen de varias cosas a la vez o de formas de trabajar que nadie cuestiona. Son permanentes, dañan por desgaste, se esconden (a veces porque dan privilegios), multiplican el malestar ajeno y casi nunca aparecen en un análisis de fortalezas y debilidades. Algunos indicios: conductas poco éticas, pasos en el orden equivocado, la «mala suerte» repetida, mensajes poco concretos, dar por buenos los primeros resultados o una pieza fuera de juego.",
            "Lo invisible que falla en la propia posición es mucho más difícil de ver que lo del rival; por eso defender cuesta más que atacar, y se entrena el ataque y se descuida la prevención. Se aprende más de una derrota que de cien victorias.",
          ],
          tablero: [
            "Un rey y un alfil con un peón de torre contra el rey solo parecen una victoria fácil, pero si el rey defensor llega a la esquina y el alfil no controla la casilla de coronación, es tablas. Una ventaja grande frenada por un detalle.",
            "Aronian contra Navara, 2008: con ventaja, Aronian fijó una primera debilidad en un flanco y creó una segunda en el otro con su peón g. Las negras terminaron con dos debilidades contra una y abandonaron.",
            "Bronstein tardó 40 minutos en su primera jugada de una partida porque no dejaba de pensar dónde había dejado las llaves de su casa: una preocupación ajena convertida en restricción. Y Spassky le aconsejaba a Kasparov detectar el momento clave de la partida y repartir el tiempo según eso.",
          ],
          estudios: [
            "**El caso Hummer:** un vehículo de enorme consumo que triunfó mientras la gasolina era barata y desapareció cuando subió y llegó la crisis. Una debilidad latente que el propio éxito agrandó.",
            "**Pareto:** el 20 % del esfuerzo da el 80 % del resultado, pero hay factores que parecen irrelevantes y pesan mucho.",
          ],
          consejos: [
            "Busca el paso más lento de tu proceso antes de acelerar los demás.",
            "Revisa tus derrotas hasta dar con la causa: un mismo error puede tener causas distintas.",
            "Si no ves con claridad lo que pasa después de tu primera jugada, juega más conservador.",
            "Pregunta qué está fuera de juego en tu equipo o en tu vida: a veces quitarlo vale más que mejorarlo.",
          ],
        },
        {
          titulo: "La mejora a saltos",
          idea: "La mejora continua funciona en una fábrica, pero una persona mejora a saltos, con mesetas y retrocesos. Por eso conviene ponerse metas de actividad y no solo de resultado.",
          parrafos: [
            "Deming enseñó en el Japón de la posguerra a mejorar cada paso de un proceso, poco a poco y sin parar; de ahí salieron métodos como el de Toyota. Pero en una persona —un ajedrecista, una carrera— la mejora no es una línea: llega en saltos, con mesetas largas en las que parece que no se avanza.",
            "La propuesta del autor es fijar **objetivos de actividad**: cuántas partidas analizar, cuántas horas de estudio, qué temas trabajar, definidos con la misma precisión que un resultado. Eso baja el estrés de tener que subir siempre el Elo y arrastra, de paso, restricciones que ni conocíamos.",
            "Una preparación exhaustiva también tiene costos: el autor vio a jóvenes prometedores exprimidos por exigencias que no podían sostener. A la mayoría le sirve más una competencia controlada, sobre todo contra uno mismo, y hacer lo que toca en el momento correcto aunque no apetezca.",
          ],
          tablero: [
            "La curva de rating de Alireza Firouzja muestra dos saltos casi explosivos en sus primeros años, con mesetas y retrocesos, y después una subida lenta y sostenida. Jugadores como Caruana o Giri tienen curvas más lineales; en los niveles más bajos, las curvas oscilan mucho más.",
          ],
          estudios: [
            "**MIT:** durante una clase magistral, la actividad cerebral de los estudiantes es casi nula; se aprende más experimentando e interactuando.",
          ],
          consejos: [
            "Ponte metas de actividad concretas, no solo de resultado.",
            "No te desanimes en las mesetas: el salto suele llegar después de persistir.",
            "Aprende haciendo y explicando, no solo escuchando.",
          ],
        },
        {
          titulo: "Los ladrones del tiempo y el valor de la concreción",
          cita: { texto: "La claridad es el barniz de los maestros.", autor: "Vauvenargues" },
          idea: "La comunicación vaga es el gran ladrón del tiempo en el trabajo. Como una buena jugada, un buen mensaje dice lo esencial, tiene sentido completo y deja claro qué sigue.",
          parrafos: [
            "Los maestros dicen que hay que **hablar con las piezas**: escuchar qué necesita cada una. En una partida esa comunicación es perfecta, porque una sola mente manda sobre todas; entre personas no existe esa mente única y la comunicación siempre es imperfecta. Además, la misma posición le «habla» distinto a cada jugador.",
            "El ajedrez se aprende como un idioma: el nivel nativo se adquiere pero no se enseña, y hay quien aplica las reglas de la estrategia con maestría sin saber explicarlas.",
            "El autor ve en la falta de **concreción** el mal principal de las reuniones, muchas de las cuales podrían ser un correo. Concretar es reducir el mensaje a lo esencial para que, como una jugada, tenga significado completo y lo siguiente se encadene sin demora.",
            "El edificio del 60 de Hudson Street, en Nueva York, es uno de los nudos más densos de internet, y las empresas pagan fortunas por estar cerca y ganar milisegundos: el valor de la información depende del momento.",
            "El tiempo de un equipo está hecho de pequeñas transacciones entre personas, como las jugadas de una partida. Hay quien se especializa en generar trabajo inútil para los demás: los **ladrones del tiempo**, piezas que hablan sin decir nada. Quien dirige debe verlos y cortar esa fuga.",
          ],
          estudios: [
            "**Acta Paediatrica (2017):** en niños de 8 a 12 años, leer aumentó la conexión entre las áreas del lenguaje y del control de la atención; las pantallas la redujeron.",
            "**Stuart Margulies:** los alumnos que aprendieron ajedrez mejoraron su lectura.",
          ],
          consejos: [
            "Transmite pocas ideas concretas en vez de muchas vagas, aunque parezcan geniales.",
            "Adapta el mensaje a quien lo recibe, y comprueba que te entendió.",
            "Expón tus ideas a la crítica desde el principio: evita conflictos después.",
            "Cuanto más arriba está el error de concreción, más ineficiencia riega.",
          ],
        },
        {
          titulo: "Sacar provecho de las derrotas",
          cita: { texto: "Llevo en mi mundo que florece todos los mundos que han fracasado.", autor: "Rabindranath Tagore" },
          idea: "El ajedrecista vive en el fracaso, y por eso sabe aprovecharlo. Analizar los propios errores no es pesimismo: es la mejor herramienta para crecer y la mejor arma de la creatividad.",
          parrafos: [
            "Vivimos rodeados de una idea de éxito hecha de dinero, estatus y frases hechas. Al autor le interesa más el fracaso. Ningún deporte produce tantos errores como el ajedrez: unas cuarenta decisiones por partida, cada una con la presión de ser la mejor, y un solo error puede costar la partida o el torneo entero.",
            "Por eso el ajedrez es una especie de «errorología»: el jugador fuerte revisa en fracciones de segundo si su jugada puede fallar antes de hacerla. Los grandes entrenadores —Botvinnik, Dvoretsky, Yusupov y otros— coinciden en trabajar una y otra vez sobre los propios errores para desarmar el juego y volver a armarlo.",
            "Un error que no se analiza no enseña nada, y achacarlo a la mala suerte es todavía peor. Detrás de cada jugada hay hechos y también lo que pensábamos; ahí se ve la calidad de un jugador.",
            "Nos da miedo hablar del fracaso porque creemos que habla de nosotros. Pero muchas veces no conseguir lo que queremos es justo lo que necesitamos.",
          ],
          tablero: [
            "En la Olimpiada de 2022, el joven Gukesh ganó sus primeras ocho partidas, entre ellas a Shirov y Caruana, y llevó a la India a la cabeza. En la ronda siguiente, con una posición ganadora, cometió un error y perdió. Pasó de héroe a víctima en segundos, y su equipo terminó tercero.",
          ],
          consejos: [
            "Analiza cada derrota hasta entenderla; no la expliques con la suerte.",
            "Siente el fracaso poco tiempo y piénsalo mucho.",
            "Separa lo que pasó de lo que pensabas cuando pasó: ahí está la lección.",
          ],
        },
      ],
    },
  ],

  veinteConsejos: [
    "Dedica poco tiempo a **sentir** el fracaso y mucho a **pensarlo**.",
    "Cuanto más intentes refutar tus propias opiniones, más fuerte será tu punto de vista.",
    "No dejes de aprender: lo que aprendes te servirá en situaciones que ni imaginas.",
    "Calcula bien cuándo una amenaza pesa más que su ejecución.",
    "Evalúa siempre las consecuencias de lo que haces.",
    "No subestimes a los demás.",
    "Todo el mundo guarda información que tú no conoces.",
    "Nadie gana siempre, y nadie pierde siempre.",
    "Cultiva un sentido moral firme.",
    "Sé persistente.",
    "Aprende a reconocer cuándo ya tienes suficiente.",
    "Valora el consejo de la gente humilde.",
    "Convierte tus malas partidas en buenas historias.",
    "Ante los miedos del futuro, recuerda las soluciones que ya supiste encontrar en el pasado.",
    "Interpreta el dolor: pregúntate qué te está diciendo.",
    "No tomes atajos.",
    "Sé amable con quienes salen perdiendo cuando tú ganas.",
    "Aunque busques resultados, céntrate en el camino.",
    "No te olvides del tiempo.",
    "Tus jugadas son tu responsabilidad, y tu vida también.",
  ],

  preguntas: [
    "¿En qué parte de tu vida decides como un experto, casi sin pensar? ¿En cuál todavía necesitas el método de Kotov?",
    "¿Cuál es tu pieza sobrecargada: qué cosa, si falla, arrastra a todas las demás?",
    "¿Qué amenaza te tiene en alerta aunque todavía no haya pasado nada?",
    "¿Qué celada te ha tentado últimamente: un atajo que prometía mucho y rápido?",
    "¿Cuál es el paso más lento de tu semana, el que frena todo lo demás?",
    "Piensa en tu última derrota importante. ¿Qué pasó, y qué pensabas mientras pasaba?",
  ],

  creditos: [
    "Este libro resume *Coachess: inteligencia del ajedrez para tu desarrollo personal y profesional*, de **Daniel Muñoz Sánchez** (2022), autor también de *El Método Zugzwang* y fundador de la escuela The Zugzwang. Las ideas, los ejemplos de partidas y los estudios citados son los de su libro; el texto de este resumen está escrito aparte, con otras palabras, y no reproduce el original.",
    "Se preparó para la Academia Ajedrez Integral como material de lectura y conversación. No sustituye al libro: si alguna de estas ideas te sirvió, léelo completo.",
    "Los datos de los estudios se cuentan como los presenta el autor, sin volver a comprobarlos. Nada de lo que aquí se dice sobre salud, alimentación o suplementos reemplaza la opinión de un profesional de la salud.",
  ],
};
