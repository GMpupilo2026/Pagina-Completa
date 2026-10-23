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
  la política no da. Y los torneos son solo de las modalidades de a dos (ver
  «Los torneos, en todas las modalidades y en aleatorio»).

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

### Los torneos, en todas las modalidades y en aleatorio

Se pidió poder crear torneos con todos los modos de juego, y uno «aleatorio»
que cambie de modo ronda a ronda. El formulario ofrecía cinco (estándar,
crazyhouse, cartas, duelo y niebla) y la base aceptaba esas cinco
(`tournaments_variant_check`), aunque `game_rooms` ya aceptaba once.

- **Entran las once de a dos, y ninguna más**: las seis que faltaban
  (abrazos, camaleón, vampiro, a ciegas, volcanes y misiones secretas) se
  juegan en las mismas salas de `game_rooms`, así que un cruce de torneo es una
  sala más. Relevo (por equipos) y las de 4 jugadores no: un torneo empareja de
  a dos. La lista es `MODOS_TORNEO` de `js/juegos-comun.js`, sacada de
  `VARIANTS`: una modalidad de a dos nueva entra sola al formulario (en la base
  hay que sumarla a las dos restricciones).
- **Una sola copia de cómo arranca una sala**: `torneo.js` tenía su propio
  `buildGameRoomFields` con el estado inicial de tres variantes y su propio
  `pageFor2pVariant`, que mandaba a `crazyhouse.html` todo lo que no conocía.
  Ahora usa `estadoInicial()` y `pageFor2pVariant()` de `juegos-comun.js`, los
  mismos de una partida amistosa: un Volcanes de torneo sortea su volcán y un
  A ciegas lleva sus cinco miradas, igual que en `juegos.html`. Y los nombres
  de las modalidades (`torneos.html`, `torneo.html`, `campeones.html`) salen
  de ahí también: había tres copias de la lista de cinco.
- **La modalidad de cada ronda queda escrita en `tournament_rounds.variant`**,
  y la pone la base: en un torneo fijo, la del torneo diga lo que diga quien
  inserta; en uno aleatorio tiene que venir (si no, la ronda no se crea), y
  después no cambia (`interno.modalidad_de_la_ronda()`). Hacía falta lo
  segundo porque los jugadores también actualizan la ronda —la cierran desde
  `js/torneo-sync.js`—, y la modalidad de una ronda en juego no es de ellos.
  Las rondas de antes quedan con `variant` nulo y se leen con la del torneo.
  Comprobado en SQL: una ronda de un torneo de Volcanes que llega como
  «cartas» queda en Volcanes, y la de un aleatorio que se intenta pasar a
  Niebla al cerrarla se queda en la suya.
- **El sorteo lo hace quien arma la ronda** (`sortearModoDeRonda`): entre las
  que todavía no salieron en el torneo, y cuando ya salieron todas, cualquiera
  menos la de la ronda anterior. Así en once rondas salen las once y nunca se
  repite una dos rondas seguidas. No es secreto ni tiene por qué: la ronda lo
  dice escrito («Se juega: 🌋 Volcanes») en cuanto se arma, que es lo primero
  que hay que saber antes de sentarse.
- **Cada cruce va a la página de SU sala**, no a la del torneo: en uno
  aleatorio, el «Jugar →» de la ronda 3 lleva a `cartas.html` y el de la 4 a
  `variante.html`.
- **Las partidas en vivo que no se dibujan son tres**: Niebla (como antes), A
  ciegas, por la misma razón —el que juega puede tener `torneo.html` abierta al
  lado, y con las piezas a la vista se acabó jugar a ciegas—, y Abrazos, que
  guarda en `fen` un JSON con sus unidades abrazadas: `ClasesBoard` no lo
  entiende, cae en la posición inicial y enseñaría una partida que nadie
  juega. Las tres lo dicen en la tarjeta en vez de dejar un hueco, y ninguna
  escucha su sala por Realtime.
- **`variante.html` dejó de cerrarle la puerta a quien mira**: tenía el mismo
  `if (!myColor && !isTeacher)` que se les quitó a las otras páginas de
  partida (ver «Las partidas de un torneo se pueden VER»), y desde que los
  torneos se juegan también en sus modalidades, el «Ver →» llevaba al
  compañero a «No formas parte de esta partida». Mirar lo decide la RLS. La
  excepción es A ciegas en curso, como Niebla. Misiones secretas sí se mira:
  la misión la esconde `misiones_secretas`, no la pantalla.

**Al tocar las modalidades de los torneos, `js/juegos-comun.js` o la ronda de
`torneo.js`, correr `node herramientas/verificar-torneo-modos.js`**: la lista
contra las restricciones de las migraciones, el sorteo en mil torneos
simulados, el formulario, un torneo aleatorio de 13 rondas de punta a punta
(cada ronda con salas de su modalidad, su estado inicial, escrita y con su
enlace), uno fijo en Camaleón, las partidas en vivo que no se dibujan y
`variante.html` mirada por un compañero. Contra el código de antes saltan 13
comprobaciones.

### Las modalidades que entran al sorteo

Después de «Aleatorio» se pidió que el profe pueda elegir qué modos entran al
sorteo: no todas las modalidades sirven para todos los grupos (a ciegas o
Misiones secretas con los más pequeños, por ejemplo).

- **La lista vive en `tournaments.modos_aleatorio`**, nula = las once. Nula y
  no la lista entera escrita a propósito: un torneo que eligió «todas» sigue
  eligiéndolas todas si mañana se suma una modalidad de a dos. Por eso
  `montarCasillasModos().leer()` devuelve `null` con todas marcadas, y los
  aleatorios creados antes de esto (sin lista) se siguen sorteando entre todas.
- **Al menos dos**, y lo exige la base (`tournaments_modos_aleatorio_check`,
  que además pide que sean de a dos y que el torneo sea aleatorio): con una
  sola no hay sorteo —para eso está el torneo fijo— y «nunca dos rondas
  seguidas» necesita otra. La pantalla lo dice antes de mandar («Marca al
  menos 2») y no crea nada.
- **La base hace cumplir la lista al crear la ronda**:
  `interno.modalidad_de_la_ronda()` rechaza una ronda de un aleatorio cuya
  modalidad no está en la lista. La lista la cambia solo quien organiza (o
  administra): `proteger_torneo()` se la revierte en silencio a un inscrito,
  como el ritmo, y un torneo terminado ya no la cambia. Comprobado en SQL
  impersonando al organizador y a un inscrito, y con una ronda fuera de la
  lista, una lista de una sola y una con Relevo, que la base rechaza.
- **Se elige al crear y se puede cambiar después**: la tarjeta «🎲
  Modalidades del sorteo» de `torneo.html`, que solo ve quien organiza
  mientras el torneo no terminó, igual que la del tiempo. Vale desde la ronda
  siguiente (la que está en juego ya tiene la suya). Lo jugado antes con
  modalidades que ya no están en la lista no estorba al sorteo: se recorre la
  lista nueva desde cero.
- **Todos ven cuáles entran**, debajo de la cabecera del torneo («Entran al
  sorteo 3 de 11: …»): quien juega quiere saber qué le puede tocar para
  repasar las reglas antes.
- **Las casillas son una sola copia** (`montarCasillasModos` en
  `js/juegos-comun.js`) para crear y para cambiar, con `leer()`, `poner()` y
  `cuantas()`; se vuelven a poner solo si lo guardado cambió, por lo mismo que
  el selector del ritmo.

Lo comprueba el mismo `verificar-torneo-modos.js` (apartado 7): el sorteo con
una lista en mil torneos, crear con una sola (no crea), con tres (las manda) y
con todas (manda nulo), un aleatorio de tres modalidades que cambia a otras
dos a mitad de torneo, y la inscrita que ve la lista pero no la tarjeta. Con
`torneo.js` y `torneos.js` de antes saltan las pruebas de las dos páginas.

**En eliminación directa ya funcionaba, y ahora se prueba.** Se pidió que el
aleatorio sirva también en eliminación directa. No hubo que cambiar nada: la
modalidad se sortea en `generateRound()` antes de mirar el formato, y la llave,
los byes y las tablas («Avanza …») no dependen de la modalidad. Pero nada lo
comprobaba, y un `if` por formato lo habría apagado sin ningún error, así que
`verificar-torneo-modos.js` (apartado 8) juega llaves de 8, 6 y 5 inscritos
(con byes, y una con tablas en la primera ronda) hasta el campeón. Con pocas
rondas (log₂ de los inscritos) salen pocas modalidades: con 8 inscritos son 3
rondas y 3 de las once, distintas entre sí. El doble del verificador hace
cumplir además los CHECK de modalidad de `game_rooms` y `tournament_rounds`:
sin eso, una ronda que la página mandaba como «aleatorio» la tragaba, y la
base de verdad la rechaza.

### Un torneo de todas las modalidades, jugado de punta a punta

Se pidió revisar que todas las modalidades se puedan jugar sin fallas en un
torneo, simulando al menos 6 rondas, que todos los relojes corran y que la
triple repetición y las 50 jugadas terminen en tablas. Las pruebas de torneo
escribían el resultado del cruce a mano; jugando las partidas de verdad
salieron tres huecos, ninguno con error a la vista.

**`variante.html` no le avisaba al torneo.** No cargaba `js/torneo-sync.js`:
una partida de Abrazos, Camaleón, Vampiro, A ciegas, Volcanes o Misiones
terminaba, el cruce se quedaba sin resultado y la ronda no se cerraba nunca.
Ahora llama a `TorneoSync.onRoomUpdate` como las demás.

**Y en las seis páginas avisaba solo la pantalla del rival.** Cuando la jugada
que termina la partida es la propia, el eco de Realtime llega idéntico a lo que
la página ya tiene y `SalaJuego.suscribir` lo descarta (con razón: no hay nada
que pintar). Si el rival había cerrado su pestaña, nadie avisaba.
`SalaJuego.avisarTorneo(room)` se llama también después de guardar la jugada
propia; `onRoomUpdate` es idempotente (solo toca un cruce sin resultado).

#### Todas las modalidades terminan en tablas: repetición y 50 jugadas

| Modalidad | 50 jugadas | Triple repetición |
|---|---|---|
| Estándar, Niebla, Crazyhouse | `in_draw()` de chess.js | `js/repeticion.js` reproduce `room.moves` (como antes) |
| A ciegas, Misiones, Vampiro, Volcanes | el motor (medias jugadas de la FEN) | `variant_state.rep` |
| Camaleón, Abrazos | el motor, con su contador nuevo | `variant_state.rep` |
| Cartas | el motor (chess.js) | `variant_state.rep` |
| Duelo | el motor: 50 rondas sin captura, choque ni peón | el motor: `duelo_state.vistas` |

- **La cuenta viaja en la sala** (`Repeticion.enSala`): las jugadas de esas
  modalidades no se pueden reproducir con chess.js (cada una tiene su motor y
  su planilla), así que quien juega pone al día un `{ posición: veces }` en
  `variant_state.rep`, en el mismo update que la jugada. Se reinicia en cada
  jugada irreversible (captura, abrazo, peón), que ya no puede volver.
- **Cada motor dice qué es «la misma posición»** (`clave()`): con chess.js, la
  de siempre (captura al paso solo si se puede hacer); en Volcanes, además, en
  qué punto del ciclo de volcanes va (lo que puede pasar después es distinto);
  en Cartas, además, las manos y las cartas pendientes (por eso solo se repite
  cuando el mazo ya se acabó); en Abrazos, las casillas ordenadas (el objeto
  las guardaba en el orden en que se movieron, y la misma posición se escribía
  distinto).
- **Camaleón y Abrazos no contaban las medias jugadas**: Camaleón escribía
  siempre 0 en su FEN y Abrazos no lo guardaba. La partida no terminaba nunca.
- **En Duelo la FEN va siempre con el turno en blancas y 0 medias jugadas**,
  así que chess.js no puede contar nada: cuenta el motor (`sinAvance`,
  `vistas`), y una partida guardada antes empieza a contar desde su tablero.
- **El final dice por qué** (`SalaJuego.textoTablas`): «Tablas por triple
  repetición.» o «Tablas por la regla de las 50 jugadas.», en las seis
  páginas; en las que guardan el estado, `variant_state.fin.motivo`.
- **`cargarConHistoria` de Estándar compara también el contador de medias
  jugadas**: una sala que arrancó de otra posición con las mismas piezas se
  tomaba por la partida desde el principio y el contador volvía a 1.

#### Duelo Simultáneo con reloj

Duelo era la única de a dos sin reloj: el torneo le daba un ritmo y la página
lo ignoraba. Ahora lleva «Estoy listo» como las demás (el reloj arranca con los
dos listos; una partida empezada antes sigue sin pedirlo) y **corren los dos
relojes a la vez**, porque los dos piensan a la vez: cada uno se detiene cuando
ese jugador confirma su jugada (ahí se le descuenta lo pensado y se le suma el
incremento) y arrancan los dos de nuevo al resolverse la ronda. La bandera se
le cae a quien no confirmó a tiempo.

- **La base lo sabe**: `proteger_reloj_de_partida()` leía el turno de la
  columna `fen`, que en el duelo se queda en la de salida («w»), así que para
  la base el reloj de las negras no corría nunca y su bandera se habría
  rechazado siempre. En el duelo corren los dos, menos el de quien ya confirmó
  (nadie se lo puede bajar), y confirmar con el tiempo agotado se rechaza.
  Comprobado en una transacción revertida: confirmar tras 30 s entra, bajarle
  el reloj a quien confirmó se rechaza, la bandera antes de tiempo se rechaza,
  confirmar sin tiempo se rechaza y la bandera de verdad entra.
- `SalaJuego.restante()` y `pintarRelojes()` aceptan `corren: { w, b }` en
  vez del turno.
- **Confirmada la jugada, «Comprometer esta jugada» y «Cambiar» se van.**
  `markLocked()` deja `board.staged` puesto a propósito (la jugada sigue
  marcada en morado en el tablero), y los botones se mostraban solo con mirar
  `staged`: quedaban a la vista hasta que se resolvía la ronda, aunque ya no
  hicieran nada. Ahora se esconden también con el tablero bloqueado o el
  compromiso propio ya guardado, y en el mismo clic, sin esperar a la base.
  Lo revisa la prueba de la bandera de `verificar-torneo-jugado.js`.

#### Las dos escrituras del duelo ya no se pisan

Jugando muchas partidas de Duelo seguidas apareció una falla que ya estaba:
**una de cada ~10 se quedaba para siempre en «revelando y resolviendo la
ronda…»**. Los dos jugadores confirman y revelan casi en el mismo instante, y
la página guardaba `duelo_state` ENTERO tal como lo había leído: la segunda
escritura borraba la revelación (o el compromiso) que la primera acababa de
poner. Sin error: cada pantalla creía haber guardado lo suyo.

- **`public.duelo_guardar(sala, ronda, parte, valor, tiempo)`** pone solo la
  parte propia (`commit` o `reveal` de su color, con `jsonb_set`) sobre la
  fila ya bloqueada: dos llamadas a la vez se suman, porque la segunda espera
  a la primera y vuelve a leer la fila. El color lo decide la base (quién
  llama), y solo vale para la ronda que se pide: lo que llega tarde de una
  ronda ya resuelta no entra. `SECURITY INVOKER`: la RLS y el trigger del
  reloj siguen decidiendo, como en un update. Comprobado impersonando a los
  dos jugadores y a un tercero: los dos compromisos quedan, la ronda
  equivocada no entra y el tercero es rechazado.
- **Resolver la ronda escribe el estado entero, pero solo si la ronda en la
  base sigue siendo la que se resolvió** (`.eq("duelo_state->>round", …)`):
  si ya la resolvió la otra pantalla y el rival confirmó la siguiente, no se
  la borra.
- `verificar-torneo-jugado.js` (apartado 4) juega 30 duelos en que los dos
  confirman a la vez: con el `duelo.js` de antes se traban varios; con este,
  ninguno.

**Al tocar una página de partida, un motor, `js/repeticion.js`,
`js/sala-juego.js` o `js/torneo-sync.js`, correr `node
herramientas/verificar-torneo-jugado.js`** (necesita `npm install`; tarda unos
minutos). Con una base de mentira compartida por todas las pestañas, que hace
lo que hacen los triggers del reloj y de la ronda: (1) un torneo «Aleatorio»
de 11 rondas, una por modalidad, donde el profe arma cada ronda en
`torneo.html` y Ana y Bruno juegan cada partida de verdad (clics en el
tablero, la jugada escrita en A ciegas, elegir y confirmar en Duelo) hasta
tablas por repetición, mirando que corran los dos relojes, que la pantalla lo
diga, que el resultado llegue al cruce y que la ronda se cierre sola; (2) las
50 jugadas en las 11 modalidades; (3) la bandera en las 11, con el reloj
detenido de quien confirmó en Duelo. Con `variante.html` sin `torneo-sync.js`,
la ronda de Abrazos queda abierta y salta.

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
  siempre. Las de `variante.html`, Cartas y Duelo la tienen desde octubre de
  2026, cada una con lo que para ella es «la misma posición» (ver «Todas las
  modalidades terminan en tablas: repetición y 50 jugadas»).

### En las prácticas también: triple repetición y 50 jugadas, solas

En toda práctica o entrenamiento que se juega como partida (contra el bot, el
motor o la defensa de un ejercicio), la triple repetición y la regla de las 50
jugadas terminan la partida en tablas **automáticamente**, y el final dice por
qué. Donde el juego conserva el historial de chess.js (Finales contra la
máquina, Finales 100, las partidas de los cursos, el entrenador de líneas, la
práctica de la clase en vivo, el bot de `tablero.html`, Remata y Salva las
tablas) ya lo hacía `in_draw()`. Faltaba en cuatro lugares, y en ninguno daba
error: la partida seguía y nada más.

- **Bot de Oscar (`bot.html`), en Estándar, Niebla, A ciegas y Crazyhouse.**
  El motor se recargaba desde la FEN en cada jugada (el tablero lleva el suyo),
  así que chess.js nunca veía una posición repetida. Ahora se anota cada
  posición al pasar con `Repeticion.contador()` (`js/repeticion.js`, la misma
  clave que en línea, con la captura al paso recortada) y las 50 jugadas se
  leen del reloj de medias jugadas de la FEN (`Repeticion.cincuentaJugadas`).
  El mate manda: si la jugada que repite da mate, ganó. Abrazos, Camaleón y
  Cartas no la llevan, por lo mismo que en línea.
- **«La clase juega» (`js/clase-votacion.js`).** Miraba `new Chess(board.fen())`,
  sin historial. Ahora reproduce con `Repeticion.esTriple` las jugadas desde
  que empezó la partida (`fenInicial` y `desde`, guardados al empezar): lo que
  el profe mostró antes en el tablero no cuenta. Una partida guardada de antes,
  sin `fenInicial`, no declara repetición (equivocarse hacia «no hay»).
- **Habilidades: «Con lo justo» y «Rey y peón».** Solo miraban el mate, el
  ahogado y la captura; dando vueltas, la partida no terminaba nunca. El tope
  propio de «Con lo justo» (mate antes de 50 jugadas desde el principio) sigue:
  es la consigna del ejercicio, no la regla.

Lo comprueba `verificar-reloj-y-repeticion.js` (el contador, las 50 jugadas,
que cada jugada del bot anote su posición antes de revisar el final, «La clase
juega» corrida de verdad y los dos tipos). Probado que falla: quitando el
`anotarPosicion()` de una jugada del bot o la repetición de la clase, salta.

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

### Institución, subir una lista y el Elo Nacional

Lo pidió el dueño del sitio: cada jugador puede llevar su **institución**
(colegio, club), se puede **subir una lista desde Word o Excel** en vez de
pegarla a mano, y Pareo Integral puede **buscar el Elo Nacional** de quien no
lo tenga.

- **`institucion` es un campo más del jugador**, igual que `nombre` o `fed`:
  en el formulario de alta, en «Pegar una lista» (ahora Nombre; Institución;
  Elo; Título; Federación; ID FIDE —se corrió un lugar—), al editar, en la
  tabla de inscritos y en el `.json` del torneo. **No va al TRF**: revisado
  artículo por artículo, el TRF-16 de FIDE no tiene una columna de club o
  institución por jugador (`js/pareo/torneo.js:aTrf()`/`deTrf()` no la
  nombran), así que meterla ahí sería una extensión que FIDE no pide y que
  ningún otro programa sabría leer. Vive solo en Pareo Integral.
- **Subir una lista** (`pi-subir-lista` en «Agregar un jugador») lee `.xlsx`
  y `.csv` con `js/reporte-excel.js` (`ReporteExcel.leer`, el mismo lector de
  hojas sin librería que ya usan los informes) y `.docx` con
  `js/reporte-textos.js` (`filasDeDocx`, nuevo: lee la PRIMERA TABLA del
  documento como filas de celdas —`<w:tbl>` → `<w:tr>` → `<w:tc>`— y, si el
  documento no trae tabla, una fila por párrafo). **La cabecera se reconoce
  por su etiqueta, no por su posición**: si la primera fila dice «Nombre»,
  «Institución», «Elo»… (en español o en inglés, sin mirar tildes ni
  mayúsculas) esa es la columna, en cualquier orden; si no reconoce ninguna
  columna de nombre, se lee en el orden fijo de siempre
  (`js/pareo/pagina.js:ORDEN_LISTA`). El diccionario de etiquetas
  (`SINONIMOS_COLUMNA`) es una tabla de `"etiqueta": "campo"`, no una lista
  de arrays de dos elementos: esa forma exacta —dos cadenas entre
  corchetes— es justo el patrón con el que `verificar-pareo-pagina.js`
  reconoce una lista de opciones que necesita traducción, y esta tabla no lo
  es; se armó así para no hacerle creer al verificador que faltaba traducir
  «rating» o «title».
- **Exportar jugadores** (ficha Archivos, «Exportar jugadores (.csv)») reusa
  `js/csv-excel.js` (`CsvExcel.bajar`, el mismo CSV con punto y coma, BOM y
  el escape de fórmulas que ya usan Formularios y Cobros) en vez de escribir
  un generador de `.xlsx` de verdad: no hay uno en el sitio y no hacía falta
  —un CSV abre igual en Excel con un doble clic—.
- **Buscar el Elo Nacional es la ÚNICA cosa de Pareo Integral que sale de la
  computadora de quien organiza**, y la página lo dice con esas palabras
  junto al botón. Todo lo demás —el torneo, los jugadores, los archivos que
  baja— se queda en el navegador a propósito (ver el comentario de cabecera
  de `js/pareo/pagina.js`); esta excepción es necesaria porque
  ajedrezcostarica.com/es/national-rating no manda CORS, así que el
  navegador no puede leerla directo. Se manda **solo el nombre** de cada
  jugador sin Elo —nada de institución, fecha de nacimiento ni ningún otro
  dato— a la Edge Function **`pareo-elo-nacional`** (`verify_jwt` en false:
  no hay cuenta que comprobar), que la busca por nombre (no hay código FIDE
  confiable para un jugador escolar) y **nunca adivina un homónimo**: si la
  búsqueda trae más de una persona con el mismo nombre normalizado
  (sin tildes, sin importar el orden de apellidos y nombre), contesta
  «ambiguo» en vez de elegir cualquiera. No hay tabla ni bitácora propia: no
  se guarda qué se buscó ni quién lo buscó, solo el freno de los envíos
  públicos antes de salir a buscar (`pareo_elo_frenar`, mismo patrón que
  `jde_frenar` y `jdn_frenar`, pero solo por IP —Pareo Integral no pide
  ningún otro dato—). Tope por pedido: 40 jugadores (`js/pareo/pagina.js:
  TOPE_BUSQUEDA_ELO`, el mismo que exige la función); con más, hay que volver
  a tocar el botón para el resto.
- **El lector de ajedrezcostarica.com ya existía y se compartió, no se
  copió**: `leerListaNacional`/`busquedasPorNombre` vivían en
  `supabase/functions/elo-fide/leer-elo.ts` (el Elo de un alumno, por su
  código FIDE, para el informe a la casa). Se mudaron a
  `supabase/functions/_compartido/ajedrezcostarica.ts` y las dos funciones
  —`elo-fide` y `pareo-elo-nacional`— se lo traen con
  `node herramientas/funciones-armar.js` al desplegar; `elo-fide` sigue
  haciendo exactamente lo mismo que antes, solo cambió de dónde importa.
  `herramientas/verificar-elo-fide.js` sigue probando ese archivo (ahora en
  su nueva dirección) sin red ni Deno.

### Categoría, nombres repetidos y resolver un Elo Nacional ambiguo

Cuatro mejoras más sobre lo de arriba, pedidas después de mirar el código con
calma: la categoría del jugador, avisar de un nombre repetido, filtrar por
institución y resolver a mano un Elo Nacional que quedó ambiguo.

- **`categoria` es un campo libre** (ej. «Sub-10», «Veteranos», «Femenino
  A»), no una lista cerrada: Pareo Integral sirve para cualquier torneo, no
  solo escolares, y una lista cerrada en un programa genérico tarde o
  temprano le queda chica a alguien. Mismo patrón que `institucion`: va en
  el formulario, al editar, en la tabla, en el `.json` y se exporta a CSV;
  no va al TRF (mismo motivo: FIDE no la pide). En **«Pegar una lista» y
  «Subir una lista» va al FINAL** del orden fijo (Nombre; Institución; Elo;
  Título; Federación; ID FIDE; Categoría), no intercalada, para no romper
  las listas que alguien ya tenía armadas con el orden de antes de esta
  mejora. En la TABLA de inscritos, en cambio, se ve junto a la institución
  (antes del título): ahí no hay nada que se rompa por el orden, y así se
  ven juntos los datos de «quién es y dónde juega» antes que los de rating.
  `SINONIMOS_COLUMNA` reconoce «categoria», «category», «nivel» y
  «division».
- **Dos jugadores con el mismo nombre se avisan, nunca se bloquean**: puede
  ser la misma persona anotada dos veces por error, o un homónimo de
  verdad (dos alumnos distintos se llaman igual más de lo que parece).
  `agregarJugadores()` compara por el mismo bolsillo de palabras que usa el
  Elo Nacional (sin tildes, sin importar el orden de apellidos y nombre)
  entre los recién agregados y el resto del torneo, y si hay coincidencia
  muestra un aviso con el nombre — sin impedir que se agreguen. Cubre los
  tres caminos de alta (el formulario, pegar una lista y subir un archivo)
  porque los tres pasan por esa misma función.
- **Clasificación y Tabla cruzada se pueden filtrar por institución**: un
  `<select>` en cada ficha (el mismo filtro para las dos, recordado en
  `estado.filtroInstitucion` mientras el torneo esté abierto) con las
  instituciones que de verdad tiene el torneo. Útil en un torneo con varios
  colegios para ver solo el de uno. La Clasificación además le suma una
  columna de institución (la Tabla cruzada no: ya tiene una columna por
  ronda y `verificar-pareo-pagina.js` cuenta las columnas de su cabecera,
  así que ahí solo se filtra, no se agrega una columna). El filtro compara
  el texto tal cual está escrito, sin normalizar mayúsculas ni tildes: dos
  formas distintas de escribir el mismo colegio son, a propósito, dos
  instituciones distintas para Pareo Integral — unirlas a ciegas podría
  juntar dos colegios que en realidad son distintos.
- **Un Elo Nacional «ambiguo» o no encontrado se puede resolver sin repetir
  toda la búsqueda**: `buscarEloNacional()` ahora empareja la respuesta de
  la Edge Function con cada jugador **por posición** (el jugador *i* de la
  lista que se mandó con el resultado *i* de la respuesta), no por el
  bolsillo de palabras del nombre como antes. Con el bolsillo, dos jugadores
  CON EL MISMO NOMBRE (el caso de arriba) habrían recibido el mismo Elo
  encontrado para uno solo de ellos — un bug chiquito que este cambio de
  paso también corrige. A quien queda «ambiguo» o «no encontrado» se le
  pone en una lista bajo el botón (`#pi-elo-pendientes`, en memoria, no se
  guarda) con un botón «Editar» que abre el mismo formulario de editar un
  jugador para poner el Elo a mano; la lista se actualiza sola al guardar
  esos cambios o al volver a buscar.

**Al tocar la institución, la categoría, los nombres repetidos, la subida de
listas, el filtro por institución o el Elo Nacional, correr
`node herramientas/verificar-pareo-institucion.js`** (con el sitio en
localhost:8777 y playwright para la parte de la página; sin navegador para
la migración y la Edge Function). Comprueba el freno y el candado de
`pareo-elo-nacional` leídos de la migración y de `index.ts`, el lector de
tablas de un `.docx` armado a mano (con y sin cabecera reconocible, con una
tabla y con un párrafo por línea), el mapeo de columnas por etiqueta, la
exportación a CSV, que subir un archivo agregue a los jugadores con su
institución, que el botón de Elo Nacional sea la única llamada que sale del
sitio, que no adivine un homónimo y que asigne por índice, que resolver un
ambiguo a mano lo saque de la lista de pendientes, que un nombre repetido se
avise sin bloquear el alta, y que el filtro de institución filtre de verdad
tanto la Clasificación como la Tabla cruzada. Rompiendo a propósito el freno,
la comparación de nombres o el filtro, salta.

### Subir la inscripción de los JDE: un torneo por grupo, sugerido

Lo pidió el dueño del sitio con el Excel que baja el sistema del MEP
(«Report Generation – Juegos Deportivos Estudiantiles»): una regional entera
en una sola hoja —364 inscritos en la de Alajuela 2026—, con hombres y
mujeres, equipos e individual y las categorías A a E juntos. Cada combinación
se juega aparte, y armar cada torneo a mano era copiar y pegar filas.

- **La cabecera se busca en las primeras diez filas, no solo en la primera**
  (`FILAS_ANTES_DE_CABECERA` en `js/pareo/pagina.js`). Ese Excel trae arriba
  el título del reporte y la fecha en que se exportó; antes la cabecera no
  se reconocía, se caía al orden fijo y **esas dos filas entraban como
  jugadores** (y el resto con las columnas cambiadas). Sin error.
- `SINONIMOS_COLUMNA` reconoce ahora «Nombre de Centro Educativo»
  (institución), «Sexo», «FDN» (nacimiento), «Equipo/Ind» (modalidad) y
  «Dirección Regional». La cédula, la nacionalidad y la edad no se leen: no
  le hacen falta al torneo y no se guardan.
- **Las fechas «7/17/2015» se deciden por columna**, no celda por celda
  (`ordenFechas()` en `js/pareo/grupos.js`): si algún valor solo tiene
  sentido como mes/día (un 17 no es un mes), toda la columna es mes/día; sin
  pistas, día/mes, como se escribe acá. Celda por celda, el 1/4/2017 de una
  lista mes/día se habría leído 1 de abril.
- **Solo se separa por lo que cambia en el archivo** (`agrupar()`): si todos
  son de individual, la modalidad no parte nada. Con un solo grupo, la lista
  se agrega como siempre; con dos o más **no se agrega a nadie**: aparece
  `#pi-sugerencia` con cada grupo («Individual · Categoría A · Mujeres — 6
  jugadores · sugerido: todos contra todos») y el árbitro decide entre crear
  los marcados, «No separar» (todos al torneo abierto, lo de antes) o
  descartar. Nunca se crean torneos sin que lo confirme.
- **El grupo de un solo jugador viene desmarcado**: no alcanza para un
  torneo, y se dice así en vez de esconderlo (el árbitro puede marcarlo igual
  o juntarlo a mano con otro).
- **Lo que pide la Normativa de los JDE 2026, art. 66** (la mandó el dueño
  del sitio; está en su Drive, no en el repositorio):
  - Los torneos son **«Individual Mujeres» y «Abierto»**, no masculino y
    femenino: en el abierto pueden jugar hombres y mujeres. El Excel trae el
    sexo, no en cuál torneo se inscribió cada una, así que todas las mujeres
    van al de mujeres, y el panel avisa que si alguna juega el abierto, se
    mueve a mano.
  - **Sistema en la Etapa Regional** (`sistemaSugerido()`,
    `JDE_MAX_TODOS`, `JDE_RONDAS_SUIZO`): con más de ocho por modalidad,
    suizo de no menos de cinco rondas (si el torneo abierto tenía menos, se
    sube a 5); con ocho o menos, todos contra todos. La Interregional (todos
    contra todos siempre) y la Nacional (suizo con más de 7, todos contra
    todos con 6 o menos) tienen otras reglas, y por eso todo dice
    «sugerido»: se cambia en «Torneo» antes de la ronda 1.
  - **Ritmo**: no menos de 10 minutos con 2 segundos por jugada. Si el
    torneo abierto no tiene ritmo, los nuevos llevan ese mínimo
    (`JDE_RITMO_MINIMO`); si tiene uno, se respeta el del árbitro.
  - Puntos 1, ½ y 0 (los de FIDE, que ya son los de omisión) y al menos
    tres desempates (los de omisión son cinco): no hizo falta tocar nada.
  - Equipos de 3 a 5 por centro educativo, con el orden de tableros del
    congresillo: es un torneo por equipos que Pareo Integral no empareja
    (ver abajo).
  - **Una o dos mujeres de equipos pasan al abierto de su centro**
    (`pasarMujeresAlAbierto()`, pedido por el dueño del sitio «por ahora»).
    Un equipo es de 3 a 5 (art. 66.1.g): si en equipos un centro inscribió
    solo una o dos mujeres en una categoría, no tienen equipo de mujeres; si
    ese centro presenta equipo abierto en esa categoría, pasan a ese torneo
    para que puedan jugar. El centro se reconoce por el texto del centro
    educativo, sin tildes ni mayúsculas de diferencia. Viene con una casilla
    marcada que lo deshace, y cada caso dice el centro, la categoría, a
    quiénes pasa y con cuántos queda el abierto. Las que no tienen abierto
    de su centro se avisan aparte y quedan en el de mujeres. Siguen
    anotadas como mujeres (`sexo` "w", que va al TRF); la marca `alAbierto`
    solo decide el grupo y no se guarda. El tope de tres ascensos se cuenta
    en el equipo donde quedaron. En Alajuela 2026 son tres: una de Grecia
    (categoría D) y dos de San Gerardo (A); la de Maurilio Soto (A) no
    tiene abierto al cual pasar.
  - **Las inscripciones repetidas se limpian antes de todo**
    (`quitarRepetidos()`). El reporte de Alajuela 2026 traía a 17
    estudiantes más de una vez (25 filas de más): la misma estudiante tres
    veces en el mismo equipo, con otra fecha de inscripción. Sin limpiar,
    un equipo de 4 parecía de 12. La persona se reconoce por su documento
    de identidad (se lee solo para esto, en memoria: `soloJugador()` no lo
    guarda ni va al TRF) y, si no lo trae, por su nombre y fecha de
    nacimiento. La misma inscripción repetida (misma modalidad y
    categoría) queda una sola vez, y el panel dice quiénes y cuántas
    veces; la misma persona en dos modalidades o categorías (5 en
    Alajuela) se le pregunta al árbitro dónde queda: el art. 66.1.h permite
    una sola modalidad. Cada persona trae una opción por inscripción («Que
    quede en Equipos D», «Que quede en Individual D») y «Todavía no decido
    (queda en las dos)», que es como viene, para no sacar a nadie de un
    torneo sin que el árbitro lo diga; el panel cuenta cuántos faltan por
    decidir. La inscripción que no elige sale ANTES que todo lo demás
    (`calcularSugerencia()`): el pase al abierto, los equipos de más de cinco
    y los grupos se arman sin ella, así que dejarlo en individual también lo
    saca de la cuenta de su equipo.
  - **Un equipo con menos de tres se avisa** (`equiposCortos()`, art.
    66.1.g: «un mínimo de tres personas estudiantes»; pedido por el dueño
    del sitio). Se cuenta sobre la lista que de verdad juega, después de
    todas las decisiones del árbitro (el pase al abierto, los cinco de un
    equipo de más y la modalidad de quien estaba en dos), y se recalcula con
    cada una: dejar a alguien en individual o desmarcar a dos de un equipo
    hace aparecer el aviso al instante. Cada caso lleva «Aviso:» escrito al
    frente, el centro, la categoría, el torneo y quiénes son. No saca a
    nadie: el árbitro sabe si el centro completa el equipo el día del
    torneo. En Alajuela 2026 son dos: Saint Josephine Bilingual School (B
    abierto, 2) y Maurilio Soto Alfaro (A mujeres, la que no tenía abierto
    al cual pasar).
  - **Un hombre en el torneo de mujeres se avisa** (`hombresEnMujeres()`,
    art. 66.1: «Torneo Individual Mujeres» y «un equipo de mujeres»;
    pedido por el dueño del sitio para equipos, y se aplica también al
    individual porque la regla es la misma). Con el Excel actual del MEP
    no puede pasar: trae solo el sexo, y el torneo sale de ahí. Pasa cuando
    el archivo dice el torneo aparte, con una columna «Torneo» o «Rama»
    (Mujeres o Abierto), que es lo que pide la propuesta de cambios a la
    normativa. Por eso `rama` dejó de leerse como sexo: «Rama femenina»
    dice el torneo, no el sexo de la persona, y en el abierto juegan
    también mujeres. Cuando la columna viene, el torneo es el que diga el
    archivo (`torneoBase()`), la mujer anotada en el abierto queda en el
    abierto sin aviso, y quien está anotado como hombre en el de mujeres
    queda donde dice el archivo y se avisa con «Aviso:», su nombre, su
    centro y el torneo: no se mueve, porque el error puede estar en el sexo
    o en el torneo.
  - **Dos por centro en individual** (`individualesDeMas()`, art. 66.1.f:
    «sólo podrán clasificar a la Etapa Regional dos personas estudiantes
    mujeres y dos personas estudiantes en abierto»). Es el mismo control que
    el de los equipos de más de cinco (`deMasPorCentro()` con otro tope, y
    `pintarTopes()` en la página): mismo centro, categoría y torneo, vienen
    marcados los dos primeros de la inscripción, con dos marcados no se
    puede marcar otro, y el resto queda descartado de todo. En Alajuela 2026
    son cuatro casos y seis descartados por omisión.
  - **La configuración de los JDE** (`configuracionJde()`, art. 66.2 a
    66.4). La casilla «Usar la configuración de los JDE», marcada de
    entrada, le pone a cada torneo creado la suya según cuántos juegan: el
    sistema sugerido, al menos cinco rondas en el suizo (si el abierto tenía
    más, se respetan), el ritmo mínimo si el abierto no tiene uno (si tiene,
    se respeta: la normativa dice «no podrá ser menor»), 1 · ½ · 0 con el
    bye en 1, y desempates. La normativa no los fija (pide «al menos tres»
    que establece el árbitro en el congresillo, «preferiblemente» los de la
    Federación y FIDE), así que se toman los de FIDE para cada sistema:
    Buchholz sin el peor, Buchholz, Sonneborn-Berger, encuentro directo y
    victorias en el suizo; encuentro directo, Sonneborn-Berger, victorias y
    Koya en el todos contra todos. El bye en 1 tampoco lo dice la normativa:
    es el de FIDE (está en la propuesta de cambios). Sin marcar la casilla,
    se copian del torneo abierto tal cual, como antes de esto.
    El botón «Aplicar la configuración de los JDE» de la ficha Torneo hace
    lo mismo con el torneo abierto, y solo antes de la ronda 1 (después, el
    sistema y los puntos ya no se cambian).
  - **La etapa y el lugar, y el nombre del evento siempre igual**
    (`pedirEtapaJde()`, pedido por el dueño del sitio: «para que el nombre
    del evento sea siempre igual para todos pero ajustado a cada lugar»).
    Al crear los torneos con la configuración de los JDE, y al tocar el
    botón de la ficha Torneo, se pregunta en dos pasos (dos
    `Avisos.formulario`: el diálogo no cambia de campos según lo elegido)
    la etapa —Institucional, Regional o Interregional— y después lo que esa
    etapa pide: la Dirección Regional (las 27), la interregional (las 11 del
    art. 56, con sus regiones) o el centro educativo, opcional. La Regional
    y la Interregional no siguen sin elegir. El nombre sale de
    `nombreEventoJde()`: «JDE 2026 · Etapa Regional · DRE Alajuela —
    Individual · Categoría A · Mujeres» (el grupo se guarda aparte, en
    `grupo`, para volver a armar el nombre si cambia la etapa; `jde` guarda
    { anio, etapa, lugar }). La Dirección Regional viene elegida si la
    inscripción la trae («Dirección Regional») y la interregional, la de esa
    Dirección; la segunda vez, la que ya tenía. La Interregional queda en
    todos contra todos sin importar cuántos sean (art. 66.2.c). La Nacional
    no está: no se pidió y su sistema es otro (art. 66.2.d y e).
  - **Un equipo de más de cinco: el árbitro elige los cinco**
    (`equiposDeMas()`, art. 66.1.g: «un máximo de cinco [...] cuatro
    personas estudiantes titulares y una persona estudiante suplente»;
    pedido por el dueño del sitio). El equipo es el mismo centro, categoría
    y torneo (mujeres o abierto, ya con el pase). El panel muestra cada uno
    con una casilla por integrante: vienen marcados los cinco primeros de la
    inscripción y, con cinco marcados, las demás no se pueden marcar. Los
    que no se marcan quedan descartados: no entran a ningún torneo (ni con
    «No separar») y no cuentan en el total. La elección se guarda por
    equipo y por estado de la casilla del pase, porque los integrantes
    cambian al prenderla o apagarla; al volver, el equipo queda como estaba
    (con una sola elección, apagar y prender el pase dejaba un lugar vacío o
    descartaba a la que había pasado). En Alajuela 2026, ya sin repetidos,
    son cuatro: Gredos San Diego A abierto, B abierto y B mujeres (10 cada
    uno) y Saint John Baptist A abierto (8).
  - **La categoría por año de nacimiento** (art. 17 y 18, pedido después por
    el dueño del sitio, «que avise si es permitido o si no lo es»):
    `revisarCategorias()` mira a cada inscrito con categoría A–E y fecha, y
    el panel dice, caso por caso y escrito al frente, **«Permitido:»** o
    **«No permitido:»** y por qué. Solo avisa: nunca saca a nadie de la
    lista, porque el árbitro puede saber algo que el Excel no dice.
    - Los rangos son los del art. 17 de 2026 (A 2017–2020, B 2013–2016,
      C 2012–2014, D 2009–2011, E hasta 2008). B y C se pisan en 2013 y
      2014 porque A y B son de primaria y C, D y E de secundaria: con esos
      años, cualquiera de las dos cuadra. Otro año se corren los rangos y la
      página pide confirmarlos con la normativa de ese año.
    - **Permitido**: subir por equipos de A a B, de C a D o de D a E
      (art. 18), hasta tres por equipo. El equipo es el mismo centro
      educativo, categoría y torneo (mujeres o abierto); si en un equipo
      suben más de tres, ninguno queda como permitido, porque la lista no
      dice cuáles tres eligió el centro. Al de 2013 que sube a la D se le
      nombra la C, no «B o C»: la que sube es la de secundaria.
    - **No permitido**: jugar en una categoría menor que la suya (`mayor`),
      subir en individual (`individual`; el art. 18 lo permite solo «en los
      eventos por equipos»), un ascenso que no es de los tres (`salto`) y el
      tope de tres (`tope`).
    - Quien no trae fecha se cuenta aparte: no se puede revisar. Una
      categoría que no es A–E («Sub-10») no se revisa.
    - En la inscripción de Alajuela 2026: de 364, 4 suben por equipos (los
      4 permitidos) y ninguno está fuera de la normativa.
- **Cada torneo copia los datos del abierto** (ciudad, fechas, árbitros,
  ritmo, rondas, puntos y desempates) y se llama como su grupo con la
  regional delante («Regional Alajuela — Equipos · Categoría B · Masculino»),
  o con el nombre del torneo abierto si ya tiene uno. Si el abierto está
  vacío (sin jugadores ni rondas) se usa para el primer grupo, para no dejar
  un «(sin nombre)» de más. En «Mis torneos» quedan en el orden de la
  sugerencia (se guardan en el mismo milisegundo: se les corre la hora de a
  uno para que el orden por «el más reciente» no los mezcle).
- **Equipos**: Pareo Integral empareja jugadores, no equipos, y el panel lo
  dice. El torneo de equipos queda con la lista de cada colegio (el centro
  educativo es la institución, y la Clasificación ya se filtra por
  institución) para que el árbitro arme los equipos.
- La modalidad y la regional sirven para partir la lista y **no se guardan
  en el jugador** (`soloJugador()`); el sexo y la fecha de nacimiento sí,
  en los campos que ya tenía el jugador y que van al TRF.
- El Excel real tiene cédulas de menores: **no va al repositorio**. El
  verificador arma uno con las mismas columnas y nombres inventados
  (`js/tabla-excel.js`).

Al tocar esto, `node herramientas/verificar-pareo-grupos.js` (con el sitio en
localhost:8777): las funciones puras sin navegador (sexo, modalidad, fechas,
grupos) y, en la página, que la sugerencia salga sin agregar a nadie, el orden
y las marcas de los grupos, el inglés, que «Crear» arme un torneo por grupo
con su sistema, sus jugadores, la ciudad del abierto y sin las filas de
título, los caminos de «No separar» y «Descartar», y la revisión de categoría
por año (cada motivo, el tope de tres por equipo y el equipo de mujeres
aparte del abierto). Con la cabecera buscada solo en la primera fila, con el
grupo de uno marcado, con el tope en 4 o con el ascenso permitido en
individual, salta.

### Torneos por equipos: el orden de tableros y el pareo de encuentros

Lo pidió el dueño del sitio: la mitad de la inscripción de los JDE (193 de
364 en Alajuela 2026) es de equipos, y Pareo Integral los armaba como
torneos individuales con los jugadores de cada colegio.

- **Un equipo es un «jugador» del torneo** (`tipo: "equipos"`,
  `js/pareo/equipos.js`). Así el motor no cambia: bbpPairings (o las tablas
  de Berger) empareja equipos como empareja jugadores, con los **puntos de
  encuentro** como puntaje (2 · 1 · 0, `PUNTOS_EQUIPOS`, que van al TRF
  por la línea 162 como cualquier puntuación propia), y el comprobador de
  FIDE acepta esos pareos (`verificar-pareo-equipos.js` empareja un suizo
  de 7 equipos de punta a punta y lo pasa por el comprobador). Los
  desempates de FIDE (`js/pareo/desempates.js`, comparado con
  chesspairing) no se tocaron: ven cada encuentro como una partida.
- **Cada equipo lleva sus integrantes en orden de tableros**
  (`integrantes`, art. 66.2.h: se da en el congresillo y se mantiene en
  toda la etapa). En la ficha Jugadores se cambia con ↑ y ↓ solo antes de
  la ronda 1; el quinto es el suplente. «Imprimir el orden de tableros para
  firmar» saca una hoja por equipo con la firma del delegado y del árbitro.
  En un torneo por equipos no se agrega gente a mano ni se busca el Elo
  Nacional (sería el de un equipo), y la ficha lo dice. El Elo del equipo,
  que ordena la lista inicial, es el promedio de los que tienen Elo entre
  los cuatro primeros.
- **Cada encuentro guarda su alineación y sus tableros.** `alineacion`
  dice quiénes juegan de cada lado (de entrada, los cuatro primeros); el
  árbitro la cambia con casillas si falta alguien, y siempre queda en el
  orden de tableros: los de abajo suben y el suplente entra al final, el
  sistema olímpico que pide el art. 66.2.h. Los colores son los de las
  olimpiadas de FIDE: el equipo de la izquierda lleva blancas en los
  tableros 1 y 3. Cada tablero se anota como una partida, desde las
  blancas.
- **El resultado del encuentro no se escribe: sale de los tableros**
  (`resultadoEncuentro()`), y se guarda en `m.r` para que el resto (el
  puntaje, el TRF, los desempates, la tabla cruzada, el enlace de solo
  lectura) lo trate como una partida. Un tablero sin jugador de un lado se
  pierde solo; con menos de dos presentes (art. 66.2.f) el encuentro se
  pierde entero por incomparecencia («+-»/«-+»/«--») y el rival se lleva
  los cuatro tableros.
- **Los puntos de tablero son el primer desempate** («PT»: lo que se usa
  en las olimpiadas y lo que pide la propuesta de cambios a la normativa).
  No están en `desempates.js` a propósito: `E.clasificacion()` los calcula
  y le pide el resto a FIDE, y `E.catalogo()` solo los ofrece en un torneo
  por equipos. Con la configuración de los JDE, el suizo de equipos lleva
  PT, encuentro directo, Buchholz sin el peor y Buchholz; el todos contra
  todos, PT, encuentro directo y Sonneborn-Berger.
- **El bye de un equipo vale como un empate**: 1 punto de encuentro y 2 de
  tablero (`PUNTOS_EQUIPOS.bye`). La normativa no lo dice; es lo que se
  usa en las olimpiadas, y se cambia en «Torneo» (Bye del pareo).
- **El sistema sugerido cuenta equipos, no jugadores**: es lo que se
  empareja. La normativa dice «más de ocho personas estudiantes inscritas
  por cada modalidad», que en equipos se puede leer de las dos maneras;
  como se emparejan equipos, se cuentan equipos. El panel de la sugerencia
  dice «41 jugadores en 10 equipos». Un grupo de equipos con un solo
  centro viene desmarcado: no alcanza para un torneo.
- **En el celular, los tableros son una lista, no una tabla**: con cuatro
  columnas y nombres largos, las negras quedaban fuera de la pantalla. El
  colegio de cada jugador va en el título del encuentro.
- **La planilla para firmar** de un encuentro trae los cuatro tableros con
  quién juega con cada color y su resultado, y la firma de los dos
  capitanes.
- Lo que falta: el TRF que se baja es el de los encuentros (los equipos
  como jugadores), no el TRF de equipos de FIDE con cada partida; para
  mandar un torneo por equipos a FIDE haría falta ese formato.

Al tocar esto, `node herramientas/verificar-pareo-equipos.js` (con el sitio
en localhost:8777). Rompiendo a propósito los colores (siempre blancas el de
la izquierda), el mínimo de dos presentes o el desempate por puntos de
tablero, salta.

### El evento de los JDE: el acta, el informe y los clasificados

Lo pidió el dueño del sitio: tres papeles que la normativa pide y que se
hacían a mano. Un **evento** son los torneos que se crean juntos desde la
inscripción («JDE 2026 · Etapa Regional · DRE Alajuela»), y la ficha Archivos
de cualquiera de ellos trae la sección «El evento» (`js/pareo/evento.js`,
`pintarEvento()`).

- **Cada torneo guarda una copia de su evento** (`evento`: id, nombre,
  `jde`, fecha y `decisiones`, y `ordenEnEvento`), no hay un registro aparte:
  así el acta sale aunque se pida días después y aunque se mueva un torneo
  a otra computadora con su `.json`. Los torneos del evento son los de «Mis
  torneos» con el mismo `evento.id`, y el abierto entra con lo último que
  tiene. Las decisiones son una foto en texto llano de la sugerencia al
  crear (`decisionesDe()`): repetidos, dos modalidades y dónde quedó cada
  uno, el pase al abierto, los descartados por los topes, los equipos
  cortos, las categorías (con las frases de `textos.js` en español) y los
  hombres en el torneo de mujeres.
- **El acta del congresillo** (art. 33 y 34: lo acordado «debe quedar
  necesariamente por escrito en un Acta Oficial»): fecha, sede y árbitros
  del primer torneo, la tabla de los torneos (el ritmo va una vez arriba,
  no en una columna: en la tabla se cortaba), cada decisión en su sección
  (con «No hubo.» cuando no hubo), el **orden de tableros de cada equipo
  como está ahora** (un renglón por equipo con los nombres enteros: en una
  tabla de seis columnas se cortaban) y las firmas.
- **El informe oficial de participación y resultados** (la normativa pide
  remitir el «Informe Oficial de Participación y Resultados» a la Comisión
  Ejecutiva): la participación por centro educativo y, por torneo, los
  primeros lugares con quién clasifica, marcando el que está a medio jugar
  como provisional.
- **Los dos papeles van en español aunque la página esté en inglés**: son
  documentos oficiales del MEP.
- **Los clasificados** (art. 66.1, `cupo()`): de la Institucional, 2; de la
  Regional, 3 si su interregional cruza dos Direcciones Regionales y 2 si
  cruza tres (incisos i y j, con las interregionales del art. 56); de la
  Interregional, el primero (k). Se cuentan con las rondas completas; sin
  ninguna no hay clasificación (estarían todos «empatados» en cero). Un
  empate en el último lugar que clasifica que los desempates no
  resolvieron **se avisa, no lo decide el orden de la lista**: lo resuelve
  el árbitro.
- **La lista de clasificados se baja en el formato de la inscripción**
  (`ENCABEZADOS`, con `js/tabla-excel.js`), más la columna «Torneo»
  (Mujeres o Abierto), que la del MEP no trae: la etapa siguiente sabe dónde
  juega cada una sin suponerlo. En un torneo por equipos van los cinco de
  cada equipo que clasifica. Por eso **la Dirección Regional ya se guarda
  en el jugador** (`soloJugador()` dejó de quitarla): la necesita esta
  lista, sobre todo al pasar de la Interregional a la Nacional.
- **«Subir una lista» acepta varios archivos a la vez**: en la
  Interregional llegan las listas de cada Dirección Regional por separado.
  Con varias Direcciones en la lista, el diálogo de la etapa propone la
  interregional que las tiene a todas.

Al tocar esto, `node herramientas/verificar-pareo-evento.js` (con el sitio en
localhost:8777): los cupos, los clasificados con el empate en el corte, el
acta y el informe por dentro, la lista, y en la página el evento de punta a
punta hasta subir sus clasificados en una Interregional. Rompiendo a
propósito el cupo de la Regional, el aviso del empate o la foto de las
decisiones, salta.

### El día del torneo y el paso de una etapa a otra (JDE)

Nueve pedidos del dueño del sitio, juntos porque se usan el mismo día. El TRF
de equipos de FIDE (cada partida tablero por tablero) quedó para más
adelante, a propósito.

- **La hoja de alineación de cada ronda** (`imprimirAlineaciones()`, botón
  «Hojas de alineación» en una ronda de equipos): una hoja por equipo en
  cada encuentro, con su rival, cada integrante en el orden de tableros con
  una casilla «☐» para la X, la regla del sistema olímpico escrita, la firma
  del capitán y la hora de entrega (art. 66.2.h). Se imprime con el mismo
  mecanismo que las planillas de firma (`#pi-firmas`).
- **Los avisos de alineación** (`E.avisosAlineacion()`), arriba de cada
  encuentro: menos de dos presentes (pierde el encuentro), dos o tres
  (pierde por incomparecencia los tableros de abajo), alguien jugando
  arriba de un compañero que está antes en el orden (el suplente nunca
  arriba de un titular), alguien que no es del equipo y el orden de
  tableros cambiado después de la ronda 1. Los tres últimos no se pueden
  provocar desde la página (las casillas siempre siguen el orden y ↑ ↓ se
  apagan con rondas), pero sí llegan en un `.json` editado o viejo: por eso
  **al emparejar la ronda 1 se anota `ordenTableros`** (`E.fijarOrden()`) y
  se compara contra él; deshacer la ronda 1 lo borra. Son avisos, no
  bloqueos: el árbitro decide.
- **El mejor tablero** (`E.mejoresTableros()`, en Clasificación y en la
  premiación): de cada tablero, quienes jugaron ahí al menos la mitad de las
  rondas, por porcentaje y después por puntos. **Las partidas no jugadas no
  cuentan** (un tablero vacío, un encuentro perdido por incomparecencia):
  ganar porque el otro no vino no dice nada de cómo se jugó. Es la idea del
  premio por tablero de las olimpiadas, simplificada: las olimpiadas usan el
  rendimiento Elo, y en los JDE casi nadie tiene Elo.
- **La lista de clasificados dice de dónde viene** (columnas «Etapa» y
  «Lugar» al final de `ENCABEZADOS`). Al subirla de nuevo (`siguienteDe()`),
  si todas las filas vienen de la misma etapa, la sugerencia lo dice y el
  diálogo de la etapa abre en la que sigue, con la interregional ya elegida
  por sus Direcciones Regionales. De la Interregional no se propone nada: la
  Nacional la organiza el MEP con otra normativa. Una fila sin «Etapa» (una
  lista hecha a mano mezclada) apaga la propuesta: no se adivina.
- **Las listas de varias regionales juntas**: `quitarRepetidos()` anota de
  dónde viene cada persona (su Dirección Regional o, si no la trae, el
  archivo) y **quien viene en dos se avisa** (`variosOrigenes`): es un error
  de una de las dos regionales. Queda una sola inscripción, va al acta y
  queda para revisar antes de la ronda 1. Y si se elige una interregional
  que no tiene a alguna de las Direcciones de la lista, se pregunta antes de
  crear (casi siempre es un archivo equivocado).
- **Todo el evento desde el celular** (`#evento=<código>`, `PareoVer.iniciarEvento()`):
  un solo enlace y un QR con todos los torneos, en el mismo canal de Supabase
  Realtime en modo Broadcast que el de un torneo (ver «El canal en vivo»), con
  `V.vistaEvento()` como carga. El código se guarda por evento en el
  navegador (`pareo_evento_vivo_v1_<id>`), así el QR impreso sirve todo el
  día. **Quien abre el enlace pide el estado al entrar** (evento «pedir») y
  el organizador contesta: el enlace de un torneo, en cambio, espera al
  próximo resultado. Cada `guardar()` de un torneo del evento lo vuelve a
  mandar. Quien mira tiene un desplegable por torneo que no se cierra al
  llegar un resultado.
- **La premiación** (PDF, `V.premiacion()`): por torneo, del tercer lugar al
  primero (como se lee en el acto), con los empates que los desempates no
  resolvieron todos con su medalla, el equipo con sus integrantes y el mejor
  de cada tablero. **Los diplomas** (`imprimirDiplomas()`, `V.diplomas()`):
  uno por hoja, apaisados (`@page diploma`), uno por persona premiada (cada
  integrante del equipo, el suyo) y por mejor tablero. Los dos en español,
  como el acta.
- **Antes de la ronda 1, revisar** (`V.pendientes()`): al crear el evento,
  `decisionesDe()` guarda en `decisiones.revisar` lo que quedó abierto de la
  inscripción —quien sigue en dos modalidades sin decidir, quien vino en dos
  listas, las categorías no permitidas, los hombres en un torneo de mujeres
  y los equipos cortos— como `{ tipo, personas, vars }`, **sin texto
  armado**: se escribe en el idioma de la página al mostrarlo. Cada torneo
  muestra lo suyo (lo que nombra a alguien que juega ahí), con una casilla
  por punto, y **el botón de emparejar la ronda 1 no se prende hasta
  marcarlos todos** (y lo dice escrito). Es el único bloqueo de Pareo
  Integral, y a propósito: el resumen de quién no tiene categoría,
  institución o Elo sigue siendo solo un aviso. Lo marcado se guarda en
  `revisadoAntes`; después de la ronda 1 ya no detiene nada. La tarjeta del
  evento cuenta los puntos sin revisar de cada torneo.
- **El respaldo del evento** (`V.respaldo()`): un `.json` con todos los
  torneos (`formato: "pareo-integral-evento"`), que «Abrir un torneo»
  reconoce y abre entero. Si en ese navegador ya están los torneos de ese
  evento, pregunta antes de reemplazarlos (sin duplicarlos).

Al tocar esto, `node herramientas/verificar-pareo-jde-dia.js` (con el sitio en
localhost:8777; el canal en vivo con un doble de `window.sb`, nada sale a
Supabase). Rompiendo a propósito el conteo de las partidas no jugadas, el
aviso de fuera de orden, el bloqueo de la ronda 1, la respuesta al que pide
el estado o el aviso de dos regionales, salta.

### La sala de juego de los JDE: retrasos, incidencias, lista, medallero y el público

Diez pedidos más del dueño del sitio, para el día del torneo.

- **El reloj del retraso** (`pintarReloj()`, arriba de la ronda en juego):
  «Empezó la ronda» anota la hora, y quien no está sentado se marca con
  «No ha llegado». La página cuenta los minutos (se vuelve a pintar cada 20
  segundos) contra **el tiempo base del ritmo**, porque el art. 30 de la
  normativa dice que en ajedrez el tiempo límite para presentarse «será
  cuando el tiempo del reloj caiga a cero» (`V.minutosBase()`: «10 min + 2
  s» → 10, «1 h 30 min» → 90; el incremento no cuenta). Sin ritmo escrito no
  se declara vencido a nadie: lo dice y pide escribirlo. Vencido, «Anotar la
  incomparecencia» pone el resultado de la mesa (en equipos, el equipo
  entero sin nadie presente) y lo deja en las incidencias. Las horas, en
  hora de Costa Rica.
- **Las incidencias de cada ronda** (`R.incidencias`, `V.incidenciasDe()`):
  reclamo, sanción, decisión del árbitro u otra, con su hora y su mesa (si
  tiene). Van al informe oficial, torneo por torneo. Lo escrito entra por
  `textContent`.
- **Mover a otro torneo del evento** (`moverDeTorneo()`, botón «Mover» en
  Jugadores): solo a un torneo individual del mismo evento, y solo si
  ninguno de los dos empezó. El torneo al que llega guarda `movimientos`, y
  el acta los trae («Cambios de torneo»).
- **Reemplazar a un integrante** (`reemplazarIntegrante()`, antes de la
  ronda 1): por uno de los descartados de su centro (de las decisiones del
  evento) o por un nombre escrito a mano. Entra en el mismo lugar del orden
  de tableros; `reemplazos` va al acta. La normativa no dice si se puede: lo
  decide el congresillo, y la página solo lo anota.
- **El medallero por centro educativo** (`V.medallero()`): en la tarjeta del
  evento, en el informe y en la premiación. Un equipo cuenta **una** medalla
  para su centro (no una por integrante), y los empates del podio, todos con
  su medalla. Por oro, plata y bronce, como un medallero olímpico.
- **La pantalla para proyectar** (`#evento=<código>&proyectar`, `pintarProyector()`):
  el mismo canal en vivo del evento, un torneo a la vez en grande, y pasa
  solo al siguiente cada 15 segundos. El enlace sale junto al QR del evento.
- **Mi jugador** (el buscador del enlace del evento, `buscarJugador()`): con
  tres letras del nombre, la mesa de la ronda de cada torneo, el tablero (en
  equipos), el color, el rival, el resultado y cómo va. Para encontrar a una
  integrante, `V.vistaTorneo()` manda en cada encuentro sus tableros con los
  nombres. **Lo buscado no se borra al llegar un resultado**: el buscador se
  arma una vez y solo se repintan los torneos y la respuesta.
- **Pasar lista antes de la ronda 1** (`pintarPasarLista()`, en todo torneo,
  no solo en los JDE): una casilla por jugador o equipo, apagada de entrada.
  Prendida, en un suizo quien no llegó queda de entrada como «no viene» (se
  puede cambiar), y en todos contra todos —donde no hay «no viene» por
  ronda— se pregunta si sacarlos del torneo antes de sortear o emparejar con
  todos. Quien no se presentó va al acta (`noSePresentaron`).
- **Las estadísticas para el MEP** (`V.estadisticas()`, Excel): por torneo,
  por categoría y modalidad, y por centro, con mujeres y hombres aparte.
- **Comparar con la etapa anterior** (`V.compararEtapa()`): si al subir
  varias listas unas son de clasificados (traen «Etapa» o «Puesto»: así
  también se reconocen las que se bajaron antes de que existiera «Etapa»)
  y otras no (la inscripción del MEP), se comparan **por nombre**, sin tildes ni mayúsculas (la fecha de
  nacimiento viene escrita distinto en cada sistema), y **juega la
  inscripción**. Quien se inscribió sin haber clasificado queda para revisar
  antes de la ronda 1. Quien clasificó y no viene, solo se avisa, porque no
  está en ningún torneo. Las dos listas van al acta.

Al tocar esto, `node herramientas/verificar-pareo-jde-sala.js` (con el sitio en
localhost:8777; el tiempo con `page.clock`, el canal en vivo con el doble de
`herramientas/lib/pareo-pruebas.js`, que comparte con
`verificar-pareo-jde-dia.js`). Rompiendo a propósito el momento en que cae el
reloj, el medallero, el «no viene» de quien no llegó, la búsqueda que se pone
al día o la comparación, salta.

### El trabajo del árbitro en los JDE: adjuntos, desempates, correcciones y papeles

Once pedidos más del dueño del sitio, y marcar varios jugadores para
eliminarlos.

- **El TRF de equipos** (`E.aTrfEquipos()`, «Bajar el TRF de equipos» en
  Archivos, solo en un torneo por equipos): el TRF-16 de FIDE, con una línea
  001 por integrante y sus partidas tablero por tablero (el rival es el
  integrante del otro equipo), y una 013 por equipo con los números de sus
  integrantes (`092 Team: …`). Un tablero sin rival va «0000 - +» (lo gana
  quien estaba); un integrante que no jugó esa ronda, en blanco. Es otro
  archivo que el TRF que lee el motor (los equipos como si fueran
  jugadores), que no cambia. Los formatos de columna salen de
  `T.formatoTrf`: una sola copia. **No está comparado con un programa avalado
  por FIDE**: falta probarlo con el que use la Federación.
- **El desempate del corte** (`armarDesempate()`, `V.aplicarDesempate()`):
  con un empate en el último lugar que clasifica, «Anotar el desempate» pide
  cómo se desempató (un blitz, un Armagedón: se juega fuera de Pareo
  Integral) y el orden en que quedaron. Se guarda en `t.desempateCorte` y
  ordena a esos jugadores en la clasificación del evento (clasificados,
  podio, informe, que lo dice). **Solo vale mientras sigan empatados entre
  ellos**: si una corrección deshace el empate, se ignora sola.
- **Corregir una ronda cerrada pide el motivo** (`pedirMotivo()`): cambiar un
  resultado de una ronda cuando la siguiente ya se emparejó (en individual o
  en un tablero de equipos) abre un diálogo con el resultado de antes y el de
  ahora; sin motivo no se corrige, y el motivo queda en las incidencias
  («Corrección de un resultado»). En la ronda en juego se corrige libre,
  como antes.
- **Las apelaciones** son un tipo de incidencia con quién la presenta
  (obligatorio) y la resolución del comité, que se anota después desde la
  lista («Anotar la resolución»); el informe la trae, «pendiente» si no se
  resolvió.
- **Los árbitros adjuntos anotan desde el celular** (`#adjunto=<código>&m=1-10`,
  `PareoVer.iniciarAdjunto()`): «Enlace para un árbitro adjunto» en la
  última ronda de un torneo individual, con un rango de mesas. Por un canal de
  Supabase Realtime en modo Broadcast, como el enlace en vivo (ver «El canal
  en vivo»): el adjunto pide la ronda y manda cada resultado. **Decide la
  pestaña del árbitro principal** (`recibirDeAdjunto()`): solo la última
  ronda, una mesa que existe, sin resultado (nunca pisa uno que ya está) y un
  resultado de la lista; lo marca «lo anotó el adjunto» (`m.porAdjunto`). Lo
  que no acepta lo contesta con el estado de verdad, y el celular del adjunto
  se pone al día. Todos los adjuntos de un torneo comparten el código: el
  rango solo filtra lo que cada uno ve. **El riesgo aceptado** es el mismo
  del canal en vivo (quien tenga el código puede anotar una mesa vacía), y
  el árbitro principal ve cada resultado que llega. En equipos, todavía no.
- **La ronda atrasada** (en el reloj de la ronda): `V.duracionRonda()` es el
  tiempo de los dos jugadores más 40 jugadas de incremento, redondeado a 5
  minutos; pasado eso, dice qué mesas siguen jugando.
- **El horario del día** (en la tarjeta del evento, `V.horario()`): desde la
  hora de inicio y el descanso entre rondas, la hora de cada ronda de cada
  torneo según su ritmo, para imprimir. La hora de inicio se recuerda por
  evento en el navegador.
- **«Avisarme»** (en el buscador del enlace del evento): cuando llega una
  ronda nueva donde juega quien se buscó, lo dice en la página (`aria-live`)
  y, si la persona lo permitió, con una notificación del celular y una
  vibración. Una vez por ronda. Mientras la página esté abierta (no hay
  servidor que mande notificaciones con la página cerrada).
- **Las rondas anteriores en el enlace del evento**: `V.vistaTorneo()` manda
  también `anteriores` (sin los tableros), cada torneo trae un selector de
  ronda que se queda en la elegida aunque llegue un resultado, y «Mi
  jugador» dice lo que jugó antes.
- **Por Dirección Regional** (`V.porDireccion()`): cuando el evento junta
  varias (la Interregional), cuántos estudiantes trajo cada una, sus medallas
  y cuántos clasifican, en la tarjeta del evento y en el informe.
- **Las constancias de participación** (`V.constancias()`): una por
  estudiante que jugó al menos una ronda, haya ganado o no, una por hoja como
  los diplomas, en español.
- **Marcar varios jugadores para eliminarlos** (`pintarMasivo()`,
  `eliminarMarcados()`): una casilla por fila, la de arriba marca a todos
  los que se ven (con el buscador, solo los que coinciden), y «Eliminar los
  N marcados» pregunta antes. **Quien ya jugó una ronda no se elimina**
  (rompería las rondas jugadas): se dice cuántos quedan fuera y se retiran
  uno por uno, como siempre.

Al tocar esto, `node herramientas/verificar-pareo-jde-arbitraje.js` (con el
sitio en localhost:8777). Rompiendo a propósito que el adjunto no pise un
resultado, que el desempate deje de valer sin empate, el motivo de una
corrección o que no se elimine a quien ya jugó, salta.

### Que nada se pierda y el cierre del evento

Doce pedidos más del dueño del sitio.

- **El respaldo automático del evento** (`prenderRespaldo()`, en la tarjeta
  del evento): en Chrome y Edge se elige un archivo una vez (la API de
  archivos, `showSaveFilePicker`) y el respaldo se escribe solo, 3 segundos
  después de cada cambio. Sin esa API (Firefox, Safari), se baja solo cada
  vez que se completa una ronda, una vez por ronda. **Mientras la pestaña
  esté abierta**: el archivo elegido no sobrevive a recargar la página (hay
  que volver a prenderlo), y la tarjeta lo dice.
- **El historial de cambios** (`js/pareo/historial.js`, en Archivos): cada
  `guardar()` compara lo que se guarda con lo último guardado y anota qué
  cambió (resultados, tableros, alineaciones, incidencias, quién entra y
  quién sale, una ronda emparejada o deshecha), sin texto armado (`{ clave,
  vars }`). «Deshacer el último cambio» vuelve a la versión anterior entera.
  Vive en esta pestaña (los últimos 40), no en el torneo guardado: al
  recargar, empieza de cero. No dice **quién** cambió algo, porque Pareo
  Integral no tiene cuentas.
- **Dos pestañas con el mismo torneo**: cada pestaña dice cuál tiene abierto
  al abrirlo, por un `BroadcastChannel`, y si otra guarda el mismo torneo por
  debajo (el evento `storage`, que llega solo a las demás), el aviso de arriba
  lo dice y ofrece «Cargar lo último guardado». No bloquea nada. Los dos
  avisos llegan en cualquier orden: el de «guardó cambios» nunca se tapa con
  el más leve de «está abierto» (el CI lo agarró: a veces el leve llegaba
  después).
- **Los adjuntos en equipos y con su propio código**: cada enlace de adjunto
  se guarda en el torneo (`adjuntos`: código, rango, prendido) y tiene su
  canal; «Apagar este enlace» le avisa al celular (`apagado`) y corta solo
  ese. En equipos, el adjunto ve cada tablero del encuentro y anota uno por
  uno; un tablero sin rival o con resultado no se toca. El principal ahora
  también hace cumplir el rango de mesas, no solo el celular. Al volver a la
  ronda, los enlaces prendidos se reconectan solos.
- **La ficha del jugador en el enlace del evento**: tocar un nombre de la
  clasificación abre sus rondas, sus puntos, su puesto y sus primeros
  desempates (`V.vistaTorneo()` manda `d`), con el foco en la ficha.
- **El idioma del enlace**: un botón «English / Español» en todos los enlaces
  (`#ver=`, `#vivo=`, `#evento=`, `#adjunto=`), que guarda el idioma y vuelve
  a abrir la misma dirección.
- **Sin conexión**: el enlace del evento guarda en el celular lo último que
  llegó (`pareo_ver_ultimo_v1_<código>`), lo muestra de entrada mientras se
  conecta y, si se cae la conexión, dice de qué hora es lo que se ve. Al
  volver, pide el estado de nuevo.
- **Una sanción con efecto**: una incidencia «Sanción» con mesa (en
  individual) trae «Cambiar el resultado de la mesa», y la corrección queda
  anotada con su motivo.
- **Las planillas de anotación** (`imprimirPlanillasAnotacion()`): una por
  mesa (en equipos, una por tablero), con el torneo, la ronda, la mesa, la
  fecha, el ritmo, los dos nombres, 60 jugadas en dos columnas, el
  resultado y las firmas.
- **El cierre del evento** (`V.revisarCierre()`, «Bajar el paquete final»):
  dice lo que falta en cada torneo (rondas, un empate en el corte sin
  desempate, apelaciones sin resolver) y baja en un `.zip` el acta, el
  informe, la premiación, los clasificados, las estadísticas y el respaldo.
  Si falta algo, pregunta antes. El `.zip` sale de `TablaExcel.zip`, que ahora
  acepta bytes (los PDF) además de texto: una sola copia.
- **El ID FIDE desde la lista nacional**: la lista de ajedrezcostarica.com
  identifica a cada jugador por su ID FIDE (no hay un número nacional
  aparte), y la Edge Function ya lo devolvía; ahora, si el jugador no lo
  tenía, se le pone al encontrar su Elo Nacional. No cambió la función.

Al tocar esto, `node herramientas/verificar-pareo-cierre.js` (con el sitio en
localhost:8777; la API de archivos y la búsqueda del Elo Nacional, con
dobles). Rompiendo a propósito «Deshacer», el aviso de la otra pestaña, que
el adjunto no pise un tablero o lo último guardado del enlace, salta.

### La ronda más rápida en la sala, y el evento de punta a punta

Diez pedidos más, y antes un ensayo entero con la inscripción real de la
regional de Alajuela (364 filas, 16 torneos, todas las rondas, todos los PDF y
el paquete final, a 1280 y a 390 de ancho). El Excel real no va al
repositorio: el ensayo se corrió fuera de él. Sacó un error de verdad: **un
equipo con menos de 2 presentes** (uno de 1 integrante) perdía su encuentro
por incomparecencia, pero el resultado no se ponía hasta que alguien tocara un
tablero, y como no hay nada que anotar, la ronda quedaba en «Faltan 1
resultados» para siempre. Ahora `emparejar()` pone el resultado de esos
encuentros al emparejar. (Lo otro que pareció raro —un suizo de 10 equipos
que no emparejaba la ronda 6— era del ensayo: con todo «1-0» todos los
encuentros dan 2-2; con resultados al azar se jugaron las 7 en 5 de 5.)

- **«Un día de los JDE, paso a paso»**: la sección 10 del manual
  (`pareo-manual.html#es-jde` y `#en-jde`): antes, el congresillo, cada ronda
  y el cierre, con el botón de cada cosa. De paso se corrigió la frase vieja
  de que Pareo Integral no hace torneos por equipos.
- **«Solo lo de los JDE»** (en Mis torneos): esconde el comprobador, el
  generador al azar y los créditos (`.pi-no-jde`), que en los JDE no se usan.
  Se recuerda en el navegador (`pareo_modo_jde_v1`). Es solo pantalla: no
  cambia nada del torneo.
- **Buscar una mesa por el nombre** (`#pi-buscar-mesa`): cada mesa (o
  encuentro, con los nombres de sus integrantes) lleva `data-nombres` sin
  tildes ni mayúsculas; Enter salta al primer resultado que se ve.
- **Los atajos del resultado**: en un select de resultado, 1 gana blancas, 0
  gana negras, = (o 5) tablas, y el foco salta solo a la mesa siguiente. En
  una ronda cerrada el diálogo del motivo sale igual: el atajo no se lo salta.
- **«Todo para imprimir»**: la plantilla de la pared, las hojas de alineación
  (en equipos), las planillas para firmar y las de anotación, en una sola
  impresión. Las funciones de cada hoja se juntan (`impresion.juntando`) en
  vez de imprimir cada una por su lado; cada hoja empieza en página nueva.
- **El desempate «Por tableros» (TB)**: en un torneo por equipos, los puntos
  del tablero 1; a igual, los del 2, y así. Se guarda como un solo número en
  base 100 de medios puntos (`E.codificarTableros`) para que se compare como
  los demás, y se muestra tablero por tablero (`E.textoTableros`). En un
  encuentro perdido por incomparecencia, el que vino suma 1 en cada tablero.
  No va a la ficha del jugador del enlace del evento (ese número no se lee).
- **Los capitanes confirman la alineación desde el celular**: un enlace y un
  QR por equipo (`#capitan=<código>`, guardado en `capitanes` del torneo,
  canal `pareo-capitan-<código>`). El capitán marca entre 2 y 4 y lo manda;
  **lo decide la pestaña del árbitro principal**, no el celular: solo en la
  última ronda, solo si el encuentro todavía no tiene ningún tablero anotado y
  solo con integrantes de su equipo. Lo que no vale no entra y el celular
  vuelve a recibir el estado. El encuentro dice «Confirmada por el capitán a
  las …». El riesgo de un enlace pasado a quien no es aceptado como en los
  adjuntos: el árbitro lo ve y lo cambia.
- **El paquete para chess-results**: chess-results no recibe archivos directo
  (se abren en Swiss-Manager y se suben desde ahí), así que se baja un `.zip`
  con el TRF de cada torneo hasta la última ronda completa y, en los de
  equipos, también el TRF de equipos.
- **Comparado con el año anterior** (`V.compararAnioAnterior()`): los
  torneos de la misma etapa y lugar del año anterior, de
  `data/ajedrez-estudiantil.json`, por categoría, modalidad y rama, contra los
  de este evento. Solo el ritmo clásico, y se cuentan participantes como allá
  (jugadores en individual, equipos en equipos).

Al tocar esto, `node herramientas/verificar-pareo-ronda.js` (con el sitio en
localhost:8777; Realtime y el archivo del año anterior, con dobles). Rompiendo
a propósito el resultado del encuentro sin presentes, la validación del
capitán, el punto por tablero del que vino o el filtro de la búsqueda, salta.

### Lo que salió del ensayo, la sala y el evento en más de una computadora

Diez pedidos más del dueño del sitio.

- **El singular** (`js/pareo/textos.js: t()`): si una clave tiene su versión
  `…Uno` y `{n}` es 1, se usa esa («Falta 1 resultado», «Se agregó 1
  jugador»). Una sola regla en `t()`, no un `n === 1 ? … : …` en cada
  llamada. Las dos claves viejas que ya terminaban en «Uno» (`cortosUno`,
  `revisarFaltaUno`) no chocan: su nombre sin «Uno» no existe.
- **La propuesta de torneos, más corta**: con la inscripción real de
  Alajuela medía 2705 px y ahora 2291 (a 1280). Los grupos van en dos
  columnas, las preguntas de «dos modalidades» con sus opciones en una
  línea, lo que se lee una sola vez («cómo se arman los torneos») plegado, y
  arriba un índice «Para revisar abajo» que lleva el foco a cada parte. De
  paso se arregló un «null» que se veía cuando la lista no traía de qué
  etapa venía (`caja.append` nativo escribe `null`; ahora se filtra).
- **Los resultados para confirmar** (`V.sorpresas()`, `#pi-confirmar`):
  quien tiene 400 o más puntos de Elo menos le gana a su rival, o un
  adjunto manda para una mesa ya anotada otro resultado
  (`R.discrepancias`). **No se cambia nada solo y no bloquea emparejar**:
  la sorpresa es posible, y lo del adjunto puede ser él el que se equivocó.
  Se confirma con «Está bien así» (`R.confirmadas`, por mesa y resultado:
  si el resultado cambia, vuelve a preguntar) o, en la última ronda,
  «Poner» el del adjunto.
- **El adjunto en una tableta**: «Letra grande» (se recuerda en ese
  aparato) y los tres resultados de siempre como botones a un toque; los
  raros siguen en el selector. Lo que se manda es lo mismo de antes.
- **La cuenta regresiva**: el horario del día (inicio y descanso, que ahora
  se guardan los dos) viaja en el enlace del evento solo si quien organiza
  lo puso (`vistaEvento(…, horario)` → `horas`). El celular y el proyector
  dicen «Ronda 2 a las 10:10 · faltan 25 min» con la hora de Costa Rica, y
  se vuelve a pintar cada 30 segundos. Un torneo que ya va más adelante que
  el horario no muestra nada (sería mentira).
- **Varios eventos guardados**: la lista de torneos va agrupada por evento
  (el evento se guarda en la lista, `pareo_lista_v1`; las listas viejas se
  completan leyendo cada torneo una vez) y, con dos o más eventos, aparece
  el filtro «Evento» (se recuerda). Al elegir otro evento se abre su último
  torneo.
- **Pasar el evento a otra computadora**: un código nuevo cada vez y un
  canal Broadcast (`pareo-pasar-<código>`), como el enlace en vivo: la otra
  abre `pareo.html#recibir=<código>` y pide; **esta pregunta antes de
  mandar** (el evento trae nombres y fechas de nacimiento de menores) y lo
  manda comprimido en partes de 60 000 caracteres. La que recibe limpia la
  dirección y lo abre como un respaldo (si ya tenía ese evento, pregunta
  antes de reemplazarlo). No se guarda en ningún servidor.
- **El informe para la prensa** (`V.informePrensa()`): cuántos jugaron y de
  cuántos centros, campeón y subcampeón de cada torneo («Campeona» en los
  de mujeres), los mejores tableros y la edad más joven en un podio. Es un
  texto para revisar y pegar, no un PDF.
- **«Avisarme» de verdad en el celular**: Chrome en Android no deja
  `new Notification()` (da error, y se tragaba callado): la notificación
  sale por el service worker del sitio (`registration.showNotification`) y,
  si no hay, como antes. A quién se sigue se guarda por código de evento
  (`pareo_ver_seguir_v1_<código>`): al volver a abrir el enlace se sigue
  avisando, y el botón pasa a «Dejar de avisarme de …». **Con la página
  cerrada no avisa**: eso pide notificaciones push con un servidor que las
  mande, y Pareo Integral no tiene uno.
- **Sus JDE de años anteriores** en la ficha del jugador del enlace del
  evento: con un botón, porque los datos pesan más de un megabyte
  (`js/jde-datos.js`, los mismos de «Ajedrez estudiantil en Costa Rica»).
  Quién es quién: el mismo nombre sin tildes, o el único cuyos nombres
  están todos en el de la inscripción (o al revés), con tres o más; si
  podrían ser dos, ninguno (`V.buscarEnHistorial()`).

Al tocar esto, `node herramientas/verificar-pareo-sala.js` (con el sitio en
localhost:8777; Realtime, el reloj y los datos de los JDE, con dobles).
Rompiendo a propósito el singular, la diferencia del adjunto, el «no» al
pasar el evento, lo que se recuerda de «Avisarme» o el horario en el
enlace, salta.

### El acta firmada, la sala y lo que ven las familias

Diez pedidos más del dueño del sitio.

- **El reloj de la ronda en el proyector**: con «Empezar la ronda» (el reloj
  del retraso), el enlace del evento lleva `ronda.inicio`, y el proyector
  dice desde cuándo se juega y qué mesas faltan por terminar.
- **El artículo de las Leyes del Ajedrez en cada incidencia**
  (`V.ARTICULOS`): pieza tocada (4.3), tiempo agotado (6.9), llegar tarde
  (6.7), jugada ilegal (7.5), tablas por acuerdo (9.1), triple repetición
  (9.2), 50 jugadas (9.3), tablas automáticas (9.6), aparato electrónico
  (11.3.2), molestar al rival (11.5) y las sanciones (12.9), según las
  Leyes vigentes desde 2023. El informe lo lleva al lado de cada incidencia.
- **La mesa fija** (`mesaFija` en el jugador, `V.aplicarMesasFijas()`): para
  una silla de ruedas o una necesidad especial. Después de emparejar, su
  partida se cambia de lugar con la que estaba en ese número: **no cambia
  con quién juega ni el color** (el pareo es el del motor). Si la mesa de
  destino ya es fija de otro, no se le quita. En equipos no aplica.
- **Revisar el pareo antes de anunciarlo** (`V.revisarPareo()`): dos del
  mismo centro en una mesa, el mismo color tres rondas seguidas y, en un
  suizo, más de un punto de diferencia. El Sistema Holandés no lo prohíbe
  (los colores, solo en casos raros), así que **no se cambia nada solo**:
  si algo no conviene, se deshace el emparejamiento y se vuelve a
  emparejar. Se quita con «Visto», o solo, cuando la ronda tiene
  resultados.
- **Las firmas del acta**: en la pantalla (con el dedo o el mouse,
  `PareoVer.padFirma()`) o desde un celular (`#firma=<código>`, canal
  `pareo-firma-<código>`). La del celular **se pregunta antes de ir al
  acta**, y lo que no tiene forma de firma (cargo desconocido, una imagen
  rara o de más de 300 000 caracteres) se rechaza sin preguntar. Se guardan
  en JPEG con fondo blanco (el PDF no lleva transparencia) en el evento de
  cada torneo, y el acta las pone como imagen con el cargo, el nombre y la
  hora. Las que faltan quedan con la línea para firmar a mano.
- **La nota de un árbitro adjunto**: desde su enlace, con su nombre (se
  recuerda en ese celular) y, si quiere, una de sus mesas. Llega a las
  incidencias de la ronda como «Nota de un adjunto» y de ahí al informe
  oficial. Lo escrito no se borra cuando llega un resultado nuevo (la
  caja se arma una sola vez).
- **La inscripción el mismo día**: agregar a alguien en un torneo de los JDE
  revisa su categoría con su año de nacimiento (art. 17 y 18) y, si el
  torneo ya tiene rondas, queda anotado en el acta, en «Inscripciones el
  día del torneo», con la ronda en que entró. Si la normativa lo permite o
  no, lo decide el comité: Pareo Integral no lo bloquea.
- **El cartel para la entrada**: el nombre del evento, el QR del enlace en
  vivo (si está apagado, pregunta antes de prenderlo), el horario si se
  puso y los torneos, en una hoja.
- **Los certificados de los árbitros** (`V.certificadosArbitro()`): uno por
  persona que figura como árbitro principal o adjunto de algún torneo del
  evento (los adjuntos separados por coma o punto y coma), con sus cargos y
  rondas: sirve de respaldo para sus normas.
- **«Mi centro» en el enlace del evento**: la clasificación de cada torneo
  lleva el centro educativo (`i`), y el celular deja elegir uno y ver solo a
  sus estudiantes en todos los torneos. Se recuerda en ese celular.

Al tocar esto, `node herramientas/verificar-pareo-actas.js` (con el sitio en
localhost:8777; Realtime y el reloj, con dobles). Rompiendo a propósito la
firma que no vale, la mesa fija, el aviso del mismo centro, la nota sin
nombre o la caja de la nota que se rearma, salta.

### El Elo de cada jugador, sin internet y con un evento grande

Tres pedidos del dueño del sitio.

- **El Elo que gana o pierde cada jugador** (`js/pareo/elo.js`): en la
  clasificación y su PDF, tres columnas más (Rp, K y ±Elo) cuando el torneo
  es individual y alguien tiene Elo. Con las reglas de FIDE (B.02, vigente
  desde 2024): solo partidas jugadas entre dos jugadores con Elo (no las
  incomparecencias ni los byes, ni contra quien no tiene Elo); más de 400
  puntos de diferencia cuenta como 400; lo esperado sale de **la tabla
  8.1.2 escrita tal cual** (sus cortes casi son los puntos medios de la
  tabla 8.1, pero no en los empates: 25 da 0,53 y 392 da 0,92; la primera
  versión los calculaba y el verificador lo agarró en 392); K = 40 con menos
  de 18 años al terminar el año y menos de 2300, 10 desde 2400, 20 los
  demás. El K 40 del jugador nuevo (menos de 30 partidas con Elo) no se
  puede saber desde acá: se anota en «Editar». El rendimiento (Rp) es el
  Elo medio de los rivales con Elo más la diferencia de la tabla 8.1 por su
  porcentaje. **Es una cuenta del torneo, no el Elo oficial**, y la página
  lo dice: lo publica FIDE o la federación con todos los torneos del
  período, y se usa el Elo que tenga anotado cada uno (FIDE o Nacional).
- **Sin internet**: el service worker del sitio va a la red primero y, sin
  señal, sirve lo que tenga guardado; pero solo guarda lo que pasó por él, y
  en la primera visita la página carga antes de que exista, y el motor (y
  su `.wasm` de 430 KB) se pide recién al emparejar. Así que Pareo Integral
  guarda por su cuenta lo que necesita —la página con y sin `.html`, sus
  scripts, hojas e imágenes, el motor, el QR, las letras de
  `css/fuentes.css` y el manual— en la caché que no se borra al cambiar de
  versión (`ajedrez-integral-sin-red`, la de «Ejercicios sin internet»), un
  segundo y medio después de abrir y cada 6 horas con señal. Arriba dice si
  quedó «Listo para usar sin internet» y, sin conexión, qué sigue
  funcionando y qué espera (lo en vivo, el Elo Nacional, pasar el evento).
  Probado de verdad: se recarga sin red y empareja con el motor guardado.
- **Un evento grande, ensayado con 800 jugadores** en un suizo de 9 rondas:
  agregarlos, pintarlos, la clasificación, la tabla cruzada, los PDF, el
  TRF y recargar tardan menos de un segundo cada uno; anotar un resultado,
  unos 10 ms; lo guardado, 350 KB. Lo que se encontró:
  - **Emparejar 800 jugadores en un solo torneo tarda 15-20 segundos**, y
    no es la página: es el motor (bbpPairings, compilado con -O3), que crece
    con el cubo de los jugadores (200 tardan 0,3 s; 400, 1,8 s). No hay
    nada que acelerar sin cambiar de algoritmo. Corre en un Worker, así que
    la página no se congela; ahora, con 250 o más, dice cuánto puede tardar
    y cuenta los segundos (la cuenta va fuera de la región que lee el
    lector de pantalla, para no repetirla cada segundo). En los JDE cada
    categoría es un torneo aparte, así que esto casi no pasa.
  - **El enlace en vivo de un evento de 800 pesa unos 360 KB**, y Supabase
    Realtime corta un mensaje de más de 256 KB en el plan gratuito sin dar
    ningún error: el celular se quedaba con lo último que le llegó. Ahora lo
    que pasa de 180 KB va comprimido (`PareoVer.paraMandar()`, unos 30 KB) y
    el celular lo descomprime (`alLlegar()`). Lo chico sigue yendo tal
    cual, para que lo lea un celular viejo sin `DecompressionStream`.

Al tocar esto, `node herramientas/verificar-pareo-elo.js` y
`node herramientas/verificar-pareo-sin-red.js` (con el sitio en
localhost:8777; el segundo deja correr el service worker, a diferencia de
los demás). Rompiendo a propósito el guardado, el motor en la lista, la
compresión, el tope de 400 o que solo cuenten las partidas jugadas, salta.

### Las hojas ordenadas, la marca de agua y las marcas de incidencias

Cuatro pedidos del dueño del sitio, con fotos de cómo salían las hojas.

- **La plantilla de la pared, en columnas**: antes cada mesa era una línea
  de texto, y con un nombre de dos líneas el guion y la casilla del
  resultado se corrían. Ahora es una cuadrícula (Mesa · Blancas · – ·
  Negras · Resultado) con las columnas fijas, filas cebra (con
  `print-color-adjust` para que la impresora no las quite) y, desde la
  ronda 2, los puntos de cada uno entre paréntesis. Sigue sin el resultado
  puesto: es para antes de la ronda.
- **Las planillas para firmar, cuatro por hoja**: cada mesa es una tarjeta
  con la mesa, la ronda y el torneo arriba, Blancas y Negras, las casillas
  del resultado (o el resultado anotado, en negrita) y dos líneas de firma
  con el nombre debajo; en equipos, los tableros y la firma de cada
  capitán. Ya no hay un salto de hoja por mesa: las tarjetas se juntan
  (`break-inside: avoid`) con una línea punteada para cortarlas. Cuatro
  miden unos 22 cm, dentro de los ~25 que deja una hoja carta.
- **La marca de agua de Ajedrez Integral en todo lo que sale**: en lo que
  se imprime desde el navegador, `#pi-marca-agua` va `position: fixed` (así
  se repite en cada hoja) al 7 % y solo en `@media print`; en los PDF,
  `PareoPDF.generar()` le pone `doc.marca` con `MarcaAgua.prepararDesde()`
  antes de `ReportePDF.generar()` (si la imagen no llega, sin conexión por
  ejemplo, el PDF sale igual, sin marca). **Es una imagen propia, sin el
  nombre de Oscar**, como la pidió el dueño: el dibujo de
  `img/logo-oscar-angulo-marca.png` sin la cinta del nombre y «AJEDREZ
  INTEGRAL» en Cinzel debajo; la arma `herramientas/marca-agua-ajedrez-integral.js`
  y no se edita a mano. Solo la usa Pareo Integral: los informes del resto
  del sitio siguen con la de siempre. Los avisos de la página (`#avisos-zona`)
  tampoco salen en el papel: antes uno recién mostrado quedaba impreso.
- **Las marcas de incidencias junto al nombre**: cada incidencia de la
  ronda que tiene un jugador lo marca en el pareo, una «i» por cada jugada
  ilegal y una «!» por cada otra irregularidad («ii!» son dos ilegales y
  una irregularidad), para que el árbitro sepa de un vistazo quién pierde
  con la próxima (art. 7.5.5: la segunda ilegal pierde). Las correcciones y
  las apelaciones no marcan a nadie (`marcasIncidencias()` en
  `js/pareo/evento.js`). Se cuentan por ronda, que es por partida. La marca
  es un botón: al tocarlo se abre debajo de qué fue cada una (y, con una
  ilegal, «con otra pierde»; con dos, «pierde la partida»), y cerrado no
  ocupa más que las letras. Color (rojo oscuro sobre rosado, 8,5:1; 10:1 en
  oscuro) y letra: el color nunca va solo. Para anotarle una incidencia a
  alguien, el formulario pide ahora el jugador, de entre los dos de la
  mesa elegida (o los de cada tablero, en equipos).
- **El adjunto, desde el celular, anota lo mismo**: la mesa, el jugador
  (de esa mesa), el tipo (reclamo, sanción, decisión u otra) y el artículo,
  y ve las marcas en sus mesas. Al celular no le llegan los ids de los
  jugadores: le llega una clave por lado («b», «n», o «t2b» en el tablero 2
  de un encuentro) y la principal la vuelve a buscar en la mesa al
  recibirla; una clave que no es de esa mesa, un tipo o un artículo que no
  existen, se descartan y la nota entra igual, sin eso.

Al tocar esto, `node herramientas/verificar-pareo-hojas.js` (mide las
columnas y las tarjetas con la vista de impresión, y busca la marca en el
PDF) y `node herramientas/verificar-pareo-marcas.js`. Rompiendo a propósito
las columnas, el corte entre tarjetas, la marca de agua, que las
correcciones no marquen, la cuenta de ilegales o que el jugador sea de la
mesa, salta.

### La planilla de anotación en una hoja y los equipos mesa a mesa en el celular

Dos pedidos del dueño del sitio, con fotos.

- **La planilla de anotación en UNA hoja**: salía en dos (las jugadas 27-30
  y 57-60 se pasaban a otra hoja: 7 mesas daban 14 hojas) y con la dirección
  de la página y «1/14» que el navegador imprime en sus márgenes. Ahora cada
  planilla es su propia página con nombre (`@page planilla { margin: 0 }`):
  sin margen no hay dónde imprimir la dirección, y el margen lo pone la
  planilla misma (0,6 a 0,8 cm, lo que la impresora no corta). La cabecera
  va compacta (el torneo, la ronda y la mesa en dos renglones; Blancas y
  Negras lado a lado), los renglones de las jugadas miden 0,66 cm (antes
  0,61; 0,68 hasta que llegó el QR de cada jugador) con una raya más gruesa cada 5 y entre la 30 y la 31, y abajo las
  casillas del resultado y las dos firmas. Todo suma 26,8 cm, menos que una
  hoja carta (27,9), la más baja de las dos que se usan. **Una trampa**: el
  contenedor de la pantalla (`#pi-envoltorio`) queda vacío al imprimir pero
  con su relleno, y como es de la página por omisión, la primera planilla
  salía en la segunda hoja con una en blanco antes; al imprimir hojas se
  esconde.
- **Tocar un equipo en el enlace del celular**: en un torneo por equipos,
  la ronda decía solo el resultado del encuentro. Ahora cada equipo de un
  encuentro es un botón que abre sus tableros (quién juega con cada color y
  cómo va cada uno, «jugando» si todavía no termina, y cuántos van
  terminados), con `aria-expanded`. Lo abierto se recuerda aparte, porque en
  vivo la vista se pinta entera con cada novedad y si no se cerraría sola.
  Los tableros los arma `tablerosVista()` en `js/pareo/evento.js`, una sola
  copia para el enlace del torneo y el del evento.
- **Dos arreglos que se vieron en la misma foto**: el bye decía «corto_bye»
  (no hay texto corto para el bye: la columna de Negras ya dice «bye»), y la
  clasificación con la ronda 1 en juego salía con todos primeros y 0 puntos,
  que parece un error: la clasificación cuenta solo las rondas terminadas, y
  ahora lo dice («Todavía no termina ninguna ronda: la 1 se suma cuando
  termine»).

Al tocar esto, `node herramientas/verificar-pareo-hojas.js` (cuenta las hojas
de verdad en el PDF que arma Chromium) y
`node herramientas/verificar-pareo-vivo-equipos.js`. Rompiendo a propósito el
margen, la altura de los renglones, el envoltorio, lo abierto que se
recuerda, el texto del bye o la nota de la clasificación, salta.

### Archivar torneos y pasar de un torneo a otro del evento en el celular

Dos pedidos del dueño del sitio: que los torneos terminados no estorben en la
lista, y que desde el enlace en vivo se pueda ir a los otros torneos del JDE.

- **«Archivar torneos»**, junto a «Nuevo torneo»: un panel con una casilla
  por torneo, agrupados por evento, que dice cómo va cada uno (terminado,
  sin empezar, «k de n rondas») y cuál está abierto. «Marcar los
  terminados» y «Marcar todo el evento» marcan de una vez. Archivar **baja
  primero** un archivo .json (el mismo formato del respaldo de un evento:
  si son de un solo evento, es su respaldo; si se mezclan, lleva un evento
  que solo sirve de rótulo) y **después** los quita del navegador; si se
  archivó el abierto, se abre otro. Vuelven con «Abrir un TRF o una copia
  .json». Lo archivado vive solo en ese archivo, y el aviso lo dice.
- **Un arreglo que salió de esto**: abrir un respaldo reemplazaba a TODOS
  los torneos de ese evento que hubiera en el navegador. Con un archivo de
  archivados que trae solo algunos (el SUB-10 terminado), habría borrado al
  SUB-12 que sigue en juego. Ahora solo cuenta como repetido el del mismo
  evento y con el mismo nombre que uno del archivo.
- **Los torneos vinculados en el celular**: el enlace en vivo de un torneo
  de un evento muestra arriba «Este torneo es parte de … Los demás:» con un
  enlace por torneo, que abre el enlace en vivo del evento con ese torneo
  desplegado (`#evento=<código>&t=<torneo>`), y «Ver todo el evento». Para
  que esos enlaces lleven a algo, poner en vivo un torneo de un evento pone
  en vivo también el evento (si no había otro). Por el canal va el código
  del evento, no la dirección, y el celular la arma solo si el código parece
  un código: lo que llega por un canal público no va tal cual a un `href`.
  En el enlace del evento, «Ir a un torneo» abre el que se elija y lleva el
  foco hasta él. Como ir de un enlace a otro cambia solo el «#», las páginas
  para ver se vuelven a cargar con `hashchange`.

Al tocar esto, `node herramientas/verificar-pareo-archivar.js`. Rompiendo a
propósito el nombre en los repetidos, «Marcar los terminados», el código
del enlace o el evento en vivo junto con el torneo, salta.

### Un día de JDE con muchas categorías

Nueve mejoras que pidió el dueño del sitio de una vez («si todas»).

- **Las plantillas de la pared de todas las categorías** («Archivos y
  comprobador» del evento): la ronda en juego de cada torneo, una plantilla
  por hoja (`.pi-plantilla-hoja + .pi-plantilla-hoja { break-before: page }`),
  en un solo trabajo de impresión. `imprimirPlantillaMesas(r, deOtro)` saca
  los nombres del torneo que recibe, no del abierto.
- **Reimprimir una mesa**: debajo de las mesas, la planilla de anotación o la
  de firmar de una sola. Va debajo y no junto a los botones de arriba a
  propósito: los selects de resultado tienen que ser los primeros de
  `#pi-ronda` (los busca así el teclado y también las pruebas, y un select
  arriba rompía `verificar-pareo-jde-dia.js` sin dar ningún error).
- **Un QR por jugador en la planilla de anotación**, solo con el evento en
  vivo (sin él, llevaría a una página que espera): abre el enlace del evento
  con `&q=<nombre>`, y «Mi jugador» ya viene buscado. Mide 1,6 cm, lo que
  un celular lee sin acercarse de más; para que la planilla siga en una
  hoja, los renglones bajaron a 0,66 cm (antes de esto, 0,61).
- **La ronda lista para emparejar**: al anotarse la última mesa (y si quedan
  rondas), un aviso que se queda 20 segundos y, si se prende «Sonido al
  completar una ronda», dos notas cortas (el audio del navegador, nada que
  bajar). En la lista de torneos, el listo dice «lista para la ronda N»
  junto al nombre: con varias categorías a la vez se ve cuál puede seguir.
- **Equipos en el celular**: la clasificación lleva los puntos de tablero
  (PT, el primer desempate) y abajo los mejores de cada tablero hasta ahora
  (`mejoresVista()`, los tres primeros).
- **Archivar al cerrar el evento**: el paquete final ya trae el respaldo, así
  que después de bajarlo se ofrece quitar el evento de la lista (sin bajar
  otro archivo).
- **La lista de lo archivado**: en el panel de «Archivar torneos», qué se
  archivó, cuándo y en qué archivo, para saber cuál buscar. Solo nombres y
  fechas: lo archivado no se guarda en el navegador. «Olvidar esta lista».
- **El adjunto avisado**: cuando empieza una ronda nueva, su celular vibra
  (si deja) y lo dice arriba con `role="alert"` hasta que toque «Listo»;
  al entrar no avisa nada.
- **La hora de la próxima ronda en «Mi jugador»**, del horario que puso quien
  organiza.

Al tocar esto, `node herramientas/verificar-pareo-dia-evento.js` (con el reloj
del navegador fijo para la hora de la próxima ronda). Rompiendo a propósito
el salto entre plantillas, la mesa sola, el aviso del adjunto, la hora o los
puntos de tablero, salta.

### La sala del evento: mesas, gafetes, llamados, inscripción y premiación

Siete mejoras más para un JDE con varias categorías en la misma sala.

- **Las mesas de la sala**: cada torneo puede tener su rango de mesas físicas
  (`t.mesaInicial`, la primera; «Numerar seguido» pone cada uno donde
  terminó el anterior, según cuántas mesas necesita: la mitad de sus
  jugadores, redondeada para arriba). La ronda, la plantilla de la pared,
  las planillas, las alineaciones y el celular dicen la mesa de la sala
  (`V.mesaFisica(t, i)`, y `f` en lo que va al celular). **Por dentro, la
  mesa sigue siendo su posición en la ronda**: lo que manda un adjunto, la
  incidencia, la corrección y el historial se siguen refiriendo a ella, y
  así un evento a medias puede renumerarse sin romper nada.
- **El plano de la sala**, para la entrada: cada categoría con sus mesas.
- **Los gafetes** de todos los jugadores del evento (en equipos, de cada
  integrante con su equipo): nombre, categoría, centro y un QR a «Mi
  jugador», ocho por hoja carta. El código del enlace del evento se guarda
  al imprimirlos, así el QR impreso días antes sirve cuando el evento se
  ponga en vivo.
- **Cuánto duró cada ronda**: al guardar se anota cuándo se emparejó
  (`R.emparejada`, si todavía no tiene ningún resultado) y cuándo se anotó
  la última mesa (`R.fin`; si se borra un resultado, se quita). Una ronda de
  antes de esto no tiene hora de emparejar y no se le inventa el fin. La
  tabla va en el panel del evento y en Excel; la duración se cuenta desde
  el reloj o, sin reloj, desde que se emparejó.
- **El llamado a la ronda en el proyector**: cuando una categoría empareja
  una ronda nueva, el proyector deja de pasar torneos y muestra sus mesas
  en grande 45 segundos (varias, una detrás de otra). «Leer en voz alta»
  lo dice además con la voz del navegador; lo tiene que prender alguien en
  esa computadora, porque el navegador no deja hablar sin que se toque
  algo. Al entrar, lo que ya estaba emparejado no se anuncia.
- **La premiación en el proyector**: un torneo terminado manda su podio
  (`podio` en `vistaTorneo`) y el proyector, en su turno, muestra los tres
  primeros con su centro (y los mejores tableros en equipos).
- **La inscripción desde el celular**: un enlace (`#inscribir=<código>`, por
  un canal de Broadcast como el de los adjuntos) para que el entrenador de
  un centro mande a quien falta. Pide la casilla de consentimiento con la
  política de privacidad (son datos de una persona). Lo que llega queda en
  una lista del árbitro y **entra solo si lo acepta**, por la misma puerta
  que cualquier inscripción (`agregarJugadores()`: con rondas jugadas, al
  acta como tardía, y la revisión de la categoría por el año). Se descarta
  lo que nombra un torneo que no es del evento y lo repetido; la lista se
  guarda en el navegador del árbitro. Solo torneos individuales.

- **La sugerencia de partir una inscripción, más fácil de leer** (pidió el
  dueño del sitio con una foto): arriba, las cifras (jugadores, torneos
  marcados, cuántos no alcanzan); los grupos, en una sección por modalidad
  (Individual, Equipos) con una tarjeta por grupo: la categoría y el sexo en
  grande, cuántos son a la derecha y el sistema debajo; la marcada con
  borde lleno y la que no se crea, punteada (lo dice también su casilla).
  La modalidad no se repite en cada tarjeta pero sigue en el texto para el
  lector de pantalla, y el texto de cada una conserva «— N jugadores», que
  es como lo leen las pruebas. La revisión de categoría por año ya no es
  una lista de cientos de oraciones: va agrupada por motivo (art. 17, art.
  18…), cada grupo plegable con cuántos son y el nombre en negrita.
  Debajo, cada tema que hay que revisar (repetidas, dos modalidades, pase al
  abierto, topes, equipos cortos, categoría) va en su tarjeta con el título
  más grande. Las inscripciones repetidas llevan el sello «Ya resuelto», y
  quien está en dos modalidades tiene su tarjeta: el nombre, el centro y sus
  dos inscripciones, el estado escrito («Sin decidir» o «Queda en…») y las
  opciones como botones («Solo en Equipos B», «Todavía no decido»); arriba,
  «Faltan N por decidir» o «Todos decididos». El estado nunca va solo en el
  color, y el contraste se midió en claro y en oscuro (el peor, 7,8:1).

Al tocar esto, `node herramientas/verificar-pareo-sala-evento.js`. Rompiendo a
propósito la mesa física, la casilla de consentimiento, el llamado, el fin de
la ronda o el aceptar, salta.

### Pareo Integral: los adjuntos con nombre, el chat, las llamadas y corregir con constancia

Lo pidió el dueño del sitio (con una captura del formulario del enlace).

- **El nombre del adjunto.** El enlace no se crea sin él (`a.nombre`). Sale
  en su tarjeta, arriba de su celular («Árbitro adjunto: …», con el
  principal) y en cada resultado que anotó («lo anotó …»: `m.porAdjunto`
  guarda el nombre y `m.adjunto` su código).
- **Corregir, con confirmación y constancia.**
  - El principal: cambiar en la ronda en juego un resultado ya anotado
    pregunta «¿Cambiar el resultado de la mesa 3 de 1-0 a 0-1?» («Sí,
    cambiarlo» / «Dejarlo como estaba»), y el cambio queda en las
    incidencias (tipo «correccion», que van al informe). En una ronda ya
    cerrada sigue como antes: pide el motivo.
  - El adjunto: desde su celular puede corregir **solo lo que anotó él**
    («Corregir», elegir el nuevo y confirmarlo); queda la constancia con su
    nombre. Lo que anotó otro (o el principal) sigue sin pisarse: queda como
    discrepancia para que el principal decida. En equipos, por tablero, solo
    corrige el principal.
- **El chat.** Del principal a todos los adjuntos o a uno, y de cada adjunto
  al principal (`t.chat`, los últimos 300, con la hora). Viaja por el mismo
  canal del adjunto, con su estado: cada adjunto ve lo que es para todos,
  para él y lo suyo.
- **«Necesito al principal en esta mesa».** El adjunto elige la mesa (de su
  rango) y avisa; al principal le sale un aviso y, arriba de la ronda, «Te
  necesitan en una mesa» con «Voy», que la marca atendida y se lo dice al
  adjunto por el chat («Voy para la mesa 2»). Su celular dice si ya va.

Lo comprueba `verificar-pareo-adjuntos.js`.

### Torneos en Pareo Integral: todo torneo se publica solo

Lo decidió el dueño del sitio: «que se vean todos los torneos que hagan
todos los árbitros», y entre publicarlos solos con la opción de apagarlo o
sin ella, eligió **sin poder apagarlo** (se le dijo que es la opción con más
riesgo legal, por los nombres de menores).

- **Cuándo.** Al emparejar la ronda 1 (`publicarSolo`, desde `guardar()`), con
  la misma Edge Function `pareo-publicar` de siempre; después se pone al día
  sola con cada cambio (`programarPublicacion`). Antes de la ronda 1 sigue
  como estaba: se puede publicar a mano como anuncio, con el permiso.
- **Sin internet** se vuelve a intentar con el próximo cambio, como mucho una
  vez por minuto (`reintentoSolo`), y Archivos lo dice con «Publicar ahora».
  Si el torneo publicado ya no existe (lo borró alguien), se vuelve a
  publicar solo.
- **No se quita.** Un torneo que ya empezó no muestra «Dejar de publicar».
- **Que nadie se lleve una sorpresa:** lo dicen la ficha Torneo (un aviso
  fijo con el enlace a la política de privacidad), la ronda 1 antes de
  emparejar, Archivos y `privacidad.html#torneos`. Lo que viaja es lo de
  siempre (`PareoPublicar.datosPublicos`): nunca la fecha de nacimiento, el
  sexo ni el ID FIDE. Quien quiera que se quite o se abrevie su nombre, lo
  pide al correo de la política.

Lo comprueba `verificar-pareo-anuncio.js`.

### Pareo Integral: los equipos el día del torneo, la Categoría Amistoso, el plazo de los capitanes y el mensaje de WhatsApp

Lo pidió el dueño del sitio, en varios mensajes del mismo día.

- **«Mover» también a un torneo por equipos.** Entra al equipo de su centro
  si tiene cupo (`G.JDE_MAX_EQUIPO`, 5). Si está lleno, no se mueve: el aviso
  dice que primero hay que sacar a alguien del equipo. Si su centro no tenía
  equipo en ese torneo, se arma uno con él (y se avisa que necesita al menos
  `G.JDE_MIN_EQUIPO`).
- **La categoría, revisada al mover** (`revisarCategoriaDestino`, con
  `G.revisarCategorias`): mayor de lo que permite (art. 17), subir en
  individual, un salto que no es A→B, C→D ni D→E, y el tope de tres que
  suben por equipo (art. 18). Lo que no se permite, no se mueve y lo dice;
  un ascenso permitido se mueve y lo dice. Sin fecha de nacimiento o sin
  «Categoría X» en el grupo del torneo, no se revisa.
- **En un equipo, «Quitar» a quien no vino** (antes de la ronda 1): va al
  acta («Bajas en los equipos», `t.bajasEquipo`); un equipo sin nadie sale
  del torneo. Y **«Agregar un equipo que llegó»**: el centro y los
  integrantes, uno por línea, en el orden de tableros; un centro que ya tiene
  equipo no se repite, y con rondas jugadas entra desde la siguiente como
  inscripción tardía.
- **La Categoría Amistoso.** Al crear los torneos de la inscripción, los que
  se quedan sin rivales (un grupo de uno, un equipo solo en su categoría)
  juegan juntos un torneo individual «Categoría Amistoso», con los mismos
  datos que los demás (casilla marcada de entrada). Lleva `amistoso: true`:
  no clasifica (`V.clasificados`) ni suma al medallero.
- **El plazo de los capitanes** (`t.plazoAlineacion`, minutos, en la ficha
  Torneo de un torneo por equipos). La hora de la ronda sale del horario del
  evento (Archivos, «Horario del día») y, sin él, de cuando se echó a andar
  el reloj de la ronda (`inicioDeRonda`). Al capitán le llega el límite y su
  celular cuenta cuánto le queda («Te quedan 12 min…»); al vencer se cierra.
  Lo decide la pestaña del árbitro: lo que llega tarde no entra. Sin plazo o
  sin hora, como antes: hasta que se anote el primer tablero.
- **El enlace del capitán, por WhatsApp o por correo**, con un mensaje que
  dice el equipo, la ronda y el torneo. El teléfono y el correo los pone
  quien lo manda.
- **El mensaje de WhatsApp de la ronda**, más fácil de leer en el celular
  (el dueño mandó cómo se veía): una mesa por bloque, su número en negrita y
  cada uno en su línea (⚪ blancas, ⚫ negras; el orden también lo dice). Los
  nombres escritos todo en mayúsculas pasan a mayúscula inicial
  (`PareoCompartir.legible`): «de», «la»… en minúscula, y las siglas (sin
  vocales, números romanos y una lista: CTP, IPEC, UNED…) como están. Lo que
  ya trae minúsculas no se toca.

Lo comprueba `verificar-pareo-equipos-dia.js` (el mensaje, `verificar-pareo-premios.js`).

### Pareo Integral: el informe oficial completo, la premiación en tablas, la configuración de los JDE fija, la acreditación y no perder nada al cerrar

Lo pidió el dueño del sitio de una vez (las propuestas 2, 3 y 4, más el
informe, la premiación, la acreditación y «qué podemos resolver en caso de
que alguien cierre por accidente la página»).

- **El informe oficial** (`V.informe`) trae ahora, por torneo, la
  **clasificación entera** con sus desempates y la columna «Clasifica» (antes
  solo los primeros) y el **cuadro cruzado de enfrentamientos** (cada ronda
  con el número de salida del rival, el color y el resultado). Y para todo el
  evento, los **clasificados** a la etapa siguiente y las **ausencias e
  incomparecencias** con si justificó.
  - La casilla del cuadro cruzado es una sola, `V.celdaCruzada`: la usan
    la ficha Tabla cruzada, su PDF y el informe.
  - `js/reporte-pdf.js` no parte las celdas, las corta con «...»: los
    anchos de cada tabla están medidos mirando el PDF, con encabezados
    cortos («Pto.», «Pts.», «Centro») para que entren cinco desempates.
- **Las ausencias** (`V.ausenciasDe`) salen solas de las rondas: quien perdió
  por incomparecencia, quien el árbitro marcó «no viene», quien no se
  acreditó y quien pidió bye (avisó: cuenta como justificado). Si justificó lo
  anota el árbitro en la ficha Archivos (`t.justificaciones`, por
  «ronda|id»); sin anotar queda «Sin decidir». Las incomparecencias van al
  informe, no al acta: el acta es del congresillo, antes de jugar.
- **La premiación** va en tablas (medalla, lugar, nombre, centro, puntos;
  los premios especiales y los mejores tableros en las suyas), del tercer
  lugar al primero, como se leen en el acto.
- **La configuración de los JDE, fija.** Con «Aplicar la configuración de los
  JDE» puesta, el ritmo, el sistema, los puntos y los desempates no se tocan
  (también si se fuerza desde la consola). Para cambiarlos se pide un
  motivo, que va al acta con la hora, lo de antes y lo de después
  (`t.cambiosConfig`, `V.cambiosDeConfiguracion`); «Volver a fijar la
  configuración» la cierra otra vez. El número de rondas sigue libre (la
  normativa pide «al menos cinco»).
- **Antes de emparejar**, quien quedó fuera por perder por incomparecencia en
  la ronda anterior sale en un aviso, con «Vuelve a jugar» al lado: por si
  llegó o avisó.
- **La acreditación** («Pasar asistencia») está en Jugadores y antes de
  emparejar cada ronda (ids `pi-j-…` en Jugadores, para no repetir los de
  Rondas: las dos fichas están en la página a la vez). En un suizo, quien no
  está presente no se empareja en **ninguna** ronda (queda «no viene», y la
  ronda lo anota en `sinAcreditar`) hasta que el árbitro lo marque. En todos
  contra todos sigue la regla de antes: se decide antes de sortear la ronda 1.
- **Cerrar la página sin querer.** Todo cambio ya se guardaba al momento en
  el navegador. Lo que se perdía, y ya no:
  - lo escrito en un campo de los datos del torneo sin salir de él (se
    guarda mientras se escribe);
  - el jugador o la lista a medio escribir (un borrador, que vuelve al abrir
    con un aviso);
  - lo marcado antes de emparejar, byes y «no viene» (`t.pedidas`, que se
    borra al emparejar);
  - el archivo del respaldo automático: se recuerda en IndexedDB y un clic
    («Seguir el respaldo automático en…») lo retoma, porque el navegador
    pide el permiso otra vez.
  Además se le pide al navegador guardar los datos para siempre
  (`navigator.storage.persist()`), para que no los borre por falta de
  espacio. Lo que no se puede evitar: borrar los datos del navegador o
  usar una ventana privada. Para eso está el respaldo en un archivo.

- **El enlace en vivo, también en la ficha Torneo** (lo pidió el dueño
  del sitio: «que el enlace en vivo salga también en la ficha Torneo»). Si
  el torneo es de un evento, el del evento (el mismo de Archivos); si no, el
  de ese torneo (el mismo de «Ver desde el celular», en Rondas, y su casilla
  queda marcada). Son los mismos canales, no otros; los ids llevan
  `pi-tv-…` porque las fichas están todas en la página a la vez.

Lo comprueba `verificar-pareo-informe.js`.

### Pareo Integral: quien pierde por incomparecencia queda fuera

Lo pidió el dueño del sitio: «cuando un jugador pierde por incomparecencia,
que automáticamente quede fuera de las siguientes rondas hasta que el
árbitro lo vuelva a cambiar». Es la práctica de FIDE: quien no se presenta
sin avisar se retira del torneo.

- **Dónde.** `T.retirosPorIncomparecencia(t)` (js/pareo/torneo.js), lógica
  pura, corre en cada `guardar()` de pareo.html y al llegar un resultado de
  un adjunto. Mira solo la **última** ronda: «-+» saca a las blancas, «+-» a
  las negras y «--» a los dos, desde la ronda siguiente
  (`retiradoDespuesDe`), con el aviso en pantalla y, en Jugadores, «Fuera
  desde la ronda N (no se presentó)».
- **Automático no es lo mismo que a mano.** El retiro lleva `retiroAuto`
  (la ronda desde la que no juega). Si el resultado se corrige antes de
  emparejar la siguiente, el retiro automático se deshace solo; uno a mano
  nunca. Si el árbitro lo devuelve con «Vuelve a jugar», queda `vuelveTras`
  (la ronda de esa incomparecencia) y esa misma ya no lo vuelve a sacar; una
  nueva, sí.
- **Solo la última ronda.** Corregir una ronda vieja, con otras ya
  emparejadas, no saca ni devuelve a nadie: el árbitro decide.
- **Todos contra todos.** El calendario de Berger es fijo: el retirado no se
  quita de la ronda, su partida sale ya perdida sin jugar al emparejarla
  («-+», «+-», o «--» si faltan los dos). Vale también para el retiro a
  mano, que antes seguía apareciendo como una partida por jugar.
- **Equipos, no.** Ahí la incomparecencia es de un tablero o del encuentro,
  no de una persona del torneo.

Lo comprueba `verificar-pareo-incomparecencia.js`.

### Torneos en Pareo Integral: la lista, por día y en columnas

Lo pidió el dueño del sitio con la imagen de un calendario de torneos: que la
portada no sean tarjetas sueltas, sino filas ordenadas por día, con los datos
en columnas.

- **Por día, con su encabezado** («Jueves, 22 de octubre de 2026», en hora de
  Costa Rica). Los resultados van del día más reciente al más viejo; los
  próximos, del más cercano al más lejano. Dentro del día, primero lo que
  se está jugando y después por nombre.
- **Cada fila**: la fecha a la vista corta («22–24 / OCT», o «23 OCT / 11 DIC»
  si cambia de mes) y entera para el lector; el nombre, el lugar con la
  federación y el estado escrito (Próximo, En curso, Terminado); y seis datos
  con su etiqueta arriba: inscripción (abierta o cerrada), participantes,
  rondas (jugadas/total), sistema, ritmo y modalidad. El ritmo sale del texto
  del control con `js/ritmo-control.js` (la cuenta de FIDE), no se pregunta.
- **De la imagen se dejó afuera** «Var. Elo» y «Participación», porque Pareo
  Integral no guarda esos datos. También las fotos de cada torneo.
- **Un evento con varios torneos el mismo día es una fila que se despliega**:
  suma a sus participantes y cuenta sus torneos. El botón dice si está
  abierto (`aria-expanded`). Se queda abierto al volver a pintar la lista, y
  al buscar se abre solo para que se vea qué coincidió.
- **La lista no se baja cada torneo entero.** Pide sus columnas y unos pocos
  campos de `datos` que lee la base (`ritmo:datos->>ritmo`, `fechaFin`,
  `federacion`, `sistema`, `tipo`, `inscripcion`). Los dobles de los
  verificadores contestan esos alias con `columnasPedidas` de
  `herramientas/lib/pareo-pruebas.js`.
- **En el celular**, los datos bajan debajo del nombre en dos columnas y nada
  se sale de la pantalla.

Lo comprueba `verificar-pareo-lista.js`.

### Repetir un evento, el QR de cada mesa y el repaso antes de emparejar

Lo pidió el dueño del sitio para que el día del torneo se trabaje más rápido.

- **«Repetir este evento»** (ficha Archivos, en el evento) arma uno nuevo con
  los mismos torneos. Cada torneo se copia **campo por campo**, de una lista
  (`COPIA_REPETIR` en `js/pareo/pagina.js`): ritmo, sistema, rondas, puntos,
  desempates, si da Elo, la mesa de la sala, el plazo de los capitanes y la
  configuración de los JDE.
  - Nunca se copia el torneo entero: lo que pasó ese día (jugadores, rondas,
    fechas, actas, firmas, publicación, adjuntos, decisiones del congresillo)
    no viaja, y lo que se agregue al torneo en el futuro tampoco, salvo que
    se ponga en la lista.
  - El horario del día (hora de inicio y descanso) pasa al evento nuevo.
  - El año: en los JDE, `jde.anio` es el de hoy y los nombres se vuelven a
    armar con `G.nombreEventoJde`. En los demás, el año viejo escrito en el
    nombre se cambia por el nuevo.
  - El evento viejo no se toca.
- **«Rótulos de mesa con QR»** (en «Las mesas de la sala»): un rótulo por
  mesa, seis por hoja, con el número grande (el de la sala, `V.mesaFisica`),
  la categoría y un QR a `pareo.html#mesa=<n>`.
  - El QR no lleva el código de ningún adjunto. Lo que sabe a qué adjunto
    llevar es su celular: la página del adjunto guarda su enlace
    (`pareo_adjunto_ultimo_v1`, 16 horas) y `#mesa=` lo abre con `&ir=<n>`.
  - La mesa queda marcada (el borde grueso y «Mesa 12.» escrito), a la vista
    y con el foco.
  - Sin enlace guardado, dice que primero se abra el del principal.
  - Lo mismo a mano: «Ir a la mesa» arriba de sus mesas.
  - Lo anota el adjunto, nunca el jugador: no choca con lo descartado para
    siempre.
- **El repaso antes de emparejar**: si en la ronda anterior quedó una
  sorpresa de Elo o una diferencia con un adjunto que nadie miró, o un nombre
  está dos veces en la lista (sin importar mayúsculas, tildes ni espacios),
  «Emparejar la ronda N» lo dice antes.
  - Se elige «Revisar primero» o «Emparejar igual»: es un aviso, nunca
    bloquea.
  - Sin nada que revisar, empareja sin preguntar.
  - En las pruebas, `autoConfirmarCambios` de `herramientas/lib/pareo-pruebas.js`
    lo acepta solo, como el cambio de un resultado.

Lo comprueba `verificar-pareo-repetir.js`.

### Las pruebas no publican

Con la publicación automática (ver «Torneos en Pareo Integral: todo torneo se
publica solo»), cada corrida del CI abría Pareo Integral en localhost,
emparejaba torneos de prueba y los **publicaba de verdad** en
`pareo_publicados`. Los verificadores que prueban la publicación la
reemplazan por un doble, pero los demás (sala, JDE, equipos, adjuntos…) no
la tocaban. El 23/10 la lista pública tenía 306 torneos de prueba («PRUEBA
SUB-10», «Mujeres · inter»…), y se borraron todos a pedido del dueño.

- **El candado está en la función, no en las pruebas**: `pareo-publicar`
  rechaza con 403 todo pedido cuyo `Origin` no sea
  `https://ajedrez-integral.com`, antes de leer nada.
  - El navegador siempre manda `Origin` en un POST a otro dominio.
  - localhost, una vista previa de Cloudflare (`*.workers.dev`), Node y curl
    no publican.
  - Un verificador nuevo que se olvide del doble ya no ensucia nada.
- La CORS sola no frenaba: Supabase contestaba el pedido igual.
- `verificar-pareo-publicar.js` lee el código de la función y comprueba que
  el candado siga ahí, antes de leer el cuerpo.
- En la máquina y en el CI, la publicación falla callada (y se reintenta cada
  minuto), como cuando no hay red: el resto de Pareo Integral no cambia.

### Torneos en Pareo Integral: el correo del organizador, el sello y el historial

Lo pidió el dueño del sitio (la 1, la 2, la 3 y la 8 de una lista de
propuestas): que quien organiza se entere de lo que pasa con sus torneos sin
tener que entrar a mirar, que no pierda su organización si cambia de
computadora, que pueda pedir el sello, y que la moderación deje constancia.

- **El correo de la organización** («Tu organización», ficha Archivos) es
  opcional.
  - Guardarlo pide marcar el consentimiento con enlace a la política de
    privacidad, y la función vuelve a exigirlo (`consentimiento`).
  - **No se usa hasta confirmarlo**: le llega un enlace
    (`pareo.html#org-correo=<id>.<token>`, 48 horas) y hasta que lo toca,
    `correo_confirmado` queda nulo y no se le escribe nada más. Así nadie
    llena el buzón de otro poniendo su dirección.
  - No se publica: la lectura pública de `pareo_organizadores` va por
    columnas y el correo no está en la lista. La organización lo ve tapado
    («o•••@gmail.com», `organizador_estado`), con «Quitar el correo».
- **Los avisos**, solo a un correo confirmado: cada inscripción en uno de sus
  torneos (nombre, institución y categoría de quien se inscribe) y cada
  reporte (con el motivo, nunca quién lo mandó). Un aviso que no sale nunca
  deshace la inscripción ni el reporte (`mandar` no lanza).
- **Recuperar la organización**: «Perdí mi organización» pide el correo y
  manda un enlace por organización (`#org-recuperar=<id>.<token>`, una hora,
  un solo uso).
  - Al abrirlo, la organización queda en ese navegador con una **clave
    nueva**: la anterior deja de servir, así que en otra computadora hay que
    volver a pegar el código.
  - La función contesta **lo mismo exista o no** el correo: no le dice a
    nadie quién está registrado.
- **Pedir el sello**: un formulario que se despliega (con `aria-expanded`):
  quién lo pide, a quién representa, cómo contactarle y una nota, con su
  consentimiento.
  - Queda en `pareo_solicitudes_sello`, que lee solo administración. Hay una
    sola pendiente por organización, con un índice único.
  - Le llega un correo a administración, y la organización ve «lo está
    revisando».
- **Los frenos**: confirmar, recuperar y pedir el sello mandan correo sin
  cuenta. Por eso llevan `pareo_correo_frenar`: 5 por conexión en una hora y
  100 en total, por ámbito.
- **A administración** le llega un correo con cada reporte y con cada pedido
  del sello (a todo `is_admin`, como el aviso de la base saturada).
- **`admin-pareo.html`** suma «Piden el sello» («Dar el sello» o
  «Rechazar») y el **historial** (`pareo_moderaciones`): qué se hizo, sobre
  qué, cuándo y por qué.
  - Toda acción, menos marcar un reporte revisado, pide el motivo, que puede
    ir vacío.
  - La función es `pareo_moderar_con_motivo`. La vieja, `pareo_moderar`,
    sigue para una pestaña abierta con la página anterior y llama a la
    nueva sin motivo: una sola copia de lo que hace. Aprobar una solicitud
    da el sello en la misma transacción.
  - `pareo_solicitudes_sello` va en `VIGILADAS` de `verificar-auditoria.js`.
- **Los textos de los correos** están en
  `supabase/functions/pareo-publicar/correos.ts`, sin importar nada, para
  probarlos con Node. La franja de arriba es la de siempre
  (`_compartido/marca-correo.ts`, que `funciones-armar.js` le copia a
  `pareo-publicar`).
- Comprobado contra la base:
  - haciéndose pasar por cada rol en una transacción deshecha: anon no lee
    el correo ni las solicitudes ni llama a la moderación, y quien
    administra aprueba y queda en el historial con su motivo;
  - y, con `pg_net` desde la base, la función desplegada de punta a punta:
    crear con correo (el de confirmación salió por Resend a
    `delivered@resend.dev`, la dirección de pruebas de Resend), confirmar y
    recuperar. La organización de prueba se borró después.

Lo comprueban `verificar-pareo-correos.js` y `verificar-pareo-organizador.js`.
- `verificar-pareo-correos.js` prueba los correos con Node: texto ajeno
  escapado, asuntos sin saltos de línea, el botón solo a
  ajedrez-integral.com. Lee además el código de la función: «recuperar» no
  delata, el correo sale tapado y los avisos van solo a uno confirmado.
- `verificar-pareo-organizador.js` prueba el navegador: el consentimiento,
  el correo tapado, quitarlo, los dos enlaces del correo, recuperar, el
  sello, y en `admin-pareo.html` el motivo, el historial y las solicitudes.

### Torneos en Pareo Integral: los torneos de ajedrezcostarica.com

El dueño pidió que en la portada se vieran también los torneos próximos que
se anuncian en ajedrezcostarica.com (`/es/tournaments`), no solo los que se
organizan con Pareo Integral. Salen en «También en Costa Rica», entre
«Próximos torneos» y «Resultados».

- **Quién los lee.** La Edge Function `torneos-externos`, una vez al día
  (pg_cron `torneos-externos`, 5:13 de Costa Rica). Lee la portada de allá y
  la ficha de cada torneo, con calma: una a la vez, medio segundo entre una
  y otra, y como mucho 40. Escribe en `public.torneos_externos` con la
  service role.
  - Va con `verify_jwt` en false y exige el secreto
    `torneos_externos_secreto` de la bóveda, como `arbitros-avisos`.
  - El navegador no puede leerlos directo: la otra página no da permiso
    (CORS) y además serían cien visitas por cada persona que abre la
    portada.
- **Cómo se leen.** Las dos páginas son de Next.js: lo que se ve viene como
  JSON dentro de sus `<script>`, con las comillas escapadas.
  `torneos-externos/leer.ts` quita las barras y lo lee con expresiones.
  - La ficha se lee **dentro del bloque del torneo**
    (`"tournament":{"id":"<n>","details":{` hasta `"registrationFull"`).
    Antes vienen los textos de la interfaz, y el primer `"location"` de la
    página es la palabra «Ubicación».
  - Los números de la ficha se compararon con lo que la página muestra:
    - ritmo: 1 bala, 2 blitz, 3 rápido, 4 clásico;
    - Elo: 1 sin, 2 nacional, 3 FIDE, 4 FIDE y nacional;
    - modalidad: 1 presencial, 2 en línea;
    - formato: 1 individual, 2 equipos;
    - region: la provincia, de 1 San José a 7 Limón.
  - Si cambian su HTML, el lector devuelve null o una lista vacía, nunca un
    torneo inventado. Con la portada vacía la función no toca nada (mejor la
    lista de ayer) y contesta 502.
- **Qué se guarda.** Solo lo que se muestra: nombre, fechas, lugar,
  provincia, ritmo, Elo, costo, modalidad, quién organiza, si la inscripción
  está abierta y el enlace a su ficha.
  - La ficha de allá trae también los correos de quien organiza y las
    instrucciones de pago. **Eso no se lee**, y la tabla no tiene dónde
    guardarlo.
  - Lo que terminó hace más de un día y lo que lleva una semana sin
    aparecer en su portada (cancelado o quitado) se borra en la misma
    pasada.
- **Cómo se muestran.** Cada fila lleva a su ficha de allá, en otra pestaña
  y diciéndolo: la inscripción es de ellos. Se piden todos de una vez (son
  pocos) y se filtran en el navegador con los mismos filtros de la portada.
  - Con un filtro que allá no existe (el lugar escrito igual, «Solo en
    curso», el sello «Verificado») la parte se calla, en vez de mostrar
    algo que no coincide.
  - El día es el de Costa Rica (`HoraCR.dia`): un torneo de las 9 de la
    noche es de ese día, aunque en UTC ya sea el siguiente.
  - «Agregar estos torneos a mi calendario» baja un `.ics` con los que se
    ven. El UID es fijo (`ajedrezcostarica-<n>@ajedrez-integral.com`), así
    que bajarlo otra vez no los duplica.
- **Por qué no va en `privacidad.html`.** No se le manda nada a
  ajedrezcostarica.com, solo se lee lo que publica. Lo que se lee es el
  anuncio público de un torneo, sin datos de ninguna persona.

Lo comprueban dos verificadores:
- `verificar-torneos-externos.js`: el lector, con páginas escritas con la
  misma forma que las de verdad;
- `verificar-torneos-externos-pagina.js`: la parte de la portada.

Al aplicarlo se disparó una vez a mano (`select
public.disparar_torneos_externos()`): leyó los 5 torneos que había allá el
23/10/2026, con sus datos iguales a los de sus fichas.

### La tarjeta del organizador y el calendario para suscribirse

Son dos rutas nuevas del worker, como `/t/<id>`, y las dos están en
`run_worker_first` de `wrangler.jsonc`: una ruta del worker que no está ahí
no existe, y no da ningún error.

- **`/o/<id>`: la tarjeta del organizador.** Es el enlace para compartir su
  página (`torneos-pareo.html#o=<id>`). WhatsApp no lee lo que va después
  del «#», así que sin esto la vista previa sería la de la portada.
  - La tarjeta dice su nombre, si tiene el sello y cuántos torneos publicó.
    La cuenta se pide sola (`Prefer: count=exact`, con `Range: 0-0`), sin
    bajarse los torneos.
  - Comparte página mínima con la del torneo (`paginaTarjeta()`): sin
    `<script>` y con su propia CSP.
  - En la página del organizador, «Copiar el enlace de esta página» da esta
    dirección.
- **`/calendario/torneos.ics`: el calendario para suscribirse.** Trae los
  próximos torneos de Torneos en Pareo Integral y los de
  ajedrezcostarica.com. Con `?o=<id>` trae solo los de ese organizador, y
  entonces sin los de afuera.
  - La app del celular lo vuelve a leer sola: `REFRESH-INTERVAL` y
    `X-PUBLISHED-TTL` de 12 horas, y `Cache-Control` de una hora.
  - Son días enteros, con los mismos UID que «Agregar a mi calendario» de
    cada torneo (`torneo-<id>@…`, `ajedrezcostarica-<n>@…`). Quien ya
    había bajado un torneo no lo ve dos veces.
  - Un torneo entra si su último día es hoy o después, en hora de Costa
    Rica. Se piden los de hace un mes en adelante, con tope.
  - Si Supabase no contesta, devuelve 503 con `Retry-After`, nunca un
    calendario vacío: el vacío borraría los torneos de la app.
  - **El texto lo arma igual que `js/calendario-ics.js` (`armarDias`).** El
    worker no puede importar ese archivo, así que `verificar-worker.js`
    compara las dos salidas línea por línea con los mismos eventos.
    Cambiar uno sin el otro hace fallar el verificador.
  - En la página, «Suscribirme al calendario de torneos» (portada) y
    «Suscribirme a sus torneos» (organizador) abren la dirección `webcal:`.
    «Copiar la dirección» da la de `https:`, que es la que pide Google
    Calendar en «Desde URL».

Los comprueban `verificar-worker.js`, `verificar-pareo-organizador.js` y
`verificar-torneos-externos-pagina.js`.

### La ficha de un jugador en todos sus torneos

`torneos-pareo.html#p=<nombre>` muestra cada torneo individual publicado
donde aparece ese nombre escrito igual. La búsqueda es la de «Otros torneos
de…»: `datos @> {jugadores:[{nombre}]}`, del más reciente, hasta 100.

- **Lo que muestra de cada torneo:** el puesto, los puntos, las ganadas,
  tablas y perdidas (solo partidas jugadas) y el Elo que tenía.
  - Con Elo, también el rendimiento y el ± Elo con las reglas de FIDE
    (`PareoElo.calcular`, el mismo de la clasificación). No es oficial, y la
    página lo dice.
- **Arriba, el resumen:** torneos, partidas, el Elo de su primer torneo al
  último y lo que suman sus torneos.
  - Los números van escritos, no en un gráfico: así se leen igual con un
    lector de pantalla.
- **Los torneos por equipos no entran:** ahí el «jugador» de la
  clasificación es el equipo.
- **De dónde se llega:** desde la ficha del jugador en un torneo («Su ficha
  en todos los torneos →»). Se puede seguir al jugador y copiar el enlace
  de su ficha.

Lo comprueba `verificar-pareo-seguir.js`.

### La clasificación para incrustar en otra página

Un club o una federación pega un `<iframe>` en su página y muestra la
clasificación de su torneo, que se pone al día sola. El código lo da
«Ponerlo en tu página» en la ficha del torneo, con un título escapado y
`loading="lazy"`. Se puede elegir la clasificación o las mesas de la última
ronda.

- **La arma el worker, no es un archivo** (`/incrustar/<id>`, en
  `run_worker_first`).
  - Todo el sitio lleva `frame-ancestors 'self'` y `X-Frame-Options:
    SAMEORIGIN` en `_headers`. Esta es la única página que otra puede
    meter en un iframe.
  - Con un archivo más habría que abrirle una excepción en `_headers`. Ahí
    las reglas se suman, y una CSP de más deja la página bloqueada sin
    ningún aviso.
  - El worker le pone sus propias cabeceras: `frame-ancestors *`,
    `script-src 'self'` y nada de `X-Frame-Options`.
- **El torneo viaja dentro de la página** como `<script
  type="application/json">`, que no se ejecuta, con «<» escapado.
  - Así un nombre con `</script>` no corta el bloque.
  - `js/pareo-incrustar.js` lo pinta con los mismos módulos de Pareo
    Integral, así que la clasificación sale igual que en la computadora del
    árbitro.
  - No habla con ningún servidor: la página se vuelve a pedir sola cada
    minuto (`meta refresh`), y el worker la guarda 30 segundos.
- **Opciones en la dirección:**
  - `?n=` dice cuántos puestos (10 si no se dice);
  - `?ver=ronda` muestra las mesas (solo en torneos individuales);
  - `?tema=oscuro` pone el fondo oscuro.
- **Los colores se midieron contra su fondo:**
  - en claro, 14,6:1 el texto y 6,1:1 las notas;
  - en oscuro, 13,3:1 y 8,9:1.
- **Sin torneo:** 404, y no se queda pidiendo. **Con Supabase caído:** 503,
  y vuelve a intentar en un minuto.

Lo comprueba `verificar-pareo-incrustar.js`: abre la página dentro del
iframe de otro sitio y compara la clasificación con la de Pareo Integral.

### Torneos en Pareo Integral: la lista de 50 en 50

Lo pidió el dueño del sitio (la 8 de una lista de propuestas). Antes la
portada se bajaba la tabla entera, de mil en mil, y filtraba en el
navegador. Con un año de torneos publicados eso son miles de filas en cada
visita.

- **La lista la arma la base**: `public.pareo_lista` hace la búsqueda, los
  filtros, el orden y la página. Es `SECURITY INVOKER` y la llama anon, así
  que la RLS de siempre se aplica: lo oculto no sale, y el sello se mira en
  `pareo_organizadores` con su propia RLS.
- **De 50 en 50 GRUPOS, no filas.** Los torneos de un mismo evento y un
  mismo día van juntos en una fila que se despliega: una página que cortara
  un evento por la mitad lo mostraría partido, con la mitad de sus
  participantes.
  - Los próximos (del más cercano) y los jugados (del más reciente) se piden
    por separado, cada uno con su «Ver más», que dice cuántos van de
    cuántos.
  - Al traer más, el foco se queda en «Ver más» o, si ya no quedan, pasa al
    último torneo.
- **La búsqueda** compara sin tildes, en mayúsculas y con un espacio entre
  palabras (`public.pareo_clave`, lo mismo que `clave()` de la página).
  - Busca con `position`, no con `like`: un `%` o un `_` escrito no es un
    comodín.
  - Se manda 300 ms después de dejar de escribir, no con cada letra.
  - Una respuesta que llega tarde, porque ya se pidió otra cosa, no se pinta.
- **El ritmo** (clásico, rápido, relámpago) no se puede deducir en la base
  sin copiar la cuenta de `js/ritmo-control.js`. Por eso lo deduce el
  navegador al publicar y viaja en `datos.ritmoTipo`.
  - La Edge Function lo vuelve a limpiar; sin esa línea, el filtro no
    encontraría nada, sin ningún error (`verificar-pareo-publicar.js` lee el
    código de la función).
  - Cuando se hizo no había ningún torneo publicado (se habían borrado los de
    prueba), así que no hubo filas viejas que rellenar.
- **Lo que la portada necesita entero** (cuántos hay publicados y los
  lugares, para el filtro) sale de `public.pareo_lista_resumen`.
- Comprobado contra la base, con torneos de prueba en una transacción
  deshecha:
  - un evento no se parte entre páginas;
  - lo oculto no cuenta;
  - la búsqueda ignora tildes y espacios dobles, y `50%_` no encuentra nada;
  - cada filtro deja lo que debe.
- En los verificadores la llama un doble (`dobleListaPareo` en
  `herramientas/lib/pareo-pruebas.js`) que filtra, agrupa y pagina igual
  que la función.

Lo comprueba `verificar-pareo-lista.js`:
- los filtros y la búsqueda viajan en el pedido;
- la búsqueda se manda una vez al dejar de escribir;
- «Ver más» trae los que faltan sin repetir ninguno;
- la tabla nunca se baja entera.

### Torneos en Pareo Integral: el organizador y la moderación

Lo pidió el dueño del sitio (la 4, la 5, la 6 y la 7 de una lista de
propuestas), para que la lista pública se vea profesional y se pueda limpiar
sin borrar nada.

- **«Tu organización»** (ficha Archivos de `pareo.html`) es el nombre y el
  logo de quien organiza. Es **sin cuenta**, como los torneos:
  - La crea la Edge Function `pareo-publicar` (`accion: "organizador"`), que
    devuelve una clave secreta. La guarda el navegador
    (`pareo_organizador_v1`) y en la base queda solo su sha256
    (`pareo_organizadores.clave_hash`, que ninguna columna pública deja leer).
  - Con la clave se cambia el nombre o el logo, y cada torneo que se publica
    o se pone al día desde ese navegador va con `organizador: { id, clave }`
    y queda a su nombre (`pareo_publicados.organizador_id`). Al guardarla,
    los torneos ya publicados se ponen al día en el momento.
  - Para otra computadora, «Copiar el código» (`org:<id>:<clave>`) y «Ya
    tengo una organización» para pegarlo.
  - **Sin tocar el logo, el pedido NO lleva `logo`**: la función entiende
    «sin `logo`» como dejar el que está y `logo: null` como quitarlo. Un
    `logo: null` mandado por costumbre borraba el logo cada vez que se
    cambiaba el nombre, sin ningún error.
- **El logo va en la fila**, como imagen chica en base64 (`data:image/…`):
  así no hace falta un bucket público ni otra vía de subida sin cuenta.
  - Lo achica el navegador (`js/imagen-achicar.js`, la misma copia que el
    logo de las academias), primero a 400 px y si pesa a 200.
  - La función y la tabla vuelven a mirar el formato y el tope de 200 000
    caracteres.
  - La página pública solo pone en un `<img>` un texto que empiece con
    `data:image/png|jpeg|webp;base64,` (`logoValido`).
  - La lista nunca pide el logo, porque pesa: pide nombre y sello de todos
    los organizadores de una vez (de cien en cien) y el logo solo en la
    ficha de un torneo y en la página del organizador.
- **En los PDF** (clasificación, tabla cruzada, acta, informe, premiación)
  sale arriba el nombre y el logo de la organización (`cabecera` de
  `js/reporte-pdf.js`, armada por `conOrganizacion`). La marca de agua sigue
  siendo la de Ajedrez Integral.
- **La página de cada organizador**, `torneos-pareo.html#o=<id>`: su logo,
  su nombre, el sello y todos sus torneos publicados, por día. Los pide a la
  base por su id; no filtra la lista entera.
- **El sello «Verificado»** lo da solo quien administra: no se pide. Va a
  federaciones, comités y organizadores de confianza.
  - Va escrito («✓ Verificado»), no solo con un color.
  - Sale en la lista, en la ficha y en su página.
  - La lista se filtra con «Solo organizadores verificados».
  - La función `pareo-publicar` nunca escribe `verificado`
    (`verificar-pareo-organizador.js` lo revisa en su código).
- **«Reportar este torneo»** (en la ficha de cada torneo) pide el motivo
  (inapropiado, datos personales, falso o de prueba, un error, otra cosa) y
  un detalle opcional.
  - Va por la función (`accion: "reportar"`), con su freno
    (`pareo_reportar_frenar`: 10 por conexión por hora, 300 en total).
  - No guarda quién lo mandó.
  - `pareo_reportes` la lee solo administración: anon no tiene ni el
    `select`.
- **`admin-pareo.html`** («Moderación de Pareo Integral», en
  `js/paginas-admin.js`) muestra los reportes nuevos, las organizaciones y
  los torneos ocultos.
  - Todo lo escribe **una sola función**, `public.pareo_moderar(p_que,
    p_id)`: verificar o quitar el sello, ocultar o mostrar una organización
    o un torneo, y marcar revisado un reporte.
  - Valida `coalesce(soy_admin(), false)` y devuelve la fila vuelta a leer.
  - Ninguna de las tres tablas tiene política de escritura.
- **Ocultar no borra.** Una fila con `oculto` deja de verse para todos menos
  administración: la política de lectura es `not oculto or soy_admin()`.
  Ocultar una organización esconde su página y su nombre en la lista; sus
  torneos siguen, sin nombre.
- **Queda anotado**: el sello y ocultar pasan por `interno.auditar()`
  (`pareo_organizadores` está en `VIGILADAS` de `verificar-auditoria.js`, y
  `pareo_publicados` lleva `auditar_oculto`).
- Comprobado impersonando roles en SQL, en una transacción deshecha:
  - anon no ve lo oculto;
  - anon no puede leer `pareo_reportes` (sin permiso) ni llamar a
    `pareo_moderar`;
  - un usuario que no administra recibe «Solo administración…»;
  - quien administra da el sello y queda una fila en la bitácora.

Lo comprueba `verificar-pareo-organizador.js`: la organización en
`pareo.html` (crear, cambiar sin `logo`, quitarlo, el código, el PDF y el
torneo publicado a su nombre), la lista pública (nombre, sello, filtro, que
nunca pida el logo ni la clave, texto ajeno), la ficha con el logo,
«Reportar», la página del organizador y `admin-pareo.html`.

### Torneos en Pareo Integral: válido para Elo, filtros, calendario y la tarjeta al compartir

Lo pidió el dueño del sitio (la 1, la 3, la 5 y la 7 de una lista de propuestas).

- **«Válido para Elo»** es un campo de la ficha Torneo (`t.validoElo`): FIDE (y
  Nacional), solo Nacional, No, o sin decir. Es la columna «Var. Elo» de la
  imagen que mandó. Viaja en `datosPublicos` y la función `pareo-publicar` lo
  vuelve a limpiar en su lista. **Sin esa línea en la función, el campo se
  pierde al publicar sin dar ningún error**: `verificar-pareo-publicar.js`
  lee el código de la función y lo comprueba. En la lista sale como la
  columna «Elo» y en la ficha del torneo, escrito entero.
- **Los filtros de la lista**:
  - ritmo (el mismo Clásico/Rápido/Relámpago que se muestra);
  - lugar (los que hay, escritos igual);
  - Elo: FIDE, solo Nacional, o «Sin Elo», que junta los que no dan Elo y
    los que no lo dijeron;
  - «Inscripción abierta» y «Solo en curso».
  
  Filtrando, los eventos se abren solos, como al buscar, y «Quitar filtros»
  los quita todos. Los filtros los aplica la base (ver «Torneos en Pareo
  Integral: la lista de 50 en 50»).
- **«Agregar a mi calendario»** está en la ficha de cada torneo que no
  terminó. Baja un `.ics` de días enteros, del primero al último incluidos
  (el formato pide el día siguiente como fin), con un aviso la víspera.
  - La hora del anuncio, el ritmo, si da Elo y el contacto van en la
    descripción.
  - Sale de `CalendarioIcs.armarDias` (`js/calendario-ics.js`), la misma
    copia que el calendario del alumno, sin pasar por la zona de la
    computadora.
- **La tarjeta al compartir un torneo.** WhatsApp y las redes no leen lo que
  va después del «#». Por eso el enlace de siempre (`torneos-pareo.html#t=…`)
  mostraba la vista previa de la portada, igual para todos los torneos.
  - Ahora se comparte `/t/<id>`: lo contesta el worker (`/t/*` en
    `run_worker_first`). La página mínima trae el nombre del torneo, las
    fechas, el lugar, cómo va («Ronda 3 de 7 · 55 participantes»), si da Elo
    y el ritmo, y la imagen `img/og-torneos-pareo.jpg`.
  - Después manda a la página de verdad con un `meta refresh`, porque la CSP
    no deja scripts.
  - Pregunta a la tabla pública con la clave pública, como el navegador.
  - Si Supabase no contesta, igual manda al torneo, con la tarjeta general.
  - La guarda Cloudflare 5 minutos, porque lo que cambia es la ronda.
  - La imagen sale de `herramientas/og-imagen.js`, el mismo dibujo que la del
    sitio.
- **En la ficha del torneo**: «Compartir por WhatsApp» (el nombre, las fechas,
  cómo va y el enlace corto), «Copiar el enlace» y el calendario.

Lo comprueban `verificar-pareo-lista.js`, `verificar-worker.js` (la tarjeta,
sus cabeceras, que el id se valide y que funcione con Supabase caído) y
`verificar-pareo-publicar.js`.

### Torneos en Pareo Integral: seguir a un jugador

Lo pidió el dueño del sitio (la 5 de una lista de propuestas): que un papá,
sin cuenta, vea primero cómo le va a su hijo en cada torneo publicado.

- **Sin cuenta y sin servidor nuevo.** Los nombres que se siguen viven en
  `localStorage` (`torneos-pareo.seguidos`, hasta 30) y nunca viajan como
  lista: no hay tabla de «quién sigue a quién», así que no hay dato personal
  nuevo que guardar ni que declarar. Si el navegador bloquea el
  almacenamiento, se sigue mientras dure la pestaña, sin error.
- **Se sigue un NOMBRE, escrito igual.** Es el mismo criterio con que la
  ficha busca «Otros torneos de…» (`datos @> {jugadores:[{nombre}]}`): los
  ids de jugador cambian de un torneo a otro y no hay un id de persona entre
  torneos. «PÉREZ» y «PEREZ» son dos personas para la búsqueda; se aceptó,
  como en la ficha.
- **Dónde sale arriba.** En cada torneo donde juega, la caja «Los jugadores
  que sigues» (su puesto y su mesa de la última ronda, con el color, el rival
  y lo que hizo); su fila de la clasificación y de la ronda lleva una franja
  y la estrella **escrita** (★ y «lo sigues» para el lector), el texto no
  cambia de color; y en la ronda, «Solo las mesas de los jugadores que
  sigo». En la portada, cada seguido con sus tres torneos publicados más
  recientes, buscados en la base una sola vez por visita (no al escribir en
  el buscador ni al volver a la portada).
- **Los de equipos no.** En un torneo por equipos los jugadores de la lista
  son equipos: ahí no hay botón ni marca (como «Otros torneos de…»).

Lo comprueba `verificar-pareo-seguir.js`.

### Torneos en Pareo Integral: inscripción, anuncios, partidas y estadísticas

Lo pidió el dueño del sitio, de una lista de propuestas (las 1, 4, 5, 6 y 8).

- **El enlace en vivo lleva a lo publicado.** El enlace en vivo (`#vivo=` y
  `#evento=`) solo vive mientras quien organiza tiene su pestaña abierta; lo
  publicado queda. Por eso lo que manda la pestaña lleva el id público del
  torneo (`pub`, nunca la clave) y el celular muestra «Resultados que quedan
  publicados…». Y el torneo publicado guarda los códigos de sus enlaces en
  vivo (`datos.vivo`, `datos.codigoEvento`, que ya van en sus QR): un enlace
  al que ya nadie transmite, a los 8 segundos, busca en
  `pareo_publicados` por su código (`datos->>vivo=eq.<código>`, un filtro
  que `anon` puede hacer porque `datos` es legible) y ofrece ir a lo
  publicado. Así el QR de un gafete sigue sirviendo después del torneo. El
  id que llega por el canal es texto ajeno: solo se pone en un enlace si
  tiene forma de id.
- **El anuncio de un torneo que se viene.** Sin jugadores todavía, Pareo
  publica el torneo como anuncio (`t.anuncio`: la hora, el contacto de la
  organización —se publica, lo dice el campo— y las bases), con la fecha, el
  lugar y el ritmo de la ficha Torneo; la función lo acepta sin jugadores
  solo si trae anuncio. En `torneos-pareo.html` sale en «Próximos torneos»
  (sin jugadores, o con fecha más adelante que hoy, en hora de Costa Rica),
  con «Próximamente» y sus datos; al empezar, es la misma página de
  resultados.
- **La inscripción antes del torneo.** Con el torneo publicado (o
  anunciado), «Recibir inscripciones desde la página pública», hasta un
  día. El formulario público pide lo de quien juega (nombre, centro,
  categoría, Elo, ID FIDE), quién lo inscribe y su contacto, y la casilla
  del consentimiento con la política de privacidad (también para menores:
  quien inscribe dice ser su encargado o tener su permiso). Va a la Edge
  Function (`inscribir`), que comprueba que la inscripción esté abierta y no
  vencida, pasa por su propio freno (`pareo_inscribir_frenar`: 30 por
  conexión en una hora, 400 por torneo, 2000 por hora en todo el espacio) y
  la guarda en `public.pareo_preinscripciones`, que **nadie lee desde
  afuera**: RLS sin políticas y sin permisos para `anon` ni `authenticated`.
  Quien organiza las lee desde Pareo con la clave de su torneo
  (`inscripciones`) y acepta o rechaza a cada una (`marcar`): **nadie entra
  solo a la lista de jugadores**; aceptar la agrega con `agregarJugadores`,
  como cualquier alta (y si el torneo ya empezó, queda como inscripción
  tardía en el acta). Las inscripciones se borran con el torneo (`on delete
  cascade`): «Dejar de publicar» se las lleva. La política de privacidad lo
  dice.
- **Las partidas en PGN.** En cada mesa de una ronda, «Partida (PGN)» abre
  un cuadro para pegarla. `js/pareo/partida.js` la lee jugada por jugada con
  chess.js (cargado solo la primera vez: Pareo no lo necesita para nada
  más), acepta las letras de las piezas en español (R rey, D dama, T torre,
  A alfil, C caballo; si la partida trae D, T, A o C, la «R» es el rey) y,
  si algo no es legal, dice desde qué jugada revisar y no la guarda. Se
  publica con el torneo (la función solo acota el tamaño a 12 000
  caracteres) y en la página pública cada mesa con partida tiene «Ver
  partida», en el tablero de `js/visor-linea.js` (el de la libreta de
  torneos: se recorre con el teclado, el lector de pantalla y escribiendo).
- **Estadísticas.** Una pestaña más en cada torneo publicado: cuántas
  ganaron las blancas, las negras y cuántas tablas (solo partidas jugadas;
  en equipos, tablero por tablero), con el porcentaje escrito al lado de
  cada barra; las sorpresas (ganó el de menos Elo, con 100 o más de
  diferencia y los dos con Elo) y los mejores rendimientos con la cuenta de
  FIDE de `js/pareo/elo.js` (con al menos 3 partidas contra rivales con Elo,
  o las rondas que haya).

Se probó contra la base real con `pg_net`: crear un anuncio sin jugadores,
inscribir (y que sin consentimiento lo rechace), leer las inscripciones con
la clave y no con una equivocada, marcar una como aceptada, encontrar el
torneo por el código de su enlace en vivo como `anon`, y borrarlo con sus
inscripciones.

Al tocar esto, `node herramientas/verificar-pareo-anuncio.js`. Rompiendo a
propósito las letras en español, que una inscripción entre sola, el
consentimiento, el id del enlace, los porcentajes, el código del evento o la
búsqueda del enlace que ya nadie transmite, salta.

### Los premios especiales, WhatsApp, la hoja para la pared y el sorteo en el proyector

Lo pidió el dueño del sitio, de una lista de propuestas. Dos de esas
propuestas ya existían y no se volvieron a hacer: la aceleración Baku (la
casilla «Aceleración Baku» de la ficha Torneo, que va al TRF como
`FIDE_DUTCH_2026_BAKU`) y el aviso de la ronda atrasada (en el reloj del
retraso). A ese aviso solo se le corrigió que nombraba la posición de la mesa
(«mesas 2») en vez de su número en la sala (`V.mesaFisica`: «mesas 12»).

- **Los premios especiales** (`js/pareo/premios.js`, sin DOM). Además del
  podio, un torneo individual reparte premios por franja de Elo, por
  categoría (el campo libre de cada jugador), a la mejor mujer y al mejor
  sin Elo, de uno a tres por premio. Se anotan debajo de la Clasificación
  (`t.premiosEspeciales`) y salen ahí, en la premiación del evento y en los
  diplomas («por obtener el premio especial «Mejor mujer» en…»). La regla
  es la de las bases de casi todos los torneos: **nadie se lleva dos
  premios**. Primero el podio, con los mismos empatados que pone
  `V.podio` (puestos 1 a 3, no «las tres primeras filas»: si no, quien
  comparte el tercer puesto recibiría bronce y además un premio especial),
  y después cada premio en el orden en que está anotado, al mejor
  clasificado que todavía no tiene. Un premio vacío dice por qué: nadie
  cumple la condición o quienes la cumplen ya tienen otro premio. En
  equipos no hay: ya está el mejor de cada tablero.
- **Compartir por WhatsApp** (`js/pareo/compartir.js`, sin DOM). En cada
  ronda y en la Clasificación, «Compartir por WhatsApp» arma el mensaje
  (el pareo con la mesa de la sala, los puntos de antes de la ronda como en
  las listas de FIDE, los libres al final y el resultado si ya está; o la
  clasificación con su primer desempate) y lo muestra para revisarlo, con
  «Abrir WhatsApp» (`https://wa.me/?text=`: quien lo manda elige a quién,
  en el celular o en la computadora) y «Copiar el texto». Si el torneo está
  en vivo, el mensaje lleva el enlace. Los asteriscos de un nombre se
  quitan: en WhatsApp abrirían una negrita.
- **La clasificación para la pared** (A3). «Para la pared (A3)» imprime una
  hoja A3 con letra grande: puesto, nombre, centro, puntos y los dos
  primeros desempates, con la ronda y **la hora en que se imprimió** (una
  hoja vieja en la pared engaña). La página con nombre `@page pared` va en
  el `body` entero mientras se imprime: puesta solo en la hoja, lo que hay
  antes en el documento, aunque no mida nada, abría una primera hoja carta
  en blanco (se vio en el PDF: dos hojas, la primera de 612 × 792).
- **El sorteo del congresillo en el proyector.** En la ronda 1, «Sortear en
  el proyector» (los números de salida de un todos contra todos) y
  «Sortear el color en el proyector» (el color del n.º 1 en un suizo; el
  color se sortea con `T.sortearColor`). Se abre a pantalla completa, con
  letra enorme y el número escrito (no solo el color de la ficha), anuncia
  los números uno por uno y queda anotado en el torneo (`t.sorteo`, con la
  hora); el acta del evento lo trae en «Sorteos». Con «menos movimiento»
  del sistema sale todo de una vez. Es un diálogo de verdad: el foco queda
  adentro, Escape lo cierra y el foco vuelve al botón (después de salir de
  la pantalla completa: al salir, el navegador suelta el foco).

**Descartado para siempre: que el jugador anote su resultado desde el
celular** (escanear el QR de la mesa y marcar quién ganó). El dueño del
sitio lo descartó y pidió que no se vuelva a proponer. El resultado lo
anota el árbitro o un adjunto, como hasta ahora.

Al tocar esto, `node herramientas/verificar-pareo-premios.js`. Rompiendo a
propósito la regla de los dos premios, la mesa de la sala del mensaje, el
tamaño A3, los sorteos del acta o la mesa de la ronda atrasada, salta.

### Torneos en Pareo Integral: el espacio público

Lo pidió el dueño del sitio: «un espacio público donde se vean todos los
torneos, que elijan cuál quieren ver y ahí poder ver todas las rondas,
filtros por jugador y rivales, tabla de posiciones». Es
**`torneos-pareo.html`** (`js/torneos-pareo-pagina.js`), y los torneos los
publica quien organiza desde Pareo Integral, en la ficha «Archivos y
comprobador» («Publicar este torneo» o «Publicar los N torneos del evento»).

- **Sin cuenta, con una clave por torneo.** Pareo Integral se usa sin
  cuenta, así que publicar no puede depender de una sesión. La Edge
  Function `pareo-publicar` (`verify_jwt` en false) crea la fila y le
  devuelve a quien publica una clave secreta al azar; en la base se guarda
  solo su sha256 (`clave_hash`). El navegador la guarda dentro del torneo
  (`t.publicado = { id, clave, hora }`) y es lo único que deja ponerlo al
  día o quitarlo. Quien tiene el archivo .json del torneo tiene también la
  clave: es el mismo dueño. Antes de escribir pasa por el freno
  `public.pareo_frenar()` (sobre `interno.envios_publicos`, como los demás
  envíos sin cuenta): crear pesa más que actualizar.
- **Qué se publica lo decide la función, no el navegador.** `limpiar()`
  elige campo por campo: nombre, institución, Elo, título, federación,
  categoría, rondas y resultados. Nunca la fecha de nacimiento, el sexo, el
  ID FIDE, las firmas ni las notas del árbitro, aunque lleguen (se probó
  mandándolos: no quedan). El navegador ya manda solo eso
  (`PareoPublicar.datosPublicos`), pero no se le cree.
- **La lectura es pública y la clave no se lee.** `public.pareo_publicados`
  tiene RLS con lectura para todos, pero el permiso de SELECT es por
  columna y no incluye `clave_hash`; nadie puede escribir desde afuera (solo
  la función, con la clave de servicio). La página pide columnas con
  nombre, nunca `*` (un `*` fallaría por la columna sin permiso).
- **Con el consentimiento.** Publicar pide marcar «Tengo permiso para
  publicar los nombres y los resultados de este torneo», con enlace a la
  política de privacidad, que dice qué se ve y cómo pedir que se quite o se
  abrevie un nombre (Ley 8968).
- **Se pone al día solo.** Cada vez que se guarda el torneo, a los 30
  segundos, una sola llamada aunque en ese rato se anoten diez resultados.
  «Actualizar ahora» la manda en el momento y «Dejar de publicar» pregunta,
  borra con la clave y la olvida.
- **La página pública** lista los torneos (el más reciente primero, con un
  buscador por nombre, evento o lugar; de mil en mil, por el corte de
  PostgREST) y, al elegir uno (`#t=<id>`), muestra la clasificación (con
  los mismos módulos de `js/pareo/`, así sale igual que en la computadora
  del árbitro), las rondas con la mesa de la sala y un buscador de jugador,
  y cada jugador con sus rivales: ronda por ronda, el rival, su Elo, el
  color y lo que sacó. El torneo abierto se vuelve a leer cada minuto
  mientras la pestaña está a la vista, sin perder el foco ni lo buscado.
- **La ficha del jugador entre torneos.** Debajo de cada jugador, los otros
  torneos publicados donde aparece el mismo nombre, con su puesto y sus
  puntos, y el enlace a su ficha en ese torneo. La búsqueda es exacta
  (`datos @> {"jugadores":[{"nombre": …}]}`): «PÉREZ» y «PEREZ» son dos
  nombres. Se eligió así a propósito: unir por parecido juntaría a dos
  personas distintas en un espacio público.
- **Solo desde ajedrez-integral.com.** La función responde CORS solo a ese
  origen, como `pareo-elo-nacional`: desde una vista previa de Cloudflare
  publicar no funciona.

Se probó de punta a punta contra la base real, con `pg_net` desde la misma
base (el contenedor no llega a Supabase por HTTP): crear devolvió la clave,
la fila guardó el hash de 64 caracteres y ningún dato de más, `anon` la leyó,
borrar con una clave equivocada dio 403 y con la buena la quitó.

Al tocar esto, `node herramientas/verificar-pareo-publicar.js`, con dobles
de la función y de la tabla. Rompiendo a propósito lo que viaja (con la
fecha de nacimiento), el permiso, la espera de 30 segundos, la mesa de la
sala, las columnas pedidas (`*`) o la relectura, salta.

### La barra de progreso al buscar el Elo Nacional

Antes de esto, tocar «Buscar Elo Nacional de quien no tiene» con una lista
larga solo mostraba «Buscando…», sin ninguna señal de que seguía viva: con
veinte o treinta jugadores el pedido puede tardar varios segundos y no había
manera de distinguir eso de que se hubiera colgado.

- **No hay un «5 de 23» real que mostrar.** `buscarEloNacional()` manda los
  nombres en UNA sola llamada a la Edge Function (ver arriba), que contesta
  entera solo al terminar — no hay ningún aviso a medio camino que el
  navegador pueda leer. Partirla en varios pedidos más chicos para armar un
  progreso de verdad se consideró y se descartó: el freno
  (`pareo_elo_frenar`) cuenta **pedidos** por hora, 6 por conexión, no
  jugadores; una sola búsqueda de treinta jugadores partida en, digamos,
  cuatro pedidos de ocho gastaría cuatro de esos seis en una sola vez que
  alguien toca el botón, cuando hoy gasta uno. Partirla haría la búsqueda
  más transparente a cambio de hacerla mucho más fácil de agotar.
- **La barra es indeterminada a propósito: nunca un número inventado**
  (`#pi-elo-barra-caja`/`.pi-elo-barra` en `css/styles.css`, con su
  animación — y su versión quieta pero igual visible bajo
  `prefers-reduced-motion: reduce`). Lo único que dice es «esto sigue
  corriendo», no cuánto falta, porque cuánto falta es justo lo que no se
  puede saber sin romper el punto de arriba.
- **El texto de estado (`#pi-elo-nacional-estado`, con su `aria-live`) sí
  lleva un dato real**: cuántos jugadores está buscando (`buscandoElo`, con
  `{n}`). Se pone UNA vez al empezar, no se actualiza con un reloj
  corriendo: un `aria-live="polite"` que cambia cada segundo le leería a
  quien usa lector de pantalla un número en voz alta cada segundo entero de
  la búsqueda, y la barra —decorativa, `aria-hidden`— no le dice nada que el
  texto no le haya dicho ya.

Al tocar esto, `node herramientas/verificar-pareo-institucion.js` cubre que
la barra se vea mientras el pedido está pendiente (con un `page.route()` que
demora la respuesta a propósito), que el aviso de estado diga cuántos
jugadores busca, y que la barra se oculte de nuevo al terminar.

### La plantilla para la pared y el PDF de verdad

Antes lo único que había para llevar algo al papel era «Imprimir»
(`window.print()` con CSS de impresión): bueno para el archivo de una ronda
ya jugada, pero no para pegar en la pared antes de jugarla ni para mandar la
Clasificación por correo.

- **La plantilla para la pared** (`imprimirPlantillaMesas()` en
  `js/pareo/pagina.js`, botón junto a «Imprimir» en cada ronda ya emparejada)
  es una hoja APARTE de la tabla de la ronda: mesa, blancas, negras y un
  espacio en blanco — **nunca el resultado que ya esté guardado**, aunque la
  ronda ya tenga todos sus resultados anotados; es justo lo contrario de la
  tabla de arriba, que si imprime algo imprime el resultado. Vive en un
  `<div id="pi-plantilla">` escondido (`display: none` siempre en pantalla,
  `css/styles.css`) que se llena al tocar el botón, se marca el `<body>` con
  `pi-imprimiendo-plantilla` para que el CSS de impresión oculte la ficha
  abierta y muestre solo esto, y se llama a `window.print()`. El `afterprint`
  —que llega imprima o cancele— limpia la marca y el contenido; un solo
  listener para toda la página, no hace falta reengancharlo cada vez que se
  pinta la ronda.
- **El PDF de Clasificación y Tabla cruzada** (botón «Bajar PDF» en cada
  ficha) reusa `js/reporte-pdf.js` —el mismo generador a mano, sin ninguna
  librería, de los informes de actividades— en vez de escribir uno nuevo:
  `js/pareo/pdf.js` solo arma el «documento neutral» (título, subtítulo,
  una tabla, una nota) que ese generador ya sabe dibujar. Sin marca de agua:
  Pareo Integral no es de una academia en particular. El documento lo arma
  `datosClasificacionPDF()`/`datosCruzadaPDF()` con los MISMOS datos que ya
  pintó la pantalla —toman la fila ya filtrada por institución
  (`filasFiltradas()`, compartida con `pintarClasificacion()`/
  `pintarCruzada()`) — así que bajar el PDF con un colegio elegido en el
  filtro baja solo ese colegio.
- **Los símbolos del PDF son ASCII, no los elegantes de la pantalla**:
  `js/reporte-pdf.js` escribe Latin-1/WinAnsi a mano, y el signo menos de
  verdad que usa la Tabla cruzada en pantalla («−», U+2212) no está en esa
  tabla de caracteres —a diferencia del guion largo, que sí— y se perdería
  sin avisar. `datosCruzadaPDF()` no es un copy-paste de `pintarCruzada()`
  por eso: usa un guion común («-») donde la pantalla usa el signo elegante.
- **`js/pareo/pdf.js` no toca el DOM**: recibe encabezados, anchos y filas ya
  armados y en el idioma elegido, así que `documento()` se puede probar con
  Node, igual que `js/informe-grupo-pdf.js`.

### El atajo «No viene» antes de emparejar una ronda

Marcar a alguien ausente antes de emparejar la ronda **ya existía**: el
`<select>` de `pintarRondaNueva()` (`js/pareo/pagina.js`) tiene desde siempre
las opciones «Juega», «Bye pedido», «Ausente (0)» y «Bye de punto entero», y
quien elige «Ausente» queda afuera del TRF que se le pasa al motor
(`rondas[r].ausencias`, visto por `aTrf()` y `participantes()`), nunca se le
intenta emparejar y después se descubre como incomparecencia. Lo que faltaba
era la velocidad: con 50 jugadores, abrir el `<select>` de cada uno que avisó
que no viene y elegir la opción correcta es lento al lado de la mesa de
inscripción un domingo por la mañana.

- **El botón «No viene»**, al lado del `<select>` de cada jugador, pone
  directamente `"Z"` (la opción más común: alguien que no llegó, sin pedir
  nada) de un clic, y dispara el mismo evento `change` del `<select>` — no
  hay un camino de datos aparte, es un atajo de UI sobre el mismo mecanismo.
  Si la persona vuelve a avisar que sí viene, el mismo botón (que ahora dice
  «Deshacer») lo saca.
- **El botón no reemplaza el `<select>`**: quien pidió bye de medio punto o
  tiene un punto entero por reglamento sigue eligiéndolo ahí; el botón es
  solo para el caso más frecuente, «no viene y no pide nada».
- Queda solo en el sistema Suizo. En «todos contra todos» no hay bye a
  elección (la ronda libre la decide la tabla de Berger) y quien no se
  presenta se anota como incomparecencia en el resultado, no antes de
  emparejar.

**Al tocar la plantilla o el PDF, correr `node herramientas/verificar-pareo-pagina.js`**
(su sección 11): que la plantilla no traiga ningún resultado aunque la ronda
ya los tenga, que limpie el `<body>` y el contenido al terminar de imprimir,
que los dos PDF sean un PDF de verdad (`%PDF-` al principio) con los nombres
y la institución adentro, y que el filtro de institución elegido en pantalla
baje solo esa institución. Rompiendo a propósito cualquiera de los dos,
salta.

### El buscador de jugador en la lista

Con muchos jugadores, encontrar uno para corregir un dato a mano en la tabla
de Inscritos se vuelve lento. Un cuadro de texto (`estado.filtroJugador`, el
mismo patrón que `estado.filtroInstitucion`) filtra `pintarJugadores()` por
nombre o institución, sin tildes ni mayúsculas
(`normalizarBusqueda()`, el mismo truco de `NFD` + quitar diacríticos que ya
usa `bolsilloNombre()` para detectar duplicados). No hay nada de servidor que
buscar: Pareo Integral no tiene backend propio de jugadores, así que el
filtro es, como el resto de la página, sobre la lista que ya está cargada en
el navegador. Se vacía al abrir o crear otro torneo, igual que el filtro de
institución.

### Las planillas de mesa para firmar, lo contrario de la plantilla de la pared

La plantilla de la pared (arriba) es para ANTES de la ronda y nunca muestra
un resultado. Las planillas para firmar (`imprimirPlanillasFirma()`) son para
DESPUÉS: una hoja POR MESA —con salto de página real entre una y la
siguiente (`break-after: page` en `.pi-firma-mesa`)— para que el árbitro la
recoja firmada por los dos jugadores. A propósito, muestran el resultado ya
anotado (o un espacio en blanco para escribirlo si todavía no hay uno): es
para que ambos lo confirmen con su firma, no para ocultarlo. Un bye no tiene
con quién firmar: sale sin líneas de firma. Comparten con la plantilla de la
pared el mismo patrón —un `<div>` siempre oculto en pantalla, una clase en el
`<body>` que el CSS de impresión usa para esconder la ficha abierta y mostrar
solo esto, y un único `afterprint` que ahora limpia los dos contenedores— así
que no hace falta reengancharlo cada vez.

### El resumen de validación antes de emparejar la ronda 1

Antes de emparejar la ronda 1 (y solo ahí: después el orden ya quedó fijo),
`pintarRondaNueva()` cuenta cuántos jugadores no tienen categoría, institución
o Elo y lo dice en una lista corta. Es solo un aviso: **nunca deshabilita el
botón «Emparejar»**, porque ninguno de esos tres datos es necesario para el
Sistema Holandés en sí —el Elo decide el orden inicial (y los desempates que
lo usan), pero su ausencia no rompe el pareo, solo ordena a ese jugador al
final (`porCriterio()` en `torneo.js` ordena por Elo descendente, y `0` es lo
más bajo)—. Deshabilitar el botón por datos opcionales habría sido excesivo
para un torneo casual que no usa esos campos.

### El enlace y el QR de solo lectura

El pedido era «ver el torneo desde el celular sin tocar nada», y Pareo
Integral no tiene servidor propio de datos (solo la búsqueda de Elo Nacional,
ver arriba): no hay dónde publicar un estado que otro aparato pueda leer.
La solución, consistente con «nada sale de tu computadora», es que los datos
viajen DENTRO del enlace: `js/pareo/ver.js` comprime el JSON con
`CompressionStream("deflate")` (el mismo patrón ya usado en
`js/reporte-pdf.js`/`js/vista-previa.js` para no traer ninguna librería) y lo
codifica en base64 apto para URL (igual que `js/notificaciones.js`), puesto
en el FRAGMENTO de la dirección (después del `#`): el navegador nunca manda
el fragmento a ningún servidor, así que ni siquiera Cloudflare lo ve. Quien
escanea el código o abre el enlace lee esos datos directo del navegador que
los armó, sin que pasen por ningún lado.

- **Es una foto del momento, no una vista en vivo.** Cambia un resultado o
  empareja otra ronda y el código anterior queda desactualizado: hay que
  volver a generarlo. Se dice así, sin rodeos, en la propia caja («Ver desde
  el celular»).
- **Lo que viaja es lo que la pantalla ya pintó, no el torneo entero**:
  `compartirLectura(r)` en `js/pareo/pagina.js` arma un objeto chico —el
  nombre, la ronda (mesa, blancas, negras, resultado) y la clasificación
  (puesto, nombre, puntos)—, reusando `filasFiltradas()` y `D.clasificacion()`,
  las MISMAS funciones que ya usan la pantalla y el PDF. `js/pareo/ver.js` no
  necesita el motor de emparejamiento, el TRF ni los desempates para
  mostrarlo: es un dibujo de datos ya resueltos, no un segundo torneo.
- **Modo lectura, adentro de la misma página**: en vez de una página nueva (con
  toda la plomería de cabeceras, migas de pan y verificadores que eso exige),
  `arrancar()` en `pagina.js` mira `location.hash` ANTES de tocar
  `localStorage`: si empieza con `#ver=`, oculta `#pi-editor` (el `id` nuevo
  en el `<div class="max-w-6xl">` que envuelve todo lo editable) y llama a
  `PareoVer.iniciar()`, que pinta dentro de `#pi-ver`. **No lee ni escribe el
  torneo guardado en este navegador**: ni `abrir()` ni `crear()` ni `guardar()`
  se llaman en esa rama.
- **El dibujo del QR es una copia chica y a propósito**, no un módulo
  compartido con `js/clase-qr.js` (`sesion.html`): ese archivo es crítico para
  entrar a la clase en vivo y tiene su propio comprobador
  (`verificar-clase-qr.js`) que extrae su IIFE con un `eval` literal asumiendo
  que es autocontenido; refactorizarlo para compartir quince líneas estables
  de dibujo de QR no valía el riesgo de tocar una pantalla de producción para
  una mejora nueva y de menor criticidad. `js/pareo/qr.js` tiene su propio
  `svg()`/`cargar()`, iguales a los de `clase-qr.js` pero independientes.
- **El atril de origen manda**: el botón «Ver desde el celular» vive junto a
  «Planillas para firmar» en `pintarRondaJugada()` (solo con la ronda ya
  emparejada: antes no hay nada que mostrar), y pinta la caja
  `#pi-ver-compartir` (QR + dirección + «Copiar el enlace») que ya estaba en
  el HTML, oculta, para no perderla si `pintarRondaJugada()` se vuelve a
  pintar con un resultado nuevo.
- Un enlace roto (recortado al copiarlo, o escrito a mano) no rompe la
  página: `desempaquetar()` falla, y `PareoVer.iniciar()` muestra un aviso en
  vez de una pantalla en blanco o un error de consola.

**Al tocar el modo lectura, correr `node herramientas/verificar-pareo-pagina.js`**
(su sección 11, «Ver desde el celular»): que el código y la dirección
aparezcan al pedirlo, que abrir la dirección muestre el nombre del torneo, la
ronda y la clasificación compartidos, que NO toque el torneo guardado en el
navegador (se compara con `JSON.stringify` antes y después), que no mande
nada a ningún servidor, y que un enlace roto avise en vez de romper la
página. Rompiendo a propósito la descompresión o dejando que el modo lectura
escriba en `pareo_abierto_v1`, los dos saltan (el segundo con un `✗`, no con
el script colgado: el chequeo espera por `textContent`, no por un `<h1>` que
en el camino roto nunca aparece).

### El canal en vivo

«Ver desde el celular» (arriba) es una foto: queda vieja apenas cambia un
resultado. El pedido fue «que se actualice sola», y eso Pareo Integral no lo
puede hacer sin que algo reciba y reparta los datos en el medio — es decir,
sin un servidor. Se lo planteé así al dueño del repo (la primera vez que
Pareo Integral tocaría uno, de verdad, no solo la búsqueda de Elo Nacional) y
eligió hacerlo de verdad en vivo, con las dos cosas claras: que contradice a
propósito «nada sale de tu computadora», y que es una decisión de quien es
dueño del repo, no solo de código.

- **Un canal de Supabase Realtime en modo Broadcast**, no una tabla: no hay
  fila que guardar ni que proteger con una política, así que ninguna de las
  reglas de «La verificación en dos pasos» aplica (esa exigencia está atada a
  tablas con Realtime vía `postgres_changes`; un canal de Broadcast no tiene
  tabla). Tampoco lo tocan `verificar-realtime-filtros.js` ni
  `verificar-realtime-publicadas.js`: los dos buscan `postgres_changes` en el
  código, y Broadcast nunca aparece ahí. Y el freno de envíos públicos
  (`interno.frenar_envio_publico`) tampoco aplica: ese freno protege un
  INSERT que alguien sin cuenta puede disparar, y un Broadcast no inserta
  nada en ninguna tabla.
- **Público por default, sin RLS**: el proyecto nunca activó el modo privado
  de canales de Supabase (que exigiría una política sobre `realtime.messages`).
  Cualquiera con la anon key —la misma que ya es pública en
  `js/supabase-client.js`— puede unirse a un canal con solo saber su nombre.
  El nombre del canal (`pareo-vivo-<código>`) hace de contraseña: por eso el
  código es de 8 caracteres al azar (sin `0/1/i/l/o`, para poder leerlo a
  mano si hace falta) y vive en `v.liveCodigo`, guardado con el torneo. Quien
  tenga el enlace puede mandar mensajes falsos al mismo canal —no hay forma
  de firmarlos—; para un emparejamiento que de todas formas se comparte en
  público, se aceptó el riesgo en vez de construir algo más. El botón «Usar
  un código nuevo» (`$("pi-ver-en-vivo-nuevo-codigo")`) es la única salida si
  el código se comparte de más: no revoca al viejo canal (nadie puede, sin
  RLS), pero el organizador deja de mandarle nada.
- **`js/pareo/qr.js` no se compartió con `js/clase-qr.js`** (ver ese archivo)
  y por la misma razón `js/pareo/ver.js` NO reutiliza `js/supabase-client.js`
  como `<script>` fijo de `pareo.html`: lo carga perezoso
  (`PareoVer.cargarSupabase()`, igual que la librería del QR), para que la
  inmensa mayoría de quien usa Pareo Integral —que nunca toca «en vivo»— no
  pague el peso de Supabase. `_headers` ya traía `wss://…supabase.co` en
  `connect-src` para el resto del sitio: no hizo falta tocar la CSP.
- **Quién manda y quién escucha, nunca al revés**: `estado.canalVivo` en
  `js/pareo/pagina.js` solo llama `.send()`; nunca `.on()`. El organizador no
  necesita recibir nada (es el dueño de los datos), y esto evita que un
  mensaje ajeno al canal pueda, por accidente, pisarle su propia pantalla.
- **Qué manda y cuándo**: `datosLecturaActual(r)` —la misma función que ya
  armaba el enlace estático— con `r` siempre la ÚLTIMA ronda (`v.rondas.length
  - 1`), sin importar qué ronda esté mirando el organizador en su pantalla:
  «en vivo» significa el estado real del torneo, no lo que el organizador
  tiene abierto. Se manda desde `guardar()` (una línea: `if (estado.enVivo)
  difundirEnVivo();`), así que cualquier cambio que ya dispara un guardado
  —un resultado, un jugador nuevo, deshacer una ronda— lo manda solo, sin un
  gancho aparte para cada acción.
- **Apagarlo de verdad apaga**: cambiar de torneo (`abrir()`/`crear()`) corta
  el canal (`apagarEnVivo()`), para no seguir mandando el estado de un
  torneo al canal de otro. Desmarcar la casilla también corta: nunca se deja
  un canal mandando datos que nadie pidió seguir viendo.
- **Quien mira y nadie transmite, no se queda mirando una pantalla en
  blanco para siempre**: `PareoVer.iniciarVivo()` pone un aviso de «Conectando»
  y, si no llega nada en 8 segundos, lo cambia por uno de «Esperando» (el
  organizador puede no tener la pestaña abierta). Sigue escuchando: si algo
  llega después, igual se pinta.
- No se actualiza sola si quien organiza cierra la pestaña: el canal es tan
  efímero como la conexión. Quien ya estaba mirando se queda con la última
  foto que le llegó; quien recién abre el enlace no ve nada. Se dice así, sin
  vueltas, en la propia caja («Actualizar sola (en vivo)»).

**Al tocar el canal en vivo, correr `node herramientas/verificar-pareo-pagina.js`**
(su sección 12): nunca habla con el Supabase de verdad —dos páginas de
Playwright aparte (el organizador y «el celular»), cada una con su propio
`window.sb` falso, y Node relevando los mensajes de una a la otra, igual que
haría un canal de Broadcast—. Comprueba que activarlo manda la foto de
ahora, que un resultado nuevo le llega solo a quien ya esté mirando, que
desmarcarlo corta los envíos siguientes, que «Usar un código nuevo» cambia
el código sin tocar el torneo, que un código al que nadie transmite avisa
que está esperando (no una pantalla en blanco), y que cambiar de torneo
apaga el canal del anterior. Rompiendo a propósito cualquiera de esos
caminos, salta.

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
  (`?region=Cartago&region=Heredia&categoria=D&etapa=regional&modalidad=Equipos&rama=Femenina&desde=2022&hasta=2025`)
  para compartir una vista; uno que no existe se ignora. Los colores de las
  etapas están medidos en `css/styles.css` y cada etapa va también escrita.
- **Los filtros valen para toda la página** (pedido del dueño, octubre de
  2026): una o varias regiones, categoría, etapa, modalidad, rama y los años.
  Con cinco filtros que se combinan, ya no hay una serie armada de antemano por
  región y categoría: cada vez se cuenta sobre los torneos que pasan (son unos
  1400, nada). Lo que hay que saber de cada uno:
  - **Varias regiones** se eligen en un panel de casillas (el botón dice si
    está abierto; Escape, «Listo» o tocar afuera lo cierran y el foco vuelve
    al botón). La cifra es la suma de las elegidas, y la tarjeta «región por
    región» muestra solo esas, en la misma escala, para compararlas: se
    descartó apilar las regiones en un gráfico porque harían falta colores
    nuevos (y medirlos) y con más de tres ya no se leen.
  - **La etapa** pasó de la tabla de torneos a arriba: cambia las cifras, el
    gráfico grande (queda una sola capa) y la tabla. La final nacional no es de
    ninguna región: con regiones elegidas y la etapa nacional, la página lo
    dice en vez de mostrar ceros sin explicación.
  - **La rama** no está en el CSV: sale del nombre con `reglas.rama()` y va en
    el JSON. «Femenino», «Fem», «Mujeres», las claves de Occidente («2025 AIF»)
    y el nombre cortado en «… C Fe» o «… C F»; abierta es lo que dice abierto,
    absoluto o masculino (2011 y 2015). Unos 130 torneos de los JDE no dicen
    ninguna de las dos (chess-results cortó el nombre antes) y quedan sin rama:
    adivinar «abierta» inflaría esa rama. Con el filtro puesto, la página dice
    cuántos quedan fuera.
  - **Los años** («desde» y «hasta») recortan todo; si uno pasa al otro, el
    otro lo sigue y el rango nunca queda al revés. Las cifras comparan «hasta»
    contra «desde»; sin elegir años, contra 2023, el año en que las regiones
    empezaron a publicar (la historia de la frase de arriba). El rango va del
    primer torneo (CODICADER 2009) al último, y sale de los datos: un año nuevo
    entra solo.
- **Se pone al día sola, una vez al mes, de abril a diciembre**
  (`.github/workflows/ajedrez-estudiantil.yml`, el 1.° de cada mes: en enero,
  febrero y marzo no hay clases y por lo tanto no hay torneos de los JDE que
  revisar — correrlo en esos meses solo gastaría pedidos contra
  chess-results por nada). Antes corría cada seis horas; el dueño pidió
  bajarlo a una vez al mes a partir de abril de 2026. Esto también le baja el
  ritmo al que se completan las partidas atrasadas de
  «Leer las partidas de los individuales de 2024 en adelante» más abajo: con
  solo 100 pedidos por corrida y una corrida al mes (en vez de cuatro por
  día), terminar un backlog de varios miles tarda años en vez de semanas; si
  hace falta ponerse al día más rápido, se puede correr el flujo a mano
  (`workflow_dispatch`) las veces que haga falta. Chess-results no avisa cuando
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
  cuando hubo algo nuevo, para no abrir un PR en cada corrida por nada.
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
- **Lo que la búsqueda por palabras no reconoce.** El 10/10/2026 se revisó si
  faltaba algún torneo de los JDE con otro camino: todos los torneos de Costa
  Rica partidos por tipo (suizo, round robin, liga y suizo por equipos) y
  ritmo, más el nombre («JDE», «estudiant», «regional» partido por tipo y
  ritmo, «eliminatoria», «circuit», «categor», «institucional»…) y el
  organizador («Regional», «DRE», «MEP», «Supervis», «Direcci», «Educ»…).
  Las búsquedas vieron los 1367 torneos que ya estaban; de los 850 con pistas
  que no estaban, las reglas no sumaban ninguno nuevo (los 7 que aceptaban eran
  duplicados, vacíos o amistosos ya descartados). A ojo salieron 32 de los JDE
  que ninguna regla puede reconocer sin meter torneos privados: la regional de
  Alajuela de 2016 y la de 2018 y la de San José Norte de 2018, subidas como
  «Categoria A Individual Abierto» sin organizador; «JDR Turrialba» (errata de
  «JDETurrialba», sus hermanos sí estaban); la categoría D absoluta de Guápiles
  2025 («individual absoluto categoria D», jugadores de Pococí, el mismo día
  que las demás de Guápiles); y la institucional del LEBCBA de 2023 (la de
  2026 ya estaba). Después, el dueño confirmó que «Institucional Sinai» e
  «Institucional Laboratorio A/B» (Pérez Zeledón, 2026) sí son de los JDE y que los «Festival Circuital … Mis
  Primeras 64 Casillas» del circuito 05 (2025) no: son aparte. **Se reconocen por clave** en `A_MANO` de
  `ajedrez_estudiantil_reglas.py`, con su etapa y, si el nombre no la dice,
  su región o categoría: así el verificador sigue exigiendo que las reglas den
  exactamente lo guardado. Quedaron fuera los festivales circuitales, los
  «Juegos Regionales de Cartago» (2026, del CCDR, no del MEP), el «COLYPRO
  Regional» (profesores). Desde la base, `pg_net` solo despierta con una
  llamada suya (`net.http_get`): los POST metidos directo en
  `net.http_request_queue` se quedan en la cola hasta la siguiente; y el
  formulario del buscador vence en unos minutos, así que se pide uno nuevo
  antes de cada tanda.
- **Lo dudoso se anota para revisar, no se pierde.** Los 36 de arriba (35 de
  esa revisión y «Interrregional Alajuela JDNEquipo C», 2019, hermano de los
  «Interregional Alajuela JDE…») tenían algo en común: una letra de categoría,
  un organizador del MEP o una palabra de las etapas, sin que ninguna regla los
  aceptara. `reglas.dudoso()` mira eso (y descarta lo que se sabe ajeno: JDN,
  federación, torneos de clubes por edades, festivales…), y el actualizador ya
  no deja ese torneo fuera sin avisar: lo anota en
  `herramientas/datos/ajedrez-estudiantil-revisar.csv` (`decision` vacía) y el
  resumen del PR lista todo lo pendiente con su enlace. Si es de los JDE, va a
  `A_MANO` y a la lista de torneos (y sale de la de revisar); si no, `no` en
  `decision`, y no se vuelve a anotar. Medido contra la revisión del
  10/10/2026, la alarma habría marcado todos los de `A_MANO` (el verificador lo
  exige) y 31 de más en toda la historia; esos 31 se guardaron revisados: 25
  con `no`, los 2 del «Institucional Anastasio Alfaro» (2022), que el dueño
  confirmó y pasaron a `A_MANO`, y 4 del «Torneo CECELO» 2026 (Cañas),
  que el dueño dijo que no son de los JDE (`no`). Un nombre cortado que es dudoso
  también se lee completo antes de decidir.
- `verificar-ajedrez-estudiantil.js` cuenta las participaciones directo del
  CSV, por otro camino que la página, y las compara con lo que se pinta: sin
  filtros, con una región, con dos, con una categoría y con las dos, con cada
  etapa, modalidad, rama y rango de años, y con un enlace que trae todos; además, los
  filtros en la dirección, el aviso de la final, el teclado, el celular a
  400 px, el modo oscuro y la página sin datos. Sumando también los blitz, o
  sin filtrar la tabla por región, salta.

## Los torneos de Oscar Angulo en chess-results

`oscar-angulo-torneos.html` es una página pública con todos los torneos de
chess-results.com en que Oscar Angulo Cubero (ID FIDE 6501435) figura como
árbitro principal, árbitro adjunto principal, árbitro, director del torneo u
organizador, con filtros y totales (pedido del dueño, octubre de 2026). Se
enlaza desde `sobre-oscar.html`, en la línea de sus títulos de árbitro.

- **De dónde salen los datos.** Como Ajedrez estudiantil: el buscador de
  torneos (`TurnierSuche.aspx`) pedido desde la base con `pg_net` (los POST en
  `net.http_request_queue` y un `net.http_get` para despertarlo; un
  `net.http_get` con cabeceras propias, como un `User-Agent`, devuelve 400).
  El buscador tiene una casilla por rol (`txt_leiter` director,
  `txt_veranstalter` organizador, `txt_Hauptschiedsrichter` árbitro principal,
  `txt_Schiedsrichter` árbitro), busca por pedazo de texto y su tabla trae las
  cinco columnas de quién hizo qué. Se buscó, en todas las federaciones
  (`combo_land=-`) y con 2000 filas (`combo_anzahl_zeilen=5`), «Angulo»,
  «Ángulo», «Cubero» y «6501435» en las cuatro casillas, «Ajedrez Integral»
  como organizador y director, y «Angulo» en el nombre del torneo. Ninguna
  búsqueda llegó a 1000 filas (la más grande, 568), así que ninguna quedó
  cortada (ver arriba: **una búsqueda que da justo 1000 no está completa**).
  «Ángulo» no trajo nada aparte: chess-results ya ignora la tilde.
- **Quién es él.** De 1195 torneos distintos, una casilla lo nombra si trae su
  ID, sus dos apellidos o «Oscar» y «Angulo» juntos en cualquier orden
  (`ES_EL` en `herramientas/oscar-angulo-torneos.py`): «IA Angulo Cubero,
  Oscar 6501435», «Angulo Oscar», «IOscar Angulo Cubero», «Óscar Ángulo
  Cubero», «6501435 Angulo Cubero, Oscar FA», o dentro de una lista de varios
  árbitros. Los demás Angulo (Noris Angulo en Venezuela, Rivero Angulo en
  Perú…) y los Cubero (Rodrigo Cubero Ferreiro en Galicia, Marlin Porras
  Cubero) quedan fuera solos. «AnguloChess» y «Angulo Chess // ADASA //
  ASOEDUFI» como organizador son suyos: en los seis torneos él es también el
  árbitro principal o el director. Ninguna forma de su nombre aparece sin
  «Angulo» (la búsqueda por «Cubero» y por el ID no trajo nada nuevo).
- **Lo que se dejó fuera a mano** (`NO_SON_DE_EL`): once torneos de los Juegos
  Intercolegiados de Montería (Colombia, 2022), con «Oscar Angulo» de árbitro,
  sin segundo apellido ni ID, organizados por la Alcaldía de Montería: es otra
  persona. Los de Honduras (CODICADER 2016, «FA Oscar Angulo Cubero»), Cuba,
  República Dominicana y El Salvador sí son suyos. Un torneo subido dos veces
  (La Vega 2019, mismo nombre, fechas e inscritos) cuenta una vez
  (`REPETIDOS`), y el del 14/11/2015 en Escazú, con la federación sin poner
  (ZZZ), cuenta como de Costa Rica.
- **La fuente es `herramientas/datos/oscar-angulo-torneos.csv`**, un torneo
  por fila como lo da el buscador, con el nombre completo de los 338 que
  llegaban cortados a 50 letras (leído del `<h2>` de la página de cada uno).
  De las casillas de director y árbitros se guarda solo la que nombra a un
  «Angulo»: las demás traen nombres de otras personas que la página no usa. El
  organizador se guarda pero no pasa al JSON (a veces es una persona, como en
  Ajedrez estudiantil). `herramientas/oscar-angulo-torneos.py` arma
  `data/oscar-angulo-torneos.json`, que no se edita a mano, y falla si un
  torneo del CSV no lo nombra en ninguna casilla.
- **Lo que se saca de cada torneo**, todo en el script: sus roles (un torneo
  puede tener dos: director y árbitro principal), la forma del nombre sin
  título ni ID (siete formas, con cómo vienen escritas de verdad), el título
  que lo acompaña (IA o AI, FA o AF, AN o NA: la página dice el primer y el
  último torneo con cada uno), el ritmo (el nombre manda —«blitz»,
  «rápido»—; si no, el control de tiempo con la regla de FIDE: minutos más el
  incremento de 60 jugadas, blitz hasta 10, rápido hasta 60, clásico desde
  60; 141 no lo dicen: «.», «pendiente» o nada), la modalidad, el país (la
  federación) y un tipo según el nombre: Juegos estudiantiles (los que están
  en `ajedrez-estudiantil-torneos.csv` o dicen JDE, estudiantil, CODICADER…),
  Juegos Deportivos Nacionales, Internacional, Campeonatos nacionales y el
  resto. Tres torneos no tienen fecha en chess-results y sin año en el
  nombre: toman el del torneo de clave más cercana (chess-results numera en
  el orden en que se crean) y la página dice «hacia 2016».
- **La página cuenta todo en el navegador** (`js/oscar-angulo-torneos.js`),
  con las tarjetas y tablas de Ajedrez estudiantil (`ae-*`). Cada resumen (por
  año, rol, tipo, ritmo, país) es una lista de barras horizontales en HTML,
  no un SVG: cada fila es un botón con el número escrito, que pone ese filtro
  (`aria-pressed`) y lo quita al tocarla de nuevo, y cuenta con todos los
  filtros menos el suyo, para que la barra elegida no deje a las demás en
  cero. Los filtros van en la dirección
  (`?rol=ap&titulo=IA&ritmo=Clásico&desde=2022&hasta=2025`); uno que no existe
  se ignora. La tabla muestra de a 100 y baja en Excel con
  `js/tabla-excel.js`. Las fechas son días de calendario y se escriben tal
  cual, sin `new Date()`.
- **Un `sr-only` dentro de una tabla con scroll alarga la página.** El primer
  intento ponía «(abre chess-results en otra pestaña)» oculto en cada enlace:
  `.sr-only` es `position: absolute`, sin un antecesor posicionado se ubica
  contra la página y se escapa de la caja con `overflow: auto`, y la página
  medía 10 143 px en vez de 4 904, con un hueco en blanco debajo del pie. El
  aviso pasó al `caption` de la tabla, y el verificador mide que la página
  termine en el pie.
- **No se pone al día sola**: es una foto del 14/10/2026
  (`herramientas/datos/oscar-angulo-actualizado.txt`). Para sumar lo nuevo,
  repetir las búsquedas desde la base y volver a correr el script.
- `verificar-oscar-angulo-torneos.js` cuenta por otro camino, directo del CSV
  (torneos, jugadores, rondas, árbitro principal, organizador, Honduras),
  comprueba que Montería y la copia repetida no estén, los filtros, la
  dirección, las barras, la búsqueda sin tildes, «Mostrar más», ordenar, el
  Excel, el celular, el modo oscuro y que la página termine en el pie.

## Sus torneos en FIDE y las normas de árbitro

`oscar-angulo-fide.html` es la hermana de la de chess-results: los torneos
registrados en FIDE en que Oscar Angulo figura en su perfil de
ratings.fide.com como árbitro principal (Chief), adjunto principal (Dep.
Chief), árbitro (Arbiter) u organizador, y si cada uno cumple las condiciones
de un torneo para una norma de Árbitro FIDE (AF) y de Árbitro Internacional
(AI). Él ya tiene los dos títulos (AF 2016, AI 2020): pedido del dueño,
octubre de 2026, «cuáles son válidos aunque ya las tenga».

- **De dónde salen los datos.** Desde la base con `pg_net`, como chess-results.
  El perfil (`ratings.fide.com/profile/6501435`) carga sus pestañas «Arbiter»
  y «Organizer» aparte, en JSON (`a_profile_data.php?records=1|3&event=…`):
  fecha, cargo, torneo y su número. De cada torneo se leen tres páginas: la
  ficha (`tournament_information.phtml`: sistema `s`/`r`/`d`/`t`, «Rated …
  as Standard|Rapid|Blitz», jugadores, fechas, árbitros), la lista de
  jugadores con Elo (`report.phtml`: ID, federación, Elo, partidas) y el
  reporte ronda a ronda (`tournament_src_report.phtml`: cada jugador con Elo
  y sus rondas, con «Forfeit (-)» cuando no se presentó).
- **FIDE corta si se le piden muchas páginas juntas**: de 226 pedidos a la
  vez contestó 23 («Server returned nothing»). Se pidió de a 10–15 con pausas
  de 25 segundos, una consulta idempotente que mira qué falta y pide lo
  siguiente. `net.http_get` con cabeceras propias (un `User-Agent`) devuelve
  400 en chess-results; a FIDE no le hacen falta.
- **Lo que FIDE no dice, y cómo se resolvió**:
  - el reporte ronda a ronda trae **solo a los jugadores con Elo** y sus
    partidas valoradas, así que las federaciones de jugadores sin Elo no se
    ven: el número de federaciones es un mínimo;
  - la columna «Tit.» de la lista viene **vacía siempre** (6206 jugadores, ni
    uno con título). Los títulos salen de la lista completa de FIDE
    (`players_list_foa.txt`, ~300 MB, la que pasó el dueño por Drive):
    `herramientas/oscar-angulo-fide-titulos.py` guarda solo los titulados de
    sus torneos en `herramientas/datos/oscar-angulo-fide-titulos.json` (251
    de 2343). Son los títulos de hoy, no los de la fecha del torneo, y eso
    decide cómo se lee: un título no se pierde, así que si con los de hoy un
    internacional no daba para una norma de jugador (B.01: la mitad de los
    rivales titulados GM, IM, FM, WGM, WIM o WFM y un tercio GM o MI, o WGM y
    WIM para una norma femenina), tampoco daba entonces y es «no»; si da,
    alguien pudo sacar el título después, y queda «para revisar» (también el
    promedio de Elo, que no se mira);
  - la ficha a veces trae menos jugadores de los que tiene su propia lista
    (el XLV Metropolitano U14 dice 60 y lista 108): se toma el mayor;
  - un torneo registrado pero sin valorar (los U07) no dice «Rated as»: el
    ritmo sale del control («Standard: …») y no vale por no tener jugadores
    con Elo;
  - si FIDE no tiene el reporte ronda a ronda, las rondas salen del mismo
    torneo en chess-results (mismo día de inicio y dos palabras del nombre en
    común), que también da el enlace.
- **Las reglas son las de B.06.1 vigente desde el 1 de marzo de 2026**
  (`handbook.fide.com/chapter/B06012026`), en `evaluar()` de
  `herramientas/oscar-angulo-fide.py`, y solo las de un torneo: AF, suizo 20
  con Elo, todos contra todos 8, doble 6, equipos y eliminación 20, 7 rondas
  (una de 5 o 6), rápido o blitz 30 y 9 rondas una vez; AI, final del
  nacional individual de mayores (por el nombre, sin Sub, U, pares, impares,
  blitz…), eventos oficiales y continentales (por el nombre: «revisar»),
  internacional de 100 jugadores, 3 federaciones, 30 % con Elo y 7 rondas una
  vez, nacional por equipos (revisar), 9 rondas (una de 7 u 8); y lo que vale
  para AI vale para AF (3.12). Un jugador cuenta si faltó a lo sumo a una
  ronda (2.4.1): se descuenta a quien tiene dos «Forfeit (-)» o más. Las
  reglas de la solicitud (firmas, fechas que no se tocan, un solo torneo por
  festival, un certificado cada 25 jugadores, seis años, dos sistemas) no se
  ven desde afuera y la página las explica en vez de aplicarlas. Cuando él
  sacó los títulos regía el reglamento anterior (AF pedía 10 en un todos
  contra todos): la página mide todo con el de hoy y lo dice.
- **Cada norma va escrita** («Vale», «Vale (una así)», «Vale una vez»,
  «Revisar», «No») **con su porqué** debajo: no hay color que la diga sola.
- La fuente es `herramientas/datos/oscar-angulo-fide.json` (lo leído de FIDE,
  ya resumido por la consulta) y `herramientas/oscar-angulo-fide.py` arma
  `data/oscar-angulo-fide.json`. Las barras que filtran salieron de la página
  de chess-results a `js/barras-filtro.js`, que usan las dos.
- `verificar-oscar-angulo-fide-reglas.py` prueba cada condición con torneos
  armados a mano, por los dos lados del límite (19 y 20 jugadores, 6 y 7
  rondas, 99 y 100 jugadores, 29 % y 30 % con Elo, el Sub-16 que no es la
  final…). `verificar-oscar-angulo-fide.js` prueba la página.

## Árbitros de Costa Rica en FIDE

`arbitros-cr.html` es una de las herramientas con licencia (`id: "arbitros-cr"`
en `js/herramientas-arbitraje.js`): lo mismo que «Sus torneos en FIDE y las
normas de árbitro» hace con Oscar Angulo, para todos los árbitros de Costa
Rica. Lo pidió el dueño (octubre de 2026): primero solo para administración,
después «ponerlo en herramientas pero con licencia», y primero lo de FIDE
(chess-results queda para después).

- **Los datos están en la base, no en `data/`** (todo lo de `data/` es
  público): `arbitros_cr` (cada árbitro, con su título), `arbitros_cr_torneos`
  (cada torneo, con la norma de AF y de AI ya evaluada) y `arbitros_cr_cargos`
  (quién fue qué en cada torneo), migración `20261014162543`. **El candado es
  la RLS**, como en «Resultados JDN por comité»: la única política es de
  lectura y pregunta `(select tengo_herramienta('arbitros-cr'))`; sin licencia
  las tablas no devuelven nada. No hay política de escritura.
- **De dónde salen.** No hay una lista pública de árbitros por federación que
  sirva: la columna OTit de la lista de jugadores de FIDE no trae el título de
  árbitro (la de Oscar Angulo dice «AO», no «IA»). Se parte de los
  **torneos**: FIDE lista los de Costa Rica mes a mes
  (`a_tournaments_panel.php?country=CRC&periods_tab=1` da los 172 meses desde
  2002, 1338 torneos; `a_tournaments.php?country=CRC&period=AAAA-MM-01` los
  de un mes, y **solo contesta con las cabeceras de un pedido AJAX**:
  `X-Requested-With: XMLHttpRequest` y el `Referer` de la página). La ficha de
  cada torneo enlaza a cada árbitro con su perfil (`/profile/ID`), su
  federación y su cargo («Chief Arbiter», «Deputy Chief Arbiter», «Arbiter»,
  «Pairings Arbiter»…): de ahí sale la lista de árbitros de Costa Rica, sin
  buscar a nadie a mano. FIDE usa además «Deputy Arbiter» y «Sector
  Arbiter»: son árbitros del torneo y se guardan como «Arbiter» (cuentan
  igual para la norma), sin suponerles un cargo más alto. En los meses más viejos la lista no trae el enlace
  `report.phtml` en el nombre: una lista se reconoce por empezar con
  `{"data"`, nada más.
- **Se baja con pg_net de a 12 páginas con pausas de 25 segundos** (FIDE corta
  si se le pide mucho junto), con una consulta idempotente que mira qué falta.
  Esa consulta y `exportar.sql` **no pasan regex por la página entera**: la
  ficha pesa unos 45 KB y el dato está en los 8 KB que siguen a «Event code».
  Con la página entera, la consulta pasaba del minuto con 136 fichas bajadas
  y habría chocado con el `statement_timeout` antes de terminar; con el
  pedazo (y `strpos` para saber qué página es) tarda menos de un segundo.
  El reporte ronda a ronda (300 KB cada uno) se pide **solo** de los torneos
  que podrían valer para alguna norma: los que tienen los jugadores con Elo
  que pide una de AF, y además los de ritmo estándar que podrían valer para
  una de AI aunque tengan pocos (una final nacional, un campeonato oficial o
  continental, el nacional por equipos o uno con tres federaciones). La
  primera vez se pidió solo por los jugadores con Elo, y un Panamericano
  Sub-8 de 9 jugadores con Elo se quedó sin rondas y salía «no» para AI: lo
  delató compararlo con la página de Oscar Angulo. En el resto la respuesta
  es «no» igual. FIDE no tiene el ronda a ronda de muchos torneos viejos:
  contesta 200 con una página sin `calc_table`, que cuenta como pedida (si
  no, la consulta la vuelve a pedir cada vez y se traba). En los más viejos
  la celda de la ronda no trae la fecha, solo el número. Como pg_net borra lo bajado a las seis
  horas, se resume enseguida con `herramientas/arbitros-cr/exportar.sql` a
  `herramientas/datos/arbitros-cr-fide.json`.
- **El título de árbitro sale del perfil de FIDE** (`/profile/ID`): trae
  «Arbiter/Trainer | FIDE Arbiter (2016) | International Arbiter (2020)» y
  «Arbiter Category D». `herramientas/arbitros-cr/perfiles.sql` lo resume en
  `herramientas/datos/arbitros-cr-perfiles.json`; la columna `titulo` guarda
  el más alto (IA, FA o AN) y `titulo_detalle` todos, con su año y la
  categoría. Quien no tiene título en FIDE queda en blanco (el título
  nacional no siempre figura ahí).
- **Las normas se evalúan con la misma copia** que la página de Oscar Angulo
  (`herramientas/normas_arbitro.py`, que salió de `oscar-angulo-fide.py` para
  eso), por torneo; el cargo se aplica en la página (`normaDe()` en
  `js/arbitros-cr.js`): principal, adjunto y árbitro llevan la norma del
  torneo; el asistente no cuenta (B.06.1, 2.4.4) y el de pareos, que el
  reglamento no nombra, queda para revisar.
- **Lo que dio la primera carga (14/10/2026):** 1338 torneos de 2002 a
  2026, 132 árbitros de Costa Rica (10 IA y 18 AF según su perfil; FIDE no
  devolvió el perfil de uno) y 4602 cargos. Por torneo, AF: 381 «sí», 32
  «una», 92 «opción»; AI: 30 «sí», 4 «una», 17 «opción» y 90 «revisar»
  (los títulos de los rivales son los de hoy). Comparada con la página de
  Oscar Angulo, da lo mismo en todos los torneos en común salvo donde él fue
  organizador, que allá no cuenta y acá se mira por cargo. Las tres huellas
  de la base dieron iguales a las de las cargas, y el candado se comprobó
  impersonando en SQL: una cuenta sin la licencia ve 0 filas en las tres
  tablas; una que administra, 132 / 1338 / 4602.
- `herramientas/arbitros-cr.py` arma con el JSON las cargas
  (`herramientas/arbitros-cr/carga-*.sql`, que borran y vuelven a llenar las
  tres tablas) y se corren en orden con `execute_sql`. Van en archivos de
  unos 20 KB: uno de 130 KB no pasaba entero por la conversación. Y los
  `delete` de la primera piden que alguien los apruebe: un subagente en
  segundo plano no puede, y la llamada se queda esperando hasta vencer a los
  60 s sin llegar a la base. Por eso las cargas no borran: los torneos se
  insertan con `on conflict (id) do update` (reescriben lo que ya estaba) y
  los cargos con `on conflict do nothing`; para sacar algo que ya no está en
  FIDE hay que borrarlo aparte. **El nombre del torneo va en base64**
  (`convert_from(decode(…))`): muchos son títulos de libros («Cien años de
  soledad», «Crónica de una muerte anunciada»…) y la carga que los traía
  escritos tal cual se cortaba al pasar por la conversación. Al terminar,
  `python3 herramientas/arbitros-cr.py --huella` da la huella (md5) que
  deben dar las tres tablas y la consulta que la saca de la base: si
  coinciden, nada llegó cambiado.
- **Sin el ronda a ronda no son «0 rondas».** Si FIDE no publica el reporte
  (o no se pidió porque el torneo no podía valer), no se sabe cuántas rondas
  tuvo: si con 9 valdría, queda «revisar» con ese aviso; si no, el «no» se
  explica por lo otro, sin nombrar rondas que no se conocen.
- `verificar-arbitros-cr.js` prueba la página con un doble: el candado sin
  licencia (no se piden las tablas), los conteos de la lista, la norma por
  cargo (lo rompí haciendo contar al asistente y salta), los filtros, la
  ficha y el enlace directo `#ID`.

## Árbitros de Costa Rica en chess-results

La misma herramienta (`arbitros-cr.html`, que pasó a llamarse «Árbitros de
Costa Rica») suma los torneos de chess-results (pedido del dueño, octubre de
2026: «primero FIDE», después chess-results). En chess-results no hay normas:
el buscador no dice si FIDE valoró el torneo, y los valorados ya están en la
parte de FIDE. Lo que aporta es la actividad: todos los torneos, valorados o
no, con quién fue árbitro principal, adjunto, árbitro, director u organizador.

- **De dónde salen.** El buscador (`TurnierSuche.aspx`) pedido con pg_net, con
  la federación CRC y un año por búsqueda (del 01/01 al 31/12, hasta 2000
  filas; el año más grande, 2026, dio 603): 4495 torneos de 2007 a 2026 (antes
  de 2007 casi no hay). **El POST va al servidor que dio el formulario**
  (`https://S1.chess-results.com/…`, el `location` de la respuesta al GET):
  mandado a `chess-results.com` redirige, la redirección lo vuelve GET y
  devuelve el formulario vacío, sin ningún error. La tabla del buscador trae
  las cinco columnas de quién hizo qué; **el nombre del torneo llega cortado
  a 50 letras** (así lo da el buscador) y se guarda así, con el enlace al
  torneo. Los torneos sin fecha en chess-results no salen en una búsqueda por
  año (de los de Oscar Angulo, 7 de 930).
- **A quién se reconoce** (`armar_chess_results()` en
  `herramientas/arbitros-cr.py`). Una celda trae a una o varias personas, de
  cualquier forma («IA. Angulo Cubero, Oscar (6501435)», «FA Zeledon Perez,
  Edgar 6509851», «Oscar Angulo», «Neeshmy Núñez, Edgar Zeledón»…), así que no
  se parte: se busca a cada árbitro conocido adentro, sin tildes ni títulos.
  Por su ID FIDE, **solo si al lado está su primer apellido** (hay ID mal
  escritos: 6500189 por 6508189, 65005694 por 6505694), o por su nombre:
  «Apellido1 Apellido2, Nombre», «Nombre [segundo] Apellido1» y «Segundo
  nombre Apellido1 Apellido2» («Josué Amaya Madrigal» es Amaya Madrigal,
  Alvaro Josue). «Apellido Nombre» solo para quien tiene un apellido: con
  dos, «Martinez Luis» calzaba en «Loria Martinez, Luis Felipe». Si dos
  árbitros comparten nombre y primer apellido (Stanley Gómez Huertas y
  Stanley Gómez Villalobos), a los dos se les pide el segundo apellido.
- **Los que solo están en chess-results.** Los ID FIDE de las celdas que no
  eran de los árbitros de FIDE (132) se buscaron en el perfil de FIDE
  (nombre y bandera): los de Costa Rica cuyo apellido calza con la celda
  entran a la lista (`solo_chess_results`), **solo si alguna vez fueron
  árbitro principal, adjunto o árbitro**: quien solo dirigió u organizó
  (Luis Quirós Rojas, Marlin Porras Cubero, Arleth González Camacho) no es
  un árbitro. Quedan en `herramientas/datos/arbitros-cr-perfiles-chess-results.json`.
  Quien nunca figura con su ID (Sebastián Castillo Chavarría, Eduardo Acuña
  Chacón…) no se puede reconocer y no está.
- **Comprobado contra la recopilación de Oscar Angulo** (que se revisó a
  mano): de sus 930 torneos de la federación de Costa Rica, 921 salen acá y
  ninguno de más; los 9 que faltan son 7 sin fecha y 2 con su nombre escrito
  «Angulo Oscar» o «IOscar Angulo Cubero».
- **La carga de los torneos no pasa por la conversación**: el SQL
  (`cr_torneos_sql()`, la carga que dice «Lee las respuestas del buscador»)
  los lee de `net._http_response` (`RESPUESTAS_CR`), mientras pg_net no los
  borre, y limpia el texto ahí mismo: sin etiquetas, con las entidades de
  letras y puntuación traducidas y sin las de emojis y símbolos de piezas.
  Solo se suben los cargos (números). Por eso la huella de
  `arbitros_cr_cr` mira números y fechas, no el texto. Otra descarga cambia
  `RESPUESTAS_CR`.
- **La página** suma la columna «En chess-results» a la lista (y cuenta a
  quien solo está ahí), la tabla de sus torneos de chess-results en la ficha
  (con su rol y el enlace al torneo) y una hoja más en el Excel. Las tablas
  de cargos se piden ordenadas por su clave completa: ordenadas por una
  columna que se repite, de mil en mil, una fila puede caer en dos páginas o
  en ninguna.
- **Lo que dio la carga (15/10/2026):** 4211 torneos de chess-results con
  algún árbitro de Costa Rica, 11 993 cargos y 34 árbitros que solo están
  ahí (la lista pasó de 132 a 166). Las cinco huellas de la base dieron
  iguales a las del generador (la de `arbitros_cr` con el booleano escrito
  `t`/`f`, como lo escribe `concat_ws`), y el candado, impersonando en SQL:
  sin la licencia, 0 filas en las tablas nuevas.
- `verificar-arbitros-cr.js` suma una persona que solo está en chess-results
  y comprueba la columna, la ficha y el enlace (lo rompí dejando fuera a
  quien no tiene torneos de FIDE y salta).

**Una fecha de chess-results mal escrita se corrige a mano.** Hay torneos con
la fecha equivocada en chess-results: el «Festival de divisiones Centro
Cultural Herediano» (666406 y 666407) dice del 22/09/2010 al 22/09/2011, pero
su clave es de 2022 y el dueño confirmó que se jugó el 10/09/2022 (lo vio en
la historia de Jeigoth Pastor Carvajal, que no arbitraba en 2010). La fecha
buena va en `herramientas/datos/arbitros-cr-corregir.json` (clave, inicio, fin
y motivo) y `armar_chess_results()` la pone en cada carga: corregirla solo en
la base no basta, porque la pasada del mes la vuelve a escribir. Vale para
todos los árbitros del torneo. Primero se pensó en quitarle el torneo a él solo,
pero el error es la fecha, no quién lo arbitró.

Después se buscaron los demás casos en los 4214 torneos de Costa Rica (un
torneo que dura más de un año, o con un año que no cuadra con su clave: las
claves de chess-results van en orden) y salieron dos, corregidos con la página
de cada uno a la vista: el **JUNCOS 2011 por equipos femenino** (48235), con
solo la ronda 1 en 2010, y el **Nacional Infantil S8** (63763), con las siete
rondas en 2002 pero actualizado por última vez el 13/01/2012 a las 22:21, la
noche de su última ronda. Los otros que duran más de dos meses son torneos de
club de una ronda por semana: esos están bien.

Para que no se cuele otro, `python3 herramientas/arbitros-cr.py --resumen`
termina con «Fechas por revisar» (`fechas_raras()`): un torneo que dura 300
días o más, o cuyo año queda a 3 o más de la mediana de los 50 de antes y los
50 de después en orden de clave (con menos de 20 vecinos no compara). Con los
datos de octubre de 2026 y sin las correcciones, salen exactamente los cuatro de
arriba y ninguno más; los de club, de dos o tres meses, no saltan. No corrige
nada solo: la fecha buena la confirma una persona en la página del torneo
(paso 3 de `.claude/skills/arbitros-cr-actualizar/`). Lo comprueba
`verificar-arbitros-cr-fechas.py`, con torneos inventados, y que cada
corrección tenga motivo y una fecha que se lea.


## El mismo torneo en FIDE y en chess-results

En `arbitros-cr.html` cada torneo sale **una vez** (pedido del dueño, octubre
de 2026: «que no haya duplicados; en el filtro, todos, pero poder filtrar por
FIDE y no FIDE»). Un torneo valorado por FIDE casi siempre está también en
chess-results, y sin cruzarlos se contaba dos veces.

- **El cruce** (`cruzar_con_fide()` en `herramientas/arbitros-cr.py`, y la
  columna `arbitros_cr_cr.fide_torneo`, única: uno a uno). Si el nombre de
  chess-results trae el código de FIDE entre paréntesis («Torneo Blitz de
  Canes (139418)»), ese. Si no, un torneo de FIDE que empezó el mismo día
  (±1), con dos palabras del nombre en común y sin chocar en categoría
  (U14/Sub-16), división (con `\b`: «ii division» calzaba dentro de «iii
  division»), rama (femenino/absoluto), año ni ritmo, con un puntaje:
  parecido del nombre, mismas rondas y jugadores, y **si comparten árbitro
  (suma 2) o tienen árbitros distintos (resta 1,5)**. Se emparejan de mayor
  a menor puntaje. Antes de sumar el árbitro, los dos Festival
  Centroamericano Sub-14 de 2013 (absoluto y femenino) quedaban cruzados al
  revés.
- **El ritmo como lo cuenta FIDE**: base + incremento × 60 jugadas. Un «30 +
  30» es clásico (60 minutos), no rápido; contado solo por la base, el
  cruce rechazaba 659 pares buenos.
- **Lo que dio** (15/10/2026): 973 de los 4029 torneos de chess-results son
  el mismo que uno de FIDE, y en 955 de ellos el mismo árbitro está en los
  dos lados. Los nombres de chess-results llegan cortados a 50 letras, y el
  de FIDE se compara cortado igual.
- **En la página**: la lista cuenta «Torneos», «FIDE» (los que FIDE valoró,
  estén o no en chess-results) y «No FIDE» (los que solo están en
  chess-results), y el filtro «Torneos» (Todos / Solo FIDE / No FIDE) vale
  para la lista y la ficha. La ficha es una sola tabla: el torneo de FIDE
  lleva sus dos enlaces y los cargos de los dos lados. Quien arbitró un
  torneo de FIDE según chess-results pero no figura en la ficha de FIDE
  queda «Revisar» (para FIDE, sin estar en su ficha, no cuenta); quien solo
  fue director u organizador, «No».
- **Los que no se jugaron, fuera** (pedido del dueño): un torneo de
  chess-results de prueba («test 260319») o sin rondas o sin jugadores no
  entra a la carga (`es_basura()`) y la página tampoco lo muestra. De los
  que tenían árbitros de Costa Rica eran 182, ninguno «de prueba». Los
  torneos de FIDE no se tocan: sin rondas ahí es que FIDE no publica el
  ronda a ronda, no que no se jugó.
- **«Contar: festivales como uno»** (pedido del dueño): los torneos que
  empiezan el mismo día son un festival (el Nacional por categorías, las
  eliminatorias de los JDE en varias categorías) y cuentan como uno. Es una
  opción, no lo de siempre: «Cada torneo» sigue siendo la cuenta por omisión.
  - En la ficha de un árbitro, sus torneos del mismo día se juntan en una
    fila «Festival de N torneos», con cada uno y sus enlaces, los cargos de
    todos y los jugadores sumados. Es de FIDE si lo es alguno.
  - Su norma es la mejor de sus torneos de FIDE (Vale, Una, Opción, Revisar,
    No, en ese orden), con el porqué de esa: FIDE da una norma por festival
    (B.06.1), así que contar cada torneo inflaría las normas.
  - En la lista general, la cuenta de abajo junta TODO lo que empieza el
    mismo día aunque cada árbitro haya estado en una parte distinta: la fecha
    es lo que define el festival. Es una aproximación aceptada: dos torneos
    ajenos que arrancan el mismo día cuentan como uno.
  - Lo revisa `verificar-arbitros-cr.js` (el 102 de FIDE y el 900006 de
    chess-results, el mismo día).

## Árbitros de Costa Rica en el extranjero

`arbitros-cr.html` suma los torneos que los árbitros de Costa Rica
arbitraron fuera del país (pedido del dueño, octubre de 2026: «agrega los
torneos que arbitraron en el extranjero»). Salen de chess-results, van en la
misma tabla (`arbitros_cr_cr`) con la federación del torneo en `pais`
(migración `20261015040916`; los de Costa Rica quedan con `CRC`) y la página
tiene el filtro «Dónde» (en todas partes, en Costa Rica, en el extranjero) y
la columna «En el extranjero».

- **FIDE no se pudo.** El camino natural era la pestaña «Arbiter» del perfil
  de cada árbitro (`a_profile_data.php?records=1&event=ID`), que lista todos
  sus torneos en cualquier país. El 15/10/2026 FIDE contestaba **200 con un
  solo carácter** (la marca de orden de bytes) al perfil, a esa pestaña y a
  la lista de torneos por país (`a_tournaments.php`), con o sin las cabeceras
  de un pedido AJAX y un `User-Agent` de navegador, mientras la ficha de un
  torneo (`tournament_information.phtml`) seguía contestando. Sin eso no hay
  cómo saber qué torneos de afuera valoró FIDE: los de afuera dicen «No
  consta» en la columna FIDE y no llevan norma. Si FIDE vuelve a contestar,
  los torneos de afuera de su perfil entran a `arbitros_cr_torneos` como los
  de Costa Rica, con su norma.
- **De dónde salen.** El buscador de chess-results tiene las casillas
  «Árbitro principal» (`txt_Hauptschiedsrichter`) y «Árbitro»
  (`txt_Schiedsrichter`, que mira también la de adjunto), y busca **texto
  contenido**, en todos los países (`combo_land=-`). Se buscó cada ID FIDE y
  cada primer apellido en las dos (`herramientas/arbitros-cr/buscar-afuera.sql`):
  600 búsquedas de a 80, sin que chess-results cortara. **El buscador
  distingue tildes** («Nunez» da 470 filas, «Núñez» 55): cada apellido se
  buscó también con las formas con tilde que aparecen en los torneos de Costa
  Rica, y los que llenaban las 2000 filas (Rodríguez, González, Mora, Vargas…)
  con «Apellido1 Apellido2» y «Nombre Apellido1». Un pedido que se mete a
  mano en `net.http_request_queue` **no sale hasta `net.wake()`**.
- **El colador, en la base.** Las respuestas traen 82 000 torneos (77 748 de
  otra federación): cualquiera que se apellide igual.
  `herramientas/arbitros-cr/afuera.sql` deja los que nombran a alguien de la
  lista por su ID o por su primer nombre y su primer apellido como palabras
  sueltas, por tramos de respuestas, y `juntar-afuera.py` los guarda en
  `herramientas/datos/arbitros-cr-chess-results-afuera.json` (4421). La
  consulta pasaba del minuto **con una sola página de 1,5 MB**: tenía una
  expresión regular por árbitro (166 distintas, y Postgres guarda compiladas
  pocas) y las CTE `celdas` y `t` sin `materialized`, que Postgres metía
  dentro del join y recalculaba por cada par fila × árbitro. Con `strpos`
  sobre el texto con espacios a los lados y las dos CTE materializadas, cada
  tramo tarda segundos.
- **Afuera hay homónimos** (`armar_chess_results()`): con las reglas de Costa
  Rica, «Juan López», «Luis Martínez» o «José Rodríguez» sumaban cientos de
  torneos en España, México y Perú. Afuera vale:
  - el **ID FIDE** con el primer apellido al lado, como siempre;
  - el nombre con **los dos apellidos**, con el segundo nombre solo si es el
    suyo («Juan Carlos López López» no es Juan Francisco López López);
  - «Nombre Apellido1» solo **en una federación cercana** (Centroamérica, el
    Caribe, Colombia y los eventos de FIDE y de la Confederación de Ajedrez de
    América, `CERCA`) y solo si **nunca aparece afuera con otro segundo
    nombre u otro segundo apellido** (`homonimos_afuera()`: «Juan López
    Ticona» delata que «Juan López» es de otra gente). En el texto se
    respetan los signos: «Isaac 3896536; Ochoa Rivera» no es «Isaac Rivera».
  Venezuela y México salieron de `CERCA` por un «Luis Calvo» y un «Carlos
  Salazar» que no eran.
- **Los sin federación** (en blanco en chess-results; pedido del dueño,
  octubre de 2026: «decidir dónde se jugaron»). El lugar venía vacío en los
  que tenían un árbitro de Costa Rica, así que no servía. Sirve **la
  federación de sus jugadores**: la lista de cada uno (`tnrCLAVE.aspx`) se
  contó a mano y quedó en `herramientas/datos/arbitros-cr-sin-federacion.json`
  (cuántos con federación y cuántos de CRC). Con el 80 % o más de CRC, el
  torneo se jugó acá y entra como de Costa Rica (con su cruce con FIDE: los
  tres eran el mismo torneo que uno de FIDE). Dos del Círculo Ponziani (10 de
  10, 8 de 8) y el «II Torneo por la Plata» (26 de 27) entraron; los tres de
  Valencia (0 de 46, 0 de 31, 0 de 62) no. `--afuera` carga todo lo que salió
  de la búsqueda en todos los países, también estos.
- **Lo que queda fuera.** Los sin federación que no son de Costa Rica, los que no se jugaron (sin rondas o jugadores, como en Costa
  Rica) y los torneos donde alguien de Costa Rica solo dirigió u organizó.
  Las federaciones que no son países salen dichas: `FID` es un evento de FIDE
  y `CCA`, de la Confederación de Ajedrez de América.
- **Comprobado contra la recopilación de Oscar Angulo:** de sus 23 torneos
  afuera, salen los 20 que se jugaron y ninguno de más (los otros 3 tienen 0
  rondas y 0 jugadores en chess-results).
- **La carga** (`python3 herramientas/arbitros-cr.py --afuera`, que escribe
  `carga-afuera-*.sql`) no borra nada: inserta los torneos desde las
  respuestas (`RESPUESTAS_AFUERA`, de a 40 respuestas por archivo: todas
  juntas pasan del minuto) y los cargos. La carga completa (`carga-*.sql`)
  necesita vivas las respuestas de Costa Rica y las de afuera: otra descarga
  cambia `RESPUESTAS_CR` y `RESPUESTAS_AFUERA`. Los de afuera no se cruzan
  con FIDE: los de FIDE que hay son todos de Costa Rica.
- **Lo que dio la carga (15/10/2026):** 212 torneos en el extranjero de 28
  árbitros (los que más, Carolina Muñoz Solís con 74, Neeshmy Núñez y
  Stanley Gómez Huertas con 23, Oscar Angulo con 20), en 23 federaciones
  (CCA 32, Colombia 30, Honduras 29, El Salvador 28, FID 25…), y 250 cargos.
  Las huellas de lo de afuera en la base (torneos y cargos con `pais <> 'CRC'`)
  dieron iguales a las del generador, y una cuenta sin la licencia ve 0
  filas.
- `verificar-arbitros-cr.js` suma un torneo en Panamá: el filtro «Dónde», la
  columna, «No consta» y el país en el lugar (lo rompí dejando todo «en Costa
  Rica» y salta).

## El resumen de normas de cada árbitro

La ficha de un árbitro en `arbitros-cr.html` abre con dos cuadros, uno para
AF y otro para AI: cuántas normas de torneo podría juntar **hoy** para la
solicitud del título (pedido del dueño, octubre de 2026). Lo arma
`cuentaNormas()` en `js/arbitros-cr.js` con lo que ya dice cada torneo
(`normaDe()`, su cargo incluido) y las reglas de la solicitud de B.06.1 que
se ven desde afuera:

- **Los últimos seis años**, contados desde hoy en hora de Costa Rica
  (`HoraCR.hoy()`). Lo que valía y es más viejo se cuenta aparte y se dice.
- **Una por grupo de fechas que se tocan**: un festival lo es, y también dos
  torneos que se solapan aunque no empiecen el mismo día. De cada grupo vale
  el mejor.
- **Topes**: todas las «Vale», una sola «Vale (una así)» (la de 5 o 6 rondas
  para AF, la de 7 u 8 para AI) y una sola «Vale una vez» (rápido o blitz,
  nacional por equipos, el internacional de 100). Las demás se cuentan como
  sobrantes. Las «Revisar» no se suman: se dice cuántas son.
- **AF pide 3 normas de al menos dos sistemas; AI pide 4 y va después del
  AF.** El cuadro dice «Ya tiene el título» (según el perfil de FIDE),
  «Primero el AF», «Le alcanzaría», «Le falta otro sistema» o «Le faltan N»,
  siempre escrito y con la lista de los torneos que cuenta.
- Lo que no se ve desde afuera va escrito debajo: el seminario, si los
  certificados se emitieron y quién los firmó, que no todas las de AI sean de
  la misma persona y el tope de dos finales nacionales.
- Los torneos del extranjero no entran: no se sabe si FIDE los valoró (ver
  «Árbitros de Costa Rica en el extranjero»).
- `verificar-arbitros-cr.js` lo prueba con Luis (sin título: 1 de 3), Ana (AF:
  ya lo tiene; para AI, 0 de 4 y una para revisar), Juan (su norma de 2015 ya
  no cuenta) y Óscar (IA). Lo rompí quitando el límite de seis años y salta.

## La puesta al día de cada mes

«Árbitros de Costa Rica» se pone al día una vez al mes con una tarea
programada de Claude (no con GitHub Actions: los datos van a la base, que
solo se escribe desde una sesión con acceso a Supabase, y la descarga se hace
con pg_net desde la base). La tarea sigue la habilidad
`.claude/skills/arbitros-cr-actualizar/SKILL.md`, paso a paso:

- **¿Volvió FIDE?** Prueba el perfil de un árbitro. Si contesta, lo avisa: los
  torneos del extranjero en FIDE (con su norma) se arman con el dueño, no
  solos en la pasada.
- **Lo nuevo de chess-results**: la búsqueda del año en Costa Rica
  (`buscar-cr.sql`, y el año anterior en enero y febrero), la búsqueda en
  todos los países (`buscar-afuera.sql`), las exportaciones (`exportar-cr.sql`,
  `afuera.sql`) y los juntadores (`juntar-afuera.py --cr` suma al JSON de
  Costa Rica; sin `--cr` reescribe el del extranjero).
- **La carga parcial** (`arbitros-cr.py --parcial AAAA --respuestas-cr D-H
  --respuestas-afuera D-H`): no borra nada; inserta o pone al día los torneos
  de esas búsquedas, suma sus cargos y vuelve a escribir su cruce con FIDE
  (soltando antes el que tuvieran, por el índice único). Después, la huella
  de lo cargado contra la del generador.
- **Probada el 15/10/2026**: la búsqueda de 2026 en Costa Rica (603 torneos;
  ninguno nuevo desde el día anterior, pero tres en juego habían sumado una
  ronda) y lo del extranjero; las huellas de los 769 torneos dieron iguales.
  La exportación nueva junta los espacios y deja algunas entidades
  (`&#10145;`) que la vieja no dejaba: al generador no le cambia nada (des-
  escapa el texto) y el texto que se muestra lo escribe la base desde las
  respuestas.
- Lo que no hace sola: sumar árbitros nuevos (hace falta su perfil de FIDE)
  ni borrar torneos que desaparecieron de chess-results.

## Quién está cerca del título, qué vence, la actividad y el equipo

Cuatro piezas más en `arbitros-cr.html` (pedido del dueño, octubre de 2026):

- **«Hoy para AF» y «Hoy para AI» en la lista**: el mismo conteo del cuadro
  de la ficha (`cuentaNormas()`), «1 de 3», o «Ya es AF» si su perfil de FIDE
  dice que tiene el título. Ordenables: al ordenar, quien ya lo tiene va
  arriba (vale 100) y después quien más junta. No dependen de los filtros de
  años ni de tipo: es lo que junta **hoy**. Se calcula una vez al cargar.
- **Hasta cuándo cuenta cada norma**: en el cuadro, cada torneo dice «cuenta
  hasta el DD/MM/AAAA» (seis años desde que empezó) y «vence pronto» si es
  en menos de un año; arriba se dice cuántas vencen así.
- **«Torneos por año»** en la lista (los torneos distintos de los árbitros
  que se ven, con los filtros) y en la ficha: una tabla con una barra del
  total por año y los números escritos al lado (FIDE, no FIDE, en el
  extranjero). La barra es `brand-500` sobre blanco (6,1:1) y `brand-300`
  sobre `brand-900` en modo oscuro (7,8:1); el número va siempre escrito.
- **«Equipo de Costa Rica»** en cada torneo de la ficha (si hay más de uno):
  quiénes de la lista estuvieron y con qué cargo, y cada nombre abre su
  ficha. Sale del mismo índice de torneos de cada árbitro (la clave `f<id>`
  o `c<clave>` es la misma para todos).
- `verificar-arbitros-cr.js` prueba las columnas, la tabla por año (en 2024,
  5 torneos: 2 de FIDE, 3 no, 1 en el extranjero), «cuenta hasta», y el
  equipo con su enlace. Lo rompí cambiando los seis años por siete, quitando
  el equipo y dejando la columna en 0, y salta cada vez.

## Las normas de AI, solo después del título de AF

Regla del dueño (octubre de 2026): **una norma de AI no sirve si se hizo
antes de tener el título de AF**. `antesDelAf()` en `js/arbitros-cr.js` la
aplica a la norma de AI de cada torneo, por persona, después de `normaDe()`:

- **Sin AF** (AN o sin título): ninguna norma de AI le cuenta, ni le
  servirá cuando saque el AF. El torneo dice «No» con lo que cumplía, y el
  cuadro de AI dice «Primero el AF… hoy no junta ninguna». Antes ese cuadro
  sumaba las de AI de todos modos («juntaría 2 de 4»): engañaba.
- **Con AF**: el perfil de FIDE da el año («Árbitro FIDE (2019)»), no el
  día. Un torneo de un año posterior cuenta y uno de un año anterior no. Uno
  del mismo año queda **para revisar**: no se sabe si empezó antes o
  después del Consejo que dio el título. Tampoco se cuenta en «Hoy para
  AI».
- Un AI sin el año del AF en su perfil (los títulos viejos, como el de
  1989) queda como estaba: ya tiene el título y no hay con qué comparar.
- Cambia «Valen para AI» y «Hoy para AI» en la lista, el ranking (por AF no
  cambia) y la comparación.
- `verificar-arbitros-cr.js` lo prueba con Óscar (AF en 2024): el torneo de
  2023 da «No», el de 2024 «Revisar» y el de 2025 «Vale». Con Luis y
  Eduardo, sin AF, ninguno cuenta. Lo rompí quitando la regla y saltan
  cinco comprobaciones.

## Lo que dice FIDE de cada árbitro

El dueño pidió tres cosas (octubre de 2026): la fecha del primer torneo, si
cada árbitro está activo o no, y **la fecha exacta en que se le aprobó el
AF**, porque desde ese día todo lo que arbitre cuenta como norma de AI y ya
no de AF.

- **La fecha del primer torneo** es una columna más en la lista («Primer
  torneo», ordenable) y va en la ficha («del … al …») y en la comparación.
  Sale de los torneos de los años elegidos, igual que «Último torneo».
- **El año de cada título** (pedido aparte, octubre de 2026): «AF desde»
  y «AI desde» en la lista (ordenables; quien no tiene el título queda al
  final en los dos sentidos) y en la comparación. Es el año que da su
  perfil de FIDE en `titulo_detalle` («Árbitro FIDE (2009), Árbitro
  Internacional (2015)»), el mismo que ya usa la regla de las normas cuando
  falta la fecha exacta (`anioTitulo()`). El de Árbitro Nacional no sale:
  ni el perfil ni la lista de FIDE lo traen.
- **Activo o inactivo**: de la **lista oficial de árbitros de la Comisión
  de Árbitros de FIDE**
  (`arbiters.fide.com/wp-content/uploads/Database/List_of_Arbiters.pdf`,
  530 páginas, con la fecha de publicación en la cabecera). Cada fila trae
  el ID, el nombre, la federación, el título (IA, FA, NA), la marca «i» de
  inactivo, la categoría y la licencia («IA-D», «No» = sin licencia).
  - En la página, la columna y el filtro «En FIDE» dicen «Activo»,
    «Inactivo» o «No figura»: quien no está en la lista no es árbitro de
    FIDE. La ficha dice además la licencia.
  - La lista también dice **NA** (Árbitro Nacional) de muchos a quienes el
    perfil de FIDE no les da título. Por eso la página les pone AN (antes
    salían como «Sin título en FIDE»).
  - El 16/10/2026, en la lista del 12/10/2026, había 148 de Costa Rica.
    Inactivos eran 3 (Luis Manuel Araya, IA y sin licencia; Gustavo Murillo
    Ortiz y Diego Redondo Vargas, FA). De los nuestros, 41 no figuran,
    casi todos los que solo están en chess-results.
- **Cómo se lee la lista**: FIDE no contesta desde el contenedor, y desde la
  base `net.http_get` corta el PDF en el primer byte nulo (llegaron 4475
  bytes de 530 páginas). Lo convierte a texto `https://r.jina.ai/<url>`,
  pedido con pg_net. Las filas de Costa Rica se sacan con
  `(\d{5,9}) ([^0-9\n]+?) CRC (IA|FA|NA) (i )?(?:([A-D]) )?([A-Z]{2}-[A-D]|No|NA)`:
  salieron 148 de las 148 veces que aparece « CRC ».
- **La fecha de la reunión del Consejo que aprobó el AF.** Ojo: la fecha
  OFICIAL no es esa sino la del perfil de FIDE, de seis días a seis semanas
  después (ver «La fecha oficial del título: la del perfil de FIDE»). El
  perfil que se lee desde afuera solo traía el año, y además está cerrado. La dicen los **informes de la Comisión de
  Árbitros a cada reunión del Consejo de FIDE**
  (`Reporting/AAAAQnCouncilARBReport.pdf`, uno por reunión desde 2023).
  - Cada informe trae las solicitudes de título en dos apéndices: «FA Title
    Applications…» e «IA Title Applications…». Cada solicitud va con su
    nombre, «CRC ID#…» y sus torneos.
  - **El veredicto va DESPUÉS de los torneos**, no antes. Se comprobó con
    las razones de los rechazos: el «dos torneos a la vez» es el de Pablo
    Bermúdez en 2023, y el «seminario muy viejo» es el de Neeshmy Núñez,
    con su seminario de 2017.
  - La fecha es la de la reunión, que va en la primera línea del informe
    («online, July 29th, 2024»). Si duró varios días, se toma el último.
- Desde 2023 se aprobaron, para Costa Rica:
  - **AF**:
    - Loria Martínez, 11-17/12/2023. Ojo: su perfil de FIDE dice 2024; se
      toma la reunión.
    - Murillo Tsijli y Zeledón Pérez, 29/07/2024.
    - Argüello Acuña, 05/09/2024.
    - Meza Vega y Neeshmy Núñez, 10/11/2024.
    - Quesada Arauz y Torres Braiz, 22/03/2025.
    - Francia Roa, 02/04/2026.
    - Pastor Carvajal, 23/08/2026.
  - **AI**:
    - Gómez Huertas, 04/04/2023.
    - Bermúdez Vives, 13/04/2024.
    - Cristian Araya Fuentes, 29/07/2024.
    - Joshebeth Núñez, 23/08/2026.
  - Lo de antes de 2023 no se buscó, y no hace falta: un torneo del año de
    un AF de 2022 o antes ya quedó fuera de los seis años que cuentan.
- **La regla en la página**:
  - Con la fecha exacta (`af_fecha`), un torneo cuenta para AI si empezó
    después de esa fecha (`antesDelAf`). Uno anterior no cuenta, y uno del
    mismo día queda para revisar.
  - Además, un torneo posterior al AF **ya no cuenta para AF**
    (`despuesDelAf`), porque ya tiene el título: lo dijo el dueño.
  - Sin la fecha exacta se sigue usando el año del perfil: el mismo año
    queda para revisar en AI y no cambia nada en AF.
  - El cuadro de AI dice «solo cuentan los torneos que empezaron después
    del …».
- **Dónde vive**: en `arbitros_cr_fide` (migración
  `20261016011935_arbitros_cr_fide.sql`), aparte de `arbitros_cr`, porque
  `herramientas/arbitros-cr.py` borra y vuelve a llenar esa.
  - La fuente es `herramientas/datos/arbitros-cr-lista-fide.json`: la lista
    y las aprobaciones, cada una con su informe.
  - El SQL lo arma `herramientas/arbitros-cr/lista-fide.py`.
  - La carga de 16 KB en un solo `execute_sql` se cortó a los 60 s, sin
    cargar nada. En tres tandas de 50 filas entra.
  - La huella de lo cargado (md5 de las filas) es igual en la base y en el
    JSON. Ojo: en `concat_ws`, un booleano se escribe `t`/`f`, no
    `true`/`false`.
- `verificar-arbitros-cr.js` lo prueba con tres casos:
  - Óscar, activo y con AF el 01/05/2024: para AI, lo de 2023 no cuenta, lo
    del mismo día queda para revisar y lo de 2025 vale; para AF, lo de 2025
    ya no cuenta.
  - Ana, inactiva y sin licencia, de quien solo se sabe el año del AF.
  - Luis, AN por la lista.

  Además prueba el filtro «En FIDE» y «Primer torneo». Lo rompí sin la
  fecha exacta, sin «ya no para AF» y sin la marca de inactivo, y salta
  cada vez.
- **Cada mes**, en la puesta al día (`arbitros-cr-actualizar`): bajar la
  lista otra vez y leer el informe de la última reunión del Consejo, por si
  hay títulos nuevos.

## Los torneos con Elo nacional

El dueño pidió (octubre de 2026) filtrar los torneos que se evaluaron
**únicamente con Elo nacional**: en chess-results lo dice la ficha de cada
torneo («Cálculo de elo»), y el Elo nacional solo se calcula para el clásico.
Es la opción «Solo con Elo nacional» del filtro «Tipo», y en la columna FIDE
de la ficha de un árbitro un torneo así dice «No (Elo nacional)», y uno que no
se evaluó con ningún Elo, «No (sin Elo)».

- **Lo que no se ve a la primera.** chess-results esconde la ficha de los
  torneos que terminaron hace más de dos semanas detrás de un botón («Mostrar
  detalles del torneo», contra los robots de búsqueda): un GET trae la página
  sin ficha y sin error. De 3238, el GET solo trajo la de 11. Hay que mandar el
  formulario de la página (`__VIEWSTATE`, `__EVENTVALIDATION` y
  `cb_alleDetails`), y **solo lo acepta el mismo servidor que la armó**: el pie
  dice «Node S1», «S2» o «S3», y el POST va a `s1.`, `s2.` o
  `s3.chess-results.com`. Mandados todos a `s1`, dos de cada tres volvieron con
  error 500, y reintentarlos no sirvió. A `s0` no se llega (su certificado no
  vale): se vuelve a pedir la página hasta que la arme otro servidor. Así se
  leyeron 3237 de 3238; el que faltaba (un rápido sin Elo) entró con la
  primera prueba de `herramientas/arbitros-cr/calculo-elo-leer.sql`, el script
  de esos pasos para la pasada de cada mes.
- **Lo que dicen las fichas** (los de Costa Rica que no son de FIDE, octubre de
  2026):
  - solo «Elo nacional»: 550 (153 clásicos, 372 sin el ritmo escrito, que son
    las fichas viejas, 18 blitz y 7 rápidos);
  - ningún Elo: 2194;
  - «Elo nacional, Elo internacional»: 317;
  - solo «Elo internacional»: 176.
- **La regla.** Solo «Elo nacional» y que no sea rápido ni blitz: los 25 rápidos
  o blitz marcados así están mal marcados (el nacional es solo del clásico).
- **El ritmo de los que no lo escriben** (las 372 fichas viejas) sale del texto
  de su control de tiempo, que sí está en `arbitros_cr_cr.control`
  (`js/ritmo-control.js`). Al principio contaban todas, y entre ellas había 59
  blitz y 17 rápidos («3 min + 2 seg», «BLITZ Equipo Infantil…»). La cuenta es
  la de FIDE: los minutos de cada jugador más 60 veces el incremento; 60 o más
  es clásico, más de 10 y menos de 60 rápido, 10 o menos blitz. El texto viene
  escrito de mil maneras («30 min + 30 s from move 1», «90min+30sec/mov»,
  «1:30 +30 sec», «2 horas para toda la partida», «cuatro minutos por
  jugador», «90+30 min», «40 min + 30 seg (reloj mecánico 1h + 10 min)»), y
  cuando no trae un tiempo («Pendiente», «.») mira el nombre («Blitz»,
  «Rápido»). Lo que dice la ficha manda: el texto solo se lee si la ficha no
  dice el ritmo. El único sin tiempo que leer («Pendiente», una eliminatoria de
  los JDN de 2018) no tiene rondas en chess-results y no se muestra. Con esto
  el filtro baja de 525 torneos a 449.
  - Se probó contra los 1731 torneos que sí dicen el ritmo: coincide en 1552. Casi
    todo lo demás es chess-results contra FIDE: «15 + 30» es rápido para FIDE
    (15 + 30 = 45 minutos) y muchas fichas lo marcan clásico; «10 min» es blitz
    para FIDE (10 o menos) y las fichas dicen rápido. Ninguno de esos llega al
    filtro: si la ficha dice el ritmo, se usa ese.
- **Lo que se mira a mano.** Comparando las fichas que sí dicen el ritmo con su
  control salió algo que la cuenta de FIDE no ve: con Elo nacional,
  chess-results marca **clásico** a la mayoría de los torneos de 40 a 59 minutos
  (36 de 52, casi todos «15 + 30», 45 minutos: rápido para FIDE). Con ficha,
  manda la ficha y no hay problema; sin ficha, la cuenta de FIDE los deja fuera
  y puede equivocarse. `herramientas/arbitros-cr/ritmos-raros.js` lista los que
  hay que mirar: la ficha que contradice al control (blitz o rápido con 60
  minutos o más, clásico con 20 o menos), los de 40 a 59 minutos sin ficha y
  los que no tienen tiempo que leer. Lo que se confirma va a
  `herramientas/datos/arbitros-cr-ritmo-corregir.json` con su motivo y
  `calculo-elo.py` lo carga encima de la ficha, como las fechas mal escritas
  van a `arbitros-cr-corregir.json`. La primera pasada (octubre de 2026) dio
  seis:
  - la del JDE 2025 «Individual Femenino» decía blitz con «30 + 30»: su página
    se llama «… (Blitz)», así que la ficha estaba bien y el control quedó
    copiado de los clásicos del día anterior (anotada);
  - el «Festival de Categorías Chile Monoloco 2020 – Cuarta» dice blitz con
    «30 + 30», pero son 7 rondas en un día y su «Abierta», con el mismo
    control, dice clásico;
  - tres eliminatorias de los JDN 2011 a «40 min finish» y los Paranacionales
    2014 a «45 min», sin ficha.
  El dueño las decidió las cinco como **clásico** (18/10/2026): con Elo
  nacional, que la Federación calcula solo en clásico, el torneo se jugó como
  clásico aunque el reloj diga menos. Con ellas el filtro queda en 454 torneos.
- **Cuántos tiene cada árbitro.** La lista lleva la columna «Elo nacional» (con
  los filtros de años, tipo y lugar, como las demás; un festival cuenta si
  alguno de sus torneos fue así) y la ficha y su PDF lo dicen en el resumen
  («…, 12 de ellos con solo Elo nacional»). El ranking del año también lo trae:
  su columna y «Ordenar por: Torneos con solo Elo nacional», y su Excel. La ficha
  tiene su propio «Torneos» (el mismo filtro que el de arriba: cambiar uno
  cambia el otro), y el Excel y el PDF de la ficha salen con lo elegido. La
  lista entera se baja en Excel («Descargar la lista en Excel»: las mismas
  columnas, con los filtros y el orden elegidos, y una hoja con los filtros).
- **Dónde va.** `arbitros_cr_cr_elo` (clave, calculo, ritmo, leido; migraciones
  `20261017224002` y `20261017224637`), aparte de `arbitros_cr_cr`, porque la
  carga completa de esa tabla la borra y la vuelve a llenar. Solo la lee quien
  tiene la herramienta. El dato queda en
  `herramientas/datos/arbitros-cr-calculo-elo.json`, sacado de la base y no
  copiado a mano (la huella dio igual), y
  `herramientas/arbitros-cr/calculo-elo.py` lo vuelve a cargar.
- **Antes se probó la plataforma de la Federación** (`ajedrezcostarica.com`):
  tiene «Tipo de elo» por torneo, pero solo de los torneos publicados ahí (unos
  550, de los últimos años) y el dato viene escondido en el JavaScript de la
  página. chess-results cubre todos los años.
- `verificar-arbitros-cr.js`: el del club (solo nacional, sin el ritmo escrito y
  con un control de 60 minutos) entra; el Sub-16 (nacional, sin el ritmo escrito
  y con 15 min + 10 seg, rápido), el que no se leyó y el de Panamá no. La
  columna «Elo nacional» de cada uno, y veinte controles de verdad con el ritmo
  que les toca. Rompí a propósito la regla del ritmo (quitándola, exigiendo
  «clásico», sin leer el control), la columna y el lector de «1:30», y salta.

## Por vencer: lo que deja de servir para el título

Las normas de un árbitro cuentan seis años desde que empezó el torneo (B.06.1
5.3.1) y el seminario vale cuatro (5.3.2). La ficha ya decía hasta cuándo
cuenta cada norma, pero había que abrir la ficha de cada uno para verlo. La
sección «Por vencer» de la lista junta, de todos los que se ven con los
filtros, lo que alguien junta para su siguiente título (AF si no lo tiene, AI
si es FA) y deja de servir en los próximos doce meses, lo que vence antes
primero:

- una norma de las que cuentan hoy (las mismas de «Hoy para AF/AI»), con cuántas
  le quedan si esa se pierde; si con ella le alcanzaría o le falta una, lo dice:
  la solicitud tiene que llegar antes;
- el seminario vigente, solo si ya junta alguna norma (sin normas, el seminario
  no apura nada); sin seminario no puede mandar la solicitud. Cuando el informe
  de la Comisión da solo el mes, vale hasta que se termina ese mes.

Un aviso por correo no se hizo: la herramienta no guarda el correo de los
árbitros (solo el de quien tiene la licencia) y la sección se ve en la misma
página que ya se usa. `verificar-arbitros-cr.js` la mira hoy (vacía: la norma
de prueba cuenta hasta 2029) y con el reloj en julio de 2028 (la norma y el
seminario de Luis, en orden).

## La categoría nacional: la lista de la Federación

La lista oficial de FIDE dice si alguien es NA, pero no su categoría nacional.
La Federación Costarricense de Ajedrez la publica en
`fcacostarica.com/lista-de-arbitros/`, una tabla con el FIDE ID, el nombre, la
federación, el título, la categoría y la licencia. La categoría de un NA viene
como «NAA», «NAB» o «NAC» (A, B o C); la de un FA o IA es la de FIDE (D, o A
para Carolina Muñoz). El dueño la pasó en octubre de 2026.

- **Cómo se lee.** Desde el contenedor la página no contesta (el proxy la
  rechaza); desde la base con `net.http_get` sí. La tabla se parte por
  `</tr>` y `</td>` (con `regexp_matches` y `.*?` Postgres se vuelve codicioso y
  junta todas las filas en una), se limpia con `btrim(..., E' \t\r\n')` (el
  `trim` común no quita tabuladores) y se guarda tal cual en
  `herramientas/datos/arbitros-cr-lista-fca.json`, sacada de la respuesta y
  nunca copiada a mano.
- **Dónde va.** `arbitros_cr_fide.categoria_nacional` (A, B o C, con su
  `check`) y `fca_leida` (migración `20261016033536`). La carga la arma
  `herramientas/arbitros-cr/lista-fide.py`, al final, y falla si alguien de la
  Federación no está en la lista de FIDE. La huella de la base (md5 de
  `fide_id|categoría`) dio igual a la del JSON: 95 NA (20 A, 5 B y 70 C).
- **Cómo se ve.** «AN-B» en la columna Título y «Árbitro Nacional (AN),
  categoría B» en la ficha, la comparación y los PDF. La ficha dice además de
  dónde sale y qué día se leyó. El filtro de título tiene una opción por
  categoría, y «Árbitro Nacional (AN)» sigue juntándolas a todas.
- **Solo para quien hoy es AN en FIDE.** La lista de la Federación está atrasada:
  todavía da como NA a Jeigoth Pastor, Víctor Francia, Sandra Torres y Jean
  Carlo Quesada, que FIDE ya tiene como FA, y como FA a Joshebeth Núñez, ya IA.
  Manda la lista de FIDE; la categoría nacional se muestra solo si FIDE también
  lo tiene como NA.
- **Doce que no salen.** La Federación nombra a 12 NA que no arbitraron ningún
  torneo en lo que se leyó de FIDE y de chess-results (Edwin Vega, por ejemplo,
  sale como director, y eso no cuenta): la lista de la herramienta muestra solo
  a quien arbitró algo. Sí salen en «La lista de la Federación» (abajo), con el
  nombre de la lista de FIDE.
- **La lista de la Federación contra quién arbitra** (octubre de 2026). Para
  eso hace falta saber quién está en la lista, no solo la categoría de los AN:
  `fca_leida` se le pone a los 118 que figuran (también a los FA e IA, con
  `categoria_nacional` nula; migración `20261018163850`, que solo cambia el
  comentario de la columna). Están en la lista quienes tienen la `fca_leida` más
  nueva: quien salió de ella se queda con la fecha vieja. La sección dice, sin
  los filtros de arriba y contando solo los torneos en Costa Rica como
  principal, adjunto o árbitro:
  - quién está en la lista y no arbitró en los últimos tres años (con los que
    nunca arbitraron);
  - quién arbitró 3 o más torneos en los últimos dos años sin estar en ella.
  Que alguien no figure como árbitro en chess-results no prueba que no haya
  arbitrado: el organizador puede no haberlo anotado. La página lo dice.
- **Lo que le falta a un AN para subir de categoría**: ver «Para subir de
  categoría», abajo. En `fcacostarica.com` el reglamento no está; lo pasó el
  dueño.

## Para subir de categoría

El dueño pasó en octubre de 2026 el **Reglamento para Árbitros de la Federación
Costarricense de Ajedrez** (el PDF inscrito en el Registro de Personas
Jurídicas el 17/06/2025, documento 2025-331526-1). El nombre de la Federación
es ese: la herramienta decía «Federación Central de Ajedrez» y se corrigió, y
también los Programas de Estudio (`herramientas/programas-estudio/datos/`, 1.°
a 11.°: se regeneraron los ocho Word que lo nombran y el .zip). El nombre viejo
queda solo donde es un dato ajeno: las migraciones ya aplicadas y los nombres
de torneos de chess-results.

Lo que pide, en lo que toca a la herramienta:

- **Las categorías** (art. 5): C, B y A son de la Federación; AF e IA, de FIDE.
  Solo a la A le tramita el AF (art. 7).
- **Para subir de C a B (art. 12) o de B a A (art. 14)**:
  - un año con la categoría que tiene;
  - un curso intermedio de 20 horas aprobado con 80 %, de menos de un año
    (para la A, otro distinto del de la B y además uno de un programa de pareo
    avalado por FIDE de 10 horas);
  - **dos normas** posteriores a la categoría, firmadas por un árbitro con
    licencia FIDE, en torneos de al menos 7 rondas, válidos para Elo nacional o
    internacional y de modalidades o sistemas distintos.
- **Una norma vale tres años** (art. 18) y la da el principal del torneo.
- **Lo que puede hacer cada una**: la C es principal o adjunta solo en torneos
  de Elo nacional, de cuarta o tercera división y hasta 30 jugadores (art. 11);
  la B, hasta segunda división y 50 (art. 13); la A, todo, campeonatos
  nacionales incluidos (art. 15).

Cómo lo lleva la herramienta (`subirCategoria()` en `js/arbitros-cr.js`):

- **En la ficha de un AN**, la tarjeta «Para subir de categoría». Cuenta como
  posible norma un torneo de los últimos tres años, de 7 rondas o más, de FIDE
  o con «Cálculo de elo» nacional o internacional, en que fue adjunto o árbitro
  (no el principal). Firma el principal si es de la lista y FIDE lo tiene
  activo; si el principal no es de la lista, si es él mismo o si está
  inactivo, el torneo queda «para revisar». Dos normas sirven si la modalidad
  (el ritmo: el de FIDE, el de la ficha de chess-results o el deducido del
  control) o el sistema (solo el de FIDE: chess-results no lo da) son
  distintos. Lo que no se ve —la fecha de la categoría, el año con ella, los
  cursos y el informe escrito— lo dice como «Revisar».
- **La A** dice que ya puede pedir el AF por la Federación; **un AN sin
  categoría** en la lista, que no se sabe.
- **«Más de lo que deja su categoría»**: desde el 17/06/2025 (cuándo lo aprobó
  la Asamblea no se sabe; esa es la fecha del Registro), los torneos en Costa
  Rica en que una C o B fue principal o adjunta y el torneo era de FIDE, tenía
  Elo internacional o pasaba de 30 o 50 jugadores. La división de los
  jugadores no se ve: no se mira.
- **En la lista**, «Quiénes pueden subir de categoría»: los AN C o B con algo
  para mirar, el más cerca primero.
- `verificar-arbitros-cr.js` lo prueba con el reloj en diciembre de 2025: Luis
  (B) sin normas, después con un blitz y un clásico firmados por Óscar (y uno
  de 5 rondas que no cuenta), y dos torneos más allá de la B.

## La categoría y los cursos de cada árbitro

Lo que el reglamento pide y desde afuera no se ve (octubre de 2026, «Hacer
todas»): desde cuándo tiene alguien su categoría y qué cursos llevó. Va en
`arbitros_cr_formacion` (migración `20261018194338`): una fila por categoría
(C, B o A, con la fecha en que se la dieron; un índice único no deja dos de la
misma) o por curso (básico, intermedio, de programa de pareo o de
actualización, con la fecha en que terminó, las horas y la nota en %).

- **Quién la escribe.** Solo administración: es el registro oficial y nadie
  con la licencia puede darse un curso. La leen quienes tienen la herramienta.
  Comprobado en SQL: como `authenticated` sin ser admin, el `insert` choca con
  la RLS; `anon` no tiene permiso ni para leer. No va en la bitácora de
  auditoría: no reparte permisos, accesos ni dinero del sitio.
- **En la ficha**, «Categoría y cursos en la Federación»: lo registrado, el
  más nuevo primero, y para quien administra el formulario (con «Categoría»
  pide la letra; con un curso, las horas y la nota) y «Quitar», que pide
  confirmar.
- **Con eso, «Para subir de categoría»** deja de pedir revisar lo que ya
  sabe:
  - las normas cuentan solo después de la fecha de la categoría;
  - el año con la categoría dice «Cumple» o hasta cuándo «Falta»;
  - los cursos suman las horas de los aprobados con 80 % o más de menos de un
    año (sin la nota anotada cuentan, pero quedan para revisar). Para la A, el
    intermedio tiene que ser posterior a la B: es la forma de saber que es
    «distinto del de la B» (art. 14, b).
  - Si el árbitro no tiene nada registrado, sigue diciendo «Revisar», no
    «Falta»: que no esté anotado no quiere decir que no lo tenga.
  - Cuando todo lo que se ve se cumple, dice «Puede pedirla». El informe
    escrito de cada norma (art. 18) sigue como «Revisar», pero no lo frena.
- **La actividad del art. 19** («Activo (curso)», «Activo (torneo)» o «Sin
  actividad»): activo con 20 horas de cursos de actualización en dos años, o
  con un torneo en Costa Rica válido para Elo arbitrado en dos años (el
  artículo dice que arbitrarlo lo vuelve a activar). Sale en la ficha, en el
  filtro «Federación» de la lista y en el Excel.

## El filtro «Federación», el Excel y la norma para firmar

- **El filtro «Federación»** de la lista: activos o sin actividad (art. 19) y
  «Más de lo que deja su categoría». Van como filtro y como columnas del
  Excel, no como columnas de la tabla: con sus 19, la tabla ya cabe justa en
  una portátil.
- **«Quiénes pueden subir de categoría» en Excel**, con lo que pide cada uno.
- **«Norma (PDF)»** en cada torneo que podría ser norma: el informe escrito
  favorable del art. 18, con el aspirante, el torneo y el principal ya
  puestos, y el lugar para la firma, la fecha y si el desempeño fue
  satisfactorio. El Apéndice A del reglamento, que debía traer el formato,
  está en blanco en el PDF inscrito: este es uno propuesto, y el documento lo
  dice.

## La categoría sugerida

Pedido del dueño (octubre de 2026): «sugerir qué categoría nacional debería
tener cada árbitro». `categoriaSugerida()` en `js/arbitros-cr.js` la saca de sus
torneos con las reglas del reglamento:

- **Por sus normas** (arts. 12 y 14):
  - un par de torneos que podrían ser norma, de modalidad o sistema
    distintos, respalda la B;
  - otro par, que empieza al menos un año después de completar el primero,
    respalda la A (el año con la B).
  - Se cuenta **toda su historia en Costa Rica**, no solo los tres años que
    dura una norma: se mide lo que ya hizo, no lo que puede presentar hoy (eso
    es «Para subir de categoría»).
  - Torneo que podría ser norma: el mismo de «Para subir de categoría» (7
    rondas o más, válido para Elo, de adjunto o árbitro, con un principal de la
    lista activo en FIDE que no sea él).
- **Por lo que ya hace** (arts. 11, 13 y 15):
  - ser principal o adjunto en un torneo de FIDE, con Elo internacional o de
    más de 50 jugadores es trabajo de A;
  - en uno solo de Elo nacional de 31 a 50 jugadores, de B.
  - No sube la sugerencia: hacer el trabajo no da la categoría. Se muestra al
    lado, para que la Comisión vea quién arbitra por encima de lo que tiene.
- **Nunca baja**: el reglamento no quita categorías. Si sus torneos no
  respaldan la que tiene, lo dice y la deja.
- **Un AF o un AI va en la A** (solo a la A le tramita la Federación el AF,
  art. 7). La lista de la Federación de octubre de 2026 le da la C a Víctor
  Francia, que es AF desde mayo de 2026: sale como «A».
- **Los cursos no se ven**: la sugerencia los supone y la página lo dice.

Dónde sale:
- en la lista, «Categoría sugerida», solo los que no coinciden: primero a
  quien le toca otra categoría y después a quien arbitra por encima;
- en Excel, todos los que tienen título;
- en la ficha, una línea en «Para subir de categoría»;
- en el informe para la Junta.

`verificar-arbitros-cr.js` lo prueba:
- Juan (AN sin categoría): C;
- Luis (B), con los torneos de la prueba: no baja aunque nada lo respalde,
  pero ya fue adjunto en uno de FIDE;
- con un par de normas en 2025 y otro un año después: A;
- Ana (AF con la C en la lista): A.

## La lista pública de árbitros

`arbitros.html` (octubre de 2026): la lista de árbitros de la Federación, gratis
y sin cuenta, para que organizadores y clubes vean a quién pueden contratar.

- **De dónde sale.** De `arbitros_cr_publico()` (migración `20261018202246`),
  una función `SECURITY DEFINER` con execute para `anon` a propósito, como
  `cifras_academia()`. La página la llama con `fetch` y la clave pública, sin
  cargar el cliente de Supabase (`js/arbitros-publico.js`).
- **Qué devuelve, y solo eso.** Para cada uno de la lista de la Federación
  (la `fca_leida` más nueva):
  - nombre, título de FIDE, categoría nacional y si FIDE lo tiene activo;
  - la fecha de su último torneo en Costa Rica válido para Elo como
    principal, adjunto o árbitro.

  Todo eso ya es público (las listas de la Federación y de FIDE y
  chess-results). De los cursos, que no lo son, sale solo un sí o un no: si
  tiene las 20 horas de actualización de los dos últimos años, sin horas,
  notas ni fechas. Las tablas siguen cerradas a quien no tiene la licencia.
- **No dice «sin actividad».** En la herramienta con licencia sí: allá lo lee
  la Comisión. En público sería injusto mientras el registro de cursos esté
  vacío (65 de los 118 arbitraron en los últimos dos años). Muestra la fecha
  del último torneo y «No consta» en el curso, y aclara qué quiere decir.
- **«Buscar árbitro para un torneo».** Con el Elo del torneo, la división de
  los jugadores y cuántos son, dice qué categoría pide el reglamento como
  principal o adjunto y deja solo a quien la tiene:
  - desde la C, solo Elo nacional, cuarta o tercera división y hasta 30
    jugadores (art. 11);
  - la B, hasta segunda y 50 (art. 13);
  - la A, el AF o el AI, para primera división, un campeonato nacional, más de
    50 o Elo FIDE (art. 15). En un torneo de FIDE tiene que estar activo en
    FIDE.
  - Un torneo sin Elo no lo regula el reglamento: cualquiera.

  Siempre recuerda que cualquier categoría puede trabajar como árbitro bajo la
  supervisión de uno con licencia FIDE. Primero va quien arbitró hace poco, y
  la casilla (marcada al entrar) deja fuera a quien no arbitró en dos años.
- Está en la vitrina de herramientas como gratis (`js/herramientas-arbitraje.js`,
  `id: "arbitros"`).
- `verificar-arbitros-publico.js` la prueba con la llamada contestada por una
  lista falsa y el reloj fijo: el orden, cada regla de categoría, la casilla,
  el buscador, el error de la base y los 400 px.

### La ficha pública de cada árbitro, con su QR

Pedido del dueño en octubre de 2026. En `arbitros.html`, el nombre de cada
árbitro abre su ficha. Antes enlazaba al perfil de FIDE, que ahora va
dentro de la ficha.

- **Lleva solo lo público**, lo mismo que la lista y salido de
  `arbitros_cr_publico()`: ID FIDE, título, categoría nacional, si FIDE lo
  tiene activo, el último torneo en Costa Rica (y si fue hace más de dos
  años) y el curso de actualización. Agrega «Puede arbitrar», lo que
  permite su categoría según el reglamento (arts. 11, 13 y 15); a un AF o
  AI, también si puede en torneos de FIDE (activo). No suma nada de las
  tablas con licencia.
- **El número de la dirección abre la ficha** (`arbitros.html#ID FIDE`).
  El QR y «Copiar el enlace» llevan a esa dirección, así que un
  organizador la abre desde el celular. «Volver a la lista» saca el número
  de la dirección y devuelve el foco al nombre.
- **El QR sale de `js/qr-svg.js`**, que antes estaba copiado dentro de
  `js/certificado.js`; el certificado ahora también lo usa (una sola copia).
  `js/clase-qr.js` sigue con el suyo porque pinta la tarjeta del proyector
  con otro margen y otro tamaño.
- `verificar-arbitros-publico.js` lo prueba:
  - los datos y «Puede arbitrar» de un AF inactivo y de una C;
  - que el QR leído de vuelta lleva a la ficha;
  - copiar el enlace, cerrar la ficha, abrir directo con `#3` y que quepa
    a 400 px.

  Se rompió codificando otro texto en el QR, y salta.

## Las novedades y el arbitraje en números

Dos secciones más en la lista de `arbitros-cr.html` (octubre de 2026), sin los
filtros de arriba.

- **«Novedades de los últimos 12 meses»** (`novedades()`):
  - los títulos de FIDE, con la fecha del perfil o la del Consejo;
  - quién junta las normas de torneo para pedir su siguiente título (la
    fecha de la norma que completa las 3 o las 4);
  - quién completa el par de normas que respalda la B o la A, si no la tiene;
  - el primer torneo como árbitro en Costa Rica de alguien nuevo.

  El informe para la Junta trae las del cuatrimestre.
- **«El arbitraje del país en números»** (`numeros()`):
  - hoy, los de la lista de la Federación por título y categoría y cuántos
    están activos (art. 19);
  - año por año, en Costa Rica y como principal, adjunto o árbitro:
    - cuántos arbitraron, cuántos por primera vez y para cuántos fue su
      último año hasta hoy (en los años recientes baja a medida que vuelven);
    - los torneos y cuántos hizo cada uno en promedio;
    - qué parte del trabajo hizo el 20 % que más arbitró;
    - los títulos de FIDE del año, del año que dice el perfil; también salen
      los años con un título y sin torneos.

  Va en Excel y, los últimos cinco años, en el informe para la Junta.
- En `verificar-arbitros-cr.js`:
  - una novedad de hace 11 meses sale y una de hace 13 no;
  - la tabla de años, con dos árbitros en 2024, mide la concentración (rota
    al 60 %, salta).

## La carga desde un Excel

Para que `arbitros_cr_formacion` no quede vacía (octubre de 2026): en la lista de
`arbitros-cr.html`, solo para quien administra, «Cargar categorías, cursos y
correos desde un Excel» (`leerRegistro()` en `js/arbitros-cr.js`, el .xlsx lo
abre `js/reporte-excel.js`, el mismo lector de Pareo Integral).

- **Las columnas, como vengan.** Se buscan por su título en cualquier orden:
  ID FIDE o Nombre, Qué, Categoría, Fecha, Horas, Nota, Detalle, Correo,
  Autorizó y Avisos. La plantilla se baja de la misma sección.
- **El árbitro, por su ID FIDE o por su nombre.** El nombre cuenta si tiene las
  mismas palabras en cualquier orden («Luis Rojas Prueba» es «Rojas Prueba,
  Luis»). Si dos calzan, no se adivina: pide el ID.
- **Antes de registrar, fila por fila**, qué entra y por qué no entra lo otro:
  - un ID que no está en la lista de FIDE o un nombre que no se reconoce;
  - una categoría que no es A, B o C, o que ya estaba registrada;
  - un curso sin horas o con una nota fuera de 0 a 100;
  - un correo sin la columna «Autorizó».
- **Registrar** guarda una por una lo que entra y deja escrito qué se registró
  y qué no.
- `verificar-arbitros-cr.js` sube un CSV de nueve filas y mira el motivo de cada
  una que no entra.

## El aviso por correo de lo que se vence

A cada árbitro con correo registrado le llega, el día 1 de cada mes a las 8:07
de Costa Rica, lo que se le vence en los próximos 90 días (migración
`20261018205712`, Edge Function `arbitros-avisos`, tarea `avisos-arbitros`):

- una norma de FIDE que deja de contar para su siguiente título (seis años): de
  AF si no lo tiene, de AI si es AF, solo las posteriores a su AF;
- el seminario de FIDE que deja de valer (cuatro años), si tiene alguna norma;
- su actividad en la Federación (art. 19): dos años desde su último torneo en
  Costa Rica válido para Elo o su último curso de actualización.

Cómo funciona:

- **Lo calcula la base**, en `arbitros_cr_por_vencer(p_dias)`. Las normas salen
  de los estados de AF y AI que ya trae cada torneo. Solo la llaman quien
  administra y la service role: comprobado en SQL, a otra cuenta la rechaza.
- **El correo y la autorización**, en `arbitros_cr_contacto`: los ve y escribe
  solo administración, que los registra en la ficha («Correo para los avisos»)
  o desde el Excel. Cómo autorizó es obligatorio. La política de privacidad lo
  dice (versión del 18/10/2026).
- **Cada cosa se avisa una vez**: lo mandado queda en
  `arbitros_cr_avisos_enviados` (clave primaria `fide_id, clave`), que se lee
  pero no se escribe desde la web.
- **La función** sigue el patrón de `alerta-base`:
  - exige el secreto `tanda_arbitros_secreto` de la bóveda antes de leer
    nada;
  - no lee el cuerpo del pedido;
  - le escribe a cada uno lo suyo en un correo, con `reply_to` a
    info@ajedrez-integral.com;
  - anota lo avisado solo si Resend lo aceptó.
- **Para dejar de recibirlos** se responde el correo y administración apaga
  «Mandarle los avisos». No hay enlace de baja: son pocos árbitros y el registro
  lo lleva una persona.
- **En la página**, «Avisos por correo» (solo administración): lo que se vence
  en 90 días y qué pasa con cada uno: sale el día 1, no sale (sin correo o
  avisos apagados) o ya se avisó.
- **Probado** en la base: sin el secreto contesta 401; con el disparador,
  «0 enviados» (todavía no hay correos registrados).
- `verificar-arbitros-avisos.js` revisa sin red:
  - el correo: escapa lo de la base, fechas en palabras y en orden, el
    asunto, cómo dejar de recibirlos;
  - la función: el secreto primero, salta lo avisado y a quien no tiene
    correo;
  - la migración: los permisos, el secreto y la tarea.

  `verificar-arbitros-cr.js` revisa la página: lo que ve administración y lo
  que no ve nadie más.

## El informe cuatrimestral para la Junta Directiva

El art. 3 le pide a la Comisión Técnica de Arbitraje un informe cuatrimestral a
la Junta Directiva a más tardar el 15 de mayo, de setiembre y de enero. La
lista lo arma en PDF para el cuatrimestre que se elija (de enero a abril, de
mayo a agosto o de setiembre a diciembre, desde 2025; arranca en el último que
ya terminó, que es el que toca entregar), sin los filtros de arriba:

- los torneos en Costa Rica del cuatrimestre con algún árbitro de la lista,
  con su Elo, rondas y principal;
- quién arbitró y cuántas veces de principal;
- la actividad del art. 19 de los de la lista de la Federación, con los que
  están sin actividad;
- quiénes pueden subir de categoría;
- quién arbitró más de lo que deja su categoría en el cuatrimestre;
- la lista de la Federación contra quién arbitra;
- lo que vence en los próximos 12 meses.

`verificar-arbitros-cr.js` lo baja con el reloj en diciembre de 2025 (arranca en
mayo a agosto) y mira que estén los torneos de esos meses y no los de otros.

## La fecha oficial del título: la del perfil de FIDE

Pregunta del dueño (octubre de 2026), con una captura de un perfil de FIDE:
«FIDE Arbiter (2024) · License level: FIDE Arbiter Category D (2024-12-15) ·
Licensed: YES (2025-01-13)». ¿Desde qué fecha cuenta una norma de AI: la del
Consejo que aprobó el AF, la del perfil o la de la licencia? Se estudiaron
las **2563 solicitudes** (1951 de AF y 612 de AI) de los 14 informes de la
Comisión de Árbitros de 2023 a 2026, de todos los países.

- **No es la del Consejo.** En la misma reunión (Bakú, 1 y 2 de agosto de
  2023), FIDE trató distinto a tres árbitros:
  - al iraní 22535659 le **rechazó** como «before FA» el «17 Avicenna Open
    Cup A», del 24 al 31 de agosto, 22 días **después** del Consejo;
  - al polaco 1185250 le **aceptó** una norma del 19 de agosto;
  - al malasio 7102380, una del 27 de agosto.

  Cada uno tiene su fecha.
- **Es la que FIDE anota en su base, la del perfil.** En octubre de 2025
  rechazó una norma de AF con «Signee became FA (13/08/2025) after the
  tournament»: a ese árbitro lo había aprobado el Consejo del 18 y 19 de
  julio de 2025, y FIDE usó una fecha 25 días posterior. Con el NA hace lo
  mismo: «two norms before NA – 12 August 2024».
  - La captura era de **José Antonio Meza Vega**: Consejo del 10/11/2024 y
    perfil del 15/12/2024, 35 días después. Es la primera fecha de perfil
    cargada (`"perfil"` en su aprobación).
  - La pregunta era si le sirve para AI el XLV Metropolitano B 2024 (del
    26 al 30/12/2024). Sí:
    - empezó después del 15/12, y fue árbitro;
    - es un gran internacional (4.9.1, una vez por solicitud), con 152
      jugadores con Elo, 8 federaciones y 9 rondas;
    - el principal era IA y no era él;
    - el mismo torneo se lo aprobaron para AI a Joshebeth Núñez el
      23/08/2026.

    Ojo: esa semana arbitró también el A, el Sub-14 y el Blitz, en las
    mismas fechas, y solo puede usar uno (2.10).
  - **Los otros nueve** (capturas del dueño, octubre de 2026), los FA a
    los que les faltaba: Loría (Consejo 17/12/2023, perfil 05/01/2024),
    Zeledón (29/07/2024 → 16/08/2024), Murillo Tsijli (29/07/2024 →
    07/09/2024), Argüello (05/09/2024 → 19/09/2024; el perfil dice «95th
    2024 FIDE Congress», que es la misma reunión de Budapest), Neeshmy Núñez
    (10/11/2024 → 18/11/2024), Quesada (22/03/2025 → 02/05/2025), Torres
    (22/03/2025 → 03/05/2025), Francia (02/04/2026 → 03/05/2026) y Pastor
    (23/08/2026 → 29/08/2026). Con eso, todos los FA con Consejo conocido
    tienen su fecha oficial. Lo que cambió: el Campeonato Nacional Femenino
    2024 (02/02/2024) de Loría, como principal, pasó de «revisar» a valer
    para AI; de los demás, los torneos de esos días no tenían norma de AI.
  - El desfase va de **seis días a seis semanas** (Pastor, 6; Torres, 42):
    los 60 días de «revisar» alcanzan.
  - **Al subir de título, el perfil pierde las fechas del anterior.** El de
    Stanley Gómez Huertas (captura del dueño, octubre de 2026) ya solo dice
    «FIDE Arbiter (2019)» (Presidential Board del 7 y 8/9/2019, en Budapest)
    y las fechas del AI: Consejo del 04/04/2023, «License level» del
    25/04/2023 (`ia_perfil`) y «Licensed» del 01/05/2023. Por eso la fecha
    del perfil de cada AF conviene copiarla antes de que suba a AI. Su norma
    de AI más vieja, el PanAm Escolar de Medellín (del 12 al 17/11/2019),
    es de 66 días después del Board: con el desfase de siempre, ya era AF.
- **Las solicitudes de AI de todos los países, guardadas** (octubre de
  2026): `herramientas/arbitros-cr/solicitudes-ia.py` las saca de 29
  informes a `herramientas/datos/fide-solicitudes-ia.json`: los del
  Presidential Board de 2019 (`2019Q1PBARBReport.pdf` a `2019Q3`), el del
  Congreso de Abu Dabi de febrero de 2020 (`2020Q1EBARBReport.pdf`) y los
  del Consejo de 2020Q2 a 2026Q3. El de 2023Q4 y el del Board de 2019Q4
  no existen, el de 2020Q4 no trae solicitudes de título, y de antes de
  2019 no hay informes con ese formato (los de 2016 a 2018 son actas,
  anexos en fide.com, sin los torneos de cada solicitud). Son 1066
  solicitudes y 165 rechazos (612 y 80 desde 2023). Para saber si alguien
  mandó una norma entre su «License level» y su «Licensed» solo sirven los
  que tuvieron un rechazo y ninguna aprobación (`siguen_af`, 46): al
  aprobarle el AI a alguien, su perfil borra las fechas del AF.
  - En los 65 rechazos de 2020 a 2022 tampoco hay ninguno por la licencia.
    Los tres «before FA title» (Idiazabal, ESP, 2022Q2; Kikvidze, GEO, y
    Avramidou, GRE, 2022Q3) son de torneos de uno a tres años antes del AF.
- **Normas entre el «License level» y el «Licensed»: FIDE las cuenta.**
  De los 39 de `siguen_af` se leyeron 35 perfiles en el Chrome del dueño
  (`herramientas/datos/fide-perfiles-siguen-af.json`, #956 y #960). FIDE
  no encuentra 3406369 ni 12600504, y devuelve vacíos 9963642 y 10651985.
  **Doce** mandaron normas de torneos jugados entre su «License level» y
  su «Licensed», y **en ningún rechazo FIDE habla de la licencia**. Que una
  norma «contó» sale de la cuenta que da el rechazo («Only 3 norms»: las
  que mandó menos las que nombra), no de una frase que lo diga:
  - **Alberto Jesús López Rodríguez** (PER, 3802671; AF del 09/05/2017 al
    «Licensed» del 24/02/2020), informe 2020Q2: **sus cinco normas** son de
    ese espacio (2018 a 2020). «Only 3 norms (Cerrado Classico 1600 not IA
    level; two 4.6d tournaments while only one norm is acceptable)»:
    descontaron dos por otra razón, **las otras tres contaron**. Es el
    antecedente más claro de Meza.
  - **Magnus Aanstad** (NOR, 1507362; del 01/04/2014 al 14/03/2017), 2022Q2:
    «Only 3 norms (Chess Olympiad Wom is too old norm, art. 5.3.1)».
    Contaron el Campeonato de Noruega 2015 y Landsturneringen 2016, los dos
    de ese espacio.
  - **Divesh Sookdeo** (RSA, 14319047; del 21/09/2015 al 20/01/2020),
    2022Q4: «Only 3 norms (RSA Open CC – not IA level)». Contaron el
    African Youth y el African Lounge IM de 2016, de ese espacio.
  - **Paul Kehinde Boyo** (NGR, 8501491; del 15/09/2016 al 09/12/2019),
    2022Q4: «Only 3 norms (Cpan Chevron Challenge – not IA level)». Contó
    la Zona 4.4 de Monrovia (del 22/04/2017). En 2023Q1 la volvió a mandar
    y lo rechazaron por otra cosa; en 2023Q3 ya no la incluyó, quizá por
    sus más de seis años.
  - **Ernestina Barrientos Carmona** (MEX, 5120721; del 23/09/2015 al
    20/11/2016), 2023Q3: «Only 3 norms… (Match Arbiter at Olympiad used
    twice – art. 4.9.4)». Contó el Americas Women Continental de Manzanillo
    (del 06/11/2016). No volvió a pedir el AI.
  - Rechazados por otra cosa, con normas de ese espacio: los egipcios
    Khatab, Abdel Aziz y Badr (2020Q3, nivel de los torneos, 4.6.c y
    4.6.d), Hasan (SYR) y Mouini (MAR) (2021Q1, solicitud tardía), Almasalati
    (LBA, 2020Q2, nivel de un torneo) y Michael C. Forster (ENG, 2023Q2,
    «Missing and incomplete documents»).
  - En varios el espacio fue de años, no de semanas (López Rodríguez, casi
    tres; Boyo y Sookdeo, más de tres): FIDE no mira el «Licensed».
- **La licencia que sí cuenta, y cuándo** (informes de 2016 a 2020):
  - En 2016 la Comisión dejó escrito que «an arbiter must have been licensed
    at the time of an event» para usarlo en una solicitud de título (Annex
    22 de la Asamblea General de 2016, fide.com). Es tener licencia de
    árbitro, la de AN alcanza: sin ella no se arbitra un torneo de FIDE.
    No es el «Licensed» del título de AF.
  - Al **pedir** el AI, la licencia tiene que ser ya de nivel AF: en 2019Q1
    seis solicitudes quedaron «CONDITIONAL: Current level of license is NA»
    (Bandur, Clayton, Alankar, García Contreras, Goosen y Khaydarov), y en
    2020Q1 a Lynette Steyn (RSA) la rechazaron por «NA license level». Es
    la licencia del día de la solicitud, no la de las fechas de los torneos.
- **«Licensed» es otra cosa**: el pago anual de la licencia (B.06.1, 6.1).
  En los 343 rechazos de 2023 a 2026 no hay ninguno de un FA o IA por esa
  fecha (los de licencia son todos de antes del NA), ni en los 65 de AI de
  2020 a 2022.
- **En la página**:
  - `af_perfil` (y `ia_perfil`) en `arbitros_cr_fide` (migración
    `20261016022547_arbitros_cr_fecha_del_perfil.sql`) es la fecha oficial.
    Sale de «perfil» en cada aprobación del JSON o, si no, del «License
    level» de ese título en `herramientas/datos/arbitros-cr-perfiles-licencia.json`
    (los 28 AF e IA, leídos en Chrome el 18/10/2026: el perfil de FIDE no
    contesta ni a la base ni a la nube). `lista-fide.py` se detiene si las
    dos fuentes dicen fechas distintas. Con eso tienen fecha oficial 19 AF y
    8 IA, también los de antes de 2023 (Urbina, Miranda, Herrera, Rebeca y
    Fabián Jiménez, Redondo, Amaya, Gustavo Murillo…). El perfil no trae la
    del AF de quien ya es IA, ni la del AI de Joshebeth Núñez, que todavía
    muestra la licencia de AF.
  - **«Licensed» no es una demora en 2013-01-01**: es el día en que FIDE
    empezó a cobrar la licencia, y lo tiene todo el que ya era AF o IA.
  - Con ella, una norma de AI cuenta si el torneo empezó **después**; si
    empezó antes, no cuenta; el mismo día, revisar.
  - Sin ella, se usa la fecha del Consejo:
    - lo que empezó hasta el día del Consejo no cuenta;
    - lo que empezó en los **60 días siguientes** queda para **revisar**,
      con el porqué;
    - después cuenta.
  - «Ya no cuenta para AF» empieza en la misma fecha oficial o, sin ella,
    después de los 60 días.
  - La ficha dice las dos fechas.
- **Quién firma**, de los mismos rechazos: el certificado lo firma el árbitro
  principal.
  - **No puede ser el solicitante** (2.8: «signed by applicant himself»).
  - **Tiene que tener el título**: FA o IA para una norma de AF («Chief
    Arbiter was National Arbiter»), IA para una de AI («Chief Arbiter was FA
    (art. 2.8/2.8.1)»).
  - En AI, **no todas de la misma persona** (4.13.1).
  - «Para pedir el título» lo avisa cuando el principal es de la lista: su
    cargo sale de la ficha de FIDE o de chess-results, y su título en esa
    fecha, de lo que se sepa (`tituloEn`). El principal extranjero no se ve.
- **Por qué rechaza FIDE**, en 343 rechazos (263 de AF y 80 de AI); los
  números son AF y AI:
  - el torneo no tiene el nivel: 113 y 33;
  - documentos incompletos o formularios viejos: 52 y 32;
  - solo suizos chicos (2.4 y 2.5): 54 y 6;
  - seminario de más de cuatro años: 38 de AF;
  - el mismo tipo de torneo usado de más: 36 y 18;
  - pocas rondas: 24 y 7;
  - firmado por quien no tenía el título que hace falta: 22 y 5;
  - dos torneos en fechas que se tocan (2.10): 10 y 5;
  - antes del NA o del AF: 5 y 4;
  - firmado por el mismo solicitante: 1 y 5;
  - en AI, todas firmadas por la misma persona: 2;
  - en AI, no hablar inglés (4.3): 4.

  Aparte salen la solicitud más de un año después del último torneo
  (5.3.3) y la edad. La lista va en «De dónde salen los datos y qué pide el
  reglamento» de la página.
- `verificar-arbitros-cr.js` lo prueba:
  - Óscar solo con el Consejo (15/04/2024): su torneo del 01/05/2024 queda
    para revisar.
  - Con la fecha del perfil (10/05/2024), ese mismo torneo ya no cuenta.
  - Firmas: un principal sin título, y el propio solicitante de principal.

  Lo rompí con la ventana en cero, sin la fecha del perfil y sin cada aviso
  de firmas, y salta cada vez.

## La ruta al título, el historial, la actividad y los que faltan

Seis piezas más en `arbitros-cr.html` (pedido del dueño, octubre de 2026),
todas sobre el reglamento vigente: **B.06.1** (títulos de árbitro, aprobado
por el Consejo de FIDE el 11/12/2025, publicado como
`Regulations/20251211_B061_approved_by_FIDE_Council.pdf`) y **B.06.3** (la
clasificación y la actividad, en el Manual del Árbitro 2026). Los dos se
leyeron convertidos a texto con r.jina.ai, como los informes.

- **«Para pedir el título»** (`rutaTitulo`), en el cuadro de AF o AI de
  quien todavía no tiene ese título. Es lo que pide B.06.1 punto por punto.
  Cada punto dice «Listo», «Falta» o «Revisar», escrito; no hay color.
  - Normas de torneo: 3 para AF, 4 para AI (5.4.4 y 5.5.4). Para AF, de dos
    sistemas distintos, que solo se marca cuando ya junta todas.
  - Un seminario de AF o de AI de los últimos **cuatro** años (5.3.2).
    Coincide con el rechazo de Jessica Rosales en 2026: su seminario de
    julio de 2022 «venció el 17/07/2026».
  - Para AF, un año con la licencia de AN o un torneo de FIDE más que no
    vaya en la solicitud (5.4.3). Para AI, dos años con el AF o tres
    torneos de FIDE más (5.5.3).
  - La fecha límite: la norma más vieja vale **seis años** (5.3.1), y la
    solicitud va a más tardar **un año después del último evento** que
    lleva (5.3.3), seminario incluido.
  - Los certificados por torneo (2.7, revisado contra B.06.1 de 2026 en
    octubre de 2026): uno cada 25 jugadores, o dos en total en un todos
    contra todos. Compiten por ellos los demás árbitros de la lista que
    todavía no eran IA, sin el principal (que firma) ni el asistente (2.4.4).
    Si con él son más que el tope, sale «Revisar»: no se sabe a quién se los
    dieron. No se aplica como «Falta» porque un árbitro con título puede no
    haber pedido el suyo.
  - El seminario puede traer `evento`, el enlace a su página en el
    calendario de la Comisión (arbiters.fide.com/news/event/…), y la ficha
    lo enlaza. De ahí salió el día del 215 (Costa Rica, 9 al 12 de enero de
    2026, examen el 12): el informe al Consejo solo daba el mes de Johanel
    Álvarez.
  - Lo que no se ve desde afuera: los certificados y las firmas (no todas
    de la misma persona, 4.13.1), la edad (19 y 21) y las dos finales
    nacionales.
  - El botón «Descargar los torneos para la solicitud» baja un Excel con
    las columnas del formulario, las mismas de los informes: Start-Close,
    City, Fed, Tournament, TS, Rtd, Total, Rds, Feds, FRL. Lleva también el
    seminario.
  - La ruta va también en el PDF de la ficha.
- **«Quiénes pueden pedir el título»** (en la lista). Cada uno con su
  siguiente título (AF si no lo tiene, AI si es FA) y al menos una norma
  para él. Primero van los que tienen todo; después, el más avanzado.
- **El historial en FIDE** (en la ficha). Sale de los 14 informes de la
  Comisión a las reuniones del Consejo de FIDE, de 2023 a 2026:
  - **19 solicitudes de Costa Rica**, con el veredicto y el motivo tal como
    lo escribe FIDE, en inglés y entre comillas. Cada una con los torneos
    que mandó.
  - **19 seminarios** de 17 personas.
  - Los informes ponen el veredicto **después** de los torneos de cada
    solicitante (ver «Lo que dice FIDE de cada árbitro»).
  - Postgres no cortó bien el `.*?` y la primera extracción tomaba los
    torneos de los solicitantes siguientes: se corta en el primer
    veredicto, ya en Python.
  - Un seminario que empezó en un mes y terminó en el siguiente (el 163,
    del 30/08 al 01/09) sale una vez, por su número, con el día en que
    terminó si lo dice la solicitud.
  - **Los seminarios de AF desde 2010** (octubre de 2026, pedido del dueño):
    se leyeron los 827 informes de seminarios de la Comisión
    (`arbiters.fide.com/news/category/arb/education/seminars/reports`, seis
    páginas). Cada informe trae la tabla de aprobados con su federación; los
    de antes de 2018 traen solo el nombre, o una lista en el texto.
    - Se piden con pg_net **directo a arbiters.fide.com**, de a 60: r.jina.ai
      corta en 20 por minuto y FIDE no contesta la mitad si se le piden 140
      juntos. El pedido sale cuando termina la transacción, así que pedir y
      leer van en dos consultas.
    - Del artículo (del `<h1>` a los botones de compartir) salen las filas
      con «CRC» o «Costa Rica». Los que nombran a Costa Rica sin fila se
      leyeron a mano: casi siempre son ticos que participaron y no
      aprobaron, o la conferencista (Carolina Muñoz).
    - **28 seminarios con aprobados de Costa Rica**: 24 entradas nuevas y
      16 de las que ya estaban completadas con el día y el enlace
      (`informe`); la ficha enlaza «informe del seminario». Los que traían
      solo el nombre se cruzaron por nombre con la lista de árbitros de
      FIDE: todos dieron una sola persona (Keilor/Keylor Miranda,
      Gretell/Grettel Elizondo).
    - Quedan fuera dos que no están en la lista de árbitros de FIDE, así que
      no tienen perfil donde ponerlo: Betzy Fallas Marín (11.º, mujeres,
      2011) y Mariel Pomares Iraheta (67.º, México, 2019).
    - El 173.º (Panamá) se queda con el 01/02/2025 de la solicitud, aunque
      el informe diga que terminó el 2.
    - Los seminarios de AI y los cursos de actualización no están en esa
      categoría: siguen saliendo solo de los informes al Consejo.
  - Va en dos columnas jsonb de `arbitros_cr_fide`, `solicitudes` y
    `seminarios` (migración `20261016014132_arbitros_cr_historial_y_sin_id.sql`).
    La fuente es el mismo JSON de la lista.
- **La actividad en FIDE.** El dueño la pensaba por torneos, pero los
  datos no cuadraban: Mauricio Castro (último torneo de FIDE en el país, en
  2018) y Edwin Urbina (2020) siguen activos. La regla está en B.06.3,
  punto 2:
  - un IA o FA queda inactivo si en **cuatro años no aprueba un curso de
    actualización**;
  - los cuatro años se cuentan desde su AF (si es nuevo) o desde su último
    curso o seminario de AI;
  - un título nuevo no cambia esa fecha (2.3);
  - inactivo, no puede ser árbitro principal de un torneo de FIDE donde
    haya normas para los jugadores (2.1.1), y vuelve con un curso (2.5).

  Los informes no dicen quién hizo cada curso. Por eso `actividad()` da un
  **piso**: «sigue activo por lo menos hasta» cuatro años desde su AF o su
  seminario de AI, lo más nuevo que se sabe. Si después hizo un curso,
  sigue más tiempo. Si el piso cae en menos de un año, lo avisa. La tabla
  de la lista pone primero a los inactivos y después al que vence antes.
- **«Por identificar»** (en la lista, plegado):
  - Los de la lista que no figuran en la lista de árbitros de FIDE: hoy
    son 41.
  - Los nombres de chess-results que no se reconocen: `arbitros_cr_sin_id`,
    que arma `herramientas/arbitros-cr/por-identificar.py`. Son 141 celdas
    en 426 torneos. Por ejemplo, «AF Josué Amaya» (26 torneos), que es
    Álvaro Josué Amaya Madrigal escrito con su segundo nombre.
  - El script usa el mismo reconocimiento del generador: un colector
    opcional en `armar_chess_results(arbitros, sin_reconocer=…)`, que no
    cambia nada de lo que el generador carga (el resumen da los mismos
    11899 cargos).
  - Solo salen las celdas de árbitro (principal, adjunto, árbitros) de los
    torneos de Costa Rica en que no se reconoce a **nadie**. Una celda
    donde sí se reconoce a alguien no se puede partir: no se sabe dónde
    termina un nombre y empieza el otro.
  - Cada celda trae hasta cinco torneos de ejemplo enlazados y los ID que
    traiga.
- **La carga.** El `delete` de `execute_sql` pide confirmación, y cuando
  nadie la da, se cancela solo. La primera vez la tabla ya tenía los mismos
  148 ID, así que se cargó con `on conflict … do update`, sin borrar nada.
  Las huellas de lo cargado son iguales a las del JSON y del script: las
  solicitudes, los seminarios y `por-identificar.py --huella`.
- `verificar-arbitros-cr.js` lo prueba:
  - la ruta de Luis al AF (le faltan normas, su seminario vale hasta el
    29/06/2029, la norma más vieja vence a los seis años) y su Excel;
  - la ruta de Ana al AI;
  - que quien tiene el título no lleva ruta;
  - el historial de Óscar (la rechazada con su motivo y lo que mandó);
  - «Quiénes pueden pedir el título», la actividad (Ana inactiva primero,
    Óscar hasta el 09/09/2029) y «Por identificar» con sus enlaces.

  Lo rompí con los cuatro años del seminario cambiados por tres, la
  actividad a dos años, la lista con los que no tienen normas, el
  historial vacío y la tabla sin nombres, y salta cada vez.

**El informe para la comisión (PDF).** Al lado de «Descargar los torneos para
la solicitud», «Informe para la comisión (PDF)» arma con `js/reporte-pdf.js`
lo que hace falta para decidir si se manda la solicitud, en el mismo orden que
el informe que se le hizo a mano a José Antonio Meza Vega:
- en resumen;
- «Para pedir el título» punto por punto;
- las normas que junta, con quién firma cada certificado (el principal, con el
  título que tenía ese día, `tituloEn()`) y hasta cuándo cuenta, y por qué
  cuenta cada una (con sus jugadores con Elo, federaciones, rondas y enlace);
- los riesgos de esa solicitud (`riesgosSolicitud()`), cada uno sacado de lo que
  FIDE rechaza en sus informes:
  - fechas que se tocan con otro torneo de FIDE (2.10);
  - una norma que vale una sola vez (4.9.1);
  - para AI, una norma a menos de 60 días de su AF (conviene la captura del
    perfil y una norma de reserva);
  - una norma que vence en menos de un año;
  - los torneos que quedaron para revisar;
- el catálogo de los rechazos.

La tabla lleva solo cuatro columnas (empezó, torneo, quién firma, cuenta
hasta): con nueve, `reporte-pdf.js` cortaba el texto de cada celda.

## La revisión de normas antes de mandarlas

El dueño pidió (octubre de 2026) un lugar donde subir las normas de una
solicitud y saber, antes de mandarla, si FIDE la aceptaría y qué le falta:
una solicitud rechazada son meses perdidos. Está en la ficha de cada árbitro,
«Revisar normas antes de mandarlas».

- **Lo decidió el dueño:**
  - la suben quienes tienen la licencia de la herramienta, para cualquier
    árbitro de la lista;
  - los datos del certificado se eligen de una lista (el torneo de FIDE, el
    cargo, quién firma), no los lee una IA: lo demás (jugadores, Elo,
    federaciones, fechas, el título de quien firma) ya está en la base, y una
    lectura automática puede leer mal y cuesta en cada certificado;
  - cada certificado lo ven solo quien lo subió y quien administra.
- **Norma por norma** (`revisarNorma()`):
  - el torneo, con el cargo que dice el certificado (`normaDe`) y la fecha
    contra el AF (`antesDelAf` / `despuesDelAf`);
  - que el cargo coincida con la ficha de FIDE del torneo, porque FIDE lo
    comprueba ahí;
  - la vigencia de seis años (5.3.1);
  - quién firma: no el solicitante (2.8); con el título que hacía falta ese
    día (`tituloEn`); si no está en la lista, para revisar; y si no fue el
    principal que dice FIDE, para revisar;
  - que esté el certificado.

  Dice «La aceptaría», «Revisar», «Falta algo» o «No vale», y cada punto con
  su porqué.
- **La solicitud entera** (`revisarSolicitud()`): con las normas que no se
  caen, las fechas que se tocan (2.10), las que valen una sola vez (4.9.1) y
  «Para pedir el título» de siempre. `rutaTitulo()` recibe ahora la lista de
  normas (`propias`, cada una con `firmante`) en lugar de elegirlas sola: una
  sola copia de las reglas. Dice «Lista para mandar», «Casi: revisar lo
  marcado» o «Todavía no: FIDE la rechazaría».
- **La base** (`20261016034255_arbitros_cr_revision_de_normas` y las que
  siguen):
  - `arbitros_cr_normas_revision`, con su RLS: ve, sube, cambia y borra quien la
    subió con la licencia, y quien administra ve y borra;
  - un índice único por (quién, árbitro, título, torneo): la misma norma no se
    sube dos veces;
  - la ruta del archivo tiene que estar en la carpeta de quien la sube;
  - el bucket privado `normas-arbitros` (PDF, JPG, PNG o WebP, hasta 10 MB), con
    las mismas reglas por carpeta.

  Comprobado impersonando en SQL a alguien con licencia, a alguien sin ella, a
  administración y a `anon`.
- **El `TRUNCATE` que quedó abierto.** La tabla nació con los permisos que
  Supabase da por omisión a `authenticated` (`TRUNCATE`, `REFERENCES`,
  `TRIGGER`), y un `TRUNCATE` no pasa por la RLS: cualquiera con sesión vaciaba
  la tabla de todos. Lo mostró el retrato del esquema;
  `20261016035011_arbitros_cr_revision_sin_truncate` deja solo `select`,
  `insert`, `update` y `delete`.
- **El consentimiento.** Un certificado lleva firmas y datos de otras personas:
  la casilla («Tengo permiso del árbitro… y acepto la Política de privacidad»)
  se mira antes de subir el archivo, y la base exige la versión y guarda la hora
  del servidor (ver «El consentimiento queda guardado» en `legal.md`). El
  trigger es `security definer` porque `authenticated` no ejecuta
  `interno.version_legal_valida()`; un segundo trigger, `consentimiento_fijo`,
  no deja cambiar la aceptación después.
- `verificar-arbitros-cr.js`:
  - sube una norma de Luis con quien firma fuera de la lista (Revisar);
  - comprueba la solicitud de AF con una sola norma (Todavía no), la misma
    norma dos veces, quitarla con su archivo y la casilla;
  - sube una de Ana para AI firmada por alguien que entonces no era AI (No
    vale) y con un cargo distinto al de FIDE.

  El doble guarda y borra de verdad, filtra en el resolver y rechaza sin la
  versión de la privacidad, como el trigger.

**Las normas de reserva** (`candidatas()`). Junto a cada norma que no vale o
queda para revisar, y al pie de la solicitud, la página propone otros torneos
del mismo árbitro que sirven:
- de FIDE, de los últimos seis años, que valen con su cargo en FIDE y con la
  fecha contra el AF;
- que no estén subidos y no se toquen en fechas con las normas subidas que
  sirven (2.10);
- si ya hay una norma que vale una sola vez, ninguna otra de ese tipo (4.9.1).

Primero van las que firmaría alguien con el título que hace falta (el
principal según FIDE, con `tituloEn()`); después, las que valen siempre;
después, las más nuevas. La que no vale nunca se propone como su propio
reemplazo.

## El seguimiento: lo que dijo la revisión y lo que resolvió FIDE

«Marcar como enviada a FIDE» guarda en `arbitros_cr_solicitudes_enviadas`
(migración `20261016040007`) la fecha, lo que dijo la revisión
(`prediccion`: lista, casi o todavía) y la foto de cada norma con su
veredicto. Cuando el Consejo resuelve, se anota el resultado (aprobada o
rechazada), el Consejo y el porqué del informe de la Comisión.

La revisión **acertó** si dijo «Lista» y FIDE la aprobó, o «Todavía no» y la
rechazó; las «Casi» no cuentan. La página dice cuántas acertó de todas las
resueltas: donde falla, el motivo del informe dice qué regla falta o sobra.

Los permisos son los de las normas subidas: quien la marcó con la licencia, y
administración ve todo, con `TRUNCATE` cerrado desde el principio. Se
comprobaron impersonando en SQL; también que no se marca dos veces el mismo
día y que no entra una predicción inventada.

`verificar-arbitros-cr.js`:
- dos torneos de reserva para Luis, uno con un principal AF y otro con un AN,
  en ese orden;
- la norma que no vale y propone otra;
- marcar como enviada, anotar «Rechazada» y ver que acertó.

Rompí a propósito el filtro de las ya subidas, la firma y la regla del
acierto; salta cada vez.

## En memoria

Un árbitro que falleció lleva junto a su nombre, en la lista y en su ficha
de `arbitros-cr.html`, un lazo de luto con «En memoria» escrito: el dibujo
no va solo, y el lector de pantalla lee el texto, no el lazo
(`aria-hidden`). Lo pidió el dueño en octubre de 2026 por Betzy Fallas
Marín (ID 6500986), que arbitró torneos de FIDE en el país y aprobó el
seminario de AF de mujeres en 2011.

- Va en su propia tabla, `arbitros_cr_memoria` (migración
  `20261019015814`), y no en `arbitros_cr`: esa se borra y se vuelve a
  llenar en cada carga, y la marca se perdería. La leen quienes tienen la
  herramienta; la escribe solo administración (por ahora, en la base).
- El lazo es un SVG propio en `currentColor`, así que se ve en los dos
  temas con el color del texto.
- `verificar-arbitros-cr.js` marca a Juan solo en su bloque y comprueba la
  lista, la ficha y que nadie más lo lleve; se rompió devolviendo siempre
  nada y salta.

## Conferencistas, asistentes y seminarios de quien no está en la lista

Pedido del dueño en octubre de 2026, después de leer los 827 informes de
seminarios de AF (ver «Los seminarios de AF desde 2010»).

- **Los seminarios de AI.** Los informes «NN.º IA Seminar – Report» (del
  1.º, en marzo de 2024, al 28.º, en agosto de 2026) no están en la sección
  de informes de seminarios sino en la de Educación
  (`news/category/arb/education`). Se leyeron los 28. Tres ticos aprobaron:
  Cristian Araya (1.º), Joshebeth Núñez (18.º) y Edgar Zeledón (25.º); los
  tres ya estaban por los informes al Consejo. A Edgar le faltaba el día
  (17/05/2026), y ahora su actividad cuenta desde ahí. Los tres llevan el
  enlace `informe`.
- **Los cursos de actualización no se publican.** Su sección
  (`news/category/arb/education/refresher-courses`) tiene solo 8 anuncios
  de alrededor de 2015, sin quién aprobó, y los informes al Consejo tampoco
  lo dicen. Por eso la actividad (B.06.3) sigue siendo un piso, «por lo
  menos hasta». La única fuente sería el portal de formación de FIDE
  (arb-learn.fide.com), que pide cuenta.
- **`arbitros_cr_seminario_roles`** (migración `20261019033231`) guarda lo
  que no cabe en `arbitros_cr_fide.seminarios`, que solo tiene a quien está
  en la lista de árbitros de FIDE y solo lo que aprobó:
  - `conferencista`, `asistente` u `organizador`, con `detalle` («local»,
    «técnico», «con Laurent Freyd (FRA)»…). Salen de las frases del
    informe que nombran a alguien «(CRC)» como Lecturer, Assistant u
    Organizer: Carolina Muñoz Solís fue conferencista de 8 seminarios (4 de
    AI) y asistente de 3; Oscar Angulo, asistente local del 215.º, y
    Stanley Gómez, organizador técnico del 53.º (2017). Se buscó también
    por apellido, por si algún informe viejo no decía «(CRC)»: no apareció
    ninguno más.
  - `aprobo`, solo de quien no está en la lista de FIDE: Betzy Fallas Marín
    (11.º, de mujeres, 2011). Mariel Pomares Iraheta (67.º, México, 2019)
    no tiene ficha en la herramienta, así que su seminario no tiene dónde
    ir.
  - La leen quienes tienen la herramienta y la escribe administración.
- En la ficha, el historial suma los seminarios de esa tabla y, debajo,
  cada rol con su fecha, el detalle y el enlace al informe.
- **Betzy en chess-results.** Figura como «Betsy Fallas Marin» y «AN Betsy
  Fallas», y el nombre de pila no calzaba. `VARIANTES` en
  `herramientas/arbitros-cr.py` acepta las formas de escribir un nombre
  (`betzy` → `betsy`), y `verificar-arbitros-cr-fechas.py` lo prueba. Sus
  dos torneos de 2016 (JDN, eliminatoria femenina U16) se agregaron a
  `arbitros_cr_cr_cargos` a mano; el tercero no está en la tabla de
  torneos. Las dos filas de `arbitros_cr_sin_id` se van en la próxima
  carga: el `delete` desde aquí pide una confirmación que nadie da.
- **«En memoria» desde la ficha.** Administración tiene un botón para
  marcarlo o quitarlo, con su confirmación, debajo del correo de los
  avisos.
- `verificar-arbitros-cr.js` lo prueba: los roles de Óscar con su orden y
  su enlace, el seminario de Juan (que no está en la lista de FIDE), y el
  botón (no se ve sin ser de administración; marca y quita). Se rompió
  dejando los roles vacíos y sin guardar la marca, y salta.

## Para subir de categoría en FIDE

En la ficha de cada IA, debajo de sus normas (pedido del dueño, octubre de
2026, después de comparar la herramienta con B.06.3 vigente desde el 1 de
julio de 2026). La actividad (artículo 2) ya estaba; las categorías, no.
`subirCategoriaFide()` y `tarjetaCategoriaFide()` en `js/arbitros-cr.js`.

- **Solo los IA suben**: los FA son categoría D siempre (1.2.2) y no llevan
  la tarjeta. En octubre de 2026 el país tiene 18 FA y 10 IA: 1 en A y 9
  en D.
- **Lo que pide cada salto** (artículos 3 a 5): para C, un año con el AI;
  para B, tres y dos años en la C; para A, cinco y dos en la B. Además estar
  activo y, en los últimos cinco años, haber sido **principal o adjunto
  principal** en dos torneos de la categoría a la que sube, o en uno de esa
  y tres de la de abajo. Los torneos empiezan después de la última subida o
  del título y no pueden haber ido en otra solicitud (7.3). La pide la
  Federación con el IA3 (7.2).
- **La categoría de un torneo** (`nivelFide`):
  - D: el que daría norma de AI (1.3.4). Es `ai_estado` del torneo, que ya
    estaba calculado; «revisar» queda para revisar.
  - C: un continental de juveniles, escolares, sénior o aficionados, o un
    internacional fuerte (9 rondas, más de 150 jugadores, 75 % con Elo y tres
    federaciones; los 20 titulados no se cuentan porque la tabla no tiene
    los títulos de los jugadores).
  - B, un continental mayor, y A, un mundial mayor.
  - De la C para arriba se reconocen **por el nombre o el tamaño** y
    siempre quedan para revisar. Un todos contra todos fuerte se mide por el
    promedio de Elo, que no se tiene.
- **El estado** dice «Puede pedirla» solo con torneos seguros; «Revisar»
  cuando alcanza contando los que hay que revisar, y «Le falta» si no.
- Lo que no se sabe va escrito como «Revisar»: desde cuándo tiene su
  categoría (la lista de FIDE no lo dice), la evaluación positiva, las
  sanciones y, para B y A, cuándo fue la última subida. Si del AI solo se
  sabe el año, se cuenta desde el 31 de diciembre de ese año.
- `verificar-arbitros-cr.js` lo prueba con Óscar:
  - con un AI del que solo se sabe el año, le falta el año y no tiene
    torneos;
  - con el AI desde junio de 2025, cada torneo trae su categoría y su
    porqué; el de antes del AI y el de simple árbitro no cuentan;
  - con tres de D y un panamericano juvenil, sale «Revisar»;
  - un FA no lleva la tarjeta.

  Lo rompí contando un continental juvenil como seguro y contando a quien
  fue solo árbitro, y salta.

## Comparar dos árbitros y el ranking del año

Dos piezas más en `arbitros-cr.html` (pedido del dueño, octubre de 2026):

- **«Comparar con otro árbitro»**, en la ficha, debajo de los cuadros de
  normas: se elige a otro en una lista y salen tres tablas. La primera pone a
  los dos dato por dato (el mismo `resumen()` de la lista, con los filtros
  puestos). La segunda va año por año, con cuántos torneos hicieron juntos.
  La tercera son esos torneos, con el cargo de cada uno.
  - «Juntos» es la misma clave de torneo en los dos (`f<id>` o `c<clave>`).
    Con «festivales como uno», la clave es el día (`d<fecha>`): dos que
    estuvieron en partes distintas del mismo festival cuentan como juntos,
    igual que en la cuenta general.
  - La dirección lleva a los dos (`#ID,ID`) para compartirla. Una dirección
    vieja con un solo ID sigue abriendo solo la ficha, y abrir otra ficha
    quita la comparación.
  - No hay color que diga quién tiene más: los números van escritos y se
    leen solos.
- **«Ranking del año»**, en la lista, debajo de «Torneos por año»: los
  árbitros de un año, ordenados por lo que se elija en «Ordenar por»
  (torneos, como principal, de FIDE, en el extranjero o que valen para AF).
  - Usa los filtros de arriba (buscador, título, tipo, dónde, contar), pero
    no los años: el año es el suyo. Arranca en el año en curso, o en el
    último con torneos si el año en curso todavía no tiene.
  - El puesto con empates es el de las competencias (1, 1, 3): quien empata
    comparte el puesto y el siguiente salta. Es lo que se espera de un
    ranking y lo que no engaña: un 2.º no queda «detrás» de otro con el
    mismo número.
  - «El año anterior» dice el puesto de entonces, con lo mismo elegido y en
    palabras («Sube 1 (era 2.º)», «Igual (1.º)», «No figuraba en 2023»), sin
    flechas de color. Se baja en Excel.
- `verificar-arbitros-cr.js` prueba:
  - el ranking: el empate en el 1.º, el salto 1, 2, 2, «Ordenar por» con su
    `aria-sort`, el año anterior y el primer año sin anterior;
  - la comparación: abrir con dos ID, dato por dato, por año, los torneos
    juntos con cada cargo, ninguno juntos sin tabla vacía, y que la dirección
    cambie y se limpie.

  Lo rompí sin empates, con la dirección sin el segundo ID y sin torneos
  juntos, y salta cada vez.

## La ficha de un árbitro en PDF

«Descargar en PDF» en la ficha de `arbitros-cr.html` (pedido del dueño,
octubre de 2026, para adjuntar a una solicitud): el nombre, su título y su
ID FIDE, los filtros puestos, los dos cuadros de normas (el mismo texto de
la pantalla: `textoNorma()` lo arma para los dos) y la tabla de torneos con
los filtros que estén puestos, con `js/reporte-pdf.js` (sin librería). Se
arma con los datos, no copiando la pantalla. Esa tabla **recorta** las celdas
(a propósito, no parte renglones), así que el cargo va corto («Principal»,
«Adjunto», «Pareos»…) con una nota que lo explica, y las columnas «Rds.» y
«Jug.»; el porqué de cada norma queda en la ficha en línea y en el Excel.
`verificar-arbitros-cr.js` baja el PDF de Luis y busca su nombre, el cuadro
de AF, su torneo y la nota de las fuentes (lo rompí sacando los cuadros y
salta); la tabla se miró convertida a imagen.

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
  arbitraje»). Lo corre el mismo flujo mensual, después del
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

## Contra quién jugó cada estudiante, y el resultado

Lo pidió el dueño en octubre de 2026: en `historial-jugador.html`, cada
torneo de la ficha de un jugador se puede desplegar («Ver N partidas») para
ver, ronda por ronda, contra quién jugó, con qué color y el resultado, con un
enlace al historial del rival.

- **Solo los torneos individuales de 2024 en adelante.** Esto no sale de la
  misma página que ya se lee (`art=1`, la clasificación): hace falta pedirle
  a chess-results una página MÁS por cada jugador de cada torneo
  (`tnr<clave>.aspx?art=9&snr=<N>&turdet=YES`, la misma que ya usa, para un
  jugador puntual, el panel de administración —
  `supabase/functions/chess-results-proxy/index.ts`). Traer eso de los ~1400
  torneos de toda la historia (desde 2011) le pediría al sitio miles de
  páginas de más; acotado a los individuales de 2024 en adelante son unas
  5300. Los torneos por equipos quedan fuera: reparten sus partidas por
  tablero dentro de un duelo entre equipos, una estructura distinta que no se
  lee todavía.
- **`herramientas/ajedrez-estudiantil-partidas.py`**, después de
  `ajedrez-estudiantil-jugadores.py` en el mismo flujo mensual, en
  dos pasos que cuentan juntos para `--maximo` (100 por vuelta, igual
  cadencia que el resto del sitio):
  1. completa el «snr» (el `No.Ini.` con que arrancó cada jugador, lo que
     identifica su fila en `art=9`) de los torneos que se habían leído ANTES
     de que `ajedrez-estudiantil-jugadores.py` empezara a guardar esa
     columna — una página por torneo, no por jugador, para toda su lista de
     una vez;
  2. con el snr ya puesto, pide las partidas de cada (torneo, jugador) que
     todavía no se leyó. Con el flujo mensual (ver «Se pone al día sola, una
     vez al mes, de abril a diciembre» arriba) esto avanza mucho más lento
     que cuando corría cada seis horas: para ponerse al día rápido, correr el
     flujo a mano (`workflow_dispatch`) las veces que haga falta.
- **Completar el snr (paso 1) también dispara la reconstrucción de los
  tres JSON, aunque el paso 2 no haya leído ninguna partida nueva.** El
  flujo volvió a los JSON con `ajedrez-estudiantil.py` solo cuando había
  partidas nuevas o lecturas nuevas (`if nuevas or leidas_ahora:`), pero el
  paso 1 reescribe `ajedrez-estudiantil-jugadores.csv` por su cuenta (le
  pone el snr a quien no lo tenía) sin que eso cuente ahí. Con el tope de
  100 pedidos compartido entre los dos pasos, una vuelta puede gastarlo
  entero completando snr y no llegar al paso 2: `completados` queda con
  algo, `nuevas` y `leidas_ahora` quedan vacíos, y el JSON de jugadores se
  queda desactualizado respecto al CSV que sí cambió. La siguiente corrida
  del flujo lo agarra (`verificar-ajedrez-estudiantil-reglas.py`, con
  `ajedrez-estudiantil.py --comprobar`) y falla antes de llegar a abrir el
  PR — así estuvo el flujo automático sin sumar nada nuevo desde el
  10/10/2026 hasta que se encontró esto el 14/10/2026. El arreglo es la
  condición de siempre, con `completados` adentro:
  `if completados or nuevas or leidas_ahora:`.
  `verificar-ajedrez-estudiantil-partidas.py` comprueba, leyendo el código
  fuente, que esa condición sigue incluyendo `completados`.
- **El color sale de un `<div class="FarbewT">` (blancas) o
  `<div class="FarbesT">` (negras) DENTRO de la celda del resultado** — se
  comprobó contra una página real (torneo 911786, Regional Turrialba, marzo
  2024). Cuando ese `<div>` no está (una ronda sin emparejar, o ganada o
  perdida por incomparecencia de un rival real, también visto en una página
  real) el color queda «desconocido» y el resultado es el texto tal cual lo
  escribe chess-results (p. ej. `- 1K`), sin interpretarlo: no se inventa qué
  significa un código que no se pudo confirmar.
- **Una ronda sin emparejar (bye) no es una partida**: su rival es «sin
  emparejar» con un `No.Ini.` negativo, y no cuenta como «contra quién
  jugó». Una ganada o perdida por incomparecencia de un rival CON nombre sí
  cuenta (el emparejamiento existió), con su resultado tal cual.
- **Se guarda en `herramientas/datos/ajedrez-estudiantil-partidas.csv`**
  (`clave,snr,ronda,mesa,color,resultado,rival_snr,rival_nombre,rival_institucion,rival_elo`)
  y qué (torneo, jugador) ya se leyó en
  `ajedrez-estudiantil-partidas-leidas.csv` (no se vuelve a pedir aunque el
  torneo cambie: es un hecho pasado). `ajedrez-estudiantil.py` arma con eso
  `data/ajedrez-estudiantil-partidas.json`, y la participación de
  `ajedrez-estudiantil-jugadores.csv`/`.json` ganó la columna «snr» para
  enlazar las dos.
- **`js/jde-datos.js`** carga el tercer JSON (con `.catch` si todavía no
  existe, para no romper nada mientras se despliega esto) y le agrega
  `partidas` a cada participación que tenga snr y partidas leídas; el rival
  se enlaza a su propio historial con el mismo `D.normalizar()` de siempre
  (`historial-jugador.html?j=`), sin tener que resolverlo contra un índice de
  personas.
- `herramientas/datos/ajedrez-estudiantil-muestras/partidas.txt` tiene una
  página de ejemplo (nombres inventados) con una ganada de blancas, una
  perdida de negras, un bye y una incomparecencia, y
  `verificar-ajedrez-estudiantil-partidas.py` prueba el lector contra ella,
  el filtro de «elegible» (individual, 2024+) y una vuelta completa (los dos
  pasos, el `--maximo` compartido entre ambos, lo ya leído que no se repite).
  `verificar-jde-jugadores.js` prueba el despliegue en la página: que no se
  vea hasta abrirlo, el texto de la ronda y el enlace al rival, y que un
  torneo sin partidas leídas no muestre el despliegue.

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
en `js/herramientas-arbitraje.js`). Junta los 289
torneos de ajedrez de los Juegos Deportivos Nacionales que están en
chess-results —eliminatorias 2018, 2019, 2021, 2022, 2024 y 2025; finales 2018,
2019, 2020-2021, 2022-2023, 2024 y 2026— y los ordena **por comité de deportes**: lo pidió el
dueño («lo que importa es filtrar por resultados de todos los comités»). Arriba,
el medallero de las finales (todas o una edición; suma individual, equipos y
los tres primeros de cada tablero); al elegir un comité, su
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
  equipos) de la primera carga coinciden torneo por torneo con la revisión a mano —cantidad, suma
  de puntos y la huella de los nombres en orden—.
- **La final 2018 y la eliminatoria 2018 por equipos se sumaron después**
  (24 torneos, 209 filas): faltaban porque tres de sus títulos no dicen «2018»
  y las finales se subieron en otro bloque (364296–364768, edición `2018-F`).
  Los números salieron del buscador de chess-results pedido desde la base: el
  formulario se manda con un POST `application/x-www-form-urlencoded`, que
  `net.http_post` no deja (solo acepta JSON), así que se inserta directo en
  `net.http_request_queue` y se llama `net.wake()`. Como pg_net borra sus
  respuestas a las pocas horas, se cargaron solo esos torneos con la misma
  lectura de `cargar.sql`, sin borrar la tabla; cuadran: cada final
  individual de 8 suma 28 puntos y cada una por equipos, 112. La Zona 1 U20
  Femenino por equipos (344086) está vacía en chess-results.
- **La eliminatoria 2019, la final 2020-2021 y dos eliminatorias 2024 por
  equipos (U20) se cargaron sin anotarlas** (49 torneos, 466 filas): estaban en
  la base pero no en `torneos.txt`. Al anotarlas se volvieron a pedir sus
  páginas y `cargar.sql` da exactamente las mismas filas, con dos arreglos
  que esas ediciones necesitan: la eliminatoria 2019 escribe «Zona01» (la
  zona se busca como `zona ?0?1`) y en la final 2020-2021 «Des 1» es el
  encuentro directo y los puntos están en «Des 2». Por eso los puntos de una
  tabla de equipos salen del desempate que su leyenda llama «points
  (game-points)», no de «Des 1» fijo. La final 2020-2021 se subió como
  «… - Juegos Deportivos Nacionales 2020-21», sin «Final» en el título. Hoy
  la tabla tiene 3245 filas de 288 torneos (el 344086 no trae ninguna).
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
- En equipos, chess-results ordena primero por puntos de partida. En 25
  eliminatorias por equipos no hay tabla final: el orden sale de la página de
  resultados y no hay récord de matches.
- Lo que no está en chess-results no está acá: la eliminatoria 2018 de U12
  y dos eliminatorias por equipos de 2024 (Z1 y Z2 U12 Femenino). La página lo dice en «De dónde salen los datos».

`verificar-jdn-comites.js` lo prueba con un doble de Supabase: el candado sin
licencia (y que no pida la tabla), la lectura de mil en mil (con 1100 filas de
un solo torneo), las variantes juntas y el orden del medallero, el empate que
comparte la plata, el comité deducido, la medalla escrita, «Jugó la final», el
filtro de edición y el enlace. Rompiendo a propósito la paginación, el empate o
la deducción, salta.

### De la eliminatoria a la final, cómo viene cada comité y la ficha del jugador

Tres mejoras que pidió el dueño para que la estadística diga más que el
medallero:

- **«De la eliminatoria a la final»** (debajo de los participantes): por
  comité, cuántos jugadores inscribió en la eliminatoria, cuántos de ellos
  jugaron la final del mismo ciclo (y el porcentaje), cuántos equipos llevó a
  cada una y cuántas medallas sacó en la final por cada clasificado (jugador o
  equipo). Con una edición elegida, solo su ciclo; con todas, la suma. Un
  jugador que cambió de comité entre la eliminatoria y la final no cuenta como
  «pasó» para ninguno: así «pasaron» nunca supera a los jugadores en la final.
  No sale con un filtro de fase, ritmo o zona, que la partirían a la mitad.
- **La evolución en el tiempo**: en la ficha de cada comité, «Cómo viene» con
  dos gráficas de barras (medallas en cada final y participantes en cada
  eliminatoria), y con todas las ediciones, «Comparar comités»: hasta tres en
  una gráfica de líneas, con una tabla debajo con oro·plata·bronce. Las
  gráficas son SVG propio, sin librerías. Las barras son una sola serie, cada
  una con su número escrito; las líneas usan los tres primeros colores de la
  paleta categórica validada (`#2a78d6`, `#eb6834`, `#1baf7a`; en oscuro
  `#3987e5`, `#d95926`, `#199e70`), comprobados con el validador de la guía de
  gráficos contra el blanco y contra el fondo oscuro: el aqua queda bajo 3:1 en
  claro, por eso cada línea lleva su nombre al final y la tabla repite los
  números (el color nunca va solo). Un solo eje, nunca dos.
- **La ficha del jugador**: tocar un nombre (en «Buscar jugador» o en «Sus
  jugadores» de un comité) abre su trayectoria: eliminatorias y finales que
  jugó, sus medallas individuales y de tablero, las categorías en el orden en
  que las jugó y cada torneo con su enlace a chess-results. Los filtros la
  recortan sin cerrarla y el enlace la guarda (`#~~j=…`). En la ficha del
  comité, «Sus jugadores» dice cuántos volvieron a los JDN en otro año (la
  retención) y lista a los 60 que más jugaron.

### Los filtros y la búsqueda de jugador

Arriba de todo, además del comité y la edición: fase (eliminatorias o finales),
categoría, rama, modalidad (individual, o equipos con sus tableros), ritmo (de
las finales) y zona (de las eliminatorias), y «Buscar jugador» (lo pidió el
dueño, «para un mejor manejo»).

- **Los filtros valen para todo lo que se pinta**: el medallero, las medallas
  por final, los mejores tableros, los participantes y la ficha del comité.
  Los datos completos quedan en `TODO` y `ind`/`eq`/`tabs` son lo que pasa los
  filtros; la deducción del comité, «Jugó la final» y el «puesto de N» salen
  siempre de lo completo, así un filtro nunca cambia un dato, solo qué se ve.
  La lista de comités también es la completa (`comitesTodos`): un comité que
  con un filtro no tiene nada abre su ficha igual y lo dice.
- **El ritmo solo existe en las finales y la zona solo en las eliminatorias**:
  con un ritmo elegido no sale la tabla de eliminatorias, y con una zona, la de
  finales.
- **«Buscar jugador»** (desde 3 letras, sin tildes): sus torneos individuales y
  sus tableros en todos los JDN, con comité, edición, puesto, medalla y el
  enlace a chess-results; respeta los filtros, y el comité abre su ficha.
- **El enlace guarda todo**: `#comite~edicion~fase=final&cat=U16&q=…`; los
  enlaces viejos (`#comite~edicion`) siguen abriendo lo mismo.

### Los participantes de cada comité

Debajo del medallero, «Participantes por comité» (lo pidió el dueño, para las
eliminatorias y las finales): con una edición elegida, cada comité en cada
categoría y rama (U12, U16, U20; absoluto y femenino), en jugadores de los
torneos individuales y equipos, con sus totales y la lista de los torneos de
esa edición con su enlace a chess-results; con todas las ediciones, una tabla
comité por eliminatoria y otra comité por final. Cada cifra abre la ficha del
comité en esa edición, donde cada jugador y equipo tiene su enlace.

- **Un jugador o un equipo que jugó varios ritmos cuenta una vez.** El jugador
  se reconoce por su nombre sin tildes ni números (con los nombres cortados de
  chess-results juntos, como en el comité deducido); el equipo, por su comité
  y su letra o número (`sufijo()`: «A», «J», «2»), porque chess-results
  escribe el mismo equipo distinto de un ritmo a otro («Goicochea» y
  «Goicoechea» en la final 2026, «CODEA 01» y «CODEA 1» en la de 2020-2021).
  Contando por nombre, la final 2020-2021 daba 39 equipos en lugar de 36.
- **Comprobado contra la base**: en cada eliminatoria, jugadores y equipos son
  exactamente las filas de sus torneos (un torneo por zona, nadie repite), y en
  las finales los equipos coinciden con el torneo más grande de cada categoría
  (213 jugadores y 211 equipos en las seis finales).
- Los datos de prueba del verificador no pueden distinguir jugadores por un
  número en el nombre («Jugador 1», «Jugador 2»): la página los compara sin
  números y los junta.

### Los mejores tableros de las finales

Al elegir una final, debajo del medallero sale «Mejores tableros»: el primero
de cada tablero en cada torneo por equipos (la reserva aparte, en las finales
2018-2021). En la ficha del comité, cada final suma «Tableros de sus equipos»:
quién jugó en qué tablero, su puesto en ese tablero, su porcentaje y su
medalla. El dueño lo pidió solo para las finales.

- **Los tres primeros de cada tablero son medallas oficiales** (lo dijo el
  dueño) y **se suman al medallero**: cada comité suma también las de los
  tableros de sus equipos, en su propia columna («Medallas tab.»), y cuentan
  para el orden por oros, platas y bronces. La reserva de 2018-2021 también
  cuenta. Como hay cuatro o cinco tableros por torneo, pesan más que las
  medallas de equipo: en todas las finales son 378 oros de tablero, contra 86
  de equipo y 91 individuales.

- **El orden es el de chess-results, no uno calculado acá**: la «Clasificación
  por tableros» (`art=81`) de cada torneo. Cada árbitro eligió sus desempates
  (siempre primero el porcentaje; después puntos, partidas, victorias o
  rendimiento) y su mínimo de partidas, y chess-results ya deja afuera a quien
  no llegó a ese mínimo (en 2018-2021 la configuración dice «at least 42/57/80
  games», que es un porcentaje de las rondas: el tablero 1 de una final 2019
  lista solo a los tres que jugaron el 80 %). Recalcularlo con otra regla daría
  otro «mejor tablero» que el que se premió.
- **Los datos están en `jdn_tableros`** (migración `20261013134600`), con el
  mismo candado que `jdn_resultados`: solo la lee quien tiene la herramienta.
  Una fila por puesto de cada tablero: 2153 filas de los 86 torneos por equipos
  de las finales. Se llena con `herramientas/jdn-comites/cargar-tableros.sql`,
  igual que `cargar.sql`: las páginas se piden con `pg_net` y el archivo las
  lee. El porcentaje y los puntos salen del desempate que la leyenda llama
  «Percent» y «points (game-points)», que cambian de número según el torneo.
- **El comité sale del nombre del equipo**, con el mismo `comite()` de la
  página; un puesto vacío es un empate y lo comparten los dos.
- **Si la tabla no se puede leer, la página sigue sin los tableros**: son un
  agregado, no la herramienta.
- **Con «Todas las ediciones» sale «Medallas por final»**: cuántas medallas
  hubo de cada tipo (individuales, equipos, tableros y total) y una tabla
  comité por final (oro·plata·bronce), como el medallero que el dueño pidió en
  imagen. Cada cifra abre la ficha del comité en esa final.
- **Cada dato se puede comprobar en chess-results** (lo pidió el dueño): cada
  jugador, equipo y tablero de la ficha y cada torneo de «Mejores tableros»
  lleva su enlace al torneo (`art=1` la clasificación, `art=46` la tabla final
  de equipos cuando existe, `art=81` la clasificación por tableros). Por eso la
  página lee también el `tnr` de cada fila.
- **El total de cada comité (`todos`) se vuelve a calcular después de leer los
  tableros**: se calculaba al preparar los resultados, antes de los tableros, y
  la columna de total y el «puesto en el medallero» de la ficha los dejaban
  afuera sin avisar.

`verificar-jdn-comites.js` lo prueba: la columna de cada tablero y la reserva,
el empate que comparte el primer puesto, que una eliminatoria no muestra
tableros, la ficha con la medalla de cada tablero, que el medallero suma las
medallas de tablero y que sin licencia no se pide la tabla. Rompiendo a
propósito el empate o la suma de tableros, salta.

### La copa de puntos por puesto

Debajo de «De la eliminatoria a la final», con todas las ediciones o una
final, sale «La copa»: una tabla de puntos por puesto, como la de unos juegos,
para que cuenten también el 4.º, el 5.º… y no solo las medallas.

- **La escala la elige quien mira, no está escrita como oficial**: el dueño no
  dio una regla y el reglamento de los JDN no estaba a mano. Trae tres (10-8-6-
  5-4-3-2-1, la de siempre; 7-5-4-3-2-1; 3-2-1) y «Otra escala», que se
  escribe («10, 8, 6» o «10-8-6»: cualquier cosa que no sea un número separa;
  el decimal va con punto). El texto lo dice: «La escala no es oficial».
- **Suma lo mismo que el medallero**: cada jugador individual, cada equipo y,
  si la casilla está marcada (lo está de entrada), cada tablero de
  `jdn_tableros`, siempre de las finales. Un empate sin desempatar comparte el
  puesto y los dos suman sus puntos, como comparten la medalla.
- **La escala va en el enlace** (`copa=3`, `copa=5-3`, `ct=0` sin tableros):
  quien comparte la tabla comparte con qué regla se armó. La de siempre no se
  escribe.
- No sale en una eliminatoria ni con los filtros «Solo eliminatorias» o de
  zona: ahí no hay puestos de final.

### Los integrantes de cada equipo

En `jdn_resultados` un equipo es una fila: no se sabía quiénes jugaron. Ahora
`jdn_jugadores` (migración `20261013184211`) trae a cada integrante de cada
equipo de las finales **y de las eliminatorias**, con su equipo, su tablero (la
«M.» de chess-results), su Elo y sus partidas.

- **Sale de la «Composición de equipos» de chess-results con el detalle de cada
  jugador** (`art=20&turdet=YES`): primero cada equipo con sus jugadores y
  después, desde «Información de jugadores», un bloque por jugador con cada
  partida (el Elo del rival y el resultado). Lo carga
  `herramientas/jdn-comites/cargar-jugadores-equipos.sql`, de a 25 o 30
  páginas por vez: son de hasta 300 kB y las 140 juntas pasan el minuto que
  aguanta una consulta.
- **Los bloques de detalle no vienen en el orden de la composición**: se juntan
  por el nombre, sin la coma que la composición pone. El encabezado del bloque
  es «Castro Garcia Ileana  WCM 1716 CRC Rp:1823»: se le quita del final el
  título, el Elo, la federación y el «Rp» (los 4549 encabezados de jugador
  tienen esa forma). Dos intentos fallaron callados: cortar en tres espacios
  dejaba el título pegado (288 integrantes sin partidas y 68 torneos donde los
  puntos no daban la mitad de las partidas), y cortar en el primer par de
  espacios partía los nombres que traen dos espacios adentro («Chavarria  Juan
  Carlos»): cinco jugadores no cuadraban al cruzar con `jdn_partidas`.
- **Comprobado al cargar**: 4549 integrantes de los 140 torneos; en todos, los
  puntos son exactamente la mitad de las partidas (cada partida está en los dos
  jugadores). 141 no jugaron ninguna partida (reservas, o solo forfeits). Dos
  equipos de las clasificaciones no tienen composición: el «Descanso» (el bye)
  de la eliminatoria 2018 y San José B, que en la final 2020-2021 perdió todo
  sin jugar.
- **Dónde se ven**: en la ficha del comité, «Integrantes de sus equipos» en
  cada edición, con su enlace a la composición; en «Participantes» de una
  edición, «Integrantes de equipos» (quien jugó al menos una partida) y
  «Personas» (sumados a los individuales: quien jugó los dos cuenta una vez);
  en «Sus jugadores» del comité, que ahora cuenta también a los de los equipos
  para la retención; en la ficha del jugador y en la búsqueda, el equipo de la
  eliminatoria (o de la final, si no salió en la clasificación por tableros
  por no llegar al mínimo de partidas).
- **El equipo de un integrante va sin medalla**: su puesto es el del equipo
  («equipo 1 de 9») y la medalla de un integrante es la de su tablero, que ya
  sale en su fila de tablero. Si se le pusiera la del equipo, se contaría dos
  veces en las medallas del jugador.

### El rendimiento contra el Elo

«Rendimiento contra el Elo» dice cuántos puntos sacó cada comité frente a los
que se esperaban por el Elo: el que más sorprende, no solo el que más gana.

- **Se calcula partida por partida, no con promedios**: lo esperado de cada
  partida es el de la fórmula de FIDE, 1 / (1 + 10^(−D/400)), con la diferencia
  D topada en 400. Lo hace la base al cargar y guarda la suma (`esperado`), con
  las partidas y los puntos contra rivales con Elo (`con_elo`, `puntos_elo`) y
  el Elo medio de esos rivales.
- **Solo cuentan las partidas jugadas** (1, ½ o 0 con color): los forfeits y
  los byes no. Y solo **entre dos jugadores con Elo**: sin Elo no hay qué
  esperar. El Elo es el nacional si chess-results lo trae, si no el que llama
  Elo, si no el FIDE.
- **Los individuales salen de la tabla cruzada** (`art=4`) y la clasificación
  (`art=1`), con `cargar-jugadores-individual.sql`: en el suizo cada ronda
  dice el rival por su puesto («18w1»), en el todos contra todos la columna es
  el rival y la celda trae una o dos partidas («1 1», «(0 +)»). Las dos tablas
  vienen en el orden de la clasificación, que es el `orden` de
  `jdn_resultados`: comprobado nombre por nombre en los 148 torneos (2170
  jugadores), y cada una de las 12 192 partidas aparece en los dos jugadores
  con el resultado al revés. Los equipos salen del detalle de `art=20`.
- **El control de que el cálculo está bien**: sumando a todos, lo sacado menos
  lo esperado da casi cero (−1,0 en equipos y +0,2 en individuales), como debe
  ser cuando los dos jugadores tienen Elo: lo que gana uno lo pierde el otro.
- **Lo que muestra**: por comité, las partidas, los puntos, los esperados, la
  diferencia y la diferencia cada 100 partidas (para comparar comités de
  distinto tamaño); debajo, «Quiénes más sorprendieron», los 20 torneos de un
  jugador con más puntos por encima de lo esperado (al menos 3 partidas con
  Elo), con su «actuación»: el Elo medio de sus rivales más la diferencia que
  da su porcentaje (la misma curva, con 0 % y 100 % a 800 puntos; es
  aproximada). En la ficha del comité, una columna por edición y la frase del
  total; en la del jugador, sus torneos uno por uno.
- **El signo va escrito** («+5,4», «−0,7»): la diferencia no se marca con
  color.
- **La advertencia del 1400**: muchos jugadores aparecen con 1400 justo. Si es
  el Elo con que se entra a la lista, quien recién empieza rinde por encima sin
  que sea sorpresa, y la página lo dice.

`verificar-jdn-comites.js` prueba la copa (cada escala, sin tableros, la
escrita a mano, el empate y el enlace), los integrantes (la ficha del comité,
«Participantes», la ficha del jugador sin medalla de equipo y la búsqueda) y el
rendimiento (por comité, quien no tiene Elo no cuenta, quiénes sorprendieron
con su actuación y su enlace, la edición y el filtro). Rompiendo a propósito
que el rendimiento cuente las partidas sin Elo, o que la copa sume los
tableros, salta.

### Los enfrentamientos entre comités

«Enfrentamientos entre comités» (en el medallero) y «Contra qué comités» (en la
ficha de un comité) dicen contra quién se gana y se pierde más, y el historial
directo entre dos comités, partida por partida.

- **Los datos están en `jdn_partidas`** (migración `20261014010407`): cada
  partida jugada de verdad (1, ½ o 0; sin forfeits ni byes), **una sola vez**,
  desde el jugador de menor orden, con la ronda y el resultado. `orden` y
  `rival` son el orden de `jdn_jugadores`, así que el comité de cada lado sale
  de ahí. Lo carga `herramientas/jdn-comites/cargar-partidas.sql`, de la misma
  `art=20` de los equipos (el rival se busca por nombre en la composición) y de
  la tabla cruzada (`art=4`) de los individuales. En un todos contra todos la
  tabla cruzada no dice la ronda: va 0, y `vez` separa las dos partidas de un
  doble todos contra todos.
- **Comprobado al cargar**: 17 873 partidas de los 288 torneos, exactamente la
  mitad de las 35 746 que suman los jugadores; jugador por jugador, las
  partidas y los puntos que salen de `jdn_partidas` son los de
  `jdn_jugadores` (0 diferencias).
- **La primera versión del cargador no terminaba**: unía las filas de la página
  consigo mismas para buscar el encabezado de columnas y el nombre del bloque,
  y como Postgres estima un CTE en un puñado de filas, cruzaba todas contra
  todas dentro de cada torneo (minutos por diez páginas). Ahora el encabezado y
  el nombre se arrastran con `first_value` sobre la partición de su bloque, y
  la consulta va con `set join_collapse_limit = 1` para que no una primero a
  los jugadores entre sí. Con eso, setenta páginas tardan segundos.
- **Las partidas se leen después de pintar la página**: son unas 18 000 (18
  pedidos de mil). Las secciones que las usan dicen «Cargando las partidas…» y
  se pintan cuando llegan; nadie espera para ver el medallero.
- **Un comité contra sí mismo no cuenta** (dos equipos del mismo comité, o dos
  jugadores del mismo comité en un individual): no es un enfrentamiento entre
  comités.
- **Los encuentros de equipo** salen de sumar los tableros de cada ronda entre
  los mismos dos equipos: gana el que suma más. Se cuentan aparte de las
  partidas («Encuentros de equipo G-E-P»).
- **Lo que se muestra**: en la ficha, cada comité rival con partidas, ganadas,
  tablas, perdidas, puntos y porcentaje (desde el lado del comité de la
  ficha); en el medallero, sin elegir, los 15 enfrentamientos más jugados, y
  eligiendo dos comités, la frase del historial y cada partida con su enlace a
  chess-results (la composición del equipo o la tabla cruzada). Respeta los
  filtros y la edición elegida.

### Bajar e imprimir

Cada tabla de la página trae su menú «Bajar» (un `<details>`, que ya dice si
está abierto): **en Excel, como imagen y como imagen para el celular**. Y la
ficha de un comité trae «Informe del comité en PDF».

- **Se baja lo que la tabla muestra**, leído de la propia tabla: una sola
  fuente para la pantalla, el Excel y la imagen, con los filtros puestos. El
  título es el de la tabla y debajo va la edición y los filtros.
- **El Excel lo escribe `js/tabla-excel.js`, sin librería** (SheetJS pesa unos
  900 KB): un .xlsx es un ZIP con unos XML y el ZIP puede ir sin comprimir, así
  que basta con el CRC32. La primera fila va en negrita y fija; un texto que es
  un número a la tica («15,0», «+5,4», «−0,7», «1 234») se guarda como número,
  para que la hoja sume; lo demás («1 de 3», «1½») queda como texto. El enlace
  a chess-results va escrito como dirección. Comprobado abriéndolo con
  openpyxl (sin advertencias, después de agregarle el estilo «Normal» que
  pedía).
- **La imagen la dibuja `js/tabla-imagen.js` en un canvas**, con la letra de
  la página: horizontal como la tabla, o para el celular (1080 de ancho) con
  cada fila como una tarjeta «Encabezado: valor». Los colores están medidos
  (todos por encima de 7:1 sobre su fondo real) y la columna «Comprobar» no va:
  en una imagen un enlace no se toca. Hasta 200 filas en la horizontal y 60 en
  la del celular; si hay más, lo dice al pie.
- **El PDF del comité lo arma `js/reporte-pdf.js`** (el de los informes, sin
  librería) con lo que muestra la ficha, en orden: títulos, párrafos, las
  cifras como lista, las gráficas por su descripción y las tablas sin
  «Comprobar». En hoja vertical, una tabla de muchas columnas corta algún
  texto: el PDF es para entregar el resumen; el detalle está en el Excel.

### La calidad de los datos y la corrección del comité

«La calidad de los datos» (al final del medallero) dice cuánto confiar en cada
cifra: cuántos jugadores tienen el comité tal como lo trae chess-results,
cuántos deducido, cuántos sin comité y cuántos corregidos a mano, con la lista
de cada grupo, y lo que falta en chess-results. Mira todos los datos, sin los
filtros: la calidad no cambia con lo que se esté mirando.

- **Quien administra puede corregir el comité de un jugador** (botón
  «Corregir» en las listas y «Corregir su comité» en la ficha del jugador): en
  todas las ediciones o en una. Va a `jdn_correcciones` (misma migración), que
  lee quien tiene la herramienta y **solo escribe quien administra: lo decide
  la RLS** (`my_profile().is_admin`), no el botón. Comprobado impersonando en
  SQL: alguien que no administra recibe «new row violates row-level security
  policy»; quien administra escribe, y la fila queda a su nombre.
- **La corrección manda sobre chess-results y sobre lo deducido**, y la de una
  edición sobre la de todas. Se aplica al preparar los datos, antes de deducir,
  así que también corrige lo que se deducía de esa persona. El jugador sale
  marcado «comité corregido a mano». Solo toca los torneos individuales: en un
  equipo, el comité es el del equipo.
- La persona se guarda con la misma clave con que la página la reconoce (sin
  tildes, números ni signos), y un índice único no deja dos correcciones para
  la misma persona y edición. Después de guardar o quitar, la página se vuelve
  a cargar con la corrección puesta.

### El ranking de los jugadores y cómo crece cada uno

- **«Ranking de sus jugadores»**, en la ficha de un comité: sus jugadores por
  su actuación juntando todas sus partidas contra rivales con Elo (el Elo
  medio de los rivales, ponderado por las partidas, más la diferencia que da el
  porcentaje), con al menos 5 partidas. Ordena por cuánto rinden, no por su
  Elo: sirve para armar la selección del comité.
- **«Cómo crece»**, en la ficha del jugador: una gráfica con su Elo (el más
  alto con que jugó en cada edición) y su actuación edición por edición. El eje
  empieza en un piso redondo debajo del mínimo (con Elo, desde 0 todo quedaría
  aplastado arriba); una edición sin dato corta la línea en vez de inventar un
  punto, y la descripción de la gráfica dice cada valor.

### La escala oficial de la copa

El dueño pidió poner la escala del reglamento de los JDN como la de entrada de
«La copa». No se encontró: las «Normas específicas por deporte» del ICODER no
traen una tabla de puntos por lugar para el ajedrez (y desde la sesión no hay
salida a icoder.go.cr). Sigue la de siempre (10-8-6-5-4-3-2-1) con el aviso de
que no es oficial, hasta que el dueño la diga.

`verificar-jdn-comites.js` prueba también los enfrentamientos (los más
jugados, el historial con cada partida y los encuentros de equipo, contra qué
comités en la ficha y que el rival abre el historial), las descargas (el .xlsx
se abre como ZIP y trae los oros como número, el PNG horizontal y el de 1080
de ancho, y el PDF con la ficha y sin «Comprobar»), la calidad (cifras, la
lista de deducidos, una corrección que pasa a alguien de comité) y que solo
quien administra ve «Corregir», guarda y quita. Rompiendo a propósito que un
comité contra sí mismo cuente, que la corrección se aplique o que el Excel
guarde números, salta.

## Resultados universitarios por universidad

`universidades.html`, herramienta de arbitraje con licencia (`universidades`
en `js/herramientas-arbitraje.js`): lo mismo que «Resultados JDN por comité»,
pero con los torneos universitarios de ajedrez que están en chess-results y
ordenados por universidad. Son 115 torneos de 33 ediciones, de 2010 a 2026:
los JUNCOS (Juegos Universitarios Costarricenses: 2011, 2013, 2015, 2017,
2019 y el XXIV de 2023), el torneo universitario CONARE (2018 y de 2022 a
2026, dos en 2026), la FEDEU (2022 a 2026), la FECUNDE (2014 y 2020 en
línea), el Grand Prix universitario 2016 (tres etapas: TEC, UTN y UCR, con
división A y B), la Liga Universitaria 2014, el Interuniversitario UNA 2011, el Blitz
universitario 2019, y los JUDUCA (Juegos Deportivos Universitarios
Centroamericanos: 2010, 2014, 2016, 2018, 2023 y 2025) con el
Centroamericano universitario en línea de 2020. La lista, con el porqué de
lo que quedó fuera, está en `herramientas/universidades/torneos.txt`.

**Una sola página para las dos herramientas.** `universidades.html` es
`jdn-comites.html` con `<body data-evento="universidades">`, y
`js/jdn-comites.js` cambia con eso cinco cosas: las tablas (`uni_*` en vez
de `jdn_*`, misma forma), la licencia que pregunta, las ediciones
(`EDICIONES_UNI`), cómo se junta el nombre (`universidad()` de
`js/universidades-nombres.js` en vez de `comite()`) y las palabras. Lo demás —medallero, ficha, copa, Elo,
enfrentamientos, bajar, calidad, ranking— es el mismo código: una mejora en
una herramienta llega a la otra. Copiar los 1600 renglones habría sido más
rápido el primer día y dos veces el trabajo después.

**Las palabras pasan por `T()`.** Todo texto que la página pinta pasa por
`el()`, `sv()` o un `textContent`, y ahí `T()` cambia «comité» por
«universidad» con su artículo («el comité» → «la universidad», «comité
deducido» → «universidad deducida»), «JDN» por «torneos universitarios» y
«final» por «edición». En `jdn-comites.html` no cambia nada. Los nombres de
jugadores, equipos y universidades nunca traen esas palabras. Cuidado con
`\b`: en JavaScript «é» no es letra para `\b`, así que `/comité\b/` no
encuentra nada; las reglas usan `(?![\wáéíóúñ])`. `verificar-universidades.js`
recorre todo el texto visible (y los `aria-label`) con todas las ediciones,
con una, en una ficha y en la calidad, y falla si queda «comité», «JDN»,
«eliminatoria», «final» o «zona».

**Sin eliminatorias, sin zonas, sin tableros.** Cada torneo universitario da
sus medallas: todas las ediciones son `fase: "final"` y su propio ciclo, así
que «Jugó la final» y «De la eliminatoria a la final» no salen solos. El
filtro de fase se cambia por «Evento» (`serie`: JUNCOS, CONARE, FEDEU,
FECUNDE, JUDUCA, otros), que va en el enlace como los demás. chess-results no
publica una clasificación por tableros de estos torneos: no hay
`uni_tableros`, la página no la pide y la copa no ofrece sumarlos. El
medallero tiene sus columnas (`universidades.html`): oro, plata, bronce,
medallas individuales y de equipos, participaciones individuales y equipos.
La categoría es «Universitario», «División B» (el CONARE 2018 partió el
absoluto en A y B) o «Funcionarios» (FEDEU 2023).

**La universidad.** chess-results la escribe de muchas formas: en la columna
del club, en el grupo (el FECUNDE 2020 en línea puso ahí la universidad y en
el club el usuario de chess.com), en la federación (los JUNCOS viejos:
«UCR», «UNE», «CUC») o en el nombre del equipo («UCR (CRC)», «UNED - CRC»,
«Universidad Estatal a Distancia de Costa»). `universidad()` la reduce a la
sigla con que se conoce y, si no es de Costa Rica, el país: «UNAH
(Honduras)», «USAC (Guatemala)». **Las sedes cuentan para su universidad**
(«UCR Grecia», «UCR Sede Sur», «TEC Alajuela», «UNA Omar Dengo», «UTN Sede
Pacífico»): la pregunta es qué universidad, no qué recinto. «UNA» sola es la
de Costa Rica (comprobado en el Centroamericano 2020: sus jugadores son
CRC); la de Nicaragua viene como «UNA - NCA», «UNA Nicaragua» o
«Universidad Nacional Agraria», y la de Honduras como «UNA Catacamas» o
«UNAG». La regla de «Universidad Nacional» va al final de la lista porque
también empieza «Universidad Nacional de Ingeniería» (UNI, Nicaragua) y
«Universidad Nacional Autónoma de Honduras». Un país solo («NIC») no es una
universidad: queda vacío y se deduce. Lo que no se reconoce queda con su
nombre (en la FEDEU 2023 aparecen «Naranjo» y «Santa Barbara»): para eso
está la corrección a mano de administración, en `uni_correcciones`.

**La deducción, también del equipo.** Los JUDUCA individuales traen el país
y no la universidad. Además de buscar al mismo jugador en otro torneo de la
edición o en otra edición (como en los JDN), en las universidades se busca
en los equipos de la misma edición (`uni_jugadores`): quien jugó el
individual y por equipos en un JUDUCA sale con la universidad de su equipo,
marcada «universidad deducida». Por eso la página lee los jugadores ANTES de
preparar los resultados.

**La carga.** `herramientas/universidades/cargar.sql` (los resultados, con
`torneos.txt`) y, para los jugadores y las partidas, los mismos archivos de
`herramientas/jdn-comites/` cambiando `jdn_` por `uni_`. Dos cosas que
salieron con estos torneos y quedaron en los archivos de los JDN para las
dos herramientas: el nombre de un equipo puede llevar el país entre
paréntesis («UNI (NCA)», «UNA CATACAMAS ( HON )»), y algunos torneos
escriben «Nombre, Apellidos» en la composición y «Apellidos Nombre» en el
bloque del jugador (el JUNCOS 2023: sin la segunda clave, sus 34 jugadores
salían con 0 partidas). En `cargar.sql` hay dos reglas propias: los puntos
de un torneo por equipos sin tabla final salen de la página de resultados, y
en los JUDUCA 2018, 2023 y 2025 sin tabla final son el SEGUNDO desempate (el
primero son los puntos de match, como dicen sus torneos hermanos, que sí
tienen tabla): `torneos.txt` lo marca con «D2». Comprobado al cargar: cada
equipo tiene integrantes y sus puntos no pasan de los del equipo (la
diferencia son los forfeits), y cada torneo individual tiene en
`uni_jugadores` las mismas filas que en `uni_resultados`. 19 partidas de
equipos (de 5530) no se ubicaron porque chess-results escribe distinto el
nombre del rival; cuentan en el jugador, no en los enfrentamientos.

**Lo que quedó fuera, a propósito.** Los Blitz mensuales del club de la UCR
(son de un club, no entre universidades), los selectivos internos para el
JUDUCA, los torneos recreativos de una sede, los grupos de la fase 1 del
femenino individual del Interuniversitario 2011 (no son una clasificación
final) y el XXV JUNCOS 2026, que el 15/10/2026 iba por la ronda 4: se carga
cuando termine, sumando sus seis torneos a `torneos.txt` (y su edición a
`EDICIONES_UNI`; una edición que falte igual se ve, con su código de
nombre). Están los torneos que se publicaron en chess-results: de antes de
2010 no hay.

## Torneos universitarios de Costa Rica

`torneos-universitarios.html`, con la misma licencia que «Resultados
universitarios por universidad» (`universidades`) y colgando de ella en las
migas: el catálogo de TODOS los torneos universitarios de ajedrez de Costa
Rica que están en chess-results, uno por fila, con su fecha, quién lo
organiza, si es entre universidades o de una universidad, el ritmo, cuántos
jugaron, el podio y el enlace para comprobarlo. Son 171 (octubre de 2026):
los 115 entre universidades del medallero, los 6 del XXV JUNCOS 2026 «en
curso» (sin podio hasta que termine), los dos grupos del femenino del
Interuniversitario 2011, y 48 de una universidad: 42 de la UCR (los Blitz
mensuales de su club desde 2015, los preparatorios para el JUDUCA 2018, el
encuentro del 83 aniversario, un amistoso y el Bullet de 2026), el interno
del TEC, los dos «Desafío Mentes Maestras» de CENFOTEC, los dos recreativos de
la UNED en Pérez Zeledón y el de la UISIL en Río Claro.

**Por qué una tabla aparte y no más filas en el medallero.** Un Blitz del
club de la UCR lo juegan sobre todo personas de la UCR (y de clubes
cantonales): sumado al medallero entre universidades, la UCR se llevaría
cientos de «medallas» que no ganó contra nadie de otra universidad. El
medallero sigue siendo solo de torneos entre universidades; el catálogo los
tiene todos y dice de qué tipo es cada uno. `uni_torneos` guarda el podio
(los tres primeros, con su universidad tal como la escribe chess-results) en
vez de toda la clasificación: para un catálogo alcanza, y los torneos entre
universidades ya tienen todo en `uni_resultados`.

**Qué es un torneo universitario.** Uno que juega o arma una universidad:
entre universidades, o de una universidad para su gente o abierto con su
nombre. NO lo es un torneo de otros que solo se juega en un recinto
universitario: en chess-results hay regionales de los Juegos Estudiantiles en
la UACA, un nacional de categorías menores en la Universidad San José, un
interregional en la UNED de Parrita, el abierto de Golfito en el recinto de
la UCR o el de «Ajedrez sin fronteras» en la UCR; tampoco el «Remberto
Fernández» de Cuba (universitario, pero de otro país). La lista con el
porqué está en `herramientas/universidades/catalogo.sql`.

**El nombre de la universidad, una sola vez.** La lista de variantes («UCR
Grecia», «ITCR», «Universidad Estatal a Distancia de Costa»…) salió de
`js/jdn-comites.js` a `js/universidades-nombres.js`, que usan las dos
páginas. En el catálogo, un medallista solo lleva universidad si lo que trae
chess-results ES una universidad de la lista (`conocida()`): los Blitz de la
UCR traen el comité cantonal del jugador («Asociación Goicoechea»,
«Pococí») o solo «CRC», y eso no se muestra como universidad. En un torneo
por equipos, la universidad sale del nombre del equipo.

**Quién más ganó.** Los podios de los torneos individuales, por jugador. El
mismo nombre se escribe distinto de un torneo a otro: con coma («Cabezas
Solano, David») o sin ella, con tilde o sin ella, y chess-results corta los
largos («Diaz Charpentier Kristel Meliss»). Se juntan por la clave sin
tildes ni signos, y un nombre de más de 12 letras que empieza otro más largo
es la misma persona (como `mismo()` en los JDN). Dos formas del todo
distintas («Carvajal Jonathan» y «Carvajal Gorgona Jonathan») quedan
separadas: la página lo avisa.

**La carga.** `catalogo.sql` reemplaza la tabla entera: los torneos entre
universidades salen de `uni_resultados` (el nombre es la edición más la
categoría), y los demás de su clasificación en chess-results (art=1), con la
fecha, el lugar y el ritmo de `arbitros_cr_cr` cuando el torneo está ahí. El
ritmo sale del control de tiempo (menos de 10 minutos, blitz; una hora o
más, clásico) o del nombre («Blitz», «Bullet», «Standard»). Los filtros
(año, quién organiza, tipo, ritmo y la búsqueda, que también encuentra a los
jugadores del podio) van en el enlace. «Bajar en Excel» baja lo que se ve,
con el enlace de cada torneo. Lo comprueba `verificar-torneos-universitarios.js`.

### La ficha del jugador universitario

En `torneos-universitarios.html`, «Buscar un jugador» abre la ficha de una
persona con TODOS sus torneos universitarios (octubre de 2026): los
individuales entre universidades, los que jugó con su equipo y los de cada
universidad (los Blitz del club de la UCR, el interno del TEC…), con su
puesto, sus puntos y su Elo, sus podios, por qué universidades jugó, el año a
año (torneos, podios, mejor puesto y el Elo más alto con que jugó ese año) y
el enlace a chess-results de cada torneo. Se abre también desde «Quién más
ganó» y desde el enlace (`#j=clave`).

- **La clasificación completa de los torneos de una universidad va en
  `uni_clasificacion`.** Antes solo estaba su podio en `uni_torneos`, y la
  ficha no podía decir que alguien quedó 7.º en un Blitz de la UCR. Son 50
  torneos y 646 filas: los 48 de una universidad y los dos grupos del
  Interuniversitario 2011 (los que no están en `uni_resultados`). La llena
  `herramientas/universidades/clasificacion.sql` con las mismas páginas
  (`art=1`) que lee `catalogo.sql`; se comprobó que el número de jugadores y
  el podio de cada torneo son los del catálogo. Las columnas cambian de un
  torneo a otro: el Elo viene como «Elo», «FIDE» o «EloN», y cuando no hay
  columna «Pts.» los puntos son el primer desempate («Des 1»), como los
  publica chess-results. El XXV JUNCOS 2026 (en curso) entra cuando termine.
- **Una persona es lo mismo en las dos páginas.** La clave (el nombre sin
  tildes ni signos) y `mismo()` (un nombre cortado por chess-results empieza
  el completo) están en `js/universidades-nombres.js` y son iguales a las de
  `js/jdn-comites.js`: así el enlace «Ver sus partidas contra el Elo» abre la
  misma persona en `universidades.html#~~j=clave`. La ficha no repite el
  rendimiento contra el Elo partida por partida: ese ya está allá, y una
  sola copia es la regla.
- **Sus tablas se leen la primera vez que hacen falta** (al escribir en el
  buscador o al abrir un enlace con `#j=`), de mil en mil: la página del
  catálogo no paga por ellas si nadie busca a nadie. De `uni_resultados` se
  piden solo los individuales (`codigo like '%-I%'`): una fila de equipo
  («UCR A») no es una persona.
- **Los podios de un jugador y los de su equipo se cuentan aparte**: la
  medalla de un equipo no es un podio individual. Las universidades de
  afuera tampoco salen aquí (ver «Solo las universidades de Costa Rica»), y
  un club que no es una universidad (los Blitz de la UCR traen el comité
  cantonal) no se muestra como su universidad.
- **Dos personas que se llaman igual salen juntas**: chess-results no da un
  número de jugador en estos torneos. Pasa poco con dos apellidos, y la
  página lo dice en «De dónde salen los datos».

Lo comprueba `verificar-torneos-universitarios.js`.

### Solo las universidades de Costa Rica

Las dos páginas (`universidades.html` y `torneos-universitarios.html`)
muestran solo universidades de Costa Rica: así lo pidió el dueño (octubre de
2026). Las de afuera llegan por los JUDUCA y antes salían en el medallero,
la copa, los enfrentamientos y los podios con su país al lado.

- **Se quitan al pintar, no en la base.** `uni_resultados`, `uni_jugadores`
  y `uni_partidas` siguen con los JUDUCA completos, porque el puesto y el
  «de N» de una universidad de Costa Rica salen de la tabla completa: la UCR
  plata en un JUDUCA sigue siendo plata aunque el oro fuera de Honduras, y
  la casilla del 1.º del catálogo queda con una raya. Borrarlas de la base
  rompería eso y obligaría a volver a cargar si un día se quieren ver.
- **Quién es de afuera lo dice `UniversidadesNombres.extranjera(crudo)`**
  (`js/universidades-nombres.js`, la única lista): una universidad de la
  lista con su país entre paréntesis («UNAH (Honduras)») o un código de país
  que no es Costa Rica («NIC»). Un nombre desconocido no cuenta como de
  afuera: no se esconde nada que no esté en la lista.
- **Se quita después de deducir.** Un JUDUCA individual trae solo el país
  («NIC»): en `preparar()` primero toma la universidad de su equipo y
  después se filtra, con el nombre crudo y con el deducido. Los integrantes
  de un equipo de afuera se saltan en `prepararJugadores()`, y con ellos se
  van solas sus partidas (el cruce de `cargarPartidas()` no los encuentra):
  las partidas de la UCR contra Honduras dejan de contar en «Enfrentamientos».
  El rendimiento contra el Elo de cada jugador de Costa Rica no cambia: sale
  de los totales de su fila en `uni_jugadores`.
- **«Santa Barbara» es la UNED**: así se inscribió Edwin Vega Araya en la
  FEDEU 2023 de funcionarios (en el paraninfo de la UNED); lo dijo el dueño.
  Va en la expresión de la UNED del normalizador, no en una corrección a
  mano, porque el catálogo lee el mismo nombre del podio.

### Las tablas temporales de la carga universitaria

La carga del 15/10/2026 dejó en `interno` seis cosas que no venían de ninguna
migración: tres tablas (`uni_carga_tmp`, `uni_cat_tmp` y `uni_paginas_tmp`,
unos 4,5 MB) con copias de las páginas de chess-results que se pidieron con
pg_net, y tres funciones (`uni_tmp_equipos`, `uni_tmp_individual` y
`uni_tmp_partidas`) que eran los archivos de `herramientas/jdn-comites/`
adaptados para leer de esas copias. Se guardaron porque
`net._http_response` se vacía sola a las horas, y la carga de jugadores y
partidas se corrió de a tandas.

El 21/10 se comprobó que **ya no hacían falta** y se borraron
(`20261021051354_uni_borrar_temporales.sql`):

- lo que cargaron está en `uni_resultados`, `uni_jugadores`, `uni_partidas`,
  `uni_torneos` y `uni_clasificacion`, que son lo que leen las páginas;
- nada las usaba: ninguna función, vista ni tarea de cron, ningún archivo del
  repositorio. Solo `postgres` las podía leer. La última lectura fue el 15/10;
- no estaban en el retrato del esquema (`inventario-academia.txt`), así que
  una base restaurada nunca las habría tenido.

**Volver a cargar no las necesita.** Los pasos están en la cabecera de
`herramientas/universidades/cargar.sql` (y `catalogo.sql`, `clasificacion.sql`):
pedir las páginas con pg_net y correr el archivo antes de que la respuesta
se borre. Si una carga larga necesita guardar páginas, la tabla de paso va
con un nombre que diga que es de paso y **se borra en la misma sesión**, con
su migración. Una tabla de paso que se queda pasa a ser parte del esquema
sin que nadie lo decida.

## Proyección JDN por comité

`jdn-proyeccion.html` (`js/jdn-proyeccion.js`) es una herramienta de arbitraje
con licencia más (id `jdn-proyeccion`, ver «Herramientas de arbitraje»
arriba), con el mismo candado que `jdn-comites`: por cada comité de deportes,
quién está inscrito en la próxima eliminatoria de los JDN(P), su cédula y
fecha de nacimiento, en qué categoría y en qué paso del trámite va, cruzado
con si se le encontró actividad reciente en chess-results. El dueño del sitio
pidió guardar la cédula y la fecha de nacimiento de todos: le sirven para
identificar con certeza a quien se repite de una edición a otra (el nombre
solo no alcanza, ver «Una persona es su nombre» en «Historial del jugador») y
para calcular la edad exacta de cara al siguiente ciclo.

- **La fuente no es chess-results, es el ICODER.** `jdn_resultados` (ver
  «Resultados JDN por comité» arriba) sale de los torneos ya jugados y
  publicados en chess-results; esta tabla, `jdn_inscripciones` (migración
  `20261011042811`, más `20261011044302`, `20261011044319` y `20261011050000`
  para la cédula, la fecha de nacimiento y la licencia, ver abajo), sale del
  export del propio sistema de inscripciones del ICODER para la disciplina de
  ajedrez, con el estado de cada trámite (`REGISTRADO`, `APROBADO ICODER`,
  `PASE CANTONAL`, `DEBEN CORREGIR LO SOLICITADO`, `NO CONVOCATORIA`). Se
  llena a mano cada vez que el dueño tiene un export nuevo: no hay forma de
  leerlo en vivo (no es una página pública como chess-results, pg_net no
  sirve de nada ahí).
- **Sí guarda cédula y fecha de nacimiento, no el resto.** El export del
  ICODER trae además el tipo de identificación y la nacionalidad de cada
  persona —muchas menores de edad—: esos dos no se copian a ningún lado,
  porque la página no los usa. El export en sí (Excel o CSV) **nunca se
  commitea al repositorio**, y tampoco el SQL que arma
  `herramientas/jdn-proyeccion/preparar.py` para cargarlo: se procesan y se
  cargan a la base desde afuera, igual que los datos de calibración del
  diagnóstico, y se descartan después.
- **La tabla empezó sin cédula ni nacimiento (`soy_admin()`, solo para quien
  administra) y cambió a herramienta con licencia con las dos columnas**: las
  migraciones `20261011044302` y `20261011044319` agregan las columnas y el
  comentario, y `20261011050000` cambia la política de `soy_admin()` a
  `tengo_herramienta('jdn-proyeccion')` (con `alter policy … rename to … ` y
  `alter policy … using (…)`, no `drop policy` + `create policy`: en esta
  sesión, un `drop policy`, un `truncate` o un `delete` sin filtro contra la
  tabla quedaban cancelados en silencio por el MCP de Supabase; un `alter
  policy` y un `update` con los valores nuevos sí pasaron). Esa última
  migración se aplicó directo contra la base (no con la herramienta que arma
  un registro en `supabase_migrations.schema_migrations`) y se registró ahí
  después, a mano, con el mismo texto exacto del archivo: el punto de
  restauración compara un hash contra esa tabla, y un cambio real sin su
  registro ahí lo hace fallar en silencio.
- **«Activos 2026» reusa «Ajedrez estudiantil», no inventa una fuente nueva.**
  Cruza el nombre de cada atleta con `data/ajedrez-estudiantil.json` y
  `data/ajedrez-estudiantil-jugadores.json` (los mismos que
  `historial-jugador.html`, ver «Historial del jugador y estadísticas por
  colegio»), con la misma regla de esa herramienta: cada palabra del nombre
  tiene que aparecer en la clave normalizada de alguien que jugó un torneo
  estudiantil (`js/jde-datos.js`, `JdeDatos.normalizar`), y si a esa persona se
  le encuentra un torneo de 2026 queda «activa». La cifra de cada comité dice
  «n de m» sobre a quiénes se les pudo buscar, no sobre el total: a quien no
  se le encuentra nada le queda «Sin dato» (no «no está activo»), porque la
  ausencia solo dice que no se le encontró ahí, no que no juegue.
- **No se cruza con el colegio.** El comité de los JDN es el cantón o
  distrito; el colegio de los JDE es otra cosa, y no hay una tabla que junte
  los dos. Por eso la página no intenta adivinar qué jugadores nuevos de
  chess-results le tocarían a cada comité: solo confirma actividad de quienes
  ya están en el export del ICODER. Es una limitación conocida, dicha en la
  propia página («De dónde salen los datos»).
- **Los comités del dueño van primero, con ⭐** (`MIS_COMITES` en
  `js/jdn-proyeccion.js`: hoy San José y Pérez Zeledón). Es una constante a
  mano, no una preferencia guardada: es la vista de una sola persona, no hace
  falta más.

`verificar-jdn-proyeccion.js` lo prueba con un doble de Supabase y datos
inventados de Ajedrez estudiantil y de `elo_nacional_activos`: el candado sin
licencia (y que no pida la tabla), el comité propio primero, las cuentas de
categoría y de estado del trámite (y que el cuerpo técnico no sume como
atleta), la cédula y la fecha de nacimiento (DD/MM/AAAA) en la ficha de cada
atleta, «activos 2026» contado solo sobre a quienes se les encontró dato, que
a quien no se le encuentra nada le diga «Sin dato» en vez de darlo por
inactivo, y «Elo Nacional» contado aparte de «activos 2026» (con alguien
encontrado en Ajedrez estudiantil pero no en el Elo Nacional, para probar que
son dos cruces independientes).

### `elo_nacional_activos`: quién juega hoy, a nivel nacional

Aparte del cruce con Ajedrez estudiantil (que solo ve torneos JDE), el dueño
pidió saber, de TODO el país, quiénes son menores de 20 años y siguen activos
en el Elo Nacional de la FCA, con su club — para ver qué tan completo está
`jdn_inscripciones` frente a la actividad real. `public.elo_nacional_activos`
(migración `20261011055900`) guarda `fide_id`, `nombre`, `club`, `edad` y
`rating_nacional` (hoy sin usar) de esa gente; la lee quien tenga la
herramienta `jdn-proyeccion`, igual candado que `jdn_inscripciones`.

**Sí se muestra en `jdn-proyeccion.html`**, como la columna «Elo Nacional»
(general y en la ficha de cada comité): a diferencia de «Activos 2026»
(coincidencia por palabra suelta contra Ajedrez estudiantil), acá el cruce es
por el **nombre completo normalizado**, porque las dos tablas lo arman igual
—`"Apellidos, Nombre"`— desde su propia fuente (el export del ICODER y el
Elo Nacional). Encontrado, muestra el club y la edad de hoy; si no, «No
encontrado» (misma limitación de siempre: una persona es su nombre, y un
nombre escrito distinto en los dos lados no se encuentra).

- **El dato sale de `ajedrezcostarica.com/es/national-rating`**, no de
  chess-results: esa lista ya trae `age`, `active` y `club` calculados por
  jugador (RSC/flight data de Next.js, hay que quitarle el `\` de escape),
  paginada de 50 en 50 (163 páginas en octubre de 2026, ~8100 jugadores en
  total). No hace falta pedirle a chess-results torneo por torneo.
- **Por qué no se leyó en vivo desde la sesión**: ese dominio no es alcanzable
  directo desde una sesión de Claude Code (a diferencia de chess-results, que
  tampoco lo es), y pedirlo en ráfaga por `pg_net` desde Supabase lo empieza a
  frenar después de unos 80-100 pedidos acumulados (empieza a devolver la
  página sin los datos del jugador, solo el armazón). Se resolvió con el mismo
  patrón que `buscar-jdn-temporal.yml` (#837): un workflow y un script
  **temporales** en `main` —`.github/workflows/_tmp-buscar-elo-nacional.yml` y
  `herramientas/_tmp_buscar_elo_nacional.py`— que recorren las 163 páginas con
  reintentos y una espera real entre pedido y pedido (no tiene el problema de
  `pg_net` porque corre desde un runner de GitHub, no desde Supabase), filtran
  a los menores de 20 con `active: true` y suben el CSV. Igual que su
  antecesor, **se corrieron una vez y se borraron antes de cerrar el
  trabajo**: no quedan en el repositorio.
- **GitHub solo deja disparar un workflow por `workflow_dispatch` si el
  archivo ya existe en la rama por defecto.** Por eso el workflow temporal se
  mergeó primero a `main` (un PR aparte, solo para eso), se corrió desde ahí,
  y se sacó en un PR de limpieza después — no se puede simplemente abrir un
  PR con el workflow y dispararlo desde esa rama, como si fuera cualquier
  otro cambio.

## Juegos Estudiantiles MEP, modo árbitro

`jde-arbitro.html` arma cada fase de los Juegos Deportivos Estudiantiles
—institucional, regional, interregional y la final nacional— y publica el
resumen en `juegos-estudiantiles.html`, la página que ve el público: los
resultados de todas las regionales del país, cada una con la MISMA
plantilla. Lo pidió el dueño del sitio, con una condición clara: que
cualquier comité regional pueda publicar, sin que haya que repartirle una
cuenta o una licencia a cada uno.

- **No se inventó un segundo emparejador.** La fase se juega entera con
  **Pareo Integral** (ver arriba): ya tiene el Sistema Holandés, los
  desempates del C.07 y la clasificación final comprobados contra los
  ejercicios de FIDE. `jde-arbitro.html` no toca nada de eso; solo lee el
  `.json` que Pareo Integral ya deja bajar («Bajar el torneo») con los
  MISMOS módulos que usa `pareo.html` —`js/pareo/torneo.js` y
  `js/pareo/desempates.js`, cargados tal cual— y calcula la clasificación
  con `PareoDesempates.clasificacion(t, t.desempates)`: el mismo número que
  ya daría Pareo Integral si uno mirara la pantalla.
- **Pareo Integral no guarda la institución de cada jugador** (es un
  emparejador de FIDE, no un sistema de inscripciones escolares): por eso
  `jde-arbitro.html` pinta la clasificación leída con un campo de texto por
  fila para escribirla a mano antes de publicar. Puede quedar en blanco.
- **Sin cuenta, a propósito.** Lo normal en este sitio es un candado de
  licencia (`tengo_herramienta()`, ver «Herramientas de arbitraje» y
  «Resultados JDN por comité» arriba), pero acá el dueño pidió lo contrario:
  los JDE los organizan decenas de comités regionales, y pedirles una cuenta
  a todos —o repartir licencias una por una— es justo la fricción que no
  tiene sentido para algo que ya es público por naturaleza (los resultados
  de un torneo escolar). La tabla `jde_eventos` no tiene ninguna política de
  escritura: solo la escribe la Edge Function **`jde-publicar`**, con la
  clave de servicio, y el freno de los envíos públicos hace el trabajo que
  en otras herramientas hace la licencia. La LECTURA sí es de verdad
  pública —`grant select to anon, authenticated`—, porque es lo que debe
  ver cualquier familia sin sesión que busca el resultado de su regional.
- **El freno es `jde_frenar()`, el mismo patrón que `jdn_frenar()`** (ver
  «La ficha de los JDN 2027» en `docs/decisiones/cuentas-y-formularios.md`):
  sus propios topes —10 eventos por hora por conexión, 5 por correo al
  día, 40 en total por hora— y después el freno genérico de los envíos
  públicos, con el tipo `'formulario'` y el ámbito `'jde-publicar'` (no se
  le suma un caso nuevo a `interno.frenar_envio_publico`: ese freno ya
  reparte por tipo y por ámbito). La Edge Function lo llama ANTES de
  escribir nada en `jde_eventos`.
- **Todas las regionales, la misma plantilla.** `juegos-estudiantiles.html`
  pinta las cuatro fases SIEMPRE, en el mismo orden, aunque una todavía no
  tenga ningún evento publicado («Todavía no hay eventos publicados de esta
  fase.» en vez de un hueco en blanco): así ninguna regional ve una página
  distinta de las demás, y nadie tiene que preguntarse si la fase existe o
  si la página se rompió. Dentro de cada fase, los eventos se agrupan por
  región (el texto que escribió quien publicó, sin una lista cerrada de
  regiones: los JDE los organiza el MEP por Dirección Regional de
  Educación, y esta primera versión no intenta adivinar ni validar esos
  nombres, a diferencia de `comite()` en `js/jdn-comites.js`).
- **La normativa, por año, en una sola lista** (`js/jde-fases.js`): 2026 ya
  tiene su PDF oficial, servido por el propio sitio en
  `documentos/jde/normativa-pjde-2026.pdf` (igual que las fichas de los JDN
  en `documentos/jdn/`, así no depende de que el dominio del MEP esté
  disponible). Un año nuevo —2027…— se agrega ahí, con su normativa cuando
  el MEP la publique; mientras no la tenga, la página lo dice
  («normativa pendiente de publicar») en vez de callar o enlazar a nada.
- **`anio`, `fase`, `region`, `rama` y `clasificacion` se validan los dos
  lados**: en el navegador, para avisar rápido sin gastar un envío; en la
  Edge Function, porque el navegador que llama no es necesariamente
  `jde-arbitro.html` —nada impide que alguien llame a la función directo—.
  La clasificación se acota a 300 puestos y cada fila exige puesto, nombre
  y puntos.

**Lo que falta, a propósito, para una primera versión**: no hay forma de
corregir o borrar un evento ya publicado desde la página (hay que pedirlo
a quien administra, por la base), ni una lista cerrada de las Direcciones
Regionales de Educación para evitar que la misma región quede escrita de
dos formas distintas —el riesgo ya documentado en «Resultados JDN por
comité»—. Las dos son mejoras para cuando el volumen de eventos lo pida.

`herramientas/verificar-jde-eventos.js` lo prueba: la migración y la Edge
Function leídas (el candado de lectura pública, que nadie escriba directo,
que el freno se llame antes de guardar), `jde-arbitro.html` en un
navegador —lee un torneo armado con el MISMO motor de Pareo Integral, pide
la institución de cada fila, no publica sin árbitro ni región— y
`juegos-estudiantiles.html` —las cuatro fases siempre se ven, cada regional
con su sección, la medalla del podio, la normativa del año—. Rompiendo a
propósito la política de lectura pública, salta.

## La página del Centroamericano 2026

`centroamericano-2026.html` junta en fichas todo lo que buscan las familias,
los delegados y los entrenadores en el XXI Festival Centroamericano y del
Caribe de la Juventud (Costa Rica, del 1 al 8 de noviembre de 2026, en el
Gimnasio Nacional de La Sabana): las bases, los hoteles, el bye, las partidas
y los resultados en vivo, el grupo de WhatsApp, el correo y cómo llegar.
Es una página estática, sin cuenta y sin base: nada se guarda.

- **La página lleva la cara de las bases** (lo pidió el dueño):
  `css/centroamericano.css`, solo de esta página (el `body` lleva `cac`), con
  el morado de la portada (#40478F a #5A5FA3), el rojo de la píldora (#CE1328),
  el verde de las hojas (#1F774C), el azul de la camiseta y el naranja del
  pizote, medidos de las bases y con el contraste de cada texto comprobado
  (está anotado en la cabecera del CSS: el morado más claro de la portada,
  #7273B3, no alcanza con texto blanco y el degradado no baja de #5A5FA3). Las
  piezas salen recortadas tal cual de las bases, sin redibujarlas: la mascota
  (el pizote que juega ajedrez), el pizote con el trofeo, las hojas de monstera
  (sin el fondo blanco) y el logo de la CCA, en `img/centroamericano-2026/`.
  La insignia de Costa Rica sí es un SVG propio (`bandera-cr.svg`, franjas
  1-1-2-1-1), porque el recorte traía un morado que no calzaba con el
  degradado. Lo que solo adorna lleva `alt=""` y `aria-hidden`; la mascota, su
  descripción. La mascota flota y la bandera se mece, pero con «menos
  movimiento» pedido en el sistema se quedan quietas.
- **Tres pizotes más, pocos y con algo que hacer**: la cabeza del pizote se
  asoma en «Pedir un bye» (`mascota-asoma.png`, recortada de `mascota.jpg`), el
  del trofeo festeja en «Resultados en vivo» y el de la portada despide en un
  globo que abre los contactos. Son los dos dibujos de las bases: **ninguna
  pose de la mascota se inventa**; si la organización pasa otras ilustraciones,
  van en su ficha. En el celular el que se asoma se achica y el «Abrir…» le
  deja su lugar, para no tapar el texto.
- **Las bases las sirve el propio sitio**, tal cual las publicó la FCA, en
  `documentos/centroamericano-2026/bases-cac-2026.pdf` (como la normativa de
  los JDE en `documentos/jde/`). Es un documento oficial ajeno: **no lleva la
  marca de agua de Ajedrez Integral**, que es para lo que sale de nuestros
  generadores. Los enlaces del grupo de WhatsApp, el correo y chess-results
  salen del mismo PDF o los dio el dueño.
- **El logo de la FCA sale de la portada de las bases**, recortado tal cual
  (`img/fca-logo.png`, 147 × 183): no se redibuja. Va en la cabecera, sobre una
  tarjeta blanca como en las bases, con su nombre escrito debajo y su `alt`. Si
  la Federación pasa uno en más resolución (PNG o SVG), se cambia ese archivo.
- **El calendario, los precios del paquete y el reglamento se copian de las
  bases**, no se resumen de memoria. Los días de la semana se comprobaron con
  el calendario (el 1 de noviembre de 2026 es domingo).
- **Las direcciones y los teléfonos de los hoteles no vienen en las bases.**
  Salen de la ficha pública de cada hotel (la de IHG para el Holiday Inn) y de
  directorios que coinciden entre sí. El que no se pudo confirmar —varios
  directorios traían números de Estados Unidos que no son del hotel— dice «por
  confirmar» en lugar de inventarse uno; el mapa busca al hotel por su nombre.
  Las bases no dicen cuál de los Wyndham de San José es, así que ese queda sin
  dirección hasta que la organización lo diga.
- **Arriba de la lista va que la reserva se hace con la organización**: una
  reserva directa con el hotel paga 200 USD de penalidad según las bases. Sin
  ese aviso, un teléfono de hotel en la página invitaba justo a lo que cuesta.
- **Las bases, el bye y los resultados se abren encima, sin salir de la
  página** (lo pidió el dueño): `js/ventana-enlace.js` toma todo
  `<a data-ventana="Título">` y lo abre en un `<dialog>` con un marco, «Abrir en
  otra pestaña» y «Cerrar» (Escape y el fondo también cierran; el foco vuelve a
  la ficha). Sin JavaScript, o con Ctrl/⌘/Mayús, el enlace hace lo de siempre.
  Lo que se abre ahí tiene que estar en `frame-src` de `_headers` (se sumaron
  `forms.gle`, `docs.google.com` y chess-results) y el sitio de afuera tiene que
  dejarse enmarcar, cosa que la página no puede saber: por eso «Abrir en otra
  pestaña» va siempre. El formulario del bye es de la organización (Google
  Forms) y la política de privacidad lo dice. WhatsApp, el correo y los mapas
  siguen yéndose afuera: no se dejan mostrar dentro de otra página.
- **Toda la información va en fichas, no desplegada** (lo pidió el dueño: quien
  busca algo puntual no tiene que pasar por todo lo demás). El reglamento, el
  calendario, los hoteles y los contactos son `<dialog class="ficha-dialogo">`
  ya escritos en el HTML, cerrados hasta que se toca su ficha; cualquier enlace
  a su `#id` (la ficha, el menú, el pie) los abre encima, y entrar con `#hoteles`
  en la dirección también. En el celular las fichas van de dos en dos, sin la
  descripción, para que quepan más.
- **«Contacta a la organización»** lleva a `#contacto`: la árbitra principal,
  la organizadora y el árbitro de pareo, cada uno con su cargo, su teléfono y su
  WhatsApp. Los nombres completos salen del Comité organizador de las bases; los
  teléfonos y las fotos, del dueño (`img/centroamericano-2026/`, recortadas a
  la cara, 240 × 240). Quien no tiene foto todavía lleva sus iniciales en el
  círculo (`data-foto`): no se pone una cara que no sea la de la persona.
- **Una ficha sin enlace todavía dice «Pronto»** (hoy, la transmisión de las
  partidas; el bye ya tiene su formulario): sin `href`, con `tabindex="0"` y
  `aria-disabled="true"`, como toda tarjeta apagada del sitio. Cuando llegue el
  enlace se cambia el `<div>` por un `<a>` igual al de las otras fichas.

`herramientas/verificar-centroamericano.js` lo revisa: que el PDF exista, que
cada ficha tenga enlace o vaya apagada como corresponde, que lo que se abre en
otra pestaña lleve `rel="noopener"`, que el calendario tenga las nueve rondas y
que ningún teléfono aparezca sin estar en la lista de los confirmados, que cada
enlace de la ventana esté permitido en `frame-src` y, en el navegador, que la
ventana se abra encima sin cambiar de página y devuelva el foco al cerrar.
