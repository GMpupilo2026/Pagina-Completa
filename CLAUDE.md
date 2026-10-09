# Ajedrez Integral — notas para Claude

**Todo lo que Claude escribe o dice en el chat va en español** (ver «Cómo se
escribe», al final).

Sitio estático (HTML + Tailwind compilado + JS sin framework) servido con
Cloudflare Workers Assets. `worker.js` solo sirve los archivos; `_headers` pone
las cabeceras de seguridad. Se edita el HTML/JS directamente; lo único que se
"construye" es el CSS (ver abajo) y lo generan los scripts de `herramientas/`.

**Este archivo es el núcleo: las reglas que valen para todo el sitio y un
índice.** El porqué de cada decisión —qué se probó, qué falló callado, qué se
comprobó impersonando roles en SQL— vive en `docs/decisiones/`, un archivo por
tema. Antes de tocar algo, **leer el archivo de su tema**: casi todo lo que
parece raro en este código está ahí explicado, y lo que no se lee se vuelve a
romper. Cuando un texto dice «ver X», X es el título de una sección de esos
archivos: `grep -rn "X" docs/decisiones/` la encuentra.

## Flujo de git

- Trabajar siempre en la rama de la sesión, nunca commitear en `main`.
- **Cuando el cambio esté terminado y verificado: empujar, abrir el PR contra
  `main` y mergearlo (squash), sin preguntar.** Es la preferencia del dueño del
  repo. El título del squash lleva el `(#NN)` del PR, como el resto del
  historial.
- Si el PR de la rama ya se mergeó, la siguiente tarea arranca de `main` al día.
- **No se mergea con el CI en rojo.** Mergear sin preguntar solo es seguro
  porque «Verificar» (abajo) corre todas las comprobaciones antes.

## El CI: todas las comprobaciones, en cada PR

`.github/workflows/verificar.yml` corre `herramientas/verificar-todo.js` en
cada PR contra `main`: un trabajo sin navegador y cuatro tandas en paralelo con
navegador. Antes los más de setenta verificadores corrían solo si alguien se
acordaba del que tocaba, y un verificador que no corre no da ningún error:
`verificar-alumno-sin-correo.js` estuvo roto en `main` sin que nadie lo viera.

- **`package.json` y `package-lock.json` se commitean** y fijan las versiones
  (chess.js 0.10.3, playwright, tailwindcss 3, supabase-js igual al de
  `js/vendor/`). `npm install` las deja todas; ya no hace falta instalarlas de a
  una como dicen las cabeceras viejas. `.assetsignore` los saca del despliegue.
- **La lista de verificadores no está escrita en ningún lado**: el corredor lee
  `herramientas/verificar-*.{js,py}`, y decide si necesita navegador por el
  `require("playwright")`. Un verificador nuevo entra al CI solo. Si necesita
  correr algo ANTES (un generador) o encadenar otro DESPUÉS, va en `ANTES` o
  `DESPUES` del corredor.
- En la máquina: `npm run verificar` (todos; levanta el sitio en el 8777 si no
  está), `npm run verificar:rapido` (sin navegador), o
  `node herramientas/verificar-todo.js panel tareas` para unos pocos. Los de
  Python necesitan `pip install pypdf cryptography python-docx`.

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

## Reglas que valen para todo el sitio

Casi todo lo que se rompe acá **no da ningún error**: la página se ve perfecta
y hace otra cosa. Estas reglas existen por eso.

**Permisos**
- **Quien decide qué se ve es la RLS, no la pantalla.** Un filtro en el
  navegador solo decide qué se pinta; lo que no se puede saltar desde la
  consola va en la base (política, trigger o función).
- «¿Quién es profesor de quién?» se pregunta con `profesores_de()` /
  `alumnos_de()` y sus hijas (`soy_profesor_de()`, `es_mi_profesor()`…);
  «¿sobre quién alcanza esta coordinación?» con `bajo_mi_coordinacion()`, y
  qué puede hacer adentro con `coordinador_puede()`. **Nunca** mirando
  `profile_teachers`, `equipo_*` o `profiles.teacher_id` directo.
- **Las academias son privadas**: nada de la gente de una academia le llega a
  otra, salvo Juegos (retar). Toda lista o vía que no pase por una relación
  directa (compañeros, colegas, «compartir con todos», rankings) se acota con
  `interno.comparten_academia()` / `gente_de_mis_academias()` (ver «Las
  academias son privadas»).
- **Todo lo que se hace para los profesores se hace también para quien
  administra** (`is_admin`), con el alcance que ya le da la base: lo que un
  profesor VE de sus alumnos, administración lo ve de todos. **Pero quien
  administra no da clase**: su panel no trae herramientas de dar clase (ver
  «El panel de quien administra no es el de un profesor»). Lo de dar clase lo
  revisa con «Ver como: profesor».
- En una política de una tabla que crece, el permiso no se pregunta fila por
  fila (`soy_profesor_de(student_id)`): se arma el conjunto una vez,
  `student_id in (select interno.alumnos_de(auth.uid()))`. Fila por fila, el
  informe se cayó por statement timeout con 7000 filas (ver «La RLS de las
  tablas de actividad arma el conjunto UNA vez»). Y en una política
  `auth.uid()` va siempre envuelto, `(select auth.uid())`: suelto se evalúa
  por fila (`verificar-rls-auth-uid.js` lo revisa en cada migración nueva).
