# Accesibilidad

Notas de diseño para Claude, sacadas del CLAUDE.md de la raíz: Modo Adaptado, teclado, lector de pantalla y el cuadro de comandos.
El índice de todos los temas y las reglas que valen para todo el sitio
están en `CLAUDE.md`.

## Los tableros de Entrenamiento se recorren con el teclado

Todos los tableros del sitio se dibujaban como 64 botones sueltos. Eso **no da
ningún error** —se ven perfectos, el ratón funciona igual y el ejercicio se
resuelve— y dejaba dos cosas rotas para quien no usa el ratón:

- **Sesenta y cuatro paradas de tabulador.** Para pasar del tablero al botón de
  «Pista» había que apretar Tab sesenta y cinco veces. Nadie hace eso: se
  abandona la página.
- **El tablero no se podía MIRAR.** Un lector de pantalla lee la casilla que
  tiene el foco, así que la única forma de saber qué había alrededor de la dama
  era recorrer las 64 de una en una y acordarse. Y en la mitad de las páginas ni
  eso: **las casillas eran botones MUDOS** —Mates, Aperturas, el diagnóstico— o
  decían todas lo mismo —Coordenadas, con sus 64 «Casilla»—.

El 4×4 ya lo tenía resuelto —flechas, atajos de una tecla, la posición dictada—
pero escrito DENTRO de su página y atado a su tablero de cuatro por cuatro. Por
eso fue durante meses el único tablero del sitio que se podía recorrer.

**`js/tablero-accesible.js` es eso mismo para cualquier tablero, escrito una
sola vez.** Se monta con una línea sobre un tablero que ya tenga `data-square`
en sus casillas, y da:

- **una sola parada de tabulador** (el patrón de rejilla de ARIA): se entra con
  Tab y dentro se anda con las flechas, Inicio/Fin y Re Pág/Av Pág;
- los **atajos de una tecla** del 4×4, llevados a 8×8: `o` (qué hay acá), `z`
  (la posición entera), `m` (a dónde puede ir esta pieza), `x` / `X` / `alt+x`
  (las casillas de alrededor), `k q r b n p` (saltar a la siguiente pieza de ese
  tipo; con mayúsculas, hacia atrás), `1`-`8` (ir a esa fila), `shift+1`-`8` (ir
  a esa columna), `i` (volver al recuadro);
- **qué dice cada casilla**, con la columna hablada («eva 4», que no se confunde
  con «bella 4» al oírla) y el nombre de la pieza sacados de
  `js/blind-notation.js`, que es donde viven.

**Copiarlo en las diez páginas se habría separado a la primera corrección**, que
es exactamente como el 4×4 quedó siendo el único. Por eso las páginas no
escriben el rótulo de sus casillas: solo declaran el ESTADO en `data-estado`
(«seleccionada», «ya marcada», «de la última jugada») y el módulo lo añade al
final.

- **Se repone solo en cada repintado.** Las páginas vacían el tablero y lo
  vuelven a llenar en cada jugada; sin un observador, el tabindex se pierde
  —vuelven las 64 paradas— y, peor, el foco se va al `<body>`: quien estaba en
  e4 se queda sin saber dónde quedó, justo cuando más falta hace. Mismo patrón
  que `js/coordenadas-tablero.js`, y por la misma razón: acordarse de llamar a
  una función después de cada repintado es acordarse de algo que se olvida.
- **Las flechas se mueven por el DOM, no por el alfabeto.** El tablero se puede
  estar viendo girado —quien juega con negras lo ve al revés— así que «a la
  derecha» es la celda siguiente en el DOM. Con la cuenta hecha sobre las letras,
  las flechas irían al revés para la mitad de los ejercicios y no fallaría nada.
- **En Modo Adaptado el tablero se anuncia como `application`, y no es un
  adorno.** Con el rol de siempre, NVDA y JAWS están en su modo de lectura y se
  quedan ellos con las teclas de una letra —«p» es «párrafo siguiente»—, así que
  los atajos no llegarían nunca: quien los intente oye moverse el lector de
  pantalla y no el tablero. Fuera del modo se deja el rol de grupo, para no
  quitarle la navegación normal a quien no pidió cambiar nada. Y por eso mismo
  **los atajos de una tecla solo valen en Modo Adaptado**: fuera de él, robarle
  la «p» a quien está leyendo la página es peor que no tener el atajo.
- **Cómo se navega va DICHO**, en un párrafo escondido a la vista y enganchado
  con `aria-describedby`: un tablero que se anuncia como aplicación pero no
  explica que se anda con las flechas es un tablero donde quien entra se queda
  quieto.
