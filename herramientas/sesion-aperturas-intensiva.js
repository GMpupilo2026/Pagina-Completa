/* ===== Sesión intensiva de aperturas: castigar el error de la apertura =====
 *
 * Arma un plan de clase (planes.html y la clase en vivo) con diez posiciones
 * de apertura (jugadas 8 a 15) de partidas reales en las que el rival se
 * equivocó y hay UNA sola jugada que lo castiga: las demás dejan todo parejo
 * o peor. La ventaja que se saca es chica (de un peón a tres), pero el error
 * no vuelve: si no se castiga en esa jugada, se fue.
 *
 * NINGUNA POSICIÓN SE INVENTA: son partidas de «Una clase al día» (leídas
 * jugada a jugada del PDF del MI Ángel Martín), y la nota de cada ejercicio
 * dice cómo se llegó, con la apertura que trae el banco. Se eligieron por lo
 * que dice el motor: de las 35 897 posiciones de las jugadas 6 a 15 de las
 * 1989 partidas, 125 tenían una sola jugada que pasa de +1,2 (con la segunda
 * en +0,4 o menos) y el maestro la encontró; de esas, 46 de partidas con su
 * apertura nombrada, y diez de aperturas distintas.
 *
 * Lo que comparte con las otras sesiones intensivas está en
 * herramientas/lib/sesion-intensiva.js. Lo que se afirma lo comprueba
 * Stockfish con `node herramientas/sesion-intensiva-motor.js aperturas` y lo
 * exige verificar-sesiones-intensivas.js en cada CI.
 *
 * Uso:  npm install
 *       node herramientas/sesion-aperturas-intensiva.js
 * Escribe herramientas/planes/sesion-aperturas-intensiva.json y .sql.
 */
"use strict";
const { crear } = require("./lib/sesion-intensiva");

