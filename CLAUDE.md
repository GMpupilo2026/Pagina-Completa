# Ajedrez Integral — notas para Claude

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
  tablas de actividad arma el conjunto UNA vez»).
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
- Horas y días se cuentan en hora de Costa Rica (`America/Costa_Rica`).
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
- Accesibilidad: el foco se ve, un control que abre algo dice si está abierto,
  una tarjeta apagada no lleva `href` pero sí se alcanza con Tab, un emoji de
  título va en `<span aria-hidden="true">`, y todo ejercicio se puede contestar
  escribiendo (`js/cuadro-comandos.js`).

**Código y despliegue**
- **Una sola copia de cada cosa.** Lo que usan dos pantallas va en un módulo de
  `js/`; lo que se genera tiene su script en `herramientas/` y no se edita a
  mano (el CSS, el catálogo de cursos, el sitemap, los PDF, las cabeceras).
- Al usar una clase de Tailwind que no estaba en ningún lado: `npm run css`.
- Una página nueva de la Academia (que exige sesión) va en `PAGINAS` de
  `herramientas/academia-cabecera.py`, y se corre. Con tablero:
  `herramientas/tablero-cabecera.py`. Toda página: `pwa-cabecera.py` y
  `tema-cabecera.py`.
  Las migas de pan salen de ahí mismo: la página nueva va también en
  `NOMBRE_Y_PADRE`, diciendo de cuál cuelga.
- El worker publica **todo el directorio**: lo que no deba verse va en
  `.assetsignore` (ahí están `CLAUDE.md`, `docs/`, `supabase/`, `herramientas/`…).
- Cada migración aplicada y cada Edge Function desplegada se guardan en
  `supabase/` tal cual se aplicaron, y se corre
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
  con `serviceWorkers: "block"`. Si un verificador falla por el doble, se
  arregla el doble, no la página.
- Un verificador nuevo entra solo al CI. Antes de dar uno por bueno, romper a
  propósito lo que comprueba y ver que salte.

## Cómo se escribe

**Todo va en español** —el sitio y también las respuestas de Claude, los
commits y los PR—: latinoamericano, costarricense, **tuteo y nunca voseo**
(«puedes», no «podés»), computadora y celular. Lo que se escribe en la
conversación termina copiado en el sitio. `python3 herramientas/verificar-voseo.py`
lo revisa. Detalle en `docs/decisiones/idioma.md`.

## Índice: dónde está cada decisión

Los verificadores se corren con `node herramientas/verificar-todo.js <nombre> …`
(el nombre sin `verificar-` ni extensión). La lista es de los principales:
el archivo de cada tema dice cuál corresponde a cada pieza.

| Tema | Qué hay | Verificadores |
|---|---|---|
| [`sitio-e-infraestructura`](docs/decisiones/sitio-e-infraestructura.md) | El sitio: dominio y correo, PWA, CSS compilado, librerías propias, carga y primer pintado, metadatos, encabezado, migas y «?» de la guía, avisos propios, pantallas de carga y listas vacías, punto de restauración | worker, pwa, css, vendor, carga-tablero, carga-paginas, metadatos, notificaciones, avisos, ayuda, estados, punto-restauracion |
| [`permisos-y-roles`](docs/decisiones/permisos-y-roles.md) | Varios profesores, equipos, subgrupos, coordinación, supervisor, academias (marca, IA, tablero), roles, funciones de trigger, texto ajeno | varios-profesores, subgrupos, coordinacion, supervisor, academias, informe-mensual, mejorar-informe, tablero-academias |
| [`cuentas-y-formularios`](docs/decisiones/cuentas-y-formularios.md) | Formularios de inscripción y adjuntos, alta de cuentas, alumno sin correo, invitación y bienvenida | formularios, inscripcion-adjuntos, alumno-sin-correo, bienvenida, admin |
| [`clase-en-vivo`](docs/decisiones/clase-en-vivo.md) | `sesion.html`: material del profesor, videollamada, abrir/cerrar y registrar la clase, ficha presencial y horario, chat, coordenadas, miniaturas, Táctica y Archivos, la clase con lector de pantalla | clase-registrada, sesion-orden, sesion-curso, videollamada, asistencia, chat-clase, clase-adaptada, panel |
| [`seguimiento-del-alumno`](docs/decisiones/seguimiento-del-alumno.md) | Tareas, plan de clase y planes de arranque, bitácora, exámenes | tareas, planes, planes-semilla, notas, examenes |
| [`informes`](docs/decisiones/informes.md) | `informes.html`, «Cómo viene», tiempo por sección, informes a la casa, reportes de actividades | informes, informe-casa, tiempo-secciones, reportes |
| [`cobros-acceso-y-tienda`](docs/decisiones/cobros-acceso-y-tienda.md) | Cobros y avisos de morosidad, paquetes de acceso y cupos, tienda | cobros, accesos, tienda |
| [`cursos-y-material`](docs/decisiones/cursos-y-material.md) | Cursos (temario público, contenido con sesión), material de estudio, catálogo, guía del profesor, video, contenido abierto para admin | curso-adaptado, material, guia-profesores, contenido-admin |
| [`entrenamiento`](docs/decisiones/entrenamiento.md) | Progreso sincronizado, logros, hub de Entrenamiento, aperturas, Estudio, precisión posicional, diagnóstico, arbitraje, Confites, Sonar | entreno, aperturas, aperturas-pagina, fichas, estudio, precision-posicional, diagnostico, libro-diagnostico, arbitraje, logros, sonar |
| [`juegos-y-torneos`](docs/decisiones/juegos-y-torneos.md) | Bot de Oscar, torneos en vivo y ritmos, retar en línea, el profesor juega, aviso de pareo, reloj y triple repetición | bot-oscar, torneo-en-vivo, ritmos, profesor-juega, juego-aviso, reloj-y-repeticion |
| [`paneles`](docs/decisiones/paneles.md) | Panel de la Academia (`clases.html`), primeros pasos, burbuja de conectados, `admin.html`, inscripciones a torneos | panel, camino-entrenador, plan-recursos, burbuja, admin |
| [`tableros-y-apariencia`](docs/decisiones/tableros-y-apariencia.md) | Coordenadas, colores de casilla, el tablero elegido en todo el sitio, tema de la plataforma, contraste, arrastre táctil | tablero-preferido, temas-plataforma, arrastre-tactil, css |
| [`accesibilidad`](docs/decisiones/accesibilidad.md) | Tableros con teclado y lector de pantalla (Entreno y Juegos), cuadro de comandos, Modo Adaptado | entreno-accesible, juegos-accesible, cuadro-comandos |
| [`idioma`](docs/decisiones/idioma.md) | Tuteo, vocabulario, la tabla de `verificar-voseo.py` | voseo |