- **El foco tiene que VERSE.** Quien navega con teclado sin lector de pantalla no
  tiene otra forma de saber dónde está, y los tableros pintan las casillas con su
  propio color de fondo.

### Al tablero ahora se le puede PREGUNTAR

El recuadro de los ejercicios solo aceptaba jugadas, y eso alcanza para
contestar pero no para JUGAR: frente a un tablero, antes de mover, uno mira.
`js/comandos-tablero.js` es lo que contesta esas preguntas, escrito una vez para
las diez páginas: `posición`, `caballos` (o cualquier pieza), `qué hay en e4`,
`jugadas de f3`, `alrededor de e4`, `fila 4`, `columna e`, `ir a e4` (lleva el
foco del teclado a esa casilla), `turno`, `ayuda`.

Lo enchufa `js/cuadro-comandos.js`: si se le pasan `juego` y `tablero`, mira
primero si el texto era una pregunta y solo si no lo era se lo pasa a la página
como jugada. **Al revés —quedarse con todo— una jugada como «Ra1» se leería como
la pregunta por el rey y no se haría nunca.**

- **LA INICIAL SUELTA DE UNA PIEZA NO VALE COMO PREGUNTA, y eso no es un
  olvido.** Las preguntas de opción —el diagnóstico de nivel, Precisión
  posicional, los exámenes— se contestan escribiendo la LETRA de la opción, así
  que con «c» o «d» en la tabla de nombres, contestar «C» a una pregunta de
  cuatro opciones habría devuelto «caballos blancos en b1 y g1» y la respuesta no
  se habría marcado nunca. No daría ningún error: el alumno escribe su letra, oye
  algo sobre unos caballos y no entiende por qué la prueba no avanza. Para
  preguntar por una pieza se escribe su nombre entero. Las iniciales siguen
  valiendo donde no hay nada con qué confundirlas: como atajo de una tecla con el
  tablero enfocado.
- Lo mismo con los comandos: van las palabras enteras y nunca una letra suelta
  («posición», no «t» ni «z»).

### La jugada escrita se busca entre las LEGALES, no se prueba sobre la partida

`ComandosTablero.jugadaEscrita()` la resuelve contra
`moves({verbose:true})`, y eso arregla dos cosas de una:

- **Funciona con cualquier motor.** Desafíos usa el suyo (MiniChess) porque sus
  posiciones no siempre tienen reyes y chess.js los exige. El intérprete de antes
  le pasaba el texto a `game.move("Cf3")`, que MiniChess no entiende —solo recibe
  `{from,to}`—, así que ahí no se podía escribir ninguna jugada y no fallaba
  nada: el recuadro contestaba siempre «no es legal».
- **No toca la partida.** El de antes DEJABA HECHA la jugada al acertar, así que
  quien lo llamaba tenía que acordarse de pasarle una copia; el que se olvidara
  movía la pieza dos veces.

**Ojo con «R» y con «B».** «R» es Rey en español y Rook (torre) en inglés, y «B»
es Bishop en inglés y no es nada en español: son dos jugadas distintas escritas
igual. Se prueban las dos lecturas y gana la que sea legal, empezando por la
inglesa —que es el orden que ya seguía `js/chess-move-parser.js`, porque los SAN
que devuelve chess.js y los que traen los bancos están en inglés y es lo que más
se copia—. Leído en un solo idioma no fallaría nada: movería la pieza que no era,
legalmente, y quien escribió su jugada vería moverse otra cosa.

### El tablero ya no se esconde en Modo Adaptado

Mates, Aprender, Practicar y Desafíos lo hacían desaparecer y dejaban solo el
recuadro. Era el peor de los dos mundos: la única forma de saber qué había era
oír la posición entera de corrido y acordarse de las treinta y dos piezas. **Un
tablero se MIRA** —se va a una casilla, se pregunta qué hay al lado, se busca
dónde está la dama— y eso es justo lo que el tablero escondido no deja hacer.
Ahora se queda, se recorre con las flechas y se le puede preguntar. Quien ve poco
además lo necesita a la vista: es la razón por la que amplía la pantalla.

Con eso, sus cuatro `#blind-panel` se reemplazaron por el mismo
`js/cuadro-comandos.js` del resto: **entendían tres cosas distintas** —«e1 g1» en
unas, «e2e4» en otra— y ninguna entendía «Cf3», que es como se escribe una
jugada. Hoy en todo Entrenamiento se escribe igual.

- **Coordenadas es la excepción, a propósito**: su Modo Adaptado cambia el
  ejercicio entero —en vez de «toca e4» pregunta «¿e4 es blanca o negra?»— así
  que ahí no hay tablero que recorrer. Lo que sí se le arregló es lo de siempre:
  sus 64 casillas decían «Casilla», todas igual.
