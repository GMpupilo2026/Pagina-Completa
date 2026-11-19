/* Aula de Arbitraje — el contenido: fichas, preguntas, casos y ejercicios.

   Para agregar material se copia un bloque y se cambia su «id». Lo revisa
   herramientas/verificar-aula-arbitraje.js (sin navegador): que cada pregunta
   y cada caso cuelguen de una ficha que existe, que las soluciones de los
   casos con «calculo» salgan del método proporcional, y que cada ejercicio de
   repeticiones dé con chess.js lo que dice «esperado».

   - colecciones: agrupan fichas (cada número de la revista).
   - fichas: el material para estudiar (HTML escrito aquí, nunca texto de
     una persona).
   - preguntas: opción múltiple; «correcta» es el índice (0 = la primera).
   - casos: situaciones de sala. Con «reloj», se ajusta el reloj y se compara
     con «soluciones» (tiempos «h:mm:ss»; «optima» es la recomendada,
     «valida» se acepta con su comentario). «calculo» son los datos con que
     el verificador rehace la solución óptima.
   - repeticiones: posición inicial (FEN) y jugadas en algebraica española;
     el análisis lo hace js/reclamos-tablas.js.

   Ver «Aula de Arbitraje» en docs/decisiones/juegos-y-torneos.md. */