const EJERCICIOS = [
  {
    banco: "ucdp:ml309-1@18", nombre: "Recuperar el peón aunque caiga el del centro", minutos: 6,
    hasta: 4, unicas: [0],
    trampas: [
      { jugada: 0, san: "f3", refuta: ["d5", "exd5", "Qxd5"], resultado: "tablas" },
      { jugada: 0, san: "Nf5", refuta: ["e6"], resultado: "rival" },
    ],
    explicacion:
      "El negro tiene un peón de más, el de c4, y su alfil de b7 apunta a e4. Si el blanco recupera en c4, " +
      "cae el peón de e4; si defiende e4, el negro juega ...d5 y se libera.\n" +
      "10.Axc4! ÚNICA. Primero el desarrollo: el alfil sale a una buena diagonal y mira a f7. Si 10...Axe4, 11.O-O y " +
      "el rey negro sigue en el centro, con la columna e abierta para la torre y sin ninguna pieza negra del " +
      "flanco de rey en juego: por un peón, el blanco tiene mucho más que un peón. En la partida, 11...d5 " +
      "12.Te1 e5 13.Da4+ Cd7 14.Txe4! dxe4 15.Cf5 y Fischer ganó.\n" +
      "Las trampas: 10.f3? defiende e4 pero llega tarde: 10...d5 11.exd5 Dxd5 y el negro termina de " +
      "desarrollarse; no queda nada. 10.Cf5? e6 y el caballo se tiene que ir: el negro queda mejor.\n" +
      "La lección: con el rey rival en el centro, un peón vale menos que dos tiempos de desarrollo.",
  },
  {
    banco: "ucdp:ml354-5@16", nombre: "El sacrificio en e6, en el orden justo", minutos: 7,
    hasta: 4, unicas: [0, 2],
    trampas: [
      { jugada: 0, san: "Bh4", refuta: ["Qb6"], resultado: "tablas" },
      { jugada: 0, san: "Nxe6", refuta: ["fxe6", "Bxe6", "Nc5"], resultado: "pierde" },
      { jugada: 2, san: "Qe2", refuta: ["Ne5"], resultado: "pierde" },
    ],
    explicacion:
      "Najdorf con 6.Ag5 Cbd7 7.Ac4: el alfil de c4 y el caballo de d4 apuntan a e6, y el negro todavía no " +
      "se enrocó.\n" +
      "9.Axe6! ÚNICA. Si el negro no toma (9...O-O), 10.Ab3 y el blanco se quedó con un peón y la mejor " +
      "posición. Si toma, 9...fxe6 10.Cxe6! ÚNICA: el caballo ataca a la dama y al peón de g7 a la vez. " +
      "10...Da5 (sale atacando al alfil de g5) 11.Cxg7+ Rf7 y el blanco tiene tres peones por la pieza y el " +
      "rey negro sin refugio. Así siguió la partida, y la ganó el blanco.\n" +
      "Las trampas: 9.Ah4? Db6 y el negro se defiende: no queda ventaja. 9.Cxe6?, el mismo sacrificio en el " +
      "otro orden, pierde: 9...fxe6 10.Axe6 Cc5 y el que llegó a e6 es el alfil, que no ataca a la dama ni a " +
      "g7: el negro sale con una pieza de más. Y después de 9...fxe6, 10.De2? Ce5 y el blanco dio el alfil " +
      "por nada.\n" +
      "La lección: en un sacrificio de dos jugadas, el orden decide; la pieza que llega última tiene que " +
      "llegar con amenaza.",
  },
  {
    banco: "ucdp:ml342-4@15", nombre: "La clavada que salva la pieza", minutos: 5,
    hasta: 4, unicas: [0],
    trampas: [
      { jugada: 0, san: "Nd8", refuta: ["O-O"], resultado: "pierde" },
      { jugada: 0, san: "Nce7", refuta: ["O-O"], resultado: "pierde" },
    ],
    explicacion:
      "Gambito Goering: el material está igualado, pero el blanco tiene todo desarrollado y su peón de d5 " +
      "ataca al caballo de c6. Retirarlo es lo natural, y es lo que pierde.\n" +
      "8...Ab4! ÚNICA. El alfil ataca a la dama de c3, y la dama no se puede ir: está clavada contra su rey " +
      "de e1. Solo puede comerse el alfil (9.Dxb4 Cxb4 y el negro ganó la dama por el alfil) o meterse en " +
      "d2, donde el alfil la toma con jaque. Lo mejor que tiene el blanco es 9.dxc6 Axc3+ 10.Cxc3: el negro " +
      "dio el alfil y el caballo por la dama, y queda mejor.\n" +
      "Las trampas: 8...Cd8? y 8...Cce7?, las retiradas naturales: 9.O-O y el rey negro sigue en el centro, " +
      "con la columna e por abrirse y la dama de d7 tapando a sus propias piezas. El motor le da más de tres " +
      "peones al blanco.\n" +
      "En la partida siguió 10...bxc6 y aun así ganó Marshall: la ventaja también hay que cobrarla.\n" +
      "La lección: antes de retirar una pieza atacada, mira si puedes clavar una pieza grande del rival.",
  },
  {
    banco: "ucdp:ml295-1@26", nombre: "La dama atacada: comerse al que ataca", minutos: 6,
    hasta: 3, unicas: [0, 2],
    trampas: [
      { jugada: 0, san: "Bxc7", refuta: ["Bxd5"], resultado: "pierde" },
    ],
    explicacion:
      "Escandinava: la dama blanca de d5 está atacada por el alfil de e6, y lo primero es verlo. Hay jugadas " +
      "de dama que la salvan (14.Dh5, 14.De4) y dejan todo parejo. Hay una que la salva y gana.\n" +
      "14.Txe6! ÚNICA. La torre se come al que ataca a la dama. 14...fxe6 15.Dxe6! ÚNICA: la dama vuelve a " +
      "e6, el rey negro se quedó sin enroque y en la columna abierta, y todas las piezas blancas están listas " +
      "para entrar (Axc7, Ce5). Por la calidad, el blanco tiene un peón y el ataque. En la partida, 15...Tf8 " +
      "16.Axc7 y ganó el blanco.\n" +
      "La trampa: 14.Axc7?, lanzarse al ataque sin mirar a la dama: 14...Axd5 y el blanco perdió la dama.\n" +
      "La lección: antes de atacar, revisa qué te están atacando a ti. A veces la mejor defensa es comerse " +
      "al atacante.",
  },
  {
    banco: "ucdp:ml222-6@16", nombre: "Desclavar enrocando", minutos: 6,
    hasta: 5, unicas: [0],
    trampas: [
      { jugada: 0, san: "Be3", refuta: ["Qxe6"], resultado: "pierde" },
      { jugada: 0, san: "d5", refuta: ["cxd5", "O-O", "fxe6"], resultado: "pierde" },
    ],
    explicacion:
      "La sexta partida de Deep Blue contra Kasparov (1997). Con 8.Cxe6 el blanco ya sacrificó: el caballo " +
      "está en e6, atacado por el peón de f7 y clavado contra su rey por la dama de e7. No se puede ir de " +
      "ahí: dejaría al rey en jaque.\n" +
      "9.O-O! ÚNICA. El enroque saca al rey de la columna e: el caballo deja de estar clavado y amenaza " +
      "Cc7+ y Cxg7+. Si 9...fxe6, 10.Ag6+ Rd8 y el rey negro se queda en el centro, sin enroque, con el " +
      "alfil de c8 y la torre de a8 encerrados. Por la pieza, el blanco tiene un peón y un ataque que dura: " +
      "11.Af4 y la torre a e1. La partida terminó en la jugada 19.\n" +
      "Las trampas: 9.Ae3? Dxe6 y el caballo cayó: una pieza menos por un peón. 9.d5? cxd5 10.O-O fxe6: con " +
      "el centro negro de peones, ya no hay ataque.\n" +
      "La lección: una pieza clavada se libera sacando lo que está detrás.",
  },
  {
    banco: "ucdp:ml284-2@28", nombre: "Clavar y no soltar", minutos: 8,
    hasta: 5, unicas: [0, 2, 4],
    trampas: [
      { jugada: 0, san: "Bxg6", refuta: ["fxg6", "Qxg6+", "Kh8"], resultado: "tablas" },
      { jugada: 0, san: "O-O-O", refuta: ["Nd5"], resultado: "pierde" },
      { jugada: 2, san: "Qxd8", refuta: ["Raxd8"], resultado: "pierde" },
      { jugada: 4, san: "Nxg5", refuta: ["Bxh5"], resultado: "pierde" },
    ],
    explicacion:
      "Partida por correspondencia. El blanco ya sacrificó un alfil en h6: tiene dos peones por la pieza y " +
      "el rey negro sin peones delante. El alfil de g6 tapa la columna g, y está clavado: si se mueve, la " +
      "dama de g5 da jaque al rey de g8.\n" +
      "15.h5! ÚNICA. El peón ataca a la pieza clavada. La defensa es 15...Cxh5: el caballo se come el peón " +
      "y, al irse de f6, la dama de d8 ataca a la de g5. 16.Txh5! ÚNICA: la torre se come el caballo y " +
      "defiende la dama. 16...Dxg5 17.Txg5! ÚNICA y la clavada sigue, ahora con la torre: el alfil de g6 " +
      "cae. En la partida, 17...Rg7 18.Axg6 fxg6 y el blanco quedó con un peón de más en el final.\n" +
      "Las trampas: 15.Axg6? fxg6 16.Dxg6+ Rh8 y no hay más que jaques: no queda ventaja. 15.O-O-O? Cd5 y " +
      "el negro consolida: la ventaja pasa a él. 16.Dxd8? Taxd8: sin damas y sin clavada, el blanco tiene " +
      "una pieza menos por un peón. 17.Cxg5? Axh5 y el alfil se escapó comiéndose la torre.\n" +
      "La lección: una pieza clavada no se escapa; atácala con lo más chico que tengas y no sueltes la " +
      "clavada.",
  },
  {
    banco: "ucdp:ml215-6@20", nombre: "Abrir la columna del rey sin enrocar", minutos: 6,
    hasta: 3, unicas: [0],
    trampas: [
      { jugada: 0, san: "Nxd4", refuta: ["Qb6", "Nxc6", "Qxc6"], resultado: "tablas" },
      { jugada: 0, san: "Rxd4", refuta: ["Nxd4"], resultado: "pierde" },
    ],
    explicacion:
      "Gambito de Dama Aceptado. El negro jugó 9...cxd4 y 10...Ab7 sin enrocarse: su rey sigue en e8. ¿Cómo " +
      "se recupera el peón de d4?\n" +
      "11.exd4! ÚNICA. Con el peón, no con una pieza: se abre la columna e para la dama de e2, contra el rey " +
      "negro, y el peón queda listo para d5, que abre todavía más. Si 11...Ca5, 12.d5 y la ruptura llega " +
      "igual. En la partida, 11...Cb4 12.d5 Cbxd5 13.Ag5: el blanco dio el peón para abrir líneas y Spassky " +
      "ganó en la jugada 21.\n" +
      "Las trampas: 11.Cxd4? Db6 12.Cxc6 Dxc6 y el negro termina de desarrollarse: no queda nada. 11.Txd4? " +
      "Cxd4 y la torre se perdió por el caballo.\n" +
      "La lección: contra el rey en el centro, recaptura de manera que se abran las columnas.",
  },
  {
    banco: "ucdp:ml209-2@28", nombre: "Elegir la recaptura: el centro y la columna", minutos: 5,
    hasta: 3, unicas: [0],
    trampas: [
      { jugada: 0, san: "Qc2", refuta: ["cxb3", "axb3"], resultado: "tablas" },
    ],
    explicacion:
      "Catalana. El negro rompió con ...b5 y 14...bxc4: hay que recapturar, y la dama no puede (el peón de d4 " +
      "le tapa la fila).\n" +
      "15.bxc4! ÚNICA. El peón de b3 va a c4: el blanco se queda con los dos peones del centro, c4 y d4, " +
      "contra c6 y e6, y con la columna b abierta para sus torres, que apuntan al alfil de b7. En la partida, 15...Da5 16.Dc2 Aa8 17.c5 y el blanco ganó.\n" +
      "La trampa: 15.Dc2? cxb3 16.axb3 y el negro se sacó de encima su peón débil: la estructura queda " +
      "pareja y la ventaja se fue.\n" +
      "La lección: entre dos recapturas, elige la que deja tus peones en el centro y te abre una columna.",
  },
  {
    banco: "ucdp:ml215-4@22", nombre: "La pieza que comió lejos de su casa", minutos: 6,
    hasta: 4, unicas: [0],
    trampas: [
      { jugada: 0, san: "Bxc6", refuta: ["bxc6"], resultado: "escapa" },
      { jugada: 0, san: "Bc5", refuta: ["Re8"], resultado: "escapa" },
    ],
    explicacion:
      "India de Rey con g3. El negro acaba de comerse el peón de c4 con el alfil (11...Axc4). El material " +
      "está igualado, pero el alfil de c4 está lejos de su casa.\n" +
      "12.b3! ÚNICA. Lo ataca, y el alfil no tiene una buena casilla. Si 12...Ae6, 13.Cxe6 fxe6: el blanco " +
      "se queda con los dos alfiles y el negro con un peón doblado en e6. Si 12...h6, para echar al caballo, " +
      "13.bxc4 hxg5 14.Axg5 y el blanco ganó un peón. En la partida, 12...Ae6 13.Cxe6 fxe6 14.Axc6 bxc6 " +
      "15.Dxd8: el blanco cambió todo para dejarle al negro sus peones rotos, y Marín ganó el final.\n" +
      "Las trampas: 12.Axc6? bxc6 y el blanco dio su mejor alfil sin ganar nada: la ventaja se le va. " +
      "12.Ac5? ataca la torre, pero 12...Te8 y el tiempo que el blanco usó ahí, el negro lo usa para salvar " +
      "su alfil.\n" +
      "La lección: cuando una pieza rival come lejos de su casa, búscale las casillas antes de hacer otra " +
      "cosa.",
  },
  {
    banco: "ucdp:ml323-5@23", nombre: "Cambiar primero al que defiende", minutos: 6,
    hasta: 3, unicas: [0],
    trampas: [
      { jugada: 0, san: "Nxe4", refuta: ["Nxe4"], resultado: "pierde" },
      { jugada: 0, san: "Bxf3", refuta: ["gxf3", "Nxc3", "bxc3"], resultado: "tablas" },
    ],
    explicacion:
      "«La partida del siglo»: Fischer tenía 13 años. El blanco movió la dama cuatro veces (Db3, Dxc4, Dc5 " +
      "y Da3) y su rey sigue en e1. El caballo negro de a4 ataca al de c3, y el de c3 es el que defiende el " +
      "peón de e4.\n" +
      "12...Cxc3! ÚNICA. Primero se cambia al defensor. 13.bxc3 Cxe4 y el peón cae; el caballo ataca c3 y " +
      "la columna e se abre contra el rey blanco. En la partida siguió 14.Axe7 Db6 15.Ac4 Cxc3 16.Ac5 " +
      "Tfe8+ 17.Rf1 y llegó 17...Ae6!!, el famoso sacrificio de dama.\n" +
      "Las trampas: 12...Cxe4?, comer en el orden equivocado: 13.Cxe4 y el defensor se come al que entró. " +
      "El negro dio una pieza por un peón. 12...Axf3? 13.gxf3 Cxc3 14.bxc3: el negro cambió su alfil y el " +
      "peón de e4 ya no cae; no queda nada.\n" +
      "La lección: si lo que quieres comer está defendido, mira si puedes cambiar primero al que lo " +
      "defiende.",
  },
];

