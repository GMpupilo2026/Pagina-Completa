/* ===== Sesión intensiva de finales: ganar con poca ventaja =====
 *
 * Arma un plan de clase (planes.html y la clase en vivo) con diez finales en
 * los que la ventaja es mínima —un peón, o solo un rey mejor puesto— y aun así
 * se gana contra la mejor defensa. Lo que se entrena es el cálculo preciso y
 * justificado: en cada posición hay al menos una jugada que es la ÚNICA que
 * gana, y casi siempre una tentadora que solo empata (o pierde).
 *
 * NINGUNA POSICIÓN SE INVENTA. Cada ejercicio dice de qué diagrama de «El mapa
 * de los finales» sale (cursos/protegido/data/el-mapa-de-los-finales.json, ya
 * verificado con Stockfish 16), y la FEN y la línea se leen de ahí. Lo único
 * escrito acá es la explicación, las jugadas que se declaran únicas, las
 * trampas con su refutación y, en tres casos, unas jugadas más al final de la
 * línea del banco.
 *
 * Y NADA DE LO QUE SE AFIRMA SE CREE A CIEGAS: «única», «tablas», «pierde» y
 * «gana» los comprueba Stockfish con herramientas/sesion-finales-motor.js, que
 * deja su veredicto en herramientas/sesion-finales-motor.json.
 * verificar-sesion-finales.js (en cada CI, sin motor) exige que cada
 * afirmación —también las que están escritas en el texto de la explicación,
 * como «3.Tf4! ÚNICA» o «1.c7?»— tenga su veredicto ahí y que sea bueno.
 *
 * Uso:  npm install
 *       node herramientas/sesion-finales-intensiva.js
 * Escribe herramientas/planes/sesion-finales-intensiva.json (lo que revisa el
 * verificador) y .sql (lo que se aplica: borra el plan por su título y lo
 * vuelve a sembrar, así que se puede correr las veces que haga falta).
 * Al cambiar un ejercicio: node herramientas/sesion-finales-motor.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const banco = require("./lib/planes-banco");
const { RAIZ, Chess, fenUsable, leerJSON, aEspanol, recorta } = banco;

/* La nota de lib/planes-banco.js aplana los saltos de línea (es para una
   frase). Acá cada nota es un paso a paso, y planes.html y la clase en vivo
   la muestran con pre-wrap: se guardan tal cual, como en los proyectos. La
   base no deja más de 2000 caracteres, y eso lo exige el verificador. */
const nota = (titulo, texto) => ({ tipo: "nota", titulo: recorta(titulo, 200), nota: String(texto).trim() });

/* El plan es de quien administra, como los de arranque y los de los
   proyectos: un plan es del profesor que lo escribió (la RLS no deja firmar
   por otro). Desde planes.html se comparte con quien haga falta. */
const PROFESOR_ID = process.env.PROFESOR_ID || "5fc884eb-5374-4353-9a5d-60454c0be6c9";
const TITULO = "Finales · Sesión intensiva: ganar con poca ventaja";

/* Cada ejercicio:
 *   banco      id del diagrama en «El mapa de los finales»
 *   saltar     jugadas de la línea del banco que se juegan antes de dar la
 *              posición (Lucena empieza con jugada negra; se da después)
 *   extra      jugadas que siguen a la línea del banco (de Stockfish)
 *   unicas     jugadas de la línea (contadas desde 0) que son la ÚNICA que gana
 *   tambien    otras jugadas que la explicación dice que también ganan
 *   trampas    { jugada (índice en la línea), san, refuta, resultado }: la
 *              jugada tentadora en lugar de la de la línea, y cómo se contesta
 *   minutos    tiempo de cálculo en silencio
 *   explicacion  la nota «El cálculo», con la notación de acá
 * Todo SAN va en inglés (lo que entiende chess.js) y se traduce al escribirse.
 */
