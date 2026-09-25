# Cuentas, altas y formularios

Notas de diseño para Claude, sacadas del CLAUDE.md de la raíz: coordinación, formularios de inscripción, el alumno sin correo y la invitación.
El índice de todos los temas y las reglas que valen para todo el sitio
están en `CLAUDE.md`.

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

### Archivos adjuntos: se suben, se ven y se descargan

Los formularios que arma la coordinación (`formulario.html`) reciben archivos
—la foto de la cédula, el carné del colegio, un comprobante en PDF—. El del
torneo en línea (`inscripcion.html`) también los recibía, **y se le quitó**:
no hacían falta (ver «El torneo en línea» abajo). Hasta 5 por
pregunta: foto, PDF, Word o Excel, de 10 MB como máximo. Lo difícil no es el
`<input type="file">`, es que quien sube **no tiene cuenta** y lo que sube son
documentos de menores.

**`js/adjuntos.js` es la única copia** de cómo se elige, se prepara, se sube y
se enseña un archivo, y lo usan las pantallas que reciben (`formulario.html`) y
las dos que muestran (`formularios.html`, `inscripciones.html`). Escrito cuatro
veces, una aceptaría un `.docx` que la otra no sabe enseñar.

- **La ruta es `<carpeta>/<id al azar>/<nombre-saneado>.<ext>`**: el nombre
  original viaja DENTRO de la ruta, así que no hay que guardarlo aparte y quien
  descarga recibe «Comprobante-SINPE.pdf» y no un uuid.
- **La foto se achica en el navegador** (1600 px, JPEG): la del celular pesa
  4-8 MB, y así sale en un formato que abre cualquiera. Un documento va tal cual.
- **Se sube al ENVIAR**, no al elegirlo —un archivo descartado no queda subido
  por nada— y la ruta se recuerda, así reintentar un envío que falló (una cédula
  ya inscrita, por ejemplo) no lo vuelve a subir.
- **Un formato que no se recibe se dice ANTES**, con el nombre del archivo. El
  bucket lo rechazaría igual, pero con un error en inglés que nadie entiende.
- **Se enseñan como `blob:`**, que es lo que la CSP ya deja pintar: una URL de
  Supabase en un `<img>` la bloquearía `img-src`. Cada archivo trae «Abrir» y
  «⬇ Descargar», y el nombre de descarga dice **de quién es** (el alumno, la
  pregunta y el nombre original). Uno que no se pudo bajar **lo dice**.
- En el CSV se **cuentan** («2 archivos adjuntos»), no se pega la ruta.

#### Los formularios de la coordinación (proyecto de la Academia)

Tipos de pregunta «Imagen (foto)» y «Archivo (PDF, Word, Excel o foto)».

- **El bucket `formulario-adjuntos` es PRIVADO**, con tope y tipos puestos en
  el propio bucket. Una URL pública sería repartir la cédula de un niño a
  cualquiera que tenga el enlace.
- **Subir (anon) lo decide `formulario_acepta_adjuntos(carpeta)`**, `SECURITY
  DEFINER`: solo dentro de la carpeta `<id del formulario>/` de uno **abierto
  que tenga una pregunta de adjunto**. `anon` no tiene permiso de tabla sobre
  `formularios` (se le quitó a propósito), así que la política no puede
  consultarla directo: por eso la función. Sin select para `anon`: sube y no ve
  nada, ni lo suyo.
- **Leer lo decide la RLS de `formularios`**: quien ve el formulario, que es
  exactamente quien ve sus respuestas. Comprobado impersonando: un alumno ve
  **0** archivos, el dueño los ve. Se bajan con `storage.download()`.
- **`formulario_publico()` devuelve el `id`**: es el nombre de la carpeta.
- **`responder_formulario()` valida cada ruta**: de la carpeta de ESE
  formulario, con la forma que arma la página, con una extensión que la pregunta
  admita (una de imagen no acepta un PDF) y que **exista** en Storage. Sin eso
  una respuesta podría apuntar al archivo de otro formulario —y quien coordina
  ese otro vería una cédula ajena en sus respuestas—.
- **Borrar un formulario borra antes sus archivos**, sacando las rutas de sus
  respuestas: después, la política de Storage ya no encuentra de quién eran.

#### El torneo en línea (proyecto «Base de Colegios»)

**`inscripcion.html` ya no pide adjuntos**: se quitó el campo, `js/adjuntos.js`
y la subida, porque para inscribirse no hacía falta ningún documento. Lo de
abajo sigue en pie para las inscripciones viejas que sí los traen:
`inscripciones.html` los enseña igual, y `smart-function` sigue aceptando un
`adjuntos` que no llega (es opcional). `verificar-inscripcion-adjuntos.js`
comprueba ahora lo contrario: que no haya campo de archivo, que no se suba nada
a Storage y que a la función no viaje `adjuntos`.

- **El bucket `inscripcion-adjuntos` es PRIVADO** y `anon` solo puede escribir
  en `pendientes/`, **sin ninguna política de lectura**: el formulario es
  público y su clave está en el HTML.
