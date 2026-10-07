# Cursos y material

Notas de diseño para Claude, sacadas del CLAUDE.md de la raíz: cursos, su material de estudio, el catálogo, la guía del profesor y el video.
El índice de todos los temas y las reglas que valen para todo el sitio
están en `CLAUDE.md`.

## Cursos

Decisión vigente: el **temario es público** (portada, descripción y lista de
lecciones de `cursos/<curso>.html`, visibles sin sesión) pero el **contenido
completo de las lecciones y su material solo lo baja una cuenta de la Academia
con el acceso vigente**, a propósito, para motivar la inscripción.

- `cursos/<curso>.html`: portada y temario del curso — público, enlazado desde
  el menú del sitio y el pie de página.
- `cursos/protegido/<curso>.html` (y `protegido/data/`): el fragmento con las
  lecciones completas y los datos de sus tableros.
- `cursos/recursos/<curso>/`: cuadernillos, presentaciones y material
  accesible.

### El candado de los cursos está en el servidor, y no depende de ningún secreto

**Hasta septiembre de 2026 no había candado**: `js/curso-acceso.js` decidía en
el navegador si pedir el fragmento, y eso decide qué se **pinta**, no qué se
puede bajar. Cualquiera con la dirección exacta se llevaba el curso entero y
los 75 MB de material.

**El primer candado se abandonó** y conviene saber por qué: `worker.js` exigía
una cookie firmada con una variable de entorno de Cloudflare
(`COURSE_PASSWORD`), canjeada por la sesión vía `/api/curso-auth-session`.
Cuando la variable se perdió, dejó afuera a **todos**, incluido el profesor.

**El de ahora no guarda nada en Cloudflare**:

- `js/supabase-client.js` (`window.SesionCursos`) copia el token de acceso de
  la sesión a la cookie `ai_sesion_cursos`, con `Path=/cursos/` y
  `SameSite=Lax`: el navegador la manda solo ahí. Es el mismo token que ya está
  en `localStorage`, así que no expone nada nuevo. Se escribe al cargar, en cada
  cambio de sesión y **justo antes de pedir un fragmento** (`curso-acceso.js`,
  `curso-academia.js` y `sesion.html` llaman a `SesionCursos.guardar()`), para
  no depender del orden en que supabase-js avisa que renovó el token.
- `worker.js` le pregunta a Supabase `acceso_vigente()` con ese token y la
  clave pública (la misma de `supabase-client.js`; el verificador comprueba que
  no se separen). PostgREST rechaza un token vencido, mal firmado o de otro
  proyecto, y la función respeta el interruptor de acceso pagado (ver «El
  candado de verdad: políticas RESTRICTIVAS»): es **la misma pregunta que ya
  cierra la base**. La respuesta se recuerda 5 minutos por token para no
  preguntar por cada archivo de una lección.
- **Sin sesión: 401. Sin acceso vigente: 403.** Si era una página (abrir un PDF
  desde un enlace), se explica en una página propia que ofrece iniciar sesión y
  vuelve a la **portada del curso**: el login solo acepta volver a un `.html`.
  Esa página la arma el worker, así que `_headers` no le pone nada: lleva sus
  propias cabeceras de seguridad.
- **Si Supabase no contesta (red, 5xx), se deja pasar**, la misma regla que
  `acceso-vigente.js`: una caída no puede dejar sin su material a todos los que
  pagaron. En ese caso solo pasa un token que dice ser de este proyecto y no
  venció; una cookie cualquiera no se cuela. **Cuando Supabase contesta, decide
  solo Supabase**: si el formato del token cambiara algún día, el worker no
  puede repetir el error del candado anterior y dejar afuera a todo el mundo.
- **`run_worker_first` en `wrangler.jsonc` es la mitad del candado.** Con
  Workers Assets, un archivo que existe se sirve directo, **sin pasar por el
  worker**: sin esa línea el código está perfecto y el candado no existe, sin
  ningún error. Nombra esas carpetas y `material/`; el resto del sitio se sirve
  como siempre.
- `cursos/recursos/<curso>/` abre con el acceso vigente **o** con la compra de
  ese material, y los libros sueltos viven en `material/<producto>/` y abren
  solo con su compra (ver «La tienda con permiso por producto» en
  cobros-acceso-y-tienda.md).
- Lo que queda abierto a propósito: la portada y el temario,
  `guia-del-profesor-accesible.html` (la ayuda «?») e
  `instrucciones-adaptadas.pdf` (va en el correo de bienvenida).

**Al tocar `worker.js`, `wrangler.jsonc` o `SesionCursos`, correr
`node herramientas/verificar-worker.js`** (sin red: cambia `fetch` por un
Supabase de mentira). Comprueba sin cookie, con un token vencido o inventado,
con acceso y sin él, con Supabase caído, que la portada siga pública, que la
URL, la clave y el nombre de la cookie sean los del sitio, y que
`run_worker_first` nombre las dos carpetas. Para verlo con el runtime de
Cloudflare: `npx wrangler dev` **desde una copia** del sitio sin
`node_modules` — en la carpeta del repositorio se queda recargando en bucle,
porque vigila `./` entero y escribe su estado en `.wrangler/`.

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

### Los adjuntos de un curso van en un bucket privado

`curso-adjuntos` (migración `20261001021252`) nació **público**, y en un bucket
público el archivo se baja con su enlace (`/storage/v1/object/public/…`) sin
pasar por ninguna política: las de `storage.objects`, que lo dejaban solo a
administración, no contaban. Lo que se adjunta a un curso es lo que se vende,
así que con el enlace cualquiera se saltaba el candado de arriba. Se hizo
privado antes de que tuviera un solo archivo (`20261001142925`): cada bajada
pasa por `curso_adjuntos_archivos_select` y por la verificación en dos pasos de
`storage.objects`. **Quien deba verlo después (un alumno con el acceso
vigente) lo abre con un enlace firmado de pocos minutos**, nunca haciendo
público el bucket, y la política que lo permita pregunta lo mismo que el
worker (`puede_bajar()`).

### Los cursos escondidos

Seis cursos están **escondidos a alumnos y profesores** (octubre de 2026, a
pedido del dueño): Fundamentos del Ajedrez, Aperturas y Defensas, Cálculo y
Visualización, Finales Prácticos, Estrategia y Táctica y Preparación para
Torneos. Siguen en el repositorio y quien administra los sigue abriendo, para
revisarlos o terminarlos. La lista vive en **dos lugares que tienen que decir
lo mismo** (`verificar-worker.js` lo comprueba):