const EJERCICIOS = [
  {
    banco: "F3-5", nombre: "El tiempo de reserva", minutos: 5,
    unicas: [],
    tambien: [{ jugada: 0, san: "Kf5" }, { jugada: 0, san: "Kh5" }],
    trampas: [
      { jugada: 0, san: "Kf4", refuta: ["Kf6"], resultado: "tablas" },
      { jugada: 0, san: "Kh4", refuta: ["Kh6"], resultado: "tablas" },
      { jugada: 8, san: "Kf5", refuta: ["Kg7"], resultado: "tablas" },
      { jugada: 8, san: "Kh5", refuta: ["Kg7"], resultado: "tablas" },
    ],
    explicacion:
      "La idea. Con el peón en g3, las casillas críticas son f5, g5 y h5 (dos filas por delante del peón). " +
      "El rey blanco YA está en una: con eso el final está ganado, siempre que no la abandone. Que el negro tenga " +
      "la oposición se arregla con el peón.\n" +
      "1.g4 Tiempo de reserva: el peón avanza y le pasa el turno al negro. Ahora las casillas críticas son f6, g6 " +
      "y h6, y el rey negro no puede tapar las tres.\n" +
      "1...Rh7 2.Rf6 (entra en una casilla crítica) Rh8 3.Rg6 Rg8 4.g5 Rh8 5.Rf7 Rh7 6.g6+ Rh6 7.g7 y corona.\n" +
      "Por qué 5.Rf7: desde f7 el rey controla g7 y g8, el camino del peón. 5.Rf5? o 5.Rh5? se alejan de la " +
      "casilla crítica: 5...Rg7 y tablas.\n" +
      "La trampa: 1.Rf4? o 1.Rh4?, «para ganar la oposición». El rey sale de la casilla crítica y el negro " +
      "contesta 1...Rf6 (o 1...Rh6): ahora es él quien tiene la oposición delante del peón y el rey blanco ya no " +
      "vuelve a entrar. Tablas.\n" +
      "También ganan 1.Rf5 y 1.Rh5: el rey se queda en una casilla crítica. Lo que tiene que quedar es la regla, " +
      "no una jugada: rey en casilla crítica = ganado; el peón se mueve solo para pasar el turno.",
  },
  {
    banco: "F79-1", nombre: "La carrera hacia las casillas críticas", minutos: 6,
    unicas: [0, 2, 4, 6],
    trampas: [
      { jugada: 0, san: "Kg2", refuta: ["Kb8", "Kf3", "Kc7", "Ke4", "Kd6"], resultado: "tablas" },
      { jugada: 0, san: "Kh3", refuta: ["Kb7", "Kg2", "Kc7", "Kf2", "Kd6", "Ke1", "Kc5"], resultado: "pierde" },
      { jugada: 6, san: "Kd4", refuta: [], resultado: "tablas" },
      { jugada: 6, san: "Ke4", refuta: [], resultado: "tablas" },
    ],
    explicacion:
      "Material igualado: la ventaja es solo de tiempo. Los peones están bloqueados, y gana el rey que llegue " +
      "antes a las casillas críticas del peón rival: c6, d6 y e6 para el peón negro de b6; c5, d5 y e5 para el " +
      "blanco de b5.\n" +
      "Contar: el rey negro llega a d6 en tres jugadas (Rb7, Rc7, Rd6). El blanco necesita tres para llegar a e5 " +
      "(Rg3, Rf4, Re5) y juega primero: llega antes, pero solo si no pierde ni un tiempo.\n" +
      "1.Rg3! ÚNICA Rb7 2.Rf4! ÚNICA Rc7 3.Re5! ÚNICA Rd7 4.Rd5! ÚNICA. Los reyes quedan en oposición y le toca " +
      "al negro: tiene que ceder el paso.\n" +
      "4...Rc7 5.Re6 Rc8 6.Rd6 Rb7 7.Rd7 Rb8 8.Rc6 Ra7 9.Rc7 Ra8 10.Rxb6 y gana: el rey está delante de su peón.\n" +
      "Por qué 4.Rd5 y no 4.Rd4? o 4.Re4?: cualquier paso atrás le devuelve el tiempo al negro, que llega a d6.\n" +
      "Las trampas: 1.Rg2? parece igual de bueno, pero pierde un tiempo: 1...Rb8 2.Rf3 Rc7 3.Re4 Rd6 y el negro " +
      "llegó primero. Tablas. Y 1.Rh3? es peor todavía: el rey negro llega a c5 y se come el peón de b5 (gana el " +
      "negro).\n" +
      "La lección: con peones bloqueados no basta con «llevar el rey al centro»: se cuentan las jugadas hasta la " +
      "casilla crítica de cada bando, y quien llega primero gana.",
  },
  {
    banco: "F86-1", nombre: "La triangulación", minutos: 6,
    extra: ["Kc8", "Kb6", "Kb8", "Kxa6"],
    unicas: [6],
    trampas: [
      { jugada: 0, san: "c7", refuta: ["Kxc7", "Kc5", "Kb7", "Kd6", "Kb8", "Kc6", "Kc8"], resultado: "tablas" },
      { jugada: 6, san: "Kd4", refuta: ["Kxc6"], resultado: "tablas" },
    ],
    explicacion:
      "Un peón de más (c6), pero no corona solo: hay que entrar en b6 para comerse a6.\n" +
      "Casillas conjugadas: con el rey blanco en c5, el negro tiene que estar en c7; con el blanco en d6, el negro " +
      "en d8; con el blanco en d5, el negro en c8. Ahora el blanco está en d5, el negro en c8… y le toca al " +
      "blanco: es justo la posición que no le conviene. Necesita perder un tiempo.\n" +
      "1.Rd4 Rd8 2.Rc4 Rc8 3.Rd5. El rey blanco hizo un triángulo (d5-d4-c4-d5): la posición es la misma, pero " +
      "ahora juega el negro. Él no puede triangular: b7 y d7 están controladas por el peón de c6, y solo le " +
      "quedan b8, c8, c7 y d8.\n" +
      "3...Rc7 4.Rc5! ÚNICA. Cualquier otra deja colgado el peón de c6: 4.Rd4? Rxc6. Ahora el negro está en " +
      "zugzwang: 4...Rc8 5.Rb6 Rb8 6.Rxa6, y el rey blanco protege c6 mientras corre el peón de a.\n" +
      "La trampa: 1.c7? «para coronar». 1...Rxc7 y el blanco ya no tiene nada: 2.Rc5 Rb7 3.Rd6 Rb8 4.Rc6 Rc8, " +
      "y con el peón de torre el rey negro no sale de la esquina. Tablas.\n" +
      "Al principio hay otras maneras de perder el tiempo; 1.Rd4 es la más clara. Lo que tiene que quedar es la " +
      "idea: si el rival estaría en zugzwang con el turno al revés, se le pasa el turno con un triángulo.",
  },
  {
    banco: "F87-2", nombre: "Dos contra uno: la regla de Steinitz", minutos: 7,
    extra: ["Kg8", "Kxh5"],
    unicas: [0, 2, 4, 12],
    trampas: [
      { jugada: 0, san: "h4", refuta: ["Kf6"], resultado: "tablas" },
      { jugada: 0, san: "g5", refuta: ["hxg5+"], resultado: "tablas" },
      { jugada: 4, san: "gxh5", refuta: ["Kf7"], resultado: "tablas" },
      { jugada: 12, san: "Kf4", refuta: ["Kxg6"], resultado: "tablas" },
    ],
    explicacion:
      "Dos peones contra uno en el mismo flanco: se gana, pero solo si el blanco no malgasta sus tiempos de peón. " +
      "El peón de h2, que todavía puede avanzar una o dos casillas, es la reserva: se usa cuando convenga.\n" +
      "1.h3! ÚNICA. 1.h4? parece más activo y hace tablas: 1...Rf6 y el negro mantiene la oposición sin que al " +
      "blanco le queden tiempos de peón. Y 1.g5? hxg5+ deja rey y peón de torre: tablas.\n" +
      "1...Rf6 2.h4! ÚNICA. Ahora sí: el tiempo de peón deja al negro con el turno. 2...h5 3.g5+! ÚNICA Rf7 " +
      "4.Re5 Rg7 5.Rf5 Rf7 6.g6+ Rg7 7.Rg5! ÚNICA Rg8 8.Rxh5: el peón de g6 le quita al rey negro f7 y h7, y el " +
      "peón de h queda libre para correr.\n" +
      "Por qué 3.g5+ y no 3.gxh5?: tras 3...Rf7 al blanco le quedan dos peones en la columna de torre, y el rey " +
      "negro se va a la esquina. Tablas. Con 3.g5+ se queda con el peón de caballo, que sí gana.\n" +
      "Por qué 7.Rg5: defiende g6 y ataca h5 a la vez. 7.Rf4? Rxg6 y tablas.\n" +
      "La regla (Steinitz): con dos peones contra uno, conviene dejar un peón en su casilla inicial: puede " +
      "avanzar una o dos casillas, y así el bando fuerte elige quién queda con el turno.",
  },
  {
    banco: "F83-1", nombre: "El peón pasado como señuelo", minutos: 7,
    unicas: [0, 8],
    trampas: [
      { jugada: 0, san: "Kb4", refuta: ["Kxd5"], resultado: "tablas" },
      { jugada: 0, san: "Kd3", refuta: ["Kxd5"], resultado: "tablas" },
      { jugada: 8, san: "Kf6", refuta: ["Kd6", "Kg6", "Ke7", "Kxh6", "Kf7"], resultado: "tablas" },
    ],
    explicacion:
      "Un peón de más, d5, que el rey negro bloquea. El plan: entregar el peón de d5 como señuelo; mientras el " +
      "negro se lo come, el rey blanco se come h6 y su peón de h5 corona.\n" +
      "1.Rd4! ÚNICA. Defiende d5 y a la vez se acerca al flanco de rey. 1.Rb4? o 1.Rd3? dejan ir el peón ya: " +
      "1...Rxd5 y el rey negro está a tiempo de volver al flanco de rey. Tablas.\n" +
      "1...Rd7 2.Re5 Re7 3.Rf5 Rd6 4.Rg6 Rxd5 (ahora sí se entrega d5: el rey blanco ya está al lado de h6) " +
      "5.Rxh6! ÚNICA Re6 6.Rg7 y el peón corona: el rey blanco controla f7, f8, g8 y h8.\n" +
      "Contar 5.Rxh6: para atrapar al peón de torre, el rey negro tiene que llegar a f7 (camino de la esquina). " +
      "Desde d5 le faltan dos jugadas (Re6 y Rf7); el blanco, después de comer, necesita una sola (6.Rg7) y le " +
      "toca a él.\n" +
      "La trampa: 5.Rf6? «para cerrar el paso primero». 5...Rd6 6.Rg6 Re7 7.Rxh6 Rf7 y el rey negro llegó a f7: " +
      "con el peón de torre, el rey en la esquina hace tablas.\n" +
      "La regla: en estas carreras se cuentan los tiempos hasta la columna f (la línea de colisión): quien la " +
      "alcanza primero decide.",
  },
  {
    banco: "F84-4", nombre: "La carrera de peones que decide el rey", minutos: 8,
    unicas: [2, 4, 6, 8, 10, 12, 14, 16],
    trampas: [
      { jugada: 2, san: "d4", refuta: ["Kxd4"], resultado: "tablas" },
      { jugada: 2, san: "d3+", refuta: ["Kxd3"], resultado: "tablas" },
      { jugada: 4, san: "d4", refuta: ["Kxa4"], resultado: "tablas" },
      { jugada: 6, san: "Kd4", refuta: ["Kb4", "Kd3", "Kb3", "Ke4", "a4"], resultado: "pierde" },
      { jugada: 6, san: "Kc3", refuta: ["Kb5"], resultado: "tablas" },
    ],
    explicacion:
      "Un peón de más, pero el rey negro es muy activo y va por el peón de a4. Hay que calcular la carrera " +
      "entera: los dos peones van a coronar, y gana quien tenga el rey mejor puesto en ese momento.\n" +
      "1.Re1 Rc4 2.Re2! ÚNICA. Vigila d3 para que el peón pueda salir. 2.d4? Rxd4 o 2.d3+? Rxd3 pierden el peón: " +
      "tablas.\n" +
      "2...Rb4 3.Rd3! ÚNICA. El rey se adelanta; 3.d4? Rxa4 y el negro llega a tiempo. Tablas.\n" +
      "3...Rxa4 4.Rc4! ÚNICA. El rey blanco no estorba a su peón y se queda cerca del rey negro: cuando " +
      "coronen los dos, eso decide. 4.Rd4?? tapa su propio peón: el peón de a corona primero y gana el negro. 4.Rc3? Rb5 y tablas.\n" +
      "4...Ra3 5.d4! a4 6.d5! Rb2 7.d6! a3 8.d7! a2 9.d8=D! a1=D 10.Dd2+ y Stockfish da mate en cinco: la dama " +
      "negra en el rincón y su rey en la banda no pueden con la dama y el rey blancos juntos.\n" +
      "Las jugadas de la 5 a la 9 son todas ÚNICAS: cualquier jugada de rey en medio pierde el tiempo que " +
      "decide la carrera.\n" +
      "La lección: en una carrera no basta con contar quién corona; hay que mirar dónde queda cada rey cuando " +
      "coronan los dos.",
  },
  {
    banco: "F82-1", nombre: "Un rey con dos tareas (Duras, 1905)", minutos: 8,
    extra: ["Ke7", "Qg3"],
    unicas: [0, 2, 4, 6, 14],
    trampas: [
      { jugada: 0, san: "Kc4", refuta: ["Kg5", "Kc5", "Kf5", "b4", "g5", "b5", "g4", "b6", "g3", "b7", "g2", "b8=Q", "g1=Q+"], resultado: "tablas" },
      { jugada: 0, san: "Ka4", refuta: ["g5"], resultado: "pierde" },
      { jugada: 6, san: "Kb6", refuta: ["g5", "Ka6", "g4", "b6", "g3", "b7", "g2", "b8=Q", "g1=Q"], resultado: "tablas" },
      { jugada: 6, san: "b6", refuta: ["Kd7", "Kd5", "Kc8", "Ke5", "Kb7"], resultado: "tablas" },
    ],
    explicacion:
      "Material igualado. Gana el blanco porque su rey hace dos trabajos a la vez: acompaña a su peón y le " +
      "cierra el paso al rey negro. El negro, en cambio, tiene que elegir entre frenar el peón de b y empujar " +
      "el suyo.\n" +
      "1.Rc5! ÚNICA. Va hacia c6 para que el rey negro no se pueda poner delante del peón de b.\n" +
      "Por qué no 1.Rc4?: es un tiempo más lento, y en la carrera el negro corona con jaque: 1...Rg5 2.Rc5 Rf5 " +
      "3.b4 g5 4.b5 g4 5.b6 g3 6.b7 g2 7.b8=D g1=D+ (la dama de g1 da jaque al rey de c5). Tablas. Y 1.Ra4? " +
      "hasta pierde.\n" +
      "1...Rg6 2.b4! ÚNICA Rf7 3.b5! ÚNICA Re7 4.Rc6! ÚNICA. Le quita al rey negro c7 y d7, y prepara 5.Rb7. 4.Rb6? g5 y " +
      "los dos coronan: tablas. 4.b6? Rd7 y el rey negro alcanza el peón.\n" +
      "4...Rd8 5.Rb7 g5 6.b6 g4 7.Ra7 g3 8.b7! ÚNICA g2 9.b8=D+. La coronación es CON JAQUE: el blanco " +
      "gana el tiempo que le faltaba y la dama frena el peón de g2 (9...Re7 10.Dg3).\n" +
      "Por qué 5.Rb7 si tapa a su propio peón: le quita al rey negro c7 y c8, y deja todo listo para que el " +
      "peón corone dando jaque al rey de d8.\n" +
      "La lección: en una carrera de peones, el rey que se mueve con doble objetivo gana tiempos; y coronar con " +
      "jaque vale un tiempo entero.",
  },
  {
    banco: "F91-1", nombre: "El peón doblado vale menos", minutos: 10,
    unicas: [2, 4, 10, 18, 22],
    trampas: [
      { jugada: 4, san: "Kd4", refuta: ["Kxf5", "Kc5", "Ke4", "Kxb5", "Kd4"], resultado: "tablas" },
      { jugada: 10, san: "Kd5", refuta: ["Kxf6"], resultado: "tablas" },
      { jugada: 18, san: "Kb6", refuta: ["Ke6", "Kxb7", "Kd7", "Kb6", "Kc8", "Kxb5", "Kb7"], resultado: "tablas" },
    ],
    explicacion:
      "Tres peones contra tres, pero los negros de b están doblados: en el flanco de dama no pueden crear un " +
      "peón pasado, y en el de rey el blanco tiene dos contra uno. En la práctica, es un peón de más.\n" +
      "El plan: crear un peón pasado en el flanco de rey, usarlo para atar al rey negro y llevar el rey blanco " +
      "a comerse los peones de b.\n" +
      "1.f5+ gxf5+ 2.gxf5+! ÚNICA Rf6 3.Rf4! ÚNICA. Defiende f5. 3.Rd4? (para ir ya por los peones de b) " +
      "3...Rxf5 4.Rc5 Re4 5.Rxb5 Rd4 y el rey negro vuelve a tiempo. Tablas: es demasiado pronto.\n" +
      "3...Rf7 4.Re5 Re7 5.f6+ Rf7 6.Rf5! ÚNICA. El peón de f6 necesita a su rey: 6.Rd5? Rxf6 y tablas.\n" +
      "6...Re8 7.Re6 Rf8 8.Rd6 Rf7 9.Rc7 Rxf6 (el negro se cobra el señuelo, pero lejos de la acción) " +
      "10.Rxb7! ÚNICA Re7 11.Rb6 Rd8 12.Rxb5! ÚNICA y gana: el rey blanco está delante de su peón de b4.\n" +
      "La trampa de la jugada 10: 10.Rb6? parece lo mismo, pero el rey negro llega a tiempo: 10...Re6 11.Rxb7 " +
      "Rd7 12.Rb6 Rc8 13.Rxb5 Rb7 y el negro tiene la oposición delante del peón. Tablas.\n" +
      "La lección: un peón doblado en el lado de la mayoría es casi un peón de menos; y el peón pasado sirve " +
      "aunque se pierda, si mientras tanto el rey gana algo más.",
  },
  {
    banco: "F53-1", nombre: "Lucena: el puente", minutos: 8, saltar: 1,
    unicas: [],
    trampas: [
      { jugada: 6, san: "Re4", refuta: ["Rxe4+"], resultado: "tablas" },
      { jugada: 10, san: "Re4", refuta: ["Rxe4+"], resultado: "tablas" },
    ],
    explicacion:
      "La posición de Lucena: el peón en séptima, el rey blanco en la casilla de coronación y el rey negro " +
      "cortado. Un peón de más que gana siempre… si se conoce el método del puente. Sin él, el rey blanco no " +
      "puede salir de d8 sin recibir jaques sin fin.\n" +
      "2.Tf1+ Rg7. El rey negro queda del otro lado de la columna f, que la torre blanca le corta.\n" +
      "3.Tf4. La torre va a la cuarta fila: va a ser el «puente».\n" +
      "3...Tc1 4.Re7 Te1+ 5.Rd6 Td1+ 6.Re6 Te1+ 7.Rd5 Td1+ 8.Td4. El rey llegó a d5 y la torre se interpone justo " +
      "debajo, en d4, defendida por el rey: se acabaron los jaques y el peón corona.\n" +
      "La trampa: 5.Te4? (en vez de 5.Rd6), para tapar el jaque enseguida. 5...Txe4+ y la torre negra se come " +
      "la blanca dando jaque: tablas. Lo mismo con 7.Te4?: la torre solo se interpone cuando el rey ya está a " +
      "su lado para defenderla.\n" +
      "En las primeras jugadas hay otras maneras de ganar; lo que se pide es el método completo, y que cada " +
      "jugada se justifique con él: cortar, puente en la cuarta, salir con el rey, interponer.\n" +
      "El puente funciona con todos los peones menos el de torre.",
  },
  {
    banco: "F56-3", nombre: "La torre no espera", minutos: 10,
    unicas: [0, 12],
    trampas: [
      { jugada: 0, san: "Rf8", refuta: ["Re1"], resultado: "tablas" },
      { jugada: 0, san: "Kf5", refuta: ["Kd7"], resultado: "tablas" },
      { jugada: 12, san: "e7+", refuta: ["Ke8"], resultado: "tablas" },
      { jugada: 12, san: "Rd7+", refuta: ["Ke8", "Re7+", "Kf8", "Rf7+", "Ke8"], resultado: "tablas" },
    ],
    explicacion:
      "Torre y peón contra torre. La torre negra está detrás del peón, pero pasiva, y el rey negro está en el " +
      "lado largo. El blanco tiene que actuar YA: cada tiempo que espera es un tiempo para que el negro se " +
      "organice.\n" +
      "1.Rf7! ÚNICA. Le deja e6 al peón y amenaza e6-e7 con el rey al lado. 1.Tf8? o 1.Rf5? (esperar o " +
      "reacomodarse) le dan tiempo al negro: 1...Te1 o 1...Rd7, y tablas.\n" +
      "1...Th2 (jaques desde el costado) 2.Tg8 Th7+ 3.Tg7 (la torre tapa el jaque) Th8 4.Re7 Rc6 5.e6 Rc7 " +
      "6.Rf6+ (jaque a la descubierta de la torre de g7) Rd8 7.Rf7! ÚNICA.\n" +
      "Por qué 7.Rf7 y no lo que parece más directo: 7.e7+? Re8 y el rey negro se instala delante del peón: " +
      "tablas. 7.Td7+? Re8 8.Te7+ Rf8 9.Tf7+ Re8 y los jaques no llevan a nada.\n" +
      "7...Rc7 8.Tg1 Th7+ 9.Rg6 Th8 10.Td1. La torre corta al rey negro por la columna d; el peón llega a e7 y " +
      "se llega a una posición de Lucena, que ya sabemos ganar (ejercicio 9).\n" +
      "La lección: con poca ventaja, el bando fuerte no espera. El rey va adelante, el peón avanza cuando el rey " +
      "lo cubre y la torre corta al rey rival.",
  },
];

