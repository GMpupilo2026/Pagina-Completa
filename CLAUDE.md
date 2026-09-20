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

## Tareas: el profesor asigna material con fecha límite

`tareas.html` es de dos públicos, como `informes.html`: quien es profesor (o
administra) elige material de la plataforma y se lo manda a uno o varios de
sus alumnos con instrucciones y una fecha de vencimiento; el alumno ve lo que
le mandaron y marca cuándo lo hizo. No es un curso nuevo ni un tipo de
contenido nuevo — es una capa fina que apunta a lo que ya existe.

- **El material no se copia, se referencia.** `js/material-plataforma.js`
  arma el catálogo: los CURSOS salen leyendo
  `herramientas/cursos/catalogo.json` en tiempo real (la misma fuente que
  arma las tarjetas de `cursos.html`), y las HERRAMIENTAS de entrenamiento
  están escritas a mano —las mismas ocho fichas de `entreno/index.html` más
  los dos diagnósticos— porque no tienen un JSON propio del que leerlas. Una
  segunda lista de cursos se habría ido separando de la primera a la primera
  corrección, que es el error que este repositorio ya cometió más de una vez.
- **La fila de `tareas` guarda una FOTO del material**, no solo su id
  (`material_tipo`, `material_slug`, `material_label`, `material_href`): si
  mañana se renombra un curso o se reordena el catálogo, una tarea ya enviada
  sigue diciendo con qué se mandó, en vez de quedar apuntando a un enlace que
  cambió de nombre bajo los pies del alumno.