(function (raiz) {
    "use strict";

    const AULA_CONTENIDO = {
        colecciones: [
            { id: "revista-1", titulo: "Revista Arbitraje de Ajedrez · N.º 1", nota: "Actualizada a la normativa FIDE vigente (noviembre de 2026)" },
        ],

        fichas: [
            {
                id: "relojes", coleccion: "revista-1", titulo: "Ajuste de relojes después de una irregularidad",
                articulos: "Leyes 2023 · arts. 6.10.2, 7.1, 7.5, A.3, A.5.2",
                resumen: "Qué tiempos dejar en el reloj al restablecer una posición anterior, la sanción por jugada ilegal y el contador de jugadas.",
                claves: [
                    "Art. 7.1: el árbitro fija los tiempos con su mejor criterio, incluido el derecho a no cambiarlos.",
                    "Primera jugada ilegal completada: 2 minutos más al rival (1 en rápidas y relámpago). Segunda: pierde, salvo que el rival no pueda dar mate (tablas).",
                    "Trabaja siempre con tiempo consumido y en minutos.",
                    "Consumido ideal = consumido × jugadas que quedan ÷ jugadas hechas.",
                    "Con incremento, en el reloj quedan solo los incrementos de las jugadas que quedan.",
                    "Si se vuelve a antes del control (por ejemplo, la jugada 40), se quita el tiempo que sumó ese control.",
                ],
                contenido: `
<h3>Qué dice la norma</h3>
<div class="aula-norma"><b>Art. 7.1</b> Si hay una irregularidad y se deben devolver las piezas a una posición anterior, el árbitro decide con su mejor criterio los tiempos del reloj, <b>incluido el derecho a no cambiarlos</b>. Si hace falta, ajusta también el contador de jugadas.</div>
<div class="aula-norma"><b>Arts. 7.5.1 y 7.5.5</b> La jugada ilegal queda completada al pulsar el reloj. Se vuelve a la posición de justo antes de la irregularidad. Por la primera jugada ilegal, 2 minutos más para el rival; por la segunda del mismo jugador, partida perdida, salvo que el rival no pueda dar mate con ninguna serie de jugadas legales (tablas).</div>
<div class="aula-norma"><b>Arts. 7.5.3 y 7.5.4</b> Pulsar el reloj sin haber movido, o mover con las dos manos (enroque, captura, coronación) y pulsar, se sanciona como jugada ilegal.</div>
<div class="aula-norma"><b>Art. 6.10.2</b> Si el reloj está mal programado, se detiene, se pone la programación correcta y se ajustan tiempos y contador con el mejor criterio.</div>
<div class="aula-norma aula-norma-aviso"><b>Rápidas y relámpago.</b> La sanción es de 1 minuto (A.3). Sin supervisión adecuada (A.5.2), el árbitro actúa solo si el rival todavía no hizo su siguiente jugada; si nadie reclama a tiempo, la jugada ilegal se queda.</div>
<h3>En qué orden decidir</h3>
<ol>
<li><b>Si se conocen los tiempos reales</b> (tablero electrónico, historial del reloj, tiempos anotados), se ponen esos.</li>
<li><b>Si no se conocen</b>, el método proporcional.</li>
<li><b>Si la irregularidad es muy vieja o los datos no son confiables</b>, se dejan los relojes (art. 7.1) y se ajusta solo el contador.</li>
<li><b>Siempre</b>, la sanción del art. 7.5.5 y revisar el contador de jugadas y los controles.</li>
</ol>
<h3>El método proporcional</h3>
<p><b>1.</b> Junta los datos: el tiempo consumido de cada jugador, las jugadas hechas, las que quedan después de volver atrás y quién cometió la irregularidad. Si fueron las negras, las blancas conservan una jugada más; si fueron las blancas, los dos quedan con las mismas.</p>
<p><b>2.</b> <span class="aula-formula">consumido ideal = consumido × quedan ÷ hechas</span> (multiplica antes de dividir).</p>
<p><b>3.</b> <span class="aula-formula">reloj = tiempo de los controles alcanzados − consumido ideal</span></p>
<p><b>Con incremento:</b> <span class="aula-formula">consumido = base + hechas × incremento − reloj</span> y al final <span class="aula-formula">reloj = base de los controles alcanzados + quedan × incremento − consumido ideal</span>.</p>
<p><b>La variante de horario</b> (opcional, no es regla de FIDE): la diferencia entre el tiempo real de juego y la suma de los consumidos ideales se reparte en partes iguales como tiempo consumido. Conviene anunciarla en las bases.</p>
<h3>El ejemplo de la revista (sin incremento)</h3>
<p>Ritmo 2 h/40 + 1 h. Jugada ilegal de las negras en la 43; las blancas acaban de hacer la 52. Consumido: blancas 152 min, negras 97 min.</p>
<div class="aula-tabla"><table><tr><th></th><th>Blancas</th><th>Negras</th></tr>
<tr><td>Consumido ideal</td><td>152 × 43 ÷ 52 = 125:42</td><td>97 × 42 ÷ 51 = 79:53</td></tr>
<tr><td>Reloj (180 − ideal)</td><td>54:18</td><td>100:07</td></tr>
<tr><td>Sanción 7.5.5</td><td>+2:00</td><td>—</td></tr>
<tr><td><b>Se pone</b></td><td><b>56:18</b></td><td><b>100:07</b></td></tr></table></div>
<p class="aula-nota">Fe de erratas de la edición original: con incremento se restaban los incrementos de 52 y 51 jugadas. Lo correcto es dejar solo los de las jugadas que quedan (43 y 42).</p>`,
            },
            {
                id: "koya", coleccion: "revista-1", titulo: "Sistema de desempate Koya",
                articulos: "Reglamento de desempates de FIDE (C.07, desde el 1 de marzo de 2026) · arts. 4.2, 9.2, 14.5, 15.2",
                resumen: "Los puntos hechos contra quienes lograron al menos el 50 % de la puntuación máxima posible. Solo para todos contra todos.",
                claves: [
                    "KS = puntos contra quienes lograron al menos el 50 % de la puntuación máxima posible.",
                    "El límite sale de la puntuación máxima posible (las rondas), no de la del ganador.",
                    "Un rival con exactamente el 50 % sí cuenta.",
                    "El modificador de límite (14.5) sube o baja ½ punto cada vez; bajarlo suma rivales.",
                    "Los desempates se aplican en orden, solo al grupo que sigue empatado (4.2).",
                    "En todos contra todos, las incomparecencias cuentan como partidas normales (15.2), con excepciones para los desempates de rating y los de tipo B.",
                ],
                contenido: `
<h3>La definición</h3>
<div class="aula-norma"><b>Art. 9.2 (KS)</b> Los puntos logrados contra todos los participantes que obtuvieron al menos el 50 % de la puntuación máxima posible del torneo.</div>
<div class="aula-norma"><b>Art. 14.5 (límite)</b> El límite del 50 % se puede subir o bajar medio punto cada vez: al subirlo cuentan menos rivales; al bajarlo, más. Reemplaza a los antiguos «Koya extendido» y «Koya reducido».</div>
<h3>Paso a paso</h3>
<ol>
<li>Puntuación máxima posible = número de rondas (en un todos contra todos a una vuelta, jugadores − 1).</li>
<li>Límite = 50 % de esa cifra (10 jugadores → 9 rondas → 4½).</li>
<li>Marca los rivales con puntuación igual o mayor al límite.</li>
<li>Suma, para cada empatado, los puntos que hizo contra esos rivales.</li>
<li>Si sigue el empate, aplica el siguiente desempate de las bases solo a quienes siguen empatados.</li>
</ol>
<h3>Errores frecuentes</h3>
<ul>
<li>Usar el 50 % de los puntos del ganador.</li>
<li>Dejar afuera al rival que tiene exactamente el 50 %.</li>
<li>Usar el límite modificado sin que esté en las bases.</li>
<li>Volver a desempatar a todo el grupo original y no solo a quienes siguen empatados.</li>
</ul>`,
            },
            {
                id: "repeticion", coleccion: "revista-1", titulo: "Posiciones idénticas",
                articulos: "Leyes 2023 · arts. 9.2, 9.6",
                resumen: "Cuándo dos posiciones son la misma: piezas, turno, enroques y captura al paso. Cómo se reclama y cuándo es automático.",
                claves: [
                    "Son iguales si y solo si: el mismo turno, las mismas piezas en las mismas casillas y los mismos movimientos posibles.",
                    "No son iguales si al empezar la secuencia se podía capturar al paso.",
                    "No son iguales si se perdió un derecho de enroque (se pierde solo al mover el rey o la torre).",
                    "Reclama quien tiene el turno: la posición que va a aparecer (anota la jugada y lo declara) o la que acaba de aparecer.",
                    "Cinco veces: tablas automáticas (9.6.1). 75 jugadas sin peón ni captura: tablas automáticas (9.6.2).",
                    "Las «posiciones fotográficas» no existen: la foto no muestra el turno, el enroque ni la captura al paso.",
                ],
                contenido: `
<h3>La definición de hoy</h3>
<div class="aula-norma"><b>Art. 9.2.3</b> Las posiciones son iguales si y solo si le toca jugar al mismo jugador, piezas del mismo tipo y color están en las mismas casillas y los movimientos posibles de todas las piezas de los dos jugadores son los mismos. No lo son si (9.2.3.1) al empezar la secuencia se podía capturar un peón al paso, o (9.2.3.2) un rey tenía derecho a enrocar con una torre sin mover y lo perdió después.</div>
<div class="aula-norma"><b>Arts. 9.2.1 y 9.2.2</b> Reclama quien tiene el turno, cuando la misma posición va a aparecer (anota la jugada en la planilla y le declara al árbitro que la va a hacer, sin hacerla) o acaba de aparecer, por lo menos por tercera vez.</div>
<div class="aula-norma"><b>Art. 9.6</b> Tablas automáticas: la misma posición al menos cinco veces (9.6.1); 75 jugadas de cada uno sin mover un peón ni capturar, salvo mate en la última jugada (9.6.2).</div>
<h3>La tabla de análisis</h3>
<p>Para cada vez que aparece la posición, anota tres columnas: <b>piezas</b>, <b>movimientos especiales</b> (derecho a enrocar aunque esté impedido por ahora; captura al paso posible) y <b>turno</b>. Si las tres coinciden en las tres apariciones, el reclamo procede. En Practicar, la tabla se arma sola.</p>
<h3>El detalle de la captura al paso</h3>
<p>Cuenta solo si la captura <b>se puede hacer</b>. Si el peón que capturaría está clavado (la captura dejaría a su rey en jaque), no hay captura posible y las posiciones sí pueden ser iguales.</p>`,
            },
        ],

        preguntas: [
            { ficha: "relojes", texto: "Con las Leyes vigentes (2023), ¿qué artículo dice cómo fijar los tiempos cuando hay que volver a una posición anterior?", opciones: ["Art. 6.13", "Art. 7.1", "Art. 9.2", "Art. 11.3"], correcta: 1, explicacion: "El antiguo 6.13 es hoy el art. 7.1, que además reconoce el derecho del árbitro a no cambiar los relojes." },
            { ficha: "relojes", texto: "Partida estándar. Primera jugada ilegal completada de las negras. ¿Cuál es la sanción?", opciones: ["Una advertencia", "1 minuto más para las blancas", "2 minutos más para las blancas", "Las negras pierden 2 minutos"], correcta: 2, explicacion: "Art. 7.5.5: el árbitro le da 2 minutos más al rival por la primera jugada ilegal completada." },
            { ficha: "relojes", texto: "Partida rápida. Primera jugada ilegal completada. ¿Cuánto tiempo más recibe el rival?", opciones: ["30 segundos", "1 minuto", "2 minutos", "Ninguno"], correcta: 1, explicacion: "Art. A.3: en rápidas (y en relámpago) las sanciones de los arts. 7 y 9 son de 1 minuto en lugar de 2." },
            { ficha: "relojes", texto: "¿Cuándo queda completada una jugada ilegal?", opciones: ["Al soltar la pieza", "Cuando el rival la señala", "Al pulsar el reloj", "Cuando se anota en la planilla"], correcta: 2, explicacion: "Art. 7.5.1: la jugada ilegal queda completada cuando el jugador pulsa su reloj." },
            { ficha: "relojes", texto: "Segunda jugada ilegal completada de las blancas; a las negras solo les queda el rey. ¿Resultado?", opciones: ["Ganan las negras", "Tablas", "1 minuto más para las negras", "Se repite la partida"], correcta: 1, explicacion: "Art. 7.5.5: la segunda jugada ilegal pierde, salvo que el rival no pueda dar mate con ninguna serie de jugadas legales; entonces son tablas. Con el rey solo no hay mate posible." },
            { ficha: "relojes", texto: "Después de volver a la posición anterior, ¿puede el árbitro dejar los relojes como estaban?", opciones: ["No, siempre debe recalcular", "Sí, el art. 7.1 lo permite expresamente", "Solo en partidas rápidas", "Solo si los dos jugadores están de acuerdo"], correcta: 1, explicacion: "Desde 2023 el art. 7.1 menciona expresamente el derecho a no cambiar los tiempos del reloj." },
            { ficha: "relojes", texto: "Rápida sin supervisión adecuada. Las negras hicieron una jugada ilegal y las blancas ya contestaron. Ahora las blancas reclaman. ¿Qué hace el árbitro?", opciones: ["Vuelve a la posición anterior y da 1 minuto a las blancas", "Declara perdida la partida de las negras", "Nada: la jugada ilegal se queda y la partida sigue", "Da 2 minutos a las blancas"], correcta: 2, explicacion: "Art. A.5.2: el árbitro actúa solo si el rival todavía no hizo su siguiente jugada. Si nadie reclamó a tiempo, la jugada ilegal se queda." },
            { ficha: "relojes", texto: "El ritmo lleva 30 s de incremento, pero el reloj se programó sin incremento. Se descubre en la jugada 25. ¿Qué artículo se aplica?", opciones: ["Art. 6.10.2", "Art. 7.5.5", "Art. 9.6", "Art. 12.9"], correcta: 0, explicacion: "Art. 6.10.2: se pone la programación correcta y se ajustan tiempos y contador con el mejor criterio (normalmente, sumando los incrementos que no se recibieron)." },
            { ficha: "relojes", texto: "Al volver atrás se regresa a la jugada 37 en un ritmo 90/40 + 30. ¿Qué pasa con los 30 minutos que el reloj sumó en la jugada 40?", opciones: ["Se quedan", "Se quitan: el control todavía no se alcanzó", "Se reparten entre los dos", "Se vuelven a sumar"], correcta: 1, explicacion: "Si la posición a la que se vuelve es anterior al control, ese tiempo se quita y el contador debe quedar listo para volver a sumarlo en la jugada 40." },
            { ficha: "koya", texto: "¿Para qué tipo de torneo es el sistema Koya?", opciones: ["Suizo", "Todos contra todos", "Eliminatorio", "Por equipos con puntos de tablero"], correcta: 1, explicacion: "El KS (art. 9.2) es un desempate para torneos todos contra todos." },
            { ficha: "koya", texto: "Todos contra todos de 10 jugadores a una vuelta. ¿Cuál es el límite Koya?", opciones: ["5 puntos", "4½ puntos", "La mitad de los puntos del ganador", "4 puntos"], correcta: 1, explicacion: "La puntuación máxima posible es 9 (las rondas). El 50 % son 4½ puntos." },
            { ficha: "koya", texto: "Un rival terminó con exactamente el 50 % de la puntuación máxima. ¿Cuenta para el Koya?", opciones: ["Sí", "No", "Solo si lo dicen las bases", "Solo si le ganó al líder"], correcta: 0, explicacion: "La definición dice «al menos el 50 %»: el rival con exactamente el 50 % cuenta." },
            { ficha: "koya", texto: "Si las bases bajan el límite Koya medio punto, ¿qué pasa?", opciones: ["Cuentan menos rivales", "Cuentan más rivales", "No cambia nada", "Cuentan solo las victorias"], correcta: 1, explicacion: "Art. 14.5: al bajar el límite cuentan más rivales; al subirlo, menos." },
            { ficha: "koya", texto: "Tres jugadores empatados: el Koya separa al primero y deja a los otros dos empatados. El siguiente desempate se aplica a…", opciones: ["Los tres", "Solo los dos que siguen empatados", "Todo el torneo", "Nadie: se sortea"], correcta: 1, explicacion: "Art. 4.2: se pasa al siguiente desempate solo con el grupo que sigue empatado." },
            { ficha: "repeticion", texto: "¿Quién puede reclamar tablas por triple repetición?", opciones: ["Cualquiera de los dos, en cualquier momento", "El jugador que tiene el turno", "Solo el árbitro", "El jugador que acaba de mover"], correcta: 1, explicacion: "Art. 9.2: el reclamo correcto lo hace el jugador que tiene el turno." },
            { ficha: "repeticion", texto: "La misma posición aparece por quinta vez y nadie reclama. ¿Qué pasa?", opciones: ["Nada, hay que reclamar", "Tablas automáticas", "El árbitro advierte a los jugadores", "Pierde quien repitió"], correcta: 1, explicacion: "Art. 9.6.1: con cinco repeticiones la partida es tablas automáticamente." },
            { ficha: "repeticion", texto: "En las tres apariciones el enroque corto blanco está impedido porque el caballo sigue en g1, pero ni el rey ni la torre se han movido. ¿Afecta la repetición?", opciones: ["Sí: el enroque no es posible y eso la anula", "No: el derecho a enrocar existe en las tres y es el mismo", "Solo si las negras sí pueden enrocar", "Depende del árbitro"], correcta: 1, explicacion: "Lo que se compara es el derecho a enrocar (art. 9.2.3.2), que se pierde solo al mover el rey o la torre. Un impedimento pasajero no cambia el derecho." },
            { ficha: "repeticion", texto: "En la primera aparición se podía capturar al paso; en la segunda y la tercera, no. ¿Son tres posiciones idénticas?", opciones: ["Sí", "No, solo dos", "Sí, si nadie capturó", "Depende de quién reclame"], correcta: 1, explicacion: "Art. 9.2.3.1: si al empezar la secuencia se podía capturar al paso, esa posición no es igual a las siguientes." },
            { ficha: "repeticion", texto: "¿Cómo se reclama una repetición que «va a aparecer»?", opciones: ["Haciendo la jugada y deteniendo el reloj", "Anotando la jugada en la planilla y declarándole al árbitro que la va a hacer, sin hacerla en el tablero", "Diciéndoselo al rival", "Ofreciendo tablas"], correcta: 1, explicacion: "Art. 9.2.1: la jugada se anota en la planilla y se le declara al árbitro, sin hacerla en el tablero." },
            { ficha: "repeticion", texto: "¿Qué pasa después de 75 jugadas de cada uno sin mover un peón ni capturar?", opciones: ["Se pueden reclamar tablas", "Tablas automáticas, salvo que la última jugada sea mate", "Nada", "Gana quien tenga más material"], correcta: 1, explicacion: "Art. 9.6.2. (El reclamo por 50 jugadas es el art. 9.3)." },
        ],

        casos: [
            {
                id: "ilegal-sin-incremento", ficha: "relojes", titulo: "Jugada ilegal descubierta nueve jugadas después", nivel: "Intermedio", ritmo: "clasico-sin",
                escena: "Torneo abierto, ronda 4, mesa 7. Ritmo 2 h/40 + 1 h, sin incremento. Las blancas acaban de hacer su jugada 52 y te llaman: al revisar las planillas ven que en la jugada 43 las negras movieron un alfil de casillas blancas a una casilla negra. Las dos planillas lo confirman. Ya volviste a la posición de antes de 43…Ae4 y detuviste el reloj; esto es lo que marca.",
                reloj: { w: "0:28:00", b: "1:23:00", jw: 52, jb: 51, turno: "b" },
                decision: { texto: "¿Qué haces, además de volver a la posición anterior?", opciones: ["Solo volver a la posición anterior", "Volver, ajustar los relojes con tu mejor criterio y dar 2 minutos a las blancas", "Declarar perdida la partida de las negras", "Dar 1 minuto a las blancas"], correcta: 1, explicacion: "Arts. 7.5.1 y 7.5.5: se vuelve a la posición, es la primera jugada ilegal de las negras (2 minutos para las blancas) y el art. 7.1 pide fijar los tiempos con tu mejor criterio." },
                tarea: "Ajusta el reloj: los tiempos, las jugadas completadas (blancas 43, negras 42) y el turno (juegan las negras).",
                calculo: { p1: 120, pj: 40, p2: 60, inc: 0, nw: 52, nb: 51, quien: "b", jugada: 43, sancion: 2 },
                soluciones: [
                    { nombre: "Método proporcional", valor: "optima", w: "0:56:18", b: "1:40:07", comentario: "Consumido ideal: 152 × 43 ÷ 52 = 125:42 y 97 × 42 ÷ 51 = 79:53. Reloj: 180 − ideal, más 2 minutos para las blancas." },
                    { nombre: "Variante de horario", valor: "valida", w: "0:34:35", b: "1:18:24", comentario: "Reparte los 43:26 de diferencia con el tiempo real (21:43 para cada uno). Vale si está prevista en las bases." },
                    { nombre: "Relojes sin cambios, con la sanción", valor: "valida", w: "0:30:00", b: "1:23:00", comentario: "Lo permite el art. 7.1. Explica por qué no recalculas: ese tiempo sí lo pensaron." },
                ],
                esperadoJugadas: { jw: 43, jb: 42, turno: "b" }, tolerancia: 60,
            },
            {
                id: "ilegal-con-incremento", ficha: "relojes", titulo: "La misma situación, con incremento", nivel: "Intermedio", ritmo: "clasico-inc",
                escena: "Ritmo 90 min/40 + 30 min + 30 s por jugada desde la primera. Las blancas acaban de hacer su jugada 52. Se comprueba que en la jugada 43 las negras hicieron una jugada ilegal (la primera de la partida). Ya volviste a la posición anterior. El reloj marca:",
                reloj: { w: "0:36:00", b: "1:00:30", jw: 52, jb: 51, turno: "b" },
                tarea: "Calcula el consumido real (base de 120 + incrementos − reloj), aplica el método proporcional, deja solo los incrementos de las jugadas que quedan y pon la sanción.",
                calculo: { p1: 90, pj: 40, p2: 30, inc: 30, nw: 52, nb: 51, quien: "b", jugada: 43, sancion: 2 },
                soluciones: [
                    { nombre: "Método proporcional", valor: "optima", w: "0:52:32", b: "1:11:00", comentario: "Consumido real: 110 y 85 min. Ideal: 90,96 y 70,00. Reloj: 120 + 21,5 − 90,96 = 50:32 (+2:00) y 120 + 21 − 70 = 71:00." },
                    { nombre: "Variante de horario", valor: "valida", w: "0:35:31", b: "0:53:59", comentario: "34:02 de diferencia con el tiempo real, 17:01 para cada uno." },
                    { nombre: "Relojes sin cambios, con la sanción", valor: "valida", w: "0:38:00", b: "1:00:30", comentario: "Lo permite el art. 7.1, aunque deja en el reloj los incrementos de 9 jugadas que ya no existen." },
                ],
                esperadoJugadas: { jw: 43, jb: 42, turno: "b" }, tolerancia: 60,
            },
            {
                id: "antes-del-control", ficha: "relojes", titulo: "Volver a antes del control de la jugada 40", nivel: "Avanzado", ritmo: "clasico-inc",
                escena: "Ritmo 90 min/40 + 30 min + 30 s. Las negras acaban de hacer su jugada 44. Se descubre que en la jugada 38 las <b>blancas</b> hicieron una jugada ilegal (la primera). Se vuelve a la posición de antes de 38.Txe7: juegan las blancas, con 37 jugadas completadas cada uno. El reloj, que ya les sumó a los dos los 30 minutos del control, marca:",
                reloj: { w: "0:42:00", b: "1:02:00", jw: 44, jb: 44, turno: "w" },
                tarea: "Ojo: la posición vuelve a antes de la jugada 40. El tiempo del segundo periodo tiene que salir del reloj, y el contador lo vuelve a sumar al llegar a 40.",
                calculo: { p1: 90, pj: 40, p2: 30, inc: 30, nw: 44, nb: 44, quien: "w", jugada: 38, sancion: 2 },
                soluciones: [
                    { nombre: "Método proporcional", valor: "optima", w: "0:24:25", b: "0:43:14", comentario: "Consumido real: 100 y 80 min. Ideal (× 37 ÷ 44): 84:05 y 67:16. Reloj: 90 + 18,5 − ideal = 24:25 y 41:14, más 2 minutos para las negras." },
                    { nombre: "Variante de horario", valor: "valida", w: "0:10:05", b: "0:28:55", comentario: "28:38 de diferencia con el tiempo real, 14:19 para cada uno." },
                    { nombre: "Sin recalcular, quitando el control", valor: "valida", w: "0:12:00", b: "0:34:00", comentario: "El art. 7.1 permite no recalcular, pero aquí hay que quitar los 30 minutos del control (el contador los vuelve a sumar) y dar los 2 minutos a las negras." },
                ],
                esperadoJugadas: { jw: 37, jb: 37, turno: "w" }, tolerancia: 60,
            },
            {
                id: "reloj-sin-incremento", ficha: "relojes", titulo: "Reloj programado sin incremento", nivel: "Básico", ritmo: "clasico-inc",
                escena: "Las bases dicen 90 min/40 + 30 min + 30 s desde la primera jugada. En la jugada 25 un jugador nota que su reloj no suma los 30 segundos: se programó sin incremento. Las blancas completaron 25 jugadas y las negras 24; juegan las negras. El reloj marca:",
                reloj: { w: "0:58:10", b: "1:04:40", jw: 25, jb: 24, turno: "b" },
                decision: { texto: "¿Qué artículo se aplica y qué haces?", opciones: ["Art. 7.1: dejo los relojes como están", "Art. 6.10.2: pongo la programación correcta y sumo los incrementos que no se recibieron", "Art. 7.5.5: 2 minutos de sanción a quien no avisó", "Art. 9.6: se repite la partida"], correcta: 1, explicacion: "Art. 6.10.2: con el reloj mal programado, el árbitro pone la programación correcta y ajusta tiempos y contador. Lo natural es sumar 30 s por cada jugada ya completada." },
                tarea: "Suma a cada uno los incrementos que no recibió (blancas 25 × 30 s, negras 24 × 30 s). Nadie recibe sanción.",
                soluciones: [
                    { nombre: "Los incrementos que faltaban", valor: "optima", w: "1:10:40", b: "1:16:40", comentario: "Blancas +12:30, negras +12:00." },
                ],
                esperadoJugadas: { jw: 25, jb: 24, turno: "b" }, tolerancia: 10,
            },
            {
                id: "rapida-reclamo-tarde", ficha: "relojes", titulo: "Rápida: el reclamo llega tarde", nivel: "Básico", ritmo: "rapida",
                escena: "Abierto de rápidas, 15 min + 10 s. Un árbitro atiende varias mesas (no hay supervisión adecuada, art. A.5). Las negras movieron su caballo de b8 a d6 (un movimiento imposible) y pulsaron el reloj; las blancas jugaron 31.Dh5, pulsaron, y ahora te llaman para reclamar la jugada ilegal. Detuviste el reloj.",
                reloj: { w: "0:06:12", b: "0:04:48", jw: 31, jb: 30, turno: "b" },
                decision: { texto: "¿Qué decides?", opciones: ["Vuelvo a la posición anterior y doy 1 minuto a las blancas", "La jugada ilegal se queda y la partida sigue", "Las negras pierden", "Vuelvo a la posición anterior, sin sanción"], correcta: 1, explicacion: "Art. A.5.2: si el rival ya hizo su siguiente jugada, la jugada ilegal no se corrige (salvo que los jugadores se pongan de acuerdo sin el árbitro). La partida sigue." },
                tarea: "Deja el reloj como corresponde y reanuda.",
                soluciones: [
                    { nombre: "Sin cambios", valor: "optima", w: "0:06:12", b: "0:04:48", comentario: "No hay corrección ni sanción." },
                ],
                esperadoJugadas: { jw: 31, jb: 30, turno: "b" }, tolerancia: 3,
            },
            {
                id: "relampago-pulsa-sin-mover", ficha: "relojes", titulo: "Relámpago: pulsa el reloj sin mover", nivel: "Intermedio", ritmo: "blitz",
                escena: "Final de un torneo relámpago, 3 min + 2 s, con un árbitro por mesa. En la jugada 25 las negras pulsan el reloj sin haber movido ninguna pieza. Lo ves en el momento y detienes el reloj antes de que muevan las blancas. El reloj ya les sumó los 2 s a las negras y le pasó el turno a las blancas:",
                reloj: { w: "0:01:05", b: "0:00:52", jw: 25, jb: 25, turno: "w" },
                decision: { texto: "¿Cómo se trata?", opciones: ["Como jugada ilegal: 1 minuto más para las blancas y las negras deben jugar", "Solo una advertencia", "Como jugada ilegal: 2 minutos para las blancas", "Las negras pierden"], correcta: 0, explicacion: "Art. 7.5.3: pulsar sin mover se trata y sanciona como jugada ilegal. En relámpago la sanción es de 1 minuto (A.3)." },
                tarea: "Devuélveles el turno a las negras, corrige el contador (negras con 24 completadas) y suma 1 minuto a las blancas. Quitar o no los 2 s del incremento queda a tu criterio.",
                soluciones: [
                    { nombre: "Corrección completa", valor: "optima", w: "0:02:05", b: "0:00:50", comentario: "Se quita el incremento que no correspondía y se suma 1 minuto a las blancas." },
                    { nombre: "Sin quitar el incremento", valor: "valida", w: "0:02:05", b: "0:00:52", comentario: "Una diferencia mínima, aceptable con el mejor criterio." },
                ],
                esperadoJugadas: { jw: 25, jb: 24, turno: "b" }, tolerancia: 1,
            },
            {
                id: "segunda-ilegal", ficha: "relojes", titulo: "Segunda jugada ilegal", nivel: "Básico", ritmo: null,
                escena: "Partida estándar. Las blancas ya recibieron una sanción por jugada ilegal en la jugada 30. En la jugada 61 vuelven a completar una jugada ilegal: su rey queda en jaque. En el tablero: blancas con rey, torre y peón; negras con rey y caballo.",
                decision: { texto: "¿Cuál es el resultado?", opciones: ["Ganan las negras", "Tablas: las negras no pueden dar mate", "2 minutos más para las negras", "Se vuelve a la posición anterior y sigue la partida"], correcta: 0, explicacion: "Art. 7.5.5: la segunda jugada ilegal pierde. Las tablas son solo si el rival no puede dar mate con ninguna serie de jugadas legales; con rey y caballo contra rey, torre y peón sí existe una serie legal que termina en mate (con el rey blanco encerrado por sus propias piezas), así que ganan las negras." },
            },
        ],

        /* «esperado.triple»: si en algún momento hay triple repetición válida.
           Lo comprueba el verificador con chess.js (js/reclamos-tablas.js). */
        repeticiones: [
            { id: "revista-1", titulo: "Ejercicio 1 (revista)", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", jugadas: "1. e4 e5 2. Ac4 Ac5 3. Cf3 Ae7 4. Ae2 Ac5 5. Cg1 Ad6 6. Ac4 Ac5 7. Cf3 Cf6 8. Ad3 Cg8 9. Cg1 Ad6 10. Ab5 Ac5 11. Ac4", esperado: { triple: false, fotos: 3 } },
            { id: "revista-2", titulo: "Ejercicio 2 (revista)", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", jugadas: "1. e4 e5 2. Cf3 Cf6 3. Ac4 Ac5 4. Ad3 Ae7 5. Ac4 Rf8 6. Ad3 Re8 7. Ac4 Ac5 8. Ae2 Af8 9. Ac4 Ac5", esperado: { triple: false, fotos: 3 } },
            { id: "revista-3", titulo: "Ejercicio 3 (revista)", fen: "8/2kbp3/3p4/2nP4/4P3/4K3/3N1N2/8 b - - 0 1", jugadas: "1... e5 2. Cc4 Ab5 3. Cd2 Ad7 4. Cc4 Ab5 5. Cd2 Ad7", esperado: { triple: false, fotos: 3 } },
            { id: "revista-4", titulo: "Ejercicio 4 (revista)", fen: "4k3/8/5b2/2BKp3/3pP3/3P4/8/8 w - - 0 1", jugadas: "1. Aa7 Ag7 2. Ac5 Ah8 3. Aa7 Af6 4. Ac5 Ag7 5. Ad6 Ah6 6. Ac7 Ag5 7. Ab6 Af6 8. Ac5", esperado: { triple: false, fotos: 3 } },
            { id: "revista-5", titulo: "Ejercicio 5 (revista)", fen: "8/3pn3/2p1pk2/5r2/3P3R/2PKP3/4N3/8 w - - 0 1", jugadas: "1. Th6+ Rg7 2. Th4 Rf7 3. Th7+ Rg6 4. Th4 Rf6 5. Cf4 Rg5 6. Th5+ Rf6 7. Th6+ Rf7 8. Ce2 Tf6 9. Th4 Tf5 10. Th7+ Rf6 11. Th4", esperado: { triple: false, fotos: 3 } },
            { id: "caballos", titulo: "El paseo de los caballos", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", jugadas: "1. Cf3 Cf6 2. Cg1 Cg8 3. Cf3 Cf6 4. Cg1 Cg8", esperado: { triple: true, fotos: 3 } },
            { id: "al-paso-clavado", titulo: "La captura al paso que no se puede hacer", fen: "4k1n1/2p5/8/KP5r/8/8/8/6N1 b - - 0 1", jugadas: "1... c5 2. Cf3 Cf6 3. Cg1 Cg8 4. Cf3 Cf6 5. Cg1 Cg8", esperado: { triple: true, fotos: 3 } },
        ],
    };

    raiz.AULA_CONTENIDO = AULA_CONTENIDO;
    if (typeof module !== "undefined" && module.exports) module.exports = AULA_CONTENIDO;
})(typeof window !== "undefined" ? window : globalThis);

/*! rev bfb5bbb0d2d82f9f */
