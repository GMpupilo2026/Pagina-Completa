# Cursos y material

Notas de diseño para Claude, sacadas del CLAUDE.md de la raíz: cursos, su material de estudio, el catálogo, la guía del profesor y el video.
El índice de todos los temas y las reglas que valen para todo el sitio
están en `CLAUDE.md`.

## Cursos

Decisión vigente: el **temario es público** (portada, descripción y lista de
lecciones de `cursos/<curso>.html`, visibles sin sesión) pero el **contenido
completo de las lecciones se muestra solo con sesión de Academia iniciada**,
a propósito, para motivar la inscripción.

Se probó primero a hacer cumplir esto en el servidor (`worker.js` exigiendo
una cookie firmada, canjeada por la sesión vía `/api/curso-auth-session`) y
se abandonó: esa cookie dependía de la variable de entorno `COURSE_PASSWORD`
en Cloudflare, y cuando falta (se había borrado cuando los cursos fueron
públicos del todo) deniega a **todos**, incluidas cuentas válidas — bloqueó
al propio profesor. Decisión explícita: no depende de nada en Cloudflare.

- `cursos/<curso>.html`: portada y temario del curso — público, enlazado desde
  el menú del sitio y el pie de página.
- `cursos/protegido/<curso>.html`: el fragmento con las lecciones completas
  (texto, video, presentación y PDF). `js/curso-acceso.js` decide, solo en el
  navegador, si lo pide e inyecta: si `sb.auth.getSession()` devuelve una
  sesión, lo hace; si no, muestra un aviso invitando a iniciar sesión.
  **No hay bloqueo de servidor** — es la misma página para todos, el
  contenido cambia según haya sesión o no. `worker.js` solo sirve archivos.
- `cursos/recursos/<curso>/`: presentaciones (.pptx) y hojas de ejercicios
  (.pdf) — sin ningún bloqueo, ni siquiera informativo (se enlazan desde
  dentro del fragmento de arriba).
- No hace falta ninguna variable de entorno en Cloudflare para esto.

Para armar un curso nuevo del tipo "clásico" (lecciones de texto con su
presentación y su PDF de ejercicios) está `herramientas/curso-generar.py`: se
escribe el contenido en `herramientas/cursos/<slug>.json` (bloques, lecciones,
párrafos y la tarea de cada una) y el script genera la portada, el fragmento
protegido y los 2 archivos por lección en `cursos/recursos/<slug>/`. La portada
se clona de un curso existente, así que el encabezado, el menú y el pie siguen
siendo los mismos en todos. Necesita `pip install python-pptx reportlab`. Lo
único que queda a mano es la tarjeta en `cursos.html` y los enlaces de "curso
anterior / siguiente" de los dos cursos vecinos, porque el orden es una
decisión editorial.

Los cursos con tablero interactivo tienen además su JSON de posiciones en
`cursos/protegido/data/<slug>.json` y cargan el visor correspondiente
(`js/finales-100.js` para posiciones sueltas, `js/curso-partidas.js` para
partidas comentadas).

`js/finales-100.js` **ya no es solo de "Los 100 finales"**: elige su archivo de
datos según el `data-course` de `#course-content-body`, así que el mismo visor
—tablero, línea jugada a jugada y práctica contra Stockfish— sirve para
cualquier curso. Para sumarle posiciones a un curso generado: se escriben en el
campo `diagramas` de la lección (FEN, turno, resultado, pregunta, comentario y
la línea en notación inglesa) y `herramientas/curso-posiciones.js` las expande
al archivo de datos, verificando de paso que la FEN cargue, que la posición sea
legal y que cada jugada exista. La portada suma sola el CSS y los scripts del
visor cuando el curso trae posiciones.

**El resultado que promete cada posición se verifica con motor, no a ojo**:
`herramientas/verificador-motor.html` expone el Stockfish del sitio para
analizar desde un script (ver `herramientas/README-verificacion.md`). Hay que
evaluar la posición inicial **y la final de la línea**: así se descubrió que una
posición de Lucena del curso "Estrategia en el final" tenía el rey negro
demasiado cerca y la técnica del puente no ganaba, aunque todas las jugadas
fueran legales.

### Los cursos, recorridos con lector de pantalla

`js/curso-adaptado.js` retoca el fragmento del curso después de que
`curso-academia.js` lo inyecta (se engancha al evento `curso:contenido`). Hace
tres cosas, y **una de ellas no depende del Modo Adaptado a propósito**.