- **La lección es un número, no un enlace.** Las lecciones de un curso viven
  todas en la misma página, como `<details>` sin id propio (ver "El material
  de estudio de cada lección"), así que no hay a dónde enlazar una lección
  suelta. El campo `leccion` es opcional y solo se le muestra al alumno como
  texto ("→ Fundamentos del Ajedrez, lección 3"): encuentra la lección
  buscando ese número dentro de la página, el enlace lo lleva al curso
  completo.
- **Aislado por profesor, igual que `class_sessions` y `game_state`.** Un
  profesor solo ve las tareas que ÉL mandó, no las de un colega que comparte
  el mismo alumno — la política de `select` es `profesor_id = auth.uid() or
  alumno_id = auth.uid() or is_admin`, sin ningún `es_mi_profesor()` de por
  medio. Es la misma decisión de aislamiento que ya toma el resto del sitio
  para "cada profesor su propia clase", no un descuido.
- **El insert exige `profesor_id = auth.uid()` SIEMPRE, `is_admin` incluido.**
  La primera versión de la política dejaba pasar cualquier `profesor_id`
  cuando quien inserta administra, así que en teoría alguien con `is_admin`
  podía mandar una tarea a nombre de OTRO profesor. Se corrigió antes de
  mergear: ningún otro insert del sitio deja eso suelto
  (`class_sessions_insert` exige `created_by = auth.uid()` sin excepción).
- **El alumno solo puede marcar y desmarcar que la hizo.** Puede "actualizar"
  su propia fila (para eso existe `tareas_update`), pero un trigger
  (`proteger_tareas_alumno`, mismo patrón que `protect_answer_grading`) le
  revierte cualquier otro campo a su valor de antes si quien edita es el
  alumno y no el profesor dueño — no puede correrse la fecha, cambiarse el
  título ni reescribir las instrucciones. Comprobado impersonando roles en
  SQL: un update del alumno con `titulo` y `vence_at` distintos deja esas dos
  columnas intactas y solo `estado`/`completada_at` cambian; un profesor sin
  ese alumno asignado recibe 0 filas al intentar leer la tarea de otro.
- **El aviso push sale solo**, con el mismo patrón que un reto o que abrir la
  sesión en vivo: un trigger `AFTER INSERT` (`avisar_tarea_asignada`) llama a
  `avisar_push()`, así que no hay que acordarse de mandarlo desde el
  navegador ni puede quedar la tarea guardada sin avisar.
- **`estado` solo vale `pendiente` o `completada`**, nunca "vencida" — igual
  que `cobros.estado`, que tampoco guarda "vencido". Si lo fuera, habría que
  mantenerlo al día con un cron que revisara fechas, y podría contradecir a
  `vence_at`. La página calcula "vencida" comparando `vence_at` contra
  `new Date()` en el navegador, nada más que para pintarla distinto.

**Al tocar `tareas.html`, `js/material-plataforma.js` o la tabla `tareas`,
correr `node herramientas/verificar-tareas.js`** (con el sitio en
localhost:8777 y playwright). Existe porque `tareas.html` está detrás del
login: `verificar-css.js` no la ve nunca. Comprueba, con un Supabase de
mentira, que el selector de material traiga cursos Y herramientas de
verdad, que elegir un curso destape el campo de lección con su tope
correcto, que enviar la tarea mande una fila POR CADA alumno marcado con el
material que de verdad se eligió (no el que había antes), que al alumno le
salgan sus tareas ordenadas por fecha con la vencida marcada, y que tildar
"Hecha" mande el update al id correcto. Lo que se rompe acá no da error: un
select que manda el material equivocado, o una tarea que se le manda a
todos los alumnos en vez de a los marcados.

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
  las políticas nuevas.

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
  manda el armador a guardar, qué enlace copia **con `.html` y sin él**, qué
  manda el formulario público al contestar y el alta de abajo — qué dedujo de
  cada etiqueta, qué sale puesto en el diálogo y qué cuerpo se manda de verdad.

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

- Tres avisos: **tres días antes** de vencer, **al día siguiente** del
  vencimiento y **a los 15 días**. Van a los encargados apuntados en Informes y
  a la propia cuenta del alumno.
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

`entreno/aperturas.html` es un banco de 37 líneas —12 celadas y 25 aperturas—
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
  jugada exista de verdad en su posición** —431 jugadas—, que el mate prometido
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

### `entreno/estudio.html`: las mismas líneas, para leer y no para jugar

Es su propia página, con acceso propio en el panel de la Academia (`clases.html`
→ grupo "Aprender" → **"📚 Estudio"**) — **no** una pestaña dentro de
`entreno/aprender.html`. Se probó primero ahí adentro y se sacó: mezclaba dos
cosas de naturaleza distinta bajo un mismo encabezado —las lecciones de Aprende
se resuelven una a una, esto se lee de punta a punta cuando se quiera— y como
acceso propio se puede asignar en Tareas (`js/material-plataforma.js`) sin
mandar a media página de Aprende a buscarlo.

**Tarjetas de las 25 líneas de tipo "apertura"** del banco de
`js/aperturas-lineas.js` (las 12 celadas quedan fuera: son trucos puntuales, no
repertorio), repartidas en **dos pestañas —"Aperturas" y "Defensas"— y dentro
de cada una agrupadas** por a qué apertura o defensa pertenecen —"Apertura
española" con sus dos variantes, "Defensa india" con sus cuatro— para que el
alumno la **lea y la memorice**, en vez de tener que jugarla a ciegas contra el
entrenador desde la primera vez que la ve.

- **Es la misma fuente de datos, no una copia.** La página lee
  `js/aperturas-lineas.js` directo (`ESTUDIO_LINEAS`, filtrando `tipo ===
  "apertura"`): sumar una línea ahí la suma acá sola. Si se copiaran las
  líneas, corregirle una jugada en un lado y no en el otro es el error que
  separa las dos copias sin que nada avise.
- **La pestaña la decide `L.color`, no el nombre de la familia.** "Aperturas"
  son las 9 líneas que el alumno juega con blancas y "Defensas" las 16 que
  juega con negras — no "lo que empieza con 1.e4" contra "lo que responde".
  Por nombre se rompe: "Siciliana cerrada" es 1.e4 c5 2.Cc3 **jugado por las
  blancas**, así que por el nombre de su familia ("Defensa siciliana")
  terminaría en Defensas, cuando lo que el alumno memoriza ahí es el plan de
  las blancas. Mismo caso con "Francesa Tarrasch". Agrupar por color, no por
  familia, es lo que mantiene la promesa de cada pestaña: "esto lo juegas tú".
  9 + 16 = 25, así que ninguna línea se pierde ni se cuenta dos veces.
- **No es un ejercicio, es un libro: por eso no hay bloqueo ni "resuelto".**
  Las 25 están abiertas de entrada, porque no hay nada que "resolver" — se
  lee, con un tablero que solo recorre la línea (⏮ ◀ ▶ ⏭ o saltando a una
  jugada de la lista con un clic), no que reciba jugadas.
- **El tablero es decorativo (`aria-hidden`) y no hace falta un Modo Adaptado
  aparte.** La posición y la línea entera ya están contadas en texto al lado
  —la lista de jugadas, "Idea" y "Lo que hay que recordar"—, así que no
  depende de ver ninguna imagen: es la misma decisión que el material de
  estudio de los cursos. Cada salto de jugada avisa por una región viva chica
  ("Jugada 3 de 8: 2.Cf3") en vez de releer todo el texto de arriba.
- **El botón "🎯 Practicarla jugándola en el tablero" no manda a la lista de
  `entreno/aperturas.html`: manda directo a esa línea**, con
  `aperturas.html?linea=<id>` (deep-link nuevo en esa página). Sin él, quien
  lee la tarjeta y quiere practicarla tendría que volver a encontrarla en una
  lista de 25 — el mismo trabajo que la tarjeta viene a evitar. Un id que no
  existe (línea borrada) cae a la lista de siempre en vez de dejar un tablero
  de mentira.
- **No lleva marca de progreso ni clave en `js/progreso-usuario.js` a
  propósito.** No hay nada que sincronizar entre aparatos porque no hay ningún
  "resuelto" que guardar — la memorización de verdad, con su repaso espaciado,
  sigue viviendo en `entreno/aperturas.html`. Por lo mismo, tampoco carga
  `js/acceso-admin.js`, `js/blind-notation.js` ni `js/board-drag.js`: no hay
  bloqueo que abrirle a quien administra ni tablero que reciba jugadas.
- El tiempo sí se registra, como en toda página de Entreno:
  `js/tiempo-plataforma.js data-activity="estudio"`.
- **Al tocar esto, correr `node herramientas/verificar-estudio.js`** (con el
  sitio en localhost:8777, playwright y `npm install chess.js@0.10.3`).
  Comprueba en un navegador de verdad que las dos pestañas existen con su
  contador correcto (9 y 16), que arranca en "Aperturas" y que hacer clic en
  "Defensas" repinta la lista con sus 16 líneas agrupadas, el caso de
  "Siciliana cerrada" (aparece en Aperturas y desaparece de Defensas al
  cambiar), que nada queda con candado, que el tablero de la tarjeta dibuja de
  verdad —pieza por pieza, contra chess.js— la posición que toca en cada
  jugada y no solo que la resalta en la lista, que el botón de practicarla
  apunta al id correcto, y que `aperturas.html?linea=<id>` abre esa línea de
  una sin pasar por la lista (y que un id inventado cae a la lista, no a un
  tablero vacío). **Al tocar el panel o esta página, correr también `node
  herramientas/verificar-panel.js`**, que comprueba que "Estudio" esté en el
  grupo "Aprender".

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

En `clases.html` el diagnóstico tiene **tarjeta propia** en el grupo "Aprender".
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
  devuelve otro adaptador con la jugada hecha) y `material()`—. Tres niveles:
  al azar con gusto por las capturas, una jugada mirando la respuesta, y dos
  jugadas con poda alfa-beta. Está comprobado que el nivel 3 termina con ventaja
  sobre el nivel 1.
