# Informes

Notas de diseño para Claude, sacadas del CLAUDE.md de la raíz: informes.html, el correo a la casa y los reportes de actividades.
El índice de todos los temas y las reglas que valen para todo el sitio
están en `CLAUDE.md`.

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

- **Arriba va lo que pide actuar**, como en el panel de la Academia: quién
  lleva 4 días o más sin entrenar, a quién le falta el diagnóstico y cuántos
  planes están sin compartir. Los tres datos **ya estaban cargados** y no se
  decían en ninguna parte — había que acordarse de ir a buscarlos al filtro de
  tema. Van escritos dentro de la pregunta de siempre que los contesta, y
  tocarla **deja el filtro puesto**, así que enterarse y actuar son el mismo
  gesto (ver «Lo que pide atención va en su pregunta»).
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
  está. Las dos `<option>` siguen escritas en el HTML —`verificar-panel.js`
  comprueba contra el archivo que las tarjetas del panel de quien administra
  apunten a temas que existen— y se quitan del DOM al cargar.
- **Tampoco se le bajan.** Del arbitraje, la RLS se lo devuelve igual a un
  profesor, así que ese filtro tiene que estar en la página. Del diagnóstico
  ya no: desde «El enlace del diagnóstico de cada supervisor» (abajo) la base
  solo se lo da a administración y al supervisor dueño del enlace.
- Dentro del tema «🧭 Diagnóstico de nivel», el apartado de visitantes que va
  debajo de los alumnos se salta por lo mismo.


#### El enlace del diagnóstico de cada supervisor

Cada supervisor tiene **su propio enlace** del diagnóstico,
`entreno/diagnostico.html?s=<código>`, para mandárselo a gente sin cuenta
desde su academia; lo que se hace por ese enlace **le llega solo a él**, en
Informes («🌐 Diagnósticos de visitantes», tarjeta del mismo nombre en su
panel). Lo que llega sin enlace (la portada, Cursos) sigue siendo de
administración.

- **El código vive en `enlaces_diagnostico`** (uno por supervisor, sin
  políticas) y lo da `mi_enlace_diagnostico()`: lo crea la primera vez y
  después devuelve siempre el mismo. Exige `es_supervisor` o `is_admin`,
  envuelto en `coalesce`. Es un código al azar y no el id de la cuenta.
- **A quién le llega lo decide la base, no la página.** La página solo manda
  el código (`enlace`); el trigger `diagnosticos_publicos_supervisor` lo
  traduce a `supervisor_id` y **pisa** cualquier `supervisor_id` que venga en
  el envío. Un código que no existe, o de alguien que ya no supervisa, deja
  el diagnóstico en la bandeja de administración: perderlo sería peor. La
  página lo dice antes de empezar («Este enlace ya no está activo…»).
- **El visitante ve a quién le llega**: `enlace_diagnostico_publico(código)`
  (`anon` puede llamarla) devuelve solo un nombre —el de la academia si el
  supervisor tiene exactamente una; si no, el suyo—. El código se guarda con
  sus datos, así que recargar sin el `?s=` no lo pierde.
- **La RLS se cerró de paso.** Antes cualquier cuenta con `role = 'profesor'`
  leía TODOS los diagnósticos públicos y solo la pantalla los escondía; con
  diagnósticos de un supervisor eso cruzaba academias. Ahora leer y marcar
  atendido es `is_admin` o `supervisor_id = (select auth.uid())`, y desde el
  navegador solo se puede cambiar la columna `atendido` (grant por columna).
  A `anon` le quedó solo el insert: tenía también select, update, delete y
  truncate de los de omisión.
- **Comprobado impersonando en SQL** (en una transacción que se deshizo): un
  profesor que no supervisa no obtiene enlace; el visitante con el enlace de
  una supervisora ve el nombre de su academia; uno inventado da nulo; el
  diagnóstico por el enlace queda a nombre de esa supervisora, uno con
  `supervisor_id` mandado a mano y uno con código falso quedan de
  administración; `anon` no lee ni los diagnósticos ni los enlaces; la dueña
  ve solo el suyo y lo marca atendido, pero no puede cambiarle el dueño; otra
  supervisora y un profesor ven 0; administración, todos.
- En Informes, quien supervisa pide **solo** los de su enlace (`.eq` además de
  la RLS: quien administra mirando «como supervisor» ve lo de su propio
  enlace, no la bandeja entera), arriba de la lista tiene el enlace con
  «Copiar enlace» (armado desde la carpeta de la página, como en
  Formularios), y el arbitraje sigue quitado. Quien administra ve en cada
  diagnóstico «Llegó por el enlace de …».
- **Y le llega un correo.** Al entrar un diagnóstico con supervisor, el
  trigger `diagnosticos_publicos_avisa` (AFTER INSERT, cuando el otro ya puso
  `supervisor_id`) llama con pg_net a la Edge Function `avisar-diagnostico`,
  que le escribe al supervisor con los datos del visitante, su nivel y el
  enlace a Informes, con la marca de su academia si tiene una sola, y
  `reply_to` al correo del visitante: con «Responder» le escribe a él.
  - **Lo dispara la base, no la página**: un envío cortado a la mitad no se
    queda sin aviso. Y si encolarlo falla, el insert sigue: perder el
    diagnóstico por el aviso sería peor.
  - **La función va con `verify_jwt` en false** (la llama un trigger) y a
    cambio exige el secreto `aviso_diagnostico_secreto` de la bóveda, que
    creó la propia migración y no ve nadie. **Recibe solo el `id`**: a quién
    se le escribe y qué dice sale de la fila, así que quien la llamara no
    podría elegir destinatario ni texto.
  - **Un correo por diagnóstico**: antes de mandar «toma» la fila poniendo
    `aviso_enviado_at` solo si estaba vacía, y la vuelve a vaciar si Resend
    falla. Un supervisor con usuario sin buzón no recibe nada.
  - El nombre, el correo y el teléfono son texto ajeno: van escapados, también
    en los `href`, y el asunto va sin saltos de línea.
  - Comprobado en la base: sin el secreto la función contesta 401; con el
    secreto y un id sin supervisor, «omitido» sin mandar nada; en una
    transacción que se deshizo, el insert con enlace encola UN pedido con solo
    el id y el insert sin enlace no encola nada.
- `verificar-informes.js` («El enlace del diagnóstico de cada supervisor»),
  `verificar-diagnostico-enlace.js` (en el navegador) y
  `verificar-aviso-diagnostico.js` (el correo, sin red) lo comprueban.

#### El tema de la academia en el diagnóstico

Quien abre el enlace de un supervisor de **una** academia ve el diagnóstico
**vestido con la marca de esa academia**: su logo y su nombre en el
encabezado y en una franja arriba del título, su color en el encabezado, en
la tarjeta de los datos, en los botones, en la barra de avance y en la
tarjeta del nivel, y al final «¿Quieres entrenar con …?» con el WhatsApp de
la academia. Lo pidió el dueño del sitio para que el diagnóstico que manda
cada academia se vea suyo.

- **La marca la da `enlace_diagnostico_marca(código)`** (`anon` puede
  llamarla): nombre, color, logo y WhatsApp, **solo si el supervisor es de UNA
  academia**, la misma regla que sus formularios (`formulario_publico`) y sus
  correos. Con dos o ninguna, la página queda como siempre (sigue diciendo a
  quién le llega el resultado).
- **Los colores los pone `css/styles.css`**, bajo `html[data-marca-academia]`
  con el color en `--marca-academia`; `js/entreno-diagnostico.js`
  (`vestirConLaAcademia()`) solo decide si se puede. **El color se vuelve a
  medir contra el blanco antes de usarlo** (`MarcaAcademia.contrasteConBlanco`):
  la base ya lo exige al guardarlo, pero si no da 4,5 la página muestra el logo
  y el nombre y conserva sus colores.
- **Encima del color todo va en blanco y sin transparencia**: lo único medido
  es blanco contra ese color. Por eso la tarjeta del nivel deja el ámbar y sus
  textos al 80 %, y el botón de WhatsApp va al revés (fondo blanco, letra del
  color de la academia: el mismo par).
- **Lo que es de Ajedrez Integral se quita**: el menú del encabezado (cursos,
  precios), «← Cursos» y «Ver los cursos». El pie con la política de
  privacidad se queda: la página y los datos siguen siendo de la plataforma.
- El nombre, el logo y el número vienen de la base: van con `textContent`, el
  logo por `urlDelLogo()` (el bucket público de siempre) y si no carga se
  esconde; el WhatsApp se queda con los dígitos y, si son 8, se le pone el 506.
- **De paso**: a un visitante ya no se le ofrece «Ver mis Informes» ni el aviso
  de que su profesor lo ve en Informes; no tiene cuenta ni profesor.
- `verificar-diagnostico-enlace.js` lo mide en el navegador (colores con
  `getComputedStyle`, lo que se ve con `checkVisibility`): con el tema, con un
  color que no da 4,5 y con un supervisor sin academia. Con
  `GUARDAR_CAPTURAS=<carpeta>` deja capturas de la portada y el resultado.

#### El PDF del diagnóstico con la marca de la academia

Si el diagnóstico llegó por el enlace del supervisor de **una** academia, el
PDF que se baja en Informes es **de esa academia**: arriba una franja en su
color con su logo (sobre un cuadro blanco) y su nombre en blanco, los títulos
y las líneas en su color, **su logo como marca de agua** en todas las páginas,
y la firma, el pie, el autor del archivo y el WhatsApp son los suyos. Lo pidió
el dueño del sitio, igual que el tema de la página del diagnóstico.