// ------------------------------------------------------------------ el banco

const MAPA = leerJSON("cursos/protegido/data/el-mapa-de-los-finales.json");
function diagrama(id) {
  for (const f of MAPA.finales) for (const d of f.diagramas || []) if (d.id === id) return d;
  throw new Error("No está en «El mapa de los finales»: " + id);
}

/* La posición y la línea de un ejercicio, leídas del banco y vueltas a jugar
   con chess.js. Devuelve también la FEN ANTES de cada jugada de la línea: ahí
   es donde se comprueban las únicas y las trampas. */
function armar(ej) {
  const d = diagrama(ej.banco);
  const c = new Chess();
  if (!c.load(d.fen)) throw new Error(ej.banco + ": la FEN del banco no carga");
  const delBanco = d.jugadas.map((j) => j.san);
  const saltar = ej.saltar || 0;
  for (const san of delBanco.slice(0, saltar)) {
    if (!c.move(san)) throw new Error(ej.banco + ": no se puede jugar " + san);
  }
  const fen = c.fen();
  const linea = delBanco.slice(saltar).concat(ej.extra || []);
  const antes = [];
  for (const san of linea) {
    antes.push(c.fen());
    if (!c.move(san)) throw new Error(ej.banco + ": la línea no se puede jugar en " + san);
  }
  return { d, fen, linea, antes, final: c.fen() };
}

