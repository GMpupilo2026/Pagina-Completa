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

Cómo se pinta una pieza, cómo se cuenta una jugada y cómo se recorre escribiendo
viven en `js/visor-linea.js`, que es también el tablero de recorrer líneas de la
preparación de rivales (ver «Ver las líneas en un tablero: etapa 3»):
`js/ficha-render.js` los toma de ahí, y Estudio carga ese archivo antes.

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

## «Activar voz» en todo el sitio

Quien ve poco muchas veces **no usa lector de pantalla**: agranda la letra y se
acerca a la pantalla. Todo lo que el sitio avisa ya se escribía en regiones
vivas para el lector, pero sin lector nadie lo decía: el rival movía, llegaba
«Partida asignada», se guardaba un cambio, y no se enteraba. Solo las páginas
con su propio «Activar voz» (Mates, Aprender, las partidas de Juegos, Sonar…)
hablaban.

Ahora el encabezado de **todas** las páginas trae un 🔇 junto al del Modo
Adaptado. Lo pone `js/adaptive-mode.js` (que ya está en todas las páginas con el
encabezado), que después de pintar pide `js/voz-pagina.js`, y este pide
`js/blind-notation.js` si la página no lo tenía. Una página nueva lo tiene sin
hacer nada.

- **Se lee lo que ya se anuncia, no una lista propia.** Un MutationObserver
  escucha las regiones vivas (`aria-live`, `role="status"`/`"alert"`), también
  las que llegan enteras (el aviso de «Partida asignada» se agrega al `<body>`
  con `role="alert"`: la región no es el padre, es lo que llegó). Un aviso
  nuevo que se escriba en una región viva, como debe, se oye sin tocar nada. Por
  eso lo que no era región viva no se oye: el «¡Partida creada!» de
  `juegos.html` tampoco lo oía el lector, y ahora es `role="status"`.
- **Solo lo que esa persona tiene a la vista**: una región escondida no habla,
  como no la leería un lector. La excepción es el aviso del recuadro de comandos
  (`.cc-msg`), que se juzga por dónde está montado (ver la clase en vivo).
- **Lo que llega junto se dice en fila**: `BlindNotation.speak(texto, { encolar:
  true })` no corta la frase anterior. Con más de tres en fila se corta todo y
  se dice lo último; lo `assertive` corta. En modo encolar, la misma frase dicha
  hace menos de 2 s no se repite (el recuadro de comandos dice su respuesta Y la
  escribe en una región viva).
- **No habla de más:** el mismo texto en la misma región no se repite (un cartel
  repintado con cada eco de Realtime) salvo que antes haya quedado vacía o
  escondida, y las `sr-only` se dicen siempre (existen solo para anunciar); una
  región que cambia solo en los números (una cuenta atrás) se dice como mucho
  cada 10 s; lo que ya estaba al cargar no se dice: se espera a que `#app` se
  vea, y lo que aparece en el primer segundo y medio cuenta como página.
- **También dice las jugadas del tablero**, de cualquier tablero: la jugada
  propia hecha con clics, la del rival en Juegos, la respuesta del rival en los
  ejercicios. No se le pidió a cada tablero que avise: cada casilla ya dice en su
  `aria-label` qué hay en ella (es lo que lee el lector al recorrerla), y
  `js/voz-pagina.js` compara esa foto antes y después de un cambio: «Caballo
  blanco de gustav 1 a felix 3», «…, captura peón negro», «Enroque de las
  blancas», «…, corona dama», «… al paso». Un tablero nuevo que etiquete sus
  casillas, como debe, habla solo.
  - **Lo que el tablero oculta tampoco se dice**, porque su casilla tampoco lo
    cuenta (las piezas ocultas de la clase, «oculta» en las variantes). Pasar de
    todas las piezas a ninguna, o volver a mostrarlas, no es una jugada.
  - **Si un aviso ya dijo la jugada, el tablero se calla**: «Se jugó…»,
    «Jugaste…», «El motor jugó…». Sin eso la jugada del profe se oía dos veces.
    Ojo con la regla: en JavaScript la «ó» no cuenta como letra para `\b`, así
    que `/jugó\b/` no calza nunca; va con `(?![a-záéíóúñ])`.
  - **Las miniaturas no hablan** (menos de 180 px de ancho): en el panel del
    profe hay una por alumno y se oirían todas a la vez.
  - **Cada casilla tiene que decir qué hay**, con la columna hablada y
    «vacía» cuando lo está: «e4» a secas se deletrea, y una casilla vacía que
    no lo dice queda como «no se sabe» y la jugada no se puede armar. Los
    tableros de ejercicios y del examen lo reciben de `js/tablero-accesible.js`
    al montarse (el examen carga ahora `js/blind-notation.js` para decir «eva
    4» y no «e4»); Visualización y los diagramas de los artículos
    (`js/article-example-board.js`, que hasta ahora eran mudos fuera del Modo
    Adaptado) escriben el suyo. Un tablero nuevo va por `TableroAccesible` o
    escribe lo mismo.
- **La posición entera, a pedido: el ♙ del encabezado.** Con la voz encendida
  y un tablero a la vista aparece, junto al 🗣️, un ♙ («Decir la posición del
  tablero») que dice la del tablero más grande que se ve, agrupada como en el
  resto del sitio: «Blancas: rey en eva 1; torres en anna 1 y hector 1…
  Negras: …». Fuera del Modo Adaptado no había forma de pedirla: el recuadro
  donde se escribe «posición» y la tecla z del tablero son del Modo Adaptado.
  - Se arma con lo que dice cada casilla, igual que las jugadas: lo que el
    tablero oculta no se cuenta («Hay casillas que no se ven», «Las piezas
    están ocultas»). El turno no se dice: las casillas no lo saben.
  - Va en el encabezado y no fijo sobre la página: fijo abajo, en el celular
    tapaba casillas del tablero. Es «♙» y no «♟️»: el emoji sale negro sobre
    el azul del encabezado y no se ve; el otro se dibuja como letra, en blanco.
  - La respuesta del recuadro de comandos (`.cc-msg`, donde contesta
    «posición») ya no se corta a los 400 caracteres: dejaba a las negras sin
    decir. Y `igualA` va con el texto entero, que es lo que el recuadro ya dijo;
    recortado no coincidía y se oía dos veces.