- No usa Stockfish a propósito: solo sabría jugar el ajedrez normal, y acá vale
  más un rival que entienda abrazos, camaleón y crazyhouse.
- **A ciegas lleva su propio adaptador**: su motor delega en chess.js y no tiene
  `allMoves()` como abrazos y camaleón. La jugada escrita pasa por
  `moveText()`, que entiende español, inglés y coordenadas.
- **Faltan dos modalidades**, por razones distintas: Ajedrez de Cartas monta su
  tablero desde un estado serializado (`loadState`) que hoy solo arma la página
  de partida, y Duelo Simultáneo no tiene turnos —los dos mueven a la vez contra
  reloj—, así que no hay "turno del bot" que atender y pide otro diseño.

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
- **Solo se ve y se puede retar a gente de la propia clase.** La regla es
  `public.pueden_jugar_entre_si(a, b)` (`SECURITY DEFINER`): mismo profesor, o
  alumno con su propio profesor, o alguien que administra. La página filtra la
  lista con la misma regla, pero solo para no mostrar botones que van a fallar
  — quien manda es la política de la base.
- **Aceptar no crea la partida con un insert**: un alumno no puede insertar en
  `game_rooms` (esa política sigue exigiendo profesor, y así se queda). La crea
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
  tampoco. Un alumno al que todavía no le asignaron profesor no ve a nadie:
  la lista le ofrece el bot de Oscar mientras tanto.
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

