# Juegos y torneos

Notas de diseño para Claude, sacadas del CLAUDE.md de la raíz: el bot, los torneos, los retos, el reloj y las partidas.
El índice de todos los temas y las reglas que valen para todo el sitio
están en `CLAUDE.md`.

## El bot de Oscar

`bot.html` es una sola página para practicar **cualquier modalidad** contra un
rival de la casa. No usa `game_rooms` ni Supabase: la partida vive en el
navegador y no se guarda, a propósito —contra el bot se practica, y una partida
de práctica no tiene por qué ocupar una fila ni salir en los informes—.

- Se pudo hacer en una página porque **los tableros no saben nada de la base**:
  `js/niebla-board.js`, `js/crazyhouse-board.js` y `js/variantes-board.js` se
  montan con `{ engine, interactive, myColor, onMove }` y listo. Los motores
  tampoco. Por eso no hizo falta tocar las seis páginas de partida.
- `js/bot-oscar.js` **no conoce ninguna variante**: cada modalidad le pasa un
  adaptador con cuatro cosas —`turno()`, `jugadas()`, `probar(jugada)` (que
  devuelve otro adaptador con la jugada hecha) y `material()`— más dos
  opcionales que si faltan no rompen nada: `enJaque()`, para distinguir el mate
  del ahogado, y `valorJugada(j)`, para ordenar las jugadas sin clonarlas (ver
  abajo). Cuatro niveles: al azar con gusto por las capturas, una jugada
  mirando la respuesta, tres jugadas con poda alfa-beta, y el Maestro, que es
  el mismo buscador con más tiempo y más profundidad. Está comprobado que el
  nivel 3 termina con ventaja sobre el nivel 1.
- No usa Stockfish a propósito: solo sabría jugar el ajedrez normal, y acá vale
  más un rival que entienda abrazos, camaleón y crazyhouse.
- **A ciegas lleva su propio adaptador**: su motor delega en chess.js y no tiene
  `allMoves()` como abrazos y camaleón. La jugada escrita pasa por
  `moveText()`, que entiende español, inglés y coordenadas.
- **Faltan dos modalidades**, por razones distintas: Ajedrez de Cartas monta su
  tablero desde un estado serializado (`loadState`) que hoy solo arma la página
  de partida, y Duelo Simultáneo no tiene turnos —los dos mueven a la vez contra
  reloj—, así que no hay "turno del bot" que atender y pide otro diseño.

### El nivel 3 decía "tres jugadas" y estaba haciendo dos

Todo el costo del bot está en `probar()`, y no se parece en nada a "hacer una
jugada": cada adaptador se **clona desde su posición serializada** —chess.js
vuelve a leer una FEN entera, Cartas rehace su JSON—, así que una llamada
cuesta ~123 µs contra los ~7 µs de evaluar la posición ya hecha. Mil veces más.

Y para ORDENAR las jugadas de un nodo se clonaban **todas**, solo para mirarle
el `material()` a cada una. Después la poda alfa-beta hacía su trabajo y se
exploraban dos o tres: **el 97% de los clones se construían para tirarlos**, y
se tiraban después de haberlos pagado, así que el corte de la poda no ahorraba
nada. Eso no da ningún error — el bot juega bien, solo que se le va el
presupuesto en posiciones que nadie iba a mirar. Lo que sí se veía, si uno
medía: **el nivel 3, que la pantalla describe como "busca tres jugadas
adelante", se quedaba en DOS** en cuatro de seis posiciones normales, gastando
sus 400 ms enteros. Un nivel que promete una profundidad y entrega otra.

- **El orden se decide ahora sin jugar nada**, con `valorJugada(j)`, el quinto
  método del adaptador: primero las capturas, y entre ellas la que se queda con
  la pieza más gorda usando la más barata; sin capturas, cuánto mejora de
  casilla la pieza que se mueve. Sale de leer dos casillas del tablero que ya
  está delante. `probar()` se paga **una por una, al entrar en la rama**, así
  que lo que la poda no explora tampoco se clona.
- **`valorJugada` es opcional a propósito.** Un adaptador que no la tenga vuelve
  solo al orden de antes y da exactamente el mismo resultado, más lento — nunca
  peor. Pero al que se le olvide nadie se lo dice, y por eso el verificador
  mira que los seis la tengan.
- **Y un historial de cortes**, porque el orden barato se queda ciego donde no
  hay capturas —un final de peones, que es justo donde más falta hace buscar
  hondo—: cada jugada que provoca un corte suma un punto y se prueba antes la
  próxima vez que aparezca. El bono está acotado (`h / (h + 50)`) para que no
  se cuele delante de una captura buena, y la tabla se vacía en cada jugada.
- **La raíz clona sus jugadas UNA vez** y las reordena con lo que aprendió la
  profundidad anterior. Antes cada vuelta de la profundización iterativa
  volvía a clonarlas todas y redescubría el orden desde cero, que es tirar
  justamente lo que la profundización iterativa viene a comprar.
- **A una jugada del fondo no se baja un nivel más.** `negamax(hijo, 0)`
  devolvía `lado * material()`, que es el número que el orden **ya había
  calculado**: era una llamada y una segunda evaluación de la misma posición
  por cada hoja.
- **`materialDeTablero()` ya no arma una lista de piezas.** Construía ~32
  objetos por evaluación (`Object.assign({casilla}, p)`) y recorría tres veces;
  ahora es una pasada por las 64 casillas sin una sola asignación. Lo único que
  obligaba a las dos pasadas era el rey —su tabla se mezcla según la fase de la
  partida, y la fase no se sabe hasta ver el tablero entero—: se anota en qué
  casilla está cada rey y se suma su parte al final. El número que sale es
  **exactamente** el mismo, comprobado sobre 120 posiciones al azar y dos
  tableros raros (piezas fusionadas de Abrazos, reserva de Crazyhouse).

Medido a profundidad fija 3, con el mismo trabajo: de 1.200 ms a 230 ms en una
posición abierta (10 veces menos clones), de 780 a 198 en un mediojuego, y el
pico de memoria de ~22 MB a ~11 MB. Con el presupuesto real, el nivel 3 llega a
las tres jugadas que promete y le sobra la mitad del tiempo. Y jugando de
verdad, 30 partidas del bot nuevo contra el viejo al nivel 3: **10 ganadas, 3
perdidas, 17 tablas**.

**Lo que esto NO arregla**, y conviene tenerlo escrito: el último nivel de la
búsqueda es una evaluación estática —se mira el material de la posición que
queda, no si el rival se quedó sin jugadas—, así que un mate que cae justo ahí
se cuenta como "una posición con una torre de más". O sea que el **nivel 3 no
ve un mate en 2**; el nivel 4, que llega hasta seis, sí. Viene siendo así desde
siempre y arreglarlo costaría pedirle las jugadas legales a cada hoja, que es
lo más caro que hay acá (~1,6 ms por llamada).

**Al tocar `js/bot-oscar.js`, el evaluador de `bot.html` o cualquiera de los
seis adaptadores, correr `node herramientas/verificar-bot-oscar.js`**
(necesita `npm install chess.js@0.10.3`; no hace falta navegador, ni red, ni el
sitio servido). Comprueba que la jugada elegida sea una de las que elegiría un
**minimax puro** —sin poda, sin recortes, sin atajos— a la misma profundidad,
que el camino de repuesto (sin `valorJugada`) dé lo mismo, que encuentre el
mate y no busque el ahogado con la partida ganada, que el evaluador sea
simétrico (la misma posición con los colores cambiados vale lo mismo con el
signo al revés, que es lo que caza una tabla de posición mal reflejada), que
ninguna jugada sea ilegal en los cuatro niveles, que no se pase del
presupuesto —es tiempo del hilo principal, o sea la pantalla congelada— y
**cuántas posiciones clona para decidir una jugada**. Esa última es la rara y
es la que de verdad hace falta: volver a ordenar clonándolas todas funciona
igual de bien y cuesta diez veces más, y no lo delata nada salvo contar los
clones. Está probado que falla de verdad: con el orden de antes saltan las tres
comprobaciones de costo, y rompiendo el atajo del último nivel saltan cuatro de
las de equivalencia.

- Su espejo arma los enroques en el orden `KQkq` y **comprueba que la FEN
  vuelva a salir igual**: chess.js los valida con una expresión regular y, si
  los rechaza, deja el tablero **vacío** en vez de dar un error — la prueba
  pasaría a comparar el evaluador contra la nada y daría verde sin comprobar
  nada. Es la misma trampa que ya documentaron los dobles de Supabase.

## Con mate en uno en contra, Stockfish no miraba el reloj

El bot con Stockfish (el de Oscar en `tablero.html`, la práctica contra el
motor y «¿Qué jugarías?» en `sesion.html`, y los cursos) se quedaba «pensando»
justo cuando el alumno tenía el mate en la mano, y el alumno no podía
terminar la partida. Stockfish mira el reloj cada ~1000 nodos; en una posición
en que le dan mate en uno recorre unos cientos por profundidad, así que nunca
lo mira y `go movetime` no lo para: sigue hasta la profundidad 245. En una
computadora tardaba 3 s en vez de 0,7; en un celular pasaba del timeout, la
consulta volvía vacía y en `sesion.js` se reintentaba tres veces hasta decir
que el motor no respondía.

- Los tres motores (`js/chess-bot.js`, `js/practice-engine.js`,
  `js/clases-engine.js`) mandan `go movetime N depth 40`
  (`PROFUNDIDAD_MAXIMA`). En una posición normal el tiempo se acaba mucho antes
  de la profundidad 40, así que la fuerza no cambia; con mate a la vista corta
  en medio segundo.
- Y si igual el motor no contesta, el bot mueve con
  `PracticeEngine.jugadaDeRespaldo(fen)` (mate o captura si hay; si no, una
  legal cualquiera) en vez de congelar la partida. El bot de Oscar ya tenía su
  heurístico de respaldo.
- `verificar-bot-mate-en-uno.js` mide el tiempo con mate en uno en contra en
  los tres niveles de práctica y las tres dificultades del bot de Oscar. Sin el
  tope de profundidad saltan cuatro comprobaciones.

## El bot siempre contesta, y su tiempo no se le cobra al alumno

Contra el bot, el reloj del alumno baja **solo mientras le toca pensar a él**,
y el bot **siempre** contesta: un tablero «pensando» para siempre era lo peor
que podía pasar, y no daba ningún error.

- **`PracticeEngine.responder(fen, nivel)`** es lo que usa todo el que JUEGA
  contra el motor (la práctica y «la clase juega» de `sesion.html`, los cursos,
  Los 100 finales, Finales contra la máquina, Remata la ventaja y Salva las
  tablas). Resuelve a `{ uci, respaldo }` y siempre trae una jugada legal (solo
  `null` si ya no hay jugadas). `getMove()` sola podía devolver null, una
  jugada que ya no era legal (el tablero había cambiado: en `sesion.js` eso
  dejaba «Esperando la jugada del motor…» sin el botón de reintentar), o
  **tardar sin fin** si la cola del motor se trababa (otra búsqueda colgada,
  el WASM que no termina de cargar): el timeout de cada búsqueda empieza a
  contar cuando le toca, no cuando se pide.
- **El plazo**: el tiempo del nivel más 3,5 s con el motor ya cargado
  (`SharedEngine.listo()`), o más 15 s la primera vez. Si vuelve vacía o
  ilegal se pide una vez más; si se pasó del plazo, no (el motor está trabado
  y esperar otro tanto no sirve): juega `jugadaDeRespaldo`.
- **«stop» a los 800 ms de pasado su tiempo**: Stockfish contesta ya con la
  mejor que tenga. A los 4 s, el Worker se tira y la próxima levanta otro
  (también en `js/chess-bot.js`, que antes lo dejaba vivo y cada jugada volvía
  a esperar 4 s a un Worker muerto). El bot de Oscar tiene además su plazo al
  bajar el libro (8 s) y al motor; vencido, juega su heurístico.
- **El reloj de la práctica de la clase** (`tickRelojPractica`) corre solo con
  `miTurno`: le toca al alumno y el motor no está ocupado. `practiceEngineBusy`
  sigue en true hasta que la jugada del bot **quedó guardada**: antes se
  soltaba al recibirla, y el reloj corría durante el guardado con el tablero
  todavía sin dejarle mover. Y la jugada del bot se pide ANTES que la
  evaluación para el profe: el motor atiende de a una y la respuesta no
  espera detrás.
- Los dobles de los verificadores que reemplazan `PracticeEngine` entero
  llevan su `responder`; `responder` llama a `getMove` por
  `window.PracticeEngine`, así los que cambian solo `getMove` siguen sirviendo.
- `verificar-bot-siempre-contesta.js`: con `getMove` que no contesta nunca, o
  que contesta una ilegal, `responder` juega la de respaldo dentro del plazo;
  en la práctica con reloj, 3 s del motor no se le descuentan al alumno, y con
  el motor colgado el bot juega igual y le vuelve a tocar. Sin el arreglo de
  `sesion.js` saltan cuatro comprobaciones.
- El calentamiento de 20 ejercicios (`js/clase-tanda.js`) no es contra el bot:
  el rival contesta solo con la jugada de la solución, en medio segundo, y el
  tiempo es uno para toda la clase, contado con la hora de la base.

## Las partidas de un torneo se pueden VER, y el candado lo pone la base

Durante una ronda, las partidas eran invisibles. El único acceso a un cruce en
juego era un **«Ver →» por fila**, que además saca de `torneo.html`: seguir tres
tableros era entrar y volver tres veces. Y a quien le tocó **bye** —que esa ronda
no tiene ninguna otra cosa que hacer— no le quedaba nada que mirar.

Peor: ese «Ver →» era **una promesa que el destino rompía**. Las seis páginas de
partida cortaban con `if (!myColor && !isTeacher) showError("No formas parte de
esta partida.")`, así que el enlace que `torneo.html` le ofrecía a todo el
alumnado terminaba en un 🚫. No daba ningún error de nada: el enlace se pintaba
igual, y el que no podía entrar era justo el único que no puede arreglarlo.

**Y la base decía que sí desde siempre.** Comprobado impersonando roles en SQL
sobre un torneo real: a la alumna a la que le tocó bye, `game_rooms_select` le
devuelve **las dos salas** de su ronda. Es `es_companero()` — y no es casualidad,
es estructural: `tournament_registrations_insert` exige `es_mi_profesor(t.created_by)`,
o sea que **para estar en un torneo hay que tener a quien lo organiza de
profesor**, así que dos inscritos cualesquiera comparten profesor y son
compañeros. Quien decía que no era la pantalla, no el candado.

- **Mirar lo decide la RLS.** Se quitó ese `!isTeacher` de las cinco páginas de
  partida de a dos: si la fila llegó, se mira; si no llegó, dos líneas más arriba
  ya se salió con «No se encontró esa partida». El segundo candado escrito en la
  página era más cerrado que el de la base y nadie lo había notado.
- **Jugar sigue cerrado, por los dos lados.** `interactive` cuelga de `myColor`,
  los botones de rendirse y de «estoy listo» también, y `game_rooms_update` **no
  nombra a `es_companero()`** — o sea que aunque la pantalla se equivocara, la
  base rechaza la escritura. `verificar-torneo-en-vivo.js` lo mide intentándolo:
  toca dos casillas y comprueba que no se mueva nada ni se escriba nada.
- **`cuatro-jugadores.html` se dejó como estaba**, a propósito:
  `fourplayer_games_select` **no** lleva `es_companero`, así que ahí la base
  nunca le entrega la fila a un compañero y quitarle el candado a la página no
  cambiaría nada. Escribir el mismo comentario ahí sería prometer un alcance que
  la política no da. Y los torneos son solo de las cinco variantes de a dos.

### Las dos puertas que siguen cerradas, y por qué

- **Niebla de Guerra en curso no se mira desde fuera.** Es la misma regla que ya
  escribía `tv.html`: cualquiera de los dos jugadores puede tener esa pantalla
  abierta al lado, y con la posición real a la vista se acabó la niebla, que es
  el juego entero. **Terminada sí**: ahí ya no queda nada que tapar, y repasarla
  es justo lo que uno quiere. Quien da clase entra igual, que es como supervisa.
- **En Ajedrez de Cartas, a quien mira no se le enseña NINGUNA mano.** Acá estaba
  el error que más caro salía y el que no se ve: `CartasBoard` dibuja la mano de
  `myColor` completa, y un espectador entra con `myColor: myColor || "w"` — o sea
  que **le habría enseñado la mano de las blancas entera**, en un torneo, a quien
  a lo mejor juega contra ellas la ronda siguiente. Se agregó `opts.spectator` a
  `js/cartas-board.js`: las dos manos salen boca abajo con su conteo, y
  `visionUntil` **también se ignora** (esa carta se la gana quien JUEGA; para un
  espectador `myColor` solo dice de qué lado se dibuja el tablero). El rótulo
  «Tu mano» pasa a «Las cartas de las blancas», porque ahí no hay mano suya.
  Lo encontró el verificador, no la vista: la pantalla se veía perfecta.

### El nombre de quien juega tenía que venir con el permiso de mirar

`nombres_de_jugadores()` se escribió con el alcance de `game_rooms_select`
**«menos `es_companero`»**, y dejó escrito por qué: «para mirar la partida de un
compañero no hace falta su nombre completo». Era cierto **mientras mirarla no se
pudiera**. Desde que la pantalla dejó de poner su candado, la frase se volvió
falsa de la peor manera: la partida abre, el tablero se pinta, y arriba dice
**«Jugador» contra «Jugador»** — con la lista de `torneo.html` diciendo los dos
nombres a un clic de distancia.

**No reparte nada nuevo, y por eso se arregla ahí y no con una columna más:**
`profiles_select` ya le entrega a un compañero la **fila entera** de perfil
(`es_companero(id)`). Comprobado con datos reales antes de escribir la migración:
sobre los dos jugadores de un cruce, su compañera recibía **2** filas por
`profiles` y **1** por `nombres_de_jugadores()`; después, 2 y 2. Y un alumno de
otra clase sigue recibiendo **0, 0 y 0** — salas, nombres y perfiles.

### «Las partidas, en vivo»: el lugar donde se ven

Debajo de la lista de la ronda en curso, `torneo.html` pinta **un tablerito por
cruce en juego**, que se mueve solo. Es lo que contesta «no puedo ver las
partidas»: no hay que salir de la página ni entrar y volver por cada tablero.

- **Se dibuja con el MISMO `ClasesBoard` compacto** de las miniaturas de la clase
  en vivo, que ya es la pieza compartida para esto — y con eso se hereda lo que
  ya costó descubrir una vez: a este tamaño el glifo Unicode de las blancas es un
  contorno hueco que se lee negro, así que compacto dibuja con el set de
  `js/chess-piece-svg.js`, que tiene relleno sólido.
- **De dónde sale la posición depende de la variante, y equivocarse no da ningún
  error**: `loadFen()` cae en la posición inicial si la FEN no carga, así que el
  tablero se ve perfecto enseñando una partida que nadie está jugando. Por eso
  `fenDeLaSala()`: `cartas_state.fen` para Cartas, `duelo_state.fen` para Duelo
  (la columna `fen` de esa sala se queda en la de salida), y `fen` **sin la
  reserva entre corchetes** para Crazyhouse, que chess.js no entiende. El
  verificador siembra las salas con la columna `fen` puesta en OTRA posición a
  propósito: una página que lea la columna equivocada tiene que saltar.
- **El tope de la tarjeta es fijo (190 px), no `1/N`**, por lo mismo que las
  miniaturas de la clase: con `1/N`, todos los tableros cambian de tamaño en
  cuanto empieza una partida más, justo mientras se los está mirando.
- **Una jugada NO recarga el torneo.** El canal de `game_rooms` solo repinta el
  tablero de esa sala (`actualizarSala`): volver a pedir inscritos, rondas y
  cruces en cada jugada de cada tablero son tres consultas por jugada y el
  parpadeo de toda la lista. Lo que sí recarga es que la partida **termine**, que
  llega por `tournament_pairings` con su resultado.
  **Eso no llegaba** hasta el 30 de setiembre de 2026: las cuatro tablas de
  torneos no estaban en la publicación de Realtime, así que el resultado, la
  inscripción y la ronda nueva se veían solo al recargar. Ver «Lo que se
  escucha por Realtime tiene que estar publicado» en
  `sitio-e-infraestructura.md`.
- **Ese canal no se puede filtrar del lado del servidor**: `game_rooms` no lleva
  `tournament_id`, así que llegan todas y se descartan acá — una sala que no esté
  en `tablerosEnVivo` no pinta nada.