- `js/cursos-ocultos.js` decide qué se **pinta**: «Mis cursos» les quita la
  tarjeta (vienen con `hidden` en el HTML para que no se asomen mientras se
  pregunta quién mira; a administración se le muestran con «Escondido a
  alumnos y profesores»), la página del curso dice que no está disponible sin
  pedir el contenido, y los enlaces «curso anterior / siguiente» que llevan a
  uno escondido se van. Tampoco se ofrecen en el material de la clase
  (`sesion.js`), en tareas y exámenes (`MaterialPlataforma.cursos()`), ni en
  «Sigue con tu curso» o el «Continuar» de Informes. En la clase, tareas y
  exámenes se esconden **también para administración**: quien administra no da
  clase. Con «Ver como: profesor» o «alumno» `AccesoAdmin.esAdmin()` dice que
  no, así que los ve escondidos como ellos.
- `worker.js` (`OCULTOS`) decide qué se **baja**: para esos cursos,
  `cursos/protegido/` y `cursos/recursos/` preguntan
  `puede_bajar(curso, false)`: el acceso a la Academia no basta, pasan
  administración y quien compró ese material en la tienda (pagó por él). La
  página de 403 dice «Este curso no está disponible».
- Los recursos de esos cursos se sacaron del plan de entrenamiento
  (`js/plan-entrenamiento.js`): mandaban a una portada de un curso que el
  alumno no puede abrir. Si un curso se vuelve a abrir, se quita de las dos
  listas y se le devuelve su renglón al plan.
- **Lo que queda igual a propósito**: las portadas públicas (`cursos/<curso>.html`,
  el catálogo `cursos.html`) y la tienda no se tocaron, y el avance que un
  alumno ya tenía en esos cursos sigue en sus informes: es historia, no se
  borra.

`node herramientas/verificar-todo.js cursos-ocultos worker` lo comprueba.

### «Marcar lección como estudiada» nunca guardó nada

`curso-academia.js` guarda cada lección estudiada en `training_progress` con
`activity = 'curso'`, pero `'curso'` no estaba en
`training_progress_activity_check`: la base rechazaba cada fila y el alumno
veía «No se pudo guardar el avance. Revisa tu conexión…», que culpaba a la red.
No había ni una fila de `'curso'` en la base. Se agregó en
`20260929213024_training_progress_curso.sql`, y `verificar-finales.js` («La base
acepta cada actividad que se registra») ahora mira también los `insert`
directos a `training_progress`, no solo `EntrenoProgress.log()`: fue por ahí que
se escapó.

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
leer la posición y contestarla son el mismo gesto. **Ya no es región viva**:
releer las treinta y dos piezas con cada jugada tapaba todo lo demás. Lo que
se anuncia es la JUGADA, en palabras, en `.f100-anuncio` / `.cp-anuncio`
(«Jugaste: …», «El motor jugó: el caballo negro va de gustav 8 a felix 6. Te
toca.»; antes solo decía «Te toca»), y la posición se pide con «posición».

**4. El recuadro es el común** (`CuadroComandos`, con `.cc-input`): entiende
jugadas, las preguntas al tablero («caballos», «qué ataca e4»…), recorrer
escribiendo («siguiente», «jugada 5»), «practicar», «girar», «terminar» y, en
las partidas, «adivinar», «pista», «seguir» y «solución». Las páginas de
`cursos/academia/` están escritas a mano y no cargaban esas piezas:
`CursoAdaptado.piezas(cb)` las trae en orden, con ruta relativa, solo las que
falten. La vista pública (`cursos/*.html`, sin `curso-adaptado.js`) se queda
con un recuadro sencillo que solo entiende jugadas.

**5. En Modo Adaptado, el tablero es de casillas y no un dibujo.** El SVG no
tiene casillas que se recorran (los `<rect>` no tienen `.click()` y el foco no
se ve): `CursoAdaptado.tablero(host, fen, opts)` dibuja las 64 con
`EjercicioTablero.dibujar` y monta `TableroAccesible` (una parada de Tab,
flechas, o/z/m/x, Intro para elegir la pieza y el destino donde el curso pide
una jugada). El estado de cada casilla va escrito en `data-estado` («puedes
capturar ahí», «tu jugada, correcta»…). Las casillas cuentan la posición
DIBUJADA, no la partida del visor: al adivinar, la partida se queda en la
pregunta mientras el tablero ya muestra la jugada. Fuera del Modo Adaptado sigue
el SVG de siempre, y al cambiar el modo en caliente se repinta. `sesion.html` no
carga `curso-adaptado.js`: ahí los visores siguen con el SVG.

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
`cursos/protegido/<curso>.html` ya viaja entero a cualquier cuenta con el
acceso vigente, así que abrirlo acá no destapa nada que estuviera bajo llave.

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
- Es protección del formato PDF, no una caja fuerte: con una herramienta se le
  pueden quitar las restricciones. La puerta es otra: `cursos/recursos/` solo
  lo baja una cuenta con el acceso vigente (ver «El candado de los cursos está
  en el servidor»), y `robots.txt` lo deja además fuera de los buscadores.

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

### Las jugadas: en español, y dichas en lo accesible

Regla del dueño: **todo lo que se escribe va en algebraica española** (R rey,
D dama, T torre, A alfil, C caballo: «Cf3», «Axc6», «Txe8+», «e8=D», «O-O»), y
**en lo hecho para quien no ve —todo archivo «-accesible»— la jugada va dicha**
en el formato de ajedrez para ciegos: «caballo felix 3», «alfil captura cesar 6
jaque», «eva 8 corona dama», «Enroque corto». «Cf3» el lector de pantalla lo
deletrea y no se entiende.

- Los archivos de datos (`cursos/protegido/data/*.json`, el banco del
  diagnóstico) guardan el SAN inglés que lee chess.js y **no se tocan**: se
  convierte al escribir, con `herramientas/lib/notacion.js`. El formato dicho
  no se escribe a mano: lo da `BlindNotation.sanSpoken` de
  `js/blind-notation.js`, cargado con `vm`, que es lo mismo que oye el alumno
  en el sitio.
- **La R es el problema**: en inglés es la torre y en español el rey. Por eso
  el generador no adivina cuando sabe: `linea` es inglesa y `linea_es`
  española (`lib/leer-curso.js` devuelve `lineaOrigen`), y el título de una
  jugada comentada sale de `m.san` (`tituloOrigen: "ingles"`). En un texto
  libre decide por las letras que no dejan duda (N, B, Q, K inglesas; C, A, D,
  T españolas); si trae de las dos y además una R, avisa en vez de elegir.