/* "1.Rg3 Rb7 2.Rf4" con la notación de acá, a partir de la FEN de salida. */
function numerar(fen, sans, marca) {
  const partes = fen.split(" ");
  let n = +partes[5], blancas = partes[1] === "w";
  const out = [];
  sans.forEach((san, i) => {
    const es = aEspanol(san) + (i === 0 && marca ? marca : "");
    if (blancas) out.push(n + "." + es);
    else out.push(i === 0 ? n + "..." + es : es);
    if (!blancas) n += 1;
    blancas = !blancas;
  });
  return out.join(" ");
}

function chuleta(ej, a) {
  const quien = a.fen.split(" ")[1] === "w" ? "Juegan blancas" : "Juegan negras";
  const unicas = ej.unicas.map((i) => numerar(a.antes[i], [a.linea[i]]).replace(/\s.*/, "")).join(", ");
  const trampas = ej.trampas.map((t) =>
    numerar(a.antes[t.jugada], [t.san].concat(t.refuta), "?") + " (" + (t.resultado === "pierde" ? "pierde" : "tablas") + ")");
  const base = quien + " y ganan. ③ " + ej.minutos + " min en papel: la jugada, la respuesta del rival y por qué. " +
               "Línea: " + numerar(a.fen, a.linea);
  let texto = base + (unicas ? " · Únicas: " + unicas : "");
  // Lo que no cabe en los 500 de la base es la lista de trampas, nunca la línea:
  // las trampas están completas en la nota «El cálculo».
  for (const t of trampas) {
    const mas = texto + (texto.includes("· Trampa") ? "; " : " · Trampa: ") + t;
    if (mas.length > 500) break;
    texto = mas;
  }
  return texto;
}