- **El mapa se vacía junto con el HTML** al repintar las rondas: los tableros de
  la vuelta anterior cuelgan de nodos que ya no están, y guardarlos dejaría que
  una jugada se pintara donde no se ve.
- **Niebla no se dibuja** tampoco acá, por la misma razón de arriba, y se dice
  con todas las letras en vez de dejar un hueco.

### Los ritmos de juego: una sola lista, y el del torneo se puede cambiar

La lista de ritmos estaba escrita dos veces —en `torneos.html` y en
`juegos.html`— y ya se había separado: una partida amistosa podía ser 3+0 y un
torneo no. Ahora vive en **`js/ritmos.js`** y la usan los cuatro lugares que
eligen un ritmo: crear un torneo, cambiarle el tiempo a uno que ya existe,
armar una partida desde «Asignar rivales» y retar a alguien en línea.

- **Van agrupados por lo que son** —Bala (1+0, 1+1, 2+1), Relámpago (3+0,
  3+2, 5+0, 5+3), Rápidas (10+0, 10+5, 15+10), Clásica (30+0, 30+20)—, que es
  como se piensa un ritmo, y al final **«Personalizado…»**: minutos (se aceptan
  medios, con coma o punto) y segundos por jugada a mano.
- **El id dice lo mismo que los segundos** (`"3+2"` es 180 y 2), y el
  verificador lo comprueba uno por uno: una opción que dice «3 min + 2 seg» y
  manda 180 y 0 se ve perfecta y la partida se juega sin incremento.
- **Los dos formularios pasaron a `novalidate`**: con `min`/`max` en los
  campos del personalizado, un número fuera de rango lo cortaba el navegador con
  SU globo y el aviso en español no salía nunca. Misma decisión que
  `asistencia.html` y `bienvenida.html`.
- **Los topes los hace cumplir la base** (`tournaments_ritmo_check` y
  `game_rooms_ritmo_tope_check`): de 30 segundos a 3 horas, y hasta 3 minutos
  de incremento. Son de cordura —atajan un error de dedo—, no de negocio.

**Cambiar el tiempo de un torneo ya creado** es la tarjeta «⏱️ Tiempo por
partida» de `torneo.html`, que solo ve quien organiza (o administra) y solo
mientras el torneo no terminó. Las partidas se arman con el tiempo del torneo
**al generar cada ronda**, así que cambiarlo en inscripción vale para todo el
torneo y cambiarlo a mitad vale **desde la ronda siguiente** — la que está en
juego sigue con su reloj, y la tarjeta lo dice con esas palabras. El tiempo se
lee además en la cabecera del torneo y en la lista de `torneos.html`, para todo
el mundo.

- **El candado es de la base, y hacía falta**: `tournaments_update` deja
  escribir también a los inscritos (`estoy_inscrito_en()`), porque
  `js/torneo-sync.js` cierra rondas y torneos desde el navegador de cualquiera
  de los jugadores. Con eso un inscrito podía cambiarle desde la consola el
  tiempo, el nombre o la modalidad al torneo entero. El trigger
  **`proteger_torneo()`** le revierte esas columnas en silencio a quien no
  organiza —el patrón de `proteger_tiempos_de_presencia()`—, y a quien organiza
  le rechaza cambiar el tiempo de un torneo terminado. Comprobado impersonando
  roles en SQL: el update de un inscrito deja el ritmo como estaba, el del
  organizador entra, y 5 segundos los rechaza el CHECK.
- **La pantalla vuelve a leer lo que quedó** (`.select()` después del update) y,
  si no coincide con lo pedido, dice «No se pudo cambiar el tiempo» en vez de
  dar por guardado algo que la base revirtió.
- **El selector se vuelve a poner solo si el tiempo guardado cambió**: la página
  se repinta con cada aviso de Realtime, y sin eso le pisaría la elección a
  quien la está haciendo.

**Al tocar `js/ritmos.js`, los formularios de torneo o de partida, o la
tarjeta del tiempo, correr `node herramientas/verificar-ritmos.js`** (con el
sitio en localhost:8777 y playwright). Comprueba la lista sin navegador —que
estén 1+1, 3+0 y 3+2, que ningún id se repita y que cada uno diga lo mismo que
sus segundos, y que ninguna página vuelva a tener su propia lista— y en un
navegador lo que se MANDA: 3+2 en una partida, un personalizado de 1,5 min + 1,
que 500 minutos no viajen y se diga por qué, 1+1 al crear un torneo, y el
cambio de tiempo del torneo en los dos casos — que quede y lo diga, o que la
base lo revierta y la pantalla no mienta. A la alumna inscrita no se le pinta
el control.

### Cerrar una ronda lo hace UNO solo, y una ronda nace entera

- **La ronda y el torneo se cierran con una escritura condicional**
  (`.neq("status", "finished").select("id")` en `js/torneo-sync.js`), y solo
  sigue quien de verdad los cerró. El eco de la última partida le llega a la vez
  a los dos jugadores y a quien esté mirando, y cada uno insertaba al campeón:
  quedaba dos o tres veces en el salón de la fama público.
- **`generateRound()` crea primero TODAS las salas y recién después la ronda.**
  Al revés, un cruce cuya sala fallaba desaparecía: la ronda se daba por
  completa sin esos dos jugadores y en eliminación la llave se corría. Una
  ronda no se puede borrar desde el navegador (no tiene política de delete),
  pero una sala sí: si falla alguna, se borran las creadas y no se abre nada.

### Empezar y generar una ronda, una sola vez

«Generar ronda» fallaba en cada clic con `duplicate key value violates unique
constraint "tournament_rounds_tournament_id_round_number_key"`, sin salida. Lo
que pasó (leído en los registros de la base): «Empezar torneo» corrió **dos
veces** —un segundo clic mientras se armaba la ronda 1, porque la página no se
repinta hasta que todo termina— y la segunda vez dejó `current_round` en 0 con
la ronda 1 ya creada. Desde ahí la página pedía siempre la ronda 1. Les pasó a
dos torneos en curso; la migración `torneo_no_retrocede_de_ronda` los reparó.

- **Un botón que arma algo no corre dos veces**: `unaVez()` en `js/torneo.js`
  apaga el botón y descarta el segundo clic hasta que termina.
- **Empezar es condicional** (`.eq("status", "registration").select("id")`): si
  ya había empezado, lo dice y no toca nada.
- **El número de la ronda se cuenta también con las rondas que existen**
  (`rondaActual()`, y `generateRound()` las vuelve a pedir antes): si
  `current_round` se queda atrás, la ronda siguiente sigue siendo la correcta.
- **Y la base lo garantiza**: `proteger_torneo()` no deja bajar
  `current_round` ni volver a `'registration'` un torneo que ya empezó, a nadie
  (tampoco a quien organiza). Comprobado impersonando al organizador: volver a
  empezarlo y bajarle la ronda quedan revertidos.

**Al tocar `torneo.html`, `js/cartas-board.js` o el arranque de cualquiera de las
páginas de partida, correr `node herramientas/verificar-torneo-en-vivo.js`** (con
el sitio en localhost:8777, playwright y `npm install chess.js@0.10.3`). Comprueba
que se pinte un tablero por partida en juego y ninguno por el bye ni por la ronda
terminada, que **cada uno dibuje SU posición** (contra la FEN que sirvió el doble,
pieza por pieza, leyendo el DOM), que las piezas salgan dibujadas y no en glifo,
que una jugada que llega sola repinte ese tablero **y no vuelva a pedir el torneo
entero**, que una compañera que no juega entre de verdad a la partida y vea los
nombres, que **no se le escape ninguna carta** ni con la de visión jugada, que no
pueda mover ni escribir nada, y que las dos puertas cerradas sigan cerradas
—Niebla en curso y una sala que la base no devolvió—. Está probado que falla de
verdad: contra el código de antes saltan **16 comprobaciones**.

- **Los oyentes de su canal de mentira son de TODOS los canales.** El doble
  guardaba `window.__emitir` en cada `channel()`, o sea que apuntaba al último
  canal que se abrió. Desde que toda página de la Academia abre además los suyos
  —la burbuja de conectados, el aviso de partidas asignadas—, la jugada de la
  prueba iba a parar al canal de la burbuja: el tablero no se movía y la prueba
  lo contaba como fallo de `torneo.html`. Estuvo así en rojo en `main` sin que
  la página tuviera nada. Comprobado que sigue discriminando: quitándole el
  `loadFen()` a `actualizarSala()`, salta.
- Ojo con cómo se escribe una comprobación de «se dibuja con SVG»: contar solo
  los glifos da **verde sobre un tablero vacío**, que es justo lo que pasa cuando
  el panel no se pinta. Se piden las dos cosas — que haya piezas dibujadas y que
  no quede ni un glifo. Y todo se lee con `|| {}`: una prueba que revienta deja
  sin correr lo que venía después, que es la mitad de lo que hay que mirar.
- Y los tableros se comparan **con las casillas ordenadas**: el DOM las recorre
  de a8 a h1 y chess.js de a1 a h8, así que un `JSON.stringify` a secas falla por
  el orden de las claves y no por la posición.

### Siete rondas

Se pidió revisar si un torneo ya se puede jugar **hasta 7 rondas**. Se puede, y
se podía: la base no pone tope (`total_rounds` es un entero suelto) y el campo
del Suizo acepta de 1 a 20. Pero la prueba de un torneo entero de 7 rondas sacó
dos cosas que con 3 rondas no se notaban, y las dos estaban en el motor
(`js/torneo-engine.js`), no en la página:

- **El Suizo repetía rivales que se podían evitar.** Era voraz: al primero sin
  pareja le daba el primero de abajo con quien no hubiera jugado, sin volver
  atrás, y eso podía dejar a los últimos sin nadie nuevo. Con 7 rondas y 16
  jugadores había casi dos cruces repetidos por torneo; en la página, con 10,
  una pareja se enfrentó **tres veces**. Ahora busca con retroceso y solo
  repite rival si ningún emparejamiento lo evita, y los menos posibles. El
  bye también entra en la búsqueda: si con el candidato natural los demás no se
  pueden emparejar sin repetir, se prueba con el siguiente (nunca uno que ya
  tuvo bye mientras haya otro). Tiene tope de pasos, y con 200 jugadores las 7
  rondas se arman en milisegundos.
- **Los colores no se repartían.** En el Suizo llevaba blancas siempre el de
  más arriba: el puntero podía jugar las 7 con blancas. En todos contra todos
  la regla `(ronda + tablero) % 2` parecía pareja y no lo era: con 8, uno jugaba
  las 7 con blancas y otro 6 de 7 con negras. El Suizo ahora cuida que nadie
  pase de 2 de diferencia ni juegue 3 seguidas con el mismo color, **después**
  de no repetir rival (el mismo orden del reglamento FIDE: en 1280 torneos
  simulados pasa una vez, en la última ronda). Todos contra todos usa las
  **tablas de Berger**, las de FIDE: una de diferencia como mucho y nunca tres
  seguidas.

Lo comprueba `node herramientas/verificar-torneo-rondas.js`: el motor solo, con
7 rondas y de 2 a 128 jugadores (Suizo, todos contra todos de 7 y 8, eliminación
de 65 a 128, que pide 7), y la página de punta a punta —un Suizo de 10 con 7
rondas escritas en el campo y un todos contra todos de 8— hasta cerrar el
torneo con su campeón, sin ofrecer una ronda 8. Para recargar entre ronda y
ronda, el doble guarda lo escrito en `sessionStorage`. Contra el motor de antes
saltan **8 comprobaciones**.

### Veinte rondas

Después de las 7 se probó el máximo del campo: **20 rondas**. La página las
juega enteras (un Suizo de 24, de la ronda 1 a la 20, cierra con su campeón y no
ofrece la 21), pero salieron tres cosas:

- **El campo aceptaba cualquier número.** `parseInt` a secas: con «-3» el torneo
  empezaba con -3 rondas y se quedaba trabado sin ninguna, y «25» pasaba aunque
  el campo diga máximo 20 (el `min`/`max` de un `<input>` solo lo mira el
  navegador al mandar un formulario, y esto no lo es). `startTournament()` ahora
  exige un entero entre el `min` y el `max` del propio campo, y si no, lo dice
  y no empieza. Vacío sigue siendo «el sugerido».
- **Con muchas rondas, la búsqueda con retroceso no daba abasto.** Con 20 rondas
  y 30 a 64 jugadores se quedaba sin pasos, caía al voraz y repetía hasta 5
  rivales que se podían evitar. Ahora cada ronda se arma con el **algoritmo de
  Edmonds** (emparejamiento perfecto en un grafo, con flores): comprueba si
  existe una ronda entera sin repetir y, conservando el orden del Suizo (al de
  arriba, el más cercano de abajo), elige cada pareja solo si al resto le queda
  un emparejamiento completo. Nunca prueba a ciegas: de 25 a 200 jugadores,
  cero repetidos en 20 rondas, y 200 jugadores tardan unas décimas. El
  retroceso queda solo para cuando repetir es inevitable, que es con grupos
  chicos, donde es corto. El orden de prioridades no cambió: primero que nadie
  tenga dos byes, después no repetir rival, después los colores.
- **Con 20 o menos inscritos, 20 rondas obligan a repetir**: hay más partidas
  que parejas posibles (con N inscritos alcanzan N − 1 rondas, N si son
  impares). No es un error y se deja hacer —el motor repite lo mínimo, a lo
  sumo un par de cruces más que el mínimo teórico—, pero quien organiza lo
  tiene que saber antes de empezar: debajo del campo aparece «Con 10 inscritos
  alcanzan 9 rondas sin repetir rival; con 20, algunos se van a enfrentar más de
  una vez.», atado al campo con `aria-describedby` y `aria-live`.

Todos contra todos no pasa por el campo: son N − 1 rondas (N si son impares), así
que con 21 o 22 inscritos son 21, y las tablas de Berger las reparten igual de
bien. Eliminación directa llegaría a 20 rondas con más de 500 000 inscritos.

Lo comprueba el mismo `verificar-torneo-rondas.js`: el motor con 20 rondas de 2
a 200 jugadores, el campo (con «-3», «0», «21», «25» y «2.5» no empieza; con 20
y 10 inscritos avisa) y el Suizo de 24 de punta a punta. Contra el código de
antes saltan el motor y el «-3».

- **La prueba esperaba de menos.** Al principio esperaba solo a que la ronda
  nueva existiera en el doble y recargaba: la página todavía estaba cerrando lo
  suyo (`maybeFinishRound` al final de `generateRound()`), la recarga se lo
  cortaba y el torneo no se cerraba nunca. Ahora espera a que la ronda esté
  **pintada**, que es lo último que hace la página. Y cada prueba atrapa su
  propio error: con la página vieja, la del campo reventaba después de «-3» y
  lo que venía detrás no se miraba.

### El verificador de voseo no miraba la mitad del sitio

Se descubrió acá, de rebote: `torneo.html` decía «Vuelve a Torneos y **entrá**
desde ahí» y `verificar-voseo.py` pasaba en verde. La causa es de las que este
archivo colecciona: `texto_visible()` **borraba los `<script>` enteros** antes de
mirar. En la Academia casi toda la pantalla se arma con JavaScript —los avisos,
los botones, los textos de error—, así que la comprobación estaba saltándose
justo el texto que lee quien inició sesión.

Ahora solo se borran los `<style>`. Salieron **20 ocurrencias** escondidas ahí:
el mismo «entrá» en las seis páginas de partida y en `variante.html`, «Cuidá tu
rey», «escribís», «llevás», «transformás» y «rendís». Las cinco que NO eran voseo
—«encontré», «revisé», «recargué», «creé», «comprometí», «revelé»: primera
persona del pretérito— fueron a `BLANCA`, junto a las que ya estaban por lo mismo.
Y el verbo `entrar` se sumó a la tabla, que es la regla de siempre: **la tabla se
completa cuando algo se escapa**.

## Competir: retar y las listas de partidas tienen su propia página

«🟢 En línea ahora», «Partidas en curso» y «Partidas terminadas» vivían en
`juegos.html`, debajo de los juegos para uno solo y del formulario del
profesor. Se mudaron a `competir.html`, con su tarjeta «⚔️ Competir» en el
grupo «Jugar y competir» del panel, justo después de Juegos. Juegos quedó para
conocer las modalidades, los juegos para uno solo, armar partidas y la tarjeta
de la partida propia; Competir, para jugar contra otra persona y seguir esas
partidas.

- **Lo que usan las dos páginas está una sola vez**, en `js/juegos-comun.js`:
  el catálogo de modalidades (`VARIANTS`), `estadoInicial()`,
  `pageFor2pVariant()`, `variantLabel()`, `escapeHtml()` y `nombreVisible()`.
  El formulario del profesor y aceptar un reto crean partidas: con dos copias
  de `estadoInicial()`, una partida podía arrancar distinta según el camino.
- **Las listas son de todos**, no solo del profesor como antes: a cada quien le
  llegan las partidas que la RLS de `game_rooms`/`fourplayer_games` le deja ver.
  «Terminar» y «Eliminar» se pintan solo a quien arma partidas (profesor o
  administración); al alumno la base tampoco lo dejaría.
- **Los retos que me llegan van en Competir**, encima de todo: el canal de
  presencia (`juegos-en-linea`) solo anuncia a quien tiene esa página abierta,
  así que solo desde ahí se puede retar y recibir un reto.
- **TV en vivo también está en Competir**, en su tarjeta debajo de Torneos:
  ver jugar va junto a jugar. Salió de «Tu cuenta» del panel. A quien
  administra se le sigue ofreciendo en «Revisar el contenido».
- **Torneos también se entra desde Competir.** Su tarjeta salió del panel y
  es la primera de `competir.html` (debajo de los retos que llegan); las migas
  de `torneos.html` dicen Academia › Competir › Torneos. El texto cambia según
  quien mira: al alumno, «los que arma tu profesor»; a quien arma torneos,
  «para tus alumnos».
- Juegos conserva una tarjeta a Competir, para quien buscaba ahí lo que se fue,
  y al crear una partida el aviso dice que se sigue en Competir, con su enlace.
- `node herramientas/verificar-todo.js profesor-juega panel` lo comprueba: que
  Juegos ya no traiga las listas, que en Competir la partida propia diga
  «Jugar», que el alumno no vea «Terminar» y que retar siga siendo de toda la
  Academia.

## Retar a quien está en línea

En `competir.html` (antes en `juegos.html`; ver «Competir: retar y las listas
de partidas tienen su propia página») está "🟢 En línea ahora": quién más
tiene abierta la página en este momento y un botón para retarlo a la modalidad y
el reloj que uno elija. Si acepta, la partida nace sola y a los dos los manda a
la página de la modalidad. Hasta ahora las partidas entre personas solo las
armaba el profesor desde esa misma página; ahora los alumnos también pueden
arrancar una entre ellos.

- **Quién está conectado no es una tabla**: es un canal de presencia de Realtime
  (`juegos-en-linea`) donde cada quien se anuncia mientras tiene la página
  abierta. Al cerrar la pestaña desaparece solo, sin "última vez visto" que
  limpiar ni fila que se quede colgada.
- **El reto sí es una fila**, en `desafios` (`de_id`, `para_id`, `modalidad`,
  `estado`, `room_id`, `initial_seconds`, `increment_seconds`). Tiene que
  sobrevivir el rato que el otro tarda en contestar, y así le llega aunque en
  ese momento no estuviera mirando la página. La tabla está en la publicación
  `supabase_realtime`: sin eso los retos no llegan solos, que es todo el punto.
- **Retarse es lo ÚNICO que comparte toda la Academia.** `public.pueden_jugar_entre_si(a, b)`
  (`SECURITY DEFINER`) dice hoy "son dos cuentas distintas de la Academia" y
  nada más. La página filtra con la misma regla, pero solo para no mostrar un
  botón que va a fallar — quien manda es la política de la base.
  - Antes había que **compartir profesor**, y eso dejaba la lista vacía casi
    siempre: un alumno que quiere jugar AHORA no tiene por qué esperar a que
    alguien de su propia clase esté conectado. Y la lista vacía se lee igual
    que "no hay nadie", así que el filtro de más **no daba ningún error** —
    solo lo dejaba sin con quién jugar.
  - **Lo que NO se abrió**: `puedo_armar_partida_con()` (el profesor sigue
    armando partidas solo con los suyos, desde el formulario) ni
    `profiles_select` (ver y gestionar a alguien sigue siendo otra cosa que
    jugar con él). Ver alumnos ajenos sigue cerrado para profesores y para
    quien coordina.
  - **El nombre del rival sale de `public.nombres_de_jugadores(uuid[])`**, no
    de `profiles`. Las ocho páginas de partida pedían
    `select("id, full_name, email")`, y con la lista abierta eso era doble
    problema: el rival de otra clase no está en `profiles_select` —la tarjeta
    habría dicho "tu rival" sin que nada fallara— y aquel select repartía el
    correo de un montón de menores de edad. La función devuelve el nombre ya
    resuelto (nunca el correo entero: solo lo de antes de la @ cuando no hay
    nombre escrito) y **solo de quien comparte conmigo una partida o un reto**,
    más lo que alcanza quien supervisa esa partida — el mismo alcance de
    `game_rooms_select`, escrito con las mismas funciones de la casa
    (`soy_profesor_de_alguno`), menos `es_companero`. No es un directorio.
  - **El canal de presencia dejó de anunciar los profesores de cada quien.**
    Servía para decidir si eran compañeros; ahora no hace falta y, de paso, era
    repartirle a toda la página con quién estudia cada alumno.
