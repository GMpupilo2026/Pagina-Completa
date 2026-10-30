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

## La jugada viaja por Broadcast, y las pre-jugadas

Lo que hace fluida una partida en lichess es que la jugada no pasa por la base:
viaja de un jugador al otro por una conexión abierta, y la base guarda después.
Aquí cada jugada era un `UPDATE` de `game_rooms` y llegaba al rival por
`postgres_changes`, que revisa la RLS de cada cambio para cada quien escucha,
en un solo hilo, con todas las partidas de la plataforma (ver «Lo que falta, y
es lo más grande» en `sitio-e-infraestructura.md`). Con la base tranquila son
unos 100 ms; cargada, segundos. Y no había pre-jugadas: en una partida rápida,
el tiempo de pensar la respuesta obvia más el de la red salía del reloj.

Va en **todas las modalidades de a dos con turno**: Estándar y Niebla
(`NieblaBoard`), Crazyhouse, Cartas y las seis de `variante.html` (Abrazos,
Camaleón, A ciegas —solo el canal rápido: se juega escribiendo—, Vampiro,
Volcanes y Misiones). Una sola copia de cada cosa: el canal rápido vive en
`js/sala-juego.js` y las pre-jugadas en `js/premovidas.js`; cada página solo
dice cómo rehacer con su motor la jugada que llega.

- **Duelo no lo lleva, a propósito**: ahí los dos juegan a la vez (no hay turno
  para una pre-jugada) y la jugada va escondida hasta que confirman los dos;
  avisarla por el canal sería revelarla.
- **Ajedrez para 4 no, por decisión del dueño (29/10/2026)**: ni canal
  rápido ni pre-jugadas. Usa otra tabla (`fourplayer_games`), otro tablero y
  otra política para el canal, y no se va a hacer: no es algo pendiente.

### El canal rápido: la jugada se ve antes de que la base la guarde

- **Quien mueve avisa la jugada por Broadcast antes de guardarla**
  (`vigilante.jugada(datos)`): cuántas jugadas lleva con esta (`n`), la
  posición de la que sale (`antes`), la hora del servidor en que movió
  (`desde`) y lo que cada página necesite para rehacerla (la jugada escrita y
  la posición de después; en Cartas, el estado entero). Va por el canal
  **privado** `sala-juego:<id de la sala>`, aparte del de `postgres_changes`:
  si no se puede abrir, el de siempre sigue igual.
- **Del otro lado no se cree nada que no se pueda comprobar**: tiene que ser la
  jugada siguiente, salir de la posición que se ve y la página la rehace con su
  motor (`rapida.jugar(sala, aviso)`): chess.js en Estándar y Niebla
  (`SalaJuego.rehacerConChess`), el de Crazyhouse (también la caída de una
  pieza, «N@f3»), y en Variante y Cartas se prueban las jugadas legales hasta
  dar con la que lleva exactamente a lo avisado (así sirve también lo que se
  juega escribiendo, que no trae casillas). El reloj lo calcula quien la
  recibe, con lo guardado y la hora `desde` acotada entre el último reloj de la
  base y ahora: el aviso no puede regalar tiempo.
- **Lo que llega por el canal no revela nada nuevo.** La fila de `game_rooms`
  (posición, jugadas, `cartas_state` con las dos manos) ya la recibe por
  `postgres_changes` la misma gente que escucha el canal; la niebla y la mano
  rival se tapan en la pantalla, y la misión de Misiones nunca va en la sala.
- **Se pinta como provisional** (`_provisional` en la sala) y **la base sigue
  mandando**. La fila guardada, cuando llega, la reemplaza aunque su hora sea
  un poco anterior (su reloj es el de verdad); una fila más vieja de la base se
  deja pasar mientras tanto (la jugada se está guardando). Si en **4 s** la
  base no la confirma, se vuelve a leer la sala y gana lo que diga la base: una
  jugada que no quedó, o un aviso inventado, desaparece sola. Sobre una
  provisional, Misiones no cobra (la posición todavía no está en la base).
- **Una jugada propia sobre una provisional espera a que la base tenga la del
  rival** antes de guardarse: se guarda «sobre la posición de la que salió»
  (`.eq("fen")`, ver «Las jugadas llegan siempre») y la base todavía no la
  tendría. Se avisa por el canal de una vez (el rival la ve igual) y se guarda
  cuando llega la fila. En Cartas, jugar una carta sobre una provisional espera
  lo mismo (`vigilante.esperarBase()`), y la jugada que sigue a una carta
  espera a que la carta quede guardada.
- **Antes de guardar, la jugada propia se rehace sobre la sala** con la misma
  función que la del rival, y tiene que dar la posición del tablero. Si el
  tablero y la sala se separaron, no se guarda: se vuelve a leer la sala. Sin
  esto, la base aceptaba una lista de jugadas de una con la posición de la otra
  (solo compara la posición de partida) y quedaba una partida que no se puede
  rejugar: lo encontró el CI, con escrituras rechazadas al azar.
- **Lo que separaba el tablero de la sala** era `releerSala()`: una jugada que
  no quedó vuelve a leer la sala, y si mientras esa lectura viaja ya salió otra
  jugada propia, lo leído llegaba viejo y recargaba el tablero a la fuerza,
  borrando de la pantalla la jugada que se estaba guardando. Ahora no recarga
  mientras otra jugada propia se guarda: esa, al terminar, deja todo al día.
  Pasaba también antes del canal rápido; los avisos que llegan antes lo hacían
  más probable.
- **Lo pensado se cuenta hasta el momento de mover** (`SalaJuego.pensado`), no
  hasta que llegó la fila del rival: esperar a la base no es tiempo de quien
  juega. Pero el trigger del reloj tolera solo 2 s entre lo que se cuenta y su
  propia hora, y de esos 2 s vive también la red: si se esperó más de medio
  segundo, se cuenta hasta ahora, como antes.
- **Una jugada rápida que llega mientras la propia se guarda** se aplica
  apenas termina de guardarse (`vigilante.despuesDeGuardar()`).

**Quién entra al canal lo decide la base** (migración
`20261029032128_sala_juego_canal_rapido`), con políticas en
`realtime.messages`, las primeras del proyecto (hasta ahora todos los canales
eran públicos, ver «El canal en vivo» de Pareo Integral):

- **Escuchar**: quien puede VER la sala, con la RLS de `game_rooms` tal cual
  (juega, es su profesor, administra, es compañero): la misma gente que ya la
  recibe por `postgres_changes`.
- **Mandar**: solo quien la JUEGA, y con la partida en juego.
- **`verificacion_en_dos_pasos`**, restrictiva, como toda tabla de Realtime.
- Un tema con basura no da error: el id se convierte a uuid solo si tiene forma
  de uuid.

Comprobado impersonando cada rol en una transacción revertida, antes de
aplicarla: blancas y negras escuchan y mandan; su profesor escucha y no manda;
alguien ajeno, nada; quien jugó una partida terminada escucha y no manda; un
tema inventado u otro prefijo, nada; y quien administra con dos pasos activos,
con `aal1` no escucha y con `aal2` sí. El retrato del esquema
(`herramientas/inventario-esquema.sql`) incluye desde ahora las políticas de
`realtime`.

### Las pre-jugadas

- **En el turno del rival se deja preparada la propia** (`premoves: true` en el
  tablero, que crea su `Premovidas.crear`): se elige la pieza y la casilla, con
  el toque o arrastrando, y se juega sola apenas llega la jugada del rival
  (`board.jugarPremovida()`, que la página llama cada vez que aplica una
  posición nueva). Una sola a la vez, como en lichess; tocar el tablero la
  quita.
- **Los destinos son los de la pieza en un tablero vacío** (también las dos
  capturas en diagonal del peón y los enroques; las piezas fundidas de Abrazos
  suman los de cada una): la jugada se decide sobre una posición que todavía no
  existe. Recapturar en una casilla donde hoy hay una pieza propia, por
  ejemplo, tiene que poder prepararse. **Si al llegar el turno ya no es legal,
  se descarta y se dice** («La pre-jugada e4 a d5 no se pudo hacer: ya no era
  legal.»).
- Solo de piezas del tablero: soltar una de la reserva (Crazyhouse) o jugar una
  carta (Cartas) se decide en el turno propio. En Misiones, si al llegar el
  turno la misión propia está cumplida, primero se cobra y la pre-jugada no
  sale. A ciegas se juega escribiendo y no lleva.
- **Coronar**: se elige la pieza al preparar la pre-jugada, con el mismo
  diálogo de cada página.
- **Se ve y se dice**: un borde punteado blanco con una línea casi negra por
  dentro (cada tema de tablero tiene sus colores, y contra cualquiera uno de
  los dos pasa de 3:1; medido en los 14 temas, el peor da 4,7:1), la casilla
  dice «sale la pre-jugada» / «llega la pre-jugada» (`data-estado`, que suma
  `js/tablero-accesible.js`, y en el nombre de la casilla cuando el tablero se
  nombra solo) y el estado de la página, «Pre-jugada lista: g1 a f3 (se juega
  sola; toca el tablero para quitarla)».
- Con el teclado (escribiendo la jugada) no hay pre-jugadas: `tryMove` sigue
  pidiendo que sea el turno propio.

### El retraso de la red no se cobra en el reloj

El reloj de quien recibe una jugada corre desde que la base la guardó
(`clock_updated_at`), pero esa persona la ve en su pantalla un rato después:
lo que tarda Realtime en avisarle, que con la base cargada son segundos. Ese
rato se le cobraba como si lo hubiera pensado. Lichess lo devuelve (lo que
llama *lag compensation*), con un tope.

- **`SalaJuego.suscribir` anota cuándo apareció en pantalla cada posición**
  (`vista`, con la hora del servidor), venga por la base o por el canal rápido,
  y `vigilante.jugada()` lo devuelve como `vistaEn`. La posición que ya estaba
  al abrir la página no cuenta (`en: null`): abrirla tarde no es retraso de la
  red.
- **`SalaJuego.pensado(sala, envio)` cuenta lo pensado desde ahí**: le resta
  lo que pasó entre que la base guardó la jugada del rival y que apareció en
  pantalla, **a lo sumo 1 s por jugada** (`RETRASO_MAXIMO_MS`). Si la jugada
  llegó antes de que la base la guardara (lo común con el canal rápido), no hay
  nada que devolver.
- **La base no puede saber cuándo vio cada uno la jugada**: lo dice el
  navegador. Por eso el tope, y el trigger (`proteger_reloj_de_partida`,
  migración `20261029130652_reloj_retraso_de_red`) deja pasar exactamente ese
  segundo de más (`retraso_maximo`) en el tiempo que se escribe al mover. Quien
  haga trampa desde la consola gana a lo sumo 1 s por jugada, además de los
  2 s de tolerancia de siempre. Comprobado en una transacción revertida: con
  el reloj corriendo hace 10 s sobre 60, la base aceptaba hasta 52 s y ahora
  hasta 53 s; 53,5 se sigue rechazando.
- **La bandera no cambia**: el segundo se abona solo al mover a tiempo y nunca
  salva de que caiga la bandera (el rival la canta, y la base la acepta, con la
  hora de la base, como siempre). Lichess hace lo mismo.
- Ajedrez para 4 no lo lleva, por decisión (ver arriba): su trigger y su
  página siguen como estaban.

Lo prueban `verificar-premovidas.js` (la cuenta, el tope, y `suscribir` con un
Supabase de mentira: la jugada del rival llega 0,6 s después de guardarse y el
reloj cobra los 3 s pensados, no 3,6; quitando la anotación o el tope, salta) y
`verificar-partidas-simultaneas.js`, cuyo trigger de mentira deja pasar el
mismo segundo: ningún reloj de una jugada que llegó a tiempo a la base queda
por encima del tope, y se imprime cuánto quedó cada reloj por encima de lo que
dice la base. Con la red mala, sin esto pasaban del tope 118 de 2000 jugadas
(entonces se rechazaban); con esto, ninguna de las que llegaron a tiempo
(devolviendo hasta 3 s, saltan miles).

**La escritura que tarda en llegar.** Si el pedido que guarda la jugada tarda
más de un segundo en llegar a la base (la red mala del doble lo hace con una
de cada diez, entre 0,8 y 2,5 s), la base cobra ese tiempo y el navegador no
lo puede saber: el reloj que manda queda por encima del margen. Hasta el
29/10 eso rechazaba la jugada entera (unas 17 de 2000 en la prueba); ahora la
base la guarda y recorta el reloj (ver la sección siguiente).

### El reloj de más se recorta, no se rechaza

Migración `20261029210004_reloj_recorta_y_sin_jugada_no_sube`.

- **Lo de más se recorta.** El paso (4) de `proteger_reloj_de_partida()`
  ya no lanza «Tiempo restante inválido»: deja el reloj en el tope (lo que le
  quedaba, más el incremento, los 2 s de tolerancia y el segundo del
  retraso) y guarda la jugada. Una escritura lenta ya no pierde la jugada, y
  quien haga trampa no gana nada nuevo: es el mismo tope.
- **Sin jugada, el reloj no sube.** Ese margen se daba en cualquier
  escritura: probado en una transacción revertida, escribiendo el reloj
  propio cinco veces seguidas desde la consola las blancas pasaban de 60 s a
  74,5 s. Ahora el margen se da solo si hay jugada —cambia `fen`,
  `cartas_state` o el compromiso del Duelo—; si no, el tope es lo que ya
  estaba guardado. Ninguna página sube el reloj sin mover: las demás
  escrituras son al crear la partida (INSERT) o la bandera, que lo baja a 0.
- **Lo que no cierra:** una jugada que no trae el reloj de quien mueve (o lo
  trae igual) no se descuenta: el trigger solo mira la columna que cambia. Ya
  pasaba antes. Cerrarlo pide saber de quién es el reloj que corre en cada
  escritura (en el Duelo corren los dos y `clock_updated_at` no se toca al
  confirmar), y eso es que la base calcule el reloj sola. Cerrado fuera del
  Duelo en «El reloj lo lleva la base».
- Ajedrez para 4 queda como estaba, por decisión.

Probado en producción en una transacción revertida: con el reloj corriendo
hace 10 s sobre 60, una jugada con 53,5 queda en 53 y se guarda; cinco
escrituras sin jugada con 2,9 s de más dejan 60; bajarlo a 55 pasa. Los
dobles de `verificar-partidas-simultaneas.js`,
`verificar-juegos-nuevos-en-vivo.js` y `verificar-torneo-jugado.js` recortan
igual; el primero cuenta aparte los recortes tras una escritura lenta y
falla si hubo que recortar uno que llegó a tiempo, y los otros dos fallan con
cualquier recorte (ninguna pantalla debería necesitarlo).

### La partida terminada se revisa con chess.js

La base acepta la posición que manda el navegador: desde la consola se puede
escribir cualquier tablero —un mate que no se jugó— y la partida termina con
ese resultado. Validar cada jugada en el servidor la frenaría (es justo lo
que el canal rápido quiso evitar); en cambio, **al terminar**, se revisa.
Migración `20261029234634_partida_terminada_se_revisa`.

- **La posición con que nació la sala, en la base.** `game_rooms.fen_inicial`
  la fija el trigger `fen_inicial_de_partida` al crearla y ningún `UPDATE` la
  cambia (comprobado impersonando: escribirle otra cosa la deja igual). Sin
  ella no hay de dónde rehacer una partida de la clase, que puede arrancar
  del tablero del profe. Las salas de antes quedaron en null salvo las que
  no tenían jugadas.
- **La Edge Function `partida-fin` revisa toda partida Estándar que termina**
  (también en tablas: `disparar_fin_de_partida()` ya no espera un ganador).
  `revision.ts`, una función pura sin Supabase ni Deno, rehace las jugadas
  con chess.js y dice lo primero que no cuadra: una jugada ilegal (cuál y en
  qué número), jugadas que no llevan a la posición guardada (se comparan las
  piezas y el turno: el enroque y el paso se escriben distinto según quién
  arma la FEN), un resultado contra el mate del tablero o un ganador en un
  ahogado. Una sala vieja, sin `fen_inicial`, se supone en la posición de
  siempre y, si las jugadas no calzan, **no se acusa**: pudo arrancar de
  otra (las 100 partidas Estándar terminadas que había se revisaron así, y
  los finales de práctica no saltan).
- **Lo que no cuadra queda en `partidas_revision`** y esa partida **no paga
  ni cobra el robo de puntos**. La tabla la escribe solo la función (clave
  de servicio; no hay política de escritura) y la leen quien administra y
  el profe de alguno de los dos jugadores (`soy_profesor_de_alguno`).
  `marcar_partida_revisada()` («Ya la revisé») pide el mismo permiso.
  Impersonando: el alumno no la ve ni la marca; su profe, sí.
- **En Competir**, la partida terminada que no cuadró dice «⚠️ Para revisar:»
  y el motivo, y trae «Ya la revisé». La lista de terminadas está cerrada
  por omisión: si hay alguna para revisar, el título lo dice («· 1 para
  revisar») y se abre sola. Los textos de cada motivo viven en
  `js/partida-revision.js`; lo que escribió un alumno (el nombre de la
  jugada) va por `textContent`. Contraste medido en los ocho temas: 5,8:1
  el peor en claro, 9,6:1 en oscuro.
- El robo de puntos también rehace la partida desde `fen_inicial` (antes,
  siempre desde la posición de siempre).
- Solo Estándar: las demás modalidades tienen sus propias reglas y chess.js
  no las sabe jugar.

Lo prueban `verificar-partida-revision.js` (la misma `revision.ts` que se
despliega, con partidas reales de la base y casos rotos a propósito; y que
cada motivo que puede devolver tenga su texto en la página; saltándose la
comprobación de legalidad, falla) y `verificar-profesor-juega.js` (la marca,
el título, «Ya la revisé» y que al alumno no se le pida).

### El rival que se va

Si el rival cerraba la página o se le caía la conexión, solo quedaba esperar a
que se le cayera la bandera: en una partida de 30 minutos, media hora mirando
un tablero quieto. Ahora, como en lichess, quien se queda lo ve y puede
reclamar. Migración `20261030000014_rival_que_se_va`.

- **La base sabe quién sigue ahí.** Cada pantalla de una sala de a dos llama
  cada pocos segundos a `latido_de_partida()` (`js/rival-ausente.js`, que
  pone en marcha `SalaJuego.suscribir` en las seis salas: Estándar, Niebla,
  Crazyhouse, Cartas, Duelo y las variantes). La base anota la hora en
  `partida_latidos` y contesta en la misma llamada cuánto hace que no ve al
  rival, cada cuánto volver a latir (10 s), desde cuándo avisar (20 s) y si
  ya se puede reclamar (40 s, `interno.segundos_para_reclamar()`). Los
  números viven en la base, una sola vez: la pantalla los recibe.
- **El aviso:** «Tu rival se desconectó hace N s», debajo del estado de la
  sala; desde los 40 s, «Reclamar la victoria» y «Declarar tablas», cada uno
  con su confirmación. Si el rival vuelve, el aviso se va solo.
- **Lo decide la base, con su hora.** `reclamar_por_abandono()` vuelve a
  contar la ausencia y rechaza el reclamo antes de tiempo («Tu rival sigue
  conectado»); desde la consola no se adelanta nada. Termina la partida con
  `status = 'finished'` y el resultado, igual que una rendición (la
  revisión y el robo de puntos corren como siempre).
- **El que nunca entró:** se cuenta desde que llegó quien reclama, no desde
  que se creó la sala (que el profe pudo armar horas antes): nadie gana al
  abrir la página.
- **Sin red, no se acusa:** si el pedido propio no llega, el aviso no sale.
  Una pestaña escondida late más despacio (el navegador frena sus relojes) y
  al volver late enseguida.
- `partida_latidos` no tiene políticas ni permisos: solo la tocan las dos
  funciones. Probado impersonando en una transacción revertida: el alumno no
  ve ninguna fila; con el rival latiendo, el reclamo se rechaza; quien no
  juega no reclama; a los 50 s sin el rival, el reclamo termina la partida;
  un segundo reclamo, rechazado.
- Ajedrez para 4 y el Relevo quedan afuera (el Relevo es por equipos y usa
  su propia tabla).

Lo prueba `verificar-partidas-simultaneas.js`: en todas las rondas, cada
pestaña late y nadie ve el aviso con los dos en la sala; y la ronda 8, una
partida por modalidad a la que se le cierra la pestaña de las negras: el
reclamo enseguida lo rechaza el doble de la base, el aviso y el botón llegan,
el reclamo termina la partida y la pantalla lo muestra (con los segundos
acortados, que el doble dice como la base). Sin el botón, salta.

### Cómo andan las partidas en línea

Todo lo anterior —el canal rápido, el retraso que no se cobra, el reloj que
se recorta— se midió con la red simulada de `verificar-partidas-simultaneas.js`.
Para decidir el paso siguiente (que la base calcule el reloj sola) hace falta
saber cómo andan las partidas de verdad. Migración
`20261030021034_medir_partidas_en_linea`.

- **Cada pantalla mide lo suyo.** `SalaJuego.suscribir` anota, para cada
  jugada del rival, cuánto tardó en aparecer: desde que la movió (si llegó
  por el canal rápido, la provisional trae esa hora) o desde que la base la
  guardó, hasta que se vio. Cada 20 jugadas, al terminar y al irse de la
  página manda el resumen —cuántas, la mitad, el 95 %, la peor y cuántas por
  el canal rápido— con `anotar_medicion_partida()` a `partida_mediciones`
  (una fila por jugador y partida). La base solo deja escribir a quien juega
  y recorta los números a un rango sano. Medir nunca rompe la partida: si el
  pedido falla, no pasa nada.
- **La base anota cada reloj que recorta.** `proteger_reloj_de_partida()`
  llama a `interno.anotar_recorte()` en `reloj_recortes`, con cuánto y si era
  una jugada. Como el trigger corre con el permiso de quien escribe, esa
  función conserva el execute de `authenticated` (interno no está en la API).
- **Quien administra lo ve en Competir**, «📶 Cómo andan las partidas en
  línea»: partidas y jugadas medidas en 30 días, la demora típica, el 95 % y
  la peor, cuánto llegó por el canal rápido y los relojes recortados.
  `mediciones_de_partidas()` se lo niega a todos los demás. Contraste medido:
  10,3:1 el peor en claro, 11,1:1 en oscuro.
- Ninguna de las dos tablas tiene políticas: solo las tocan esas funciones.
  Probado impersonando en una transacción revertida: el alumno anota lo suyo
  y no ve nada; quien no juega no anota; el resumen solo para quien
  administra; el trigger, corrido como el alumno que mueve, recorta 53,5 a 53
  y lo anota.

Lo prueban `verificar-premovidas.js` (el resumen, y que una jugada del rival
vista 600 ms después de guardarse llegue a la base como 600 ms al irse; con
la demora mal medida, salta), `verificar-partidas-simultaneas.js` (en cada
ronda, la mayoría de las pantallas manda lo que midió y tiene sentido) y
`verificar-profesor-juega.js` (el recuadro, solo para administración).

### El reloj lo lleva la base

Hasta acá el navegador mandaba, en cada jugada, su reloj y la hora en que
arranca el del rival, y la base solo ponía topes. Quedaban dos huecos: una
jugada guardada **sin el reloj propio** no se descontaba (el trigger solo
miraba la columna que cambiaba; probado en producción: con 60 s y 10 s
pensando, la jugada se guardaba y el reloj seguía en 60), y una jugada sin
`clock_updated_at` dejaba correr el reloj del rival desde antes, cobrándole
lo que pensó quien movió. Migración `20261030032850_reloj_lo_lleva_la_base`.

- **En la jugada que pasa el turno**, el paso (5) de
  `proteger_reloj_de_partida()` pone la hora de arranque (`now()`), la
  mande la pantalla o no, y deja el reloj de quien movió en el tope aunque
  no venga en el `UPDATE`: lo que le quedaba menos lo que pasó según la
  base, más el incremento, los 2 s de tolerancia y el segundo del retraso.
  El turno se lee de `fen` o del estado de Cartas.
- **Quien juega honesto no nota nada:** su reloj ya venía por debajo del tope
  y la hora la ponía igual la base. Lo que el navegador muestra entre
  jugada y jugada no cambia.
- **El Duelo queda como estaba:** ahí corren los dos relojes a la vez y no
  hay un turno que pase.
- El recorte queda anotado en `reloj_recortes`, como los del paso (4).
- Ajedrez para 4 queda como estaba, por decisión.

Probado en producción en una transacción revertida: con 60 s y el reloj
corriendo hace 10 s, la jugada sin reloj propio queda en 53 y arranca el
reloj del rival en ese momento; la honesta con 50 queda en 50; una escritura
sin jugada no toca el reloj ni la hora. Los dobles de
`verificar-partidas-simultaneas.js`, `verificar-juegos-nuevos-en-vivo.js` y
`verificar-torneo-jugado.js` hacen el mismo paso (5), y los tres fallan si
hubo que recortar un reloj que llegó a tiempo: ninguna pantalla honesta
debería tocarlo.

### Cartas: cada estado, una copia propia

`CartasChess.Game.fromJSON` y `toJSON` compartían las manos y el mazo con el
estado de la sala. El tablero cargaba `room.cartas_state` y, al jugar, el motor
le agregaba la carta repartida y le sacaba la del mazo a la sala que tenía la
página, sin guardar nada. No daba ningún error: la cuenta de la triple
repetición leía el estado «de antes» ya cambiado, y el canal rápido avisaba que
la jugada salía de una posición que nadie más tenía (casi ninguna jugada de
Cartas llegaba por el canal). Ahora los dos copian.

### Cómo se comprueba

- `verificar-premovidas.js` (sin navegador): los destinos de cada pieza, el
  controlador de las pre-jugadas con un tablero de mentira (poner, quitar,
  jugarla, descartarla y decirlo), qué cree el canal rápido de un aviso
  (`rehacerConChess`), el reloj de quien mueve (`pensado`) y la copia de
  Cartas. Probado que falla con el motor de Cartas de antes.
- `verificar-partidas-simultaneas.js` (ver «Las jugadas llegan siempre»): su
  servidor de mentira reparte también Broadcast (con la misma red mala: avisos
  perdidos, tarde, canales caídos), sus jugadores automáticos dejan
  pre-jugadas al azar y la demora se mide **desde que quien mueve ve su
  jugada** hasta que la ve el rival, así que entra también lo que tarda
  guardarla. En la red mala la base rechaza además el 3 % de las jugadas ya
  avisadas. La ronda **3 bis** deja una jugada avisada que la base no guarda,
  con nadie que vuelva a mover: del otro lado tiene que desaparecer sola
  (quitando la relectura a los 4 s, falla). Las rondas **6 y 7** juegan dos
  partidas de cada una de las demás modalidades (con su sala inicial armada por
  sus motores en Node), con red sana y mala, y comprueban que **en cada
  modalidad la jugada del rival llegue también por el canal rápido**: si una
  página no puede rehacerla, todas llegarían por la base y nada saltaría
  (quitándoselo a Cartas, salta). Esas dos las corre
  `verificar-partidas-modalidades.js` (el mismo código, con `RONDAS=6,7`):
  todas juntas pasaban de los 10 minutos que `verificar-todo.js` le da a cada
  verificador, y el CI lo cortó.
- `SIN_RAPIDA=1`: la base sin la política (el canal privado no abre). Todo
  tiene que seguir igual por `postgres_changes`. `SIN_PREMOVIDAS=1`: sin
  pre-jugadas. `RONDAS=6,7` y `SOLO_MODALIDADES=cartas,niebla` para mirar unas
  pocas.

Con 10 partidas: red sana, mediana ~110 ms y la peor ~250 ms (el servidor de
mentira contesta en 20-120 ms, así que acá el canal rápido apenas se nota: lo
que ahorra en la vida real es lo que tarda Realtime en revisar la RLS con la
base cargada); red mala, la peor bajó de ~8 s a ~5-7 s.

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
  pública conocida), con uno a cuarenta botones que la abren en otra pestaña
  (eran seis; el Centroamericano lleva uno por torneo de chess-results, ver
  «Un torneo por categoría», y la base y el editor tienen el mismo tope). Las
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
versión vigente desde el 1 de febrero de 2026), un todos contra todos con
las tablas de Berger o un Scheveningen entre dos equipos (ver «El Sistema
Scheveningen: dos equipos, cada uno contra todos los del otro»). Se pidió «que cumpla con todas las reglas de la FIDE
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

### El Sistema Scheveningen: dos equipos, cada uno contra todos los del otro

Lo pidió el dueño del sitio, entre las herramientas que le faltaban a un
árbitro: el encuentro de dos colegios o dos clubes en que cada jugador
juega con todos los del otro equipo y con ninguno del suyo.

- **Es un torneo individual con `sistema: "scheveningen"`**, no un torneo
  por equipos (`tipo: "equipos"` lo rechaza): cada partida es de dos
  personas, la clasificación individual y el TRF son los de siempre, y lo
  único nuevo es el calendario y el marcador del encuentro.
- **Los dos equipos salen de la columna Institución** (sin tildes,
  mayúsculas ni espacios de más: «liceo  a» y «Liceo A» son el mismo). Tienen
  que ser exactamente dos, con la misma cantidad, hasta 12 por equipo
  (`equiposScheveningen()`); si no, la ficha Rondas dice qué falta, con los
  nombres, y no empareja. No se inventa un «libre»: un Scheveningen desparejo
  no es un Scheveningen.
- **El orden de tableros es el orden inicial** (Elo, título, nombre), que
  queda fijo al emparejar la ronda 1, y se ve antes de emparejar. El equipo
  A es el del n.º 1. En la ronda r, el tablero i es A[i] contra
  B[(i + r) mod n]: en n rondas, cada pareja una vez.
- **Los colores salen de una tabla, `COLORES_SCHEVENINGEN`, no de una
  fórmula.** Con ese giro ninguna fórmula simple deja parejos a los dos
  equipos: con (i + r) par, cada jugador de B llevaba el mismo color en
  todas las rondas cuando n es par. Las tablas de 1 a 12 se buscaron por
  fuerza bruta: cada jugador de A y de B termina con tantas blancas como
  negras (con n impar, una de diferencia) y nunca lleva el mismo color tres
  rondas seguidas. Con n par cada equipo lleva blancas en la mitad de los
  tableros de cada ronda, salvo con 2, 6 y 10 (n/2 impar), donde eso no se
  puede sin desparejar a alguien: ahí una ronda lleva una blanca de más. El
  color del n.º 1 y la doble vuelta dan vuelta los colores, como en Berger.
- **Calendario fijo, como el todos contra todos**: `T.fijo(t)` dice si el
  sistema no se empareja con el motor, y `T.rondaFija()` /
  `T.rondasDelTorneo()` son la única puerta para cualquiera de los dos. Todo
  lo que antes preguntaba `sistema === "todos"` para decir «calendario fijo»
  (sin «Número de rondas» ni Baku, con doble vuelta, sin «no viene» por
  ronda, la incomparecencia con el rival programado en los desempates) ahora
  pregunta `T.fijo()`.
- **El TRF dice `092 Individual: Scheveningen`**, sin la línea 192 del
  Holandés, y se vuelve a leer como Scheveningen.
- **La Clasificación trae arriba el encuentro** (`marcadorScheveningen()`):
  el total de cada equipo, quién va ganando o ganó escrito con palabras, y
  una fila por ronda con las mesas que faltan.
- **Al publicar** se manda el número de rondas del calendario, y
  `pareo-publicar` guarda «scheveningen» tal cual (antes, todo lo que no era
  «todos» quedaba como «suizo»): la lista pública y la ficha del torneo dicen
  «Scheveningen». `verificar-pareo-publicar.js` lo revisa.

Al tocar esto, `node herramientas/verificar-pareo-scheveningen.js` (con el
sitio en localhost:8777). Rompiendo a propósito un color de la tabla o el
giro de B, salta.

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
  versión los calculaba y el verificador lo agarró en 392); K = 40 hasta el
  final del año en que cumple 18 (con menos de 2300), 10 desde 2400, 20 los
  demás —ese año incluido: la primera versión lo cortaba un año antes, y lo
  agarró la «Variación de Elo del torneo» comparando con chess-results (ver
  allá)—. El K 40 del jugador nuevo (menos de 30 partidas con Elo) no se
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

### Torneos en Pareo Integral: los torneos de chess-results

El dueño pidió que «También en Costa Rica» trajera además los torneos de
Costa Rica que ya están cargados en chess-results, como hace
ajedrezcostarica.com. Muchos torneos se cargan allá antes de jugarse y no se
anuncian en ningún otro lado.

