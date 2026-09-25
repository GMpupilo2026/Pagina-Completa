# Tableros y apariencia

Notas de diseño para Claude, sacadas del CLAUDE.md de la raíz: colores, temas, piezas, coordenadas, contraste y el arrastre en el celular.
El índice de todos los temas y las reglas que valen para todo el sitio
están en `CLAUDE.md`.

## Coordenadas en los tableros

`js/coordenadas-tablero.js` rotula cualquier tablero: la letra de columna en la
fila de abajo y el número de fila en la columna izquierda, dentro de las casillas
del borde (no cambia la maqueta). Está en todos los tableros de ejercicios:
Aprende, 4×4, Mates, Ejercicios por tema (incluida la táctica, que se mudó ahí
dentro), Practicar, Desafíos, el diagnóstico, Concentración, Racha táctica y
¡Te reto!

- Se llama una vez por página: `Coordenadas.aplicar(document.getElementById('board'))`.
  Un observador repinta las etiquetas cada vez que la página redibuja el tablero.
- Requisito: cada casilla debe llevar su nombre en `data-square`. Lee ese nombre,
  no la posición, así que funciona con el tablero girado y con el 4×4.
- Las etiquetas son `<span class="coord-etiqueta">` dentro de la casilla: si algún
  código cuenta `span` dentro del tablero, tiene que excluirlas.

## Colores de casilla para el celular: la pieza tiene que verse sobre las DOS casillas

Los pares de alto contraste de Modo Adaptado (blanco y negro, amarillo y negro)
contrastan de sobra **entre casillas** y fallan justo donde importa: la pieza
blanca sobre la casilla casi blanca da **1:1**, y la negra sobre la casilla
negra también. Se ve el tablero y desaparecen las piezas, y con el celular al
sol o con el brillo al máximo es peor, porque los tonos pastel se aplanan.

Por eso `js/board-color-themes.js` trae dos pares «Celular» (`CELULAR`, en las
dos listas: la normal y la de Modo Adaptado): **las dos casillas en tono
medio**, ninguna casi blanca ni casi negra, y de colores opuestos.

- **El número se calculó, no se eligió a ojo**, con la fórmula de WCAG: cada
  pieza queda a **3:1 o más** contra las dos casillas (el mínimo para un objeto
  gráfico). Ámbar/azul: blanca 3.16 y 5.57, negra 6.65 y 3.77. Turquesa/vino:
  blanca 3.03 y 6.55, negra 6.93 y 3.21. El contorno de cada pieza suma encima.
- **Aclarar la casilla clara o oscurecer la oscura rompe el par**, sin ningún
  error: sube el contraste entre casillas y una de las dos piezas vuelve a
  perderse. Al tocar esos cuatro colores, volver a medir los cuatro números.
- Ámbar contra azul y turquesa contra vino se siguen distinguiendo con
  daltonismo rojo-verde, porque se separan también en claridad.

### «Todas las piezas se ven blancas»: el alto contraste del CELULAR

El «Texto de alto contraste» de Android/Samsung repinta **todo texto** en
blanco con borde negro, y la pieza de siempre (♚) es texto: con ese ajuste
encendido **las negras salen blancas** y el tablero no dice de quién es cada
pieza. No da ningún error y el sitio no lo puede detectar (no es
`forced-colors`), así que ningún color de casilla lo arregla.

La salida es el estilo de pieza **«Dibujado con aro»** (`aro` en
`js/piece-style-themes.js`): el mismo SVG de `js/chess-piece-svg.js` —que ese
ajuste no toca porque no es texto— con un aro negro alrededor de las blancas
que la separa de cualquier casilla. **Las negras van sin aro** (ver «Las piezas
negras van sin borde» más abajo).

- **Los tableros preguntan `PieceStyleThemes.esDibujado()`, nunca por el id.**
  Estaba escrito `=== "ilustrado"` en once lugares: un tercer estilo dibujado
  habría dejado a la mitad pintando el glifo sin que nada fallara.
- **El aro lo pone el CSS** (`html[data-pieza="aro"]` sobre las clases
  `pieza-w`/`pieza-b` que ahora lleva cada `<svg>`), no cada tablero: así sale
  igual en los diez sin tocar ninguno.