**1. Los encabezados, SIEMPRE.** El curso no se podía recorrer: el título de cada
lección era un `<summary>` —que se anuncia como botón, no como encabezado— y los
títulos de bloque eran `<h4>` colgando de un `<h2>`, saltándose el h3. Quien usa
lector de pantalla se mueve saltando de encabezado en encabezado, así que para
llegar a la lección 14 había que tabular por las trece anteriores con todos sus
enlaces de material. El remapeo encaja con lo que ya estaba escrito:

    h2 "Tus lecciones"  →  h3 Bloque  →  h4 Lección  →  h5 secciones

Los `h5` de dentro de las lecciones ya venían así, o sea que solo hubo que bajar
el bloque y subir la lección. **Va siempre y no solo en Modo Adaptado**: ese modo
se enciende a mano o se adivina (por el contraste del sistema o por el primer
Tab), así que puede estar apagado para alguien que usa lector de pantalla — la
accesibilidad de verdad es de la semántica, no de un modo visual, como dice la
cabecera de `js/adaptive-mode.js`. Y a quien ve la página no le cambia nada: el
encabezado va `inline` dentro del summary, con su mismo estilo.

- El encabezado va **dentro** del `<summary>` (el HTML lo permite): así se
  anuncia como las dos cosas, encabezado para saltar y botón para abrir.
- La marca de ✔/🔒 que pone `curso-academia.js` queda **fuera** del encabezado,
  así que saltando de encabezado en encabezado se oye el título limpio. El
  `aria-label` que explica por qué está bloqueada sigue en el summary.

**2. Solo el material adaptado, en Modo Adaptado.** Cada lección ofrece el
cuadernillo en PDF, el mismo material en HTML accesible, la presentación y la
hoja de ejercicios. El PDF y la presentación son diagramas con marca de agua —
para un lector de pantalla son lo peor que se le puede dar, que es justamente
por lo que existe la versión accesible. Se esconden. **El video se queda**: un
video es audio, y eso sí se oye. Y va un aviso arriba explicando qué falta y por
qué: si no, parecería que a las lecciones les faltan cosas.

**3. La posición escrita, junto al cuadro de comandos.** Los tres visores
(`finales-100.js`, `curso-partidas.js`) ya contaban la posición en palabras y ya
dejaban escribir la jugada en vez de arrastrarla — pero lo contado vivía en un
párrafo `sr-only` al final del visor, lejísimos del cuadro donde se escribe. Ese
párrafo se mueve justo encima del cuadro y, en Modo Adaptado, se hace visible:
leer la posición y contestarla son el mismo gesto. Sigue siendo región viva
(`aria-live`), así que cada jugada se vuelve a leer.

**Lo que decide qué se ve es el CSS** (`html.adaptive-mode` en `css/styles.css`),
no el JavaScript: así encender y apagar el modo surte efecto al instante, sin
volver a recorrer el contenido del curso.

#### "alfils" y "peónes" no son palabras

El plural de las piezas se calculaba sumando una letra —`alfil`+`s`,
`peón`+`es`— y el lector de pantalla las decía tal cual. Estuvo así en **61
materiales accesibles y en el libro del diagnóstico**, o sea justo en lo único
que esas personas pueden leer, y nunca dio un error: solo se oía mal.

Ahora el plural va **escrito**, en dos tablas que son la misma: `PIECE_PLURAL` de
`js/blind-notation.js` (el navegador, vía `BlindNotation.pieceLabel()`) y
`PLURAL_PIEZA` de `herramientas/lib/describir-fen.js` (los generadores). Los
archivos que ya estaban generados se corrigieron con las dos únicas palabras que
salían mal; las otras cuatro (damas, torres, caballos, reyes) ya salían bien.

**Al tocar los cursos de Academia, `curso-adaptado.js` o los visores, correr
`node herramientas/verificar-curso-adaptado.js`** (con el sitio en
localhost:8777, playwright y `npm install chess.js@0.10.3`). Los cursos están
detrás del login, así que `verificar-css.js` no ve nada de esto. Comprueba el
árbol de encabezados (un solo h1, ningún nivel saltado, una lección = un
encabezado, y que el summary siga abriendo), qué material se ofrece en cada modo,
que la posición escrita esté pegada al cuadro de comandos y **se vea de verdad**
en Modo Adaptado (se mide el `position` que calcula el navegador, no la clase), y
que no quede ningún plural inventado ni en los generadores ni en los archivos ya
generados, que ningún fragmento de curso vuelva a traer un enlace de video y que
ninguna página de curso de la Academia vuelva a repetir el temario.

### Los cursos ya no ofrecen video, y dentro de la plataforma no repiten el temario

Dos cosas que se quitaron de los cursos, por razones distintas:

- **Los 86 enlaces a video, fuera.** Vivían en seis de los diez fragmentos de
  `cursos/protegido/`, apuntando a YouTube. Con ellos se fueron las frases que
  los prometían —"Video, ejercicios interactivos…", "con su video explicativo",
  "lecciones en video"— en `cursos.html`, en las diez portadas públicas y en las
  diez páginas de la Academia: una promesa que la lección ya no cumple es peor
  que no hacerla. Lo que **no** se tocó es `tv.html`, que es la TV en vivo y no
  tiene nada que ver, ni las frases de la portada que contrastan las clases en
  vivo con "videos grabados", que siguen siendo ciertas. El campo `video` de
  `herramientas/lib/leer-curso.js` se fue también: no lo leía nadie y sugería
  que aún los hay.
- **El temario introductorio de `cursos/academia/*.html`, fuera.** Ahí abajo
  viene el contenido completo, lección por lección: el índice de arriba decía lo
  mismo dos veces. Y para quien salta de encabezado en encabezado no era solo
  repetición — había que recorrer el índice entero antes de llegar a la primera
  lección de verdad. **Las portadas públicas de `cursos/` lo conservan**: ahí el
  temario es lo único que hay, y es lo que se mira antes de inscribirse.

## Para quien administra, el contenido está todo abierto

El sitio abre su contenido de a poco: la lección siguiente cuando la anterior
queda estudiada, el nivel siguiente cuando el anterior queda resuelto. Para el
alumno eso es el camino; para quien administra es un estorbo — no puede revisar
ni preparar material que todavía no resolvió. Así que `js/acceso-admin.js`
responde una sola pregunta, una vez por carga de página
(`await AccesoAdmin.init()` y después `AccesoAdmin.esAdmin()` ya sin esperar), y
los cuatro candados del sitio la consultan:

- `js/curso-academia.js` → `estado()` — las lecciones de los cursos de Academia.
- `entreno/aprender.html` → `isUnlocked()` — las lecciones de Aprende.
- `concentracion.html` → `nivelDesbloqueado()` — los niveles.
- `ilumina-tablero.html` → `nivelDesbloqueado()` — los niveles.

**Es solo `is_admin`, no el rol de profesor.** Al profesor esto no le cambia
nada a propósito: lo suyo es "Desbloquear hasta el tema" de `informes.html`, que
le abre el curso **a un alumno concreto** (tabla `course_unlocks`) y deja
rastro. Abrirle todo a todo profesor sería otra decisión, y no es la que se
pidió.

Sin sesión, sin red o si la consulta falla, responde que **no**: el peor caso es
que quien administra vea la página como la ve un alumno, nunca al revés.

Como todo filtro del sitio, esto decide qué se **pinta**, no qué se puede leer:
`cursos/protegido/<curso>.html` ya viaja entero a cualquiera con sesión
iniciada, así que abrirlo acá no destapa nada que estuviera bajo llave.

**Al tocar cualquiera de los cuatro candados, correr `node
herramientas/verificar-contenido-admin.js`** (con el sitio en localhost:8777 y
playwright). Abre las cuatro páginas en un navegador de verdad, tres veces cada
una —alumno, profesor y administración, con el mismo progreso: ninguno— y
cuenta cuántas lecciones o niveles quedaron abiertos: todos para administración,
solo el primero para los otros dos.

## El material de estudio de cada lección

Cada una de las **186 lecciones** de los diez cursos tiene dos archivos de
estudio, enlazados desde la propia lección:

- `cursos/recursos/<curso>/NN-<leccion>-material.pdf` — el cuadernillo: de qué
  trata la lección, los conceptos que toca con su error frecuente, ejemplos con
  diagrama, ejercicios, preguntas con su respuesta y las fuentes.
- `cursos/recursos/<curso>/NN-<leccion>-material-accesible.html` — el **mismo**
  contenido para quien usa lector de pantalla.

