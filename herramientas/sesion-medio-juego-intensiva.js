/* ===== Sesión intensiva de medio juego: atacar, defender y convertir =====
 *
 * Arma un plan de clase (planes.html y la clase en vivo) con diez posiciones
 * de medio juego (jugadas 16 a 30, con las damas en el tablero) de partidas
 * reales en las que hay UNA sola jugada que saca o conserva la ventaja: las
 * demás dejan todo parejo o peor. Van del ataque al rey (sacrificios en h7 y
 * g7, la torre por la tercera fila) a la defensa con contraataque y a la
 * conversión (simplificar cuando se gana).
 *
 * NINGUNA POSICIÓN SE INVENTA: son partidas de «Una clase al día» (leídas
 * jugada a jugada del PDF del MI Ángel Martín), de los bloques de ataque al
 * rey, enroques opuestos, centro, columnas y sacrificios posicionales. Se
 * eligieron por lo que dice el motor: de unas 24 000 posiciones de las
 * jugadas 16 a 30 con las damas en el tablero y material parejo, 288 tenían
 * una sola jugada que pasa de +1,2 (con la segunda en +0,4 o menos) y el
 * maestro la encontró; de esas se descartaron las recapturas obligadas (no
 * enseñan nada) y se eligieron diez de ideas distintas.
 *
 * Lo que comparte con las otras sesiones intensivas está en
 * herramientas/lib/sesion-intensiva.js. Lo que se afirma lo comprueba
 * Stockfish con `node herramientas/sesion-intensiva-motor.js medio-juego` y
 * lo exige verificar-sesiones-intensivas.js en cada CI.
 *
 * Uso:  npm install
 *       node herramientas/sesion-medio-juego-intensiva.js
 * Escribe herramientas/planes/sesion-medio-juego-intensiva.json y .sql.
 */
"use strict";
const { crear } = require("./lib/sesion-intensiva");