- **En Modo Adaptado es el estilo POR OMISIÓN**, mientras la persona no haya
  elegido otro a mano. Ese modo se enciende por baja visión, que es justo
  quien tiene encendido el alto contraste del celular, y ahí el glifo negro
  sale blanco — con el contorno blanco que el modo le pone encima, además,
  se ve brillando. Pedirle que vaya a Configuración a buscar el arreglo es
  dejarle el problema: el modo ya sabe para quién es. Lo que se eligió a mano
  se respeta siempre, y al encender o apagar el modo (`adaptivemode:change`)
  se vuelve a poner `data-pieza`.

### «Ver mejor el tablero en el celular»: lo mismo, sin Modo Adaptado

Mucha gente con baja visión usa el sitio en modo normal, y ahí lo que hacía
falta vivía repartido en CUATRO tarjetas de `configuracion.html` —tema de
piezas, estilo de pieza, colores de casilla y color de piezas— que había que
acertar todas: una sola mal puesta tapa a las demás (un tema de emojis gana
sobre el dibujo con aro, y las negras vuelven a salir blancas). No daba ningún
error: se elegía «Dibujado con aro» y el tablero seguía igual.

La tarjeta **«👓 Ver mejor el tablero en el celular»**, arriba de las del
tablero, pone las cuatro de un toque (`clasico`, `aro`, `celularturquesa`,
`clasico`) **sin encender Modo Adaptado**.

- **Guarda lo que había ANTES** (`baja_vision_antes_v1`) y «Volver a como lo
  tenía» lo repone: quien tenía Madera vuelve a Madera, no al valor de fábrica.
  Si ya estaba puesto, apretar de nuevo no pisa esa copia con el preset.
- Escribe por los mismos `setPreference()` de cada módulo y repinta las cuatro
  rejillas, así que lo que dicen las tarjetas de abajo es lo que quedó puesto.

### «Colores a tu gusto»: cada casilla y cada bando, del color que se quiera

Las listas de pares no alcanzan para todos — cada vista es distinta —, así que
`configuracion.html` trae la tarjeta **«🎨 Colores a tu gusto»** con cuatro
`<input type="color">`: casilla clara, casilla oscura, piezas blancas y piezas
negras. **Solo en modo normal**: Modo Adaptado se queda con sus pares medidos,
porque ahí un par elegido a ojo es justo lo que puede dejar las piezas sin verse.

- **Es un id más, `personalizado`, en los dos módulos**
  (`js/board-color-themes.js` y `js/piece-color-themes.js`), con los colores en
  su propia clave (`board_color_custom_v1`, `piece_color_custom_v1`). **No va
  dentro de `THEMES`** a propósito: esa tabla la leen `css-construir.js` y
  `verificar-temas-plataforma.js`, y un «tema» que cambia según el navegador no
  es una fila que se pueda compilar ni verificar. `readKey`/`writeKey` lo
  aceptan solo en la clave NORMAL.
- **Elegir un color ES elegir «A tu gusto»**: `setCustom()` guarda y deja
  puesto `personalizado` en el mismo acto. Y las dos rejillas suman al final la
  opción «A tu gusto» con esos colores, así se ve cuál está elegida y se puede
  volver a ella después de probar otro par.
- **El contorno de la pieza no se elige: se calcula** (`contornoPara()`), con la
  regla de toda la tabla — relleno claro, contorno oscuro; relleno oscuro,
  contorno claro —. Dejarlo fijo haría que una «blanca» pintada de azul marino
  perdiera el borde contra la casilla oscura, sin ningún error.
- **Se avisa, no se impide.** Si una pieza queda por debajo de 3:1 contra una
  casilla (el mínimo de WCAG para un objeto gráfico), o los dos bandos se
  parecen demasiado, la tarjeta dice cuál y con qué número; pero se guarda
  igual: es su pantalla. Es la regla de «el color no se elige a ojo» llevada a
  alguien que sí lo está eligiendo a ojo.
- «Volver a los colores de siempre» pone `auto` y `clasico` y **no borra** lo
  elegido: queda en la rejilla como «A tu gusto» por si se quiere volver.
- **La vista previa es un tablero ENTERO**, en la posición inicial, con sus
  coordenadas por fuera y el estilo de pieza que esté elegido (dibujado o de
  símbolo): un par de casillas se ve distinto de a dos que de a sesenta y
  cuatro. Va `aria-hidden` porque lo que dice ya está en los cuatro campos.