**La versión accesible no es un PDF, a propósito.** Un PDF con diagramas, marca
de agua y cifrado es lo peor que se le puede dar a un lector de pantalla. En el
HTML cada posición va descrita pieza por pieza ("Rey blanco en e4; peón blanco
en d3"), con la línea escrita y la FEN por si se quiere cargar en un programa,
así que no hace falta ver ninguna imagen — y no hay ninguna: el verificador
falla si aparece un `<img>`.

**Lleva de vuelta al curso, arriba y en el pie.** El material se abre en su
propia pestaña desde la lección, y sin esos enlaces quedaba en un callejón sin
salida: no tiene el encabezado del sitio ni el menú, así que lo único que
quedaba era el botón "atrás" del navegador, que con lector de pantalla no
siempre está a mano. Arriba va como región de navegación con su nombre; abajo,
dentro del pie, como párrafo — dos `<nav>` con el mismo nombre se anuncian como
dos regiones iguales y no se sabe cuál es cuál. Va en los dos extremos porque el
documento es largo: quien termina de leerlo no tendría que subir de nuevo para
salir.

### De dónde sale el contenido (y por qué importa)

Nada de esto se inventa, y esa es la regla:

- El texto de cada lección sale de `cursos/protegido/<curso>.html`, que es de
  Oscar Angulo Cubero. Al extraerlo **hay que cortar antes de los visores**
  (`f100-`, `cp-`, `ac-`): sin eso el material se lleva el aviso de "Activa
  JavaScript…" y, peor, la respuesta del diagrama, que se repite más abajo.
- En `partidas-modelo` la lección **es** el visor de una partida y no tiene
  texto propio: el resumen, la teoría y lo que deja cada partida salen del
  archivo de datos, y los ejemplos son sus propias jugadas comentadas.
- Los conceptos, preguntas y ejercicios viven en
  `herramientas/material/conceptos.json` — 33 conceptos, 132 preguntas y 66
  ejercicios escritos para esto— y se emparejan con cada lección por palabras
  clave, con el área del curso como desempate.
- **Las posiciones no se inventan nunca.** Salen del fondo de 1.178 posiciones
  ya verificadas con motor que tienen los cuatro cursos con archivo de datos.
  Los otros seis cursos **las piden prestadas**, y la posición prestada va
  rotulada con el curso del que viene. Inventar una posición es exactamente el
  error que este repositorio ya cometió una vez, con una "Lucena" que no era
  Lucena.

### Las fuentes, y por qué están separadas en dos listas

Cada cuadernillo termina con **Fuentes** —de dónde sale de verdad lo que
dice— y, aparte, **Para seguir leyendo**. Están separadas a propósito: poner una
bibliografía de libros famosos al pie de un texto que no salió de ellos es
atribución falsa, que es justo lo contrario de lo que una sección de fuentes
tiene que evitar. Por eso la segunda lista dice con todas las letras que el
cuadernillo **no reproduce texto de esas obras**.

`herramientas/material/lecturas.json` guarda esa lectura recomendada por área.
Si algún día se cita algo literal, la cita va con página y comillas dentro del
texto, no en esa lista.

### Firma y protección

- **Oscar Angulo Cubero** va en la portada, en el pie de cada página, en la
  sección de fuentes, en el aviso de uso docente y en los datos del archivo.
- **Marca de agua en todas las páginas**, estampada con `pypdf` y no con CSS
  (misma lección que `herramientas/arbitraje-pdf.js`: con `position: fixed`,
  al paginar Chromium no respeta el centrado y la marca sale corrida).
  Después de estampar hay que **recomprimir y clonar**, o el archivo se va a
  megabytes.
- **El PDF se abre sin contraseña pero no se puede imprimir, copiar ni
  editar.** La contraseña de propietario es `material-ai-2026`, en
  `CLAVE_PROPIETARIO`. **La extracción de texto queda habilitada a propósito**:
  bloquearla dejaría el material fuera del alcance de quien lo lee con lector de
  pantalla, que es justamente a quien esta tanda quiere incluir. Bloquear la
  impresión y la extracción a la vez sería contradecir la mitad del encargo.
- Como todo acá, es protección del formato PDF, no una caja fuerte: quien
  conozca la dirección lo baja igual y con una herramienta puede quitarle las
  restricciones. `robots.txt` deja `cursos/recursos/` fuera de los buscadores
  —un filtro informativo más, no una puerta—.

### Cómo se regenera

    npm install playwright && pip install pypdf
    node herramientas/curso-material-generar.js      # los 372 archivos, ~2 min
    node herramientas/curso-material-enlazar.js      # pone los enlaces

**`--solo-accesible` rehace únicamente los 186 HTML** y no toca ningún PDF (ni
necesita playwright ni pypdf). El cuadernillo sale distinto byte por byte en
cada corrida —lleva la fecha adentro—, así que retocar una línea del HTML no
tiene por qué mover 186 archivos binarios. Sin esa puerta, la tentación es
editar los HTML a mano y que el generador y lo generado se vayan separando.

El enlazador **se puede correr todas las veces que se quiera**: reconoce lo que
puso una corrida anterior por las marcas `<!-- material: inicio -->` y lo
reemplaza en vez de duplicarlo. Eso importa porque el nombre del archivo sale
del título de la lección: corregirle una tilde a un título dejaría el enlace
viejo apuntando a un archivo que ya no existe.

`herramientas/lib/tablero-svg.js` dibuja los diagramas y lo comparten este
generador y el de las tarjetas de `cursos.html`: una segunda copia de los mismos
dibujos se iría separando de la primera a la primera corrección. **Lee las
piezas de `js/chess-piece-svg.js`**, que es donde viven hoy; estuvieron dentro
de `js/finales-100.js` y al mudarse nadie tocó esta línea, así que los dos
generadores morían al arrancar con "No se encontraron las piezas". No se notó
en meses porque no rompe el sitio: solo rompe regenerar.

**Al tocar cualquiera de estas piezas, correr
`python3 herramientas/verificar-material.py`** (necesita `pypdf`). Comprueba
archivo por archivo que cada lección tenga sus dos enlaces y que apunten a algo
que existe, que cada PDF esté cifrado y se abra sin contraseña, que NO deje
imprimir, copiar ni modificar pero SÍ extraer texto, que lleve al autor en los
datos y en el texto, que tenga marca de agua en **todas** las páginas, y que la
versión accesible no dependa de ninguna imagen, tenga los encabezados en orden
y describa en palabras el diagrama que el PDF dibuja. Lo que se rompe acá no da
error en pantalla: un PDF sin proteger se baja igual y un enlace roto solo lo ve
el alumno.

### Lo que queda por hacer

De las 186 lecciones, **92 traen posiciones de ejemplo**. Las que no son sobre
todo de `calculo-y-visualizacion`, `preparacion-para-torneos`,
`estrategia-y-tactica` y `aperturas-y-defensas`: el fondo de posiciones
verificadas es casi todo de finales y de desequilibrios, y no hay de dónde
prestarles. Cuando esos cursos tengan su archivo de posiciones, la corrida se
repite y las toman solas.

## La guía del profesor

`herramientas/guia-profesores.js` arma, desde UN solo contenido
(`herramientas/guia/contenido.json`), tres archivos que dicen exactamente lo
mismo:

| archivo | para qué |
|---|---|
| `guia-del-profesor-presentacion.pdf` | diapositivas 16:9, para proyectar en una capacitación |
| `guia-del-profesor.pdf` | manual A4, para leer y tener al lado del teclado |
| `guia-del-profesor-accesible.html` | el mismo contenido sin una sola imagen |

Son tres salidas y **no tres documentos**: escritas aparte se irían separando a
la primera corrección y media capacitación quedaría explicando algo que el
manual ya no dice. Es la misma decisión de `js/reporte-armar.js` (una estructura
neutral, tres generadores) y del `informe-html.ts` del correo a la casa. El
generador **exporta sus tres maquetas** (`module.exports` detrás de
`require.main`) para que el verificador las arme él mismo: comprobar una copia
de la maqueta no comprobaría nada.

- **La puerta de entrada es la versión accesible, no el PDF.** La tarjeta
  «📘 Guía del profesor» del panel (grupo Herramientas, solo equipo docente,
  junto a «Planes de clase») apunta ahí: es una página que abre en cualquier
  aparato, trae el contenido completo y desde ella se bajan el manual y la
  presentación. Con el PDF de destino, quien entra desde el celular se baja un
  archivo para leer lo que podía leer ahí mismo, y la versión accesible quedaría
  de repuesto en vez de ser la puerta. Lleva el enlace de vuelta al panel arriba
  **y** en el pie, como el material de estudio: el documento es largo y quien
  termina de leerlo no tendría que subir de nuevo para salir.
- **La marca de agua es la MISMA de los libros** (el logo de Oscar Angulo
  Cubero, rotado y al 11%), estampada con pypdf y no con CSS, por la razón de
  siempre: con `position: fixed` Chromium la repite pero al paginar no respeta
  el centrado. **Cada formato lleva su propia hoja de sello**, del tamaño exacto
  de SU página — una hoja A4 estampada sobre una diapositiva apaisada dejaría la
  marca en una esquina. Después de estampar hay que recomprimir y clonar, o el
  archivo se va a megabytes.
- **Acá SÍ se puede imprimir, al revés que los tres libros.** Aquellos bloquean
  la impresión porque traen las respuestas de una prueba y cuanto menos
  circulen, mejor. Esta guía es lo contrario: es material de trabajo que se
  lleva en papel y se proyecta. Lo que queda bloqueado es **modificarla** y
  reordenarle las páginas. La extracción de texto se deja habilitada por lo de
  siempre: sin ella el archivo queda fuera del alcance de quien lo lee con
  lector de pantalla. `CLAVE_PROPIETARIO` es `guia-profesores-ai-2026`.
- **Cuánto texto lleva una diapositiva decide su tamaño de letra**
  (`densidad()`: holgada, justa, apretada). Sin eso, la lámina con seis pasos y
  tres advertencias se sale de la página, y el desborde **no da ningún error**:
  se imprime cortada y de eso se entera quien está proyectando, delante de todo
  el equipo.
- `--solo-accesible` rehace únicamente el HTML y no toca ningún PDF (ni necesita
  playwright ni pypdf): los PDF salen distintos byte por byte en cada corrida
  porque llevan la fecha adentro. Sin esa puerta, la tentación es editar el HTML
  a mano y que el generador y lo generado se vayan separando — la misma decisión
  de `curso-material-generar.js`.
- **La guía accesible está en las dos listas de páginas exceptuadas de la app**,
  `verificar-pwa.js` y `pwa-cabecera.py`, junto a
  `libro-de-diagnostico-accesible.html`: es un documento que se abre suelto,
  hasta por correo y sin red, así que declarar un `manifest` que no va a poder
  cargar es peor que no declararlo. **Las dos listas tienen que decir lo mismo**
  — ya pasó una vez que no lo decían y el generador le ponía la cabecera en cada
  corrida sin que el verificador se quejara.

### Las capturas de pantalla

`herramientas/guia-capturas.js` fotografía 25 páginas de la plataforma y deja
los archivos en `img/guia/<slug>.jpg`. Cada apartado del contenido puede
declarar `"captura": "<slug>"`, y entonces:

- en la **presentación** se agrega una diapositiva propia con la pantalla en
  grande, justo después del apartado. No va metida al lado del texto a
  propósito: al proyectar, lo que sirve es verla grande —los botones de los que
  habla el apartado tienen que leerse desde el fondo del aula— y apretujada en
  media lámina no se lee ninguna de las dos cosas;
- en el **manual** va debajo del apartado, a ancho de columna;
- en la **versión accesible** no va ninguna, y se dice una vez arriba por qué:
  una captura es una imagen, esa página no depende de ninguna y lo que las
  fotos enseñan está contado paso a paso en cada apartado.

**Casi todas esas páginas están detrás del login**, así que no se pueden abrir y
fotografiar sin más: sin sesión redirigen a `login.html` y la foto saldría del
formulario de acceso una y otra vez, sin que nada fallara. Se usa el mismo truco
que los verificadores: se intercepta `js/supabase-client.js` y se sirve un
cliente de mentira con sesión de profesora y datos de demostración.

- **Los datos son inventados, y eso no es un detalle.** Ahí no puede salir el
  nombre de un alumno real, ni su correo, ni su progreso: la guía se imprime, se
  proyecta delante de todo el equipo y se manda por correo. Las cuentas de
  mentira viven todas en `DEMO`, en un solo lugar, para que se vea de un vistazo
  que ninguna es de verdad.
- **Los nombres de los campos de `DEMO` son los que lee cada página, uno por
  uno.** Con otro nombre la pantalla se pinta igual y escribe «undefined» en su
  lugar: así salió la primera captura de Informes, con tres tarjetas diciendo
  undefined, y la de Tareas con «undefined/undefined». Por eso el capturador
  **rechaza la foto si encuentra `undefined`, `NaN` o `[object Object]` en la
  pantalla** —en todo el texto, no en el principio—, además de rechazar el gate
  («Comprobando tu sesión…»), los avisos de acceso denegado y la página que se
  fue al login.
- **Una captura rechazada borra la que hubiera de antes.** Dejarla sería lo peor
  de los dos mundos: la corrida avisa de que falló y el generador encuentra el
  archivo igual, así que la guía sale con la pantalla vieja —la que tenía el
  undefined— y nadie se entera.
- **`reporte_actividades()` devuelve un OBJETO y no filas**, así que va en
  `rpcObjeto` y no en `rpc`: pasado por el mismo camino que los demás llegaría
  como arreglo y el informe saldría «del undefined al undefined». Su periodo se
  calcula desde HOY y no está escrito: con una fecha fija la captura envejece
  sola, que es el problema de almanaque que ya tuvo `verificar-panel.js`.
- **chess.js se sirve DE VERDAD desde `node_modules`**, y su ruta se registra
  DESPUÉS de las de los CDN: playwright resuelve la última que se registró, así
  que puesta antes la tapaba la de cdnjs y la clase en vivo se quedaba en
  «Cargando…» para siempre, sin dar ningún error.
- Algunas páginas necesitan un gesto antes de la foto (`antes`): Reportes abre
  con la vista previa vacía, así que se le aprieta «Traer los datos» — una
  captura del formulario en blanco no enseña lo que el apartado cuenta.
- La foto va en **16:9, la misma proporción que la diapositiva** que la va a
  enseñar: con otra forma entra por el lado que le sobra y deja dos franjas en
  blanco a los costados.
- Se corre con el sitio en localhost:8777 y playwright:
  `node herramientas/guia-capturas.js`, o `SOLO=panel,tareas` para rehacer unas
  pocas. Las 25 pesan 2,6 MB y **se commitean**, como `img/cursos/`.

El verificador comprueba las dos direcciones —que cada captura declarada tenga
su archivo y que no sobre ninguna en `img/guia/`—, que haya una diapositiva de
pantalla por cada una, que lleven texto alternativo, que vayan incrustadas y que
**ninguna se salga de su diapositiva ni quede aplastada** (se miden los dos
rectángulos en el navegador). El de Python cuenta, dentro de cada PDF, las
páginas con más de una imagen: desde que hay capturas, «¿tiene alguna imagen?»
ya no distingue si la marca de agua se estampó — lo que distingue es el número.

**Al tocar el contenido o el generador, correr las dos comprobaciones**:

    node herramientas/guia-capturas.js                # las pantallas (sitio en localhost:8777)
    node herramientas/guia-profesores.js
    node herramientas/verificar-guia-profesores.js    # las maquetas, en un navegador
    python3 herramientas/verificar-guia-profesores.py # los dos PDF, con pypdf

La primera necesita playwright y mide **el desborde de cada diapositiva en un
navegador de verdad** —no se fía del cálculo de densidad, que es justamente lo
que hay que comprobar—, que los 78 apartados estén en las tres salidas, que la
portada tenga fondo propio (si no, sería letra blanca sobre blanco, invisible y
sin ningún error) y que la versión accesible no dependa de ninguna imagen, no
salte ningún nivel de encabezado y no tenga anclas rotas en su índice. La
segunda necesita pypdf y mira lo que no se ve: que los dos PDF abran sin
contraseña pero estén cifrados, que SÍ dejen imprimir y extraer texto y NO
modificar, que lleven al autor, y que tengan **marca de agua en todas las
páginas del cuerpo** —el error clásico es estamparla solo en la portada—.

- **Dos trampas que esa comprobación ya se comió**, las dos del verificador y no
  de los archivos: `merge_page` no pega la imagen al primer nivel de los
  recursos de la página, la envuelve en un XObject de tipo `/Form`, así que
  buscarla solo arriba daba «no hay marca» sobre un archivo que sí la tiene; y
  `user_access_permissions` es un `IntFlag`, donde `permisos.MODIFY` devuelve
  **siempre** el miembro del enum —que es truthy— en vez de decir si ese bit
  está puesto: preguntado así, las cuatro líneas de permisos daban lo mismo para
  cualquier archivo y la comprobación se veía perfecta sin comprobar nada. Se
  pregunta con `in`. Está probado que discrimina de verdad: sobre el PDF sin
  sellar da 0 de 39 páginas con marca, y sobre el sellado, 39 de 39.

## El video promocional

`node herramientas/video-promo.js` arma el video que se manda por enlace (un
minuto escaso, 1080p, unos 5 MB). El texto vive en
`herramientas/video/guion.json` y el generador solo lo monta, así que corregir
una frase es corregir una línea y volver a correrlo — la misma decisión que el
catálogo de cursos y la guía del profesor. Solo pide `ffmpeg`: ni el sitio
servido, ni red, ni navegador.

**Las pantallas salen de `img/guia/`, y eso NO es por comodidad.** Esas
capturas las hace `guia-capturas.js` contra un Supabase de mentira, con cuentas
inventadas. Grabar la pantalla de verdad —con el celular, con OBS, o abriendo
la sesión de quien da clase— metería en un video que va a circular por WhatsApp
los nombres, los correos y el progreso de **menores de edad**, y eso no se
arregla después: el video ya salió. Por eso el generador **no sabe abrir el
sitio**; solo sabe leer esa carpeta.

- **La salida no se commitea.** `promo/` está en `.gitignore` **y** en
  `.assetsignore`: el worker sirve todo el directorio, así que un mp4 suelto
  quedaría publicado en el sitio sin que nadie lo pidiera. Es el mismo par de
  candados que `respaldos/`, y por la misma razón — de git no se borra nada.
- **Falla si le falta algo, en vez de apañarse.** Sin Inter usaría la fuente
  que hubiera en la máquina: el video saldría con otra letra, se vería perfecto
  y se vería de otra empresa. Sin una captura, dejaría una escena en negro que
  nadie mira hasta que está publicada. Por eso la tipografía **está en el
  repositorio** (`herramientas/video/fuentes/`, con su licencia SIL OFL) y el
  generador se planta si no la encuentra — lo mismo que hace `arbitraje-pdf.js`
  cuando le falta pypdf.
- **El texto va sobre el fondo de marca y la captura debajo, nunca encima de
  ella.** Con el texto sobre la pantalla habría que garantizar el contraste
  contra una imagen que cambia en cada escena, y la mitad de las capturas
  tienen fondo claro: se lee en el monitor de quien lo montó y no se lee en un
  teléfono. Es la misma regla que el resto del sitio — el color no se elige a
  ojo.
- **Nada de Ken Burns.** El zoom continuo de `zoompan` se calcula en enteros y
  da un temblor que a 1080p se nota; sobre una imagen fija, además, delata el
  pixelado. Lo que hay es una entrada de seis píxeles en el primer medio
  segundo y un encadenado limpio entre escenas.
- **El guion no promete lo que la pantalla no enseña.** La primera versión
  decía «cada alumno sabe qué le toca hoy» sobre el panel de la **profesora**
  (el doble entra como docente, a propósito, para que la guía enseñe todo) y
  «se puede estudiar sin ver la pantalla» sobre una captura donde no se ve nada
  de eso. No falla nada: se ve muy bien y dice algo que no es. Lo que no tiene
  captura que lo respalde —hoy, la accesibilidad— va en una placa de texto, que
  no promete ilustrar nada.

**Las capturas envejecen y eso es lo que se rompe callado.** Se hicieron en el
PR #294 y `sesion.html` cambió en el #310, así que el primer montaje enseñaba
una pestaña «Controles» que ya no existe: el video se ve perfecto y promociona
una pantalla que nadie va a encontrar. **Antes de armar el video, rehacer las
capturas** (`node herramientas/guia-capturas.js`, con el sitio en
localhost:8777 y playwright) y después **mirarlas**, que es lo único que
descubre un desajuste entre lo que el texto dice y lo que la pantalla enseña.
Y correr `node herramientas/verificar-guia-profesores.js`: esas mismas 25
capturas son las de la guía, que se imprime y se proyecta.

Lo que este camino **no** da es locución ni música: la voz hay que grabarla
—vale más la del profesor para una academia que vende «un profesor real»— y la
música tiene que ser de librería con licencia.

## El catálogo de cursos

Las tarjetas de `cursos.html` **no se editan a mano**: salen de
`herramientas/cursos/catalogo.json` y las escribe
`python3 herramientas/cursos-catalogo.py` entre las marcas
`<!-- catálogo: inicio -->` y `<!-- catálogo: fin -->`. Antes eran el mismo
bloque de HTML copiado diez veces, así que cambiar el diseño de una tarjeta
eran diez ediciones y era cuestión de tiempo que una quedara distinta.

- **Se genera, no se arma con JavaScript.** Es la página que más tiene que
  encontrar Google; si el catálogo solo existiera al ejecutar un script, sin
  JavaScript la página se vería vacía. El filtro por nivel sí es JavaScript, y
  por eso su barra arranca con `hidden` y se muestra desde el script: sin
  JavaScript no aparece un control que no haría nada, y se ven los diez cursos.
- **Los niveles son un conjunto cerrado de cuatro** (Principiante, Intermedio,
  Avanzado, Competición). Antes convivían seis etiquetas —"Todos los niveles",
  "Intermedio · Avanzado", "Competitivo"— para lo que en realidad son cuatro
  escalones, y con eso no se puede filtrar. El orden de las tarjetas es por
  nivel.
- **El degradado va en el nivel, no en el curso**: azul más oscuro cuanto más
  avanzado, ámbar para competición. Antes cuatro cursos compartían el mismo por
  casualidad y dos naranjas quedaban pegados.
- **Un solo enlace por tarjeta.** El título es el enlace y su `::after` estira
  el área de clic sobre toda la tarjeta, así quien usa lector de pantalla no
  escucha el mismo destino dos veces ("Ver temario →" es `aria-hidden`). La
  grilla es `<ul>`/`<li>` de verdad, para que se anuncie cuántos cursos hay.
- `precio`, `duracion` y `modalidad` están en el JSON **vacíos a propósito**. La
  tarjeta no muestra esa línea mientras estén en blanco y los datos
  estructurados no los declaran: antes que inventar un precio, no decir nada.

### Los diagramas de las tarjetas

Cada tarjeta lleva una posición real en `img/cursos/<slug>.svg`, que genera
`node herramientas/cursos-diagramas.js` (necesita chess.js). Antes eran emojis
gigantes: dos cursos compartían el 🏁, los emojis se dibujan distinto en cada
sistema y no decían nada del curso.

- **Las posiciones no se inventan.** Las de los cursos con tablero salen de su
  propio archivo de datos (`cursos/protegido/data/<slug>.json`), que ya está
  verificado con motor; las demás van escritas en el generador y **se
  comprueban con chess.js antes de dibujar**: que la FEN cargue, que la
  posición sea legal, que haya jugadas y que la jugada clave exista y dé mate
  si se prometió mate. Así se descartó una posición de Lucena inventada que no
  era Lucena, que es exactamente el error que ya había pasado antes.
- Los dibujos de las piezas se leen de `js/finales-100.js`, donde ya estaban,
  en vez de tener una segunda copia que se pueda ir separando. Cada SVG
  incluye solo las piezas que aparecen: un final de peones no carga el dibujo
  de la dama.
- El `alt` de cada diagrama **dice qué se ve**, no "diagrama de ajedrez": es
  información del curso, no decoración.