- **Aceptar no crea la partida con un insert**: un alumno no puede insertar en
  `game_rooms` (esa política sigue colgando de `puedo_armar_partida_con()`, que
  NO se abrió, y así se queda). La crea
  `public.aceptar_desafio()`, `SECURITY DEFINER`, que comprueba que el reto
  existe, que sigue pendiente y que quien acepta es quien lo recibió, sortea los
  colores, arma la sala y de paso cancela los otros retos pendientes entre esos
  dos. Es el mismo patrón que `registrar_arbitraje_publico()`: lo que el cliente
  no tiene permiso de hacer directo, lo hace una función que valida.
- La RLS de `desafios` reparte los verbos: **quien recibe** es el único que
  puede rechazar, **quien reta** solo puede cancelar, y aceptar no lo puede
  hacer nadie a mano (es cosa de la función). Antes los dos podían dejar
  cualquier estado; no abría ninguna partida ajena, pero quien retaba podía
  marcarse el reto como aceptado y mandarse solo a una sala que no podía leer.
- La posición de salida de cada modalidad la da `estadoInicial(variant)`, una
  sola función que usan **los dos caminos** — el formulario del profesor y
  aceptar un reto—. Si se duplicara, una partida creada por un lado y otra por
  el otro podrían arrancar distinto.
- Se retan las modalidades de a dos que ya existen; las de 4 jugadores no
  (necesitan cuatro personas y otro reparto) y las que están "Próximamente"
  tampoco. Cuando de verdad no hay nadie conectado, la lista ofrece el bot de
  Oscar mientras tanto.
- **Rechazar puede llevar un motivo** (`desafios.motivo_rechazo`, opcional, 140
  caracteres), que quien reta ve en vez del genérico "Tu reto no fue aceptado
  esta vez.". La política de `update` de `desafios` no restringe qué columnas
  toca cada verbo más allá de `estado`/`room_id`, así que esta columna se
  suma sin tocar la política.
- **El botón "Retar" ya no espera los 20 segundos completos si ya hay
  respuesta.** Se libera con el timeout de siempre (por si no contestan) o,
  antes, en cuanto llega por Realtime un "rechazado" o un "aceptado" —
  `reactivarBoton()`, indexado por el id del reto. Antes, rechazar de
  inmediato igual dejaba a quien retó viendo "Esperando…" el resto de los 20
  segundos, sin ninguna razón para seguir esperando.

## El profesor también se sienta a jugar

El sitio asumía que el profesor reparte rivales y mira. Ahora además **juega**:
contra sus alumnos en una partida amistosa y emparejado como uno más en sus
propios torneos.

**Lo que lo impedía no era el botón, era la base.** Crear una partida exigía
`soy_profesor_de_todos([blancas, negras])`, o sea "¿son todos alumnos míos?", y
**un profesor no es alumno de sí mismo** — `profile_teachers` solo tiene alumnos
como `student_id`. Ponerse en el tablero daba `false` y la fila se rechazaba.

Y no era solo el formulario de Juegos: `torneo.html` inserta en `game_rooms` al
generar cada ronda, así que un profesor inscrito en su propio torneo **tumbaba la
ronda entera**, no su partida. Ese es el tipo de fallo que este cambio tenía que
mirar entero antes de tocar nada.

- La pregunta correcta no era "¿son todos alumnos míos?" sino **"¿puedo sentar a
  esta gente en un tablero?"**, que es la misma más una excepción: yo. Vive en
  `public.puedo_armar_partida_con(uuid[])` (`SECURITY DEFINER`, como sus
  hermanas) y la usan las dos políticas de insert, `game_rooms` y
  `fourplayer_games`. Administración arma partidas con cualquiera, igual que
  antes en el resto del sitio.
- **`game_rooms_insert` suma `white_id is distinct from black_id`.** Antes eso lo
  impedía de rebote la propia regla (nadie es alumno de sí mismo); al abrir la
  excepción del "yo" había que escribirlo, o un profesor podía crearse una
  partida contra sí mismo.
- Comprobado impersonando roles en SQL, diez casos: el profesor crea con su
  alumno y no con uno ajeno, no contra sí mismo, no firmando como otro; un
  profesor sin alumnos no crea nada; un alumno tampoco; administración sí; **y
  sigue funcionando lo de siempre**, dos alumnos distintos del mismo profesor.
- **El reto en vivo de "🟢 En línea ahora" ya funcionaba** profesor↔alumno
  (`pueden_jugar_entre_si` lo contempla y la lista rotula "· profe"): ese camino
  crea la sala con `aceptar_desafio()`, que es `SECURITY DEFINER` y no pasa por
  la política. Era la única de las tres puertas que estaba abierta.

En el navegador:

- **"Yo" va en su propio `<optgroup>` y AL FINAL de los selectores, no arriba.**
  Si fuera la primera opción, el caso de todos los días —armar una partida entre
  dos alumnos— arrancaría con el profesor puesto de blancas y habría que sacarlo
  a mano cada vez. Al final, los índices de la preselección siguen cayendo donde
  caían. Con un solo alumno, las negras arrancan en el profesor: antes quedaban
  las dos casillas en el mismo alumno y el formulario se quejaba sin razón
  aparente.
- **`#my-active-games` salió de la vista del alumno** y vive fuera de las dos:
  desde que el profesor juega, necesita la misma puerta de entrada a su partida.
  El aviso de "espera a que tu profesor te asigne un rival" sigue siendo solo del
  alumno. En la lista de supervisión, la partida propia del profesor dice
  **"♟️ Jugar"** y no "👀 Ver" — el mismo enlace, pero un "Ver" sobre la partida
  propia se pasa por alto.
- **En los torneos lo único que lo impedía era el botón escondido.** La RLS ya
  dejaba inscribirse a quien organiza (`tournament_registrations_insert` tiene su
  rama de dueño), y `TorneoEngine` no sabe quién es profesor: empareja ids. Se
  quitó el `!isManager` de `torneos.html` y el `else` que escondía el botón en
  `torneo.html`.
- `juegos.html` trata `is_admin` como profesor, como `informes.html`.

**Quien organiza y juega también anota los resultados de su propia partida**, y se
deja así a propósito: es una academia, no un torneo federado, y la alternativa
—pedir un árbitro para que el profesor pueda jugar— no la pidió nadie. Los
cruces y los resultados quedan a la vista de todos los inscritos, que es el
control que corresponde a esta escala.

**Al tocar cualquiera de estas piezas, correr `node
herramientas/verificar-profesor-juega.js`** (con el sitio en localhost:8777 y
playwright). Comprueba en un navegador de verdad qué manda el formulario, que la
preselección de siempre no se haya movido, que la partida propia se vea y su
botón diga "Jugar", que al alumno no se le haya movido nada y que el botón de
inscripción aparezca para quien organiza. Su Supabase de mentira **filtra de
verdad** (`eq`, `in`, `or`): la página pide `profiles` tres veces seguidas con
filtros distintos, y un doble que devolviera siempre la tabla entera daría por
buena una página rota.

## El aviso de un pareo asignado llega a cualquier página, no solo a Juegos

`js/juego-aviso.js` existía desde antes —avisa y traslada solo cuando el
profesor arma un pareo desde "Asignar rivales" en `juegos.html`— pero solo
funcionaba ahí y en `clases.html`, porque eran las dos únicas páginas que
cargaban el script y llamaban a mano `JuegoAviso.iniciar({ sb, userId,
esProfesor })`. Un alumno resolviendo un ejercicio en `entreno/4x4.html` o
mirando su bitácora en `informes.html` cuando el profesor lo pareaba **no se
enteraba de nada**: la partida quedaba creada en la base, y la única forma de
descubrirla era volver a entrar a Juegos o al panel por su cuenta. No daba
ningún error — la partida existía y esperaba, tan campante.

- **Se autoarranca, con el mismo patrón que `js/burbuja-en-linea.js` y
  `js/notificaciones.js`**: busca su propia sesión y su propio rol
  (`profiles.role`, `is_admin`) y solo se suscribe si quien mira NO es
  profesor ni administración — a ellos no se les traslada a ningún lado,
  porque son quienes arman el pareo. Así cualquier página que cargue el
  script queda cubierta sin que nadie tenga que acordarse de invocarlo con el
  `profile` a mano.
- **`JuegoAviso.iniciar(opts)` se queda, pero ahora es idempotente** (una
  bandera interna `iniciado`): si una página ya lo llama con los datos que
  tiene a mano —evitando la consulta extra a `profiles`— y el autoarranque
  también intenta iniciarlo, el segundo que llegue no hace nada. Sin ese
  guardado, cargar el script dos veces (una a mano y otra por el
  autoarranque) habría abierto dos canales de Realtime por alumno.
- **La pone `herramientas/academia-cabecera.py`**, en la MISMA lista
  `PAGINAS` que ya usa para la burbuja — no en una lista aparte: con dos
  listas, la página nueva entra en una y se olvida en la otra, que es
  exactamente lo que ya pasó una vez entre `verificar-pwa.js` y
  `pwa-cabecera.py`. Va con `defer` y al final del `<body>`, después de donde
  sea que la página cargue `js/supabase-client.js`, que es de quien depende
  (`window.sb`).
- **Solo se excluye de `examen.html`, no de `sesion.html`.** La burbuja se
  queda afuera de las dos, pero por razones distintas y no todas aplican
  acá: `sesion.html` no lleva burbuja porque YA tiene su propio chat con la
  lista de conectados —el mismo destino dos veces—, y eso no tiene nada que
  ver con un aviso de "te asignaron una partida en Juegos". `examen.html` sí
  se excluye de las dos, por la misma razón: un aviso que aparece solo y
  puede trasladar a otra página es justo la distracción que el antitrampa
  del examen viene a evitar.
- **Con `juegos.html` y `clases.html` se quitó la llamada manual y el
  `<script>` del `<head>`**, no se dejaron las dos formas conviviendo: la
  llamada explícita con el `profile` ya cargado sigue siendo válida (la
  acepta `iniciar()`), pero mantenerla ahí Y agregar el autoarranque en esas
  dos páginas habría sido la misma lógica escrita de dos maneras que se
  van a ir separando a la primera corrección. Las dos páginas quedaron
  cargando el script una sola vez, igual que las demás: al final del
  `<body>`, puesto por `academia-cabecera.py`.
- **"Pendiente" solo existe en las variantes con paso de "estoy listo"**
  (`CON_LISTO`). Duelo Simultáneo no lo tiene, así que sus banderas se quedan
  en false la partida entera y el aviso la ofrecía una y otra vez. Y **no se
  avisa de la partida en la que ya se está** (`?room=` de la dirección):
  "Entrar ahora" sobre la misma sala recargaba la página que se estaba jugando.

**Al tocar `js/juego-aviso.js` o `herramientas/academia-cabecera.py`, correr
`node herramientas/verificar-juego-aviso.js`** (con el sitio en
localhost:8777 y playwright). Comprueba que la lista de páginas de la
Academia lleve el script en todas menos `examen.html` (incluida
`sesion.html`, que sí la lleva), que a un profesor o a quien administra no se
le suscriba nada, que a un alumno en una página que NO es `juegos.html` ni
`clases.html` —el caso que este cambio viene a resolver— le aparezca el
aviso en cuanto llega la fila nueva de `game_rooms`/`fourplayer_games`, que
"Entrar ahora" lleve a la página y la sala correctas, y que un cliente sin
`channel` no deje ni un error en la consola.

## El reloj de la partida no se fía del navegador

`game_rooms.white_time_left`/`black_time_left` (y el `time_left` de cada
asiento en `fourplayer_games.seats`) los escribe el propio cliente en cada
jugada — es el navegador el que calcula "cuánto le quedaba menos lo que pasó
más el incremento" (ver el comentario "Reloj" en `estandar.html` y
hermanos). La política de `UPDATE` de las dos tablas solo comprueba QUIÉN
escribe, nunca QUÉ valor manda: hasta este cambio, cualquiera de los dos
jugadores podía, desde la consola del navegador, escribirle a su propio
reloj el número que quisiera — el mismo tipo de fuga que ya se había cerrado
para `class_presence_log`/`platform_activity_log` con
`proteger_tiempos_de_presencia()`.

- **`public.proteger_reloj_de_partida()`** (el mismo trigger `BEFORE INSERT
  OR UPDATE` que ya forzaba `clock_updated_at` a la hora del servidor, ahora
  también valida el tiempo) calcula el tiempo real transcurrido con
  `now() - OLD.clock_updated_at` — la hora del SERVIDOR, nunca la que mande
  el navegador — y rechaza cualquier `white_time_left`/`black_time_left` (o
  `time_left` de asiento) que sea mayor que "lo que le quedaba menos ese
  tiempo real, más el incremento, más 2 segundos de margen" por latencia de
  red. Un cliente puede seguir siendo generoso consigo mismo por un par de
  segundos; ya no puede escribirse un reloj infinito.
- **El reloj arranca con los dos listos aunque confirmen a la vez.** El
  navegador solo ponía `clock_updated_at` si al confirmar veía al rival ya
  listo en su copia; confirmando en el mismo medio segundo ninguno lo veía y
  el reloj no arrancaba nunca. Lo pone ahora el mismo trigger cuando las dos
  banderas quedan en `true`.
- **Una jugada con la bandera caída se rechaza.** Quien lleva más de la
  tolerancia en cero ya no puede mover: antes un mate que llegaba después de
  la bandera pisaba el resultado. Y las páginas terminan la partida con
  `.eq("status", "playing")`: rendirse con el diálogo abierto mientras al
  rival se le caía la bandera pisaba el resultado igual.
- **Solo valida la columna que de verdad cambia.** Una jugada normal solo
  toca el reloj de quien la hizo — el del rival queda igual porque no viene
  en el `UPDATE`, así que no hay nada que comprobar ahí (compararlo contra
  el tiempo transcurrido habría rechazado la jugada de siempre, porque el
  reloj de quien NO mueve no tiene por qué haber bajado).
- Es la misma función para las dos tablas: en `fourplayer_games` recorre los
  cuatro asientos (`red`, `blue`, `yellow`, `green`) dentro de `seats`, en
  vez de dos columnas sueltas.
- Comprobado insertando una fila de prueba y actualizándola de las dos
  formas: el cálculo legítimo (el mismo que hace la página) pasa igual que
  antes; escribir un número inventado (999999) lo rechaza con
  "Tiempo restante inválido".

### La bandera la canta el servidor, y el reloj cuenta con SU hora

Lo de arriba impedía **subirse** el reloj; **bajárselo al rival** quedaba
libre, y eso es justo lo que hace una bandera: el navegador ve el reloj del
otro en cero y escribe `status: finished` con ese reloj en 0. Y ese cero lo
calculaba **con la hora de la computadora** contra un `clock_updated_at` que
pone la base: una computadora cinco segundos adelantada le cantaba la bandera
al rival cinco segundos antes de tiempo, y le quitaba cinco segundos a cada
jugada propia. Una atrasada, al revés. Ningún error: el reloj mentía distinto
en cada pantalla, y una partida la podía ganar el reloj de Windows.

- **`js/reloj-servidor.js` mide el desfase** contra `public.hora_servidor_ms()`
  —tres muestras, la de menor ida y vuelta, partida a la mitad— y las seis
  páginas con reloj (`estandar`, `niebla`, `crazyhouse`, `cartas`, `variante`,
  `cuatro-jugadores`) cuentan con `RelojServidor.desde(room.clock_updated_at)`
  en vez de `Date.now()`. Es el mismo arreglo que ya tenía `examen.html` con su
  `desfase`, escrito ahora una vez para todas. Se vuelve a medir cada cinco
  minutos y al volver a la pestaña. **Si la medición falla, el desfase queda en
  cero**, que es lo que el sitio hacía antes: nunca peor.
- **Y la base ya no se lo cree**: el trigger rechaza que un reloj baje más de
  lo que de verdad pasó según `now()` (con los mismos 2 s de tolerancia). Corre
  solo el de quien tiene el turno —se lee de la FEN, o de `cartas_state.fen` en
  Cartas, cuya columna `fen` no se actualiza—; el otro está quieto y no puede
  bajar nada. Así una bandera cantada antes de tiempo, o un 0 escrito desde la
  consola, sale con «Todavía le queda tiempo a las blancas». La página la
  vuelve a intentar cada 250 ms, así que una que se adelantó por medio segundo
  termina entrando igual, en el momento justo.
- **Cuatro jugadores no tiene esta segunda mitad**: ahí la bandera no escribe
  un `time_left` en cero, elimina el asiento dentro del estado de la partida, y
  validarlo pediría leer ese estado en SQL. Tiene el desfase, que es la mitad
  que más se notaba.
- Comprobado en una transacción revertida, cuatro casos: la bandera cantada
  con 50 s por delante se rechaza, la jugada legítima pasa, bajarle el reloj al
  que no mueve se rechaza, y la bandera de verdad (61 s sobre 60) entra.

### La triple repetición

Nunca se detectaba en línea: el tablero se recarga con `loadFen()` en cada
jugada del rival, y eso le borra a chess.js el historial, así que su
`in_threefold_repetition()` no veía nunca una posición repetida. Dos jugadores
podían repetir la misma posición veinte veces y la partida seguía.

- **`js/repeticion.js` reproduce `room.moves` desde la salida** y cuenta cuántas
  veces aparece la posición final. Una posición es la misma con las mismas
  piezas (en Crazyhouse, la misma reserva), el mismo turno, los mismos enroques
  y la misma captura al paso — **pero la captura al paso solo cuenta si de
  verdad se puede hacer** (FIDE, art. 9.2). chess.js anota la casilla después
  de cualquier avance de dos, y sin ese recorte se escaparían repeticiones de
  verdad.
- **Si la reproducción no llega a la FEN guardada, no se declara nada.**
  Equivocarse hacia «no hay repetición» deja la partida como estaba; hacia el
  otro lado le roba la partida a alguien.
- Es automática, como en lichess, y la declara quien hace la jugada que repite:
  va en el mismo `update` que la jugada, con `result: "draw"`. El final dice
  «Tablas por triple repetición.» (se vuelve a contar al pintarlo: no hay
  columna de motivo, y no hace falta una).
- Va en `estandar`, `niebla` y `crazyhouse`, las de reglas de ajedrez de
  siempre. **Las de `variante.html` y Cartas no la tienen**: sus motores y sus
  cartas cambian lo que significa «la misma posición», y es otra decisión.

**Al tocar el reloj, `js/reloj-servidor.js`, `js/repeticion.js` o
`handleLocalMove` de una página de partida, correr `node
herramientas/verificar-reloj-y-repeticion.js`** (con `npm install
chess.js@0.10.3`; no necesita navegador ni red). Comprueba que se cuente la
repetición con chess.js y con Crazyhouse, que una captura al paso imposible no
separe posiciones, que ante lo que no entiende no declare tablas, que ninguna
página calcule el reloj con `Date.now()` a secas, y que el desfase se mida
contra un servidor que va siete segundos por delante. Está probado que falla de
verdad: quitando el recorte de la captura al paso, salta.

## Una sola copia de lo que comparten los juegos

Cada juego había nacido copiando al anterior, y las copias ya se habían
separado sin que nadie lo notara (la página se veía bien y hacía otra cosa):

- **`js/sala-juego.js`: las salas de partida en línea** (Estándar, Niebla,
  Crazyhouse, Cartas, las variantes y Duelo). El reloj y su rótulo dicho, la
  caída de bandera, «Estoy listo», «Rendirse», volver a leer la sala y escuchar
  sus cambios. Eran seis copias, y **solo Estándar y Niebla decían de quién era
  cada reloj**: en Crazyhouse, Cartas y las variantes el lector de pantalla leía
  «10:00» suelto. Lo único que cambia de un juego a otro es a quién se le
  pregunta el turno (`board.game` o `engine`), y por eso se pasa ya calculado.
  Cada página conserva sus funciones (`renderClocks`, `releerSala`…), pero de
  una línea. Crazyhouse sigue con su propia triple repetición: cuenta con su
  motor, no con chess.js.
