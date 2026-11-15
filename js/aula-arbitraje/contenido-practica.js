/* Aula de Arbitraje — el Taller del árbitro: calcular y decidir.

   Se suma a AULA_CONTENIDO después de js/aula-arbitraje/contenido.js y
   contenido-revistas.js: una colección más («taller»), que no es un número de
   la revista, con cuatro fichas y sus preguntas y casos de sala:
   - la triple repetición y cómo se reclama (Leyes, arts. 9.2, 9.5 y 9.6);
   - la caída de bandera y la segunda jugada ilegal cuando el rival quizá no
     puede dar mate (arts. 5.2.2, 6.9, 7.5.5 y A.5.3);
   - los desempates de FIDE (C.07, vigente desde el 1 de marzo de 2026);
   - las normas de MI y GM (Reglamento de Títulos B.01, vigente desde 2024).

   Ninguna posición se inventó a ojo: cada «fen» es legal y el resultado de
   cada caso de material lo prueba herramientas/verificar-aula-arbitraje.js
   (con herramientas/lib/mate-posible.js): «mate» trae una serie de jugadas
   legales que termina en mate y el verificador la repite; «sinMate» se
   demuestra por material o recorriendo todas las posiciones alcanzables.
   Los desempates y las normas NO traen la respuesta escrita: la calcula la
   página con el motor de Pareo Integral (js/pareo/desempates.js) y con
   js/normas-titulo.js, y el verificador comprueba que el caso enseña lo que
   dice (que el desempate pedido separa a los empatados, que la norma sale o
   no sale como cuenta el relato).

   Además, DIAGRAMAS y DIAGRAMAS_CASOS le ponen tablero a preguntas y casos
   de las revistas que describen una posición, sin tocar
   contenido-revistas.js: cada uno se engancha por la ficha y el principio
   del texto (o el id del caso), y el verificador exige que encuentre
   exactamente uno.
   Ver «Aula de Arbitraje» en docs/decisiones/juegos-y-torneos.md. */
