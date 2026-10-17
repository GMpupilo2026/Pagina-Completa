/* ===== Sesión intensiva de estrategia: conservar una ventaja pequeña =====
 *
 * Arma un plan de clase (planes.html y la clase en vivo) con diez posiciones
 * de partidas reales en las que un bando tiene una ventaja pequeña —a veces ni
 * siquiera de material— y hay UNA jugada que la conserva; las demás, aunque
 * parezcan normales, la dejan escapar. Lo que se entrena es el juicio
 * justificado: qué pieza está mal, qué cambiar, en qué color jugar, dónde está
 * la segunda debilidad.
 *
 * NINGUNA POSICIÓN SE INVENTA: salen de «Una clase al día» (partidas leídas
 * jugada a jugada y ejercicios contrastados con Stockfish 16) y una de «Ganar
 * con poco» (Lichess, comprobada con Stockfish). Se eligieron por lo que dice
 * el motor, no por el título del ejercicio: de unas 150 candidatas de los
 * bloques de estrategia quedaron las que tienen una sola jugada que conserva
 * la ventaja, y se descartaron las que en realidad son una combinación.
 *
 * Lo que comparte con las otras sesiones intensivas (leer el banco, la
 * chuleta, el SQL) está en herramientas/lib/sesion-intensiva.js, con lo que
 * significa cada campo. Lo que se afirma lo comprueba Stockfish con
 * `node herramientas/sesion-intensiva-motor.js estrategia` y lo exige
 * verificar-sesiones-intensivas.js en cada CI.
 *
 * Uso:  npm install
 *       node herramientas/sesion-estrategia-intensiva.js
 * Escribe herramientas/planes/sesion-estrategia-intensiva.json y .sql.
 */
"use strict";
const { crear } = require("./lib/sesion-intensiva");