- **La jugada escrita en un aviso se dice en palabras.** Los ejercicios avisan
  «Dxf7+ es legal, pero…», y la voz del navegador lo deletreaba. `jugadasEnPalabras()` lo dice como el resto del sitio: «dama
  captura felix 7 jaque», «eva 4», «enroque corto». Solo con las letras en
  español (R D T A C): la R en inglés es torre y en español es rey, y el sitio
  muestra la notación en español. Como el texto cambia, `speak()` recibe también
  el escrito (`igualA`) para no repetir lo que el recuadro de comandos ya dijo.
  El examen (`js/tablero-pregunta.js`) y el diagnóstico escriben la pista en
  palabras («Elegiste eva 4.», «Jugaste enroque corto.»), también para el
  lector: el diagnóstico escribía «Jugaste Nf3», en notación inglesa, que ni
  la voz ni una persona que no la conoce entiende.
- **No sale donde ya hay un botón de voz** (`#speech-toggle-btn`, `#btn-voz`):
  esas páginas dicen cada jugada a su manera, y dos botones para lo mismo es uno
  de más. La preferencia es la misma (`oscarSpeechMode_v1`) en todos lados.
- **La tecla Control, sola, calla la voz**, como en NVDA y JAWS: quien ya usó
  un lector de pantalla la prueba primero, y quien ve poco necesita cortar una
  frase larga (la posición entera, un aviso que no le interesa) sin buscar el
  botón. Solo corta lo que se está diciendo y lo que esperaba en fila: la voz
  sigue encendida para el próximo aviso. Lo hace `js/blind-notation.js`, que
  está en toda página que habla, así que vale también para las que tienen su
  propio botón de voz. No frena la tecla: Ctrl + C y los demás atajos siguen
  igual. Con la voz encendida, el `title` del botón lo dice.
- El nombre accesible dice para quién es («solo si no usas lector de
  pantalla»: con lector, esta voz habla encima de la suya), con `aria-pressed`
  para el estado. Se ve solo el ícono, como sus vecinos del encabezado, y cabe
  a 360 px.

**Al tocar `js/voz-pagina.js`, `js/adaptive-mode.js` o `speak`/`setupSpeechToggle`
de `js/blind-notation.js`, correr `node herramientas/verificar-todo.js voz-pagina
clase-voz`.** `verificar-voz-pagina.js` comprueba que el botón esté en la raíz y
en subcarpetas (la ruta de `js/` sale de dónde se cargó `adaptive-mode.js`), que
no esté donde hay voz propia, que el encabezado no se salga en el celular, y qué
dice y qué no (apagada, un aviso nuevo, el cartel repetido, la caja nueva, el
panel escondido, la cuenta atrás, lo que estaba al cargar), y las jugadas de un
tablero de prueba (la jugada, la captura, el enroque, la coronación, la
miniatura, las piezas ocultas, el aviso que ya la dijo), la jugada escrita en
un aviso dicha en palabras, y que Temas, Visualización y el diagrama de un
artículo digan qué hay en cada casilla (en Temas, además, que la jugada del
alumno se oiga sin deletrear notación), y el ♙: que aparezca con la voz y un
tablero, que diga la posición del tablero principal agrupada y sin lo oculto,
que a 360 px no saque nada de ancho y que la respuesta del recuadro no se corte, y que la tecla Control calle la voz (y otra tecla no). El examen lo mira
`verificar-examenes.js`: sus casillas y su pista en palabras. Está probado que falla
de verdad: sin mirar el botón propio, sin mirar lo que llega entero, sin la
regla de los números y con el tablero callado salta cada uno.


## La visión de la persona la marca administración

Hasta acá todo dependía de que la persona **encontrara el botón**: el 🦯 del
Modo Adaptado y el 🔇 de la voz, dos íconos de 36 px en el encabezado. La
detección automática (el primer Tab, el contraste alto, la pregunta en el
celular) acierta muchas veces, pero no siempre, y cuando falla no da ningún
error: el alumno que no ve entra, oye un panel de cuarenta tarjetas, abre
Crazyhouse y se encuentra con un tablero que no puede usar. Quien sí sabe cómo
ve cada alumno es la Academia, así que ahora **lo marca administración** y la
plataforma se acomoda sola en todas las páginas de esa persona.

- **Dónde se marca:** `admin.html` → Cuentas, columna «Visión»: «Ve bien»,
  «Baja visión: voz encendida» o «Ciega: todo adaptado». Lo guarda
  `marcar_vision(persona, vision)` (solo `soy_admin()`, vuelve a leer la fila).
- **Va en una tabla aparte, `public.vision_personas`, y no en `profiles`**: es
  un dato de salud (sensible, artículo 9 de la Ley 8968), y `profiles` la leen
  compañeros, colegas y rankings. La RLS deja leerla solo a la persona, a
  administración y a sus profesores (`interno.alumnos_de()`); no tiene política
  de escritura. Lleva el trigger de la bitácora (`VIGILADAS` de
  `verificar-auditoria.js`): queda quién la marcó y cuándo. `privacidad.html`
  ya decía que es un dato sensible; ahora dice también quién lo anota y quién
  lo ve.
- **Cómo llega a cada página:** `js/adaptive-mode.js` (que está en todas las
  páginas con encabezado) carga `js/vision-cuenta.js`, que le pregunta a la
  base por la cuenta con sesión y guarda la respuesta en el aparato
  (`ai_vision_v1`). En el `<head>`, `adaptive-mode.js` ya pone la clase
  `modo-ciego` con lo guardado, para no pintar primero el panel de siempre y
  cambiarlo un instante después. **Manda la base**: si la marca se quitó, la
  clase se va aunque el aparato dijera «ciego».
- **Baja visión → la voz.** Se enciende «Activar voz» (la misma preferencia
  `oscarSpeechMode_v1` de todo el sitio): con el botón de la página si ya está,
  para que diga «Voz activada», o dejando la preferencia escrita. No se
  enciende el Modo Adaptado: quien ve poco sí ve el tablero y lo usa con el
  ratón; lo que le faltaba era enterarse de los avisos.