- **Visualización también**: su tablero se queda quieto en la posición de salida
  porque el ejercicio consiste en NO mirarlo moverse. Ahí las preguntas se
  contestan contra la posición **de salida** —la que el tablero enseña—, nunca
  contra la posición mental: preguntar «dónde están mis caballos» después de tres
  jugadas imaginadas sería hacer trampa, y preguntarlo sobre lo que el tablero
  está enseñando es exactamente lo que hace quien lo mira.

### El interruptor de la página encendía medio modo

Cinco páginas traen su propio «🔊 Adaptado» y guardan en la misma clave que
`js/adaptive-mode.js`, pero cada una llevaba su variable aparte: apretarlo
escribía la preferencia y **NO encendía la clase `adaptive-mode` del `<html>`**,
así que todo lo que cuelga de ella —el recuadro donde se escribe la jugada, los
atajos del tablero, el contraste— se quedaba apagado hasta recargar. No daba
ningún error: el botón se marcaba como activado y la mitad del modo no llegaba.

Ahora las cinco pasan por `AdaptiveMode.set()`, que además **dispara el evento
`adaptivemode:change`**, y las cinco lo escuchan para enterarse cuando el modo se
cambia desde otra pestaña o desde el botón de la cabecera. Al encenderlo, el
recuadro lo dice: lo que lo destapa es el CSS, y un lector de pantalla no percibe
el CSS — sin ese aviso, quien aprieta el interruptor no oye absolutamente nada.

### Estudio: el tablero de una ficha era decoración

Era `aria-hidden`, o sea que para un lector de pantalla no existía, y la posición
contada en palabras vivía plegada AL FINAL, debajo del pie de foto: recorrer una
línea era avanzar, bajar, abrir el desplegable, cerrarlo, subir y avanzar otra
vez. Ahora:

- el tablero se recorre con el mismo teclado que el resto (sus casillas pasaron a
  ser `<button>`: un `<div>` no recibe el foco). No hace nada al pulsarlo —una
  ficha se mira, no se juega— pero enfocarlo es justamente lo que hace falta para
  poder mirarla sin ver;
- **la posición sube pegada a los botones que la cambian** y es región viva, así
  que cada jugada se vuelve a leer sola, junto con cuál fue;
- **la línea se recorre ESCRIBIENDO** («siguiente», «anterior», «inicio»,
  «final», «jugada 5»): los cuatro botones ⏮ ◀ ▶ ⏭ están bien para el ratón, pero
  quien contesta desde el recuadro tendría que salir de él, tabular hasta el
  botón y volver, en cada jugada.

### Al tocar cualquiera de estas piezas

**Correr `node herramientas/verificar-entreno-accesible.js`** (con el sitio en
localhost:8777, playwright y `npm install chess.js@0.10.3`). Abre las ocho
páginas con tablero en un navegador de verdad y mide lo que se rompe callado:

- que el tablero tenga **una sola parada de tabulador** —es un número, así que o
  está bien o no— y que la siga teniendo después de moverse;
- que **ninguna casilla sea muda** y que no digan todas lo mismo (64 casillas
  diciendo «Casilla» es tan inservible como 64 mudas, y se ve igual de bien);
- que **las flechas muevan el foco de verdad**: un `keydown` declarado que no
  mueve nada se ve exactamente igual que un tablero que sí se recorre;
- que los **atajos contesten**, midiendo lo que sale por la región viva —que es
  lo que oye quien usa lector de pantalla— y que en modo normal **se callen**;
- que el recuadro **se vea** (el `display` que calcula el navegador, no la
  clase), conteste «caballos» y nazca con la ayuda plegada;
- que una jugada escrita en español **se juegue de verdad** y que una imposible
  se rechace diciéndolo;
- y que **ninguna letra de la A a la J se lea como una pregunta**.

Está probado que falla de verdad: dejando las 64 casillas en el tabulador saltan
16 comprobaciones, devolviendo las iniciales a la tabla de nombres de pieza salta
1, y volviendo el tablero de Estudio a `aria-hidden`, otra.

**Al sumar una página con tablero**: se carga `js/tablero-accesible.js`, se llama
a `TableroAccesible.montar()` al final de su función de dibujo y se suma a
`CON_TABLERO` en el verificador. Y se le pasan `juego` y `tablero` al
`CuadroComandos.montar()`, que es lo que le da las preguntas gratis.

### Las tres páginas de Juegos, con el mismo teclado

Entrenamiento quedó recorrible y `sesion.html` ya lo estaba, pero las partidas
—que es donde se juega de verdad— seguían con lo de antes. Las tres páginas con
tablero de Juegos (`estandar.html`, `niebla.html` y `tablero.html`, el bot) se
pusieron al día, y lo que tenían roto eran cuatro cosas distintas, las cuatro
calladas:

- **La región viva se contradecía consigo misma.** `#move-input-status` llevaba
  `role="status"` **y** `aria-live="assertive"` encima: el rol ya vale por una
  región viva cortés y "assertive" manda interrumpir, así que los dos juntos
  dicen lo contrario. JAWS corta con eso la frase que venía leyendo y VoiceOver a
  veces directamente no lo lee — o sea que el aviso que confirma tu jugada podía
  no llegar nunca. Queda `role="status"` con `aria-atomic="true"`: acá no hay
  nada urgente que interrumpir, es la respuesta a un Intro que se acaba de
  pulsar.
- **El interruptor de la página encendía medio modo**, el mismo fallo que ya
  tenían las cinco páginas de Entrenamiento con su propio "🔊 Adaptado":
  `js/juegos-blind.js` y `js/tablero-board.js` escribían la preferencia en
  `localStorage` y **no** encendían la clase `adaptive-mode` del `<html>`, así
  que el contraste, el tamaño de letra y todo lo que cuelga de esa clase se
  quedaba apagado hasta recargar. El botón se marcaba como activado, no fallaba
  nada. Ahora las dos pasan por `AdaptiveMode.set()` y **escuchan
  `adaptivemode:change`**, que es la otra mitad: el modo se puede encender desde
  el encabezado, desde otra pestaña o porque se adivinó solo, y sin escuchar el
  aviso la página se quedaba con el recuadro escondido mientras el resto del
  sitio ya estaba en Adaptado.
- **El tablero se anunciaba como grupo, así que los atajos no llegaban.** Es lo
  más caro de los cuatro y afecta sobre todo a `tablero.html`, que es la página
  que más atajos ofrece (o, c, l, m, i, k q r b n p, 1-8, x): con el rol de
  siempre, NVDA y JAWS están en su modo de lectura y **se quedan ellos con todas
  las teclas de una letra** —"p" es "párrafo siguiente"—, así que ni uno solo
  llegaba nunca al tablero. Quien los intentaba oía moverse el lector de pantalla
  por la página y no tenía forma de saber por qué. En Modo Adaptado el tablero
  pasa a `application`, como ya hacía `js/tablero-accesible.js` en Entreno; fuera
  del modo se queda en grupo, para no quitarle la navegación normal a quien no
  pidió cambiar nada. Y el texto de `aria-describedby` cambia con el modo: fuera
  de él prometer esos atajos sería mandar a alguien a apretar teclas que no hacen
  nada.
- **Las 64 casillas de `estandar.html` y `niebla.html` eran 64 paradas de
  tabulador**, y el rótulo decía "Casilla e4", deletreado. Ahora montan el mismo
  `js/tablero-accesible.js` de Entrenamiento —una sola parada, flechas, atajos,
  "eva 4"— y el mismo `js/comandos-tablero.js`, así que al tablero de una partida
  se le puede preguntar con las palabras de todo el sitio.

**`tablero.html` conserva su propio teclado y sus comandos cortos**, a propósito:
es el más viejo y el más rico (última captura, última jugada, repasar jugadas
con shift+a / shift+d), y quien ya los usa no tiene por qué reaprenderlos. Lo que
se le sumó es el vocabulario del resto del sitio —"posición", "caballos", "qué
hay en e4"— como respaldo de los suyos: que en Entrenamiento se escriba
"caballos" y acá haya que adivinar "p n" es justo el lío de tres vocabularios que
`js/comandos-tablero.js` vino a terminar. Va **antes de los cortes por turno**:
preguntar es solo lectura y tiene que funcionar también mientras el bot piensa o
con la partida terminada, que es cuando más se mira el tablero.

#### La posición entera dejó de dictarse en cada jugada

`#position-readout` era región viva en las dos páginas de partida, así que cada
jugada —la propia **y la del rival**— volvía a dictar las treinta y dos piezas:
para enterarse de que el rival jugó Cf3 había que oírse el tablero completo, en
cada jugada de una partida entera. No daba ningún error y es exactamente la misma
falla que ya se había corregido en las fichas de Estudio.

Ahora lo que se anuncia es **la jugada**, que es lo que cambió, y la posición se
queda escrita ahí para leerla cuando se quiera, se pide con "posición" en el
recuadro o con la tecla `z` sobre el tablero. **En `tablero.html` ese bloque sí
sigue siendo región viva, y está bien**: ahí solo se rellena cuando se pide con
el comando "T", nunca solo.

#### La niebla no se puede escapar por el modo adaptado