- **`js/racha-tablero.js`: el tablero de los ejercicios contra reloj**
  (Racha táctica y Te reto): el tablero, el teclado, el arrastre, el cuadro de
  comandos, la coronación y la corrección. **Te reto marcaba «Respuesta
  incorrecta» a un mate que no era el guardado** (hay unas 140 posiciones con
  más de un mate); Racha táctica ya lo aceptaba. Se carga antes del script de
  cada página y usa las variables de la página solo dentro de funciones.

Lo que queda repetido entre los juegos (el estado de la partida en palabras,
guardar la jugada) cambia de verdad en cada uno: lo que se unió es lo que era
igual. `verificar-juegos-accesible.js` prueba en todas las salas el rótulo de
los relojes, «Estoy listo» y «Rendirse» (con un doble que anota lo escrito), y
en las dos rachas que el otro mate cuenta. Las tres pruebas fallan con las
copias viejas o rompiendo el módulo a propósito.

## Las jugadas llegan siempre

En un torneo pasó que el reloj corría y al alumno no le aparecía la jugada del
rival, o la suya no le llegaba al otro. No daba ningún error: la jugada estaba
guardada en la base y la pantalla no se enteraba. Se encontraron cuatro
causas, todas calladas:

- **La sala solo escuchaba Realtime, y Realtime no avisa lo que se perdió.**
  Un celular que bloqueó la pantalla, una pestaña en segundo plano a la que el
  navegador le frenó el latido, un cambio de wifi a datos, o el propio
  Realtime atrasado con la base cargada: el canal se reconecta solo, pero las
  jugadas que pasaron mientras tanto no llegan nunca. La pantalla se quedaba
  esperando una jugada que ya estaba hecha, con el reloj del rival corriendo,
  mientras en la otra pantalla corría el propio. Lo mismo entre leer la sala
  al abrirla y quedar suscrito: una jugada en ese medio segundo se perdía.
  **Ahora `SalaJuego.suscribir()` vuelve a leer la sala** (una fila por su
  llave) cada vez que el canal queda conectado —la primera vez y cada
  reconexión—, al volver a la pestaña, al recuperar la red, y de respaldo si
  pasa un rato sin noticias con la partida en juego: 5 s esperando al rival,
  15 s en el turno propio, 8 s mirando, 3 s con el canal caído. Si el canal
  se cierra del todo (`CLOSED`, la librería no lo reintenta) abre otro. Con el
  canal caído más de 4 s se dice «Reconectando…» debajo del estado.
- **Lo que llega tarde pisaba lo nuevo.** Realtime no garantiza el orden
  frente a la respuesta de la propia escritura ni frente a una relectura. Y
  `handleLocalMove` pegaba su parche sobre la sala después de guardar: si la
  respuesta del rival llegaba antes que la de la base (con la base lenta, pasa),
  la sala volvía una jugada atrás y la siguiente jugada se guardaba sin la del
  rival en la lista. Ahora **cada versión se ordena** (`SalaJuego.esAnterior`:
  terminada, cuántas jugadas, la ronda del Duelo, cuántos listos, desde cuándo
  corre el reloj) y lo viejo no se aplica; la jugada se guarda pidiendo la fila
  de vuelta (`select("*")`) y se queda la más nueva. La misma fila dos veces no
  repinta nada.
- **Una jugada solo se guarda sobre la posición de la que salió**
  (`.eq("fen", room.fen)`, en Estándar, Niebla, Crazyhouse y las variantes): si
  la sala ya iba más adelante —otra pestaña de la misma cuenta, una jugada
  repetida— no la pisa; se vuelve a leer y se dice «Esa jugada no quedó
  guardada: la partida ya iba más adelante». Cartas no lo lleva (su posición
  va en `cartas_state` y la columna `fen` no se actualiza).
- **El reloj corría según el tablero, no según la sala.** Al mover, el tablero
  ya muestra la jugada (le toca al rival), pero para la base el reloj que
  corre sigue siendo el propio hasta que la jugada queda guardada: el reloj del
  rival bajaba de golpe todo lo que uno había pensado, y con la base lenta
  podía hasta intentar cantarle la bandera. Ahora el turno del reloj sale de
  la sala guardada (`SalaJuego.turnoDe(room)`, que lee también
  `cartas_state.fen` y el JSON de Abrazos). Y la hora con que arranca el reloj
  propio es la de la base (la fila devuelta), no la de la computadora.
- **Una bandera rechazada ya no se reintenta cada 250 ms.** Si la base dice
  «Todavía le queda tiempo», lo que se ve está atrasado (casi siempre, una
  jugada que no llegó): se vuelve a leer la sala, y se espera un segundo antes
  de volver a intentar. Antes era una pantalla trabada mandando cuatro
  pedidos por segundo, justo cuando la base anda lenta.

**Ajedrez para 4** (`cuatro-jugadores.js`) tenía lo mismo y dos cosas suyas.
Usa la misma escucha (`SalaJuego.suscribir` con `tabla: "fourplayer_games"`;
el orden cuenta también quién quedó fuera y cuántos están listos, que van en
los asientos) y su reloj corre según `room.turn`, el turno guardado. Además:

- **Guarda el tablero ENTERO en cada escritura** (los cuatro asientos y el
  tablero son jsonb), así que dos escrituras casi a la vez se pisaban: la
  segunda borraba a la primera sin ningún error. Lo más común era **«Estoy
  listo»**: si dos lo tocaban en el mismo medio segundo, uno quedaba sin
  listo y la partida no arrancaba nunca. Ahora cada escritura va solo sobre la
  versión que se tenía a la vista (`.eq("updated_at", room.updated_at)`, que
  cambia con cada escritura), la jugada además solo en el turno propio, y
  «Estoy listo» —que también pone `updated_at`— vuelve a leer y lo intenta otra
  vez sobre lo nuevo.
- **Acá la base no valida la bandera** (ver «La bandera la canta el
  servidor»), y la bandera se calculaba con el turno del tablero: mientras la
  jugada propia viajaba, el reloj del siguiente bajaba todo lo que uno había
  pensado y la pantalla lo podía dar por eliminado. Ahora la bandera y el rey
  en piloto automático solo se resuelven cuando el tablero coincide con lo
  guardado (`game.turn === room.turn`).
- **La rendición también vuelve a intentar.** Con la regla de la versión, una
  rendición que se cruzaba con la jugada de otro (lo común con cuatro) no
  encontraba la fila, y la pantalla decía «La partida ya había terminado: la
  rendición no se registró» con la partida en juego. Ahora `persist()` devuelve
  si quedó (`true`), si la sala había cambiado (`false`) o si la base dio error
  (`null`), y la rendición se repite sobre la sala recién leída, como «Estoy
  listo».
- **Lo guardado rehace el tablero.** La jugada propia cambia el reloj de
  `room` antes de guardarse; una relectura que llegaba en ese momento (el
  reloj de 15 s, volver a la pestaña) traía la sala de antes, no era «la
  misma» y se aplicaba: la jugada desaparecía del tablero aunque quedaba
  guardada, y como su eco era igual a `room`, nada la traía de vuelta. Ahora,
  al quedar, `game` se rehace desde la fila guardada.

Los dos cruces los arma a mano `verificar-cuatro-escrituras.js`: en la prueba
de carga casi nunca caen por azar.

Y lo que cargaba a Realtime para todos:

- **`torneo.html` escuchaba `game_rooms` entera** —«la siguiente candidata si
  los torneos crecen», decía «Realtime escucha solo lo que la pantalla
  muestra»—: cada jugada de cualquier partida de la plataforma le llegaba a
  cada pantalla de torneo abierta, y Realtime revisa la RLS de cada cambio
  contra cada quien escucha, en un solo hilo. Con 50 mesas y los jugadores
  con el torneo abierto en otra pestaña, eso atrasaba las jugadas de todos,
  también las de los tableros. Ahora escucha solo las mesas que dibuja,
  `id=in.(…)` de a 100 (el tope de Realtime), y vuelve a armar la escucha
  cuando cambia la lista. Niebla no dibuja sus mesas y no escucha ninguna. Un
  tablerito no retrocede con una versión que llega tarde.
- **La TV** (`tv.html`) volvía a pedir todas las partidas en juego, con todas
  sus jugadas y los nombres, por **cada jugada** de cada partida. Ahora junta
  los avisos: una recarga a la vez y a lo sumo una por segundo. Lo mismo la
  lista de partidas de la clase en `sesion.html`.

**Al tocar `js/sala-juego.js`, la forma en que una sala (también la de Ajedrez
para 4) guarda o aplica una jugada, o lo que escucha `torneo.html`, correr `node
herramientas/verificar-partidas-simultaneas.js`** (con el sitio en
localhost:8777 y playwright; `PARTIDAS=10` para una corrida corta). Abre
pestañas de `estandar.html` contra un servidor de mentira que hace de base y de
Realtime para todas (con las reglas del trigger del reloj), y en cada una un
jugador automático mueve al azar cuando le toca. Mide cuánto tarda cada jugada
en verse del otro lado:

- **10 partidas, red sana**: todas en menos de 1 s (medido: mediana 108 ms, la
  más lenta 205 ms).
- **50 partidas a la vez (100 pestañas), red sana**: ninguna se pierde ni se
  traba, ninguna pasa de 6 s. Con 100 pestañas en una computadora de 4
  procesadores la mediana sube a ~0,5 s, y es la computadora: la prueba
  imprime también cuánto atrasaba ella los relojes de cada pestaña. En un
  torneo, cada alumno tiene su aparato.
- **50 partidas con red mala** —Realtime pierde el 15 % de los avisos,
  entrega otro 10 % tarde y desordenado, corta y cierra canales, y una de cada
  diez respuestas de la base tarda hasta 2,5 s—: ninguna partida se traba,
  ninguna jugada pasa de 15 s (medido: la mitad en menos de medio segundo, la
  peor 8,6 s: un aviso perdido, 5 s de espera y dos respuestas lentas), al
  final todas las pantallas muestran lo que hay en la base, y la lista de
  jugadas guardada lleva siempre a la posición guardada.

- **12 partidas de Ajedrez para 4 (48 pestañas)**, con red sana y con red
  mala: los cuatro tocan «Estoy listo» casi a la vez y todas arrancan; cada
  jugada la ven los otros tres (ver una posición más nueva cuenta como ver las
  anteriores: quien espera puede pasar de una vez a la última), y la lista de
  jugadas guardada es siempre la del tablero guardado. Con el Ajedrez para 4
  de antes, **ninguna de las partidas arrancaba**, ni con la red sana: los
  «listo» casi simultáneos se borraban entre sí.

Con la sala de antes, la red mala deja partidas trabadas para siempre (una
jugada tardó 5 minutos en verse; otras no llegaron nunca).

## La sala de cine de las transmisiones

`torneos-en-vivo.html` (el enlace «Torneos» junto a «¡Te reto!» y «TV en
vivo») tiene una ficha por torneo transmitido. Un torneo que se transmite por
Lichess (una transmisión, «broadcast») entra a `transmision.html?torneo=<clave>`:
la partida elegida en la pantalla grande entre dos telones, las demás mesas de
la ronda debajo y, al lado, la pizarra de posiciones. El código está en
`js/transmision.js`; qué torneo muestra lo dice la sala de esa clave en la
tabla `salas_torneo` (ver «Las salas de torneos se editan en administración»).

- **Todo sale de la API pública de Lichess**, sin cuenta ni base propia:
  `/api/broadcast/<id>` trae el torneo y sus rondas, y cada ronda se pide en su
  dirección con `/api` delante (la que Lichess da en `url`). La ronda trae cada
  partida con su FEN, así que no hace falta chess.js en la página: solo se lee
  la parte de las piezas. La CSP ya dejaba `connect-src https://lichess.org`.
- **La pizarra se suma acá, ronda por ronda**: 1 por ganar, ½ por tablas. No se
  inventa un desempate: con los mismos puntos se comparte el puesto (1, 2, 2,
  4). Y dice de cuántas rondas sale («Suma de X de Y rondas»): si una ronda no
  cargó, la pizarra no muestra puntos de menos sin avisar.
- **Solo se refresca la ronda que se está viendo, y solo si sigue en juego**,
  cada 20 s; con la pestaña escondida no se le pide nada a Lichess.
- **El tablero es el que eligió cada quien**: casillas con `--sq-light/--sq-dark`
  y la pieza por `PiezaPreferida` (la página está en `tablero-cabecera.py`).
  El grande lleva coordenadas; las miniaturas no (a ese tamaño no se leen).
- **La sala está siempre a oscuras**, en modo claro y en oscuro. Los colores de
  texto se midieron contra esos fondos fijos. La última jugada se marca en
  dorado y además va escrita debajo («última jugada e2–e4»); quien usa lector
  de pantalla tiene la posición en palabras.
- `verificar-transmision.js` lo comprueba con un doble de Lichess cuyas
  posiciones salen de jugar las jugadas con chess.js: la posición y la última
  jugada, la pizarra con empates, cambiar de mesa y de ronda, que el resultado
  nuevo llegue solo, el contraste y el aviso con Lichess caído. Rompiendo la
  regla del puesto compartido, salta.

## Las salas de torneos se editan en administración

Las fichas de Torneos (`torneos-en-vivo.html`) y el torneo de cada sala de
cine estaban escritos en el código: el HTML y una lista en `js/transmision.js`.
Cada sala nueva era un cambio de código. Ahora viven en la tabla
**`salas_torneo`** y las crea, edita, ordena, oculta y borra quien administra,
en **`admin.html#torneos`** (`js/admin-salas-torneo.js`). Migración
`20260927043856_salas_de_torneos_transmitidos`.

- **Dos tipos de sala.** `lichess`: una transmisión de Lichess, que entra a la
  sala de cine (`transmision.html?torneo=<clave>`) y lleva el id de la
  transmisión. `enlaces`: cualquier otra (UTN va en idchess, que no tiene API
  pública conocida), con uno a seis botones que la abren en otra pestaña. Las
  de Lichess pueden llevar botones de más («Verlo directo en Lichess») y
  pizarras de chess-results (ver «Las posiciones oficiales vienen de
  chess-results»).
- **Una sola ficha.** `js/salas-torneo.js` la pinta, y la usan la página
  pública y la vista previa del editor (dentro de una caja `inert`: se ve pero
  no se sigue). Lo que se ve en la vista previa es lo que se va a ver.
- **Quién lee y quién escribe lo decide la RLS.** Las visibles las lee
  cualquiera, anónimo incluido; las ocultas, solo quien administra (así se
  prepara una sala antes de publicarla). Escribir: solo `soy_admin()`. No es
  una tabla que reparte permisos, así que se escribe directo con políticas,
  como `tv_settings`. `updated_at`/`updated_by` los pone un trigger, no el
  navegador. Comprobado impersonando roles en SQL: anónimo y alumno no
  insertan, y su update y su delete no tocan ninguna fila.
- **Los enlaces se validan en la base**, con `interno.enlaces_de_sala_validos()`
  en un `check`: solo `https://`, sin espacios ni comillas, texto de 1 a 60,
  seis como máximo. Un «javascript:» en una página pública no puede depender
  de que el formulario lo haya revisado. El formulario valida lo mismo antes de
  mandar, para decirlo en palabras y llevar el foco al campo; la dirección
  repetida (`23505`) también se explica.
- **Un update que la RLS no deja pasar no da error: no toca ninguna fila.** El
  editor pide `.select("id")` y, si no vuelve ninguna, dice «No se guardó: tu
  cuenta no tiene permiso» en vez de «guardada».
- **La dirección de UNA ronda de Lichess se guarda con su torneo.**
  `lichess.org/broadcast/<torneo>/<id>` es el torneo;
  `…/<torneo>/<ronda>/<id>` es una ronda, y «Comprobar en Lichess» le pregunta
  de qué torneo es: la sala muestra el torneo entero, con todas sus rondas.
- **La comprobación va con su botón, no al salir del campo.** Probado: el texto
  del resultado corre el formulario, y si llega justo cuando se aprieta
  «Guardar la sala», el clic cae en otro lado y no se guarda nada, sin error.
- La dirección de la sala se arma sola con el nombre (sin tildes, con guiones)
  hasta que se escribe a mano; editar el nombre de una sala que ya existe no le
  cambia la dirección, que es la que ya se compartió.
- `verificar-salas-torneo.js` lo prueba con `lib/doble-salas-torneo.js`, un
  doble que aplica la RLS y los `check` de la tabla (también lo usa
  `verificar-transmision.js`): las fichas, los dos tipos, los rechazos, la
  ronda de Lichess, editar, ocultar, reordenar, borrar con su confirmación, el
  contraste y el permiso perdido a mitad de camino. Quitando la comprobación
  de «no se guardó», salta.

## Las posiciones oficiales vienen de chess-results

Una transmisión de Lichess puede traer solo algunas mesas: la del
Interuniversitario UTN-CONARE 2026 trae dos, de un torneo femenino de 10 y un
absoluto de 27. Sumar esas dos mesas daría una «tabla de posiciones» que no es
la del torneo, y se vería perfecta. Las posiciones oficiales están en
chess-results.com, así que una sala de Lichess puede llevar **pizarras**
(`salas_torneo.pizarras`, migración `20260927050207`): el título de la pestaña
(«Femenino», «Masculino») y la dirección del torneo en chess-results. Con
pizarras, la sala de cine muestra esas posiciones, una pestaña por pizarra; sin
pizarras, sigue sumando las partidas (ver «La sala de cine de las
transmisiones»).

- **chess-results no tiene API ni manda CORS**, así que el navegador no le
  puede pedir nada. Las lee la Edge Function **`pizarra-torneo`**
  (`verify_jwt` en true: la llama la página pública con la clave anónima).
- **No es un proxy abierto.** Recibe la clave de una sala, no una dirección, y
  solo lee las pizarras de esa sala si está visible. Y la base exige que sean
  direcciones de chess-results (`interno.pizarras_de_sala_validas()`, que
  rechaza también `chess-results.com.otro-sitio.com`); la función lo vuelve a
  comprobar antes de pedir.
- **Caché de 90 segundos** en `pizarras_cache`, que solo lee el service role
  (ni anon ni authenticated tienen permiso): cien personas mirando la sala no
  son cien pedidos a chess-results. Si chess-results no contesta, se devuelve
  lo último que se leyó y la pizarra lo dice («Sin conexión con chess-results:
  es lo último que se leyó, a las…»). Si no hay nada guardado, dice que no se
  pudo leer: **nunca cae en sumar las mesas de Lichess**, que sería una tabla
  equivocada con cara de buena.
- **Qué se lee:** `art=1` (la clasificación después de la última ronda) con
  `turdet=YES` (si no, un torneo de más de dos semanas pide tocar «Mostrar
  detalles») y `zeilen=99999` (todas las filas). La dirección que cargó
  administración puede ser cualquier página de ese torneo: se toma solo el
  servidor y el número (`tnr…`).
- **Las columnas se leen por el nombre del encabezado**, nunca por posición.
  Comprobado con las páginas reales, pedidas desde la base con `pg_net` (desde
  la sesión de Claude Code no hay salida a chess-results): el UTN-CONARE no
  trae columna «Pts.» — los puntos son el «Des 1», y lo dice la «Anotación» de
  abajo («Desempate 1: points (game-points)») —, y el absoluto trae además
  `n`, `w` y `we` al final. El título (WIM, FM…) va en la columna sin nombre
  antes de «Nombre». Los puntos llegan como «1,5» y se muestran «1½».
- `pg_net` con cabeceras propias (`User-Agent`, `Accept-Language`) recibió
  **400 Bad Request** de chess-results; sin ellas, 200. La función sí manda un
  `User-Agent` de navegador, igual que `chess-results-proxy`, y funciona:
  probado de punta a punta llamándola desde la base con la clave anónima.
- Las medallas de la pizarra salen **solo cuando ya hay puntos**: en la ronda 0
  todos tienen 0, y el orden es el de la lista inicial, no un podio.
- `verificar-pizarra-chess-results.js` (sin navegador) saca `leerClasificacion()`
  y `direcciones()` de la función, les quita los tipos con el propio Node y los
  prueba contra HTML con la forma real y nombres inventados, en la forma de hoy
  y en la vieja (clases sin «n», columna «Pts.»). Tomando los puntos de otra
  columna, salta. `verificar-transmision.js` prueba la pizarra oficial en la
  sala (pestañas, medallas, lo viejo, la función caída) y
  `verificar-salas-torneo.js` el editor.

