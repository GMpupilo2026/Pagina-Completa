# Permisos y roles

Notas de diseño para Claude, sacadas del CLAUDE.md de la raíz: quién ve y toca qué: profesores, equipos, subgrupos, coordinación, supervisión, academias y la seguridad de la base.
El índice de todos los temas y las reglas que valen para todo el sitio
están en `CLAUDE.md`.

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

### El supervisor: coordinación sin entrenar, sobre lo que le asignan

Quien coordina recibía el panel entero de profesor —ejercicios, juegos, la
clase en vivo— cuando lo suyo es administrativo. El **supervisor** es ese
papel puesto en limpio: ve el informe de sus estudiantes a cargo tema por tema
(qué hacen y cuánto tiempo), corrige sus cuentas como lo haría quien administra
y llega a cobros, formularios, solicitudes y reportes. No entrena ni juega.

- **Es una marca encima de `role = 'profesor'`** (`profiles.es_supervisor`,
  CHECK `profiles_supervisor_es_profesor`), por la misma razón que
  `es_coordinador`: un tercer valor de `role` obligaría a revisar todas las
  comprobaciones de `role === "profesor"`. La pone y la quita
  `marcar_supervisor()`, que exige `is_admin`; el trigger de identidad la
  revierte salvo con la marca local `ajedrez.nombrando_supervisor`, y la
  función vuelve a leer la fila (la trampa de siempre).
- **Sobre quién lo decide `public.supervisor_cuentas`**, que solo escribe
  `set_cuentas_del_supervisor()` (exige `is_admin`, deja la lista EXACTAMENTE
  como llega). Alcanza a las cuentas asignadas **y a los alumnos de los
  profesores asignados**: la pregunta es `supervisado_por_mi(persona)`, y
  `mis_supervisados()` da la lista.
- **Hereda todo lo de coordinación sin tocar una política**: `soy_coordinador()`
  da `true` a quien supervisa y `bajo_mi_coordinacion()` suma su rama
  (`supervisado_por_mi`), así que `cambiar_rol`, `coord_guardar_cuenta`,
  `coord_set_profesores`, `mi_gente`, cobros y formularios ya lo acotan.
- **Leer la actividad pidió políticas nuevas**, solo `SELECT` y con el sufijo
  `_select_supervisor`, en `training_progress`, `training_state`,
  `platform_activity_log`, `class_attendance`, `class_presence_log`,
  `question_answers`, `training_plans`, `course_unlocks`, `encargados`,
  `tareas`, `examenes` y `class_sessions` (esta vía `sesion_de_supervisado()`,
  `SECURITY DEFINER` con `row_security off` para no morderse la cola con
  `class_attendance`). Las funciones de informes son `SECURITY INVOKER`, así
  que con eso cuentan solas; `resumen_tareas_examenes()` —que es DEFINER y
  pregunta a mano— suma `supervisado_por_mi()`.
- **La bitácora la LEE, y no con una política.** `notas_alumno` está aislada
  por profesor, así que abrirle un `select` le daría las notas sueltas y sin
  autor —la RLS de `profiles` no le deja ver a los profesores—. Las sirve
  `public.bitacora_supervisada(alumno)`, `SECURITY DEFINER`: exige
  `supervisado_por_mi()` (o administrar) y devuelve las notas de TODOS sus
  profesores con el nombre de quien escribió cada una. Escribir, compartir y
  borrar siguen siendo de quien la escribió: ninguna política cambió. En
  Informes, `NotasAlumno.montarLectura(…, { supervisor: true })` la pinta sin
  un solo control y con «De Karina Rojas» en cada nota. Comprobado
  impersonando en SQL (revertido): con el alumno asignado ve las 2 notas de sus
  2 profesores, por la tabla directa ve 0, su update cambia 0 filas, y con un
  alumno ajeno —o siendo un profesor cualquiera— la función se niega.
- **Informes filtra por `mis_supervisados()`**: la RLS de `profiles` le deja
  ver también a «compañeros» sin ni un dato, y el informe los mezclaba.
- **Su panel se pinta ENTERO aparte** (`SUPERVISOR_GROUPS` en `clases.html`),
  no recortando el del equipo docente: cada tema de Informes es una tarjeta
  que abre `informes.html?tema=…`, más Cuentas, Cobros, Formularios,
  Solicitudes y Reportes. Sin clase en vivo ni registro de clases.
- Comprobado impersonando en SQL (revertido): con un alumno asignado ve sus 514
  filas de progreso y 0 de uno ajeno, `bajo_mi_coordinacion` da `true` y
  `false` respectivamente, y sus secciones de tiempo salen.

### El supervisor supervisa también a los PROFESORES, y ellos le mandan un informe mensual

Leer a los alumnos de un profesor no dice qué hizo el profesor. Por eso quien
supervisa tiene además `supervision.html` (tarjeta «Supervisión de profesores»,
grupo «Tus profesores» de su panel; quien administra la tiene en Herramientas y
en `admin.html` › Reportes) y cada profesor tiene `informe-mensual.html`
(tarjeta «Informe mensual» en Herramientas, junto a Asistencia presencial).

- **La actividad de un profesor en un mes la cuenta UNA función,
  `public.actividad_profesor(profesor, mes)`**: alumnos a cargo y cuántos
  entrenaron, ejercicios de esos alumnos, clases en línea y presenciales con su
  tiempo y asistencias, tareas puestas/terminadas/vencidas (con
  `tareas_con_avance()`, nunca la columna `estado`), exámenes puestos y
  rendidos con su nota promedio, notas de bitácora y planes nuevos. La usan las
  dos pantallas y la foto que viaja con el informe: si cada una contara por su
  lado, el profesor mandaría unos números y su supervisora leería otros. Es
  `SECURITY DEFINER` y pregunta arriba quién puede (el propio profesor,
  `supervisado_por_mi()` o administrar). El mes va en hora de Costa Rica.