- Lo que **enseña a anotar** se deja escrito también en lo accesible: el
  concepto «La notación y la planilla», la lección de notación de Fundamentos
  y las preguntas `*notacion*` del diagnóstico. Van con
  `data-notacion="escrita"`, que el verificador respeta.
- `node herramientas/verificar-notacion-espanola.js` (sin navegador) recorre
  `articulos/`, `cursos/` y `material/` y falla con una jugada inglesa en el
  texto visible de una página, o con una jugada escrita en un «-accesible». No
  mira atributos ni `<script>`: ahí va el SAN de chess.js. No puede ver una
  línea inglesa hecha solo de jugadas de torre y de peón («1.Rd1 e5»), que es
  igual a una de rey en español: por eso el origen se dice, no se adivina.
- Las presentaciones `.pptx` de las lecciones no tienen generador en el
  repositorio; se corrigieron editando el texto de sus diapositivas. Los
  cuadernillos PDF sí: el generador ya los escribe en español, pero hace falta
  `pypdf` para volver a imprimirlos.

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
| `material/guia-del-profesor/guia-del-profesor-presentacion.pdf` | diapositivas 16:9, para proyectar en una capacitación |
| `material/guia-del-profesor/guia-del-profesor.pdf` | manual A4, para leer y tener al lado del teclado |
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

`herramientas/guia-capturas.js` fotografía 27 páginas de la plataforma y deja
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

### Las capturas de la guía, con la cuenta de quien la lee

Cuando la guía se abrió al equipo docente (ver «El «?» de la guía, para el
equipo docente»), las capturas se rehicieron enteras. Tres cosas:

- **La profesora de mentira ya no administra.** Con `is_admin` el panel es el
  de administración, y `panel.jpg` enseñaba tarjetas que el profesor no tiene.
  `PROFE` da clase y coordina; las páginas que hoy son solo de administración
  (`admin`, `arbitraje`, `lector-planilla`, `reportes`) llevan `quien: "admin"`
  y se fotografían con `ADMIN`, otra cuenta inventada. La guía dice en cada una
  que es de administración.
- **El navegador lleva una sesión guardada** (`sembrar()` de
  `lib/playwright-con-sesion.js`): sin ella, la guardia del `<head>` (ver «Sin
  sesión, al login antes de bajar nada») recargaba la página una y otra vez y
  ninguna captura llegaba a sacarse; las 21 con sesión fallaban por tiempo y se
  borraban. El login no la lleva: se fotografía como lo ve quien no entró.
  El recorrido del profesor nuevo se da por visto, para que no tape el panel.
- **`DEMO` se puso al día con lo que leen las páginas**, que es el fallo
  callado de siempre: el resumen de Informes trae `id` (no `student_id`), y
  con el nombre viejo el selector de alumnos tenía seis opciones «undefined»
  y `?alumno=` no elegía a nadie; los cursos traen `hechos` y `titulo`
  («undefined/20 · NaN%»); y faltaban `mis_funciones_coordinacion` (Cobros y
  Formularios salían diciendo «no está entre tus funciones») y
  `entreno_mi_mes` (Logros decía «No se pudo cargar este mes»).
- Se sumaron dos: `informe-alumno` (el informe de Sofía, con «Con este
  alumno») y `clase-buscar` (la clase con «¿Qué quieres hacer?» buscando).
- Al rehacerlas, el panel enseñó un texto viejo: «la clase se abre sola…, en
  cuanto llegue un alumno», cuando eso dejó de pasar (ver «La sesión en vivo
  se abre cuando el profesor la abre»). Se corrigió en `js/clases.js` y lo
  cuida `verificar-panel.js`. Mirar las capturas es también revisar el sitio.

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

## Los certificados de curso

El alumno termina **todas** las lecciones de un curso y su profesor (o
administración) le da el certificado desde Informes. Lleva el logo de la
academia del alumno y la marca de Ajedrez Integral, y un código para que
cualquiera compruebe, sin cuenta, que es auténtico.

- **Por qué hace falta el profesor**: el avance de un curso son filas que el
  alumno escribe en `training_progress` (`activity = 'curso'`) y la base no
  valida. El certificado es la palabra de la academia de que lo hizo, así que
  hacen falta las dos cosas: el curso completo **y** el profe que lo confirma.
- **La base sabe cuántas lecciones tiene cada curso**:
  `interno.curso_lecciones`, contadas como las cuenta `js/curso-academia.js`
  (un `<details>` de primer nivel por lección en `cursos/protegido/<slug>.html`).
  El catálogo no sirve: en tres cursos su número no coincide con el real.
  `verificar-certificados.js` compara la tabla de la migración con cada página;
  si un curso suma una lección, hay que corregir la tabla con una migración
  nueva, o nadie podría completarlo para la base (o se completaría antes).
- **`certificados` es un acta**: guarda el nombre del alumno, el curso, quién lo
  dio y la academia (nombre y logo) tal como eran ese día. No se reescribe ni
  se borra: `anular_certificado` lo marca, y el mismo enlace lo dice («fue
  anulado y ya no vale», cruzado encima y sin «Imprimir»). Uno vigente por
  alumno y curso: lo garantiza el índice `certificados_uno_vigente`, y dar dos
  veces devuelve el mismo código. Va en la bitácora de auditoría.
- **Quién**: `emitir_certificado` y `anular_certificado` (SECURITY DEFINER)
  piden `soy_profesor_de(alumno) or soy_admin()` envuelto en `coalesce`; la
  tabla no tiene política de escritura. La leen el alumno, sus profesores y
  administración (el conjunto de alumnos se arma una vez). La academia del
  certificado es la del alumno; si es de varias, la que comparte con quien lo da.
- **Comprobarlo sin cuenta**: `certificado.html?c=<código>`. El código son 10
  caracteres al azar (como el enlace del diagnóstico); uno con otra forma ni se
  le pregunta a la base. `certificado_publico(código)` devuelve solo lo que va
  en el papel: ni el id del alumno ni su correo. Quien tenga el enlace ve el
  nombre del alumno, igual que en un certificado impreso.
