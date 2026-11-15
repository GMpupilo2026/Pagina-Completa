/* Aula de Arbitraje — las fichas de los números 2 al 18 de la revista
   «Arbitraje de Ajedrez», revisados y actualizados a la normativa FIDE vigente
   (noviembre de 2026) por IA Oscar Angulo Cubero.

   Se suma a js/aula-arbitraje/contenido.js (el N.º 1): carga después de él y
   agrega sus colecciones, fichas, preguntas y casos a AULA_CONTENIDO. Mismo
   formato que contenido.js; lo revisa herramientas/verificar-aula-arbitraje.js.
   Ver «Aula de Arbitraje» en docs/decisiones/juegos-y-torneos.md. */
(function (raiz) {
    "use strict";
    const C = raiz.AULA_CONTENIDO;
    if (!C) return;
    const REVISTAS = {
 "colecciones": [
  {
   "id": "revista-2",
   "titulo": "Revista Arbitraje de Ajedrez · N.º 2",
   "nota": "Actualizada a la normativa FIDE vigente (noviembre de 2026)"
  },
  {
   "id": "revista-3",
   "titulo": "Revista Arbitraje de Ajedrez · N.º 3",
   "nota": "Actualizada a la normativa FIDE vigente (noviembre de 2026)"
  },
  {
   "id": "revista-4",
   "titulo": "Revista Arbitraje de Ajedrez · N.º 4",
   "nota": "Actualizada a la normativa FIDE vigente (noviembre de 2026)"
  },
  {
   "id": "revista-5",
   "titulo": "Revista Arbitraje de Ajedrez · N.º 5",
   "nota": "Actualizada a la normativa FIDE vigente (noviembre de 2026)"
  },
  {
   "id": "revista-6",
   "titulo": "Revista Arbitraje de Ajedrez · N.º 6",
   "nota": "Actualizada a la normativa FIDE vigente (noviembre de 2026)"
  },
  {
   "id": "revista-7",
   "titulo": "Revista Arbitraje de Ajedrez · N.º 7",
   "nota": "Actualizada a la normativa FIDE vigente (noviembre de 2026)"
  },
  {
   "id": "revista-8",
   "titulo": "Revista Arbitraje de Ajedrez · N.º 8",
   "nota": "Actualizada a la normativa FIDE vigente (noviembre de 2026)"
  },
  {
   "id": "revista-9",
   "titulo": "Revista Arbitraje de Ajedrez · N.º 9",
   "nota": "Actualizada a la normativa FIDE vigente (noviembre de 2026)"
  },
  {
   "id": "revista-10",
   "titulo": "Revista Arbitraje de Ajedrez · N.º 10",
   "nota": "Actualizada a la normativa FIDE vigente (noviembre de 2026)"
  },
  {
   "id": "revista-11",
   "titulo": "Revista Arbitraje de Ajedrez · N.º 11",
   "nota": "Actualizada a la normativa FIDE vigente (noviembre de 2026)"
  },
  {
   "id": "revista-12",
   "titulo": "Revista Arbitraje de Ajedrez · N.º 12",
   "nota": "Actualizada a la normativa FIDE vigente (noviembre de 2026)"
  },
  {
   "id": "revista-13",
   "titulo": "Revista Arbitraje de Ajedrez · N.º 13",
   "nota": "Actualizada a la normativa FIDE vigente (noviembre de 2026)"
  },
  {
   "id": "revista-14",
   "titulo": "Revista Arbitraje de Ajedrez · N.º 14",
   "nota": "Actualizada a la normativa FIDE vigente (noviembre de 2026)"
  },
  {
   "id": "revista-15",
   "titulo": "Revista Arbitraje de Ajedrez · N.º 15",
   "nota": "Actualizada a la normativa FIDE vigente (noviembre de 2026)"
  },
  {
   "id": "revista-16",
   "titulo": "Revista Arbitraje de Ajedrez · N.º 16",
   "nota": "Actualizada a la normativa FIDE vigente (noviembre de 2026)"
  },
  {
   "id": "revista-17",
   "titulo": "Revista Arbitraje de Ajedrez · N.º 17",
   "nota": "Actualizada a la normativa FIDE vigente (noviembre de 2026)"
  },
  {
   "id": "revista-18",
   "titulo": "Revista Arbitraje de Ajedrez · N.º 18",
   "nota": "Actualizada a la normativa FIDE vigente (noviembre de 2026)"
  }
 ],
 "fichas": [
  {
   "id": "promocion-coronacion",
   "coleccion": "revista-2",
   "titulo": "Promoción o coronación",
   "articulos": "Leyes 2023 · arts. 3.7.3.3-3.7.3.5, 4.4.4, 4.6, 4.7.3, 6.11.2, 7.5.2, 7.5.4, 7.5.5, A.5.4",
   "resumen": "Cómo se promociona un peón, qué pieza queda elegida y qué hace el árbitro con la torre invertida, el peón sin cambiar o la pieza que falta.",
   "claves": [
    "El peón se cambia por dama, torre, alfil o caballo de su color; la elección no depende de las piezas capturadas (3.7.3.3-3.7.3.4).",
    "La pieza queda elegida cuando toca la casilla de promoción (4.4.4).",
    "El peón no tiene que llegar a la casilla de promoción y quitarlo o poner la pieza puede hacerse en cualquier orden (4.6.1-4.6.2).",
    "Si falta la pieza, el jugador detiene el reloj y se la pide al árbitro (6.11.2).",
    "Pulsar el reloj con el peón sin cambiar es jugada ilegal: el peón pasa a ser dama y el rival recibe 2 minutos (7.5.2 y 7.5.5).",
    "Una torre invertida es una torre, aunque se diga «dama» (Manual del Árbitro 2026)."
   ],
   "contenido": "\n<h3>Qué dice la norma</h3>\n<div class=\"aula-norma\"><b>Arts. 3.7.3.3 a 3.7.3.5</b> El peón que llega a la fila más alejada se cambia, en la misma jugada, por una dama, torre, alfil o caballo nuevo de su color, en la casilla de llegada. La elección no se limita a las piezas capturadas y el efecto de la nueva pieza es inmediato.</div>\n<div class=\"aula-norma\"><b>Art. 4.4.4</b> La pieza queda elegida cuando toca la casilla de promoción.</div>\n<div class=\"aula-norma\"><b>Art. 4.6</b> El peón no tiene que colocarse en la casilla de llegada (4.6.1); quitar el peón y poner la nueva pieza puede hacerse en cualquier orden (4.6.2); si en la casilla hay una pieza rival, debe capturarse (4.6.3).</div>\n<div class=\"aula-norma\"><b>Art. 4.7.3</b> La promoción está hecha cuando la mano soltó la nueva pieza en la casilla y el peón ya salió del tablero.</div>\n<div class=\"aula-norma\"><b>Art. 6.11.2</b> El jugador puede detener el reloj para pedir ayuda al árbitro, por ejemplo cuando la pieza que necesita no está disponible.</div>\n<div class=\"aula-norma\"><b>Arts. 7.5.2, 7.5.4 y 7.5.5</b> Pulsar el reloj con el peón sin cambiar es jugada ilegal y el peón se cambia por una dama. Mover con las dos manos y pulsar se sanciona igual. Primera jugada ilegal: 2 minutos para el rival; segunda: pierde (salvo que el rival no pueda dar mate: tablas).</div>\n<div class=\"aula-norma aula-norma-aviso\"><b>Rápidas y relámpago.</b> La sanción es de 1 minuto (A.3). Sin supervisión adecuada, si el árbitro ve un peón en la última fila, espera a que se complete la jugada siguiente; si la posición ilegal sigue, declara tablas (A.5.4).</div>\n<h3>Casos de sala</h3>\n<p><b>Torre invertida.</b> Es una torre aunque el jugador diga «dama» (Manual del Árbitro 2026). Si la mueve en diagonal, es jugada ilegal. El árbitro que la vea la pone derecha con la mínima molestia; no hay que reconstruir nada.</p>\n<p><b>Caballo acostado.</b> Es un caballo: se le pide al jugador que lo coloque bien.</p>\n<p><b>Peón sin cambiar, dos peones juntos, peón con un gorro, una moneda.</b> Ninguno es una pieza posible: si el jugador pulsó el reloj así, se aplica el art. 7.5.2 (dama) y la sanción del 7.5.5.</p>\n<p><b>Sacar el peón de séptima y poner la dama en octava.</b> Es válido desde las Leyes de 2014 (4.6.1). La edición original de 2012 lo daba por ilegal.</p>\n<p><b>Exigirle al rival la pieza capturada.</b> El rival no está obligado a darla: la pide el árbitro, que conviene que lleve una pieza de cada tipo y color.</p>\n<div class=\"aula-nota\">Si te falta la pieza: detén el reloj, pídesela al árbitro y, cuando la tengas, sigue pensando. No estás obligado a promocionar a la pieza que pediste.</div>\n"
  },
  {
   "id": "siete-cartas",
   "coleccion": "revista-2",
   "titulo": "Juego de arbitraje: las siete cartas",
   "articulos": "Leyes 2023 · arts. 5.2.3, 6.9, 6.10, 6.11, 8.4, 9.1.2.1, 11.3.2, 12.5, 12.7",
   "resumen": "Un método para ordenar la evidencia cuando te llaman a una mesa, con dos casos resueltos: unas tablas con un reloj mal puesto y un teléfono que suena.",
   "claves": [
    "El árbitro es conciliador, detective y juez, en ese orden.",
    "La primera carta es siempre la versión de los jugadores; si no coinciden, es palabra contra palabra.",
    "No se tocan las piezas ni se deja correr el reloj mientras se investiga.",
    "Las bases del torneo no las cambia el árbitro: si dicen que hay incremento, no se quita (6.10.2 para corregir el reloj).",
    "Tablas por acuerdo: válidas si ambos hicieron al menos una jugada (5.2.3); rey y caballo sí pueden dar mate con una serie de jugadas legales.",
    "Aparato electrónico encima: pierde y el rival gana siempre, aunque no tenga material (11.3.2.2), salvo sanción menor prevista en las bases."
   ],
   "contenido": "\n<h3>Las siete cartas</h3>\n<div class=\"aula-tabla\"><table>\n<tr><th>Carta</th><th>Qué buscar</th><th>Normas</th></tr>\n<tr><td>1. Versión de los jugadores</td><td>Siempre primero. Solo vale si las dos versiones coinciden.</td><td>4.8, 12.1</td></tr>\n<tr><td>2. Posición</td><td>Que nadie toque las piezas.</td><td>7.5.1, 7.6</td></tr>\n<tr><td>3. Reloj</td><td>Tiempos, banderas, contador; detenerlo.</td><td>6.10.1, 6.10.2, 6.11.1</td></tr>\n<tr><td>4. Planillas</td><td>Para reconstruir y comprobar jugadas ilegales.</td><td>8.1, 8.4, 8.5; A.2 en rápidas</td></tr>\n<tr><td>5. Reglamentos</td><td>Qué dicen las Leyes y las bases.</td><td>Leyes 2023 y bases</td></tr>\n<tr><td>6. Intervención de un extraño</td><td>Solo si alguien ajeno intervino.</td><td>12.7</td></tr>\n<tr><td>7. Conflictos externos</td><td>Temblores, apagones, problemas del local.</td><td>6.11.1, 6.11.3, 12.5</td></tr>\n</table></div>\n<h3>Caso 1: las tablas con un reloj mal puesto</h3>\n<p>Rápidas a 15 min + 5 s. El árbitro pone un reloj de 5 minutos sin incremento a una partida que empezó sin reloj. Las negras reclaman el incremento y el árbitro lo niega; luego ofrecen tablas («con rey y caballo no me puedes dar mate») y las blancas aceptan.</p>\n<div class=\"aula-norma\"><b>Arts. 9.1.2.1 y 5.2.3</b> La oferta no se puede retirar y vale hasta que el rival la acepte o la rechace; el acuerdo termina la partida si ambos hicieron al menos una jugada.</div>\n<p><b>Resultado:</b> tablas por acuerdo. Pero la reclamación de las negras era correcta (6.10.2: se pone la programación de las bases) y rey y caballo sí pueden dar mate con una serie de jugadas legales: si a las negras se les caía la bandera, perdían (6.9).</p>\n<h3>Caso 2: el mensaje de texto</h3>\n<div class=\"aula-norma\"><b>Art. 11.3.2.2</b> Si es evidente que el jugador lleva encima un aparato electrónico no autorizado, pierde y el rival gana. Las bases pueden fijar una sanción menor.</div>\n<p><b>Resultado:</b> pierde el jugador del teléfono y el rival gana (1-0 o 0-1), aunque no tenga material para dar mate. Reducirle el tiempo solo vale si las bases lo prevén.</p>\n<div class=\"aula-nota\">La edición original (2012) daba tablas si el rival no podía ganar. Esa excepción desapareció con las Leyes de 2014.</div>\n"
  },
  {
   "id": "desempate-progresivo",
   "coleccion": "revista-2",
   "titulo": "Desempate progresivo (acumulativo)",
   "articulos": "C.07 (2026) · arts. 4.1, 4.2, 4.3, 7.5, 14.1, 14.2",
   "resumen": "La suma de las puntuaciones que tiene el jugador al final de cada ronda, y cómo se aplican los cortes PS-C1 y PS-C2.",
   "claves": [
    "PS = suma de la puntuación del jugador al final de cada ronda (art. 7.5).",
    "Es de tipo B: depende solo de los resultados del propio jugador.",
    "El punto ganado por incomparecencia forma parte de su puntuación.",
    "PS-C1 quita el acumulado de la primera ronda; PS-C2, los de las dos primeras (art. 14).",
    "Cada corte es un desempate distinto y debe estar en la lista publicada antes del torneo (art. 4.1).",
    "Dos jugadores con la misma secuencia de resultados empatan en el PS y en todos sus cortes."
   ],
   "contenido": "\n<h3>Qué dice la norma</h3>\n<div class=\"aula-norma\"><b>Art. 7.5 (PS)</b> Después de cada ronda, el participante tiene una puntuación en el torneo; el desempate suma esas puntuaciones.</div>\n<div class=\"aula-norma\"><b>Arts. 14.1 y 14.2</b> Cut-1 quita el valor menos significativo (en el progresivo, la puntuación después de la primera ronda: PS-C1); Cut-2 quita los dos menos significativos.</div>\n<div class=\"aula-norma aula-norma-aviso\"><b>Arts. 4.1 y 4.2</b> Los desempates son una lista ordenada que se publica antes del inicio. Se aplican en orden, solo al subgrupo que siga empatado; agotada la lista, sorteo (salvo que las bases digan que el empate no se rompe).</div>\n<h3>Cómo se calcula</h3>\n<p><span class=\"aula-formula\">acumulado de la ronda = acumulado anterior + punto de la ronda</span></p>\n<p><span class=\"aula-formula\">PS = suma de los acumulados</span></p>\n<div class=\"aula-tabla\"><table>\n<tr><th>Jugador</th><th>Resultados</th><th>Acumulados</th><th>PS</th><th>PS-C1</th><th>PS-C2</th></tr>\n<tr><td>Torres</td><td>½ ½ 1 ½ ½</td><td>½ 1 2 2½ 3</td><td>9</td><td>8½</td><td>7½</td></tr>\n<tr><td>Hernández</td><td>0 1 1 1 0</td><td>0 1 2 3 3</td><td>9</td><td><b>9</b></td><td>8</td></tr>\n<tr><td>Luna</td><td>0 ½ 1 1 ½</td><td>0 ½ 1½ 2½ 3</td><td>7½</td><td>7½</td><td><b>7</b></td></tr>\n<tr><td>Vega</td><td>0 1 ½ ½ 1</td><td>0 1 1½ 2 3</td><td>7½</td><td>7½</td><td>6½</td></tr>\n</table></div>\n<p>Hernández supera a Torres con PS-C1. Luna y Vega siguen empatadas en PS-C1 y las separa el PS-C2.</p>\n<div class=\"aula-nota\">El progresivo premia a quien gana pronto: perder en la primera ronda cuesta más que perder en la última.</div>\n"
  },
  {
   "id": "decisiones-bajo-presion",
   "coleccion": "revista-2",
   "titulo": "Decisiones arbitrales bajo presión",
   "articulos": "Psicología del deporte (Paula Man Reich) · Leyes 2023, arts. 6.11.1 y 6.11.3",
   "resumen": "Cómo reconocer el estrés del árbitro y qué hacer para decidir con calma.",
   "claves": [
    "El estrés acelera el pulso, dificulta concentrarse y hace sentir que todo pasa más rápido.",
    "Los pensamientos centrados en el resultado o en la opinión ajena aumentan el estrés.",
    "Ante una decisión importante, no te apresures: respira y tómate unos segundos más.",
    "Concéntrate en el aquí y el ahora y en lo que sabes.",
    "El árbitro puede detener el reloj (6.11.1) y decide cuándo se reanuda (6.11.3).",
    "Mantén pensamientos y actitudes positivas y disfruta tu trabajo."
   ],
   "contenido": "\n<h3>Síntomas del estrés</h3>\n<ul><li>El ritmo cardiaco se acelera y cuesta concentrarse en lo importante.</li><li>Todo parece pasar más rápido de lo que pasa.</li><li>Se piensa con menos claridad y cada decisión da miedo.</li><li>Se vuelve uno negativo y autocrítico.</li></ul>\n<h3>Recomendaciones</h3>\n<ul><li>No te apresures: respira, piensa y recién entonces decide.</li><li>Haz lo mejor que puedas con lo que sabes.</li><li>Piensa en el aquí y el ahora, no en el pasado ni en el futuro.</li><li>Cultiva pensamientos y actitudes positivas.</li><li>Disfruta cada experiencia arbitral.</li></ul>\n<div class=\"aula-norma\"><b>Arts. 6.11.1 y 6.11.3</b> Si hay que interrumpir la partida, el árbitro detiene el reloj y decide cuándo se reanuda: tienes el tiempo para escuchar a los dos y decidir con calma.</div>\n"
  },
  {
   "id": "buchholz-rondas-no-jugadas",
   "coleccion": "revista-3",
   "titulo": "Partidas no jugadas en el Buchholz",
   "articulos": "C.07 (2026) · arts. 8.1, 14, 15, 16",
   "resumen": "Cómo cuentan en el Buchholz las incomparecencias, el descanso del emparejamiento y los byes pedidos: el rival ficticio del art. 16.",
   "claves": [
    "Buchholz (art. 8.1): suma de las puntuaciones de los rivales; no se usa en todos contra todos.",
    "Ronda no jugada propia (16.4): rival ficticio con la puntuación final del propio jugador.",
    "Tope en incomparecencias (categorías 2 y 4): la puntuación ajustada del rival programado.",
    "Tope en descanso y byes (categorías 1, 3 y 5): puntos de tablas × número de rondas.",
    "Para el Buchholz de los rivales (16.3): las categorías 1 a 4 cuentan con el resultado asignado; la 5 (bye pedido al final) cuenta como tablas.",
    "El «jugador virtual» con fórmula (2012) rigió hasta el 31-ago-2023."
   ],
   "contenido": "<h3>Qué dice la norma</h3><div class=\"aula-norma\"><b>Art. 8.1</b> Buchholz: la suma de las puntuaciones de cada uno de los rivales de un participante. No se usa en todos contra todos.</div><div class=\"aula-norma\"><b>Art. 16.1</b> Bye solicitado: de medio punto o de cero puntos (las rondas después de un retiro cuentan como bye de cero). VUR: bye solicitado o pérdida por incomparecencia.</div><div class=\"aula-norma\"><b>Art. 16.2</b> Categorías: 1) descanso del emparejamiento o bye de punto completo; 2) victoria por incomparecencia; 3) bye solicitado seguido de al menos una ronda que no sea VUR; 4) pérdida por incomparecencia; 5) bye solicitado seguido solo de VUR o en la última ronda.</div><div class=\"aula-norma\"><b>Art. 16.3</b> Para el desempate de los rivales: categorías 1 a 4, con el resultado asignado; categoría 5, como tablas.</div><div class=\"aula-norma\"><b>Art. 16.4</b> Para el desempate propio: cada ronda no jugada es una partida contra un rival ficticio con la puntuación del propio jugador, sin pasar de la puntuación ajustada del rival programado (incomparecencias) ni de tablas × rondas (los demás casos).</div><div class=\"aula-norma\"><b>Art. 16.5</b> Si hay que cortar el valor menos significativo y el jugador tiene VUR, se corta la menor aportación de esas rondas, siempre que no sea menor que el valor menos significativo.</div><h3>Ejemplos</h3><div class=\"aula-tabla\"><table><tr><th>Caso</th><th>Datos</th><th>Aporte</th></tr><tr><td>Pierde por incomparecencia (cat. 4)</td><td>P termina con 5; el rival programado, con 6</td><td>mín(5; 6) = 5</td></tr><tr><td>Gana por incomparecencia (cat. 2)</td><td>P termina con 6½; el rival programado, con 4</td><td>mín(6½; 4) = 4</td></tr><tr><td>Descanso del emparejamiento (cat. 1)</td><td>7 rondas; P termina con 5½</td><td>mín(5½; 3½) = 3½</td></tr></table></div><div class=\"aula-norma aula-norma-aviso\"><b>Historia.</b> De 2012 a agosto de 2023 se usó el jugador virtual: Svon = SPR + (1 − SfPR) + 0,5 × (n − R), y las incomparecencias de los rivales contaban como tablas. Ya no rige.</div><p class=\"aula-nota\">Fe de erratas de la edición original: un ejemplo daba 3,5 puntos antes de la ronda 4, algo imposible (máximo 3).</p>"
  },
  {
   "id": "posicion-muerta",
   "coleccion": "revista-3",
   "titulo": "Posición muerta",
   "articulos": "Leyes 2023 · arts. 1.5, 5.2.2, 6.9, A.5.3",
   "resumen": "Cuándo ninguno de los dos puede dar mate con ninguna serie de jugadas legales, qué hace el árbitro y qué pasa si cae la bandera.",
   "claves": [
    "Art. 5.2.2: posición muerta = ninguno de los dos puede dar mate con ninguna serie de jugadas legales.",
    "La partida termina en ese mismo momento, si la jugada que la produjo fue legal; no hace falta reclamarla.",
    "Cuenta cualquier serie legal, aunque el rival tenga que colaborar.",
    "Rey contra rey, rey y caballo contra rey y rey y alfil contra rey son posiciones muertas.",
    "Rey y caballo contra rey y caballo no es posición muerta: existe un mate legal.",
    "Art. 6.9: si cae la bandera y el rival no puede dar mate con ninguna serie legal, son tablas."
   ],
   "contenido": "<h3>Qué dice la norma</h3><div class=\"aula-norma\"><b>Art. 5.2.2</b> La partida es tablas cuando se llega a una posición en la que ninguno de los dos jugadores puede dar mate con ninguna serie de jugadas legales. Termina inmediatamente, siempre que la jugada que la produjo fuera legal.</div><div class=\"aula-norma\"><b>Art. 6.9</b> Quien no completa las jugadas en su tiempo pierde, salvo que el rival no pueda darle mate con ninguna serie de jugadas legales: entonces son tablas. (En rápidas sin supervisión adecuada, art. A.5.3).</div><div class=\"aula-norma aula-norma-aviso\"><b>Numeración.</b> En las Leyes de 2009 eran los arts. 5.2.b y 9.6. Hoy el art. 9.6 trata de la quíntuple repetición y las 75 jugadas.</div><h3>Ejemplos típicos</h3><ul><li>Rey contra rey.</li><li>Rey y caballo, o rey y alfil, contra rey.</li><li>Cadenas de peones totalmente bloqueadas en las que ningún rey puede cruzar.</li><li>Alfiles que van por el color de sus propios peones bloqueados, sin posibilidad de capturar ni ser capturados.</li></ul><h3>Lo que no es posición muerta</h3><ul><li>Rey y caballo contra rey y caballo (hay mate legal con el rey encerrado por su propio caballo).</li><li>Peones bloqueados con una torre que puede sacrificarse para abrir la posición.</li></ul><p class=\"aula-nota\">Todas las posiciones de la revista se comprobaron recorriendo todas las posiciones alcanzables con jugadas legales.</p>"
  },
  {
   "id": "padres-en-el-torneo",
   "coleccion": "revista-3",
   "titulo": "Padres y acompañantes en el torneo",
   "articulos": "Leyes 2023 · arts. 11.2.3.3, 11.3.1, 12.2, 12.7, 12.8",
   "resumen": "Recomendaciones de Paula Man Reich para tratar con padres sobreimplicados y las herramientas que dan las Leyes al árbitro.",
   "claves": [
    "Deja claros desde el inicio los deberes y derechos de los padres, iguales para todos.",
    "Art. 11.2.3.3: quien no es jugador ni árbitro entra al área de juego solo con permiso del árbitro.",
    "Art. 12.7: los espectadores no pueden intervenir; el árbitro puede expulsarlos del recinto.",
    "Art. 12.8: sin autorización del árbitro, nadie usa celular en el recinto de juego.",
    "Las sanciones del art. 12.9 son para los jugadores; si el niño recibió ayuda, se analiza el art. 11.3.1.",
    "Confianza, seguridad y perspectiva profesional facilitan el trato con los padres."
   ],
   "contenido": "<h3>Recomendaciones (Paula Man Reich)</h3><ul><li>Dejar claros los deberes y derechos de los padres y las consecuencias si no se cumplen las reglas.</li><li>Aumentar su participación positiva en la actividad del hijo.</li><li>Informarles con veracidad cuando hay un problema.</li><li>Mantener una comunicación eficaz y una perspectiva profesional.</li></ul><h3>Lo que dicen las Leyes</h3><div class=\"aula-norma\"><b>Art. 11.2.3.3</b> Solo con permiso del árbitro puede entrar al área de juego alguien que no sea jugador ni árbitro.</div><div class=\"aula-norma\"><b>Art. 12.7</b> Quien observe una irregularidad solo puede informar al árbitro. Los espectadores no pueden intervenir; el árbitro puede expulsar a los infractores del recinto de juego.</div><div class=\"aula-norma\"><b>Art. 12.8</b> Salvo autorización del árbitro, nadie puede usar celular ni otro medio de comunicación en el recinto de juego ni en las zonas contiguas que el árbitro designe.</div><div class=\"aula-norma aula-norma-aviso\"><b>Sanciones.</b> Las del art. 12.9 se aplican a los jugadores. Si un padre le dio indicaciones a su hijo durante la partida, el caso del jugador se analiza con el art. 11.3.1 (consejos durante la partida).</div>"
  },
  {
   "id": "swiss-manager-configuracion",
   "coleccion": "revista-3",
   "titulo": "Swiss-Manager: qué comprobar",
   "articulos": "C.04.2 (2026) · art. 2.2 · C.07 (2026) · art. 16 · C.02.04",
   "resumen": "Lo que hay que revisar en el programa de emparejamientos antes de un torneo: sistema, desempates, byes y orden inicial.",
   "claves": [
    "La FIDE recomienda programas avalados por ella para los grandes torneos suizos.",
    "Comprueba que la versión empareje con el sistema holandés vigente (C.04.3, versión 2026).",
    "Comprueba que los desempates sigan el C.07 de 2026, en especial el art. 16.",
    "Orden inicial (C.04.2, art. 2.2): rating, título y orden alfabético.",
    "Orden de títulos: GM, IM, WGM, FM, WIM, CM, WFM, WCM, sin título.",
    "Calcula a mano un caso con rondas no jugadas y compáralo con el programa."
   ],
   "contenido": "<h3>Antes del torneo</h3><ul><li>Versión avalada por la FIDE (lista del capítulo C.02.04 del Handbook).</li><li>Sistema holandés vigente (C.04.3, 2026).</li><li>Desempates según el C.07 de 2026; rondas no jugadas según el art. 16 (no el jugador virtual de 2012).</li><li>Puntos del descanso y de los byes, como digan las bases.</li></ul><div class=\"aula-norma\"><b>C.04.2, art. 2.2</b> Antes de la primera ronda los participantes se ordenan por fuerza (rating), título (GM, IM, WGM, FM, WIM, CM, WFM, WCM, sin título) y orden alfabético, salvo que se haya anunciado otro criterio.</div><p class=\"aula-nota\">Los precios, versiones y requisitos que traía la edición original eran de 2012 y se eliminaron.</p>"
  },
  {
   "id": "buchholz-cortes-vur",
   "coleccion": "revista-4",
   "titulo": "Buchholz con rondas no jugadas: cálculo completo y cortes",
   "articulos": "C.07 (2026) · arts. 4.1, 8.1, 14.1, 16.3, 16.4, 16.5",
   "resumen": "Cómo calcular el Buchholz de todo un torneo con incomparecencias y qué se corta en el Buchholz Cut-1 cuando hay una VUR.",
   "claves": [
    "En las incomparecencias, las puntuaciones de los rivales cuentan tal cual (art. 16.3.1).",
    "Incomparecencia propia: rival ficticio = el menor entre tu puntuación final y la del rival programado (16.4.1).",
    "Cut-1 elimina el valor menos significativo (art. 14.1).",
    "Con una VUR, se corta la aportación de esa ronda si no es menor que el valor menos significativo (16.5.1).",
    "VUR = bye solicitado o pérdida por incomparecencia; una victoria por incomparecencia no es VUR.",
    "El mismo torneo puede dar otra clasificación con BH o con BH-C1: el orden y los modificadores van en las bases (art. 4.1)."
   ],
   "contenido": "<h3>El método</h3><ol><li>Calcula la puntuación final de todos.</li><li>Ajusta las rondas no jugadas para el desempate de los rivales (art. 16.3): incomparecencias y byes con descanso, con el resultado asignado; byes pedidos al final, como tablas.</li><li>Para cada jugador, suma las puntuaciones ajustadas de sus rivales.</li><li>En cada ronda no jugada propia, suma el rival ficticio: tu puntuación final, con su tope (16.4).</li><li>Si las bases piden un corte, aplica el art. 16.5 a las VUR.</li></ol><div class=\"aula-norma\"><b>Art. 16.4.1</b> En las incomparecencias (categorías 2 y 4), el rival ficticio no puede pasar de la puntuación ajustada del rival programado.</div><div class=\"aula-norma\"><b>Art. 16.5.1</b> Si un modificador manda cortar el valor menos significativo de un jugador con VUR, se corta la menor aportación de esas rondas, siempre que no sea menor que el valor menos significativo.</div><h3>Ejemplo de la revista</h3><div class=\"aula-tabla\"><table><tr><th>Jugador</th><th>Pts</th><th>BH</th><th>Se corta</th><th>BH-C1</th></tr><tr><td>Carvajal</td><td>4½</td><td>24½</td><td>3½ (VUR de la ronda 1)</td><td>21</td></tr><tr><td>Ibarra</td><td>4½</td><td>24</td><td>2 (el menor)</td><td>22</td></tr></table></div><p>Con BH gana Carvajal el segundo lugar; con BH-C1, Ibarra.</p><p class=\"aula-nota\">Fe de erratas de la edición original: en 2012 la regla (sección 15.3) contaba como tablas las incomparecencias de los rivales, y el cálculo publicado no lo hizo.</p>"
  },
  {
   "id": "eliminacion-directa",
   "coleccion": "revista-4",
   "titulo": "Sistema Wimbledon (eliminación directa)",
   "articulos": "C.04.2 (2026) · art. 2.2 · C.07 (2026) · art. 3.1",
   "resumen": "Cómo se arma un cuadro de eliminación directa: orden inicial, grupos en zigzag, matches en «U», byes y desempates en el tablero.",
   "claves": [
    "El cuadro usa potencias de 2; si faltan jugadores, los primeros pasan directamente (bye).",
    "Orden inicial: rating, título (GM, IM, WGM, FM, WIM, CM, WFM, WCM, sin título) y orden alfabético.",
    "Grupos en zigzag: con 2 grupos, el 1 recibe 1, 4, 5, 8, 9, 12, 13, 16.",
    "Matches en «U»: primero contra último; luego los ganadores del match 1 y 4, y del 2 y 3.",
    "Resultado: el cuadro clásico, en el que el 1 y el 2 solo se cruzan en la final.",
    "Art. 3.1 del C.07: las bases fijan formato, números, colores, ritmos y horarios del play-off; el Armagedón no está regulado en las Leyes."
   ],
   "contenido": "<h3>Paso a paso</h3><ol><li>Ordena por rating, título y orden alfabético (C.04.2, art. 2.2).</li><li>Elige el cuadro: la potencia de 2 igual o superior al número de jugadores. Los puestos vacíos son los últimos números; sus rivales pasan directamente.</li><li>Reparte en grupos en zigzag (2 grupos hasta 16, 4 hasta 32, 8 hasta 64).</li><li>En cada grupo, matches en «U»: 1.º contra último, 2.º contra penúltimo…</li><li>Enlaza los matches en «U»: M1 contra M4, M2 contra M3.</li><li>Los campeones de grupo se cruzan en «U» (con 4 grupos: G1-G4 y G2-G3).</li></ol><div class=\"aula-tabla\"><table><tr><th>Jugadores</th><th>Cuadro</th><th>Pasan directamente</th><th>Matches en la 1.ª ronda</th></tr><tr><td>13</td><td>16</td><td>3 (n.º 1, 2 y 3)</td><td>5</td></tr><tr><td>20</td><td>32</td><td>12</td><td>4</td></tr><tr><td>23</td><td>32</td><td>9</td><td>7</td></tr></table></div><div class=\"aula-norma\"><b>C.07 (2026), art. 3.1</b> Si hay play-off, las bases deben fijar: puestos en juego, relación con los desempates, formato, números, colores, ritmos y horario.</div><div class=\"aula-norma aula-norma-aviso\"><b>Fe de erratas.</b> La edición original ponía WIM antes que FM. Lo correcto es FM y después WIM.</div>"
  },
  {
   "id": "estres-y-arbitro",
   "coleccion": "revista-4",
   "titulo": "El árbitro ante un jugador estresado",
   "articulos": "Leyes 2023 · arts. 11.2.3.2, 11.3.1, 12.2.3, 12.2.4, 12.2.6",
   "resumen": "Recomendaciones de Paula Man Reich para calmar a un ajedrecista y los límites que ponen las Leyes durante la partida.",
   "claves": [
    "Sentir nervios no es malo; lo que perturba es el descontrol emocional.",
    "Respirar profundo dos o tres veces, hablar lento y calmado y tomar un momento de descanso.",
    "Durante la partida el árbitro no puede decir nada que se parezca a un consejo (art. 11.3.1).",
    "El rival no debe ser molestado (art. 12.2.4).",
    "El jugador con el turno solo sale del área de juego con permiso del árbitro (art. 11.2.3.2), y su reloj sigue corriendo.",
    "Ante una urgencia de salud, medidas especiales (art. 12.2.6)."
   ],
   "contenido": "<h3>Recomendaciones (Paula Man Reich)</h3><ul><li>Respirar profundo dos o tres veces y tomar un momento de descanso.</li><li>Hablarle lento y calmado; un comentario ajeno al ajedrez puede alejar el estrés.</li><li>Ya tranquilo: concentrarse en cada jugada, recordar una buena actuación, tener una frase o una canción que le devuelva la calma.</li></ul><h3>Los límites de las Leyes</h3><div class=\"aula-norma\"><b>Art. 11.3.1</b> Durante el juego están prohibidos las notas, las fuentes de información y los consejos.</div><div class=\"aula-norma\"><b>Art. 12.2</b> El árbitro mantiene un buen ambiente (12.2.3), evita que los jugadores sean molestados (12.2.4) y toma medidas especiales para jugadores con discapacidad o que necesiten atención médica (12.2.6).</div><div class=\"aula-norma\"><b>Art. 11.2.3.2</b> El jugador que tiene el turno solo puede salir del área de juego con permiso del árbitro.</div><p class=\"aula-nota\">Lo ideal es usar estas técnicas antes de la ronda o fuera de la mesa, sin interrumpir a los demás.</p>"
  },
  {
   "id": "zonas-sala-juego",
   "coleccion": "revista-5",
   "titulo": "Zonas de la sala de juego",
   "articulos": "Leyes 2023 · arts. 8.4, 11.2, 11.3.1, 11.4, 11.7, 12.2, 12.9 · C.01 (2022)",
   "resumen": "Cómo ordenar la sala: recinto y zona de juego, quién puede entrar, qué pasa con quien terminó y las pautas FIDE para torneos de alto nivel.",
   "claves": [
    "Recinto de juego: zona de juego, descanso, servicios, refrigerio, fumado y lo que designe el árbitro (art. 11.2.1).",
    "Zona de juego: el lugar donde se juegan las partidas (art. 11.2.2).",
    "Solo con permiso del árbitro entra a la zona de juego quien no es jugador ni árbitro (art. 11.2.3).",
    "Quien terminó su partida es espectador (art. 11.4) y sale de la zona de juego.",
    "No hay obligación de tener un área interna para espectadores.",
    "Alto nivel (C.01): zona de juego de al menos 5n m², 450 lux y sin ruido."
   ],
   "contenido": "<h3>Qué dice la norma</h3><div class=\"aula-norma\"><b>Art. 11.2.1</b> El recinto de juego comprende la zona de juego, las salas de descanso, los servicios sanitarios, la zona de refrigerio, la zona para fumar y otros lugares que designe el árbitro.</div><div class=\"aula-norma\"><b>Art. 11.2.2</b> La zona de juego es el lugar donde se juegan las partidas de la competición.</div><div class=\"aula-norma\"><b>Art. 11.2.3</b> Solo con permiso del árbitro puede un jugador salir del recinto, salir de la zona de juego cuando le toca mover, o entrar a la zona de juego una persona que no sea jugador ni árbitro.</div><div class=\"aula-norma\"><b>Art. 11.4</b> Los jugadores que terminaron su partida se consideran espectadores.</div><div class=\"aula-norma\"><b>Art. 12.2</b> El árbitro garantiza el juego limpio, actúa en el mejor interés de la competición, mantiene un buen ambiente de juego, evita que los jugadores sean molestados y supervisa la competición.</div><h3>Ordenar la sala en dos pasos</h3><ol><li><b>Definir zonas:</b> juego, árbitros, espectadores, entrada, servicios.</li><li><b>Definir la identidad</b> de cada persona: jugador, árbitro, invitado especial (VIP) o espectador.</li></ol><div class=\"aula-tabla\"><table><tr><th>Persona</th><th>¿Zona de juego?</th></tr><tr><td>Jugador con partida en curso</td><td>Sí</td></tr><tr><td>Árbitros</td><td>Sí</td></tr><tr><td>Organizadores, patrocinadores, prensa</td><td>Solo con permiso del árbitro</td></tr><tr><td>Padres, entrenadores, público</td><td>No</td></tr><tr><td>Jugador que ya terminó</td><td>No: es espectador</td></tr></table></div><div class=\"aula-norma\"><b>C.01 (2022), alto nivel</b> Zona de juego de al menos 5n m² (n = número de jugadores), iluminación de 450 lux como mínimo, sin sombras ni reflejos, y sin fuentes de ruido ajenas al juego.</div><div class=\"aula-norma aula-norma-aviso\"><b>Cifras de 2012.</b> Las medidas que citaba la revista original (4,5 m² por jugador, 2,5 m entre filas, 1,2-1,5 m al público) son buenas referencias prácticas, pero no aparecen en la normativa FIDE vigente.</div><h3>La planilla con poco tiempo</h3><p>Se anota siempre (art. 8.1.1), salvo quien tenga <b>menos de cinco minutos</b> en un periodo sin incremento de 30 segundos o más (art. 8.4). La negativa persistente a cumplir las Leyes se sanciona con la pérdida de la partida (art. 11.7); antes se pueden usar sanciones menores (art. 12.9).</p><p class=\"aula-nota\">Fuente: revista N.º 5, «¿Esto es un torneo o un mercado prehispánico?», de Santiago García Ramos, actualizada.</p>"
  },
  {
   "id": "cuadro-eliminatorio",
   "coleccion": "revista-5",
   "titulo": "El cuadro de eliminación directa («Wimbledon»)",
   "articulos": "C.04.2 (2026) · art. 2.2 · C.07 (2026) · art. 3.1",
   "resumen": "Cómo sembrar un cuadro de eliminación directa para que los mejor clasificados se encuentren lo más tarde posible, y qué hacer cuando no hay una potencia de 2.",
   "claves": [
    "Orden inicial: rating, luego título y luego alfabético (C.04.2, art. 2.2).",
    "El cuadro se hace en potencias de 2: 8, 16, 32, 64, 128.",
    "En la primera ronda, cada cruce suma n + 1 (1-32, 16-17… en un cuadro de 32).",
    "Si todos los favoritos ganan: octavos 1-16, cuartos 1-8, semifinal 1-4, final 1-2.",
    "Con menos jugadores, los lugares vacíos son los números más altos y sus rivales pasan directo.",
    "El desempate de cada encuentro (rápidas, relámpago…) va en las bases (C.07, art. 3.1)."
   ],
   "contenido": "<h3>El orden inicial</h3><div class=\"aula-norma\"><b>C.04.2, art. 2.2</b> Los participantes se ordenan por fuerza (rating), luego por título FIDE (en torneos individuales) y luego alfabéticamente, salvo que se anuncie otro criterio.</div><h3>El método de los cuatro grupos (cuadro de 32)</h3><div class=\"aula-tabla\"><table><tr><th>Grupo</th><th>Siembras</th><th>Primera ronda</th></tr><tr><td>1</td><td>1, 8, 9, 16, 17, 24, 25, 32</td><td>1-32, 8-25, 9-24, 16-17</td></tr><tr><td>2</td><td>2, 7, 10, 15, 18, 23, 26, 31</td><td>2-31, 7-26, 10-23, 15-18</td></tr><tr><td>3</td><td>3, 6, 11, 14, 19, 22, 27, 30</td><td>3-30, 6-27, 11-22, 14-19</td></tr><tr><td>4</td><td>4, 5, 12, 13, 20, 21, 28, 29</td><td>4-29, 5-28, 12-21, 13-20</td></tr></table></div><p>En cada grupo: el ganador de 1-32 contra el de 16-17, y el de 8-25 contra el de 9-24. Semifinales: grupo 1 contra grupo 4 y grupo 2 contra grupo 3.</p><p><span class=\"aula-formula\">siembra A + siembra B = n + 1</span> en todos los cruces de la primera ronda.</p><h3>Cuando no hay potencia de 2</h3><p>Con 23 jugadores se usa el cuadro de 32 y se dejan vacíos los lugares 24 a 32 (nueve). Los jugadores 1 a 9 pasan directo a la segunda ronda y se juegan siete encuentros: 10-23, 11-22, 12-21, 13-20, 14-19, 15-18 y 16-17.</p><div class=\"aula-norma\"><b>C.07 (2026), art. 3.1</b> Si hay partidas de desempate, las bases deben fijar qué posiciones se desempatan así, el formato, la asignación de colores, los ritmos de todas las partidas y el horario.</div><p class=\"aula-nota\">Fuente: revista N.º 5, «Sistema de competencia Wimbledon (segunda parte)», de Santiago García Ramos, con fe de erratas.</p>"
  },
  {
   "id": "arranz-color-tablas",
   "coleccion": "revista-5",
   "titulo": "El sistema Arranz y los desempates por color",
   "articulos": "C.07 (2026) · arts. 1, 4.1, 4.2, 6, 7.3, 7.4, 9.1 · Leyes 2023 · arts. 9.1.1, 10.1",
   "resumen": "Qué es el sistema Arranz (tablas: 0,4 con blancas y 0,6 con negras), por qué no es un desempate FIDE y qué alternativas oficiales hay.",
   "claves": [
    "Arranz = victorias + 0,4 × tablas con blancas + 0,6 × tablas con negras.",
    "Equivale a puntos + 0,1 × (tablas con negras − tablas con blancas).",
    "No figura en el Reglamento de Desempates C.07 (2026).",
    "Usado como puntuación, puede invertir medio punto de ventaja.",
    "Alternativas oficiales con negras: BPG (art. 7.3) y BWG (art. 7.4).",
    "Contra las tablas rápidas, las bases pueden limitar las ofertas de tablas (art. 9.1.1)."
   ],
   "contenido": "<h3>La idea</h3><p>En las tablas, en lugar de ½ y ½, se dan 0,4 a las blancas y 0,6 a las negras.</p><p><span class=\"aula-formula\">Arranz = puntos + 0,1 × (tablas con negras − tablas con blancas)</span></p><div class=\"aula-norma aula-norma-aviso\"><b>No es un desempate FIDE.</b> El C.07 aplicable desde el 1-mar-2026 no lo incluye. Usado como puntuación cambia el sistema del art. 10.1 de las Leyes, y para el rating las partidas siguen valiendo 1, ½ y 0.</div><div class=\"aula-norma\"><b>C.07, arts. 4.1 y 4.2</b> Los desempates son una lista ordenada que elige el organizador; el árbitro principal la publica antes del inicio y se aplican en orden, solo al subgrupo que siga empatado.</div><h3>Ejemplo (ficticio)</h3><div class=\"aula-tabla\"><table><tr><th>Jugador</th><th>Pts</th><th>Victorias</th><th>Tablas B</th><th>Tablas N</th><th>Arranz</th></tr><tr><td>Jiménez</td><td>3½</td><td>2</td><td>0</td><td>3</td><td>3,8</td></tr><tr><td>Brenes</td><td>3½</td><td>2</td><td>1</td><td>2</td><td>3,6</td></tr><tr><td>Quesada</td><td>3½</td><td>3</td><td>1</td><td>0</td><td>3,4</td></tr></table></div><p>Quesada, con más victorias, queda último del grupo. Con encuentro directo (DE, art. 6) el orden habría sido Brenes, Quesada, Jiménez: el orden de los desempates decide.</p><h3>Alternativas oficiales</h3><ul><li><b>BPG</b> — partidas jugadas con negras (art. 7.3).</li><li><b>BWG</b> — partidas ganadas con negras (art. 7.4).</li><li><b>Art. 9.1.1 de las Leyes</b> — las bases pueden prohibir ofrecer o aceptar tablas antes de cierta jugada, o del todo, sin consentimiento del árbitro.</li></ul><p class=\"aula-nota\">Fuente: revista N.º 5, «Sistema de desempate Arranz», reescrito con ejemplo nuevo.</p>"
  },
  {
   "id": "swiss-manager-inicio",
   "coleccion": "revista-5",
   "titulo": "Swiss Manager: instalar y crear un torneo",
   "articulos": "C.04.2 (2026) · art. 1 · C.07 (2026) · arts. 4.1 y 14.1",
   "resumen": "Los primeros pasos con Swiss Manager y lo que hay que revisar del reglamento al crear un torneo.",
   "claves": [
    "Descarga siempre desde el sitio oficial, swiss-manager.at.",
    "Los menús y atajos cambian con la versión: comprueba cada ruta.",
    "Nuevo torneo: «Archivo» → «Nuevo torneo» y elegir el tipo (suizo, round robin, por equipos).",
    "En «Datos del torneo» quedan sistema, ritmo y desempates.",
    "Los desempates deben coincidir con los publicados en las bases y en su orden (C.07, art. 4.1).",
    "El sistema de emparejamiento debe ser el anunciado (C.04.2, art. 1)."
   ],
   "contenido": "<h3>Primeros pasos</h3><ol><li>Descargar el instalador desde swiss-manager.at.</li><li>Instalar (puede pedir permisos de administrador).</li><li>Elegir el idioma (menú de idioma y carpetas; en alemán, «Sprachauswahl und Verzeichnisse»).</li><li>Elegir la carpeta donde se guardarán los torneos.</li><li>«Archivo» → «Nuevo torneo» → tipo de torneo → nombre y ubicación → «Datos del torneo».</li></ol><div class=\"aula-norma aula-norma-aviso\"><b>Versión del programa.</b> Las rutas son las de 2012; la lógica sigue igual, pero los nombres de menús, ventanas y atajos pueden cambiar.</div><h3>El reglamento dentro del programa</h3><div class=\"aula-norma\"><b>C.07, art. 4.1</b> Los desempates forman una lista ordenada, publicada antes del inicio. La del programa debe ser la misma.</div><div class=\"aula-norma\"><b>C.07, art. 14.1</b> Corte 1 (Cut-1): se elimina el valor menos significativo; por ejemplo, Buchholz corte 1 (BH-C1) quita el puntaje más bajo de los rivales.</div><div class=\"aula-norma\"><b>C.04.2, art. 1</b> Los métodos acelerados solo se usan si se anunciaron antes; el árbitro principal declara el sistema usado al informar a la FIDE.</div><p class=\"aula-nota\">Fuente: revista N.º 5, «Guías rápidas de Swiss Manager (primera parte)», de Santiago García Ramos.</p>"
  },
  {
   "id": "arbitro-angel-demonio",
   "coleccion": "revista-5",
   "titulo": "El árbitro: ¿ángel o demonio?",
   "articulos": "Leyes 2023 · arts. 12.1 y 12.2",
   "resumen": "Actitudes que hacen bueno o malo a un árbitro, según la psicóloga del deporte Paula Man Reich, y lo que las Leyes esperan de él.",
   "claves": [
    "El mejor árbitro cumple su papel y pasa lo más desapercibido posible.",
    "No se mezclan los intereses personales con los profesionales.",
    "Causas de un mal arbitraje: falta de conocimiento, falta de experiencia y abuso de poder.",
    "Las dos primeras se corrigen; el abuso de poder es intencional y es la más grave.",
    "Equivocarse alguna vez es humano; volverlo costumbre habla mal del árbitro.",
    "Art. 12.2: juego limpio, mejor interés de la competición, buen ambiente y jugadores sin molestias."
   ],
   "contenido": "<h3>La idea central</h3><p>El árbitro es parte de un sistema que, si funciona bien, permite que el evento se desarrolle eficazmente. Cuando se vuelve el centro de atención por hacer mal su trabajo, entorpece todo el torneo.</p><h3>Tres causas de un mal arbitraje</h3><div class=\"aula-tabla\"><table><tr><th>Causa</th><th>¿Se corrige?</th></tr><tr><td>Falta de conocimiento</td><td>Sí, estudiando</td></tr><tr><td>Falta de experiencia</td><td>Sí, arbitrando y aprendiendo de otros</td></tr><tr><td>Abuso de poder</td><td>Depende de una decisión personal: es intencional</td></tr></table></div><div class=\"aula-norma\"><b>Arts. 12.1 y 12.2</b> El árbitro vela por el cumplimiento de las Leyes; garantiza el juego limpio, actúa en el mejor interés de la competición, mantiene un buen ambiente de juego, evita que los jugadores sean molestados, supervisa la competición, atiende a jugadores con discapacidad o que necesitan atención médica y sigue las normas de juego limpio.</div><p class=\"aula-nota\">Fuente: revista N.º 5, artículo de la Lic. Paula Man Reich, psicóloga del deporte.</p>"
  },
  {
   "id": "convocatoria-bases",
   "coleccion": "revista-6",
   "titulo": "La convocatoria (bases de competencia)",
   "articulos": "Leyes 2023 · arts. 6.7.1, 9.1.1, 11.3.2 · C.07 (2026) · arts. 2.1, 4.1 · C.04.2 (2026) · art. 4.4 · Rating (2024) · arts. 0.2, 9.2",
   "resumen": "Los nueve puntos de una convocatoria y las cuestiones técnicas que hoy deben quedar escritas.",
   "claves": [
    "La convocatoria es el contrato del organizador con los jugadores.",
    "Tiempo de espera: lo fijan las bases; si no, es cero (art. 6.7.1).",
    "Desempates: lista ordenada publicada antes del inicio (C.07, art. 4.1.1).",
    "Emparejamientos publicados solo se cambian en casos tasados (C.04.2, art. 4.4).",
    "Registro para rating: 3 días antes, o 30 si hay un jugador de más de 2700 o una jugadora de más de 2500 (B.02, art. 0.2).",
    "Las bases deben decir que el torneo es evaluado para rating (B.02, art. 9.2)."
   ],
   "contenido": "<h3>Los nueve puntos</h3><ol><li>Quién convoca y para qué.</li><li>A qué se convoca.</li><li>A quién se convoca.</li><li>Cuándo, dónde y a qué hora.</li><li>Requisitos para participar.</li><li>Cuestiones técnicas.</li><li>Qué pueden esperar los participantes (premios).</li><li>Extras.</li><li>Quién avala.</li></ol><h3>Cuestiones técnicas</h3><div class=\"aula-norma\"><b>Art. 6.7.1</b> Las bases fijan el tiempo de espera de antemano; si no lo hacen, es cero.</div><div class=\"aula-norma\"><b>Art. 9.1.1</b> Las bases pueden prohibir ofrecer o aceptar tablas antes de cierta jugada, o del todo, sin consentimiento del árbitro.</div><div class=\"aula-norma\"><b>Art. 11.3.2.1</b> Las bases pueden permitir guardar los dispositivos completamente apagados en el bolso del jugador, donde indique el árbitro.</div><div class=\"aula-norma\"><b>C.07, arts. 2.1 y 4.1</b> Las bases dicen si los empatados comparten el puesto; los desempates son una lista ordenada que el árbitro principal publica antes del inicio.</div><div class=\"aula-norma\"><b>C.04.2, art. 4.4</b> Los emparejamientos publicados no se cambian, salvo casos tasados y si el árbitro principal lo juzga en el mejor interés del torneo.</div><div class=\"aula-norma\"><b>Reglamento de Rating, arts. 0.2 y 9.2</b> Registro del torneo 3 días antes (30 si hay un jugador de más de 2700 o una jugadora de más de 2500). Las bases dicen que el torneo es evaluado.</div><div class=\"aula-tabla\"><table><tr><th>2012</th><th>C.07 (2026)</th></tr><tr><td>Progresivo</td><td>PS (7.5)</td></tr><tr><td>Progresivo con cortes</td><td>PS-C1</td></tr><tr><td>Buchholz total</td><td>BH (8.1)</td></tr><tr><td>Buchholz I</td><td>BH-C1 (14.1)</td></tr><tr><td>Buchholz II</td><td>BH-C2 (14.2)</td></tr></table></div><div class=\"aula-norma aula-norma-aviso\"><b>Ojo.</b> Los desempates tipo Buchholz no se usan en round robin (C.07, art. 8).</div><p class=\"aula-nota\">Fuente: revista N.º 6, «La convocatoria», de Santiago García Ramos, actualizada.</p>"
  },
  {
   "id": "leyes-2013-a-2023",
   "coleccion": "revista-6",
   "titulo": "De las Leyes «2013» a las vigentes",
   "articulos": "Leyes 2023 · arts. 5.1.2, 6.7, 7.5, 8.1.1, 9.6, 11.3, 12.2, 12.9 · Pautas I-III",
   "resumen": "Qué cambió en las Leyes del Ajedrez desde el texto de Estambul que publicó la revista, que nunca llegó a regir.",
   "claves": [
    "El texto de Estambul («2013») nunca rigió: desde el 1-jul-2014 se aplicó la versión de Tallin.",
    "Numeración actual: art. 10 puntos, 11 conducta, 12 árbitro.",
    "Segunda jugada ilegal: partida perdida (art. 7.5.5).",
    "Tablas automáticas: cinco repeticiones o 75 jugadas (art. 9.6).",
    "Dispositivo encima en el recinto: partida perdida (art. 11.3.2.2).",
    "Desde 2023, abandonar cuando el rival no puede dar mate es tablas (art. 5.1.2)."
   ],
   "contenido": "<h3>Las versiones</h3><div class=\"aula-tabla\"><table><tr><th>Versión</th><th>Rigió</th></tr><tr><td>Dresde 2008</td><td>1-jul-2009 a 30-jun-2014</td></tr><tr><td>Estambul («2013»)</td><td>Nunca</td></tr><tr><td>Tallin</td><td>1-jul-2014 a 30-jun-2017</td></tr><tr><td>Bakú/Atenas</td><td>1-jul-2017 a 31-dic-2017</td></tr><tr><td>Goynuk</td><td>1-ene-2018 a 31-dic-2022</td></tr><tr><td>2023</td><td>Desde el 1-ene-2023 (vigente)</td></tr></table></div><h3>Lo que más cambió</h3><div class=\"aula-norma\"><b>Art. 7.5</b> Pulsar sin mover (7.5.3) o mover con dos manos (7.5.4) es jugada ilegal. Primera: 2 minutos al rival; segunda: pérdida, salvo que el rival no pueda dar mate (7.5.5).</div><div class=\"aula-norma\"><b>Art. 9.6</b> Tablas automáticas si la misma posición aparece al menos cinco veces o tras 75 jugadas de cada bando sin mover peón ni capturar (salvo mate en la última).</div><div class=\"aula-norma\"><b>Art. 6.7</b> Las bases fijan el tiempo de espera; si no, es cero.</div><div class=\"aula-norma\"><b>Art. 11.3.2</b> Prohibido cualquier dispositivo no aprobado por el árbitro. Apagado en el bolso solo si las bases lo permiten (11.3.2.1). Llevarlo encima: pérdida (11.3.2.2).</div><div class=\"aula-norma\"><b>Art. 5.1.2</b> Quien abandona pierde, salvo que el rival no pueda dar mate: entonces es tablas.</div><div class=\"aula-norma\"><b>Art. 8.1.1.2</b> Se puede anotar en una planilla electrónica certificada por la FIDE.</div><div class=\"aula-norma\"><b>Art. 12.9</b> Sanciones: advertencia, tiempo al rival, tiempo al infractor, puntos, partida perdida, multa anunciada, exclusión de rondas, expulsión.</div><h3>Dónde quedó cada cosa</h3><div class=\"aula-tabla\"><table><tr><th>2013</th><th>Hoy</th></tr><tr><td>Art. 10 final a ritmo rápido</td><td>Pautas III</td></tr><tr><td>Art. 11 puntos</td><td>Art. 10</td></tr><tr><td>Art. 12 conducta</td><td>Art. 11</td></tr><tr><td>Art. 13 árbitro</td><td>Art. 12</td></tr><tr><td>Apéndice E ciegos</td><td>Apéndice D</td></tr><tr><td>Apéndice F Ajedrez960</td><td>Pautas II</td></tr><tr><td>Apéndice G aplazadas</td><td>Pautas I</td></tr></table></div><p class=\"aula-nota\">Fuente: revista N.º 6. El texto en inglés de 2013 se reemplazó por este resumen de cambios.</p>"
  },
  {
   "id": "rapidas-relampago-hoy",
   "coleccion": "revista-6",
   "titulo": "Rápidas y relámpago: qué cambió",
   "articulos": "Leyes 2023 · Apéndices A y B · Pautas III",
   "resumen": "Definiciones, supervisión, sanciones y jugada ilegal en rápidas y relámpago, comparadas con el texto de 2013.",
   "claves": [
    "Rápidas: más de 10 y menos de 60 minutos (tiempo + 60 × incremento) (A.1).",
    "Relámpago: 10 minutos o menos (B.1); 10 + 0 es relámpago.",
    "Reglas completas solo si un árbitro supervisa hasta 3 partidas (rápidas) o 1 (relámpago) y cada partida se anota (A.4, B.2).",
    "Sanción en tiempo: 1 minuto en rápidas y relámpago (A.3).",
    "Sin supervisión completa: el árbitro actúa ante la jugada ilegal si el rival aún no movió; si nadie reclama, se queda (A.5.2).",
    "Pautas III: solo si se anuncian y solo sin incremento, nunca en relámpago (III.2)."
   ],
   "contenido": "<h3>Definiciones</h3><div class=\"aula-norma\"><b>A.1 y B.1</b> Rápidas: más de 10 y menos de 60 minutos por jugador. Relámpago: 10 minutos o menos. Se cuenta tiempo asignado + 60 × incremento.</div><h3>Dos regímenes</h3><div class=\"aula-norma\"><b>A.4 y B.2</b> Se aplican las reglas de competición completas si un árbitro supervisa como máximo tres partidas (rápidas) o una (relámpago) y cada partida es anotada por el árbitro o un asistente.</div><div class=\"aula-norma\"><b>A.5</b> Si no: tras 10 jugadas de cada bando ya no se cambia el reloj ni se reclama la colocación del tablero (A.5.1); jugada ilegal según A.5.2; el árbitro señala la caída de bandera si la ve (A.5.5).</div><div class=\"aula-norma\"><b>A.6 y B.4</b> Las bases dicen qué régimen rige para todo el evento.</div><div class=\"aula-norma\"><b>A.3</b> Las sanciones de los arts. 7 y 9 son de 1 minuto en lugar de 2 (también en relámpago, por B.3).</div><div class=\"aula-tabla\"><table><tr><th>Jugada ilegal sin supervisión completa</th><th>Regla</th></tr><tr><td>Texto de 2013</td><td>Rápidas: decide el árbitro si se reclama. Relámpago: el rival reclama y gana.</td></tr><tr><td>2014</td><td>Pérdida si se ve o reclama antes de la siguiente jugada.</td></tr><tr><td>Hoy (A.5.2)</td><td>Sanción del 7.5.5 (1 minuto; pérdida a la segunda) si se actúa antes de que el rival mueva; si no, la jugada se queda.</td></tr></table></div><div class=\"aula-norma aula-norma-aviso\"><b>Pautas III</b> Solo si se anunciaron antes (III.2.1) y en partidas estándar o rápidas sin incremento (III.2.2). Con menos de 2 minutos: pedir 5 segundos de incremento para ambos (III.4) o reclamar tablas al árbitro (III.5).</div><p class=\"aula-nota\">Fuente: revista N.º 6, comparación con las Leyes «2013».</p>"
  },
  {
   "id": "normas-arbitro-fide",
   "coleccion": "revista-6",
   "titulo": "Normas para el título de Árbitro FIDE",
   "articulos": "B.06.1 · arts. 1.3, 2.2, 2.4, 2.10, 3.7, 3.9.2, 3.12, 5.4",
   "resumen": "Cuántas normas pide el título de AF, cuándo vale un torneo rápido o relámpago y qué cambió el 1-mar-2026.",
   "claves": [
    "AF: 4 normas, una del seminario y tres de torneos (2.2, 5.4).",
    "Examen de la Comisión de Árbitros con al menos 80 % (3.7).",
    "Una sola norma de rápidas o relámpago: al menos 30 jugadores con rating y 9 rondas (3.9.2).",
    "Desde 2026: salvo indicación, los torneos para norma son de ritmo estándar (2.4.2).",
    "No más de una norma por festival y sin fechas solapadas (2.10).",
    "Los títulos de AF y AI son vitalicios (1.3)."
   ],
   "contenido": "<h3>El título de Árbitro FIDE</h3><div class=\"aula-norma\"><b>B.06.1, arts. 2.2 y 5.4</b> La solicitud de AF lleva 4 normas: una del seminario de AF y tres de torneos. La edad mínima es 19 años.</div><div class=\"aula-norma\"><b>Art. 3.7</b> Asistir a un seminario de árbitros FIDE y aprobar el examen con al menos 80 %.</div><div class=\"aula-norma\"><b>Art. 3.9.2</b> Una sola norma por solicitud puede venir de un torneo rápido o relámpago evaluado por la FIDE con al menos 30 jugadores con rating y 9 rondas.</div><h3>Cambios del 1-mar-2026</h3><ul><li>Para el mínimo de jugadores solo cuentan quienes faltaron a una ronda como máximo (2.4.1).</li><li>Salvo indicación, ritmo estándar (2.4.2).</li><li>Fechas de normas sin solaparse; una norma por festival, salvo torneos de más de 30 días (2.10).</li><li>Las normas válidas para AI valen para AF (3.12).</li><li>Para pedir el AF: un año con licencia de árbitro nacional o un torneo FIDE adicional (5.4.3).</li></ul><div class=\"aula-norma aula-norma-aviso\"><b>Antes de tramitar</b> consulta el texto vigente de B.06.1 en el Handbook.</div><p class=\"aula-nota\">Fuente: revista N.º 6, nota «Cambios en las regulaciones de los títulos de árbitro», actualizada.</p>"
  },
  {
   "id": "firmeza-prepotencia",
   "coleccion": "revista-6",
   "titulo": "Firmeza o prepotencia",
   "articulos": "Leyes 2023 · arts. 11.9, 11.10, 12.9",
   "resumen": "Por qué un árbitro cae en la prepotencia, según Paula Man Reich, y qué herramientas de firmeza le dan las Leyes.",
   "claves": [
    "Saber las reglas no basta: hay que aplicarlas con criterio en situaciones reales.",
    "Causas de la prepotencia: teoría sin práctica, mal manejo del estrés y ambición de poder.",
    "La prepotencia es la salida fácil cuando faltan argumentos y sobran nervios.",
    "Las sanciones del art. 12.9 van de la advertencia a la expulsión, en proporción a la falta.",
    "El jugador puede pedir la explicación de una norma (art. 11.9).",
    "El jugador puede apelar, salvo que las bases digan otra cosa (art. 11.10)."
   ],
   "contenido": "<h3>La línea gris</h3><p>Ante cada decisión, el árbitro puede ser visto como firme o como prepotente. La diferencia está en el criterio, la ética y la capacidad de explicar.</p><h3>Por qué se cae en la prepotencia</h3><ul><li>Lo hipotético no es lo real: en la sala se olvida lo que se dijo en teoría.</li><li>Formación solo teórica, sin simulaciones de casos.</li><li>Poco control del estrés: a la segunda o tercera dificultad, la prepotencia aparece.</li><li>Ambición de poder: un atajo que termina siendo la ruina.</li></ul><div class=\"aula-norma\"><b>Art. 12.9</b> Sanciones: advertencia; más tiempo al rival; menos tiempo al infractor; subir los puntos del rival; bajar los del infractor; partida perdida; multa anunciada; exclusión de rondas; expulsión.</div><div class=\"aula-norma\"><b>Arts. 11.9 y 11.10</b> El jugador puede pedir que se le explique una norma y puede apelar las decisiones del árbitro, salvo que las bases digan otra cosa, aunque haya firmado la planilla.</div><p class=\"aula-nota\">Fuente: revista N.º 6, artículo de la Lic. Paula Man Reich, psicóloga del deporte.</p>"
  },
  {
   "id": "registro-arbitros",
   "coleccion": "revista-7",
   "titulo": "Registro, categorías y actividad de los árbitros",
   "articulos": "B.06.1 (desde 1-mar-2026) · arts. 1.3, 5.4.3, 6.1, 6.2 · B.06.3 (desde 1-jul-2026)",
   "resumen": "Qué debe pagar un árbitro para actuar en torneos FIDE, cómo se clasifica y cuándo queda inactivo.",
   "claves": [
    "Todo árbitro de un evento valorado por la FIDE paga la cuota de registro (antes «License fee»): B.06.1, art. 6.1.",
    "Si no se cumple, el evento puede no valorarse y las normas del árbitro no se aceptan (art. 6.2).",
    "Los títulos de AF e IA son vitalicios (art. 1.3); para pedir el de AF hay que tener la licencia de Árbitro Nacional al menos un año (art. 5.4.3).",
    "Los IA se clasifican en A, B, C y D; los AF son siempre categoría D (B.06.3).",
    "Un árbitro queda inactivo si pasan cuatro años sin aprobar un curso de actualización.",
    "El inactivo no puede ser árbitro principal de torneos con posibilidad de normas ni ser designado para eventos oficiales FIDE o continentales."
   ],
   "contenido": "<h3>Qué dice la norma</h3><div class=\"aula-norma\"><b>B.06.1, arts. 6.1 y 6.2</b> Todos los árbitros de cualquier evento valorado por la FIDE cumplen el reglamento financiero, lo que incluye pagar una cuota de registro (antes llamada «License fee»). Si no, el evento puede no ser valorado y las normas de árbitro no se aceptan.</div><div class=\"aula-norma\"><b>B.06.1, arts. 1.3 y 5.4.3</b> Los títulos son vitalicios desde que se otorgan o registran. Para solicitar el título de AF hay que haber tenido la licencia de Árbitro Nacional al menos un año.</div><div class=\"aula-norma\"><b>B.06.3</b> IA en categorías A, B, C o D; AF siempre en D. Para subir: antigüedad, estar activo y actuaciones como principal o adjunto con evaluación positiva en los últimos cinco años.</div><h3>Actividad</h3><p>La fecha de «fin de actividad» es cuatro años después del título de AF o del último curso de actualización (o seminario de certificación de IA) aprobado. Un nuevo título o categoría no cambia esa fecha.</p><div class=\"aula-norma aula-norma-aviso\"><b>Árbitro inactivo.</b> No puede ser árbitro principal de torneos valorados por la FIDE (salvo que no haya posibilidad de normas), no puede ser designado para eventos oficiales FIDE o continentales, y su estado se marca en su perfil. Vuelve a estar activo al aprobar un curso de actualización validado por la Comisión de Árbitros.</div><div class=\"aula-tabla\"><table><tr><th>Categoría</th><th>Resumen</th></tr><tr><td>D</td><td>Todo AF y todo IA, por defecto.</td></tr><tr><td>C</td><td>IA hace 1 año o más, activo, con actuaciones en torneos de categoría C y D.</td></tr><tr><td>B</td><td>IA hace 3 años o más, 2 años en C, actuaciones en torneos de B y C.</td></tr><tr><td>A</td><td>IA hace 5 años o más, 2 años en B, actuaciones en torneos de A y B.</td></tr></table></div><p class=\"aula-nota\">Las tarifas de 2012 (de 20 € a 300 €) son historia. Las cuotas vigentes se consultan con la federación o en los documentos financieros de la FIDE.</p>"
  },
  {
   "id": "notacion-fen",
   "coleccion": "revista-7",
   "titulo": "Anotar una posición: Forsyth y FEN",
   "articulos": "Leyes 2023 · arts. 8.5.3, 9.2.3, 9.3, 9.6.2 · Apéndice C.3",
   "resumen": "Cómo dejar constancia de una posición en pocos segundos y sin ambigüedad.",
   "claves": [
    "Antes de reconstruir una partida, el árbitro anota la posición y los tiempos (art. 8.5.3).",
    "Forsyth: fila por fila, de la 8.ª a la 1.ª y de la columna a a la h.",
    "Mayúsculas para las blancas, minúsculas para las negras; las casillas vacías seguidas, con un número.",
    "Cada fila suma 8 entre letras y números: si no, hay un error.",
    "En FEN internacional el rey es K y la torre es R; en español, R es el rey y T la torre.",
    "FEN añade turno, enroques, captura al paso y contadores: justo lo que el art. 9.2.3 compara en una repetición."
   ],
   "contenido": "<h3>Para qué sirve</h3><div class=\"aula-norma\"><b>Art. 8.5.3</b> Si hay que reconstruir la partida, el árbitro (o un auxiliar) anota primero la posición real y los tiempos de los relojes, si los hay.</div><h3>El método Forsyth</h3><ol><li>Recorre el tablero fila por fila, desde la octava hasta la primera, y cada fila de la columna a a la h.</li><li>Escribe la inicial de cada pieza: mayúscula si es blanca, minúscula si es negra.</li><li>Escribe un número para las casillas vacías seguidas.</li><li>Separa las filas con una barra.</li></ol><p>Ejemplo: <span class=\"aula-formula\">r3r1k1/p3qp1p/3p1np1/1NpPnbB1/2B5/1P5P/PQ1N1PP1/R5K1</span></p><div class=\"aula-tabla\"><table><tr><th>Pieza</th><th>Español</th><th>FEN</th></tr><tr><td>Rey</td><td>R</td><td>K</td></tr><tr><td>Dama</td><td>D</td><td>Q</td></tr><tr><td>Torre</td><td>T</td><td>R</td></tr><tr><td>Alfil</td><td>A</td><td>B</td></tr><tr><td>Caballo</td><td>C</td><td>N</td></tr><tr><td>Peón</td><td>P</td><td>P</td></tr></table></div><div class=\"aula-norma aula-norma-aviso\"><b>Cuidado:</b> la «R» es el rey en español y la torre en inglés. Aclara qué letras usaste. Las Leyes permiten anotar con las iniciales del propio idioma (Apéndice C.3).</div><h3>Lo que añade FEN</h3><p>Después de las piezas: turno (w/b), enroques (KQkq o «-»), casilla de captura al paso (o «-»), medias jugadas desde la última captura o movimiento de peón, y número de jugada.</p><div class=\"aula-norma\"><b>Art. 9.2.3</b> Dos posiciones son iguales si le toca al mismo jugador, las piezas ocupan las mismas casillas y los movimientos posibles son los mismos, incluidos el derecho a enrocar y la captura al paso.</div><p class=\"aula-nota\">El contador de medias jugadas ayuda con las 50 jugadas (art. 9.3) y las 75 (art. 9.6.2).</p>"
  },
  {
   "id": "buchholz-no-jugadas",
   "coleccion": "revista-7",
   "titulo": "Buchholz con partidas no jugadas",
   "articulos": "C.07 (2026) · arts. 4.1.1, 8.1, 16.1-16.6",
   "resumen": "Cómo cuentan hoy en el Buchholz las incomparecencias, los descansos y los byes pedidos.",
   "claves": [
    "Buchholz (art. 8.1): la suma de las puntuaciones de los rivales. No se usa en todos contra todos.",
    "El jugador virtual de 2009 ya no existe.",
    "Ronda no jugada propia: se juega contra un «muñeco» con la puntuación del propio jugador (art. 16.4).",
    "Si fue incomparecencia, el muñeco no puede superar la puntuación ajustada del rival programado (16.4.1).",
    "En las demás rondas no jugadas, el tope es el valor de unas tablas por el número de rondas (16.4.2).",
    "Para los rivales, las rondas no jugadas cuentan con los puntos otorgados, salvo los byes pedidos no seguidos de ninguna ronda jugada (o en la última ronda), que cuentan como tablas (16.3)."
   ],
   "contenido": "<h3>Qué dice la norma</h3><div class=\"aula-norma\"><b>Art. 8.1</b> Buchholz: la suma de las puntuaciones de cada uno de los rivales. Estos desempates no se usan en torneos todos contra todos.</div><div class=\"aula-norma\"><b>Art. 16.2</b> Categorías de rondas no jugadas: (1) descansos asignados por el emparejamiento o de punto completo; (2) victorias por incomparecencia; (3) byes pedidos seguidos de al menos una ronda que no sea VUR; (4) derrotas por incomparecencia; (5) byes pedidos seguidos solo de VUR o en la última ronda. VUR = ronda en que el jugador no estaba disponible (bye pedido o derrota por incomparecencia).</div><div class=\"aula-norma\"><b>Art. 16.3</b> Para el desempate de los rivales, las categorías 1 a 4 se cuentan con el resultado de los puntos otorgados; la categoría 5, como tablas.</div><div class=\"aula-norma\"><b>Art. 16.4</b> Para el desempate propio, cada ronda no jugada se valora contra un muñeco cuya puntuación es la del propio jugador, sin superar: la puntuación ajustada del rival programado (incomparecencias, 16.4.1); o el valor de unas tablas por el número de rondas (demás casos, 16.4.2).</div><h3>Ejemplo (caso de la revista)</h3><p>Niña X, 4 puntos, ganó por incomparecencia en la ronda 1 (rival con 0) y en la 3 (rival con 1). Rivales jugados: 4, 3 y 3.</p><p><span class=\"aula-formula\">BH = mín(4; 0) + 4 + mín(4; 1) + 3 + 3 = 11</span></p><p>Niña Y, todo jugado: 0 + 2 + 3 + 3 + 4½ = 12½. Gana la niña Y.</p><div class=\"aula-norma aula-norma-aviso\"><b>Antes del torneo.</b> El árbitro principal completa y publica la lista de desempates antes del inicio (art. 4.1.1). Las bases pueden fijar por adelantado otras reglas para las rondas no jugadas (art. 16.6).</div><p class=\"aula-nota\">Con la regla de 2009 (jugador virtual), la niña X sumaba 14. Esa regla ya no rige.</p>"
  },
  {
   "id": "gestion-suizo-programa",
   "coleccion": "revista-7",
   "titulo": "Ausencias, descansos y números de emparejamiento",
   "articulos": "C.04.1 (2026) · arts. 3-4 · C.04.2 (2026) · arts. 1.5, 2.2, 2.3, 3.2, 3.3, 4.3, 4.4",
   "resumen": "Lo que el reglamento permite (y lo que no) al excluir, reactivar o dar descanso con el programa.",
   "claves": [
    "Quien se retira ya no se empareja (C.04.2, art. 3.2).",
    "Quien avisa que no jugará una ronda no se empareja en ella y puntúa cero, salvo otra regla en las bases (art. 3.3).",
    "Con número impar, el descanso lo asigna el sistema: sin rival, sin color y con los puntos de una victoria (C.04.1, art. 3).",
    "No recibe ese descanso quien ya lo tuvo o ya sumó sin jugar los puntos de una victoria (C.04.1, art. 4).",
    "Está prohibido alterar el emparejamiento correcto en favor de cualquier participante (C.04.2, art. 1.5).",
    "El orden inicial es por fuerza, título y orden alfabético; el TPN no se cambia después de emparejar la 4.ª ronda (arts. 2.2 y 2.3)."
   ],
   "contenido": "<h3>Qué dice la norma</h3><div class=\"aula-norma\"><b>C.04.2, arts. 3.2 y 3.3</b> Los retirados ya no se emparejan. Los que se sabe de antemano que no jugarán una ronda no se emparejan en ella y puntúan cero.</div><div class=\"aula-norma\"><b>C.04.1, arts. 3 y 4</b> Con número impar, uno queda sin emparejar y recibe el descanso asignado: sin rival, sin color y con los puntos de una victoria, salvo que las bases digan otra cosa. No lo recibe quien ya lo tuvo o ya sumó sin jugar los puntos de una victoria.</div><div class=\"aula-norma aula-norma-aviso\"><b>C.04.2, art. 1.5</b> No se puede alterar el emparejamiento correcto en favor de ningún participante. Si se altera para que alguien consiga una norma o un título, puede haber informe a la Comisión de Calificación y medidas disciplinarias.</div><div class=\"aula-norma\"><b>C.04.2, arts. 2.2 y 2.3</b> Orden inicial: fuerza (normalmente el rating), título FIDE y orden alfabético. De ahí sale el TPN, que no se modifica después de emparejar la cuarta ronda.</div><div class=\"aula-norma\"><b>C.04.2, arts. 4.3 y 4.4</b> Un resultado mal anotado y avisado a tiempo se corrige para la clasificación y la ronda siguiente. Un emparejamiento publicado solo se cambia en los casos previstos.</div><h3>En el programa</h3><p>Excluir a un jugador de una ronda equivale a una ausencia conocida (cero puntos, salvo byes pedidos previstos en las bases). Asignar un descanso «a mano» o prohibir un emparejamiento solo vale si lo prevén las bases.</p><p class=\"aula-nota\">Los menús de Swiss Manager cambian con cada versión: compruébalos en la tuya.</p>"
  },
  {
   "id": "creencias-arbitro",
   "coleccion": "revista-7",
   "titulo": "Creencias y crecimiento del árbitro",
   "articulos": "Psicología del deporte · Paula Man Reich",
   "resumen": "Por qué el árbitro reacciona a lo que cree y no a lo que pasa, y cómo trabajar sus creencias.",
   "claves": [
    "Las emociones a veces engañan al propio árbitro.",
    "Se reacciona según lo que se cree que pasó o pasará, no según lo que pasa.",
    "Muchas creencias nunca se ponen en duda.",
    "Primer paso: verificar qué creencias negativas son reales y cuáles crea la mente.",
    "Cambiar las creencias nacidas de la inseguridad por pensamientos positivos.",
    "Mejorar las debilidades reales, mentales y técnicas, sin dejar de disfrutar el trabajo."
   ],
   "contenido": "<h3>La idea central</h3><p>El árbitro no reacciona conforme a lo que pasa, sino a lo que cree que pasó o le va a suceder. Sus creencias, reales o imaginarias, guían sus pensamientos, su estado de ánimo y su forma de actuar.</p><h3>El gran reto</h3><ol><li><b>Verificar</b> cuáles de tus creencias negativas son reales y cuáles crea tu mente.</li><li><b>Cambiar</b> las creencias negativas nacidas de la inseguridad por pensamientos positivos.</li><li><b>Mejorar</b> tus debilidades reales, mentales y técnicas.</li></ol><p class=\"aula-nota\">Artículo de Paula Man Reich, psicóloga del deporte (edición original).</p>"
  },
  {
   "id": "miedo-arbitro",
   "coleccion": "revista-8",
   "titulo": "El miedo en el arbitraje",
   "articulos": "Leyes 2023 · arts. 8.1.1, 8.4, 11.4, 12.7, 12.9 · Apéndice C.1",
   "resumen": "Reconocer el miedo, enfrentarlo y saber qué te autorizan las Leyes a hacer en la sala.",
   "claves": [
    "El miedo es un mecanismo de protección: su finalidad es que abandones.",
    "Primero se detecta, se reconoce y se acepta; la única forma de superarlo es enfrentarlo.",
    "Quien terminó su partida es espectador (art. 11.4), y el árbitro puede expulsar a quien interfiera (art. 12.7).",
    "La planilla se lleva en notación algebraica, clara y legible (art. 8.1.1; Apéndice C.1), nunca descriptiva.",
    "Con menos de cinco minutos y sin incremento de 30 s o más, el jugador no está obligado a anotar (art. 8.4).",
    "El miedo a desconocer las reglas se vence estudiando; el de hablar en público, preparando y ensayando."
   ],
   "contenido": "<h3>Lo que te autorizan las Leyes</h3><div class=\"aula-norma\"><b>Art. 11.4</b> Los jugadores que terminaron su partida se consideran espectadores.</div><div class=\"aula-norma\"><b>Art. 12.7</b> Quien observe una irregularidad solo puede informar al árbitro. Los espectadores no pueden intervenir en una partida, y el árbitro puede expulsar a los infractores de la sala de juego.</div><div class=\"aula-norma\"><b>Art. 8.1.1</b> Cada jugador anota sus jugadas y las del rival de la forma más clara y legible posible, en notación algebraica (Apéndice C), en papel o en una planilla electrónica certificada por la FIDE.</div><div class=\"aula-norma aula-norma-aviso\"><b>Corrección a la edición original.</b> Una planilla ilegible no se arregla pidiendo anotar «en forma descriptiva»: la FIDE solo reconoce la notación algebraica (Apéndice C.1). Se exige cumplir el art. 8.1.1 y, si el jugador persiste, se aplican las sanciones del art. 12.9 de forma gradual.</div><h3>Cómo superar el miedo</h3><ol><li><b>Detectarlo, reconocerlo y aceptarlo</b>: ritmo cardiaco acelerado, sudor, temblor.</li><li><b>Identificar cuál es</b>: desconocer una regla, la reacción de los jugadores, hablar en público, equivocarse, el ridículo, desconocer las funciones.</li><li><b>Enfrentarlo</b>: estudiar, preparar las reuniones técnicas, ensayar frente al espejo, actuar siempre de forma correcta, amable y firme.</li></ol><p class=\"aula-nota\">Artículo de Santiago García Ramos (edición original), revisado.</p>"
  },
  {
   "id": "suizo-principios",
   "coleccion": "revista-8",
   "titulo": "El Sistema Suizo: principio y reglas básicas",
   "articulos": "C.04.1 (desde 1-feb-2026) · arts. 1-9",
   "resumen": "Cómo funciona el suizo, cómo se reparten las puntuaciones y qué reglas mínimas debe cumplir todo sistema suizo FIDE.",
   "claves": [
    "Se empareja a jugadores con la misma puntuación o la más cercana.",
    "Dos participantes no juegan entre sí más de una vez (art. 2).",
    "Con número impar, el descanso asignado: sin rival, sin color y con los puntos de una victoria salvo otra regla en las bases (art. 3).",
    "No recibe el descanso quien ya lo tuvo o ya sumó sin jugar los puntos de una victoria (art. 4).",
    "Diferencia de colores entre −2 y +2 y nunca el mismo color tres veces seguidas, salvo excepciones de cada sistema (arts. 6 y 7).",
    "Sin tablas, tras n rondas el porcentaje con k puntos es C(n,k)/2ⁿ: tras la ronda 3, 12,5 / 37,5 / 37,5 / 12,5 %."
   ],
   "contenido": "<h3>Las reglas básicas (C.04.1)</h3><div class=\"aula-norma\"><b>Arts. 1 a 4</b> El número de rondas se declara antes. Nadie juega dos veces contra el mismo rival. Con número impar, uno queda sin emparejar y recibe el descanso asignado (sin rival, sin color, puntos de una victoria salvo otra regla, iguales para todos los descansos). No lo recibe quien ya lo tuvo o ya sumó sin jugar los puntos de una victoria.</div><div class=\"aula-norma\"><b>Arts. 5 a 9</b> En general, se empareja a jugadores con la misma puntuación. La diferencia de colores queda entre −2 y +2 y nadie recibe el mismo color tres veces seguidas (cada sistema puede tener excepciones). Se da el color con el que se jugó menos o, si están parejos, el contrario al último. Las reglas deben ser tan transparentes que quien empareja pueda explicarlas.</div><h3>Cómo se reparten las puntuaciones</h3><p>Sin tablas ni retiros: <span class=\"aula-formula\">porcentaje con k puntos tras n rondas = C(n,k) / 2ⁿ</span></p><div class=\"aula-tabla\"><table><tr><th>Ronda</th><th>3 pts</th><th>2 pts</th><th>1 pt</th><th>0 pts</th></tr><tr><td>2</td><td></td><td>25 %</td><td>50 %</td><td>25 %</td></tr><tr><td>3</td><td>12,5 %</td><td>37,5 %</td><td>37,5 %</td><td>12,5 %</td></tr></table></div><h3>La tarjeta de emparejamiento</h3><p>TPN, nombre, título, rating, ID FIDE, federación; por ronda: color, flotación (↓ o ↑), rival, resultado y puntos acumulados.</p><p class=\"aula-nota\">Un descanso o una victoria sin jugar se anotan como bajada (C.04.3, art. 1.4.3).</p>"
  },
  {
   "id": "holandes-2026",
   "coleccion": "revista-8",
   "titulo": "Sistema Holandés 2026: flotaciones y colores",
   "articulos": "C.04.3 (desde 1-feb-2026) · arts. 1.2, 1.4, 1.7, 1.8, 2 (C1-C21), 5.2",
   "resumen": "Los criterios del Holandés vigente y un ejemplo resuelto: por qué en la ronda 2 se juega 6-10 y no 6-9.",
   "claves": [
    "Para emparejar, el orden es puntuación y luego TPN (art. 1.2).",
    "Recibe una bajada quien queda sin pareja en su grupo, quien recibe el descanso y quien suma sin jugar más que una derrota (art. 1.4).",
    "Criterios absolutos: C1 (no repetir rival), C2 (descanso), C3 (misma preferencia absoluta de color, salvo topscorers).",
    "Topscorer: más del 50 % del máximo posible al emparejar la última ronda (art. 1.8).",
    "C14: minimizar los residentes que bajan y ya bajaron en la ronda anterior.",
    "Quien no ha jugado ninguna partida no tiene preferencia de color: se respeta la del rival (art. 1.7.4)."
   ],
   "contenido": "<h3>Definiciones clave</h3><div class=\"aula-norma\"><b>Art. 1.4</b> Bajado es quien queda sin pareja en un grupo y pasa al siguiente. Tras una partida entre jugadores con distinta puntuación, el mejor clasificado recibe una bajada y el otro una subida. También recibe una bajada quien recibe el descanso asignado o quien, sin jugar, suma más que los puntos de una derrota.</div><div class=\"aula-norma\"><b>Art. 1.7</b> Preferencia absoluta: diferencia de color mayor que +1 o menor que −1, o el mismo color en las dos últimas partidas. Fuerte: diferencia ±1. Leve: diferencia 0 (alternar). Sin partidas: sin preferencia.</div><h3>Criterios</h3><div class=\"aula-norma\"><b>Absolutos</b> C1 no repetir rival; C2 el descanso no lo recibe quien ya lo tuvo o sumó sin jugar una victoria; C3 dos no topscorers con la misma preferencia absoluta no se emparejan; C4 siempre debe poder emparejarse al resto.</div><div class=\"aula-norma\"><b>De calidad</b> C5 descanso al de menor puntuación; C6-C8 bajados (cuántos, con qué puntuación, sin bloquear el grupo siguiente); C9 descanso al de menos partidas no jugadas; C10-C11 colores de topscorers; C12-C13 preferencias de color; C14-C21 repetición de flotaciones.</div><div class=\"aula-norma\"><b>Art. 5.2 (colores)</b> 1) ambas preferencias; 2) la más fuerte; 3) alternar respecto de la última vez en que uno tuvo blancas y el otro negras; 4) la del mejor clasificado; 5) según el TPN del mejor clasificado sea impar o par.</div><h3>Ejemplo resuelto (revista N.º 8)</h3><p>Ronda 1: 1-6 0-1, 7-2 ½, 3-8 ½, 9-4 1-0, 5-10 (10 gana por incomparecencia). En el grupo de 1 punto (6, 9, 10) el 10 ya bajó en la ronda 1 (art. 1.4.3), así que C14 prefiere <span class=\"aula-formula\">6-10</span> y que baje el 9.</p><p>Ronda 2 completa: <span class=\"aula-formula\">6-10, 2-9, 8-7, 4-3, 5-1</span></p><p class=\"aula-nota\">Era el emparejamiento de Swiss Master; la edición original lo daba por erróneo.</p>"
  },
  {
   "id": "gestion-suizo-c042",
   "coleccion": "revista-8",
   "titulo": "Reglas generales de gestión del suizo",
   "articulos": "C.04.2 (desde 1-feb-2026) · arts. 1.3, 1.4, 2.4, 3.1, 3.5, 4.1, 4.3, 4.4",
   "resumen": "Incorporaciones tardías, partidas aplazadas, resultados mal anotados, cambios de emparejamiento y programas.",
   "claves": [
    "Se excluye a quien no confirmó su presencia antes del sorteo, salvo que el árbitro principal decida otra cosa (art. 4.1).",
    "El participante tardío no recibe puntos por las rondas no jugadas, salvo otra regla en las bases (art. 2.4).",
    "Las partidas aplazadas cuentan como tablas solo para emparejar (art. 3.1).",
    "Dos jugadores que no jugaron su partida pueden volver a emparejarse (art. 3.5).",
    "Un emparejamiento publicado solo se cambia en los casos del art. 4.4 y en interés del torneo.",
    "El árbitro principal informa a la FIDE qué sistema suizo oficial y qué aceleración usó (art. 1.3)."
   ],
   "contenido": "<h3>Qué dice la norma</h3><div class=\"aula-norma\"><b>Art. 4.1</b> Quien no confirmó su presencia antes del sorteo queda excluido, salvo que el árbitro principal decida otra cosa.</div><div class=\"aula-norma\"><b>Art. 2.4</b> El participante tardío solo se toma en cuenta desde rondas posteriores a la primera; no recibe puntos por las rondas no jugadas, salvo que las bases digan otra cosa; recibe su TPN y se empareja al llegar.</div><div class=\"aula-norma\"><b>Arts. 3.1 y 3.5</b> Partidas aplazadas: tablas solo a efectos de emparejamiento. Dos jugadores que no jugaron su partida pueden volver a emparejarse.</div><div class=\"aula-norma\"><b>Arts. 4.3 y 4.4</b> Un resultado mal anotado, avisado dentro del plazo, se usa para la clasificación y la ronda siguiente; avisado después, solo para el envío a rating. Un emparejamiento publicado solo se cambia en los casos listados (por ejemplo, si dos jugadores ya se habían enfrentado) y si el árbitro principal lo considera en interés del torneo.</div><div class=\"aula-norma\"><b>Arts. 1.3 y 1.4</b> El árbitro principal declara el sistema suizo y la aceleración usados. Los sistemas sin un programa aprobado por la FIDE con verificador gratuito quedan desaconsejados.</div><h3>Lo que cambió desde 2013</h3><div class=\"aula-tabla\"><table><tr><th>2013</th><th>2026</th></tr><tr><td>Ausente sin aviso = retirado</td><td>Ya no figura; lo deciden las bases</td></tr><tr><td>Buchholz con jugador virtual</td><td>C.07, art. 16</td></tr><tr><td>Descanso de 1 punto</td><td>Puntos de una victoria salvo otra regla (C.04.1, art. 3)</td></tr></table></div><p class=\"aula-nota\">Sistemas aprobados: Holandés, Dubov, Burstein y Lim, más Doble Suizo, suizo por equipos y acelerados.</p>"
  },
  {
   "id": "premios-hort",
   "coleccion": "revista-8",
   "titulo": "Reparto de premios: sistema Hort",
   "articulos": "Bases del torneo (el C.07 no regula premios)",
   "resumen": "Medio premio por el puesto y medio premio repartido a partes iguales entre los empatados.",
   "claves": [
    "Cada empatado recibe el 50 % del premio de su puesto tras los desempates.",
    "El otro 50 % de los premios de esos puestos va a una bolsa común.",
    "La bolsa se divide a partes iguales entre los empatados.",
    "Equivale a: ½ × premio del puesto + ½ × promedio de los premios empatados.",
    "Lo repartido suma siempre lo mismo que la bolsa de premios de esos puestos.",
    "El C.07 ordena a los empatados pero no regula el dinero: el sistema debe figurar en las bases."
   ],
   "contenido": "<h3>El método</h3><ol><li>Se aplican los desempates y se asigna a cada empatado su puesto.</li><li>Cada uno recibe el 50 % del premio de su puesto.</li><li>El 50 % restante de todos esos premios se suma en una bolsa.</li><li>La bolsa se divide a partes iguales entre los empatados.</li></ol><p><span class=\"aula-formula\">premio = ½ × premio del puesto + ½ × promedio de los premios empatados</span></p><h3>Ejemplo</h3><div class=\"aula-tabla\"><table><tr><th>Puesto</th><th>Premio</th><th>50 %</th><th>+ bolsa ÷ 5</th><th>Total</th></tr><tr><td>1.º</td><td>10 000</td><td>5 000</td><td>2 700</td><td>7 700</td></tr><tr><td>2.º</td><td>7 000</td><td>3 500</td><td>2 700</td><td>6 200</td></tr><tr><td>3.º</td><td>5 000</td><td>2 500</td><td>2 700</td><td>5 200</td></tr><tr><td>4.º</td><td>3 000</td><td>1 500</td><td>2 700</td><td>4 200</td></tr><tr><td>5.º</td><td>2 000</td><td>1 000</td><td>2 700</td><td>3 700</td></tr></table></div><div class=\"aula-norma aula-norma-aviso\"><b>En las bases.</b> El reglamento de desempates (C.07) no regula el reparto de premios en efectivo: el sistema Hort, los premios indivisibles o el reparto total deben anunciarse antes del torneo.</div>"
  },
  {
   "id": "rating-fide-2024",
   "coleccion": "revista-9",
   "titulo": "Reglamento de rating FIDE",
   "articulos": "B.02 (desde el 1-mar-2024) · arts. 0.2, 1.1, 5.1, 7, 8, 9 · resolución de ritmos 2026",
   "resumen": "Qué partidas se califican, con qué ritmo, cómo nace el primer rating y cómo cambia, y qué hace el árbitro con el informe.",
   "claves": [
    "Ritmo mínimo (art. 1.1): 120 min si alguno tiene 2400 o más, 90 si alguno tiene 1800 o más, 60 si ambos están bajo 1800. En 2026, 60'+30\" es estándar y 45'+30\" vale en el Circuito FIDE o sin jugadores de 2400 o más.",
    "Piso de la lista: 1400 (arts. 7.1.2 y 7.2.1).",
    "Primer rating: 5 partidas contra rivales con rating, en hasta 26 meses, con dos rivales hipotéticos de 1800 y tablas; máximo inicial 2200 (arts. 7.1.4 y 8.2).",
    "K = 40 (nuevos hasta 30 partidas y menores de 18 bajo 2300), 20 (bajo 2400), 10 (desde 2400); K × partidas no pasa de 700 (art. 8.3.3).",
    "Diferencias de más de 400 cuentan como 400, salvo para jugadores de 2650 o más (art. 8.3.1, desde el 1-oct-2025).",
    "Partidas no jugadas no cuentan; basta una jugada de cada uno para calificar (art. 5.1)."
   ],
   "contenido": "<h3>Antes del torneo</h3><div class=\"aula-norma\"><b>Art. 0.2</b> La federación del país sede registra el torneo al menos 30 días antes si juega alguien de más de 2700 o una jugadora de más de 2500; si no, tres días antes. Para torneos de normas, 30 días (B.01, art. 1.1.1).</div><div class=\"aula-norma\"><b>Art. 1.1</b> Para 60 jugadas: 120 min por jugador si alguno tiene 2400 o más; 90 si alguno tiene 1800 o más; 60 si ambos están bajo 1800. El primer control, si fija jugadas, debe ser de al menos 30 (art. 1.2). Máximo 12 horas de juego por día (art. 3.1).</div><div class=\"aula-norma aula-norma-aviso\"><b>Resolución del Consejo FIDE (2026).</b> 60'+30\" es ritmo estándar sin aprobación especial. 45'+30\" se admite en torneos del Circuito FIDE que cumplan sus requisitos y en torneos sin jugadores de 2400 o más. Para normas siguen valiendo dos rondas por día como máximo.</div><h3>Qué cuenta</h3><p>Las partidas no jugadas no cuentan; toda partida con al menos una jugada de cada uno se califica, salvo fuerza mayor o juego limpio (art. 5.1). Los matches con un jugador sin rating no se califican (art. 6.1).</p><h3>El primer rating</h3><div class=\"aula-norma\"><b>Arts. 7.1.4 y 8.2</b> Al menos 5 partidas contra rivales con rating, sumando torneos de hasta 26 meses. Se agregan dos rivales hipotéticos de 1800 con resultado de tablas. Ru = Ra + dp, redondeado; mínimo 1400 y máximo 2200. Un cero en el primer evento se ignora.</div><p><span class=\"aula-formula\">Ra = (suma de rivales + 3600) ÷ (partidas + 2)</span> y <span class=\"aula-formula\">p = (puntos + 1) ÷ (partidas + 2)</span></p><div class=\"aula-tabla\"><table><tr><th>Ejemplo</th><th>Cálculo</th></tr><tr><td>3 de 5 contra 1950, 1720, 1610, 1880, 1540</td><td>Ra = 12 300 ÷ 7 = 1757,14</td></tr><tr><td>p = 4 ÷ 7 = 0,57</td><td>dp = +50</td></tr><tr><td><b>Ru</b></td><td><b>1807</b></td></tr></table></div><h3>El cambio de rating</h3><div class=\"aula-norma\"><b>Art. 8.3</b> ΔR = resultado − PD (tabla 8.1.2). Cambio = K × ΣΔR, redondeado (0,5 se aleja de cero). Diferencias mayores de 400 cuentan como 400 si el jugador tiene menos de 2650.</div><div class=\"aula-norma\"><b>Art. 8.3.3</b> K = 40 para nuevos hasta 30 partidas y para menores (hasta el final del año en que cumplen 18) bajo 2300; K = 20 bajo 2400; K = 10 desde que llegó a 2400. Si K × n &gt; 700, K baja al mayor entero que cumpla K × n ≤ 700.</div><h3>La lista</h3><p>Mensual, el día 1 (art. 7.1). Entran los torneos que terminan hasta tres días antes (art. 7.1.3). Quien baja de 1400 sale de la lista (art. 7.2.1). Un año sin jugar: inactivo (art. 7.2.2).</p><h3>Después del torneo</h3><div class=\"aula-norma\"><b>Art. 9.1</b> El árbitro principal entrega el TRF al oficial de rating de la federación sede, que lo sube para la lista del mes registrado. Si no llega a tiempo para la tercera lista después del final, no se califica.</div>"
  },
  {
   "id": "registro-licencias",
   "coleccion": "revista-9",
   "titulo": "Registro y licencias de jugadores",
   "articulos": "B.03 (desde el 1-jul-2015) · arts. 1.1–1.19, 2.1–2.13 · B.06.1 (2026), art. 6.1",
   "resumen": "El número FIDE, quién registra a los jugadores, quién tiene licencia y qué pasa con la bandera FIDE.",
   "claves": [
    "Registrarse da un número FIDE (FIN) único para toda la carrera; nadie puede tener dos (arts. 1.2 y 1.3).",
    "Lo normal es que registre el oficial de rating de la federación (art. 1.13.1).",
    "Todo jugador registrado por una federación miembro tiene licencia para jugar sobre el tablero (art. 2.1).",
    "Los jugadores FID pagan una licencia provisional de 100 € anual y no juegan eventos FIDE ni continentales (arts. 2.6–2.10).",
    "Un torneo puede no calificarse si hay jugadores sin FIN válido (art. 1.19).",
    "Los árbitros de eventos calificados pagan una cuota de registro a la FIDE (antes «licencia»), B.06.1, art. 6.1."
   ],
   "contenido": "<h3>Registro</h3><div class=\"aula-norma\"><b>Arts. 1.1–1.3</b> Registrarse es ingresar los datos en la base de jugadores de la FIDE; da un número FIDE (FIN) único, el mismo en el tablero y en línea.</div><ul><li>Una sola federación a la vez, aunque haya doble nacionalidad (arts. 1.8 y 1.9).</li><li>Datos obligatorios: nombre, apellido, género, fecha de nacimiento, federación y correo (art. 1.14).</li><li>Perfil público: nombre, apellido, género, año de nacimiento, federación, número FIDE y títulos (art. 1.10.1).</li><li>Sin federación: bandera FIDE, código FID (art. 1.6).</li></ul><div class=\"aula-norma aula-norma-aviso\"><b>Art. 1.19</b> Un torneo puede no calificarse si hay jugadores sin FIN válido. Pide el número FIDE al inscribir.</div><h3>Licencia</h3><div class=\"aula-norma\"><b>Arts. 2.1–2.13</b> Todo jugador registrado por una federación miembro tiene licencia. Los FID pagan 100 € para una licencia provisional que vence el 30 de junio del año siguiente; no juegan eventos FIDE ni continentales. Volver a registrar a un jugador dado de baja cuesta 25 € a la federación.</div><p>Si un inscrito no tiene FIN, el organizador pide a su federación que lo registre antes de enviar el torneo (art. 2.12).</p><h3>Árbitros</h3><div class=\"aula-norma\"><b>B.06.1, arts. 6.1 y 6.2</b> Todo árbitro de un evento calificado paga la cuota de registro a la FIDE; si no, el evento puede no calificarse y no se aceptan sus normas.</div>"
  },
  {
   "id": "normas-de-titulo",
   "coleccion": "revista-9",
   "titulo": "Títulos FIDE por normas y por rating",
   "articulos": "B.01 (desde el 1-ene-2024) · arts. 0.3, 1.1, 1.3, 1.4, 1.5, 1.8",
   "resumen": "Cómo se organiza un torneo de normas y cómo se comprueba, paso a paso, si un resultado es norma.",
   "claves": [
    "Títulos por rating, con 30 partidas: FM 2300, CM 2200, WFM 2100, WCM 2000 (art. 1.3).",
    "Torneo de normas: registro 30 días antes, máximo 2 rondas por día y árbitro principal AI o AF (art. 1.1).",
    "Mínimo 9 partidas, 50 % de titulados (sin CM ni WCM) y 1/3 con mínimo 3 del título buscado (arts. 1.4.1 y 1.4.5).",
    "Piso de un rival: GM 2200, IM 2050, WGM 2000, WIM 1850; solo se sube uno. Los sin rating valen 1400 (art. 1.4.6).",
    "Performance mínima 2600/2450/2400/2250 con promedio de rivales 2380/2230/2180/2030; porcentaje redondeado al entero (art. 1.4.8).",
    "Título: normas por al menos 27 partidas y rating de 2500/2400/2300/2200 alguna vez (art. 1.5)."
   ],
   "contenido": "<h3>Títulos por rating</h3><div class=\"aula-norma\"><b>Art. 1.3</b> FM 2300 · CM 2200 · WFM 2100 · WCM 2000, con al menos 30 partidas calificadas.</div><h3>El torneo</h3><div class=\"aula-norma\"><b>Art. 1.1</b> Registro 30 días antes; máximo 12 horas y 2 rondas por día; al menos dos horas por jugador para 60 jugadas (o los ritmos de la resolución de 2026); el mismo control para todos; árbitro principal AI o AF, siempre presente; ningún árbitro designado juega.</div><h3>La norma</h3><div class=\"aula-tabla\"><table><tr><th>Requisito</th><th>GM</th><th>IM</th><th>WGM</th><th>WIM</th></tr><tr><td>Performance</td><td>2600</td><td>2450</td><td>2400</td><td>2250</td></tr><tr><td>Promedio de rivales</td><td>2380</td><td>2230</td><td>2180</td><td>2030</td></tr><tr><td>Piso de un rival</td><td>2200</td><td>2050</td><td>2000</td><td>1850</td></tr><tr><td>Rating para el título</td><td>2500</td><td>2400</td><td>2300</td><td>2200</td></tr></table></div><ul><li>Mínimo 9 partidas (art. 1.4.1); al menos 35 % de los puntos (art. 1.4.8).</li><li>Al menos dos federaciones distintas de la propia; máximo 3/5 de la propia y 2/3 de una misma (arts. 1.4.3 y 1.4.4), salvo la excepción del suizo (20 jugadores extranjeros con rating de 3 federaciones, 10 titulados, en cada ronda).</li><li>50 % titulados (sin CM ni WCM); 1/3 y mínimo 3 del título buscado o superior (art. 1.4.5).</li><li>Sin rating: 1400 (art. 1.4.6).</li></ul><p><span class=\"aula-formula\">Rp = Ra + dp</span>, con Ra redondeado al entero (0,5 hacia arriba) y el porcentaje redondeado al entero.</p><div class=\"aula-tabla\"><table><tr><th>Ejemplo (9 rondas, 6½ puntos)</th><th></th></tr><tr><td>Rivales: 2610, 2555, 2480, 2390, 2450, 2302, 2520, 2180, 2410</td><td>El de 2180 sube a 2200</td></tr><tr><td>Promedio</td><td>21 917 ÷ 9 = 2435</td></tr><tr><td>72 % → dp</td><td>+166</td></tr><tr><td><b>Rp</b></td><td><b>2601: norma de GM</b></td></tr></table></div><h3>El título</h3><div class=\"aula-norma\"><b>Art. 1.5</b> Normas por al menos 27 partidas y el rating requerido alguna vez (no hace falta publicado). Si hay una norma posterior al 30-jun-2022, al menos una debe ser de los torneos del art. 1.5.6 (suizo de 40 jugadores con promedio 2000, Olimpiada, clasificatorios a Candidatos o Copa Mundial, eventos EVE, final del nacional individual).</div><p>El árbitro principal firma el certificado IT1 y lo envía al oficial de rating de la federación organizadora (art. 1.8).</p>"
  },
  {
   "id": "titulos-directos",
   "coleccion": "revista-9",
   "titulo": "Títulos directos",
   "articulos": "B.01 · arts. 0.6.2, 1.2 · Tabla de Títulos Directos (desde el 1-ene-2026)",
   "resumen": "Qué campeonatos dan un título o una norma por el puesto o el porcentaje, y qué condiciones lo limitan.",
   "claves": [
    "Oro = primero después del desempate; 1.º compartido = como máximo los 3 mejores tras el desempate; norma = 9 partidas.",
    "Copa Mundial: los 16 mejores reciben el GM; clasificar jugando da el IM.",
    "Copa Mundial Femenina: la ganadora recibe el GM; en la tabla femenina, las 8 mejores reciben el WGM.",
    "Olimpiada: 65 % en 9 partidas da el FM (WFM) y 50 % en 7, el CM (WCM).",
    "Continentales: al menos un tercio o cinco federaciones (lo menor), 10 participantes y 9 rondas (art. 1.2.2).",
    "Sin el rating mínimo del art. 0.6.2 (GM 2300, IM 2200, FM 2100, CM 2000…), el título queda condicionado."
   ],
   "contenido": "<h3>Reglas generales</h3><ul><li><b>Oro:</b> primero después del desempate. <b>1.º compartido:</b> como máximo los 3 mejores tras el desempate. <b>Norma:</b> 9 partidas.</li><li>Continentales y aprobados: al menos un tercio o cinco federaciones (lo menor), 10 participantes y 9 rondas (art. 1.2.2).</li><li>En los porcentajes, una derrota por incomparecencia no cuenta para el mínimo; una victoria por incomparecencia o un descanso cuentan para el mínimo, no para el porcentaje; solo una partida así.</li></ul><div class=\"aula-norma\"><b>Art. 0.6.2</b> Para recibir el título directo de inmediato: GM 2300 · IM 2200 · FM 2100 · CM 2000 · WGM 2100 · WIM 2000 · WFM 1900 · WCM 1800 (con 30 partidas). Si no, queda condicionado. No se aplica a CM y WCM de las Olimpiadas.</div><h3>Algunos eventos (tabla absoluta)</h3><div class=\"aula-tabla\"><table><tr><th>Evento</th><th>Qué da</th></tr><tr><td>Copa Mundial</td><td>16 mejores: GM · clasificar jugando: IM</td></tr><tr><td>Copa Mundial Femenina</td><td>Ganadora: GM · finalista: norma de GM y título de IM</td></tr><tr><td>Olimpiada</td><td>65 % en 9: FM · 50 % en 7: CM</td></tr><tr><td>Mundiales sub-20 y sub-18, +50 y +65</td><td>Oro: GM · 1.º compartido: norma de GM · plata y bronce: IM</td></tr><tr><td>Mundiales sub-16, sub-15, sub-14</td><td>Oro: IM · 1.º compartido: norma de IM · plata y bronce: FM</td></tr><tr><td>Continental individual</td><td>Oro: GM · 1.º compartido: norma de GM · plata y bronce: IM</td></tr><tr><td>Subcontinental individual</td><td>1.º compartido: IM · plata y bronce: norma de IM y FM · 65 % en 9: FM · 50 % en 9: CM</td></tr></table></div><div class=\"aula-nota\">«Clasificar jugando» a la Copa Mundial: terminar dentro de los puestos de clasificación después del desempate; no cuenta quien entra como reemplazo.</div>"
  },
  {
   "id": "equipo-arbitral",
   "coleccion": "revista-9",
   "titulo": "El equipo de arbitraje",
   "articulos": "Leyes 2023 · arts. 11.2.1, 11.3.4, 12.1, 12.2, 12.6, 12.9 · B.01, art. 1.1.5",
   "resumen": "Cómo se reparte el trabajo en un equipo de árbitros y qué deberes le fijan las Leyes al árbitro.",
   "claves": [
    "El jugador acude primero al árbitro de sala, luego al adjunto y por último al principal: no se saltan instancias.",
    "El principal supervisa y aprueba; rara vez decide resultados o hace emparejamientos.",
    "Nadie deja la sala sin que otro árbitro quede en su lugar.",
    "Los errores de un árbitro se corrigen en privado, nunca en público.",
    "Solo se fuma en la zona que designa el árbitro, también cigarrillos electrónicos (art. 11.3.4).",
    "El árbitro no interviene en una partida salvo en los casos que prevén las Leyes (art. 12.6)."
   ],
   "contenido": "<h3>La organización</h3><p>Un principal, adjuntos y auxiliares. El jugador habla primero con el árbitro de sala, luego con el adjunto y por último con el principal. El principal supervisa y aprueba todo. En los grandes eventos FIDE hay además oficiales de emparejamientos y de juego limpio.</p><div class=\"aula-norma\"><b>B.01, art. 1.1.5</b> En un torneo de normas el árbitro principal debe ser AI o AF y siempre debe haber un AI o AF en el recinto.</div><h3>Deberes del árbitro</h3><div class=\"aula-norma\"><b>Arts. 12.1 y 12.2</b> Vela por las Leyes, actúa en el mejor interés de la competencia, garantiza el juego limpio y un buen ambiente, evita que se moleste a los jugadores, supervisa el torneo y toma medidas especiales para jugadores con discapacidad o que necesiten atención médica.</div><div class=\"aula-norma\"><b>Art. 12.6</b> No interviene en una partida salvo en los casos que prevén las Leyes.</div><div class=\"aula-norma\"><b>Arts. 11.2.1 y 11.3.4</b> El recinto de juego incluye la zona para fumar; se fuma solo allí, incluidos los cigarrillos electrónicos.</div><h3>Conducta (los 10 mandamientos)</h3><ul><li>Aplicar siempre las reglas, sin ceder a presiones.</li><li>Rechazar acuerdos espurios y corrupción (Código de Ética, arts. 6.22 y 11.8).</li><li>Sancionar con respeto, sin humillar ni abusar de la autoridad (las sanciones posibles están en el art. 12.9).</li><li>No interferir en el resultado normal de una partida.</li></ul>"
  },
  {
   "id": "relajacion-arbitro",
   "coleccion": "revista-9",
   "titulo": "Relajarse antes de arbitrar",
   "articulos": "Psicología del deporte · Paula Man Reich",
   "resumen": "Tres ejercicios de respiración y una relajación muscular para llegar tranquilo a la ronda.",
   "claves": [
    "La calma ayuda a tomar mejores decisiones bajo presión.",
    "Respiración natural: por la nariz, sin forzar, llenando también el abdomen.",
    "Bostezo-suspiro: sostener el aire unos diez segundos y soltarlo despacio por la boca.",
    "Respiración rítmica: 4 tiempos inhalar, 4 sostener, 4 exhalar, 4 descansar.",
    "Relajación muscular: tensar y soltar por zonas, de los pies a la frente.",
    "Cerrar sosteniendo 5 segundos y exhalando 10, pensando en actuar con eficacia."
   ],
   "contenido": "<h3>Respiración</h3><ol><li><b>Natural:</b> por la nariz, sin forzar; llena los pulmones y nota cómo se ensancha el abdomen.</li><li><b>Bostezo-suspiro:</b> inhala despacio, sostén unos diez segundos y exhala lentamente por la boca.</li><li><b>Rítmica:</b> inhala en 4 tiempos, sostén 4, exhala 4 y descansa 4.</li></ol><h3>Relajación muscular</h3><p>Tensa unos segundos y suelta: brazos, dedos de los pies, empeine, muslos, estómago, pecho y hombros, espalda, cuello, mandíbula y frente. Termina con inhalaciones cortas hasta llenar el pecho.</p><div class=\"aula-nota\">Cierre: sostén el aire cinco segundos y exhala durante diez mientras piensas en cómo vas a actuar con eficacia.</div>"
  },
  {
   "id": "abandono-y-piezas",
   "coleccion": "revista-10",
   "titulo": "Abandonos, piezas caídas y jugadas devueltas",
   "articulos": "Leyes 2023 · arts. 4.7, 5.1.2, 5.2.2, 6.11.2, 7.4, 11.1, 12.2.4, 12.9 · Código de Ética, arts. 6.22 y 11.8",
   "resumen": "Tres casos de sala de Carlos Calleros resueltos con las Leyes vigentes.",
   "claves": [
    "Abandonar pierde la partida, salvo que el rival no pueda dar mate con ninguna serie de jugadas legales: entonces son tablas (art. 5.1.2).",
    "Un rey solo nunca puede dar mate: quien abandona contra un rey solo no pierde.",
    "No es «posición muerta» (art. 5.2.2) si uno de los dos todavía puede dar mate.",
    "Si falta una pieza, se pausa el reloj y se pide ayuda al árbitro (art. 6.11.2); las piezas desplazadas se reponen en el propio tiempo (art. 7.4).",
    "Una jugada soltada no se cambia (art. 4.7): el árbitro no puede autorizar que se devuelva.",
    "Manipular un resultado es una falta disciplinaria (Código de Ética, arts. 6.22 y 11.8)."
   ],
   "contenido": "<h3>Abandonar sin poder perder</h3><div class=\"aula-norma\"><b>Art. 5.1.2</b> Pierde quien declara que abandona (la partida termina de inmediato), salvo que el rival no pueda darle mate con ninguna serie de jugadas legales: entonces el resultado es tablas.</div><p>Caso: una jugadora con dama, dos torres, alfil y cuatro peones quiere abandonar contra un rey solo para que su equipo no sume demasiados puntos. El rey solo no puede dar mate: el abandono da <b>tablas</b>. No es una posición muerta (art. 5.2.2), porque ella sí puede dar mate.</p><div class=\"aula-norma aula-norma-aviso\"><b>Código de Ética, arts. 6.22 y 11.8</b> La manipulación de resultados está prohibida. Si hay indicios de que alguien la indujo, se informa al organizador o a la federación.</div><h3>La pieza que cayó</h3><div class=\"aula-norma\"><b>Arts. 6.11.2 y 7.4</b> Se puede pausar el reloj para pedir ayuda al árbitro (por ejemplo, si falta la pieza de la coronación). Las piezas desplazadas se reponen en el propio tiempo; el árbitro puede sancionar a quien las desplazó.</div><p>No existe el «alfil original»: la jugada vale y la reclamación se rechaza. Pero tomar piezas de otro tablero molesta a otra partida (art. 12.2.4): se devuelve el alfil prestado y, según el caso, se advierte (art. 12.9.1).</p><h3>La jugada devuelta</h3><div class=\"aula-norma\"><b>Art. 4.7</b> Cuando una pieza se suelta en una casilla como jugada legal, no puede moverse a otra casilla en esa jugada.</div><p>El árbitro no puede autorizar que se devuelva una jugada. La partida sigue desde la posición actual, y el acuerdo anterior puede merecer una advertencia a ambos (arts. 11.1 y 12.9.1).</p>"
  },
  {
   "id": "orden-inicial-suizo",
   "coleccion": "revista-10",
   "titulo": "Tarjetas, orden inicial y partidas no jugadas en el suizo",
   "articulos": "C.04.1, C.04.2 y C.04.3 (desde el 1-feb-2026) · C.04.2 arts. 2.1–2.5, 3.4, 3.5 · C.04.3 art. 1.4.3",
   "resumen": "Cómo se numera a los jugadores antes de la primera ronda y qué pasa en el emparejamiento con una partida que no se jugó.",
   "claves": [
    "Orden inicial: rating, título y orden alfabético (C.04.2, art. 2.2).",
    "Orden de títulos: GM, IM, WGM, FM, WIM, CM, WFM, WCM, sin título.",
    "Ningún número (TPN) puede cambiar después de emparejada la cuarta ronda (art. 2.3).",
    "Solo las partidas jugadas cuentan para los colores; la ronda no jugada se ignora (art. 3.4).",
    "Dos jugadores que no jugaron su partida pueden volver a emparejarse (art. 3.5).",
    "En el Sistema Holandés, ganar sin jugar da una flotación descendente (C.04.3, art. 1.4.3)."
   ],
   "contenido": "<h3>El orden inicial</h3><div class=\"aula-norma\"><b>C.04.2, art. 2.2</b> Antes de la primera ronda: 1) fuerza (rating); 2) título FIDE: GM, IM, WGM, FM, WIM, CM, WFM, WCM, sin título; 3) orden alfabético, salvo que se haya anunciado otro criterio.</div><div class=\"aula-tabla\"><table><tr><th>TPN</th><th>Jugador</th><th>Título</th><th>Rating</th></tr><tr><td>2</td><td>Rojas Mena, Andrés</td><td>FM</td><td>2215</td></tr><tr><td>3</td><td>Quesada Ulate, Sofía</td><td>WIM</td><td>2215</td></tr><tr><td>4</td><td>Brenes Mora, Luis</td><td>CM</td><td>2215</td></tr><tr><td>5</td><td>Arias Solano, Pablo</td><td>—</td><td>2215</td></tr></table></div><div class=\"aula-nota\">Antes de 2026 la revista ponía la WIM antes que el FM; el orden vigente es FM, luego WIM. Los títulos nacionales no cuentan.</div><ul><li>Si no hay rating confiable, el árbitro principal lo estima (art. 2.1).</li><li>Los datos se pueden corregir, pero ningún TPN cambia después de emparejada la cuarta ronda (art. 2.3).</li><li>El inscrito tardío no recibe puntos por las rondas que no jugó, salvo que las bases digan otra cosa (art. 2.4).</li></ul><h3>La partida que no se jugó</h3><div class=\"aula-norma\"><b>C.04.2, arts. 3.4 y 3.5</b> Solo las partidas jugadas cuentan para los colores: B-N-u-B se trata como u-B-N-B. Dos jugadores que no jugaron su partida pueden volver a emparejarse.</div><div class=\"aula-norma\"><b>C.04.3, art. 1.4.3</b> Recibe una flotación descendente quien recibe el descanso asignado o quien, sin jugar, suma más puntos que los de una derrota (por ejemplo, una victoria por incomparecencia).</div><div class=\"aula-norma\"><b>C.04.1, regla 3</b> El descanso asignado por el emparejamiento no tiene rival ni color y da los puntos de una victoria, salvo que las bases digan otra cosa; nadie lo recibe dos veces (regla 4).</div>"
  },
  {
   "id": "discapacidad-pautas",
   "coleccion": "revista-10",
   "titulo": "Jugadores con discapacidad",
   "articulos": "Pautas FIDE D.04.12 · Leyes 2023, arts. 4.9, 6.2.6, 8.1.6, 8.4, 12.2.6 y Apéndice D",
   "resumen": "Qué deben prever el organizador y el árbitro para que un jugador con discapacidad juegue en igualdad de condiciones.",
   "claves": [
    "Nadie puede negarse a jugar contra un jugador con discapacidad correctamente emparejado.",
    "El jugador avisa al organizador de sus necesidades al menos 20 días antes.",
    "El asistente que mueve, pulsa el reloj o anota no le cuesta tiempo al jugador con discapacidad (arts. 6.2.6 y 8.1.6).",
    "Las bases deberían liberar al jugador con baja visión de anotar en los últimos 5 minutos, aun con incremento de 30 s.",
    "Apéndice D: dos tableros, jugadas en voz alta y pieza «tocada» al sacarla del orificio.",
    "Si un jugador con discapacidad visual se enfrenta a uno con discapacidad auditiva, el asistente es obligatorio (D.2.11)."
   ],
   "contenido": "<h3>Las pautas (D.04.12)</h3><ul><li>Se aplican en todos los eventos calificados por la FIDE.</li><li>Nadie puede negarse a jugar contra un jugador con discapacidad correctamente emparejado.</li><li>Sedes accesibles o una sede alternativa supervisada.</li><li>El jugador informa sus necesidades al menos 20 días antes.</li><li>Médico del torneo en todo evento; el organizador y el principal tienen el teléfono del hospital.</li><li>Si un jugador no puede pulsar el reloj ni mover, hay asistente, salvo que el rival acepte hacerlo (y entonces el principal puede darle tiempo extra al rival).</li><li>Una partida por mesa, mesas de unos 2 m si hay asistente, pasillos el doble de anchos.</li><li>Los jugadores ciegos, siempre en el mismo lugar y con el mismo asistente.</li></ul><h3>Las Leyes</h3><div class=\"aula-norma\"><b>Arts. 4.9, 6.2.6 y 8.1.6</b> Si un jugador no puede mover, usar el reloj o anotar, puede traer un asistente aceptado por el árbitro. Al jugador sin discapacidad que usa asistente se le ajusta el reloj; a un jugador con discapacidad, no.</div><div class=\"aula-norma\"><b>Art. 8.4</b> Con menos de 5 minutos y sin incremento de 30 s o más, no hay que anotar. Para el jugador con baja visión, las pautas piden extenderlo aun con incremento: debe figurar en las bases.</div><div class=\"aula-norma\"><b>Apéndice D</b> Tablero especial (casillas negras en relieve, piezas con espiga), jugadas anunciadas y repetidas, pieza tocada al sacarla del orificio, anotación en braille, a mano o grabada, y un asistente que puede mover en el tablero del rival, anunciar jugadas, anotar y reclamar por tiempo.</div><div class=\"aula-norma\"><b>Art. 12.2.6</b> El árbitro toma medidas especiales en interés de los jugadores con discapacidad.</div>"
  },
  {
   "id": "rapidas-relampago",
   "coleccion": "revista-10",
   "titulo": "Rápidas y relámpago: Leyes y Mundiales",
   "articulos": "Leyes 2023 · Apéndices A y B, art. 6.7.1 · Reglamento de los Mundiales de Rápidas y Relámpago 2025",
   "resumen": "Cuándo una partida es rápida o relámpago, qué cambia con o sin supervisión adecuada y cómo se organizó el último Mundial.",
   "claves": [
    "Rápida: más de 10 y menos de 60 minutos (base + 60 × incremento); relámpago: 10 o menos (arts. A.1 y B.1).",
    "Con supervisión adecuada rigen las Reglas de Competición: rápidas, un árbitro para 3 partidas como máximo; relámpago, uno por partida (A.4 y B.2).",
    "Sin supervisión adecuada, la jugada ilegal no reclamada antes de que el rival juegue se mantiene (A.5.2).",
    "Las sanciones de los arts. 7 y 9 son de 1 minuto (A.3).",
    "Si las bases no fijan el tiempo de espera, es cero (art. 6.7.1).",
    "Mundial 2025: rápidas a 13 rondas 15'+10\"; relámpago con 19 rondas de suizo 3'+2\" y eliminación entre 4; sin tiempo de espera."
   ],
   "contenido": "<h3>Las Leyes</h3><div class=\"aula-norma\"><b>Arts. A.1 y B.1</b> Rápida: más de 10 y menos de 60 minutos por jugador, contando base + 60 × incremento. Relámpago: 10 minutos o menos. 15'+10\" = 25 min (rápida); 3'+2\" = 5 min (relámpago).</div><div class=\"aula-norma\"><b>A.4 y B.2</b> Rigen las Reglas de Competición si un árbitro supervisa como máximo tres partidas (rápidas) o una (relámpago) y cada partida se anota.</div><div class=\"aula-norma\"><b>A.5</b> Si no: después de 10 jugadas de cada uno ya no se cambia el reloj (salvo que se afecte el calendario) ni se reclama por el tablero mal colocado; la jugada ilegal no reclamada antes de que el rival juegue se mantiene; el árbitro canta la caída de bandera si la ve.</div><div class=\"aula-norma\"><b>A.3</b> Las sanciones de los arts. 7 y 9 son de 1 minuto en lugar de 2.</div><div class=\"aula-norma aula-norma-aviso\"><b>Art. 6.7.1</b> Las bases fijan el tiempo de espera; si no lo hacen, es cero.</div><h3>El Mundial 2025 (Doha)</h3><div class=\"aula-tabla\"><table><tr><th></th><th>2025</th></tr><tr><td>Participan</td><td>2550 o más en cualquier lista de 2025 y campeones nacionales</td></tr><tr><td>Rápidas</td><td>Suizo a 13 rondas, 15'+10\", Apéndice A.5</td></tr><tr><td>Relámpago</td><td>Suizo a 19 rondas, 3'+2\", y eliminación entre 4 (matches a 4 partidas), Apéndice B.3</td></tr><tr><td>Tiempo de espera</td><td>No hay</td></tr><tr><td>Desempates</td><td>Buchholz -1, Buchholz, AROC 1, encuentro directo, sorteo</td></tr><tr><td>Salir de la zona</td><td>Solo con permiso y acompañado; si no, pierde</td></tr><tr><td>Árbitros</td><td>Principal, adjunto, dos oficiales de emparejamientos, uno por cada 10 partidas</td></tr><tr><td>Protesta</td><td>Depósito de 300 €</td></tr></table></div>"
  },
  {
   "id": "ideas-irracionales",
   "coleccion": "revista-10",
   "titulo": "Ideas irracionales bajo presión",
   "articulos": "Psicología del deporte · Paula Man Reich",
   "resumen": "Las creencias sin fundamento que afectan el rendimiento del árbitro y cómo refutarlas.",
   "claves": [
    "El primer paso es reconocer que una idea es irracional.",
    "La perfección no existe: la meta es equivocarse lo menos posible y mejorar.",
    "De un error se aprende si se analiza su causa.",
    "Predecir una mala actuación tiende a cumplirse.",
    "Las condiciones difíciles son parte del trabajo, no una excusa.",
    "Para refutar una idea irracional hacen falta hechos reales, no solo buenos deseos."
   ],
   "contenido": "<h3>Las más comunes</h3><ul><li>«Seré el mejor si no cometo errores»: la perfección no existe.</li><li>«De los errores no se aprende»: se aprende si se analiza la causa.</li><li>«Si empiezo mal, seguiré mal»: es una profecía que tiende a cumplirse.</li><li>«Si no sale como espero, me frustraré»: un error no borra lo bueno.</li><li>La falacia de las condiciones ideales: culpar a otros de los propios fallos.</li><li>Generalizar a partir de una sola situación.</li><li>Creer que la autocrítica dura ayuda: suele producir el efecto contrario.</li></ul><div class=\"aula-nota\">Cuantos más hechos reales tengas para refutar una idea irracional, más fácil será que la sustituyan pensamientos razonables y positivos.</div>"
  },
  {
   "id": "bandera-y-mate-posible",
   "coleccion": "revista-11",
   "titulo": "Caída de bandera: ¿gana el rival o son tablas?",
   "articulos": "Leyes 2023 · arts. 5.1, 5.2, 6.3.1, 6.4, 6.9, A.5.3 · Reglamento en Línea arts. 4.3 y 15.4",
   "resumen": "Quien no completa sus jugadas en el tiempo pierde, salvo que el rival no pueda darle mate con ninguna serie de jugadas legales.",
   "claves": [
    "Art. 6.9: quien no completa las jugadas en el tiempo asignado pierde la partida.",
    "Excepción: tablas si el rival no puede dar mate con ninguna serie posible de jugadas legales.",
    "Antes, se comprueba que la partida no hubiera terminado ya: mate, abandono, ahogado, posición muerta o acuerdo.",
    "La pregunta no es si el rival puede ganar jugando bien, sino si existe alguna serie legal, aunque sea absurda, que termine en mate.",
    "Rey y caballo contra rey solo son tablas; contra rey con otras piezas casi siempre existe un mate posible.",
    "En línea (FIDE): la plataforma aplica el mismo criterio, y el árbitro puede corregir unas tablas automáticas mal declaradas (art. 15.4)."
   ],
   "contenido": "<h3>Qué dice la norma</h3><div class=\"aula-norma\"><b>Arts. 6.3.1 y 6.4</b> Cada jugador debe completar un número mínimo de jugadas, o todas, en el tiempo asignado (que puede incluir tiempo adicional por jugada). Inmediatamente después de una caída de bandera se comprueba si lo cumplió.</div><div class=\"aula-norma\"><b>Art. 6.9</b> Salvo que se aplique el 5.1.1 (mate), 5.1.2 (abandono), 5.2.1 (ahogado), 5.2.2 (posición muerta) o 5.2.3 (acuerdo), quien no completa las jugadas en el tiempo <b>pierde</b>. Pero es <b>tablas</b> si el rival no puede darle mate con ninguna serie posible de jugadas legales.</div><div class=\"aula-norma aula-norma-aviso\"><b>Rápidas y relámpago sin supervisión adecuada (A.5.3, B.3).</b> Quien reclama la victoria por tiempo puede detener el reloj y avisar al árbitro; es tablas si quien reclama no puede dar mate con ninguna serie de jugadas legales.</div><div class=\"aula-norma\"><b>Reglamento FIDE de Ajedrez en Línea, arts. 4.3 y 15.4</b> La plataforma da la victoria por tiempo o declara tablas con el mismo criterio; si declara tablas cuando sí había posibilidades de mate, el árbitro puede modificar el resultado.</div><h3>El orden de preguntas</h3><ol><li>¿Terminó la partida antes de la caída (mate, abandono, ahogado, posición muerta, acuerdo)? Ese resultado manda.</li><li>Si no, el jugador sin tiempo pierde…</li><li>…salvo que su rival no pueda darle mate con ninguna serie de jugadas legales: tablas.</li></ol><h3>Los dos casos de la revista</h3><p><b>Buho21.</b> Blancas: Rh3, Th4, Th1, Cf1; negras: Rf2, Cf7. A las blancas se les acaba el tiempo. Existe 1.Th2+ Rf3 2.Cg3 Cg5#: <b>ganan las negras</b>, como decidió el servidor.</p><p><b>Internet Chess Club.</b> Blancas: Rd6, Cd7; negras: Rb6, Tc4, Ab2, Cc1, peón a5. La última jugada fue Cd7+ y a las negras se les acaba el tiempo. Existe 1…Rb5 2.Rd5 Ra4 3.Rxc4 Aa3 4.Cb6#: <b>ganan las blancas</b>. El servidor declaró tablas y se equivocó.</p><div class=\"aula-nota\">Ambas secuencias se comprobaron con un validador de reglas: son legales y terminan en mate. No hace falta que sean buenas jugadas: basta que sean legales.</div>"
  },
  {
   "id": "suizo-grupos-flotadores",
   "coleccion": "revista-11",
   "titulo": "Sistema suizo: grupos de puntuación, MDP y flotaciones",
   "articulos": "C.04.1 (2026) · art. 5 · C.04.3 Sistema Holandés (2026) · arts. 1.3, 1.4, 1.7, 3.1–3.3",
   "resumen": "Cómo se forman los grupos que se emparejan, qué pasa con el jugador que sobra y quién recibe flotación descendente o ascendente.",
   "claves": [
    "Grupo de puntuación: todos los jugadores con la misma puntuación.",
    "Grupo de emparejamiento: los residentes de un grupo de puntuación más los que quedaron sin pareja en el anterior; homogéneo si todos tienen la misma puntuación.",
    "El que sobra en un grupo baja al siguiente: es un descendido y allí se le llama MDP.",
    "En un grupo heterogéneo se emparejan primero los MDP; los residentes que quedan (el resto) se emparejan como un grupo homogéneo.",
    "Flotación descendente para el de mayor puntuación y ascendente para el de menor, tras jugar entre sí.",
    "El descanso asignado (PAB) y ganar sin jugar también dan flotación descendente."
   ],
   "contenido": "<h3>Definiciones del Sistema Holandés (2026)</h3><div class=\"aula-norma\"><b>Art. 1.3</b> Un <b>grupo de puntuación</b> son todos los jugadores con la misma puntuación. Un <b>grupo de emparejamiento</b> está formado por los <b>residentes</b> de un grupo de puntuación y, posiblemente, por quienes quedaron sin pareja en el grupo anterior. Es <b>homogéneo</b> si todos tienen la misma puntuación; si no, <b>heterogéneo</b>. El <b>resto</b> es la parte de un grupo heterogéneo con algunos de sus residentes.</div><div class=\"aula-norma\"><b>Art. 1.4.1</b> El jugador que queda sin pareja y baja al grupo siguiente es un <b>descendido</b>; en el grupo de destino se le llama <b>MDP</b> (<i>moved-down player</i>).</div><div class=\"aula-norma\"><b>Arts. 1.4.2 a 1.4.4</b> Tras jugar dos jugadores de distinta puntuación, el de mayor clasificación recibe <b>flotación descendente</b> y el otro <b>ascendente</b>. También recibe flotación descendente quien recibe el PAB o quien, sin jugar, suma más que una derrota. Nadie más recibe flotaciones.</div><div class=\"aula-norma\"><b>Art. 1.7.4</b> Quien no ha jugado ninguna partida no tiene preferencia de color.</div><h3>Cómo se empareja un grupo heterogéneo</h3><p>Primero el <b>emparejamiento MDP</b>: los MDP (en S1) contra residentes (en S2). Los residentes que quedan forman el <b>resto</b>, que se empareja como un grupo homogéneo. Los MDP que no se pueden emparejar quedan en el <b>limbo</b> y vuelven a bajar (art. 3.2.4).</p><div class=\"aula-norma aula-norma-aviso\"><b>Regla derogada.</b> «Un grupo heterogéneo con al menos la mitad de jugadores de grupos superiores se trata como homogéneo» pertenecía a una versión antigua; el texto de 2026 no la contiene.</div><h3>El ejemplo de la revista</h3><p>Tras la ronda 1, grupo de 1 punto: 1, 11, 12, 14, 16. El 1, el 12 y el 16 jugaron con blancas; el 11 con negras; el 14 ganó por incomparecencia (sin color). S1 = 1, 11; S2 = 12, 14, 16.</p><div class=\"aula-tabla\"><table><tr><th>Candidato</th><th>¿Perfecto?</th></tr><tr><td>1–12, 11–14 (baja el 16)</td><td>No: 1 y 12 prefieren negras.</td></tr><tr><td>1–12, 11–16 (baja el 14)</td><td>No: mismo problema.</td></tr><tr><td><b>1–14, 11–12 (baja el 16)</b></td><td><b>Sí</b>: todos reciben su preferencia de color.</td></tr></table></div><div class=\"aula-nota\">En la práctica, los emparejamientos se hacen y comprueban con programas aceptados por la FIDE: distintos árbitros o programas deben llegar al mismo resultado (Reglas Generales para Torneos Suizos, art. 1.4).</div>"
  },
  {
   "id": "round-robin-berger",
   "coleccion": "revista-11",
   "titulo": "Round robin: fórmulas, tablas Berger y retiros",
   "articulos": "C.05 · arts. 5.1–5.3, 6.1–6.3, 6.6 · Anexos 1 y 2 · C.07 (2026) · arts. 6, 7.1, 8, 9.1, 9.2",
   "resumen": "Cuántas rondas y partidas tiene un todos contra todos, cómo se hace la tabla Berger y qué pasa si alguien se retira.",
   "claves": [
    "Rondas: n − 1 con número par de jugadores; n con número impar (uno descansa cada ronda).",
    "Partidas del torneo a una vuelta: n(n − 1) ÷ 2 (20 jugadores: 190; 19 jugadores: 171).",
    "Los emparejamientos se hacen con las tablas Berger (C.05, Anexo 1); con número impar, el número más alto es el descanso.",
    "Los números se sortean; no se asignan por rating ni por título, salvo que las bases digan otra cosa.",
    "A doble vuelta se recomienda invertir las dos últimas rondas de la primera vuelta, para evitar tres colores iguales seguidos.",
    "Si un jugador se retira con menos del 50 % de sus partidas jugadas, sus resultados no cuentan para la clasificación."
   ],
   "contenido": "<h3>Fórmulas</h3><div class=\"aula-tabla\"><table><tr><th></th><th>n par</th><th>n impar</th></tr><tr><td>Rondas</td><td>n − 1</td><td>n</td></tr><tr><td>Partidas por ronda</td><td>n ÷ 2</td><td>(n − 1) ÷ 2</td></tr><tr><td>Partidas del torneo</td><td colspan=\"2\">n(n − 1) ÷ 2</td></tr></table></div><div class=\"aula-nota\">Fe de erratas de la revista: con 19 jugadores son 9 × 19 = 171 partidas, no 9 × 18 = 162. Y una eliminación directa con 20 jugadores tiene 5 rondas de matches, no 6.</div><h3>Qué dice la FIDE</h3><div class=\"aula-norma\"><b>C.05, arts. 5.1 y 5.3</b> Los emparejamientos de un round robin se hacen con las tablas Berger (Anexo 1), ajustadas para la doble vuelta. El sorteo restringido (por ejemplo, para que los de una misma federación no se enfrenten al final) puede hacerse con las tablas Varma (Anexo 2), para 9 a 24 jugadores.</div><div class=\"aula-norma\"><b>C.05, arts. 6.1 a 6.3</b> El sorteo y los emparejamientos son responsabilidad del árbitro principal. En los niveles L1 y L2, el sorteo de un round robin se hace al menos 12 horas antes de la primera ronda.</div><div class=\"aula-norma\"><b>C.05, art. 6.6</b> Retiro con menos del 50 % de las partidas completadas: los resultados quedan en la tabla para el rating, pero no cuentan para la clasificación. Con el 50 % o más, cuentan.</div><div class=\"aula-norma aula-norma-aviso\"><b>C.07 (2026), nota del art. 8.</b> El Buchholz y sus variantes no deben usarse en round robin. Sí: encuentro directo (6), victorias (7.1), Sonneborn-Berger (9.1) y Koya (9.2).</div><h3>La tabla de 8 jugadores</h3><div class=\"aula-tabla\"><table><tr><th>Ronda</th><th>Mesa 1</th><th>Mesa 2</th><th>Mesa 3</th><th>Mesa 4</th></tr><tr><td>1</td><td>1–8</td><td>2–7</td><td>3–6</td><td>4–5</td></tr><tr><td>2</td><td>8–5</td><td>6–4</td><td>7–3</td><td>1–2</td></tr><tr><td>3</td><td>2–8</td><td>3–1</td><td>4–7</td><td>5–6</td></tr><tr><td>4</td><td>8–6</td><td>7–5</td><td>1–4</td><td>2–3</td></tr><tr><td>5</td><td>3–8</td><td>4–2</td><td>5–1</td><td>6–7</td></tr><tr><td>6</td><td>8–7</td><td>1–6</td><td>2–5</td><td>3–4</td></tr><tr><td>7</td><td>4–8</td><td>5–3</td><td>6–2</td><td>7–1</td></tr></table></div><p><b>Comprobaciones:</b> en la ronda 1 todas las mesas suman n + 1; en la ronda 2, la última mesa es 1–2; en la última ronda juegan el penúltimo y el 1; en la penúltima ronda, salvo la mesa 1, todas suman n − 1; quien lleva negras en la última mesa enfrenta al último jugador en la ronda siguiente.</p>"
  },
  {
   "id": "calentamiento-mental",
   "coleccion": "revista-11",
   "titulo": "Calentamiento mental antes de arbitrar",
   "articulos": "Psicología del deporte · Paula Man Reich",
   "resumen": "Tres ejercicios breves para empezar la ronda con control de las emociones y de las decisiones.",
   "claves": [
    "El objetivo es hacer bien el trabajo desde el primer minuto de la ronda.",
    "Primer ejercicio: elegir cómo quieres sentirte y repetir tres veces cada frase.",
    "Segundo ejercicio: frases de autorresponsabilidad («Estoy eligiendo…», «Elijo no…», «Hoy quiero…»).",
    "Tercer ejercicio: cambiar el «no puedo» por «no lo haré», «yo puedo», «yo elijo».",
    "Las ideas irracionales se controlan refutándolas con hechos reales, no solo con buenos deseos.",
    "Funciona con práctica constante, no por intentarlo una sola vez."
   ],
   "contenido": "<h3>Para qué sirve</h3><p>Así como repasas las reglas antes de arbitrar, también puedes preparar la mente. Los calentamientos mentales buscan que hagas bien tu trabajo desde el inicio de la ronda y que quede claro que <b>tú</b> estás a cargo de tus acciones y decisiones, no los sucesos externos ni las otras personas.</p><h3>Los ejercicios</h3><ol><li><b>Elegir cómo sentirte.</b> «Estoy a gusto de estar aquí porque…», «Voy a controlar mis…». Tres repeticiones de cada frase.</li><li><b>Autorresponsabilidad.</b> «Estoy eligiendo estar tranquilo y confiado», «Elijo no responder mal si un jugador me habla con mala actitud», «Hoy quiero hacer bien mi trabajo y disfrutarlo».</li><li><b>Cambiar el «no puedo».</b> Por «no lo haré», «yo puedo», «yo elijo»: frases que te dan más poder personal.</li></ol><div class=\"aula-nota\">Las ideas irracionales se vencen con hechos: cuantos más hechos reales tengas para refutarlas, más fácil será que los pensamientos razonables las sustituyan.</div>"
  },
  {
   "id": "supervision-relojes",
   "coleccion": "revista-12",
   "titulo": "Supervisar el tiempo de los relojes",
   "articulos": "Leyes 2023 · arts. 6.1, 6.3, 6.6, 6.10, 6.11.1, 12.3, 12.6 · C.02 (2026) · arts. 3.1.10 y 3.3.3",
   "resumen": "Cómo comprobar en la sala que los dos relojes suman exactamente el tiempo que lleva la ronda, con y sin incremento.",
   "claves": [
    "Trabaja con tiempos consumidos: tiempo asignado menos lo que marca el reloj.",
    "Sin incremento: consumido de blancas + consumido de negras = tiempo de la ronda (menos las pausas).",
    "Con incremento hay que devolver los incrementos recibidos: pensado = (asignado − reloj) + incrementos.",
    "Los relojes que cumplen la norma FIDE suman el incremento antes de la primera jugada: un incremento más que jugadas completadas.",
    "Si la suma no cuadra, busca la causa: la suma no dice cuál de los dos relojes falla.",
    "Reloj defectuoso: se sustituye (6.10.1). Configuración incorrecta: se detiene y se corrige (6.10.2)."
   ],
   "contenido": "<h3>Qué dice la norma</h3><div class=\"aula-norma\"><b>Art. 12.3</b> El árbitro observa las partidas, especialmente cuando los jugadores están cortos de tiempo. <b>Art. 12.4</b> Puede nombrar asistentes para ello.</div><div class=\"aula-norma\"><b>Art. 6.10.1</b> Las indicaciones del reloj son concluyentes salvo defecto evidente; un reloj defectuoso lo sustituye el árbitro, que fija los tiempos con su mejor criterio. <b>Art. 6.10.2</b> Si la configuración es incorrecta, cualquiera de los jugadores o el árbitro detiene el reloj; el árbitro corrige la configuración y ajusta tiempos y contador.</div><div class=\"aula-norma aula-norma-aviso\"><b>Art. 12.6</b> El árbitro no indica el número de jugadas completadas ni avisa a un jugador de que su rival jugó o de que no pulsó el reloj.</div><h3>Las fórmulas</h3><p><span class=\"aula-formula\">consumido = asignado − reloj</span></p><p><span class=\"aula-formula\">pensado = consumido + incrementos recibidos</span></p><p><span class=\"aula-formula\">tiempo de la ronda = pensado de blancas + pensado de negras</span></p><h3>Ejemplos de la revista</h3><div class=\"aula-tabla\"><table><tr><th>Datos</th><th>Blancas</th><th>Negras</th><th>Ronda</th></tr><tr><td>2 h, sin incremento, a las 3 h</td><td>120 − 33 = 87</td><td>120 − 27 = 93</td><td>180 ✓</td></tr><tr><td>90 min + 30 s, 34 jugadas, a la hora</td><td>(90 − 74) + 17 = 33</td><td>(90 − 80) + 17 = 27</td><td>60 ✓</td></tr><tr><td>2 h + 30 s, 38 jugadas, a las 3 h; relojes 60 y 40</td><td>60 + 19 = 79</td><td>80 + 19 = 99</td><td>178 ≠ 180</td></tr></table></div><div class=\"aula-nota\">Las especificaciones FIDE (C.02, art. 3.3.3) piden que, en modo Fischer, el incremento se sume antes de la primera jugada: con esos relojes cuenta un incremento más por jugador. Revisa cómo trabaja el modelo de tu torneo.</div><div class=\"aula-nota\">Ya no se recomienda poner un minuto extra en los relojes analógicos «para que caiga la bandera»: cambia el tiempo asignado (art. 6.3.1).</div>"
  },
  {
   "id": "reloj-programacion-sanciones",
   "coleccion": "revista-12",
   "titulo": "Programar el reloj y ajustarlo tras una sanción",
   "articulos": "Leyes 2023 · arts. 6.3.2, 7.1, 7.5.5, 9.5.3, A.3, 11.5 · C.02 (2026) · Reglas generales art. 8, Equipos electrónicos art. 3, lista C.02.04",
   "resumen": "Qué exige hoy la FIDE a un reloj, cómo programar el incremento y qué tiempo sumar por un reclamo incorrecto o una jugada ilegal.",
   "claves": [
    "Reclamo incorrecto de tablas por repetición o 50 jugadas: 2 minutos al rival (1 en rápidas y relámpago).",
    "Jugada ilegal: 2 minutos al rival la primera vez (1 en rápidas y relámpago); la segunda, pierde.",
    "Tras volver a una posición anterior, ajusta también el contador de jugadas (art. 7.1).",
    "En torneos L1 se exigen relojes avalados por la FIDE; en L2 y L3 hay más tolerancia (C.02, art. 8).",
    "El Game Time II no figura en la lista FIDE de relojes con aceptación técnica (2026).",
    "En el Game Time II, el incremento (ACCUM) solo actúa en el periodo final salvo que se active ACCUM ALL."
   ],
   "contenido": "<h3>Sanciones que obligan a tocar el reloj</h3><div class=\"aula-norma\"><b>Art. 9.5.3</b> Si un reclamo de tablas (art. 9.2 o 9.3) es incorrecto, el árbitro suma <b>dos minutos</b> al tiempo del rival y la partida continúa; si se basaba en una jugada que se quería hacer, esa jugada se hace. Antes de 2014 eran tres minutos.</div><div class=\"aula-norma\"><b>Arts. 7.1 y 7.5.5</b> Tras restablecer una posición anterior, el árbitro fija los tiempos con su mejor criterio (puede no cambiarlos) y ajusta el contador. Primera jugada ilegal completada: <b>2 minutos</b> al rival; segunda: pierde, salvo que el rival no pueda dar mate.</div><div class=\"aula-norma aula-norma-aviso\"><b>Art. A.3</b> En rápidas y relámpago, esas sanciones son de <b>un minuto</b>.</div><h3>Qué exige la FIDE a un reloj</h3><div class=\"aula-norma\"><b>C.02, Equipos con componentes electrónicos, art. 3</b> Precisión de ±1 segundo por hora; se ve desde todos lados qué reloj corre; ambos se detienen tras la caída en el último periodo; programación manual de hasta 4 periodos con incremento; incremento Fischer sumado antes de la primera jugada; alarma que se pueda apagar; conserva el último programa.</div><div class=\"aula-norma\"><b>C.02, Reglas generales, art. 8</b> L1: productos avalados (o aceptados si no hay avalados). L2: avalados recomendados, aceptados tolerados. L3: avalados y aceptados recomendados; el árbitro principal puede autorizar otros.</div><h3>El Game Time II</h3><ul><li>Configuraciones preestablecidas (96; las 92 a 96 son U1 a U5).</li><li>Incremento: ACCUM en ON (30 s de fábrica, hasta 60); para varios controles con incremento desde la jugada 1, ACCUM ALL en ON.</li><li>Retardo (DELAY) de 1 a 19 segundos; no funciona a la vez que ACCUM.</li><li>Ajuste de tiempos: PAUSE, SELECT hasta horas o minutos de cada reloj, WHITE suma y COUNTER resta, VERIFY y PLAY.</li></ul><div class=\"aula-nota\">Ejemplo: blancas 40:00, negras 35:00; las blancas reclaman mal una triple repetición. Negras a 37:00; blancas siguen con 40:00.</div>"
  },
  {
   "id": "prefacio-leyes",
   "coleccion": "revista-12",
   "titulo": "El prefacio de las Leyes del Ajedrez",
   "articulos": "Leyes 2023 · arts. 0.1, 0.2, 12.1, 12.9",
   "resumen": "Por qué las Leyes no regulan cada caso y qué perfil de árbitro suponen: competencia, buen juicio y objetividad absoluta.",
   "claves": [
    "Las Leyes no pueden cubrir todas las situaciones ni todas las cuestiones administrativas.",
    "Lo no regulado se resuelve estudiando situaciones análogas que sí están reguladas.",
    "Suponen árbitros con competencia, buen juicio y objetividad absoluta.",
    "Una regla demasiado detallada quitaría al árbitro la libertad de buscar la solución que dicten la equidad, la lógica y los factores especiales.",
    "Para que una partida se evalúe para el rating FIDE, debe jugarse según las Leyes de la FIDE.",
    "El texto auténtico es el inglés, y las federaciones pueden pedir a la FIDE una interpretación."
   ],
   "contenido": "<h3>Qué dice el prefacio</h3><div class=\"aula-norma\"><b>Art. 0.2</b> Las Leyes no pueden cubrir todas las situaciones de una partida ni regular todas las cuestiones administrativas. Cuando un caso no esté regulado con precisión, debe poder llegarse a una decisión correcta estudiando situaciones análogas reguladas. Las Leyes suponen que los árbitros tienen la competencia, el buen juicio y la objetividad absoluta necesarios. Una regla demasiado detallada podría quitarles la libertad de criterio para encontrar la solución que dicten la equidad, la lógica y los factores especiales.</div><div class=\"aula-norma\"><b>Art. 0.2 (además)</b> Para que una partida se evalúe para el rating FIDE, debe jugarse según las Leyes de la FIDE; se recomienda usarlas también en partidas de competición no evaluadas; las federaciones pueden pedir a la FIDE una interpretación.</div><div class=\"aula-norma\"><b>Art. 0.1</b> Las Leyes cubren el juego sobre el tablero, tienen dos partes (Reglas Básicas y Reglas de Competición) y su texto auténtico es el inglés.</div><h3>Los tres requisitos</h3><div class=\"aula-tabla\"><table><tr><th>Término</th><th>Para el árbitro</th></tr><tr><td>Competencia</td><td>Pericia e idoneidad: conocer las normas y saber aplicarlas.</td></tr><tr><td>Buen juicio</td><td>Distinguir lo correcto de lo incorrecto y decidir con sensatez.</td></tr><tr><td>Objetividad absoluta</td><td>Imparcialidad, sin consideraciones personales.</td></tr></table></div><div class=\"aula-nota\">Por eso el art. 12.9 da al árbitro un abanico de sanciones en lugar de una sanción fija para cada falta.</div>"
  },
  {
   "id": "conducta-en-sala",
   "coleccion": "revista-12",
   "titulo": "Comportamiento en sala y síndrome de la mesa 1",
   "articulos": "Leyes 2023 · arts. 4.1, 4.3.1, 4.4, 11.10, 12.2, 12.3, 12.7, 12.8",
   "resumen": "Padres, entrenadores, jugadores y árbitros: qué permiten las Leyes y por qué todas las mesas merecen la misma atención.",
   "claves": [
    "Cada jugada se hace con una sola mano (4.1).",
    "Tocar deliberadamente primero la torre y luego el rey impide enrocar por ese lado en esa jugada (4.4.2).",
    "Quien observe una irregularidad solo puede informar al árbitro; los espectadores no intervienen (12.7).",
    "Sin autorización del árbitro, nadie usa teléfonos en la sala ni en las zonas designadas (12.8).",
    "El jugador puede apelar las decisiones del árbitro, salvo que las bases digan otra cosa (11.10).",
    "Todas las mesas importan: un problema puede aparecer en cualquiera."
   ],
   "contenido": "<h3>El enroque de la anécdota</h3><div class=\"aula-norma\"><b>Art. 4.4</b> Si el jugador con el turno toca el rey y una torre, debe enrocar con ella si es legal (4.4.1). Si toca deliberadamente primero una torre y luego el rey, no puede enrocar por ese lado en esa jugada y se aplica el 4.3.1 (mover la primera pieza tocada que pueda moverse) (4.4.2). Si toca el rey y luego una torre para enrocar y ese enroque es ilegal, debe hacer otra jugada legal con el rey, que puede ser el enroque con la otra torre (4.4.3).</div><h3>Padres, entrenadores y espectadores</h3><div class=\"aula-norma\"><b>Art. 12.7</b> Quien observe una irregularidad solo puede informar al árbitro. Los jugadores de otras partidas no hablan de ellas ni intervienen; los espectadores tampoco. El árbitro puede expulsar a los infractores.</div><div class=\"aula-norma\"><b>Art. 12.8</b> Sin autorización del árbitro, nadie puede usar un teléfono u otro aparato de comunicación en la sala ni en las zonas contiguas designadas.</div><div class=\"aula-norma\"><b>Art. 11.10</b> El jugador puede apelar cualquier decisión del árbitro, aunque haya firmado la planilla, salvo que las bases digan otra cosa.</div><h3>El síndrome de la mesa 1</h3><p>Los árbitros nuevos tienden a quedarse junto a la mesa de los mejores jugadores. Pero el art. 12.2 obliga al árbitro a supervisar toda la competencia, mantener un buen ambiente y procurar que nadie sea molestado, y el 12.3 a observar las partidas, sobre todo cuando hay apuro de tiempo: en cualquier mesa.</p><div class=\"aula-nota\">Carlos Calleros: «¿En qué mesa aparecerá un problema? ¡En cualquiera!».</div>"
  },
  {
   "id": "habilidades-psicologicas",
   "coleccion": "revista-12",
   "titulo": "Habilidades psicológicas del árbitro",
   "articulos": "Psicología del deporte · Paula Man Reich",
   "resumen": "Ocho habilidades mentales que el árbitro despliega, a veces sin saberlo, y que puede desarrollar.",
   "claves": [
    "Tolerancia a la frustración: confianza y eficacia bajo presión.",
    "Adaptabilidad: ser eficaz cuando el entorno cambia.",
    "Resistencia: perseverar hasta resolver.",
    "Análisis de problemas: causa y solución rápidas, con pocas consecuencias negativas.",
    "Creatividad e iniciativa: proponer soluciones nuevas y actuar en vez de esperar.",
    "Energía y automotivación: mantener la actividad y motivarse por las propias metas."
   ],
   "contenido": "<h3>Las ocho habilidades</h3><div class=\"aula-tabla\"><table><tr><th>Habilidad</th><th>Qué es</th></tr><tr><td>Tolerancia a la frustración</td><td>Mantener la acción y la confianza bajo presión.</td></tr><tr><td>Adaptabilidad</td><td>Ser eficaz en un entorno cambiante.</td></tr><tr><td>Resistencia</td><td>Perseverar hasta resolver, sin importar los intentos.</td></tr><tr><td>Análisis de problemas</td><td>Identificar el problema, sus causas y la solución en poco tiempo.</td></tr><tr><td>Creatividad</td><td>Soluciones nuevas cuando las convencionales no sirven.</td></tr><tr><td>Iniciativa</td><td>Actuar en lugar de aceptar pasivamente.</td></tr><tr><td>Energía</td><td>Crear y mantener un nivel óptimo de actividad.</td></tr><tr><td>Automotivación</td><td>Motivarse constantemente por las propias metas.</td></tr></table></div><div class=\"aula-nota\">Pregúntate: ¿cuáles posees hoy? ¿Cuáles podrías desarrollar?</div>"
  },
  {
   "id": "ajedrez960-posicion",
   "coleccion": "revista-13",
   "titulo": "Ajedrez960: la posición inicial",
   "articulos": "Leyes 2023 · Directrices II.1 y II.2",
   "resumen": "Las tres condiciones de la posición inicial, cómo sortearla con un dado y cómo leer la numeración SP 0-959.",
   "claves": [
    "II.1: se sortea la posición inicial y después se juega como el ajedrez normal.",
    "II.2.1: el rey va entre las dos torres (nunca en a1 ni en h1).",
    "II.2.2: los alfiles van en casillas de distinto color.",
    "II.2.3: las negras se colocan en espejo frente a las blancas; los peones, como siempre.",
    "Son 960 posiciones; la clásica es la SP 518.",
    "Con el dado: alfil oscuro, alfil claro, dama, dos caballos y, al final, torre-rey-torre en las tres casillas que quedan."
   ],
   "contenido": "<h3>Qué dice la norma</h3><div class=\"aula-norma\"><b>Directrices II.1</b> Antes de la partida se sortea la posición inicial, con ciertas reglas. Después se juega igual que el ajedrez normal.</div><div class=\"aula-norma\"><b>Directrices II.2</b> Los peones blancos van en la segunda fila. Las demás piezas blancas se colocan al azar en la primera fila: <b>II.2.1</b> el rey entre las dos torres; <b>II.2.2</b> los alfiles en casillas de distinto color; <b>II.2.3</b> las negras en espejo.</div><h3>El sorteo con un dado</h3><ol><li>Alfil oscuro: 1-a1, 2-c1, 3-e1, 4-g1 (5 o 6, se repite).</li><li>Alfil claro: 1-b1, 2-d1, 3-f1, 4-h1.</li><li>Dama: una de las 6 casillas vacías, contando desde la izquierda.</li><li>Caballos: una de las 5 y luego una de las 4 que quedan.</li><li>Las 3 casillas finales: torre, rey, torre.</li></ol><h3>La numeración SP</h3><p>Cada posición tiene un número del 0 al 959. Para pasar de número a posición:</p><p><span class=\"aula-formula\">resto ÷ 4 → alfil claro (b, d, f, h); resto ÷ 4 → alfil oscuro (a, c, e, g); resto ÷ 6 → dama; lo que queda (0-9) → caballos, torres y rey</span></p><div class=\"aula-tabla\"><table><tr><th>Código</th><th>Orden en las 5 vacías</th></tr><tr><td>0-3</td><td>CCTRT, CTCRT, CTRCT, CTRTC</td></tr><tr><td>4-6</td><td>TCCRT, TCRCT, TCRTC</td></tr><tr><td>7-9</td><td>TRCCT, TRCTC, TRTCC</td></tr></table></div><div class=\"aula-nota\">La SP 518 es la posición clásica (TCADRACT). En el ejemplo de la revista, la SP 652 es TACRTDAC.</div>"
  },
  {
   "id": "ajedrez960-enroque",
   "coleccion": "revista-13",
   "titulo": "Ajedrez960: el enroque",
   "articulos": "Leyes 2023 · Directrices II.3 (II.3.1-II.3.2.7) y art. 3.8",
   "resumen": "Dónde quedan el rey y la torre, los cuatro métodos, qué casillas deben estar vacías y cómo se ejecuta en el tablero.",
   "claves": [
    "Un enroque por jugador y por partida, con una sola jugada (II.3.1).",
    "Después de enrocar, rey y torre quedan como en el ajedrez clásico: 0-0-0 rey c1 y torre d1; 0-0 rey g1 y torre f1 (II.3.2.6).",
    "Cuatro métodos: doble movimiento, trasposición, solo el rey, solo la torre.",
    "Las casillas que recorren rey y torre (incluidas las finales) deben estar vacías, salvo las del propio rey y la propia torre.",
    "No se enroca en jaque ni cruzando o llegando a una casilla atacada (art. 3.8).",
    "En el tablero: rey fuera, junto a su casilla final; luego la torre; luego el rey. Y avisa: «voy a enrocar»."
   ],
   "contenido": "<h3>Qué dice la norma</h3><div class=\"aula-norma\"><b>II.3.1</b> Cada jugador puede enrocar una vez por partida, con una jugada que puede mover al rey y a una torre.</div><div class=\"aula-norma\"><b>II.3.2.6 (aclaración)</b> Tras 0-0-0 el rey queda en c1 (c8) y la torre en d1 (d8). Tras 0-0, el rey en g1 (g8) y la torre en f1 (f8).</div><div class=\"aula-norma\"><b>II.3.2.1-II.3.2.4</b> Métodos: doble movimiento (rey y torre), trasposición (se cambian las casillas), solo el rey, solo la torre.</div><div class=\"aula-norma aula-norma-aviso\"><b>Nota 4</b> Todas las casillas entre la inicial y la final del rey (incluida la final) y entre la inicial y la final de la torre (incluida la final) deben estar vacías, salvo las de ese rey y esa torre.</div><h3>Ejemplos</h3><div class=\"aula-tabla\"><table><tr><th>Posición</th><th>0-0</th><th>0-0-0</th></tr><tr><td>SP 518 (clásica)</td><td>Doble movimiento</td><td>Doble movimiento</td></tr><tr><td>SP 11 (DCCTARTA)</td><td>Trasposición, posible en la 1.ª jugada</td><td>Solo el rey (f1 a c1)</td></tr><tr><td>SP 15 (DCCTRTAA)</td><td>Solo el rey (e1 a g1)</td><td>Solo el rey (e1 a c1)</td></tr><tr><td>SP 255 (CTRDCTAA)</td><td>Solo el rey (c1 a g1)</td><td>Solo la torre (b1 a d1)</td></tr></table></div><h3>Notas útiles</h3><ul><li>El enroque puede ser posible desde la primera jugada (nota 3).</li><li>Pueden quedar ocupadas casillas que en el ajedrez clásico estarían vacías: a1, b1 y e1 tras 0-0-0; e1 y h1 tras 0-0 (nota 5).</li><li>Si el rey ya se movió no hay enroque; si una torre se movió, no hay enroque con esa torre.</li></ul>"
  },
  {
   "id": "suizo-descanso-subgrupos",
   "coleccion": "revista-13",
   "titulo": "Suizo: el descanso y los subgrupos S1 y S2",
   "articulos": "C.04.1 · arts. 3-5 · C.04.3 (2026) · arts. 1.3-1.5, 2.1.2, 2.3.1, 3.1-3.3 · C.04.2 art. 3.3",
   "resumen": "Quién recibe el descanso asignado por el emparejamiento, cuántos puntos vale y cómo se arman S1 y S2 con MDP.",
   "claves": [
    "Con número impar, uno recibe el PAB: sin rival, sin color y con los puntos de una victoria, salvo que el reglamento diga otra cosa (C.04.1 art. 3).",
    "Todos los PAB del torneo valen lo mismo.",
    "No recibe PAB quien ya tuvo uno o ya sumó sin jugar, en una ronda, los puntos de una victoria (art. 4; [C2]).",
    "El PAB cuenta como flotante descendente (C.04.3 art. 1.4.3) y se busca darlo a la puntuación más baja posible ([C5]).",
    "MaxPairs = jugadores ÷ 2 redondeado hacia abajo; M0 = MDP que llegan; M1 = MDP que se emparejan.",
    "Grupo heterogéneo: primero las parejas de MDP (S1 = MDP); los residentes que quedan forman el resto, que se empareja como homogéneo."
   ],
   "contenido": "<h3>El descanso</h3><div class=\"aula-norma\"><b>C.04.1 art. 3</b> Si el número de jugadores que hay que emparejar es impar, uno queda sin pareja y recibe un descanso asignado por el emparejamiento (PAB): sin rival, sin color y con tantos puntos como una victoria, salvo que el reglamento del torneo diga otra cosa. Todos los PAB valen lo mismo.</div><div class=\"aula-norma\"><b>C.04.1 art. 4 · [C2]</b> No recibe el PAB quien ya recibió uno o quien ya sumó, en una sola ronda y sin jugar, los puntos de una victoria.</div><div class=\"aula-norma aula-norma-aviso\"><b>C.04.2 art. 3.3</b> Quien avisa que no jugará una ronda no se empareja y suma cero, salvo que el reglamento diga otra cosa. Ese descanso pedido no es un PAB.</div><h3>Los términos del Sistema Holandés</h3><ul><li><b>Residentes:</b> los jugadores del grupo de puntuación.</li><li><b>MDP:</b> el que bajó desde un grupo de más puntos.</li><li><b>MaxPairs:</b> máximo de parejas posibles en el grupo.</li><li><b>M0 / M1:</b> MDP que llegan / MDP que se emparejan.</li><li><b>Limbo:</b> los MDP que no entran en S1; vuelven a flotar.</li></ul><h3>Ejemplo</h3><p>Grupo con residentes 1-6 y el MDP 7.</p><div class=\"aula-tabla\"><table><tr><th>Paso</th><th>S1</th><th>S2</th><th>Parejas</th></tr><tr><td>MDP</td><td>7</td><td>1-6</td><td>7-1</td></tr><tr><td>Resto</td><td>2, 3</td><td>4, 5, 6</td><td>2-4, 3-5; el 6 flota</td></tr></table></div><div class=\"aula-nota\">En la ronda 1 con 61 jugadores: 1-31… 30-60, y el 61 recibe el PAB.</div>"
  },
  {
   "id": "registro-licencia-fide",
   "coleccion": "revista-13",
   "titulo": "Registro y licencia de jugadores",
   "articulos": "B.03 (vigente desde el 1-jul-2015) · arts. 1.2-1.4, 1.12-1.14, 1.19, 2.4-2.12 · Casos especiales de bandera FIDE (2024)",
   "resumen": "El número FIDE, qué pasa con un torneo si hay jugadores sin FIN y cómo funciona la bandera FIDE.",
   "claves": [
    "Las federaciones deben registrar a sus jugadores; cada jugador tiene un único FIN (arts. 1.3 y 1.12).",
    "Datos obligatorios: nombre, apellido, género, fecha de nacimiento, correo y federación (art. 1.14).",
    "Un torneo puede no evaluarse si hay jugadores sin FIN válido (art. 1.19).",
    "Licencia bajo bandera FIDE: 100 €, vence el 30 de junio del año siguiente (arts. 2.6-2.8).",
    "Dar de baja y volver a registrar a un jugador cuesta 25 € a la federación (art. 2.4).",
    "Desde 2024, los refugiados pueden obtener la bandera FIDE sin pagar la cuota anual."
   ],
   "contenido": "<h3>El FIN</h3><div class=\"aula-norma\"><b>B.03 arts. 1.2-1.4</b> El registro da un número FIDE (FIN) único. Si aparece un jugador con dos FIN, se cobran 20 € y no se evalúan las partidas jugadas con el segundo.</div><div class=\"aula-norma\"><b>Art. 1.19</b> Un torneo puede no evaluarse si hay jugadores sin un FIN válido. El FIN debe existir antes de enviar el torneo (art. 2.12.1).</div><h3>Bandera FIDE (FID)</h3><div class=\"aula-norma\"><b>Arts. 2.5-2.11</b> Para jugadores sin federación: licencia provisional de 100 €, que vence el 30 de junio del año siguiente y se renueva antes del 1 de julio.</div><div class=\"aula-norma\"><b>Casos especiales (Consejo FIDE, 2024)</b> Refugiados y residentes de larga duración sin FIN nacional pueden obtenerla; decide la Comisión de Calificación. Pueden jugar torneos oficiales de la FIDE y de su continente. Cuota anual de 100 €, excepto refugiados.</div><h3>Otras cuotas</h3><div class=\"aula-tabla\"><table><tr><th>Concepto</th><th>Cuota</th></tr><tr><td>FIN duplicado</td><td>20 €</td></tr><tr><td>Baja y nuevo registro</td><td>25 €</td></tr><tr><td>Dato incorrecto (desde 2021)</td><td>10 CHF (tope 1000 CHF)</td></tr></table></div><div class=\"aula-nota\">Las cuotas pueden cambiar: confírmalas con el Oficial de Rating de tu federación.</div>"
  },
  {
   "id": "error-arbitral",
   "coleccion": "revista-13",
   "titulo": "El error arbitral",
   "articulos": "Psicología del deporte (Paula Man Reich) · C.11 · B.06.5",
   "resumen": "Por qué se equivoca un árbitro, qué errores son graves y qué cauces formales hay hoy.",
   "claves": [
    "Errar es humano, pero el error repetido afecta el desempeño.",
    "El error por desconocimiento se corrige estudiando; el error por presión o con dolo destruye la credibilidad.",
    "Compensar un error con otro es equivocarse dos veces.",
    "El cansancio y la falta de concentración también causan errores: descansa y cuídate.",
    "La mayoría de las decisiones del árbitro se pueden apelar ante el Comité de Apelación.",
    "La conducta de los árbitros FIDE está sujeta al Reglamento Disciplinario de Árbitros (B.06.5)."
   ],
   "contenido": "<h3>Tipos de error</h3><ul><li><b>Desconocimiento:</b> cambios de reglas, poca experiencia. Se corrige rápido.</li><li><b>Presión de terceros:</b> grave; la imparcialidad queda en duda.</li><li><b>Dolo:</b> venganza o abuso de poder; se vuelve en contra.</li><li><b>Mal asesoramiento:</b> no se puede culpar a otros más de una vez.</li><li><b>Cansancio:</b> descanso, alimentación, concentración.</li><li><b>Compensar:</b> un error para reparar otro son dos errores.</li></ul><div class=\"aula-norma\"><b>Hoy</b> La mayoría de las decisiones se pueden apelar ante el Comité de Apelación (C.11) y los árbitros FIDE responden ante el Reglamento Disciplinario de Árbitros (B.06.5).</div><div class=\"aula-nota\">Reconocer el error, anotarlo en el informe y explicarlo es parte del buen arbitraje.</div>"
  },
  {
   "id": "preferencia-color",
   "coleccion": "revista-14",
   "titulo": "Suizo: diferencia y preferencia de color",
   "articulos": "C.04.3 (2026) · arts. 1.6-1.8, 2.1.3, 2.4.5-2.4.8 y 5 · C.04.1 arts. 6-8 · C.04.2 art. 3.4",
   "resumen": "Cómo se calcula la diferencia de color, qué tipo de preferencia tiene cada jugador y cómo se reparten los colores en cada pareja.",
   "claves": [
    "Diferencia de color = partidas jugadas con blancas − partidas jugadas con negras (art. 1.6).",
    "Solo cuentan las partidas jugadas: manda los guiones al principio del historial (C.04.2 art. 3.4).",
    "Absoluta: diferencia mayor que +1 o menor que −1, o el mismo color en las dos últimas partidas jugadas (art. 1.7.1).",
    "Fuerte: diferencia +1 (a negras) o −1 (a blancas) (art. 1.7.2).",
    "Leve: diferencia 0; alternar respecto a la última partida jugada (art. 1.7.3). Sin partidas jugadas: sin preferencia (art. 1.7.4).",
    "Asignación (art. 5.2): las dos preferencias; la más fuerte; alternar con la última ronda distinta; la del mejor clasificado; color inicial según número impar o par."
   ],
   "contenido": "<h3>Qué dice la norma</h3><div class=\"aula-norma\"><b>Art. 1.6</b> Diferencia de color: partidas jugadas con blancas menos partidas jugadas con negras.</div><div class=\"aula-norma\"><b>Art. 1.7</b> <b>Absoluta:</b> diferencia &gt; +1 o &lt; −1, o mismo color en las dos últimas rondas jugadas. <b>Fuerte:</b> +1 (negras) o −1 (blancas). <b>Leve:</b> 0, alternar con la última partida jugada. <b>Sin preferencia:</b> quien no jugó ninguna partida.</div><div class=\"aula-norma aula-norma-aviso\"><b>El error más común</b> Ver −1 o +1 y olvidar mirar las dos últimas partidas jugadas: BNBNN es absoluta a blancas.</div><h3>Ejemplos</h3><div class=\"aula-tabla\"><table><tr><th>Historial</th><th>Diferencia</th><th>Preferencia</th></tr><tr><td>NNBN</td><td>−2</td><td>Absoluta a blancas</td></tr><tr><td>BNBN-N (-BNBNN)</td><td>−1</td><td>Absoluta a blancas</td></tr><tr><td>NBN-BN</td><td>−1</td><td>Fuerte a blancas</td></tr><tr><td>BNB</td><td>+1</td><td>Fuerte a negras</td></tr><tr><td>NB-</td><td>0</td><td>Leve a negras</td></tr><tr><td>-BN-BN</td><td>0</td><td>Leve a blancas</td></tr></table></div><h3>Reparto de colores (art. 5.2)</h3><ol><li>Dar las dos preferencias.</li><li>Dar la más fuerte.</li><li>Alternar respecto a la ronda más reciente en que tuvieron colores distintos.</li><li>Dar la preferencia del mejor clasificado.</li><li>Mejor clasificado con número impar: color inicial sorteado; con número par, el contrario.</li></ol><div class=\"aula-nota\">Las antiguas reglas especiales de ronda par e impar ya no existen. Los conflictos se ordenan con [C3] y [C10]-[C13].</div>"
  },
  {
   "id": "posicion-muerta-n14",
   "coleccion": "revista-14",
   "titulo": "Posición muerta y caída de bandera",
   "articulos": "Leyes 2023 · arts. 5.2.2 y 6.9",
   "resumen": "Cuándo una posición está muerta, por qué no existen las «tablas teóricas» y qué pasa cuando cae la bandera.",
   "claves": [
    "Posición muerta: ningún jugador puede dar mate con ninguna serie de jugadas legales (art. 5.2.2).",
    "La posición muerta termina la partida de inmediato; no se reclama.",
    "Cuenta cualquier serie legal, aunque sea absurda: es la «potencialidad de mate».",
    "Al caer la bandera, pierde salvo que el rival no pueda dar mate con ninguna serie legal: entonces, tablas (art. 6.9).",
    "Rey y alfil contra rey y alfil del mismo color: muerta. De distinto color, alfil contra caballo y caballo contra caballo: no.",
    "Rey y caballo contra rey solo: muerta."
   ],
   "contenido": "<h3>Qué dice la norma</h3><div class=\"aula-norma\"><b>Art. 5.2.2</b> Tablas cuando ningún jugador puede dar mate al rey rival con ninguna serie de jugadas legales (posición muerta). Termina la partida inmediatamente.</div><div class=\"aula-norma\"><b>Art. 6.9</b> Quien no completa las jugadas en su tiempo pierde, salvo que el rival no pueda dar mate con ninguna serie posible de jugadas legales: entonces son tablas.</div><div class=\"aula-norma aula-norma-aviso\"><b>La diferencia</b> La posición muerta mira a los dos bandos; el art. 6.9 mira solo al rival del que se quedó sin tiempo.</div><h3>Finales «teóricos»</h3><div class=\"aula-tabla\"><table><tr><th>Material</th><th>¿Posición muerta?</th></tr><tr><td>R+A contra R+A, alfiles del mismo color</td><td>Sí</td></tr><tr><td>R+A contra R+A, alfiles de distinto color</td><td>No</td></tr><tr><td>R+A contra R+C</td><td>No</td></tr><tr><td>R+C contra R+C</td><td>No</td></tr><tr><td>R+C contra R</td><td>Sí</td></tr></table></div><p>En las posiciones de cadenas de peones bloqueadas, la posición está muerta si ningún rey puede cruzar, no hay capturas ni jugadas de peón posibles, y las piezas que quedan no pueden llegar a nada.</p><div class=\"aula-nota\">Ante una consulta, si la posición no está muerta, el árbitro dice solo «sigan jugando», sin explicar por qué.</div>"
  },
  {
   "id": "reclamo-tablas",
   "coleccion": "revista-14",
   "titulo": "Tablas por reclamación y tablas automáticas",
   "articulos": "Leyes 2023 · arts. 9.2, 9.3, 9.6 · Directrices III.1-III.5",
   "resumen": "Triple repetición, 50 jugadas, las tablas automáticas del art. 9.6 y la reclamación sin incremento de las Directrices III.",
   "claves": [
    "La triple repetición y las 50 jugadas las reclama el jugador que tiene el turno (arts. 9.2 y 9.3).",
    "El árbitro no declara tablas por triple repetición si nadie reclama.",
    "Tablas automáticas: quíntuple repetición (9.6.1) y 75 jugadas de cada uno sin peón ni captura (9.6.2), salvo que la última jugada sea mate.",
    "El antiguo art. 10.2 es hoy la Directriz III: solo si se anunció y solo sin incremento, nunca en relámpago (III.2).",
    "Con menos de dos minutos se puede pedir un incremento de 5 s para los dos (III.4).",
    "Si no, se reclaman tablas porque el rival no puede ganar por medios normales o no se esfuerza (III.5)."
   ],
   "contenido": "<h3>Por reclamación</h3><div class=\"aula-norma\"><b>Art. 9.2</b> Triple repetición: reclama el jugador con el turno, si la posición va a aparecer (escribe la jugada y declara su intención) o acaba de aparecer, al menos por tercera vez.</div><div class=\"aula-norma\"><b>Art. 9.3</b> 50 jugadas de cada jugador sin mover peón ni capturar: reclama el jugador con el turno.</div><h3>Automáticas</h3><div class=\"aula-norma\"><b>Art. 9.6</b> Quíntuple repetición (9.6.1) o 75 jugadas de cada uno sin peón ni captura (9.6.2). Si la última jugada da mate, vale el mate.</div><h3>Sin incremento (Directrices III)</h3><div class=\"aula-norma aula-norma-aviso\"><b>III.2</b> Solo si se anunció antes del torneo y solo en partidas estándar o rápidas sin incremento; no en relámpago.</div><ul><li><b>III.4</b> Con menos de dos minutos: pedir 5 s de incremento para los dos, si es posible (cuenta como oferta de tablas).</li><li><b>III.5</b> Si no: reclamar tablas antes de que caiga la bandera porque el rival no puede ganar por medios normales o no se esfuerza. El árbitro acepta, aplaza o rechaza; al aplazar o rechazar puede dar dos minutos al rival.</li></ul><div class=\"aula-nota\">No existe la reclamación de «tablas teóricas».</div>"
  },
  {
   "id": "antidopaje-2026",
   "coleccion": "revista-14",
   "titulo": "Antidopaje en el ajedrez",
   "articulos": "Lista Prohibida AMA 2026 (S6, S7) · Programa de Seguimiento 2026 · Reglas Antidopaje FIDE (B.12)",
   "resumen": "Qué estimulantes están prohibidos en competición en 2026, cuáles solo se vigilan y qué es una autorización de uso terapéutico.",
   "claves": [
    "La Lista Prohibida de la AMA se renueva cada año y entra en vigor el 1 de enero.",
    "Estimulantes (S6): prohibidos en competición. Anfetaminas y modafinilo en S6.A; metilfenidato en S6.B.",
    "Umbrales en orina: efedrina y metilefedrina 10 µg/mL; seudoefedrina 150 µg/mL; catina 5 µg/mL.",
    "La cafeína y la codeína no están prohibidas: están en el Programa de Seguimiento 2026.",
    "El tramadol está prohibido en competición (S7).",
    "Para usar una sustancia prohibida por razones médicas hace falta una autorización de uso terapéutico, antes de usarla."
   ],
   "contenido": "<h3>Lo relevante en 2026</h3><div class=\"aula-tabla\"><table><tr><th>Sustancia</th><th>Situación</th></tr><tr><td>Anfetaminas, modafinilo</td><td>Prohibidas en competición (S6.A)</td></tr><tr><td>Metilfenidato</td><td>Prohibido en competición (S6.B)</td></tr><tr><td>Efedrina, metilefedrina</td><td>Prohibidas &gt; 10 µg/mL</td></tr><tr><td>Seudoefedrina</td><td>Prohibida &gt; 150 µg/mL</td></tr><tr><td>Tramadol</td><td>Prohibido en competición (S7)</td></tr><tr><td>Cafeína, codeína</td><td>No prohibidas: Programa de Seguimiento</td></tr></table></div><div class=\"aula-norma\"><b>Programa de Seguimiento</b> Sustancias no prohibidas que la AMA vigila para detectar patrones de abuso.</div><div class=\"aula-norma aula-norma-aviso\"><b>Autorización de uso terapéutico</b> Quien necesita una sustancia prohibida por razones médicas debe obtenerla antes de usarla, con la Comisión Médica de la FIDE.</div><div class=\"aula-nota\">La Lista cambia cada año: consulta la vigente en el sitio de la AMA.</div>"
  },
  {
   "id": "fatiga-mental",
   "coleccion": "revista-14",
   "titulo": "Fatiga mental del árbitro",
   "articulos": "Psicología del deporte (Paula Man Reich)",
   "resumen": "Las causas emocionales de la fatiga mental y las actitudes que ayudan a prevenirla.",
   "claves": [
    "Buena parte de la fatiga mental viene de actitudes mentales y emocionales equivocadas.",
    "La preocupación, la tensión y la frustración son tres de sus causas principales.",
    "El test se contesta según lo que haces de verdad, pensando en los últimos seis meses.",
    "Ayudan: relajarte a propósito, darte ánimo, aceptar lo difícil como un reto y la crítica con calma.",
    "No te compares todo el tiempo con otros árbitros.",
    "A menudo la causa no es el trabajo, sino la preocupación que genera la mente."
   ],
   "contenido": "<h3>Causas</h3><p>Aburrimiento, resentimiento, ansiedad y preocupación agobian al árbitro; la preocupación, la tensión y la frustración son las tres causas más importantes de la fatiga mental.</p><h3>Actitudes que protegen</h3><ul><li>Relajarte de forma consciente mientras arbitras.</li><li>Convertir un momento aburrido en uno interesante.</li><li>Hablarte para darte ánimo.</li><li>Aceptar una tarea difícil como un reto.</li><li>No compararte constantemente con otros.</li><li>Aprovechar unos segundos para dejar la mente en blanco.</li><li>Aceptar la crítica con calma.</li></ul><div class=\"aula-norma\"><b>Resultados del test</b> 8-10: buen manejo de la mente y las emociones. 5-7: vas por buen camino. 0-4: hay que trabajar el aburrimiento, la frustración y la fatiga.</div><div class=\"aula-nota\">El test es una herramienta de autoobservación, no un diagnóstico.</div>"
  },
  {
   "id": "leyes-borrador-2013-a-2023",
   "coleccion": "revista-15",
   "titulo": "Del borrador de 2013 a las Leyes vigentes",
   "articulos": "Leyes 2023 · arts. 0.2, 6.2, 6.7, 7.1, 7.5, 9.5.3, 9.6, 12.9",
   "resumen": "Qué propuestas de la reforma de 2014 quedaron, cuáles cambiaron y con qué número de artículo se citan hoy.",
   "claves": [
    "Las Leyes vigentes se aprobaron el 7-ago-2022 y se aplican desde el 1-ene-2023; antes hubo versiones de 2014, julio de 2017 y enero de 2018.",
    "Tablas automáticas: cinco apariciones de la misma posición (9.6.1) o 75 jugadas de cada bando sin peón ni captura (9.6.2). No diez, como decía el borrador.",
    "La segunda jugada ilegal completada pierde (7.5.5); la primera da dos minutos al rival.",
    "Si las bases no fijan el tiempo de incomparecencia, es cero (6.7.1).",
    "Reclamación incorrecta de tablas: dos minutos al rival (9.5.3); uno en rápidas y relámpago (A.3).",
    "Las sanciones están en el 12.9 e incluyen la exclusión de una o varias rondas."
   ],
   "contenido": "<h3>Por qué importa la versión</h3><p>La revista comentaba en 2013 un borrador que luego cambió. Entre 2009 y 2023 casi toda la numeración se movió: el antiguo 6.13 es hoy el 7.1, el 12.3 es el 11.3 y el 13.4 es el 12.9. Antes de citar un artículo, mira de qué año es el texto.</p><h3>Lo que hoy dice la norma</h3><div class=\"aula-norma\"><b>Art. 0.2 (prefacio)</b> Para que una partida sea valorada por la FIDE es condición necesaria que se juegue con las Leyes del Ajedrez FIDE. Se recomienda usarlas también en partidas de competición no valoradas.</div><div class=\"aula-norma\"><b>Art. 6.2.1 y 6.2.2</b> La jugada se completa al pulsar el reloj, o si termina la partida, o si el jugador hace su siguiente jugada sin haber completado la anterior. Al jugador se le debe permitir pulsar tarde, incluso después de que el rival haya movido; ese tiempo es suyo.</div><div class=\"aula-norma\"><b>Art. 6.7</b> Las bases fijan el tiempo de incomparecencia; si no lo fijan, es cero. Quien llega después, pierde, salvo que el árbitro decida otra cosa.</div><div class=\"aula-norma\"><b>Art. 7.1</b> Al restablecer una posición, el árbitro fija los tiempos con su mejor criterio, incluido el derecho a no cambiarlos.</div><div class=\"aula-norma\"><b>Art. 9.6</b> Son tablas automáticas si la misma posición aparece al menos cinco veces (9.6.1) o tras al menos 75 jugadas de cada bando sin mover peón ni capturar, salvo que la última jugada dé mate (9.6.2).</div><div class=\"aula-norma aula-norma-aviso\"><b>Corrección.</b> El borrador hablaba de diez repeticiones consecutivas. La versión de 2014 fijó cinco y desde 2017 ya no se exige que sean consecutivas.</div><h3>Tabla rápida</h3><div class=\"aula-tabla\"><table><tr><th>Tema</th><th>Borrador 2013</th><th>Hoy</th></tr><tr><td>Repetición automática</td><td>10 veces</td><td>5 veces (9.6.1)</td></tr><tr><td>Jugadas ilegales</td><td>Pierde a la segunda</td><td>Igual (7.5.5)</td></tr><tr><td>Reclamación incorrecta</td><td>2 minutos</td><td>2 minutos (9.5.3); 1 en rápidas y relámpago</td></tr><tr><td>Sanciones</td><td>«12.10» propuesto</td><td>12.9, con exclusión de rondas</td></tr></table></div><p class=\"aula-nota\">La conducta del árbitro ya no está en las Leyes: la frase sobre no desprestigiar el ajedrez quedó en el 11.1 para los jugadores, y los árbitros se rigen por su reglamento disciplinario (B.06.5).</p>"
  },
  {
   "id": "pautas-iii-sin-incremento",
   "coleccion": "revista-15",
   "titulo": "Final sin incremento (Pautas III)",
   "articulos": "Leyes 2023 · Pautas III.1 a III.6",
   "resumen": "Qué hace el árbitro cuando, en una partida sin incremento, un jugador con menos de dos minutos pide ayuda o reclama tablas.",
   "claves": [
    "Las Pautas III solo se aplican si se anunciaron antes del evento (III.2.1).",
    "Solo valen en estándar y rápidas sin incremento, nunca en relámpago (III.2.2).",
    "Con menos de dos minutos, el jugador con el turno puede pedir un incremento de cinco segundos para ambos: es una oferta de tablas (III.4).",
    "Si el rival la rechaza y el árbitro acepta, se programa el incremento y el rival recibe dos minutos (III.4).",
    "Si no hay incremento posible, puede reclamar tablas porque el rival no puede ganar por medios normales o no se esfuerza por ganar (III.5).",
    "Si el árbitro rechaza la reclamación, da dos minutos al rival (III.5.3)."
   ],
   "contenido": "<h3>Qué dice la norma</h3><div class=\"aula-norma\"><b>III.1 y III.2</b> El «final a caída de bandera» es la fase en que todas las jugadas restantes deben hacerse en un tiempo finito. Las Pautas solo se usan si se anunciaron antes, y solo en estándar y rápidas sin incremento.</div><div class=\"aula-norma\"><b>III.3</b> Si caen las dos banderas y no se sabe cuál cayó primero: la partida sigue si no es el último periodo; es tablas si es el periodo en que hay que terminar todas las jugadas.</div><div class=\"aula-norma\"><b>III.4</b> Con menos de dos minutos, el jugador con el turno puede pedir cinco segundos de incremento para ambos. Equivale a ofrecer tablas. Si el rival rechaza y el árbitro acepta, se programa el incremento y el rival recibe dos minutos.</div><div class=\"aula-norma\"><b>III.5</b> Si no se aplica III.4, puede reclamar tablas antes de que caiga su bandera: el rival no puede ganar por medios normales o no está haciendo ningún esfuerzo por ganar. El árbitro acepta, aplaza (puede dar dos minutos al rival y decide después) o rechaza (y entonces da dos minutos al rival).</div><div class=\"aula-norma\"><b>III.6</b> Sin árbitro en la sala: el jugador anota la posición final (y, si alega falta de esfuerzo, entrega la planilla al día); el rival lo verifica y la reclamación pasa al árbitro designado.</div><div class=\"aula-norma aula-norma-aviso\"><b>Con incremento no hay Pautas III.</b> La mayoría de los ritmos actuales tienen incremento desde la primera jugada.</div><p class=\"aula-nota\">El antiguo art. 10.2 de las Leyes de 2009 es el antecedente de estas pautas.</p>"
  },
  {
   "id": "coronacion-dos-manos",
   "coleccion": "revista-15",
   "titulo": "La coronación y la jugada a dos manos",
   "articulos": "Leyes 2023 · arts. 3.7.3.3, 4.1, 4.4.4, 4.6, 4.7.3, 7.5.2, 7.5.4, 7.5.5",
   "resumen": "Cómo se corona hoy, cuándo está hecha la jugada y qué pasa si se usan las dos manos (el caso Kamsky–Tomashevsky).",
   "claves": [
    "El peón no tiene que colocarse en la casilla de promoción (4.6.1).",
    "Retirar el peón y poner la pieza nueva puede hacerse en cualquier orden (4.6.2).",
    "La pieza queda elegida cuando toca la casilla de promoción (4.4.4).",
    "La coronación está hecha al soltar la pieza nueva en la casilla, con el peón ya retirado (4.7.3).",
    "Peón en la última fila y reloj pulsado sin cambiarlo: jugada ilegal y el peón pasa a ser dama (7.5.2).",
    "Usar las dos manos en una sola jugada y pulsar se sanciona como jugada ilegal (7.5.4): dos minutos al rival y cuenta para la pérdida por segunda ilegal."
   ],
   "contenido": "<h3>Qué dice la norma</h3><div class=\"aula-norma\"><b>Art. 3.7.3.3</b> El jugador que lleva un peón a la fila más alejada debe cambiarlo, en la misma jugada, por una dama, torre, alfil o caballo nuevos de su color en la casilla de llegada. No importa si esa pieza fue capturada antes.</div><div class=\"aula-norma\"><b>Art. 4.6</b> El peón no tiene que llegar a la casilla; retirar el peón y poner la pieza puede hacerse en cualquier orden; si hay una pieza rival en la casilla, se captura.</div><div class=\"aula-norma\"><b>Arts. 4.4.4 y 4.7.3</b> La pieza elegida se define cuando toca la casilla de promoción. La jugada se considera hecha cuando la mano suelta la pieza nueva en la casilla y el peón ya salió del tablero.</div><div class=\"aula-norma\"><b>Art. 7.5.2</b> Si el jugador pulsa el reloj con el peón en la última fila sin cambiarlo, la jugada es ilegal y el peón se sustituye por una dama.</div><div class=\"aula-norma\"><b>Arts. 4.1, 7.5.4 y 7.5.5</b> Cada jugada se hace con una sola mano. Si usa las dos manos en una sola jugada (enroque, captura, coronación) y pulsa el reloj, se sanciona como jugada ilegal: dos minutos al rival la primera vez, pérdida la segunda.</div><h3>El caso de la revista</h3><p>Copa del Mundo 2013, cuartos de final: un jugador retira el peón con una mano y coloca la dama con la otra; el peón nunca toca la casilla de promoción. En 2013 se discutía si era «ilegal por no llegar». Hoy:</p><ol><li>No llegar a la casilla no es infracción (4.6.1).</li><li>Las dos manos, con el reloj pulsado, sí: dos minutos al rival (7.5.4 y 7.5.5).</li><li>Cuenta como primera jugada ilegal.</li><li>Si el árbitro lo ve, interviene sin esperar reclamación.</li></ol><div class=\"aula-norma aula-norma-aviso\"><b>Rápidas y relámpago.</b> Un minuto (A.3). Sin supervisión completa, solo mientras el rival no haya hecho su siguiente jugada (A.5.2).</div><p class=\"aula-nota\">Según el Manual del Árbitro 2026, dos infracciones en una misma jugada (por ejemplo, una coronación ilegal hecha además con dos manos) cuentan como una sola jugada ilegal.</p>"
  },
  {
   "id": "sede-y-dispositivos",
   "coleccion": "revista-15",
   "titulo": "Sede de juego y dispositivos electrónicos",
   "articulos": "Leyes 2023 · arts. 11.2, 11.3, 12.8, 12.9",
   "resumen": "Quién puede entrar y salir del área de juego, qué pasa con los teléfonos y cuándo se puede inspeccionar a un jugador.",
   "claves": [
    "La sede de juego incluye el área de juego, descanso, sanitarios, refrigerio, zona de fumadores y otros lugares que designe el árbitro (11.2.1).",
    "El jugador con el turno solo sale del área de juego con permiso del árbitro (11.2.3.2).",
    "Tener en la sede un dispositivo no aprobado por el árbitro está prohibido (11.3.2).",
    "Las bases pueden permitir guardarlo apagado en el bolso, colocado donde acuerde el árbitro (11.3.2.1).",
    "Si es evidente que lo lleva encima, pierde y el rival gana; las bases pueden fijar una sanción menor (11.3.2.2).",
    "La inspección es en privado y la hace una persona del mismo género; negarse se sanciona según el 12.9 (11.3.3)."
   ],
   "contenido": "<h3>Qué dice la norma</h3><div class=\"aula-norma\"><b>Art. 11.2</b> Sede de juego: área de juego, salas de descanso, sanitarios, zona de refrigerio, área para fumadores y otros lugares que designe el árbitro. Área de juego: donde se juegan las partidas. Con permiso del árbitro: salir de la sede, salir del área de juego teniendo el turno, entrar al área sin ser jugador ni árbitro.</div><div class=\"aula-norma\"><b>Art. 11.3.2</b> Durante la partida está prohibido tener en la sede un dispositivo electrónico no aprobado expresamente por el árbitro. Las bases pueden permitir guardarlo completamente apagado en el bolso; ninguno de los dos jugadores puede usar ese bolso sin permiso. Si es evidente que lo lleva encima, pierde y el rival gana, salvo que las bases fijen una sanción menor.</div><div class=\"aula-norma\"><b>Art. 11.3.3</b> El árbitro puede pedir inspeccionar en privado la ropa, los bolsos, otros objetos o el cuerpo; lo hace él o alguien autorizado, del mismo género que el jugador. Si se niega, se aplica el 12.9.</div><div class=\"aula-norma\"><b>Art. 12.8</b> Salvo autorización del árbitro, nadie puede usar un teléfono u otro medio de comunicación en la sede o en zonas contiguas designadas.</div><div class=\"aula-norma aula-norma-aviso\"><b>Diferencia con la regla antigua.</b> Antes, si el teléfono sonaba y el rival no podía ganar, el resultado era tablas. El 11.3.2.2 vigente no trae esa excepción.</div><p class=\"aula-nota\">Fumar, incluidos los cigarrillos electrónicos, solo en la zona designada por el árbitro (11.3.4).</p>"
  },
  {
   "id": "rapidas-relampago-supervision",
   "coleccion": "revista-15",
   "titulo": "Rápidas y relámpago: definición y supervisión",
   "articulos": "Leyes 2023 · Apéndices A y B (A.1-A.6, B.1-B.4)",
   "resumen": "Qué es rápidas y qué es relámpago, cuándo se aplican las reglas de competición completas y qué pasa con una jugada ilegal.",
   "claves": [
    "Rápidas: más de 10 y menos de 60 minutos por jugador, contando 60 veces el incremento (A.1).",
    "Relámpago: 10 minutos o menos, contando 60 veces el incremento (B.1).",
    "Las bases eligen para todo el evento si se aplican las reglas completas o el A.5 (A.6, B.4).",
    "Reglas completas: un árbitro por máximo tres partidas en rápidas, uno por partida en relámpago, con registro de cada partida.",
    "Jugada ilegal: un minuto al rival la primera vez y pérdida la segunda (A.3 y 7.5.5).",
    "Sin supervisión completa, la jugada ilegal no reclamada antes de que el rival haga su siguiente jugada se mantiene (A.5.2)."
   ],
   "contenido": "<h3>Definiciones</h3><div class=\"aula-tabla\"><table><tr><th>Modalidad</th><th>Tiempo por jugador (base + 60 × incremento)</th></tr><tr><td>Rápidas (A.1)</td><td>Más de 10 y menos de 60 minutos</td></tr><tr><td>Relámpago (B.1)</td><td>10 minutos o menos</td></tr></table></div><p><span class=\"aula-formula\">tiempo para clasificar = base + 60 × incremento</span>. Ejemplo: 3 min + 2 s = 3 + 2 = 5 minutos → relámpago. 10 min + 5 s = 10 + 5 = 15 minutos → rápidas.</p><h3>Qué dice la norma</h3><div class=\"aula-norma\"><b>A.3</b> Las sanciones de los arts. 7 y 9 son de un minuto en lugar de dos.</div><div class=\"aula-norma\"><b>A.4 y B.2</b> Reglas de competición completas si un árbitro supervisa como máximo tres partidas (rápidas) o una (relámpago) y cada partida se registra. El jugador puede pedir ver la planilla hasta cinco veces por partida.</div><div class=\"aula-norma\"><b>A.5</b> Si no: tras 10 jugadas de cada bando no se cambia el reloj (salvo que se afecte el horario) ni se reclama la colocación del tablero; la jugada ilegal se sanciona solo si el árbitro la ve o el rival reclama antes de su siguiente jugada; con los dos reyes en jaque o un peón en la última fila, el árbitro espera la siguiente jugada y, si la posición sigue siendo ilegal, declara tablas; el árbitro también señala la caída de bandera.</div><div class=\"aula-norma aula-norma-aviso\"><b>Ya no se pierde a la primera.</b> Con las Leyes de 2014 y 2017, una sola jugada ilegal sin supervisión completa perdía la partida. Desde 2018 se aplica el 7.5.5, y desde 2023 la sanción es de un minuto en ambas modalidades.</div>"
  },
  {
   "id": "creencias-limitantes-arbitro",
   "coleccion": "revista-15",
   "titulo": "Creencias limitantes del árbitro",
   "articulos": "Psicología del arbitraje · Paula Man Reich",
   "resumen": "Cómo detectar los pensamientos negativos que condicionan el trabajo del árbitro y un ejercicio de cinco columnas para cambiarlos.",
   "claves": [
    "Lo que piensa el árbitro refleja su estado emocional y condiciona su trabajo.",
    "Un pensamiento pesimista constante se centra en el miedo y en lo que no está bien.",
    "Tres preguntas: ¿cómo me siento?, ¿qué me pasa por la cabeza?, ¿cómo estaré en diez minutos si sigo así?",
    "Cinco columnas: situación, emoción, creencia, comportamiento y consecuencias.",
    "Los pensamientos suelen ser sobre uno mismo, sobre los demás o sobre el futuro profesional.",
    "Tomar conciencia ya da más control sobre las emociones."
   ],
   "contenido": "<h3>La idea</h3><p>Si un árbitro está muy preocupado por hacer un mal trabajo, piensa más en el fracaso que en las posibilidades de éxito; si teme amenazas, sus decisiones quedan condicionadas. Identificar esas creencias es el primer paso para cambiarlas.</p><h3>Tres preguntas</h3><ol><li>¿Cómo me siento en esta situación?</li><li>¿Qué me pasa por la cabeza?</li><li>Si sigo pensando así, ¿en qué estado estaré dentro de diez minutos?</li></ol><h3>Las cinco columnas</h3><div class=\"aula-tabla\"><table><tr><th>Columna</th><th>Qué anotar</th></tr><tr><td>1</td><td>Situaciones que dan miedo o ansiedad</td></tr><tr><td>2</td><td>Emociones y su intensidad (1 a 10)</td></tr><tr><td>3</td><td>Creencias negativas</td></tr><tr><td>4</td><td>Comportamiento y su eficacia (1 a 10)</td></tr><tr><td>5</td><td>Consecuencias y si son deseables (1 a 10)</td></tr></table></div><p class=\"aula-nota\">Anota en la hoja qué significa el 1 y qué el 10 en tu escala: en el original, el 1 era la emoción más intensa.</p>"
  },
  {
   "id": "rating-performance-normas",
   "coleccion": "revista-16",
   "titulo": "Rating performance y normas de título",
   "articulos": "Reglamento de Títulos 2024 · arts. 1.4.1, 1.4.6 a 1.4.9",
   "resumen": "Cómo se calcula el rating performance (Rp = Ra + dp) y qué más exige una norma de GM, IM, WGM o WIM.",
   "claves": [
    "Rp = Ra + dp (art. 1.4.8).",
    "Ra se redondea al entero más cercano; 0,5 sube (art. 1.4.7).",
    "p = puntos ÷ partidas, llevado a dos decimales para entrar en la tabla dp (art. 1.4.9).",
    "Mínimos de Rp: GM 2600, IM 2450, WGM 2400, WIM 2250 (antes de redondear: 2599,5; 2449,5; 2399,5; 2249,5).",
    "Ra mínimo de los rivales: GM 2380, IM 2230, WGM 2180, WIM 2030; puntuación mínima del 35 %.",
    "Piso de rating (GM 2200, IM 2050, WGM 2000, WIM 1850): solo se sube un rival, el de menor rating; sin rating cuenta 1400. Al menos 9 partidas."
   ],
   "contenido": "<h3>La fórmula</h3><p><span class=\"aula-formula\">Rp = Ra + dp</span></p><div class=\"aula-norma\"><b>Art. 1.4.7</b> Ra es la suma de los ratings de los rivales dividida entre el número de rivales, con el piso del 1.4.6. Se redondea al entero más cercano; la fracción 0,5 sube.</div><div class=\"aula-norma\"><b>Art. 1.4.9</b> La tabla convierte el porcentaje p en la diferencia dp. Algunos valores: 0,50 → 0; 0,57 → 50; 0,58 → 57; 0,61 → 80; 0,64 → 102; 0,71 → 158; 0,72 → 166. Por debajo de 0,50, el mismo valor en negativo (0,43 → −50; 0,36 → −102).</div><h3>Ejemplo</h3><p>5 puntos en 7 partidas; rivales que suman 19 509. <span class=\"aula-formula\">Ra = 19 509 ÷ 7 = 2787</span>; <span class=\"aula-formula\">p = 0,7143 → 0,71 → dp = 158</span>; <span class=\"aula-formula\">Rp = 2945</span>.</p><h3>Mínimos para una norma (art. 1.4.8)</h3><div class=\"aula-tabla\"><table><tr><th>Título</th><th>Rp</th><th>Ra mínimo</th><th>Piso</th></tr><tr><td>GM</td><td>2600</td><td>2380</td><td>2200</td></tr><tr><td>IM</td><td>2450</td><td>2230</td><td>2050</td></tr><tr><td>WGM</td><td>2400</td><td>2180</td><td>2000</td></tr><tr><td>WIM</td><td>2250</td><td>2030</td><td>1850</td></tr></table></div><div class=\"aula-norma\"><b>Art. 1.4.6</b> Para la norma, si hay rivales por debajo del piso, solo el de menor rating se sube al piso. Los rivales sin rating no cubiertos por otra regla cuentan como 1400.</div><div class=\"aula-norma aula-norma-aviso\"><b>No basta el Rp.</b> Hace falta además el 35 % de los puntos, al menos 9 partidas (1.4.1, con excepciones en campeonatos por equipos y la Copa del Mundo) y la mezcla de títulos y federaciones de los arts. 1.4.2 a 1.4.5.</div><p class=\"aula-nota\">La edición original publicó 2495 y 2448 donde correspondía 2945 y 2848: revisa siempre la suma final.</p>"
  },
  {
   "id": "tpr-desempate-performance",
   "coleccion": "revista-16",
   "titulo": "La performance como desempate (TPR)",
   "articulos": "C.07 (2026) · arts. 10, 10.1, 10.2 · Reglamento de Rating 2024 · art. 8.2.2",
   "resumen": "El rating performance usado como desempate y su diferencia con el cálculo del rating inicial.",
   "claves": [
    "ARO: promedio de los rivales jugados en el tablero, redondeado; 0,5 sube (art. 10.1).",
    "TPR = ARO + la diferencia de la tabla del Reglamento de Rating (art. 10.2).",
    "Las partidas no jugadas no entran en el cálculo.",
    "Los desempates por rating se retiran si hay jugadores sin rating, salvo reglas publicadas antes del torneo (art. 10).",
    "El rating inicial no es la performance: suma dos rivales ficticios de 1800 con tablas (art. 8.2.2).",
    "El C.07 vigente se aplica desde el 1-mar-2026."
   ],
   "contenido": "<h3>Qué dice la norma</h3><div class=\"aula-norma\"><b>C.07, art. 10.1 (ARO)</b> Promedio de los ratings de los rivales con los que se jugó en el tablero, redondeado al entero más cercano (0,5 hacia arriba).</div><div class=\"aula-norma\"><b>C.07, art. 10.2 (TPR)</b> Se suma al ARO la diferencia de rating que corresponde a la fracción de puntos obtenida en partidas jugadas, según la tabla del Reglamento de Rating.</div><div class=\"aula-norma aula-norma-aviso\"><b>Jugadores sin rating.</b> Los desempates por rating deben quitarse de la lista si hay jugadores sin rating, salvo que las bases o el árbitro principal hayan publicado antes del torneo cómo tratarlos (art. 10).</div><div class=\"aula-norma\"><b>Reglamento de Rating, art. 8.2.2</b> Para el primer rating, Ra es el promedio de los rivales con rating más dos rivales ficticios de 1800, contra los que se considera que hizo tablas.</div><p><span class=\"aula-formula\">TPR = ARO + dp(p)</span></p><p class=\"aula-nota\">En el ejercicio de la revista, dos jugadores con 2½ terminan con 2594 y 2595: el TPR distingue empates que la puntuación no separa.</p>"
  },
  {
   "id": "torre-invertida-coronacion",
   "coleccion": "revista-16",
   "titulo": "La torre invertida y las piezas caídas",
   "articulos": "Leyes 2023 · arts. 4.4.4, 6.11.2, 7.4, 7.5.2 · Manual del Árbitro 2026",
   "resumen": "Qué vale una torre colocada de cabeza al coronar, qué hacer si falta la dama y cómo tratar una pieza caída.",
   "claves": [
    "Una torre invertida en la casilla de promoción es una torre, aunque el jugador diga «dama» (Manual del Árbitro 2026).",
    "No es jugada ilegal; moverla después en diagonal sí lo es.",
    "El rival puede ponerla de pie en su turno, pero es mejor pedírselo al árbitro.",
    "La pieza elegida queda definida cuando toca la casilla de promoción (4.4.4).",
    "Si falta la pieza, el jugador puede pausar el reloj y pedir ayuda al árbitro (6.11.2).",
    "Una pieza acostada es una pieza desplazada: se corrige con el art. 7.4, no es jugada ilegal por sí misma."
   ],
   "contenido": "<h3>Qué dice hoy la FIDE</h3><div class=\"aula-norma\"><b>Manual del Árbitro 2026 (art. 4.6)</b> Si un jugador coloca una torre invertida en la casilla de promoción y continúa la partida, la pieza se considera una torre aunque la llame dama. Moverla en diagonal es jugada ilegal. El rival puede ponerla de pie en su turno, aunque conviene pedirlo al árbitro; el árbitro que la ve debe corregirlo con la menor molestia posible.</div><div class=\"aula-norma\"><b>Art. 4.4.4</b> Al coronar, la elección queda definida cuando la pieza toca la casilla de promoción.</div><div class=\"aula-norma\"><b>Art. 6.11.2</b> El jugador puede pausar el reloj solo para pedir ayuda al árbitro, por ejemplo cuando corona y la pieza que necesita no está disponible.</div><div class=\"aula-norma\"><b>Art. 7.4 y glosario</b> Una pieza acostada de lado es una pieza desplazada. Quien la desplazó la corrige en su propio tiempo; si hace falta, se pausa el reloj y se llama al árbitro, que puede sancionar.</div><div class=\"aula-norma aula-norma-aviso\"><b>No confundir.</b> Peón en la última fila y reloj pulsado sin cambiarlo: jugada ilegal y el peón pasa a ser dama (7.5.2). Torre invertida: es torre.</div><p class=\"aula-nota\">En 2014 el Manual del Árbitro la consideraba jugada ilegal; Santiago García Ramos opinaba que debía valer como torre. La revista de árbitros de la FIDE de agosto de 2016 y el Manual 2026 le dan la razón.</p>"
  },
  {
   "id": "patrocinio-proyecto-evento",
   "coleccion": "revista-16",
   "titulo": "Patrocinio: invitar con un proyecto",
   "articulos": "Organización de eventos · manual de la Comisión de Eventos FIDE (2013, histórico)",
   "resumen": "Las ideas prácticas del autor para conseguir patrocinadores y el ejemplo de presupuesto en especie, corregido.",
   "claves": [
    "No se pide: se invita al patrocinador a participar.",
    "La llave para invitar es un proyecto profesional del evento.",
    "Hay que saber exactamente qué se necesita: a veces conviene más el apoyo en especie.",
    "Toda superficie cuenta para la marca: planillas, identificadores de mesa, gafetes, web, pancartas.",
    "Los niveles de patrocinio escalonan beneficios (exclusivo, patrocinador, apoyador).",
    "El manual de identidad de 2013 es histórico: pide a la FIDE los lineamientos gráficos vigentes."
   ],
   "contenido": "<h3>La idea</h3><p>Llegar «pidiendo» aleja a los patrocinadores. Hay que llegar como profesional, con un proyecto que diga qué se necesita, qué se ofrece y en qué niveles.</p><h3>El presupuesto en especie (corregido)</h3><div class=\"aula-tabla\"><table><tr><th>Concepto</th><th>Cantidad</th><th>Por día</th></tr><tr><td>Sillas (200 jugadores + 4 de arbitraje) a 1 USD</td><td>204</td><td>204 USD</td></tr><tr><td>Mesas (25 de juego + 2 de arbitraje) a 10 USD</td><td>27</td><td>270 USD</td></tr><tr><td><b>Total</b></td><td></td><td><b>474 USD</b> (948 en dos días)</td></tr></table></div><p class=\"aula-nota\">La edición original contaba 100 sillas para 200 niños (370 USD por día). Precios de ejemplo de 2013.</p><h3>Qué ofrecer</h3><ul><li>Logotipo en planillas, identificadores de mesa, gafetes, web y pancartas.</li><li>Menciones en comunicados y transmisiones.</li><li>Presencia en ceremonias y espacio de exhibición.</li></ul><div class=\"aula-norma aula-norma-aviso\"><b>Documento histórico.</b> El manual de identidad de la FIDE de 2013 no sirve como guía gráfica actual; los lineamientos vigentes se piden a la FIDE o a la federación.</div>"
  },
  {
   "id": "leyes-2014-a-2023",
   "coleccion": "revista-17",
   "titulo": "De las Leyes 2014 a las Leyes 2023",
   "articulos": "Leyes 2023 · arts. 5.1.2, 5.2.3, 6.7.1, 7.5, 9.6.1, 11.3, 12.2.7, 12.9, A.3, A.5.2, Pautas III",
   "resumen": "Qué cambió en las Leyes del Ajedrez desde la versión de 2014 y qué artículo rige hoy cada tema.",
   "claves": [
    "Rigen las Leyes aplicadas desde el 1-ene-2023; hubo versiones en 2014, 2017 y 2018.",
    "En rápidas y relámpago, la primera jugada ilegal da 1 minuto al rival (A.3) y la segunda pierde (7.5.5); en 2014 perdía a la primera.",
    "Pulsar el reloj sin mover o mover con dos manos se sanciona como jugada ilegal (7.5.3 y 7.5.4).",
    "Cualquier dispositivo electrónico no aprobado está prohibido; las bases pueden permitirlo apagado en el bolso (11.3.2.1).",
    "Tablas automáticas con cinco apariciones de la misma posición, aunque no sean seguidas (9.6.1).",
    "Si las bases no fijan tiempo de incomparecencia, es cero (6.7.1)."
   ],
   "contenido": "<h3>Las versiones</h3><div class=\"aula-tabla\"><table><tr><th>Versión</th><th>Se aplicó</th></tr><tr><td>2014</td><td>1-jul-2014 a 30-jun-2017</td></tr><tr><td>2017</td><td>1-jul-2017 a 31-dic-2017</td></tr><tr><td>2018</td><td>1-ene-2018 a 31-dic-2022</td></tr><tr><td><b>2023</b></td><td><b>desde el 1-ene-2023</b> (vigente en noviembre de 2026)</td></tr></table></div><h3>Lo que más cambió</h3><div class=\"aula-norma\"><b>Arts. A.3, A.5.2 y 7.5.5</b> En rápidas y relámpago, la primera jugada ilegal da 1 minuto al rival y la segunda pierde. Si nadie reclama antes de la siguiente jugada del rival, la jugada ilegal se queda. (En 2014, art. A.4.2, se perdía a la primera.)</div><div class=\"aula-norma\"><b>Arts. 7.5.3 y 7.5.4</b> Pulsar el reloj sin haber movido, o mover con las dos manos y pulsar, cuenta como jugada ilegal.</div><div class=\"aula-norma\"><b>Art. 11.3.2</b> Prohibido cualquier dispositivo electrónico no aprobado por el árbitro. Las bases pueden permitir guardarlo completamente apagado en el bolso (11.3.2.1). Si lo lleva encima, pierde, salvo sanción menor en las bases (11.3.2.2). La inspección puede incluir el cuerpo, en privado y por alguien del mismo género (11.3.3).</div><div class=\"aula-norma\"><b>Art. 5.2.3</b> El acuerdo de tablas exige que los dos jugadores hayan hecho al menos una jugada.</div><div class=\"aula-norma\"><b>Art. 9.6.1</b> Tablas automáticas si la misma posición aparece al menos cinco veces (en 2014 se pedían cinco jugadas alternas consecutivas).</div><div class=\"aula-norma\"><b>Art. 5.1.2</b> Pierde quien abandona, salvo que el rival no pueda dar mate con ninguna serie de jugadas legales: entonces es tablas.</div><div class=\"aula-norma\"><b>Arts. 6.7.1, 12.2.7 y 12.9.8</b> Incomparecencia cero si las bases no dicen otra cosa; el árbitro sigue las reglas de juego limpio; entre las sanciones está la exclusión de una o más rondas.</div><div class=\"aula-norma aula-norma-aviso\"><b>Pautas III</b> El final a caída de bandera sin incremento (el viejo Apéndice G) solo se aplica si se anunció antes y nunca en relámpago.</div><p class=\"aula-nota\">El texto oficial está en el FIDE Handbook (E.01), que conserva también las versiones de 2014, 2017 y 2018.</p>"
  },
  {
   "id": "rating-performance",
   "coleccion": "revista-17",
   "titulo": "Rating performance",
   "articulos": "Reglamento de Títulos (2024) · arts. 1.4.7-1.4.9 · Reglamento de Rating (2024) · art. 8.1.1 · C.07 (2026) · arts. 10.1-10.2",
   "resumen": "Cómo se calcula la performance de un jugador: promedio de rivales más la diferencia de rating de la tabla.",
   "claves": [
    "Rp = Ra + dp.",
    "Ra: promedio de los ratings de los rivales, redondeado al entero (0,5 hacia arriba).",
    "p: puntos ÷ partidas, al porcentaje entero más cercano (0,5 % hacia arriba).",
    "dp sale de la tabla; por debajo de 0,50 es negativo (0,36 → −102).",
    "Con el mismo resultado, rinde más quien enfrentó rivales más fuertes.",
    "El TPR de los desempates (C.07, art. 10.2) usa solo las partidas jugadas sobre el tablero."
   ],
   "contenido": "<h3>La fórmula</h3><p><span class=\"aula-formula\">Rp = Ra + dp</span></p><div class=\"aula-norma\"><b>Reglamento de Títulos, art. 1.4.7</b> Ra es el total de los ratings de los rivales dividido entre el número de rivales, redondeado al entero más cercano (0,5 hacia arriba).</div><div class=\"aula-norma\"><b>Art. 1.4.9</b> dp sale de la tabla de conversión; los porcentajes se redondean al entero más cercano (0,5 % hacia arriba).</div><h3>Algunos valores de la tabla</h3><div class=\"aula-tabla\"><table><tr><th>p</th><th>dp</th><th>p</th><th>dp</th></tr><tr><td>0,79</td><td>230</td><td>0,36</td><td>−102</td></tr><tr><td>0,72</td><td>166</td><td>0,29</td><td>−158</td></tr><tr><td>0,67</td><td>125</td><td>0,21</td><td>−230</td></tr><tr><td>0,64</td><td>102</td><td>0,10</td><td>−366</td></tr><tr><td>0,57</td><td>50</td><td>0,00</td><td>−800</td></tr><tr><td>0,50</td><td>0</td><td>1,00</td><td>800</td></tr></table></div><h3>Ejemplo de la revista</h3><p>Torneo de 8 jugadores a una vuelta. El primero hace 5½/7 y sus rivales suman 18 870.</p><div class=\"aula-tabla\"><table><tr><td>Ra</td><td>18 870 ÷ 7 = 2695,71 → 2696</td></tr><tr><td>p</td><td>5,5 ÷ 7 = 0,7857 → 79 %</td></tr><tr><td>dp</td><td>+230</td></tr><tr><td><b>Rp</b></td><td><b>2926</b></td></tr></table></div><p>Dos jugadores con 2/7: uno de 2699 (rivales 18 871 → Ra 2696) y otra de 2693 (rivales 18 877 → Ra 2697). Con el mismo −158, sus performances son 2538 y 2539.</p><div class=\"aula-norma\"><b>C.07 (2026), art. 10.2 · TPR</b> Como desempate: ARO (art. 10.1) más la diferencia de la tabla según la fracción de puntos de las partidas jugadas sobre el tablero. Si hay jugadores sin rating, los desempates por rating se quitan, salvo que las bases o el árbitro principal publiquen antes cómo tratarlos (art. 10).</div><p class=\"aula-nota\">Error frecuente: truncar en vez de redondear. 0,7857 es 79 %, no 78 %.</p>"
  },
  {
   "id": "performance-norma",
   "coleccion": "revista-17",
   "titulo": "La performance para una norma de título",
   "articulos": "Reglamento de Títulos (2024) · arts. 1.4.6-1.4.8 y anexo",
   "resumen": "El piso ajustado de rating de los rivales, los mínimos de Ra y de performance y el porcentaje mínimo para una norma.",
   "claves": [
    "Piso ajustado: 2200 (GM), 2050 (MI), 2000 (WGM), 1850 (WIM).",
    "Solo un rival puede subirse al piso: el de menor rating.",
    "Los rivales sin rating no cubiertos por el piso cuentan como 1400.",
    "Ra mínimo: 2380 GM, 2230 MI, 2180 WGM, 2030 WIM.",
    "Performance mínima tras redondear: 2600, 2450, 2400, 2250.",
    "Se necesita al menos el 35 % de los puntos."
   ],
   "contenido": "<div class=\"aula-norma\"><b>Art. 1.4.6</b> Para las normas, el rating mínimo de los rivales es 2200 (GM), 2050 (MI), 2000 (WGM) y 1850 (WIM). Solo un rival puede subirse a ese piso; si hay varios por debajo, se sube el de menor rating. Los rivales sin rating no cubiertos por lo anterior cuentan como 1400.</div><div class=\"aula-norma\"><b>Art. 1.4.8</b> Rp = Ra + dp. Ra mínimo: 2380 GM, 2230 MI, 2180 WGM, 2030 WIM. Performance mínima: 2599,5 antes de redondear (2600 después) para GM; 2450 MI; 2400 WGM; 2250 WIM. Mínimo 35 % de los puntos.</div><h3>Ejemplo</h3><p>Suizo a 9 rondas, 6½ puntos contra 2412, 2388, 2361, 2335, 2296, 2270, 2248, 2203 y 1960 (requisitos de títulos y federaciones cumplidos).</p><div class=\"aula-tabla\"><table><tr><th></th><th>Sin piso</th><th>Con piso (1960 → 2050)</th></tr><tr><td>Suma</td><td>20 473</td><td>20 563</td></tr><tr><td>Ra</td><td>2275</td><td>2285</td></tr><tr><td>p</td><td>72 % → +166</td><td>72 % → +166</td></tr><tr><td><b>Rp</b></td><td>2441</td><td><b>2451</b></td></tr></table></div><p>Con el piso hay performance de norma de MI (Ra 2285 ≥ 2230 y Rp 2451 ≥ 2450). La tabla del anexo coincide: a 9 rondas, 6½ puntos con Ra de 2284 a 2324.</p><p class=\"aula-nota\">La performance es solo una parte: la norma exige también 9 partidas como regla general (1.4.1), la mezcla de federaciones (1.4.3-1.4.4) y de rivales con título (1.4.5).</p>"
  },
  {
   "id": "jurisprudencia-ajedrez",
   "coleccion": "revista-17",
   "titulo": "Jurisprudencia del ajedrez",
   "articulos": "Leyes 2023 · art. 0.2 (Prólogo)",
   "resumen": "Por qué el árbitro decide por analogía cuando un caso no está regulado y dónde estudiar cómo se han aplicado las Leyes.",
   "claves": [
    "Las Leyes no pueden cubrir todas las situaciones (art. 0.2).",
    "Si un caso no está regulado con precisión, se decide estudiando situaciones análogas que sí lo están.",
    "Las Leyes suponen competencia, buen juicio y objetividad absoluta del árbitro.",
    "Una regla demasiado detallada quitaría al árbitro libertad de criterio.",
    "Jurisprudencia: la doctrina que se repite en las resoluciones de los órganos con autoridad.",
    "El FIDE Handbook conserva las Leyes de versiones anteriores para compararlas."
   ],
   "contenido": "<div class=\"aula-norma\"><b>Art. 0.2 (Prólogo)</b> Las Leyes no pueden cubrir todas las situaciones posibles ni todas las cuestiones administrativas. Cuando un caso no está regulado con precisión, debería poder llegarse a una decisión correcta estudiando situaciones análogas reguladas en las Leyes. Se suponen árbitros competentes, de buen juicio y absolutamente objetivos; una regla demasiado detallada podría quitarles libertad de criterio.</div><p><b>Jurisprudencia</b> es la doctrina que establecen los órganos con autoridad para interpretar las normas —en el ajedrez, la FIDE y sus comisiones— y que se repite en varias resoluciones. Para conocer una norma por completo hay que ver cómo se ha aplicado.</p><h3>Dónde estudiarla</h3><ul><li>Las versiones históricas de las Leyes en el FIDE Handbook (antes de 2014, 2014, 2017, 2018 y la vigente de 2023).</li><li>El material de la Comisión de Árbitros de la FIDE (arbiters.fide.com), con interpretaciones y casos.</li></ul><p class=\"aula-nota\">Una decisión por analogía debe poder explicarse: casi todas las decisiones del árbitro se pueden apelar (art. 11.10).</p>"
  },
  {
   "id": "habitos-arbitro",
   "coleccion": "revista-17",
   "titulo": "Los hábitos del árbitro",
   "articulos": "Psicología del deporte (Paula Man Reich)",
   "resumen": "Cómo identificar y cambiar los hábitos que limitan tu labor arbitral, en cinco pasos.",
   "claves": [
    "Un hábito es una conducta que se repite con poca conciencia, positiva o negativa.",
    "Un hábito negativo se cambia reemplazándolo por otro.",
    "Lista cinco acciones sencillas que harían la diferencia.",
    "Haz un plan con fechas y ten un plan B.",
    "Escribe tus avances y compártelos con personas de confianza.",
    "Reconoce tus logros parciales."
   ],
   "contenido": "<p>Los hábitos van desde cómo hablas con los jugadores o tomas decisiones hasta cómo te ves en tu papel de árbitro. Los positivos se mantienen o se potencian; los negativos, si no se cambian, frenan el crecimiento profesional. La forma de cambiarlos es <b>reemplazarlos por otros</b>, elegidos por ti y no vividos como una obligación externa.</p><h3>Cinco pasos</h3><ol><li><b>Lista</b> cinco acciones sencillas que hoy no haces y que harían la diferencia. Los pretextos son la voz de los viejos hábitos.</li><li><b>Plan</b>: qué cambiar, desde cuándo y hasta cuándo, y con qué pasos.</li><li><b>Plan B</b>: qué otras acciones simples harás si algo no resulta.</li><li><b>Señales de avance</b>: escríbelas y compártelas con personas de confianza.</li><li><b>Premio</b>: reconoce cada logro parcial.</li></ol><p class=\"aula-nota\">Ejemplos para la sala: llegar con tiempo para revisar mesas y relojes, anotar cada incidencia en el momento y explicar las decisiones citando el artículo.</p>"
  },
  {
   "id": "dispositivos-electronicos",
   "coleccion": "revista-18",
   "titulo": "Dispositivos electrónicos y revisión de jugadores",
   "articulos": "Leyes 2023 · arts. 11.2.3, 11.3, 12.2.7, 12.8, 12.9",
   "resumen": "Qué dicen las Leyes sobre teléfonos y otros dispositivos, cuándo se pierde la partida y cómo se revisa a un jugador.",
   "claves": [
    "Prohibido tener en el recinto cualquier dispositivo electrónico no aprobado por el árbitro (11.3.2).",
    "Las bases pueden permitirlo completamente apagado en el bolso, donde se acuerde con el árbitro (11.3.2.1).",
    "Si lo lleva encima, pierde; las bases pueden fijar una sanción menor (11.3.2.2).",
    "La revisión puede incluir ropa, bolsos, objetos o el cuerpo, en privado y por alguien del mismo género (11.3.3).",
    "Si el jugador se niega a ser revisado, se aplica el art. 12.9.",
    "Nadie puede usar un teléfono en el recinto sin autorización del árbitro, tampoco el público (12.8)."
   ],
   "contenido": "<div class=\"aula-norma\"><b>Art. 11.3.1</b> Durante la partida está prohibido usar notas, fuentes de información o consejos, o analizar en otro tablero.</div><div class=\"aula-norma\"><b>Art. 11.3.2</b> Prohibido tener en el recinto cualquier dispositivo electrónico no aprobado por el árbitro.</div><div class=\"aula-norma\"><b>Art. 11.3.2.1</b> Las bases pueden permitir guardarlo completamente apagado en el bolso del jugador, colocado donde se acuerde con el árbitro. Ninguno de los dos jugadores puede usar ese bolso sin permiso del árbitro.</div><div class=\"aula-norma\"><b>Art. 11.3.2.2</b> Si es evidente que el jugador lleva el dispositivo encima, pierde la partida y el rival gana. Las bases pueden fijar una sanción diferente, menos severa.</div><div class=\"aula-norma\"><b>Art. 11.3.3</b> El árbitro puede pedir revisar ropa, bolsos, otros objetos o el cuerpo, en privado, por él o por alguien autorizado del mismo género que el jugador. Si el jugador no coopera, se aplica el art. 12.9.</div><div class=\"aula-norma\"><b>Arts. 12.2.7 y 12.8</b> El árbitro sigue las reglas de juego limpio. Sin su autorización, nadie puede usar un teléfono o aparato de comunicación en el recinto ni en las zonas contiguas que designe.</div><div class=\"aula-norma aula-norma-aviso\"><b>Recinto y zona de juego (art. 11.2).</b> El recinto incluye la zona de juego, baños, cafetería, zona de fumado y otros lugares que designe el árbitro. Salir del recinto, y para quien tiene el turno salir de la zona de juego, requiere permiso del árbitro (11.2.3).</div><p class=\"aula-nota\">En 2014 (art. 11.3.b) la prohibición se refería al teléfono móvil o medio de comunicación; desde 2017 abarca cualquier dispositivo y existe la opción del bolso.</p>"
  },
  {
   "id": "juego-limpio-fide",
   "coleccion": "revista-18",
   "titulo": "El sistema de juego limpio de la FIDE",
   "articulos": "Fair Play Regulations (desde 18-nov-2024) · arts. 1-6 · Fair Play Protection Measures (2024)",
   "resumen": "Qué es trampa, los tres niveles de protección, cómo se presenta una queja y qué valor tiene la estadística.",
   "claves": [
    "Trampa: usar dispositivos o fuentes de información, o manipular competiciones (sandbagging, arreglos, identidad falsa); el intento cuenta (1.2, 1.8).",
    "Tres niveles: máxima, aumentada y estándar; la estándar exige al menos una medida técnica.",
    "Quejas solo por escrito y con formulario; no se aceptan orales ni informales (3.2.3, 3.2.5).",
    "La queja «juega mejor que su rating» es manifiestamente infundada (3.2.9).",
    "Estadística como única prueba: z ≥ 5,00 presencial, 4,25 en línea; como apoyo, 2,50 (1.6).",
    "Las sanciones las decide la Comisión de Ética y Disciplina (EDC)."
   ],
   "contenido": "<h3>Qué es trampa</h3><div class=\"aula-norma\"><b>Art. 1.2</b> El uso deliberado de dispositivos electrónicos u otras fuentes de información o consejo durante la partida, o la manipulación de competiciones: arreglo de resultados, <i>sandbagging</i>, fraude de rating, identidad falsa, torneos o partidas ficticios. <b>Art. 1.8</b> El intento cuenta como trampa.</div><h3>Niveles de protección (Protection Measures 2024)</h3><div class=\"aula-tabla\"><table><tr><th>Nivel</th><th>Eventos</th></tr><tr><td>Máxima</td><td>Mundiales de la FIDE, continentales mayores, round robins de 2650+ (2450 femeniles), premios de más de 100 000 €</td></tr><tr><td>Aumentada</td><td>Continentales menores, campeonatos nacionales (no juveniles), torneos de normas, premios de 15 000 €+, round robins de 2500+ (2300 femeniles)</td></tr><tr><td>Estándar</td><td>Nacionales juveniles y todo lo demás con rating</td></tr></table></div><p>En el nivel estándar: una persona a cargo del juego limpio, zonas separadas para jugadores y público, al menos una medida técnica (detector de metales, cámaras, escáner…) y revisiones al azar si se puede.</p><h3>Quejas</h3><div class=\"aula-norma\"><b>Art. 3.2</b> Cualquier persona con número FIDE, por escrito y con el formulario (durante o después del torneo). Nada de quejas orales o informales. Durante el torneo se entrega al oficial principal de juego limpio o, si no hay, al árbitro principal, que advierte de la sanción por queja infundada, investiga y envía todo a la FPL y a la Comisión de Árbitros. Confidencialidad total hasta el final de la investigación.</div><div class=\"aula-norma aula-norma-aviso\"><b>Art. 3.2.9</b> Una queja basada solo en que alguien juega más fuerte de lo que dice su rating es manifiestamente infundada. <b>Art. 1.7</b> Un jugador o capitán sí puede comentar en privado una sospecha al árbitro para que vigile.</div><h3>Estadística</h3><div class=\"aula-tabla\"><table><tr><th>Uso</th><th>Umbral z (art. 1.6)</th></tr><tr><td>Única prueba, presencial</td><td>5,00</td></tr><tr><td>Única prueba, en línea</td><td>4,25</td></tr><tr><td>Apoyo de otras pruebas</td><td>2,50</td></tr></table></div><p class=\"aula-nota\">Torneos de nivel estándar: los casos van a la federación nacional, salvo que afecten un título FM/WFM o involucren a alguien con título FM/WFM o superior (art. 2.5). Prescripción: 5 años (1 en línea).</p>"
  },
  {
   "id": "disciplina-arbitros",
   "coleccion": "revista-18",
   "titulo": "Régimen disciplinario de los árbitros",
   "articulos": "B.06.5 · FIDE Arbiter Disciplinary Regulations (desde 1-jul-2026)",
   "resumen": "Quién juzga la conducta de los árbitros, qué faltas existen, qué sanciones hay y cómo se apela.",
   "claves": [
    "Juzga el Subcomité Disciplinario (DSC) de la Comisión de Árbitros; no actúa de oficio (arts. 1-2).",
    "Las quejas van primero a la ARB, que decide si son admisibles; los casos más graves, a la EDC (2.4).",
    "Prescripción: 5 años (fraude, corrupción, trampa) o 3 años; queja dentro de 9 meses desde que se conocieron los hechos (2.8).",
    "Sanciones: advertencia (12 meses), amonestación (24 meses), inhabilitación hasta 18 meses (24 si reincide) (art. 4).",
    "Apelación al Consejo FIDE en 15 días naturales, con 300 € (art. 6).",
    "La apelación de un jugador contra una decisión en la sala es otra cosa: art. 11.10 de las Leyes."
   ],
   "contenido": "<div class=\"aula-norma\"><b>Arts. 1 y 2</b> El DSC tiene un presidente, dos miembros y dos suplentes, Árbitros Internacionales de categoría A, B o C de federaciones distintas, al menos tres con formación jurídica y ninguno de la ARB. Juzga a los árbitros con licencia FIDE y a los conferencistas de seminarios. No actúa de oficio: la ARB decide la admisibilidad y envía el caso al DSC, o a la EDC si podría merecer más de 18 meses de inhabilitación (24 si reincide).</div><div class=\"aula-norma\"><b>Art. 2.6</b> Pueden quejarse: el presidente de la FIDE, el Consejo, la Junta Directiva, las comisiones, una federación, el organizador, un conferencista o árbitro del evento, y los jugadores directamente afectados.</div><h3>Faltas (art. 3)</h3><ul><li>3.1 Administrativas: informes falsos.</li><li>3.2 Daño a la reputación: parcialidad, acusaciones injustificadas, discriminación, regalos.</li><li>3.3 Deshonestidad: corrupción, acusar de trampa sin bases, no cooperar, no informar de un soborno, ayuda externa en evaluaciones de seminarios.</li><li>3.4 Mala conducta: cortesía, conducta social, vestimenta.</li><li>3.5 Obligaciones: no presentarse, llegar tarde, ausentarse, dos eventos a la vez, eventos rechazados por la federación.</li><li>3.6 Técnicas: alterar emparejamientos, falsear planillas o informes, firmar normas incorrectas, incumplir las Leyes.</li></ul><div class=\"aula-tabla\"><table><tr><th>Sanción (art. 4)</th><th>Para</th><th>Vigencia</th></tr><tr><td>Advertencia escrita</td><td>Faltas menores</td><td>12 meses</td></tr><tr><td>Amonestación escrita</td><td>Faltas más serias</td><td>24 meses</td></tr><tr><td>Inhabilitación</td><td>Faltas graves</td><td>Hasta 18 meses; hasta 24 si reincide</td></tr></table></div><div class=\"aula-norma\"><b>Art. 6</b> Apelación ante el Consejo FIDE en 15 días naturales, improrrogables, con 300 € que se devuelven si prospera al menos en parte.</div><p class=\"aula-nota\">Antecedente: la propuesta de 2014 publicada en la revista tipificaba 13 faltas, cada una con su sanción, con apelación al Buró Presidencial.</p>"
  },
  {
   "id": "torneo-valido-rating",
   "coleccion": "revista-18",
   "titulo": "Torneo válido para rating FIDE",
   "articulos": "Reglamento de Rating (2024) · arts. 0.2, 1, 3.1, 4.1, 5.1, 6, 7.1, 9 · Resolución del Consejo FIDE (nov-2026) · B.06.1 arts. 6.1-6.2",
   "resumen": "Registro, ritmo mínimo, horas de juego, árbitros y envío del informe para que un torneo se evalúe para rating.",
   "claves": [
    "Registro: 3 días antes; 30 si juega alguien de más de 2700 (o una jugadora de más de 2500) o si hay normas.",
    "Ritmo (por jugador, 60 jugadas): 120 min si alguien tiene 2400+; 90 si 1800+; 60 si ambos menos de 1800.",
    "Desde nov-2026: 60′+30″ es estándar; 45′+30″ en Circuito FIDE o sin jugadores de 2400+.",
    "Máximo 12 horas de juego por día; en torneos de normas, máximo dos rondas por día.",
    "Árbitros con la cuota de registro al día; si no, el torneo puede no evaluarse.",
    "Primer rating: 5 partidas contra rivales con rating y resultado de al menos 1400."
   ],
   "contenido": "<div class=\"aula-norma\"><b>Art. 0.2</b> La federación del país registra el torneo y su calendario: al menos 3 días antes; 30 días si participa alguien de más de 2700 o una jugadora de más de 2500. Torneos de normas: 30 días (Títulos 1.1.1).</div><div class=\"aula-norma\"><b>Art. 1.1</b> Tiempo mínimo por jugador, suponiendo 60 jugadas: 120 minutos si al menos uno tiene 2400 o más; 90 si al menos uno tiene 1800 o más; 60 si ambos tienen menos de 1800. <b>Art. 1.2</b> Primer control de al menos 30 jugadas.</div><p><span class=\"aula-formula\">tiempo = base + 60 × incremento</span> &nbsp; 90′+30″ = 120 min; 60′+30″ = 90 min; 45′+30″ = 75 min.</p><div class=\"aula-norma aula-norma-aviso\"><b>Resolución del Consejo FIDE (nov-2026)</b> 60′+30″ es ritmo estándar sin aprobación especial, para rating y títulos. 45′+30″: torneos del Circuito FIDE o sin jugadores de 2400 o más. Para normas: máximo dos rondas por día y solo una norma de estos ritmos por título. Puede ajustarse tras la Asamblea extraordinaria de diciembre de 2026.</div><div class=\"aula-tabla\"><table><tr><th>Ritmo</th><th>Partida (60 jugadas)</th><th>Rondas en 12 h</th></tr><tr><td>90′+30″</td><td>4 h</td><td>3</td></tr><tr><td>60′+30″</td><td>3 h</td><td>4</td></tr><tr><td>45′+30″</td><td>2 h 30</td><td>4</td></tr><tr><td>30′+30″</td><td>2 h</td><td>6</td></tr></table></div><div class=\"aula-norma\"><b>Arts. 3.1, 4.1, 5.1 y 6</b> Máximo 12 horas de juego por día. Si dura más de 30 días, informes mensuales. Partidas no jugadas no se evalúan; las que tienen al menos una jugada de cada uno sí. Los matches con un jugador sin rating no se evalúan.</div><div class=\"aula-norma\"><b>B.06.1, arts. 6.1-6.2</b> Los árbitros deben pagar la cuota de registro (antes «licencia»); si no, el torneo puede no evaluarse y no valen sus normas de árbitro.</div><p class=\"aula-nota\">Las bases deben decir que el torneo será evaluado (9.2) y el informe TRF debe llegar a tiempo para la tercera lista después del final (9.1).</p>"
  }
 ],
 "preguntas": [
  {
   "ficha": "promocion-coronacion",
   "texto": "Un jugador promociona poniendo una torre invertida y dice «dama». ¿Qué pieza es?",
   "opciones": [
    "Una dama, porque lo anunció",
    "Una torre",
    "Una dama si el rival no protestó",
    "Ninguna: es jugada ilegal y se repite"
   ],
   "correcta": 1,
   "explicacion": "La pieza queda elegida al tocar la casilla (4.4.4) y una torre invertida es una torre aunque se diga «dama» (Manual del Árbitro FIDE 2026, comentario al art. 4.6)."
  },
  {
   "ficha": "promocion-coronacion",
   "texto": "¿Cuándo queda decidida la pieza elegida al promocionar?",
   "opciones": [
    "Cuando el jugador la anuncia",
    "Cuando toca la casilla de promoción",
    "Cuando pulsa el reloj",
    "Cuando suelta el peón"
   ],
   "correcta": 1,
   "explicacion": "Art. 4.4.4: la elección queda decidida cuando la pieza toca la casilla de promoción."
  },
  {
   "ficha": "promocion-coronacion",
   "texto": "Un jugador quita su peón de la séptima fila y pone la dama directamente en la octava, sin apoyar el peón en la octava. ¿Es válido?",
   "opciones": [
    "No: el peón debe llegar a la última fila",
    "Sí: el peón no tiene que colocarse en la casilla de llegada",
    "Solo en rápidas",
    "Solo si el árbitro lo autoriza antes"
   ],
   "correcta": 1,
   "explicacion": "Art. 4.6.1: el peón no tiene que colocarse en la casilla de llegada; y 4.6.2: quitar el peón y poner la pieza puede hacerse en cualquier orden. La edición de 2012 decía lo contrario."
  },
  {
   "ficha": "promocion-coronacion",
   "texto": "Partida estándar. Un jugador lleva el peón a la octava, pulsa el reloj y deja el peón sin cambiar. ¿Qué hace el árbitro?",
   "opciones": [
    "Le deja elegir la pieza sin sanción",
    "Cambia el peón por una dama y da 2 minutos al rival",
    "Declara la partida perdida",
    "Cambia el peón por la pieza que el jugador diga y da 1 minuto al rival"
   ],
   "correcta": 1,
   "explicacion": "Art. 7.5.2: es jugada ilegal y el peón se cambia por una dama de su color; art. 7.5.5: primera jugada ilegal, 2 minutos para el rival."
  },
  {
   "ficha": "promocion-coronacion",
   "texto": "Te falta la dama para promocionar. ¿Qué debes hacer?",
   "opciones": [
    "Usar una torre invertida",
    "Pedirle la dama capturada al rival",
    "Detener el reloj y pedirle la pieza al árbitro",
    "Pulsar el reloj y avisar después"
   ],
   "correcta": 2,
   "explicacion": "Art. 6.11.2: puedes detener el reloj para pedir la ayuda del árbitro cuando la pieza no está disponible."
  },
  {
   "ficha": "promocion-coronacion",
   "texto": "Tu rival te pide la dama que le capturaste para promocionar. ¿Estás obligado a dársela?",
   "opciones": [
    "Sí, siempre",
    "No; la pieza la consigue el árbitro",
    "Sí, si el rival detuvo el reloj",
    "Solo en partidas rápidas"
   ],
   "correcta": 1,
   "explicacion": "Las Leyes no obligan al rival a entregar sus piezas capturadas. Para eso se detiene el reloj y se le pide la pieza al árbitro (6.11.2)."
  },
  {
   "ficha": "promocion-coronacion",
   "texto": "Un jugador quita el peón con una mano, pone la dama con la otra y pulsa el reloj. Es su primera irregularidad. ¿Qué pasa?",
   "opciones": [
    "Nada, la promoción es correcta",
    "Se sanciona como jugada ilegal: 2 minutos para el rival",
    "Pierde la partida",
    "Advertencia verbal y sigue"
   ],
   "correcta": 1,
   "explicacion": "Art. 7.5.4: usar dos manos para una sola jugada (por ejemplo, una promoción) y pulsar el reloj se sanciona como jugada ilegal (7.5.5)."
  },
  {
   "ficha": "promocion-coronacion",
   "texto": "Rápidas sin supervisión adecuada (A.5). El árbitro ve un peón blanco en la octava fila sin cambiar. ¿Qué hace?",
   "opciones": [
    "Lo cambia de inmediato por una dama",
    "Espera a que se complete la jugada siguiente; si la posición ilegal sigue, declara tablas",
    "Declara perdida la partida de las blancas",
    "No hace nada nunca"
   ],
   "correcta": 1,
   "explicacion": "Art. A.5.4: el árbitro espera a que se complete la jugada siguiente; si la posición ilegal sigue en el tablero, declara tablas."
  },
  {
   "ficha": "promocion-coronacion",
   "texto": "¿Cuál es la sanción por la primera jugada ilegal en una partida rápida?",
   "opciones": [
    "2 minutos al rival",
    "1 minuto al rival",
    "30 segundos al rival",
    "Pérdida de la partida"
   ],
   "correcta": 1,
   "explicacion": "Art. A.3: en rápidas (y relámpago, B.3) la sanción es de 1 minuto en lugar de 2."
  },
  {
   "ficha": "promocion-coronacion",
   "texto": "Un jugador promociona a dama aunque todavía tiene su dama original en el tablero. ¿Es legal?",
   "opciones": [
    "No, solo se puede promocionar a piezas capturadas",
    "Sí, la elección no se limita a piezas capturadas",
    "Solo si el rival lo acepta",
    "Solo a torre o caballo"
   ],
   "correcta": 1,
   "explicacion": "Art. 3.7.3.4: la elección del jugador no se limita a las piezas capturadas antes."
  },
  {
   "ficha": "siete-cartas",
   "texto": "¿Qué carta se abre siempre primero?",
   "opciones": [
    "Las planillas",
    "El reloj",
    "La versión de los jugadores",
    "Los reglamentos FIDE"
   ],
   "correcta": 2,
   "explicacion": "El método empieza siempre por escuchar a los dos jugadores; si sus versiones no coinciden, esa evidencia se anula (palabra contra palabra)."
  },
  {
   "ficha": "siete-cartas",
   "texto": "A un jugador le suena el teléfono, que llevaba en el bolsillo. Su rival solo tiene el rey. Las bases no dicen nada. ¿Resultado?",
   "opciones": [
    "Tablas, porque el rival no puede dar mate",
    "Gana el rival",
    "Se le quitan 2 minutos al infractor",
    "Advertencia y sigue la partida"
   ],
   "correcta": 1,
   "explicacion": "Art. 11.3.2.2: si es evidente que lleva el aparato encima, pierde y el rival gana. Desde las Leyes de 2014 no hay excepción por falta de material (Manual del Árbitro 2026)."
  },
  {
   "ficha": "siete-cartas",
   "texto": "¿Cuándo puede un árbitro castigar un teléfono con una sanción menor que la pérdida?",
   "opciones": [
    "Siempre, con su mejor criterio",
    "Cuando las bases del torneo lo prevén",
    "Cuando el teléfono no sonó",
    "Cuando el rival lo acepta"
   ],
   "correcta": 1,
   "explicacion": "Art. 11.3.2.2: las bases del evento pueden fijar una sanción distinta y menos severa. Sin esa previsión, pierde."
  },
  {
   "ficha": "siete-cartas",
   "texto": "Rápidas a 15 min + 5 s. El reloj de una partida está puesto sin incremento. ¿Qué dice la norma?",
   "opciones": [
    "Se sigue así, porque ya empezó",
    "El árbitro pone la programación correcta y ajusta los tiempos con su mejor criterio",
    "La partida se anula",
    "Pierde quien no lo advirtió"
   ],
   "correcta": 1,
   "explicacion": "Art. 6.10.2: si la programación del reloj es incorrecta, se detiene, se pone la programación correcta y se ajustan tiempos y contador."
  },
  {
   "ficha": "siete-cartas",
   "texto": "Las negras, con rey, caballo y peón, ofrecen tablas porque «con rey y caballo no me puedes dar mate». ¿Es una posición muerta?",
   "opciones": [
    "Sí, rey y caballo nunca dan mate",
    "No: existe una serie de jugadas legales que termina en mate",
    "Solo si el peón está bloqueado",
    "Depende del tiempo en el reloj"
   ],
   "correcta": 1,
   "explicacion": "Con rey y caballo hay mates posibles si el rey rival queda encerrado por sus propias piezas. No es posición muerta (5.2.2) y una caída de bandera de las negras daría la victoria a las blancas (6.9)."
  },
  {
   "ficha": "siete-cartas",
   "texto": "¿Qué requisito agregan las Leyes 2023 al acuerdo de tablas?",
   "opciones": [
    "Que lo autorice el árbitro",
    "Que ambos jugadores hayan hecho al menos una jugada",
    "Que se haya llegado a la jugada 30",
    "Que se anote en ambas planillas"
   ],
   "correcta": 1,
   "explicacion": "Art. 5.2.3: la partida es tablas por acuerdo siempre que ambos jugadores hayan hecho al menos una jugada. (Las bases pueden limitar más los acuerdos, 9.1.1)."
  },
  {
   "ficha": "siete-cartas",
   "texto": "Un espectador le señala a un jugador que tiene la bandera a punto de caer. ¿Qué prevén las Leyes?",
   "opciones": [
    "Anular la partida",
    "Que nadie intervenga; el árbitro puede expulsar al infractor del recinto",
    "Dar la partida por perdida al jugador ayudado",
    "Repetir la partida"
   ],
   "correcta": 1,
   "explicacion": "Art. 12.7: los espectadores no pueden intervenir y el árbitro puede expulsar a los infractores. Las Leyes no prevén anular la partida por esa intervención."
  },
  {
   "ficha": "siete-cartas",
   "texto": "Hay un apagón y hay que interrumpir las partidas. ¿Quién detiene los relojes?",
   "opciones": [
    "Cada jugador",
    "El árbitro",
    "El organizador",
    "Nadie: el tiempo sigue corriendo"
   ],
   "correcta": 1,
   "explicacion": "Art. 6.11.1: si hay que interrumpir la partida, el árbitro detiene el reloj; 6.11.3: decide cuándo se reanuda; 12.5: puede dar tiempo adicional por una perturbación externa."
  },
  {
   "ficha": "desempate-progresivo",
   "texto": "¿Cómo se calcula el desempate progresivo (PS)?",
   "opciones": [
    "Sumando las puntuaciones finales de los rivales",
    "Sumando la puntuación del jugador al final de cada ronda",
    "Multiplicando puntos por rondas",
    "Contando las victorias"
   ],
   "correcta": 1,
   "explicacion": "C.07 (2026), art. 7.5: se suma la puntuación del participante al final de cada ronda."
  },
  {
   "ficha": "desempate-progresivo",
   "texto": "Resultados: 1, 0, 1, 1, 1. ¿Cuál es su progresivo?",
   "opciones": [
    "4",
    "10",
    "11",
    "12"
   ],
   "correcta": 2,
   "explicacion": "Acumulados 1, 1, 2, 3, 4; suma = 11."
  },
  {
   "ficha": "desempate-progresivo",
   "texto": "Con los mismos resultados (1, 0, 1, 1, 1), ¿cuánto vale el PS-C1?",
   "opciones": [
    "10",
    "11",
    "9",
    "7"
   ],
   "correcta": 0,
   "explicacion": "PS-C1 excluye la puntuación después de la primera ronda (art. 14.1): 1 + 2 + 3 + 4 = 10."
  },
  {
   "ficha": "desempate-progresivo",
   "texto": "Un jugador ganó la ronda 3 por incomparecencia. ¿Cómo cuenta ese punto en su progresivo?",
   "opciones": [
    "No cuenta",
    "Cuenta como medio punto",
    "Cuenta: forma parte de su puntuación después de esa ronda",
    "Se reemplaza por el promedio"
   ],
   "correcta": 2,
   "explicacion": "El art. 7.5 suma la puntuación del participante al final de cada ronda, y esa puntuación incluye el punto sin jugar. Las reglas especiales del art. 16 son para el Buchholz y el Sonneborn-Berger."
  },
  {
   "ficha": "desempate-progresivo",
   "texto": "Torres (½, ½, 1, ½, ½) y Hernández (0, 1, 1, 1, 0) empatan en 3 puntos y 9 de PS. Con PS-C1, ¿quién queda delante?",
   "opciones": [
    "Torres",
    "Hernández",
    "Siguen empatados",
    "Hay que sortear"
   ],
   "correcta": 1,
   "explicacion": "Sin la ronda 1: Torres 1 + 2 + 2½ + 3 = 8½; Hernández 1 + 2 + 3 + 3 = 9."
  },
  {
   "ficha": "desempate-progresivo",
   "texto": "¿Qué tipo de desempate es el progresivo según el C.07?",
   "opciones": [
    "Tipo A (encuentros entre empatados)",
    "Tipo B (resultados propios del jugador)",
    "Tipo C (resultados finales de los rivales)",
    "Tipo D (ratings de los rivales)"
   ],
   "correcta": 1,
   "explicacion": "Art. 4.3: los de tipo B se basan en los resultados o datos del propio participante; el PS figura como tipo B en la tabla del art. 5."
  },
  {
   "ficha": "desempate-progresivo",
   "texto": "El árbitro decide, al terminar el torneo, agregar el PS-C2 porque dos jugadores siguen empatados. ¿Es correcto?",
   "opciones": [
    "Sí, el árbitro puede agregar cortes cuando hagan falta",
    "No: la lista de desempates se publica antes del inicio del torneo",
    "Sí, si los jugadores aceptan",
    "Solo en torneos sin premios"
   ],
   "correcta": 1,
   "explicacion": "Arts. 4.1 y 4.1.1: la lista ordenada de desempates la fija el organizador y, si hace falta, la completa el árbitro principal, pero se publica antes del inicio del torneo."
  },
  {
   "ficha": "desempate-progresivo",
   "texto": "Dos jugadores tienen exactamente la misma secuencia de resultados ronda a ronda. ¿Qué pasa con el progresivo y sus cortes?",
   "opciones": [
    "Los separa el PS-C1",
    "Los separa el PS-C2",
    "Empatan en todos; se pasa al siguiente desempate de la lista",
    "Gana el de mayor rating"
   ],
   "correcta": 2,
   "explicacion": "Con la misma secuencia, los acumulados son iguales y también todas sus sumas. Se aplica el siguiente desempate de la lista; agotada, sorteo (art. 4.2)."
  },
  {
   "ficha": "decisiones-bajo-presion",
   "texto": "¿Cuál es un síntoma típico del estrés en un árbitro?",
   "opciones": [
    "Todo parece pasar más rápido de lo que pasa",
    "Más claridad para pensar",
    "Más paciencia con los jugadores",
    "Menos ritmo cardiaco"
   ],
   "correcta": 0,
   "explicacion": "Entre los síntomas que describe el artículo: pulso acelerado, dificultad para concentrarse y la sensación de que todo pasa más rápido."
  },
  {
   "ficha": "decisiones-bajo-presion",
   "texto": "¿Cuál de estos pensamientos reduce el estrés?",
   "opciones": [
    "«Si me equivoco, ¿qué dirán mis colegas?»",
    "«Esta es mi única oportunidad de brillar»",
    "«Voy a hacer mi mejor trabajo y al final evaluaré su eficacia»",
    "«Si fallo ahora, no tendré otra oportunidad»"
   ],
   "correcta": 2,
   "explicacion": "Los otros tres son ejemplos de pensamientos que aumentan el estrés según el artículo."
  },
  {
   "ficha": "decisiones-bajo-presion",
   "texto": "Ante una decisión importante, ¿qué recomienda el artículo?",
   "opciones": [
    "Decidir de inmediato para mostrar seguridad",
    "Tomarse unos segundos más, respirar y pensar",
    "Preguntarle a los espectadores",
    "Dejar que los jugadores lo arreglen"
   ],
   "correcta": 1,
   "explicacion": "La primera recomendación es no apresurarse: respirar, pensar cuál es la mejor decisión y recién entonces decidir."
  },
  {
   "ficha": "decisiones-bajo-presion",
   "texto": "¿Qué artículo de las Leyes te permite detener la partida para pensar con calma?",
   "opciones": [
    "Art. 6.11.1: el árbitro detiene el reloj si hay que interrumpir la partida",
    "Art. 9.1.2.1",
    "Art. 11.3.2",
    "Art. 7.6"
   ],
   "correcta": 0,
   "explicacion": "Art. 6.11.1: el árbitro detiene el reloj; 6.11.3: decide cuándo se reanuda la partida."
  },
  {
   "ficha": "decisiones-bajo-presion",
   "texto": "Según el artículo, ¿dónde conviene mantener los pensamientos durante el arbitraje?",
   "opciones": [
    "En los errores del pasado",
    "En el aquí y el ahora",
    "En la próxima ronda",
    "En la evaluación final"
   ],
   "correcta": 1,
   "explicacion": "Pensar en el pasado o en el futuro desconcentra y resta eficacia."
  },
  {
   "ficha": "buchholz-rondas-no-jugadas",
   "texto": "¿Qué es el Buchholz (BH)?",
   "opciones": [
    "La suma de los puntos ganados contra los primeros clasificados",
    "La suma de las puntuaciones de los rivales de un participante",
    "La suma de las puntuaciones de los rivales multiplicadas por el resultado",
    "El promedio del rating de los rivales"
   ],
   "correcta": 1,
   "explicacion": "Art. 8.1 del C.07 (2026). Multiplicar la puntuación del rival por el resultado es el Sonneborn-Berger (art. 9.1); el promedio de rating es el ARO (art. 10.1)."
  },
  {
   "ficha": "buchholz-rondas-no-jugadas",
   "texto": "Suizo a 9 rondas. P pierde por incomparecencia en la ronda 3, termina con 5 puntos y su rival programado termina con 6. ¿Qué aporta esa ronda al Buchholz de P?",
   "opciones": [
    "5",
    "5½",
    "6",
    "4½"
   ],
   "correcta": 0,
   "explicacion": "Art. 16.4: rival ficticio con la puntuación de P (5), sin pasar de la puntuación ajustada del rival programado (6). mín(5; 6) = 5. El 5½ sale de la fórmula de 2012, que ya no rige."
  },
  {
   "ficha": "buchholz-rondas-no-jugadas",
   "texto": "Suizo a 7 rondas. P recibe el descanso del emparejamiento y termina con 5½. ¿Qué aporta esa ronda a su Buchholz?",
   "opciones": [
    "5½",
    "0",
    "1",
    "3½"
   ],
   "correcta": 3,
   "explicacion": "Categoría 1: el tope es tablas × rondas = ½ × 7 = 3½ (art. 16.4.2). mín(5½; 3½) = 3½."
  },
  {
   "ficha": "buchholz-rondas-no-jugadas",
   "texto": "P gana por incomparecencia, termina con 6½ y el rival programado termina con 4. ¿Cuánto aporta esa ronda?",
   "opciones": [
    "6½",
    "4½",
    "4",
    "5"
   ],
   "correcta": 2,
   "explicacion": "En las incomparecencias (categorías 2 y 4) el tope es la puntuación ajustada del rival programado: mín(6½; 4) = 4 (art. 16.4.1)."
  },
  {
   "ficha": "buchholz-rondas-no-jugadas",
   "texto": "Un rival tuyo perdió una partida por incomparecencia contra otro jugador. Al calcular tu Buchholz, ¿cómo cuenta esa partida en la puntuación del rival?",
   "opciones": [
    "Como tablas",
    "Con el resultado asignado (derrota)",
    "No cuenta: se resta del total",
    "Como victoria"
   ],
   "correcta": 1,
   "explicacion": "Art. 16.3.1: las categorías 1 a 4 se evalúan con el resultado asignado. Contarla como tablas era la regla de 2012 (sección 15.3), ya derogada."
  },
  {
   "ficha": "buchholz-rondas-no-jugadas",
   "texto": "Un jugador pide un bye de cero puntos en la última ronda. Para el Buchholz de sus rivales, ¿cómo cuenta esa ronda?",
   "opciones": [
    "Como tablas",
    "Como derrota",
    "Como victoria",
    "Se ignora"
   ],
   "correcta": 0,
   "explicacion": "Es categoría 5 (bye pedido en la última ronda): art. 16.3.2, se evalúa como tablas."
  },
  {
   "ficha": "buchholz-rondas-no-jugadas",
   "texto": "¿Qué es una VUR?",
   "opciones": [
    "Una ronda con descanso asignado por el emparejamiento",
    "Una ronda aplazada",
    "Una victoria por incomparecencia",
    "Una ronda no jugada voluntaria: bye solicitado o pérdida por incomparecencia"
   ],
   "correcta": 3,
   "explicacion": "Art. 16.1: VUR (voluntary unplayed round) es un bye solicitado o una pérdida por incomparecencia."
  },
  {
   "ficha": "buchholz-rondas-no-jugadas",
   "texto": "¿Hasta cuándo rigió el «jugador virtual» con la fórmula Svon = SPR + (1 − SfPR) + 0,5 × (n − R)?",
   "opciones": [
    "Hasta 2014",
    "Sigue vigente",
    "Hasta el 31 de agosto de 2023",
    "Hasta el 1 de marzo de 2026"
   ],
   "correcta": 2,
   "explicacion": "El reglamento anterior, con el jugador virtual (sección 15.2), estuvo vigente hasta el 31-ago-2023. Desde 2023 se usa el rival ficticio del art. 16."
  },
  {
   "ficha": "posicion-muerta",
   "texto": "¿Qué artículo de las Leyes 2023 define la posición muerta?",
   "opciones": [
    "Art. 9.6",
    "Art. 5.2.2",
    "Art. 9.3",
    "Art. 12.9"
   ],
   "correcta": 1,
   "explicacion": "Art. 5.2.2 (y art. 1.5 en las reglas básicas). El art. 9.6 actual trata de la quíntuple repetición y las 75 jugadas."
  },
  {
   "ficha": "posicion-muerta",
   "texto": "Se produce una posición muerta y ningún jugador dice nada. ¿Qué pasa?",
   "opciones": [
    "La partida terminó en tablas en ese momento",
    "Nada hasta que alguien reclame",
    "El árbitro espera 50 jugadas",
    "Gana quien tenga más material"
   ],
   "correcta": 0,
   "explicacion": "Art. 5.2.2: la posición muerta termina inmediatamente la partida (si la jugada que la produjo fue legal). No hace falta reclamarla."
  },
  {
   "ficha": "posicion-muerta",
   "texto": "Rey y caballo contra rey y caballo. ¿Es posición muerta?",
   "opciones": [
    "Sí, siempre",
    "Depende del tiempo en el reloj",
    "Solo si los caballos son del mismo color",
    "No: existe una serie de jugadas legales que termina en mate"
   ],
   "correcta": 3,
   "explicacion": "La definición pide que el mate sea imposible con cualquier serie legal. Con el rey en la esquina, encerrado por su propio caballo, el caballo rival puede dar mate."
  },
  {
   "ficha": "posicion-muerta",
   "texto": "A las blancas se les cae la bandera. Las negras tienen rey y caballo; las blancas, rey y caballo. ¿Resultado?",
   "opciones": [
    "Tablas, por material insuficiente",
    "Tablas, por posición muerta",
    "Ganan las negras",
    "Se repite la partida"
   ],
   "correcta": 2,
   "explicacion": "Art. 6.9: solo son tablas si las negras no pueden dar mate con ninguna serie de jugadas legales. Con rey y caballo contra rey y caballo sí existe un mate legal, así que ganan las negras."
  },
  {
   "ficha": "posicion-muerta",
   "texto": "A las blancas se les cae la bandera. Las negras solo tienen el rey. ¿Resultado?",
   "opciones": [
    "Ganan las negras",
    "Tablas",
    "Se suman 2 minutos a las blancas",
    "Pierden las dos"
   ],
   "correcta": 1,
   "explicacion": "Art. 6.9: las negras no pueden dar mate con ninguna serie de jugadas legales, así que son tablas."
  },
  {
   "ficha": "posicion-muerta",
   "texto": "Peones blancos y negros bloqueados; las blancas tienen además una torre que puede ofrecerse a un peón negro. Un jugador dice que es posición muerta. ¿Qué decides?",
   "opciones": [
    "La partida sigue: la torre puede sacrificarse y abrir la posición",
    "Tablas: los peones están bloqueados",
    "Gana el que tiene la torre",
    "Se detiene el reloj y se sortea"
   ],
   "correcta": 0,
   "explicacion": "Si el peón captura la torre, la cadena se abre y existe una serie de jugadas legales que termina en mate. No es posición muerta (art. 5.2.2)."
  },
  {
   "ficha": "posicion-muerta",
   "texto": "¿Por qué en el diagrama de alfiles y peones bloqueados de la revista no hay mate posible?",
   "opciones": [
    "Porque los alfiles son de distinto color entre sí",
    "Porque los reyes están en la columna d",
    "Porque hay pocos peones",
    "Porque cada alfil va por el color de sus propios peones: no ataca a los peones rivales ni puede ser capturado por ellos"
   ],
   "correcta": 3,
   "explicacion": "Los peones rivales están en casillas del otro color y capturan en casillas del otro color: el alfil no puede sacrificarse para abrir la posición."
  },
  {
   "ficha": "padres-en-el-torneo",
   "texto": "Un padre quiere entrar al área de juego para acompañar a su hijo. ¿Qué dicen las Leyes?",
   "opciones": [
    "Puede entrar si no habla",
    "Nunca puede entrar",
    "Solo puede entrar con permiso del árbitro",
    "Puede entrar si su hijo es menor de 10 años"
   ],
   "correcta": 2,
   "explicacion": "Art. 11.2.3.3: solo con permiso del árbitro puede entrar al área de juego una persona que no sea jugador ni árbitro."
  },
  {
   "ficha": "padres-en-el-torneo",
   "texto": "Un padre ve que el rival de su hijo hizo una jugada ilegal. ¿Qué puede hacer?",
   "opciones": [
    "Decírselo a su hijo",
    "Informar solo al árbitro",
    "Detener el reloj",
    "Reclamar en nombre de su hijo"
   ],
   "correcta": 1,
   "explicacion": "Art. 12.7: quien observe una irregularidad solo puede informar al árbitro."
  },
  {
   "ficha": "padres-en-el-torneo",
   "texto": "Un padre interviene repetidamente en una partida. ¿Qué puede hacer el árbitro?",
   "opciones": [
    "Expulsarlo del recinto de juego",
    "Declarar perdida la partida del hijo de inmediato",
    "Nada, los espectadores no están sujetos a las Leyes",
    "Restarle tiempo al hijo automáticamente"
   ],
   "correcta": 0,
   "explicacion": "Art. 12.7: los espectadores no pueden intervenir y el árbitro puede expulsar a los infractores del recinto de juego. Las sanciones del art. 12.9 son para los jugadores."
  },
  {
   "ficha": "padres-en-el-torneo",
   "texto": "Una madre usa el celular en la sala de juego para grabar las partidas, sin autorización. ¿Qué artículo se aplica?",
   "opciones": [
    "Art. 11.3.2",
    "Ninguno: solo afecta a los jugadores",
    "Art. 6.9",
    "Art. 12.8"
   ],
   "correcta": 3,
   "explicacion": "Art. 12.8: salvo autorización del árbitro, nadie puede usar celular ni otro medio de comunicación en el recinto de juego. El art. 11.3.2 es para los jugadores."
  },
  {
   "ficha": "padres-en-el-torneo",
   "texto": "Según Paula Man Reich, ¿qué conviene hacer al inicio del torneo con los padres?",
   "opciones": [
    "Prohibirles la entrada al local",
    "Ignorarlos para no generar conflictos",
    "Dejar claros sus deberes, derechos y las consecuencias, iguales para todos",
    "Darles la lista de emparejamientos antes que a los jugadores"
   ],
   "correcta": 2,
   "explicacion": "Dejar claros los límites del papel de los padres y del árbitro ayuda al control del torneo y al bienestar del joven deportista."
  },
  {
   "ficha": "swiss-manager-configuracion",
   "texto": "Dos jugadores tienen el mismo rating: uno es WIM y el otro FM. ¿Quién recibe el número inicial más alto (mejor)?",
   "opciones": [
    "La WIM",
    "El FM",
    "Se ordena alfabéticamente",
    "Se sortea"
   ],
   "correcta": 1,
   "explicacion": "C.04.2, art. 2.2.2: GM, IM, WGM, FM, WIM, CM, WFM, WCM. El FM va antes que la WIM. (La edición original ponía WIM antes que FM)."
  },
  {
   "ficha": "swiss-manager-configuracion",
   "texto": "Dos jugadores sin título y con el mismo rating. ¿Cómo se ordenan?",
   "opciones": [
    "Por orden alfabético, salvo que se haya anunciado otro criterio",
    "Por edad",
    "Por federación",
    "Al azar"
   ],
   "correcta": 0,
   "explicacion": "C.04.2, art. 2.2.3: orden alfabético, salvo que se haya establecido antes otro criterio."
  },
  {
   "ficha": "swiss-manager-configuracion",
   "texto": "Tu programa calcula las incomparecencias con el «jugador virtual» de 2012. ¿Qué haces?",
   "opciones": [
    "Nada, es la regla vigente",
    "Cuentas las incomparecencias como tablas",
    "Quitas el Buchholz de las bases",
    "Actualizas el programa o configuras los desempates según el art. 16 del C.07 (2026)"
   ],
   "correcta": 3,
   "explicacion": "El jugador virtual rigió hasta el 31-ago-2023. Hoy se aplica el art. 16 del C.07 (2026)."
  },
  {
   "ficha": "swiss-manager-configuracion",
   "texto": "¿Qué recomienda la FIDE para los grandes torneos suizos?",
   "opciones": [
    "Emparejar a mano",
    "Usar cualquier hoja de cálculo",
    "Usar programas avalados por la FIDE",
    "Usar el programa del organizador"
   ],
   "correcta": 2,
   "explicacion": "La FIDE recomienda programas avalados por ella; la lista vigente está en el Handbook (capítulo C.02.04)."
  },
  {
   "ficha": "swiss-manager-configuracion",
   "texto": "¿Cuál es una buena forma de verificar que el programa desempata bien?",
   "opciones": [
    "Confiar en el programa",
    "Calcular a mano un caso con rondas no jugadas y compararlo",
    "Preguntar a los jugadores",
    "Cambiar de desempate si hay dudas"
   ],
   "correcta": 1,
   "explicacion": "Las rondas no jugadas son donde más difieren las versiones; comprobar un caso a mano detecta una configuración errónea."
  },
  {
   "ficha": "buchholz-cortes-vur",
   "texto": "Un jugador termina con 5 y ganó por incomparecencia contra un rival que terminó con 2½. ¿Cuánto aporta esa ronda a su Buchholz?",
   "opciones": [
    "5",
    "2½",
    "3",
    "3¾"
   ],
   "correcta": 1,
   "explicacion": "Art. 16.4.1: rival ficticio con la puntuación del jugador (5), sin pasar de la puntuación ajustada del rival programado (2½): mín(5; 2½) = 2½. El 3 era el resultado del jugador virtual de 2012."
  },
  {
   "ficha": "buchholz-cortes-vur",
   "texto": "Un rival tuyo ganó una partida por incomparecencia. Al calcular tu Buchholz, ¿con cuántos puntos cuenta ese rival?",
   "opciones": [
    "Con su puntuación real, incluido ese punto",
    "Con medio punto menos (la incomparecencia cuenta como tablas)",
    "Con un punto menos",
    "No se cuenta ese rival"
   ],
   "correcta": 0,
   "explicacion": "Art. 16.3.1: las victorias por incomparecencia (categoría 2) se evalúan con el resultado asignado. Contarlas como tablas era la regla de 2012 (sección 15.3)."
  },
  {
   "ficha": "buchholz-cortes-vur",
   "texto": "¿Cuál de estas rondas es una VUR?",
   "opciones": [
    "Una victoria por incomparecencia",
    "El descanso asignado por el emparejamiento",
    "Una partida aplazada",
    "Una pérdida por incomparecencia"
   ],
   "correcta": 3,
   "explicacion": "Art. 16.1: VUR es un bye solicitado o una pérdida por incomparecencia."
  },
  {
   "ficha": "buchholz-cortes-vur",
   "texto": "BH-C1. Las aportaciones de un jugador son 2, 5, 3, 3, 4½, 3½ y una pérdida por incomparecencia que aporta 3½. ¿Qué valor se corta?",
   "opciones": [
    "El 2, porque es el menor",
    "El 5, el mayor",
    "El 3½ de la incomparecencia",
    "Ninguno"
   ],
   "correcta": 2,
   "explicacion": "Art. 16.5.1: con una VUR se corta su aportación (3½), porque no es menor que el valor menos significativo (2)."
  },
  {
   "ficha": "buchholz-cortes-vur",
   "texto": "BH-C1. Un jugador perdió por incomparecencia y esa ronda aporta 1½; su menor aportación de partidas jugadas es 2. ¿Qué se corta?",
   "opciones": [
    "El 2",
    "El 1½ de la incomparecencia",
    "Los dos",
    "Nada"
   ],
   "correcta": 1,
   "explicacion": "El 1½ es el valor menos significativo y además viene de una VUR: se corta ese. El art. 16.5.1 solo cambia el corte cuando la VUR aporta igual o más que el valor menos significativo."
  },
  {
   "ficha": "buchholz-cortes-vur",
   "texto": "En el ejercicio, Carvajal tiene BH 24½ e Ibarra 24; con BH-C1, 21 y 22. ¿Por qué cambia el orden?",
   "opciones": [
    "Porque a Carvajal se le corta la ronda que perdió por incomparecencia (3½) y a Ibarra solo su menor valor (2)",
    "Porque Ibarra tiene más victorias",
    "Porque el BH-C1 no cuenta las incomparecencias de los rivales",
    "Porque se usa el rating"
   ],
   "correcta": 0,
   "explicacion": "Art. 16.5.1: la VUR de Carvajal aporta 3½, que no es menor que su valor menos significativo (2), así que se corta el 3½."
  },
  {
   "ficha": "buchholz-cortes-vur",
   "texto": "¿Quién fija la lista ordenada de desempates de un torneo?",
   "opciones": [
    "El árbitro principal, después de la última ronda",
    "El programa de emparejamientos",
    "Los jugadores, por votación",
    "El organizador principal, de antemano"
   ],
   "correcta": 3,
   "explicacion": "Art. 4.1 del C.07: la elige el organizador principal (Chief Organiser) y debe conocerse antes del torneo; el árbitro principal puede completarla si está incompleta."
  },
  {
   "ficha": "eliminacion-directa",
   "texto": "Torneo de eliminación directa con 20 jugadores. ¿Cuántos matches se juegan en la primera ronda?",
   "opciones": [
    "10",
    "8",
    "4",
    "12"
   ],
   "correcta": 2,
   "explicacion": "Cuadro de 32: 12 jugadores pasan directamente y 8 juegan 4 matches para que queden 16."
  },
  {
   "ficha": "eliminacion-directa",
   "texto": "Con 13 jugadores en un cuadro de 16, ¿quiénes pasan directamente a cuartos?",
   "opciones": [
    "Los números 14, 15 y 16",
    "Los números 1, 2 y 3",
    "Tres jugadores sorteados",
    "Los tres de menor rating"
   ],
   "correcta": 1,
   "explicacion": "Los puestos 14, 15 y 16 quedan vacíos y sus rivales (1, 2 y 3) pasan directamente."
  },
  {
   "ficha": "eliminacion-directa",
   "texto": "Dos jugadores con el mismo rating: una WIM y un FM. ¿Quién va primero en la siembra?",
   "opciones": [
    "El FM",
    "La WIM",
    "El de apellido anterior en el alfabeto",
    "Se sortea"
   ],
   "correcta": 0,
   "explicacion": "C.04.2 (2026), art. 2.2.2: GM, IM, WGM, FM, WIM, CM, WFM, WCM. (La edición original ponía WIM antes que FM)."
  },
  {
   "ficha": "eliminacion-directa",
   "texto": "Cuadro de 16 armado con el método de la revista. ¿Contra quién juega el n.º 1 en la primera ronda?",
   "opciones": [
    "El 2",
    "El 9",
    "El 8",
    "El 16"
   ],
   "correcta": 3,
   "explicacion": "En «U» dentro del grupo 1 (1, 4, 5, 8, 9, 12, 13, 16): el primero contra el último, el 16."
  },
  {
   "ficha": "eliminacion-directa",
   "texto": "Con ese mismo cuadro de 16, ¿en qué ronda pueden encontrarse el 1 y el 2?",
   "opciones": [
    "En cuartos",
    "En semifinales",
    "En la final",
    "En octavos"
   ],
   "correcta": 2,
   "explicacion": "El 1 y el 2 están en grupos distintos y solo se cruzan los campeones de grupo: en la final."
  },
  {
   "ficha": "eliminacion-directa",
   "texto": "Las bases dicen que los empates en los matches se resuelven con «Armagedón», sin más detalle. ¿Qué falta?",
   "opciones": [
    "Nada: las Leyes del Ajedrez lo regulan",
    "El ritmo de cada jugador, quién gana con tablas y cómo se eligen los colores",
    "Solo el ritmo",
    "La aprobación de la FIDE"
   ],
   "correcta": 1,
   "explicacion": "El Armagedón no está regulado en las Leyes 2023 ni en el C.07; el art. 3.1 del C.07 pide que las bases fijen colores, ritmos y formato del play-off."
  },
  {
   "ficha": "eliminacion-directa",
   "texto": "¿Cuántos grupos se forman con 32 jugadores?",
   "opciones": [
    "4",
    "2",
    "8",
    "16"
   ],
   "correcta": 0,
   "explicacion": "Hasta 16 jugadores, 2 grupos; hasta 32, 4; hasta 64, 8."
  },
  {
   "ficha": "estres-y-arbitro",
   "texto": "Durante la partida, un jugador nervioso te pregunta si su posición es buena. ¿Qué haces?",
   "opciones": [
    "Le das tu opinión para tranquilizarlo",
    "Detienes el reloj y analizan juntos",
    "Le sugieres ofrecer tablas",
    "No opinas sobre la partida: eso sería un consejo"
   ],
   "correcta": 3,
   "explicacion": "Art. 11.3.1: los consejos están prohibidos durante la partida. Puedes ayudarlo a calmarse, pero nunca hablar de su posición."
  },
  {
   "ficha": "estres-y-arbitro",
   "texto": "Un jugador que tiene el turno quiere salir a tomar aire fuera del área de juego. ¿Puede hacerlo?",
   "opciones": [
    "Sí, cuando quiera",
    "No, nunca",
    "Solo con permiso del árbitro, y su reloj sigue corriendo",
    "Solo si detiene el reloj"
   ],
   "correcta": 2,
   "explicacion": "Art. 11.2.3.2: el jugador con el turno solo puede salir del área de juego con permiso del árbitro. El reloj no se detiene."
  },
  {
   "ficha": "estres-y-arbitro",
   "texto": "Al calmar a un jugador junto a su mesa, ¿qué debes cuidar sobre todo?",
   "opciones": [
    "Que el público escuche",
    "Que el rival no sea molestado",
    "Que el jugador firme la planilla",
    "Que el reloj se detenga"
   ],
   "correcta": 1,
   "explicacion": "Art. 12.2.4: el árbitro debe procurar que los jugadores no sean molestados. Mejor hablar lejos de la mesa."
  },
  {
   "ficha": "estres-y-arbitro",
   "texto": "Un jugador parece sufrir una crisis de salud durante la partida. ¿Qué artículo te respalda para tomar medidas especiales?",
   "opciones": [
    "Art. 12.2.6",
    "Art. 6.9",
    "Art. 9.6",
    "Art. 11.4"
   ],
   "correcta": 0,
   "explicacion": "Art. 12.2.6: el árbitro toma medidas especiales en interés de los jugadores con discapacidad y de quienes necesitan atención médica."
  },
  {
   "ficha": "estres-y-arbitro",
   "texto": "Según Paula Man Reich, ¿qué es lo que realmente perturba al ajedrecista?",
   "opciones": [
    "Sentir nervios",
    "Jugar con negras",
    "El ruido de la sala",
    "El descontrol emocional al no poder detener esos pensamientos"
   ],
   "correcta": 3,
   "explicacion": "Sentir nervios no es malo si se controlan; lo que perturba es el descontrol emocional."
  },
  {
   "ficha": "zonas-sala-juego",
   "texto": "Según las Leyes, ¿qué es la «zona de juego»?",
   "opciones": [
    "Todo el edificio donde se juega",
    "El lugar donde se juegan las partidas",
    "La sala de juego más los servicios sanitarios",
    "El área que delimita el organizador para el público"
   ],
   "correcta": 1,
   "explicacion": "Art. 11.2.2: la zona de juego es el lugar donde se juegan las partidas. El recinto de juego (11.2.1) es más amplio: incluye servicios, descanso, refrigerio, etc."
  },
  {
   "ficha": "zonas-sala-juego",
   "texto": "Un jugador terminó su partida y se queda de pie junto a otra mesa viendo jugar. ¿Qué es, según las Leyes?",
   "opciones": [
    "Sigue siendo jugador hasta que termine la ronda",
    "Un espectador",
    "Un analista autorizado",
    "Un auxiliar del árbitro"
   ],
   "correcta": 1,
   "explicacion": "Art. 11.4: los jugadores que terminaron su partida se consideran espectadores; por eso deben salir de la zona de juego."
  },
  {
   "ficha": "zonas-sala-juego",
   "texto": "El padre de un jugador quiere entrar a la zona de juego para darle agua a su hijo. ¿Quién puede autorizarlo?",
   "opciones": [
    "Nadie: está prohibido siempre",
    "El organizador, sin consultar",
    "Solo el árbitro",
    "El propio jugador"
   ],
   "correcta": 2,
   "explicacion": "Art. 11.2.3: solo con permiso del árbitro puede entrar a la zona de juego una persona que no sea jugador ni árbitro."
  },
  {
   "ficha": "zonas-sala-juego",
   "texto": "Un torneo se juega en un local muy pequeño. ¿Es obligatorio tener un área interna para espectadores?",
   "opciones": [
    "Sí, siempre",
    "Sí, si hay menores de edad",
    "No: los espectadores pueden esperar fuera",
    "Solo si el torneo tiene rating FIDE"
   ],
   "correcta": 2,
   "explicacion": "No existe esa obligación: si el local es pequeño, se limita a los jugadores y los espectadores quedan fuera. El árbitro debe proteger el buen ambiente de juego (art. 12.2.3 y 12.2.4)."
  },
  {
   "ficha": "zonas-sala-juego",
   "texto": "Según las pautas FIDE para torneos de alto nivel (C.01), ¿qué tamaño mínimo debe tener la zona de juego para n jugadores?",
   "opciones": [
    "2n m²",
    "4,5n m²",
    "5n m²",
    "10n m²"
   ],
   "correcta": 2,
   "explicacion": "C.01, 1.2: no menos de 5n metros cuadrados. Las cifras de 4,5 m² y 2 m² por jugador eran de la normativa de 2012."
  },
  {
   "ficha": "zonas-sala-juego",
   "texto": "¿Qué iluminación mínima piden las pautas C.01 para la zona de juego de un torneo de alto nivel?",
   "opciones": [
    "250 lux",
    "350 lux",
    "450 lux",
    "800 lux"
   ],
   "correcta": 2,
   "explicacion": "C.01, 1.5: al menos 450 lux, sin sombras ni reflejos sobre las piezas."
  },
  {
   "ficha": "zonas-sala-juego",
   "texto": "Partida a 90 minutos sin incremento. A un jugador le quedan 15 minutos y se niega a anotar. ¿Puede negarse?",
   "opciones": [
    "Sí: con menos de 30 minutos no se anota",
    "Sí, si su rival tiene mucho más tiempo",
    "No: solo deja de anotar con menos de 5 minutos",
    "Sí, si avisa al árbitro"
   ],
   "correcta": 2,
   "explicacion": "Art. 8.4: sin incremento de 30 segundos o más, el jugador deja de estar obligado a anotar solo cuando le quedan menos de cinco minutos en el periodo."
  },
  {
   "ficha": "zonas-sala-juego",
   "texto": "Un jugador se niega una y otra vez a cumplir una instrucción basada en las Leyes. ¿Qué sanción prevén las Leyes para la negativa persistente?",
   "opciones": [
    "Solo una advertencia",
    "Una multa automática",
    "La pérdida de la partida",
    "La expulsión del torneo, siempre"
   ],
   "correcta": 2,
   "explicacion": "Art. 11.7: la negativa persistente a cumplir las Leyes se sanciona con la pérdida de la partida; antes se pueden aplicar sanciones menores del art. 12.9."
  },
  {
   "ficha": "cuadro-eliminatorio",
   "texto": "En un cuadro de 32, ¿contra quién juega el sembrado número 1 en la primera ronda?",
   "opciones": [
    "Contra el 2",
    "Contra el 16",
    "Contra el 17",
    "Contra el 32"
   ],
   "correcta": 3,
   "explicacion": "Cada cruce de la primera ronda suma n + 1 = 33: el 1 juega contra el 32."
  },
  {
   "ficha": "cuadro-eliminatorio",
   "texto": "En un cuadro de 32, si todos los favoritos ganan, ¿contra quién juega el 1 en cuartos de final?",
   "opciones": [
    "Contra el 4",
    "Contra el 8",
    "Contra el 9",
    "Contra el 16"
   ],
   "correcta": 1,
   "explicacion": "En el grupo del 1 (1, 8, 9, 16, 17, 24, 25, 32), el ganador de 1-32/16-17 enfrenta al de 8-25/9-24: si ganan los favoritos, 1 contra 8."
  },
  {
   "ficha": "cuadro-eliminatorio",
   "texto": "¿Con qué grupo se cruza en semifinales el campeón del grupo 1?",
   "opciones": [
    "Grupo 2",
    "Grupo 3",
    "Grupo 4",
    "Se sortea"
   ],
   "correcta": 2,
   "explicacion": "Semifinales: grupo 1 contra grupo 4 y grupo 2 contra grupo 3. Así el 1 y el 2 solo pueden encontrarse en la final."
  },
  {
   "ficha": "cuadro-eliminatorio",
   "texto": "Hay 23 inscritos. ¿Qué cuadro se usa y cuántos jugadores pasan directo a la segunda ronda?",
   "opciones": [
    "Cuadro de 16; se eliminan 7",
    "Cuadro de 32; pasan directo 9",
    "Cuadro de 24; pasa directo 1",
    "Cuadro de 32; pasan directo 7"
   ],
   "correcta": 1,
   "explicacion": "Se usa la potencia de 2 siguiente, 32. Los lugares 24 a 32 quedan vacíos (nueve), y sus rivales (1 a 9) pasan directo."
  },
  {
   "ficha": "cuadro-eliminatorio",
   "texto": "Con 23 jugadores en un cuadro de 32, ¿contra quién juega el 10 en la primera ronda?",
   "opciones": [
    "Contra el 23",
    "Contra el 22",
    "Queda exento",
    "Contra el 24"
   ],
   "correcta": 0,
   "explicacion": "10 + 23 = 33: el 10 juega contra el 23. El 24 sería un lugar vacío."
  },
  {
   "ficha": "cuadro-eliminatorio",
   "texto": "Dos jugadores tienen el mismo rating y el mismo título. ¿Cómo se ordenan para la siembra, si no se anunció otro criterio?",
   "opciones": [
    "Por edad",
    "Por sorteo",
    "Alfabéticamente",
    "Por federación"
   ],
   "correcta": 2,
   "explicacion": "C.04.2, art. 2.2: fuerza (rating), título y, por último, orden alfabético, salvo que se anuncie otro criterio."
  },
  {
   "ficha": "cuadro-eliminatorio",
   "texto": "Un encuentro de eliminación directa termina empatado. ¿Dónde debe estar definido cómo se desempata?",
   "opciones": [
    "Lo decide el árbitro en el momento",
    "En las Leyes del Ajedrez",
    "En las bases del torneo",
    "Lo acuerdan los jugadores"
   ],
   "correcta": 2,
   "explicacion": "C.07 (2026), art. 3.1: las bases deben fijar formato, colores, ritmos y horario de las partidas de desempate."
  },
  {
   "ficha": "arranz-color-tablas",
   "texto": "En el sistema Arranz, ¿cuánto vale una partida tablas para quien lleva las negras?",
   "opciones": [
    "0,4",
    "0,5",
    "0,6",
    "1"
   ],
   "correcta": 2,
   "explicacion": "Arranz da 0,4 a las blancas y 0,6 a las negras en las tablas; victorias y derrotas valen 1 y 0."
  },
  {
   "ficha": "arranz-color-tablas",
   "texto": "Un jugador tiene 2 victorias, 1 tabla con blancas y 2 con negras. ¿Cuál es su puntuación Arranz?",
   "opciones": [
    "3,4",
    "3,5",
    "3,6",
    "3,8"
   ],
   "correcta": 2,
   "explicacion": "2 + 1 × 0,4 + 2 × 0,6 = 3,6. Equivale a 3½ + 0,1 × (2 − 1)."
  },
  {
   "ficha": "arranz-color-tablas",
   "texto": "¿Figura el sistema Arranz en el Reglamento de Desempates FIDE C.07 aplicable desde el 1-mar-2026?",
   "opciones": [
    "Sí, como desempate de tipo B",
    "Sí, solo para round robin",
    "No",
    "Sí, como modificador de corte"
   ],
   "correcta": 2,
   "explicacion": "El C.07 (2026) no incluye el sistema Arranz ni ninguna puntuación de tablas según el color."
  },
  {
   "ficha": "arranz-color-tablas",
   "texto": "¿Qué desempates oficiales del C.07 premian el juego con negras?",
   "opciones": [
    "BH y SB",
    "BPG y BWG",
    "KS y DE",
    "ARO y TPR"
   ],
   "correcta": 1,
   "explicacion": "BPG (partidas jugadas con negras, art. 7.3) y BWG (partidas ganadas con negras, art. 7.4)."
  },
  {
   "ficha": "arranz-color-tablas",
   "texto": "Si se usa Arranz como puntuación para toda la clasificación, ¿qué puede pasar?",
   "opciones": [
    "Nada distinto a un desempate",
    "Que un jugador con medio punto menos quede por delante",
    "Que cambie el rating FIDE de las partidas",
    "Que haya más tablas pactadas"
   ],
   "correcta": 1,
   "explicacion": "La diferencia es 0,1 por cada tabla según el color: con varias tablas puede superar medio punto. Por ejemplo, 4 puntos con 4 tablas con negras (4,4) supera a 4½ con 5 tablas con blancas (4,0)."
  },
  {
   "ficha": "arranz-color-tablas",
   "texto": "Según el C.07, ¿cómo se aplican los desempates?",
   "opciones": [
    "Se suman todos",
    "Se usa el que más favorezca al líder",
    "En orden, solo al subgrupo que siga empatado",
    "Se elige uno por sorteo"
   ],
   "correcta": 2,
   "explicacion": "Art. 4.2: se empieza por el primero de la lista y se pasa al siguiente solo para los que sigan empatados."
  },
  {
   "ficha": "arranz-color-tablas",
   "texto": "Para desalentar las tablas sin lucha, ¿qué permiten las Leyes del Ajedrez?",
   "opciones": [
    "Dar 0,4 a las blancas en las tablas",
    "Que las bases prohíban ofrecer o aceptar tablas antes de cierta jugada, o del todo, sin consentimiento del árbitro",
    "Que el árbitro anule las tablas que considere rápidas",
    "Nada: las tablas siempre son libres"
   ],
   "correcta": 1,
   "explicacion": "Art. 9.1.1 (Leyes 2023): las bases pueden fijar esa restricción."
  },
  {
   "ficha": "swiss-manager-inicio",
   "texto": "¿De dónde conviene descargar Swiss Manager?",
   "opciones": [
    "De cualquier sitio de descargas",
    "Del sitio oficial, swiss-manager.at",
    "De un correo de otro árbitro",
    "De chess-results.com, sin más"
   ],
   "correcta": 1,
   "explicacion": "El sitio oficial del programa es swiss-manager.at; descargar de otro origen expone a versiones viejas o archivos alterados."
  },
  {
   "ficha": "swiss-manager-inicio",
   "texto": "Una guía de 2012 dice que un menú se llama de cierta forma, pero en tu programa no aparece. ¿Qué es lo más probable?",
   "opciones": [
    "El programa está dañado",
    "La versión del programa cambió los menús",
    "La guía es falsa",
    "Falta la licencia"
   ],
   "correcta": 1,
   "explicacion": "Los menús, ventanas y atajos dependen de la versión y del idioma; la lógica suele mantenerse."
  },
  {
   "ficha": "swiss-manager-inicio",
   "texto": "Al crear el torneo, la lista de desempates del programa no coincide con la de las bases. ¿Qué haces?",
   "opciones": [
    "Dejas la del programa",
    "Corriges el programa para que coincida con lo publicado",
    "Cambias las bases después de la ronda 1",
    "Eliges la que favorezca al líder"
   ],
   "correcta": 1,
   "explicacion": "C.07, art. 4.1: la lista ordenada de desempates se publica antes del inicio; el programa debe aplicar esa misma lista."
  },
  {
   "ficha": "swiss-manager-inicio",
   "texto": "¿Qué significa «BH-C1» en el C.07?",
   "opciones": [
    "Buchholz de la ronda 1",
    "Buchholz quitando el puntaje más bajo de los rivales",
    "Buchholz de los primeros clasificados",
    "Buchholz con un rival virtual"
   ],
   "correcta": 1,
   "explicacion": "Art. 14.1: Cut-1 elimina el valor menos significativo; en el Buchholz, el puntaje del rival más bajo."
  },
  {
   "ficha": "swiss-manager-inicio",
   "texto": "¿Se puede usar un método acelerado de emparejamiento en un suizo sin haberlo anunciado?",
   "opciones": [
    "Sí, si lo decide el árbitro",
    "Sí, desde la ronda 3",
    "No: debe anunciarse antes",
    "Sí, si hay más de 100 jugadores"
   ],
   "correcta": 2,
   "explicacion": "C.04.2, art. 1.1: los métodos acelerados solo se aplican si el organizador los anunció de antemano."
  },
  {
   "ficha": "arbitro-angel-demonio",
   "texto": "Según Paula Man Reich, ¿cuál es el mejor trabajo de un árbitro?",
   "opciones": [
    "Imponer su autoridad en cada mesa",
    "Cumplir bien su papel y pasar lo más desapercibido posible",
    "Sancionar lo más posible",
    "Hacerse conocido entre los jugadores"
   ],
   "correcta": 1,
   "explicacion": "El artículo sostiene que el árbitro que hace bien su trabajo casi no se nota, y así se gana respeto e invitaciones."
  },
  {
   "ficha": "arbitro-angel-demonio",
   "texto": "De las causas de un mal arbitraje que señala el artículo, ¿cuál es la más grave?",
   "opciones": [
    "La falta de conocimiento",
    "La falta de experiencia",
    "El abuso de poder",
    "El cansancio"
   ],
   "correcta": 2,
   "explicacion": "Las dos primeras se corrigen con estudio y práctica; el abuso de poder es una conducta intencional."
  },
  {
   "ficha": "arbitro-angel-demonio",
   "texto": "¿Cuál de estos deberes del árbitro figura en el art. 12.2 de las Leyes 2023?",
   "opciones": [
    "Promover a los jugadores de su federación",
    "Garantizar el juego limpio",
    "Decidir los premios",
    "Elegir el sistema de emparejamiento"
   ],
   "correcta": 1,
   "explicacion": "Art. 12.2.1: garantizar el juego limpio. También actuar en el mejor interés de la competición, mantener un buen ambiente y evitar que los jugadores sean molestados."
  },
  {
   "ficha": "arbitro-angel-demonio",
   "texto": "Un árbitro se equivoca una vez en una decisión. Según el artículo, ¿qué es lo preocupante?",
   "opciones": [
    "Cualquier error, por pequeño que sea",
    "Que el error se vuelva costumbre",
    "Que el jugador apele",
    "Nada, los errores no importan"
   ],
   "correcta": 1,
   "explicacion": "Equivocarse alguna vez es humano; convertirlo en costumbre habla mal de la capacidad o de las intenciones del árbitro."
  },
  {
   "ficha": "arbitro-angel-demonio",
   "texto": "Según el art. 12.2.6, ¿a quiénes debe atender el árbitro con medidas especiales?",
   "opciones": [
    "A los jugadores con título",
    "A los jugadores con discapacidad y a quienes necesiten atención médica",
    "A los patrocinadores",
    "A los jugadores locales"
   ],
   "correcta": 1,
   "explicacion": "Art. 12.2.6: el árbitro toma medidas especiales en interés de los jugadores con discapacidad y de quienes necesitan atención médica."
  },
  {
   "ficha": "convocatoria-bases",
   "texto": "Las bases de un torneo no dicen nada sobre el tiempo de espera. ¿Cuál es?",
   "opciones": [
    "15 minutos",
    "30 minutos",
    "Cero",
    "Lo decide el árbitro en cada ronda"
   ],
   "correcta": 2,
   "explicacion": "Art. 6.7.1: las bases deben fijarlo de antemano; si no lo hacen, es cero."
  },
  {
   "ficha": "convocatoria-bases",
   "texto": "¿Quién publica la lista ordenada de desempates y cuándo?",
   "opciones": [
    "El programa de emparejamientos, al final",
    "El árbitro principal, antes del inicio del torneo",
    "Los jugadores, por votación en la reunión técnica",
    "La federación, después de la última ronda"
   ],
   "correcta": 1,
   "explicacion": "C.07 (2026), art. 4.1.1: el árbitro principal completa la lista si hace falta y la publica antes del inicio."
  },
  {
   "ficha": "convocatoria-bases",
   "texto": "En la terminología del C.07, ¿cómo se llama el antiguo «Buchholz I» (quitando el peor rival)?",
   "opciones": [
    "BH-M1",
    "BH-C1",
    "BH-C2",
    "FB"
   ],
   "correcta": 1,
   "explicacion": "Art. 14.1: Cut-1 quita el valor menos significativo. BH-C1 es el antiguo Buchholz I; BH-C2 el Buchholz II."
  },
  {
   "ficha": "convocatoria-bases",
   "texto": "Un organizador quiere usar Buchholz como primer desempate en un round robin. ¿Qué le dices?",
   "opciones": [
    "Que es lo recomendado",
    "Que el C.07 dice que esos desempates no se usan en round robin",
    "Que solo sirve con más de 10 jugadores",
    "Que debe usar Buchholz corte 2"
   ],
   "correcta": 1,
   "explicacion": "C.07, art. 8: los desempates tipo Buchholz no deben usarse en round robin; allí se usan, por ejemplo, Sonneborn-Berger o Koya."
  },
  {
   "ficha": "convocatoria-bases",
   "texto": "Torneo abierto sin jugadores de más de 2700 ni jugadoras de más de 2500. ¿Con qué anticipación mínima debe registrarse para rating FIDE?",
   "opciones": [
    "1 día",
    "3 días",
    "15 días",
    "30 días"
   ],
   "correcta": 1,
   "explicacion": "Reglamento de Rating (2024), art. 0.2.2: 3 días antes del inicio; 30 días si hay un jugador de más de 2700 o una jugadora de más de 2500 (0.2.1)."
  },
  {
   "ficha": "convocatoria-bases",
   "texto": "Las bases de 2012 decían «emparejamientos inapelables». ¿Qué dice hoy la norma FIDE sobre cambiar un emparejamiento publicado?",
   "opciones": [
    "Nunca se puede cambiar",
    "Se cambia si un jugador lo pide",
    "No se cambia salvo casos tasados y si el árbitro principal lo juzga en el mejor interés del torneo",
    "Se cambia por votación del comité de apelación"
   ],
   "correcta": 2,
   "explicacion": "C.04.2 (2026), art. 4.4: por ejemplo, si se emparejó por error a dos jugadores que ya se habían enfrentado."
  },
  {
   "ficha": "convocatoria-bases",
   "texto": "¿Pueden las bases permitir que los jugadores guarden el teléfono en su bolso?",
   "opciones": [
    "No, nunca",
    "Sí, completamente apagado y donde indique el árbitro",
    "Sí, en silencio",
    "Solo en rápidas"
   ],
   "correcta": 1,
   "explicacion": "Art. 11.3.2.1: las bases pueden permitirlo si está completamente apagado; el bolso se coloca como acuerde el árbitro y nadie lo usa sin permiso."
  },
  {
   "ficha": "convocatoria-bases",
   "texto": "¿Qué debe decir la convocatoria sobre la validez para rating FIDE?",
   "opciones": [
    "Nada: lo decide la federación después",
    "Debe decir claramente que el torneo será evaluado",
    "Solo el ritmo de juego",
    "Solo el nombre del árbitro"
   ],
   "correcta": 1,
   "explicacion": "Reglamento de Rating (2024), art. 9.2: las bases de un torneo evaluado deben decirlo claramente."
  },
  {
   "ficha": "leyes-2013-a-2023",
   "texto": "¿Rigió alguna vez el texto de las Leyes de Estambul que la revista anunciaba «en vigor desde el 1-jul-2013»?",
   "opciones": [
    "Sí, de 2013 a 2017",
    "Sí, solo seis meses",
    "No: se aplazó y desde el 1-jul-2014 rigió la versión de Tallin",
    "Sigue vigente"
   ],
   "correcta": 2,
   "explicacion": "El Handbook aplica las Leyes de Dresde a las competiciones iniciadas antes del 1-jul-2014 y la versión de Tallin desde esa fecha."
  },
  {
   "ficha": "leyes-2013-a-2023",
   "texto": "Partida estándar: un jugador completa su segunda jugada ilegal. ¿Qué pasa?",
   "opciones": [
    "2 minutos más al rival",
    "4 minutos más al rival",
    "Pierde, salvo que el rival no pueda dar mate (tablas)",
    "Advertencia"
   ],
   "correcta": 2,
   "explicacion": "Art. 7.5.5: la segunda jugada ilegal completada pierde la partida. En el texto de 2013 se perdía a la tercera."
  },
  {
   "ficha": "leyes-2013-a-2023",
   "texto": "Un jugador pulsa el reloj sin haber hecho jugada. ¿Cómo se trata?",
   "opciones": [
    "No pasa nada",
    "Como jugada ilegal",
    "Se le resta un minuto",
    "Advertencia verbal y nada más"
   ],
   "correcta": 1,
   "explicacion": "Art. 7.5.3: se considera y sanciona como jugada ilegal."
  },
  {
   "ficha": "leyes-2013-a-2023",
   "texto": "La misma posición aparece por quinta vez y nadie reclama. ¿Qué pasa?",
   "opciones": [
    "Nada",
    "Tablas automáticas",
    "El árbitro espera una reclamación",
    "Pierde el último que repitió"
   ],
   "correcta": 1,
   "explicacion": "Art. 9.6.1: con cinco apariciones la partida es tablas automáticamente. En el texto de 2013 no existían las tablas automáticas."
  },
  {
   "ficha": "leyes-2013-a-2023",
   "texto": "En las Leyes vigentes, ¿qué número tiene el artículo «Función del árbitro»?",
   "opciones": [
    "10",
    "11",
    "12",
    "13"
   ],
   "correcta": 2,
   "explicacion": "Desde 2014: 10 puntos, 11 conducta de los jugadores, 12 función del árbitro. En 2013 era el 13."
  },
  {
   "ficha": "leyes-2013-a-2023",
   "texto": "Un jugador abandona en una posición en la que su rival solo tiene el rey. ¿Resultado según las Leyes 2023?",
   "opciones": [
    "Gana el rival",
    "Tablas",
    "Se repite la partida",
    "Pierden ambos"
   ],
   "correcta": 1,
   "explicacion": "Art. 5.1.2: quien abandona pierde, salvo que el rival no pueda dar mate con ninguna serie de jugadas legales; entonces es tablas."
  },
  {
   "ficha": "leyes-2013-a-2023",
   "texto": "Se descubre que un jugador lleva en el bolsillo un teléfono apagado durante la partida, y las bases no dicen nada. ¿Qué pasa?",
   "opciones": [
    "Nada, porque está apagado",
    "Advertencia",
    "Pierde la partida",
    "Se le quitan 10 minutos"
   ],
   "correcta": 2,
   "explicacion": "Art. 11.3.2.2: si es evidente que lleva un dispositivo encima en el recinto, pierde. Solo se puede guardar apagado en el bolso si las bases lo permiten (11.3.2.1)."
  },
  {
   "ficha": "leyes-2013-a-2023",
   "texto": "¿Dónde están hoy las reglas del Ajedrez960?",
   "opciones": [
    "Apéndice F",
    "Apéndice D",
    "Pautas II",
    "No están en las Leyes"
   ],
   "correcta": 2,
   "explicacion": "En el texto de 2013 eran el Apéndice F; hoy son las Pautas II. El Apéndice D es para jugadores ciegos."
  },
  {
   "ficha": "leyes-2013-a-2023",
   "texto": "¿Cuál de estas sanciones del art. 12.9 no figuraba en la lista de 2013 (art. 13.9)?",
   "opciones": [
    "Advertencia",
    "Partida perdida",
    "Exclusión de una o más rondas",
    "Multa anunciada de antemano"
   ],
   "correcta": 2,
   "explicacion": "La exclusión de rondas (12.9.8) se agregó en 2017; las demás ya existían."
  },
  {
   "ficha": "rapidas-relampago-hoy",
   "texto": "Una partida a 10 minutos sin incremento, ¿es rápida o relámpago según las Leyes 2023?",
   "opciones": [
    "Rápida",
    "Relámpago",
    "Estándar",
    "Depende de las bases"
   ],
   "correcta": 1,
   "explicacion": "B.1: relámpago es 10 minutos o menos. A.1: rápida es más de 10 y menos de 60."
  },
  {
   "ficha": "rapidas-relampago-hoy",
   "texto": "Partida a 3 min + 2 s. ¿Es rápida o relámpago?",
   "opciones": [
    "Rápida: 3 + 120 = más de 10",
    "Relámpago: 3 + 60 × 2 s = 5 minutos",
    "Rápida, por tener incremento",
    "Ninguna de las dos"
   ],
   "correcta": 1,
   "explicacion": "Se cuenta tiempo + 60 × incremento: 3 min + 120 s = 5 minutos, que es 10 o menos: relámpago (B.1)."
  },
  {
   "ficha": "rapidas-relampago-hoy",
   "texto": "En una partida rápida, primera jugada ilegal completada. ¿Cuánto tiempo se da al rival?",
   "opciones": [
    "Nada",
    "1 minuto",
    "2 minutos",
    "5 minutos"
   ],
   "correcta": 1,
   "explicacion": "A.3: en rápidas las sanciones de los arts. 7 y 9 son de 1 minuto. En 2018 eran 2 minutos en rápidas y 1 en relámpago."
  },
  {
   "ficha": "rapidas-relampago-hoy",
   "texto": "Rápidas sin supervisión completa: un jugador hace una jugada ilegal, el rival ya respondió y nadie reclamó. ¿Qué pasa?",
   "opciones": [
    "El árbitro vuelve atrás y sanciona",
    "La jugada ilegal se queda y la partida sigue",
    "Pierde quien hizo la ilegal",
    "Tablas"
   ],
   "correcta": 1,
   "explicacion": "A.5.2: el árbitro o el rival deben actuar antes de que el rival haga su jugada; si no, la jugada ilegal se queda."
  },
  {
   "ficha": "rapidas-relampago-hoy",
   "texto": "¿Qué hace falta para que en rápidas rijan las reglas de competición completas?",
   "opciones": [
    "Que el torneo tenga rating FIDE",
    "Que un árbitro supervise como máximo tres partidas y cada partida sea anotada",
    "Que haya relojes electrónicos",
    "Que lo pidan los jugadores"
   ],
   "correcta": 1,
   "explicacion": "A.4: un árbitro como máximo por tres partidas y cada partida anotada por el árbitro o un asistente."
  },
  {
   "ficha": "rapidas-relampago-hoy",
   "texto": "Rápidas sin supervisión completa: el árbitro ve que cae una bandera. ¿Debe señalarlo?",
   "opciones": [
    "No, nunca",
    "Sí",
    "Solo si caen las dos",
    "Solo si el jugador lo pide"
   ],
   "correcta": 1,
   "explicacion": "A.5.5: el árbitro también señala la caída de bandera si la ve. En el texto de 2013 debía abstenerse."
  },
  {
   "ficha": "rapidas-relampago-hoy",
   "texto": "¿En qué partidas pueden aplicarse las Pautas III (finales sin incremento)?",
   "opciones": [
    "En todas",
    "Solo en relámpago",
    "En estándar y rápidas sin incremento, si se anunciaron antes",
    "Solo en estándar con incremento"
   ],
   "correcta": 2,
   "explicacion": "III.2.1 y III.2.2: solo si se anunció su uso y solo en estándar o rápidas sin incremento, nunca en relámpago."
  },
  {
   "ficha": "normas-arbitro-fide",
   "texto": "¿Cuántas normas lleva la solicitud del título de Árbitro FIDE?",
   "opciones": [
    "3",
    "4",
    "5",
    "6"
   ],
   "correcta": 1,
   "explicacion": "B.06.1, art. 2.2: 4 normas para AF (una del seminario y tres de torneos); 5 para AI."
  },
  {
   "ficha": "normas-arbitro-fide",
   "texto": "¿Cuántas normas de torneos rápidos o relámpago pueden contar en una solicitud de AF?",
   "opciones": [
    "Ninguna",
    "Una",
    "Dos",
    "Todas"
   ],
   "correcta": 1,
   "explicacion": "Art. 3.9.2: una sola por solicitud."
  },
  {
   "ficha": "normas-arbitro-fide",
   "texto": "¿Qué condiciones debe cumplir un torneo rápido o relámpago para dar norma de AF?",
   "opciones": [
    "20 jugadores y 7 rondas",
    "30 jugadores con rating y 9 rondas",
    "50 jugadores y 5 rondas",
    "100 jugadores y 9 rondas"
   ],
   "correcta": 1,
   "explicacion": "Art. 3.9.2: evaluado por la FIDE, al menos 30 jugadores con rating y 9 rondas."
  },
  {
   "ficha": "normas-arbitro-fide",
   "texto": "¿Qué nota mínima pide el examen de la Comisión de Árbitros para el título de AF?",
   "opciones": [
    "60 %",
    "70 %",
    "80 %",
    "90 %"
   ],
   "correcta": 2,
   "explicacion": "Art. 3.7: al menos 80 %."
  },
  {
   "ficha": "normas-arbitro-fide",
   "texto": "Desde el 1-mar-2026, ¿cuántas normas se pueden obtener en un mismo festival (salvo torneos de más de 30 días)?",
   "opciones": [
    "Una",
    "Dos",
    "Tres",
    "Sin límite"
   ],
   "correcta": 0,
   "explicacion": "Art. 2.10: no más de una norma del mismo festival, y las fechas de las normas no pueden solaparse; se exceptúan los torneos de más de 30 días (2.10.1)."
  },
  {
   "ficha": "normas-arbitro-fide",
   "texto": "¿Por cuánto tiempo es válido el título de Árbitro FIDE?",
   "opciones": [
    "4 años",
    "8 años",
    "Mientras se pague la licencia anual",
    "De por vida"
   ],
   "correcta": 3,
   "explicacion": "B.06.1, art. 1.3: los títulos son válidos de por vida desde que se otorgan."
  },
  {
   "ficha": "firmeza-prepotencia",
   "texto": "Según el artículo, ¿por qué un árbitro con poco control del estrés cae en la prepotencia?",
   "opciones": [
    "Porque conoce mal las reglas",
    "Porque es la salida fácil cuando faltan argumentos y sobran nervios",
    "Porque los jugadores lo provocan siempre",
    "Porque así se lo enseñan"
   ],
   "correcta": 1,
   "explicacion": "La autora explica que, a la segunda o tercera dificultad, la prepotencia aparece como salida fácil ante la presión."
  },
  {
   "ficha": "firmeza-prepotencia",
   "texto": "Un jugador pide que le expliques la norma por la que lo sancionaste. ¿Tiene derecho?",
   "opciones": [
    "No",
    "Sí, art. 11.9",
    "Solo después de la ronda",
    "Solo si es titulado"
   ],
   "correcta": 1,
   "explicacion": "Art. 11.9: el jugador tiene derecho a pedir al árbitro la explicación de puntos concretos de las Leyes."
  },
  {
   "ficha": "firmeza-prepotencia",
   "texto": "Un jugador firmó la planilla y luego quiere apelar una decisión del árbitro. ¿Puede?",
   "opciones": [
    "No, al firmar la aceptó",
    "Sí, salvo que las bases digan otra cosa",
    "Solo si el rival está de acuerdo",
    "Solo con un depósito de dinero"
   ],
   "correcta": 1,
   "explicacion": "Art. 11.10: puede apelar aunque haya firmado la planilla, salvo que las bases dispongan otra cosa."
  },
  {
   "ficha": "firmeza-prepotencia",
   "texto": "¿Cuál es la sanción más leve de la lista del art. 12.9?",
   "opciones": [
    "Advertencia",
    "Multa",
    "Quitar tiempo",
    "Exclusión de una ronda"
   ],
   "correcta": 0,
   "explicacion": "El art. 12.9 empieza por la advertencia y termina con la expulsión de la competición; la firmeza elige la sanción en proporción a la falta."
  },
  {
   "ficha": "firmeza-prepotencia",
   "texto": "Según Paula Man Reich, ¿qué falta en la formación de muchos árbitros?",
   "opciones": [
    "Teoría de las Leyes",
    "Dinámicas y simulaciones de situaciones reales",
    "Conocimiento de idiomas",
    "Práctica de ajedrez"
   ],
   "correcta": 1,
   "explicacion": "La autora señala que se enseña teoría, pero pocas veces se entrena con simulaciones de los problemas que se encontrarán en la sala."
  },
  {
   "ficha": "registro-arbitros",
   "texto": "¿En qué categoría está un Árbitro FIDE (AF)?",
   "opciones": [
    "No tiene categoría",
    "Siempre D",
    "C o D, según su experiencia",
    "B, si tiene más de cinco años"
   ],
   "correcta": 1,
   "explicacion": "B.06.3: los AF son siempre categoría D; las categorías A, B y C son solo para IA."
  },
  {
   "ficha": "registro-arbitros",
   "texto": "Un árbitro no ha pagado la cuota de registro de la FIDE y dirige un torneo valorado. ¿Qué puede pasar según el B.06.1?",
   "opciones": [
    "El torneo puede no ser valorado y sus normas de árbitro no se aceptan",
    "Solo recibe una advertencia",
    "Nada: el título es vitalicio",
    "Pierde el título automáticamente"
   ],
   "correcta": 0,
   "explicacion": "B.06.1, art. 6.2: si no se cumple el art. 6.1 (cuota de registro), el evento puede no valorarse y las normas del árbitro no se aceptan. El título no se pierde (art. 1.3)."
  },
  {
   "ficha": "registro-arbitros",
   "texto": "¿Qué requisito previo tiene la solicitud del título de AF?",
   "opciones": [
    "Tener la licencia de Árbitro Nacional al menos un año",
    "Tener 2000 de rating",
    "Haber sido IA",
    "Haber arbitrado una olimpiada"
   ],
   "correcta": 0,
   "explicacion": "B.06.1, art. 5.4.3: solo se puede solicitar el título de AF tras tener la licencia de Árbitro Nacional al menos un año."
  },
  {
   "ficha": "registro-arbitros",
   "texto": "¿Cómo vuelve a estar activo un árbitro inactivo?",
   "opciones": [
    "Arbitrando tres torneos",
    "Aprobando un curso de actualización validado por la Comisión de Árbitros",
    "Con una carta de su federación",
    "Pagando una licencia nueva"
   ],
   "correcta": 1,
   "explicacion": "B.06.3: solo tras aprobar un curso de actualización y recibir la validación de la Comisión. Ya no se reactiva pagando, como en 2013."
  },
  {
   "ficha": "registro-arbitros",
   "texto": "¿Qué puede hacer un árbitro inactivo?",
   "opciones": [
    "Nada: pierde el título",
    "Ser árbitro principal de cualquier torneo FIDE",
    "Ser designado para un campeonato continental",
    "Ser árbitro principal de un torneo valorado sin posibilidad de normas"
   ],
   "correcta": 3,
   "explicacion": "B.06.3: el inactivo no puede ser principal de torneos valorados salvo que no haya posibilidad de normas, ni ser designado para eventos oficiales FIDE o continentales."
  },
  {
   "ficha": "registro-arbitros",
   "texto": "¿Cuándo queda inactivo un árbitro según el B.06.3?",
   "opciones": [
    "Si no paga la cuota anual",
    "Si cumple 70 años",
    "Si pasan cuatro años sin aprobar un curso de actualización",
    "Si no arbitra ningún torneo en dos años"
   ],
   "correcta": 2,
   "explicacion": "La actividad depende de los cursos de actualización: cuatro años desde el título de AF o el último curso aprobado."
  },
  {
   "ficha": "notacion-fen",
   "texto": "¿Qué error tiene la fila «2A1T1R» (en letras españolas)?",
   "opciones": [
    "La T debe ser minúscula",
    "No puede haber un rey en la primera fila",
    "Ninguno",
    "Suma 7 casillas: falta una"
   ],
   "correcta": 3,
   "explicacion": "2 + 1 + 1 + 1 + 1 + 1 = 7. Cada fila debe sumar 8; lo correcto era «2A1T1R1»."
  },
  {
   "ficha": "notacion-fen",
   "texto": "En notación Forsyth, ¿por qué fila se empieza?",
   "opciones": [
    "Por la primera, de izquierda a derecha",
    "Por la fila donde esté el rey blanco",
    "Por la octava, de la columna a a la h",
    "Por la columna a, de abajo arriba"
   ],
   "correcta": 2,
   "explicacion": "Se recorre el tablero de la octava fila a la primera, y cada fila de la columna a a la h."
  },
  {
   "ficha": "notacion-fen",
   "texto": "¿Para qué sirve el quinto campo de una FEN (contador de medias jugadas)?",
   "opciones": [
    "Para el control de tiempo",
    "Para el desempate",
    "Para saber de quién es el turno",
    "Para controlar las 50 y las 75 jugadas sin captura ni movimiento de peón"
   ],
   "correcta": 3,
   "explicacion": "Cuenta las medias jugadas desde la última captura o movimiento de peón: útil para los arts. 9.3 y 9.6.2."
  },
  {
   "ficha": "notacion-fen",
   "texto": "En una FEN internacional, ¿qué significa la letra «R» mayúscula?",
   "opciones": [
    "Torre blanca",
    "Torre negra",
    "Rey negro",
    "Rey blanco"
   ],
   "correcta": 0,
   "explicacion": "En FEN se usan las iniciales inglesas: R = rook (torre). El rey es K. Mayúscula = blanca."
  },
  {
   "ficha": "notacion-fen",
   "texto": "Anotas una posición para resolver una reclamación de triple repetición. ¿Qué datos debes añadir a la ubicación de las piezas?",
   "opciones": [
    "Solo los tiempos",
    "Turno, derechos de enroque y captura al paso",
    "El rating de los jugadores",
    "Nada más"
   ],
   "correcta": 1,
   "explicacion": "Art. 9.2.3: las posiciones son iguales solo si coinciden el turno y los movimientos posibles, incluidos enroque y captura al paso."
  },
  {
   "ficha": "notacion-fen",
   "texto": "Según el art. 8.5.3, antes de reconstruir una partida, el árbitro…",
   "opciones": [
    "Pide a los jugadores que firmen",
    "Reinicia el reloj",
    "Anota la posición real y los tiempos de los relojes",
    "Detiene la partida y la declara tablas"
   ],
   "correcta": 2,
   "explicacion": "Art. 8.5.3: primero se registran la posición real y los tiempos, si los hay."
  },
  {
   "ficha": "buchholz-no-jugadas",
   "texto": "Una jugadora con 4 puntos ganó por incomparecencia ante un rival que terminó con 1 punto. ¿Qué valor aporta esa ronda a su Buchholz (C.07, 2026)?",
   "opciones": [
    "1",
    "2",
    "0",
    "4"
   ],
   "correcta": 0,
   "explicacion": "Art. 16.4.1: el muñeco tiene la puntuación propia (4), pero no puede superar la puntuación ajustada del rival programado (1)."
  },
  {
   "ficha": "buchholz-no-jugadas",
   "texto": "¿Se puede usar el Buchholz en un todos contra todos?",
   "opciones": [
    "Solo con corte",
    "No: el art. 8 lo prohíbe en todos contra todos",
    "Sí, siempre",
    "Solo si hay incomparecencias"
   ],
   "correcta": 1,
   "explicacion": "Nota del art. 8: estos desempates no deben usarse en torneos todos contra todos."
  },
  {
   "ficha": "buchholz-no-jugadas",
   "texto": "¿Quién completa y publica la lista de desempates si las bases están incompletas?",
   "opciones": [
    "Los jugadores por votación",
    "Nadie: se sortea",
    "El árbitro principal, antes del inicio del torneo",
    "El organizador después de la última ronda"
   ],
   "correcta": 2,
   "explicacion": "Art. 4.1.1: el árbitro principal completa la lista con desempates del art. 5 y la publica antes del inicio."
  },
  {
   "ficha": "buchholz-no-jugadas",
   "texto": "Un jugador pidió un bye de medio punto en la última ronda. Para el Buchholz de sus rivales, esa ronda cuenta como…",
   "opciones": [
    "No cuenta",
    "Victoria",
    "Derrota",
    "Medio punto, es decir, tablas"
   ],
   "correcta": 3,
   "explicacion": "Art. 16.3.2: los byes pedidos en la última ronda o seguidos solo de VUR (categoría 16.2.5) se cuentan como tablas."
  },
  {
   "ficha": "buchholz-no-jugadas",
   "texto": "¿Existe hoy el «jugador virtual» que sumaba medio punto por ronda?",
   "opciones": [
    "Solo en torneos juveniles",
    "No: lo reemplazó el muñeco del art. 16.4",
    "Solo si las bases lo eligen y el C.07 lo recomienda",
    "Sí, en el C.07"
   ],
   "correcta": 1,
   "explicacion": "La regla de 2009 desapareció. Hoy rige el art. 16.4 del C.07 (aplicable desde el 1-mar-2026); las bases pueden fijar otras reglas por adelantado (art. 16.6)."
  },
  {
   "ficha": "buchholz-no-jugadas",
   "texto": "Las bases de un abierto dicen solo «desempate: Buchholz». ¿Qué se aplica?",
   "opciones": [
    "Buchholz completo (art. 8.1), con las reglas del art. 16 para no jugadas",
    "Buchholz con corte del peor",
    "Mediano",
    "Lo que decida el árbitro al final"
   ],
   "correcta": 0,
   "explicacion": "Sin modificadores, es el Buchholz del art. 8.1. Los cortes (art. 14) tienen que figurar en la lista publicada antes del inicio (art. 4.1.1)."
  },
  {
   "ficha": "buchholz-no-jugadas",
   "texto": "Para calcular el Buchholz de sus rivales, ¿cómo cuenta la derrota por incomparecencia de un jugador?",
   "opciones": [
    "Como tablas",
    "Como victoria",
    "Como derrota",
    "No cuenta"
   ],
   "correcta": 2,
   "explicacion": "Art. 16.3.1: las categorías 16.2.1 a 16.2.4 (incluida la derrota por incomparecencia) se cuentan con el resultado de los puntos otorgados."
  },
  {
   "ficha": "gestion-suizo-programa",
   "texto": "Después de emparejar la ronda 5 se descubre que el rating de un jugador estaba mal y su número inicial debería cambiar. ¿Se cambia el TPN?",
   "opciones": [
    "Solo si el jugador lo pide",
    "Sí, siempre",
    "No: el TPN no se modifica después de emparejar la cuarta ronda",
    "Solo en la última ronda"
   ],
   "correcta": 2,
   "explicacion": "C.04.2, art. 2.3: no se permite modificar el TPN por esa razón después de emparejar la cuarta ronda."
  },
  {
   "ficha": "gestion-suizo-programa",
   "texto": "Un jugador ganó en la ronda 2 por incomparecencia del rival. En la ronda 5 hay número impar. ¿Puede recibir el descanso?",
   "opciones": [
    "Solo si es el último",
    "No, porque ya sumó sin jugar los puntos de una victoria",
    "Sí",
    "Solo si lo pide"
   ],
   "correcta": 1,
   "explicacion": "C.04.1, art. 4: no recibe el descanso quien ya lo tuvo o ya sumó en una ronda, sin jugar, los puntos de una victoria."
  },
  {
   "ficha": "gestion-suizo-programa",
   "texto": "¿En qué orden se fija el orden inicial de un suizo?",
   "opciones": [
    "Fuerza (normalmente el rating), título FIDE y alfabético",
    "Alfabético, título y rating",
    "Por federación",
    "Por sorteo"
   ],
   "correcta": 0,
   "explicacion": "C.04.2, art. 2.2."
  },
  {
   "ficha": "gestion-suizo-programa",
   "texto": "Hay 31 jugadores. ¿Quién decide quién recibe el descanso?",
   "opciones": [
    "El sistema de emparejamiento",
    "El organizador",
    "El árbitro, a su criterio",
    "El jugador con menor rating siempre"
   ],
   "correcta": 0,
   "explicacion": "C.04.1, art. 3: el descanso lo recibe el participante que queda sin emparejar según el sistema. Elegirlo a mano altera el emparejamiento correcto (C.04.2, art. 1.5)."
  },
  {
   "ficha": "gestion-suizo-programa",
   "texto": "Un jugador avisa antes del emparejamiento que no jugará la ronda 5. Si las bases no dicen nada más, ¿qué pasa?",
   "opciones": [
    "Queda retirado del torneo",
    "Se le empareja igual y pierde por incomparecencia",
    "Recibe medio punto",
    "No se le empareja y puntúa cero"
   ],
   "correcta": 3,
   "explicacion": "C.04.2, art. 3.3: no se empareja en esa ronda y puntúa cero."
  },
  {
   "ficha": "gestion-suizo-programa",
   "texto": "Para ayudar a un jugador a lograr una norma, el árbitro cambia un emparejamiento. ¿Qué dice el reglamento?",
   "opciones": [
    "Está permitido si el jugador es local",
    "Solo necesita la firma del organizador",
    "Está permitido en la última ronda",
    "Está prohibido y puede haber informe a la Comisión de Calificación"
   ],
   "correcta": 3,
   "explicacion": "C.04.2, art. 1.5: no se puede alterar el emparejamiento correcto en favor de nadie; si se hizo para una norma, puede haber informe y medidas disciplinarias."
  },
  {
   "ficha": "creencias-arbitro",
   "texto": "¿Qué propone hacer con las debilidades reales?",
   "opciones": [
    "Aceptarlas sin cambiar",
    "Delegar en otros árbitros",
    "Ocultarlas",
    "Mejorarlas, tanto las mentales como las técnicas"
   ],
   "correcta": 3,
   "explicacion": "El tercer punto del reto: mejorar las debilidades reales, mentales y técnicas."
  },
  {
   "ficha": "creencias-arbitro",
   "texto": "¿Cuál es el primer paso del «gran reto» que propone la autora?",
   "opciones": [
    "Olvidar el pasado",
    "Cambiar de federación",
    "Verificar qué creencias negativas son reales y cuáles crea la mente",
    "Arbitrar más torneos"
   ],
   "correcta": 2,
   "explicacion": "El reto empieza por verificar las creencias; luego cambiarlas y mejorar las debilidades reales."
  },
  {
   "ficha": "creencias-arbitro",
   "texto": "Según el artículo, ¿a qué reacciona el árbitro?",
   "opciones": [
    "Solo a los hechos",
    "A lo que cree que pasó o le va a suceder",
    "A lo que dicen los jugadores",
    "A lo que indica el reglamento"
   ],
   "correcta": 1,
   "explicacion": "La idea central del artículo: el árbitro reacciona según sus creencias, se apeguen o no a la realidad."
  },
  {
   "ficha": "creencias-arbitro",
   "texto": "Además de crecer en confianza, ¿qué recomienda no olvidar la autora?",
   "opciones": [
    "Evitar los torneos difíciles",
    "Disfrutar el trabajo y sus oportunidades",
    "Estudiar idiomas",
    "Cobrar más"
   ],
   "correcta": 1,
   "explicacion": "Cierre del artículo: progresar en confianza sin olvidar disfrutar el trabajo."
  },
  {
   "ficha": "creencias-arbitro",
   "texto": "Muchas creencias que guían al árbitro…",
   "opciones": [
    "Nunca se ponen en duda",
    "Las impone el reglamento",
    "Son siempre verdaderas",
    "Desaparecen con la experiencia"
   ],
   "correcta": 0,
   "explicacion": "El artículo señala que muchas creencias, verdaderas o falsas, nunca se cuestionan."
  },
  {
   "ficha": "miedo-arbitro",
   "texto": "¿Cuál es el primer paso para superar un miedo?",
   "opciones": [
    "Ignorarlo",
    "Detectarlo, reconocerlo y aceptarlo",
    "Evitar la situación",
    "Pedir a otro árbitro que la resuelva"
   ],
   "correcta": 1,
   "explicacion": "El artículo propone primero detectar, reconocer y aceptar el miedo, y luego enfrentarlo."
  },
  {
   "ficha": "miedo-arbitro",
   "texto": "Un espectador le señala a un jugador que su rival tiene la bandera caída. ¿Qué puede hacer el árbitro?",
   "opciones": [
    "Dar tablas",
    "Expulsarlo de la sala de juego",
    "Nada, los espectadores pueden hablar",
    "Declarar perdida la partida del jugador avisado"
   ],
   "correcta": 1,
   "explicacion": "Art. 12.7: los espectadores no pueden intervenir en una partida y el árbitro puede expulsar a los infractores."
  },
  {
   "ficha": "miedo-arbitro",
   "texto": "Un jugador persiste en anotar de forma ilegible después de una advertencia. ¿Qué base tiene el árbitro para sancionarlo?",
   "opciones": [
    "Ninguna",
    "El art. 9.2",
    "El art. 12.9, con sanciones graduales",
    "Solo puede pedir al organizador que lo expulse"
   ],
   "correcta": 2,
   "explicacion": "El art. 12.9 lista las sanciones disponibles (advertencia, tiempo, etc.); se aplican de forma gradual ante el incumplimiento del art. 8.1.1."
  },
  {
   "ficha": "miedo-arbitro",
   "texto": "Un jugador con 3 minutos y un incremento de 10 segundos deja de anotar. ¿Infringe las Leyes?",
   "opciones": [
    "Solo si el rival protesta",
    "Sí, y pierde la partida",
    "Sí, siempre hay que anotar",
    "No: con menos de cinco minutos y sin incremento de 30 s o más no está obligado"
   ],
   "correcta": 3,
   "explicacion": "Art. 8.4: con menos de cinco minutos y sin un incremento de al menos 30 segundos, el jugador queda eximido de anotar durante el resto del periodo."
  },
  {
   "ficha": "miedo-arbitro",
   "texto": "Un jugador terminó su partida y se queda junto a otra mesa comentando en voz baja con un amigo. ¿Qué es según las Leyes?",
   "opciones": [
    "Un espectador",
    "Un capitán",
    "Un auxiliar",
    "Un jugador con derecho a quedarse"
   ],
   "correcta": 0,
   "explicacion": "Art. 11.4: quien terminó su partida se considera espectador; y el art. 12.7 prohíbe a los espectadores intervenir."
  },
  {
   "ficha": "miedo-arbitro",
   "texto": "Un jugador hace garabatos en lugar de anotar. Tiene 40 minutos en el reloj. ¿Qué le pides?",
   "opciones": [
    "Nada, es su problema",
    "Que deje de anotar",
    "Que anote de forma clara y legible en notación algebraica",
    "Que anote en notación descriptiva"
   ],
   "correcta": 2,
   "explicacion": "Art. 8.1.1 y Apéndice C.1: notación algebraica, lo más clara y legible posible. La notación descriptiva no se acepta en torneos FIDE."
  },
  {
   "ficha": "miedo-arbitro",
   "texto": "Según el artículo, ¿cuál es la finalidad del miedo?",
   "opciones": [
    "Que abandones",
    "Que te concentres",
    "Que pidas ayuda",
    "Dañarte"
   ],
   "correcta": 0,
   "explicacion": "Citando el seminario de autocontrol de Domènec Benaiges: el miedo busca que abandones, para protegerte."
  },
  {
   "ficha": "suizo-principios",
   "texto": "Con 64 jugadores y sin tablas, ¿cuántos siguen imbatidos tras la ronda 2?",
   "opciones": [
    "16",
    "24",
    "32",
    "8"
   ],
   "correcta": 0,
   "explicacion": "Tras la ronda 1 quedan 32 ganadores; al enfrentarse entre sí, 16 siguen con 2 de 2."
  },
  {
   "ficha": "suizo-principios",
   "texto": "¿Puede un jugador recibir el mismo color tres veces seguidas?",
   "opciones": [
    "Solo en rondas impares",
    "Sí, siempre que lo pida",
    "No, salvo las excepciones que prevea cada sistema",
    "Sí, en la primera mitad del torneo"
   ],
   "correcta": 2,
   "explicacion": "C.04.1, art. 7, con excepciones de cada sistema (en el Holandés, para los topscorers)."
  },
  {
   "ficha": "suizo-principios",
   "texto": "En un suizo sin tablas, ¿qué porcentaje de jugadores tiene 2 puntos después de la ronda 3?",
   "opciones": [
    "25 %",
    "12,5 %",
    "50 %",
    "37,5 %"
   ],
   "correcta": 3,
   "explicacion": "C(3,2)/2³ = 3/8 = 37,5 %. La edición original decía 25 % por error."
  },
  {
   "ficha": "suizo-principios",
   "texto": "¿Qué exige el C.04.1 sobre la transparencia de las reglas de emparejamiento?",
   "opciones": [
    "Nada",
    "Que se publiquen después del torneo",
    "Que solo las entienda el programa",
    "Que quien empareja pueda explicarlas"
   ],
   "correcta": 3,
   "explicacion": "C.04.1, art. 9."
  },
  {
   "ficha": "suizo-principios",
   "texto": "¿Cuántos puntos recibe el descanso asignado por el emparejamiento según el C.04.1?",
   "opciones": [
    "Lo que decida el árbitro en cada ronda",
    "Los puntos de una victoria, salvo que las bases digan otra cosa",
    "Medio punto",
    "Cero"
   ],
   "correcta": 1,
   "explicacion": "C.04.1, art. 3: sin rival, sin color y con los puntos de una victoria salvo otra regla; todos los descansos dan lo mismo."
  },
  {
   "ficha": "suizo-principios",
   "texto": "¿Qué se anota en la columna de flotación de la tarjeta cuando un jugador recibe el descanso?",
   "opciones": [
    "Una bajada (↓)",
    "Nada",
    "Una subida (↑)",
    "Una X"
   ],
   "correcta": 0,
   "explicacion": "C.04.3, art. 1.4.3: el descanso asignado (y la victoria sin jugar) cuenta como bajada."
  },
  {
   "ficha": "holandes-2026",
   "texto": "Para emparejar, ¿en qué orden se clasifica a los jugadores (art. 1.2)?",
   "opciones": [
    "Alfabético",
    "Buchholz",
    "Puntuación y luego TPN",
    "Rating y título"
   ],
   "correcta": 2,
   "explicacion": "Art. 1.2: puntuación y TPN en orden ascendente. El TPN sale del orden inicial (C.04.2, art. 2)."
  },
  {
   "ficha": "holandes-2026",
   "texto": "Grupo de 1 punto: 6, 9 y 10. El 10 bajó en la ronda anterior; 6 y 9 no flotaron. Todas las opciones cumplen colores. ¿Qué se empareja?",
   "opciones": [
    "9-10 y baja el 6",
    "6-9 y baja el 10",
    "6-10 y baja el 9",
    "Se sortea"
   ],
   "correcta": 2,
   "explicacion": "C14: minimizar los residentes que bajan y ya bajaron en la ronda anterior. Con 6-10 baja el 9, que no había flotado."
  },
  {
   "ficha": "holandes-2026",
   "texto": "¿Qué es un topscorer en el Holandés 2026?",
   "opciones": [
    "El líder del torneo",
    "Quien tiene el rating más alto",
    "Quien ganó las dos primeras rondas",
    "Quien tiene más del 50 % del máximo posible al emparejar la última ronda"
   ],
   "correcta": 3,
   "explicacion": "Art. 1.8."
  },
  {
   "ficha": "holandes-2026",
   "texto": "Dos jugadores tienen la misma preferencia fuerte por blancas y sus historiales de color son idénticos, así que ni la preferencia más fuerte ni la alternancia deciden. El mejor clasificado tiene TPN 3. ¿Qué regla se aplica antes que la del TPN?",
   "opciones": [
    "Dar negras a ambos",
    "Sortear",
    "Dar blancas al de menor rating",
    "Dar su preferencia al mejor clasificado"
   ],
   "correcta": 3,
   "explicacion": "Art. 5.2: tras ambas preferencias, la más fuerte y la alternancia, se concede la preferencia del mejor clasificado (5.2.4); el TPN impar o par (5.2.5) es el último recurso."
  },
  {
   "ficha": "holandes-2026",
   "texto": "Un jugador ganó por incomparecencia en la ronda 1. Para el Holandés, ¿qué flotación tiene en esa ronda?",
   "opciones": [
    "Ninguna",
    "Una bajada",
    "Depende del color",
    "Una subida"
   ],
   "correcta": 1,
   "explicacion": "Art. 1.4.3: quien sin jugar suma más que los puntos de una derrota recibe una bajada."
  },
  {
   "ficha": "holandes-2026",
   "texto": "¿Cuál es un criterio absoluto del Holandés 2026?",
   "opciones": [
    "Minimizar los bajados",
    "No emparejar a dos no topscorers con la misma preferencia absoluta de color",
    "Evitar subidas repetidas",
    "Dar a cada uno su color preferido"
   ],
   "correcta": 1,
   "explicacion": "C3 es absoluto. Los otros son criterios de calidad (C6, C12, C15)."
  },
  {
   "ficha": "holandes-2026",
   "texto": "Un jugador jugó con negras en la ronda 1 y su rival de la ronda 2 no ha jugado ninguna partida. ¿Qué color recibe?",
   "opciones": [
    "Blancas: el rival no tiene preferencia y se respeta la suya",
    "Se sortea",
    "El del TPN más bajo",
    "Negras"
   ],
   "correcta": 0,
   "explicacion": "Art. 1.7.4: quien no jugó ninguna partida no tiene preferencia de color; se concede la del rival (5.2.1)."
  },
  {
   "ficha": "gestion-suizo-c042",
   "texto": "Dos jugadores emparejados en la ronda 2 no jugaron (incomparecencia). ¿Pueden volver a emparejarse en la ronda 6?",
   "opciones": [
    "Solo con permiso del organizador",
    "No, nunca",
    "Solo en la última ronda",
    "Sí"
   ],
   "correcta": 3,
   "explicacion": "C.04.2, art. 3.5: dos jugadores que no jugaron su partida pueden emparejarse en una ronda futura."
  },
  {
   "ficha": "gestion-suizo-c042",
   "texto": "Una partida aplazada aún no terminó cuando hay que emparejar la ronda siguiente. ¿Cómo se cuenta para emparejar?",
   "opciones": [
    "No se cuenta",
    "Como victoria del que va mejor",
    "Como tablas, solo a efectos de emparejamiento",
    "Se espera a que termine"
   ],
   "correcta": 2,
   "explicacion": "C.04.2, art. 3.1."
  },
  {
   "ficha": "gestion-suizo-c042",
   "texto": "Se detecta después de publicar los emparejamientos que dos jugadores emparejados ya se habían enfrentado. ¿Se puede cambiar?",
   "opciones": [
    "Sí, es uno de los casos del art. 4.4, si el árbitro principal lo considera en interés del torneo",
    "Solo si los dos jugadores firman",
    "No, lo publicado no se toca",
    "Solo si no ha empezado ninguna partida del torneo"
   ],
   "correcta": 0,
   "explicacion": "C.04.2, art. 4.4."
  },
  {
   "ficha": "gestion-suizo-c042",
   "texto": "Un resultado mal anotado se descubre una vez terminado el plazo, después del torneo. ¿Para qué se usa la corrección?",
   "opciones": [
    "No se usa",
    "Para cambiar la clasificación final y los premios",
    "Solo para el envío a rating",
    "Para rehacer todos los emparejamientos"
   ],
   "correcta": 2,
   "explicacion": "C.04.2, art. 4.3: avisado a tiempo afecta a la clasificación y la ronda siguiente; después, solo al envío a rating."
  },
  {
   "ficha": "gestion-suizo-c042",
   "texto": "Un jugador inscrito llega después del sorteo de la ronda 1 sin haber confirmado. ¿Qué pasa?",
   "opciones": [
    "Queda excluido, salvo que el árbitro principal decida otra cosa",
    "Recibe medio punto",
    "Juega igual",
    "Se le empareja contra el descanso"
   ],
   "correcta": 0,
   "explicacion": "C.04.2, art. 4.1."
  },
  {
   "ficha": "gestion-suizo-c042",
   "texto": "Al enviar el informe a la FIDE, ¿qué debe declarar el árbitro principal sobre el emparejamiento?",
   "opciones": [
    "Los nombres de los auxiliares",
    "El sistema suizo oficial y el método de aceleración usados",
    "El programa usado y su versión",
    "Nada"
   ],
   "correcta": 1,
   "explicacion": "C.04.2, art. 1.3."
  },
  {
   "ficha": "gestion-suizo-c042",
   "texto": "Un participante tardío se incorpora en la ronda 3. Si las bases no dicen nada, ¿cuántos puntos recibe por las rondas 1 y 2?",
   "opciones": [
    "Los que decida el árbitro",
    "Ninguno",
    "Medio punto por ronda",
    "Un punto por ronda"
   ],
   "correcta": 1,
   "explicacion": "C.04.2, art. 2.4: no recibe puntos por las rondas no jugadas, salvo que las bases digan otra cosa."
  },
  {
   "ficha": "premios-hort",
   "texto": "¿Qué objetivo combina el sistema Hort?",
   "opciones": [
    "Evitar los desempates",
    "Dar todo al primero",
    "Repartir todo a partes iguales",
    "Premiar el puesto final y, a la vez, repartir parte del dinero"
   ],
   "correcta": 3,
   "explicacion": "Premia la posición tras los desempates sin que un solo jugador se lleve casi todo, ni que los premios caigan demasiado."
  },
  {
   "ficha": "premios-hort",
   "texto": "¿Qué parte del premio de su puesto recibe directamente cada empatado?",
   "opciones": [
    "Nada",
    "El 50 %",
    "El 100 %",
    "El 25 %"
   ],
   "correcta": 1,
   "explicacion": "El sistema da el 50 % por el puesto y reparte el otro 50 % a partes iguales."
  },
  {
   "ficha": "premios-hort",
   "texto": "En ese mismo ejemplo (6 000, 3 000 y 1 500 entre tres empatados), ¿cuánto recibe el 3.º?",
   "opciones": [
    "2 500",
    "1 500",
    "750",
    "3 500"
   ],
   "correcta": 0,
   "explicacion": "750 + 1 750 = 2 500. Los tres suman 4 750 + 3 250 + 2 500 = 10 500, igual que la bolsa."
  },
  {
   "ficha": "premios-hort",
   "texto": "Tres jugadores empatan en el 1.er lugar. Premios: 6 000, 3 000 y 1 500. Con el sistema Hort, ¿cuánto recibe el que queda 1.º tras el desempate?",
   "opciones": [
    "6 000",
    "3 500",
    "5 250",
    "4 750"
   ],
   "correcta": 3,
   "explicacion": "50 % de 6 000 = 3 000. Bolsa: (3 000 + 1 500 + 750) = 5 250, ÷ 3 = 1 750. Total 3 000 + 1 750 = 4 750."
  },
  {
   "ficha": "premios-hort",
   "texto": "¿Dónde se regula el uso del sistema Hort en un torneo FIDE?",
   "opciones": [
    "En las Leyes del Ajedrez",
    "En el C.04.3",
    "En las bases del torneo",
    "En el C.07, art. 16"
   ],
   "correcta": 2,
   "explicacion": "El C.07 ordena a los empatados pero no regula el dinero; la forma de repartir premios la fijan las bases."
  },
  {
   "ficha": "premios-hort",
   "texto": "Cinco empatados, premios 10 000 / 7 000 / 5 000 / 3 000 / 2 000. ¿Cuánto vale la parte de la bolsa común para cada uno?",
   "opciones": [
    "2 700",
    "5 400",
    "13 500",
    "1 350"
   ],
   "correcta": 0,
   "explicacion": "La mitad de 27 000 es 13 500; ÷ 5 = 2 700."
  },
  {
   "ficha": "rating-fide-2024",
   "texto": "En una partida estándar, uno de los jugadores tiene 1850 y el otro 1700. ¿Cuál es el tiempo mínimo por jugador, según el art. 1.1, para que se califique?",
   "opciones": [
    "60 minutos",
    "90 minutos",
    "120 minutos",
    "45 minutos"
   ],
   "correcta": 1,
   "explicacion": "Art. 1.1: si al menos uno tiene 1800 o más (y ninguno 2400), cada uno debe tener al menos 90 minutos para 60 jugadas. La resolución de 2026 admite además 60'+30\" como ritmo estándar."
  },
  {
   "ficha": "rating-fide-2024",
   "texto": "¿Cuál es hoy el rating mínimo que se publica en la lista FIDE?",
   "opciones": [
    "1000",
    "1200",
    "1400",
    "1600"
   ],
   "correcta": 2,
   "explicacion": "Arts. 7.1.2 y 7.2.1 (2024): solo se publica el rating de quien tiene al menos 1400; quien baja de ese número queda sin rating."
  },
  {
   "ficha": "rating-fide-2024",
   "texto": "¿Cuántas partidas contra rivales con rating necesita un jugador nuevo para que se publique su primer rating?",
   "opciones": [
    "3",
    "5",
    "9",
    "12"
   ],
   "correcta": 1,
   "explicacion": "Art. 7.1.4: al menos 5 partidas contra rivales con rating, que pueden sumarse de torneos jugados en hasta 26 meses."
  },
  {
   "ficha": "rating-fide-2024",
   "texto": "Al calcular el rating inicial, ¿qué se agrega a las partidas reales?",
   "opciones": [
    "Nada",
    "Dos rivales hipotéticos de 1800 con tablas",
    "Dos rivales hipotéticos de 1400 con derrota",
    "Un rival hipotético de 2000 con victoria"
   ],
   "correcta": 1,
   "explicacion": "Art. 8.2.2: al promedio se agregan dos rivales hipotéticos de 1800, y el resultado contra ellos se toma como tablas."
  },
  {
   "ficha": "rating-fide-2024",
   "texto": "Una jugadora de 15 años tiene 2150 y más de 30 partidas. ¿Qué K le corresponde?",
   "opciones": [
    "10",
    "20",
    "30",
    "40"
   ],
   "correcta": 3,
   "explicacion": "Art. 8.3.3: K = 40 hasta el final del año en que cumple 18 años, mientras su rating esté por debajo de 2300."
  },
  {
   "ficha": "rating-fide-2024",
   "texto": "Un jugador de 2700 juega contra uno de 2250. ¿Cómo se toma la diferencia para el cálculo del jugador de 2700?",
   "opciones": [
    "Como 400",
    "Como la diferencia real, 450",
    "Como 350",
    "La partida no se califica"
   ],
   "correcta": 1,
   "explicacion": "Art. 8.3.1: desde el 1-oct-2025 la regla de los 400 solo vale para jugadores de menos de 2650. Para quien tiene 2650 o más se usa siempre la diferencia real."
  },
  {
   "ficha": "rating-fide-2024",
   "texto": "Un jugador no se presenta y su rival gana por incomparecencia. ¿Se califica esa partida?",
   "opciones": [
    "Sí, como victoria",
    "Sí, como tablas",
    "No: las partidas no jugadas no cuentan",
    "Solo para el que se presentó"
   ],
   "correcta": 2,
   "explicacion": "Art. 5.1: las partidas no jugadas, por incomparecencia o cualquier otra razón, no se cuentan para el rating."
  },
  {
   "ficha": "rating-fide-2024",
   "texto": "¿Qué pasa si el informe de un torneo no llega a tiempo para la tercera lista después de terminado?",
   "opciones": [
    "Se califica con recargo",
    "No se califica",
    "Se califica en la cuarta lista",
    "Se califica solo para los jugadores nuevos"
   ],
   "correcta": 1,
   "explicacion": "Art. 9.1: si el informe no se envía a tiempo para incluirse en la tercera lista posterior al final del torneo, el torneo no se califica."
  },
  {
   "ficha": "rating-fide-2024",
   "texto": "Torneo sin ningún jugador de 2400 o más. Según la resolución del Consejo FIDE de 2026, ¿qué ritmo puede usar y seguir dando derecho a normas?",
   "opciones": [
    "30'+30\"",
    "45'+30\"",
    "25'+10\"",
    "Solo 90'+30\""
   ],
   "correcta": 1,
   "explicacion": "La resolución admite 45'+30\" en torneos sin jugadores de 2400 o más (y en los del Circuito FIDE), con el límite de dos rondas por día para normas y títulos."
  },
  {
   "ficha": "registro-licencias",
   "texto": "¿Puede un jugador tener dos números FIDE, uno para el tablero y otro para jugar en línea?",
   "opciones": [
    "Sí, son sistemas separados",
    "No: el FIN es único para toda su carrera, en el tablero y en línea",
    "Solo si cambia de federación",
    "Solo si lo autoriza su federación"
   ],
   "correcta": 1,
   "explicacion": "Art. 1.3: el FIN es único; nadie puede tener dos y es el mismo en el tablero y en línea."
  },
  {
   "ficha": "registro-licencias",
   "texto": "Un jugador registrado por una federación miembro de la FIDE quiere jugar un abierto calificado. ¿Necesita tramitar una licencia aparte?",
   "opciones": [
    "Sí, debe pagar 100 € a la FIDE",
    "No: todo jugador registrado por una federación miembro tiene licencia",
    "Sí, cada año",
    "Solo si es menor de edad"
   ],
   "correcta": 1,
   "explicacion": "Art. 2.1: todos los jugadores registrados que representan a una federación miembro tienen licencia para jugar sobre el tablero."
  },
  {
   "ficha": "registro-licencias",
   "texto": "¿Cuánto cuesta la licencia provisional de un jugador con bandera FIDE (FID)?",
   "opciones": [
    "25 € por torneo",
    "50 € una sola vez",
    "100 € al año",
    "Es gratis"
   ],
   "correcta": 2,
   "explicacion": "Arts. 2.6 a 2.8: 100 €, válida hasta el 30 de junio del año siguiente y renovable."
  },
  {
   "ficha": "registro-licencias",
   "texto": "¿Puede un jugador FID con licencia jugar un campeonato continental?",
   "opciones": [
    "Sí",
    "No: los jugadores FID no juegan eventos FIDE ni continentales",
    "Solo si paga una cuota extra",
    "Solo en la sección femenina"
   ],
   "correcta": 1,
   "explicacion": "Art. 2.10: los jugadores con bandera FIDE no pueden competir en eventos FIDE ni continentales; sí en otros torneos calificados (art. 2.11)."
  },
  {
   "ficha": "registro-licencias",
   "texto": "Eres árbitro principal y un inscrito no tiene número FIDE. ¿Qué riesgo corre el torneo?",
   "opciones": [
    "Ninguno",
    "Puede no calificarse (art. 1.19)",
    "Se califica, pero sin ese jugador",
    "Pierde la categoría de torneo de normas automáticamente"
   ],
   "correcta": 1,
   "explicacion": "Art. 1.19: un torneo puede no calificarse si hay jugadores sin un FIN válido. La federación debe registrarlo antes de enviar el informe."
  },
  {
   "ficha": "normas-de-titulo",
   "texto": "¿Qué rating da el título de Maestro FIDE (FM)?",
   "opciones": [
    "2200",
    "2300",
    "2400",
    "2100"
   ],
   "correcta": 1,
   "explicacion": "Art. 1.3: FM 2300, CM 2200, WFM 2100 y WCM 2000, con al menos 30 partidas calificadas."
  },
  {
   "ficha": "normas-de-titulo",
   "texto": "¿Qué título debe tener el árbitro principal de un torneo de normas?",
   "opciones": [
    "Árbitro Nacional",
    "AI o AF",
    "Solo AI",
    "Cualquiera con licencia"
   ],
   "correcta": 1,
   "explicacion": "Art. 1.1.5: debe ser Árbitro Internacional o Árbitro FIDE, y siempre debe haber un AI o AF en el recinto."
  },
  {
   "ficha": "normas-de-titulo",
   "texto": "En un torneo de normas, ¿cuántas rondas se pueden jugar por día como máximo?",
   "opciones": [
    "1",
    "2",
    "3",
    "Las que quepan en 12 horas"
   ],
   "correcta": 1,
   "explicacion": "Art. 1.1.3: no más de 2 rondas por día. La resolución de ritmos de 2026 mantiene ese límite para normas y títulos."
  },
  {
   "ficha": "normas-de-titulo",
   "texto": "Para una norma de GM, dos rivales tienen 2150 y 2170. ¿Qué se hace con el piso de 2200?",
   "opciones": [
    "Se suben los dos a 2200",
    "Solo se sube el de 2150 a 2200",
    "Solo se sube el de 2170",
    "No se sube ninguno"
   ],
   "correcta": 1,
   "explicacion": "Art. 1.4.6: solo un rival puede subir al piso; si hay más de uno por debajo, se sube el de menor rating."
  },
  {
   "ficha": "normas-de-titulo",
   "texto": "¿Con qué rating se cuenta a un rival sin rating en el cálculo de una norma?",
   "opciones": [
    "1000",
    "1400",
    "1800",
    "El piso de la norma"
   ],
   "correcta": 1,
   "explicacion": "Art. 1.4.6: los rivales sin rating que no sean el elevado al piso cuentan como 1400."
  },
  {
   "ficha": "normas-de-titulo",
   "texto": "Promedio de rivales 2435 y 6½ de 9. ¿Hay norma de GM?",
   "opciones": [
    "No: le falta un punto",
    "Sí: 72 % da dp = +166 y Rp = 2601",
    "No: el promedio no llega a 2450",
    "Sí, pero solo si es la última ronda"
   ],
   "correcta": 1,
   "explicacion": "Art. 1.4.8: 6½/9 = 72,2 % → 72 % → dp = 166 (tabla 1.4.9). Rp = 2435 + 166 = 2601 ≥ 2600, con promedio ≥ 2380."
  },
  {
   "ficha": "normas-de-titulo",
   "texto": "En una norma de IM a 9 rondas, ¿cuántos rivales deben ser IM o GM como mínimo?",
   "opciones": [
    "2",
    "3",
    "4",
    "5"
   ],
   "correcta": 1,
   "explicacion": "Art. 1.4.5: al menos 1/3 de los rivales, con un mínimo de 3, deben ser IM o GM. Un tercio de 9 es 3."
  },
  {
   "ficha": "normas-de-titulo",
   "texto": "¿Cuántas partidas deben sumar las normas para pedir el título de GM?",
   "opciones": [
    "18",
    "24",
    "27",
    "30"
   ],
   "correcta": 2,
   "explicacion": "Art. 1.5.1: normas en eventos que cubran al menos 27 partidas, además de haber alcanzado 2500 alguna vez (art. 1.5.3)."
  },
  {
   "ficha": "normas-de-titulo",
   "texto": "Un jugador tiene tres normas, todas de abiertos pequeños jugados en 2023 y 2024. ¿Qué le falta según el art. 1.5.6?",
   "opciones": [
    "Nada",
    "Una norma de alguno de los torneos que enumera el art. 1.5.6 (suizo de 40 con promedio 2000, Olimpiada, nacional individual…)",
    "Una cuarta norma cualquiera",
    "Un rating de 2600"
   ],
   "correcta": 1,
   "explicacion": "Art. 1.5.6: si hay normas posteriores al 30-jun-2022, la solicitud debe incluir al menos una norma de los torneos de esa lista."
  },
  {
   "ficha": "titulos-directos",
   "texto": "¿Qué título recibe quien llega a los 16 mejores de la Copa Mundial?",
   "opciones": [
    "IM",
    "GM",
    "Una norma de GM",
    "FM"
   ],
   "correcta": 1,
   "explicacion": "Tabla de Títulos Directos (2026): llegar a los 16 mejores de la Copa Mundial da el título de GM; clasificar jugando a la Copa da el IM."
  },
  {
   "ficha": "titulos-directos",
   "texto": "En la Olimpiada, ¿qué da hacer el 65 % en al menos 9 partidas?",
   "opciones": [
    "GM",
    "IM",
    "FM",
    "CM"
   ],
   "correcta": 2,
   "explicacion": "Tabla de Títulos Directos: 65 % en un mínimo de 9 partidas da el FM; 50 % en un mínimo de 7, el CM (en la Olimpiada Femenina, WFM y WCM)."
  },
  {
   "ficha": "titulos-directos",
   "texto": "Gana el Continental Individual un jugador de 2250. ¿Qué pasa con su GM?",
   "opciones": [
    "Lo recibe de inmediato",
    "Lo recibe condicionado hasta llegar a 2300",
    "No lo recibe nunca",
    "Recibe el IM en su lugar"
   ],
   "correcta": 1,
   "explicacion": "Art. 0.6.2: para el GM directo inmediato se necesita 2300; por debajo, el título queda condicionado y se confirma al alcanzar ese rating."
  },
  {
   "ficha": "titulos-directos",
   "texto": "¿Qué significa «primer lugar compartido» en la tabla de títulos directos?",
   "opciones": [
    "Todos los empatados en el primer puesto",
    "Como máximo los 3 mejores tras el desempate",
    "Solo el segundo lugar",
    "Los empatados que tengan más victorias"
   ],
   "correcta": 1,
   "explicacion": "Art. 1.2.3 y tabla: «1st equal» son como máximo los 3 mejores después del desempate."
  },
  {
   "ficha": "titulos-directos",
   "texto": "Un campeonato continental de jóvenes tiene 8 participantes. ¿Puede dar títulos directos?",
   "opciones": [
    "Sí",
    "No: necesita al menos 10 participantes y 9 rondas",
    "Sí, si hay 5 federaciones",
    "Solo normas"
   ],
   "correcta": 1,
   "explicacion": "Art. 1.2.2: al menos un tercio o cinco de las federaciones (lo menor), 10 participantes y 9 rondas."
  },
  {
   "ficha": "titulos-directos",
   "texto": "Un jugador entra a la Copa Mundial como reemplazo de otro que renunció. ¿Recibe el IM por «clasificar jugando»?",
   "opciones": [
    "Sí",
    "No: solo cuenta quien termina dentro de los puestos de clasificación",
    "Sí, si juega la primera ronda",
    "Solo si gana una partida"
   ],
   "correcta": 1,
   "explicacion": "Nota 1 de la tabla: no cuentan quienes entran como reemplazo o por otra vía; tampoco hace falta jugar la Copa para recibir el título."
  },
  {
   "ficha": "equipo-arbitral",
   "texto": "Un jugador quiere protestar una decisión. Según el modelo de equipo del artículo, ¿con quién habla primero?",
   "opciones": [
    "Con el árbitro principal",
    "Con el árbitro de sala",
    "Con el organizador",
    "Con el comité de apelaciones"
   ],
   "correcta": 1,
   "explicacion": "El primer contacto es el árbitro de sala; luego el adjunto y por último el principal, para no saltarse instancias."
  },
  {
   "ficha": "equipo-arbitral",
   "texto": "¿Dónde puede fumar un jugador durante la partida, incluidos los cigarrillos electrónicos?",
   "opciones": [
    "En cualquier lugar fuera de la sala",
    "Solo en la zona que designa el árbitro",
    "En ningún lugar",
    "En su mesa, si el rival acepta"
   ],
   "correcta": 1,
   "explicacion": "Art. 11.3.4: fumar, incluidos los cigarrillos electrónicos, solo se permite en la sección del recinto que designa el árbitro."
  },
  {
   "ficha": "equipo-arbitral",
   "texto": "Un auxiliar se equivocó en una decisión menor. ¿Cómo lo corrige el principal?",
   "opciones": [
    "Lo reprende frente a los jugadores",
    "Lo retira del torneo",
    "Habla con él en privado, en un momento adecuado",
    "Lo anota en el informe a la FIDE"
   ],
   "correcta": 2,
   "explicacion": "Calleros: nunca un comportamiento punitivo en público; se analiza y se habla en privado para mejorar."
  },
  {
   "ficha": "equipo-arbitral",
   "texto": "¿Qué artículo de las Leyes dice que el árbitro no interviene en una partida salvo en los casos previstos?",
   "opciones": [
    "Art. 11.1",
    "Art. 12.6",
    "Art. 12.9",
    "Art. 6.11"
   ],
   "correcta": 1,
   "explicacion": "Art. 12.6: el árbitro no debe intervenir en una partida salvo en los casos descritos por las Leyes."
  },
  {
   "ficha": "equipo-arbitral",
   "texto": "Entre los deberes del art. 12.2 está…",
   "opciones": [
    "Hacer siempre los emparejamientos personalmente",
    "Tomar medidas especiales a favor de los jugadores con discapacidad",
    "Avisar a un jugador de que su rival ya movió",
    "Analizar las partidas al final"
   ],
   "correcta": 1,
   "explicacion": "Art. 12.2.6: tomar medidas especiales en interés de los jugadores con discapacidad y de quienes necesitan atención médica."
  },
  {
   "ficha": "equipo-arbitral",
   "texto": "El mandamiento «rechazar los acuerdos espurios» tiene respaldo en…",
   "opciones": [
    "Las Leyes, art. 9.1",
    "El Código de Ética y Disciplina de la FIDE, arts. 6.22 y 11.8",
    "El Reglamento de Títulos, art. 1.5",
    "No tiene respaldo normativo"
   ],
   "correcta": 1,
   "explicacion": "El Código de Ética y Disciplina (vigente desde 2022) prohíbe la manipulación de competiciones y resultados (arts. 6.22 y 11.8)."
  },
  {
   "ficha": "relajacion-arbitro",
   "texto": "En la respiración rítmica, ¿cuál es la secuencia?",
   "opciones": [
    "Inhalar 2, exhalar 6",
    "Inhalar 4, sostener 4, exhalar 4, descansar 4",
    "Inhalar 10, exhalar 10",
    "Inhalar y exhalar lo más rápido posible"
   ],
   "correcta": 1,
   "explicacion": "La autora propone contar cuatro tiempos para inhalar, sostener, exhalar y descansar."
  },
  {
   "ficha": "relajacion-arbitro",
   "texto": "¿Cuál es, según la autora, el momento más tranquilo de la respiración?",
   "opciones": [
    "Al inhalar",
    "Al sostener el aire",
    "Entre la exhalación y la inhalación",
    "Al bostezar"
   ],
   "correcta": 2,
   "explicacion": "El texto señala que el tiempo más tranquilo es el comprendido entre la exhalación y la inhalación."
  },
  {
   "ficha": "relajacion-arbitro",
   "texto": "En el bostezo-suspiro, ¿cuánto tiempo se sostiene el aire?",
   "opciones": [
    "Unos 2 segundos",
    "Unos 10 segundos",
    "Un minuto",
    "No se sostiene"
   ],
   "correcta": 1,
   "explicacion": "Se inhala despacio y se sostiene el aliento unos diez segundos antes de exhalar lentamente por la boca."
  },
  {
   "ficha": "relajacion-arbitro",
   "texto": "¿Para qué sirve, según el artículo, aprender a relajarse antes de arbitrar?",
   "opciones": [
    "Para arbitrar más rápido",
    "Para tomar mejores decisiones bajo presión",
    "Para no tener que estudiar las Leyes",
    "Para dormir durante la ronda"
   ],
   "correcta": 1,
   "explicacion": "La relajación da la tranquilidad necesaria para tomar las mejores decisiones, sobre todo bajo presión."
  },
  {
   "ficha": "relajacion-arbitro",
   "texto": "¿Cómo se cierra la relajación muscular?",
   "opciones": [
    "Con un vaso de agua",
    "Sosteniendo el aire 5 segundos y exhalando unos 10 mientras se piensa en actuar con eficacia",
    "Con un grito",
    "Caminando por la sala"
   ],
   "correcta": 1,
   "explicacion": "La autora propone sostener 5 segundos y exhalar durante unos 10, pensando en actuar de forma eficaz y seguro de la propia capacidad."
  },
  {
   "ficha": "abandono-y-piezas",
   "texto": "Las blancas tienen dama, dos torres, alfil y peones; las negras, solo el rey. Las blancas declaran que abandonan. ¿Resultado?",
   "opciones": [
    "Ganan las negras",
    "Tablas",
    "El árbitro no acepta el abandono y la partida sigue",
    "Ganan las blancas"
   ],
   "correcta": 1,
   "explicacion": "Art. 5.1.2: el abandono pierde, salvo que el rival no pueda dar mate con ninguna serie de jugadas legales; un rey solo nunca puede dar mate, así que son tablas."
  },
  {
   "ficha": "abandono-y-piezas",
   "texto": "¿Es la posición del caso (todo contra rey solo) una «posición muerta» del art. 5.2.2?",
   "opciones": [
    "Sí, porque las negras no pueden dar mate",
    "No: la posición muerta exige que ninguno de los dos pueda dar mate",
    "Sí, siempre que falten menos de 10 jugadas",
    "Depende del árbitro"
   ],
   "correcta": 1,
   "explicacion": "Art. 5.2.2: hay posición muerta cuando ninguno de los dos puede dar mate. Aquí las blancas sí pueden."
  },
  {
   "ficha": "abandono-y-piezas",
   "texto": "Un jugador abandona en una posición en la que su rival sí puede darle mate, aunque sea con material mínimo. ¿Resultado?",
   "opciones": [
    "Tablas",
    "Pierde el que abandonó",
    "Se reanuda la partida",
    "El árbitro decide según el material"
   ],
   "correcta": 1,
   "explicacion": "Art. 5.1.2: si existe alguna serie de jugadas legales que termine en mate del rival, el abandono pierde la partida."
  },
  {
   "ficha": "abandono-y-piezas",
   "texto": "En una rápida, una pieza cae al suelo y no la encuentras a mano. ¿Qué es lo correcto?",
   "opciones": [
    "Tomar una igual de la mesa vecina",
    "Pausar el reloj y pedir ayuda al árbitro",
    "Seguir jugando sin la pieza",
    "Pedirle al rival que espere sin pausar el reloj"
   ],
   "correcta": 1,
   "explicacion": "Art. 6.11.2: el jugador puede pausar el reloj para pedir ayuda al árbitro, por ejemplo cuando falta una pieza."
  },
  {
   "ficha": "abandono-y-piezas",
   "texto": "Un jugador desplaza varias piezas al mover. ¿En el tiempo de quién las repone?",
   "opciones": [
    "En el del rival",
    "En el suyo",
    "Con el reloj pausado siempre",
    "No hace falta reponerlas"
   ],
   "correcta": 1,
   "explicacion": "Art. 7.4.1: quien desplaza piezas restablece la posición en su propio tiempo; si hace falta, se pausa el reloj y se pide ayuda (7.4.2)."
  },
  {
   "ficha": "abandono-y-piezas",
   "texto": "Un jugador te pide autorizarlo a devolver una jugada ya soltada, porque su rival le permitió lo mismo antes. ¿Qué haces?",
   "opciones": [
    "Lo autorizo, por igualdad",
    "Lo rechazo: una jugada soltada no se cambia, y puedo advertir a ambos por el acuerdo anterior",
    "Hago repetir la partida",
    "Doy tablas"
   ],
   "correcta": 1,
   "explicacion": "Art. 4.7: una jugada soltada no puede cambiarse. El acuerdo previo era contrario a las Leyes (art. 11.1) y puede merecer una advertencia (art. 12.9.1)."
  },
  {
   "ficha": "abandono-y-piezas",
   "texto": "Un profesor le pide a una jugadora que pierda a propósito para mejorar el emparejamiento de su equipo. ¿Qué norma prohíbe esa conducta?",
   "opciones": [
    "Ninguna",
    "El Código de Ética y Disciplina de la FIDE (manipulación de resultados)",
    "El Reglamento de Títulos",
    "El art. 9.1 de las Leyes"
   ],
   "correcta": 1,
   "explicacion": "El Código de Ética y Disciplina de la FIDE prohíbe la manipulación de competiciones y resultados (arts. 6.22 y 11.8)."
  },
  {
   "ficha": "orden-inicial-suizo",
   "texto": "Dos jugadores tienen 2215: un FM y una WIM. ¿Quién recibe el número más bajo?",
   "opciones": [
    "La WIM",
    "El FM",
    "Se sortea",
    "El de apellido que va primero"
   ],
   "correcta": 1,
   "explicacion": "C.04.2, art. 2.2.2: el orden de títulos es GM, IM, WGM, FM, WIM, CM, WFM, WCM; el FM va antes que la WIM."
  },
  {
   "ficha": "orden-inicial-suizo",
   "texto": "¿Cuál es el tercer criterio para ordenar a los jugadores antes de la primera ronda?",
   "opciones": [
    "La edad",
    "El orden alfabético, salvo que se anuncie otro",
    "La federación",
    "La fecha de inscripción"
   ],
   "correcta": 1,
   "explicacion": "C.04.2, art. 2.2.3: alfabéticamente, salvo que se haya anunciado antes que se reemplaza por otro criterio."
  },
  {
   "ficha": "orden-inicial-suizo",
   "texto": "Después de la ronda 5 descubres que el rating de un jugador estaba mal. ¿Puedes cambiar su número de emparejamiento?",
   "opciones": [
    "Sí, siempre",
    "No: después de emparejada la cuarta ronda ningún número cambia",
    "Sí, si el jugador lo pide",
    "Solo al final del torneo"
   ],
   "correcta": 1,
   "explicacion": "C.04.2, art. 2.3: los datos se corrigen, pero ningún TPN puede modificarse por eso después de emparejada la cuarta ronda."
  },
  {
   "ficha": "orden-inicial-suizo",
   "texto": "Un jugador ganó por incomparecencia en la ronda 2. En la ronda 6 el programa lo empareja con el mismo rival que no se presentó. ¿Es correcto?",
   "opciones": [
    "No, nunca pueden volver a jugar",
    "Sí: si no jugaron su partida, pueden volver a emparejarse",
    "Solo si los dos están de acuerdo",
    "Solo en la última ronda"
   ],
   "correcta": 1,
   "explicacion": "C.04.2, art. 3.5: dos jugadores emparejados que no jugaron su partida pueden emparejarse en una ronda posterior."
  },
  {
   "ficha": "orden-inicial-suizo",
   "texto": "Historial de colores B-N-u-B («u» = no jugada). ¿Cómo lo trata el emparejamiento?",
   "opciones": [
    "Como B-N-B-B",
    "Como u-B-N-B",
    "Como B-N-N-B",
    "Como si tuviera una blanca más"
   ],
   "correcta": 1,
   "explicacion": "C.04.2, art. 3.4: solo cuentan las partidas jugadas; la ronda no jugada se pasa al principio: u-B-N-B."
  },
  {
   "ficha": "orden-inicial-suizo",
   "texto": "En el Sistema Holandés, ¿qué recibe un jugador que gana por incomparecencia?",
   "opciones": [
    "Nada",
    "Una flotación descendente",
    "Una flotación ascendente",
    "Un descanso con punto"
   ],
   "correcta": 1,
   "explicacion": "C.04.3 (2026), art. 1.4.3: recibe flotación descendente quien, sin jugar, suma más puntos que los de una derrota."
  },
  {
   "ficha": "orden-inicial-suizo",
   "texto": "¿Cuántos puntos da el descanso asignado por el emparejamiento (número impar de jugadores)?",
   "opciones": [
    "Medio punto siempre",
    "Los de una victoria, salvo que las bases digan otra cosa",
    "Cero",
    "Lo decide el árbitro en cada ronda"
   ],
   "correcta": 1,
   "explicacion": "C.04.1, regla 3: sin rival ni color y con los puntos de una victoria, salvo que las bases digan otra cosa."
  },
  {
   "ficha": "orden-inicial-suizo",
   "texto": "Un jugador entra al torneo en la ronda 3. ¿Cuántos puntos recibe por las rondas 1 y 2?",
   "opciones": [
    "Medio punto por cada una",
    "Ninguno, salvo que las bases digan otra cosa",
    "Un punto por cada una",
    "Los que tenga el último de la tabla"
   ],
   "correcta": 1,
   "explicacion": "C.04.2, art. 2.4: el inscrito tardío no recibe puntos por las rondas no jugadas, salvo que las bases digan otra cosa."
  },
  {
   "ficha": "discapacidad-pautas",
   "texto": "¿Con cuánta antelación debe un jugador avisar al organizador que necesita condiciones especiales por discapacidad?",
   "opciones": [
    "El día de la ronda",
    "Al menos 20 días antes",
    "Al menos 60 días antes",
    "No hace falta avisar"
   ],
   "correcta": 1,
   "explicacion": "Pautas D.04.12: el jugador informa al organizador sus necesidades al menos 20 días antes del inicio."
  },
  {
   "ficha": "discapacidad-pautas",
   "texto": "Un jugador se niega a jugar contra un rival en silla de ruedas con quien fue emparejado correctamente. ¿Tiene derecho?",
   "opciones": [
    "Sí, si avisa antes",
    "No: nadie puede negarse a jugar contra un jugador con discapacidad correctamente emparejado",
    "Sí, en partidas rápidas",
    "Solo si cambia de mesa"
   ],
   "correcta": 1,
   "explicacion": "Pautas D.04.12: nadie tiene derecho a negarse a jugar contra un jugador con discapacidad correctamente emparejado."
  },
  {
   "ficha": "discapacidad-pautas",
   "texto": "Un jugador con discapacidad usa un asistente para pulsar el reloj. ¿Se le ajusta el reloj por eso?",
   "opciones": [
    "Sí, se le resta tiempo",
    "No: el ajuste no se aplica a un jugador con discapacidad",
    "Sí, se le suma tiempo al rival",
    "Solo en relámpago"
   ],
   "correcta": 1,
   "explicacion": "Art. 6.2.6 de las Leyes: el árbitro ajusta el reloj de quien usa asistente, pero ese ajuste no se aplica a un jugador con discapacidad."
  },
  {
   "ficha": "discapacidad-pautas",
   "texto": "Partida 90'+30\". ¿Qué recomiendan las pautas para un jugador con baja visión en los últimos 5 minutos?",
   "opciones": [
    "Que siga anotando, porque hay incremento de 30 s",
    "Que las bases lo liberen de anotar y actualice la planilla después",
    "Que el árbitro anote por él siempre",
    "Que se detenga el reloj cada jugada"
   ],
   "correcta": 1,
   "explicacion": "Las pautas piden que las bases liberen al jugador con baja visión de anotar en los últimos cinco minutos aun con incremento de 30 s; luego actualiza la planilla. Sin esa regla, rige el art. 8.4."
  },
  {
   "ficha": "discapacidad-pautas",
   "texto": "En el tablero especial de un jugador ciego, ¿cuándo se considera «tocada» una pieza?",
   "opciones": [
    "Al rozarla",
    "Al sacarla de su orificio",
    "Al anunciar la jugada",
    "Al pulsar el reloj"
   ],
   "correcta": 1,
   "explicacion": "Apéndice D, D.2.2: en el tablero del jugador con discapacidad visual, la pieza se considera tocada cuando se saca del orificio de sujeción."
  },
  {
   "ficha": "discapacidad-pautas",
   "texto": "Un jugador con discapacidad visual juega contra uno con discapacidad auditiva. ¿Qué exige el Apéndice D?",
   "opciones": [
    "Nada especial",
    "Que haya un asistente",
    "Que jueguen sin reloj",
    "Que la partida sea por escrito"
   ],
   "correcta": 1,
   "explicacion": "D.2.11: en ese caso el uso de un asistente es obligatorio."
  },
  {
   "ficha": "discapacidad-pautas",
   "texto": "¿Qué artículo de las Leyes encarga al árbitro tomar medidas especiales para los jugadores con discapacidad?",
   "opciones": [
    "Art. 12.2.6",
    "Art. 6.7.1",
    "Art. 9.6",
    "Art. 11.5"
   ],
   "correcta": 0,
   "explicacion": "Art. 12.2.6: el árbitro toma medidas especiales en interés de los jugadores con discapacidad y de quienes necesitan atención médica."
  },
  {
   "ficha": "rapidas-relampago",
   "texto": "Ritmo 5'+3\". ¿Rápida o relámpago?",
   "opciones": [
    "Rápida",
    "Relámpago",
    "Estándar",
    "Depende de las bases"
   ],
   "correcta": 1,
   "explicacion": "Art. B.1: se suma el tiempo base y 60 veces el incremento: 5 min + 60 × 3 s = 5 + 3 = 8 minutos, 10 o menos: relámpago."
  },
  {
   "ficha": "rapidas-relampago",
   "texto": "Ritmo 10'+5\". ¿Rápida o relámpago?",
   "opciones": [
    "Rápida",
    "Relámpago",
    "Estándar",
    "Ninguna"
   ],
   "correcta": 0,
   "explicacion": "Art. A.1: 10 + 60 × 5 s = 10 + 5 = 15 minutos, más de 10 y menos de 60: rápida."
  },
  {
   "ficha": "rapidas-relampago",
   "texto": "Torneo de rápidas con un árbitro para 20 partidas. Una jugadora hace una jugada ilegal, su rival contesta y luego reclama. ¿Qué pasa?",
   "opciones": [
    "Se vuelve atrás y 1 minuto al rival",
    "La jugada ilegal se mantiene y la partida sigue",
    "Pierde la que hizo la jugada ilegal",
    "Se vuelve atrás sin sanción"
   ],
   "correcta": 1,
   "explicacion": "A.5.2: sin supervisión adecuada, una vez que el rival hizo su siguiente jugada la jugada ilegal no se corrige (salvo acuerdo de los jugadores sin el árbitro)."
  },
  {
   "ficha": "rapidas-relampago",
   "texto": "En una rápida con supervisión adecuada, primera jugada ilegal completada. ¿Cuánto tiempo recibe el rival?",
   "opciones": [
    "30 segundos",
    "1 minuto",
    "2 minutos",
    "Nada"
   ],
   "correcta": 1,
   "explicacion": "A.3: las sanciones de los arts. 7 y 9 son de 1 minuto en lugar de 2."
  },
  {
   "ficha": "rapidas-relampago",
   "texto": "Las bases de tu torneo no dicen nada del tiempo de espera. ¿Cuál es?",
   "opciones": [
    "15 minutos",
    "30 minutos",
    "Cero",
    "Una hora"
   ],
   "correcta": 2,
   "explicacion": "Art. 6.7.1: si las bases no fijan el tiempo de espera, es cero; quien llega después pierde, salvo que el árbitro decida otra cosa."
  },
  {
   "ficha": "rapidas-relampago",
   "texto": "En el Mundial de Rápidas 2025, ¿qué pasaba con un jugador que llegaba tarde a su partida?",
   "opciones": [
    "Perdía al instante",
    "Tenía 15 minutos de espera",
    "No había tiempo de espera ni sanción: perdía solo el tiempo de su reloj",
    "Se le restaban 5 minutos"
   ],
   "correcta": 2,
   "explicacion": "Reglamento 2025, art. 4.2.2.3: no hay tiempo de espera y no se sanciona al jugador que llega tarde."
  },
  {
   "ficha": "rapidas-relampago",
   "texto": "¿Cuál fue el primer desempate del suizo del Mundial de Rápidas 2025?",
   "opciones": [
    "Encuentro directo",
    "Más victorias",
    "Buchholz -1",
    "Sonneborn-Berger"
   ],
   "correcta": 2,
   "explicacion": "Art. 4.2.4.1: Buchholz -1, Buchholz, AROC 1, encuentro directo y sorteo. En 2013 el primero era el encuentro directo."
  },
  {
   "ficha": "ideas-irracionales",
   "texto": "Según la autora, ¿cuál es el primer paso para controlar una idea irracional?",
   "opciones": [
    "Ignorarla",
    "Reconocer que es irracional",
    "Criticarse con dureza",
    "Pedir que otro arbitre"
   ],
   "correcta": 1,
   "explicacion": "El primer paso es determinar que la idea es irracional, separándola de las que tienen base real."
  },
  {
   "ficha": "ideas-irracionales",
   "texto": "«Si empiezo con una mala decisión, el resto del torneo me irá mal». ¿Qué dice el artículo?",
   "opciones": [
    "Que es cierto",
    "Que es una profecía que tiende a cumplirse",
    "Que conviene retirarse",
    "Que hay que arbitrar más rápido"
   ],
   "correcta": 1,
   "explicacion": "Predecir una mala actuación es una autoprofecía que tiende a cumplirse en la mayoría de los casos."
  },
  {
   "ficha": "ideas-irracionales",
   "texto": "¿Qué es la «falacia de las condiciones ideales»?",
   "opciones": [
    "Creer que sin condiciones perfectas no se puede trabajar bien, y culpar a otros",
    "Pedir buena iluminación",
    "Exigir mesas más grandes",
    "Preparar bien la sala"
   ],
   "correcta": 0,
   "explicacion": "Es creer que la propia actuación no puede ser buena porque las personas o situaciones no son como uno quisiera, lo que lleva a culpar a los demás."
  },
  {
   "ficha": "ideas-irracionales",
   "texto": "¿Qué ayuda más a sustituir una idea irracional?",
   "opciones": [
    "Repetir frases positivas",
    "Tener hechos reales que la refuten",
    "Evitar pensar en el torneo",
    "Criticarse más"
   ],
   "correcta": 1,
   "explicacion": "Cuantos más hechos reales se tengan para refutarla, más probable es que los pensamientos razonables la sustituyan."
  },
  {
   "ficha": "ideas-irracionales",
   "texto": "¿Qué dice la autora de la autocrítica dura?",
   "opciones": [
    "Que siempre ayuda",
    "Que suele producir el efecto contrario si no lleva a corregir el error",
    "Que es obligatoria",
    "Que solo sirve después del torneo"
   ],
   "correcta": 1,
   "explicacion": "Criticarse con dureza, en vez de ayudar, generalmente produce el efecto contrario cuando no conduce a corregir el error."
  },
  {
   "ficha": "bandera-y-mate-posible",
   "texto": "Partida estándar. A las blancas se les termina el tiempo; tienen rey y dos torres, y las negras solo rey y caballo. Nadie había dado mate ni ofrecido tablas. ¿Qué haces primero?",
   "opciones": [
    "Declarar tablas: rey y caballo no dan mate",
    "Comprobar si existe alguna serie de jugadas legales con la que las negras puedan dar mate",
    "Dar la victoria a las negras sin más análisis",
    "Preguntar a los jugadores qué opinan"
   ],
   "correcta": 1,
   "explicacion": "Art. 6.9: el jugador sin tiempo pierde, salvo que el rival no pueda darle mate con ninguna serie de jugadas legales. Hay que buscar esa serie; con piezas blancas que pueden encerrar a su propio rey, suele existir."
  },
  {
   "ficha": "bandera-y-mate-posible",
   "texto": "¿Qué significa «ninguna serie posible de jugadas legales» en el art. 6.9?",
   "opciones": [
    "Que el rival no pueda ganar con juego correcto",
    "Que no exista ninguna secuencia legal, por mala que sea, que termine en mate",
    "Que el rival no tenga material para forzar el mate",
    "Que el motor de análisis dé tablas"
   ],
   "correcta": 1,
   "explicacion": "La regla no pregunta por el juego correcto: basta una secuencia legal, aunque sea absurda, que acabe en mate. Si existe, el jugador sin tiempo pierde."
  },
  {
   "ficha": "bandera-y-mate-posible",
   "texto": "Al jugador que se le acaba el tiempo, en ese mismo instante, acababa de dar mate con su última jugada (completada). ¿Resultado?",
   "opciones": [
    "Pierde por tiempo",
    "Gana: el mate terminó la partida antes",
    "Tablas",
    "Decide el árbitro según su criterio"
   ],
   "correcta": 1,
   "explicacion": "Art. 6.9 excluye los casos del art. 5.1.1: el mate termina la partida de inmediato, y la caída posterior no cuenta."
  },
  {
   "ficha": "bandera-y-mate-posible",
   "texto": "Al jugador A se le termina el tiempo. Su rival B solo tiene el rey. ¿Resultado?",
   "opciones": [
    "Gana B",
    "Tablas",
    "Pierde A, porque el tiempo es lo primero",
    "Se juega una partida de desempate"
   ],
   "correcta": 1,
   "explicacion": "Con solo el rey, B no puede dar mate con ninguna serie de jugadas legales. Art. 6.9: tablas."
  },
  {
   "ficha": "bandera-y-mate-posible",
   "texto": "En el caso del Internet Chess Club (negras con torre, alfil, caballo y peón; blancas con rey y caballo; a las negras se les acaba el tiempo), ¿cuál es el resultado correcto?",
   "opciones": [
    "Tablas, porque rey y caballo no dan mate",
    "Ganan las blancas, porque existe una serie legal que termina en mate",
    "Ganan las negras por su ventaja material",
    "Tablas por posición muerta"
   ],
   "correcta": 1,
   "explicacion": "Existe 1…Rb5 2.Rd5 Ra4 3.Rxc4 Aa3 4.Cb6#. Como las blancas pueden dar mate con jugadas legales, las negras pierden por tiempo (art. 6.9). El servidor declaró tablas y se equivocó."
  },
  {
   "ficha": "bandera-y-mate-posible",
   "texto": "En una competencia oficial de la FIDE en línea, la plataforma declara tablas tras una caída de bandera, pero el rival sí tenía posibilidades de mate. ¿Qué puede pasar?",
   "opciones": [
    "Nada: el resultado automático es definitivo",
    "El árbitro puede modificar el resultado automático",
    "Se repite la partida",
    "Decide la plataforma después de una revisión técnica"
   ],
   "correcta": 1,
   "explicacion": "Reglamento FIDE de Ajedrez en Línea, art. 15.4: si la plataforma declara tablas en contradicción con el art. 4.3 (había posibilidades de mate), el árbitro puede modificar el resultado."
  },
  {
   "ficha": "bandera-y-mate-posible",
   "texto": "Partida rápida sin supervisión adecuada (A.5). Un jugador detiene el reloj y reclama la victoria porque al rival se le cayó la bandera; él solo tiene rey y caballo contra rey y torre. ¿Qué decides?",
   "opciones": [
    "Victoria para quien reclama",
    "Tablas, porque quien reclama no puede dar mate",
    "Continúa la partida",
    "Victoria para quien reclama, con un minuto de sanción"
   ],
   "correcta": 0,
   "explicacion": "Art. A.5.3: es tablas solo si quien reclama no puede dar mate con ninguna serie de jugadas legales. Con rey y caballo contra rey y torre existe una serie legal que termina en mate (por ejemplo, rey negro en a8, torre en b8, rey blanco en b6 y caballo que da jaque en c7), así que gana quien reclama."
  },
  {
   "ficha": "suizo-grupos-flotadores",
   "texto": "Según el Sistema Holandés (2026), ¿cuándo es heterogéneo un grupo de emparejamiento?",
   "opciones": [
    "Cuando tiene un número impar de jugadores",
    "Cuando no todos sus jugadores tienen la misma puntuación",
    "Cuando tiene jugadores de distintas federaciones",
    "Cuando más de la mitad viene de grupos superiores"
   ],
   "correcta": 1,
   "explicacion": "C.04.3, art. 1.3.3: es homogéneo si todos tienen la misma puntuación; si no, heterogéneo."
  },
  {
   "ficha": "suizo-grupos-flotadores",
   "texto": "¿Cómo se llama, en el grupo de destino, al jugador que bajó porque quedó sin pareja en el grupo anterior?",
   "opciones": [
    "Residente",
    "MDP (moved-down player)",
    "Topscorer",
    "Flotante ascendente"
   ],
   "correcta": 1,
   "explicacion": "C.04.3, art. 1.4.1: el descendido, en el grupo de destino, se llama MDP."
  },
  {
   "ficha": "suizo-grupos-flotadores",
   "texto": "En un grupo heterogéneo, ¿qué se empareja primero?",
   "opciones": [
    "Los residentes entre sí",
    "Los MDP con residentes; después, el resto como grupo homogéneo",
    "Los jugadores de mayor rating",
    "Los que tienen preferencia de color absoluta"
   ],
   "correcta": 1,
   "explicacion": "C.04.3, art. 3.3.3: primero el emparejamiento MDP; los residentes que quedan forman el resto, que se empareja como un grupo homogéneo."
  },
  {
   "ficha": "suizo-grupos-flotadores",
   "texto": "Un jugador con 3 puntos juega contra uno con 2½. ¿Qué flotaciones se anotan?",
   "opciones": [
    "Ascendente para el de 3, descendente para el de 2½",
    "Descendente para el de 3, ascendente para el de 2½",
    "Ninguna, la diferencia es solo de medio punto",
    "Descendente para los dos"
   ],
   "correcta": 1,
   "explicacion": "C.04.3, art. 1.4.2: el de mayor clasificación recibe flotación descendente y el otro, ascendente. La edición original definía estas flotaciones al revés."
  },
  {
   "ficha": "suizo-grupos-flotadores",
   "texto": "Un jugador gana por incomparecencia del rival. ¿Recibe flotación?",
   "opciones": [
    "No, porque no jugó",
    "Sí, descendente",
    "Sí, ascendente",
    "Solo si su rival tenía más puntos"
   ],
   "correcta": 1,
   "explicacion": "C.04.3, art. 1.4.3: también recibe flotación descendente quien, sin jugar, suma más puntos que los de una derrota."
  },
  {
   "ficha": "suizo-grupos-flotadores",
   "texto": "¿Qué preferencia de color tiene, para la ronda 2, un jugador que ganó la ronda 1 por incomparecencia?",
   "opciones": [
    "Negras, porque «le tocaban» blancas",
    "Ninguna: no ha jugado partidas",
    "Blancas",
    "La que decida el árbitro"
   ],
   "correcta": 1,
   "explicacion": "C.04.3, art. 1.7.4: quien no ha jugado ninguna partida no tiene preferencia de color; se atiende la del rival."
  },
  {
   "ficha": "suizo-grupos-flotadores",
   "texto": "¿Sigue vigente la regla «un grupo heterogéneo con al menos la mitad de jugadores de grupos superiores se trata como homogéneo»?",
   "opciones": [
    "Sí, es el art. 1.3.3",
    "No: no figura en el Sistema Holandés de 2026",
    "Solo en torneos con menos de 20 jugadores",
    "Solo en la última ronda"
   ],
   "correcta": 1,
   "explicacion": "Esa regla era de una versión antigua del Sistema Holandés. El texto vigente (C.04.3, aplicado desde el 1-feb-2026) trabaja con MDP, emparejamiento MDP, resto y limbo."
  },
  {
   "ficha": "suizo-grupos-flotadores",
   "texto": "Según las Normas Básicas para Sistemas Suizos (C.04.1, 2026), ¿quién no puede recibir el descanso asignado por el emparejamiento (PAB)?",
   "opciones": [
    "Quien tenga la menor puntuación",
    "Quien ya recibió un PAB o ya sumó sin jugar los puntos de una victoria",
    "Quien tenga el rating más bajo",
    "Quien jugó con negras la ronda anterior"
   ],
   "correcta": 1,
   "explicacion": "C.04.1, art. 4: no recibe el PAB quien ya lo recibió o ya obtuvo, en una ronda y sin jugar, tantos puntos como una victoria."
  },
  {
   "ficha": "round-robin-berger",
   "texto": "¿Cuántas partidas tiene un round robin a una vuelta con 19 jugadores?",
   "opciones": [
    "162",
    "171",
    "180",
    "190"
   ],
   "correcta": 1,
   "explicacion": "n(n − 1) ÷ 2 = 19 × 18 ÷ 2 = 171 (19 rondas de 9 partidas). La edición original daba 162 por error."
  },
  {
   "ficha": "round-robin-berger",
   "texto": "¿Cuántas rondas tiene un round robin a una vuelta con 9 jugadores?",
   "opciones": [
    "8",
    "9",
    "10",
    "4"
   ],
   "correcta": 1,
   "explicacion": "Con número impar se usa la tabla del par siguiente (10), que tiene 9 rondas; en cada una descansa un jugador."
  },
  {
   "ficha": "round-robin-berger",
   "texto": "¿Con qué tablas deben hacerse los emparejamientos de un round robin según el Reglamento General de Competencias de la FIDE?",
   "opciones": [
    "Con las tablas Varma",
    "Con las tablas Berger (Anexo 1 de C.05)",
    "Con el Sistema Holandés",
    "Con cualquier tabla que elija el organizador"
   ],
   "correcta": 1,
   "explicacion": "C.05, art. 5.1: con las tablas Berger, ajustadas cuando haga falta para la doble vuelta. Las Varma (Anexo 2) sirven para el sorteo restringido."
  },
  {
   "ficha": "round-robin-berger",
   "texto": "En un round robin, ¿cómo se asignan normalmente los números de los jugadores?",
   "opciones": [
    "Por rating, de mayor a menor",
    "Por sorteo, salvo que las bases digan otra cosa",
    "Por orden alfabético",
    "Por orden de inscripción"
   ],
   "correcta": 1,
   "explicacion": "Los números se sortean (C.05, arts. 6.1 a 6.3); el rating y el título no deciden el número salvo que las bases lo establezcan."
  },
  {
   "ficha": "round-robin-berger",
   "texto": "En la tabla Berger de 8 jugadores, ¿quién juega en la última mesa de la ronda 2?",
   "opciones": [
    "7–8",
    "1–2",
    "8–5",
    "4–5"
   ],
   "correcta": 1,
   "explicacion": "Ronda 2: 8–5, 6–4, 7–3, 1–2. En toda tabla Berger, la última mesa de la ronda 2 es 1–2."
  },
  {
   "ficha": "round-robin-berger",
   "texto": "Un jugador se retira de un round robin de 10 jugadores después de jugar 4 partidas. ¿Qué pasa con sus resultados?",
   "opciones": [
    "Cuentan todos para la clasificación",
    "Quedan en la tabla para el rating, pero no cuentan para la clasificación",
    "Se borran por completo",
    "Sus rivales pendientes ganan 1–0 y cuentan"
   ],
   "correcta": 1,
   "explicacion": "C.05, art. 6.6: con menos del 50 % de las partidas completadas (4 de 9), los resultados quedan para el rating y la historia, pero no cuentan en la clasificación final."
  },
  {
   "ficha": "round-robin-berger",
   "texto": "¿Cuál de estos desempates no debe usarse en un round robin?",
   "opciones": [
    "Sonneborn-Berger",
    "Koya",
    "Buchholz",
    "Encuentro directo"
   ],
   "correcta": 2,
   "explicacion": "C.07 (2026), nota del art. 8: el Buchholz y sus variantes no deben usarse en round robin."
  },
  {
   "ficha": "round-robin-berger",
   "texto": "En un torneo a doble vuelta, ¿qué recomienda el Anexo 1 de C.05?",
   "opciones": [
    "Sortear de nuevo los números para la segunda vuelta",
    "Invertir el orden de las dos últimas rondas de la primera vuelta",
    "Jugar la segunda vuelta con los mismos colores",
    "Usar las tablas Varma en la segunda vuelta"
   ],
   "correcta": 1,
   "explicacion": "Se recomienda invertir las dos últimas rondas de la primera vuelta, para evitar tres partidas seguidas con el mismo color."
  },
  {
   "ficha": "calentamiento-mental",
   "texto": "¿Cuál es el objetivo del calentamiento mental antes de arbitrar?",
   "opciones": [
    "Memorizar las Leyes",
    "Hacer bien el trabajo desde el inicio de la ronda",
    "Evitar hablar con los jugadores",
    "Reducir el número de rondas que arbitras"
   ],
   "correcta": 1,
   "explicacion": "Según el artículo, los calentamientos buscan que el árbitro rinda bien desde el primer minuto, con control de sus emociones."
  },
  {
   "ficha": "calentamiento-mental",
   "texto": "¿Cuántas veces propone repetir cada frase el artículo?",
   "opciones": [
    "Una",
    "Tres",
    "Diez",
    "Las que haga falta hasta creerla"
   ],
   "correcta": 1,
   "explicacion": "La autora propone tres repeticiones de cada frase en los ejercicios."
  },
  {
   "ficha": "calentamiento-mental",
   "texto": "¿Qué frase es un ejemplo de autorresponsabilidad según el artículo?",
   "opciones": [
    "«Los jugadores me ponen nervioso»",
    "«Elijo no responder mal si un jugador me habla con mala actitud»",
    "«No puedo con este torneo»",
    "«El organizador tiene la culpa»"
   ],
   "correcta": 1,
   "explicacion": "Las frases de autorresponsabilidad expresan que eres tú quien elige y tiene el control."
  },
  {
   "ficha": "calentamiento-mental",
   "texto": "¿Por cuál expresión propone el artículo cambiar el «no puedo»?",
   "opciones": [
    "«Tal vez»",
    "«Yo elijo»",
    "«Ya veremos»",
    "«Es imposible»"
   ],
   "correcta": 1,
   "explicacion": "Propone «no lo haré», «yo puedo» y «yo elijo», que dan más poder personal."
  },
  {
   "ficha": "calentamiento-mental",
   "texto": "Según el artículo, ¿cómo se controlan mejor las ideas irracionales?",
   "opciones": [
    "Ignorándolas",
    "Refutándolas con hechos reales",
    "Pensando solo en lo que se desea",
    "Hablándolas con los jugadores"
   ],
   "correcta": 1,
   "explicacion": "Dirigir el pensamiento a lo deseado no basta; cuantos más hechos reales tengas para refutarlas, más fácil es sustituirlas por pensamientos razonables."
  },
  {
   "ficha": "supervision-relojes",
   "texto": "Ritmo de 2 horas por jugador sin incremento. A las 3 horas de ronda, el reloj de las blancas marca 33 minutos y el de las negras 27. ¿Están bien?",
   "opciones": [
    "Sí: 87 + 93 = 180",
    "No: sobran 60 minutos",
    "No: faltan 6 minutos",
    "No se puede saber sin el número de jugadas"
   ],
   "correcta": 0,
   "explicacion": "Consumidos: 120 − 33 = 87 y 120 − 27 = 93; suman 180, el tiempo de la ronda."
  },
  {
   "ficha": "supervision-relojes",
   "texto": "90 minutos + 30 s por jugada (el reloj suma el incremento después de cada jugada). A la hora, cada jugador lleva 34 jugadas; los relojes marcan 74 y 80 minutos. ¿Cuánto ha pensado cada uno?",
   "opciones": [
    "16 y 10 minutos",
    "33 y 27 minutos",
    "17 y 17 minutos",
    "74 y 80 minutos"
   ],
   "correcta": 1,
   "explicacion": "(90 − 74) + 34 × 0,5 = 33 y (90 − 80) + 17 = 27; suman 60, el tiempo de la ronda."
  },
  {
   "ficha": "supervision-relojes",
   "texto": "Un jugador hizo 20 jugadas a 50 segundos cada una con 30 s de incremento (sumado después de cada jugada). ¿Cuánto bajó su reloj?",
   "opciones": [
    "16 min 40 s",
    "10 min",
    "6 min 40 s",
    "6 min 30 s"
   ],
   "correcta": 2,
   "explicacion": "Pensó 16:40 y recibió 10:00 de incremento: el reloj bajó 6:40. La edición original daba 6:30 por error."
  },
  {
   "ficha": "supervision-relojes",
   "texto": "Según las especificaciones FIDE de relojes (C.02, 2026), ¿cuándo debe sumarse el incremento en modo Fischer?",
   "opciones": [
    "Solo a partir de la jugada 40",
    "Antes de la primera jugada",
    "Solo en el último periodo",
    "Cuando lo decida el árbitro"
   ],
   "correcta": 1,
   "explicacion": "C.02, Equipos con componentes electrónicos, art. 3.3.3: el incremento se suma antes de la primera jugada. Por eso, con esos relojes, cada jugador recibe un incremento más que jugadas completadas."
  },
  {
   "ficha": "supervision-relojes",
   "texto": "En tu patrullaje, la suma de los tiempos pensados da 2 minutos menos que el tiempo de la ronda. ¿Qué haces?",
   "opciones": [
    "Le quitas 1 minuto a cada reloj",
    "Buscas la causa antes de ajustar: la suma no dice cuál reloj falla",
    "Le quitas 2 minutos al jugador que va ganando",
    "No haces nada: 2 minutos no importan"
   ],
   "correcta": 1,
   "explicacion": "La suma indica que algo anda mal, pero no en qué reloj. Revisa configuración, incremento y contador, y contrasta con las planillas antes de corregir (art. 6.10)."
  },
  {
   "ficha": "supervision-relojes",
   "texto": "Descubres que un reloj está configurado con un incremento equivocado. ¿Qué dicen las Leyes?",
   "opciones": [
    "Solo un jugador puede detenerlo",
    "Cualquiera de los jugadores o el árbitro lo detiene; el árbitro corrige la configuración y ajusta tiempos y contador",
    "Hay que esperar al final de la partida",
    "Se repite la partida"
   ],
   "correcta": 1,
   "explicacion": "Art. 6.10.2: cualquiera de los jugadores o el árbitro detiene el reloj de inmediato; el árbitro pone la configuración correcta y ajusta con su mejor criterio."
  },
  {
   "ficha": "supervision-relojes",
   "texto": "Durante el patrullaje notas que un jugador olvidó pulsar su reloj. ¿Se lo dices?",
   "opciones": [
    "Sí, para evitar que pierda tiempo",
    "No: el árbitro debe abstenerse de avisarlo",
    "Solo si está en apuro de tiempo",
    "Solo si su rival está de acuerdo"
   ],
   "correcta": 1,
   "explicacion": "Art. 12.6: el árbitro se abstiene de informar a un jugador de que su rival completó una jugada o de que no pulsó su reloj."
  },
  {
   "ficha": "supervision-relojes",
   "texto": "¿Por qué ya no se recomienda poner los relojes analógicos un minuto antes «para que la bandera caiga clara»?",
   "opciones": [
    "Porque los relojes analógicos están prohibidos",
    "Porque cambia el tiempo asignado, que debe fijarse de antemano",
    "Porque la bandera nunca falla",
    "Porque lo prohíbe el art. 12.6"
   ],
   "correcta": 1,
   "explicacion": "Art. 6.3.1: el tiempo asignado se especifica de antemano. Si una bandera está defectuosa, el reloj se sustituye (art. 6.10.1)."
  },
  {
   "ficha": "reloj-programacion-sanciones",
   "texto": "Partida estándar. Un jugador reclama tablas por triple repetición y el reclamo es incorrecto. ¿Qué sanción corresponde?",
   "opciones": [
    "3 minutos más al rival",
    "2 minutos más al rival",
    "1 minuto más al rival",
    "Pierde la partida"
   ],
   "correcta": 1,
   "explicacion": "Art. 9.5.3: el árbitro suma dos minutos al tiempo del rival. Los 3 minutos eran de las Leyes anteriores a 2014."
  },
  {
   "ficha": "reloj-programacion-sanciones",
   "texto": "La misma situación (reclamo incorrecto de repetición), pero en una partida rápida. ¿Cuánto se suma al rival?",
   "opciones": [
    "2 minutos",
    "1 minuto",
    "30 segundos",
    "Nada"
   ],
   "correcta": 1,
   "explicacion": "Art. A.3: en rápidas y relámpago, las penalizaciones de los arts. 7 y 9 son de un minuto en vez de dos."
  },
  {
   "ficha": "reloj-programacion-sanciones",
   "texto": "Tras corregir una jugada ilegal descubierta tarde, ajustas los tiempos según tu criterio. ¿Qué más debes hacer?",
   "opciones": [
    "Nada más",
    "Dar 2 minutos al rival del infractor y ajustar el contador de jugadas",
    "Restar 2 minutos a los dos jugadores",
    "Declarar la partida perdida"
   ],
   "correcta": 1,
   "explicacion": "Arts. 7.1 y 7.5.5: además de fijar tiempos y contador, por la primera jugada ilegal completada el rival recibe 2 minutos."
  },
  {
   "ficha": "reloj-programacion-sanciones",
   "texto": "En un torneo de nivel L1 de la FIDE, ¿qué relojes deben usarse?",
   "opciones": [
    "Cualquier reloj electrónico",
    "Productos avalados por la FIDE, salvo dispensa del Consejo",
    "Relojes analógicos",
    "Los que traigan los jugadores"
   ],
   "correcta": 1,
   "explicacion": "C.02, Reglas generales, art. 8.1: en L1 se exigen productos avalados, salvo dispensa del Consejo; si no hay avalados, el organizador puede usar productos aceptados."
  },
  {
   "ficha": "reloj-programacion-sanciones",
   "texto": "En el Game Time II activaste ACCUM para un ritmo de 40 jugadas en 90 min + 30 min con 30 s por jugada desde la primera. ¿Qué falta?",
   "opciones": [
    "Nada",
    "Activar ACCUM ALL, porque de fábrica el incremento solo actúa en el periodo final",
    "Activar DELAY",
    "Poner GAME END en 40"
   ],
   "correcta": 1,
   "explicacion": "Según el manual del fabricante, el ACCUM se aplica de fábrica solo al periodo final (SUDDEN); para incremento en todos los periodos hay que activar ACCUM ALL."
  },
  {
   "ficha": "reloj-programacion-sanciones",
   "texto": "¿Qué es el modo de retardo (delay) según las Leyes?",
   "opciones": [
    "Un tiempo que se suma al reloj después de cada jugada",
    "Un tiempo extra fijo por jugada que se consume antes de que empiece a descontarse el tiempo principal",
    "Un minuto extra al final de la partida",
    "Una pausa del árbitro"
   ],
   "correcta": 1,
   "explicacion": "Art. 6.3.2: en el modo de retardo, el tiempo principal solo empieza a descontarse cuando se agota el tiempo extra fijo; si el jugador pulsa antes, su tiempo principal no cambia."
  },
  {
   "ficha": "reloj-programacion-sanciones",
   "texto": "¿Qué precisión exigen las especificaciones FIDE a un reloj digital?",
   "opciones": [
    "±1 segundo por hora",
    "±1 minuto por hora",
    "±5 segundos por partida",
    "No hay requisito"
   ],
   "correcta": 0,
   "explicacion": "C.02, Equipos con componentes electrónicos, art. 3.1.10: tolerancia máxima de ±1 segundo por hora en una prueba de dos horas."
  },
  {
   "ficha": "prefacio-leyes",
   "texto": "Un caso no está regulado con precisión por ningún artículo. ¿Qué indica el prefacio?",
   "opciones": [
    "Decidir por sorteo",
    "Llegar a una decisión estudiando situaciones análogas que sí están reguladas",
    "Consultar siempre a la FIDE antes de seguir",
    "Aplicar la sanción más dura"
   ],
   "correcta": 1,
   "explicacion": "Art. 0.2: debe poder llegarse a una decisión correcta estudiando situaciones análogas reguladas en las Leyes."
  },
  {
   "ficha": "prefacio-leyes",
   "texto": "¿Qué tres cualidades suponen las Leyes en el árbitro?",
   "opciones": [
    "Rapidez, firmeza y simpatía",
    "Competencia, buen juicio y objetividad absoluta",
    "Título, experiencia y rating",
    "Autoridad, severidad y memoria"
   ],
   "correcta": 1,
   "explicacion": "Art. 0.2: competencia, buen juicio (sound judgement) y objetividad absoluta."
  },
  {
   "ficha": "prefacio-leyes",
   "texto": "¿Por qué las Leyes evitan reglas demasiado detalladas?",
   "opciones": [
    "Porque serían difíciles de traducir",
    "Porque quitarían al árbitro la libertad de buscar la solución que dicten la equidad, la lógica y los factores especiales",
    "Porque la FIDE no tiene tiempo de escribirlas",
    "Porque cada federación debe hacer las suyas"
   ],
   "correcta": 1,
   "explicacion": "Art. 0.2: una regla demasiado detallada podría privar al árbitro de su libertad de criterio."
  },
  {
   "ficha": "prefacio-leyes",
   "texto": "¿Qué condición pone el prefacio para que una partida se evalúe para el rating FIDE?",
   "opciones": [
    "Que la arbitre un Árbitro Internacional",
    "Que se juegue según las Leyes de la FIDE",
    "Que dure al menos 4 horas",
    "Que se juegue con tablero electrónico"
   ],
   "correcta": 1,
   "explicacion": "Art. 0.2: es condición necesaria que se juegue según las Leyes de la FIDE."
  },
  {
   "ficha": "prefacio-leyes",
   "texto": "Si hay diferencias entre la traducción al español y el original, ¿qué texto prevalece?",
   "opciones": [
    "El español",
    "El inglés",
    "El de la federación local",
    "El más reciente publicado"
   ],
   "correcta": 1,
   "explicacion": "Art. 0.1: el texto en inglés es la versión auténtica de las Leyes."
  },
  {
   "ficha": "prefacio-leyes",
   "texto": "¿Qué relación tiene el prefacio con el art. 12.9?",
   "opciones": [
    "Ninguna",
    "Como las Leyes confían en el criterio del árbitro, el 12.9 le da un abanico de sanciones en lugar de una sanción fija por falta",
    "El 12.9 deroga el prefacio",
    "El 12.9 fija una sanción para cada falta"
   ],
   "correcta": 1,
   "explicacion": "El art. 12.9 ofrece varias opciones (advertencia, tiempo, puntos, pérdida, multa, exclusión, expulsión) para que el árbitro elija con su criterio."
  },
  {
   "ficha": "conducta-en-sala",
   "texto": "Con intención de enrocar, un jugador toca deliberadamente primero la torre de h1 y luego su rey. ¿Qué pasa?",
   "opciones": [
    "Debe enrocar corto",
    "No puede enrocar por ese lado en esa jugada y debe mover la torre si puede (art. 4.3.1)",
    "Puede elegir cualquier jugada",
    "Pierde la partida"
   ],
   "correcta": 1,
   "explicacion": "Art. 4.4.2: tocar deliberadamente primero la torre y luego el rey impide enrocar por ese lado en esa jugada; se aplica el 4.3.1."
  },
  {
   "ficha": "conducta-en-sala",
   "texto": "Un padre ve que el rival de su hijo hizo una jugada ilegal y se acerca a la mesa a decirlo. ¿Qué dicen las Leyes?",
   "opciones": [
    "Puede decírselo a su hijo",
    "Solo puede informar al árbitro; los espectadores no intervienen en la partida",
    "Puede detener el reloj",
    "Puede reclamar en nombre de su hijo"
   ],
   "correcta": 1,
   "explicacion": "Art. 12.7: quien observe una irregularidad solo puede informar al árbitro; los espectadores no pueden intervenir."
  },
  {
   "ficha": "conducta-en-sala",
   "texto": "Un entrenador usa su teléfono en la sala de juego, sin autorización. ¿Qué norma se aplica?",
   "opciones": [
    "Ninguna, porque no es jugador",
    "El art. 12.8: sin autorización del árbitro, nadie puede usar un teléfono en la sala",
    "Solo las bases del torneo",
    "El art. 4.4"
   ],
   "correcta": 1,
   "explicacion": "Art. 12.8: salvo autorización del árbitro, está prohibido para cualquier persona usar un teléfono u otro aparato de comunicación en la sala o zonas contiguas designadas."
  },
  {
   "ficha": "conducta-en-sala",
   "texto": "¿Puede un jugador apelar una decisión del árbitro después de haber firmado la planilla?",
   "opciones": [
    "No, firmar la planilla cierra el asunto",
    "Sí, salvo que las bases digan otra cosa",
    "Solo si gana la partida",
    "Solo con permiso del rival"
   ],
   "correcta": 1,
   "explicacion": "Art. 11.10: el jugador puede apelar cualquier decisión del árbitro aunque haya firmado la planilla, salvo que las bases del evento digan otra cosa."
  },
  {
   "ficha": "conducta-en-sala",
   "texto": "¿Qué es el «síndrome de la mesa 1»?",
   "opciones": [
    "Que los mejores jugadores se quejen más",
    "La tendencia del árbitro nuevo a quedarse en la mesa de los mejores y descuidar las demás",
    "Un tipo de desempate",
    "La costumbre de empezar la ronda por la mesa 1"
   ],
   "correcta": 1,
   "explicacion": "Según Carlos Calleros, los árbitros nuevos se quedan junto a la mesa 1; pero todas las mesas son importantes y un problema puede aparecer en cualquiera (arts. 12.2 y 12.3)."
  },
  {
   "ficha": "conducta-en-sala",
   "texto": "Un jugador hace el enroque moviendo el rey con una mano y la torre con la otra. ¿Qué artículo infringe?",
   "opciones": [
    "El 4.1: cada jugada se hace con una sola mano",
    "El 4.4.2",
    "El 12.8",
    "Ninguno"
   ],
   "correcta": 0,
   "explicacion": "Art. 4.1: cada jugada debe hacerse con una sola mano. (El art. 7.5.4 sanciona como jugada ilegal hacerlo con las dos manos y pulsar el reloj.)"
  },
  {
   "ficha": "habilidades-psicologicas",
   "texto": "¿Qué habilidad permite mantener la confianza y la eficacia bajo presión?",
   "opciones": [
    "Creatividad",
    "Tolerancia a la frustración",
    "Energía",
    "Adaptabilidad"
   ],
   "correcta": 1,
   "explicacion": "Según el artículo, la tolerancia a la frustración es mantener la acción y la confianza firmes bajo presión."
  },
  {
   "ficha": "habilidades-psicologicas",
   "texto": "Ser eficaz cuando cambian las circunstancias del torneo corresponde a…",
   "opciones": [
    "Resistencia",
    "Adaptabilidad",
    "Iniciativa",
    "Automotivación"
   ],
   "correcta": 1,
   "explicacion": "La adaptabilidad es ser eficaz en un entorno cambiante."
  },
  {
   "ficha": "habilidades-psicologicas",
   "texto": "Identificar un problema, sus causas y la solución en poco tiempo y con pocas consecuencias negativas es…",
   "opciones": [
    "Análisis de problemas",
    "Energía",
    "Creatividad",
    "Resistencia"
   ],
   "correcta": 0,
   "explicacion": "Así define el artículo el análisis de problemas."
  },
  {
   "ficha": "habilidades-psicologicas",
   "texto": "Actuar de forma activa en vez de aceptar pasivamente lo que pasa es…",
   "opciones": [
    "Iniciativa",
    "Tolerancia a la frustración",
    "Adaptabilidad",
    "Energía"
   ],
   "correcta": 0,
   "explicacion": "La iniciativa da lugar a la acción eficaz en vez de ser víctima de las situaciones."
  },
  {
   "ficha": "habilidades-psicologicas",
   "texto": "Según la autora, ¿por qué conviene conocer estas habilidades?",
   "opciones": [
    "Porque lo exige la FIDE",
    "Porque de ellas depende el éxito en las metas que te propongas",
    "Para aprobar el seminario de árbitros",
    "Para evaluar a los jugadores"
   ],
   "correcta": 1,
   "explicacion": "El artículo señala que de esas habilidades depende el éxito en las metas, y que conocerlas permite aprovecharlas."
  },
  {
   "ficha": "ajedrez960-posicion",
   "texto": "¿Dónde están hoy las reglas del Ajedrez960 dentro de las Leyes del Ajedrez?",
   "opciones": [
    "En el Apéndice A",
    "En las Directrices II",
    "En el Apéndice D",
    "No están en las Leyes"
   ],
   "correcta": 1,
   "explicacion": "Las Leyes 2023 las recogen en las Directrices II, «Reglas del Ajedrez960»."
  },
  {
   "ficha": "ajedrez960-posicion",
   "texto": "¿Cuál de estas posiciones blancas NO es una posición inicial válida de Ajedrez960?",
   "opciones": [
    "TCADRACT",
    "RTCAADCT",
    "CDTRAATC",
    "TACRTDAC"
   ],
   "correcta": 1,
   "explicacion": "Directrices II.2.1: el rey debe estar entre las dos torres. Con el rey en a1 no puede haber una torre a cada lado."
  },
  {
   "ficha": "ajedrez960-posicion",
   "texto": "En la posición sorteada las blancas tienen una torre en b1. ¿Dónde debe estar una torre negra?",
   "opciones": [
    "En g8",
    "En b8",
    "En b7",
    "Donde salga en otro sorteo"
   ],
   "correcta": 1,
   "explicacion": "Directrices II.2.3: las negras se colocan en espejo frente a las blancas."
  },
  {
   "ficha": "ajedrez960-posicion",
   "texto": "¿Por qué son 960 posiciones y no 1920?",
   "opciones": [
    "Porque se descartan las posiciones con el rey en el centro",
    "Porque los dos caballos son iguales",
    "Porque los alfiles deben estar juntos",
    "Porque se cuentan solo las blancas"
   ],
   "correcta": 1,
   "explicacion": "Si se distinguieran los caballos habría 1920; como son iguales, cada colocación se repite dos veces y quedan 960."
  },
  {
   "ficha": "ajedrez960-posicion",
   "texto": "Sorteo con dado para el alfil de casillas oscuras: sale un 6. ¿Qué haces?",
   "opciones": [
    "Lo pongo en h1",
    "Repito el lanzamiento",
    "Lo pongo en a1",
    "Paso a la dama"
   ],
   "correcta": 1,
   "explicacion": "Solo valen 1-4 (a1, c1, e1, g1); con 5 o 6 se repite el lanzamiento."
  },
  {
   "ficha": "ajedrez960-posicion",
   "texto": "¿Qué número tiene la posición inicial del ajedrez clásico en la numeración estándar?",
   "opciones": [
    "SP 0",
    "SP 518",
    "SP 652",
    "SP 959"
   ],
   "correcta": 1,
   "explicacion": "La posición TCADRACT es la SP 518."
  },
  {
   "ficha": "ajedrez960-posicion",
   "texto": "Después de sortear la posición inicial, ¿qué reglas se aplican al resto de la partida?",
   "opciones": [
    "Reglas especiales de Ajedrez960 para todo",
    "Las Leyes del Ajedrez, salvo la posición inicial y el enroque",
    "Las del torneo, que deben escribirse en las bases",
    "Las del ajedrez clásico, pero sin enroque"
   ],
   "correcta": 1,
   "explicacion": "Directrices II.1: después del sorteo la partida se juega como el ajedrez normal; solo cambian la posición inicial y el enroque."
  },
  {
   "ficha": "ajedrez960-enroque",
   "texto": "Tras el enroque largo (0-0-0) en Ajedrez960, ¿dónde quedan el rey y la torre blancos?",
   "opciones": [
    "Rey b1, torre c1",
    "Rey c1, torre d1",
    "Depende de la posición inicial",
    "Rey d1, torre c1"
   ],
   "correcta": 1,
   "explicacion": "Directrices II.3.2.6: quedan como en el ajedrez clásico, rey en c1 y torre en d1."
  },
  {
   "ficha": "ajedrez960-enroque",
   "texto": "Posición inicial con el rey en g1 y una torre en h1. ¿Cómo es el enroque corto?",
   "opciones": [
    "Doble movimiento",
    "Trasposición",
    "Solo se mueve la torre, a f1",
    "No se puede enrocar corto"
   ],
   "correcta": 2,
   "explicacion": "El rey ya está en su casilla final (g1); solo se mueve la torre a f1 (método II.3.2.4). f1 debe estar vacía."
  },
  {
   "ficha": "ajedrez960-enroque",
   "texto": "Rey en f1 y torre en g1 en la posición inicial. ¿Se puede enrocar corto en la primera jugada?",
   "opciones": [
    "No, nunca en la primera jugada",
    "Sí, por trasposición, si ninguna casilla del rey está atacada",
    "Solo si antes se mueve un peón",
    "Solo las negras"
   ],
   "correcta": 1,
   "explicacion": "Rey y torre intercambian casillas y no hay casillas intermedias. La nota 3 de II.3.2.7 recuerda que en algunas posiciones el enroque es posible desde la primera jugada."
  },
  {
   "ficha": "ajedrez960-enroque",
   "texto": "¿Cuántas veces puede enrocar cada jugador en una partida de Ajedrez960?",
   "opciones": [
    "Una por cada torre",
    "Una",
    "Ninguna",
    "Las que quiera mientras el rey no se mueva"
   ],
   "correcta": 1,
   "explicacion": "Directrices II.3.1: una vez por partida."
  },
  {
   "ficha": "ajedrez960-enroque",
   "texto": "¿Cómo recomienda la FIDE ejecutar el enroque de Ajedrez960 en un tablero físico?",
   "opciones": [
    "Mover primero la torre y después el rey sobre el tablero",
    "Sacar el rey del tablero junto a su casilla final, mover la torre y luego colocar el rey",
    "Pedir al árbitro que lo haga",
    "Mover las dos piezas a la vez con las dos manos"
   ],
   "correcta": 1,
   "explicacion": "Directrices II.3.2.5: rey fuera del tablero junto a su casilla final, luego la torre, luego el rey."
  },
  {
   "ficha": "ajedrez960-enroque",
   "texto": "El rey blanco está en e1 y la casilla f1 está atacada por un alfil negro. ¿Puede enrocar corto con la torre de h1?",
   "opciones": [
    "Sí, en Ajedrez960 no importa",
    "No: el rey cruzaría una casilla atacada",
    "Sí, si la torre no está atacada",
    "Solo con permiso del árbitro"
   ],
   "correcta": 1,
   "explicacion": "Como en el ajedrez clásico (art. 3.8), el rey no puede enrocar si está en jaque ni cruzar o llegar a una casilla atacada."
  },
  {
   "ficha": "ajedrez960-enroque",
   "texto": "Tras el enroque largo, ¿puede seguir ocupada la casilla a1?",
   "opciones": [
    "No, nunca",
    "Sí, puede",
    "Solo si es un alfil",
    "Solo en el enroque corto"
   ],
   "correcta": 1,
   "explicacion": "Nota 5 de II.3.2.7: tras 0-0-0 pueden quedar ocupadas a1, b1 y/o e1, si no son casillas que recorren el rey o la torre."
  },
  {
   "ficha": "suizo-descanso-subgrupos",
   "texto": "Con las reglas vigentes (2026), ¿cuántos puntos recibe por defecto el jugador con descanso asignado por el emparejamiento?",
   "opciones": [
    "Medio punto",
    "Cero",
    "Los mismos que por una victoria, salvo que el reglamento diga otra cosa",
    "Los que decida el árbitro en cada ronda"
   ],
   "correcta": 2,
   "explicacion": "C.04.1 art. 3: tantos puntos como una victoria, salvo que el reglamento del torneo diga otra cosa, y lo mismo para todos los PAB."
  },
  {
   "ficha": "suizo-descanso-subgrupos",
   "texto": "Un jugador ganó en la ronda 3 por incomparecencia de su rival. En la ronda 6 el número es impar. ¿Puede recibir el PAB?",
   "opciones": [
    "Sí, si es el de menor puntuación",
    "No: ya sumó sin jugar los puntos de una victoria",
    "Sí, porque no fue un PAB",
    "Solo si lo pide"
   ],
   "correcta": 1,
   "explicacion": "C.04.1 art. 4 y criterio [C2]: no lo recibe quien ya sumó, en una sola ronda y sin jugar, los puntos de una victoria."
  },
  {
   "ficha": "suizo-descanso-subgrupos",
   "texto": "Ronda 1, 61 jugadores ordenados por rating. ¿Quién recibe el PAB?",
   "opciones": [
    "El número 1",
    "El número 31",
    "El número 61",
    "Se sortea"
   ],
   "correcta": 2,
   "explicacion": "Un solo grupo de 61: MaxPairs = 30, S1 = 1-30, S2 = 31-61. Se forman 1-31… 30-60 y queda el 61."
  },
  {
   "ficha": "suizo-descanso-subgrupos",
   "texto": "¿Qué es un MDP en el Sistema Holandés?",
   "opciones": [
    "Un jugador que pidió descanso",
    "Un jugador que bajó desde un grupo de más puntos",
    "El jugador de más rating del grupo",
    "Un jugador retirado"
   ],
   "correcta": 1,
   "explicacion": "C.04.3 art. 1.4.1: el jugador que quedó sin pareja en un grupo y pasó al siguiente es un moved-down player (MDP)."
  },
  {
   "ficha": "suizo-descanso-subgrupos",
   "texto": "Un grupo homogéneo tiene 7 jugadores. ¿Cuánto vale MaxPairs y cuántos jugadores van en S1?",
   "opciones": [
    "3 y 3",
    "4 y 4",
    "3 y 4",
    "7 y 3"
   ],
   "correcta": 0,
   "explicacion": "MaxPairs = 7 ÷ 2 redondeado hacia abajo = 3. En un grupo homogéneo, S1 son los primeros MaxPairs jugadores (art. 3.2.2); el de más queda en S2."
  },
  {
   "ficha": "suizo-descanso-subgrupos",
   "texto": "Grupo con residentes 1-6 y el MDP 7. Tras emparejar 7-1, ¿qué parejas propone el resto?",
   "opciones": [
    "2-4, 2-5 y el 6 flota",
    "2-4, 3-5 y el 6 flota",
    "2-3, 4-5 y el 6 flota",
    "2-6, 3-5 y el 4 flota"
   ],
   "correcta": 1,
   "explicacion": "El resto (2-6) se empareja como homogéneo: MaxPairs = 2, S1 = {2, 3}, S2 = {4, 5, 6}. Primero de S1 con primero de S2: 2-4 y 3-5."
  },
  {
   "ficha": "suizo-descanso-subgrupos",
   "texto": "¿Cuenta como flotante descendente el jugador que recibe el PAB?",
   "opciones": [
    "No, porque no jugó",
    "Sí",
    "Solo si tenía la mayor puntuación",
    "Solo en la última ronda"
   ],
   "correcta": 1,
   "explicacion": "C.04.3 art. 1.4.3: reciben flotante descendente quien recibe el PAB y quien, sin jugar, suma más que una derrota."
  },
  {
   "ficha": "suizo-descanso-subgrupos",
   "texto": "Un jugador avisó antes de la ronda que no jugará. Las bases no dicen nada. ¿Qué recibe?",
   "opciones": [
    "El PAB con 1 punto",
    "Medio punto",
    "Cero puntos; no se empareja",
    "Lo decide el árbitro"
   ],
   "correcta": 2,
   "explicacion": "C.04.2 art. 3.3: no se empareja y suma cero, salvo que el reglamento del torneo diga otra cosa."
  },
  {
   "ficha": "suizo-descanso-subgrupos",
   "texto": "¿Qué criterio busca que el PAB lo reciba alguien con la menor puntuación posible?",
   "opciones": [
    "[C1]",
    "[C3]",
    "[C5]",
    "[C12]"
   ],
   "correcta": 2,
   "explicacion": "[C5] (C.04.3 art. 2.3.1): minimizar la puntuación de quien recibe el PAB."
  },
  {
   "ficha": "registro-licencia-fide",
   "texto": "Un jugador inscrito no tiene número FIDE. ¿Qué debe ocurrir antes de enviar el torneo para rating?",
   "opciones": [
    "Nada: se evalúa sin él",
    "Su federación debe registrarlo y el FIN debe existir antes del envío",
    "Se le asigna un número provisional del torneo",
    "Se elimina del torneo"
   ],
   "correcta": 1,
   "explicacion": "B.03 arts. 1.19 y 2.12.1: un torneo puede no evaluarse con jugadores sin FIN válido; el FIN debe existir antes de enviarlo."
  },
  {
   "ficha": "registro-licencia-fide",
   "texto": "¿Cuánto cuesta según el B.03 la licencia provisional bajo bandera FIDE?",
   "opciones": [
    "25 €",
    "60 €",
    "100 €",
    "Es gratuita"
   ],
   "correcta": 2,
   "explicacion": "B.03 arts. 2.6-2.8: 100 €. Los 60 € eran de la propuesta de 2013."
  },
  {
   "ficha": "registro-licencia-fide",
   "texto": "¿Cuándo vence la licencia provisional bajo bandera FIDE?",
   "opciones": [
    "A los 12 meses de pagarla",
    "El 31 de diciembre",
    "El 30 de junio del año siguiente",
    "No vence"
   ],
   "correcta": 2,
   "explicacion": "B.03 art. 2.7: vence el 30 de junio del año siguiente y se renueva antes del 1 de julio."
  },
  {
   "ficha": "registro-licencia-fide",
   "texto": "Una federación da de baja a un jugador y luego lo vuelve a registrar. ¿Qué paga a la FIDE?",
   "opciones": [
    "Nada",
    "20 €",
    "25 €",
    "100 €"
   ],
   "correcta": 2,
   "explicacion": "B.03 art. 2.4: 25 € cada vez que da de baja y vuelve a registrar a un jugador."
  },
  {
   "ficha": "registro-licencia-fide",
   "texto": "¿Puede un jugador tener dos números FIDE?",
   "opciones": [
    "Sí, uno por federación",
    "No: el FIN es único",
    "Sí, si cambia de federación",
    "Solo los menores de 14 años"
   ],
   "correcta": 1,
   "explicacion": "B.03 art. 1.3: el FIN es único. Con dos FIN se cobran 20 € y no se evalúan las partidas del segundo (art. 1.4)."
  },
  {
   "ficha": "registro-licencia-fide",
   "texto": "Según el documento del Consejo FIDE de 2024, ¿quién queda exento de la cuota anual de 100 € de la bandera FIDE?",
   "opciones": [
    "Los menores de 14 años",
    "Los refugiados",
    "Los jugadores de menos de 2200",
    "Nadie"
   ],
   "correcta": 1,
   "explicacion": "«Special cases for obtaining FIDE flag» (2024): pagan 100 € al año, excepto los refugiados."
  },
  {
   "ficha": "error-arbitral",
   "texto": "Según el artículo, ¿qué pasa si un árbitro se equivoca a propósito para compensar un error anterior?",
   "opciones": [
    "Repara el daño",
    "Se equivoca dos veces y quedan inconformes ambas partes",
    "Es lo recomendable",
    "Solo importa si alguien apela"
   ],
   "correcta": 1,
   "explicacion": "Compensar un error con otro no repara nada: son dos errores, con dos partes inconformes."
  },
  {
   "ficha": "error-arbitral",
   "texto": "¿Qué tipo de error considera el artículo menos grave si es esporádico?",
   "opciones": [
    "El cometido por presión de terceros",
    "El cometido con dolo",
    "El cometido por desconocimiento",
    "El cometido para compensar otro"
   ],
   "correcta": 2,
   "explicacion": "El error por desconocimiento (reglas nuevas, poca experiencia) se corrige estudiando, siempre que no se repita."
  },
  {
   "ficha": "error-arbitral",
   "texto": "Un jugador no está de acuerdo con una decisión del árbitro. ¿Cuál es hoy el cauce habitual?",
   "opciones": [
    "Discutir con el árbitro hasta convencerlo",
    "Apelar ante el Comité de Apelación del torneo",
    "Abandonar la sala",
    "Escribir a la FIDE durante la partida"
   ],
   "correcta": 1,
   "explicacion": "La mayoría de las decisiones del árbitro se pueden apelar ante el Comité de Apelación (Handbook, C.11)."
  },
  {
   "ficha": "error-arbitral",
   "texto": "Un árbitro nota que está cometiendo errores por cansancio. ¿Qué recomienda el artículo?",
   "opciones": [
    "Seguir igual: es normal",
    "Descansar más, cuidar la alimentación y trabajar la concentración",
    "Delegar todas las decisiones",
    "Dejar de arbitrar"
   ],
   "correcta": 1,
   "explicacion": "El artículo propone descansar, asesorarse en nutrición y trabajar la concentración, o todo a la vez."
  },
  {
   "ficha": "error-arbitral",
   "texto": "¿Qué reglamento FIDE regula hoy la conducta y las sanciones de los árbitros?",
   "opciones": [
    "Las Leyes del Ajedrez, art. 12",
    "El Reglamento Disciplinario de Árbitros (B.06.5)",
    "El reglamento de rating",
    "No existe ninguno"
   ],
   "correcta": 1,
   "explicacion": "El B.06.5, FIDE Arbiter Disciplinary Regulations, en vigor desde el 1-jul-2026 según el Handbook."
  },
  {
   "ficha": "preferencia-color",
   "texto": "Historial BNBNN. ¿Qué preferencia de color tiene?",
   "opciones": [
    "Fuerte a blancas",
    "Absoluta a blancas",
    "Leve a blancas",
    "Absoluta a negras"
   ],
   "correcta": 1,
   "explicacion": "Art. 1.7.1: la diferencia es −1, pero jugó las dos últimas partidas con negras, así que la preferencia es absoluta a blancas."
  },
  {
   "ficha": "preferencia-color",
   "texto": "Historial NBN-BN. ¿Qué preferencia tiene?",
   "opciones": [
    "Fuerte a negras",
    "Fuerte a blancas",
    "Absoluta a blancas",
    "Leve a negras"
   ],
   "correcta": 1,
   "explicacion": "Ordenado: -NBNBN. Diferencia 2 − 3 = −1, y las dos últimas no se repiten: preferencia fuerte a blancas (art. 1.7.2)."
  },
  {
   "ficha": "preferencia-color",
   "texto": "Historial BNBN-N. ¿Qué preferencia tiene?",
   "opciones": [
    "Fuerte a blancas",
    "Leve a blancas",
    "Absoluta a blancas",
    "Sin preferencia"
   ],
   "correcta": 2,
   "explicacion": "Solo cuentan las partidas jugadas (C.04.2 art. 3.4): -BNBNN. Las dos últimas jugadas fueron con negras: absoluta a blancas."
  },
  {
   "ficha": "preferencia-color",
   "texto": "Historial NB- (perdió por incomparecencia en la ronda 3). ¿Qué preferencia tiene para la ronda 4?",
   "opciones": [
    "Leve a blancas",
    "Leve a negras",
    "Fuerte a negras",
    "Sin preferencia"
   ],
   "correcta": 1,
   "explicacion": "Diferencia 0: preferencia leve, alternando con la última partida jugada, que fue con blancas. Leve a negras (art. 1.7.3)."
  },
  {
   "ficha": "preferencia-color",
   "texto": "Un jugador se incorporó en la ronda 3 y todavía no ha jugado ninguna partida. ¿Qué preferencia tiene?",
   "opciones": [
    "Leve a blancas",
    "La del color inicial",
    "Ninguna: se le da a su rival la suya",
    "Absoluta a blancas"
   ],
   "correcta": 2,
   "explicacion": "Art. 1.7.4: quien no ha jugado ninguna partida no tiene preferencia de color."
  },
  {
   "ficha": "preferencia-color",
   "texto": "Historial BB después de dos rondas. ¿Qué preferencia tiene?",
   "opciones": [
    "Fuerte a negras",
    "Absoluta a negras",
    "Leve a negras",
    "Absoluta a blancas"
   ],
   "correcta": 1,
   "explicacion": "Diferencia +2 (mayor que +1) y dos blancas seguidas: absoluta a negras."
  },
  {
   "ficha": "preferencia-color",
   "texto": "A (fuerte a blancas) juega contra B (absoluta a blancas). ¿Quién lleva blancas?",
   "opciones": [
    "A, por estar mejor clasificado",
    "B, porque su preferencia es más fuerte",
    "Se sortea",
    "A, por número inicial impar"
   ],
   "correcta": 1,
   "explicacion": "Art. 5.2.2: si no se pueden dar las dos preferencias, se da la más fuerte."
  },
  {
   "ficha": "preferencia-color",
   "texto": "Los dos jugadores tienen preferencia leve a blancas. A: BNBN; B: NBBN. A está mejor clasificado. ¿Qué regla decide?",
   "opciones": [
    "5.2.3: alternar respecto a la ronda 2, en que A tuvo negras y B blancas; A lleva blancas",
    "5.2.4: A lleva blancas por estar mejor clasificado",
    "5.2.5: color inicial",
    "Se sortea"
   ],
   "correcta": 0,
   "explicacion": "Antes que la clasificación (5.2.4) va el 5.2.3: se busca la ronda más reciente con colores distintos (la 2) y se alternan. A tuvo negras, así que ahora lleva blancas."
  },
  {
   "ficha": "preferencia-color",
   "texto": "¿Siguen vigentes las reglas especiales de «ronda impar» y «ronda par» del sistema holandés antiguo?",
   "opciones": [
    "Sí, las dos",
    "Solo la de ronda impar",
    "No: el C.04.3 vigente no las contiene",
    "Solo en torneos de más de 9 rondas"
   ],
   "correcta": 2,
   "explicacion": "El sistema holandés aplicado desde el 1-feb-2026 no tiene esas reglas; los conflictos de color se ordenan con los criterios [C3] y [C10]-[C13]."
  },
  {
   "ficha": "posicion-muerta-n14",
   "texto": "¿Qué es una posición muerta según las Leyes vigentes?",
   "opciones": [
    "Una posición de tablas teóricas",
    "Una en la que ningún jugador puede dar mate con ninguna serie de jugadas legales",
    "Una en la que nadie puede ganar jugando bien",
    "Una con material igual"
   ],
   "correcta": 1,
   "explicacion": "Art. 5.2.2. No importa la teoría ni el buen juego: basta con que exista alguna serie legal que termine en mate para que no esté muerta."
  },
  {
   "ficha": "posicion-muerta-n14",
   "texto": "Rey y alfil contra rey y alfil, con los alfiles en casillas de distinto color. ¿Está muerta la posición?",
   "opciones": [
    "Sí",
    "No: los dos pueden dar mate con una serie legal",
    "Solo si los reyes están lejos",
    "Depende del turno"
   ],
   "correcta": 1,
   "explicacion": "Con alfiles de distinto color existen posiciones de mate (por ejemplo, el rey en la esquina tapado por su propio alfil). No es posición muerta."
  },
  {
   "ficha": "posicion-muerta-n14",
   "texto": "Rey y alfil contra rey y alfil, alfiles del mismo color. ¿Qué haces?",
   "opciones": [
    "Nada, hasta que alguien reclame",
    "Declaras tablas: es una posición muerta",
    "Esperas 50 jugadas",
    "Pides a los jugadores que acuerden tablas"
   ],
   "correcta": 1,
   "explicacion": "Art. 5.2.2: con los alfiles en casillas del mismo color no hay mate posible para nadie. La partida termina de inmediato."
  },
  {
   "ficha": "posicion-muerta-n14",
   "texto": "Rey y caballo contra rey y caballo. Cae la bandera de las blancas. ¿Resultado?",
   "opciones": [
    "Tablas: es un final teórico de tablas",
    "Ganan las negras: tienen una serie legal que da mate",
    "Tablas por posición muerta",
    "Se repite la partida"
   ],
   "correcta": 1,
   "explicacion": "Art. 6.9: pierde quien se queda sin tiempo, salvo que el rival no pueda dar mate con ninguna serie legal. Con rey y caballo contra rey y caballo ese mate existe."
  },
  {
   "ficha": "posicion-muerta-n14",
   "texto": "Rey y caballo contra rey solo. Cae la bandera del jugador del caballo. ¿Resultado?",
   "opciones": [
    "Gana el del rey solo",
    "Tablas",
    "Gana el del caballo",
    "Se sigue jugando"
   ],
   "correcta": 1,
   "explicacion": "El rey solo no puede dar mate; además, rey y caballo contra rey es una posición muerta (art. 5.2.2)."
  },
  {
   "ficha": "posicion-muerta-n14",
   "texto": "Un jugador pide «tablas teóricas» en un final de rey y caballo contra rey y caballo. ¿Qué haces?",
   "opciones": [
    "Las concedes",
    "Indicas que la partida continúa",
    "Le das 2 minutos al rival",
    "Le adviertes por molestar"
   ],
   "correcta": 1,
   "explicacion": "Las «tablas teóricas» no existen en las Leyes. La posición no está muerta, así que la partida sigue."
  },
  {
   "ficha": "posicion-muerta-n14",
   "texto": "Después de declarar que la posición no está muerta, ¿debes explicar a los jugadores cómo podría darse el mate?",
   "opciones": [
    "Sí, siempre",
    "No durante la partida: solo indicas que siga",
    "Solo al jugador que reclamó",
    "Solo si lo piden los dos"
   ],
   "correcta": 1,
   "explicacion": "Explicar la posición durante la partida sería ayudar a un jugador. Dices «sigan jugando»; la demostración se da después, si la partida termina por tiempo y hay que justificar el art. 6.9."
  },
  {
   "ficha": "posicion-muerta-n14",
   "texto": "¿Qué diferencia hay entre el art. 5.2.2 y el art. 6.9?",
   "opciones": [
    "Ninguna",
    "El 5.2.2 mira si alguno de los dos puede dar mate; el 6.9 mira solo si puede darlo el rival del que se quedó sin tiempo",
    "El 6.9 solo se aplica en relámpago",
    "El 5.2.2 requiere reclamación"
   ],
   "correcta": 1,
   "explicacion": "La posición muerta exige que nadie pueda dar mate; el 6.9 solo pregunta por el rival de quien perdió en el reloj."
  },
  {
   "ficha": "reclamo-tablas",
   "texto": "La misma posición aparece por tercera vez y nadie reclama. ¿Qué hace el árbitro?",
   "opciones": [
    "Declara tablas",
    "Nada: la triple repetición requiere reclamación",
    "Advierte a los jugadores",
    "Detiene el reloj"
   ],
   "correcta": 1,
   "explicacion": "Art. 9.2: tablas a reclamación correcta del jugador con el turno. El árbitro interviene solo a la quinta repetición (art. 9.6.1)."
  },
  {
   "ficha": "reclamo-tablas",
   "texto": "Se cumplen 75 jugadas de cada jugador sin mover peón ni capturar, y la última jugada no es mate. ¿Qué pasa?",
   "opciones": [
    "Hay que reclamar",
    "Tablas automáticas",
    "Nada",
    "Gana quien tenga más material"
   ],
   "correcta": 1,
   "explicacion": "Art. 9.6.2: tablas automáticas, salvo que la última jugada dé mate."
  },
  {
   "ficha": "reclamo-tablas",
   "texto": "Partida estándar con 30 s de incremento. Un jugador con 1:30 en el reloj reclama tablas porque su rival «no se esfuerza por ganar». ¿Qué haces?",
   "opciones": [
    "Aplicas la Directriz III.5",
    "La reclamación no procede: la Directriz III solo rige sin incremento",
    "Le das 2 minutos al rival",
    "Declaras tablas"
   ],
   "correcta": 1,
   "explicacion": "Directriz III.2: solo se aplica en partidas estándar o rápidas sin incremento, y solo si se anunció antes del torneo."
  },
  {
   "ficha": "reclamo-tablas",
   "texto": "¿Se aplica la Directriz III.5 en partidas relámpago?",
   "opciones": [
    "Sí",
    "No",
    "Solo si se anunció",
    "Solo con árbitro por mesa"
   ],
   "correcta": 1,
   "explicacion": "Directriz III.2.2: cubre partidas estándar y rápidas sin incremento, no las relámpago."
  },
  {
   "ficha": "reclamo-tablas",
   "texto": "Partida sin incremento, Directrices III anunciadas. Un jugador con menos de dos minutos pide que se añadan 5 segundos por jugada. ¿Qué significa esa petición?",
   "opciones": [
    "Nada especial",
    "Cuenta como oferta de tablas",
    "Pierde 1 minuto",
    "Obliga a terminar la partida"
   ],
   "correcta": 1,
   "explicacion": "Directriz III.4: pedir el incremento cuenta como oferta de tablas."
  },
  {
   "ficha": "reclamo-tablas",
   "texto": "¿Cómo se reclama una repetición que va a aparecer con la jugada que el jugador piensa hacer?",
   "opciones": [
    "Haciendo la jugada y llamando al árbitro",
    "Escribiendo la jugada en la planilla, sin hacerla, y declarando al árbitro su intención",
    "Diciéndoselo al rival",
    "Deteniendo el reloj y haciendo la jugada"
   ],
   "correcta": 1,
   "explicacion": "Art. 9.2.1: primero se indica la jugada en la planilla (no se puede cambiar) y se declara al árbitro la intención de hacerla."
  },
  {
   "ficha": "reclamo-tablas",
   "texto": "El antiguo art. 10.2 (tablas por falta de esfuerzo con menos de dos minutos) es hoy…",
   "opciones": [
    "El art. 9.3",
    "La Directriz III.5",
    "El art. 6.9",
    "El Apéndice A"
   ],
   "correcta": 1,
   "explicacion": "Las Leyes 2023 lo recogen en las Directrices III, «Partidas sin incremento, incluidos los finales a caída de bandera»."
  },
  {
   "ficha": "antidopaje-2026",
   "texto": "¿Está prohibida la cafeína en 2026?",
   "opciones": [
    "Sí, en competición",
    "Sí, por encima de 12 µg/mL",
    "No: está en el Programa de Seguimiento",
    "Solo en eventos FIDE"
   ],
   "correcta": 2,
   "explicacion": "La cafeína figura en el Programa de Seguimiento 2026 (en competición): se vigila, pero no está prohibida."
  },
  {
   "ficha": "antidopaje-2026",
   "texto": "¿A partir de qué concentración en orina está prohibida la seudoefedrina?",
   "opciones": [
    "5 µg/mL",
    "10 µg/mL",
    "150 µg/mL",
    "Siempre está prohibida"
   ],
   "correcta": 2,
   "explicacion": "Lista Prohibida 2026, S6: seudoefedrina por encima de 150 µg/mL. Los 10 µg/mL son para la efedrina y la metilefedrina."
  },
  {
   "ficha": "antidopaje-2026",
   "texto": "El metilfenidato (Ritalin), ¿en qué situación está en 2026?",
   "opciones": [
    "No está prohibido",
    "Prohibido en competición, como estimulante especificado (S6.B)",
    "Prohibido siempre, también fuera de competición",
    "En el Programa de Seguimiento"
   ],
   "correcta": 1,
   "explicacion": "Figura en S6.B (estimulantes especificados), prohibidos en competición."
  },
  {
   "ficha": "antidopaje-2026",
   "texto": "Un jugador con TDAH toma un medicamento con anfetaminas recetado por su médico. ¿Qué debe hacer?",
   "opciones": [
    "Nada: si es recetado no hay problema",
    "Obtener una autorización de uso terapéutico antes de usarlo",
    "Dejarlo una semana antes del torneo, sin avisar",
    "Avisar al árbitro el día de la ronda"
   ],
   "correcta": 1,
   "explicacion": "Para usar una sustancia prohibida por razones médicas hace falta una autorización de uso terapéutico, solicitada antes de usarla."
  },
  {
   "ficha": "antidopaje-2026",
   "texto": "¿Qué es el Programa de Seguimiento de la AMA?",
   "opciones": [
    "La lista de sustancias prohibidas siempre",
    "Sustancias no prohibidas que la AMA vigila para detectar patrones de abuso",
    "Las sanciones por dopaje",
    "El calendario de controles"
   ],
   "correcta": 1,
   "explicacion": "El Programa de Seguimiento reúne sustancias que no están prohibidas pero que la AMA vigila."
  },
  {
   "ficha": "antidopaje-2026",
   "texto": "¿Cada cuánto cambia la Lista Prohibida de la AMA?",
   "opciones": [
    "Nunca",
    "Cada año, con entrada en vigor el 1 de enero",
    "Cada cuatro años, con el Código",
    "Cuando la FIDE lo decide"
   ],
   "correcta": 1,
   "explicacion": "La Lista se revisa cada año; la de 2026 entró en vigor el 1-ene-2026."
  },
  {
   "ficha": "antidopaje-2026",
   "texto": "¿Cuál de estas sustancias está prohibida en competición en 2026?",
   "opciones": [
    "Codeína",
    "Cafeína",
    "Tramadol",
    "Nicotina"
   ],
   "correcta": 2,
   "explicacion": "El tramadol figura en S7 (narcóticos), prohibido en competición. La codeína, la cafeína y la nicotina están en el Programa de Seguimiento."
  },
  {
   "ficha": "fatiga-mental",
   "texto": "Según el artículo, ¿cuáles son tres de las causas más importantes de la fatiga mental del árbitro?",
   "opciones": [
    "El horario, el sueldo y los viajes",
    "La preocupación, la tensión y la frustración",
    "La edad, el ruido y la luz",
    "Los jugadores, los padres y los organizadores"
   ],
   "correcta": 1,
   "explicacion": "El artículo señala la preocupación, la tensión y la frustración como causas principales."
  },
  {
   "ficha": "fatiga-mental",
   "texto": "¿Cómo hay que contestar el test?",
   "opciones": [
    "Según lo que te gustaría hacer",
    "Según lo que haces en la práctica, pensando en los últimos seis meses",
    "Pensando solo en el último torneo",
    "Según lo que opinan tus colegas"
   ],
   "correcta": 1,
   "explicacion": "La autora pide contestar según la práctica real y el trabajo de los últimos seis meses."
  },
  {
   "ficha": "fatiga-mental",
   "texto": "Obtuviste 3 puntos en el test. ¿Qué sugiere el resultado?",
   "opciones": [
    "Que dejes de arbitrar",
    "Trabajar el aburrimiento, la frustración y la fatiga, y descubrir qué te bloquea",
    "Que todo está bien",
    "Que pidas más torneos"
   ],
   "correcta": 1,
   "explicacion": "De 0 a 4 puntos: hay que vencer el aburrimiento, la frustración y la fatiga, y descubrir qué se está convirtiendo en un bloqueo mental."
  },
  {
   "ficha": "fatiga-mental",
   "texto": "¿Qué actitud ante la crítica propone el test?",
   "opciones": [
    "Ignorarla siempre",
    "Aceptarla, recordando que la crítica injusta suele ser un cumplido disfrazado",
    "Responder en el momento",
    "Pedir sanciones para quien critica"
   ],
   "correcta": 1,
   "explicacion": "La pregunta 9 del test valora aceptar la crítica con esa perspectiva."
  },
  {
   "ficha": "fatiga-mental",
   "texto": "Según el artículo, ¿cuál suele ser la causa real de la fatiga?",
   "opciones": [
    "El trabajo en sí",
    "La preocupación o la frustración que genera la mente",
    "La falta de dinero",
    "El reglamento"
   ],
   "correcta": 1,
   "explicacion": "La autora concluye que a menudo la causa no es el trabajo en sí, sino la preocupación o la frustración que genera la mente."
  },
  {
   "ficha": "leyes-borrador-2013-a-2023",
   "texto": "¿Desde cuándo se aplican las Leyes del Ajedrez FIDE vigentes en noviembre de 2026?",
   "opciones": [
    "1 de enero de 2023",
    "1 de julio de 2014",
    "1 de enero de 2018",
    "1 de marzo de 2026"
   ],
   "correcta": 0,
   "explicacion": "Las aprobó la Asamblea General el 7 de agosto de 2022 y se aplican desde el 1 de enero de 2023. El 1 de marzo de 2026 es la fecha del reglamento de desempates C.07."
  },
  {
   "ficha": "leyes-borrador-2013-a-2023",
   "texto": "La misma posición aparece por quinta vez (no de forma consecutiva) y nadie reclama. ¿Qué pasa?",
   "opciones": [
    "Nada: hacen falta diez repeticiones",
    "Nada: deben ser cinco consecutivas",
    "La partida es tablas automáticamente",
    "Pierde el jugador que repitió"
   ],
   "correcta": 2,
   "explicacion": "Art. 9.6.1: basta que la misma posición aparezca al menos cinco veces. Las diez repeticiones del borrador de 2013 nunca se aprobaron y desde 2017 ya no se exige que sean consecutivas."
  },
  {
   "ficha": "leyes-borrador-2013-a-2023",
   "texto": "Las bases no dicen nada sobre el tiempo de incomparecencia. Un jugador llega dos minutos después del inicio. ¿Qué dice la norma?",
   "opciones": [
    "Tiene 15 minutos de tolerancia",
    "Tiene 30 minutos de tolerancia",
    "Juega con el tiempo que le quede",
    "El tiempo es cero: pierde, salvo que el árbitro decida otra cosa"
   ],
   "correcta": 3,
   "explicacion": "Art. 6.7.1: si las bases no fijan el tiempo de incomparecencia, es cero, y quien llega después pierde salvo que el árbitro decida otra cosa."
  },
  {
   "ficha": "leyes-borrador-2013-a-2023",
   "texto": "Un jugador mueve y olvida pulsar el reloj; el rival responde en el tablero. ¿Puede el primero pulsar ahora?",
   "opciones": [
    "No: perdió el derecho",
    "Sí: se le debe permitir pulsar aunque el rival ya haya movido; su tiempo siguió corriendo",
    "Sí, y el árbitro le devuelve el tiempo perdido",
    "Solo si el árbitro se lo indica"
   ],
   "correcta": 1,
   "explicacion": "Art. 6.2.2: al jugador se le debe permitir pausar su reloj después de mover, incluso después de la siguiente jugada del rival; ese tiempo forma parte del suyo. El árbitro no debe avisarle (12.6)."
  },
  {
   "ficha": "leyes-borrador-2013-a-2023",
   "texto": "Un jugador reclama tablas por triple repetición en una partida estándar y la reclamación es incorrecta. ¿Qué hace el árbitro?",
   "opciones": [
    "Da tres minutos al rival",
    "Le quita dos minutos al reclamante",
    "Da dos minutos al rival y la partida sigue",
    "Advierte al reclamante y nada más"
   ],
   "correcta": 2,
   "explicacion": "Art. 9.5.3: se añaden dos minutos al tiempo del rival y la partida continúa. En rápidas y relámpago es un minuto (A.3)."
  },
  {
   "ficha": "leyes-borrador-2013-a-2023",
   "texto": "¿Cuál de estas sanciones NO está en la lista del art. 12.9?",
   "opciones": [
    "Repetir la partida",
    "Exclusión de una o varias rondas",
    "Una multa anunciada de antemano",
    "Aumentar el tiempo del rival"
   ],
   "correcta": 0,
   "explicacion": "El 12.9 enumera advertencia, cambios de tiempo, cambios de puntos, pérdida de la partida, multa anunciada, exclusión de una o varias rondas y expulsión. Repetir la partida no es una sanción del 12.9."
  },
  {
   "ficha": "leyes-borrador-2013-a-2023",
   "texto": "Un jugador completa su segunda jugada ilegal en una partida estándar. Al rival solo le queda el rey. ¿Resultado?",
   "opciones": [
    "Gana el rival",
    "Dos minutos más al rival",
    "Se repite la jugada sin sanción",
    "Tablas, porque el rival no puede dar mate con ninguna serie de jugadas legales"
   ],
   "correcta": 3,
   "explicacion": "Art. 7.5.5: la segunda jugada ilegal pierde, salvo que el rival no pueda dar mate con ninguna serie de jugadas legales; con rey solo no puede, así que es tablas."
  },
  {
   "ficha": "pautas-iii-sin-incremento",
   "texto": "En un torneo con ritmo de 90 minutos más 30 segundos por jugada, un jugador con 1:30 reclama tablas porque el rival «no puede ganar por medios normales». ¿Qué hace el árbitro?",
   "opciones": [
    "Aplica la pauta III.5",
    "Rechaza aplicar las Pautas III: solo valen sin incremento",
    "Programa cinco segundos de incremento",
    "Declara tablas si la posición es igualada"
   ],
   "correcta": 1,
   "explicacion": "Pautas III.2.2: solo se aplican en partidas estándar y rápidas sin incremento, y solo si se anunciaron antes (III.2.1)."
  },
  {
   "ficha": "pautas-iii-sin-incremento",
   "texto": "Sin incremento y con las Pautas III anunciadas, un jugador con menos de dos minutos pide que se introduzcan cinco segundos para ambos. ¿Qué significa esa petición?",
   "opciones": [
    "Es una oferta de tablas",
    "Es una reclamación de victoria",
    "Es una solicitud que el árbitro debe aceptar siempre",
    "Es una falta que se sanciona"
   ],
   "correcta": 0,
   "explicacion": "Pauta III.4: la petición constituye una oferta de tablas. Si el rival la rechaza y el árbitro acepta la petición, se programa el incremento y el rival recibe dos minutos."
  },
  {
   "ficha": "pautas-iii-sin-incremento",
   "texto": "El árbitro rechaza una reclamación de tablas hecha según la pauta III.5. ¿Qué pasa?",
   "opciones": [
    "Nada",
    "El reclamante pierde dos minutos",
    "El rival recibe dos minutos extra",
    "La partida se declara perdida para el reclamante"
   ],
   "correcta": 2,
   "explicacion": "Pauta III.5.3: si el árbitro rechaza la reclamación, el rival recibe dos minutos extra."
  },
  {
   "ficha": "pautas-iii-sin-incremento",
   "texto": "¿Se pueden aplicar las Pautas III en un torneo relámpago sin incremento?",
   "opciones": [
    "Sí, si se anuncian",
    "Sí, siempre",
    "Solo con un árbitro por partida",
    "No: nunca se aplican en relámpago"
   ],
   "correcta": 3,
   "explicacion": "Pauta III.2.2: se aplican solo a partidas estándar y rápidas sin incremento, no al relámpago."
  },
  {
   "ficha": "pautas-iii-sin-incremento",
   "texto": "En el último periodo de una partida sin incremento caen las dos banderas y no se sabe cuál cayó primero. ¿Resultado?",
   "opciones": [
    "Pierden los dos",
    "Tablas",
    "Gana el que tenga más material",
    "La partida continúa"
   ],
   "correcta": 1,
   "explicacion": "Pauta III.3.1.2: si ocurre en el periodo en que hay que completar todas las jugadas, la partida es tablas. En otro periodo, la partida continúa (III.3.1.1)."
  },
  {
   "ficha": "pautas-iii-sin-incremento",
   "texto": "En un torneo sin árbitro en la sala, un jugador con menos de dos minutos reclama tablas porque el rival no se esfuerza por ganar. ¿Qué debe hacer?",
   "opciones": [
    "Parar el reloj y esperar al día siguiente",
    "Nada: sin árbitro no se puede reclamar",
    "Anotar la posición final y entregar la planilla al día, que el rival verifica; la reclamación pasa al árbitro designado",
    "Seguir jugando hasta que caiga la bandera"
   ],
   "correcta": 2,
   "explicacion": "Pauta III.6: en III.6.1.2 el jugador anota la posición final y entrega una planilla al día; el rival verifica ambas y la reclamación se remite al árbitro designado (III.6.2)."
  },
  {
   "ficha": "coronacion-dos-manos",
   "texto": "Un jugador retira de la séptima fila su peón, coloca una dama en la casilla de coronación con la misma mano y pulsa el reloj. ¿Es correcto?",
   "opciones": [
    "Sí: el peón no tiene que colocarse en la casilla de llegada",
    "No: el peón debía tocar la octava fila",
    "Es jugada ilegal y el rival recibe dos minutos",
    "Solo es válido en rápidas"
   ],
   "correcta": 0,
   "explicacion": "Art. 4.6.1: el peón no tiene que colocarse en la casilla de llegada, y el orden de retirar el peón y poner la pieza es libre (4.6.2)."
  },
  {
   "ficha": "coronacion-dos-manos",
   "texto": "Un jugador corona retirando el peón con la mano izquierda y colocando la dama con la derecha, y pulsa el reloj. Es su primera infracción. ¿Qué hace el árbitro en una partida estándar?",
   "opciones": [
    "Solo una advertencia",
    "Nada, la coronación es válida",
    "Declara perdida la partida",
    "Lo sanciona como jugada ilegal: dos minutos al rival"
   ],
   "correcta": 3,
   "explicacion": "Art. 7.5.4: usar las dos manos para una sola jugada y pulsar el reloj se sanciona como si fuera una jugada ilegal; por la primera, dos minutos al rival (7.5.5)."
  },
  {
   "ficha": "coronacion-dos-manos",
   "texto": "Un jugador lleva el peón a la última fila, pulsa el reloj y deja el peón allí sin cambiarlo. ¿Qué pasa?",
   "opciones": [
    "El peón se queda como peón",
    "Es jugada ilegal y el peón se sustituye por una dama",
    "El jugador elige ahora la pieza",
    "Pierde la partida de inmediato"
   ],
   "correcta": 1,
   "explicacion": "Art. 7.5.2: la jugada es ilegal y el peón se sustituye por una dama de su color; además se aplica la sanción del 7.5.5."
  },
  {
   "ficha": "coronacion-dos-manos",
   "texto": "Un jugador corona: toca la dama, pero apoya una torre en la casilla de promoción. ¿Qué pieza quedó elegida?",
   "opciones": [
    "La torre: la elección queda definida cuando la pieza toca la casilla de promoción",
    "La dama, porque la tocó primero",
    "La que el jugador diga en voz alta",
    "La que decida el árbitro"
   ],
   "correcta": 0,
   "explicacion": "Art. 4.4.4: la elección queda definida cuando la pieza toca la casilla de promoción, no cuando se toma en la mano ni cuando se nombra."
  },
  {
   "ficha": "coronacion-dos-manos",
   "texto": "¿Cuándo se considera hecha una coronación?",
   "opciones": [
    "Cuando el peón llega a la última fila",
    "Cuando el jugador nombra la pieza",
    "Cuando la mano suelta la pieza nueva en la casilla de promoción y el peón ya salió del tablero",
    "Cuando el rival mueve"
   ],
   "correcta": 2,
   "explicacion": "Art. 4.7.3: la coronación está hecha cuando la mano del jugador suelta la pieza nueva en la casilla de promoción y el peón ya se retiró del tablero."
  },
  {
   "ficha": "coronacion-dos-manos",
   "texto": "En la misma jugada, un jugador hace una coronación ilegal y además usa las dos manos. Ya tenía una jugada ilegal antes. ¿Qué indica el Manual del Árbitro 2026?",
   "opciones": [
    "Son dos infracciones nuevas: pierde de todos modos",
    "No cuenta porque fue en la misma jugada",
    "Se sanciona solo la coronación",
    "Cuentan como una sola jugada ilegal, pero es su segunda: pierde"
   ],
   "correcta": 3,
   "explicacion": "El Manual 2026 dice que dos infracciones en una misma jugada cuentan como una sola jugada ilegal. Como ya tenía una, esta es la segunda y pierde (7.5.5), salvo que el rival no pueda dar mate."
  },
  {
   "ficha": "coronacion-dos-manos",
   "texto": "En una partida rápida sin supervisión completa, un jugador corona con las dos manos y pulsa; el rival no reclama y hace su jugada. ¿Qué pasa después?",
   "opciones": [
    "El árbitro sanciona con un minuto",
    "La jugada se mantiene y ya no hay sanción",
    "El rival puede reclamar en cualquier momento",
    "Se anula la coronación"
   ],
   "correcta": 1,
   "explicacion": "Art. A.5.2: el árbitro actúa, o el rival reclama, solo mientras el rival no haya hecho su siguiente jugada; si nadie actúa a tiempo, la jugada se mantiene."
  },
  {
   "ficha": "sede-y-dispositivos",
   "texto": "Las bases permiten guardar los teléfonos en el bolso. Un jugador lo tiene allí, apagado, con el bolso donde indicó el árbitro. ¿Qué pasa?",
   "opciones": [
    "Pierde la partida",
    "Recibe una advertencia",
    "Nada: está permitido por el 11.3.2.1",
    "Debe entregar el teléfono al rival"
   ],
   "correcta": 2,
   "explicacion": "Art. 11.3.2.1: las bases pueden permitir guardar el dispositivo en el bolso, completamente apagado y colocado donde acuerde el árbitro."
  },
  {
   "ficha": "sede-y-dispositivos",
   "texto": "Durante la partida es evidente que un jugador lleva el teléfono en el bolsillo. Las bases no dicen nada especial. ¿Resultado?",
   "opciones": [
    "Pierde y el rival gana",
    "Advertencia la primera vez",
    "Tablas si el rival no puede ganar",
    "Dos minutos al rival"
   ],
   "correcta": 0,
   "explicacion": "Art. 11.3.2.2: si es evidente que lleva el dispositivo encima, pierde y el rival gana. Las bases pueden fijar una sanción menor; la excepción de tablas de la regla antigua ya no existe."
  },
  {
   "ficha": "sede-y-dispositivos",
   "texto": "El árbitro quiere revisar la ropa de una jugadora por sospecha de un dispositivo. ¿Cómo debe hacerse?",
   "opciones": [
    "En la sala, delante de testigos",
    "Solo con la autorización de su federación",
    "No se puede inspeccionar a un jugador",
    "En privado, por el árbitro o una persona autorizada del mismo género que la jugadora"
   ],
   "correcta": 3,
   "explicacion": "Art. 11.3.3: la inspección es en privado y la hace el árbitro o una persona autorizada, del mismo género que el jugador."
  },
  {
   "ficha": "sede-y-dispositivos",
   "texto": "Un jugador se niega a que lo inspeccionen. ¿Qué artículo aplica el árbitro?",
   "opciones": [
    "El 7.5.5",
    "El 12.9 (sanciones)",
    "El 9.5.3",
    "Ninguno: tiene derecho a negarse sin consecuencias"
   ],
   "correcta": 1,
   "explicacion": "Art. 11.3.3: si el jugador se niega a cooperar, el árbitro toma medidas según el art. 12.9."
  },
  {
   "ficha": "sede-y-dispositivos",
   "texto": "Un jugador que tiene el turno quiere ir al baño, que está fuera del área de juego pero dentro de la sede. ¿Qué necesita?",
   "opciones": [
    "Permiso del árbitro",
    "Nada",
    "Permiso del rival",
    "Parar los relojes"
   ],
   "correcta": 0,
   "explicacion": "Art. 11.2.3.2: el jugador que tiene el turno solo puede salir del área de juego con permiso del árbitro."
  },
  {
   "ficha": "sede-y-dispositivos",
   "texto": "Un espectador usa el teléfono en un pasillo contiguo que el árbitro designó como parte de la sede. ¿Está permitido?",
   "opciones": [
    "Sí, los espectadores no tienen restricciones",
    "Sí, si está en silencio",
    "No, salvo autorización del árbitro (12.8)",
    "Solo después de la ronda 5"
   ],
   "correcta": 2,
   "explicacion": "Art. 12.8: salvo autorización del árbitro, nadie puede usar un teléfono u otro medio de comunicación en la sede o en zonas contiguas designadas por el árbitro."
  },
  {
   "ficha": "rapidas-relampago-supervision",
   "texto": "Un torneo se juega a 3 minutos más 2 segundos por jugada. ¿Qué modalidad es?",
   "opciones": [
    "Rápidas",
    "Estándar",
    "Depende de las bases",
    "Relámpago"
   ],
   "correcta": 3,
   "explicacion": "Art. B.1: 3 + 60 × 2 s = 3 + 2 = 5 minutos, que es 10 minutos o menos: relámpago."
  },
  {
   "ficha": "rapidas-relampago-supervision",
   "texto": "Un torneo se juega a 10 minutos más 5 segundos por jugada. ¿Qué modalidad es?",
   "opciones": [
    "Relámpago, porque la base es 10 minutos",
    "Rápidas, porque 10 + 60 × 5 s = 15 minutos",
    "Estándar",
    "Ninguna de las dos"
   ],
   "correcta": 1,
   "explicacion": "Art. A.1: se suma 60 veces el incremento: 10 + 5 = 15 minutos, más de 10 y menos de 60: rápidas."
  },
  {
   "ficha": "rapidas-relampago-supervision",
   "texto": "En un torneo rápido, ¿cuándo se aplican las reglas de competición completas?",
   "opciones": [
    "Siempre",
    "Si quedan menos de seis mesas",
    "Si un árbitro supervisa como máximo tres partidas y cada partida se registra",
    "Si lo piden los jugadores"
   ],
   "correcta": 2,
   "explicacion": "Art. A.4: un árbitro como máximo por tres partidas y registro de cada una. Las bases eligen el régimen para todo el evento (A.6), así que no cambia al quedar menos mesas."
  },
  {
   "ficha": "rapidas-relampago-supervision",
   "texto": "Primera jugada ilegal en una partida relámpago, reclamada a tiempo. ¿Sanción?",
   "opciones": [
    "Un minuto extra al rival",
    "Pierde la partida",
    "Dos minutos extra al rival",
    "Solo una advertencia"
   ],
   "correcta": 0,
   "explicacion": "Arts. B.3, A.3 y 7.5.5: la sanción de los arts. 7 y 9 es de un minuto; la pérdida llega con la segunda jugada ilegal."
  },
  {
   "ficha": "rapidas-relampago-supervision",
   "texto": "Partida rápida sin supervisión completa: el árbitro ve los dos reyes en jaque. ¿Qué hace?",
   "opciones": [
    "Declara tablas de inmediato",
    "Da la partida por perdida al último que movió",
    "No hace nada",
    "Espera a que se complete la siguiente jugada y, si la posición sigue siendo ilegal, declara tablas"
   ],
   "correcta": 3,
   "explicacion": "Art. A.5.4: espera a que se complete la siguiente jugada; si la posición ilegal sigue en el tablero, declara tablas."
  },
  {
   "ficha": "rapidas-relampago-supervision",
   "texto": "En la jugada 12 de una partida rápida sin supervisión completa se descubre que el reloj estaba mal programado. ¿Se puede corregir?",
   "opciones": [
    "Sí, siempre",
    "No, salvo que el horario del evento se vea afectado",
    "Sí, si el rival está de acuerdo",
    "Solo si lo pide el jugador perjudicado"
   ],
   "correcta": 1,
   "explicacion": "Art. A.5.1.1: una vez completadas 10 jugadas por cada bando, no se cambia la programación del reloj, salvo que el horario del evento se vea perjudicado."
  },
  {
   "ficha": "creencias-limitantes-arbitro",
   "texto": "Según Paula Man Reich, ¿qué efecto tiene un pensamiento pesimista constante?",
   "opciones": [
    "Se centra en el miedo y en lo que no está bien",
    "Mejora la concentración",
    "No influye en el trabajo",
    "Solo afecta a los jugadores"
   ],
   "correcta": 0,
   "explicacion": "El artículo explica que un pensamiento pesimista constante se centra en el miedo y en lo que no está bien, y condiciona las acciones del árbitro."
  },
  {
   "ficha": "creencias-limitantes-arbitro",
   "texto": "¿Cuál de estas NO es una de las tres preguntas que propone el artículo?",
   "opciones": [
    "¿Cómo me siento en esta situación?",
    "¿Qué me pasa por la cabeza?",
    "¿Qué artículo de las Leyes aplica?",
    "¿En qué estado estaré dentro de diez minutos si sigo así?"
   ],
   "correcta": 2,
   "explicacion": "Las tres preguntas son sobre el sentimiento, el pensamiento y su efecto en los próximos diez minutos; la cuarta es una pregunta reglamentaria."
  },
  {
   "ficha": "creencias-limitantes-arbitro",
   "texto": "En el ejercicio de las cinco columnas, ¿qué va en la tercera?",
   "opciones": [
    "Las situaciones que dan miedo",
    "Las emociones",
    "Las consecuencias",
    "Las creencias negativas"
   ],
   "correcta": 3,
   "explicacion": "1: situaciones; 2: emociones e intensidad; 3: creencias negativas; 4: comportamiento y eficacia; 5: consecuencias."
  },
  {
   "ficha": "creencias-limitantes-arbitro",
   "texto": "¿Sobre qué tres temas suelen ser los pensamientos que aparecen en el ejercicio?",
   "opciones": [
    "Sobre el reloj, el tablero y las planillas",
    "Sobre uno mismo, sobre los demás y sobre el futuro profesional",
    "Sobre el pasado, el presente y el futuro",
    "Sobre los jugadores, los padres y los organizadores"
   ],
   "correcta": 1,
   "explicacion": "El artículo distingue pensamientos sobre uno mismo y su rendimiento, sobre los demás del ambiente ajedrecístico y sobre el futuro profesional."
  },
  {
   "ficha": "creencias-limitantes-arbitro",
   "texto": "¿Cuál es el principal beneficio del ejercicio, según la autora?",
   "opciones": [
    "Aprender las Leyes",
    "Evitar las reclamaciones",
    "Tomar conciencia de los hábitos de pensamiento y ganar control sobre las emociones",
    "Arbitrar más torneos"
   ],
   "correcta": 2,
   "explicacion": "La simple observación tiene un gran impacto: al tomar conciencia, el árbitro comprende lo que le sucede y gana control sobre su cabeza y sus emociones."
  },
  {
   "ficha": "rating-performance-normas",
   "texto": "Los rivales de un jugador suman 19 588 en 7 partidas. ¿Cuál es el Ra?",
   "opciones": [
    "2798",
    "2799",
    "2798,29",
    "2797"
   ],
   "correcta": 0,
   "explicacion": "19 588 ÷ 7 = 2798,29. El art. 1.4.7 redondea al entero más cercano, así que Ra = 2798."
  },
  {
   "ficha": "rating-performance-normas",
   "texto": "Un promedio de rivales da exactamente 2462,5. ¿Cómo se redondea?",
   "opciones": [
    "2462",
    "Se deja con decimal",
    "2463",
    "Depende del árbitro"
   ],
   "correcta": 2,
   "explicacion": "Art. 1.4.7: la fracción 0,5 se redondea hacia arriba: 2463."
  },
  {
   "ficha": "rating-performance-normas",
   "texto": "Un jugador hace 6½ de 9 contra rivales con Ra 2440. ¿Cuál es su Rp y le alcanza para un resultado de GM?",
   "opciones": [
    "2589: no",
    "2606: no, el Ra debe ser 2450",
    "2640: sí",
    "2606: sí, Rp ≥ 2600 y Ra ≥ 2380"
   ],
   "correcta": 3,
   "explicacion": "p = 6,5 ÷ 9 = 0,7222 → 0,72 → dp = 166; Rp = 2440 + 166 = 2606. Cumple Rp ≥ 2600 y Ra ≥ 2380 (art. 1.4.8). Para ser norma faltaría revisar la mezcla de títulos y federaciones."
  },
  {
   "ficha": "rating-performance-normas",
   "texto": "Un jugador hace 5½ de 9 contra rivales con Ra 2380. ¿Qué resultado de título logra?",
   "opciones": [
    "De GM",
    "De IM: Rp 2460",
    "Ninguno",
    "De GM, porque el Ra es 2380"
   ],
   "correcta": 1,
   "explicacion": "p = 0,6111 → 0,61 → dp = 80; Rp = 2460. Alcanza el mínimo de IM (2450, con Ra ≥ 2230) pero no el de GM (2600)."
  },
  {
   "ficha": "rating-performance-normas",
   "texto": "En un torneo para norma de GM, dos rivales tienen 2150 y 2180. ¿Cómo se tratan en el Ra?",
   "opciones": [
    "Los dos se suben a 2200",
    "Ninguno se modifica",
    "Solo el de 2150 se sube a 2200; el de 2180 queda igual",
    "Se eliminan del cálculo"
   ],
   "correcta": 2,
   "explicacion": "Art. 1.4.6: no se puede subir al piso más que a un rival; si hay varios por debajo, se sube el de menor rating."
  },
  {
   "ficha": "rating-performance-normas",
   "texto": "¿Con qué rating cuenta, para una norma, un rival sin rating al que no se aplica ninguna otra regla?",
   "opciones": [
    "1400",
    "1000",
    "El piso de la norma",
    "No cuenta"
   ],
   "correcta": 0,
   "explicacion": "Art. 1.4.6: los rivales sin rating no cubiertos por otra regla se consideran con 1400."
  },
  {
   "ficha": "rating-performance-normas",
   "texto": "¿Cuál es la puntuación mínima para cualquier norma de título?",
   "opciones": [
    "50 %",
    "40 %",
    "No hay mínimo",
    "35 %"
   ],
   "correcta": 3,
   "explicacion": "Art. 1.4.8: la puntuación mínima es del 35 % para todas las normas."
  },
  {
   "ficha": "rating-performance-normas",
   "texto": "Un jugador logra Rp 2620 en un torneo de 7 rondas, todos contra todos, de un club. ¿Es norma de GM?",
   "opciones": [
    "Sí",
    "No: hacen falta al menos 9 partidas",
    "Sí, si el Ra es mayor de 2380",
    "Solo si es la última ronda"
   ],
   "correcta": 1,
   "explicacion": "Art. 1.4.1: se exigen al menos 9 partidas; las excepciones son para campeonatos por equipos y la Copa del Mundo."
  },
  {
   "ficha": "tpr-desempate-performance",
   "texto": "En el desempate TPR, ¿qué rivales entran en el ARO?",
   "opciones": [
    "Solo los rivales con los que jugó en el tablero",
    "Todos los del calendario",
    "Todos, y los descansos cuentan como 1400",
    "Solo los de su grupo de puntos"
   ],
   "correcta": 0,
   "explicacion": "C.07, art. 10.1: el ARO es el promedio de los ratings de los rivales con los que se jugó en el tablero."
  },
  {
   "ficha": "tpr-desempate-performance",
   "texto": "Los rivales jugados por un participante suman 11 902 en 5 partidas. ¿Cuál es su ARO?",
   "opciones": [
    "2381",
    "2380,4",
    "2380",
    "2379"
   ],
   "correcta": 2,
   "explicacion": "11 902 ÷ 5 = 2380,4, que se redondea al entero más cercano (art. 10.1): 2380."
  },
  {
   "ficha": "tpr-desempate-performance",
   "texto": "En un abierto hay varios jugadores sin rating y las bases no dicen cómo tratarlos. ¿Puede usarse el TPR como desempate?",
   "opciones": [
    "Sí, siempre",
    "Sí, contando a los sin rating como 1000",
    "Solo para los primeros lugares",
    "No: los desempates por rating deben retirarse"
   ],
   "correcta": 3,
   "explicacion": "C.07, art. 10: estos desempates se quitan si hay jugadores sin rating, salvo que las bases o el árbitro principal publiquen antes cómo tratarlos."
  },
  {
   "ficha": "tpr-desempate-performance",
   "texto": "¿Cómo se calcula hoy el primer rating FIDE de un jugador?",
   "opciones": [
    "Igual que su rating performance",
    "Con el promedio de sus rivales más dos rivales ficticios de 1800 contra los que se considera que hizo tablas",
    "Con el promedio de sus rivales menos 100",
    "Se le asigna 1400"
   ],
   "correcta": 1,
   "explicacion": "Reglamento de Rating (desde el 1-mar-2024), art. 8.2.2: se añaden dos rivales hipotéticos de 1800 con resultado de tablas. No es lo mismo que la performance."
  },
  {
   "ficha": "tpr-desempate-performance",
   "texto": "¿Desde cuándo se aplica el Reglamento de Play-off y Desempates C.07 vigente?",
   "opciones": [
    "1-ene-2023",
    "1-mar-2024",
    "1-mar-2026",
    "1-jul-2026"
   ],
   "correcta": 2,
   "explicacion": "Lo aprobó el Consejo FIDE el 2-feb-2026 y se aplica desde el 1-mar-2026."
  },
  {
   "ficha": "tpr-desempate-performance",
   "texto": "Dos jugadores terminan con 2½ de 7 en un todos contra todos. ¿Pueden tener distinto TPR?",
   "opciones": [
    "Sí, porque sus ARO pueden ser distintos",
    "No, con los mismos puntos el TPR es igual",
    "Solo si uno no tiene rating",
    "Solo en sistema suizo"
   ],
   "correcta": 0,
   "explicacion": "El TPR es ARO + dp. Con los mismos puntos el dp es igual, pero el ARO cambia según los rivales (en un todos contra todos, cada uno no se enfrenta a sí mismo). En la revista: 2594 y 2595."
  },
  {
   "ficha": "torre-invertida-coronacion",
   "texto": "Un jugador corona colocando una torre de cabeza y dice «dama». ¿Qué pieza es?",
   "opciones": [
    "Dama",
    "Es jugada ilegal",
    "La que decida el rival",
    "Torre"
   ],
   "correcta": 3,
   "explicacion": "Manual del Árbitro 2026: la torre invertida se considera torre aunque el jugador la nombre como dama. Además, la elección queda definida al tocar la casilla de promoción (4.4.4)."
  },
  {
   "ficha": "torre-invertida-coronacion",
   "texto": "Más tarde, ese jugador mueve la torre invertida en diagonal y pulsa el reloj. ¿Qué es?",
   "opciones": [
    "Una jugada legal de dama",
    "Una jugada ilegal",
    "Una irregularidad sin sanción",
    "Una pieza desplazada"
   ],
   "correcta": 1,
   "explicacion": "La pieza es una torre: moverla en diagonal es jugada ilegal (Manual del Árbitro 2026) y se aplica el art. 7.5."
  },
  {
   "ficha": "torre-invertida-coronacion",
   "texto": "El árbitro ve una torre invertida en el tablero. ¿Qué debe hacer?",
   "opciones": [
    "Corregir la situación causando la menor molestia posible",
    "Nada, salvo que haya reclamación",
    "Cambiarla por una dama",
    "Sancionar con dos minutos"
   ],
   "correcta": 0,
   "explicacion": "Manual del Árbitro 2026: el árbitro que ve una torre invertida debe corregir la situación con la menor molestia posible. No es una dama ni una jugada ilegal."
  },
  {
   "ficha": "torre-invertida-coronacion",
   "texto": "Un jugador corona y no hay una dama disponible. ¿Qué puede hacer?",
   "opciones": [
    "Poner una torre de cabeza",
    "Dejar el peón y decir «dama»",
    "Pausar el reloj y pedir ayuda al árbitro",
    "Pedirle la dama al tablero vecino sin parar el reloj"
   ],
   "correcta": 2,
   "explicacion": "Art. 6.11.2: puede pausar el reloj para pedir ayuda al árbitro, por ejemplo cuando corona y la pieza no está disponible."
  },
  {
   "ficha": "torre-invertida-coronacion",
   "texto": "Al capturar, a un jugador se le cae el caballo, que queda acostado en su casilla, y pulsa el reloj. ¿Cómo se trata?",
   "opciones": [
    "Jugada ilegal",
    "Pierde la partida",
    "El caballo se retira del tablero",
    "Pieza desplazada: se corrige según el art. 7.4"
   ],
   "correcta": 3,
   "explicacion": "El glosario de las Leyes pone como ejemplo de pieza desplazada una pieza acostada de lado. El art. 7.4 dice que quien la desplazó la corrige en su tiempo y que el árbitro puede sancionar."
  },
  {
   "ficha": "torre-invertida-coronacion",
   "texto": "Un jugador lleva el peón a la última fila, pulsa el reloj y deja el peón allí. ¿Qué pasa con el peón?",
   "opciones": [
    "Se convierte en torre",
    "Se sustituye por una dama y la jugada es ilegal",
    "Sigue siendo peón",
    "El jugador elige ahora"
   ],
   "correcta": 1,
   "explicacion": "Art. 7.5.2: la jugada es ilegal y el peón se sustituye por una dama de su color. Es distinto del caso de la torre invertida."
  },
  {
   "ficha": "patrocinio-proyecto-evento",
   "texto": "Según el autor, ¿con qué mentalidad hay que acercarse a un posible patrocinador?",
   "opciones": [
    "Pedir lo máximo posible",
    "Pedir solo dinero",
    "Invitarlo a participar, con un proyecto",
    "Esperar a que él proponga"
   ],
   "correcta": 2,
   "explicacion": "La idea central del artículo: no pedir, sino invitar, y la llave para invitar es un proyecto profesional del evento."
  },
  {
   "ficha": "patrocinio-proyecto-evento",
   "texto": "Un torneo escolar de 200 niños en 25 mesas de 8, más 2 mesas de arbitraje y 4 sillas para árbitros. Sillas a 1 USD y mesas a 10 USD por día. ¿Cuánto cuesta un día?",
   "opciones": [
    "474 USD",
    "370 USD",
    "740 USD",
    "500 USD"
   ],
   "correcta": 0,
   "explicacion": "204 sillas × 1 = 204 USD y 27 mesas × 10 = 270 USD: 474 USD por día. La edición original contaba solo 100 sillas (370 USD)."
  },
  {
   "ficha": "patrocinio-proyecto-evento",
   "texto": "¿Cuál de estos soportes propone el autor añadir para los logotipos de patrocinadores?",
   "opciones": [
    "Los relojes de ajedrez por dentro",
    "Los tableros de la final",
    "Las bases del torneo",
    "Las planillas de los jugadores"
   ],
   "correcta": 3,
   "explicacion": "Propone planillas, identificadores de mesa y gafetes: el jugador ve la planilla toda la partida."
  },
  {
   "ficha": "patrocinio-proyecto-evento",
   "texto": "¿Por qué no conviene usar hoy el manual de identidad de la FIDE de 2013 como guía gráfica?",
   "opciones": [
    "Porque está prohibido",
    "Porque es un documento histórico: los lineamientos vigentes se piden a la FIDE o a la federación",
    "Porque solo vale para Europa",
    "Porque no tenía logotipo"
   ],
   "correcta": 1,
   "explicacion": "Es un documento de 2013; antes de usar la imagen de la FIDE en un evento hay que pedir los lineamientos vigentes."
  },
  {
   "ficha": "patrocinio-proyecto-evento",
   "texto": "¿Qué conviene definir antes de salir a buscar patrocinio?",
   "opciones": [
    "Qué necesitas, qué ofreces a cambio y en qué niveles",
    "Solo la fecha",
    "Solo el monto en dinero",
    "Nada: se negocia en la reunión"
   ],
   "correcta": 0,
   "explicacion": "El artículo insiste en saber exactamente qué se necesita (en dinero o en especie) y qué se ofrece al patrocinador, organizado en niveles."
  },
  {
   "ficha": "leyes-2014-a-2023",
   "texto": "¿Qué versión de las Leyes del Ajedrez rige en noviembre de 2026?",
   "opciones": [
    "La aplicada desde el 1 de enero de 2023",
    "La de 2014",
    "La de 2018",
    "Una nueva aplicada desde el 1 de marzo de 2026"
   ],
   "correcta": 0,
   "explicacion": "Las Leyes aprobadas por la Asamblea General el 7-ago-2022 se aplican desde el 1-ene-2023 y siguen siendo la versión vigente publicada en el FIDE Handbook. Lo de marzo de 2026 es el reglamento de desempates C.07."
  },
  {
   "ficha": "leyes-2014-a-2023",
   "texto": "Partida rápida con supervisión insuficiente (art. A.5). Un jugador completa su primera jugada ilegal y el árbitro lo ve antes de que el rival juegue. ¿Qué hace?",
   "opciones": [
    "Declara perdida la partida, como en 2014",
    "Restablece la posición y da 2 minutos al rival",
    "Restablece la posición y da 1 minuto al rival",
    "No hace nada: solo el rival puede reclamar"
   ],
   "correcta": 2,
   "explicacion": "Art. A.5.2: el árbitro actúa según el art. 7.5.5 si el rival aún no jugó. En rápidas la sanción es de 1 minuto en vez de 2 (art. A.3). La pérdida a la primera era la regla de 2014 (art. A.4.2)."
  },
  {
   "ficha": "leyes-2014-a-2023",
   "texto": "Un jugador pulsa el reloj sin haber hecho ninguna jugada. Es la primera vez. ¿Cómo se trata en una partida estándar?",
   "opciones": [
    "Con una advertencia",
    "Como pérdida de la partida",
    "No es infracción si lo corrige enseguida",
    "Como una jugada ilegal: 2 minutos más para el rival"
   ],
   "correcta": 3,
   "explicacion": "Art. 7.5.3: se considera y se sanciona como jugada ilegal; por la primera, 2 minutos al rival (art. 7.5.5)."
  },
  {
   "ficha": "leyes-2014-a-2023",
   "texto": "Las bases de un abierto permiten llevar el celular guardado en el bolso. ¿Con qué condición, según las Leyes?",
   "opciones": [
    "Que esté en silencio",
    "Que esté completamente apagado y el bolso esté donde se acordó con el árbitro",
    "Que el jugador lo entregue al terminar",
    "Ninguna: las Leyes lo prohíben siempre"
   ],
   "correcta": 1,
   "explicacion": "Art. 11.3.2.1: el dispositivo debe estar completamente apagado y el bolso, donde se acuerde con el árbitro; ninguno de los dos jugadores puede usar ese bolso sin permiso."
  },
  {
   "ficha": "leyes-2014-a-2023",
   "texto": "Antes de mover, los dos jugadores firman tablas. ¿Es válido?",
   "opciones": [
    "No: el acuerdo exige que los dos hayan hecho al menos una jugada",
    "Sí, el acuerdo es libre",
    "Sí, si el árbitro lo autoriza",
    "Solo en partidas rápidas"
   ],
   "correcta": 0,
   "explicacion": "Art. 5.2.3: el acuerdo de tablas es válido si ambos jugadores hicieron al menos una jugada (desde las Leyes de 2017)."
  },
  {
   "ficha": "leyes-2014-a-2023",
   "texto": "La misma posición aparece por quinta vez, aunque no en jugadas seguidas. ¿Qué pasa?",
   "opciones": [
    "Nada: deben ser cinco jugadas alternas consecutivas",
    "Se pueden reclamar tablas",
    "Tablas automáticas",
    "El árbitro advierte a los jugadores"
   ],
   "correcta": 2,
   "explicacion": "Art. 9.6.1: basta que la misma posición aparezca al menos cinco veces. La exigencia de jugadas consecutivas era de las Leyes 2014."
  },
  {
   "ficha": "leyes-2014-a-2023",
   "texto": "Las bases no dicen nada sobre el tiempo de incomparecencia. Un jugador llega 5 minutos tarde. ¿Qué pasa?",
   "opciones": [
    "Juega con 5 minutos menos",
    "Tiene 30 minutos de tolerancia",
    "Tiene 60 minutos de tolerancia",
    "Pierde la partida, salvo que el árbitro decida otra cosa"
   ],
   "correcta": 3,
   "explicacion": "Art. 6.7.1: si no se especifica, el tiempo de incomparecencia es cero; quien llega después pierde, salvo que el árbitro decida otra cosa."
  },
  {
   "ficha": "leyes-2014-a-2023",
   "texto": "Un jugador abandona con rey y caballo contra rey solo del rival. ¿Resultado?",
   "opciones": [
    "Gana el rival",
    "Tablas: el rival no puede dar mate con ninguna serie de jugadas legales",
    "La partida continúa",
    "Decide el árbitro según el tiempo"
   ],
   "correcta": 1,
   "explicacion": "Art. 5.1.2 (Leyes 2023): pierde quien abandona, salvo que el rival no pueda dar mate con ninguna serie de jugadas legales; con rey solo no puede, así que es tablas."
  },
  {
   "ficha": "leyes-2014-a-2023",
   "texto": "¿Cuál de estas sanciones NO figura en el art. 12.9?",
   "opciones": [
    "Suspensión del rating FIDE por un año",
    "Exclusión de una o más rondas",
    "Multa anunciada de antemano",
    "Expulsión de la competición"
   ],
   "correcta": 0,
   "explicacion": "El art. 12.9 incluye advertencia, cambios de tiempo y de puntos, pérdida de la partida, multa anunciada, exclusión de rondas (12.9.8) y expulsión. Las suspensiones las imponen otros órganos, no el árbitro en la sala."
  },
  {
   "ficha": "rating-performance",
   "texto": "Un jugador hace 5½ de 7 y sus rivales suman 18 870. ¿Cuál es su performance?",
   "opciones": [
    "2916",
    "2925",
    "2926",
    "2906"
   ],
   "correcta": 2,
   "explicacion": "Ra = 18 870 ÷ 7 = 2695,71 → 2696 (art. 1.4.7). p = 0,7857 → 79 % → dp 230 (art. 1.4.9). Rp = 2926. Con 78 % (truncando) saldría 2916."
  },
  {
   "ficha": "rating-performance",
   "texto": "¿Cómo se redondea el promedio de los rivales (Ra)?",
   "opciones": [
    "Se trunca",
    "Al entero más cercano, 0,5 hacia abajo",
    "A la decena",
    "Al entero más cercano, 0,5 hacia arriba"
   ],
   "correcta": 3,
   "explicacion": "Reglamento de Títulos, art. 1.4.7: al entero más cercano; la fracción 0,5 se redondea hacia arriba."
  },
  {
   "ficha": "rating-performance",
   "texto": "Un jugador hace 2½ de 7. ¿Qué dp le corresponde?",
   "opciones": [
    "+102",
    "−102",
    "−95",
    "−110"
   ],
   "correcta": 1,
   "explicacion": "p = 0,3571 → 36 % (art. 1.4.9). En la tabla, 0,64 da 102; por debajo de 0,50 el valor es negativo: 0,36 → −102."
  },
  {
   "ficha": "rating-performance",
   "texto": "Un jugador hace exactamente el 50 % de los puntos. ¿Cuál es su performance?",
   "opciones": [
    "El promedio de sus rivales",
    "Su propio rating",
    "El promedio de sus rivales más 50",
    "No se puede calcular"
   ],
   "correcta": 0,
   "explicacion": "Con p = 0,50, dp = 0; Rp = Ra + 0 = el promedio de los rivales."
  },
  {
   "ficha": "rating-performance",
   "texto": "Dos jugadores del mismo torneo cerrado terminan con 2/7. Uno tiene 2699 y el otro 2693. ¿Quién tiene mayor performance?",
   "opciones": [
    "El de 2699",
    "Tienen la misma",
    "El de 2693",
    "Depende de los desempates"
   ],
   "correcta": 2,
   "explicacion": "Sus rivales son todos los demás: al de 2693 le tocan rivales que suman más (18 877 contra 18 871), su Ra es mayor (2697 contra 2696) y, con el mismo dp, su Rp también (2539 contra 2538)."
  },
  {
   "ficha": "rating-performance",
   "texto": "En el desempate TPR del reglamento C.07 (2026), ¿qué partidas cuentan para la fracción de puntos?",
   "opciones": [
    "Todas, incluidas las ganadas por incomparecencia",
    "Todas menos los byes",
    "Solo las de la última mitad del torneo",
    "Solo las jugadas sobre el tablero"
   ],
   "correcta": 3,
   "explicacion": "Art. 10.2: la fracción es puntos en partidas jugadas sobre el tablero entre número de esas partidas; el ARO (art. 10.1) también usa solo rivales enfrentados sobre el tablero."
  },
  {
   "ficha": "rating-performance",
   "texto": "En un abierto con jugadores sin rating, las bases ponen TPR como desempate sin decir cómo tratarlos. ¿Qué indica el C.07?",
   "opciones": [
    "Se les asigna 1000",
    "Los desempates por rating se quitan de la lista, salvo reglas publicadas antes del inicio",
    "Se les asigna 1400",
    "El árbitro decide durante el torneo"
   ],
   "correcta": 1,
   "explicacion": "C.07, art. 10: los desempates por rating se eliminan si hay jugadores sin rating, salvo que las bases o el árbitro principal publiquen antes del inicio reglas para tratarlos."
  },
  {
   "ficha": "performance-norma",
   "texto": "¿Cuál es el piso ajustado de rating de los rivales para una norma de MI?",
   "opciones": [
    "2050",
    "2000",
    "2200",
    "2230"
   ],
   "correcta": 0,
   "explicacion": "Reglamento de Títulos, art. 1.4.6.b: 2200 para GM, 2050 para MI, 2000 para WGM y 1850 para WIM. 2230 es el Ra mínimo para MI."
  },
  {
   "ficha": "performance-norma",
   "texto": "Una jugadora que busca norma de GM tuvo dos rivales por debajo de 2200: uno de 2150 y otro de 2080. ¿Qué se hace?",
   "opciones": [
    "Se suben los dos a 2200",
    "Se sube solo el de 2150",
    "Se sube solo el de 2080 a 2200",
    "No se sube ninguno"
   ],
   "correcta": 2,
   "explicacion": "Art. 1.4.6.c: solo un rival puede subirse al piso; si hay más de uno por debajo, se sube el de menor rating."
  },
  {
   "ficha": "performance-norma",
   "texto": "Para efectos de una norma, ¿con qué rating cuenta un rival sin rating al que no se le aplica el piso?",
   "opciones": [
    "1000",
    "1800",
    "No cuenta",
    "1400"
   ],
   "correcta": 3,
   "explicacion": "Art. 1.4.6.d: los rivales sin rating no cubiertos por el piso se consideran de 1400."
  },
  {
   "ficha": "performance-norma",
   "texto": "A 9 rondas, 6½ puntos con un Ra de 2285 (piso ya aplicado). ¿Hay performance de norma de MI?",
   "opciones": [
    "No: Rp 2441",
    "Sí: Rp 2451",
    "No: el Ra es menor que 2380",
    "Sí, pero solo si es round robin"
   ],
   "correcta": 1,
   "explicacion": "p = 72 % → +166; Rp = 2285 + 166 = 2451 ≥ 2450, y Ra 2285 ≥ 2230 (art. 1.4.8). La tabla del anexo da norma de MI con 6½ para Ra de 2284 a 2324."
  },
  {
   "ficha": "performance-norma",
   "texto": "¿Qué porcentaje mínimo de puntos exige cualquier norma?",
   "opciones": [
    "35 %",
    "25 %",
    "50 %",
    "No hay mínimo"
   ],
   "correcta": 0,
   "explicacion": "Art. 1.4.8.b: el puntaje mínimo es 35 % para todas las normas."
  },
  {
   "ficha": "performance-norma",
   "texto": "Una performance de 2599,6 para norma de GM, ¿alcanza?",
   "opciones": [
    "No, debe ser 2600 exacto",
    "Solo si el Ra es 2400 o más",
    "Sí: el mínimo antes de redondear es 2599,5",
    "Depende del número de rondas"
   ],
   "correcta": 2,
   "explicacion": "Art. 1.4.8: para GM el mínimo es 2599,5 antes de redondear (2600 después)."
  },
  {
   "ficha": "jurisprudencia-ajedrez",
   "texto": "Según el Prólogo de las Leyes (art. 0.2), ¿qué hace el árbitro ante un caso no regulado con precisión?",
   "opciones": [
    "Consulta a los jugadores",
    "Suspende la partida hasta consultar a la FIDE",
    "Aplica el reglamento nacional",
    "Decide estudiando situaciones análogas que sí están reguladas"
   ],
   "correcta": 3,
   "explicacion": "Art. 0.2: debería ser posible llegar a una decisión correcta estudiando situaciones análogas reguladas en las Leyes."
  },
  {
   "ficha": "jurisprudencia-ajedrez",
   "texto": "¿Por qué las Leyes evitan reglas demasiado detalladas?",
   "opciones": [
    "Para que sean más cortas",
    "Porque podrían quitar al árbitro su libertad de criterio para resolver con justicia y lógica",
    "Porque cada federación las completa",
    "Porque los detalles están en las bases"
   ],
   "correcta": 1,
   "explicacion": "Art. 0.2: una regla demasiado detallada podría privar al árbitro de su libertad de juicio para encontrar una solución dictada por la justicia, la lógica y los factores especiales."
  },
  {
   "ficha": "jurisprudencia-ajedrez",
   "texto": "¿Qué es la jurisprudencia aplicada al ajedrez?",
   "opciones": [
    "La doctrina que se repite en las resoluciones de los órganos con autoridad sobre cómo aplicar las normas",
    "El conjunto de reglamentos nacionales",
    "La opinión de los Grandes Maestros",
    "El texto en inglés de las Leyes"
   ],
   "correcta": 0,
   "explicacion": "Es la doctrina establecida por los órganos con autoridad (en ajedrez, la FIDE y sus comisiones) que se repite en varias resoluciones."
  },
  {
   "ficha": "jurisprudencia-ajedrez",
   "texto": "¿Dónde puedes consultar hoy las Leyes de 2014, 2017 y 2018?",
   "opciones": [
    "Solo en ediciones impresas antiguas",
    "No se conservan",
    "En el FIDE Handbook, junto a las vigentes",
    "Solo en la federación nacional"
   ],
   "correcta": 2,
   "explicacion": "El FIDE Handbook (sección E.01) publica las Leyes vigentes y las versiones anteriores a 2014, de 2014, 2017 y 2018."
  },
  {
   "ficha": "jurisprudencia-ajedrez",
   "texto": "¿Qué texto de las Leyes es el auténtico?",
   "opciones": [
    "El español",
    "El francés",
    "Cualquier traducción oficial",
    "El inglés"
   ],
   "correcta": 3,
   "explicacion": "Art. 0.1: el texto en inglés es la versión auténtica de las Leyes del Ajedrez."
  },
  {
   "ficha": "habitos-arbitro",
   "texto": "Según el artículo, ¿cómo se cambia un hábito negativo?",
   "opciones": [
    "Dejándolo de golpe",
    "Reemplazándolo por otro distinto",
    "Ignorándolo",
    "Pidiendo a otro árbitro que lo corrija"
   ],
   "correcta": 1,
   "explicacion": "La propuesta es reemplazar esa costumbre por una distinta, elegida por ti y no vivida como obligación externa."
  },
  {
   "ficha": "habitos-arbitro",
   "texto": "Al hacer tu lista de cinco acciones, solo se te ocurren pretextos para no hacerlas. ¿Qué indica eso?",
   "opciones": [
    "Que hablan tus viejos hábitos",
    "Que las acciones no sirven",
    "Que ya eres un buen árbitro",
    "Que necesitas más acciones"
   ],
   "correcta": 0,
   "explicacion": "El artículo lo dice así: los pretextos son la voz de los hábitos antiguos, no de tu mejor futuro."
  },
  {
   "ficha": "habitos-arbitro",
   "texto": "¿Qué ayuda, según el artículo, a mantener la motivación al cambiar un hábito?",
   "opciones": [
    "Guardar los avances en secreto",
    "Cambiar varios hábitos a la vez",
    "Escribir los avances y compartirlos con personas de confianza",
    "Esperar a terminar para evaluarse"
   ],
   "correcta": 2,
   "explicacion": "Escribir las señales de avance y comentarlas con personas de confianza ayuda a desarrollar motivación y eficacia."
  },
  {
   "ficha": "habitos-arbitro",
   "texto": "¿Qué debe incluir el plan de acción?",
   "opciones": [
    "Solo el objetivo final",
    "La opinión del árbitro principal",
    "Las sanciones por no cumplirlo",
    "Qué cambiar, fecha de inicio y de término, y los pasos"
   ],
   "correcta": 3,
   "explicacion": "El plan define qué comportamientos cambiar, con fecha de inicio y de término y los pasos a seguir, más un plan B."
  },
  {
   "ficha": "habitos-arbitro",
   "texto": "¿Para qué sirve el «plan B» en el método del artículo?",
   "opciones": [
    "Para abandonar el cambio si se complica",
    "Para tener otras acciones simples si algo de lo planeado no se logra",
    "Para delegar el cambio en otra persona",
    "Para fijar sanciones"
   ],
   "correcta": 1,
   "explicacion": "El artículo pregunta: si algo de lo planeado no se logra, ¿qué otras acciones simples puedes hacer? Ese es el plan B."
  },
  {
   "ficha": "dispositivos-electronicos",
   "texto": "Las bases no dicen nada sobre teléfonos. Durante la partida, al jugador se le cae del bolsillo un celular apagado. ¿Qué decides?",
   "opciones": [
    "Pierde la partida y el rival gana",
    "Nada, porque estaba apagado",
    "Advertencia",
    "Se le restan 10 minutos"
   ],
   "correcta": 0,
   "explicacion": "Art. 11.3.2.2: si es evidente que el jugador lleva encima un dispositivo no aprobado, pierde y el rival gana. Estar apagado solo importa si las bases permiten guardarlo en el bolso (11.3.2.1)."
  },
  {
   "ficha": "dispositivos-electronicos",
   "texto": "Las bases permiten el teléfono en el bolso. ¿Qué condiciones fijan las Leyes?",
   "opciones": [
    "En silencio y a la vista",
    "Apagado y en el bolsillo",
    "Completamente apagado y el bolso donde se acuerde con el árbitro",
    "Ninguna, si las bases lo permiten"
   ],
   "correcta": 2,
   "explicacion": "Art. 11.3.2.1: completamente apagado, el bolso colocado como se acuerde con el árbitro, y ningún jugador puede usarlo sin permiso."
  },
  {
   "ficha": "dispositivos-electronicos",
   "texto": "¿Pueden las bases fijar una sanción menor que la pérdida de la partida por llevar el teléfono encima?",
   "opciones": [
    "No, la pérdida es obligatoria",
    "Solo en partidas rápidas",
    "Solo con permiso de la FIDE",
    "Sí, el art. 11.3.2.2 lo permite"
   ],
   "correcta": 3,
   "explicacion": "Art. 11.3.2.2: las bases pueden especificar una sanción diferente, menos severa."
  },
  {
   "ficha": "dispositivos-electronicos",
   "texto": "Decides revisar a una jugadora. ¿Cómo debe hacerse?",
   "opciones": [
    "En la sala, frente a testigos",
    "En privado, por ti o por una persona autorizada del mismo género que la jugadora",
    "Solo con permiso de su federación",
    "Solo al final del torneo"
   ],
   "correcta": 1,
   "explicacion": "Art. 11.3.3: en privado y por una persona del mismo género que el jugador. La revisión puede incluir ropa, bolsos, otros objetos o el cuerpo."
  },
  {
   "ficha": "dispositivos-electronicos",
   "texto": "El jugador se niega a que lo revises. ¿Qué norma aplicas?",
   "opciones": [
    "El art. 12.9 (sanciones del árbitro)",
    "Pierde automáticamente",
    "Lo dejas pasar",
    "Llamas a la policía"
   ],
   "correcta": 0,
   "explicacion": "Art. 11.3.3: si el jugador no coopera, el árbitro toma medidas según el art. 12.9, que va de la advertencia a la expulsión."
  },
  {
   "ficha": "dispositivos-electronicos",
   "texto": "Un espectador usa el teléfono en la zona de juego. ¿Puede el árbitro actuar?",
   "opciones": [
    "No, las Leyes solo rigen a los jugadores",
    "Solo si el espectador es familiar de un jugador",
    "Sí: sin su autorización nadie puede usar un teléfono en el recinto (12.8)",
    "Solo si interfiere en una partida"
   ],
   "correcta": 2,
   "explicacion": "Art. 12.8: salvo autorización del árbitro, está prohibido que cualquier persona use un teléfono en el recinto o zonas contiguas designadas. El art. 12.7 permite expulsar a quien interfiera."
  },
  {
   "ficha": "dispositivos-electronicos",
   "texto": "Con su turno, un jugador quiere ir al baño. ¿Necesita tu permiso?",
   "opciones": [
    "No, el baño es parte del recinto",
    "Solo después de la jugada 40",
    "Solo en partidas rápidas",
    "Sí: quien tiene el turno necesita permiso para salir de la zona de juego"
   ],
   "correcta": 3,
   "explicacion": "Art. 11.2.3.2: el jugador que tiene el turno necesita permiso del árbitro para salir de la zona de juego (el baño es parte del recinto, pero no de la zona de juego)."
  },
  {
   "ficha": "juego-limpio-fide",
   "texto": "Un jugador te dice en voz baja: «creo que mi rival hace trampa». ¿Qué haces?",
   "opciones": [
    "Abres una investigación formal",
    "Le explicas que una queja debe presentarse por escrito con el formulario; puedes vigilar con discreción, pero no es una queja formal",
    "Revisas de inmediato al rival frente a todos",
    "Ignoras el comentario"
   ],
   "correcta": 1,
   "explicacion": "Fair Play Regulations 3.2.3 y 3.2.5: las quejas son por escrito y con formulario; no se aceptan orales ni informales. El art. 1.7 permite comentar en privado una sospecha para que el árbitro vigile."
  },
  {
   "ficha": "juego-limpio-fide",
   "texto": "¿Cuál de estas quejas es manifiestamente infundada según el reglamento?",
   "opciones": [
    "«Juega mucho mejor de lo que dice su rating», sin nada más",
    "«Lo vi mirar el teléfono en el baño»",
    "«Un espectador le hacía señas»",
    "«Tenía un auricular en el oído»"
   ],
   "correcta": 0,
   "explicacion": "Art. 3.2.9: una queja basada solo en la suposición de que alguien juega más fuerte que su rating se considera manifiestamente infundada."
  },
  {
   "ficha": "juego-limpio-fide",
   "texto": "Un jugador pierde puntos a propósito para bajar su rating y jugar luego en una categoría más baja. ¿Cómo lo califica el reglamento?",
   "opciones": [
    "No es trampa: es su decisión",
    "Solo es falta de ética",
    "Es trampa: manipulación de competiciones (sandbagging)",
    "Solo si gana un premio"
   ],
   "correcta": 2,
   "explicacion": "Art. 1.2.b: la manipulación de competiciones, incluido el sandbagging, es trampa. Y el intento cuenta como trampa (art. 1.8)."
  },
  {
   "ficha": "juego-limpio-fide",
   "texto": "Un torneo cerrado tiene promedio de 2520. ¿Qué nivel de protección le corresponde?",
   "opciones": [
    "Máxima",
    "Estándar",
    "Ninguno",
    "Aumentada"
   ],
   "correcta": 3,
   "explicacion": "Protection Measures (2024): round robins de 2500 o más (2300 femeniles) requieren protección aumentada; la máxima empieza en 2650 (2450 femeniles)."
  },
  {
   "ficha": "juego-limpio-fide",
   "texto": "¿Qué medida mínima exige el nivel estándar de protección?",
   "opciones": [
    "Un equipo de juego limpio nombrado por la FIDE",
    "Al menos una medida técnica de la lista del anexo A",
    "Escáneres en todas las puertas",
    "Transmisión en vivo de todas las partidas"
   ],
   "correcta": 1,
   "explicacion": "En el nivel estándar se debe adoptar al menos una medida técnica del anexo A (detectores de metales, cámaras, escáneres, etc.), además de designar a alguien a cargo del juego limpio."
  },
  {
   "ficha": "juego-limpio-fide",
   "texto": "Si no hay ninguna otra prueba, ¿qué puntaje z exige el reglamento para partidas presenciales?",
   "opciones": [
    "5,00",
    "2,50",
    "4,25",
    "4,75"
   ],
   "correcta": 0,
   "explicacion": "Art. 1.6.b: 5,00 para ajedrez presencial (4,25 en línea). Con otras pruebas, 2,50 o más puede usarse como apoyo. El 4,75 era la propuesta de 2014."
  },
  {
   "ficha": "juego-limpio-fide",
   "texto": "En un abierto de nivel estándar hay un caso de trampa entre dos jugadores sin título. ¿Quién lo investiga?",
   "opciones": [
    "Siempre la FPL",
    "El árbitro principal, que decide la sanción final",
    "La federación nacional",
    "La Comisión de Árbitros"
   ],
   "correcta": 2,
   "explicacion": "Art. 2.5: en torneos de protección estándar los casos van a la federación nacional, salvo que afecten un título FM/WFM o involucren a alguien con título FM/WFM o superior."
  },
  {
   "ficha": "juego-limpio-fide",
   "texto": "¿Quién impone hoy la sanción por trampa cuando la FPL lleva adelante un caso?",
   "opciones": [
    "La propia FPL",
    "El árbitro principal",
    "La Asamblea General",
    "La Comisión de Ética y Disciplina (EDC)"
   ],
   "correcta": 3,
   "explicacion": "Fair Play Regulations 4.11: la FPL decide si envía el caso a la EDC para su juicio; si no lo envía, se archiva."
  },
  {
   "ficha": "disciplina-arbitros",
   "texto": "¿Qué órgano juzga primero la mayoría de las faltas de conducta de un árbitro?",
   "opciones": [
    "La Comisión de Juego Limpio",
    "El Subcomité Disciplinario (DSC) de la Comisión de Árbitros",
    "El Consejo FIDE",
    "La federación del árbitro"
   ],
   "correcta": 1,
   "explicacion": "B.06.5, arts. 1 y 2: el DSC de la ARB, después de que la ARB declara admisible la queja. Los casos más graves pueden ir directo a la EDC."
  },
  {
   "ficha": "disciplina-arbitros",
   "texto": "¿Puede el DSC abrir un caso por su cuenta?",
   "opciones": [
    "No: solo decide casos que le envía la ARB",
    "Sí, cuando quiera",
    "Solo si hay prensa",
    "Sí, con permiso del presidente de la FIDE"
   ],
   "correcta": 0,
   "explicacion": "Art. 2.3: el DSC no investiga de oficio; decide un caso solo después de recibirlo de la ARB."
  },
  {
   "ficha": "disciplina-arbitros",
   "texto": "¿Cuál es la inhabilitación máxima que puede imponer el DSC a un árbitro por una primera falta?",
   "opciones": [
    "6 meses",
    "12 meses",
    "18 meses",
    "3 años"
   ],
   "correcta": 2,
   "explicacion": "Art. 4.1: hasta 18 meses la primera vez y hasta 24 si reincide. Las faltas que merecerían más se envían a la EDC (art. 2.4)."
  },
  {
   "ficha": "disciplina-arbitros",
   "texto": "¿Cuánto tiempo vale una advertencia por escrito del DSC?",
   "opciones": [
    "6 meses",
    "24 meses",
    "Para siempre",
    "12 meses"
   ],
   "correcta": 3,
   "explicacion": "Art. 4.1: la advertencia escrita vale 12 meses; la amonestación, 24 meses."
  },
  {
   "ficha": "disciplina-arbitros",
   "texto": "Un árbitro quiere apelar la decisión del DSC. ¿Ante quién y en qué plazo?",
   "opciones": [
    "Ante la ARB, en 30 días",
    "Ante el Consejo FIDE, en 15 días naturales",
    "Ante el Buró Presidencial, en la siguiente reunión",
    "No se puede apelar"
   ],
   "correcta": 1,
   "explicacion": "Art. 6: ante el Consejo FIDE, en 15 días naturales e improrrogables, con una cuota de 300 €. El Buró Presidencial era la instancia de la propuesta de 2014."
  },
  {
   "ficha": "disciplina-arbitros",
   "texto": "Un organizador se queja de que el árbitro cambió deliberadamente los emparejamientos. ¿En qué grupo de faltas cae?",
   "opciones": [
    "Infracciones técnicas",
    "Administrativas",
    "Mala conducta general",
    "No es falta"
   ],
   "correcta": 0,
   "explicacion": "Art. 3.6.1: cambiar deliberadamente los emparejamientos en contra de las normas aplicables es una infracción técnica."
  },
  {
   "ficha": "disciplina-arbitros",
   "texto": "Un jugador conoció los hechos hace 11 meses y recién ahora presenta la queja contra el árbitro. ¿Qué pasa?",
   "opciones": [
    "Se tramita normalmente",
    "Se tramita si la falta tiene menos de 3 años",
    "La ARB no la recibe: pasaron más de 9 meses desde que conoció los hechos",
    "Depende del DSC"
   ],
   "correcta": 2,
   "explicacion": "Art. 2.8: la ARB no recibe la queja si el denunciante conocía (o debía conocer) los hechos desde hacía más de nueve meses."
  },
  {
   "ficha": "disciplina-arbitros",
   "texto": "Un jugador no está de acuerdo con una decisión del árbitro sobre un reclamo de tablas. ¿Qué vía corresponde?",
   "opciones": [
    "Una queja al DSC",
    "Una queja a la FPL",
    "Ninguna: el árbitro es inapelable",
    "Apelar según el art. 11.10 de las Leyes, ante el órgano que fijen las bases"
   ],
   "correcta": 3,
   "explicacion": "Art. 11.10: salvo que las bases digan otra cosa, el jugador puede apelar cualquier decisión del árbitro. El B.06.5 trata de la conducta del árbitro, no de revisar sus decisiones técnicas en la sala."
  },
  {
   "ficha": "torneo-valido-rating",
   "texto": "Un abierto sin jugadores de más de 2700 ni normas posibles. ¿Con cuánta anticipación mínima se registra?",
   "opciones": [
    "1 día",
    "3 días",
    "7 días",
    "30 días"
   ],
   "correcta": 1,
   "explicacion": "Reglamento de Rating, art. 0.2.2: tres días antes del inicio. Treinta si hay alguien de más de 2700 o una jugadora de más de 2500 (0.2.1), o si es torneo de normas (Títulos 1.1.1)."
  },
  {
   "ficha": "torneo-valido-rating",
   "texto": "En una partida juegan una jugadora de 1950 y un jugador de 1720. ¿Qué tiempo mínimo por jugador exige el art. 1.1?",
   "opciones": [
    "90 minutos",
    "60 minutos",
    "120 minutos",
    "75 minutos"
   ],
   "correcta": 0,
   "explicacion": "Art. 1.1: si al menos uno tiene 1800 o más, cada jugador debe tener al menos 90 minutos (suponiendo 60 jugadas). Además, desde noviembre de 2026, 60′+30″ (90 min) es estándar en cualquier torneo."
  },
  {
   "ficha": "torneo-valido-rating",
   "texto": "¿Cuántos minutos equivale el ritmo 45′ + 30″ para el cálculo del tiempo mínimo?",
   "opciones": [
    "45",
    "60",
    "75",
    "90"
   ],
   "correcta": 2,
   "explicacion": "Se cuenta con 60 jugadas: 45 + 60 × 30 s = 45 + 30 = 75 minutos por jugador."
  },
  {
   "ficha": "torneo-valido-rating",
   "texto": "Un abierto con un jugador de 2430 quiere usar 45′ + 30″. No es del Circuito FIDE. ¿Se puede evaluar para rating estándar?",
   "opciones": [
    "Sí, la resolución de 2026 lo permite siempre",
    "Sí, con una ronda por día",
    "Sí, si es suizo",
    "No: el 45′+30″ se admite solo en el Circuito FIDE o si nadie tiene 2400 o más"
   ],
   "correcta": 3,
   "explicacion": "Resolución del Consejo FIDE (nov-2026), puntos 2 y 3: 45′+30″ en torneos del Circuito FIDE que cumplan sus requisitos o en torneos sin jugadores de 2400 o más. En cambio, 60′+30″ sí sirve en cualquier torneo."
  },
  {
   "ficha": "torneo-valido-rating",
   "texto": "Un torneo solo para rating (sin normas) juega a 60′ + 30″. ¿Cuántas rondas por día puede tener como máximo?",
   "opciones": [
    "2",
    "4",
    "3",
    "6"
   ],
   "correcta": 1,
   "explicacion": "Cada partida de 60 jugadas dura 3 horas (90 min por jugador); el límite es de 12 horas de juego por día (art. 3.1): 4 rondas. Las dos rondas por día son el límite para torneos de normas."
  },
  {
   "ficha": "torneo-valido-rating",
   "texto": "Si el primer control de tiempo fija un número de jugadas, ¿cuál es el mínimo?",
   "opciones": [
    "30",
    "20",
    "40",
    "60"
   ],
   "correcta": 0,
   "explicacion": "Reglamento de Rating, art. 1.2: al menos 30 jugadas. La edición de 2014 decía 40."
  },
  {
   "ficha": "torneo-valido-rating",
   "texto": "Un árbitro del torneo no pagó su cuota de registro FIDE. ¿Qué riesgo hay?",
   "opciones": [
    "Ninguno",
    "Solo una multa al árbitro",
    "El evento puede no ser evaluado y no se aceptan sus normas de árbitro",
    "Que el árbitro pierda su título"
   ],
   "correcta": 2,
   "explicacion": "B.06.1 (2026), arts. 6.1 y 6.2: todos los árbitros de un evento con rating deben cumplir el Reglamento Financiero, incluida la cuota de registro; si no, el evento puede no evaluarse y las normas de árbitro no se aceptan."
  },
  {
   "ficha": "torneo-valido-rating",
   "texto": "Un jugador sin rating jugó 4 partidas contra rivales con rating este mes. ¿Recibe rating en la próxima lista?",
   "opciones": [
    "Sí, si ganó la mitad",
    "Sí, con cualquier resultado",
    "No: necesita 9 partidas",
    "No: necesita al menos 5 partidas contra rivales con rating (pueden sumarse de varios torneos en 26 meses)"
   ],
   "correcta": 3,
   "explicacion": "Art. 7.1.4: el primer rating se publica con al menos 5 partidas contra rivales con rating, sumando torneos de períodos consecutivos de hasta 26 meses, y solo si es de 1400 o más."
  },
  {
   "ficha": "torneo-valido-rating",
   "texto": "Un torneo dura 45 días. ¿Qué exige el Reglamento de Rating?",
   "opciones": [
    "Que no pase de 30 días",
    "Informar los resultados parciales cada mes",
    "Pagar una extensión cada 30 días",
    "Nada especial"
   ],
   "correcta": 1,
   "explicacion": "Art. 4.1: si el torneo dura más de 30 días, los resultados parciales se informan mensualmente. El límite de 90 días con extensiones pagadas era de la normativa citada en 2014."
  }
 ],
 "casos": [
  {
   "id": "torre-invertida-mate",
   "ficha": "promocion-coronacion",
   "titulo": "La «dama» que era una torre",
   "nivel": "Básico",
   "ritmo": null,
   "escena": "Partida estándar. Blancas: rey en d6 y peón en g7; negras: rey en e8. Las blancas juegan g7-g8, ponen una torre invertida en g8, dicen «dama» y pulsan el reloj. Las negras, en vez de reclamar, responden 1…Rf7, que solo es legal si la pieza de g8 es una torre. Las blancas te llaman: dicen que era mate.",
   "decision": {
    "texto": "¿Qué decides?",
    "opciones": [
     "Era mate: ganan las blancas",
     "La pieza es una torre: 1…Rf7 es legal y la partida sigue; pones la torre derecha",
     "Jugada ilegal de las blancas: 2 minutos a las negras",
     "Tablas"
    ],
    "correcta": 1,
    "explicacion": "La elección queda decidida al tocar la casilla (4.4.4) y una torre invertida es una torre aunque se diga «dama» (Manual del Árbitro 2026). Con torre en g8 es jaque, no mate, y Rf7 es legal. El árbitro corrige la pieza con la mínima molestia."
   }
  },
  {
   "id": "telefono-sin-material",
   "ficha": "siete-cartas",
   "titulo": "El teléfono y el rey solo",
   "nivel": "Básico",
   "ritmo": null,
   "escena": "Abierto estándar; las bases no dicen nada sobre teléfonos. A las blancas, que tienen dama y rey, les suena el celular en el bolsillo. Las negras solo tienen el rey y piden la victoria.",
   "decision": {
    "texto": "¿Cuál es el resultado?",
    "opciones": [
     "Tablas: las negras no pueden dar mate",
     "Ganan las negras (0-1)",
     "Se le quitan 5 minutos a las blancas y sigue",
     "Advertencia y sigue la partida"
    ],
    "correcta": 1,
    "explicacion": "Art. 11.3.2.2: si es evidente que el jugador lleva el aparato encima, pierde y el rival gana, aunque no tenga material para dar mate (Manual del Árbitro 2026). Una sanción menor solo vale si la prevén las bases."
   }
  },
  {
   "id": "peon-sin-cambiar",
   "ficha": "promocion-coronacion",
   "titulo": "El peón que se quedó en la octava",
   "nivel": "Intermedio",
   "ritmo": null,
   "escena": "Partida estándar, sin jugadas ilegales previas. Las blancas llevan su peón a e8, no lo cambian por ninguna pieza y pulsan el reloj. Estás mirando la partida.",
   "decision": {
    "texto": "¿Qué haces?",
    "opciones": [
     "Esperas a que las negras reclamen",
     "Intervienes: el peón se cambia por una dama y das 2 minutos a las negras",
     "Dejas que las blancas elijan la pieza, sin sanción",
     "Declaras perdida la partida de las blancas"
    ],
    "correcta": 1,
    "explicacion": "Art. 7.5.2: pulsar el reloj sin cambiar el peón es jugada ilegal y el peón se cambia por una dama; art. 7.5.5: 2 minutos para el rival. En estándar el árbitro interviene de inmediato, sin esperar un reclamo (Manual del Árbitro 2026)."
   }
  },
  {
   "id": "bandera-caballos",
   "ficha": "posicion-muerta",
   "titulo": "Bandera con caballos",
   "nivel": "Intermedio",
   "ritmo": null,
   "escena": "Partida rápida con un árbitro por cada tres mesas. En el tablero: blancas con rey y caballo; negras con rey y caballo. A las blancas se les cae la bandera y las negras te llaman.",
   "decision": {
    "texto": "¿Cuál es el resultado?",
    "opciones": [
     "Tablas por posición muerta",
     "Tablas por material insuficiente",
     "Ganan las negras",
     "Se suma tiempo a las blancas y sigue la partida"
    ],
    "correcta": 2,
    "explicacion": "Art. 6.9 (y A.4 con supervisión adecuada): solo son tablas si las negras no pueden dar mate con ninguna serie de jugadas legales. Con rey y caballo contra rey y caballo existe un mate legal, así que ganan las negras."
   }
  },
  {
   "id": "torre-y-cadena",
   "ficha": "posicion-muerta",
   "titulo": "Cadena de peones con torre",
   "nivel": "Avanzado",
   "ritmo": null,
   "escena": "Blancas: Re2, Td2 y peones en a3, b4, c3, d4, e3, f4, g3, h4. Negras: Rh6 y peones en a4, b5, c4, d5, e4, f5, g4, h5. Las negras te dicen que es posición muerta y que la partida debe terminar.",
   "decision": {
    "texto": "¿Qué decides?",
    "opciones": [
     "Tablas: los peones están bloqueados",
     "Tablas si las blancas no se oponen",
     "Ganan las blancas por material",
     "La partida sigue: la torre puede sacrificarse y abrir la posición"
    ],
    "correcta": 3,
    "explicacion": "No es posición muerta (art. 5.2.2): por ejemplo 1.Td1 Rg6 2.Th1 Rf6 3.Th3 gxh3 4.g4 hxg4 5.h5 … y el peón h corona con mate en la jugada 13. Si quieren tablas, pueden acordarlas (art. 5.2.3)."
   }
  },
  {
   "id": "ko-armagedon-sin-bases",
   "ficha": "eliminacion-directa",
   "titulo": "Armagedón sin reglas",
   "nivel": "Intermedio",
   "ritmo": null,
   "escena": "Torneo de eliminación directa. Un match termina empatado después de las partidas rápidas y las bases solo dicen «si persiste el empate, Armagedón». Los dos jugadores quieren las negras y discuten el ritmo.",
   "decision": {
    "texto": "¿Qué haces?",
    "opciones": [
     "Aplicas lo que dicen las Leyes del Ajedrez sobre el Armagedón",
     "Declaras ganador al de mayor rating",
     "Las Leyes no lo regulan: con el organizador, fijas y anuncias a ambos el ritmo, quién gana con tablas y cómo se eligen los colores (por ejemplo, por sorteo), antes de empezar",
     "Declaras el match empatado"
    ],
    "correcta": 2,
    "explicacion": "El Armagedón no está en las Leyes 2023 ni en el C.07. El art. 3.1 del C.07 pide que las bases fijen colores y ritmos del play-off; si faltan, decides con el organizador y lo anuncias antes de jugar (art. 12.2.2: actuar en el mejor interés de la competición). Para el próximo torneo, que vaya en las bases."
   }
  },
  {
   "id": "planilla-quince-minutos",
   "ficha": "zonas-sala-juego",
   "titulo": "«No anoto: tengo poco tiempo»",
   "nivel": "Básico",
   "ritmo": null,
   "escena": "Partida estándar a 90 minutos para toda la partida, sin incremento. A un jugador le quedan 15 minutos y a su rival una hora. Un auxiliar le pide que anote y el jugador le contesta a gritos que no puede, que no tiene tiempo.",
   "decision": {
    "texto": "¿Qué haces?",
    "opciones": [
     "Le das la razón: con poco tiempo no se anota",
     "Le pides que baje la voz y le explicas que debe anotar; si se niega de forma persistente, puedes llegar a declararle perdida la partida",
     "Le declaras perdida la partida de inmediato",
     "Le quitas 5 minutos sin advertencia"
    ],
    "correcta": 1,
    "explicacion": "Arts. 8.1.1 y 8.4: con 15 minutos y sin incremento de 30 s debe anotar (solo se libera con menos de 5 minutos). Primero calma y explicación; la negativa persistente se sanciona con la pérdida (art. 11.7), y antes puedes usar sanciones menores (art. 12.9)."
   }
  },
  {
   "id": "telefono-en-bolsillo",
   "ficha": "leyes-2013-a-2023",
   "titulo": "Un teléfono apagado en el bolsillo",
   "nivel": "Básico",
   "ritmo": null,
   "escena": "Torneo estándar. Las bases permiten guardar los teléfonos completamente apagados en el bolso, junto a la mesa del árbitro. En la jugada 25 se ve que un jugador tiene en el bolsillo del pantalón su teléfono, apagado.",
   "decision": {
    "texto": "¿Qué decides?",
    "opciones": [
     "Nada: está apagado",
     "Advertencia y que lo lleve al bolso",
     "Partida perdida para ese jugador, salvo que las bases fijen una sanción menor",
     "Le quitas 5 minutos"
    ],
    "correcta": 2,
    "explicacion": "Art. 11.3.2.2: si es evidente que el jugador lleva un dispositivo encima en el recinto, pierde; el permiso del 11.3.2.1 es solo para guardarlo apagado en el bolso. Las bases pueden fijar una sanción menor."
   }
  },
  {
   "id": "ilegal-relampago",
   "ficha": "rapidas-relampago-hoy",
   "titulo": "Jugada ilegal en relámpago sin supervisión completa",
   "nivel": "Básico",
   "ritmo": null,
   "escena": "Torneo relámpago a 3 min + 2 s, un árbitro para varias mesas. Un jugador deja su rey en jaque y pulsa el reloj. Su rival, antes de mover, detiene el reloj y te llama. Es la primera jugada ilegal de ese jugador.",
   "decision": {
    "texto": "¿Qué decides?",
    "opciones": [
     "El rival gana la partida",
     "Se vuelve a la posición anterior y el rival recibe 1 minuto",
     "Se vuelve atrás sin sanción",
     "Se vuelve atrás y el rival recibe 2 minutos"
    ],
    "correcta": 1,
    "explicacion": "B.3 remite a A.5.2 y A.3: el rival reclamó antes de mover, así que se aplica el 7.5.5 con 1 minuto. En el texto de 2013 el rival ganaba la partida."
   }
  },
  {
   "id": "buchholz-incomparecencias",
   "ficha": "buchholz-no-jugadas",
   "titulo": "Dos victorias por incomparecencia",
   "nivel": "Intermedio",
   "ritmo": null,
   "escena": "Abierto suizo a 5 rondas, desempate: Buchholz (sin modificadores, sin reglas especiales en las bases). Dos jugadoras terminan con 4 puntos. La jugadora X ganó por incomparecencia en las rondas 1 (rival con 0 puntos al final) y 3 (rival con 1); sus rivales jugados tienen 4, 3 y 3. La jugadora Y jugó todas sus partidas; sus rivales tienen 0, 2, 3, 3 y 4½. El padre de Y protesta.",
   "decision": {
    "texto": "¿Qué Buchholz corresponde a cada una?",
    "opciones": [
     "X 14, Y 12½: gana X",
     "X 18, Y 12½: gana X",
     "X 11, Y 12½: gana Y",
     "X 12½, Y 12½: hay que ir al sorteo"
    ],
    "correcta": 2,
    "explicacion": "C.07, art. 16.4.1: cada incomparecencia propia vale la puntuación de la jugadora (4) con tope en la del rival programado: mín(4; 0) + 4 + mín(4; 1) + 3 + 3 = 11. Y: 12½. El 14 sale de la regla de 2009, que ya no rige."
   }
  },
  {
   "id": "ronda2-incomparecencia",
   "ficha": "holandes-2026",
   "titulo": "¿6-9 o 6-10?",
   "nivel": "Avanzado",
   "ritmo": null,
   "escena": "Suizo de 10 jugadores, Sistema Holandés. Ronda 1: 1-6 0-1, 7-2 tablas, 3-8 tablas, 9-4 1-0 y 5-10 con victoria del 10 por incomparecencia. En el grupo de 1 punto están 6, 9 y 10. Un padre protesta porque el programa emparejó 6-10 y no el «natural» 6-9.",
   "decision": {
    "texto": "¿Qué emparejamiento es el correcto en ese grupo?",
    "opciones": [
     "6-9; el 10 baja",
     "6-10; el 9 baja",
     "9-10; el 6 baja",
     "Cualquiera: todas las opciones cumplen los colores"
    ],
    "correcta": 1,
    "explicacion": "Art. 1.4.3: la victoria sin jugar del 10 en la ronda 1 cuenta como bajada. C14 minimiza los residentes que bajan dos rondas seguidas, así que baja el 9 y se juega 6-10 (6 con blancas)."
   }
  },
  {
   "id": "abandono-contra-rey-solo",
   "ficha": "abandono-y-piezas",
   "titulo": "Abandona quien no puede perder",
   "nivel": "Básico",
   "ritmo": null,
   "escena": "Torneo escolar por equipos. La jugadora de blancas del segundo tablero tiene rey, dama, dos torres, alfil y cuatro peones; su rival, solo el rey. Te llama y te dice que abandona. Lo confirma.",
   "decision": {
    "texto": "¿Qué resultado anotas?",
    "opciones": [
     "0–1: abandonó",
     "½–½: el rival no puede dar mate",
     "1–0: tiene todo el material",
     "La partida sigue: no se acepta el abandono"
    ],
    "correcta": 1,
    "explicacion": "Art. 5.1.2: el abandono pierde, salvo que el rival no pueda dar mate con ninguna serie de jugadas legales. Un rey solo nunca puede dar mate: tablas."
   }
  },
  {
   "id": "alfil-prestado",
   "ficha": "abandono-y-piezas",
   "titulo": "El alfil de la mesa vecina",
   "nivel": "Básico",
   "ritmo": null,
   "escena": "Partida rápida. Al mover, un alfil se le cae al suelo a un jugador; toma un alfil de la mesa de al lado, lo pone en la casilla y pulsa el reloj. El rival reclama que ese no es «su» alfil.",
   "decision": {
    "texto": "¿Qué decides?",
    "opciones": [
     "La jugada es ilegal: 1 minuto al rival",
     "La jugada vale; devuelves el alfil prestado, pones el original y, según el caso, adviertes al jugador",
     "El jugador pierde por usar una pieza ajena",
     "Se repite la partida"
    ],
    "correcta": 1,
    "explicacion": "Todas las piezas funcionan igual: la jugada vale. Pero lo correcto era pausar el reloj y pedir ayuda (art. 6.11.2); tomar piezas de otro tablero molesta a otra partida (art. 12.2.4). Puedes advertir (art. 12.9.1)."
   }
  },
  {
   "id": "jugada-devuelta",
   "ficha": "abandono-y-piezas",
   "titulo": "«Él me dejó devolver una jugada»",
   "nivel": "Intermedio",
   "ritmo": null,
   "escena": "Partida estándar. Un jugador cuenta que hace diez jugadas su rival le permitió devolver una jugada. Ahora el rival quiere lo mismo y él se niega. Te piden que decidas.",
   "decision": {
    "texto": "¿Qué haces?",
    "opciones": [
     "Autorizo la devolución por igualdad",
     "Rechazo el pedido, la partida sigue desde la posición actual y puedo advertir a ambos",
     "Vuelvo a la posición de hace diez jugadas",
     "Declaro tablas"
    ],
    "correcta": 1,
    "explicacion": "Art. 4.7: una jugada soltada no se cambia; el árbitro no puede autorizarlo. El acuerdo anterior era contrario a las Leyes (art. 11.1) y puede merecer una advertencia (art. 12.9.1)."
   }
  },
  {
   "id": "bandera-buho21",
   "ficha": "bandera-y-mate-posible",
   "titulo": "La bandera de las blancas",
   "nivel": "Intermedio",
   "ritmo": null,
   "escena": "Partida estándar. Blancas: Rh3, Th4, Th1, Cf1. Negras: Rf2, Cf7. Juegan las blancas y se les cae la bandera. El jugador de blancas dice que las negras «no tienen con qué dar mate».",
   "decision": {
    "texto": "¿Cuál es el resultado?",
    "opciones": [
     "Tablas: rey y caballo no pueden dar mate",
     "Ganan las negras",
     "Continúa la partida",
     "Tablas por posición muerta"
    ],
    "correcta": 1,
    "explicacion": "Art. 6.9: existe la serie legal 1.Th2+ Rf3 2.Cg3 Cg5#, así que las negras sí pueden dar mate y las blancas pierden por tiempo."
   }
  },
  {
   "id": "bandera-icc",
   "ficha": "bandera-y-mate-posible",
   "titulo": "Material de sobra, pero sin tiempo",
   "nivel": "Intermedio",
   "ritmo": null,
   "escena": "Partida estándar. Blancas: Rd6, Cd7. Negras: Rb6, Tc4, Ab2, Cc1, peón a5. La última jugada fue Cd7+ y a las negras se les cae la bandera. El jugador de negras pide tablas porque «un caballo solo no da mate».",
   "decision": {
    "texto": "¿Qué decides?",
    "opciones": [
     "Tablas",
     "Ganan las blancas",
     "Ganan las negras por material",
     "Se reanuda la partida con un minuto más para las negras"
    ],
    "correcta": 1,
    "explicacion": "Existe 1…Rb5 2.Rd5 Ra4 3.Rxc4 Aa3 4.Cb6#: las blancas pueden dar mate con una serie legal, así que las negras pierden por tiempo (art. 6.9)."
   }
  },
  {
   "id": "patrullaje-dos-minutos",
   "ficha": "supervision-relojes",
   "titulo": "Dos minutos que no aparecen",
   "nivel": "Intermedio",
   "ritmo": null,
   "escena": "Ritmo: 2 horas + 30 s por jugada (el reloj suma el incremento después de cada jugada). A las 3 horas de ronda, sin pausas, cada jugador lleva 38 jugadas. Los relojes marcan blancas 60:00 y negras 40:00.",
   "decision": {
    "texto": "¿Qué concluyes?",
    "opciones": [
     "Los relojes están bien",
     "Entre los dos muestran 2 minutos de más; hay que buscar la causa antes de ajustar",
     "Sobran 20 minutos",
     "Las negras deben perder 2 minutos como sanción"
    ],
    "correcta": 1,
    "explicacion": "Pensado: (120 − 60) + 19 = 79 y (120 − 40) + 19 = 99; suman 178, no 180. Hay 2 minutos de diferencia, pero la suma no dice en qué reloj: revisa configuración, incremento y contador (art. 6.10) antes de corregir."
   }
  },
  {
   "id": "reclamo-repeticion-rapida",
   "ficha": "reloj-programacion-sanciones",
   "titulo": "Reclamo incorrecto en rápidas",
   "nivel": "Básico",
   "ritmo": null,
   "escena": "Partida rápida (15 min + 10 s). Las blancas, con 4:20, reclaman tablas por triple repetición; las negras tienen 3:50. Compruebas que la posición solo se repitió dos veces.",
   "decision": {
    "texto": "¿Cómo quedan los relojes?",
    "opciones": [
     "Blancas 4:20, negras 5:50",
     "Blancas 4:20, negras 4:50",
     "Blancas 3:20, negras 3:50",
     "Blancas 4:20, negras 6:50"
    ],
    "correcta": 1,
    "explicacion": "Art. 9.5.3 con A.3: en rápidas, el reclamo incorrecto suma un minuto al rival. Negras de 3:50 a 4:50; las blancas no cambian."
   }
  },
  {
   "id": "960-posicion-mal-colocada",
   "ficha": "ajedrez960-posicion",
   "titulo": "Ajedrez960: la posición estaba mal",
   "nivel": "Básico",
   "ritmo": null,
   "escena": "Torneo de Ajedrez960, ronda 2. En la jugada 6 un jugador te llama: su rival colocó las piezas negras como las blancas, pero en el orden de la posición clásica, no en espejo de la posición sorteada.",
   "decision": {
    "texto": "¿Qué haces?",
    "opciones": [
     "La partida sigue: ya van 6 jugadas",
     "Anulas la partida y se juega una nueva con la posición correcta",
     "Corriges las piezas negras y siguen",
     "Pierde quien colocó mal las piezas"
    ],
    "correcta": 1,
    "explicacion": "Las Leyes se aplican igual que en el ajedrez clásico: si la posición inicial era incorrecta, se anula la partida y se juega una nueva (art. 7.2). Directrices II.2.3 exige que las negras estén en espejo."
   }
  },
  {
   "id": "suizo-pab-repetido",
   "ficha": "suizo-descanso-subgrupos",
   "titulo": "¿Otra vez descanso?",
   "nivel": "Intermedio",
   "ritmo": null,
   "escena": "Abierto suizo a 7 rondas, 41 jugadores en la ronda 5. El programa propone dar el PAB al jugador 39, que tiene 1 punto. Revisas: ese punto lo ganó en la ronda 2 porque su rival no se presentó.",
   "decision": {
    "texto": "¿Aceptas el emparejamiento?",
    "opciones": [
     "Sí, tiene la puntuación más baja",
     "No: no puede recibir el PAB, porque ya sumó sin jugar los puntos de una victoria",
     "Sí, porque una incomparecencia no es un PAB",
     "Le das medio punto en vez de uno"
    ],
    "correcta": 1,
    "explicacion": "C.04.1 art. 4 y criterio [C2] del C.04.3: no recibe el PAB quien ya sumó, en una sola ronda y sin jugar, los puntos de una victoria. Revisa que el programa tenga bien cargada esa incomparecencia."
   }
  },
  {
   "id": "bandera-caballos-n14",
   "ficha": "posicion-muerta-n14",
   "titulo": "Bandera con caballos",
   "nivel": "Básico",
   "ritmo": null,
   "escena": "Abierto de rápidas, 10 min + 0 s, sin las Directrices III anunciadas. Quedan rey y caballo para cada uno. Cae la bandera de las negras y las blancas te llaman. Las negras protestan: «¡Es un final de tablas, nadie puede ganar!».",
   "decision": {
    "texto": "¿Cuál es el resultado?",
    "opciones": [
     "Tablas: final de tablas teóricas",
     "Ganan las blancas",
     "Tablas por posición muerta",
     "Se repite la partida"
    ],
    "correcta": 1,
    "explicacion": "Art. 6.9: pierde quien se queda sin tiempo, salvo que el rival no pueda dar mate con ninguna serie legal. Con rey y caballo contra rey y caballo esa serie existe (el caballo propio puede tapar la huida del rey)."
   }
  },
  {
   "id": "cadena-bloqueada",
   "ficha": "posicion-muerta-n14",
   "titulo": "La cadena bloqueada",
   "nivel": "Intermedio",
   "ritmo": null,
   "escena": "Partida estándar. Peones blancos en a3, b4, c3, d4, e3, f4 y g3; negros en a4, b5, c4, d5, e4, f5 y g4. Rey blanco en g2 y rey negro en g6; no hay más piezas. Los jugadores siguen moviendo los reyes.",
   "decision": {
    "texto": "¿Qué haces?",
    "opciones": [
     "Nada hasta que alguien reclame",
     "Declaras tablas: es una posición muerta",
     "Esperas a la quíntuple repetición",
     "Aplicas la regla de las 50 jugadas"
    ],
    "correcta": 1,
    "explicacion": "Ningún rey puede cruzar la cadena y no hay capturas ni jugadas de peón posibles: nadie puede dar mate con ninguna serie legal. Art. 5.2.2: la partida terminó en tablas."
   }
  },
  {
   "id": "coronacion-kamsky",
   "ficha": "coronacion-dos-manos",
   "titulo": "La coronación de Tromsø",
   "nivel": "Intermedio",
   "ritmo": null,
   "escena": "Partida estándar. Un jugador corona: retira el peón de la penúltima fila con la mano izquierda y coloca la dama en la casilla de promoción con la derecha; el peón nunca toca la última fila. Pulsa el reloj. El rival reclama: «el peón no llegó y además usó las dos manos». Es la primera infracción del jugador.",
   "decision": {
    "texto": "¿Qué decides?",
    "opciones": [
     "Jugada ilegal por no llegar a la última fila: dos minutos al rival",
     "No llegar no es infracción; las dos manos se sancionan como jugada ilegal: dos minutos al rival",
     "Se rechaza todo: la coronación es válida",
     "Advertencia por las dos manos y nada más"
    ],
    "correcta": 1,
    "explicacion": "Art. 4.6.1: el peón no tiene que llegar a la casilla. Art. 7.5.4: usar las dos manos en una sola jugada y pulsar el reloj se sanciona como jugada ilegal; por la primera, dos minutos al rival (7.5.5), y cuenta para la pérdida por segunda ilegal."
   }
  },
  {
   "id": "telefono-bolso",
   "ficha": "sede-y-dispositivos",
   "titulo": "El teléfono que vibra en el bolso",
   "nivel": "Básico",
   "ritmo": null,
   "escena": "Las bases no dicen nada sobre dispositivos. Durante la partida se escucha vibrar un teléfono en el bolsillo de un jugador. El rival solo tiene rey y caballo.",
   "decision": {
    "texto": "¿Cuál es el resultado?",
    "opciones": [
     "Tablas, porque el rival no puede ganar",
     "Advertencia y sigue la partida",
     "Pierde el jugador del teléfono; el rival gana",
     "Dos minutos al rival"
    ],
    "correcta": 2,
    "explicacion": "Art. 11.3.2.2: si es evidente que el jugador lleva el dispositivo encima, pierde y el rival gana. La regla antigua daba tablas si el rival no podía ganar; la vigente no trae esa excepción. Las bases podrían haber fijado una sanción menor, pero aquí no dicen nada."
   }
  },
  {
   "id": "torre-invertida-mate-n16",
   "ficha": "torre-invertida-coronacion",
   "titulo": "La «dama» que da mate en diagonal",
   "nivel": "Básico",
   "ritmo": null,
   "escena": "Partida estándar. Las blancas coronan colocando una torre de cabeza y dicen «dama». Dos jugadas después, mueven esa pieza en diagonal, anuncian mate y pulsan el reloj. Las negras llaman al árbitro. Es la primera infracción de las blancas.",
   "decision": {
    "texto": "¿Qué decides?",
    "opciones": [
     "Mate: la pieza era una dama",
     "Jugada ilegal: la pieza es una torre; se restablece la posición y dos minutos para las negras",
     "Las blancas pierden de inmediato",
     "Se cambia la torre por una dama y vale el mate"
    ],
    "correcta": 1,
    "explicacion": "Según el Manual del Árbitro 2026, la torre invertida es una torre aunque se la llame dama; moverla en diagonal es jugada ilegal. Se aplica el art. 7.5: se restablece la posición y, por ser la primera, dos minutos para el rival (7.5.5). El mate no vale porque la jugada no cumple el art. 3 (5.1.1)."
   }
  },
  {
   "id": "norma-siete-rondas",
   "ficha": "rating-performance-normas",
   "titulo": "La norma que no fue",
   "nivel": "Intermedio",
   "ritmo": null,
   "escena": "Al terminar un torneo de 7 rondas, todos contra todos, un jugador te muestra que su performance es 2620 contra rivales de promedio 2450 y te pide el certificado de norma de GM.",
   "decision": {
    "texto": "¿Qué le respondes?",
    "opciones": [
     "Que sí es norma de GM",
     "Que sí, pero solo de IM",
     "Que no: una norma exige al menos 9 partidas",
     "Que depende del 35 %"
    ],
    "correcta": 2,
    "explicacion": "Art. 1.4.1 del Reglamento de Títulos: la norma exige al menos 9 partidas (las excepciones son campeonatos por equipos y la Copa del Mundo). Aunque el Rp y el Ra alcancen, con 7 partidas no hay norma."
   }
  },
  {
   "id": "rapida-primera-ilegal",
   "ficha": "leyes-2014-a-2023",
   "titulo": "Primera jugada ilegal en una rápida",
   "nivel": "Básico",
   "ritmo": null,
   "escena": "Abierto de rápidas, 15 minutos más 10 segundos por jugada; las bases dicen que se aplica el art. A.5 (un árbitro para muchas mesas). Ves que las negras acaban de enrocar con el rey en jaque y pulsaron el reloj. Las blancas todavía no han jugado. Es la primera jugada ilegal de las negras en la partida.",
   "decision": {
    "texto": "¿Qué haces?",
    "opciones": [
     "Restableces la posición, las negras deben jugar con el rey si tienen una jugada legal (pieza tocada) y das 1 minuto a las blancas",
     "Declaras perdida la partida de las negras",
     "Restableces la posición y das 2 minutos a las blancas",
     "No intervienes: solo pueden reclamar las blancas"
    ],
    "correcta": 0,
    "explicacion": "Art. A.5.2: el árbitro actúa según el art. 7.5.5 si el rival no ha jugado. Se restablece la posición (7.5.1, con los arts. 4.3 y 4.7 para la jugada que reemplaza a la ilegal: el rey fue tocado) y, en rápidas, la sanción es de 1 minuto (art. A.3). En 2014 esto habría sido pérdida (art. A.4.2)."
   }
  },
  {
   "id": "abandono-sin-mate",
   "ficha": "leyes-2014-a-2023",
   "titulo": "Abandona, pero el rival no puede ganar",
   "nivel": "Básico",
   "ritmo": null,
   "escena": "Partida estándar. Las blancas tienen rey y alfil; las negras, rey solo. Las negras llevan mucho tiempo jugando sin rumbo y, cansadas, detienen el reloj y dicen «abandono». Las blancas firman la planilla como ganadoras.",
   "decision": {
    "texto": "¿Cuál es el resultado?",
    "opciones": [
     "Ganan las blancas por abandono",
     "Ganan las blancas por tiempo",
     "Tablas: las blancas no pueden dar mate con ninguna serie de jugadas legales",
     "Se repite la partida"
    ],
    "correcta": 2,
    "explicacion": "Art. 5.1.2 (Leyes 2023): pierde quien abandona, salvo que el rival no pueda dar mate con ninguna serie de jugadas legales; con rey y alfil contra rey solo no hay mate posible, así que el resultado es tablas. (En 2014 el abandono daba siempre la victoria al rival.)"
   }
  },
  {
   "id": "telefono-en-bolso",
   "ficha": "dispositivos-electronicos",
   "titulo": "El teléfono que vibró en el bolso",
   "nivel": "Intermedio",
   "ritmo": null,
   "escena": "Abierto con rating. Las bases permiten guardar el teléfono completamente apagado en el bolso, que debe quedar bajo la silla. Durante la ronda 5, el bolso de un jugador empieza a vibrar con una llamada. Él no lo ha tocado.",
   "decision": {
    "texto": "¿Qué consideras al decidir?",
    "opciones": [
     "No cumplió la condición de tenerlo completamente apagado (11.3.2.1); aplicas lo que digan las bases para ese caso o, si no dicen nada, las sanciones del art. 12.9 con tu criterio",
     "Nada: el teléfono está en el bolso, como permiten las bases",
     "Pierde automáticamente por llevarlo encima (11.3.2.2)",
     "Expulsas al jugador del torneo"
    ],
    "correcta": 0,
    "explicacion": "El art. 11.3.2.1 permite el teléfono en el bolso solo si está completamente apagado; un teléfono que vibra no lo está. El art. 11.3.2.2 (pérdida) habla del dispositivo que el jugador lleva encima, y el teléfono estaba en el bolso. Las bases deberían prever la sanción; si no lo hacen, el árbitro decide con el art. 12.9. Por eso conviene que las bases sean claras."
   }
  },
  {
   "id": "ritmo-45-30",
   "ficha": "torneo-valido-rating",
   "titulo": "¿Sirve el 45′ + 30″?",
   "nivel": "Básico",
   "ritmo": null,
   "escena": "Te consultan por un abierto de fin de semana a 45′ + 30″, con dos rondas por día, que se registrará para rating estándar. No es del Circuito FIDE. La lista de inscritos tiene ratings entre 1450 y 2380.",
   "decision": {
    "texto": "¿Qué respondes?",
    "opciones": [
     "No sirve: el mínimo es 90 minutos porque hay jugadores de 1800 o más",
     "Sirve solo con una ronda por día",
     "Sirve: no participa nadie de 2400 o más, así que 45′+30″ se admite (resolución del Consejo FIDE de noviembre de 2026); si alguien de 2400 o más se inscribe, deja de valer",
     "Sirve solo para el rating de rápidas"
    ],
    "correcta": 2,
    "explicacion": "La resolución del Consejo FIDE (nov-2026), punto 3, admite 45′+30″ cuando ningún participante tiene 2400 o más; con dos rondas por día también puede dar normas, con el límite de una norma de estos ritmos por título. Hay que vigilar las inscripciones: con un jugador de 2400+ se pierde la condición."
   }
  }
 ],
 "repeticiones": []
};
    ["colecciones", "fichas", "preguntas", "casos", "repeticiones"].forEach((k) => { C[k].push(...REVISTAS[k]); });
})(typeof window !== "undefined" ? window : globalThis);

/*! rev bfb5bbb0d2d82f9f */