## La sala se actualiza sola, jugada por jugada

«No se actualiza en vivo», y era cierto por tres lados, ninguno con error a la
vista:

- **La sala abierta antes de la hora no se enteraba nunca de que empezaba.**
  Solo volvía a pedir la ronda si al abrirla ya estaba «en curso», y el torneo
  de Lichess, que es el que dice qué ronda es la de ahora, se pedía una sola
  vez. Ahora una ronda sin partidas todavía se sigue pidiendo (salvo que ya
  haya terminado), y el torneo se vuelve a pedir cada minuto: si la persona no
  eligió una ronda a mano, la sala pasa sola a la que está en curso; si eligió
  una, no se la cambia.
- **Una partida sin jugadas viene de Lichess sin `fen`** (comprobado con la
  ronda 1 del UTN-CONARE, pareada antes de empezar), y el tablero salía vacío.
  Sin `fen` es la posición inicial.
- **Cada 20 segundos no es «en vivo».** Lichess tiene una transmisión continua
  por ronda, `/api/stream/broadcast/round/<id>.pgn`, que manda el PGN de cada
  partida en el momento en que cambia (con `[%clk]` en cada jugada y un
  `GameURL` que termina en el id de la partida). La sala la escucha con
  `fetch` y un lector del cuerpo: cada jugada llega al instante. El PGN se
  reproduce con chess.js (`js/vendor/chess.js`), así que la posición es legal
  de verdad; entre una partida y otra vienen dos renglones vacíos. Si la
  conexión se corta, se vuelve a abrir a los 5 segundos mientras la ronda siga
  en curso. Pedir la ronda entera cada 20 segundos queda de respaldo (una mesa
  nueva, algo perdido), y **no pisa** una partida que la transmisión ya trajo
  más adelantada: se comparan las medias jugadas de las dos posiciones.
- **El reloj de quien juega corre** segundo a segundo, desde su última jugada
  (el `thinkTime` de la ronda o el momento en que llegó la jugada). Antes de la
  primera jugada no corre ninguno: no se sabe cuándo se echó a andar.
- Con cada jugada se redibujan las mesas y los botones de las rondas: **el
  foco se anota antes y se devuelve después**, si no quien navega con Tab lo
  perdía en cada jugada. La pizarra de chess-results no se redibuja con las
  jugadas (no depende de ellas), por lo mismo con sus pestañas.
- `verificar-transmision.js` lo prueba con la transmisión continua doblada: la
  jugada llega sin esperar, el reloj corre, se reabre al cortarse, la ronda
  vacía se sigue pidiendo, la partida sin `fen` y el seguir a la ronda en curso
  (y no hacerlo si se eligió a mano). Sin la transmisión y sin volver a pedir
  la ronda vacía, saltan ocho.

## El comentarista en video

Una sala de Lichess puede llevar el video de quien comenta el torneo en vivo
(`salas_torneo.video_url`, migración `20260927054551`): va en la columna de la
derecha, arriba de la pizarra, como una pantalla chica con el mismo marco que
la grande. Se carga en el editor de `admin.html#torneos`.

- **Solo YouTube y Twitch**, y lo exige la base (un `check` con los dos
  dominios, que rechaza también `youtube.com.otro-sitio.com`): son los dos que
  la CSP deja incrustar (`frame-src`), y son los que usan los canales de
  ajedrez para comentar. El editor lo dice mientras se escribe («✓ Video de
  YouTube: se va a ver en la sala» o que no sirve) y no manda uno que no sirva.
- **Una sola copia de cómo se incrusta**: `js/video-embebido.js`
  (`VideoEmbebido.leer`), que salió de `js/tv.js`, donde la TV ya lo hacía.
  YouTube va por `youtube-nocookie.com` (su modo de privacidad mejorada) y
  Twitch con `parent=` igual al sitio de la página, que Twitch exige.
- El `<iframe>` lleva título («Comentarista en vivo de <sala> (YouTube)»), que
  es lo que anuncia un lector de pantalla.
- **La política de privacidad nombra Twitch** desde el 27 de setiembre de 2026:
  su reproductor se carga desde Twitch, que recibe la dirección IP. La TV ya lo
  incrustaba y no lo decía.
- Con el comentarista arriba, la pizarra dejó de ser `sticky` en computadora:
  una columna pegada más alta que la ventana deja su final fuera de alcance.
- `verificar-transmision.js` comprueba el reproductor de YouTube y el de
  Twitch (dirección y título) y que sin video no haya nada; `verificar-salas-
  torneo.js`, el campo del editor. Sin pintar el comentarista, salta.

## La quiniela de resultados

Quien administra la enciende por sala (casilla «Quiniela de resultados
abierta» en `admin.html#torneos`, `salas_torneo.quiniela`). En la sala de cine
aparece «🎯 Quiniela de resultados»: cualquiera, sin cuenta, se anota con su
nombre y su correo, pronostica cada partida transmitida (ganan blancas,
tablas, ganan negras) y ve la tabla de aciertos. Migración
`20260927060617_quiniela_de_resultados`, Edge Function `quiniela`,
`js/quiniela.js`.

- **Las partidas las copia de Lichess la Edge Function** (`quiniela_partidas`),
  como mucho una vez cada 45 segundos por sala y solo cuando alguien mira o
  pronostica: no hay tanda de pg_cron que mantener. Antes de guardar un
  pronóstico vuelve a copiar si hace falta, así una partida que ya empezó se
  cierra aunque la página no lo sepa.
- **Cuándo se cierra una partida lo decide la base**
  (`quiniela_cerrada()`, usada por `quiniela_pronosticar()`): al llegar la hora
  de su ronda (`startsAt` de Lichess), si ya tiene jugadas o si ya tiene
  resultado. La página muestra lo mismo, pero no decide.
- **La tabla de aciertos se calcula, no se guarda** (`quiniela_tabla()`): un
  punto por acierto, y con los mismos puntos se comparte el puesto. Las
  medallas, solo a quien tiene aciertos.
- **Nadie lee estas tablas desde el navegador**: ni `anon` ni `authenticated`
  tienen permiso, salvo quien administra (política con `soy_admin()`), que ve
  nombre, correo y aciertos en el editor para poder avisarle a quien gane.
  `quiniela_unirse`, `quiniela_pronosticar` y `quiniela_yo` solo las ejecuta
  el service role. La tabla pública la arma la función **sin el correo**.
- **Sin cuenta, con código.** Al anotarse la función devuelve un código al
  azar que se guarda en el navegador (`localStorage`, `quiniela_v1:<clave>`);
  en la base va solo su sha256. Con él se cambian los pronósticos. Un correo
  se anota una vez por sala (índice único): desde otro aparato no se puede
  «volver a entrar» con el mismo correo, a propósito, porque sin un correo de
  confirmación cualquiera podría entrar con el correo de otra persona.
- **El freno de envíos sin cuenta** tiene un tipo nuevo, `quiniela`: 40 por IP
  y por hora (el público de un torneo sale por la red del lugar), 5 por correo
  al día y 500 por sala y por hora. La función le pasa la IP de quien se
  anota. El freno va **antes** de mirar si el correo ya está: probar correos
  de a uno para saber quién juega también gasta cupo.
- **El consentimiento**: casilla con enlace a la política, y la base guarda la
  versión aceptada y la hora (`interno.version_legal_valida`). La política de
  privacidad dice qué se guarda, que el correo no se publica y que los datos
  viven mientras exista la sala (al borrarla se borran con ella).
- Al pronosticar, el botón se desactiva mientras guarda y **pierde el foco**;
  por eso se anota a cuál volver (`volverA`). Lo encontró el verificador.
- Probado en SQL impersonando roles (anónimo, alumno y admin, en una
  transacción deshecha) y de punta a punta contra Lichess llamando a la
  función desde la base. `verificar-quiniela.js` prueba la página y el editor
  con un doble de la función que aplica las mismas reglas y mensajes; sin la
  casilla de la privacidad, salta.

## Los ambientes de la sala

La sala de las transmisiones se puede ver de siete maneras: 🎬 sala de cine
(la de siempre), 🎭 teatro, 🏛️ salón de actos, 🏟️ estadio, 🕰️ club clásico,
🔭 planetario y 🕹️ arcade. Cambian el fondo, la marquesina, los telones (que
en el estadio son la gradería, en el club las bibliotecas y en el planetario
nebulosas), la pantalla, la pizarra (pizarra blanca en el salón, programa de
mano en el teatro, marcador de luces en el estadio, tabla de récords en el
arcade…), el antetítulo y el nombre de la pizarra. Migración
`20260927081958_ambiente_de_la_sala`, `js/escenarios-sala.js`.

- **Quien administra elige con cuál abre cada sala** («Ambiente de la sala»
  en el editor, `salas_torneo.tema`, `cine` por omisión). **Quien mira lo
  puede cambiar** con el selector «Ambiente» de arriba a la derecha; su
  elección se queda en su navegador y para esa sala
  (`localStorage`, `sala_ambiente_v1:<clave>`), como el tablero preferido: es
  de dónde se mira. Si el navegador no deja guardar, se cambia igual.
- **Un ambiente es un juego de variables** `--esc-*` sobre
  `.cine-sala[data-escenario="…"]` en `css/styles.css`; las clases de la sala
  no cambian y el JavaScript solo pone el atributo. Un ambiente nuevo va en
  tres lados: la lista de `js/escenarios-sala.js` (la única, la usan la sala y
  administración), su bloque en el CSS y la restricción de
  `salas_torneo.tema` (una migración). `verificar-escenarios-sala.js`
  comprueba que los tres digan lo mismo.
- **El contraste se mide en los siete.** La sala tiene texto blanco,
  `brand-100/200` y `accent-400` encima: por eso el fondo, la marquesina, la
  pantalla y las cajas son oscuros en todos. La pizarra es la única que puede
  ser clara, y trae sus propios colores de texto, de puntos y del anillo de
  foco (el ámbar no se ve sobre blanco). El verificador lee los colores que
  calculó el navegador y mide cada texto contra cada fondo, con la luz del
  ambiente y un 10 % de blanco más por los adornos; el peor par da 4.74 (el
  `brand-200` en el estadio). Con el tema de la plataforma no cambia nada: sus
  colores tienen la misma luminancia (ver `js/temas-plataforma.js`).
- **`montar()` corre apenas se carga el script**, no en `DOMContentLoaded`:
  la sala puede llegar de la base antes, y montar le pisaba el ambiente de
  administración con el cine. Lo encontró el verificador.
- El enlace «Ver en chess-results» de la pizarra dejó de ponerse blanco al
  pasar el mouse (`hover:text-white`): sobre una pizarra clara desaparecía.

## Retos de ejercicios entre compañeros

Retar a alguien en Competir es jugar una partida, y los dos tienen que estar
conectados a la vez. **«🆚 Retos de ejercicios»** (`reto-ejercicios.html`,
tarjeta del alumno en «Jugar y competir») es un reto que no exige estar a la
vez: los MISMOS 5 ejercicios para los dos, cada uno cuando puede, en una
semana. Gana quien resuelve más y, si empatan, quien tardó menos.

- **Solo entre compañeros**: mismo profesor y misma academia
  (`es_companero()`, que ya cumple «Las academias son privadas»). La lista del
  formulario es la que la RLS de `profiles` ya le da al alumno (los alumnos de
  sus profesores en sus academias), y el insert lo vuelve a exigir en la base.
- **Ninguna posición se inventa**: el reto guarda los **ids** de 5 problemas
  del banco de Ejercicios por tema (`entreno/data/temas.json`, problemas de
  Lichess ya verificados), elegidos al azar dentro de la dificultad (el rating
  de Lichess: fácil hasta 1199, media de 1200 a 1599, difícil de 1600 a 2100).
  La solución no viaja por la base.
- **Se juega dentro de Ejercicios por tema** (`entreno/temas.html?reto=<id>`),
  con su tablero, el cuadro de comandos para contestar escribiendo y el
  mismo final del ejercicio. Un segundo tablero solo para el reto habría sido
  otra copia de lo mismo. En el reto:
  - un intento por ejercicio: la primera jugada equivocada lo termina y se
    dice cuál era la buena;
  - sin pistas, sin reiniciar ni saltar (los botones no están y `giveHint`
    no hace nada);
  - cuenta el tiempo de cada uno;
  - **recargar a mitad de un ejercicio no da otro intento**: al empezarlo se
    anota en el aparato (`reto_ejercicios_en_curso_v1:<id>`) y, al volver,
    cuenta como no resuelto. En otro aparato no se sabe. Es un juego entre
    compañeros, no un examen: cerrar eso del todo pediría que el tablero
    viviera en el servidor, como en los exámenes.
  - Resuelto, cuenta para la racha y los informes como cualquier ejercicio
    (`training_progress`, `theme: 'reto'`, que no es un motivo y no entra al
    tema más flojo).
- **La base** (migraciones `20261004054923` y `20261004055024`):
  `retos_ejercicios` (quién, a quién, nivel, los 5 ids, vence a la semana;
  las fechas las pone el trigger, que también corta a 10 retos por día) y
  `retos_ejercicios_respuestas` (una por ejercicio y alumno: clave primaria,
  no se cambia ni se repite).
  - **Lo del rival no se ve hasta terminar los propios cinco** (o hasta que
    vence): si no, el segundo jugaría sabiendo cuánto le hace falta. La RLS
    de las respuestas deja ver las ajenas solo de los retos que
    `retos_ejercicios_abiertos_para_mi()` da por abiertos. Cuántas lleva el
    otro sí se sabe siempre (`retos_ejercicios_cuantas()`, solo el número),
    para poder decir «Esperando a Bea (2 de 5)».
  - `mis_retos_de_ejercicios()` (SECURITY INVOKER) arma la lista con esos
    números. Quién ganó lo dice `RetoEjercicios.estado()`, una sola vez, para
    la página y para la tarjeta del panel.
  - La política de lectura de `retos_ejercicios` mira sus propias columnas
    (`auth.uid()` es el retador o el rival). La primera versión preguntaba a
    un conjunto armado por una función, que no ve la fila que se está
    insertando, y el insert con RETURNING se rechazaba.
  - Probado impersonando roles, con filas revertidas: se reta a un compañero
    y no a otro alumno; un id que no tiene forma de id del banco y una
    respuesta repetida se rechazan; el rival ve el reto pero no lo que hizo
    el otro hasta terminar los suyos (y después sí); nadie contesta a nombre
    de otro; un alumno ajeno no ve el reto ni puede contestar.
- **La tarjeta avisa**: «Te toca jugar: 2 retos» (con el aro de color), como
  Competir avisa los retos sin contestar. Mirando el panel de otra persona no
  se pide: la función contesta con quien mira.
- Lo prueba `verificar-retos-ejercicios.js`: la elección (5 distintos, en la
  dificultad), quién gana en cada caso, la página (compañeros, estados, el
  insert) y el reto jugado (acierto, un solo intento, sin pistas y la recarga
  que no da otro intento).

## Cuatro juegos que no están en otras plataformas

Se pidieron juegos de ajedrez originales, que no estuvieran ya en Lichess,
Chess.com y compañía. Se hicieron cuatro: Volcanes, Misiones secretas,
Relevo en silencio y La partida perdida. Las ideas que ya existen se
descartaron antes de empezar: «mano y cerebro» (Hand and Brain), el tablero
cilíndrico, las piezas fantasma y el solitario de capturas. La migración es
`20261004050608_juegos_volcanes_misiones_relevo`. **Al tocar cualquiera de
los cuatro, correr `node herramientas/verificar-todo.js juegos-nuevos
misiones-secretas partida-perdida`.** Antes de darlos por buenos se rompió a
propósito cada cosa que miden (la misión que no se cobra, el rótulo del
volcán, el rey expuesto, una posición del banco) y saltaron.

**Jugados de verdad, con el reloj: `verificar-juegos-nuevos-en-vivo.js`.**
Los verificadores de arriba abren cada pantalla sola, sin reloj y con la
base quieta, y la pregunta del dueño fue justo la otra: «¿que el tiempo
corra bien y no haya problemas?». Este abre dos o tres pestañas por partida
contra un servidor de mentira que hace de base y de Realtime para todas, con
las reglas del trigger del reloj y de `relevo_jugar()`, y jugadores
automáticos. Comprueba lo siguiente:

- En Volcanes, el reloj arranca recién con los dos listos.
- Mientras piensa el rival, en la pantalla propia baja SU reloj y el propio
  se queda quieto. Se mide en el texto del reloj, y las dos pantallas dicen
  lo mismo.
- En 30 medias jugadas al azar hay cuatro erupciones, el trigger no rechaza
  nada y ningún reloj sube más que el incremento.
- Las dos pantallas terminan igual que la base, y la planilla, rejugada con
  los volcanes, llega a la posición guardada.
- Con 6 s y sin mover, cae la bandera y la base lo acepta.
- En Misiones, de punta a punta y con reloj: el rival ve el aviso, la
  partida se cobra al volver el turno y se destapan las dos misiones.
- En el relevo, con tres pantallas, cada uno mueve en su turno y ninguna
  jugada se rechaza.

Rompiendo la rotación del relevo en la página, la base rechaza las jugadas y
la prueba salta; apagando los volcanes, también.

### Volcanes

Una modalidad más de `variante.html` (`variant = 'volcanes'`, en
`game_rooms`): es ajedrez normal en la columna `fen`, así que el reloj del
trigger sigue leyendo el turno del segundo campo y todo lo de la sala
(«Estoy listo», la bandera, la escucha que no pierde jugadas) sirve igual.
El motor es `Variantes.Volcanes` (`js/variantes-engines.js`), hijo de
`Ciegas`:

- **Cada 6 medias jugadas hace erupción una casilla y la pieza que esté ahí
  se pierde.** La primera erupción es al llegar a la jugada 10 y se anuncia
  4 medias jugadas antes, así que cada uno tiene dos jugadas para
  quitarse. Cuántas van se lee del FEN (número de jugada y turno), no de la
  planilla.
- Las casillas salen de una lista de 16, sorteada al crear la partida
  (`estadoInicial()` → `variant_state.volcanes`), de las filas 3 a 6. **Los
  dos jugadores pueden leer la lista en la consola**, y está bien así: un
  volcán se anuncia igual, para los dos. Lo único que da es saber antes el
  que sigue, cosa que también se puede calcular con la misma regla.
- **Si en el volcán está un rey, pierde su bando.** Y si la erupción deja
  atacado al rey de quien acaba de mover (le saca la pieza que lo tapaba),
  ese rey queda indefenso: también pierde. Sin esta regla, chess.js quedaba
  en una posición donde el bando que mueve puede «capturar» al rey. Si la
  erupción deja en jaque al que mueve, es un jaque normal.
- **Al quemarse una torre o un rey se borra ese enroque** (`_arreglar()`),
  y también la captura al paso si se quemó el peón. `remove()` de chess.js
  no toca esos campos, y chess.js dejaba enrocar con una torre que ya no
  estaba.
- Las tablas se arman a mano, como en Vampiro: `in_draw()` vuelve a jugar la
  planilla desde la salida y no sabe nada de las piezas quemadas.
- El tablero marca el volcán anunciado (`engine.marca()`): un recuadro rojo
  con «🌋 N» escrito (N es cuántas jugadas faltan) y el rótulo de la casilla
  dice «volcán: hace erupción dentro de N jugadas». Arriba del tablero
  (`#volcan-info`) se dice cuál es y qué se llevó la última erupción. El
  color nunca va solo. El sello es blanco sobre `red-700`: 6,5:1.
- La planilla anota la erupción con la jugada: «d6 🌋e4×P».

### Misiones secretas

Otra modalidad de `variante.html` (`variant = 'misiones'`), ajedrez normal
con un objetivo escondido:

- **La misión no va en `variant_state`**, que el rival puede leer: va en
  `misiones_secretas`, y su RLS solo le muestra a cada jugador la suya
  mientras se juega. La ven también quien le da clase y quien administra.
  Al terminar, ven las dos todos los que ven la partida (la subconsulta a
  `game_rooms` pasa por la RLS de esa tabla). La tabla no tiene política de
  escritura.
- **La reparte la base**: `repartir_misiones(sala)`, la primera vez que
  entra uno de los dos. Sortea dos misiones distintas, las guarda y devuelve
  la de quien llama. Lleva un candado (`pg_advisory_xact_lock`): si los dos
  entran a la vez, sin el candado cada uno sortearía su par y podrían
  quedar con la misma.