- **Cada color se elige de dos formas que dicen lo mismo**: el cuadrito de la
  paleta y el código escrito (`#f0d9b5`), sincronizados. Mientras se escribe
  solo se guarda lo que ya es un color —«#f0d» a medias no pinta nada— y acepta
  el código sin `#` y en tres cifras (`fdb` es `#ffddbb`). Lo que no es un color
  se marca con `aria-invalid` y se dice con palabras al salir del campo.
- **«Empieza desde un par»** copia cualquier par de `THEMES` a las dos casillas,
  para retocar desde ahí; no toca las piezas.
- **El aviso cuenta el CONTORNO, no solo el relleno.** La pieza blanca de
  siempre sobre la casilla clara da 1,3:1 de relleno y se lee perfecto por su
  borde oscuro: midiendo solo el relleno, el aviso salía hasta con Madera, y un
  aviso que sale siempre deja de leerse. Usa la misma regla de `contornoPara()`.

## El tablero que eligió el alumno es el mismo en TODO el sitio

Configuración deja elegir cuatro cosas del tablero —el tema de piezas
(emojis), el estilo (símbolo o dibujo), el color de las piezas y el de las
casillas— y durante mucho tiempo **cada página respetaba las que se le
ocurrió a quien la escribió**. El alumno elegía el dibujo, lo veía en la clase
en vivo, abría Mates y volvía el símbolo de siempre; elegía Madera y en el
diagnóstico las casillas salían azules. No daba ningún error: cada tablero se
veía bien, solo que no era el suyo. Eran tres fallas distintas:

- **Quince ejercicios dibujaban su propio glifo** (Mates, Temas, Aprender,
  Practicar, Desafíos, Aperturas, Visualización, el diagnóstico,
  Concentración, Racha táctica, ¡Te reto!, `js/tablero-pregunta.js` de los
  exámenes…), cada uno con su `GLYPH` y sin preguntar por el estilo. Aprender
  preguntaba, pero por el id `=== "ilustrado"`, así que el «Dibujado con aro»
  le salía como símbolo. Ahora todos pasan por **`js/pieza-preferida.js`**, la
  única respuesta a «¿cómo se pinta esta pieza?» (emoji → dibujo → glifo, el
  mismo orden de `ClasesBoard`). Los tableros compartidos —`niebla-board`,
  `duelo-board`, `cartas-board`, `crazyhouse-board`, `tablero-board`, el
  diagrama de los artículos y las fichas de Estudio— también, así que **el
  tema de emojis dejó de ser solo de la clase en vivo**. Con el módulo sin
  cargar, cada uno cae en el glifo de siempre.
- **La mitad de las páginas no cargaba los módulos de preferencias**, así que
  aunque pintaran bien no tenían qué leer. `python3
  herramientas/tablero-cabecera.py` pone los seis, en dos lugares. Los tres
  que pintan al cargar (`board-color-themes`, `piece-color-themes`,
  `piece-style-themes`) van justo después de `js/adaptive-mode.js`, en el
  `<head>`: tienen que correr ANTES de que se pinte la primera casilla. Los
  otros tres (`board-themes`, `chess-piece-svg`, `pieza-preferida`) solo los
  usa el script de la página, y van justo antes del primer script del
  `<body>`: en el `<head>` frenaban el primer pintado (ver «Supabase va al
  final del `<body>`»). Qué páginas llevan tablero lo decide leyendo el HTML,
  no una lista a mano, así que **al agregar una página con tablero basta con
  volver a correrlo**. Solo agrega los que falten y se puede correr todas las
  veces que se quiera (marcas `<!-- tablero: inicio -->` y
  `<!-- tablero-js: inicio -->`).
- **El Modo Adaptado le cambiaba los colores.** Tiene su propia lista de
  casillas y de piezas, y ese modo **se enciende solo** —con el primer Tab o
  por el contraste del sistema—, así que el tablero que alguien se había
  armado pasaba al blanco y fucsia sin que tocara nada. Ahora **la lista de
  Modo Adaptado manda solo si se eligió algo en ELLA**; si no, se queda lo de
  arriba («Igual que arriba» es la primera tarjeta de esas dos listas y lo que
  trae quien nunca eligió). Y solo si arriba tampoco se eligió nada quedan los
  colores de siempre del modo. En piezas, «no se eligió» es que no existe la
  clave en `localStorage` (`getAdaptivePreference()` devuelve `"auto"`).