const EJERCICIOS = [
  {
    banco: "gp:GP-6", nombre: "Cambiar la pieza que defiende", minutos: 5,
    extra: ["c4", "a3", "c5", "a2"],
    unicas: [0],
    trampas: [
      { jugada: 0, san: "a3", refuta: ["Ba2"], resultado: "escapa" },
      { jugada: 0, san: "f4", refuta: ["Ba2"], resultado: "escapa" },
    ],
    explicacion:
      "Final de alfiles con el material igualado. La pregunta estratégica es qué pieza de cada bando hace el " +
      "trabajo importante. La carta ganadora del negro son sus peones de a5 y a4: si llegan a a1, coronan. ¿Quién " +
      "los frena? Solo el alfil blanco de g8, que desde la diagonal g8-a2 vigila a2.\n" +
      "40...Af7! ÚNICA. Ofrece el cambio justo del alfil que defiende. Si 41.Axf7 Rxf7, el final de peones está " +
      "ganado: los peones de a corren solos (42.c4 a3 43.c5 a2) y ya no hay quien los frene. Y si el blanco no " +
      "cambia (41.c4), 41...a3 y el alfil de f7 le tapa la diagonal: el peón corre igual.\n" +
      "Las trampas: 40...a3? (empujar ya) 41.Aa2 y el alfil se pone delante de los peones: la ventaja se " +
      "escapa. 40...f4? 41.Aa2, lo mismo.\n" +
      "La lección: en un final, la pieza que importa no es la más activa sino la que frena tu plan. Cámbiala, " +
      "aunque los dos alfiles valgan lo mismo.",
  },
  {
    banco: "ucd:ej277-r0", nombre: "El caballo sin casillas", minutos: 7, hasta: 14,
    unicas: [0, 2, 6, 8, 12],
    trampas: [
      { jugada: 0, san: "Kf3", refuta: [], resultado: "escapa" },
      { jugada: 0, san: "h5+", refuta: [], resultado: "escapa" },
      { jugada: 6, san: "Kg4", refuta: ["Bd7+"], resultado: "escapa" },
      { jugada: 12, san: "Nd2", refuta: [], resultado: "escapa" },
    ],
    explicacion:
      "Material igualado, pero el blanco tiene ventaja: todos los peones negros están en casillas blancas (a6, " +
      "b5, c6, d5), las del alfil negro, que queda «malo» porque sus propios peones le tapan el paso. El peón de " +
      "c5 le quita además b6 y d6. El problema blanco es el caballo de d3: no tiene ninguna casilla para entrar " +
      "(e5 la cuida el peón de f6).\n" +
      "44.Ce1! ÚNICA. El caballo da la vuelta para llegar a f3. 45.Cf3! ÚNICA. Desde ahí apoya la ruptura g4-g5, " +
      "que va a abrir el flanco de rey.\n" +
      "44...Ad7 45.Cf3 Ae8 46.g5 hxg5+ 47.hxg5! ÚNICA fxg5+ 48.Cxg5! ÚNICA. Con la ruptura desapareció el peón " +
      "de f6, el que cuidaba e5. 48...Rf6 49.Cf3 Ah5 50.Ce5! ÚNICA: el caballo llegó a su casilla ideal, ataca " +
      "c6 y el alfil negro no tiene nada que atacar.\n" +
      "Las trampas: 44.Rf3? o 44.h5+? (mover el rey o los peones sin mejorar al caballo): el caballo sigue sin " +
      "casillas y la ventaja se escapa. 47.Rg4? Ad7+ y el negro se libera. 50.Cd2? (otra vez lejos) y el blanco " +
      "ya no progresa.\n" +
      "La lección: cuando una pieza no tiene casillas, el plan es llevarla a donde las tenga, aunque cueste " +
      "varias jugadas. Y a veces hay que abrir una ruptura de peones para crearle esa casilla.",
  },
  {
    banco: "ucd:ej294-r0", nombre: "El rey por las casillas débiles", minutos: 6, hasta: 15,
    unicas: [0],
    trampas: [
      { jugada: 0, san: "Kg5", refuta: ["g3"], resultado: "escapa" },
      { jugada: 0, san: "f3", refuta: ["gxf3"], resultado: "escapa" },
    ],
    explicacion:
      "Caballo contra alfil con el material igualado. La clave está en el color de las casillas: los peones " +
      "blancos de d4 y b2 están en casillas negras, las mismas de su alfil (un alfil malo), y el peón negro de " +
      "d5 fija a d4. Las casillas blancas del centro y del flanco de rey (e4, f5, g4) no las puede cuidar ni un " +
      "peón ni el alfil blanco.\n" +
      "45...Rf5! ÚNICA. El rey entra por las casillas blancas, donde el alfil nunca lo va a molestar, y desde " +
      "f5 apoya ...Ce4 y ...Rg4. El objetivo es el peón de g2.\n" +
      "La trampa: 45...Rg5? parece lo mismo, pero 46.g3 y el blanco cambia su peón débil: la ventaja se " +
      "escapa. Y 45...f3? 46.gxf3 regala el peón de f, y la ventaja también se escapa.\n" +
      "46.Ae1 Cf6 47.Ah4 Ce4 48.Ae1 Rg4 49.Re2 Cg3+ 50.Rd3 Cf5 51.Af2 Ch4 52.a5 Cxg2: el caballo cae sobre g2 " +
      "y el peón de f queda libre. El rey y el caballo trabajaron juntos sobre las casillas que el alfil no " +
      "podía cubrir.\n" +
      "La lección: frente a un alfil malo, juega en las casillas del otro color. Ahí tu rey y tu caballo no " +
      "tienen rival.",
  },
  {
    banco: "ucd:ej326-r0", nombre: "Un peón de menos y gana", minutos: 6, hasta: 13,
    unicas: [0, 4],
    trampas: [
      { jugada: 0, san: "Nc3", refuta: [], resultado: "escapa" },
      { jugada: 0, san: "Kc5", refuta: ["Nc8"], resultado: "escapa" },
      { jugada: 4, san: "g6", refuta: [], resultado: "escapa" },
    ],
    explicacion:
      "El blanco tiene un peón de más (cuatro contra tres) y aun así está perdido. Las razones son de posición, " +
      "no de material: el caballo blanco está fuera de juego en a7, el rey blanco está lejos de d1 (la casilla " +
      "de coronación) y el negro tiene un peón pasado en d4 con su rey y su caballo al lado.\n" +
      "1...d3! ÚNICA. El peón avanza YA, antes de que llegue el rey blanco (Rf1-e1). Si el negro se distrae, el " +
      "rey blanco se pone delante del peón y el caballo vuelve.\n" +
      "2.Rf1 Cc3 (cubre e2 y d1, las casillas por donde el rey blanco quería ponerse delante del peón) 3.Re1 " +
      "Rd4! ÚNICA. El rey acompaña al peón. 4.Rd2 Ce4+ 5.Rc1 Cd6 6.Rd2 Cc4+ 7.Rc1 d2+ y el peón llega: el " +
      "caballo blanco sigue lejos.\n" +
      "Las trampas: 1...Cc3? (primero el caballo) deja que el blanco se reorganice: la ventaja se escapa. " +
      "1...Rc5?, para encerrar al caballo de a7: 2.Cc8 y el caballo se salva. 3...g6? pierde un tiempo y la " +
      "ventaja se escapa.\n" +
      "La lección: un peón de más no vale nada si tus piezas están lejos. Cuenta los tiempos: peón pasado, rey " +
      "cerca y piezas rivales lejos es una ventaja que decide.",
  },
  {
    banco: "ucd:ej212-r0", nombre: "Fijar los peones en el color del alfil", minutos: 8, hasta: 16,
    /* La ventaja de partida es la más chica de la sesión (Stockfish: algo más
       de medio peón), pero 33.d4 es igual de única: todas las demás dan
       igualdad o peor. */
    umbral: { gana: 50, noGana: 10 },
    unicas: [0, 10, 12],
    trampas: [
      { jugada: 0, san: "Kd2", refuta: ["d4"], resultado: "escapa" },
      { jugada: 0, san: "f5", refuta: ["d4+"], resultado: "escapa" },
      { jugada: 10, san: "g4", refuta: ["hxg4"], resultado: "escapa" },
      { jugada: 12, san: "f7+", refuta: ["Kxf7"], resultado: "pierde" },
    ],
    explicacion:
      "Caballo contra alfil con peones en los dos flancos: según la regla general, el alfil debería ser mejor. " +
      "Además el negro amenaza ...d4+ o ...c4 para conseguir un peón pasado. La ventaja blanca es pequeña (algo " +
      "más de medio peón) y una sola jugada la conserva: la que cambia la evaluación.\n" +
      "33.d4! ÚNICA. Si 33...c4 (lo que se jugó), los peones negros c4 y d5 quedan fijos en casillas blancas, " +
      "las de su propio alfil: el alfil queda malo, y los peones blancos d4, e5 y f4, en casillas negras, quedan " +
      "fuera de su alcance para siempre. Si 33...cxd4+ 34.Rxd4, el rey blanco se instala delante del peón " +
      "aislado de d5.\n" +
      "Las trampas: 33.Rd2? o 33.f5? dejan jugar 33...d4, y el negro tiene un peón pasado protegido: la ventaja " +
      "se escapa.\n" +
      "33...c4 34.f5 (abre una segunda debilidad en el flanco de rey) g5 35.h4 f6 36.hxg5 fxg5 37.Cg1 Ad7 " +
      "38.f6+! ÚNICA. El peón entra con jaque: queda pasado, protegido por e5, y ata al rey negro. 38.g4? hxg4 y " +
      "la ventaja se escapa.\n" +
      "38...Re8 39.Cf3! ÚNICA. El caballo va hacia g5 y h4, a atacar los peones fijos. 39.f7+? Rxf7 regala el " +
      "peón que ataba al rey: la ventaja pasa al negro. 39...g4 40.Ch4 Ae6, y el caballo entra por g6 y f4 " +
      "contra h5 y d5.\n" +
      "La lección: no basta con contar las piezas; mira en qué color quedan los peones. Fijar los peones del " +
      "rival en el color de su alfil lo vuelve malo, y entonces el caballo es mejor.",
  },
  {
    banco: "ucd:ej232-r0", nombre: "Qué cambiar: pasar a un final mejor", minutos: 7, hasta: 10,
    unicas: [0],
    trampas: [
      { jugada: 0, san: "Be4", refuta: ["Re6"], resultado: "escapa" },
      { jugada: 0, san: "a6", refuta: ["gxf5"], resultado: "pierde" },
      { jugada: 0, san: "Bxg6", refuta: ["fxg6"], resultado: "pierde" },
    ],
    explicacion:
      "Material igualado. El negro acaba de jugar ...g6 y ataca el alfil de f5: hay que decidir si se retira o " +
      "se cambia. La pregunta correcta no es «¿cuánto vale cada pieza?», sino «¿qué final queda después?».\n" +
      "27.Axd7! ÚNICA. Se cambia el alfil por el caballo y queda un final de torres muy favorable: la torre " +
      "blanca entra por la columna f (Tf1-f6) contra los peones débiles f7, g6 y h6, el peón de a5 fija a b7 y " +
      "el rey negro queda lejos del flanco de rey.\n" +
      "27...Txd7 28.Tf1 Rb8 29.Tf6 Ra7 30.h5! Ra6 31.g5! hxg5: con las rupturas h5 y g5 el blanco abre el " +
      "flanco de rey, donde su torre ya está activa.\n" +
      "Las trampas: 27.Ae4? (retirar el alfil, lo «natural») 27...Te6 y el caballo negro sigue en juego: la " +
      "ventaja se escapa. 27.a6? o 27.Axg6? pierden el alfil: 27...gxf5 o 27...fxg6.\n" +
      "La lección: cambiar no es bueno ni malo en sí. Es bueno cuando el final que queda es mejor que la " +
      "posición de ahora: antes de cambiar, mira qué torre y qué rey quedan más activos.",
  },
  {
    banco: "ucd:ej238-r0", nombre: "Las dos debilidades", minutos: 8, hasta: 12,
    unicas: [0],
    trampas: [
      { jugada: 0, san: "Ke3", refuta: ["Bd4+"], resultado: "escapa" },
      { jugada: 0, san: "Rxd6+", refuta: ["cxd6"], resultado: "pierde" },
      { jugada: 0, san: "g4", refuta: ["hxg4+"], resultado: "pierde" },
    ],
    explicacion:
      "Alfiles de distinto color: con solo alfiles y peones esto sería tablas casi siempre. Pero con torres, el " +
      "bando que ataca tiene ventaja, porque el alfil del defensor no puede cuidar las casillas del otro color. " +
      "El negro tiene debilidades en los dos flancos: g6 (en casilla blanca, la del alfil blanco) y los peones " +
      "de a5, c5 y c7 en el flanco de dama.\n" +
      "44.Td5! ÚNICA. La torre se activa por la quinta fila: desde g5 ataca g6 junto con el alfil de e4, y la " +
      "torre negra queda atada a su defensa (44...Tg7).\n" +
      "44...Tg7 45.Tg5 Ad2 46.Re2 Ac3 47.Rd3 Ae1 48.Rc4 Rf7 49.Rb5 Ac3. Con el flanco de rey atado, el rey " +
      "blanco cruza al flanco de dama a comerse a5. Es el principio de las dos debilidades: una sola no alcanza " +
      "para ganar; dos, en flancos distintos, sí, porque el defensor no puede cubrir las dos.\n" +
      "Las trampas: 44.Re3? (centralizar el rey) 44...Ad4+ y el negro se activa: la ventaja se escapa. " +
      "44.Txd6+? cxd6 regala la torre por un peón. 44.g4? hxg4+ abre el flanco de rey a favor del negro.\n" +
      "La lección: con alfiles de distinto color y torres, ataca en las casillas del color de tu alfil y busca " +
      "una segunda debilidad en el otro flanco.",
  },
  {
    banco: "ucd:ej232-t1", nombre: "Atacar en el color de tu alfil", minutos: 7, hasta: 3,
    extra: ["Bc2", "Qxb2"],
    unicas: [0],
    trampas: [
      { jugada: 0, san: "Rfd8", refuta: [], resultado: "escapa" },
      { jugada: 0, san: "Ne4", refuta: [], resultado: "escapa" },
    ],
    explicacion:
      "Medio juego con el material igualado. El alfil negro de b7 es de casillas blancas, y alrededor del rey " +
      "blanco las casillas blancas solo las cuidan peones: el alfil de b2 es de casillas negras y el de b3 está " +
      "lejos. En el medio juego, los alfiles de distinto color favorecen al que ataca.\n" +
      "1...Dc6! ÚNICA. Dama y alfil en la gran diagonal: amenaza 2...Dxg2 mate. El blanco tiene que tapar o " +
      "defender g2, y cualquier respuesta deja algo débil.\n" +
      "2.f3 (debilita e3 y la diagonal a2-g8) Db5. La dama ataca ahora la torre de f1, y si el alfil se retira " +
      "con 3.Ac2, 3...Dxb2 se come el alfil de b2: la columna b quedó abierta. Si 2.e4, 2...Db5 igual.\n" +
      "Las trampas: 1...Tfd8? o 1...Ce4? son jugadas «normales» de desarrollo o de cambio: no amenazan nada y " +
      "la ventaja se escapa.\n" +
      "La lección: con alfiles de distinto color en el medio juego, ataca en el color de tu alfil, donde el " +
      "rival no tiene con qué defenderse. Una amenaza directa lo obliga a crear debilidades.",
  },
  {
    banco: "ucd:ej210-t2", nombre: "El sacrificio de calidad", minutos: 8, hasta: 4,
    extra: ["c5"],
    unicas: [0, 2],
    trampas: [
      { jugada: 0, san: "c5", refuta: ["Qh4"], resultado: "escapa" },
      { jugada: 2, san: "d5", refuta: ["Qf4"], resultado: "pierde" },
    ],
    explicacion:
      "Material igualado. El rey blanco está enrocado, pero de sus piezas solo lo defiende el caballo de f3. Si " +
      "ese caballo desaparece, los peones del enroque quedan rotos para siempre.\n" +
      "1...Txf3! ÚNICA. Se entrega la calidad (torre por caballo). A cambio, después de 2.gxf3, el blanco tiene " +
      "los peones doblados en f2 y f3, el de h3 queda débil y las casillas blancas junto a su rey (g4, h3) " +
      "quedan sin defensa.\n" +
      "2...Ce5! ÚNICA. El caballo va a la casilla desde donde ataca f3 y g4; el alfil de c8 apunta a h3 y la " +
      "dama se suma por la columna f. 3.Rg2 c5, que echa a la dama blanca del centro: el negro tiene un ataque " +
      "duradero aunque tiene una calidad de menos.\n" +
      "Las trampas: 1...c5? (echar a la dama primero) 2.Dh4 y el blanco ofrece el cambio de damas: sin damas no " +
      "hay ataque y la ventaja se escapa. 2...d5? 3.Df4 y el blanco se reorganiza: la ventaja pasa al blanco.\n" +
      "La lección: un sacrificio de calidad posicional no busca un mate inmediato. Compra una ventaja que dura " +
      "(un enroque roto, una casilla para el caballo) y que el rival ya no puede arreglar.",
  },
  {
    banco: "ucd:ej341-t3", nombre: "Un caballo por la iniciativa", minutos: 10, hasta: 2,
    extra: ["e4", "exf5", "exd5"],
    unicas: [0],
    trampas: [
      { jugada: 0, san: "Rxd5", refuta: ["exd5"], resultado: "escapa" },
      { jugada: 0, san: "Bxd5", refuta: ["exd5"], resultado: "escapa" },
      { jugada: 1, san: "exf5", refuta: ["Bxd5"], resultado: "castiga" },
    ],
    explicacion:
      "Medio juego con el material igualado. El alfil negro de d5 está bien centralizado, pero el rey negro " +
      "tiene poca defensa: el caballo de f6 es la única pieza cerca, y la gran diagonal (Ab2 y Dc3) ya apunta a " +
      "f6 y g7.\n" +
      "1.Cf5! ÚNICA. El caballo se ofrece en f5: amenaza entrar en g7, d6 o e7 (con jaque), y si el negro lo " +
      "come se abren líneas contra su dama.\n" +
      "Si 1...exf5? 2.Axd5! y el alfil ataca la dama de b7, con la torre de a8 detrás: el negro pierde " +
      "material.\n" +
      "Lo mejor para el negro es 1...Rh8, que aparta el rey de la diagonal y de los jaques. Entonces 2.e4! ataca " +
      "al alfil de d5: 2...exf5 3.exd5 y el blanco recupera la pieza, con un peón pasado en d5 y la diagonal " +
      "larga abierta contra el rey negro. En la partida se jugó 2.Cxg7, también bueno pero menos preciso.\n" +
      "Las trampas: 1.Txd5? exd5 o 1.Axd5? exd5 cambian la pieza más activa del negro, pero no consiguen nada " +
      "más: la ventaja se escapa.\n" +
      "La lección: un sacrificio posicional no siempre se acepta. Lo que importa es que, se acepte o no, las " +
      "piezas del rival quedan peor que antes.",
  },
];