- **La verificación en dos pasos la exige la base**: PostgREST corre
  `public.antes_de_cada_pedido()` antes de cada pedido, y cada tabla de
  Realtime lleva la política restrictiva `verificacion_en_dos_pasos` (una
  tabla nueva en Realtime también). Una Edge Function que mira el permiso con
  la clave de servicio no pasa por ahí: comprueba el `aal` del token (ver «La
  verificación en dos pasos»).
- **Lo que reparte permisos, accesos o dinero queda anotado** en
  `public.auditoria` por el trigger `interno.auditar()`. Una tabla nueva de
  ese tipo lleva el suyo y va en `VIGILADAS` de `verificar-auditoria.js`; la
  bitácora no se escribe, cambia ni borra desde afuera (ver «La bitácora de
  auditoría»).
- Las tablas que reparten permisos (`profile_teachers`, `equipos`,
  `coordinador_profesores`, `paquetes_acceso`…) no tienen política de
  escritura: las escriben funciones que validan.
- Una función `SECURITY DEFINER` que contesta sobre otra persona es una API:
  `revoke execute … from public, anon` (revocar solo de `anon` no sirve: lo
  hereda de `public`). Las de TRIGGER, además de `authenticated`. Nunca quitarle
  el execute a `authenticated` de una función que usa una política.
- En una función `SECURITY DEFINER`, el `if not (a or b or c)` del permiso va
  envuelto en `coalesce(..., false)`: con `auth.uid()` nulo da NULL y no rechaza.
- Un trigger compartido por dos tablas nunca nombra `new.<columna>` que una de
  ellas no tenga, ni detrás de un `and`: usar `to_jsonb(new)->>'columna'`.
- Una función que lo arregla todo «y devuelve listo» vuelve a LEER la fila: el
  trigger de identidad revierte en silencio y el `RETURNING` trae lo revertido.

**Datos**
- **PostgREST corta a ~1000 filas sin avisar.** Las cuentas se hacen en la base
  (funciones `SECURITY INVOKER`) y las listas se piden con `range()`/`count` o
  de mil en mil. Nunca bajarse una tabla entera para sumar en el navegador.
- Lo que se deriva de otras filas no se guarda (el estado de un cobro, el
  avance de una tarea): se calcula. La excepción es el acta (la nota de un
  examen, la foto de un informe enviado).
- Las funciones `set_*` dejan la lista **exactamente como llega**: para sumar,
  se manda la UNIÓN con lo que ya estaba. Mandar solo lo nuevo vacía el resto.
- Lo que no puede pasar dos veces lo garantiza un índice único, no un `if`.
- Horas y días se cuentan **y se muestran** en hora de Costa Rica
  (`America/Costa_Rica`): todo formato de fecha lleva su `timeZone`, un día de
  calendario no se lee con `new Date("AAAA-MM-DD")` y el «hoy» no sale de
  `toISOString()`. En las páginas, `js/hora-cr.js` (ver «Las fechas y las
  horas, siempre en hora de Costa Rica»; lo revisa `verificar-hora-cr.js`).
- Un formulario que pide datos personales lleva su casilla de consentimiento
  con enlace a `privacidad.html`, y un servicio nuevo que reciba datos va en la
  lista de proveedores de esa página (ver «Las páginas legales»).
- Todo texto que escribe una persona (nombres, notas, mensajes) va por
  `textContent` o escapado (`escVis`), también dentro de atributos.
- **Nunca `alert()`, `confirm()` ni `prompt()`**: `js/avisos.js`
  (`Avisos.avisar`, `Avisos.confirmar`…). El botón dice lo que hace, no
  «Aceptar» (ver «Los avisos son de la página, no del navegador»).

**Contenido**
- **Ninguna posición de ajedrez se inventa.** Sale de un banco ya verificado o
  se comprueba con chess.js (y con motor si promete un resultado).
- **Ningún color se elige a ojo**: el contraste se mide (WCAG AA, contra el
  fondo real) y el color nunca va solo: el dato va también escrito.
- **Todo cuento o libro infantil lleva un secreto para Alessandro**, el hijo
  del autor: una dedicatoria en acróstico, un personaje con su nombre en
  anagrama o algo parecido, escondido y nunca anunciado en el libro, y
  comprobado por el verificador del libro (ver «Cada cuento lleva un secreto
  para Alessandro»).
- Accesibilidad: el foco se ve, un control que abre algo dice si está abierto,
  una tarjeta apagada no lleva `href` pero sí se alcanza con Tab, un emoji de
  título va en `<span aria-hidden="true">`, y todo ejercicio se puede contestar
  escribiendo (`js/cuadro-comandos.js`).

