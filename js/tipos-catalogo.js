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