- **Ciega → todo adaptado.** Se enciende el Modo Adaptado y la clase
  `modo-ciego`, que trae tres cosas:
  1. **Su panel es OTRO** (`PANEL_ADAPTADO` en `js/clases.js`), como el de
     quien supervisa: no se le recorta el de siempre —esconder tarjetas una por
     una deja la mitad a la vista—. Son las mismas tarjetas de `TILE_GROUPS`,
     buscadas por destino (el mantenimiento y los textos valen igual), más las
     de los juegos hechos para jugar sin ver (Sonar, Batalla naval) y la guía de
     `ciegos.html`. Solo lo que se usa con lector de pantalla: tableros que se
     recorren con el teclado, con su cuadro de comandos y la posición dicha. Las
     cuatro fichas de Estudio por categoría van en una sola tarjeta: son cuatro
     paradas más para llegar a lo mismo. Mirando «Ver como» a una alumna ciega
     se ve su panel adaptado (se pregunta por ella, no por quien mira).
  2. **Lo que no está adaptado no se ofrece.** `NO_ADAPTADAS` en
     `js/vision-cuenta.js` es la lista: las modalidades de Juegos que no son
     Estándar ni Niebla (Crazyhouse, Duelo, Cartas, Cuatro jugadores, las
     variantes y el bot de modalidades), Confites, Ilumina el tablero,
     Concentración y las salas de transmisión. Todo enlace a una de ellas se
     esconde, también los que la página pinta después (un MutationObserver); y
     si igual se llega (un marcador, el historial), la página lo dice arriba,
     con el foco en el aviso, y ofrece volver al panel. El contenido se queda
     debajo, escondido, por si alguien la acompaña. **Una página que se adapte
     sale de esa lista** y entra en su grupo de `PANEL_ADAPTADO`.
  3. **Accesos rápidos.** Al principio de cada página, justo después de
     «Saltar al contenido» (por donde empieza quien la recorre con el lector),
     un `<nav aria-label="Accesos rápidos">`: Tu panel, Clase en vivo, Tareas,
     Entrenar (`clases.html#entrenar`) y la lista de atajos. Los atajos son
     **Alt + Mayúscula + una letra** —P panel, V clase, T tareas, E entrenar,
     M contenido, B tablero, C recuadro de comandos, H oír los atajos—, que no
     chocan con los del lector (NVDA y JAWS usan Insert) ni con las letras
     sueltas del tablero. Se lee `e.code` y no `e.key`: con Alt + Mayúscula, en
     Mac `e.key` trae otro símbolo. En `sesion.html` y `examen.html` los atajos
     solo mueven el foco, nunca cambian de página: salir de la clase cierra la
     asistencia y salir del examen lo congela (la misma excepción que
     `js/atajo-buscar.js`).
- **La voz se enciende UNA vez por marca** (`ai_vision_aplicada_v1`): si
  después la persona la apaga, se respeta. **El Modo Adaptado, en cambio, es
  fijo con la cuenta ciega**: sin él los tableros no traen su recuadro de
  comandos, y quien no ve no tiene cómo notar que se apagó (se apagaba con el
  🦯 del encabezado o con el «🔊 Adaptado» de una página, sin querer).
  `AdaptiveMode.set(false)` no apaga con `modo-ciego` puesto: dice «Tu cuenta
  tiene el modo adaptado fijo» y dispara `adaptivemode:change` con `activo:
  true`, que devuelve cada interruptor propio a «activado». En el `<head>`,
  con la marca guardada, la preferencia se escribe ANTES de que corran los
  scripts de la página, que la leen al cargar. La clase y el modo los quita
  solo administración.
- **Más atajos para orientarse** (también Alt + Mayúscula): **D** dice dónde
  estás —el título de la página sin sus emojis, el camino de las migas, sus
  secciones y si hay tablero—, **S** salta al título de la siguiente sección
  y **A** vuelve a la página anterior (salvo en la clase y el examen). C busca
  TODOS los recuadros del sitio (el común y los propios de Tablero, Juegos,
  Sonar, 4×4, Visualización, Tipos y los cursos), primero el de un diálogo
  abierto. La nota del panel adaptado va en su propio párrafo
  (`#panel-adaptado-nota`): el subtítulo lo reescribe después la racha del día.
- **Competir** a quien no ve le ofrece retar solo en Estándar y Niebla (las que
  se juegan escribiendo); un reto que le llega en otra modalidad no trae
  «Aceptar»: dice que no está adaptada. Los retos que llegan están en una
  región viva y cada «Retar» dice a quién.

**Al tocar `js/vision-cuenta.js`, el panel adaptado o la columna de admin,
correr `node herramientas/verificar-todo.js vision-cuenta panel admin`.**
`verificar-vision-cuenta.js` usa el doble de `verificar-panel.js` (lo exporta)
y mide la alumna ciega (las clases del `<html>`, los grupos del panel, que
ninguna tarjeta lleve a `NO_ADAPTADAS`, los accesos rápidos a la vista y en su
lugar, los atajos por la región viva y el foco, un enlace no adaptado que llega
tarde), la base mandando sobre lo guardado, la baja visión (la voz encendida
una vez, y respetada si la apaga), Juegos, una página no adaptada y el selector
de admin. Está probado que falla de verdad: sin montar el modo en las páginas y
sin el panel adaptado saltan 9 comprobaciones.

## Todos los tableros, sin verlos

Con las cuentas ciegas marcadas se revisó UNO por UNO cada tablero al que
llega un alumno desde su panel adaptado: cómo se entera de la posición, cómo
contesta sin ratón y si puede preguntarle al tablero. Lo que faltaba, y cómo
quedó:

- **Examen** (`examen.html`): era el peor. No tenía recuadro, la posición no
  estaba escrita en ninguna parte y la jugada se marcaba casilla por casilla.
  Ahora todo se contesta en el recuadro común: la letra de la opción, la
  casilla («eva 4» o «e4»), la jugada («Cf3», «enroque corto») y
  **«responder»** para entregarla; «repetir» vuelve a decir la pregunta. La
  pregunta nueva se dice sola con sus opciones. `TableroPregunta.escribir()`
  resuelve lo escrito con la misma puerta que el clic. Las opciones llevan
  `aria-pressed`, y en la línea de apertura se dice lo que jugó el rival.
  - **El tablero bloqueado ya no es `disabled`** (examen y diagnóstico): un
    botón deshabilitado no recibe el foco, y el tablero de una pregunta de
    opción —justo el que hay que mirar— no se podía recorrer. Va con
    `aria-disabled`.
  - **En Modo Adaptado el `blur` de la ventana no cuenta como salida.** El
    lector abre sus propias ventanas (la lista de encabezados de NVDA, el
    rotor, un menú de JAWS) y cada una le quita el foco a la página: a la
    tercera se le congelaba el examen a quien no ve. Cambiar de pestaña o de
    aplicación sigue contando (`visibilitychange`).