module.exports = crear({
  slug: "estrategia",
  titulo: "Estrategia · Sesión intensiva: conservar una ventaja pequeña",
  notas: "Sesión intensiva de juicio estratégico: diez posiciones de partidas reales («Una clase al día» y " +
         "«Ganar con poco») con una ventaja pequeña y una sola jugada que la conserva. Cada ejercicio trae la " +
         "chuleta (plan, línea, jugada única y trampas) y la nota con la explicación. Todo comprobado con " +
         "Stockfish 16.",
  /* Acá «gana» quiere decir «conserva la ventaja»: al menos +0,7. Una jugada
     «no gana» si deja menos de +0,6; las trampas que «pierden» dejan al rival
     con −0,7 o peor. Son ventajas de estrategia, no finales ganados: los
     números son chicos a propósito, y por eso cada única exige que TODAS las
     demás jugadas legales queden por debajo. */
  umbral: { gana: 70, noGana: 60 },
  resultados: { escapa: "se escapa la ventaja", pierde: "la ventaja pasa al rival", castiga: "el rival pierde material" },
  conOrigen: true,
  consigna: (ej, a) => (a.fen.split(" ")[1] === "w" ? "Juegan las blancas" : "Juegan las negras") +
    ", con ventaja. ③ " + ej.minutos + " min en papel: qué decide, el plan y la jugada.",
  intro:
    "Diez posiciones de partidas reales (de «Una clase al día», las clases del MI Ángel Martín, y de «Ganar " +
    "con poco») en las que un bando tiene una ventaja pequeña —a veces ni siquiera de material— y hay UNA " +
    "jugada que la conserva. Las demás, aunque parezcan normales, la dejan escapar. Lo que se entrena no es la " +
    "táctica sino el juicio: qué pieza está mal, qué cambiar, en qué color jugar, dónde está la segunda " +
    "debilidad. Cada afirmación de las notas (cuál es la única, qué jugada deja escapar la ventaja) está " +
    "comprobada con Stockfish 16.\n" +
    "Cada ejercicio, unos 10-12 minutos:\n" +
    "1. Al tablero. Nadie mueve piezas.\n" +
    "2. En silencio y en papel, tres respuestas: ¿qué decide en esta posición (una pieza mala, una casilla, " +
    "una debilidad, un peón pasado)? ¿Cuál es el plan? ¿Con qué jugada empieza? La jugada sin el plan no " +
    "vale.\n" +
    "3. En voz alta: dos o tres explican su plan. Tú haces de rival y contestas a la jugada tentadora (está en " +
    "el renglón, en «Trampa»).\n" +
    "4. La explicación: la nota «El cálculo» que va debajo.\n" +
    "5. Práctica: cada uno juega desde la posición, contra ti o contra el motor, con la consigna de conservar " +
    "la ventaja.\n" +
    "Del 1 al 7 son finales y posiciones simplificadas, donde la estrategia se ve más limpia; del 8 al 10, " +
    "medio juego. La regla de la sesión: antes de buscar la jugada, nombrar la ventaja.",
  cierre:
    "Lo que tiene que quedar, en una frase por ejercicio:\n" +
    "1. La pieza que importa es la que frena tu plan: cámbiala.\n" +
    "2. Una pieza sin casillas se lleva a donde las tenga, aunque cueste varias jugadas.\n" +
    "3. Frente a un alfil malo, juega en las casillas del otro color.\n" +
    "4. Un peón de más no vale si tus piezas están lejos: cuenta los tiempos.\n" +
    "5. Fija los peones del rival en el color de su alfil.\n" +
    "6. Cambia cuando el final que queda es mejor que la posición de ahora.\n" +
    "7. Una debilidad no alcanza; dos, en flancos distintos, sí.\n" +
    "8. Con alfiles de distinto color en el medio juego, ataca en el color de tu alfil.\n" +
    "9. Un sacrificio de calidad posicional compra una ventaja que no se arregla.\n" +
    "10. Un sacrificio posicional sirve aunque no lo acepten, si las piezas rivales quedan peor.\n" +
    "Para la casa: en «Una clase al día» están las lecciones completas de estas partidas, y en «Ganar con " +
    "poco», el curso sobre cómo cobrar ventajas pequeñas.",
  ejercicios: EJERCICIOS,
});

if (require.main === module) module.exports.escribir();