- **La página es un papel**: blanco también en modo oscuro, apaisado, con un QR
  que lleva al mismo enlace. «Imprimir o guardar en PDF» saca solo el papel, en
  una hoja A4 apaisada (`@page certificado`, una página con nombre, para no
  cambiar cómo se imprime el resto del sitio). La marca de Ajedrez Integral va
  como en el encabezado (el caballo y el nombre sobre el azul): el caballo es
  claro y sobre el papel blanco no se vería. `logo-completo-*.png` es la marca
  personal de Oscar, no la del sitio.
- **En Informes** (`cursoCertificado` en `js/informes.js`): con el curso
  completo, el profe ve «🎓 Dar certificado» (con confirmación) y, si ya lo dio,
  «Ver certificado» y «Anular». El alumno ve el suyo, o «Cuando tu profe lo
  confirme, aquí sale tu certificado».
- Lo prueban `verificar-certificados.js` (las lecciones de cada curso y la
  página) y `pruebaCertificados` en `verificar-informes.js`. Probado también en
  la base, impersonando roles y deshaciendo todo al final: anon no puede dar ni
  leer la tabla; el alumno no se lo da a sí mismo; un profe ajeno, tampoco; con
  el curso a medias, «lleva 1 de 20 lecciones»; completo, sale; otro alumno no
  lo ve; anon lo comprueba con el código; queda en la bitácora; anulado, lo dice.

## El libro «Ponte a prueba»

Un libro de examen de Oscar Angulo Cubero: 180 posiciones en seis pruebas de
30 para medirse uno mismo, con soluciones, planilla de puntos, tablas que pasan
los puntos a una fuerza en Elo —total y por categoría— y una guía de qué
entrenar según lo que salga flojo. Lo arman dos scripts:

- `herramientas/libro-examen-generar.js` escribe el banco,
  `material/ponte-a-prueba/banco.js` (no se edita a mano);
- `herramientas/libro-examen-pdf.js` escribe
  `material/ponte-a-prueba/ponte-a-prueba.pdf` y su versión accesible.

Lo revisa `verificar-libro-examen.js`.

### Tomado de un libro ajeno como referencia, no copiado

El dueño pidió un libro «basado» en *Chess Exam and Training Guide* y *Chess
Exam: Tactics*, de Igor Khmelnitsky, «como si lo hiciera yo». Traducir esos
libros y ponerles otra firma es publicar la obra de otro con nuestro nombre,
y eso no se hace. Se tomó el **método**, que no es de nadie:

- dos preguntas por posición: cómo queda y cuál es la jugada. Encontrar la
  jugada sin saber adónde lleva vale menos que encontrarla entendiéndola;
- crédito parcial y negativo, para que adivinar no sume;
- cada posición suma a varias categorías, y la comparación entre categorías
  es lo que dice qué entrenar;
- una guía de entrenamiento por categoría.

Las posiciones, los textos, las categorías, los puntos y las tablas son
propios. Ninguna posición sale de esos libros.

### Las posiciones y los puntos los decide el motor

- Salen de la base abierta de Lichess (CC0), con los mismos filtros de calidad
  que el diagnóstico, y pasan por el MISMO análisis de Stockfish
  (`analizar()` de `diagnostico-lichess.js`, que ahora se exporta): una sola
  jugada buena y tres opciones que tientan y fallan. Ninguna repite un
  ejercicio del diagnóstico: el mismo ejercicio en las dos pruebas mediría
  memoria.
- La pregunta 1 tiene cuatro respuestas fijas: mate a la fuerza, más de 4
  peones, de 2 a 4, menos de 2. Primero se probó «ganan / ventaja / igualdad /
  negras mejor», y en un banco de ejercicios 154 de 180 tenían la misma
  respuesta: contestar siempre «ganan» sacaba casi todo sin leer nada. Con
  los cortes nuevos la más repetida queda en 74. Cerca de un corte la vecina
  vale 2 y no 1: ahí dos lecturas son razonables.
- En la pregunta 2 la buena vale 5, una que deja a las blancas mejor 1, una que
  deja escapar la ventaja 0 y una que pierde −1, según lo que dice el motor de
  cada una.
- La dificultad es el rating de Lichess menos 710: el descuento de las
  preguntas de opción con tablero más el corrimiento que midió la calibración
  del diagnóstico.

### Las seis pruebas son parejas

Cada grupo de origen (apertura, táctica, ataque, cálculo, defensa, finales)
aporta 30 posiciones de cinco tramos de dificultad, y se reparten de a una por
prueba. Así cada prueba trae 5 de cada grupo de todas las dificultades y sirve
sola como examen corto, con su propia tabla. Las seis juntas dan la fuerza por
categoría.

### Las tablas salen de la curva del Elo, no de un muestreo

No hay todavía gente que haya hecho el libro, así que la tabla de puntos a
fuerza se calcula: para una fuerza R, cada posición se acierta con probabilidad
0,25 + 0,75 / (1 + 10^((elo − R)/400)), y al fallar se cobra el promedio de las
otras opciones. Cuando se junten resultados reales conviene recalibrar como
se hizo con el diagnóstico.

### En la plataforma

El banco es la fuente «Libro “Ponte a prueba”» de `examenes.html`
(`ExamenBanco.armar({ fuente: "libro", prueba })`), entera o prueba por prueba.
Se toma la pregunta de la jugada como `opcion_tablero` y vale la buena: el
examen de la plataforma califica bien o mal, sin crédito parcial. La pregunta
de la evaluación queda guardada en el banco por si un día se quiere usar.

**El banco vive en `material/ponte-a-prueba/banco.js`, no en `js/`.** Trae
las respuestas: en `js/` lo bajaba cualquiera, y «elegir con quién se
comparte» no habría significado nada. Detrás del candado de `material/` el
worker solo se lo sirve a quien puede bajar el material; a los demás les
contesta 403, el script no carga y `examenes.js` no ofrece la fuente.

### El PDF

Lleva tapa, marca de agua con el logo, firma del autor y protección, como el
libro del diagnóstico, con el código compartido en `herramientas/lib/pdf-armar.js`.
A diferencia de aquel, **se deja imprimir**: es un examen que se contesta en
papel. Vive en `material/ponte-a-prueba/`, detrás del candado del worker:
lo baja administración y aquellos con quienes se comparte (ver «Los
materiales de clase»). Para venderlo suelto falta darlo de alta como producto
de la tienda.

## El banco de ejercicios «Mide tu fuerza»

