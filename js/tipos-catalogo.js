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
        { n: 3, titulo: "Golpe táctico", desc: "Horquillas, clavadas, enfiladas y ataques a la descubierta." },
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
      como: "Te dan una posición y una pieza. Colócala en una casilla vacía para lograr lo que se pide: un mate, una horquilla, una clavada o tapar un mate. Vale cualquier casilla que cumpla.",
      clase: "Pon la posición y que cada alumno proponga su casilla: puede haber varias respuestas buenas, y se comprueban juntos en el tablero.",
      niveles: [
        { n: 1, titulo: "Mate ya", desc: "La pieza que pones da jaque mate ahora mismo." },
        { n: 2, titulo: "Horquilla", desc: "Un caballo que ataca dos piezas grandes a la vez y no se lo pueden comer." },
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
  ];

  function tipo(id) { return TIPOS.find((t) => t.id === id) || null; }
  function nivel(tipoId, n) {
    const t = tipo(tipoId);
    return t ? t.niveles.find((x) => x.n === +n) || null : null;
  }
  /* La clave de avance de un ejercicio: "tipo:id". */
  function clave(tipoId, itemId) { return tipoId + ":" + itemId; }

  const TiposCatalogo = { TIPOS, tipo, nivel, clave };
  if (typeof module !== "undefined" && module.exports) module.exports = TiposCatalogo;
  else raiz.TiposCatalogo = TiposCatalogo;
})(typeof window !== "undefined" ? window : globalThis);