**El diagnóstico de nivel** (detalle en «Versión 5: 60 preguntas y la fuerza en
puntos Elo»)
- **El nivel sale de la fuerza en puntos Elo, no del porcentaje ni de los
  escalones.** Cada pregunta tiene su dificultad (`elo`) y
  `PlanEntrenamiento.medir()` da la fuerza que mejor explica cuáles resolvió,
  con su margen. Por qué: con escalones, un 1463 sacaba 92 % y un 2033 93 %;
  la prueba no distinguía a nadie por encima de ~1450.
- **Acertar por azar pesa distinto**: 0,2 en las de opción, 0 en las de mover.
  **El Elo declarado se suma según su precisión** (FIDE ± 100, nacional ± 150,
  en línea ± 250, del profesor ± 200), no con un peso fijo.
- **Una pregunta de tablero tiene UNA sola jugada buena, comprobada con
  Stockfish**, y las de opción llevan distractores que tientan (jaques,
  capturas, la segunda idea del motor) y fallan por algo que la explicación
  dice. Nada de opciones absurdas: se descartan sin saber ajedrez.
- **La dificultad no se pone a ojo**: las preguntas de Lichess parten de su
  rating y las demás se calibran con las respuestas reales y el Elo declarado
  (`herramientas/diagnostico-calibrar.js`). `eloBase` no se toca nunca; `elo` y
  `peso` los escribe el script. El bloque `LICHESS` del banco lo genera
  `herramientas/diagnostico-lichess.js` y no se edita a mano. Los datos de
  personas que se exportan para calibrar nunca van al repositorio.
- **Un área se juzga contra lo esperable para la fuerza del alumno**
  (`notaDeArea`), no por su porcentaje: con la mitad de la prueba difícil, un
  1500 saca 30 % sin tener huecos, y el plan mandaría siempre a las áreas con
  más preguntas duras. El tope por áreas también es relativo.
- **Cambiar la forma de la prueba (`FORMA`) o la medición sube `VERSION`**, y
  los resultados viejos se siguen leyendo con su regla de entonces: nunca se
  vuelven a etiquetar. Al tocar el banco: `verificar-diagnostico.js` y volver a
  generar el cuadernillo y el libro.
- **Después de generar preguntas de Lichess, siempre calibrar**: el generador
  escribe `elo = eloBase`, y el corrimiento de Lichess (−380 las de mover, −160
  las de opción en la primera calibración) lo pone `diagnostico-calibrar.js`.
  Conviene volver a calibrar cada vez que se junten unos 15-20 diagnósticos
  nuevos con Elo declarado.

**Código y despliegue**
- **Una sola copia de cada cosa.** Lo que usan dos pantallas va en un módulo de
  `js/`; lo que se genera tiene su script en `herramientas/` y no se edita a
  mano (el CSS, el catálogo de cursos, el sitemap, los PDF, las cabeceras).
- Al usar una clase de Tailwind que no estaba en ningún lado: `npm run css`.
- El código de una página va en un archivo de `js/`, no en un `<script>` escrito
  dentro, y ningún atributo `on…` (ver «El código de las páginas sale del
  HTML»): `verificar-csp.js` solo deja pasar los tres bloques de los
  generadores (guardia, tema, modo oscuro), iguales en todas las páginas.
- Una página nueva de la Academia (que exige sesión) va en `PAGINAS` de
  `herramientas/academia-cabecera.py`, y se corre. Con tablero:
  `herramientas/tablero-cabecera.py`. Toda página: `pwa-cabecera.py`,
  `tema-cabecera.py` y `cabecera-en-linea.py`.
  Las migas de pan salen de ahí mismo: la página nueva va también en
  `NOMBRE_Y_PADRE`, diciendo de cuál cuelga.
- El worker publica **todo el directorio**: lo que no deba verse va en
  `.assetsignore` (ahí están `CLAUDE.md`, `docs/`, `supabase/`, `herramientas/`…).
- **El worker solo corre donde lo nombra `run_worker_first`** (`wrangler.jsonc`):
  el resto lo sirve Cloudflare directo, sin pasar por `worker.js`. Hoy son
  `cursos/protegido/` y `cursos/recursos/`, que exigen una cuenta con el acceso
  vigente (ver «El candado de los cursos está en el servidor»). Un candado
  nuevo en el worker sin su línea ahí no existe.
- Cada migración aplicada y cada Edge Function desplegada se guardan en
  `supabase/` tal cual se aplicaron, se vuelve a armar el retrato del esquema
  (`herramientas/inventario-esquema.sql` → `supabase/esquema/inventario-academia.txt`,
  con su `# al-dia-con:`) y se corre
  `node herramientas/verificar-punto-restauracion.js`. Las funciones se arman
  con `node herramientas/funciones-armar.js` (copia `_compartido/`). Ver
  `RESTAURAR.md`.
- Los alumnos sin correo entran con un usuario de
  `alumno.ajedrez-integral.com`, un dominio **sin MX a propósito**: a esa
  dirección nunca se le manda correo; se le escribe a
  `correo_de_contacto()`.

**Verificadores**
- Al tocar algo, correr su verificador (el índice de abajo dice cuáles) y
  mirar la pantalla, no solo el DOM. Para «se ve / no se ve» se mide
  `getComputedStyle`/`checkVisibility()`, nunca la clase ni el atributo.