Un libro de tests tácticos de Oscar Angulo Cubero: 360 posiciones en 45 tests
de 8, cada test de **un solo tema** (ataque doble, ataque a la descubierta,
jaque doble, clavada, enfilada, desviación, atracción, interferencia, despeje,
eliminación del defensor, rayos X, jugada intermedia, pieza atrapada, jugada
tranquila y el peón avanzado), en tres niveles. Lo arman dos scripts, como
«Ponte a prueba»: `herramientas/mide-tu-fuerza-generar.js` (el banco,
`material/mide-tu-fuerza/banco.js`, que no se edita a mano) y
`herramientas/mide-tu-fuerza-pdf.js` (el PDF y la versión accesible). Lo
comprueban `verificar-mide-tu-fuerza.js` (el banco y lo accesible) y
`verificar-mide-tu-fuerza-pdf.py` (protección, autor, marca de agua en cada
página y que estén los 45 tests).

### Tomado de un libro ajeno como referencia, no copiado

La referencia fueron los tomos de *Mida su fuerza ajedrecística*, de Livshitz
(tests temáticos de ocho posiciones, tiempo fijo por test, 5 puntos por
posición, premio o castigo por el tiempo y la suma pasada a Elo). De ahí se
tomó **el método y nada más**: ni una posición, ni un texto, ni una tabla.
Las posiciones salen de la base abierta de Lichess (CC0); las explicaciones de
cada tema, las pistas, las reglas de los puntos parciales (5, 3, 1, 0) y los
tiempos son propios; y la tabla de fuerza se calcula, no se copia (ver abajo).
El título tampoco es el del libro: «Mide tu fuerza», en tuteo.

### Las posiciones: una sola jugada que gana

Las candidatas (`herramientas/datos/mide-tu-fuerza-candidatas.txt`, la
consulta está en la cabecera del generador) pasan por el **mismo** `analizar()`
del diagnóstico: solo quedan las que tienen una sola jugada buena. Además se
exige que **gane** (+3 o mate): el test promete que hay una combinación, y si
la posición solo empata quien busca el golpe busca algo que no está. El tema
de cada posición es el que le puso Lichess; si tiene varios manda el más raro
(un jaque doble casi siempre es también un ataque a la descubierta). Ninguna
repite una pregunta del diagnóstico ni de «Ponte a prueba». Si un nivel queda
corto en un tema (los rayos X difíciles casi no existen en la base), lo
completa el nivel vecino con el rating más cercano.

A diferencia de «Ponte a prueba», juegan blancas **o negras**, como en una
partida: el tablero se ve siempre desde las blancas y cada diagrama dice
arriba, en un recuadro blanco o negro y con palabras, quién juega.

### La dificultad y las tablas

`elo` = rating de Lichess − 780: el descuento de las preguntas de mover del
diagnóstico (400) más el corrimiento que midió su calibración (380), porque
acá también se contesta sin opciones. La tabla de fuerza sale de la curva del
Elo, igual que en «Ponte a prueba» pero sin acierto al azar: para una fuerza
R, cada posición se resuelve con probabilidad 1 / (1 + 10^((elo − R)/400)) y
vale 5. Hay una tabla por nivel (para quien hace uno solo) y una del total.

El tiempo de cada test es el de su nivel (30, 40 y 50 minutos: 4, 5 y 6 por
posición) y vive en el banco, para que el libro y quien lo use en clase digan
lo mismo.

### El PDF

Igual que «Ponte a prueba»: tapa, marca de agua con el logo en cada página del
cuerpo, el nombre del autor en la tapa, el pie de cada página y los datos del
archivo, y protección (`herramientas/lib/pdf-armar.js`). **Se deja
imprimir**: es un cuaderno de trabajo. Vive en `material/mide-tu-fuerza/`,
detrás del candado del worker, y se comparte desde `admin.html#materiales`.

## Los cuentos de Peonita, para los más pequeños

*Peonita y el reino de las 64 casillas*, de Oscar Angulo Cubero: un cuento
ilustrado para que niñas y niños de 4 a 8 años aprendan a jugar. Peonita, un
peón blanco, sale de noche de la caja de ajedrez de una escuela tica, y Don
Lento, un perezoso del guarumo de la ventana, le enseña a mover cada pieza.
Quince capítulos (el tablero y el nombre de las casillas, las piezas una por
una, el valor, jaque, mate, ahogado, enroque y captura al paso, tres consejos
de apertura y las reglas del buen jugador), cada uno con su ilustración, «Lo
que aprendí» y una página de «¡A jugar!»; al final, el diploma y las
soluciones.

- Cada cuento es un módulo de `herramientas/libro-ninos/` (`peonita.js`,
  `trucos.js`; la lista está en `libros.js`) con el cuento, los ejercicios y
  **sus respuestas escritas a mano**, la tapa, el final, el diploma y sus
  secretos. `dibujos.js` tiene los personajes y las escenas, y
  `herramientas/libro-ninos-pdf.js` los pone en papel **con una sola
  maqueta**: `material/<slug>/<slug>.pdf` y `<slug>-accesible.html`.
- Los revisa `verificar-libro-ninos.js`, todos. Un cuento nuevo se suma a
  `libros.js` y entra solo al generador y al verificador.

### Tomado de un libro ajeno como referencia, no copiado

El dueño lo pidió «como» *El maravilloso mundo del ajedrez escolar*, de Carlos
Salgado Allaria (un cuento con una peona que aprende con su profe, y
actividades entre capítulo y capítulo). Ese libro tiene licencia Creative
Commons **sin obra derivada**: adaptarlo, aunque se cambien los nombres, es
justo lo que la licencia no deja. Se tomó el **tipo de libro**, que no es de
nadie (cuento + idea principal + actividades, para leer acompañado), y todo lo
demás es propio: la historia, los personajes, los textos, los dibujos y los
ejercicios. Ninguno sale de ahí.

### Las respuestas se escriben a mano y las comprueba chess.js

Cada ejercicio trae su `respuesta` escrita en el contenido, y el verificador
la **vuelve a calcular desde la posición** sin usar nada del generador: cuántas
casillas alcanza la pieza, cuál es la única que puede comer, si el rey está en
jaque, cuál es la única forma de salir del jaque (huir, tapar o comer), que el
mate en una sea UNO solo y el escrito, mate/ahogado/ninguno, si el enroque
corto es legal, los saltos del caballo, los puntos de cada grupo. Si el
generador calculara las respuestas, el verificador estaría comprobando el
cálculo contra sí mismo. Una posición con los dos reyes además tiene que ser
legal (el rey del que no mueve, fuera de jaque).