Lo que **no** cambió, a propósito: las miniaturas `compact` de ClasesBoard
siguen forzando el dibujo (a 16 px no se distingue una pieza), el tablero de 4
jugadores y el 4×4 no son «blancas contra negras», y Abrazos/Camaleón pintan
piezas fusionadas con su propia lógica.

### Las piezas negras van sin borde

El símbolo negro traía un contorno claro (`text-shadow` blanco al 55 %) y el
«Dibujado con aro» un aro blanco: se veía como un halo alrededor de cada pieza
negra, y se pidió quitarlo. `--piece-black-outline` vale ahora `transparent` en
todos los temas donde la negra es oscura, en los dos modos, y el aro de las
negras lee esa misma variable.

- **Solo lo conserva una «negra» CLARA** —los tres temas invertidos, o un color
  a tu gusto claro (`contornoNegras()`)—: ahí el borde es oscuro y es lo único
  que la separa de la casilla clara. No es el halo del que se habla.
- La sombra suave de abajo se queda: no es un borde, es lo que despega la pieza
  de la casilla.
- Las fichas de los temas de emojis (`.theme-token-black`) conservan su aro: ahí
  el círculo ES la pieza.

**Al tocar cualquiera de estas piezas, correr `node
herramientas/verificar-tablero-preferido.js`** (con el sitio en localhost:8777,
playwright y `npm install chess.js@0.10.3`; `--sin-navegador` corre solo la
primera parte). Comprueba que cada página con tablero cargue los seis módulos,
que ningún archivo pinte `piece-white`/`piece-black` con su `GLYPH` sin pasar
por `PiezaPreferida`, y en un navegador que con el dibujo, Madera y Azul y rojo
elegidos las páginas los pinten, que **encender Modo Adaptado no los cambie**
(se lee la variable que calculó el navegador) y que la negra salga sin borde.
Está probado que falla de verdad: devolviéndole a ¡Te reto! su glifo propio
salta 1, y volviendo a la regla vieja del Modo Adaptado saltan las de casillas
de las tres páginas en los cuatro casos.

- **`verificar-cuadro-comandos.js` tuvo que aprender a leer la pieza
  dibujada.** Arma la FEN leyendo los glifos del tablero, y en Modo Adaptado,
  sin nada elegido, el estilo por omisión es el dibujado con aro: mientras los
  ejercicios lo ignoraban, la prueba daba verde; al respetarlo, leía un tablero
  vacío. Ahora lee también el `<use>` del dibujo. Era el doble el que estaba
  incompleto, no la página.

## El tema de toda la plataforma: "Princesas" no es un tablero rosado

Los cuatro temas que ya tenía el sitio (`js/board-themes.js`,
`js/board-color-themes.js`, `js/piece-color-themes.js`,
`js/piece-style-themes.js`) cambian **el tablero**. Este cambia **la
plataforma**: el encabezado, las tarjetas, los botones, los textos y los
enlaces de las 95 páginas, más el color de las casillas y la decoración. Se
elige en **`configuracion.html` → «Tema de la plataforma»** y hay siete:
Clásico, Princesas, Unicornios, Sirenas, Galaxia, Bosque y Dragones.

**Se pudo hacer porque la paleta dejó de estar compilada dentro de cada
clase.** `bg-brand-800` pasó de valer `#102a43` a valer
`rgb(var(--c-brand-800))`, así que un tema solo redefine esa variable y cambian
de una vez las 2.628 veces que esa clase aparece escrita en el sitio. Sin eso,
un tema nuevo sería editar las 95 páginas — o sea, no habría temas. El tema
Clásico define esas variables con **exactamente los mismos hex de siempre**,
así que para quien no elige nada no cambió ni un píxel.

- **La tabla es `js/temas-plataforma.js` y corre en los dos lados.** La lee
  `herramientas/css-construir.js` con `require` para escribir las variables de
  cada tema al final de `css/tailwind.css`, y la lee el navegador para pintar
  la rejilla de Configuración. Escrita dos veces se separarían a la primera
  corrección, y el síntoma sería de los callados: la vista previa enseñando un
  rosa y la plataforma pintando otro.