- **`resumen_profesores_supervisados(mes)`** da los profesores asignados
  directo a esa supervisión en `supervisor_cuentas` (a quien administra, todos)
  con su actividad y si mandaron el informe. Del lado del navegador, qué es cada
  número lo dice `js/actividad-profesor.js`, escrito una vez para las dos.
- **`public.informes_profesor` no tiene ni una política de escritura.** Guarda
  `guardar_informe_mensual()` —borrador o envío— y comenta
  `revisar_informe_mensual()`. Así lo que no puede quedar en manos de la
  pantalla lo decide la base: un informe **enviado ya no se cambia** (es lo que
  la supervisión leyó), no se informa de un mes que no empezó, y los números que
  viajan son una **foto tomada al enviar** (`datos`) — la pantalla del enviado
  enseña esa foto y no los de hoy, o una clase corregida después haría que la
  supervisora leyera otra cosa que lo que se mandó.
- **Un borrador no lo ve nadie más que quien lo escribe**: la política de select
  solo abre el enviado a quien lo supervisa y a quien administra. En supervisión
  lo que no se mandó se dice «⏳ Sin enviar», escrito, igual que «📨 sin leer» y
  «✅ leído»: un sin enviar pintado como un sin leer deja sin perseguir a quien
  no mandó nada.
- **Enviar pide dos toques en el propio botón** («Sí, enviarlo — después ya no se
  puede cambiar»), como el resto del sitio, y un resumen de menos de 20
  caracteres no viaja (la base lo rechaza igual). Ya enviado, los campos van
  `readOnly` y **no** `disabled`, por lo de siempre con el teclado.
- **Los avisos al celular salen de la base**: al enviar, a sus supervisores; al
  comentar, al profesor. Van dentro de un bloque que atrapa el error, así un
  aviso que falla no deshace el envío.
- **A quién le llega se dice arriba**, con `mis_supervisores()`; sin nadie
  asignado, lo lee quien administra, y se dice así.
- Comprobado impersonando roles en SQL (revertido), 16 casos: el profesor ve sus
  números, un resumen corto, un mes futuro y un segundo envío se rechazan, el
  supervisor no ve el borrador pero sí el enviado, el update directo y el
  autocomentario se rechazan, otro profesor ve 0 filas y no puede ni pedir el
  resumen ni comentar, y un alumno no puede escribir un informe.

**Al tocar `informe-mensual.html`, `supervision.html`, `js/actividad-profesor.js`
o las funciones de arriba, correr `node herramientas/verificar-informe-mensual.js`**
(con el sitio en localhost:8777 y playwright). Comprueba qué se MANDA —el mes,
el texto, que un borrador no se envíe y que enviar pida dos toques—, que un
enviado enseñe la foto y no pida los números de hoy, que el comentario llegue,
que en supervisión el sin enviar y el sin leer se distingan por escrito, que un
nombre con etiquetas se vea literal, que el comentario y el «leído» viajen con
el id de ESE informe, y que ni la alumna ni un profesor sin supervisión entren.
Está probado que falla de verdad: haciendo que el enviado enseñe los números de
hoy, saltan 2.

#### Los recordatorios: el informe que no llega se pide, no se espera

Un informe que nadie manda no da ningún error: la supervisión simplemente no
tiene nada que leer, y se entera cuando ya pasó el mes. Por eso
`public.recordar_informes_mensuales()`, que corre con pg_cron todos los días a
las 14:00 UTC (8 de la mañana en Costa Rica, job
`recordar-informes-mensuales`), y en tres días del mes hace algo:

- **Los días 1 y 3**, un aviso al celular a cada profesor **que tiene
  supervisión** (`supervisores_de()` no vacío) y no mandó el informe del mes
  anterior. A quien no tiene supervisión nadie le pide informe, así que no se le
  recuerda. Un borrador dice «sigue en borrador: falta enviarlo», que no es lo
  mismo que no haberlo empezado. Los dos avisos llevan la misma etiqueta, así
  que el del día 3 reemplaza al del día 1 en la bandeja.
- **El día 5**, a cada supervisor, cuántos faltan y quiénes («Faltan 3 informes
  de septiembre de 2026: Ana, Bruno y Carla», con «y N más» después de tres),
  con enlace a `supervision.html`. Sin nadie pendiente, no se le manda nada.
- **Que no salga dos veces lo impide la clave primaria de
  `public.recordatorios_informe`** (periodo, tipo, persona), no la hora del
  cron: volver a correrlo el mismo día no manda nada. La tabla no tiene ninguna
  política y se le quitaron los permisos a `anon` y `authenticated`; la función
  tampoco la puede llamar nadie con sesión, solo el cron.
- Recibe una fecha opcional (`p_hoy`) para poder probar cada día sin esperarlo.
  Comprobado así en una transacción revertida: los días 1 y 3 reciben aviso el
  que no mandó y el del borrador, con su texto cada uno, y no el que ya envió;
  repetir el día no manda nada; el día 5 le llega la lista al supervisor; el día
  10 no pasa nada.

#### El detalle del informe mensual: cada clase y cada estudiante

Los números del informe dicen cuánto; el detalle dice **qué clase y quién**. En
`informe-mensual.html` (bloque «El detalle del mes») y en `supervision.html`
(desplegable «El detalle por clase y por estudiante» de cada profesor) van dos
tablas, con las clases en línea y las presenciales JUNTAS:

- **Clase por clase**: cuándo, dónde (escrito: «En línea» o «Presencial», nunca
  un color), el título, la duración, cuántos vinieron y cuántos llegaron tarde,
  y qué se hizo (las notas de la clase, que es donde queda el texto de «Mejorar
  informe»).
- **Estudiante por estudiante**: clases en línea y presenciales, tiempo en clase
  (los tramos unidos con `minutos_por_tramos()`, la misma cuenta de Informes;
  en las presenciales ya va descontada la tardanza), veces y minutos tarde, y
  los ejercicios que hizo en la plataforma ese mes.
- Cada tabla se baja en Excel (punto y coma y BOM, como el resto del sitio).

Cómo está armado, y por qué:

- **Lo cuenta `detalle_mensual_crudo()`** —todo, sin filtrar— y nadie la llama
  directo: tiene el `execute` revocado. Las puertas son dos, con el permiso de
  siempre (el propio profesor, `supervisado_por_mi()` o administrar):
  `detalle_mensual_profesor()` para el mes de hoy y `detalle_informe_mensual()`
  para la foto que viajó con un informe enviado.
- **Al supervisor se le quitan los estudiantes que no supervisa**
  (`detalle_para_mi()`), y se le dice cuántos son. Un profesor puede estar en
  dos academias, y el supervisor de una no tiene por qué ver los nombres de los
  alumnos de la otra. Las clases van enteras: son números y el texto del
  profesor, sin nombres de alumnos.
- **La foto vive en `informes_profesor_detalle`, SIN ninguna política**, y no en
  `informes_profesor.datos`: esa tabla se la entrega al supervisor por su RLS, y
  con el detalle adentro le llegarían todos los nombres sin filtrar. Solo se lee
  por `detalle_informe_mensual()`.
- **La foto se toma en el MISMO acto que el envío** (dentro de
  `guardar_informe_mensual()`): si fallara, falla el envío entero y no queda un
  informe enviado sin su detalle. Un informe enviado antes de esto no tiene
  foto, y la pantalla lo dice.
- **Los minutos de cada clase van con un decimal** y la pantalla redondea al
  pintar: redondeados de a uno en la base, la suma del detalle se separaba en un
  minuto del total de `actividad_profesor()`. Comprobado con datos reales: las
  clases, las asistencias y los minutos del detalle dan lo mismo que la tarjeta.
- **En supervisión el detalle se pide al ABRIRLO**, no al pintar la lista: con
  veinte profesores serían veinte consultas que nadie pidió.
- **El permiso va envuelto en `coalesce(..., false)`.** Sin usuario, la
  condición daba NULL y el `if not (...)` no rechazaba. Lo destapó la prueba en
  SQL. `actividad_profesor()` tenía la misma forma desde antes —comprobado: sin
  usuario devolvía los 60 alumnos de un profesor— y se corrigió igual
  (migración `actividad_profesor_permiso`, solo cambia esa condición). Hoy solo
  la alcanzaban la service role y el cron (`anon` no tiene `execute`), y nada
  del sistema la llama sin usuario. **Al escribir un permiso con `if not (a or
  b or c)` en una función `SECURITY DEFINER`, envolverlo en `coalesce(...,
  false)`**: una sola comparación contra un `auth.uid()` nulo lo vuelve NULL.

Comprobado impersonando roles en SQL (revertido), 10 casos: el profesor ve sus 60
estudiantes y sus 5 clases; el supervisor de su academia ve las 5 clases y 1
estudiante, con 59 «fuera»; otro profesor, un alumno y una llamada sin usuario se
rechazan; al enviar queda la foto; el supervisor la lee filtrada; y la tabla de
fotos no se puede leer directo.

**Al tocar `js/detalle-mensual.js`, las dos pantallas o las funciones del
detalle, correr `node herramientas/verificar-informe-mensual.js`.** Comprueba que
el detalle de hoy se pida con ese profesor y ese mes, que un informe enviado
enseñe su foto y no el de hoy, que el resumen junte las dos modalidades, que cada
clase diga dónde fue, que un nombre con etiquetas se vea literal, que el Excel
salga con BOM y la fila de verdad, que en supervisión no se pida nada hasta
abrirlo, que se diga cuántos estudiantes quedan fuera, y que de quien no envió se
lea el de hoy. Está probado que falla de verdad: haciendo que el enviado enseñe el
detalle de hoy, salta.

### Los modos de vista de quien administra

`js/modo-vista.js`: quien administra elige ver la plataforma «como
estudiante», «como profesor» o «como supervisor» —desde la tarjeta «Ver la
plataforma como…» de `admin.html` o el selector «Ver como» del panel— sin
entrar a la cuenta de nadie. Se guarda en el aparato (`modo_vista_admin_v1`).

- **Cambia la PANTALLA, no los permisos.** `ModoVista.perfilVisto()` devuelve
  el perfil con `role`/`is_admin`/`es_coordinador`/`es_supervisor` del modo, y
  eso decide qué se pinta en `clases.html` e `informes.html`; la base sigue
  viendo a quien administra, así que los datos son los de su cuenta. La franja
  de arriba lo dice con esas palabras: prometer «ves lo que ve Sofía» sería
  mentir.
- La franja va en toda página de la Academia (la pone
  `herramientas/academia-cabecera.py`, bloque `<!-- modo-vista -->`), y
  `AccesoAdmin.esAdmin()` da `false` en un modo: en modo estudiante el
  contenido se ve cerrado, que es lo que hay que poder revisar.
- **Sin `is_admin` no hace nada**, aunque el modo quedara guardado en una
  computadora compartida.

**Al tocar el supervisor, los modos o `SUPERVISOR_GROUPS`, correr `node
herramientas/verificar-supervisor.js`** (sitio en localhost:8777 y
playwright). Reusa el doble de `verificar-panel.js`. Comprueba que al
supervisor no le quede ningún acceso a entrenar, jugar ni dar clase, que cada
tema abra Informes filtrado, que «sin entrenar» cuente solo a los suyos, los
tres modos con su franja y el contenido cerrado, que un modo guardado no afecte
a quien no administra, y que sumar un grupo a un supervisor mande la UNIÓN.
Está probado que falla de verdad: mandando solo el grupo, salta.

### Academias: la unidad del negocio

El negocio se reparte en **academias**. Cada una tiene **un solo supervisor**
—su jefe—, su gente y su nombre en los correos que les llegan a las familias.
Un profesor, un coordinador o un alumno pueden estar en **varias** academias.
Se maneja en `academias.html` (tarjeta «🏫 Academias» en Herramientas para quien
administra, «🏫 Tu academia» en el grupo «Tus profesores» del panel del
supervisor).