- **Qué marca le toca lo decide `marca_de_diagnostico(id)`**, `SECURITY
  DEFINER`: nombre, color, logo y WhatsApp si el supervisor del enlace es de
  una sola academia, y **solo a quien puede ver ese diagnóstico**
  (administración o el supervisor dueño; la misma regla que
  `diagnosticos_publicos_select`). Comprobado impersonando en SQL (revertido):
  la dueña y administración la reciben; otra supervisora y un profesor, nada;
  sin enlace, nada; `anon` no puede llamarla.
- **La firma de Oscar no se le pone a otra marca**: sin logo, o si el logo no
  se pudo bajar, el PDF de la academia sale con su franja y su nombre pero sin
  marca de agua. Un diagnóstico sin academia sale como siempre, con la marca
  de Oscar (y ahí sigue la regla de que sin ella no sale).
- **El color se vuelve a medir contra el blanco** en Informes
  (`MarcaAcademia.contrasteConBlanco`) antes de ponerlo en los títulos y la
  franja: si no da 4,5, el PDF lleva su nombre y su logo sin su color.
- **El generador es el mismo** (`js/reporte-pdf.js`), con dos campos
  opcionales, `color` y `cabecera`; los reportes de actividades no los usan y
  salen igual. El logo se prepara como la marca de agua
  (`MarcaAgua.prepararDesde()`), que ahora **decodifica desde los bytes ya
  bajados** (un `blob:`): el logo vive en Storage, otro origen, y leer sus
  píxeles desde su dirección dejaría el lienzo sin poder leerse.
- `verificar-informes.js` («El PDF de un diagnóstico con la marca de su
  academia») baja el PDF y lo lee: franja, logo una vez, nombre en blanco,
  títulos en su color, marca de agua en todas las páginas, firma y WhatsApp
  de la academia, y ni una mención a Oscar. Con `GUARDAR_PDF_ACADEMIA=<ruta>`
  deja una copia para mirarla.

#### El diagnóstico de un visitante se descarga en PDF

Cada visitante del panel «🌐 Diagnósticos de visitantes» trae **«⬇ Descargar
PDF»**: su resultado, área por área, lo que ya tiene firme, dónde conviene
empezar y el plan de cuatro semanas, con la **marca de agua de Oscar Angulo
Cubero en todas las páginas** y su firma —nombre, cargo, Ajedrez Integral y el
sitio— en el pie, en los datos del archivo y al final. Es un contacto para
invitar a la Academia, y lo que más convence es mandarle su resultado bien
presentado.

- **No cuenta nada por su lado.** El resultado sale de
  `PlanEntrenamiento.resumir()` —el mismo del «Ver detalle»— y el plan de
  `generarPlan()`; el PDF lo escribe `js/reporte-pdf.js`, el generador de los
  reportes de actividades. `js/diagnostico-visitante-pdf.js` solo arma el
  documento neutral. Una segunda cuenta diría otro nivel que la pantalla.
- **La marca vive en `js/marca-agua.js`**, que salió de `reportes.html`: la
  usan las dos pantallas, y escrita dos veces un PDF saldría marcado y el otro
  no. Si la marca no se puede bajar, **el PDF no sale**: se pidió marcado.
- **El WhatsApp sale de `ajustes_academia`** (`whatsapp_consultas`), como en
  los correos a las familias. Sin número, no se inventa: el PDF va solo con el
  sitio.
- **Los tres archivos se bajan al apretar el botón**, no al abrir Informes.
- Un área que un diagnóstico viejo no midió dice «No se midió», no «A
  trabajar».

`verificar-informes.js` («El diagnóstico de un visitante, en PDF») descarga el
archivo de verdad y lo lee sin librerías —los flujos van sin comprimir—: que la
marca esté en TODAS las páginas y con su canal alfa, la firma, el WhatsApp de
los ajustes, el nombre del visitante y **no el de otro**, y que nada se baje al
abrir la página. Con `GUARDAR_PDF=<ruta>` deja una copia para mirarla.

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

### Las preguntas de siempre, y el selector en bloques

El filtro «Tema o actividad» era una lista corrida de quince opciones. Ahí
estaba todo mezclado: el seguimiento semanal («Sin entrenar», «Asistencia»),
cada ejercicio de Entrenamiento y los datos del público, que ni siquiera son
alumnos. Quien quería saber «¿quién no está entrenando?» tenía que adivinar que
eso se llama «😴 Sin entrenar (4 días)» y buscarlo entre las quince.

- **El selector va en tres `<optgroup>`**: «Cómo van tus alumnos» (sin
  entrenar, asistencia, asignaciones, diagnóstico, cursos), «Lo que
  entrenaron, tema por tema» (mates, táctica, 4×4…) y «Visitantes del sitio
  (sin cuenta)». Los valores no cambiaron, así que los enlaces
  `informes.html?tema=…` del panel y de administración siguen llevando al
  mismo lugar.
- **El bloque del público se quita entero** para quien no administra, con su
  `<optgroup>` y no solo sus opciones: un rótulo vacío se pinta igual y no
  lleva a nada.
- **Encima van cuatro «preguntas de siempre»**: «¿Quién no está entrenando?»,
  «¿Quién viene a clase?», «¿Cómo contestan en clase?» y «¿Qué nivel tiene
  cada uno?». Cada una **es un tema del filtro y nada más**: lo deja puesto y
  suelta al alumno elegido, porque la pregunta es del grupo. No hay un informe
  aparte que se pueda desordenar del filtro.
  - Se arman **desde el propio `<select>`**: si un tema no está (porque esa
    persona no lo tiene), su pregunta no se pinta.
  - La que está contestada queda marcada, con `aria-pressed` y con el botón
    relleno. No es solo un cambio de color: cambia el relleno, y el lector de
    pantalla dice «presionado». Cambiar el tema en el selector mueve la marca.
  - Están siempre, también con todo al día: es cuando uno viene a preguntar.
    Lo que pide atención se les escribe adentro (abajo).
- Lo prueba `verificar-informes.js`: los bloques (y que a un profesor no le
  quede el del público), que no se perdió ningún tema, las cuatro preguntas a
  la vista, y que la marca siga al tema.

### Lo que pide atención va en su pregunta

Arriba había dos filas de botones que llevaban al mismo lugar: las
«Preguntas de siempre» y, debajo de los filtros, una franja «⚠️ Qué pide
atención» con «😴 3 sin entrenar hace 4 días o más», «🧭 2 sin diagnóstico» y
«📤 1 plan sin compartir». Los dos primeros eran el mismo tema que
«¿Quién no está entrenando?» y «¿Qué nivel tiene cada uno?», y el tercero
también abría el diagnóstico. Dos puertas al mismo lugar hacen pensar que son
dos cosas, y lo urgente quedaba debajo de los tres selectores. Es el mismo
criterio de los paneles (ver «Una sola puerta para cada cosa» en
`paneles.md`).

- **La franja ya no existe**: lo que decía va escrito dentro de la pregunta que
  lo contesta, que es lo primero de la página: «¿Quién no está entrenando? ·
  ⚠️ 3 sin entrenar», «¿Qué nivel tiene cada uno? · ⚠️ 2 sin diagnóstico ·
  1 plan sin compartir». Con todo al día, la pregunta queda con su texto de
  siempre.
- **El borde de la que pide atención cambia, pero el color no va solo**: el
  número está escrito en el botón, y el rótulo dice qué quiere decir la marca
  («lo marcado con ⚠️ pide atención»). El orden de las cuatro no cambia: una
  pregunta que salta de lugar según el día no se encuentra.
- **Se cuenta sobre el grupo elegido y se vuelve a contar con cada filtro**
  (`pintarPendientesDePreguntas()` en `applyTeacherFilters()`), así que
  compartir planes o cambiar de grupo actualiza el número.
- **La lista de «sin entrenar» también respeta el grupo.** Antes la franja
  contaba los de 7A y la lista que abría traía a todos los grupos: «2 sin
  entrenar» abría tres nombres. El número y la lista son ahora la misma
  cuenta.
- Lo prueba `verificar-informes.js`: que no queda franja, el texto de cada
  pregunta con y sin pendientes, que tocarla deja el filtro puesto, y que con
  7A el número y la lista dicen los mismos dos.

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
  y el reporte de actividades, con la semana como partición. Suman clase +
  ejercicios, igual que la tarjeta (ver «Cómo viene» cuenta también la clase, más abajo). Comprobado contra
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

### Antes y ahora: si sabe más, no solo si trabaja

«Cómo viene» mide si TRABAJA (ejercicios por semana). Se puede resolver
trescientos ejercicios de lo que uno ya sabía, así que el bloque **«🌱 Antes y
ahora»** (debajo de «Cómo viene», en el informe del alumno y en la página del
propio alumno) dice si SABE más, con dos cosas que no se inflan entrenando lo
fácil. Lo pinta `js/antes-y-ahora.js`, el mismo para las dos vistas.

- **Su fuerza, diagnóstico a diagnóstico**: el Elo que mide la prueba
  (`detalle.medicion`: elo ± error, desde la versión 5), los últimos seis.
  - **Se comparan solo los de la misma versión que el último**, como manda
    «Un diagnóstico nuevo ya no se compara con uno viejo». Si el anterior es
    de otra versión, lo dice y no saca la cuenta.
  - **«Sube» o «baja» solo si pasa el margen de los dos juntos**
    (√(e1² + e2²)). Con ±84 y ±67, menos de 107 puntos es «parejo: dentro del
    margen de la prueba». Sin ese margen, un vaivén de la prueba se leería
    como un progreso.
  - Los diagnósticos sin medición (versiones 1 a 4) no entran: no se inventa
    un Elo que la prueba no midió.