- El catálogo es `js/misiones-secretas.js`. Los `id` tienen que ser los
  mismos de la lista de `repartir_misiones()`, y `verificar-misiones-secretas.js`
  lo comprueba: una misión que la base reparte y la página no conoce se ve
  como «—» y no se puede ganar nunca, sin dar ningún error. También revisa
  que ninguna esté cumplida en la posición de salida. Las filas se cuentan
  desde cada bando: la sexta de las negras es la tercera del tablero.
- **Se gana si, al llegar tu turno, tu misión está cumplida.** Es decir, la
  cumpliste con tu jugada y el rival no la deshizo con la suya. Cobra la
  pantalla de quien la cumplió (`revisarMision()`), igual que el mate lo
  escribe quien lo da: pone la partida terminada, con
  `variant_state.fin = { motivo: "mision", … }`. Solo lo hace sobre la
  posición guardada (`.eq("fen")`) y con la partida en juego, para no pisar
  una bandera ni una rendición.
- Cuando tu jugada deja tu misión cumplida, se escribe
  `variant_state.amenaza[tu color] = true`. El rival ve «⚠️ Tu rival tiene
  su misión cumplida: si no la deshaces con esta jugada, gana», sin saber
  cuál es. Esa marca es lo único de la misión que sale de la base.
- El misterio es de la base, no de la pantalla: un alumno con la consola
  abierta no lee la misión del rival. Quien hace trampa con la consola
  puede cobrar una misión que no cumplió, igual que hoy puede escribir un
  mate falso: la legalidad de las jugadas de todas las partidas la mira
  chess.js en el navegador.

### Relevo en silencio

Ajedrez por equipos (de 1 a 4 por bando, al menos 3 en total). Cada
integrante hace una jugada cuando le toca, en el orden de su equipo, y no se
habla: solo hay tres señales (⚔️ Ataca, 🛡️ Defiende, ⚠️ Cuidado). Lo arma
quien da clase o quien administra en `juegos.html` («🤫 Relevo en silencio»)
y se juega en `relevo.html?relevo=<id>`. **No usa `game_rooms`**: su RLS
deja escribir solo a `white_id` y `black_id`, y acá juega un equipo. Tampoco
lleva reloj: con varios por bando, el reloj de un equipo no sería de nadie.

- **Tablas:** `relevos` (la posición y la planilla), `relevo_jugadores`
  (quién, de qué color y en qué orden; con `on delete cascade` a
  `profiles`) y `relevo_senales`. **Ninguna tiene política de escritura**:
  todo pasa por funciones que validan. Las tres llevan
  `verificacion_en_dos_pasos`, y `relevos` y `relevo_senales` están en
  Realtime.
- **A quién le toca lo decide la base.** `relevo_jugar(relevo, fen_antes,
  fen, san, resultado)` rechaza a quien no le toca
  (`interno.relevo_a_quien_le_toca()`: el integrante que sigue del color
  que mueve, contando las jugadas de su equipo) y rechaza la jugada que no
  sale de la posición guardada («La partida ya iba más adelante»). La
  legalidad la mira chess.js en la pantalla, como en las demás partidas.
- **Las señales del equipo rival no llegan a la pantalla** mientras se
  juega: la política de `relevo_senales` las esconde a quien juega en el
  otro color. Quien da clase y quien administra ven las dos, y al terminar
  las ven todos. Es una por persona y por jugada, con un índice único (no
  es un chat).
- **Ver un relevo** es `interno.mis_relevos()`: los relevos donde juega
  quien llama, los que armó, los de sus alumnos (`alumnos_de()`) y, si
  administra, todos. Arma el conjunto una vez y lo usan las tres políticas.
  Además evita la recursión que tendrían `relevos` y `relevo_jugadores` si
  cada política preguntara por la otra tabla.
- `relevo_terminar()`: un integrante rinde a su equipo; quien lo armó (o
  da clase o administra) lo termina con un resultado («si se acabó el
  tiempo de la clase»).
- La sala se escucha con `SalaJuego.suscribir(…, { tabla: "relevos" })`, la
  misma escucha que vuelve a leer la sala al reconectarse. Por eso
  `verificar-realtime-publicadas.js` reconoce ahora la `tabla:` que se le
  pasa a `SalaJuego.suscribir`. Las señales tienen su propio canal, filtrado
  a `relevo_id`.
- Se comprobó en SQL impersonando a cada rol, dentro de una transacción que
  se deshizo: un integrante del otro color no ve las señales (0) y su
  compañero sí (1); nadie juega fuera de turno; una posición vieja se
  rechaza; dos señales en la misma jugada no entran; la rendición da el
  resultado correcto. Lo mismo para las misiones: cada jugador ve 1, el
  profe 2 y, al terminar, el rival 2.

### La partida perdida

Un juego solitario en `partida-perdida.html` (en las tarjetas de Juegos).
Se muestra una posición y cuántas medias jugadas se hicieron para llegar a
ella desde la de salida, y hay que reconstruir la partida. En los libros de
problemas esto se llama «partida justificativa», pero casi ninguna
plataforma lo ofrece como juego con niveles.

- **Ninguna posición se escribió a mano.** `herramientas/partida-perdida-generar.js`
  tiene solo las partidas, y la posición la calcula chess.js jugándolas.
  Genera `js/partida-perdida-banco.js`, que no se edita a mano.
  `verificar-partida-perdida.js` comprueba que el banco esté al día con el
  generador y que cada solución llegue en las jugadas que dice.
- **Cuenta cualquier camino** que deje cada pieza en su casilla en ese
  número exacto de jugadas, no solo el del banco: se compara la colocación
  (la primera parte del FEN). Los enroques posibles no se comparan, para
  que no haya que adivinar algo que no se ve. Cuando no coincide, se dice
  qué casillas cambian.
- Los retos tienen trampas a propósito: perder un tiempo («Ida y vuelta»),
  volver a la posición de salida («Como si nada»), un peón que no es el que
  parece, una coronación en caballo. Van de 2 a 12 jugadas.
- Se juega con los dos colores en el mismo tablero
  (`VarianteBoard` con `ambosColores`) y se puede escribir cada jugada.
  También hay Deshacer, la pista y «Ver una solución».
- Lo resuelto queda en `partida_perdida_resueltos` (localStorage) y viaja
  con la cuenta por `js/progreso-usuario.js`. **No cuenta tiempo ni
  ejercicios en los informes**, a propósito: `training_progress` tiene un
  `check` con la lista de actividades, y el nombre de cada sección de tiempo
  vive también en la Edge Function `informes-encargados`. Sumarla pide una
  migración y desplegar esa función: queda para cuando se quiera.

## Ajedrez 4×8

`ajedrez-4x8.html` (tarjeta en Juegos) es ajedrez en medio tablero: cuatro
columnas (a–d) y las ocho filas. Cada bando tiene torre, rey, dama y caballo
en a1–d1 (y a8–d8) y cuatro peones delante; todo lo demás es ajedrez —el peón
avanza dos, captura al paso y corona; mate, ahogado, triple repetición,
cincuenta jugadas y material insuficiente—, menos el enroque. Se juega contra
la computadora (Fácil, Medio, Difícil) o contra alguien al lado, con reloj o
sin él. Nació como una página suelta que el dueño armó aparte y se trajo al
sitio con sus piezas compartidas.

- **Las reglas viven en `js/ajedrez-4x8-motor.js`**, sin DOM, y se comprueban
  contra chess.js, no contra sí mismas: en un 8×8 con las columnas e–h vacías,
  las jugadas legales que no salen de a–d son exactamente las de este juego
  (una pieza que va de a–d a a–d no pasa por e–h, y sin nada allá nadie da
  jaque desde allá). El verificador juega 400 partidas al azar y compara cada
  posición: jugadas, SAN y jaque. El «#» no se compara: en 8×8 el rey tiene
  escapatorias por la columna e.
- **La partida se presenta como una de chess.js** (`get`, `moves`, `move`,
  `turn`, `in_check`, `history`, `undo`). Con eso el teclado del tablero, el
  recuadro de comandos, la coronación y la posición en palabras son los del
  resto del sitio, sin copias. Las casillas e–h contestan «vacía».
- **`js/tablero-accesible.js` aprendió tableros que no son cuadrados**
  (`columnas: 4`). Deducía el lado con la raíz del número de casillas, y la de
  32 no es entera: las flechas no movían nada, sin ningún error.
- **No guarda nada en la cuenta.** Es un juego del aparato: no hay sala ni
  base, y el reloj se mide con `performance.now()` (el reloj que «no se fía del
  navegador» es el de las salas en línea, donde hay alguien del otro lado). El
  tiempo cuenta como «partidas» (`TIEMPO_ACTIVIDAD`). Sumarlo a
  `training_progress` o a los logros pide una migración por el `check` de
  actividades.
- Contra la computadora, «Deshacer» devuelve también su respuesta; si no, le
  vuelve a tocar y contesta lo mismo al instante. En el celular el reloj y el
  aviso van arriba del tablero, que es el doble de alto que de ancho y los
  tapaba.

**Al tocar el motor o la página, correr `node herramientas/verificar-todo.js
ajedrez-4x8`.** Está probado que falla de verdad: quitando la captura al paso
saltan dos comprobaciones, y montando el tablero sin `columnas: 4`, las dos de
las flechas.

## Pareo Integral

`pareo.html`: el emparejador público de torneos. Cualquiera arma su torneo sin
cuenta —jugadores, rondas, resultados, clasificación con desempates, tabla
cruzada y el TRF para FIDE— con el **Sistema Holandés de FIDE** (C.04.3,
versión vigente desde el 1 de febrero de 2026) o un todos contra todos con
las tablas de Berger. Se pidió «que cumpla con todas las reglas de la FIDE
para ser avalado»: el aval lo tramita el dueño del sitio por su cuenta; esto
deja el programa listo para pedirlo. No es el torneo de la Academia
(`torneo.html`, con `js/torneo-engine.js`), que sigue siendo un suizo
simplificado para grupos de clase y no se tocó.

### El Holandés no se reescribe: es bbpPairings, compilado

- **El motor es bbpPairings** (Jeremy Bierema, Apache 2.0), el que usan
  programas avalados por FIDE, compilado a WebAssembly con
  `herramientas/pareo-motor-compilar.sh` (Emscripten; el commit está fijado en
  el script). Lo que queda en `js/vendor/bbppairings/` no se edita: se vuelve a
  compilar. Escribir el Holandés a mano era meses de trabajo y un emparejamiento
  mal hecho no da ningún error: se ve igual de prolijo que uno bueno.
- **Pareo Integral no empareja: arma el TRF, se lo pasa y lee la respuesta**
  (`js/pareo/torneo.js`, `aTrf()` / `leerPareo()`). La ronda que viene va en el
  mismo TRF con quien no juega marcado (`0000 - H`, `Z` o `F`); bbpPairings
  devuelve las mesas ya en el orden de FIDE (incluido el bye del pareo, al final).
- **Corre en un Worker** (`js/pareo/motor-worker.js`) y **una instancia nueva
  por pedido**: `main()` lee y escribe archivos y deja estado. El `.wasm` se
  compila una sola vez y cada pedido solo lo instancia. La CSP ya tenía
  `'wasm-unsafe-eval'` y `worker-src 'self'`.
- **Burstein queda compilado pero nunca se pide**: `-DOMIT_BURSTEIN` no compila
  en ese commit, y FIDE no avaló esa parte de bbpPairings. La página solo usa
  `--dutch`.
- **Los tres servicios que FIDE pide a un programa avalado están en la
  página** (ficha «Archivos y comprobador»): el TRF de entrada y salida, el
  comprobador público (FPC: vuelve a emparejar cada ronda y dice si coincide)
  y el generador de torneos al azar (RTG). Y la interfaz en inglés (botón
  «English»; los textos en `js/pareo/textos.js`, los dos idiomas por clave).
- **Ojo con el generador**: con la misma semilla NO da el mismo torneo que el
  bbpPairings nativo, porque el azar de la librería de C++ de Emscripten
  (libc++) no es el de GCC. Los emparejamientos sí son los mismos: en 300
  torneos el comprobador nativo dio por buenos todos los del WebAssembly y al
  revés. Si FIDE compara semillas en la prueba de aval, hay que usar el
  generador de la página para las dos cosas, o el nativo para las dos.

### El torneo y el TRF

- **Los números de emparejamiento quedan fijos al emparejar la ronda 1**
  (`numeracion`), por Elo, título y nombre (C.04.2). Quien se inscribe tarde se
  intercala donde le toca sin mover el orden de los demás; en las rondas que
  no jugó cuenta como ausente con 0 (el árbitro lo cambia a bye si
  corresponde). Al importar un TRF se respeta su numeración, aunque no sea la
  de Elo (`numeracionDeArchivo`: deshacer la ronda 1 no la borra).
- **Lo que se lee de un TRF tiene que volver a escribirse igual**, y el
  verificador lo comprueba con el comprobador. Dos cosas que se encontraron así:
  sin línea `142` (bbpPairings no la escribe si ya se jugaron todas) el torneo
  tiene las rondas que trae, no 7; y sin línea `152`, el color inicial se
  deduce como lo hace bbpPairings (el de la ronda 1 del primero por número que
  la jugó, al revés si no es el primero). Antes se asumía blancas y el TRF
  reescrito tenía la ronda 1 al revés.
- Los códigos de cabecera son los del TRF-2026 que lee bbpPairings (`142`
  rondas, `152` color inicial, `162` puntos si no son 1-½-0, `192`
  `FIDE_DUTCH_2026` o `_BAKU`). No se pudo leer la especificación de FIDE
  (handbook.fide.com está bloqueado desde las sesiones): **antes de mandar un
  TRF de Pareo Integral al servidor de Elo de FIDE, probarlo**.
- Cambiar un resultado de una ronda vieja no vuelve a emparejar las
  siguientes (la página lo avisa). Deshacer el emparejamiento solo se puede en
  la última ronda, y al volver a emparejarla sale la misma.

### Los desempates: C.07:2026, traducido de chesspairing y comparado con él

- `js/pareo/desempates.js` es la traducción de `chesspairing` (Gert Nutterts,
  Apache 2.0, paquete `tiebreaker`), que sigue el C.07:2026 artículo por
  artículo. Lo difícil son las **rondas no jugadas** (artículos 15 y 16): cada
  ronda de cada jugador lleva su categoría (bye del pareo o de punto entero,
  incomparecencia ganada o perdida, bye pedido con partidas después o al
  final), cuentan contra un rival ficticio con el puntaje del jugador **con el
  tope del 16.4**, y el corte del peor (16.5) se lleva primero una ronda no
  jugada voluntaria. Son 26 desempates (BH y sus cortes, SB, DE, WIN, WON,
  BPG, BWG, GE, PS, KS, STD, ARO, TPR, PTP, FB, AOB, APRO, APPO, AFB).
- **Se comparó contra chesspairing (en Go) en 300 torneos al azar: 131 144
  valores, cero diferencias.** Ese cruce se corre fuera del repositorio (Go no
  está en el CI); lo que queda en `herramientas/datos/pareo-desempates.json`
  son los casos del C.07:2026 que trae chesspairing (62 valores de FIDE) y 60
  torneos al azar con los valores de chesspairing, que el CI compara siempre.
  Está probado que discrimina: quitando la regla del corte del 16.5 y la del
  bye pedido seguido de partidas saltaron 24 862 diferencias.
- Los ejercicios de desempate de FIDE de 2023 (los de Mario Held) **no** se
  usan: son de la versión 2023, sin el tope del rival ficticio.
- El Elo de un rival sin Elo cuenta como 0 en ARO, TPR y compañía: la ayuda de
  la página pide el Elo de todos para usarlos.

### Nada sale del navegador

El torneo vive en `localStorage` (`pareo_lista_v1`, `pareo_torneo_v1_<id>`) y
en los archivos que baja quien organiza (`.json` y TRF). No hay cuenta, ni
base, ni consentimiento que pedir: los datos de los jugadores no salen de la
computadora (el verificador lo comprueba: ni una petición a otro origen). **El
día que se publique un torneo en línea** (emparejamientos y resultados con un
enlace), eso cambia entero: tabla con su RLS (lectura pública, escritura solo
de quien organiza), la casilla de consentimiento y su mención en
`privacidad.html`.

### El manual y la línea de comandos

- **`pareo-manual.html`**: el manual entero en español y en inglés en la misma
  página (`js/pareo/manual.js` muestra uno; recuerda el idioma de
  `pareo.html`, y `?lang=en` lo abre en inglés: ese es el enlace para FIDE).
  Explica los 26 desempates; el verificador falla si el catálogo de
  `desempates.js` gana uno que el manual no explica, en cualquiera de los dos
  idiomas.
- **La línea de comandos** (`js/pareo/cli.js`, para bajar en
  `descargas/pareo-integral-cli.zip`): los probadores de FIDE corren miles de
  torneos del generador y del comprobador en lote, y eso en la página se hace
  de a uno. Usa la sintaxis de JaVaFo / bbpPairings (`--dutch … -p`, `-c`,
  `-g -o -s`) más `standings` con los desempates. Corre el mismo `.wasm` y los
  mismos `torneo.js` y `desempates.js` que la página: no hay una segunda copia
  que se pueda desfasar. Los mensajes van en inglés y en español.
- **El zip lo arma `herramientas/pareo-cli-empaquetar.py`** (fechas y orden
  fijos) y no se edita a mano. `verificar-pareo-cli.py` compara el CONTENIDO de
  cada archivo del zip con el del repositorio —no los bytes del zip: la
  compresión puede cambiar con la versión de zlib del CI—, así que tocar
  `js/pareo/` sin volver a empaquetar hace fallar el CI. Después lo
  descomprime y lo corre: empareja las pruebas de bbpPairings, genera, comprueba
  y saca la clasificación con los mismos números que `desempates.js`.

### Dónde se entra: las herramientas de arbitraje

- **En la vitrina de las herramientas de arbitraje** (`herramientas-arbitraje.html`,
  ver «Herramientas de arbitraje»), gratis y sin candado: `js/herramientas-arbitraje.js`
  la lista con `gratis: true`. El Espacio de consultas, arriba, tampoco lleva
  licencia, pero no es parte de la lista.
- En el panel de la Academia, el grupo **«Herramientas de arbitraje»**
  (`js/clases.js`, `soloDocente`: al alumnado el grupo le queda vacío y no se
  pinta) y el mismo grupo en el de quien administra (`js/paginas-admin.js`,
  sección Contenido de `admin.html`): Pareo Integral y la vitrina. Ctrl + K los
  encuentra por «emparejar», «suizo», «buchholz», «trf», «árbitro», «licencia»…
- Para el público: además de la vitrina, la sección «Herramientas de arbitraje»
  del examen de arbitraje (`nivel-de-arbitraje.html`), la tarjeta «Para quienes
  arbitran» de la portada y la página de Torneos.

### Lo que falta para pedir el aval

Lo que pide el C.04.A (programa, interfaz en inglés, TRF, FPC y RTG públicos)
está, con el manual en inglés y la línea de comandos para probarlo en lote.
Falta lo que no es código: el formulario FE-1 y las pruebas de FIDE en su
entorno, y que el árbitro del sitio lo pruebe con torneos reales (sus TRF de
Swiss-Manager se abren en la ficha «Archivos»). Mientras no haya aval, la
página dice que no lo tiene.

**Al tocar `js/pareo/`, el motor, `pareo.html` o `pareo-manual.html`, correr
`python3 herramientas/pareo-cli-empaquetar.py` y
`node herramientas/verificar-todo.js pareo pareo-pagina pareo-cli`.** `pareo` (sin
navegador): el motor contra las pruebas del propio bbpPairings, el generador y
el comprobador (que marca una mesa con los colores al revés), 60 torneos de
Pareo Integral con byes, retiros, inscripciones tardías e incomparecencias
que el comprobador da por buenos y cuyo TRF se lee y se vuelve a escribir
igual, las tablas de Berger y los desempates. `pareo-pagina`: un suizo y un
todos contra todos de punta a punta en la página, el inglés, recargar, y que
nada salga del sitio. Está probado que fallan de verdad: con los colores de una
ronda al revés en el TRF salta `pareo`, y sin guardar después de emparejar,
`pareo-pagina`.

## Ajedrez estudiantil en Costa Rica: los torneos de chess-results

`ajedrez-estudiantil.html` es una página pública con la participación en los
torneos estudiantiles de Costa Rica publicados en chess-results.com: los Juegos
Deportivos Estudiantiles (JDE) del MEP por año, etapa, región y categoría, y
los internacionales (CODICADER y escolares de la federación). Se enlaza desde
`articulos.html` (categoría «Datos»).