- **NINGUNA PALETA SE ELIGIÓ A OJO, y eso es lo que la hace segura.** Cada tono
  tiene la MISMA luminancia WCAG que el tono equivalente del Clásico, así que
  los 49 pares de color que el sitio usa de verdad —`text-brand-600` sobre
  blanco, `dark:text-brand-300` sobre `brand-900`, `text-brand-900` sobre
  `accent-500`— dan el mismo contraste en los siete temas. Es la misma regla de
  «el color nunca se elige a ojo», llevada a donde más fácil se rompe: un rosa
  bonito deja el texto secundario en 3,2 y la página se ve preciosa mientras
  hay quien ya no la puede leer. Los hex van **escritos** en la tabla y no
  calculados al vuelo: el número que se verificó es el que se pinta.
- **Las variables van DENTRO de `css/tailwind.css`**, al final, y no en una hoja
  aparte: esa hoja ya la cargan las 95 páginas y un `<link>` nuevo habría que
  ponerlo en las 95 (y acordarse en la 96). Van al final y con selectores de más
  especificidad que una utilidad (`:root[data-tema="x"] .rounded-2xl` es 0,2,1
  contra 0,1,0) porque la decoración tiene que ganarle a las clases que ya están
  escritas en el HTML.

### El color de casillas lo propone el tema y lo decide el alumno

Princesas pone las casillas rosadas y Bosque verdes, pero **quien eligió Madera
sigue viendo madera**. Eso no lo resuelve ningún `if`: lo resuelve la cascada.

- El tema escribe `--sq-light`/`--sq-dark` en su bloque de CSS. Elegir un color
  a mano lo escribe como **estilo en línea** sobre `<html>`
  (`js/board-color-themes.js`), y un estilo en línea gana sobre cualquier hoja.
  Así ninguno de los dos tiene que preguntarle nada al otro — que es lo que
  hacía falta, porque ese script se carga en las páginas con tablero y la tabla
  de temas no.
- Por eso la preferencia de casillas nació con un valor nuevo, **`auto` («Como
  el tema»)**, que es el que trae quien nunca eligió: con `auto` no se escribe
  ninguna variable en línea. Y al volver a `auto` la variable se **quita**, no
  se deja de poner: sin eso, quien tenía Madera se quedaría con la madera
  escrita en línea pisando al tema para siempre, y sin ningún error a la vista.
- Con los temas entraron cuatro colores de casilla (`rosado`, `lila`,
  `turquesa`, `fuego`) y uno de Modo Adaptado (`rosadonegro`), que siguen
  pudiéndose elegir a mano con cualquier tema puesto.

### La decoración, y hasta dónde llega

«Que sea bien decorativa» es la mitad del pedido, así que los temas con
`decorado` traen además: un patrón de fondo (corazones, estrellas, burbujas,
hojas, escamas), las esquinas de las tarjetas más redondas, el encabezado y el
pie en degradado, y la letra de los **títulos** redondeada.

- **El patrón va al 9-10 % de opacidad** porque queda debajo del texto de una
  página de trabajo: un fondo que se note de más es un fondo que hay que apagar
  para poder leer. Y NUNCA lleva información — es adorno, no dato.
- **Son SVG escritos dentro del CSS**, no archivos de `img/`: son 400 bytes cada
  uno, así que una petición por tema costaría más que el CSS entero.

#### Los que VUELAN: los cohetes de Galaxia y los dragones de Dragones

Dos temas traen además figuras que **cruzan el fondo**: cohetes en Galaxia y
dragones tirando fuego en Dragones. Lo declara el campo `vuelan` de la tabla, y
el patrón de siempre (las estrellas, las escamas) se queda quieto debajo.

- **Son DOS capas y no una**, `body::before` y `body::after`, con figuras de
  distinto tamaño y distinta velocidad. Con una sola, todas se mueven igual y lo
  que se ve es un papel tapiz deslizándose; con las pequeñas despacio detrás y
  las grandes más rápido delante, el ojo lo lee como profundidad — que es lo
  único que hace que parezca que vuelan.
- **Cada vuelta recorre un mosaico exacto** (o dos a lo ancho, para que la
  diagonal quede más tendida). Así el bucle no tiene salto: al volver a cero, la
  figura de al lado está justo donde estaba la anterior. Un recorrido que no sea
  múltiplo del mosaico da un tirón cada vuelta, y eso en un fondo se nota mucho
  más que el propio movimiento.
- **El fuego va en el color de ACENTO, no en el de la silueta.** A esta opacidad
  es lo único que distingue «un dragón» de «un dragón tirando fuego», y la llama
  del cohete, de un pez.
