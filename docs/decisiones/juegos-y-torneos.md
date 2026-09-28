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