- **Lo que antes fallaba y ahora le sale**: los ejercicios de las colas de
  «Repasar fallados» (Temas, Mates, Habilidades, Finales, Visualización y
  Practicar) que salieron con tres repasos limpios seguidos (`fuera: true`).
  Es un hecho y no un porcentaje: lo falló (o necesitó pista) y después lo
  resolvió tres veces sin ayuda, en días distintos. Van los seis más recientes
  con su nombre (el motivo de `temas-motivos.json`, «Mate en N», el tipo del
  catálogo, el título del final) y la cuenta por sección. La cola de la clase
  no entra: ahí se anota «vi la respuesta», no un fallo.
- **No hay migración**: las dos cosas salen de lo que la RLS ya deja leer
  (`training_progress` del diagnóstico y el espejo `training_state` de las
  seis colas), acotado al `student_id`. Son pocas filas por alumno. Sin
  diagnóstico medido ni nada superado, el bloque no se destapa.
- Lo prueba `pruebaAntesYAhora` en `verificar-informes.js`: la lógica sin
  navegador (orden, misma versión, margen, la cola rota que no rompe nada) y
  la página del alumno (lo suyo y no lo de otro, los nombres, la fecha en hora
  de Costa Rica). Si se quita el filtro de versión a propósito, salta.

### Comparar alumnos

«El perfil de cada alumno» los muestra de a uno, en tarjetas separadas, y
comparar dos perfiles a ojo es justo lo que no se hace. **«Comparar alumnos»**
(dentro del diagnóstico de la clase, debajo del perfil) pone dos o tres lado
a lado, área por área, para armar grupos de nivel o parejas de práctica. Lo
pinta `js/comparar-alumnos.js` con los diagnósticos que la página ya tiene
(no pide nada a la base) y respeta el filtro de grupo de arriba.

- **Hasta tres**, con los tres primeros colores de la paleta categórica de
  referencia de la guía de gráficos, pasados por su validador contra el fondo
  de la tarjeta (blanco en claro, brand-900 en oscuro; el oscuro con sus
  propios pasos). Con un cuarto, dos colores ya no se distinguen con
  daltonismo, así que la cuarta casilla se apaga y lo dice.
- **El color nunca va solo**: cada barra lleva su número escrito y su nombre
  para el lector de pantalla, y la leyenda dice quién es cada color con su
  fuerza y su nivel. El verde en modo claro no llega a 3:1 contra el blanco: el
  número escrito es lo que lo permite.
- **Se compara la nota de cada área** (rendir lo esperable para su fuerza es
  70), la misma de «Dónde se debe mejorar» y del perfil. El porcentaje va
  entre paréntesis.
- Arriba, una frase: **dónde más se separan** («Táctica: Bruno 90, Ana 20»),
  que es lo que se busca para armar parejas.
- Lo prueba `pruebaComparar` en `verificar-informes.js`.

### El informe del grupo en PDF

Para una reunión con las familias o con el colegio, el profe necesitaba algo
que se pueda imprimir o mandar. «Reportes de actividades» (`reportes.html`) es
de quien coordina y habla de las clases de un periodo. Esto es de quien da
clase y habla de **su grupo**. **«📄 Informe del grupo en PDF»**, en «Tus
alumnos», baja un PDF del grupo elegido arriba (o de todos):

- **Resumen**: cuántos alumnos, asistencia promedio, tiempo en clase y en
  ejercicios, participación en las preguntas de la clase y cuántos hicieron
  el diagnóstico, con su fuerza media.
- **Por áreas**: el promedio del grupo en cada área del diagnóstico (la nota,
  como «Dónde se debe mejorar»), de la más floja a la más firme y con la banda
  escrita, porque el PDF se imprime en blanco y negro. Al pie, qué reforzar.
- **Cada alumno**: asistencia, tiempo, participación y nivel, en una fila.
- **No se cuenta nada aparte**: los números son los que la página ya pintó
  (`informes_resumen_alumnos`, `asistenciaDe` sin las justificadas,
  `PlanEntrenamiento.resumir`). El buscador no cuenta: un informe de grupo es
  del grupo.
- El PDF lo escribe `js/reporte-pdf.js`, el mismo de los reportes, con la marca
  de agua de `js/marca-agua.js`. El documento lo arma
  `js/informe-grupo-pdf.js`. Los tres se bajan al apretar el botón, no al abrir
  Informes.
- Lo prueba `pruebaInformeGrupo` en `verificar-informes.js`: baja el PDF de
  verdad y lee su texto con pypdf (el título, quién lo prepara, solo los del
  grupo, las tres partes).

### La ficha del alumno: lo que se hace con él, a un clic

Lo que un profe hace con UN alumno vivía en cinco páginas: desde su informe
había que volver al panel, entrar a Tareas y buscarlo otra vez en la lista.
Arriba del informe de un alumno, debajo de su nombre, va **«Con este
alumno»** (`#informe-acciones`, `pintarAccionesDelAlumno()`):

- «📋 Ponerle una tarea» (`tareas.html?alumno=…`) y «📝 Ponerle un examen»
  (`examenes.html?alumno=…`): la página abre con él ya marcado en la lista.
  Un id que no está en la lista no marca nada; lo que se puede mandar lo sigue
  decidiendo la base.
- «✍️ Su bitácora» y «📧 Informes a la casa»: van a su sección de esta misma
  página. La de la casa es un `<details>` plegado: se abre al llegar y el foco
  queda en su título.
- «📓 Su cuaderno» y «🏆 Su libreta de torneos», con su `?alumno=`.
- **Ponerle una tarea o un examen es dar clase**: solo a quien da clase
  (`profile.role === "profesor"`, la misma condición que el plan) y nunca
  mirando como otra persona, que lo mandaría a su nombre. Quien administra no
  da clase (ver «El panel de quien administra no es el de un profesor»): a él
  le quedan los cuatro de mirar.
- No va en el resumen del grupo ni en el informe propio del alumno.
- Lo prueban `pruebaConEsteAlumno` en `verificar-informes.js` (los enlaces con
  su id, que la casa se abra, que no aparezca en el grupo y que quien
  administra no tenga los de dar clase) y `verificar-examenes.js` (que
  `?alumno=` marque a ese y a nadie más).

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

### CENFO: cada ejercicio vale como mínimo 2 minutos

El latido de `js/tiempo-plataforma.js` deja de contar a los 60 s sin ningún
clic ni tecla, así que quien se queda pensando una posición sin tocar nada no
suma. En CENFO eso daba números que no se creía nadie: **149 ejercicios contra
38 minutos**. Pedido del dueño: para ese grupo, cada ejercicio cuenta como
mínimo 2 minutos de tiempo en la plataforma.

- **La cuenta es `greatest(minutos medidos, 2 × ejercicios hechos)`** en el
  mismo periodo —«como mínimo»: si lo medido ya es mayor, manda lo medido—.
  Un ejercicio hecho es una fila de `training_progress`: repetirlo cuenta otra
  vez, porque volvió a hacerlo. Afecta solo a `minutos_ejercicios`; la clase se
  sigue midiendo como siempre.
- **La regla vive en UN lugar**: `public.minutos_minimos_por_ejercicio(grupo)`
  devuelve 2 para CENFO y 0 para los demás. La usan las cuatro cuentas de
  tiempo —`informes_resumen_alumnos()`, `informe_de_alumno()` (el correo a la
  casa), `evolucion_alumno()` y la meta `minutos` de `tareas_con_avance()`—.
  Si una la aplicara y otra no, la tarjeta, la curva y el correo dirían
  números distintos del mismo alumno. Para sumar otro grupo, o cambiar los 2
  minutos, se toca solo esa función.
- **El grupo se compara sin mayúsculas ni espacios** (`upper(btrim(...))`):
  «Cenfo» y «CENFO » son el mismo grupo, el mismo tropiezo que ya se llevó la
  videollamada por grupo.
- Comprobado aplicándola dentro de una transacción que se deshacía, antes de
  aplicarla de verdad: cambian los 5 alumnos de CENFO (38 → 306 min, 74 → 488)
  y **ningún otro alumno se mueve ni un minuto**.

### En qué se fue el tiempo, sección por sección

El pedido: «que todo lo que haga el alumno le sume tiempo y salga en el
informe: si estudia un curso, cuánto lo estuvo estudiando; si entrena
Visualización, también cuántos ejercicios hizo; y lo que es contenido y no
ejercicios, igual el tiempo». Había dos huecos, los dos callados:

- **Medio sitio no contaba ni un minuto.** `js/tiempo-plataforma.js` solo
  estaba escrito a mano en las páginas de Entrenamiento. **Los doce cursos de
  la Academia, las siete páginas de partida, el torneo y el examen no lo
  cargaban**: un alumno podía pasar una hora en un curso y el informe decía 0.
  Ahora lo pone `herramientas/academia-cabecera.py` (marcas `<!-- tiempo: …
  -->`, en la misma lista `PAGINAS`), con la actividad de `TIEMPO_ACTIVIDAD`.
  **Una página que ya lo trae escrito a mano no lo recibe otra vez**: serían
  dos filas abiertas y esa sección contada doble.
- **El informe decía UN total.** Ahora `public.tiempo_por_seccion(alumno,
  desde, hasta)` devuelve una fila por sección con sus minutos y sus
  ejercicios, y la pintan el bloque «⏱️ En qué usó su tiempo» de Informes (las
  dos vistas, con «Desde siempre / 30 días / 7 días») y «En qué trabajó» del
  correo a la casa (`informe_de_alumno()` trae `secciones`).

Detalles que importan:

- **Un curso cuenta aparte de los demás**: `data-activity="curso"` se completa
  sola con el nombre del archivo (`curso:el-mapa-de-los-finales`), con `.html`
  o sin él. Un curso nuevo cuenta solo, sin tocar ninguna lista.
- **La sección de un ejercicio no siempre es su `activity`**: un tema de
  táctica se apunta `tactica` y se resuelve en Ejercicios por tema, y Desafíos
  se apunta `practicar` con `set_id` `desafio_…`. La función los reparte; el
  tiempo viejo de `tactica` y `fichas` va a `temas` y `estudio`.
- **Lo que es contenido no inventa un conteo**: un curso dice «Estudió el
  contenido», Estudio o el bot dicen el tiempo y nada más.
- **Es `SECURITY INVOKER`** como las de informes (comprobado: el alumno recibe
  sus 17 secciones y 0 de otro) y sin execute para `anon`.
- **El mínimo de CENFO va POR SECCIÓN** (la regla es por ejercicio), y las
  secciones se parten con `minutos_por_tramos()`: con dos secciones abiertas a
  la vez la suma puede dar un poco más que la tarjeta del total, y la nota del
  bloque lo dice. Con los datos reales: 589 min repartidos contra 588 de total.
- **Los nombres de sección están escritos dos veces, a la fuerza**:
  `js/tiempo-secciones.js` (navegador) y `SECCIONES`/`TITULOS_CURSOS` de
  `informes-encargados/informe-html.ts` (Deno). Si se separan, el correo nombra
  una sección que la pantalla no conoce. Al sumar una página que cuenta tiempo
  con una actividad nueva, agregarla en las dos.
- Sin `secciones` (una base de antes), el correo cae a los conteos de siempre.
- **«Preparación de rivales»** (`preparacion`) cuenta el tiempo en
  `plan-rival.html` y las líneas del plan que el alumno jugó de memoria (ver
  «Entrenar el plan: etapa 7» en `paneles.md`).

**Al tocar esto, correr `node herramientas/verificar-tiempo-secciones.js`** (sin
navegador ni red): que las dos tablas digan lo mismo y los cursos se llamen como
en el catálogo, que toda página que cuenta tiempo lo haga en una sección con
nombre y una sola vez, que los doce cursos, las partidas y el examen cuenten,
que «curso» se apunte con su nombre, y lo que dice el correo. Y `node
herramientas/verificar-informes.js`, que mira el bloque en un navegador. Está
probado que falla de verdad: sin la conversión de «curso» saltan 2.

**`informes-encargados` ya está desplegada con esto** (versión 9): el correo
dice el tiempo de cada sección. `node herramientas/funciones-armar.js` se
plantaba porque el respaldo del punto de restauración había dejado una copia
vieja de `contacto-academia.ts` dentro de `informes-encargados/`; se borró, y
el compartido de `_compartido/` es otra vez la única fuente. **Un archivo
compartido no se guarda nunca dentro de la carpeta de una función**: el armado
lo rechaza, y con razón — dos copias se separan.

### «Cómo viene» cuenta también la clase

`evolucion_alumno()` sumaba solo `platform_activity_log`, mientras la tarjeta
«Tiempo total en la plataforma» de arriba ya sumaba clase + ejercicios: la
curva decía menos que la tarjeta del mismo alumno. Ahora la curva suma lo
mismo —`class_presence_log` por semana más los ejercicios (con el mínimo de
CENFO)—, y comprobado contra los datos reales: la suma de las 12 semanas da el
total de la tarjeta (428 y 428; 652 y 652) salvo el redondeo por semana y lo
anterior a las 12 semanas.

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

### La RLS de las tablas de actividad arma el conjunto UNA vez, no fila por fila

El 23 de setiembre de 2026 un profesor que también supervisa abrió Informes y
recibió «canceling statement due to statement timeout». Caían
`informes_resumen_alumnos()` e `informes_inactivos()`, que son `SECURITY
INVOKER` (ver arriba) y por eso pasan por la RLS de `training_progress`. Esa
política llamaba a `soy_profesor_de(student_id)` y a
`supervisado_por_mi(student_id)` **una vez por cada fila**: son `SECURITY
DEFINER` con `SET`, así que Postgres no las puede meter dentro de la consulta,
y cada llamada cuesta cerca de un milisegundo. Con 6860 filas, solo contar lo
que veía ese profesor tardaba 8,5 s: más que el tope de 8 s. No hacía falta una
tabla grande: bastaba con que creciera `training_progress`, que crece todos los
días.

La regla no cambió: se dice al revés. En vez de preguntar en cada fila «¿soy
profesor de este alumno?», se arma una sola vez el conjunto de alumnos de quien
mira y cada fila se busca en él (Postgres lo vuelve un *hashed subplan*):

- `soy_profesor_de(s)` ⇔ `s in (select interno.alumnos_de(auth.uid()))`
- `supervisado_por_mi(s)` ⇔ `s in (select interno.supervisados_por_mi())`

`interno.supervisados_por_mi()` es el inverso **exacto** de
`supervisado_por_mi()` (las mismas tres vías de `supervisores_de()`, recorridas
desde el supervisor). No se usó `mis_supervisados()` porque esa suma además los
alumnos propios, y la política de supervisor tenía que dejar ver lo mismo que
antes, ni una fila más. Antes de aplicarlo se comparó, impersonando a cada una
de las 129 cuentas contra cada una de las 129, que las dos formas contestaran
igual (108 parejas supervisadas): cero diferencias. `training_progress` pasó de
8,5 s a 25 ms con las mismas 385 filas, y el informe entero de ese profesor, a
menos de medio segundo.

Se cambiaron las nueve políticas de SELECT de `training_progress`,
`training_state`, `platform_activity_log`, `class_attendance`,
`class_presence_log` y `question_answers` que tenían ese patrón (migración
`rls_actividad_conjunto_una_vez`). **Una política nueva sobre una tabla que
crece no llama a una función por fila con `student_id`: usa `student_id in
(select …)`.**

**Lo que arrastraba lo mismo en otras páginas.** Revisando los registros de
ese día: el panel de la Academia (`panel_profesor()`, en `clases.html`) se
había caído 16 veces por timeout con cuentas de coordinación, y
`tareas_con_avance()` una vez; las dos leen esas mismas tablas y bajaron solas
con el arreglo (el panel, de más de 8 s a ~1 s). Después se midió cada tabla de
más de 20 filas impersonando a coordinación, supervisión, administración y un
alumno: todas quedan por debajo de 0,4 s. La que seguía pagando por fila era
`formulario_respuestas` (~3 ms por respuesta, crece con cada inscripción): su
permiso depende solo del formulario, así que ahora se arma el conjunto de
formularios visibles una vez (`formulario_respuestas_rls_por_formulario`, cero
diferencias en las 129 cuentas, de 357 ms a 10 ms). `profiles` se rehízo igual
(`profiles_rls_conjunto_una_vez`): sus cinco vías —ser la propia cuenta, quien
administra, profesor de, mi profesor, compañero y coordinación— se arman como
conjuntos, y la de coordinación con `interno.bajo_mi_coordinacion_conjunto()`,
el inverso exacto de `bajo_mi_coordinacion()`: **si se cambia una de las dos,
se cambian las dos.** Cada pieza se comparó pareja por pareja (129 × 129, más
sin sesión) y después la vista completa de cada cuenta con la RLS de verdad:
cero diferencias. Leer `profiles` pasó de ~200 ms a menos de 10 ms, y con eso
`informes_inactivos()` bajó a 27 ms y `mis_clases()` a 14 ms. Quedan con
función por fila solo tablas chicas que no crecen con cada alumno.

**«Tablas chicas» no quería decir «baratas»** (30 de setiembre). Con una
cuenta de coordinación que también supervisa, `panel_profesor()` seguía en
~530 ms. Medido parte por parte con `EXPLAIN ANALYZE`, no eran
`tareas_con_avance()` (13 ms) ni `informes_diagnosticos_alumnos()` (30 ms):
eran tres `count(*)` sobre `tareas` (104 filas, 133 ms) y `class_sessions`
(24 filas, 175 y 153 ms). Sus políticas de SELECT llamaban por fila a
`supervisado_por_mi(alumno_id)`, `sesion_de_supervisado(id)` y
`es_mi_profesor(created_by)`, y cada llamada a `sesion_de_supervisado()` vuelve
a llamar a `supervisado_por_mi()` por cada asistencia: ~7 ms por clase. Se
armaron como conjuntos (`rls_tareas_y_clases_conjunto_una_vez`):

- `supervisado_por_mi(s)` ⇔ `s in (select interno.supervisados_por_mi())`
- `sesion_de_supervisado(id)` ⇔ `id in (select interno.sesiones_de_supervisados())`,
  el inverso exacto nuevo: las clases con asistencia de alguien que superviso o
  dadas por alguien que superviso.
- `es_mi_profesor(p)` ⇔ `p in (select interno.profesores_de((select auth.uid())))`

Antes de aplicarlo, cada forma nueva se comparó con la vieja para las 149
cuentas y sin sesión: cero diferencias. Después, lo que ve cada cuenta en las
dos tablas con la RLS de verdad dio la misma huella md5 que antes (1476 filas
de `class_sessions` y 370 de `tareas`). Medido tres veces seguidas con la misma
cuenta, el panel pasó de ~530 ms a ~150 ms, y `mis_clases()` quedó en ~20 ms
con un alumno y ~14 ms con un profesor. En la misma migración van los índices
de las cuatro claves foráneas que faltaban (`compras_tienda.otorgado_por`,
`notas_alumno.class_session_id`, `questions.para_alumno`,
`respuestas_en_curso.student_id`).