- **El fuego tiene que ARRANCAR DENTRO de la boca.** Despegado un par de píxeles
  se lee como otro bicho volando al lado — eso se descubrió dibujándolo y
  mirándolo, no calculándolo. Lo mismo el ala del dragón, que va dibujada
  PRIMERO (o sea detrás): encima le corta el cuello y sus muescas se leen como
  agujeros en el cuerpo.
- **Van en `z-index: -1` y `pointer-events: none`**: detrás de todo el contenido
  y sin comerse un solo clic. Una capa fija a pantalla completa por delante sería
  una página entera que no responde, y eso tampoco daría ningún error.
- **Las dos formas de pedir menos movimiento hacen cosas distintas, a
  propósito.** Modo Adaptado **se las lleva enteras** (`content: none`): apagar
  el patrón y dejar los cohetes cruzando la pantalla sería justo lo contrario de
  lo que ese modo hace. `prefers-reduced-motion` del sistema solo las **frena**
  (`animation: none`) — quien pidió menos movimiento no pidió menos tema, y
  borrárselas sería quitarle la decoración que eligió.
- Las dos reglas viven en `css/styles.css`, junto a la que apaga el patrón, y
  llevan `!important`: la regla que las enciende tiene más especificidad
  (`:root[data-tema="x"] body::before` es 0,2,2 contra 0,1,2).
- **En Modo Adaptado el patrón se apaga.** Ese modo se enciende por baja visión,
  y un fondo con figuras debajo del texto es ruido visual justo ahí — quitarlo
  de en medio es de lo poco que este modo puede hacer. Lo que se va es el
  adorno: el tema no se apaga, los colores se quedan.
- **El degradado del encabezado mezcla brand-900/700/600 y nada más.** Son los
  tres tonos que ya llevan texto blanco encima en el sitio, así que no hay
  ningún tramo del degradado donde el contraste baje.
- **Solo los títulos cambian de letra.** El cuerpo se queda en Inter a
  propósito: es el texto que hay que poder leer en una tarea de veinte minutos,
  y la fuente redondeada de un tema no se eligió por legibilidad.
- **La fuente se baja SOLO si el tema elegido la pide.** Declararla en el
  `<head>` de las 95 páginas la bajaría siempre, también a quien no eligió
  ningún tema — este sitio ya recortó las fuentes a los pesos que de verdad usa.
  Por eso el nombre de la familia se guarda también en `localStorage`: no es una
  segunda fuente de verdad, es una copia que deja `js/temas-plataforma.js` para
  que el script del `<head>` pueda pedirla sin bajarse la tabla entera.

### El script del `<head>`, y por qué va en línea

`herramientas/tema-cabecera.py` pone en las 95 páginas cuatro líneas que leen la
preferencia y ponen `data-tema` en `<html>`. Va en el `<head>` por la misma
razón que el script del modo oscuro que está justo arriba: puesto después, la
página se pintaría primero azul y después rosada, en cada carga y en cada
página. Y va **en línea** porque un archivo más pedido en el `<head>` de las 95
bloquea el primer pintado de todas para cuatro líneas; la tabla entera solo la
carga `configuracion.html`, que es donde se elige.

- **La lista de páginas se le pide a `pwa-cabecera.py`**, no se vuelve a
  escribir: es la misma, y este repositorio ya se comió una vez el costo de
  tener dos listas que tenían que decir lo mismo.
- De paso ese script **corrige el `theme-color`**, que `pwa-cabecera.py` deja
  escrito con el azul de siempre: una barra azul del sistema encima de un
  encabezado rosado se ve como una app a medio pintar. El color lo lee de la
  variable que acaba de quedar puesta, no de una tabla copiada ahí.
- **Es una preferencia POR NAVEGADOR** (`localStorage`), como el modo
  claro/oscuro, el Modo Adaptado y los temas de tablero: es de dónde se está
  mirando, no de quién mira. No se sincroniza con la cuenta a propósito.
- Un id que no existe no pinta nada y la plataforma se ve como siempre, así que
  un valor raro guardado ahí no rompe nada. `inscripcion.html` queda fuera con
  su verde propio: es pública, sin sesión, y quien la abre todavía no es alumno
  de nadie.