// ------------------------------------------------------------------ el plan

function armarPlan() {
  const items = [];
  items.push(nota("Cómo se trabaja esta sesión",
    "Diez finales en los que la ventaja es mínima —un peón, o solo un rey mejor puesto— y aun así se gana " +
    "contra la mejor defensa. Ninguno se gana «jugando natural»: en cada uno hay al menos una jugada que es " +
    "la ÚNICA que gana, y casi siempre una tentadora que solo empata (o pierde). Todos salen de «El mapa de " +
    "los finales», y cada afirmación de las notas (cuál es la única, qué hace tablas, qué pierde) está " +
    "comprobada con Stockfish 16.\n" +
    "Cada ejercicio, unos 10-12 minutos:\n" +
    "1. Al tablero. Nadie mueve piezas.\n" +
    "2. Cálculo en silencio, el tiempo que dice el renglón: cada uno escribe en papel su primera jugada, la " +
    "respuesta que espera del rival y POR QUÉ gana. «Porque sí» no vale: se justifica con una idea " +
    "(casillas críticas, oposición, tiempo de reserva, contar tiempos, el puente…).\n" +
    "3. En voz alta: dos o tres leen su línea. Tú haces de rival y juegas la mejor defensa contra cada una, " +
    "sobre todo contra la jugada tentadora (está en el renglón, en «Trampa»).\n" +
    "4. La línea buena, jugada por jugada, con el porqué de cada una: la nota «El cálculo» que va debajo.\n" +
    "5. Práctica: cada uno la juega desde la posición, contra ti o contra el motor, hasta ganarla.\n" +
    "Del 1 al 8 son finales de peones (donde un solo tiempo decide) y el 9 y el 10, de torre. La regla de " +
    "toda la sesión: antes de mover en un final, contar. Cuántas jugadas necesita cada rey y cada peón, " +
    "quién llega primero y a quién le toca mover cuando llega."));

  const salida = [];
  EJERCICIOS.forEach((ej, i) => {
    const a = armar(ej);
    const n = i + 1;
    if (!fenUsable(a.fen)) throw new Error(ej.banco + ": la clase en vivo rechazaría la posición");
    items.push({ tipo: "posicion", titulo: recorta("Ejercicio " + n + " · " + ej.nombre, 200), fen: a.fen,
                 pregunta: chuleta(ej, a) });
    items.push(nota("Ejercicio " + n + " · El cálculo", ej.explicacion));
    salida.push({ n, banco: ej.banco, fen: a.fen, linea: a.linea, antes: a.antes, final: a.final,
                  unicas: ej.unicas, tambien: ej.tambien || [], trampas: ej.trampas,
                  explicacion: ej.explicacion });
  });

  items.push(nota("Cierre",
    "Lo que tiene que quedar, en una frase por ejercicio:\n" +
    "1. Con el rey en una casilla crítica el final está ganado; el peón solo se mueve para pasar el turno.\n" +
    "2. Con peones bloqueados, se cuentan las jugadas hasta las casillas críticas: gana quien llega primero.\n" +
    "3. Si el rival estaría en zugzwang con el turno al revés, se pierde un tiempo con un triángulo.\n" +
    "4. Con dos peones contra uno, un peón en su casilla inicial es una reserva de tiempo.\n" +
    "5. El peón pasado sirve de señuelo: mientras el rey rival se lo come, el tuyo gana en el otro lado.\n" +
    "6. En una carrera de peones, decide dónde queda cada rey cuando coronan los dos.\n" +
    "7. El rey con doble objetivo gana tiempos, y coronar con jaque vale un tiempo entero.\n" +
    "8. Un peón doblado en el lado de la mayoría es casi un peón de menos.\n" +
    "9. Lucena: cortar, puente en la cuarta fila, salir con el rey e interponer.\n" +
    "10. Con poca ventaja no se espera: rey adelante, peón cubierto, torre que corta.\n" +
    "Para la casa: los diez están en el curso «El mapa de los finales», con su explicación. Que cada uno " +
    "repase ahí los que no ganó en clase y siga practicando contra el motor en Finales contra la máquina " +
    "(entreno/finales.html)."));

  items.forEach((it, i) => { it.orden = i; });
  return {
    titulo: TITULO,
    notas: recorta("Sesión intensiva de cálculo en finales: diez posiciones de «El mapa de los finales» con " +
                   "poca ventaja y una sola manera de ganar. Cada ejercicio trae la chuleta (línea, jugadas " +
                   "únicas y la trampa) y la nota con el cálculo explicado. Todo comprobado con Stockfish 16.", 4000),
    items, ejercicios: salida,
  };
}