`practice_games_select` quedaba con `soy_profesor_de(student_id)` fila por
fila, y `practice_games` es la tabla publicada en Realtime que más se escribe
(703 cambios en la hora pico del 29 de setiembre): cada cambio se revisa
contra la política de cada persona suscrita. Pasó a
`student_id in (select interno.alumnos_de((select auth.uid())))`
(`tareas_con_avance_materializada_y_practice_games_conjunto_una_vez`).
Comprobado en una transacción revertida antes de aplicarlo: las 148 cuentas
ven las mismas filas (cero diferencias); un profesor pasó de 175 a 116 ms y
otro de 82 a 30 ms. **Realtime revisa la política con UNA fila** (cada cambio,
contra cada suscriptor que pasa el filtro), y ahí `practice_games` quedó igual:
6,5 ms por revisión antes y después.

**`game_rooms_select` se queda fila por fila, a propósito.** Pregunta
`soy_profesor_de_alguno()` y `es_companero()` por fila, y armado como conjunto
(los compañeros como `alumnos_de(profesores_de(yo)) ∩ gente_de_mis_academias()`)
contestaba igual para las 148 cuentas y leía la tabla entera 13 veces más
rápido (121 → 9 ms). Pero nadie la lee entera: las consultas reales de la hora
pico filtran por jugador («mi partida en curso», 298 por hora: 0,38 ms fila por
fila, 0,56 ms con conjunto) o por clase (63 por hora: 1,7 y 1,1 ms). Y en
Realtime, donde van las suscripciones sin filtro de `tv.js` y `torneo.js`, el
conjunto se arma entero para revisar una fila: **2,6 → 6,9 ms** por revisión.
Con `comparten_academia()` por candidato era peor: 89 ms. Regla: antes de
pasar una política a conjunto, medir **una fila sola** además de la tabla
entera; si la tabla está en Realtime y sus lecturas ya vienen filtradas, fila
por fila puede ser lo más barato.

### Una función SQL con CTE: el que se usa en varios lados va `materialized`

`tareas_con_avance()` tardaba **~5,9 s** a un profesor con 52 alumnos y a
quien administra (el tope es 8 s), y en la hora pico del 29 de setiembre dio
13 errores. **No era la RLS**: el mismo cuerpo, pegado como consulta suelta,
tardaba 80 ms. Llamado como función, Postgres lo planifica con los
parámetros sin valor (plan genérico) y **mete el CTE `avance` adentro de
`marcado` y `resumen`**: como lo lee uno solo, lo incrusta, y la expresión de
`hecho` —con su subconsulta a `training_progress`— se copia en cada lugar que
la usa. La subconsulta corría **15 785 veces en vez de 340**.

- **`avance as materialized`** lo calcula una vez por renglón. Comprobado antes
  de aplicarlo con copias temporales de las dos versiones: 148 cuentas × las 4
  formas en que la llama el sitio = 592 llamadas, **cero diferencias** en lo
  que devuelven (huella md5), y la peor pasó de 6 551 a 98 ms.
- **Cómo se detecta**: medir la función de verdad, impersonando, y compararla
  con su cuerpo pegado como consulta. Si la función es mucho más lenta, es el
  plan genérico; `set plan_cache_mode = force_generic_plan` + `prepare` lo
  reproduce y `explain analyze` muestra el `loops=` inflado.
- Un CTE que calcula algo caro y se lee más abajo en otra expresión va
  `materialized` desde el principio: con pocos datos no se nota, y el día que
  crece se cae por statement timeout.

### `auth.uid()` va envuelto: `(select auth.uid())`

La otra mitad del mismo costo: **150 políticas** llamaban a `auth.uid()` tal
cual, y Postgres la evalúa **una vez por fila** (el aviso `auth_rls_initplan`
de Supabase). Envuelta como `(select auth.uid())` se calcula una vez por
consulta: el mismo valor, sin el costo por fila. Se aplicó con
`rls_auth_uid_una_vez_por_consulta`, que no reescribe ninguna política a mano:
lee cada definición de `pg_policies`, cambia solo esa llamada y **se comprueba
a sí misma** (desenvuelta, cada una tiene que quedar idéntica a la vieja, o no
se aplica ninguna).

- Comprobado antes de aplicarlo, con la migración corrida en seco: lo que ve
  cada tipo de cuenta real (administración, alumno, coordinación, profesor,
  supervisión y sin sesión) en las 60 tablas tocadas, antes y después, **igual
  fila por fila**. Las dos únicas diferencias eran filas nuevas de actividad
  que entraron en esos minutos, y se confirmó contándolas sin la migración.
- Las tres tablas de actividad más grandes, leídas enteras, pasaron de 13 a
  5 ms para administración, de 27 a 15 ms para coordinación y de 34 a 26 ms
  para supervisión.
- **Una política nueva se escribe ya envuelta**: `(select auth.uid())`, nunca
  `auth.uid()` suelto. Queda fuera la única de `storage.objects`, que es de
  Supabase y no se puede alterar desde las migraciones.

**Las claves foráneas llevan índice** (`indices_de_claves_foraneas`, 54 de
una vez, armados desde el catálogo). Sin índice, borrar una cuenta recorre
entera cada tabla que la nombra. Hoy son tablas chicas; es para el día que no
lo sean. Una columna nueva que apunte a otra tabla lleva su índice en la misma
migración.

**Lo que NO se hizo, a propósito: fusionar las políticas «duplicadas»**
(`multiple_permissive_policies`, 42 avisos). Son varias políticas permisivas
para la misma acción —`…_select`, `…_select_supervisor`,
`…_coordinacion`—, y Postgres las evalúa todas. Juntarlas en una sola ahorraría
poco en tablas de este tamaño y borraría justo lo que hace legible el modelo de
permisos: cada vía con su nombre, que es como la citan estas notas y como se
revisa. Si una tabla con varias vías se vuelve lenta, se arma su conjunto una
vez, como arriba.

## Los módulos de Entrenamiento que no se veían

Ejercicios por tema, Visualización, Tipos de entrenamiento, Aperturas y
Precisión posicional no aparecían en Informes: el alumno practicaba y el
profesor solo veía los minutos. Los cuenta `informes_entreno_modulos()`
(migración `20260928130332`), y la página los muestra en las tarjetas de
«Ver todos los números» y en cinco temas nuevos del selector.

- **Es una función aparte, no columnas nuevas de
  `informes_resumen_alumnos()`**: esa la usan también clases, cobros,
  formularios y subgrupos, y cambiarle el tipo de retorno obliga a borrarla y
  volverla a crear.
- **`SECURITY INVOKER`**: cada quien recibe lo que la RLS de
  `training_progress` y `training_state` le deja ver. Comprobado impersonando
  en SQL: un profesor con 60 alumnos recibe esos 60 y nadie más; un alumno,
  solo su renglón; `anon` no la puede ejecutar.
- **Tipos, Aperturas y Precisión viven en el espejo `training_state`**, con el
  texto de localStorage tal cual (`value.raw`). `json_seguro()` devuelve NULL si
  está roto, y cada forma (objeto, lista) se separa en su propio CTE
  **materializado** antes de abrirla con `jsonb_each` o `jsonb_array_length`:
  un `AND` no asegura el orden en que Postgres lo evalúa, y un solo valor raro
  tumbaría el informe de todo el grupo. Por lo mismo, cada cast va dentro de un
  `CASE`.