- **A `smart-function` viajan solo las rutas**, y ella —ya pasado Turnstile—
  comprueba la forma de cada una y que el archivo **exista** antes de guardarlas
  en `inscripciones.adjuntos` (jsonb).
- **Los ve `inscripciones-torneo`**, que después de preguntarle a la Academia si
  quien mira coordina, **firma cada ruta por una hora** y las devuelve en
  `firmas`. La página las baja con `fetch` —`connect-src` ya incluye ese
  proyecto— y las pinta como `blob:`. Si una firma no llega, ese archivo dice
  «No se pudo abrir» y la lista sale igual.
- **Las dos funciones viven ahora en el repositorio**, en
  `supabase/functions-colegios/`: antes existían solo desplegadas.
- El CSS de `inscripcion.html` se compila aparte. Mientras tuvo el selector,
  `css-construir.js` leía también `js/adjuntos.js` para esa hoja; si algún día
  vuelve, esa línea vuelve con él, o el selector sale sin forma y sin error.

**Al tocar `js/adjuntos.js` o cualquiera de estas pantallas, correr**
`node herramientas/verificar-formularios.js`, `node
herramientas/verificar-admin.js` y `node
herramientas/verificar-inscripcion-adjuntos.js` (con el sitio en
localhost:8777 y playwright). Los dos primeros comprueban qué se sube y adónde (la carpeta, el
nombre, el tipo, sin `upsert`), que viajen **exactamente** las rutas que se
subieron, que un `.exe` no se suba, que reintentar no suba dos veces, y del
otro lado que la foto **se vea de verdad** (`naturalWidth`), el nombre de
descarga, y que uno que no se pudo bajar lo diga.

### Elegir un plan pide sesión, la de quien pidió entrar

A quien se le rechaza la solicitud de la Academia gratuita (`unirse.html` →
`solicitudes.html`) le llega un correo con `elegir-plan.html?s=<id>` para
escoger un plan pago. Hasta `elegir_plan_con_sesion` bastaba el enlace; ahora,
por decisión del dueño del sitio, **elegir va con la cuenta** —elegir un plan es
contratar— y **ver los planes es público**.

- **La base lo exige.** `solicitud_para_elegir_plan()` y `elegir_plan()` ya no
  las puede llamar `anon`, y las dos comparan **el correo de la solicitud con
  el de la cuenta** (`auth.users.email`, sin distinguir mayúsculas). Solo
  exigir sesión dejaba que cualquiera con el enlace eligiera por otra persona.
  Con otra cuenta, la solicitud no aparece: la página no dice de quién es un
  enlace. Comprobado impersonando `anon`, otra cuenta y la dueña, en una
  transacción que se deshizo: `42501`, 0 filas y «Inicia sesión con la
  cuenta…», y la dueña elige una vez (la segunda se rechaza).
- **Sin sesión la página enseña los planes**, los mismos tres con sus precios,
  sin botón de elegir ni casilla de términos, y dos salidas: «Inicia sesión para
  elegir tu plan» (solo si vino con el enlace) y WhatsApp. **Sin el enlace del
  correo** también los enseña, así la página sirve para mostrarlos.
- **El login solo sabe volver a un `.html` sin parámetros**, así que la
  solicitud se guarda en la pestaña (`sessionStorage`,
  `elegir_plan_solicitud`) antes de ir y se recupera al volver; se borra al
  elegir.
- **Quien no tiene cuenta** —la mayoría de los rechazados— sigue por WhatsApp:
  la página lo dice y lo ofrece. El correo del rechazo (`sendInvitacionPlan`
  en `admin-manage-users`) todavía dice solo «elige un plan»; la página explica
  el resto.
- `verificar-legal.js` lo prueba en el navegador: sin sesión se ven los tres
  planes sin botones, con login y WhatsApp, y no se llama a la base; con sesión
  y de vuelta del login (la solicitud en la pestaña, no en la dirección), se
  elige como antes, con la solicitud correcta.

### Los envíos sin cuenta pasan por un freno

Tres funciones las puede llamar cualquiera con la clave pública del HTML, y
cada llamada es una fila nueva: `responder_formulario` (`formulario.html`),
`registrar_arbitraje_publico` (`nivel-de-arbitraje.html`) y
`solicitar_academia` (`unirse.html`). Hasta la migración
`freno_envios_publicos` nada paraba a un script: podía llenar miles de
respuestas o solicitudes en un minuto, y no daba ningún error, simplemente
aparecían.

- **El freno va en la base**, en `interno.frenar_envio_publico(tipo, ámbito,
  correo)`, porque la página se salta desde la consola. Las tres la llaman
  **después de validar y antes del insert**: una respuesta que rebota por un
  campo vacío no gasta cupo. Devuelve NULL si pasa (y lo anota en
  `interno.envios_publicos`) o el mensaje que ve quien envía. `anon` y
  `authenticated` no pueden llamarla ni leer la tabla (comprobado
  impersonando `anon`).