- **Quién los lee.** La misma Edge Function `torneos-externos`, en la misma
  pasada diaria. Hace una búsqueda en el buscador de chess-results
  (`TurnierSuche.aspx`): Costa Rica, los 250 tocados más recientemente.
  - Es la misma lectura que `herramientas/ajedrez-estudiantil-actualizar.py`
    (el formulario ASP.NET con sus campos ocultos, mandado al MISMO servidor
    s1, s2… que lo dio, con sus cookies) y la misma tabla `CRs2` leída por el
    **nombre** de cada columna. El lector está en
    `torneos-externos/chessresults.ts`, sin red, para probarlo con Node.
  - Las redirecciones se siguen a mano (`redirect: "manual"`): si fetch las
    sigue solo, se pierden las cookies que pone cada salto y el formulario
    no busca nada.
  - Desde `net.http_get` de la base chess-results contesta 400 (no parece un
    navegador); desde Deno, con el agente de un navegador, contesta bien.
    Por eso se probó desplegando la función, no desde SQL.
- **Qué se guarda.** Solo los que empiezan de hoy en adelante (el día en
  Costa Rica), y de cada uno lo que el buscador ya muestra a cualquiera:
  nombre, día, lugar, quién organiza, rondas e inscritos. Va en la misma
  tabla, con `fuente = 'chess-results'`.
  - El buscador corta el nombre a 50 letras: de esos se lee el completo en
    la página del torneo (`<h2>`), como mucho 20 por pasada y con medio
    segundo entre una y otra.
  - El día va como la medianoche de Costa Rica (06:00 UTC) y sin final: el
    buscador no dice horas ni cuántos días dura.
  - El ritmo sale del nombre solo si lo dice («Blitz», «Rápido», «Clásico»);
    si no, queda vacío, nunca adivinado. La provincia la deduce la lista
    del lugar, con `pareo_provincia()`.
  - La dirección es siempre la pública, `https://chess-results.com/tnr<n>.aspx?lan=2`,
    y la base no acepta otra (el check de `url` la arma con el mismo número).
- **Cada fuente va por su lado.** Si una no contesta o cambió de forma (la
  tabla sin alguna de sus columnas da null, no una lista vacía), sus filas se
  quedan como estaban y la otra se pone al día igual. Lo de una fuente que
  ese día falló no se borra por llevar una semana sin verse: se borraría
  todo por un mal día de chess-results.
- **Sin repetir.** `torneos_externos_lista()` no da un torneo de
  chess-results que ajedrezcostarica.com ya anuncia: su ficha enlaza a ese
  mismo `tnr<n>`, o es el mismo día con un nombre parecido
  (`pareo_parecidos`). Gana el anuncio de allá porque dice más
  (inscripción, costo, ritmo). Contra Pareo Integral vale lo de siempre:
  `repetido_de`.
- **Cómo se muestran.** En la misma lista, ordenados por día, con «En
  chess-results» o «En ajedrezcostarica.com» debajo de cada nombre (y para
  el lector de pantalla, qué página abre).
  - chess-results no dice si la inscripción está abierta, así que esos
    torneos **nunca dicen «Cerrada»**: en su lugar va cuántos inscritos
    lleva, y con el filtro «Inscripción abierta» no salen (no se sabe).
  - Al calendario van con su propio UID (`chess-results-<n>@…`), en la
    portada y en `/calendario/torneos.ics`; el worker acepta solo las
    direcciones de las dos fuentes.
- **Por qué no va en `privacidad.html`.** Como con ajedrezcostarica.com: no
  se le manda nada a chess-results, solo se lee lo que el buscador publica
  de un torneo.

Lo comprueban `verificar-torneos-externos.js` (el lector y la función),
`verificar-torneos-externos-pagina.js` (la portada) y `verificar-worker.js`
(el calendario). Al aplicarlo se disparó a mano: leyó 249 torneos de Costa
Rica y guardó los 2 que empezaban el 24/10/2026, que ajedrezcostarica.com no
anunciaba.

### Torneos en Pareo Integral: buscar a un jugador, el medallero, las aperturas y las cifras

Cinco cosas que el dueño pidió juntas, todas armadas con lo que ya está
publicado. Las cuentas las hace la base
(`20261023213000_pareo_buscar_medallero_cifras.sql`): la portada no se baja
todos los torneos para sumar en el navegador.

- **Buscar a un jugador desde la portada** («Buscar un jugador», al lado de
  «Buscar un torneo»; `pareo_buscar_jugador()`).
  - Cada palabra escrita tiene que estar al comienzo de una palabra del
    nombre, sin tildes ni mayúsculas: «jose mora» encuentra a «José Pablo
    Mora Solís». Lo escrito viaja tal cual y la base lo limpia
    (`pareo_clave`).
  - Una fila por persona (`pareo_resultados()`: la huella del ID FIDE o, si
    no hay, el nombre), con su colegio, sus torneos, sus podios y el último,
    escritos. Cada una lleva a SU ficha, con su huella.
  - Dos personas distintas con el mismo nombre (distinto ID FIDE) se avisan
    y salen por separado: nunca se juntan.
  - Con menos de tres letras no se pregunta nada (tampoco la base busca). Lo
    que se escribe rápido manda varias preguntas: una respuesta vieja no pisa
    a la de lo último que se escribió.
- **El medallero de colegios y clubes** (Ranking del año → «Colegios y
  clubes», `#ranking=colegios`; `pareo_medallero()`). Oro, plata y bronce
  son el 1.°, el 2.° y el 3.° de cada torneo individual, contados por la
  institución que el jugador llevaba en ESE torneo (un colegio que cambia de
  nombre no se lleva las medallas viejas del otro). El colegio es su nombre
  sin tildes ni mayúsculas y se muestra como más veces lo escribieron
  (`mode()`). Las medallas van escritas en el encabezado («Oros (1.°)»…):
  el color nunca dice nada solo.
- **Las aperturas** (`js/pareo/aperturas.js`), en tres lugares: la pestaña
  Estadísticas de cada torneo, la ficha del jugador (con blancas y con
  negras, desde SU lado: «Ganó», «Perdió») y el año (Ranking del año →
  «Aperturas», `pareo_partidas_del_anio()`).
  - **La apertura sale de las jugadas, nunca del encabezado del PGN**: se
    busca la secuencia más larga de una lista de unas cien, con nombres de
    acá. Lo que no está queda en su familia (lo más largo que sí está) o en
    «Otras aperturas». Se lee con `PareoPartida`, así que valen las letras
    en español y un PGN cortado.
  - **Cada secuencia de la lista se comprueba con chess.js**
    (`verificar-pareo-aperturas.js`): una mal escrita no reconocería a nadie
    y no daría ningún error.
  - Del año, la base da solo el comienzo de cada partida (400 caracteres, sin
    encabezados ni comentarios), el resultado y nada de nombres, con tope de
    5000.
- **Las rachas y cómo viene** (en la ficha del jugador, calculado en la
  página con sus torneos): la mejor racha sin perder, la de victorias, la de
  ahora, su mejor torneo (el de mejor rendimiento o, sin rendimiento, el de
  mejor puesto contado sobre cuántos jugaron) y la tendencia (el rendimiento
  medio de sus 3 últimos torneos contra los 3 de antes, con 4 o más). Las
  partidas van en orden de fecha y solo cuentan las jugadas (1, ½, 0): un
  bye o una partida ganada sin jugar no son racha. Todo con números
  escritos.
- **Compartir como imagen**: el ranking, el medallero, las aperturas del año
  y la ficha del jugador se bajan como PNG (horizontal o para el celular)
  con `js/tabla-imagen.js`, **que ahora lleva la marca de agua de Ajedrez
  Integral** (tenue y al centro) en todas sus imágenes, también las de los
  resultados JDN y universitarios.
- **Las cifras para quien administra** (`admin-pareo.html`, «Cómo va Torneos
  en Pareo Integral»; `pareo_cifras()`): torneos por mes de los últimos 12,
  organizaciones activas (90 días), jugadores distintos, suscripciones por
  correo y aparatos con avisos, avisos de los últimos 30 días, reportes y
  sellos pendientes y los torneos de afuera por fuente. Es `security
  definer` (lee tablas que nadie de afuera lee) con
  `coalesce(soy_admin(), false)` y sin `execute` para `anon`: solo números,
  nunca un correo.

Lo comprueban `verificar-pareo-aperturas.js` (sin navegador) y
`verificar-pareo-buscar-medallero.js` (la portada, la ficha, el ranking, la
imagen y las cifras).

### Torneos en Pareo Integral: los avisos en el celular

Los mismos avisos que por correo (su mesa en cada ronda y cómo terminó), como
notificación en el aparato: «Avisarme en este celular», al lado de «Avisarme
por correo» en la ficha del jugador y en su fila de un torneo.

- **Sin cuenta y sin correo.** Se guarda lo que el navegador le da al sitio
  para avisarle a ESE aparato (el endpoint y sus dos llaves) y a quién sigue
  (su nombre sin tildes ni mayúsculas, o la huella de su ID FIDE), en
  `pareo_suscripciones_push`. Ningún nombre de persona, ningún correo.
- **Sin confirmación por correo**: el permiso lo da la persona en su propio
  navegador, y nadie puede suscribir el aparato de otro. Al suscribirse sale
  un primer aviso, «Listo: sigues a…», que además comprueba que llega: si el
  servicio dice que esa dirección no existe, la suscripción no se queda.
- **El permiso se pide solo al tocar el botón**: el navegador deja preguntar
  una vez, y preguntar al abrir la página es la forma más rápida de que digan
  que no para siempre (lo mismo que `js/notificaciones.js` en la Academia).
- **La misma maquinaria que los avisos de la Academia**: las llaves VAPID
  son las del sitio (las genera y guarda `notificar`) y `webpush.ts` pasó a
  `_compartido/`, copiado por `funciones-armar.js` a `notificar` y a
  `pareo-publicar`. Lo desplegado de `notificar` no cambió: es el mismo
  archivo.
- **La función solo le manda a los servicios de avisos de los navegadores**
  (Google, Mozilla, Apple, Microsoft): un endpoint de otra dirección no se
  acepta, para que nadie la use para mandarle pedidos a cualquier servidor.
- **Cada aviso sale una vez**: se anota antes de mandarlo en
  `pareo_avisos_push_enviados` (su clave única), como el correo. Un aparato
  que el servicio ya no reconoce (404, 410) se borra solo. Como mucho 20
  jugadores por aparato.
- **La baja**: el mismo botón («Avisos en este celular: encendidos») manda
  `seguir_push_baja` con la suscripción del navegador; el endpoint es largo y
  secreto, y solo lo conoce ese navegador. Qué jugadores sigue ESTE aparato
  se recuerda en el navegador solo para pintar el botón.
- **Lo dice `privacidad.html`**, junto a los avisos por correo.

Lo comprueba `verificar-pareo-seguir-push.js` (la función, la base y la
página con un navegador de mentira).

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

### Torneos en Pareo Integral: el mismo jugador en todos sus torneos

La ficha del jugador (`#p=<nombre>`) buscaba su nombre escrito igual, así
que «PÉREZ» y «Pérez» eran dos personas, y dos personas distintas con el
mismo nombre se sumaban en una sola. Ahora reconoce a cada jugador por su ID
FIDE cuando lo tiene y, si no, por su nombre sin tildes ni mayúsculas.

- **El ID FIDE no se publica, como siempre se prometió** (`privacidad.html`
  y los textos de Pareo Integral).
  - Viaja solo a la función `pareo-publicar`, que lo cambia por una
    **huella** (`ident`): un HMAC con el secreto `pareo_identidad_secreto`
    de la bóveda, truncado a 24 caracteres hexadecimales.
  - Lo borra **antes** de guardar el torneo (`ponerIdentidad()`).
  - Sin el secreto no se puede saber qué ID hay detrás de una huella. Un
    hash simple, sin secreto, se rompería probando los pocos millones de
    IDs FIDE que existen.
  - `verificar-pareo-publicar.js` revisa que la función borre el ID antes
    de guardar.
- **Quién es quién** (`elDe()` en `js/torneos-pareo-pagina.js`):
  - Con huella en la dirección (`&i=`), un torneo cuenta si trae esa
    huella, o el mismo nombre **sin** huella (pudo jugar sin su ID FIDE).
    Nunca cuenta el mismo nombre con **otra** huella: es otra persona.
  - Sin huella en la dirección, si el nombre aparece con dos huellas
    distintas, la ficha pregunta cuál de las dos es en vez de sumarlas
    (`#tp-homonimos`).
- **La búsqueda la hace la base:** `public.pareo_torneos_de(nombre, ident)`
  devuelve los torneos con esa huella o con ese nombre (`pareo_clave`),
  hasta 100.
- **Cara a cara.** En la ficha, «Sus partidas contra» ofrece los rivales
  que el jugador tuvo enfrente. Al elegir uno (`&vs=…&vi=…`) aparecen el
  marcador y cada partida, sacados de los torneos de la ficha, que ya están
  leídos: no se pide nada más a la base.
- **El resumen de cada jugador.** Al publicar, `PareoPublicar.datosPublicos`
  manda con cada torneo `resumen`: puesto, puntos, ganadas, tablas y
  perdidas, partidas contra rivales con Elo, rendimiento y ± Elo.
  - Lo calcula con los mismos módulos de la clasificación, así que el
    puesto es el de los desempates del torneo.
  - La función lo limpia campo por campo (`filaResumen`).
  - Es lo que suman el ranking y la ficha del colegio en la base, que no
    sabe calcular desempates.

Lo comprueban `verificar-pareo-publicar.js` (el resumen y la huella) y
`verificar-pareo-jugadores.js` (las fichas, las dos personas con el mismo
nombre y el cara a cara).

### Torneos en Pareo Integral: un torneo, una sola vez

Un torneo publicado en Pareo Integral que también se anuncia en
ajedrezcostarica.com salía dos veces: en la portada y en el calendario.

- `public.torneos_externos_lista()` devuelve los de afuera, cada uno con
  `repetido_de`: el torneo de Pareo Integral que es el mismo, si lo hay. Es
  el mismo si se cumplen las tres cosas:
  - empieza el mismo día, en hora de Costa Rica;
  - tiene el mismo ritmo, si los dos lo dicen;
  - el nombre se parece (`pareo_parecidos`): comparten al menos dos
    palabras, y una lista cabe en la otra o comparten al menos la mitad de
    todas.
- Las palabras no cuentan «torneo», «de», «ajedrez» ni las de menos de tres
  letras, y cada una vale por sus primeras cinco letras.
  - Así «Rápido» y «Rapid» son la misma palabra
    (`20261023192512_pareo_palabras_raiz.sql`). Sin eso, «Torneo Rápido
    Paquera 2026» y «Torneo Rapid Paquera 2026» no se juntaban.
- El nombre solo no basta: «Rápido Guarqueño» y «Clásico Guarqueño» se
  parecen, y los separan el día y el ritmo.
- En la portada, el de afuera no sale en «También en Costa Rica». Su fila
  de Pareo Integral dice «También anunciado en ajedrezcostarica.com», y su
  ficha lleva el enlace al anuncio de allá.
- El calendario para suscribirse del worker usa la misma función y salta
  los repetidos.

Lo comprueban `verificar-pareo-jugadores.js` y `verificar-worker.js`.

### Torneos en Pareo Integral: el ranking del año y la ficha del colegio

Los dos se arman en la base con el resumen de cada jugador en cada torneo
individual: `public.pareo_resultados()`, `SECURITY INVOKER`, así que la RLS
también esconde acá los torneos ocultos.

- **La persona de cada fila** es su huella. Si no tiene, es la única huella
  que tiene su nombre en algún torneo. Si su nombre tiene dos huellas, o
  ninguna, es el nombre (`'n:…'`).
- **El ranking** (`#ranking=1`, `public.pareo_ranking`) se filtra por año,
  categoría y colegio, y se ordena de cuatro maneras:
  - torneos jugados;
  - podios;
  - rendimiento: el promedio de sus torneos, pesado por las partidas contra
    rivales con Elo, y solo con 9 de esas partidas o más, para que dos
    partidas de suerte no encabecen la tabla;
  - ± Elo sumado.
  - Trae los primeros 100. La página dice que no es un ranking oficial.
- **La ficha del colegio o club** (`#c=<nombre>`, `public.pareo_institucion`)
  junta los torneos donde el nombre está escrito igual, sin importar tildes
  ni mayúsculas. Muestra:
  - sus jugadores, cada uno con enlace a su ficha (con la huella);
  - sus torneos, con cuántos jugadores llevó y su mejor puesto;
  - sus podios;
  - su año a año.
  - Se llega desde la institución en la clasificación de cada torneo, en la
    ficha del jugador y en el ranking.
- **Si la tabla crece mucho:** las dos recorren todos los torneos
  publicados en cada pedido. Si llegan a ser miles y se pone lento, el
  siguiente paso es guardar `pareo_resultados` en una tabla que se ponga al
  día al publicar.

Lo comprueba `verificar-pareo-jugadores.js`. Las funciones se probaron en la
base con dos torneos de prueba, en una transacción que se deshizo. Se
probaron tres cosas:
- dos «Ana Pérez» con y sin huella quedaron como la misma persona;
- el rendimiento pesado dio 1820, de 1900 en 3 partidas y 1700 en 2;
- el colegio escrito «liceo de paquera» y «Liceo de Paquera» se juntó.

### Torneos en Pareo Integral: en vivo y por provincia

- **«Se están jugando ahora».** Arriba de la portada salen los torneos en
  curso (`pareo_lista` con `p_curso`), con su ronda. Mientras se busca o se
  filtra, se esconde: la lista de abajo ya muestra lo que coincide.
- **La provincia de cada torneo:**
  - la elige quien organiza en la ficha Torneo de Pareo Integral
    (`datos.provincia`);
  - si no la dijo, la base la deduce del lugar con
    `public.pareo_provincia()`. Busca un trozo del lugar (entre comas,
    puntos o paréntesis) que sea una provincia o uno de los 84 cantones, o
    el nombre de una provincia en cualquier parte del texto;
  - si salen dos provincias, o ninguna, no adivina.
  - Los cantones se comparan con el trozo entero: «San Isidro de El
    General» no es el cantón San Isidro de Heredia.
- **«Lo que viene, por provincia»** cuenta los próximos torneos de cada
  provincia, los de Pareo Integral (`pareo_lista_resumen().provincias`) y
  los de afuera.
  - Tocar una provincia la elige en el filtro «Lugar», que ahora ofrece las
    siete provincias antes que los lugares escritos.
  - `pareo_lista` filtra por provincia con el mismo `p_lugar`, sin cambiar
    su firma.
  - Los de afuera se filtran por la provincia que dice su ficha de allá.

Lo comprueba `verificar-pareo-jugadores.js`.

### Torneos en Pareo Integral: avisar por correo a quien sigue a un jugador

«Seguir» vivía solo en el navegador. Ahora quien quiere deja su correo en la
ficha del jugador («Avisarme por correo») y le llegan dos avisos:
- cuando el jugador queda emparejado en una ronda nueva, con su mesa, su
  color, su rival y el Elo del rival;
- cuando termina el torneo, con su puesto.

- **Con consentimiento y confirmación.** El formulario pide marcar la
  política de privacidad.
  - Antes de mandar nada, la función le escribe un enlace para confirmar
    (`#seguir-ok=`, válido 48 horas).
  - `seguir_correo` contesta lo mismo pase lo que pase: no dice quién sigue
    a quién.
  - Tiene su freno (`pareo_correo_frenar`, ámbito `'seguir'`) y un tope de
    20 jugadores por correo.
- **Quién recibe.** `public.pareo_suscripciones` no se lee desde afuera:
  solo la función, con la service role. Una suscripción con huella sigue a
  esa persona; sin huella, sigue al nombre.
  `public.pareo_suscriptores_de(torneo)` dice quién sigue a alguien de ese
  torneo.
- **Cuándo sale cada aviso.** Lo calcula `pareo-publicar` al crear y al
  poner al día un torneo, comparando con la versión que había
  (`avisos.ts`):
  - aviso de ronda solo cuando aparece una ronda emparejada nueva, no con
    cada resultado;
  - aviso de final solo la vez que el torneo se completa;
  - nada en un torneo por equipos.
- **Nunca dos veces.** Cada aviso se anota en `pareo_avisos_enviados`
  **antes** de mandarlo. Su clave única (suscripción, torneo, ronda o fin)
  hace que no salga dos veces aunque el árbitro ponga el torneo al día
  muchas veces seguidas.
  - Corre después de contestar (`EdgeRuntime.waitUntil`), con un tope de
    300 por vez: un aviso lento no demora la publicación.
- **Darse de baja.** Cada aviso trae su enlace (`#seguir-baja=`), firmado
  con el mismo secreto de la huella (`hmac("baja:" + id)`): nadie da de
  baja a otro cambiando el id.
  - La baja borra la suscripción, y con ella sus avisos anotados.

Lo comprueba `verificar-pareo-seguir-correo.js`:
- con Node: cuándo hay aviso, sus textos y los correos escapados;
- y leyendo el código: el orden «anotar, después mandar».

`verificar-pareo-jugadores.js` prueba el formulario y el enlace de
confirmación.

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
- **Público por default, sin RLS**: este canal no usa el modo privado de
  Supabase (que exige una política sobre `realtime.messages`; el único canal
  privado del proyecto es el de las partidas, ver «La jugada viaja por
  Broadcast, y las pre-jugadas», y su política no habla de estos temas).
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
los **desempates explicados** (`desempates.html`, ver «Desempates explicados»),
**Pareo para DGT** (`pareo-dgt.html`, ver «Pareo para DGT») y
los **resultados JDN por comité** (`jdn-comites.html`, ver «Resultados JDN por
comité»).
**Pareo Integral** (`pareo.html`, ver «Pareo Integral») está en la vitrina con
`gratis: true`: el dueño lo pidió público y para quien lo necesite, así que sale
abierto para todos, sin sesión ni candado, con «Abrir» y «Manual de uso»; la
vitrina no le pregunta `tengo_herramienta()` y `licencias.html` no lo ofrece
(no hay licencia que vender de algo gratis).

**La vitrina va en fichas por tema** (lo pidió el dueño: «que queden fichas por
cada tema»): Arbitraje, JDE, JDN y Universitarios, en `TEMAS` del mismo
`js/herramientas-arbitraje.js`. Cada herramienta lleva su `tema` y la lista se
ordena por tema (también en `licencias.html`); una herramienta nueva sin
`tema` no sale en ninguna ficha, así que se lo pone al agregarla, y un tema
nuevo es una línea más en `TEMAS`. Todas se pintan en `#lista` y las de las
otras fichas quedan con `hidden`; la ficha elegida va en la dirección
(`herramientas-arbitraje.html#jde`) para mandar el enlace ya abierto en ella.
Las fichas son pestañas de verdad (`role="tab"`, flechas, Inicio y Fin). Lo
revisa `verificar-seleccion-pagina.js`, midiendo qué se ve.

De tres maquetas (pestañas chicas arriba, portada de temas y menú al costado)
el dueño eligió **la portada de temas**: arriba, una tarjeta grande por tema
con su ícono, de qué se trata y cuántas herramientas trae (de dos en dos y sin
el resumen en el celular, donde al tocar una se baja sola a sus herramientas),
y debajo las herramientas de ese tema en tarjetas compactas, con su nombre
corto (`corto`) y lo que hace detrás de un desplegable «Qué hace», cerrado:
así se comparan de un vistazo sin una página larguísima.

**De entrada no hay tema elegido** (lo pidió el dueño): debajo de las
tarjetas no sale ninguna herramienta, sino el avatar del profe Oscar leyendo
(«a-repasar», de `js/avatar-profe-oscar.js`; ver «El avatar del profe
Oscar») con un globo que dice «¡Elige un tema!»
(`#tema-invitacion`); al tocar un tema, Oscar se va y salen sus
herramientas. Con el tema en la dirección (`#jde`), ese ya viene elegido.
Sin ninguno elegido, ninguna pestaña está `aria-selected` y a la primera se
llega con Tab. De paso: una herramienta que todavía no se puede usar dice
«Próximamente» también para quien tiene todas (la licencia «todas» o quien
administra); antes decía «Abierta para tu cuenta» y abajo «Todavía no se
puede usar».

**La ficha Universitarios trae también los torneos** (lo pidió el dueño):
además de los resultados por universidad, el catálogo «Torneos universitarios
de Costa Rica» y las páginas de cada torneo (`cenfotec-2026.html`,
`utn-2026.html`, gratis porque son públicas). El catálogo no es una licencia
aparte: se abre con la de `universidades` (ver «Torneos universitarios de
Costa Rica»), así que lleva `licencia: "universidades"`: la vitrina le
pregunta `tengo_herramienta('universidades')`, el botón pide esa licencia y
`licencias.html` no lo ofrece solo. La página de un torneo nuevo que se arme
con `herramientas/torneo-universitario.js` se agrega a la lista a mano, con
`tema: "universitarios"` y `gratis: true`.

**En Arbitraje, los torneos de ajedrezcostarica.com** (lo pidió el dueño): la
tarjeta «Torneos de Costa Rica» lleva a `torneos-pareo.html#tambien`, la
parte «También en Costa Rica» de «Torneos en Pareo Integral» (ver «Torneos en
Pareo Integral: los torneos de ajedrezcostarica.com»). Esa parte se arma
recién cuando llegan los datos, así que el navegador no tiene adónde bajar con
el ancla: con `#tambien`, `js/torneos-pareo-pagina.js` baja a ella después de
pintar la portada (`verificar-torneos-externos-pagina.js` lo revisa).

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

## Variación de Elo del torneo

`variacion-elo.html` (con licencia, `variacion-elo`; la vitrina la anunciaba
como «Próximamente» y la pidió el dueño con las demás herramientas nuevas):
se pega el enlace de chess-results y dice cuánto sube o baja el Elo FIDE y el
nacional de cada participante, partida por partida, antes de la lista
oficial.

- **Nada nuevo para leer ni para calcular.** Lee el torneo con la MISMA Edge
  Function de «Desempates explicados», `desempates-chess-results`, que ahora
  recibe `herramienta` («desempates» si no viene: la página vieja sigue igual)
  y pregunta por la licencia de esa, nunca de otra. La ficha de cada jugador
  trae además el Elo FIDE y el nacional por separado, el año de nacimiento,
  el código FIDE, el «FIDE elo +/-» de chess-results y el Elo FIDE y nacional
  de cada rival; la caché lleva la versión en la clave («v2:») para no
  reusar lo guardado sin esos datos. El torneo se convierte con
  `js/desempates-convertir.js` y el Elo lo calcula `js/pareo/elo.js`, el
  mismo de Pareo Integral, una vez con el FIDE y otra con el nacional; ahora
  devuelve también `juegos` (cada partida que contó) para «Partida por
  partida».
- **Comparado contra chess-results en torneos reales, y eso destapó un error
  de Pareo Integral**: el K 40 de los menores es «hasta el final del año en
  que cumple 18», y `kDe()` lo cortaba un año antes (`< 18` en vez de
  `<= 18`). Con eso arreglado, en el XLVI Metropolitano 2025 (41 jugadores)
  coinciden 38; los otros 3 son lo que desde chess-results no se ve: dos con
  K 10 porque alguna vez llegaron a 2400, y uno al que le falta leer una ronda
  (la página lo avisa). En la Etapa Nacional D de los JDE 2026, los 7 con
  dato, iguales.
- **Lo que no se puede saber se dice, no se adivina**: si el número propio no
  coincide con el de chess-results, la columna dice con qué K lo calculó
  chess-results (su cambio entre puntos menos esperado, si da 10, 20 o 40); y
  si chess-results no le da variación FIDE a nadie (vacía o 0 para todos,
  como en el Nacional U15 2025), avisa que lo más probable es que el torneo
  no sea válido para Elo FIDE. El «Cálculo de elo» de la ficha del torneo
  quedaría mejor, pero en los torneos viejos chess-results lo esconde detrás
  de un botón (ver «Los torneos con Elo nacional»).
- **El nacional se calcula con las mismas reglas de FIDE**, y la página dice
  que la Federación puede usar otras.
- Lo prueba `verificar-variacion-elo.js` con un doble de Supabase y un torneo
  armado a mano, con los números sacados a mano de la tabla 8.1.2; y la
  lectura de la ficha, `verificar-desempates-chess-results.js`.

## Normas de título

`normas-titulo.html` (con licencia, `normas-titulo`; la pidió el dueño con
las demás herramientas nuevas): se pega el enlace de chess-results y dice
quién hizo norma de GM, IM, WGM o WIM en el torneo, y a quién le faltó poco
y qué, artículo por artículo del Reglamento de Títulos de FIDE (B.01,
vigente desde el 1/1/2024).

- **La misma Edge Function**, `desempates-chess-results`, con `herramienta:
  "normas-titulo"`. La clasificación trae ahora además el título (la columna
  SIN encabezado antes del nombre que trae títulos de FIDE: la otra vacía es
  la de la bandera), la federación («FED») y el sexo («sexo», cuando el
  torneo lo trae). La caché subió a «v3:».
- **El cálculo va en `js/normas-titulo.js`** (navegador y Node), sin
  pantalla: las partidas (9, o 8 que cuentan como 9 en un torneo de 9 rondas
  con un bye o una incomparecencia a favor, 1.4.1c; las incomparecencias no
  cuentan, 1.4.2c), las federaciones (dos extranjeras, FID no cuenta; máximo
  3/5 de la propia y 2/3 de una sola), los rivales con título (la mitad,
  **sin CM ni WCM**, y un tercio, mínimo 3, del título de la norma o mayor),
  el piso de Elo que sube **solo al rival de menos Elo** (sin Elo, 1400), el
  promedio redondeado y el rendimiento con la tabla 1.4.9.
- **Se prueban las mezclas que deja el reglamento**: en un suizo, cortar
  después de cualquier ronda (1.4.1e), y en cualquier formato, dejar afuera
  partidas ganadas (1.4.1f). Se queda con la que da norma y cuenta más
  partidas; cada punto entero de más cuenta como una partida (1.4.1d), hasta
  13. Probar todas las combinaciones de ganadas es 2^ganadas: se corta en
  10 (1024), de sobra para un torneo de normas.
- **Solo se buscan las normas que le sirven**: a un IM no se le busca la de
  IM ni la de WIM, y las femeninas solo se buscan si chess-results trae el
  sexo (si nadie viene marcado como mujer, se revisan para todos y lo decide
  quien mira).
- **Lo que no se ve desde los resultados se dice, no se da por hecho**: el
  ritmo, las dos partidas por día, el árbitro principal IA o FA, los 90 días,
  que esté en la lista de FIDE y que el Elo sea el de la lista vigente al
  empezar. Si el torneo no trae federaciones o títulos, un aviso dice que
  esos artículos salen como no cumplidos.
- **Comprobado contra el anexo del reglamento**: `verificar-normas-titulo.js`
  lleva copiadas las tablas de 9 a 12 partidas (160 casillas) y revisa que en
  la punta baja de cada rango haya norma, y que con medio punto menos o un
  punto de promedio menos no; más una partida armada por artículo. Rompiendo
  a propósito el redondeo o metiendo a los CM entre los títulos, salta. La
  página la prueba `verificar-normas-titulo-pagina.js` con un doble.
- Probado con un torneo real (el tnr1313571 de chess-results): la única
  norma que sale es una de IM de alguien que ya es IM, y la página no la
  muestra.

## Ranking estudiantil por categoría

`ranking-estudiantil.html` (gratis y sin cuenta, como el historial y las
estadísticas por colegio; la pidió el dueño con las demás herramientas
nuevas): el ranking de los JDE de un año, una categoría y una rama, con los
mismos datos públicos de `js/jde-datos.js`.

- **El orden dice hasta dónde llegó cada estudiante, no es un Elo**: primero
  la etapa más alta (llegar a la final pesa más que ganar la regional),
  después su mejor puesto en esa etapa, sus puntos en esa etapa y todos los
  del año. Dos iguales en todo comparten el lugar. La página lo explica.
- **Solo torneos individuales de ritmo clásico de los JDE**, como
  «Participaciones» en `ajedrez-estudiantil.html`: en uno por equipos el
  puesto es del equipo, y los blitz y rápidos repiten a los mismos.
- **Un torneo sin rama en el nombre cuenta como abierto**: el nombre llega
  cortado de chess-results («…Individual A», «…Absolu») y los femeninos lo
  dicen siempre. Sin esto, la final nacional D de 2026 quedaba afuera de la
  rama abierta y el primero del ranking era un campeón interregional.
- **La región es la de su torneo regional** (la final no tiene región); el
  filtro deja a quien jugó la regional ahí. Los filtros van en la dirección.