- **`public.academias`** (nombre, `supervisor_id`, `whatsapp`,
  `correo_respuestas`) y **`public.academia_miembros`** (academia, persona). El
  «un supervisor por academia» lo hace cumplir el índice único
  `academias_un_supervisor`, no la pantalla. **Ninguna de las tres tablas tiene
  política de escritura**: escriben `academia_guardar()` y `academia_borrar()`
  (solo administración), `academia_guardar_contacto()` (el supervisor pone el
  WhatsApp y el correo de SU academia), `academia_set_miembros()` y
  `academia_set_funciones_coordinador()`.
- **La academia se SUMA al alcance que ya había**, no lo reemplaza:
  `supervisores_de(persona)` junta las dos puertas —`supervisor_cuentas` y ser
  supervisor de una academia de la persona— y `supervisado_por_mi()`,
  `mis_supervisados()`, `mis_supervisores()` y el aviso del informe mensual
  cuelgan de ahí. Todo lo que ya existía para el supervisor (informes tema por
  tema, bitácora, supervisión de profesores, cobros) alcanza a su academia sin
  tocar una política. El coordinador que es miembro de una academia alcanza a
  toda su gente (rama nueva en `bajo_mi_coordinacion()`).
- **El supervisor alcanza a los MIEMBROS, no a los alumnos de sus profesores**,
  a propósito: un profesor puede estar en dos academias y sus alumnos de la
  otra no son de este supervisor. Por eso `academia_set_miembros()` le deja al
  supervisor sumar **solo alumnos de los profesores de su academia** (con el
  número de los que no cumplen en el error), y conserva lo que no puede tocar
  (profesores y coordinadores, que los reparte administración).
- **Un alumno nuevo entra solo** a la academia de su profesor si ese profesor es
  de UNA sola (trigger `profile_teachers_suma_a_la_academia`). Con dos no hay
  forma de saber a cuál, y lo decide quien administra.
- **La lista de gente se manda SIEMPRE completa**, con el cambio encima (la
  regla de `set_teachers`): mandar solo lo nuevo vaciaría la academia.

#### Crear una academia desde un grupo, de una vez

Había 0 academias: todo lo de arriba existía y nadie lo veía, porque armar una
era crearla vacía, marcar al supervisor en otra pantalla y sumar la gente de a
poco. La tarjeta **«Crear una academia desde un grupo»** de `academias.html`
(solo quien administra) lo hace en un paso: se elige un grupo
(`profiles.grupo`) y se ve, ANTES de crear, quién va a entrar.

- **Quién entraría lo dice `public.grupo_para_academia(grupo)`**: los alumnos
  del grupo, el equipo docente con ese grupo y los profesores de esos alumnos
  con `profesores_de()` —asignación directa o equipo—, con cuántos alumnos del
  grupo lleva cada uno y en qué academias ya está. El grupo se compara sin
  mayúsculas ni espacios, como el mínimo de CENFO.
- **Crear es UNA llamada, `public.academia_crear_desde_grupo()`**: marca al
  supervisor si todavía no lo es, crea la academia con `academia_guardar()` y
  suma la gente con `academia_set_miembros()`, en la misma transacción. En tres
  llamadas, una falla a mitad dejaría una academia vacía —o un supervisor
  marcado sin academia— que se ve perfecta. Comprobado: con un miembro que no
  existe no queda ni la academia.
- **Viaja SOLO lo que está marcado.** Cada docente es una casilla y los alumnos
  van juntos en otra; el botón dice cuántas personas entran. El supervisor se
  elige entre los profesores del grupo («se marca como supervisor») y los
  supervisores que no tienen academia; el que ya supervisa otra no se ofrece.
- **Se avisa quién queda en dos academias**: sigue recibiendo un solo informe,
  con la suma.

Comprobado impersonando roles en SQL (revertido), 12 casos: quien administra ve
las 52 personas de SJ y crea la academia con ellas, el supervisor queda marcado,
un nombre repetido, una lista vacía y una con una cuenta inexistente se rechazan
sin dejar nada, y un profesor, un alumno y una llamada sin usuario no pueden ni
mirar el grupo. `verificar-academias.js` comprueba qué se manda (una sola
llamada, el nombre escrito, el supervisor y solo la gente marcada) y está probado
que falla de verdad: mandando a todo el equipo sin mirar las casillas, saltan 3.

#### Las funciones del coordinador las decide su supervisor

`public.funciones_coordinacion()` es la lista: formularios, altas (crear
cuentas desde respuestas), solicitudes, cuentas, acceso (reenviarlo), roles,
cobros, equipos y subgrupos. **Se guarda lo QUITADO**
(`coordinador_funciones_quitadas`), no lo permitido: así un coordinador
conserva todo lo que ya podía hasta que su supervisor le apague algo, y ninguno
pierde permisos de golpe al entrar a una academia.

- **`coordinador_puede('<función>')` reemplazó a `soy_coordinador()`** en todo lo
  que se puede apagar: las políticas de cobros (las nueve tablas), formularios y
  sus respuestas, solicitudes y subgrupos ajenos; las funciones `cambiar_rol`,
  `coord_guardar_cuenta`, `coord_set_profesores`, `coord_equipo_*` y
  `generar_cobros`; y las Edge Functions `inscribir-alumno` (altas),
  `reenviar-acceso` (acceso), `correos-alumno` (cuentas **o** cobros: la ficha
  de contacto de Cobros pasa por ahí) y `cobros-recordatorios` (cobros).
  **`soy_coordinador()` sigue existiendo** y sigue diciendo quién entra a una
  pantalla de coordinación; lo que cambió es qué puede hacer adentro.
- Quien administra o supervisa da `true` siempre. **Un coordinador sin
  academia sigue como hasta hoy** (todo), porque lo maneja administración.
- La lista está escrita dos veces a la fuerza: en la base y en
  `js/funciones-coordinacion.js` (el navegador). `verificar-academias.js` falla
  si se separan: una clave que solo existiera en la pantalla sería una casilla
  que no apaga nada.