const EJERCICIOS = [
  {
    banco: "ucdp:ml077-4@30", nombre: "El sacrificio en h7 y en g6", minutos: 7,
    hasta: 5, unicas: [0, 2, 4],
    trampas: [
      { jugada: 0, san: "Rxg7+", refuta: ["Nxg7"], resultado: "pierde" },
      { jugada: 0, san: "Be4", refuta: ["Bxe4"], resultado: "pierde" },
      { jugada: 4, san: "Rxg6", refuta: ["Rf6"], resultado: "pierde" },
    ],
    explicacion:
      "Material igualado, pero el blanco tiene todo apuntando al enroque: el alfil de d3 y la dama de c2 en la " +
      "diagonal b1-h7, el alfil de h6 contra g7 y la torre de g3. El caballo negro de h5 ataca a esa torre: no " +
      "hay tiempo que perder.\n" +
      "16.Ah7+! ÚNICA Rh8 (es la única) 17.Cg6+! ÚNICA: el caballo da jaque y " +
      "el peón de f7 lo tiene que tomar. 17...fxg6 18.Dxg6! ÚNICA: la dama entra por la columna que se abrió, " +
      "con los dos alfiles junto al rey negro. En la partida, 18...gxh6 19.Dxh6 y ganó el blanco.\n" +
      "Las trampas: 16.Txg7+?, el sacrificio equivocado: 16...Cxg7 y al blanco le falta una pieza para el " +
      "mate. 16.Ae4? Axe4 y el ataque se acabó: el caballo de h5 se come la torre. Y en la última, 18.Txg6? " +
      "Tf6: la torre tapa y el negro queda con una pieza de más.\n" +
      "La lección: en un ataque, los jaques primero; cada uno abre una línea para la pieza siguiente.",
  },
  {
    banco: "ucdp:ml131-4@44", nombre: "Romper el enroque y tapar la defensa", minutos: 7,
    hasta: 5, unicas: [0, 2, 4],
    trampas: [
      { jugada: 0, san: "Be4", refuta: ["dxe4"], resultado: "pierde" },
      { jugada: 2, san: "Be4", refuta: ["dxe4"], resultado: "pierde" },
      { jugada: 4, san: "Rad1", refuta: ["Ne8"], resultado: "tablas" },
    ],
    explicacion:
      "Ataque Indio de Rey, con blancas: el peón de e5, el alfil de f6 y la dama de g5 contra el rey " +
      "de h8. El blanco tiene un peón menos, y si espera, el negro cambia piezas.\n" +
      "23.Axg7+! ÚNICA Cxg7 24.Cf6! ÚNICA: el caballo se planta en f6, ataca a la dama de e8 y deja a la dama " +
      "blanca lista para h6. 24...Dd8 25.Dh6! ÚNICA y la amenaza es Dxh7 mate. El negro tiene que dar la dama " +
      "por el caballo: 25...Dxf6 26.Dxf6, y así siguió la partida, que ganó el blanco.\n" +
      "Las trampas: 23.Ae4? (y 24.Ae4?, la misma idea un paso después), meter otra pieza al ataque: dxe4 y " +
      "el negro tiene una pieza de más. Al final, 25.Tad1? Ce8 y el caballo negro echa al de f6: no queda " +
      "ventaja.\n" +
      "La lección: después de romper el enroque, la pieza que tapa la defensa vale tanto como la que ataca.",
  },
  {
    banco: "ucdp:ml109-3@52", nombre: "La torre que cambia de fila", minutos: 6,
    hasta: 5, unicas: [0],
    trampas: [
      { jugada: 0, san: "Rh4", refuta: ["Nf8"], resultado: "rival" },
      { jugada: 0, san: "Be3", refuta: ["Rc2"], resultado: "rival" },
    ],
    explicacion:
      "Tal contra Andersson. El peón de f6 y la dama de h6 amenazan Dg7 mate, y solo la torre de g8 lo para. " +
      "Pero el caballo de d7 ataca al alfil de b6, y si el blanco lo retira, el negro respira.\n" +
      "27.Td4! ÚNICA. La torre de g4 se pasa a la columna d y ataca a la dama, que es la que sostiene todo el " +
      "juego negro. Lo mejor del negro es dar la dama: 27...Cxb6 28.Txd5 Cxd5 (torre y alfil por la dama) y " +
      "29.Tf3: la otra torre va a h3, contra h7, con el mate en g7 siempre ahí. Así siguió la partida, y Tal " +
      "ganó.\n" +
      "Las trampas: 27.Th4?, la torre a la columna h, parece más fuerte: 27...Cf8 y la defensa aguanta; el " +
      "negro queda mejor. 27.Ae3?, salvar el alfil: 27...Tc2 y el negro tomó la iniciativa.\n" +
      "La lección: en el ataque, no salves la pieza atacada si puedes atacar algo más grande.",
  },
  {
    banco: "ucdp:ml222-4@42", nombre: "El peón que ataca a la pieza clavada", minutos: 5,
    hasta: 4, unicas: [0],
    trampas: [
      { jugada: 0, san: "Nd5", refuta: ["g5"], resultado: "tablas" },
      { jugada: 0, san: "Nxb5", refuta: ["axb5"], resultado: "tablas" },
    ],
    explicacion:
      "El rey negro está en e6, en el medio del tablero. El caballo de f6 lo cubre, pero está clavado: el " +
      "alfil de h4 lo ata a la dama de d8.\n" +
      "22.e5! ÚNICA. El peón ataca a la pieza clavada. Si el negro rompe la clavada con 22...g5, 23.exf6+ (el " +
      "jaque es de la dama de e2, por la columna que se abrió) Rxf6 y el blanco ganó una pieza por un peón. " +
      "Así siguió la partida, y la ganó el blanco.\n" +
      "Las trampas: 22.Cd5?, otra pieza contra f6: 22...g5 y el negro se suelta a tiempo. 22.Cxb5?, " +
      "sacrificar primero: 22...axb5 y aunque después llegue e5, el blanco ya dio el caballo: queda parejo.\n" +
      "La lección: contra una pieza clavada, ataca con lo más chico que tengas.",
  },
  {
    banco: "ucdp:ml292-2@48", nombre: "La jugada tranquila que lo defiende todo", minutos: 6,
    hasta: 3, unicas: [0],
    trampas: [
      { jugada: 0, san: "Qf4", refuta: ["Qxa1"], resultado: "tablas" },
      { jugada: 0, san: "Rd1", refuta: ["Qxb3"], resultado: "tablas" },
    ],
    explicacion:
      "La dama negra de c3 ataca dos cosas: el alfil de b3 y la torre de a1. El blanco, a cambio, tiene el " +
      "alfil en f6 y la dama cerca: si la dama llega a h6, es mate en g7.\n" +
      "25.Tb1! ÚNICA. Una jugada tranquila que hace dos cosas: la torre sale del ataque y defiende el alfil. " +
      "Ahora el negro no tiene nada que comer, y la amenaza blanca de llevar la dama a h6 sigue. En la " +
      "partida, 25...e5 26.Axe5 y ganó el blanco.\n" +
      "Las trampas: 25.Df4?, ir directo al ataque: 25...Dxa1 y el negro se come la torre y tiene jaques de " +
      "sobra: tablas. 25.Td1? Dxb3 y el blanco perdió el alfil: queda parejo.\n" +
      "La lección: antes de atacar, cierra la puerta de atrás; una jugada tranquila puede valer más que un " +
      "jaque.",
  },
  {
    banco: "ucdp:ml323-1@42", nombre: "Salvar la dama sin soltar el ataque", minutos: 6,
    hasta: 3, unicas: [0, 2],
    trampas: [
      { jugada: 0, san: "Qxg5+", refuta: ["Bxg5", "Bxg5", "dxc3"], resultado: "tablas" },
      { jugada: 0, san: "Qe2", refuta: ["dxc3"], resultado: "rival" },
      { jugada: 2, san: "bxc3", refuta: ["Qd6"], resultado: "rival" },
    ],
    explicacion:
      "El peón de d4 ataca a la vez a la dama de e3 y al caballo de c3. El blanco tiene un peón de más, el " +
      "de h7, metido junto al rey negro.\n" +
      "22.De1! ÚNICA. La dama se va del ataque sin cambiar nada y sin dejar de mirar el flanco de rey: desde " +
      "e1 llega a h4 y a g3. El caballo de c3 se pierde, pero 22...dxc3 23.Axc3! ÚNICA y el alfil recaptura " +
      "clavando al alfil de f6 contra el rey de g7, con la torre de f1 detrás. En la partida, 23...Db6+ " +
      "24.Rh1 Ad4 25.Dh4 y ganó el blanco.\n" +
      "Las trampas: 22.Dxg5+?, dar la dama por el caballo y el alfil: 22...Axg5 23.Axg5 dxc3 y no queda nada. " +
      "22.De2? dxc3 y el negro queda mejor. Y 23.bxc3?, recapturar con el peón: 23...Dd6 y sin la clavada el " +
      "negro queda mejor.\n" +
      "La lección: cuando te atacan la dama, busca la casilla que la saca del ataque y la deja en el tuyo.",
  },
  {
    banco: "ucdp:ml144-2@48", nombre: "La jugada intermedia contra la dama", minutos: 6,
    hasta: 4, unicas: [0, 2],
    trampas: [
      { jugada: 0, san: "Bxe6", refuta: ["Bxf5"], resultado: "tablas" },
      { jugada: 0, san: "Qxh5", refuta: ["Nf6"], resultado: "pierde" },
      { jugada: 2, san: "Bxe6", refuta: ["Qc6"], resultado: "tablas" },
    ],
    explicacion:
      "Short contra Beliavsky. La dama blanca de f5 está atacada por el alfil de e4, y el alfil de f4 por el " +
      "peón de e5. Retirar la dama deja caer el alfil.\n" +
      "25.Txd7! ÚNICA. Una jugada intermedia: la torre se come el caballo y ataca a la dama de b7. Si " +
      "25...Axf5, 26.Txb7! ÚNICA y el blanco recuperó la dama. Después de 26...exf4 27.Txf7, como en la " +
      "partida, la torre está en séptima y el blanco ganó.\n" +
      "Las trampas: 25.Axe6? Axf5: después de los cambios, queda parejo. " +
      "25.Dxh5?, salvar la dama comiéndose un peón: 25...Cf6 y el alfil de f4 cae; el negro queda mejor. Y " +
      "26.Axe6?, comerse la torre antes que la dama: 26...Dc6 y no queda nada.\n" +
      "La lección: cuando te atacan una pieza, mira si puedes atacar tú algo más grande antes de salvarla.",
  },
  {
    banco: "ucdp:ml085-5@31", nombre: "Enroques opuestos: contraatacar con tiempo", minutos: 6,
    hasta: 3, unicas: [0],
    trampas: [
      { jugada: 0, san: "a4", refuta: ["fxe6", "fxe6"], resultado: "pierde" },
      { jugada: 0, san: "Bxb3", refuta: ["cxb3"], resultado: "tablas" },
    ],
    explicacion:
      "Enroques opuestos: el blanco avanza sus peones contra el rey negro (f5 ya ataca al alfil de e6) y el " +
      "negro, los suyos contra el rey de c1. Gana el que llega primero, y cada tiempo cuenta.\n" +
      "16...Cc5! ÚNICA. El caballo ataca a la dama de d3 y deja que le coman el alfil: si 17.fxe6, 17...Cxd3+ " +
      "y el negro se come la dama con jaque. La dama se tiene que ir, 17.Df3, y entonces 17...a4: el ataque " +
      "negro por la columna a llega primero. Así siguió la partida, que ganó Geller.\n" +
      "Las trampas: 16...a4?, el avance de peón sin preparar: 17.fxe6 fxe6 y el negro perdió el tiempo que " +
      "necesitaba; queda peor. 16...Axb3? 17.cxb3: el negro cambia el alfil que estaba atacado, pero abre poco " +
      "y no queda nada.\n" +
      "La lección: en un ataque de enroques opuestos, cada jugada tiene que amenazar algo.",
  },
  {
    banco: "ucdp:ml276-3@51", nombre: "La dama que rompe el refugio", minutos: 7,
    hasta: 4, unicas: [0, 2],
    trampas: [
      { jugada: 0, san: "Qh5", refuta: ["Qxe4"], resultado: "pierde" },
      { jugada: 0, san: "Nxf2+", refuta: ["Rxf2"], resultado: "pierde" },
      { jugada: 2, san: "Qxg4", refuta: ["R2d5"], resultado: "tablas" },
    ],
    explicacion:
      "Juegan las negras, y tienen la dama de h4 y el caballo de g4 atacados por los peones de g3 y h3. " +
      "Retirar uno deja caer el otro.\n" +
      "26...Dxg3! ÚNICA. La dama se come el peón que la atacaba y rompe el refugio del rey blanco. Si " +
      "27.fxg3, 27...Txf1+ 28.Rg2 Cxe3+ y el caballo se lleva la dama de c2. En la partida, 27.hxg4 Dh4+! " +
      "ÚNICA 28.Rg1 Dxg4+ y la torre de f5 se suma al ataque por la columna g. Ganó el negro.\n" +
      "Las trampas: 26...Dh5?, salvar la dama: 27.Dxe4 y el blanco se comió el peón de e4 y sigue con todo; " +
      "el negro pierde. 26...Cxf2+? 27.Txf2: el caballo se dio por un peón y no hay ataque. Y 27...Dxg4?, " +
      "comer sin jaque: 28.T2d5 y todo termina en un jaque perpetuo: tablas.\n" +
      "La lección: si te atacan dos piezas a la vez, busca la jugada que las saca con más fuerza.",
  },
  {
    banco: "ucdp:ml213-3@54", nombre: "Simplificar cuando se gana", minutos: 7,
    hasta: 5, unicas: [0, 2, 4],
    trampas: [
      { jugada: 0, san: "Ne3", refuta: ["Qe5"], resultado: "tablas" },
      { jugada: 0, san: "Ba2", refuta: ["Qc5"], resultado: "tablas" },
      { jugada: 2, san: "Ba2", refuta: ["Qc5"], resultado: "pierde" },
    ],
    explicacion:
      "El blanco tiene un peón menos pero un peón pasado en b6. El caballo negro de d4 está sostenido por la " +
      "dama de d5, y el alfil de g7 es el mejor defensor del rey.\n" +
      "28.Txg7+! ÚNICA Rxg7 29.Ce3! ÚNICA: el caballo ataca a la dama y al peón de f5. 29...De5 (la dama " +
      "sigue cuidando al caballo de d4) 30.Dxd4! ÚNICA Dxd4 31.Cxf5+ y el caballo da jaque al rey de g7 y " +
      "ataca a la dama: 31...Rf6 32.Cxd4. Así siguió la partida: el blanco cambió todo y se quedó con un " +
      "final ganado, que ganó.\n" +
      "Las trampas: 28.Ce3? De5 (sin el sacrificio, el rey no está en g7 y no hay doble) y 28.Aa2? Dc5: no " +
      "queda nada. Y 29.Aa2? Dc5: después de dar la torre, no seguir con el caballo pierde.\n" +
      "La lección: cuando la ventaja es tuya, cambiar bien vale más que atacar; lleva al rey a la casilla " +
      "donde cae el doble.",
  },
];