**Al tocar la tabla de temas, la paleta, el generador de CSS o la tarjeta de
Configuración, correr `node herramientas/verificar-temas-plataforma.js`** (con
el sitio en localhost:8777 y playwright). Comprueba lo que se rompe callado, que
acá son cuatro cosas distintas: que ningún tema se olvide un tono —una variable
sin definir deja una declaración inválida y pinta el color heredado, sin ningún
error—, que ninguno pierda contraste contra el Clásico en los 49 pares, que
**`css/tailwind.css` esté al día con la tabla** —armando el bloque con la MISMA
función que lo escribió: cambiar una paleta y no recompilar deja la vista previa
diciendo una cosa y el sitio pintando otra—, y que el script esté en el `<head>`
de todas y en ninguna de las que quedan fuera. Después, en un navegador de
verdad: que tocar «Princesas» pinte el encabezado rosado **de verdad** (se mide
el color que calculó el navegador, no la clase), que el tema alcance a las otras
páginas y al modo oscuro, que la elección de casillas del alumno le gane al tema
**y que el camino de vuelta funcione**, y que con el tema puesto el texto peor
parado de la página siga llegando a su mínimo de contraste. De los que vuelan:
que las dos capas estén, que no se coman los clics, que **se muevan de verdad**
—una animación declarada que el navegador no corre se ve exactamente igual que
un fondo quieto, así que se mide el `transform` dos veces y se compara—, que un
tema sin `vuelan` no pinte ninguna, y que Modo Adaptado se las lleve mientras
`prefers-reduced-motion` solo las frene. Está probado que
falla de verdad: con un rosa elegido a ojo saltan el contraste y el compilado,
sin recompilar salta el compilado, quitándole el script a una página saltan dos,
dejando las capas encendidas en Modo Adaptado salta una, sin la regla de
«menos movimiento» otra, y con la animación declarada pero en pausa, dos.

## El dedo y el scroll: arrastrar piezas en el celular

Un navegador de celular, ante un dedo que se desliza, asume que quiere
desplazar la página: se queda con el gesto, manda `pointercancel` y el arrastre
muere a medio camino. Así que **arrastrar una pieza en el celular movía la
PÁGINA y la jugada no se hacía** — en los 16 tableros del sitio, y sin dar
ningún error: el alumno arrastraba, la pantalla se movía sola y la pieza se
quedaba donde estaba.

Se arregla con `touch-action`, en `js/board-drag.js`, que es el único lugar:
los 16 tableros lo comparten.

- **No se marca el tablero entero, y eso es la mitad del arreglo.** Poner
  `touch-action: none` en el tablero deja un cuadrado de media pantalla por el
  que no se puede desplazar la página, que en una página larga es un fastidio
  peor que el que se viene a arreglar. Se marcan **solo las casillas que en ese
  momento se pueden levantar** (las que `isDraggable` aprueba): en la posición
  inicial son las dos filas propias —16 de 64— y por las otras seis la página
  se sigue desplazando como siempre.
- Como el conjunto cambia con cada jugada, un `MutationObserver` lo recalcula
  cada vez que el tablero se vuelve a dibujar, agrupado en un cuadro de
  animación. Es el mismo patrón que ya usa `js/coordenadas-tablero.js`.
- Esto obliga a que `isDraggable` sea un **predicado puro**: ahora se lo llama
  para las 64 casillas en cada redibujado, no solo durante un gesto. Los 16 lo
  eran ya; al escribir uno nuevo, que lo siga siendo.
- **Al tocar `js/board-drag.js`, correr `node
  herramientas/verificar-arrastre-tactil.js`** (con el sitio en localhost:8777,
  playwright y chess.js). Hace el gesto de verdad con eventos de toque y
  comprueba **las dos mitades**: que arrastrar una pieza haga la jugada y no
  mueva la página, y que deslizando sobre una casilla vacía o sobre una pieza
  del rival la página sí se desplace. Comprobar solo la primera dejaría pasar
  el arreglo fácil que rompe el scroll.

**`js/variantes-board.js` no usa `enableBoardDrag`**: ahí se juega solo a
clic-clic. No es un olvido que este arreglo tape — es que ese tablero nunca
tuvo arrastre.

### La última jugada se ve y la pieza se desliza

Los tableros de partida (`js/niebla-board.js`, que también sirve a
`estandar.html`, y `js/crazyhouse-board.js`) redibujan las 64 casillas
ENTERAS en cada jugada — es lo más simple de mantener, pero de regalo la
pieza rival "aparecía" de golpe en su casilla nueva, sin ninguna marca de
cuál había sido la última jugada. Es justo lo que se nota al lado de un
tablero como el de lichess, que sí desliza y sí resalta.