- En 2026 hubo dos finales nacionales D individuales en chess-results (27 y
  29 de mayo): el orden toma el mejor puesto de cualquiera de las dos.
- Lo prueban `verificar-ranking-estudiantil.js` (con unos pocos torneos
  armados a mano en la forma de los archivos de datos, leídos con el mismo
  `jde-datos.js`) y `verificar-ranking-estudiantil-pagina.js` (la página con
  esos datos servidos en lugar de los de verdad, que cambian cada mes).
  Rompiendo a propósito el peso de la etapa o la rama vacía, saltan.

## Acta e informe arbitral JDE

`acta-jde.html` (con licencia, `acta-jde`; estaba en la vitrina como
«Próximamente» y la pidió el dueño con las demás herramientas nuevas): para
una etapa de los JDE dirigida con Swiss-Manager y publicada en chess-results,
no en Pareo Integral. Se pegan los enlaces de todos sus torneos y se baja el
informe oficial de participación y resultados en PDF o Word, y los
clasificados a la etapa siguiente en el Excel que se sube en Pareo Integral.

- **El informe no se escribió otra vez**: cada torneo se lee con
  `desempates-chess-results` (`herramienta: "acta-jde"`), se convierte con
  `js/desempates-convertir.js` y lo arma `PareoEvento.informe()`, el mismo de
  los eventos de Pareo Integral (participación por centro, clasificación,
  cuadro cruzado, ausencias, medallero, firmas). `js/acta-jde.js` solo junta
  las piezas y agrega lo que chess-results no tiene: la etapa, el lugar, la
  sede, la fecha, los árbitros y las incidencias (las escribe el árbitro).
- **La función lee ahora el club y los desempates del torneo**: la columna
  «Club/Ciudad» (en los JDE, el centro educativo) y la «Anotación» de la
  clasificación («Desempate 2: Direct Encounter (DE)…»), que
  `ActaJde.codigoDesempate()` traduce a los códigos de FIDE. Caché «v4:».
  Los datos del torneo (árbitro, lugar, fechas) no se leen: en los torneos
  de más de dos semanas chess-results los esconde detrás de un botón.
- **El orden del informe es el oficial de chess-results**, el que firmó el
  árbitro (`t.ordenOficial`, que respeta `PareoEvento`; sin columnas de
  desempates, porque los números serían los recalculados). El recálculo con
  el motor de Pareo Integral y los desempates del torneo solo sirve para
  avisar si alguien queda en otro puesto. En la Etapa Nacional D 2026
  (tnr1423856), con DE y Buchholz Cut-1 de 2026, Swiss-Manager pone a
  González con 13 de Buchholz Cut-1 y Pareo Integral con 12: el aviso lo
  dice, y el informe va con el orden de chess-results.
- **El bye de un punto que trae chess-results es el del pareo**: se anota
  como mesa sin rival (`{ n: null }`) y no como un bye pedido, que en el
  informe diría «Pidió bye (avisó)» de quien no pidió nada. Se hace en
  `js/acta-jde.js` y no en `js/desempates-convertir.js`, para no cambiar los
  desempates de «Desempates explicados».
- **Los clasificados** salen de `PareoEvento.filasClasificados()` con el
  cupo del art. 66.1 según la etapa y el lugar; de la Etapa Nacional no se
  clasifica a nada.
- Lo prueban `verificar-acta-jde.js` (un torneo armado a mano con bye del
  pareo, incomparecencia, bye pedido y un empate que chess-results separa)
  y `verificar-acta-jde-pagina.js` (con un doble: la licencia, los dos
  torneos, los avisos y los tres archivos con su marca). La prueba de
  «Próximamente» con todas las licencias de `verificar-seleccion-pagina.js`
  usa ahora una herramienta de mentira metida en la lista, porque la vitrina
  se va quedando sin ninguna «Próximamente». Rompiendo a propósito el bye
  del pareo o el orden oficial, salta.

## La ficha del jugador federado

En la vitrina, «Ficha del jugador federado» (`ficha-federado`, con licencia,
en el tema nuevo «Clubes y federados»; la pidió el dueño con las demás
herramientas nuevas) lleva a `admin-jugador.html`, la «Base de datos de
jugadores» que hasta ahora era solo de administración. **No se hizo otra
página**: la de administración ya buscaba a una persona en chess-results,
agrupaba sus torneos por Código FIDE (los homónimos aparte) y analizaba su
rendimiento, su tendencia y hacia dónde va. Lo que cambió:

- **El candado de `chess-results-proxy`** deja pasar a administración o a
  quien tenga la licencia, y la licencia se pregunta como en
  `desempates-chess-results`: `tengo_herramienta()` con el token de quien
  llama y la clave anónima (así la verificación en dos pasos la exige la
  base). La página pregunta lo mismo, pero es la función la que decide.
- **El Elo nacional y el FIDE estándar** de la lista de la Federación
  (ajedrezcostarica.com) en la cabecera de cada jugador, con la Edge
  Function `pareo-elo-nacional` de Pareo Integral, que ya leía esa lista por
  nombre. **Se muestra solo si el Código FIDE de la lista es el del grupo**:
  un homónimo no se cuela.
- Se llama «Ficha del jugador federado» y sus migas cuelgan de la Academia
  (antes, de Administración, adonde quien tiene la licencia no entra).
- La vitrina tiene ahora cinco fichas de tema: en la computadora van en una
  fila de cinco (`lg:grid-cols-5`).
- Lo prueba `verificar-ficha-federado.js`: el candado de la función leído
  del código, y la página con un doble (sin licencia, administración sin
  licencia, con licencia, el homónimo que no recibe el Elo). Rompiendo a
  propósito la comparación del Código FIDE, salta.

## Generador de bases del torneo

`bases-torneo.html` (gratis y sin cuenta, como Pareo Integral; la pidió el
dueño con las demás herramientas nuevas): quien organiza llena los datos de
su torneo y baja las bases en PDF o en Word, listas para publicar.

- **Todo en el navegador**: no hay nada que proteger en un servidor, así que
  no hay licencia. Lo llenado se guarda en `localStorage` (`bases_torneo_v1`)
  solo para la próxima visita; si el navegador no deja, la página funciona
  igual.
- **Un solo documento para el PDF y el Word**: `js/bases-torneo.js` arma el
  documento neutral que leen `js/reporte-pdf.js` y `js/reporte-docx.js`, el
  mismo de los reportes de actividades. Los dos llevan la marca de agua de
  Ajedrez Integral: el PDF la busca solo; el Word la pide a
  `MarcaAgua.preparar()` antes de armar (sin ella sale sin marca, por eso lo
  revisa el verificador).
- **Lo que dice sale de las reglas, y se revisa antes de bajar**:
  - la modalidad, del tiempo de cada jugador para 60 jugadas (base + 60 ×
    incremento; Leyes A.1 y B.1): 10 minutos o menos, relámpago; menos de
    60, rápido; 60 o más, clásico;
  - para el Elo FIDE clásico, B.02 1.1: 120 minutos para 60 jugadas si alguno
    tiene 2400 o más, 90 si alguno tiene 1800 o más, 60 si los dos tienen
    menos (leído del reglamento vigente en el Handbook);
  - la tolerancia: si las bases no la dicen es cero (6.7.1), y así se
    escribe cuando se pone 0;
  - los celulares, con el 11.3.2; los desempates, con los nombres del
    catálogo de Pareo Integral (`PareoDesempates.CATALOGO`), y al cambiar el
    sistema se proponen los de Pareo Integral para ese sistema.
- **El calendario se arma solo**: las rondas por día desde la fecha de
  inicio, cada ronda con el tiempo de los dos más 40 jugadas de incremento
  (como el horario de Pareo Integral), y la siguiente a la media hora
  siguiente después del descanso. El día de calendario se lee al mediodía de
  Costa Rica, para que no corra.
- Lo prueban `verificar-bases-torneo.js` (sin navegador: modalidades,
  umbrales de B.02, calendario, textos) y `verificar-bases-torneo-pagina.js`
  (la página, bajar el PDF y el Word con su marca, lo guardado al volver y
  que nada salga del sitio). Rompiendo a propósito el límite del relámpago,
  la fecha que corre o la marca del Word, saltan.
## Reclamos de tablas desde el PGN

`reclamos-tablas.html` (la anunciaba la vitrina como «Próximamente»; la pidió
el dueño con las demás herramientas nuevas): se pega una partida y dice si
hubo triple repetición (art. 9.2) o 50 jugadas de cada uno sin mover un peón
ni capturar (art. 9.3), en qué jugada, quién podía reclamar las tablas, si se
llegó a las tablas sin reclamo del 9.6 (cinco veces la misma posición, 75
jugadas) y si un reclamo hecho en una jugada dada procedía.

- **Gratis y sin cuenta, como Pareo Integral**: todo pasa en el navegador
  (la partida no se manda a ningún lado), así que no hay candado posible en
  el servidor; uno solo en la pantalla no sería candado (ver «El candado está
  en el servidor»). En `js/herramientas-arbitraje.js`, `gratis: true`.
- **El cálculo, aparte de la pantalla**: `js/reclamos-tablas.js`
  (`ReclamosTablas`), que se usa igual en el navegador y en Node, y lo prueba
  sin navegador `verificar-reclamos-tablas.js`; la página es
  `js/reclamos-tablas-pagina.js` y la prueba `verificar-reclamos-tablas-pagina.js`.
- **«La misma posición» es la del 9.2.2, no el FEN de chess.js.** chess.js
  deja la casilla de captura al paso después de CUALQUIER avance de dos,
  aunque nadie pueda capturar: contado así, 1. e4 Cf6 2. Cf3 Cg8 3. Cg1 Cf6
  4. Cf3 Cg8 5. Cg1 no llegaba a tres repeticiones, y sí llega. La casilla
  cuenta solo si hay una captura al paso legal; si la hay, la posición sí es
  otra. Los enroques perdidos también la cambian (el tablero de salida con
  las torres ya movidas no es la posición de salida). Las tres cosas están en
  el verificador, con la regla rota a propósito para ver que salte.
- **Quién podía reclamar**: quien iba a hacer la jugada que la repetía,
  anotándola antes en la planilla y declarando que la iba a hacer
  (9.2.1.1), o el rival, en su turno, apenas apareció (9.2.1.2). Igual con las
  50 jugadas (9.3.1 y 9.3.2), que además siguen reclamables mientras no se
  mueva un peón ni se capture. Un reclamo que no procede: dos minutos al rival
  (9.5.3), y la página lo dice.
- **El PGN en algebraica española también** (Cf3, Ab5, Te1, Dd6, Rb8, 0-0):
  se reconoce porque trae una jugada de pieza con C, A, T o D, que en inglés
  no existen, y entonces R es el rey; los comentarios no se traducen. Un
  archivo con varias partidas se separa por su `[Event …]` y se elige cuál.
- **No es la decisión del árbitro**: la página lo dice, y que en rápidas y
  relámpago sin planilla completa (apéndices A y B) y según las bases del
  torneo el reclamo puede tratarse distinto.

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

### El comparador de comités

En la vitrina, «Comparador de comités JDN» (`comparador-jdn`, con la
licencia de `jdn-comites`, como el catálogo de torneos universitarios con la
de `universidades`) lleva a `jdn-comites.html#comparar`: no es otra página,
es la sección «Comparar comités» del medallero, que antes solo traía las
medallas final por final y ahora trae también:

- **Lado a lado**: el puesto en el medallero, las medallas (y de qué tipo),
  los puntos de la copa con la escala elegida, las participaciones en
  finales y eliminatorias, cuántos pasaron de la eliminatoria a la final y
  el rendimiento contra el Elo. **Cada dato sale de la misma función que su
  sección** (`resumen`, `copa`, `efectividad`, `contraElo`): el verificador
  comprueba los mismos números en el comparador y en cada sección. En
  `universidades.html` (el mismo código) no van las filas de eliminatorias.
- **Entre ellos**: las partidas de sus jugadores, de a pares, con `contra()`,
  la misma de «Contra qué comités». Las partidas llegan después de pintar
  (son unas 18 000): mientras tanto dice «Cargando las partidas…» y se
  vuelve a dibujar al llegar.
- `#comparar` no es un comité: abre el medallero, y el navegador baja solo a
  la sección con ese `id`.

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

## La inscripción de los JDE

`inscripcion-jde.html` es la herramienta gratuita (en la vitrina de
`herramientas-arbitraje.html`, `gratis: true`, sin cuenta ni licencia) con la que
el **docente de un centro educativo** prepara la inscripción de su ajedrez en los
Juegos Deportivos Estudiantiles. Lo pidió el dueño del sitio: que se ajuste a la
Normativa y que aproveche el banco de instituciones y regionales para que llenar
los datos de los estudiantes cueste poco. Es el **otro lado** de Pareo Integral:
Pareo lo usa quien organiza una etapa; esta la usa quien inscribe a su colegio.

- **Todo pasa en el navegador y no se guarda en ningún servidor.** Son nombres,
  fechas de nacimiento y documentos de menores. Se guardan solo en `localStorage`
  (`ij_borrador_v1`, en `try/catch`: sin almacenamiento la página funciona igual y
  lo dice) y en lo que la persona baja. Por eso no lleva casilla de consentimiento
  (no se envía nada) ni entra en la lista de proveedores de `privacidad.html`, y
  la página lo dice arriba con esas palabras. **Si algún día se le agrega un
  envío, eso cambia**: casilla, `privacidad.html` y la Edge Function con su freno.
  Un borrador que se abre (`.json`) pasa siempre por `normalizar()`: nunca se
  confía en su forma, y los `id` se limpian porque enlazan etiquetas.
- **Las reglas no se escribieron de nuevo**: las categorías por año de nacimiento
  (art. 17), el ascenso (art. 18), los equipos de 3 a 5, el tope de dos
  individuales, las mujeres que pasan al Abierto, las 27 Direcciones Regionales y
  las 11 interregionales son las de `js/pareo/grupos.js`, que es lo que Pareo
  Integral aplica después. Así lo que esta página acepta es lo que el emparejador
  acepta. Lo único que se agregó ahí fue `categoriasDeNacimiento()` (y se
  exportaron `JDE_CATEGORIAS` y `JDE_ASCENSOS`). Lo propio de la inscripción está
  en `js/inscripcion-jde-reglas.js` (funciones puras, sin DOM) y lo que se ve en
  `js/inscripcion-jde.js`.
- **Qué revisa, artículo por artículo** (cada hallazgo lleva escrito «Error:»,
  «Aviso:» o «Dato:» y el artículo; el color nunca va solo):
  - Art. 17: la categoría sale de la fecha de nacimiento. Nacidos en 2013 y 2014
    son de la B (escuela) o la C (colegio): lo decide «¿Escuela o colegio?» del
    centro, y sin saberlo se pide elegir; **nunca se adivina**. Otro año que 2026
    corre los rangos y avisa de confirmarlos con la Normativa de ese año.
  - Art. 18: subir de categoría solo en equipos y solo A→B, C→D, D→E, hasta tres
    por equipo; en individual es error.
  - Art. 19: unir centros pide matrícula total (máximo 300) y no deja usar el
    ascenso a la vez.
  - Art. 53: **en la Interregional y la Nacional solo juegan las categorías B y D**
    (en la Institucional y la Regional, A a E; la Circuital no tiene ajedrez). Lo
    dice la tabla de participación, no el art. 66, y ningún otro lugar del sitio lo
    comprobaba.
  - Art. 59: el correo del MEP (error si falta; aviso si no es `@mep.go.cr` salvo
    «Centro privado»); el documento de cada estudiante es un aviso y no un error,
    porque se presenta en físico el día de la acreditación. Los ocho documentos
    son los del art. 59.e.
  - Art. 60: una jefatura de delegación y una persona de cuerpo técnico, y **al
    menos una persona del mismo sexo** que el estudiantado, sin excepciones; quien
    no es funcionario pide el oficio de autorización (59.d).
  - Art. 66.1: una sola modalidad por persona (la misma persona se reconoce por su
    documento o por nombre y fecha, con `quitarRepetidos()`); dos individuales por
    categoría y torneo (error en la Regional; aviso en la Institucional, donde
    juega toda la población y solo clasifican dos); equipos de 3 a 5 con una
    suplente (error en la Regional, aviso en la Institucional); un hombre no juega
    el torneo de Mujeres; hasta dos equipos por categoría y torneo.
  - Art. 66.1.i y j: en qué interregional cae la Dirección Regional y cuántos
    clasifican (3 si cruza dos Direcciones, 2 si cruza tres), como dato.
- **El banco** (`data/jde-banco.json`, lo arma `herramientas/jde-banco.js`, no se
  edita a mano) sale de lo que ya se leyó de chess-results para
  `ajedrez-estudiantil.html`. Lo que se decidió y por qué:
  - Entran las instituciones con algún torneo de los JDE (y, desde la segunda
    versión, todos los centros de los listados del MEP; ver más abajo): chess-results
    trae en «Club/Ciudad» países, secciones de un grupo («10-4») y nombres de
    regiones, y el generador los descarta. El resto queda como está: **hay
    colegios escritos de varias formas** («Cecilio Lindo», «Cecilio Liendo
    Morales»), porque es lo que cada árbitro tecleó. Por eso el campo del colegio
    es un combobox que busca por palabras (sin tildes, mayúsculas, orden ni «de»,
    «la»…) **pero deja escribir cualquier nombre**: el banco propone, no obliga.
  - La Dirección Regional de un colegio es la que más se repite en sus torneos,
    y solo vale si es una de las 27 de la Normativa: chess-results también dice
    «Esparza» o «Bagaces», que son circuitos. Sin región clara queda vacía y la
    elige la persona.
  - Los estudiantes son los de los JDE de los **últimos tres años** (los que
    pueden volver a inscribirse); salen sin fecha de nacimiento ni documento, que
    pone el docente. El sexo solo se guarda cuando es seguro: haber jugado un
    torneo femenino (aunque el colegio esté escrito de dos formas, que se juntan).
    Los nombres que pidieron salir ya no están en la fuente
    (`herramientas/datos/ajedrez-estudiantil-excluidos.txt`).
  - El flujo mensual «Ajedrez estudiantil» lo vuelve a armar y lo incluye en su
    PR (`.github/workflows/ajedrez-estudiantil.yml`); el verificador comprueba que
    lo publicado coincide con lo que se obtiene de `data/`, y falla si no.
- **El centro se elige en cuatro pasos y el circuito se llena solo** (lo pidió el
  dueño del sitio después de la primera versión): se marca la Dirección Regional,
  se marca si es **escuela o colegio** (dos botones; ya no «no lo sé»), se toca el
  campo del centro y se **despliegan los centros de esa regional y ese tipo**
  (`centrosDe()`, en orden alfabético, con el circuito de cada uno; tope de 400 y
  «Hay N más: escribe para filtrar»), y al escoger el tuyo se llenan solos el
  **circuito**, la regional y el tipo. El campo es un combobox (flechas, Enter,
  Escape, `aria-expanded`, `aria-activedescendant`) con un botón ▾ para abrir y
  cerrar la lista, y sigue dejando **escribir cualquier nombre**: sin regional ni
  tipo marcados no se despliegan los 5 000 del país, pero escribir «liceo de costa
  rica» y Enter también llena regional, tipo y circuito (el camino de atrás).
  - Si en la regional marcada no hay ninguno con lo escrito, se busca en todo el
    país y la lista lo dice (el banco puede tener mal la regional de un colegio).
  - **Cambiar la regional o el tipo quita el centro elegido del banco** si ya no
    es de ahí, con su circuito; lo escrito a mano se respeta. Un circuito nunca se
    deja de otro centro: si el listado no ubica al centro, el circuito queda
    «por elegir» y la ayuda lo dice.
  - El circuito es un selector con los de la regional (los del banco) y se puede
    cambiar: una lista vieja puede estar equivocada, y el MEP es quien manda.
  - «Escuela o colegio» es también lo que decide la categoría de los nacidos en
    2013 y 2014 (art. 17): es la misma pregunta, ya no hay dos.
- **De dónde sale el circuito: los listados oficiales del MEP en PDF**, porque
  chess-results no lo trae y el MEP no publica un archivo abierto (el portal de
  datos abiertos no responde desde acá). `herramientas/mep-centros-leer.py` lee
  cuatro PDF —el anexo 5 del cartel de Fonatel en sutel.go.cr (3 350 centros, con
  el nivel: escuelas diurnas, colegios, CINDEA, IPEC…), el listado del IMAS de los
  paquetes escolares 2018 (3 193 escuelas) y los dos cortes del listado de
  comedores en vacaciones del MEP, 2024 (casi 400)— y los junta **por código
  presupuestario** en `herramientas/datos/mep-centros.csv`: 4 268 centros (3 699
  escuelas y 569 colegios), las 27 regionales, circuito de dos cifras. Si un centro
  está en varias listas manda la más nueva para la regional y el circuito (comedor
  2024 > Fonatel > IMAS 2018; ~130 cambiaron de circuito entre listas) y la más
  cuidada para el nombre. **Los PDF no están en el repositorio** (son de otras
  instituciones): el script dice las direcciones y recibe la carpeta donde se
  bajaron. **Ninguna lista trae todos los centros**: faltan sobre todo colegios
  (no hay ningún listado único), y son de entre 2018 y 2024. Por eso la
  herramienta propone y deja corregir, y la página lo dice abajo.
- **Cómo `jde-banco.js` junta chess-results con el MEP** (el nombre de chess-results
  lo escribió el árbitro; el del MEP es el oficial). Se comparan los «núcleos» de
  los nombres (sin tildes, sin «escuela», «de», «la»; «C.T.P.» y «Colegio Técnico
  Profesional» son «ctp»), **dentro de la regional**: el mismo núcleo y el mismo
  tipo, o las palabras que distinguen al centro todas dentro del nombre del otro
  si es el único candidato. Si la regional de chess-results no lo tiene (es la del
  torneo que jugó, no la suya: el «C.T.P. de Osa» jugó en Pérez Zeledón y es de
  Grande de Térraba) o no trae regional, vale solo si en todo el país hay **un**
  centro con exactamente ese nombre. **Con dos o más no se junta**: hay cientos de
  «Escuela Santa Elena» y juntar con la equivocada le pondría a alguien un
  circuito que no es el suyo. Resultado: de los 1 535 nombres de chess-results, 728
  se juntaron con un centro del MEP (con su circuito) y 807 quedaron aparte, sin
  circuito (colegios privados, otros que no están en los listados, nombres muy
  distintos), y los centros del MEP que nunca jugaron los JDE entran igual (la
  escuela de un docente que no jugó nunca tiene que aparecer). Los estudiantes de
  antes siguen al centro juntado.
- **Los archivos**: el Excel trae las columnas del reporte del MEP (Nombre, Sexo,
  FDN, Nombre de Centro Educativo, Dirección Regional, Categoría, Equipo/Ind,
  Torneo, Documento de identidad…) y **Pareo Integral lo abre con «Subir una
  lista»** y propone un torneo por grupo; el verificador comprueba que cada
  columna esté en `SINONIMOS_COLUMNA` de Pareo y que los valores se lean con los
  lectores de `grupos.js`. Las fechas van `AAAA-MM-DD` (sin ambigüedad día/mes).
  Un **segundo equipo** del mismo centro se manda con el nombre «Centro (equipo 2)»
  porque Pareo junta por nombre de institución. Un documento que es solo dígitos
  `TablaExcel` lo guarda como número (pierde ceros a la izquierda): las cédulas no
  los llevan. El PDF «nómina para firmar» sale con la marca de agua de Ajedrez
  Integral (`ReportePDF.generar` la pone sola), deja las firmas de la jefatura de
  delegación y del centro y dice que **no reemplaza la Boleta de Inscripción
  Oficial** de la Plataforma de los JDE (art. 59.a): esa es la que vale. Con
  errores pendientes se puede bajar igual, pero antes se pregunta.
- **Los equipos se inscriben completos y la herramienta no deja pasarse de lo
  permitido** (lo pidió el dueño del sitio después de la segunda versión). El
  modelo cambió (versión 2 del borrador): `estado.equipos` guarda cada equipo
  (`{ id, categoria, torneo: "w"|"m", numero }`) y cada estudiante que juega en
  uno lleva su `equipoId`; ya no hay «modalidad» ni «equipo 2» por persona. **La
  categoría y el torneo de quien está en un equipo son los de su equipo**, y el
  sexo de quien está en uno de Mujeres es mujer, fijo. Un borrador viejo se lee
  (`normalizar()`): todos quedan como individuales, nunca se inventa un equipo.
  - **Un tope se aplica al agregar, no solo se avisa.** `limites(estado)` devuelve
    lo que la Normativa no deja pasar, cada violación con una **clave estable**, y
    `intentar(estado, mutar)` hace el cambio y, si aparece una clave que antes no
    estaba, lo **deshace** y devuelve los motivos. Los que cuenta: más de 5 en un
    equipo (4 titulares y 1 suplente), una segunda suplente, más de 2 equipos por
    categoría y torneo, más de 2 individuales por categoría y torneo (estos tres
    desde la Etapa Regional: en la Institucional juega toda la población), un
    hombre en el equipo de Mujeres, alguien que por su edad no puede jugar en esa
    categoría (solo se sube A→B, C→D, D→E), más de 3 subidas por equipo (art. 18),
    subir con centros unidos (art. 19.f), una categoría que la etapa no juega
    (art. 53) y la misma persona dos veces (66.1.h).
  - **Las claves de cantidad llevan la cantidad** (`ind-cupo:D|m:3`): así un
    borrador que ya venía pasado no impide seguir trabajando, pero una más sí es
    una violación nueva y se rechaza. Si las claves no llevaran la cantidad, un
    borrador con tres individuales dejaría agregar un cuarto. Al deshacer,
    `intentar()` **conserva la identidad de los objetos**: la pantalla tiene
    cierres sobre cada estudiante y copiar de nuevo los dejaría apuntando a
    objetos que ya no están en el estado.
  - `crearEquipo()` (el primer número libre), `agregarIntegrante()` (el quinto de
    un equipo sin suplente queda como suplente; uno que ya estaba como individual
    puede pasar al equipo), `sacarDelEquipo()` y `agregarLista()` pasan todos por
    `intentar()`. **Una lista pegada o un Excel con «Equipo/Ind»** (y, si quiere,
    Categoría y Torneo) arma los equipos solo: los de equipo van a su categoría
    —la de la lista o la de su fecha de nacimiento— y se crea un equipo y un
    segundo cuando el primero se llena; lo que no cabe se **devuelve con su
    motivo** y la página lo dice con nombre («No se agregaron 1 estudiante: Ind
    Tres: …»). Quien puede ser de la B o la C sin saber si el centro es escuela o
    colegio se rechaza con esa explicación: nunca se adivina.
  - En pantalla: la sección «3. Equipos» crea un equipo con cuatro lugares de
    titulares (torneo y categoría a elegir, solo las de la etapa); cada
    integrante es una tarjeta (nombre, sexo, fecha, titular o suplente, documento).
    **Los lugares sin llenar no cuentan en la revisión** (si contaran, cuatro
    lugares vacíos llenarían la pantalla de errores): se dice «N lugares sin
    llenar» y el equipo sin nadie lleno es un error en la Regional. Con cinco, el
    botón «+ Integrante nuevo» queda con `aria-disabled` (no `disabled`, para que
    se alcance con el teclado y diga por qué) y el resumen dice «completo: no caben
    más»; si se toca igual, el sexto se rechaza con su motivo en un `role="status"`.
    «Pasar a individual», «Quitar» (un integrante) y «Quitar el equipo» (con
    confirmación) cambian la estructura y vuelven a pintar la lista; lo demás solo
    actualiza textos. El Excel trae una hoja «Equipos» (titulares primero y la
    suplente al final) además de la «Inscripción» que lee Pareo.

- **Ayuda para llenarla y para decidir** (lo pidió el dueño del sitio al preguntar
  cómo mejorar la herramienta; son seis cosas):
  - **«Para estar listo»**: una lista de tareas arriba de la revisión
    (`pendientes()`: el centro, la regional, el correo, la jefatura, el cuerpo técnico,
    «Faltan 2 fechas de nacimiento», un equipo al que le falta uno), cada una con un botón
    «Ir» que enfoca el campo (`irA()`). Cada equipo trae su propia línea «Faltan: 2 sexos,
    2 documentos» y «Ir al primero» (`faltantes()`). Los lugares vacíos de un equipo no
    cuentan (`esLugarVacio()`). Lo que dice la Normativa sigue abajo, tal cual.
  - **Menos tecleo**: «Traer de un borrador anterior (.json)» agrega a los estudiantes de
    otra inscripción **sin reemplazar nada**, con su sexo, fecha y documento; los que jugaban
    en un equipo vuelven a un equipo y, si el año cambió, la categoría se calcula de nuevo (y
    se dice). Se descartó guardar «la inscripción anterior» en el navegador por detrás:
    «Empezar de cero» promete borrar, y una copia escondida de datos de menores lo
    contradiría; por eso es el archivo que la persona baja. Los nombres del banco para ese
    centro salen en un `<datalist>` mientras se escribe, y quien jugó un torneo femenino trae
    el sexo puesto (solo ese dato, que es el seguro). Un individual se **arrastra** a un
    equipo por su agarradera «⠿ Arrastrar a un equipo» (la tarjeta no es arrastrable entera:
    los campos de texto se seguirían pudiendo seleccionar); el selector «Pasar a este equipo»
    sigue para teclado y celular, y el arrastre pasa por el mismo `agregarIntegrante()`, así
    que los topes valen igual.
  - **Ideas para completar los equipos** (`sugerencias()`): para un equipo de 1 o 2, de 3 o de
    4 sin suplente, nombra a los individuales que **caben** (`cabeEnEquipo()` lo prueba en una
    copia, con los mismos topes). Solo propone; nunca mueve a nadie. Y la sección de equipos
    dice cuántos clasifican a la Interregional de su regional.
  - **«Abrir en Pareo Integral»**: las filas del Excel pasan a `pareo.html#desde=inscripcion-jde`
    por `localStorage` (`ij_para_pareo_v1`; las dos páginas son del mismo sitio), sin bajar
    ni mandar nada. Pareo las lee **una vez**, las borra, vale diez minutos y entra por el
    mismo camino de «Subir una lista» (`subirLista` acepta un objeto con `filas`), así que
    propone los torneos por grupo igual.
  - **Robustez**: con tres estudiantes o más y sin bajar el borrador en la última hora se
    recuerda (solo se recuerda: `ij_descarga_v1`), y se probó con 60 estudiantes (8 equipos
    y 20 individuales): menos de 150 ms por tecla.
  - **El año**: la tabla de categorías de la página sale del año elegido, y con un año sin
    Normativa dice que los rangos son los de 2026 corridos un año. El verificador fija los
    rangos de `grupos.js` de 2026 (A 2017-2020, B 2013-2016, C 2012-2014, D 2009-2011, E
    2008 o antes): **si alguien los cambia por una Normativa nueva, esa prueba salta** y
    obliga a revisar esta página y sus textos, que repiten esos años.
- **Lo que no hace, a propósito**: no verifica el puesto de quien clasificó a la
  Interregional o la Nacional (no tiene los resultados de la etapa anterior; eso
  lo hace Pareo con «Clasificados»), no sabe cuántos inscritos habrá por categoría
  en la región (así que el sistema suizo o todos contra todos no se calcula acá,
  solo se explica), y no lleva la delegación de una disciplina distinta del
  ajedrez.

