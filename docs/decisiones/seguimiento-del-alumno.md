# Tareas, planes, bitácora y exámenes

Notas de diseño para Claude, sacadas del CLAUDE.md de la raíz: lo que el profesor le pone y le observa a cada alumno.
El índice de todos los temas y las reglas que valen para todo el sitio
están en `CLAUDE.md`.

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
- **Los ejercicios que ya tenía resueltos CUENTAN; los minutos, no.** La meta
  `cantidad` cuenta los ejercicios distintos resueltos **desde siempre**, así
  que si le piden 10 de ataque doble y ya había hecho 12, el renglón nace
  cumplido. Antes contaba desde `tareas.created_at` ("diez nuevos"), y eso
  chocaba con lo de arriba: la página de entreno arranca en el primero SIN
  resolver, así que los ya hechos no se podían volver a sumar y la tarea
  pedía un trabajo que el alumno ya había hecho. La meta `minutos` SÍ sigue
  contando desde que se asigna: un rato de práctica de antes no es hacer la
  tarea. Medido con datos reales al cambiarlo: de 199 renglones de cantidad,
  23 subieron, varios de 0 a cumplidos (0 → 15 de 10, 0 → 26 de 20).
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