- **`TableroAccesible.montar()` sobre un tablero ya montado pone la
  configuración nueva encima** (`__tableroAccesibleCfg`). Devolvía el api con
  la del primer montaje, y en el examen, desde la segunda pregunta, **las
  casillas decían lo que había en la pregunta anterior** —sin ningún error y
  con el tablero viéndose bien—. `verificar-examenes.js` lo mira en la
  tercera pregunta (cesar 4 vacía en la segunda, con un alfil en la tercera).
- **Tipos de entrenamiento**: en Modo Adaptado el recuadro está SIEMPRE, también
  en los que se contestan con botones (Detective, Descarte, Balanza,
  Intercambios…), para preguntar por la posición; la posición escrita debajo
  del tablero sigue a la partida (antes contaba la del principio en los que se
  juegan); con las piezas tapadas las casillas dicen «oculta» y no «vacía»; la
  apertura sin tablero no regala la posición; Fotografía y el Barrido de nivel
  4 tienen el triple de tiempo, como Elige a tiempo.
- **Memoria**: recuadro de preguntas (mientras se mira, sobre la posición;
  mientras se reconstruye, sobre lo colocado), y «ya la tengo» se escribe.
- **Visualización**: `tablero-accesible.js` se cargaba y nunca se montaba; ahora
  se recorre y contesta sobre la posición que enseña. La respuesta del rival
  se dice en palabras (la bitácora ya no es región viva: se reescribía entera
  y en notación inglesa).
- **Precisión posicional**: el tablero estaba en un `aria-hidden` (no existía
  para el lector); ahora se recorre, y elegir una opción devuelve el foco a esa
  opción en vez de perderlo.
- **Diagnóstico**: una pregunta sin tablero contestaba «caballos» con el
  tablero de la ANTERIOR; «Anotado» dice la jugada en palabras.
- **Coordenadas**: en Modo Adaptado, el triple de tiempo por ronda y por
  casilla.
- **Preguntas nuevas del recuadro** (`js/comandos-tablero.js`, valen en todo el
  sitio): «qué ataca e4», «quién ataca e4», «quién defiende e4», «última
  jugada» e «historial». Se calculan con la geometría de cada pieza sobre
  `get()` y no con las jugadas legales: una pieza clavada igual defiende, y a
  una pieza propia no se la "captura". Con niebla, «última jugada» e
  «historial» no se contestan ahí (la jugada del rival no se ve). Las mira
  `verificar-preguntas-tablero.js`, sin navegador.

- **Elegir una pieza con Intro sacaba el foco del tablero** en casi todos los
  ejercicios (Mates, Practicar, Desafíos, Temas, Aperturas…): la página repinta
  el tablero entero, y el observador de `js/tablero-accesible.js` preguntaba si
  el foco seguía adentro DESPUÉS del repintado, cuando la casilla ya había
  salido de la página y el foco había caído al `<body>`. Quien jugaba con el
  teclado quedaba fuera del tablero a mitad de la jugada, sin ningún error. Ahora
  se anota al entrar (`focusin`) y se borra solo al irse a otra cosa (Tab con
  `relatedTarget`, o un clic fuera). `verificar-entreno-accesible.js` elige una
  pieza con Intro en cada tablero y mira dónde quedó el foco (sin el arreglo
  saltan cuatro de nueve).
- **¡Te reto! y Racha táctica**: sus 64 casillas eran 64 paradas de Tab
  rotuladas en inglés («Casilla e4: Blanco n») y el recuadro no contestaba
  preguntas. Ahora van con `TableroAccesible` y el recuadro con `juego` y
  `tablero`; `#result-text` es región viva; en Modo Adaptado hay 60 s por
  ejercicio (no 10: oír la posición y escribir no cabe en 10) y la respuesta
  correcta se dice en palabras.
- **Estándar y Niebla** (`js/juegos-blind.js`): fuera de turno dice «No es tu
  turno» (decía «Jugada no válida»); «reloj» o «tiempo» dicen lo que le queda a
  cada uno en palabras, y a tu reloj se le avisa a los 30 y a los 10 s; cada
  reloj dice de quién es; «última jugada» (en Niebla, la del rival no mientras
  dura la partida); la coronación usa el diálogo común (`js/coronacion.js`),
  con el foco adentro y de vuelta al tablero.
- **Repasar mis clases**: el visor de la partida era un `role="img"` con
  casillas mudas y sin recuadro. Ahora se recorre como Estudio: `TableroAccesible`,
  el recuadro sobre la posición que se ve, y la línea se recorre escribiendo
  (`VisorLinea.pasoPedido`: siguiente, anterior, inicio, final, jugada N,
  girar); cada paso dice la jugada contada, el comentario del profe y si hay
  pregunta. Las flechas globales del visor no roban las teclas con el foco en
  un tablero, un recuadro o un `[role=application]`.
- **Los diagramas de los artículos**: el contenedor era `role="img"`, y los
  hijos de una imagen no llegan al lector: las 64 casillas rotuladas no se oían.
  Sin ese rol, con `TableroAccesible` para mirar, y el Modo Adaptado leído de la
  clase del `<html>` (no de localStorage) sin esconder el tablero.
- **Cursos**: ver «Los cursos, recorridos con lector de pantalla» en
  `cursos-y-material.md` (el recuadro común con preguntas y la jugada del motor
  dicha).
- **La clase en vivo**: ver «Todo lo que lanza el profe, contestado sin ver» en
  `clase-en-vivo.md`.

**Al tocar un tablero, correr** `node herramientas/verificar-todo.js
entreno-accesible examenes cuadro-comandos preguntas-tablero vision-cuenta`.
`verificar-entreno-accesible.js` suma Precisión posicional, Visualización y
Memoria a `CON_TABLERO`; Visualización salta la prueba del recuadro común
porque contesta en el suyo (`sinRecuadroComun`).