`herramientas/verificar-inscripcion-jde.js` lo prueba: cada regla con un caso que
la cumple y uno que no (las categorías de 2008 a 2021, el ascenso, la unión de
centros, las etapas, los equipos, el cuerpo técnico, los documentos, la
Interregional), **los topes al agregar** (el sexto integrante, el tercer equipo, el tercer individual, la lista de tareas y las ideas, el borrador anterior, el arrastre a un equipo, los nombres del banco, «Abrir en Pareo Integral» con una lista vencida, 60 estudiantes, los rangos del año, un hombre en Mujeres, la edad, el cuarto ascenso, centros unidos, una lista con «Equipo/Ind», que lo rechazado no deja rastro y que un borrador ya pasado no se amplía), el Excel contra Pareo, pegar una lista (con y sin títulos, fechas
día/mes y mes/día, sexos y fechas que no se entienden quedan vacíos), un borrador
adulterado, el generador del banco con datos inventados y el banco real al día, y
en un navegador el combobox con teclado, traer y pegar estudiantes, la categoría
y el torneo que cambian solos, el Excel y el PDF con lo escrito, guardar, bajar y
abrir el borrador, un nombre con HTML, 400 px sin desplazamiento y el contraste de
los hallazgos en claro y en oscuro (mínimo 4,5:1). El CSV del MEP (4 000 centros, las 27 regionales,
código único, circuito de dos cifras), cómo se junta con chess-results (por
regional, por nombre único en el país, sin juntar los ambiguos) y la lista
según lo marcado (`centrosDe()`, `circuitosDe()`) también se prueban, y en el
navegador el flujo completo: marcar regional y tipo, la lista, elegir un centro y
ver el circuito, cambiarlo a mano, cambiar de regional, un centro sin circuito,
el botón ▾ y el camino de escribir el nombre sin marcar nada, y el de los equipos:
crear, llenar hasta cinco, el botón apagado, el sexto y el tercer equipo
rechazados, la fecha que no deja jugar y se deshace, quitar un equipo y que el
borrador lo guarde. Rompiendo a propósito las categorías de la Interregional, el
correo, el circuito automático, el borrado al cambiar de regional o el tope de 5,
salta.

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
- **Nueve fichas, tres por fila**: «Contacta a la organización» ya no es
  ficha, porque la abre la despedida del pizote al final, y el correo de la
  organización va dentro de esa ventana, debajo de las tres personas. En el
  celular, de a dos, la última ficha ocupa la fila entera para que no quede
  una sola. **Van ordenadas por lo que más se usa**, como pidió el dueño:
  Bases, Pedir un bye, Resultados en vivo, Partidas en vivo y Calendario de
  rondas; después Reglamento, Grupo de WhatsApp, Cómo llegar y, al final,
  Hoteles oficiales (para cuando ya se está en el torneo, casi no se usa). Arriba, cada ficha lleva la bandera de Costa Rica
  (1-1-2-1-1, con sus colores oficiales) y una fila de casillas de tablero; el
  color de las bases queda en el ícono.
- **El pie de página no lleva el contacto de Ajedrez Integral**: en esta
  página quien pregunta es un jugador del torneo, y el único contacto que le
  sirve es el de la organización (la despedida del pizote). El pie queda con
  la marca, los enlaces del campeonato y lo legal.
- **La ficha del Centroamericano en Torneos** (`torneos-en-vivo.html`) lleva
  la misma cara que la página: el morado de las bases, la bandera arriba, el
  pizote del trofeo y los botones blancos, el primero en rojo. La sala sigue
  en `salas_torneo` como cualquier otra (sus textos y enlaces se editan en
  `admin.html#torneos`); lo que la viste es su clave, `centroamericano-2026`,
  en `PORTADAS` de `js/salas-torneo.js`, y el estilo va en
  `css/centroamericano.css` (una sola copia de los colores), que por eso
  cargan también `torneos-en-vivo.html` y `admin.html` (la vista previa del
  editor es la misma ficha). Contraste: blanco sobre #5A5FA3 5,83, #40478F
  sobre blanco 8,35 y blanco sobre el rojo 5,6.
- **Sus botones nunca sacan a nadie del sitio** (lo pidió el dueño). «Toda la
  información» abre la página en la misma pestaña, y lo que es de afuera
  —«Resultados en vivo» (chess-results) y las bases— lleva a SU ficha en la
  página: `/centroamericano-2026.html#resultados` (la elección de categoría,
  ver «Un torneo por categoría») o `#ficha-bases`.
  `js/ventana-enlace.js` abre encima la ficha `a[data-ventana]` que nombra el
  `#` al entrar y lo quita al cerrar. La correspondencia está en `fichas` de
  `PORTADAS` (por la dirección, así sigue valiendo aunque en
  `admin.html#torneos` cambien el texto del botón); un enlace de afuera sin
  ficha lleva a la página entera. En las demás salas, un enlace al propio
  sitio también queda en la misma pestaña (nombrar ajedrez-integral.com no es
  irse) y lo de afuera sigue en otra, con su ↗. Lo revisa
  `verificar-centroamericano.js`.
- **En el celular, un PDF no va en el marco.** El dueño abrió las bases en su
  Android y la ventana decía «Este contenido está bloqueado. Comunícate con el
  propietario del sitio», aunque el PDF es del mismo sitio y
  `frame-ancestors 'self'` lo deja: el visor de PDF del celular no se deja
  meter en un marco (Safari, en el iPhone, muestra solo la primera página).
  En la computadora sí funcionaba, y por eso ningún verificador lo vio.
  Ahora `js/ventana-enlace.js` deja que un enlace a un `.pdf` abra su
  pestaña (su `target="_blank"`) cuando el aparato es táctil
  (`pointer: coarse`) o no tiene visor (`navigator.pdfViewerEnabled`), y al
  entrar con `#ficha-bases` no abre nada: una pestaña nueva no se abre sin
  que la persona toque. Lo demás (chess-results, el formulario del bye)
  sigue abriéndose encima. El verificador lo prueba con un celular simulado.