- **Tres topes**, contados en la última hora salvo donde se dice:

  | Envío | Por IP | Por correo | Total |
  |---|---|---|---|
  | Formulario | 40 | — | 300 por formulario |
  | Arbitraje | 40 | 10 | 200 |
  | Solicitud de academia | 5 | 3 por día | 30 |

  **El de IP es generoso a propósito**: un colegio entero sale a internet por
  UNA IP, y una clase haciendo el examen de arbitraje o una reunión de padres
  llenando la inscripción son muchos envíos legítimos seguidos. El pico real,
  al ponerlo, era 12 respuestas en una hora en un mismo formulario. El total
  del formulario es **por formulario**: uno inundado no frena a los demás.
- **La IP sale de `request.headers`** (`cf-connecting-ip`, `x-real-ip` o el
  primero de `x-forwarded-for`). **Si no llega ninguna, no se cuenta por IP**:
  juntar a todo el mundo en un cupo de «desconocida» frenaría a las personas.
  Los otros dos topes siguen valiendo. El primero de `x-forwarded-for` lo
  puede inventar quien llama; por eso el tope total existe.
- Las filas de más de dos días se borran en cada envío: ya no cuentan para
  ningún tope.
- **Turnstile no está**, y no por olvido: comprobar el token exige su clave
  secreta en el servidor. La tiene el proyecto de Colegios (`smart-function`),
  no el de la Academia; ponerlo en el HTML sin comprobarlo en el servidor no
  frena a nadie. Si algún día se agrega, va en una Edge Function que valide el
  token y llame a estas funciones, con `TURNSTILE_SECRET_KEY` cargada en el
  proyecto de la Academia.

**Al volver a crear cualquiera de las tres, correr**
`node herramientas/verificar-envios-publicos.js` (sin red ni base: lee
`supabase/migraciones/`). Mira la última migración que define cada una y
comprueba que llame al freno antes del insert y haga caso de lo que devuelve.
Se pierde callado: basta con copiar la versión vieja de la función.

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
- **La marca se comprueba**: si el `update` final de la respuesta falla, la
  función lo dice (500 con el `alumno_id`) en vez de devolver `ok`. Sin la
  marca, volver a apretar «Crear cuenta» armaba otra cuenta y gastaba otra
  invitación.
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

### La contraseña también se le puede asignar

Con lo de arriba el niño tiene usuario, pero la contraseña la crea quien abre el
enlace que salió al correo de la casa. Con los más pequeños eso no pasa: la
mamá no lo abre, o lo abre y no sabe qué poner, y el niño llega a la clase sin
poder entrar. Así que sale **«Su contraseña»** en dos lugares: la ficha de
`coordinacion.html` (también para quien administra) y la tarjeta «Acceso a la
cuenta» de `informes.html`, que es por donde **su profesor** mira a cada alumno.
Quien lo tiene en la clase se la pone y se la da junto con su usuario. El
control es uno solo, `js/contrasena-alumno.js`, y lo usan las dos páginas.

- **Solo aparece si entra con usuario de la Academia**, y la acción
  `contrasena` de `correos-alumno` lo vuelve a comprobar: la contraseña de quien
  tiene correo propio es de esa persona, y para olvidos ya tiene su enlace. La
  sección aparece en cuanto se le da el usuario, sin cerrar la ficha.
- Lo puede **su profesor** (`soy_profesor_de()`) o quien tiene la función de
  **«cuentas»**; la de cobros no: a `correos-alumno` también entra la ficha de
  contacto de Cobros, y eso no es para abrir cuentas ajenas. El resto de
  `correos-alumno` sigue siendo solo de coordinación.
- En `informes.html`, un profesor que no coordina ve de «Acceso a la cuenta»
  solo la contraseña, y solo con un alumno que entra con usuario: «Reenviar
  enlace» es de coordinación (`reenviar-acceso` pide la función «acceso») y se
  le vería y fallaría.
- **Ocho caracteres como mínimo**, lo mismo que pide `bienvenida.html`.
  «Proponer una fácil» arma una palabra del ajedrez y tres números
  (`caballo482`), que un niño puede escribir y recordar; los números salen de
  `crypto`.
- Se pone con `email_confirm: true`: una cuenta invitada que nunca abrió su
  enlace está sin confirmar, y así GoTrue no la deja entrar ni con la contraseña
  buena.
- El campo es de texto, no de contraseña, a propósito: es para dictársela al
  alumno. El aviso del final dice el usuario **sin el dominio** y la contraseña.

De paso: el «Reenviar acceso» de `admin.html` iba por `resetPasswordForEmail`,
que con un usuario de la Academia manda el enlace a la dirección muerta y la
pantalla decía «enviado». Ahora esas cuentas van por `reenviar-acceso` (al
correo de la casa), y `admin-manage-users` rechaza el caso por si alguien lo
llama directo.

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
- **`create-student` rechaza con un 409 un correo que ya es de una cuenta**,
  igual que `inscribir-alumno`. GoTrue solo rechaza a un usuario YA
  CONFIRMADO: con uno invitado que todavía no abrió su correo devuelve ese
  mismo usuario, y más abajo quedaba asignado a quien llamaba — un profesor se
  quedaba con el alumno que otra profesora acababa de invitar. Y acepta a quien
  administra (`is_admin`), que desde `role = 'admin'` recibía «Solo el profesor
  puede invitar alumnos».
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