Las posiciones para aprender a mover una pieza llevan esa pieza sola, sin
reyes (como en cualquier libro de iniciación). chess.js 0.10.3 las carga y les
cuenta las jugadas igual; los puntos de «puede ir» los saca el generador de
chess.js, nunca se dibujan a mano.

### Los dibujos son SVG escritos en el repositorio

Sin imágenes de afuera: el libro se vuelve a generar igual en cualquier
máquina, nadie tiene que pedir permiso por una ilustración, y cada personaje se
ve igual en todos los capítulos. Las piezas son personajes (ojos, cachetes,
el moño de Peonita, la bufanda de Tizón) pero con la **silueta de la pieza de
verdad**: el niño tiene que reconocer la torre cuando la vea en un tablero.
Cada escena lleva su descripción (`alt`), que es también lo que dice la versión
accesible en lugar del dibujo.

### Cada cuento lleva un secreto para Alessandro

Pedido del autor, **para este cuento y todos los que vengan**: cada libro
infantil esconde una dedicatoria o un guiño para su hijo Alessandro. Va
escondido, nunca anunciado en el libro: se descubre. En el de Peonita hay dos:

- **La dedicatoria es un acróstico**: la primera letra de cada uno de sus diez
  versos, de arriba hacia abajo, dice ALESSANDRO. Sin negritas ni nada que lo
  delate.
- **El alfil se llama Don Saleras**, que tiene exactamente las mismas letras
  que Alessandro (y suena a «salero», tener gracia). Antes era «Don Picudo».

Para los próximos cuentos sirven las mismas ideas u otras parecidas: un
personaje con su nombre en anagrama o escondido a plena vista («Al…fil
Sandro»), las iniciales de los capítulos, un acróstico en un poema, una
posición cuyas piezas dibujan una A. Antes de elegir, se le proponen las
opciones al autor.

**El verificador del libro comprueba el secreto** (`SECRETO`, `DEDICATORIA` y
`SECRETOS` de cada libro): corregir una palabra del poema o el nombre
del personaje lo rompería sin dar ningún error, y nadie lo notaría justo
porque está escondido. Este archivo y `herramientas/` no se publican
(`.assetsignore`), así que contarlo acá no lo delata.

### Lo que lo distingue de los otros libros

- **Se deja imprimir**: las páginas de «¡A jugar!» se pintan y se escriben.
- **La marca de agua va al 7 %, no al 11 %**: va encima de ilustraciones de
  colores y a la opacidad de los otros libros ensuciaba los dibujos.
- Los diagramas son de madera y no azules (`colores` de `lib/tablero-svg.js`),
  con dos marcas nuevas: un punto donde la pieza puede ir y un aro donde puede
  comer. **Los colores se midieron** contra las dos casillas: el primer verde
  daba 1,7:1 en la casilla oscura y el punto casi no se veía en la mitad de
  las casillas; el de ahora da 4,1:1 (el aro, 3,9:1). Y el pie de cada
  diagrama dice qué son los puntos.
- Con un solo diagrama, el diagrama y «Lo que aprendí» van lado a lado: si no,
  el recuadro quedaba solo en una página casi vacía.
- **El diploma** lleva la firma de los personajes arriba de la línea, como
  hecha a mano («Peonita ♥ Don Lento»), y su nombre impreso abajo. El autor va
  aparte, abajo al centro y en pequeño, junto al logo gris de la marca de agua
  (el crema no se ve sobre el fondo crema). Es el mismo diseño de los diplomas
  que se le hacen a mano a quien termina un libro.
- Comparte con «Ponte a prueba» el cierre (`lib/pdf-armar.js`) y el
  `describir()` de la versión accesible. Va en `admin.html#materiales` y se
  comparte igual; sin pruebas como cuestionario, esa sección no aparece.

### El segundo cuento: los trucos del bosque

*Peonita, Tizón y los trucos del bosque*: los primeros trucos de la táctica
para quien ya sabe mover las piezas (la pieza sin cuidar, la horquilla del
caballo, el ataque doble de la dama, la horquilla de peón, la clavada, la
enfilada, el mate del pasillo, el ataque a la descubierta, mirar qué quiere
el otro y un repaso). La historia: en una excursión, Don Pillo, un mapache
travieso, se lleva las piezas que nadie cuida; Peonita y Tizón aprenden un
truco por capítulo, le ganan el torneo y se vuelve su amigo. Vuelve Don
Saleras, el alfil, a enseñar la clavada.

**Los secretos para Alessandro**: las iniciales de los diez títulos, leídas
de arriba hacia abajo en el índice, dicen ALESSANDRO. Y en el capítulo 1, en
el tronco del árbol donde Peonita se esconde para espiar a Don Pillo, hay un
corazoncito grabado con «ALE» adentro (`guarumo(…, { grabado })` de
`dibujos.js`). Impreso mide unos 2 mm: se encuentra con lupa, como buscan los
trucos Peonita y Tizón. La descripción del dibujo dice que hay un corazón
grabado, pero no qué dice. El verificador comprueba que el árbol siga
teniéndolo (`data-grabado`).

A la mitad del libro, en el capítulo 5, **el sol es Alessandro de bebé**: una
carita con su gorrito tejido de orejitas, dibujada a partir de una foto que
mandó el autor (`solBebe()` de `dibujos.js`, que sale con `sol: "bebe"` en la
escena). Es el único sol así de los dos libros: el autor lo quiso en uno solo
y no en todos. Se dibujó en vez de pegar la foto, para que tenga el estilo del
libro y porque la foto de un niño no debe ir dentro de un PDF que se comparte
y se descarga. La foto no está en el repositorio. El verificador comprueba que
haya exactamente un sol de bebé y que sea de día.

### En un libro de trucos, la respuesta tiene que ser LA jugada

Un ejercicio de táctica promete que hay un truco y que es ese. El CI no tiene
Stockfish, así que `herramientas/lib/tactica.js` es un buscador chiquito con
chess.js: negamax con poda alfa-beta a cuatro medias jugadas, contando
material, y al final solo capturas hasta que la posición se calma (si no,
contaría como ganada una pieza que se pierde enseguida). Alcanza para
posiciones de iniciación, que es lo que trae un cuento. Con él se comprueba:

- `gana`: la jugada de la respuesta es la **única** que gana al menos
  `minimo` puntos;
- `amenaza`: con el turno de las negras, la jugada que dice la respuesta es
  la única de Tizón que gana `minimo` (la posición con ese turno también tiene
  que ser legal);
- `defensa`: cada jugada que propone la solución deja a las negras sin nada
  que gane `minimo`.

