/* Lo que se VE en cada lámina del ejercicio «El tablero mal colocado»
 * (Formación Ajedrez, Sesión 1: «El tablero y el inicio de la partida»).
 *
 * Una entrada por lámina, en el mismo orden que
 * cursos/recursos/formacion-ajedrez/presentaciones/ejercicio-tablero/diapositivas.json.
 * El título grande sale del `titulo` de ese archivo y los tableros, de sus
 * `posiciones` (`pos: n`), como en las demás presentaciones del curso: ver
 * «Las láminas dicen poco» en docs/decisiones/clase-en-vivo.md.
 *
 * El tablero mal colocado se dibuja con los colores de las casillas
 * cambiados (MAL): es lo que se ve cuando el tablero está girado un cuarto de
 * vuelta, con la casilla OSCURA en la esquina derecha de cada jugador. Las
 * piezas quedan en las mismas casillas contando desde cada jugador, y por eso
 * la posición se puede pasar tal cual a un tablero bien colocado (art. 7.2.2).
 *
 * PARTIDA son las jugadas que llevan a la posición del ejercicio:
 * verificar-formacion-ejercicio-tablero.js las juega con chess.js y compara.
 */
const PARTIDA = "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Bb3 Ba7 h3 h6 Nbd2 Re8";
// La planilla, en notación algebraica española (C caballo, A alfil, T torre,
// D dama, R rey), de a dos jugadas por renglón.
const ES = { N: "C", B: "A", R: "T", Q: "D", K: "R" };
const enEspanol = (san) => (ES[san[0]] || san[0]) + san.slice(1);
const jugadas = PARTIDA.split(" ").map(enEspanol);
const PLANILLA = jugadas.filter((_, i) => i % 2 === 0).map((b, i) => [b, jugadas[2 * i + 1] || ""]);

const MAL = { colores: { clara: "#627d98", oscura: "#f0f4f8" } };
const conEstrella = (o) => Object.assign({ estrellas: ["h1"] }, o);

const LAMINAS = [
  // 1
  { tipo: "portada", k: "Formación Ajedrez · Sesión 1 · Ejercicio",
    t: "Tablero mal colocado", s: "¿Y si la casilla oscura queda a la derecha?" },
  // 2
  { tipo: "tableros", k: "Antes de empezar, mira la esquina derecha", items: [
    { pos: 0, opciones: MAL, t: "Mal colocado", tono: "no", marca: "Oscura", s: "La esquina derecha es oscura" },
    { pos: 1, t: "Bien colocado", tono: "si", marca: "Clara", s: "La esquina derecha es clara (h1 y a8)" } ],
    clave: "Regla: clara a la derecha de cada jugador · art. 2.1" },
  // 3
  { tipo: "filas", k: "Tres señales de que el tablero está girado", items: [
    { ic: "🔍", t: "Esquina derecha oscura", s: "h1 y a8 tienen que ser claras" },
    { ic: "pieza:wQ", t: "La dama blanca queda en casilla oscura", s: "y la negra, en una clara" },
    { ic: "🔤", t: "Las letras impresas, de costado", s: "los números quedan donde van las letras" } ],
    clave: "Revisa los tableros antes de la ronda." },
  // 4
  { tipo: "tablero", k: "Ejercicio · van 10 jugadas de cada bando", pos: 0, opciones: conEstrella(MAL), items: [
    { t: "A · Anular y jugar otra partida" },
    { t: "B · Seguir en ese mismo tablero" },
    { t: "C · Pasar la posición a un tablero bien colocado" },
    { t: "D · Seguir solo si van 10 jugadas o más" } ],
    clave: "Un jugador avisa: «la esquina es oscura». ¿Qué decides?" },
  // 5
  { tipo: "tableros", k: "Respuesta: C · la partida sigue · art. 7.2.2", items: [
    { pos: 0, opciones: conEstrella(MAL), t: "Así estaba", tono: "no", marca: "Mal colocado", s: "Esquina derecha oscura" },
    { pos: 1, opciones: conEstrella(), t: "Así sigue", tono: "si", marca: "Bien colocado", s: "Las mismas piezas, en las mismas casillas" } ],
    clave: "Solo cambia el tablero: la posición y los tiempos no." },
  // 6
  { tipo: "traslado", k: "El traslado completo, con la planilla al lado", jugadas: PLANILLA, items: [
    { pos: 0, opciones: conEstrella(MAL), t: "Así se jugó", tono: "no", marca: "Mal colocado", s: "Oscura a la derecha" },
    { pos: 1, opciones: conEstrella(), t: "Así sigue", tono: "si", marca: "Bien colocado", s: "La misma planilla, las mismas casillas" } ],
    clave: "Con 10 jugadas o con 40, la partida sigue: el 7.2.2 no cuenta jugadas." },
  // 7
  { tipo: "filas", k: "Paso a paso, sin tocar la partida", numerar: true, items: [
    { ic: "⏸️", t: "Detén los relojes", s: "los tiempos no se tocan", a: "6.11.1" },
    { ic: "♟️", t: "Arma al lado un tablero bien colocado", s: "clara a la derecha de cada jugador" },
    { ic: "🔁", t: "Pasa pieza por pieza, a la misma casilla", s: "a1 queda a la izquierda de las blancas" },
    { ic: "📝", t: "Comprueba con las planillas" },
    { ic: "▶️", t: "Reanuda el reloj de quien juega", a: "6.11.3" } ] },
  // 8
  { tipo: "tableros", k: "En un tablero girado, esta regla engaña", items: [
    { pos: 0, opciones: MAL, t: "Rey y dama cambiados", tono: "no", marca: "Se anula", s: "La posición inicial ya estaba mal · art. 7.2.1" },
    { pos: 1, t: "Lo correcto", tono: "si", marca: "Dama en d1", s: "Dama en d1 y d8, rey en e1 y e8" } ],
    clave: "Si el rey y la dama están cambiados, no basta con cambiar el tablero." },
  // 9
  { tipo: "tabla", k: "Tres irregularidades que no son lo mismo", cab: ["Qué pasó", "Decisión", "Qué se hace"], filas: [
    ["Solo el tablero girado", "7.2.2", "Sigue", "si", "Se pasa la posición a un tablero bien colocado"],
    ["Posición inicial mal armada", "7.2.1", "Anulada", "no", "Se juega otra partida"],
    ["Colores cambiados, menos de 10 jugadas", "7.3", "Anulada", "no", "Otra partida, con los colores correctos"],
    ["Colores cambiados, 10 jugadas o más", "7.3", "Sigue", "si", "La partida continúa así"] ] },
];

module.exports = LAMINAS;
module.exports.MAL = MAL;
module.exports.PARTIDA = PARTIDA;
module.exports.PLANILLA = PLANILLA;

/*! rev bfb5bbb0d2d82f9f */
