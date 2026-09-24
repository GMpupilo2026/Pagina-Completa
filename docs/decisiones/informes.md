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