- En pantalla, lo apagado **no se pinta** (las tarjetas del panel, los botones
  de `coordinacion.html`, «Crear cuenta» de Formularios) y una página entera
  apagada dice **quién se la quitó** en vez de verse vacía. Si la consulta de
  las funciones falla, la pantalla las muestra todas: la base rechaza igual lo
  que no toca.
- Comprobado impersonando roles en SQL (revertido): el coordinador pierde lo
  apagado (`cobros` en 0 filas, `cambiar_rol` rechazado), no puede darse
  funciones a sí mismo, el supervisor no renombra la academia ni suma un alumno
  ajeno, un segundo supervisor para la misma persona se rechaza, un alumno no
  crea academias, `anon` recibe `false` sin error, y el trigger suma al alumno
  nuevo.

#### Las familias le contestan al supervisor

Los informes a la casa, los avisos de cobro y el informe de un examen salen
desde `informes@ajedrez-integral.com` **con el nombre de la academia** como
remitente, y con `reply_to` al correo de respuestas de la academia o, si está
vacío, al del supervisor. Lo arma `_compartido/remitente-academia.ts` con
`correos_de_supervision()` (solo la service role puede llamarla).

- **Un alumno en varias academias recibe UN informe**, con la suma de lo que
  entrenó —lo que importa es cuánto entrenó en total—: sale como «Ajedrez
  Integral» y la respuesta va a los supervisores de todas.
- **Sin supervisor, o si la consulta falla, el correo sale igual** con el
  remitente de siempre y la respuesta cae en `informes@`, que Cloudflare
  reenvía. Un nombre de más no justifica dejar a una familia sin su informe.

**Y los tres correos llevan arriba la marca de la academia**: su color de
fondo, su logo y su nombre, y el asunto firma con ese nombre. Con dos
academias o ninguna, la cabecera de siempre de Ajedrez Integral (la misma regla
del remitente). La franja la arma **una sola función**,
`cabeceraCorreo()` de `_compartido/marca-correo.ts`, y la marca llega dentro
del `Remitente` (`remitenteDe()` llama a `marca_de_alumno()`, que solo puede
llamar la service role): así ningún correo tiene que acordarse de pedirla.

- **Los generadores de HTML reciben la cabecera armada** (un parámetro
  `cabecera`), no importan el compartido: `informe-html.ts` y compañía los
  corren también las pruebas con Node, donde el compartido no está copiado al
  lado.
- **El color y el logo vienen de la base y terminan dentro de un atributo**,
  así que se vuelven a comprobar: el color tiene que ser un `#rrggbb` y el logo
  una dirección `https:` sin comillas ni espacios; si no, se cae a la cabecera
  de siempre o se omite el logo. Sobre un color propio la etiqueta va en blanco
  (el ámbar de siempre no está medido contra un color que eligió otra persona;
  el blanco sí, lo exige `color_con_texto_blanco()`).
- `verificar-informe-casa.js` lo comprueba: cabecera de siempre sin academia,
  color, nombre y logo con una, un color malo rechazado, el nombre escapado y
  un logo `javascript:` que no se pinta.

#### La marca de cada academia: su logo y su color

Quien es de una academia ve **su logo y su nombre** en el encabezado de la
Academia, con el fondo en **su color**, y sus formularios de inscripción salen
con esa misma marca. Lo eligen quien administra o el supervisor de la academia,
en «La marca de la academia» de `academias.html`.

- **La pinta `js/marca-academia.js`**, que pone `academia-cabecera.py` en las
  mismas páginas de siempre (bloque `<!-- marca: inicio -->`) y que busca el
  enlace `#marca-enlace` del encabezado. Qué marca le toca a quien mira lo
  decide `public.mi_marca_academia()`: **solo si es de UNA academia** (miembro
  o supervisor). Con dos se ve Ajedrez Integral, la misma decisión que el
  remitente de los correos: no hay forma de saber cuál.
- **El color es el fondo y el texto va en blanco, así que tiene que dar 4.5 de
  contraste** (WCAG AA). Lo hace cumplir la base —`color_con_texto_blanco()`
  en el CHECK de `academias.color` y en `academia_guardar_marca()`— y la
  pantalla dice el número antes de guardar. `verificar-academias.js` falla si
  la fórmula de la pantalla y la de la base se separan. Un color elegido a ojo
  deja el nombre de la academia ilegible en cada página de su gente.
- **El tema de la plataforma que eligió el alumno MANDA sobre el color de la
  academia**: es su pantalla, igual que su color de casillas le gana al tema.
  El logo y el nombre se ven siempre.
- **El logo vive en el bucket PÚBLICO `academia-marca`**, en
  `<id de la academia>/logo-<azar>.<ext>`: es para verse, también en un
  formulario que se abre sin cuenta. Solo PNG, JPG o WebP y hasta medio mega
  —un SVG puede llevar código, y abierto por su dirección se ejecutaría—, y se
  achica en el navegador a 512 px. Escribir en la carpeta de una academia lo
  decide `puede_marcar_academia()` (su supervisor o quien administra).
  `academia_guardar_marca()` exige que el archivo **exista**: una ruta que no
  apunta a nada pintaría un recuadro roto en cada página. Al cambiar el logo, el
  de antes se borra; si guardar falla, se borra el recién subido.
- **Por eso `img-src` de `_headers` incluye el proyecto de la Academia**: es el
  mismo origen que ya estaba en `connect-src`.
- **La marca se guarda en `localStorage`** (`academia_marca_v1`, con el id de
  quien la recibió) para pintarla enseguida en la página siguiente en vez de
  parpadear del azul al color. Si entra otra cuenta, no se usa; y si la persona
  deja de ser de esa academia, vuelve el encabezado de siempre.
- **Un formulario puede ser de una academia** (`formularios.academia_id`), y
  `formulario_publico()` devuelve su nombre, color y logo. En el armador, el
  selector «Marca» arranca con la academia de quien lo arma si es de una sola.
  **El trigger `formularios_academia_propia` impide poner la marca de una
  academia de la que uno no es**: sin eso, un coordinador podría vestir su
  formulario con la marca de otra.

