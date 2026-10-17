/* ===== Sesión intensiva de táctica: calcular hasta el final =====
 *
 * Arma un plan de clase (planes.html y la clase en vivo) con diez
 * combinaciones que parten de material igualado (o un peón de diferencia) y
 * en las que CADA jugada propia de la línea es la única que gana: no alcanza
 * con ver la primera, hay que calcular hasta que el material cae.
 *
 * NINGUNA POSICIÓN SE INVENTA: son ejercicios de la base abierta de Lichess
 * (entreno/data/temas.json, la de Entrenamiento), varios de partidas entre
 * maestros. Se eligieron por lo que dice el motor: de 467 candidatas (sin
 * mates, de tres jugadas propias o más, material parejo, rating 1500-2300)
 * quedaron 364 con una sola primera jugada que gana; de esas, diez de temas
 * distintos en las que también las jugadas siguientes son únicas.
 *
 * Lo que comparte con las otras sesiones intensivas está en
 * herramientas/lib/sesion-intensiva.js. Lo que se afirma lo comprueba
 * Stockfish con `node herramientas/sesion-intensiva-motor.js tactica` y lo
 * exige verificar-sesiones-intensivas.js en cada CI.
 *
 * Uso:  npm install
 *       node herramientas/sesion-tactica-intensiva.js
 * Escribe herramientas/planes/sesion-tactica-intensiva.json y .sql.
 */
"use strict";
const { crear } = require("./lib/sesion-intensiva");

