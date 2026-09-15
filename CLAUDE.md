# Ajedrez Integral — notas para Claude

Sitio estático (HTML + Tailwind por CDN + JS sin framework) servido con
Cloudflare Workers Assets. `worker.js` solo sirve los archivos; `_headers` pone
las cabeceras de seguridad. No hay build ni tests: se edita el HTML/JS
directamente.

## Flujo de git

- Trabajar siempre en la rama de la sesión, nunca commitear en `main`.
- **Cuando el cambio esté terminado y verificado: empujar, abrir el PR contra
  `main` y mergearlo (squash), sin preguntar.** Es la preferencia del dueño del
  repo. El título del squash lleva el `(#NN)` del PR, como el resto del
  historial.
- Si el PR de la rama ya se mergeó, la siguiente tarea arranca de `main` al día.

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

## Multi-profesor: cada profesor con sus propios alumnos y su propia clase en vivo

El sitio pasó de asumir un solo profesor (Oscar) a soportar varios, cada uno
viendo y gestionando **solo sus propios alumnos asignados** — no toda la
plataforma — y pudiendo dar clase en vivo al mismo tiempo que otro profesor
sin pisarse.

- `profiles.teacher_id`: a qué profesor pertenece un alumno (null = sin
  asignar). Lo decide la persona administradora desde `admin.html`, o queda
  asignado automático al propio profesor cuando él mismo invita al alumno
  (`create-student` function). `profiles.grupo` es un texto libre
  (equipo/subgrupo) puramente organizativo, sin efecto en permisos.
- `public.my_profile()`: función `SECURITY DEFINER` que da el rol/is_admin/
  teacher_id de quien llama, sin volver a pasar por RLS de `profiles` —
  la usan casi todas las políticas nuevas. Antes, TODA política de
  "profesor" era `role = 'profesor'` a secas (cualquier profesor veía y
  gestionaba absolutamente todo); ahora casi todas exigen además que la fila
  pertenezca a un alumno con `teacher_id = auth.uid()` (o que quien llama
  sea `is_admin`, que sigue viendo todo).
- **Tablero en vivo**: `game_state` dejó de ser una fila única global
  (`CHECK (id = 1)`) — ahora cada profesor tiene su propia fila
  (`owner_id`, único). `variant_nodes` igual, vía `teacher_id`. `questions`,
  `class_sessions`, `practice_sessions` y `saved_games` ya tenían
  `created_by`: solo hacía falta filtrar por ahí en vez de tratarlos como
  globales (antes, por ejemplo, un profesor cerraba SIN darse cuenta la
  pregunta o la ronda de práctica abierta de cualquier otro profesor).
- En el cliente (`sesion.html`, `clases.html`), todo gira alrededor de
  `boardOwnerId`: el propio id si es profesor, o `profile.teacher_id` si es
  alumno — todas las consultas, canales de Realtime y el canal de presencia
  (`clases-presence:<boardOwnerId>`, antes un string fijo) se filtran por
  ahí. Un alumno sin `teacher_id` ve un aviso pidiendo que se le asigne uno,
  en vez de mezclarse con la clase de otro profesor.
- `class_chat_messages` no tiene tablero ni sesión: se filtra directo por
  `profiles.teacher_id` del alumno del hilo (el chat es continuo, no "de una
  clase puntual").
- **Regla permanente: todo lo que se haga para los profesores se hace también
  para quien administra**, con el mismo alcance que ya le da la base (el
  profesor ve lo suyo; quien administra, todo). En la práctica: `informes.html`
  trata `is_admin` como profesor, y lo que aparezca ahí para profesores
  aparece igual para administradores; si una función nueva vive en otra
  página, `admin.html` la enlaza.

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
  área, el mismo reparto de dificultad y 160 puntos, para que dos diagnósticos
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
  pasa de Experto (nadie con los finales en blanco es maestro). Está en
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
  perfil de ocho áreas de cada uno). Las barras usan tres bandas —a trabajar,
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
