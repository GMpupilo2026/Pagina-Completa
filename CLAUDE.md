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
- **Al tocar esto, correr `node herramientas/verificar-formularios.js`** (con el
  sitio en localhost:8777 y playwright). Comprueba en un navegador de verdad qué
  manda el armador a guardar y qué manda el formulario público al contestar.

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

El enlazador **se puede correr todas las veces que se quiera**: reconoce lo que
puso una corrida anterior por las marcas `<!-- material: inicio -->` y lo
reemplaza en vez de duplicarlo. Eso importa porque el nombre del archivo sale
del título de la lección: corregirle una tilde a un título dejaría el enlace
viejo apuntando a un archivo que ya no existe.

`herramientas/lib/tablero-svg.js` dibuja los diagramas y lo comparten este
generador y el de las tarjetas de `cursos.html`: una segunda copia de los mismos
dibujos se iría separando de la primera a la primera corrección.

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
  formas distintas en el mismo grupo. **Es material docente**: trae las
  respuestas y la hoja de corrección, así que lleva marca de agua ("Ajedrez
  Integral · uso docente", repetida en todas las páginas) y el enlace para
  descargarlo solo aparece con perfil de profesor o de administración —en
  `entreno/diagnostico.html` lo muestra `mostrarPdfSiEsDocente()` y en
  `informes.html` vive dentro del bloque que solo ven ellos. Como todo en el
  sitio, el filtro es del navegador: el archivo sigue estando en la raíz, así
  que quien conozca la dirección exacta puede bajarlo igual (la marca de agua
  es justamente para eso). Cerrar esa puerta del todo pediría servir el PDF
  desde Supabase Storage con RLS.

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

## Coordenadas en los tableros

`js/coordenadas-tablero.js` rotula cualquier tablero: la letra de columna en la
fila de abajo y el número de fila en la columna izquierda, dentro de las casillas
del borde (no cambia la maqueta). Está en todos los tableros de ejercicios:
Aprende, 4×4, Mates, Táctica, Ejercicios por tema, Practicar, Desafíos, el
diagnóstico, Concentración, Racha táctica y ¡Te reto!

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