Es lo que hacía falta mirar con más cuidado, porque una fuga acá no se ve: la
pantalla queda impecable y quien la tiene delante gana la partida con información
que no le tocaba. El tablero visual de Niebla de Guerra tapa con 🌫️ lo que la
posición no deja ver, y `getVisibleGame()` ya devolvía una partida recortada —
pero con `get()` solamente, y eso alcanzaba mientras nadie preguntara nada.

- **`oculta(casilla)` separa "ahí no hay nada" de "no sabes qué hay ahí".** Sin
  ella, preguntar por una casilla tapada contestaba **"vacía"**: falso (puede
  haber una pieza rival) y, peor, distinto de lo que el tablero enseña. Va en la
  **partida visible** y no como una opción de los módulos, porque es ahí donde
  vive ese conocimiento — quien arma el tablero sabe qué esconde. Una partida que
  no la traiga se comporta como siempre, y la variante que mañana esconda algo
  (la mano de Ajedrez de Cartas) lo hereda sin tocar nada.
- **`moves()` solo contesta en tu turno.** Las jugadas de una pieza del rival
  pasan por casillas que no ves, así que listarlas es la fuga entera de la
  variante. Las propias no revelan nada que el tablero no enseñe ya: toda casilla
  a la que puede ir una pieza tuya es una casilla que esa pieza **ve** —el rayo
  de visibilidad llega hasta la primera ocupada— y el tablero visual le pinta
  encima su punto de destino.
- **Pero una lista vacía no se puede anunciar como "no tiene jugadas"**, que es
  lo que salía con el guardia puesto y nadie explicándolo: es rotundamente falso
  y se oye como información buena. Por eso la partida visible lleva también
  **`miColor`**, y sobre una pieza del rival se dice lo que pasa de verdad — que
  es del rival y que la niebla no deja saberlo.
- **Todo recuento es un recuento de lo VISIBLE, y se dice.** "Es solo lo que ves:
  la niebla tapa el resto" va detrás de la posición y de "¿dónde están mis
  torres?": sin esa coletilla se oye como el inventario de la partida cuando es
  el de lo que se alcanza a ver, y deducir lo que falta es justamente el juego.
- **El rayo de "alrededor" se corta en la niebla**, no la atraviesa: siguiendo de
  largo anunciaría como "la primera pieza en esa dirección" una que está detrás
  de lo que no se ve, y con eso se juega dando por libre un camino tapado.
- Y la vista se **guarda por FEN**: desde que el tablero se recorre con el
  teclado, sus 64 casillas se vuelven a rotular en cada repintado y cada rótulo
  pide la partida visible — sin eso, un repintado recalculaba la visibilidad 64
  veces. No daría ningún error, solo un tablero que responde tarde, que en una
  partida con reloj es lo que no se puede permitir.

**`.cc-ayuda-det` se mudó a `css/styles.css`.** Ese bloque de ayuda lo pintan
ahora DOS módulos —`js/cuadro-comandos.js` en Entrenamiento y
`js/juegos-blind.js` en Juegos— y el estilo vivía dentro del primero: el de
Juegos salía sin formato, con los encabezados del tamaño del texto y pegados unos
a otros, sin que fallara nada.

**Al tocar `js/juegos-blind.js`, `js/tablero-board.js` o cualquiera de las tres
páginas, correr `node herramientas/verificar-juegos-accesible.js`** (con el sitio
en localhost:8777, playwright y `npm install chess.js@0.10.3`). Existe porque
`estandar.html` y `niebla.html` están detrás del login **y** de una sala, así que
`verificar-css.js` no las abre nunca. Comprueba que el aviso vaya con `role` y
**sin `aria-live` encima**, que el interruptor de la página encienda la clase del
`<html>` y que encenderlo desde fuera la destape igual, que el tablero cambie de
rol con el modo, que quede **una sola parada de tabulador** y ninguna casilla
muda, que las flechas muevan el foco **de verdad** —un `keydown` declarado que no
mueve nada se ve igual que un tablero que sí se recorre—, que "caballos" conteste
y que una jugada escrita se **juegue** en vez de leerse como pregunta, que la
ayuda nazca plegada, que la posición **no** sea región viva en las dos de partida
y sí lo siga siendo en el bot, y que los comandos cortos de `tablero.html` sigan
funcionando. De la niebla comprueba las cinco puertas por las que se escapa.

Y comprueba las dos formas de jugar que este cambio podía romper sin avisar:
**una jugada entera hecha con el teclado** (llegar a la pieza con las flechas,
elegirla con Intro, soltarla en su destino) y **dos clics con el ratón** — montar
un teclado encima del tablero no puede costarle la partida a quien juega con el
ratón, y eso tampoco daría ningún error: las casillas se pintarían igual y no
pasaría nada al tocarlas.