Comprobado impersonando roles en SQL (revertido), 11 casos: el supervisor guarda
la marca de su academia y no la de otra; un color claro y un logo que no existe
se rechazan; puede subir a la carpeta de la suya y no a la ajena ni a una ruta
inventada; el alumno ve la marca de su academia y no puede cambiarla, y en dos
academias no ve ninguna; el coordinador pone en su formulario la marca de su
academia y no la de otra; y el formulario se ve con la marca sin cuenta.

#### «Mejorar informe»: la IA por academia, y solo quien administra la ve

Quien da clase tiene un botón **«✨ Mejorar informe»** debajo de «Qué se hizo en
esta clase» (`asistencia.html`) y del resumen del informe mensual
(`informe-mensual.html`). Reescribe su texto en un objetivo general, los
objetivos específicos y lo que se trabajó. **Qué modelo usa cada academia, cuánto
puede gastar por mes y cuánto lleva lo decide y lo ve SOLO quien administra**, en
la sección «Mejorar informe» de `academias.html`. Los profesores ven el botón y
nada más; si su academia no tiene IA o se quedó sin presupuesto, el botón
simplemente no aparece.

- **Dos tablas sin una sola política de escritura**: `academia_ia` (una fila por
  academia con su `modelo` —null es «sin IA»— y su `tope_mensual_usd`; la fila
  con `academia_id` null es la de quien administra y la de quien no es de
  ninguna academia) y `ia_uso` (cada llamada, con sus tokens y su costo). Las dos
  se leen solo con `soy_admin()`; las escriben `ia_guardar_config()` (exige
  administrar) y la Edge Function con la service role.
- **El profesor pregunta UNA cosa: `ia_disponible()`, que devuelve un booleano.**
  Qué modelo y cuánto queda lo contesta `ia_para_usuario()`, que **solo puede
  llamar la service role**: si la pudiera llamar el profesor, sabría el modelo
  desde la consola, que es justo lo que se decidió que no sepa. Toma primero sus
  academias (por nombre) y la fila general al final; solo cuentan las que tienen
  modelo y todavía tienen presupuesto.
- **La Edge Function `mejorar-informe`** (verify_jwt en true) llama a Claude con
  el SDK oficial (`npm:@anthropic-ai/sdk`) y la clave `ANTHROPIC_API_KEY`, que
  vive en los secretos de las Edge Functions de Supabase y **no en el
  repositorio**. Sin la clave, contesta «todavía no está configurado».
  - **Lo peor que puede costar una llamada se calcula antes**, con el
    `max_tokens` y el precio de salida: si no cabe en lo que queda del mes, no se
    hace. Dos llamadas simultáneas pueden pasarse del tope por lo que cuesta UNA,
    y eso se acepta.
  - **El gasto sale de `usage`**, con el precio del modelo que SIRVIÓ la
    respuesta (`response.model`): con Opus 5 va el respaldo por defecto
    (`fallbacks: "default"`), que puede responder con otro modelo si el primero
    declina. Un modelo que no esté en la tabla `PRECIOS` se cobra al precio más
    alto, para que el tope nunca se quede corto.
  - **Se anota también la llamada que falló**, con costo cero si no llegó a
    responder: el gasto que ve quien administra no esconde nada.
  - Haiku 4.5 va sin razonamiento; Sonnet 5 y Opus 5, con esfuerzo `low`: es
    reescribir un párrafo, no razonar un problema.
- **Viaja SOLO el texto**, ni nombres de alumnos ni la lista de asistencia, y la
  pantalla pide no escribir datos personales. Las instrucciones además le
  prohíben inventar y poner nombres de personas.
- **El texto mejorado NO pisa el del profesor**: se enseña debajo y hace falta
  «Usar este texto» para ponerlo en el campo (y después guardar). Un texto
  reescrito que reemplaza el original sin preguntar se pierde de una manera que
  no se puede deshacer.
- **La lista de modelos está escrita tres veces, a la fuerza**: el CHECK de
  `academia_ia`, la tabla `PRECIOS` de la función y `MODELOS_IA` de
  `academias.html`. `verificar-mejorar-informe.js` falla si se separan.
- La sección de IA de `academias.html` **se arma con JavaScript solo para quien
  administra**: al supervisor no le llega ni el marcado.
- **Al 80 % del tope, y otra vez al agotarlo, le llega un aviso al celular a
  quien administra.** Sin eso el botón desaparecía en silencio y quien se
  enteraba era el profesor, a mitad de un informe. Lo manda el trigger
  `ia_uso_avisa_tope` (`avisar_tope_ia()`), que corre con cada llamada que
  anota la Edge Function: el gasto ya está ahí, así que no hace falta ningún
  cron ni tocar la función. Una llamada fallida (costo 0) no dispara nada.
  - **Sale una sola vez por academia, mes, umbral y TOPE**: lo garantiza la
    clave primaria de `avisos_ia_tope`, no un `if`. Que el tope esté en la
    clave es a propósito: si quien administra lo sube, el aviso del 80 % se
    vuelve a armar sobre el tope nuevo — un aviso que ya salió con el tope viejo
    no dice nada del nuevo.
  - Llegar de golpe al 100 % anota también el 80 %, para que no llegue después
    un «vas por el 80 %» sobre un presupuesto ya agotado.
  - El aviso va dentro de un bloque que atrapa el error: un push que falla no
    puede deshacer el registro del gasto, que es lo que hace cumplir el tope.
  - La tabla no tiene ninguna política ni permiso para `anon` ni
    `authenticated`, y la función no la puede llamar nadie con sesión.
  - Comprobado en una transacción revertida con un tope de US$1: a 0,50 no sale
    nada; a 0,85 sale el del 80 %; a 0,95 nada más; a 1,05 el del 100 %; a 1,15
    nada; al subir el tope a 1,40 vuelve a salir el del 80 %; una llamada
    fallida no dispara nada. Tres avisos encolados, ni uno de más.