## Quien no ve hace todo desde el recuadro

Lo pidió la Academia después de ver a sus alumnos ciegos usarlo: **casi no
usan el tablero**. Se guían por la posición y las jugadas escritas y quieren
hacer todo en el recuadro de comandos, sin salir de él hasta cambiar de
ejercicio o de sección. Recorrer el tablero, ir a buscar el botón de «Pista»
con Tab y volver, era lo que más les costaba. Con la cuenta marcada como ciega
(`modo-ciego`):

- **El tablero es para quien acompaña.** Se queda a la vista (el profe que
  ayuda, alguien al lado), pero `js/tablero-accesible.js` le pone `aria-hidden`
  y ninguna casilla queda en el tabulador: sesenta y cuatro paradas de más
  entre el enunciado y el recuadro. «ir a e4» contesta qué hay ahí en vez de
  mover el foco, y Alt + Mayúscula + B **dice la posición** (ya no lleva al
  tablero). Sin la marca, el tablero sigue como siempre.
- **El foco empieza en el recuadro** y vuelve a él cuando se queda sin lugar
  (la página repintó lo que lo tenía y cayó al `<body>`). No se lo quita a nada
  que la persona haya elegido.
- **Lo escrito en CUALQUIER recuadro pasa primero por `js/vision-cuenta.js`**
  (en fase de captura del `submit`, o del Enter si el recuadro no va en un
  formulario), antes que la página:
  - «acciones»: los botones y las casillas para marcar que hay, sin los
    interruptores del modo;
  - el **nombre de un botón** lo aprieta («pista», «reiniciar»), y también
    lo que hace, se llame como se llame en cada página: «siguiente» aprieta
    «Saltar →», «Otra posición» o «Siguiente ejercicio»; igual «otra vez»,
    «solución», «comprobar»; el texto de una casilla la marca;
  - «leer» lee el ejercicio (títulos, párrafos y avisos de su sección, sin el
    recuadro ni el tablero); «dónde estoy», «atajos», «panel».
  Si no es nada de eso sigue a la página, como siempre (una jugada, o su
  propio comando). Los botones se buscan en la MISMA sección que el recuadro
  (o en el diálogo abierto), así que una página con dos recuadros no aprieta
  el botón del otro; las letras sueltas y lo de menos de tres letras nunca
  pasan por acá (son las opciones y los atajos de cada página). Después de
  apretar, el foco vuelve al recuadro.
- **«mis jugadas»** (`js/comandos-tablero.js`, en todo el sitio): todas las
  jugadas que se pueden hacer ahora, por pieza y con capturas y jaques. Sin
  mirar el tablero, es la forma de elegir entre lo que hay.
- La ayuda del recuadro trae primero «Todo desde el recuadro» en modo ciego, y
  `ciegos.html` lo explica.

`verificar-vision-cuenta.js` lo mide en Mates con la cuenta ciega: el foco al
empezar, el tablero visible pero fuera del lector y del Tab, «acciones»,
«siguiente» apretando «Saltar →» con el foco quedándose en el recuadro, «mis
jugadas», «leer», «ir a e4», que una jugada siga llegando a la página y Alt +
Mayúscula + B. Sin la capa de acciones saltan dos comprobaciones; sin el
`aria-hidden`, otras dos.

### La recorrida como alumna ciega, y lo que se arregló

Se recorrió la plataforma entera como una alumna ciega (cuenta «ciego»,
todo por teclado y escribiendo en el recuadro), con un arnés de Playwright
que escucha las regiones vivas y mide dónde queda el foco. Casi todos los
ejercicios se podían resolver escribiendo; lo que fallaba era lo de alrededor.
Lo principal:

- **La capa del recuadro apretaba botones que no eran.** «posición» apretaba
  ⏮ («Posición inicial») y devolvía el visor al principio, porque se buscaban
  botones por el principio del nombre; y en un curso, «solución» en la
  pregunta 2.03 abría la de la 2.01, porque la zona era la `<section>` de la
  lección entera. Ahora: (1) lo que el recuadro entiende como pregunta al
  tablero NUNCA aprieta un botón (se pregunta a `ComandosTablero` con una
  partida vacía); (2) la zona es el contenedor más grande que tiene el recuadro
  y ningún otro; (3) se aprieta un botón por su nombre exacto o por lo que
  hace (sinónimos buscados como palabras dentro del nombre: «Ver solución»,
  «Otra pista», «Enséñame la jugada»), y una casilla para marcar también por
  el final de su texto; (4) lo corto («e1», «4») solo si nombra exactamente
  una opción. «acciones» ofrece solo los «siguiente/otra vez/solución» que de
  verdad existen en la página.
- **Lo que no se entendía se quedaba en el recuadro** y lo siguiente se pegaba
  detrás («e4e5», «tiempob», «O-Oúltima jugada»): desde ahí nada funcionaba.
  Ahora queda SELECCIONADO (`js/vision-cuenta.js` en Modo Adaptado, y cada
  página en sus propios errores): escribir de nuevo lo reemplaza.
- **Los finales se anuncian y el foco no cae al `<body>`**: el resultado del
  examen, de Precisión posicional, de Desafíos, de Practicar y de Finales; el
  título al elegir categoría en Aprender o volver a la lista en Aperturas y
  Estudio; el recuadro al abrir una clase en Repasar y al llegar una pregunta
  en la clase en vivo.
- **Todo escribiendo, sin salir**: Coordenadas sin `maxlength` («blanca»,
  «repetir», «tiempo»); Memoria («blancas: Rg1, Pe4», «comprobar» toma lo
  escrito); Aprender acepta «Rf1» y «enroque corto»; Habilidades acepta la
  balanza con el número, las piezas de la Fotografía, la jugada sola en
  Descarte y «+1» en Intercambios; «opciones» y «repetir» en Precisión y el
  diagnóstico; «tiempo» y «pregunta» en la clase; «siguiente» en el Sonar;
  «historial» en Estándar (la partida visible conserva su historia) y en
  Niebla (solo las tuyas); «mis jugadas» fuera de turno lo dice.