Está probado que falla de verdad: devolviendo el `aria-live="assertive"` saltan
4 comprobaciones, el interruptor de antes 5, el rol de grupo 7, sin el teclado
compartido 10, sin `oculta()` 6, y sin el guardia de `moves()` saltan 2 — con el
verificador escribiendo en pantalla la fuga entera: «peón negro en david 5 puede
ir a david 4 y eva 4 capturando».

## Accesibilidad

Buena parte del sitio tiene "modo adaptado" (`js/adaptive-mode.js`) para alumnos
con discapacidad visual: al tocar textos, encabezados o contraste, mantener el
alto contraste y los encabezados que permiten saltar directo al contenido.

- **El foco con teclado tiene que verse.** `focus:outline-none` a secas deja a
  quien navega con teclado sin saber dónde está: si se quita el contorno, se
  pone un anillo en su lugar (`focus-visible:ring-2 focus-visible:ring-accent-400`).
- **Un botón que abre algo tiene que decir si está abierto**: `aria-expanded`,
  `aria-controls` apuntando a lo que abre, y el nombre accesible cambiando con
  el estado. El menú móvil además cierra con Escape y devuelve el foco al botón
  —si no, el foco se queda dentro de algo que ya no está en pantalla—.

### El cuadro de comandos: todo ejercicio se puede contestar escribiendo

**Un ejercicio que solo se puede contestar tocando el tablero no se puede
contestar con lector de pantalla, y eso no da ningún error**: la página carga,
el ejercicio se pinta, y quien no puede verlo simplemente no avanza. Pasaba en
el diagnóstico (los ítems de jugada y de casilla), en Ejercicios por tema, en
Racha táctica y en ¡Te reto! — estas dos últimas ni siquiera cargaban
`js/adaptive-mode.js`, o sea que no tenían Modo Adaptado en absoluto.

`js/cuadro-comandos.js` es el recuadro donde se escribe la respuesta —una
jugada, una casilla, la letra de una opción o "no lo sé"— y la página la recibe
igual que si se hubiera hecho clic. Ya estaba escrito tres veces (el
`#blind-panel` de Mates, Aprender, Desafíos y Practicar; el `#cmd-form` de 4×4;
la `.f100-cmd` de los visores de los cursos); este archivo es para las páginas
que no lo tenían y para que la siguiente no lo escriba por cuarta vez.

- **No reemplaza al tablero, se suma.** En Mates y sus hermanas el Modo Adaptado
  esconde el tablero y deja solo el recuadro; acá conviven. Quien ve poco usa las
  dos cosas —mira el tablero ampliado y escribe la jugada, porque arrastrar una
  pieza de 40 px con lupa es un suplicio— y quien acompaña a un alumno necesita
  ver qué está contestando.
- **Lo que decide si se ve es el CSS** (`html.adaptive-mode`), no el JavaScript:
  así encender y apagar el modo surte efecto al instante, sin repintar el
  ejercicio. El recuadro se monta SIEMPRE y el modo solo lo destapa. Fuera del
  modo va con `display: none` y **no** con `sr-only`: un campo de texto invisible
  pero enfocable es una parada de tabulador fantasma para quien ve la página.
- **La posición va contada en palabras JUSTO ENCIMA del cuadro**, no al final del
  ejercicio: leerla y contestarla son el mismo gesto (la misma decisión que en
  `js/curso-adaptado.js`). Es región viva, así que cada jugada se vuelve a leer.
- **El texto de la posición sale de `BlindNotation.positionSentence()`**, hermana
  de `groupedReadoutHTML()` y con el mismo agrupado por dentro. La diferencia es
  que no lleva encabezados: `groupedReadoutHTML()` mete un `<h2>` "Piezas" y un
  `<h3>` por color, que sirven donde la lectura es lo único que hay en esa zona
  (Mates, Aprender, Desafíos, Practicar) pero rompen el árbol de encabezados de
  una página que ya tiene el suyo. El cuadro **no tiene su propia tabla de
  nombres de pieza**: sería la cuarta copia de los plurales escritos, y se irían
  separando.
- **La jugada escrita la interpreta `js/chess-move-parser.js`**, que ya usaban
  los visores de los cursos y las páginas de Juegos: entiende español, inglés y
  los descuidos de tipeo de siempre. Ojo — ese intérprete HACE la jugada sobre la
  partida que se le pasa, así que se le pasa siempre una copia y la jugada
  entra por la misma puerta que el clic (`playMove`, `attemptMove`), que es la
  que corrige contra la solución.