Rompió cuatro posiciones que parecían buenas a ojo. La torre que se come un
caballo sin cuidar también amenazaba mate del pasillo, así que había dos
respuestas. En dos horquillas de peón, la pieza atacada se salvaba **dando
jaque**, y después se salvaba la otra. Y en una descubierta, la dama negra
tapaba el jaque dando jaque a su vez. Además, el buscador tenía un error
propio: chess.js da tablas con rey y caballo contra rey, y entonces la torre
que se comía la horquilla «valía 0». Para contar material, solo el ahogado
es tablas.

Las flechas de los diagramas (`flechas` en `lib/tablero-svg.js`) son azules
#123e7c: 8,6:1 contra la casilla clara y 4,1:1 contra la oscura.

## Los materiales de clase

`admin.html#materiales` («Materiales de clases») junta los materiales para dar
clase —hoy, «Ponte a prueba», el banco de ejercicios «Mide tu fuerza» y los
cuentos de Peonita— y dice **con quién se comparte cada uno**: una
persona, una academia entera o todos los profesores. Lo pinta
`js/admin-materiales.js`; lo prueba `verificar-admin.js`.

### Quién lo ve lo decide la base

- `material_compartido` guarda con quién: una fila por persona, academia o
  «todos los profesores» (una sola de las tres, por `check`), con índices
  únicos parciales para no repetir. Solo la lee administración y no tiene
  política de escritura: la escribe `material_compartir()`, que exige
  `soy_admin()`. Reparte accesos, así que lleva `interno.auditar` y va en
  `VIGILADAS` de `verificar-auditoria.js`.
- `interno.material_compartido_conmigo(producto)` contesta por quien llama:
  la persona, un miembro de la academia o quien la supervisa, o un profesor
  si se compartió con todos.
- `puede_bajar()` —la que pregunta el worker para `material/<producto>/`— lo
  suma. Así el PDF, la versión accesible y el banco quedan detrás del mismo
  candado. El worker guarda la respuesta 5 minutos: dejar de compartir tarda
  eso en cerrarse del todo.
- Compartir con una academia incluye a sus alumnos (pueden bajar el libro y
  hacerlo en papel); con «todos los profesores», no.

### Las pruebas como cuestionario, en tres versiones

`herramientas/libro-examen-cuestionarios.js` arma, para cada una de las seis
pruebas, tres versiones (A, B y C) de 20 preguntas: las 30 posiciones se
reparten en tres tandas de 10 que **no se repiten**, cada una con la misma
mezcla de dificultad, y cada posición trae sus dos preguntas (cuánto ganan y
cuál es la jugada). Las opciones de la jugada se barajan distinto en cada
versión. Así un grupo no recibe el mismo examen que otro.

Son cuestionarios **listos** (sin dueño) con `material = 'ponte-a-prueba'`. La
política de `cuestionarios` deja leer un listo con material solo a quien
`puede_bajar()` ese material; los listos de siempre (`material` nulo) siguen
igual. El SQL actualiza por título y no borra, para no dejar colgadas las
tareas que apuntan a una versión; y la semilla de los listos de la Academia
(`cuestionarios-listos.js`) borra solo `where listo and material is null`.

### Las versiones en papel

`herramientas/libro-examen-versiones-pdf.js` pone las mismas 18 versiones en
papel, en `material/ponte-a-prueba/versiones/`:

- un cuadernillo por versión para el ALUMNO (`prueba-<p>-version-<x>.pdf`):
  las 10 posiciones con sus dos preguntas, los datos de quien la rinde y la
  hoja de respuestas. Sin soluciones: se reparte;
- `claves-de-correccion.pdf` para el PROFE: la respuesta y los puntos de cada
  opción de las 18 versiones, una por página para imprimir solo la que se va
  a usar, con la línea de la solución y su tabla de puntos a fuerza;
- `ponte-a-prueba-versiones-accesible.html`, lo mismo sin imágenes.

Las versiones salen de `cuestionarios()` de `libro-examen-cuestionarios.js`,
con las opciones en el MISMO orden que el cuestionario de la plataforma: una
clave sirve para el papel y para la pantalla, y un grupo puede hacer la A en
papel mientras otro hace la B en la plataforma. Los puntos de cada opción se
buscan en el banco por el texto de la opción, no por su lugar. La tabla de
fuerza es la del libro (`lib/libro-examen-comun.js`, que comparten los dos
PDF), pero de a 200 puntos: con diez posiciones no se puede prometer más.

Los cuadernillos no tienen tapa, así que la marca de agua va en todas las
páginas (`unir(null, …)` en `lib/pdf-armar.js`), y el logo crema va en su
recuadro azul: sobre el blanco del papel casi no se veía. En
`admin.html#materiales` cada versión tiene su «🖨️ PDF», y las claves y la
versión accesible van junto al libro. Lo revisa `verificar-libro-examen.js`
(que cada prueba tenga tres versiones de 10 sin repetir, que la buena sea la
solución y valga 5, y que estén los 19 PDF).

### Cada alumno, su orden

En `cuestionario-tarea.html` las preguntas y las opciones se ven en un orden
propio de cada alumno —y otro cada vez que lo vuelve a contestar—, sacado de
una semilla (renglón, alumno, intento). Así no se pasan las respuestas por letra
y repetirlo para practicar no es repetir de memoria. La base no se entera: se
manda cada respuesta con el número ORIGINAL de la opción, en el orden
original, y se califica igual que siempre. No se barajan las opciones de dos
(«Verdadero / Falso») ni las que dicen «todas», «ninguna», «ambas» o
«anterior», ni el orden de las preguntas si alguna habla de la «anterior»: ahí
el lugar es parte de la pregunta. Lo prueba `verificar-cuestionario-tarea.js`
(«Cada alumno, su orden»), contestando por el texto de la opción.

### Cómo se aplicó

La sesión que lo armó no podía escribir en la base, así que la migración y la
semilla se aplicaron en el editor SQL, en una transacción, anotando la
migración en `supabase_migrations.schema_migrations` con el mismo texto del
archivo: así el punto de restauración coincide igual que si la hubiera
aplicado el CLI.

## La sección Archivos

`admin.html#archivos` junta **todos** los PDF, Word, Excel, presentaciones y
versiones accesibles del sitio para que quien administra los abra o los baje
sin ir curso por curso. Va **una ficha por tipo** (pestañas PDF, Word, Excel,
Presentaciones y Versiones accesibles, con cuántos hay en cada una; se pasa de
una a otra también con las flechas del teclado).