- **La ficha del Desafío Mentes Maestras** (la sala `cenfotec`, de la
  Universidad CENFOTEC) lleva lo mismo que la del Centroamericano pero con la
  cara de la universidad (lo pidió el dueño): el azul de su imagen (#233065
  arriba a #1C3F7F abajo) con una cuadrícula tenue de circuito, la línea y la
  luz celeste (#23ACF4, el de su «×») arriba, su logo en lugar del emoji y
  «Entrar a la sala» en celeste. El logo sale recortado tal cual de la imagen
  que pasó el dueño, sin redibujarlo, en blanco con transparencia
  (`img/cenfotec/logo.png`); como el título ya dice CENFOTEC, va con `alt=""`
  y `aria-hidden`. Es la misma maquinaria: su clave en `PORTADAS` de
  `js/salas-torneo.js` y el estilo en `css/universidades.css`, que cargan
  `torneos-en-vivo.html` y `admin.html`. Cada portada pone su `clase` y de
  ella salen `<clase>-imagen`, `<clase>-boton` y `<clase>-principal`; como
  esta sala es de Lichess, sus otros enlaces van de botón blanco (el enlace
  subrayado de siempre no se lee sobre el azul). Contraste: blanco sobre
  #233065 12,48 y sobre #1C3F7F 10,16; #141C40 sobre el celeste 6,52 (el
  celeste con letra blanca da 2,5: no se usa así); #233065 sobre blanco
  12,48. La luz parpadea, pero con «menos movimiento» se queda quieta.
  `verificar-centroamericano.js` lo revisa junto a la del Centroamericano.
- **«Hoy en el torneo»**, entre quien organiza y las fichas, lo arma
  `js/centroamericano.js` con las horas del calendario: cada fila de
  `#calendario` lleva su `data-inicio` (hora de Costa Rica, que no tiene
  horario de verano: siempre UTC−6) y `data-minutos` (lo que dura: una ronda,
  5 horas). Antes del 1 de noviembre, la cuenta regresiva y cuándo es la
  ronda 1 (`data-primera-ronda`); durante, lo que se juega ahora y lo que
  sigue, o lo próximo con cuánto falta; después, el cierre. Una sola copia de
  las horas: la tabla. Sin JavaScript queda un texto que es cierto siempre.
- **Sin internet**: la sala se llena y la señal falla. La página se guarda
  entera en la caché `ajedrez-integral-sin-red` (la de «Ejercicios sin
  internet», que `sw.js` no borra al cambiar de versión): ella con y sin
  `.html`, todo lo que cargó del sitio (scripts, hojas, imágenes, fuentes) y
  el PDF de las bases. Se vuelve a guardar cada vez que se abre con señal, y
  la franja de hoy lo dice («quedó guardada en este aparato»). Sin esto, la
  primera visita no quedaba: el service worker todavía no controlaba la
  página y su copia sale recién de la segunda.
- **En inglés**, con el botón «English» del encabezado («EN» en el celular),
  para las delegaciones del Caribe de habla inglesa. Los textos van en
  `js/centroamericano-en.js`, cada uno con el suyo; los que quedan igual (un
  nombre, un hotel) también van, para que el verificador avise de cualquier
  texto nuevo sin traducir. Se cambian los nodos de texto y `alt`,
  `aria-label`, `title` y `data-ventana`, también lo que se arma después (la
  ventana de las bases), y al volver al español queda exactamente como
  estaba. La elección se recuerda en el aparato y `?lang=en` manda. **Sin
  elección va en español, aunque el navegador esté en inglés**: tomarlo del
  navegador cambiaba la página a quien tiene el celular en inglés, y también
  a los verificadores, que corren en un Chromium en inglés.
- **Cómo llegar desde cada hotel**: cada uno con dirección trae «Ruta a la
  sala» (Google Maps, del hotel al Gimnasio Nacional) junto a «Ver en el
  mapa», y la nota de arriba ofrece Waze una sola vez (Waze no deja elegir el
  origen: sale desde donde se está). El Wyndham no lleva ruta: su dirección
  sigue por confirmar.
- **Lo que se comparte lo genera `herramientas/centroamericano-imagenes.js`**
  y no se edita a mano: `img/centroamericano-2026/compartir.jpg` (la imagen
  de 1200 × 630 de WhatsApp, `og:image`) y
  `documentos/centroamericano-2026/cartel-centroamericano-2026.pdf` (tamaño
  carta, con el QR a la página, la línea en inglés y la marca de agua de
  Ajedrez Integral; está en `LIBROS` de `verificar-marca-agua.js`). El QR sale
  de la misma librería del sitio (`js/vendor/qrcode.js`) y se comprobó
  leyéndolo con jsQR. La imagen usa el pizote de la portada y no el del
  trofeo: ese mide 124 px en las bases (no hay uno más grande) y salía
  borroso.
- **Busca a tu jugador y el medallero**: arriba de las fichas, un buscador
  (nombre o apellido, sin tildes y en cualquier orden) que dice de cada
  jugador su categoría, su puesto en ella, sus puntos y su mesa, color y rival
  en la ronda emparejada más reciente, o si tiene bye; y la ventana
  `#medallero`, con los tres primeros de cada categoría y las medallas de cada
  federación (provisional hasta la última ronda). Lo arma
  `js/centroamericano-vivo.js` con la Edge Function **`sala-jugadores`**, que
  lee chess-results del lado del servidor (no manda CORS). **No es un proxy
  abierto**: recibe la clave de la sala de Torneos (`centroamericano-2026`) y
  lee solo los torneos de chess-results que esa sala tiene entre sus
  enlaces, que se editan en `admin.html#torneos` (si la organización parte el
  torneo en uno por categoría, basta con sumar los enlaces), y de cada uno
  dos páginas fijas: la clasificación (`art=1`, con el «Gr» de cada jugador,
  que es su categoría) y la ronda emparejada (`art=2`). Lo leído se guarda 90
  segundos en `pizarras_cache`, como la pizarra de la sala de cine. El formato
  de las dos páginas se comprobó con las reales, pedidas desde la base con
  `pg_net`: la lista del Centroamericano (436 jugadores, ronda 0) y la ronda
  1 del UTN-CONARE 2026, con su bye. Los datos se piden la primera vez que
  alguien busca o abre el medallero, no a cada visita, y lo último que llegó
  queda en el aparato: sin señal se muestra eso, con la hora en que se leyó.
- **Mi delegación**: debajo del buscador, un `<select>` con los países que
  hay en la clasificación (por su nombre, con el código de FIDE; los que no
  están en `PAISES` de `js/centroamericano-vivo.js` salen con el código) y,
  al elegir uno, todos sus jugadores por categoría, de la menor a la mayor,
  con la misma tarjeta del buscador. El país queda en el aparato
  (`cac_delegacion_v1`) y, al volver, los datos se piden de una vez. La lista
  de países se rearma solo si cambió: rearmarla con el `<select>` abierto lo
  cerraba en el celular.
- **Seguir a mis jugadores y los avisos en el celular**: cada tarjeta lleva
  una estrella (☆/★, con `aria-pressed` y «Seguir a…»/«Dejar de seguir a…»;
  la forma dice el estado, no el color) que pone al jugador en «Mis
  jugadores», arriba del buscador. Se guarda en el aparato, sin cuenta
  (`cac_seguidos_v1`, como mucho 20): el número del torneo, el número inicial
  y el nombre. **El número inicial puede cambiar** antes de la ronda 1, si el
  árbitro vuelve a ordenar la lista: si ya es de otra persona, la página y la
  función buscan al seguido por su nombre (sin tildes; si hay dos iguales, no
  se adivina) y la página corrige el número guardado.
  «Avisarme en este celular» manda una notificación con la mesa, el color y
  el rival en cuanto chess-results publica cada ronda («Ronda 4: Mayorga
  Araya, Sofia» / «Mesa 12, con blancas contra…»). Es la misma maquinaria de
  push de Pareo Integral (`_compartido/webpush.ts`, las llaves de
  `push_llaves_leer()`, el `sw.js` que ya muestra el aviso), con tablas
  propias: `sala_suscripciones_push` (el endpoint, sus dos llaves, la sala, el
  idioma y la lista) y `sala_avisos_push_enviados` (cada aviso se anota ANTES
  de salir y su clave primaria impide que salga dos veces). Ni `anon` ni
  `authenticated` tienen nada sobre ellas: solo las toca la función.
  - El permiso se pide **solo al tocar el botón**. La función recibe la
    lista ENTERA cada vez que cambia (como las `set_*`: mandar solo el nuevo
    dejaba de seguir a los demás) y también al cambiar el idioma; con la
    lista vacía, la página da de baja el aparato.
  - **Un aparato nuevo** pasa por `sala_avisos_frenar()` (40 por hora por
    conexión y 300 en total) y recibe un aviso de prueba; **uno que ya estaba**
    (mismo endpoint y mismas llaves) solo cambia su lista, sin freno ni otra
    prueba: si no, cada estrella mandaba una notificación. El tope por
    conexión empezó en 10 y se subió a 40 antes de usarse: una delegación
    entera sale a internet por el wifi del mismo hotel.
  - Quién revisa: pg_cron `sala-avisos`, cada 5 minutos y solo del 1 al 8 de
    noviembre (UTC), llama a «revisar» con el secreto `sala_avisos_secreto`
    de la bóveda, como `torneos-externos`; sin suscripciones ni se llama. Por
    eso la función va con `verify_jwt` en false.
  - Se borran solas 30 días después del último cambio (pg_cron
    `sala-avisos-limpiar`), como dice `privacidad.html#torneos`.
  - El verificador no tiene un servicio de push: el doble concede el
    permiso, da una suscripción que dura entre recargas y anota lo que se le
    manda a la función.
  - **Tres avisos, no uno** (lo pidió el dueño después): el recordatorio
    30 minutos antes de cada ronda («La ronda 5 empieza a las 3:00 p. m.»,
    con la mesa de cada seguido si el pareo ya salió), el pareo y el
    **resultado** («Ronda 4: Mayorga Araya, Sofia ganó», con su puesto en la
    categoría solo si la clasificación de chess-results ya está al día con
    esa ronda: si no, diría el puesto de antes). Si cuando se revisa ya hay
    resultado, el pareo de esa ronda no sale: solo el resultado. Los tres
    van en `sala_avisos_push_enviados` con su `tipo`; el recordatorio es uno
    por aparato y ronda (`tnr` '0', `no` 0).
  - **La hora del recordatorio no se escribe dos veces**: la función lee el
    `.ics` del calendario de la página (`CALENDARIOS` en
    `sala-jugadores/index.ts`), que genera `herramientas/centroamericano-imagenes.js`
    a partir de la tabla de `#calendario`; toma los eventos «Ronda N» y lo
    guarda una hora. Como pg_cron pasa cada 5 minutos, el aviso sale entre
    35 y 30 minutos antes.
- **Las rondas de cada jugador, su rendimiento y compartirlo**: la función
  lee también el cuadro cruzado por número inicial (`art=5`) y le pone a cada
  jugador sus rondas en `r`, tal cual las escribe chess-results («5w1» = con el
  5, blancas, ganó; «9b½»; «12w+» / «3b-», por incomparecencia; «-1», bye de un
  punto; «-0», no jugó; vacía, sin jugar todavía; el formato se comprobó con
  el UTN-CONARE 2026, 6 rondas). «Sus rondas» en cada tarjeta las muestra con
  el color, lo que hizo y el rival, más la de hoy del pareo («juega contra»),
  y el **rendimiento de FIDE** (promedio de los rivales + dp de la tabla
  8.1b): solo las partidas jugadas contra rivales con Elo, sin byes ni
  incomparecencias. La tabla dp es la de Pareo Integral
  (`js/pareo/desempates.js`, `dpDeP`), que la página carga: una sola copia.
  «Compartir» arma una imagen de 1080 × 1080 (el nombre, la categoría, el
  puesto y los puntos, la última ronda, el pizote y la bandera) con la marca
  de agua de `js/tabla-imagen.js` (`TablaImagen.marcar`, la misma copia), y
  la manda con el menú de compartir del celular o, si no hay, la baja.
- **El resumen de la ronda de Mi delegación**: arriba de la delegación
  elegida, la última ronda con algún resultado contada («Ronda 3: 7 ganadas,
  3 en tablas, 2 perdidas, 1 sin jugar») y «Copiar para WhatsApp» con cada
  jugador y el enlace. «-0» cuenta como «sin jugar», no como bye: en
  chess-results es que no se presentó o no estaba.
- **La clasificación, la tabla por país y el pareo para proyectar**
  (`js/centroamericano-tablas.js`, con los datos de `window.CentroamericanoVivo`):
  - `#clasificacion`: cada categoría entera, con el puesto dentro de ella, los
    puntos y el rendimiento, y un buscador.
  - `#delegaciones`: por país, los puntos, los posibles (un punto por ronda
    con resultado, también los byes), el porcentaje y lo que sumó en cada
    ronda; ordenada por el porcentaje (si no, ganaría el país con más
    jugadores). Antes de la ronda 1, cuántos jugadores trae cada uno.
  - `#proyector`: toda la pantalla, letra grande, una categoría por pantalla
    (12 mesas por página) que pasa sola cada 15 segundos, con la hora, «Pausa»
    y «Pantalla completa»; se pone al día cada minuto. Para una TV en la sala:
    se abre con `centroamericano-2026.html#proyector`. Blanco sobre #1E2453,
    14,7 : 1.
- **Seguir a toda la delegación** (para jefes de delegación y entrenadores):
  en «Mi delegación», «Avisarme del resumen de Costa Rica en cada ronda» pide
  un solo aviso por ronda con el país entero («CRC · Ronda 4: 9 ganadas, 3 en
  tablas, 2 perdidas, 1 bye: 10½ de 14 puntos en sus partidas»), que sale
  cuando TODAS sus partidas de esa ronda tienen resultado
  (`resumenDelegacion()` en la función). Es la misma suscripción del aparato:
  `sala_suscripciones_push.delegacion` guarda solo el código de FIDE, y la
  lista de jugadores puede quedar vacía si sigue a un país. Un país por
  aparato; apagar los avisos apaga también el del país. El recordatorio de
  la ronda le dice cuántos de su país juegan.
- **El enlace directo a un jugador**: «Copiar enlace» en cada tarjeta da
  `centroamericano-2026.html#jugador=<torneo>-<número>-<nombre>`; al abrirlo,
  la página busca al jugador, abre sus rondas y le pone el foco. El nombre va
  en el enlace para que se lea y para encontrarlo si el árbitro le cambió el
  número antes de la ronda 1 (si hay dos con el mismo, no adivina).
- **Cómo va la ronda**: «Ronda 4: 142 de 218 partidas terminadas», con su
  barra, arriba del buscador y en el proyector (los byes no cuentan). Sale
  de la ronda emparejada (`progresoRonda()`), así que aparece cuando la
  página ya tiene los datos.
- **Sorpresas e invictos** (`#sorpresas`): las partidas en que el de menos
  Elo puntuó contra el de más (los dos con Elo y jugada en el tablero; unas
  tablas pesan la mitad), de la última ronda y de todo el torneo, y quién no
  ha perdido ninguna partida en cada categoría (un bye o un «-0» no son
  partidas).
- **El resumen de la delegación como imagen**: el mismo de «Copiar para
  WhatsApp», en una imagen de 1080 de ancho (hasta 14 jugadores y «y N más»)
  con la marca de agua, por `compartirBlob()`, que comparte también la del
  jugador.
- **El proyector**, además del pareo: la clasificación de cada categoría
  después de su pareo (o solo uno de los dos: «Pareo y clasificación», «Solo
  el pareo», «Solo la clasificación», guardado en ese aparato), cómo va la
  ronda, un QR a la página en la esquina (`js/qr-svg.js`) y, con el torneo
  terminado, los podios primero.
- **Su puesto ronda a ronda** (en «Sus rondas» y en la imagen del jugador):
  `puestosDe()` cuenta los puntos de cada jugador de su categoría tras cada
  ronda del cuadro cruzado (la ronda que solo está en el pareo todavía no) y
  da el puesto **por puntos**: con los mismos puntos el puesto se comparte
  («2.º–3.º»), porque chess-results no publica el desempate de cada ronda
  intermedia y ponerle uno inventado sería decir algo que no se sabe. La nota
  de abajo lo explica cuando hay un puesto compartido. En la imagen va
  debajo de la última ronda; para que quepa antes de la dirección, el
  recuadro se achica un poco y la ronda va en 36 en lugar de 38.
- **«Así terminó el día»** (el botón «Imagen del día para compartir», debajo
  de los enlaces del buscador): una imagen de 1080 de ancho con los líderes
  de cada categoría, la sorpresa más grande del día y, si en ese aparato hay
  una delegación elegida, cómo le fue hoy. El día es el de la **última ronda
  con todas sus partidas terminadas** (`rondaCerrada()`: con la ronda
  emparejada a medias, la anterior), y sus rondas salen de la tabla del
  calendario (`data-ronda` en cada fila, junto a su `data-inicio`: una sola
  copia de las horas). Si ese día todavía tiene otra ronda por jugar, dice
  «Así va el día». Los líderes son los de más puntos tras esa ronda, no los
  de la clasificación de chess-results, que ya puede traer resultados de la
  siguiente; con un empate va el primero de chess-results y «empatado con N
  más». Cada líder tiene hasta dos renglones: sus puntos no se cortan con
  «…». Lleva la marca de agua, como las otras imágenes.
- **La hoja de la delegación en PDF** («Hoja de la delegación para
  imprimir», arriba de la lista de Mi delegación): lo que el entrenador
  lleva en la mano en la sala. Una tabla por categoría con la mesa, el
  jugador, sus puntos, el color, el rival (con su federación y su Elo) y el
  resultado de la ronda emparejada, y abajo cuándo se leyó chess-results y
  que lo oficial es lo que publica el árbitro. La arma `js/reporte-pdf.js`
  (la misma copia de los demás PDF del sitio), que le pone la marca de agua
  con `js/marca-agua.js`; para el inglés se le sumó `documento.pagina` (el
  número de página en otro idioma). **En una A4 de pie no caben más
  columnas**: con el Elo propio y el puesto, el nombre del rival se cortaba
  («Santiago Jos...»), y el rival es justo lo que se busca en la sala; el
  verificador revisa que llegue entero.
- **El certificado de cada jugador** (antes decía «Diploma»: el dueño pidió
  que todo diga «certificado»; por dentro el código sigue llamándolo
  `diploma()`, y el verificador revisa que en el lienzo no se escriba
  «diploma»): con el torneo terminado (la clasificación
  final de chess-results, `normalizar()` lo marca `terminado`), cada tarjeta
  trae «Certificado (PDF)» y «Certificado (imagen)». Es un A4 acostado (2339 × 1654)
  dibujado en un lienzo **con la cara de las bases** (lo pidió el dueño): el
  morado degradado de la portada, las hojas en las esquinas, la letra blanca
  en mayúsculas con su sombra y la píldora roja con el evento, como «XXI
  CAMPEONATO» en las bases; el pizote del trofeo arriba, el nombre **al
  derecho** («WIM Sofia Mayorga Araya», chess-results lo escribe
  «Apellidos, Nombre»), el país, el lugar con la medalla a los dos lados del
  título si quedó en el podio (y escrito: «1.er lugar (oro)», el color nunca
  va solo) o «por su participación», los puntos y el puesto, y la marca de
  agua. **Sin firmas**, lo decidió el dueño: lo arma la página, no la
  organización. La imagen va con el menú de compartir del celular; el PDF es
  esa misma imagen en una página A4 acostada, con `ReportePDF.deImagen()`
  (nuevo en `js/reporte-pdf.js`, la misma copia de los PDF del sitio). El
  nombre largo achica la letra, nunca se corta. Otra página puede cambiar el
  evento, el lugar y el dibujo con `window.TorneoPagina.diploma`.
- **Cara a cara** (`#cara-a-cara`): se eligen dos jugadores (escribiendo el
  apellido, con la lista de todos en un `<datalist>`; si el nombre da uno
  solo, no hace falta elegirlo) y salen dos fichas lado a lado —una debajo de
  la otra en el celular, porque una tabla de tres columnas obligaba a
  correrla de lado— con su categoría, país, Elo, puesto, puntos y
  rendimiento; la partida entre ellos (la primera vez que se enfrentaron, o
  la de hoy si les toca) y cada ronda con una línea por jugador y su puesto
  después. Si son de categorías distintas, lo dice: no se pueden enfrentar.
- **Pendiente: el plano de la sala** (en qué zona del Gimnasio Nacional queda
  cada mesa, junto a su pareo). Espera el croquis de la organización con
  cómo se acomodan las mesas.
- **Se instala como su propia app**: `manifest-centroamericano-2026.json`
  (otro `id`, arranca en la página, el pizote como ícono) en lugar del de la
  Academia, que arranca en `clases.html` y le pide cuenta. Lo pone
  `herramientas/pwa-cabecera.py` (`PROPIAS`), y `verificar-pwa.js` lee esa
  lista para revisar el manifest, los íconos y que la página lo declare. Los
  íconos los genera `herramientas/centroamericano-imagenes.js` (el pizote en
  un círculo blanco sobre el morado; el «maskable» con margen para que
  Android no le corte la cara). El botón «Instalar» es el de `js/pwa.js` (solo
  cuando el navegador deja, una vez); en iPhone, que no tiene ese aviso,
  `js/centroamericano.js` explica «Compartir → Agregar a inicio» hasta que se
  toca «Entendido». Instalada, los avisos pueden llegar también en iPhone.
- **Rapid y Blitz**: cuando la organización los publique en chess-results,
  basta con sumar sus enlaces a la sala en `admin.html#torneos`: el
  buscador, los avisos, la clasificación y el proyector los toman solos.
- **Agregar a mi calendario**:
  `documentos/centroamericano-2026/calendario-centroamericano-2026.ics`, con
  cada actividad de la tabla (en UTC, que cualquier calendario muestra en su
  zona), un aviso 30 minutos antes de cada ronda, el nombre en los dos
  idiomas, la llegada y la salida en los hoteles y el congresillo como
  virtual. Lo genera `herramientas/centroamericano-imagenes.js` a partir de la
  tabla, y el verificador compara hora por hora. Es un archivo y no algo que
  arme el navegador porque el celular (también el iPhone) abre un `.ics` con
  su calendario.
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


### Un torneo por categoría

Para el festival, la organización parte el torneo de chess-results en doce:
uno por categoría y rama (Sub-8 a Sub-18, Absoluto y Femenino), cada uno con
su número. Antes era uno solo, y la categoría de cada jugador salía de su
columna «Gr». Lo preguntó el dueño: «¿la página está lista para acoplar todo
y que se vea ordenado? Que no sea mucha información por todo lado». Quedó
probado con doce torneos de prueba (chess-results no se puede leer desde la
sesión), con la forma que les da la función.

- **La categoría la dice el texto del enlace**, no la columna «Gr», que un
  torneo de una sola categoría ya no trae. Cada torneo se agrega en
  `admin.html#torneos` como un enlace más de la sala `centroamericano-2026`,
  con su categoría en el texto: «Sub-10 Femenino», «U10F» o «Resultados U10
  Girls», cualquiera sirve. `codigoCategoria()`, en
  `supabase/functions/sala-jugadores/torneos-sala.ts`, lo pasa al código de
  chess-results (`U10F`), y la función se lo pone a cada jugador que no
  traiga «Gr». **Un enlace sin categoría en el texto** (la lista general, el
  Rapid) no se cuenta mientras haya alguno con categoría: sus jugadores ya
  están en el suyo y saldrían dos veces en el buscador y en el medallero. La
  misma regla está en `deCategorias()` (la función) y en `normalizar()`
  (`js/centroamericano-vivo.js`); esos torneos quedan en `datos.otros`,
  solo como enlace. La función lee hasta 15 torneos por sala: las doce
  categorías del clásico caben, pero el Rapid y el Blitz por categoría (36)
  irían en salas aparte.
- **«Resultados en vivo» abre primero la elección**: un diálogo
  (`#resultados`) con una fila por edad y Absoluto y Femenino lado a lado,
  y cada botón abre su torneo encima, en la ventana de siempre, sin salir del
  sitio. Al cerrarla se vuelve a la elección, con el foco en el botón. Una
  categoría que todavía no publicaron deja su hueco, así la fila no se corre.
  La ficha sigue apuntando a chess-results para quien no tiene JavaScript, y
  con un solo torneo (como hasta ahora) lo abre directo, sin elegir nada.
  Blanco sobre el morado de las bases: 8,35.
- **En Torneos, un solo botón.** La sala tiene un enlace por categoría (de
  ahí lee la página los datos), pero en la ficha todos llevarían al mismo
  lugar, así que `juntar()` (`js/salas-torneo.js`) los deja en un solo botón
  con el nombre de su ficha (el tercer dato de `fichas` en `PORTADAS`:
  «Resultados en vivo») y lleva a `#resultados`. Solo se juntan los de una
  ficha con nombre: las dos transmisiones de la UTN llevan a la misma página
  y siguen siendo dos botones (lo revisa `verificar-salas-torneo.js`).
- **Cada categoría va a su paso.** Las bases piden Round Robin si una
  categoría tiene 10 jugadores o menos, y entonces termina antes. La barra de
  la ronda cuenta solo las mesas de la ronda más alta emparejada; «Así terminó
  el día» usa la ronda cerrada en TODAS (`progresoRonda().cerrada`): una
  categoría que va atrás la baja, y una que ya jugó su última ronda no. El
  medallero dice «final» cuando terminaron todas.
- **Un aviso por país, no doce.** El resumen de la delegación juntaba cada
  torneo por separado; con doce, un país con jugadores en todas las
  categorías habría recibido doce avisos por ronda. Ahora
  `resumenDelegacion()` junta todos los torneos de la sala y sale una vez por
  ronda (con `tnr` «0» en `sala_avisos_push_enviados`), cuando terminaron
  todas sus partidas. Una categoría que todavía no emparejó esa ronda lo hace
  esperar, salvo que ya haya terminado.
- **Quien seguía a un jugador en el torneo de antes no lo pierde.** Si su
  torneo ya no está en la sala, la página lo busca por su nombre en todos y
  corrige el torneo y el número guardados, y le vuelve a mandar la lista a la
  función, que también lo busca por su nombre. Un enlace `#jugador=` de antes
  lo encuentra por el nombre que lleva: su número solo vale en su propio
  torneo, porque en otro es otra persona.
- Lo revisa `verificar-centroamericano.js`: la parte de la función con node
  (`--experimental-strip-types`, sin Deno) y la página con doce torneos de
  prueba más la lista general.


### El Elo, los colores, cada categoría a su paso y el informe de la delegación

Las pidió el dueño entre las mejoras del Centroamericano («2, 3, 4, 5, 8, 9»).
Todo se arma con los mismos datos de `sala-jugadores`, sin pedir nada más a
chess-results.

- **El Elo FIDE que gana o pierde cada jugador** sale en «Sus rondas» con la
  misma cuenta que Pareo Integral (`js/pareo/elo.js`: lo esperado de la tabla
  8.1.2, el tope de 400 y su K). Una sola copia de las reglas de FIDE: la
  página carga ese módulo, no lo repite. Cuentan solo las partidas jugadas
  contra rivales con Elo (ni byes ni incomparecencias, ni la ronda sin
  resultado).
  - chess-results no publica la edad, así que se toma la menor posible de su
    categoría (Sub-18 → 17 años). Por eso, debajo de 2300 el K es 40, aunque a
    quien cumple 18 este año FIDE le pone 20.
  - Lo dice la línea: «una cuenta de este torneo; lo oficial lo publica FIDE».
- **Con blancas y con negras**: cuánto hizo con cada color, en «Sus rondas» y
  para el país entero en el resumen de «Mi delegación».
- **«A otro paso»** en «Hoy en el torneo»: con un torneo por categoría, la
  línea nombra solo las categorías que no van con la mayoría (la que ya
  terminó, como un Round Robin, y la que va en otra ronda). Si todas van
  igual, no sale. Los datos no se piden en cada visita: se pintan con lo
  guardado en el aparato y se piden durante el festival solo si lo guardado
  ya dice que el torneo está partido.
- **El proyector con una sola categoría**, para la pantalla de cada sala de
  juego: se elige en el selector nuevo y queda en el aparato. Al hacerlo
  salió un error de antes: pasaba los podios de TODAS las categorías en
  cuanto terminaba un torneo cualquiera. Ahora pasa solo los de las
  categorías que terminaron.
- **El medallero por país ya existía.** Lo nuevo es que cada podio dice si es
  final o hasta qué ronda va, y debajo de la tabla dice cuántas categorías ya
  tienen su podio final.
- **El informe de la delegación en PDF** (`documentoInforme()`), para la
  federación:
  - de cada jugador, su categoría, su puesto (con la medalla), sus puntos, su
    rendimiento, su Elo y lo que hizo con cada color;
  - del país, sus puntos, sus medallas, sus colores y la suma de su Elo.
  Es provisional hasta que terminan todas las categorías donde juega el país
  y lleva la marca de agua de `js/reporte-pdf.js`. El botón aparece en «Mi
  delegación» cuando ya se jugó alguna ronda.
- Lo revisa `verificar-centroamericano.js`, cada cuenta con su valor
  calculado aparte (el Elo de una jugadora de prueba: 0,45 + 0,60 + 0,78 =
  1,83 esperado y 40 × (3 − 1,83) = +46,8). Antes de darlo por bueno, rompí
  a propósito cada pieza y cada una saltó.

### Los avisos de la organización, el festival en números y todos los certificados

Las pidió el dueño entre las mejoras («5, 6 y 7»). La 7 era una «constancia
de participación», pero eso ya existía: el certificado de cada jugador dice «por
su participación» aunque no tenga medalla. En su lugar se hizo lo que faltaba:
bajar todos los certificados de una delegación en un solo PDF.

- **Los avisos de la organización** («la ronda 6 se atrasa 30 minutos»):
  - Se publican en `admin.html#torneos`, debajo de las salas: la sala, el
    texto (y el inglés, si se quiere), cuántas horas dura (de 3 a 72). Antes
    de mandarlo pregunta, porque sale a los celulares y eso no se deshace.
  - Viven en `sala_anuncios`. Quien decide es la base: los escribe solo
    `sala_anuncio_publicar()`, que pide `soy_admin()` (con su `coalesce`); la
    tabla no tiene política de escritura y nadie puede insertar directo.
    `anon` lee solo las columnas del aviso (no `creado_por`) y la política
    deja ver solo los vigentes de salas publicadas. Lo comprobé impersonando
    `anon`, una cuenta común y una de admin dentro de una transacción
    revertida.
  - El tope de 72 horas lo pone un `check` de la tabla, no la pantalla: un
    aviso viejo olvidado no puede quedarse pegado en la página.
  - En la página salen arriba de «Hoy en el torneo», en rojo con letra blanca
    (5,6:1), los tres últimos, con su hora en hora de Costa Rica. Se piden cada
    5 minutos, y al volver a la pestaña si pasó más de un minuto.
  - **A los celulares** los manda la misma Edge Function de siempre,
    `sala-jugadores`, antes de leer chess-results. Al publicar, la función de
    la base llama a `disparar_sala_avisos()` para que no espere los 5 minutos
    del cron. Cada aparato lo recibe una vez (`sala_avisos_push_enviados`
    con tipo `anuncio`, el id del aviso en `ronda` y `no = 0`), en su idioma,
    y solo si se suscribió ANTES del aviso: quien se suscribe a las 3 no tiene
    por qué recibir el de las 9 de la mañana como si fuera nuevo.
  - No llevan datos de personas: es un texto de la organización.
- **El festival en números** (`#numeros`, enlazado desde «Hoy»):
  - jugadores, países, categorías y partidas jugadas (cada partida se cuenta
    una vez, desde las blancas);
  - cuánto ganan las blancas, las negras y cuántas tablas;
  - la mayor sorpresa (la misma cuenta de «Sorpresas», no otra);
  - la mayor remontada: quién subió más puestos desde el peor que tuvo antes
    de la última ronda, con un mínimo de 2. A igual subida, el que terminó
    más arriba;
  - el país con más oros (si terminara hoy, mientras no terminen todas);
  - y una imagen de 1080 de ancho para compartir, con la marca de agua.
- **Todos los certificados de la delegación** en «Mi delegación»: el mismo
  `diploma()` de cada jugador, uno por página. Para eso `ReportePDF.deImagen`
  acepta ahora `paginas`, una lista de imágenes, y el resto de los que lo
  llaman con una sola no cambian. Cada certificado lleva su marca de agua.
- Lo revisan `verificar-salas-torneo.js` (la pantalla de admin, con el doble
  que conoce las dos funciones) y `verificar-centroamericano.js` (el aviso en
  la página y en inglés, la función que manda una vez y solo a quien estaba,
  cada número contado aparte, la imagen y el PDF de dos páginas). Antes de
  darlo por bueno rompí a propósito los números, la remontada, el inglés del
  aviso, el PDF de varias páginas y la regla de «suscrito antes», y cada uno
  saltó.

### Sus rondas en mi calendario

Lo pidió el dueño entre las mejoras («1»). Ya había un «Agregar a mi
calendario» con todo el festival (el `.ics` que arma
`herramientas/centroamericano-imagenes.js`); este es el de UN jugador, en su
tarjeta del buscador.

- Cada ronda de su torneo es un evento, a la hora de la fila de `#calendario`
  (su `data-inicio`, en hora de Costa Rica, y `data-minutos`): la misma copia
  de las horas que usa «Hoy en el torneo». Un torneo con menos rondas (un
  Round Robin) trae solo las suyas.
- En la descripción: su categoría y, en las jugadas, lo que hizo; en la
  emparejada, su mesa, su color y su rival; en las que faltan, que vuelva a
  bajar el calendario cuando salga el pareo.
- El UID es fijo por torneo, jugador y ronda: bajarlo otra vez pone al día la
  mesa en vez de duplicar las rondas (en los calendarios que respetan el UID).
- Avisa 30 minutos antes de cada ronda. El formato lo arma
  `js/calendario-ics.js` (`armarHoras`, nueva, al lado de `armar` y
  `armarDias`): una sola copia del escape, el doblado de las líneas y la zona.
- Lo revisa `verificar-centroamericano.js`: la hora en hora de Costa Rica, el
  aviso, la mesa y el rival de la ronda emparejada. Rompí a propósito el aviso
  y la mesa, y saltó.

### El modo de prueba

Lo pidió el dueño para probar la página con torneos ya separados por
categoría antes del festival, sin que lo vea el público.

- `centroamericano-2026.html?sala=<clave>` muestra la página con los torneos
  de otra sala de `admin.html#torneos`: una **oculta**, por ejemplo
  `centroamericano-prueba`, con los 12 torneos del festival de 2025 (uno por
  categoría, la categoría en el texto de cada botón).
- La función `sala-jugadores` lee una sala oculta solo con `prueba: true` y
  si quien la pide administra: se pregunta `soy_admin()` con SU token, por
  PostgREST, así que pasa por la verificación en dos pasos. A cualquier otro
  le contesta 403 y la página lo explica.
- Arriba va un aviso rojo, pegado, que dice qué sala se está viendo, con
  «Salir del modo de prueba». Lo guardado va aparte (`cac_prueba_…`): no pisa
  lo que el aparato tenía del festival. Los avisos al celular no se
  encienden. Con la clave del festival, o una clave que no es de sala, no
  hay modo de prueba.
- Lo revisa `verificar-centroamericano.js`. Rompí a propósito el pedido en
  modo de prueba y el freno de los avisos, y saltaron.

## Las páginas de los torneos universitarios

Dos, con la misma maquinaria: `cenfotec-2026.html` (el Desafío Mentes
Maestras) y `utn-2026.html` (el II Torneo Universitario UTN-CONARE; ver «La
del UTN-CONARE», abajo). Lo que sigue se escribió para la primera.

`cenfotec-2026.html` es, para el Desafío Mentes Maestras CENFOTEC 2026, lo
mismo que la del Centroamericano (lo pidió el dueño: «dentro de la ficha,
todo igual que en el festival»), con la cara de la Universidad CENFOTEC y
con lo que sirve **después** del torneo, que ya se jugó (domingo 27 de
setiembre de 2026, 7 rondas, 34 jugadores, chess-results tnr1503400): el
podio, «Busca a tu jugador» con sus rondas y su rendimiento, «Mis
jugadores», la clasificación final, el podio, la clasificación para
proyectar y la imagen para compartir. Lo que solo sirve antes o durante
(bases, bye, hoteles, calendario, avisos al celular, «Hoy en el torneo») no
va: la página preguntó para qué era y el dueño eligió «Resultados del 2026».

- **Una sola copia de cada pieza**: la página carga `css/centroamericano.css`
  (el `body` lleva `cac cac-u cft`) y `css/universidades.css` le cambia las
  variables (`--cac-morado` pasa al azul #233065, el «rojo» de las bases a #0A6AA8,
  que aguanta letra blanca; el celeste #23ACF4 no) y lo que esa hoja tiene
  con un color fijo (la bandera de las fichas, los lavandas del modo
  oscuro). El buscador, el podio, la clasificación, el proyector y la imagen
  son `js/centroamericano-vivo.js` y `js/centroamericano-tablas.js`, que leen
  `window.TorneoPagina` (de `js/cenfotec.js`, que carga antes): la sala de
  Torneos (`cenfotec`), el prefijo de lo guardado en el aparato (`cft_`), el
  nombre, la dirección y la cara de la imagen (la banda azul con el logo
  ancho, no el pizote redondo). Sin `TorneoPagina`, los módulos son los del
  Centroamericano, igual que antes.
- **Los resultados vienen de la misma función, `sala-jugadores`**: para eso
  la sala `cenfotec` de `salas_torneo` lleva entre sus enlaces el de
  chess-results (se agregó «Resultados en chess-results»; la función solo
  lee los torneos que la sala enlaza). Ningún cambio en la función.
- **El torneo terminado**: con el torneo cerrado, chess-results titula
  «Clasificación final», sin número, y la función devuelve `ronda: 0`; su
  página de pareo trae la última ronda con el rival sin número. Sin
  arreglarlo, la página decía «Número inicial» en vez del puesto y «No
  aparece en el pareo». `normalizar()` (en `js/centroamericano-vivo.js`)
  deduce la ronda del cuadro cruzado (las casillas de «r»), marca el torneo
  `terminado` y no usa ese pareo. La tarjeta dice «El torneo terminó, a 7
  rondas» —no «jugó sus 7 rondas»: siete de los 34 no se presentaron a
  ninguna («-0» en todas) y sus rondas dicen «no jugó»—, la clasificación
  dice «Clasificación final» y el proyector (el de `main`, que con el torneo
  terminado pasa los podios y la clasificación de cada grupo) no busca un
  pareo. El grupo sin nombre de un torneo sin categorías se llama «General»
  (`categoria("—")`), no «—». Le sirve también al Centroamericano cuando termine (el 8 de
  noviembre su chess-results va a decir lo mismo).
- **Un torneo sin categorías ni países**: el «Gr» viene vacío, así que el
  selector de categoría de la clasificación se esconde solo y el puesto se
  dice «Puesto 1 de 34», sin «en» una categoría; los 34 son de Costa Rica, así
  que el podio no lleva la tabla de medallas por federación (`soloPodio`) ni
  la página «Mi delegación» ni la tabla por país.
- **Los datos del torneo salen de su ficha de chess-results** (fecha, sala,
  ritmo, rondas, quién dirige y quién arbitra, con el nombre tal cual lo
  escribe chess-results). **El contacto es solo el correo**
  `ajedrez@ucenfotec.ac.cr`, el que publica la universidad en
  `ucenfotec.ac.cr/ajedrez`: no hay un teléfono confirmado para este torneo y
  no se pone uno que no sea.
- **Las normas de `ucenfotec.ac.cr/ajedrez` no son de este torneo**: esa
  página (la que pasó el dueño) es del Torneo FedeU-CENFOTEC del 23 de mayo de
  2026, otro torneo, con sus normas específicas y su planilla. Por eso la
  página no lleva una ficha de «Bases»: enlaza esa página como «El ajedrez en
  CENFOTEC», que es lo que es. Si la organización pasa las bases del Desafío,
  van en una ficha como la del Centroamericano.
- **La ficha de Torneos** (`torneos-en-vivo.html`) ya tenía la cara de
  CENFOTEC («La ficha del Desafío Mentes Maestras», arriba); su enlace a
  esta página se agrega en `admin.html#torneos` como el primero de la sala.

`herramientas/verificar-paginas-universitarias.js` lo revisa (las dos
páginas) con un doble de la función que
contesta como chess-results con el torneo terminado (ronda 0 y el pareo
raro): la cara (el azul, la píldora celeste con letra oscura, la línea de las
fichas), el podio, la tarjeta («El torneo terminó», nunca «pareo»), quien no se
presentó, la clasificación final sin selector, el podio sin medallas, el
proyector con la clasificación, la imagen con la banda azul y el logo, y que
en el celular no haya scroll de costado.

### La del UTN-CONARE

`utn-2026.html` es la misma página para el II Torneo Universitario de
Ajedrez UTN-CONARE 2026 (lo pidió el dueño: «hacer lo mismo para el torneo
de la UTN»), con el azul y el logo de la Universidad Técnica Nacional:
domingo 27 de setiembre de 2026, en el CFPTE de la UTN en Desamparados de
Alajuela, 6 rondas a 15 minutos + 10 segundos.

- **Una sola hoja para las universidades**: lo que era `css/cenfotec.css`
  pasó a `css/universidades.css`. Cada universidad pone solo sus variables
  (`--u-1`, `--u-celeste`, `--u-fuerte`…, en `.cft` / `.u-sala-cft` y `.utn`
  / `.u-sala-utn`) y todo lo demás es común: la ficha de Torneos (`u-sala`,
  con la clase de la universidad como `tema` en `PORTADAS` de
  `js/salas-torneo.js`) y la página (`cac-u`). El contraste de cada una está
  en la cabecera de la hoja; en la UTN el acento es el celeste de los puntos
  de su logo (#BFCFE8), que solo lleva letra oscura (#0F2A55, 8,97).
- **El logo** es el que pasó el dueño, recortado tal cual: el azul pasó a
  blanco con transparencia y los puntos conservan su celeste
  (`img/utn/logo.png`).
- **Dos torneos, uno por rama**: en chess-results el femenino (tnr1498221, 10
  jugadoras) y el masculino (tnr1498218, 26 jugadores) son torneos
  separados, sin la columna «Gr». `grupos` en `js/utn.js` le pone a cada
  jugador la rama de su torneo (por el número de torneo), y con eso el
  puesto («Puesto 1 de 10 en Femenino»), el podio, la clasificación (con el
  selector de la rama), el proyector («Clasificación · Femenino») y la
  imagen van por rama. Sin eso, los 36 salían en una sola lista. La sala
  `utn` de `salas_torneo` lleva ahora los dos enlaces de chess-results.
- **«El podio» de arriba** salió de `js/cenfotec.js` a `js/torneo-podio.js`,
  que es de las dos páginas: los tres primeros de cada grupo, con el nombre
  del grupo solo si hay más de uno.
- **Sin contacto**: no hay un correo ni un teléfono confirmados de la
  organización de este torneo, así que no hay ficha de contacto; la
  despedida lleva a los demás torneos. Seis fichas: las dos de chess-results
  (se abren encima), las partidas, la clasificación, el podio y el proyector.
- **La ficha de Torneos** de la sala `utn` lleva el azul, el logo y «Entrar a
  la sala» en el celeste con letra oscura; lo revisa
  `verificar-centroamericano.js` (que antes usaba la sala `utn` como ejemplo
  de sala sin portada: ahora usa otra).
- **Ningún botón saca a nadie de la página** (lo pidió el dueño: «que se abra
  por encima la información pero nunca abandonar la página»). En las dos
  páginas, todo lo de afuera y las otras páginas del sitio se abren encima
  con `a[data-ventana]` (`js/ventana-enlace.js`): chess-results, la sala de
  las partidas (`transmision.html`, del propio sitio, en el marco), el video
  (YouTube con su dirección de `/embed/` en youtube-nocookie.com, que ya está
  en `frame-src`) y «Más torneos». Solo el encabezado (Inicio, Torneos) y lo
  legal del pie siguen siendo navegación del sitio. **`ucenfotec.ac.cr` no se
  deja mostrar dentro de otra página** (`X-Frame-Options: SAMEORIGIN`,
  comprobado con `pg_net`): encima saldría en blanco. Por eso «El ajedrez en
  CENFOTEC» abre una ventana propia (`#ajedrez-cenfotec`) con lo que dice su
  página —el Torneo FedeU-CENFOTEC 2026, copiado tal cual— y su sitio queda
  como «Ver su página en otra pestaña», dentro de esa ventana: la nuestra
  sigue abierta debajo.
- **Las fichas de Torneos de las universidades** siguen la regla del
  Centroamericano: con `pagina` y `fichas` en `PORTADAS`, chess-results lleva
  a `#ficha-resultados` (CENFOTEC) o a `#ficha-femenino` / `#ficha-masculino`
  (UTN), Lichess a `#ficha-partidas` y YouTube a `#ficha-video`, que la página
  abre encima al entrar; lo que no tiene ficha (las transmisiones de idchess
  de la UTN), a la página entera. Lo revisan `verificar-salas-torneo.js` y
  `verificar-paginas-universitarias.js` (ningún enlace del contenido sin
  `data-ventana`, y `#ficha-partidas` abre la sala encima).

### Las ediciones anteriores

Cada página compara con la edición anterior (lo pidió el dueño: la mejora
6, «comparar con la edición anterior»). En el Desafío es la de 2025
(chess-results tnr1259931, 28 de setiembre de 2025, 42 jugadores). En la
UTN es la primera, el Torneo CONARE 2026 del 16 de agosto: también de la UTN
y en la misma sede, con el femenino (tnr1473963, 15) y el absoluto
(tnr1473962, 23) separados, como en esta.

- **Una ficha y un recuadro, «Ediciones anteriores»** (`#ediciones`,
  `js/torneo-ediciones.js`). Por rama, trae dos cosas. Primero, el campeón
  de cada edición, con sus puntos y cuántos jugaron. Después, «Quién volvió»:
  los de esta edición que ya jugaron una anterior, con su puesto en cada una
  («10.º de 42») y el cambio. El cambio va escrito («Subió 7 puestos»), con
  la flecha de adorno y sin color. En la tarjeta del buscador, quien vuelve
  lleva una línea más: «En la edición 2025: 10.º de 42, con 4½ puntos».
- **Esta edición sale en vivo; las anteriores, guardadas.** Esta sale de
  chess-results, de la misma `sala-jugadores` de siempre. Las anteriores
  están en `TorneoPagina.ediciones` como `[puesto, nombre, puntos]`. Son
  copia de la clasificación final de chess-results, tomada de
  `uni_clasificacion` (CENFOTEC) y de `uni_resultados` (UTN) el 25/10/2026.
  Esas tablas las lee solo quien tiene la licencia. Una página pública no las
  puede pedir, pero lo que guardan es la clasificación pública de
  chess-results. Por eso se copian a la configuración y no se piden.
- **La misma persona de un año a otro** tiene los mismos apellidos y el mismo
  primer nombre, sin tildes ni mayúsculas. Chess-results escribe a veces el
  segundo nombre y a veces no («Keicy» y «Keicy Pamela»). A veces cambia una
  letra del segundo («Naomi» y «Naomy»). Lo que esa regla no ve, un apellido
  mal escrito, va revisado a mano en `mismaPersona`. En 2025 escribió
  «Ocontrillo Rodriguez, Gerald» y en 2026 «Oconitrillo»: es la misma persona.
  Si dos jugadores de una edición dan la misma clave, no se empareja
  ninguno: mejor no decir nada que decir algo de otra persona.
- **Lo revisa** `verificar-paginas-universitarias.js`, con los datos de
  verdad de la edición anterior. Mira la línea de la tarjeta, los campeones
  y quién volvió: con el segundo nombre de más y con `mismaPersona`; sin
  ella, Gerald no aparece.

## La plantilla de las páginas universitarias

Las dos páginas salen de una plantilla (la mejora 7: «que el próximo torneo
universitario no se arme a mano»). **Cada página tiene su configuración** en
`herramientas/torneos-universitarios/<página>.js`, con todo lo que la hace
ella: los textos, la portada, los datos de su ficha de chess-results, el
logo, los colores de la imagen para compartir, las fichas, los recuadros
propios (el contacto y «El ajedrez en CENFOTEC», con su HTML) y las
ediciones anteriores. `node herramientas/torneo-universitario.js` escribe
dos archivos: la página y su `js/<config>.js` (el `window.TorneoPagina`, que
antes se escribía a mano). La primera vez reprodujo las dos páginas tal cual
estaban, y las diferencias eran solo lo nuevo.

- **No se editan a mano**: lo dicen la cabecera de cada página y de cada
  `js/<config>.js`. `verificar-plantilla-universitaria.js` (sin navegador)
  falla si una no es lo que sale de su configuración. También revisa lo que
  la plantilla no puede ver sola:
  - que el logo exista y mida lo que dice;
  - que la sala tenga su portada en `PORTADAS` de `js/salas-torneo.js`, con
    esa página, ese logo y las fichas a las que lleva;
  - que las ediciones anteriores sean clasificaciones bien formadas: puestos
    que no bajan, puntos de medio en medio que no suben, «Apellidos, Nombre»
    y los mismos grupos que esta edición;
  - que cada nombre de `mismaPersona` esté en una edición.
- **Los bloques de los otros generadores no se pisan.** `pwa-cabecera.py`,
  `tema-cabecera.py`, `fuentes-cabecera.py` y `legal-pie.py` ponen su
  `<!-- x: inicio -->…<!-- x: fin -->`, cada uno donde le toca. La plantilla
  toma esos bloques de la página que ya está, y también su orden al final del
  `<head>`. Correr aquellos scripts después no deja la página «vieja». Se
  comprobó corriéndolos todos sobre las dos.
- **Lo que sale solo**: la ficha «Ediciones anteriores» y su recuadro, si
  hay ediciones. La ficha va detrás de las del torneo y antes de las que
  llevan a otra cosa (`despues`). Con un número impar de fichas, la última
  ocupa la fila entera en el celular.
- **Para el próximo torneo**: copiar la configuración de uno parecido y
  cambiarle los datos, que salen de su ficha de chess-results y nunca se
  inventan. Después:
  1. poner el logo en `img/<universidad>/`;
  2. poner sus colores, medidos, en `css/universidades.css` (`.x` y
     `.u-sala-x`);
  3. correr la plantilla;
  4. agregar su portada en `PORTADAS`;
  5. crear la sala en `admin.html#torneos`, con los enlaces de chess-results;
  6. correr `sitemap.py` y `archivos-catalogo.js`;
  7. sumarla a `PAGINAS` de `verificar-paginas-universitarias.js`.

## La cámara que lee el tablero

`camara-tablero.html` (`js/camara-tablero.js`) empezó como una **prueba** de
quien administra; hoy la abre toda cuenta (ver «El reloj, lo entrenado en la
cuenta, las pistas y la cámara del árbitro adjunto»): el celular encima de un tablero de verdad lee cada
casilla y anota las jugadas. Sirve para medir qué tan bien se ven nuestros
tableros con la luz real de un salón antes de invertir en entrenar un modelo o
en transmitir. No guarda nada ni manda la imagen a ningún lado: todo pasa en
el celular.

- **No reconoce piezas: reconoce jugadas.** Distinguir un alfil de un peón
  desde arriba, con sombras y reflejos, es caro y falla. De cada casilla solo
  se pregunta si está vacía, con pieza blanca o con pieza negra, y chess.js
  busca la jugada legal que explica el cambio (`buscarJugadas`). El enroque
  (4 casillas) y la captura al paso (3) salen solos. Si se escapó una jugada,
  prueba las parejas. Al coronar, la cámara solo ve «pieza blanca»: se anota
  dama y se avisa.
- **Lo que no explica ninguna jugada legal no se anota.** Se dice qué casillas
  cambiaron y se espera. Ninguna posición se inventa.
- **El tablero se encuentra solo, o se marca a ojo** (`js/detectar-tablero.js`).
  La medida es el patrón de ajedrez: a cada lado de cada línea entre casillas,
  la clara tiene que ser la clara. Con eso, «Buscar el tablero» prueba
  tableros de muchos tamaños, giros, achatados por la inclinación y en
  trapecio (la cámara de lado ve el borde cercano más ancho), primero en una
  imagen de 200 px y con pocos puntos, y ajusta los mejores en la grande. Y
  cuatro esquinas tocadas a ojo, en cualquier orden, se corren solas a las
  líneas al soltar la cuarta. Lo que se probó y falló:
  - mirar lejos de la línea: los puntos caen sobre las piezas y el ajuste se
    quedaba a 5-16 px. Los finos van entre la línea y la base de la pieza;
  - mover las esquinas de a una: no puede correr el tablero entero sin
    deformarlo. Se mueve también entero (correr, agrandar, girar);
  - decidir si el tablero va una fila más allá con los puntos lejanos:
    preferían el tablero montado sobre el borde. Se decide con los finos;
  - sin trapecio, un tablero muy de lado no se encontraba.
  Para decir «no hay tablero» no alcanza el puntaje (depende del contraste):
  se pide además que el patrón sea parejo (`parejo` ≥ 0,92; los tableros de
  prueba dan 1,00 y un piso de baldosas solo, 0,81). Las esquinas se marcan
  con el dedo apretado y una lupa, o con el teclado (1 a 4 eligen, las
  flechas mueven). Se lee de un lienzo aparte, sin la cuadrícula dibujada
  encima: la cuadrícula amarilla son líneas, justo lo que se mide.
- **Cuál esquina es a1 lo decide la calibración.** Prueba los cuatro giros y
  se queda con el que ve la posición inicial. Media vuelta también la lee
  perfecta (es simétrica en colores), así que además pide que las piezas de
  las filas 1 y 2 sean las claras. Y el espejo (a con h) no se puede
  distinguir mirando la posición inicial: lo fija la geometría. Vista desde
  arriba, a1 → h1 → h8 → a8 gira siempre para el mismo lado en la imagen
  (`ordenar`). Sin eso, e4 se anotaría d4.
- **Calibrar es mirar la posición inicial**: las filas 3 a 6 enseñan cómo se
  ve una casilla vacía de cada color, las 1 y 2 una pieza blanca y las 7 y 8
  una negra. Por cada casilla se miden tres rasgos contra el fondo vacío de su
  color: qué parte se aparta, cuánto borde tiene (una pieza blanca en casilla
  blanca casi no cambia el color, pero sí el contorno) y el tono de lo que se
  aparta. Si con lo aprendido no se leen al menos 48 de las 64 casillas de la
  posición inicial, no se calibra: casi seguro la esquina 1 no es a1.
- **La lectura se cree cuando se queda quieta**: 6 lecturas iguales seguidas,
  una cada 200 ms. Mientras la mano está encima, cambia y no se anota.
- **«Probar con una foto»**: otra foto del mismo tamaño conserva las esquinas,
  la calibración y la partida, así que se puede probar una partida foto a
  foto sin cámara en vivo. Así la prueba `verificar-camara-tablero.js`, con
  tableros que dibuja el mismo navegador píxel a píxel: en perspectiva, con
  margen blanco como los de vinilo, baldosas alrededor y ruido; de frente,
  de lado, girado, chico, con las blancas a la izquierda y desde las negras.
- **La cámara está apagada en todo el sitio** (`Permissions-Policy:
  camera=()` en `/*` de `_headers`). Esta página quita esa cabecera
  (`! Permissions-Policy`) y pone la misma con `camera=(self)`, en las dos
  rutas: con y sin `.html`. Solo agregar la nueva no sirve: Cloudflare junta
  las dos con una coma y el `camera=()` sigue ahí. El verificador revisa que
  ninguna otra ruta tenga la cámara.

- **La jugada más probable, no la exacta** (27/10, con el tablero de verdad:
  «hice Cf3 y no la entendía»). Con la cámara de lado, la pieza alta tapa la
  parte de atrás de la casilla siguiente y basta una casilla mal leída para
  que ninguna jugada calce exacta. Dos arreglos:
  - la rejilla de cada casilla se corre un 14 % hacia donde la casilla mira a
    la cámara (abajo en la imagen), donde está la base de su pieza y no la
    pieza de adelante;
  - cada casilla leída trae su seguridad (`leerDetalle`), y cada jugada legal
    cuesta lo que no calza, pesado por esa seguridad (`decidir`): una casilla
    dudosa casi no pesa. Se anota la mejor si cuesta poco, le gana claro a la
    segunda y explica más que «no pasó nada» (una sombra no inventa una
    jugada). Si dos o tres explican parecido, se pregunta con botones; y
    siempre se puede anotar a mano, en español, solo si es legal
    (`ComandosTablero.jugadaEscrita`). Sin la seguridad, solo vale la exacta.
- **La cámara se movió: se sigue la partida, no se empieza otra.**
  `calibrar` aprende con cualquier posición conocida, no solo la inicial.
  Si una lectura quieta cambia 10 casillas o más, se corren las esquinas a
  las líneas y se calibra con la partida anotada; si así lee 56 o más, sigue
  solo. Si no, «Buscar el tablero» (o las esquinas) y «Seguir con esta
  partida». A igualdad de giros gana el que deja a1 más cerca del de antes:
  la cámara se movió, el tablero no se dio vuelta. La partida se guarda en
  el celular en cada jugada (`camara_partida_v1_<tablero>`) y al volver a
  abrir la página se ofrece seguirla; si no estaba anotada, se pega su FEN o
  su PGN («Empezar desde otra posición») y la numeración sigue la del FEN
  («4. Ag5», no «1. Ag5»).
- **Dos tableros con un celular, opcional y apagado por omisión** (lo pidió
  el dueño: «siempre dando prioridad a que sea 1 para más confianza»). La
  casilla «Leer también un segundo tablero» lo dice al lado: lo más confiable
  es un celular por tablero. Encendida, cada tablero tiene sus esquinas, su
  calibración, su partida y su transmisión con su propio código (unas
  pestañas eligen a cuál se aplican los botones y cuál se muestra). La
  imagen se trabaja a 960 de ancho en vez de 640, porque cada tablero ocupa
  la mitad; las esquinas del primero se agrandan con ella y su calibración
  sigue valiendo (mide luz, no tamaño). Al buscar el segundo, el primero se
  tapa con gris parejo (`DetectarTablero.tapar`): si no, la búsqueda lo
  vuelve a encontrar (rompiéndolo a propósito, los dos tableros anotan la
  misma partida). Cada cuadrícula lleva su color y su número escrito. Más de
  dos no: con cuatro, una casilla queda de 15 a 20 px y las piezas negras
  sobre casillas oscuras se confunden.

Con un tablero de vinilo de verdad, en el piso y con la cámara de lado, leyó
64 de 64 y anotó las jugadas (27/10). Lo que falta: un modelo entrenado con
fotos de nuestros tableros si con otra luz falla (las etiqueta el PGN de la
partida). La transmisión a Lichess ya está: ver «Transmitir a Lichess».

## La partida en vivo desde la cámara

La cámara manda la partida y `tablero-vivo.html` la muestra, sin cuenta
(`js/partida-en-vivo.js` es lo que comparten las dos; `js/tablero-vivo.js`, la
página de quien mira).

- **Por un canal de Supabase Realtime en modo Broadcast, sin tabla**, igual
  que «Actualizar sola (en vivo)» de Pareo Integral (ver «El canal en vivo»):
  el nombre del canal (`tablero-vivo-<código>`) hace de contraseña, con un
  código de 8 caracteres al azar sin 0/1/i/l/o. El código va en la dirección
  después del `#`, que nunca llega al servidor. Quien tenga el enlace puede
  mandar mensajes falsos al canal; para una partida que se muestra en público,
  se acepta el riesgo como en Pareo.
- **Se manda la partida, nunca la imagen**: el PGN entero en cada cambio (una
  jugada, «Deshacer», calibrar) y los nombres, que son opcionales. Es poco y
  así quien llega tarde o se reconecta no necesita historia: pide («pedir»,
  al conectarse, al volver la red y al volver a la pestaña) y la cámara le
  contesta con todo. La cámara solo escucha «pedir»: lo que pasa en el
  tablero lo decide la cámara, nunca un mensaje del canal.
- **Lo que llega se vuelve a jugar con chess.js** (`PartidaEnVivo.leer`): una
  partida que no es legal no se pinta, y un mensaje más viejo que el último
  (por su hora) no pisa lo nuevo. Los nombres son texto ajeno: `textContent`.
- **El código se guarda en el celular** (`localStorage`): si la página se
  recarga y se vuelve a transmitir, quien ya tenía el enlace no lo pierde.
  «Usar un código nuevo» es la salida si se compartió de más.
- Mientras la página de la cámara esté abierta; si se cierra, quien miraba se
  queda con la última jugada, y quien abre el enlace ve «Esperando la
  transmisión» a los 8 segundos (no una pantalla en blanco). Lo dice la
  propia página.
- El tablero de quien mira usa las piezas y los colores que eligió cada uno
  (`PiezaPreferida`, `--sq-light`/`--sq-dark`), las coordenadas por fuera
  (`js/coordenadas-tablero.js`), «Girar el tablero» con los nombres del lado
  de sus piezas, y las jugadas en algebraica española. La última jugada se
  dice también en texto, y al lector de pantalla cuando cambia.
- La página de quien mira NO tiene la cámara: solo `camara-tablero` y
  `camaras` la tienen en `_headers` (lo revisa el verificador).

- **Un torneo de Pareo Integral, con una cámara por mesa** (lo pidió el
  dueño: «si ponemos 20 cámaras, que cada una pase su partida»). La cámara
  elige un torneo publicado (su enlace, o «Ver los torneos de estos días»:
  los de hace tres días a mañana en hora de Costa Rica) y su MESA física,
  numerada como en la sala (`PartidaEnVivo.mesaFisica`, la misma cuenta que
  `PareoEvento.mesaFisica`, comparadas en el verificador porque ese módulo es
  muy grande para cargarlo por una línea). La cámara queda fija en la mesa y
  en cada ronda se sientan otros: los nombres salen del torneo publicado, de
  la ronda en que se calibró la partida (la partida que se anota no cambia de
  jugadores a la mitad), y cuando Pareo empareja la siguiente se avisa
  (se vuelve a leer el torneo cada minuto, o con «Buscar ronda nueva»).
  Todas las cámaras del torneo transmiten por UN canal, el código del
  torneo (la primera lo crea; las otras lo escriben al elegir el torneo), y
  cada mensaje dice su torneo, ronda y mesa. Quien mira abre
  `tablero-vivo.html#<código>&t=<id del torneo>` y ve todas las mesas de la
  ronda en una cuadrícula (también las que no tienen cámara, con su
  nombre), y al tocar una, en grande; un mensaje de otro torneo se ignora.
  En un torneo por equipos, una tarjeta por tablero (ver «Torneos por
  equipos con la cámara»).
- **Elegir la cámara**: una computadora puede tener varias cámaras USB. La
  lista sale después del primer permiso (antes el navegador no da los
  nombres) y la elegida se recuerda; si ya no está conectada, se abre la de
  siempre. Lo prueba el verificador con las dos cámaras de mentira de
  Chromium (`--use-fake-device-for-media-stream=device-count=2`).

Lo prueba `verificar-camara-tablero.js` con dos navegadores y Node relevando
los mensajes de uno a otro, como haría el canal: quien llega tarde recibe la
partida entera, cada jugada y «Deshacer» llegan solos, lo viejo y lo ilegal
no se pintan, «Dejar de transmitir» deja de mandar y volver a transmitir usa
el mismo código, y un código malo o sin nadie transmitiendo se dice.

### Varias cámaras en una computadora

Lo pidió el dueño para no necesitar tantos celulares: una computadora con
varias cámaras USB, cada una encima de su mesa. `camaras.html` (de quien
administra; `js/camaras.js`) pone un cuadrito por cámara.

- **Cada cuadrito es `camara-tablero.html` entera, en un iframe con
  `?compacto=1&puesto=N`**: la misma página de siempre, sin una segunda copia
  de la lectura, la calibración ni la transmisión. `compacto` le pone la clase
  `camara-compacta` al cuerpo, que esconde el encabezado, las migas, el pie, la
  burbuja y lo marcado `data-solo-pagina` (el título, la introducción, los
  pasos y el segundo tablero: un tablero por cámara).
- **Lo de cada cámara se guarda aparte por puesto** (las claves de
  `localStorage` llevan `_pN`): su dispositivo, su mesa, su partida y su
  código propio. El torneo y su código son de todas (`camara_torneo_v1`):
  cuando un cuadrito elige el torneo, los demás lo toman solos por el evento
  `storage`, y cada uno elige su mesa.
- **La página de afuera también tiene la cámara permitida en `_headers`**, y
  el iframe lleva `allow="camera"`: sin las dos cosas el navegador no le deja
  la cámara a ningún cuadrito, sin dar error visible.
- **La lectura corre con `setInterval`, no con `requestAnimationFrame`**: un
  iframe que no se ve (más abajo en la página) no recibe cuadros de
  animación y su mesa dejaría de leerse. El dibujo sí va con rAF.
- Se agregan o quitan cuadritos de a uno (de 1 a 8, recordado), siempre el
  último: los que ya están no se recargan, porque perderían la cámara abierta
  y la calibración. Ocho es el tope práctico de una computadora (cada cámara
  ocupa su ancho de banda USB y su lectura); para 20 mesas, tres o cuatro
  computadoras, todas en el mismo torneo.

Lo prueba `verificar-camara-tablero.js` con las dos cámaras de mentira de
Chromium: dos cuadritos, cada uno con su cámara, el torneo elegido en uno que
aparece en el otro con el mismo código, y cada uno en su mesa con sus
jugadores; agregar y quitar sin recargar los que ya estaban.

### Un torneo con muchas cámaras: lo que lo hace andar solo

Lo pidió el dueño después de probarla: «más potente, más eficiente, más
fácil». Cinco piezas, pensadas para un torneo de 20 mesas.

- **La pantalla no se apaga.** Con la cámara abierta, la página pide
  `navigator.wakeLock.request("screen")`: un celular que apaga la pantalla
  corta la cámara y la mesa deja de transmitir, sin avisar. El navegador
  suelta el pedido cuando la pestaña se esconde; al volver se pide de nuevo.
  Si no lo deja (batería baja, navegador viejo), sigue igual: lo dice solo
  cuando lo consigue.
- **El resultado de la partida.** El mate, el ahogado y la falta de material
  para dar mate salen solos (`PartidaEnVivo.resultadoSolo`); el abandono, el
  tiempo y las tablas de común acuerdo se marcan con «1-0 / ½-½ / 0-1». Viaja
  con cada mensaje (`resultado`, en la notación de Pareo: «1-0», «=»,
  «0-1») y en el `[Result]` del PGN (`PartidaEnVivo.pgn`, en una copia: la
  partida que se sigue anotando no se toca). Una jugada nueva, «Deshacer» o
  una partida nueva lo borran: si se siguió jugando, no había terminado. El
  que dice el tablero no se puede cambiar con los botones.
- **Un QR por mesa.** «Imprimir el QR de cada mesa» arma una hoja (dos mesas
  por fila, con la marca de agua de Ajedrez Integral, como las hojas de
  Pareo) con `camara-tablero.html#t=<torneo>&c=<código>&m=<mesa>&r=<retraso>`:
  todo después del `#`, que no llega al servidor. Al abrirlo, la cámara toma
  ese torneo, ese código, esa mesa y ese retraso, empieza a transmitir y abre
  la cámara (ver «La cámara sin cuenta con el QR de la mesa»).
- **«Cómo van las cámaras»** en `camaras.html`: cada segundo le pregunta a
  cada cuadrito `estadoCamara()` (es la misma página web: se puede) y dice
  con palabras y color «Necesita ayuda», «Sin cámara», «Falta calibrar»,
  «Leyendo, sin transmitir» o «Transmitiendo», con la mesa, las jugadas y el
  resultado, y «Ir a la cámara N». Necesita ayuda: una jugada en duda, un
  aviso de error o la cámara que se cortó (estaba y ya no). Al pasar a
  necesitar ayuda, suena una vez (se puede apagar; el navegador deja sonar
  después del primer toque en la página). Las filas se cambian en su lugar,
  sin volver a armarse, para no quitarle el foco a nadie.
- **Pareo Integral recibe de las cámaras** («Recibir de las cámaras», en la
  ronda en juego de un torneo individual y publicado): con el código de las
  cámaras, la pestaña del árbitro escucha el mismo canal que
  `tablero-vivo.html` (`tablero-vivo-<código>`; carga `js/partida-en-vivo.js`
  y chess.js solo entonces) y pide lo que ya tienen. Solo entra lo de su
  torneo publicado (por su id), de la ronda en juego y de una mesa con
  rival, vuelto a jugar con chess.js.
  - La partida entra sola a la mesa (`m.pgn`, con `pgnCamara`) y sale en el
    torneo publicado al ponerse al día; **nunca pisa una escrita a mano**
    (al escribirla, `pgnCamara` se borra). No es un cambio del historial
    («Deshacer» no se llena de jugadas) y no vuelve a pintar la ronda: solo
    la marca «✓» del botón de la partida.
  - **El resultado nunca se anota solo**: queda en «Resultados para
    confirmar» (`R.deCamaras`) con «Anotar» y «Descartar». Si la mesa ya
    tenía otro, lo dice, y anotarlo pide confirmarlo y deja la constancia en
    las incidencias, como el árbitro adjunto. El mismo resultado repetido no
    se vuelve a pedir.
  - Mientras esa pestaña esté abierta, como los adjuntos. En un torneo por
    equipos, el resultado se confirma tablero por tablero (ver «Torneos por
    equipos con la cámara»).

Lo prueban `verificar-camara-tablero.js` (el resultado que llega a quien
mira, el mate que se marca solo, la hoja de QR al imprimir, llegar por el QR,
la pantalla encendida con un doble de `wakeLock`, y «Cómo van las cámaras»
con un doble del sonido) y `verificar-pareo-camaras.js` (Pareo con el doble
de Realtime de `herramientas/lib/pareo-pruebas.js`: lo que entra, lo que no,
el resultado para confirmar y que una jugada no repinta ni ensucia el
historial). Rotos a propósito, saltan.

### La cámara sin cuenta con el QR de la mesa

El dueño lo pidió así: en un torneo, los celulares que van encima de las
mesas son de cualquiera (un padre, un voluntario), y pedirle a cada uno una
cuenta de administración no tiene sentido. Antes, el QR exigía la sesión
abierta y, sin ella, la guardia mandaba al login perdiendo el `#`.

- **Con un QR válido, `camara-tablero.html` anda sin cuenta, en «modo
  mesa»** (`modoMesa()` en `js/camara-tablero.js`): transmite esa mesa de ese
  torneo y nada más. Esconde (`[data-no-mesa]`, con `.camara-mesa`) elegir
  otro torneo, la mesa, el código, el retraso, el QR de las mesas, «Otro
  código» y «Dejar de transmitir»; arriba dice «Mesa N · torneo». El `#` se
  queda en la dirección: al recargar, sigue en su mesa.
- **Lo que toca sin cuenta es lo mismo que ya era público**: el torneo
  publicado (`pareo_publicados`, de lectura pública) y el canal de Broadcast,
  que cualquiera con el código ya podía oír y en el que cualquiera podía
  hablar. No lee ni escribe nada de la Academia (el verificador lo comprueba
  con las tablas que se piden). Por eso la página **ya no lleva la guardia
  de sesión ni el encabezado de la Academia** (salió de `PAGINAS` de
  `academia-cabecera.py`): lleva el encabezado público, como
  `tablero-vivo.html`.
- **Sin QR (o con uno roto), sigue siendo de quien administra**: `init()`
  manda al login sin sesión y muestra «Esto es de quien administra» a quien
  no lo es. Es un control de producto —la herramienta está en prueba—, no de
  datos: detrás no hay nada que proteger que el modo mesa no deje ya.
- `camaras.html` sigue en la Academia (es de quien administra) y ahora cuelga
  de Administración en las migas.

### La cámara gasta poco

Un celular encima de una mesa pasa 4 o 5 horas con la cámara abierta y la
pantalla encendida, y en `camaras.html` una computadora lleva hasta 8 cámaras
en el mismo hilo de la página. Lo que se hacía de más, y cómo quedó (cada cosa
la mide `verificar-camara-tablero.js`, en «La cámara gasta poco», con
`window.gastoCamara()`):

- **La cámara da lo justo**: `width: 1280` y `frameRate: 10`, todo `ideal`
  (si no puede, da lo que tenga). Antes se pedían 1920 a 30 imágenes por
  segundo para trabajar a 640 y leer 5 veces por segundo.
- **Se dibuja poco**: mientras se ubica el tablero (sin calibrar, arrastrando
  una esquina, buscando), a todo lo que dé; ya calibrada, 2 veces por segundo
  o apenas cambia lo que se lee (`pintarYa`). Antes, la imagen entera con su
  cuadrícula 60 veces por segundo, aunque nadie la mirara.
- **«Ahorrar batería»**: la pantalla en negro con «Mesa N · transmitiendo» y
  cómo va, en letra blanca (21:1), y nada de dibujo. La pantalla no se puede
  apagar (se corta la cámara), pero en negro una OLED casi no gasta. En modo
  mesa se pone sola a los 2 minutos sin tocar nada, ya calibrada y
  transmitiendo; si la cámara necesita a alguien (una jugada dudosa, algo que
  no reconoce), se quita sola.
- **Se lee solo el recorte** donde están los tableros (sus esquinas con un
  margen del 4 %), no la imagen entera. `muestras()` recibe dónde empieza el
  pedazo (`ox`, `oy`).
- **Más despacio con el tablero quieto**: si nada cambió en 10 segundos, 2
  lecturas por segundo en vez de 5; apenas algo cambia, otra vez 5. Una
  jugada tarda medio segundo más, como mucho, en empezar a contarse.
- **La lectura, en su propio hilo**: el cálculo salió de `camara-tablero.js` a
  `js/lector-tablero.js` (sin `window` ni `document`), y
  `js/lector-tablero-worker.js` lo usa en un Web Worker: la página manda el
  recorte ya achicado (`createImageBitmap`, sin copiar píxeles en la página) y
  el hilo lo lee en un `OffscreenCanvas`. Una lectura que vuelve cuando ya se
  recalibró o cambió la imagen no vale (se comparan `h`, `cal` y
  `fuenteVer`). Sin `OffscreenCanvas` o si el hilo falla, se lee en la página
  como antes, también solo el recorte. La CSP ya tenía `worker-src 'self'`.
- **La librería del QR (57 KB) se carga cuando hace falta**: al imprimir la
  hoja de QR o al mostrar el de «Transmitir en vivo»; en modo mesa, nunca.
- **Solo lo nuevo por el canal** (`PartidaEnVivo.loNuevo`, `v: 2`): la
  jugada nueva y su tiempo, unos 150 bytes, en vez de la partida entera. Cada
  partida lleva un `id` (`idPartida`, de su hora de inicio) y lo nuevo dice
  desde qué jugada va (`desde`). La entera va la primera vez, cuando alguien
  la pide, cuando cambia algo que no es una jugada más (otros nombres, otra
  ronda, «Deshacer») y cada 20 mensajes por si alguien se perdió uno sin
  notarlo. Quien recibe (`tablero-vivo.js` y Pareo) la pega a la que tiene
  con `PartidaEnVivo.leer(payload, antes)`, sin volver a leer el PGN; si no
  calza, pide esa mesa entera (`pedir` con `{ mesa }`: contesta solo esa
  cámara, no las 50). Una página vieja no entiende `v: 2` y lo deja pasar.
- **El visor repinta solo la mesa que cambió** (`pintarMesa`): con 40 mesas
  en el proyector, cada jugada volvía a armar las 40 tarjetas. Si cambió qué
  mesas se ven (una cámara nueva), se arma entera.
- **Sin señal, sigue y lo dice**: «Sin conexión: la partida se sigue anotando
  en este celular y se manda sola cuando vuelva la señal» (`#sin-red`, por
  `navigator.onLine` y el estado del canal); en «Cómo van las cámaras», «Sin
  conexión». Al volver (`online` o el canal otra vez `SUBSCRIBED`), se manda
  la partida entera. El torneo leído se guarda en el celular
  (`camara_torneo_datos_v1`, hasta 400 KB): un QR abierto sin señal sigue con
  sus nombres; sin nada guardado, la cámara abre igual y el torneo se vuelve a
  pedir cada 10 segundos y al volver la señal. La página ya abría sin señal
  después de la primera vez: `sw.js` guarda todo lo del sitio que pasa por él.

### Torneos por equipos con la cámara

En un torneo por equipos, cada encuentro es una mesa de Pareo con sus
tableros, y **cada tablero es una partida: una cámara**. La cámara elige
«Mesa 3 · tablero 2» (se guarda como `3.2`; el QR lleva `&b=2`) y lo que
manda lleva `tablero` además de `mesa`.

- **Quién juega cada tablero** sale de la alineación del encuentro o, si no
  se dio, de los primeros del orden de tableros, y el equipo de la izquierda
  juega con blancas en los tableros impares (las olimpiadas de FIDE):
  `PartidaEnVivo.mesasDe` lo calcula del torneo publicado con la misma cuenta
  que `PareoEquipos.tablerosDe`, que acá no se carga (el verificador compara
  las dos, con el suplente que entró en el tablero 4). Un tablero al que le
  falta alguien no se juega: no sale.
- **Quien mira** ve una tarjeta por tablero (`m3t2`, «Mesa 3 · tablero 2»),
  con los dos equipos.
- **Pareo** guarda la partida en `m.partidas[k].pgn` y deja el resultado para
  confirmar por tablero («Mesa 3 · tablero 2: la cámara dice 0-1»); al
  anotarlo, el del encuentro sale de los tableros
  (`PareoEquipos.resultadoEncuentro`). Lo que llega sin tablero a un torneo
  por equipos (o con tablero a uno individual) no entra.
- **La partida de cada tablero se publica** (`m.partidas[k].pgn`, sin la
  marca de la cámara): `pareo-publicar` la guarda con la misma limpieza que la
  de una mesa (versión 10, el 29/10: hasta 12 000 caracteres, sin caracteres
  de control). En `torneos-pareo.html`, cada tablero del encuentro dice quién
  juega con cada color (antes la columna «Blancas» era siempre el equipo de la
  izquierda, y en los tableros pares jugaba con negras) y, si tiene partida,
  «Ver partida» la abre en el tablero.

### Transmitir a Lichess

Desde la caja de las cámaras de Pareo, «Transmitir a Lichess» manda las
partidas de la ronda en juego (las de las cámaras y las escritas a mano) y
sus resultados a una transmisión de Lichess de quien organiza, con
`POST https://lichess.org/api/broadcast/round/{id}/push` y su clave
(«study:write»).

- **La transmisión y cada ronda se crean en Lichess**, a mano: Lichess
  contesta a otra página solo en `/api/` (el preflight de `/broadcast/new` da
  403), así que crearlas desde Pareo no se puede. Se pega el enlace de la
  ronda (`/broadcast/<torneo>/<ronda>/<id>`); el de la transmisión entera
  (`/broadcast/<torneo>/<id>`) no sirve para mandar y se dice. Cuando empieza
  la ronda siguiente, la caja pide su enlace.
- **La clave queda solo en esta computadora** (`pareo_lichess_clave_v1`),
  nunca en el torneo, que se exporta y se publica (el verificador lo
  comprueba). «Dejar de transmitir a Lichess» la borra.
- Cada partida lleva `Event`, `Round` («ronda.mesa», en equipos
  «ronda.mesa.tablero»), `White`, `Black`, su Elo y, en equipos, `WhiteTeam`
  y `BlackTeam` (la tabla de equipos de Lichess). Las jugadas salen de lo
  guardado, sin su cabecera, y el resultado es el anotado en Pareo (no el de
  la cámara sin confirmar).
- **Se manda como mucho una vez cada 5 segundos** y una vez por minuto igual
  (un resultado anotado a mano). El retraso es el de las cámaras: lo que no
  les llegó a quienes miran tampoco le llega a Pareo. Lo que contesta Lichess
  se dice en la caja («Lichess: 12 partidas de la ronda 3, enviadas a las
  10:32», o que no acepta la clave).
- En la política de privacidad, en «Lichess y Chess.com»: qué se le manda y
  que la clave queda en la computadora de quien organiza.

### Guardar la partida en la cuenta del alumno

En `tablero-vivo.html`, debajo de las jugadas, «¿Es tu partida? Guardar en
mi cuenta»: quien la jugó, con su sesión abierta en ese aparato, elige con
qué color jugó (con los nombres al lado), el torneo y la ronda, y la partida
queda en `partidas_torneo`, la misma de «Tus propios errores» y la libreta de
torneos: su profe la ve y el motor la revisa.

- **La base decide**: `partidas_torneo` solo deja insertar en la propia
  cuenta (`student_id = auth.uid()` por omisión y en la política) y desde 10
  medias jugadas; por eso el botón sale recién con 10. No se manda
  `student_id`.
- Sin sesión, dice cómo entrar (el login no devuelve el `#`, así que hay que
  volver a abrir el enlace). La fecha es la de hoy en hora de Costa Rica
  (`HoraCR.hoy()`); el resultado, el que llegó de la cámara (o `*`).
- No se guarda dos veces la misma (`vivo_guardadas_v1`, en el aparato, por
  partida y número de jugadas).

### Quien mira y quien transmite: repasar, tiempos, jugada ilegal, proyector, motor y retraso

El tercer pedido de mejoras del dueño («todas»). Lo de este paquete:

- **La hora de cada jugada.** La cámara guarda la hora de cada jugada
  (`horas`, y la de arranque, `inicio`; null si no se sabe, como en una
  partida cargada a mano), también en el celular junto con la partida
  (`camara_partida_v1_<n>_horas`). De ahí salen dos cosas:
  - **El tiempo de cada jugada**: viaja en cada mensaje (`tiempos`, en ms) y
    cuánto lleva pensando quien tiene el turno (`espera`). Quien mira ve «La
    pensó 1:23» y «Piensan las negras: 3:12», con su propio reloj sumado a lo
    que llevaba al llegar el mensaje (los relojes de los dos celulares no
    tienen por qué coincidir). Pareo Integral guarda la partida con cada
    tiempo como lo escriben Lichess y ChessBase, `{[%emt 0:01:23]}`
    (`PartidaEnVivo.pgn(juego, resultado, tiempos)`, que arma el PGN a mano
    porque chess.js 0.10.3 no escribe comentarios; chess.js y
    `PareoPartida.leer` los leen sin problema).
  - **El retraso de la transmisión**, que elige quien transmite: «Sin
    retraso», 5, 10, 15 o 30 minutos. Se manda la partida con las jugadas
    que ya cumplieron ese tiempo (`vistaVivo`), y cada 5 segundos se revisa
    si salió otra. Como sale de la hora de cada jugada, vale también después
    de recargar la página. **Cuando la partida termina, se manda entera**:
    ya no hay a quién ayudar, y así el resultado y la partida le llegan al
    árbitro de Pareo sin esperar. En un torneo es del torneo: todas sus
    cámaras igual (va en `camara_torneo_v1` y pasa a los otros cuadritos).
    Quien mira ve «Con 15 minutos de retraso».
- **Repasar la partida** en `tablero-vivo.html`: «⏮ ◀ ▶ ⏭», también con las
  flechas, Inicio y Fin; «Volver al vivo». Repasando, una jugada que llega no
  lo saca de donde está (`paso`).
- **Una posible jugada ilegal**: si lo que ve la cámara no sale de ninguna
  jugada legal y no se movió la cámara, lo dice, y en un torneo le manda al
  árbitro un aviso aparte (`alerta`: torneo, ronda y mesa, **nunca las
  casillas**: con retraso, eso sería pasar la jugada). En Pareo sale como
  aviso y queda en la caja de las cámaras con «Visto»; la misma mesa, una vez
  cada 30 segundos como mucho. En la cámara, la mesa pasa a «Necesita ayuda»
  en «Cómo van las cámaras».
- **«Proyectar en la sala»** (con un torneo): todas las mesas en pantalla
  completa, de a 6, rotando cada 15 segundos, sobre el fondo oscuro del
  sitio. Si el navegador no deja la pantalla completa, igual se ve grande.
- **La evaluación de Stockfish**, apagada por omisión: la casilla «Ver la
  evaluación de Stockfish» carga `js/shared-engine.js` y
  `js/preparacion-motor.js` (la misma evaluación de la preparación de
  rivales; profundidad 14) y muestra la barra y el número, de la posición que
  se está viendo (también repasando). La barra nunca va sola: el texto dice
  quién está mejor o el mate.

Lo prueban `verificar-camara-tablero.js` (repasar con botones y teclado, el
tiempo y el reloj, Stockfish de verdad, el proyector, la jugada ilegal que
llega al canal sin casillas y el retraso con el reloj de la cámara
adelantado) y `verificar-pareo-camaras.js` (los `[%emt]` y las alertas).
Rotos a propósito, saltan.

### La coronación, la luz, las tablas, las fotos y las simultáneas

El cuarto pedido de mejoras del dueño («todas»). Lo de este paquete:

- **La coronación.** La cámara solo ve «pieza blanca» en la casilla: anota
  dama y pregunta con cuatro botones qué pieza puso. Si después la pieza
  coronada se mueve como no puede una dama (un salto de caballo), ninguna
  jugada explica lo que se ve, y se prueba con las otras piezas
  (`LectorTablero.deducirCoronacion`): la que lo explique con una jugada de
  esa pieza es la que se coronó, y se corrige sola. Cambiar la pieza vuelve
  a jugar lo que siguió (`cambiarCoronacion`); si algo deja de ser legal (la
  «dama» que se movió en diagonal no puede ser torre), no se cambia. Torre y
  alfil no se deducen nunca (todo lo que hacen lo puede hacer una dama): se
  eligen con los botones. Lo escrito a mano («e8=C») ya dice cuál.
- **La luz que cambia.** Mientras se lee la partida sin nada raro, cada 15
  segundos se vuelve a calibrar con la posición que se sabe y se mezcla con
  la de antes (`mezclarCal`, peso 0,3): sigue al sol que se corre o a una
  nube antes de que empiece a leer mal. Si de golpe varias casillas se leen
  mal (prendieron la luz), antes de avisar una jugada ilegal se prueba con la
  luz de ahora: **si con ella se lee la partida entera, 64 de 64, era la
  luz**, se calibra y sigue («Cambió la luz…»). Una pieza que de verdad se
  movió no calza con la partida y se sigue avisando.
- **La triple repetición y las 50 jugadas** (`PartidaEnVivo.reglaDeTablas`):
  se dicen justo en la jugada en que se cumplen (3 y 5 veces la misma
  posición; 50 y 75 jugadas de cada uno sin captura ni peón). La casilla al
  paso cuenta solo si la captura se puede hacer (art. 9.2.3): chess.js la
  pone después de todo avance doble, y sin esto «1. c4» y la misma posición
  más tarde no eran iguales. **Nada se marca solo**: 3 veces y 50 jugadas se
  reclaman; 5 y 75 son tablas por las Leyes (art. 9.6), pero las confirma el
  árbitro. En un torneo, el aviso le llega a Pareo con su `tipo`, aparte del
  de la jugada ilegal (uno no tapa al otro), con el artículo.
- **La foto del tablero**, con cada resultado y cada aviso: el tablero
  **enderezado con la homografía**, visto desde arriba como un diagrama
  (256 × 256, JPEG), así que no sale nadie alrededor. Queda en «Fotos del
  tablero» de la cámara (las últimas 6, para bajarlas) y, en un torneo, le
  llega a Pareo junto al aviso o al resultado para confirmar: «Ver foto» y
  «Pasar a las incidencias», donde queda con su mesa (`incidencias[].foto`)
  y se vuelve a ver. Pareo solo acepta un `data:image/jpeg` de menos de
  120 000 caracteres, con un motivo conocido, del torneo y la ronda en juego.
  **No se publica**: lo que va a `pareo_publicados` no lleva incidencias.
- **«Enseñarle a la cámara»**, apagado por omisión. Encendido (si lo permite
  quien organiza), con cada jugada anotada se guarda en el aparato
  (IndexedDB, hasta 500) la foto enderezada con su posición: las 64 letras de
  la lectura y el FEN. Se bajan en un .zip (`TablaExcel.zip`, el mismo de
  Pareo) con `etiquetas.csv`, para entrenar un modelo con nuestros tableros
  cuando con otra luz falle. No se manda nada a ningún lado.
- **Las simultáneas**, sin torneo: en «Transmitir en vivo», «Una
  simultánea». Cada cámara dice su número de tablero y todas usan el mismo
  código (la primera lo crea). Lo que viaja lleva `{ simul: 1, mesa }`; quien
  mira ve todos los tableros juntos («Tablero 1», «Tablero 2»…) y el enlace
  de cada alumno (`#código&m=N`) abre el suyo en grande. Los avisos y las
  fotos al árbitro siguen siendo solo de un torneo.
- **Los momentos clave**, en `tablero-vivo.html`, cuando la partida
  terminó: «Ver los momentos clave» la hace revisar por Stockfish en ese
  aparato (profundidad 10, posición por posición) y muestra hasta tres
  jugadas que perdieron 2 peones o más, con la mejor. Se eligen con la regla
  de «Tus propios errores» (`ErroresPropios.detectar`, de los dos lados): una
  sola copia de qué es un error. Va con un botón porque es trabajo para el
  celular. Tocar una lleva el tablero a esa jugada.
- **La cámara en la clase en vivo** la puede abrir también quien da clase
  (`role = 'profesor'`). Ver «La cámara en la clase en vivo» en
  `clase-en-vivo.md`. (Desde el sexto paquete la abre también el alumno.)

Lo prueban `verificar-camara-tablero.js` (la coronación preguntada y
deducida, la luz de golpe y poco a poco, la repetición y su aviso, la foto
enderezada —a5 con la torre que saltó, la fila 8 arriba—, «Enseñarle a la
cámara» con su .zip, la simultánea con dos cámaras y dos que miran, y los
momentos clave con un Stockfish de mentira), `verificar-pareo-camaras.js`
(las tablas aparte de la jugada ilegal, la foto: cuál se acepta, «Ver foto»,
«Pasar a las incidencias» y que no se publique) y `verificar-clase-camara.js`.
Rotos a propósito, saltan.

### Armar, entrenar en el tablero, el PGN de la ronda y el informe de las cámaras

El quinto pedido de mejoras del dueño («si todas»):

- **«¿Está bien armada?»**: lo que ve la cámara contra la posición que
  debería haber (la de la partida, o la inicial), casilla por casilla y con
  el nombre de la pieza: «Falta el caballo blanco en b1», «Sobra una pieza
  blanca en e4», «En h2 hay una pieza negra y debería ser blanca (el peón)».
  Sin calibrar, usa el giro de las esquinas que mejor explica esa posición
  (`buscarGiro`, lo mismo que calibrar) sin quedarse con nada. La cámara solo
  sabe color: «sobra una pieza blanca», nunca qué pieza sobra.
- **Entrenar en el tablero de verdad** («Entrenar en tu tablero»): la cámara
  lee la jugada de quien entrena y la del otro lado la dice la pantalla (y la
  voz, con «Activar voz»), por ejemplo «El motor juega e5: mueve el peón
  negro de e7 a e5». **La cámara espera a ver esa jugada en el tablero**
  (`guion.esperando`); otra no se anota. Contra el motor: Stockfish en el
  aparato (`preparacion-motor.js`), con blancas o negras y profundidad 1, 5 o
  12. Un ejercicio: de los bancos ya comprobados del Entrenamiento
  (`entreno/data/mates.json` y `tactica.json`; ninguna posición se inventa):
  se arma con la misma comprobación, se juega la solución, una jugada
  equivocada se vuelve a su lugar (la cámara espera a verla de vuelta) y la
  respuesta del rival la pone quien entrena. Un mate vale aunque sea otro.
- **Las jugadas en voz** en `tablero-vivo.html` ya funcionaban: «Activar
  voz» del encabezado (`js/voz-pagina.js`) lee `#anuncio`. Ahora lo comprueba
  el verificador (rompiendo la región viva, salta).
- **«Bajar todas las partidas (PGN)»** en la cuadrícula de quien mira: las
  mesas (o tableros de la simultánea) en un solo PGN, cada una con su torneo,
  ronda, mesa (`Board`), nombres, la fecha de hoy en Costa Rica, resultado y
  `[%emt]` si se sabe; lo que ya llegó, con retraso hasta donde se ve.
- **El informe de las cámaras de la ronda** en Pareo: por mesa, desde y
  hasta cuándo transmitió, cuántas jugadas anotó sola y cuántas se
  escribieron a mano en la cámara (la cámara lo manda en `mano`), sus
  posibles ilegales y avisos de tablas (contados aparte: «Visto» quita el
  aviso de la lista, no de la cuenta) y el resultado. Sale de lo que llegó a
  esa pestaña; no se guarda en el torneo.
- **Reconocer qué pieza es** (y no solo su color) queda para cuando haya
  fotos: hace falta entrenar un modelo con unas cuantas centenas de fotos
  etiquetadas de nuestros tableros, que es lo que junta «Enseñarle a la
  cámara».

Lo prueban `verificar-camara-tablero.js` (el armado, mal y bien, sin
calibrar y calibrada; el motor de mentira con la jugada que no es; el mate en
2 del banco con una equivocada que vuelve; la voz; el PGN de la simultánea) y
`verificar-pareo-camaras.js` (el informe). Rotos a propósito, saltan.

### El reloj, lo entrenado en la cuenta, las pistas y la cámara del árbitro adjunto

El sexto pedido de mejoras del dueño («si dale»):

- **El reloj de la partida** (opcional, «Reloj»): se elige el ritmo
  (minutos + incremento) y cambia solo con cada jugada que anota la cámara:
  a quien movió se le resta lo que pensó y se le suma el incremento; con dos
  jugadas juntas (se escapó una), a cada uno la suya. Se cuenta con
  `Date.now()` del aparato, igual que el tiempo de cada jugada; «Pausar»
  detiene los dos (ninguno corre). Una partida nueva lo apaga. **La
  bandera**: cuando llega a cero se marca el resultado —gana el otro, o
  tablas si el otro ya no puede dar mate con ninguna serie de jugadas legales
  (art. 6.9): con solo el rey, o con rey y una pieza menor contra el rey
  solo; un caballo contra rey y peón sí puede, y gana— y se dice «Lo confirma
  el árbitro». Viaja a quien mira en cada envío (`reloj: {w, b, corre}`, en
  ms, lo que quedaba al mandarlo; `PartidaEnVivo` lo valida, hasta un día) y
  `tablero-vivo.html` le resta al que corre lo que pasó desde que llegó:
  «⏱ Blancas 4:12 · Negras 3:58 (corre)». **Con retraso no se manda**: el
  tiempo de ahora delataría lo que todavía no se ve.
- **Lo entrenado queda en la cuenta**, y por eso **la cámara la abre toda
  cuenta** (antes, quien administra y quien da clase): en un alumno no hay
  nada que esconder detrás (no lee datos de nadie), y entrenar en su tablero
  es para él. En modo mesa, sin cuenta, no se guarda nada.
  - La partida **contra el motor**, terminada y desde 10 medias jugadas (lo
    pide la base), va a `partidas_torneo` con el evento «Contra el motor
    (cámara, nivel …)»: la libreta de torneos y «Tus propios errores», donde
    su profe la ve y el motor la revisa. A medias, no se guarda.
  - Cada **mate resuelto** (mate en 1, 2 o 3 del banco de Mates) va a su
    progreso del Entrenamiento, `EntrenoProgress.log("mates", …)` con
    `desde: "camara"` y `comoSalio(con error, con pista)`, como en la página
    de Mates. La táctica no anota progreso (tampoco en su página).
- **Las pistas**: en un ejercicio, al segundo intento que no era, qué pieza
  se mueve (de la solución: «se mueve el rey de d3»); contra el motor, si
  lleva más de un minuto con su turno, la pieza de la jugada que Stockfish
  haría en su lugar («mira la dama de f3»), una vez por jugada. Nunca la
  jugada entera. Una pista hace que el mate no cuente como limpio.
- **La cámara del árbitro adjunto** («¿Qué mesa es? (árbitro)», con el
  torneo elegido y fuera del modo mesa): el adjunto apunta a cualquier
  tablero de la sala, toca «Buscar el tablero» y el botón. La cámara escucha
  el canal del torneo (pide las partidas con `pedir` y lee los `estado`, en
  el mismo canal que usa si también transmite: un canal por código,
  `canalDe`), y busca cuál de las posiciones transmitidas explica lo que ve
  con `buscarGiro` (sin calibrar: calibra con cada una). Dice la mesa y si
  coincide (64 de 64), o qué casillas no calzan con lo transmitido —una
  cámara que anotó mal o una pieza movida—, con la misma lista que «¿Está
  bien armada?» (`diferencias`). Si dos mesas tienen la misma posición, lo
  dice; si ninguna se parece (menos de 48 casillas), también.

Lo prueba `verificar-camara-tablero.js`: el reloj con el reloj del aparato
adelantado (los 10 s que se restan, el incremento, la pausa, quien mira, la
bandera con victoria, con tablas y con el caballo contra el peón); la pista
del motor al minuto y la partida guardada con su evento; la pista al segundo
intento y el mate en el progreso, no limpio; el alumno que abre la cámara; y
el adjunto que encuentra la mesa 6 sin calibrar, una casilla que no calza y
un tablero que no es de ninguna. Rotos a propósito, saltan.

### Los relojes de todas las mesas y la bandera al árbitro

El séptimo pedido del dueño («hacer 6»): con el reloj de la cámara en
varias mesas, quien mira y el árbitro ven quién anda corto de tiempo.

- **Una sola copia de la cuenta**: `PartidaEnVivo.relojDe(d)` (lo que le
  quedaba a cada uno al mandarlo, menos lo que pasó desde que llegó al que
  corre, con el reloj de quien mira, `d.recibido`), `pocoTiempo(r)` (el
  color que corre con menos de un minuto) y `tiempoReloj(ms)` (los segundos
  empezados cuentan, como un reloj de ajedrez). La usan `tablero-vivo.html`
  (en grande y en la cuadrícula) y Pareo.
- **En la cuadrícula de quien mira**: cada tarjeta dice sus dos tiempos; con
  menos de un minuto, también «¡Poco tiempo para las negras!» (escrito, no
  solo el borde rojo), y arriba la lista «⏱ Con poco tiempo: Mesa 6 (las
  negras, 0:30)». Cada segundo se cambia solo ese texto, sin volver a armar
  las tarjetas (ver «La cámara gasta poco»).
- **En Pareo**, en la caja de las cámaras, el mismo renglón con las mesas de
  la ronda que andan cortas (`relojesCamaras`, cada segundo, sin volver a
  armar la caja).
- **La bandera**: cuando cae en el reloj de la cámara de un torneo, al
  árbitro le llega el aviso `bandera` con el color (`alertarArbitro(t, tipo,
  extra)`) y la foto del tablero con ese motivo (`t.finPor`, la que se toma
  con el resultado). En Pareo queda en la lista de avisos con «Ver foto» y
  «Visto», y el resultado, como siempre, para confirmar. No cuenta en el
  informe como aviso de tablas ni de jugada ilegal.

Lo prueban `verificar-camara-tablero.js` (la cuadrícula con el reloj de
quien mira adelantado, la bandera con su aviso, su color y su foto) y
`verificar-pareo-camaras.js` (las mesas cortas y la bandera con su foto).
Rotos a propósito, saltan.

### Jugar a distancia, las planillas en PDF y cómo lee cada tablero

El octavo pedido del dueño («hacer 1, 7, 10»):

- **Jugar a distancia en tableros de verdad** («Jugar a distancia», fuera del
  modo mesa): cada uno en su casa con su tablero y su celular encima. Quien
  crea la partida elige su color y pasa el código o el enlace
  (`camara-tablero.html#d=<código>`, que lo deja escrito); quien se une juega
  con el otro. Va por un canal de Broadcast propio,
  `tablero-distancia-<código>`, sin tabla, como la transmisión. **Cada
  mensaje lleva la partida entera** (`jugadas`): uno que se pierde no rompe
  nada, el siguiente la trae; al unirse se manda «hola» y el otro contesta
  con la suya; si el rival quedó atrás, se le vuelve a mandar. La jugada del
  rival se dice («Tu rival juega e4: mueve el peón blanco de e2 a e4») y
  se pone en el tablero: la cámara espera a verla (`guion.tipo =
  "distancia"`, `esperando`), como con el motor; jugar con el turno del
  rival se rechaza. **El reloj**: cada uno manda lo que le queda; el tiempo
  del rival lo pone su mensaje, y poner su jugada no le cuesta nada a nadie
  (`guion.colocando`: `anotar` no gasta ni suma el incremento). El
  resultado (mate, «Me rindo», la bandera o uno marcado) llega al otro y
  termina la partida en los dos; con 10 medias jugadas o más queda en
  `partidas_torneo` de cada uno, con su color y «A distancia (cámara):
  contra <nombre>» (`guardarEnCuenta`, la misma de la partida contra el
  motor).
- **Las planillas en PDF** (`js/planilla-pdf.js`, una sola copia): una hoja
  por jugador, como la planilla oficial —número y jugada de cada color, en
  dos mitades de 30 renglones; otra hoja si pasa de 60 jugadas—, la jugada en
  algebraica española (`ComandosTablero.sanEspanol`, también con el Modo
  Adaptado; en el Pareo en inglés, el SAN), el resultado, las firmas y la
  marca de agua de Ajedrez Integral. La cámara la arma con «Planillas en
  PDF» (solo una partida desde la posición inicial) y Pareo, «Planillas de la
  ronda (PDF)», con todas las mesas que mandaron su partida. Es una ayuda: la
  planilla que vale es la que escribe cada jugador (art. 8.1), y lo dice.
  `js/reporte-pdf.js` aprendió el bloque `salto` (la hoja siguiente).
- **Cómo lee cada tablero** («Este tablero y cómo lo lee la cámara»): quien
  maneja la cámara escribe qué tablero y piezas son, y la luz se mide al
  calibrar (el brillo medio de las casillas: poca, normal o mucha). Con cada
  partida terminada se anota en el aparato (`camara_lectura_v1`) cuántas
  jugadas leyó sola, cuántas a mano, cuántas veces dudó y cuántas posibles
  ilegales vio, y se resume por tablero y luz, los que mejor lee arriba. En
  un torneo viajan `equipo` y `dudas` (`PartidaEnVivo` los valida): Pareo
  los muestra en el informe de las cámaras y guarda cada partida terminada en
  esa computadora para **todos los torneos** (`pareo_camaras_lectura_v1`, no
  en el torneo, que se publica), con su tabla «Cómo leen los tableros».

Lo prueban `verificar-camara-tablero.js` (dos cámaras que juegan una partida
de 10 medias jugadas a distancia, el turno del rival, «Me rindo», lo guardado
en la cuenta de cada una y las dos hojas del PDF; la luz, el tablero y la
tabla de lectura) y `verificar-pareo-camaras.js` (el tablero y la luz en el
informe, lo guardado para todos los torneos y las planillas de la ronda).
Rotos a propósito, saltan.

### Que no se caiga: la cámara que se recupera sola, «¿Está lista esta mesa?» y la batería

El noveno pedido del dueño («hacer 3, 4 y 5», de las mejoras para que la
cámara no falle en un torneo):

- **Se recupera sola.** Si el video se corta (la pista avisa `ended`: el
  celular soltó la cámara, otra app la tomó) o se queda congelado 15 s (el
  tiempo del video no avanza), se vuelve a abrir sola, esperando cada vez
  más (1, 2, 4… hasta 30 s), y lo dice: «Se cortó la cámara: la vuelvo a
  abrir en 1 s» y «La cámara volvió». Al volver a la pestaña, lo mismo. Si
  el celular suelta la pantalla encendida (Wake Lock), se vuelve a pedir.
  **El canal**: si Realtime avisa `CHANNEL_ERROR`, `TIMED_OUT` o `CLOSED`, se
  deja el canal viejo, se arma uno nuevo con la misma espera creciente, y al
  conectarse cada tablero manda su partida entera (lo que pasó sin señal se
  guardó en el celular). Los avisos de un canal ya reemplazado se ignoran:
  sin eso, cerrar el viejo disparaba otra reconexión.
- **«¿Está lista esta mesa?»** (arriba, apenas calibra): lee las 64
  casillas, hay luz (la que se midió al calibrar), hay batería, transmite y
  la pantalla no se apaga; cada cosa escrita con ✅ o ⚠️ y qué hacer, y el
  título dice cuántas faltan. Se revisa cada 3 s.
- **La batería** (`navigator.getBattery`, Chrome en Android; donde no se
  sabe, no se dice nada): con menos de 20 % y sin cargar, el aviso arriba y
  una vez en el aviso de la página; con el cargador, se va.
- **El latido a Pareo** (en un torneo): cada 30 s, y apenas cambia la
  revisión o la batería, la cámara manda `latido` con su mesa, la batería y
  lo que falta (`lista.faltan`). Pareo (`latidoDeCamara`, validado como los
  avisos) lo junta con las jugadas en la caja de las cámaras: **«📵 Sin
  noticias de la cámara: mesa 5 (hace 2 min)»** si una mesa sin terminar no
  manda nada en 90 s (ni jugadas ni latido: una partida quieta igual late),
  «🔋 Batería baja: mesa 2 (15 %)», «⚠️ Revisar antes de la ronda: mesa 2
  (poca luz, batería baja)» y «✅ Listas: mesa 3», cada segundo, sin volver a
  armar la caja. Una partida terminada ya no necesita a nadie.

Lo prueban `verificar-camara-tablero.js` (la batería de mentira, la revisión
antes y después del cargador, el canal cortado a propósito que se vuelve a
armar y manda la partida entera, la cámara de Chromium que se corta y vuelve
sola, y el latido de una mesa del torneo) y `verificar-pareo-camaras.js`
(los latidos, lo de otro torneo u otra mesa que no entra, y la mesa sin
noticias con el reloj adelantado). Rotos a propósito, saltan.

### El VAR de la mesa, el video grabado, cuatro tableros, el jugador ciego, el reloj de la mesa y la ronda en un vistazo

El décimo pedido del dueño («hacer 1, 3, 4, 6 y 7», y «analiza si podemos
agregar un tipo VAR, que en caso de algún reclamo, poder poner pausa y ver el
video de la partida, esto ayuda a saber si una persona tocó una pieza y debe
moverla»):

- **El VAR de la mesa** (`js/camara-var.js`, sección «Revisar una jugada»).
  Con «Grabar los últimos 10 minutos para revisar», el celular de la mesa
  graba la imagen de la cámara; ante un reclamo (pieza tocada, art. 4.3; la
  soltó en otra casilla, art. 4.6) el árbitro toca «Revisar el video» y ve lo
  grabado en pausa, a un cuarto de la velocidad, la mitad o normal, cuadro a
  cuadro (0,1 s) y 2 s atrás. Tres decisiones:
  - **El video no sale del aparato.** Son menores de edad jugando: se graba
    en la memoria del celular, se borra al apagarlo o al cerrar la página, y
    no viaja por el canal de la transmisión (lo comprueba el verificador
    transmitiendo con el VAR encendido). Lo único que sale es el pedazo que
    el árbitro baja a propósito para el acta («Guardar este pedazo para el
    acta»). Por eso NO se manda a Pareo ni a un servidor: revisar desde
    lejos pediría subir video de menores a algún lado, con su consentimiento
    y su lugar en `privacidad.html`, y el reclamo se resuelve en la mesa.
    Está apagado por omisión y el estado dice siempre que graba y que el
    video queda solo en ese celular.
  - **Diez pedazos de un minuto, no una grabación larga.** `MediaRecorder`
    arma un archivo que solo se ve desde su comienzo: tirar el principio de
    una grabación larga la deja inservible. Se graba en pedazos de un minuto,
    cada uno un archivo completo, y se guardan los últimos diez (unos 5 MB
    por minuto a 700 kbps). El pedazo nuevo empieza ANTES de cerrar el
    anterior: entre los dos no se pierde nada. Al abrir el VAR se cierra el
    pedazo en curso (`cortar()`) para que lo de recién también se vea, y la
    grabación sigue en otro. Si la cámara se corta y vuelve, lo grabado antes
    se conserva. El archivo del grabador no trae su duración (el `<video>`
    dice `Infinity` y no deja saltar): `CamaraVar.duracion()` lo manda al
    final para obligarlo a calcularla.
  - **Se salta a lo que importa.** Cada jugada anotada y cada «mano sobre el
    tablero» (la primera lectura distinta de la partida: alguien tapó o
    movió piezas, con las casillas que cambiaron, `t.manos`) es una marca
    con su hora; tocarla deja el video 3 s antes, en pausa. Para una pieza
    tocada, la marca «Mano sobre el tablero (g1)» antes de una jugada de
    otra pieza es justo lo que hay que mirar.
  - Analizado y descartado por ahora: decidir solo con la cámara si una
    pieza se tocó. Una mano encima tapa casillas sin tocarlas; lo que la
    cámara da es dónde mirar, y quien decide es el árbitro mirando el video.
- **Leer un video grabado** («Leer un video grabado», junto a «Probar con una
  foto»). El mismo lector sobre un video del celular: se ubica el tablero en
  la primera imagen, se calibra y el video corre normal, al doble o a cuatro
  veces mientras se leen sus imágenes. **La hora de cada jugada es la de
  adentro del video** (`horaPartida()`: el comienzo del video más
  `currentTime`), no la de ahora: así el tiempo de cada jugada y las marcas
  del VAR dicen «minuto 1:02 del video». Con un video, el VAR revisa el video
  mismo. Sirve para la mesa sin transmisión y para reconstruir una partida
  después de un reclamo. Al doble de velocidad se lee bien (5 lecturas por
  segundo de la página son 2,5 por segundo de video, y una posición queda
  quieta varios segundos); a cuatro veces, una jugada muy rápida puede
  llegar junta con la siguiente, y eso ya lo resuelve «se escapó una
  jugada».
- **Hasta cuatro tableros con un celular** («¿Cuántos tableros ve esta
  cámara?», antes una casilla de «segundo tablero»). Con tres o cuatro la
  imagen se trabaja a 1280 de ancho y la cámara se pide a 1920; cada tablero
  con su color (amarillo, celeste, rosado, verde limón) y su número escrito
  encima. Sigue la advertencia de siempre: lo más confiable es un celular por
  tablero; con varios, el celular va bien alto y tiene que verlos enteros.
- **Un jugador ciego en la mesa** («Un jugador ciego en esta mesa»). El
  celular le dice al oído, con un audífono, «Tu rival jugó caballo f 3. Te
  quedan 12 minutos» apenas anota la jugada; si quiere, también «Anotada tu
  jugada…» para saber que se anotó; avisa al cruzar 5 minutos, 1 minuto y 30
  segundos, dice el resultado y tiene «Repetir la última jugada». **Habla
  aunque la voz del sitio esté apagada** (`BlindNotation.speak(…, { siempre:
  true })`): encender la voz de toda la página haría que leyera cada aviso.
  Se recuerda por tablero en el aparato.
- **El reloj de la mesa, leído de la imagen** (`js/lector-reloj.js`, «Leer el
  reloj de la mesa (prueba)»). Se marca con el dedo un rectángulo sobre el
  tiempo de las blancas y otro sobre el de las negras; cada segundo se leen
  sus números de siete rayas de la imagen a su tamaño de verdad. Cómo:
  - Lo claro y lo oscuro con el umbral de Otsu; los números son lo que hay
    MENOS (sirve para pantallas grises con números negros y para relojes de
    luces). **Dos pasadas**: lo que toca el borde del rectángulo (el marco
    del reloj) se aparta y el umbral se vuelve a sacar solo con la pantalla;
    con el marco negro adentro, el primero separaba el marco de todo lo
    demás. La orilla de la pantalla (medio tono) tampoco es un número.
  - Los números van inclinados: se prueba enderezar de 0 a 0,3 y vale la
    inclinación con la que se reconocen más.
  - **Lo que no tiene sentido no se usa**: un número que no se reconoce, más
    de 59 minutos o segundos, un número tapado a medias (bajito pero ancho:
    no es un separador), un hueco del ancho de un número entre dos (uno
    tapado entero) o minutos y segundos que no son de a dos. Sin estas
    reglas, un número tapado daba «15:32» en vez de «1:05:32». Y una lectura
    vale si la anterior cuadra con ella (igual, o menos lo que pasó, con
    2,5 s de margen): un número mal leído una vez no mueve el reloj.
  - Corre el que baja; si ninguno baja en 3 s, el reloj de la mesa está
    parado. **La bandera es cuando el reloj de la mesa muestra 0**, no
    cuando la cuenta de la cámara llega a 0; entre lectura y lectura la
    cámara sigue a lo sumo 2 s. Con el reloj leído la cámara no suma
    incremento ni lleva el tiempo, y «Empezar el reloj» de la cámara lo
    reemplaza.
  - **Sin probar contra un reloj DGT de verdad**: el verificador dibuja
    relojes con números inclinados, marco, ruido y desenfoque. Antes de
    usarlo en un torneo, se prueba con el reloj que se va a usar y se mira
    que los dos tiempos que dice coincidan con los de la mesa.
- **La ronda en un vistazo** (Pareo, arriba del informe de las cámaras):
  cuántas mesas leyeron solas la partida entera, cuántas con correcciones a
  mano y cuántas siguen jugando, y una columna «Qué mejorar» por mesa (más
  luz; muchas jugadas a mano —un 20 % o más—: centrar la cámara y revisar la
  cuadrícula; dudó 3 veces o más; posibles ilegales: mirar el ángulo; sin
  noticias: la batería y la señal), con la lista para la próxima ronda.

Lo prueban `verificar-lector-reloj.js` (sin navegador: relojes de mentira con
todo lo que tienen los de verdad, y los que no deben leerse),
`verificar-camara-tablero.js` (cuatro tableros, un video WebM grabado en la
página y leído al doble, el VAR con una cámara de mentira —la mano que
levanta el peón, el cuadro a cuadro, el pedazo para el acta y que nada viaja
por la transmisión—, la voz del jugador ciego anotada sin parlantes y el
reloj de la mesa dibujado en la foto, con la bandera en 0:00) y
`verificar-pareo-camaras.js` (la ronda en un vistazo). Rotos a propósito,
saltan.

### La posible pieza tocada, el reloj que no se aprieta, encontrar el reloj solo y el tiempo de cada jugada

El undécimo pedido del dueño («hacer 2, 3, 4, 5…»):

- **Posible pieza tocada** (en el VAR). La «mano sobre el tablero» ahora
  junta TODAS las casillas que tapó o movió mientras estuvo (antes, solo las
  del primer instante). Antes de cada jugada, una mano que tapó una pieza
  PROPIA de quien jugó y se fue sin tocar la que después jugó sale primera en
  la lista del VAR: «⚠️ Posible pieza tocada: el caballo de g1 (después jugó
  e4)», y el estado del VAR dice cuántas hay para revisar. Es una pista para
  el árbitro, nunca una decisión: una mano puede tapar una pieza sin tocarla
  (desde arriba, el brazo tapa medio tablero). Por eso no sale en la pantalla
  de la mesa, que ven los jugadores, ni se le manda a Pareo: se mira en el
  VAR cuando hay un reclamo. Juntar todo lo que tapó la mano es lo que evita
  la falsa alarma más común: el brazo que pasa sobre el caballo de camino al
  peón que juega.
- **El reloj y las jugadas** (con el reloj de la mesa leído). Se anota
  cuándo se aprieta el reloj (el que corre ahora no es el último que corría)
  y se compara con las jugadas:
  - **Apretó sin mover**: el reloj pasó al otro y no hubo jugada de quien
    apretó desde que empezó a correr su reloj hasta 8 s después de apretar
    (la cámara anota la jugada cuando la mano se va, a veces después de
    apretar). Contar solo «20 s antes» marcaba como «sin mover» a quien
    apretó tarde después de mover. Por las Leyes se trata como una jugada
    ilegal (art. 7.5.3).
  - **Movió y no apretó**: 15 s después de su jugada, su reloj sigue
    corriendo. El árbitro no se lo dice al jugador; queda anotado por si hay
    un reclamo.
  Las dos van a la lista de la cámara (dentro de «Leer el reloj de la
  mesa») y, en un torneo, a Pareo como avisos `sinMover` y `sinApretar`, que
  ya no cuentan como «avisos de tablas» en el informe. Con el reloj leído,
  anotar una jugada ya no cambia quién corre: eso lo dice el reloj de la
  mesa (si no, se inventaba que el otro había apretado).
- **«Buscar el reloj»** (`LectorReloj.buscar`). Sin marcar nada: se buscan
  en la imagen entera, a su tamaño de verdad y fuera de los tableros, las
  manchas más oscuras (o más claras) que su vecindad que son rayas (llenas,
  angostas y largas) o, con la imagen algo borrosa, números enteros (las
  rayas se tocan: más altos que anchos y con huecos); las cercanas se juntan
  y cada grupo se lee. Si no se lee, puede ser las DOS pantallas juntas
  (entre una y otra a veces hay menos que entre dos rayas): se parte por sus
  tres huecos más grandes —el que separa las pantallas no siempre es el
  mayor: antes de un 1 también hay uno grande— y se prueba cada mitad. Los
  huecos claros de los números oscuros salen como otro grupo en el mismo
  lugar: de lo que se encima queda lo mejor leído. Partir así trajo lecturas
  falsas que las reglas de siempre no veían («3:20:58», con el «32» de una
  pantalla y el «0:58» de la otra), y por eso dos reglas más: **sin ningún
  separador no hay tiempo** (todo reloj muestra sus dos puntos o sus puntos)
  y antes del primer separador van uno o dos números. Y los dos puntos ya no
  se tiraban como motas: una mota es menos del 2 % de la mancha más grande
  (un número entero, con la imagen borrosa), no del 8 %. De lo que
  encuentra, los dos tiempos de altura parecida más cerca uno del otro.
  **Cuál es de las blancas lo dice el tablero calibrado**: desde arriba, las
  dos pantallas del reloj quedan una hacia cada jugador, así que la que está
  más cerca de la fila 1 es la de las blancas. Si las dos quedan a la misma
  altura del tablero, se avisa, y «Están al revés» las da vuelta.
  - **Los números girados**: desde arriba el reloj casi nunca se ve derecho.
    `leer()` prueba derecho y de cabeza (o, si el recuadro es más alto que
    ancho, girado a un lado y al otro). De cabeza, varios números se leen
    como otros (el 6 como 9): desempata la inclinación, porque los de un
    reloj se inclinan hacia adelante y, de cabeza, hacia atrás, que no se
    prueba.
- **Cómo usó el tiempo** (`js/grafico-tiempo.js`, en la cámara y en
  `tablero-vivo.html`, para revisar la partida en clase): barras de lo que
  pensó cada jugada y, si hubo reloj (el de la cámara o el de la mesa
  leído), las líneas de lo que le quedaba a cada uno; el resumen escrito (el
  total de cada uno y su jugada más larga) y una tabla para el lector de
  pantalla. El color nunca va solo: las blancas con borde y línea entera,
  las negras rellenas y línea cortada, todo en `currentColor` (el contraste
  es el del texto). Lo que quedaba se guarda en la cámara con cada jugada
  (`t.restan`); a quien mira le llegan solo los tiempos de cada jugada.

### Los casos del VAR para el curso de árbitros

El sexto punto del mismo pedido («cuando se graba ya se cuenta con los
permisos siempre»): un pedazo de video del VAR se vuelve un caso de
formación en `arbitraje.html`, «Casos del VAR: ¿qué decides tú?»
(`js/arbitraje-casos-var.js`).

- **El camino**: el árbitro baja el pedazo con «Guardar este pedazo para el
  acta» en la cámara (que funciona también sin cuenta, en modo mesa), y
  quien administra lo sube en «Agregar un caso» con el título, la pregunta,
  de dos a cuatro opciones, la correcta, el porqué, el artículo y desde qué
  segundo se mira. Una sola puerta para crear casos: no hay otra en la
  cámara.
- **Quién**: los ven profesores y quien administra (como el examen); los
  suben y los borran solo quien administra. Lo dice la base: la RLS de
  `arbitraje_casos_var` y el bucket **privado** `arbitraje-var` (el video se
  pide con una dirección firmada de una hora). El formulario pide confirmar
  que quienes salen (o sus encargados) dieron permiso, y la política de
  privacidad lo dice (en «Menores de edad»).
- **El video y la fila llevan el mismo id** (`<id>.webm`): si la fila no se
  puede guardar, el video subido se borra; al borrar un caso, se borran los
  dos.
- Al elegir: «✅ Así es» o «❌ No: lo que corresponde es…», el porqué y el
  artículo de las Leyes. El video arranca en su segundo y a la mitad de la
  velocidad: un toque de pieza dura un instante. No se guardan las
  respuestas: es para practicar, no un examen.

Lo prueban `verificar-lector-reloj.js` (el reloj girado y de cabeza, y
buscarlo en una escena con un tablero, también con la cámara girada, y que
sin reloj no inventa ninguno), `verificar-camara-tablero.js` (la mano que
toca el caballo de g1 y se va antes de jugar e4; las negras que mueven y no
aprietan y las blancas que aprietan sin mover, con el reloj dibujado en la
foto; «Buscar el reloj» con las blancas a la izquierda y «Están al revés»;
el gráfico en la cámara y en quien mira), `verificar-pareo-camaras.js` y
`verificar-casos-var.js` (la RLS de la migración; un profesor que mira y
decide pero no agrega ni borra; quien administra que agrega —no sin el
permiso— y borra la fila y el video; el título que va como texto; el alumno
que no entra). Rotos a propósito, saltan.

### Reconocer qué pieza es

El séptimo punto del mismo pedido: hasta ahora la cámara sabía si una casilla
estaba vacía o tenía una pieza blanca o negra, y la jugada la deducía
chess.js de la posición anterior. Para arrancar desde cualquier posición
había que escribirla. Ahora la cámara puede aprender QUÉ pieza es
(`js/piezas-modelo.js`).

- **Se entrena en el aparato, con nuestras fotos.** «Enseñarle a la cámara»
  ya juntaba, con cada jugada, la foto del tablero enderezado con su FEN:
  cada casilla ocupada es un ejemplo, y su pieza la dice el FEN.
  «Entrenar con estas fotos» (desde 10 fotos; con 100 o más, mejor) arma
  una red chica (la casilla, con un poco de margen, en 16 × 16 grises
  centrados y escalados → 32 → las 6 piezas) en segundos, en el mismo
  celular, y dice cuánto acierta **en fotos que no vio** (se aparta una de
  cada cinco FOTOS, no casillas: dos casillas de la misma foto se parecen
  demasiado para medir con ellas). Aprende nuestros tableros, con nuestra
  luz y nuestro ángulo; nada se manda a ningún lado. Se guarda en el
  aparato, y «Bajar el modelo» / «Cargar un modelo» lo pasan a otro celular
  (un archivo que no es un modelo no se carga).
- **El color y si está vacía los sigue diciendo el lector** de siempre, que
  ya los lee bien: el modelo solo decide el tipo. Por eso no hace falta
  entrenarlo con cada luz para el color.
- **«Leer la posición del tablero»** (en «Empezar desde otra posición»):
  arma la posición entera y la escribe arriba, con a quién le toca (se
  elige) y los enroques que se ven (rey y torre en su casilla). Lo que no
  puede ser se corrige con lo más probable que sí: un rey de cada color y
  ningún peón en la fila 1 ni en la 8; si aun así chess.js no la acepta, se
  dice. Las casillas de las que duda (menos de 60 %) se nombran: **la
  posición la confirma una persona** («Usar esta posición») antes de seguir.
- Un peón se ve casi igual desde un lado que desde el otro: se entrena
  también con el espejo de cada casilla.
- **Sin probar con fotos de verdad**: los verificadores dibujan piezas con
  formas distintas vistas desde arriba (corridas, de tamaño un poco
  distinto y con ruido) y comprueban que aprende, que arma posiciones que
  no vio y que las reglas del rey y los peones corrigen lo imposible. Si
  con nuestros tableros acierta poco, lo siguiente es una red más grande o
  una casilla más grande (24 o 32), con las mismas fotos.

Lo prueban `verificar-piezas-modelo.js` (sin navegador: 120 fotos de
partidas al azar, acierto en las que no vio, posiciones enteras nuevas, la
foto sin rey blanco y con un peón en a8, guardar y cargar) y
`verificar-camara-tablero.js` (una partida jugada con piezas de formas
distintas que junta sus fotos, «Entrenar con estas fotos», «Leer la posición
del tablero» con una posición de otra partida, bajar el modelo y el archivo
que no es un modelo). Rotos a propósito (sin aprender; sin las reglas del rey
y de los peones), saltan.

### Probar esta mesa, el VAR que guarda lo marcado y el VAR desde camaras.html

El pedido «hacer 1, 3, 4, 5, 6, 7, 10, 11» de las mejoras al VAR. Lo que más
faltaba no era otra función: era saber si todo esto sirve en una mesa de
verdad, porque las pruebas del sitio usan piezas y relojes dibujados.

- **«Probar esta mesa»** (1): dos minutos con la mesa armada y calibrada.
  Prende el VAR si estaba apagado (y lo dice), y una lista dice con
  palabras —no solo con el color— qué está bien, qué falta y qué revisar:
  lee las 64 casillas, el celular bien puesto, el VAR grabando, 5 jugadas
  anotadas (y cuántas tuvo que preguntar o vio raras, **desde que empezó
  la prueba**), una mano que tocó sin mover (una mano que entró al tablero
  y se fue sin jugada en los 4 segundos siguientes), el reloj de la mesa
  apretado (si se está leyendo; si no, es opcional) y el toque mirado en el
  VAR. Al terminar, el resultado arriba (con el foco) y un informe para
  copiar con cada cosa y las jugadas. **La prueba no queda en la
  partida**: «Empezar la partida» vuelve a calibrar desde la posición
  inicial, como siempre.
- **«📍 Marcar este momento»** (4): el árbitro vio algo, o se lo avisaron,
  y lo deja marcado con su hora aunque nadie reclame todavía. Sale en el
  VAR como «📍 Marcado por el árbitro».
- **Lo marcado no se borra** (5): el pedazo donde cae la marca, y el
  anterior si la marca cayó en sus primeros 10 segundos (la marca deja el
  video 3 s antes), se guardan aparte de los últimos 10 minutos, hasta 10
  minutos marcados más (`fijar()` de `js/camara-var.js`). Un reclamo puede
  llegar después de los 10 minutos. Si se busca una hora que cae en el
  hueco entre lo marcado y lo último, se va al pedazo siguiente.
- **Comparar dos momentos** (6): «Fijar como A» y «Fijar como B» dejan la
  imagen quieta de lo que se ve, lado a lado, cada una con su hora (y su
  texto para el lector de pantalla). Se dibujan en la página; no se baja
  nada. Al cerrar el VAR se limpian.
- **La posición repetida en el VAR** (7): cada vez que apareció una
  posición que se repitió tres veces o más («🔁 vez 1 de 3, después de
  1… e5»), para mostrarles a los jugadores un reclamo de tablas (art. 9.2).
  Sale de `PartidaEnVivo.repeticiones()`, con la misma clave de posición
  que el aviso de la triple repetición (`clavePosicion`: la casilla al paso
  solo si la captura se puede hacer). Una sola copia de la regla.
- **El VAR desde `camaras.html`** (3): «Grabar el VAR en todas las cámaras»
  y, en la fila de cada mesa de «Cómo van las cámaras», «📍 Marcar» y
  «Revisar el VAR», con lo grabado y lo marcado escrito en la fila. La
  revisión se abre **en el cuadrito** (es la misma página: una sola copia
  del VAR, `window.varDesdeAfuera` de `js/camara-tablero.js`), y la página
  de afuera la lleva a la vista: es una ventana fija dentro de un cuadrito
  más alto que la pantalla, y desplazar desde adentro solo mueve el
  cuadrito. `revisar()` contesta apenas la ventana se abre, no cuando
  termina de cargar el video: si se cierra antes, el foco igual vuelve al
  botón que la abrió. El video sigue quedando en esa computadora: desde el
  celular de una mesa no se pide a distancia, porque eso sería mandar video
  de menores por la red, justo lo que «El VAR de la mesa» descartó.
- **Cómo se usa y la hoja para la mesa** (10): «📖 Cómo se usa en un
  torneo», cinco pasos escritos en la página, y «Imprimir la hoja para la
  mesa»: lo que tienen que saber los jugadores (no mover el celular, qué
  hacer si hay un reclamo, que decide el árbitro y no la cámara, que el
  video no sale del celular), con la mesa y el torneo si los hay y la marca
  de agua de Ajedrez Integral. Sale solo al imprimir. **El video corto de
  cómo se usa no se hizo**: tiene que grabarse en una mesa de verdad, con
  el celular encima; un video armado con las piezas dibujadas de las
  pruebas enseñaría otra cosa.
- **El celular mal puesto para el VAR** (11): con el tablero calibrado se
  sabe qué tanto de la imagen ocupa y qué tan de lado está. Menos de 15 %
  de la imagen, o dos lados opuestos que miden menos de 60 % uno del otro
  (muy de costado), y lo dice en el VAR y en «Probar esta mesa»: un toque
  no se notaría. Solo un aviso: la cámara sigue leyendo igual. Los
  umbrales son de las fotos de prueba; si en las mesas de verdad avisa de
  más o de menos, se ajustan con lo que diga «Probar esta mesa».

Lo prueban `verificar-camara-tablero.js` («Marcar este momento»; los
caballos que van y vuelven y la posición de 1… e5 tres veces en el VAR;
«Fijar como A» y «Fijar como B» con imagen y hora; el grabador en chico,
pedazos de 1 s, que guarda lo marcado; el tablero chico en la imagen;
«Probar esta mesa» entera, desde sin calibrar hasta «Empezar la partida»
sin las jugadas de la prueba; la hoja para la mesa al imprimir; y en
`camaras.html`, grabar en todas, marcar, revisar a la vista con el foco de
vuelta y apagar en todas). Rotos a propósito (lo marcado que se borra, sin
repeticiones, el umbral del tablero chico y la página de afuera que no se
desplaza), saltan.

## Pareo para DGT

Un torneo presencial con tableros electrónicos DGT: el árbitro sube cada ronda
a chess-results (desde Swiss-Manager, como siempre), y alguien tiene que
cargar ese mismo pareo en DGT LiveChess, mesa por mesa, y crear la ronda en
la transmisión de Lichess. En un blitz las rondas salen cada pocos minutos.
`pareo-dgt.html` lo hace solo. **Es una herramienta con licencia** (lo pidió
el dueño: «que todas las herramientas de arbitraje sean con licencia»), en la
vitrina, ficha Arbitraje, con el id `pareo-dgt` (ver «Herramientas de
arbitraje»); quien administra la tiene sin licencia y le sale también en
`admin.html`, Contenido. vigila chess-results y, apenas sale una ronda, deja el archivo listo
para importar en LiveChess y crea la ronda en Lichess. El código está en
`js/pareo-dgt.js` y la parte pura (el PGN, qué hacer con cada lectura, los
formularios de Lichess) en `js/pareo/dgt.js`.

- **Lo que LiveChess importa es un PGN, no otra cosa.** El manual de LiveChess
  2.2 (pestaña «Rounds», menú de abajo a la derecha) dice que el pareo se
  puede importar «desde un PGN preparado con otro programa de pareo». No hay
  API para escribirle el pareo a LiveChess (la de `localhost:1982` es para
  leer los tableros), así que el último paso, importar, lo hace una persona:
  dos clics por ronda. El archivo lleva una partida **sin jugadas** por mesa
  (`*`), con `Event`, `Date`, `Round`, `Board`, `White`, `Black`, el título, el
  Elo y el `WhiteFideId`/`BlackFideId`. **Sin probar todavía contra un
  LiveChess de verdad**: no había uno a mano. Antes del primer torneo, se
  importa una ronda de prueba.
- **Solo las partidas, y solo las mesas que se transmiten.** Un bye o un «sin
  emparejar» no es una partida y no va al archivo. Y cada torneo lleva «Mesas
  que van al PGN»: de 100 mesas puede que se transmitan 2 (lo pidió el dueño).
  Se escriben como los «slices» de Lichess: `1-2`, `1, 5, 12`, `1-4, 10`;
  vacío son todas. `PareoDGT.leerMesas()` las ordena y junta (`2, 1` es
  `1-2`), y lo mal escrito se dice con un ejemplo, sin agregar nada. Al
  principio eran «Desde la mesa / Hasta la mesa», que no servía para mesas
  salteadas; lo guardado así se convierte solo al abrir la página.
- **Las mesas se cambian sin quitar el torneo**, en su tarjeta («Cambiar las
  mesas»): la ronda en curso se vuelve a armar con las nuevas y la bitácora lo
  dice («con las mesas nuevas»). Por eso `decidir()` compara también las
  mesas con las que se armó la ronda (`mesasElegidas`), no solo el pareo. Si
  ninguna de las mesas elegidas tiene partida en la ronda, se avisa: el
  archivo saldría vacío.
- **Varios torneos a la vez** (uno por categoría): cada uno con su número de
  chess-results, su rango de mesas y su transmisión en Lichess.
- **Los archivos van a una carpeta**: con Chrome o Edge en la computadora,
  «Elegir la carpeta» (`showDirectoryPicker`) y cada ronda se escribe ahí sola,
  `<torneo>-ronda-<n>.pgn`; un pareo corregido reemplaza al de esa ronda. Sin
  eso (otro navegador), se baja a Descargas. El permiso de la carpeta no
  sobrevive a recargar la página: se vuelve a elegir, y lo dice.
- **Vigila cada 30 segundos mientras la pestaña esté abierta**, también en
  segundo plano (la computadora de LiveChess tiene LiveChess adelante; el
  navegador la estira a un minuto como mucho). Cerrar la pestaña vigilando
  pregunta antes.
- **Cada ronda una sola vez.** Lo que ya se hizo con cada torneo (qué rondas
  tienen archivo, con qué pareo, y sus ids en Lichess) queda en `localStorage`
  de esa computadora: recargar no repite nada ni crea otra ronda en Lichess.
  Es de la computadora que maneja el torneo, no de la cuenta; abrir la página
  en dos computadoras crearía las rondas dos veces en Lichess.
- **Si chess-results cambia el pareo de una ronda ya hecha** (un error del
  árbitro, una incomparecencia), el archivo se vuelve a armar y la bitácora lo
  dice en grande: hay que importarlo otra vez. **A Lichess no se le manda
  solo**: si las partidas ya empezaron, el pareo sin jugadas podría dejarlas
  en la posición inicial hasta la jugada siguiente. Hay un botón «Mandarlo a
  Lichess» que pregunta antes.
- **La lectura de chess-results, en la Edge Function `pareo-dgt`.**
  chess-results no manda CORS. La función pide de cada torneo solo dos
  páginas fijas, siempre en `s3.chess-results.com`: el pareo (`art=2`, sin
  `rd` es la última ronda emparejada) y la lista inicial (`art=0`, por el
  FIDE-ID, que el pareo no trae). Caché en `pizarras_cache`: 20 s el pareo, 2
  min la lista. **Con licencia**: antes de pedir nada pregunta
  `tengo_herramienta('pareo-dgt')` con el token de quien llama (clave anónima
  + su `Authorization`), igual que `desempates-chess-results`, así que la
  verificación en dos pasos la exige la base. Recibe un número de torneo
  cualquiera, no la clave de una sala: sin candado sería un raspador de
  chess-results gratis para cualquiera. `verify_jwt` en true. La primera
  versión era solo para quien administra (sesión, aal2 e `is_admin`).
- **Cómo se lee el pareo** (comprobado con las páginas reales de tnr1498221 y
  tnr1498218, el 29/10/2026): las blancas por su lugar en el encabezado, las
  negras **desde el final de la fila** (la última celda es su «No.»), así una
  columna de más o de menos (los torneos sin «Club/Ciudad») no las corre. La
  fila de quien no juega trae una celda de menos y «sin emparejar» o «bye»; y
  chess-results escribe ahí un `<td & colsp & class="CRc">` roto, que el
  lector aguanta. La ronda, la fecha y la hora salen del `<h3>` («3. Ronda el
  2026/09/27 a las 11:00am»: el número va ANTES de «Ronda»).
- **Lichess, con el token de quien organiza.** El token (permiso
  `study:write`, con un enlace que lo crea ya con ese permiso) queda en
  `sessionStorage`, o en `localStorage` si se pide recordarlo. **Lo que está
  bajo `/api/` va directo del navegador** (la cuenta, `/api/account`, y
  empujar el pareo): esas direcciones contestan la consulta previa de CORS
  con `Access-Control-Allow-Origin: *`, y `lichess.org` ya estaba en
  `connect-src`. **Crear el torneo y la ronda no**: `/broadcast/new` y
  `/broadcast/{id}/new` no tienen versión `/api/` (da 404) y su `OPTIONS` da
  403, así que el navegador corta el pedido con «Failed to fetch» sin
  llegar a Lichess. Así falló la primera prueba de verdad, el 29/10, con los
  cuatro torneos del Festival Centroamericano; el doble de Lichess del
  verificador contestaba a todo y no lo mostró. Esas dos las hace la Edge
  Function (`accion: "lichess"`): recibe el token, lo usa para ese pedido y
  **no lo guarda ni lo anota**; solo esas dos rutas, solo a `lichess.org` y
  solo con licencia. Lo dicen la página y la política de privacidad. Con él, «Crear
  los torneos en Lichess» crea uno por torneo (`/broadcast/new`: nombre de
  chess-results, ritmo, zona de Costa Rica y la clasificación en
  chess-results), y cada ronda nueva se crea (`/broadcast/{id}/new`, con la
  hora de chess-results en hora de Costa Rica) y recibe el mismo PGN
  (`/api/broadcast/round/{id}/push`): el pareo se ve en Lichess antes de la
  primera jugada. Si Lichess falla, la ronda queda pendiente y se vuelve a
  intentar en la revisión siguiente, sin volver a bajar el archivo.
- **La pestaña «Tournament» de LiveChess no se puede automatizar, y se
  ahorra lo que sí.** Título corto, nombre, lugar, país, control de tiempo y
  número de rondas se escriben a mano en LiveChess: no tiene API ni importación
  para eso (la del PGN es solo de la pestaña «Rounds»). Por eso cada torneo de
  la lista trae «Datos para LiveChess», un desplegable con los seis campos, con
  el rótulo que LiveChess muestra y su traducción, y un botón «Copiar» por
  dato (más «Copiar todo»). `PareoDGT.datosLiveChess()` los arma; «Laws of
  chess» y «Starting position» ya vienen bien de fábrica y no se tocan. El
  título corto es el nombre sin tildes ni espacios, el mismo del archivo.
  - **La ficha sale de la página que ya se pide**, sin una tercera: la Edge
    Function lee del art=2 las filas de dos celdas «Lugar», «Federación»,
    «Control de tiempo (Rapid)» y «Número de rondas» (`leerFicha`; comprobado
    el 29/10/2026 con torneos en curso de Costa Rica, Malasia y Vietnam). Cada
    una es opcional: lo que chess-results no dice se avisa («escríbelo a
    mano») y no tiene botón de copiar, nunca se inventa.
  - **«Federación» no siempre es un país.** En un torneo continental
    (tnr1529729, 29/10/2026) dice «Confederation of Chess for Americas ( CCA )»:
    eso no se copia como «Country» (`NO_ES_PAIS`); queda vacío, «escríbelo a
    mano». En ese mismo torneo el lugar («Gimnasio Nacional») sí se lee.
  - **Un torneo que terminó hace más de dos semanas ya no muestra la ficha**
    sin el botón «Mostrar detalles del torneo» (`turdet=YES` no basta, como sí
    basta para la clasificación): la lectura sale vacía. Por eso `unirFicha()`
    conserva lo ya sabido y la ficha se guarda con el torneo en `localStorage`.
    Lo normal, un torneo en curso, la trae completa.
  - **La lista se rehace en cada revisión (cada 30 s)**: `pintarTorneos()`
    recuerda qué desplegables estaban abiertos y a qué botón tenía el foco
    quien copiaba (`data-foco`); sin eso, la tarjeta se cerraba sola en medio
    de pegar los datos.
- **Las jugadas no las sube esta página.** Las sube **Lichess Broadcaster**
  (la aplicación oficial de Lichess para la computadora), que mira la carpeta
  donde LiveChess escribe el PGN de cada ronda: ahí se elige la ronda que creó
  esta página. Los nombres coinciden porque LiveChess los tomó del mismo
  archivo.
- Va en la Política de privacidad: a Lichess se le mandan los nombres,
  títulos, Elo e ID FIDE del pareo, los mismos que ya publica chess-results.

`verificar-pareo-dgt.js` prueba el lector con HTML de la forma real y nombres
inventados (con y sin club, el bye, el «sin emparejar» roto, la lista con
FIDE-ID, la ficha con la forma de la página real, completa, a medias y
ausente), que la función pregunte por la licencia antes de pedir nada y que
la herramienta esté en la vitrina sin `gratis`, el PGN exacto, las mesas
elegidas, qué hacer con cada lectura y, en el navegador con dobles de la
función y de Lichess: el candado sin licencia, el archivo bajado con solo
las mesas elegidas, el orden torneo → ronda → pareo en Lichess, que recargar
no cree nada otra vez, el pareo corregido, cambiar las mesas y el Lichess
caído, y «Datos para LiveChess»: los seis campos, «Copiar» y «Copiar todo» con
el portapapeles de verdad, que una revisión no cierre la tarjeta ni le quite el
foco al botón, y que una lectura sin ficha no borre la anterior. Rompiendo el
filtro de los byes, el de las mesas, la pregunta por la licencia, la lectura de
la ficha, el foco o `unirFicha()`, salta.

### Probar sin tableros físicos

Para ensayar el día del torneo entero —el pareo, LiveChess, la carpeta de
exportación, Lichess Broadcaster y la transmisión— sin un solo tablero
electrónico, «Pareo para DGT» trae tableros DGT **virtuales** (sección 5 de
`pareo-dgt.html`; lo pidió el dueño, «para probar sin tableros físicos»). Es
solo para probar: la sección lo dice. Para transmitir una mesa sin tablero
DGT de verdad, el camino es mandar su PGN a Lichess (la cámara, la partida en
vivo), no hacerla pasar por un tablero electrónico.

- **Cómo se conecta.** LiveChess habla con cada tablero por un puerto COM.
  com0com (gratis, Windows) crea un par de puertos unidos (COM10 ↔ COM11):
  LiveChess abre una punta y la página la otra con **Web Serial** (Chrome o
  Edge en la computadora; sin Web Serial, el botón se apaga y lo dice). La
  `Permissions-Policy` del sitio no apaga `serial`, así que no hizo falta
  tocar `_headers`. Cada tablero virtual lleva su número de serie (90001,
  90002…), que es lo que LiveChess muestra para asignarlo a una mesa.
- **El protocolo** está en `js/pareo/dgt-tablero.js`, comprobado contra el
  código de Picochess (`dgt/util.py` y `dgt/board.py`), que habla con
  tableros DGT reales: cada pedido de LiveChess es un byte (0x40 reset, 0x42
  el tablero entero, 0x43/0x44/0x4b avisar de cada cambio, 0x45 y 0x55 el
  número de serie, 0x47 la marca, 0x4d la versión, 0x46 la dirección de bus);
  el 0x2b (un mensaje para el reloj) trae detrás cuántos bytes siguen, y se
  saltan. Cada respuesta lleva 3 bytes de cabecera: el código con el bit 0x80
  y el largo TOTAL en dos bytes de 7 bits. El tablero entero (0x86) son 64
  bytes de **a8 a h1**, fila por fila; un cambio (0x8e), la casilla en ese
  mismo orden y la pieza (0 vacía, 1–6 blancas P R N B K Q, 7–12 negras). No
  contesta el reloj (0x41), como un tablero sin reloj. **Sin probar todavía
  contra un LiveChess de verdad**: el primer ensayo dice si lo acepta.
- **Cada jugada llega como en un tablero de verdad**: se levanta la pieza
  (la casilla queda vacía) y se apoya en la otra, con 200 ms entre una cosa y
  otra; en una captura se levanta primero la comida, en un enroque también la
  torre, en una captura al paso el peón de al lado, y al coronar se apoya la
  pieza nueva. Si LiveChess todavía no pidió que se le avise (0x43/0x4b), no
  se manda nada, pero el tablero entero (0x42) ya trae la jugada.
- **Ninguna posición se inventa**: las partidas son las partidas modelo de
  maestros de `js/estilo-modelos.js`, ya comprobadas. En esa lista cada
  partida trae su propio `id` (el de la fuente), distinto de su clave en la
  lista: la página elige por la clave (se rompió así la primera vez: el `id`
  pisaba la clave y ninguna partida se encontraba).
- «Empezar»/«Pausar» (`aria-pressed`), «Una jugada», «Volver al principio»
  (manda los cambios para dejar cada pieza en su casilla inicial, como quien
  vuelve a armar el tablero) y «Desconectar». La última jugada se escribe en
  algebraica española.
- **«Lo que llega de LiveChess».** En el primer ensayo de verdad LiveChess
  tenía el puerto marcado y no mostraba el tablero, y no había forma de saber
  por qué: si no mandaba nada, si mandaba otro protocolo (el de bus, 0x81–0x8b
  con dirección y suma de comprobación) o si esperaba las líneas de control.
  Cada tarjeta trae ahora un desplegable con cada byte que llega y cada uno
  que contesta el tablero, en hexadecimal, con la hora (de Costa Rica) y un
  botón «Copiar»; guarda los últimos 200 renglones. Y al abrir el puerto la
  página enciende DTR y RTS, como un tablero de verdad: com0com se las pasa a
  LiveChess como DSR y CTS en la otra punta.

`verificar-pareo-dgt-virtual.js` juega las 64 partidas modelo (4591 jugadas,
con capturas, enroques, al paso y coronación) y arma la posición SOLO con los
mensajes del tablero: después de cada jugada tiene que ser la de chess.js.
Prueba también las respuestas a cada pedido, el mensaje para el reloj que se
salta y, en el navegador con un puerto COM de mentira que hace de LiveChess,
la página entera. Contando las casillas al revés o sin levantar el peón de
la captura al paso, salta.

## La sala de arena entre equipos, aparte de la Academia

Torneos «arena» como los de Lichess —se juega mientras dura, cada quien se
empareja solo con el siguiente que espera, gana puntos con racha— **entre
equipos de estudiantes que salen de las inscripciones a los torneos en línea**
(`inscripcion.html`). Es una sala APARTE de la Academia: `sala.html` (para
quien juega) y `sala-admin.html` (para quien administra o coordina).

**Dónde vive y por qué.** En «Base de Colegios», el proyecto de Supabase donde
ya están las inscripciones, y no en el de la Academia. Sus jugadores no son
cuentas de la Academia: administración les entrega un usuario y una clave, y
con eso solo entran a la sala. Así no se mezclan con las academias (privadas
entre sí) y los datos de los menores no cruzan de proyecto. El cliente de la
sala es `window.sbSala` (`js/sala-cliente.js`) con su propia clave de sesión
(`sb-sala-auth`): con la de siempre, entrar a la sala cerraba la sesión de la
Academia en el mismo navegador. **`sala.html` no carga `js/supabase-client.js`**
(lo comprueba `verificar-sala-base.js`).

**Las cuentas.** El usuario es el que ya generó el formulario de inscripción
(`inscripciones.usuario`, «Oscar_Angulo_C»; si dos coinciden, al segundo se le
agrega un número) y el correo de Auth es ese usuario en minúsculas en
`sala.ajedrez-integral.com`, un dominio **sin MX a propósito**: a esa dirección
nunca se le manda correo. El dominio está escrito en la página y en la Edge
Function, y `verificar-sala-base.js` comprueba que digan lo mismo (si no,
nadie podría entrar y el mensaje sería «usuario o clave incorrectos»). La clave
(8 letras sin las que se confunden: 0/O, 1/l/i) se genera en la Edge Function
**`arena-admin`** y sale UNA vez, en la respuesta que crea la cuenta; en la base
queda solo su hash. La pantalla la muestra con «Bajar en Excel (CSV)» y
«Copiar» y dice que no se vuelve a ver; si se pierde, «Nueva clave».

**Quién administra.** `arena-admin` (`supabase/functions-colegios/arena-admin/`,
`verify_jwt` en false) hace lo mismo que `inscripciones-torneo`: el JWT de quien
llama lo firmó la Academia, así que se lo reenvía y le pregunta a
`soy_coordinador()`. Las tablas `arena_*` **no tienen política de escritura**:
las escribe esa función con la service role y las funciones `arena_*` de la
base. La pantalla no tiene ningún `sb.from(...)`. «Estado» no devuelve cédulas
ni contactos de las inscripciones, solo lo que hace falta para armar equipos.

**Los equipos los arma administración, a mano**, eligiendo inscritos en
`sala-admin.html` (no hay un equipo por colegio automático). Quien ya tiene
cuenta solo cambia de equipo: su clave no se toca. Si el jugador no se puede
crear, la cuenta de Auth que se alcanzó a crear se borra (no queda una clave
suelta).

**La base lleva la partida** (migración `*_sala_arena.sql`):
- **El emparejamiento** (`arena_emparejar`, con un candado por arena) prefiere
  un rival de OTRO equipo y distinto del último; el mismo equipo o una
  revancha solo si quien espera lleva 10 segundos. Los colores se reparten
  para que nadie juegue siempre con uno. Cada pocos segundos el navegador
  llama a `arena_entrar`, que es también el «sigo aquí»: quien cerró la
  pestaña deja de emparejarse a los 12 segundos.
- **Una sola partida activa por color**: índice único parcial, no un `if`.
- **El reloj es de la base** (`reloj_desde` con su hora; el navegador la
  corrige con `RelojServidor`). La bandera la decide la base (`arena_vencer`),
  no el navegador: cualquiera de los dos avisa y, si quedaba tiempo, no pasa
  nada. En las dos primeras jugadas el plazo es de 30 segundos; una partida en
  que nadie llegó a mover se **aborta** (sin resultado, sin puntos).
- **Los puntos**, como en Lichess: victoria 2, tablas 1; con dos victorias
  seguidas la partida siguiente vale el doble (también las tablas); unas tablas
  de menos de 20 jugadas no dan nada. Se guardan en la partida (son el acta: la
  racha de ese momento no se puede reconstruir barato); la clasificación y
  «quién va en racha» se calculan. **Por equipos suman los `mejores` N de cada
  uno** (por omisión 5).
- **Quien juega solo LEE**: RLS de lectura para quien es jugador de la sala
  (`soy_jugador_de_sala()`; un usuario cualquiera de Auth no lo es) y permiso
  por columna: del resto de jugadores solo ve `id`, `nombre`, `equipo_id`. No
  ve el usuario de nadie. Las funciones internas (`arena_cerrar`,
  `arena_emparejar`…) no se pueden ejecutar desde afuera.

**LO QUE LA BASE NO COMPRUEBA** (dicho a propósito, igual que `game_rooms` en
la Academia): si una jugada es legal y si una posición es mate, ahogado o
tablas. Eso lo calcula chess.js en el navegador de quien mueve y viaja con la
jugada (`p_fen`, `p_fin`). La base sí exige que sea su turno, que la posición
tenga la forma de un FEN con el turno cambiado y un solo rey por bando. Quien
quiera trampa desde la consola puede declarar una jugada ilegal o un mate que
no es: no se impide, pero **se encuentra después** (ver «El juego limpio de la
sala de arena»). Validar cada jugada en una Edge Function antes de escribirla
haría esperar al servidor en cada jugada; si alguna vez hay premios de dinero,
ese es el paso siguiente.

**El juego limpio de la sala de arena.** Lo pidió el dueño del sitio:
torneos en línea con control antitrampa.
- **Nada se anula solo.** La revisión junta problemas e indicios y quien
  administra decide en `sala-admin.html` («Revisar partidas» de cada arena).
  La pantalla dice que son indicios, no pruebas, y cada uno va escrito con el
  nombre de quien lo tuvo (no en un color).
- **La revisión con chess.js** (`supabase/functions-colegios/arena-admin/
  revision.ts`, una función pura que corre en la Edge Function con el
  chess.js de npm y en Node con el del sitio, sin dos copias, como
  `partida-fin` en la Academia): repite cada partida terminada y marca la
  jugada que no se puede jugar o que dice salir de otra casilla, la posición
  guardada que no es la que dejan las jugadas, el fin declarado (mate,
  ahogado, material, repetición, cincuenta) que la posición no es y el
  resultado contra el mate del tablero. Se revisa UNA vez: queda guardada en
  `arena_revisiones` y la siguiente vez no se repite.
- **Los indicios**: salir de la pantalla 3 veces o más en una partida (la
  pestaña escondida; lo anota `arena_anotar_salida`, solo al color de quien
  llama y solo en una partida en juego) y tiempos muy parejos (15 jugadas
  propias o más después de las 5 de la apertura, con un promedio de al menos
  3 s y un coeficiente de variación bajo 0,25: un programa tarda siempre
  parecido). El tiempo de cada jugada lo mide la base con su hora (`ms` en
  cada jugada de `arena_mover`). El segundo es un indicio débil y se dice así.
- **Se avisa a quien juega**: la arena dice que salir de la pantalla durante
  una partida queda anotado y que una partida con trampa se anula. Una
  medida que vigila sin avisar no disuade a nadie.
- **Anular no borra** (la partida es el acta): `arena_partidas.anulada`, que
  sí ve quien jugó, la saca de la clasificación y de la racha. El motivo, quién
  y cuándo van en `arena_revisiones`, que ningún jugador lee (RLS sin
  políticas): el motivo de una anulación no se les muestra a los compañeros.
  «Devolver los puntos» la deja contando otra vez; las dos cosas quedan en
  `historial`. Los puntos ya guardados de las partidas siguientes no se
  recalculan: dependían de la racha de ese momento.
- Anular pide motivo (sin él, ni se llama a la función) y una partida que se
  está jugando no se anula.
- Se aplicó el 30/10 (`20261030121444_sala_arena_juego_limpio`, probada antes
  dentro de una transacción que se deshizo) y se desplegó `arena-admin` con
  su `revision.ts`.

**La página.** `sala.html` es una sola página con cuatro pantallas (entrar,
arenas, una arena, una partida) y se lee en voz: el foco va al título de cada
pantalla, cada casilla se lee con su pieza («e4, peón blanco»), la jugada del
rival se anuncia, el resultado se dice, y la jugada se puede **escribir**
(«Cf3», «Cc6», «O-O»; letras en español, y si no entra se prueba tal cual) además
de tocarla. Los colores del tablero son los que cada quien eligió en el sitio.
Las jugadas llegan por Realtime y además se vuelve a leer cada 2,5 segundos;
lo que llega más viejo que lo ya pintado se descarta, y mientras la jugada
propia viaja se ignora lo que llegue igual de viejo (si no, el tablero salta
hacia atrás y vuelve). Es `noindex` y no entra en ninguna lista del sitio.

**Lo que hay que hacer una vez, a mano, en el panel de Supabase de «Base de
Colegios»**: apagar el registro público de usuarios (Authentication → Sign In /
Providers → «Allow new users to sign up»). Aunque esté abierto, un usuario que
no es jugador de la sala no lee nada (las políticas lo piden), pero no tiene
por qué poder crearse cuentas.

Al tocar la sala, correr `node herramientas/verificar-todo.js sala sala-admin
sala-base` (con el sitio en localhost:8777 y playwright):
- `sala-base` (sin navegador) lee la migración (RLS, ninguna política de
  escritura, `search_path`, execute de cada función, permiso por columna), ve
  que el dominio sea el mismo en la página y en la función, y **ejecuta la Edge
  Function** contra una base de mentira: sin sesión 401, con una sesión que la
  Academia no reconoce 403, usuarios y claves, el número al repetido, la cuenta
  que no queda suelta, y que «estado» no traiga cédulas;
- `sala` abre `sala.html` con un cliente de mentira: entrar (clave mala, cuenta
  que no es de la sala), las arenas según su estado, la clasificación con la
  racha dicha también con texto, el tablero desde el color propio, la jugada
  del rival que llega sola, la jugada tocada y la escrita (lo que se MANDA:
  `p_san`, `p_fen`, `p_fin`), una ilegal que no viaja, las tablas, el final con
  los puntos, la bandera que la página avisa y, en el celular, el tablero
  cuadrado sin barra de desplazamiento;
- `sala-admin` abre `sala-admin.html`: quien no administra no llama a la
  función, un nombre con HTML es texto, lo que se manda al agregar, las claves
  en la tabla y en el CSV (con BOM), «Nueva clave», el error de la función
  dicho, y la arena con la hora de Costa Rica (UTC−6);
  y el juego limpio: la revisión pedida para esa arena, solo las partidas con
  algo, cada indicio escrito, anular sin motivo que no llama a la función,
  la anulada con su motivo y «Devolver los puntos».
- `sala-base` revisa además la migración del juego limpio (la tabla que nadie
  lee, la salida que solo suma a su color, el tiempo de cada jugada, lo
  anulado fuera de la clasificación y la racha), la revisión con chess.js y
  los indicios, y la función: revisa una vez, anular pide motivo y deja
  constancia, devolver también, y una partida en juego no se anula. `sala`,
  que la arena avisa del juego limpio y que esconder la pestaña en medio de
  una partida (y solo entonces) llama a `arena_anotar_salida`.