const EJERCICIOS = [
  {
    banco: "lt:2mxHX", nombre: "Desviar al que defiende", minutos: 6,
    unicas: [0, 2, 4],
    trampas: [
      { jugada: 0, san: "Rhe1", refuta: ["Qxd4"], resultado: "rival" },
      { jugada: 0, san: "Nd7+", refuta: [], resultado: "rival" },
      { jugada: 4, san: "Nc6+", refuta: ["bxc6"], resultado: "tablas" },
    ],
    explicacion:
      "Material igualado y las damas enfrentadas: la negra de c5 ataca a la blanca de d4. Si el blanco no hace " +
      "algo ya, el negro cambia damas en d4 y queda mejor.\n" +
      "Mira la octava fila: el rey negro en f8 y la torre en g8, en la misma línea. Una torre blanca en d8 daría " +
      "jaque y después se comería g8 (una ensartada). ¿Por qué no ahora? Porque d8 la defiende el alfil de e7.\n" +
      "19.Dxc5! ÚNICA. El cambio desvía al defensor: 19...Axc5 (cualquier otra captura es peor) y el alfil ya " +
      "no cuida d8. 20.Td8+! ÚNICA Re7 21.Txg8! ÚNICA y el blanco ganó una torre. Si 20...Rg7, 21.Ch5+ Rh6 " +
      "22.Txg8, lo mismo.\n" +
      "Las trampas: 19.The1? (o cualquier jugada «de desarrollo») 19...Dxd4 y el negro queda mejor. 19.Cd7+?, " +
      "el jaque que parece fuerte, tampoco: el negro queda mejor. Y al final, 21.Cc6+? bxc6 22.Txg8 deja " +
      "las cosas parejas: el caballo se perdió por nada.\n" +
      "La lección: si una casilla está defendida, pregúntate quién la defiende y si lo puedes desviar.",
  },
  {
    banco: "lt:1b5Qz", nombre: "La jugada tranquila", minutos: 6,
    unicas: [0, 2, 4],
    trampas: [
      { jugada: 0, san: "Qh5", refuta: [], resultado: "tablas" },
      { jugada: 0, san: "Re1", refuta: [], resultado: "tablas" },
      { jugada: 4, san: "Re1", refuta: [], resultado: "tablas" },
    ],
    explicacion:
      "El negro tiene un peón de más y su rey parece seguro: no hay ningún jaque que sirva. Pero el alfil blanco " +
      "de b1 apunta a h7 por la diagonal b1-h7, y h7 está vacía.\n" +
      "19.Dc2! ÚNICA. Una jugada tranquila, sin jaque ni captura: dama y alfil en la misma diagonal amenazan " +
      "20.Dh7 mate (el rey no puede ir a f8, donde está su torre).\n" +
      "19...f5 (tapa la diagonal; lo demás es peor) 20.exf6! ÚNICA. Captura al paso: el peón vuelve a abrir la " +
      "diagonal. 20...Cxf6 (el caballo cuida h7) 21.Dg6+! ÚNICA. Ahora la dama entra por g6: 21...Rh8 22.Dxh6+ " +
      "Rg8 23.Dxg5+ y el blanco gana dos peones con el rey negro desnudo.\n" +
      "Las trampas: 19.Dh5? (atacar h6 de frente) o 19.Te1? no amenazan nada inmediato y el negro se defiende: " +
      "no se gana nada. Al final, 21.Te1? deja respirar al negro.\n" +
      "La lección: a veces la jugada que gana no da jaque ni come nada: arma una amenaza que no se puede parar.",
  },
  {
    banco: "lt:18Gjp", nombre: "Primero el jaque, después el cambio", minutos: 6,
    unicas: [0, 2, 4],
    trampas: [
      { jugada: 0, san: "Qxc4", refuta: ["Rxc4"], resultado: "tablas" },
      { jugada: 2, san: "Rg8+", refuta: ["Kxg8"], resultado: "pierde" },
    ],
    explicacion:
      "Las damas se atacan por la columna c, y la negra está defendida por la torre de c8. El negro tiene un " +
      "peón de más.\n" +
      "Lo natural es cambiar damas, pero antes hay que mirar los jaques. 25.Td8+! ÚNICA. Una jugada intermedia: " +
      "la torre da jaque en d8, y la torre de c8 tiene un problema. Si la come (25...Txd8), deja de defender a " +
      "la dama, y 26.Dxc4 gana la dama por una torre.\n" +
      "25...Rg7 26.Dxc4! ÚNICA Txc4 27.Txa8! ÚNICA. Ahora sí: el cambio de damas dejó la torre de a8 sin " +
      "defensa, y el blanco quedó con una torre de más.\n" +
      "Las trampas: 25.Dxc4? Txc4 cambia damas sin ganar nada: el negro sigue con su peón de más. Y 26.Tg8+?, " +
      "otro jaque «por si acaso», 26...Rxg8: el blanco regala la torre y pierde.\n" +
      "La lección: antes de cambiar, revisa si hay un jaque que cambie quién defiende a quién.",
  },
  {
    banco: "lt:3SHiC", nombre: "El ataque descubierto y el doble", minutos: 7,
    unicas: [0, 2, 4, 6],
    trampas: [
      { jugada: 0, san: "Nb5", refuta: [], resultado: "tablas" },
      { jugada: 2, san: "Ne7+", refuta: ["Qxe7"], resultado: "tablas" },
    ],
    explicacion:
      "El negro tiene un peón de más y un alfil fuerte en d5. Pero hay dos cosas alineadas: el caballo de d4 " +
      "tapa la columna d entre la dama blanca y el alfil de d5, y la dama negra de e7 está al alcance de un " +
      "caballo en f5.\n" +
      "15.Cxf5! ÚNICA. El caballo come un peón y ataca la dama de e7, y a la vez destapa la columna d: la dama " +
      "blanca ataca el alfil de d5. Dos amenazas con una jugada.\n" +
      "15...De6 (defiende d5; si 15...Df6, 16.Dxd5+ y el blanco se queda con el alfil) 16.Dxd5! ÚNICA Dxd5 " +
      "17.Ce7+! ÚNICA Rf7 18.Cxd5! ÚNICA. La dama blanca se entregó para atraer a la negra a d5, donde el " +
      "caballo la ataca con jaque: el blanco ganó una pieza.\n" +
      "La trampa: 16.Ce7+? (el jaque antes de tiempo) 16...Dxe7 y la dama negra se salva: no se gana nada. El " +
      "orden importa: primero atraer a la dama, después el jaque. Y 15.Cb5? no amenaza nada.\n" +
      "La lección: cuando una pieza se mueve, mira lo que destapa detrás.",
  },
  {
    banco: "lt:20CdR", nombre: "El rey que tapa a su dama", minutos: 7,
    unicas: [0, 2, 4],
    trampas: [
      { jugada: 0, san: "Qc8+", refuta: ["Qg8"], resultado: "tablas" },
      { jugada: 0, san: "Qxe5", refuta: ["dxe5"], resultado: "pierde" },
      { jugada: 2, san: "Qxg8+", refuta: ["Kxg8"], resultado: "tablas" },
    ],
    explicacion:
      "Material igualado. La torre negra de g4 parece bien defendida: la dama de g7 la cuida por la columna g. " +
      "El blanco tiene que buscar la forma de cortar esa defensa.\n" +
      "45.De8+! ÚNICA Dg8 (las otras pierden con mate: 45...Rh7 46.f6+ o 45...Df8 46.Dxf8+). 46.Dh5+! ÚNICA. " +
      "Desde h5 la dama da jaque y ataca g4.\n" +
      "Si 46...Dh7, la dama negra salió de la columna g y la torre queda sola: 47.Dxg4. Si 46...Rg7 (lo que se " +
      "jugó), el rey se mete entre su dama y su torre: 47.Dxg4+! ÚNICA con jaque, y el blanco ganó una torre.\n" +
      "Las trampas: 45.Dc8+? Dg8 46.Dxg8+ Rxg8 cambia damas y no gana nada; lo mismo 46.Dxg8+?. Y 45.Dxe5?? " +
      "dxe5 regala la dama por un alfil.\n" +
      "La lección: una pieza defendida puede quedar sin defensa si el rey rival se tiene que poner en el medio.",
  },
  {
    banco: "lt:1owXN", nombre: "Abrir la fila para el doble", minutos: 7,
    unicas: [0, 2, 4, 6],
    trampas: [
      { jugada: 0, san: "Qg7+", refuta: ["Kg5"], resultado: "tablas" },
      { jugada: 0, san: "Qxe6", refuta: ["Rxe6"], resultado: "tablas" },
      { jugada: 4, san: "Qf5+", refuta: ["Qxf5+"], resultado: "tablas" },
    ],
    explicacion:
      "El negro tiene un peón de más. El rey negro está en h6 y la dama negra en e6: los dos en la sexta fila. " +
      "Entre ellos hay un solo peón, el de g6. Si esa fila se abre, una torre en f6 los atacaría a los dos.\n" +
      "46.Df4+! ÚNICA. El jaque obliga a 46...g5 (es la única jugada), y el peón deja libre g6: la sexta fila " +
      "quedó abierta.\n" +
      "47.Tf6+! ÚNICA. Doble ataque: la torre da jaque al rey (por g6) y ataca la dama de e6, y está defendida " +
      "por la dama de f4. 47...Rh7 48.Txe6! ÚNICA gxf4 49.Txe8! ÚNICA. El negro se comió la dama blanca, pero el " +
      "blanco se comió la dama y la torre negras: queda con una torre de más.\n" +
      "Las trampas: 46.Dg7+? Rg5 47.Tf5+ Rh4 48.Tf4+ y no hay más que jaque continuo: tablas. 46.Dxe6? Txe6 " +
      "cambia damas y el negro sigue con su peón de más. Y 48.Df5+? Dxf5+ deja escapar la ventaja.\n" +
      "La lección: si dos piezas rivales están en la misma línea con algo en el medio, busca cómo sacar lo del " +
      "medio.",
  },
  {
    banco: "lt:2tev7", nombre: "El caballo que abre la diagonal", minutos: 8,
    unicas: [0, 2, 4, 6],
    trampas: [
      { jugada: 0, san: "Nb5", refuta: [], resultado: "tablas" },
      { jugada: 2, san: "Qd4", refuta: ["Qc7+"], resultado: "pierde" },
      { jugada: 4, san: "Qxc1", refuta: ["Qxc1"], resultado: "pierde" },
      { jugada: 6, san: "Qf4+", refuta: ["Qxf4+"], resultado: "tablas" },
    ],
    explicacion:
      "Material igualado, y el negro amenaza ...Dc7+ contra el rey blanco: no hay tiempo para jugadas " +
      "lentas. La dama blanca de b2 apunta a f6 por la gran diagonal, pero el caballo de d4 se la tapa.\n" +
      "30.Ce6+! ÚNICA. El caballo sale con jaque y destapa la diagonal: ahora la dama ataca el caballo de f6. " +
      "30...fxe6 (si 30...Rh6, 31.Dxf6 también) 31.Td7+! ÚNICA. La séptima fila quedó abierta (ya no está el " +
      "peón de f7): jaque. 31...Rh6 32.Dxf6! ÚNICA. Amenaza mate, y la única defensa negra es 32...Dc7+, que se " +
      "pierde: 33.Txc7! ÚNICA.\n" +
      "Las trampas: 30.Cb5? no hace nada y el ataque negro sigue. 31.Dd4? Dc7+ y el negro se salva y gana. " +
      "32.Dxc1? Dxc1, comerse la torre parece lógico, pero el negro cambia y se queda con ventaja. Y 33.Df4+? " +
      "Dxf4+ cambia damas: la ventaja se escapa.\n" +
      "La lección: un jaque de caballo puede servir para algo más que el jaque: abrir la línea de otra pieza.",
  },
  {
    banco: "lt:1GpdX", nombre: "Contra la amenaza de mate, el ataque", minutos: 8,
    unicas: [0, 2, 4, 6],
    trampas: [
      { jugada: 0, san: "c3", refuta: [], resultado: "tablas" },
      { jugada: 0, san: "Nh3+", refuta: ["gxh3"], resultado: "pierde" },
      { jugada: 2, san: "Qg6+", refuta: [], resultado: "pierde" },
      { jugada: 6, san: "Qxg4", refuta: ["fxg4"], resultado: "pierde" },
    ],
    explicacion:
      "Material igualado, y el blanco amenaza 23.Dxg7 mate: la dama de d4 y el alfil de b2 apuntan a g7. El negro " +
      "no tiene tiempo de defenderse con calma: tiene que atacar con jaques.\n" +
      "22...Cf3+! ÚNICA. Jaque y ataque doble: el caballo da jaque al rey y ataca la dama de d4. 23.gxf3 (si " +
      "23.Rh1, 23...Cxd4 y el negro gana la dama) Tg5+! ÚNICA. La torre de a5 entra por la quinta fila, con " +
      "jaque por la columna g abierta.\n" +
      "24.Rh1 Dh3! ÚNICA. Amenaza 25...Dg2 mate, con la torre detrás. El blanco tiene que tapar: 25.Dg4 " +
      "Txg4! ÚNICA. Con la torre, no con la dama: el negro se queda con la dama blanca por una torre.\n" +
      "Las trampas: 22...c3? (defenderse) y el blanco sigue con la iniciativa: no se gana nada. 22...Ch3+?, el " +
      "otro jaque de caballo, 23.gxh3 y no ataca nada más: pierde. 23...Dg6+? en vez de la torre, y el ataque se " +
      "apaga. 25...Dxg4? 26.fxg4: se cambian damas y el blanco queda con una pieza de más.\n" +
      "La lección: cuando te amenazan mate, busca primero tus jaques; si uno ataca dos cosas, puede salvar todo.",
  },
  {
    banco: "lt:0nWdL", nombre: "Llevar al rey a la casilla del jaque", minutos: 7,
    unicas: [0, 2, 4],
    trampas: [
      { jugada: 0, san: "Bxg7+", refuta: ["Kg8"], resultado: "tablas" },
      { jugada: 2, san: "Bxg7", refuta: [], resultado: "tablas" },
      { jugada: 4, san: "Nd7+", refuta: [], resultado: "tablas" },
    ],
    explicacion:
      "Material casi igualado: el negro tiene dos alfiles y dos caballos contra torre, alfil y caballo, y sus " +
      "piezas rodean al rey blanco. Hay que actuar con jaques.\n" +
      "40.Ta8+! ÚNICA. La torre lleva al rey a h7 (40...Ae8 41.Txe8+ y 40...Ad8 41.Txd8+ pierden un alfil).\n" +
      "40...Rh7 41.Cf8+! ÚNICA. El caballo da jaque desde f8, y el rey tiene que volver a g8. 41...Rg8 " +
      "42.Cxg6+! ÚNICA. Jaque a la descubierta: el caballo come el alfil de g6 y la torre de a8 da jaque por la " +
      "octava fila. El blanco ganó una pieza.\n" +
      "Las trampas: 40.Axg7+? Rg8 y la pieza que se entregó no vuelve: no se gana nada. 41.Axg7? (en vez del " +
      "jaque de caballo) lo mismo. 42.Cd7+? y el caballo da un jaque que no come nada.\n" +
      "La lección: los jaques sirven para llevar al rey a la casilla donde el siguiente jaque gana algo. Calcula " +
      "adónde va el rey después de cada uno.",
  },
  {
    banco: "lt:017u3", nombre: "El doble y la ensartada", minutos: 7,
    unicas: [0, 2, 4, 6],
    trampas: [
      { jugada: 0, san: "Qxd8", refuta: ["Bxd8"], resultado: "tablas" },
      { jugada: 2, san: "Qf3", refuta: [], resultado: "tablas" },
      { jugada: 4, san: "Bg5", refuta: [], resultado: "tablas" },
    ],
    explicacion:
      "Material igualado. Mira dónde están las piezas negras: la dama en d8, el alfil en e7 y la torre en f8, " +
      "casi en fila. El caballo blanco de e5 puede saltar a c6.\n" +
      "20.Cc6! ÚNICA. Ataque doble: el caballo ataca la dama de d8 y el alfil de e7. 20...De8 21.Cxe7+! ÚNICA " +
      "Dxe7. El blanco cambió caballo por alfil, pero ahora la dama negra quedó en e7, delante de la torre de " +
      "f8.\n" +
      "22.Ad6! ÚNICA. Ensartada: el alfil ataca la dama, y cuando se va, 22...Dd8 23.Axf8! ÚNICA come la torre " +
      "de detrás. El blanco ganó la calidad.\n" +
      "Las trampas: 20.Dxd8? Axd8 cambia damas sin ganar nada. 21.Df3? (sin cambiar en e7) y el negro se " +
      "reorganiza. 22.Ag5? ataca el caballo de f6, pero no gana nada: la ensartada era por la diagonal d6-f8.\n" +
      "La lección: un ataque doble puede servir para mover una pieza rival a la casilla donde cae en la " +
      "siguiente táctica.",
  },
];