- **"Sesión en vivo" va sola y de primera**, en su propio grupo ("Clase en
  vivo") y con `destacado: true`, que la pinta ancha y en una línea. Es lo único
  del panel que pasa AHORA MISMO; mezclada entre Juegos y Torneos había que
  buscarla justo cuando hay clase. Un grupo de un solo acceso pintado con la
  grilla de cuatro columnas sería un cuadrito perdido a la izquierda, que es
  peor que no destacarlo.
- **"Evaluaciones" es un grupo aparte de "Aprender"**: lo que MIDE el nivel de
  quien lo hace no es lo mismo que lo que lo enseña. Ahí viven los dos
  diagnósticos y ahí va a vivir "Exámenes" cuando exista.
- **Los dos diagnósticos son para todo el mundo**, el de arbitraje incluido:
  cualquiera puede medir su nivel de reglamento, no solo quien da clase. Lo que
  cambia según quién mira es **a dónde lleva la tarjeta**, y es UNA sola tarjeta
  (repetir el nombre en el panel ya salió mal una vez, con "Torneos"):
  - equipo docente → `arbitraje.html`, que además trae la revisión de los
    exámenes del público y el detalle pregunta por pregunta;
  - todos los demás → `nivel-de-arbitraje.html`, el mismo examen y el mismo
    criterio pero **sin enseñar las respuestas al terminar**. El banco es un
    archivo estático y quien sepa mirar el código las ve igual; lo que se evita
    es regalárselas en pantalla.
  Esa página es la pública, así que pide nombre y correo — pero **se rellenan
  solos cuando hay sesión**: a quien entra desde el panel el sitio ya se los
  sabe, y hacerle escribir lo que ya escribió no tiene sentido. Lo que ya venía
  escrito a mano no se toca.
- **Un acceso apagado no es un enlace gris.** `renderTileCard()` le pone un
  `<div>` con `aria-disabled`, sin `href`: no recibe el foco del teclado ni
  promete un destino que no va a abrir. Y lleva escrito POR QUÉ está apagado
  ("En mantenimiento", "Próximamente") en la propia tarjeta — un cuadro gris sin
  explicación se lee como una página rota.
- **Lo de mantenimiento se apaga SOLO para el alumnado**, en
  `apagarEnMantenimiento()`, sobre la lista ya armada y en un solo lugar. Se
  marca con `mantenimientoAlumno: true` en el tile, así que volver a prender un
  acceso es borrar esa palabra. Como todo filtro del sitio esto decide qué se
  PINTA: la dirección sigue existiendo y quien la conozca entra igual.

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
`reemplazar`).

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

## El CSS va compilado, no por CDN

`css/tailwind.css` lo genera `node herramientas/css-construir.js` (después de
`npm install tailwindcss@3`). Antes el sitio cargaba `cdn.tailwindcss.com`, que
es el modo de juguete de Tailwind: baja unos 400 KB de JavaScript y **compila el
CSS dentro del navegador, en cada carga y de cada visitante** — de ahí el
parpadeo sin estilos al entrar. Compilado, el sitio entero son 50 KB de CSS que
el navegador cachea.

- **La paleta vive en `herramientas/css-construir.js`**, no en el `<head>`.
  Antes estaba copiada en las 73 páginas, en dos formatos distintos.
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
- La primera corrida encontró **huecos de la paleta que ya estaban muertos con
  el CDN**: `bg-accent-50` y `hover:text-accent-300` no pintaban nada porque el
  ámbar solo tenía tres tonos, y a `inscripcion.html` le faltaban `brand-300`,
  `brand-400`, `brand-950` y el ámbar entero. Se agregaron.

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
- Lo que **no** es voseo y por eso está en la lista blanca: los futuros
  ("quedará", "tendrás", "podrá"), los pretéritos de primera persona
  ("empecé", "aprendí", "entendí", "tomé") y los nombres propios ("Elistá",
  "Andrés", "Valdés"). Si aparece una palabra nueva que el script marca mal,
  se agrega ahí.
- "vos" se resuelve por contexto: con preposición delante es *ti* ("un lugar
  para ti"), si no es *tú* ("busca tú mismo").

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