function aSQL(plan) {
  const esc = (v) => (v === null || v === undefined ? "NULL" : "'" + String(v).replace(/'/g, "''") + "'");
  const out = [];
  out.push("-- " + TITULO + ". Generado por herramientas/sesion-finales-intensiva.js.");
  out.push("-- Se puede correr las veces que haga falta: borra primero el plan por su título.");
  out.push("begin;");
  out.push("delete from public.planes_clase where profesor_id = " + esc(PROFESOR_ID) + " and titulo = " + esc(plan.titulo) + ";");
  out.push("with p as (insert into public.planes_clase (profesor_id, titulo, notas) values (" +
           esc(PROFESOR_ID) + ", " + esc(plan.titulo) + ", " + esc(plan.notas) + ") returning id)");
  out.push("insert into public.plan_items (plan_id, orden, tipo, titulo, fen, pregunta, nota) select p.id, x.orden, x.tipo, x.titulo, x.fen, x.pregunta, x.nota from p, (values");
  out.push(plan.items.map((it) => "  (" + it.orden + ", " + esc(it.tipo) + ", " + esc(it.titulo) + ", " +
           esc(it.fen || null) + ", " + esc(it.pregunta || null) + ", " + esc(it.nota || null) + ")").join(",\n"));
  out.push(") as x(orden, tipo, titulo, fen, pregunta, nota);");
  out.push("commit;");
  return out.join("\n") + "\n";
}

module.exports = { EJERCICIOS, armar, armarPlan, numerar, TITULO };

if (require.main === module) {
  const plan = armarPlan();
  const dir = path.join(__dirname, "planes");
  fs.mkdirSync(dir, { recursive: true });
  const json = path.join(dir, "sesion-finales-intensiva.json");
  const sql = path.join(dir, "sesion-finales-intensiva.sql");
  fs.writeFileSync(json, JSON.stringify({ profesor_id: PROFESOR_ID, planes: [plan] }, null, 2));
  fs.writeFileSync(sql, aSQL(plan));
  console.log(plan.items.length + " renglones (" + plan.ejercicios.length + " ejercicios)");
  console.log("Escritos:\n  " + path.relative(RAIZ, json) + "\n  " + path.relative(RAIZ, sql));
}