- **Nada que se salte solo**: en Modo Adaptado, Visualización y Desafíos no
  pasan solos al siguiente; esperan «siguiente» (antes «siguiente» se saltaba
  uno que ni se había oído).
- **En palabras, no en notación inglesa**: las pistas de Visualización, los
  aciertos de Desafíos, las opciones del diagnóstico, la coronación y el
  enroque contra Oscar.
- **Menos ruido**: ¡Te reto! y Racha táctica no releen la posición entera
  después de cada jugada; el examen no relee la posición al contestar; la
  franja de la clase no se reescribe si no cambió.
- **Acceso más rápido**: enlaces con nombre en tareas y exámenes («Ir: … (tarea
  «X»)»), títulos como encabezados, lecciones bloqueadas fuera del Tab en los
  cursos, `#entrenar` lleva el foco a su grupo, Competir anuncia el reto y deja
  el foco en el botón, TV en vivo y los logros de juegos no adaptados no se
  ofrecen.


### La segunda recorrida: el reloj, el enroque dicho y lo que se dice al fallar

Una segunda vuelta con la cuenta «ciego» dejó lo que faltaba alrededor de los
ejercicios:

- **Tres mensajes distintos cuando no se juega** (`ComandosTablero.noSePudoJugar`
  y `ComandosTablero.incorrecta`, en `js/comandos-tablero.js`): «no es una
  jugada legal» SOLO si lo escrito es una jugada que no se puede hacer; «No
  entendí «hola»» si no es una jugada; y si se pudo jugar pero no era la
  buscada, el mensaje EMPIEZA por «Respuesta incorrecta: …» (¡Te reto!, Racha
  táctica, adivinar en los cursos, el calentamiento y el repaso de la clase,
  lo que califica el profe). Antes las tres cosas se decían «Jugada no válida»
  o «No es esa», y quien no ve revisaba una jugada que no había escrito.
- **El reloj dicho** (`js/reloj-hablado.js`): en ¡Te reto! y Racha táctica
  «tiempo», «reloj», «cuánto tiempo» y «segundos» dicen lo que queda, y en
  Modo Adaptado se avisa solo a la mitad y a los 10 segundos. En el examen,
  «tiempo» dice lo que le queda al examen.
- **La Racha táctica para las cuentas «ciego»** (lo pidió ese grupo): al
  llegar cada ejercicio, las piezas se dicen **una por una** en su propia
  región viva (`#pieza-dicha`), con **1 segundo de pausa** entre una y otra, y
  el reloj **no corre** mientras tanto: los **30 segundos** empiezan cuando
  termina la lectura (antes eran 60 contando la lectura entera de corrido, que
  se comía casi todo). Con «Activar voz» la pausa se cuenta desde que la voz
  avisa que terminó; con un lector de pantalla no hay forma de saberlo y se
  calcula por el largo de la frase (`LECTURA.msPorLetra`). Contestar antes
  vale y corta la lectura; «tiempo» dice que el reloj todavía no empezó. El
  resto del Modo Adaptado sigue con 60 segundos. En el recuadro, la posición
  va bajo un encabezado «Piezas» (h2) y partida en dos listas, cada una con
  el suyo: «Blancas» y «Negras» (h3), para llegar con la tecla H
  (`encabezadoPosicion` de `CuadroComandos.montar`; también en ¡Te reto!,
  que comparte `js/racha-tablero.js`).
- **La Racha dice qué jugó el rival.** Cada ejercicio de Lichess empieza con
  una jugada del rival, pero el banco guardaba solo la posición de después:
  quien no ve el tablero no sabía qué acababa de pasar. Ahora el banco trae un
  quinto campo con esa jugada (SAN) y al llegar el ejercicio se dice «Las negras
  jugaron caballo captura eva 6» (en Modo Adaptado y en la cuenta «ciego», antes
  de las piezas; fuera del modo se escribe en algebraica española, «Cxe6»).
  «última jugada» en el recuadro la repite: `ComandosTablero` lee
  `juego.jugadaPrevia` cuando la partida no trae historia. Las jugadas salen de
  la tabla «Ejercicios Lichess» cruzando huellas de la posición
  (`herramientas/racha-jugada-rival.js`, que rearma la posición de antes y la
  comprueba con chess.js: 4446 de 4446), y `verificar-racha-rival.js` revisa
  que cada una cuadre con su posición.
- **«enroque corto» / «enroque largo»** en Estándar, Niebla, contra Oscar, a
  ciegas contra el bot y en las variantes: antes solo se entendía «O-O».
- **«siguiente»** en Batalla naval, como en el Sonar.
- **La pregunta de opciones de la clase**: las opciones van en una lista, así
  que «leer» las dice con su letra; «opciones» y «repetir» las repiten, y el
  texto de una opción la elige si nombra una sola. Al llegar la pregunta se
  vacía lo que había a medias en el recuadro de la clase.
- **El foco no cae al `<body>`**: al marcar «Ya lo hice» en Tareas (vuelve a
  la misma casilla, que ahora dice de qué punto es, y se anuncia), al enviar
  la encuesta al profesor (va al mensaje de guardado) y al cambiar a
  `#entrenar` con el panel ya abierto (`hashchange`).
- **Nombres y adornos**: el selector de la foto de perfil se llama «Elegir la
  foto de perfil» (no «Choose File»), el «(cambiar)» de ¡Te reto! dice qué
  cambia, los emojis de las cifras de Informes van con `aria-hidden`, el
  nivel del motor en los cursos no se lee pegado («Nivel 15001800Máximo»:
  «leer» lee los `<label>` y el select iba adentro), y los diagramas de los
  artículos cargan `comandos-tablero.js` para que Alt + Mayúscula + B diga su
  posición.

Lo miden `verificar-juegos-accesible.js` (reloj, enroque, los tres mensajes),
`verificar-batalla-naval.js`, `verificar-clase-adaptada.js`,
`verificar-examenes.js`, `verificar-panel.js`, `verificar-tareas.js`,
`verificar-encuesta-profesor.js`, `verificar-informes.js`,
`verificar-foto-perfil.js` y `verificar-curso-adaptado.js`.

En Entrenamiento, la misma vuelta:

- **Los tres mensajes en todos los ejercicios** (Mates, Temas, Practicar,
  Desafíos, Visualización, Finales, Aprender, Aperturas, Habilidades,
  Coordenadas, Memoria, Tus propios errores y el diagnóstico). En Habilidades
  todo aviso que empezaba con «✗» dice «Respuesta incorrecta: …», en un solo
  lugar (`estado()` de `entreno-tipos.js`), y Descarte distingue «no está
  entre las candidatas» de «no es legal».
- **La solución se dice**: la etapa «solución» de las pistas
  (`ejercicio-tablero.js`) dice «La solución era: …» en palabras; antes
  pintaba la jugada y no decía nada.
- **El foco no salta a «Siguiente»** al terminar un ejercicio con la cuenta
  ciega: se queda en el recuadro y el aviso dice «Escribe «siguiente»». Al
  pasar de ejercicio se anuncia el enunciado nuevo (Habilidades) y en las
  listas el foco va al título al llegar y al «volver».
- **Las opciones se contestan escribiendo** (Detective, Rey y peón, ¿Qué
  apertura es?, Intercambios, Aprender): la letra, el número o una palabra
  que distinga la opción; si la palabra sirve para dos, se pregunta cuál. En
  Detective también la jugada sola («Dd5»).
- **Lo que se decía en inglés o de más**: Temas dice la jugada del rival y la
  posición una sola vez (`posicionViva: false`); Desafíos pasa a palabras la
  notación inglesa de sus explicaciones; Mates cambia de categoría escribiendo
  («mate en 2»); Aprender entiende «rey f1», «e7 e8 dama» y «enroque».
- **«cómo está la posición»** (y «describe la posición») se entienden igual
  que «posición» en todos los recuadros.

Lo miden `verificar-entreno-escribiendo.js` (nuevo), `verificar-tipos-pagina.js`,
`verificar-cuadro-comandos.js`, `verificar-entreno-accesible.js`,
`verificar-entreno-arreglos.js` y `verificar-preguntas-tablero.js`.

### La tercera recorrida: «R» es rey, las palabras no aprietan respuestas y todo se destraba

Lo que dejó la tercera vuelta con la cuenta «ciego»:

- **«R» es SIEMPRE el rey y la torre es T.** Todo el sitio escribe y lee en
  algebraica española (R rey, D dama, T torre, A alfil, C caballo). Leída en
  inglés, «Rf1» movía la TORRE cuando el rey y una torre llegaban a f1 (en el
  examen, la pregunta perdida sin haberse equivocado). Ahora R es el rey en
  `LETRA_AMBIGUA` de `comandos-tablero.js` y en `chess-move-parser.js`,
  `tablero-board.js` y `lector-planilla.js`, aunque solo la torre pueda ir:
  «Rh4» con la torre en h1 es «no es una jugada legal… R es el rey; la torre
  se escribe con T». Las otras iniciales inglesas (N, Q, K) no chocan con nada
  y se siguen entendiendo. No se corona a rey: «=R» no es nada, «=T» es torre.
  Lo que el sitio escribe de una jugada sale en español
  (`ComandosTablero.sanEspanol`: «Nf3» → «Cf3»); los bancos siguen guardando
  el SAN inglés que necesita chess.js y se convierte al mostrar.
- **Una palabra suelta no aprieta una respuesta.** En el diagnóstico,
  «volver» marcó la opción D, «Una jugada ilegal que hay que volver atrás».
  Los sinónimos de `vision-cuenta.js` («siguiente», «volver», «otra vez»…)
  solo aprietan ACCIONES: nunca un botón con `role=radio`/`option`,
  `aria-pressed`, dentro de un `role=group` con título, que empiece por
  «Opción», ni uno cuyo nombre pase de cinco palabras (`esRespuesta`). Por su
  nombre exacto se sigue pudiendo.
- **Las páginas sin ejercicio también se manejan escribiendo**: en los
  accesos rápidos va el recuadro «Ir a…» (`#vc-ir`) cuando la página no tiene
  recuadro de comandos (panel, Tareas, Informes, Logros). Entiende lo mismo
  que los demás y, además, parte de un nombre: «entrenar» lleva el foco a esa
  sección, «tareas» abre ese enlace. Alt + Mayúscula + C lleva a él. Y al
  cargar, sin recuadro, el foco va al título y no se queda en el `<body>`.
- **Los atajos de salida** solo se bloquean en la clase y el examen mientras
  hay algo en marcha (un recuadro para contestar): con «Todavía no hay clase»
  o el examen entregado, Alt + Mayúscula + P lleva al panel.
- **Nada se tranca sin salida**: Practicar y Desafíos tienen «solución» y
  «saltar» (no cuentan como resueltos; lo saltado va a «Repasar fallados»);
  Visualización y Habilidades tienen «solución»; ¡Te reto! y Racha táctica
  empiezan otra vez con «otra vez» o «siguiente» y lo dicen al terminar; el
  calentamiento de la clase acepta otra jugada después de fallar; Finales 100
  se contesta escribiendo (la jugada o «sí», «tablas», «ganan blancas»).
  Para que la página conteste «siguiente» o «solución» antes que la capa,
  `EjercicioTablero.palabrasPrimero(campo, fn)`; «volver» dice adónde va
  (`EntrenoProgress.volver`).
- **Ningún verbo de mirar** en lo que se oye («Pulsa Reiniciar», «Toca
  «Intentarlo otra vez»», «usa el botón»): se dice qué escribir.
- **Lo que se lee de más**: los emojis de Logros, Informes y la clase van con
  `aria-hidden`; las cifras de Informes son una lista («Precisión: 78 %»);
  Configuración oculta con la cuenta ciega las diez tarjetas de apariencia y
  pone la voz arriba, con los grupos de opciones como `radiogroup` (una parada
  de Tab, flechas para elegir); las lecciones bloqueadas de Aprender llevan
  `aria-disabled` y se alcanzan con Tab (dicen qué hay que terminar antes).
- **El curso de Fundamentos** enseña la notación española (R, D, T, A, C;
  Cf3), como el resto del sitio. Queda pendiente regenerar su PDF, su
  presentación y sus ejercicios, que siguen en inglés.