- Los dobles de Supabase apuntan los filtros en el RESOLVER (no en `update()`),
  filtran de verdad, conocen `mis_funciones_coordinacion` y los contextos van
  con `serviceWorkers: "block"`. Un verificador que abre páginas de la Academia
  con el doble en `js/supabase-client.js` (no como `window.sb`) usa
  `require("./lib/playwright-con-sesion")`: sin una sesión guardada, la guardia
  de sesión lo manda al login antes de cargar nada. Si un verificador falla por el doble, se
  arregla el doble, no la página.
- Un verificador nuevo entra solo al CI. Antes de dar uno por bueno, romper a
  propósito lo que comprueba y ver que salte.

## Cómo se escribe

**Todo lo que Claude le escribe o le dice al dueño en el chat va en español**,
siempre: las respuestas, los avisos de qué está haciendo, las preguntas, los
resúmenes al terminar y lo que diga en voz. Aunque una herramienta, un error o
un documento llegue en inglés, la respuesta se da en español.

**Todo va en español** —el sitio y también las respuestas de Claude, los
commits y los PR—: latinoamericano, costarricense, **tuteo y nunca voseo**
(«puedes», no «podés»), computadora y celular, y **«tenedor», nunca
«horquilla»** (`verificar-vocabulario.py`). Lo que se escribe en la
conversación termina copiado en el sitio. `python3 herramientas/verificar-voseo.py`
lo revisa. Detalle en `docs/decisiones/idioma.md`.

## Índice: dónde está cada decisión

Los verificadores se corren con `node herramientas/verificar-todo.js <nombre> …`
(el nombre sin `verificar-` ni extensión). La lista es de los principales:
el archivo de cada tema dice cuál corresponde a cada pieza.