module.exports = crear({
  slug: "aperturas",
  titulo: "Aperturas · Sesión intensiva: castigar el error de la apertura",
  notas: "Sesión intensiva de aperturas: diez posiciones de partidas reales (Fischer, Spassky, Kasparov, " +
         "Marshall…) en las que el rival se equivocó en la apertura y hay una sola jugada que lo castiga. " +
         "Cada ejercicio trae la chuleta (línea, jugadas únicas y trampas) y la nota con cómo se llegó y el " +
         "cálculo explicado. Todo comprobado con Stockfish 16.",
  umbral: { gana: 100, noGana: 50 },
  resultados: { tablas: "no saca ventaja", escapa: "se le va la ventaja", rival: "el rival queda mejor",
                pierde: "pierde" },
  conOrigen: true,
  conLlegada: true,
  consigna: (ej, a) => (a.fen.split(" ")[1] === "w" ? "Juegan blancas" : "Juegan negras") +
    " y castigan el error. ③ " + ej.minutos + " min en papel: la jugada, la respuesta del rival y por qué las " +
    "otras no sirven.",
  intro:
    "Diez posiciones de apertura de partidas reales, de la colección «Una clase al día». En todas, el rival " +
    "acaba de equivocarse y hay una sola jugada que lo castiga: las demás dejan todo parejo, o peor. La " +
    "ventaja que se saca es chica, de uno a tres peones, pero el error no vuelve: si no se castiga en esa " +
    "jugada, se fue. Cada afirmación de las notas (cuál es la única, qué jugada no sirve) está comprobada " +
    "con Stockfish 16.\n" +
    "Cada ejercicio, unos 10-12 minutos:\n" +
    "1. Primero, cómo se llegó: lee en voz alta las jugadas de la apertura (están al principio de la nota " +
    "«El cálculo») y pregunta qué hizo mal el rival. Después, la posición al tablero. Nadie mueve piezas.\n" +
    "2. Cálculo en silencio y en papel: la jugada, la mejor respuesta del rival y por qué las otras " +
    "candidatas no sirven. Que cada uno anote antes lo que está atacado, lo que está clavado y dónde está " +
    "cada rey: casi todos los errores de apertura son eso.\n" +
    "3. En voz alta: dos o tres leen su línea. Tú haces de rival, sobre todo contra la jugada tentadora " +
    "(está en el renglón, en «Trampa»).\n" +
    "4. La explicación: la nota «El cálculo», con la idea de cada jugada y lo que pasó en la partida.\n" +
    "5. Práctica: cada uno juega la posición contra ti o contra el motor, hasta cobrar la ventaja.\n" +
    "Las cinco primeras son aperturas de 1.e4, las cinco últimas de 1.d4 y 1.c4. La regla de la sesión: " +
    "antes de jugar en la apertura, pregúntate qué dejó de cuidar la última jugada del rival.",
  cierre:
    "Lo que tiene que quedar, en una frase por ejercicio:\n" +
    "1. Con el rey rival en el centro, un peón vale menos que dos tiempos de desarrollo.\n" +
    "2. En un sacrificio de dos jugadas, el orden decide.\n" +
    "3. Antes de retirar una pieza atacada, busca una clavada.\n" +
    "4. Antes de atacar, mira qué te están atacando a ti.\n" +
    "5. Una pieza clavada se libera sacando lo que está detrás.\n" +
    "6. Una pieza clavada no se escapa: atácala y no sueltes la clavada.\n" +
    "7. Contra el rey en el centro, recaptura abriendo columnas.\n" +
    "8. Entre dos recapturas, la que deja peones en el centro y abre una columna.\n" +
    "9. A la pieza que comió lejos de su casa, búscale las casillas.\n" +
    "10. Si lo que quieres comer está defendido, cambia primero al defensor.\n" +
    "Para la casa: en Entrenamiento, Aperturas y «Mi repertorio», revisar las líneas propias de estas " +
    "aperturas buscando el mismo tipo de error: el rey en el centro, una pieza clavada, un defensor que se " +
    "puede cambiar.",
  ejercicios: EJERCICIOS,
});

if (require.main === module) module.exports.escribir();
