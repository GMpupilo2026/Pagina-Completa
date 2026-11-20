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
- **Un PR en borrador no corre el CI**: hay que marcarlo listo
  (`draft: false`) para que corra «Verificar», y recién con el verde se
  mergea. El repositorio es privado y cada minuto de Actions se paga, así que
  se empuja cuando el cambio está terminado, no a cada paso.
- Si el PR de la rama ya se mergeó, la siguiente tarea arranca de `main` al día.
- **No se mergea con el CI en rojo.** Mergear sin preguntar solo es seguro
  porque «Verificar» (abajo) corre todas las comprobaciones antes.

## El CI: todas las comprobaciones, en cada PR

`.github/workflows/verificar.yml` corre `herramientas/verificar-todo.js` en
cada PR contra `main` que no sea borrador: un trabajo sin navegador y, si pasa,
cuatro tandas en paralelo con navegador (en la máquina propia, una sola de a
cuatro; ninguna si el PR solo cambia `docs/` o un `.md` de la raíz). No corre al entrar a `main` (el PR ya
lo probó junto con `main`); el porqué y lo que costaba, en la cabecera del flujo. Antes los más de setenta verificadores corrían solo si alguien se
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
- Con la variable del repositorio `RUNNER` = `self-hosted`, «Verificar» y
  «Dependencias» corren en la máquina propia del dueño, sin cobrar minutos;
  sin ella, en las de GitHub (ver «El CI en una máquina propia»).
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
  por fila (`verificar-rls-auth-uid.js` lo revisa en cada migración nueva, y
  `verificar-rls-conjunto.js` que una tabla que crece no pregunte por fila).
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
- **Todo documento que sale del sitio lleva la marca de agua de Ajedrez
  Integral**, de una sola copia: `herramientas/lib/marca-agua.js` en los
  generadores y `js/marca-agua.js` en las páginas; nunca el logo con el
  nombre de Oscar (ver «La marca de agua de Ajedrez Integral en todos los
  documentos»).
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
- **Todo archivo de código lleva al final el sello escondido** (`herramientas/lib/sello.js`):
  un archivo nuevo o uno que su generador volvió a escribir sale sin él, y se
  pone con `node herramientas/sello-estampar.js`. Un generador que compara lo
  que arma con su archivo lo pone con `estampar()`. No se borra ni se anuncia
  en ninguna página (ver «El sello escondido en cada archivo»).
- El worker publica **todo el directorio**: lo que no deba verse va en
  `.assetsignore` (ahí están `CLAUDE.md`, `docs/`, `supabase/`, `herramientas/`…).
- **El worker solo corre donde lo nombra `run_worker_first`** (`wrangler.jsonc`):
  el resto lo sirve Cloudflare directo, sin pasar por `worker.js`. Hoy son
  `cursos/protegido/`, `cursos/recursos/` y `material/`, que exigen una cuenta
  con el acceso vigente (ver «El candado de los cursos está en el servidor»),
  `/t/` y `/o/`, las tarjetas de un torneo y de un organizador de Pareo
  Integral para compartir, `/calendario/`, el calendario de torneos para
  suscribirse, e `/incrustar/`, la clasificación para la página de un club, y el
  código de las herramientas con licencia que no tienen nada público
  (`CODIGO_CON_LICENCIA` en `worker.js`: solo con la licencia; ver «El código de
  las herramientas con licencia, solo con la licencia»). Un candado
  o una ruta nueva en el worker sin su línea ahí no existe.
- Cada migración aplicada y cada Edge Function desplegada se guardan en
  `supabase/` tal cual se aplicaron (los comentarios van ANTES de aplicar:
  después el archivo no se toca; ver «El 21/10, otra vez: comentarios
  agregados después de aplicar»), se vuelve a armar el retrato del esquema
  (`herramientas/inventario-esquema.sql` → `supabase/esquema/inventario-academia.txt`,
  con su `# al-dia-con:`) y se corre
  `node herramientas/verificar-punto-restauracion.js`. Las funciones se arman
  con `node herramientas/funciones-armar.js` (copia `_compartido/`) y **se
  despliegan solas al entrar a `main`** (`.github/workflows/funciones.yml`, con
  el `verify_jwt` de `funciones-desplegadas.txt`): no se despliegan a mano. Ver
  `RESTAURAR.md`.
