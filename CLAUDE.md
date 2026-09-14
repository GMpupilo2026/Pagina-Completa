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
  área, el mismo reparto de dificultad y 109 puntos, para que dos diagnósticos
  del mismo alumno se puedan comparar aunque las preguntas hayan sido otras.
  Al agregar ítems hay que respetar el campo `peso` (1, 2 o 3): la cuota por
  peso de cada área está en `FORMA`. Los ids de la prueba quedan guardados en
  el estado (para retomarla) y en el resultado (`detalle.items`, para que la
  corrección repase esas preguntas y no otras).

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
  formas distintas en el mismo grupo.

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

## Accesibilidad

Buena parte del sitio tiene "modo adaptado" (`js/adaptive-mode.js`) para alumnos
con discapacidad visual: al tocar textos, encabezados o contraste, mantener el
alto contraste y los encabezados que permiten saltar directo al contenido.

## Cómo se escribe en el sitio

El español del sitio es el de acá: latinoamericano, costarricense. Se tutea
(no "vosotros"), se dice computadora y celular (no ordenador ni móvil), y los
términos de ajedrez van en el nombre que se usa en la región —horquilla,
enfilada, clavada, mate de la coz, mate del pasillo—, con el término en inglés
entre paréntesis solo cuando es el que el alumno va a encontrar buscando en
internet (zwischenzug, smothered mate). Nada de traducciones calcadas del
inglés ni de giros peninsulares.