Cada ficha es un **explorador**: a la izquierda las carpetas, agrupadas (los
libros, uno por carpeta; los cursos por nivel, en el orden del catálogo; lo
suelto al final), cada una con cuántos archivos trae; a la derecha lo de la
carpeta elegida, lección por lección, con «Bajar los N» de la carpeta. Primero
era una sola lista larguísima con todos los cursos plegados uno debajo de otro:
para llegar a una lección había que bajar, abrir y volver a bajar. En el
celular las carpetas son un selector. El buscador busca en **toda la ficha**
(no solo en la carpeta elegida) y muestra lo que coincide carpeta por carpeta;
elegir una carpeta lo limpia.

Los PDF (hoy 433) van en tres grupos: **Libros y material**
(`material/<carpeta>/`, un bloque por libro con el nombre de `LIBROS`), **Cursos** (`cursos/recursos/<curso>/`, por nivel y en
el orden del catálogo, cada curso plegado y adentro lección por lección con su
material de estudio y sus ejercicios) y **Otros PDF del sitio** (lo que queda
fuera, como `instrucciones-adaptadas.pdf`). Hay un buscador sin tildes, un
filtro por tipo y «Bajar los N» por grupo y por curso: baja uno detrás de otro,
porque el sitio no tiene con qué armar un .zip y la CSP no deja traer una
librería para eso. Con más de 40 se avisa antes, porque el navegador pregunta
si deja bajar varios.

Las presentaciones (`.pptx`, `.ppt`, `.odp`; hoy 203, una por lección) se
ordenan igual que los PDF —por nivel, curso y lección, leídas de la misma
página del curso— y solo se bajan.

Las versiones accesibles (`*-accesible.html`: el mismo material en una página
sin imágenes, para lector de pantalla; hoy 192) también se ordenan como los
PDF. Fuera de los cursos, su nombre sale del `<title>` de la página, sin el
«— versión accesible» final (en su ficha todas lo son). Llevan «Abrir» como
los PDF, y en la vista previa se ven en un marco con `sandbox` sin
`allow-scripts`: no traen programas y para leerlas no hacen falta.

Los Word (`.docx`, `.doc`, `.odt`) y los Excel (`.xlsx`, `.xlsm`, `.xls`,
`.ods`) son pocos y sueltos: van por carpeta, con el nombre de `CARPETAS` en el
generador, y solo se bajan (el navegador no los abre). Hoy hay dos Word (los
consentimientos de los JDN 2027) y **ningún Excel guardado**: los Excel de la
plataforma (el mes de cada profesor en Supervisión, los reportes) se arman en
el navegador con los datos del momento, así que no son archivos del sitio. La
ficha lo dice en vez de quedar vacía.

### La vista previa

Cada archivo trae **«👁 Vista previa»**: una ventana encima de la página
(`<dialog>` con `showModal()`, que encierra el foco; Esc la cierra y el foco
vuelve al botón), con «Anterior» y «Siguiente» para recorrer la carpeta (o lo
encontrado) sin cerrarla. La pinta `js/vista-previa.js`:

- **PDF**: el visor del navegador en un marco. Es del mismo sitio, así que
  `frame-src 'self'` y `X-Frame-Options: SAMEORIGIN` lo dejan; se probó en
  Chrome con las cabeceras de `_headers` puestas (también `object-src 'none'`)
  y el visor se muestra.
- **Presentación, Word y Excel**: son un `.zip` con XML adentro, y no se
  pueden mandar a un visor de afuera (Office en línea pide una dirección
  pública, y estos archivos están detrás del candado del worker). Se abren en
  el navegador mismo: un lector de `.zip` de cincuenta líneas con
  `DecompressionStream("deflate-raw")` —sin librerías: la CSP no deja traerlas— y
  `DOMParser` para el XML. La presentación se arma **diapositiva por
  diapositiva**, con su fondo, cada texto e imagen en su lugar y tamaño (las
  medidas en EMU pasadas a porcentajes, la letra en `cqw` para que escale con
  la lámina); el Word, con su texto, negritas, tablas e imágenes; el Excel, hoja
  por hoja (las primeras 300 filas). Lo viejo (`.ppt`, `.doc`, `.xls`) se dice y
  se ofrece bajar.
- Todo texto del archivo entra por `textContent`, y las imágenes van como
  `blob:` (que `img-src` permite) y se sueltan al cerrar.

- **La lista no se escribe a mano.** La arma `herramientas/archivos-catalogo.js`
  leyendo el disco y la deja en `data/archivos.json`; la pantalla
  (`js/admin-archivos.js`) solo la pinta. Un archivo nuevo entra **solo** al
  volver a correr el generador, y si nadie lo corre,
  `verificar-archivos-catalogo.js` falla en el CI y dice cuál falta: así se
  cumple «los nuevos aparecen solos» sin depender de que alguien se acuerde.
  El peso (`kb`) no se compara, porque volver a generar un archivo lo mueve
  unos bytes y no por eso la lista queda mal. Un tipo nuevo de archivo es una
  línea más en `TIPOS` y su ficha.
- **El nombre de cada lección sale de la página del curso**
  (`cursos/protegido/<curso>.html`): cada lección abre con un
  `<summary class="cursor-pointer…">`, y los PDF que enlaza hasta la siguiente
  son suyos. No se agrupa por el número del archivo porque no siempre coincide
  (en «El mapa de los finales» el examen de diagnóstico es `01-…-material` y
  `00-…-ejercicios`). Lo que la página no enlaza va en «Otros archivos del
  curso»; nunca se pierde.
- Los libros de `material/`, los PDF sueltos y los Word y Excel toman su nombre
  de `TITULOS` en el generador, y una serie (las 18 versiones de «Ponte a
  prueba») de un patrón en `PATRONES`. Uno nuevo sin entrada aparece igual, con el
  nombre del archivo, sin tildes: conviene sumarle su título ahí.
- Bajar no pasa por esta pantalla: `cursos/recursos/` y `material/` los sirve el
  worker, que deja pasar a quien administra; `documentos/` es público. Por eso esta lista puede ser un
  archivo público: dice qué existe, no da acceso.
- Lo comprueba `verificar-admin.js` (están todos, cada tipo en su ficha y en su
  lugar, buscar y filtrar esconden de verdad, «Bajar los N» baja N, las
  flechas pasan de ficha) y `verificar-archivos-catalogo.js` (la lista al día
  con el disco).