- **La casilla también se escribe como se dice**: "eva 4" llega a e4, porque así
  es como el sitio lee las columnas en voz alta. Escribir lo que uno acaba de oír
  tiene que funcionar.

#### En los ejercicios de opción, cada opción dice su letra

"Opción A. …", "Opción B. …", y se contesta escribiendo la letra. Vale en el
diagnóstico de nivel y en los dos exámenes de arbitraje (el docente y el
público).

- **La letra va ESCRITA dentro del botón**, no puesta con CSS (un `::before`, un
  contador de lista). Con CSS se vería igual en pantalla y el lector de pantalla
  no la diría: quien contesta por el cuadro no sabría qué letra escribir. Por eso
  está siempre, también fuera del Modo Adaptado — es texto del botón, no del modo.
- **Lo que se guarda es cuál opción del ítem es, no su posición.** Las opciones se
  barajan en cada intento; guardar la posición ataría la respuesta al barajado.
- **Lo que no se entiende se dice, no se marca cualquier cosa.** "La de arriba"
  responde "no entendí", no la primera.
- **"No lo sé" y "dejar en blanco" también se escriben**: son respuestas de
  verdad —valen cero como fallar pero se guardan aparte—, no un botón de saltar.

#### Contestar por el cuadro PASA SOLA a la siguiente

El Enter que contesta es el mismo que avanza: quien contesta escribiendo no
tiene por qué ir a buscar el botón "Siguiente", que es justamente lo que este
cuadro viene a evitar. Vale en el diagnóstico y en los dos exámenes de
arbitraje.

- **Los botones de opción NO avanzan.** Ahí se ve la pantalla, y poder cambiar
  de idea antes de seguir es lo normal; además en los exámenes de arbitraje se
  puede volver atrás con "Anterior". Solo avanza el cuadro.
- **Lo que no se entiende no avanza**, y lo dice: una jugada ilegal, una casilla
  que no existe o un "la de arriba" dejan todo como estaba.
- **El aviso lleva el enunciado de la pregunta nueva.** Al no pasar por el
  botón ya no hay nada que anuncie el cambio, y quien escucha se quedaría
  contestando a ciegas una pregunta que nunca oyó. El aviso es región viva, así
  que se lee solo, y el foco se queda en el cuadro para contestar la siguiente
  sin moverse.
- **En la última, ese Enter TERMINA la prueba**, y la ayuda lo dice antes de que
  lo aprieten ("Es la última: al responder se termina…"). Es el mismo acto que
  el botón de "Terminar y ver el resultado", pero conviene saberlo de antemano.

#### En los 4×4, el orden es lo que hace usable el ejercicio

`entreno/4x4.html` tiene su propio recuadro de comandos, más viejo que
`js/cuadro-comandos.js`, y su propio interruptor de modo. Lo que se arregló ahí no
fue el recuadro sino **el orden en que se ofrecen las cosas**, que ahora es el orden
en que hacen falta:

    Piezas → qué hay en el tablero → el tablero → dónde se contesta → los botones
    → la ayuda, PLEGADA

- **La lectura de la posición subió a la primera línea**, justo debajo del
  encabezado "Piezas" donde cae el foco al entrar. Vivía dentro del panel de
  comandos, o sea DESPUÉS del tablero, del recuadro y de toda la ayuda: había que
  recorrer medio ejercicio para enterarse de qué había que resolver. La región se
  llama con ese mismo encabezado (`aria-labelledby`) y no con un nombre propio:
  "Piezas" y "Posición actual" se oyen como dos cosas distintas.
- **El tablero ya no recita el manual en cada foco.** Su `aria-describedby`
  apuntaba a un párrafo de diez líneas con las reglas enteras, que se leía cada vez
  que el foco entraba ahí — el mismo defecto que esta página ya había arreglado
  para el recuadro de comandos. Ahora apunta a UNA línea que señala dónde está la
  ayuda, en vez de recitarla.
- **La ayuda vive en un `<details>` plegado**, con el encabezado dentro del
  `<summary>` (el HTML lo permite): se anuncia como encabezado para saltar y como
  botón para abrir. El cuerpo lo escribe `renderHelpReadout()` desde
  `HELP_SECTIONS`, **que es la única fuente**: lo mismo estaba escrito tres veces
  —el párrafo del `aria-describedby`, el de atajos y `HELP_SECTIONS`— y tres copias
  del mismo texto se van separando a la primera corrección. Se escribe al cargar
  aunque esté plegada, o abrirla a mano mostraría una caja vacía; el comando
  "ayuda" la abre y la vuelve a leer.
  - Cuidado con dónde se llama `renderHelpReadout()`: `HELP_SECTIONS` es un
    `const` declarado 600 líneas más abajo, así que llamarla junto a
    `applyBlindModeUI()` tiraba la página entera con "Cannot access before
    initialization" — y la página se quedaba en "Comprobando tu sesión…".