module.exports = crear({
  slug: "tactica",
  titulo: "Táctica · Sesión intensiva: calcular hasta el final",
  notas: "Sesión intensiva de cálculo táctico: diez combinaciones de la base abierta de Lichess que parten de " +
         "material igualado y en las que cada jugada de la línea es la única que gana. Cada ejercicio trae la " +
         "chuleta (línea, jugadas únicas y trampas) y la nota con el cálculo explicado. Todo comprobado con " +
         "Stockfish 16.",
  umbral: { gana: 300, noGana: 100 },
  resultados: { tablas: "no gana nada", rival: "el rival queda mejor", pierde: "pierde" },
  conOrigen: true,
  consigna: (ej, a) => (a.fen.split(" ")[1] === "w" ? "Juegan blancas" : "Juegan negras") +
    " y ganan. ③ " + ej.minutos + " min en papel: toda la línea, con las respuestas del rival, hasta que cae el material.",
  intro:
    "Diez combinaciones de la base abierta de Lichess, varias de partidas entre maestros. Todas parten de " +
    "material igualado (o un peón de diferencia) y en todas hay que ver lejos: la primera jugada es la única " +
    "que gana, y las siguientes también. Quien encuentra la primera y no sigue calculando, se queda a mitad de " +
    "camino. Cada afirmación de las notas (cuál es la única, qué jugada no gana nada) está comprobada con " +
    "Stockfish 16.\n" +
    "Cada ejercicio, unos 10-12 minutos:\n" +
    "1. Al tablero. Nadie mueve piezas.\n" +
    "2. Cálculo en silencio y en papel: la línea entera, con la mejor respuesta del rival en cada jugada, " +
    "hasta que se gane material. Antes de empezar, que cada uno anote los jaques, las capturas y las amenazas " +
    "que hay en la posición: de ahí sale la combinación.\n" +
    "3. En voz alta: dos o tres leen su línea. Tú haces de rival y contestas con la mejor defensa, sobre todo " +
    "contra la jugada tentadora (está en el renglón, en «Trampa»).\n" +
    "4. La explicación: la nota «El cálculo» que va debajo, con el motivo táctico de cada jugada.\n" +
    "5. Práctica: cada uno juega la combinación desde la posición, contra ti o contra el motor.\n" +
    "Van de 1700 a 1900 de rating de Lichess, más o menos de menor a mayor dificultad. La regla de la sesión: " +
    "no se juega la primera jugada hasta haber visto la última.",
  cierre:
    "Lo que tiene que quedar, en una frase por ejercicio:\n" +
    "1. Si una casilla está defendida, busca cómo desviar al que la defiende.\n" +
    "2. La jugada que gana puede ser tranquila: una amenaza que no se puede parar.\n" +
    "3. Antes de cambiar, revisa si hay un jaque intermedio.\n" +
    "4. Cuando una pieza se mueve, mira lo que destapa detrás.\n" +
    "5. Una pieza defendida queda sola si el rey rival se tiene que poner en el medio.\n" +
    "6. Si dos piezas están en la misma línea con algo en el medio, saca lo del medio.\n" +
    "7. Un jaque de caballo puede abrir la línea de otra pieza.\n" +
    "8. Contra una amenaza de mate, busca primero tus jaques.\n" +
    "9. Los jaques llevan al rey a donde el siguiente jaque gana algo.\n" +
    "10. Un ataque doble puede preparar la siguiente táctica.\n" +
    "Para la casa: en Ejercicios por tema (Entrenamiento) están los temas de esta sesión —desviación, jugada " +
    "intermedia, ataque descubierto, ensartada, jugada tranquila— para seguir practicando.",
  ejercicios: EJERCICIOS,
});

if (require.main === module) module.exports.escribir();