- **De dónde salen los datos.** chess-results no tiene API y desde una sesión
  de Claude Code no hay salida al sitio, así que la búsqueda se hizo desde la
  base con `pg_net` (como las pizarras; ver «Las posiciones oficiales vienen
  de chess-results»). El buscador de torneos (`TurnierSuche.aspx`) es un
  formulario ASP.NET que se manda por POST con su `__VIEWSTATE`, y
  `net.http_post` solo acepta `application/json`: el pedido se puso directo en
  `net.http_request_queue` con su cuerpo `application/x-www-form-urlencoded`.
  Además, `chess-results.com` redirige a un servidor (`s2`, `s3`…) y la
  redirección convierte el POST en GET: hay que pedirle el formulario y
  mandarlo **al mismo servidor** (`s3.chess-results.com`). El filtro de fechas
  del buscador se ignoró en las pruebas, así que se buscó por palabras del
  nombre, con federación CRC: JDE, estudiant, Juegos, CODICADER, colegial,
  escolar, nacional, regional, eliminatoria, etapa y circuit.
- **El buscador corta en 1000 filas aunque se le pidan 2000, sin avisar.** La
  búsqueda de «regional» dio exactamente 1000 y se tomó por completa: faltaron
  260 torneos de los JDE de 2017 a 2026 (toda la etapa regional 2025 de Pérez
  Zeledón, Los Santos y Santa Cruz; la de 2026 de San Carlos, Turrialba,
  Aguirre, Desamparados y Grande de Térraba…). Lo vio el dueño: Pérez Zeledón
  2025 decía 36 participaciones y eran 260. Se completó partiendo la búsqueda
  hasta que ninguna parte llegara a 1000: «regional» por tipo de torneo (suizo
  285, round robin 398, liga por equipos 299, suizo por equipos 18) y por
  ritmo, y el organizador «Regional», «DRE», «Circuito», «MEP» y «Supervis»
  (ordenar distinto NO sirve: devuelve los mismos 1000). **Una búsqueda que
  da justo 1000 no está completa.** Con eso las reglas también crecieron:
  «Inter-regional» con guion, «Eliminatoria Regional San Carlos», un nombre
  que empieza con «Regional» aunque no diga «JDE» ni tenga organizador
  («➡️ Regional Turrialba - …»), la letra pegada a la región («Regional San
  José CentralA Abierto»), Desamparados antes que San José (la subió la
  regional de San José Central), «sula» solo como palabra (dentro de
  «Peninsular» la tomaba por Grande de Térraba), y fuera los amistosos,
  fogueos, recreativos, el cuadrangular final (repite a los de sus grupos) y
  el torneo de profesores. Cinco torneos de Térraba 2026 estaban subidos dos
  veces (mismo nombre, día e inscritos): quedó el último.
- **La fuente es `herramientas/datos/ajedrez-estudiantil-torneos.csv`**, un
  torneo por fila ya clasificado (la búsqueda inicial; lo nuevo lo suma el
  flujo de abajo). `herramientas/ajedrez-estudiantil.py` lo
  pasa a `data/ajedrez-estudiantil.json` sin el organizador (a veces es el
  nombre de una persona, y la página no lo usa) y falla si una etapa o una
  categoría no es válida. El JSON no se edita a mano.
- **Qué entra y qué no.** Entran los torneos de los JDE (cualquier etapa), los
  CODICADER, los escolares internacionales de la federación y unos pocos
  estudiantiles fuera de los JDE. Quedan fuera los Juegos Deportivos
  Nacionales del ICODER (JDN), los juegos comunales, distritales y laborales y
  los torneos privados de colegios. Cinco torneos de la DRE de Coto en 2026 se
  llaman «JDN» pero son de los JDE (categorías A y B, los organiza la DRE). El
  «Campeonato Nacional Estudiantil 2008» figura con federación Costa Rica pero
  se jugó en Ecuador, y quedó fuera: **la federación de chess-results no
  garantiza el país**.
- **Las etapas** salen del nombre: institucional o circuital, regional,
  interregional y nacional. Los años de algunos torneos de 2013 vienen como
  1913; el año se toma del nombre cuando la fecha no tiene sentido.
- **La categoría (A a E)** sale del nombre, con varias formas («Categoría B»,
  «Individual Absoluto C», «JDEB», «Sula C», `"D`…). El buscador da los
  nombres cortados a 50 letras: en 167 torneos la letra quedaba fuera y se
  leyó el título completo de cada uno (`<h2>` de su página). Algunos la traen
  en clave: «2025 AIO» es categoría A, individual, abierto. Seis no la dicen
  y quedan como «Sin dato». Antes de 2013 las letras pueden no ser las mismas
  edades que hoy.
- **La región** sale del nombre, el organizador o el lugar, con una lista de
  direcciones regionales; un interregional cuenta para la primera que se
  reconoce (el «Interregional Los Santos-Turrialba-Cartago» queda en Cartago).
  La final nacional no tiene región.
- **«Participaciones» no son personas**: es la suma de inscritos de los
  torneos de ritmo clásico, individuales y por equipos (en chess-results, la
  columna `n` de un torneo por equipos cuenta jugadores, no equipos:
  comprobado con uno real, 12 colegios y 50 jugadores). Un estudiante cuenta
  una vez por etapa y por modalidad. Los blitz y rápidos no se suman porque
  repiten a los del clásico.
- **Lo que hay que decir junto a los números.** El salto desde 2023 es en
  buena parte de registro: las regiones que publican su eliminatoria en
  chess-results pasaron de 7 en 2023 a 24 en 2026. Y la final nacional alterna categorías (B y
  C en años impares, B y D en pares), así que comparar años de una categoría
  mezcla años con final y sin ella: la página lo avisa en la frase de arriba
  cuando pasa.
- **La página cuenta todo en el navegador** (`js/ajedrez-estudiantil.js`):
  son las filas fijas de un archivo del sitio, no una tabla de la base. Los
  gráficos son SVG escritos a mano (el sitio no carga librerías de gráficos);
  cada año es un botón que se alcanza con Tab y dice su valor, y el gráfico
  grande tiene su tabla. Los filtros van en la dirección
  (`?region=Cartago&categoria=D`) para compartir una vista. Los colores de las
  etapas están medidos en `css/styles.css` y cada etapa va también escrita.
- **Se pone al día sola, cada seis horas**
  (`.github/workflows/ajedrez-estudiantil.yml`). Chess-results no avisa cuando
  se publica algo, así que se revisa: `herramientas/ajedrez-estudiantil-actualizar.py`
  hace UNA búsqueda, los 250 torneos de Costa Rica tocados más recientemente
  (orden «Última actualización»), que trae fechas, lugar, rondas e inscritos
  de cada uno. Un torneo que ya estaba se pone al día (inscritos, rondas,
  fecha; el lugar no, porque los primeros se guardaron cortados a 40 letras y
  saldrían como «cambio» cada vez). Uno nuevo se clasifica con
  `herramientas/ajedrez_estudiantil_reglas.py` y se suma si es estudiantil;
  si su nombre llega cortado (≥ 45 letras) y tiene pistas de ser estudiantil,
  antes se lee su título completo en su página, porque la categoría suele
  estar al final. Los cortados sin pistas no se piden: cien páginas por
  revisión sería abusar del sitio.
- **El flujo no escribe en `main` directo**: abre un PR desde
  `datos/ajedrez-estudiantil-…`, le pide «Verificar» a mano (un PR que abre el
  `GITHUB_TOKEN` no dispara otros flujos solo; `workflow_dispatch` sí) y solo
  si pasa lo mergea. Si falla, el PR queda abierto y el flujo no abre otro
  hasta que alguien lo cierre. Necesita que el repositorio deje a Actions
  crear PR (Settings → Actions → General → «Allow GitHub Actions to create
  and approve pull requests»); sin eso, el paso de abrir el PR falla y GitHub
  avisa por correo. La fecha que dice la página
  (`herramientas/datos/ajedrez-estudiantil-actualizado.txt`) cambia solo
  cuando hubo algo nuevo, para no abrir un PR cada seis horas por nada.
- **Las reglas son una sola copia** (`ajedrez_estudiantil_reglas.py`), y
  `verificar-ajedrez-estudiantil-reglas.py` comprueba que clasifiquen los
  torneos guardados exactamente como están: una regla que cambie desordenaría
  lo viejo sin avisar. Para que eso valga, los 167 torneos de nombre cortado
  guardan su título completo (con él, además, salieron 28 torneos por
  equipos que se contaban como individuales y un interregional que figuraba
  como regional). El mismo verificador prueba el actualizador con muestras de
  las páginas reales de chess-results (`herramientas/datos/ajedrez-estudiantil-muestras/`,
  en `.txt` para que los generadores del sitio no las tomen por páginas).
  Probado también con una respuesta real del 8/10/2026: leyó las 250 filas y
  encontró 25 eliminatorias de 2026 que la búsqueda por palabras no había
  traído («Regional Heredia …», «Eliminatoria Inter regional …_Puriscal»).
- `verificar-ajedrez-estudiantil.js` cuenta las participaciones directo del
  CSV, por otro camino que la página, y las compara con lo que se pinta: sin
  filtros, con una región, con una categoría y con las dos; además, los
  filtros en la dirección, el aviso de la final, el teclado, el celular a
  400 px, el modo oscuro y la página sin datos. Sumando también los blitz, o
  sin filtrar la tabla por región, salta.

## Historial del jugador y estadísticas por colegio

Dos herramientas gratis y públicas, hechas con los mismos torneos de
«Ajedrez estudiantil en Costa Rica» (lo pidió el dueño del sitio: gratis, como
esa): `historial-jugador.html` (todos los torneos estudiantiles de una persona,
año tras año) y `estadisticas-colegios.html` (cada colegio o escuela en los
JDE: estudiantes, podios y finalistas, y la comparación por región). Están en
la vitrina de Herramientas con `gratis: true`.

- **De dónde salen.** `herramientas/ajedrez-estudiantil-jugadores.py` lee de
  chess-results la clasificación de cada torneo del CSV: en uno individual,
  `art=1` (puesto, nombre, Elo, «Club/Ciudad» y puntos); en uno por equipos,
  `art=0` (la clasificación de los equipos) y `art=16` (los jugadores con su
  equipo; no `art=4`, que trae solo a quien jugó: ver «Herramientas de
  arbitraje»). Lo corre el mismo flujo de cada seis horas, después del
  actualizador, con un tope de 100 torneos por vuelta y un segundo entre
  pedido y pedido. Relee lo que cambió de inscritos o de rondas y lo que no
  había terminado si empezó hace menos de 60 días. La primera lectura completa
  se hizo con un flujo temporal en la rama del PR (borrado antes de mergear).
- **Los puntos no se adivinan.** Muchas clasificaciones de los JDE no traen
  «Pts.»: los puntos son el desempate que la anotación llama «points
  (game-points)», casi siempre el primero. Si no está ninguno de los dos,
  quedan en blanco. Los «Des» se leen por su número en la anotación, no por la
  posición.
- **Un torneo «individual» que es por equipos.** La modalidad del CSV sale del
  nombre, y muchos llegan cortados sin «Equipos» («JDE Interregional | Esparza
  | Categoría D Abierto por Equipos»): su `art=1` no es una clasificación sino
  el «Orden de fuerza de los equipos», y en la primera lectura 127 torneos
  salieron sin jugadores. Si un «individual» no trae clasificación, se lee
  como por equipos; y la página trata como por equipos a todo torneo que
  tenga clasificación de equipos, así el puesto del equipo no cuenta como
  podio individual de cada uno. La lista de torneos no se cambia (sus reglas
  se comprueban contra lo guardado).
- **Un torneo «por equipos» que no lo es.** Algunos torneos del CSV dicen
  «Equipos» y su `art=0` no trae clasificación de equipos (los CODICADER de
  2009, donde el «Equipo» es el país): se leen como individuales.
- **Los archivos.** `herramientas/datos/ajedrez-estudiantil-jugadores.csv`,
  `-equipos.csv` y `-leidos.csv` (qué se leyó, cuándo y si estaba terminado)
  son la fuente; `herramientas/ajedrez-estudiantil.py` arma con ellos
  `data/ajedrez-estudiantil-jugadores.json` (el JSON no se edita a mano). El
  JSON de los torneos ganó la columna `rondas`, para decir «3,5 de 5».
- **Una persona es su nombre.** Sin tildes, mayúsculas, comas ni espacios de
  más: «SOLANO MORA, ANA LUCIA» y «Solano Mora, Ana Lucía» son la misma.
  chess-results no da otra cosa que sirva en todos los torneos (el código
  nacional falta casi siempre, y en la selección se vio que un código «0»
  juntaba a 18 personas). Un nombre escrito distinto queda partido en dos, y
  dos estudiantes que se llaman igual quedan juntos: las dos páginas lo dicen.
- **Un colegio es su nombre, con las abreviaturas juntas.** «C.T.P.», «CTP» y
  «Colegio Técnico Profesional» son lo mismo; también «L.R.» y «Liceo Rural»,
  «U.P.» y «Unidad Pedagógica», «Esc.» y «Escuela», «St.» y «Saint».
  chess-results corta la columna a unas 35 letras («Colegio Teresiano San
  Enrique de Os»): un nombre de 30 letras o más que es el comienzo de UNO SOLO
  de los otros se junta con ese. El «de» suelto no cuenta («CTP de Santa
  Elena» y «CTP Santa Elena»), ni los espacios («Anglo Americano» y
  «Angloamericano», queda la forma más usada). Un nombre sin tipo se junta con
  el que lo lleva («Pacto del Jocote» con «Escuela Pacto del Jocote») solo si
  hay UNA forma con tipo: con «Escuela Lepanto» y «Colegio Lepanto» a la vez,
  «Lepanto» queda solo, porque pueden ser dos instituciones (con los datos
  reales, unos 250 nombres menos). Lo demás se junta a mano en
  `herramientas/datos/ajedrez-estudiantil-instituciones.csv` («variante,nombre»).
  «CRC», «Costa Rica», un número o la celda vacía no son un colegio. El nombre
  que se muestra es la variante más usada que no viene toda en mayúsculas.
- **Qué cuenta en las estadísticas**: solo los torneos de ritmo clásico de las
  cuatro etapas de los JDE, como las participaciones de la otra página (los
  blitz y rápidos repiten a los mismos estudiantes). Un podio es un 1.º, 2.º o
  3.º, individual o del equipo; los «regionales» suman las etapas
  institucional, regional e interregional. La región de un colegio es la de la
  mayoría de sus torneos de los JDE (la final no tiene región). El historial,
  en cambio, trae todos los torneos de la persona, también los blitz y los
  internacionales.
- **Datos de menores.** Los nombres, los colegios y los resultados ya son
  públicos en chess-results; aquí no se agrega nada que no esté allá (ni
  fechas de nacimiento ni códigos, que la selección guarda solo para el
  service role). Lo que sí agrega es juntarlos, así que las dos páginas
  ofrecen quitar un nombre: se anota en
  `herramientas/datos/ajedrez-estudiantil-excluidos.txt` y se vuelve a correr
  `ajedrez-estudiantil.py`; sale del historial y de las cuentas de su colegio
  como estudiante (su equipo sigue contando).
- **Las páginas cuentan en el navegador** (`js/jde-datos.js`, compartido por
  `js/historial-jugador.js` y `js/estadisticas-colegios.js`), como la de los
  torneos: es un archivo fijo, no una tabla de la base. Todo nombre va por
  `textContent`. La persona (`?j=`), la institución (`?i=`) y los filtros van
  en la dirección. Los gráficos son SVG a mano con los colores de etapa de la
  otra página y la etapa siempre escrita; cada gráfico tiene su texto para el
  lector de pantalla y sus datos en una tabla.

`verificar-ajedrez-estudiantil-reglas.py` prueba el lector con muestras de la
forma real y nombres inventados (`clasificacion.txt`,
`clasificacion-en-juego.txt`, `equipos.txt`, `equipos-jugadores.txt`), qué se
lee en cada vuelta y el armado (personas, colegios, cortados, variantes,
excluidos). `verificar-jde-jugadores.js` abre las dos páginas con datos
inventados y compara cada cifra con la cuenta hecha a mano; contando también
el blitz, o pintando un nombre con `innerHTML`, salta.

## Herramientas de arbitraje

`herramientas-arbitraje.html` es la vitrina pública de las herramientas para
árbitros, asesores y profesores: qué hace cada una, con su candado. Se usan con
una **licencia** que genera quien administra en `licencias.html` (lo pidió el
dueño del sitio: las herramientas se venden). La lista de herramientas vive en
`js/herramientas-arbitraje.js` (la usan la vitrina y la administración); una
con `disponible: false` sale como «Próximamente», sin enlace. Hoy están
abiertas con licencia la **selección por parámetros** (`seleccion-codicader.html`),
los **desempates explicados** (`desempates.html`, ver «Desempates explicados») y
los **resultados JDN por comité** (`jdn-comites.html`, ver «Resultados JDN por
comité»).
**Pareo Integral** (`pareo.html`, ver «Pareo Integral») está en la vitrina con
`gratis: true`: el dueño lo pidió público y para quien lo necesite, así que sale
abierto para todos, sin sesión ni candado, con «Abrir» y «Manual de uso»; la
vitrina no le pregunta `tengo_herramienta()` y `licencias.html` no lo ofrece
(no hay licencia que vender de algo gratis).

También son gratis el **historial de un jugador** y las **estadísticas por
colegio y región** (ver «Historial del jugador y estadísticas por colegio»), y
**«Ajedrez estudiantil en Costa Rica»**
(`ajedrez-estudiantil.html`; lo pidió el dueño del sitio: gratis y pública,
como era). La página sigue siendo pública por sí misma: no tiene candado que
abrir.

Se llega desde el menú de arriba de las páginas públicas (la barra chica, después
de «Torneos», y el menú del celular) y desde «Recursos» en el pie: lo pidió el
dueño para que se vea lo que se vende. Las páginas de la Academia no lo llevan
(no tienen menú; ver «Dentro de la Academia no hay encabezado de marketing»).

**Para la gente se llaman solo «Herramientas»** (el menú, el pie, el título y
los textos): así lo pidió el dueño, porque no todas son de arbitraje. La
dirección (`herramientas-arbitraje.html`), los archivos y esta sección
conservan el nombre de antes, para no romper enlaces ya compartidos.

**Las licencias** (`licencias_herramientas`, migración `20261008193213`):

- Un código `AI-XXXX-XXXX-XXXX` para una herramienta o para «todas», con sus
  días de vigencia (o sin vencimiento) y una nota de a quién se le vendió.
  Quien administra lo entrega y la persona lo activa con su cuenta en la
  vitrina (`canjear_licencia()`): desde ese momento corren los días. También
  se puede generar ya puesta en una cuenta.
- Un código sirve para una sola cuenta: el mismo dueño lo puede volver a
  canjear sin que cambie nada; otra cuenta recibe «ya la activó otra cuenta».
- **Quien administra tiene todas las herramientas sin licencia** y controla
  todas las licencias: anular y reactivar, cambiar el vencimiento, soltarla de
  la cuenta (queda libre, con sus días completos) y borrarla.
- La tabla reparte acceso: no tiene política de escritura (la escriben
  `licencias_generar()`, `licencias_cambiar()` y `canjear_licencia()`) y lleva
  el trigger de la bitácora (`VIGILADAS` de `verificar-auditoria.js`). Cada
  quien lee solo las suyas; `licencias_admin()` le da a administración la
  lista con el nombre y el correo de quien tiene cada una.
- Comprobado impersonando roles en SQL (y deshecho al final): administración
  tiene la herramienta; un profesor sin licencia no, ni puede generar, ver la
  lista ni insertar directo; al canjear, sí; otra cuenta no puede canjear el
  mismo código; al anularla, la pierde; cada cambio queda en la bitácora.

**El candado está en el servidor.** La página pregunta `tengo_herramienta()`
solo para decidir qué pinta; lo que no se puede saltar es la Edge Function
**`seleccion-chess-results`**, que antes de pedir nada a chess-results llama a
`tengo_herramienta()` **con el token de quien llama** (clave anónima + su
`Authorization`), no con la de servicio: así pasa por
`antes_de_cada_pedido()` y la verificación en dos pasos la exige la base,
como en cualquier página.