Comprobado impersonando roles en SQL (revertido), 13 casos: sin configuración el
botón no va; el profesor no puede configurar, lee 0 filas de configuración, no
puede llamar a `ia_para_usuario()` ni ver el gasto; quien administra configura y
lo ve; un modelo que no se ofrece se rechaza; el alumno no tiene botón; un
profesor sin academia usa la fila general; y con el tope gastado el botón deja de
aparecer.

**Al tocar `js/mejorar-informe.js`, la función `mejorar-informe` o la sección de
IA de `academias.html`, correr `node herramientas/verificar-mejorar-informe.js`**
(con el sitio en localhost:8777 y playwright; `--sin-navegador` corre solo la
comparación de listas) y `node herramientas/verificar-academias.js`. Comprueban
que las tres listas de modelos digan lo mismo, que ninguna pantalla del profesor
nombre un modelo o un tope, que un texto corto no viaje, que se mande solo el
texto y el tipo, que **el campo siga con lo del profesor hasta que acepte**, que
sin IA no haya botón, que si se acaba el presupuesto se vaya, que un informe ya
enviado no ofrezca mejorarse, que guardar la configuración mande la academia, el
modelo y el tope, y que al supervisor no se le pinte nada. Está probado que
falla de verdad: haciendo que la propuesta pise el campo, salta.

**Al tocar las academias, las funciones del coordinador o
`js/funciones-coordinacion.js`, `js/marca-academia.js` o la marca de los
formularios, correr `node herramientas/verificar-academias.js`**
(con el sitio en localhost:8777 y playwright; `--sin-navegador` corre solo la
comparación de la lista). Comprueba que la lista diga lo mismo que la base, que
crear mande el nombre sin id, que sumar un grupo o los alumnos de los
profesores mande la UNIÓN, que quitar mande la lista entera sin esa persona,
que desmarcar una función mande las permitidas, que al supervisor no se le
ofrezca ni el nombre, ni el supervisor, ni borrar, ni quitar a un profesor, que
un nombre con etiquetas se vea literal, y que Formularios y Cobros apagados
digan quién decide. De la marca comprueba que un color claro no viaje, que el
logo se suba a la carpeta de ESA academia y se guarde esa misma ruta, que
cambiarlo borre el anterior, que un SVG no se acepte, que el encabezado tome el
color y el logo (y que un tema elegido no se pise), que un formulario nuevo
arranque con la academia de quien lo arma, y que el formulario público salga
con la marca. Está probado que falla de verdad: haciendo que sumar mande solo
lo nuevo saltan 3, subiendo el logo a otra carpeta 1, y pisando el tema 1.

- **Los dobles de Supabase tuvieron que aprender `mis_funciones_coordinacion`.**
  Contestaban `[]` a todo lo que no conocían, y la página lee `[]` como «le
  quitaron todas»: `verificar-coordinacion.js`, `verificar-formularios.js` y
  `verificar-cobros.js` se cayeron esperando botones que ya no se pintaban.
  Era el doble el que estaba incompleto: en la base real, quien administra,
  supervisa o coordina sin academia recibe la lista entera.

#### El tablero por academia: el negocio se mide por academia

Supervisión lee profesor por profesor, pero el negocio se mide por academia.
`tablero-academias.html` (atajo «📊 Tablero por academia» en Herramientas y en
`admin.html` › Reportes; «📊 Tablero de tu academia» en el grupo «Tus
profesores» del supervisor) pone **una fila por academia** con las cifras del
mes: clases y horas (en línea y presenciales), cuántas del horario se dieron,
alumnos que entrenaron contra inscritos, informes mensuales enviados y sin
enviar, gasto de «Mejorar informe» contra su tope, y cobros pendientes.

- **Lo arma `public.tablero_academias(mes)` y NO cuenta nada por su lado**: las
  clases, las horas y el horario salen de `actividad_profesor()` sumada por
  cada profesor miembro — la misma cuenta del informe mensual y de
  supervisión. Una segunda cuenta diría otra cosa del mismo profesor.
- **Quien administra ve todas; un supervisor, SOLO la suya y sin nada de IA.**
  Las columnas de IA le llegan en null desde la base (la IA es solo de
  administración) y la pantalla ni pinta su encabezado: un «US$0.00» ya diría
  que existe. Un profesor, una llamada sin usuario y `anon` no entran
  (comprobado en SQL). El permiso va envuelto en `coalesce(..., false)`.
- **Quien está en dos academias cuenta en las dos**, con todas sus clases del
  mes (la clase no dice de qué academia es). Por eso la fila de abajo se llama
  «Suma de las filas» y una nota dice que puede ser mayor que la de la
  plataforma.
- **Los cobros van por moneda** (un `jsonb` con una entrada por moneda) y son
  los pendientes de HOY, no los del mes: un cobro vencido en agosto sigue
  pendiente en septiembre. La suma de abajo junta colones con colones.
- Lo que pide actuar va **escrito**: «⚠ 2 sin enviar» (con «el mes no ha
  terminado» si todavía no terminó), «⚠ 1 sin dar», «⚠ 2 vencidos»,
  «se acabó el presupuesto». Sin horario dice «Sin horario», nunca «0 de 0».
- Sin academias, a quien administra se le ofrece «Crear una academia desde un
  grupo»; al supervisor sin academia se le dice que se la asigna quien
  administra, sin pedir el tablero.
- Cuesta ~200 ms por profesor (es `actividad_profesor()` por cada uno): con dos
  academias y cuatro profesores tarda un segundo. El día que sean decenas, lo
  que hay que acelerar es esa función, no escribir otra cuenta.

**Al tocar la página o la función, correr `node
herramientas/verificar-tablero-academias.js`** (con el sitio en localhost:8777
y playwright). Comprueba que se pida el mes del selector y otra vez al
cambiarlo, qué dice cada celda, que las monedas no se sumen entre sí, que un
nombre con etiquetas se vea literal, que un color que no es color no se pinte,
que en el celular la página no se salga por el costado, el vacío, el error, y
que al supervisor no le quede ni un «US$» en la página. Está probado que falla
de verdad: pintándole la columna de IA al supervisor, saltan 2.

