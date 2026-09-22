# Ajedrez Integral — notas para Claude

Sitio estático (HTML + Tailwind compilado + JS sin framework) servido con
Cloudflare Workers Assets. `worker.js` solo sirve los archivos; `_headers` pone
las cabeceras de seguridad. Se edita el HTML/JS directamente; lo único que se
"construye" es el CSS (ver abajo) y lo generan los scripts de `herramientas/`.

## Flujo de git

- Trabajar siempre en la rama de la sesión, nunca commitear en `main`.
- **Cuando el cambio esté terminado y verificado: empujar, abrir el PR contra
  `main` y mergearlo (squash), sin preguntar.** Es la preferencia del dueño del
  repo. El título del squash lleva el `(#NN)` del PR, como el resto del
  historial.
- Si el PR de la rama ya se mergeó, la siguiente tarea arranca de `main` al día.

## Los servidores MCP van en `.mcp.json`, no en la máquina

`.mcp.json` (raíz) declara los servidores MCP del proyecto y **se commitea a
propósito**. Es la única de las tres formas de agregarlo que sobrevive: el
alcance `local` escribe en `~/.claude.json` y el `user` en la carpeta personal,
así que en una sesión de Claude Code en la web —donde el contenedor es de usar y
tirar— el servidor se pierde al terminar la sesión, sin dar ningún error: la
siguiente sesión simplemente no lo tiene. En el repositorio lo lee cualquier
sesión al arrancar, en cualquier máquina.

- **Ahí no va ninguna credencial.** La dirección de un servidor no es secreta;
  un token sí, y un token en el repositorio es un token publicado. Si un
  servidor pide autenticación, la clave entra por variable de entorno.
- Los servidores se conectan **al arrancar**, así que agregar uno no lo activa
  en la sesión que lo agregó: hace falta abrir otra (o reiniciar `claude` en la
  terminal). `/mcp` dice cuáles se conectaron de verdad.

## El dominio: `www` manda al dominio sin `www`

`worker.js` redirige `www.ajedrez-integral.com` a `ajedrez-integral.com` con un
301. **No es una preferencia de estilo.** Para el navegador son **dos orígenes
distintos**, así que si los dos sirvieran el sitio, quien entrara por `www`
tendría:

- otro `localStorage` — o sea otro progreso, otro tema y otra clase elegida;
- **otro service worker**, es decir una segunda app instalable con el estado en
  blanco;
- **otra suscripción de avisos push**, que no recibiría nada de la primera.

Y de paso: todos los `canonical`, el `sitemap.xml` y el Open Graph apuntan al
dominio sin `www`, así que servir las dos direcciones sería contenido duplicado.

- **Las dos correcciones del worker se resuelven en UNA respuesta.** Quien entra
  por `www` a una dirección vieja de "Los 100 finales" recibe un solo 301, ya
  con el dominio y la dirección arreglados. Encadenar dos redirecciones —una
  para el dominio y otra para la dirección— es el error natural si cada arreglo
  devuelve lo suyo, y le cuesta un viaje de más a quien entra.
- Lo único que hay que hacer **fuera del repositorio** es que el nombre
  exista. En Cloudflare son dos cosas, en este orden: un **CNAME `www` →
  `ajedrez-integral.com` con el proxy encendido** (la nube naranja; en "Solo
  DNS" el tráfico no pasa por Cloudflare y el worker nunca ve la petición) y
  una **ruta `www.ajedrez-integral.com/*`** apuntando al worker. La ruta
  necesita que el nombre ya exista en el DNS, por eso ese orden.
  El camino corto es "Añadir dominio" en la pestaña Dominios del worker, que
  hace las dos cosas de una; pero acá ese diálogo respondía "ninguna zona
  coincide con www.ajedrez-integral.com" aunque la zona estaba en la misma
  cuenta, así que queda escrito el de dos pasos, que no depende de esa
  búsqueda.
- **Al tocar `worker.js`, correr `node herramientas/verificar-worker.js`.** No
  necesita ni Cloudflare ni internet: el worker es una función que recibe una
  petición y devuelve una respuesta, así que se la llama y se mira qué contesta,
  con un `env.ASSETS` de mentira. Lo que se comprueba es lo que no se ve: que la
  redirección **conserve la dirección completa y sus parámetros**. Una que se
  coma lo que va después del dominio manda a la portada a quien venía a un
  curso, y de eso no se entera nadie salvo quien se quedó mirando la página que
  no era.

### El correo del dominio

El dominio **manda y recibe por caminos distintos**, y conviven porque viven en
nombres distintos. Confundirlos es lo único que puede romper esto:

- **Sale** por Resend, con sus registros en **`send.ajedrez-integral.com`** (el
  MX y el SPF) y la firma en `resend._domainkey`. Es por donde salen los
  informes a la casa y los avisos de cobro.
- **Entra** por Cloudflare Email Routing, con sus tres MX, su SPF y su DKIM
  (`cf2024-1._domainkey`) en el **dominio raíz**. No es un buzón: reenvía a una
  cuenta de correo de siempre.

**No se borran los registros de `send.` ni el `resend._domainkey`.** Sin ellos
el sitio deja de mandar los informes y los avisos, y —como casi todo lo de
correo— no da ningún error: simplemente dejan de llegar.

- **`informes@` es la dirección que más importa.** El sitio manda desde ahí a
  las familias, o sea que es correo que invita a contestar. Antes de esto el
  raíz no tenía ningún MX: la respuesta de una madre rebotaba y no se enteraba
  nadie, ni ella ni quien daba la clase.
- **El catch-all va en "Enviar a un correo", no en "Descartar".** "Descartar"
  no rechaza: acepta el correo y lo tira, así que quien escribió mal la
  dirección se queda convencido de que llegó. Es la misma clase de falla
  callada contra la que están escritas media docena de decisiones de este
  archivo.
- **Un solo SPF por nombre.** Si algún día manda otro servicio desde
  `@ajedrez-integral.com`, su `include:` va DENTRO del TXT que ya está, nunca
  en un segundo registro: con dos, los dos se invalidan y el correo empieza a
  caer en spam sin avisar.
- El reenvío solo trae correo. Para **responder** desde una dirección del
  dominio hace falta además un SMTP —Gmail → "Enviar como", con
  `smtp.resend.com` y una API key de Resend—, y eso es de cada persona, no del
  sitio.


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

## La clase en vivo: el material del profesor no es el de la clase

En `sesion.html` el profesor tiene delante cosas que la clase NO ve —el PDF que
está leyendo, la lección del curso que está dando— y una sola cosa que la clase
sí recibe: **la posición del tablero**. Esa es la línea, y las dos herramientas
que traen material a la clase la respetan igual.

- **La lección del curso es suya, no de la clase.** "📚 Curso" abre una lección
  de `cursos/protegido/<curso>.html` debajo del tablero **solo en su pantalla**
  (`abrirLeccionLocal`), como el PDF. Antes se sincronizaba por
  `game_state.shown_curso`/`shown_leccion` y la veían todos: el alumno tenía
  delante el temario entero de la lección, **con las respuestas de sus
  ejercicios**, mientras el profesor apenas iba por el primer diagrama. Las dos
  columnas quedaron **sin uso** (no se borraron de la tabla: quitarlas obligaría
  a una migración para nada) y lo único que se sigue haciendo con ellas es
  **dejarlas en null la primera vez** que se abre la clase, para que a nadie con
  la página anterior cargada le quede una lección abierta de antes.
- **Lo que sí viaja es cada posición, una por una.** Cada diagrama de la lección
  —y cada partida y cada ejercicio— trae un botón **"📥 Al tablero de la clase"**
  que transmite **la posición que el profesor está viendo en ese momento**, no
  la inicial del diagrama: `js/finales-100.js` y `js/curso-partidas.js` publican
  en `data-fen-actual` la posición de cada repintado (`publicarFen`), así que
  recorrer la línea y pulsar el botón manda la jugada 12 y no la 0. Mandar
  siempre la inicial no da ningún error — se transmite una posición, solo que la
  que no era.
  - El botón se pone con un `MutationObserver`, no recorriendo la lección una
    vez: los visores del curso se construyen **cuando se ven** (los `<details>`
    cerrados esperan a abrirse), así que el que aparezca después se quedaría sin
    él. Mismo patrón que `js/coordenadas-tablero.js`.
  - Hay posiciones de curso que son **ilustraciones y no partidas** (una del
    mapa de los finales tiene un peón y un solo rey, sin rey negro): no se
    pueden poner en un tablero en vivo, y el aviso de por qué va **dentro del
    panel de la lección**, no solo en la franja de estado de arriba — para
    llegar a ese botón hay que tener la lección delante, o sea la franja fuera
    de la pantalla.
- **Las tres puertas que ponen una posición en el tablero escriben por la misma
  función**, `aplicarPosicionEnClase()`: "✅ Aplicar posición" del editor, el
  botón de cada diagrama del curso y el de Táctica. Si cada una armara su propio
  `update`, la que se olvidara de limpiar las variantes o de quitarle el control
  al alumno dejaría la clase con un resto de la posición anterior — y eso no da
  ningún error, el tablero simplemente no se comporta igual según por dónde
  entró la posición. La validación va aparte, en `motivoPosicionInvalida()`: son
  las tres posiciones que chess.js carga sin quejarse y que **rompen a Stockfish
  para el resto de la sesión** (sin rey, con peones en la primera o la última
  fila, con el rey que no le toca mover en jaque).

### La videollamada: el tablero es la pizarra, no la clase

En `sesion.html` se ve la posición, pero la voz va por Meet, Zoom o Teams, y ese
enlace viajaba por WhatsApp antes de cada clase. El panel (`clases.html`) lleva
el botón **al lado de «Sesión en vivo»**, dentro del mismo grupo «Clase en vivo»
y no dentro de la tarjeta: un `<a>` dentro de otro `<a>` no es HTML válido y el
lector de pantalla anunciaría dos destinos donde se ve uno.

- **Se probó guardarlo como una columna de `profiles` y se descartó**, así que
  no se vuelve a intentar: `profiles.enlace_llamada` existió unas horas y se
  quitó (`quitar_profiles_enlace_llamada`). La RLS es por FILA y no por
  columna, y `profiles_select` le deja al alumno ver la fila entera de
  cualquiera de sus profesores — o sea que ahí el enlace le llega SIEMPRE y el
  «solo con la clase abierta» lo dibujaría únicamente la pantalla, que se salta
  desde la consola. En una tabla aparte esa condición ES la política.
- **El enlace es del PROFESOR, no de la clase**, y eso no es comodidad:
  `class_sessions` se crea con un botón o al mandarse una posición, sin pasar
  por ningún formulario, así que un `enlace_video` por clase se quedaría en
  null casi siempre y el botón no se desbloquearía nunca.
  No daría ningún error: un candado para siempre y nadie sabría por qué. Vive en
  `public.profesor_videollamada` (una fila por profesor y grupo) y se pone una vez, en
  **`configuracion.html` → «Videollamada de tus clases»**, que es la única
  pantalla que lo escribe.
- **Una sala POR GRUPO, y una general de respaldo.** Un profesor da clase en
  varias sedes y cada una tiene la suya: con un solo enlace, el de SJ le
  llegaba también a los de CENFO y entraban a la clase que no era. La tabla
  lleva una fila por `(profesor, grupo)` y el grupo vacío es «para todas mis
  clases». El reparto lo hace `mis_clases()`: la sala del grupo del alumno si
  su profesor puso una, y si no la general.
  - **Se reparte por `profiles.grupo` y no por subgrupo**, a propósito: el
    grupo es UNO por alumno, así que no hay dos salas que puedan
    disputárselo. Un subgrupo puede tener al mismo alumno en dos listas y
    habría que inventar un desempate — y el que perdiera mandaría a alguien a
    la llamada de otro grupo sin que nada fallara.
  - **El grupo se ELIGE de una lista, no se escribe**
    (`grupos_de_mis_alumnos()`, que además dice cuántos alumnos suyos hay en
    cada uno): un enlace guardado para «Cenfo» cuando sus alumnos están en
    «CENFO» no le llega a nadie nunca, y el profesor lo ve guardado y cree que
    está.
  - **Al alumno no le llega la lista de salas de su profesor**, solo la suya y
    la general: la política lo filtra por `mi_grupo()`. Con la de otro grupo a
    la vista podría colarse en una clase que no es la suya, y no haría falta
    ni saber SQL.
  - **Quitar una sala filtra por profesor Y grupo.** Con el filtro de menos se
    borrarían las de todas sus sedes de una vez, y la pantalla se vería igual
    de bien — por eso al quitar se vuelve a LEER en vez de tachar la fila en
    pantalla.
  - En el panel, quien da clase ve **una tarjeta por sala** con el grupo
    escrito, no un botón con menú: a las tres de la tarde hay que poder
    apretar «SJ» sin pensarlo. Con más de una, la tarjeta de «Sesión en vivo»
    deja de estirarse (`sm:items-start`), o quedaría media pantalla en blanco.
- **El candado lo hace cumplir la RLS, no la pantalla.** La política de select
  solo le entrega el enlace al alumno **mientras ese profesor tenga una clase
  abierta** (`es_mi_profesor(profesor_id) and clase_abierta_de(profesor_id)`).
  Por eso `mis_clases()` pudo ganar la columna `videollamada` sin repetir la
  condición: es `SECURITY INVOKER`, así que el left join pasa por esa política y
  sin clase la columna llega en null. La regla se escribe UNA vez y no se puede
  saltar desde la consola.
- **El enlace es texto ajeno que se va a ABRIR.** Un `javascript:` en un href se
  ejecuta con la sesión de quien lo toca — la misma regla que el nombre de un
  alumno en Informes. Se comprueba en `js/videollamada.js` con `new URL()` (solo
  `https:`, sin espacios) y otra vez en el CHECK de la tabla: la del navegador
  explica qué está mal, la de la base es la que no se puede saltar. Ese módulo
  está escrito una sola vez porque lo usan las dos pantallas.
- **Los cuatro estados dicen POR QUÉ.** «Se abre cuando tu profe empiece la
  clase» y «Hay clase, pero tu profe todavía no puso el enlace» no son lo mismo:
  el primero se arregla solo y el segundo no, y decir lo mismo dejaría al alumno
  esperando algo que hoy no va a pasar. Bloqueado va sin `href` y con
  `aria-disabled`, como los accesos apagados de la grilla: ni foco de teclado ni
  destino prometido. Y va con fondo gris y borde en vez de `opacity`, que sobre
  el blanco de la tarjeta de al lado dejaba la nota casi ilegible.
- **De quién es la llamada va escrito** («Con Karina Rojas»): con varios
  profesores el botón puede llevar a la clase de otro, y eso no se adivina.
  `claseConLlamada()` prefiere **la clase que el alumno está mirando** (la del
  selector) aunque no traiga enlace — mandarlo a la llamada de otro profesor
  porque esa sí lo traía es meterlo en la clase que no era, y se ve perfecto.
- **Al profesor no se le bloquea nada**: él entra a la llamada ANTES de que la
  clase exista, así que un candado ahí le cerraría la puerta por la que tiene
  que entrar primero. Sin sala puesta, su botón lleva a Configuración.
- **El botón se desbloquea con la clase de CUALQUIERA de sus profesores**, así
  que hay un canal de Realtime por profesor: el de siempre va filtrado por
  `boardOwnerId` y con dos profesores el candado se quedaría puesto hasta
  recargar, sin que nada fallara.

**Al tocar el botón, `js/videollamada.js` o la tarjeta de Configuración, correr
las dos**: `node herramientas/verificar-panel.js` (el botón, sus cuatro estados
y que un enlace que no se debe abrir no llegue a ningún href) y `node
herramientas/verificar-videollamada.js` (que la tarjeta sea de quien da clase,
que un enlace malo no viaje y que se guarde con el id de quien guarda). Las dos
con el sitio en localhost:8777 y playwright. Está probado que fallan de verdad:
quitando la comprobación del enlace saltan tres comprobaciones en una y ocho en
la otra.

Comprobado impersonando roles en SQL: la profesora guarda su sala y se le
quitan los espacios; su alumno **no ve ninguna fila** sin clase abierta y
`mis_clases()` le da `videollamada` en null; con la clase abierta la ve; su
update sobre la sala ajena cambia **0 filas**; otro profesor que no es su
profesor recibe **0 filas**; y `javascript:`, `http://` y un enlace con espacios
los rechaza el CHECK.

### La pantalla se ordena por QUIÉN VE CADA COSA, no por qué hace cada botón

`sesion.html` es la pantalla más cargada del sitio: catorce controles del
profesor entre la barra de arriba y las pestañas. Estaban puestos sin ningún
criterio —una rejilla de ocho botones idénticos y seis pestañas en el orden en
que se fueron escribiendo—, y eso **no da ningún error**: la pantalla se ve
bien, funciona, y quien la abre por primera vez no sabe por dónde empezar. Para
un entrenador nuevo, con la clase mirando, ese es el momento exacto en que se
pierde.

- **Los ocho botones van en dos grupos, y el rótulo dice QUIÉN LO VE**: «Tu
  material — solo lo ves tú» (Curso, Archivos, PDF, Armar posición) y «El
  tablero — lo ve toda la clase» (Reiniciar, Flechas, Ocultar, Guardar PGN). No
  es una agrupación estética: es **la misma línea que ordena toda la clase en
  vivo** —el material del profesor no es el de la clase— puesta donde de verdad
  hace falta saberla, que es antes de apretar. Sin ese rótulo son ocho botones
  iguales y ninguna pista de cuál se puede tocar con la clase delante.
- **Las pestañas van en el orden de la clase**, que es el orden en que se usan:
  qué voy a dar (Mi plan) → qué le pongo delante (Táctica) → qué le pido
  (Preguntar, Practicar) → a quién se lo estoy dando (Alumnos) → y al final lo
  que no se hace dando clase (Invitar).
- **La que abre sola la primera vez es «Mi plan»**, o sea `TEACHER_TABS[0]`:
  es lo único que contesta «¿qué voy a dar?» y estaba quinta. Abría
  «Controles», cuyo contenido era **un párrafo explicando dónde estaban los
  otros ocho botones** — una pantalla que necesita explicarse es una pantalla
  mal ordenada. Ese párrafo se fue con el rótulo que lo reemplaza, y la pestaña
  quedó en lo único que de verdad hacía: «➕ Invitar».
- «✏️ Editar» pasó a **«✏️ Armar posición»**: lo que hace no es editar nada que
  ya exista, es poner una posición en el tablero a mano.
- Después de la primera vez **se recuerda la última pestaña abierta**, como
  antes: el orden decide dónde se entra, no dónde se vuelve.

**Al tocar la barra de herramientas o las pestañas, correr `node
herramientas/verificar-sesion-orden.js`** (con el sitio en localhost:8777,
playwright y `npm install chess.js@0.10.3`). Reusa el Supabase de mentira de
`verificar-clase-registrada.js` —dos copias del mismo doble se irían separando a
la primera corrección—. Comprueba que los ocho botones estén en sus dos grupos y
**que no quede ninguno fuera** (un botón suelto es el principio de la rejilla sin
criterio de antes), que cada rótulo diga quién lo ve, que el orden de las
pestañas sea el de la clase y que la que abre sola sea «Mi plan», que cada
pestaña apunte a **su** panel (un `aria-controls` al de al lado manda a quien usa
lector de pantalla a un sitio que no era), que abrir una herramienta propia **no
escriba en `game_state`** —que es justo lo que promete el rótulo «solo lo ves
tú»— y que a la alumna no se le pinte nada de esto.

### La sesión en vivo se abre cuando el profesor la abre

El alumno entraba al tablero a cualquier hora. Veía la posición que hubiera
quedado de la clase anterior y **no tenía forma de saber si había clase o no**:
el tablero se ve exactamente igual un martes a las tres que un domingo. Y como
la clase se abría SOLA al conectarse él, asomarse un domingo le dejaba al
profesor una clase abierta en el registro —con su fecha y su hora— que además
crecía sola hasta que alguien la cerrara.

Ahora la clase existe porque el profesor la abrió, y hasta entonces la sesión
en vivo está cerrada para el alumno. Con eso «hay clase» pasa a significar algo.

- **El candado lo hace cumplir la base, no la pantalla.** `game_state_select` y
  `variant_nodes_select` le entregan la fila al alumno solo con
  `es_mi_profesor(owner_id) and clase_abierta_de(owner_id)` — la misma función
  que ya acotaba el enlace de la videollamada, aplicada a lo que de verdad ES
  la clase. Sin eso, bloquear la pantalla sería dibujar un candado que se salta
  desde la consola. Comprobado impersonando roles en SQL, cinco casos: sin
  clase el alumno recibe **0 filas** de las dos tablas, con clase abierta las
  recibe, la profesora ve SU tablero siempre —entra antes de abrir la clase, y
  un candado ahí le cerraría la puerta por la que tiene que entrar primero— y
  otro profesor sigue sin verlo.
- **La presencia dejó de abrir clases, y con ella se fue `alumnosAlCerrar`.**
  Era el primer disparador —«hay alguien del otro lado»— y ya no puede
  dispararse: sin clase abierta el alumno no llega a conectarse. Lo único que
  seguía alcanzándolo era el rastro de la clase recién cerrada, que es
  justamente lo que aquella variable existía para atajar. Quedan las **dos
  puertas deliberadas del profesor**: mandar una posición
  (`aplicarPosicionEnClase()`) y el botón «Abrir la clase».
  - Eso **no deja clases sin registrar, al revés**: antes el registro dependía
    de que entrara alguien; ahora sin abrirla no hay clase que dar, así que
    queda garantizado por construcción.
  - La comprobación de «después de cerrar, ningún aviso de presencia la vuelve
    a abrir» **se queda** aunque hoy no haya con qué: el día que alguien vuelva
    a enganchar un disparador ahí, salta en la prueba y no al día siguiente con
    la clase de hoy sin registrar.
- **La franja del profesor dice la CONSECUENCIA, no el mecanismo**: «⚪ La clase
  todavía no está abierta: tus alumnos no pueden entrar y no se está
  registrando nada». Un «todavía no hay clase abierta» a secas no le dice a un
  entrenador nuevo que la clase que está por dar no la va a ver nadie.
- **Al alumno se le dice quién tiene que abrirla, y la página se abre sola.**
  `#sin-clase` reemplaza a `#app` con el nombre de su profe («Karina Rojas
  todavía no ha abierto la clase»), el selector de clase y la vuelta al panel.
  Un canal de Realtime **por profesor** —no solo por el que está mirando, que
  es el error fácil: la clase la puede abrir cualquiera de ellos— recarga en
  cuanto la suya abre, y si abre la de OTRO se lo dice en vez de dejarlo
  esperando a quien hoy no va a abrir.
  - **Recargar y no montar a mano** es la misma decisión que cambiar de clase:
    todo cuelga de `boardOwnerId` y montarlo en caliente dejaría la mitad de
    las suscripciones sin hacer.
- **En el panel, la tarjeta «Sesión en vivo» lleva el mismo candado que el
  botón de la videollamada que va a su lado**, y por la misma razón: sin clase
  abierta entrar solo le pintaría una pantalla vacía. Va bloqueada con la pinta
  de `VLL_APAGADO` —fondo gris y borde, no `opacity`, que sobre el blanco de la
  tarjeta deja la nota ilegible— y **sin `href`**: ni foco de teclado ni
  destino prometido. Se destapa sola con el aviso de Realtime, sin recargar.
  - Se abre si **cualquiera** de sus profesores tiene clase, igual que el botón
    de la videollamada. Si el que entra no es el que está mirando,
    `sesion.html` se lo dice y le ofrece el selector: es un camino coherente,
    no una promesa rota.
  - La tarjeta vive dentro de un envoltorio `#sesion-wrap` con **`contents`**,
    para poder repintarla sola sin cerrar nada de lo que haya abierto debajo.
    `contents` la deja siendo la celda del grid: sin eso, el envoltorio se
    comería el `sm:items-start` y la tarjeta dejaría de estirarse.

**Al tocar esto, correr las dos**: `node herramientas/verificar-clase-registrada.js`
y `node herramientas/verificar-panel.js`. La primera comprueba que conectarse un
alumno **no abre ninguna clase** (ni uno ni dos), que el botón sí, y que la
alumna sin clase abierta **no monta la sesión**, ve el aviso de verdad (con
`checkVisibility()`, no la clase) con el nombre de quien tiene que abrirla, y no
le pide el tablero a la base. La segunda, que la tarjeta esté bloqueada sin
enlace, que **no quede ningún `a[href=sesion.html]` en la grilla** —un enlace
invisible pero presente sigue siendo una parada de tabulador— y que **se destape
sola** al abrirse la clase. Está probado que fallan de verdad: dejando entrar al
alumno saltan 3 comprobaciones en una, volviendo a poner el disparador de
presencia otras 3, y quitando el candado de la tarjeta 3 en la otra.

- **Los dobles tuvieron que aprender dos cosas, y las dos daban verde sobre una
  página rota.** `mis_clases()` devuelve la columna `profesor`, no
  `profesor_nombre` —con el nombre equivocado la pantalla de espera dice «Tu
  profe» y la prueba lo da por bueno— y `clase_abierta` sale de las MISMAS filas
  de `class_sessions` que sirve el doble, como la calcula la base: dejarla fija
  en `false` le cierra al alumno una clase que sí está abierta, y en `true` da
  por buena una página sin candado. Y `verificar-sesion-curso.js` necesitó
  `upsert()`: desde que hay clase abierta la alumna marca su asistencia sola, y
  sin ese método la página muere con un TypeError que la prueba cuenta como
  fallo suyo — era el doble el que estaba incompleto.

### La clase se registra sola, porque el botón vivía en la página que no era

Todo lo que el sitio sabe de una clase —la asistencia, los minutos en clase, el
«asistió a 4 de 5» del informe a la casa, el reporte de actividades y el «clases
este mes» del panel del profesor— cuelga de que exista una fila **abierta** en
`class_sessions`. Y esa fila la abría un botón que vive en **`clases.html`**,
mientras que la clase se da en **`sesion.html`**.

Al tablero se entra **directo desde el grid del panel**, sin pasar por esa
franja — que además solo aparece cuando tiene algo que decir. O sea: un
entrenador nuevo da su clase entera, con la pizarra, las preguntas y los
alumnos conectados, y **no queda registrada ninguna**. No da ningún error: esa
clase simplemente no existió, y eso no se puede reconstruir después.

- **La clase se abre con un acto deliberado del profesor, no al entrar**: el
  botón «Abrir la clase» o **transmitir una posición**
  (`aplicarPosicionEnClase()`, por donde pasan las tres puertas). Abrirla con
  solo entrar llenaría el registro de clases de dos minutos que nadie dio cada
  vez que se asoma a preparar algo, y los informes contarían de más. Hubo un
  tercer disparador —que se conectara un alumno— y se fue: ver «La sesión en
  vivo se abre cuando el profesor la abre».
- **Se engancha DESPUÉS de que la posición se haya transmitido**, no antes:
  abrir la clase por un intento que falló —una posición que la validación
  rechaza— dejaría registrada una clase que no se dio.
- **Que no se abran dos lo impide un índice único parcial**, no la bandera del
  navegador: `class_sessions_una_abierta_por_profesor` sobre `(created_by) where
  ended_at is null`. Los dos disparadores pueden caer juntos, y dos pestañas del
  mismo profesor, peor. Con dos filas abiertas la asistencia se reparte entre
  las dos y **cada informe cuenta la mitad**, sin que nada falle. Es el mismo
  patrón que el UNIQUE de `examen_respuestas` y el de `avisos_cobro`: lo que no
  puede pasar dos veces lo garantiza un índice, no un `if` que dos pestañas se
  saltan. El insert atiende el `23505` y se queda con la que ya hay, porque eso
  no es un fallo — es el índice haciendo su trabajo.
- **La franja de `sesion.html` dice con todas las letras si se está registrando
  o no**, no con un color: «🔴 Clase en curso: se está registrando la asistencia
  y el tiempo de tus alumnos» o «⚪ La clase todavía no está abierta: tus
  alumnos no pueden entrar y no se está registrando nada». Un punto gris no le
  dice a un entrenador nuevo que la asistencia se está perdiendo.
- **Cerrar pide el nombre y la nota ahí mismo**, en dos toques: el primero
  destapa los campos, el segundo cierra. Así no se cierra de un clic accidental
  en medio de la clase, y se recoge lo único que hace falta para que el registro
  sirva después — mandarlo al panel a escribirlo es mandarlo a otra página justo
  cuando terminó y se va.
- **El botón del panel se queda**, como atajo para abrirla ANTES de entrar, pero
  ahora dice que no hace falta apretarlo. Dos botones que parecen obligatorios
  confunden más que uno que se explica.
- `markAttendance()` y `startPresenceLog()` se disparan con el INSERT que llega
  por Realtime, así que **la clase se puede abrir en cualquier momento** — pero
  hoy el alumno solo entra con la clase ya abierta, así que ese camino es el de
  quien está dentro cuando el profesor la cierra y la vuelve a abrir.

#### Cerrar la clase tiene que SIGNIFICAR cerrarla

El disparador de "hay alguien del otro lado" se vuelve a evaluar en **cada** aviso
de presencia, y los alumnos no cierran su pestaña en el mismo segundo en que el
profesor confirma el cierre. Así que el aviso siguiente encontraba alumnos
conectados y abría una clase NUEVA, uno o dos minutos después de la que se
acababa de cerrar. La franja volvía sola a verde, y el profesor —que ya terminó y
se va— dejaba esa fila abierta para siempre.

**Lo caro viene al día siguiente, y es lo que se ve como "la clase no queda
registrada":** el índice `class_sessions_una_abierta_por_profesor` impide una
segunda fila abierta, así que la clase de mañana no abre ninguna — se cuelga de la
fantasma que quedó, con su fecha y su hora de hace un día. En el registro no
aparece ninguna clase nueva y la duración de la vieja crece sola. Ningún error en
ninguna parte.

- **Se arregló primero guardando quiénes estaban conectados al cerrar**
  (`alumnosAlCerrar`), para que el aviso siguiente no contara el rastro de la
  clase recién cerrada. Esa variable **ya no existe**: al quitar el disparador
  de presencia (ver «La sesión en vivo se abre cuando el profesor la abre») no
  quedó nada que pudiera reabrirla sin querer, y las dos puertas que quedan
  —mandar una posición, el botón «Abrir la clase»— son actos suyos.
- Vale igual **si la cerró desde el panel o desde otra pestaña**: lo que llega por
  Realtime es un cierre igual de deliberado, y la franja de acá tiene que decir
  la verdad igual.
- **El cierre se pide de vuelta con `.select()`**, y se mira si volvió alguna fila.
  Sin eso, un update que no toca ninguna fila —el id quedó viejo porque la cerraron
  desde otro lado— devuelve `error: null` y la pantalla decía "cerrada" con el
  título y la nota tirados a la basura: justo lo que el registro necesita para
  servir después. Ahora se dice y se manda a escribirlos al registro del panel.
- Y cuando sí se cerró, **se dice con todas las letras y con su nombre** («✅ Clase
  cerrada y guardada en el registro como "Finales de rey y peón"»). Cerrar es el
  momento en que uno quiere saber que quedó guardado.

**Al tocar esto, correr `node herramientas/verificar-clase-registrada.js`** (con
el sitio en localhost:8777, playwright y `npm install chess.js@0.10.3`).
Comprueba que entrar solo **no invente ninguna clase**, que conectarse un
alumno tampoco y que el botón sí la abra y a nombre de quien la da, que mandar
una posición también la abra y que una **rechazada** no, que un segundo aviso
de presencia no abra otra, que
cerrar mande el título, la nota y la hora **sobre la clase que estaba abierta**,
que después de cerrar **ningún aviso de presencia la vuelva a abrir** —ni el del
mismo alumno que ya estaba ni uno que entra después—, y que a la alumna no se le
pinte la franja pero su asistencia sí se marque sola. Está probado que falla de
verdad: con el disparador de presencia de antes saltan tres comprobaciones.
Su Supabase de mentira **apunta el filtro al RESOLVER y no en el `update()`**:
`.update(x).eq("id", y)` encadena, así que uno que lo capturara antes daría por
bueno un cierre sobre la clase que no era. Su `delete()` hace lo mismo y además
**borra de verdad de la tabla**, para que una consulta posterior no encuentre lo
que ya no existe. Lo reusan `verificar-sesion-orden.js` y
`verificar-chat-clase.js`, y acepta **filas de arranque** para sembrar una tabla
(los mensajes de una conversación, por ejemplo).

### La clase presencial también se registra, y es una `class_sessions` MÁS

La clase del aula no existía para el sitio. El profesor daba su clase
presencial, y esa clase no salía en Informes, no contaba para el «asistió a 4 de
5» que llega a la casa, no entraba al reporte de actividades y no sumaba al
«clases este mes» de su panel. No daba ningún error: simplemente, para la
plataforma, el alumno que solo va presencial no entrenaba nunca.

`asistencia.html` (tarjeta **«✅ Asistencia presencial»** en Herramientas, al
lado de Planes de clase) es donde se pasa lista: el día, la hora, cuánto duró,
qué se trabajó y quiénes llegaron.

**Lo que se guarda es una `class_sessions` normal con `modalidad =
'presencial'`, no una tabla nueva.** Esa es la decisión de fondo: todo lo que el
sitio sabe de una clase cuelga de `class_sessions` + `class_attendance`, así que
con una tabla aparte habría que tocar las cuatro funciones que las leen
—`informes_resumen_alumnos()`, `informe_de_alumno()`, `reporte_actividades()` y
`panel_profesor()`— y las cuatro se irían separando a la primera corrección.
Siendo la misma fila, la ficha **entra sola**: no hay ni una línea que «lleve»
la asistencia presencial a los informes.

- **La ficha nace CERRADA** (`ended_at` puesto), y eso hace dos cosas de una: no
  choca con el índice `class_sessions_una_abierta_por_profesor` —o sea que
  llenar la ficha del martes no le impide abrir la clase en vivo de hoy— y no es
  una clase «abierta» para ningún alumno.
- **El aviso push tuvo que aprender a callarse.** `class_sessions_avisa_push`
  era un `AFTER INSERT` a secas, así que guardar la ficha de ayer le habría
  mandado a todos sus alumnos «Empezó la clase · Entra cuando puedas» con enlace
  a `/sesion.html`, a un tablero cerrado y por una clase que ya terminó. Lleva
  ahora su `WHEN (new.modalidad = 'en_linea' and new.ended_at is null)` — la
  misma lección que dejó `avisar_examen_reabierto`.
- **Pasar lista es del profesor, y eso hacía falta abrirlo.**
  `class_attendance_insert_own` exige `auth.uid() = student_id`: la asistencia
  en vivo la marca el alumno al conectarse. Las políticas nuevas
  (`class_attendance_insert/update/delete_profesor`) van **acotadas a
  `modalidad = 'presencial'`** a propósito: en una clase en vivo la asistencia la
  registra el sistema, y dejar escribirla a mano ahí sería poder inventar que
  alguien entró a un tablero al que nunca entró. Lo que se abre es la ficha, no
  la asistencia entera. Y el **delete** hace falta tanto como el insert: marcar
  a quien no fue y no poder desmarcarlo le deja una asistencia de más en el
  informe que llega a su casa.
- **Los minutos entran por `class_presence_log`**, un tramo por asistente, como
  cualquier latido de la clase en vivo. Así las tres funciones que cuentan
  minutos los suman **sin tocarlas**, y `minutos_por_tramos()` los une con los
  demás, de modo que una presencial que se solape con una en línea no se cuenta
  dos veces. Sin ese tramo, un alumno que solo va presencial saldría con «5
  clases, 0 minutos» y eso no da ningún error.
  - Eso obligó a la única excepción de `proteger_tiempos_de_presencia()`, que
    existe para que un alumno no se infle los minutos desde la consola: en la
    ficha el tramo **no lo mide un latido, lo DECLARA el profesor**, así que las
    horas tienen que pasar. **La excepción se lee de la FILA** —ser el creador
    de esa clase presencial— y no de una marca local como
    `ajedrez.contando_invitaciones`: una marca hay que acordarse de ponerla y el
    alumno podría poner la suya, mientras que «ser el creador» no se puede
    falsificar. Para el alumno el trigger sigue exactamente igual de cerrado.
- **Guardar es UNA llamada**, `guardar_clase_presencial()`, `SECURITY INVOKER`
  como `crear_tarea()`: partido en dos —la clase y después la lista— si la
  segunda mitad falla queda una clase con cero asistentes, que en el reporte se
  lee como una clase a la que no fue nadie. Deja la lista **exactamente como se
  mandó** (la regla de `set_teachers` y `equipo_set_alumnos`): pasar lista se
  corrige, y una lista que solo suma no se puede corregir.
  - Su `update` filtra por `modalidad = 'presencial'`: sin eso, esta pantalla
    editaría también una clase EN VIVO —moviéndole las horas y borrándole el
    título— desde un formulario que no sabe nada de ella.
  - Rechaza una clase **del futuro** (una ficha se llena después de darla; el
    día de margen es para el huso, no para agendar) y una duración fuera de 5 a
    600 minutos, que no es una regla de negocio sino un error de dedo: 6000
    minutos le meterían cuatro días de «tiempo en clase» a cada asistente, y eso
    se ve perfecto en el informe que llega a su casa.

Comprobado impersonando roles en SQL, 12 casos: la ficha guarda sus dos
asistentes con su tramo de 60 minutos de verdad, desmarcar a uno lo quita de la
asistencia **y de los minutos**, la clase futura y la de 6000 minutos se
rechazan, la ficha queda presencial y cerrada, otro profesor no la edita, el
alumno que intenta insertarse un tramo de veinte años se queda con **0 minutos**
—el trigger le sigue poniendo `now()`— y no puede crear ninguna clase.

#### Qué se hizo en la clase, y cómo lo dice el informe

El campo «Qué se hizo en esta clase» es `class_sessions.notes`, el mismo que ya
pinta el reporte de actividades dentro de «Lo que se trabajó». Es opcional, y la
pantalla dice con todas las letras dónde sale y quién lo lee: nadie más que quien
prepara el informe — ni el alumno ni su casa.

**El reporte dice CUÁLES clases fueron presenciales**, y eso no es cosmético: sin
la modalidad, las del aula entran contadas dentro de «N clases en vivo», que es
falso, y quien lee el informe no tiene forma de separarlas. Lo dice en tres
lugares —el párrafo del resumen, la columna **«Dónde»** de la tabla de clases y
una columna por alumno—, siempre **escrito** y nunca con un color o un icono:
este informe se imprime y lo lee alguien que no sabe nada de la plataforma.

- El reparto solo se dice **cuando hay de las dos**: «y ninguna presencial» es
  ruido en todas las visitas menos una. Con un solo tipo dice «todas
  presenciales» o «todas en la plataforma».
- La columna «De ellas presenciales» **no se pinta si no hay ninguna**: una
  columna entera de ceros ocupa ancho y no dice nada.
- Y si los totales llegaran **sin partir** (una versión vieja de
  `reporte_actividades()`), se cuentan todas como de la plataforma, que es lo que
  eran antes de existir la ficha, en vez de decir «0 y 0».
- La nota al pie de la tabla de tiempos dice de dónde salen los minutos
  presenciales: la duración que anotó quien dio la clase, no una medición de la
  plataforma. Prometer que se midieron sería prometer algo que no pasó.

**Al tocar `asistencia.html`, `js/reporte-armar.js` o la tabla
`class_sessions`, correr `node herramientas/verificar-asistencia.js`** (con el
sitio en localhost:8777 y playwright). Todo lo que se rompe acá se rompe
callado, así que se mira desde afuera: que **la hora local viaje como el instante
que fue** —el verificador fija la zona en `America/Costa_Rica` y comprueba que
las 15:00 salgan como las 21:00 UTC; mandar los dos campos como si fueran UTC
deja la clase fechada el día siguiente sin dar ningún error—, que el buscador
**esconda las casillas en vez de sacarlas del DOM** (con media lista fuera, el
selector de subgrupos dejaría marcada a gente que no fue), que «los del martes»
marque a los suyos y desmarque al resto, que guardar sin nadie marcado pida un
segundo toque, que **corregir mande la lista completa y el id de ESA ficha**, que
la clase EN VIVO del mismo profesor no se ofrezca acá, que borrar filtre por su
id, que a la alumna no se le pinte nada y que la página **se vea** (sin CSS
impreso como texto y en oscuro cuando el tema está en oscuro). Está probado que
falla de verdad: mandando la fecha como UTC salta 1, sacando las casillas del DOM
saltan 2 y quitando la columna «Dónde» saltan 2.

- **Su doble de Supabase apunta los filtros en el RESOLVER**, no dentro del
  `delete()`: `.delete().eq("id", x)` encadena, así que uno que los capturara
  antes daría por bueno un borrado sobre la ficha que no era — la misma trampa
  que ya documentó `verificar-clase-registrada.js`.
- Y sus filas llevan `modalidad` y `created_by`, que es por donde la página las
  pide: un doble sin esas columnas daría verde sobre una página que se baja las
  clases de todo el mundo.
- **`js/subgrupos-marcar.js` va SIN `defer`**, como en Tareas y Exámenes: con él
  corre después de parsear el HTML, o sea después del script del cuerpo que lo
  llama, y el selector no se monta — sin dar ningún error. Es la misma carrera
  que ya documentaron `js/notificaciones.js` y `js/adaptive-mode.js`.
- Ese módulo **marca y desmarca las casillas**, y quien lleva la cuenta en esta
  pantalla es un `Set`: hay que volver a leerlas escuchando su selector y no su
  `alMarcar`, porque ese solo avisa al elegir un subgrupo — al volver a «— un
  subgrupo —» desmarca todo y no avisa, y el `Set` se quedaría lleno de gente
  que ya no está marcada.

### Vaciar el chat: la base siempre lo permitió, lo que fallaba era la pantalla

«Vaciar esta conversación» parecía no funcionar: el profesor apretaba, confirmaba,
y los mensajes seguían ahí. La RLS no tenía nada que ver —`class_chat_messages_delete`
deja borrar el hilo entero del alumno a quien es su profesor, y el borrado SÍ
ocurría—. Lo que no ocurría era el repintado.

- **El DELETE llegaba sin `student_id`.** Con la replica identity por omisión, el
  payload de un borrado solo trae la clave primaria, y `subscribeChat()` decide a
  qué conversación pertenece cada cambio justamente por esa columna. El evento no
  coincidía con ningún hilo, no se recargaba nada, y la lectura natural de eso es
  "no me deja vaciarlos". Al alumno, peor: le quedaban a la vista mensajes que ya
  no existían hasta que recargara. Se arregló con `replica identity full` sobre
  `class_chat_messages` —9 filas de 500 caracteres: replicar la fila entera acá no
  cuesta nada—, que es lo que vacía **la pantalla del alumno**.
- **Y la pantalla de quien apretó el botón no espera ese aviso**: recarga ahí mismo
  y lo dice. Depender de que un aviso dé la vuelta por la red para confirmar algo
  que uno acaba de hacer es la misma apuesta que ya se perdió una vez.
- El aviso de confirmación dice que **se borran también los mensajes del alumno**:
  es lo que pasa, y un «vaciar» que dejara los suyos no vaciaría nada.

**Al tocar el chat, correr `node herramientas/verificar-chat-clase.js`** (con el
sitio en localhost:8777, playwright y `npm install chess.js@0.10.3`). Su doble
**no dispara ningún aviso de Realtime**, igual que la base cuando el DELETE va sin
su fila: si la página volviera a depender del aviso, la prueba falla. Comprueba
que el borrado vaya filtrado por `student_id` y no por `sender_id` —con el filtro
equivocado quedaría media conversación—, que sea **un solo filtro**, que la lista
quede vacía en pantalla, y que a la alumna no se le pinte ni el botón de vaciar ni
el selector de con quién hablar. Está probado que falla de verdad: sin el
`loadChatMessages()` del final, los tres mensajes siguen en pantalla.

### Los dos tableros del alumno llevan coordenadas

`question-board` (la pregunta) y `practice-board` (la práctica contra el motor) son
overlays a pantalla completa con un tablero tan grande como el principal, y eran
los únicos tableros del sitio sin las coordenadas de afuera. Ahí el alumno está
**solo**: el profesor no le está señalando la casilla y no tiene al lado el cuadro
de comandos. Y en el resto del sitio —Mates, Ejercicios por tema, 4×4, el
diagnóstico— ya las tiene siempre, así que su ausencia justo acá se nota.

- Es el mismo `externalCoords` del tablero principal (`_setupExternalCoords` de
  `js/clases-board.js`), no un dibujo aparte. Se giran solas con el tablero, que es
  lo que hace uno de verdad cuando al alumno le tocan las negras.
- **El tope de ancho se lee tal cual esté escrito, no como un número de píxeles.**
  El patrón entendía solo `max-w-[560px]`, que es lo que traía `#chessboard`; los
  dos overlays usan `max-w-[min(92vw,560px)]` y se habrían quedado sin tope — el
  tablero en sus 560 px y la fila de letras estirada a todo el ancho de la tarjeta,
  o sea **las coordenadas señalando la columna que no era**, que se ve igual de
  bien y es peor que no tenerlas.
- Las **miniaturas de supervisión** del profesor siguen sin ellas a propósito: son
  de mirar de lejos y a ese tamaño las letras no se leerían.
- **El tope de ancho se muda al envoltorio como CLASE, no como estilo en línea**, y
  esa es la segunda vez que este mismo defecto aparece por otra puerta. Desde que
  las coordenadas van afuera, **quien decide cuánto mide el tablero es el
  envoltorio** —el tablero es `w-full` dentro de él— y la fila de letras se reparte
  ese mismo ancho: un tope que se quede pegado al tablero lo encoge sin encoger la
  fila.
  - Lo que lo rompió fue la regla `@media (max-height: 800px)` de `css/styles.css`,
    la que achica el tablero para que la clase en vivo quepa sin scroll en un
    laptop de 13". Está escrita con **dos ids** justamente para ganarle a la
    utilidad `max-w-[…]` de Tailwind… pero le seguía aplicando el tope **al
    tablero**, que ya no era quien mandaba: en una pantalla de 800 px o menos el
    tablero se quedaba en 420 px dentro de un envoltorio de 539 y las **ocho letras
    quedaban repartidas sobre 539** — o sea las coordenadas señalando la columna
    que no era, en **los tres tableros de la clase** (el de la pizarra, el de la
    pregunta y el de la práctica). Ningún error, y solo en pantallas bajas: en un
    monitor alto se veía perfecto.
  - Y el estilo en línea era lo que lo hacía imposible de arreglar desde el CSS:
    **un estilo en línea le gana a cualquier hoja**, así que mientras el envoltorio
    llevara `style="max-width:…"` ninguna regla podía alcanzarlo. Mudando la clase,
    el envoltorio queda sujeto a las mismas reglas que el tablero y las dos medidas
    vuelven a salir del mismo lugar.
  - El selector del envoltorio va **dentro de la misma regla** que los tres
    tableros, para que el número siga escrito una sola vez.
- **Se mide en DOS alturas de ventana, y por eso son dos.** Todo lo que cuelgue de
  `@media (max-height: 800px)` existe solo por debajo de esa altura: con un solo
  tamaño se mira la mitad de los casos, y fue justo por ahí que esto se rompió sin
  que nadie se enterara. `verificar-sesion-curso.js` redimensiona y vuelve a medir,
  lo que de paso comprueba que el tope siga saliendo del CSS y no de un número de
  píxeles calculado una vez al montar. **Y mide también `#chessboard`**, el tercero
  que se rotula por fuera y el único que ve toda la clase: no lo miraba ninguna
  prueba, así que se desalineó con los otros dos en silencio. Está probado que
  falla de verdad: dejando el tope pegado al tablero saltan 5 comprobaciones, y
  volviendo a mudarlo como estilo en línea, las mismas 5.

### Las miniaturas de la práctica: a 16 px no se distingue una pieza

Mientras la clase practica contra el motor, el profesor ve una miniatura por alumno
debajo de su tablero. Es la pantalla con la que decide a quién ayudar, y estaba
ilegible de dos maneras a la vez — las dos calladas, porque las tarjetas se pintan
igual y con la posición correcta:

- **Las tarjetas topaban en 160 px**, o sea casillas de 16 px y piezas de 10. El tope
  fijo es una decisión que se queda (con `1/N` del ancho, dos alumnos se veían
  enormes y, peor, **todos cambiaban de tamaño en cuanto se conectaba uno más**,
  justo mientras se los está mirando), pero el número estaba mal: **190 px** es lo
  más chico donde la pieza se reconoce de un vistazo y siguen entrando tres por fila.
- **La pieza se dibujaba con el glifo Unicode.** El de las blancas (♔♕♖) es un
  contorno hueco, así que para no confundirse con las negras se apoya en un
  `text-shadow` de 1 px en las cuatro direcciones (ver `css/styles.css`). A 10 px ese
  contorno es el 10 % del glifo: le rellena los huecos y **las blancas se ven tan
  oscuras como las negras**. Agrandar la tarjeta no lo arregla — está medido: a 220 px
  con glifo las dos filas de torres siguen costando.

**En `compact` manda el set dibujado** (`js/chess-piece-svg.js`), pase lo que pase con
la preferencia de pieza y con el tema divertido: tiene relleno sólido, así que se
distingue en cualquier tamaño, y un emoji a 20 px tampoco dice qué pieza es. **No le
cambia el tablero a nadie**: el suyo sigue con lo que eligió en Configuración — `compact`
lo usan solo estas miniaturas. Y el factor de tamaño dejó de ser uno solo: 0,62 es la
fracción que pinta un glifo de texto dentro de su em, pero la pieza dibujada mide 1 em
exacto, así que con 0,62 quedaba flotando en el medio desperdiciando un tercio de la
casilla — va en 0,82.

Dos cosas más de la misma tarjeta, que se rompían igual de calladas:

- **La barra de evaluación era blanca sobre una tarjeta blanca.** Lo blanco es la
  ventaja de las blancas, como en cualquier tablero, pero sin borde esa mitad no se
  veía y la barra se leía al revés — se veía «lo que falta». Lleva borde, y su
  `aria-label` dice en palabras quién va mejor: era un `role="img"` cuyo nombre fijo
  («Barra de evaluación») no decía nada de la partida.
- **De qué color juega el alumno iba pegado al final del nombre**, que se trunca. Con
  un nombre largo —el caso de todos los días— se perdía siempre, y es justo el dato
  que dice cómo leer el tablero, porque se gira según su color. Va afuera y con
  `shrink-0`; el nombre se encoge con `min-w-0`.

`verificar-sesion-curso.js` lo comprueba midiendo la pantalla: qué se dibujó de
verdad (no la preferencia guardada), el alto real de la pieza contra el de su casilla,
que la barra se separe del fondo y que el color se siga viendo con un nombre largo.
Está probado que falla de verdad: con el código de antes saltan seis comprobaciones,
la primera diciendo «pintó ♜, que a esta escala no se distingue».

`verificar-sesion-curso.js` lo comprueba midiendo en el navegador: que cada letra
caiga sobre su columna y cada número sobre su fila —contra las casillas de verdad,
por su `data-square`, no contra lo que diga la página—, que las etiquetas se giren
con el tablero y que el tablero siga cuadrado. Su doble acepta **filas de
arranque** para sembrar una pregunta abierta o una ronda de práctica: sin eso los
dos overlays del alumno no se pueden ni ver.

### Táctica por tema: la vista previa y su botón

- **El tablero de la vista previa lo dibuja el mismo diagrama de ejemplo que los
  artículos** (`js/article-example-board.js`, que ahora exporta
  `window.ExampleBoard`). Estaba copiado dentro de `sesion.html`, y la copia ya
  se había separado del original por donde se separan siempre: dibujaba las
  piezas con el `font-size` fijo de 24 px del CSS —pensado para un tablero
  grande— dentro de casillas de 22 px, así que **la pieza era más grande que su
  casilla**; y no entendía el juego de piezas ilustrado, así que a quien lo
  tuviera elegido le salían aquí las de texto. El original **mide la casilla ya
  renderizada** y ajusta la pieza a ella. La vista previa dice además de quién
  es la jugada, que antes había que deducir de la posición.
- **"📥 Al tablero" y "❓ Preguntar" no son lo mismo, por eso son dos botones.**
  El primero transmite solo la posición, para explicarla; el segundo además abre
  la pregunta. Con un solo botón había que preguntar para poder enseñar el
  ejercicio, y entonces el alumno ya está contestando mientras se explica.
- **El rótulo de cada ejercicio va ARRIBA y sus botones DEBAJO**, como en el
  panel de Archivos y en el del plan de clase. Estaban en una misma fila, con el
  grupo de botones en `shrink-0`, y ahí está la trampa: **`shrink-0` y
  `flex-wrap` se contradicen** — el grupo crece hasta su ancho de contenido en
  vez de envolverse, así que el `flex-wrap` no llega a aplicarse nunca. La
  columna del profesor mide 320px fijos y los tres botones no caben: «❓
  Preguntar» quedaba 40 px FUERA del panel, cortado contra el borde y sin forma
  de apretarlo, y «ELO 1397» se partía en tres renglones para hacerle sitio. No
  daba ningún error — la lista se pintaba entera —, así que solo se descubre
  mirando la pantalla. `verificar-sesion-curso.js` mide ahora el rectángulo que
  calcula el navegador, no la clase; está probado que falla de verdad: con la
  fila de antes salta con 18 de 54 botones fuera.

**Al tocar la lección de curso de la clase, los visores o la vista previa de
Táctica, correr `node herramientas/verificar-sesion-curso.js`** (con el sitio en
localhost:8777, playwright y `npm install chess.js@0.10.3`). Existe porque
`sesion.html` está detrás del login **y** detrás del rol: `verificar-css.js` abre
las páginas sin cuenta y no ve nada de esto. Comprueba, en un navegador de
verdad, que al alumno no se le pinte ni un carácter de la lección **aunque su
fila de `game_state` traiga `shown_curso` puesta** (el resto de antes), que abrir
la lección no mande ni un `update`, que el botón mande la posición que está en
pantalla —contra el archivo de datos del curso, leído aparte— antes y después de
avanzar una jugada, y que en la vista previa **la pieza quepa en su casilla**
(se miden los dos en el navegador, no la clase ni el CSS).

### "Jalar un archivo a la clase" tiene las mismas tres acciones que Táctica

El panel de Archivos (`toggle-archivos-btn` en `sesion.html`) lista los PGN que
el profesor subió en `partidas.html` —cada partida de un `.pgn` con varias
queda en su propia fila de `archivos_pgn`, así que un archivo con varios
ejercicios ("Position 2, 1 Move", "Position 3, 1 Move"…) ya llega separado uno
por uno—. Antes solo tenía "Cargar" (la línea entera, jugada a jugada, con
`board.loadMoves`); ahora cada fila suma lo mismo que ya tenía Táctica:

- **👁 Vista previa**, con el mismo `renderTacticsPreviewBoard()` de Táctica —no
  una segunda copia— dibujando la posición de **salida** del PGN (la de
  `archivoStartFen()`, sacada del propio PGN en memoria: el header `FEN` si lo
  trae, o el inicio de siempre). No la posición final (`fen_final`, que sí vive
  en la base): la de salida es la que identifica al ejercicio y la que tiene
  sentido preguntar o practicar.
- **📥 Cargar**, **❓ Preguntar** y **🎯 Practicar** pasan las tres por
  `aplicarPosicionEnClase()`, como cualquier otra puerta que pone una posición
  en el tablero. `Cargar` **mandaba antes la línea entera reproducida con
  `board.loadMoves()`**, o sea la posición FINAL del PGN —jaque mate incluido
  cuando lo traía—, así que la clase veía el desenlace del ejercicio apenas se
  elegía el archivo, sin que se hubiera jugado ni una jugada delante de nadie.
  Ahora manda la misma posición de SALIDA que Vista previa: la clase arranca
  limpia, sin las variantes de la línea anterior colgando (eso ya lo hace
  `aplicarPosicionEnClase()` con `clearVariantTree()`), y la línea se juega en
  vivo desde ahí, jugada por jugada, con el mismo mecanismo de cualquier
  partida (`onMove` → `pushBoardState()`) — no con una reproducción instantánea
  que el resto de la clase no llega a ver. `Preguntar` calcula `expected_plies`
  del propio `move_count` del archivo (con el mismo tope de 6 que usa Táctica);
  `Practicar` inserta en `practice_sessions` con el nivel que esté elegido en
  la pestaña Practicar —el mismo insert que `start-practice-btn`, solo que con
  el fen del archivo en vez de `board.fen()`.

### Buscar un ejercicio es mirarlo: «Ver todas las posiciones»

Las dos listas de material del profesor —los PGN de Archivos y los ejercicios de
Táctica— tienen la posición de cada fila **escondida detrás de su propio «👁
Vista previa»**, y el rótulo de la fila no dice nada de ella: «Position 4, 1
Move» o «3. ELO 1397» no distinguen un mate en dos de un final de torre. Así que
para encontrar cuál dar había que abrir y cerrar de a una, con la clase delante.
No fallaba nada: la lista se pintaba entera y el ejercicio estaba ahí — solo que
no había forma de reconocerlo sin destaparlo.

El interruptor de cada lista las destapa todas, y con él encendido **cada fila
NACE destapada**: al cambiar de tema, de dificultad o de carpeta no hay que
volver a apretarlo. Eso es lo que hace que sirva para buscar — si se volviera a
apagar en cada paso de la cascada, buscar costaría lo mismo que antes.

- **Se recuerda en el APARATO** (`localStorage`), como el tema, el Modo Adaptado
  o la clase elegida: es de cómo se está mirando la lista, no de quién mira.
- **Una lista no enciende la otra**, cada una con su clave: son de tamaños muy
  distintos —cientos de PGN contra treinta y pico de ejercicios— y no hay razón
  para que destapar los archivos destape la táctica.
- **Una por una se sigue pudiendo**, que es la mitad del pedido: el interruptor
  decide con qué estado NACE cada fila y no le impone el suyo después, así que
  con todo destapado se puede cerrar la que estorba.
- **El interruptor dice lo que va a pasar**, no el estado en que está («👁 Ver
  todas las posiciones» / «🙈 Ocultar las posiciones»), igual que el «🙈
  Ocultar» de cada fila. Y no se ofrece cuando no hay archivos: un control que no
  cambia nada.

**El tablero se dibuja cuando la fila ENTRA EN PANTALLA**, no al destaparla ni
todos de golpe (`crearVistaPreviaLote()`, un `IntersectionObserver` que las dos
listas comparten — escrito dos veces se separaría a la primera corrección, como
`renderTacticsPreviewBoard()`). Son dos fallas distintas y las dos son calladas:

- Dibujar las 34 posiciones de una tanda de táctica —o los cientos de PGN de un
  profesor— en el mismo cuadro son miles de casillas de una vez: el panel se
  queda congelado unos segundos **en medio de la clase**.
- Y el tamaño de la pieza **se mide sobre la casilla ya renderizada** (ver
  `sizePieces()` de `js/article-example-board.js`), así que dentro de una carpeta
  cerrada —un `<details>`, que es como se agrupan los archivos— esa medida es
  **cero** y el tablero saldría con las piezas del tamaño que no era. Con el
  observador, lo que está guardado en una carpeta se dibuja al abrirla, ya
  medible.

**Al tocar esto, correr `node herramientas/verificar-sesion-curso.js`.** Lo que
mira es lo que se rompe callado: que **cada fila dibuje LA SUYA** —treinta
tableros pintando todos la misma posición se ven perfectos, así que se compara el
patrón de casillas ocupadas de cada uno contra la FEN que le toca, sacada del
primer campo de la propia FEN y no de la página—, que la del PGN sea la posición
de **salida** y no la final, que la de la **carpeta cerrada espere** a que se
abra y aparezca medida, que **bajando por la lista se llegue al último ya
dibujado** (la lista de Táctica tiene su propio scroll: un observador que no
viera lo que entra por ahí dejaría la galería en blanco), que al cambiar de tanda
**nazcan destapadas**, que una lista no encienda la otra y que abrirlas una por
una siga funcionando. Está probado que falla de verdad: dibujándolas todas de
golpe saltan 3 comprobaciones, sin la persistencia 1 y cruzando las posiciones 8.

## Varios profesores por alumno, cada uno con su propia clase en vivo

El sitio pasó de asumir un solo profesor (Oscar) a soportar varios, cada uno
viendo y gestionando **solo sus propios alumnos asignados** — no toda la
plataforma — y pudiendo dar clase en vivo al mismo tiempo que otro profesor
sin pisarse.

- **`public.profile_teachers` (alumno, profesor) es la verdad**: un alumno
  puede tener **varios** profesores y todos lo ven. Lo decide la persona
  administradora desde `admin.html`, o queda asignado automático a quien lo
  invita (`create-student`). Nadie escribe esa tabla desde el navegador —no
  tiene política de insert/update/delete—: solo las Edge Functions con la
  service role, igual que el cupo de invitaciones.
- **`profiles.teacher_id` ya NO decide permisos.** Se quedó con un papel más
  chico: el **profesor principal**, o sea el que viene preseleccionado cuando el
  alumno entra a clase. Lo mantiene solo el trigger
  `profile_teachers_sincroniza_principal`: al sumarle el primer profesor queda
  ese, y al quitarle el principal pasa a otro de los que le queden o a NULL. Los
  dos no pueden contradecirse porque nadie lo escribe a mano.
- `profiles.grupo` es un texto libre (equipo/subgrupo) puramente organizativo,
  sin efecto en permisos.
- `public.my_profile()`: función `SECURITY DEFINER` que da el rol/is_admin de
  quien llama sin volver a pasar por la RLS de `profiles`. **Su tercera
  columna, `teacher_id`, ya no la usa ninguna política** (se dejó para no tener
  que volver a crear las 66 políticas que la nombran en su alias).
- **Las dos preguntas que hace toda política de profesor** tienen su función,
  también `SECURITY DEFINER` para no morderse la cola con la RLS de `profiles`:
  `soy_profesor_de(alumno)` ("este alumno es mío") y `es_mi_profesor(uuid)`
  ("esto lo creó/es de uno de mis profesores"), más `soy_profesor_de_alguno()`
  y `soy_profesor_de_todos()` para las partidas, y `es_companero(otro)` para
  "compartimos profesor". **Al escribir una política nueva se usan estas, nunca
  la columna.** Antes, TODA política de "profesor" era `role = 'profesor'` a
  secas (cualquier profesor veía y gestionaba absolutamente todo).
- Reescribir esto fueron **38 políticas** de las 68 que nombraban `teacher_id`;
  las otras 30 solo la mencionaban dentro del alias de `my_profile()` y no
  hacía falta tocarlas.
- **`es_companero()` arregló una fuga que ya existía**: la regla de "compañeros
  de clase" era "tenemos el mismo `teacher_id`", y un profesor también tenía
  `teacher_id` puesto (el de quien lo creó). Resultado: un profesor nuevo, sin
  un solo alumno asignado, veía los 30 perfiles y las 56 respuestas de la clase
  entera de quien lo creó. Ahora `profile_teachers` solo tiene alumnos como
  `student_id`, así que un profesor nunca es "compañero" de nadie.
- **Tablero en vivo**: `game_state` dejó de ser una fila única global
  (`CHECK (id = 1)`) — ahora cada profesor tiene su propia fila
  (`owner_id`, único). `variant_nodes` igual, vía `teacher_id`. `questions`,
  `class_sessions`, `practice_sessions` y `saved_games` ya tenían
  `created_by`: solo hacía falta filtrar por ahí en vez de tratarlos como
  globales (antes, por ejemplo, un profesor cerraba SIN darse cuenta la
  pregunta o la ronda de práctica abierta de cualquier otro profesor).
- En el cliente (`sesion.html`, `clases.html`), todo gira alrededor de
  `boardOwnerId`: el propio id si es profesor, o **la clase que eligió** si es
  alumno — todas las consultas, canales de Realtime y el canal de presencia
  (`clases-presence:<boardOwnerId>`) se filtran por ahí. Un alumno sin ningún
  profesor ve un aviso pidiendo que se le asigne uno, en vez de mezclarse con
  la clase de otro.
- **`js/clase-elegida.js` decide en qué clase está mirando el alumno**: la que
  eligió la última vez, o —la primera vez— la que tiene clase abierta ahora, o
  la de su profesor principal. El selector **solo aparece con dos o más
  profesores**: con uno sería un control que no hace nada. Se lo sirve
  `public.mis_clases()`, que dice de cada profesor si tiene clase abierta en
  este momento.
- **Cambiar de clase recarga la página, a propósito.** Todo cuelga de
  `boardOwnerId`; cambiarlo en caliente obligaría a desmontar y volver a montar
  cada consulta, cada canal de Realtime y el de presencia, y cualquiera que
  quedara colgado del profesor anterior seguiría recibiendo su clase — justo lo
  que este cambio viene a evitar. La clase elegida vive en `localStorage` y
  **no** se sincroniza entre aparatos: es de dónde se está mirando, como el
  tema.
- `class_chat_messages` no tiene tablero ni sesión: se filtra directo por quién
  es profesor del alumno del hilo (el chat es continuo, no "de una clase
  puntual"). Con dos profesores, los dos ven y escriben en el mismo hilo.
- **Quién ve a quién ya lo hace cumplir la base, no las páginas.** Está
  comprobado impersonando roles en SQL: un profesor solo recibe sus alumnos en
  `profiles` y solo sus filas en `training_progress`, `training_state`,
  `platform_activity_log`, `class_attendance`, `question_answers` y las demás.
  Las funciones de informes (ver abajo) piden los alumnos **sin filtro de
  profesor a propósito**: el filtro es de la RLS. Si algún día hay que tocarlo,
  se toca la política, no la consulta.
- **Sus profesores no los puede cambiar el propio alumno.** `profiles_update_own`
  deja a cada quien editar su fila, y el trigger
  `protect_profiles_identity_columns` revierte `role`, `email`, `is_admin`,
  `teacher_id`, `invitaciones_max` e `invitaciones_usadas`. Y a
  `profile_teachers`, que es lo que de verdad manda, no se puede escribir desde
  el navegador. El trigger respeta la marca local
  `ajedrez.sincronizando_profesores` **solo** para `teacher_id`, para no
  deshacer en silencio lo que pone el trigger del principal — el mismo fallo
  callado que tuvo el contador de invitaciones.
- **Cupo de invitaciones por profesor.** `profiles.invitaciones_max` es cuántos
  alumnos nuevos puede invitar por su cuenta desde la Academia, y
  `invitaciones_usadas` lo que lleva gastado. Lo fija quien administra desde
  `admin.html`; **quien administra no tiene tope**. El descuento lo hace
  `create-student` llamando a `public.consumir_invitacion()`, que comprueba y
  descuenta **en una sola operación**: dos pestañas invitando a la vez no pueden
  pasarse del cupo. Si la invitación falla después, `devolver_invitacion()` la
  repone. Las dos funciones tienen el `execute` revocado de `anon` y
  `authenticated`: solo las llama la Edge Function con la service role.
  `invitaciones_usadas` **no baja** al reasignar o borrar un alumno: lo que se
  controla es cuántas invitaciones manda, no cuántos alumnos tiene hoy.
  - Cuidado con el trigger: es el mismo que protege las columnas, así que las
    dos funciones ponen la marca local `ajedrez.contando_invitaciones` y el
    trigger la respeta **solo** para esas dos columnas. Sin eso el contador
    tenía un fallo silencioso — el trigger deshacía el aumento y la función
    igual devolvía `ok`, porque el `RETURNING` trae la fila ya revertida y
    `found` sigue siendo cierto.
- **Asignar alumnos se hace en lote.** En `admin.html`, cada alumno tiene una
  etiqueta por profesor con su ✕ para quitarlo y un selector para sumar otro
  (manda la lista completa con `set_teachers`: lo que no esté, se quita).
  Además se pueden marcar alumnos (o un grupo entero desde su encabezado) y
  mandarlos a un profesor con `assign_bulk`, que ahora lleva **modo**:
  *agregar* ese profesor a los que ya tienen, *reemplazar* a todos por él, o
  *quitarlo*. Se asegura de que todos sean alumnos. Así se reparte de verdad:
  "todo 7° B al profesor nuevo", no fila por fila. El panel "Profesores" de esa
  misma página muestra cuántos alumnos tiene cada uno —un alumno compartido
  cuenta para los dos— y su cupo, y **avisa si hay alumnos sin ningún profesor
  asignado**: esos no salen en los informes de nadie. Al agrupar la lista por
  profesor se usa el principal, con un "(+ otros profesores)" cuando tiene más.
- **Al tocar esto, correr `node herramientas/verificar-varios-profesores.js`**
  (con el sitio en localhost:8777 y playwright). Comprueba en un navegador de
  verdad lo que manda el panel —las etiquetas, quitar y agregar, los tres modos
  del lote, los conteos— y qué clase elige `js/clase-elegida.js`. Lo que hace
  cumplir la base se comprobó impersonando roles en SQL, con una foto de "quién
  ve qué" antes y después: el único cambio fue el que se buscaba.
- **Regla permanente: todo lo que se haga para los profesores se hace también
  para quien administra**, con el mismo alcance que ya le da la base (el
  profesor ve lo suyo; quien administra, todo). En la práctica: `informes.html`
  trata `is_admin` como profesor, y lo que aparezca ahí para profesores
  aparece igual para administradores; si una función nueva vive en otra
  página, `admin.html` la enlaza.

### Equipos: un alumno en varios a la vez, un equipo con cualquier cantidad de entrenadores

**No es lo mismo que `profiles.grupo`.** Ese campo sigue exactamente como
estaba: texto libre, uno solo por alumno, sin ningún efecto en permisos, solo
para ordenar la lista de `admin.html`. "Equipos" es un sistema aparte, real,
con dos tablas puente (`equipo_alumnos`, `equipo_entrenadores`) — muchos a
muchos en los dos sentidos — y **con efecto directo en permisos**: estar en un
equipo con un entrenador le da a ese entrenador los mismos permisos que ya le
da tenerlo asignado directo en `profile_teachers`, sin límite de dos ni de
ningún otro número chico.

- **`profesores_de(alumno)` y `alumnos_de(profesor)` son la ÚNICA fuente de
  esa unión** (asignación directa ∪ la que da compartir un equipo). Se
  agregaron en la migración `equipos_varios_por_alumno_y_entrenador` y las
  cinco funciones que ya hacían cumplir "quién es profesor de quién"
  (`soy_profesor_de`, `es_mi_profesor`, `soy_profesor_de_alguno`,
  `soy_profesor_de_todos`, `es_companero`) se reescribieron sobre ellas, igual
  que `pueden_jugar_entre_si()`, `puedo_armar_partida_con()`,
  `alumnos_del_profesor()`, `mis_clases()` y el trigger
  `avisar_clase_abierta()`. Ninguna política de RLS cambió: todas llaman a
  estas funciones y no a la tabla, así que las 38 políticas que ya usaban
  `soy_profesor_de()`/`es_mi_profesor()`/etc. quedaron con el permiso ampliado
  sin tocarlas — el mismo principio que ya regía para `profile_teachers` sola,
  extendido un nivel más: **al preguntar quién es profesor de quién se usa
  `profesores_de()`/`alumnos_de()`, nunca `profile_teachers` ni `equipo_*`
  directo.**
  - Comprobado con datos reales antes de escribir nada nuevo encima: sin
    ningún equipo creado, `profesores_de()` da exactamente lo mismo que
    `profile_teachers` sola (0 diferencias en 87 alumnos). Y con un equipo de
    prueba (creado y borrado en la misma comprobación, sin dejar rastro), el
    entrenador del equipo aparece en `profesores_de()` del alumno y viceversa.
  - **`es_companero()` y "compañeros de equipo" quedan cubiertos gratis.**
    `profesores_de(alumno)` no es "el entrenador que a MÍ me asignaron dentro
    del equipo": es TODOS los entrenadores de cada equipo al que el alumno
    pertenece. Dos alumnos del mismo equipo comparten automáticamente esos
    entrenadores en la intersección de `profesores_de()`, así que no hizo
    falta una regla aparte de "somos del mismo equipo" en `es_companero()` ni
    en `pueden_jugar_entre_si()`.
- **`equipos`, `equipo_alumnos` y `equipo_entrenadores` no tienen política de
  insert/update/delete**, igual que `profile_teachers`: solo se escriben desde
  la Edge Function `admin-manage-users` con la service role, y solo quien
  administra puede llamarlas (mismo nivel que `assign_bulk`/`set_teachers`,
  no el de `soy_coordinador()`). Acciones nuevas: `equipo_create`,
  `equipo_rename`, `equipo_delete`, `equipo_set_alumnos` y
  `equipo_set_entrenadores` — estas dos últimas, igual que `set_teachers`,
  **dejan la lista EXACTAMENTE como se mandó**: lo que no esté, se quita. El
  único tope es de cordura (`MAX_ENTRENADORES_POR_EQUIPO = 30`,
  `MAX_ALUMNOS_POR_EQUIPO = 300`), para atajar un error de dedo, no una regla
  de negocio — nunca un límite de dos.
- `equipos.nombre` tiene un índice único sobre `lower(trim(nombre))`: dos
  equipos con el mismo nombre (o el mismo nombre con otra mayúscula) serían
  imposibles de distinguir en la lista.
- **En `admin.html`, la tarjeta "Equipos"** (entre "Profesores" y "Las
  cuentas, por grupo") deja crear un equipo, renombrarlo, borrarlo, y sumarle
  o quitarle alumnos y entrenadores con el mismo patrón de etiqueta-con-✕-y-
  selector que ya usaban los profesores de un alumno — a propósito NO se tocó
  `renderProfesoresCelda()` para no arriesgar ese camino ya probado por
  `verificar-varios-profesores.js`: la de equipos es una función aparte,
  `renderEquipoTags()`.

#### Llenar un equipo de una vez, que es lo que evita el uno por uno

Un equipo hace exactamente lo que se pide cuando alguien dice «asignarle
profesores a un grupo», y lo hace **vivo**: quien entre después al equipo
hereda a sus entrenadores sin que nadie vuelva a tocar nada. Lo que faltaba no
era el modelo, era poder llenarlo: el selector ofrecía los alumnos de a uno
entre mil doscientos nombres, así que armar un equipo costaba una tarde y los
permisos se terminaban repartiendo alumno por alumno.

**`js/equipo-volcar.js` es esa pieza**, y está escrito una sola vez para las
dos pantallas —`admin.html` y `coordinacion.html`—, como
`js/subgrupos-marcar.js` lo está para Tareas y Exámenes. Ofrece, en un solo
selector con sus dos `<optgroup>`, **los grupos** (`profiles.grupo`) y **los
subgrupos**.

- **SE MANDA LA UNIÓN, NUNCA SOLO EL GRUPO.** Las dos puertas que escriben los
  alumnos de un equipo —`equipo_set_alumnos` de la Edge Function y
  `coord_equipo_set_alumnos()` en la base— dejan la lista EXACTAMENTE como
  llega, igual que `set_teachers`. Mandar solo los del grupo **vaciaría el
  equipo de todo lo anterior**: se vería perfecto con sus 23 nombres nuevos y
  los 40 de antes habrían perdido a sus entrenadores sin que nadie lo pidiera.
  Por eso este módulo no ofrece «dejar solo estos».
- **El tope se mira ANTES de mandar.** Un equipo aguanta 300 alumnos y un grupo
  de colegio puede tener 400: si viajara, volvería con el error del servidor
  justo cuando quien lo apretó ya no sabe qué arreglar. Se dice el número y se
  propone partirlo en dos.
- **Un id que la pantalla no reconoce se cuenta y se dice** («2 no están en tu
  lista»): es un alumno que se fue de su alcance o un subgrupo de otro
  profesor. Dar por bueno el número del grupo dejaría el equipo con menos gente
  de la que se pidió sin que nada fallara — la misma regla que el selector de
  subgrupos de Tareas.
- **De quién es cada subgrupo va escrito en su opción.** Dos profesores pueden
  tener cada uno su «Los del martes», y son listas distintas.
- **El aviso de qué pasó sobrevive al repintado.** Guardar vuelve a pintar la
  tarjeta entera —es la única forma de que las etiquetas y el selector de
  «sumar otro» queden al día sin olvidos—, así que el renglón donde se escribió
  «Entraron 23» se muere en el acto y no lo lee nadie. Por eso `guardar` recibe
  la frase y quien repinta se la devuelve al control nuevo en `mensaje`.
- **Los subgrupos los sirve `public.subgrupos_a_la_vista()`**, `SECURITY
  INVOKER`: quién ve los de quién lo sigue decidiendo la RLS de `subgrupos`
  (los propios, los de su coordinación, todos si administra). Devuelve el
  arreglo de ids de cada uno, como `mis_subgrupos()`. **Volcarlo no convierte
  al subgrupo en una llave**: lo que queda guardado es la lista del equipo, y
  el subgrupo sigue sin dar ni un permiso.

#### Los equipos también se manejan desde coordinación

Estaban solo en `admin.html` y solo los escribía la Edge Function
`admin-manage-users`, o sea solo quien administra. Ahora `coordinacion.html`
tiene su tarjeta «👥 Equipos», acotada con el patrón de siempre:
`soy_coordinador()` dice quién entra, `bajo_mi_coordinacion()` dice sobre
quién. Son cinco funciones `SECURITY DEFINER` —`coord_equipo_create`,
`_rename`, `_delete`, `_set_alumnos`, `_set_entrenadores`— con el `execute`
revocado de `public` y `anon`.

- **La fuga propia de los equipos, que no existe en `coord_set_profesores()`:**
  meter a un alumno suyo en un equipo con entrenadores AJENOS le daría a esos
  entrenadores acceso a ese alumno — o sea, repartir permisos fuera de su
  coordinación sin que nada fallara. Por eso tocar la gente de un equipo pide
  que **toda** la gente del equipo esté bajo su coordinación, en los dos lados,
  y eso lo contesta `equipo_bajo_mi_coordinacion()`.
- **Repartir no es lo mismo que renombrar o borrar.** Un equipo que armó
  administración puede tener un sentido que no es el de quien coordina, así que
  esos dos verbos se quedan con **lo que ella misma creó**
  (`equipo_lo_cree_yo()`, sobre `equipos.created_by`); repartirle su propia
  gente sí lo puede hacer en cualquier equipo que cumpla lo de arriba. En
  pantalla, sobre un equipo que no puede repartir **no se pinta ni el ✕, ni el
  selector, ni el volcado**, y se dice por qué: la base lo rechazaría igual,
  pero el fallo lo descubriría quien apretó.
- **Lo que ya estaba y no coordina se conserva** al escribir, igual que en
  `coord_set_profesores()`. Hoy no puede pasar —el equipo entero tiene que ser
  suyo— pero la regla se escribe igual: el día que se afloje esa condición, el
  borrado callado ya no estaría esperando.
- **Borrar pide dos toques en el propio botón**, con lo que va a pasar escrito
  encima («sus entrenadores pierden a estos alumnos»), no un diálogo del
  navegador: esto se toca desde el celular.
- **Los alumnos del selector se piden hasta el final**, no con un límite a ojo:
  `mi_gente` viene paginada porque PostgREST corta sin avisar, y un límite
  dejaría fuera del selector a alumnos que sí puede repartir.

Comprobado impersonando roles en SQL, 13 casos: quien coordina crea el equipo,
le mete a su alumno, **un alumno ajeno se rechaza**, pone a su profesor de
entrenador y con eso el entrenador **ya sale en `profesores_de()` de ese
alumno**; sobre un equipo con gente ajena no puede sumar, ni renombrar, ni
borrar; un alumno no crea ninguno, no se pone de entrenador y ve **0**
subgrupos.

### Subgrupos: las listas que cada profesor arma para sí mismo

Son la TERCERA forma de agrupar alumnos que tiene el sitio, y confundirla con
las otras dos es el error caro:

| | quién la pone | cuántas por alumno | ¿da permisos? |
|---|---|---|---|
| `profiles.grupo` | quien administra | una | no |
| **equipos** | quien administra **o quien coordina, sobre su gente** | varias | **SÍ** |
| **subgrupos** | **cada profesor, solo** | varias | **no** |

**Cuando alguien pide «asignarle profesores a un subgrupo» está pidiendo un
equipo.** Un subgrupo no da permisos por diseño, y eso es lo que permite que
cada profesor arme los suyos sin pedirle nada a nadie; lo que sí reparte acceso
—de una vez y para los que entren después— es un equipo. Lo que hacía falta no
era convertir el subgrupo en llave, sino poder **volcar** un subgrupo entero
dentro de un equipo, que es lo de abajo.

Un subgrupo se define por lo que NO hace: **no da ni un permiso**. Ninguna de
las funciones que deciden quién es profesor de quién —`profesores_de()`,
`alumnos_de()` y las cinco que cuelgan de ellas— lo mira. Por eso un profesor
puede armarlos solo, sin pedirle nada a quien administra: es una etiqueta para
filtrar («los del martes», «los que van al torneo»), no una llave. Un equipo
sí es una llave, y por eso los equipos siguen siendo de administración.

- **Solo puede contener a quien YA es suyo**: la política de insert de
  `subgrupo_alumnos` exige `soy_profesor_de()`. No es por los permisos —no da
  ninguno— sino porque no hay razón para que sirva de libreta de ids ajenos.
- **Es del profesor que lo armó.** Quien administra los ve todos —la regla
  permanente— pero **no los edita**: la forma en que una colega ordena a sus
  alumnos es suya, igual que sus planes de clase. Comprobado impersonando roles
  en SQL: otra profesora no lo ve (0 filas), no ve sus renglones y renombrarlo
  le cambia **0 filas**; un alumno no puede crear ninguno ni ve ninguno.
- **Dos subgrupos con el mismo nombre serían imposibles de distinguir** en el
  selector, que es para lo único que existen: lo impide un índice único sobre
  `(profesor_id, lower(btrim(nombre)))`. Es por profesor, así que que una colega
  tenga su propio «Grupo de la tarde» no estorba.
- `public.mis_subgrupos()` devuelve **el arreglo de ids** de cada uno, no las
  filas sueltas: quien la llama ya tiene cargada su lista de alumnos, así que
  con los ids le basta para cruzar sin una segunda consulta por subgrupo.

#### Dónde se usan

- **`subgrupos.html`** (tarjeta «👥 Mis subgrupos» en Herramientas): crear,
  renombrar, borrar y marcar quiénes están. **Al guardar se manda SOLO lo que
  cambió**, no la lista entera: borrar todo y volver a insertarlo dejaría el
  subgrupo vacío un instante y, si el insert fallara a la mitad, se quedaría
  vacío sin que nadie lo hubiera pedido.
- **El filtro de `informes.html`**: van en el MISMO selector que los grupos,
  con su `<optgroup>` —a la hora de mirar el informe, «los del martes» se elige
  igual que «7° B»—. El valor lleva el prefijo `sub:` porque un grupo es texto
  libre y podría llamarse igual que un subgrupo. Un subgrupo **sin nadie no se
  ofrece**: sería un control que no hace nada.
- **`js/subgrupos-marcar.js`** en Tareas y en Exámenes: elegir un subgrupo
  marca a los suyos **y desmarca al resto**. Es lo que quiere decir «mándasela
  a los del martes», y deja la lista en un estado que se lee de un vistazo;
  sumar sobre lo que ya estaba marcado sería más flexible y mucho menos
  predecible, porque nadie revisa sesenta casillas antes de apretar el botón.
  Está escrito UNA vez para las dos pantallas: son justo las dos donde
  equivocarse cuesta caro —una tarea mandada a toda la Academia en vez de a los
  seis del martes no da ningún error—.
  - **Cuántos quedaron marcados puede no ser cuántos tiene el subgrupo**: si a
    uno de sus alumnos lo reasignaron, ya no está en la lista de esa pantalla.
    Se dice el número de verdad, el de las casillas, y se avisa de la
    diferencia. Dar por bueno el del subgrupo dejaría una tarea con un alumno
    menos sin que nada fallara.

**Al tocar los subgrupos, el filtro de Informes o el selector de Tareas y
Exámenes, correr `node herramientas/verificar-subgrupos.js`** (con el sitio en
localhost:8777 y playwright). Comprueba qué manda la página al crear y al
renombrar, que guardar quiénes están mande **solo la diferencia**, que el
buscador no se pierda con las tildes, que a un alumno no se le pinte nada, que
el subgrupo salga en el selector de Informes y —lo que de verdad importa— que
**filtre**: un filtro que no filtra enseña el informe de la Academia entera y
se ve exactamente igual de bien. Está probado que falla de verdad: quitándole
el filtro a `filteredStudents()`, salta.

## Coordinar es un alcance, no una llave maestra

`soy_coordinador()` contestaba una sola pregunta —«¿coordina o administra?»— y
con eso se abría TODO: los cobros de la Academia entera, las inscripciones, los
formularios. Con miles de alumnos y varios coordinadores eso no es coordinar,
es administrar, y quien coordina un colegio no tiene por qué ver las
mensualidades de otro.

Lo que faltaba era el ALCANCE, y se arma como todo lo demás acá: una tabla
puente que solo escribe quien administra, y una función que contesta la
pregunta.

- **`soy_coordinador()` dice QUIÉN entra a una pantalla;
  `bajo_mi_coordinacion(persona)` dice SOBRE QUIÉN.** Al escribir una política
  o una función de coordinación se pregunta por la segunda, nunca por la tabla
  — el mismo principio que `profesores_de()` para "quién es profesor de quién".
- **`public.coordinador_profesores` NO tiene política de insert/update/delete**,
  igual que `profile_teachers` y `equipos`: darse a sí mismo un profesor sería
  darse sus alumnos. La escribe `set_profesores_del_coordinador()`, que exige
  `is_admin` y **deja la lista EXACTAMENTE como se mandó** — lo que no esté, se
  quita, igual que `set_teachers` y `equipo_set_alumnos`.
- **Quien coordina alcanza a tres clases de gente**, y las tres hacen falta:
  sus profesores, los alumnos de esos profesores y sus propios alumnos.
  Coordinar no quita dar clase.
- **Quien administra da `true` siempre.** Por eso las políticas no llevan una
  segunda rama para él: `bajo_mi_coordinacion()` ya la trae.
- **Los cobros quedaron acotados con eso** (`cobros`, `pagos`, `suscripciones`,
  `cobros_contacto`, y desde la migración `planes_cobro_personalizado_y_privados`
  también `planes_cobro`, ver «Cobros» más abajo — antes era la única excepción,
  compartida por toda la Academia).
  - **Cuidado con `pagos`**, que fue el error de esta tanda y se atajó en el
    momento: colgarlo solo del cobro visible abre la puerta que se quería
    cerrar, porque un alumno VE su propio cobro y podría insertar un pago sobre
    él y darse por pagado. El `soy_coordinador()` va escrito; lo que cuelga del
    cobro es el alcance, no el permiso. Comprobado impersonando a un alumno: ve
    su cobro y su insert de 999.999 queda **rechazado**.
- **Un coordinador sin profesores vinculados ve casi nada**, y eso no puede ser
  callado: el panel se lo dice con todas las letras y nombra quién se los
  vincula. Es la primera cosa que pasa al marcar a alguien como coordinador.

### El acotamiento se quedó a medio hacer en cuatro tablas más

La ronda de arriba dejó acotados `cobros`, `cobros_contacto`, `pagos` y
`suscripciones`, pero **no** tocó todo lo demás que también cuelga de
`soy_coordinador()`. Con datos reales (dos cuentas coordinadoras, ambas con
`grupo = 'SJ'`) quedó comprobado que la fuga era real, no teórica:

- **`formularios` / `formulario_respuestas`** filtraban por `grupo =
  mi_grupo()`, no por `bajo_mi_coordinacion()`. `grupo` es un texto de sede
  (SJ, Santa Ana, ADAPZ) que **dos coordinadoras distintas pueden compartir**
  —y de hecho comparten—, así que una veía los formularios y las respuestas
  de la otra sin ser su coordinación en absoluto. Se cambió a
  `bajo_mi_coordinacion(creado_por)`, igual que el resto. Como
  `formularios_insert` exige `soy_coordinador()`, `creado_por` siempre es una
  coordinadora o quien administra, así que la función de siempre alcanza sin
  agregar ninguna columna.
  - **Efecto secundario a propósito, no un bug**: un formulario que arme
    quien administra (no una coordinadora) deja de aparecerle a las
    coordinadoras aunque comparta su `grupo` — antes sí les aparecía, por la
    misma fuga. Si hace falta que quien administra reparta un formulario a
    una coordinadora puntual, hoy no hay botón para eso; es una función
    aparte si se pide.
- **`avisos_cobro`** y **`datos_facturacion`** solo tenían `soy_coordinador()`
  a secas — cualquier coordinadora veía los avisos de pago y los datos
  fiscales de cualquier alumno de la Academia. Se acotaron exactamente como
  `cobros` (uniendo a `cobros.student_id` en el caso de `avisos_cobro`, que no
  tiene alumno propio).
- **`equipos` / `equipo_alumnos` / `equipo_entrenadores`** (los equipos que
  arma cada coordinadora en `coordinacion.html` con sus propios profesores y
  alumnos) también solo pedían `soy_coordinador()`: cualquier coordinadora
  veía los equipos de las demás. Ya existía
  `public.equipo_bajo_mi_coordinacion(equipo)` —comprueba que CADA alumno y
  CADA entrenador del equipo estén bajo la coordinación de quien pregunta—
  pero **no estaba conectada a ninguna política todavía**. Conectarla tal
  cual disparaba `42P17: infinite recursion detected in policy`: la política
  de `equipos` consulta a `equipo_entrenadores`/`equipo_alumnos`, cuyas
  políticas volvían a consultar `equipos` (a través de la función) dentro del
  mismo plan. Se resolvió con `set row_security to off` **dentro de la
  función** —tanto en `equipo_bajo_mi_coordinacion()` como en la nueva
  `public.puede_ver_equipo(equipo)`, que junta las tres condiciones (bajo mi
  coordinación, soy su entrenador, soy su alumno) en un solo lugar para que
  ninguna política tenga que hacer un `EXISTS` crudo contra otra tabla con
  RLS— así que las tres políticas (`equipos_select`, `equipo_alumnos_select`,
  `equipo_entrenadores_select`) llaman a `puede_ver_equipo()` y nada más.
  Ser `SECURITY DEFINER` con el dueño teniendo `BYPASSRLS` **no alcanzó por sí
  solo**: hace falta el `set row_security to off` explícito en la función
  para que sus propias consultas no vuelvan a disparar la política de la
  tabla que las llamó.
- **`solicitudes_academia` se dejó afuera, a propósito.** Quien llena
  `unirse.html` todavía no es alumna de nadie —no hay profesor, ni grupo, ni
  ningún dato para decidir de qué coordinadora es la solicitud—, así que no
  hay con qué acotarla sin agregar un campo nuevo (una sede que la persona
  elija, o una asignación manual). El dueño del proyecto decidió dejarla
  como bandeja compartida entre todas las coordinadoras y quien administra,
  por ahora. Si se pide acotarla más adelante, hace falta decidir primero
  cómo se liga cada solicitud a una coordinadora concreta — no alcanza con
  repetir el patrón de `bajo_mi_coordinacion()`.
- Comprobado impersonando a las dos coordinadoras reales de `grupo='SJ'`
  (cuentas ya existentes, no de prueba): antes de este cambio ambas verían
  las mismas filas; después, cada una ve solo lo suyo y ninguna ve lo de la
  otra, mientras quien administra sigue viendo todo.

### `role = 'admin'`: la cuenta master no es alumna de nadie

`role` solo valía 'profesor' o 'alumno', así que quien administra estaba
guardado como ALUMNO con `is_admin` encima. No rompía ningún permiso —`is_admin`
va escrito aparte en todas las políticas que le importan— pero la metía donde no
pinta nada: salía en la lista de «para quién» al mandar una tarea o un examen,
contaba como alumna en los conteos y podía ser «compañera de clase» de
cualquiera.

**Por qué esto NO es el tercer valor contra el que avisa este archivo.** Aquel
aviso era por `es_coordinador`: hacer de "coordinar" un tercer rol habría
obligado a revisar las 23 comprobaciones de `role === 'profesor'` del navegador
y las 13 de la base, porque quien coordina SÍ tiene que poder todo lo de un
profesor. Acá es al revés — la cuenta master ya no cumplía ninguna de esas
comprobaciones, porque era 'alumno'. Pasar a 'admin' no le quita ni un permiso
de los que tenía; lo único que cambia es de qué listas desaparece.

- **La cuenta master también da clase**, y eso hubo que arreglarlo aparte:
  cinco políticas pedían `role = 'profesor'` A SECAS —`class_sessions_insert`,
  `questions_insert`, `practice_sessions_insert`, `saved_games_insert` y
  `archivos_pgn_insert`, más `tv_settings_update_profesor`— así que al pasar a
  'admin' no podía abrir una clase en vivo, plantear una pregunta, abrir una
  ronda de práctica, guardar una partida ni subir un PGN. Ahora las seis
  preguntan `is_admin or role = 'profesor'`, que es la regla permanente de la
  casa. En el navegador, `isTeacher` hacía la misma comprobación a secas en
  diez páginas (`sesion.html`, las siete de partida, `partidas.html`,
  `clases.html`, `tv.html`) y las diez pasaron a `|| profile.is_admin`.
  Comprobado impersonando roles en SQL: la cuenta master abre la clase y un
  alumno sigue sin poder.
  - **Quien coordina nunca dejó de poder**, y por eso no hizo falta tocar nada
    para eso: coordinar es una marca ENCIMA de `role = 'profesor'`, no un
    tercer valor — es justamente lo que esa decisión compra.
  - En el chat de la clase en vivo, `isFromTeacher` miraba lo mismo, así que
    los mensajes de quien administra se pintaban del lado del alumno. Va con
    `is_admin` también, y la consulta trae esa columna.
- El CHECK de `es_coordinador` acepta ahora 'profesor' o 'admin'.

### Cambiar el rol de una cuenta, desde coordinación

`public.cambiar_rol(persona, rol)` sube a un alumno a profesor o baja a un
profesor a alumno. Es lo que pasa en una academia de verdad: el alumno grande
empieza a dar clase a los pequeños.

- **Va por una función `SECURITY DEFINER` con la marca local
  `ajedrez.cambiando_rol`**, porque el trigger de identidad revierte `role` —el
  rol no lo decide quien lo tiene—. Y **vuelve a leer la fila y falla si no
  quedó**: es exactamente la trampa que ya se comió `marcar_coordinador()`, que
  devolvía "listo" con el valor revertido detrás.
- **Bajar a alumno a alguien que todavía tiene alumnos asignados se rechaza,
  CON EL NÚMERO**: esos alumnos se quedarían sin profesor y sus informes
  dejarían de salirle a nadie, sin que nada fallara.
- **Nunca deja poner 'admin'**: la cuenta master es una decisión de quien ya
  administra y se da con su interruptor.
- **Y lo que más se rompe callado: que la persona DESAPAREZCA de la vista de
  quien la cambió.** Subir a un alumno a profesor lo saca de `profile_teachers`
  en la práctica, así que quien coordina lo perdería de vista en el mismo acto
  de ascenderlo. Por eso queda bajo su coordinación; y al revés, quien baja a un
  profesor a alumno se queda con él como alumno suyo.
- Comprobado impersonando roles en SQL: un alumno ajeno se rechaza, el suyo sube
  y queda coordinado, vuelve a bajar y deja de estarlo, la cuenta master se
  rechaza y un alumno no puede ascenderse solo.

### `coordinacion.html`: por dónde se entra a la gente que uno coordina

Sus profesores y sus alumnos, con buscador, filtro por rol y «Ver más». Por
cada cuenta: entrar a sus subgrupos, reenviarle el acceso y cambiarle el rol.

- **La lista la filtra y la corta `mi_gente()`, en la base.** Nace pensando en
  miles: bajarse las cuentas para filtrarlas en el navegador es la piedra con la
  que ya tropezaron Informes, el registro de clases y Cobros — PostgREST corta
  la respuesta a partir de cierta cantidad de filas sin dar ningún error.
  La búsqueda va **sin tildes** en el propio SQL, para no tener que bajarlas.
- **No se ofrece lo que la base va a rechazar**: ni cambiarle el rol a la cuenta
  master ni a la propia. Un botón que va a fallar es peor que ninguno.
- **Cambiar el rol pide dos toques en el propio botón**, no un diálogo del
  navegador: esto se toca desde el celular. Y cuando la base dice que no, se
  enseña SU mensaje —«todavía tiene 12 alumnos asignados»—, porque un «no se
  pudo» a secas deja a quien coordina sin saber qué arreglar.
- **Reenviar el acceso dice a qué bandeja salió.** Con un alumno sin buzón no
  salió a la suya, y ese es justo el dato que hace falta para avisarle a la
  familia. `reenviar-acceso` vale ahora también para un PROFESOR bajo
  coordinación —quien coordina da de alta al equipo y es quien recibe el «no me
  llegó nada»—; lo único que no se toca desde ahí es la cuenta master.

### La ficha de una cuenta: coordinar es también corregir

Quien coordina veía a su gente y no podía tocar nada: un correo mal escrito, un
nombre con una letra de más o un alumno sin grupo había que pedírselos a quien
administra. Cada cuenta tiene ahora su **«✏️ Su ficha»** —que se despliega
debajo, sin salir de la lista— con el nombre, el grupo, el correo con el que
entra y sus profesores.

- **Lo escriben dos funciones de la base, NO la Edge Function del panel de
  administración.** El alcance de la coordinación ya vive en SQL
  —`bajo_mi_coordinacion()`, `cambiar_rol()`,
  `set_profesores_del_coordinador()`— y partirlo entre la base y una función
  que tendría que volver a preguntar lo mismo es exactamente cómo se separan
  dos versiones de la misma regla. Son `public.coord_guardar_cuenta()` (nombre
  y grupo) y `public.coord_set_profesores()`, las dos `SECURITY DEFINER`, las
  dos exigiendo `soy_coordinador()` **y** `bajo_mi_coordinacion()` de la cuenta
  que se toca, con el `execute` revocado de `public` y `anon`.
- **`coord_guardar_cuenta()` vuelve a leer la fila y falla si no quedó**: es la
  trampa que ya se comieron `marcar_coordinador()` y `cambiar_rol()` —el
  trigger de identidad revierte por detrás y la función devuelve «listo» con el
  valor viejo—. Acá el trigger no toca `full_name` ni `grupo`, pero la relectura
  se escribe igual: el día que alguien le sume una columna protegida, el fallo
  ya no puede ser callado.
- **Lo que no puede mover no se ofrece**: el rol va por su propio botón (con
  sus dos toques), el cupo de invitaciones es de quien administra, y la cuenta
  master no se toca desde acá. Su firma solo acepta persona, nombre y grupo, así
  que no hay por dónde colar el rol ni `is_admin`.
- **`coord_set_profesores()` conserva a los profesores fuera de su alcance.**
  «Lo que no esté, se quita» es la regla de `set_teachers` y de
  `equipo_set_alumnos`, y acá sola sería un desastre callado: la lista que la
  pantalla tiene delante son los profesores **que esa coordinación ve**, y
  mandarla entera le borraría a la alumna el profesor de otra coordinación sin
  que nada fallara. La función une lo pedido con lo que ya tiene y no coordina.
  En pantalla, esa etiqueta se pinta **sin su ✕**: un botón que va a fallar es
  peor que ninguno.
- **Por eso `mi_gente()` devuelve una columna `profesores`** (un arreglo de
  `{id, nombre}` de `profesores_de()`), y no se resuelven en el navegador: el
  join con `profiles` pasa por la RLS, así que un profesor que esa coordinación
  no ve **saldría como un hueco** y la lista se mandaría sin él.
- **El correo lo sigue cambiando `correos-alumno`**, que es donde ya vivía esa
  regla —el 409 cuando el correo ya es de otra cuenta, el usuario de la Academia
  para quien no tiene buzón, y la relectura de la fila porque el trigger de
  identidad revierte `email`—. Escribirlo otra vez acá sería una segunda versión
  de la misma decisión. La casilla **«No tiene correo propio»** apaga el campo
  en vez de esconderlo, y lo que la pantalla enseña al final es **el usuario que
  devolvió el servidor**, no el que ella propuso: el desempate (`ana.rojas2`) lo
  hace el servidor, y enseñar el propuesto dejaría a la familia intentando
  entrar con uno que no es.
- **Guardar no repinta la lista.** Se actualiza el encabezado de esa tarjeta y
  nada más: repintar cerraría la ficha en la cara de quien acaba de guardar.

### Armarle los subgrupos a un profesor

`subgrupos.html?profesor=<id>` abre los de otra persona. Un profesor nuevo con
cuarenta alumnos no se pone a ordenarlos solo: parte del trabajo de coordinar es
dejarle los grupos hechos.

- **El dueño no cambia.** Quien coordina entra a los suyos, no se los queda, y
  la página lo dice arriba con todas las letras. **El fallo callado de esta
  pantalla es crear con el id de quien coordina en vez del de su profesor**: se
  vería exactamente igual, y los subgrupos que creía estar armándole a otro
  serían suyos. El verificador lo mide, y está probado que falla de verdad.
- Los propios salen de `mis_subgrupos()` —la de todos los días, la que usan el
  filtro de Informes y el selector de Tareas— y los de otra persona de
  `subgrupos_de()`. Dos nombres para dos preguntas distintas.

**Al tocar la coordinación, correr `node herramientas/verificar-coordinacion.js`**
(con el sitio en localhost:8777 y playwright). Comprueba que la lista se le pida
a la base con su filtro y su rango —y que nadie se baje la tabla de cuentas—,
que no se ofrezca cambiar el rol de la cuenta master, que cambiar el rol mande a
quién y a qué rol, que reenviar el acceso diga a qué bandeja salió, que a quien
todavía no tiene profesores vinculados se le diga por qué no ve a nadie (se mide
el `display` que calcula el navegador) y que crear un subgrupo ajeno lo deje a
nombre del profesor. De la ficha comprueba qué MANDA —que guardar vaya por
`coord_guardar_cuenta` con esa cuenta y solo con el nombre y el grupo, que
quitarle un profesor mande la lista sin él por `coord_set_profesores` y que **no
se llame a la Edge Function del panel de administración**—, que se vean todos
sus profesores pero solo se pueda quitar al que coordina, y que al cambiar el
correo se enseñe el que devolvió el servidor. Está probado que falla de verdad:
mandando el id de quien coordina en vez del de la alumna, salta.

De los equipos comprueba que sobre uno con gente ajena **no se pinte ni un
control**, que volcar un grupo mande la UNIÓN —con el que ya estaba dentro— y
que volcar algo que ya está no mande nada, que crear, sumar entrenadores y
borrar vayan por sus funciones de la base, y que el «Entraron 2 alumnos» se lea
**en la tarjeta que se ve** y no en la que se acaba de repintar. Está probado
que falla de verdad: haciendo que el volcado reemplace en vez de sumar, salta.

- **Sus filas se buscan por el correo, nunca por su posición.** Sumar una
  cuenta a los datos de prueba corre los índices y deja media docena de
  comprobaciones fallando por algo que no tiene nada que ver con lo que miran
  — la misma razón por la que el panel de la Academia busca sus grupos por
  nombre.
- **Y los handles se vuelven a pedir después de cada guardado.** Guardar
  repinta la lista entera, así que un handle tomado antes apunta a un nodo
  huérfano —con su mensaje escrito y su estado viejo—: mirándolo a él, la
  prueba daría verde sobre una pantalla donde no se ve nada.

## Tareas: el profesor pide cantidades y la tarea se llena sola

`tareas.html` es de dos públicos, como `informes.html`: quien es profesor (o
administra) arma una tarea con **varios renglones** y se la manda a uno o
varios de sus alumnos con una fecha de vencimiento; el alumno la ve en un solo
lugar y **no tiene que marcar casi nada**, porque cada renglón se va llenando
con lo que entrena.

    Resolver 10 ejercicios de ataque doble
    Resolver 20 ejercicios de 4×4
    Hacer 10 minutos de coordenadas
    Hacer 25 mates en 1
    Aprender la apertura italiana

No es un curso nuevo ni un tipo de contenido nuevo — es una capa fina que
apunta a lo que ya existe y **cuenta lo que ya se guardaba**.

### Lo que se guarda es lo que pasó; el avance se calcula

`tareas` es el encabezado (a quién, con qué fecha) y **`tarea_items` son los
renglones**: uno por cosa que hacer, con su material, su recorte y su meta.
Cuánto lleva de cada uno **no es una columna**: lo cuenta
`public.tareas_con_avance()` a partir de `training_progress` y
`platform_activity_log`, que son las filas que el alumno ya venía dejando al
entrenar. Es la misma decisión de `cobros.estado`, que no guarda "pagado": un
contador aparte habría que mantenerlo al día con un trigger por cada ejercicio
resuelto y podría contradecir a las filas que lo respaldan.

**Y eso es exactamente lo que hace que la tarea "se rellene sola" y que el
alumno no repita ejercicios.** Entra por el enlace del renglón, la página de
entreno arranca en el primero SIN resolver (`firstUnsolvedIndex`, que ya
existía), y cada uno que resuelve cuenta para la tarea **y** queda marcado
como resuelto. Son el mismo acto, no dos contadores que puedan separarse.

- **Tres metas, y elegir mal la meta no da ningún error**: `cantidad`
  (ejercicios distintos), `minutos` (rato de verdad en la página) y
  `completar` (lo único que el alumno marca a mano). Una herramienta que **no**
  escribe en `training_progress` —Estudio, a propósito— no puede ofrecer
  `cantidad`: la barra se quedaría clavada en cero para siempre y la página se
  vería perfecta. Por eso `js/material-plataforma.js` declara qué metas admite
  cada cosa y `verificar-tareas.js` lo comprueba.
- **`tarea_items.actividades` es un ARREGLO, y ahí está el error fácil.** Con
  qué nombre apunta una página en `training_progress` no siempre es su slug:
  Practicar y Desafíos apuntan las dos como `'practicar'`, y un tema del grupo
  de táctica apunta como `'tactica'` mientras el resto de los temas apunta como
  `'temas'` (ver `temasDeTactica()`). Deducirlo del slug dejaría esos diez
  ejercicios contando contra cero sin que nada fallara. Desafíos por eso **no
  ofrece `cantidad`**: sus series no se pueden distinguir de las de Practicar.
- **El avance se cuenta desde `tareas.created_at`**, no desde siempre: lo que
  se pide son diez ejercicios **nuevos**, no diez que ya tenía hechos. Está
  comprobado en la base con datos reales (una tarea fechada hace 30 días cuenta
  los 395 ejercicios de ese alumno; la misma tarea fechada ahora cuenta 0).
- **Los minutos se cuentan con `minutos_por_tramos()`**, la misma función que
  los informes: una tarea que dijera otro número que Informes sería peor que no
  tenerla.
- `tareas_con_avance(alumno, profesor, solo_pendientes, limite)` la usan las
  tres pantallas: la del alumno, la del profesor y la franja de `clases.html`
  (que pasa `p_limite: 50`, porque solo pinta la más próxima y el conteo — no
  tiene por qué bajarse los renglones de cien tareas). Escribirla tres veces
  sería tres cuentas que pueden decir cosas distintas del mismo alumno.
- **`tareas.estado` y `tareas.completada_at` quedaron SIN USO.** La situación
  (`pendiente`/`vencida`/`completada`) la calcula la función a partir de los
  renglones, igual que `cobros_vista`. No se borraron de la tabla — quitarlas
  obligaría a una migración para nada, la misma decisión que con
  `game_state.shown_curso`. Las 17 tareas que ya existían se migraron a un
  renglón `completar` cada una, así que hay **una sola forma de leer una
  tarea** y ninguna página tiene que distinguir "de las de antes".

### El enlace deja al alumno DENTRO del ejercicio

Era la otra mitad del problema: una tarea que dice "10 de ataque doble" y un
enlace que cae en la lista de ochenta temas le deja el trabajo de buscar al
alumno, que es justo lo que la tarea viene a evitar.

- `entreno/temas.html?tema=<key>` y `entreno/mates.html?cat=<categoria>` son
  nuevos; `estudio.html?ficha=` y `aperturas.html?linea=` ya existían. El
  `material_href` que queda guardado en el renglón **ya trae el recorte**.
- Los recortes (los 80 temas, las 3 categorías de Mates, las 40 líneas de
  Aperturas, las 56 fichas de Estudio) salen de `entreno/data/metas.json`, que
  **genera `python3 herramientas/metas-indice.py`** leyendo los bancos de
  verdad. No se bajan los bancos enteros en `tareas.html`: `temas.json` ya pesa
  1,8 MB, y esa página es para elegir ejercicios, no para resolverlos — sería
  la piedra de la portada con el libro de aperturas otra vez. **Al agregar un
  tema, una categoría o una línea, correrlo**; el verificador compara el índice
  contra las fuentes, porque un índice viejo le ofrece al profesor un tema que
  ya no existe y eso solo lo descubre el alumno al abrir el enlace.

### La franja de la tarea vive dentro del ejercicio

`js/tarea-en-curso.js` (cargado en las 14 páginas que el catálogo puede mandar)
pinta arriba qué le pidieron y cuánto lleva — "Coordenadas · 7 de 10 minutos"—
y avisa al llegar. Sin `?tarea=` en la dirección no hace absolutamente nada,
así que ponerlo en una página de más no cuesta.

Existe porque el alumno está **ahí**, resolviendo: sin la franja tendría que
volver a Tareas para saber si ya hizo los diez, y lo más probable es que no
vuelva — haría siete, o veinte. **No lleva su propia cuenta**: el número sale
de la misma `tareas_con_avance()` que pinta `tareas.html` y el panel. Se
refresca envolviendo `EntrenoProgress.log()`, así sube al resolver y no le pide
nada a la base mientras el alumno piensa.

### Lo que el alumno no puede tocar

- El insert exige `profesor_id = auth.uid()` SIEMPRE, `is_admin` incluido, y
  las tareas siguen **aisladas por profesor**: un profesor solo ve las que ÉL
  mandó, no las de un colega que comparte el mismo alumno. Es la misma decisión
  de aislamiento que `class_sessions` y `game_state`.
- **`proteger_tarea_items_alumno()`** (mismo patrón que
  `proteger_tiempos_de_presencia()`: `new := old` y después solo la columna que
  puede moverse) deja al alumno marcar `completada_at` **y solo en los
  renglones `completar`**. Comprobado impersonando roles en SQL: un update del
  alumno bajándose la meta de 25 mates a 1, quitando el filtro y marcándose el
  renglón medible deja las tres cosas como estaban; el renglón de curso sí
  queda marcado. Una profesora que no tiene a ese alumno recibe **cero filas**.
- **Mandar la tarea es UNA llamada** (`public.crear_tarea()`, `SECURITY
  INVOKER`, así que los dos inserts pasan por la RLS como si los hiciera el
  navegador). Partido en dos —el encabezado y después los renglones— si la
  segunda mitad falla queda una tarea vacía en la lista del alumno y eso no da
  ningún error. Es la decisión que ya tomaron `inscribir-alumno` y
  `create-student`.
- El aviso push sale solo, del trigger `avisar_tarea_asignada`.
- `estado` nunca vale "vencida", igual que `cobros.estado`: eso se calcula
  contra `vence_at`.

**Al tocar `tareas.html`, `js/material-plataforma.js`, `js/tarea-en-curso.js`,
los deep links o la tabla `tareas`, correr `node
herramientas/verificar-tareas.js`** (con el sitio en localhost:8777,
playwright y `npm install chess.js@0.10.3`). Existe porque `tareas.html` está
detrás del login: `verificar-css.js` no la ve nunca. Comprueba que el índice de
metas siga coincidiendo con los bancos, que ninguna herramienta ofrezca una
meta que no puede medir, que el profesor arme dos renglones y se mande **la
actividad correcta** (`tactica` y no `temas` para un tema de táctica — con la
equivocada la barra no subiría nunca), que el enlace lleve el recorte y la
tarea, que el alumno vea su avance con una barra por renglón y **solo pueda
marcar el que no se mide**, que marcar uno de tres no dé la tarea por hecha,
que la franja se vea de verdad dentro del ejercicio (se mide el `display` que
calcula el navegador) y que sin `?tarea=` no aparezca, y que `?tema=` y `?cat=`
abran de verdad lo que piden.

Lo que se rompe acá no da error: un renglón que cuenta la actividad equivocada,
un enlace sin su recorte, o una tarea que se le manda a todos los alumnos en
vez de a los marcados.

## El plan de clase: preparar la clase antes de darla

`sesion.html` es potentísimo EN VIVO —editor de posición, PDF, lección de curso,
Táctica, archivos PGN, preguntar, practicar— pero todo hay que ir a buscarlo
sobre la marcha, con la clase mirando. `planes.html` es donde se arma antes.

**Lo que de verdad compra es REUSARLO**: el mismo plan se da al grupo de la
mañana y al de la tarde, y ahí es donde una clase suelta se vuelve un programa.
Por eso el plan **no está atado a una clase ni a un grupo**, y por eso tiene
"⧉ Duplicar": se copia entero y se le cambia lo que haga falta sin tocar el
original.

- `planes_clase` es el encabezado (título y las notas del profesor) y
  **`plan_items` son los renglones**, en orden.
- **`js/plan-clase.js` es lo único que sabe leer y escribir un plan**, porque lo
  usan el armador y la clase en vivo. Escrito dos veces, se separarían a la
  primera corrección.

### Los tres tipos existen porque la clase en vivo YA tiene su puerta

| tipo | qué hace | por dónde entra |
|---|---|---|
| `posicion` | la transmite a toda la clase | `aplicarPosicionEnClase()` |
| `leccion` | la abre **solo en su pantalla** | `abrirLeccionLocal()` |
| `nota` | no toca el tablero: es su chuleta | — |

**Un tipo nuevo sin su puerta deja un renglón que no hace nada al tocarlo**, en
medio de la clase y delante de todos, sin dar ningún error. Y ninguno arma su
propio `update`: si lo hiciera, el que se olvidara de limpiar las variantes o de
quitarle el control al alumno dejaría la clase con un resto de la posición
anterior — la misma razón por la que las tres puertas de antes pasan todas por
`aplicarPosicionEnClase()`.

- **El `CHECK plan_items_coherente` es lo que impide guardar un renglón sin lo
  que su tipo necesita** (una posición sin FEN, una lección sin número). Sin él
  el renglón se ve perfecto en el armador y no hace nada en la clase.
- **La `pregunta` de un renglón NO le llega al alumno.** `questions` no tiene
  enunciado: el alumno contesta moviendo, como en Táctica. Es la chuleta del
  profesor para no tener que acordarse de qué iba a preguntar, y el armador lo
  dice con todas las letras — prometer que el alumno la lee sería mentirle.
- **`expected_plies` va en 1 y no se guarda en el plan**, a propósito: el caso de
  todos los días es "¿cuál es la jugada?", y un campo más que llenar al armar se
  queda sin llenar. Si hace falta otra cantidad, el panel de Preguntar la cambia
  como siempre.
- **En pantalla las lecciones se numeran desde 1 y en la base desde 0**, que es
  como las cuenta `abrirLeccionLocal()`. Separarlos abre la lección de al lado, y
  eso no da ningún error: simplemente se da la clase que no era.

### La validación de la posición se mudó a `js/posicion-valida.js`

`motivoPosicionInvalida()` vivía dentro de `sesion.html`. El armador necesita la
**misma** pregunta y la necesita ANTES: una posición que rompe a Stockfish
guardada en el plan no da ningún error hasta que el profesor la manda al
tablero, delante de todos. Enterarse al guardarla cuesta una corrección;
enterarse allá cuesta la clase.

- En `sesion.html` queda el nombre de siempre, que usan sus cuatro puertas, y va
  como **`function` y no como `const`**: la primera de esas puertas está escrita
  más ARRIBA en el archivo, y un `const` no existe hasta que se evalúa su línea
  — el mismo "Cannot access before initialization" que dejó a `4x4.html` colgada
  en "Comprobando tu sesión…".

### Detalles del armador

- **Reordenar manda el `orden` de CADA renglón que se movió**, no solo del que
  cambió: con dos renglones en el mismo número, el orden que sale depende de cómo
  resuelva el empate la base, o sea que el plan se ve distinto cada vez sin que
  nada falle.
- **Los cursos salen de `herramientas/cursos/catalogo.json`**, la misma fuente que
  las tarjetas de `cursos.html`: una segunda lista se iría quedando vieja y le
  ofrecería al profesor un curso que ya no existe.
- **Cuál plan está dando se recuerda en `localStorage`** (`plan_en_clase`), como
  el tema o la clase elegida: si se recarga la página en medio de la clase —que
  pasa— no hay que volver a buscarlo en la lista.
- Las notas del plan **se guardan al salir del campo**, sin botón: es un campo
  que se toca de pasada mientras se arma el resto.

### Quién puede qué

Un plan es **del profesor que lo escribió**: una colega no lo ve hasta que él se
lo comparte (ver abajo). Quien administra los ve todos (la regla permanente de
siempre) pero **no los edita** — el material de un colega no es de nadie más. El
insert exige `profesor_id = auth.uid()` y `role = 'profesor'` o `is_admin`, así
que un alumno no puede crear ninguno, y a `anon` se le revocan los permisos de
tabla. Comprobado impersonando roles en SQL, 12 casos.

### Compartir un plan: se ve y se duplica, NO se edita

El dueño elige con quién. Son dos formas, y conviven porque contestan preguntas
distintas: `planes_clase.compartido_todos` es "con todo el equipo docente" —el
caso de los planes de arranque y del material de la Academia, que alcanza además
a quien entre después— y `public.plan_compartidos (plan_id, profesor_id)` es
"esto es para ti". **A quien lo recibe le da igual por cuál de las dos le
llegó**, así que las dos se leen en la misma lista de "Compartidos contigo".

- **Lo único que se amplió es el `select` del plan.** El `update` y el `delete`
  siguen exigiendo `profesor_id = auth.uid()`, así que el colega lo da en su
  clase y lo duplica, pero no lo toca. Los renglones se ampliaron **solos**: la
  política de `plan_items` cuelga del select de `planes_clase` y no de la
  columna — el mismo principio que ya regía para `profesores_de()`.
- **Las dos preguntas van en funciones `SECURITY DEFINER`**
  (`soy_dueno_del_plan()`, `plan_compartido_conmigo()`) y no escritas dentro de
  la política. No es estilo: la política de `planes_clase` mira
  `plan_compartidos` y las de `plan_compartidos` miran `planes_clase` — una RLS
  llamando a la otra es **recursión infinita**, y el error salta en la cara de
  quien abre la página, no al escribirla.
- **"Todo el equipo docente" es el equipo docente.** La política lleva el filtro
  de rol escrito; sin él, un alumno que preguntara por `planes_clase` se llevaría
  todos los planes marcados así —con las soluciones de sus propios ejercicios en
  la chuleta de cada renglón— y no daría ningún error.
- **Y compartir de a uno también.** `plan_compartidos_insert` exige, además de
  ser el dueño, que el destinatario sea del equipo (`es_del_equipo_docente()`):
  sin eso, nada impedía poner ahí el id de un alumno.
- **`equipo_docente()` y `planes_compartidos_conmigo()` existen por lo mismo:**
  la RLS de `profiles` no le deja a un profesor ver a sus colegas (solo sus
  alumnos y a sí mismo — comprobado: uno ve 46 perfiles y **un solo profesor, él
  mismo**). Sin esas dos funciones, el selector saldría vacío y los planes
  compartidos, sin autor — que es justo el dato que dice si vale la pena abrirlo.
- **En pantalla, lo que no se puede hacer no se ofrece.** Sobre un plan ajeno no
  se pintan "Borrar plan", el formulario de renglones, los ↑ ↓ ✖ ni el apartado
  de compartir; las notas van `readOnly` **y no `disabled`** (un campo
  desactivado sale del recorrido del teclado y quien no ve la pantalla no se
  enteraría de que están ahí). La base los rechazaría igual, pero el fallo lo
  descubriría la colega. El modo **se pinta entero al abrir cada plan**, no
  prendiendo y apagando lo que cambió: es el mismo descuido que dejaría el botón
  de borrar encima del material de otra persona.
- **Con "todo el equipo" marcado, elegir de a uno se esconde**: ya lo ven todos,
  así que sería un control que no cambia nada.
- **En la clase en vivo los dos grupos van en el MISMO selector**, con su
  `<optgroup>`: a la hora de dar la clase un plan compartido se da igual que uno
  propio — lo que cambia es quién lo edita, y eso es en el armador. Si los
  compartidos no llegan, se dice y **los propios se siguen ofreciendo**: quedarse
  sin plan en medio de la clase por eso sería peor.

Comprobado impersonando roles en SQL, 16 casos: el colega no ve nada antes de
que se lo compartan; después ve el plan y sus renglones pero editarlo, borrarlo,
borrarle un renglón y quitarse el compartido cambian **0 filas**; otra profesora
no lo ve hasta que se marca "todo el equipo"; un alumno no lo ve ni con eso;
compartirlo con un alumno se rechaza; `equipo_docente()` le da 3 a un profesor
(sin él) y **0 a un alumno**; y el colega sí puede duplicarlo entero.

**Al tocar `planes.html`, `js/plan-clase.js`, `js/posicion-valida.js` o el panel
del plan de la clase en vivo, correr `node herramientas/verificar-planes.js`**
(con el sitio en localhost:8777, playwright y `npm install chess.js@0.10.3`).
Comprueba que una posición que rompe a Stockfish **se rechace al guardarla y no
se mande nada a la base**, que la buena entre con su tipo, su FEN, su pregunta y
su orden, que la lección 5 se guarde como 4, y que subir un renglón **renumere
los dos** que se movieron. De compartir comprueba qué se MANDA (el plan abierto y
el profesor elegido, y que quitar filtre por **las dos** columnas), que sin nada
compartido el apartado no se destape, y que sobre un plan ajeno no se pinte ni un
botón que vaya a fallar —pero sí el de duplicar, y que la copia quede a nombre de
quien la hizo—. Sirve chess.js desde `node_modules`: sin él
`PosicionValida.motivo()` revienta y el armador deja de validar — que es justo lo
que la prueba viene a comprobar.

### Los 53 planes de arranque

`planes.html` nacía vacía, y una página vacía no se usa: el profesor entra, no
ve nada y se vuelve a la forma de siempre. Los planes de arranque son **53
clases listas para dar** —12 de finales, 5 de estrategia, 10 de apertura, 3 de
celadas, 16 de táctica, 5 de mates con nombre y 3 de mates en 1, 2 y 3—, con 303
renglones y 262 posiciones.

**NINGUNA POSICIÓN SE INVENTA.** Todas salen de bancos que este repositorio ya
verificó, y `herramientas/planes-semilla.js` es lo único que las arma:

| de dónde | qué sale |
|---|---|
| `cursos/protegido/data/el-mapa-de-los-finales.json` | 240 diagramas, 12 capítulos |
| `cursos/protegido/data/estrategia-en-el-final.json` | 6 diagramas |
| `js/aperturas-lineas.js` | las 40 líneas |
| `entreno/data/temas.json` | los ejercicios de Lichess |
| `entreno/data/mates.json` | mate en 1, 2 y 3 |

Inventar una posición es el error que este repositorio ya cometió una vez, con
una «Lucena» que no era Lucena. Y cada FEN vuelve a pasar por la **misma**
validación que hace la clase en vivo (`js/posicion-valida.js`) antes de entrar a
un plan: enterarse al sembrar cuesta una corrección; enterarse en clase cuesta la
clase.

- **Qué temas de táctica se siembran es una decisión editorial ESCRITA**
  (`TEMAS_QUE_SE_ENSENAN`), como `AREAS_DEL_CURSO` en los exámenes. `temas.json`
  trae 79 temas y sembrarlos todos daría 79 planes; elegirlos por «el que tenga
  más ejercicios» tampoco sirve, porque casi todos tienen 100 y tener muchos no
  hace a un tema didáctico.
- **La chuleta de cada renglón lleva la solución**, y eso está bien: el panel del
  plan solo lo ve el profesor, como el PDF y la lección de curso. No hay ningún
  lugar donde el alumno la lea.
- **La chuleta de un final se arma con `jugadas[].san`, NO con el campo
  `linea_es` del banco.** Ese campo es texto suelto y tiene capturas escritas sin
  la x: en «Retrasando la captura» dice `Ra5` donde la jugada de verdad es
  `Rxa5`. Como nunca fue más que texto, no falló nada en meses — pero puesto en
  la chuleta es lo que el profesor lee en voz alta delante de la clase, y no se
  puede jugar.
- **Una celada que termina en mate se siembra UNA JUGADA ANTES**, con la chuleta
  diciendo cuál remata. Dos razones: la posición final no tiene jugadas legales y
  no entra al tablero de la clase, y sembrarla sería enseñarles el mate ya
  puesto en vez de darles algo que encontrar.
- Los planes llevan la marca `· AI` en el título, y el SQL que genera el script
  los borra por ahí antes de sembrar: **se puede volver a correr sin duplicar** y
  sin tocar los que el profesor armó a mano.
- La salida (`herramientas/planes/`) **no se commitea**: se regenera con el
  script. Lo que vive en el repositorio es cómo se arman.

**Al tocar el generador o cualquiera de esos bancos, correr `node
herramientas/planes-semilla.js && node
herramientas/verificar-planes-semilla.js`** (necesita `npm install
chess.js@0.10.3`; no hace falta navegador ni red). Comprueba las cuatro cosas que
se rompen calladas: que ninguna posición sembrada la rechace la regla de la clase
en vivo —corriendo **la del propio `js/posicion-valida.js`**, no una copia—, que
**la solución escrita en cada chuleta se pueda jugar de verdad** (1.224 jugadas
con chess.js), que lo que promete mate sea mate, y que cada posición de apertura
salga de jugar su línea (o la de justo antes del mate, con su remate
comprobado). Un plan vacío, repetido o con el orden con huecos también salta.

**Se siembran a nombre de un profesor** (`PROFESOR_ID`, la variable de entorno
del script) y desde ahí se reparten: marcándolos «con todo el equipo docente» en
`planes.html` los ve el equipo entero, incluido quien entre después. Resembrarlos
por profesor ya no hace falta, y no conviene: serían 53 copias que se van
separando a la primera corrección.

## La bitácora: lo que el profesor observa, donde lo observa

Hasta ahora lo único que el profesor podía escribir de un alumno era
`class_sessions.notes`: **un `<input>` de una sola línea, por clase entera y sin
alumno**. No había dónde poner "a Sofía le cuesta el final de torre, revisarlo en
dos semanas", que es la materia prima del seguimiento — y sin eso, ni el plan de
la clase siguiente sabe qué repasar ni el informe a la casa tiene qué explicar.

`public.notas_alumno` es una fila por observación (alumno, profesor, texto,
etiqueta, `compartida`). Se escribe desde dos lugares y se lee desde tres, así
que la lógica vive en **`js/notas-alumno.js`** y no en ninguna de las páginas:

- **`sesion.html`**, con el botón **📝** de cada alumno conectado. Va ahí porque
  ese es **el momento en que se ve lo que hay que anotar**: si hay que esperar a
  volver a Informes, no se anota. En modo compacto (las últimas 5), colgando del
  panel de Alumnos, y solo lo ve el profesor — como el PDF y la lección de curso.
- **`informes.html`**, bloque "📝 Bitácora" del informe individual, que es cuando
  se repasa.
- Y de solo lectura, el **propio alumno**, en su página de Informes.

### Quién ve qué lo decide la base

- **Aislada por profesor, igual que `tareas` y `class_sessions`**: un profesor ve
  las notas que ÉL escribió, no las de un colega que comparte el mismo alumno.
  Quien administra ve todas, como en `tareas` — la regla permanente de que todo
  lo de los profesores vale para quien administra, con su alcance.
- **El alumno solo ve las que tienen `compartida = true`** (misma idea que
  `training_plans.shared`) y **no puede escribir ninguna**: no tiene política de
  insert, update ni delete. Por eso su vista **no le pinta ni un botón**:
  ofrecerle "compartir" o "borrar" no rompería nada — la base los rechaza— pero
  el fallo lo descubriría él.
- **El insert exige `profesor_id = auth.uid()` SIEMPRE**, `is_admin` incluido:
  nadie firma una nota con el nombre de otro.
- **`proteger_notas_alumno()`** (mismo patrón que `proteger_tiempos_de_presencia()`:
  `new := old` y después solo lo que puede moverse) revierte `alumno_id`,
  `profesor_id` y `created_at`, y pone `updated_at` con el reloj del servidor.
  Sin eso, una nota se podía mudar de alumno con un update.
- A `anon` se le revocan los permisos de tabla, como en `formularios`.

Comprobado impersonando roles en SQL, 15 casos: el profesor escribe sobre su
alumno y no sobre uno ajeno, no firma como otro; **una colega que comparte el
mismo alumno recibe cero filas**; el alumno no ve la privada, sí la compartida,
y sus intentos de editarla o borrarla cambian **0 filas**; el trigger revierte la
mudanza de alumno y la fecha regalada.

### El bloque del alumno solo aparece si hay algo

`montarLectura()` devuelve cuántas pintó y la página esconde el bloque entero
cuando son cero. Un bloque que diga "tu profesor no te ha escrito nada" es ruido
en todas las visitas menos una — la misma lección del cartel de instalar la app.
Y si la consulta **falla**, se dice: una bitácora vacía y una que no se pudo leer
se ven igual y son cosas muy distintas.

### De la nota a la tarea, sin copiar nada

Cada nota trae **"📋 Convertir en tarea"**, que lleva a
`tareas.html?alumno=<id>&nota=<id>`: marca ese alumno y pone el texto en "Nota
para el alumno". Observo, asigno. Dos detalles que no son de estilo:

- **El texto NO viaja en la dirección, solo el id.** `tareas.html` lo lee de la
  base, que ya se lo deja leer a quien la escribió. Una dirección con lo que el
  profesor anotó de un alumno queda en el historial del navegador, y esa nota
  puede ser privada.
- **El título no se toca.** Lo propone la página desde el renglón elegido;
  pisarlo con la etiqueta de la nota dejaría al profesor corrigiendo a mano un
  campo que antes salía bien.

### Detalles que ya costaron una vez

- **Que la nota esté compartida va ESCRITO** ("👁️ La ve el alumno"), no solo con
  otro color: la misma regla de los gráficos de Informes y de las barras del
  diagnóstico.
- **Borrar pide confirmación en el propio botón**, no con un diálogo del
  navegador: una nota se escribe en medio de una clase, desde el celular, y ahí
  el diálogo tapa la pantalla.
- **Las clases de CSS van escritas enteras**, nunca armadas con una expresión
  regular sobre `className`: el CSS se compila leyendo el código, así que una
  clase a medias no se escribe en la hoja y no pinta nada, sin dar ningún error.
- **El panel se monta entero al cambiar de alumno**, en vez de ir actualizando la
  lista: así no hay que acordarse de limpiar lo del anterior, que es justo el
  descuido que dejaría al profesor escribiendo sobre quien no era.
- El texto de una nota y el nombre de un alumno **los escribe una persona**, así
  que van siempre por `textContent` — la misma regla que ya sigue
  `renderStudentsList()`.

**Al tocar `js/notas-alumno.js`, el bloque de Informes, el botón de la clase en
vivo o el enlace a Tareas, correr `node herramientas/verificar-notas.js`** (con
el sitio en localhost:8777 y playwright). Existe porque todo lo que se rompe acá
se rompe callado: una nota mandada con el `alumno_id` equivocado queda en la
ficha de otro y la pantalla se ve perfecta. Comprueba qué se MANDA al guardar
(alumno, autor, texto, etiqueta y la marca de compartir), que compartir lo diga
con todas las letras, que el enlace a Tareas lleve el id y **no el texto**, que
cambiar de alumno traiga su bitácora y suelte la del anterior, que al alumno no
se le pinte ningún botón, y que su bloque **se vea de verdad** con una nota
compartida y **no se destape** sin ninguna (se mide el `display` que calcula el
navegador, no la clase). Su Supabase de mentira **filtra de verdad por `eq`**:
uno que devolviera siempre la tabla entera daría por buena una página que mezcla
las notas de dos alumnos.

## Exámenes: acá se ejecuta y se demuestra, no se practica

`examenes.html` (armar y ver) y `examen.html?id=…` (rendir) son la otra mitad
de Tareas, y la diferencia no es de grado:

| | Tareas | Exámenes |
|---|---|---|
| qué mide | que lo haga | que lo sepa |
| intentos | los que quiera | **uno por pregunta** |
| ayuda | pistas, deshacer, repaso espaciado | ninguna |
| avance | se llena solo con lo que entrena | se rinde de una vez, con reloj |
| resultado | una barra | **una nota**, ponderada por dificultad |

Una tarea dice "resuelve 10 de ataque doble" y el alumno los hace cuando
quiera, con las pistas que quiera. Un examen le pone 10 preguntas delante, con
reloj, y cada una se contesta una sola vez.

### Lo que NO puede pasar, y dónde se impide

Todo lo que sostiene un examen se rompería callado si viviera en el navegador,
así que nada de esto vive ahí:

- **La respuesta correcta no llega nunca al alumno.** Vive en
  `examen_items.clave`, y esa tabla **no tiene política de select para él** —
  ni siquiera para sus propias preguntas, porque la clave viaja en la misma
  fila. Lo que ve se lo sirve `examen_para_alumno()`, que arma el JSON
  **columna por columna**: un `select *` de ahí se llevaría la clave, y es
  justo el descuido que esa función existe para hacer imposible. Comprobado
  impersonando roles en SQL: leer `examen_items` directo le da **0 filas**, y
  el JSON de su examen no contiene ni `clave`, ni `correcta`, ni `casillas`,
  ni `jugadas`.
- **El ejecutor tampoco carga el banco.** Las preguntas se COPIAN al examen al
  crearlo, así que `examen.html` no necesita `diagnostico-items.js` — si lo
  cargara, el alumno se bajaría las 301 respuestas junto con su examen.
- **Una sola oportunidad la hace cumplir el UNIQUE de `examen_respuestas`**, no
  un `if`: dos pestañas mandando a la vez no pueden colar dos. Y esa tabla no
  tiene política de insert ni de update — solo escribe `responder_examen()`.
- **El reloj es del servidor.** `termina_at` lo fija `iniciar_examen()` con
  `now()`, y `responder_examen()` rechaza lo que llegue tarde. El alumno no
  puede escribir en `examenes` (no tiene política de update): comprobado, su
  intento de regalarse tiempo cambia **0 filas**. Volver a entrar **no
  reinicia** el reloj: cerrar y abrir la pestaña regalaría el tiempo entero.
- **El mínimo de un minuto por pregunta lo valida `crear_examen()`**, no la
  pantalla. Un mínimo que solo comprueba el navegador se salta desde la
  consola.
- **La nota se guarda, no se recalcula.** Es el acta del examen: recalcularla
  mañana, con un banco que cambió, daría otro número. Es la excepción a la
  regla de `cobros`/`tareas` —donde lo que se calcula no se guarda— y la razón
  es distinta: ahí el estado deriva de filas que siguen vivas; acá deriva de un
  banco que cambia.

### La nota pondera por dificultad

Cada pregunta vale su `peso` (1 a 5, que es la dificultad que ya traía el banco
del diagnóstico). `nota = 10 × puntos / puntos_posibles`. Acertar cinco fáciles
no es lo mismo que acertar dos difíciles, y se nota: en la comprobación, un
alumno que acierta la de peso 1 y la de peso 5 y falla la de peso 2 saca
**7,50**; por aciertos a secas habría sacado 6,67.

Lo que **no** alcanzó a contestar vale cero — eso es lo que significa que se le
acabó el tiempo— pero **cuántas de cuántas respondió se guarda aparte**
(`respondidas`/`total_items`) y el informe lo dice por separado: no es lo mismo
fallar diez que no llegar a verlas.

### Las preguntas no se inventan

Salen de bancos que ya estaban verificados, vía `js/examen-banco.js`:

- **`js/diagnostico-items.js`** — 301 preguntas, 9 áreas, peso 1-5, cuatro
  tipos (opción, opción con tablero, jugada, casilla). De acá salen las
  preguntas "sobre un tema de un curso": `AREAS_DEL_CURSO` dice qué áreas cubre
  cada curso, y es una decisión editorial escrita, no deducida. Un curso que no
  esté ahí **lo dice** en vez de devolver un examen vacío.
- **`js/arbitraje-items.js`** — 200 de reglamento.
- **`js/aperturas-lineas.js`** — las 40 líneas, para "ejecuta la italiana de
  una vez": el rival contesta solo y el alumno da sus jugadas **sin pistas y
  sin deshacer**. Es la misma línea que en `entreno/aperturas.html` se practica
  con ayuda y repaso espaciado; acá se demuestra.

**Las opciones se barajan al armar el examen** y la clave guarda el índice ya
barajado, así que el número que queda en la base no dice nada por sí solo. Eso
tiene una trampa que el verificador vigila sobre 1.600 preguntas: si el
barajado mueve el texto y no el índice, **se califica mal el examen entero** y
nadie se entera — los alumnos reprueban y no hay ningún error.

Y `clave.correcta` se guarda como **texto**, no como número: en la base se
compara con `->>'opcion'`, que también es texto. Un número contra un texto en
jsonb da `false` siempre.

### Un examen se arma sumando bloques, como los renglones de una tarea

"10 de finales + 5 de reglamento + ejecutar la italiana" es **un** examen. Antes
salía de una sola fuente, así que para medir dos cosas había que poner dos
exámenes — y el alumno recibía dos relojes y dos notas de lo que para el
profesor era una sola prueba.

**La base ya lo aguantaba**: `crear_examen()` recibe las preguntas en un arreglo
y no le importa de dónde salió cada una. Lo único que había que cambiar era la
pantalla, que es la que armaba de una sola fuente.

- Cada bloque tiene su fuente, su recorte, su cantidad y su rango de dificultad,
  y dice cuántas preguntas hay para elegir. Los controles llevan el número del
  bloque en el id (`b1-fuente`, `b2-cantidad`), que es por donde los agarra el
  verificador.
- **Dos bloques pueden pedir del mismo banco**, y ahí está el error fácil: "10
  de finales" y "5 de finales" son dos bloques legítimos, y sin quitar las
  repetidas el examen llevaría la misma pregunta dos veces. El alumno la
  contestaría dos veces y **valdría doble en la nota**, con el examen viéndose
  perfecto. Se descartan por `banco/item_id` **y se dice cuántas se quitaron**,
  en vez de dejar el examen más corto de lo que el profesor pidió sin
  explicación.
- **Con un solo bloque no se ofrece quitarlo.** Un examen sin preguntas no
  existe, y un botón que va a fallar es peor que no tenerlo.
- El título propuesto nombra los dos primeros bloques y cuenta el resto
  ("Examen de Finales y reglamento y 2 cosas más"): encadenar cinco no se lee en
  la lista del alumno.
- El tiempo recomendado se calcula sobre **el examen entero ya armado**, con las
  repetidas fuera.

### Cuántas veces puede salirse de la pantalla lo decide el profesor

Eran tres siempre, escritas como una constante DENTRO de
`registrar_salida_examen()`: el mismo rigor para un quiz de práctica que para
una prueba de fin de curso. Ahora es `examenes.salidas_permitidas`, que elige
quien pone el examen.

- **La columna guarda cuántas salidas se PERDONAN, no el tope al que congela.**
  Es lo que el profesor está decidiendo ("le permito dos") y lo que la pantalla
  le dice al alumno ("te quedan dos"). El 2 por omisión es el comportamiento de
  siempre: perdona la primera y la segunda, y a la tercera congela.
- **NULL es "no congelar nunca"**: las salidas se siguen contando y van igual en
  el informe, pero el examen no se cierra solo. Es para un examen en el aula,
  con el profesor al lado, donde cerrarle la pantalla a un chico porque le entró
  una notificación es peor que anotarlo. En el formulario, `""` viaja como
  `null` y **no** como 0 — cero significa lo contrario, congela a la primera, y
  confundirlos le cerraría el examen en la cara al primer despiste.
- **El tope lo sigue haciendo cumplir el servidor**, igual que el mínimo de
  tiempo: `crear_examen()` valida el rango y `registrar_salida_examen()` lee el
  del examen. La pantalla solo elige.
- **La antesala y el aviso dicen el tope de ESE examen**, no un "a la tercera"
  escrito a mano: avisar de un margen que no se tiene es peor que no avisar. Y
  si el campo **no llega** (una versión vieja de `examen_para_alumno()`), la
  página asume el tope de siempre en vez de "no congela" — equivocarse hacia el
  aviso de más no le cuesta nada al alumno, hacia el de menos le cuesta el
  examen.
- **El informe del profesor dice el número Y el tope**: tres salidas en un
  examen que perdonaba cinco no es lo mismo que tres en uno que perdonaba dos, y
  el número solo no lo dice.
- Comprobado impersonando al alumno en una transacción revertida, los tres
  casos: con 0 la primera salida congela; con 2 quedan 2 avisos, después 1, y la
  tercera congela (idéntico a lo de antes); sin tope, cuatro salidas no congelan
  y **las cuatro quedan contadas**.

### El tiempo: recomendado o a mano, pero siempre el que se enseñó

El profesor elige entre **"Recomendado"** —lo calcula el sitio— y **"Lo elijo
yo"**. El mínimo de un minuto por pregunta lo sigue haciendo cumplir
`crear_examen()` en los dos casos.

**No hay ninguna IA detrás de la recomendación, y no la habría aunque se
quisiera**: este sitio no usa ningún modelo de lenguaje (la misma decisión que
`js/reporte-textos.js`, que ordena pero no resume). Es
`ExamenBanco.minutosRecomendados()`, una cuenta sobre lo que hay que HACER en
cada pregunta: leer cuatro frases (60 s), leer además una posición (90 s),
señalar una casilla (75 s) o calcular una jugada (120 s), estirado o encogido
por la dificultad (×0,7 en peso 1, ×1,3 en peso 5). Una línea de apertura se
mide por las jugadas que le tocan al alumno, a 30 s cada una — y **ahí no se
multiplica por el peso**, porque el peso de una línea ya se calcula a partir de
esa misma longitud en `deLinea()` y sería contar lo mismo dos veces.

- **Que una pregunta de opción media dé justo 60 s no es casualidad ni se puede
  bajar sin pensarlo**: es el mismo minuto por pregunta que exige el servidor.
  La primera versión usaba bases más cortas y el mínimo tapaba el cálculo casi
  siempre — el "recomendado" devolvía la cantidad de preguntas y nada más, o
  sea que no recomendaba nada, y en pantalla se veía perfecto. Lo encontró el
  verificador, no la vista.
- **El `Math.max` contra el mínimo no es una precaución de adorno.** Sin él, un
  examen de diez opciones fáciles recomendaría 7 minutos contra un mínimo de
  10: el sitio le propondría al profesor un número que su propio servidor
  rechaza. El verificador lo mide sobre más de 400 exámenes armados.

**Y lo que se enseña es lo que se manda, en las dos mitades.** Las preguntas se
sortean UNA vez, al cambiar cualquier parámetro del formulario (`prevision`), y
son las mismas que viajan al apretar el botón. Antes se volvían a sortear al
mandar, que es lo natural de escribir y deja el defecto de siempre: el número
que el profesor leyó estaría calculado sobre unas preguntas y el examen
llevaría otras. No falla nada y el tiempo simplemente no corresponde. Después
de mandar, la previsión se tira, o poner el mismo examen al grupo de la mañana
y al de la tarde mandaría exactamente las mismas preguntas.

**El campo de minutos se ve SIEMPRE**, también en "Recomendado", y ahí va de
solo lectura — no desactivado: un campo desactivado sale del recorrido del
teclado y quien no ve la pantalla no se enteraría de cuánto dura el examen que
está por mandar. Debajo va escrito de dónde salió el número ("18 min para estas
12 preguntas (9 de opción, 3 con tablero). El mínimo es 12."), y en modo manual
se sigue diciendo cuánto era lo recomendado.

### El antitrampa: dos avisos y al tercero se congela

**Ninguna página web puede impedir que alguien cambie de pestaña** — eso solo
lo puede una app instalada con permisos del sistema. Prometer más que eso sería
mentirle al profesor. Lo que sí se hace:

- se pide **pantalla completa** al empezar (si el navegador la niega, el examen
  se hace igual: negarle rendir por la configuración de su navegador sería
  castigarlo por otra cosa);
- se detecta cada salida (`visibilitychange`, `blur` y salirse de pantalla
  completa, que es la forma más cómoda de poner otra ventana al lado);
- **el conteo lo lleva `registrar_salida_examen()`, no la página**: un contador
  del cliente se pone en cero desde la consola;
- los **dos primeros avisos perdonan** —una notificación del celular no puede
  costar el examen entero— y **al tercero se congela** y se califica con lo que
  llevaba. Solo el profesor lo reabre.
- **Las salidas van SIEMPRE en el informe**, aunque no se haya congelado: tres
  salidas cortas siguen siendo un dato que quien lee tiene que tener.

Volver a abrir un examen congelado reinicia **el reloj y el contador de
salidas**. Lo segundo no es un olvido: dejándolo en tres, se volvería a
congelar en cuanto el alumno parpadeara, o sea que reabrirlo no serviría de
nada. Las respuestas que ya dio **sí se conservan** —`examen_respuestas` no se
toca— así que sigue desde donde quedó y no vuelve a contestar lo mismo.

Y un examen congelado **sí tiene informe para el alumno**: `examen_informe()`
acepta los dos estados terminados (`entregado` y `congelado`). Exigir solo
`entregado` le dejaba un error en pantalla justo a quien más falta le hace
entender qué pasó.

### El aviso al celular, y las dos trampas que tenía

Al asignar un examen sale solo un aviso push, igual que con las tareas
(`avisar_tarea_asignada`). El trigger es `avisar_examen_asignado` y ninguna de
las dos cosas que tiene distintas es un capricho:

- **Es un `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED`, no un `AFTER
  INSERT` de siempre**, porque `crear_examen()` inserta la fila de `examenes`
  **antes** que sus preguntas. Un trigger normal corre ahí en medio y contaría
  `examen_items` cuando todavía no hay ninguna: el aviso diría **«0 preguntas»**
  sin que nada fallara. Diferido corre al COMMIT, con las preguntas ya puestas.
  Está comprobado en una transacción revertida, de las dos formas: diferido dice
  «7 preguntas en 7 minutos», y disparándolo a mano antes de los items dice «0
  preguntas en 7 minutos», que es exactamente el fallo que se evita.
- **La etiqueta lleva el id del examen** (`'examen:' || new.id`), no es
  `'examen'` a secas. `sw.js` la usa como `tag`, y el `tag` hace que un aviso
  REEMPLACE al anterior de la misma etiqueta. En tareas eso no cuesta nada
  porque el aviso lleva a `/tareas.html`, donde están todas; acá lleva a
  `/examen.html?id=<uno>`, así que un segundo examen taparía el aviso del
  primero **y con él su único enlace**. El examen seguiría asignado y el alumno
  no se enteraría de ese: el fallo callado de siempre.

El enlace va **directo a rendirlo** y no a una lista, que es la otra diferencia
con las tareas: un examen tiene reloj y una sola oportunidad, así que buscarlo
entre otros es un paso de más.

**Reabrir también avisa**, con `avisar_examen_reabierto`, y es el momento en
que más falta hace: el alumno se quedó congelado a mitad del examen y no tiene
forma de enterarse de que ya puede volver a entrar — sin aviso tendría que ir
probando la página cada tanto.

- **Ese va como `AFTER UPDATE` normal, no diferido**, al revés que el de
  asignar: acá las preguntas existen desde hace rato, no se están insertando en
  la misma transacción.
- **Su `WHEN` es lo único que lo separa del ruido**: `old.estado is distinct
  from 'asignado' and new.estado = 'asignado'`. Sin él saltaría también cuando
  el alumno empieza su examen, cuando se le cuenta una salida y cuando lo
  entrega — un aviso en el celular por cada cosa que él mismo acaba de hacer.
  Comprobado en una transacción revertida: esos cuatro updates no disparan
  nada, y el quinto —el de reabrir, el mismo que manda `examenes.html`— sí.
- **Dice cuántas le faltan, y ese número NO sale de `examenes.total_items`**:
  al reabrir, esa columna se pone en null junto con la nota (es del cierre
  anterior), así que leerla daría siempre null y el aviso no diría nada. Se
  cuentan `examen_items` menos `examen_respuestas`. Comprobado: con 6 preguntas
  y 2 contestadas dice «te faltan 4 preguntas y tienes 12 minutos», y con una
  sola, «te falta 1 pregunta y tienes 1 minuto».
- **Lleva la MISMA etiqueta que el aviso de asignación** (`examen:<id>`), a
  propósito: así reemplaza al anterior en la bandeja en vez de dejar dos avisos
  del mismo examen, y el que se queda es el que dice la verdad.

### El informe, y qué ve cada quien

`examen_informe()` es **una sola función para los dos públicos**, y lo que
cambia es cuánto devuelve: al profesor le da la respuesta correcta y la
explicación de cada pregunta; **al alumno no**. Dos funciones se habrían
separado a la primera corrección, y la del alumno es justo la que no puede
equivocarse: enseñarle las respuestas convierte el banco en un juego de memoria
para el examen siguiente. Es la misma decisión de `nivel-de-arbitraje.html`.

Al terminar, el alumno ve **su nota y cómo le fue por área**, nunca las
respuestas. El profesor ve pregunta por pregunta, con qué contestó, cuánto
tardó y si no llegó a verla.

**El correo a la casa lo manda `informe-examen`, una Edge Function APARTE de
`informes-encargados`.** Podría haber sido una acción más de aquella, pero esa
es la que `pg_cron` dispara todos los días para todas las familias: meterle
mano por un botón nuevo habría puesto en riesgo el camino que ya funciona, y si
se rompiera no daría ningún error — simplemente dejarían de llegar los
informes. Quién puede mandarlo lo decide la RLS (lee el informe con el JWT de
quien llama), y `informe_enviado_at` se marca **después** de que Resend acepte.
El correo a la casa lleva en qué se equivocó, **no las respuestas correctas**.

**Esto pide desplegar la Edge Function `informe-examen`** (ya desplegada desde
esta tanda; se arma con `node herramientas/funciones-armar.js`). Si algún día
queda sin subir, el botón lo dice en pantalla en vez de dejar creer que salió.

### Lo que este diseño NO cierra

`js/diagnostico-items.js` y `js/arbitraje-items.js` **siguen siendo archivos
estáticos que cualquiera con sesión puede leer**, porque los usan el
diagnóstico y el examen de arbitraje. Un alumno decidido puede buscar ahí la
pregunta que tiene delante. Lo que este diseño quita es lo fácil: su examen no
trae las respuestas, el ejecutor no carga el banco, y con pantalla completa y
un minuto por pregunta buscar entre 301 no sale gratis. Cerrarlo del todo
pediría servir los bancos desde una función con RLS, y eso es otro cambio.

`js/tablero-pregunta.js` es el tablero de una pregunta con respuesta, sacado
aparte para esta página. **`entreno/diagnostico.html` sigue con el suyo**, que
es el mismo dibujo acoplado a su `itemActual` y a su cuadro de comandos:
moverlo ahora arriesgaría `verificar-diagnostico.js` y
`verificar-cuadro-comandos.js` por un cambio que no se pidió. Unificarlos queda
anotado — es el mismo camino que siguió `js/cuadro-comandos.js`, que nació para
las páginas que no lo tenían.

**Al tocar los exámenes, correr `node herramientas/verificar-examenes.js`**
(con el sitio en localhost:8777, playwright y `npm install chess.js@0.10.3`).
Comprueba, sin navegador, que la clave siga apuntando a la respuesta correcta
después de barajar (sobre 1.600 preguntas) y que lo visible no la filtre; y en
un navegador de verdad, que dos bloques de fuentes distintas viajen en el MISMO
examen y que dos del mismo banco no cuelen una pregunta repetida (se mide sobre
las llaves de verdad, no sobre el conteo), que el total y el botón de quitar
sigan a los bloques, que el tope de salidas que se eligió sea el que se manda y
que su nota diga lo que de verdad va a pasar, que el tiempo recomendado nunca
quede por debajo del
mínimo que exige el servidor (sobre más de 400 exámenes) y que de verdad mire
las preguntas en vez de ser una constante disfrazada, que lo que se manda sean
**el mismo tiempo y las mismas preguntas** que la pantalla tenía delante, que el
ejecutor no pinte ninguna respuesta, que mande la opción que se tocó, que no
deje volver atrás, que el reloj salga de la hora
del SERVIDOR (se le corre la de la computadora una hora y la cuenta atrás no se
mueve), que salir de la ventana se le cuente al servidor dos veces y a la
tercera cierre, que el alumno vea nota y áreas pero no las preguntas, y que el
profesor sí las vea. Lo que hace cumplir la base se comprobó impersonando roles
en SQL, como está dicho arriba.


## Coordinación: el rol nuevo y los formularios de inscripción

**Coordinar es una marca encima de "profesor", no un tercer valor de `role`**, y
eso es a propósito: hay 23 comprobaciones de `role === "profesor"` en el
navegador y 13 en la base, y con un tercer valor olvidar una sola le quitaría en
silencio un permiso de profesor a quien coordina — sin dar error, simplemente no
le aparece el botón. Con `profiles.es_coordinador` encima del rol, "todos los
permisos de profesor" queda garantizado por construcción. Es el mismo camino que
ya seguía `is_admin`.

- Un CHECK impide que la marca vaya sola: `not es_coordinador or role =
  'profesor'`.
- La pone y la quita `public.marcar_coordinador()`, que exige `is_admin`. Nadie
  se la puede dar a sí mismo: el trigger de identidad revierte `es_coordinador`
  igual que `role`, `email` e `is_admin`.
- **Ese mismo trigger le dio el tropiezo de siempre**: también deshacía el
  cambio legítimo de quien administra, y *sin ruido* — el UPDATE "funcionaba" y
  el trigger revertía el valor después, así que la función devolvía "listo" con
  la marca en `false`. Es literalmente el fallo que ya había tenido el contador
  de invitaciones. Se arregló igual, con la marca local
  `ajedrez.nombrando_coordinador` que el trigger respeta **solo** para esa
  columna — **y además la función vuelve a leer la fila y falla si no quedó**,
  para que no pueda mentir otra vez.
- `public.soy_coordinador()` (`es_coordinador or is_admin`) es lo que preguntan
  las políticas nuevas para saber QUIÉN entra. **Sobre quién lo dice
  `bajo_mi_coordinacion()`** — ver «Coordinar es un alcance, no una llave
  maestra»: coordinar dejó de abrir la Academia entera.

### Los formularios

`formularios.html` (armador, solo para quien coordina) y `formulario.html?f=…`
(el enlace público que se comparte). Es lo que `inscripcion.html` hace hoy
escrito a mano para un solo torneo, pero generado: el formulario es **datos**
—el campo `campos` de la tabla—, así que armar el siguiente no es copiar 400
líneas de HTML.

- Dos tablas: `formularios` (slug, título, equipo, `campos`, abierto, cierre) y
  `formulario_respuestas`. Cada quien maneja los suyos (`creado_por`); quien
  administra, todos.
- **El enlace da acceso al formulario, nunca a las respuestas.** El público no
  toca las tablas: lee con `public.formulario_publico(slug)` —que solo devuelve
  los abiertos, y ni quién lo creó ni cuándo— y escribe con
  `public.responder_formulario()`, las dos `SECURITY DEFINER`. Mismo patrón que
  `registrar_arbitraje_publico()`.
- **`responder_formulario()` recorre los campos del formulario, no lo que le
  mandaron**: una clave inventada no se guarda (está comprobado: un
  `"es_admin": true` de regalo se descarta), un obligatorio que falte se dice
  con su nombre, y hay techos de tamaño.
- **A `anon` se le quitaron los permisos de tabla** sobre `formularios`,
  `formulario_respuestas` y `profile_teachers`. Supabase se los da por omisión a
  todo lo nuevo de `public` y confía en la RLS; acá la RLS lo paraba igual, pero
  de mala manera —sus políticas llaman a `my_profile()`, que `anon` no puede
  ejecutar, así que leer daba un error de permisos en vez de "0 filas"—. Como el
  público no tiene nada que hacer en esas tablas, se le quita de raíz: una
  puerta menos que dependa de que la política esté bien escrita.
- **El `id` de cada pregunta se calcula una sola vez, al crearla**, y después no
  se mueve: es la clave con la que queda guardada cada respuesta, así que
  corregirle una tilde a la etiqueta no puede cambiarlo.
- El CSV sale con **punto y coma y BOM**: es lo que Excel en español abre de un
  doble clic. Con coma, Excel mete la fila entera en la columna A.
- `formulario.html` lleva `noindex`: es el formulario de una actividad puntual,
  con su enlace propio.
- **El enlace que copia el armador se arma desde la CARPETA de la página, no
  cortándole el `.html` al final.** Cloudflare sirve la misma página en dos
  direcciones —`/formularios` y `/formularios.html`—, así que con el corte, a
  quien la abría sin la extensión el botón le copiaba
  `/formulariosformulario.html?f=…`: los dos nombres pegados, o sea un 404. Y no
  daba ningún error en el armador — el enlace se copiaba igual y la página que
  no era la veía quien lo recibía, que es el único que no puede arreglarlo.
- **Al tocar esto, correr `node herramientas/verificar-formularios.js`** (con el
  sitio en localhost:8777 y playwright). Comprueba en un navegador de verdad qué
  manda el armador a guardar, qué enlace copia **con `.html` y sin él**, que
  compartir un formulario mande lo correcto (ver abajo), qué manda el
  formulario público al contestar y el alta de abajo — qué dedujo de cada
  etiqueta, qué sale puesto en el diálogo y qué cuerpo se manda de verdad.

### Compartir un formulario con otro coordinador

Un formulario ya lo veía quien lo coordinaba (`bajo_mi_coordinacion(creado_por)`,
ver «Coordinar es un alcance, no una llave maestra»), pero eso deja un hueco:
`bajo_mi_coordinacion()` nunca es cierto para la cuenta master, porque
administrar no es "estar bajo" ningún coordinador. Un formulario que arma quien
administra queda invisible para todo el equipo de coordinación, sin que nada lo
avise — y aunque lo hubiera armado otra coordinadora, no había forma de dárselo
a UNA colega puntual, solo a quien ya la coordinaba a ella.

La salida es la misma que ya se usó para los planes de clase: el dueño elige,
uno por uno, con qué coordinador comparte el formulario. **Sigue siendo DE
quien lo armó** — compartirlo da ver el formulario, leer sus respuestas y dar
de alta las cuentas desde ellas (es lo mismo que ya hace `inscribir-alumno`:
lee la respuesta con el JWT de quien llama, así que a quien se le comparte
puede usar "Crear cuenta" igual que el dueño), pero **no** editarlo ni
borrarlo, y tampoco borrar sus respuestas — eso sigue siendo del dueño o de
quien administra.

- `public.formulario_compartidos (formulario_id, coordinador_id)` es la tabla
  puente, igual que `plan_compartidos`. **No hay política de update**: una fila
  de "compartido" se pone o se quita.
- **Las dos preguntas de siempre van en funciones `SECURITY DEFINER`**
  (`soy_dueno_del_formulario()`, `formulario_compartido_conmigo()`), por lo de
  siempre: la política de `formularios` mira `formulario_compartidos` y la de
  `formulario_compartidos` mira `formularios` — una RLS llamando a la otra es
  recursión infinita.
- **Solo se puede compartir con alguien que YA coordina** (`es_coordinador_de()`
  exige `es_coordinador` o `is_admin` en la cuenta destino): sin eso nada
  impediría poner ahí el id de un profesor cualquiera o de un alumno, y
  `formulario_respuestas` trae cédulas y fechas de nacimiento de menores.
- **`coordinadores_disponibles()`** es la que llena el selector, con nombre —
  hace falta una función porque la RLS de `profiles` no le deja a un
  coordinador ver a sus colegas (solo a sus alumnos y a sí mismo), igual que
  `equipo_docente()` para los planes.
- **Las cuatro funciones nacen con EXECUTE de PUBLIC**, como toda función
  nueva de Postgres, y revocarlo solo de `anon` no alcanza: `anon` lo hereda
  igual de PUBLIC si no se le revoca a PUBLIC directamente. Comprobado con
  datos reales antes de escribir la migración de cierre: `bajo_mi_coordinacion()`
  y `equipo_docente()` —que solo revocan de `anon`— siguen dando
  `has_function_privilege('anon', …) = true` hoy; `soy_coordinador()` —que
  revoca de `public, anon`— da `false`. Las cuatro funciones nuevas se
  revocaron de PUBLIC y se les volvió a dar el execute a `authenticated`, que
  es quien de verdad las necesita para las políticas de RLS.
- **En `formularios.html`, "Compartir con otro coordinador" solo aparece en un
  formulario propio y YA GUARDADO** (uno nuevo todavía no tiene id con qué
  compartir): la sección vive dentro del editor y se destapa en `abrirEditor()`
  solo cuando `esDueno(form)`. El selector **excluye a quien ya lo tiene**, la
  misma regla que "O con quien elijas" de los planes.
- Comprobado impersonando cuentas reales en SQL, revertido: antes de
  compartir, otra coordinadora no lo ve (0 filas); al compartirlo, la cuenta
  elegida lo ve y puede leer sus respuestas, pero un intento de editarlo,
  borrarlo o volver a compartirlo con un tercero queda rechazado; una TERCERA
  coordinadora, sin compartir, sigue sin verlo.

### De la respuesta a la cuenta, en un botón

Cada respuesta tiene su botón **"Crear cuenta"**: crea la cuenta del alumno con
su invitación por correo, lo deja asignado a quien aprieta el botón, le pone el
equipo del formulario y **apunta a la persona encargada con su correo**, que es
lo que después usa "📧 Informes a la casa" de `informes.html`. Antes eso era
copiar cuatro datos a mano de una pantalla a otra, dos veces por alumno.

- **Es UNA Edge Function (`inscribir-alumno`), no dos llamadas del navegador.**
  Invitar al alumno y apuntar a su encargado son un solo acto: "dar de alta a
  esta familia". Partido en dos, si la segunda mitad falla queda un alumno con
  cuenta y sin encargado, y eso **no da ningún error** — simplemente nunca le
  llega el informe a la casa y nadie se entera hasta que alguien pregunta.
- **Se puede apretar dos veces sin romper nada.** Si ya hay cuenta con ese
  correo se reusa y **no se gasta otra invitación del cupo**; la asignación de
  profesor y la persona encargada son upsert (`profile_teachers` y el
  `UNIQUE (student_id, email)` de `encargados`). Así un doble clic, o reintentar
  después de un fallo a mitad de camino, termina el alta en vez de enredarla.
- **La marca de "ya se creó" vive en la base**, en la propia respuesta
  (`cuenta_id`, `cuenta_creada_at`, `cuenta_creada_por`), no en una variable de
  la pantalla: al volver mañana, la fila muestra ✅ en vez de ofrecer una
  segunda invitación al mismo correo. Se escribe **al final**, cuando todo lo
  demás salió bien. No confundir `cuenta_id` con `alumno_id`, que ya existía y
  es otra cosa: quién *contestó* el formulario (casi siempre nulo, porque el
  formulario es público).
  `formulario_respuestas` **sigue sin política de update**: una respuesta
  enviada no se toca desde el navegador, así que esas tres columnas solo las
  escribe la función con la service role.
- **El permiso no se comprueba a mano**: la fila de la respuesta se lee con el
  JWT de quien llama, o sea pasando por la RLS. Comprobado impersonando roles en
  SQL — quien administra coordina y ve la respuesta; una coordinadora que no
  creó ese formulario recibe **cero filas** y se lleva un 403; un alumno no
  coordina. Es la misma regla que ya usa `informes-encargados`.
- **Qué pregunta es cuál se declara, y si no, se deduce.** Cada pregunta lleva
  un `papel` (`alumno_nombre`, `alumno_correo`, `encargado_nombre`,
  `encargado_correo`) que se elige al armarla, y la plantilla ya viene con los
  cuatro puestos. Los formularios que ya existen no lo traen, así que
  `papelesDe()` lo deduce de la etiqueta — "correo encargado" es de la casa,
  "correo electrónico" es del alumno.
- **Pero deducir no es saber, y por eso el botón NO manda de una.** Abre el
  diálogo con los cuatro datos ya puestos y editables. Mandarle la invitación al
  correo de la mamá en vez de al del alumno no da ningún error: simplemente
  entra al sitio la persona que no era, y el correo ya salió. Lo que se enseña
  antes de mandar es exactamente lo que se va a mandar.
- El cupo sigue siendo el de siempre (`profiles.invitaciones_max`): quien
  administra no tiene tope, un profesor sin invitaciones asignadas recibe el
  mismo aviso que en la Academia.

## El alumno que no tiene correo propio

Una familia con dos hijos pequeños tiene **un solo correo** —el de la mamá o el
papá— y quiere inscribir a los dos con él. No se puede, y no es una regla del
sitio que se pueda aflojar: el correo es la llave con la que se inicia sesión y
Supabase Auth lo exige único (`users_email_partial_key`). Repetirlo sería que
los dos hermanos entren a la misma cuenta.

La salida no es darle un buzón a un niño de siete años, es **dejar de
pedírselo**: entra con un **usuario** del dominio `alumno.ajedrez-integral.com`,
que no recibe correo, y todo lo que el sitio le escribe a esa familia va al
correo de la persona encargada. Así los dos hermanos tienen cuentas separadas
—con su progreso, sus tareas y sus cobros aparte— y la mamá recibe las dos
bienvenidas y los dos informes en su único correo.

Eso separa dos cosas que hasta ahora el sitio confundía en una sola columna:

- **con qué entra el alumno** → `profiles.email`, que puede ser un usuario;
- **a dónde se le escribe** → `public.correo_de_contacto()`, de aquí en adelante.

### Antes de esto, el segundo hermano se comía al primero

`inscribir-alumno` decidía si reusar una cuenta **buscando el correo en
`profiles`**, no mirando la respuesta que se estaba dando de alta. Así que
inscribir a un segundo alumno con un correo ya usado encontraba la cuenta del
primero, la reusaba, y más abajo le escribía encima el nombre y el equipo: **el
primer hijo dejaba de existir**, con su progreso, su asistencia y sus tareas
adentro de la cuenta del segundo. Y la pantalla decía ✅ "cuenta creada", sin un
solo error.

El reuso existe por una razón buena —apretar el botón dos veces, o reintentar un
alta que falló a mitad de camino, no debe costar otra invitación del cupo— pero
"otra vez" y "otro alumno" no son lo mismo. Ahora se decide por
**`respuesta.cuenta_id`**: esta respuesta, esta cuenta. Un correo que ya es de
otra cuenta se rechaza con un 409 que dice qué hacer en vez de pisarla.

### La regla de a dónde se le escribe vive en la base

**El peligro de todo esto es mandarle correo a ese buzón que no existe**, y no
daría ningún error: Resend acepta el envío, el correo rebota y la reputación del
dominio se va deteriorando sin que nadie mire. Por eso la pregunta se hace en un
solo lugar:

- `public.es_correo_interno(text)` — si eso es un usuario y no una dirección.
- `public.correo_de_contacto(alumno)` — el correo de su cuenta si es de verdad,
  y si no el de su encargado activo. **NULL quiere decir "no hay forma de
  escribirle"**, y quien llame tiene que decirlo, no callarlo. Es
  `SECURITY INVOKER` como las de informes: quién puede preguntar por quién lo
  sigue decidiendo la RLS.
- `cobros_morosos()` devolvía `p.email` tal cual, así que le habría mandado el
  aviso de morosidad a la dirección muerta. Ahora devuelve `correo_de_contacto()`.
- `profiles` ganó un índice único sobre `lower(email)`: `auth.users` ya lo
  impedía para las cuentas, pero era sobre `profiles` que el alta buscaba a quién
  reusar.

Comprobado con los datos reales antes y después: en los 93 perfiles de hoy
—ninguno con usuario interno— `correo_de_contacto()` devuelve **exactamente** el
mismo correo que antes, 93 de 93. Y en una transacción revertida, dos hermanos
con usuario interno y el mismo encargado resuelven los dos a ese correo, y un
alumno sin encargado da NULL en vez de inventar un destino.

### El dominio está escrito tres veces, a la fuerza

En `js/usuario-alumno.js` (el navegador), en
`supabase/functions/_compartido/usuario-alumno.ts` (las Edge Functions) y en
`public.es_correo_interno()` (la base). Son tres tiempos de ejecución que no
pueden leerse entre sí, así que no hay forma de tener una sola copia — lo que sí
hay es una comprobación que falla si se separan. Separadas, el sitio crearía
usuarios en un dominio que la base no reconoce como interno y volvería a
mandarles correo a la nada.

**Y no es el dominio del sitio a propósito.** `alumno.ajedrez-integral.com` no
tiene MX y no debe tenerlo: su razón de ser es que nada le llegue nunca. Un
usuario en el dominio raíz recibiría correo de verdad y se perdería la
separación entera.

### El usuario se propone, se enseña y se puede corregir

`baseDeUsuario()` arma `nombre.apellido` sin tildes ni eñes —"Sofía Muñoz Pérez"
es `sofia.munoz`—, y **cuál pedazo es el apellido se adivina**: acá se nombra
completo (Nombre1 [Nombre2] Apellido1 Apellido2), así que con cuatro pedazos el
apellido es el tercero y con dos o tres es el segundo. Acierta casi siempre y
falla con "María José Vargas", que da `maria.jose`.

Por eso **las dos pantallas de alta lo muestran y dejan corregirlo antes de
crear la cuenta**, con la misma regla que ya usa el diálogo de inscripción:
deducir no es saber. El usuario es lo que el niño va a escribir todos los días y
después no se cambia solo.

- El choque se resuelve **numerando** (`jose.rodriguez2`, `jose.rodriguez3`) y no
  con un id al azar: `jose.rodriguez.a7f3` no se lo aprende nadie. Dos "José
  Rodríguez" en la misma academia no son ninguna rareza.
- El desempate lo hace **siempre el servidor**, aunque el usuario venga propuesto
  desde la pantalla: entre que se propuso y que se apretó el botón pudo entrar
  otro alumno con ese nombre. **Lo que la pantalla enseña al final es el usuario
  que devolvió el servidor**, no el que ella propuso — enseñar el propuesto
  dejaría a la familia intentando entrar con uno que no es.
- El plural de las tildes se quita del USUARIO, no del nombre: el nombre se
  guarda como la familia lo escribió. Un usuario con tilde se puede escribir de
  dos formas y el niño no sabría cuál le toca.

### El niño escribe `sofia.munoz`, no el correo entero

`login.html` acepta el usuario pelado y le pega el dominio
(`UsuarioAlumno.completar()`). Pedirle a un niño que escriba
`sofia.munoz@alumno.ajedrez-integral.com` cada vez que entra es pedirle justo lo
que esto vino a evitar — y dictárselo por teléfono a la mamá, peor. Escribirlo
entero sigue funcionando, porque es lo que dice el correo que recibió la casa.

- **El campo pasó a `type="text"`.** Con `type="email"` el navegador rechaza
  `sofia.munoz` con SU aviso, en su idioma, antes de que la página pueda decir
  nada: el usuario no se podría ni mandar. Misma razón por la que el formulario
  de `bienvenida.html` va con `novalidate`.
- `autocapitalize="none"` y `autocorrect="off"`: en el celular, "Sofia.Munoz" no
  entra.
- En `bienvenida.html`, donde la página dice "tu correo" dice **"tu usuario"**
  cuando lo es. Si no, los cuatro pasos del ingreso le explican a un niño cómo
  entrar con algo que no tiene. Y se le enseña el usuario **sin el dominio**:
  enseñárselo entero debajo de la palabra "Tu correo" es decirle que le escriban
  ahí, y ahí no llega nada.

### El olvido de contraseña, que es donde esto se podía romper callado

`sb.auth.resetPasswordForEmail()` manda el enlace **a la dirección de la
cuenta**. Para un alumno con usuario esa dirección no existe: el correo sale, no
llega a ninguna parte, y la página dice igual "si esa cuenta existe, ya salió el
correo". El niño se queda fuera para siempre y nadie se entera. Dejar eso abierto
habría sido cambiar un agujero por otro.

La Edge Function **`recuperar-acceso`** atiende ese caso: genera el enlace con la
service role y lo manda a donde de verdad se le puede escribir a esa familia,
que lo dice `correo_de_contacto()` — la misma regla de los informes a la casa y
los avisos de cobro.

- **Los correos de verdad siguen por el camino de siempre.** `bienvenida.html`
  elige por `UsuarioAlumno.esInterno()`: lo que ya estaba probado no se toca.
- `verify_jwt` va en **false**, porque quien olvidó su contraseña no tiene
  sesión. A cambio **no dice nunca si la cuenta existe**: contesta lo mismo en
  todos los casos, exista o no, salga el correo o no, y hasta si algo falla.
  Decir "ese usuario no está registrado" le contaría a cualquiera quién tiene
  cuenta acá, y son menores de edad. **Tampoco dice a qué correo lo mandó**: ese
  dato es de la familia.

### Las dos puertas de alta

Las dos —`formularios.html` (el diálogo "Crear cuenta") y `sesion.html`
(invitar desde la clase en vivo)— traen la casilla **"No tiene correo propio"**:

- el campo del correo del alumno se **apaga**, no se esconde: así se ve que
  sigue ahí y que lo que cambió es que ya no hace falta;
- el **correo de la persona encargada pasa a ser obligatorio** — es la única
  forma de mandar el enlace, y sin él la cuenta queda creada y muda;
- en el formulario, la casilla **arranca marcada cuando la respuesta no trajo
  correo del alumno**, que es lo que de verdad pasa con los pequeños: la familia
  escribe el suyo y deja ese campo vacío. Se propone, no se decide;
- `create-student` apunta al encargado **en la misma llamada**, no en una
  segunda del navegador: partido en dos, si la segunda mitad falla queda una
  cuenta a la que nunca se le puede escribir. Es la decisión que ya tomaba
  `inscribir-alumno`;
- el aviso del final **enseña el usuario y dice a qué bandeja salió el correo**.
  Con un alumno sin buzón no salió a la suya, y quien dio de alta tiene que
  poder decírselo a la familia: ese dato no lo adivina nadie.

**Esto pide desplegar tres Edge Functions**, que no se suben solas al mergear:
`create-student`, `inscribir-alumno` y la nueva `recuperar-acceso` —esta última
con **`verify_jwt` en false**, como los informes a la casa—. Se arman con `node
herramientas/funciones-armar.js`. La migración de la base ya está aplicada. Si
las funciones quedan sin subir, la casilla «No tiene correo propio» contesta que
el correo del alumno no parece un correo: se ve el error, no se pierde nada.

**Al tocar cualquiera de estas piezas, correr `node
herramientas/verificar-alumno-sin-correo.js`** (con el sitio en localhost:8777 y
playwright). Todo lo que se rompe acá se rompe callado, así que se mira desde
afuera: que el dominio diga lo mismo en sus tres copias, que la regla del usuario
de la pantalla dé lo mismo que la del servidor (si se separan, lo enseñado no es
lo guardado), que el login le pegue el dominio, que el olvido de un usuario NO
pase por `resetPasswordForEmail` y que los dos caminos contesten **exactamente**
lo mismo, y que dar de alta a dos hermanos con un solo correo mande dos usuarios
distintos con el mismo correo de la casa.

## La invitación pide la contraseña y explica cómo se entra

Las dos puertas de alta —el formulario de inscripción (`inscribir-alumno`) y la
invitación directa del profesor desde la clase en vivo (`create-student`)—
mandan **el mismo correo**, y ese correo hace dos cosas que antes no hacía:
pedirle al alumno que **cree su contraseña** y explicarle **cómo entra a partir
de ahora**.

Antes no era así, y fallaba callado: Supabase mandaba su correo de invitación,
el alumno abría el enlace, entraba **ya autenticado** y su contraseña quedaba
sin poner. Al día siguiente no tenía con qué volver — el enlace se usa una sola
vez— y nada en el sitio le había dicho que existía un botón "Contraseña" dentro
del panel. No daba ningún error: simplemente ese alumno no volvía, y quien lo
invitó se enteraba cuando preguntaba por qué nunca entró.

- **`bienvenida.html` es a donde lleva el enlace** (`redirectTo` de las dos
  funciones). Lo primero y único que pide es la contraseña, con el correo del
  alumno a la vista —de solo lectura: es el dato con el que va a entrar— y los
  dos campos para escribirla y repetirla.
- **La explicación de cómo se entra va desde el primer momento, no al final.**
  Quien pone su contraseña se va de la página enseguida; si los cuatro pasos
  aparecieran recién después de guardarla, no los leería nadie. Están arriba
  del pliegue desde que la página abre, y siguen ahí después.
- **"Ver la contraseña" destapa los DOS campos a la vez**, porque el error que
  evita es justamente que no coincidan.
- **El formulario va con `novalidate`.** Sin eso el navegador corta el envío
  con SU propio aviso, en el idioma del navegador y no en el de la página, y el
  aviso en español no sale nunca. `required` y `minlength` se quedan puestos:
  los anuncia el lector de pantalla al entrar al campo.
- **La misma página atiende el enlace vencido y el "se me olvidó".** Los dos
  piden lo mismo —un enlace nuevo—, así que el formulario está escrito una sola
  vez y lo que cambia es el encabezado. `login.html` manda ahí con
  `?recuperar=1`, y ese enlace **tiene que existir**: la explicación de la
  página lo nombra, y una explicación que manda a un botón que no está es peor
  que no explicar.
- Ese aviso de "si esa cuenta existe, ya salió el correo" es a propósito: decir
  "ese correo no está registrado" le contaría a cualquiera quién tiene cuenta.

### El correo lo manda el sitio, no Supabase

- **Sale UNO solo, no dos.** Antes salían el de Supabase (con el enlace, sin
  explicar nada) y otro nuestro con el PDF de instrucciones adaptadas. Ahora el
  enlace lo genera `generateLink` —que crea la cuenta pero **no** manda ningún
  correo— y viaja dentro del correo nuestro, junto con los cuatro pasos del
  ingreso y el PDF adjunto.
- **`supabase/functions/_compartido/invitacion-email.ts` es la única copia de
  ese texto.** Cada Edge Function se despliega con SUS archivos y no puede
  importar de una carpeta hermana, así que `node herramientas/funciones-armar.js`
  copia el compartido dentro de cada función al armar el despliegue: se escribe
  en un lugar y se genera en los que hagan falta, como el resto de
  `herramientas/`. Escrito dos veces, se iría separando a la primera corrección
  y la mitad de las familias recibiría la versión vieja sin que nada falle.
- **Sin `RESEND_API_KEY` no se usa `generateLink`**: se invita como siempre con
  `inviteUserByEmail` y el correo lo manda Supabase. Un proyecto sin Resend
  configurado tiene que seguir dando de alta alumnos, no crear cuentas a las que
  no les llega nada.
- **Si la cuenta queda creada y el correo NO sale, se dice.** `correo_enviado:
  false` sube hasta la pantalla de quien invitó —en la clase en vivo y en el
  armador de formularios—, con qué hacer ("que entre con «¿Olvidaste tu
  contraseña?»"). Es el fallo callado de siempre: una cuenta muda de la que
  nadie se entera hasta que alguien pregunta.
- **El alumno del formulario ahora también recibe el PDF de instrucciones
  adaptadas.** Antes solo lo recibía el invitado por el profesor: esa puerta no
  mandaba ningún correo propio.
- Los estilos del correo van **a mano en cada etiqueta**, no en una hoja
  aparte: Gmail descarta el `<style>` del `<head>`. Misma decisión que
  `informe-html.ts`.

**Al tocar `bienvenida.html`, `login.html` o cualquiera de las dos funciones,
correr `node herramientas/verificar-bienvenida.js`** (con el sitio en
localhost:8777 y playwright). Existe porque esta página vive **detrás de un
correo**: no se llega a ella desde ningún enlace del sitio, así que
`verificar-css.js` no la abre nunca. Comprueba que lo que manda a guardar sea
la contraseña que se escribió y no otra cosa, que una corta o dos distintas no
manden nada y lo digan, que los cuatro pasos del ingreso **se vean de verdad**
(se mide con `checkVisibility()`, no con la clase — la lección que dejó
`verificar-pwa.js`) ya antes de guardar, que el enlace vencido ofrezca otro y
que `login.html` tenga de verdad el «¿Olvidaste tu contraseña?» que la página
promete.

## Informes: la cuenta la hace la base, no el navegador

`informes.html` **no se baja las tablas de actividad**. Antes sí: pedía
`question_answers`, `class_attendance`, `class_presence_log`,
`platform_activity_log`, `training_progress` y `training_state` enteras y sumaba
en JavaScript. Eso tenía un techo invisible: **PostgREST corta la respuesta a
partir de cierta cantidad de filas** (mil, salvo que se cambie en Settings ›
API) y los totales salían calculados sobre un pedazo de los datos, **sin ningún
error a la vista**. Con `training_progress` creciendo unas 5 filas por alumno y
por día, ese techo se cruza en días, no en años.

Ahora la cuenta vive en tres funciones, y la página solo pone los números en su
lugar:

- `public.informes_resumen_alumnos()` — un renglón por alumno con todo ya
  contado: respuestas y aciertos, clases asistidas, minutos en clase y en
  ejercicios, ejercicios 4×4 y lecciones distintos, mejor marca de Coordenadas,
  series de Practicar con sus estrellas, mates por categoría, táctica,
  concentración y temas de curso. Trae además `grupo` y el Elo, así que
  reemplaza también el `select * from profiles`.
- `public.informes_cursos_alumnos()` — un renglón por alumno y curso empezado.
- `public.informes_diagnosticos_alumnos()` — **como mucho** un renglón por
  alumno: el diagnóstico vigente (el más reciente entre `training_progress` y el
  espejo `training_state`) y, si dejó uno a medias, por qué pregunta iba.
- `public.informes_totales()` — las tres cuentas de las tarjetas de arriba.

Detalles que importan:

- **Son `SECURITY INVOKER`, no `DEFINER`.** Quién ve a quién lo sigue decidiendo
  la RLS de cada tabla, exactamente igual que cuando la consulta salía del
  navegador. De regalo: un alumno que las llama recibe **solo su propio
  renglón**, así que su propia página de Informes usa las mismas tres funciones
  y la cuenta no está escrita dos veces.
- **El tiempo conectado no es sumar filas.** Una ventana sin cierre vale como
  mucho un latido (20 s) y dos pestañas abiertas a la vez se solapan, así que
  los tramos se unen antes de sumar (gaps and islands con funciones de ventana).
  Está comprobado contra el bucle que hacía la página, con 4.000 tramos
  inventados al azar: cero diferencia.
- **Lo que sigue viniendo fila por fila va paginado.** `traerTodo()` pide de mil
  en mil hasta que llega una página corta. Ninguna consulta de la página puede
  quedar cortada sin que se note — y si alguna falla, ahora **se dice en
  pantalla** en vez de pintar ceros.
- `json_seguro()` y `fecha_segura()` existen porque el espejo de progreso guarda
  el texto tal cual lo escribió `localStorage`: el JSON de dentro puede estar
  roto y una fecha puede no ser una fecha. Devuelven NULL en vez de tumbar el
  informe entero.
- **Tareas y exámenes tienen su bloque**, mirando a UN alumno y también en la
  página del propio alumno — la misma función los pinta para los dos públicos,
  con los mismos números—. Los da `public.resumen_tareas_examenes()`, la misma
  que usa el correo a la casa: si esta página los sumara por su cuenta, el
  correo y la pantalla podrían decir cosas distintas del mismo alumno. Lo
  vencido va arriba, en rojo **y escrito con todas las letras**: es la única
  línea del bloque que pide hacer algo hoy, y un color solo no se lee.
- **Al tocar informes.html, correr `node herramientas/verificar-informes.js`**
  (con el sitio en localhost:8777 y playwright instalado). Abre la página en un
  navegador de verdad con un cliente de Supabase de mentira y comprueba número
  por número las dos vistas —la del profesor y la del alumno—, más que una tabla
  de 1005 filas llegue entera y en dos pedidos. Lo que se rompe al tocar esto es
  un campo mal escrito, y eso no da error: pinta un cero.
- Índices que se agregaron de paso: `class_presence_log(student_id)`,
  `class_attendance(student_id)` y `question_answers(student_id, created_at
  desc)`. `training_state` **no** necesita uno: su clave primaria ya empieza por
  `student_id`.

### La página no es un volcado: es un índice, y lo demás se abre

Contar en la base arregló los números, pero no lo que se veía. Al entrar, quien
da clase recibía **seis paneles abiertos a la vez**, y los dos primeros ni
siquiera eran de sus alumnos: los exámenes de arbitraje del público y los
diagnósticos de visitantes. Debajo, **los mismos N alumnos listados tres
veces** —precisión, asistencia y entrenamiento—, sin buscador y sin corte. Con
cien alumnos son trescientas filas de corrido, más una tarjeta de perfil por
alumno en los diagnósticos; y para juntar los datos de uno había que cruzar
tres tablas a ojo. Llegar a un alumno concreto era abrir un `<select>` de cien
nombres.

Nada de eso daba ningún error: la página se veía perfecta, los números estaban
bien, y el profesor simplemente no usaba Informes.

- **Arriba va lo que pide actuar**, como en el panel de la Academia: una franja
  con quién lleva una semana sin entrenar, a quién le falta el diagnóstico y
  cuántos planes están sin compartir. Los tres datos **ya estaban cargados** y
  no se decían en ninguna parte — había que acordarse de ir a buscarlos al
  filtro de tema. Cada uno es un botón que **deja el filtro puesto**, así que
  enterarse y actuar son el mismo gesto. Con todo al día la franja no se pinta:
  un cartel que se repite deja de leerse.
  - Los conteos no se hacen acá: los inactivos salen de `informes_inactivos()`,
    la misma lista que cuenta `panel_profesor()` en «Tu semana», y los planes
    que faltan de `planesQueFaltan()`, la misma que pinta el botón de compartir
    en lote. Un segundo criterio escrito acá diría otra cosa del mismo alumno.
- **«👥 Tus alumnos» es UN índice, una fila por alumno**: asistencia, tiempo,
  asignaciones, el nivel del diagnóstico y si está entrenando esta semana. Con
  **buscador sin tildes** —«ramirez» tiene que encontrar a «Ramírez»— y de
  **tres en tres** con su «Ver más» y su «Mostrando 3 de 143» — tres es lo que
  se ve de un vistazo sin bajar la pantalla, y quien busca a alguien lo busca,
  no lo encuentra bajando. Tocar a un alumno abre su informe: eso es lo que
  reemplaza a buscarlo dentro del `<select>`, que se queda porque es el control
  accesible de siempre.
- **Las tres tablas de antes NO se perdieron**: van plegadas dentro de ese
  mismo panel, «Las tablas completas, columna a columna». Sirven para comparar
  columna a columna, que es justamente lo que un índice de una fila por alumno
  no puede dar — y es lo que también da el filtro «Tema o actividad», que ya
  existía. Se pintan enteras a propósito: viven dentro de un `<details>`
  cerrado, así que no cuestan pantalla.
  - **El buscador filtra el índice Y esas tres tablas.** Buscar «Ana» y que las
    tablas siguieran enseñando a los cien sería exactamente la sorpresa que
    esto viene a quitar. Por eso hay `alumnosDelPanel()` (grupo o subgrupo de
    arriba + buscador) y no se toca `filteredStudents()`, que es de lo que
    depende el filtro por tema y el de subgrupos.
  - **Y no pasan por `applyTeacherFilters()`**: repintarían los diagnósticos,
    los conteos de arriba y los dos paneles del público, que no dependen de lo
    que se escriba.
- **Lo que no es de sus alumnos va plegado** —arbitraje del público y
  diagnósticos de visitantes— **pero su conteo se lee sin abrirlos** («1005
  exámenes recibidos · 502 sin responder»). Si no, hay que abrir los dos en
  cada visita solo para saber si llegó algo nuevo, que es el paso que el
  plegado viene a quitar.
- **«Nivel por alumno» corta en tres**, igual que el índice, con su «Ver más
  alumnos (faltan N)». Con cuarenta diagnósticos era una pared de barras antes
  de llegar a lo que de verdad se mira. Se pintan todos y se esconden con la
  clase —no son enfocables mientras están escondidos—, así que «ver más» no
  repinta nada: repintar cerraría «El perfil de cada alumno» si estuviera
  abierto.
- **«Dónde se debe mejorar»** —que se llamaba «Dónde está floja la clase»— va
  **siempre completa y sin plegar**: son nueve renglones fijos, no una lista
  que crezca con la clase, y es lo que contesta «¿qué doy la clase que viene?».
- **«El perfil de cada alumno»** (la rejilla con las nueve áreas de cada
  diagnóstico) sí se pliega: es una tarjeta por alumno y el resumen del grupo
  está justo encima.
- **«Sin diagnóstico todavía» dice CUÁNTOS son y nombra a tres.** Con cuarenta
  era media pantalla de nombres de corrido, y quedó siendo lo más largo del
  panel justo después de acortar todo lo demás. Los dos textos —el corto y la
  lista entera— se pintan de una y el botón cambia cuál se ve: son cuarenta
  nombres, no cuesta nada, y así no hay que repintar el panel. **El botón no
  desaparece al abrir**, al revés que el de «Nivel por alumno»: ahí el foco pasa
  al último nombre destapado y acá no hay ningún nombre enfocable al que
  pasarlo, así que se quedaría en el aire.
  - **Ahí el nombre del alumno se pintaba CRUDO.** Era el único sitio de
    `renderDiagnosticosClase()` sin `escVis` —ver «El nombre de un alumno es
    texto ajeno»— y no saltaba en ninguna prueba porque el nombre atacante se le
    ponía solo a una alumna que SÍ tenía diagnóstico, o sea que nunca caía en
    esta lista. Comprobado que era real: sin el escape, el código del nombre **se
    ejecuta** en la pantalla de su profesor. Ahora el fixture se lo pone a las
    dos, con diagnóstico y sin él.

#### Lo que se hace FUERA de la plataforma es de administración

El diagnóstico público y el examen de arbitraje de `nivel-de-arbitraje.html`
los hace **gente sin cuenta**: no son alumnos de nadie, y lo que dejan —nombre
y correo— son contactos para invitar a Academia, no material de clase. Ocupaban
el primer lugar del informe de cualquier profesor, que es al revés de lo que
tiene que ver al entrar.

- **A quien no administra no se le pintan los dos paneles, y se QUITAN, no se
  esconden.** Un `<details>` escondido con una clase sigue recibiendo el foco
  del teclado, y un panel al que se llega tabulando pero no se ve es peor que
  no tenerlo. Misma decisión que `soloParaAdministracion()` en el panel de la
  Academia; lo hace `quitarLoDeFueraSiNoEsAdmin()`.
- **Sus dos temas se van del filtro con ellos** (`arbitraje` y
  `diagnostico-publico`), o quedaría un tema que enseña un panel que ya no
  está. Las dos `<option>` siguen escritas en el HTML —`verificar-admin.js`
  comprueba contra el archivo que los atajos de `admin.html` apunten a temas
  que existen— y se quitan del DOM al cargar.
- **Tampoco se le bajan.** La RLS se los devuelve igual a un profesor, así que
  el filtro tiene que estar en la página: son dos páginas de mil filas que no
  iba a mirar.
- Dentro del tema «🧭 Diagnóstico de nivel», el apartado de visitantes que va
  debajo de los alumnos se salta por lo mismo.

En el informe de UN alumno:

- **Ocho números a la vista y ocho detrás de «Ver todos los números».**
  Dieciséis tarjetas de golpe no las lee nadie y tapan las que se miran de
  verdad. Las escondidas **siguen siendo hijas directas de `#stat-cards`** y se
  ocultan con la clase, no se sacan del DOM: no son enfocables, así que no
  dejan ninguna parada de tabulador fantasma.
- **«🔑 Acceso a la cuenta» e «📧 Informes a la casa» van plegados**: son de
  administración y se usan una vez cada tanto; abiertos en cada informe eran
  media pantalla de formulario que nadie venía a ver.
- **«🧭 Diagnóstico y plan» va plegado para quien da clase y ABIERTO para el
  propio alumno.** Es el bloque más largo del informe; el nivel ya se lee en el
  índice de la clase, pero para el alumno su plan es a lo que viene.
- **La tarjeta del historial dejó de prometer lo que no es.** Se llamaba
  «Informe de X» y lo que trae son las últimas quince respuestas: ahora es
  «🚩 Últimas asignaciones de X» y bajó debajo de Tareas y exámenes, que es lo
  que de verdad se busca. Y **ya no sale en blanco**: se miraba el contador de
  respuestas para decidir si pintar el aviso de «todavía ninguna», pero se
  pintaba la lista de las quince últimas — un alumno con respuestas viejas se
  llevaba una tarjeta vacía. Se mira la lista, que es lo que se va a pintar.

**Al tocar el índice, la franja o los plegables, correr `node
herramientas/verificar-informes.js`.** Su prueba nueva —«Una clase de
cincuenta»— existe porque **con tres alumnos todo esto se ve bien**: el
problema empieza a los cincuenta. Comprueba que el índice corte de tres en
tres y lo diga con el total de verdad, que «Ver más» traiga los siguientes,
que «Nivel por alumno» corte igual y su botón se vaya cuando ya no queda
nadie, que las nueve áreas de «Dónde se debe mejorar» vayan completas, que
«Sin diagnóstico todavía» diga cuántos son y nombre a tres —medido con
`innerText` y no con `textContent`, que trae también la lista escondida y
daría por buena una línea que no se cortó—,
que el buscador filtre **también** las tablas de abajo y no se pierda con las
tildes, que ordenar por «sin entrenar» ponga «nunca» antes que «hace mes y
medio», que la franja se vea **de verdad** (el `display` que calcula el
navegador, no la clase) y deje el filtro puesto al tocarla, que el conteo de
los paneles plegados se lea sin abrirlos, que las ocho tarjetas secundarias
nazcan escondidas, y que a quien no administra no se le pinten —ni se le
bajen— los dos paneles del público. Está probado que falla de verdad: quitándole el corte al
índice saltan dos comprobaciones, y dejando el buscador sin filtrar, la prueba
se cae.

- **El verificador abre los plegables como los abre una persona**, tocando su
  encabezado, en vez de dar por buena la existencia del nodo: un panel plegado
  que no abre se ve igual que uno que no está.

### Un total solo sube: «Cómo viene» es lo que dice si mejora

Todos los números de Informes eran **acumulados desde siempre**, y eso no
contesta la pregunta del entrenador —«¿está mejor que hace tres meses?»— ni la
de la casa. Peor: un alumno que lleva un mes sin entrar se ve **exactamente
igual de bien** que el día que paró, porque el número de ayer sigue ahí. No da
ningún error; simplemente nadie se entera.

El bloque **«📈 Cómo viene»** va en el informe individual —y en la página del
propio alumno— entre los cursos y la bitácora: primero se mira cómo viene y
después se anota lo que se ve.

- **`public.evolucion_alumno(alumno, semanas)`** devuelve una fila por semana:
  ejercicios, días, minutos y respuestas de pizarra. Es **`SECURITY INVOKER`**
  como el resto de las de informes, así que quién puede pedir la curva de quién
  lo decide la RLS y un alumno recibe solo la suya — la misma función pinta las
  dos pantallas y la cuenta no queda escrita dos veces.
- **La rejilla de semanas viene COMPLETA, con las vacías en cero**, y esa es
  media función. Si las semanas sin nada no vinieran, el gráfico pegaría dos
  semanas separadas por un mes en blanco y dibujaría una línea que **sube**,
  cuando lo que pasó fue que el alumno no entró. Se ve perfecto y dice lo
  contrario de lo que pasó.
- **Las semanas se cuentan en hora de Costa Rica**, igual que los días de la
  racha y los del informe a la casa: quien entrena a las once de la noche no
  puede caer en la semana siguiente por el huso del servidor.
- **Los minutos salen de `minutos_por_tramos()`**, la misma de Informes, Tareas
  y el reporte de actividades, con la semana como partición. Comprobado contra
  los datos reales: los minutos de la curva y los de la tarjeta de arriba dan
  **el mismo número** (472 y 472 en el alumno con más actividad).

#### El veredicto escrito manda sobre el gráfico

Arriba de todo va una franja con la frase —«Va subiendo · 40 ejercicios este
último mes contra 4 el anterior»—, que es lo primero y muchas veces lo único
que se lee. Misma decisión que la franja del informe a la casa: el gráfico es el
respaldo, no el mensaje.

- **Compara las últimas 4 semanas contra las 4 anteriores**, no contra siempre.
- **Un porcentaje a secas no sabe decir dos casos**, y los dos importan: de 0 a
  40 no es «+∞ %» sino **«Empezó a entrenar»**, y caer a cero es **«Dejó de
  entrenar»**, que es lo único del bloque que pide hacer algo hoy.
- **Un vaivén de ±15 % no es una tendencia.** Sin ese margen, el profesor
  recibiría «va bajando» todos los meses sin ningún motivo y dejaría de leerlo.
- El color de la franja **nunca va solo**: al lado está el título escrito y
  debajo los dos números.

#### Las barras, y lo que solo se descubre mirando la pantalla

- **Una sola serie, un solo color.** Pintar cada barra más oscura cuanto más
  alta sería codificar el alto dos veces y gastar el color en algo que la barra
  ya dice.
- **Una semana en cero se queda en CERO**, sin mínimo visible: darle uno la
  haría parecer una semana con algo, que es justo lo contrario.
- **Las columnas NO llevan pista de fondo.** La primera versión sí, y al mirar
  la captura se vio el problema: con doce bloques grises de la altura del
  gráfico, **cuatro semanas con algo se leen como un gráfico casi lleno**. Lo
  que marca el suelo es una línea de base hairline. Ninguna comprobación iba a
  encontrar eso — **hay que renderizarlo y mirarlo**.
- **El valor va en dos barras, no en las doce**: la más alta y la última. Doce
  números pegados no los lee nadie.
- **La tabla de abajo no es un extra: es la versión accesible**, y por eso el
  gráfico va `aria-hidden`. Doce columnas enfocables serían doce paradas de
  tabulador para leer lo que la tabla dice mejor.

#### Comparar dos diagnósticos mide si SABE más, no si trabajó más

Se pueden resolver trescientos ejercicios de lo que uno ya sabía. Cuando el
alumno tiene dos diagnósticos, debajo de la curva va la comparación área por
área, con la barra divergente, la flecha y **los puntos escritos** (`+40 puntos
(30% → 70%)`): con daltonismo el verde y el ámbar no se distinguen, y eso ya
está medido en el diagnóstico de clase.

- **Menos de 5 puntos no se pinta.** Son dos pruebas distintas —las preguntas se
  sortean— y llamar «mejoró» a tres puntos es ruido.
- **Los diagnósticos anteriores salen de `training_progress`, no del espejo
  `training_state`**: el espejo guarda SOLO el último, así que con él no hay con
  qué comparar. Van con `.limit(5)` y su `.eq()` de alumno.
- **El resumen lo hace `PlanEntrenamiento.resumir()`**, que es quien sabe de
  áreas y porcentajes: una segunda cuenta acá podría decir otro nivel que el
  resto del informe.
- Hoy **solo 2 alumnos de 97 tienen más de un diagnóstico**, y es justamente
  porque repetirlo no servía de nada: no había dónde comparar. Esto es lo que
  rompe ese círculo.

#### El bloque se esconde entero si no hay nada

Sin semanas con algo y sin dos diagnósticos no se destapa: un panel que diga
«todavía no hay datos» es ruido en todas las visitas menos una, la misma
decisión que la bitácora. Y si la consulta **falla**, se dice — una curva vacía
y una que no se pudo leer se ven igual y son cosas muy distintas.

**Al tocar `js/evolucion-alumno.js`, la función `evolucion_alumno()` o el bloque
de Informes, correr `node herramientas/verificar-informes.js`.** Comprueba sin
navegador los seis casos del veredicto (incluidos «empezó» y «dejó de
entrenar», que son los que un porcentaje no sabe decir), y en un navegador de
verdad que las 12 semanas se pinten con las vacías incluidas, que **una semana
en cero no dibuje barra** —se mide el alto que calcula el navegador, no la
clase—, que la tabla diga los mismos números que la base mandó, que la
comparación de diagnósticos salga con los puntos escritos, que **no se cuele el
diagnóstico de otro alumno** y que sin nada el bloque no se destape.

- **Su Supabase de mentira ahora FILTRA Y ORDENA de verdad** (`eq`, `in`,
  `order`, `limit`). Antes devolvía siempre la tabla entera: habría dado por
  buena una página que mezcla los diagnósticos de dos alumnos, y una que se
  quedara con la fila que no era al pedir «el anterior». Al arreglarlo saltaron
  los datos de prueba, a los que les faltaba el `student_id` — era el doble el
  que estaba incompleto, no la página.

### El tiempo conectado no se lo cree porque lo diga el navegador

`class_presence_log` (clase en vivo, latido de `sesion.html`) y
`platform_activity_log` (entrenamiento, latido de `js/tiempo-plataforma.js`)
son las dos tablas de donde sale `minutos_clase`/`minutos_ejercicios`. Sus
políticas de insert/update solo exigían `student_id = auth.uid()`, sin acotar
`joined_at` ni `left_at`: un alumno podía, desde la consola del navegador,
insertar o actualizar una fila propia con la hora que quisiera —incluida una
de hace veinte años— e inflarse los minutos que después ve su profesor y que
le llegan a la casa en "📧 Informes a la casa". La página nunca lo hacía —
`abrirFila()`/`tocarFila()` y `startPresenceLog()`/`touchPresenceLog()` solo
mandan lo que hace falta y la hora del momento—, pero la tabla en sí quedaba
abierta a mandarle cualquier cosa.

- **`public.proteger_tiempos_de_presencia()`** (trigger `BEFORE INSERT OR
  UPDATE` en las dos tablas) ignora lo que mande el cliente y usa el reloj del
  servidor: en el insert fuerza `joined_at := now()` y `left_at := null`
  —nadie necesita mandar otra cosa—, y en el update hace `new := old` y
  después `new.left_at := now()`, o sea que revierte CUALQUIER otra columna a
  su valor de antes y solo deja avanzar `left_at`. Es el mismo patrón que
  `protect_answer_grading`, aplicado a las dos tablas con una sola función
  porque el problema es idéntico en las dos.
  - De regalo, esto cierra otra puerta que no era la buscada: el update de
    `class_presence_log` tampoco revalidaba nada más que la dueñez de la
    fila, así que un alumno podía reasignar su propia fila de presencia a
    OTRA `session_id` —el insert sí exige `es_mi_profesor(cs.created_by)`,
    pero el update no volvía a mirarlo—. Con `new := old` esa columna
    tampoco se mueve.
  - Comprobado impersonando roles en SQL: un insert con `joined_at`/`left_at`
    inventados los ignora y usa "ahora"; un update legítimo (mandar la hora
    real, como hace la página) sigue funcionando igual; un intento de
    reasignar `session_id` a otra clase queda revertido.
- **La fórmula de "unir tramos superpuestos" ya no está copiada tres veces.**
  Estaba pegada tal cual en `informes_resumen_alumnos()`, `informe_de_alumno()`
  y `reporte_actividades()` — si un día hay que corregir el criterio (por
  ejemplo, el margen de 20 s), había que acordarse de tocarla en los tres
  lugares. Ahora vive en `public.minutos_por_tramos(tramo_crudo[])`, que recibe
  un arreglo de `(particion, joined_at, left_at)` —`particion` es lo que sea
  que se esté agrupando, normalmente `student_id::text`— y devuelve los
  minutos ya sumados por partición. Las tres funciones solo arman el arreglo
  con un `array_agg` y le pasan el resultado.
  - Comprobado contra datos reales antes y después del cambio: los tres
    devuelven exactamente los mismos números que devolvían con la cadena de
    CTEs vieja (diferencia 0 en todos los alumnos), y aparte la función nueva
    se comparó tramo por tramo contra la cadena vieja sobre toda
    `platform_activity_log`.

### `training_progress` tenía el mismo problema, con otro nombre

Igual que las tablas de tiempo, `training_progress_insert_own` solo exige
`student_id = auth.uid()`: el contenido de `detail` (jsonb) quedaba entero en
manos del cliente. La diferencia es que acá no hay ninguna política de
`update` —una fila insertada no se puede tocar—, así que alcanza con validar
en el insert.

- **No todos los campos de `detail` son igual de sensibles.** Los que
  importan son los que `informes_resumen_alumnos()` usa como "la mejor
  marca": `coordenadas.score` (vía `mejor_coord`) y `practicar.stars`. Un
  `rating` de Lichess en `temas`/`tactica`, en cambio, describe la dificultad
  del EJERCICIO, no algo que el alumno se gane — inflarlo no le sirve de
  nada, así que no hace falta acotarlo.
- **`public.validar_marca_training_progress()`** (trigger `BEFORE INSERT`)
  rechaza con una excepción —no recorta el valor en silencio— un
  `coordenadas.score`/`best_streak`/`misses` fuera de 0-300 (el más alto en
  los datos reales es 33, en una ronda de 30s; 300 deja muchísimo margen y
  aun así es humanamente imposible de alcanzar de verdad) o un
  `practicar.stars` fuera de 1-3 (`entreno/practicas.html` solo asigna esos
  tres valores). Rechazar en vez de recortar es a propósito: un score
  recortado a 300 seguiría siendo una marca falsa, solo que más discreta.
  Comprobado impersonando roles en SQL: las marcas legítimas (dentro de
  rango, y cualquier otra actividad que el trigger no toca) se siguen
  insertando igual; un `score: 999999` o `stars: 50` quedan rechazados.
- **Lo que esto NO cierra**: los conteos basados en "cuántos ids distintos"
  —`puzzles` (4×4), `lecciones` (Aprende), `mate1/2/3`, `tactica`,
  `concentracion`— se pueden seguir inflando insertando muchas filas con
  `puzzle_id`/`lesson_id` inventados. Cerrar eso de verdad pediría tener el
  banco real de ejercicios adentro de Postgres, sincronizado con los JSON
  que sirve el sitio, para poder validar que cada id existe — un proyecto
  aparte, no este arreglo puntual.
- **Hallazgo de paso, sin arreglar**: el `CHECK` de `activity` no incluye
  `'curso'`, así que `cursos_temas` (el CTE `entreno` de
  `informes_resumen_alumnos()` filtra por `tp.activity = 'curso'`) cuenta
  contra cero filas siempre —confirmado, hoy no hay ninguna fila con esa
  actividad—. No se tocó porque no se investigó de dónde debería salir ese
  número en realidad (`training_state` es candidato, ya que el progreso de
  cursos podría estar viviendo ahí y no en `training_progress`), pero queda
  anotado: es el mismo síntoma de siempre, un campo que se ve en cero sin
  que nada avise por qué.

## Los informes que llegan a la casa

En Informes, mirando a UN alumno, está "📧 Informes a la casa": a qué correos se
le manda su informe y cada cuánto (diario, semanal, mensual o anual). Sale solo,
sin que nadie apriete nada. **Es lo primero que el sitio manda por su cuenta**:
hasta ahora el correo lo escribía siempre una persona (el `mailto:` del examen
de arbitraje).

- `encargados` (alumno, nombre, correo, frecuencia, activo, último envío). La
  persona encargada **no tiene cuenta en el sitio ni la necesita**: solo un
  correo. Los maneja cualquiera de los profesores del alumno, y quien
  administra.
- **La frecuencia es las dos cosas a la vez**: cada cuánto se manda Y qué
  periodo cubre. El informe semanal cuenta la semana, no todo lo que lleva
  hecho. Por eso `informe_de_alumno(alumno, desde, hasta)` es una función
  aparte de `informes_resumen_alumnos()`, que cuenta desde siempre.
- **El circuito**: `pg_cron` (todos los días a las 13:00 UTC, 7 de la mañana en
  Costa Rica) → `disparar_informes_encargados()` → `pg_net` → la Edge Function
  `informes-encargados` → Resend, desde `informes@ajedrez-integral.com` (el
  dominio está verificado). Corre a diario y cada encargado recibe el suyo solo
  cuando le toca, con medio día de margen para que un minuto de diferencia no le
  haga saltar una vuelta entera.
- **La tanda va firmada.** `verify_jwt` está en `false` porque el disparador no
  trae sesión de persona; a cambio, esa acción exige un secreto que vive en la
  bóveda (Vault) y que la propia función vuelve a leer con la service role para
  compararlo. Está comprobado: con una firma inventada responde 401. El secreto
  lo generó la migración con `gen_random_bytes` y no está escrito en ninguna
  parte.
- **`ultimo_envio_at` se marca DESPUÉS de que Resend acepte el correo**, nunca
  antes: si falla, la tanda del día siguiente lo vuelve a intentar en vez de
  darlo por mandado.
- **El HTML del informe se escribe una sola vez**, en `informe-html.ts` dentro de
  la función. Lo que se ve en pantalla, lo que se descarga y lo que le llega a la
  casa son el mismo archivo; la página **no** lo arma por su lado (pide la acción
  `vista_previa`). Si estuviera duplicado, el correo y la descarga se irían
  separando.
- Va con los estilos puestos **a mano en cada etiqueta**, no con una hoja aparte:
  Gmail descarta `<style>` del `<head>`, así que un CSS bonito se vería perfecto
  en el navegador y roto en el correo, que es donde de verdad se lee. Y el tono
  es para una madre o un padre, no para un colega: nada de "filas" ni "registros",
  y cuando la semana viene vacía se dice sin regañar a nadie.
- **El permiso no se comprueba a mano en la Edge Function**: para "enviar ahora"
  lee la fila con un cliente que lleva el JWT de quien llama, o sea pasando por
  la RLS. Si la RLS no se la devuelve, no es profesor de ese alumno. Una regla
  menos escrita dos veces.
- Comprobado de punta a punta contra Resend con `delivered@resend.dev` (su
  dirección de pruebas, que no llega a ninguna bandeja real): la primera corrida
  mandó 1 y la segunda saltó 1, que es exactamente lo que tiene que pasar.
- **La función vive en el repositorio**, en `supabase/functions/informes-encargados/`.
  Antes solo existía desplegada en Supabase: para cambiarle una línea había que
  bajarla, editarla a ciegas y volver a subirla, sin que quedara rastro de qué
  cambió ni cuándo.

### Lo que la casa de verdad quiere saber: si está trabajando o no

Ninguna de las cifras que el informe traía contestaba eso. Media hora puede ser
una sola tarde y veinte ejercicios también, así que el correo podía verse lleno
de números y no decir lo único que una madre pregunta.

- **Arriba de todo va una franja con el veredicto**, y es lo primero —y muchas
  veces lo único— que se lee: «Va bien · Practicó 5 días de 7», «Practicó poco»,
  «Sofía no entró a practicar» o «Se le pasó la fecha de 2 tareas y 1 examen».
- **Los días son la medida**, no los minutos: `informe_de_alumno()` devuelve
  `dias_activos`, los días distintos con actividad contados **en hora de Costa
  Rica** —mismo criterio que `progreso_dias_y_racha()`, para que quien entrena a
  las once de la noche no pierda el día por el huso del servidor—.
- **Cuántos días son "suficiente" vive en `PERIODOS`**, junto a la frecuencia
  (1 al día, 3 a la semana, 8 al mes, 60 al año). No es una nota ni una regla de
  la Academia: es el umbral con el que el correo decide el tono.
- **El orden de las reglas importa y está escrito**: lo VENCIDO manda sobre todo
  lo demás —se puede haber practicado los siete días y tener una tarea sin
  entregar—, y quedarse en cero manda sobre "practicó poco".
- **Ninguno de los textos regaña.** El de "no entró" ofrece ayuda, porque quien
  lo lee puede ser una familia a la que se le complicó el mes.
- Debajo van **Sus tareas** y **Sus exámenes**: cuántas le pusieron, cuántas
  terminó, qué se le venció, cuándo vence la próxima, cuántos exámenes rindió y
  con qué nota.

### Lo que la familia no veía: el plan

El correo contaba minutos, clases y ejercicios, y no decía **una palabra** del
plan. Detrás de esos números hay un diagnóstico de 63 preguntas por nueve áreas
y un plan de cuatro semanas con el objetivo medible de cada una — y la casa no
tenía forma de saberlo. El trabajo estaba hecho y era invisible.

El bloque **«🧭 Dónde está X y a dónde va»** va **arriba, pegado al veredicto y
antes de los números**, porque es el marco de todo lo que sigue: primero qué se
está haciendo y por qué, después cuánto. Lleva el nivel medido, **cuánto se
espera que practique** —que es lo más accionable que puede leer una madre—, las
áreas con su objetivo, la meta de Elo si la hay, y la nota del profesor.

- **El nivel medido se subió acá.** Estaba suelto al final del correo, que es
  donde no lo lee nadie.
- **La nota del profesor va destacada y rotulada «De su profe»**, porque es lo
  ÚNICO escrito a mano: todo lo demás lo propone el sitio a partir del
  diagnóstico.
- **No se le atribuye al profesor un trabajo que nadie midió.** El correo dice
  lo que de verdad pasó —«este plan se lo armó su profe a partir del
  diagnóstico»— y el verificador falla si aparece «horas», «dedicó» o
  «esfuerzo». Exagerar lo que hay se nota, y una vez que se nota ya no se cree
  nada de lo que el correo diga.
- **No se inventa ningún vínculo entre el plan y lo que hizo esta semana.** El
  correo ya trae «En qué trabajó» con la actividad real; cruzarlos pediría medir
  una correspondencia que nadie calcula. Se enseñan los dos y la familia los lee
  juntos.

#### Solo el plan COMPARTIDO, y por eso la función sigue siendo INVOKER

Un plan guardado sin compartir es el borrador del profesor: enseñárselo a la
casa antes que al alumno sería enseñar algo que todavía se está pensando. Con
ese filtro escrito dentro de `informe_de_alumno()`, los tres caminos que la
leen —la tanda de `pg_cron` con la service role, la vista previa del profesor y
el propio alumno— devuelven **exactamente lo mismo**, así que no hizo falta
volverla `SECURITY DEFINER` como `resumen_tareas_examenes()`.

Y si no hay plan compartido, el bloque **no aparece**: una sección que diga
«todavía no tiene plan» es ruido en todas las visitas menos una —la misma
decisión que la bitácora— y prometer un plan que no existe es peor que no
nombrarlo.

#### El cero que nadie veía

`training_plans` tenía **cero filas desde que la tabla existe**. El plan se
genera solo desde el diagnóstico, se enseña entero en Informes y tiene su botón
de compartir — y nadie lo había usado nunca, porque eso vive dos clics adentro
de Informes y **nada avisaba**.

Y no era que faltara el botón: **el de compartir vivía dentro del informe de
CADA alumno**, o sea veintitantas visitas para publicar veintitantos planes que
ya estaban armados. Ahora el panel de grupo —«🧭 Diagnósticos de nivel»— trae
**«Compartir los N planes que faltan»**, que lo hace de una.

- **A quien ya tiene un plan guardado sin compartir solo se le cambia la
  marca.** Regenerarlo le borraría al profesor la nota y los ajustes que hizo a
  mano, y eso no daría ningún error — simplemente perdería su trabajo. Por eso
  son dos escrituras y no una: un `update` para los borradores y un `upsert` con
  **`ignoreDuplicates`** para los que no tienen ninguno (si entre que se pintó
  la pantalla y se apretó el botón alguien le guardó un plan a alguno, se salta
  en vez de pisárselo).
- **Se confirma en el propio botón**, no con un diálogo del navegador — la misma
  decisión que borrar una nota de la bitácora, y acá pesa más: esto publica
  material de veintitantos alumnos de una vez, así que el segundo toque tiene
  que caer sobre un texto que diga exactamente qué va a pasar («Sí, compartir
  con los 3» · «sus planes entrarán en los informes que llegan a sus casas»).
- **Con todos al día no se ofrece el botón**, solo una línea. Un control que no
  cambia nada es peor que no tenerlo.
- **Compartir no dispara ningún aviso** (`training_plans` no tiene triggers):
  el plan aparece en la página del alumno y en el próximo informe a la casa, y
  nada más. Comprobado antes de escribir el botón — con un trigger, esto habría
  mandado veintitantos push de golpe.

Por eso `panel_profesor()` devuelve ahora `con_diagnostico` y `con_plan`, y «Tu
semana» lo dice en una línea. Se dice **una sola cosa**, la que toca antes: sin
diagnóstico no hay plan que armar, así que ese es el primer cuello; y un plan
sin compartir no lo ve ni el alumno ni su casa, o sea que cuenta como que no
existe. Con todo al día no se dice nada. Va en **ámbar y no en rojo**: esto no
se venció, está por hacer.

**Al tocar el lote, correr `node herramientas/verificar-informes.js`.** Su
Supabase de mentira tuvo que aprender dos cosas para esto, y las dos son de las
que dan verde sobre una página rota: **`upsert()`**, que no tenía —sin él,
compartir en lote tiraba un TypeError y el verificador lo contaba como fallo de
la página, que es el mismo tropiezo que ya se llevó
`verificar-aperturas-pagina.js`—, y **anotar la escritura en el RESOLVER y no en
el `update()`**: `.update(x).in("student_id", y)` encadena, así que un doble que
la apuntara antes se quedaría sin saber SOBRE QUIÉN se escribió y daría por
bueno un lote que comparte el plan del alumno que no era. Es la misma trampa que
ya documentó `verificar-clase-registrada.js`.

Está probado que falla de verdad: haciendo que el lote regenere el plan de quien
ya lo tenía ajustado, saltan cinco comprobaciones; y si el botón mandara sin
confirmar, salta la del primer toque.

**Esto pidió desplegar `informes-encargados`** (se arma con `node
herramientas/funciones-armar.js`). Comprobado después de subirla: con una firma
inventada la tanda responde **401** sin mandar un solo correo, que es la prueba
de que el módulo nuevo carga.

### Las tareas y los exámenes del informe NO se cuentan con la RLS de quien mira

`tareas` y `examenes` están aisladas por profesor a propósito (un profesor solo
ve las que ÉL mandó), y eso choca de frente con un informe que es del ALUMNO.
Son dos problemas, y el segundo es el que no se ve:

1. A la madre no le sirve leer "hizo 2 de 2 tareas" cuando en realidad le
   pusieron cinco entre sus dos profesores.
2. **`informe_de_alumno()` es `SECURITY INVOKER`**, así que la tanda de
   `pg_cron` (service role) y la vista previa del profesor pasarían por reglas
   distintas: el profesor vería un informe y a la casa llegaría otro, sin que
   nada fallara.

Por eso esa parte la da **`public.resumen_tareas_examenes(alumno, desde, hasta)`,
que es `SECURITY DEFINER`** y lleva escrito arriba quién puede preguntar por
quién (el propio alumno, quien administra, o `soy_profesor_de()`; `auth.uid()`
nulo es la tanda, y a `anon` se le revoca el `execute`).

- **Devuelve números y fechas, nunca títulos ni quién puso la tarea.** La
  familia necesita el conteo; el trabajo del colega sigue siendo suyo.
- **Las tareas las cuenta `tareas_con_avance()`**, la misma función que pintan
  `tareas.html` y el panel — dentro de la `SECURITY DEFINER` la RLS no filtra,
  así que vienen las de todos sus profesores. Escribir la cuenta de nuevo sería
  una tercera versión de "cuánto lleva hecho" que puede decir otra cosa.
- **Lo que quedó sin hacer se cuenta HOY, no dentro del periodo**
  (`sin_hacer_hoy`): una tarea que venció hace tres semanas no sale en el
  informe semanal y es justo la que hay que decir.
- Comprobado impersonando roles en SQL, con datos reales: el cron, el profesor
  del alumno y el propio alumno reciben **exactamente los mismos números**; una
  profesora que no lo tiene se lleva una excepción. Y la prueba que lo justifica:
  a una profesora que sí tiene al alumno pero no puso esas tareas, **su RLS le
  deja ver 0 tareas y 0 exámenes** mientras el informe cuenta 1 y 1.
- **Ojo al probar el aislamiento: Profe Angulo es `is_admin`**, así que ve todo y
  con él la prueba no prueba nada. Hay que impersonar a un profesor que no
  administre.

**Al tocar el informe de la casa, correr `node
herramientas/verificar-informe-casa.js`** (no necesita navegador, ni red, ni el
sitio servido). Comprueba que las cuatro situaciones se distingan y que el orden
de prioridad se respete —practicar los siete días no tapa una entrega vencida—,
que los números de tareas y exámenes lleguen al HTML con los nombres que de
verdad usa la base (una clave mal escrita no rompe nada: la sección simplemente
no aparece), que el informe diario no diga "practicó 1 día de 1", y que un
alumno sin nada no vea secciones vacías. Está probado que falla de verdad:
cambiándole `puestas` por `asignadas` al HTML, salta.

Lleva un ayudante, `herramientas/casos-informe-casa.mts`, porque
`informe-html.ts` es TypeScript —se despliega a Deno— y se corre con
`--experimental-strip-types`; el verificador lo lanza como subproceso para poder
seguir siendo un `.js` como el resto de `herramientas/`.

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

## Cobros: lo que se guarda es lo que pasó, no el estado

`cobros.html` son las mensualidades de la Academia: planes, quién paga qué,
cobros emitidos, pagos y morosidad. Es **una página para dos públicos**, como
`informes.html`: quien coordina o administra lo maneja todo; cualquier otra
cuenta ve **solo sus propios recibos**, de lectura.

**No es una función de profesor, a propósito.** Todo pasa por
`soy_coordinador()` (`es_coordinador or is_admin`): un profesor cualquiera no
tiene por qué ver cuánto paga cada alumno. Está comprobado impersonando roles
en SQL — un profesor sin coordinación recibe **cero filas** de `cobros_vista` y
de `planes_cobro`; el alumno recibe la suya y ninguna más.

**Y un coordinador tampoco ve los cobros de otro.** El alcance no es "coordina
o no" sino `bajo_mi_coordinacion(student_id)` (ver «Coordinar es un alcance,
no una llave maestra»), sobre `cobros`, `pagos`, `suscripciones`,
`cobros_contacto`, `avisos_cobro`, `datos_facturacion` y
`cobros_recordatorios_programados` — las siete tablas de esta página que
tienen alumno. Re-comprobado impersonando a dos coordinadoras reales de la
Academia: una con alumnos vinculados ve sus cobros, pagos y suscripciones; la
otra, sin ningún profesor vinculado todavía, recibe **cero filas** de las
siete, y `cobros_resumen()`/`cobros_morosos()` (que son `SECURITY INVOKER`
sobre `cobros_vista`, una vista con `security_invoker = on`) le dan **cero**
también — no hay ningún camino que las junte.

**Los `planes_cobro` también son privados por coordinador, y esto se
revirtió.** Nacieron compartidos —eran las tarifas de la Academia, sin alumno
al que atarlos— pero eso significaba que una coordinadora veía y podía tocar
el catálogo entero de las demás: "Mensualidad SJ" y "Mensualidad Cenfo"
mezclados en el mismo selector, con el desactivar de una alcanzando al plan de
otra. La migración `planes_cobro_personalizado_y_privados` cambió
`planes_lee_coordinacion`/`planes_escribe_coordinacion` de `soy_coordinador()`
a secas a `bajo_mi_coordinacion(creado_por)`, el mismo patrón que el resto de
esta página. Cada coordinadora arma y ve solo sus propios planes; quien
administra, como siempre, todos.

- **`cobros.estado` solo vale `emitido` o `anulado`.** "Pagado" y "vencido" NO
  se guardan: los calcula `public.cobros_vista` a partir de lo único que se
  escribe — que se emitió un cobro y que entró un pago. Si "pagado" fuera una
  columna habría que mantenerla al día con un trigger y podría contradecir a la
  suma de los pagos, que es exactamente el fallo callado que ya tuvimos con el
  contador de invitaciones. **La página tampoco recalcula: pinta la `situacion`
  que viene de la base.**
- Se aceptan **pagos parciales**: `pagos` es una fila por abono y el saldo es la
  resta. Un cobro queda pagado cuando la suma alcanza, sin que nadie lo marque.
- **`generar_cobros()` se puede correr todas las veces que se quiera.** El
  índice único `(suscripcion_id, periodo_inicio)` es lo que impide duplicar:
  la segunda corrida devuelve 0. Comprobado, y también que al mes siguiente
  emite exactamente uno más.
- El periodo arranca en el **mes** de `inicio`, no el día: la mensualidad de
  quien entra el 20 cubre ese mes completo.
- `cobros_resumen()` devuelve **una fila por moneda**: sumar colones con dólares
  daría un número que no significa nada.
- Las tres funciones de cuenta son **`SECURITY INVOKER`**, igual que las de
  informes: quién ve qué lo sigue decidiendo la RLS de cada tabla.

### Los avisos de morosidad

Mismo circuito que los informes a la casa: `pg_cron` → `pg_net` → Edge Function
`cobros-recordatorios` → Resend, desde el dominio verificado. Dos tareas
diarias: `cobros-generar` a las 11:30 UTC (5:30 de la mañana en Costa Rica) y
`cobros-recordatorios` a las 12:30 — los cobros quedan emitidos **antes** de que
salgan los avisos.

- Tres avisos: **días antes** de vencer, **días de atraso** para "vencido" y
  **días de atraso** para "moroso" — de fábrica 3, 1 y 15, pero **configurables
  para toda la Academia** (ver «Cuándo salen los tres avisos automáticos» más
  abajo). Van a los encargados apuntados en Informes y a la propia cuenta del
  alumno.
- **Un correo por alumno, no uno por cobro**: a nadie le sirve recibir tres el
  mismo día. Se manda el estado de cuenta entero con el tono del aviso más
  urgente que tenga.
- **Cada aviso se manda una sola vez**, y lo garantiza el índice único de
  `avisos_cobro (cobro_id, tipo, correo)`, no un `if` en el código. La fila se
  apunta **después** de que Resend acepte: si falla, mañana se reintenta en vez
  de darlo por mandado. Comprobado de punta a punta contra `delivered@resend.dev`
  — la primera corrida mandó 2 y la segunda saltó 2.
- La tanda va firmada con su propio secreto del Vault (`tanda_cobros_secreto`,
  generado por la migración y nunca escrito en ninguna parte). Comprobado: con
  una firma inventada responde 401.
- **El tono no amenaza.** Ni el aviso de los 15 días habla de sacar a nadie de
  clase: dice que se hable. Quien lee puede ser una familia a la que se le
  complicó el mes.

### Cuándo salen los tres avisos automáticos

Los tres días —antes de vencer, de atraso para "vencido", de atraso para
"moroso"— estaban escritos como constantes dentro de
`supabase/functions/cobros-recordatorios/index.ts`
(`DIAS_ANTES_DE_VENCER`, `DIAS_VENCIDO`, `DIAS_PARA_MOROSO`): cambiarlos era
editar la función y volver a desplegarla. Ahora se editan desde la ficha
«Morosidad» de `cobros.html`, en «⏱️ Cuándo salen los tres avisos automáticos».

- **Valen para TODA la Academia, no por alumno ni por coordinador.** Es un
  ajuste de cuándo se manda cada tipo de aviso, no de a quién — la misma
  decisión que ya tomó `whatsapp_consultas`, guardado en la misma tabla
  clave/valor `ajustes_academia` (claves `cobros_dias_antes`,
  `cobros_dias_vencido`, `cobros_dias_moroso`).
- **Si el ajuste no existe o trae algo raro, se usa el de siempre y la tanda
  sigue.** `parametrosAvisos()` lee las tres claves con `try/catch` y valida
  cada una (`diasAntes >= 0`, `diasVencido >= 1`, `diasMoroso > diasVencido`);
  lo que no pase la prueba cae al valor por omisión (3 / 1 / 15). Un ajuste mal
  guardado nunca rompe la corrida diaria — como mucho, no cambia nada.
- **La página valida lo mismo antes de guardar**, con el mismo criterio: sin
  eso, un "moroso" antes que "vencido" dejaría cobros marcados vencidos
  saltando derecho a "moroso" sin pasar por el aviso del medio, y la tanda lo
  aceptaría igual porque `parametrosAvisos()` también lo rechazaría — solo que
  en silencio, cayendo al valor de siempre sin decir por qué el ajuste guardado
  "no sirvió".
- **`ajustes_academia` ya tenía RLS para que cualquiera con sesión lea y
  `soy_coordinador()` escriba** (es la misma tabla del número de WhatsApp), así
  que no hizo falta ninguna política nueva.

### Un recordatorio para un día y una hora exactos

Los tres avisos de arriba salen solos, en la hora que decide el cron. Pero
"que le llegue el lunes a las 8, después de hablar con la mamá" no es ninguno
de los tres, así que en la ficha «Morosidad» de `cobros.html` hay un
**«📅 Programar un recordatorio»**: se elige el alumno, el día y la hora, y
opcionalmente a qué correos (si se dejan en blanco, los mismos destinos de
siempre — el fijado a mano, si hay; si no sus encargados; si no, su cuenta).

- **Es una fila, no una llamada.** `public.cobros_recordatorios_programados`
  (alumno, cuándo, estado, correos opcionales, nota) se escribe **directo
  desde el navegador** con `sb.from(...).insert(...)`: su RLS ya exige
  `soy_coordinador() and bajo_mi_coordinacion(student_id)` para las cuatro
  operaciones, así que no hace falta una Edge Function solo para guardar el
  dato — la misma razón por la que `anularCobro()` y `registrarPago()`
  escriben directo. Cancelar es la misma fila con `estado: 'cancelado'`.
- **Mandarlo sí necesita la service role**, porque el correo tiene que salir
  aunque quien lo programó no tenga la pestaña abierta esa hora: eso es
  `"tanda_programados"`, una acción más de la Edge Function
  `cobros-recordatorios` (las otras: `vista_previa`, `recordar_ahora`,
  `tanda`). Un `pg_cron` corre cada 5 minutos —bastante seguido para que "a
  las 3pm" salga cerca de las 3pm— y solo llama a la función si hay algo
  `pendiente` con `programado_para <= now()`; la mayoría de las corridas no
  cuestan ni una llamada HTTP. Va firmada con el mismo secreto que `tanda`
  (`tanda_cobros_secreto`).
- **El tipo de aviso (próximo/vencido/moroso) se calcula a esa hora, no al
  programarlo.** Entre que se programa y que llega su momento pueden pasar
  días: un cobro que era "vencido" puede haberse pagado. Por eso
  `tanda_programados` vuelve a mirar los cobros pendientes del alumno en el
  momento de mandar, exactamente como hace `recordar_ahora`.
- **Si para esa hora ya no hay nada pendiente, o no hay a quién avisarle, NO
  se manda ningún correo — pero la fila igual se marca `enviado`, con la
  razón en `nota`.** Dejarla en `pendiente` para siempre la haría reintentar
  cada 5 minutos sin sentido; y contarla como "falló" sería mentir, porque no
  falló nada: ya no hacía falta. `nota` es justo lo que evita que "enviado"
  mienta en silencio — dice a quién se le mandó, o por qué no se mandó nada.
- **El `avisos_cobro` de siempre se sigue respetando.** Si el mismo cobro ya
  recibió su aviso ese día por la tanda diaria o por "Recordar ahora", el
  `upsert` con `onConflict: cobro_id,tipo,correo` no lo duplica.
- **`anon` tenía permiso de tabla sobre esta, y las tablas hermanas no.**
  `cobros`, `pagos`, `suscripciones`, `cobros_contacto`, `avisos_cobro` y
  `datos_facturacion` ya le tenían revocado el `select/insert/update/delete` a
  `anon` desde que se crearon; esta se quedó con lo que Supabase le da por
  omisión a toda tabla nueva, porque nació sin ese paso. La RLS ya la paraba
  igual —`anon` no tiene `auth.uid()`, así que `bajo_mi_coordinacion()` le da
  `false` siempre— pero es la misma decisión que en `formularios` y
  `profile_teachers`: una puerta menos que dependa de que la política esté
  bien escrita. Se revocó (`revoke all ... from anon`).

**Al tocar esto, correr `node herramientas/verificar-cobros.js`** (con el
sitio en localhost:8777 y playwright). Comprueba qué manda el formulario al
programar (el alumno, el momento en ISO y los correos sueltos), que un correo
mal escrito no llegue a mandarse, que cancelar filtre por el id de ESE
recordatorio y no de otro, y que la lista pinte el nombre del alumno y su
estado. Lo que hace la Edge Function con la service role —recalcular el tipo,
no mandar nada si ya no hace falta, dejar la nota— se comprobó leyendo el
código y contra la base, como el resto de las tandas firmadas de este
archivo.

### Un cobro personalizado, sin pasar por el catálogo

"Poner a un alumno en un plan" solo dejaba elegir de la lista de
`planes_cobro`, y el caso de todos los días —una beca a la medida, un acuerdo
puntual con una familia— obligaba a crear un plan del catálogo solo para ese
alumno, y ese plan se quedaba ahí para siempre ofreciéndosele a cualquiera.

La casilla **"Cobro personalizado"** de esa misma ficha destapa tres campos
—concepto, monto y moneda— en vez del selector de plan. Al guardar:

- **Se crea un `planes_cobro` normal, marcado `personalizado = true`, y la
  suscripción apunta a ese plan nuevo.** No hay ninguna tubería aparte:
  `generar_cobros()` y `cobros_resumen()` no distinguen entre un plan del
  catálogo y uno personalizado — son la misma fila con la misma forma, así que
  reusan exactamente el mismo camino que ya emitía y cobraba mensualidades.
- **La periodicidad queda fija en "mensual"** y no se pregunta: un cobro
  personalizado es casi siempre "esto en vez de la mensualidad de siempre", y
  un campo más que llenar es un campo que se puede llenar mal.
- **No sale ni en la pestaña «Planes» ni en el selector de plan de esta misma
  ficha.** `pintarPlanes()` y el `<select id="s-plan">` filtran
  `!p.personalizado`: es un plan de un alumno, no catálogo de nadie más, y
  ofrecerlo ahí sería mezclar "las tarifas de la Academia" con un acuerdo de
  una sola familia. El arreglo `planes` completo (con los personalizados
  adentro) se sigue usando para resolver el nombre y el monto de cada
  suscripción — lo que se filtra es dónde se OFRECE, no lo que existe.
- **Es privado, como cualquier otro plan desde el cambio de arriba.** Se crea
  con `creado_por: session.user.id`, así que `bajo_mi_coordinacion(creado_por)`
  ya lo deja visible solo para quien lo armó (y para quien administra).

**Al tocar esto, correr `node herramientas/verificar-cobros.js`** (mismo
verificador de arriba). Comprueba que un plan `personalizado` no aparezca en
«Planes» ni en el selector, que marcar la casilla esconda el selector y
muestre los tres campos, que guardar cree el plan con `personalizado: true` y
que la suscripción use el `id` de ESE plan recién creado (no el de otro plan
cualquiera — el fallo callado sería reusar sin querer un plan ajeno), y que
sin concepto no se cree nada.

### Los correos de una familia se corrigen en un solo lugar

Son TRES cosas distintas, y hasta ahora se tocaban en tres pantallas o en
ninguna:

| qué | dónde vive | quién podía tocarlo antes |
|---|---|---|
| con qué entra el alumno | `profiles.email` + `auth.users.email` | nadie desde el navegador |
| a dónde va el informe de la casa | `encargados` | solo un profesor SUYO |
| a dónde va el cobro | `cobros_contacto` (nuevo) | no existía |

La pregunta de quien está corrigiendo es UNA —«¿a dónde le estamos escribiendo
a esta familia?»—, así que los tres se manejan juntos, en la ficha «✉️
Contacto» de `cobros.html`, y los escribe la Edge Function **`correos-alumno`**.

- **Por qué hace falta una función y no alcanza con la RLS**, que es lo que hay
  que entender antes de tocarlo: `profiles.email` lo revierte el trigger
  `protect_profiles_identity_columns` —el correo es la llave con la que se
  inicia sesión— y además hay que cambiarlo en `auth.users`, que desde el
  navegador no se toca; `encargados` pide `soy_profesor_de()`, así que quien
  coordina sin ser profesor de ese alumno no podía corregir ni una letra.
- **Cuidado con el trigger, que es el fallo callado de siempre**: solo revierte
  cuando `auth.uid()` no es nulo. Escribir con la service role funciona;
  hacerlo con el cliente que lleva el JWT "funciona" también —y el valor queda
  como estaba, sin dar ningún error—. Por eso la función **vuelve a leer la
  fila** y falla si el correo no quedó, como ya hacía `marcar_coordinador()`.
- **Quién puede**: `soy_coordinador()` primero, y después la fila del alumno se
  lee con el JWT de quien llama. Si la RLS de `profiles` no se la devuelve, ese
  alumno no es suyo. La misma regla de `reenviar-acceso`, escrita una sola vez.
- **Un correo que ya es de otra cuenta se rechaza con un 409 que dice qué
  hacer**, en vez de pisarla: si son hermanos, la salida es «No tiene correo
  propio», que le arma un usuario de la Academia.
- **Corregir el correo de quien ya estaba apuntado es un UPDATE sobre su fila,
  no un alta.** De otra forma quedarían los dos —el bueno y el que tenía la
  letra mal— y a ese le seguirían saliendo los informes.

#### `cobros_contacto`: el correo del cobro, cuando hay que decirlo a mano

`correo_cobro()` miraba los encargados y, si no había, la cuenta del alumno.
Los dos son datos de OTRA cosa, así que corregir a dónde va el recibo obligaba
a cambiar algo que no era — y el caso de todos los días es tan tonto como una
letra mal escrita en el correo de la mamá, o un papá que paga pero no recibe
el informe.

- Una fila ahí **manda sobre todo lo demás y es la ÚNICA dirección** a la que
  se le avisa de ese cobro. No se suma a los encargados: si se sumara,
  corregir un correo equivocado seguiría mandándole el aviso al equivocado.
- **No acepta un usuario interno.** Ese dominio no tiene MX a propósito, así
  que fijarlo ahí sería mandar los avisos a un buzón que no existe: Resend
  acepta el envío, el correo rebota y no falla nada.
- El alumno **lee el suyo y no lo escribe**: tiene que poder ver a qué correo
  le llegan los avisos, pero si pudiera cambiarlo bastaría con eso para dejar
  de recibirlos.
- Comprobado impersonando roles en SQL: el correo se guarda en minúscula y sin
  espacios, manda sobre el encargado, el usuario interno se rechaza, y los
  intentos del alumno de editarlo o borrarlo cambian **0 filas**.

### El teléfono de las familias ya no está escrito en el código

El número al que la casa escribe salía a mano en **cuatro archivos** —el
informe de la casa, el informe de un examen, el aviso de cobro y «Mis pagos»—,
así que cambiarlo era una tanda de ediciones y un despliegue, y quien coordina
la Academia —que es justamente quien atiende esas consultas— no tenía forma de
tocarlo.

Ahora vive en **`public.ajustes_academia`** (clave/valor, clave
`whatsapp_consultas`) y se cambia desde la ficha «✉️ Contacto» de `cobros.html`.

- **Es clave/valor y no una columna por cosa** a propósito: lo que venga
  después (una dirección, un horario de atención) entra sin migrar la tabla.
- **Lo lee cualquiera con sesión** —es lo que la página le enseña al alumno
  cuando le dice a dónde escribir— y lo escribe `soy_coordinador()`.
  Comprobado: un alumno lee 1 fila y sus updates cambian **0**.
- **Si no hay número, no se inventa ninguno**: los correos salen pidiendo que
  respondan ese mismo correo. Un correo sin número al que escribir es peor que
  uno con el número de siempre, pero MUCHO mejor que uno con un número que ya
  no atiende nadie. Por eso tampoco hay un valor de respaldo escrito en el
  código: la fila se sembró con el número que había.
- **`wa.me` quiere los dígitos CON código de país.** Sin él, el enlace abre un
  chat con un número que no existe y eso se ve como un enlace perfecto: un
  número de ocho dígitos es de Costa Rica y se le pone el 506 delante. La regla
  está en `_compartido/contacto-academia.ts` y, a la fuerza, otra vez en
  `cobros.html` — son dos tiempos de ejecución que no pueden leerse entre sí.
- Las páginas **públicas** (la portada, `sobre-oscar.html`, el pie del sitio)
  siguen con el número escrito: son HTML estático que tiene que poder
  indexarse y leerse sin JavaScript, y ahí el número es el de la Academia de
  siempre. Lo que se movió es lo que sale POR CORREO.

**Esto pide desplegar cuatro Edge Functions**, ya desplegadas desde esta tanda:
`correos-alumno` (nueva), `cobros-recordatorios` (que además ahora respeta el
correo fijado a mano), `informes-encargados` e `informe-examen`. Se arman con
`node herramientas/funciones-armar.js`. `cobros-recordatorios` **entró al
repositorio en esta tanda**: antes vivía solo desplegada, así que cambiarle una
línea era bajarla, editarla a ciegas y volver a subirla.

### Pasarela y factura electrónica

**No hay pasarela de pago, por decisión explícita**: el cobro se registra a mano
(SINPE Móvil, transferencia o efectivo), que es como funciona de verdad la
mayoría de academias acá y no necesita ninguna credencial. `pagos.metodo` ya
contempla `tarjeta`, así que enchufar una pasarela (ONVO Pay, Tilopay) es sumar
quién escribe esa fila, no rehacer el modelo.

**Tampoco se emite factura electrónica de Hacienda**, pero las tablas ya tienen
sus campos (`cobros.hacienda_clave`, `hacienda_consecutivo`, `hacienda_estado` y
la tabla `datos_facturacion`) para no tener que migrar después. El consecutivo
de hoy es el del **recibo interno** (`AI-2026-000123`). Emitir de verdad pide
credenciales de ATV y certificado de firma digital, que son un trámite del
dueño del negocio, no código.

**Al tocar cobros.html, correr `node herramientas/verificar-cobros.js`** (con el
sitio en localhost:8777 y playwright). Comprueba en un navegador de verdad las
dos caras de la página, que no recalcule situaciones, qué manda al crear un
plan, al poner a un alumno en un plan, al registrar un pago y al anular, y que
el CSV salga con punto y coma y BOM.

### Cobros no es de profesores, y la lista ya no se baja entera

Dos cosas que cambiaron en esta pantalla, por dos razones distintas:

- **Quien da clase y no coordina no ve NADA de cobros.** Antes caía en «Mis
  pagos» y veía una lista vacía —a una cuenta de profesora no se le cobra—, que
  se lee como una página rota en vez de como «esto no es tuyo»; ahora se le
  dice con todas las letras de quién es la página. La tarjeta **«Mis pagos» se
  fue del panel entero**, también para el alumnado: las mensualidades son cosa
  de la casa, no de quien entra a entrenar. La página sigue enseñándole a cada
  quien sus propios recibos si entra por la dirección —lo que se quitó es el
  camino, no el derecho a ver lo suyo—. Comprobado impersonando roles en SQL:
  un profesor sin coordinación recibe **0 filas** de `cobros`, `cobros_vista`,
  `planes_cobro`, `suscripciones` y `cobros_contacto`.
- **El filtro y el corte los hace la base.** Esta página se bajaba los cobros
  con un `.limit(1000)` y filtraba en el navegador: es la misma piedra de
  `informes.html` y del registro de clases —PostgREST corta la respuesta a
  partir de cierta cantidad de filas SIN DAR NINGÚN ERROR—, y con una
  mensualidad por alumno y por mes ese techo se cruza en un par de años de
  academia. A partir de ahí la página habría empezado a esconder cobros en
  silencio, y los totales de arriba (que sí salen de la base) habrían dejado de
  cuadrar con la lista sin que nadie supiera por qué.
  - Ahora vienen de treinta en treinta, con su cuenta total (`count: "exact"`),
    su búsqueda por concepto o número de recibo y su «Ver más».
  - Y **agrupados por mes**, con el más nuevo abierto y los de atrás cerrados:
    con trescientos recibos de corrido no se encuentra ninguno. Es el mismo
    patrón del registro de clases del panel. El encabezado de cada mes dice
    cuántos hay y cuánto queda sin pagar, **por moneda** — sumar colones con
    dólares daría un número que no significa nada.
  - El **CSV baja lo que cumple el filtro, no lo que se alcanzó a pintar**, y
    lo pide de mil en mil: quien filtró por «vencidos» quiere los vencidos, no
    los treinta primeros.
  - El texto de búsqueda se limpia antes de mandarlo: PostgREST arma el `or=(…)`
    con comas y paréntesis, así que un concepto con una coma rompería la
    consulta entera. Y cada consulta lleva su marca, para que una respuesta que
    llega tarde no pinte el resultado de un filtro que ya no está.
- **La ficha que quedó abierta se recuerda**, como las pestañas de la clase en
  vivo: registrar un pago recarga la página entera y volver siempre a «Cobros»
  obliga a buscar otra vez dónde se estaba.
- **Desde Morosidad se llega a corregir el correo**, con el alumno ya elegido:
  el momento de darse cuenta de que el correo está mal es justo ese, viendo que
  alguien lleva 40 días de atraso al lado de la dirección a la que le estuvimos
  escribiendo. Y la fila dice **a qué correo se le avisa**, o avisa de que no
  hay ninguno.

**Al tocar `cobros.html`, correr `node herramientas/verificar-cobros.js`.**
Comprueba además de lo de siempre: que los cobros se pidan con su cuenta y con
un rango (si alguien vuelve a bajárselos todos, la página se ve igual de bien
hasta que hay más de mil), que se agrupen por mes con solo el primero abierto,
que buscar pregunte a la base, que una profesora no reciba **ni un cobro**, que
el número de las familias salga de los ajustes y no escrito en la página, que
un número de tres dígitos no se guarde, y qué manda la ficha de contacto al
corregir cada uno de los tres correos.

## Reportes de actividades para presentar

`reportes.html` (botón "📄 Reportes de actividades" en `admin.html`) arma el
informe de lo que pasó en clase en un periodo, para presentarlo a quien haya
que presentárselo. Sale en **Word y en PDF**, los dos con la marca de agua de
Oscar en todas las páginas.

Es de **quien coordina o administra** (`is_admin || es_coordinador`), como
`cobros.html`. Lo que se ve dentro lo sigue acotando la RLS.

- **Los datos salen de `public.reporte_actividades(desde, hasta)`**, que es
  `SECURITY INVOKER` como las de informes: clases con su título, fecha, duración
  y notas; asistencia por clase y por estudiante; minutos en clase; preguntas de
  pizarra y aciertos. **Los minutos se cuentan con la misma técnica que
  `informes_resumen_alumnos()`** (unir tramos superpuestos antes de sumar): un
  informe que diga otro número que la página de Informes sería peor que no
  tenerlo.
- **Los archivos que se suben no se suben a ningún lado.** Fotos, hojas de
  cálculo y grabaciones se leen en el navegador, entran al documento y ahí
  termina. No hace falta Supabase Storage, no hay gigabyte que administrar y
  —lo que más pesa— no quedan fotos de menores guardadas en un servidor.
- **El contenido se arma UNA sola vez**, en `js/reporte-armar.js`: de esa
  estructura neutral salen la vista previa, el PDF y el Word. Si cada generador
  armara lo suyo, los dos archivos se irían separando a la primera corrección
  — la misma razón por la que el informe que llega a la casa vive en un solo
  `informe-html.ts`.

### Dos informes distintos, no uno con opciones

La página tiene **dos modos**, y la diferencia no es cosmética: cambia de dónde
sale la información.

1. **De la Academia** — las clases dadas en la plataforma. Los datos los pone
   `public.reporte_actividades()`.
2. **De clases dadas por fuera** — una escuela, un colegio, donde sea. Acá **no
   se consulta nada**: la asistencia sale del Excel que llevó quien dio la
   clase y el contenido, de sus documentos. Es el caso de todo profesor que da
   clases fuera del sitio y tiene que reportarlas igual.

#### Entender una hoja de asistencia hecha por una persona

`js/reporte-asistencia.js`. Esa hoja no la escribió un sistema, y por eso
reconoce **las dos formas** en que la gente lleva asistencia:

- **Una fila por asistencia** ("fecha | estudiante | asistió"), que es lo que
  sale de un formulario. Si no hay encabezados reconocibles, se deduce por el
  contenido: la columna con fechas en casi todas sus celdas es la fecha, y la
  de textos largos con letras es el nombre.
- **Matriz**: alumnos en las filas, fechas en las columnas, una marca en cada
  cruce. Es la que hace todo el mundo a mano y la que una librería de Excel no
  entiende sola — para ella son columnas con nombres raros.

**En una matriz, la casilla vacía es una FALTA.** Es lo que hace que la cuenta
sirva de algo: en la cuadrícula hay una casilla por cada alumno y cada fecha, y
quien lleva la lista marca a los que vinieron. Tratando el blanco como "no dice
nada", *todo el mundo salía con 100 % de asistencia* — un número perfectamente
creíble y falso, que es lo peor que puede llevar un informe. Una columna sin
ninguna marca sí se salta entera: es un día que no hubo clase, y contarlo le
pondría una falta a todos.

**El informe DICE cómo leyó cada hoja**, y esa explicación va dentro del
documento, no en un rincón de la pantalla: qué columna tomó por la fecha, cuál
por el nombre, qué marcas contó como presente. Una hoja mal leída da números
creíbles y equivocados; con la explicación al pie, el error se ve de una ojeada
y quien lo recibe puede confiar en el resto. Si no entiende una hoja, lo dice y
no inventa.

#### El contenido sale de los documentos, ordenado por clase

`js/reporte-textos.js` lee `.txt`, `.md` y `.docx` (el `.docx` con el mismo
lector de ZIP que `js/reporte-excel.js`, que los dos formatos son un ZIP con XML
adentro). Corta el documento en secciones cuando una línea **empieza** con una
fecha —"12/09/2026", "16 de septiembre de 2026"— y `armarExterno()` las empareja
con las clases de la asistencia. Ahí está la gracia: cada clase queda con su
asistencia **y** con lo que se trabajó ese día, en vez de dos listas sueltas que
hay que ir cruzando a mano.

**Lo que NO hace: resumir ni interpretar.** Eso pide un modelo de lenguaje, con
su credencial y su costo, y este sitio no usa ninguno. Lo que va en el informe
son las palabras de quien dio la clase, ordenadas y puestas donde corresponden,
no una versión inventada de ellas.

### Los dos generadores están escritos a mano

Ninguno usa librería, y no es capricho: las de PDF pesan entre 300 KB y 1 MB y
SheetJS otros 900 KB, para una página que se abre de vez en cuando. Con lo que
el navegador ya trae alcanza.

- **`js/reporte-pdf.js`.** Las fotos van con `DCTDecode`, que quiere decir
  "adentro va un JPEG tal cual", así que la página pasa toda imagen por un
  canvas y la saca en JPEG: el generador no tiene que saber decodificar PNG ni
  WebP. La marca de agua va con su canal alfa aparte (`/SMask`); sin el alfa,
  taparía el texto con un rectángulo blanco.
  **Ojo con el texto: WinAnsi NO es Latin-1.** El guion largo y las comillas
  tipográficas viven en los bytes 0x80-0x9F, que en Latin-1 no son nada.
  Tratarlo como Latin-1 a secas se comía el guion largo de "Jean Quesada — 1
  clase" y dejaba un hueco en el papel, sin dar ningún error.
- **`js/reporte-docx.js`.** Un .docx es un ZIP con XML; el ZIP va sin comprimir,
  que Word acepta igual. **`[Content_Types].xml` TIENE que ser la primera
  entrada**: con ese archivo al final, Word lo abría igual pero LibreOffice
  respondía "source file could not be loaded" y nada más — o sea que el fallo
  solo aparecía en la mitad de los programas. La marca de agua es una forma VML
  en el encabezado, con el `gain` y el `blacklevel` que usa el propio Word para
  lavarla y dejarla detrás del texto.
- **`js/reporte-excel.js`.** Un .xlsx también es un ZIP, y el navegador trae
  `DecompressionStream("deflate-raw")`. Lee la primera hoja, los textos
  compartidos y los estilos. Los estilos hacen falta porque **una fecha de Excel
  es un número**: "14/09/2026" se guarda como 46280, y sin convertirlo el
  informe para los jefes tendría una columna de números sin sentido. Lee también
  CSV, detectando solo si el separador es coma o punto y coma.

### El tercer archivo: el formato adaptado

Además del Word y el PDF sale un **HTML en formato adaptado**
(`js/reporte-accesible.js`), con el mismo contenido y del mismo documento
neutral. **No es un PDF, a propósito**: es la misma decisión que ya se tomó con
el material de estudio de los cursos. Un PDF con marca de agua, tablas dibujadas
y fotos es lo peor que se le puede dar a un lector de pantalla — el orden de
lectura se desordena, la marca de agua se lee en medio del texto y las tablas
salen como una hilera de números sueltos.

Sirve para dos personas distintas: quien usa lector de pantalla (sin ninguna
imagen, encabezados sin saltos de nivel, tablas con `<caption>` y `<th scope>`)
y quien ve poco y necesita agrandar (una sola columna, 1.15rem, interlínea 1.8,
alto contraste y su versión en oscuro). Va todo en un archivo, sin CSS ni
fuentes de fuera: se manda por correo y se abre sin internet.

- **Las fotos hay que describirlas, y por eso la página lo pide.** Al adjuntar
  una foto aparece el campo "Qué se ve en la foto": eso es a la vez el pie en el
  PDF y en el Word, y **lo único que va a oír quien no la puede ver**. Si no se
  llena, la versión adaptada lo dice con todas las letras en vez de callarlo —
  quien lee tiene derecho a saber que ahí hay algo que se está perdiendo.
- **El `<caption>` de cada tabla va siempre**, aunque repita el encabezado de
  arriba: quien usa lector de pantalla puede saltar de tabla en tabla sin pasar
  por los encabezados, y ahí el nombre es lo único que la identifica. Cuando
  repite, se esconde **a la vista** con `.solo-lectores` (posición absoluta y
  recorte), nunca con `display: none` ni `visibility: hidden`, que lo sacarían
  también del lector.

### Cómo se comprueba

Son dos piezas, porque un informe roto **no da error**: se descarga igual. Un
.docx con una etiqueta mal cerrada abre con el aviso de "contenido ilegible", un
PDF con la tabla de posiciones mal calculada no abre en ningún lado, y una marca
de agua que no se dibuja se ve perfecta en la vista previa y falta en el papel.

    node herramientas/verificar-reportes.js      # la página, en un navegador
    python3 herramientas/verificar-reportes.py <carpeta que dejó el anterior>

El de navegador comprueba quién entra y quién no, que la vista previa diga lo
que dicen los datos, que una foto y una hoja entren al informe, y que los dos
archivos se descarguen. **Comprueba además que la página SE VEA** —sin CSS
impreso como texto, sin `<style>` suelto, y que con el tema en oscuro arranque
en oscuro—: se clonó de `formularios.html`, y clonar una cabecera ya salió mal
una vez; `verificar-css.js` no lo vería porque todo esto solo existe después de
iniciar sesión.

El de Python abre los dos archivos con `pypdf` y `python-docx` y mira lo que no
se ve en pantalla: que abran, que la marca de agua esté en **todas** las páginas
(el error clásico es estamparla solo en la portada) y que las tildes hayan
llegado.

El formato adaptado se revisa con **las mismas reglas que el material de estudio**
(ver `herramientas/verificar-material.py`): que no dependa de ninguna imagen, que
declare el idioma, que lleve al autor y el aviso de uso, que tenga un solo `<h1>`
y no salte niveles, y que la foto esté contada en palabras.

- Los dobles del verificador van en el **contexto** y no en la página: esta
  página registra el service worker, y lo que pide el service worker no pasa por
  las rutas de una página. Con las rutas en la página, al recargar servía la
  copia cacheada del cliente de verdad y todo se caía con "sb is not defined".

### La transcripción corre en la máquina de quien hace el informe

Cada grabación tiene su botón "📝 Transcribir", y lo que sale entra al informe
en los tres formatos.

**El audio NO sale de la computadora, y esa es la decisión de fondo.** Un
servicio de transcripción sería más rápido y más exacto, pero estas son clases
con voces de menores: mandarlas a un servidor ajeno es sacar esos datos del
control de quien dio la clase, y eso pide el consentimiento de las familias (en
Costa Rica, Ley 8968). Corriendo el modelo ahí mismo, ese problema no existe —
y de paso no hace falta ninguna credencial ni cuesta nada.

- **Dos piezas, y la separación importa.** `js/reporte-transcribir.js`
  decodifica el audio en la página: cualquier formato que el navegador sepa
  abrir se convierte en muestras a 16 kHz en un canal, que es lo único que
  entiende Whisper (sirve igual para un `.mp4`: se decodifica la pista de audio
  y el video se ignora). `js/reporte-transcribir-worker.js` corre el modelo en
  un Web Worker, porque una clase de 40 minutos tarda minutos y en el hilo de
  la página dejaría el navegador congelado todo ese rato.
- Es un worker **de módulo**: hace `import()` para traer la librería, y en un
  worker clásico ese import no está en todos los navegadores.
- El modelo (`onnx-community/whisper-base`, unos 80 MB) se baja **una vez** y
  queda en la caché del navegador; después funciona hasta sin internet. Usa
  WebGPU cuando el navegador lo tiene y WASM cuando no.
- `no_repeat_ngram_size` no es un adorno: ante un silencio largo Whisper se
  pone a repetir la última frase hasta llenar el trozo, y en una clase hay
  silencios de sobra.
- **`_usarMotor()` es una costura de verdad, no un adorno de pruebas.** Es por
  donde entraría un servicio con credencial el día que se prefiera la velocidad
  a la privacidad, y es lo que permite comprobar toda la página sin bajar 80 MB
  en cada corrida.
- **`_headers` abrió `connect-src` a `cdn.jsdelivr.net`, `huggingface.co` y
  `*.hf.co`**, que es de donde sale el modelo. Es lo único que se les pide y es
  de bajada: el audio no va a ninguna parte. Si algún día se quita la función,
  se quitan esos tres.
- El informe avisa que la transcripción es automática y que se hizo en esa
  computadora: puede traer errores de nombres y de términos de ajedrez, y quien
  lo lee tiene que saberlo.

**Lo que la comprobación NO prueba es el modelo.** Se prueba que el audio se
decodifique bien (con un WAV de verdad, estéreo y a 44.100 Hz, que tiene que
salir a 16 kHz en mono), que el worker arranque y que su camino de error
conteste en vez de quedarse mudo, y que el texto llegue hasta el informe. Si
Whisper entiende bien el español es lo único que hay que mirar a mano, con una
grabación de verdad.

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

## El sitio se instala como app (PWA)

`manifest.json`, `sw.js`, `js/pwa.js` y los iconos de `img/app/` hacen que el
sitio se pueda instalar en el celular: queda un icono, abre a pantalla completa
sin barra del navegador y entra directo a la Academia (`start_url` es
`/clases.html`, que ya redirige al login sin sesión).

Es además **el cimiento de la app de Google Play**: la ruta elegida es una TWA
—la app *es* esta PWA corriendo en el motor de Chrome—, así que publicar en el
sitio actualiza la app sin pasar por la tienda. Lo que falta para eso son
trámites, no código, y está escrito en
`herramientas/plantillas/LEEME-app-android.md` con su `assetlinks.json` listo
para pegarle la huella de firma.

### El service worker es deliberadamente tonto

**La red va SIEMPRE primero y la caché es solo la red de seguridad para cuando
no hay señal.** Servir de la caché primero haría que el sitio arrancara más
rápido, y abriría la puerta a la peor falla que tiene este sitio: **HTML nuevo
con CSS viejo**. El CSS se compila y los archivos no llevan huella en el
nombre, así que una hoja vieja en caché deja la página sin la mitad de sus
clases — y eso **no da error**: simplemente se ve mal, que es exactamente
contra lo que existe `verificar-css.js`.

Lo que el service worker no toca nunca:

- nada que no sea de este dominio (Supabase, los CDN): ni lo mira;
- nada que no sea `GET`;
- `cursos/protegido/` y `cursos/recursos/` — guardar el contenido de la
  Academia o el material de uso docente sería dejarlos en el teléfono después
  de cerrar sesión;
- las respuestas que no vengan bien: un 404 no se guarda.

**`sw.js` y `manifest.json` llevan `Cache-Control: no-cache` en `_headers`.** Si
el navegador se queda con un `sw.js` viejo, la app deja de actualizarse y no hay
forma de avisarle a nadie: sigue sirviendo lo de antes sin dar ningún error.

### Los iconos no son el favicon

El favicon del sitio es un emoji, y un emoji no sirve de icono de app: cada
sistema lo dibuja distinto y las tiendas piden un PNG. `node
herramientas/pwa-iconos.js` dibuja el caballo del juego de piezas que el sitio
ya usa (leído de `js/finales-100.js` vía `lib/tablero-svg.js`), en ámbar sobre
el azul del encabezado. **Van dos de 512 y no uno**: Android recorta el icono en
círculo, así que el `maskable` lleva bastante más margen — sin eso le come las
orejas al caballo.

### La cabecera va en TODAS las páginas

`python3 herramientas/pwa-cabecera.py` pone el `manifest`, el `theme-color`, el
icono de iPhone y `js/pwa.js` en las 76 páginas del sitio, no solo en la
portada: la gente entra por donde sea —un enlace a un curso, lo que le mandaron
por WhatsApp— y el celular **solo ofrece instalar si la página por la que entró
lo declara**. Se puede correr todas las veces que se quiera; reconoce lo suyo
por las marcas `<!-- app: inicio -->`.

El aviso de instalación de `clases.html` (`#instalar-app`) **arranca oculto** y
`js/pwa.js` lo destapa solo cuando el navegador confirma que se puede instalar.
Un botón que no haría nada es peor que ningún botón.

**Se muestra UNA vez.** Antes salía en cada carga de la página, porque el
navegador dispara `beforeinstallprompt` cada vez: quien entraba a diario lo veía
a diario, y un cartel que se repite deja de leerse y empieza a molestar. Ahora
se apunta en `localStorage` (`app_instalar_v2`, con `visto` y `rechazado`) y solo
vuelve en un caso: **quien apretó "Ahora no" lo ve de nuevo una semana después**,
por si en ese momento le venía mal. Quien lo dejó pasar sin tocar nada tampoco lo
vuelve a ver — no contestar también es una respuesta. Al instalarse se borra todo,
por si algún día la desinstala.

**Y durante meses nada de eso se cumplió, porque el cartel no se escondía.** El
atributo `hidden` y la clase `flex` de Tailwind tienen la MISMA especificidad
(`[hidden]:where(:not([hidden=until-found]))` vale 0,1,0 — `:where` no suma
nada), y la utilidad va después en la hoja: gana `.flex`. El cartel lleva las
dos cosas, así que salía en cada carga y "Ahora no" no lo hacía desaparecer. Lo
arregla una línea en `css/styles.css` — `[hidden] { display: none !important; }`
—, que va ahí y no en la página porque el atributo tiene que significar lo mismo
en todo el sitio.

**Y no daba ningún error, ni siquiera en la comprobación**: `verificar-pwa.js`
preguntaba por `elemento.hidden`, la propiedad, que sí estaba puesta. Daba verde
sobre una página rota. Ahora pregunta por `getComputedStyle(...).display`, que
es lo que ve quien entra. **Al comprobar que algo se esconde, mirar la pantalla,
nunca el atributo.**

**Al tocar cualquiera de estas piezas, correr `node
herramientas/verificar-pwa.js`** (con el sitio en localhost:8777 y playwright).
Comprueba el manifest, que los iconos midan lo que prometen, que las 77 páginas
lo declaren, que el service worker tome el control y —lo que de verdad
importa— que **no guarde** `cursos/protegido/`, `cursos/recursos/` ni nada de
otro dominio, y que sin red una página caiga en `offline.html`.

### Avisos push: los manda el sitio, no la tienda

**Los avisos no son de la app, son del sitio**, y por eso funcionan igual en la
PWA instalada desde el navegador y dentro de la TWA. (Acá quedó escrito una vez
lo contrario —"una TWA no las trae"— y era falso: lo único que la TWA agrega es
que salgan con el nombre y el icono de la Academia en vez de con los de Chrome,
y eso se pide con la *delegación de notificaciones* de Bubblewrap; está en
`herramientas/plantillas/LEEME-app-android.md`.)

- **El permiso se pide SOLO al apretar el interruptor**, nunca al cargar la
  página. El navegador deja pedirlo **una vez por aparato**: si se pide de
  entrada y dicen que no, se perdió el único tiro y ya no hay forma de volver a
  preguntar desde el sitio. El interruptor vive en `configuracion.html` →
  "Avisos en el celular".
- **La fila es por aparato, no por persona.** `push_suscripciones` se escribe
  con `upsert ... onConflict: "endpoint"`: la compu y el celular se encienden
  por separado, y volver a suscribir el mismo aparato actualiza en vez de dejar
  dos filas apuntando al mismo lugar.
- **Apagar borra la fila ANTES de darse de baja.** Al revés, si el borrado
  falla queda un endpoint muerto al que el sitio le sigue mandando.
- **El navegador renueva la suscripción por su cuenta** y avisa al service
  worker (`pushsubscriptionchange`). Si no se vuelve a guardar, el aparato deja
  de recibir **en silencio** — nadie se entera hasta que alguien pregunta por
  qué no le llegan los avisos. `Notificaciones.atenderRenovaciones()` la vuelve
  a guardar sola, y cualquier página que cargue `js/notificaciones.js` la
  atiende: busca la sesión por su cuenta a propósito.
- **`js/notificaciones.js` va SIN `defer`.** Con `defer` corre después de
  parsear el HTML, o sea después del script del cuerpo que lo llama: la tarjeta
  de avisos salía vacía cuando la sesión resolvía rápido, sin dar ningún error.
  Misma carrera que `js/adaptive-mode.js`.

#### El cifrado se escribió a mano, y por eso se prueba

La Edge Function `notificar` implementa VAPID (RFC 8292) y el cifrado
`aes128gcm` (RFC 8291/8188) con Web Crypto, sin ninguna dependencia de npm:
`webpush.ts`. **Un mensaje mal cifrado no da error en ninguna parte** — el
servidor de push lo acepta, lo reenvía y el teléfono lo descarta callado.

- **El par VAPID lo genera la propia función la primera vez** y lo guarda en el
  Vault (`push_vapid_publica` / `push_vapid_privada`). No está escrito en
  ninguna migración, ni en el repositorio, ni se imprime nunca.
- **La tanda va firmada**, igual que los informes a la casa y los avisos de
  cobro: `verify_jwt` en `false` y un secreto del Vault
  (`tanda_push_secreto`) que la función vuelve a leer con la service role.
  Comprobado: con una firma inventada responde 401.
- **Quién puede avisarle a quién lo decide la RLS, no un `if`.** Para la acción
  `avisar`, la función lee `profiles` con el JWT de quien llama: solo se le
  manda a los ids que la RLS le devuelve. Un profesor no puede meterle una
  notificación en el teléfono a un alumno que no es suyo.
- Los avisos salen solos de dos disparadores: `class_sessions` (empezó la
  clase) y `desafios` (te retaron), los dos por `pg_net`.
- Un endpoint que responde 404 o 410 está muerto: se marca `activa = false` en
  vez de seguir intentándolo.

**Al tocar cualquiera de estas piezas, correr `node
herramientas/verificar-notificaciones.js`** (con el sitio en localhost:8777 y
playwright). Son dos partes, por dos peligros distintos: cifra un mensaje con
llaves de aparato de verdad y lo descifra de vuelta haciendo el papel del
navegador (y comprueba que dos envíos del mismo texto salgan distintos: si
salieran iguales, se estaría reusando la llave efímera); y abre
`configuracion.html` en un navegador de verdad para ver **cuándo** se pide el
permiso, qué se guarda y qué se borra. Esa segunda parte le pone un servicio de
push de mentira porque Chromium sin cabeza no tiene ninguno detrás — lo que se
comprueba ahí es qué hace la página, no que Chromium alcance a Google.

## El progreso vive en la cuenta, no en el aparato

`js/progreso-usuario.js` espeja en Supabase (tabla `training_state`, una fila por
clave y alumno) las mismas claves de progreso que las páginas guardan en
`localStorage`, para que quien entrena en la compu siga donde iba al abrir el
celular.

- Las páginas **no cambian su forma de guardar**: siguen usando `localStorage` y
  el módulo intercepta las escrituras. Para sumar una página nueva: cargar el
  script y `await ProgresoUsuario.init()` antes de leer el progreso y pintar.
- **Toda clave de progreso nueva hay que declararla** en `CLAVES` con su forma de
  fusión; si no, no se sincroniza.
- Al juntar dos aparatos no gana "el último que escribió": los conjuntos de
  ejercicios resueltos se unen, las mejores marcas se quedan con la mayor y lo
  que es "por dónde iba" se queda con lo más avanzado. Entrenar en dos aparatos
  suma, no pisa.
- Las preferencias del aparato (tema, modo adaptado) **no** se sincronizan a
  propósito: son de dónde se está mirando, no de quién mira.
- Sin sesión o sin red, la página funciona igual con su `localStorage` y sube al
  volver.

## Logros y racha de días

`logros.html` (tarjeta "🏅 Logros" en el panel, grupo "Jugar y competir", junto a
"Racha táctica") es la gamificación de Entrenamiento: una racha de días
consecutivos y un catálogo de medallas, de sencillas a avanzadas, calculadas
siempre a partir de `training_progress` — nunca de una tabla de "logros
desbloqueados", para que un logro no pueda quedar a medias por un guardado que
falló.

- **Un día cuenta si tiene 5 o más ejercicios de CUALQUIER tipo**, agrupados
  por fecha de **Costa Rica** (no UTC: quien entrena a las 11 p.m. no puede
  perder el día por el huso horario del servidor). Lo calcula
  `public.progreso_dias_y_racha(alumno uuid default auth.uid())`
  —`SECURITY INVOKER`, mismo criterio que las funciones de informes: quién
  puede pedir la racha de quién lo decide la RLS de `training_progress`, así
  que ya sirve tanto para que un alumno pida la suya como para que un
  profesor pida la de uno de sus alumnos el día que se necesite en Informes—
  con la técnica de siempre para islas de días consecutivos (gaps and
  islands: `dia - row_number()` agrupa un tramo sin huecos en un solo valor).
  Devuelve `dias_activos`, `racha_actual`, `racha_record`, `total_ejercicios`,
  `tipos_distintos`, `hoy_ejercicios`, `primer_dia` y `por_actividad` (un
  `jsonb` con cuántas filas hay de cada actividad).
- **La racha actual se corta si el último día activo no fue hoy ni ayer.**
  Con datos de mentira se comprobó el caso de siempre —una racha vieja que no
  sigue hasta hoy no cuenta como "actual" pero sí sigue contando para el
  récord— y el caso vacío (nadie ha practicado nunca) sin que la función
  truene.
- **Los logros usan `racha_record`, no `racha_actual`.** Un logro ya ganado no
  se puede perder porque un día se rompió la racha — "lo hecho, hecho está",
  el mismo criterio que ya usa `js/progreso-usuario.js` para los ejercicios
  resueltos.
- **El catálogo (`js/logros-catalogo.js`) es puro**: cada logro es
  `{ id, categoria, nivel, meta, valor(stats) }`, y `conEstado(stats)` no
  guarda nada — recalcula conseguido/progreso cada vez a partir de los
  números de la función de arriba. Van de sencillos a avanzados en cuatro
  niveles (bronce, plata, oro, diamante): racha de días, ejercicios totales,
  variedad de tipos practicados, días de práctica acumulados (no hace falta
  que sean seguidos) y metas por cada tipo de ejercicio.
- **`ACTIVIDADES_ALCANZABLES` es 13, no 14.** El CHECK de `training_progress`
  tiene 14 actividades, pero `desafios` está declarada sin ningún uso real
  (`entreno/desafios.html` registra como `'practicar'`): pedir las 14 para el
  logro "Las probaste todas" habría dejado un logro que nadie puede conseguir
  nunca, y eso no da ningún error —se queda gris para siempre sin que nadie
  sepa por qué—.
- **Cuatro actividades se sumaron al CHECK para que "cualquier tipo" sea
  cierto de verdad**: `aperturas`, `confites`, `ilumina` y `visualizacion`
  vivían solo en `localStorage` (con un comentario explícito en
  `entreno/aperturas.html` de por qué no escribían en `training_progress`) y
  no contaban para nada del lado del servidor. Ahora sus páginas cargan
  `js/entreno-progress.js` y llaman a `EntrenoProgress.log(...)` al terminar
  una ronda, una línea, un nivel o un ejercicio — mismo patrón que ya usaban
  Mates, 4×4, Aprende, etc. `finales100` (Los 100 finales) y el `slug` de
  `js/curso-partidas.js` siguen sin poder escribir en `training_progress` (no
  están en el CHECK): **no** se tocaron acá, porque emparejarlos con
  `curso`/`leccion` como espera `cursos_temas` de `informes_resumen_alumnos()`
  es un cambio aparte, no de esta tanda.
- **`logros.html` exige sesión** (mismo patrón que `entreno/estudio.html`:
  gate → `requireLoginThenGate()` → `unlock()`), porque la racha es de la
  cuenta, no del aparato. Pide `progreso_dias_y_racha` por RPC — nunca baja
  `training_progress` entera — y pinta la racha, la barra de "hoy" (cuántos
  de los 5 ya lleva) y la grilla de medallas agrupada por categoría, con el
  conteo conseguidas/total en cada encabezado.
- `clases.html` suma una tarjeta chica de racha (`loadRachaWidget()`, junto a
  la de "Racha táctica — récord de la clase") que solo pinta un resumen de una
  línea — la cuenta la sigue haciendo la misma función.
- **Al tocar cualquiera de estas piezas, correr `node
  herramientas/verificar-logros.js`** (con el sitio en localhost:8777,
  playwright y `npm install chess.js@0.10.3`). Con un resultado de mentira ya
  calculado (no vuelve a sumar días: eso ya se probó con SQL de verdad,
  impersonando el rol del alumno, contra el proyecto de Supabase) comprueba
  que la racha, la barra de "hoy" y cada medalla salgan EXACTAMENTE como las
  calcula `js/logros-catalogo.js` para esos mismos números —comparando contra
  el catálogo cargado de verdad en el navegador, no reimplementando sus
  metas—, que sin sesión mande a iniciar sesión, que un RPC vacío se vea en
  cero sin romper la página, y que las cuatro páginas nuevas (Confites,
  Ilumina el tablero, Aperturas y celadas, Visualización) manden de verdad su
  fila a `training_progress` al terminar un ejercicio.

## El hub de Entrenamiento y sus tres grupos

`entreno/index.html` reparte los ocho accesos en **Fundamentos** (Mates,
Aprender, Coordenadas, Desafíos), **Practicar** (Ejercicios por tema, Practicar)
y **Entreno** (Aperturas y celadas, 4×4).

- **Cada acceso es un encabezado de verdad (`<h3>`), no un `<span>`**, y eso es
  el punto, no un detalle de maqueta: quien usa lector de pantalla se mueve
  saltando de encabezado en encabezado. Con el nombre metido en un `<span>`
  había que tabular por los ocho enlaces para llegar al último; con un `<h3>`
  por acceso dentro del `<h2>` de su grupo, Entrenamiento se recorre entero de
  un salto por tarjeta. Los niveles van `h1 → h2 → h3` **sin saltarse
  ninguno**.
- **Un solo enlace por tarjeta**, con el título como enlace y su `::after`
  estirando el área de clic sobre toda la tarjeta — el mismo patrón de
  `cursos.html`. Con dos enlaces al mismo destino, el lector de pantalla lo
  anuncia dos veces.

### La táctica se mudó dentro de Ejercicios por tema

`entreno/tactica.html` era una segunda página resolviendo exactamente lo mismo
que `entreno/temas.html`: su propio tablero, su propia racha y su propia lista
de resueltos. El mismo ejercicio se podía resolver en las dos y contaba dos
veces. Ahora sus 148 ejercicios son **un grupo más del selector de temas**
("Táctica de ataque", con sus cinco categorías), y `tactica.html` solo manda a
`temas.html` — la dirección está en favoritos de quien la usaba y un 404 no le
dice a nadie a dónde ir.

- **El traslado lo hace `entreno/data/sumar_tactica.py`, no una edición a mano
  de `temas.json`.** Ese archivo lo GENERA `construir_temas.py` desde Supabase,
  así que un grupo escrito a mano se perdería en la siguiente corrida sin que
  nada fallara. Por eso `construir_temas.py` llama a `sumar()` al final: una
  sola implementación, dos puertas de entrada. Se puede correr todas las veces
  que se quiera (si el grupo ya está, lo reemplaza).
- **Estos ejercicios no traen `rating`**: son de la casa, no de Lichess. La
  página tiene que aguantar que falte, y no lo hacía — escribía "Dificultad
  undefined" debajo de cada tablero, que no da ningún error, solo se ve mal.
- **Lo que ya llevaba resuelto cada quien se hereda.** `heredarTactica()` funde
  `entreno_tactica_solved` dentro de `entreno_temas_solved` al cargar. Los ids
  no se pisan (los de táctica son texto, `ultima-linea-001`; los de Lichess son
  números) y como se unen y no se reemplazan, correrlo mil veces da lo mismo.
  Va **después** de `ProgresoUsuario.init()`, o sea sobre la lista ya bajada de
  la cuenta.
- **Informes sigue contando Táctica aparte.** Si todo se apuntara como `temas`,
  esa columna se habría quedado congelada en el número del día de la mudanza —
  y eso no da ningún error: el profesor ve un número que ya no sube y no sabe
  por qué. Así que `EntrenoProgress.log()` elige la actividad según el tema.
  **Qué temas son de táctica sale del propio `temas.json`** (`temasDeTactica()`
  lee el grupo), no de una lista copiada en la página: con la lista a mano,
  agregarle una categoría al grupo la dejaría contando como "temas" sin que
  nada fallara.
- `GROUP_ICON` de `temas.html` necesita una entrada por grupo: sin ella el
  grupo nuevo se pinta con un punto pelado.

**Al tocar el hub, `temas.html` o el traslado, correr `node
herramientas/verificar-entreno.js`** (con el sitio en localhost:8777,
playwright y `npm install chess.js@0.10.3`). Cuenta los 148 ejercicios uno por
uno contra `tactica.json` —uno que se pierda por el camino no da ningún error,
el grupo simplemente tiene menos— y comprueba con chess.js que cada solución
siga siendo jugable y que el mate prometido sea mate. Después, en un navegador:
los tres grupos con lo suyo, que cada acceso sea un encabezado, que no se salte
ningún nivel, que el clic en la esquina de la tarjeta siga abriendo su enlace,
que `tactica.html` redirija, que el progreso se herede y que un ejercicio de
táctica se apunte como `tactica`.

## Aperturas y celadas: memorizar jugando, con repaso espaciado

`entreno/aperturas.html` es un banco de 40 líneas —12 celadas y 28 aperturas—
que el alumno memoriza **jugándolas en el tablero**: el entrenador mueve por el
rival y él tiene que dar todas las jugadas de su color, de memoria. Al terminar,
la línea se programa para más adelante.

- **El banco vive en `js/aperturas-lineas.js`**, en notación inglesa porque es la
  que entiende chess.js; la página la traduce (C, A, T, D, R) antes de
  enseñarla. **El `id` de cada línea no se cambia nunca**: es la clave con la que
  queda guardado el avance de cada alumno.
- **`js/repaso-espaciado.js` es SM-2 recortado**: facilidad de 1.3 a 3.0,
  intervalos de 1 y 3 días fijos al principio y de ahí multiplicando, con tope
  de medio año. No sabe nada de ajedrez —es `{ id → ficha }`—, así que sirve
  para cualquier cosa que se repase.
- **Tres notas, no cinco.** Cinco grados obligan a pensar cuánto de bien te
  salió, que es justo lo que no debe ocupar la cabeza mientras se estudia.
- **La nota la pone la página, no el alumno.** Los SRS suelen preguntar "¿qué
  tal te salió?" y con chicos eso no mide nada: el que quiere terminar rápido
  aprieta "bien" siempre. Acá sale de lo que de verdad pasó —cuántas veces se
  equivocó y cuántas pidió ver la jugada—, que no se puede maquillar.
- **La coronación se elige**, no se asume dama: la trampa de Lasker en la Albin
  solo funciona coronando caballo, y ese es el punto de la línea.
- El progreso son las claves `aperturas_srs_v1` (fusión `srsPorLinea`) y
  `aperturas_vistas_v1`, declaradas en `CLAVES` de `js/progreso-usuario.js`. La
  fusión nueva **no deja ganar a un aparato entero**: se queda con la ficha de
  CADA línea que se repasó más tarde, así que estudiar en la compu y en el
  celular suma. No escribe en `training_progress` —esa tabla tiene el CHECK de
  actividades y esto no es una de ellas—; el tiempo sí se registra con
  `js/tiempo-plataforma.js data-activity="aperturas"`.
- **Al tocar el banco o el SRS, correr `node herramientas/verificar-aperturas.js`**
  (necesita `npm install chess.js@0.10.3`). Comprueba con chess.js que **cada
  jugada exista de verdad en su posición** —466 jugadas—, que el mate prometido
  sea mate, que los ids no se repitan, que al alumno le toquen al menos tres
  jugadas, y de paso corre las pruebas del algoritmo de repaso. Una jugada mal
  escrita no da error en pantalla: el alumno no puede terminar la línea nunca y
  no entiende por qué.
- **Al tocar la página, correr `node herramientas/verificar-aperturas-pagina.js`**
  (con el sitio en localhost:8777 y playwright). Juega líneas enteras a punta de
  clics en un navegador de verdad, incluida la de la coronación, y comprueba que
  una jugada legal que no es la de la línea se rechace, que la pista baje la
  nota y que el avance quede guardado.
- **Esa comprobación mira además que la página se vea**, no solo que funcione,
  porque la primera versión salió rota de las dos maneras que se pueden romper
  al clonar la cabecera de otra página del sitio:
  - se coló el `</style>` de la página original, la hoja se cerró antes de
    tiempo y el navegador **imprimió el resto del CSS como texto** arriba de
    todo;
  - se quedó fuera el script del `<head>` que aplica el tema, y la página salía
    **siempre clara** aunque el resto del sitio estuviera en oscuro.
  Ninguna de las dos daba error: la página "funcionaba". Y `verificar-css.js`
  tampoco las veía, porque la lista de líneas solo existe después de iniciar
  sesión y él abre las páginas sin cuenta. Por eso ahora se comprueba que no
  haya CSS impreso como texto, que haya un solo `<style>`, que las clases
  propias pinten algo de verdad y que con el tema oscuro el fondo sea oscuro.
  **Al clonar la cabecera de otra página, mirar la pantalla, no solo el DOM.**

## Estudio: una ficha por idea, con su mapa y su posición

`entreno/estudio.html` (tarjeta **"📚 Estudio"** en `clases.html` → grupo
"Aprender") son 56 fichas de estudio: 12 aperturas, 12 defensas, 16 temas
tácticos y 16 conceptos. Cada una es **una sola pantalla**: la idea principal
arriba, cuatro bloques alrededor de un nodo con la pieza, y abajo la posición
que lo explica, recorrible jugada por jugada.

No es otra forma de `entreno/aperturas.html`, y por eso son dos páginas y no
una: Aperturas y celadas se **juega** de memoria con repaso espaciado, y una
ficha se **mira de un vistazo** — es lo que uno repasa cinco minutos antes de
jugar, o imprime y pega en el cuaderno. Las dos comparten el banco de líneas,
así que no hay dos versiones de la misma apertura.

### Antes esto eran DOS páginas, y eran la misma

Durante un tiempo convivieron `entreno/fichas.html` (las 56) y
`entreno/estudio.html` (las 24 de apertura y defensa, que son un subconjunto
exacto de las otras). Mismo banco, mismo mapa, mismo tablero, mismo botón de
practicar: **la misma página dos veces**, con dos listas que había que
mantener parejas y dos verificadores que comprobaban lo mismo. Se fusionaron
en Estudio y Fichas se borró.

- **La dirección vieja no murió: redirige.** `_redirects` manda
  `/entreno/fichas.html` a `/entreno/estudio.html` con un 301, y Cloudflare
  conserva la parte de `?ficha=<id>` — esos enlaces se compartían por
  WhatsApp, y un 404 no le dice a nadie a dónde ir. Es la misma decisión que
  se tomó con `entreno/tactica.html` al mudarse dentro de Ejercicios por tema.
- **La tarjeta del panel quedó en una sola.** Dos tarjetas que llevan a lo
  mismo con nombres distintos son el error que el panel ya cometió con
  "Torneos"; en Tareas (`js/material-plataforma.js`) pasa igual: un solo
  material asignable, "Estudio".
- **Sin pestañas, con un `<h2>` por categoría.** Las cuatro secciones van una
  debajo de otra: se salta de grupo en grupo con lector de pantalla y nadie
  tiene que elegir una pestaña antes de poder ver nada.
- Con 56 fichas el **buscador** sí hace falta, y mira las cuatro categorías a
  la vez, sin tildes ("peon pasado" encuentra todas las que hablan de él).
  Cuando hay búsqueda, lo que sobrevive se sigue pintando dentro de su grupo:
  el árbol de encabezados no cambia según lo que se escriba.

### Cómo es una ficha

- **Los cinco bloques están SIEMPRE y en el mismo lugar de la pantalla.** Sus
  títulos salen de `TITULOS[categoria]` (una apertura tiene Planes, Ideas
  tácticas, Medio juego y Final; un tema táctico tiene Cómo se reconoce, Quién
  la hace, Errores frecuentes y Cómo practicarla), así que dos fichas distintas
  se leen igual y el ojo ya sabe dónde buscar cada cosa. El verificador falla si
  una ficha trae tres bloques o seis.
- **El color no dice nada solo.** Cada bloque tiene el suyo —y las líneas que
  salen del nodo, también— pero el título va escrito y la categoría va en una
  etiqueta de texto: es la misma regla de los gráficos de Informes. Los
  renglones usan `--text-cuerpo` y no el gris de los textos secundarios, que
  contra el blanco de la caja se queda justo en el borde de 4.5.
- **Las líneas del mapa son un SVG con `preserveAspectRatio="none"`, y por eso
  cada una lleva `vector-effect="non-scaling-stroke"`.** Ese atributo **no se
  hereda del `<g>`**: puesto en el grupo, el navegador escala el grosor junto
  con el viewBox y las cinco líneas salen como cuñas de 15 px. Se ve raro pero
  no falla nada, así que solo se descubre mirando la pantalla.
- **El mapa y el tablero los pinta `js/ficha-render.js`**, que se sacó afuera
  cuando esto eran dos páginas. Quedó igual: es la pieza que sabe dibujar una
  ficha, y la página solo decide cuáles muestra.
- **La posición no se inventa nunca**, y sale de **una sola** de estas tres
  fuentes: `lineaId` (una línea de `js/aperturas-lineas.js` — las jugadas NO se
  copian: se leen de ahí, que es donde viven), `jugadas` propias desde el
  principio, o una `fen` de estudio con su `linea`. El verificador falla si una
  ficha trae dos.
### El motivo que promete la ficha se comprueba con el motor, no a ojo

Cada ficha declara en `comprueba` qué tiene que cumplirse en el tablero —que la
jugada dé jaque, que la línea termine en mate, que la pieza clavada no tenga
ninguna jugada legal, que el peón esté pasado de verdad, que la columna no tenga
un solo peón, que los dos alfiles sean de distinto color de casilla—, y
`herramientas/verificar-fichas.js` lo juega con chess.js. Es el mismo criterio
del material de los cursos y del banco del diagnóstico, y encontró dos errores
que en pantalla no se veían:

- El jaque descubierto ganaba una dama con `Cd7+`… solo que **el rey se comía el
  caballo**: estaba sin defender. El caballo se mudó a g6, donde no lo alcanza
  nadie.
- La clavada de la española **no es una clavada** mientras el peón negro siga en
  d7: la diagonal b5-e8 está tapada por él. La ficha ahora muestra la posición
  después de `3…d6`, y ese mismo hallazgo quedó escrito como error frecuente
  dentro de la ficha.

La comprobación fuerte es `ganaSiempre`: no alcanza con que la pieza **ataque**
dos cosas, se juegan **todas** las respuestas legales del rival y ninguna puede
salvar lo prometido. Una horquilla que se para con una jugada no es una
horquilla, y en el diagrama se ve igual de bien.

**Cuando una ficha dice «el tema X», ese X existe.** Los nombres salen de
`entreno/data/temas.json` —el mismo archivo que arma Ejercicios por tema— y el
verificador los compara contra él. Así se corrigieron cuatro: el tema de la
horquilla se llama ahí **«Pincho»**, el del descubierto **«Ataque a la
descubierta»** y el de la enfilada, **«Ataque por rayos X»**. Mandar a un alumno
a un tema que no está no da ningún error: lo busca, no lo encuentra y se queda
pensando que se equivocó él.

### La segunda tanda: de 28 a 56 fichas

Se duplicaron las cuatro pestañas (12 aperturas, 12 defensas, 16 temas tácticos
y 16 conceptos) sin tocar ni una de las 28 primeras. Lo que dejó escrito:

- **Tres aperturas nuevas entraron ANTES al banco de líneas.** La vienesa, el
  gambito Evans y el ataque indio de rey no estaban en
  `js/aperturas-lineas.js`, así que sus fichas nacieron con `jugadas` propias
  — y eso las dejaba sin el botón de practicar, que solo sale cuando la línea
  existe allá. En vez de dejar el botón afuera, las tres líneas se sumaron al
  banco (40 líneas ahora) y las fichas las leen de ahí: una sola fuente, y de
  paso tres líneas más para memorizar jugando. **Toda ficha de apertura o
  defensa tiene su `lineaId`**; las de táctica y conceptos pueden partir de
  una FEN de estudio.
- **El verificador volvió a atajar tres posiciones mal armadas**, las tres
  invisibles en pantalla:
  - el jaque doble salía con `Ch6+`… y desde g5 **un caballo no llega a h6**;
  - en la pieza atrapada, el alfil se comía el peón que venía a encerrarlo,
    porque ese peón no estaba defendido;
  - y el zugzwang no era zugzwang: al rey le quedaba una casilla de espera,
    así que mover no le costaba nada.
- **Los predicados nuevos de `comprueba`** siguen la misma idea —el motivo se
  juega, no se declara—: `materialGanado` (la combinación TERMINA con el
  material prometido), `defiendeDos` (la sobrecarga: esa pieza defiende de
  verdad las dos casillas), `dobleJaque` (al rival no le queda otra que mover
  el rey), `bateria`, `atrapada` (todas sus salidas la dejan donde la comen),
  `repeticion` (el perpetuo repite tres veces), `zugzwang` (no está en jaque,
  el rival no tiene ninguna captura y CUALQUIER jugada le regala una),
  `oposicion`, `torreDetras`, `cuadrado` (la cuenta de la regla, con el salto
  doble incluido), `alfilMalo`, `aislado`, `ahogado` y `peonesEn`.
- De paso, `herramientas/verificar-aperturas-pagina.js` tenía su doble de
  Supabase sin `insert()`: desde que esa página apunta la línea terminada en
  `training_progress`, terminar una línea tiraba un TypeError en la consola y
  el verificador lo contaba como fallo. Era el doble el que estaba incompleto,
  no la página.


### Lo demás que hace la página

- **Cada ficha tiene su enlace** (`estudio.html?ficha=<id>`), para mandarla por
  WhatsApp. Un id que ya no existe cae a la lista, no a una ficha en blanco.
- **Se imprime.** Una hoja de estilos de impresión deja solo la ficha —sin
  encabezado, sin lista, sin buscador, sin botones— y acomoda el mapa a dos
  columnas.
- **El tablero es decorativo** (`aria-hidden`): el pie cuenta qué se ve y la
  posición va contada pieza por pieza con `BlindNotation.positionSentence()`,
  que es la única tabla de nombres y plurales del sitio — escribirla otra vez
  acá sería la quinta copia. En Modo Adaptado esa lectura se agranda, y lo
  decide el CSS, no el JavaScript.
- El botón de practicar **solo sale cuando esa línea existe** en el banco de
  `entreno/aperturas.html`, y dice de qué color se juega: las fichas de
  apertura y defensa siempre la tienen; las de táctica y conceptos pueden
  partir de una FEN de estudio y ahí el botón no aparece. La misma línea se
  practica de un lado solo (el gambito de dama está en el banco desde el lado
  del negro, aunque la ficha sea de aperturas).
- **No lleva marca de progreso ni clave en `js/progreso-usuario.js` a
  propósito.** No hay nada que sincronizar entre aparatos porque no hay ningún
  "resuelto" que guardar: la memorización de verdad, con su repaso espaciado,
  vive en `entreno/aperturas.html`. El tiempo sí se registra, como en toda
  página de Entreno: `js/tiempo-plataforma.js data-activity="estudio"`.
- Se puede asignar desde Tareas: está en `js/material-plataforma.js`.

**Al tocar el banco o la página, correr las dos comprobaciones**:

    node herramientas/verificar-fichas.js     # el banco, con chess.js
    node herramientas/verificar-estudio.js    # la página, en un navegador

La primera no necesita más que `npm install chess.js@0.10.3`. La segunda pide
además playwright y el sitio en localhost:8777, y existe porque esta página está
detrás del login: `verificar-css.js` abre las páginas sin cuenta y no ve nada de
esto. Comprueba que estén las cuatro secciones con sus fichas y en orden, que
cada bloque traiga SUS renglones y no los del de al lado, que el tablero dibuje
**pieza por pieza** la posición que toca en cada jugada (contra chess.js, no
contra lo que diga la página), que el buscador mire las cuatro categorías, que
el enlace `?ficha=` abra la ficha y que un id inventado caiga a la lista, que
**la regla de `_redirects` siga mandando la dirección vieja de Fichas acá**, que
al imprimir salga la ficha y no la lista, y que la página **se vea**: sin CSS
impreso como texto, con una sola hoja, y en oscuro cuando el tema está en
oscuro. Absorbió todo lo que comprobaba `verificar-fichas-pagina.js`, que se fue
con la página.

- De paso se le quitó la fecha fija a `herramientas/verificar-panel.js`: sus
  clases de mentira colgaban de un día escrito a mano y el filtro de "últimos 3
  meses" se mide contra hoy, así que la prueba se iba pudriendo sola —fallaba
  por el almanaque, no por el código—. Ahora cuelgan de hoy y los meses
  esperados se calculan de las mismas filas.


## El Evaluador de precisión posicional: elegir el plan, no la táctica

`entreno/precision-posicional.html` (tarjeta **"🧭 Precisión posicional"** en
el grupo "Practicar" del hub de Entrenamiento) es un banco de 24 posiciones
—3 por cada una de 8 áreas— con una pregunta de opción múltiple por posición.
**Ninguna tiene una jugada que gane material o dé mate de inmediato**: lo que
se pide es el plan correcto a largo plazo — mejorar la pieza peor colocada,
abrir o disputar una columna o diagonal, decidir qué cambiar y qué conservar,
fijar y atacar una debilidad, sostener una ventaja de espacio, elegir el
flanco de ataque, decidir sobre la estructura de peones, o transformar una
ventaja rumbo al final.

Es la primera herramienta del sitio que entrena juicio posicional puro, y por
eso se parece y se diferencia del resto de los bancos a la vez:

- **El banco (`js/precision-posicional-items.js`) y el criterio
  (`js/precision-posicional-criterio.js`) van separados**, la misma partición
  que ya usan `js/diagnostico-items.js` + `js/plan-entrenamiento.js` y
  `js/arbitraje-items.js` + `js/arbitraje-nivel.js`: el criterio (qué mide
  cada área, qué repasar) se puede ajustar sin tocar las 24 posiciones, y al
  revés.
- **Sin cronómetro, a propósito.** Un ejercicio de táctica se cronometra
  porque la solución tiene que verse rápido o no vale; acá es justo lo
  contrario — la idea completa del entrenamiento es dar el tiempo que haga
  falta para pensar el plan, no premiar a quien contesta rápido. La página no
  trae ningún reloj, ni de cuenta regresiva ni de cuenta corrida.
- **Ninguna posición se presenta como si fuera de una partida real.** Son
  posiciones ilustrativas, escritas a mano para mostrar con claridad un solo
  motivo estratégico clásico — el mismo criterio de cualquier manual de
  estrategia: un diagrama instructivo no necesita salir de una partida
  concreta. Lo que este repositorio no puede repetir es el error que ya
  cometió una vez con una «Lucena» que no era Lucena: prometer un resultado
  que el motor no confirma. Acá no hay ningún resultado que prometer —es un
  juicio posicional, no una combinación forzada—, así que el campo `fuente`
  de cada ítem describe el TIPO de estructura ("peón aislado de dama",
  "estructura Carlsbad") y **nunca** atribuye la posición a una partida ni a
  un jugador: inventar esa cita sería peor que decir con todas las letras que
  la posición es ilustrativa.
- **No hay ningún "nivel" ni título que estimar**, al revés que el
  diagnóstico o el examen de arbitraje. No existe un "elo posicional" que se
  pueda medir con 24 preguntas; lo único honesto que `resumir()` calcula es
  cuánto se acertó, por área, y un veredicto en palabras —nunca un número que
  suene más preciso de lo que en realidad es.
- **Dos tandas, no una.** "Ronda corta" (`PrecisionPosicionalPrueba.armar(1)`)
  sortea una posición de cada una de las 8 áreas; "Banco completo"
  (`armar()`, sin argumentos) trae las 24. Las dos se barajan, así que dos
  rondas seguidas no salen en el mismo orden.
- **El resultado se guarda en `training_state`** (claves
  `precision_posicional_resultado_v1` / `_historial_v1`), exactamente como el
  examen de arbitraje: esa tabla ya tiene su RLS (cada quien ve lo suyo) y no
  hace falta ninguna tabla nueva. **No escribe en `training_progress`**, la
  misma decisión que ya tomó Confites: esa tabla tiene el CHECK de
  actividades permitidas y sumar una nueva ahí es una migración aparte que
  esta tanda no pidió. El tiempo sí se registra, como en toda página de
  Entreno: `js/tiempo-plataforma.js data-activity="precision-posicional"`, que
  no tiene ningún CHECK.
- **El cuadro de comandos (`js/cuadro-comandos.js`) reutiliza `comandos.
  posicion(juego)`** para la lectura de la posición en Modo Adaptado, en vez
  de escribirla de nuevo: acá SÍ hay una partida de chess.js detrás de cada
  pregunta —cosa que el examen de arbitraje no tiene—, así que la misma
  lectura que ya usan Mates, 4×4 y el resto sale gratis. El tablero en sí es
  **decorativo** (`aria-hidden`, dibujado con `window.ExampleBoard.render()`,
  el mismo diagrama de los artículos y de las fichas de Estudio): quien usa
  lector de pantalla no necesita verlo, lo lee.
- **La corrección llega al final, posición por posición**, como el examen de
  arbitraje y no como Mates o 4×4 (que corrigen al toque): acá se está
  evaluando un criterio, no entrenando reflejos, así que ver la respuesta
  antes de terminar la ronda entera invalidaría las preguntas que faltan.

**Al tocar el banco, el criterio o la página, correr las dos comprobaciones**:

    node herramientas/verificar-precision-posicional.js               # el banco, con chess.js
    node herramientas/verificar-precision-posicional-pagina.js         # la página, en un navegador (sitio en localhost:8777)

La primera no necesita navegador ni red (`npm install chess.js@0.10.3`) y
comprueba lo único que SÍ se puede verificar de un banco sin táctica: que
**ninguna jugada legal de ninguna posición dé jaque mate** —si la hubiera, la
premisa entera ("acá no hay táctica inmediata, hay que pensar el plan") se
caería—, que la FEN de cada ítem sea legal y el turno declarado coincida, que
la posición no esté ya en jaque, que las cuatro opciones no se delaten por el
largo, que `fuente` diga siempre "Posición ilustrativa" y nunca invente una
cita, y que el banco alcance para las 8 áreas del criterio (y al revés, que el
criterio no describa un área sin ninguna posición).

La segunda pide playwright y el sitio en `localhost:8777`, y existe porque
esta página está detrás del login: `verificar-css.js` abre las páginas sin
cuenta y no ve nada de esto. Comprueba que sin sesión mande a `login.html`,
que la ronda corta arranque con 8 posiciones y el banco completo con 24, que
el tablero dibuje de verdad 64 casillas con piezas (no un tablero vacío), que
"Siguiente" avance y "Anterior" conserve la respuesta ya marcada, que el
resultado muestre el marcador y las 8 filas por área, y que terminar la ronda
guarde de verdad en `training_state` **a nombre del alumno de la sesión** —la
misma trampa que otros verificadores del sitio ya documentaron: anotar la
escritura en el resolver y no en el método, para no dar por buena una que
fuera a la fila que no era.


## Diagnóstico y plan de entrenamiento

`entreno/diagnostico.html` es la asignación de nivel (ficha "Asignaciones" en
Aprende). El banco de ítems está en `js/diagnostico-items.js`, verificado con
chess.js. El criterio pedagógico —áreas, nivel estimado y plan de 4 semanas—
está en `js/plan-entrenamiento.js` y lo comparten el alumno (al terminar) e
`informes.html` (informe del profesor). Si se tocan las posiciones, hay que
volver a verificarlas con chess.js: cada ítem dice en `prueba` qué debe cumplir.

- **El banco es más grande que la prueba**: cada diagnóstico sortea sus
  preguntas con `DiagnosticoPrueba.armar()` (al final de
  `js/diagnostico-items.js`). Lo que nunca cambia es la forma: 7 ítems por
  área, el mismo reparto de dificultad y 180 puntos, para que dos diagnósticos
  del mismo alumno se puedan comparar aunque las preguntas hayan sido otras.
  Los ids de la prueba quedan guardados en el estado (para retomarla) y en el
  resultado (`detalle.items`, para que la corrección repase esas preguntas y no
  otras).
- **El nivel sale de los escalones de dificultad, no del porcentaje.** El
  `peso` de cada ítem (1 a 5) es su escalón, y cada prueba lleva 1+2+2+1+1 por
  área (cuota en `FORMA`): ocho preguntas de cada escalón difícil en la prueba
  entera. El nivel estimado es **el escalón más alto superado** —60% de
  aciertos ahí y el promedio de los anteriores también en 60%—, con un tope: si
  un área quedó por debajo del 30% no pasa de Avanzado, y por debajo del 50% no
  pasa de Avanzado (nadie con los finales en blanco es «muy avanzado»). Está en
  `nivelPorEscalones()` de `js/plan-entrenamiento.js`.
  Por qué: con el porcentaje a secas, un jugador de 1400 y uno de 2300 sacaron
  los dos "Experto" (93% y 99%), porque el techo de la prueba eran preguntas de
  club. Al agregar ítems hay que respetar el `peso` — y si es de escalón 4 o 5,
  que sea difícil de verdad y **sin opciones falsas absurdas**, o el techo se
  vuelve a caer.
- **Ninguna opción puede delatarse por el largo.** La respuesta correcta era
  la más larga en 91 de 96 ítems: se aprobaba media prueba eligiendo la más
  larga, sin saber ajedrez. Ahora las cuatro opciones de cada ítem miden
  prácticamente lo mismo (la correcta nunca gana por más de 2 caracteres) y la
  explicación va en `explica`, no dentro de la opción.
- **Los ítems de tablero se responden con UNA jugada**, incluidos los mates en
  dos o en tres: se pide la jugada clave, no la secuencia. La página lo dice
  antes de mover ("se responde con una sola jugada") y al mover ("no hace falta
  jugar más"), y el enunciado de esos ítems lo repite; si no, el alumno juega
  la primera, no pasa nada y se queda sin saber si tiene que seguir.
- `herramientas/verificar-diagnostico.js` comprueba todo esto de una corrida
  (ids repetidos, posiciones ilegales, soluciones que no son legales, los mates
  forzados en la cantidad exacta de jugadas y con clave única, el largo de las
  opciones y que el banco alcance para la cuota). Necesita chess.js instalado
  aparte: `npm install chess.js@0.10.3 && node
  herramientas/verificar-diagnostico.js`. **Al tocar el banco, correrlo.**
- Los resultados viejos (sin `detalle.dificultad`) siguen calificándose por
  porcentaje con los umbrales de entonces: se midieron con otra prueba y no se
  vuelven a etiquetar. Una prueba empezada con una versión anterior no se
  puede continuar (`VERSION` en `entreno/diagnostico.html`): se descarta con un
  aviso, porque mezclaría dos mediciones distintas.

- Cada pregunta ofrece **"🤔 No lo sé todavía"**, siempre al final y con otra
  pinta. Vale cero puntos igual que fallar, pero se guarda aparte (`nosabe` por
  ítem y por área): para el profesor no es lo mismo un error —algo mal aprendido
  que corregir— que un hueco que enseñar, y evita que el alumno adivine y salga
  con un plan que no le sirve. Aparece en el resultado del alumno, en Informes y
  en el cuadernillo impreso.
- El resultado se guarda en `training_progress` con `activity = 'diagnostico'`.
  Esa tabla tiene un **CHECK con la lista de actividades permitidas**: si se
  inventa una actividad nueva y no se agrega ahí, la base rechaza la fila y el
  alumno no se entera (así se perdieron los primeros diagnósticos, que nunca
  llegaron a Informes). La página ahora guarda **antes** de pintar el
  resultado, dice la verdad cuando no pudo subirlo y lo deja apuntado en
  `diagnostico_pendiente_v1` para reintentarlo al volver a entrar.
- Informes lee además el espejo de progreso (`training_state`, claves
  `diagnostico_resultado_v1` y `diagnostico_estado_v1`): así aparecen los
  diagnósticos que quedaron solo ahí y se distingue "no lo ha empezado" de
  "lo dejó en la pregunta N".
- El plan vive en la tabla `training_plans` (Supabase, proyecto AjedrezIntegral).
  Su RLS es la que manda: el alumno solo ve el plan si `shared = true`, y solo su
  profesor o un administrador puede crearlo o editarlo.
- En Informes, profesores y administradores ven "🧭 Diagnósticos de nivel": el
  resumen del grupo con sus gráficos (nivel por alumno, promedio por área y el
  perfil de nueve áreas de cada uno). Las barras usan tres bandas —a trabajar,
  en camino, firme— y **el color nunca va solo**: verde y ámbar no se
  distinguen con daltonismo (ΔE 5.7 en deutan, comprobado con el validador de
  la skill dataviz), así que cada barra lleva su porcentaje y su etiqueta en
  texto, y hay leyenda.
- `diagnostico-de-nivel.pdf` (raíz) es el diagnóstico en papel, con sus
  diagramas y su hoja de corrección. **No se edita a mano**: lo genera
  `herramientas/diagnostico-pdf.js` desde el banco de ítems, así que al tocar
  ítems, áreas o niveles hay que volver a correrlo (`node
  herramientas/diagnostico-pdf.js`, con playwright instalado) o el papel deja de
  coincidir con la pantalla. El cuadernillo es **una** de las formas posibles
  de la prueba, sorteada con semilla fija: `SEMILLA=<número> node
  herramientas/diagnostico-pdf.js` saca otra versión, útil para aplicar dos
  formas distintas en el mismo grupo. **Trae las respuestas** y la hoja de
  corrección, así que lleva marca de agua ("Ajedrez Integral · uso docente",
  repetida en todas las páginas) y el enlace para descargarlo **solo aparece
  para quien administra**.

### Los tres PDF con las respuestas son SOLO de administración

`diagnostico-de-nivel.pdf`, `libro-de-diagnostico.pdf` y
`examen-de-arbitraje.pdf` traen las respuestas y la hoja de corrección. Antes se
le ofrecían a todo el equipo docente; ahora solo a `is_admin`. La razón es
simple: cuanta más gente los tenga bajados, más fácil es que terminen circulando
y que las dos pruebas dejen de medir nada. Quien dé clase y los necesite se los
pide a quien administra.

Están enlazados en **cuatro** lugares y los cuatro comprueban `is_admin`:

- `entreno/diagnostico.html` — `mostrarPdfSiEsAdmin()` destapa los dos y su nota;
- `arbitraje.html` — el bloque `#banco-pdf`, que arranca oculto;
- `informes.html` — dentro del texto de "todavía nadie ha hecho el diagnóstico",
  detrás de un `profile.is_admin ?`. **Este es el que se escapa**: no es un
  enlace escrito en el HTML, se arma con JavaScript dentro de un template, así
  que buscar `href="…pdf"` a mano no lo encuentra.

Como todo filtro del sitio, esto decide qué se **pinta**: los archivos siguen en
la raíz y quien conozca la dirección los baja igual — para eso llevan marca de
agua en todas las páginas y van sin permiso de copiar ni imprimir. Cerrar la
puerta del todo pediría servirlos desde Supabase Storage con RLS.

`verificar-admin.js` abre las páginas con las tres caras (alumna, profesora,
administración) y **mira si el enlace se ve**, y además barre el sitio entero
por si alguien vuelve a escribir uno suelto en otra página. Ese barrido fue el
que encontró el de `informes.html`.

### El libro del banco

`libro-de-diagnostico.pdf` es **otra cosa** que `diagnostico-de-nivel.pdf`, y
conviene no confundirlos: aquel es UNA forma de la prueba, sorteada, para que el
alumno la conteste en papel; este es el **banco entero** —las 301 preguntas, área
por área y escalón por escalón, con la respuesta marcada, el porqué y cómo se
comprobó cada posición—, para estudiar y para corregir. Uno se reparte, el otro
no. Lo genera `herramientas/diagnostico-libro.js`.

Es el hermano de `examen-de-arbitraje.pdf` y comparte **todas** sus
características, a propósito: tapa a página completa impresa aparte y pegada con
`pypdf`, capítulo por área, índice, escala de niveles, hoja de respuestas al
final, opciones barajadas con semilla sacada del id, marca de agua estampada con
`pypdf` en todas las páginas del cuerpo (recomprimiendo y clonando después, o el
archivo se va a megabytes), firma en la tapa, en el pie, en los datos del archivo
y protección del PDF. `CLAVE_PROPIETARIO` es `diagnostico-ai-2026`.

- **Donde el de arbitraje pone la fuente del Handbook, este pone `prueba`**: qué
  se le comprobó a la posición con chess.js ("la jugada es legal y su bandera
  incluye la captura al paso"). Es el equivalente exacto — de dónde sale que la
  respuesta es esa, y no de la memoria de nadie.
- **El diagrama va al LADO de la respuesta, no encima.** Con el tablero arriba,
  cada pregunta con posición ocupaba media página y el libro se iba a 120.
- La hoja de respuestas lleva la letra de la opción **o la jugada**, según el
  tipo de ítem, y con "o" cuando hay más de una jugada válida (`alternas`): dar
  solo una dejaría a quien corrige marcando mal una respuesta correcta.

**Tiene su versión accesible**, `libro-de-diagnostico-accesible.html`, por la
misma razón que el material de estudio: un PDF con diagramas, marca de agua y
cifrado es lo peor que se le puede dar a un lector de pantalla. Cada posición va
contada pieza por pieza y con su FEN, y no hay ni una imagen. El describir lo
comparten los dos generadores desde `herramientas/lib/describir-fen.js` — estaba
dentro de `curso-material.js` y se sacó ahí, porque una segunda copia se iría
separando de la primera a la primera corrección.

Ese archivo **está exceptuado del barrido de `verificar-pwa.js`**, junto a
`inscripcion.html` y `formulario.html`: es un documento que se descarga y se abre
suelto —incluso por correo y sin red—, así que declarar un `manifest` que no va a
poder cargar sería peor que no declararlo.

**El libro descubrió un defecto que la tapa del de arbitraje ya tenía**, y se
arregló en los dos: `overflow: hidden` en el `body` **no recorta el body**, se
propaga al viewport. El tablero decorativo del fondo asoma 44 mm a la derecha, el
documento quedaba más ancho que A4 y Chromium **encogía la tapa entera al 79%** —
se veía como un lomo y un degradado que se cortan antes de llegar al borde de
abajo. Ahora los adornos viven dentro de un `.fondo` con su propio recorte. Los
dos PDF se volvieron a generar.

**Al tocar el banco de ítems o este generador, correr `python3
herramientas/verificar-libro-diagnostico.py`** (necesita `pypdf`). Lee el banco
con Node desde el mismo archivo que usa el sitio —comprobar el libro contra una
copia de la lista no comprobaría nada— y mira que el PDF esté cifrado y se abra
sin contraseña, que NO deje imprimir, copiar ni modificar pero SÍ extraer texto,
que lleve al autor, que tenga marca de agua en **todas** las páginas del cuerpo y
no en la tapa, que estén las 301 preguntas con su respuesta marcada, y que la
versión accesible no dependa de ninguna imagen, tenga los encabezados en orden y
cuente en palabras **cada una** de las posiciones que el PDF dibuja.


### Las 301 preguntas y los cinco niveles

El banco pasó de 118 ítems en 8 áreas a **301 en 9**: se sumaron 183 preguntas
del documento de Oscar («225 preguntas con sus opciones, la respuesta correcta y
la explicación») y con ellas la novena área, **Maestría** — lo que rodea al
tablero: reglamento de torneo, Elo y títulos, motores, partidas históricas.

**De las 225 del documento, 42 ya estaban** preguntadas de otra forma, muchas
veces al revés: «¿qué piezas dan el mate de Boden?» contra «¿cómo se llama el
mate de los dos alfiles cruzados?». Esas no se agregaron. Dos preguntas hermanas
en la misma prueba se regalan la respuesta entre ellas, y el comparador
automático no las distingue de las que solo comparten la plantilla de la frase
(«1.e4 e6 corresponde a la Defensa…» no es la Siciliana): la última pasada fue a
mano.

**Y no se reemplazó el banco viejo.** Los ids de los 118 ítems anteriores están
guardados dentro de los resultados ya rendidos (`detalle.items`), así que borrar
los que no aparecían en el documento habría roto la corrección de esos
diagnósticos.

#### El documento llegaba con la respuesta delatada

Medido antes de importar nada: **la correcta era la opción más larga en 193 de
las 225 (86 %)**, con 28 caracteres de ventaja de mediana —71 contra 34 de
promedio— y era la opción A en 208 de 225. Quien no supiera nada de ajedrez
aprobaba marcando siempre la más larga.

Lo de la posición se arregla solo, porque el sitio baraja las opciones en cada
intento. Lo del largo no: es **exactamente la falla que este banco ya había
tenido** (la correcta era la más larga en 91 de 96 ítems) y por la que
`verificar-diagnostico.js` falla si la correcta gana por más de 2 caracteres. La
causa era siempre la misma —la explicación venía metida dentro de la opción—, así
que se pasó a `explica`, que es donde vive, y las cuatro opciones quedaron
parejas. Son 183 ítems reescritos uno por uno; no hay forma de automatizarlo sin
estropear el contenido.

El documento **no traía los pesos**, aunque su introducción habla de 1 a 3. Están
puestos a mano, en la escala de 1 a 5 del resto del banco, según cuánto exige
cada pregunta. Maestría quedó con 5 en cada escalón, que es el reparto ideal.

Una de las 225 estaba **en el área equivocada** —«Un alfil se mueve siempre…»
figuraba en Cálculo— y se movió a Reglas: puntuada como cálculo, distorsionaba
esa área del informe.

#### Los niveles pasaron a cinco, con rangos de Elo

| Nivel | % global | Elo |
|---|---|---|
| Principiante | 0-29 % | hasta 1399 |
| Básico | 30-49 % | 1400 a 1599 |
| Intermedio | 50-69 % | 1600 a 1799 |
| Avanzado | 70-86 % | 1800 a 1999 |
| Muy avanzado | 87-100 % | 2000 o más |

- **La lista que llegó tenía un hueco**: Básico terminaba en 1599 e Intermedio
  arrancaba en 1601, así que el 1600 no caía en ningún nivel. Se cerró en
  Intermedio.
- **El último tramo queda abierto** hacia arriba aunque se muestre «2000 a
  2199»: si no, alguien de 2300 se quedaría sin nivel.
- **El Elo estimado se interpola DENTRO del tramo según el porcentaje**, no es
  el centro. Con un tramo tan ancho como Principiante (hasta 1399), el centro le
  pondría el mismo número a quien sacó 2 % y a quien sacó 28 %. El piso de ese
  tramo es 400 y no 0, porque cero no es una puntuación que exista.
- `nivelPorEscalones()` **tiene que recortar el índice**: `escalonAlcanzado()`
  devuelve de 0 a 5 y ahora los niveles son cinco, así que sin el tope quien
  supera el escalón 5 se quedaba con `NIVELES[5]`, que no existe. Los topes por
  área bajaron en consecuencia: un área por debajo del 30 % no pasa de
  Intermedio, y por debajo del 50 % no pasa de Avanzado.
- **`DiagnosticoPrueba.AREAS` ya no es una lista escrita a mano**: sale de
  `PlanEntrenamiento.AREAS`. Con la lista a mano, sumar la novena área habría
  dejado la prueba en ocho **sin que nada fallara** — simplemente no habría
  preguntado nada de Maestría y el informe la habría pintado en cero. Por eso
  los dos generadores de PDF cargan `plan-entrenamiento.js` ANTES que el banco.

#### Un diagnóstico nuevo ya no se compara con uno viejo

La prueba pasó de 56 ítems y 160 puntos a **63 y 180**, porque son nueve áreas
por siete ítems. Eso cambia la medición, así que `VERSION` subió a **4** y una
prueba empezada con la anterior se descarta con aviso. Los resultados ya
guardados se siguen leyendo y calificando con los umbrales de entonces, como los
de la versión 1: **no se vuelven a etiquetar**, porque se midieron con otra
prueba.

#### El diagnóstico es una puerta de entrada, así que se puede encontrar

`entreno/diagnostico.html` siempre se pudo hacer **sin cuenta** —quien no tiene
sesión deja nombre y correo y su resultado va a `diagnosticos_publicos`— pero
estaba escondido de dos maneras a la vez, y las dos había que quitarlas:

- la página llevaba `<meta name="robots" content="noindex">` y no tenía
  `canonical`, como todo lo que pide sesión;
- y **`robots.txt` tapa `/entreno/` entero**, que es lo que de verdad importa:
  con el `Disallow` puesto, quitarle el `noindex` no habría servido de nada,
  porque el buscador ni siquiera llega a leer la página. Por eso lleva
  `Allow: /entreno/diagnostico.html` **antes** del `Disallow`, que es como se
  desempata (gana la regla más específica).

Las dos mitades tienen que decir lo mismo, y separarlas no daría ningún error:
la página simplemente seguiría sin aparecer nunca. `verificar-metadatos.py`
comprueba ahora las cuatro cosas —el `Allow`, su orden, que no quede `noindex` y
que esté en el sitemap—, y el sitemap lo agrega solo (lo arma leyendo qué
páginas NO tienen `noindex`, así que solo hubo que volver a correrlo). Es la
**única** excepción de `/entreno/`; el resto del entrenamiento sigue tapado.

En la portada tiene su propia sección, hermana de la del examen de arbitraje y
justo antes: antes era una línea de letra chica debajo del hero. **Lo que NO se
enlaza ahí es `diagnostico-de-nivel.pdf`**: ese cuadernillo trae las respuestas
y la hoja de corrección, así que su enlace sigue apareciendo solo con perfil de
profesor o de administración.

#### Dónde vive en el panel de la Academia

En `clases.html` el diagnóstico tiene **tarjeta propia**, hoy en el grupo "Mide
tu nivel" y **solo para administración** (ver «El panel de la Academia»).
Estaba enterrado en Entrenamiento › Aprende › Asignaciones, que son tres clics
para lo primero que conviene hacer al entrar. El **examen de arbitraje** se mudó
de "Herramientas" a la par del diagnóstico: las dos son pruebas que ubican el
nivel de quien las hace, y en Herramientas quedaba entre el lector de planilla y
la caja de partidas. Se inserta buscando el diagnóstico **por su destino**
(`t.href`), no por su posición, para que reordenar el grupo no lo mande a otro
lado. De paso, la ficha de `tv.html` pasó a llamarse **"📺 TV en vivo"**: se
llamaba "Torneos" igual que la de `torneos.html`, así que el panel tenía dos
tarjetas con el mismo nombre y destinos distintos.


## Examen de arbitraje (reglamento FIDE)

`arbitraje.html` es el examen de reglas para quien arbitra: 40 preguntas del
Handbook de la FIDE, 50 minutos y un nivel estimado de arbitraje. Es lo mismo
que el diagnóstico de jugadores en su forma —banco grande, sorteo, escalones de
dificultad— pero más formal: no hay tablero, cada respuesta cita su artículo y
no se puede "probar" una jugada.

- **Solo profesores y administración.** El enlace vive en la ficha
  "Herramientas" de `clases.html` y en `admin.html`, y la página lo vuelve a
  comprobar (`perfil.role === 'profesor' || perfil.is_admin`): sin eso muestra
  el aviso de acceso denegado. Como todo en el sitio, el filtro es del
  navegador: `js/arbitraje-items.js` es un archivo estático con las respuestas
  adentro, así que quien conozca la dirección puede leerlo. Es un examen de
  formación entre docentes, no una certificación, y se asume así.
- **Ocho áreas** (`js/arbitraje-nivel.js` las describe con qué mide cada una y
  qué estudiar): `leyes` (art. 1-5), `reloj` (art. 6), `irregularidades`
  (art. 7), `tablas` (art. 8-9), `conducta` (art. 11-12), `ritmos` (apéndices
  A y B), `competicion` (C.04, C.07) y `titulos` (B.06).
- **El banco es mucho más grande que el examen**: 200 preguntas, 25 por área y
  5 en cada escalón de cada área. `ArbitrajePrueba.armar()` sortea 5 por área
  —una de cada escalón, 1 a 5— para un total de 40 preguntas y 120 puntos. La
  forma nunca cambia, así que dos exámenes de la misma persona se comparan
  aunque las preguntas hayan sido otras; con cinco candidatas por casilla, dos
  intentos seguidos casi no repiten preguntas.
- **El nivel sale de los escalones, no del porcentaje**, igual que en el
  diagnóstico: el nivel estimado es el escalón más alto superado (70% de
  aciertos ahí y los anteriores también), con tope por área — un área por
  debajo del 40% no pasa de Árbitro de club, por debajo del 60% no pasa de
  Nivel de Árbitro Nacional. Los seis niveles van de "En formación" a "Nivel de
  Árbitro Internacional" y **son una estimación de conocimiento del
  reglamento, no un título**: los títulos FIDE los da la FIDE, con normas y
  cursos (B.06).
- **Cada respuesta termina con su fuente exacta** en `fuente`, y la fuente exacta
  es el documento con su código del Handbook más el artículo:
  `Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.5.5`,
  `Reglamento de títulos de árbitro (Handbook B.06.1)`,
  `Reglas de desempate (Handbook C.07)`. Con el código se encuentra el capítulo
  en handbook.fide.com sin adivinar; no se ponen enlaces directos a cada
  capítulo porque la FIDE versiona esas direcciones con cada edición y quedarían
  muertas. Lo poco que de verdad no sale del Handbook lo dice con todas las
  letras (`Manual del árbitro (ARB)`, `Reglamento antitrampa de la FIDE (ACC)`,
  `Reglamento de cada torneo: no está en el Handbook`), en vez de inventar una
  cita precisa. Tanto la corrección en pantalla como el cuadernillo la imprimen
  al final de cada respuesta, con la etiqueta "Fuente:".
  Citar es parte de lo que enseña el examen —un árbitro no discute de memoria— y
  es lo que permite volver a contrastar el banco: el reglamento cambia (en 2023
  la sanción por jugada ilegal en rápidas bajó de dos minutos a uno), así que al
  tocar una pregunta hay que releer el artículo vigente.
- **Vocabulario latinoamericano, no peninsular.** El texto de la FIDE en
  español dice "reclamación"; en el banco se dice **reclamo**, que es lo que se
  usa acá. Los ids `tab_reclamacion_falsa` y `con_reclamacion_arbitro` conservan
  la palabra vieja a propósito: son identificadores y se guardan en
  `training_state` con cada examen rendido, así que cambiarlos rompería los
  resultados ya guardados.
- **Ninguna opción puede delatarse por el largo** (la misma regla que el
  diagnóstico) y hay **"Dejar en blanco"**, que vale cero como fallar pero se
  guarda aparte: un hueco que estudiar no es lo mismo que una regla aprendida
  al revés.
- `herramientas/verificar-arbitraje.js` comprueba todo esto de una corrida (ids
  repetidos, áreas y escalones válidos, cuatro opciones sin repetir, `fuente`
  presente **y con código de Handbook**, el largo de las opciones y que el banco
  alcance para la cuota). No
  necesita nada instalado: `node herramientas/verificar-arbitraje.js`. **Al
  tocar el banco, correrlo.**
- `examen-de-arbitraje.pdf` (raíz) es el banco entero en papel, tipo libro:
  tapa diseñada, capítulo por área, dentro de cada uno las preguntas ordenadas
  por escalón, con
  la opción correcta marcada, el porqué y el artículo del Handbook, más el índice
  por área, la escala de niveles y la hoja de respuestas al final. **No se edita
  a mano**: lo genera `herramientas/arbitraje-pdf.js` desde el mismo banco, así
  que al tocar preguntas hay que volver a correrlo (`node
  herramientas/arbitraje-pdf.js`, con playwright instalado) o el papel deja de
  coincidir con la pantalla. **La tapa se imprime aparte** y se pega al cuerpo
  con `pypdf`: va a página completa, sin márgenes ni pie de página (por eso no
  lleva número y el cuerpo empieza en la página 1), con el fondo llegando al
  borde del papel. Ese fondo opaco es además lo que tapa la marca de agua en la
  tapa, que es `position: fixed` y si no se repetiría también ahí; el aviso de
  uso docente va en la tapa como sello propio. Las opciones se barajan con una semilla sacada del
  id de la pregunta: así la correcta no queda siempre primera y dos impresiones
  salen idénticas. **Trae las respuestas**, así que va marcado: el logo de Oscar
  Angulo Cubero (`img/logo-oscar-angulo-marca.png`) como marca de agua en las 61
  páginas del cuerpo, el mismo logo en grande en la tapa
  (`img/logo-oscar-angulo.png`), el sello "uso docente" en la tapa y en el pie
  de cada página, y la firma **IA Oscar Angulo Cubero** en la tapa, en el pie y
  en los datos del archivo. El enlace para descargarlo vive dentro de
  `arbitraje.html`, que ya es solo de profesores y administración.
- **La marca de agua se estampa con `pypdf`, no con CSS.** Se probó primero con
  `position: fixed` (que es como la lleva el cuadernillo del diagnóstico y
  Chromium sí la repite en todas las páginas) y se abandonó: al paginar no
  respeta el centrado y la marca terminaba corrida a la derecha y cortada por el
  borde. Ahora el generador imprime una hoja de sello del tamaño exacto de la
  página y la mezcla sobre cada página del cuerpo. **Después de estampar hay que
  recomprimir y clonar**: mezclar deja el contenido de cada página sin comprimir
  (unos 60 KB por hoja, 4,2 MB de archivo). El generador vuelve a comprimir cada
  flujo y después abre el resultado con `PdfWriter(clone_from=...)`, que es lo
  que de verdad tira los flujos viejos —quedan sueltos pero el escritor los
  sigue guardando, y clonar solo copia lo que cuelga del catálogo—. Así el
  cuadernillo pesa 1,3 MB en vez de 4,2 MB. La tapa no la lleva: ya tiene
  el logo en grande. Los dos PNG del logo salieron de recortar el logotipo
  original y pasarle el fondo a transparente; el de la marca es gris para que se
  vea sobre papel blanco.
- **El PDF sale protegido**: se abre sin contraseña, pero no se puede copiar el
  texto, ni editarlo, ni imprimirlo. Lo hace el propio generador, que después de
  Chromium vuelve a escribir el archivo con `pypdf` (`pip install pypdf`); la
  contraseña de propietario —la que levanta esas restricciones— es
  `arbitraje-ai-2026` y está en `CLAVE_PROPIETARIO`, dentro del generador. Queda
  habilitada a propósito la extracción de texto para lectores de pantalla:
  bloquearla dejaría el cuadernillo fuera del alcance de quien lo lee así, y no
  es lo que se quiere evitar. Si falta `pypdf`, el generador borra el archivo y
  falla en vez de dejar un PDF sin proteger. Con todo, es protección del formato
  PDF, no una caja fuerte: quien conozca la dirección lo baja igual y con una
  herramienta puede quitarle las restricciones. Evita la copia y la reimpresión
  de paso; para cerrar la puerta del todo habría que servirlo desde Supabase
  Storage con RLS.
- El resultado se guarda en `training_state` (claves `arbitraje_resultado_v1` y
  `arbitraje_historial_v1`), no en `training_progress`: no es actividad de
  alumno. Quien administra ve además, dentro de la misma página, el último
  resultado de cada profesor.

### El mismo examen, abierto al público

`nivel-de-arbitraje.html` es la versión pública: entra cualquiera, sin cuenta,
y está enlazada desde la portada del sitio. Usa **el mismo banco y el mismo
criterio** que la herramienta docente —40 preguntas, 50 minutos, los mismos
escalones—, así que un resultado de afuera se lee igual que uno de adentro.

- **Pide nombre y correo antes de empezar**, y lo dice para qué: para poder
  mandar la retroalimentación. No hay cuenta, ni contraseña, ni verificación
  del correo.
- **No muestra las respuestas correctas al terminar**, a diferencia de
  `arbitraje.html`. El banco se sortea y enseñarlas convertiría el examen en un
  juego de memoria; además las respuestas son el material docente. Van dentro de
  la retroalimentación que escribe el profesor. (El banco es un archivo estático
  y quien sepa mirar el código las ve igual: la página lo asume y por eso dice
  que es para ubicarse, no una certificación.)
- **Se guarda con `public.registrar_arbitraje_publico()`**, una función
  `SECURITY DEFINER` con permiso de ejecución para `anon`, no con un insert
  directo. Así quien no tiene sesión escribe su resultado sin necesitar ningún
  permiso de lectura sobre la tabla —y no lo tiene: la RLS de
  `arbitrajes_publicos` solo deja leer y actualizar a profesores y
  administración— y la validación de nombre, correo y tamaño queda en el
  servidor. Se probó primero con un insert directo y se descartó: un
  `INSERT ... RETURNING` exige política de `SELECT`, que acá no debe existir.
- **La revisión y la respuesta viven en `arbitraje.html`**, en el bloque
  "📥 Exámenes del público": la lista con el desglose por área, un botón que
  arma un borrador de retroalimentación (nota, nivel, áreas flojas y qué
  estudiar, sacado del propio resultado) y el guardado, que marca `revisado`,
  la fecha y quién respondió.
- **El seguimiento vive en `informes.html`**, en el bloque "⚖️ Exámenes de
  arbitraje": cuántos llegaron, cuántos faltan por responder, el promedio, y la
  tabla con nombre, correo, fecha, nivel, nota, las áreas flojas y el estado.
  Aparece en el resumen general y también solo, eligiendo "⚖️ Exámenes de
  arbitraje (público)" en el filtro de tema (`informes.html?tema=arbitraje`, que
  es lo que enlaza `admin.html`). Como no son alumnos sino visitantes, los
  filtros de alumno y de grupo no les aplican: llevan **su propio filtro de
  estado** (todos / sin responder / respondidos), que es la pregunta que se hace
  desde ahí. Informes solo muestra y cuenta; escribir la respuesta sigue siendo
  en `arbitraje.html`, que es donde está el detalle pregunta por pregunta.
- **El correo lo manda una persona, no un robot**: el botón abre el cliente de
  correo con el mensaje puesto (`mailto:`), para que salga de la dirección de
  quien responde. El sitio no tiene forma de enviar correo por su cuenta y no se
  le agregó una: haría falta una función con la clave de un proveedor guardada
  como secreto en Supabase.
- Las ilustraciones de la página son **SVG escritos a mano dentro del HTML**, no
  imágenes: no dependen de ningún archivo ni de ninguna licencia, y cada una
  lleva su `<title>` para quien use lector de pantalla.


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

- Ojo con cómo se escribe una comprobación de «se dibuja con SVG»: contar solo
  los glifos da **verde sobre un tablero vacío**, que es justo lo que pasa cuando
  el panel no se pinta. Se piden las dos cosas — que haya piezas dibujadas y que
  no quede ni un glifo. Y todo se lee con `|| {}`: una prueba que revienta deja
  sin correr lo que venía después, que es la mitad de lo que hay que mirar.
- Y los tableros se comparan **con las casillas ordenadas**: el DOM las recorre
  de a8 a h1 y chess.js de a1 a h8, así que un `JSON.stringify` a secas falla por
  el orden de las claves y no por la posición.

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

## Retar a quien está en línea

En `juegos.html`, debajo de las tarjetas, está "🟢 En línea ahora": quién más
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

## Una función de TRIGGER no es una API

Postgres le da `EXECUTE` a **PUBLIC** a toda función nueva, y `anon` y
`authenticated` lo heredan de ahí. Así que las diecisiete funciones de trigger
del sitio —las que protegen los relojes, los tiempos de presencia, las notas y
las marcas de progreso, y las que mandan los avisos push— nacen publicadas en
`/rest/v1/rpc/` sin que nadie lo pida.

**Hoy no es una fuga, y por eso nadie lo notó en meses**: al llamarlas, Postgres
contesta «trigger functions can only be called as triggers» —comprobado, no
supuesto—. Lo que cuesta es el RUIDO. El linter de Supabase levantaba **80
avisos**; casi todos son por diseño (las funciones de permiso validan por
dentro: `generar_cobros` exige `soy_coordinador()`, `set_student_elo` exige ser
profesor del alumno, las dos revisadas una por una). Entre ese montón, estas
diez eran las únicas sin ninguna razón de estar — y el día que aparezca un aviso
de verdad va a estar enterrado en la misma lista que nadie lee. Quitadas, el
linter bajó a **61**.

**Ya era la costumbre de la casa**: las siete funciones de trigger más viejas
(`handle_new_user`, `protect_answer_grading`, `protect_profiles_identity_columns`,
`sincronizar_profesor_principal`, `avisar_clase_abierta`, `avisar_desafio`,
`protect_game_state_teacher_columns`) llevaban revocadas desde siempre. Se fue
olvidando en las diez que se escribieron después.

- **Se revoca de los TRES: `public, anon, authenticated`.** Acá estuvo escrito
  lo contrario —que bastaba con `PUBLIC` porque los otros dos no tenían ningún
  grant propio que quitar— y **hoy no es cierto**: Supabase les da el suyo con
  `alter default privileges`, así que una función nueva nace con los tres.
  Revocar solo de `PUBLIC` "pasa" y la función **sigue publicada**, que es el
  mismo fallo callado en el SQL, ahora al revés. Lo que manda es el ACL, no lo
  que devuelva el comando: una función bien revocada es
  `{postgres=X/postgres,service_role=X/postgres}` y nada más; cada entrada
  `anon=X/...`, `authenticated=X/...` o **`=X/postgres`** (ése es PUBLIC) es una
  puerta abierta. Y lo que de verdad contesta es
  `has_function_privilege('anon', oid, 'execute')`, que es lo que pregunta la
  consulta de abajo.
- **A `authenticated` NO se le quita el execute de una función que llame una
  política de RLS.** Una política se evalúa con los privilegios de quien
  escribe, así que sin ese execute la política rechaza a todo el mundo — y ahí
  sí se rompe algo de verdad. Solo se le quita a `anon`, que no tiene nada que
  hacer ahí. Es la diferencia con las de trigger, que el motor dispara sin
  pedirle `EXECUTE` a nadie.
- **`service_role` conserva el suyo**, que es el que usan las Edge Functions.
- **Revocar NO afecta a los triggers.** El motor los dispara con los privilegios
  del trigger y no le pide `EXECUTE` a quien hace el insert. Está comprobado
  impersonando a un alumno en una transacción revertida, los cinco casos: la
  hora inventada en `platform_activity_log` se sigue ignorando, la marca de
  coordenadas de 999999 se sigue rechazando y la legítima sigue entrando, el
  reloj de 999999 se sigue rechazando y el cálculo de una jugada normal sigue
  pasando.
- **`proteger_reloj_de_partida` era la ÚNICA de las diecisiete sin `search_path`
  fijo.** Sin él lo pone quien dispara el trigger, así que un esquema propio por
  delante puede cambiar qué `now()` se resuelve — y ese trigger existe
  justamente para que la hora la ponga el servidor. Quedó en `''` y no en
  `'public'` porque su cuerpo no toca ninguna tabla: solo `now()`, `greatest`,
  `coalesce`, `extract` y los operadores de jsonb, todos de `pg_catalog`.

**Al escribir una función de trigger nueva, revocarle el execute de PUBLIC.**
Estas dos consultas lo dicen — la primera tiene que devolver cero filas:

```sql
-- Funciones de trigger publicadas como API, o sin search_path fijo.
select proname,
       has_function_privilege('anon', oid, 'execute') as anon,
       has_function_privilege('authenticated', oid, 'execute') as auth,
       coalesce(proconfig::text, '(SIN search_path)') as config
from pg_proc
where pronamespace = 'public'::regnamespace
  and prorettype = 'pg_catalog.trigger'::regtype
  and (has_function_privilege('anon', oid, 'execute')
    or has_function_privilege('authenticated', oid, 'execute')
    or proconfig is null);

revoke execute on function public.<la_nueva>() from public, anon, authenticated;
```

### `anon` sacaba el mapa de quién estudia con quién

La ronda de arriba miró las funciones de TRIGGER. Hay una clase más que nace
publicada por el mismo descuido y que **no** es de trigger: las funciones
auxiliares que contestan una pregunta sobre OTRA persona.
`public.profesores_de(alumno)` y `public.alumnos_de(profesor)` son
`SECURITY DEFINER` —tienen que serlo: de ellas cuelgan las cinco que hacen
cumplir «quién es profesor de quién»— y tenían `EXECUTE` de PUBLIC y de `anon`.

**La fuga era real, no teórica.** Comprobado antes de tocar nada: con `set
local role anon`, `alumnos_de(<un profesor cualquiera>)` devolvía sus **53
alumnos**, y `profesores_de(<un alumno cualquiera>)` sus 2 profesores. La clave
pública está escrita dentro del HTML, así que eso lo podía pedir **cualquiera
desde internet, sin cuenta**: el mapa completo de quién estudia con quién, y de
paso la lista de alumnos de cada profesor. No salen nombres ni correos —son
uuid— pero es justo la relación que `profiles_select` acota con tanto cuidado.

- **A `anon` se le quita y a `authenticated` NO.** Es la regla que ya está
  escrita arriba: hay **cinco funciones `SECURITY INVOKER`** que las llaman
  —`mis_clases()`, `mi_gente()`, `alumnos_del_profesor()`,
  `alumnos_del_profesor_con_nombre()` y `grupos_de_mis_alumnos()`— y una
  función INVOKER corre con los privilegios de quien llama. Sin ese execute,
  `mis_clases()` falla para todo el mundo y el alumno se queda sin saber
  quiénes son sus profesores. Ninguna POLÍTICA las nombra directamente
  (comprobado sobre `pg_policy`), así que la RLS no se ve afectada.
- Comprobado después: `anon` recibe **«permission denied for function
  alumnos_de»**; el alumno sigue recibiendo sus 3 clases de `mis_clases()`; el
  profesor sus 53 alumnos por `alumnos_del_profesor()`, sus 2 grupos y sus 54
  perfiles; y la coordinadora su `mi_gente()`. Ninguna página del sitio las
  llamaba por RPC — se buscó.

**Lo que esto NO cierra, y queda anotado:** un alumno con sesión
(`authenticated`) las sigue pudiendo llamar con el id de cualquiera. No se le
puede quitar el execute sin romper esas cinco funciones, porque PostgREST
expone por RPC todo lo que `authenticated` puede ejecutar. La salida sería
**moverlas fuera del esquema `public`** —a uno que PostgREST no exponga—, y eso
toca las quince funciones que las usan: es un cambio aparte, no un arreglo
puntual. Queda escrito acá porque un pendiente que solo vive en la cabeza de
alguien no existe.

**La regla que deja esto:** una función `SECURITY DEFINER` que conteste sobre
una persona que NO es quien llama es una API aunque no lo parezca. Al escribir
una, preguntarse quién tiene que poder llamarla — y si la respuesta no incluye
al público, revocarle el execute de `public` y de `anon`.

### Lo que queda pendiente y NO se puede hacer desde acá

**La protección contra contraseñas filtradas está apagada, y hoy no se puede
encender.** Supabase puede comparar cada contraseña nueva contra
HaveIBeenPwned y rechazar las que ya se filtraron; el sitio es de menores de
edad y hoy acepta cualquiera. Es un interruptor del panel, no SQL, así que no
entra en ninguna migración — pero además **es de plan Pro**, y la organización
(`Base de Colegios`, donde viven los dos proyectos) está en el gratuito: en el
panel el interruptor aparece con candado.

- Cuando se pague el plan, está en **Authentication › Sign In / Providers ›
  Email › "Prevent use of leaked passwords"**. No es «Authentication ›
  Policies» —ahí no hay nada de esto— y mucho menos **Database › Policies**,
  que son las reglas RLS de las tablas y es otra pantalla completamente
  distinta.
- Mientras tanto lo único que hay es el mínimo de 6 caracteres de
  `bienvenida.html`, que es lo que trae Supabase por omisión. Subirlo a 8 sí se
  puede sin pagar (es otro campo de esa misma pantalla), pero un mínimo más
  largo no distingue una contraseña filtrada de una nueva: son cosas distintas
  y conviene no confundirlas.

Queda escrito acá porque un pendiente que solo vive en la cabeza de alguien no
existe.

## Confites del caballo

`confites.html` (ficha en Juegos) es el paseo del caballo contado como juego:
hay un confite en cada una de las 64 casillas y el caballo los recoge saltando,
pero **cada casilla pisada queda bloqueada**. La marca es cuántos juntó antes de
quedarse sin saltos; 64 es el recorrido completo.

- La **pista usa la regla de Warnsdorff** —ir a la casilla desde la que queden
  menos saltos— y lo explica, porque es la idea que de verdad resuelve el
  problema: las casillas con pocas salidas son las que se quedan aisladas si se
  dejan para el final. Con esa regla se completan las 64 (está comprobado en la
  prueba del navegador, jugando desde a1).
- **Dos marcas**, las dos declaradas en `CLAVES` de `js/progreso-usuario.js`:
  `confites_best` (la mejor, con ayuda o sin ella) y `confites_best_limpio` (la
  mejor sin pistas y sin deshacer). Deshacer cuenta como ayuda a propósito: sin
  eso se llega a 64 a fuerza de retroceder y la marca no diría nada.
- No escribe en `training_progress` —esa tabla tiene el CHECK de actividades y
  el juego no es una de ellas—; el tiempo sí se registra con
  `js/tiempo-plataforma.js data-activity="confites"`, que no tiene CHECK.

## El panel de la Academia

`clases.html` es por donde entra todo el mundo. Sus accesos viven en
`TILE_GROUPS`, un solo lugar: mover un acceso de grupo es cambiarle el objeto de
lista, y el resto se acomoda solo.

- **"Aprender" va antes que "Jugar y competir".** Esto es una academia: lo
  primero que se ofrece al entrar es lo que se viene a hacer. Jugar queda
  justo debajo, a un golpe de vista — no se esconde, se ordena.
- **Mover un grupo de lugar es mover su objeto dentro de `TILE_GROUPS`, y
  nada más.** Todo lo que después retoca la grilla —administración,
  coordinación, el equipo docente— busca su grupo **por nombre**
  (`TILE_GROUPS.find((g) => g.title === …)`), nunca por la posición. Por eso
  `verificar-panel.js` también pregunta por nombre: con índices, un cambio de
  orden rompía media docena de comprobaciones que no tienen nada que ver con
  el orden y había que renumerarlas a mano. El orden se comprueba aparte y
  una sola vez, que es donde importa.
- **"Sesión en vivo" va sola y de primera**, en su propio grupo ("Clase en
  vivo") y con `destacado: true`, que la pinta ancha y en una línea. Es lo único
  del panel que pasa AHORA MISMO; mezclada entre Juegos y Torneos había que
  buscarla justo cuando hay clase. Un grupo de un solo acceso pintado con la
  grilla de cuatro columnas sería un cuadrito perdido a la izquierda, que es
  peor que no destacarlo.
- **Los grupos se ordenan por las preguntas que uno se hace al entrar**, igual
  que las pestañas de la clase en vivo: qué pasa AHORA (Clase en vivo) → qué me
  pusieron con fecha → qué hago por mi cuenta (Aprender) → dónde juego → dónde
  me mido → mi cuenta.
- **"Lo que te pone tu profesor" junta Tareas y Exámenes**, y es lo segundo que
  se ve. Antes Tareas vivía en "Aprender" y Exámenes en "Evaluaciones": lo
  único del panel que **tiene fecha** estaba partido en dos grupos y cada mitad
  enterrada entre cosas que se hacen cuando uno quiere. La franja de arriba
  solo aparece cuando hay tareas pendientes —y **nunca por un examen**—, así
  que fuera de ese momento no había dónde mirar.
  - **El rótulo no repite los nombres de sus dos tarjetas**: dice lo que las
    dos tienen en común y que no se deduce de ellas —que te las pone alguien
    más y vencen—. Es la misma regla que en la clase en vivo, donde el rótulo
    dice QUIÉN LO VE en vez de qué hace el botón.
  - Por eso el grupo lleva **`titleProfe`**, igual que los tiles llevan
    `descProfe`: del otro lado del escritorio esa misma pareja es "Lo que le
    pones a tus alumnos". Lo aplica `textosDelEquipoDocente()`, en el mismo
    lugar y de la misma forma que las descripciones. **Olvidárselo a un grupo
    nuevo le pondría a la profesora un encabezado que habla de su profesor**,
    así que la regla de "a quien da clase ninguna tarjeta le habla de «tu
    profesor»" vale ahora también para los rótulos, y la prueba los mira.
- **Dentro de un grupo el orden también dice algo.** En "Aprender" va primero
  lo que se HACE (Entrenamiento), después lo que se mira de un vistazo para
  repasarlo (Estudio), después el curso completo y al final la lectura: Cursos
  estaba primero y es lo más largo de los cuatro, así que quien entra a
  practicar veinte minutos tenía delante lo que menos se parece a eso. En
  "Jugar y competir" va primero donde se juega contra otra persona (Juegos),
  después el torneo, y de último lo que se MIRA —TV en vivo no es jugar, es ver
  jugar—, con el bot y las medallas detrás.
- **Un mismo destino no va dos veces en el panel.** "Racha táctica" salió de
  "Jugar y competir" porque ya es lo PRIMERO que hay dentro de `juegos.html`,
  en una franja a todo el ancho: el segundo camino no se usa y de paso ensancha
  la grilla. Es el mismo error que el panel ya había cometido con "Torneos", y
  por eso mismo **"Torneos de la Academia" volvió a llamarse "Torneos"**: el
  nombre estaba largo para distinguirlo de la otra tarjeta que se llamaba
  igual, y esa otra es hoy "TV en vivo". El día que vuelva a haber dos, el que
  se renombra es el nuevo.
- **"Mide tu nivel" es lo que uno hace por su cuenta**, y se llamaba
  "Evaluaciones" con los exámenes adentro. Un examen te lo pone otra persona,
  con fecha y con nota; un diagnóstico lo hace uno cuando quiere, para saber
  dónde está parado. Ahí quedan los dos diagnósticos y nada más — y **el grupo
  entero es SOLO de administración**, ver abajo.
- **Un grupo del que no queda ni un acceso utilizable no se pinta.** A la
  alumna, "Herramientas" le salía como un encabezado y dos cuadros grises —sus
  dos accesos están en mantenimiento—: una sección entera de la página que no
  lleva a ninguna parte, que es la misma razón por la que se fue el
  "Próximamente" sin fecha. Un acceso apagado **entre otros que funcionan sí se
  queda**, y con su razón escrita: ahí uno vino por otra cosa y de paso se
  entera de que eso vuelve. No se esconde con una clase: no se pinta — un
  enlace invisible pero presente sigue siendo una parada de tabulador.
- **Los dos diagnósticos son SOLO de administración.** Estaban para todo el
  mundo, y eso era regalar las dos pruebas con las que el sitio ubica el nivel
  de alguien: los bancos —301 preguntas y 200 de reglamento— son archivos
  estáticos, así que cuanta más gente las resuelve por su cuenta, menos miden.
  Un diagnóstico se APLICA, no se practica.
  - Lo quita `diagnosticosSoloParaAdministracion()`, sobre la lista ya armada y
    en un solo lugar, igual que `apagarEnMantenimiento()`. Se quita el **grupo
    entero** y no sus dos tarjetas: un encabezado sin nada debajo es la misma
    sección muerta que ya se quitó de "Herramientas" para el alumnado.
  - Va **después** del `if` que le reapunta el destino al arbitraje, así quien
    administra lo conserva apuntando a `arbitraje.html` —la página con la
    revisión de los exámenes del público y el detalle pregunta por pregunta— y
    no a la versión pública. Y el grupo se queda **escrito en `TILE_GROUPS`**
    con sus dos tarjetas: definirlo dentro del `if` de un rol volvería a
    repartir el panel a pedazos.
  - **El diagnóstico de nivel sigue abierto al público sin cuenta** en
    `entreno/diagnostico.html`, que es una puerta de entrada al sitio y otra
    cosa: lo que se quitó es el camino desde el panel de quien ya está adentro.
    Lo mismo `nivel-de-arbitraje.html`, que es pública y enlazada desde la
    portada.
  - La comprobación que importa no es que el grupo no salga en la lista: es que
    **no quede ni un enlace a esas dos páginas en la grilla**, escondido o no —
    un enlace invisible pero presente sigue siendo una parada de tabulador.
    `verificar-panel.js` lo mira con las tres caras, y a administración le pide
    lo contrario: que SÍ se le pinten los dos, o se quedaría sin ninguna puerta.
- **Un acceso apagado no es un enlace gris.** `renderTileCard()` le pone un
  `<div>` con `aria-disabled`, sin `href`: no recibe el foco del teclado ni
  promete un destino que no va a abrir. Y lleva escrito POR QUÉ está apagado
  ("En mantenimiento", "Próximamente") en la propia tarjeta — un cuadro gris sin
  explicación se lee como una página rota.
- **Cada tarjeta lleva el texto de los dos públicos: `desc` y `descProfe`.**
  El panel estaba escrito para el alumno de punta a punta, así que a quien da
  clase le decía cosas que no son: que "tu profesor te asigna el rival" (lo
  asigna ella), que los torneos "los arma tu profesor" (los arma ella), que
  Informes es "tu progreso" (es el de sus alumnos) o que la sesión en vivo es
  "el tablero con tu profesor". **Tareas tenía el defecto al revés**: su texto
  era el del profesor, así que al alumno le ofrecía asignarle material a unos
  alumnos que no tiene.
  - Los dos textos viven **junto al tile** y no repartidos en `if`s por
    `init()`: así se ven de un vistazo al leer la lista, y un tile nuevo que
    solo sirva para uno de los dos se nota enseguida. Lo aplica
    `textosDelEquipoDocente()` sobre la lista ya armada, en un solo lugar,
    igual que `apagarEnMantenimiento()` — y vale para quien administra, como
    todo lo que se hace para los profesores.
  - **Un texto que sirve igual para los dos NO se duplica.** Dos versiones de
    la misma frase se van separando a la primera corrección; sin `descProfe`,
    el tile usa el suyo y ya.
  - **La comprobación que importa no es la lista de textos uno por uno**, que
    envejece con cada corrección: es que a quien da clase **ninguna** tarjeta
    le hable de "tu profesor". Un tile nuevo copiado de otro cae ahí solo.
- **"Mis pagos" es del alumnado, no del equipo docente.** Las mensualidades
  son de las familias, así que a una profesora esa tarjeta le ofrecía "lo que
  se te ha cobrado" sobre una cuenta a la que no se le cobra nada. Quien
  coordina sí llega a los cobros, pero por **"Cobros de la Academia"** en
  Herramientas, que es la página entera y no el recibo propio — y por eso
  nunca aparecen las dos, que serían el mismo destino repetido.
- **En el grid van LUGARES, no acciones.** "Cerrar sesión" estaba ahí *y*
  como botón de la cabecera: el mismo destino dos veces —lo que ya había
  pasado con "Torneos"— y la única acción entre un grid de sitios a los que
  ir. Se queda solo en la cabecera, que es donde se busca. Con él se fue el
  camino `action === "logout"` de `renderTileCard()`, que no usaba nadie más.
- **Un "Próximamente" sin fecha no se queda.** "Exámenes" llevaba meses
  apagado esperando unos exámenes de curso que todavía no existen, ocupando
  un lugar de la grilla. Una tarjeta que nunca cambia deja de leerse; el día
  que los exámenes existan, vuelve. No es lo mismo que "En mantenimiento",
  que sí dice algo cierto sobre un acceso que existe y va a volver.
- **Lo de mantenimiento se apaga SOLO para el alumnado**, en
  `apagarEnMantenimiento()`, sobre la lista ya armada y en un solo lugar. Se
  marca con `mantenimientoAlumno: true` en el tile, así que volver a prender un
  acceso es borrar esa palabra. Como todo filtro del sitio esto decide qué se
  PINTA: la dirección sigue existiendo y quien la conozca entra igual.
- **Y `soloAdmin` no es lo mismo, aunque se parezca.** `mantenimientoAlumno`
  APAGA un acceso para el alumnado y se lo deja entero al equipo docente;
  `soloAdmin` lo QUITA para todos menos administración, en
  `soloParaAdministracion()` y con el mismo patrón de sus dos hermanas (sobre
  la lista ya armada, así alcanza también a los tiles que `init()` agrega
  después). **Confundirlos es lo que dejó al lector de planilla a la vista de
  la profesora**: la página todavía no funciona y ella la tenía como un acceso
  normal, o sea una promesa que se descubre rota delante de la clase. Hoy el
  lector de planilla y la "Guía del profesor" son los dos `soloAdmin`. Se
  quitan y no se apagan porque una tarjeta gris dice "esto vuelve", y acá lo
  que hay que decir es que no es suyo.

### Arriba va lo que vence, no otro directorio de lugares

El panel era una lista de sitios a los que ir: todo lo que es "esto te toca
AHORA" vivía detrás de un clic, y quien no lo buscaba no se enteraba. Dos
franjas, las dos arriba del grid y **antes** de los accesos:

- **Lo que te pusieron con fecha: tareas Y exámenes** (`#pendientes-aviso`, que
  por eso dejó de llamarse `tareas-aviso` — un examen contado dentro de algo
  que se llama "tareas" es como empiezan los malentendidos). La fecha límite ya
  vivía en `tareas.vence_at` y en `examenes.vence_at`; lo que faltaba era
  decirla acá. Un alumno abría el panel, no veía nada que hacer, y la entrega
  vencía **sin que nada avisara** — el aviso push sale al asignarla y después
  no vuelve nunca, y del examen ese push es el **único** aviso que existe.
  - **Ninguna de las dos cuentas se hace acá**: `tareas_con_avance()` es la
    misma función que pinta `tareas.html` y `examenes_con_nota()` la misma que
    pinta la lista del alumno en `examenes.html`. Dos pantallas que cuenten lo
    mismo por su cuenta terminan diciendo cosas distintas del mismo alumno.
  - **Un examen vencido NO es una tarea vencida, y confundirlos sería
    mentirle.** `iniciar_examen()` rechaza con «Se pasó la fecha para hacer
    este examen» el que sigue en `asignado` después de su `vence_at`: ahí se
    acabó. Una tarea vencida, en cambio, se sigue pudiendo hacer, y por eso su
    texto dice "todavía puedes" y el del examen **no**. Lo mismo el
    `congelado`, que solo reabre el profesor, y el `en_curso` al que ya se le
    pasó el `termina_at`. De los cuatro estados, solo **asignado con fecha por
    delante** y **en curso con reloj corriendo** son "puedes hacer algo ahora":
    lo decide `estadoDeExamen()`, en un solo lugar.
  - **Lo que ya no se puede hacer se dice pero no se cuenta.** Sumarlo al
    "tienes N pendientes" le ofrecería algo que no va a poder abrir; callarlo
    sería el fallo de siempre. El título pasa a "Hay algo que tienes que
    saber".
  - **El orden de las reglas importa y está escrito**, como el del informe a la
    casa: el texto se queda con UNA cosa, la que pide actuar antes — primero el
    examen con **el reloj corriendo** (que es lo más urgente que hay en el
    panel: el tiempo se está yendo ahora), después lo que ya se perdió, después
    la tarea vencida, y al final lo que viene, donde entre dos que vencen el
    mismo día manda el examen porque tiene una sola oportunidad.
  - **Los minutos que quedan NO se dicen acá.** El reloj del examen sale de la
    hora del **servidor** (`termina_at` contra `now()`) y en el panel solo está
    la del navegador: un número sacado del reloj de la computadora podría
    decirle que le quedan diez minutos cuando ya se le acabaron. Ese número lo
    da `examen.html`, que lo pide a la base. Decidir "corre o no corre" con el
    reloj local sí es tolerable — en el peor caso lo manda a la pantalla del
    examen, que le dice la verdad.
  - **El enlace lleva a lo que el texto acaba de nombrar**, y cuando es un
    examen rendible va **directo a rendirlo** (`examen.html?id=…`), la misma
    decisión que el aviso al celular: tiene reloj y una sola oportunidad, así
    que buscarlo en una lista es un paso de más. Uno vencido o congelado va a
    `examenes.html` — mandarlo a la pantalla que lo va a rechazar sería peor.
  - **Si los exámenes no llegan, las tareas se siguen mostrando**: quedarse sin
    franja por la mitad que falló sería perder también la que sí se pudo leer.
  - **Una tarea vencida pinta la franja en rojo**, con el emoji cambiado. Es la
    diferencia entre "tienes algo que hacer" y "se te pasó", y en el gris del
    resto del panel esas dos cosas se leen igual. El emoji acompaña a la
    **línea** y no a la franja: con el 📋 de Tareas sobre un texto que habla de
    un examen, el icono estaría señalando otra cosa.
  - **"vence mañana", no una fecha.** Una fecha hay que compararla con el
    almanaque; se cuenta por **días de calendario** y no por horas, así que una
    tarea de mañana a las 8 a. m. vence mañana aunque falten menos de 24 horas.
  - **Las pendientes las filtra la base** (`p_pendientes` de la función), no se
    bajan todas para descartar las hechas acá.
- **Continúa donde ibas.** El curso a medias cuya última lección marcada es la
  más reciente, con su barra. Los datos ya los cuenta
  `informes_cursos_alumnos()` (un renglón por alumno y curso empezado, con el
  total, lo hecho y el último tema): acá solo se elige cuál mostrar. Un curso
  terminado no se ofrece — no hay nada que continuar ahí.

**Las dos arrancan con `hidden` y solo se destapan cuando de verdad hay algo que
decir.** Una franja que diga "no tienes tareas" es ruido en todas las visitas
menos una, y un cartel que se repite deja de leerse — la misma lección que dejó
el aviso de instalar la app.

### Por dónde empezar: sin nada que vencer, la franja la ocupa el primer paso

Un alumno recién invitado no tiene ninguna tarea ni ningún examen —nadie se los
puso todavía—, así que la franja se le quedaba en blanco y el panel era un
directorio de veintitantos lugares sin ninguna pista de por cuál empezar. En los
datos se veía exactamente así: **de los alumnos que llegaron a entrar, la mayoría
no había resuelto ni un ejercicio**, y buena parte de ellos **sí había hecho el
diagnóstico** — o sea que no es que no arranquen, es que **el camino se corta
justo después**.

Lo confirma el otro número: `training_plans` tiene **cero filas** desde que
existe. El diagnóstico se rinde, da un resultado, y no hay nada que lo convierta
en «ahora haz esto».

**Por eso no es UN primer paso, es EL SIGUIENTE**, y son tres peldaños que se
calculan de lo que ya hay. El panel pinta el primero que no esté cumplido:

| si… | se le ofrece |
|---|---|
| ya rindió el diagnóstico y no ha resuelto nada | **su** área floja, con dónde practicarla |
| lo dejó a medias | seguir el diagnóstico, diciendo por qué pregunta iba |
| no lo empezó nunca | hacer el diagnóstico |

- **Se apaga solo.** Al resolver el primer ejercicio el peldaño deja de
  cumplirse. No hay nada que marcar ni ningún «ya lo vi» en `localStorage` que se
  pueda quedar desincronizado.
- **Va en la MISMA franja** (`#pendientes-aviso`), no en una nueva: contesta la
  misma pregunta —«¿qué hago ahora?»— y dos franjas peleando por el primer lugar
  es el problema que este panel ya tuvo con «Estado de la clase». Por eso el
  pintado se sacó a **`pintarFranja()`**: con dos, el que se olvidara de quitar
  el rojo dejaría una sugerencia con pinta de entrega vencida.
- **Lo que vence MANDA.** El primer paso solo llega hasta donde
  `cargarPendientes()` hoy se rendía sin pintar nada: una fecha le gana siempre a
  un consejo. Sin eso, a un alumno nuevo con una tarea ya puesta el panel le
  escondería la tarea detrás de la sugerencia.
- **Nunca se pinta en rojo** y tiene su propio título («Empieza por acá»): decir
  «tienes 1 pendiente» sobre una sugerencia sería mentir.

#### El destino tiene que ser una página cuyo trabajo CUENTE

Es lo único de todo esto que se rompe callado. **Cinco de las nueve áreas tienen
como primer recurso la PORTADA de un curso**, que es un temario: mandar ahí a
quien quiere *hacer* algo lo deja leyendo un índice, no escribe ni una fila en
`training_progress`, y **mañana la franja le dice exactamente lo mismo** — el
peldaño no se apaga nunca y no se entera nadie.

Así que el destino se cruza contra `MaterialPlataforma.HERRAMIENTAS` y solo vale
el que ofrece la meta `cantidad`, que es lo mismo que decir «escribe en
`training_progress`». Si el área más floja no tiene ninguno, **se baja a la
siguiente que sí lo tenga**.

- **Y por eso el texto NO dice «lo más flojo».** Se ofrece la más floja *de las
  que tienen dónde practicar*, que no siempre es la peor de todas; «señala un
  hueco en X» es cierto para cualquiera por debajo del 60 %, y el superlativo
  sería mentira.
- **Ni el área ni el enlace se escriben acá.** Las áreas flojas las calcula
  `PlanEntrenamiento.resumir()` —la misma que pinta Informes y el resultado del
  diagnóstico— y a dónde va cada una está en su propio `recursos`.
- **Se compara la PÁGINA, no la dirección entera** (`r.href.split("?")[0]`):
  los recursos del plan llevan su recorte puesto y el catálogo de Tareas guarda
  la página pelada. Comparando la dirección completa no coincidiría ni uno solo
  y el paso caería siempre al genérico, sin que nada fallara.
- **Y se manda la dirección CON el recorte.** Es lo que separa «haz ejercicios
  de clavada» de «ahí tienes ochenta temas, busca» — la misma decisión que el
  enlace de una tarea.

### Los recursos del plan: específicos, y comprobados contra el banco

`AREAS[].recursos` decía «Ejercicios por tema» y «Curso: Estrategia y Táctica»,
o sea el nombre de la página y nada más. Eso se escribió cuando el sitio tenía
mucho menos material; hoy hay **80 temas, 3 categorías de mates, 40 líneas de
apertura y 56 fichas de estudio**, todos con su enlace directo, y el plan no
conocía ninguno. Quien tenía flojos los finales recibía «Ejercicios por tema»
y ochenta temas por delante para encontrar los de final.

Ahora cada área ofrece **de 5 a 7 recursos con su recorte puesto**, y en un
orden que no es casual: **primero lo que se HACE** (ejercicios que cuentan),
después la ficha de Estudio para mirarlo de un vistazo, y al final el curso o el
artículo para leerlo a fondo. Son 57 enlaces, 35 de ellos recortados.

- **Las nueve áreas tienen ahora dónde practicar.** Antes, cinco mandaban a la
  portada de un curso y el primer paso del panel se las tenía que saltar;
  `finales` ya tiene `pawnEndgame` y `rookEndgame`, `estrategia` tiene
  `quietMove` y `middlegame`, y `maestria`, las partidas de maestros.
- **`entreno/aperturas.html` entró en «Principios de apertura»**, que era la
  única área cuyo plan no ofrecía ni un ejercicio que resolver.
- **El desequilibrio de material tiene su propio curso** y ahí se manda ahora
  «Valor del material», que apuntaba a Fundamentos.

**Al tocar `recursos`, los bancos o `js/material-plataforma.js`, correr `node
herramientas/verificar-plan-recursos.js`** (no necesita navegador, ni red, ni el
sitio servido). Comprueba que cada enlace exista como archivo, que cada recorte
esté **en el banco de verdad** —`entreno/data/metas.json`, el mismo que genera
`metas-indice.py` leyendo las fuentes—, que ninguna área repita un recurso, y
—lo que sostiene el primer paso del panel— **que ninguna se quede sin un solo
recurso donde el trabajo cuente**. Con qué parámetro recorta cada página se le
pregunta a su propio `hrefRecorte` y no a una tabla escrita en el verificador:
el día que cambie, una tabla copiada seguiría dando verde sobre enlaces rotos.

Todo lo que se rompe acá se rompe callado y lo descubre el alumno, que es el
único que no puede arreglarlo: un `?tema=` con una clave que ya no está abre la
lista vacía, sin error y sin aviso. Está probado que falla de verdad —con un
tema inventado y con un archivo renombrado, salta—.

#### Detalles que ya costaron una vez

- **Haber rendido el diagnóstico NO es haber entrenado.** Es una fila de
  `training_progress` como cualquier otra, así que «no ha hecho un solo
  ejercicio» **no** es `total_ejercicios === 0`: hay que descontarlo de
  `por_actividad`. Sin eso, a quien acaba de rendirlo el panel lo daría por
  arrancado y no le diría nunca qué hacer con el resultado — que es justo el caso
  que más abunda.
- **No se le promete que el diagnóstico se retoma donde lo dejó.** Una prueba
  empezada con una `VERSION` anterior se descarta a propósito, así que
  prometerlo sería mentirle justo a quien vuelve confiando en eso. Se dice por
  qué pregunta iba, y nada más.
- **`js/plan-entrenamiento.js` y `js/material-plataforma.js` se bajan cuando
  hacen falta**, no en cada carga: son 39 KB que solo usa quien ya tiene un
  diagnóstico rendido, y por el panel entra todo el mundo —incluidos los que
  todavía no lo hicieron, que son justamente los que más van a ver esta franja—.
  Mismo criterio que el libro de aperturas del bot.
- **`Logros.cargar()` se pide UNA vez y la promesa se reparte** entre el número
  de «Tu progreso» y el primer paso: dos llamadas serían dos veces la misma
  consulta para pintar el mismo dato.

### El orden de la página es el de las preguntas que uno se hace al entrar

    qué me toca  →  por dónde iba  →  cómo voy  →  y recién entonces a dónde ir

O sea: tareas, "Continúa donde ibas", "Tu progreso" y después el grid de
accesos. El resumen estaba **al final**, después de las seis secciones de
tarjetas: la racha y los números —que son lo que da ganas de volver— solo los
veía quien hacía scroll hasta el fondo.

- **La franja de "Estado de la clase" solo aparece cuando tiene algo que
  decir**: si hay clase en curso (eso lo ve todo el mundo) o si quien mira da
  clase y puede iniciar una. A un alumno fuera del horario —que es casi
  siempre— le ocupaba el **primer lugar de la página** para avisarle de que NO
  pasa nada, empujando hacia abajo sus tareas. El acceso a la sesión en vivo
  sigue estando en el grid, que es donde se busca.
  - **Se esconde la tarjeta entera** (`#session-status-card`), no solo sus dos
    mitades: con las dos ocultas quedaba la caja blanca vacía con su relleno,
    que se lee como algo que no cargó.
  - **La condición es la misma que ya decide el botón de iniciar clase**, así
    que no se le esconde a nadie un control que sí podría usar. Esconderla de
    más le quitaría a quien da clase la única forma de empezarla, y eso no
    daría ningún error: simplemente no podría.
- **El orden se comprueba con `compareDocumentPosition`**, no con el CSS: lo
  que importa es el orden del documento, que es también el que recorre un
  lector de pantalla.

### Los tres números de Entrenamiento los contaba el navegador

Es la misma piedra de `informes.html` y de `admin.html`, y estaba acá desde
siempre: "Tu progreso en Entrenamiento" hacía
`from("training_progress").select("*").eq("student_id", …)` y sumaba en el
navegador. **PostgREST corta la respuesta a partir de cierta cantidad de filas
sin dar ningún error**, y `training_progress` crece unas 5 filas por alumno y
por día: a un alumno con bastante entrenamiento encima el panel le pintaba un
número **que ya no subía**, sin que nada fallara.

Los tres números ya los devuelve `informes_resumen_alumnos()` —`puzzles`,
`lecciones`, `mejor_coord`— y, siendo `SECURITY INVOKER`, a un alumno le
devuelve **solo su propio renglón**: la misma función que usa `informes.html`,
así que la cuenta tampoco queda escrita dos veces.

De paso, **las tres tarjetas anchas apiladas** —récord de racha táctica, racha
de días y los tres números— quedaron en **una sola franja "Tu progreso"**, cada
número con su enlace. Eran mucho scroll para tres datos y para llegar al
registro de clases.

### Quien da clase no entra al panel del alumno

Al profesor el panel le mostraba **sus** ejercicios 4×4 (en cero, porque no es
alumno), **su** racha de días y el récord de racha táctica de la clase. Nada de
eso le sirve: lo que necesita al entrar es **a quién hay que perseguir**. Ahora
ve "Tu semana" — sus alumnos, cuántos no entrenaron en 7 días, las tareas que
ÉL mandó y siguen sin hacerse, cuántas ya vencieron y las clases del mes. Es la
misma decisión de "una página, dos públicos" que ya toman `informes.html`,
`cobros.html` y `tareas.html`, y **vale igual para quien administra**, como todo
lo que se hace para los profesores.

- **La cuenta la hace `public.panel_profesor()`**, no el navegador: contar
  "alumnos distintos que entrenaron" desde el cliente pide bajarse
  `training_progress` y cruzar el mismo techo de arriba en silencio.
- Es **`SECURITY INVOKER`**, como las funciones de informes: **quién es alumno
  de quién lo decide la RLS** y no hay un solo filtro de profesor escrito, ni en
  la función ni en la página. Comprobado impersonando roles en SQL — una
  profesora recibe exactamente sus 29 alumnos, los mismos que `alumnos_de()`, y
  quien administra los 89.
- **Las tareas sí llevan `profesor_id = auth.uid()` escrito dentro de la
  función**: la política de `tareas` deja ver también las de quien administra, y
  lo que el panel dice es "las tareas que TÚ mandaste", no las de toda la
  plataforma.
- **"Sin entrenar" es una resta** (`alumnos - activos_7d`), no un número aparte
  que pueda contradecir a los otros dos.
- **El rojo solo aparece cuando el número no es cero.** En rojo permanente se
  deja de ver, que es lo mismo que no ponerlo.
- **La situación de una tarea NO es su columna `estado`.** Esa columna quedó
  sin uso a propósito (ver «Tareas») y nunca vale `'vencida'`: la calcula
  `tareas_con_avance()` a partir de los renglones, que es la misma cuenta que
  pintan `tareas.html`, el panel del alumno y el informe a la casa.
  `panel_profesor()` la miraba igual, y medido con los datos reales eso eran
  **dos tareas que el alumno ya había terminado contadas como pendientes Y
  vencidas**: el único número que le pide al profesor hacer algo, inflado, y sin
  que nada fallara. Al escribir cualquier cuenta de tareas se usa
  `tareas_con_avance()`, nunca la columna.
- **`tareas_puestas` y `clases_dadas` no son `tareas_pendientes` ni
  `clases_30d`.** Existen porque los peldaños de abajo necesitan distinguir
  "nunca" de "ahora no": con todas las tareas hechas las pendientes son cero
  igual que si no hubiera puesto ninguna, y `clases_30d` en cero puede ser un
  mes flojo o una cuenta que nunca dio clase. Son dos situaciones que piden
  decirle cosas opuestas.

#### Por dónde empezar, del lado del que da clase

Es el mismo problema del alumno y la misma solución, con los peldaños del otro
lado del escritorio: un entrenador nuevo abre el panel, ve cuatro números en
cero y un directorio de accesos, y nada le dice cuál es el siguiente paso. En
los datos se veía igual — el profesor con más alumnos llevaba **49 entradas y
ni una tarea, ni una clase, ni un plan, ni una nota**.

`primerPasoDelProfesor()` pinta **el primer peldaño que no esté cumplido**, y
todos se calculan de lo que ya hay, así que **se apagan solos**: al mandar la
primera tarea ese peldaño deja de cumplirse. No hay nada que marcar ni ningún
"ya lo vi" en `localStorage` que se pueda quedar desincronizado.

| | cuándo | a dónde |
|---|---|---|
| 1 | sin alumnos asignados | a ninguna parte (ver abajo) |
| 2 | ninguno hizo el diagnóstico | Tareas |
| 3 | hay planes sin compartir | Informes |
| 4 | no ha puesto ninguna tarea | Tareas |
| 5 | no ha dado ninguna clase | la clase en vivo |
| 6 | faltan diagnósticos (goteo) | Tareas |

- **El orden es el del trabajo, y por eso se dice UNA sola cosa**: sin alumnos
  no hay nada que hacer; sin diagnóstico no hay plan que armar; un plan sin
  compartir no lo ve ni el alumno ni su casa, o sea que cuenta como que no
  existe; y recién entonces la tarea y la clase.
- **El peldaño 1 no lleva a ninguna parte, y es a propósito.** Asignar alumnos
  es de quien administra, así que a un profesor se le explica **que no está
  roto** —eso es justo lo que parecen cuatro ceros con Informes vacío, Tareas
  sin a quién mandarle y un subgrupo que no se puede llenar— y se le dice quién
  se los asigna. Se le **quita el `href`** al `<a>`, no se le deja uno que no
  haga nada: sin `href` no recibe el foco ni se anuncia como enlace. A quien
  administra sí se le ofrece `admin.html`, que es suyo. Tres de los siete del
  equipo docente estaban en ese estado.
- **Va en la MISMA franja que lo del alumno** (`#pendientes-aviso`, por
  `pintarFranja()`): contesta la misma pregunta —«¿qué hago ahora?»— y dos
  franjas peleando por el primer lugar es el problema que este panel ya tuvo
  con «Estado de la clase».
- **Nunca en rojo**: nada de esto se venció, está por hacer.
- **Con todo al día no se pinta nada.** Un cartel que se repite deja de leerse
  — la misma lección del aviso de instalar la app.
- Reemplazó al renglón `#profe-planes`, que decía solo lo de los planes: dos
  lugares decidiendo qué se le dice al profesor terminan diciendo dos cosas.

#### El camino del entrenador, recorrido entero

Cada pieza tiene su verificador —tareas, planes, la clase en vivo, la
bitácora, informes— y todos comprueban SU pantalla. Lo que no comprobaba
ninguno es la **costura**: que un entrenador pueda recorrer el camino entero
sin encontrarse una puerta cerrada. `herramientas/verificar-camino-entrenador.js`
abre las 13 pantallas del camino, una detrás de otra, en un navegador de
verdad.

- **Con una profesora que NO administra**, que es la cara que ningún
  verificador miraba: los dobles suelen ponerle `is_admin` —el de las capturas
  de la guía lo hace a propósito, porque la guía tiene que enseñar todas las
  pantallas— y con eso los permisos no se prueban, porque quien administra pasa
  por todas partes.
- **Reusa el doble de `guia-capturas.js`**, que ya sabe servir 25 pantallas con
  sesión y datos de mentira. `clienteFalso()` acepta ahora `{ perfiles, yo,
  rpc, tablas }` y sin nada hace exactamente lo de siempre. Un doble escrito
  aparte se iría separando de este a la primera corrección.
  - Ahí mismo saltó la trampa de siempre: `tablas.profiles` **no es una tabla
    suelta**, se rellena con `DEMO.perfiles`, así que cambiar las cuentas sin
    cambiarla deja a la página sin encontrar a quien dice ser — y eso se ve
    como «No se pudo cargar tu perfil», que parece un fallo de la página y es
    del doble. Ya pasó con `verificar-aperturas-pagina.js` y con
    `verificar-informes.js`.
- Lo que mide es lo que se rompe callado: que ninguna pantalla **se vaya al
  login**, se quede en «Comprobando tu sesión…», le diga acceso denegado o
  pinte `undefined`; que desde todas se pueda **volver al panel** (un enlace a
  `clases.html` que se vea de verdad, medido con `checkVisibility()`) — una
  pantalla sin vuelta es un callejón del que solo se sale con el botón de
  atrás; y **que el destino que el panel PROPONE en cada uno de sus seis
  peldaños abra para ese mismo perfil**. Un peldaño que mande a una pantalla
  que le rebota no da ningún error: la franja se ve perfecta y el clic termina
  en el aviso de acceso denegado.
- El destino se lee **de la propia franja**, no de una lista copiada en el
  verificador: una lista escrita a mano se queda vieja y daría verde sobre
  enlaces que ya no son esos.
- Está probado que falla de verdad: apuntando el peldaño de los planes a
  `cobros.html` —que a quien no coordina le niega— salta.

### El registro de clases no se baja entero

Es la misma piedra de `informes.html`: con 100 clases, bajarlas todas y
pintarlas de corrido no sirve de nada —no se encuentra ninguna— y a partir de
cierta cantidad de filas **PostgREST corta la respuesta sin dar ningún error**.
Así que el filtro y el corte los hace la base y la página solo pinta:

- el periodo, con un `gte` sobre `started_at` (30 días, 3 meses, un año, todas);
- la búsqueda por título o notas, con un `or(...ilike...)`;
- la página, con un `range()` de 20 y un "Ver más clases";
- y la cuenta total con `count: "exact"`, que es lo que permite decir "Mostrando
  20 de 143" sin haber traído 143 filas.
- **El texto de búsqueda se limpia antes de mandarlo**: PostgREST arma el
  `or=(...)` con comas y paréntesis, así que un título con una coma rompería la
  consulta entera.
- Cada consulta lleva su marca (`sesionesPeticion`): una respuesta que llega
  tarde, después de que se escribió otra búsqueda, se descarta en vez de pintar
  el resultado de un filtro que ya no está.

Se muestra **agrupado por mes**, con el más reciente abierto y los de atrás
cerrados, y el encabezado de cada mes dice cuántas clases y cuántas horas. Eso
es lo que hace que un año de clases se pueda mirar. Qué mes quedó abierto vive
en `sesionesMeses`, o repintar los cerraría todos. Y la lista se repinta entera
desde lo que se lleva cargado, en vez de ir pegando filas: así un mes partido
entre dos páginas queda en un solo bloque y su encabezado cuenta bien.

**Al tocar el panel, correr `node herramientas/verificar-panel.js`** (con el
sitio en localhost:8777 y playwright). Existe porque `clases.html` está detrás
del login: `verificar-css.js` abre las páginas sin cuenta, así que nada de esto
lo ve nunca. Comprueba en un navegador de verdad los grupos y su orden con las
tres caras (alumna, profesora, administración), que lo apagado esté apagado para
quien tiene que estarlo y abierto para los demás, que el registro mande a la
base un `gte`, un `ilike` y un `range` de 20 —su Supabase de mentira anota cada
consulta, así que si algún día alguien vuelve a bajarse la tabla entera se
nota— y **que la página se vea**: que el cartel de instalar arranque invisible
de verdad, que no haya CSS impreso como texto y que con el tema en oscuro el
fondo salga oscuro.

Comprueba además lo de arriba, que es lo que se rompe callado: que la franja de
tareas **se vea de verdad** (se mide el `display` que calcula el navegador, no
el atributo — la lección que dejó el cartel de instalar), que cuente las
pendientes y no las hechas, que una vencida la pinte en rojo y ninguna vencida
no, que **sin tareas y sin cursos a medias las dos franjas no se destapen**, que
"Continúa donde ibas" ofrezca el curso a medias más reciente y no el terminado,
y —lo que de verdad importa— que los tres números **salgan del RPC y que nadie
pida `training_progress`**: si alguien vuelve a sumarlos acá la página se ve
igual de bien hasta que un alumno cruza el techo de PostgREST. Y que a quien da
clase se le pinte "Tu semana" y **no** el panel del alumno.

De los peldaños del profesor comprueba los seis, que es donde está el error
fácil: que sin alumnos la franja **no ofrezca ninguna página** que la base le
vaya a negar (se mira el `href` de verdad) pero que a quien administra sí, que
«ninguna tarea puesta» no se confunda con «ninguna pendiente» —a quien mandó
cinco y las hicieron todas no se le pide la primera—, que «nunca dio clase» no
se confunda con «este mes no», y que con todo al día la franja **no se
destape** (se mide el `display` que calcula el navegador). Está probado que
falla de verdad: cambiando `tareas_puestas` por `tareas_pendientes`, saltan
seis comprobaciones.

De los exámenes en la franja comprueba los seis estados en que se puede estar,
que son justamente los que se distinguen mal: que uno entregado no la destape,
que uno con el reloj corriendo **mande sobre una tarea vencida** y lleve directo
a terminarlo, que al que se le pasó la fecha **no se le diga «todavía puedes»**
—el texto de la tarea, que ahí sería mentira— ni se le ofrezca la pantalla que
lo va a rechazar, que al congelado se le diga quién tiene que reabrirlo, que el
título cuente las dos clases de cosa ("3 tareas y 1 examen") y **que no se
inventen los minutos que quedan**, que eso lo sabe el servidor. Sus exámenes de
mentira se cuelgan de HOY y no de una fecha escrita, como las clases: con fechas
fijas la prueba se pudre sola con el almanaque.

- Su Supabase de mentira **resuelve las columnas de tabla relacionada**
  (`profiles.grupo`, que es como PostgREST las nombra). Sin eso ese filtro no
  encontraba nunca nada, así que el récord de racha táctica salía siempre en
  "todavía nadie" y la prueba daba verde porque no lo miraba.

## La burbuja de "quién está conectado"

El pedido era de quien da clase: **ver cuántos estudiantes están conectados
ahora mismo en la plataforma, poder ver quiénes son y escribirles, «tipo
burbuja adicional sin que estorbe en ningún lado»**. Es
`js/burbuja-en-linea.js`, una burbuja flotante abajo a la derecha que
`herramientas/academia-cabecera.py` pone en las páginas de la Academia.

**Tiene dos caras y las dos viven en el mismo archivo**, porque son el mismo
hilo visto desde sus dos puntas — escritas aparte se separarían a la primera
corrección, igual que `js/videollamada.js` o `js/subgrupos-marcar.js`:

- **Quien da clase** ve el conteo de sus alumnos conectados, quiénes son y en
  qué página andan, y le escribe a cualquiera sin salir de lo que estaba
  haciendo.
- **El alumno** recibe ese mensaje **en la página que tenga abierta** y
  contesta ahí mismo.

**Esa segunda mitad no es un adorno.** Hasta ahora el chat solo existía dentro
de `sesion.html`, que además exige clase abierta: un mensaje mandado a un
alumno que estaba entrenando no lo leía nadie. Se mandaba, se guardaba, y el
profesor se quedaba esperando una respuesta que nunca iba a venir. Un mensaje
que no llega no es un mensaje, y eso no da ningún error.

### El canal es POR PROFESOR, y lo que llega por él no se cree

Un canal de presencia de Supabase **no pasa por la RLS**: lo escucha —y se
anuncia en él— cualquiera que sepa su nombre. De ahí las dos decisiones que
sostienen esto:

- **No hay un canal global.** Un `academia-en-linea` para todos le repartiría a
  los mil doscientos alumnos la lista de quién está conectado y en qué página
  — que es exactamente la fuga que ya se cerró una vez, cuando el canal de
  Juegos anunciaba con quién estudiaba cada quien. El alumno se anuncia en
  `academia-en-linea:<profesor>`, **uno por cada profesor suyo**, y el profesor
  escucha el suyo. Lo peor que puede oír alguien que se cuele en el canal de su
  propio profesor son sus compañeros, que es lo que `es_companero()` ya le deja
  ver en `profiles`. Mismo patrón que `clases-presence:<boardOwnerId>`.
- **La lista se cruza contra `profiles` y el nombre que se pinta es el de la
  BASE, no el del canal.** Sin ese cruce, cualquiera podría anunciarse en el
  canal de un profesor ajeno con el nombre que quisiera y aparecerle en la
  burbuja: la pantalla se vería perfecta y el fallo saldría recién al mandarle
  un mensaje que la RLS rechaza, sin que nadie entienda por qué. Se pide con
  `.in(ids)` sobre los conectados de ahora —nunca la tabla entera, que es la
  piedra de PostgREST— y quien la base no reconoce **no se pinta**.
- **Por el canal va lo justo: id, nombre y en qué página anda. El correo NO.**
  En la Academia son menores de edad y ese canal lo escucha cualquiera que sepa
  su nombre. El nombre viaja solo como respaldo; lo que se pinta sale de la base.
- **La página se dice con el `<title>`, no con el `pathname`.** «entreno/4x4.html»
  no le dice nada a quien lo lee; el título ya está escrito para leerse.

### "Conectado" quiere decir lo mismo que en el resto del sitio

Tener la pestaña abierta no es estar. `js/tiempo-plataforma.js` ya decidió qué
cuenta como activo —60 segundos sin un clic, una tecla o un scroll, o la
pestaña de fondo— y acá se usa **el mismo número**: al pasar de ahí se deja de
anunciar y al volver la actividad se vuelve a anunciar. Si no, la burbuja diría
«3 conectados» de gente que dejó la página abierta y se fue, el profesor le
escribiría y no contestaría nadie — que es peor que no tener el conteo.

### El mensaje no estrena tabla

Es `class_chat_messages`, la misma del chat de la clase en vivo y con la misma
RLS: el profesor escribe en el hilo de cualquier alumno suyo
(`soy_profesor_de(student_id)`), el alumno solo en el suyo. **Un mensaje es un
mensaje, no dos bandejas**: lo que se escribe desde la burbuja se lee en la
clase en vivo y al revés. No hizo falta ninguna migración para esto.

**Qué está leído vive en `localStorage`, y es del APARATO a propósito**, como
el tema o la clase elegida. Es un aviso, no un dato: en la base pediría una
columna que hay que mantener al día con cada lectura, y lo peor que pasa así es
que un mensaje ya leído en la compu vuelva a avisar una vez en el celular.

- **El profesor tiene una marca POR ALUMNO**, así que al arrancar pide los
  últimos mensajes y descarta acá. Con un `gt` sobre una marca sola se perdería
  el mensaje viejo de un alumno con el que no había hablado nunca. El alumno sí
  filtra en el servidor: su hilo es uno.
- **El alumno filtra el Realtime en el servidor** (`student_id=eq.<él>`); el
  profesor no puede —son N alumnos— y descarta en el cliente contra la lista
  que la base le reconoció.

### Que no estorbe es la mitad del pedido

- **Al alumno la burbuja SOLO se le pinta si tiene algo que leer.** No necesita
  saber quién está conectado, y un botón permanente sería justo el estorbo que
  esto no quiere ser. Al profesor se le queda siempre: el conteo es el dato, y
  «ahora mismo no hay nadie» también es una respuesta.
- **Un alumno sin ningún profesor no monta nada**: no hay a quién anunciarse ni
  de quién recibir. El aviso de «pide que te asignen un profesor» ya vive en el
  panel, que es por donde se entra.
- **Va en `z-40`, debajo del encabezado (`z-50`).** Si empataran, al desplegarse
  taparía el interruptor de tema.
- Escape la cierra **y devuelve el foco al botón**: un panel que se cierra
  dejando el foco en la nada deja perdido a quien usa teclado. El botón lleva
  `aria-expanded` y `aria-controls`, y el contador va en una región viva.
- **Dos páginas de la Academia se quedan SIN burbuja**, por razones distintas:
  `sesion.html`, que ya tiene el chat de la clase y su lista de conectados en
  un panel hecho para eso —la burbuja encima sería el mismo destino dos veces,
  el error que el panel ya cometió con «Torneos», y sobre un tablero—; y
  `examen.html`, que tiene reloj, una sola oportunidad por pregunta y pantalla
  completa: un panel que se despliega ahí es la distracción que el antitrampa
  viene a evitar, y el mensaje sigue estando cuando termine.
- El nombre de un alumno y el texto de un mensaje **los escribe una persona**,
  así que van siempre por `textContent` — la misma regla de la bitácora y de
  `renderStudentsList()`.
- **Y sobre todo: no ensucia ninguna.** Se agrega a 56 páginas que ya
  funcionaban, así que su arranque entero va en un `catch`: lo que falle se
  queda en una línea de consola y la burbuja no se monta. **Eso salió en la
  primera corrida**: los dobles de Supabase de media docena de verificadores no
  tienen canales de presencia, así que `sb.channel` no existía y el TypeError
  salía en la consola de `informes.html` —`verificar-notas.js` lo cazó por su
  comprobación de «sin errores en la consola»—. Un error suyo en la consola de
  una página que no tiene nada que ver con ella es donde se esconden los
  errores de verdad. Son **dos piezas y hacen falta las dos**: la salida limpia
  (`if (!sb.channel) return`, porque sin canales no hay nada que montar) y el
  `catch` detrás, que es la red. Está medido: con las dos puestas saltan las
  comprobaciones si se quitan las dos.
  - Por eso **NO se les agregó `channel()` a los dobles de los otros
    verificadores**: ahí la burbuja no se monta y no tiene por qué — quien la
    comprueba es `verificar-burbuja.js`, con su doble que sí los tiene.

### Dónde se pone la línea

La pone **`herramientas/academia-cabecera.py`**, con las marcas
`<!-- burbuja: inicio -->` / `<!-- burbuja: fin -->`, así que se puede correr
todas las veces que se quiera. Va ahí y no en un script aparte porque **la
lista `PAGINAS` es la misma**: con dos listas, la página nueva entra en una y
se olvida en la otra — que es exactamente lo que ya pasó entre
`verificar-pwa.js` y `pwa-cabecera.py`. **Al agregar una página de la Academia,
sumarla a esa lista y correr el script.**

**Al tocar `js/burbuja-en-linea.js` o el generador, correr `node
herramientas/verificar-burbuja.js`** (con el sitio en localhost:8777 y
playwright). Su Supabase de mentira tiene **canales de presencia de verdad**:
la prueba siembra quién está conectado y dispara el sync, como haría Realtime,
y **anuncia también a un intruso con el nombre que él eligió** — que es lo que
puede hacer cualquiera con sesión. Comprueba que el intruso no se pinte y que
el nombre que salga sea el de la base; que el mensaje viaje al hilo de ESE
alumno y firmado por quien escribe; que al alumno sin mensajes **no se le pinte
ningún botón** (se mide `checkVisibility()`, no la clase); que se anuncie a
**sus dos** profesores y no solo al principal; que con la pestaña de fondo deje
de anunciarse; que un nombre con una etiqueta adentro no se ejecute **y se siga
viendo, literal**; y que la línea esté en todas las páginas de la Academia,
en ninguna de las dos exceptuadas, y con una ruta relativa que **llegue de
verdad al archivo** (un 404 ahí no avisa: la burbuja simplemente no aparece).

Comprueba además, con un cliente **sin canales de presencia**, que no se monte
y que **no deje ni un error en la consola** — que es lo que de verdad la hace
segura de poner en 56 páginas.

Está probado que falla de verdad: creyéndole al canal en vez de cruzar contra
`profiles` saltan 2 comprobaciones, anunciándose solo al profesor principal 1,
pintando el nombre con `innerHTML` 2, pintándole la burbuja al alumno sin
mensajes 1, y quitándole a la vez la salida limpia y el `catch` del arranque,
las 2 del cliente recortado.

## El panel de Administración

`admin.html` es de quien administra y tiene dos mitades: los atajos de arriba y
la lista de cuentas.

### Los atajos, por grupos

Eran ocho botones en una fila corrida, sin ningún criterio de orden —el
diagnóstico de los alumnos al lado de la base de datos de chess-results— y cada
uno con las mismas doce clases de Tailwind copiadas. Ahora salen de `ATAJOS`,
una lista con cuatro grupos: **Resultados** (los dos diagnósticos y los dos
exámenes, el de la Academia y el del público), **Formularios**, **Bases de
datos** y **Reportes**.

- Las tarjetas son **más chicas** que las del panel de la Academia a propósito:
  acá son atajos de quien ya sabe lo que busca, no la puerta de entrada de un
  alumno.
- **"Informes de toda la plataforma" queda aparte y primero**, con su botón
  ámbar: es la puerta grande, y las tarjetas son atajos a un apartado suyo.
- Cuatro de los cinco atajos de Resultados llevan a `informes.html?tema=…`. Ese
  enlace directo **depende de que el tema exista en el selector de
  `informes.html`**: si se le cambia el nombre a una opción, el atajo lleva al
  resumen general sin decir nada. Por eso `verificar-admin.js` comprueba que
  cada atajo apunte a un archivo que existe y, si lleva `?tema=`, a un tema que
  el selector de verdad tiene.
- Se agregó el tema `diagnostico-publico`, hermano del de arbitraje público: los
  diagnósticos de visitantes ya salían dentro del tema `diagnostico` y en el
  resumen general, pero ahí hay que bajar a buscarlos, y son contactos para
  invitar a Academia — se consultan seguido.

### Las cuentas se ven por GRUPO, no todas de una

Lo primero que muestra la página son **fichas de grupo**, no la lista de
cuentas: con trescientas, una pared de filas con sus campos editables y sus
etiquetas de profesor no se lee, y encontrar un grupo es hacer scroll. Cada
ficha dice cuánta gente tiene, qué profesores la llevan (con cuántos alumnos de
ese grupo tiene cada uno) y cuántos se quedaron sin profesor. Las cuentas
aparecen solo al **abrir un grupo** o al **buscar a alguien**.

- `grupoAbierto` es lo único que decide qué se ve: `null` son las fichas, y un
  nombre de grupo son sus cuentas. Hay dos grupos que no son un `profiles.grupo`:
  **Sin grupo** (alumnos a los que nadie se lo puso) y **Profesores y
  administración** — el equipo docente no tiene grupo, y mezclarlo con los
  sueltos lo escondía entre ellos.
- **Buscar manda sobre el grupo abierto y mira TODOS los grupos.** Buscar a
  alguien sin saber en qué grupo está es justamente para lo que se busca.
- **Cada ficha puede sumarle un profesor a TODO su grupo de una vez.** Es la
  operación de todos los años ("todo 7° B también al profesor nuevo") y antes
  pedía marcar el grupo entero y bajar a la barra de lote. Va en modo
  **`agregar`**, que suma y no reemplaza: quitarle sin querer un profesor a
  cuatrocientos alumnos es el error caro de esta página. Manda **todos** los
  alumnos del grupo, no los 50 que se estén pintando, y solo alumnos —a un
  profesor no se le asigna profesor—.

### La lista de cuentas, pensada para muchas

- **El nombre se cortaba, y la causa era la maqueta**: nueve columnas dentro de
  un `max-w-5xl` (1024 px). Ahora la página es `max-w-7xl` y **nombre y correo
  van en UNA sola celda**, uno debajo del otro. De paso "Hacer administrador"
  se fue a Acciones (es de una vez cada tanto, no de todos los días) y la corona
  quedó al lado del nombre. Siete columnas en vez de nueve.
- **Buscar, filtrar y mostrar de a poco**, las tres cosas juntas: búsqueda por
  nombre, correo o grupo **sin tildes** (quien escribe "ramirez" tiene que
  encontrar a "Ramírez"), filtro de rol, y 50 filas por vez con "Ver más". Cada
  fila lleva cuatro campos editables y sus etiquetas de profesor: pintar
  trescientas para buscar a una es trabajo tirado.
- El filtro de rol tiene una opción que **no es un rol**: "Sin profesor
  asignado". Es la pregunta que más se hace en esta página —esos alumnos no
  salen en los informes de nadie— y el aviso de arriba ahora los deja a la vista
  de un clic en vez de decir "agrúpalos abajo para encontrarlos".
- **Las cuentas se piden de mil en mil.** Se pedían de un solo tiro, y PostgREST
  corta la respuesta a partir de cierta cantidad de filas **sin dar ningún
  error**: el día que la plataforma pase de mil cuentas, el panel habría
  empezado a esconder cuentas en silencio, y los conteos de alumnos por profesor
  habrían salido calculados sobre un pedazo. Es la misma piedra de
  `informes.html`, con el mismo `traerTodo()`.

**Al tocar `admin.html` o `inscripciones.html`, correr `node
herramientas/verificar-admin.js`** (con el sitio en localhost:8777 y
playwright). Las dos están detrás del login, así que `verificar-css.js` no las
ve. Su Supabase de mentira trae **1.205 cuentas a propósito**: es el único
número con el que se nota si la página se las pide de una sola vez. Y mide el
ancho del campo del nombre con un nombre largo de verdad, que es con lo que
empezó todo esto. Comprueba además que al entrar **no se pinte ni una fila** —si
alguien vuelve a mostrarlas todas, la página se ve igual de bien hasta que hay
trescientas— y qué manda de verdad la ficha a la Edge Function al sumarle un
profesor a un grupo (los 401 ids y el modo `agregar`, no medio grupo ni un
`reemplazar`). Del volcado en un equipo comprueba que se ofrezcan los grupos y
los subgrupos —con el dueño de cada subgrupo escrito—, que **un grupo que no
cabe en el tope no se mande** y se diga con su número, y que el que sí cabe se
sume al que ya estaba en vez de reemplazarlo.

## Las inscripciones a torneos en línea

`inscripciones.html` muestra lo que llegó por `inscripcion.html`, el formulario
público de torneos. Es de **quien administra o coordina**, no de todo el equipo
docente.

**Esos datos viven en OTRO Supabase.** `inscripcion.html` escribe en el proyecto
"Base de Colegios" (`prcfbzvshnusisczlpxl`), no en el de la Academia, y esa es
toda la razón de que esta página esté armada distinto al resto del sitio.

- **La tabla no se abre, y no se va a abrir.** `public.inscripciones` tiene RLS
  y **ni una sola política**: desde el navegador no la lee nadie. Son cédulas,
  fechas de nacimiento y teléfonos de personas menores de edad, y la clave
  pública de ese proyecto está escrita dentro de `inscripcion.html`, a la vista
  de cualquiera — darle lectura a `anon` sería publicarlas.
- **Y además se le quitó el permiso de tabla, que es otra cosa.** La RLS sin
  políticas ya lo paraba, pero Supabase le concede a `anon` y a `authenticated`
  el `select/insert/update/delete` de toda tabla nueva de `public` y confía en
  la política: o sea que las 87 cédulas dependían de que nadie apagara la RLS
  desde el panel, con un clic y sin ninguna confirmación. Ahora esas dos tablas
  —`inscripciones` y `chess_leads`— no tienen en su ACL más que `postgres` y
  `service_role`, que es con lo que entran la Edge Function y el Worker. Es la
  misma decisión que ya se había tomado en la Academia con `formularios`,
  `formulario_respuestas` y `profile_teachers`: **una puerta menos que dependa
  de que la política esté bien escrita.**
- **`Coles` sí se lee sin sesión, y por eso es la excepción.** Son los 12.104
  centros educativos del MEP —datos públicos— y de ahí sale el selector de
  colegios de `inscripcion.html`, que se abre sin cuenta. Lo que se le quitó es
  lo que nunca usó: `anon` podía **insertar, actualizar y borrar** en la lista
  de colegios del país, y lo único que lo impedía era que su única política
  fuera de `select`. Le quedó `select` y nada más.
- Comprobado impersonando roles en SQL, los cuatro casos: `anon` ya no lee
  `inscripciones` ni `chess_leads` —da error de permisos, que es lo que se
  busca, no «0 filas»—, no puede escribir en `Coles`, sigue leyendo sus 12.104
  colegios, y `service_role` conserva todo.
- Las trae la Edge Function **`inscripciones-torneo`**, que vive en ese mismo
  proyecto y lee con la service role. Las pide de mil en mil, por lo de siempre.
- **El permiso lo decide la Academia, no la función**, y no podría decidirlo
  aunque quisiera: el JWT de quien llama lo firmó el otro proyecto, así que este
  no lo puede validar (por eso su `verify_jwt` va en `false`). Lo que hace es
  **reenviar esa misma sesión** a la Academia y llamar a
  `public.soy_coordinador()`, que es `SECURITY DEFINER` y solo `authenticated`
  puede ejecutar. O sea: la misma regla que decide `cobros.html`, escrita una
  sola vez.
- Comprobado, impersonando roles en SQL y llamando a la función de verdad: el
  administrador recibe `true`; un alumno con sesión válida, `false`; una sesión
  con un `sub` que no existe, `false`; `anon` ni siquiera puede ejecutarla. Y la
  función contesta **401 sin token, 403 con un token inventado y 403 con la
  clave pública de la Academia**. Lo único que no se pudo probar desde acá es el
  camino bueno de punta a punta —hace falta una sesión de verdad de quien
  administra—, así que eso se mira al entrar la primera vez.
- La página vuelve a preguntar `soy_coordinador()` antes de pintar, pero eso es
  solo para mostrar el aviso de siempre en vez de un error feo: quien de verdad
  deja pasar es la función.
- El CSV sale con **punto y coma y BOM**, como el de formularios, y baja **lo
  que se está viendo** (con su filtro puesto): si se filtró por provincia es
  porque se quiere esa lista.
- **Si algún día hay que cambiar quién puede ver esto**, se cambia
  `soy_coordinador()` en la Academia y se cambia solo; la función no tiene
  ninguna regla propia que actualizar.

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
parado de la página siga llegando a su mínimo de contraste. Está probado que
falla de verdad: con un rosa elegido a ojo saltan el contraste y el compilado,
sin recompilar salta el compilado, y quitándole el script a una página saltan
dos.

## El CSS va compilado, no por CDN

`css/tailwind.css` lo genera `node herramientas/css-construir.js` (después de
`npm install tailwindcss@3`). Antes el sitio cargaba `cdn.tailwindcss.com`, que
es el modo de juguete de Tailwind: baja unos 400 KB de JavaScript y **compila el
CSS dentro del navegador, en cada carga y de cada visitante** — de ahí el
parpadeo sin estilos al entrar. Compilado, el sitio entero son 50 KB de CSS que
el navegador cachea.

- **La paleta ya no se compila dentro de cada clase: son variables CSS.**
  Estuvo copiada en el `<head>` de las 73 páginas, después vivió en
  `herramientas/css-construir.js`, y hoy vive en `js/temas-plataforma.js` —
  porque dejó de haber UNA paleta y hay una por tema (ver «El tema de toda la
  plataforma»). Lo que el generador le pasa a Tailwind es
  `rgb(var(--c-brand-800) / <alpha-value>)`, y las variables de cada tema se
  escriben al final del archivo compilado.
- `inscripcion.html` lleva su propio `css/tailwind-inscripcion.css`: tiene otro
  diseño y su `brand` es verde, así que los dos no pueden convivir en un mismo
  archivo.
- **Al agregar una clase que no estaba en ninguna parte del sitio, hay que
  volver a compilar**: el compilador solo escribe las clases que encuentra
  leyendo el código. Ese es el riesgo de este cambio, y por eso existe la
  comprobación de abajo.
- Se quitó `cdn.tailwindcss.com` del `script-src` en `_headers`.

### Comprobar que no falte ninguna clase

`node herramientas/verificar-css.js` (con el sitio servido en localhost:8777).
**No lee los archivos**: abre 49 páginas en un navegador de verdad, deja correr
el JavaScript, enciende el modo oscuro y el adaptado, abre los `<details>`,
destapa lo escondido, y recorre el DOM juntando **todas** las clases que
quedaron puestas — unas 14.500. Después comprueba que cada una esté definida en
alguna de las hojas que el navegador cargó.

Es así porque el peligro es justamente el que no se ve leyendo el código: una
clase armada en JavaScript, o que solo aparece después de una interacción,
falta en el CSS y la página se ve mal **sin que nada falle ni avise**.

- Leer el CSS a mano no sirve: los caracteres raros van escapados
  (`grid-rows-[repeat(8,minmax(0,1fr))]` se escribe con `\2c ` en lugar de la
  coma) y Tailwind 3.4 escribe el modo oscuro como
  `.dark\:text-white:is(.dark *)`, con los dos puntos de la variante escapados
  y los de `:is` sin escapar. Por eso las clases conocidas se piden al
  navegador, que ya las tiene interpretadas.
- Las clases que **a propósito** no definen ningún estilo —marcadores de estado
  y ganchos para `querySelectorAll`, como `filter-btn` o `color-opt`— están
  listadas en `SIN_ESTILO`. Si aparece una nueva que no hace nada, va ahí.
  - **Que una clase no tenga CSS no quiere decir que esté muerta.** Los cuatro
    `total-*` de los exámenes de arbitraje parecían restos: no los encuentra
    ningún grep, porque el nombre se **arma concatenando** (`'.total-' +
    n.clave` sobre `NIVELES_EXAMEN`). Son ganchos vivos, y de los que importan:
    cada `<span>` dice cuántas preguntas trae ese examen y el número lo rellena
    el propio banco con `totalPara(techo)`, así que la página no puede prometer
    24 preguntas y armar otra cantidad. Antes de dar una clase por muerta, hay
    que buscarla también por pedazos.
- La primera corrida encontró **huecos de la paleta que ya estaban muertos con
  el CDN**: `bg-accent-50` y `hover:text-accent-300` no pintaban nada porque el
  ámbar solo tenía tres tonos, y a `inscripcion.html` le faltaban `brand-300`,
  `brand-400`, `brand-950` y el ámbar entero. Se agregaron.

## La librería de Supabase tampoco viene de un CDN

Por la misma razón que el CSS, y con más consecuencias: `js/vendor/supabase.js`
está **en el repositorio**, no pedido a jsDelivr. Estaba escrito así en las 77
páginas que lo cargan:

    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

Eso es un **rango**, no una versión, y sin `integrity`. O sea que cada visita
ejecutaba lo que hubiera publicado ahí en ese momento, con la sesión de quien
entrara —un alumno, un profesor, quien administra—, y con acceso al cliente que
guarda el token. No es un peligro teórico: es lo que pasó con polyfill.io en
2024. Y **no habría dado ningún error**: las páginas se seguirían viendo igual
mientras las sesiones se van, que es el fallo callado de siempre pero con todo
el sitio adentro.

- **Vive al lado de Stockfish**, en `js/vendor/`, que ya estaba servido así.
- Se trae con `node herramientas/vendor-supabase.js`, después de
  `npm install @supabase/supabase-js@2`. Queda **byte a byte como viene de
  npm** —sin cabecera de comentario— para que se pueda comparar contra el
  paquete; la versión no se anota aparte porque el bundle la lleva dentro
  (`supabase-js/2.116.0`).
- **jsDelivr sigue en el `script-src` de `_headers`, pero ya solo por la
  transcripción** de `reportes.html`, que importa `@huggingface/transformers`
  desde ahí (fijado a 3.3.3). Si algún día se quita esa función, jsDelivr se va
  de las dos directivas.
- **`js/supabase-client.js` no pisa un `window.sb` que ya exista.** Dos clientes
  en la misma página son dos suscripciones de auth y dos juegos de canales de
  Realtime sobre la misma sesión: no falla, las cosas llegan dos veces. Y de
  paso los verificadores pueden poner el suyo con `addInitScript` sin depender
  —como hasta ahora— de que esa línea **reventara** por no encontrar la
  librería. Eso último no es un detalle: media docena de verificadores pasaban
  gracias a ese accidente, y al traer la librería al repositorio se cayeron
  todos a la vez. `verificar-planes.js` necesitó además su doble en
  `pruebaResumen`, que abría la página a pelo: con el cliente funcionando de
  verdad, `planes.html` hace lo que tiene que hacer —mandar al login sin
  sesión— y se lleva `PlanClase` con ella.

**Al agregar una página que use el cliente, o al actualizar la librería, correr
`node herramientas/verificar-vendor.js`** (no necesita navegador, ni red, ni el
sitio servido). Comprueba que ninguna página la pida a un CDN, que la ruta
relativa de cada una **llegue de verdad al archivo** —`js/vendor/…` escrito
desde `entreno/`, que está un piso abajo, da un 404 que tampoco avisa: la
página se queda en «Comprobando tu sesión…» para siempre—, que toda página que
use `js/supabase-client.js` cargue antes la librería, y que el archivo siga
siendo el de npm sin editar a mano.

## El nombre de un alumno es texto ajeno

`profiles_update_own` deja a cada quien editar su propia fila y el trigger de
identidad revierte `role`, `email`, `is_admin`, `es_coordinador` y el cupo de
invitaciones — **pero no `full_name`**. O sea que el nombre que se ve en toda la
plataforma lo escribe el alumno, y hay que tratarlo como lo que es.

La regla ya estaba escrita para la bitácora y para `renderStudentsList()` —el
nombre va por `textContent`— y `informes.html` no la cumplía: pintaba el nombre
con `innerHTML` en una docena de sitios, dos de ellos **dentro de un atributo**
(el `title=` de una barra y el `aria-label=` del perfil por área), y no tenía
ninguna función de escape a mano. Tenía una, `escVis`, pero declarada dentro del
bloque de visitantes, como si el único texto ajeno de la página fuera el de un
formulario público.

Un `full_name` con una etiqueta adentro se ejecutaba **en la pantalla de su
profesor**, con la sesión del profesor puesta — o la de quien administra, que lo
ve todo: los 90 perfiles, la bitácora, los cobros y las inscripciones con
cédulas y fechas de nacimiento de menores. Y la CSP del sitio lleva
`'unsafe-inline'`, así que no había nada que lo frenara. La página se veía
perfecta.

- `escVis` subió al principio del script, que es donde se ve que es del archivo
  entero, y **escapa también la comilla** por los dos atributos.
- Se escapa **dentro de `barRow()` y `barraHTML()`**, no en cada llamada: las
  dos reciben a veces un título del catálogo (seguro) y a veces un nombre de
  alumno, y acordarse en cada sitio es cuestión de tiempo.
- Lo que **no** se escapa, a propósito, son los nombres de las nueve áreas del
  diagnóstico y los títulos del plan: salen de `js/plan-entrenamiento.js`, o sea
  del repositorio, y escaparlos sería sugerir que algo de eso es ajeno.

**Al tocar `informes.html`, correr `node herramientas/verificar-informes.js`**,
que ahora abre la página con un alumno cuyo nombre ataca las dos formas a la vez
—una etiqueta para el cuerpo, una comilla para el atributo— y mira lo que pasó
DE VERDAD en el navegador: si algo se ejecutó, si nació algún elemento que no
estaba en la página. **Y comprueba que el nombre se siga viendo, literal**:
borrarlo también quitaría el ataque, y dejaría al profesor sin saber de quién es
esa fila. Está probado que falla de verdad: contra el archivo de antes,
`window.__xss` queda puesto y nacen cinco elementos que nadie pintó.


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

## Lo pesado se baja cuando se usa, no al entrar

La portada pesaba **7,9 MB** y tardaba 16 segundos en terminar de cargar con red
de celular. No era el diseño ni el CSS: eran tres archivos del bot que se
bajaban al abrir la página, jugara alguien o no.

- `js/oscar-book.js` traía el libro de aperturas **escrito adentro**: 2,9 MB con
  las 94.106 posiciones de las ~32.400 partidas de Oscar.
- `tablero-board.js` pedía al cargar la **procedencia** de cada jugada
  (`data/oscar-book-provenance.json`, 4,2 MB) — y en `index.html` el panel que
  la muestra **ni existe**: se bajaba entera para tirarla a la basura.
- …y arrancaba el motor Stockfish (587 KB de WASM) con un `preload()`.

Quien entra a leer que hay clases en vivo y se va sin tocar una pieza —que es
la mayoría— se descargaba los tres. Ahora:

- **El libro vive en `data/oscar-book.json`** y lo baja `chess-bot.js` con
  `cargarLibro()`, memoizado, la primera vez que al bot le toca mover. En
  `js/oscar-book.js` solo quedó `OSCAR_ELO_CALIB` (medio kilobyte), que sí hace
  falta enseguida: es con lo que el bot sabe con qué Elo juega en "Difícil".
- **La procedencia se pide cuando el bot juega su primera jugada del libro**,
  que es el primer momento en que el panel tiene algo que decir, y **solo en las
  páginas que tienen el panel**.
- **El motor y el libro se precalientan al tocar el tablero**, no al cargar la
  página. Entre que alguien agarra una pieza y la suelta hay tiempo de sobra,
  así que para quien juega no cambia nada.
- Los scripts del tablero van con `defer`.

Resultado medido en un navegador de verdad, con 4G lenta y el procesador a un
cuarto: **7,9 MB → 0,21 MB**, y el `load` de 16,6 s a 1,6 s.

**Si la descarga del libro falla, no pasa nada, y es a propósito**:
`getBookMoveForHash()` ya devolvía `null` para una posición que el libro no
conoce, así que sin libro el bot juega con el motor — exactamente lo que hacía
antes en cualquier posición fuera del repertorio.

Y ahí está el peligro de todo esto: **nada de esto da error**. Si el libro no
llega, el bot no falla — deja de jugar como Oscar y nadie se entera. Si mañana
algo vuelve a pedir el libro al cargar, tampoco falla nada: la portada vuelve a
pesar 8 MB en silencio. Por eso:

**Al tocar el tablero, el bot o lo que carga, correr `node
herramientas/verificar-carga-tablero.js`** (con el sitio en localhost:8777,
playwright y `npm install chess.js@0.10.3`). Comprueba las dos mitades en un
navegador de verdad: que al CARGAR no se pida ninguno de los tres pesos
pesados y que la portada quepa en 1 MB; y que al JUGAR sí se pidan, que el
libro llegue **completo** (cuenta las posiciones contra el archivo, porque un
JSON truncado o un 404 tampoco darían error) y que el bot conteste.

- **`_headers` le pone un día de caché a los dos archivos de datos.** Cambian
  cuando se regeneran con partidas nuevas, o sea casi nunca, y sin eso quien
  juega un par de partidas se los vuelve a bajar en cada visita. Que queden un
  día viejos no rompe nada — ahí está la diferencia con el CSS, que si queda
  viejo deja la página sin la mitad de sus clases (por eso `sw.js` va a la red
  primero). Un libro viejo es un repertorio de hace unos días.
- **El service worker no los guarda** (`/data/oscar-book` está en `NUNCA`):
  serían 7 MB en el teléfono de quien probó el tablero una vez. Jugar sin red no
  es algo que el sitio prometa.
- `img/oscar-avatar-160.jpg` existe porque el de 480 px se mostraba en casillas
  de 40 y 80 px. El grande se sigue usando donde de verdad se ve grande
  (`sobre-oscar.html`, a 256 px).

## Metadatos: que el enlace se vea y la página se encuentre

Cada página pública lleva su descripción, su `canonical` y su bloque de Open
Graph, todo junto debajo del `<title>`. **Lo del Open Graph no es un detalle
acá**: el botón principal del sitio manda a WhatsApp, o sea que WhatsApp es por
donde se comparte esto, y sin `og:image` el enlace sale pelado.

- `img/og-ajedrez-integral.jpg` (1200×630) es la imagen que se ve al compartir.
  **No se edita a mano**: la genera `herramientas/og-imagen.js` con los colores
  de la paleta, así que si cambian se vuelve a correr (`node
  herramientas/og-imagen.js`, con playwright). Va en JPEG y no en PNG porque es
  un degradado: el mismo dibujo pesa 490 KB en PNG y 91 en JPEG, y WhatsApp
  descarta las previsualizaciones pesadas.
- **Las páginas que piden sesión llevan `noindex`** y no llevan `canonical`: no
  tiene sentido indexar una pantalla de acceso, y así no compiten con las
  públicas. Lo mismo `cursos/academia/`, que es el espejo del catálogo dentro de
  la Academia — si se indexara, competiría con `cursos/` por el mismo contenido.
- El `canonical` apunta a la dirección **con `.html`**, que es la que usan todos
  los enlaces internos. Cloudflare sirve además `/cursos` con el mismo
  contenido; el canonical le dice a Google cuál de las dos vale, sin tocar el
  enrutamiento.
- `sitemap.xml` **no se escribe a mano**: lo arma `herramientas/sitemap.py`
  leyendo qué páginas NO tienen `noindex`. Si una página se abre o se cierra,
  se vuelve a correr y el sitemap se entera solo.
  - **Los que barren `**/*.html` tienen que saltarse `node_modules/`.**
    `sitemap.py` y `verificar-metadatos.py` no lo hacían, y como `node_modules`
    está en `.gitignore` la falla solo aparece en la máquina de quien siguió las
    instrucciones de este mismo archivo y corrió `npm install`: el sitemap salía
    ofreciéndole a Google media docena de páginas internas de playwright, y no
    daba ningún error — quedaban escritas en el archivo y ya. `pwa-cabecera.py`
    y `verificar-voseo.py` ya lo hacían; ahora lo hacen los cuatro.
  - **Las dos listas de páginas exceptuadas de la app tienen que decir lo
    mismo.** `verificar-pwa.js` exceptuaba `libro-de-diagnostico-accesible.html`
    y `pwa-cabecera.py` no, así que el generador le ponía el `manifest` en cada
    corrida y el verificador no se quejaba nunca. Es un documento que se abre
    suelto, hasta por correo y sin red: declarar un `manifest` que no va a poder
    cargar es peor que no declararlo.
- Los datos estructurados (JSON-LD) los genera
  `herramientas/datos-estructurados.py` desde el propio HTML —título,
  descripción, fecha impresa del artículo, lista de cursos de la portada—, así
  que no se pueden desincronizar del contenido. Falta a propósito `offers` y
  `hasCourseInstance` en cada curso (precio, duración, modalidad): sin esos
  datos Google no muestra la ficha enriquecida, y se prefiere el marcado a
  medias antes que inventar números.
- **Todo esto se comprueba de una corrida**, sin instalar nada:
  `python3 herramientas/verificar-metadatos.py` (unos 330 chequeos). **Al tocar
  metadatos, correrlo**, y volver a generar sitemap y datos estructurados.
- Las fuentes: solo se piden los pesos que el sitio usa. Inter en 400, 500, 600
  y 700; **Merriweather solo en 700**, porque `font-serif` aparece 963 veces y
  siempre con `font-bold`, ni una sin peso. Antes se bajaban nueve archivos de
  fuente y se usaban cinco.
- `js/adaptive-mode.js` **sigue sin `defer` a propósito**: aplica la clase
  `adaptive-mode` en el `<html>` al ejecutarse, igual que el script del tema que
  está justo arriba. Con `defer` correría después de parsear el HTML y quien
  tiene el modo adaptado encendido vería un parpadeo con la página sin adaptar.

## El encabezado ocupa su propio espacio

El encabezado del sitio es `sticky top-0`, **no `fixed`**, y esa es la razón por
la que ninguna página tiene que compensar su altura a mano. Antes era `fixed` y
cada página descontaba esa altura por su cuenta: `pt-16 md:pt-20` en el `<main>`,
un `<div class="hidden lg:block h-8">` suelto, `pt-28` en los artículos, `pt-32`
en las pantallas de carga, `pt-20 min-h-screen` en las de acceso. Seis maneras
distintas de escribir el mismo número.

El problema es que la altura real cambia de cuatro formas —en `md`, en `lg`
cuando aparece la barra de arriba, al hacer scroll (`#header.scrolled` la baja a
3.5rem) y en modo adaptado, que sube la tipografía a 112%—, y ninguno de esos
números escritos a mano se entera. Con `sticky` el encabezado está en el flujo:
ocupa su espacio solo, se pega al hacer scroll y no hay nada que descontar.

- **Regla: si te encontrás compensando a mano una altura que el navegador ya
  sabe calcular, es que hay que dejarlo calcular.**
- `html { scroll-padding-top }` en `css/styles.css` es lo que hace que saltar a
  un ancla no deje el destino debajo de la barra — incluye el propio "Saltar al
  contenido principal". Sin eso, `scroll-behavior: smooth` lleva el destino
  exactamente a donde la barra lo tapa.
- Las alturas del encabezado son `min-h-*`, nunca `h-*`: con altura fija, en
  modo adaptado el contenido se sale de la caja en vez de empujarla.
- Lo que quiere ocupar la pantalla entera resta la barra en vez de sumarle
  padding: `min-h-[calc(100vh-5rem)]`, no `pt-20 min-h-screen` (que daba una
  página más alta que la pantalla).

## Dentro de la Academia no hay encabezado de marketing

Decisión: quien ya inició sesión no vuelve a ver el encabezado ni el pie del
sitio público. Hasta este cambio los compartían las 76 páginas del sitio por
igual — la portada, un artículo, **y también** el panel de Clases, un
ejercicio de Entrenamiento o la partida en vivo con el profesor: Inicio,
Cursos, Artículos, Jugar contra el profe, el botón "💬 Inscríbete" (que invita
a inscribirse a quien ya está inscrito) y la barra de arriba con "🏆 ¡Te
reto!" y "TV en vivo". Nada de eso rompía nada — es exactamente la clase de
falla que no truena: un alumno resolviendo un ejercicio o mirando su registro
de clases tenía ahí arriba seis destinos que no tienen nada que ver con lo
que estaba haciendo, y de ahí a irse por donde no corresponde hay un clic.

- **El criterio es "exige sesión", no la carpeta ni el nombre.** Una página
  cae en esto si redirige a `login.html` sin sesión (`location.href =
  "login.html"`) o si la pide con `requireLoginThenGate()`. Por eso
  `entreno/diagnostico.html` y `nivel-de-arbitraje.html` **quedan afuera** a
  propósito: se pueden hacer sin cuenta, están pensadas para llegar desde un
  buscador, y ahí el encabezado público —con su enlace a "Cursos" y su
  "Inscríbete"— es lo que corresponde mostrarle a quien todavía no es alumno.
  `cobros.html` **sí** entra aunque no redirija (muestra un aviso de "inicia
  sesión" en vez de mandar a otra página): es una página que solo tiene
  sentido con cuenta, igual que el resto.
- **Aplica a todo el mundo con sesión, profesor y administración incluidos.**
  No es una regla solo para alumnos: dentro de la Academia nadie necesita el
  menú de marketing, y tenerlo iba a la deriva por página según quién la
  escribió — algunas ya traían un encabezado reducido a mano (`entreno/*` sin
  "Cursos" ni la barra de arriba), otras el completo. Ahora es una sola forma.
- **El encabezado queda en dos elementos: el logo y el interruptor de
  tema.** El logo lleva de vuelta a `clases.html` (el panel, no `index.html`)
  — es la puerta de salida de cualquier página de la Academia, con un
  `sr-only` ("— panel de la Academia") para quien no lo intuye por el nombre.
  Sin menú no hace falta el botón de hamburguesa ni el `#mobile-menu`:
  `js/main.js` ya los busca con `if (menuToggle && mobileMenu)` antes de
  engancharlos, así que su ausencia no rompe nada.
- **El pie queda en una sola línea** (`&copy; 2026 Ajedrez Integral…`), la
  misma que ya traían de antes los `entreno/*` y algunas páginas de
  `cursos/academia/`: se pareja el resto en vez de inventar una tercera
  forma.
- **`herramientas/academia-cabecera.py`** hace el cambio y se puede correr
  todas las veces que se quiera: reemplaza el único
  `<header id="header">…</header>` y el único `<footer>…</footer>` de cada
  página de su lista, así que una corrida encima de otra da lo mismo. **Al
  agregar una página nueva que exige sesión, sumarla a la lista `PAGINAS` del
  script y correrlo** — copiar el encabezado de otra página de la Academia a
  mano es exactamente como esas 76 páginas terminaron todas con el mismo
  encabezado de marketing.
- Las páginas públicas (`index.html`, `cursos.html`, `cursos/<curso>.html`,
  `tv.html`, `te-reto.html`, `bot.html`, `tablero.html`, los dos
  diagnósticos públicos, etc.) **no se tocan**: siguen con el encabezado y el
  pie completos, porque ahí sí hace falta poder llegar a cualquier parte del
  sitio y la invitación a inscribirse tiene sentido.

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

## Cómo se escribe en el sitio

El español del sitio es el de acá: latinoamericano, costarricense. Se tutea
—**tuteo, no voseo**: "puedes", no "podés"; "juega", no "jugá"— y tampoco
"vosotros". Se dice computadora y celular (no ordenador ni móvil), y los
términos de ajedrez van en el nombre que se usa en la región —horquilla,
enfilada, clavada, mate de la coz, mate del pasillo—, con el término en inglés
entre paréntesis solo cuando es el que el alumno va a encontrar buscando en
internet (zwischenzug, smothered mate). Nada de traducciones calcadas del
inglés ni de giros peninsulares.

**`python3 herramientas/verificar-voseo.py` revisa que no se cuele voseo** y
falla si encuentra; con `--arreglar` lo convierte. Al escribir texto nuevo o
importar contenido, correrlo. Con el contenido de septiembre entraron unas
1.900 formas de voseo y se colaron hasta dentro de los datos estructurados que
lee Google.

- **No es quitar la tilde**: el imperativo de tuteo cambia la raíz en muchos
  verbos ("pensá" es *piensa*, "jugá" es *juega*, "hacé" es *haz*, "volvé" es
  *vuelve*, "elegí" es *elige*), y con el pronombre pegado pasa al revés — el
  voseo no lleva tilde ("dejalo") y el tuteo sí ("déjalo"). Por eso la
  conversión es una tabla escrita verbo por verbo dentro del script, no una
  regla.
- **La tabla se completa cuando algo se escapa.** «Agregá» no estaba y llevaba
  meses dentro de `informes.html` sin que el verificador dijera nada: al
  corregir el texto se sumó el verbo, o el siguiente entra por la misma puerta.
- Lo que **no** es voseo y por eso está en la lista blanca: los futuros
  ("quedará", "tendrás", "podrá"), los pretéritos de primera persona
  ("empecé", "aprendí", "entendí", "tomé") y los nombres propios ("Elistá",
  "Andrés", "Valdés"). Si aparece una palabra nueva que el script marca mal,
  se agrega ahí.
- "vos" se resuelve por contexto: con preposición delante es *ti* ("un lugar
  para ti"), si no es *tú* ("busca tú mismo").
- **El barrido mira también las Edge Functions** (`supabase/functions/**/*.ts`),
  no solo el HTML, el JS y el CSS. Esos archivos escriben **correo que sale a
  las familias**, o sea el texto del sitio que menos se revisa y el único que no
  se puede corregir después de mandado: el correo de invitación de
  `admin-manage-users` decía «elegí un plan» y ahí lleva desde que se escribió,
  porque esa función vivía solo desplegada y el verificador solo leía el sitio.

  **`admin-manage-users` entró al repositorio por eso**, bajada tal cual del
  despliegue y sin tocarle nada más que esa palabra. Antes cambiarle una línea
  era bajarla, editarla a ciegas y volver a subirla —la misma decisión que ya se
  había tomado con `cobros-recordatorios` e `informes-encargados`—. **Está
  pendiente de desplegar**: hasta que se suba (`node
  herramientas/funciones-armar.js` y el despliegue), el correo que reciben las
  familias sigue diciendo «elegí». Nada más de esa función cambió, así que
  desplegarla no arrastra ningún otro cambio.

### Y las respuestas de Claude también van en español

**Todo lo que Claude escriba en la conversación va en español**, no solo el
texto que termina en el sitio: las explicaciones, los resúmenes de lo que hizo,
las preguntas, los mensajes de commit y los cuerpos de los PR. El dueño del
repositorio trabaja en español y contestarle en inglés lo obliga a traducir
mentalmente cada respuesta.

Y va con **el mismo español de arriba** —tuteo, latinoamericano, sin voseo y sin
giros peninsulares— por una razón práctica, no de estilo: buena parte de lo que
se escribe en la conversación termina copiado dentro del sitio (un aviso, el
texto de un botón, la descripción de una lección). Si en el chat se escribe
"podés" y en el sitio "puedes", el voseo entra por esa puerta — que es
exactamente por donde entraron las 1.900 formas de septiembre.

Los nombres de archivo, las clases de CSS, los identificadores y los comandos
se quedan como están: son código, no texto.

## El punto de restauración: la base no vivía en ninguna parte

`RESTAURAR.md` es el documento operativo —qué hacer si algo falla— y esto es
por qué existe. El sitio siempre estuvo respaldado: es un repositorio de git,
se vuelve atrás con una etiqueta. Lo que no estaba respaldado era **todo lo
demás**, y no daba ningún error porque la plataforma funcionaba igual.

- **Las 179 migraciones de la Academia vivían SOLO en Supabase.** Ahí están las
  62 tablas, las 110 funciones, las 176 políticas de RLS y los 20 triggers: o
  sea, quién ve a quién, quién puede escribir qué y todas las decisiones que
  este archivo explica. Si ese proyecto se perdiera o alguien borrara de más,
  no había de dónde reconstruirlo. Ahora están en `supabase/migraciones/`
  (y las 5 del proyecto de inscripciones en `supabase/migraciones-colegios/`),
  bajadas de `supabase_migrations.schema_migrations` **y comprobadas una por
  una con su md5**: una migración transcrita a medias se ve igual de bien que
  una entera, y la diferencia solo aparece el día que hay que restaurar.
- **Cinco Edge Functions estaban desplegadas y no estaban en el repositorio**:
  `notificar` (el VAPID y el cifrado `aes128gcm` escritos a mano, o sea lo más
  difícil de rehacer de todo el sitio), `chess-results-proxy`, `ocr-scoresheet`,
  `enviar-resultado-arbitraje` y `bootstrap-admin`. Es el mismo agujero que ya
  se había tapado de a una con `cobros-recordatorios`, `informes-encargados` y
  `admin-manage-users`; ahora están las 14.
- **El retrato del esquema** (`supabase/esquema/`) no restaura nada: sirve para
  comprobar, DESPUÉS de restaurar, que no falte ninguna política ni ningún
  trigger. Un esquema al que le falta una política se ve perfecto y deja
  abierto —o cerrado— algo que no era.

### Lo que sigue sin red, y es lo caro

**Los datos de la gente no están respaldados en ninguna parte.** El esquema se
reconstruye en minutos; los 105 perfiles, las 3.976 filas de progreso, los 80
encargados a los que llegan los informes y los 53 planes de clase, no. Y la
organización de Supabase está en el plan **gratuito**, que no hace copias
automáticas de la base — igual que no deja encender la protección contra
contraseñas filtradas, que este archivo ya tenía anotada por lo mismo.

`herramientas/respaldo-datos.sh` es la salida mientras tanto: `pg_dump` con la
cadena de conexión por variable de entorno (nunca escrita en el repositorio) y
la salida en `respaldos/`, que está en `.gitignore` **y** en `.assetsignore`.
Los dos candados son para el mismo descuido: ahí adentro van cédulas y correos
de menores, de git no se borra nada, y el despliegue sube la carpeta de
trabajo, no lo que hay en git.

- **`.assetsignore` ahora excluye `supabase/` entero.** El worker sirve TODO el
  directorio, así que lo que no se excluya queda publicado: las migraciones son
  el modelo de permisos completo, y publicarlas es regalarle a cualquiera el
  mapa de por dónde buscarle la vuelta. Ninguna página las pide.
- **Un respaldo que depende de que alguien se acuerde de correrlo, tarde o
  temprano no se corre.** La salida de verdad es el plan Pro, con sus copias
  diarias. Queda escrito acá porque un pendiente que solo vive en la cabeza de
  alguien no existe.

### Al aplicar una migración o desplegar una función, actualizar el respaldo

**Correr `node herramientas/verificar-punto-restauracion.js`** (no necesita
red, ni navegador, ni el sitio servido). Comprueba que no falte ninguna pieza
—las migraciones, las 14 funciones con su código, los inventarios, los cuatro
archivos de Cloudflare— e imprime la **huella** md5 de las migraciones, que se
compara contra la base con la consulta que el propio script deja escrita. Si no
coincide, hay migraciones aplicadas que no están respaldadas. Está probado que
falla de verdad: quitando una migración y una función, saltan las dos.

Un respaldo a medias no da ningún error —la carpeta está, los archivos se
ven— y eso solo se descubre en el peor momento posible.

- **El archivo respaldado es lo que se APLICÓ, byte a byte, y no una versión
  mejor comentada.** Ya pasó una vez: una tanda aplicó su migración sin el
  encabezado de comentarios y después guardó el archivo CON él. El respaldo se
  lee mejor y la huella deja de cuadrar, así que a partir de ahí el verificador
  no puede distinguir «hay algo sin respaldar» de «alguien le agregó una línea
  al archivo». El porqué va en este archivo, que es donde se lee; la migración
  guarda lo que corrió. (Y el md5 se calcula sobre el archivo tal cual, así que
  tampoco lleva el salto de línea final si lo guardado no lo trae.)

**Pendiente de desplegar:** `ocr-scoresheet` se bajó tal cual estaba y traía
tres formas de voseo («Avisá al profesor», «Probá con una foto»). Se
corrigieron en el repositorio, así que hasta que se vuelva a desplegar, lo que
el alumno ve en pantalla sigue diciendo lo de antes. Es el mismo caso que
`admin-manage-users` con su «elegí un plan».

### La etiqueta del punto de restauración se pone a mano

`RESTAURAR.md` nombra el **commit** del estado bueno, no una etiqueta, y es a
propósito: las credenciales de una sesión de Claude Code en la web empujan
ramas pero reciben un **403 con `refs/tags`**, así que la etiqueta no se crea
sola por más que el commit sí quede en `main`. Un documento que mandara a
`git checkout restauracion-…` con esa etiqueta sin existir sería justo el fallo
callado de siempre: se lee bien, y el día que hace falta no está.

El comando queda escrito en `RESTAURAR.md` para correrlo desde una máquina con
permiso de escribir etiquetas.