**La selección por parámetros** aplica el procedimiento del ICODER para la
delegación CODICADER 2026 (ajedrez, nivel secundaria): cinco hombres y cinco
mujeres por la suma de cuatro parámetros de 20 a 1 — A, el lugar en la Etapa
Nacional (en equipos, el del equipo con al menos el 40 % de las rondas sobre
el tablero); B, el rendimiento `(puntos ÷ partidas) × Elo nacional promedio
de los rivales`, con al menos 3 partidas; C, el Elo nacional; D, el Elo FIDE
de cada ritmo —, con clásico y blitz promediados, empates prorrateados y el
desempate por C y luego por edad. El cálculo es `js/seleccion-calculo.js`.

- **Por qué la Edge Function lee el torneo entero.** chess-results no tiene
  API ni CORS, y el año de nacimiento solo sale en la ficha de cada jugador
  (`art=9&snr=N`): un torneo de 53 jugadores son 55 páginas. La función las
  pide de a ocho y devuelve el torneo listo; lo guarda un minuto en
  `seleccion_cache` (solo el service role: trae años de nacimiento de menores).
- **Las páginas que se leen**, comprobadas con los ocho torneos de la Etapa
  Nacional JDE 2026, categoría D: `art=0` (individual: la lista inicial;
  equipos: la clasificación de equipos), `art=1` (la clasificación
  individual), `art=16` (los jugadores de equipos con su equipo) y la ficha.
  **No `art=4`**: trae solo a quien jugó alguna partida (en el femenino blitz,
  29 de 30). La celda «Res.» de la ficha trae otra tabla adentro: las celdas se
  leen contando aperturas y cierres. Un todos contra todos por equipos dice
  «Cuadro cruzado» y no la ronda: las rondas jugadas salen de las partidas.
- **Comprobado con los datos reales**: leyendo esas páginas, el cálculo dio la
  misma selección colegial 2026 que el cálculo hecho a mano, número por
  número. Ahí apareció un error que no se veía: chess-results pone «0» como
  código nacional de quien no tiene, y la unión por código juntaba a 18
  personas en una. Un código en cero no cuenta.
- **Lo que el procedimiento no dice y se decidió**: las escalas de B, C y D se
  reparten dentro de cada rama y solo entre quienes cumplen la edad (con todos,
  la selección 2026 no cambia); el rival sin Elo nacional cuenta 1400; **las
  mujeres que juegan en un absoluto se calculan solo en la rama femenina** (lo
  pidió el dueño del sitio). chess-results no dice el sexo: es mujer quien
  jugó un torneo femenino de la selección o a quien el árbitro marcó; los
  nombres que parecen de mujer en un absoluto salen en los avisos.
- **Otra final**: en la categoría C pueden entrar estudiantes que jugaron la
  final B y cumplen la edad. Se cargan los torneos de las dos finales en la
  misma selección; la edad decide quién entra y la A de cada uno es su lugar
  en su final.
- **Lo que falta se avisa**, para que el árbitro lo corrija en Swiss-Manager y
  vuelva a subir el torneo: sin año de nacimiento (queda fuera hasta que se
  arregle), un nombre o código que no coincide entre clásico y blitz, alguien
  en dos modalidades, un rival que no está en la lista. Si ya no da tiempo, el
  sexo y el año se ajustan a mano en la página; el ajuste se guarda con la
  selección (`selecciones_arbitraje`) y lo ven los profesores.
- **En vivo**: la página vuelve a leer cada 1, 2 o 5 minutos (solo con la
  pestaña a la vista) y dice quién entró y quién salió de la selección, cuánto
  subió o bajó cada uno y a cuántos puntos del corte está. Un profesor con
  licencia abre la misma selección con el enlace (`?s=<id>`,
  `seleccion_compartida()`), con los mismos torneos y ajustes.

`verificar-seleccion-calculo.js` prueba cada regla con torneos inventados (el
prorrateo y el Ps con los ejemplos del propio procedimiento, el 40 % y las
ausencias, las mujeres del absoluto, la final B, el año que falta, el
desempate, los códigos en cero, en vivo); `verificar-seleccion-chess-results.js`
prueba el lector de la función con HTML de la forma real y nombres inventados,
y que pregunte la licencia antes de leer. Rompiendo a propósito las ausencias
o el 40 %, saltan.

### El Espacio de consultas: FAQ a la vista, la IA oculta debajo

Arriba de la vitrina, `herramientas-arbitraje.html` tiene una sección aparte,
marcada «Gratis · sin licencia ni cuenta»: hoy son **11 preguntas frecuentes
de madres, padres y entrenadores** («pieza tocada, pieza jugada», ofrecer
tablas, la bandera caída, el celular en la mesa, quién reclama…), con
respuesta fija en el propio HTML (`<details>`/`<summary>`, igual que el FAQ de
`precios.html`), sin backend ni formulario. No pasa por `tengo_herramienta()`
ni por `licencias_herramientas`: es la puerta de entrada abierta de la
vitrina, no una herramienta más de la lista con candado. (La otra que no
lleva licencia es Pareo Integral, pero ese sí va en la lista, con
`gratis: true`: ver «Pareo Integral».)

**Debajo del FAQ, en un `<div class="hidden">`, sigue armado (pero sin
mostrarse) el formulario de consulta por IA** que este espacio tenía antes:
el dueño del repo pidió reemplazarlo por el FAQ mientras tanto, pero el
código queda intacto por si se retoma. Nada de lo de abajo se tocó.

- **La responde la Edge Function `consulta-arbitraje`** (`verify_jwt` en
  **false**: no hay sesión que comprobar, igual que `seleccion-chess-results`
  no la necesita para mirar `tengo_herramienta()` con el token de quien llama
  — acá, al revés, no hay token porque no hay cuenta). El candado está todo
  adentro:
  - **El freno de los envíos públicos**, con su propio tipo
    `'arbitraje_consulta'` en `interno.frenar_envio_publico()` — 10 por IP en
    una hora, 5 por correo al día (cuando lo dan), 80 en total por hora. Más
    chico que el de un formulario común porque **cada intento que pasa cuesta
    dinero de verdad**: llama a la IA. Se llama ANTES de gastar nada, por
    `public.arbitraje_consulta_frenar(p_ip, p_correo)` (mismo patrón que
    `jdn_frenar`: la función trae la IP de SU PROPIO pedido, porque la que
    vería PostgREST sería la de Supabase, no la de quien preguntó).
  - **Un presupuesto propio**, en `arbitraje_consulta_config` (una sola fila):
    qué modelo contesta (`claude-haiku-4-5` o `claude-sonnet-5`; `null` = la
    consulta está apagada) y cuánto puede gastar por mes. Aparte del de
    «Mejorar informe» (`academia_ia`), porque esa la gasta un profesor con
    sesión y esta la gasta cualquiera sin sesión: mezclarlos dejaría que el
    público le vaciara el presupuesto a la Academia. Solo quien administra la
    ve y la cambia (`arbitraje_consulta_config_guardar()`), desde
    `arbitraje.html` → «⚙️ IA del espacio de consultas». Lleva su trigger de
    auditoría (controla gasto, igual que `academia_ia` y
    `licencias_herramientas`).
  - **Cada intento queda anotado en `consultas_arbitraje`**, llegue o no a
    contestar (sin presupuesto, error de la IA): así quien revisa ve también
    lo que no se pudo responder, no solo lo que salió bien. La RLS es la misma
    que `arbitrajes_publicos`: solo profesores y administración leen y
    marcan `revisado`; nadie inserta desde el navegador, solo la Edge
    Function con la clave de servicio.
- **La respuesta no es una decisión arbitral ni sustituye el reglamento
  particular de un torneo.** El propio texto del sistema a la IA se lo pide:
  citar el artículo cuando pueda, decir con honestidad cuando no esté segura
  del número exacto en vez de inventarlo, remitir a las bases del torneo
  cuando la duda dependa de ellas (el ritmo, el desempate) y nunca decidir un
  caso concreto que esté pasando ahora mismo — eso es siempre del árbitro
  presente. La pantalla lo repite antes del formulario, con el enlace a
  `handbook.fide.com`.
- **La revisión vive en `arbitraje.html`**, en «💬 Espacio de consultas»: la
  lista con la pregunta, la respuesta, el modelo y el costo, una nota de
  revisión y el botón para marcarla revisada. Mismo patrón que «📥 Exámenes
  del público» (ver «Examen de arbitraje (reglamento FIDE)» en
  `docs/decisiones/entrenamiento.md`).
- `arbitraje.html` y `nivel-de-arbitraje.html` enlazan hacia acá para que
  quien busca un examen completo o una duda puntual encuentre el que le toca.

`node herramientas/verificar-arbitraje-consulta.js` (sin navegador ni red)
comprueba que la Edge Function pase por el freno antes de llamar a la IA, que
lea el presupuesto y lo compare contra el gasto del mes, que el freno conozca
el tipo `'arbitraje_consulta'` y que el formulario pida los campos que la
función espera.

**El formulario de IA nunca llegó a funcionar en producción** (al proyecto le
faltaba, y le sigue faltando, el secreto `ANTHROPIC_API_KEY` en las Edge
Functions — mismo hueco que «Mejorar informe», con `ia_uso` vacío: esa clave
nunca estuvo puesta en este proyecto) y por eso, en vez de arreglarlo, se optó
por el FAQ de arriba. El formulario y sus campos (`#consulta-form`,
`#c-nombre`…) siguen en el HTML tal cual —el verificador los sigue
encontrando— dentro de un `<div class="hidden">` que también envuelve el
aviso de «la respuesta la escribe una inteligencia artificial» y
`#c-resultado`. Para retomarlo algún día: agregar `ANTHROPIC_API_KEY` en el
panel de Supabase (Project Settings → Edge Functions → Secrets) con una clave
de `console.anthropic.com`, decidir qué pasa con el FAQ (¿se queda arriba, se
baja, se borra?) y quitar el `<div class="hidden">`.

## Desempates explicados

`desempates.html` recalcula la clasificación de un torneo de chess-results
desde las partidas (no desde los números que ya trae chess-results) y
explica, desempate por desempate, por qué una persona queda arriba de la
otra: el que se pensó para «responder un reclamo con números», no solo para
mostrar una tabla. Con licencia, igual que la selección CODICADER (ver
arriba): la vitrina la anunciaba como «Próximamente» desde que se armó la
lista de herramientas de arbitraje, y es la primera de las tres que faltaban
en construirse.

- **El cálculo de los 26 desempates es el MISMO de Pareo Integral**
  (`js/pareo/desempates.js`), no una segunda copia: ya está comprobado
  artículo por artículo contra los ejercicios del C.07:2026 y contra
  `chesspairing` en miles de torneos al azar (ver «Pareo Integral» más
  arriba). Lo único que se le agregó fue `explicar(t, id, codigo)`, que
  desglosa **ronda por ronda** de dónde sale cada número —el rival, el
  resultado, cuánto aportó y si ese desempate lo descarta (un Buchholz
  Cut-1, un rival con el que no quedaste empatado en el encuentro
  directo…)—, reusando las mismas listas internas que ya construía el
  cálculo (`aportesBuchholz`, `aportesSonneborn`) con el campo de más que le
  hacía falta a la pantalla, no con una cuenta aparte. Dos desempates no son
  una suma de rondas sino una fórmula (TPR, PTP): ahí se listan igual los
  rivales y, aparte, los pasos de la fórmula (el Elo medio, el porcentaje de
  puntos, la diferencia de la tabla B.02…).
  `node herramientas/verificar-desempates-explicar.js` (sin navegador)
  prueba, en 80 torneos al azar, que el total de cada desglose sea
  exactamente el mismo número que ya daba `calcular()` —27 000 comparaciones,
  los 26 desempates por cada jugador—, y que ninguna ronda ya jugada
  desaparezca del desglose sin decir por qué.
- **Las bases del torneo son el orden de desempates, elegido a mano.** No se
  adivina de chess-results (sus etiquetas vienen en el idioma y la forma que
  haya elegido quien armó el torneo, no en los códigos del C.07): quien usa
  la herramienta arma la lista con el mismo control de «subir / bajar /
  quitar» de Pareo Integral (`js/pareo/pagina.js`), con «Buchholz sin el
  peor, Buchholz, Sonneborn-Berger, encuentro directo, partidas ganadas» de
  entrada —el orden más común en Costa Rica, el mismo que trae por omisión
  un torneo nuevo de Pareo Integral (`js/pareo/torneo.js`)—.
- **chess-results no tiene API ni manda CORS**, así que lo lee la Edge
  Function **`desempates-chess-results`** (mismo patrón que
  `seleccion-chess-results`: solo con licencia —`tengo_herramienta('desempates')`
  con el token de quien llama, así que pasa por la verificación en dos
  pasos—, con caché de un minuto en `desempates_cache`, solo el service
  role). Lee la clasificación (`art=1`: puesto, «No.Ini.», nombre, Elo y el
  puntaje final) y, de cada jugador, su ficha (`art=9&snr=N`) con las
  partidas ronda a ronda: ahí viene el rival (su «No.Ini.», no el nombre: dos
  personas pueden compartir apellido), el color (el div `FarbewT`/`FarbesT`
  que trae adentro la celda «Res.» —esas letras quedan en alemán aunque la
  página esté en español— ) y el resultado. **Solo torneos individuales**:
  uno por equipos reparte el Buchholz por equipo, no por tablero, y eso pide
  otro diseño que no se intentó acá.
- **La categoría de cada ronda (bye, incomparecencia, jugada) se adivina con
  dos señales, no más, porque son las únicas que se comprobaron contra una
  página real** (la misma que ya usa `seleccion-chess-results`, ver su
  cabecera): un bye trae el rival «bye» literal (en cualquier idioma de la
  página) y una incomparecencia trae una «K» en la celda de resultado
  («- 1K»). Cualquier otra forma que chess-results use y esta función no
  reconozca se guarda como «sin resultado», nunca inventando una categoría:
  un desempate mal armado por adivinar una ronda vale menos que uno
  incompleto que avisa cuál le falta.
- **El puntaje reconstruido se compara contra el oficial, SIEMPRE.**
  `js/desempates-convertir.js` arma, de las fichas de cada jugador, el
  torneo que entiende `js/pareo/desempates.js` (una mesa por pareja, un
  `ausencias: "F"/"H"` por bye, nunca por posición sino por el «No.Ini.» de
  cada quien) y después vuelve a sumar el puntaje de cada persona con la
  MISMA función que usa Pareo Integral (`PareoTorneo.puntos`): si no
  coincide con el «Pts.» que chess-results ya tenía, esa persona entra igual
  a la tabla pero con su fila marcada y un aviso aparte que no se puede
  cerrar —es la red de seguridad contra una ronda que se leyó mal, y la
  única razón por la que esta herramienta se puede usar para un reclamo sin
  tener que creerle a ciegas al HTML—. `node
  herramientas/verificar-desempates-convertir.js` lo prueba con un torneo de
  5 armado a mano (impar, para que el bye tenga sentido de verdad: con 4 no
  sobra nadie) con un bye, una incomparecencia y partidas normales, y
  comprueba que un puntaje oficial puesto mal a propósito SÍ se avisa, y que
  un rival que no se pudo leer en ningún lado no se inventa.
- **El «por qué» compara a dos personas, no expone un informe de todos
  contra todos.** Se elige quién y quién (o se toca «¿Por qué aquí?» en una
  fila de la clasificación, que arma la comparación con la de encima) y la
  pantalla recorre los desempates elegidos EN ORDEN hasta el primero que las
  distingue: ese es el que se despliega con el desglose completo de las
  DOS personas, lado a lado; los de antes se muestran con su valor nada más
  (ya se sabía que no decidían nada) y los de después no se calculan ni se
  muestran (ya no hacen falta). Si quedan empatadas en todo lo elegido, lo
  dice con esas palabras en vez de inventar un ganador: lo que sigue
  (sorteo, una partida rápida…) lo deciden las bases del torneo, no un
  número más.
- `node herramientas/verificar-desempates-chess-results.js` (sin navegador
  ni red) prueba el lector de la Edge Function con HTML de la forma real —el
  bye, la incomparecencia a favor y en contra, el color de las dos celdas, la
  columna de puntaje cuando falta «Pts.» y sale de un «Des N»— y que el
  candado (`tengo_herramienta`, antes de tocar chess-results) siga ahí.

**Lo que falta, a propósito, para una primera versión**: torneos por
equipos, y adivinar el orden de desempates desde chess-results en vez de
pedirlo (sus `Des N` no siempre dicen cuál código del C.07 son). Las dos
herramientas que siguen en la vitrina —variación de Elo del torneo y
reclamos de tablas desde el PGN— no comparten nada de código con esta.

## Resultados JDN por comité

`jdn-comites.html` es una de las herramientas con licencia (`id: "jdn-comites"`
en `js/herramientas-arbitraje.js`). Junta los 216
torneos de ajedrez de los Juegos Deportivos Nacionales que están en
chess-results —eliminatorias 2018, 2021, 2022, 2024 y 2025; finales 2019,
2022-2023, 2024 y 2026— y los ordena **por comité de deportes**: lo pidió el
dueño («lo que importa es filtrar por resultados de todos los comités»). Arriba,
el medallero de las finales (todas o una edición); al elegir un comité, su
ficha con cada jugador y cada equipo, edición por edición. El enlace guarda lo
elegido (`#comite~edicion`).

- **Los datos están en la base, no en la página** (`jdn_resultados`, migración
  `20261009021548`): una fila por puesto, con el nombre y el comité tal como
  los escribió chess-results. **El candado es la RLS**: la única política es de
  lectura y pregunta `(select tengo_herramienta('jdn-comites'))`; sin licencia
  la tabla no devuelve nada, aunque se pida desde la consola. No hay política
  de escritura.
- **Se llena desde la base** con `herramientas/jdn-comites/cargar.sql`: desde
  una sesión de Claude Code no hay salida a chess-results, así que las páginas
  se piden con `pg_net` (`art=1` de cada torneo y `art=46`, la tabla final, de
  los de equipos) y el archivo las lee. Los torneos están en `torneos.txt`. La
  edición sale del número de torneo (cada edición se subió en un bloque propio;
  las finales 2024 se volvieron a subir en otro, 967761–967928) y el código
  (zona o ritmo, categoría, modalidad y rama) del título, que dice «JDN» o
  «Juegos Deportivos Nacionales» según el año. Las columnas se leen por el
  nombre del encabezado, nunca por la posición.
- **Comprobado al cargar**: las 2570 filas (1823 individuales y 747 de
  equipos) coinciden torneo por torneo con la revisión a mano —cantidad, suma
  de puntos y la huella de los nombres en orden—.
- **Son más de mil filas**: la página las pide de mil en mil (`range()`), si no
  PostgREST corta sin avisar.
- **Los comités se juntan en la página**: chess-results escribe el mismo comité
  de muchas formas («CCDR Goicochea», «Goico», «Asociación Goicoechea»; los
  equipos «CODEA A» y los jugadores «Alajuela»; «CC Distrital de Lepanto»). La
  tabla guarda lo que dice chess-results y `comite()` de `js/jdn-comites.js`
  lo normaliza: así, si aparece una variante nueva, se arregla en un solo lugar
  sin volver a cargar.
- **El comité que falta se deduce**: la final 2022-2023 no trae el comité de
  nadie. Se toma del mismo jugador en la misma edición, si no en la
  eliminatoria de su ciclo, si no en cualquier otra (con nombres cortados por
  chess-results: «Diaz Charpentier Kristel Meli» es el mismo que el nombre
  completo), y la ficha dice «comité deducido». Queda una sola persona sin
  comité.
- **Un puesto vacío es un empate** sin desempatar: hereda el de arriba y
  comparte la medalla. Por eso las medallas no suman exactamente lo mismo en
  cada final.
- **Las medallas van con su emoji y escritas** (🥇 Oro, 🥈 Plata, 🥉 Bronce),
  sin colores nuevos: el color nunca va solo.
- En equipos, chess-results ordena primero por puntos de partida. En 17
  eliminatorias por equipos no hay tabla final: el orden sale de la página de
  resultados y no hay récord de matches.
- Lo que no está en chess-results no está acá: la eliminatoria 2019, las
  finales 2018 y 2021, la eliminatoria 2018 de U12, y cuatro eliminatorias por
  equipos de 2024. La página lo dice en «De dónde salen los datos».

`verificar-jdn-comites.js` lo prueba con un doble de Supabase: el candado sin
licencia (y que no pida la tabla), la lectura de mil en mil (con 1100 filas de
un solo torneo), las variantes juntas y el orden del medallero, el empate que
comparte la plata, el comité deducido, la medalla escrita, «Jugó la final», el
filtro de edición y el enlace. Rompiendo a propósito la paginación, el empate o
la deducción, salta.