- **`js/board-fluid.js` no sabe nada de ajedrez, solo lee FEN.** Compara la
  posición anterior con la nueva y deduce de qué casilla a cuál se movió la
  pieza (`diffMove`), y desliza la que quedó en la casilla de destino desde
  donde estaba (`slide`, técnica FLIP: se la coloca con un `transform` en la
  posición de "antes", sin transición, y al cuadro siguiente se suelta la
  transición hacia 0). Sirve para cualquier tablero con notación FEN de
  siempre, jugada normal, captura, enroque, al paso, coronación y — con
  `from: null`, sin deslizamiento porque no hay de dónde — una pieza suelta
  desde la reserva de Crazyhouse. Comprobado con jugadas reales de chess.js
  para los seis casos.
- **No sirve para `js/variantes-board.js`** (Abrazos, Camaleón): ahí una
  pieza puede ser la fusión de varias y no hay un solo carácter por casilla,
  así que compararlas con este método daría diffs sin sentido. Ese tablero
  ya traía su propio `lastMove`/resalte para jugadas propias (`_apply()`);
  quedó sin tocar.
- **Solo se anima la jugada del RIVAL, nunca la propia.** La propia ya se
  vio moverse arrastrando la pieza (o, si fue por toques, el usuario mismo
  la disparó) — deslizarla otra vez de "antes" a "después" encima de eso se
  vería como que la pieza rebota de vuelta al origen antes de llegar. Por
  eso `loadFen()`/`load()` (que es por donde entra la posición que llega de
  Supabase) es la única puerta con deslizamiento; `_applyMove()`/`tryMove()`
  (el clic o el arrastre propios) solo actualizan el resalte, sin animar.
- **El resalte SÍ es el mismo `bg-accent-400/30` que ya usaba
  `variantes-board.js`** para su última jugada — no una clase nueva, para
  que las dos familias de tableros se vean iguales.
- En Niebla de Guerra, el resalte de la última jugada respeta la niebla: si
  la casilla de destino queda cubierta, ni se marca ni se desliza nada ahí
  — lo contrario sería delatar dónde cayó una pieza que la niebla tendría
  que estar tapando.

### El tamaño de las casillas

El tablero de la portada tenía casillas de **36 px** en un celular de 360, y la
guía de Apple y la de Google piden 44 px para algo que se toca con el dedo. El
tablero recupera el relleno de la tarjeta con `-mx-4 sm:mx-0`: la tarjeta lo
conserva para el encabezado y los controles, pero el tablero no. Quedó en 40 px
(360), 44 px (iPhone) y 47 px (Android normal).

Al hacerlo salió otra vez la piedra de siempre: `-mx-4` **no estaba en el CSS
compilado**, así que la clase no pintaba nada y la medida no se movía. Hay que
correr `node herramientas/css-construir.js` al agregar una clase que no estaba
en ninguna parte del sitio.

## Contraste: el color nunca se elige a ojo

Todo texto llega al mínimo de WCAG AA (4.5 para texto normal, 3 para el
grande), **medido contra el fondo real, no contra blanco**: el cuerpo de la
página es `brand-50`, no `#fff`, y ahí un color puede perder medio punto.
`herramientas/` no tiene un validador propio: se mide en el navegador con la
prueba de accesibilidad, que compone las capas semitransparentes y se salta lo
que está sobre un degradado, porque contra un degradado no hay un número único.

- La paleta tiene **un tono por tema**, no uno solo para los dos: ningún color
  puede llegar a 4.5 contra blanco y contra `brand-900` a la vez (habría que
  estar por debajo de 0.18 de luminancia y por encima de 0.24 al mismo tiempo).
  Por eso se agregaron `brand-350` y `brand-450` — el par apagado— y
  `accent-700`, la versión del ámbar que se lee sobre fondo claro.
- Los pares que se usan: `text-brand-450 dark:text-brand-350` para el texto
  secundario, `text-brand-500 dark:text-brand-300` para descripciones,
  `text-brand-600 dark:text-brand-300` para texto normal y
  `text-accent-700 dark:text-accent-400` para las etiquetas ámbar.
- **Al escribir un par claro/oscuro, el número sube en uno y baja en el otro.**
  Había 38 casos de `text-brand-300 dark:text-brand-600`, que es el par al
  revés: el tono claro sobre fondo claro (1.95) y el oscuro sobre fondo oscuro
  (1.93). Los dos ilegibles, en las dos pantallas.