**Las cuatro fases que se decidieron con el dueño están hechas**: las academias
con su supervisor y las funciones del coordinador, su marca, «Mejorar informe» y
el detalle del informe mensual (ver «El detalle del informe mensual» más arriba).

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
  CON EL NÚMERO** — y también desde `admin.html` (`admin-manage-users`,
  acción `update`), que no lo comprobaba: sus filas de `profile_teachers` y
  `equipo_entrenadores` le seguían dando acceso a esos alumnos sin rol de
  profesor: esos alumnos se quedarían sin profesor y sus informes
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

## Tablas con RLS y sin ninguna política, a propósito

Supabase avisa `rls_enabled_no_policy` sobre cuatro tablas. No es un olvido:
es la forma más cerrada que hay. Con RLS encendida y ninguna política, nadie
lee ni escribe desde el navegador, ni siquiera con permiso de tabla; y además
`anon` y `authenticated` **no tienen permiso de tabla** sobre ellas. Solo las
tocan funciones `SECURITY DEFINER`, que validan antes:

| Tabla | La escribe o la lee | Para qué |
|---|---|---|
| `avisos_ficha_faltante` | `avisar_fichas_faltantes()` | Que el aviso de ficha faltante salga una vez por clase y día (la llave primaria) |
| `avisos_ia_tope` | `avisar_tope_ia()` | Que el aviso de tope de IA salga una vez (la llave primaria, no un `if`) |
| `informes_profesor_detalle` | `guardar_informe_mensual()`, `detalle_informe_mensual()` | La foto del informe mensual enviado: se lee solo por la función, que decide quién la ve |
| `recordatorios_informe` | `recordar_informes_mensuales()` | Qué recordatorio de informe ya se mandó (periodo, tipo, persona) |

**Una tabla nueva que solo usa una función va igual**: RLS encendida, sin
política y sin `grant` a `anon` ni a `authenticated`. Si algún día hace falta
leerla desde una página, se agrega una función que conteste, no una política.

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

**Y se cerró del todo mudándolas a `interno`.** Un alumno con sesión
(`authenticated`) las seguía pudiendo llamar por RPC con el id de cualquiera, y
no se les podía quitar el execute sin romper esas cinco funciones. La migración
`mover_profesores_de_a_interno` las pasó al esquema **`interno`**, que PostgREST
no expone: siguen existiendo, las cinco INVOKER las siguen llamando con los
permisos de quien mira (`authenticated` tiene `usage` sobre el esquema), pero
desde el navegador ya no hay dirección que las alcance.

- **Las 22 funciones que las nombraban se reescribieron solas**, en la misma
  migración: un bloque que toma cada definición con `pg_get_functiondef()`,
  cambia `public.profesores_de(`/`public.alumnos_de(` por `interno.…` y la
  vuelve a crear (`CREATE OR REPLACE` conserva dueño, permisos y triggers). Al
  final comprueba que no quede ninguna en `public` nombrándolas; si queda una,
  la migración entera se deshace. Ninguna política ni vista las nombra directo.
- **Al escribir una función nueva que pregunte quién es profesor de quién, se
  llama a `interno.profesores_de()` / `interno.alumnos_de()`**, con el esquema
  escrito. Sin él, no se encuentran (el `search_path` de las funciones es
  `public`).
- Se aplicó **sin ninguna clase en vivo abierta**, a propósito: si se hubiera
  escapado una de las 22, la regla «¿es mi profesor?» que decide si el alumno
  ve el tablero habría fallado en medio de la clase. Antes se probó entera
  dentro de una transacción que se deshacía, con una clase abierta de verdad:
  en seis cuentas reales (alumna, profesora, supervisores, coordinador,
  administración) las 16 medidas de «quién ve qué» dieron idénticas antes y
  después —incluido que la alumna viera el tablero de esa clase— y la llamada
  directa pasó a «la función no existe» (42883).
- La vuelta atrás es el mismo bloque al revés: `alter function
  interno.profesores_de(uuid) set schema public` (y `alumnos_de`) y reescribir
  `interno.` por `public.` en las funciones de `public` que las nombren.

**La regla que deja esto:** una función `SECURITY DEFINER` que conteste sobre
una persona que NO es quien llama es una API aunque no lo parezca. Al escribir
una, preguntarse quién tiene que poder llamarla — y si la respuesta no incluye
al público, revocarle el execute de `public` y de `anon`.

**Y se volvió a colar, en dieciséis funciones más.** El linter de Supabase las
listaba entre las 29 `SECURITY DEFINER` que `anon` podía llamar, y varias ya
traían un `revoke ... from anon` escrito — que no sirve si no se revoca también
de `public`, de donde `anon` lo vuelve a heredar. La fuga de verdad era
`profesores_del_coordinador(<uuid>)`: sin cuenta devolvía qué profesores lleva
cada coordinación, y `es_del_equipo_docente(<uuid>)` decía quién da clase. La
migración `quitar_a_anon_las_funciones_internas` las revoca de `public, anon` y
se las devuelve a `authenticated` y `service_role`. **Las que usa una política
con el rol `public` NO se tocaron** (`bajo_mi_coordinacion`,
`es_del_equipo_docente`, `equipo_docente`, `soy_dueno_del_plan`,
`plan_compartido_conmigo`, `estoy_inscrito_en`): una política `to public` se
evalúa también para `anon`, y sin el execute la consulta de una página pública
tronaría con un error de permisos en vez de dar «0 filas». Esas se arreglan
moviéndolas fuera de `public` o reescribiendo la política `to authenticated`,
que es un cambio aparte. Las que quedan a propósito para `anon` son las de las
páginas sin sesión: `formulario_publico`, `responder_formulario`,
`formulario_acepta_adjuntos`, `registrar_arbitraje_publico`,
`solicitar_academia`, `solicitud_para_elegir_plan` y `elegir_plan`.

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