| Tema | Qué hay | Verificadores |
|---|---|---|
| [`sitio-e-infraestructura`](docs/decisiones/sitio-e-infraestructura.md) | El sitio: dominio y correo, PWA, CSS compilado, librerías propias y sus dependencias vigiladas (Dependabot, npm audit), carga y primer pintado, metadatos, encabezado, migas, «?» de la guía (del equipo docente) y Ctrl + K, avisos propios, pantallas de carga y listas vacías, punto de restauración, Realtime filtrado, los errores de la gente en Sentry, las fechas y horas siempre en hora de Costa Rica (`js/hora-cr.js`), la base saturada del 29/9 y el aviso por correo cuando vuelve a pasar, las fuentes servidas por el sitio, la navegación que se adelanta al clic y la que se siente inmediata (navigation preload, transición entre páginas, la barra de «ya va») | alerta-base, hora-cr, token-sesion, rutas, worker, pwa, css, fuentes, anticipar, navegacion, vendor, errores, respaldo-storage, encabezado-scroll, carga-tablero, carga-paginas, csp, guardia-sesion, metadatos, notificaciones, avisos, ayuda, atajo, estados, punto-restauracion, realtime-filtros, realtime-publicadas, mi-perfil |
| [`permisos-y-roles`](docs/decisiones/permisos-y-roles.md) | Varios profesores, equipos, subgrupos, coordinación, supervisor y «Ver como» una persona, academias (marca, IA, tablero, un supervisor con varias), roles, funciones de trigger, la verificación en dos pasos, la bitácora de auditoría, texto ajeno, la foto de perfil (bucket privado, la ve quien ve el perfil), borrar una cuenta (toda clave a `profiles` lleva su `on delete`) | varios-profesores, subgrupos, coordinacion, supervisor, ver-como, academias, informe-mensual, mejorar-informe, tablero-academias, dos-pasos, dos-pasos-base, auditoria, foto-perfil, borrar-cuenta |
| [`cuentas-y-formularios`](docs/decisiones/cuentas-y-formularios.md) | Formularios de inscripción y adjuntos, freno de los envíos sin cuenta, tope diario del lector de planilla, la prueba de nivel inicial de un formulario («¿Sabe jugar ajedrez?» con siete preguntas de reglas comprobadas con chess.js), encuesta de satisfacción con el profesor, encuesta anónima y accesible de un curso, alta de cuentas, alumno sin correo, invitación y bienvenida (con su contraseña provisional, también al reenviar el acceso), la ficha de los JDN 2027 (la plantilla del ICODER llena, la categoría por año de nacimiento y su carpeta en el Drive por un Apps Script) | jdn, formularios, prueba-nivel-inicial, envios-publicos, lector-planilla, inscripcion-adjuntos, encuesta-profesor, encuesta-curso, alumno-sin-correo, bienvenida, reenviar-provisional, admin |
| [`clase-en-vivo`](docs/decisiones/clase-en-vivo.md) | `sesion.html`: material del profesor, la clase vista por quien supervisa, los alumnos siguen lo que mira el profesor, comentar las jugadas, videollamada, abrir/cerrar y registrar la clase, las herramientas del profe en grande en una ventana encima del tablero, repasar mis clases, ficha presencial y horario, chat, coordenadas, miniaturas, Táctica, Entrenamientos y Archivos, la clase con lector de pantalla, el PGN de la clase con variantes y comentarios, lo que hizo cada alumno al cerrar, preguntas con tiempo, opciones, termómetro y resultados, práctica con reloj, partidas entre alumnos, a ciegas, el plan marcado, la tarea de repaso y «Tu última clase», el alumno elegido al azar, la participación oral y la cola de manos, la pregunta dirigida y las respuestas en el tablero, el tiempo para pensar, la pregunta de salida y repasar lo que no quedó, mostrar la respuesta de un alumno a la clase, notas rápidas con la posición, la clase como lección para quien faltó, el mapa de jugadas de una pregunta en el tablero, la posición de calentamiento, el calentamiento de 20 ejercicios distintos para cada alumno (mismo nivel, con tiempo y nota) o la competencia de ejercicios (los mismos para todos, gana quien resuelva más), con el tiempo que el profe cambia mientras corre, los puntos de la clase (según la dificultad, los intentos y quién acierta primero; también el calentamiento y la competencia, en `tanda_resultados`) y el podio, la clase juega votando contra el motor o el profe, el repaso personal al cerrar (y lo que vio la respuesta vuelve a la semana), el modo proyector, los equipos, el control remoto desde el celular, los puntos del mes, lo de la clase se limpia al cerrar y se dice en voz, sesion.js en partes, la clase en el celular del alumno y del profe, todos los entrenamientos del sitio en la clase (pestaña Entrenamientos, de la lista de `js/material-plataforma.js`: los nuevos entran solos), lo que más le costó a tu clase (panel del profe) y a cada alumno (su informe), la ronda rápida, el cuestionario al estilo Kahoot (guardado, puntos por rapidez con la hora de la base, podio tras cada pregunta; se arma también en `cuestionarios.html`, con 30 listos por nivel), quién lleva un rato sin contestar, «Activar voz» para quien ve poco, «Ver como alumno», entrar desde el celular con el código QR del proyector, el profe mira la partida de práctica de un alumno y lo ayuda, la clase vista por invitados sin cuenta (enlace, pantalla completa, aviso al salirse, Modo Adaptado y voz, el profe se los enciende), sacar a un alumno de la clase si entró por error (lo decide la base, con «Dejarlo volver»), la presentación de la clase (el profe elige cuál compartir —las del curso o un PDF suyo, partido en imágenes en un bucket privado que al alumno solo le da la diapositiva que se muestra— y sale arriba del tablero para todos, con sus posiciones al tablero; en el proyector, al lado; y la vista limpia que el profe les enciende: la diapositiva, el tablero y el chat, con las preguntas encima), «¿Qué quieres hacer?»: buscar una herramienta sin salir de la clase (lleva, no aprieta; Ctrl + K) | clase-presentacion, clase-buscar, clase-sacar, clase-tanda, clase-reconexion, clase-entrenamientos, herramientas-grandes, clase-invitados, clase-voz, clase-ronda, clase-cuestionario, cuestionarios-listos, cuestionarios-pagina, clase-qr, clase-movil, lo-que-costo, clase-remoto, clase-juega, clase-repaso-personal, clase-encuesta, practica-ayuda, clase-registrada, repasar-clases, clase-supervisor, clase-vista, clase-pgn, clase-resumen, clase-preguntas, clase-partidas, clase-elegido, clase-participacion, clase-dirigida, clase-pensar, clase-salida, clase-mostrar, clase-notas, sesion-orden, sesion-curso, videollamada, asistencia, chat-clase, clase-adaptada, panel |
| [`seguimiento-del-alumno`](docs/decisiones/seguimiento-del-alumno.md) | Tareas, el cuestionario como tarea (se contesta en la casa y califica la base), plan de clase y planes de arranque, bitácora, «Mi cuaderno» del alumno (sus posiciones con su nota, compartidas si quiere), exámenes, justificaciones de ausencia | tareas, cuaderno, cuestionario-tarea, planes, planes-semilla, notas, examenes, justificaciones |
| [`informes`](docs/decisiones/informes.md) | `informes.html`, «Con este alumno» (la ficha del alumno: tarea, examen, bitácora, casa, cuaderno y libreta a un clic), «Cómo viene», «Antes y ahora» (la fuerza diagnóstico a diagnóstico y lo que antes fallaba), comparar dos o tres alumnos área por área, el informe del grupo en PDF, tiempo por sección, los errores de sus partidas, lo que el alumno juega en Lichess y Chess.com (su repertorio, puntos fuertes y débiles, comparado con «Mi repertorio»), informes a la casa y «Unas palabras de su profe» (con frases listas según cómo viene el alumno, y sus plantillas), el Elo oficial (FIDE y Nacional) mes a mes, reportes de actividades, el informe técnico mensual para el CCDR San José (Word con la guía del comité, armado con los datos de una carpeta de Drive; paso a paso en `.claude/skills/informe-ccdr/`) | informes, informe-ccdr, analisis-alumno, informe-casa, elo-fide, elo-configuracion, tiempo-secciones, reportes, rls-auth-uid |
| [`cobros-acceso-y-tienda`](docs/decisiones/cobros-acceso-y-tienda.md) | Cobros y avisos de morosidad, de qué día a qué día cubre cada cobro (ya pagado hasta, proporcional, periodo a la medida), los recibos por academia (quien coordina registra, quien supervisa revisa, entrega y corrige), el pago adelantado, paquetes de acceso y cupos, la prueba gratis de 3 días, las cuentas temporales (un alumno que se cierra solo en una fecha, con su propio aviso: el taller del MEP), tienda | cobros, recibo, accesos, prueba-gratis, cuentas-temporales, tienda |
| [`cursos-y-material`](docs/decisiones/cursos-y-material.md) | Cursos (temario público, contenido con sesión y su candado en el worker, los cursos escondidos a alumnos y profesores, los certificados al terminar un curso: el profe los da y se comprueban con su código), material de estudio, catálogo, guía del profesor, video, contenido abierto para admin, el libro de examen «Ponte a prueba» (180 posiciones de Lichess comprobadas con Stockfish, dos preguntas por posición con crédito parcial, fuerza por categoría; su banco es también una fuente de exámenes), los cuentos ilustrados de Peonita para niños de 4 a 8 años: «Peonita y el reino de las 64 casillas» (aprender a jugar) y «Peonita, Tizón y los trucos del bosque» (los primeros trucos, cada respuesta comprobada como la única que gana con el buscador de `lib/tactica.js`) y «Peonita y el rey escondido» (los primeros mates, el ahogado y los mates en dos, cada uno comprobado como el único con chess.js); respuestas escritas a mano, dibujos en SVG propios y un secreto para Alessandro en cada cuento, los materiales de clase en `admin.html#materiales` (con quién se comparte cada uno lo decide `puede_bajar()`; cada prueba en tres versiones como cuestionario y en PDF para imprimir con su clave de corrección; en la tarea cada alumno ve su propio orden), el banco de ejercicios «Mide tu fuerza» (diez volúmenes con posiciones distintas, cada uno de 45 tests temáticos de 8, en tres niveles —desde el 7, con mate en dos, mate en tres y sacrificio en lugar de jaque doble, rayos X e interferencia—, de Lichess y comprobados con Stockfish; tomado como método, no copiado), el curso y el libro «Rompe el estancamiento» (las siete familias de errores que frenan de 1400 a 2100 y la ficha de errores; el ejemplo de cada lección es la misma posición de Lichess en el curso y en el libro, comprobada con Stockfish; tomado como idea, no copiado), el curso y el libro «Los cimientos del ajedrez» (72 lecciones en tres niveles con el temario de un método clásico y sus partidas, buscadas en una base pública de PGN y comprobadas con Stockfish; texto propio; lo que Lichess no trae —tablas y finales teóricos— sale de partidas reales de la misma base), el curso y el libro «Ganar con poco» (ver, sumar y cobrar ventajas pequeñas: piezas, peones, cambios, finales, paciencia y defensa, las 18 partidas del libro de Leyva con comentarios propios y momentos clave confirmados con Stockfish, y el cuaderno de ventajas; posiciones de técnica de Lichess comprobadas con Stockfish, la misma en el curso y en el libro; tomado como idea de *Ventajas microscópicas*, no copiado), el curso y el libro «Cambiar o no cambiar» (el cambio de piezas en la estrategia, con las 33 partidas modelo y los 22 ejercicios del libro de Diego Valerga, jugadas comprobadas con chess.js y lo que opina Stockfish escrito al pie; posiciones de estrategia que no prometen resultado, «*» en el visor), el curso y el libro «Ideas que ganan partidas» (las ideas de ataque, estructura y final en seis capítulos; cada lección pide una idea que se comprueba en la posición, no en la etiqueta de Lichess; tomado como temario, no copiado), «Coachess en resumen» (el resumen atribuido de un libro ajeno sobre ajedrez y desarrollo personal: sus ideas con otras palabras, nunca su texto), el curso y el libro «Una clase al día» (las 360 clases del MI Ángel Martín, publicadas con permiso y con su crédito aunque el nombre sea propio y ordenadas por tema en doce bloques: casi 2000 partidas leídas del PDF y comprobadas jugada a jugada, los diagramas reconocidos y los momentos clave y ejercicios confirmados con Stockfish; los datos van en un archivo por lección y el libro en doce tomos sale de ellos), la ficha «Asesores» de `admin.html#asesores` («Formación Ajedrez» sesión por sesión: estado de preparación en `preparacion_sesiones`, presentación, Kahoot listo del material y con quién se comparte), la sección «Archivos» de `admin.html#archivos` (todos los PDF, Word, Excel, presentaciones, versiones accesibles e imágenes del sitio, una ficha por tipo, cada una un explorador por carpetas, con vista previa sin bajarlos —`js/vista-previa.js` abre los .pptx/.docx/.xlsx en el navegador—; la lista la arma `herramientas/archivos-catalogo.js` del disco y el CI falla si falta uno nuevo) | los-cimientos, los-cimientos-pdf, rompe-el-estancamiento, rompe-el-estancamiento-pdf, coachess-resumen, ideas-que-ganan-partidas, ideas-que-ganan-partidas-pdf, cambiar-o-no-cambiar, cambiar-o-no-cambiar-pdf, ganar-con-poco, ganar-con-poco-pdf, mil-lecciones, mil-lecciones-pdf, archivos-catalogo, worker, cursos-ocultos, curso-adaptado, certificados, material, guia-profesores, contenido-admin, libro-examen, libro-ninos, mide-tu-fuerza, mide-tu-fuerza-pdf, admin, cuestionario-tarea |
| [`entrenamiento`](docs/decisiones/entrenamiento.md) | Progreso sincronizado, logros, trofeos e insignias de la clase, hub de Entrenamiento y su «Repaso del día» (todas las colas en un recorrido), finales contra la máquina, aperturas y «Mi repertorio» (las líneas de cada alumno, en árbol, una respuesta por posición), Estudio, precisión posicional, las fichas de Estudio en papel (el libro y las cartas de 63 × 88 mm para recortar) y su versión accesible para quien no ve (un documento sin imágenes, con índice por categoría y alfabético) y lo que prometen, confirmado con Stockfish (`herramientas/fichas-motor.js`, a mano: el CI no tiene motor), diagnóstico (fuerza en puntos Elo, preguntas de Lichess, calibración), la dificultad de los Mates medida con los intentos, los ejercicios sin internet (una tanda guardada en el celular que se sube sola con su hora), la meta de la semana que elige el alumno, «Tu mes en ajedrez» (el resumen del mes para compartir), arbitraje, Confites, Sonar, Batalla naval, Memoria (piezas y segundos a elegir), Habilidades, que por dentro se llaman Tipos de entrenamiento (Detective, amenaza, Descarte, Siete diferencias, balanza, Fotografía, Con lo justo, Barrido, Intercambios, Constrúyela tú, Rey y peón, el maestro, aperturas, Ruta segura, Aguanta, Remata la ventaja, Salva las tablas, Elige a tiempo, Tus propios errores, con las partidas de torneo en tablero que anota el alumno de su planilla, a mano o con una foto, y su libreta de torneos con lo que pensaba en cada jugada y cómo le fue con lo que había preparado) | entreno, planilla-ocr, libreta-torneos, fichas-pdf, entreno-arreglos, entreno-nivel, entreno-repaso, tu-mes, mates-calibrar, mates-dificultad, finales, finales-pagina, aperturas, aperturas-pagina, repertorio, sin-internet, fichas, estudio, precision-posicional, diagnostico, libro-diagnostico, arbitraje, logros, trofeos, sonar, batalla-naval, memoria, memoria-pagina, tipos, tipos-pagina, errores-propios |
| [`puntos-y-premios`](docs/decisiones/puntos-y-premios.md) | Puntos Ajedrez: el total único que junta los puntos de la clase (preguntas, calentamiento, competencia) con entrenamiento, tareas, exámenes y racha de días en un ledger de apéndice (`puntos_ajustes`, idéntico patrón a `trofeos_ajustes`); la tienda de puntos (`puntos-tienda.html`) y su catálogo en la base (`premios_catalogo`), con títulos y marcos de perfil, puntos dobles por un tiempo, adelantar una lección de un curso (reutiliza `course_unlocks`) o un material de la tienda (reutiliza `compras_tienda`) sin pagarlo, y accesorios de avatar (gorros, lentes, una corona…) que ve el profesor en «Alumnos conectados» de la clase en vivo, no solo quien los tiene; lo pendiente (tareas, racha, retos) se cobra al abrir el panel (`reclamar_puntos_pendientes`), los retos de la semana con su bono, el marcador del salón (solo compañeros: mismo profe y misma academia), regalos y bromas a un compañero con mensajes de una lista (nunca a quien tiene su visión marcada, ni en un examen, la clase en vivo o un torneo; con su nombre siempre, y el profe las apaga en su clase), el robo de puntos entre alumnos (quien gana una partida estándar que tuvo perdida le roba a su rival la mayor ventaja en material que tuvo, por 100; calculado con chess.js en la Edge Function `partida-fin`, disparada por `game_rooms`) | puntos, bromas, puntos-robo |
| [`juegos-y-torneos`](docs/decisiones/juegos-y-torneos.md) | Bot de Oscar y el motor con mate en uno en contra, el bot que siempre contesta y no le cobra su tiempo al alumno, torneos en vivo y ritmos, la sala de cine de las transmisiones de Lichess y sus ambientes (teatro, estadio, planetario…), las salas que edita administración, sus posiciones de chess-results, el comentarista y la quiniela, retar en línea, los retos de ejercicios entre compañeros (los mismos 5 para los dos, cada uno cuando puede), el profesor juega, aviso de pareo, reloj y triple repetición, lo que comparten los juegos (`sala-juego.js`, `racha-tablero.js`), las jugadas que llegan siempre (volver a leer la sala al reconectarse, lo viejo no pisa lo nuevo, 50 partidas a la vez, y en Ajedrez para 4 ninguna escritura pisa a otra), los cuatro juegos originales: Volcanes, Misiones secretas (la misión la esconde la base), Relevo en silencio (por equipos, el turno lo decide la base) y La partida perdida, el Ajedrez 4×8 (medio tablero contra la computadora o alguien al lado; sus reglas, comprobadas contra chess.js), Pareo Integral (`pareo.html`: el emparejador público de torneos, sin cuenta y en el navegador; el Sistema Holandés de FIDE lo calcula bbpPairings compilado a WebAssembly, los desempates del C.07:2026 están comparados con chesspairing, y trae el TRF, el comprobador y el generador al azar que FIDE pide para avalarlo), la página pública «Ajedrez estudiantil en Costa Rica» (los JDE por año, etapa, región y categoría, de los torneos de chess-results, que se pone al día sola cada seis horas), las herramientas de arbitraje con licencia (la vitrina pública, las licencias que genera administración y la selección CODICADER por parámetros desde chess-results, en vivo) y su Espacio de consultas gratis (una pregunta sobre el reglamento FIDE, sin cuenta, respondida por IA con freno y presupuesto propios) | pareo, pareo-pagina, ajedrez-estudiantil, ajedrez-estudiantil-reglas, ajedrez-4x8, seleccion-calculo, seleccion-chess-results, seleccion-pagina, arbitraje-consulta, juegos-nuevos, juegos-nuevos-en-vivo, misiones-secretas, partida-perdida, partidas-simultaneas, cuatro-escrituras, retos-ejercicios, bot-oscar, bot-mate-en-uno, bot-siempre-contesta, torneo-en-vivo, transmision, salas-torneo, pizarra-chess-results, quiniela, escenarios-sala, ritmos, profesor-juega, juego-aviso, reloj-y-repeticion |
| [`paneles`](docs/decisiones/paneles.md) | Panel de la Academia (`clases.html`), primeros pasos, burbuja de conectados, `admin.html` (seis pestañas por tema, la ficha de cada persona al costado, Ctrl + K que busca personas, secciones y páginas, y las páginas de quien administra en una sola lista, `js/paginas-admin.js`), `coordinacion.html`, la página de quien supervisa (`supervisor.html`: cinco pestañas, la ficha de Coordinación al costado y el mes de cada profesor) y los paneles de quien supervisa, de quien da clase y del alumno (lo urgente primero, una sola puerta para cada cosa), los equipos de coordinación, la preparación de rivales (activable por profesor; el alumno se prepara solo con «Prepárate tú»), los proyectos (un programa de clases por grupo, como Campeones Colegiales: cada clase de 2 horas en cinco partes —calentamiento, contenido, actividad recreativa, cierre y tarea— con su paso a paso y los ejercicios en orden, lista para la clase en vivo, tareas semanales para mandar, y asignado a su profesor desde `admin.html#proyectos`), inscripciones a torneos, las cifras de la portada y el panel que no se queda cargando con la base saturada, y en el del alumno la próxima clase, «Agregar a mi calendario» (sus clases, tareas y exámenes en un `.ics`), el panel para los más pequeños (pocas puertas grandes y «Escúchame»), el recorrido del profesor nuevo, lo que más usa, cuánto lleva, los avisos de Competir, la marca «Nuevo», el aviso del profe que no se salta, «Entrenar 10 minutos», las favoritas, la semana en barras y la campana | panel, calendario-ics, aviso-profe, contenido-panel, mi-entreno, camino-entrenador, plan-recursos, burbuja, admin, preparacion-rivales, proyectos, proyecto-pagina, cifras-portada |
| [`tableros-y-apariencia`](docs/decisiones/tableros-y-apariencia.md) | Coordenadas por fuera en todos los tableros, el tablero que cabe en pantallas bajas, el tablero siempre cuadrado (filas `minmax(0,1fr)` e interlineado 1 en la casilla; ver «Estudio: una ficha por idea»), colores de casilla, el tablero elegido en todo el sitio, «Clásico ilustrado» por omisión para profesores y alumnos nuevos, tema de la plataforma (con los magos de Magia) y la letra elegida aparte, contraste, arrastre táctil, elegir la pieza al coronar | tablero-preferido, pieza-omision, coordenadas-fuera, tablero-cabe, tablero-cuadrado, temas-plataforma, arrastre-tactil, css, coronacion |
| [`accesibilidad`](docs/decisiones/accesibilidad.md) | Tableros con teclado y lector de pantalla (Entreno y Juegos), cuadro de comandos, Modo Adaptado, «Activar voz» en todo el sitio para quien ve poco (los avisos, las jugadas del tablero y la posición a pedido), la visión de cada persona marcada por administración (baja visión: la voz; ciega: el panel adaptado, lo no adaptado oculto y los accesos rápidos) | entreno-accesible, juegos-accesible, cuadro-comandos, voz-pagina, vision-cuenta |
| [`legal`](docs/decisiones/legal.md) | Política de privacidad y términos (Ley 8968, Ley 7472), los enlaces en todos los pies, el consentimiento antes de mandar datos y guardado en la base | legal, formularios |
| [`idioma`](docs/decisiones/idioma.md) | Tuteo, vocabulario («tenedor», nunca «horquilla»), la tabla de `verificar-voseo.py` | voseo, vocabulario |