Lo miden `verificar-preguntas-tablero.js` («R» y la coronación),
`verificar-vision-cuenta.js` (las opciones y el recuadro «Ir a»),
`verificar-entreno-escribiendo.js`, `verificar-juegos-accesible.js`,
`verificar-sonar.js`, `verificar-batalla-naval.js`,
`verificar-clase-adaptada.js`, `verificar-examenes.js`,
`verificar-curso-adaptado.js`, `verificar-temas-plataforma.js`,
`verificar-informes.js`, `verificar-logros.js` y `verificar-panel.js`.

## Las piezas, siempre bajo su encabezado

Lo pidió la Academia para **todas las cuentas ciegas y todos los ejercicios**:
que en cada uno esté el encabezado «Piezas» y, justo debajo, las piezas de la
posición. Antes eso solo lo tenían la Racha táctica y ¡Te reto!
(`encabezadoPosicion`); en el resto la posición salía en una frase corrida, iba
dentro de un `<details>` plegado (Estudio, los visores de los cursos) o no
estaba escrita en ninguna parte y había que pedirla con «posición» (Practicar,
Finales, Aperturas, los cursos…). Con la H del lector se llega directo a
«Piezas», y desde ahí a «Blancas» y «Negras».

- **Una sola forma de escribirla:** `BlindNotation.pintarPiezas()`
  (`js/blind-notation.js`): `<h2>Piezas</h2>`, `<h3>Blancas</h3>` con su lista,
  `<h3>Negras</h3>` con la suya y al final quién juega. De ahí salen
  `groupedReadoutHTML()` (Mates, Juegos, Repasar, los artículos), el recuadro
  de comandos y `BlindNotation.escribirPosicion()`, que usan las lecturas
  propias de Habilidades, Memoria, Visualización, Estudio y los visores. Esas
  lecturas tienen que ser un `<div>`: un `<h2>` no puede ir dentro de un `<p>`.
- **El recuadro de comandos** (`js/cuadro-comandos.js`), con la cuenta ciega,
  escribe la posición con encabezado aunque la página no lo pida. Si la página
  no llama nunca a `posicion()`, la toma de `juego` cada 400 ms y la reescribe
  cuando cambia, **muda** (cada jugada ya se dice sola: dictar las treinta y
  dos piezas después de cada una tapaba el «¡Correcto!»). Si la página ya tiene
  su propia lectura con «Piezas» a la vista, la del recuadro se calla: dos
  encabezados iguales seguidos son una parada de más. Memoria pasa una partida
  de mentira (sin `fen`) con lo colocado y no entra: lo colocado no es «la
  posición».
- **Dos posiciones, dos nombres:** en Siete diferencias son «Piezas de la
  posición A» y «Piezas de la posición B».
- **Lo que no lleva piezas no se ofrece** (ver la sección siguiente).
- Sin la marca de cuenta ciega no cambia nada: en Modo Adaptado la posición
  sigue en un renglón donde iba en un renglón.

Lo mide `verificar-piezas-ciego.js`, entrando como alumna ciega a quince
ejercicios. Probado que falla: sin la lectura sola del recuadro saltan tres, y
sin `escribirPosicion()` con encabezado, cinco.

## Lo que no se puede hacer sin ver, no se ofrece

Después de poner «Piezas» en todos los ejercicios quedaron algunos donde no
hay piezas que escribir ahí, y la Academia pidió **esconderlos** a las cuentas
ciegas en vez de dejarlos a medias:

- **Memoria**, la **Fotografía** de Habilidades y la apertura **sin tablero**
  (nivel 3 de «¿Qué apertura es?»): la posición es justamente la respuesta.
- **Coordenadas**: no hay piezas.
- **El Sonar** y **la Batalla naval**: lo escondido es el juego. Estaban hechos
  para jugar sin ver, pero igual se esconden: lo pidió la Academia.
- **El curso de Fundamentos**, que sigue en notación inglesa (ya estaba
  escondido a alumnos y profesores por `js/cursos-ocultos.js`).

Las páginas van en `NO_ADAPTADAS` de `js/vision-cuenta.js` (sus enlaces no se
ven y, si se llega igual, la página lo dice y ofrece volver al panel), y salen
de `PANEL_ADAPTADO` de `js/clases.js`. La Fotografía y el nivel 3 de aperturas
son parte de una página que sí está adaptada, así que los esconde
`escondido()` de `js/entreno-tipos.js`: no salen en la lista ni en el repaso,
y un enlace guardado a ellos lleva a la lista. En `ciegos.html` sus secciones
llevan `data-oculto-ciego`. Para devolver una, se saca de esas listas.

**La posición ya no se oye dos veces.** ¡Te reto! (y la Racha táctica en Modo
Adaptado sin la cuenta ciega) agregaba al aviso de cada ejercicio una frase
oculta con la posición entera; con la lista «Piezas» en el recuadro, quien
recorría la página la oía dos veces. Con la cuenta ciega esa frase ahora solo
dice dónde está la lista.

Lo mide `verificar-piezas-ciego.js` (las páginas escondidas avisan, Habilidades
sin la Fotografía ni el nivel 3, la guía sin esas secciones). Probado que
falla: sin `escondido()` saltan tres comprobaciones, y sin Memoria en la lista
o sin la regla de `data-oculto-ciego`, una cada una.

## Juega contra Oscar, como Entrenamiento

La revisión de lo que les sigue costando a las cuentas ciegas encontró que
`tablero.html` (contra Oscar) no seguía la regla de «Quien no ve hace todo
desde el recuadro»: su tablero es el propio de `js/tablero-board.js`, no
`TableroAccesible`, y con la cuenta ciega seguía en el lector, con sus 64
casillas entre los botones de arriba y los de abajo.

- Con la cuenta ciega el tablero se queda a la vista (para quien acompaña) con
  `aria-hidden` y ninguna casilla en el Tab; «b e4» dice qué hay sin mover el
  foco (`focusBoardSquare` solo anota la casilla).
- En Modo Adaptado las casillas se dicen como en todo el sitio, «anna 8,
  torre negra», y no «a8».
- El encabezado de esa página es el del sitio público: la barra de arriba, el
  menú (Cursos, Artículos, Inscríbete…) y su botón llevan `data-oculto-ciego`.
  Los accesos rápidos ya llevan al panel.

Lo mide `verificar-piezas-ciego.js` (con la marca y sin ella). Probado que
falla con el `tablero-board.js` de antes: saltan las dos comprobaciones.