- **La primera vez ya no se lee el manual entero.** Se decía una sola vez por
  navegador, pero eran cuatro secciones justo cuando lo que se quiere es empezar.
  Ahora es una línea: dónde se contesta y que "ayuda" abre el resto.
- **La posición se dice UNA vez.** El anuncio del ejercicio y el de cada captura
  llevaban la posición completa, y la lectura de arriba también: son dos regiones
  vivas, así que se oía dos veces seguidas. Ahora el anuncio se queda con el
  ejercicio o con la captura, y la posición la lleva la lectura.
- **Pero la VOZ no se reparte igual que las regiones**, y eso es lo que tiene
  trampa: `BlindNotation.speak()` **cancela lo anterior** al empezar lo siguiente,
  así que dos llamadas seguidas se comen la primera. Por eso `announce(texto,
  hablado)` lleva dos versiones — las regiones se reparten el texto y la voz lo
  recibe todo junto en una sola frase. Lo mismo obligó a que `loadPuzzleAt()` acepte
  un `prefijo`: al reiniciar se decía "Ejercicio reiniciado." DESPUÉS de cargar, y
  eso cancelaba la posición entera — se oía el aviso y nunca qué había quedado en el
  tablero, que es justo lo que hace falta para volver a empezar. `verificar-cuadro-
  comandos.js` lo comprueba enganchándose a `BlindNotation.speak()`, que es la única
  forma: la voz no deja rastro en el DOM.
- Fuera del Modo Adaptado no se ve nada de esto: quien ve el tablero ya tiene la
  posición delante. Va con `hidden` y **no** con `sr-only`, porque el `<details>`
  recibe el foco del teclado y una parada de tabulador invisible es peor que no
  tener el bloque.

`verificar-cuadro-comandos.js` comprueba el orden con
`compareDocumentPosition` —no con el CSS—, que la lectura diga cuántas piezas hay y
dónde está cada una, que la ayuda arranque plegada **también la primera vez**, que
el comando "ayuda" la abra, y que escribir una captura la haga y la lectura lo
refleje. Para "no se ve" usa `checkVisibility()` y no el rectángulo: un `<details>`
cerrado esconde su contenido con `content-visibility`, y ahí
`getBoundingClientRect()` sigue devolviendo el alto de antes — daría verde sobre una
ayuda desplegada.

`concentracion.html` e `ilumina-tablero.html` **no llevan cuadro**, y no es un
olvido: ahí la tarea ES mirar (recordar dónde estaban las piezas, encontrar la
casilla iluminada). Un recuadro para escribir no las haría accesibles, solo
daría la impresión de que lo son.

**Al tocar cualquiera de estas piezas, correr `node
herramientas/verificar-cuadro-comandos.js`** (con el sitio en localhost:8777,
playwright y `npm install chess.js@0.10.3`). Contesta de verdad, escribiendo, en
las siete páginas, y **todo lo que mira sale de la pantalla** —qué dice el botón,
qué dice la etiqueta del cuadro, qué piezas hay dibujadas en el tablero—, nunca
de una variable interna: una prueba que espiara las variables daría verde sobre
una página que no se puede contestar. Comprueba además que el cuadro **se vea de
verdad** (se mide el `display` que calcula el navegador, no la clase) y que fuera
del modo no esté. Las preguntas que se contestan con una casilla son 2 de las 301
del banco, así que esa prueba **siembra el estado guardado** con esos dos ítems en
vez de confiar en el sorteo: dejarlo al azar es dejar ese camino sin probar. Con
el mismo truco se salta a la última pregunta para comprobar que ese Enter
termina la prueba de verdad —quedarse trabado ahí dejaría a quien contesta
escribiendo sin forma de llegar al resultado—.

Que la respuesta quedó ANOTADA y no solo que la pantalla pasó de pregunta se
comprueba con el estado que la propia página guarda en `localStorage` para poder
retomar la prueba, y en los exámenes de arbitraje volviendo atrás con "Anterior"
y mirando qué opción quedó marcada. Dos cosas que hacen falta para que no sea
frágil: **el contexto va sin service worker** (`serviceWorkers: "block"`) —al
recargar es él quien sirve los archivos, y lo que pide no pasa por las rutas del
contexto, así que volvía el `js/supabase-client.js` de verdad y la página moría;
es la misma piedra que ya documentó `verificar-reportes.js`— y las páginas
contrarreloj se miran **por la posición del tablero y no por el renglón de
resultado**, que al acertar lo borra el ejercicio siguiente a los 350 ms.
