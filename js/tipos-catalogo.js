/* Los Tipos de entrenamiento: qué son, qué entrenan y sus niveles.
 *
 * Una sola copia para las tres pantallas que los muestran: la ficha y el
 * juego del alumno (entreno/tipos.html), el panel «Entrenamientos» del
 * profesor en la clase en vivo (sesion.html) y el verificador. Las posiciones
 * NO van acá: las arma herramientas/tipos-generar.js en
 * entreno/data/tipos.json, cada una comprobada con chess.js y con el motor.
 *
 * El `id` de cada tipo y de cada nivel no se cambia: forma parte de la clave
 * con la que se guarda el avance de cada alumno ("detective:det-1-…").
 */
(function (raiz) {
  "use strict";

  const TIPOS = [
    {
      id: "detective", emoji: "🕵️", nombre: "El Detective",
      pregunta: "¿Qué jugada se acaba de hacer?",
      entrena: "Leer el tablero como una escena (análisis retrógrado): de dónde vino cada pieza y por qué no pudo venir de otro lado.",
      como: "Ves una posición con un rey en jaque y cuatro explicaciones de cuál fue la última jugada. Solo una pudo pasar de verdad: las otras dejan al rey en jaque cuando no le tocaba jugar, o no eran legales.",
      clase: "Pon la posición en el tablero de la clase, lee las opciones en voz alta y pide que expliquen por qué las otras son imposibles.",
      niveles: [
        { n: 1, titulo: "El jaque delata", desc: "Tres opciones. La pieza que da jaque es la que se movió." },
        { n: 2, titulo: "¿Desde dónde?", desc: "Cuatro opciones, y dos son de la misma pieza: desde una de esas casillas ya habría estado dando jaque." },
        { n: 3, titulo: "A la descubierta", desc: "La pieza que da jaque no se movió: se movió la que le tapaba el camino." },
        { n: 4, titulo: "Jugadas especiales", desc: "Coronaciones, enroques, capturas al paso y jaques dobles." },
      ],
    },
    {
      id: "amenaza", emoji: "👀", nombre: "¿Qué quiere el rival?",
      pregunta: "Te toca a ti, pero antes: ¿qué amenaza el rival?",
      entrena: "La profilaxis: preguntarse qué quiere el rival antes de mover. La mayoría de las partidas se pierden por no hacerlo.",
      como: "Juegas con un color y el tablero te muestra desde tu lado. Tienes que hacer la jugada que haría el RIVAL si le tocara a él: su amenaza.",
      clase: "Con «Preguntar» cada alumno mueve por el rival en su tablero: la respuesta correcta es la amenaza. Con «Al tablero» la pones para comentarla.",
      niveles: [
        { n: 1, titulo: "Algo colgando", desc: "El rival amenaza comerse una pieza que quedó sin defensa." },
        { n: 2, titulo: "Mate en 1", desc: "El rival amenaza dar mate de inmediato." },
        { n: 3, titulo: "Golpe táctico", desc: "Tenedores, clavadas, enfiladas y ataques a la descubierta." },
        { n: 4, titulo: "Mate en 2", desc: "La amenaza es un mate en dos jugadas." },
        { n: 5, titulo: "Amenaza silenciosa", desc: "Sin jaque ni captura: una jugada tranquila que no tiene defensa." },
      ],
    },
    {
      id: "descarte", emoji: "✂️", nombre: "Descarte",
      pregunta: "¿Cuáles de estas jugadas pierden?",
      entrena: "La revisión de seguridad antes de mover: no buscar la mejor, sino no jugar una que pierde.",
      como: "Te toca mover y hay varias jugadas candidatas que se ven razonables. Tacha las que pierden (el motor las castiga con dos peones o más) y deja las que aguantan.",
      clase: "Pon la posición y lee las candidatas: que cada alumno diga cuáles tacharía y por qué. Tú ves cuáles pierden y la refutación.",
      niveles: [
        { n: 1, titulo: "Tres candidatas", desc: "Una sola de las tres pierde." },
        { n: 2, titulo: "Cuatro candidatas", desc: "Dos pierden y dos aguantan." },
        { n: 3, titulo: "Cinco candidatas", desc: "Posiciones más difíciles, con dos o tres trampas." },
        { n: 4, titulo: "Seis candidatas", desc: "Tres pierden. La refutación ya no es tan obvia." },
      ],
    },
    {
      id: "diferencias", emoji: "🔍", nombre: "Siete diferencias",
      pregunta: "¿Qué detalle hace que el golpe ya no funcione?",
      entrena: "Comprobar las condiciones de una táctica antes de jugarla de memoria: el mismo golpe gana o pierde por un solo detalle.",
      como: "Ves dos posiciones casi iguales. En A el golpe gana; en B, jugado igual, ya no. Encuentra la casilla que cambió y, si puedes, la respuesta del rival que lo refuta en B.",
      clase: "Pon A en el tablero y que resuelvan el golpe; después pon B y pregunta por qué ya no sirve. Con «Preguntar la refutación» cada alumno busca cómo se defiende el rival en B.",
      niveles: [
        { n: 1, titulo: "Falta una pieza", desc: "En B hay una pieza menos." },
        { n: 2, titulo: "Un peón de más o de menos", desc: "En B un peón está una casilla más adelante o más atrás." },
        { n: 3, titulo: "Una pieza corrida", desc: "En B una pieza está en la casilla de al lado." },
        { n: 4, titulo: "Se nota después", desc: "Líneas largas: el rival contesta igual, y la diferencia muerde más adelante." },
      ],
    },
    {
      id: "balanza", emoji: "⚖️", nombre: "La balanza",
      pregunta: "¿Quién está mejor, y por cuánto?",
      entrena: "El juicio: evaluar una posición sin calcularla entera, más allá de contar peones.",
      como: "Pones la aguja entre −5 (ganan las negras) y +5 (ganan las blancas). Ganas estrellas según qué tan cerca quedaste del motor.",
      clase: "Pon la posición y que cada alumno diga su número antes de que tú muestres el del motor.",
      niveles: [
        { n: 1, titulo: "Cuenta el material", desc: "Un bando tiene más material y eso decide." },
        { n: 2, titulo: "Parejo o leve", desc: "Posiciones igualadas o con una ventaja pequeña: hay que afinar." },
        { n: 3, titulo: "No todo es material", desc: "El material está igual, pero un bando está mucho mejor." },
        { n: 4, titulo: "El material engaña", desc: "Quien tiene más material no es quien está mejor." },
      ],
    },
    {
      id: "fotografia", emoji: "📸", nombre: "Fotografía",
      pregunta: "Mírala bien: ¿la puedes reconstruir?",
      entrena: "La memoria de posiciones: ver el tablero por grupos de piezas con sentido, como lo ven los jugadores fuertes.",
      como: "Ves una posición de una partida real durante unos segundos. Desaparece y la reconstruyes pieza por pieza (tocando las casillas o escribiéndolas). En el último nivel no la reconstruyes: contestas preguntas sobre ella.",
      clase: "Con «Mostrar y ocultar» la clase ve la posición unos segundos y luego las piezas desaparecen de todos los tableros. Pide que la reconstruyan en papel o de palabra.",
      niveles: [
        { n: 1, titulo: "Pocas piezas", desc: "Hasta 7 piezas, 10 segundos.", segundos: 10 },
        { n: 2, titulo: "Un final", desc: "De 8 a 12 piezas, 10 segundos.", segundos: 10 },
        { n: 3, titulo: "Medio juego ligero", desc: "De 13 a 18 piezas, 8 segundos.", segundos: 8 },
        { n: 4, titulo: "Tablero lleno", desc: "De 19 a 26 piezas, 8 segundos.", segundos: 8 },
        { n: 5, titulo: "Preguntas", desc: "5 segundos para mirar y tres preguntas sobre lo que viste.", segundos: 5 },
      ],
    },
    {
      id: "con-lo-justo", emoji: "👑", nombre: "Con lo justo",
      pregunta: "Da mate con lo que tienes.",
      entrena: "Los mates básicos: llevar al rey al borde, no regalar tablas por ahogado y no dejar piezas sueltas.",
      como: "Tienes el rey y una o dos piezas contra el rey solo. Da mate antes de las 50 jugadas. Las estrellas dependen de cuántas jugadas te sobran respecto del mínimo exacto contra la mejor defensa.",
      clase: "Con «Practicar» cada alumno juega la posición contra el motor. Con «Al tablero» la resuelven juntos.",
      niveles: [
        { n: 1, titulo: "Dos torres", desc: "La escalera: una torre corta, la otra da jaque." },
        { n: 2, titulo: "Dama", desc: "Encerrar al rey sin ahogarlo." },
        { n: 3, titulo: "Torre", desc: "La oposición del rey y los jaques de la torre." },
        { n: 4, titulo: "Dos alfiles", desc: "Una pared diagonal que empuja al rey a la esquina." },
        { n: 5, titulo: "Alfil y caballo", desc: "El mate más difícil de los básicos: a la esquina del color del alfil." },
      ],
    },
    {
      id: "barrido", emoji: "🧹", nombre: "El Barrido",
      pregunta: "¿Viste TODOS los jaques, capturas y amenazas?",
      entrena: "El hábito que más partidas salva: antes de mover, revisar todas las jugadas forzantes, las propias y las del rival.",
      como: "Anota todas las jugadas que se piden (tocándolas en el tablero o escribiéndolas; no se mueve nada). No gana el que encuentra la mejor: gana el que no se olvida de ninguna.",
      clase: "Pon la posición y que cada alumno diga una jugada forzante distinta, hasta que no quede ninguna. Tú tienes la lista completa.",
      niveles: [
        { n: 1, titulo: "Solo jaques", desc: "Pocas piezas: encuentra todos los jaques." },
        { n: 2, titulo: "Jaques y capturas", desc: "Todos los jaques y todas las capturas." },
        { n: 3, titulo: "Y las amenazas", desc: "Además, las jugadas tranquilas que atacan algo sin defensa o que vale más." },
        { n: 4, titulo: "Tablero lleno", desc: "Todo, con el tablero lleno y 90 segundos." },
      ],
    },
    {
      id: "intercambios", emoji: "🔄", nombre: "Intercambios",
      pregunta: "Si se cambia todo en esa casilla, ¿quién se queda con el material?",
      entrena: "Contar un cambio de piezas sin equivocarse: quién captura con qué, cuándo conviene parar, rayos X y clavadas.",
      como: "Una casilla marcada donde se atacan varias piezas. Cada bando captura con su pieza de menos valor y sigue solo mientras le conviene. Di cómo termina.",
      clase: "Pon la posición, marca la casilla con una flecha y que voten: ¿se gana, se empata o se pierde? Después reproduzcan el cambio en el tablero.",
      niveles: [
        { n: 1, titulo: "Dos contra uno", desc: "Cambios cortos, pocas piezas." },
        { n: 2, titulo: "Varias piezas", desc: "Cuatro capturas o más." },
        { n: 3, titulo: "Rayos X", desc: "Una pieza entra al cambio desde atrás de otra. Di el resultado exacto." },
        { n: 4, titulo: "Clavadas", desc: "Una pieza parece defender pero está clavada y no puede capturar." },
      ],
    },
    {
      id: "construye", emoji: "🏗️", nombre: "Constrúyela tú",
      pregunta: "¿Dónde pondrías esta pieza para que pase?",
      entrena: "Entender por qué funciona un motivo, no solo reconocerlo: para armarlo hay que saber qué condiciones necesita.",
      como: "Te dan una posición y una pieza. Colócala en una casilla vacía para lograr lo que se pide: un mate, un tenedor, una clavada o tapar un mate. Vale cualquier casilla que cumpla.",
      clase: "Pon la posición y que cada alumno proponga su casilla: puede haber varias respuestas buenas, y se comprueban juntos en el tablero.",
      niveles: [
        { n: 1, titulo: "Mate ya", desc: "La pieza que pones da jaque mate ahora mismo." },
        { n: 2, titulo: "Tenedor", desc: "Un caballo que ataca dos piezas grandes a la vez y no se lo pueden comer." },
        { n: 3, titulo: "Clavada", desc: "Una pieza que clava otra contra su rey." },
        { n: 4, titulo: "Mate en 1", desc: "Ponla para que haya mate en una jugada." },
        { n: 5, titulo: "Quita el mate", desc: "Del otro lado: pon una pieza para que el rival ya no tenga mate en 1." },
      ],
    },
    {
      id: "peones", emoji: "♙", nombre: "Rey y peón",
      pregunta: "¿Corona, o el rey lo para?",
      entrena: "El final más importante de todos: la regla del cuadrado, la oposición y las casillas clave.",
      como: "Rey y peón contra rey. Di si ganan las blancas o son tablas, encuentra la única jugada que gana o llévalo a coronar. Todo se comprueba contra la tabla completa del final.",
      clase: "Pon la posición y que voten gana o tablas antes de jugarla. En «Llévalo a coronar», cada alumno puede practicarla contra el motor.",
      niveles: [
        { n: 1, titulo: "El cuadrado", desc: "El rey blanco está lejos: ¿alcanza el rey negro al peón?" },
        { n: 2, titulo: "¿Gana o tablas?", desc: "Los reyes encima del peón: la oposición decide." },
        { n: 3, titulo: "La única jugada", desc: "Solo una jugada gana. Encuéntrala." },
        { n: 4, titulo: "Llévalo a coronar", desc: "Juégalo hasta coronar sin dejar escapar la victoria." },
      ],
    },
    {
      id: "maestro", emoji: "🎓", nombre: "Adivina la jugada del maestro",
      pregunta: "¿Qué jugó el gran maestro aquí?",
      entrena: "Pensar como un jugador fuerte: plan, desarrollo y ataque dentro de una partida de verdad, jugada por jugada.",
      como: "Recorres un tramo de una partida del curso «Partidas modelo» con el bando que ganó. Antes de cada jugada, adivina la del maestro: 3 puntos si coincide, 1 si el motor la da tan buena.",
      clase: "Pon la posición y pregunta «¿qué jugarías?». Después muestra la jugada del maestro y comenten la diferencia.",
      niveles: [
        { n: 1, titulo: "La apertura", desc: "Jugadas 5 a 14: desarrollo y primeras ideas." },
        { n: 2, titulo: "El medio juego", desc: "Jugadas 15 a 24: el plan." },
        { n: 3, titulo: "El remate", desc: "Las últimas diez jugadas del que ganó." },
      ],
    },
    {
      id: "apertura", emoji: "📖", nombre: "¿Qué apertura es?",
      pregunta: "¿Cómo se llama esta apertura?",
      entrena: "Reconocer las aperturas por su posición, no solo por las jugadas: saber dónde estás para saber qué planes vienen.",
      como: "Ves la posición después de unas jugadas y eliges el nombre. En el último nivel no hay tablero: solo las jugadas, y en otro orden.",
      clase: "Pon la posición y que la nombren. Buen momento para repasar las ideas de cada apertura.",
      niveles: [
        { n: 1, titulo: "La familia", desc: "Tras las primeras jugadas: ¿qué apertura es?" },
        { n: 2, titulo: "La línea exacta", desc: "Tras la línea entera: ¿cuál de las variantes es?" },
        { n: 3, titulo: "En otro orden", desc: "Solo las jugadas, en otro orden, y se llega a lo mismo." },
      ],
    },
    {
      id: "ruta", emoji: "🗺️", nombre: "La ruta segura",
      pregunta: "¿Cómo llegas allá sin que te la coman?",
      entrena: "Ver qué casillas controla el rival y mover las piezas por el camino corto: coordinación y geometría.",
      como: "Lleva una pieza a la casilla marcada en el menor número de jugadas, sin capturar y sin pisar ninguna casilla que ataque el rival. El rival no se mueve.",
      clase: "Pon la posición y que cada alumno dicte su ruta, casilla por casilla. Gana la más corta que no pise nada atacado.",
      niveles: [
        { n: 1, titulo: "Torre y alfil", desc: "Pocas piezas en el tablero." },
        { n: 2, titulo: "Dama y rey", desc: "Más caminos, más casillas vigiladas." },
        { n: 3, titulo: "Caballo", desc: "El caballo, que va a los saltos." },
        { n: 4, titulo: "Tablero lleno", desc: "Caballo o alfil entre muchas piezas." },
      ],
    },
    {
      id: "aguanta", emoji: "🛡️", nombre: "Aguanta",
      pregunta: "El rival amenaza algo serio. ¿Cuál es la única jugada que aguanta?",
      entrena: "Defender: ver la amenaza a tiempo y encontrar la única jugada que la para sin perder otra cosa. Se entrena poco y decide muchas partidas.",
      como: "Te toca mover y el rival tiene preparado un golpe. Solo UNA jugada lo frena (comprobado con el motor): todas las demás pierden. Si fallas, ves cómo te castiga el rival. Si no ves la amenaza, pide que te la muestren.",
      clase: "Pon la posición y pregunta primero «¿qué quiere el rival?»; después, con «Preguntar», cada alumno busca la única defensa en su tablero.",
      niveles: [
        { n: 1, titulo: "Salva la pieza", desc: "El rival amenaza comerse algo, y solo una jugada lo evita sin perder otra cosa." },
        { n: 2, titulo: "Tapa el mate", desc: "El rival amenaza mate en una. Solo una jugada lo para." },
        { n: 3, titulo: "Contra el golpe", desc: "El rival prepara un golpe sin captura: un jaque, un tenedor, una jugada tranquila. Desármalo antes." },
        { n: 4, titulo: "Lo que no se ve", desc: "El rival amenaza mate en dos o más jugadas: la defensa está más lejos." },
      ],
    },
    {
      id: "remata", emoji: "🏁", nombre: "Remata la ventaja",
      pregunta: "Vas ganando. ¿La puedes llevar a casa?",
      entrena: "Convertir una ventaja: simplificar, cambiar piezas, no apurarse y no dejarle contrajuego al rival. Muchas partidas ganadas se escapan aquí.",
      como: "Empiezas con +4 o más (medido con el motor) en una posición de partida real y juegas contra la máquina a toda su fuerza. Lo logras si das mate o si, al cumplir las jugadas del nivel, sigues en +3 o más. Si la ventaja baja de +1,5, se te escapó.",
      clase: "Con «Practicar», cada alumno juega la posición contra el motor en su tablero. Antes, pregunten en voz alta cuál es el plan: ¿cambiar piezas, atacar al rey, avanzar un peón pasado?",
      niveles: [
        { n: 1, titulo: "Material de sobra", desc: "Tienes una torre o más de ventaja. 8 jugadas.", jugadas: 8 },
        { n: 2, titulo: "Una pieza de más", desc: "Tienes una pieza de ventaja (o su equivalente). 10 jugadas.", jugadas: 10 },
        { n: 3, titulo: "Sin material de más", desc: "El material está casi igual, pero tu posición gana: no la dejes enfriar. 12 jugadas.", jugadas: 12 },
      ],
    },
    {
      id: "tiempo", emoji: "⏱️", nombre: "Elige a tiempo",
      pregunta: "El reloj corre. ¿Cuál juegas?",
      entrena: "Decidir con el reloj en contra en posiciones tranquilas, donde no hay táctica que salve: elegir una jugada sana a tiempo vale más que buscar la perfecta y perder por tiempo.",
      como: "Ves una posición de partida real sin golpes a la vista y dos, tres o cuatro jugadas candidatas. Elige una antes de que se acabe el reloj. No hay una sola buena: cuenta cuánto pierde la tuya contra la mejor, medido con el motor. Si se acaba el tiempo, es como perder por tiempo. En Modo Adaptado tienes el triple de tiempo.",
      clase: "Pon la posición y cuenta en voz alta los segundos: que cada alumno levante la mano con su candidata antes de que termines. Después muestren cuánto pierde cada una.",
      niveles: [
        { n: 1, titulo: "Con calma", desc: "Tres candidatas y 30 segundos.", segundos: 30 },
        { n: 2, titulo: "Ritmo rápido", desc: "Tres candidatas y 15 segundos.", segundos: 15 },
        { n: 3, titulo: "Blitz", desc: "Cuatro candidatas y 8 segundos.", segundos: 8 },
      ],
    },
    {
      id: "errores", emoji: "🪞", nombre: "Tus propios errores", propio: true,
      pregunta: "¿Qué debiste jugar en tu partida?",
      entrena: "Aprender de lo que te pasó a ti: los errores de tus propias partidas son los que más se repiten, y los que más enseñan.",
      como: "Busca errores en tus partidas terminadas (Juegos, retos, torneos de la Academia y la práctica en clase): el motor las revisa en tu computadora o celular y cada jugada donde se cayó la evaluación se vuelve un ejercicio. Encuentra una jugada buena en esa posición; vale cualquiera que el motor dé tan buena como la mejor.",
      clase: "Cada alumno tiene los suyos: salen de sus partidas. Pídeles que busquen sus errores y que traigan uno a la clase para comentarlo juntos.",
      niveles: [
        { n: 1, titulo: "Lo que regalaste", desc: "Estabas bien y con esa jugada quedaste mal." },
        { n: 2, titulo: "Lo que se te escapó", desc: "Ibas ganando y con esa jugada se te fue la ventaja." },
      ],
    },
    {
      id: "tablas", emoji: "🤝", nombre: "Salva las tablas",
      pregunta: "Vas con menos material. ¿Lo puedes aguantar?",
      entrena: "Defender una posición inferior sin rendirse: buscar el jaque continuo, el ahogado, cambiar lo que sobra, armar una fortaleza. Muchas partidas perdidas se salvan aquí.",
      como: "Empiezas con menos material, pero el motor dice que se puede aguantar. Juegas contra la máquina a toda su fuerza: lo logras si llegas a tablas (ahogado, repetición, 50 jugadas o material insuficiente) o si aguantas las jugadas del nivel sin que la posición se pierda (sin bajar de −2,5).",
      clase: "Con «Practicar», cada alumno juega la posición contra el motor. Antes, pregunten qué recursos hay: ¿un jaque continuo? ¿un ahogado? ¿qué conviene cambiar?",
      niveles: [
        { n: 1, titulo: "Un peón menos", desc: "Te falta un peón, y la ventaja del rival crece si te descuidas. 10 jugadas.", jugadas: 10 },
        { n: 2, titulo: "Más de un peón", desc: "Te faltan dos puntos de material o más: hay que buscar los recursos. 12 jugadas.", jugadas: 12 },
      ],
    },
    {
      id: "casillas", emoji: "📍", nombre: "Mapa de casillas",
      pregunta: "¿Qué casillas controla?",
      entrena: "Ver el tablero como lo ven los jugadores fuertes: no solo dónde están las piezas, sino qué casillas dominan. De ahí salen los planes, las casillas de entrada y los mates.",
      como: "Marca todas las casillas que se piden, tocándolas en el tablero o escribiéndolas («e4 f5 g6»). No se mueve nada. Una casilla atacada cuenta aunque haya una pieza encima: si es del rival, se la podría comer; si es propia, está defendida.",
      clase: "Pon la posición y pide que cada alumno diga una casilla, hasta que no quede ninguna. Tú tienes la lista completa en «Respuesta».",
      niveles: [
        { n: 1, titulo: "Una pieza", desc: "Todas las casillas que ataca la pieza marcada." },
        { n: 2, titulo: "Alrededor del rey", desc: "Las casillas vecinas del rey rival que atacan tus piezas: por donde ya no puede escapar." },
        { n: 3, titulo: "La pieza del rival", desc: "Todas las casillas que ataca una pieza del rival: lo que tienes que vigilar." },
        { n: 4, titulo: "Casillas seguras", desc: "Las casillas a las que tu pieza puede ir sin que el rival las ataque." },
      ],
    },
    {
      id: "alcanza", emoji: "🏃", nombre: "¿Alcanza el rey?",
      pregunta: "Final de peones: ¿quién gana? Decide antes de que se acabe el reloj.",
      entrena: "Juzgar un final de peones de un vistazo: la regla del cuadrado, la carrera de peones, la oposición y la ruptura. En una partida no hay tiempo para calcularlo todo.",
      como: "Solo reyes y peones, de partidas reales. Elige: ganan las blancas, tablas o ganan las negras. Una sola oportunidad y un reloj; si contestas bien en la mitad del tiempo, tres estrellas. El resultado lo comprobó el motor analizando a fondo. En Modo Adaptado tienes el triple de tiempo.",
      clase: "Pon la posición y cuenta los segundos en voz alta: que cada alumno levante la mano con su veredicto. Después juéguenla en el tablero para ver por qué.",
      niveles: [
        { n: 1, titulo: "Un peón que corre", desc: "Solo un bando tiene peón pasado: ¿lo alcanza el rey? 30 segundos.", segundos: 30 },
        { n: 2, titulo: "Carrera", desc: "Los dos bandos tienen peón pasado: ¿quién corona primero, y sirve? 30 segundos.", segundos: 30 },
        { n: 3, titulo: "Sin pasados", desc: "Todavía nadie tiene peón pasado: deciden la oposición y la ruptura. 40 segundos.", segundos: 40 },
      ],
    },
    {
      id: "liquidar", emoji: "🔀", nombre: "¿Cambio y paso al final de peones?",
      pregunta: "Si cambias todo, ¿el final de peones se gana?",
      entrena: "La decisión que más cuesta en los finales: cambiar las últimas piezas. Un final de peones no perdona, y antes de entrar hay que saber cómo termina.",
      como: "Ves una posición de partida real y la cadena de cambios que deja solo reyes y peones. Di cómo es ese final para el bando que mueve: se gana, son tablas o se pierde. Lo comprobó el motor analizando el final a fondo, y la explicación dice qué pasaba si no cambiabas.",
      clase: "Pon la posición, juega los cambios en el tablero y que voten: ¿se gana, son tablas o se pierde? Después muestren la línea del motor.",
      niveles: [
        { n: 1, titulo: "Un cambio", desc: "Una pieza por otra, y queda el final de peones." },
        { n: 2, titulo: "Dos cambios", desc: "Salen dos piezas de cada lado antes de llegar al final." },
        { n: 3, titulo: "Peones iguales", desc: "Los dos quedan con los mismos peones: lo decide dónde están los reyes y los peones." },
      ],
    },
    {
      id: "intermedia", emoji: "⏸️", nombre: "La intermedia",
      pregunta: "Lo natural es recuperar el material. ¿Hay algo mejor antes?",
      entrena: "No recapturar en automático: antes de recuperar lo que se perdió, mirar si hay un jaque o una amenaza que gane más. La jugada intermedia sorprende incluso a jugadores fuertes.",
      como: "El tablero te muestra la captura natural, la que recupera material. Pero hay una jugada mejor ANTES (comprobado con el motor: la segunda mejor queda un peón y medio o más atrás). Encuéntrala y juégala. Si recapturas, ves por qué no era lo mejor.",
      clase: "Pon la posición y pregunta primero «¿qué recapturan?». Después, con «Preguntar», cada alumno busca la jugada intermedia en su tablero.",
      niveles: [
        { n: 1, titulo: "Primeros pasos", desc: "Ejercicios de partidas reales hasta 1500 de rating." },
        { n: 2, titulo: "Más escondida", desc: "De 1500 a 1900: la intermedia ya no siempre es jaque." },
        { n: 3, titulo: "De maestro", desc: "Más de 1900: líneas largas." },
      ],
    },
    {
      id: "sobrecargado", emoji: "🏋️", nombre: "El defensor sobrecargado",
      pregunta: "¿Qué pieza rival cuida dos cosas a la vez?",
      entrena: "Encontrar el punto débil de la defensa: una pieza que cuida dos casillas no puede cumplir con las dos. Primero se ve quién está sobrecargado; después se cobra.",
      como: "Dos pasos. Primero toca (o escribe) la pieza rival que está cuidando dos cosas. Después juega la jugada que la obliga a elegir: si la toma, deja sin cuidar la otra. Se comprueba con la línea de la partida y con el motor.",
      clase: "Pon la posición y pregunta: «¿qué pieza rival está haciendo dos trabajos?». Cuando la encuentren, con «Preguntar» buscan la jugada que la sobrecarga.",
      niveles: [
        { n: 1, titulo: "Cuida una pieza", desc: "El defensor cuida una pieza que se cae." },
        { n: 2, titulo: "Cuida el mate", desc: "El defensor cuida la casilla del mate." },
        { n: 3, titulo: "Más difícil", desc: "Ejercicios de partidas reales de más de 1800 de rating." },
      ],
    },
    {
      id: "peor-pieza", emoji: "🐌", nombre: "La peor pieza",
      pregunta: "Sin táctica a la vista: ¿qué pieza mejorarías?",
      entrena: "El consejo más útil cuando no hay nada que hacer: buscar la pieza peor puesta y llevarla a un lugar mejor. Es pensar en planes, no en golpes.",
      como: "Una posición tranquila de partida real. Primero elige la pieza que conviene mover: el motor analizó la mejor jugada de cada una, y esta le saca medio peón o más a todas las demás. Después muévela: vale cualquier jugada suya casi tan buena como la mejor.",
      clase: "Pon la posición y pregunta qué pieza está peor. Que cada alumno defienda la suya; después muestra lo que dice el motor de cada pieza.",
      niveles: [
        { n: 1, titulo: "Pocas piezas", desc: "Tres piezas o menos para elegir (sin contar rey ni peones)." },
        { n: 2, titulo: "Medio juego", desc: "Cuatro o cinco piezas para elegir." },
        { n: 3, titulo: "Tablero lleno", desc: "Seis piezas o más: hay que mirarlas todas." },
      ],
    },
  ];

  function tipo(id) { return TIPOS.find((t) => t.id === id) || null; }
  function nivel(tipoId, n) {
    const t = tipo(tipoId);
    return t ? t.niveles.find((x) => x.n === +n) || null : null;
  }
  /* Los tipos `propio` (Tus propios errores) no tienen banco en
     entreno/data/tipos.json: sus ejercicios salen de las partidas de cada
     alumno (js/errores-propios.js). */
  /* La clave de avance de un ejercicio: "tipo:id". */
  function clave(tipoId, itemId) { return tipoId + ":" + itemId; }

  const TiposCatalogo = { TIPOS, tipo, nivel, clave };
  if (typeof module !== "undefined" && module.exports) module.exports = TiposCatalogo;
  else raiz.TiposCatalogo = TiposCatalogo;
})(typeof window !== "undefined" ? window : globalThis);