(function (raiz) {
    "use strict";
    const C = raiz.AULA_CONTENIDO;
    if (!C) return;

    const TALLER = {
        colecciones: [
            { id: "taller", titulo: "Taller del árbitro: calcular y decidir", nota: "Casos prácticos con las normas de FIDE vigentes (noviembre de 2026)", taller: true },
        ],

        fichas: [
            {
                id: "taller-repeticion", coleccion: "taller", titulo: "Triple repetición: el reclamo paso a paso",
                articulos: "Leyes 2023 · arts. 9.2, 9.5, 9.6 y A.3",
                resumen: "Quién reclama, cuándo, cómo se comprueba con las planillas y qué pasa si el reclamo no procede.",
                claves: [
                    "Reclama solo quien tiene el turno (9.2).",
                    "Si la posición va a aparecer, anota la jugada en la planilla, sin hacerla, y se lo declara al árbitro (9.2.1). La jugada ya no se puede cambiar.",
                    "Si la posición acaba de aparecer, reclama en su turno, antes de mover (9.2.2).",
                    "Se pausa el reloj y el reclamo no se retira (9.5.1). Un reclamo es también una oferta de tablas (9.1.2.3).",
                    "Si no procede: 2 minutos más para el rival (1 en rápidas y relámpago, A.3) y, si se basaba en una jugada anotada, hay que hacerla (9.5.3).",
                    "Cinco veces la misma posición: tablas sin reclamo (9.6.1).",
                ],
                contenido: `
<h3>La norma</h3>
<div class="aula-norma"><b>Art. 9.2</b> La partida es tablas cuando lo reclama correctamente el jugador que tiene el turno y la misma posición, por lo menos por tercera vez (no necesariamente por repetición de jugadas): <b>9.2.1</b> va a aparecer, si primero escribe su jugada en la planilla (que ya no puede cambiar) y le declara al árbitro su intención de hacerla, o <b>9.2.2</b> acaba de aparecer y quien reclama tiene el turno.</div>
<div class="aula-norma"><b>Art. 9.5</b> Al reclamar se pausa el reloj y el reclamo no se puede retirar. Si es correcto, la partida es tablas de inmediato. Si no, el árbitro suma dos minutos al tiempo del rival y la partida sigue; si el reclamo se basaba en una jugada anotada, esa jugada se tiene que hacer.</div>
<div class="aula-norma"><b>Art. 9.6.1</b> Si la misma posición aparece por lo menos cinco veces, la partida es tablas, aunque nadie reclame.</div>
<div class="aula-norma aula-norma-aviso"><b>Rápidas y relámpago.</b> La sanción por un reclamo incorrecto es de 1 minuto (A.3).</div>
<h3>Cómo lo resuelve el árbitro</h3>
<ol>
<li>Pausa el reloj y escucha el reclamo: ¿quién reclama, tiene el turno y anotó la jugada si la posición «va a aparecer»?</li>
<li>Reconstruye la partida con las dos planillas (o con el tablero electrónico) y marca cada vez que aparece la posición.</li>
<li>Arma la tabla: <b>piezas</b>, <b>movimientos especiales</b> (derechos de enroque, captura al paso posible) y <b>turno</b>. Si las tres columnas coinciden tres veces, procede.</li>
<li>Decide: tablas, o 2 minutos para el rival (1 en rápidas) y la jugada anotada se hace.</li>
</ol>
<h3>Las trampas de siempre</h3>
<ul>
<li>El derecho de enroque se pierde al mover el rey o la torre, aunque vuelvan: la posición de antes y la de después no son la misma.</li>
<li>Si al empezar la secuencia se podía capturar al paso, esa primera posición no cuenta como igual a las siguientes.</li>
<li>La misma «foto» con el turno del otro jugador no es la misma posición.</li>
<li>Si el jugador hace la jugada en el tablero y pulsa el reloj, ya no tiene el turno: el que puede reclamar ahora es el rival.</li>
</ul>`,
            },
            {
                id: "taller-bandera", coleccion: "taller", titulo: "Bandera y segunda ilegal: ¿gana el rival o son tablas?",
                articulos: "Leyes 2023 · arts. 5.1.2, 5.2.2, 6.8, 6.9, 7.5.5 y A.5",
                resumen: "Cuándo el rival «no puede dar mate con ninguna serie de jugadas legales» y cuándo sí, aunque tenga muy poco material.",
                claves: [
                    "Se cae la bandera (6.9) o hay una segunda jugada ilegal (7.5.5): pierde, salvo que el rival no pueda dar mate con NINGUNA serie de jugadas legales. Entonces son tablas.",
                    "No se pregunta si puede forzar el mate: basta con que exista una serie, aunque el otro tenga que «ayudar».",
                    "Rey solo, o rey y una pieza menor contra rey solo: no hay mate posible.",
                    "Rey y caballo, o rey y alfil, contra un rival que tiene algo más (un peón, una torre): casi siempre hay mate, porque las piezas del propio rey le tapan las casillas.",
                    "Solo alfiles, todos de casillas del mismo color: no hay mate. Si los alfiles son de distinto color, sí.",
                    "Si la posición ya era muerta (5.2.2), la partida terminó en tablas en ese momento: lo que pase después con el reloj no cuenta.",
                ],
                contenido: `
<h3>Lo que dicen las Leyes</h3>
<div class="aula-norma"><b>Art. 6.9</b> Salvo que se aplique 5.1.1, 5.1.2, 5.2.1, 5.2.2 o 5.2.3, el jugador que no completa las jugadas en el tiempo pierde la partida. Pero es tablas si la posición es tal que el rival no puede dar mate al rey del jugador con ninguna serie posible de jugadas legales.</div>
<div class="aula-norma"><b>Art. 7.5.5</b> Por la segunda jugada ilegal completada del mismo jugador, el árbitro declara perdida su partida. Pero es tablas si el rival no puede darle mate con ninguna serie posible de jugadas legales.</div>
<div class="aula-norma"><b>Art. 5.2.2</b> Es tablas cuando aparece una posición en la que ninguno de los dos puede dar mate con ninguna serie de jugadas legales (posición muerta). Eso termina la partida de inmediato.</div>
<div class="aula-norma"><b>Arts. 6.8 y A.5</b> La bandera se considera caída cuando el árbitro lo ve o cuando un jugador lo reclama válidamente. En rápidas sin supervisión adecuada, quien reclama pausa el reloj y avisa al árbitro; pero es tablas si quien reclama no puede dar mate con ninguna serie de jugadas legales (A.5.3). El árbitro también señala la caída si la ve (A.5.5).</div>
<h3>El método del árbitro</h3>
<ol>
<li>¿La posición ya era muerta antes de la bandera o de la jugada ilegal? Si lo era, la partida ya había terminado en tablas.</li>
<li>Mira solo el material del <b>rival</b> del que se quedó sin tiempo (o del que hizo la segunda ilegal).</li>
<li>Si el rival tiene solo el rey: tablas. Si tiene rey y una pieza menor y el otro solo el rey: tablas.</li>
<li>En cualquier otro caso, busca una serie de jugadas legales que termine en mate, con los dos jugando «a favor». Si existe, gana el rival.</li>
</ol>
<h3>Ejemplos de series que sí terminan en mate</h3>
<ul>
<li><b>Rey y caballo contra rey y peón:</b> el peón le tapa una casilla al rey; el caballo da el jaque y el rey del atacante cubre las otras.</li>
<li><b>Rey y alfil contra rey, alfil y peón:</b> el rey en la esquina, encerrado por sus propias piezas, y el jaque por la diagonal.</li>
<li><b>Rey y dos caballos contra rey y torre:</b> la torre tapa una casilla de su propio rey y un caballo da mate.</li>
</ul>
<p class="aula-nota">En los casos de esta ficha, después de decidir ves el tablero con la serie completa: jugadas legales, una por una, hasta el mate.</p>`,
            },
            {
                id: "taller-desempates", coleccion: "taller", titulo: "Los desempates de FIDE: fórmulas y cálculo",
                articulos: "Reglamento de desempates C.07 (desde el 1 de marzo de 2026) · arts. 4 a 16",
                resumen: "Cada sistema con su fórmula: Buchholz y sus cortes, Sonneborn-Berger, encuentro directo, progresivo, victorias, color, Koya, rating y las rondas no jugadas.",
                claves: [
                    "Los desempates se aplican en el orden de las bases y cada uno solo al grupo que sigue empatado (4.2).",
                    "BH = suma de los puntos de los rivales. Cut-1 quita el menor; Median-1, el menor y el mayor (14.1-14.4). No se usa en todos contra todos.",
                    "SB = suma de (puntos del rival × puntos que le hiciste).",
                    "DE: solo las partidas entre los empatados; si no todos jugaron entre sí (suizo), gana el que queda solo arriba pase lo que pase (6.3).",
                    "WIN cuenta las victorias con o sin jugar; WON, solo las ganadas en el tablero.",
                    "TPR = ARO + dp: solo con las partidas jugadas en el tablero.",
                    "Rondas no jugadas (16): el rival que no jugó al final cuenta como si hubiera hecho tablas; tu propia ronda no jugada cuenta contra un «rival ficticio» con tus puntos, con tope.",
                ],
                contenido: `
<h3>El principio (art. 4.2)</h3>
<p>Los desempates forman una lista ordenada. Se calcula el primero para todos los empatados; a los que sigan empatados se les aplica el segundo, y así. Si se acaba la lista, sorteo (salvo que las bases digan que el empate no se rompe).</p>
<h3>Los que salen del propio jugador (tipo B)</h3>
<div class="aula-tabla"><table><thead><tr><th scope="col">Código</th><th scope="col">Fórmula</th></tr></thead><tbody>
<tr><td><b>WIN</b> (7.1)</td><td>Rondas en las que obtuvo, jugando o sin jugar, los puntos de una victoria (incomparecencias a favor y byes de punto entero incluidos).</td></tr>
<tr><td><b>WON</b> (7.2)</td><td>Partidas ganadas en el tablero.</td></tr>
<tr><td><b>BPG</b> (7.3)</td><td>Partidas jugadas con negras en el tablero.</td></tr>
<tr><td><b>BWG</b> (7.4)</td><td>Partidas ganadas con negras en el tablero.</td></tr>
<tr><td><b>PS</b> (7.5)</td><td><span class="aula-formula">PS = suma de los puntos acumulados al terminar cada ronda</span>. PS-C1 quita el acumulado de la ronda 1.</td></tr>
<tr><td><b>REP</b> (7.6)</td><td>Rondas menos los byes de medio punto, de cero y las incomparecencias perdidas.</td></tr>
<tr><td><b>STD</b> (7.7)</td><td>Puntos «estándar» (1, ½, 0) cuando el torneo puntúa de otra forma (por ejemplo 3-1-0).</td></tr>
</tbody></table></div>
<h3>Los que dependen de los rivales</h3>
<div class="aula-tabla"><table><thead><tr><th scope="col">Código</th><th scope="col">Fórmula</th></tr></thead><tbody>
<tr><td><b>BH</b> (8.1)</td><td><span class="aula-formula">BH = Σ puntos finales de cada rival</span>. Prohibido en todos contra todos.</td></tr>
<tr><td><b>BH-C1, BH-C2</b> (14.1, 14.2)</td><td>Se quita el menor (o los dos menores) de los sumandos.</td></tr>
<tr><td><b>BH-M1, BH-M2</b> (14.3, 14.4)</td><td>Se quitan el menor y el mayor (o los dos menores y los dos mayores).</td></tr>
<tr><td><b>FB</b> (8.3)</td><td>Buchholz como si todas las partidas de la última ronda hubieran sido tablas.</td></tr>
<tr><td><b>AOB</b> (8.2)</td><td>El promedio del Buchholz de los rivales con los que jugó en el tablero.</td></tr>
<tr><td><b>SB</b> (9.1)</td><td><span class="aula-formula">SB = Σ (puntos finales del rival × puntos que le hizo)</span>: la victoria suma todos los puntos del rival; las tablas, la mitad; la derrota, nada.</td></tr>
<tr><td><b>KS</b> (9.2)</td><td>Puntos contra los que sacaron al menos el 50 % de la puntuación máxima posible. El límite se puede mover medio punto (14.5).</td></tr>
<tr><td><b>DE</b> (6)</td><td>Los puntos de las partidas entre los empatados. Si todos jugaron entre sí, ordena; si queda un subgrupo empatado, se vuelve a aplicar entre ellos (6.2). En un suizo, si no todos se enfrentaron, va primero el que queda solo arriba pase lo que pase en las partidas que faltan (6.3). Las incomparecencias no cuentan (6.1.1).</td></tr>
</tbody></table></div>
<h3>Los de rating (art. 10)</h3>
<div class="aula-tabla"><table><thead><tr><th scope="col">Código</th><th scope="col">Fórmula</th></tr></thead><tbody>
<tr><td><b>ARO</b> (10.1)</td><td><span class="aula-formula">ARO = Σ Elo de los rivales ÷ partidas jugadas</span>, redondeado (0,5 hacia arriba). Solo partidas jugadas en el tablero.</td></tr>
<tr><td><b>TPR</b> (10.2)</td><td><span class="aula-formula">TPR = ARO + dp(p)</span>, con p = puntos en el tablero ÷ partidas jugadas y dp de la tabla de FIDE.</td></tr>
<tr><td><b>PTP</b> (10.3)</td><td>El Elo más bajo con el que, contra esos rivales, la puntuación esperada llega a la que hizo. Sin puntos: 800 menos que el rival de menor Elo.</td></tr>
<tr><td><b>APRO / APPO</b> (10.4, 10.5)</td><td>El promedio del TPR (o del PTP) de los rivales.</td></tr>
<tr><td><b>RTNG / TPN</b> (10.6, 7.8)</td><td>El Elo del jugador, o su número de emparejamiento (el menor primero).</td></tr>
</tbody></table></div>
<p class="aula-nota">Los desempates de rating se quitan de la lista si hay jugadores sin Elo, salvo que las bases digan cómo tratarlos.</p>
<h3>Las rondas no jugadas en un suizo (art. 16)</h3>
<p><b>Para el desempate de sus rivales</b>, el puntaje de quien no jugó se ajusta (16.3): los byes del emparejamiento, las incomparecencias y los byes pedidos que después tienen alguna partida cuentan con lo que valieron; <b>los byes pedidos al final</b> (los que ya no tienen ninguna partida después) <b>cuentan como tablas</b>.</p>
<p><b>Para su propio desempate</b>, cada ronda no jugada cuenta como una partida contra un rival ficticio cuyo puntaje es el del propio jugador (16.4), con un tope: en una incomparecencia, el puntaje ajustado del rival programado; en los demás casos, medio punto por cada ronda del torneo.</p>
<p><b>El corte</b> (16.5): si hay que quitar el menor y el jugador tiene rondas no jugadas voluntarias (byes pedidos o incomparecencias perdidas), se quita la menor de esas, siempre que no sea menor que el valor más bajo.</p>
<h3>Cómo calcular sin equivocarte</h3>
<ol>
<li>Escribe, para cada empatado, ronda por ronda: rival, color, resultado y puntos finales del rival (ya ajustados).</li>
<li>Marca lo que se corta antes de sumar.</li>
<li>Aplica el primer desempate a todos los empatados; el siguiente, solo a los que siguen empatados.</li>
</ol>`,
            },
            {
                id: "taller-normas", coleccion: "taller", titulo: "Normas de MI y GM: cómo se calculan",
                articulos: "Reglamento de Títulos de FIDE B.01 (desde el 1 de enero de 2024) · arts. 1.4 y 1.5",
                resumen: "Partidas, federaciones, títulos, el piso de Elo, el promedio y el rendimiento: todo lo que comprueba el árbitro antes de firmar un certificado de norma.",
                claves: [
                    "Al menos 9 partidas jugadas en el tablero; las ganadas o perdidas por incomparecencia no cuentan (1.4.1, 1.4.2).",
                    "Rivales de al menos 2 federaciones distintas de la del jugador; como máximo 3/5 de su federación y 2/3 de una sola (1.4.3, 1.4.4).",
                    "Al menos la mitad con título (sin CM ni WCM) y al menos 1/3 (mínimo 3) GM para la de GM, o IM o GM para la de MI (1.4.5).",
                    "Sin Elo = 1400. Solo el rival de menos Elo sube al piso: 2200 para GM, 2050 para MI (1.4.6).",
                    "Ra = promedio, redondeado (0,5 hacia arriba); mínimo 2380 para GM y 2230 para MI (1.4.7, 1.4.8).",
                    "Rp = Ra + dp(p), con p redondeado al entero: hace falta 2600 para GM y 2450 para MI, y al menos el 35 % (1.4.8, 1.4.9).",
                ],
                contenido: `
<h3>Lo que hay que comprobar, en orden</h3>
<ol>
<li><b>Partidas (1.4.1 y 1.4.2).</b> Al menos 9, jugadas en el tablero. En un torneo de 9 rondas, 8 partidas con una incomparecencia a favor o un bye del emparejamiento cuentan como 9 si la mezcla de rivales es correcta (una sola vez por solicitud). En un suizo se pueden dejar afuera las rondas jugadas después de lograr la norma y las partidas contra rivales a los que se les ganó, mientras queden 9 partidas y la mezcla de rivales.</li>
<li><b>Federaciones (1.4.3 y 1.4.4).</b> Al menos dos distintas de la del jugador (FID no cuenta como extranjera). Como máximo 3/5 de los rivales de su federación y 2/3 de una sola: <span class="aula-formula">máximo = redondear hacia abajo</span>. Están exentos el campeonato nacional, los zonales y algunos suizos muy grandes (1.4.3a-d).</li>
<li><b>Títulos (1.4.5).</b> <span class="aula-formula">con título ≥ mitad (redondear hacia arriba)</span>, sin contar CM ni WCM; <span class="aula-formula">GM (o IM y GM para la de MI) ≥ máx(3, un tercio redondeado hacia arriba)</span>.</li>
<li><b>Elo de los rivales (1.4.6).</b> La lista vigente al empezar el torneo. Sin Elo: 1400. El rival de menos Elo, si está debajo del piso (GM 2200, MI 2050, WGM 2000, WIM 1850), sube al piso; solo ese.</li>
<li><b>Promedio (1.4.7).</b> <span class="aula-formula">Ra = Σ Elo ÷ partidas</span>, redondeado al entero (0,5 hacia arriba). Mínimo: GM 2380, MI 2230, WGM 2180, WIM 2030.</li>
<li><b>Rendimiento (1.4.8 y 1.4.9).</b> <span class="aula-formula">p = puntos ÷ partidas</span>, redondeado al entero por ciento; <span class="aula-formula">Rp = Ra + dp(p)</span>. Hace falta GM 2600, MI 2450, WGM 2400, WIM 2250, y al menos el 35 %.</li>
</ol>
<h3>La tabla dp (1.4.9), la parte que más se usa</h3>
<div class="aula-tabla"><table><thead><tr><th scope="col">p</th><th scope="col">dp</th><th scope="col">p</th><th scope="col">dp</th><th scope="col">p</th><th scope="col">dp</th></tr></thead><tbody>
<tr><td>50 %</td><td>0</td><td>61 %</td><td>80</td><td>72 %</td><td>166</td></tr>
<tr><td>53 %</td><td>21</td><td>64 %</td><td>102</td><td>75 %</td><td>193</td></tr>
<tr><td>56 %</td><td>43</td><td>67 %</td><td>125</td><td>78 %</td><td>220</td></tr>
<tr><td>58 %</td><td>57</td><td>69 %</td><td>141</td><td>83 %</td><td>273</td></tr>
<tr><td>60 %</td><td>72</td><td>70 %</td><td>149</td><td>89 %</td><td>351</td></tr>
</tbody></table></div>
<p class="aula-nota">La tabla completa está en la calculadora de normas (pestaña Calculadoras).</p>
<h3>Una cuenta completa</h3>
<p>Nueve rivales con Elo 2310, 2405, 2515, 2290, 2390, 2420, 2335, 2470 y 2280: suman 21 415, y 21 415 ÷ 9 = 2379,4, así que <b>Ra = 2379</b>. Con 6 puntos: 6 ÷ 9 = 66,7 % → <b>67 %</b> → dp = 125 → <b>Rp = 2504</b>. Pasa la de MI (2450) y no la de GM (2600).</p>
<h3>Puntos de más (1.4.1d)</h3>
<p>Cada punto entero por encima de lo necesario cuenta como una partida más para las 27 del título (1.5.1). Una norma de 9 partidas con un punto de más vale como de 10.</p>
<h3>Para recibir el título (1.5)</h3>
<ul>
<li>Normas que sumen al menos 27 partidas.</li>
<li>Haber tenido alguna vez Elo de 2500 (GM), 2400 (MI), 2300 (WGM) o 2200 (WIM).</li>
<li>Si alguna norma es posterior al 30/06/2022, al menos una debe venir de un torneo de los que lista 1.5.6 (suizo grande con media de 2000, Olimpiada, campeonato nacional…).</li>
</ul>
<h3>Lo que el árbitro revisa además</h3>
<p>Torneo registrado en FIDE, no más de dos rondas por día, el ritmo mínimo, el mismo ritmo para todos y un árbitro principal IA o FA (1.1).</p>`,
            },
        ],

        preguntas: [
            { ficha: "taller-repeticion", texto: "Las negras quieren reclamar la triple repetición con la jugada que van a hacer. ¿Qué deben hacer primero?", opciones: ["Hacer la jugada y detener el reloj", "Anotar la jugada en la planilla, sin hacerla, y declararle al árbitro que la van a hacer", "Decirle al rival que es tablas", "Ofrecer tablas y esperar"], correcta: 1, explicacion: "Art. 9.2.1: la jugada se anota primero en la planilla (ya no se puede cambiar) y se le declara al árbitro la intención de hacerla." },
            { ficha: "taller-repeticion", texto: "Un reclamo de triple repetición resulta incorrecto en una partida estándar. ¿Qué pasa?", opciones: ["El reclamante pierde", "2 minutos más para el rival y la partida sigue", "Una advertencia y nada más", "2 minutos menos para el reclamante"], correcta: 1, explicacion: "Art. 9.5.3: el árbitro suma dos minutos al tiempo del rival y la partida sigue." },
            { ficha: "taller-repeticion", texto: "Rápidas. El reclamo de triple repetición no procede. ¿Cuánto tiempo recibe el rival?", opciones: ["Nada", "30 segundos", "1 minuto", "2 minutos"], correcta: 2, explicacion: "Art. A.3: las sanciones de los arts. 7 y 9 son de 1 minuto en rápidas y relámpago." },
            { ficha: "taller-repeticion", texto: "El reclamo se basó en una jugada anotada y resultó incorrecto. ¿Puede el jugador jugar otra cosa?", opciones: ["Sí, la que quiera", "No: debe hacer la jugada anotada", "Solo si el árbitro lo permite", "Sí, si no tocó ninguna pieza"], correcta: 1, explicacion: "Art. 9.5.3: si el reclamo se basaba en una jugada anotada, esa jugada se tiene que hacer." },
            { ficha: "taller-repeticion", texto: "¿Se puede retirar un reclamo de tablas una vez hecho?", opciones: ["Sí, antes de que el árbitro lo revise", "No", "Solo si el rival está de acuerdo", "Solo en rápidas"], correcta: 1, explicacion: "Art. 9.5.1: el jugador no puede retirar su reclamo." },
            { ficha: "taller-repeticion", texto: "El rey blanco va de e1 a f1 y vuelve a e1. Antes tenía derecho a enrocar. ¿Las posiciones de antes y de después son la misma?", opciones: ["Sí, las piezas están igual", "No: perdió el derecho a enrocar", "Sí, si no pensaba enrocar", "Depende del árbitro"], correcta: 1, explicacion: "Art. 9.2.3.2: el derecho de enroque se pierde al mover el rey; las posiciones ya no son iguales." },
            { ficha: "taller-repeticion", texto: "La misma posición aparece por quinta vez y ninguno reclama. ¿Qué hace el árbitro?", opciones: ["Nada: hay que reclamar", "Declara tablas: es automático", "Advierte a los jugadores", "Les pide que jueguen otra cosa"], correcta: 1, explicacion: "Art. 9.6.1: con cinco apariciones la partida es tablas sin reclamo; el árbitro interviene." },
            { ficha: "taller-repeticion", texto: "Un jugador hace la jugada que repite la posición por tercera vez, pulsa el reloj y después reclama. ¿Procede su reclamo?", opciones: ["Sí, la posición se repitió tres veces", "No: ya no tiene el turno; ahora el que puede reclamar es el rival", "Sí, si lo hace antes de que mueva el rival", "Solo en rápidas"], correcta: 1, explicacion: "Art. 9.2: reclama quien tiene el turno. Al pulsar el reloj el turno pasó al rival, que sí puede reclamar porque la posición acaba de aparecer (9.2.2)." },

            { ficha: "taller-bandera", texto: "Se cae la bandera de las blancas. Las negras tienen rey y caballo; las blancas, rey y dos peones. ¿Resultado?", opciones: ["Tablas: con rey y caballo no se da mate", "Ganan las negras: existe una serie de jugadas legales que termina en mate", "Tablas por posición muerta", "Se sigue jugando"], correcta: 1, explicacion: "Art. 6.9: los peones blancos pueden taparle casillas a su propio rey. Con una serie legal termina en mate, así que ganan las negras.", fen: "8/8/8/8/3n4/8/P2k2P1/1K6 w - - 0 1", mate: { bando: "b", serie: "1.Ra1 Rc1 2.g3 Cc2#" } },
            { ficha: "taller-bandera", texto: "Se cae la bandera de las blancas, que tienen dama, torre y peones. Las negras solo tienen el rey. ¿Resultado?", opciones: ["Ganan las negras", "Tablas", "Ganan las blancas", "Se repite la partida"], correcta: 1, explicacion: "Art. 6.9: con el rey solo no se puede dar mate; son tablas.", fen: "7k/8/8/8/8/8/5PPP/R2Q2K1 w - - 0 1", sinMate: "b" },
            { ficha: "taller-bandera", texto: "Rey y alfil contra rey y alfil, los dos alfiles por casillas claras. Se cae la bandera de las blancas. ¿Resultado?", opciones: ["Ganan las negras", "Tablas: la posición ya era muerta", "Ganan las blancas", "Se repite"], correcta: 1, explicacion: "Con alfiles del mismo color nadie puede dar mate: es una posición muerta (5.2.2) y la partida había terminado en tablas en cuanto apareció.", fen: "8/8/3k4/8/2b5/8/4B3/5K2 w - - 0 1", sinMate: "b" },
            { ficha: "taller-bandera", texto: "Rey y alfil contra rey y alfil, con alfiles de distinto color. Se cae la bandera de las blancas. ¿Resultado?", opciones: ["Tablas por material insuficiente", "Ganan las negras", "Tablas por posición muerta", "Lo decide el árbitro según la posición"], correcta: 1, explicacion: "Con alfiles de distinto color existe una serie legal que termina en mate (el alfil blanco tapa una casilla de su rey), así que ganan las negras.", fen: "8/8/8/4b3/2k5/8/K1B5/8 w - - 0 1", mate: { bando: "b", serie: "1.Ab1 Rc3 2.Ra1 Rb3#" } },
            { ficha: "taller-bandera", texto: "Segunda jugada ilegal de las blancas, que tienen rey y torre. Las negras tienen rey y dos caballos. ¿Resultado?", opciones: ["Tablas: dos caballos no dan mate", "Ganan las negras", "2 minutos para las negras", "Se vuelve a la posición anterior"], correcta: 1, explicacion: "Art. 7.5.5: dos caballos no fuerzan el mate, pero existe una serie legal que termina en mate (la torre tapa una casilla de su propio rey). Ganan las negras.", fen: "8/8/8/2n2n2/8/R7/3k4/1K6 w - - 0 1", mate: { bando: "b", serie: "1.Ra1 Rc1 2.Ta2 Cb3#" } },
            { ficha: "taller-bandera", texto: "Las negras coronaron un alfil y tienen rey y dos alfiles por casillas oscuras. Las blancas, rey solo, se quedan sin tiempo. ¿Resultado?", opciones: ["Ganan las negras: dos alfiles dan mate", "Tablas: con dos alfiles del mismo color no hay mate posible", "Se sigue jugando", "Ganan las blancas"], correcta: 1, explicacion: "Con alfiles de un solo color, el rey rival siempre tiene casillas del otro color: no hay ninguna serie que termine en mate. Tablas.", fen: "8/8/2k5/8/3b4/8/1b6/6K1 w - - 0 1", sinMate: "b" },
            { ficha: "taller-bandera", texto: "¿Qué pregunta debe hacerse el árbitro cuando cae una bandera y el rival tiene poco material?", opciones: ["¿Puede el rival forzar el mate?", "¿Existe alguna serie de jugadas legales con la que el rival pueda dar mate?", "¿Quién tiene más material?", "¿Es un final teórico de tablas?"], correcta: 1, explicacion: "Art. 6.9: lo que importa es si existe una serie de jugadas legales que termine en mate, aunque el otro tenga que «ayudar»." },
            { ficha: "taller-bandera", texto: "Rápidas sin supervisión adecuada. Las negras pausan el reloj y reclaman la victoria por tiempo; solo tienen el rey. ¿Qué decides?", opciones: ["Ganan las negras", "Tablas: quien reclama no puede dar mate", "Se sigue jugando", "1 minuto para las blancas"], correcta: 1, explicacion: "Art. A.5.3: es tablas si quien reclama no puede dar mate con ninguna serie de jugadas legales." },

            { ficha: "taller-desempates", texto: "¿Cuál de estos desempates no se puede usar en un torneo todos contra todos?", opciones: ["Sonneborn-Berger", "Encuentro directo", "Buchholz", "Koya"], correcta: 2, explicacion: "Art. 8: el Buchholz y los que dependen de él no se usan en todos contra todos (allí todos juegan contra todos y la suma de los rivales es casi la misma)." },
            { ficha: "taller-desempates", texto: "Un jugador ganó a un rival que terminó con 4 puntos, empató con uno de 5 y perdió con uno de 6. ¿Cuánto suma de Sonneborn-Berger por esas tres partidas?", opciones: ["15", "6½", "9", "4"], correcta: 1, explicacion: "SB = 4 × 1 + 5 × ½ + 6 × 0 = 4 + 2½ = 6½." },
            { ficha: "taller-desempates", texto: "Buchholz Median-1 (BH-M1): ¿qué se quita?", opciones: ["El sumando más bajo", "Los dos más bajos", "El más bajo y el más alto", "El más alto"], correcta: 2, explicacion: "Art. 14.3: Median-1 quita el valor menos significativo y el más significativo." },
            { ficha: "taller-desempates", texto: "Un jugador ganó una partida por incomparecencia. ¿Cuenta para WIN y para WON?", opciones: ["Para los dos", "Para WIN sí; para WON no", "Para WON sí; para WIN no", "Para ninguno"], correcta: 1, explicacion: "WIN (7.1) cuenta las rondas con puntos de victoria, jugando o sin jugar; WON (7.2) solo las partidas ganadas en el tablero." },
            { ficha: "taller-desempates", texto: "Progresivo (PS): un jugador hizo 1, 0, 1, ½ y 1 en cinco rondas. ¿Cuál es su PS?", opciones: ["3½", "10", "9", "11½"], correcta: 1, explicacion: "Art. 7.5: se suman los acumulados de cada ronda: 1, 1, 2, 2½ y 3½. 1 + 1 + 2 + 2½ + 3½ = 10." },
            { ficha: "taller-desempates", texto: "En un suizo, un rival tuyo pidió un bye de cero puntos en la última ronda. Para tu Buchholz, ¿cuánto vale esa ronda de él?", opciones: ["Cero, lo que obtuvo", "Como unas tablas (½)", "Un punto", "No se cuenta su puntaje"], correcta: 1, explicacion: "Art. 16.3.2: los byes pedidos al final (sin partidas después) cuentan como tablas para el desempate de sus rivales." },
            { ficha: "taller-desempates", texto: "Tuviste un bye del emparejamiento en un suizo de 7 rondas y terminaste con 5 puntos. Para tu Buchholz, ¿cuánto vale el rival ficticio de esa ronda?", opciones: ["5", "3½", "0", "1"], correcta: 1, explicacion: "Art. 16.4: el rival ficticio tiene tus puntos (5), pero con tope de medio punto por ronda del torneo: 7 × ½ = 3½." },
            { ficha: "taller-desempates", texto: "TPR: Elo medio de los rivales 2150 y 70 % de los puntos en el tablero. ¿Cuál es el rendimiento?", opciones: ["2299", "2220", "2350", "2150"], correcta: 0, explicacion: "Art. 10.2: TPR = ARO + dp(0,70) = 2150 + 149 = 2299." },
            { ficha: "taller-desempates", texto: "Tres empatados: el Buchholz separa al primero y deja a los otros dos iguales. El siguiente desempate de las bases se calcula para…", opciones: ["Los tres", "Solo los dos que siguen empatados", "Todo el grupo de puntos", "Nadie: se sortea"], correcta: 1, explicacion: "Art. 4.2: se pasa al siguiente desempate solo con el subgrupo que sigue empatado." },
            { ficha: "taller-desempates", texto: "Suizo. Tres empatados: A le ganó a B y a C; B y C no jugaron entre sí. ¿Qué dice el encuentro directo?", opciones: ["Nada, porque no todos jugaron entre sí", "A va primero: queda solo arriba pase lo que pase entre B y C", "Hay que sortear", "B y C empatan con A"], correcta: 1, explicacion: "Art. 6.3: A tiene 2 puntos y B y C, como máximo 1 cada uno, aunque hubieran jugado. A va primero; B y C pasan al siguiente desempate." },

            { ficha: "taller-normas", texto: "Para una norma de GM, uno de los rivales no tiene Elo. ¿Con qué Elo cuenta?", opciones: ["0", "1000", "1400, y si es el más bajo sube al piso de 2200", "El promedio de los demás"], correcta: 2, explicacion: "Art. 1.4.6: sin Elo cuenta como 1400; si es el de menos Elo y está debajo del piso, sube al piso (2200 para GM)." },
            { ficha: "taller-normas", texto: "Dos rivales están debajo del piso de una norma de MI (2050): uno con 1990 y otro con 2010. ¿Qué se hace?", opciones: ["Los dos suben a 2050", "Solo sube el de 1990", "Solo sube el de 2010", "Ninguno sube"], correcta: 1, explicacion: "Art. 1.4.6: solo un rival sube al piso, el de menos Elo." },
            { ficha: "taller-normas", texto: "Nueve rivales. ¿Cuántos pueden ser, como máximo, de la federación del jugador?", opciones: ["3", "5", "6", "Todos, si el torneo es abierto"], correcta: 1, explicacion: "Art. 1.4.4: 3/5 de 9 = 5,4 → como máximo 5 (se redondea hacia abajo)." },
            { ficha: "taller-normas", texto: "¿Cuenta un CM como rival con título para el 50 % de 1.4.5?", opciones: ["Sí", "No", "Solo si tiene más de 2200", "Solo para normas de MI"], correcta: 1, explicacion: "Art. 1.4.5: al menos el 50 % deben tener título, sin contar CM ni WCM." },
            { ficha: "taller-normas", texto: "Ra = 2412 y el jugador hizo 6 de 9. ¿Cuál es su rendimiento?", opciones: ["2537", "2512", "2600", "2484"], correcta: 0, explicacion: "6 ÷ 9 = 66,7 % → 67 % → dp = 125. Rp = 2412 + 125 = 2537." },
            { ficha: "taller-normas", texto: "Un jugador hizo 9 de 9 con Ra = 2365. ¿Hace norma de GM?", opciones: ["Sí: su rendimiento pasa de 2600", "No: el promedio mínimo para GM es 2380", "Sí, si los rivales tienen título", "Solo si pide al árbitro"], correcta: 1, explicacion: "Art. 1.4.8: además del rendimiento, el promedio de los rivales debe ser al menos 2380 para una norma de GM." },
            { ficha: "taller-normas", texto: "En un torneo de 9 rondas, el jugador ganó una partida por incomparecencia. ¿Puede hacer norma?", opciones: ["No: le quedan 8 partidas", "Sí: 8 partidas con una incomparecencia a favor cuentan como 9, si la mezcla de rivales es correcta", "Sí, la incomparecencia cuenta como partida", "Solo si es la última ronda"], correcta: 1, explicacion: "Art. 1.4.1c: en un torneo de 9 rondas, 8 partidas con una incomparecencia a favor o un bye del emparejamiento cuentan como 9 (una sola vez por solicitud)." },
            { ficha: "taller-normas", texto: "Con estos rivales hacían falta 5½ puntos para la norma y el jugador hizo 7. ¿Cuántas partidas vale su norma de 9?", opciones: ["9", "10", "11", "13"], correcta: 1, explicacion: "Art. 1.4.1d: cada punto ENTERO de más cuenta como una partida: 7 − 5½ = 1½, un punto entero → 10 partidas." },
        ],

        casos: [
            /* ---------- triple repetición ---------- */
            {
                id: "rep-anotada", ficha: "taller-repeticion", titulo: "El reclamo con la jugada anotada", nivel: "Básico", ritmo: null,
                escena: "Partida estándar. Las negras escriben en su planilla <b>43…Re8</b>, no la hacen, pausan el reloj y te dicen que esa jugada repite la posición por tercera vez. Revisas la secuencia con las dos planillas (está abajo).",
                secuencia: { fen: "4k3/8/4p3/8/8/4P3/8/R3K3 w - - 0 40", jugadas: "40. Ta2 Rd8 41. Ta1 Re8 42. Ta3 Rd7 43. Ta1 Re8", triple: true },
                decision: { texto: "¿Qué decides?", opciones: ["Tablas: el reclamo es correcto", "El reclamo no procede: las jugadas no se repitieron seguidas", "2 minutos para las blancas y las negras juegan 43…Re8", "Las negras tenían que hacer la jugada antes de reclamar"], correcta: 0, explicacion: "Art. 9.2.1: la posición inicial de la secuencia, la de después de 41…Re8 y la que va a aparecer con 43…Re8 son idénticas (mismas piezas, turno y derechos). No hace falta que las jugadas se repitan seguidas. Tablas." },
            },
            {
                id: "rep-ya-jugada", ficha: "taller-repeticion", titulo: "«Ya la hice, pero es la tercera vez»", nivel: "Intermedio", ritmo: null,
                escena: "Misma partida, pero esta vez las negras juegan 43…Re8 en el tablero, pulsan el reloj y recién entonces reclaman la triple repetición. Las blancas todavía no han movido.",
                secuencia: { fen: "4k3/8/4p3/8/8/4P3/8/R3K3 w - - 0 40", jugadas: "40. Ta2 Rd8 41. Ta1 Re8 42. Ta3 Rd7 43. Ta1 Re8", triple: true },
                decision: { texto: "¿Qué decides?", opciones: ["Tablas: la posición se repitió tres veces", "El reclamo no procede: las negras ya no tienen el turno; 2 minutos para las blancas, que sí podrían reclamar ahora", "Las negras pierden por reclamar fuera de tiempo", "Les pides que repitan las jugadas"], correcta: 1, explicacion: "Art. 9.2: reclama quien tiene el turno. Al pulsar el reloj, el turno pasó a las blancas. El reclamo de las negras no procede (9.5.3: 2 minutos para el rival). Las blancas, en cambio, pueden reclamar ahora mismo, porque la posición acaba de aparecer (9.2.2)." },
            },
            {
                id: "rep-enroque", ficha: "taller-repeticion", titulo: "El rey que paseó", nivel: "Intermedio", ritmo: null,
                escena: "Partida estándar. Las negras anotan <b>13…Re8</b> y reclaman la triple repetición: «el rey fue y volvió tres veces, todo está igual». Los dos tenían derecho a enrocar al empezar la secuencia.",
                secuencia: { fen: "r3k2r/ppp2ppp/2n2n2/3pp3/3PP3/2N2N2/PPP2PPP/R3K2R w KQkq - 0 10", jugadas: "10. Ke2 Ke7 11. Ke1 Ke8 12. Ke2 Ke7 13. Ke1 Ke8", triple: false },
                decision: { texto: "¿Qué decides?", opciones: ["Tablas", "El reclamo no procede: la primera posición tenía derechos de enroque. 2 minutos para las blancas y las negras juegan 13…Re8", "El reclamo no procede, pero sin sanción", "Las negras pierden"], correcta: 1, explicacion: "Art. 9.2.3.2: al mover el rey se pierde el derecho a enrocar. La posición inicial no es igual a las que vienen después: solo hay dos iguales. Reclamo incorrecto: 2 minutos para el rival y la jugada anotada se hace (9.5.3)." },
            },
            {
                id: "rep-al-paso", ficha: "taller-repeticion", titulo: "La captura al paso que existía", nivel: "Avanzado", ritmo: null,
                escena: "Final de reyes y peones. Las blancas juegan 30.e4 y después los reyes van y vienen. En la jugada 34 las blancas anotan <b>34.Re1</b> y reclaman: «es la tercera vez que se ve esta posición».",
                secuencia: { fen: "4k3/8/8/8/5p2/8/4P3/4K3 w - - 0 30", jugadas: "30. e4 Kd8 31. Kd1 Ke8 32. Ke1 Kd8 33. Kd1 Ke8 34. Ke1", triple: false },
                decision: { texto: "¿Qué decides?", opciones: ["Tablas", "El reclamo no procede: después de 30.e4 las negras podían capturar al paso; 2 minutos para las negras", "El reclamo procede solo si las negras no capturaron", "Le pides al jugador que juegue otra cosa"], correcta: 1, explicacion: "Art. 9.2.3.1: después de 30.e4 el peón de f4 podía capturar al paso en e3. Esa posición no es igual a las que vienen después, aunque la «foto» sea la misma. Solo hay dos iguales: 2 minutos para el rival y 34.Re1 se juega." },
            },
            {
                id: "rep-cinco", ficha: "taller-repeticion", titulo: "Nadie reclama", nivel: "Básico", ritmo: null,
                escena: "Torneo escolar. Dos jugadores mueven sus caballos de ida y vuelta desde la posición inicial. Ninguno reclama nada y siguen.",
                secuencia: { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", jugadas: "1. Cf3 Cf6 2. Cg1 Cg8 3. Cf3 Cf6 4. Cg1 Cg8 5. Cf3 Cf6 6. Cg1 Cg8 7. Cf3 Cf6 8. Cg1 Cg8", triple: true },
                decision: { texto: "¿Qué haces?", opciones: ["Nada: hay que reclamar", "Declaras tablas: la posición apareció cinco veces", "Les adviertes que no pueden repetir", "Esperas a la jugada 50"], correcta: 1, explicacion: "Art. 9.6.1: con la misma posición cinco veces la partida es tablas sin reclamo. El árbitro interviene y lo declara." },
            },
            {
                id: "rep-rapida", ficha: "taller-repeticion", titulo: "Rápidas: el turno cambiado", nivel: "Avanzado", ritmo: null,
                escena: "Abierto de rápidas, 15 min + 10 s, un árbitro cada tres mesas. Final de peones bloqueados. Las blancas anotan <b>55.Rc2</b> y reclaman la triple repetición: «el rey estuvo en c2 y el negro en h8 tres veces».",
                secuencia: { fen: "7k/8/8/p7/P7/8/2K5/8 w - - 0 50", jugadas: "50. Kd2 Kh7 51. Kd1 Kh8 52. Kc2 Kh7 53. Kd2 Kh8 54. Kd1 Kh7 55. Kc2 Kh8", triple: false },
                decision: { texto: "¿Qué decides?", opciones: ["Tablas", "No procede: una de las veces le tocaba jugar a las negras. 1 minuto para las negras y 55.Rc2 se juega", "No procede: 2 minutos para las negras", "Tablas por posición muerta"], correcta: 1, explicacion: "Arts. 9.2.3 y A.3: con el triángulo del rey blanco, la misma «foto» apareció una vez con turno de las negras. No es la misma posición. En rápidas la sanción es de 1 minuto, y la jugada anotada se hace." },
            },
            {
                id: "rep-torre", ficha: "taller-repeticion", titulo: "La torre que fue y volvió", nivel: "Avanzado", ritmo: null,
                escena: "Partida estándar. La torre blanca de a1, que todavía no se había movido, va a a2 y vuelve varias veces; el rey negro va de e8 a f8 y vuelve. Las blancas anotan <b>24.Ta2</b> y reclaman.",
                secuencia: { fen: "4k3/pppp4/8/8/8/8/1PPP4/R3K3 w Q - 0 20", jugadas: "20. Ta2 Rf8 21. Ta1 Re8 22. Ta2 Rf8 23. Ta1 Re8 24. Ta2 Rf8 25. Ta1 Re8", triple: true, hasta: 8 },
                decision: { texto: "¿Qué decides?", opciones: ["Tablas: después de 20.Ta2, 22.Ta2 y 24.Ta2 la posición es idéntica", "No procede: la torre perdió el enroque", "No procede: el rey negro se movió", "Hay que contar desde la posición inicial"], correcta: 0, explicacion: "La posición del principio, con derecho a enroque largo, no cuenta. Pero desde 20.Ta2 el derecho ya no existe, y las posiciones después de 20.Ta2, 22.Ta2 y la que va a aparecer con 24.Ta2 son idénticas. Tablas (9.2.1)." },
            },

            /* ---------- bandera y segunda ilegal ---------- */
            {
                id: "bandera-dos-peones", ficha: "taller-bandera", titulo: "Rey y dos peones contra rey y caballo", nivel: "Básico", ritmo: null,
                escena: "Partida estándar. A las blancas se les cae la bandera. Las negras te llaman: tienen rey y caballo. Las blancas protestan: «con un caballo no me puede dar mate».",
                fen: "8/8/8/8/3n4/8/P2k2P1/1K6 w - - 0 1",
                mate: { bando: "b", serie: "1.Ra1 Rc1 2.g3 Cc2#" },
                decision: { texto: "¿Qué resultado anotas?", opciones: ["Tablas: rey y caballo no dan mate", "Ganan las negras", "Se sigue jugando con tiempo extra", "Tablas por acuerdo"], correcta: 1, explicacion: "Art. 6.9: con el peón de a2 tapándole una casilla a su rey, existe una serie de jugadas legales que termina en mate. Ganan las negras." },
            },
            {
                id: "bandera-un-alfil", ficha: "taller-bandera", titulo: "«Solo le queda un alfil»", nivel: "Intermedio", ritmo: null,
                escena: "Partida estándar. Se cae la bandera de las blancas, que tienen rey, alfil y peón. Las negras tienen rey y alfil. Las blancas piden tablas: «un alfil solo no da mate».",
                fen: "7K/5B1P/1bk5/8/8/8/8/8 w - - 0 1",
                mate: { bando: "b", serie: "1.Ag8 Ad4#" },
                decision: { texto: "¿Qué resultado anotas?", opciones: ["Tablas", "Ganan las negras", "Ganan las blancas por material", "Tablas por posición muerta"], correcta: 1, explicacion: "El rey blanco está en la esquina, encerrado por su alfil y su peón: un jaque del alfil negro por la gran diagonal es mate. Como existe la serie, ganan las negras (6.9)." },
            },
            {
                id: "bandera-rey-solo", ficha: "taller-bandera", titulo: "Todo contra el rey solo", nivel: "Básico", ritmo: null,
                escena: "Partida estándar. Las blancas tienen dama, torre y tres peones, pero se les cae la bandera. Las negras, que solo tienen el rey, reclaman la victoria.",
                fen: "7k/8/8/8/8/8/5PPP/R2Q2K1 w - - 0 1",
                sinMate: "b",
                decision: { texto: "¿Qué resultado anotas?", opciones: ["Ganan las negras", "Tablas", "Ganan las blancas", "Se sigue jugando"], correcta: 1, explicacion: "Art. 6.9: el rey solo no puede dar mate con ninguna serie de jugadas. Tablas, aunque las blancas se quedaran sin tiempo." },
            },
            {
                id: "bandera-caballo-solo", ficha: "taller-bandera", titulo: "El caballo contra el rey desnudo", nivel: "Básico", ritmo: null,
                escena: "Partida rápida con supervisión adecuada. Las blancas, que solo tienen el rey, se quedan sin tiempo. Las negras tienen rey y caballo y dicen que ganaron.",
                fen: "8/8/8/4k3/8/2n5/8/6K1 w - - 0 1",
                sinMate: "b",
                decision: { texto: "¿Qué resultado anotas?", opciones: ["Ganan las negras", "Tablas", "Se sigue jugando", "Ganan las blancas"], correcta: 1, explicacion: "Rey y caballo contra el rey solo no pueden dar mate con ninguna serie (no hay piezas blancas que le tapen casillas a su rey). Tablas." },
            },
            {
                id: "bandera-alfiles-iguales", ficha: "taller-bandera", titulo: "Alfiles del mismo color", nivel: "Intermedio", ritmo: null,
                escena: "Partida estándar. Quedan rey y alfil para cada uno, los dos alfiles por casillas claras. Los jugadores siguen moviendo y a las blancas se les cae la bandera. Las negras reclaman la victoria.",
                fen: "8/8/3k4/8/2b5/8/4B3/5K2 w - - 0 1",
                sinMate: "b",
                decision: { texto: "¿Qué resultado anotas?", opciones: ["Ganan las negras", "Tablas: la partida ya había terminado al aparecer la posición muerta", "Tablas por acuerdo", "Se sigue jugando"], correcta: 1, explicacion: "Con alfiles del mismo color nadie puede dar mate: es una posición muerta (5.2.2), y eso terminó la partida en tablas en cuanto apareció. La bandera de después no cuenta." },
            },
            {
                id: "bandera-alfiles-distintos", ficha: "taller-bandera", titulo: "Alfiles de distinto color", nivel: "Intermedio", ritmo: null,
                escena: "Partida estándar. Rey y alfil para cada uno, el blanco por casillas claras y el negro por oscuras. Se cae la bandera de las blancas y las negras reclaman la victoria.",
                fen: "8/8/8/4b3/2k5/8/K1B5/8 w - - 0 1",
                mate: { bando: "b", serie: "1.Ab1 Rc3 2.Ra1 Rb3#" },
                decision: { texto: "¿Qué resultado anotas?", opciones: ["Tablas, como con alfiles iguales", "Ganan las negras", "Tablas por material insuficiente", "Se sigue jugando"], correcta: 1, explicacion: "Con alfiles de distinto color la posición no es muerta: el alfil blanco puede taparle una casilla a su rey y el alfil negro da mate por la diagonal. Ganan las negras." },
            },
            {
                id: "ilegal-dos-caballos", ficha: "taller-bandera", titulo: "Segunda ilegal contra dos caballos", nivel: "Avanzado", ritmo: null,
                escena: "Partida estándar. Las blancas, que ya tenían una jugada ilegal sancionada, dejan su rey en jaque y pulsan el reloj: segunda jugada ilegal. Ya volviste a la posición anterior. Las blancas tienen rey y torre; las negras, rey y dos caballos.",
                fen: "8/8/8/2n2n2/8/R7/3k4/1K6 w - - 0 1",
                mate: { bando: "b", serie: "1.Ra1 Rc1 2.Ta2 Cb3#" },
                decision: { texto: "¿Qué decides?", opciones: ["Tablas: dos caballos no pueden dar mate", "Ganan las negras", "2 minutos más para las negras y sigue la partida", "Tablas por posición muerta"], correcta: 1, explicacion: "Art. 7.5.5: la segunda jugada ilegal pierde, salvo que el rival no pueda dar mate con ninguna serie legal. Dos caballos no fuerzan el mate, pero la serie existe: ganan las negras." },
            },
            {
                id: "ilegal-rapida-rey-solo", ficha: "taller-bandera", titulo: "Rápidas: segunda ilegal contra el rey solo", nivel: "Básico", ritmo: null,
                escena: "Rápidas, 10 min + 5 s, con supervisión adecuada. Las blancas tienen rey y torre y completan su segunda jugada ilegal. Las negras solo tienen el rey.",
                fen: "8/8/8/3k4/8/8/8/R3K3 w - - 0 1",
                sinMate: "b",
                decision: { texto: "¿Qué decides?", opciones: ["Ganan las negras", "Tablas", "1 minuto para las negras", "Se vuelve atrás y sigue la partida"], correcta: 1, explicacion: "Art. 7.5.5 (que también vale en rápidas): el rey solo no puede dar mate. Tablas." },
            },
            {
                id: "bandera-muro", ficha: "taller-bandera", titulo: "El muro de peones", nivel: "Avanzado", ritmo: null,
                escena: "Partida estándar. Todos los peones están bloqueados y solo se mueven los reyes, que no pueden cruzar. Las negras siguen pensando y se les cae la bandera. Las blancas reclaman la victoria.",
                fen: "7k/8/1p1p1p1p/pPpPpPpP/P1P1P1P1/8/8/K7 w - - 0 1",
                sinMate: "w",
                decision: { texto: "¿Qué decides?", opciones: ["Ganan las blancas", "Tablas: la posición es muerta, ninguno puede dar mate", "Se sigue jugando", "Se juega un desempate"], correcta: 1, explicacion: "Ningún peón puede moverse ni capturar y los reyes no pueden cruzar el muro: en ninguna de las posiciones alcanzables hay mate. Es una posición muerta (5.2.2): la partida ya era tablas." },
            },
            {
                id: "bandera-alfiles-coronados", ficha: "taller-bandera", titulo: "Dos alfiles, un solo color", nivel: "Avanzado", ritmo: null,
                escena: "Partida estándar. Las negras coronaron un alfil y tienen rey y dos alfiles, los dos por casillas oscuras. A las blancas, rey solo, se les cae la bandera.",
                fen: "8/8/2k5/8/3b4/8/1b6/6K1 w - - 0 1",
                sinMate: "b",
                decision: { texto: "¿Qué resultado anotas?", opciones: ["Ganan las negras: dos alfiles dan mate", "Tablas", "Se sigue jugando", "Ganan las blancas"], correcta: 1, explicacion: "Los dos alfiles controlan solo casillas oscuras: el rey blanco siempre tiene una casilla clara libre. No hay mate posible. Tablas (6.9)." },
            },
            {
                id: "rapida-reclamo-caballo", ficha: "taller-bandera", titulo: "Rápidas: reclama con un caballo", nivel: "Intermedio", ritmo: null,
                escena: "Abierto de rápidas sin supervisión adecuada (A.5). Las negras pausan el reloj y reclaman la victoria: a las blancas se les cayó la bandera. Las negras tienen rey y caballo; las blancas, rey y torre.",
                fen: "8/8/8/2n5/8/R7/3k4/1K6 w - - 0 1",
                mate: { bando: "b", serie: "1.Ra1 Rc1 2.Ta2 Cb3#" },
                decision: { texto: "¿Qué decides?", opciones: ["Tablas: quien reclama no puede dar mate", "Ganan las negras", "Se sigue jugando", "Ganan las blancas"], correcta: 1, explicacion: "Art. A.5.3: es tablas solo si quien reclama no puede dar mate con ninguna serie legal. Aquí la torre puede taparle una casilla a su rey y el caballo da mate. Ganan las negras." },
            },

            /* ---------- desempates (los calcula la página con el motor de Pareo Integral) ---------- */
            {
                id: "des-buchholz", ficha: "taller-desempates", tipo: "desempate", titulo: "Buchholz: la fuerza de los rivales", nivel: "Básico",
                escena: "Abierto suizo a 5 rondas. Las bases dicen: desempates <b>BH</b> y después <b>SB</b>. Hay empate en el primer lugar.",
                torneo: { sistema: "suizo", texto: `Alvarado | 2297 | 2b0 4n1 3b1 7n½ 5n0
Brenes | 2236 | 1n1 3n½ 7b0 5b½ 8b½
Castro | 2213 | 4n1 2b½ 1n0 6b1 7n1
Durán | 2180 | 3b0 1b0 5n½ 8n½ 6n½
Esquivel | 2136 | 6n0 8b1 4b½ 2n½ 1b1
Fallas | 2087 | 5b1 7n0 8n0 3n0 4b½
Gamboa | 2040 | 8n1 6b1 2n1 1b½ 3b0
Hidalgo | 2008 | 7b0 5n0 6b1 4b½ 2n½` },
                bases: ["BH", "SB"],
            },
            {
                id: "des-bh-c1", ficha: "taller-desempates", tipo: "desempate", titulo: "Buchholz sin el peor rival", nivel: "Intermedio",
                escena: "Suizo a 5 rondas. Las bases: <b>BH-C1</b> (Buchholz sin el sumando más bajo) y después <b>BH</b>. Fíjate en el orden: el que tiene más Buchholz completo no siempre gana.",
                torneo: { sistema: "suizo", texto: `Alvarado | 2289 | 2b1 8n1 6b½ 3n1 5b½
Brenes | 2254 | 1n0 7b0 4b1 5n1 6b0
Castro | 2206 | 4n½ 5b½ 7n1 1b0 8n0
Durán | 2167 | 3b½ 6b0 2n0 8n1 7b1
Esquivel | 2136 | 6n½ 3n½ 8b1 2b0 1n½
Fallas | 2078 | 5b½ 4n1 1n½ 7b1 2n1
Gamboa | 2032 | 8b0 2n1 3b0 6n0 4n0
Hidalgo | 2017 | 7n1 1b0 5n0 4b0 3b1` },
                bases: ["BH-C1", "BH"],
            },
            {
                id: "des-bh-m1", ficha: "taller-desempates", tipo: "desempate", titulo: "Tres empatados y el Buchholz mediano", nivel: "Avanzado",
                escena: "Suizo de 10 jugadores a 6 rondas. Las bases: <b>BH-M1</b> (sin el sumando más bajo ni el más alto) y después <b>SB</b>. Tres jugadores terminan empatados arriba.",
                torneo: { sistema: "suizo", texto: `Alvarado | 2288 | 2n½ 10b0 8b½ 5n½ 6b½ 9b½
Brenes | 2239 | 1b½ 5n½ 3n1 10b½ 7b1 6n½
Castro | 2195 | 4n1 7b0 2b0 9b1 10n½ 8b1
Durán | 2157 | 3b0 6n1 5b½ 7n½ 8n1 10b1
Esquivel | 2122 | 6n½ 2b½ 4n½ 1b½ 9n1 7b0
Fallas | 2084 | 5b½ 4b0 9n½ 8n1 1n½ 2b½
Gamboa | 2045 | 8b1 3n1 10n0 4b½ 2n0 5n1
Hidalgo | 2006 | 7n0 9b½ 1n½ 6b0 4b0 3n0
Jiménez | 1969 | 10b0 8n½ 6b½ 3n0 5b0 1n½
Leiva | 1915 | 9n1 1n1 7b1 2n½ 3b½ 4n0` },
                bases: ["BH-M1", "SB"],
            },
            {
                id: "des-sb", ficha: "taller-desempates", tipo: "desempate", titulo: "Sonneborn-Berger en un todos contra todos", nivel: "Básico",
                escena: "Torneo todos contra todos de 6 jugadores (el Buchholz no se usa aquí). Las bases: <b>SB</b>.",
                torneo: { sistema: "todos", texto: `Alvarado | 2284 | 6b½ 5n0 4n1 3b1 2n½
Brenes | 2254 | 5n½ 3b0 6n½ 4n½ 1b½
Castro | 2196 | 4b½ 2n1 5b1 1n0 6b½
Durán | 2156 | 3n½ 6n½ 1b0 2b½ 5b1
Esquivel | 2129 | 2b½ 1b1 3n0 6n½ 4n0
Fallas | 2093 | 1n½ 4b½ 2b½ 5b½ 3n½` },
                bases: ["SB"],
            },
            {
                id: "des-de-rr", ficha: "taller-desempates", tipo: "desempate", titulo: "Encuentro directo entre tres", nivel: "Intermedio",
                escena: "Todos contra todos de 6 jugadores. Las bases: <b>DE</b> (encuentro directo) y después <b>SB</b>. Tres jugadores empatan arriba.",
                torneo: { sistema: "todos", texto: `Alvarado | 2271 | 6b1 5n½ 4n0 3b½ 2n1
Brenes | 2235 | 5n0 3b0 6n1 4n1 1b0
Castro | 2196 | 4b0 2n1 5b0 1n½ 6b0
Durán | 2174 | 3n1 6n0 1b1 2b0 5b1
Esquivel | 2118 | 2b1 1b½ 3n1 6n½ 4n0
Fallas | 2093 | 1n0 4b1 2b0 5b½ 3n1` },
                bases: ["DE", "SB"],
            },
            {
                id: "des-de-suizo", ficha: "taller-desempates", tipo: "desempate", titulo: "Encuentro directo en un suizo (art. 6.3)", nivel: "Avanzado",
                escena: "Suizo de 10 jugadores a 5 rondas. Las bases: <b>DE</b> y después <b>BH-C1</b>. Tres empatados arriba, pero no todos jugaron entre sí.",
                torneo: { sistema: "suizo", texto: `Alvarado | 2282 | 2n½ 4n1 3b1 6b1 7b0
Brenes | 2253 | 1b½ 5n1 6n0 7b½ 3b½
Castro | 2215 | 4b1 6n½ 1n0 8b½ 2n½
Durán | 2154 | 3n0 1b0 8n1 10b1 5b1
Esquivel | 2116 | 6b0 2b0 10n1 9n0 4n0
Fallas | 2089 | 5n1 3b½ 2b1 1n0 9n0
Gamboa | 2037 | 8n0 10b1 9b1 2n½ 1n1
Hidalgo | 1998 | 7b1 9n½ 4b0 3n½ 10n1
Jiménez | 1966 | 10n1 8b½ 7n0 5b1 6b1
Leiva | 1937 | 9b0 7n0 5b0 4n0 8b0` },
                bases: ["DE", "BH-C1"],
            },
            {
                id: "des-ps", ficha: "taller-desempates", tipo: "desempate", titulo: "El progresivo premia ir adelante", nivel: "Intermedio",
                escena: "Suizo a 5 rondas de un colegio. Las bases: <b>PS</b> (progresivo) y después <b>BH</b>.",
                torneo: { sistema: "suizo", texto: `Alvarado | 2278 | 2n0 6b1 3b½ 5n1 4b1
Brenes | 2231 | 1b1 4n0 8n0 7n1 6b1
Castro | 2216 | 4b0 7n1 1n½ 6b0 8n1
Durán | 2155 | 3n1 2b1 5b½ 8b1 1n0
Esquivel | 2122 | 6n½ 8b1 4n½ 1b0 7n1
Fallas | 2072 | 5b½ 1n0 7b1 3n1 2n0
Gamboa | 2032 | 8n0 3b0 6n0 2b0 5b0
Hidalgo | 2015 | 7b1 5n0 2b1 4n0 3b0` },
                bases: ["PS", "BH"],
            },
            {
                id: "des-win-won", ficha: "taller-desempates", tipo: "desempate", titulo: "La victoria que no se jugó", nivel: "Intermedio",
                escena: "Suizo a 5 rondas. En la ronda 4 Esquivel ganó por incomparecencia de Castro. Las bases: <b>WIN</b> y después <b>WON</b>.",
                torneo: { sistema: "suizo", texto: `Alvarado | 2286 | 2b1 3b0 5n0 7b1 6n1
Brenes | 2249 | 1n0 4b½ 6b1 8n½ 3b0
Castro | 2205 | 4b1 1n1 8n1 5b- 2n1
Durán | 2151 | 3n0 2n½ 7b½ 6b½ 8b1
Esquivel | 2136 | 6n1 8b0 1b1 3n+ 7b1
Fallas | 2095 | 5b0 7n1 2n0 4n½ 1b0
Gamboa | 2050 | 8b0 6b0 4n½ 1n0 5n0
Hidalgo | 1993 | 7n1 5n1 3b0 2b½ 4n0` },
                bases: ["WIN", "WON"],
            },
            {
                id: "des-negras", ficha: "taller-desempates", tipo: "desempate", titulo: "Las partidas con negras", nivel: "Básico",
                escena: "Suizo a 5 rondas. Las bases: <b>BWG</b> (ganadas con negras) y después <b>BPG</b> (jugadas con negras).",
                torneo: { sistema: "suizo", texto: `Alvarado | 2298 | 2b0 4n½ 7b1 3n1 5n1
Brenes | 2246 | 1n1 5n0 4b½ 6b1 8n0
Castro | 2210 | 4b½ 8n1 5n1 1b0 7b1
Durán | 2161 | 3n½ 1b½ 2n½ 7b0 6b0
Esquivel | 2115 | 6n1 2b1 3b0 8n0 1b0
Fallas | 2100 | 5b0 7n½ 8b1 2n0 4n1
Gamboa | 2059 | 8b0 6b½ 1n0 4n1 3n0
Hidalgo | 2003 | 7n1 3b0 6n0 5b1 2b1` },
                bases: ["BWG", "BPG"],
            },
            {
                id: "des-koya", ficha: "taller-desempates", tipo: "desempate", titulo: "Koya en un todos contra todos de 8", nivel: "Intermedio",
                escena: "Todos contra todos de 8 jugadores a 7 rondas. Las bases: <b>KS</b> (Koya, límite del 50 %: 3½ puntos) y después <b>SB</b>.",
                torneo: { sistema: "todos", texto: `Alvarado | 2284 | 8b½ 7n1 6n½ 5b1 4n1 3b1 2n0
Brenes | 2254 | 7n0 5b½ 3n½ 8b0 6n1 4n½ 1b1
Castro | 2196 | 6b½ 4n0 2b½ 7b1 5n0 1n0 8b½
Durán | 2156 | 5n1 3b1 8n½ 6n1 1b0 2b½ 7b1
Esquivel | 2129 | 4b0 2n½ 7b½ 1n0 3b1 8n½ 6n½
Fallas | 2093 | 3n½ 8n0 1b½ 4b0 2b0 7n½ 5b½
Gamboa | 2048 | 2b1 1b0 5n½ 3n0 8n1 6b½ 4n0
Hidalgo | 2000 | 1n½ 6b1 4b½ 2n1 7b0 5b½ 3n½` },
                bases: ["KS", "SB"],
            },
            {
                id: "des-tpr", ficha: "taller-desempates", tipo: "desempate", titulo: "Rendimiento con un bye", nivel: "Avanzado",
                escena: "Suizo de 9 jugadores a 5 rondas (cada ronda alguien recibe el bye del emparejamiento). Las bases: <b>TPR</b> y después <b>ARO</b>. Recuerda: los dos se calculan solo con las partidas jugadas en el tablero.",
                torneo: { sistema: "suizo", texto: `Alvarado | 2275 | 2b1 3n½ 6n½ 4n½ 8n½
Brenes | 2248 | 1n0 8b½ 5n½ 9n½ 6b½
Castro | 2214 | 4b1 1b½ 9n1 6n½ 7b½
Durán | 2175 | 3n0 BYE 8b1 1b½ 9n1
Esquivel | 2133 | 6n½ 9b½ 2b½ 7n0 BYE
Fallas | 2082 | 5b½ 7n1 1b½ 3b½ 2n½
Gamboa | 2036 | 8n½ 6b0 BYE 5b1 3n½
Hidalgo | 2003 | 7b½ 2n½ 4n0 BYE 1b½
Jiménez | 1975 | BYE 5n½ 3b0 2b½ 4b0` },
                bases: ["TPR", "ARO"],
            },
            {
                id: "des-no-jugadas", ficha: "taller-desempates", tipo: "desempate", titulo: "Byes y ausencias en el Buchholz", nivel: "Avanzado",
                escena: "Suizo de 9 jugadores a 6 rondas. Gamboa no se presentó a la última ronda (bye de cero puntos pedido). Fallas recibió el bye del emparejamiento en la ronda 4. Las bases: <b>BH</b> y después <b>SB</b>. Calcula con el art. 16.",
                torneo: { sistema: "suizo", texto: `Alvarado | 2283 | 2b1 3n1 8n½ 7n0 6n0 9b1
Brenes | 2252 | 1n0 5n1 3b0 9b½ BYE 4b½
Castro | 2204 | 4n1 1b0 2n1 8b½ 7n1 5b0
Durán | 2151 | 3b0 6b½ 9n1 5n1 8n0 2n½
Esquivel | 2120 | 6n½ 2b0 BYE 4b0 9b1 3n1
Fallas | 2085 | 5b½ 4n½ 7n0 BYE 1b1 8b1
Gamboa | 2034 | 8n0 BYE 6b1 1b1 3b0 Z
Hidalgo | 1993 | 7b1 9n1 1b½ 3n½ 4b1 6n0
Jiménez | 1978 | BYE 8b0 4b0 2n½ 5n0 1n0` },
                bases: ["BH", "SB"],
            },
            {
                id: "des-corte-vur", ficha: "taller-desempates", tipo: "desempate", titulo: "El corte de una ronda no jugada", nivel: "Avanzado",
                escena: "Suizo de 10 jugadores a 6 rondas. Alvarado pidió un bye de medio punto en la ronda 4 (y jugó todas las demás). Las bases: <b>BH</b> y después <b>BH-C1</b>. Ojo con el art. 16.5.",
                torneo: { sistema: "suizo", texto: `Alvarado | 2298 | 2n0 7b1 9n1 H 8b1 4n1
Brenes | 2238 | 1b1 H 8b0 5n½ 4b½ 9n½
Castro | 2196 | 4b½ 5n0 10n½ 9b½ 6n0 7n1
Durán | 2173 | 3n½ 6b1 5n1 8b½ 2n½ 1b0
Esquivel | 2133 | 6n½ 3b1 4b0 2b½ 9n½ 10n1
Fallas | 2099 | 5b½ 4n0 7n½ 10b1 3b1 8n0
Gamboa | 2053 | 8n0 1n0 6b½ BYE 10b0 3b0
Hidalgo | 2012 | 7b1 10b1 2n1 4n½ 1n0 6b1
Jiménez | 1951 | 10n0 BYE 1b0 3n½ 5b½ 2b½
Leiva | 1937 | 9b1 8n0 3b½ 6n0 7n1 5b0` },
                bases: ["BH", "BH-C1"],
            },
            {
                id: "des-std", ficha: "taller-desempates", tipo: "desempate", titulo: "Puntos estándar con victorias de 3", nivel: "Intermedio",
                escena: "Torneo escolar con puntuación 3-1-0 (victoria 3, tablas 1, derrota 0). Las bases: <b>STD</b> (puntos estándar) y después <b>BH</b>.",
                torneo: { sistema: "suizo", puntos: { victoria: 3, tablas: 1, derrota: 0, bye: 3 }, texto: `Alvarado | 2299 | 2n0 4b1 7b½ 3n½ 8n½
Brenes | 2238 | 1b1 3b0 8n½ 5n½ 6b½
Castro | 2205 | 4b1 2n1 5n½ 1b½ 7n½
Durán | 2164 | 3n0 1n0 6b1 8b1 5b1
Esquivel | 2133 | 6b1 7n1 3b½ 2b½ 4n0
Fallas | 2084 | 5n0 8b0 4n0 7b1 2n½
Gamboa | 2041 | 8b1 5b0 1n½ 6n0 3b½
Hidalgo | 1991 | 7n0 6n1 2b½ 4n0 1b½` },
                bases: ["STD", "BH"],
            },

            /* ---------- normas (las calcula la página con js/normas-titulo.js) ----------
               Cada rival: "nombre|título|federación|Elo|resultado" (1, ½, 0, + o -). */
            {
                id: "nor-mi-basica", ficha: "taller-normas", tipo: "norma", titulo: "Una norma de MI, paso a paso", nivel: "Básico",
                escena: "Abierto internacional a 9 rondas. Un jugador de Costa Rica te pide el certificado de norma de MI. Todas las partidas se jugaron en el tablero.",
                jugador: { fed: "CRC", sexo: "m" }, sistema: "suizo", titulos: ["GM", "IM"],
                rivales: ["Ríos|FM|CRC|2310|1", "Paredes|IM|MEX|2405|½", "Llorente|GM|ESP|2515|0", "Quesada|FM|CRC|2290|1", "Duarte|IM|COL|2390|1", "Salgado|IM|CUB|2420|½", "Benítez|FM|ARG|2335|1", "Ortega|GM|PER|2470|½", "Mora|FM|CRC|2280|½"],
                esperado: { GM: false, IM: true },
            },
            {
                id: "nor-gm-por-medio", ficha: "taller-normas", tipo: "norma", titulo: "La norma de GM por medio punto", nivel: "Básico",
                escena: "Torneo cerrado de 10 jugadores a 9 rondas. El jugador hizo 5½ y pregunta si le alcanza para la norma de GM.",
                jugador: { fed: "CRC", sexo: "m" }, sistema: "todos", titulos: ["GM", "IM"],
                rivales: ["Cordero|GM|ESP|2560|½", "Villalobos|IM|MEX|2430|1", "Petrov|GM|BUL|2590|0", "Aguilar|IM|CRC|2410|1", "Núñez|GM|CUB|2520|½", "Chaves|FM|CRC|2350|1", "Ramírez|GM|COL|2540|½", "Salas|IM|PAN|2400|½", "Solís|IM|CRC|2390|½"],
                esperado: { GM: false, IM: true },
            },
            {
                id: "nor-piso", ficha: "taller-normas", tipo: "norma", titulo: "Dos rivales debajo del piso", nivel: "Intermedio",
                escena: "Abierto a 9 rondas. Dos de los rivales del jugador están debajo de 2200: Chaves (2150) y Solís (2080). Calcula el promedio para la norma de GM.",
                jugador: { fed: "CRC", sexo: "m" }, sistema: "suizo", titulos: ["GM"],
                rivales: ["Cordero|GM|ESP|2610|½", "Villalobos|IM|MEX|2440|1", "Petrov|GM|BUL|2600|½", "Aguilar|IM|CRC|2450|1", "Núñez|GM|CUB|2560|½", "Chaves|FM|CRC|2150|1", "Ramírez|GM|COL|2580|½", "Salas|IM|PAN|2480|1", "Solís||CRC|2080|1"],
                esperado: { GM: true },
            },
            {
                id: "nor-sin-elo", ficha: "taller-normas", tipo: "norma", titulo: "Un rival sin Elo", nivel: "Intermedio",
                escena: "Abierto a 9 rondas. En la ronda 1 el jugador le ganó a Brenes, que no tiene Elo FIDE. Calcula para la norma de MI.",
                jugador: { fed: "CRC", sexo: "m" }, sistema: "suizo", titulos: ["IM"],
                rivales: ["Brenes||CRC|0|1", "Paredes|IM|MEX|2420|½", "Llorente|GM|ESP|2530|½", "Quesada|FM|CRC|2330|1", "Duarte|IM|COL|2410|½", "Salgado|IM|CUB|2440|1", "Benítez|FM|ARG|2350|½", "Ortega|GM|PER|2490|½", "Mora|FM|CRC|2340|1"],
                esperado: { IM: true },
            },
            {
                id: "nor-federaciones", ficha: "taller-normas", tipo: "norma", titulo: "Casi todos de casa", nivel: "Intermedio",
                escena: "Un abierto nacional, que no es el campeonato nacional. El jugador hizo 7 de 9 y su rendimiento pasa de 2450. Siete de sus rivales son de Costa Rica.",
                jugador: { fed: "CRC", sexo: "m" }, sistema: "suizo", titulos: ["IM"],
                rivales: ["Ríos|FM|CRC|2310|1", "Paredes|IM|MEX|2405|½", "Lara|GM|CRC|2470|½", "Quesada|FM|CRC|2290|1", "Duarte|IM|CRC|2390|1", "Salgado|IM|CRC|2420|½", "Benítez|FM|CRC|2335|1", "Ortega|GM|MEX|2470|½", "Mora|FM|CRC|2280|1"],
                esperado: { IM: false },
            },
            {
                id: "nor-titulos", ficha: "taller-normas", tipo: "norma", titulo: "Muchos CM", nivel: "Intermedio",
                escena: "Abierto a 9 rondas. El jugador hizo 7 de 9 contra rivales de seis federaciones. Cuatro de ellos son CM y dos no tienen título.",
                jugador: { fed: "CRC", sexo: "m" }, sistema: "suizo", titulos: ["IM"],
                rivales: ["Ríos|CM|CRC|2310|1", "Paredes|IM|MEX|2405|½", "Llorente|GM|ESP|2515|0", "Quesada|CM|CRC|2290|1", "Duarte||COL|2390|1", "Salgado|IM|CUB|2420|½", "Benítez|CM|ARG|2335|1", "Ortega||PER|2370|1", "Mora|CM|CRC|2280|1"],
                esperado: { IM: false },
            },
            {
                id: "nor-ocho-nueve", ficha: "taller-normas", tipo: "norma", titulo: "Ocho partidas que valen por nueve", nivel: "Avanzado",
                escena: "Abierto a 9 rondas. En la ronda 1 el rival no se presentó y el jugador ganó por incomparecencia. Jugó las otras 8 en el tablero.",
                jugador: { fed: "CRC", sexo: "m" }, sistema: "suizo", titulos: ["IM"],
                rivales: ["Ríos|FM|CRC|2310|+", "Paredes|IM|MEX|2405|½", "Llorente|GM|ESP|2515|½", "Quesada|FM|CRC|2290|1", "Duarte|IM|COL|2390|1", "Salgado|IM|CUB|2420|½", "Benítez|FM|ARG|2335|1", "Ortega|GM|PER|2470|½", "Mora|FM|CRC|2280|½"],
                esperado: { IM: true },
            },
            {
                id: "nor-cortar", ficha: "taller-normas", tipo: "norma", titulo: "Perdió al final", nivel: "Avanzado",
                escena: "Abierto suizo a 11 rondas. El jugador iba bien, pero perdió las tres últimas partidas. Con las 11, su rendimiento no llega a 2450. ¿Hay norma de MI?",
                jugador: { fed: "CRC", sexo: "m" }, sistema: "suizo", titulos: ["IM"],
                rivales: ["Ríos|FM|CRC|2310|1", "Paredes|IM|MEX|2405|1", "Llorente|GM|ESP|2515|½", "Quesada|FM|CRC|2290|1", "Duarte|IM|COL|2390|½", "Salgado|IM|CUB|2420|1", "Benítez|FM|ARG|2335|½", "Ortega|GM|PER|2470|½", "Mora|FM|CRC|2280|0", "Vega|IM|VEN|2430|0", "Arias|GM|CHI|2500|0"],
                esperado: { IM: true },
            },
            {
                id: "nor-dejar-ganada", ficha: "taller-normas", tipo: "norma", titulo: "El promedio que no llega", nivel: "Avanzado",
                escena: "Abierto suizo a 10 rondas. El jugador hizo 8 de 10 y su rendimiento pasa de 2600, pero el promedio de sus 10 rivales es menor que 2380. ¿Puede pedir la norma de GM?",
                jugador: { fed: "CRC", sexo: "m" }, sistema: "suizo", titulos: ["GM"],
                rivales: ["Cordero|GM|ESP|2500|½", "Villalobos|IM|MEX|2380|1", "Petrov|GM|BUL|2490|1", "Aguilar|IM|CRC|2370|1", "Núñez|GM|CUB|2480|½", "Chaves|FM|CRC|2250|1", "Ramírez|GM|COL|2470|1", "Salas|IM|PAN|2360|½", "Solís|FM|CRC|2050|1", "Rojas|FM|URU|2290|½"],
                esperado: { GM: true },
            },
            {
                id: "nor-punto-de-mas", ficha: "taller-normas", tipo: "norma", titulo: "Una norma que vale por once", nivel: "Intermedio",
                escena: "Abierto a 9 rondas. El jugador arrasó: 8 de 9. ¿Cuántas partidas vale su norma de MI para las 27 del título?",
                jugador: { fed: "CRC", sexo: "m" }, sistema: "suizo", titulos: ["GM", "IM"],
                rivales: ["Ríos|FM|CRC|2310|1", "Paredes|IM|MEX|2405|1", "Llorente|GM|ESP|2515|½", "Quesada|FM|CRC|2290|1", "Duarte|IM|COL|2390|1", "Salgado|IM|CUB|2420|1", "Benítez|FM|ARG|2335|1", "Ortega|GM|PER|2470|½", "Mora|FM|CRC|2280|1"],
                esperado: { GM: false, IM: true },
            },
            {
                id: "nor-wgm-im", ficha: "taller-normas", tipo: "norma", titulo: "Una jugadora, dos normas", nivel: "Avanzado",
                escena: "Abierto a 9 rondas. Una jugadora de Costa Rica hizo 6½. ¿Para qué títulos le sirve la norma?",
                jugador: { fed: "CRC", sexo: "f" }, sistema: "suizo", titulos: ["IM", "WGM"],
                rivales: ["Ríos|WIM|CRC|2210|1", "Paredes|IM|MEX|2380|½", "Llorente|WGM|ESP|2330|½", "Quesada|WFM|CRC|2190|1", "Duarte|IM|COL|2370|½", "Salgado|WGM|CUB|2310|1", "Benítez|FM|ARG|2300|1", "Ortega|GM|PER|2450|½", "Mora|WIM|CRC|2250|½"],
                esperado: { IM: true, WGM: true },
            },
            {
                id: "nor-promedio-bajo", ficha: "taller-normas", tipo: "norma", titulo: "8½ de 9 y sin norma de GM", nivel: "Avanzado",
                escena: "Abierto a 9 rondas. El jugador hizo 8½ de 9 y pide la norma de GM: «mi rendimiento es de más de 2800».",
                jugador: { fed: "CRC", sexo: "m" }, sistema: "suizo", titulos: ["GM", "IM"],
                rivales: ["Cordero|GM|ESP|2480|1", "Villalobos|IM|MEX|2380|1", "Petrov|GM|BUL|2490|1", "Aguilar|IM|CRC|2370|1", "Núñez|GM|CUB|2470|1", "Chaves|FM|CRC|2250|1", "Ramírez|IM|COL|2400|½", "Salas|IM|PAN|2300|1", "Solís|FM|CRC|2190|1"],
                esperado: { GM: false, IM: true },
            },
        ],

        /* Para Practicar › Posiciones idénticas. Las secuencias que solo
           mueven el rey van en inglés (K): en español «R» sería ambiguo con
           la torre inglesa y js/reclamos-tablas.js las leería mal. */
        repeticiones: [
            { id: "taller-enroque", titulo: "El rey que pierde el enroque", fen: "r3k2r/ppp2ppp/2n2n2/3pp3/3PP3/2N2N2/PPP2PPP/R3K2R w KQkq - 0 10", jugadas: "10. Ke2 Ke7 11. Ke1 Ke8 12. Ke2 Ke7 13. Ke1 Ke8", esperado: { triple: false, fotos: 3 } },
            { id: "taller-enroque-largo", titulo: "El mismo paseo, dos vueltas más", fen: "r3k2r/ppp2ppp/2n2n2/3pp3/3PP3/2N2N2/PPP2PPP/R3K2R w KQkq - 0 10", jugadas: "10. Ke2 Ke7 11. Ke1 Ke8 12. Ke2 Ke7 13. Ke1 Ke8 14. Ke2 Ke7 15. Ke1 Ke8", esperado: { triple: true, fotos: 4 } },
            { id: "taller-torre", titulo: "La torre que va y vuelve", fen: "4k3/pppp4/8/8/8/8/1PPP4/R3K3 w Q - 0 20", jugadas: "20. Ta2 Rf8 21. Ta1 Re8 22. Ta2 Rf8 23. Ta1 Re8", esperado: { triple: false, fotos: 3 } },
            { id: "taller-torre-despues", titulo: "La torre, cuando ya no hay enroque", fen: "4k3/pppp4/8/8/8/8/1PPP4/R3K3 w Q - 0 20", jugadas: "20. Ta2 Rf8 21. Ta1 Re8 22. Ta2 Rf8 23. Ta1 Re8 24. Ta2 Rf8 25. Ta1 Re8", esperado: { triple: true, fotos: 4 } },
            { id: "taller-triangulo", titulo: "El triángulo del rey", fen: "7k/8/8/p7/P7/8/2K5/8 w - - 0 50", jugadas: "50. Kd2 Kh7 51. Kd1 Kh8 52. Kc2 Kh7 53. Kd2 Kh8 54. Kd1 Kh7 55. Kc2 Kh8", esperado: { triple: false, fotos: 3 } },
            { id: "taller-cinco", titulo: "Cinco veces", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", jugadas: "1. Cf3 Cf6 2. Cg1 Cg8 3. Cf3 Cf6 4. Cg1 Cg8 5. Cf3 Cf6 6. Cg1 Cg8 7. Cf3 Cf6 8. Cg1 Cg8", esperado: { triple: true, fotos: 5 } },
            { id: "taller-salteada", titulo: "La repetición salteada", fen: "4k3/8/4p3/8/8/4P3/8/R3K3 w - - 0 40", jugadas: "40. Ta2 Rd8 41. Ta1 Re8 42. Ta3 Rd7 43. Ta1 Re8 44. Tb1 Rf7 45. Ta1 Re8", esperado: { triple: true, fotos: 4 } },
            { id: "taller-al-paso", titulo: "La captura al paso que sí se podía", fen: "4k3/8/8/8/5p2/8/4P3/4K3 w - - 0 30", jugadas: "30. e4 Kd8 31. Kd1 Ke8 32. Ke1 Kd8 33. Kd1 Ke8 34. Ke1", esperado: { triple: false, fotos: 3 } },
            { id: "taller-al-paso-2", titulo: "La captura al paso, una vuelta más", fen: "4k3/8/8/8/5p2/8/4P3/4K3 w - - 0 30", jugadas: "30. e4 Kd8 31. Kd1 Ke8 32. Ke1 Kd8 33. Kd1 Ke8 34. Ke1 Kd8 35. Kd1 Ke8 36. Ke1", esperado: { triple: true, fotos: 4 } },
        ],
    };

    /* Tableros para preguntas y casos de las revistas que describen una
       posición. «texto» es el principio exacto del enunciado. */
    const DIAGRAMAS = [
        { ficha: "relojes", texto: "Segunda jugada ilegal completada de las blancas; a las negras solo les queda el rey.", fen: "8/8/2k5/8/8/3R4/3P4/3K4 w - - 0 1", sinMate: "b" },
        { ficha: "siete-cartas", texto: "Las negras, con rey, caballo y peón, ofrecen tablas", fen: "6nk/7p/8/4N3/4K3/8/8/8 w - - 0 1", mate: { bando: "w", serie: "1.Rf5 h6 2.Rg6 h5 3.Cf7#" }, pie: "Un ejemplo: el caballo y el peón negros le tapan casillas a su propio rey." },
        { ficha: "posicion-muerta", texto: "Rey y caballo contra rey y caballo. ¿Es posición muerta?", fen: "8/8/4k3/8/3n4/8/2N5/1K6 w - - 0 1", mate: { bando: "b", serie: "1.Ra2 Rd5 2.Ra1 Rc4 3.Ca3+ Rb3 4.Cb1 Cc2#" } },
        { ficha: "posicion-muerta", texto: "A las blancas se les cae la bandera. Las negras tienen rey y caballo; las blancas, rey y caballo.", fen: "8/8/4k3/8/3n4/8/2N5/1K6 w - - 0 1", mate: { bando: "b", serie: "1.Ra2 Rd5 2.Ra1 Rc4 3.Ca3+ Rb3 4.Cb1 Cc2#" } },
        { ficha: "posicion-muerta", texto: "A las blancas se les cae la bandera. Las negras solo tienen el rey.", fen: "6k1/8/8/8/8/8/1Q3PP1/6K1 w - - 0 1", sinMate: "b" },
        { ficha: "posicion-muerta-n14", texto: "Rey y alfil contra rey y alfil, con los alfiles en casillas de distinto color.", fen: "8/8/8/4b3/2k5/8/K1B5/8 w - - 0 1", mate: { bando: "b", serie: "1.Ab1 Rc3 2.Ra1 Rb3#" } },
        { ficha: "posicion-muerta-n14", texto: "Rey y alfil contra rey y alfil, alfiles del mismo color.", fen: "8/8/3k4/8/2b5/8/4B3/5K2 w - - 0 1", sinMate: "b" },
        { ficha: "posicion-muerta-n14", texto: "Rey y caballo contra rey y caballo. Cae la bandera de las blancas.", fen: "8/8/4k3/8/3n4/8/2N5/1K6 w - - 0 1", mate: { bando: "b", serie: "1.Ra2 Rd5 2.Ra1 Rc4 3.Ca3+ Rb3 4.Cb1 Cc2#" } },
        { ficha: "posicion-muerta-n14", texto: "Rey y caballo contra rey solo. Cae la bandera del jugador del caballo.", fen: "8/8/8/4k3/8/2n5/8/6K1 b - - 0 1", sinMate: "w", pie: "Las negras, con el caballo, se quedan sin tiempo; las blancas solo tienen el rey." },
        { ficha: "bandera-y-mate-posible", texto: "Al jugador A se le termina el tiempo. Su rival B solo tiene el rey.", fen: "8/5k2/8/8/8/2Q5/5PPP/6K1 w - - 0 1", sinMate: "b", pie: "A juega con blancas; B, con negras." },
        { ficha: "bandera-y-mate-posible", texto: "Partida rápida sin supervisión adecuada (A.5). Un jugador detiene el reloj y reclama la victoria", fen: "8/8/8/2n5/8/R7/3k4/1K6 w - - 0 1", mate: { bando: "b", serie: "1.Ra1 Rc1 2.Ta2 Cb3#" }, pie: "Quien reclama juega con negras (rey y caballo); al de blancas (rey y torre) se le cayó la bandera." },
        { ficha: "leyes-borrador-2013-a-2023", texto: "Un jugador completa su segunda jugada ilegal en una partida estándar. Al rival solo le queda el rey.", fen: "8/8/8/3k4/8/8/8/R3K3 w - - 0 1", sinMate: "b" },
        { ficha: "leyes-2014-a-2023", texto: "Un jugador abandona con rey y caballo contra rey solo del rival.", fen: "8/8/8/4k3/8/2n5/8/6K1 w - - 0 1", sinMate: "w", pie: "Abandonan las negras, que tienen el caballo. Las blancas, con el rey solo, no pueden dar mate." },
    ];
    const DIAGRAMAS_CASOS = [
        { caso: "segunda-ilegal", fen: "7R/8/8/8/3n4/8/P2k4/1K6 w - - 0 1", mate: { bando: "b", serie: "1.Ra1 Rc1 2.Th7 Cc2#" } },
        { caso: "bandera-caballos", fen: "8/8/4k3/8/3n4/8/2N5/1K6 w - - 0 1", mate: { bando: "b", serie: "1.Ra2 Rd5 2.Ra1 Rc4 3.Ca3+ Rb3 4.Cb1 Cc2#" } },
        { caso: "torre-y-cadena", fen: "8/8/7k/1p1p1p1p/pPpPpPpP/P1P1P1P1/3RK3/8 w - - 0 1" },
        { caso: "bandera-icc", fen: "8/3N4/1k1K4/p7/2r5/8/1b6/2n5 b - - 0 1" },
        { caso: "cadena-bloqueada", fen: "8/8/6k1/1p1p1p2/pPpPpPp1/P1P1P1P1/6K1/8 w - - 0 1", sinMate: "w" },
        { caso: "telefono-sin-material", fen: "4k3/8/8/8/8/8/3Q4/4K3 w - - 0 1" },
        { caso: "abandono-sin-mate", fen: "8/8/3k4/8/8/2B5/8/4K3 b - - 0 1", sinMate: "w" },
        { caso: "torre-invertida-mate", fen: "4k3/6P1/3K4/8/8/8/8/8 w - - 0 1" },
    ];

    ["colecciones", "fichas", "preguntas", "casos", "repeticiones"].forEach((k) => { C[k].push.apply(C[k], TALLER[k]); });
    C.diagramas = { preguntas: DIAGRAMAS, casos: DIAGRAMAS_CASOS };
    function enganchar(dest, d) {
        if (d.fen) dest.fen = d.fen;
        if (d.mate) dest.mate = d.mate;
        if (d.sinMate) dest.sinMate = d.sinMate;
        if (d.pie) dest.pie = d.pie;
    }
    DIAGRAMAS.forEach((d) => {
        const p = C.preguntas.filter((x) => x.ficha === d.ficha && x.texto.indexOf(d.texto) === 0);
        if (p.length === 1) enganchar(p[0], d);
    });
    DIAGRAMAS_CASOS.forEach((d) => {
        const c = C.casos.find((x) => x.id === d.caso);
        if (c) enganchar(c, d);
    });
})(typeof window !== "undefined" ? window : globalThis);

/*! rev bfb5bbb0d2d82f9f */