- **«Sin error ni pista»** es el porcentaje de los ejercicios de Temas y
  Táctica que salieron limpios, **sobre los que ya guardan cómo salieron**
  (`detail.limpio`, desde #491), no sobre todos: los de antes no lo saben, y
  contarlos como «no limpios» diría que el alumno empeoró el día del cambio.
- Las tarjetas nuevas van todas en la segunda fila (`extra`): las ocho que se
  miran de verdad siguen siendo ocho. `verificar-informes.js` lo cuenta.

### El tema más flojo

Desde #491 cada ejercicio de Temas guarda si salió limpio; con eso
`informes_tema_mas_flojo(p_temas)` (SECURITY INVOKER, una fila por alumno) dice
en qué MOTIVO le cuesta más: «Clavada · 36 % — limpio en 4 de 11». Es una
tarjeta más de segunda fila (eran catorce; con los Finales contra la máquina, quince) y el mismo dato alimenta el
«Hoy te toca» del hub (ver «El tema más flojo, en el hub» en entrenamiento.md).

- **La lista de motivos la manda la página**, desde
  `entreno/data/temas-motivos.json`, que genera `herramientas/temas-motivos.js`
  desde `temas.json`. La base no guarda su copia: una lista escrita en SQL se
  quedaría vieja el día que se sume un tema, sin ningún error. Quedan fuera
  «Mezcla», las fases, las duraciones y el origen: no dicen qué practicar.
- **Desde 5 ejercicios distintos del mismo motivo** con «cómo salió»: con
  menos, un solo error lo pone en 0 % y lo haría el más flojo. Sin eso la
  tarjeta dice qué falta, no un cero.
- Permisos comprobados impersonando en SQL: cada alumno recibe solo su fila,
  un profesor la de sus alumnos, `anon` no tiene execute.
- `verificar-tema-flojo.js` (sin navegador) cuida que el JSON esté al día y que
  la función sea INVOKER; `verificar-informes.js`, la tarjeta y que a la base
  se le manden los motivos y no «Mezcla».

### El tipo de entrenamiento más flojo

La misma idea que el tema, para Tipos de entrenamiento:
`informes_tipo_mas_flojo()` (SECURITY INVOKER, una fila por alumno, migración
`20260929172136`) dice en qué tipo le cuesta más sacar tres estrellas:
«La balanza · 38 % — tres estrellas en 3 de 8». Es una tarjeta más de la
segunda fila (ahora son diecisiete).

- **Mira `estrellas`, no `limpio`**:
  - cada ejercicio de Tipos se registra una vez, la primera que se resuelve,
    con sus estrellas (desde #555);
  - `limpio` se sumó después (#559);
  - tres estrellas es limpio en todos los tipos, así que las filas viejas
    también cuentan.
- **Desde 5 ejercicios distintos de un mismo tipo**, como el tema. Sin eso,
  la tarjeta dice qué falta.
- El nombre del tipo lo pone `js/tipo-flojo.js` con `js/tipos-catalogo.js`,
  el mismo catálogo de la página: la base solo manda la clave.
- Se comprobó en la base con filas de prueba (revertidas) e impersonando a un
  alumno:
  - «detective» (40 %) sale antes que «balanza» (83 %);
  - un tipo con 3 ejercicios no entra;
  - un ejercicio repetido cuenta una vez;
  - cada alumno ve solo su fila.
- `verificar-informes.js` prueba la tarjeta y el nombre.
- **«Mandarle 10 de La balanza →»**: en la ficha de un alumno, la tarjeta trae
  un enlace a `tareas.html?alumno=<id>&material=tipos&recorte=balanza&cantidad=10`,
  que deja el renglón armado (ver «Del informe a la tarea, con el renglón
  armado» en `seguimiento-del-alumno.md`). El profe veía el hueco y tenía que
  ir a Tareas a buscar ese mismo tipo en la lista.
  - Solo lo ve quien puede mandar tareas (`profesor` o `is_admin`, como
    `puedeAsignar` en `tareas.js`) y no en «Ver como» otra persona. El alumno
    que mira su propio informe no lo tiene.
  - El helper `tarjeta()` del verificador busca la etiqueta en el tercer hijo
    de la tarjeta, no en el último: el enlace va debajo.

## Los errores de sus partidas

«Tus propios errores» (Tipos de entrenamiento, ver «El tipo 18: Tus propios
errores» en entrenamiento.md) revisa las partidas del alumno en SU navegador y
deja los ejercicios en su `training_state`. El informe de un alumno trae el
panel **«🪞 Errores de las partidas de …»**: cuántas partidas revisó, cuántos
errores salieron (en cuántos regaló y en cuántos se le escapó la ventaja),
cuántos ya resolvió, y los cinco más recientes con «Ver todos»: cuándo, qué
jugó, cómo cambió la evaluación, qué era lo bueno y si ya lo resolvió (con ✓ y
✗ escritos, no solo en color).

- **No hace falta nada nuevo en la base**: `training_state` ya la leen los
  profesores del alumno, quien supervisa y administración (ver «La RLS de las
  tablas de actividad arma el conjunto UNA vez»). Una consulta, acotada a ESE
  alumno y a sus tres claves (`errores_propios_v1`, `errores_analizadas_v1` y
  `tipos_estrellas_v1`, de donde salen las estrellas de cada uno).
- **No se le cree nada a lo guardado**: lo escribió el navegador del alumno y
  se puede tocar desde la consola. `ErroresPropios.deFilas()` descarta lo que no
  tenga forma de ejercicio —una «jugada» que no es una jugada, un nivel que no
  existe, un JSON roto— y todo se pinta con `textContent`. El verificador mete
  una «jugada» que es `<img onerror>` y exige que ni aparezca.
- **Si no revisó nunca sus partidas**, el panel lo dice y explica dónde se
  hace, en vez de un «0 errores» que parecería una buena noticia.
- Va solo en el informe del profesor: el alumno ya los ve, y los juega, en
  Tipos de entrenamiento.
- **De paso**: la regla «no pide ninguna tabla de actividad» de
  `verificar-informes.js` **nunca podía saltar**: probaba la expresión contra
  el objeto de cada consulta y no contra su etiqueta, y `"[object Object]"` no
  calza con nada. Ahora mira la etiqueta y dice lo que quería decir: ninguna de
  esas tablas se pide **sin acotarla a un alumno** (la comparación de
  diagnósticos y este panel piden lo de uno, y está bien). Rota a propósito
  —la consulta de diagnósticos sin `student_id`—, salta.

### Llevar sus errores a un plan de clase

Debajo de la lista, el profesor tiene **«📋 Llevar N errores a un plan de
clase»**: crea un plan (`planes_clase` + `plan_items`, con la API de
`js/plan-clase.js`, igual que «Lo que le costó a tu clase») con hasta 12
posiciones, **primero las que el alumno todavía no resolvió**. Cada una va como
ítem `posicion` con su FEN, el título (la partida, la jugada y el tema) y la
pregunta «¿Qué jugarías? En la partida se jugó X; lo bueno: Y o Z.». En la
clase se abre el plan y cada posición va al tablero con un toque.

- **Ninguna posición se inventa**: son las de sus partidas, y antes de
  guardarlas pasan por `PosicionValida.motivo()` (la que no sea una posición
  legal se salta).
- Solo para quien da clase (`role = profesor`) y no en «Ver como»: una cuenta
  que solo administra no da clase, y un plan armado mirando como otra persona
  quedaría a nombre de quien mira.
- El aviso termina con «Abrir el plan» (`planes.html?plan=<id>`).
  `verificar-informes.js` comprueba el plan, sus ítems, el orden (sin resolver
  primero: roto a propósito, salta) y el enlace.

### Los temas de los errores de todo el grupo

La vista de grupo trae **«🪞 Los errores de las partidas del grupo»**: los
temas que más se repiten en los errores de los alumnos del grupo elegido
arriba, con cuántos errores y en cuántos alumnos, y el enlace a practicar cada
uno en «Ejercicios por tema». Sirve para decidir la próxima clase.

- **Lo cuenta la base**: `errores_temas_del_grupo(p_alumnos)` (migración
  `20260929190705`), `SECURITY INVOKER` sobre `training_state`, así que ve lo
  que ya dejaba ver su RLS y nada más (se comprobó impersonando a un profesor:
  el alumno de otra academia no suma; y a un alumno: solo lo suyo). Bajarse
  los ejercicios de cada alumno para sumarlos en el navegador chocaría con el
  corte de ~1000 filas.
- `p_alumnos` son los del grupo o subgrupo del filtro: la lista **sigue al
  filtro**. El doble del verificador contesta distinto según los alumnos que
  se le pasen (`rpcPorArgs`); mandar siempre a todos, a propósito, lo hace
  saltar.
- El JSON lo escribió el navegador del alumno: un `raw` roto se salta
  (`interno.jsonb_o_nulo`), solo cuenta lo que tenga `id` y `fen`, y el tema
  tiene que tener forma de clave. En la página, además, solo se pinta un tema
  que `PreparacionTactica.TEMAS` sabe nombrar, y nunca «otra».
- Una respuesta vieja no pisa a la nueva si se cambia de grupo antes de que
  conteste (`erroresGrupoVez`).

### Las celadas en que más cae el grupo

Debajo de los temas, la vista de grupo dice en qué celadas del banco de
Aperturas cae más el grupo («Celada Blackburne · 3 veces en 2 alumnos»), con el
enlace a la línea en Aperturas.

- **Lo cuenta la base**: `errores_celadas_del_grupo(p_alumnos)` (migración
  `20260930050951`), `SECURITY INVOKER` sobre `training_state`, igual que la de
  los temas: suma el campo `celada` que «Tus propios errores» anota en cada
  ejercicio. Comprobado impersonando a un profesor (el alumno de otra academia
  no suma) y a un alumno (solo lo suyo). Solo cuentan un id con forma de id y
  una posición con forma de FEN; en la página, además, solo se pinta una
  celada que esté en el banco.
- Devuelve también la posición de **una** de esas veces, para el plan: quien
  da clase tiene «Armar un plan de clase con esta celada», que crea un plan con
  dos posiciones: donde cayó el grupo (si es una posición legal,
  `PosicionValida`) y cómo termina la línea del banco, reproducida con
  chess.js. En las notas, la idea, la clave y la línea entera en castellano.
  Ninguna posición se inventa.
- Sigue al filtro de grupo, como los temas; el verificador lo rompe a propósito
  (mandar siempre a todos) y salta.

### La curva de sus errores

El informe de cada alumno trae, al final del panel de sus errores, la misma
curva que ve él en su ficha: errores por partida revisada, mes a mes, y si
mejora (ver «¿Cometes menos errores?» en entrenamiento.md). Sale de
`ErroresPropios.deFilas()`, que la arma con las revisadas que traen cuenta.

### Sus partidas de torneo

Al pie del mismo panel, «Partidas de torneo que anotó»: las que el alumno
copió de su planilla en «Tus propios errores» (`partidas_torneo`, ver «Mis
partidas de torneo» en entrenamiento.md). Las últimas 10 con el total exacto
(`count`), cómo le fue en ellas, el Elo del rival si lo anotó, el torneo y las
jugadas plegadas en castellano. Lo que no tiene forma de jugada se descarta y
todo va por `textContent`. Si se cambia de alumno antes de que conteste, la
respuesta vieja no se pinta (`torneoVez`).

## Los informes que llegan a la casa

En Informes, mirando a UN alumno, está "📧 Informes a la casa": a qué correos se
le manda su informe y cada cuánto (diario, semanal, mensual o anual). Sale solo,
sin que nadie apriete nada. **Es lo primero que el sitio manda por su cuenta**:
hasta ahora el correo lo escribía siempre una persona (el `mailto:` del examen
de arbitraje).

- `encargados` (alumno, nombre, correo, frecuencia, activo, último envío). La
  persona encargada **no tiene cuenta en el sitio ni la necesita**: solo un
  correo. Los maneja cualquiera de los profesores del alumno, y quien
  administra. Quitar uno que apuntaste tú no pregunta: ofrece «Deshacer» (ver
  «Los avisos son de la página, no del navegador»).
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
- **Lleva la foto de perfil del alumno** al lado de su nombre, adjunta dentro
  del correo (`cid:`), nunca como dirección. Ver «En el informe que llega a la
  casa» en `permisos-y-roles.md`.
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

#### El lote solo lleva a los alumnos que la base te deja escribir

Una profesora que además supervisa apretó el botón y le salió «Se compartieron
0 de 28 … new row violates row-level security policy». El informe de quien
supervisa muestra también a los alumnos que **solo supervisa**, y la política de
`training_plans` pide `is_admin` o `soy_profesor_de()`. Como el lote es **un
solo insert**, bastó uno de esos para que la base rechazara los 28.

- La página pregunta a la base cuáles son sus alumnos
  (`alumnos_del_profesor_con_nombre()`, que usa `interno.alumnos_de()`, lo
  mismo que `soy_profesor_de()`: comprobado con su cuenta, coinciden los 62) y
  el lote, el contador «N planes sin compartir» y el plan de cada alumno solo
  ofrecen escribir esos. Los demás se cuentan aparte: «no son alumnos tuyos: los
  comparte su profesor». Quien administra los puede todos; «Ver como» no
  publica nada.
- Al alumno ajeno el plan se le ve igual, pero **de solo lectura**: sin
  «Editar», «Recalcular» ni los botones de guardar, que la base rechazaría.

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

### «Esta semana: 48 ejercicios (la anterior, 31)» en el informe a la casa

La casa veía minutos, días y clases, pero no si el alumno venía mejorando. El
informe ahora dice, debajo de las tres tarjetas: «📈 Esta semana: 48 ejercicios
(la anterior, 31) · 70 % le salieron sin error ni pista (la anterior, 62 %).»
Es lo mismo que el alumno ve como «Tu semana» en su hub.

- La cuenta la hace `public.entreno_comparado(p_alumno, p_desde, p_hasta)`
  (SECURITY INVOKER, migración `20260929201700`): el periodo del informe contra
  el anterior **del mismo largo** (la semana, el mes, ayer). Se suma a la cola
  de `informe_de_alumno()` a partir de su definición vigente, como los premios:
  no se copia a mano la función entera.
- El porcentaje sale solo de los ejercicios que dicen cómo salieron
  (`detail ? 'limpio'`); los que no lo dicen no cuentan ni a favor ni en contra.
- Cada frecuencia con sus palabras: «Hoy … (ayer, 3)», «Este mes … (el
  anterior no entrenó)».
- **Sin ejercicios en el periodo la línea no sale**: el veredicto de arriba ya
  dice que no entró, y «0 ejercicios» solo lo repetiría. Tampoco sale con una
  base de antes, sin la clave `comparacion`.
- Se comprobó en la base con filas de prueba revertidas: tres filas en la
  semana (dos con «cómo salió», una limpia), una en la anterior y una de hace
  19 días que no entra; y otro alumno ve ceros.
- `verificar-informe-casa.js` prueba el semanal, el mensual sin periodo
  anterior, el caso en cero y la base sin la clave.

### Unas palabras de su profe

El correo a la casa lo arma el sitio solo. Lo único escrito por una persona era
la nota del plan, que dura cuatro semanas y solo sale si el plan está
compartido: el profe no tenía cómo decirle a la familia «esta semana le costó
arrancar, el jueves lo vemos». Ahora, en «📧 Informes a la casa» de cada
alumno, está **«✍️ Unas palabras para la casa»**: un mensaje que sale arriba
del próximo informe, pegado al veredicto, firmado con el nombre del profe.

- **Se arma con frases listas según cómo viene el alumno**
  (`js/plantillas-casa.js`): «Va bien», «Practicó poco», «No entró» y
  «Tiene entregas vencidas», más unas que sirven siempre. Tocar una la suma al
  mensaje con los datos puestos (el nombre, «2 días de 7», el área del plan) y
  el profe la ajusta antes de mandarla.
- **Cómo viene NO se calcula en la página.** Lo contesta la Edge Function
  (acción `situacion`) con `situacionParaPlantillas()`, que usa la MISMA
  `comoVa()` que pinta la franja del correo. Si las frases salieran de otra
  cuenta, el profe le escribiría «¡qué buena semana!» a la casa justo encima de
  una franja que dice «Practicó poco», y nada fallaría.
- **Una frase que necesita un dato solo se ofrece si el dato existe**: la de
  «hizo más ejercicios que la semana anterior» pide que de verdad haya hecho
  más; la del área, que haya plan. Y ninguna adivina el género del alumno
  («Gracias por el apoyo», no «por acompañarlo»).
- **Las plantillas propias** (`plantillas_casa`) son solo de quien las guardó
  (una política `for all` con `profesor_id`). Al guardar, el nombre del alumno
  pasa a ser `{nombre}`, solo como palabra entera (Ana sí, Anabel no): si no,
  la plantilla le diría «Ana» a la familia de Bruno. Se guarda para la
  situación en que está el alumno, o para cualquiera si se marca.
- **Qué mensajes van en cada informe NO se guarda: se calcula.** Van los
  escritos dentro del periodo que cubre ese informe —el semanal, los de la
  semana— y como mucho los tres últimos. Así cada encargado lo recibe una vez
  con su frecuencia, sin una marca de «ya enviado» que se desincronice con
  cada encargado. Quitarlo lo saca de los que todavía no salieron.
- **Los lee `mensajes_casa_de()`, que es `SECURITY DEFINER`**, con el mismo
  permiso que `resumen_tareas_examenes()` (el alumno, administración,
  `soy_profesor_de()`, su supervisión; `auth.uid()` nulo es la tanda), y se
  suma a la cola de `informe_de_alumno()` como el Elo. La tanda, la vista
  previa del profe y la de quien supervisa ven el mismo informe.
- **La base pone las reglas**: escribe quien da clase al alumno (o
  administración) y siempre a su nombre (`autor_id = auth.uid()`); no se
  edita (se quita y se escribe otro); lo quita solo su autor; la fecha la pone
  la base, que decide en qué informe sale; y hay un tope de 5 por alumno al
  día, porque es un mensaje para la familia, no un chat. El alumno lo puede
  leer: es lo que le llega a su casa.
- **«Ver como» una persona** muestra el bloque pero no deja escribir: sería un
  mensaje firmado por otra persona.

Comprobado impersonando roles en SQL: el profe del alumno escribe y lo ve en
la función; firmar con el `autor_id` de otro se rechaza; una profesora que no
es de ese alumno no ve nada, no escribe y la función le da excepción; el
alumno lo lee pero no escribe ni edita; y la tanda lo recibe con el nombre del
profe, y un periodo anterior no lo trae.

**Al tocarlo, correr `node herramientas/verificar-informe-casa.js` y
`verificar-informes.js`.** El primero mira el bloque en el correo (escapado,
sin mensajes no sale, va antes del plan) y que las cuatro situaciones lleguen
con su clave. El segundo, la pantalla: las frases de la situación, la plantilla
propia primero y la de otra situación fuera, ninguna llave sin llenar, lo que se
guarda y el `{nombre}` de la plantilla.

**Esto destapó un hueco del propio verificador**: su `igual()` comparaba con
`String()`, y dos objetos cualesquiera dan «[object Object]». Todas las pruebas
de lo que se escribe (agregar un encargado, «Deshacer»…) pasaban sin comparar
nada. Ahora compara el contenido; salió una sola expectativa vieja mal escrita
(la página estaba bien). `verificar-clase-registrada.js`, `verificar-notas.js`,
`verificar-planes.js`, `verificar-camino-entrenador.js` y
`verificar-temas-plataforma.js` tenían el mismo `igual()` y ya comparan el
contenido. En esos cinco no escondía nada —sus 200 y tantas comprobaciones
comparan textos y números—, pero la primera que comparara un objeto habría
pasado siempre. (El `cmp` de los dobles de otros verificadores compara valores
de columnas, no objetos, y está bien.)

### Lo que juega en Lichess y Chess.com

El profe veía lo que el alumno preparaba («Mi repertorio») pero no lo que
juega de verdad. Ahora el alumno pone en Configuración sus usuarios de Lichess
y Chess.com, su navegador baja sus últimas partidas públicas (hasta 300 por
cuenta) y las analiza, y su profe lo ve en Informes, en «♞ Sus aperturas».

- **No es un análisis nuevo: es el de la preparación de rivales**
  (`js/preparacion-analisis.js`), aplicado al propio alumno. Los puntos
  fuertes y débiles son sus mismas frases, con sus mismos umbrales (una línea
  es fuerte o débil con z ≥ 1,28 y 5 puntos de diferencia con su promedio con
  ese color, y nunca con menos partidas que el mínimo). Con pocas partidas no
  sale ninguna, y está bien: no se inventa una tendencia.
- **Su repertorio contra lo que juega** (`AnalisisAlumno.cruce`): con blancas,
  si su primera jugada preparada es la que juega; con negras, si contra cada
  primera jugada del rival contesta lo que preparó. «Es lo que juega» pide la
  mitad de las partidas o más; sin muestra, «muy pocas partidas para saber».
- **Las dos cuentas son una persona**: la segunda se renombra como la primera
  antes de analizar (`unirCuentas`), si no se analizarían como dos jugadores.
- **Se guarda solo lo que se pinta** (`reducir`): el análisis entero trae el
  libro y la táctica, que acá no se usan y lo harían diez veces más pesado.
  Las partidas no se guardan nunca, igual que en la preparación.
- **`analisis_partidas_alumno`, una fila por alumno.** La escriben el alumno,
  quien le da clase o administración (el profe puede poner los usuarios él
  mismo y «Volver a analizar» desde Informes, con su navegador); la leen
  ellos y su supervisión. La base anota quién y cuándo analizó, y si cambian
  los usuarios sin un análisis nuevo, borra el viejo: no se le muestra al
  profe lo de otra cuenta. Con los dos campos vacíos, el alumno borra su fila.
- **El bloque va plegado y se pide al abrirlo**, como «Informes a la casa»: no
  se piden dos tablas en cada alumno que se mira.
- **La política de privacidad lo dice** (versión 2026-10-04): esos usuarios
  quedan en la cuenta con el resumen, y quién los ve.

Comprobado impersonando roles en SQL: el alumno guarda y queda anotado como
quien analizó; a nombre de otro y un usuario mal escrito se rechazan; su profe
lo ve, lo vuelve a analizar y queda anotado él; cambiar los usuarios borra el
análisis; una profesora ajena no ve ni cambia nada.

**Al tocarlo, correr `node herramientas/verificar-todo.js analisis-alumno
informes`.** El primero analiza partidas armadas con chess.js (sin navegador)
y comprueba la comparación, y en Configuración —con Lichess y Chess.com de
mentira— que baje de los dos, junte las cuentas, guarde una fila por alumno
sin las partidas y que vacío borre. El segundo, «Sus aperturas» del profe:
sus líneas, la comparación, fuertes y débiles, y nada de otro alumno.

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

### El Elo oficial, mes a mes

La casa sabía cuánto practicó, pero no si el alumno **juega mejor**. El
número que lo dice es el Elo oficial, y ya es público: la FIDE lo publica en
ratings.fide.com y la clasificación nacional de Costa Rica en
ajedrezcostarica.com. Faltaba leerlo solo, guardarlo mes a mes y decirlo.

- **El alumno pone su código FIDE en Configuración** («Tu código FIDE»), y
  su profesor (o administración) también desde Informes, en el recuadro
  «Elo del alumno» de la ficha del diagnóstico, que lee el código y el último
  Elo oficial al abrirse (el resumen del grupo no trae el código). Lo
  guarda `guardar_fide_id(persona, código)`, que deja hacerlo a la propia
  persona, a cualquiera de sus profesores y a administración
  (`puedo_cambiar_fide_id()`, que es la misma pregunta que se hace la Edge
  Function). Solo números, de 4 a 10 cifras; un código con letras no llega a
  la base.
- **La Edge Function `elo-fide`** lee dos cosas: la ficha de la FIDE
  (Estándar, y el nombre como lo tiene la FIDE) y la clasificación nacional
  (Nacional). Guarda **una fila por alumno y mes** en `elo_historial` (el mes
  de Costa Rica en que se leyó; leer dos veces en el mismo mes pisa la fila,
  así vale lo último que publicó cada lista ese mes).
- **Se lee sola**: `pg_cron` (`elo-fide-nacional`, 9:10 UTC = 3:10 a. m. en
  Costa Rica) dispara la tanda todos los días, firmada con el secreto
  `tanda_elo_secreto` de la bóveda (misma idea que la tanda de los informes,
  por eso `verify_jwt` va en false). La tanda solo lee a quien no tiene
  lectura este mes o la tiene de hace más de una semana: la FIDE publica el
  día 1 y la nacional cuando sale, así que a más tardar en una semana se ve
  el cambio, sin pedirle nada a nadie más de una vez por semana. Y al
  guardar el código en Configuración se lee en ese momento, para que se vea
  enseguida si era el bueno.
- **La lista nacional no se deja buscar por código, solo por nombre.** Se
  busca por los apellidos tal como los tiene la FIDE («Angulo Cubero» de
  «Angulo Cubero, Oscar»), después el nombre entero y por último el primer
  apellido, y de lo que vuelve **se elige la fila con ESE código FIDE**: por
  nombre hay homónimos (verificado: «Angulo Cubero» trae dos personas).
- **Nunca se inventa un número.** La página es Next.js y trae los jugadores
  como JSON escapado dentro de un `<script>`; la ficha de la FIDE, el
  Estándar en un `<p>` del bloque `profile-standart`. Si el formato cambia, el
  lector (`elo-fide/leer-elo.ts`) devuelve null, no 0. Un rating de 0 («sin
  rating» en la lista nacional) o «Not rated» en la FIDE es null. Y **un
  código que no existe contesta 200** en ratings.fide.com, con el título
  genérico «Chess Players Arbiters Trainers Database FIDE Profile»: por eso lo
  que manda es el bloque de ratings, no el título. Si ninguna de las dos
  páginas encuentra el código, no se escribe nada y la tanda lo reintenta.
- **Cambiar el código borra el historial.** Era de otra ficha (casi siempre
  un número mal copiado), y comparar el Elo de dos personas le diría a la
  casa que subió o bajó sin que pasara nada.
- **El Elo leído pasa a `profiles.elo`**, el que usa el diagnóstico de nivel:
  el FIDE si lo tiene (`elo_tipo = 'fide'`, ± 100), si no el nacional (± 150).
  Uno declarado a mano o «en línea» es menos preciso que estos.
- **En el informe a la casa**, `elo_de_alumno()` (INVOKER, dentro de
  `informe_de_alumno()` como los premios y la comparación) da el mes más
  reciente y el anterior que haya, y el correo dice «♟️ Su Elo oficial
  (septiembre) · FIDE Estándar 1523 · subió 12 desde agosto · Nacional (Costa
  Rica) 1610 · bajó 7 desde agosto». Con «subió» y «bajó» escritos: una
  flecha de color no le dice nada a quien no distingue el color. Sin código
  FIDE, o sin ningún Elo leído, el bloque no sale; un rating que no tiene no
  se nombra (nada de «FIDE Estándar 0»).
- **Quién lo ve**: la RLS de `elo_historial` (solo SELECT) deja ver al propio
  alumno, sus profesores, administración, su coordinación y su supervisión.
  Nadie escribe desde afuera: solo la función, con la service role.
  Comprobado impersonando roles en SQL: el alumno y una profesora suya ven la
  fila y pueden cambiar el código; un profesor que no lo tiene no ve nada y
  se lleva una excepción al intentar cambiarlo; un insert directo da
  «permission denied».
- **Es un proveedor nuevo que recibe datos**: la FIDE recibe el código y
  ajedrezcostarica.com los apellidos. Está en la lista de `privacidad.html`, y
  el código FIDE en «Qué datos».
- Comprobado de punta a punta en la base: con el código 6501435 la tanda
  guardó FIDE 2152 y Nacional 2268, igual que lo que publican las dos
  páginas; y con una firma inventada responde 401.

`herramientas/verificar-elo-fide.js` prueba el lector contra extractos del
HTML real de las dos páginas (sin red), `verificar-elo-configuracion.js` la
pantalla de Configuración con su doble, `verificar-informes.js` el campo del
profesor en Informes, y `verificar-informe-casa.js` el
bloque del correo (subió, bajó, igual, sin FIDE, primer mes, sin datos).

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

## El informe mensual para el CCDR San José

El Comité Cantonal de Deportes y Recreación de San José le pide al entrenador
un informe técnico cada mes, en Word y con su propia guía: los datos del mes,
nueve preguntas (atletas, lugar y horarios, etapa del macrociclo, pruebas y
resultados, lesiones, forma deportiva, requerimientos, otros) y la firma. No
sale de una pantalla del sitio: lo arma Claude con lo que el entrenador deja
en una carpeta de Drive. El paso a paso está en
`.claude/skills/informe-ccdr/SKILL.md`; esto es el porqué.

- **El armador no sabe nada del mes.** `herramientas/informe-ccdr.js` recibe
  un JSON y saca el Word; los nombres, la asistencia y las fotos son de
  menores de edad y viven en la carpeta de trabajo de la sesión, nunca en git
  (`informes-ccdr/` está en `.gitignore` y en `.assetsignore` por si alguien
  los guarda acá). El verificador lo arma con datos inventados.
- **Lo que no sale de un dato va en amarillo** (`{"pend": …}`): que no hubo
  lesiones, lo psicológico, los requerimientos, la sede que no se encontró.
  El informe lo firma una persona; lo que Claude supuso tiene que verse como
  supuesto, no como dato. El verificador revisa que el resaltado no se pierda.
- **chess-results se pide desde la base.** La red de las sesiones no llega a
  ese sitio; `pg_net` sí (como en «Las posiciones oficiales vienen de
  chess-results»). Los parámetros van en `params`: con `headers`, el servidor
  de chess-results contesta 400. La sede no se puede leer, porque está detrás
  de un botón que pide un postback, así que va como «[completar]».
- **Las fotos no pasan por la conversación.** El conector de Drive devuelve
  cada archivo en base64; una foto es demasiado grande para la conversación,
  así que Claude Code guarda la respuesta en un archivo, y
  `herramientas/informe-ccdr-fotos.py` lo decodifica y lo achica. Copiar el
  base64 a mano no es una opción: son cientos de miles de caracteres por
  foto. Las que traen la marca «Contenido generado por IA» no van a un
  informe oficial.
- **Asistencia: sin el cuerpo técnico y sin adivinar.** Un nombre de cuenta de
  Meet se junta con un atleta solo si la coincidencia es clara; las cuentas de
  familiares van aparte como «otras cuentas».