- Los alumnos sin correo entran con un usuario de
  `alumno.ajedrez-integral.com`, un dominio **sin MX a propósito**: a esa
  dirección nunca se le manda correo; se le escribe a
  `correo_de_contacto()`.

**Verificadores**
- Al tocar algo, correr su verificador (`docs/decisiones/INDICE.md` y el
  archivo de su tema dicen cuáles) y
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

Una línea por tema. **El detalle —qué cubre cada archivo, página por página, y
sus verificadores principales— está en
[`docs/decisiones/INDICE.md`](docs/decisiones/INDICE.md)**: se lee cuando hace
falta, no en cada conversación (ahí va también lo nuevo que se agregue). Para
encontrar algo puntual: `grep -rn "palabra" docs/decisiones/`. Los
verificadores se corren con `node herramientas/verificar-todo.js <nombre> …`
(el nombre sin `verificar-` ni extensión), y el archivo de cada tema dice cuál
corresponde a cada pieza.

| Tema | De qué trata |
|---|---|
| [`sitio-e-infraestructura`](docs/decisiones/sitio-e-infraestructura.md) | El sitio en sí: dominio, PWA, CSS, librerías, carga, encabezado y migas, avisos, Sentry, horas de Costa Rica, marca de agua, sello escondido, CI y la máquina propia, punto de restauración, Realtime |
| [`permisos-y-roles`](docs/decisiones/permisos-y-roles.md) | Quién ve qué: profesores, coordinación, supervisión, «Ver como», academias, dos pasos, auditoría, foto de perfil, borrar cuentas, cuentas de árbitro |
| [`cuentas-y-formularios`](docs/decisiones/cuentas-y-formularios.md) | Formularios e inscripciones, alta de cuentas, alumno sin correo, bienvenida, encuestas, la ficha de los JDN y la inscripción del Metropolitano 2026 |
| [`clase-en-vivo`](docs/decisiones/clase-en-vivo.md) | `sesion.html`: la clase en vivo, sus herramientas, preguntas, prácticas, presentaciones, invitados, proyector, Formación Ajedrez |
| [`seguimiento-del-alumno`](docs/decisiones/seguimiento-del-alumno.md) | Tareas, planes de clase, sesiones intensivas, bitácora, «Mi cuaderno», exámenes, justificaciones |
| [`informes`](docs/decisiones/informes.md) | `informes.html`, informes a la casa, Elo oficial, reportes, el informe del CCDR y las grabaciones de Meet |
| [`cobros-acceso-y-tienda`](docs/decisiones/cobros-acceso-y-tienda.md) | Cobros y recibos, accesos y paquetes, prueba gratis, cuentas de invitado y temporales, tienda |
| [`cursos-y-material`](docs/decisiones/cursos-y-material.md) | Cursos y su candado, certificados, libros y cuentos, Programas de Estudio, material de clase, «Archivos» de administración |
| [`entrenamiento`](docs/decisiones/entrenamiento.md) | Entrenamiento y sus juegos, diagnóstico de nivel, prueba de estilo, repertorio y estudios, fichas, Habilidades, logros |
| [`puntos-y-premios`](docs/decisiones/puntos-y-premios.md) | Puntos Ajedrez, tienda de puntos, retos, bromas y regalos, robo de puntos |
| [`juegos-y-torneos`](docs/decisiones/juegos-y-torneos.md) | Juegos en línea y torneos, sala de arena, Centroamericano, Pareo Integral, Notara, herramientas de arbitraje y sus licencias, JDE, árbitros de Costa Rica |
| [`paneles`](docs/decisiones/paneles.md) | Panel de la Academia, `admin.html`, coordinación, supervisión, calendario, proyectos, panel de taller, gafetes |
| [`tableros-y-apariencia`](docs/decisiones/tableros-y-apariencia.md) | Tableros, coordenadas, colores y piezas, temas de la plataforma, coronación |
| [`accesibilidad`](docs/decisiones/accesibilidad.md) | Teclado y lector de pantalla, cuadro de comandos, Modo Adaptado, voz, la visión de cada cuenta |
| [`legal`](docs/decisiones/legal.md) | Privacidad, términos y consentimiento |
| [`idioma`](docs/decisiones/idioma.md) | Tuteo, vocabulario y `verificar-voseo.py` |