module.exports = crear({
  slug: "medio-juego",
  titulo: "Medio juego · Sesión intensiva: atacar, defender y convertir",
  notas: "Sesión intensiva de medio juego: diez posiciones de partidas reales (Tal, Short, Geller…) con las " +
         "damas en el tablero, en las que una sola jugada saca o conserva la ventaja: sacrificios contra el " +
         "enroque, jugadas intermedias, defensas con contraataque y simplificaciones. Cada ejercicio trae la " +
         "chuleta (línea, jugadas únicas y trampas) y la nota con el cálculo explicado. Todo comprobado con " +
         "Stockfish 16.",
  umbral: { gana: 100, noGana: 50 },
  resultados: { tablas: "no saca ventaja", escapa: "se le va la ventaja", rival: "el rival queda mejor",
                pierde: "pierde" },
  conOrigen: true,
  consigna: (ej, a) => (a.fen.split(" ")[1] === "w" ? "Juegan blancas" : "Juegan negras") +
    " y sacan ventaja. ③ " + ej.minutos + " min en papel: la jugada, la mejor respuesta y por qué las otras " +
    "candidatas no sirven.",
  intro:
    "Diez posiciones de medio juego de partidas reales, de la colección «Una clase al día», todas con las " +
    "damas en el tablero. En cada una hay una sola jugada que saca o conserva la ventaja: las demás dejan " +
    "todo parejo, o peor. Hay de todo lo que pasa en un medio juego: sacrificios contra el enroque, la torre " +
    "que cambia de fila, la jugada intermedia, la defensa que contraataca y el cambio que convierte la " +
    "ventaja. Cada afirmación de las notas (cuál es la única, qué jugada no sirve) está comprobada con " +
    "Stockfish 16.\n" +
    "Cada ejercicio, unos 10-12 minutos:\n" +
    "1. Al tablero. Nadie mueve piezas.\n" +
    "2. Antes de calcular, en voz alta: ¿qué está atacado?, ¿dónde están los reyes?, ¿qué quiere hacer el " +
    "rival? En el medio juego, la jugada sale de esas tres preguntas.\n" +
    "3. Cálculo en silencio y en papel: tres jugadas candidatas, y para cada una la mejor respuesta del " +
    "rival. Al final, elegir una y escribir por qué las otras no sirven.\n" +
    "4. En voz alta: dos o tres leen su línea. Tú haces de rival, sobre todo contra la jugada tentadora " +
    "(está en el renglón, en «Trampa»).\n" +
    "5. La explicación: la nota «El cálculo», con la idea de cada jugada y lo que pasó en la partida.\n" +
    "6. Práctica: cada uno juega la posición contra ti o contra el motor, hasta cobrar la ventaja.\n" +
    "Las cuatro primeras son de ataque, las cuatro siguientes de defender o contraatacar con tiempo, y las " +
    "dos últimas de convertir. La regla de la sesión: antes de mover, compara al menos tres candidatas.",
  cierre:
    "Lo que tiene que quedar, en una frase por ejercicio:\n" +
    "1. En un ataque, los jaques primero: cada uno abre una línea.\n" +
    "2. Después de romper el enroque, tapa la defensa.\n" +
    "3. No salves la pieza atacada si puedes atacar algo más grande.\n" +
    "4. Contra una pieza clavada, ataca con lo más chico.\n" +
    "5. Antes de atacar, cierra la puerta de atrás.\n" +
    "6. Saca la dama del ataque hacia una casilla desde donde siga atacando.\n" +
    "7. La jugada intermedia: primero ataca tú algo más grande.\n" +
    "8. Con enroques opuestos, cada jugada tiene que amenazar algo.\n" +
    "9. Si te atacan dos piezas, busca la jugada que las saca con más fuerza.\n" +
    "10. Con ventaja, cambiar bien vale más que atacar.\n" +
    "Para la casa: en Entrenamiento, los ejercicios por tema de ataque al enroque, jugada intermedia y " +
    "clavada, para seguir practicando.",
  ejercicios: EJERCICIOS,
});

if (require.main === module) module.exports.escribir();
